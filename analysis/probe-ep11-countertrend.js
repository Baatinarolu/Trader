'use strict';
/** Ep 11 diagnostic, rebuilt for M33. Controlled structural-input composition,
 * not an OHLC-only discovery test and NOT evidence of a market edge.
 * The former slope-only walk read ranging/ranging under BOS/nested defaults and
 * its grade-based setup_action examples never proved a trade was eligible.
 * Detailed regression coverage: probe-m33-countertrend-execution.js.
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const TD = require(path.join(APP, 'src/bots/topdown'));
const SMC = require(path.join(APP, 'src/bots/smc'));
const Setup = require(path.join(APP, 'src/bots/setup'));
const Mom = require(path.join(APP, 'src/bots/momentum'));
const make = require('./helpers/countertrend-fixture');
let fail = 0;
for (const dir of [-1, 1]) {
  const f = make(dir);
  for (const x of [f.input.series, f.input.biasSeries, f.input.triggerSeries]) x.smc.sessions = SMC.sessionState(new Date(f.END));
  console.log(`\n=== controlled case: ${f.input.biasSeries.smc.structure.trend} 4h / ${f.input.series.smc.structure.trend} 15m ===`);
  for (const enabled of [false, true]) {
    const td = TD.build({ ...f.input, opts: { counterTrend: enabled } });
    const align = Mom.alignment(f.input.biasSeries, f.input.series, f.input.triggerSeries, td);
    const r = Setup.buildSetups(f.input.series.smc, { price: f.input.series.price, bias: f.htfDir,
      topdown: td, balance: 10000, riskPct: .5 });
    const c = r.candidates.find((x) => x.dir === dir);
    console.log(`counter path ${enabled ? 'ON' : 'OFF'}: daily narrative ${align.bias}, execution ${td.direction}, blocked=${td.blocked}; candidate ok=${c.ok}; FINAL ${r.verdict.action}`);
    console.log(`  target: ${JSON.stringify(c.levels && c.levels.targets)}; configured risk .5%, deployed ${c.risk ? c.risk.risk_pct : 'unknown'}%`);
    if (enabled && (!c.ok || r.verdict.dir !== dir || align.bias !== f.htfDir)) fail++;
  }
}
console.log(`\n${fail ? 'FAIL' : 'OK'}: counter execution and held daily narrative are different roles. Controlled inputs only.`);
process.exitCode = fail ? 1 : 0;
