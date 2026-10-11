'use strict';
/** M75 consumer composition seam, NOT OHLC-only HTF/MTF discovery. A declared
 * existing liquidity pool is passed to the real M76 physical sweep validator.
 * The market-shift origin precedes the sweep and is wider than its protected
 * high/low, so candidate authority is discriminated by an actual changed stop.
 */
const F = require('./target-timeframe-fixture');
function named(P, dir = -1, model = 'market_shift') {
  const f = F.named(dir, model), low = f.input.triggerSeries;
  const m = x => dir < 0 ? x : 200 - x;
  if (model === 'market_shift') {
    const ob = low.smc.order_blocks.find(o => o.dir === dir);
    ob.i = 115; ob.t = low.candles[115].t;
    ob.top = dir < 0 ? 97.6 : m(96.3); ob.bottom = dir < 0 ? 96.3 : m(97.6);
    Object.assign(low.candles[115], { o: m(96.45), c: m(96.65),
      h: dir < 0 ? 97.6 : m(96.3), l: dir < 0 ? 96.3 : m(97.6) });
  }
  // Keep child/parent OHLC coherent; structure and liquidity remain declared.
  for (const [parent, children, step] of [[f.input.series.candles, low.candles, 900000],
    [f.input.biasSeries.candles, f.input.series.candles, 14400000]]) {
    for (const b of parent) {
      const x = children.filter(c => c.t >= b.t && c.t < b.t + step);
      if (x.length) Object.assign(b, { o: x[0].t === b.t ? x[0].o : b.o, c: x.at(-1).c,
        h: Math.max(...x.map(c => c.h)), l: Math.min(...x.map(c => c.l)),
        v: x.reduce((n, c) => n + c.v, 0) });
    }
  }
  low.smc.protected_levels = P?.discover ? P.discover(low.candles, low.smc.sweeps,
    { tf: '5m', observedAt: f.END,
      poolBefore: s => ({ kind: 'declared_entry_leg_liquidity', type: s.type,
        tf: '5m', price: s.level, source_t: low.candles[114].t,
        available_at: s.t, basis: 'explicit_named_composition_liquidity' }) }) : null;
  return f;
}
module.exports = { named, asOrdinaryCRT: F.asOrdinaryCRT };
