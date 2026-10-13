'use strict';
/** M106 freshness probe: the APP window is the only thing that turns a stored yes into
 * permission, and nothing about it can be inherited from yesterday, from a stale
 * receipt or from a future/corrupt clock. Real HTTP/auth/SQL, fixed UTC. */
const H = require('./m106-test-support'), { ok, start, finish, D } = H;
const YES = { calm: true, clear: true, following_plan: true, would_take_if_up_big: true };
const T0 = () => Date.UTC(2026, 9, 13, 12, 0, 0);

finish('M106 four-question freshness window and receipt canonicality', async () => {
  const { user: u, req } = await start('state-gate-freshness');
  await H.prepare(u, 20);
  const gate = async () => (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data;
  const answer = async () => {
    const next = ((await D.db.prepare('SELECT MAX(version) v FROM state_gate_answers WHERE account_id=?').get(u.accountId)).v || 0) + 1;
    await D.db.prepare('INSERT INTO state_gate_answers(user_id,account_id,account_key,version,answers_json,source,recorded_at,schema_version) SELECT user_id,id,id,?,?,?,?,? FROM accounts WHERE id=?')
      .run(next, JSON.stringify(YES), 'human_declared', new Date(H.now()).toISOString(), 'state-gate-v1', u.accountId);
    return next;
  };
  const entry = (p = {}) => ({ account_id: u.accountId, symbol: 'DECLARED_STOCK', direction: 'long', status: 'open', exit: null, opened_at: '2026-10-13T11:00:00.000Z', entry: 100, stop: 99, target: 102, size: 100, fees: 0, setup_grade: 'B', adherence: 5, emotion_before: 'Calm and following the plan', ...p });
  const count = async () => Number((await D.db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id=?').get(u.userId)).n);

  let v = await gate();
  ok('a brand-new account is not_adopted with no receipt at all, so nothing is implied about the trader', v.state === 'not_adopted' && v.receipt === null && v.age_minutes === null, v);
  ok('the published shape names the questions, window and basis even before any answer', v.questions.length === 4 && v.window_minutes === 60 && /not verified calmness/.test(v.basis));

  await answer();
  v = await gate();
  ok('an answer recorded now is a pass at age 0 with an expiry one window ahead', v.state === 'passed' && v.age_minutes === 0 && v.expires_at === new Date(T0() + 3600000).toISOString(), { state: v.state, age: v.age_minutes, exp: v.expires_at });
  ok('a fresh pass admits a live entry', (await req('/trades', entry(), 'POST')).status === 200);

  H.setNow(T0() + 59 * 60000);
  v = await gate();
  ok('inside the window the same answers still stand', v.state === 'passed' && v.age_minutes === 59, v);
  ok('inside the window the live entry is admitted', (await req('/trades', entry(), 'POST')).status === 200);

  H.setNow(T0() + 61 * 60000);
  v = await gate();
  ok('one minute past the window the answers are stale, not permission', v.state === 'stale' && v.age_minutes === 61 && v.allowed === false, { state: v.state, age: v.age_minutes });
  const past = await req('/trades', entry(), 'POST');
  ok('past the window a live entry is refused as unanswered with nothing written', past.status === 409 && past.data.code === 'state_gate_unanswered', past.status);
  ok('the stale refusal states the age instead of pretending the trader failed a question', /61 minutes old/.test(past.data.error) && /cannot stand in for a fresh in-session check/.test(past.data.error), past.data.error);
  const before = await count();
  ok('no trade row was created by the refused entry', before === 2, before);

  const refreshed = await req('/state-gate?account_id=' + u.accountId, undefined, 'GET');
  const again = await req('/state-gate?account_id=' + u.accountId, { answers: YES, revision: refreshed.data.revision }, 'PUT');
  ok('answering fresh after a stale window is allowed and supersedes nothing already recorded', again.status === 200 && again.data.state === 'passed' && again.data.version === 2, again.data.state);
  ok('the refreshed in-session answer re-admits the live entry', (await req('/trades', entry(), 'POST')).status === 200 && await count() === before + 1);

  H.setNow(Date.UTC(2026, 9, 13, 23, 30));
  await answer();
  v = await gate();
  ok('a late-evening answer is a pass while it is still inside the window', v.state === 'passed' && v.age_minutes === 0 && v.version === 3, v.state);
  H.setNow(Date.UTC(2026, 9, 14, 0, 20));
  v = await gate();
  ok('crossing UTC midnight expires it 50 minutes later even though the window has not closed', v.state === 'stale' && v.age_minutes === 50 && v.allowed === false, { state: v.state, age: v.age_minutes });
  const nextDay = await req('/trades', entry(), 'POST');
  ok('a live entry on the next UTC day is refused until the trader answers again', nextDay.status === 409 && nextDay.data.state_gate?.state === 'stale', nextDay.status);

  await D.db.prepare('INSERT INTO state_gate_answers(user_id,account_id,account_key,version,answers_json,source,recorded_at,schema_version) SELECT user_id,id,id,99,?,?,?,? FROM accounts WHERE id=?')
    .run(JSON.stringify(YES), 'human_declared', new Date(H.now() + 5 * 60000).toISOString(), 'state-gate-v1', u.accountId);
  v = await gate();
  ok('a future/corrupt receipt is unavailable and cannot be a pass', v.state === 'unavailable' && v.allowed === false, v.state);
  const futureEntry = await req('/trades', entry(), 'POST');
  ok('a future receipt refuses the live entry instead of granting it', futureEntry.status === 409 && futureEntry.data.code === 'state_gate_unanswered', futureEntry.status);
  await D.db.prepare('DELETE FROM state_gate_answers WHERE account_id=? AND version=99').run(u.accountId);
  H.setNow(Date.UTC(2026, 9, 13, 23, 35));
  v = await gate();
  ok('after the corrupt row is removed the honest history is the state again, unchanged', v.state === 'passed' && v.version === 3, { state: v.state, version: v.version });

  const hist = await req('/state-gate/history?account_id=' + u.accountId, undefined, 'GET');
  ok('history is a readonly record of what was written, retained across every transition', hist.status === 200 && hist.data.records.length === 3 && hist.data.records.map((x) => x.version).join(',') === '1,2,3' && hist.data.records.every((x) => x.source === 'human_declared' && x.broker_verified === false), hist.data.records.map((x) => x.version));
  const equity = await D.db.prepare('SELECT current_balance FROM accounts WHERE id=?').get(u.accountId);
  ok('the fresh window never touches finance: equity is unchanged by every refusal above', equity.current_balance === 10000, equity);

  const reopened = await gate();
  ok('reading the gate never writes a row', Number((await D.db.prepare('SELECT COUNT(*) n FROM state_gate_answers WHERE account_id=?').get(u.accountId)).n) === 3 && !!reopened.revision);
  ok('the revision changes with the stored rows, so a stale display cannot write', reopened.revision !== hist.data.records[0] && /^[a-f0-9]{64}$/.test(reopened.revision));
});
