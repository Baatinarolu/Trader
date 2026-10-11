'use strict';
/** M131 — no higher-timeframe feature may contain a not-yet-observed child candle.
 * TJ_REPO selects the old harness/control. This is a data-causality test, not a return test.
 */
const path = require('path');
const fs = require('fs');
const ROOT = process.env.TJ_REPO || path.join(__dirname, '..');
const Synth = require(path.join(ROOT, 'analysis/harness/synth'));
let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(' ok   ' + label); }
  else { fail++; console.log(' FAIL ' + label + (detail ? ' — ' + detail : '')); }
};
const T = Date.parse('2026-07-15T06:00:00Z');
const cs = Array.from({ length: 12 }, (_, i) => ({ t: T + i * 900000, o: 100 + i,
  h: 102 + i, l: 99 + i, c: 101 + i, v: 100 }));
const all = Synth.aggregate(cs, 4);
// The negative arm executes the old harness expression, not an empty-array stub.
const visible = typeof Synth.visibleAggregates === 'function' ? Synth.visibleAggregates
  : (bars, at) => bars.filter((b) => b.t <= at);
ok('aggregate records the ACTUAL last constituent timestamp', all.length === 3 && all[0].last_t === cs[3].t);
ok('causal aggregate selector is exported', typeof Synth.visibleAggregates === 'function');
let compared = 0, leaks = 0;
for (let i = 0; i < cs.length; i++) {
  const prefix = Synth.aggregate(cs.slice(0, i + 1), 4);
  const r = visible(all, cs[i].t);
  if (prefix.length) compared++;
  const future = cs.map((b, k) => k <= i ? b : { ...b, h: 999999, l: 0, c: 999999 });
  const changedFuture = visible(Synth.aggregate(future, 4), cs[i].t);
  if (JSON.stringify(changedFuture) !== JSON.stringify(r)) leaks++;
  ok(`bar ${i}: precomputed available buckets equal aggregation of ONLY the observed prefix`,
    JSON.stringify(r) === JSON.stringify(prefix), `${r.length} versus ${prefix.length}`);
}
ok('prefix comparisons include observed HTF bars, not only two empty arrays', compared > 0);
ok('arbitrary future price perturbations change ZERO observed HTF features', leaks === 0, `${leaks}`);
const gap = cs.slice(0, 4).map((b, i) => ({ ...b, t: i === 3 ? T + 3 * 86400000 : b.t }));
const grouped = Synth.aggregate(gap, 4);
ok('a weekend/gap bucket is unavailable until its actual last child arrives',
  visible(grouped, gap[2].t).length === 0 && visible(grouped, gap[3].t).length === 1);
ok('invalid as-of input exposes no unverifiable higher candles', visible(all, NaN).length === 0);
const source = fs.readFileSync(path.join(ROOT, 'analysis/harness/backtest.js'), 'utf8');
ok('the walk-forward harness CONSUMES the causal selector', /Synth\.visibleAggregates\(htfAll,/.test(source));
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
