/* M1 — measure, do not patch.
 *
 * The ledger's remedy for M1 is explicitly "run both swing definitions over the fixtures and
 * diff the resulting trend labels and BOS events. If labels shift materially this is a strategy
 * change needing a backtest." So this file CHANGES NOTHING. It implements the course's
 * definition alongside the code's and diffs them through the project's own `marketStructure`.
 *
 *   code's definition   a bar that is the strict local max/min of N bars either side (N=2/5)
 *   course's definition "the lowest point that CREATED the break of structure" — the extreme
 *                       that originated the impulse, not merely a local turning point
 *
 *   node analysis/probe-m1-swing-definition.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(ROOT, 'src/bots/smc.js'));
const Synth = require('./harness/synth.js');

/**
 * The course's swings. A candidate extreme is kept only if price subsequently broke the most
 * recent opposite swing — i.e. that extreme is what CREATED a break of structure. A local
 * turning point that never produced a break is not a swing by this definition.
 * Candidates come from the code's own minor tier so the only variable under test is the rule.
 */
function courseSwings(candles, minor) {
  const kept = [];
  for (let k = 0; k < minor.length; k++) {
    const s = minor[k];
    let level = null;
    for (let j = k - 1; j >= 0; j--) { if (minor[j].type !== s.type) { level = minor[j]; break; } }
    if (!level) { kept.push(s); continue; }
    const after = candles.slice(s.i + 1);
    const broke = s.type === 'low'
      ? after.some((c) => c.c > level.price)
      : after.some((c) => c.c < level.price);
    if (broke) kept.push(s);
  }
  return SMC.alternate(kept);
}

const SEEDS = 40, BARS = 300;
let rows = [];
const tally = { same_trend: 0, diff_trend: 0 };
const flips = {};
let swingCode = 0, swingCourse = 0, brkCode = 0, brkCourse = 0;
const rangeCode = [], rangeCourse = [];

for (let seed = 1; seed <= SEEDS; seed++) {
  const candles = Synth.series({ seed, bars: BARS });
  const codeMinor = SMC.alternate(SMC.findSwings(candles, 2));
  const course = courseSwings(candles, codeMinor);

  const a = SMC.marketStructure(candles, codeMinor);   // the project's own function
  const b = SMC.marketStructure(candles, course);      // same function, course's swings

  swingCode += codeMinor.length; swingCourse += course.length;
  brkCode += a.breaks.length; brkCourse += b.breaks.length;

  const rc = swingRange(codeMinor), rk = swingRange(course);
  if (rc) rangeCode.push(rc); if (rk) rangeCourse.push(rk);

  if (a.trend === b.trend) tally.same_trend++;
  else { tally.diff_trend++; const k = a.trend + '->' + b.trend; flips[k] = (flips[k] || 0) + 1; }

  rows.push({ seed, nCode: codeMinor.length, nCourse: course.length, tCode: a.trend, tCourse: b.trend,
    bCode: a.breaks.length, bCourse: b.breaks.length });
}

function swingRange(sw) {
  const h = sw.filter((x) => x.type === 'high').slice(-1)[0];
  const l = sw.filter((x) => x.type === 'low').slice(-1)[0];
  return h && l && h.price > l.price ? (h.price - l.price) / l.price * 100 : null;
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

console.log(`\n M1 MEASUREMENT — ${SEEDS} series x ${BARS} bars, through the project's own marketStructure()`);
console.log(' the code is UNCHANGED by this file.\n');
console.log(' swings per series      code(minor tier) ' + (swingCode / SEEDS).toFixed(1)
  + '   course ' + (swingCourse / SEEDS).toFixed(1)
  + '   -> course keeps ' + (100 * swingCourse / swingCode).toFixed(0) + '%');
console.log(' structure events       code ' + (brkCode / SEEDS).toFixed(1)
  + '   course ' + (brkCourse / SEEDS).toFixed(1)
  + '   -> ' + (100 * brkCourse / brkCode).toFixed(0) + '%');
console.log('');
console.log(' TREND LABEL AGREEMENT');
console.log('   identical : ' + tally.same_trend + '/' + SEEDS + '  (' + (100 * tally.same_trend / SEEDS).toFixed(0) + '%)');
console.log('   different : ' + tally.diff_trend + '/' + SEEDS + '  (' + (100 * tally.diff_trend / SEEDS).toFixed(0) + '%)');
if (Object.keys(flips).length) {
  console.log('   which way : ' + Object.entries(flips).map(([k, v]) => k + ' x' + v).join(', '));
}
console.log('');
console.log(' SWING RANGE WIDTH (last high to last low, % of price)');
console.log('   code ' + avg(rangeCode).toFixed(3) + '%   course ' + avg(rangeCourse).toFixed(3) + '%');
console.log('');

console.log(' first 12 series:');
console.log('  seed  swings(code/course)  trend(code -> course)  events(code/course)');
for (const r of rows.slice(0, 12)) {
  console.log('  ' + String(r.seed).padStart(4) + '  '
    + (r.nCode + ' / ' + r.nCourse).padStart(19) + '  '
    + (r.tCode + ' -> ' + r.tCourse + (r.tCode === r.tCourse ? '' : '   <-- DIFFERS')).padEnd(30) + ' '
    + (r.bCode + ' / ' + r.bCourse));
}

const material = tally.diff_trend / SEEDS;
console.log('');
console.log(' ── VERDICT ─────────────────────────────────────────────────────────────');
if (material >= 0.25) {
  console.log(' ' + (100 * material).toFixed(0) + '% of series change trend label. That is MATERIAL: adopting the');
  console.log(' course definition is a strategy change and needs its own backtest before it ships.');
} else if (material > 0) {
  console.log(' ' + (100 * material).toFixed(0) + '% of series change trend label. Present but not dominant — the two');
  console.log(' definitions mostly agree, so the divergence is narrower than the ledger implied.');
} else {
  console.log(' The two definitions agree on every trend label tested.');
}
console.log(' The course tier is far sparser (' + (100 * swingCourse / swingCode).toFixed(0)
  + '% of the swings), which is the real difference:');
console.log(' it discards local turning points that never produced a break of structure.');
console.log('');
