'use strict';
/** M75 — Ep20 17:48–19:35. CURRENT protected high/low first; without one,
 * compare the older intact protected boundary and zone, choose nearer VALID.
 * This is not a universal Math.max/Math.min swap or an RR-optimisation rule.
 */
const Protected = require('./protected');
const number = Protected.number, r4 = v => Math.round(v * 10000) / 10000;
const BUFFER_ATR = .18; // Existing engineering buffer; course says "a few pips".

function plan({ dir, entry, zone, atr, tf, report, observedAt, currentSweep,
  currentSweepTf = tf, currentIsCausal = false, policy = 'course' } = {}) {
  const buffer = number(atr) > 0 ? atr * BUFFER_ATR : null;
  const baseZone = zone ? (dir > 0 ? number(zone.bottom) : number(zone.top)) : null;
  const out = { state: 'invalid', rule: 'no_valid_invalidation', tf: tf || null,
    source_tf: null, buffer_tf: tf || null, buffer_atr: BUFFER_ATR, buffer,
    base: null, raw_stop: null, price: null, kind: null, protected_level: null,
    candidates: [], rejected: [], reason: 'No valid stop/invalidation boundary.' };
  if (![1, -1].includes(dir) || !(number(entry) > 0) || buffer === null) {
    out.reason = 'Entry direction/price or entry-timeframe ATR is unavailable.'; return out;
  }
  function candidate(base, kind, sourceTf, p = null) {
    const value = number(base);
    const rawStop = value === null ? null : value - dir * buffer;
    const price = rawStop === null ? null : r4(rawStop);
    // Do not make a profitable-side "invalidation" valid by adding a huge buffer.
    // Also validate published prices: rounding a stop onto entry is not defined risk.
    const valid = value > 0 && dir * (value - entry) <= 0 && rawStop > 0
      && dir * (rawStop - entry) < 0 && price > 0 && dir * (price - r4(entry)) < 0;
    const c = { kind, tf: sourceTf || null, base: value, raw_stop: rawStop, price,
      distance: rawStop === null ? null : Math.abs(entry - rawStop), valid,
      protected_id: p ? p.id : null, origin_t: p ? p.t : null };
    (valid ? out.candidates : out.rejected).push(c); return c;
  }
  const z = candidate(baseZone, zone && zone.kind || 'zone', tf);
  function pick(c, rule, p = null, reason) {
    if (!c || !c.valid) return out;
    Object.assign(out, { state: 'known', rule, source_tf: c.tf, base: c.base,
      raw_stop: c.raw_stop, price: c.price, kind: c.kind, protected_level: p,
      reason: reason || `${c.kind} invalidation at ${r4(c.base)}; ${BUFFER_ATR} entry-TF ATR buffer beyond it.` });
    return out;
  }
  const clock = number(observedAt) ?? (report && number(report.observed_at));
  const scoped = Protected.scope(report, tf, clock);
  const rawSweep = currentSweep && number(currentSweep.extreme);
  const conservative = rule => {
    const s = rawSweep === null || rawSweep === undefined ? null
      : candidate(rawSweep, 'sweep_extreme', currentSweepTf);
    const valid = [z, s].filter(c => c && c.valid).sort((a, b) => b.distance - a.distance);
    return pick(valid[0], rule, null, rule === 'legacy_further'
      ? 'Explicit pre-M75 research stop: farther zone/sweep boundary, original buffer.'
      : 'Protection evidence is unknown; retain a valid conservative zone/sweep boundary, not an inferred protected level or a manufactured tighter stop.');
  };
  if (policy === 'legacy') return conservative('legacy_further');
  if (scoped.state !== 'known') return conservative('protection_unknown_conservative');
  const cur = currentSweepTf === tf ? Protected.forSweep(scoped, currentSweep) : null;
  const unknownCurrent = currentSweep && (number(currentSweep.t) === null
    || currentSweepTf !== tf || scoped.rejected.some(r => r.t === currentSweep.t
      && r.dir === currentSweep.dir && r.state === 'unknown'));
  if (unknownCurrent) return conservative('protection_unknown_conservative');
  if (cur && currentIsCausal) {
    if (cur.status === 'taken') {
      out.rule = 'current_protected_taken'; out.reason = 'The current causal protected boundary has been taken; no farther-stop rescue.';
      return out;
    }
    if (cur.status === 'intact') {
      const c = candidate(cur.raw_price, cur.type === 'high' ? 'protected_high' : 'protected_low', cur.tf, cur);
      if (!c.valid) {
        out.rule = 'current_protected_invalid'; out.reason = 'The current protected boundary has no valid adverse/published stop; no substitute invalidation.';
        return out;
      }
      return pick(c, 'current_protected', cur, 'Current causal protected ' + cur.type
        + ' owns invalidation; do not replace it with a nearer zone merely for RR.');
    }
  }
  // Older levels must be intact, adverse, already observed and on the REAL entry
  // TF. Strong labels, arbitrary sweep extremes and higher-TF projections cannot
  // enter this comparison. The zone wins an exact distance tie.
  const byId = new Map();
  for (const p of scoped.levels || []) {
    if (p.status !== 'intact' || p.dir !== dir || !(number(p.raw_price) > 0)
        || p.available_at > clock || p.tf !== tf) continue;
    const c = candidate(p.raw_price, p.type === 'high' ? 'protected_high' : 'protected_low', p.tf, p);
    byId.set(p.id, p);
  }
  const valid = out.candidates.slice().sort((a, b) => a.distance - b.distance
    || (a.protected_id ? 1 : 0) - (b.protected_id ? 1 : 0));
  const chosen = valid[0];
  return pick(chosen, 'nearer_valid_fallback', chosen && chosen.protected_id ? byId.get(chosen.protected_id) : null,
    'No current causal protected boundary: choose the nearer valid older protected level or entry-zone boundary; retain the original buffer.');
}

