'use strict';
/** M78 — Ep20 10:34–11:48. Use actual entry-TF INTERNAL structure, not HTF
 * narrative, conviction/risk or M69's mandatory shift gate. The legacy CRT pair
 * is a scenario axis, NOT the unspecified proprietary advanced Ep18 shortcut.
 * Named basic execution always retains its causal-zone post-shift pullback.
 */
const { TF_MS, number } = require('./protected');
const VARIANTS = Object.freeze(['aggressive', 'conservative']);
const EXECUTIONS = Object.freeze(['basic_causal_pullback', 'crt_scenario']);
const agreement = (dir, trend) => (dir === 1 && trend === 'bullish') || (dir === -1 && trend === 'bearish');

/** Stamp the window the existing SMC algorithm actually read; annotation ONLY. */
function source(candles, tf, observedAt) {
  const step = TF_MS[tf], clock = number(observedAt), bars = Array.isArray(candles) ? candles : [];
  return { version: 'm78', tf: tf || null, observed_at: clock, bars: bars.length,
    first_t: bars.length ? number(bars[0].t) : null, last_t: bars.length ? number(bars.at(-1).t) : null,
    closed_only: !!step && clock !== null && bars.length >= 30
      && bars.every((b, i) => number(b.t) !== null && Number(b.t) + step <= clock
        && (!i || Number(b.t) > Number(bars[i - 1].t))) };
}
function read({ dir, series, tf, observedAt, execution = 'basic_causal_pullback' } = {}) {
  const smc = series && series.smc, physicalTf = series && series.tf;
  const clock = number(observedAt), step = TF_MS[tf];
  const out = { version: 'm78', rule: 'entry_tf_internal_structure', state: 'unknown',
    variant: 'conservative', dir: [1, -1].includes(dir) ? dir : null,
    entry_tf: tf || null, source_tf: physicalTf || null,
    trend: null, aligned: null, observed_at: clock, source_close_at: null,
    execution, advanced_shortcut: false,
    reason: 'Internal structure is unknown: conservative preference; no guessed agreement and no bypass of causal entry requirements.' };
  if (![1, -1].includes(dir) || !step || clock === null || !smc || smc.ok === false
      || physicalTf !== tf || smc.tf !== tf || !Array.isArray(series.candles) || !series.candles.length)
    return out;
  // Ignore later appended unobserved bars, but never guess that a missing,
  // mismatched or forming-bar-built structural label was observed closed.
  const src = smc.structure_source;
  if (!src || src.version !== 'm78' || src.tf !== tf || src.closed_only !== true
      || number(src.observed_at) === null || src.observed_at > clock
      || number(src.first_t) === null || number(src.last_t) === null || src.first_t > src.last_t
      || src.last_t + step > clock || !Number.isInteger(src.bars) || src.bars < 30) return out;
  const used = series.candles.filter(b => b.t >= src.first_t && b.t <= src.last_t);
  if (used.length !== src.bars || new Set(used.map(b => b.t)).size !== src.bars
      || used.some(b => number(b.t) === null || Number(b.t) + step > clock)) return out;
  const trend = smc.structure && smc.structure.trend;
  if (!['bullish', 'bearish', 'ranging'].includes(trend)) return out;
  out.state = 'known'; out.trend = trend; out.source_close_at = src.last_t + step;
  out.aligned = agreement(dir, trend);
  out.variant = out.aligned ? 'aggressive' : 'conservative';
  out.reason = out.aligned
    ? `${tf} internal structure is ${trend}, with the ${dir > 0 ? 'long' : 'short'} execution: aggressive preference (Ep20). Risk tier is independent; the basic causal-zone pullback still applies.`
    : `${tf} internal structure is ${trend}, not with the ${dir > 0 ? 'long' : 'short'} execution: conservative preference (Ep20). Risk tier and the HTF narrative are not this selector.`;
  return out;
}

/** Reuse only matching observed evidence, including the execution direction. */
function scope(p, tf, observedAt, dir) {
  const clock = number(observedAt);
  if (!p || p.entry_tf !== tf || p.dir !== dir || clock === null
      || number(p.observed_at) === null || p.observed_at > clock) return null;
  try { return check(p, tf, dir); } catch (_) { return null; }
}
function choose(plan, p) {
  const variant = p && p.variant === 'aggressive' ? 'aggressive' : 'conservative';
  const field = variant === 'aggressive' ? 'aggressive' : 'safer';
  return { variant, field, scenario: plan && plan[field] || null };
}
/** Consistency of client-supplied evidence, NOT server reconstruction of OHLC. */
function check(p, tf, dir = null) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.version !== 'm78'
      || p.rule !== 'entry_tf_internal_structure' || !VARIANTS.includes(p.variant)
      || !['known', 'unknown'].includes(p.state) || p.entry_tf !== tf
      || !EXECUTIONS.includes(p.execution) || p.advanced_shortcut !== false
      || typeof p.reason !== 'string' || p.reason.length > 1000 || JSON.stringify(p).length > 3000
      || ([1, -1].includes(dir) && p.dir !== dir))
    throw new Error('entry_preference must be a bounded M78 snapshot matching entry TF/direction');
  if (p.state === 'known' && (p.source_tf !== tf || ![1, -1].includes(p.dir)
      || !['bullish', 'bearish', 'ranging'].includes(p.trend) || p.aligned !== agreement(p.dir, p.trend)
      || p.variant !== (p.aligned ? 'aggressive' : 'conservative')
      || number(p.observed_at) === null || number(p.source_close_at) === null
      || p.source_close_at > p.observed_at))
    throw new Error('entry_preference structure/variant evidence is contradictory');
  if (p.state === 'unknown' && (p.variant !== 'conservative' || p.aligned !== null || p.trend !== null))
    throw new Error('unknown entry_preference must remain explicitly conservative/unknown');
  return p;
}
function same(a, b) {
  return !!(a && b) && ['version', 'rule', 'state', 'variant', 'dir', 'entry_tf', 'source_tf',
    'trend', 'aligned', 'observed_at', 'source_close_at', 'execution', 'advanced_shortcut', 'reason']
    .every(k => a[k] === b[k]);
}
function note(p) {
  return `Entry preference ${p.variant} on ${p.entry_tf || 'unknown TF'} internal structure (${p.trend || 'unknown'}); ${p.execution === 'crt_scenario' ? 'CRT scenario only' : 'basic causal pullback retained'}. `;
}
module.exports = { source, read, scope, choose, check, same, note, VARIANTS };
