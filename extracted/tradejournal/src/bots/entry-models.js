'use strict';
/** Named entry composition (Ep 18). This module contains no IO/account state.
 * M70's selection policy is shared by the legacy opt-in breaker selector and
 * the two-model LTF composer (M68). Geometry, not strength, defines extreme.
 */
const number = (v) => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
function preferExtreme({ chosen, flipZones = [], orderBlocks = [], sweeps = [], dir, enabled = true }) {
  if (!enabled || !chosen || !chosen.zone) return null;
  const eligible = orderBlocks.filter((z) => !z.breached && z.mitigated === false && z.dir === dir);
  if (!eligible.length) return null;
  const extreme = eligible.reduce((a, b) => dir > 0
    ? (b.bottom < a.bottom ? b : a) : (b.top > a.top ? b : a));
  // A third, stronger non-extreme OB does not cancel this mechanical preference.
  // Caller supplies only opted-in, eligible flips in existing ranking order.
  const flips = flipZones.length ? flipZones : chosen.zone.is_breaker ? [chosen.zone] : [];
  const flip = flips.find((z) => z.dir === dir && extreme.bottom <= z.top && extreme.top >= z.bottom);
  if (!flip) return null;
  const point = number(flip.reaction_point);
  const taken = point === null ? null : sweeps.find((s) => s.dir === dir
    && number(s.t) !== null && number(flip.t) !== null && s.t >= flip.t
    && number(s.extreme) !== null && number(s.close) !== null
    && (dir > 0 ? s.extreme < point && s.close > point : s.extreme > point && s.close < point)) || null;
  return { zone: extreme, flip,
    fuel: { type: dir > 0 ? 'SSL' : 'BSL', price: point, known: point !== null,
      swept: point === null ? null : !!taken, sweep_t: taken ? taken.t : null },
    blocked: point !== null && !taken,
    note: 'Ep 18: prefer the unmitigated extreme zone over an overlapping flip zone; take the liquidity beyond the failed reaction first.' };
}
module.exports = { preferExtreme };

const MODELS = ['flip', 'market_shift', 'none'];
function normaliseName(v) {
  if (v == null || v === '') return null; // Unknown history is NOT an explicit "none".
  if (typeof v !== 'string') throw new Error('entry_model must be a string or unspecified');
  const name = v.trim().toLowerCase();
  if (!MODELS.includes(name)) throw new Error('entry_model must be flip, market_shift, none, or unspecified');
  return name;
}
function duration(tf) {
  const m = /^(\d+)(m|h|d|w)$/.exec(String(tf || ''));
  return m ? Number(m[1]) * ({ m: 60000, h: 3600000, d: 86400000, w: 604800000 })[m[2]] : null;
}
const sign = (d) => d === 'up' || d === 'bullish' ? 1 : d === 'down' || d === 'bearish' ? -1 : Math.sign(Number(d));
function sameBreak(a, b) {
  return !!(a && b && number(a.t) !== null && a.t === b.t && sign(a.dir) === sign(b.dir)
    && number(a.level) !== null && a.level === b.level);
}
const overlaps = (a, b) => a && b && a.bottom <= b.top && a.top >= b.bottom;

/** Ep18's physical sequence, not a pattern-name guess. `poi` is the SAME MTF
 * selector used by Setup. Known unmet conditions refuse a named execution; missing
 * layers remain unknown (M8). Caller retains HTF narrative/session/phase/RR gates.
 * A cause must survive OB dedup and verify against the actual CLOSED LTF candle.
 */
