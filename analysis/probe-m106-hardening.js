'use strict';
/** M106 hardening probe: concurrency, immutability, orphaned/foreign rows, store
 * failure and duplicate-import behaviour. Real HTTP/auth/SQL; faults are injected as
 * real SQL statements on the store, never as stubs of the code under test. */
const H = require('./m106-test-support'), { ok, start, finish, D } = H;
const YES = { calm: true, clear: true, following_plan: true, would_take_if_up_big: true };
const NO = { calm: true, clear: true, following_plan: false, would_take_if_up_big: true };

finish('M106 concurrency/immutability/orphan/store-failure hardening', async () => {
  const { user: u, other, req, otherToken } = await start('state-gate-hardening');
  await H.prepare(u, 20); await H.prepare(other, 20);
  const gate = async (token) => (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET', token)).data;
  const entry = (p = {}) => ({ account_id: u.accountId, symbol: 'DECLARED_STOCK', direction: 'long', status: 'open', exit: null, opened_at: '2026-10-13T11:00:00.000Z', entry: 100, stop: 99, target: 102, size: 100, fees: 0, setup_grade: 'B', adherence: 5, emotion_before: 'Calm and following the plan', ...p });
  const rows = async () => D.db.prepare('SELECT * FROM state_gate_answers WHERE user_id=? AND account_key=? ORDER BY id').all(u.userId, u.accountId);

  let v = await gate();
  const raced = await Promise.all([
    req('/state-gate?account_id=' + u.accountId, { answers: YES, revision: v.revision }, 'PUT'),
    req('/state-gate?account_id=' + u.accountId, { answers: NO, revision: v.revision }, 'PUT'),
  ]);
  const lost = raced.find((r) => r.status === 409);
  ok('two writers holding the same displayed revision produce exactly one record and one 409', raced.filter((r) => r.status === 200).length === 1 && !!lost, raced.map((r) => r.status));
  ok('the 409 tells the trader to reload rather than silently overwriting the other answer', /reload/i.test(lost.data.error || ''), lost.data.error);
  v = await gate();
  ok('only one version exists after the race', v.version === 1 && v.state === 'passed' && (await rows()).length === 1, v.version);

  const trigger = await D.db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='state_gate_answers_immutable'").get();
  ok('the immutability guard is declared BEFORE UPDATE only, so declared account deletion still detaches rows', /BEFORE UPDATE ON state_gate_answers/.test(trigger?.sql || ''), (trigger?.sql || '').slice(0, 80));
  const row = (await rows())[0];
  let immutable = false; try { await D.db.prepare('UPDATE state_gate_answers SET answers_json=? WHERE id=?').run(JSON.stringify(NO), row.id); } catch { immutable = true; }
  const kept = await D.db.prepare('SELECT answers_json a, recorded_at r FROM state_gate_answers WHERE id=?').get(row.id);
  ok('a trader (or a bug) cannot rewrite a recorded answer set or its receipt in place', immutable && kept.a === row.answers_json && kept.r === row.recorded_at, immutable);

  const orphan = await D.db.prepare("INSERT INTO accounts(user_id,name,starting_balance,current_balance,risk_per_trade_pct,max_trades_day) VALUES (?,'Orphan case',10000,10000,.5,20)").run(u.userId);
  const orphanId = orphan.lastInsertRowid;
  await D.db.prepare('INSERT INTO state_gate_answers(user_id,account_id,account_key,version,answers_json,source,recorded_at,schema_version) VALUES(?,?,?,1,?,?,?,?)').run(u.userId, orphanId, orphanId, JSON.stringify(YES), 'human_declared', new Date(H.now()).toISOString(), 'state-gate-v1');
  await D.db.prepare('DELETE FROM accounts WHERE id=?').run(orphanId);
  const detached = await D.db.prepare('SELECT * FROM state_gate_answers WHERE account_key=?').get(orphanId);
  ok('deleting an account detaches its answers (account_id null) and never deletes the record', detached && detached.account_id === null && detached.account_key === orphanId, detached);
  ok('a detached account id is a 404 with no invented answers', (await req('/state-gate?account_id=' + orphanId, undefined, 'GET')).status === 404);
  const orphanRow = ((await req('/state-gate/history', undefined, 'GET')).data.records || []).find((x) => x.account_key === orphanId);
  ok('the retained orphan row is still visible readonly in the owner’s own history', !!orphanRow && orphanRow.source === 'human_declared' && orphanRow.account_id === null, orphanRow);
  const otherHistory = (await req('/state-gate/history', undefined, 'GET', otherToken)).data.records;
  ok('an orphaned row never leaks into another owner’s history or gate', otherHistory.every((x) => x.account_key !== orphanId) && (await req('/state-gate?account_id=' + other.accountId, undefined, 'GET', otherToken)).data.state === 'not_adopted');

  await D.db.prepare('INSERT INTO state_gate_answers(user_id,account_id,account_key,version,answers_json,source,recorded_at,schema_version) VALUES(?,?,?,99,?,?,?,?)')
    .run(u.userId, u.accountId, u.accountId, JSON.stringify(YES), 'human_declared', new Date(H.now()).toISOString(), 'state-gate-v9');
  v = await gate();
  ok('a stored row from an unknown schema version is unavailable, not a pass', v.state === 'unavailable' && v.allowed === false, v.state);
  const corruptEntry = await req('/trades', entry(), 'POST');
  ok('the unavailable gate refuses a live entry and claims no pass', corruptEntry.status === 409 && corruptEntry.data.code === 'state_gate_unanswered', corruptEntry.status);
  await D.db.prepare('DELETE FROM state_gate_answers WHERE user_id=? AND account_key=? AND version=99').run(u.userId, u.accountId);
  v = await gate();
  ok('removing the foreign row restores the honest reading, which was never rewritten', v.state === 'passed' && v.version === 1, v.state);

  await D.db.prepare("CREATE TRIGGER m106_write_outage BEFORE INSERT ON state_gate_answers BEGIN SELECT RAISE(ABORT,'declared state-gate write outage'); END").run();
  const outage = await req('/state-gate?account_id=' + u.accountId, { answers: NO, revision: v.revision }, 'PUT');
  ok('a store failure during a write is a 503 that claims no receipt and no changed state', outage.status === 503 && !/passed/.test(JSON.stringify(outage.data)), outage);
  await D.db.prepare('DROP TRIGGER m106_write_outage').run();
  const afterOutage = await gate();
  ok('the failed write stored nothing and left the previous answers intact', afterOutage.version === 1 && afterOutage.state === 'passed' && (await rows()).length === 1, afterOutage.version);

  await D.db.prepare('ALTER TABLE state_gate_answers RENAME TO state_gate_answers_hidden').run();
  const readOutage = await req('/state-gate?account_id=' + u.accountId, undefined, 'GET');
  ok('an unreadable store is 503 rather than a fabricated not_adopted/pass', readOutage.status === 503, readOutage.status);
  const refusalDuringOutage = await req('/trades', entry(), 'POST');
  ok('while the store is unreadable the app refuses the live entry instead of claiming a clear state', refusalDuringOutage.status === 409 && refusalDuringOutage.data.code === 'state_gate_unanswered', refusalDuringOutage.status);
  await D.db.prepare('ALTER TABLE state_gate_answers_hidden RENAME TO state_gate_answers').run();
  ok('when the store comes back the honest stored answers are the state again', (await gate()).state === 'passed');

  const backup = (await req('/export/json', undefined, 'GET')).data.state_gate_answers;
  const ownedRow = backup.records.find((x) => x.account_key === u.accountId);
  ok('export publishes owned answers with receipts, keeps detached history and claims no verification', backup.version === 1 && backup.unavailable_records === 0 && !!ownedRow && ownedRow.source === 'human_declared' && ownedRow.broker_verified === false && backup.records.some((x) => x.account_key === orphanId && x.account_id === null), backup.records.map((x) => [x.account_key, x.account_id]));
  const imported = await req('/import/json', { trades: [H.body(u, { entry: 100, exit: 101 })], state_gate_answers: backup }, 'POST');
  ok('re-importing an owned backup appends copies instead of rewriting the originals', imported.status === 200 && imported.data.inserted === 1 && Array.isArray(imported.data.state_gate_warnings), imported.data.state_gate_warnings);
  const archives = (await rows()).filter((x) => x.source === 'imported_unverified');
  ok('every imported copy is labelled imported_unverified and keeps the original clock as history', archives.length === backup.records.length && archives.every((x) => x.answers_json === row.answers_json && JSON.parse(x.historical_json).recorded_at === row.recorded_at), archives.map((x) => x.version));
  const stillPassed = await gate();
  ok('imported copies never grant a pass: the state still comes from the trader’s own rows', stillPassed.state === 'passed' && stillPassed.imported_archives === backup.records.length && stillPassed.version === 1, { state: stillPassed.state, archives: stillPassed.imported_archives });

  const before = await gate();
  const answeredNull = await req('/state-gate?account_id=' + u.accountId, { answers: null, revision: before.revision }, 'PUT');
  ok('the trader can record an explicit "not answered now" as the newest row', answeredNull.status === 200 && answeredNull.data.version > 1 && answeredNull.data.version === Math.max(...(await rows()).map((x) => Number(x.version))) && answeredNull.data.state === 'unanswered', { v: answeredNull.data.version, s: answeredNull.data.state });
  const adopted = await gate();
  ok('with archives and an explicit null the account stays adopted and unanswered — never a pass', adopted.state === 'unanswered' && adopted.adopted === true && adopted.allowed === false && adopted.imported_archives === backup.records.length, adopted.state);
  const refused = await req('/trades', entry(), 'POST');
  ok('that adopted-but-unanswered account cannot open a live entry', refused.status === 409 && refused.data.code === 'state_gate_unanswered', refused.status);
  ok('the journal-only path is still legal for the same account, so history is never held hostage', (await req('/trades', entry({ record_only: true }), 'POST')).status === 200);
  const finalRows = await rows();
  ok('the whole run left every recorded row intact and append-only', finalRows.length >= 4 && finalRows[0].answers_json === row.answers_json && finalRows.filter((x) => x.source === 'human_declared').length === 2, finalRows.map((x) => [x.version, x.source]));
});
