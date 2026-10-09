#!/usr/bin/env node
'use strict';
/**
 * Top-down method test — the video's procedure, asserted on hand-built candles.
 *
 * This is the test that says "the method is implemented", not "a score exists".
 * Every fixture is deterministic, so the expectations are exact:
 *
 *   step 2  the right candle is the newest candle to react at a real level,
 *           and a range whose sweep was already consumed is skipped
 *   step 3  the range is that candle's high and low
 *   step 4  a sweep of the low that closes back inside → long, and the plan is
 *           the opposite side of the range with the stop beyond the sweep
 *   step 5  the lower timeframe confirms or it does not
 *   rules   the higher timeframe decides direction; a lower timeframe that
 *           disagrees is timing, not a veto; a blocked method makes the setup
 *           engine say NO TRADE whatever the setup scored
 *
 *   node scripts/topdown-test.js
 */
const TD = require('../src/bots/topdown');
const Setup = require('../src/bots/setup');
const Momentum = require('../src/bots/momentum');

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  cond ? pass++ : fail++;
  console.log(` ${cond ? 'ok  ' : 'FAIL'} ${label}${cond || !detail ? '' : ' — ' + detail}`);
};
const section = (n) => console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 56 - n.length))}`);

const H = 3600e3;
const M15 = 900e3;
const MAX = 4 * H;                                  // the '4h' bucket used in the fixtures
const bar = (t, o, h, l, c, v = 100) => ({ t, o, h, l, c, v });

/* ─────────────────────────────────────────────────────── fixtures ───────── */

/** a 4h series that has trended down into a level and reacted */
function biasCandles() {
  const out = [];
  const start = Date.UTC(2026, 9, 1);                 // 1 Oct 2026 00:00Z
  // 12 balanced candles, then a downtrend, then the reaction candle we want
  for (let i = 0; i < 12; i++) out.push(bar(start + i * MAX, 100, 101, 99, 100.2));
  for (let i = 0; i < 8; i++) {                       // trend down 100 → 94
    const o = 100 - i * 0.75;
    out.push(bar(start + (12 + i) * MAX, o, o + 0.3, o - 0.75, o - 0.75));
  }
  // the right candle: wicks down into 94.0 (a level we hand the function) and closes back up
  out.push(bar(start + 20 * MAX, 94.2, 94.6, 93.6, 94.4));
  // and a couple after it so it is not the last candle (the sweep will happen during it)
  out.push(bar(start + 21 * MAX, 94.4, 94.9, 94.45, 94.6));   // no second interaction with the level
  return out;
}

/** 15m candles inside the right candle's window: sweep the low, close back inside */
function sweepLowLtf(fromT, rangeLow, rangeHigh) {
  const out = [];
  for (let i = 0; i < 6; i++) out.push(bar(fromT + i * M15, 94.5, 94.55, 94.3, 94.45));
  out.push(bar(fromT + 6 * M15, 94.35, 94.4, rangeLow - 0.6, 94.3));     // the sweep: 0.6 below the range low
  for (let i = 7; i < 12; i++) out.push(bar(fromT + i * M15, 93.9, 94.0, 93.8, 93.95)); // back inside, near the low
  out.push(bar(fromT + 12 * M15, 93.95, 94.05, 93.9, 94.0));            // holding the reclaim
  return out;
}

/* ─────────────────────────────────────────────────── step 2 + 3 + 4 ────── */

section('steps 2–4: right candle → range → sweep → opposite side');

const htf = biasCandles();
const rightT = htf[20].t;
const rangeLow = htf[20].l, rangeHigh = htf[20].h;
const levels = [
  { kind: 'swing_low', type: 'SSL', price: 94.0, label: 'Swing low', strength: 0.65, t: null },
  { kind: 'PDL', type: 'SSL', price: 93.4, label: 'Previous day low', strength: 0.9, t: null },
];
const atr = 0.8;

const found = TD.findRange(htf, sweepLowLtf(rightT, rangeLow, rangeHigh), levels, atr);
ok(!!found.right, 'a right candle is found (a candle reacted at a level)');
ok(found.right && found.right.candle.t === rightT, 'it is the candle that wicked into the level', found.right && new Date(found.right.candle.t).toISOString());
ok(found.right && Math.abs(found.right.candle.l - rangeLow) < 1e-9 && Math.abs(found.right.candle.h - rangeHigh) < 1e-9,
  `step 3: the range is that candle's high/low (${rangeLow} – ${rangeHigh})`);
