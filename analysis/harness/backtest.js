#!/usr/bin/env node
'use strict';
/**
 * INDEPENDENT WALK-FORWARD BACKTEST — measures the real setup engine, not a re-implementation.
 *
 * It calls the SAME code the server calls:
 *     SMC.analyse(candles, { tf, htfCandles })   →  src/bots/smc.js
 *     Setup.buildSetups(analysis, ctx)           →  src/bots/setup.js
 * and then simulates the entry / stop / target that the engine itself produced.
 *
 * ⚠ DATA IS SYNTHETIC (see synth.js). This measures whether the entry/stop/target
 * logic is internally consistent — profitable on data containing the structure the
 * method claims to exploit. It does NOT establish real-market edge.
 *
 * METHODOLOGY (stated so the numbers are auditable):
 *   · at each bar i, the engine sees ONLY candles[0..i] — no lookahead
 *   · a signal is acted on from bar i+1 onward
 *   · single target = targets[0] (T1). The code ships a 3-target ladder with a 50%
 *     partial (M51, unresolved); using T1 alone is the conservative single-target read
 *   · same-bar ambiguity (both stop and target inside one bar) resolves to the STOP —
 *     deliberately pessimistic
 *   · one position at a time; scanning resumes after the trade closes
 *   · R = (exit - entry) / (entry - stop), sign-corrected for side
 *   · results are broken out by grade, because the M95 decision (B and C remain
 *     tradeable) makes the per-grade expectancy the load-bearing number
 *
 * Usage:  node analysis/harness/backtest.js [--seeds 5] [--bars 900] [--window 300]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'extracted', 'tradejournal');
const SMC = require(path.join(ROOT, 'src/bots/smc.js'));
const Setup = require(path.join(ROOT, 'src/bots/setup.js'));
const MOM = require(path.join(ROOT, 'src/bots/momentum.js'));   // M50: --bias held
const Synth = require('./synth.js');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? Number(argv[i + 1]) : d; };
const SEEDS = arg('seeds', 5);
const BARS = arg('bars', 900);
const WINDOW = arg('window', 300);
const WARMUP = 120;
// A trade gets a bounded life. Without this the walk runs to the end of the series and
// "price eventually reaches the target" is scored as an edge. Ep 27 gives the guidance:
// trades should last 30-50 minutes, 100 preferred — on 15m bars that is 2-7 bars, so 20
// bars (5 hours) is already generous.
const MAX_BARS = arg('maxbars', 20);
// After a trade closes, wait before re-entering. Otherwise one unmitigated zone is
// re-signalled on consecutive bars and a single idea is counted dozens of times.
const COOLDOWN = arg('cooldown', 12);
// Bars allowed for the limit order to fill before the idea is abandoned.
const FILL_WINDOW = arg('fillwindow', 12);
// The engine's own readiness flag. 'waiting' means "Chasing here breaks the model's edge"
// (setup.js:346) and 'approaching' means set an alert; only 'at-entry' says arm the order.
const ONLY_AT_ENTRY = argv.indexOf('--all-status') < 0;
// M120 — the harness never passed `ctx.bias`. setup.js:199 reads `Number(ctx.bias || 0)`, so it
// was always 0, and the 12-weight 'bias' check at :313 (`bias !== 0 && Math.sign(bias) === dir`)
// could therefore NEVER pass. The server does pass it (bots/index.js:155, `bias: momentum.bias`),
// so every recorded baseline graded a systematically lower score than the shipped product would.
// OFF by default so Baselines 1-6 still reproduce byte-for-byte. `--bias htf` derives it the way
// the engine's own provisional branch does (momentum.js:135: structDir from the HTF trend), which
// is the engine's rule rather than an invention of this harness.
const BIAS_MODE = (() => { const i = argv.indexOf('--bias'); return i >= 0 ? String(argv[i + 1]) : 'off'; })();
// --at pins the killzone clock to ONE instant for every bar, reproducing the old wall-clock
// behaviour. Left unset, the clock advances with the candle. Comparing the two isolates how
// much of any result was an artefact of the hour the run happened to be executed at.
const argS = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? String(argv[i + 1]) : d; };
const AT = argS('at', null);
const AT_MS = AT ? Date.parse(AT) : null;
// M1: A/B the swing definition. 'local' (default) is the code's local-extremum tier; 'bos' is
// the course's "extreme that created the break of structure". Only for measurement.
// M1 + M22 are now the engine defaults; these flags let the OLD behaviour be restored.
const SWING = argS('swingmode', 'bos');
// M22: bound the minor tier by the range the major tier defines. Off by default.
const NESTED = argv.indexOf('--no-nested') < 0;
// M32: an order block is only valid if its creating leg left an imbalance (Ep 10).
const OB_FVG = argv.indexOf('--ob-fvg') >= 0;
// M44: any un-traded high or low can be a liquidity pool, not just the last four.
const ALL_SWINGS = argv.indexOf('--all-swings') >= 0;
// M47: let a retested flip zone be the point of interest, not just display data.
const USE_BREAKERS = argv.indexOf('--breakers') >= 0;
// M43: stand down when un-swept liquidity sits between entry and target, instead of banking a partial.
const STAND_DOWN_WALL = argv.indexOf('--stand-down-wall') >= 0;
// M51: restore the three-rung ladder with a 50% partial instead of one target.
const LADDER = argv.indexOf('--ladder') >= 0;
// M52 — the dollar arm below captured ONLY `grade_risk_multiplier`, so this harness was blind to
// the mid-range risk multiplier the engine now applies. Shipping M52 left
// `--seeds 60 --bars 1500 --window 300` byte-identical, which is a MEASUREMENT GAP, not evidence
// that M52 does nothing — the same class of omission as M120 (the harness not passing an input the
// engine consumes). OFF by default so Baselines 1-6 still reproduce byte-for-byte; `--range-sized`
// prints a third arm sized by grade x range position, using the multiplier the engine emitted.
const RANGE_SIZED = argv.indexOf('--range-sized') >= 0;
if (AT && Number.isNaN(AT_MS)) { console.error('bad --at: ' + AT); process.exit(2); }

/**
 * Two-phase simulation of a LIMIT order.
 *   phase 1  wait for price to actually reach the entry level (fill), up to FILL_WINDOW bars
 *   phase 2  from the fill bar, evaluate stop / target up to MAX_BARS bars
 * Assuming an instant fill was the single largest error in the first version of this
 * harness: the engine emits a limit price that can be far from market, and scoring an
 * unfilled order as a win produced the absurd +14R figure.
 */
