'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PREDICTION BOT — "what are the odds this works?"  (playlist episodes 25, 27, 29)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Two honest predictions, both measured rather than asserted:
 *
 *   1. SETUP PROBABILITY
 *      The entry model is replayed bar-by-bar over the market's own history
 *      (walk-forward: each decision only sees candles before it). Every setup it
 *      would have taken is then resolved against the future: what happened first,
 *      the stop or the target? Those outcomes train a small logistic model whose
 *      features are exactly the confluence checklist, so a live setup gets a
 *      calibrated P(win) with an explicit sample size.
 *
 *   2. DIRECTION PROBABILITY
 *      A second, simpler study: bucket history by the same trend/momentum read the
 *      app shows, then measure how often price was higher N bars later. That gives
 *      "P(up) over the next 20 bars" per bucket — the honest version of "buy/sell".
 *
 *  Nothing here pretends to see the future. Sample sizes, base rates and the model's
 *  own hit rate are always returned so the UI can say "thin sample" when it is thin.
 */

const C = require('../candles');
const SMC = require('./smc');
const Setup = require('./setup');
const Ind = require('../indicators');
const I = require('../instruments');

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ helpers */

/** Cheap trend read used identically in the backtest and at prediction time. */
function quickBias(candles) {
  const c = candles.map((x) => x.c);
  if (c.length < 60) return { score: 0, bias: 0 };
  const ema = (vals, p) => { const k = 2 / (p + 1); let e = vals.slice(0, p).reduce((a, b) => a + b, 0) / p; for (let i = p; i < vals.length; i++) e = vals[i] * k + e * (1 - k); return e; };
  const e9 = ema(c, 9), e21 = ema(c, 21), e50 = ema(c, Math.min(50, c.length - 5));
  // RSI(14) inline (Wilder)
  let gain = 0, loss = 0;
  for (let i = c.length - 14; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  const rs = loss === 0 ? 100 : gain / loss;
  const rsi = 100 - 100 / (1 + rs);
  let score = 0;
  score += e9 > e21 ? 1 : -1;
  score += e50 ? (c[c.length - 1] > e50 ? 1 : -1) : 0;
  score += rsi > 52 ? 1 : rsi < 48 ? -1 : 0;
  return { score: (score / 3) * 100, bias: Math.sign(score), rsi: r2(rsi) };
}

const FEATURES = [
  'score', 'grade_num', 'sweep_atr', 'displacement_atr', 'zone_strength', 'zone_fresh',
  'rr_primary', 'session_quality', 'range_aligned', 'structure_aligned', 'htf_aligned', 'quick_bias',
];
const GRADE_NUM = { 'A+': 4, A: 3, B: 2, C: 1, 'no-trade': 0 };

function featuresOf(cand, ctxMeta) {
  const L = cand.levels || {};
  const checks = new Map((cand.checks || []).map((c) => [c.key, c]));
  const sweep = (cand.checks || []).find((c) => c.key === 'sweep');
  const disp = (cand.checks || []).find((c) => c.key === 'displacement');
  return [
    (cand.score || 0) / 100,
    (GRADE_NUM[cand.grade] || 0) / 4,
    sweep && sweep.pass ? 0.5 : 0,
    disp && disp.pass ? 0.5 : 0,
    L.entry_kind === 'order_block' ? 0.7 : L.entry_kind === 'fvg' ? 0.4 : 0,
    checks.get('zone') && checks.get('zone').detail && /fresh/.test(checks.get('zone').detail) ? 1 : 0,
    clamp((L.rr_primary || 0) / 6, 0, 1),
    ctxMeta.session_quality || 0.4,
    checks.get('range') && checks.get('range').pass ? 1 : 0,
    checks.get('structure') && checks.get('structure').pass ? 1 : 0,
    checks.get('htf') && checks.get('htf').pass ? 1 : 0,
    ctxMeta.quick_bias != null ? clamp(ctxMeta.quick_bias / 100, -1, 1) : 0,
  ];
}

/* ------------------------------------------------------- forward simulation */

/**
 * Resolve one setup against the future candles, trading it the way the plan says:
 *   partial 50% at T1 -> stop to break-even -> runner to the final target.
 *
 * Conservative rules (no hindsight):
 *   - the fill bar itself is never used for stop/target decisions (a limit order
 *     touching both levels inside one bar has an unknowable path)
 *   - if a later bar touches both stop and target, the stop is assumed first
 *   - an unfilled limit is recorded as no_fill, never as a win
 *   - a small cost (spread/slippage/fees) is charged per trade
 */
function resolve(candles, fromIdx, cand, { maxForward = 250, fillWindow = 40, costR = 0.05 } = {}) {
  const L = cand.levels;
  if (!L) return null;
  const { entry, stop } = L;
  const ladder = L.targets || [];
  const t1 = ladder[0] ? ladder[0].price : null;
  const t2 = ladder[ladder.length - 1] && ladder.length > 1 ? ladder[ladder.length - 1].price : null;
  const long = L.dir > 0;
  const risk = Math.abs(entry - stop);
  const rr1 = t1 != null ? Math.abs(t1 - entry) / risk : 0;
  const rr2 = t2 != null ? Math.abs(t2 - entry) / risk : 0;

  let fillIdx = null;
  for (let j = fromIdx + 1; j < Math.min(candles.length, fromIdx + 1 + fillWindow); j++) {
    if (long ? candles[j].l <= entry : candles[j].h >= entry) { fillIdx = j; break; }
  }
  if (fillIdx === null) {
    const end = candles[Math.min(candles.length - 1, fromIdx + fillWindow)];
    const drift = ((end.c - entry) / risk) * (long ? 1 : -1);
    return { outcome: 'no_fill', fill: false, r: 0, managed_r: 0, raw_r: 0, rr1: r2(rr1), rr2: r2(rr2), mae: 0, mfe: 0, directional_r: r3(drift), bars: null, bars_to_fill: null, hit: {} };
  }

  let mae = 0, mfe = 0, booked = 0, halfOpen = true, beStop = stop, hitT1 = false, hitT2 = false, beHit = false;
  for (let j = fillIdx + 1; j < Math.min(candles.length, fillIdx + 1 + maxForward); j++) {
    const b = candles[j];
    const adverse = long ? (entry - b.l) : (b.h - entry);
    const favour = long ? (b.h - entry) : (entry - b.l);
    if (risk > 0) { mae = Math.min(mae, -adverse / risk); mfe = Math.max(mfe, favour / risk); }

    const hitStop = long ? b.l <= beStop : b.h >= beStop;
    const hitTarget1 = t1 != null ? (long ? b.h >= t1 : b.l <= t1) : false;
    const hitTarget2 = t2 != null ? (long ? b.h >= t2 : b.l <= t2) : false;

    if (halfOpen && hitStop) {
      const managed = -1 - costR;
      return { outcome: 'loss', fill: true, r: r3(managed), managed_r: r3(managed), raw_r: -1, rr1: r2(rr1), rr2: r2(rr2), mae: r3(mae), mfe: r3(mfe), bars: j - fillIdx, bars_to_fill: fillIdx - fromIdx, hit: { stop: true, t1: false, t2: false } };
    }
    if (halfOpen && hitTarget1) {
      booked += 0.5 * rr1; hitT1 = true; halfOpen = false; beStop = entry;
      if (t2 == null || !L.management || !L.management.runner_target) {
        const managed = booked - costR;
        return { outcome: managed > 0 ? 'win' : 'loss', fill: true, r: r3(managed), managed_r: r3(managed), raw_r: -costR, rr1: r2(rr1), rr2: r2(rr2), mae: r3(mae), mfe: r3(mfe), bars: j - fillIdx, bars_to_fill: fillIdx - fromIdx, hit: { t1: true } };
      }
      if (hitTarget2) {
        const managed = booked + 0.5 * rr2 - costR;
        return { outcome: 'win', fill: true, r: r3(managed), managed_r: r3(managed), raw_r: r3(rr2 - costR), rr1: r2(rr1), rr2: r2(rr2), mae: r3(mae), mfe: r3(mfe), bars: j - fillIdx, bars_to_fill: fillIdx - fromIdx, hit: { t1: true, t2: true } };
      }
      continue;
    }
    if (!halfOpen) {
      if ((long ? b.l <= beStop : b.h >= beStop) && !hitTarget2) {
        beHit = true;
        const managed = booked - costR; // runner scratched at break-even
        return { outcome: managed > 0 ? 'win' : 'loss', fill: true, r: r3(managed), managed_r: r3(managed), raw_r: -costR, rr1: r2(rr1), rr2: r2(rr2), mae: r3(mae), mfe: r3(mfe), bars: j - fillIdx, bars_to_fill: fillIdx - fromIdx, hit: { t1: true, be: true } };
      }
      if (hitTarget2) {
        const managed = booked + 0.5 * rr2 - costR;
        return { outcome: 'win', fill: true, r: r3(managed), managed_r: r3(managed), raw_r: r3(rr2 - costR), rr1: r2(rr1), rr2: r2(rr2), mae: r3(mae), mfe: r3(mfe), bars: j - fillIdx, bars_to_fill: fillIdx - fromIdx, hit: { t1: true, t2: true } };
      }
    }
  }
  // time stop: value whatever is open at the current price
  const last = candles[Math.min(candles.length - 1, fillIdx + maxForward)];
  const openR = (((last.c - entry) / risk) * (long ? 1 : -1));
  const managed = booked + (halfOpen ? openR : 0.5 * openR) - costR;
  return {
    outcome: managed > 0 ? 'win' : managed < 0 ? 'loss' : 'be', fill: true, r: r3(managed), managed_r: r3(managed), raw_r: r3(openR - costR),
    rr1: r2(rr1), rr2: r2(rr2), mae: r3(mae), mfe: r3(mfe), bars: maxForward, bars_to_fill: fillIdx - fromIdx,
    hit: { t1: hitT1, t2: hitT2, be: beHit, timeout: true },
  };
}

/* ------------------------------------------------------- exit management modes */

/**
 * How a trade is managed changes the hit-rate far more than the entry does, so the
 * backtest scores every setup under each management style the playlist teaches at
 * once — one candle walk, five outcomes:
 *
 *   video    50 % at T1 (the plan's first target) → stop to break-even → runner to T2
 *   half_1r  50 % at 1R                           → break-even → runner
 *   half_075 50 % at 0.75R                        → break-even → runner
 *   full_t1  the whole position at T1 (no runner)
 *   full_1r  the whole position at 1R (scalp management)
 *
 * The conservative resolution rules of `resolve()` are kept bar-for-bar: the fill bar
 * never decides the outcome, a bar that touches both the stop and a target counts as
 * the stop, and an unfilled limit stays a no_fill — never a win.
 */
const PROFILES = [
  { key: 'video', label: 'Video plan — 50 % at T1, stop to break-even, runner to the final target', kind: 'scale', partial: 't1' },
  { key: 'half_1r', label: '50 % at 1R, stop to break-even, runner to the final target', kind: 'scale', partial: 1 },
  { key: 'half_075', label: '50 % at 0.75R, stop to break-even, runner to the final target', kind: 'scale', partial: 0.75 },
  { key: 'full_t1', label: 'Whole position at T1 (no runner)', kind: 'full', partial: 't1' },
  { key: 'full_1r', label: 'Whole position at 1R (scalp management)', kind: 'full', partial: 1 },
  { key: 'hold_t2', label: 'No management — hold the whole position to the final target', kind: 'full', partial: 'runner' },
];
const PROFILE_KEYS = PROFILES.map((p) => p.key);

/** Every gate the playlist demands before a sniper entry is valid. */
const SNIPER_GATES = ['sweep', 'displacement', 'zone', 'range', 'structure', 'htf', 'bias', 'session', 'news', 'runway', 'entry', 'entry_valid'];
const CORE_GATES = ['sweep', 'displacement', 'zone', 'runway', 'entry', 'entry_valid'];
const QUALITY_GATES = ['htf', 'range', 'session', 'news', 'structure', 'bias'];
const GATE_LABELS = {
  sweep: 'Liquidity swept first (the trigger)',
  displacement: 'Displacement leg in your direction',
  zone: 'Order block / FVG to enter from',
  range: 'Entry in discount (long) / premium (short)',
  structure: 'Internal structure agrees',
  htf: 'Higher-timeframe trend agrees',
  bias: 'Multi-timeframe indicator bias agrees',
  session: 'Inside a killzone',
  news: 'No high-impact news in the window',
  runway: 'Runway to opposing liquidity ≥ 1:2',
  entry: 'Entry not chased',
  entry_valid: 'Zone not already invalidated',
  stop_ge_06atr: 'Stop at least 0.6 × ATR away (cost floor — measured)',
  runway3: 'First target at least 3R away (runway — measured)',
};

function gatesOf(cand) {
  const g = {};
  for (const c of ((cand && cand.checks) || [])) g[c.key] = !!c.pass;
  // 'entry_valid' is only ever *added* to the checklist when the zone is invalidated,
  // so an absent check means the zone is fine — without this default every filter that
  // includes the gate came out empty.
  if (g.entry_valid === undefined) g.entry_valid = !(cand && cand.levels && cand.levels.entry_status === 'invalid');
  if (cand && cand.levels && cand.levels.entry_status === 'invalid') g.entry_valid = false;
  /* Two gates that are not in the playlist's checklist but are in every
   * configuration that survived out-of-sample measurement (see
   * docs/MEASURED-RULES.md, 2026-10-06):
   *   a minimum stop distance, because a stop inside the noise band is hit by
   *   noise and its costs eat the trade — and a first target far enough away to
   *   pay for the stop. */
  const L = (cand && cand.levels) || {};
  g.stop_ge_06atr = Number(L.risk_atr) >= 0.6;
  g.runway3 = Number(L.rr_primary) >= 3;
  return g;
}
const hasGates = (sample, keys) => keys.every((k) => sample.gates && sample.gates[k]);
const passesSniper = (sample) => hasGates(sample, SNIPER_GATES);

/** Win rate and expectancy of one management profile across a sample list. */
function profileMetrics(list, key) {
  const rows = list.map((s) => s.profiles && s.profiles[key]).filter((x) => x && x.outcome !== 'no_fill');
  const n = rows.length;
  if (!n) return { key, label: (PROFILES.find((p) => p.key === key) || {}).label || key, trades: 0, wins: 0, win_rate: null, first_hit_rate: null, expectancy_r: null, best_r: null, worst_r: null };
  const wins = rows.filter((x) => x.win).length;
  const firsts = rows.filter((x) => x.first_hit).length;
  const rs = rows.map((x) => x.r);
  const sum = rs.reduce((a, r) => a + r, 0);
  return {
    key,
    label: (PROFILES.find((p) => p.key === key) || {}).label || key,
    trades: n, wins,
    win_rate: r2((wins / n) * 100),
    first_hit_rate: r2((firsts / n) * 100),
    expectancy_r: r2(sum / n),
    best_r: r2(Math.max(...rs)),
    worst_r: r2(Math.min(...rs)),
  };
}

function resolveProfiles(candles, fromIdx, cand, { maxForward = 250, fillWindow = 40, costR = null, fillAt = null, spec = null, costModel = 'instrument' } = {}) {
  const L = cand && cand.levels;
  const out = { fill: false, profiles: {}, mae: 0, mfe: 0, bars_to_fill: null, rr_t1: null, rr_t2: null };
  if (!L || !(L.risk > 0)) return out;

  const { entry, stop } = L;
  const long = L.dir > 0;
  const risk = Math.abs(entry - stop);
  const cR = costR != null ? costR : costFor(spec, entry, stop, costModel);
  costR = cR;
  const ladder = L.targets || [];
  const t1 = ladder[0] ? ladder[0].price : null;
  const t2 = ladder.length > 1 ? ladder[ladder.length - 1].price : null;
  const rrT1 = t1 != null ? Math.abs(t1 - entry) / risk : null;
  const rrT2 = t2 != null ? Math.abs(t2 - entry) / risk : null;
  out.rr_t1 = rrT1 == null ? null : r2(rrT1);
  out.rr_t2 = rrT2 == null ? null : r2(rrT2);

  let fillIdx = fillAt != null ? fillAt : null;
  if (fillIdx === null) {
    for (let j = fromIdx + 1; j < Math.min(candles.length, fromIdx + 1 + fillWindow); j++) {
      if (long ? candles[j].l <= entry : candles[j].h >= entry) { fillIdx = j; break; }
    }
  }
  if (fillIdx === null || fillIdx >= candles.length) {
    for (const p of PROFILES) out.profiles[p.key] = { r: 0, outcome: 'no_fill', win: 0, first_hit: 0, first_r: null, hit: {} };
    return out;
  }
  out.fill = true;
  out.bars_to_fill = fillIdx - fromIdx;

  const state = {};
  for (const p of PROFILES) {
    const firstPrice = p.partial === 't1' ? t1
      : p.partial === 'runner' ? t2
        : p.partial == null ? null
          : entry + (long ? 1 : -1) * risk * p.partial;
    const firstRR = firstPrice != null && risk > 0 ? Math.abs(firstPrice - entry) / risk : null;
    const targetPrice = p.kind === 'full' ? (firstPrice != null ? firstPrice : t1) : null;
    const targetRR = p.kind === 'full' ? (firstRR != null ? firstRR : rrT1) : null;
    state[p.key] = {
      def: p, stop, booked: 0, halfOpen: true, done: false, hit: {},
      firstPrice, firstRR, runnerTarget: t2, runnerRR: rrT2, targetPrice, targetRR,
    };
  }

  const last = Math.min(candles.length - 1, fillIdx + maxForward);
  for (let j = fillIdx + 1; j <= last; j++) {
    const b = candles[j];
    const adverse = long ? (entry - b.l) : (b.h - entry);
    const favour = long ? (b.h - entry) : (entry - b.l);
    if (risk > 0) { out.mae = Math.min(out.mae, -adverse / risk); out.mfe = Math.max(out.mfe, favour / risk); }

    for (const key of PROFILE_KEYS) {
      const st = state[key];
      if (!st || st.done) continue;
      const touched = (price) => (long ? b.h >= price : b.l <= price);
      const through = (price) => (long ? b.l <= price : b.h >= price);

      // stop is checked first: a bar that trades both levels is assumed to have stopped us out
      if (st.halfOpen && through(st.stop)) {
        st.done = true;
        out.profiles[key] = { r: r3(-1 - costR), outcome: 'loss', win: 0, first_hit: 0, first_r: st.firstRR == null ? null : r2(st.firstRR), hit: { stop: true } };
        continue;
      }
      if (!st.halfOpen && through(st.stop)) {           // break-even stop on the runner
        st.done = true;
        const r = st.booked - costR;
        out.profiles[key] = { r: r3(r), outcome: r > 0 ? 'win' : r < 0 ? 'loss' : 'be', win: r > 0 ? 1 : 0, first_hit: 1, first_r: st.firstRR == null ? null : r2(st.firstRR), hit: Object.assign({}, st.hit, { be: true }) };
        continue;
      }
      if (st.def.kind === 'full') {
        if (st.targetPrice != null && touched(st.targetPrice)) {
          st.done = true;
          const r = (st.targetRR || 0) - costR;
          out.profiles[key] = { r: r3(r), outcome: r > 0 ? 'win' : 'loss', win: r > 0 ? 1 : 0, first_hit: 1, first_r: st.firstRR == null ? null : r2(st.firstRR), hit: { first: true } };
        }
        continue;
      }
      if (st.halfOpen && st.firstPrice != null && touched(st.firstPrice)) {
        st.booked += 0.5 * st.firstRR;
        st.hit = { first: true };
        if (st.runnerTarget == null) {
          st.done = true;
          const r = st.booked - costR;
          out.profiles[key] = { r: r3(r), outcome: r > 0 ? 'win' : 'loss', win: r > 0 ? 1 : 0, first_hit: 1, first_r: r2(st.firstRR), hit: st.hit };
          continue;
        }
        st.halfOpen = false;
        st.stop = entry;                                // stop to break-even
        if (touched(st.runnerTarget)) {
          st.done = true;
          const r = st.booked + 0.5 * (st.runnerRR || 0) - costR;
          out.profiles[key] = { r: r3(r), outcome: 'win', win: 1, first_hit: 1, first_r: r2(st.firstRR), hit: Object.assign({}, st.hit, { runner: true }) };
        }
        continue;
      }
      if (!st.halfOpen && st.runnerTarget != null && touched(st.runnerTarget)) {
        st.done = true;
        const r = st.booked + 0.5 * (st.runnerRR || 0) - costR;
        out.profiles[key] = { r: r3(r), outcome: 'win', win: 1, first_hit: 1, first_r: st.firstRR == null ? null : r2(st.firstRR), hit: Object.assign({}, st.hit, { runner: true }) };
      }
    }
    if (PROFILE_KEYS.every((k) => !state[k] || state[k].done)) break;
  }

  // time stop: value whatever is still open at the last close
  const closeR = (((candles[last].c - entry) / risk) * (long ? 1 : -1));
  for (const key of PROFILE_KEYS) {
    const st = state[key];
    if (!st || st.done) continue;
    const openPart = st.halfOpen ? 1 : 0.5;
    const r = st.booked + openPart * closeR - costR;
    out.profiles[key] = { r: r3(r), outcome: r > 0 ? 'win' : r < 0 ? 'loss' : 'be', win: r > 0 ? 1 : 0, first_hit: st.halfOpen ? 0 : 1, first_r: st.firstRR == null ? null : r2(st.firstRR), hit: { timeout: true } };
  }
  return out;
}

/* ------------------------------------------- multi-timeframe (refined) entry
 * The playlist's actual entry procedure: the higher timeframe decides *where*
 * (zone, bias, targets) and the lower timeframe decides *when* — you only fire
 * after the LTF sweeps local liquidity and prints a displacement candle in your
 * direction while price is inside the HTF zone. Everything below keeps the HTF
 * stop and targets, so the only thing that changes is the moment and price of
 * the entry (a market fill at the confirmation close, not a limit at the mid).
 */

const MTF_ENTRY_PAIRS = { '3m': '1m', '5m': '1m', '15m': '5m', '30m': '15m', '1h': '15m', '4h': '1h', '1d': '4h', '1w': '1d' };

/** Simple mean-range ATR over raw candles (no indicator dependency here). */
function rollingAtr(candles, idx, period = 14) {
  const from = Math.max(1, idx - period + 1);
  let sum = 0, n = 0;
  for (let k = from; k <= idx; k++) { sum += candles[k].h - candles[k].l; n++; }
  return n ? sum / n : 0;
}

/**
 * Re-anchor an HTF candidate's levels on a lower-timeframe confirmation price.
 * Same math the backtest uses, so the live plan and the measured plan agree.
 */
function refinePlan(cand, price, atr) {
  const L0 = (cand && cand.levels) || {};
  const risk = Math.abs(price - L0.stop);
  if (!(risk > 0)) return null;
  const targets = (L0.targets || []).map((t) => ({ ...t, rr: r2(Math.abs(t.price - price) / risk) }));
  const moved = targets.filter((t) => t.rr >= 0.9);
  return {
    ...L0,
    entry: r4(price), risk: r4(risk), risk_atr: r2(risk / (atr || 1)),
    entry_mode: 'mtf', entry_shift_atr: r2(Math.abs(price - L0.entry) / (atr || 1)),
    targets, rr_primary: moved[0] ? moved[0].rr : null, rr_final: moved.length ? moved[moved.length - 1].rr : null,
  };
}

/**
 * First lower-timeframe bar where the refined entry fires.
 * @returns {{t:number, price:number, bar:number, atr:number}|null}
 */
function mtfTrigger(cand, ltf, fromT, { sweepLookback = 20, sweepFresh = 10 } = {}) {
  const L = cand && cand.levels;
  if (!L || !L.entry_zone || !ltf || !ltf.length) return null;
  const [bot, top] = L.entry_zone;
  const long = L.dir > 0;
  let start = 0;
  while (start < ltf.length && ltf[start].t < fromT) start++;
  for (let k = Math.max(sweepLookback + sweepFresh, start); k < ltf.length; k++) {
    const b = ltf[k];
    const inside = long ? (b.l <= top && b.h >= bot) : (b.h >= bot && b.l <= top);
    if (!inside) continue;
    const range = b.h - b.l, body = Math.abs(b.c - b.o);
    const atr = rollingAtr(ltf, k - 1, 14) || range;
    if (!(range > 0 && (long ? b.c > b.o : b.c < b.o) && body / range >= 0.55 && range >= 1.2 * atr)) continue;
    const priorFrom = k - sweepFresh - sweepLookback, priorTo = k - sweepFresh;
    if (priorFrom < 0) continue;
    let priorExt = long ? Infinity : -Infinity;
    for (let j = priorFrom; j < priorTo; j++) priorExt = long ? Math.min(priorExt, ltf[j].l) : Math.max(priorExt, ltf[j].h);
    let swept = false;
    for (let j = priorTo; j <= k && !swept; j++) swept = long ? ltf[j].l < priorExt : ltf[j].h > priorExt;
    if (!swept) continue;
    return { t: b.t, price: b.c, bar: k, atr };
  }
  return null;
}

/* --------------------------------------------------- entry-depth variants
 * NOT FROM THE PLAYLIST (M114): this comment previously cited "ep. 24/32". Neither
 * episode contains this rule — ep. 24 is guardrail/behaviour scoring and ep. 32 is the
 * Mark Douglas trading-psychology material. The deeper-retrace refinement is a reasonable
 * analysis in its own right and stays; the false provenance does not.
 * The idea: don't take the first touch of the zone — wait for price to retrace deeper into
 * it, so the same structural stop sits closer and a 0.5–0.75R win becomes a smaller move.
 * This re-prices the same
 * candidate at the zone midpoint or its far edge without touching the setup model,
 * so "enter deeper" can be measured instead of argued about.
 */
/** The playlist's OTE entry: the 50–79 % retrace band of the last displacement leg. */
function oteEntryFor(cand, ctx) {
  const L = cand && cand.levels;
  if (!L || !ctx || !ctx.leg || !(L.risk > 0)) return null;
  const leg = ctx.leg;
  if (leg.dir !== L.dir || !(leg.high > leg.low)) return null;
  const band = long_band(leg, L.dir);
  if (!(band.hi > band.lo)) return null;
  const long = L.dir > 0;
  if (L.entry >= band.lo && L.entry <= band.hi) {
    return { price: L.entry, inside: true, band: [r4(band.lo), r4(band.hi)], price_ok: otePriceOk(L.entry, band) };
  }
  // already deeper than the band (better price than the refinement asks for) → leave the plan alone
  if (long ? L.entry < band.lo : L.entry > band.hi) {
    return { price: L.entry, inside: false, better_than_band: true, band: [r4(band.lo), r4(band.hi)], price_ok: true };
  }
  // shallower than the band → wait for the retrace into it (deeper entry, tighter risk)
  const price = long ? band.hi : band.lo;
  const risk = Math.abs(price - L.stop);
  if (!(risk > 0) || risk / (ctx.atr || 1) < 0.2) return null;      // a stop that close is noise, not a plan
  const targets = (L.targets || []).map((t) => ({ ...t, rr: r2(Math.abs(t.price - price) / risk) }));
  const moved = targets.filter((t) => t.rr >= 0.9);
  return {
    price: r4(price), inside: false, band: [r4(band.lo), r4(band.hi)], price_ok: otePriceOk(price, band),
    risk: r4(risk), risk_atr: r2(risk / (ctx.atr || 1)),
    rr_primary: moved[0] ? moved[0].rr : null, rr_final: moved.length ? moved[moved.length - 1].rr : null,
    shift_atr: r2(Math.abs(price - L.entry) / (ctx.atr || 1)), targets,
  };
}

/** A good OTE entry sits in the upper half of a pullback band (deep retrace, not the edge). */
function otePriceOk(price, band) {
  const span = band.hi - band.lo;
  if (!(span > 0)) return false;
  const pos = (band.hi - price) / span;                 // 0 = shallow edge, 1 = deep edge
  return pos >= 0.2 && pos <= 0.8;
}

function withEntryDepth(cand, mode, atr, ctx) {
  const L = cand && cand.levels;
  if (!L || !L.entry_zone || L.entry_zone.length !== 2) return null;
  const [bot, top] = L.entry_zone;
  const long = L.dir > 0;
  const mid = (bot + top) / 2;
  let target;
  if (mode === 'leg' || mode === 'ote') {
    const o = oteEntryFor(cand, ctx);
    if (!o) return null;                                // no displacement leg to measure a retrace against
    if (mode === 'leg') {                               // isolate the filter from the entry price
      return { ...cand, levels: { ...L, entry_ote: o.inside ? 1 : 0, entry_band: o.band, entry_shift_atr: 0, entry_mode: 'leg' } };
    }
    // already inside the band, deeper than it, or the same price → keep the plan, just tag it
    if (o.inside || o.better_than_band || Math.abs(o.price - L.entry) < 1e-9) {
      return { ...cand, levels: { ...L, entry_ote: o.inside ? 1 : 0, entry_band: o.band, entry_shift_atr: 0, entry_mode: 'ote' } };
    }
    target = o.price;
  } else {
    target = mode === 'deep' ? (long ? bot : top) : mode === 'mid' ? mid : L.entry;
  }
  if (target == null || Math.abs(target - L.entry) < 1e-9) return null;      // identical → nothing to test
  const risk = Math.abs(target - L.stop);
  if (!(risk > 0)) return null;
  const targets = (L.targets || []).map((t) => ({ ...t, rr: r2(Math.abs(t.price - target) / risk) }));
  const moved = targets.filter((t) => t.rr >= 0.9);
  return {
    ...cand,
    levels: {
      ...L,
      entry: r4(target),
      risk: r4(risk),
      risk_atr: r2(risk / (atr || 1)),
      entry_mode: mode,
      entry_shift_atr: r2(Math.abs(target - L.entry) / (atr || 1)),
      entry_ote: mode === 'ote' ? 1 : (cand.levels && cand.levels.entry_ote) || 0,
      targets,
      rr_primary: moved[0] ? moved[0].rr : null,
      rr_final: moved.length ? moved[moved.length - 1].rr : null,
    },
  };
}

/* ---------------------------------------------- playlist refinement signals
 * Episode-by-episode the playlist narrows entries with the same handful of
 * confirmations: trade with the 50 EMA, let MACD agree, enter in the premium or
 * discount half of the displacement leg (the "OTE" pullback), and only take
 * setups whose sweep is fresh. These are computed per candidate so they can be
 * measured like everything else instead of being asserted.
 */
function windowSignals(win, analysis, atr) {
  const closes = win.map((x) => x.c);
  const n = closes.length;
  const out = { ema50: null, macd_hist: null, leg: null, sweep_bars: null };
  if (n >= 60 && atr > 0) {
    const ema50 = Ind.ema(closes, 50);
    const e12 = Ind.ema(closes, 12);
    const e26 = Ind.ema(closes, 26);
    out.ema50 = ema50;
    out.macd = e12 != null && e26 != null ? e12 - e26 : null;
    out.macd_hist = out.macd;
    out.ema_slope = ema50 != null && n >= 55 ? ema50 - Ind.ema(closes.slice(0, n - 5), 50) : 0;
    out.atr = atr;
    // most recent displacement leg (the "engine" candle) in the window
    for (let i = n - 1; i >= Math.max(1, n - 30); i--) {
      const b = win[i];
      const range = b.h - b.l, body = Math.abs(b.c - b.o);
      if (range > 0 && body / range >= 0.55 && range / atr >= 1.2) {
        out.leg = { dir: b.c > b.o ? 1 : -1, low: Math.min(b.o, b.c, b.l), high: Math.max(b.o, b.c, b.h), i, bars_ago: n - 1 - i };
        break;
      }
    }
    // bars since the liquidity sweep the model is working from
    const prior = win.slice(-46, -26), tail = win.slice(-26);
    if (prior.length >= 10) {
      const hi = Math.max(...prior.map((b) => b.h)), lo = Math.min(...prior.map((b) => b.l));
      for (let i = tail.length - 1; i >= 0; i--) {
        if (tail[i].h > hi || tail[i].l < lo) { out.sweep_bars = tail.length - 1 - i; break; }
      }
    }
  }
  return out;
}

/** How one candidate lines up with those confirmations. */
function candidateSignals(cand, ctx) {
  const L = cand.levels || {};
  const dir = L.dir || cand.dir || 0;
  const out = { dir, ema50_align: 0, macd_align: 0, ote: 0, dist_ema_atr: null, sweep_bars: ctx ? ctx.sweep_bars : null, leg_bars: ctx && ctx.leg ? ctx.leg.bars_ago : null, leg_align: 0, entry_kind: L.entry_kind || null };
  if (!ctx || !L.entry) return out;
  if (ctx.ema50 != null) {
    const above = L.entry > ctx.ema50;
    out.ema50_align = ((dir > 0 && above && (ctx.ema_slope || 0) >= 0) || (dir < 0 && !above && (ctx.ema_slope || 0) <= 0)) ? 1 : 0;
    out.dist_ema_atr = r2(Math.abs(L.entry - ctx.ema50) / (ctx.atr || 1));
  }
  if (ctx.macd_hist != null) out.macd_align = ((dir > 0 && ctx.macd_hist > 0) || (dir < 0 && ctx.macd_hist < 0)) ? 1 : 0;
  const leg = ctx.leg;
  if (leg && leg.dir === dir && leg.high > leg.low) {
    out.leg_align = 1;
    const band = long_band(leg, dir);   // 50 % – 79 % retrace of the leg
    out.ote = L.entry >= band.lo && L.entry <= band.hi ? 1 : 0;
  }
  return out;
}
function long_band(leg, dir) {
  const span = leg.high - leg.low;
  return dir > 0
    ? { lo: leg.high - 0.79 * span, hi: leg.high - 0.5 * span }     // discount half of an up-leg
    : { lo: leg.low + 0.5 * span, hi: leg.low + 0.79 * span };      // premium half of a down-leg
}

/* --------------------------------------------------- second-chance re-entry
 * NOT FROM THE PLAYLIST (M114): previously cited "ep. 32", which does not contain this
 * rule. The re-entry behaviour is measured, not prescribed — if the zone stops you out
 * without reaching the first target,
 * price often comes back to the same level — a "second chance" entry. This walks
 * the same candle series and reports, honestly, what taking that second tap did:
 * whether it happened, and whether re-risking 1R on it made money.
 */
function secondChance(candles, fromIdx, cand, { maxForward = 250, fillWindow = 40, costR = null, fillAt = null, spec = null, costModel = 'instrument' } = {}) {
  const L = cand && cand.levels;
  if (!L || !(L.risk > 0)) return null;
  const { entry, stop } = L;
  const long = L.dir > 0;
  const risk = Math.abs(entry - stop);
  const cR = costR != null ? costR : costFor(spec, L.entry, L.stop, costModel);
  const t1 = L.targets && L.targets[0] ? L.targets[0].price : null;

  let fillIdx = fillAt != null ? fillAt : null;
  if (fillIdx === null) {
    for (let j = fromIdx + 1; j < Math.min(candles.length, fromIdx + 1 + fillWindow); j++) {
      if (long ? candles[j].l <= entry : candles[j].h >= entry) { fillIdx = j; break; }
    }
  }
  if (fillIdx === null || fillIdx >= candles.length) return null;
  const limit = Math.min(candles.length - 1, fillIdx + maxForward);

  // attempt 1: which came first — the stop or the first target?
  let stopIdx = null, first = null;
  for (let j = fillIdx + 1; j <= limit; j++) {
    const b = candles[j];
    if (long ? b.l <= stop : b.h >= stop) { stopIdx = j; first = 'loss'; break; }
    if (t1 != null && (long ? b.h >= t1 : b.l <= t1)) { first = 'first_target'; break; }
  }
  if (first === null) first = 'time_stop';
  if (first !== 'loss') return { first, retap: false, retap_bars: null, second: null, first_r: first === 'first_target' ? null : r3((((candles[limit].c - entry) / risk) * (long ? 1 : -1)) - costR) };

  // second tap of the same level after the stop
  let retapIdx = null;
  for (let j = stopIdx + 1; j <= limit; j++) {
    if (long ? candles[j].l <= entry : candles[j].h >= entry) { retapIdx = j; break; }
  }
  const out = { first: 'loss', first_r: r3(-1 - costR), retap: retapIdx !== null, retap_bars: retapIdx === null ? null : retapIdx - stopIdx, second: null };
  if (retapIdx === null || retapIdx >= candles.length - 2) return out;
  // attempt 2: enter on the re-tap, same stop and targets, same video-plan management
  const sim2 = resolve(candles, retapIdx - 1, cand, { maxForward: Math.max(10, limit - retapIdx), fillWindow: 1, costR });
  if (sim2 && sim2.fill) out.second = { r: sim2.managed_r, outcome: sim2.outcome, mae: sim2.mae, mfe: sim2.mfe };
  return out;
}

/* ------------------------------------------------------- exit / target sweep
 * The profile simulator above answers "what if I trade it like Brad does?".
 * This answers the follow-up every trader asks: "what if I bank earlier / later?"
 *
 * One candle walk records *when* each R-multiple was first touched, when the stop
 * was hit and when price came back to the entry, then every exit plan is derived
 * from that timeline. Same conservative rules as resolveProfiles:
 *   · a bar that touches both the stop and a target counts as the stop
 *   · a bar that touches the break-even stop and the runner target counts as BE
 *   · an unfilled limit never becomes a trade
 * Every row also carries the win rate you would need just to break even at that
 * reward, so a high win rate at a tiny target is never confused with an edge.
 */

const MIN_RISK_ATR = Number(process.env.MIN_RISK_ATR || 0.25); // stops closer than this to price are noise, not risk
const FLAT_TARGETS = [0.15, 0.25, 0.35, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

/* ---------------------------------------------------------------------------
 * Measured rule book.  scripts/rule-sweep.js sweeps every (filter × minimum
 * stop distance × minimum first-target R × exit target) combination over a
 * 70/30 time split on 24 markets and writes docs/MEASURED-RULES.json.  The app
 * reads that file so the presets it offers carry their own measured provenance
 * instead of an opinion.  Everything degrades to a neutral default if the file
 * is missing.
 * ------------------------------------------------------------------------- */
/**
 * Which frontier view the app shows first.  The measured maximum-expectancy
 * shape wins when it has a real sample; otherwise the unfiltered view is shown
 * rather than a thin-sample banner.  Cached backtests predate this field, so it
 * is recomputed from the stored views on the way out of the cache.
 */
function defaultViewOf(bt) {
  const v = (bt && bt.frontier_views) || {};
  if (v.full && (v.full.trades || 0) >= 10) return 'full';
  return 'all';
}

function measuredRules() {
  // require() first: serverless bundlers trace it, so the measured rule book
  // ships inside the Vercel function instead of resolving only on a full checkout
  try { return require('../../docs/MEASURED-RULES.json'); } catch (e) { /* fall through */ }
  try {
    return JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'docs', 'MEASURED-RULES.json'), 'utf8'));
  } catch (e) { return null; }
}
const MEASURED = measuredRules();
const MEASURED_AT = MEASURED ? MEASURED.generated_at : null;