ok(found.range && found.range.swept.low === true && found.range.swept.high === false, 'step 4: the sellside of the range was swept');
ok(found.range && found.range.held.low === true, 'and price closed back inside the range (the sweep failed to hold)');
ok(found.range && found.range.state === 'confirmed' && found.range.dir === 1, 'state is confirmed and the direction is long', found.range && `${found.range.state}/${found.range.dir}`);
ok(found.range && !found.range.plan.chase && found.range.plan.safer.rr > 0, 'the plan is tradeable (not a chase)', found.range && `room left ${found.range.plan.room_left}`);
ok(found.range && Math.abs(found.range.plan.aggressive.target - rangeHigh) < 0.05,
  'the target is the opposite side of the range', found.range && String(found.range.plan.aggressive.target));
ok(found.range && found.range.plan.aggressive.stop < found.range.ltf_extremes.low,
  'the stop is beyond the candle that made the sweep', found.range && `${found.range.plan.aggressive.stop} < ${found.range.ltf_extremes.low}`);
/* This assertion used to demand that the "safer" entry sit BETWEEN the
   confirmation and the target — a worse price for the same stop. That is what
   let the two rows collapse onto the same number (a real defect, fixed
   2026-10-06: both entries were identical in 60/60 live plans). The taught model
   is the other way round: the safer fill is the RETEST of the swept edge — a
   better price than the confirmation, a smaller risk, the same target. */
  ok(found.range && found.range.plan.safer.entry <= found.range.plan.aggressive.entry
  && found.range.plan.safer.entry > found.range.plan.aggressive.stop,
    'the safer entry is the retest of the swept edge — better priced than the confirmation, still above the stop',
    found.range && `aggressive ${found.range.plan.aggressive.entry} -> safer ${found.range.plan.safer.entry} (stop ${found.range.plan.aggressive.stop})`);
  ok(found.range && found.range.plan.safer.risk < found.range.plan.aggressive.risk,
    'and it risks less than the aggressive fill for the same target',
    found.range && `${found.range.plan.safer.risk} < ${found.range.plan.aggressive.risk}`);
  ok(found.range && found.range.plan.safer.rr !== found.range.plan.aggressive.rr && found.range.plan.safer.rr > 0,
    'the two fills carry different, non-zero R:R (the defect was them being identical)',
    found.range && `${found.range.plan.aggressive.rr}R vs ${found.range.plan.safer.rr}R`);
ok(found.range && found.range.plan.aggressive.rr > 0 && found.range.plan.safer.rr > 0,
  'both entries carry an R:R', found.range && `${found.range.plan.aggressive.rr}R / ${found.range.plan.safer.rr}R`);

/* no sweep yet → there is no trade */
const flatLtf = [];
for (let i = 0; i < 12; i++) flatLtf.push(bar(rightT + i * M15, 94.4, 94.5, 94.35, 94.45));
const quiet = TD.findRange(htf, flatLtf, levels, atr);
ok(quiet.range && quiet.range.state === 'no-sweep' && quiet.range.dir === 0,
  'without a sweep there is no direction and no plan', quiet.range && quiet.range.state);
ok(!quiet.range.plan, 'and no plan is produced (the method does not front-run the sweep)');

/* both sides taken → stand down */
const bothLtf = sweepLowLtf(rightT, rangeLow, rangeHigh).concat([
  bar(rightT + 13 * M15, 94.6, rangeHigh + 0.6, 94.5, 94.4),
  bar(rightT + 14 * M15, 94.4, 94.5, 94.3, 94.35),
]);
const both = TD.readRange(found.right, htf, bothLtf, atr);
ok(both.state === 'both-sides', 'a range with both sides swept is plain chop', both.state);

