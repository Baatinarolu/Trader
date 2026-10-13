'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ENTRY MODEL (playlist episodes 18, 20, 25, 31 — the "sniper" model)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Turns an SMC analysis into concrete, ranked trade plans:
 *
 *      HTF bias  ->  sweep  ->  displacement  ->  zone (OB/FVG)  ->  retest entry
 *      stop beyond the sweep/zone, target the opposing liquidity, min 1:2
 *
 *  Every plan carries:
 *    - a score (0-100) and a letter grade (A+ / A / B / C / no-trade)
 *    - the confluence checklist that produced it (so the trader can audit the bot)
 *    - exact entry / stop / targets with R:R per target
 *    - a position-size risk plan in the journal's own instrument maths
 *    - invalidation + management rules
 *    - the score, for RANKING candidates against each other
 *    - `ok` plus `no_trade`, decided by the all-or-nothing rules, not by the score.
 *      History: M61 found the old wording named four vetoes when only two vetoed, because
 *      "veto" meant "a cap that happens to land below the C floor of 44". That made
 *      tradeability an accident of arithmetic — the risk-reward cap sat at 45, one point
 *      above the floor, so a sub-2R idea was refused in spirit and accepted in fact (M7/M95).
 *      It is now explicit: `vetoes` lists the conditions the course states as non-negotiable
 *      and `tradeable` is their negation. The score caps below are kept for what they are
 *      good at — showing how far short a setup fell — and no longer decide anything.
 *
 *  The model is deliberately conservative: when the trigger is not there, it says
 *  "wait" instead of inventing a trade. That is episode 19 — when not to trade.
 */

const I = require('../instruments');
const Entry = require('./entry-models');
const Targets = require('./targets');
const Protected = require('./protected');
const Stops = require('./stops');
const EntryPreference = require('./entry-preference');
const SWEEP_LOOKBACK = 25; // existing trigger age, shared with M33's LTF composition

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const GRADES = [
  { min: 86, grade: 'A+', label: 'Textbook — every box ticked' },
  { min: 72, grade: 'A', label: 'High quality — trade the plan' },
  { min: 58, grade: 'B', label: 'Tradeable — reduced size or wait for the retest' },
  { min: 44, grade: 'C', label: 'Marginal — paper/demo or half risk at most' },
  { min: -Infinity, grade: 'no-trade', label: 'Not an A+ setup — the edge is not there' },
];

// M58: capital deployment per grade. A+/A deploy the account's configured risk in full;
// B and C are scaled down to match the wording GRADES already carries. C stays at half of B
// so that its "half risk at most" label is actually true. 'no-trade' is 0 for completeness —
// such a setup is not signalled, so the multiplier is never reached.
const GRADE_RISK_MULT = { 'A+': 1, 'A': 1, 'B': 0.5, 'C': 0.25, 'no-trade': 0 };

/* -------------------------------------------------------------------------
 * M10 — Ep 19's stand-down days, implemented as a GRADE FILTER ON B AND C.
 *
 * THE COURSE. Ep 19 stands down Monday ("lower trading volume", "a lot of traps")
 * and Friday ("lower liquidity... institutions are closing their books", weekend
 * rollover), and December for the same reason at a monthly scale. But it also
 * carries an explicit exception: "if a setup meets my criteria, I will take the
 * trade regardless of the day." So this is NOT a blackout. A and A+ pass through
 * untouched; B and C are stood down. That reading is the one the ledger records,
 * and it is why this lives next to the grade table rather than in `vetoes` — a
 * veto would kill the A+ setup the course explicitly permits.
 *
 * ★ MEASURED CONTRADICTION, RECORDED RATHER THAN RESOLVED. Baseline 7 walked real
 * EURUSD and XAUUSD 15m bars and bucketed the trades actually taken by weekday:
 *
 *     Mon  n=12  win  8.3%  exp -0.7195R  PF 0.14   <- the course is RIGHT
 *     Tue  n= 6  win  0.0%  exp -0.8333R  PF 0.00
 *     Wed  n=11  win  9.1%  exp -0.6031R  PF 0.17
 *     Thu  n=11  win 18.2%  exp +0.2532R  PF 1.35
 *     Fri  n=12  win 33.3%  exp +0.2649R  PF 1.64   <- the course is CONTRADICTED
 *
 *   Monday is the worst day in the sample and matches Ep 19 outright. Friday is the
 *   BEST day — highest win rate, positive expectancy — with no sign of the "lower
 *   liquidity" reasoning. Mon+Fri combined (-0.2273R) beat Tue-Thu (-0.3160R), so
 *   this filter as the course specifies it would have suppressed the best day in the
 *   sample.
 *
 *   Friday at n=12 is well inside noise, so this does NOT establish that Friday is
 *   good. It establishes that the premise is not safe to assume in either direction.
 *   The default therefore stays FAITHFUL TO THE COURSE — the transcripts are the
 *   specification and n=12 is not evidence — but `ctx.standDown` overrides it, so
 *   `{ days: [1], months: [12] }` runs Monday-and-December only and `{ days: [] }`
 *   disables the day filter, and the harness can measure both arms. A trader who
 *   disagrees with Ep 19 on Friday can turn off exactly that part without touching
 *   the code, and the response says which configuration produced the decision.
 * ------------------------------------------------------------------------*/
const M10_DEFAULT = { days: [1, 5], months: [12] };   // Monday, Friday, December
const M10_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GRADE_A_MIN = 72;    // A and A+ are exempt — the course's own "regardless of the day"
const NO_TRADE_MAX = 43;   // one point under the C floor of 44, so gradeFor() returns 'no-trade'

/**
 * Does Ep 19's stand-down apply to this bar?
 * Returns `applies:false` when the calendar is unknown rather than guessing: `sessions`
 * is `{}` for the short-series sentinel, and a filter that fires on missing data would
 * stand down every analysis of a short series. Same lesson as M8, which tests
 * `in_killzone === false` against the boolean for exactly this reason.
 * @param {object} sessions  analysis.sessions
 * @param {object|null} [override]  `{days:[],months:[]}`, or null/false to disable
 */
function standDownFor(sessions, override) {
  const cfg = override === undefined ? M10_DEFAULT : override;
  if (!cfg || typeof cfg !== 'object') return { applies: false, reason: null, configured: false };
  const days = Array.isArray(cfg.days) ? cfg.days : [];
  const months = Array.isArray(cfg.months) ? cfg.months : [];
  /* Number(null) === 0 and Number('') === 0, so a missing calendar would have been read as
   * SUNDAY and silently reported calendar_known:true — the same trap that made an
   * invalidation_level of 0 breach on every call in M50. Test for absence BEFORE coercing.
   * 0 is a legitimate day (Sunday), so the check is on null/undefined/'', not on falsiness. */
  const known = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const dow = sessions && known(sessions.dow) ? Number(sessions.dow) : NaN;
  const month = sessions && known(sessions.month) ? Number(sessions.month) : NaN;
  if (!Number.isFinite(dow) || !Number.isFinite(month)) {
    return { applies: false, reason: null, configured: true, calendar_known: false, days, months };
  }
  const dayHit = days.indexOf(dow) !== -1;
  const monthHit = months.indexOf(month) !== -1;
  if (!dayHit && !monthHit) {
    return { applies: false, reason: null, configured: true, calendar_known: true,
      day_name: M10_DAY_NAMES[dow] || null, month, days, months };
  }
  const which = [];
  if (dayHit) which.push(M10_DAY_NAMES[dow] || ('day ' + dow));
  if (monthHit) which.push('December');
  return {
    applies: true, calendar_known: true, configured: true,
    day_name: M10_DAY_NAMES[dow] || null, month, days, months,
    reason: `${which.join(' and ')} stand-down (Ep 19) — lower liquidity and institutional book-closing. `
      + `A and A+ setups still trade: "if a setup meets my criteria, I will take the trade regardless of the day." `
      + `B and C are stood down.`,
    note_friday: months.indexOf(12) === -1 && days.indexOf(5) !== -1
      ? 'Measured on real bars (Baseline 7, n=12) Friday was the BEST day in the sample at +0.2649R and a 33.3% win rate, contradicting Ep 19. n=12 is inside noise, so the course default stands — but pass standDown:{days:[1],months:[12]} to filter Monday and December only.'
      : null,
  };
}

/**
 * M52 — mid-range risk reduction.
 *
 * Ep 15 mistake #3: *"If it's mid-range, if it's consolidating, if it's sideways, it's either you
 * stay out of the market completely and wait for price to come up to the extremes. Or if you do
 * want to trade this, reduce your risk, use like a smaller position size."*
 *
 * The DETECTION was already here — `inGoodHalf` costs a mid-range entry 10 points. What was
 * missing is the SIZE response he specifies: `riskPct` was a constant lifted from the request
 * context and never scaled by where price sits in the dealing range, so a mid-range entry and a
 * deep-discount entry at the same grade deployed the same percentage of the account. Scoring it
 * down and then sizing it identically is not the rule he states.
 *
 * `depth` is how far price sits beyond the midpoint TOWARD the favourable extreme: 0.5 at the
 * range low for a long (range high for a short), 0 at the midpoint, negative in the wrong half.
 * The multiplier is full at the extremes and falls to `floor` through the equilibrium band,
 * interpolated linearly between — so risk cannot JUMP on a one-tick move across a threshold. A
 * cliff at 45% would make position size discontinuous in price, which is indefensible live.
 *
 * The band is read from `pd.eq_band` rather than redeclared here, so the label smc.js emits and
 * the sizing this drives cannot drift apart. That agreement is the second half of the ledger row:
 * before it, `'equilibrium'` was reachable only at exactly pos === 0.5, so the label was cosmetic
 * and the 45–55 band in `inGoodHalf` was the only real mechanism.
 *
 * Deliberately INERT when the dealing range is unavailable: multiplier 1, sizing exactly as
 * before. This one is NOT inert in general, though — unlike M9 it changes real position sizes,
 * so it is measured against Baseline 6 rather than assumed neutral.
 */
const RANGE_RISK = { fullAt: 0.20, floor: 0.5 };

function rangeRiskMult(pd, long) {
  if (!pd || !Number.isFinite(pd.position_pct)) {
    return { mult: 1, depth: null, band: null, reason: 'no dealing range available' };
  }
  const pos = pd.position_pct / 100;
  const band = Array.isArray(pd.eq_band) && pd.eq_band.length === 2 ? pd.eq_band : [45, 55];
  const halfAt = Math.max(0, (band[1] - band[0]) / 200);   // 0.05 for a 45–55 band, as a fraction
  const fullAt = Math.max(RANGE_RISK.fullAt, halfAt + 1e-9);
  const depth = long ? 0.5 - pos : pos - 0.5;
  if (depth >= fullAt) return { mult: 1, depth: r4(depth), band, reason: 'at the favourable extreme of the range' };
  if (depth <= halfAt) {
    return {
      mult: RANGE_RISK.floor, depth: r4(depth), band,
      reason: depth < 0 ? 'in the wrong half of the range for this direction' : 'mid-range, inside the equilibrium band',
    };
  }
  const mult = RANGE_RISK.floor + (1 - RANGE_RISK.floor) * (depth - halfAt) / (fullAt - halfAt);
  return { mult: r4(mult), depth: r4(depth), band, reason: 'between mid-range and the extreme' };
}

