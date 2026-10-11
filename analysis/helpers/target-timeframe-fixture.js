'use strict';
/** Explicit ordinary-target fixtures; NOT OHLC discovery or outcome evidence. */
const make = require('../../extracted/tradejournal/scripts/fixtures/entry-model-fixture');
function ordinary(tf = '1m') {
  return { ok: true, tf, price: 100, atr: 1, sessions: { in_killzone: true, quality: 1 },
    structure: { trend: 'bullish', last_break: { dir: 'up', bars_ago: 10 },
      last_swing_high: { price: 110, label: 'HH' }, last_swing_low: { price: 99, label: 'HL' } },
    sweeps: [{ dir: 1, extreme: 99.3, bars_ago: 2, wick_atr: 1, label: 'sellside' }],
    displacement: [{ dir: 1, rangeAtr: 2, bodyRatio: .8, bars_ago: 1 }],
    order_blocks: [{ dir: 1, bottom: 99.5, top: 100.5, mid: 100, strength: 1.2,
      breached: false, mitigated: true, fresh: false, tests: 1, distance_atr: 0 }], fvgs: [],
    liquidity: { pools: [{ price: 108, kind: 'PDH', label: 'Previous day high', strength: .9, swept: false }] },
    premium_discount: { range_high: 112, range_low: 98, position_pct: 14.3, zone: 'discount' },
  };
}
function opposing(tf, price) {
  return { tf, analysis: { tf, structure: { trend: 'ranging' },
    order_blocks: [{ dir: -1, bottom: price, top: price + .5, mitigated: false,
      breached: false, strength: .9, t: 10 }], liquidity: { pools: [] }, fvgs: [], premium_discount: null } };
}
function named(dir = -1, model = 'market_shift') {
  const f = make(dir, model), m = (x) => dir < 0 ? x : 200 - x;
  // Same real lower sweep/shift/causal-entry facts. Only opposing target context is added.
  f.input.triggerSeries.smc.order_blocks.push({ kind: 'OB', dir: -dir,
    bottom: dir < 0 ? 94.4 : m(94.8), top: dir < 0 ? 94.8 : m(94.4),
    strength: .9, breached: false, mitigated: false, t: f.END - 20 * 300000 });
  return f;
}
function asOrdinaryCRT(report, f) {
  // Supply an ordinary CRT REPORT at the consumer boundary. This is deliberately
  // not a claim that the fixture's HTF OHLC discovered a CRT; the LTF composer
  // and all consumer code are real. Native harness tests discovery separately.
  const dir = f.execDir, target = dir < 0 ? 91 : 109;
  const r = { ...report, countertrend: null, direction: dir, blocked: false, status: 'confirmed',
    conviction: { tier: 'A', why: 'explicit CRT report fixture' },
    conflicts: (report.conflicts || []).filter((c) => !c.blocks_trade),
    crt_plan: { tf: '4h', dir, side: dir < 0 ? 'short' : 'long', projection_only: true,
      range: { low: 91, high: 109 }, sweep: { level: f.input.series.price, extreme: dir < 0 ? 97 : 103, wick_atr: 1 },
      aggressive: { entry: dir < 0 ? 94 : 106, stop: dir < 0 ? 98 : 102, target, rr: 3 },
      safer: { entry: dir < 0 ? 95 : 105, stop: dir < 0 ? 98 : 102, target, rr: 4 },
      target_note: 'HTF projected range edge, not an executable LTF target', invalidation: 'explicit narrative fixture' } };
  r.layers = { ...report.layers, bias: { ...report.layers.bias, tf: '4h' } };
  return r;
}
module.exports = { ordinary, opposing, named, asOrdinaryCRT };
