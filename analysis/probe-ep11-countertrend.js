'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
 * Ep 11 — can the medium timeframe originate a trade direction?
 *
 * Brad Goh's worked example in Ep 11: 4h BULLISH, 15m has "taken out the last
 * higher low giving us a market shift" -> BEARISH. He then says:
 *   "Maybe it's a good time to look for shorts."
 *   "So this is how we can go about if you want to trade counter trend...
 *    you are actually trading with the internal structure, but you're trading
 *    against the higher time frame swing structure."
 *
 * Reproduce that state and ask the real code what it says.
 * Synthetic OHLC on purpose (no fixture CSVs survive in this workspace).
 * ─────────────────────────────────────────────────────────────────────────── */
const path = require('path');
const BASE = path.resolve(__dirname, '..', 'extracted', 'tradejournal');
const TD = require(path.join(BASE, 'src', 'bots', 'topdown.js'));
const SMC = require(path.join(BASE, 'src', 'bots', 'smc.js'));
const Setup = require(path.join(BASE, 'src', 'bots', 'setup.js'));

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/** Random walk with a forced drift, built as proper OHLC. */
function walk(n, start, perBar, vol, tfMs, t0) {
  const out = []; let p = start, t = t0;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = Math.max(0.0001, o + perBar + (rnd() - 0.5) * vol);
    const w = Math.abs(c - o) * (0.4 + rnd()) + vol * 0.15;
    out.push({ t, o: +o.toFixed(5), h: +Math.max(o, c, o + w).toFixed(5), l: +Math.min(o, c, o - w).toFixed(5), c: +c.toFixed(5), v: 1000 });
    p = c; t += tfMs;
  }
  return out;
}

const t0 = Date.UTC(2024, 0, 2);
// bias timeframe: a clear 4h uptrend
const biasCandles = walk(300, 1.0600, +0.00045, 0.0022, 4 * 3600e3, t0);
// entry timeframe: a clear 15m downtrend (his "market shift" lower)
const entryCandles = walk(500, 1.1300, -0.00035, 0.0013, 15 * 60e3, t0);
const triggerCandles = walk(500, 1.1300, -0.00030, 0.0010, 5 * 60e3, t0);

const entrySmc = SMC.analyse(entryCandles, { tf: '15m' });
const biasSmc = SMC.analyse(biasCandles, { tf: '4h' });
const triggerSmc = SMC.analyse(triggerCandles, { tf: '5m' });

// TD.build wants series OBJECTS ({candles, smc, atr, price}), not raw arrays.
const atrOf = (cs) => cs.slice(-30).reduce((s, b) => s + (b.h - b.l), 0) / Math.min(30, cs.length);
const pack = (cs, smc) => ({ candles: cs, smc, atr: atrOf(cs), price: cs[cs.length - 1].c, ind: null });
const entrySeries = pack(entryCandles, entrySmc);
const biasSeries = pack(biasCandles, biasSmc);
const triggerSeries = pack(triggerCandles, triggerSmc);

console.log('=== the state Ep 11 demonstrates ===');
console.log(`4h structure   : ${biasSmc.structure.trend}`);
console.log(`15m structure  : ${entrySmc.structure.trend}`);
console.log(`Brad's verdict : "Maybe it's a good time to look for shorts."`);

const td = TD.build({ symbol: 'EURUSD', tf: '15m', series: entrySeries, biasSeries, triggerSeries, opts: { minRR: 2 } });

console.log('\n=== what the code says ===');
console.log(`td.direction : ${td.direction}   (0 = the higher timeframe has given no direction)`);
console.log(`td.status    : ${td.status}`);
console.log(`td.blocked   : ${td.blocked}`);
console.log('conflicts:');
for (const c of (td.conflicts || [])) {
  console.log(`  - ${c.kind.padEnd(20)} blocks_trade=${String(c.blocks_trade).padEnd(5)} ${c.sides}`);
  console.log(`      rule      : ${c.rule}`);
  console.log(`      resolution: ${c.resolution}`);
}

const r = Setup.buildSetups(entrySmc, {
  price: entrySmc.price, atr: entrySmc.atr, bias: -1, biasReason: '15m market shift lower',
  balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex',
  symbol: 'EURUSD', minRR: 2, topdown: td,
});
console.log('\n=== the verdict the bot would show ===');
console.log(`action   : ${r.verdict.action}   dir=${r.verdict.dir}`);
console.log(`source   : ${r.verdict.source}`);
console.log(`headline : ${r.verdict.headline}`);
console.log(`detail   : ${r.verdict.detail}`);
console.log(`(the setup model alone liked: ${r.verdict.setup_action || 'nothing'})`);

/* ── Sweep for the airtight case: the setup model likes SELL, the gate says no ── */
console.log('\n=== sweep: is the gate ever the ONLY thing stopping the 15m short? ===');
let found = 0;
for (let s = 1; s <= 400 && found < 3; s++) {
  seed = s * 7919;
  const b = walk(300, 1.0600, +0.00045, 0.0022, 4 * 3600e3, t0);
  const e = walk(500, 1.1300, -0.00035, 0.0013, 15 * 60e3, t0);
  const g = walk(500, 1.1300, -0.00030, 0.0010, 5 * 60e3, t0);
  let eSmc, bSmc;
  try { eSmc = SMC.analyse(e, { tf: '15m' }); bSmc = SMC.analyse(b, { tf: '4h' }); } catch (err) { continue; }
  if (!eSmc.structure || eSmc.structure.trend !== 'bearish' || !bSmc.structure || bSmc.structure.trend !== 'bullish') continue;
  const td2 = TD.build({ symbol: 'EURUSD', tf: '15m', series: pack(e, eSmc), biasSeries: pack(b, bSmc), triggerSeries: pack(g, SMC.analyse(g, { tf: '5m' })), opts: { minRR: 2 } });
  const r2 = Setup.buildSetups(eSmc, { price: eSmc.price, atr: eSmc.atr, bias: -1, biasReason: '15m market shift lower', balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex', symbol: 'EURUSD', minRR: 2, topdown: td2 });
  if (r2.verdict.action === 'NO TRADE' && r2.verdict.setup_action === 'SELL') {
    found++;
    console.log(`  seed ${String(s).padStart(3)}  4h=${bSmc.structure.trend} 15m=${eSmc.structure.trend}  td.blocked=${td2.blocked}`);
    console.log(`      setup model alone -> ${r2.verdict.setup_action} (grade ${r2.verdict.grade}, score ${r2.verdict.score})`);
    console.log(`      bot verdict       -> ${r2.verdict.action} via ${r2.verdict.source}`);
    console.log(`      blocked by        : ${(td2.conflicts || []).filter((c) => c.blocks_trade).map((c) => c.kind).join(', ')}`);
  }
}
console.log(found ? `\n${found} case(s) where the top-down gate alone killed a 15m short the setup model had graded.` : '\nno such case in 400 seeds — the gate was never the sole blocker.');