/** The exit ladder for one market's own samples: win rate vs expectancy. */
function targetFrontier(samples) {
  const rows = samples.filter((s) => s.sweep && s.sweep.fill);
  if (!rows.length) return [];
  const cost = rows.reduce((a, s) => a + (s.sweep.cost_r || 0), 0) / rows.length;
  return [0.25, 0.5, 0.75, 1, 1.5, 2, 3].map((x) => {
    let n = 0, hit = 0, win = 0, clean = 0, sum = 0;
    rows.forEach((s) => {
      const tb = s.sweep.t_bar || {};
      let r;
      if (tb[x] !== undefined) { r = x - (s.sweep.cost_r || 0); hit++; }
      else if (s.sweep.stopped) r = -1 - (s.sweep.cost_r || 0);
      else r = (s.sweep.close_r || 0) - (s.sweep.cost_r || 0);
      n++; if (r > 0) win++; if (r >= 0.5) clean++; sum += r;
    });
    return {
      target_r: x, trades: n,
      hit_pct: r2((hit / n) * 100), net_win_pct: r2((win / n) * 100), clean_pct: r2((clean / n) * 100),
      expectancy_r: r2(sum / n), breakeven_pct: r2(((1 + cost) / (1 + x)) * 100), cost_r: r3(cost),
    };
  });
}