function compose({ medium, lower, dir, poi, useBreakers = false, observedAt = Date.now(),
  maxSweepAge = 25, maxShiftAge = 8 }) {
  const result = { applies: false, entry_model: 'none', entry_tf: lower ? lower.tf : null,
    state: 'unknown', ready: false, reasons: [], zone: null, sweep: null, shift: null,
    displacement: null, atr: number(lower && lower.atr) > 0 ? number(lower.atr) : null, point_of_interest: null, mitigation_at: null, preference: null };
  const wait = (state, reason) => { result.state = state; result.reasons.push(reason); return result; };
  const mediumMs = duration(medium && medium.tf), lowMs = duration(lower && lower.tf);
  if (!mediumMs || !lowMs || lowMs >= mediumMs || !lower.smc || lower.smc.ok === false
      || !(lower.candles || []).length || !(medium.candles || []).length)
    return wait('unknown', 'Distinct lower-timeframe model data is unavailable; no named model is inferred.');
  result.applies = true;
  const closed = lower.candles.filter((b) => number(b.t) !== null && b.t + lowMs <= observedAt);
  const z = poi && poi.zone;
  if (!z) return wait('waiting_poi', 'No eligible MTF order-block point of interest (a standalone FVG is not enough).');
  const meta = z.meta || {};
  const formed = number(meta.is_breaker ? meta.confirmed_at : meta.displacement_t);
  if (formed === null) {
    result.applies = false;
    return wait('unknown', 'MTF POI formation time is unknown; no named sequence is invented.');
  }
  result.point_of_interest = { tf: medium.tf, kind: z.kind, bottom: z.bottom, top: z.top,
    mid: z.mid, origin_t: meta.t, formed_at: formed + mediumMs, mitigation_at: null };
  const touch = closed.find((b) => b.t >= formed + mediumMs && b.l <= z.mid && b.h >= z.mid);
  if (!touch) return wait('waiting_poi', `Wait for midpoint mitigation of the ${medium.tf} POI before looking for a lower model.`);
  result.point_of_interest.mitigation_at = touch.t;
  const low = lower.smc, shift = low.structure && low.structure.last_break;
  const sb = shift && closed.find((b) => b.t === shift.t);
  const age = sb ? closed.length - 1 - closed.indexOf(sb) : null;
  if (!sb || sign(shift.dir) !== dir || number(shift.level) === null || age < 0 || age > maxShiftAge
      || !(dir > 0 ? sb.c > shift.level : sb.c < shift.level))
    return wait('waiting_shift', 'Wait for a recent closed LTF structural break in the execution direction; a label or displacement alone is not a shift.');
  result.shift = { ...shift, close: sb.c, bars_ago: age, confirmed: true };
  const sweep = (low.sweeps || []).filter((s) => {
    const b = closed.find((c) => c.t === s.t);
    return b && b.l <= z.top && b.h >= z.bottom && sign(s.dir) === dir && s.t >= touch.t && s.t < shift.t
      && closed.length - 1 - closed.indexOf(b) <= maxSweepAge && number(s.level) !== null
      && number(s.extreme) !== null
      && (dir > 0 ? b.l < s.level && b.c > s.level : b.h > s.level && b.c < s.level);
  }).sort((a, b) => b.t - a.t)[0];
  if (!sweep) return wait('waiting_sweep', 'Wait for a closed LTF liquidity sweep at/after POI mitigation, strictly before the shift; intrabar ordering is not guessed.');
  const sweepBar = closed.find((b) => b.t === sweep.t);
  result.sweep = { ...sweep, close: sweepBar.c, extreme: dir > 0 ? sweepBar.l : sweepBar.h };
  const obs = (low.order_blocks || []).filter((ob) => sign(ob.dir) === dir && !ob.breached && overlaps(ob, z)
    && number(ob.t) !== null && ob.t >= touch.t && ob.t <= shift.t
    && number(ob.bottom) !== null && number(ob.top) !== null && ob.top > ob.bottom
    && (ob.structure_causes || []).some((c) => {
      const b = closed.find((x) => x.t === c.displacement_t);
      return b && lower.candles[c.displacement_i] && lower.candles[c.displacement_i].t === c.displacement_t
        && lower.candles[ob.i] && lower.candles[ob.i].t === ob.t && ob.i < c.displacement_i
        && lower.candles[c.shift && c.shift.i] && lower.candles[c.shift.i].t === shift.t
        && c.displacement_t >= sweep.t && c.displacement_t <= shift.t
        && c.shift && c.shift.confirmed === true && sameBreak(c.shift, shift)
        && c.shift.i >= c.displacement_i && c.shift.i <= c.displacement_i + 1;
    }));
  const flips = useBreakers ? (low.breakers || []).filter((b) => sign(b.dir) === dir && overlaps(b, z)
    && b.confirmed === true && b.failed_reaction === true && b.structure_break
    && b.structure_break.confirmed === true && sameBreak(b.structure_break, shift)
    && number(b.reaction_point) !== null && (dir > 0 ? sb.c > b.reaction_point : sb.c < b.reaction_point)
    && number(b.t) !== null && b.t >= touch.t && b.t < shift.t
    && number(b.bottom) !== null && number(b.top) !== null && b.top > b.bottom)
    .map((b) => ({ ...b, is_breaker: true, fresh: true, breached: false })) : [];
  const scored = obs.concat(flips).map((ob) => ({ zone: ob,
    score: (number(ob.strength) || 0) + Math.max(0, 1 - (number(ob.distance_atr) || 0) / 6) * .5 }))
    .sort((a, b) => b.score - a.score);
  let chosen = scored[0];
  if (!chosen) return wait('waiting_zone', 'The shift has no causally linked LTF order block or opted-in confirmed flip. Do not substitute the MTF zone or an arbitrary FVG.');
  // A market-shift OB is being CREATED by this shift: it is unmitigated at
  // confirmation. Hold the extreme preference through its subsequent pullback,
  // rather than losing it precisely when live `mitigated` becomes true.
  const policyObs = obs.map((ob) => ({ ...ob, mitigated: false }));
  const physicalSweeps = (low.sweeps || []).filter((s) => {
    const b = closed.find((c) => c.t === s.t);
    return b && number(s.extreme) !== null && number(s.level) !== null
      && (sign(s.dir) > 0 ? b.l < s.level && b.c > s.level : b.h > s.level && b.c < s.level);
  }).map((s) => {
    const b = closed.find((c) => c.t === s.t);
    return { ...s, close: b.c, extreme: sign(s.dir) > 0 ? b.l : b.h };
  });
  const pref = preferExtreme({ chosen, orderBlocks: policyObs, flipZones: flips,
    sweeps: physicalSweeps, dir });
  if (pref) { chosen = { zone: pref.zone }; result.preference = { rule: 'extreme_over_flip', fuel: pref.fuel, blocked: pref.blocked }; }
  const entryZone = chosen.zone;
  const entry = number(entryZone.is_breaker ? entryZone.mid : entryZone.body_mid) ?? number(entryZone.mid);
  if (entry === null || number(entryZone.mid) === null || entry < entryZone.bottom || entry > entryZone.top)
    return wait('waiting_zone', 'The causal lower entry zone has no valid entry/midpoint price.');
  result.entry_model = entryZone.is_breaker ? 'flip' : 'market_shift';
  const fuelSweep = pref && pref.fuel.sweep_t !== null ? physicalSweeps.find((s) => s.t === pref.fuel.sweep_t && sign(s.dir) === dir) : null;
  result.stop_sweep = fuelSweep && (dir > 0 ? fuelSweep.extreme < result.sweep.extreme : fuelSweep.extreme > result.sweep.extreme)
    ? fuelSweep : result.sweep;
  result.zone = { kind: entryZone.is_breaker ? 'flip_zone' : 'order_block', dir,
    bottom: entryZone.bottom, top: entryZone.top, mid: entryZone.mid, entry,
    origin_t: entryZone.origin ? entryZone.origin.t : entryZone.t,
    formation_t: shift.t, meta: entryZone,
    overlap: (low.fvgs || []).find((g) => !g.filled && sign(g.dir) === dir && overlaps(g, entryZone)) || null };
  result.displacement = (low.displacement || []).find((d) => d.t >= sweep.t && d.t <= shift.t && sign(d.dir) === dir) || null;
  const after = closed.filter((b) => b.t > shift.t);
  if (after.some((b) => dir > 0 ? b.c < entryZone.bottom : b.c > entryZone.top))
    return wait('invalidated', 'The lower entry zone closed through after confirmation; remove the model.');
  const mitigated = after.find((b) => b.l <= entryZone.mid && b.h >= entryZone.mid && b.l <= entry && b.h >= entry);
  result.mitigation_at = mitigated ? mitigated.t : null;
  if (pref && pref.blocked) return wait('waiting_fuel', `Extreme-over-flip: wait for ${pref.fuel.type} beyond the failed reaction (${pref.fuel.price}) to be swept.`);
  const price = number(closed.at(-1) && closed.at(-1).c);
  if (!mitigated || price === null || price < entryZone.bottom || price > entryZone.top)
    return wait('waiting_pullback', `Wait for a post-shift midpoint pullback into the ${lower.tf} ${result.entry_model} zone; no pullback means no trade.`);
  if (!(result.atr > 0)) return wait('waiting_atr', 'The LTF ATR is unknown; do not borrow the MTF buffer to invent a named-model stop.');
  result.state = 'ready'; result.ready = true;
  result.atr = number(lower.atr) > 0 ? number(lower.atr) : null;
  return result;
}
module.exports = { preferExtreme, compose, MODELS, normaliseName, duration, sameBreak };

