'use strict';
/** Controlled, time-consistent structural INPUTS for M33, NOT historical prices.
 * Unlike the old slope-only walk, both structural directions and break events
 * are explicitly specified. Tests exercise composition; SMC primitives have their
 * own independent probes. 4h narrative / 15m POI and shift / 5m sweep then shift.
 */
module.exports = function fixture(execDir = -1) {
  const END = Date.parse('2026-07-15T08:30:00Z');
  const HTF_END = Math.floor(END / 14400000) * 14400000;
  const mirror = (x) => execDir === -1 ? x : 200 - x;
  const trend = (d) => d > 0 ? 'bullish' : 'bearish';
  const event = (d) => d > 0 ? 'up' : 'down';
  const htfDir = -execDir;
  const bars = (tf, step, n = 120) => Array.from({ length: n }, (_, i) => ({
    t: (tf === '4h' ? HTF_END : END) - (n - 1 - i) * step, o: mirror(96.5), c: mirror(96.5),
    h: execDir === -1 ? 96.7 : mirror(96.3), l: execDir === -1 ? 96.3 : mirror(96.7), v: 1000,
  }));
  const zone = (bottom, top, dir, t, extra = {}) => ({ dir,
    bottom: execDir === -1 ? bottom : mirror(top), top: execDir === -1 ? top : mirror(bottom),
    mid: mirror((bottom + top) / 2), body_mid: mirror((bottom + top) / 2),
    side: dir > 0 ? 'demand' : 'supply', t, i: 90, strength: 1, fresh: true,
    distance_atr: 0, breached: false, tests: 0, ...extra });
  const n = 120, mi = n - 1;
  const mtfBreak = { type: 'CHoCH', dir: event(execDir), t: END - 6 * 900000, bars_ago: 6,
    level: mirror(97.0), i: mi - 6, mss: true };
  const ltfBreak = { type: 'CHoCH', dir: event(execDir), t: END - 2 * 300000, bars_ago: 2,
    level: mirror(96.4), i: mi - 2, mss: true };
  const sweep = (age, step, extreme) => ({ dir: execDir, type: execDir < 0 ? 'BSL' : 'SSL',
    t: END - age * step, i: mi - age, bars_ago: age, level: mirror(96.8), extreme: mirror(extreme),
    close: mirror(96.5), wick_atr: 1, strength: 1, label: 'Confirmed opposing stop sweep', pool_label: 'POI stops' });
  const base = (tf, structure) => ({ ok: true, tf, price: mirror(96.5), atr: 1, structure,
    liquidity: { pools: [{ type: execDir < 0 ? 'SSL' : 'BSL', price: mirror(90), strength: 0.9, label: 'Far MTF pool', kind: 'PDL' }] },
    displacement: [], order_blocks: [], fvgs: [], breakers: [], sweeps: [], inducement: [],
    premium_discount: { range_low: execDir < 0 ? 90 : 102, range_high: execDir < 0 ? 98 : 110,
      position_pct: execDir < 0 ? 81.25 : 18.75, zone: execDir < 0 ? 'premium' : 'discount' },
    counts: { sweeps: 1, order_blocks: 1, fvgs: 1 }, sessions: {} });
  const htf = base('4h', { trend: trend(htfDir), last_break: { type: 'BOS', dir: event(htfDir),
    bars_ago: 8, t: HTF_END - 8 * 14400000, level: mirror(95) } });
  htf.order_blocks = [zone(91.8, 92.5, htfDir, HTF_END - 20 * 14400000, { fresh: false, distance_atr: 4 })];
  htf.premium_discount = { range_low: 90, range_high: 110, position_pct: 32.5, zone: 'discount' };
  const mtf = base('15m', { trend: trend(execDir), last_break: mtfBreak, breaks: [mtfBreak] });
  mtf.htf_structure = htf.structure;
  mtf.order_blocks = [zone(96.2, 96.8, execDir, mtfBreak.t - 900000, { displacement_t: mtfBreak.t, displacement_i: mtfBreak.i })];
  mtf.fvgs = [{ dir: execDir, bottom: execDir < 0 ? 96.4 : mirror(96.6),
    top: execDir < 0 ? 96.6 : mirror(96.4), i: mi - 8, t: END - 8 * 900000,
    size_atr: 0.2, filled: false }];
  mtf.sweeps = [sweep(12, 900000, 97.6)];
  mtf.displacement = [{ dir: execDir, i: mi - 6, t: mtfBreak.t, rangeAtr: 1.5, bodyRatio: 0.85 }];
  const ltf = base('5m', { trend: trend(execDir), last_break: ltfBreak, breaks: [ltfBreak] });
  ltf.sweeps = [{ ...sweep(3, 300000, 97), close: mirror(96.65) }];
  // M68: a DIFFERENT LTF OB actually creates this shift. Explicit structural
  // inputs, not OHLC-only discovery; the candles below match its origin/leg/retest.
  ltf.displacement = [{ dir: execDir, t: ltfBreak.t, i: ltfBreak.i, rangeAtr: 1.2, bodyRatio: .83 }];
  ltf.order_blocks = [zone(96.3, 97, execDir, END - 3 * 300000, {
    i: 116, mid: mirror(96.65), body_mid: mirror(96.55), mitigated: true,
    displacement_i: 117, displacement_t: ltfBreak.t,
    structure_causes: [{ displacement_i: 117, displacement_t: ltfBreak.t,
      shift: { ...ltfBreak, close: mirror(95.6), confirmed: true } }],
  })];
  const pack = (tf, step, smc) => {
    const candles = bars(tf, step);
    // Match the explicitly supplied sweep/shift facts to their candle geometry.
    for (const sp of smc.sweeps) {
      const b = candles.find((x) => x.t === sp.t);
      if (b) { if (sp.dir < 0) b.h = Math.max(b.h, sp.extreme); else b.l = Math.min(b.l, sp.extreme); b.c = sp.close; }
    }
    const lb = smc.structure.last_break, b = candles.find((x) => x.t === lb.t);
    if (b && tf !== '4h') { b.c = mirror(tf === '15m' ? 95.3 : 95.6); b.h = Math.max(b.h, b.c); b.l = Math.min(b.l, b.c); }
    if (tf === '5m') {
      const origin = candles[116], leg = candles[117];
      origin.o = mirror(96.45); origin.c = mirror(96.65);
      leg.o = mirror(96.6); leg.c = mirror(95.6);
      leg.h = execDir < 0 ? 96.7 : mirror(95.5);
      leg.l = execDir < 0 ? 95.5 : mirror(96.7);
    }
    // Preserve the LTF excursion in the containing medium candle.
    if (tf === '15m') for (const sp of ltf.sweeps) {
      const b = candles.find((x) => x.t <= sp.t && x.t + 900000 > sp.t);
      if (b) { if (sp.dir < 0) b.h = Math.max(b.h, sp.extreme); else b.l = Math.min(b.l, sp.extreme); }
    }
    return { tf, candles, smc, price: smc.price, observed_at: END + 300000,
    atr: 1, bars: 120, ind: { ok: true, score: (smc.structure.trend === 'bullish' ? 1 : -1) * 50,
      ind: { atr_rank: 50, atr_pct: 1, rsi14: 50, macd: { hist: execDir }, adx14: 25 },
      groups: [], metrics: [], notes: [] },
    meta: { provider: 'controlled-fixture', last_bar: new Date(candles.at(-1).t).toISOString(), ticker: 'TEST', warnings: ['Not market data.'] } };
  };
  const input = { symbol: 'TEST', tf: '15m', series: pack('15m', 900000, mtf),
    biasSeries: pack('4h', 14400000, htf), triggerSeries: pack('5m', 300000, ltf) };
  // Keep every overlapping complete bucket physically coherent. Structural
  // inputs remain explicit, but even a fixture may not erase its child excursion.
  for (const sp of mtf.sweeps) {
    const b = input.triggerSeries.candles.find((x) => x.t === sp.t);
    if (b) { if (execDir < 0) b.h = sp.extreme; else b.l = sp.extreme; }
  }
  const legEnd = input.triggerSeries.candles.find((x) => x.t === mtfBreak.t + 600000);
  if (legEnd) { legEnd.c = mirror(95.3); if (execDir < 0) legEnd.l = Math.min(legEnd.l, legEnd.c); else legEnd.h = Math.max(legEnd.h, legEnd.c); }
  const sync = (parent, children, step, count) => {
    for (const p of parent) {
      const members = children.filter((b) => b.t >= p.t && b.t < p.t + step);
      if (members.length) Object.assign(p, { o: members[0].t === p.t ? members[0].o : p.o, c: members.at(-1).c,
        h: Math.max(...members.map((b) => b.h)), l: Math.min(...members.map((b) => b.l)),
        v: members.reduce((n, b) => n + b.v, 0) });
    }
  };
  sync(input.series.candles, input.triggerSeries.candles, 900000, 3);
  sync(input.biasSeries.candles, input.series.candles, 14400000, 16);
  return { END, execDir, htfDir, target: mirror(92.5), input };
};
