'use strict';
/** Explicit M68 structural-input composition cases, NOT OHLC-only discovery. */
const counter = require('./countertrend-fixture');
module.exports = function fixture(dir = -1, model = 'market_shift') {
  const f = counter(dir), low = f.input.triggerSeries, mirror = (x) => dir < 0 ? x : 200 - x;
  if (model === 'flip') {
    low.smc.order_blocks = [];
    low.smc.breakers = [{ kind: 'breaker', dir, side: dir > 0 ? 'demand' : 'supply',
      bottom: dir < 0 ? 96.4 : mirror(96.8), top: dir < 0 ? 96.8 : mirror(96.4),
      mid: mirror(96.6), i: 115, t: f.END - 4 * 300000,
      origin: { t: f.END - 5 * 300000, side: dir > 0 ? 'supply' : 'demand' },
      failed_reaction: true, broke_structure: true, confirmed: true,
      reaction_point: mirror(96.9), retested: true, strength: 1.2, distance_atr: 0,
      structure_break: { ...low.smc.structure.last_break, close: mirror(95.6), confirmed: true },
      confirmed_at: low.smc.structure.last_break.t,
      post_confirmation_mitigation_t: low.candles[118].t }];
    low.candles[115] = { ...low.candles[115], o: mirror(96.5), c: mirror(96.1),
      h: dir < 0 ? 96.6 : mirror(96), l: dir < 0 ? 96 : mirror(96.6) };
  }
  if (model === 'flip') for (const [parent, child, ms] of [
    [f.input.series.candles, low.candles, 900000], [f.input.biasSeries.candles, f.input.series.candles, 14400000]]) {
    for (const p of parent) {
      const members = child.filter((b) => b.t >= p.t && b.t < p.t + ms);
      if (members.length) Object.assign(p, { o: members[0].t === p.t ? members[0].o : p.o,
        c: members.at(-1).c, h: Math.max(...members.map((b) => b.h)), l: Math.min(...members.map((b) => b.l)),
        v: members.reduce((n, b) => n + b.v, 0) });
    }
  }
  return f;
};
