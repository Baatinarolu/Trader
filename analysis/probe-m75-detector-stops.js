#!/usr/bin/env node
'use strict';
/** Actual OHLC→SMC→Setup, no injected zones/pools/protected tags. Synthetic,
 * not outcome/edge evidence. Compare the selected stop with explicit legacy arm.
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const S = require(path.join(APP, 'src/bots/smc')), B = require(path.join(APP, 'src/bots/setup')),
  Sy = require('./harness/synth');
let reads = 0, counts = {}, diff = 0, invalid = 0, wrong = 0, floor = 0;
for (let seed = 1; seed <= 20; seed++) {
  const b = Sy.series({ seed, bars: 600 });
  for (let end = 360; end <= 600; end += 60) {
    const win = b.slice(end - 300, end), clock = win.at(-1).t + 900000;
    const a = S.analyse(win, { tf: '15m', now: win.at(-1).t, observedAt: clock });
    const ctx = { price: a.price, atr: a.atr, balance: 10000, riskPct: 1, observedAt: clock };
    const cur = B.buildSetups(a, ctx), old = B.buildSetups(a, { ...ctx, stopPolicy: 'legacy' }); reads++;
    for (const c of cur.candidates) {
      const l = c.levels; if (!l) continue;
      const rule = l.stop_policy?.rule || 'unimplemented'; counts[rule] = (counts[rule] || 0) + 1;
      const o = old.candidates.find(x => x.dir === c.dir);
      if (l.stop !== o.levels?.stop) diff++;
      if (l.stop == null) invalid++;
      if (c.ok && !(c.dir * (l.stop - l.entry) < 0)) wrong++;
      if (c.ok && !(l.rr_final_exact + 1e-9 >= 2)) floor++;
    }
  }
}
console.log(JSON.stringify({ reads, stop_rules: counts, changed_stops: diff,
  refused_undefined_stops: invalid, wrong_side_executable: wrong, sub_floor_executable: floor }));
if (!counts.nearer_valid_fallback || !diff || wrong || floor) {
  console.log('M75 DETECTOR STOPS: FAIL'); process.exitCode = 1;
} else console.log('M75 DETECTOR STOPS: PASS');