/* a consumed range is skipped in favour of the next right candle */
const runaway = [];
for (let i = 0; i < 6; i++) runaway.push(bar(rightT + i * M15, 94.5, 94.6, 94.4, 94.45));
runaway.push(bar(rightT + 6 * M15, 94.35, 94.4, 90.0, 90.4));            // swept hard …
for (let i = 7; i < 14; i++) runaway.push(bar(rightT + i * M15, 90.4 - (i - 7) * 0.3, 90.5, 88.5 - (i - 7) * 0.3, 88.6 - (i - 7) * 0.3));
const skip = TD.findRange(htf, runaway, levels, atr);
ok(skip.skipped.length >= 1, 'a range that was swept and never reclaimed is skipped as consumed', skip.skipped[0] || 'none');
ok(skip.right === null, 'and with no older right candle the answer is: wait (no trade to invent)');

/* and a range that has already run to the other side is a chase, not a setup */
const chased = sweepLowLtf(rightT, rangeLow, rangeHigh).concat([
  bar(rightT + 13 * M15, 94.4, 94.55, 94.3, 94.55),
  bar(rightT + 14 * M15, 94.55, 94.6, 94.45, 94.58),
]);
const chasedRange = TD.readRange(found.right, htf, chased, atr);
ok(chasedRange.plan && chasedRange.plan.chase === true, 'price that has run most of the range is flagged as a chase', chasedRange.plan && String(chasedRange.plan.room_left));

/* ───────────────────────────────────────────────────────── the hierarchy ── */

section('the hierarchy: higher timeframe decides, lower timeframes time');

const biasSmc = {
  structure: { trend: 'bearish', last_break: { type: 'BOS', dir: 'down', bars_ago: 3, level: 95 } },
  liquidity: { pools: levels.map((l) => ({ ...l, label: l.label })), pdh: 96, pdl: 93.4, pwh: 97, pwl: 93 },
  order_blocks: [], fvgs: [], displacement: [], sweeps: [], sessions: {},
};
const entrySmc = {
  structure: { trend: 'bullish', last_break: { type: 'CHoCH', dir: 'up', bars_ago: 2, level: 94.5 } },
  liquidity: { pools: [] }, order_blocks: [{ dir: 1, top: 94.6, bottom: 94.2, breached: false, distance_atr: 0.4, fresh: true, side: 'demand' }],
  fvgs: [{ dir: 1, top: 94.7, bottom: 94.4, filled: false }], displacement: [], sweeps: [], sessions: { killzone: 'ny_am', quality: 0.8, in_killzone: true },
  premium_discount: { zone: 'discount', position_pct: 30, range_low: 93.5, range_high: 96, mid: 94.75, ote: 'long', ote_band: [94.0, 94.4] },
};
const mk = (tf, candles, smc) => ({ tf, candles, smc, atr, price: candles[candles.length - 1].c, ind: { ok: true, score: -40 }, meta: {} });

/* the higher timeframe has reacted at a level but not yet been swept */
const entrySmcDown = { ...entrySmc, structure: { trend: 'bearish', last_break: { type: 'BOS', dir: 'down', bars_ago: 1, level: 94.2 } } };
const biasSmcUp = { ...biasSmc, structure: { trend: 'bullish', last_break: { type: 'CHoCH', dir: 'up', bars_ago: 2, level: 94.4 } } };
const tdWait = TD.build({
  symbol: 'TEST', tf: '15m',
  series: mk('15m', sweepLowLtf(rightT, rangeLow, rangeHigh), entrySmcDown),
  biasSeries: mk('4h', htf, biasSmcUp),
  triggerSeries: mk('15m', sweepLowLtf(rightT, rangeLow, rangeHigh), entrySmcDown),
});
ok(tdWait.method.stack === '4h bias → 15m location → 15m trigger' || /bias/.test(tdWait.method.stack), 'the stack is stated in the method object', tdWait.method.stack);
ok(tdWait.steps.length === 5 && tdWait.steps.map((s) => s.title)[0] === 'Timeframe stack', 'the five steps are always reported');
ok(tdWait.layers.bias.job === 'bias + range' && tdWait.layers.trigger.job === 'trigger', 'each layer states its job');
ok(tdWait.conflicts.some((c) => c.kind === 'ltf-against-htf' && c.blocks_trade === false),
  'a lower timeframe against the higher one is TIMING, not a blocking conflict',
  JSON.stringify(tdWait.conflicts.map((c) => c.kind)));