/** Same, but restricted to samples that pass a set of gates (the filter view). */
function frontierFor(samples, gateKeys, test) {
  const rows = samples.filter((s) => s.sweep && s.sweep.fill && hasGates(s, gateKeys) && (!test || test(s)));
  if (rows.length < 25) return { trades: rows.length, rows: [], note: rows.length ? 'Too few trades to measure a curve (needs 25+).' : 'No trade passes this filter in this market.' };
  return { trades: rows.length, rows: targetFrontier(rows) };
}
const SCALE_PLANS = [
  { key: 'half_05_run1', label: 'bank 50 % at 0.5R → break-even → runner to 1R', part: 0.5, partial: 0.5, runner: 1 },
  { key: 'half_05_run15', label: 'bank 50 % at 0.5R → break-even → runner to 1.5R', part: 0.5, partial: 0.5, runner: 1.5 },
  { key: 'half_05_run2', label: 'bank 50 % at 0.5R → break-even → runner to 2R', part: 0.5, partial: 0.5, runner: 2 },
  { key: 'half_06_run15', label: 'bank 50 % at 0.6R → break-even → runner to 1.5R', part: 0.5, partial: 0.6, runner: 1.5 },
  { key: 'half_075_run2', label: 'bank 50 % at 0.75R → break-even → runner to 2R', part: 0.5, partial: 0.75, runner: 2 },
  { key: 'half_1_run2', label: 'bank 50 % at 1R → break-even → runner to 2R', part: 0.5, partial: 1, runner: 2 },
];
const COST_R = 0.05;   // fallback when no instrument spec is available (kept for reproducibility)
const COST_MODELS = ['instrument', 'flat'];

