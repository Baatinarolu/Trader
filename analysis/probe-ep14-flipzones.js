'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
 * Ep 14 — Flip Zones: does the code's `breakers` satisfy his three criteria?
 *
 * Brad Goh, Ep 14, states the test mechanically:
 *   "A flip zone is only confirmed when there is a FAILED REACTION, when price
 *    BREAKS STRUCTURE and price actually CLOSE ABOVE the or BELOW the reaction
 *    point. So those are the THREE CRITERIA of a flip zone."
 *   "if this flip zone did not break structure it is NOT COUNTED as a flip zone."
 *   "flip zones are not just failed reactions. They are about failed zones that
 *    LED TO A STRUCTURAL SHIFT."
 *   "it needs to break and close beyond the REACTION POINT" (the extreme of the
 *    failed reaction -- the last lower high / last higher low -- not the zone edge).
 *
 * smc.js:291 findBreakers(orderBlocks, candles, atr) requires only that the OB is
 * breached and that some later candle CLOSES beyond the zone edge. It is never
 * passed structure.breaks, so criterion 3 cannot be tested at all.
 *
 * This probe runs the real SMC.analyse() and re-derives his criteria from the
 * outputs, then reports how many of the code's breakers would survive.
 * Synthetic OHLC on purpose (no fixture CSVs survive in this workspace).
 * ─────────────────────────────────────────────────────────────────────────── */
const path = require('path');
const BASE = path.resolve(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(BASE, 'src', 'bots', 'smc.js'));

let seed = 987654;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function walk(n, start, drift, vol) {
  const out = []; let p = start, t = Date.UTC(2024, 0, 2);
  for (let i = 0; i < n; i++) {
    const o = p;
    const step = (rnd() - 0.5 + drift) * vol;
    const c = Math.max(0.0001, o + step);
    const w = Math.abs(step) * (0.4 + rnd());
    out.push({ t, o: +o.toFixed(5), h: +Math.max(o, c, o + w).toFixed(5), l: +Math.min(o, c, o - w).toFixed(5), c: +c.toFixed(5), v: 1000 });
    p = c; t += 15 * 60e3;
  }
  return out;
}

let breakers = 0, withBOSafter = 0, withFailedReaction = 0, allThree = 0, charts = 0;
const perChart = [];

for (let run = 0; run < 300; run++) {
  const drift = (run % 3 - 1) * 0.06;
  const candles = walk(600, 1.08 + (run % 7) * 0.002, drift, 0.0018);
  let a;
  try { a = SMC.analyse(candles, { tf: '15m' }); } catch (e) { continue; }
  charts++;
  const bs = a.breakers || [];
  const breaks = (a.structure && a.structure.breaks) || [];
  let n1 = 0, n2 = 0, n3 = 0;
  for (const b of bs) {
    breakers++;
    // Criterion 3: a break of structure AFTER the flip formed (b.i is the break candle)
    const bos = breaks.some((x) => x.i > b.i);
    if (bos) { withBOSafter++; n1++; }
    // Criterion 1 (failed reaction) is NOT measurable from the code's outputs.
    // `dir: -z.dir` and `side: z.dir>0?'supply':'demand'` are set by construction in
    // findBreakers, so any direction test against them is a tautology. The code
    // records no reaction high/low, no "zone did its job then failed" state, and
    // 0 hits exist for failed_reaction / failedReaction / reaction_point in src/.
    // Reporting a number here would be presenting a tautology as a measurement.
    if (bos) { allThree++; n3++; }
  }
  perChart.push({ bs: bs.length, ok: n3 });
}

const pct = (x) => (breakers ? ((x / breakers) * 100).toFixed(1) + '%' : 'n/a');
console.log('=== Ep 14 flip zones: the code\'s breakers vs his three criteria ===');
console.log(`charts analysed                              : ${charts}`);
console.log(`breakers the code emits                      : ${breakers}`);
console.log(`  ...with a break of structure AFTER the flip: ${withBOSafter}  (${pct(withBOSafter)})   <- his criterion 3`);
console.log(`  criterion 1 (failed reaction)               : UNMEASURABLE from these outputs`);
console.log(`  criterion 2 (close beyond reaction point)   : NOT TESTED -- code closes beyond the ZONE EDGE`);
console.log(`\nbreakers per chart: mean ${(breakers / (charts || 1)).toFixed(2)}, max ${Math.max(...perChart.map((p) => p.bs))}`);
console.log('\nCriterion 1 is unmeasurable, not merely untested: findBreakers sets dir:-z.dir and');
console.log('side by construction, so any direction check against them is a tautology. It records');
console.log('no reaction high/low and no "zone did its job then failed" state (0 hits in src/ for');
console.log('failed_reaction / failedReaction / reaction_point).');
console.log('\nThe structural finding does not depend on any of these numbers: grep -rn breakers src/');
console.log('returns 4 hits -- docstring, compute, output, API payload. No bot module consumes it.');
