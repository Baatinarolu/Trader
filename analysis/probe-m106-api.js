'use strict';
/** M106 API probe: owned persistence, strict CAS, immutability and account scope on a
 * real HTTP server, real auth and the real libSQL store. */
const H = require('./m106-test-support'), { ok, start, finish, D } = H, path = require('path');
const ALL_YES = { calm: true, clear: true, following_plan: true, would_take_if_up_big: true };
const NO = { calm: false, clear: true, following_plan: true, would_take_if_up_big: true };

finish('M106 owned four-question answers over real HTTP/auth/SQL', async () => {
  const { user: u, other, req, otherToken } = await start('state-gate-api');
  let r = await req('/state-gate?account_id=' + u.accountId, undefined, 'GET');
  ok('a fresh account is not_adopted with a revision to write against', r.status === 200 && r.data.state === 'not_adopted' && r.data.allowed === false && /^[a-f0-9]{64}$/.test(r.data.revision), r.data);

  r = await req('/state-gate?account_id=' + u.accountId, { answers: ALL_YES, revision: r.data.revision }, 'PUT');
  ok('recording four honest yes answers is a fresh pass', r.status === 200 && r.data.state === 'passed' && r.data.allowed === true && r.data.version === 1 && r.data.receipt === r.data.recorded_at, r.data);
  ok('the pass carries the APP window and an expiry, not an unbounded permission', r.data.window_minutes === 60 && r.data.expires_at > r.data.recorded_at, { w: r.data.window_minutes, e: r.data.expires_at });
  ok('the recorded answers come back as given, with no sentiment or score added', JSON.stringify(r.data.answers) === JSON.stringify(ALL_YES) && !('score' in r.data) && r.data.broker_verified === false);

  const firstRevision = r.data.revision;
  r = await req('/state-gate?account_id=' + u.accountId, { answers: NO, revision: firstRevision }, 'PUT');
  ok('the revision returned by a write is the one the next write may use', r.status === 200 && r.data.version === 2 && r.data.state === 'failed' && JSON.stringify(r.data.failed_questions) === JSON.stringify(['calm']), r.data.state);
  r = await req('/state-gate?account_id=' + u.accountId, { answers: ALL_YES, revision: firstRevision }, 'PUT');
  ok('a write from a superseded displayed revision is refused 409 and stores nothing', r.status === 409 && r.data.code === 'state_gate_invalid', r.status);
  const after = await req('/state-gate?account_id=' + u.accountId, undefined, 'GET');
  const rows = await D.db.prepare('SELECT * FROM state_gate_answers WHERE user_id=? AND account_key=? ORDER BY id').all(u.userId, u.accountId);
  ok('both versions are retained with server receipts, none deleted or rewritten', rows.length === 2 && rows[0].answers_json !== rows[1].answers_json && rows.every((row) => row.source === 'human_declared' && row.schema_version === 'state-gate-v1'), rows.map((x) => x.version));
  let immutable = false; try { await D.db.prepare('UPDATE state_gate_answers SET answers_json=? WHERE id=?').run(JSON.stringify(NO), rows[0].id); } catch { immutable = true; }
  const kept = await D.db.prepare('SELECT answers_json a FROM state_gate_answers WHERE id=?').get(rows[0].id);
  ok('a stored answer set cannot be rewritten in place', immutable && JSON.parse(kept.a).calm === true, { immutable, kept: kept.a });

  r = await req('/state-gate?account_id=' + u.accountId, { answers: null, revision: after.data.revision }, 'PUT');
  ok('explicit unknown is recorded as version 3 and is not a pass', r.status === 200 && r.data.version === 3 && r.data.state === 'unanswered' && r.data.allowed === false && r.data.adopted === true, r.data.state);
  r = await req('/state-gate?account_id=' + u.accountId, undefined, 'GET');
  ok('an explicit unknown keeps the account adopted, so the gate cannot be un-adopted by erasing an answer', r.data.adopted === true && r.data.state === 'unanswered' && r.data.state !== 'not_adopted', r.data);

  r = await req('/state-gate/history?account_id=' + u.accountId, undefined, 'GET');
  ok('history is readonly own-account, newest last, with receipts', r.status === 200 && r.data.readonly === true && r.data.records.length === 3 && r.data.records.map((x) => x.version).join(',') === '1,2,3', r.data.records?.length);
  r = await req('/state-gate/history', undefined, 'GET');
  ok('history without an account still returns only the owner’s own rows', r.status === 200 && r.data.records.every((x) => x.account_key === u.accountId));

  r = await req('/state-gate?account_id=' + other.accountId, undefined, 'GET');
  ok('another owner’s account id is a 404, not a cross-account read', r.status === 404, r);
  r = await req('/state-gate?account_id=' + u.accountId, undefined, 'GET', otherToken);
  ok('the other session cannot read this account’s gate', r.status === 404, r);
  r = await req('/state-gate?account_id=abc', undefined, 'GET');
  ok('a non-numeric account id is refused', r.status === 404);
  r = await req('/state-gate', undefined, 'GET', null);
  ok('unauthenticated reads are 401', r.status === 401, r.status);

  r = await req('/state-gate?account_id=' + u.accountId, { answers: ALL_YES, revision: 'a'.repeat(64), mood: 'calm' }, 'PUT');
  ok('a write carrying caller authority fields is refused 400 with nothing stored', r.status === 400 && r.data.code === 'state_gate_invalid', r);
  r = await req('/state-gate?account_id=' + u.accountId, { answers: { calm: true, clear: true, following_plan: true }, revision: 'a'.repeat(64) }, 'PUT');
  ok('a partial answer set is refused rather than defaulted', r.status === 400, r.status);
  const count = await D.db.prepare('SELECT COUNT(*) c FROM state_gate_answers WHERE user_id=?').get(u.userId);
  ok('the refused writes stored nothing', Number(count.c) === 3, count.c);

  r = await req('/state-gate?account_id=' + other.accountId, { answers: ALL_YES, revision: (await req('/state-gate?account_id=' + other.accountId, undefined, 'GET', otherToken)).data.revision }, 'PUT', otherToken);
  ok('a second owned account reaches its own pass independently', r.status === 200 && r.data.state === 'passed' && r.data.account_id === other.accountId, r.data);
  const first = await req('/state-gate?account_id=' + u.accountId, undefined, 'GET');
  ok('the first account’s state is untouched by the second account', first.data.state === 'unanswered' && first.data.account_id === u.accountId, first.data.state);

  const briefing = await req('/briefing?account_id=' + u.accountId, undefined, 'GET');
  ok('the briefing carries the gate for the desk, not a claim of readiness', briefing.status === 200 && briefing.data.state_gate?.state === 'unanswered' && briefing.data.state_gate.allowed === false, briefing.data.state_gate);
  const day = await req('/journal/2026-10-13?account_id=' + u.accountId, undefined, 'GET');
  ok('the owned day view carries the same gate object', day.status === 200 && day.data.state_gate?.state === 'unanswered', day.data.state_gate);
  const backup = await req('/export/json', undefined, 'GET');
  ok('the full backup carries the answer history for portability', backup.status === 200 && Array.isArray(backup.data.state_gate_answers?.records) && backup.data.state_gate_answers.records.length === 3 && backup.data.state_gate_answers.records.every((x) => x.broker_verified === false), backup.data.state_gate_answers);
});