/**
 * The instrument record that drives the cost model.  Presets cover the 57
 * curated symbols; anything else is classified from its ticker shape so a user
 * can paste an arbitrary market and still be charged something honest.
 */
function specFor(symbol) {
  const sym = String(symbol || '').toUpperCase();
  const hit = I.PRESETS.find((x) => x.symbol === sym);
  if (hit) return hit;
  if (/USDT$|USDC$|PERP$/.test(sym)) return { symbol: sym, asset_class: 'crypto', pip_size: 0.01 };
  if (/^[A-Z]{6}$/.test(sym)) return { symbol: sym, asset_class: 'forex', pip_size: 0.0001 };
  if (/^(ES|NQ|YM|RTY|GC|SI|CL|NG|ZB|ZN|6E|6B|MES|MNQ|MGC)/.test(sym)) return { symbol: sym, asset_class: 'futures', pip_size: 0.25 };
  return { symbol: sym, asset_class: 'stocks', pip_size: 0.01 };
}

/** Cost of one trade in R.  Instrument model by default, flat override for A/B. */
function costFor(spec, entry, stop, model = 'instrument', flat = COST_R) {
  if (model === 'flat') return flat;
  try {
    const r = I.costR(spec || {}, entry, stop, { price: entry });
    return r == null || !isFinite(r) || r <= 0 ? flat : r3(r);
  } catch (e) { return flat; }
}

/** Walk one candidate and record the exit timeline every plan is derived from. */
function sweepExits(candles, fromIdx, cand, { maxForward = 250, fillWindow = 40, costR = null, fillAt = null, spec = null, costModel = 'instrument' } = {}) {
  const L = cand && cand.levels;
  const out = { fill: false, bars_to_fill: null, mae: 0, mfe: 0, stopped: false, timed_out: false, close_r: null, t_bar: {}, be_bar: null, stop_bar: null, rr_t1: null, rr_t2: null };
  if (!L || !(L.risk > 0)) return out;
  const { entry, stop } = L;
  const long = L.dir > 0;
  const risk = Math.abs(entry - stop);
  const cR = costR != null ? costR : costFor(spec, entry, stop, costModel);

  let fillIdx = fillAt != null ? fillAt : null;
  if (fillIdx === null) {
    for (let j = fromIdx + 1; j < Math.min(candles.length, fromIdx + 1 + fillWindow); j++) {
      if (long ? candles[j].l <= entry : candles[j].h >= entry) { fillIdx = j; break; }
    }
  }
  if (fillIdx === null || fillIdx >= candles.length) return out;
  out.fill = true;
  out.bars_to_fill = fillIdx - fromIdx;

  const last = Math.min(candles.length - 1, fillIdx + maxForward);
  let endIdx = last;
  for (let j = fillIdx + 1; j <= last; j++) {
    const b = candles[j];
    const adverse = long ? (entry - b.l) : (b.h - entry);
    const favour = long ? (b.h - entry) : (entry - b.l);
    out.mae = Math.min(out.mae, -adverse / risk);
    out.mfe = Math.max(out.mfe, favour / risk);
    if (long ? b.l <= stop : b.h >= stop) { out.stop_bar = j; out.stopped = true; endIdx = j; break; }
    if (long ? b.l <= entry : b.h >= entry) { if (out.be_bar === null) out.be_bar = j; }
    for (const x of FLAT_TARGETS) {
      if (out.t_bar[x] === undefined && (long ? b.h >= entry + x * risk : b.l <= entry - x * risk)) out.t_bar[x] = j;
    }
  }
  const closeR = ((candles[endIdx].c - entry) / risk) * (long ? 1 : -1);
  out.close_r = r3(closeR);
  out.timed_out = !out.stopped && endIdx === last;
  out.cost_r = r3(cR);
  return out;
}

/** Turn a sweep timeline into the outcome of one exit plan. */
function sweepOutcome(sw, plan, costR = null) {
  const cR = costR != null ? costR : (sw && sw.cost_r != null ? sw.cost_r : COST_R);
  costR = cR;
  if (!sw || !sw.fill) return { r: 0, win: 0, outcome: 'no_fill' };
  const r0 = (v) => r3(v);
  if (plan.kind === 'flat') {
    const x = plan.target;
    if (sw.t_bar[x] !== undefined) {
      const r = x - costR;
      return { r: r0(r), win: 1, outcome: 'win', exit: `${x}R target`, bars: sw.t_bar[x] };
    }
    if (sw.stopped) return { r: r0(-1 - costR), win: 0, outcome: 'loss', exit: 'stop', bars: sw.stop_bar };
    const r = (sw.close_r || 0) - costR;
    return { r: r0(r), win: r > 0 ? 1 : 0, outcome: r > 0 ? 'win' : r < 0 ? 'loss' : 'be', exit: 'time stop', bars: null };
  }
  // scale-out: bank `part` at `partial` R, stop to break-even, runner to `runner` R
  const { part, partial, runner } = plan;
  const pb = sw.t_bar[partial];
  if (pb === undefined) {                                  // the partial never filled → whole position takes the stop
    return sw.stopped
      ? { r: r0(-1 - costR), win: 0, outcome: 'loss', exit: 'stop before the first target', bars: sw.stop_bar }
      : (() => { const r = (sw.close_r || 0) - costR; return { r: r0(r), win: r > 0 ? 1 : 0, outcome: r > 0 ? 'win' : r < 0 ? 'loss' : 'be', exit: 'time stop before the first target', bars: null }; })();
  }
  const tRunner = sw.t_bar[runner];
  const runnerHit = tRunner !== undefined && (sw.be_bar === null || tRunner < sw.be_bar);
  let runnerR, exit;
  if (runnerHit) { runnerR = runner; exit = `runner to ${runner}R`; }
  else if (sw.be_bar !== null && sw.be_bar > pb) { runnerR = 0; exit = 'runner scratched at break-even'; }
  else { runnerR = sw.close_r || 0; exit = 'runner closed on the time stop'; }
  const r = part * partial + (1 - part) * runnerR - costR;
  return { r: r0(r), win: r > 0 ? 1 : 0, outcome: r > 0 ? 'win' : r < 0 ? 'loss' : 'be', exit, bars: runnerHit ? tRunner : sw.be_bar };
}

