'use strict';
/**
 * M30 test support: the M115 harness chain (itself M13 → M12 → M111 → M110, unchanged) plus the
 * things only this milestone needs — the closed zone-method vocabulary read off the shipped module,
 * a reader for the filter block the engine publishes, a settings writer that goes through the app's
 * own `PUT /settings` route, and the two-shaped comparison this milestone is about: the same
 * displacement origins plotted two ways.
 *
 * Nothing here redraws a zone by hand. A probe that compares its own rectangle with the engine's
 * proves nothing about what the trader is shown; every comparison below is between two REAL reads of
 * the same candles, and the pair is keyed by the bar the zone came from (`i` + `displacement_i`),
 * which is the one thing the two methods agree on.
 */
const H = require('./m115-test-support');

const M30_VERSION = 'zone-methods-v1';
/** The shipped module carries the closed vocabulary, the folding rule and the consolidation walk. */
const m30 = (S) => !!(S && Array.isArray(S.ZONE_METHODS) && S.ZONE_METHODS.join('|') === 'pivot|range'
  && S.ZONE_METHOD_DEFAULT === 'pivot' && typeof S.zoneMethodOf === 'function'
  && typeof S.consolidationBase === 'function' && Number.isFinite(S.BASE_MAX_ATR) && Number.isFinite(S.BASE_MAX_BARS));

/** The uniform parent-control opener; `false` on the committed parent, where none of this exists. */
const shipped = (S, what) => { H.ok(`this tree ships ${what} (the committed parent does not, and that absence is this probe's control)`, m30(S)); return m30(S); };

/** The zone-method block the engine publishes, from either payload shape. */
const methodOf = (payload) => (payload && payload.setups && payload.setups.filters && payload.setups.filters.zone_method) || null;
/** The smc read behind either shape: an /analyse payload (`payload.smc`) or the raw analysis the
 * pure/engine probes hold directly. One accessor, so a comparison cannot silently see zero zones. */
const smcOf = (payload) => (payload && payload.smc) || payload || {};
/** Every zone of one direction, in payload order. */
const zonesOf = (payload, dir = null) => ((smcOf(payload).order_blocks) || [])
  .filter((z) => dir === null || z.dir === dir);
/** The zone key the two methods MUST agree on: the origin bar and the leg that created it. */
const keyOf = (z) => `${z.i}:${z.displacement_i}:${z.dir}`;
/** Zones by origin key, so a pair is matched by the bar rather than by array position. */
const byOrigin = (payload) => { const m = new Map(); for (const z of zonesOf(payload)) m.set(keyOf(z), z); return m; };

/**
 * The whole comparison in one place: for every displacement origin the two methods both plotted,
 * is the range box a SUPERSET of the pivot box, and did price ever come back into the range box
 * without touching the pivot box — i.e. the pullback he says the pivot method misses
 * (*"you would have missed this entry ... price did not mitigate your zone"*).
 *
 * `missed` is counted on closed bars strictly AFTER the leg's own run-up (from `displacement_i + 1`),
 * so the move that created the zone is never counted as a return to it.
 */
function compare(pivot, range, bars = null) {
  const p = byOrigin(pivot), r = byOrigin(range);
  const out = { origins: 0, paired: 0, superset: 0, equal: 0, separate: 0, missed: 0, missedOrigins: [], widest: null };
  for (const [k, pz] of p) {
    const rz = r.get(k);
    if (!rz) { out.separate++; continue; }
    out.paired++;
    const wider = rz.top >= pz.top - 1e-9 && rz.bottom <= pz.bottom + 1e-9;
    if (wider) out.superset++;
    if (rz.top === pz.top && rz.bottom === pz.bottom) out.equal++;
    const span = rz.top - rz.bottom - (pz.top - pz.bottom);
    if (!out.widest || span > out.widest.span) out.widest = { key: k, span: Math.round(span * 10000) / 10000, pivot: [pz.bottom, pz.top], range: [rz.bottom, rz.top] };
  }
  out.origins = p.size;
  if (Array.isArray(bars)) {
    for (const [k, pz] of p) {
      const rz = r.get(k);
      if (!rz || !(rz.top > pz.top + 1e-9 || rz.bottom < pz.bottom - 1e-9)) continue;
      const from = Math.max(Number(pz.displacement_i) + 1, 0);
      const into = (z) => bars.slice(from).find((b) => b.h >= z.bottom && b.l <= z.top) || null;
      const inRangeOnly = into(rz), inPivot = into(pz);
      if (inRangeOnly && !inPivot) { out.missed++; out.missedOrigins.push({ key: k, t: inRangeOnly.t, pivot: [pz.bottom, pz.top], range: [rz.bottom, rz.top] }); }
    }
  }
  return out;
}

/* The settings key, written the way the Settings screen writes it: a partial body on the route the
 * app already has. An unknown value is refused by the route (`zone_method_invalid`), which is one of
 * the things measured — so this helper returns the response rather than throwing. */
const chooseZoneMethod = (u, value) => u.req('/settings', { zone_method: value }, 'PUT');
/** The stored settings as the app serves them to the client that renders the Settings screen. */
const settingsOf = async (u) => (((await u.req('/auth/me', undefined, 'GET')).data || {}).user || {}).settings || {};
const analyse = (u, query = '') => u.req('/bots/analyse' + query, undefined, 'GET');
const chartOf = (u, query = '') => u.req('/bots/chart' + query, undefined, 'GET');
const scanOf = (u, query = '') => u.req('/bots/scan' + query, undefined, 'GET');
const gateOf = (payload) => (payload && payload.setups && payload.setups.filters && payload.setups.filters.plan_gate) || null;
const candidateOf = (payload, dir) => ((payload && payload.setups && payload.setups.candidates) || []).find((c) => c.dir === dir)
  || ((payload && payload.setups && payload.setups.candidates) || [])[0] || null;
/** A query that reaches a real candle series (the shim serves EURUSD 15m) and stays fast. */
const analyseQuery = (accountId, extra = {}) => {
  const q = new URLSearchParams({ symbol: 'EURUSD', tf: '15m', prediction: '0', bars: '600', account_id: String(accountId), ...extra });
  return '?' + q.toString();
};

module.exports = { ...H, m30, shipped, methodOf, smcOf, zonesOf, keyOf, byOrigin, compare, chooseZoneMethod, settingsOf,
  analyse, chartOf, scanOf, gateOf, candidateOf, analyseQuery, M30_VERSION };
