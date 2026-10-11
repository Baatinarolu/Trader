'use strict';
/** M76 — Ep20 16:42–19:35: a protected high/low SWEPT liquidity and rejected it.
 * A strong/fractal swing alone is not protection. These are report-only facts;
 * M75's stop selector is a separate consumer. No account state or IO here.
 */
const number = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const r4 = v => Math.round(v * 10000) / 10000;
const TF_MS = Object.freeze({ '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
  '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000 });
const samePrice = (a, b) => number(a) !== null && number(b) !== null && Math.abs(a - b) <= 1e-9;

function unknown(tf, observedAt, reason) {
  return { version: 'm76', state: 'unknown', tf: tf || null, observed_at: number(observedAt),
    levels: [], rejected: [], reason };
}

/** poolBefore(s) must resolve a real matching liquidity pool from a CLOSED prefix
 * ending BEFORE the sweep, not a present/future catalogue relabelled as old data.
 * The caller supplies its existing detector. Missing provenance stays unknown.
 */
function discover(candles, sweeps, { tf, observedAt, poolBefore } = {}) {
  const step = TF_MS[tf], clock = number(observedAt);
  if (!step || clock === null || !Array.isArray(candles) || !candles.length)
    return unknown(tf, clock, 'Closed physical timeframe data is unavailable.');
  const closed = candles.filter(b => number(b.t) !== null && b.t + step <= clock);
  if (!closed.length) return unknown(tf, clock, 'No observed closed candles.');
  const out = { version: 'm76', state: 'known', tf, observed_at: clock,
    closed_through: Math.max(...closed.map(b => b.t + step)), levels: [], rejected: [] };
  const seen = new Map();
  for (const s of sweeps || []) {
    const reject = (reason, state = 'known') => out.rejected.push({ t: number(s && s.t),
      dir: s && s.dir, extreme: number(s && s.extreme), reason, state });
    if (!s || ![1, -1].includes(s.dir) || number(s.t) === null || number(s.level) === null
        || number(s.extreme) === null) { reject('missing_sweep_evidence', 'unknown'); continue; }
    const i = candles.findIndex(b => b.t === s.t), b = i >= 0 ? candles[i] : null;
    if (!b || !closed.includes(b)) { reject('unobserved_sweep', 'unknown'); continue; }
    const prev = i > 0 ? candles[i - 1] : null;
    const values = [b.o, b.h, b.l, b.c];
    const validBar = values.every(v => number(v) !== null) && b.h >= Math.max(b.o, b.c)
      && b.l <= Math.min(b.o, b.c) && b.l > 0;
    const high = s.dir === -1, extreme = high ? b.h : b.l;
    const physical = validBar && prev && number(prev.c) !== null && prev.t + step <= b.t
      && (s.i == null || s.i === i) && (s.type == null || s.type === (high ? 'BSL' : 'SSL'))
      && samePrice(extreme, s.extreme) && (s.close == null || samePrice(b.c, s.close))
      && (high ? prev.c < s.level && b.h > s.level && b.c < s.level
        : prev.c > s.level && b.l < s.level && b.c > s.level);
    if (!physical) { reject('not_a_closed_liquidity_rejection'); continue; }
    const pool = typeof poolBefore === 'function' ? poolBefore(s) : null;
    if (!pool || pool.tf !== tf || !samePrice(pool.price, s.level)
        || number(pool.available_at) === null || pool.available_at > s.t
        || pool.type !== (high ? 'BSL' : 'SSL')) {
      reject('liquidity_not_proven_before_sweep', 'unknown'); continue;
    }
    const key = `${s.dir}:${s.t}:${extreme}`;
    if (seen.has(key)) {
      const p = seen.get(key);
      if (!p.liquidity.some(x => x.kind === pool.kind && samePrice(x.price, pool.price))) p.liquidity.push({ ...pool });
      continue;
    }
    // A wick through the institutional boundary TAKES it; a later close-back
    // may create a new protected high/low, but cannot resurrect this old one.
    const taken = closed.find(c => c.t > s.t && (high ? c.h > extreme : c.l < extreme));
    const row = { id: `${tf}:${s.t}:${s.dir}`, tf, dir: s.dir, type: high ? 'high' : 'low',
      label: high ? 'Protected high' : 'Protected low', price: r4(extreme), raw_price: extreme,
      t: s.t, i, available_at: s.t + step, basis: 'closed_liquidity_rejection',
      status: taken ? 'taken' : 'intact', invalidated_at: taken ? taken.t + step : null,
      sweep_level: s.level, sweep_close: b.c, liquidity: [{ ...pool }] };
    seen.set(key, row); out.levels.push(row);
  }
  out.levels.sort((a, b) => b.t - a.t || a.dir - b.dir);
  return out;
}

/** Never borrow protection from a different TF or a future observation snapshot. */
function scope(report, tf, observedAt) {
  const clock = number(observedAt);
  if (!report || report.version !== 'm76' || report.state !== 'known' || report.tf !== tf
      || clock === null || number(report.observed_at) === null || report.observed_at > clock)
    return unknown(tf, clock, 'Protection source is missing, mismatched or not observed.');
  return { ...report, levels: (report.levels || []).filter(p => p.tf === tf && p.available_at <= clock),
    rejected: (report.rejected || []).filter(p => p.t !== null && p.t <= clock) };
}

function forSweep(report, sweep) {
  if (!report || report.state !== 'known' || !sweep) return null;
  return (report.levels || []).find(p => p.t === sweep.t && p.dir === sweep.dir
    && samePrice(p.raw_price, sweep.extreme)) || null;
}

function annotate(points, report) {
  return (points || []).map(s => {
    const p = (report.levels || []).find(p => p.t === s.t && p.type === s.type
      && (samePrice(p.raw_price, s.price) || samePrice(p.price, s.price)));
    return { ...s, protected: !!(p && p.status === 'intact'),
      protection_state: p ? p.status : report.state === 'unknown' ? 'unknown' : 'not_proven',
      protected_level: p ? { id: p.id, tf: p.tf, available_at: p.available_at,
        invalidated_at: p.invalidated_at, sweep_level: p.sweep_level } : null };
  });
}
module.exports = { discover, scope, forSweep, annotate, unknown, TF_MS, number, samePrice };