/** Aggregate one exit plan across a set of samples. */
function exitStats(list, plan, costR = null) {
  const rows = list.map((s) => sweepOutcome(s.sweep, plan, costR)).filter((x) => x.outcome !== 'no_fill');
  const n = rows.length;
  /* the pool's own average cost — per-instrument when the samples carry it, so
   * the break-even column is computed with the money these trades really paid */
  const costs = list.map((s) => (s.sweep && s.sweep.cost_r != null) ? s.sweep.cost_r : (costR != null ? costR : COST_R));
  const meanCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : COST_R;
  const label = plan.kind === 'flat' ? `Whole position at ${plan.target}R` : (SCALE_PLANS.find((p) => p.key === plan.key) || {}).label || plan.key;
  const maxWin = plan.kind === 'flat' ? plan.target : (plan.part * plan.partial + (1 - plan.part) * plan.runner);
  const row = {
    key: plan.kind === 'flat' ? `flat_${plan.target}` : plan.key,
    kind: plan.kind, label,
    target_r: plan.kind === 'flat' ? plan.target : plan.runner,
    trades: n, win_rate: null, win_rate_0_5r: null, expectancy_r: null,
    avg_win_r: null, avg_loss_r: null,
    max_win_r: r2(maxWin - costR),
    cost_r: r3(meanCost),
    breakeven_win_rate: r2(((1 + meanCost) / (1 + maxWin)) * 100),
  };
  if (!n) return row;
  const wins = rows.filter((x) => x.win);
  const clean = rows.filter((x) => x.r >= 0.5);
  const losses = rows.filter((x) => !x.win);
  const sum = rows.reduce((a, x) => a + x.r, 0);
  row.win_rate = r2((wins.length / n) * 100);
  row.win_rate_0_5r = r2((clean.length / n) * 100);
  row.expectancy_r = r2(sum / n);
  row.avg_win_r = wins.length ? r2(wins.reduce((a, x) => a + x.r, 0) / wins.length) : null;
  row.avg_loss_r = losses.length ? r2(losses.reduce((a, x) => a + x.r, 0) / losses.length) : null;
  row.edge_vs_breakeven_pts = r2(row.win_rate - row.breakeven_win_rate);
  row.usable = row.expectancy_r > 0 && n >= 25 && row.edge_vs_breakeven_pts > 0;
  return row;
}

const EXIT_PLANS = [
  ...FLAT_TARGETS.map((target) => ({ kind: 'flat', target })),
  ...SCALE_PLANS,
];

/* --------------------------------------------------------------- backtest */

const cache = new Map(); // key -> { at, result }

/**
 * Replay the entry model over history.
 * @param {string} symbol
 * @param {string} tf
 * @param {{bars?:number, step?:number, force?:boolean, ttlSec?:number}} opts
 */