/** Compact immutable decision snapshot for output/signals/journal, not all candles. */
function evidence(model) {
  if (!model || !model.applies) return null;
  return { model: model.entry_model, tf: model.entry_tf, atr: model.atr, state: model.state,
    poi: model.point_of_interest, sweep: model.sweep, stop_sweep: model.stop_sweep || model.sweep, shift: model.shift,
    zone: model.zone ? { kind: model.zone.kind, bottom: model.zone.bottom, top: model.zone.top,
      entry: model.zone.entry, origin_t: model.zone.origin_t, formation_t: model.zone.formation_t } : null,
    mitigation_at: model.mitigation_at, preference: model.preference };
}
module.exports.evidence = evidence;

/** Nullable, bounded JSON snapshot. Retagging a manual journal record cannot
 * silently retain contradictory automatic evidence from a different model/TF. */
function encodeEvidence(v, model, tf = null) {
  if (v == null || v === '' || model == null || model === 'none') return null;
  const data = typeof v === 'string' ? JSON.parse(v) : v;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('entry_evidence must be a JSON object');
  if (data.model !== model || (tf && data.tf !== tf)) return null;
  const encoded = JSON.stringify(data);
  if (encoded.length > 16000) throw new Error('entry_evidence exceeds 16000 characters');
  return encoded;
}
module.exports.encodeEvidence = encodeEvidence;
