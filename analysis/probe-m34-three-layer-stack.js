'use strict';
/** M34 — remove the unfetched fourth timeframe, preserve the real three-role method.
 * TJ_APP selects a negative-control tree; TJ_CONTROL selects the pre-change build for
 * identical-input, full-result comparison. Synthetic candles, no performance claims.
 */
const fs = require('fs');
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const TD = require(path.join(APP, 'src/bots/topdown'));
const SMC = require(path.join(APP, 'src/bots/smc'));
const Synth = require('./harness/synth');
const pre = process.env.TJ_CONTROL ? require(path.join(process.env.TJ_CONTROL, 'src/bots/topdown')) : null;
let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(' ok   ' + label); }
  else { fail++; console.log(' FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
const src = fs.readFileSync(path.join(APP, 'src/bots/topdown.js'), 'utf8');
const tfs = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
ok('all nine supported timeframe stacks remain', tfs.every((tf) => TD.STACK[tf]));
ok('STACK no longer declares an unfetched zone column', tfs.every((tf) => !Object.hasOwn(TD.STACK[tf], 'zone')));
ok('layersFor no longer advertises zone_tf', tfs.every((tf) => !Object.hasOwn(TD.layersFor(tf), 'zone_tf')));
ok('build no longer accepts an unused zoneSeries argument', !/zoneSeries/.test(src));
for (const [tf, bias, trigger, style] of [['15m', '4h', '5m', 'day'], ['5m', '1h', '1m', 'scalp']]) {
  const l = TD.layersFor(tf);
  ok(`${style}: the exact spoken ${bias}/${tf}/${trigger} set remains`,
    l.bias_tf === bias && l.entry_tf === tf && l.trigger_tf === trigger && l.style === style, JSON.stringify(l));
}
ok('unsupported tf keeps the prior default bias/trigger without inventing a fourth layer',
  TD.layersFor('unknown').bias_tf === '4h' && TD.layersFor('unknown').trigger_tf === '5m');
const END = Date.parse('2026-07-15T09:00:00Z');
function series(seed, tf, bars) {
  const step = TD.TF_MS[tf];
  const candles = Synth.series({ seed, bars }).map((b, i) => ({ ...b, t: END - (bars - 1 - i) * step }));
  const smc = SMC.analyse(candles, { tf, now: END });
  return { tf, candles, smc, price: candles[candles.length - 1].c, atr: smc.atr, ind: null };
}
let reads = 0, diff = 0, wrongLocation = 0, wrongStack = 0, directions = new Set();
for (const tf of tfs) {
  const l = TD.layersFor(tf);
  for (let seed = 1; seed <= 12; seed++) {
    const input = { symbol: 'EURUSD', tf, series: series(seed, tf, 240),
      biasSeries: series(seed + 20, l.bias_tf, 120), triggerSeries: series(seed + 40, l.trigger_tf, 300) };
    const r = TD.build(input);
    reads++;
    directions.add(r.direction);
    if (r.layers.zone.tf !== tf) wrongLocation++;
    if (r.layers.bias.tf !== l.bias_tf || r.layers.trigger.tf !== l.trigger_tf) wrongStack++;
    if (pre && JSON.stringify(r) !== JSON.stringify(pre.build(input))) diff++;
  }
}
// Independent trending series above often produce only WAIT (different price
// histories). Pin BOTH confirmed directions too, so full-result invariance isn't
// defended using 108 blocked cases alone.
for (const dir of [1, -1]) {
  const H = 3600e3, M15 = 900e3, start = Date.UTC(2026, 9, 1);
  const bar = (t, o, h, l, c) => ({ t, o, h, l, c, v: 100 });
  const h = [];
  for (let i = 0; i < 12; i++) h.push(bar(start + i * 4 * H, 100, 101, 99, 100.2));
  for (let i = 0; i < 8; i++) {
    const o = 100 - i * 0.75;
    h.push(bar(start + (12 + i) * 4 * H, o, o + 0.3, o - 0.75, o - 0.75));
  }
  const rightT = start + 20 * 4 * H;
  h.push(bar(rightT, 94.2, 94.6, 93.6, 94.4), bar(rightT + 4 * H, 94.4, 94.9, 94.45, 94.6));
  const e = [];
  for (let i = 0; i < 6; i++) e.push(bar(rightT + i * M15, 94.5, 94.55, 94.3, 94.45));
  e.push(bar(rightT + 6 * M15, 94.35, 94.4, 93, 94.3));
  for (let i = 7; i < 12; i++) e.push(bar(rightT + i * M15, 93.9, 94, 93.8, 93.95));
  e.push(bar(rightT + 12 * M15, 93.95, 94.05, 93.9, 94));
  const mirror = (bars) => dir === 1 ? bars : bars.map((b) => ({ ...b, o: 200 - b.o, h: 200 - b.l, l: 200 - b.h, c: 200 - b.c }));
  const smc = { structure: { trend: dir === 1 ? 'bullish' : 'bearish', last_break: { type: 'BOS', dir: dir === 1 ? 'up' : 'down', bars_ago: 6 } },
    liquidity: { pools: [{ type: dir === 1 ? 'SSL' : 'BSL', price: dir === 1 ? 94 : 106, label: 'Swing extreme', strength: 0.65 }] },
    order_blocks: [], fvgs: [], displacement: [], sweeps: [], sessions: {} };
  const pack = (tf, candles) => ({ tf, candles: mirror(candles), smc, atr: 0.8, price: mirror(candles).at(-1).c, ind: null });
  const input = { symbol: 'TEST', tf: '15m', series: pack('15m', e), biasSeries: pack('4h', h), triggerSeries: pack('5m', e) };
  const r = TD.build(input);
  reads++;
  directions.add(r.direction);
  if (r.layers.zone.tf !== '15m') wrongLocation++;
  if (r.layers.bias.tf !== '4h' || r.layers.trigger.tf !== '5m') wrongStack++;
  if (pre && JSON.stringify(r) !== JSON.stringify(pre.build(input))) diff++;
  ok(`confirmed ${dir > 0 ? 'long' : 'short'} fixture really arms the topdown direction`, r.direction === dir && r.status === 'confirmed' && !r.blocked, `${r.direction}/${r.status}`);
}
console.log(` measured: ${reads} full builds across nine stacks, directions=${[...directions].join(',')}, result diffs=${diff}`);
ok('the location report always names the medium/trading timeframe actually used', reads === 110 && wrongLocation === 0, `${wrongLocation}/${reads}`);
ok('the fetched bias/trigger roles remain exactly the declared real stack', wrongStack === 0, `${wrongStack}/${reads}`);
if (pre) ok('removing dead config changes ZERO full TD.build result objects', diff === 0, `${diff}/${reads}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