async function backtest(symbol, tf = '15m', opts = {}) {
  const bars = clamp(Number(opts.bars) || 1200, 300, 3000);
  const step = clamp(Number(opts.step) || 2, 1, 10);
  const entryMode = ['mid', 'deep', 'leg', 'ote', 'mtf'].includes(opts.entry) ? opts.entry : 'entry';
  const costModel = opts.cost === 'flat' ? 'flat' : 'instrument';
  const spec = specFor(symbol);
  const costModelInfo = I.costBps(spec);
  const mtfTf = (entryMode === 'mtf' || opts.mtf) ? String(opts.mtf || MTF_ENTRY_PAIRS[tf] || '') : '';
  const cacheKeyInline = 0;
  let ltf = null, ltfMeta = null, ltfFromIdx = 0;
  const key = `${symbol}:${tf}:${bars}:${step}:${entryMode}:${costModel}`;
  const ttl = (opts.ttlSec || 600) * 1000;
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < ttl) return { ...hit.result, cached: true, default_view: defaultViewOf(hit.result) };

  const { candles, meta } = await C.getCandles(symbol, tf, { limit: bars, force: opts.force });
  const window = 250, minHistory = 150, maxForward = 250, fillWindow = 40;

  // the refined entry needs the lower timeframe over the same stretch of time
  if (mtfTf && C.TIMEFRAMES[mtfTf] && C.TIMEFRAMES[tf]) {
    const ratio = Math.max(1, Math.round(C.TIMEFRAMES[tf].ms / C.TIMEFRAMES[mtfTf].ms));
    try {
      const r = await C.getCandles(symbol, mtfTf, { limit: Math.min(3000, Math.ceil(bars * ratio) + 60), force: opts.force });
      ltf = (r.candles || []).length ? r.candles : null;
      ltfMeta = r.meta;
      if (ltf) {
        const t0 = ltf[0].t;
        let k = 0; while (k < candles.length && candles[k].t < t0) k++;
        ltfFromIdx = k;                                   // no lower-timeframe data before this bar
      }
    } catch (e) { ltf = null; ltfMeta = { error: e.message }; }
  }
  const samples = [];
  const skipped = { filter: 0, noSetup: 0, min_risk: 0 };

  for (let i = Math.max(minHistory, ltfFromIdx); i < candles.length - 5; i += step) {
    const win = candles.slice(Math.max(0, i + 1 - window), i + 1);
    if (win.length < minHistory) continue;
    // fast pre-filter: only bars that follow a liquidity grab or an expansion bar can trigger the model
    const tail = win.slice(-26);
    const prior = win.slice(-46, -26);
    if (prior.length >= 10) {
      const hi = Math.max(...prior.map((b) => b.h)), lo = Math.min(...prior.map((b) => b.l));
      const swept = tail.some((b) => b.h > hi || b.l < lo);
      const expanded = tail.slice(-6).some((b) => {
        const range = b.h - b.l;
        return range > 0 && Math.abs(b.c - b.o) / range > 0.55;
      });
      if (!swept && !expanded) { skipped.filter++; continue; }
    }
    const price = win[win.length - 1].c;
    const analysis = SMC.analyse(win, { tf });
    const qb = quickBias(win);
    const ctx = windowSignals(win, analysis, analysis.atr);
    const result = Setup.buildSetups(analysis, { price, atr: analysis.atr, bias: qb.bias, minRR: 2 });
    if (!result.candidates.length) { skipped.noSetup++; continue; }
    for (const raw of result.candidates) {
      if (!raw.levels || raw.score < 40) continue;
      // a stop inside a quarter-ATR of entry is inside the noise: reject, never fake an 11R target off it
      if (raw.risk_atr != null && raw.risk_atr < MIN_RISK_ATR) { skipped.min_risk++; continue; }
      let cand = raw, fillAt = null, mtfInfo = null;
      if (entryMode === 'mtf') {
        const trig = ltf ? mtfTrigger(raw, ltf, win[win.length - 1].t + C.TIMEFRAMES[tf].ms) : null;
        if (!trig) {                                     // no lower-timeframe confirmation → no trade
          samples.push({
            i, t: win[win.length - 1].t, dir: raw.dir, side: raw.side, grade: raw.grade, score: raw.score,
            rr_primary: r2(raw.levels.rr_primary || 0), entry_kind: raw.levels.entry_kind, entry_status: raw.levels.entry_status,
            profiles: null, sweep: { fill: false }, gates: gatesOf(raw), signals: candidateSignals(raw, ctx),
            entry_mode: 'mtf', mtf: { trigger: false, tf: mtfTf }, risk_atr: raw.levels.risk_atr, second: null,
            mae: 0, mfe: 0, bars_to_fill: null, rr_final: raw.levels.rr_final, win: 0,
            features: featuresOf(raw, { session_quality: (analysis.sessions || {}).quality, quick_bias: qb.score }),
          });
          continue;
        }
        // the HTF bar that contains the confirmation bar becomes the fill bar
        let hi = null;
        for (let j = i + 1; j < candles.length; j++) { if (candles[j].t >= trig.t) { hi = j; break; } }
        if (hi === null || hi >= candles.length - 2) continue;
        const refined = refinePlan(raw, trig.price, analysis.atr);
        if (!refined || !(refined.risk > (analysis.atr || 0) * 0.15)) continue;   // a stop that tight is noise
        cand = { ...raw, levels: refined };
        fillAt = hi;
        mtfInfo = { trigger: true, tf: mtfTf, price: r4(trig.price), bars_to_confirm: hi - i, ltf_bar: trig.bar };
      } else {
        cand = entryMode === 'entry' ? raw : withEntryDepth(raw, entryMode, analysis.atr, ctx);
        if (!cand) continue;
      }
      const sweep = sweepExits(candles, i, cand, { maxForward, fillWindow, fillAt, spec, costModel });
      const second = secondChance(candles, i, cand, { maxForward, fillWindow, fillAt, spec, costModel });
      const sim = resolveProfiles(candles, i, cand, { maxForward, fillWindow, spec, costModel });
      if (!sim || !sim.fill) {
        if (sim) samples.push({
          i, t: win[win.length - 1].t, dir: cand.dir, side: cand.side, grade: cand.grade, score: cand.score,
          rr_primary: r2(cand.levels.rr_primary || 0), entry_kind: cand.levels.entry_kind,
          entry: cand.levels.entry, stop: cand.levels.stop,
          entry_status: cand.levels.entry_status, profiles: sim.profiles, sweep, gates: gatesOf(cand),
          signals: candidateSignals(cand, ctx), entry_mode: entryMode, entry_shift_atr: cand.levels.entry_shift_atr || 0,
          risk_atr: cand.levels.risk_atr, second, mtf: mtfInfo, mae: 0, mfe: 0, bars_to_fill: null, rr_final: cand.levels.rr_final, win: 0,
          features: featuresOf(cand, { session_quality: (analysis.sessions || {}).quality, quick_bias: qb.score }),
        });
        continue;
      }
      samples.push({
        i, t: win[win.length - 1].t, dir: cand.dir, side: cand.side, grade: cand.grade, score: cand.score,
        rr_primary: r2(cand.levels.rr_primary || 0), entry_kind: cand.levels.entry_kind,
        entry: cand.levels.entry, stop: cand.levels.stop,
        entry_status: cand.levels.entry_status, profiles: sim.profiles, sweep, gates: gatesOf(cand),
        signals: candidateSignals(cand, ctx), entry_mode: entryMode, entry_shift_atr: cand.levels.entry_shift_atr || 0,
        risk_atr: cand.levels.risk_atr, second, mtf: mtfInfo, mae: sim.mae, mfe: sim.mfe, bars_to_fill: sim.bars_to_fill, rr_final: cand.levels.rr_final,
        win: sim.profiles.video && sim.profiles.video.r > 0 ? 1 : 0,
        features: featuresOf(cand, { session_quality: (analysis.sessions || {}).quality, quick_bias: qb.score }),
      });
    }
  }

  const filled = samples.filter((s) => s.profiles && s.profiles.video && s.profiles.video.outcome !== 'no_fill');
  const shown = filled;                                   // every filled trade, time-stops included at market value
  const baseRate = shown.length ? r2((shown.filter((s) => s.win).length / shown.length) * 100) : null;

  const byGrade = {};
  for (const s of shown) {
    const g = byGrade[s.grade] || (byGrade[s.grade] = { grade: s.grade, trades: 0, wins: 0, r_sum: 0 });
    g.trades++; if (s.win) g.wins++; g.r_sum += (s.profiles.video ? s.profiles.video.r : 0);
  }
  const gradeTable = Object.values(byGrade)
    .map((g) => ({ grade: g.grade, trades: g.trades, win_rate: r2((g.wins / g.trades) * 100), expectancy_r: r2(g.r_sum / g.trades) }))
    .sort((a, b) => b.trades - a.trades);

  const byDir = [1, -1].map((dir) => {
    const sub = shown.filter((s) => s.dir === dir);
    return { dir, side: dir > 0 ? 'buy' : 'sell', trades: sub.length, win_rate: sub.length ? r2((sub.filter((s) => s.win).length / sub.length) * 100) : null, expectancy_r: sub.length ? r2(sub.reduce((a, s) => a + (s.profiles.video ? s.profiles.video.r : 0), 0) / sub.length) : null };
  });

  /* --------------------------------------------- management-profile comparison */
  const profileTable = PROFILE_KEYS.map((key) => profileMetrics(shown, key))
    .sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0));

  /* ------------------------------------------------------- filter ladder
   * The same setups, filtered the way the playlist tells you to filter them. Every
   * row is measured on this market, so "wait for A+" is a number, not a slogan.
   */
  const subsets = [
    { key: 'all', label: 'No filter — every filled setup', test: () => true },
    { key: 'core', label: 'Core model only (sweep → displacement → zone → runway → not chased → valid)', test: (x) => hasGates(x, CORE_GATES) },
    { key: 'video', label: 'Video-faithful (core + HTF alignment + premium/discount entry)', test: (x) => hasGates(x, CORE_GATES) && hasGates(x, ['htf', 'range']) },
    { key: 'video_kz', label: 'Video-faithful + killzone only', test: (x) => hasGates(x, CORE_GATES) && hasGates(x, ['htf', 'range', 'session']) },
    { key: 'leg_only', label: 'Displacement leg required (the playlist’s precondition)', test: (x) => !!(x.signals && x.signals.leg_align) },
    { key: 'playlist', label: 'Playlist refinements (OTE retrace + MACD agrees, inside the structure)', test: (x) => x.gates && x.gates.htf && x.signals && x.signals.ote && x.signals.macd_align },
    { key: 'playlist_ema', label: 'Playlist refinements + trading with the 50 EMA', test: (x) => x.gates && x.gates.htf && x.signals && x.signals.ote && x.signals.macd_align && x.signals.ema50_align },
    { key: 'strict', label: 'Every gate at once (all 12)', test: (x) => passesSniper(x) },
  ];
  const filters = subsets.map(({ key, label, test }) => {
    const list = shown.filter(test);
    const profiles = list.length ? PROFILE_KEYS.map((k) => profileMetrics(list, k)).sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0)) : [];
    return {
      key, label, trades: list.length,
      share_of_filled_pct: shown.length ? r2((list.length / shown.length) * 100) : null,
      profiles,
    };
  });

  /* How many quality gates did a setup pass? (context quality ladder) */
  const qualityLadder = [
    { band: '0–1 quality gates', min: 0, max: 1 },
    { band: '2–3 quality gates', min: 2, max: 3 },
    { band: '4+ quality gates', min: 4, max: 6 },
  ].map(({ band, min, max }) => {
    const list = shown.filter((x) => {
      const n = QUALITY_GATES.filter((k) => x.gates && x.gates[k]).length;
      return n >= min && n <= max;
    });
    const pm = profileMetrics(list, 'video');
    return { band, trades: list.length, win_rate: pm.win_rate, expectancy_r: pm.expectancy_r };
  });

  const sniperSubset = filters.find((f) => f.key === 'video') || { trades: 0, profiles: [] };

  /* --------------------------------------------------------- exit frontier
   * The trade-off, measured on this market: every exit plan, on the unfiltered
   * pool and on the video-faithful pool, with the win rate you need to break even
   * at that reward next to the one you actually got.
   */
  const videoPool = shown.filter((x) => hasGates(x, CORE_GATES) && hasGates(x, ['htf', 'range']));
  const corePool = shown.filter((x) => hasGates(x, CORE_GATES));
  const trim = (r) => (r ? { trades: r.trades, win_rate: r.win_rate, win_rate_0_5r: r.win_rate_0_5r, expectancy_r: r.expectancy_r, edge_vs_breakeven_pts: r.edge_vs_breakeven_pts, usable: r.usable } : null);
  const frontier = EXIT_PLANS.map((plan, idx) => {
    const all = exitStats(shown, plan);
    const vid = videoPool.length >= 12 ? exitStats(videoPool, plan) : null;
    const cor = corePool.length >= 12 ? exitStats(corePool, plan) : null;
    return { ...all, order: idx, video_faithful: trim(vid), core_model: trim(cor) };
  });
  const rankable = frontier.filter((f) => f.trades >= 25);
  const best = {
    by_win_rate: rankable.slice().sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))[0] || null,
    by_win_rate_0_5r: rankable.slice().sort((a, b) => (b.win_rate_0_5r || 0) - (a.win_rate_0_5r || 0))[0] || null,
    by_expectancy: rankable.slice().sort((a, b) => (b.expectancy_r || 0) - (a.expectancy_r || 0))[0] || null,
    above_70: rankable.filter((f) => (f.win_rate || 0) >= 70).sort((a, b) => (b.expectancy_r || 0) - (a.expectancy_r || 0)).map((f) => ({ key: f.key, label: f.label, trades: f.trades, win_rate: f.win_rate, win_rate_0_5r: f.win_rate_0_5r, expectancy_r: f.expectancy_r, edge_vs_breakeven_pts: f.edge_vs_breakeven_pts })),
    above_70_clean: rankable.filter((f) => (f.win_rate_0_5r || 0) >= 70).map((f) => ({ key: f.key, label: f.label, trades: f.trades, win_rate: f.win_rate, win_rate_0_5r: f.win_rate_0_5r, expectancy_r: f.expectancy_r })),
  };

  /* --------------------------------------------------------------- verdict
   * One honest sentence about the 70 % question on this market: the best measured
   * clean win rate (a win you can actually bank: net ≥ +0.5R) and whether it clears
   * the bar the trader said they wanted. No rounding up, no redefining "win".
   */
  const cleanRows = rankable.filter((f) => f.win_rate_0_5r != null && f.trades >= 25);
  const bestClean = cleanRows.slice().sort((a, b) => (b.win_rate_0_5r || 0) - (a.win_rate_0_5r || 0))[0] || null;
  const playlistRow = (() => {
    const f = filters.find((x) => x.key === 'playlist');
    if (!f || !f.trades) return null;
    const best = (f.profiles || []).slice().sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))[0] || null;
    const fl = cleanRows.length ? EXIT_PLANS.map((plan) => exitStats(shown.filter((x) => x.gates && x.gates.htf && x.signals && x.signals.ote && x.signals.macd_align), plan)).filter((r) => r.trades >= 15) : [];
    const bestCleanPlaylist = fl.slice().sort((a, b) => (b.win_rate_0_5r || 0) - (a.win_rate_0_5r || 0))[0] || null;
    return { trades: f.trades, share_pct: f.share_of_filled_pct, video_plan: best, best_clean_exit: bestCleanPlaylist };
  })();
  const verdict = {
    target_win_rate: 70,
    min_win_r: 0.5,
    best_clean_exit: bestClean ? { label: bestClean.label, trades: bestClean.trades, win_rate: bestClean.win_rate, win_rate_0_5r: bestClean.win_rate_0_5r, expectancy_r: bestClean.expectancy_r, breakeven_win_rate: bestClean.breakeven_win_rate } : null,
    playlist: playlistRow,
    meets_target: !!(playlistRow && playlistRow.best_clean_exit && playlistRow.best_clean_exit.trades >= 25 && playlistRow.best_clean_exit.win_rate_0_5r >= 70),
    note: null,
  };
  verdict.note = verdict.meets_target
    ? `On this market the playlist filter with ${playlistRow.best_clean_exit.label} measured ${playlistRow.best_clean_exit.win_rate_0_5r}% clean wins (trades that banked at least +0.5R) across ${playlistRow.best_clean_exit.trades} trades — the 70 % bar is met here.`
    : `On this market no exit/filter combination measured ≥ 70 % clean wins (≥ +0.5R after costs). Best measured: ${bestClean ? `${bestClean.win_rate_0_5r}% at ${bestClean.label} over ${bestClean.trades} trades, expectancy ${bestClean.expectancy_r > 0 ? '+' : ''}${bestClean.expectancy_r}R` : 'not enough trades'}. Treat 70 % as unavailable here rather than assuming it.`;

  /* ------------------------------------------- second-chance re-entry stats */
  const stopped1 = shown.filter((x) => x.second && x.second.first === 'loss');
  const retapped = stopped1.filter((x) => x.second.retap && x.second.second);
  const secondR = retapped.reduce((a, x) => a + x.second.second.r, 0);
  const secondChanceStats = {
    first_attempt_stopped: stopped1.length,
    share_of_filled_pct: shown.length ? r2((stopped1.length / shown.length) * 100) : null,
    retapped: retapped.length,
    retap_rate_pct: stopped1.length ? r2((retapped.length / stopped1.length) * 100) : null,
    second_attempt_win_rate: retapped.length ? r2((retapped.filter((x) => x.second.second.r > 0).length / retapped.length) * 100) : null,
    second_attempt_expectancy_r: retapped.length ? r2(secondR / retapped.length) : null,
    net_effect_r_per_trade: shown.length ? r2(secondR / shown.length) : null,
    note: null,
  };
  secondChanceStats.note = retapped.length < 10
    ? `Only ${retapped.length} second taps in this window — too few to judge, so treat "take the second chance" as unmeasured here.`
    : secondChanceStats.net_effect_r_per_trade > 0.02
      ? `Taking the second tap after a failed first attempt measured +${secondChanceStats.net_effect_r_per_trade}R per trade across the whole sample (${secondChanceStats.second_attempt_win_rate}% wins on ${retapped.length} re-entries).`
      : secondChanceStats.net_effect_r_per_trade < -0.02
        ? `Taking the second tap measured ${secondChanceStats.net_effect_r_per_trade}R per trade — the re-entry lost money on balance (${secondChanceStats.second_attempt_win_rate}% wins on ${retapped.length} re-entries).`
        : `Taking the second tap measured approximately neutral (${secondChanceStats.net_effect_r_per_trade}R per trade, ${retapped.length} re-entries).`;

  /* ------------------------------------------------- model + honesty check */
  const model = trainLogistic(shown);
  // Walk-forward: train on the earlier 70 % of history, score the later 30 %.
  let outOfSample = null;
  if (shown.length >= 60) {
    const split = Math.floor(shown.length * 0.7);
    const train = shown.slice(0, split), test = shown.slice(split);
    const m = trainLogistic(train);
    if (m.ok && test.length >= 10) {
      let correct = 0, ll = 0, sumP = 0, sumY = 0;
      for (const s of test) {
        const p = modelPredict(s.features, m);
        if (p == null) continue;
        if ((p >= 0.5 ? 1 : 0) === s.win) correct++;
        ll += -(s.win * Math.log(Math.max(p, 1e-6)) + (1 - s.win) * Math.log(Math.max(1 - p, 1e-6)));
        sumP += p; sumY += s.win;
      }
      outOfSample = {
        train_n: train.length, test_n: test.length,
        train_from: new Date(train[0].t).toISOString().slice(0, 10), train_to: new Date(train[train.length - 1].t).toISOString().slice(0, 10),
        test_from: new Date(test[0].t).toISOString().slice(0, 10), test_to: new Date(test[test.length - 1].t).toISOString().slice(0, 10),
        accuracy: r2((correct / test.length) * 100),
        log_loss: r3(ll / test.length),
        base_rate: r2((sumY / test.length) * 100),
        mean_prediction: r2((sumP / test.length) * 100),
      };
    }
  }

  /* ------------------------------------------- what each filter is really worth */
  const perGate = [...SNIPER_GATES, 'stop_ge_06atr', 'runway3'].map((key) => {
    const withIt = shown.filter((s) => s.gates && s.gates[key]);
    const without = shown.filter((s) => !(s.gates && s.gates[key]));
    const met = (l, k) => (l.length ? r2(l.reduce((a, s) => a + (s.profiles[k] ? s.profiles[k].r : 0), 0) / l.length) : null);
    const wr = (l) => (l.length ? r2((l.filter((s) => s.win).length / l.length) * 100) : null);
    return {
      gate: key,
      label: GATE_LABELS[key] || key,
      with: { trades: withIt.length, win_rate: wr(withIt), expectancy_r: met(withIt, 'video') },
      without: { trades: without.length, win_rate: wr(without), expectancy_r: met(without, 'video') },
      edge_r: withIt.length && without.length ? r3((met(withIt, 'video') || 0) - (met(without, 'video') || 0)) : null,
    };
  }).sort((a, b) => (b.edge_r == null ? -9 : b.edge_r) - (a.edge_r == null ? -9 : a.edge_r));

  const result = {
    ok: true, symbol, timeframe: tf,
    meta: { bars: candles.length, window, step, entry_mode: entryMode, cost_model: costModel, cost_bps: costModelInfo.bps, cost_source: costModelInfo.source, cost_r_median: (() => { const v = samples.filter((x) => x.sweep && x.sweep.cost_r != null).map((x) => x.sweep.cost_r).sort((a, b) => a - b); return v.length ? r3(v[Math.floor(v.length / 2)]) : null; })(), mtf_tf: mtfTf || null, ltf_bars: ltf ? ltf.length : 0, ltf_provider: ltfMeta ? ltfMeta.provider : null, from: candles[0] ? new Date(candles[0].t).toISOString().slice(0, 10) : null, to: candles[candles.length - 1] ? new Date(candles[candles.length - 1].t).toISOString().slice(0, 10) : null, provider: meta.provider, ticker: meta.ticker },
    counts: {
      setups: samples.length, filled: filled.length, decided: shown.length,
      no_fill: samples.length - filled.length,
      timeouts: filled.filter((s) => s.profiles.video && s.profiles.video.hit && s.profiles.video.hit.timeout).length,
      skipped,
    },
    base_rate: baseRate,
    expectancy_r: shown.length ? r2(shown.reduce((a, s) => a + (s.profiles.video ? s.profiles.video.r : 0), 0) / shown.length) : null,
    hold_to_target_expectancy_r: (profileMetrics(shown, 'hold_t2') || {}).expectancy_r,
    partial_rate: shown.length ? r2((shown.filter((s) => s.profiles.video && s.profiles.video.first_hit).length / shown.length) * 100) : null,
    runner_rate: shown.length ? r2((shown.filter((s) => s.profiles.video && s.profiles.video.hit && s.profiles.video.hit.runner).length / shown.length) * 100) : null,
    profiles: profileTable,
    frontier,
    best_exit: best,
    verdict,
    second_chance: secondChanceStats,
    filters,
    quality_ladder: qualityLadder,
    target_frontier: targetFrontier(samples),
    frontier_views: {
      all: { label: 'every setup', ...frontierFor(samples, []) },
      refined: { label: 'the video\'s refinement loop: entry in the OTE retrace band or MACD agreement (selective by design)', ...frontierFor(samples, ['displacement'], (s) => s.signals && (s.signals.ote === 1 || s.signals.macd_align === 1)) },
      strict: { label: 'every refinement at once: OTE band + MACD + 50 EMA aligned (rare — small samples)', ...frontierFor(samples, ['displacement'], (s) => s.signals && s.signals.ote === 1 && s.signals.macd_align === 1 && s.signals.ema50_align === 1) },
      cost_floor: { label: 'displacement leg + stop at least 0.6 x ATR away', ...frontierFor(samples, ['displacement', 'stop_ge_06atr']) },
      full: { label: '+ first target at least 3R away (the measured maximum-expectancy shape)', ...frontierFor(samples, ['displacement', 'stop_ge_06atr', 'runway3']) },
    },
    default_view: defaultViewOf({ frontier_views: { all: frontierFor(samples, []), full: frontierFor(samples, ['displacement', 'stop_ge_06atr', 'runway3']) } }),
    presets: (MEASURED && MEASURED.presets) || [],
    measured_rules_at: MEASURED_AT,
    gate_sets: { core: CORE_GATES, quality: QUALITY_GATES, all: SNIPER_GATES },
    per_gate: perGate,
    by_grade: gradeTable, by_direction: byDir,
    model,
    out_of_sample: outOfSample,
    calibration: calibrate(model, shown),
    samples, // kept for the UI's "similar setups" table; trimmed by the route before sending
    cached: false,
  };
  cache.set(key, { at: Date.now(), result });
  return result;
}

