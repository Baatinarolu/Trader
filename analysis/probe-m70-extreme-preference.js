'use strict';
/** Ep 18 M70. Explicit structural inputs, NOT market history or an edge claim.
 * TJ_APP selects the parent negative control. No DB, clock or candle-provider IO.
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const Setup = require(path.join(APP, 'src/bots/setup'));
const SMC = require(path.join(APP, 'src/bots/smc'));
const make = require('./helpers/countertrend-fixture');
let pass = 0, fail = 0;
const ok = (name, cond) => { console.log((cond ? ' ok   ' : ' FAIL ') + name); cond ? pass++ : fail++; };
const copy = (x) => JSON.parse(JSON.stringify(x));
function fixture(dir) {
  const f = make(dir), a = f.input.series.smc;
  const m = (x) => dir < 0 ? x : 200 - x;
  const bounds = (lo, hi) => dir < 0 ? { bottom: lo, top: hi } : { bottom: m(hi), top: m(lo) };
  a.price = m(96.75);
  a.sessions = SMC.sessionState(new Date(f.END));
  a.order_blocks = [{ ...a.order_blocks[0], ...bounds(96.5, 98.5),
    mid: m(97.5), body_mid: m(97.6), strength: 0.3, fresh: true, mitigated: false, distance_atr: 0 }];
  a.fvgs = [];
  a.breakers = [{ dir, ...bounds(96.4, 96.9), mid: m(96.65),
    t: f.END - 8 * 900000, i: 111, bars_ago: 8, strength: 1.5, retested: true,
    confirmed: true, broke_structure: true, failed_reaction: true,
    reaction_point: m(97.4), distance_atr: 0 }];
  a.sweeps = [{ ...a.sweeps[0], extreme: m(97.45), close: a.price,
    t: f.END - 2 * 900000, i: 117, bars_ago: 2 }];
  const read = (raw, opts = {}) => Setup.buildSetups(raw, { price: raw.price, atr: 1,
    bias: dir, indicators: f.input.series.ind, minRR: 2, balance: 10000, riskPct: .5,
    useBreakers: true, ...opts }).candidates.find((c) => c.dir === dir);
  return { f, a, m, bounds, read };
}
for (const dir of [-1, 1]) {
  const { f, a, m, bounds, read } = fixture(dir), label = dir < 0 ? 'short' : 'long';
  ok(label + ': fuel sweep can occur without already mitigating the extreme midpoint', dir < 0
    ? a.sweeps[0].extreme < a.order_blocks[0].mid
    : a.sweeps[0].extreme > a.order_blocks[0].mid);
  const before = read(a, { preferExtreme: false }), after = read(a);
  ok(label + ': isolated pre-rule arm chooses the stronger flip', before.levels.entry_kind === 'flip_zone' && before.ok);
  ok(label + ': geometry preference beats strength, enters the extreme OB', after.levels.entry_kind === 'order_block' && after.levels.entry === m(97.6) && after.ok);
  ok(label + ': exact fuel provenance survives level construction', after.levels.zone_preference?.rule === 'extreme_over_flip'
    && after.levels.zone_preference.fuel.price === m(97.4) && after.levels.zone_preference.fuel.sweep_t === a.sweeps[0].t);
  const strongOrdinary = copy(a);
  strongOrdinary.order_blocks.push({ ...strongOrdinary.order_blocks[0], ...bounds(96.45, 96.8),
    body_mid: m(96.6), mid: m(96.625), strength: 1.8 });
  ok(label + ': a stronger non-extreme OB does not cancel the extreme-over-flip rule',
    read(strongOrdinary, { preferExtreme: false }).levels.entry === m(96.6)
    && read(strongOrdinary).levels.entry === m(97.6));
  const noFuel = copy(a); noFuel.sweeps[0].extreme = m(97.3);
  ok(label + ': another sweep does not substitute for the failed-reaction pool', !read(noFuel).ok
    && read(noFuel).no_trade.some((r) => r.includes('Extreme-over-flip')));
  const early = copy(a);
  Object.assign(early.sweeps[0], { t: a.breakers[0].t - 900000, i: 110, bars_ago: 9 });
  ok(label + ': a sweep before flip formation is not later fuel', !read(early).ok);
  const wick = copy(a); wick.sweeps[0].close = m(97.7);
  ok(label + ': excursion without close-back is not a fuel sweep', !read(wick).ok);
  const absent = copy(a); delete absent.breakers[0].reaction_point;
  ok(label + ': unknown liquidity is explicit, not invented or a false veto', read(absent).ok
    && read(absent).levels.zone_preference?.fuel.known === false && read(absent).levels.zone_preference.fuel.swept === null);
  const touched = copy(a); touched.order_blocks[0].mitigated = true;
  ok(label + ': already-used extreme does not displace the flip', read(touched).levels.entry_kind === 'flip_zone');
  const breached = copy(a); breached.order_blocks[0].breached = true;
  ok(label + ': breached extreme is ineligible', read(breached).levels.entry_kind === 'flip_zone');
  const disjoint = copy(a); Object.assign(disjoint.order_blocks[0], bounds(99, 99.5));
  ok(label + ': disjoint areas do not invoke extreme-over-flip', read(disjoint).levels.entry_kind === 'flip_zone');
  const notExtreme = copy(a);
  notExtreme.order_blocks.push({ ...notExtreme.order_blocks[0], ...bounds(99, 99.5),
    body_mid: m(99.25), strength: 0.1, distance_atr: 2 });
  ok(label + ': overlapping non-extreme OB is not mislabeled as the extreme', read(notExtreme).levels.entry_kind === 'flip_zone');
  const noOpt = read(noFuel, { useBreakers: false });
  ok(label + ': flip wiring stays opt-in, default does not activate the fuel rule', noOpt.levels.entry_kind === 'order_block'
    && !noOpt.levels.zone_preference && noOpt.ok);
  // The added policy must not perturb a candidate when no flip competes with it.
  const standard = copy(a); standard.breakers = [];
  ok(label + ': no competing flip = identical complete candidate', JSON.stringify(read(standard)) === JSON.stringify(read(standard, { preferExtreme: false })));
}
console.log(`\nM70: ${pass} passed / ${fail} failed`);
process.exitCode = fail ? 1 : 0;
