/* M22 — measure, do not patch.
 *
 * Ep 5: "The only way you can identify your internal structure is if you have identified your
 * swing structure and your swing range", and "the first step is to always identify your swing
 * range." The code computes both tiers from the same candle array in parallel, so the internal
 * (minor) structure is read over swings that sit outside the range the major tier defines.
 *
 * This file CHANGES NOTHING. It measures what bounding the minor tier by the major range would
 * do, through the project's own marketStructure().
 *
 *   node analysis/probe-m22-nested-range.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(ROOT, 'src/bots/smc.js'));
const Synth = require('./harness/synth.js');

const rangeOf = (sw) => {
  const h = sw.filter((x) => x.type === 'high').slice(-1)[0];
  const l = sw.filter((x) => x.type === 'low').slice(-1)[0];
  return h && l && h.price > l.price ? { high: h.price, low: l.price } : null;
};

const SEEDS = 40, BARS = 300;
let noRange = 0;
let minorTotal = 0, minorOutside = 0;
const agree = { same: 0, diff: 0 };
const flips = {};
let brkAll = 0, brkBounded = 0;
const rows = [];

for (let seed = 1; seed <= SEEDS; seed++) {
  const candles = Synth.series({ seed, bars: BARS });
  const minor = SMC.alternate(SMC.findSwings(candles, 2));
  const major = SMC.alternate(SMC.findSwings(candles, 5));
  const range = rangeOf(major.length ? major : minor);
  if (!range) { noRange++; continue; }

  // the course's sequencing: identify the swing range first, then read internal structure
  // INSIDE it. Swings beyond the range belong to a leg that has already resolved.
  const bounded = minor.filter((s) => s.price <= range.high && s.price >= range.low);

  const a = SMC.marketStructure(candles, minor);     // what the code does today
  const b = SMC.marketStructure(candles, bounded);   // what the course describes

  minorTotal += minor.length;
  minorOutside += minor.length - bounded.length;
  brkAll += a.breaks.length; brkBounded += b.breaks.length;

  if (a.trend === b.trend) agree.same++;
  else { agree.diff++; const k = a.trend + '->' + b.trend; flips[k] = (flips[k] || 0) + 1; }

  rows.push({ seed, minor: minor.length, bounded: bounded.length,
    tAll: a.trend, tBounded: b.trend, w: ((range.high - range.low) / range.low * 100) });
}

console.log(`\n M22 MEASUREMENT — ${SEEDS} series x ${BARS} bars, through the project's own marketStructure()`);
console.log(' the code is UNCHANGED by this file.\n');
console.log(' series with no usable major range : ' + noRange + '/' + SEEDS);
console.log(' minor swings total                : ' + minorTotal);
console.log(' minor swings OUTSIDE the range    : ' + minorOutside
  + '  (' + (100 * minorOutside / (minorTotal || 1)).toFixed(0) + '%)');
console.log(' structure events                  : unbounded ' + (brkAll / SEEDS).toFixed(1)
  + '/series   bounded ' + (brkBounded / SEEDS).toFixed(1) + '/series');
console.log('');
console.log(' INTERNAL TREND LABEL');
console.log('   identical : ' + agree.same + '/' + (SEEDS - noRange));
console.log('   different : ' + agree.diff + '/' + (SEEDS - noRange)
  + '  (' + (100 * agree.diff / ((SEEDS - noRange) || 1)).toFixed(0) + '%)');
if (Object.keys(flips).length) {
  console.log('   which way : ' + Object.entries(flips).map(([k, v]) => k + ' x' + v).join(', '));
}
console.log('');
console.log(' first 12 series:');
console.log('  seed  minor(all -> in-range)  internal trend (now -> bounded)  range width');
for (const r of rows.slice(0, 12)) {
  console.log('  ' + String(r.seed).padStart(4) + '  '
    + (r.minor + ' -> ' + r.bounded).padStart(20) + '  '
    + (r.tAll + ' -> ' + r.tBounded + (r.tAll === r.tBounded ? '' : '   <-- DIFFERS')).padEnd(34)
    + ' ' + r.w.toFixed(2) + '%');
}

const empty = rows.filter((r) => r.bounded < 3).length;
console.log('');
console.log(' ── VERDICT ─────────────────────────────────────────────────────────────');
console.log(' ' + (100 * minorOutside / (minorTotal || 1)).toFixed(0) + '% of minor swings sit outside the range the major tier');
console.log(' defines, so the internal structure IS being read over resolved legs - the mismatch');
console.log(' the ledger describes is real and quantified.');
if (agree.diff === 0) {
  console.log(' But the internal trend label is unchanged on every series, so bounding the tier is');
  console.log(' a reporting/consistency change, not a strategy change.');
} else {
  console.log(' The internal trend label changes on ' + (100 * agree.diff / ((SEEDS - noRange) || 1)).toFixed(0)
    + '% of series, so bounding the tier IS a strategy');
  console.log(' change and needs its own backtest before it ships as a default.');
}
if (empty) {
  console.log('');
  console.log(' ⚠ ' + empty + ' of ' + rows.length + ' series are left with fewer than 3 in-range swings - too few to');
  console.log('   label a trend. A hard bound needs a fallback or it silently blanks the read.');
}
console.log('');