/* ------------------------------------------------------- logistic regression */

function standardise(rows, dims) {
  const mean = new Array(dims).fill(0), sd = new Array(dims).fill(0);
  for (const f of rows) for (let d = 0; d < dims; d++) mean[d] += f[d] / rows.length;
  for (const f of rows) for (let d = 0; d < dims; d++) sd[d] += ((f[d] - mean[d]) ** 2) / rows.length;
  for (let d = 0; d < dims; d++) sd[d] = Math.sqrt(sd[d]) || 1;
  return { mean, sd };
}

/** Small L2-regularised logistic model — fully inspectable, no dependencies. */
function trainLogistic(samples, { epochs = 500, lr = 0.25, l2 = 0.02 } = {}) {
  if (samples.length < 25) {
    return { ok: false, note: `Only ${samples.length} resolved setups — need 25+ before the model is worth trusting.`, weights: null };
  }
  const X = samples.map((s) => s.features.slice());
  const y = samples.map((s) => s.win);
  const dims = X[0].length;
  const { mean, sd } = standardise(X, dims);
  const Z = X.map((row) => row.map((v, d) => (v - mean[d]) / sd[d]));
  let w = new Array(dims).fill(0), b = 0;
  const sig = (z) => 1 / (1 + Math.exp(-clamp(z, -30, 30)));
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(dims).fill(0); let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      let z = b; for (let d = 0; d < dims; d++) z += w[d] * Z[i][d];
      const err = sig(z) - y[i];
      for (let d = 0; d < dims; d++) gw[d] += err * Z[i][d];
      gb += err;
    }
    const n = Z.length;
    for (let d = 0; d < dims; d++) w[d] -= lr * (gw[d] / n + l2 * w[d]);
    b -= lr * (gb / n);
  }
  // in-sample metrics
  let correct = 0, logLoss = 0;
  const preds = Z.map((row, i) => {
    let z = b; for (let d = 0; d < dims; d++) z += w[d] * row[d];
    const p = sig(z);
    if ((p >= 0.5 ? 1 : 0) === y[i]) correct++;
    logLoss += -(y[i] * Math.log(Math.max(p, 1e-6)) + (1 - y[i]) * Math.log(Math.max(1 - p, 1e-6)));
    return p;
  });
  return {
    ok: true, n: samples.length, dims,
    weights: Object.fromEntries(FEATURES.map((f, d) => [f, r3(w[d])])),
    bias: r3(b), mean, sd,
    accuracy: r2((correct / samples.length) * 100),
    log_loss: r3(logLoss / samples.length),
    base_rate: r2((y.reduce((a, x) => a + x, 0) / y.length) * 100),
    example_predictions: preds.slice(-8).map((p, i) => ({ p: r2(p * 100), actual: y.slice(-8)[i] })),
  };
}

function modelPredict(features, model) {
  if (!model || !model.ok) return null;
  let z = model.bias;
  for (let d = 0; d < features.length; d++) z += model.weights[FEATURES[d]] * ((features[d] - model.mean[d]) / model.sd[d]);
  const p = 1 / (1 + Math.exp(-clamp(z, -30, 30)));
  return p;
}

/** Bucket predictions to show predicted-vs-actual (honesty about calibration). */
function calibrate(model, samples) {
  if (!model || !model.ok || samples.length < 30) return null;
  const rows = samples.map((s) => ({ p: modelPredict(s.features, model), y: s.win })).filter((r) => r.p != null);
  if (rows.length < 30) return null;
  const buckets = [[0, 0.4], [0.4, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 1]];
  const out = buckets.map(([lo, hi]) => {
    const sub = rows.filter((r) => r.p >= lo && r.p < hi);
    return { range: `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`, n: sub.length, predicted: sub.length ? r2((sub.reduce((a, r) => a + r.p, 0) / sub.length) * 100) : null, actual: sub.length ? r2((sub.reduce((a, r) => a + r.y, 0) / sub.length) * 100) : null };
  }).filter((b) => b.n > 0);
  return out;
}

/* ------------------------------------------------------ direction probability */

/**
 * Empirical P(price higher N bars later), bucketed by the same quick trend read
 * the app displays. Answers "buy or sell?" with a measured number + a sample size.
 */
async function directionStudy(symbol, tf = '15m', { bars = 1500, horizon = 20 } = {}) {
  const { candles } = await C.getCandles(symbol, tf, { limit: bars });
  const buckets = new Map(); // score bucket -> {n, up}
  let n = 0;
  for (let i = 80; i < candles.length - horizon; i += 3) {
    const win = candles.slice(Math.max(0, i + 1 - 80), i + 1);
    const qb = quickBias(win).score;
    const b = Math.round(qb / 34) * 34; // -102,-68,-34,0,34,68,102 -> collapse below
    const key = clamp(b, -102, 102);
    const fwd = candles[i + horizon].c - candles[i].c;
    const bucket = buckets.get(key) || { n: 0, up: 0, ret: 0 };
    bucket.n++; if (fwd > 0) bucket.up++; bucket.ret += (fwd / candles[i].c) * 100;
    buckets.set(key, bucket);
    n++;
  }
  const rows = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([score, v]) => ({
    score, label: score >= 50 ? 'Strong uptrend read' : score >= 15 ? 'Mild uptrend read' : score <= -50 ? 'Strong downtrend read' : score <= -15 ? 'Mild downtrend read' : 'Neutral read',
    samples: v.n, p_up: r2((v.up / v.n) * 100), avg_return_pct: r2(v.ret / v.n),
  }));
  return { symbol, timeframe: tf, horizon_bars: horizon, observations: n, buckets: rows.filter((r) => r.samples >= 10), all_buckets: rows };
}

/* ------------------------------------------------------------ live prediction */

/** Live setups scored by the trained model. */
/**
 * Which management profile the caller wants headlined (`?exit=`), defaulting to the
 * profile with the best measured hit-rate among those that are also positive.
 */
function bestProfile(bt, want) {
  const list = (bt && bt.profiles) || [];
  if (!list.length) return null;
  if (want) {
    const hit = list.find((p) => p.key === want);
    if (hit) return hit;
  }
  const positive = list.filter((p) => p.trades >= 20 && p.expectancy_r > 0);
  const pool = positive.length ? positive : list.filter((p) => p.trades >= 20);
  return pool.slice().sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))[0] || list[0];
}