function simulate(candles, from, lv, maxBars, fillWindow) {
  const buy = lv.side === 'buy';
  const entry = lv.entry, stop = lv.stop;
  const risk = buy ? entry - stop : stop - entry;
  if (!(risk > 0)) return null;
  const t1 = (lv.targets && lv.targets[0]) || null;
  if (!t1) return null;
  const target = t1.price;
  if (buy ? target <= entry : target >= entry) return null;

  // ---- phase 1: does the limit ever fill?
  let fill = -1;
  const fEnd = Math.min(candles.length - 1, from + fillWindow - 1);
  for (let i = from; i <= fEnd; i++) {
    const b = candles[i];
    // a buy limit fills when price trades down to it; a sell limit when price trades up to it
    if (buy ? b.l <= entry : b.h >= entry) { fill = i; break; }
    // price ran the other way: the idea is gone, not waiting
    if (buy ? b.h >= target : b.l <= target) return { r: 0, exit: null, bars: 0, outcome: 'missed' };
  }
  if (fill < 0) return { r: 0, exit: null, bars: 0, outcome: 'unfilled' };

  // ---- phase 2: manage the filled position
  const last_i = Math.min(candles.length - 1, fill + maxBars - 1);
  for (let i = fill; i <= last_i; i++) {
    const b = candles[i];
    const hitStop = buy ? b.l <= stop : b.h >= stop;
    const hitTgt = buy ? b.h >= target : b.l <= target;
    if (hitStop) return { r: -1, exit: stop, bars: i - from + 1, outcome: 'stop' };
    if (hitTgt) return { r: Math.abs(target - entry) / risk, exit: target, bars: i - from + 1, outcome: 'target' };
  }
  const last = candles[last_i];
  const r = buy ? (last.c - entry) / risk : (entry - last.c) / risk;
  return { r, exit: last.c, bars: last_i - from + 1, outcome: 'expired' };
}