function evidence(p) {
  if (!p) return null;
  return { state: p.state, rule: p.rule, tf: p.tf, source_tf: p.source_tf,
    buffer_tf: p.buffer_tf, buffer_atr: p.buffer_atr, buffer: p.buffer,
    base: p.base, stop: p.price, kind: p.kind,
    protected_level: p.protected_level ? { id: p.protected_level.id, tf: p.protected_level.tf,
      type: p.protected_level.type, t: p.protected_level.t, raw_price: p.protected_level.raw_price,
      available_at: p.protected_level.available_at, sweep_level: p.protected_level.sweep_level,
      liquidity: p.protected_level.liquidity } : null,
    candidates: p.candidates.map(c => ({ ...c })), rejected: p.rejected.map(c => ({ ...c })) };
}
module.exports = { plan, evidence, BUFFER_ATR };

/** Client-supplied Save-plan metadata is a snapshot, not a server replay. Check
 * bounded shape, price/TF consistency; never silently retain contradictory facts.
 */
function check(p, stop, entryTf) {
  const rules = ['current_protected', 'nearer_valid_fallback', 'protection_unknown_conservative', 'legacy_further'];
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.state !== 'known'
      || !rules.includes(p.rule) || !Protected.TF_MS[p.tf] || (entryTf && p.tf !== entryTf)
      || !Protected.samePrice(p.stop, stop) || !(number(p.base) > 0) || !(number(p.buffer) > 0)
      || p.buffer_atr !== BUFFER_ATR || JSON.stringify(p).length > 8000)
    throw new Error('stop_policy must be a bounded known snapshot matching the displayed stop and entry TF');
  return p;
}
function note(p) {
  return `Stop ${p.source_tf || 'unknown TF'} ${p.kind || 'unknown'} at ${p.stop}; base ${p.base}, buffer ${p.buffer}; ${p.rule}. `;
}
module.exports.check = check;
module.exports.note = note;