async function predict(symbol, tf = '15m', opts = {}) {
  const [bt, study] = await Promise.all([
    backtest(symbol, tf, opts),
    directionStudy(symbol, tf, { bars: opts.bars || 1200, horizon: opts.horizon || 20 }),
  ]);

  // live read on the same window the backtest used
  const { candles, meta } = await C.getCandles(symbol, tf, { limit: 250 });
  const analysis = SMC.analyse(candles, { tf });
  const qb = quickBias(candles);
  const liveCtx = windowSignals(candles, analysis, analysis.atr);
  // the refined entry: has the lower timeframe actually confirmed anything recently?
  const mtfTf = MTF_ENTRY_PAIRS[tf] || null;
  let ltfBars = null;
  if (mtfTf && opts.mtf !== false) {
    try {
      const r = await C.getCandles(symbol, mtfTf, { limit: 900 });
      ltfBars = Array.isArray(r.candles) && r.candles.length ? r.candles : null;
    } catch (e) { ltfBars = null; }
  }
  const mtfOf = (c) => {
    if (!ltfBars) return { tf: mtfTf, available: false, note: mtfTf ? `No ${mtfTf} history available for this market.` : 'No lower timeframe mapped for this interval.' };
    const last = candles[candles.length - 1].t + C.TIMEFRAMES[tf].ms;
    const lookback = 20 * C.TIMEFRAMES[tf].ms;
    const trig = mtfTrigger(c, ltfBars, last - lookback);
    if (!trig) return { tf: mtfTf, available: true, status: 'waiting', note: `No ${mtfTf} confirmation (sweep + displacement inside the zone) in the last 20 bars — the refined entry would still be waiting.` };
    const htfIdx = candles.findIndex((x) => x.t > trig.t);
    const ago = htfIdx === -1 ? candles.length - 1 : Math.max(0, candles.length - 1 - htfIdx);
    const plan = refinePlan(c, trig.price, analysis.atr);
    const base = { tf: mtfTf, available: true, status: ago <= 2 ? 'live' : 'recent', price: r4(trig.price), bars_ago: ago, plan };
    // the same floor the backtest applies: a stop inside a quarter-ATR of the confirmation is noise
    if (!plan || plan.risk_atr < MIN_RISK_ATR) {
      return { ...base, status: 'rejected', plan: null,
        note: `${mtfTf} confirmed at ${r4(trig.price)}, but that leaves only ${plan ? plan.risk_atr : '—'} ATR to the stop (floor ${MIN_RISK_ATR}). Targets this tight are noise — the model would not take it.` };
    }
    return { ...base,
      note: `${mtfTf} confirmation fired ${ago === 0 ? 'this bar' : ago + ' bars ago'} at ${r4(trig.price)} (sweep + displacement inside the zone) — refined plan: stop ${plan.stop}, ${plan.risk_atr} ATR risk, first target ${plan.rr_primary == null ? 'not reachable at current levels' : plan.rr_primary + 'R'}.` };
  };
  const setups = Setup.buildSetups(analysis, { price: analysis.price, atr: analysis.atr, bias: qb.bias, minRR: 2 });

  const scored = setups.candidates.map((c) => {
    const f = featuresOf(c, { session_quality: (analysis.sessions || {}).quality, quick_bias: qb.score });
    const p = bt.model && bt.model.ok ? modelPredict(f, bt.model) : null;
    // empirical fallback/blend: the grade bucket's own historical hit rate
    const gr = (bt.by_grade || []).find((g) => g.grade === c.grade);
    const empirical = gr && gr.trades >= 8 ? gr.win_rate / 100 : bt.base_rate != null ? bt.base_rate / 100 : null;
    const blended = p != null && empirical != null ? (p * 0.7 + empirical * 0.3)
      : p != null ? p : empirical;
    const rr = c.levels ? c.levels.rr_primary : null;
    const expected = blended != null && rr ? (blended * rr) - (1 - blended) : null;
    return {
      dir: c.dir, side: c.side, grade: c.grade, score: c.score,
      entry_status: c.levels ? c.levels.entry_status : null,
      entry: c.levels ? c.levels.entry : null, stop: c.levels ? c.levels.stop : null,
      target: c.levels && c.levels.targets[0] ? c.levels.targets[0].price : null,
      rr_primary: rr,
      risk_atr: c.levels && c.levels.risk_atr != null ? c.levels.risk_atr : null,
      // the two gates that survived out-of-sample in scripts/rule-sweep.js (2026-10-06)
      measured_gates: (() => { const g = gatesOf(c); return { stop_ge_06atr: !!g.stop_ge_06atr, runway3: !!g.runway3 }; })(),
      p_win: blended != null ? r2(blended * 100) : null,
      p_model: p != null ? r2(p * 100) : null,
      p_empirical: empirical != null ? r2(empirical * 100) : null,
      similar_setups: gr ? gr.trades : 0,
      expected_r: expected != null ? r2(expected) : null,
      playlist: Object.assign(candidateSignals(c, liveCtx), { mtf: mtfOf(c) }, (() => {
        const o = oteEntryFor(c, liveCtx);
        if (!o) return { ote_band: null, ote_entry: null };
        const atr = liveCtx.atr || 0;
        const keepPlan = o.inside || o.better_than_band === true;
        const price = keepPlan ? c.levels.entry : o.price;
        const risk = keepPlan ? c.levels.risk : o.risk;
        const targets = keepPlan ? (c.levels.targets || []) : (o.targets || []);
        const rr1 = targets[0] ? targets[0].rr : c.levels.rr_primary;
        const shift = keepPlan ? 0 : (o.shift_atr != null ? o.shift_atr : 0);
        const note = o.inside
          ? 'The planned entry already sits inside the OTE retrace band of the displacement leg — nothing to change.'
          : o.better_than_band
            ? `The planned entry is already deeper than the OTE band (${o.band[0]}–${o.band[1]}), so it is more conservative than the refinement asks — keep the plan.`
            : `Refinement: wait for the retrace into the OTE band ${o.band[0]}–${o.band[1]} and enter at ${o.price} instead of ${c.levels.entry} (${shift} ATR deeper). Risk becomes ${r4(risk) || o.risk} and the first target pays ${rr1}R instead of ${c.levels.rr_primary}R.`;
        return {
          ote_band: o.band,
          ote_entry: {
            price,
            inside_band: !!o.inside,
            better_than_band: o.better_than_band === true,
            price_ok: o.price_ok !== false,
            risk: r4(risk),
            risk_atr: atr ? r2(risk / atr) : null,
            rr_primary: rr1,
            shift_atr: shift,
            band: o.band,
            note,
          },
        };
      })()),
      features: Object.fromEntries(FEATURES.map((k, d) => [k, r2(f[d] * 100) / 100])),
    };
  });

  const currentBucket = study.buckets.reduce((best, b) => (Math.abs(b.score - qb.score) < Math.abs((best ? best.score : 1e9) - qb.score) ? b : best), null);
  const buy = scored.find((s) => s.dir === 1) || null;
  const sell = scored.find((s) => s.dir === -1) || null;

  const summary = [];
  const tradeable = bt.expectancy_r != null && bt.expectancy_r > 0.1 && bt.counts.decided >= 30;
  summary.push(bt.expectancy_r == null
    ? `No resolved setups in this window (${bt.counts.decided}) — nothing to measure yet.`
    : `${bt.counts.decided} resolved setups on ${tf} ${symbol}: managed expectancy ${bt.expectancy_r > 0 ? '+' : ''}${bt.expectancy_r}R per trade (base rate ${bt.base_rate}%). That is ${tradeable ? 'a tradeable edge on this market/timeframe' : 'NOT enough edge — do not trade this model blindly here'}.`);
  if (bt.out_of_sample) summary.push(`Out-of-sample check (trained on the earlier 70% of history, tested on the last 30%): ${bt.out_of_sample.accuracy}% accuracy vs a ${bt.out_of_sample.base_rate}% base rate, mean prediction ${bt.out_of_sample.mean_prediction}%.`);
  if (bt.model && bt.model.ok) summary.push(`Model trained on ${bt.model.n} resolved setups from ${bt.meta.bars} bars (${bt.meta.from} → ${bt.meta.to}); in-sample accuracy ${bt.model.accuracy}% against a ${bt.model.base_rate}% base rate.`);
  else summary.push(`Not enough resolved setups yet on this timeframe (${bt.counts.decided}) — showing empirical rates instead of the model.`);
  const best = bestProfile(bt, opts.exit);
  if (best && best.trades >= 20) {
    summary.push(`Management matters as much as the entry: ${best.label} scored ${best.win_rate}% wins (${best.trades} trades) at ${best.expectancy_r > 0 ? '+' : ''}${best.expectancy_r}R average. Hold the same trades to the final target instead and it is ${bt.hold_to_target_expectancy_r == null ? '—' : (bt.hold_to_target_expectancy_r > 0 ? '+' : '') + bt.hold_to_target_expectancy_r + 'R'}.`);
  }
  const vidSubset = ((bt.filters || []).find((f) => f.key === 'video')) || null;
  if (vidSubset && vidSubset.trades >= 20) {
    const want = opts.exit || 'half_075';
    const sp = (vidSubset.profiles || []).find((x) => x.key === want) || (vidSubset.profiles || [])[0];
    if (sp) summary.push(`Video-faithful filter (core + HTF alignment + discount/premium): ${vidSubset.trades} of ${bt.counts.decided} setups survive — ${sp.label}: ${sp.win_rate}% wins, ${sp.expectancy_r > 0 ? '+' : ''}${sp.expectancy_r}R average, first scale-out reached ${sp.first_hit_rate}%.`);
  }
  if (bt.quality_ladder) {
    const top = bt.quality_ladder[bt.quality_ladder.length - 1];
    const low = bt.quality_ladder[0];
    if (top && low && top.trades >= 10 && low.trades >= 10) summary.push(`Context quality ladder: setups passing 4+ context gates → ${top.win_rate}% wins / ${top.expectancy_r > 0 ? '+' : ''}${top.expectancy_r}R (n=${top.trades}); 0–1 gates → ${low.win_rate}% / ${low.expectancy_r > 0 ? '+' : ''}${low.expectancy_r}R (n=${low.trades}).`);
  }
  if (mtfTf && ltfBars) {
    const live = (scored || []).map((x) => (x.playlist || {}).mtf).filter((m) => m && m.status && m.status !== 'waiting');
    summary.push(live.length
      ? `Refined entry: the ${mtfTf} confirmed ${live[0].bars_ago === 0 ? 'this bar' : live[0].bars_ago + ' bars ago'} at ${live[0].price} — the playlist's "wait for the lower timeframe" condition is satisfied for ${live.length} setup(s).`
      : `Refined entry: no ${mtfTf} confirmation inside the zone yet — the playlist would have you wait rather than take the first touch.`);
  }
  if (bt.verdict && bt.verdict.best_clean_exit) {
    const v = bt.verdict;
    summary.push(`${v.meets_target ? '70 % bar met' : '70 % bar NOT met'} on ${tf} ${symbol}: best measured clean-win rate (≥ +0.5R net) is ${v.best_clean_exit.win_rate_0_5r}% with ${v.best_clean_exit.label} over ${v.best_clean_exit.trades} trades (expectancy ${v.best_clean_exit.expectancy_r > 0 ? '+' : ''}${v.best_clean_exit.expectancy_r}R; that exit needs ${v.best_clean_exit.breakeven_win_rate}% just to break even).`);
  }
  if (currentBucket) summary.push(`Your current trend read (${r2(qb.score)}) sits in the "${currentBucket.label}" bucket: price was higher ${currentBucket.horizon_bars || study.horizon_bars} bars later in ${currentBucket.p_up}% of ${currentBucket.samples} historical cases.`);
  if (buy && buy.p_win != null) summary.push(`Long setup: ${buy.p_win}% modelled chance of reaching ${buy.rr_primary}R before the stop (${buy.similar_setups} similar setups, expected ${buy.expected_r}R).`);
  if (sell && sell.p_win != null) summary.push(`Short setup: ${sell.p_win}% modelled chance of reaching ${sell.rr_primary}R before the stop (${sell.similar_setups} similar setups, expected ${sell.expected_r}R).`);
  if (!buy && !sell) summary.push('No qualifying setup in either direction right now — the prediction layer has nothing to price.');

  return {
    ok: true, symbol, timeframe: tf,
    quote: { price: analysis.price, atr: analysis.atr, last_bar: meta.last_bar, provider: meta.provider, ticker: meta.ticker },
    direction: {
      quick_score: r2(qb.score), quick_bias: qb.bias,
      p_up_pct: currentBucket ? currentBucket.p_up : null,
      horizon_bars: study.horizon_bars,
      samples: currentBucket ? currentBucket.samples : 0,
      bucket: currentBucket ? currentBucket.label : null,
      buckets: study.buckets,
      note: 'Empirical: how often price closed higher N bars after an identical trend/momentum read in this market\'s recent history.',
    },
    setups: scored,
    buy: buy, sell: sell,
    model: bt.model,
    backtest: {
      setups: bt.counts.setups, decided: bt.counts.decided, no_fill: bt.counts.no_fill, timeouts: bt.counts.timeouts,
      base_rate: bt.base_rate, expectancy_r: bt.expectancy_r, by_grade: bt.by_grade, by_direction: bt.by_direction,
      profiles: bt.profiles, frontier: bt.frontier, best_exit: bt.best_exit, verdict: bt.verdict,
      second_chance: bt.second_chance, filters: bt.filters, quality_ladder: bt.quality_ladder, gate_sets: bt.gate_sets,
      per_gate: bt.per_gate, hold_to_target_expectancy_r: bt.hold_to_target_expectancy_r,
      target_frontier: bt.target_frontier, frontier_views: bt.frontier_views, default_view: bt.default_view || defaultViewOf(bt), presets: bt.presets, measured_rules_at: bt.measured_rules_at,
      meta: bt.meta, calibration: bt.calibration, cached: !!bt.cached,
    },
    exit_profile: bestProfile(bt, opts.exit),
    summary,
    generated_at: new Date().toISOString(),
  };
}

/** Trimmed sample rows for the API (keeps payloads small). */
function sampleTable(bt, limit = 25) {
  const rows = (bt.samples || []).filter((s) => s.profiles && s.profiles.video && s.profiles.video.outcome !== 'no_fill');
  return rows.slice(-limit).reverse().map((s) => {
    const v = s.profiles.video || {};
    const best = s.profiles.half_075 || v;
    return {
      t: new Date(s.t).toISOString().slice(0, 16).replace('T', ' '),
      side: s.side, grade: s.grade, score: s.score, rr: s.rr_primary, outcome: v.outcome, r: v.r,
      r_scaled: best.r, r_hold: (s.profiles.hold_t2 || {}).r, first_hit: !!v.first_hit,
      gates: s.gates ? SNIPER_GATES.filter((k) => !s.gates[k]).length : null,
      mae: s.mae, mfe: s.mfe, bars_to_fill: s.bars_to_fill,
      entry_mode: s.entry_mode || null,
      risk_atr: s.risk_atr == null ? null : s.risk_atr,
      cost_r: s.sweep && s.sweep.cost_r != null ? s.sweep.cost_r : null,
    };
  });
}

module.exports = { COST_R, COST_MODELS, specFor, costFor, MEASURED, MEASURED_AT, targetFrontier, frontierFor, MTF_ENTRY_PAIRS, mtfTrigger, rollingAtr, refinePlan, MIN_RISK_ATR, backtest, predict, directionStudy, quickBias, resolve, resolveProfiles, trainLogistic, modelPredict, sampleTable, PROFILES, SNIPER_GATES, FEATURES };
