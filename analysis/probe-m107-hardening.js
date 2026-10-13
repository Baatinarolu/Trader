'use strict';
/** M107 hardening probe: immutability, retention without re-attachment, cross-owner
 * isolation, corrupt-row refusal, the compare-and-swap race and the input cap. */
const H = require('./m107-test-support'), { ok, start, finish, D } = H;
const DAY = '2026-10-13';
const insert = (userId, accountKey, over = {}) => {
  const r = { day: DAY, version: 1, template_id: 'follow_plan', text: 'Today I follow my plan', framing: 'process_template', cues_json: '{}', source: 'human_declared', recorded_at: '2026-10-13T09:00:00.000Z', schema_version: 'intention-v1', ...over };
  return D.db.prepare('INSERT INTO daily_intentions(user_id,account_id,account_key,day,version,template_id,text,framing,cues_json,source,recorded_at,historical_json,schema_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(userId, r.account_id === undefined ? accountKey : r.account_id, accountKey, r.day, r.version, r.template_id, r.text, r.framing, r.cues_json, r.source, r.recorded_at, r.historical_json || null, r.schema_version);
};

finish('M107 intention hardening: immutability, retention, isolation, CAS', async () => {
  const { user: u, other, req, otherToken } = await start('intention-hardening');
  const view = (acct = u.accountId, q = '') => req('/intention?account_id=' + acct + q, undefined, 'GET');
  const save = async (body, acct = u.accountId) => { const v = (await view(acct)).data; return req('/intention?account_id=' + acct, { ...body, revision: v.revision }, 'PUT'); };
  const count = async (t) => Number((await D.db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_id=?`).get(u.userId)).n);

  let r = await save({ template: 'follow_plan' });
  ok('a first record is version 1 on the server day', r.status === 200 && r.data.version === 1 && r.data.history.length === 1, r.data.version);
  const rows = await D.db.prepare('SELECT * FROM daily_intentions WHERE user_id=?').all(u.userId);
  let threw = null; try { await D.db.prepare('UPDATE daily_intentions SET text=? WHERE id=?').run('Today I will make $5,000', rows[0].id); } catch (e) { threw = e.message; }
  ok('a recorded intention cannot be edited in place', /immutable/i.test(threw || ''), threw);
  threw = null; try { await D.db.prepare('UPDATE daily_intentions SET day=? WHERE id=?').run('2026-10-12', rows[0].id); } catch (e) { threw = e.message; }
  ok('a recorded intention cannot be re-dated to another day', /immutable/i.test(threw || ''), threw);
  threw = null; try { await D.db.prepare('INSERT INTO daily_intentions(user_id,account_id,account_key,day,version,template_id,text,framing,cues_json,source,recorded_at,schema_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(u.userId, u.accountId, u.accountId, DAY, 1, 'no_revenge', 'Today I will not revenge trade', 'process_template', '{}', 'human_declared', '2026-10-13T10:00:00.000Z', 'intention-v1'); } catch (e) { threw = e.message; }
  ok('two revisions of one day cannot share a version number', /UNIQUE|constraint/i.test(threw || ''), threw);

  const trades = await count('trades'), journal = await count('journal_entries'), signals = await count('bot_signals');
  r = await save({ intention: 'Today I will wait for the retest' });
  ok('a second record for the day is version 2 and keeps both rows', r.status === 200 && r.data.version === 2 && r.data.history.length === 2, r.data.version);
  ok('recording an intention writes nothing else: no trade, journal entry or signal', (await count('trades')) === trades && (await count('journal_entries')) === journal && (await count('bot_signals')) === signals);

  const revision = r.data.revision;
  const [a, b] = await Promise.all([save({ template: 'no_revenge' }), save({ template: 'a_plus_only' })]);
  const statuses = [a.status, b.status].sort();
  ok('two writers holding one revision produce exactly one record and one refusal', statuses[0] === 200 && statuses[1] === 409, statuses);
  r = await view();
  ok('the day now has exactly three revisions with the winner newest', r.data.history.length === 3 && r.data.version === 3, r.data.history.length);
  const winner = r.data.template;
  ok('the refused writer changed nothing', ['no_revenge', 'a_plus_only'].includes(winner) && winner === r.data.template, winner);

  r = await req('/intention?account_id=' + u.accountId, { template: 'follow_plan', revision }, 'PUT');
  ok('a stale revision after a refresh is 409, not silently appended', r.status === 409, r.status);

  for (const [label, body] of [['caller score', { template: 'follow_plan', revision: revision, score: 95 }], ['caller source', { template: 'follow_plan', revision: revision, source: 'imported_unverified' }], ['caller owner', { template: 'follow_plan', revision: revision, user_id: other.userId }], ['caller receipt', { template: 'follow_plan', revision: revision, recorded_at: '2026-10-01T00:00:00.000Z' }]]) {
    r = await req('/intention?account_id=' + u.accountId, body, 'PUT');
    ok('the write contract refuses ' + label, r.status === 400 && r.data.code === 'intention_invalid', r.data.code);
  }
  r = await req('/intention?account_id=' + u.accountId, { intention: 'x'.repeat(120), revision: (await view()).data.revision }, 'PUT');
  ok('a 120-character single sentence is accepted', r.status === 200 && r.data.text.length === 120, r.status);
  r = await req('/intention?account_id=' + u.accountId, { intention: 'x'.repeat(121), revision: (await view()).data.revision }, 'PUT');
  ok('121 characters is refused rather than clipped', r.status === 400 && r.data.code === 'intention_invalid' && /120 characters/.test(r.data.error), r.data.error);
  r = await req('/intention?account_id=' + u.accountId, { intention: 'line one\nline two', revision: (await view()).data.revision }, 'PUT');
  ok('a multi-line intention is refused rather than folded into one sentence', r.status === 400 && r.data.code === 'intention_invalid', r.data.code);

  await insert(other.userId, u.accountId, { version: 50, template_id: null, framing: 'unverified_free_text', text: 'Other trader’s words' });
  r = await view();
  ok('another owner’s row is never shown for this account', !(r.data.history || []).some((x) => x.text === 'Other trader’s words') && r.data.text !== 'Other trader’s words', r.data.history.map((x) => x.text));
  const theirHistory = await req('/intention/history', undefined, 'GET', otherToken);
  ok('another owner sees only their own rows, never this account’s day', (theirHistory.data.records || []).length === 1 && theirHistory.data.records[0].text === 'Other trader’s words', (theirHistory.data.records || []).length);

  for (const [label, over] of [['a foreign schema version', { version: 60, schema_version: 'intention-v0' }], ['an unreadable text value', { version: 61, text: '   ' }], ['a template whose text was tampered with', { version: 62, text: 'Today I will make $5,000' }], ['an unknown framing', { version: 63, framing: 'vibes' }], ['a receipt from the future', { version: 64, recorded_at: '2026-12-01T00:00:00.000Z' }]]) {
    await insert(u.userId, u.accountId, over);
    const v = await view();
    ok('a row with ' + label + ' is unavailable, not an invented intention', v.data.state === 'unavailable' && v.data.text === null, v.data.state);
    const hist = await req('/intention/history?account_id=' + u.accountId, undefined, 'GET');
    ok('the same row is reported unavailable in the readonly history', (hist.data.records || []).some((x) => x.state === 'unavailable'));
    await D.db.prepare('DELETE FROM daily_intentions WHERE user_id=? AND version=?').run(u.userId, over.version);
  }
  r = await view();
  ok('removing the corrupt rows restores the honest newest record', r.data.state === 'recorded' && r.data.text.length === 120, r.data.state);

  await insert(u.userId, u.accountId, { version: 70, source: 'imported_unverified', recorded_at: '2026-10-13T09:30:00.000Z', text: 'Imported words', template_id: null, framing: 'unverified_free_text' });
  r = await view();
  ok('an imported archive never becomes the account’s recorded intention', r.data.state === 'recorded' && r.data.text.length === 120 && r.data.imported_archives === 1, r.data.text.length);
  const hist = await req('/intention/history?account_id=' + u.accountId, undefined, 'GET');
  ok('the imported archive is visible as such in the readonly history', (hist.data.records || []).some((x) => x.source === 'imported_unverified' && x.day === DAY));

  for (let i = 0; i < 20; i++) await insert(u.userId, u.accountId, { version: 80 + i, template_id: 'a_plus_only', text: 'Today I will take only A+ setups', recorded_at: `2026-10-13T09:${String(40 + i).padStart(2, '0')}:00.000Z` });
  r = await view();
  ok('a long day keeps every revision and reports the newest', r.data.history.length === 25 && r.data.version === 99, { history: r.data.history.length, version: r.data.version });
  ok('the newest revision is the day’s answer even at 20+ records', r.data.text === 'Today I will take only A+ setups', r.data.text);

  await D.db.prepare('DELETE FROM accounts WHERE id=?').run(u.accountId);
  const orphan = await D.db.prepare('SELECT * FROM daily_intentions WHERE user_id=? AND day=? ORDER BY version DESC LIMIT 1').get(u.userId, DAY);
  ok('deleting the account detaches the rows instead of destroying the record', orphan && orphan.account_id === null && orphan.account_key === u.accountId && orphan.text === 'Today I will take only A+ setups', orphan && [orphan.account_id, orphan.account_key]);
  const all = await req('/intention/history', undefined, 'GET');
  ok('the owner keeps a readonly own history of the detached rows', (all.data.records || []).some((x) => x.account_id === null && x.text === 'Today I will take only A+ setups'), (all.data.records || []).length);
  const orphanView = await view();
  ok('a detached account can no longer be read as a live account, and nothing is re-attached', orphanView.status === 404, orphanView.status);
});
