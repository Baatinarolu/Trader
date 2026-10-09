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

function targetPools(analysis, dir, entry) {
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
function buildSetups(analysis, ctx = {}) {
  const price = Number(ctx.price || (analysis && analysis.price));
  const atr = Number(ctx.atr || (analysis && analysis.atr)) || price * 0.001;
  const bias = Number(ctx.bias || 0);            // -1 / 0 / +1 from the MTF + momentum layer
  const minRR = Number(ctx.minRR || 2);
  const sessions = (analysis && analysis.sessions) || {};
  const strike = sessions.quality != null ? sessions.quality : 0.5;
  const blackout = ctx.newsBlackout || null;
  const ind = ctx.indicators || null;
  const momentum = ctx.momentum || null;
  const td = ctx.topdown || null;                   // the method gate

  const candidates = [];
  // M61: `const vetoes = []` lived here and was never read or returned — dead code. Removed.

  for (const dir of [1, -1]) {
    const long = dir > 0;
    const side = long ? 'buy' : 'sell';
    const checks = [];
    const add = (key, label, pass, weight, detail) => checks.push({ key, label, pass: !!pass, weight, detail: detail || null });

    /* ---------------------------------------------------------------- 1. trigger: sweep */
    const sweeps = ((analysis && analysis.sweeps) || []).filter((s) => s.dir === dir);
    const recentSweep = sweeps.find((s) => s.bars_ago <= 25) || null;
    const sweepQuality = recentSweep ? clamp(recentSweep.wick_atr / 1.2, 0.3, 1.2) : 0;
    add('sweep', long ? 'Sell-side liquidity was swept (stops taken)' : 'Buy-side liquidity was swept (stops taken)',
      !!recentSweep, 18, recentSweep ? `${recentSweep.label} · ${recentSweep.wick_atr} ATR wick · ${recentSweep.bars_ago} bars ago` : 'No sweep of the opposing liquidity yet — the model has no trigger.');

    /* ------------------------------------------------------- 2. displacement after sweep */
    const disps = ((analysis && analysis.displacement) || []).filter((d) => d.dir === dir);
    const disp = disps.find((d) => !recentSweep || d.i > recentSweep.i) || disps[0] || null;
    add('displacement', 'Displacement leg in your direction',
      !!disp, 15, disp ? `${disp.rangeAtr} ATR expansion bar, ${(disp.bodyRatio * 100).toFixed(0)}% body` : 'No expansion bar — price is drifting, not displacing.');

    /* ------------------------------------------------------------------- 3. the zone */
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
    const bestOB = scored[0] || null;
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
    const lastBreak = analysis && analysis.structure ? analysis.structure.last_break : null;
    const trendAligned = (long && trend === 'bullish') || (!long && trend === 'bearish');
    const htfTrend = analysis && analysis.htf_structure ? analysis.htf_structure.trend : null;
    const htfAligned = htfTrend ? ((long && htfTrend === 'bullish') || (!long && htfTrend === 'bearish')) : null;
    add('structure', 'Internal structure agrees', trendAligned, 12, `Structure reads ${trend}${lastBreak ? ` after a ${lastBreak.type} ${lastBreak.dir} ${lastBreak.bars_ago} bars ago${lastBreak.mss ? ' (MSS — sweep then shift)' : ''}` : ''}.`);
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
    add('session', 'Inside a high-probability killzone', !!sessions.in_killzone, 8,
      sessions.note || 'Session filter unavailable.');

    /* ---------------------------------------------------------------- 9. news */
    add('news', 'No high-impact news in the window', !blackout, 10,
      // M4: the previous fallback asserted "the next 60 minutes", which was wrong twice —
      // newsCheck() defaults to windowMin = 45 (bots/index.js), and the test is SYMMETRIC
      // (±windowMin, both sides of the entry), not forward-only. State neither the number
      // nor a direction, so the string cannot drift out of sync with the config again.
      blackout ? blackout : 'No high-impact releases inside the news window (checked either side of the entry).');

    /* ------------------------------------------------------------- 10. volatility */
    const atrRank = ind && ind.ind ? ind.ind.atr_rank : null;
    add('volatility', 'Volatility tradeable (not chaos)', atrRank == null || atrRank <= 90, 6,
      atrRank == null ? null : `ATR is at the ${atrRank}th percentile of the last 120 bars.`);

    /* --------------------------------------------------------- 11. liquidity runway */
    let levels = null;
    if (zone) {
      const entry = zone.entry;
      const stopBase = long ? Math.min(zone.bottom, recentSweep ? recentSweep.extreme : zone.bottom) : Math.max(zone.top, recentSweep ? recentSweep.extreme : zone.top);
      const buffer = atr * 0.18;
      const stop = long ? stopBase - buffer : stopBase + buffer;
      const risk = Math.abs(entry - stop);
      const pools = targetPools(analysis, dir, entry);
      const targets = [];
      for (const p of pools) {
        const reward = Math.abs(p.price - entry);
        const rr = risk ? reward / risk : 0;
        if (rr < 0.9) continue;                       // ignore pools the entry already sits on
        targets.push({ label: p.label, kind: p.kind, price: r4(p.price), rr: r2(rr), strength: p.strength, touches: p.touches || null });
      }
      // dealing-range extreme as a structural target
      if (pd) {
        const extreme = long ? pd.range_high : pd.range_low;
        const reward = Math.abs(extreme - entry);
        if (reward > 0) {
          const rr = risk ? reward / risk : 0;
          if (rr >= 1 && !targets.some((t) => Math.abs(t.price - extreme) < atr * 0.3)) {
            targets.push({ label: long ? 'Dealing range high' : 'Dealing range low', kind: 'range', price: r4(extreme), rr: r2(rr), strength: 0.9 });
          }
        }
      }
      targets.sort((a, b) => a.rr - b.rr);
      // M21 BUG, found by strengthening the M21 probe: targetPools() deliberately pushes the
      // weak structural extreme FIRST, because "in a bullish market structure you want to
      // trade from strong structure and TARGET WEAK STRUCTURE". This sort by rr then silently
      // undid that ordering, so the weak extreme only led when it happened to be the nearest
      // pool - measured at 77 of 1174 eligible candidates. The placement had been dead code.
      // It only looked alive because the old three-rung ladder could surface the weak extreme
      // in ANY rung, and the probe accepted that.
      const wkIdx = targets.findIndex((t) => t.kind === 'weak_structure');
      if (wkIdx > 0) targets.unshift(targets.splice(wkIdx, 1)[0]);
      // The FIRST pool is a wall, not a nuisance: price usually reacts there. The model
      // banks a partial on it, protects the trade, and runs the rest to the 2R+ pool.
      const first = targets[0] || null;
      const runner = targets.find((t) => t.rr >= minRR) || targets[targets.length - 1] || null;
      const wallRisk = first && first.rr < 1.3 ? first : null;

      add('runway', `Open runway to opposing liquidity (final target ≥ 1:${minRR})`, !!runner && runner.rr >= minRR, 14,
        runner && runner.rr >= minRR
          // M51: this described a partial that no longer exists by default. Re-read every
          // string that describes a decision whenever the decision changes.
          ? (ctx.ladderTargets
            ? `Partial at ${first.label} (${first.rr}R), runner to ${runner.label} at ${runner.price} = ${runner.rr}R`
            : `One target: ${runner.label} at ${runner.price} = ${runner.rr}R — pick one and manage one position.`)
          : first ? `The furthest real pool (${first.label}, ${first.price}) is only ${first.rr}R away — not enough runway for the risk taken.`
            : 'No liquidity pool beyond entry to target — no reason for price to travel.');

      // M51 - Ep 15 step 4: "Take profit, JUST PICK ONE TARGET... they mark 10 different
      // targets... THAT'S NOT HOW YOU DO IT... you're going to PANIC and you're going to MANAGE
      // THE TRADE DIFFERENT WAYS AT DIFFERENT PRICE POINTS... you only need ONE TARGET for your
      // daily bias." The three-rung ladder with a 50% partial at T1 is precisely the behaviour
      // he is describing, and the `management.rule` string even said "the runner is free".
      // Collapsed to a SINGLE target by default. `ctx.ladderTargets` restores the ladder as an
      // optional management view, which is where the ledger says it belongs - a trader's own
      // plan, not the model's default.
      // The single target is the runner (the first pool at or beyond minRR), falling back to
      // the nearest pool: that keeps the minRR floor meaningful rather than letting the choice
      // of one target quietly drop the risk:reward requirement.
      const ladder = [];
      if (ctx.ladderTargets) {
        if (first) ladder.push({ ...first, role: 'T1' });
        if (runner && (!first || runner.rr > first.rr + 0.3)) ladder.push({ ...runner, role: 'T2' });
        const beyond = targets.filter((t) => runner && t.rr > runner.rr + 0.6).slice(0, 1);
        beyond.forEach((t) => ladder.push({ ...t, role: 'T3' }));
      } else {
        // M21 put the WEAK STRUCTURAL EXTREME first in the target list on purpose - "target
        // weak structure" is the course's primary magnet. Selecting the runner here discarded
        // it, and probe-m21 caught that (0 of 48 candidates reached the ladder). The two rules
        // are not in conflict once resolved correctly: ONE target, and that target is the weak
        // extreme. Fall back to the runner only when the weak extreme cannot carry the minRR
        // floor, so the risk:reward requirement is not quietly dropped.
        // The weak extreme IS the one target. Falling back to the runner when it sits under
        // minRR was the wrong resolution - it silently swapped the course's magnet for a
        // farther pool just to clear the ratio floor. If the weak structure is only 1R away
        // the idea does not meet the 2R requirement and should not be taken at all; the
        // existing runway/minRR veto says so, which keeps both rules intact instead of
        // satisfying one by violating the other.
        const single = first || runner || null;
        if (single) ladder.push({ ...single, role: 'T1' });
      }
      if (!ladder.length) ladder.push({ label: '1.5R measured move', kind: 'measured', price: r4(entry + dir * risk * 1.5), rr: 1.5, role: 'T1' });
      const rrPrimary = ladder[0].rr;
      const rrFinal = ladder[ladder.length - 1].rr;

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
      add('management', 'Risk plan protects the trade at the first pool', rrFinal >= minRR, 0,
        `Take 50% at ${ladder[0].label} (${rrPrimary}R), move the stop to break-even, run the rest to ${ladder[ladder.length - 1].label} (${rrFinal}R).`);
      if (entryStatus === 'invalid') add('entry_valid', 'Zone not already invalidated', false, 0, entryNote);

      levels = {
        dir, side, entry: r4(entry), entry_zone: [r4(zone.bottom), r4(zone.top)], entry_kind: zone.kind,
        stop: r4(stop), risk: r4(risk), risk_atr: r2(risk / atr),
        stop_reason: recentSweep && Math.abs(stopBase - recentSweep.extreme) < 1e-9
          ? `Beyond the sweep extreme (${r4(stopBase)}) + ${r2(atr * 0.18)} buffer`
          // M47: a third kind now exists, so the two-way ternary would have called a flip
          // zone an "FVG" - the recurring trap of a string that describes a decision no
          // longer being updated when the decision changes.
          : `Beyond the ${{ order_block: 'order block', flip_zone: 'flip zone', fvg: 'FVG' }[zone.kind] || zone.kind} ${long ? 'low' : 'high'} ${r4(stopBase)} + ${r2(atr * 0.18)} buffer`,
        targets: ladder, primary_target: ladder[0] ? { ...ladder[0] } : null,
        rr_primary: rrPrimary, rr_final: rrFinal,
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
            : 'Single target: manage as one position, trail behind structure after 1R.',
        },
        wall: wallRisk ? { label: wallRisk.label, price: wallRisk.price, rr: wallRisk.rr } : null,
        entry_status: entryStatus, entry_note: entryNote,
        risk_warning: risk < atr * 0.35 ? 'Stop is tighter than 0.35 ATR — normal noise can take you out. Consider using the sweep extreme instead.' : null,
        invalidation: long
          ? `A 15m close below ${r4(Math.min(zone.bottom, recentSweep ? recentSweep.extreme : zone.bottom))} invalidates the idea.`
          : `A 15m close above ${r4(Math.max(zone.top, recentSweep ? recentSweep.extreme : zone.top))} invalidates the idea.`,
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
    if (levels && levels.rr_final > 0 && levels.rr_final < minRR) score = Math.min(score, 45);
    if (levels && levels.entry_status === 'invalid') score = Math.min(score, 20);
    if (blackout) score = Math.min(score, 40);
    if (levels && levels.entry_status === 'waiting') score = Math.min(score, 66); // great idea, not yet valid
    score = round1(clamp(score, 0, 100));

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
    if (!hasTrigger) vetoes.push('No liquidity sweep — the model has no trigger to enter on.');
    if (!hasZone) vetoes.push('No order block to trade against — no level, so no defined risk.');
    // M7 / M96 — "no matter how many confluences I have, no matter how confident I am,
    // I'm going to be passing on the trade." This is arithmetic, not taste: at the measured
    // ~21% win rate, break-even needs (1 - 0.21) / 0.21 = 3.8R, so a sub-2R idea cannot win.
    if (levels && levels.rr_final > 0 && levels.rr_final < minRR) {
      vetoes.push(`Risk:reward ${levels.rr_final}R is below the ${minRR}R floor — passing on the trade.`);
    }
    if (levels && levels.entry_status === 'invalid') vetoes.push('The level is invalidated — remove it and re-map.');
    if (blackout) vetoes.push('High-impact news inside the window.');
    // M8 — tested against the boolean, not truthiness: when analysis is the short-series
    // sentinel, `sessions` is {} and in_killzone is undefined, which must NOT veto.
    if (sessions.in_killzone === false) {
      vetoes.push(`Outside the killzone — "if the setup appears before or after that window, I personally will not enter."${sessions.best_time ? ` ${sessions.best_time}` : ''}`);
    }
    // M35 — a cap at 66 left this tradeable as a B. The course stands it down instead:
    // "when price is hovering around here in the middle of nowhere, we do not go down to the
    // lower time frame." It stays visible with its action string so it can be alerted on.
    if (levels && levels.entry_status === 'waiting') {
      vetoes.push('Price has not reached the point of interest yet — waiting for the retrace is not an entry.');
    }
    const tradeable = vetoes.length === 0 && g.grade !== 'no-trade';

    const phaseInfo = marketPhase(analysis);   // M25
    const swInfo = strongWeak(analysis);        // M21

    /* --------------------------------------------------------------- risk plan */
    let risk = null;
    if (levels) {
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
        const effectiveRiskPct = r2(riskPct * sizeMult);
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
      dir, side, score, grade: g.grade, grade_label: g.label,
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
  let best = candidates[0] || null;
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
  const rawBest = candidates[0] || null;
  const setupAction = !rawBest || rawBest.grade === 'no-trade' ? null : (rawBest.dir > 0 ? 'BUY' : 'SELL');
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
      setup_dir: rawBest ? rawBest.dir : 0,
    };
  } else if (!best || best.grade === 'no-trade') {
    verdict = {
      action: 'NO TRADE', dir: 0, grade: best ? best.grade : 'no-trade', score: best ? best.score : 0,
      headline: 'No A-grade setup right now — the model says wait.',
      detail: best ? best.why_not.slice(0, 4).join(' ') : 'Not enough data.',
      next_trigger: nextTriggerHint(analysis),
      source: 'setup-model', method, setup_action: setupAction,
    };
  } else {
    const t1 = best.levels && best.levels.targets && best.levels.targets[0] ? best.levels.targets[0] : null;
    const headline = best.levels
      ? `${best.grade} ${best.side} setup — partial ${best.levels.rr_primary}R at ${t1 ? t1.label : 'the first pool'}, runner to ${best.levels.rr_final}R`
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
      killzone_quality: strike,
      news_blackout: blackout || null,
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
module.exports = { buildSetups, gradeFor, GRADES, GRADE_RISK_MULT, targetPools, strongWeak, marketPhase, rangeRiskMult, RANGE_RISK };
