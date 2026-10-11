'use strict';
/** M71: explicit SMC composition facts, not OHLC discovery or outcome evidence. */
const F = require('./target-timeframe-fixture');
const clone = x => JSON.parse(JSON.stringify(x));
const CLOCK = Date.UTC(2026, 6, 15, 8, 30);
function mirror(a) {
  const b = clone(a), m = x => 200 - x;
  b.structure = { trend: 'bearish', last_break: { dir: 'down', bars_ago: 10 },
    last_swing_high: { price: m(a.structure.last_swing_low.price), label: 'LH' },
    last_swing_low: { price: m(a.structure.last_swing_high.price), label: 'LL' } };
  b.sweeps = a.sweeps.map(s => ({ ...s, dir: -s.dir, extreme: m(s.extreme) }));
  b.displacement = a.displacement.map(s => ({ ...s, dir: -s.dir }));
  b.order_blocks = a.order_blocks.map(s => ({ ...s, dir: -s.dir,
    bottom: m(s.top), top: m(s.bottom), mid: m(s.mid) }));
  b.liquidity.pools = a.liquidity.pools.map(s => ({ ...s, price: m(s.price), kind: 'PDL', label: 'Previous day low' }));
  b.premium_discount = { range_high: m(a.premium_discount.range_low),
    range_low: m(a.premium_discount.range_high), position_pct: 85.7, zone: 'premium' };
  return b;
}
function ordinary(dir = 1, primaryR = 1.5, minRR = 2, ladderTargets = true) {
  const a = dir > 0 ? F.ordinary('15m') : mirror(F.ordinary('15m'));
  // These inputs produce entry 100 and the unchanged buffered stop 99.12/100.88.
  // The catalogue still publishes four-decimal prices. Tests measure its actual RR.
  const target = 100 + dir * .88 * primaryR;
  a.order_blocks.push({ dir: -dir, bottom: dir > 0 ? target : target - .1,
    top: dir > 0 ? target + .1 : target, mid: target + dir * .05,
    strength: 1, breached: false, mitigated: false, t: CLOCK - 900000 });
  return { a, dir, ctx: { price: 100, atr: 1, bias: dir, balance: 10000,
    riskPct: .5, valuePerPoint: 1, minRR, ladderTargets, observedAt: CLOCK } };
}
module.exports = { ordinary, mirror, clone, CLOCK };