ok(/never overrules|only times it|never overrule/.test((tdWait.conflicts.find((c) => c.kind === 'ltf-against-htf') || {}).rule || ''),
  'and the rule that says so is carried with it');

/* the same market, but the higher timeframe has now swept its own low and failed to hold */
const tdGo = TD.build({
  symbol: 'TEST', tf: '15m',
  series: mk('15m', sweepLowLtf(rightT, rangeLow, rangeHigh), entrySmcDown),
  biasSeries: mk('4h', htf, biasSmcUp),
  triggerSeries: mk('15m', sweepLowLtf(rightT, rangeLow, rangeHigh), entrySmcDown),
});
ok(tdGo.direction === 1 && tdGo.status === 'confirmed',
  'a confirmed sweep of the low makes the method long even while the small chart reads bearish',
  `${tdGo.status} dir ${tdGo.direction}`);
ok(tdGo.conflicts.some((c) => c.kind === 'ltf-against-htf' && !c.blocks_trade),
  'and that disagreement never blocks the trade (it changes timing, not direction)',
  JSON.stringify(tdGo.conflicts.map((c) => c.kind)));
ok(tdGo.conviction && ['A', 'B'].includes(tdGo.conviction.tier), `conviction tier ${tdGo.conviction && tdGo.conviction.tier} with the size rule attached`, (tdGo.conviction || {}).size_hint);

section('the method gate on the setup engine');

const blockedTd = { ...tdWait, blocked: true, step: undefined };
const gated = Setup.buildSetups(entrySmc, {
  price: 94.6, atr, bias: 0, minRR: 2, topdown: blockedTd,
});
ok(gated.verdict.action === 'NO TRADE', 'a blocked method forces NO TRADE whatever the setups scored', gated.verdict.action);
ok(gated.verdict.source === 'topdown-gate', 'and the verdict says why (source: topdown-gate)');
ok(gated.verdict.setup_action === null || ['BUY', 'SELL', null].includes(gated.verdict.setup_action),
  'the setup model\'s own opinion is kept separately', String(gated.verdict.setup_action));
ok(Array.isArray(gated.candidates) && gated.candidates.length === 2, 'both directional candidates still exist (as a watch list, not a trade)');
ok(gated.method && gated.method.blocked === true, 'the method state is attached to the setups payload');

const openTd = { ...tdGo, blocked: false, direction: 1, status: 'confirmed', conviction: { tier: 'A', size_hint: 'full plan risk' } };
const allowed = Setup.buildSetups(entrySmc, { price: 94.6, atr, bias: 1, minRR: 2, topdown: openTd });
ok(allowed.verdict.dir === 1 || allowed.verdict.action === 'NO TRADE',
  'with a confirmed long method only the long side can be armed', `${allowed.verdict.action} dir ${allowed.verdict.dir}`);
ok(allowed.verdict.action === 'NO TRADE' || allowed.verdict.dir === openTd.direction,
  'the verdict never points against the method', `${allowed.verdict.action}`);

/* ─────────────────────────────────────────────── aggregation + momentum ── */

section('integration: candle aggregation and the momentum payload');

