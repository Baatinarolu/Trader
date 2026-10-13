'use strict';
/** M107 portable probe: backup/restore of the recorded days across owners. Restored rows
 * are archives of someone's words — they can never become the receiving trader's own
 * intention for a day, and a bad optional history warns while the finance import stays legal. */
const H = require('./m107-test-support'), { ok, start, finish, D } = H;
const DAY1 = Date.UTC(2026, 9, 12, 12), DAY2 = Date.UTC(2026, 9, 13, 12);

finish('M107 intention portability without a borrowed commitment', async () => {
  const { user: u, other, req, otherToken } = await start('intention-portable');

  H.setNow(DAY1);
  let v = (await req('/intention?account_id=' + u.accountId, undefined, 'GET')).data;
  await req('/intention?account_id=' + u.accountId, { template: 'journal_every_trade', revision: v.revision }, 'PUT');
  H.setNow(DAY2);
  v = (await req('/intention?account_id=' + u.accountId, undefined, 'GET')).data;
  await req('/intention?account_id=' + u.accountId, { intention: 'Today I will wait for the retest', revision: v.revision }, 'PUT');
  const backup = (await req('/export/json', undefined, 'GET')).data.daily_intentions;
  ok('the backup carries every recorded day with its framing, cues and receipt', backup.version === 1 && backup.records.length === 2 && backup.records.every((x) => x.day && x.text && x.framing && x.recorded_at && x.broker_verified === false && x.authority === 'none'), backup.records.map((x) => [x.day, x.framing]));
  ok('the backup does not pretend the days were followed or scored', !JSON.stringify(backup).match(/followed|score|percent/i), Object.keys(backup.records[0]));

  let r = await req('/import/json', { trades: [], daily_intentions: backup }, 'POST', otherToken);
  ok('restoring into another owner keeps the finance side legal and returns intention warnings', r.status === 200 && Array.isArray(r.data.intention_warnings), r.data.intention_warnings);
  let dest = (await req('/intention?account_id=' + other.accountId, undefined, 'GET', otherToken)).data;
  ok('restored words never become the receiving account’s intention for today', dest.state === 'unrecorded' && dest.text === null && dest.imported_archives === 2, { state: dest.state, archives: dest.imported_archives });
  ok('the archive count is disclosed without any permission field', dest.authority === 'none' && !('allowed' in dest));
  const destHistory = (await req('/intention/history?account_id=' + other.accountId, undefined, 'GET', otherToken)).data.records;
  ok('every restored row is labelled imported_unverified and owned by the receiving account', destHistory.length === 2 && destHistory.every((x) => x.source === 'imported_unverified' && x.account_key === other.accountId && x.account_id === other.accountId), destHistory.map((x) => [x.source, x.account_key]));
  ok('the original days and receipts survive as history, not as borrowed evidence', destHistory.map((x) => x.day).join(',') === '2026-10-12,2026-10-13' && destHistory.every((x, i) => x.historical.recorded_at === backup.records[i].recorded_at && x.historical.day === backup.records[i].day && x.historical.source === 'human_declared'), destHistory.map((x) => x.historical.recorded_at));
  ok('an imported archive carries no template authority either', destHistory.every((x) => x.warnings.some((w) => w.startsWith('imported_unverified'))));

  const source = (await req('/intention?account_id=' + u.accountId, undefined, 'GET')).data;
  ok('the source account keeps its own two recorded days untouched by the restore', source.state === 'recorded' && source.text === 'Today I will wait for the retest' && source.imported_archives === 0, source.text);

  r = await req('/intention?account_id=' + other.accountId, { template: 'no_revenge', revision: dest.revision }, 'PUT', otherToken);
  ok('the receiving trader’s own record for the day is the only thing that fills it', r.status === 200 && r.data.state === 'recorded' && r.data.template === 'no_revenge' && r.data.imported_archives === 2, r.data.state);
  ok('the imported archives stay archives beside the trader’s own words', (await req('/intention/history?account_id=' + other.accountId, undefined, 'GET', otherToken)).data.records.length === 3);

  const malformed = [
    ['a boolean instead of a versioned object', false, /version 1/],
    ['an unknown version', { version: 2, records: [] }, /version 1/],
    ['records that are not a list', { version: 1, records: 'nope' }, /version 1/],
    ['a record with no words', { version: 1, records: [{ day: '2026-10-13', intention: '', framing: 'unverified_free_text' }] }, /single-line intention/],
    ['a record with no day', { version: 1, records: [{ intention: 'Today I will journal every trade', framing: 'unverified_free_text' }] }, /day unknown/],
    ['a record with a future receipt', { version: 1, records: [{ day: '2026-10-13', intention: 'Today I follow my plan', framing: 'unverified_free_text', recorded_at: '2027-01-01T00:00:00.000Z' }] }, /future original intention receipt/],
    ['a record with an invalid day', { version: 1, records: [{ day: '13/10/2026', intention: 'Today I follow my plan', framing: 'unverified_free_text', recorded_at: '2026-10-13T09:00:00.000Z' }] }, /day unknown/],
    ['more than the portable cap', { version: 1, records: Array.from({ length: 501 }, (_, i) => ({ day: '2026-10-13', intention: 'Today I follow my plan', framing: 'unverified_free_text', recorded_at: '2026-10-13T09:00:00.000Z', version: i + 1 })) }, /at most 500 records/],
  ];
  for (const [label, payload, pattern] of malformed) {
    r = await req('/import/json', { trades: [], daily_intentions: payload }, 'POST', otherToken);
    ok('a received ' + label + ' warns instead of breaking the finance import', r.status === 200 && r.data.intention_warnings.length >= 1 && pattern.test(r.data.intention_warnings.join(' ')) && r.data.ok === true, r.data.intention_warnings);
  }
  const afterMalformed = (await req('/intention?account_id=' + other.accountId, undefined, 'GET', otherToken)).data;
  ok('the malformed restores never displace the receiving trader’s own recorded day', afterMalformed.state === 'recorded' && afterMalformed.template === 'no_revenge' && afterMalformed.imported_archives >= 2, { state: afterMalformed.state, archives: afterMalformed.imported_archives });
  const unknownDay = await D.db.prepare("SELECT COUNT(*) n FROM daily_intentions WHERE user_id=? AND source='imported_unverified' AND day=''").get(other.userId);
  ok('a record whose original day is unknown is kept without claiming a day', Number(unknownDay.n) >= 1, unknownDay);
  r = await req('/import/json', { trades: [] }, 'POST', otherToken);
  ok('a backup with no intention history at all is not an error or a warning', r.status === 200 && r.data.intention_warnings.length === 0, r.data.intention_warnings);
  r = await req('/import/json', { trades: [], daily_intentions: { version: 1, records: [], unavailable: true } }, 'POST', otherToken);
  ok('a missing/omitted original history is reported as unavailable, not as days that never happened', r.status === 200 && /unavailable/i.test(r.data.intention_warnings.join(' ')), r.data.intention_warnings);

  H.setNow(DAY2);
  const rows = await D.db.prepare('SELECT source,day,version FROM daily_intentions WHERE user_id=? ORDER BY id').all(other.userId);
  ok('every restored row is stored as an archive and the trader’s own row as human-declared', rows.filter((x) => x.source === 'imported_unverified').length >= 2 && rows.filter((x) => x.source === 'human_declared').length === 1 && rows.filter((x) => x.source === 'human_declared')[0].day === '2026-10-13', rows);
  const mine = await D.db.prepare('SELECT source,day,version FROM daily_intentions WHERE user_id=? ORDER BY id').all(u.userId);
  ok('the source account has exactly its own two human rows', mine.length === 2 && mine.every((x) => x.source === 'human_declared'), mine);
});
