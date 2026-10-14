'use strict';
/**
 * M56 test support: the M115 harness (itself M13 -> M12 -> M111 -> M110, unchanged) plus the four
 * things only this milestone needs — a published plan written through the app's OWN strategy route,
 * a plan-gate reader, an analyse reader, and a gate extractor.
 *
 * Nothing here writes a `strategies` row by hand: a probe that passes on a row shape the app would
 * never store proves nothing about a plan the trader publishes, and `entry_rules` is exactly the
 * column whose (de)serialisation could drift between the editor and the engine.
 */
const H = require('./m115-test-support');

const M56_VERSION = 'plan-gate-v1';
/** The module is present AND is this milestone's: version, the closed vocabulary, the parse, the
 * per-direction evaluation, the payload view and the never-throwing read. */
const planGateOf = (M) => !!(M && M.VERSION === M56_VERSION && M.STATES && M.STATES.READY === 'ready'
  && typeof M.vocabulary === 'function' && typeof M.parseRule === 'function' && typeof M.parse === 'function'
  && typeof M.check === 'function' && typeof M.evaluate === 'function' && typeof M.view === 'function'
  && typeof M.safe === 'function' && typeof M.load === 'function');

/** The uniform parent-control opener; `false` on the committed parent, where the module is absent. */
const shipped = (M, what) => { H.ok(`this tree ships ${what} (the committed parent does not, and that absence is this probe's control)`, planGateOf(M)); return planGateOf(M); };

/** Publish a plan through the app's own route. `rules` is the entry-rules array; extra fields are
 * merged so a probe can set `active`, `market_conditions` (prose!) or an explicit `entry_rules`
 * string to exercise the parse of what is actually stored. */
async function plan(u, { name = 'M56 plan', rules = null, entry_rules = undefined, active = 1, ...rest } = {}) {
  const body = { name, description: 'Published by the M56 probe', market_conditions: 'Trending / ranging / news', timeframes: 'H4 / H1 / M15',
    // The route stringifies whatever it is handed, so an ARRAY is the shape a real client sends and
    // the shape the column ends up holding. `entry_rules` (a raw string) is kept for the probes that
    // measure what a wrongly-encoded stored value does.
    entry_rules: entry_rules !== undefined ? entry_rules : (rules || []),
    exit_rules: JSON.stringify(['exit when the plan invalidates']), checklist: JSON.stringify(['pre-trade checklist item']),
    risk_rules: 'Max risk 1%', target_r_multiple: 2, colour: '#4f8cff', active, ...rest };
  const r = await u.req('/strategies', body, 'POST');
  if (r.status !== 200) throw new Error('plan publish failed: ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 200));
  const id = (r.data.strategy && r.data.strategy.id) || r.data.id;
  return { ...r.data, id, body };
}

/** Replace a plan's rules through PUT, the way the editor saves an edit. */
const editPlan = (u, id, body) => u.req('/strategies/' + id, body, 'PUT');
const planGate = (u, id) => u.req('/bots/plan-gate' + (id ? '?strategy_id=' + id : ''), undefined, 'GET');
/** A stored strategy row as a PUT body: the three list columns go back as ARRAYS, which is what the
 * editor sends and what `strategyValues` stores. Echoing the stored STRING back double-encodes it —
 * that hazard is real, so it is written as its own deliberate case in the probe, never by accident. */
const asPutBody = (row, active) => {
  // A stored column arrives as a STRING and a helper's own body as an ARRAY: both are the same list,
  // and treating the array as unparseable would silently blank the trader's rules on a mere status toggle.
  const arr = (v, fallback) => { if (Array.isArray(v)) return v; try { const p = JSON.parse(typeof v === 'string' ? v : ''); return Array.isArray(p) ? p : fallback; } catch (e) { return fallback; } };
  return { ...row, entry_rules: arr(row.entry_rules, []), exit_rules: arr(row.exit_rules, ['exit when the plan invalidates']),
    checklist: arr(row.checklist, ['pre-trade checklist item']), ...(active === undefined ? {} : { active: active ? 1 : 0 }) };
};
const setActive = (u, id, row, active) => u.req('/strategies/' + id, asPutBody(row, active), 'PUT');
const analyse = (u, query = '') => u.req('/bots/analyse' + query, undefined, 'GET');
const chartOf = (u, query = '') => u.req('/bots/chart' + query, undefined, 'GET');
/** The gate block the client reads, from either payload shape. */
const gateOf = (payload) => (payload && payload.setups && payload.setups.filters && payload.setups.filters.plan_gate) || null;
/** Every candidate's plan-rules block, in payload order. */
const rulesOf = (payload) => ((payload && payload.setups && payload.setups.candidates) || []).map((c) => c.plan_rules || null);
/** The candidate a direction names, or the first. */
const candidateOf = (payload, dir) => ((payload && payload.setups && payload.setups.candidates) || []).find((c) => c.dir === dir)
  || ((payload && payload.setups && payload.setups.candidates) || [])[0] || null;
/** A query that reaches a real candle series: the shim serves EURUSD 15m, and the analyse route
 * needs the prediction disabled to stay fast (it is not part of what is being measured). */
const analyseQuery = (accountId, extra = {}) => {
  const q = new URLSearchParams({ symbol: 'EURUSD', tf: '15m', prediction: '0', bars: '600', account_id: String(accountId), ...extra });
  return '?' + q.toString();
};

module.exports = { ...H, planGateOf, shipped, plan, editPlan, planGate, setActive, asPutBody, analyse, chartOf, gateOf, rulesOf, candidateOf, analyseQuery, M56_VERSION };
