#!/usr/bin/env node
'use strict';
/**
 * CHECK-DISCRIMINATION ANALYSIS — why is the grade ladder inverted?
 *
 * The harness found, stably across every run, that grade A+ performs WORST (-0.49R, n=52)
 * and grade A best (-0.23R). Before re-weighting anything, this measures which individual
 * checkpoints actually separate winners from losers on the same sample.
 *
 * For each check it reports:
 *   pass-rate, expectancy when PASSED, expectancy when FAILED, and the spread between them.
 * A check with a near-zero spread carries no information but still moves the score — that is
 * how a ladder inverts. A negative spread means the check is actively backwards.
 *
 * Usage: node analysis/check-discrimination.js [--seeds 60]
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(ROOT, 'src/bots/smc.js'));
const Setup = require(path.join(ROOT, 'src/bots/setup.js'));
const Synth = require('./harness/synth.js');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? Number(argv[i + 1]) : d; };
const SEEDS = arg('seeds', 40), BARS = arg('bars', 1500), WINDOW = arg('window', 300);
const WARMUP = 120, MAX_BARS = 20, FILL_WINDOW = 12, COOLDOWN = 12;

function simulate(candles, from, lv) {
  const buy = lv.side === 'buy';
  const entry = lv.entry, stop = lv.stop;
  const risk = buy ? entry - stop : stop - entry;
  if (!(risk > 0)) return null;
  const t1 = (lv.targets && lv.targets[0]) || null;
  if (!t1) return null;
  const target = t1.price;
  if (buy ? target <= entry : target >= entry) return null;
  let fill = -1;
  const fEnd = Math.min(candles.length - 1, from + FILL_WINDOW - 1);
  for (let i = from; i <= fEnd; i++) {
    const b = candles[i];
    if (buy ? b.l <= entry : b.h >= entry) { fill = i; break; }
    if (buy ? b.h >= target : b.l <= target) return null;
  }
  if (fill < 0) return null;
  const last_i = Math.min(candles.length - 1, fill + MAX_BARS - 1);
  for (let i = fill; i <= last_i; i++) {
    const b = candles[i];
    if (buy ? b.l <= stop : b.h >= stop) return { r: -1 };
    if (buy ? b.h >= target : b.l <= target) return { r: Math.abs(target - entry) / risk };
  }
  const last = candles[last_i];
  return { r: buy ? (last.c - entry) / risk : (entry - last.c) / risk };
}

const acc = {};   // key -> { pass:[r], fail:[r], weight }
const grades = {};
let trades = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  const candles = Synth.series({ seed, bars: BARS });
  const htfAll = Synth.aggregate(candles, 4);
  let openUntil = -1;
  for (let i = WARMUP; i < candles.length - 5; i++) {
    if (i <= openUntil) continue;
    const win = candles.slice(Math.max(0, i - WINDOW), i + 1);
    const htf = htfAll.filter((b) => b.t <= candles[i].t).slice(-80);
    let a; try { a = SMC.analyse(win, { tf: '15m', htfCandles: htf.length > 30 ? htf : null, now: candles[i].t }); } catch (e) { continue; }
    if (!a || !a.ok) continue;
    let r; try { r = Setup.buildSetups(a, { price: candles[i].c, balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex' }); } catch (e) { continue; }
    const c = (r.candidates || []).find((x) => x.ok && x.levels && x.levels.entry > 0 && x.levels.stop > 0 && x.levels.entry_status === 'at-entry');
    if (!c) continue;
    const sim = simulate(candles, i + 1, c.levels);
    if (!sim) continue;
    openUntil = i + sim.bars + COOLDOWN;
    trades++;
    (grades[c.grade] = grades[c.grade] || []).push(sim.r);
    for (const ck of (c.checks || [])) {
      const k = ck.key;
      acc[k] = acc[k] || { pass: [], fail: [], weight: ck.weight, label: ck.label };
      (ck.pass ? acc[k].pass : acc[k].fail).push(sim.r);
    }
  }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const f = (v) => (v === null ? '  n/a ' : (v >= 0 ? '+' : '') + v.toFixed(3));

console.log(`\n${'='.repeat(96)}`);
console.log(` CHECK DISCRIMINATION — ${trades} trades, ${SEEDS} seeds. SYNTHETIC DATA.`);
console.log(`${'='.repeat(96)}`);
console.log('\n GRADES (is the ladder monotonic?)');
for (const g of ['A+', 'A', 'B', 'C']) {
  const a = grades[g]; if (!a || !a.length) continue;
  console.log(`   ${g.padEnd(3)} n=${String(a.length).padStart(4)}  exp ${f(mean(a))}R  win ${(100 * a.filter((x) => x > 0).length / a.length).toFixed(1)}%`);
}

const rows = Object.keys(acc).map((k) => {
  const p = mean(acc[k].pass), q = mean(acc[k].fail);
  return { k, label: acc[k].label, w: acc[k].weight, np: acc[k].pass.length, nf: acc[k].fail.length, p, q, spread: (p !== null && q !== null) ? p - q : null };
}).sort((a, b) => (b.spread === null ? -1 : a.spread === null ? 1 : Math.abs(b.spread) - Math.abs(a.spread)));

console.log('\n CHECKS, ranked by |spread| between expectancy when PASSED and when FAILED');
console.log('   a near-zero spread = the check carries no information but still moves the score');
console.log('   a NEGATIVE spread = the check is backwards on this data');
console.log('  ' + '-'.repeat(92));
console.log('   key            w   nPass nFail   exp|pass  exp|fail   spread');
for (const r of rows) {
  console.log(`   ${r.k.padEnd(14)} ${String(r.w).padStart(2)}  ${String(r.np).padStart(5)} ${String(r.nf).padStart(5)}   ${f(r.p)}    ${f(r.q)}   ${r.spread === null ? '  n/a' : (r.spread >= 0 ? '+' : '') + r.spread.toFixed(3)}  ${r.label.slice(0, 34)}`);
}
const zero = rows.filter((r) => r.w > 0 && r.spread !== null && Math.abs(r.spread) < 0.05);
const neg = rows.filter((r) => r.w > 0 && r.spread !== null && r.spread < -0.05);
const dead = rows.filter((r) => r.w === 0);
console.log('\n  weighted but uninformative (|spread| < 0.05R): ' + (zero.map((r) => `${r.k}(w${r.w})`).join(', ') || 'none'));
console.log('  weighted and BACKWARDS    (spread < -0.05R):  ' + (neg.map((r) => `${r.k}(w${r.w})`).join(', ') || 'none'));
console.log('  registered at weight 0 (can never move the grade): ' + (dead.map((r) => r.k).join(', ') || 'none'));
console.log('\n⚠ Synthetic data. This ranks checks by information content on structured synthetic\n  series — it is a hypothesis for re-weighting, not a licence to fit to noise.\n');
