'use strict';
/**
 * M30 pure probe: the two zone methods and the consolidation walk that defines the second one — the
 * geometry, with no database, no HTTP and no market. What is measured here is the part the trader's
 * choice depends on: that the vocabulary is closed and folds anything unrecognised onto the named
 * default, that the pivot method is still exactly the pivot candle, that the range walk stops for
 * the three reasons it claims (a displacement bar, price leaving the base, a width cap) and says
 * which one stopped it, that a walk which cannot be made is REPORTED rather than silently becoming
 * the pivot candle, and that the read always names the method it used.
 */
const H = require('./m30-test-support'), { ok } = H;
const path = require('path');

const base = (o, h, l, c) => ({ t: 0, o, h, l, c, v: 1 });
/** A flat base of `n` bars inside 1.1000–1.1040, then whatever the caller appends. */
function flat(n, from = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ t: 1000 + i * 900e3, o: 1.1020, h: 1.1040, l: 1.1000, c: 1.1015, v: 100 });
  return out;
}

H.finish('M30 pure: the two zone methods and the consolidation walk', async () => {
  const S = H.mod('src/bots/smc');
  if (!H.shipped(S, 'the zone-method vocabulary and the consolidation walk (src/bots/smc.js)')) return;

  /* ------------------------------------------------------------------ 1. a closed vocabulary */
  ok('the vocabulary is closed and published: exactly two methods, named',
    JSON.stringify(S.ZONE_METHODS) === '["pivot","range"]' && S.ZONE_METHOD_DEFAULT === 'pivot',
    JSON.stringify(S.ZONE_METHODS));
  ok('the pivot method is the DEFAULT, so an analysis that says nothing about geometry moves nothing',
    S.zoneMethodOf(null) === 'pivot' && S.zoneMethodOf(undefined) === 'pivot' && S.zoneMethodOf('') === 'pivot');
  ok('a requested method is folded case- and whitespace-insensitively, and `RANGE` really is the range method',
    S.zoneMethodOf(' range ') === 'range' && S.zoneMethodOf('RANGE') === 'range' && S.zoneMethodOf('Range') === 'range');
  ok('anything this app cannot plot falls back to the pivot method BY NAME rather than guessing a new geometry',
    ['consolidation', 'both', 'pivot_candle', '1', 'yes'].every((v) => S.zoneMethodOf(v) === 'pivot'),
    JSON.stringify(['consolidation', 'both'].map((v) => [v, S.zoneMethodOf(v)])));

  /* ------------------------------------------------- 2. the consolidation walk, rule by rule */
  // A one-bar base is not a consolidation.
  const single = S.consolidationBase(flat(1), 0, 0.0040);
  ok('a pivot candle with nothing behind it is NOT a consolidation, and the walk says so',
    single.ok === false && single.reason === 'no_consolidation' && single.bars === 1, JSON.stringify(single));
  // No ATR: the width cap is unmeasurable, so the walk refuses rather than inventing one.
  const noAtr = S.consolidationBase(flat(10), 9, 0);
  ok('with no ATR the walk cannot be bounded at all and reports that instead of guessing a width',
    noAtr.ok === false && noAtr.reason === 'no_atr', JSON.stringify(noAtr));
  // The flat base: every bar overlaps, so the whole run is the base, high-to-low.
  const flatBase = S.consolidationBase(flat(6), 5, 0.0040);
  ok('overlapping bars ARE the consolidation: the walk takes the run and reports its high-to-low',
    flatBase.ok === true && flatBase.bars === 6 && flatBase.high === 1.1040 && flatBase.low === 1.1000
    && flatBase.from_i === 0 && flatBase.to_i === 5, JSON.stringify(flatBase));
  ok('and the width it reports is measured against the ATR it was given, not asserted',
    Math.abs(flatBase.width_atr - 0.0040 / 0.0040) < 1e-9, JSON.stringify(flatBase.width_atr));
  // Rule 1: a displacement bar is a LEG, not part of a base.
  // The real order in the market is: a leg, then the base it leaves behind, then the pivot candle.
  const priorLeg = { t: 500, o: 1.1420, h: 1.1560, l: 1.1410, c: 1.1540, v: 900 };
  const withLeg = [priorLeg].concat(flat(4));
  const legWalk = S.consolidationBase(withLeg, withLeg.length - 1, 0.0040);
  ok('a displacement bar stops the walk: the leg that created the zone is never counted as part of the base',
    legWalk.ok === true && legWalk.stopped === 'displacement' && legWalk.bars === 4 && legWalk.from_i === 1
    && legWalk.high === 1.1040 && legWalk.low === 1.1000, JSON.stringify(legWalk));
  // Rule 2: a bar that does not overlap the envelope is the departure, not the consolidation.
  const departure = { t: 4000, o: 1.1180, h: 1.1190, l: 1.1170, c: 1.1185, v: 50 };   // small, and entirely above the base
  const gapRun = [].concat(flat(3), [departure], flat(3));
  const gapWalk = S.consolidationBase(gapRun, gapRun.length - 1, 0.0040);
  ok('a bar that does not overlap the base is where price LEFT it: the walk stops there and names it',
    gapWalk.ok === true && gapWalk.stopped === 'price_left_the_base' && gapWalk.bars === 3 && gapWalk.from_i === 4,
    JSON.stringify(gapWalk));
  // Rule 3: the cap is a REPORT, not a silent truncation.
  const wide = [];
  for (let i = 0; i < 20; i++) wide.push({ t: 1000 + i * 900e3, o: 1.1000 + i * 0.0015, h: 1.1040 + i * 0.0015, l: 1.1000 + i * 0.0015, c: 1.1010 + i * 0.0015, v: 10 });
  const capped = S.consolidationBase(wide, wide.length - 1, 0.0040);
  ok('a base that would grow past the cap is stopped AND the cap is reported, never silently applied',
    capped.ok === true && capped.capped === true && capped.stopped === 'width_cap'
    && capped.width_atr <= S.BASE_MAX_ATR + 1e-9 && capped.limits.max_atr === S.BASE_MAX_ATR,
    JSON.stringify({ capped: capped.capped, width_atr: capped.width_atr, stopped: capped.stopped }));
  ok('every bar inside the base the walk returns really is inside it (the high-to-low bounds the run)',
    capped.ok && wide.slice(capped.from_i, capped.to_i + 1).every((b) => b.h <= capped.high + 1e-9 && b.l >= capped.low - 1e-9),
    JSON.stringify({ from: capped.from_i, to: capped.to_i, high: capped.high, low: capped.low }));
  const twice = S.consolidationBase(flat(6), 5, 0.0040);
  ok('the walk is deterministic: the same candles produce the same base, byte for byte',
    JSON.stringify(twice) === JSON.stringify(flatBase));

  /* ------------------------------------------ 3. the pivot method is EXACTLY the pivot candle */
  const Synth = require(path.join(__dirname, 'harness', 'synth'));
  const series = Synth.series({ seed: 7, bars: 800 });
  const now = series[series.length - 1].t + 900e3;
  const pivot = S.analyse(series, { tf: '15m', now });
  ok('a real analysis names its zone method, and an analysis that was never asked reports asked-nothing',
    pivot.zone_method === 'pivot' && pivot.zone_method_requested === null && pivot.zone_method_fallback === null
    && pivot.zone_method_applied === 0, JSON.stringify({ m: pivot.zone_method, asked: pivot.zone_method_requested, applied: pivot.zone_method_applied }));
  ok('the default read plots zones with the pivot geometry and no consolidation walk attached',
    pivot.order_blocks.length > 0 && pivot.order_blocks.every((z) => z.zone_method === 'pivot' && z.base === null),
    JSON.stringify(pivot.order_blocks.slice(0, 1)));
  ok('and each pivot zone is the pivot candle itself: top and bottom are that bar (and not its body)',
    pivot.order_blocks.every((z) => { const b = series[z.i]; return z.top === Math.round(b.h * 1e4) / 1e4 && z.bottom === Math.round(b.l * 1e4) / 1e4; }),
    JSON.stringify(pivot.order_blocks.slice(0, 3).map((z) => [z.top, z.bottom, series[z.i].h, series[z.i].l])));

  /* ------------------------------------------------- 4. the range method, on the same candles */
  const range = S.analyse(series, { tf: '15m', now, zoneMethod: 'range' });
  const cmp = H.compare(pivot, range, series);
  ok('the range method keeps every origin the pivot method found: it changes the BOX, not which legs exist',
    cmp.origins === pivot.order_blocks.length && cmp.paired === cmp.origins,
    JSON.stringify({ pivot: pivot.order_blocks.length, paired: cmp.paired }));
  ok('every range box CONTAINS its pivot box (a superset, measured bar-key by bar-key, never assumed)',
    cmp.superset === cmp.paired && cmp.widest && cmp.widest.span > 0,
    JSON.stringify({ superset: cmp.superset, paired: cmp.paired, widest: cmp.widest }));
  ok('every zone the walk COULD make carries its evidence: the bars walked, the width in ATR, what stopped it',
    range.order_blocks.filter((z) => z.base && z.base.ok === true).length > 0
    && range.order_blocks.filter((z) => z.base && z.base.ok === true).every((z) => z.zone_method === 'range' && z.base.applied === true
      && Number.isInteger(z.base.bars) && z.base.bars >= 2 && typeof z.base.stopped === 'string'),
    JSON.stringify(range.order_blocks.slice(0, 2).map((z) => z.base)));
  ok('and a zone whose consolidation cannot be walked is NAMED as pivot with the reason, never silently widened',
    range.order_blocks.filter((z) => !(z.base && z.base.ok === true)).every((z) => z.zone_method === 'pivot' && z.base
      && z.base.ok === false && typeof z.base.reason === 'string' && z.top === S.analyse(series, { tf: '15m', now }).order_blocks.find((x) => H.keyOf(x) === H.keyOf(z)).top),
    JSON.stringify(range.order_blocks.filter((z) => !(z.base && z.base.ok === true)).map((z) => [H.keyOf(z), z.base])));
  ok('and the count of zones actually plotted with the range geometry is published on the read',
    range.zone_method_applied === range.order_blocks.filter((z) => z.zone_method === 'range').length && range.zone_method_applied > 0,
    JSON.stringify({ applied: range.zone_method_applied, zones: range.order_blocks.length }));
  ok('the two reads agree about the market itself: same origins, same displacement legs, same price',
    JSON.stringify(pivot.order_blocks.map((z) => H.keyOf(z))) === JSON.stringify(range.order_blocks.map((z) => H.keyOf(z)))
    && pivot.price === range.price && JSON.stringify(pivot.counts) === JSON.stringify(range.counts),
    JSON.stringify({ counts: pivot.counts }));

  /* ------------------------------- 5. an unrecognised method is never a silent geometry change */
  const typo = S.analyse(series, { tf: '15m', now, zoneMethod: 'consolidation' });
  ok('a method this app cannot plot runs the pivot method and NAMES the request and the vocabulary',
    typo.zone_method === 'pivot' && typo.zone_method_requested === 'consolidation'
    && /is not a zone method this app can plot/.test(typo.zone_method_fallback)
    && /pivot, range/.test(typo.zone_method_fallback),
    JSON.stringify(typo.zone_method_fallback));
  ok('and that read is the pivot read: the boxes are identical to the default analysis',
    JSON.stringify(typo.order_blocks) === JSON.stringify(pivot.order_blocks));
  ok('asking for the pivot method explicitly is not an error (the vocabulary includes the default)',
    S.analyse(series, { tf: '15m', now, zoneMethod: 'pivot' }).zone_method_fallback === null);

  /* -------------------------------- 6. the sentinel path still names a method without inventing zones */
  const sentinel = S.analyse(series.slice(0, 10), { tf: '15m', now });
  ok('a short series returns its sentinel and no zone-method claim beyond the default it would use',
    sentinel.ok === false && sentinel.zone_method === undefined && sentinel.order_blocks === undefined,
    JSON.stringify(Object.keys(sentinel)));
});

module.exports = {};