function stats(trades) {
  if (!trades.length) return { n: 0, win: 0, exp: 0, pf: 0 };
  const wins = trades.filter((t) => t.r > 0);
  const gp = wins.reduce((s, t) => s + t.r, 0);
  const gl = Math.abs(trades.filter((t) => t.r < 0).reduce((s, t) => s + t.r, 0));
  return {
    n: trades.length,
    win: (wins.length / trades.length) * 100,
    exp: trades.reduce((s, t) => s + t.r, 0) / trades.length,
    pf: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0),
  };
}

const fmt = (s) => s.n === 0 ? 'n=0' :
  `n=${String(s.n).padStart(4)}  win=${s.win.toFixed(1).padStart(5)}%  exp=${(s.exp >= 0 ? '+' : '') + s.exp.toFixed(4)}R  PF=${s.pf === Infinity ? 'inf' : s.pf.toFixed(2)}`;

const all = [];
// M50 counters. Printed with their denominators: an aggregate with no denominator is how the
// earlier 'no change in the baseline' null results got mistaken for evidence.
const biasStats = { calls: 0, flips: 0, holds: 0, invalidations: 0, disagreements: 0, ranged: 0, nolvl: 0 };
const t0 = Date.now();

/* -------------------------------------------------------------------------
 * --real  WALK REAL MARKET DATA INSTEAD OF synth.js
 *
 * WHY. Every figure in BASELINE.txt was produced on synth.js, whose dealing ranges
 * measure p50 42.8 ATR against 8.3 ATR on real EURUSD 15m — about 5x too wide. A
 * wider range puts the target farther and the stop nearer to being hit first, so the
 * synthetic win rate is biased LOW and expectancy biased DOWN. The sign of that
 * distortion is knowable; its size is not. So no figure from synth.js can rank two
 * configurations, and the question the audit was commissioned to answer — does the
 * bot perform the way the course says it should — cannot be answered without this.
 *
 * WHAT IT CHANGES. Only the SOURCE of `candles`. htfAll is still
 * Synth.aggregate(candles, 4), the window, warmup, fill, cooldown, gate and every
 * scoring path are untouched, and the engine is still the app's unmodified
 * smc.js + setup.js. With --real omitted the walk is byte-for-byte the old one.
 *
 * WHAT IT IS NOT. Not live data, and not a large sample: the fixtures are a few
 * thousand real bars per instrument over a few weeks (see candle-shim.js's
 * provenance table). Overlapping windows on one continuous series are NOT
 * independent samples, so the effective n is far below the trade count printed.
 * Read the result as a direction and a sanity check on the synthetic distortion,
 * never as a confidence interval.
 * ---------------------------------------------------------------------------*/
