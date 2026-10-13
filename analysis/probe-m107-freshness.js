'use strict';
/** M107 freshness probe: an intention belongs to ONE UTC day. It is never carried over,
 * never back-written, and a day that has not happened is refused rather than faked. */
const H = require('./m107-test-support'), { ok, start, finish, D } = H;
const DAY1 = Date.UTC(2026, 9, 13, 23, 30), DAY2 = Date.UTC(2026, 9, 14, 0, 20);

finish('M107 same-day intention boundary and rollover', async () => {
  const { user: u, req } = await start('intention-freshness');
  const view = (q = '') => req('/intention?account_id=' + u.accountId + q, undefined, 'GET');
  const save = async (body) => { const v = await view(); return req('/intention?account_id=' + u.accountId, { ...body, revision: v.data.revision }, 'PUT'); };

  H.setNow(DAY1);
  let r = await view();
  ok('the day is the server’s UTC day of the receipt', r.data.day === '2026-10-13' && r.data.same_day === true, r.data.day);
  r = await save({ template: 'no_revenge' });
  ok('a late-evening intention is recorded for that day', r.status === 200 && r.data.state === 'recorded' && r.data.receipt.startsWith('2026-10-13T23:30'), r.data.receipt);
  const dayOneRevision = r.data.revision;

  H.setNow(DAY2);
  r = await view();
  ok('the next UTC day starts with no intention, not yesterday’s', r.data.day === '2026-10-14' && r.data.state === 'unrecorded' && r.data.text === null && r.data.same_day === true, r.data.state);
  ok('yesterday’s words are reported as history only, never as today’s', r.data.last_recorded?.day === '2026-10-13' && r.data.last_recorded.text === 'Today I will not revenge trade', r.data.last_recorded);
  ok('the show-history pointer grants nothing and carries no permission field', r.data.authority === 'none' && !('allowed' in r.data) && r.data.last_recorded.authority === 'none');

  r = await req('/intention?account_id=' + u.accountId, { template: 'no_revenge', revision: dayOneRevision }, 'PUT');
  ok('choosing the same words on the new day is a new day-scoped record, not a carry-over', r.status === 200 && r.data.day === '2026-10-14' && r.data.version === 1 && r.data.history.length === 1, { day: r.data.day, version: r.data.version });
  ok('the new day’s record keeps its own later receipt', r.data.receipt.startsWith('2026-10-14T00:20'), r.data.receipt);

  r = await view('&date=2026-10-13');
  ok('the earlier day still reads exactly what was recorded then, readonly', r.data.state === 'recorded' && r.data.same_day === false && r.data.receipt.startsWith('2026-10-13T23:30') && r.data.text === 'Today I will not revenge trade', r.data.receipt);
  r = await view('&date=2026-10-12');
  ok('a day with no record stays genuinely unrecorded', r.data.state === 'unrecorded' && r.data.text === null && r.data.last_recorded === null, r.data.state);
  r = await view('&date=2026-10-15');
  ok('a day that has not happened is refused, never rendered as blank history', r.status === 400 && r.data.code === 'intention_invalid' && /future UTC day/.test(r.data.error), r.data);
  r = await view('&date=2026-13-40');
  ok('a malformed day is refused', r.status === 400 && r.data.code === 'intention_invalid', r.data);
  r = await view('&date=2026-10-14T00:00:00Z');
  ok('a timestamp is not accepted where a day belongs', r.status === 400 && r.data.code === 'intention_invalid', r.data);

  const rows = await D.db.prepare('SELECT * FROM daily_intentions WHERE user_id=? ORDER BY id').all(u.userId);
  ok('every recorded row is pinned to a real UTC day with its own version series', rows.length === 2 && rows[0].day === '2026-10-13' && rows[0].version === 1 && rows[1].day === '2026-10-14' && rows[1].version === 1, rows.map((x) => [x.day, x.version]));
  ok('the human rows are never given a receipt outside their own day', rows.every((x) => x.recorded_at.slice(0, 10) === x.day), rows.map((x) => x.recorded_at));

  await D.db.prepare('INSERT INTO daily_intentions(user_id,account_id,account_key,day,version,template_id,text,framing,cues_json,source,recorded_at,schema_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(u.userId, u.accountId, u.accountId, '2026-10-14', 99, 'follow_plan', 'Today I follow my plan', 'process_template', '{}', 'human_declared', '2026-10-15T00:00:00.000Z', 'intention-v1');
  r = await view();
  ok('a corrupt/future receipt marks the day unavailable rather than claiming a record', r.data.state === 'unavailable' && r.data.text === null, r.data.state);
  await D.db.prepare('DELETE FROM daily_intentions WHERE user_id=? AND version=99').run(u.userId);
  r = await view();
  ok('removing the corrupt row restores the honest record of that day', r.data.state === 'recorded' && r.data.template === 'no_revenge' && r.data.version === 1, r.data.state);
  ok('read-only views never wrote another revision', (await D.db.prepare('SELECT COUNT(*) n FROM daily_intentions WHERE user_id=?').get(u.userId)).n === 2);

  await D.db.prepare('DELETE FROM daily_intentions WHERE user_id=?').run(u.userId);
  H.setNow(DAY1 + 60000);
  r = await view();
  ok('with no rows at all the day is unrecorded, not failed or unavailable', r.data.state === 'unrecorded' && r.data.text === null && r.data.last_recorded === null);
});
