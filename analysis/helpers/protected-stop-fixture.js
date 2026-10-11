'use strict';
/** Explicit M75/M76 composition inputs. OHLC supports the protected peak; prior
 * liquidity and analysis zone/structure are DECLARED seams, not SMC discovery.
 */
const F = require('./target-timeframe-fixture');
const T = Date.UTC(2026, 9, 6, 9), STEP = 900000;
function ordinary(dir = 1, opts = {}, P) {
  const a = structuredClone(F.ordinary('15m'));
  if (dir < 0) {
    a.structure = { trend: 'bearish', last_break: { dir: 'down', bars_ago: 10 },
      last_swing_low: { price: 90, label: 'LL' }, last_swing_high: { price: 101, label: 'LH' } };
    a.sweeps[0].dir = -1; a.sweeps[0].extreme = 100.7; a.displacement[0].dir = -1;
    a.order_blocks[0].dir = -1; a.liquidity.pools = [{ price: 92, kind: 'PDL', label: 'Previous day low', strength: .9, swept: false }];
    a.premium_discount = { range_high: 102, range_low: 88, position_pct: 85.7, zone: 'premium' };
  }
  const peak = opts.peak ?? (dir > 0 ? 97 : 103);
  const m = x => dir > 0 ? x : 200 - x;
  const make = (i, o = 100, h = 101, l = 99.9, c = 100) => ({ t: T + i * STEP,
    o: m(o), h: dir > 0 ? h : m(l), l: dir > 0 ? l : m(h), c: m(c), v: 100 });
  const b = Array.from({ length: 15 }, (_, i) => make(i));
  b[0] = make(0, 101, 102, 100.8, 101);
  b[1] = make(1, 101, 102, dir > 0 ? peak : 200 - peak, 100.5);
  b[3] = make(3, 100.5, 101, 100, 100.7);
  const sweep = { i: 1, t: b[1].t, dir, type: dir > 0 ? 'SSL' : 'BSL', level: 100,
    extreme: peak, close: b[1].c, bars_ago: 13, wick_atr: 1.5, strength: 1,
    pool: dir > 0 ? 'equal_lows' : 'equal_highs', label: 'Explicit prior-liquidity sweep' };
  const pool = { kind: sweep.pool, type: sweep.type, price: 100, tf: '15m', source_t: T,
    available_at: T + STEP, basis: 'declared_composition_liquidity' };
  const report = P?.discover ? P.discover(b, [sweep], { tf: '15m', observedAt: T + 15 * STEP, poolBefore: () => pool }) : null;
  a.sweeps = [sweep]; a.protected_levels = report;
  a.structure.last_break = { dir: dir > 0 ? 'up' : 'down', type: 'BOS', i: 3,
    t: b[3].t, level: m(100.6), bars_ago: 11 };
  if (opts.edge != null) {
    if (dir > 0) a.order_blocks[0].bottom = opts.edge; else a.order_blocks[0].top = opts.edge;
  }
  a.order_blocks[0].t = T;
  if (opts.current) a.order_blocks[0].structure_causes = [{ displacement_t: b[3].t, displacement_i: 3,
    shift: { ...a.structure.last_break, confirmed: true, close: b[3].c } }];
  return { a, b, sweep, report, pool, clock: T + 15 * STEP };
}
module.exports = { ordinary, T, STEP };