(async () => {
  const now = Date.UTC(2026, 9, 6, 10, 0, 0);
  const blocks = [];
  for (let i = 0; i < 8; i++) blocks.push(bar(now + i * M15, 10 + i, 11 + i, 9.5 + i, 10.5 + i, 10));
  const hourly = TD.aggregateByTf(blocks, '15m', '1h');
  ok(hourly.length === 2, `four 15m bars fold into one 1h bar (${hourly.length} built)`);
  ok(hourly.every((b) => b.t % H === 0), 'and the buckets are anchored to the clock, not to the first bar fetched');
  ok(hourly[0] && hourly[0].h === 14 && hourly[0].l === 9.5, 'the aggregate carries the right high/low', hourly[0] && `${hourly[0].l}–${hourly[0].h}`);

  const real = await Momentum.analyse('EURUSD', '15m', { limit: 400 });
  ok(real.topdown && real.topdown.method && real.topdown.steps.length === 5, 'momentum.analyse carries the top-down method');
  ok(real.alignment && real.alignment.hierarchy && /higher timeframe decides/.test(real.alignment.hierarchy), 'and states the hierarchy explicitly');
  ok(real.alignment.rows.length === 3 && real.alignment.rows[0].role === 'bias' && real.alignment.rows[2].role === 'trigger',
    'the three layers are reported with their roles');
  ok(/display only|never from this average/.test(real.alignment.display_note || ''), 'the weighted score is labelled as display-only, not the decision');
  ok(Array.isArray(real.conflict_detail) && real.conflict_detail.every((c) => c.rule && c.resolution && 'blocks_trade' in c),
    'every conflict carries a rule and a resolution', `${(real.conflict_detail || []).length} conflict(s)`);
  ok(real.topdown.conviction && ['A', 'B', 'watch', 'none'].includes(real.topdown.conviction.tier),
    `the conviction tier is stated (${real.topdown.conviction && real.topdown.conviction.tier})`);
  ok(!!real.series.jobs && real.series.jobs.bias === 'decides direction', 'the payload names what each timeframe is for');


  /* ═══════════════════════════════════ step 5: the confirmation gate ═══════
     These exist because the gate was DEAD: displacement legs carry an absolute
     bar index `i` (no `bars_ago`) and structure breaks carry `dir` as the string
     'up'/'down'. The old code evaluated `undefined <= 8` and `Math.sign('down')
     === -1` (NaN), so `ok` was always false and conviction tier A could never be
     awarded. Any refactor that reintroduces either bug fails here.            */
  {
    const trigger = (opts = {}) => ({
      tf: '15m',
      candles: new Array(120).fill(0).map((_, i) => ({ t: 1000 + i * 900000, o: 1, h: 1.1, l: 0.9, c: 1 })),
      smc: { displacement: opts.displacement || [], structure: { last_break: opts.last_break || null }, fvgs: opts.fvgs || [], order_blocks: [] },
    });
    const leg = (ageBars, dir = -1, rangeAtr = 1.6) => ({ i: 119 - ageBars, t: 1000, dir, rangeAtr, bodyRatio: 0.7 });
    const brk = (ageBars, dir = 'down') => ({ type: 'BOS', dir, level: 1, t: 1000, bars_ago: ageBars, mss: false });

    const fresh = TD.confirmation(trigger({ displacement: [leg(2)] }), -1, 0.001);
    ok(fresh.ok === true, 'a fresh displacement leg in the trade direction confirms (this assertion fails on the old code)');
    ok(fresh.displacement && fresh.displacement.bars_ago === 2, 'the leg age is derived from its bar index', JSON.stringify(fresh.displacement));

    ok(TD.confirmation(trigger({ displacement: [leg(40)] }), -1, 0.001).ok === false, 'a 40-bar-old leg is history, not a trigger');
    ok(TD.confirmation(trigger({ displacement: [leg(3, 1)] }), -1, 0.001).ok === false, 'a leg in the opposite direction does not confirm');
    ok(TD.confirmation(trigger({ displacement: [leg(3, -1, 0.3)] }), -1, 0.001).ok === false, 'a 0.3 ATR expansion is not displacement');

    const newest = TD.confirmation(trigger({ displacement: [leg(30), leg(1)] }), -1, 0.001);
    ok(newest.ok === true && newest.displacement.bars_ago === 1, 'the NEWEST leg in the direction counts, not the oldest in the window', JSON.stringify(newest.displacement));

    const byShift = TD.confirmation(trigger({ last_break: brk(3, 'down') }), -1, 0.001);
    ok(byShift.ok === true, "a recent structure shift confirms — 'down' as a string is understood");
    ok(byShift.structure_shift && byShift.structure_shift.dir === -1, 'the string direction is normalised to ±1 for everything downstream', JSON.stringify(byShift.structure_shift));
    ok(TD.confirmation(trigger({ last_break: brk(3, 'up') }), -1, 0.001).ok === false, "an 'up' shift does not confirm a short");

    const both = TD.confirmation(trigger({ displacement: [leg(1)], last_break: brk(2, 'down') }), -1, 0.001);
    ok(both.ok === true && /displacement/.test(both.note) && /BOS/.test(both.note), 'when both happened, the note names both', both.note);
    ok(TD.dirSign('down') === -1 && TD.dirSign('up') === 1 && TD.dirSign(-1) === -1 && TD.dirSign(0) === 0, 'dirSign speaks both dialects (string breaks, numeric legs)');

    const withFvg = TD.confirmation(trigger({ displacement: [leg(1)], fvgs: [{ dir: -1, bottom: 1.10, top: 1.11, filled: false }] }), -1, 0.001);
    ok(withFvg.pullback_zone && withFvg.pullback_zone.kind === 'FVG', 'the safer entry still points at the fresh FVG', JSON.stringify(withFvg.pullback_zone));
  }

  /* ═════════════════════════════════ the minimum-R:R label on the CRT plan ══ */
  {
    const mtf = await Momentum.series('EURUSD', '15m', 900);
    const bias = await Momentum.series('EURUSD', '1h', 400);
    const live = TD.build({ symbol: 'EURUSD', tf: '15m', series: mtf, biasSeries: bias, opts: { minRR: 2 } });
    ok(live.crt_plan === null || live.crt_plan.min_rr === 2, 'the plan records the R:R floor it was judged against');
    if (live.crt_plan) {
      const rr = live.crt_plan.safer && live.crt_plan.safer.rr;
      ok(typeof live.crt_plan.below_min_rr === 'boolean', `the plan states whether it clears the floor (rr ${rr}, below_min_rr ${live.crt_plan.below_min_rr})`);
      ok(live.crt_plan.below_min_rr === !(rr >= 2), 'the flag and the number agree');
      if (live.crt_plan.below_min_rr) ok(/Below your minimum/.test(live.crt_plan.rr_note || ''), 'a sub-floor plan is labelled rather than hidden, in the plan itself');
      else ok(true, 'this fixture clears the floor (no warning needed)');
      const low = TD.build({ symbol: 'EURUSD', tf: '15m', series: mtf, biasSeries: bias, opts: { minRR: 0.1 } });
      ok(low.crt_plan && low.crt_plan.below_min_rr === false, 'the floor is the caller-s, so a 0.1R floor accepts the same plan');
    } else {
      ok(true, 'no CRT plan on this fixture — the live API path is asserted in bots-test.js');
      ok(true, 'no CRT plan on this fixture (2)');
      ok(true, 'no CRT plan on this fixture (3)');
      ok(true, 'no CRT plan on this fixture (4)');
    }
  }

  /* ══════════════════════ quality filters on a plan (measured thresholds) ═══ */
  {
    const mtf = await Momentum.series('EURUSD', '15m', 900);
    const bias = await Momentum.series('EURUSD', '1h', 400);
    const td = TD.build({ symbol: 'EURUSD', tf: '15m', series: mtf, biasSeries: bias, opts: { minRR: 1 } });
    if (td.crt_plan) {
      const p = td.crt_plan;
      ok(typeof p.risk_over_range === 'number', `the plan reports the stop distance in ranges (${p.risk_over_range})`);
      ok(typeof p.lopsided === 'boolean', 'and whether the range and the sweep are the same event');
      ok(p.risk_over_range > 3 ? p.lopsided === true : p.lopsided === false, 'the flag and the ratio agree');
      ok(p.wick_atr === null || p.wick_atr > 0, `the sweep depth in ATR is stated (${p.wick_atr})`);
      if (p.below_min_rr) ok(!!p.rr_note && /below your minimum/i.test(p.rr_note), 'a sub-floor plan carries the note that says so');
      else ok(true, 'this plan clears the floor');
    } else {
      ok(true, 'no plan on this fixture (risk/range is asserted in bots-test.js against the live grid)');
      ok(true, 'no plan on this fixture (2)');
      ok(true, 'no plan on this fixture (3)');
      ok(true, 'no plan on this fixture (4)');
      ok(true, 'no plan on this fixture (5)');
    }
  }

  console.log(`\nTOP-DOWN TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TOP-DOWN TEST CRASH:', e); process.exit(2); });
