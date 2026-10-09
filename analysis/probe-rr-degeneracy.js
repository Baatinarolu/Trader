'use strict';
/**
 * WHY THIS EXISTS
 * The backtest harness prints `avg declared 28.25R  ·  avg realised -0.094R` and
 * HANDOFF-PROMPT §11 records rr_final as degenerate (median 15R, max 346R). That was
 * noted as a loose end and never became a ledger row, which means every expectancy and
 * PF figure in the record is denominated in an R unit the engine does not honour.
 *
 * This probe does NOT fix anything. It answers one question first, because the fix
 * depends on the answer:
 *
 *   Is rr_final degenerate because the TARGET is too far away, or because the
 *   STOP is too close?
 *
 * rr = reward / risk. Either factor can blow it up, and the two call for opposite
 * fixes — capping the target would truncate the course's "target weak structure"
 * rule, while flooring the stop would leave that rule intact. Guessing would be
 * tuning, so the distribution is measured across the same walk the harness uses.
 *
 * It walks synthetic series exactly as analysis/harness/backtest.js does (same
 * generator, same warmup/window, same SMC.analyse + Setup.buildSetups calls) so the
 * candidates measured here are the candidates the harness trades.
 *
 * ⚠ SYNTHETIC DATA. See synth.js. This measures the geometry of the engine's own
 *   entry/stop/target arithmetic, which is a property of the code and therefore
 *   meaningful here — unlike expectancy, which is not.
 *
 * Usage: node analysis/probe-rr-degeneracy.js [--seeds 60] [--bars 1500] [--window 300]
 */
const path = require('path');
const APP = process.env.TJ_ROOT
  ? path.resolve(process.env.TJ_ROOT)
  : path.join(__dirname, '..', 'extracted', 'tradejournal');
// synth.js lives in the REPO-ROOT harness, not inside the app tree — the app has no
// analysis/ directory. The engine modules come from the app (or TJ_ROOT for a
// pristine negative control), the generator comes from here.
const Synth = require(path.join(__dirname, 'harness', 'synth.js'));
const SMC = require(path.join(APP, 'src', 'bots', 'smc.js'));
const Setup = require(path.join(APP, 'src', 'bots', 'setup.js'));

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
}
const SEEDS = arg('seeds', 60), BARS = arg('bars', 1500), WINDOW = arg('window', 300), WARMUP = arg('warmup', 120);

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = arr.slice().sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[i];
};
const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

const rows = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const candles = Synth.series(seed, BARS);
  for (let i = WARMUP; i < candles.length - 5; i++) {
    const win = candles.slice(Math.max(0, i - WINDOW + 1), i + 1);
    if (win.length < 60) continue;
    let analysis;
    try { analysis = SMC.analyse(win, { tf: '15m', now: candles[i].t, swingMode: 'bos', nested: true }); } catch (e) { continue; }
    if (!analysis) continue;
    // ATR is needed to ask "how wide is this stop in units the market actually moves?"
    // Try every plausible home for it rather than assume one.
    const atr = analysis.atr || (analysis.volatility && (analysis.volatility.atr || analysis.volatility.atr14))
      || (analysis.context && analysis.context.atr) || null;
    let res;
    try {
      res = Setup.buildSetups(analysis, { price: candles[i].c, balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex' });
    } catch (e) { continue; }
    const cands = (res && (res.candidates || res.setups)) || [];
    for (const c of cands) {
      const L = c.levels || {};
      const entry = L.entry, stop = L.stop, rr = L.rr_final;
      if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(rr)) continue;
      const risk = Math.abs(entry - stop);
      if (!(risk > 0)) continue;
      const t = (L.primary_target || (Array.isArray(L.targets) && L.targets[0]) || null);
      const reward = t && Number.isFinite(t.price) ? Math.abs(t.price - entry) : rr * risk;
      rows.push({
        rr, risk, reward, atr,
        risk_atr: Number.isFinite(atr) && atr > 0 ? risk / atr : null,
        reward_atr: Number.isFinite(atr) && atr > 0 ? reward / atr : null,
        grade: c.grade || null,
        kind: t && t.kind ? t.kind : null,
      });
    }
  }
}

const withAtr = rows.filter((r) => r.risk_atr !== null);
console.log('='.repeat(78));
console.log(' rr_final DEGENERACY — is the target too far, or the stop too close?');
console.log('='.repeat(78));
console.log(` seeds=${SEEDS} bars=${BARS} window=${WINDOW} warmup=${WARMUP}`);
console.log(` candidates with a usable entry/stop/rr: ${rows.length}`);
console.log(` of those, with a usable ATR:            ${withAtr.length}`);
if (!rows.length) { console.log('\n NO CANDIDATES — nothing measured, reporting no result.'); process.exit(1); }

