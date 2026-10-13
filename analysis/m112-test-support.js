'use strict';
/**
 * TEST ONLY (M112): the same frozen-clock / HTTP / SQL harness as M111, plus the one fixture M112
 * needs and M111 never did — an account that is otherwise CLEAR, so the trading window is the only
 * thing that can refuse the entry. `admit()` completes the shipped pre-market routine through the
 * app's own endpoints (calendar → plan → charts → 15-minute meditation → four morning booleans),
 * which is what a real trader does; nothing writes trade rows or bypasses a guardrail to do it.
 * The window is then set through `PUT /api/bots/window`, so every refusal measured below is the
 * app's own answer.
 *
 * The milestone gate is the module AND the columns: a parent without them reports its one measured
 * negative rather than crashing.
 */
const H = require('./m111-test-support');

/** The shipped module carries the M112 vocabulary (states, half-open window, suggestion). */
const m112 = (N) => !!(N && N.STATES && N.STATES.OUTSIDE === 'outside' && N.STATES.UNSET === 'unset'
  && typeof N.stateOf === 'function' && typeof N.suggest === 'function' && typeof N.apply === 'function');
const shipped = (N, what) => { H.ok(`this tree ships ${what} (the committed parent does not, and that absence is this probe's control)`, m112(N)); return m112(N); };

const CAL = { step: 'calendar', reviewed: true, method: 'manual_external', summary: 'External calendar reviewed' };
const PLAN = { step: 'plan', reviewed: true, plan_text: 'Own plan snapshot' };
const CHARTS = { step: 'charts', reviewed: true, daily_bias: 'neutral', htf_range: 'Daily range', alert_status: 'not_applicable', alert_note: 'No zone relevant' };
const CHECKIN = { step: 'check_in', calm: true, clear: true, following_plan: true, would_take_if_up_big: true };

/** Complete the pre-market routine for an account through the app's own endpoints. */
async function admit(u, accountId, nowMs) {
  const state = (await u.req(`/routine?account_id=${accountId}`, undefined, 'GET')).data.routine;
  const cycle = state && state.cycle && state.cycle.id;
  if (!cycle) throw new Error('no active routine cycle: ' + JSON.stringify(state));
  for (const b of [CAL, PLAN, CHARTS]) {
    const r = await u.req('/routine/step', { account_id: accountId, cycle_id: cycle, ...b });
    if (r.status !== 200) throw new Error('routine step ' + b.step + ' failed: ' + r.status + ' ' + JSON.stringify(r.data));
  }
  await u.req('/routine/meditation', { account_id: accountId, cycle_id: cycle, action: 'start' });
  H.setNow((nowMs || H.now()) + 15 * 60000);
  const done = await u.req('/routine/meditation', { account_id: accountId, cycle_id: cycle, action: 'complete' });
  if (done.status !== 200) throw new Error('meditation complete failed: ' + JSON.stringify(done.data));
  const fin = await u.req('/routine/step', { account_id: accountId, cycle_id: cycle, ...CHECKIN });
  if (fin.status !== 200) throw new Error('check-in failed: ' + JSON.stringify(fin.data));
  return cycle;
}

/** A window that cannot contain `nowMs` in `zone`, and one that certainly does. */
function timesFor(zone, nowMs) {
  const p = H.mod('src/trading-window').parts(nowMs, zone);
  const h = p.hour;
  return { outside: { start: `${String((h + 3) % 24).padStart(2, '0')}:00`, end: `${String((h + 5) % 24).padStart(2, '0')}:00` },
    inside: { start: `${String((h + 23) % 24).padStart(2, '0')}:00`, end: `${String((h + 2) % 24).padStart(2, '0')}:00` } };
}

/* The port the M111 harness opened is private to its own `req` closure (that file is frozen by the
 * M111 milestone's own evidence), so it is captured here by watching the loopback URL the harness
 * itself fetches. The jsdom probe needs it to point the browser-side fetch shim at the same server. */
let lastPort = null;
const realFetch = global.fetch;
global.fetch = (url, ...rest) => {
  try { const u = new URL(String(url)); if (u.hostname === '127.0.0.1' && u.port) lastPort = u.port; } catch { /* not a URL we care about */ }
  return realFetch(url, ...rest);
};
const port = () => lastPort;

module.exports = {
  ...H, m112, shipped, admit, timesFor, port,
  /** The window endpoints, addressed the way the settings dialog addresses them. */
  windowGet: (u, id) => u.req(`/bots/window?account_id=${id}`, undefined, 'GET'),
  windowPut: (u, body) => u.req('/bots/window', body, 'PUT'),
  /** A trade payload that is otherwise admissible, so only the window can refuse it. */
  entry: (accountId, extra = {}) => ({ account_id: accountId, symbol: 'EURUSD', direction: 'long', status: 'open', entry: 1.1, stop: 1.09, target: 1.12, size: 1, setup_grade: 'A', emotion_before: 'calm', ...extra }),
};
