#!/usr/bin/env node
'use strict';
/** Actual OHLC -> SMC -> Setup target discovery. No injected zones/pools/FVGs.
 * Synthetic diagnostics, never an edge test. TJ_APP selects parent/M54/current. */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc')), SU = require(path.join(APP, 'src/bots/setup'));
const Synth = require('./harness/synth');
let pass = 0, fail = 0, reads = 0, zone = 0, gap = 0, bad = 0, nearestBad = 0;
const selected = {}, catalogued = {};
for (let seed = 1; seed <= 6; seed++) {
  const bars = Synth.series({ seed, bars: 700 });
  for (let i = 120; i < bars.length - 5; i += 3) {
    const a = SMC.analyse(bars.slice(Math.max(0, i - 299), i + 1), { tf: '15m', now: bars[i].t }); reads++;
    const r = SU.buildSetups(a, { price: bars[i].c });
    for (const c of r.candidates || []) {
      const lv = c.levels; if (!lv) continue;
      for (const t of lv.target_candidates || []) {
        catalogued[t.kind] = (catalogued[t.kind] || 0) + 1;
        if (t.kind === 'opposing_order_block') {
          zone++;
          if (!(a.order_blocks || []).some((z) => z.dir === -c.dir && z.breached === false && z.mitigated === false
            && (c.dir > 0 ? z.bottom : z.top) === t.price)) bad++;
        } else if (t.kind === 'unfilled_fvg') {
          gap++;
          if (!(a.fvgs || []).some((g) => g.dir === -c.dir && g.filled === false && g.fill_pct >= 0 && g.fill_pct < 100
            && Math.abs((c.dir > 0 ? g.bottom + (g.top - g.bottom) * g.fill_pct / 100
              : g.top - (g.top - g.bottom) * g.fill_pct / 100) - t.price) < .000051)) bad++;
        }
        if (!(c.dir * (t.price - lv.entry) > 0) || t.source_tf !== '15m') bad++;
      }
      const t = lv.targets[0]; if (t) selected[t.kind] = (selected[t.kind] || 0) + 1;
      if (lv.target_candidates?.length && t?.price !== lv.target_candidates[0].price) nearestBad++;
    }
  }
}
const ok = (c, m) => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${m}`); c ? pass++ : fail++; };
ok(reads > 1000, `actual OHLC detector reads ${reads}, not manual SMC facts`);
ok(zone > 0, `genuine unmitigated opposing OB target candidates ${zone}`);
ok(gap > 0, `genuine remaining unfilled FVG target candidates ${gap}`);
ok(bad === 0, `detector lifecycle, physical near/remaining edge, side and source TF agree (${bad} errors)`);
ok(nearestBad === 0, `actual single target is the nearest discovered magnet (${nearestBad} errors)`);
ok(selected.opposing_order_block > 0 && selected.unfilled_fvg > 0,
  'both new target kinds reach actual primary-target output (refusals included)');
console.log(JSON.stringify({ reads, catalogued, selected, bad, nearestBad }));
console.log(`M54 DETECTORS: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