function gradeFor(score) {
  const g = GRADES.find((x) => score >= x.min);
  return { grade: g.grade, label: g.label };
}

/** Liquidity pools that matter for a target, sorted outward from `entry`. */
/**
 * M21 — strong / weak structure.
 *
 * The course makes this a TARGET-SELECTION rule, not a decoration:
 *   "in a bullish market structure you want to trade from STRONG structure and TARGET WEAK
 *    structure", where weak is "where the break of structure happen" (expected to break) and
 *    strong is "where price is most likely going to hold the next time".
 * Ep-bonus `en8RMFRqSME` uses the same vocabulary on the 1h: "this is the one hour strong low
 * and this is the one hour weak low."
 *
 * The labels already computed by smc.js are enough — no restructuring of the swing tiers is
 * needed (that is M22, a separate rule) and nothing here depends on the CHoCH definition
 * (that is M24, also separate). Verified against the live output: structure.labels carries
 * H/L/HH/HL/LH/LL, and structure.last_swing_high/low carry the most recent of each.
 *
 *   bullish → weak = the most recent LH (the lower high structure is expected to take out)
 *             strong = the most recent HL (the higher low structure is expected to hold)
 *   bearish → weak = the most recent LL, strong = the most recent LH
 *
 * A ranging structure gets no assignment: strong and weak are defined by the direction of the
 * break of structure, so without a direction the labels would be invented.
 */
function strongWeak(analysis) {
  const st = analysis && analysis.structure;
  if (!st) return null;
  const trend = st.trend;
  if (trend !== 'bullish' && trend !== 'bearish') {
    return { trend: trend || 'ranging', strong: null, weak: null,
      note: 'No strong/weak assignment — the structure is ranging, and strong/weak are defined relative to the direction of the break of structure.' };
  }
  // The MOST RECENT swing high and low are the levels that matter. Reaching back for the
  // last LH/LL was wrong: in a healthy bullish HH/HL sequence the most recent high is an HH,
  // so searching for an LH walks back to a stale level that can sit BELOW the strong low and
  // below current price. smc.js already exposes the most recent of each, with its label.
  const sh = st.last_swing_high || null;
  const sl = st.last_swing_low || null;
  const pick = (l) => (l ? { price: l.price, label: l.label, i: l.i, t: l.t } : null);

  if (trend === 'bullish') {
    const weak = pick(sh);      // the high above, expected to be taken out
    const strong = pick(sl);    // the low below, expected to hold
    if (!weak || !strong || !(weak.price > strong.price)) {
      // Emit nothing rather than a target on the wrong side of the entry. The contradiction
      // between the trend label and the swing labels is M50 (no bias hysteresis), not M21.
      return { trend, strong: null, weak: null, stale: true,
        note: 'Bullish label, but the most recent swing high is not above the most recent swing low — the trend label is stale relative to structure, so no strong/weak target is assigned. (See M50: no bias hysteresis.)' };
    }
    return { trend, strong, weak,
      note: `Bullish structure: trade from the strong low at ${strong.price} (${strong.label}, expected to hold) and target the weak high at ${weak.price} (${weak.label}, expected to break).` };
  }
  const weak = pick(sl);        // the low below, expected to break
  const strong = pick(sh);      // the high above, expected to hold
  if (!weak || !strong || !(weak.price < strong.price)) {
    return { trend, strong: null, weak: null, stale: true,
      note: 'Bearish label, but the most recent swing low is not below the most recent swing high — the trend label is stale relative to structure, so no strong/weak target is assigned. (See M50: no bias hysteresis.)' };
  }
  return { trend, strong, weak,
    note: `Bearish structure: trade from the strong high at ${strong.price} (${strong.label}, expected to hold) and target the weak low at ${weak.price} (${weak.label}, expected to break).` };
}

/**
 * M25 — market phase, the four-stage sequence from Ep 5.
 *
 * Ep 2 says stay away from consolidation and Ep 5 closes with the three-state model, both of
 * which this codebase ALREADY serves: `smc.js` initialises `trend = 'ranging'` and `ranging`
 * is used as a bias veto in five places (momentum.js:105/142, topdown.js:550, setup.js:137,
 * indicators.js:160). So no new stand-down logic is needed — the ledger entry was narrowed to
 * exactly this after Ep 5 was read in full.
 *
 * What was genuinely missing is the distinction between the stages WITHIN a trend: expansion
 * (an impulse is running), pullback (price is retracing into the point of interest), and
 * balance (tight, undecided). Ep 5's timing rule — "get in during the balance phase… not
 * after" — and M3 both key on it, and without it the bot cannot tell an impulse it is late
 * for from a pullback it is early for.
 *
 * Derived only from what analyse() exposes. The newest bar index is taken as the maximum index
 * seen across displacement and swing labels, so no candle array is required.
 */
function marketPhase(analysis) {
  const st = analysis && analysis.structure;
  if (!st) return { phase: 'unknown', note: 'No structure available.' };
  const trend = st.trend || 'ranging';
  const lb = st.last_break || null;
  const ago = lb ? lb.bars_ago : null;
  const RECENT = 5;   // bars within which a break of structure still counts as an impulse in progress

  if (trend === 'ranging') {
    return { phase: 'balance', trend, bars_since_break: ago,
      note: 'No structural direction — this is the balance/consolidation stage. Ep 2: stay away from it; Ep 5: the market is ranging.' };
  }
  if (ago !== null && ago <= RECENT) {
    return { phase: 'expansion', trend, bars_since_break: ago,
      note: `Structure broke ${ago} bar(s) ago (${lb.type} ${lb.dir}) — the impulse is still running. Entering now is chasing it; the model waits for the retrace.` };
  }
  return { phase: 'pullback', trend, bars_since_break: ago,
    note: `No break of structure in the last ${RECENT} bars while the trend holds${ago === null ? '' : ` (last one ${ago} bars ago)`} — price is retracing. This is the stage the entry models want.` };
}

