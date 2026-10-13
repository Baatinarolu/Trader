'use strict';
/** M106 entry probe: the app's own prospective-entry surface (new live trade and
 * reopen) against a real HTTP server, real auth, real guardrails and real SQL. */
process.env.TJ_OFFLINE_CANDLES = '1';   // declared synthetic bars for the save-endpoint path only
const H = require('./m106-test-support'), { ok, start, finish, D } = H;
const YES = { calm: true, clear: true, following_plan: true, would_take_if_up_big: true };
const NO = { calm: true, clear: true, following_plan: false, would_take_if_up_big: true };
const open = (u, p = {}) => ({ account_id: u.accountId, symbol: 'DECLARED_STOCK', direction: 'long', status: 'open', exit: null, opened_at: '2026-10-13T11:00:00.000Z', entry: 100, stop: 99, target: 102, size: 100, fees: 0, setup_grade: 'B', adherence: 5, emotion_before: 'Calm and following the plan', ...p });
const count = async (u) => Number((await D.db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id=?').get(u.userId)).n);

finish('M106 prospective entry against an adopted four-question gate', async () => {
  const { user: u, req } = await start('state-gate-entry');
  await H.prepare(u, 20);
  const balance = async () => (await D.db.prepare('SELECT current_balance, starting_balance FROM accounts WHERE id=?').get(u.accountId));

  let r = await req('/trades', open(u), 'POST');
  ok('an account that never answered the gate can still record a live entry — no invented rule', r.status === 200 && r.data.trade?.status === 'open' && r.data.trade?.guardrail_snapshot, r.status);
  const snapshot = JSON.parse(r.data.trade.guardrail_snapshot);
  ok('the admitted entry snapshot says the gate was not adopted, never that it passed', snapshot.state_gate?.state === 'not_adopted' && snapshot.state_gate?.allowed === false, snapshot.state_gate);
  const afterFirst = await count(u);

  r = await req('/trades', open(u, { emotion_before: '' }), 'POST');
  ok('the inherited rule still requires a named entry emotion before the gate is even consulted', r.status === 400 && /emotional state/i.test(r.data.error || ''), r);

  const view = await req('/state-gate?account_id=' + u.accountId, undefined, 'GET');
  r = await req('/state-gate?account_id=' + u.accountId, { answers: NO, revision: view.data.revision }, 'PUT');
  ok('a recorded no fails the gate for this account', r.status === 200 && r.data.state === 'failed', r.data.state);
  const gateRevision = r.data.revision;
  r = await req('/trades', open(u), 'POST');
  ok('a new live entry is refused 409 with the gate code while the gate is failed', r.status === 409 && r.data.code === 'state_gate_failed' && r.data.state_gate?.state === 'failed', r);
  ok('the refusal names the trader’s own no and the way back', /do not trade yet/i.test(r.data.error) && /record_only/.test(r.data.hint || ''));
  ok('nothing financial was written by the refused entry', (await count(u)) === afterFirst);
  ok('the account balance is untouched by the refusal', JSON.stringify(await balance()) === JSON.stringify(await balance()));
  const beforeSignals = await count(u);
  r = await req('/bots/signals/save', { symbol: 'EURUSD', timeframe: '15m', account_id: u.accountId, prediction: false }, 'POST');
  ok('the signal-save endpoint never stores a signal while the gate records a no', r.status === 200 && r.data.saved?.saved === 0 && /State gate/.test(JSON.stringify(r.data)), { status: r.status, saved: r.data.saved });
  ok('the refusal is visible on the endpoint’s own headline/verdict, not hidden', /State gate/.test(JSON.stringify(r.data.headline || {})) && r.data.setups?.action === 'NO TRADE', r.data.setups?.action);
  r = await req('/bots/signals/save-plan', { symbol: 'DECLARED_STOCK', timeframe: '15m', entry: 100, stop: 99, targets: [{ price: 102, rr: 2 }], account_id: u.accountId, grade: 'B', score: 70 }, 'POST');
  ok('the plan-save endpoint refuses through the same gate with its own code', r.status === 409 && String(r.data.code || '').startsWith('state_gate_'), { status: r.status, code: r.data.code });
  ok('neither refused save wrote a signal row or a trade', (await count(u)) === beforeSignals && Number((await D.db.prepare('SELECT COUNT(*) n FROM bot_signals WHERE user_id=?').get(u.userId)).n) === 0);
  r = await req('/trades', open(u, { record_only: true }), 'POST');
  ok('recording an already-executed entry as journal history stays legal at a failed gate', r.status === 200 && r.data.trade?.status === 'open' && r.data.trade?.journal?.state === 'awaiting_close', r.status);
  const afterRecordOnly = await count(u);
  r = await req('/trades', H.body(u, { status: 'closed', exit: 101 }), 'POST');
  ok('recording a closed trade is never gated by an in-session check', r.status === 200 && r.data.trade?.status === 'closed', r.status);

  const openId = (await D.db.prepare("SELECT id FROM trades WHERE user_id=? AND status='open' AND COALESCE(entry_permission,'')!='record_only' ORDER BY id DESC LIMIT 1").get(u.userId) || {}).id;
  r = await req('/trades/' + openId, { ...H.body(u, { status: 'closed', exit: 101 }) }, 'PUT');
  r = await req('/trades/' + openId, open(u), 'PUT');
  ok('reopening a closed trade into a live position is refused while the gate is failed', r.status === 409 && r.data.code === 'state_gate_failed', r.status);

  r = await req('/state-gate?account_id=' + u.accountId, { answers: null, revision: gateRevision }, 'PUT');
  ok('explicit unknown is recorded', r.status === 200 && r.data.state === 'unanswered', r.data.state);
  r = await req('/trades', open(u), 'POST');
  ok('an adopted account with no fresh check refuses the new live entry as unanswered', r.status === 409 && r.data.code === 'state_gate_unanswered' && r.data.state_gate?.adopted === true, r);
  ok('the unanswered refusal still wrote nothing', (await count(u)) === afterRecordOnly + 1);

  r = await req('/state-gate?account_id=' + u.accountId, undefined, 'GET');
  r = await req('/state-gate?account_id=' + u.accountId, { answers: YES, revision: r.data.revision }, 'PUT');
  ok('answering all four yes is a fresh pass', r.status === 200 && r.data.state === 'passed');
  r = await req('/trades', open(u), 'POST');
  ok('a fresh pass admits the live entry through the normal guardrail path', r.status === 200 && r.data.trade?.status === 'open' && r.data.trade?.guardrail_snapshot, r.status);
  const snap2 = JSON.parse(r.data.trade.guardrail_snapshot);
  ok('the admitted snapshot records the pass as the trader’s own answers, not verified calm', snap2.state_gate?.state === 'passed' && snap2.state_gate?.broker_verified === false && !!snap2.state_gate?.receipt, snap2.state_gate);
  ok('the pass wrote exactly one additional trade', (await count(u)) === afterRecordOnly + 2);
  ok('the pass does not change account equity', (await balance()).current_balance === 10000 && (await balance()).starting_balance === 10000, await balance());
  r = await req('/bots/signals/save', { symbol: 'EURUSD', timeframe: '15m', account_id: u.accountId, prediction: false }, 'POST');
  ok('with the same market and a passed gate the state-gate refusal is gone', r.status === 200 && !/State gate/.test(JSON.stringify(r.data)), { status: r.status });
});
