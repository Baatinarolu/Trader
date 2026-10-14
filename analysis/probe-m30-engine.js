'use strict';
/**
 * M30 engine probe: what the two zone methods do to the DECISION surface, measured against the
 * committed parent rather than asserted.
 *
 * Three claims are on the line and each is measured on real analyses of synthetic series:
 *   1. with no choice made, the read is the parent's read — the zones are the pivot candle, the
 *      candidates are byte-identical, and the only new keys are the two that NAME the method;
 *   2. with the range method chosen, every zone keeps its origin, is a superset of the pivot box,
 *      and the setup model reads the wider box (which is the whole point: the entry the pivot
 *      method misses);
 *   3. the consequence is stated in both directions — the same pullback that reaches the
 *      consolidation without reaching the candle becomes a test of the zone, and the stop behind a
 *      wider zone is further away. Nothing here claims the wider geometry wins; it claims the
 *      difference is real, attributable and named.
 */
const H = require('./m30-test-support'), { ok } = H;
const path = require('path');

const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const S = require(path.join(APP, 'src/bots/smc'));
const Setup = require(path.join(APP, 'src/bots/setup'));
const Synth = require(path.join(__dirname, 'harness', 'synth'));

const ctxOf = (price, extra = {}) => ({ price, balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex', chaseGuard: false, symbol: 'EURUSD', ...extra });
/** A real analysis of one window of one series, at a fixed clock. */
const readOf = (cs, i, opts = {}) => S.analyse(cs.slice(Math.max(0, i - 300), i + 1), { tf: '15m', now: cs[i].t, ...opts });

H.finish('M30 engine: the two zone methods at the decision surface, against the committed parent', async () => {
  if (!H.shipped(S, 'the zone-method vocabulary and the consolidation walk (src/bots/smc.js)')) return;

  /* ------------------------------------------------------ 1. no choice made: the parent's read */
  const parent = process.env.TJ_PARENT ? require(path.join(process.env.TJ_PARENT, 'src/bots/setup')) : null;
  const parentS = process.env.TJ_PARENT ? require(path.join(process.env.TJ_PARENT, 'src/bots/smc')) : null;
  ok('the committed parent really does have only one geometry and no way to ask for another (the control is non-vacuous)',
    !parent || (!parentS.ZONE_METHODS && typeof parentS.consolidationBase !== 'function'),
    parent ? JSON.stringify({ methods: parentS.ZONE_METHODS, walk: typeof parentS.consolidationBase }) : 'no parent tree mounted');

  const cases = [];
  for (let seed = 1; seed <= 4; seed++) {
    const cs = Synth.series({ seed, bars: 900 });
    for (let i = 260; i < cs.length - 4; i += 61) {
      const an = readOf(cs, i);
      if (!an.ok || !an.order_blocks.length) continue;
      const anRange = readOf(cs, i, { zoneMethod: 'range' });
      // The zone indices are indices into the WINDOW the analysis read, so the bars handed to
      // `compare` must be that same window: a longer array would silently measure different bars.
      cases.push({ seed, i, cs, window: cs.slice(Math.max(0, i - 300), i + 1), an, anRange, price: cs[i].c });
      break;   // one window per seed is enough: each is a full analysis, and the loop below walks all zones
    }
  }
  ok('real analyses were built for both methods (the comparison is not vacuous)',
    cases.length === 4 && cases.every((c) => c.an.order_blocks.length && c.anRange.order_blocks.length),
    JSON.stringify(cases.map((c) => [c.seed, c.an.order_blocks.length, c.anRange.order_blocks.length])));

  let candidateDiffs = 0, keyDiff = null, zonesChecked = 0, supersets = 0, missedTotal = 0, missedSamples = [];
  let stopFurther = 0, stopSame = 0, statusChanged = 0, candidatesCompared = 0;
  for (const c of cases) {
    if (parent) {
      const pre = parent.buildSetups(c.an, ctxOf(c.price));
      const now = Setup.buildSetups(c.an, ctxOf(c.price));
      if (JSON.stringify(pre.candidates) !== JSON.stringify(now.candidates)) candidateDiffs++;
      const pk = new Set(Object.keys(pre.candidates[0] || {}));
      const nk = Object.keys(now.candidates[0] || {}).filter((k) => !pk.has(k));
      keyDiff = keyDiff || nk;
    }
    const cmp = H.compare(c.an, c.anRange, c.window);
    zonesChecked += cmp.paired;
    supersets += cmp.superset;
    missedTotal += cmp.missed;
    if (cmp.missedOrigins.length) missedSamples.push({ seed: c.seed, i: c.i, first: cmp.missedOrigins[0], count: cmp.missed });
    // the same setups read on both geometries: what changes for the trader, in both directions
    const pv = Setup.buildSetups(c.an, ctxOf(c.price));
    const rv = Setup.buildSetups(c.anRange, ctxOf(c.price));
    for (let k = 0; k < Math.max(pv.candidates.length, rv.candidates.length); k++) {
      const a = pv.candidates[k], b = rv.candidates[k];
      if (!a || !b || !a.levels || !b.levels) continue;
      candidatesCompared++;
      if (a.ok !== b.ok) statusChanged++;
      const d = (b.levels.stop == null || b.levels.entry == null || a.levels.stop == null || a.levels.entry == null) ? 0
        : Math.abs(b.levels.stop - b.levels.entry) - Math.abs(a.levels.stop - a.levels.entry);
      if (d > 1e-9) stopFurther++; else if (Math.abs(d) <= 1e-9) stopSame++;
    }
  }
  ok('with no method chosen, every candidate the model builds is byte-identical to the committed parent\u2019s',
    !parent || candidateDiffs === 0, JSON.stringify({ diffs: candidateDiffs }));
  ok('and no new candidate key appears at all: the choice is not a hidden field on a setup',
    !parent || JSON.stringify(keyDiff) === '[]', JSON.stringify(keyDiff));
  ok('the filter block names the method on every read, so the geometry is never anonymous',
    cases.every((c) => { const m = Setup.buildSetups(c.an, ctxOf(c.price)).filters.zone_method; return m && m.method === 'pivot' && m.requested === null && m.read === true && JSON.stringify(m.vocabulary) === '["pivot","range"]'; }),
    JSON.stringify(Setup.buildSetups(cases[0].an, ctxOf(cases[0].price)).filters.zone_method));
  ok('and the range read names itself as range, with the number of zones actually plotted that way',
    cases.every((c) => { const m = Setup.buildSetups(c.anRange, ctxOf(c.price)).filters.zone_method; return m && m.method === 'range' && m.applied_zones > 0; }),
    JSON.stringify(Setup.buildSetups(cases[0].anRange, ctxOf(cases[0].price)).filters.zone_method));

  /* ------------------------------------------- 2. the range geometry: same origins, wider boxes */
  ok('over every analysed zone the two methods pair up by origin, and the range box contains the pivot box',
    zonesChecked > 0 && supersets === zonesChecked, JSON.stringify({ zones: zonesChecked, supersets }));
  ok('and the range method really does catch a return the pivot method never sees (price came back into the consolidation without touching the candle)',
    missedTotal > 0, JSON.stringify({ missed: missedTotal, samples: missedSamples.slice(0, 2) }));

  /* --------------------------------------------- 3. the consequence, in both directions */
  ok('the wider zone moves the stop on the setups it is used on: the distance from entry to stop is never smaller',
    candidatesCompared > 0 && stopFurther + stopSame === candidatesCompared && stopFurther > 0,
    JSON.stringify({ compared: candidatesCompared, further: stopFurther, same: stopSame, changed_status: statusChanged }));
  ok('and the model says so where the trader chooses it: the filter publishes the trade-off rather than a winner',
    /wider stop|wider zone/i.test(Setup.buildSetups(cases[0].anRange, ctxOf(cases[0].price)).filters.zone_method.note)
    && /range method/i.test(Setup.buildSetups(cases[0].anRange, ctxOf(cases[0].price)).filters.zone_method.note)
    && /pivot method/i.test(Setup.buildSetups(cases[0].an, ctxOf(cases[0].price)).filters.zone_method.note),
    JSON.stringify([Setup.buildSetups(cases[0].an, ctxOf(cases[0].price)).filters.zone_method.note.slice(0, 90),
      Setup.buildSetups(cases[0].anRange, ctxOf(cases[0].price)).filters.zone_method.note.slice(0, 90)]));

  /* ------------------------------------------------------- 4. unknown and unreadable, named */
  const odd = Setup.buildSetups(readOf(cases[0].cs, cases[0].i, { zoneMethod: 'both' }), ctxOf(cases[0].price));
  ok('a method the app cannot plot runs the pivot geometry and the filter carries the request AND the sentence',
    odd.filters.zone_method.method === 'pivot' && odd.filters.zone_method.requested === 'both'
    && /is not a zone method this app can plot/.test(odd.filters.zone_method.error), JSON.stringify(odd.filters.zone_method));
  ok('an unreadable read (the short-series sentinel) names the method that WOULD be used and reports that nothing ran',
    (() => { const sent = Setup.buildSetups(S.analyse(cases[0].cs.slice(0, 10), { tf: '15m' }), ctxOf(cases[0].price)).filters.zone_method; return sent.method === 'pivot' && sent.read === false && sent.applied_zones === 0; })(),
    JSON.stringify(Setup.buildSetups(S.analyse(cases[0].cs.slice(0, 10), { tf: '15m' }), ctxOf(cases[0].price)).filters.zone_method));

  /* ------------------------------------------- 5. nothing about a grade, score or price moved on its own */
  const pv = Setup.buildSetups(cases[0].an, ctxOf(cases[0].price)), rv = Setup.buildSetups(cases[0].anRange, ctxOf(cases[0].price));
  ok('the two reads disagree about zones and levels only because the boxes differ: the verdict and filter blocks keep the same shape',
    JSON.stringify(Object.keys(pv.verdict)) === JSON.stringify(Object.keys(rv.verdict))
    && JSON.stringify(Object.keys(pv.filters)) === JSON.stringify(Object.keys(rv.filters))
    && typeof pv.verdict.score === 'number' && typeof rv.verdict.score === 'number',
    JSON.stringify([Object.keys(pv.verdict).length, Object.keys(rv.verdict).length, pv.verdict.score, rv.verdict.score]));
});

module.exports = {};