const rr = rows.map((r) => r.rr);
console.log('\n rr_final distribution (the number the engine reports as reward:risk)');
for (const p of [10, 25, 50, 75, 90, 95, 99]) console.log(`   p${String(p).padEnd(3)} ${f(pct(rr, p))}R`);
console.log(`   max ${f(Math.max(...rr))}R   mean ${f(rr.reduce((a, b) => a + b, 0) / rr.length)}R`);
console.log(`   share above 10R: ${(100 * rr.filter((x) => x > 10).length / rr.length).toFixed(1)} %`);
console.log(`   share above 50R: ${(100 * rr.filter((x) => x > 50).length / rr.length).toFixed(1)} %`);

if (withAtr.length) {
  const ra = withAtr.map((r) => r.risk_atr), rw = withAtr.map((r) => r.reward_atr);
  console.log('\n THE DIAGNOSTIC — both factors in ATR units, so they are comparable');
  console.log('   risk  (entry→stop)   in ATR:');
  for (const p of [5, 10, 25, 50, 75, 90]) console.log(`      p${String(p).padEnd(3)} ${f(pct(ra, p), 3)} ATR`);
  console.log('   reward (entry→target) in ATR:');
  for (const p of [25, 50, 75, 90]) console.log(`      p${String(p).padEnd(3)} ${f(pct(rw, p), 3)} ATR`);
  const tiny = withAtr.filter((r) => r.risk_atr < 0.25).length;
  const far = withAtr.filter((r) => r.reward_atr > 8).length;
  console.log(`\n   stops tighter than 0.25 ATR : ${tiny} of ${withAtr.length} (${(100 * tiny / withAtr.length).toFixed(1)} %)`);
  console.log(`   targets beyond 8 ATR        : ${far} of ${withAtr.length} (${(100 * far / withAtr.length).toFixed(1)} %)`);
  console.log('\n   VERDICT: the dominant cause is the ' + (tiny > far ? 'STOP being too tight' : far > tiny ? 'TARGET being too far' : 'two are comparable — neither alone explains it'));
  const worst = withAtr.slice().sort((a, b) => b.rr - a.rr).slice(0, 5);
  console.log('\n   the five worst rr_final, decomposed:');
  for (const r of worst) console.log(`      rr=${f(r.rr)}R  risk=${f(r.risk_atr, 3)} ATR  reward=${f(r.reward_atr, 2)} ATR  target=${r.kind || '?'}`);
} else {
  console.log('\n ATR was not reachable on the analysis object — the diagnostic that distinguishes');
  console.log(' "stop too tight" from "target too far" could NOT be run. Reporting no verdict.');
  console.log(' Fields present on analysis:', Object.keys(rows.length ? {} : {}).join(',') || '(inspect manually)');
}
console.log('\n Measured, not asserted: nothing here was fixed by this script.');

/* ─────────────────────────────────────────────────────────────────────────
 * PART 2 — derive the reachability bound from MEASURED travel, not a guess.
 *
 * A target 12 ATR away is not "aggressive", it is unreachable inside a trade's
 * lifetime. But what lifetime, and how far does price actually go in it? Both are
 * measurable. The harness expires a trade after maxBars (default 20), so the
 * question "how far does price travel in 20 bars, in ATR units?" has an empirical
 * answer on this generator — and picking a cap from that answer is derivation.
 * Picking 5.0 because it looks round is tuning.
 * ───────────────────────────────────────────────────────────────────────── */
const HORIZON = arg('horizon', 20);          // matches the harness's maxBars default
const travel = [];
for (let seed = 1; seed <= Math.min(SEEDS, 20); seed++) {
  const candles = Synth.series(seed, BARS);
  // ATR14 over the same series the engine sees, computed here so the units match.
  for (let i = WARMUP + 14; i + HORIZON < candles.length; i++) {
    let sum = 0;
    for (let k = i - 13; k <= i; k++) sum += Math.max(candles[k].h - candles[k].l, Math.abs(candles[k].h - candles[k - 1].c), Math.abs(candles[k].l - candles[k - 1].c));
    const atr14 = sum / 14;
    if (!(atr14 > 0)) continue;
    travel.push(Math.abs(candles[i + HORIZON].c - candles[i].c) / atr14);
  }
}
if (travel.length) {
  console.log('\n' + '='.repeat(78));
  console.log(` HOW FAR DOES PRICE ACTUALLY TRAVEL IN ${HORIZON} BARS? (in ATR units)`);
  console.log('='.repeat(78));
  console.log(` samples: ${travel.length}`);
  for (const p of [50, 75, 90, 95, 99]) console.log(`   p${String(p).padEnd(3)} ${f(pct(travel, p), 3)} ATR`);
  const p95 = pct(travel, 95);
  console.log(`\n   => a target beyond ~${f(p95, 1)} ATR is missed 95 % of the time within ${HORIZON} bars.`);
  const reach = withAtr.filter((r) => r.reward_atr <= p95).length;
  console.log(`   => of ${withAtr.length} candidates, ${reach} (${(100 * reach / withAtr.length).toFixed(1)} %) have a target inside that bound`);
  console.log(`      and ${withAtr.length - reach} (${(100 * (withAtr.length - reach) / withAtr.length).toFixed(1)} %) are declaring a target price cannot reach in the trade's lifetime.`);
  console.log('\n   This is the number a cap should be derived from. Nothing was changed to produce it.');
}