const REAL = process.argv.includes('--real');
// NOTE: `arg()` above coerces with Number(), so it cannot carry a string value —
// passing '15m' through it produced NaN and matched no fixture. Read strings separately.
const REAL_TF = (() => {
  const i = process.argv.indexOf('--realtf');
  return i > -1 && process.argv[i + 1] ? String(process.argv[i + 1]) : '15m';
})();
const FIXDIR = path.join(__dirname, '..', 'fixtures');   // analysis/fixtures, not analysis/harness/fixtures
function loadFixture(file) {
  const txt = fs.readFileSync(path.join(FIXDIR, file), 'utf8').trim().split(/\r?\n/).slice(1);
  const out = [];
  for (const l of txt) {
    const p = l.split(',');
    if (p.length < 5) continue;
    const t = Date.parse(p[0].trim().replace(' ', 'T') + 'Z');
    const o = +p[1], h = +p[2], lo = +p[3], c = +p[4];
    if (!Number.isFinite(t) || ![o, h, lo, c].every(Number.isFinite)) continue;
    out.push({ t, o, h, l: lo, c, v: +p[5] || 0 });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
const REAL_SETS = REAL
  ? (fs.existsSync(FIXDIR)
      ? fs.readdirSync(FIXDIR).filter((n) => n.endsWith('-' + REAL_TF + '.csv')).sort()
      : [])
  : [];
if (REAL && !REAL_SETS.length) {
  console.error(`--real: no fixtures matching *-${REAL_TF}.csv in ${FIXDIR}.`);
  console.error('Re-fetch them per the provenance table in analysis/candle-shim.js (via api.github.com).');
  process.exit(2);
}
const NWALK = REAL ? REAL_SETS.length : SEEDS;

for (let wi = 0; wi < NWALK; wi++) {
  const seed = wi + 1;                       // kept so every downstream `seed` reference still works
  const candles = REAL ? loadFixture(REAL_SETS[wi]) : Synth.series({ seed, bars: BARS });
  const htfAll = Synth.aggregate(candles, 4);
  let openUntil = -1;
  // Per-walk hysteresis state: what the server keeps in the bias_state table. Reset with the walk,
  // never carried between seeds — unrelated windows must not share a bias.
  let heldState = { bias: 0, level: null, side: null };

  for (let i = WARMUP; i < candles.length - 5; i++) {
    if (i <= openUntil) continue;
    const win = candles.slice(Math.max(0, i - WINDOW), i + 1);
    const htf = htfAll.filter((b) => b.t <= candles[i].t).slice(-80);
    let analysis;
    // `now` is driven from the candle, not the wall clock. The engine multiplies the score by
    // (0.82 + 0.18 * sessions.quality) and quality runs 0.30 -> 1.00 across the day, so leaving
    // the clock free made every baseline time-of-day dependent (measured: identical candles
    // scored 30.57-33.13 depending on the hour). The series starts 2024-01-01T00:00Z on 15m
    // bars, so advancing `now` with the bar walks the run through every killzone -- which is
    // also what makes the killzone veto measurable instead of all-or-nothing per run.
    try { analysis = SMC.analyse(win, { tf: '15m', htfCandles: htf.length > 30 ? htf : null, now: AT_MS != null ? AT_MS : candles[i].t, swingMode: SWING, nested: NESTED, obRequiresFvg: OB_FVG, allSwings: ALL_SWINGS }); }
    catch (e) { continue; }
    if (!analysis || !analysis.ok) continue;

    let res;
    // Pass an account so the risk plan is built — M58 scales position size by grade, and
    // that only exists when balance/riskPct are present.
    // M120: supply the bias the server would have supplied, when asked to. Left absent
    // (not 0) in the default mode so the recorded baselines reproduce exactly.
    const htfTrend = analysis.htf_structure ? analysis.htf_structure.trend : null;
    let biasDir = BIAS_MODE === 'htf' ? (htfTrend === 'bullish' ? 1 : htfTrend === 'bearish' ? -1 : 0) : null;
    if (BIAS_MODE === 'held') {
      // M50 — run the SHIPPED rule over the walk instead of handing buildSetups the raw HTF read.
      // `biasHysteresis` is pure, so the walk carries the state itself: exactly what db.js and
      // bots/index.js do in the server, minus the persistence. The invalidation level mirrors
      // topdown.js — a short is voided by a close ABOVE the range high, a long by a close BELOW
      // the range low. There is no sweep price in this harness, so it falls back to the range
      // extreme, which is topdown.js's own documented fallback (sweepPrice || R.h / R.l).
      // The level TESTED is the one stored when the bias was adopted, not one recomputed from
      // today's range: recomputing lets the market move the goalposts that define being wrong.
      const fresh = htfTrend === 'bullish' ? 1 : htfTrend === 'bearish' ? -1 : 0;
      let hh = -Infinity, ll = Infinity;
      for (const b of htf) { if (b.h > hh) hh = b.h; if (b.l < ll) ll = b.l; }
      const hasRange = Number.isFinite(hh) && Number.isFinite(ll) && hh > ll;
      const h = MOM.biasHysteresis({ priorBias: heldState.bias, freshBias: fresh, invalidation: { level: heldState.level, side: heldState.side }, close: candles[i].c });
      biasStats.calls++;
      if (h.changed) biasStats.flips++;
      if (h.held) biasStats.holds++;
      if (h.invalidated) biasStats.invalidations++;
      if (h.disagreement !== null && h.disagreement !== undefined) biasStats.disagreements++;
      if (fresh === 0) biasStats.ranged++;
      if (!hasRange) biasStats.nolvl++;
      heldState = { bias: h.bias, level: fresh === -1 && hasRange ? hh : fresh === 1 && hasRange ? ll : null, side: fresh === -1 ? 'above' : fresh === 1 ? 'below' : null };
      biasDir = h.bias;
    }
    try { res = Setup.buildSetups(analysis, { price: candles[i].c, balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex', useBreakers: USE_BREAKERS, standDownOnWall: STAND_DOWN_WALL, ladderTargets: LADDER, ...(biasDir !== null ? { bias: biasDir } : {}) }); }
    catch (e) { continue; }

    const cands = (res && res.candidates) || [];
    const c = cands.find((x) => x.ok && x.levels && x.levels.entry > 0 && x.levels.stop > 0 &&
      (!ONLY_AT_ENTRY || x.levels.entry_status === 'at-entry'));
    if (!c) continue;

    const sim = simulate(candles, i + 1, c.levels, MAX_BARS, FILL_WINDOW);
    if (!sim) continue;
    openUntil = i + sim.bars + COOLDOWN;
    all.push({ seed, bar: i, side: c.levels.side, grade: c.grade, score: c.score,
      entry_status: c.levels.entry_status, rr_declared: (c.levels.targets[0] || {}).rr,
      // M58: the multiplier the engine applied, so dollar outcomes can be computed with and
      // without grade sizing from a single run.
      mult: (c.risk && c.risk.grade_risk_multiplier != null) ? c.risk.grade_risk_multiplier : 1,
      // M52: the range-position multiplier, captured separately so the two arms stay separable.
      // Taken from what the engine EMITTED, not recomputed here — a harness that re-derived the
      // rule would be testing its own copy of it.
      rangeMult: (c.risk && c.risk.range_risk_multiplier != null) ? c.risk.range_risk_multiplier : 1,
      ...sim });
  }
}

const ms = Date.now() - t0;
const by = (f) => stats(all.filter(f));

console.log('\n' + '='.repeat(78));
console.log(` INDEPENDENT WALK-FORWARD BACKTEST  —  ${REAL ? 'REAL MARKET DATA' : 'SYNTHETIC DATA'}`);
console.log('=' .repeat(78));
// M120: the flag is printed ONLY when it is on, so the default output stays byte-for-byte
// identical to Baselines 1-6 and a diff against BASELINE.txt still means what it says.
console.log(REAL ? ` REAL DATA (${REAL_TF}) — ${REAL_SETS.length} fixture(s): ${REAL_SETS.join(', ')}  ·  windows=${WINDOW} warmup=${WARMUP} maxBars=${MAX_BARS} fillWindow=${FILL_WINDOW} cooldown=${COOLDOWN}` : ` seeds=${SEEDS} bars=${BARS} window=${WINDOW} warmup=${WARMUP} maxBars=${MAX_BARS} fillWindow=${FILL_WINDOW} cooldown=${COOLDOWN}  gate=${ONLY_AT_ENTRY ? "entry_status==='at-entry'" : 'any status'}${BIAS_MODE !== 'off' ? `  bias=${BIAS_MODE}` : ''}${RANGE_SIZED ? '  range-sized=on' : ''}  ·  ${all.length} trades  ·  ${ms}ms`);
console.log(` engine: src/bots/smc.js analyse() + src/bots/setup.js buildSetups()  (unmodified paths)`);
console.log('\n ALL SIGNALS WHERE ok===true (the CURRENT gate, includes B and C)');
console.log('  ' + fmt(by(() => true)));
for (const g of ['A+', 'A', 'B', 'C']) {
  const s = by((t) => t.grade === g);
  if (s.n) console.log(`   grade ${g.padEnd(3)} ${fmt(s)}`);
}
const aa = by((t) => t.grade === 'A+' || t.grade === 'A');
const bc = by((t) => t.grade === 'B' || t.grade === 'C');
if (BIAS_MODE === 'held') {
  // Printed only for the arm that produces them, and always with the denominator: 0 flips out of
  // 0 evaluated would otherwise look identical to 0 flips out of 7000.
  console.log('\n BIAS HYSTERESIS (M50) — the shipped rule, run over the walk');
  console.log(`   bias reads evaluated        ${biasStats.calls}`);
  console.log(`   ...held against a fresh read ${biasStats.holds} (${(100 * biasStats.holds / Math.max(1, biasStats.calls)).toFixed(1)}%)`);
  console.log(`   ...where fresh disagreed     ${biasStats.disagreements} (${(100 * biasStats.disagreements / Math.max(1, biasStats.calls)).toFixed(1)}%)`);
  console.log(`   bias changes                 ${biasStats.flips} (${(100 * biasStats.flips / Math.max(1, biasStats.calls)).toFixed(2)}%)`);
  console.log(`   ...with an invalidating close ${biasStats.invalidations} of ${biasStats.flips}`);
  console.log(`   fresh reads that were flat    ${biasStats.ranged} (held, not invalidated)`);
  console.log(`   bars with no usable HTF range ${biasStats.nolvl} (no level to store)`);
}
console.log('\n THE M95 DECISION, MEASURED');
console.log(`   A+ and A only   ${fmt(aa)}`);
console.log(`   B and C only    ${fmt(bc)}`);
console.log(`   -> dropping B and C changes expectancy by ${(all.length ? (aa.exp - by(() => true).exp) : 0).toFixed(4)}R`);

console.log('\n DECLARED R:R vs REALISED (is the target actually reachable?)');
const withRR = all.filter((t) => t.rr_declared > 0);
if (withRR.length) {
  const avgDeclared = withRR.reduce((s, t) => s + t.rr_declared, 0) / withRR.length;
  const avgRealised = withRR.reduce((s, t) => s + t.r, 0) / withRR.length;
  console.log(`   avg declared ${avgDeclared.toFixed(2)}R   avg realised ${avgRealised.toFixed(3)}R   ratio ${(avgRealised / avgDeclared).toFixed(3)}`);
  const hitT = all.filter((t) => t.outcome === 'target').length;
  const hitS = all.filter((t) => t.outcome === 'stop').length;
  const open = all.filter((t) => t.outcome === 'expired').length;
  console.log(`   target ${hitT}  ·  stop ${hitS}  ·  expired ${open}`);
}

/* ---- M58: does grade-sized deployment beat flat deployment, in dollars? ---- */
// R is normalised by risk, so a sizing change cannot move expectancy measured in R.
// The measurable effects are dollar expectancy and the volatility of the equity path.
const BAL = 10000, PCT = 1;
const dollar = (tr, m) => BAL * (PCT / 100) * m * tr.r;
function pathStats(trades, m) {
  let eq = 0, peak = 0, maxDD = 0;
  const pnl = trades.map((t) => dollar(t, m));
  for (const p of pnl) { eq += p; if (eq > peak) peak = eq; if (peak - eq > maxDD) maxDD = peak - eq; }
  const mean = pnl.reduce((a, b) => a + b, 0) / (pnl.length || 1);
  const sd = Math.sqrt(pnl.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (pnl.length || 1));
  return { total: eq, maxDD, sd, perTrade: mean };
}
const flat = pathStats(all, 1);
// sized: apply the engine's own per-grade multiplier
let eqS = 0, peakS = 0, maxDDS = 0;
const pnlS = all.map((t) => dollar(t, t.mult));
for (const p of pnlS) { eqS += p; if (eqS > peakS) peakS = eqS; if (peakS - eqS > maxDDS) maxDDS = peakS - eqS; }
const meanS = pnlS.reduce((a, b) => a + b, 0) / (pnlS.length || 1);
const sdS = Math.sqrt(pnlS.reduce((a, b) => a + (b - meanS) * (b - meanS), 0) / (pnlS.length || 1));

console.log('\n M58 — FLAT vs GRADE-SIZED DEPLOYMENT ($10k account, 1% configured risk)');
console.log(`   flat  1% on every trade   total $${flat.total.toFixed(0).padStart(6)}   maxDD $${flat.maxDD.toFixed(0).padStart(5)}   sd/trade $${flat.sd.toFixed(2)}`);
console.log(`   sized by grade            total $${eqS.toFixed(0).padStart(6)}   maxDD $${maxDDS.toFixed(0).padStart(5)}   sd/trade $${sdS.toFixed(2)}`);
console.log(`   -> expectancy in R is unchanged by design (${by(() => true).exp.toFixed(4)}R); sizing moves dollars and variance`);
const delta = eqS - flat.total;
if (flat.total < 0 && delta > 0) console.log(`   -> losses reduced by $${delta.toFixed(0)} (${((1 - eqS / flat.total) * 100).toFixed(1)}%); drawdown down $${(flat.maxDD - maxDDS).toFixed(0)}, per-trade sd down $${(flat.sd - sdS).toFixed(2)}`);
else if (delta < 0) console.log(`   -> costs $${Math.abs(delta).toFixed(0)} of profit (the price of sizing down B and C), but drawdown down $${(flat.maxDD - maxDDS).toFixed(0)}`);
else console.log(`   -> no change in dollars`);

if (RANGE_SIZED) {
  // M52: grade x range position. Same trade population — sizing does not decide entries — so this
  // arm isolates the dollar and variance effect of the mid-range reduction and nothing else.
  let eqR = 0, peakR = 0, maxDDR = 0;
  const pnlR = all.map((t) => BAL * (PCT / 100) * t.mult * t.rangeMult * t.r);
  for (const q of pnlR) { eqR += q; if (eqR > peakR) peakR = eqR; if (peakR - eqR > maxDDR) maxDDR = peakR - eqR; }
  const meanR = pnlR.reduce((a, b) => a + b, 0) / (pnlR.length || 1);
  const sdR = Math.sqrt(pnlR.reduce((a, b) => a + (b - meanR) * (b - meanR), 0) / (pnlR.length || 1));
  const cut = all.filter((t) => t.rangeMult < 1);
  const meanRangeMult = all.reduce((a, t) => a + t.rangeMult, 0) / (all.length || 1);
  console.log('\n M52 — GRADE x RANGE-POSITION SIZING ($10k account, 1% configured risk)');
  console.log(`   sized by grade            total $${eqS.toFixed(0).padStart(6)}   maxDD $${maxDDS.toFixed(0).padStart(5)}   sd/trade $${sdS.toFixed(2)}`);
  console.log(`   sized by grade x range    total $${eqR.toFixed(0).padStart(6)}   maxDD $${maxDDR.toFixed(0).padStart(5)}   sd/trade $${sdR.toFixed(2)}`);
  console.log(`   -> ${cut.length}/${all.length} trades had risk reduced for range position; mean range multiplier ${meanRangeMult.toFixed(4)}`);
  const dR = eqR - eqS;
  console.log(`   -> vs grade-only sizing: ${dR >= 0 ? '+' : ''}$${dR.toFixed(0)} total, drawdown ${maxDDR <= maxDDS ? 'down' : 'up'} $${Math.abs(maxDDS - maxDDR).toFixed(0)}, per-trade sd ${sdR <= sdS ? 'down' : 'up'} $${Math.abs(sdS - sdR).toFixed(2)}`);
  console.log(`   -> expectancy in R is unchanged by construction (${by(() => true).exp.toFixed(4)}R): sizing cannot move an R-multiple`);
  // WHY the dollar total moves the way it does. A dollar is `BAL*PCT/100 * gradeMult * rangeMult * r`,
  // so the entire effect of this arm is the exact decomposition below, summed over the trades whose
  // range multiplier is below 1. Reporting UNWEIGHTED R here would misattribute it: the grade
  // multiplier weights every trade, so a subset can be negative in raw R and still be positive once
  // weighted, which is what happened at 60 seeds. Both are printed so the difference is visible.
  const rest = all.filter((t) => t.rangeMult >= 1);
  const sum = (xs, f) => xs.reduce((a, t) => a + f(t), 0);
  const UNIT = BAL * (PCT / 100);
  const expR = (xs) => (xs.length ? sum(xs, (t) => t.r) / xs.length : 0);
  const wR = (xs) => sum(xs, (t) => t.mult * t.r);                       // grade-weighted R
  const dDollars = sum(cut, (t) => UNIT * t.mult * (t.rangeMult - 1) * t.r);
  console.log(`   -> reduced subset   n=${String(cut.length).padStart(4)}  rawR ${sum(cut, (t) => t.r).toFixed(2).padStart(8)} (exp ${expR(cut).toFixed(4)}R)  grade-weighted R ${wR(cut).toFixed(2).padStart(8)}`);
  console.log(`   -> unreduced subset n=${String(rest.length).padStart(4)}  rawR ${sum(rest, (t) => t.r).toFixed(2).padStart(8)} (exp ${expR(rest).toFixed(4)}R)  grade-weighted R ${wR(rest).toFixed(2).padStart(8)}`);
  console.log(`   -> all trades       n=${String(all.length).padStart(4)}  rawR ${sum(all, (t) => t.r).toFixed(2).padStart(8)} (exp ${expR(all).toFixed(4)}R)  grade-weighted R ${wR(all).toFixed(2).padStart(8)}`);
  console.log(`   -> dollar effect of the cut, exactly: ${dDollars >= 0 ? '+' : ''}$${dDollars.toFixed(0)} (= UNIT x sum over cut trades of gradeMult x (rangeMult-1) x r)`);
  console.log(dDollars < 0
    ? `   -> on this sample the cut COST $${Math.abs(dDollars).toFixed(0)}.`
    : `   -> on this sample the cut SAVED $${dDollars.toFixed(0)}.`);
  // The subset's own aggregate R does NOT decide that sign, and saying so plainly matters: an
  // earlier version of this line inferred "saved money" from the weighted R being negative while
  // the exact sum said the opposite. Each trade is cut by a DIFFERENT factor, so the effect is
  // sum(gradeMult x (rangeMult - 1) x r), not (aggregate R) x (mean cut). Print both so the gap
  // between the naive reading and the true one is visible instead of hidden.
  const meanCut = cut.length ? sum(cut, (t) => t.rangeMult) / cut.length : 1;
  const naive = UNIT * wR(cut) * (meanCut - 1);
  console.log(`   -> naive reading (aggregate weighted R x mean cut) predicts ${naive >= 0 ? '+' : ''}$${naive.toFixed(0)}; the exact sum is ${dDollars >= 0 ? '+' : ''}$${dDollars.toFixed(0)}.`);
  console.log(`      They differ because a heavily-cut trade with a large +r dominates the exact sum,`);
  console.log(`      which the aggregate throws away. Quote the exact figure, not the naive one.`);
  console.log(`   -> n=${cut.length} reduced trades is ${cut.length < 100 ? 'BELOW' : 'at or above'} this ledger's ~100-trade noise threshold (§6), so treat the sign as unmeasured.`);
}

console.log('\n PER-SEED (is one series dominating the result?)');
for (let s = 1; s <= SEEDS; s++) console.log(`   seed ${s}  ${fmt(by((t) => t.seed === s))}`);

// The caveat has to change with the data, or the output mislabels itself — which is the
// same class of defect as a string that outlives the decision it describes (M51).
console.log(REAL
  ? `\n⚠ REAL bars, but a SMALL and DEPENDENT sample. ${REAL_SETS.length} fixture(s), ${NWALK} walk(s),
  overlapping 300-bar windows on one continuous series, so consecutive trades are NOT
  independent and the effective n is far below the count printed. The course's own
  threshold (Ep 27) is 30-50 trades minimum and 100 preferred before any conclusion;
  treat this as a direction and a check on the synthetic distortion, never as a
  confidence interval, and never as evidence of edge either way.`
  : `\n⚠ Synthetic data. This measures internal consistency of the entry/stop/target
  logic, NOT real-market edge. Do not quote these figures as performance.\n`);
process.exit(0);