function targetPools(analysis, dir, entry, { magnets = true } = {}) {
  if (magnets) return Targets.catalogue(analysis, dir, entry, (strongWeak(analysis) || {}).weak);
  // Explicit research control for the pre-M54 pool/weak-only composition.
  const pools = (analysis.liquidity && analysis.liquidity.pools) || [];
  const outward = pools
    .filter((p) => (dir > 0 ? p.price > entry : p.price < entry))
    .filter((p) => p.strength >= 0.5)
    .sort((a, b) => (dir > 0 ? a.price - b.price : b.price - a.price));
  const seen = new Set();
  const out = [];
  // M21: the weak structural extreme is the course's primary target — "target weak structure".
  // It goes first when it lies beyond the entry, so it takes the T1 slot ahead of generic
  // liquidity pools. Strength 0.9 puts it just under an equal-high/low triple, which the
  // method treats as the strongest draw on price.
  const sw = strongWeak(analysis);
  if (sw && sw.weak && (dir > 0 ? sw.weak.price > entry : sw.weak.price < entry)) {
    const key = sw.weak.price.toFixed(5);
    seen.add(key);
    out.push({ price: sw.weak.price, strength: 0.9, kind: 'weak_structure',
      label: `Weak ${sw.weak.label} — the level structure is expected to take out`, touches: null });
  }
  for (const p of outward) {
    const key = p.price.toFixed(5);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * Build trade candidates for both directions.
 *
 * @param {object} analysis  output of smc.analyse()
 * @param {object} ctx  { price, atr, bias, biasReason, indicators, momentum, balance, riskPct,
 *                        valuePerPoint, assetClass, symbol, newsBlackout, maxRiskPct, minRR,
 *                        topdown }   topdown = the method gate (topdown.js build()):
 *                                    when it blocks, the verdict is NO TRADE no matter how
 *                                    good the setup scores, and when it carries a direction
 *                                    only that side can be armed.
 * @returns {{candidates:Array, verdict:object}}
 */
const SMC = require('./smc');   // M38/M40: sessionAffinity

/** M33 — counter-HTF execution is reduced even with A-grade confirmation.
 * Reuse the existing counter-CRT policy too: it previously promised half size in
 * words but the actual sizing/Now full-risk flag never consumed that promise.
 */
function methodRiskMult(td, dir) {
  if (!td || td.direction !== dir) return 1;
  const counter = td.countertrend && td.countertrend.kind === 'internal-pullback';
  const conflicts = td.conflicts || td.conflict_detail || [];
  return counter || conflicts.some((c) => c.kind === 'counter-trend-crt') ? 0.5 : 1;
}

/** M70: shared MTF POI selector. Flips remain opt-in (M47); unmitigated
 * extreme-over-overlapping-flip takes precedence over the generic strength ranking. */
function selectZone(analysis, dir, ctx = {}) {
  const obs = ((analysis && analysis.order_blocks) || []).filter((z) => z.dir === dir && !z.breached);
  const fvgs = ((analysis && analysis.fvgs) || []).filter((g) => g.dir === dir && !g.filled);
  // prefer a fresh, strong OB with an unfilled FVG overlapping or nested
  // M47 - Ep 14: flip zones are computed and correctly named but consumed by NOTHING.
  // "A supply flip zone is formed when a demand zone fails." findBreakers() emits them and
  // the API returns them, yet grep finds only four hits in src/ - the docstring, the
  // computation, the output and the API payload. He trades them as points of interest in
  // their own right, so they belong in the same candidate pool as un-breached order blocks.
  // Opt-in (ctx.useBreakers) until it is measured; the `retested` flag is required, which is
  // his own confirmation step - "retest since the break = confirmation the flip holds".
  const breakers = ctx.useBreakers
    ? ((analysis && analysis.breakers) || []).filter((b) => b.dir === dir && b.retested)
    : [];
  const obCandidates = obs.map((z) => {
    const overlap = fvgs.find((g) => g.bottom <= z.top && g.top >= z.bottom);
    const reach = z.distance_atr;                          // how far price is from the zone
    const proximity = clamp(1 - reach / 6, 0, 1);          // within 6 ATR is "reachable"
    const score = z.strength + (z.fresh ? 0.35 : 0) + (overlap ? 0.3 : 0) + proximity * 0.5;
    return { zone: z, overlap, score, reach };
  });
  const breakerCandidates = breakers.map((b) => {
    const overlap = fvgs.find((g) => g.bottom <= b.top && g.top >= b.bottom);
    // a flip zone has no `fresh`/`breached` of its own; shape it so downstream can use it
    // `fresh` on an order block means "recently formed". For a flip zone the equivalent
    // confirmation is the RETEST, which the filter above already requires - his own three
    // criteria are failed reaction, break of structure and a close beyond the reaction
    // point, none of which is about recency. Keying it to bars_ago gave 0% of breakers the
    // bonus against 90% of order blocks, which is most of the ranking gap by itself.
    const zone = { ...b, fresh: true, breached: false, is_breaker: true };
    const reach = b.distance_atr;
    const proximity = clamp(1 - reach / 6, 0, 1);
    const score = b.strength + (zone.fresh ? 0.35 : 0) + (overlap ? 0.3 : 0) + proximity * 0.5;
    return { zone, overlap, score, reach };
  });
  const scored = obCandidates.concat(breakerCandidates).sort((a, b) => b.score - a.score);
  let bestOB = scored[0] || null;
  const preference = Entry.preferExtreme({ chosen: bestOB, orderBlocks: obs,
    flipZones: scored.filter((c) => c.zone.is_breaker).map((c) => c.zone),
    sweeps: (analysis && analysis.sweeps) || [], dir, enabled: ctx.preferExtreme !== false });
  if (preference) bestOB = obCandidates.find((c) => c.zone === preference.zone);
  const bestFvg = fvgs.filter((g) => !bestOB || !(bestOB.overlap && bestOB.overlap.i === g.i)).sort((a, b) => b.size_atr - a.size_atr)[0] || null;

  // M16 (decided): a standalone FVG no longer qualifies as the point of interest.
  // The sniper-entry material is explicit — "ideally, I want the fair value gap to be
  // WITHIN the order block itself… try not to enter at like a random fair value gap that
  // is in the middle of nowhere." The asymmetry is deliberate and sanctioned: entering on
  // ORDER BLOCK mitigation with no FVG present is allowed, but a lone FVG is not a POI.
  // `bestFvg` is still computed because the reach calculation at the zoneReach block below
  // uses it; it just can no longer form the zone.
  // M47: this line rebuilds the zone as a NEW object, so anything a candidate carries has to
  // be forwarded explicitly - the same trap as `no_trade` being stripped at index.js:394.
  // Two things it got wrong for flip zones: `kind` was hardcoded 'order_block', which would
  // have advertised a flip zone as an order block, and `entry` came from `body_mid`, which
  // findBreakers does not copy - so a flip-zone point of interest would have had an
  // UNDEFINED entry price.
  const zMeta = bestOB ? bestOB.zone : null;
  const zone = bestOB ? { kind: zMeta.is_breaker ? 'flip_zone' : 'order_block', top: zMeta.top, bottom: zMeta.bottom, mid: zMeta.mid, entry: zMeta.body_mid != null ? zMeta.body_mid : zMeta.mid, meta: zMeta, overlap: bestOB.overlap }
    : null;
  return { bestOB, bestFvg, zone, preference };
}

function buildSetups(analysis, ctx = {}) {
  const price = Number(ctx.price || (analysis && analysis.price));
  const atr = Number(ctx.atr || (analysis && analysis.atr)) || price * 0.001;
  const bias = Number(ctx.bias || 0);            // -1 / 0 / +1 from the MTF + momentum layer
  const minRR = Number(ctx.minRR || 2);
  const targetAlignment = ctx.targetAlignment !== false; // M77; false = frozen M54 research arm
  const targetMagnets = ctx.targetMagnets !== false; // M54 default; false = measurement control
  const sessions = (analysis && analysis.sessions) || {};
  /* M38/M40 — the session view THIS SYMBOL is entitled to. The calendar fields (dow,
   * month) are preserved by the copy, so M10's stand-down is unaffected. */
  const sess = SMC.sessionAffinity(ctx.symbol, sessions);
  /* M26 — the trader's OWN window. Until now the bot could refuse a setup for being
   * outside A killzone, but nothing could tell it which killzone this trader actually
   * trades, so a London trader was handed NY AM signals and an Asia trader was handed
   * London ones. "Find one specific window and just focus on that window ... but just
   * stick to one." When ctx.sessionPref names one of the four, a candidate armed in any
   * other window — or in none — is refused, which is what turns the restriction into a
   * rule instead of advice: "you're not relying on discipline. You are just implementing
   * that discipline into your trading system itself."
   * Read off the CALENDAR (bullets[].active), not off sess.killzone: sessionAffinity
   * nulls killzone when the open window is not this pair's, and that case is already
   * refused by M8's veto with a better message. */
  const winPref = SMC.normalizeWindowPref(ctx.sessionPref);
  const prefOpenBullet = (sess.bullets || []).find((b) => b.active) || null;
  const prefBlocked = !!(winPref && winPref.key && (!prefOpenBullet || prefOpenBullet.key !== winPref.key));
  /* M26 + M40: a window's pairs are part of the window. Restricting EURUSD to Asia
   * (AUD/NZD/JPY only) is a setting that can never fire, so it is said out loud rather
   * than left to look like a quiet market. Null — not false — when the caller gave no
   * symbol (the scan path), because unknown must never read as a conflict. */
  const prefCounts = (winPref && winPref.key && ctx.symbol)
    ? SMC.pairCountsFor(ctx.symbol, SMC.WINDOW_BY_KEY[winPref.key]) : null;
  /* M26 + M25: the window says WHEN, the phase says whether there is anything to trade
   * in it. Inside the chosen window the phase is read once, so consolidation is visible
   * there instead of being mistaken for a slow market. Gating on the phase is M3's
   * timing rule and applies separately below. */
  /* M3 — Ep 5 keys the expected retrace to the BOS. Ep 2 reinforces the timing rule:
   *   "your goal as a trader is to get in during the balance phase, so that you can capture
   *    the imbalance. Your goal is not to get in after the imbalance, but rather before the
   *    imbalance."
   * with the failure mode he names in that same Ep 2 passage:
   *   "The reason why they fail is because they tend to chase after price during an
   *    expansion... It's because you are not trading price. You are just trading your ego."
   * The bot already had an anti-chase rule, but it was keyed to DISTANCE FROM A ZONE
   * (entry_status 'waiting'/'approaching', and "Chasing here breaks the model's edge"), and
   * the two are not equivalent: price can be far from a zone and mid-expansion, or NEAR a
   * zone and mid-expansion. The second case is what the zone rule cannot see, and it is the
   * one this gate refuses. Keying it to the break-of-structure event is also exactly what
   * the row asks for — "after a break of structure... expect price to start retracing" hangs
   * the expected pullback off the BOS, not off how far price is from a level.
   * The classifier is M25's marketPhase(), used as defined: one threshold, one source. Its
   * RECENT = 5 bars is a classifier setting, NOT a number the course gives — he never counts
   * bars — so it is recorded as a judgment call and measured, not defended as scripture.
   * Computed once above the loop rather than per candidate: it depends only on the analysis,
   * exactly like M10's standDown. */
  const phaseInfo = marketPhase(analysis);
  /* Ships ON. `chaseGuard: false` is the opt-out arm, so the two can be measured against
   * each other without editing the engine — same pattern as useBreakers / standDownOnWall. */
  const chaseGuard = ctx.chaseGuard !== false;
  const prefPhase = (winPref && winPref.restricted && !prefBlocked) ? phaseInfo : null;
  /* M10 — computed ONCE here rather than per candidate: it depends only on the bar's
   * calendar and the caller's configuration, not on anything about an individual setup.
   * It was originally declared inside the scoring loop, which put it out of scope for the
   * candidate object built further down and crashed four of the five app suites with
   * `ReferenceError: standDown is not defined`. node --check passed that, because the
   * identifier is only resolved at runtime — the suites are what caught it. */
  const standDown = standDownFor(sessions, ctx.standDown);
  const strike = sessions.quality != null ? sessions.quality : 0.5;
  const blackout = ctx.newsBlackout || null;
  /* M111 — the news row is only a PASS when the calendar was actually read. `ctx.newsState`
   * carries the engine's own three-state read (`blocked` / `clear` / `unknown`); an outage is
   * `unknown`, and an unknown news read is NOT a pass — evidence of absence requires the absence
   * to have been observed. A caller that consulted no calendar at all (the chart and scan
   * surfaces) supplies no state: that is recorded as `not_consulted` in the payload below rather
   * than being mapped onto either `clear` or `unknown`, and its behaviour is unchanged — this fix
   * is about the read that FAILED, not about every surface that does not read. */
  const newsState = ctx.newsState || 'not_consulted';
  const newsUnknown = newsState === 'unknown';
  const ind = ctx.indicators || null;
  const momentum = ctx.momentum || null;
  const td = ctx.topdown || null;                   // the method gate

  const candidates = [];
  // M61: `const vetoes = []` lived here and was never read or returned — dead code. Removed.

  for (const dir of [1, -1]) {
    const long = dir > 0;
    const side = long ? 'buy' : 'sell';
    const counter = td && td.countertrend && td.countertrend.kind === 'internal-pullback'
      && td.countertrend.dir === dir ? td.countertrend : null;
    const model = td && td.entry_setup && td.entry_setup.dir === dir ? td.entry_setup : null;
    const useModel = !!(model && model.applies);
    const crtProjection = useModel && td.crt_plan ? td.crt_plan : null;
    // M77: ordinary CRT is not a second universal HTF exit exception. Retain the
    // old exclusive HTF range edge ONLY in the explicit pre-M77 research arm.
    const boundedCRT = !targetAlignment ? crtProjection : null;
    const entryTf = useModel ? model.entry_tf : (analysis && analysis.tf) || null;
    const scopedTargets = Targets.scopeSources([{ tf: (analysis && analysis.tf) || null, analysis },
      ...((ctx.targetSources || (td && td.target_sources)) || [])], entryTf);
    const counterTarget = counter && counter.target;
    const counterTargetTf = counterTarget && typeof counterTarget.tf === 'string' ? counterTarget.tf : null;
    const counterTargetKnown = !!(counterTargetTf && Targets.timeframePolicy(counterTargetTf).state === 'known'
      && Number.isFinite(counterTarget.price) && counterTarget.price > 0);
    const targetPolicy = counter ? { rule: 'bounded_counter_htf', state: counterTargetKnown ? 'known' : 'unknown',
      entry_tf: entryTf, allowed_tfs: counterTargetKnown ? [counterTargetTf] : [], exception: 'm33_internal_pullback',
      source_tfs: counterTargetKnown ? [counterTargetTf] : [], rejected_sources: [] }
      : targetAlignment ? scopedTargets.policy : { rule: 'pre_m77_research', state: 'unscoped',
        entry_tf: entryTf, allowed_tfs: null, exception: null };
    const noTargetReason = counter
      ? 'No real prescribed counter-HTF target — wait; no ordinary or farther-target fallback.'
      : targetAlignment
        ? 'No real opposing target on the entry timeframe or one level above — wait; the HTF projection is not an executable exit, and no measured-move or farther-target rescue is allowed.'
        : 'No real opposing target — wait for a valid magnet; no measured-move or farther-target rescue.';
    const entryAtr = useModel ? model.atr : atr;
    const preferenceClock = ctx.observedAt || (td && td.entry_preference && td.entry_preference.observed_at)
      || (analysis && analysis.structure_source && analysis.structure_source.observed_at) || Date.now();
    const entryPreference = { ...((useModel ? EntryPreference.scope(model.entry_preference, entryTf, preferenceClock, dir) : null)
      || (td && EntryPreference.scope(td.entry_preference, entryTf, preferenceClock, dir))
      || EntryPreference.read({ dir, series: ctx.entrySeries, tf: entryTf,
        observedAt: preferenceClock, execution: 'basic_causal_pullback' })), execution: 'basic_causal_pullback' };
    const ladderTargets = !!ctx.ladderTargets && !counter && !boundedCRT; // a bounded pullback has ONE HTF target
    const triggerRead = useModel ? model : counter ? counter.confirmation : null;
    const checks = [];
    const add = (key, label, pass, weight, detail) => checks.push({ key, label, pass: !!pass, weight, detail: detail || null });

    /* ---------------------------------------------------------------- 1. trigger: sweep */
    const sweeps = ((counter || useModel) ? (triggerRead && triggerRead.sweep ? [triggerRead.sweep] : [])
      : ((analysis && analysis.sweeps) || [])).filter((s) => s.dir === dir);
    const recentSweep = sweeps.find((s) => s.bars_ago <= SWEEP_LOOKBACK) || null;
    const stopSweep = useModel ? model.stop_sweep || recentSweep : recentSweep;
    const sweepQuality = recentSweep ? clamp(recentSweep.wick_atr / 1.2, 0.3, 1.2) : 0;
    add('sweep', long ? 'Sell-side liquidity was swept (stops taken)' : 'Buy-side liquidity was swept (stops taken)',
      !!recentSweep, 18, recentSweep ? `${recentSweep.label} · ${recentSweep.wick_atr} ATR wick · ${recentSweep.bars_ago} bars ago` : 'No sweep of the opposing liquidity yet — the model has no trigger.');

    /* ------------------------------------------------------- 2. displacement after sweep */
    const disps = ((counter || useModel) ? (triggerRead && triggerRead.displacement ? [triggerRead.displacement] : [])
      : ((analysis && analysis.displacement) || [])).filter((d) => d.dir === dir);
    const disp = disps.find((d) => !recentSweep || d.i > recentSweep.i) || disps[0] || null;
    add('displacement', 'Displacement leg in your direction',
      !!disp, 15, disp ? `${disp.rangeAtr} ATR expansion bar, ${(disp.bodyRatio * 100).toFixed(0)}% body` : 'No expansion bar — price is drifting, not displacing.');

    /* ------------------------------------------------------------------- 3. the zone */
    const legacyZone = selectZone(analysis, dir, ctx);
    const zone = useModel ? model.zone : legacyZone.zone;
    const bestOB = useModel ? (zone ? { zone: zone.meta, overlap: zone.overlap,
      reach: entryAtr > 0 ? Math.abs(price - (long ? zone.top : zone.bottom)) / entryAtr : null } : null) : legacyZone.bestOB;
    const bestFvg = useModel ? null : legacyZone.bestFvg;
    const preference = useModel ? (model.preference ? { ...model.preference,
      note: 'Ep18: causal extreme entry retained through the lower pullback; failed-reaction liquidity is the fuel.' } : null) : legacyZone.preference;
    if (useModel) add('entry_model', 'Named LTF entry: POI → sweep → shift → causal-zone pullback',
      model.ready, 0, `${model.entry_model} (${model.entry_tf}): ${model.state}. ${model.reasons.join(' ')}`);
    if (preference) add('extreme_preference', 'Extreme zone over overlapping flip; sweep failed-reaction liquidity first',
      !preference.blocked, 0, preference.note + (preference.fuel.known
        ? ` ${preference.fuel.type} at ${preference.fuel.price} is ${preference.fuel.swept ? 'swept' : 'not swept'}.`
        : ' Failed-reaction price is unknown; no liquidity pool is invented.'));

    add('zone', long ? 'Demand zone (order block) to buy from' : 'Supply zone (order block) to sell from',
      !!zone, 16, zone ? `Order block ${r4(zone.bottom)} – ${r4(zone.top)}${zone.overlap ? ', nested FVG' : ', no nested FVG (entry on mitigation of the block itself)'}${zone.meta.fresh ? ', fresh' : `, already tested ${zone.meta.tests}×`}`
        : bestFvg ? `No unmitigated order block in this direction — only a standalone FVG at ${r4(bestFvg.bottom)} – ${r4(bestFvg.top)}, which is not a point of interest on its own.`
          : 'No unmitigated zone in this direction.');

    if (zone && zone.overlap) add('nested', 'Zone + imbalance overlap (confluence)', true, 8, 'The order block contains an unfilled FVG — two reasons for price to react at the same price.');

    /* --------------------------------------------------------- 4. discount / premium */
    const pd = (analysis && analysis.premium_discount) || null;
    const inGoodHalf = pd ? (long ? pd.position_pct < 55 : pd.position_pct > 45) : false;
    add('range', long ? 'Price is in discount of the dealing range' : 'Price is in premium of the dealing range',
      inGoodHalf, 10, pd ? `${pd.position_pct}% of the range ${r4(pd.range_low)} – ${r4(pd.range_high)} (${pd.zone})${pd.ote === (long ? 'long' : 'short') ? ' · inside the 0.62–0.79 OTE band' : ''}` : 'Dealing range not available.');

    /* ------------------------------------------------------------- 5. trend alignment */
    const trend = analysis && analysis.structure ? analysis.structure.trend : 'ranging';
    // M6: smc.analyse() returns a short-series sentinel `{ ok:false, tf }` with NO `structure`
    // key (bots/smc.js, candles.length < 30), reachable via the `trim` branch in momentum.js.
    // The `trend` line above already guards for that; hoist the same guard so the report
    // string below cannot dereference `analysis.structure` unconditionally.
    const lastBreak = useModel ? model.shift : analysis && analysis.structure ? analysis.structure.last_break : null;

    /* ---------------------------------------------------------------------------
     * M69 / M63 / M48 — THE MARKET SHIFT IS A BREAK EVENT, NOT A TREND LABEL.
     *
     * Ep 17: *"There are mainly two things that I look out for before I actually enter
     * for the trade… Two things, liquidity sweep and market shift."* Ep 20: *"we need to
     * have some form of market shift. That's the prerequisite. That's the non-negotiable
     * for each one of these entry models."* And on why a failed reaction is not an entry:
     * *"Because you haven't gotten a confirmation that the structure is indeed shifting
     * bullish. You haven't gotten the market shift."*
     *
     * The check here tested only that the structure LABEL agreed with the trade direction.
     * A label is a summary of the whole window and can read 'bullish' without any break in
     * the required direction having occurred on this leg — so the non-negotiable could be
     * satisfied without the event it names. The break machinery was already correct:
     * smc.js detects a break on the CLOSE (`dir === 'up' ? c.c > s.price : c.c < s.price`),
     * which is exactly his *"a candlestick… where it closed above the last lower high."*
     * Only the gate read the label instead of the event.
     *
     * Direction mapping: for a LONG the required shift is a break UP (price closed above a
     * structural high); for a SHORT a break DOWN. Ep 17 states the short side explicitly:
     * *"You don't want to enter for a sell when the internal structure is still bullish."*
     *
     * `structureKnown` exists because of M8's rule in this file — MISSING DATA MUST NOT
     * VETO. `smc.analyse()` returns a short-series sentinel with no `structure` key, and a
     * gate that fired on it would stand down every analysis of a short series, exactly the
     * failure M8 was written to prevent. Unknown is therefore reported as unknown and is
     * not treated as "no shift".
     * ------------------------------------------------------------------------*/
    const structureKnown = useModel || !!(analysis && analysis.structure);
    const shiftDir = long ? 'up' : 'down';
    const labelAligned = (long && trend === 'bullish') || (!long && trend === 'bearish');
    const marketShift = structureKnown && !!lastBreak && lastBreak.dir === shiftDir;
    // the weighted check now scores the EVENT. The label is kept for the report string so a
    // trader can see the two disagreeing, which is the whole point of the change.
    const trendAligned = marketShift;
    const htfTrend = analysis && analysis.htf_structure ? analysis.htf_structure.trend : null;
    const htfAligned = htfTrend ? ((long && htfTrend === 'bullish') || (!long && htfTrend === 'bearish')) : null;
    add('structure', 'Internal structure agrees — a break in the trade\'s direction', trendAligned, 12,
      !structureKnown
        ? 'Structure not available on this series (too short) — no market shift can be confirmed either way.'
        : `Market shift needs a break ${shiftDir}; `
          + (lastBreak
            ? `the last break was a ${lastBreak.type} ${lastBreak.dir} ${lastBreak.bars_ago} bars ago${lastBreak.mss ? ' (MSS — sweep then shift)' : ''}`
            : 'no structural break in this window')
          + `. Label reads ${trend}${labelAligned === marketShift ? '' : ` — trend label and confirmed break disagree; the break event decides (M69)`}.`);
    if (htfAligned !== null) add('htf', 'Higher-timeframe trend agrees', htfAligned, 10, `HTF structure reads ${htfTrend}.`);

    /* ------------------------------------------------------------- 6. higher-timeframe bias */
    add('bias', 'Multi-timeframe indicator bias agrees', bias !== 0 && Math.sign(bias) === dir, 12,
      ctx.biasReason || (bias === 0 ? 'Indicators are mixed — no directional edge.' : null));

    /* ------------------------------------------------------------------ 7. oscillators */
    const rsi = ind && ind.ind ? ind.ind.rsi14 : null;
    const macdOk = ind && ind.ind && ind.ind.macd ? ((long && ind.ind.macd.hist > 0) || (!long && ind.ind.macd.hist < 0)) : null;
    const rsiOk = rsi != null ? (long ? rsi < 62 : rsi > 38) : null;   // not chasing extended momentum
    if (rsi != null || macdOk != null) {
      add('momentum', 'Momentum not extended against you', (rsiOk !== false) && (macdOk !== false), 8,
        `RSI ${rsi != null ? r2(rsi) : 'n/a'}${macdOk != null ? `, MACD histogram ${macdOk ? 'supports' : 'opposes'}` : ''}${rsi != null && !rsiOk ? ' — you would be buying/selling into an over-extended oscillator' : ''}.`);
    }

    /* ------------------------------------------------------- 8. session / killzone */
    add('session', 'Inside a high-probability killzone', !!sess.in_killzone, 8,
      sessions.note || 'Session filter unavailable.');

    /* ---------------------------------------------------------------- 9. news */
    add('news', 'No high-impact news in the window', !blackout && !newsUnknown, 10,
      // M4 fixed the old "the next 60 minutes" fallback, which was wrong twice (it named a
      // hardcoded number and described a symmetric test as forward-only). M62's surviving
      // half is closed by M110 here: the note does not stay silent about the window — it
      // INTERPOLATES the two configured numbers, which are the account's own settings, so
      // it cannot describe a rule the app is not applying. The fallback only applies to a
      // caller that supplied neither (a research call with no account note).
      blackout ? blackout : (ctx.newsNote || 'No high-impact releases inside the news window (checked either side of the entry).'));

    /* ------------------------------------------------------------- 10. volatility */
    const atrRank = ind && ind.ind ? ind.ind.atr_rank : null;
    add('volatility', 'Volatility tradeable (not chaos)', atrRank == null || atrRank <= 90, 6,
      atrRank == null ? null : `ATR is at the ${atrRank}th percentile of the last 120 bars.`);

    /* --------------------------------------------------------- 11. liquidity runway */
    let levels = null;
    if (zone && (!useModel || entryAtr > 0)) {
      const entry = zone.entry;
      const protection = useModel ? model.protection : analysis && analysis.protected_levels;
      const protectionClock = ctx.observedAt || (protection && protection.observed_at) || Date.now();
      const currentProtection = Protected.forSweep(protection, stopSweep);
      const shift = analysis && analysis.structure && analysis.structure.last_break;
      const shiftSign = shift && (shift.dir === 'up' ? 1 : shift.dir === 'down' ? -1 : 0);
      const causalZone = !!(currentProtection && shift && shiftSign === dir && stopSweep.t <= shift.t
        && (zone.meta.structure_causes || []).some(c => c.shift && c.shift.confirmed === true
          && c.shift.t === shift.t && c.displacement_t >= stopSweep.t && c.displacement_t <= shift.t));
      // Bonus Sniper: a closed entry candle which sweeps/reclaims at the zone can
      // itself be the current protected boundary; no future fractal is required.
      const entryCandle = !!(currentProtection && protection.closed_through === currentProtection.available_at
        && currentProtection.sweep_close >= zone.bottom && currentProtection.sweep_close <= zone.top);
      const stopChoice = Stops.plan({ dir, entry, zone, atr: entryAtr, tf: entryTf,
        report: protection, observedAt: protectionClock, currentSweep: stopSweep,
        currentSweepTf: useModel ? model.entry_tf : counter && counter.confirmation ? counter.confirmation.tf : entryTf,
        currentIsCausal: useModel || causalZone || entryCandle, policy: ctx.stopPolicy === 'legacy' ? 'legacy' : 'course' });
      const stopBase = stopChoice.base, buffer = stopChoice.buffer;
      const stop = stopChoice.raw_stop;
      const risk = stop === null ? 0 : Math.abs(entry - stop);
      const stopEvidence = ctx.stopPolicy === 'legacy' ? null : Stops.evidence(stopChoice);
      const entryEvidence = useModel ? { ...Entry.evidence(model), entry_preference: entryPreference, ...(stopEvidence ? { stop_policy: stopEvidence } : {}) } : null;
      if (ctx.stopPolicy !== 'legacy') add('stop_valid', 'Defined adverse stop at the selected invalidation boundary',
        stopChoice.state === 'known', 0, stopChoice.reason);
      const ordinarySources = targetAlignment ? scopedTargets.sources.map((s) => s.analysis) : [analysis];
      const pools = counter || boundedCRT ? [] : ordinarySources.flatMap((a) =>
        targetPools(a, dir, entry, { magnets: targetMagnets }));
      const targets = targetMagnets ? Targets.levels(pools, dir, entry, risk) : [];
      for (const p of targetMagnets ? [] : pools) {
        const reward = Math.abs(p.price - entry);
        const rr = risk ? reward / risk : 0;
        if (rr < 0.9) continue;                       // ignore pools the entry already sits on
        targets.push({ label: p.label, kind: p.kind, price: r4(p.price), rr: r2(rr), strength: p.strength, touches: p.touches || null });
      }
      if (counter && counterTargetKnown) {
        const target = counterTarget;
        // No 0.9R discard, measured move, weak-structure override or farther runner:
        // keep the prescribed target even when it FAILS the floor; the veto then says so.
        targets.push({ label: target.label || 'HTF opposing zone', kind: 'htf_order_block',
          tf: target.tf, source_tf: target.tf, price: r4(target.price), rr: risk ? r2(dir * (target.price - entry) / risk) : 0,
          strength: 1, touches: null });
      }
      if (boundedCRT) {
        // Preserve the ORIGINAL CRT range-edge target. Only the causal lower
        // entry/stop inputs change; never substitute a farther target to clear RR.
        const price = boundedCRT.aggressive.target;
        targets.push({ label: 'Original CRT range edge', kind: 'crt_range', tf: boundedCRT.tf,
          price: r4(price), rr: risk ? r2(dir * (price - entry) / risk) : 0, strength: 1 });
      }
      if (!counter && targetAlignment && crtProjection
          && targetPolicy.allowed_tfs.includes(crtProjection.tf)
          && td.layers && td.layers.bias && td.layers.bias.tf === crtProjection.tf
          && dir * (crtProjection.aggressive.target - entry) > 0) {
        // A CRT range can be an ordinary target ONLY on a legal actual source TF,
        // and competes by proximity, rather than replacing nearer opposing magnets.
        targets.push({ label: 'Entry-aligned CRT range edge', kind: 'crt_range',
          tf: crtProjection.tf, source_tf: crtProjection.tf, price: r4(crtProjection.aggressive.target),
          rr: risk ? r2(dir * (crtProjection.aggressive.target - entry) / risk) : 0, strength: 1 });
      }
      // dealing-range extreme as a structural target
      if (pd && !counter && !boundedCRT && !targetMagnets) {
        const extreme = long ? pd.range_high : pd.range_low;
        const reward = Math.abs(extreme - entry);
        if (reward > 0) {
          const rr = risk ? reward / risk : 0;
          if (rr >= 1 && !targets.some((t) => Math.abs(t.price - extreme) < atr * 0.3)) {
            targets.push({ label: long ? 'Dealing range high' : 'Dealing range low', kind: 'range', price: r4(extreme), rr: r2(rr), strength: 0.9 });
          }
        }
      }
      targets.sort(targetMagnets ? Targets.byProximity(dir) : (a, b) => a.rr - b.rr);
      // M21 keeps the weak label/candidate. M54 refines its old unconditional
      // priority: an actual nearer opposing magnet is a wall, not permission
      // to skip ahead to weak structure. Legacy precedence is research-only.
      const wkIdx = targets.findIndex((t) => t.kind === 'weak_structure');
      if (!targetMagnets && wkIdx > 0) targets.unshift(targets.splice(wkIdx, 1)[0]);
      const first = targets[0] || null;
      // Display rounding must not turn a 1.999R nearest magnet into a permitted
      // 2R trade. Check BOTH working and published entry/stop/target geometry;
      // 1e-9R only absorbs floating-point subtraction, not centesimal rounding.
      const publishedRisk = Math.abs(r4(entry) - r4(stop));
      const targetRR = (t) => !t ? 0 : !targetAlignment ? t.rr
        : risk > 0 && publishedRisk > 0
          ? Math.min(dir * (t.price - entry) / risk, dir * (r4(t.price) - r4(entry)) / publishedRisk) : 0;
      const meetsFloor = (t) => !!t && targetRR(t) + 1e-9 >= minRR;
      const runner = targets.find((t) => meetsFloor(t)) || targets[targets.length - 1] || null;
      const wallRisk = first && first.rr < 1.3 ? first : null;
      // M71: even an opt-in partial/runner cannot rescue a sub-floor FIRST
      // paid target. M51 defaults to one target; the same primary gate binds both.
      const runwayTarget = first;

      add('runway', `Open runway to the selected opposing magnet (target ≥ 1:${minRR})`,
        meetsFloor(runwayTarget), 14,
        meetsFloor(runwayTarget)
          ? (ladderTargets
            ? `First paid target ${first.label} at ${first.price} meets the ${minRR}R floor (${first.rr}R); farther displayed targets do not qualify the idea.`
            : `One target: ${first.label} at ${first.price} = ${first.rr}R — pick one and manage one position.`)
          : first ? `The nearest selected magnet (${first.label}, ${first.price}) is only ${first.rr}R away — refuse the idea, not substitute a farther target.`
            : noTargetReason);

      // M51 - Ep 15 step 4: "Take profit, JUST PICK ONE TARGET... they mark 10 different
      // targets... THAT'S NOT HOW YOU DO IT... you're going to PANIC and you're going to MANAGE
      // THE TRADE DIFFERENT WAYS AT DIFFERENT PRICE POINTS... you only need ONE TARGET for your
      // daily bias." The three-rung ladder with a 50% partial at T1 is precisely the behaviour
      // he is describing, and the `management.rule` string even said "the runner is free".
      // Collapsed to a SINGLE target by default. `ctx.ladderTargets` restores the ladder as an
      // optional management view, which is where the ledger says it belongs - a trader's own
      // plan, not the model's default.
      // The default is the nearest real magnet, selected BEFORE the RR floor.
      // The ladder remains an explicit research/management opt-in, never a rescue
      // of a default single-target trade that fails the floor.
      const ladder = [];
      if (ladderTargets) {
        if (first) ladder.push({ ...first, role: 'T1' });
        if (runner && (!first || runner.rr > first.rr + 0.3)) ladder.push({ ...runner, role: 'T2' });
        const beyond = targets.filter((t) => runner && t.rr > runner.rr + 0.6).slice(0, 1);
        beyond.forEach((t) => ladder.push({ ...t, role: 'T3' }));
      } else {
        // M54: labels do not outrank price distance; sub-floor means no trade.
        const single = first || runner || null;
        if (single) ladder.push({ ...single, role: 'T1' });
      }
      if (!ladder.length && !counter && !boundedCRT && !targetMagnets) ladder.push({ label: '1.5R measured move', kind: 'measured', price: r4(entry + dir * risk * 1.5), rr: 1.5, role: 'T1' });
      const rrPrimary = ladder.length ? ladder[0].rr : 0;
      const rrFinal = ladder.length ? ladder[ladder.length - 1].rr : 0;
      const rrPrimaryExact = ladder.length ? targetRR(ladder[0]) : 0;
      const rrFinalExact = ladder.length ? targetRR(ladder[ladder.length - 1]) : 0;

      // entry status: are we at the zone, or chasing?
      let entryStatus, entryNote;
      if (long) {
        if (price < zone.bottom - atr * 0.2) { entryStatus = 'invalid'; entryNote = 'Price is already below the zone — the level failed; this is not a retest, it is a breakdown.'; }
        else if (price <= zone.top) { entryStatus = 'at-entry'; entryNote = 'Price is trading inside the zone — the retest is happening now.'; }
        else if (price - zone.top <= atr * 1.5) { entryStatus = 'approaching'; entryNote = 'Price is close, waiting for the retrace into the zone.'; }
        else { entryStatus = 'waiting'; entryNote = `Price is ${r2((price - zone.top) / atr)} ATR above the zone — do not chase; set an alert at ${r4(zone.top)}.`; }
      } else {
        if (price > zone.top + atr * 0.2) { entryStatus = 'invalid'; entryNote = 'Price closed above the supply zone — the level failed.'; }
        else if (price >= zone.bottom) { entryStatus = 'at-entry'; entryNote = 'Price is trading inside the supply zone — the retest is happening now.'; }
        else if (zone.bottom - price <= atr * 1.5) { entryStatus = 'approaching'; entryNote = 'Price is close, waiting for the pullback into the zone.'; }
        else { entryStatus = 'waiting'; entryNote = `Price is ${r2((zone.bottom - price) / atr)} ATR below the zone — do not chase; set an alert at ${r4(zone.bottom)}.`; }
      }
      if (useModel) {
        entryStatus = model.ready ? 'at-entry' : model.state === 'invalidated' ? 'invalid' : 'waiting';
        entryNote = model.ready ? `${model.entry_tf} ${model.entry_model} zone mitigated AFTER the closed shift.` : model.reasons.join(' ');
      }
      // M43 - Ep 13: un-swept liquidity between entry and target is a STAND-DOWN, not a
      // partial. "They see price comes up to this supply zone and they immediately enter for a
      // sell the minute price mitigate the supply zone... WE ARE NOT GOING TO BE ENTERING FOR A
      // SELL RIGHT HERE. We acknowledge that okay, swing highs are formed right there. There is
      // available liquidity being built up right there and I'm not going to enter for sell
      // UNTIL THOSE GET SWEPT."
      // The code already detected this wall (`wallRisk` = the first pool inside 1.3R) but
      // answered it by banking a partial on it. Downgrading to `waiting` routes through the
      // existing veto machinery, so the refusal is explainable in the same terms as the
      // others. `swept === false` is tested explicitly: synthetic targets such as
      // weak_structure carry no flag at all, and absence of evidence is not an un-swept pool.
      if (ctx.standDownOnWall && wallRisk && wallRisk.swept === false
          && (entryStatus === 'at-entry' || entryStatus === 'approaching')) {
        entryStatus = 'waiting';
        entryNote = `Un-swept liquidity at ${r4(wallRisk.price)} (${wallRisk.label}) sits only ${wallRisk.rr}R beyond entry — the method waits for that pool to be swept before entering rather than banking a partial on it. Re-arms once it is taken out.`;
      }
      // Distance still to travel to the zone we would enter at. An FVG-only read has
      // no order-block `reach` — measure to its near edge instead of dereferencing null.
      const zoneReach = bestOB ? bestOB.reach
        : bestFvg ? Math.abs((long ? bestFvg.top : bestFvg.bottom) - price) / (atr || 1)
          : 6;
      add('entry', 'Entry not chased (price at/near the zone)', entryStatus !== 'waiting' || zoneReach <= 2.5, 8, entryNote);
      add('management', 'First paid target meets the configured minimum RR', ladder.length > 0 && rrPrimaryExact + 1e-9 >= minRR, 0,
        !ladder.length ? 'No real target — no executable trade.'
          : counter ? `One target at ${ladder[0].label} (${rrPrimary}R) — the counter-HTF pullback ends there.`
            : ladder.length === 1 ? `One target at ${ladder[0].label} (${rrPrimary}R); manage one position, no partials.`
              : `Take 50% at ${ladder[0].label} (${rrPrimary}R), move the stop to break-even, run the rest to ${ladder[ladder.length - 1].label} (${rrFinal}R).`);
      if (entryStatus === 'invalid') add('entry_valid', 'Zone not already invalidated', false, 0, entryNote);

      levels = {
        target_policy: targetPolicy, target_tf: ladder[0] ? ladder[0].source_tf || ladder[0].tf || null : null,
        entry_tf: entryTf, stop_tf: ctx.stopPolicy === 'legacy' ? entryTf : stopChoice.source_tf,
        stop_policy: stopEvidence, entry_preference: entryPreference,
        ...(counter ? { execution_kind: 'countertrend-pullback', target_tf: counterTargetKnown ? counterTargetTf : null } : {}),
        ...(useModel ? { entry_model: model.entry_model, entry_tf: model.entry_tf,
          stop_tf: model.entry_tf, entry_model_state: model.state, entry_evidence: entryEvidence,
          ...(boundedCRT ? { target_tf: boundedCRT.tf } : {}) } : {}),
        ...(preference ? { zone_preference: { rule: 'extreme_over_flip', fuel: preference.fuel } } : {}),
        dir, side, entry: r4(entry), entry_zone: [r4(zone.bottom), r4(zone.top)], entry_kind: zone.kind,
        stop: stop === null ? null : r4(stop), risk: r4(risk), risk_atr: r2(risk / entryAtr),
        stop_reason: ctx.stopPolicy !== 'legacy'
          ? (stopChoice.state === 'known'
            ? `${stopChoice.reason} Stop ${stopChoice.price}; base ${r4(stopBase)} + ${r4(buffer)} (${Stops.BUFFER_ATR} ${entryTf} ATR) buffer. Rule: ${stopChoice.rule}.`
            : stopChoice.reason)
          : stopSweep && Math.abs(stopBase - stopSweep.extreme) < 1e-9
          ? `Beyond the sweep extreme (${r4(stopBase)}) + ${r2(entryAtr * 0.18)} buffer`
          // M47: a third kind now exists, so the two-way ternary would have called a flip
          // zone an "FVG" - the recurring trap of a string that describes a decision no
          // longer being updated when the decision changes.
          : `Beyond the ${{ order_block: 'order block', flip_zone: 'flip zone', fvg: 'FVG' }[zone.kind] || zone.kind} ${long ? 'low' : 'high'} ${r4(stopBase)} + ${r2(entryAtr * 0.18)} buffer`,
        targets: ladder, target_candidates: targets.map((t) => ({ ...t })), primary_target: ladder[0] ? { ...ladder[0] } : null,
        rr_primary: rrPrimary, rr_primary_exact: rrPrimaryExact, rr_final: rrFinal, rr_final_exact: rrFinalExact,
        rr_floor: { rule: 'primary_target', min_rr: minRR, rr: rrPrimaryExact,
          passed: ladder.length > 0 && rrPrimaryExact + 1e-9 >= minRR,
          precision: targetAlignment ? 'working_and_published' : 'legacy_display_rounding',
          target_price: ladder[0] ? ladder[0].price : null, target_tf: ladder[0] ? ladder[0].source_tf || ladder[0].tf || null : null },
        management: {
          // M51: with a single target there is no partial to take and nothing to move to
          // break-even at - the old code emitted `partial_at` at 50% and a `runner_target` at
          // 100% for the SAME price, i.e. "take half off here and run the rest to here".
          // A field that describes a decision which no longer exists is the recurring trap.
          partial_at: ladder.length > 1 && ladder[0] ? { price: ladder[0].price, rr: ladder[0].rr, label: ladder[0].label, size: '50%' } : null,
          break_even_after: ladder.length > 1 && ladder[0] ? ladder[0].price : null,
          runner_target: ladder[ladder.length - 1] ? { price: ladder[ladder.length - 1].price, rr: ladder[ladder.length - 1].rr, label: ladder[ladder.length - 1].label, size: ladder.length > 1 ? '50%' : '100%' } : null,
          rule: ladder.length > 1
            ? `Bank 50% at T1 (${ladder[0].rr}R) and move the stop to entry. The runner is free — let the pool at ${ladder[ladder.length - 1].price} do the work.`
            : counter ? 'Bounded counter-HTF pullback: close the whole position at the HTF opposing zone; no farther runner.'
              : 'Single target: set and forget the defined stop and selected target; no partials or break-even move.',
        },
        wall: wallRisk ? { label: wallRisk.label, price: wallRisk.price, rr: wallRisk.rr } : null,
        entry_status: entryStatus, entry_note: entryNote,
        risk_warning: risk < entryAtr * 0.35 ? 'Stop is tighter than 0.35 ATR — normal noise can take you out. Consider using the sweep extreme instead.' : null,
        invalidation: ctx.stopPolicy !== 'legacy'
          ? stopChoice.state !== 'known' ? 'No valid selected invalidation boundary — no executable trade.'
            : `A ${stopChoice.source_tf || entryTf || 'entry-timeframe'} close ${long ? 'below' : 'above'} ${r4(stopBase)} (${stopChoice.kind}) invalidates the idea. The hard stop is buffered at ${stopChoice.price}.`
          : long
            ? `A ${entryTf || 'entry-timeframe'} close below ${r4(Math.min(zone.bottom, stopSweep ? stopSweep.extreme : zone.bottom))} invalidates the idea.`
            : `A ${entryTf || 'entry-timeframe'} close above ${r4(Math.max(zone.top, stopSweep ? stopSweep.extreme : zone.top))} invalidates the idea.`,
      };
    } else {
      add('runway', 'Open runway to opposing liquidity', false, 14, 'No zone, so no defined risk — the model needs a level to trade against.');
    }

    /* ------------------------------------------------------------------- score */
    const totalW = checks.reduce((s, c) => s + c.weight, 0) || 1;
    const got = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
    let score = (got / totalW) * 100;
    // M8: the killzone used to scale the score — `score *= (0.82 + 0.18 * sessions.quality)`.
    // That made the GRADE a function of the wall clock, because `quality` runs 0.30 -> 1.00
    // across the day. Measured on identical candles: average score 30.57 at 22:30Z vs 33.13 at
    // 12:30Z, and at 22:30Z the whole distribution shifts down a letter — the 40 trades that
    // grade A+ at 08:30Z grade A, and the 162 that grade A grade B. A+/A/B/C stopped describing
    // the setup and started describing the hour. Timing is one of the course's five all-or-
    // nothing triggers, not a quality dial, so it is enforced as a veto below instead. Session
    // quality is still reported as `killzone_quality` for the trader to read.
    // a missing trigger or zone is disqualifying regardless of the rest
    const hasTrigger = checks.find((c) => c.key === 'sweep').pass;
    const hasZone = checks.find((c) => c.key === 'zone').pass;
    if (!hasTrigger) score = Math.min(score, 38);
    if (!hasZone) score = Math.min(score, 34);
    const floorRR = levels ? (targetAlignment ? levels.rr_primary_exact : levels.rr_primary) : null;
    if (levels && floorRR > 0 && floorRR + 1e-9 < minRR) score = Math.min(score, 45);
    if (levels && levels.entry_status === 'invalid') score = Math.min(score, 20);
    if (blackout) score = Math.min(score, 40);
    if (levels && levels.entry_status === 'waiting') score = Math.min(score, 66); // great idea, not yet valid
    score = round1(clamp(score, 0, 100));

    /* M10 — applied AFTER every other cap and BEFORE the grade is read, so the grade the
     * trader sees already reflects the stand-down. Only scores below the A floor are
     * touched: `Math.min` cannot express "demote B and C but leave A and A+ alone", which
     * is why this is an explicit band test rather than another cap. A setup that would have
     * graded A+ or A is untouched, per the course's exception; a B or C becomes 'no-trade'
     * and stays visible with the reason, rather than disappearing. */
    const stoodDown = standDown.applies && score < GRADE_A_MIN;
    const scoreBeforeStandDown = score;
    if (stoodDown) score = NO_TRADE_MAX;

    const g = gradeFor(score);

    /* ------------------------------------------------- the all-or-nothing rules
       Ep 25: "If even just one of these boxes are not being checked, I would still not
       trade." A weighted score is structurally unable to express that (M96): failing the
       risk-reward check costs 14 of 155 points, so the weighted score stays at 91 — inside
       the A+ band — and only the score cap caught it. Tradeability is therefore decided
       here, from booleans, and `score` is left to do the job a weighted number is good at:
       ranking candidates against each other.

       M95 — user decision: B and C stay tradeable, so the GRADE is deliberately not a veto
       here. What is vetoed are the conditions the course states as non-negotiable no matter
       how good the rest of the setup looks. The two are different axes and this keeps both.
    */
    const vetoes = [];
    if (useModel && !model.ready) vetoes.push(model.reasons.join(' ') || 'No confirmed causal lower entry model/pullback.');
    if (!hasTrigger) vetoes.push('No liquidity sweep — the model has no trigger to enter on.');
    /* M69 — the sweep's twin. Ep 17's "two things" are liquidity sweep AND market shift, and
     * the sweep was already a veto while the shift was a 12-point weight, so losing the
     * non-negotiable cost 12 of 155 points and the setup still cleared the bar. A veto is
     * stronger than the "hard condition for an A/A+ grade" this item was first written up as,
     * and deliberately so: the course calls it *"the non-negotiable for each one of these entry
     * models"*, this file's own rule is that non-negotiables are booleans in `vetoes` while the
     * score only ranks candidates, and a grade cap would have left the two things asymmetric.
     * M8's rule still governs — when the structure is unknown this does NOT veto. */
    if (structureKnown && !marketShift) {
      vetoes.push(lastBreak
        ? `No market shift in the trade's direction — the last structural break was ${lastBreak.dir}, not ${shiftDir}. `
          + (long ? 'Do not buy while the internal structure is still breaking down.'
                  : '"You don\'t want to enter for a sell when the internal structure is still bullish."')
        : `No market shift — no structural break ${shiftDir} in this window, so the shift ${long ? 'long' : 'short'} requires has not happened.`);
    }
    if (preference && preference.blocked) vetoes.push(`Extreme-over-flip: wait for ${preference.fuel.type} beyond the failed reaction (${preference.fuel.price}) to be swept before entering.`);
    if (!hasZone) vetoes.push('No order block to trade against — no level, so no defined risk.');
    // M7 / M96 — "no matter how many confluences I have, no matter how confident I am,
    // I'm going to be passing on the trade." This is arithmetic, not taste: at the measured
    // ~21% win rate, break-even needs (1 - 0.21) / 0.21 = 3.8R, so a sub-2R idea cannot win.
    if (levels && ((floorRR > 0 && floorRR + 1e-9 < minRR) || ((counter || boundedCRT || targetMagnets || targetAlignment) && !(floorRR + 1e-9 >= minRR)))) {
      vetoes.push(levels.targets.length
        ? `First-target risk:reward ${Math.round(floorRR * 10000) / 10000}R (${targetAlignment ? 'unrounded geometry' : 'legacy display rounding'}) is below the ${minRR}R floor — passing on the trade; a farther runner cannot rescue it.`
        : noTargetReason);
    }
    if (levels && levels.stop_policy && levels.stop_policy.state !== 'known') {
      const stopCheck = checks.find(c => c.key === 'stop_valid');
      vetoes.push('No defined valid stop — ' + (stopCheck ? stopCheck.detail : 'selected invalidation is unavailable.'));
    }
    if (levels && levels.entry_status === 'invalid') vetoes.push('The level is invalidated — remove it and re-map.');
    // M110 — the veto names the release, the side it is on and the two configured windows
    // (the blackout string is built from the account's settings), instead of a generic
    // phrase that leaves the trader guessing which clock stopped the trade.
    if (blackout) vetoes.push(blackout);
    // M8 — tested against the boolean, not truthiness: when analysis is the short-series
    // sentinel, `sessions` is {} and in_killzone is undefined, which must NOT veto.
    /* M26 — the specific-window veto. It SUPERSEDES the generic one when it applies,
     * because "outside the killzone" is true but less true than "outside YOUR window":
     * the trader chose this window, so the refusal has to name it. */
    if (prefBlocked) {
      vetoes.push(`Outside your window — this bot is restricted to ${winPref.label}; `
        + `${prefOpenBullet ? `the window open now is ${prefOpenBullet.name}` : 'no killzone is open now'}.`
        + ` "Just stick to one."${sess.best_time ? ` ${sess.best_time}` : ''}`);
    } else if (sess.in_killzone === false) {
      vetoes.push(`Outside the killzone — "if the setup appears before or after that window, I personally will not enter."${sess.best_time ? ` ${sess.best_time}` : ''}`);
    }
    /* M3 — the anti-chase veto. It is placed AHEAD of M35's zone veto on purpose: when both
     * are true, "the impulse is still running" is the sharper statement about timing, and
     * M35's watch instruction is still appended by the action string, so nothing is lost. */
    if (chaseGuard && phaseInfo.phase === 'expansion') {
      const ago = phaseInfo.bars_since_break;
      vetoes.push(`Chasing an expansion — a break of structure printed ${ago} bar${ago === 1 ? '' : 's'} ago `
        + `and the impulse is still running, so the retrace is what to expect next. `
        + `"Your goal is not to get in after the imbalance, but rather before the imbalance."`);
    }
    // M35 — a cap at 66 left this tradeable as a B. The course stands it down instead:
    // "when price is hovering around here in the middle of nowhere, we do not go down to the
    // lower time frame." It stays visible with its action string so it can be alerted on.
    if (levels && levels.entry_status === 'waiting') {
      vetoes.push('Price has not reached the point of interest yet — waiting for the retrace is not an entry.');
    }
    if (counter && counter.blocked) vetoes.push(counter.reasons.join(' '));
    if (counter && ctx.bias != null && Math.sign(Number(ctx.bias)) !== counter.htf_bias) {
      vetoes.push('The held daily bias disagrees with this HTF narrative — wait for its defining invalidation, not an MTF override.');
    }
    const tradeable = vetoes.length === 0 && g.grade !== 'no-trade';

    // M25's phaseInfo now lives above the loop (M3 gates on it before the vetoes are
    // assembled); only the per-candidate strong/weak read stays here.
    const swInfo = strongWeak(analysis);        // M21

    /* --------------------------------------------------------------- risk plan */
    let risk = null;
    if (levels && levels.stop !== null) {
      const balance = Number(ctx.balance || 0);
      // M9: the fallback was 1 — double the guardrail default. `maxRiskPct` was listed in the
      // ctx docstring above and NEVER READ — the finding's own evidence was that
      // `grep -n maxRiskPct src/bots/setup.js` returned one hit, that docstring — so the
      // derived ceiling never reached sizing. It is honoured here when a caller supplies one,
      // which bots/index.js now does from the account's persisted unlock.
      // Deliberately INERT when absent: the harness and every existing measurement keep the
      // exact risk they passed in, so the 60-seed baseline still reproduces and this change
      // stays attributable (§10: measure every change separately).
      const riskPct = Number(ctx.maxRiskPct) > 0
        ? I.clampRiskPct(ctx.riskPct, { fallback: 0.5, max: Number(ctx.maxRiskPct), unlocked: true })
        : Number(ctx.riskPct || 0.5);
      const vpp = Number(ctx.valuePerPoint || 1);
      if (balance > 0 && vpp > 0) {
        // M58: the grade has to drive capital deployment, or the words in GRADES above are
        // decoration. B is labelled "Tradeable — reduced size or wait for the retest" and C is
        // "Marginal — paper/demo or half risk at most", but nothing enforced either. This is
        // also the compensating control for the M95 decision to keep B and C tradeable: with
        // refusal off the table, position size is the only remaining protection against a
        // low-probability setup. C is capped at half of B so "half risk at most" holds.
        const gradeMult = GRADE_RISK_MULT[g.grade] !== undefined ? GRADE_RISK_MULT[g.grade] : 1;
        // M52: the grade is not the only thing that should move capital. Ep 15 mistake #3 ties
        // position size to WHERE in the dealing range the entry is, independently of quality —
        // an A+ taken mid-range is still a mid-range entry. The two multipliers compose; neither
        // can raise risk above the configured figure, so M9's ceiling still binds.
        const rangeInfo = rangeRiskMult(pd, long);
        const rangeMult = rangeInfo.mult;
        const sizeMult = gradeMult * rangeMult;
        const ordinaryRiskPct = r2(riskPct * sizeMult);
        const methodMult = methodRiskMult(td, dir);
        // Half AFTER the ordinary grade/range policy has rounded; rounding 0.005%
        // back to 0.01% would silently cancel a small account's risk reduction.
        const effectiveRiskPct = methodMult < 1 ? r4(ordinaryRiskPct * methodMult) : ordinaryRiskPct;
        const sizing = I.positionSize({
          balance, riskPct: effectiveRiskPct, entry: levels.entry, stop: levels.stop,
          value_per_point: vpp, asset_class: ctx.assetClass || 'stocks',
        });
        const perR = sizing.riskAmount || 0;
        risk = {
          balance: r2(balance), risk_pct: effectiveRiskPct, risk_amount: r2(balance * effectiveRiskPct / 100),
          size: sizing.size, unit: sizing.unit, actual_risk: perR, per_unit: sizing.perUnit,
          note: sizing.note || null,
          grade_risk_multiplier: gradeMult,
          ...(methodMult < 1 ? { method_risk_multiplier: methodMult,
            risk_pct_ordinary: ordinaryRiskPct, method_risk_note: 'Counter-HTF execution: at most half ordinary same-grade risk.' } : {}),
          // M52: reported so a reduction is auditable and attributable to its cause. `depth` is
          // the signed distance beyond the midpoint toward the favourable extreme, which is what
          // the multiplier is a function of — without it a reviewer cannot tell a mid-range cut
          // from a wrong-half cut.
          range_risk_multiplier: rangeMult,
          range_position_pct: pd ? pd.position_pct : null,
          range_zone: pd ? pd.zone : null,
          range_depth: rangeInfo.depth,
          risk_pct_configured: riskPct,
          risk_adjustment_note: (() => {
            const why = [];
            if (gradeMult !== 1) why.push(`grade ${g.grade} ×${gradeMult} — the setup is ${g.label.toLowerCase()}`);
            if (rangeMult !== 1) why.push(`range position ×${rangeMult} — price is at ${pd.position_pct}% of the dealing range, ${rangeInfo.reason}`);
            if (methodMult < 1) why.push('counter-HTF execution ×0.5 — the daily narrative has not reversed');
            // Null only when NOTHING reduced risk, so the field stays a faithful "was this
            // adjusted?" flag rather than a grade-only one.
            return why.length ? `Risk scaled ${riskPct}% → ${effectiveRiskPct}%: ${why.join('; ')}.` : null;
          })(),
          at_targets: (levels.targets || []).map((t) => ({ role: t.role, price: t.price, rr: t.rr, pnl: r2(perR * t.rr) })),
          managed: levels.management && levels.management.runner_target
            ? r2(perR * ((levels.rr_primary * 0.5) + (levels.rr_final * 0.5)))
            : r2(perR * (levels.rr_primary || 0)),
        };
      }
    }

    candidates.push({
      // M10 — per-candidate: was THIS setup stood down, and what did it cost it.
      stand_down: {
        applies: !!standDown.applies,
        demoted: !!stoodDown,
        score_before: scoreBeforeStandDown,
        score_after: score,
        grade_before: gradeFor(scoreBeforeStandDown).grade,
        grade_after: g.grade,
        reason: stoodDown ? standDown.reason : null,
      },
      dir, side, score, grade: g.grade, grade_label: g.label,
      entry_preference: entryPreference,
      ...(td && td.entry_setup ? { entry_model: useModel ? model.entry_model : 'none',
        entry_tf: levels ? levels.entry_tf : model ? model.entry_tf : null,
        entry_model_state: model ? model.state : 'not_permitted_direction',
        entry_evidence: useModel ? (levels ? levels.entry_evidence : Entry.evidence(model)) : null } : {}),
      // M25: the market phase, so the trader (and any review) can tell an impulse they are
      // late for from a pullback they are early for. Reported, not enforced — turning it
      // into a gate is M3's timing rule and needs its own measurement.
      phase: phaseInfo,
      strong_weak: swInfo,
      // M7/M8/M35/M96: tradeability now comes from the all-or-nothing rules above, not from
      // the grade. `no_trade` says which one fired, so the refusal is explainable.
      ok: tradeable,
      no_trade: vetoes,
      checks,
      passed: checks.filter((c) => c.pass).length,
      total_checks: checks.length,
      levels, risk,
      /** what to do right now, in one line */
      action: (() => {
        // The refusal leads. A vetoed setup must never read as "get ready" or "set an alert" --
        // that advertises a trade the model has just declined. A `waiting` setup is refused for
        // now but becomes valid at the zone, so it keeps its watch instruction; everything else
        // gets the reason and nothing else.
        if (!tradeable) {
          const reason = vetoes.length ? vetoes[0]
            : `the setup grades ${g.grade}, below the tradeable line.`;
          const watch = levels && levels.entry_status === 'waiting'
            ? ` Watch for the retrace to ${levels.entry_zone[0]}–${levels.entry_zone[1]}.` : '';
          return `No trade — ${reason}${watch}`;
        }
        if (!levels) return 'Stand down — no zone to trade against.';
        if (levels.entry_status === 'at-entry') {
          return `Arm the entry: limit at ${levels.entry}, stop ${levels.stop}, first target ${levels.targets[0] ? levels.targets[0].price : '—'}.`;
        }
        if (levels.entry_status === 'approaching') {
          return `Get ready: price is approaching the ${levels.entry_kind === 'order_block' ? 'order block' : 'FVG'}. Set an alert at ${long ? levels.entry_zone[1] : levels.entry_zone[0]}.`;
        }
        if (levels.entry_status === 'waiting') {
          return `Wait for the retrace to ${levels.entry_zone[0]}–${levels.entry_zone[1]}. Chasing here breaks the model's edge.`;
        }
        return 'Invalidated — remove the level and re-map.';
      })(),
      why: checks.filter((c) => c.pass).map((c) => c.detail).filter(Boolean),
      why_not: checks.filter((c) => !c.pass).map((c) => c.detail || c.label),
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  /* --------------------------------------------------------------- top verdict */
  // M127 — grades rank ideas; only `ok` permits an action. The original verdict used
  // grade alone and could print BUY above a candidate whose own action said "No trade".
  const rawBest = candidates[0] || null;
  const setupBest = candidates.find((c) => c.ok) || null;
  let best = setupBest || rawBest;                  // keep a refused idea visible, not actionable
  const buy = candidates.find((c) => c.dir === 1);
  const sell = candidates.find((c) => c.dir === -1);

  // ── the method gate ─────────────────────────────────────────────────────────
  // The playlist's top-down method decides whether a direction may be traded at
  // all. When it has not fired, no setup grade can override it: the answer is
  // wait, and we say exactly which step is outstanding.
  const method = td ? {
    status: td.status, direction: td.direction, blocked: !!td.blocked,
    conviction: td.conviction || null,
    score: td.score, grade: td.grade, headline: td.headline,
    pending_step: (td.steps || []).find((s) => !s.done) || null,
    checks: td.checks || [],
  } : null;
  if (td && td.direction !== 0) {
    const aligned = candidates.find((c) => c.dir === td.direction);
    if (aligned) best = aligned;                    // the higher timeframe chooses the side
  }
  const setupAction = setupBest ? (setupBest.dir > 0 ? 'BUY' : 'SELL') : null;
  const methodBlocked = !!(td && (td.blocked || (td.direction !== 0 && (!best || best.dir !== td.direction))));

  let verdict;
  if (methodBlocked) {
    const why = td.blocked
      ? `${(td.conflicts || []).filter((c) => c.blocks_trade).map((c) => c.resolution).join(' ') || 'the higher-timeframe steps are not complete'}`
      : `the setup model likes the ${rawBest.side}, but the ${td.layers && td.layers.bias ? td.layers.bias.tf : 'higher timeframe'} says ${td.direction > 0 ? 'long' : 'short'}. Taking the other side is trading the small chart against the boss.`;
    verdict = {
      action: 'NO TRADE', dir: 0,
      grade: best ? best.grade : (rawBest ? rawBest.grade : 'no-trade'),
      score: best ? best.score : 0,
      headline: `Method says wait — ${td.headline}`,
      detail: `${why}${pendingStep(td)}`,
      next_trigger: [td.playbook && td.playbook.length ? td.playbook[0] : null, nextTriggerHint(analysis)].filter(Boolean),
      source: 'topdown-gate', method, setup_action: setupAction,
      setup_dir: setupBest ? setupBest.dir : 0,
    };
  } else if (!best || !best.ok) {
    verdict = {
      action: 'NO TRADE', dir: 0, grade: best ? best.grade : 'no-trade', score: best ? best.score : 0,
      headline: 'No tradeable setup right now — the model says wait.',
      detail: best ? best.action : 'Not enough data.',
      next_trigger: nextTriggerHint(analysis),
      source: 'setup-model', method, setup_action: setupAction,
    };
  } else {
    const t1 = best.levels && best.levels.targets && best.levels.targets[0] ? best.levels.targets[0] : null;
    const headline = best.levels
      ? best.levels.targets.length === 1
        ? `${best.grade} ${best.side} setup — one target ${best.levels.rr_primary}R at ${t1.label}; manage one position`
        : `${best.grade} ${best.side} setup — partial ${best.levels.rr_primary}R at ${t1 ? t1.label : 'the first pool'}, runner to ${best.levels.rr_final}R`
      : `${best.grade} ${best.side} setup`;
    const methodOk = !td ? null : (td.direction !== 0 && td.direction === best.dir);
    verdict = {
      action: best.dir > 0 ? 'BUY' : 'SELL', dir: best.dir, grade: best.grade, score: best.score,
      headline: methodOk ? `${headline} — on the ${td.layers && td.layers.bias ? td.layers.bias.tf : 'higher timeframe'} side of the method` : headline,
      detail: best.action + (methodOk && td.conviction && td.conviction.tier === 'B' ? ` Sizing: ${td.conviction.size_hint}.` : ''),
      next_trigger: nextTriggerHint(analysis),
      source: methodOk ? 'method-aligned' : 'setup-model', method, setup_action: setupAction,
      method_aligned: methodOk,
    };
  }

  return {
    candidates, verdict, method,
    buy_score: buy ? buy.score : 0, sell_score: sell ? sell.score : 0,
    grade_scale: GRADES.map((g) => ({ grade: g.grade, label: g.label, min: g.min === -Infinity ? 0 : g.min })),
    filters: {
      killzone: sessions.killzone || 'outside killzone',
      /* M10 — the stand-down POLICY and its inputs, which are facts about this bar and
       * this configuration, so they belong at the top level. Whether a given setup was
       * actually demoted is a fact about that setup and lives on the candidate instead;
       * putting per-candidate values here was a scope error that crashed four suites. */
      stand_down: {
        applies: !!standDown.applies,
        day_name: standDown.day_name || null,
        month: standDown.month || null,
        configured_days: standDown.days || [],
        configured_months: standDown.months || [],
        calendar_known: standDown.calendar_known !== false,
        exempts_grades: ['A+', 'A'],
        demotes_grades: ['B', 'C'],
        demoted_count: candidates.filter((c) => c.stand_down && c.stand_down.demoted).length,
        reason: standDown.applies ? standDown.reason : null,
        note_friday: standDown.applies ? standDown.note_friday : null,
      },
      killzone_quality: strike,
      /* M26 — the restriction this analysis ran under, so the UI and the journal can say
       * why a signal was refused without re-deriving it from the clock. */
      session_pref: (winPref && winPref.restricted) ? {
        key: winPref.key, label: winPref.label, restricted: true,
        open_now: prefOpenBullet ? prefOpenBullet.name : null,
        blocked_now: prefBlocked,
        pair_counts: prefCounts,
        conflict: prefCounts === false
          ? `${String(ctx.symbol || '').toUpperCase()} is not one of ${winPref.label}'s pairs — this restriction can never fire.`
          : null,
        phase: prefPhase ? prefPhase.phase : null,
        phase_note: (prefPhase && prefPhase.phase === 'balance')
          ? 'Inside your window, but the market is in balance — consolidation. The window decides when; whether there is anything to trade in it is the phase.'
          : null,
        note: '"Find one specific window and just focus on that window ... but just stick to one."',
      } : (winPref && winPref.error ? {
        key: null, label: null, restricted: false, error: winPref.error,
        note: `Unknown window "${winPref.error}" — the restriction was NOT applied. Expected one of: `
          + Object.keys(SMC.WINDOW_BY_KEY).join(', ') + ', or "any".',
      } : null),
      /* M3 — the timing state this analysis was graded in. The row's optional half asks for
       * "BOS just printed, expect retrace" as a DISTINCT STATE; that is phase 'expansion' with
       * its bars_since_break, so it is exposed rather than left inside a veto string. */
      chase_guard: {
        on: chaseGuard, phase: phaseInfo.phase, bars_since_break: phaseInfo.bars_since_break,
        blocking: chaseGuard && phaseInfo.phase === 'expansion',
        note: phaseInfo.note,
      },
      news_blackout: blackout || null,
      // M111 — the state beside the sentence. `unknown` next to a null blackout is the honest
      // pair: nothing is known to be inside the window, and the window was never checked.
      news_state: newsState,
      min_rr: minRR,
    },
  };
}

function nextTriggerHint(analysis) {
  if (!analysis) return null;
  const hints = [];
  const sweeps = analysis.sweeps || [];
  const recent = sweeps[0];
  if (!recent) hints.push('No liquidity sweep yet — wait for stops to be taken (equal highs/lows, PDH/PDL, session extremes).');
  const disp = (analysis.displacement || [])[0];
  if (!disp) hints.push('No displacement leg yet — wait for an expansion bar that breaks structure.');
  const obs = (analysis.order_blocks || []).filter((z) => !z.breached && z.fresh);
  if (!obs.length) hints.push('No fresh, unmitigated order block — the zones on the chart have already been used.');
  const s = analysis.sessions || {};
  if (!s.in_killzone) hints.push(s.best_time || 'Wait for a killzone (London 07:00 or NY 12:00 UTC).');
  return hints.length ? hints : null;
}

function round1(v) { return Math.round(v * 10) / 10; }


/** " Outstanding step: <title>." — or nothing when every step is done. */
function pendingStep(td) {
  const open = ((td && td.steps) || []).find((s) => !s.done);
  return open && open.title ? ` Outstanding step: ${open.title}.` : '';
}

// M52: `rangeRiskMult` / `RANGE_RISK` exported for the same reason `GRADE_RISK_MULT` is — so the
// multiplier curve can be unit-tested on its own instead of only being observable through a full
// engine run that has to happen to produce a mid-range candidate.
module.exports = { buildSetups, gradeFor, GRADES, GRADE_RISK_MULT, targetPools, strongWeak, marketPhase, rangeRiskMult, RANGE_RISK,
  standDownFor, M10_DEFAULT, GRADE_A_MIN, NO_TRADE_MAX, SWEEP_LOOKBACK, methodRiskMult, selectZone };
