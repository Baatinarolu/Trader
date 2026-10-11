#!/usr/bin/env node
'use strict';
/**
 * M21 probe — strong / weak structure.
 *
 * The course: "in a bullish market structure you want to trade from STRONG structure and
 * TARGET WEAK structure", where weak is "where the break of structure happen" (expected to
 * break) and strong is "where price is most likely going to hold the next time".
 *
 * This checks the derivation against the labels smc.js already produces, and that the weak
 * extreme actually reaches the target ladder.
 *
 * Run from extracted/tradejournal:  node ../../analysis/probe-m21-strongweak.js
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted/tradejournal');
const Setup = require(path.join(APP, 'src/bots/setup.js'));
const SMC = require(path.join(APP, 'src/bots/smc.js'));
const Synth = require('./harness/synth.js');

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${m}`); c ? pass++ : fail++; };

ok(typeof Setup.strongWeak === 'function', 'strongWeak() is exported');

/* ---- the derivation, on synthetic structures of each direction ---- */
let sawBull = 0, sawBear = 0, sawRange = 0;
let badDir = 0, badSide = 0, withTarget = 0, candidates = 0;
// M54 deliberately refines the old unconditional weak-first guarantee. Keep the
// label AND the candidate, but never jump over a nearer physical opposing magnet.
// Historical M21 priority evidence is retained in the ledger/M54 report, not
// silently treated as the new contract. Include refusals and sub-0.9R magnets.
let wkExpected = 0, wkFirst = 0, wkViolations = 0, nearestViolations = 0;

for (let seed = 1; seed <= 10; seed++) {
  const candles = Synth.series({ seed, bars: 700 });
  const htf = Synth.aggregate(candles, 4);
  for (let i = 120; i < candles.length - 5; i += 3) {
    const win = candles.slice(Math.max(0, i - 280), i + 1);
    const h = htf.filter((b) => b.t <= candles[i].t).slice(-80);
    let a; try { a = SMC.analyse(win, { tf: '15m', htfCandles: h.length > 30 ? h : null, now: candles[i].t }); } catch (e) { continue; }
    if (!a || !a.ok) continue;
    const sw = Setup.strongWeak(a);
    const trend = a.structure.trend;

    // The rule is GEOMETRIC, not label-based: in a bullish structure the weak high must sit
    // above the strong low, and in a bearish one the weak low below the strong high. Asserting
    // specific HH/LL labels was wrong — smc.js's label can lag the trend (that is M50), and
    // M21 must not be blamed for it. When they contradict, M21 now assigns nothing.
    if (trend === 'bullish') {
      sawBull++;
      if (sw.weak && sw.strong && !(sw.weak.price > sw.strong.price)) badSide++;
      if (sw.stale && (sw.weak !== null || sw.strong !== null)) badDir++;
    } else if (trend === 'bearish') {
      sawBear++;
      if (sw.weak && sw.strong && !(sw.weak.price < sw.strong.price)) badSide++;
      if (sw.stale && (sw.weak !== null || sw.strong !== null)) badDir++;
    } else {
      sawRange++;
      if (sw.strong !== null || sw.weak !== null) badDir++;   // must NOT invent labels when ranging
    }

    let r; try { r = Setup.buildSetups(a, { price: candles[i].c }); } catch (e) { continue; }
    for (const c of (r.candidates || [])) {
      if (!c.levels || !c.levels.targets) continue;
      const d = c.dir > 0 ? 1 : -1;
      const entryPx = c.levels.entry;
      const catalogue = c.levels.target_candidates || [];
      if (catalogue.length && c.levels.targets.length
          && c.levels.targets[0].price !== catalogue[0].price) nearestViolations++;
      if (sw && sw.weak && entryPx != null && d * (sw.weak.price - entryPx) > 0) {
        wkExpected++;
        const kept = catalogue.some((t) => t.kind === 'weak_structure' && t.price === sw.weak.price);
        if (!kept || (c.levels.targets[0] && d * (c.levels.targets[0].price - sw.weak.price) > 0)) wkViolations++;
        if (c.levels.targets[0] && c.levels.targets[0].kind === 'weak_structure') wkFirst++;
      }
      if (!c.ok) continue;
      candidates++;
      if (c.levels.targets.some((t) => t.kind === 'weak_structure')) withTarget++;
    }
  }
}

console.log(`\n  (sampled structures: ${sawBull} bullish, ${sawBear} bearish, ${sawRange} ranging)\n`);
ok(sawBull > 0 && sawBear > 0, 'the sample contained both directions, so both branches ran');
ok(sawRange > 0, 'the sample contained a ranging structure, so the no-invention branch ran');
ok(badDir === 0, `a stale trend label assigns nothing rather than a wrong-side target (${badDir} violations)`);
ok(badSide === 0, `the weak extreme is on the correct side of the strong one (${badSide} violations)`);
ok(wkExpected > 0, `the sample contained cases where a weak extreme lay beyond entry (${wkExpected})`);
ok(wkViolations === 0, `weak extreme survives in the catalogue and no farther target replaces it (${wkFirst}/${wkExpected} selected, ${wkViolations} violations)`);
ok(nearestViolations === 0, `M54's nearest magnet is the actual single target (${nearestViolations} violations)`);
console.log(`  nearest weak-structure target is selected in ${wkFirst} of ${wkExpected} eligible candidates`);
console.log(`  (informational) present in ${withTarget} of ${candidates} tradeable candidates`);

/* ---- a ranging structure must say so rather than guess ---- */
const ranged = Setup.strongWeak({ structure: { trend: 'ranging', labels: [] } });
ok(ranged && ranged.strong === null && ranged.weak === null, 'ranging structure assigns nothing');
ok(ranged && /ranging/.test(ranged.note), 'ranging structure explains why');

/* ---- no structure at all must not throw (the M6 sentinel shape) ---- */
let threw = null;
try { Setup.strongWeak({ ok: false, tf: '15m' }); } catch (e) { threw = e; }
ok(threw === null, 'survives the short-series sentinel that has no `structure` key');

console.log(`\nM21 PROBE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
