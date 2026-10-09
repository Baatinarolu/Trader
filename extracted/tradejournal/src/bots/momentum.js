'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MOMENTUM / "MARKET MECHANICS" LAYER  (playlist episodes 2, 5, 11, 13, 15, 27)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Direction is not a vote and not an average. The playlist's top-down method
 *  (see topdown.js, which implements it step by step) is a hierarchy:
 *
 *    higher timeframe  → decides the direction, and holds the CRT range
 *    trading timeframe → holds the location (premium/discount, zone, gap)
 *    lower timeframe   → holds the trigger (confirmation only)
 *
 *  So this file does three things:
 *
 *    1. alignment()  — reports the three layers with their jobs, and derives the
 *                      bias from the higher timeframe. A lower timeframe that
 *                      disagrees is TIMING information, never a veto: a sweep
 *                      of a low inside a higher-timeframe demand zone looks
 *                      bearish on the small chart precisely because that is how
 *                      the liquidity gets taken.
 *    2. mechanics()  — the 0-100 "how textbook is this" score, now built on the
 *                      method's own checks (right candle, range, sweep, trigger,
 *                      location) rather than a flat weighted average.
 *    3. narrative()  — the read-aloud, in the order the mentor teaches it.
 *
 *  Conflicts come back twice: `conflicts` as sentences (kept for the API's
 *  existing consumers) and `conflict_detail` as structured objects carrying the
 *  rule that resolves them and whether they block the trade.
 */

const C = require('../candles');
const SMC = require('./smc');
const Ind = require('../indicators');
const TD = require('./topdown');

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r4 = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 10000) / 10000);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Each timeframe is read with a higher and a lower timeframe around it. */
const MTF = {
  '1m': { htf: '15m', ltf: '1m' },
  '3m': { htf: '30m', ltf: '1m' },
  '5m': { htf: '1h', ltf: '1m' },
  '15m': { htf: '4h', ltf: '5m' },
  '30m': { htf: '4h', ltf: '15m' },
  '1h': { htf: '1d', ltf: '15m' },
  '4h': { htf: '1w', ltf: '1h' },
  '1d': { htf: '1w', ltf: '4h' },
  '1w': { htf: '1w', ltf: '1d' },
};
const htfOf = (tf) => (MTF[tf] || MTF['15m']).htf;
const ltfOf = (tf) => (MTF[tf] || MTF['15m']).ltf;

/** Fetch + analyse one series (structure, zones, sweeps, indicators). */
async function series(symbol, tf, limit = 500, opts = {}) {
  let { candles, meta } = await C.getCandles(symbol, tf, { limit: limit + (Number(opts.trim) || 0) });
  // Bar replay: hand the analysis the same candles the market had *at that
  // moment*, so "what did the bot say then" is a real question with an answer.
  // `trim` drops the last N candles; `asOf` drops everything at or after a time.
  const trimmedFrom = candles.length;
  if (opts.trim > 0) candles = candles.slice(0, Math.max(1, candles.length - Number(opts.trim)));
  if (opts.asOf) {
    const cut = Number(opts.asOf);
    const kept = candles.filter((c) => Number(c.t) < cut);
    if (kept.length >= 60) candles = kept;
  }
  if (candles.length !== trimmedFrom) {
    // The meta must describe the candles the analysis actually used, or the chart
    // caption and the "read from" line would quote the live bar during a replay.
    const lastKept = candles[candles.length - 1];
    meta = { ...meta, bars: candles.length, last_bar: lastKept ? new Date(lastKept.t).toISOString() : null,
      last_price: lastKept ? lastKept.c : null, replayed_from: trimmedFrom };
  }
  const ind = Ind.snapshot(candles);
  const smc = SMC.analyse(candles, { tf, htfCandles: opts.htfCandles || null });
  const last = candles[candles.length - 1];
  return { tf, candles, meta, ind, smc, price: last.c, atr: smc.atr || ind.atr || 0, bars: candles.length };
}

/* ══════════════════════════════════════════════════════ 1. the hierarchy ═══ */

/**
 * The three layers, with the job each one does, and the direction taken from the
 * top of the stack.
 *
 * @param {object} htf  bias-timeframe series
 * @param {object} mtf  trading-timeframe series
 * @param {object} ltf  trigger-timeframe series
 * @param {object} td   the top-down method output (topdown.js build())
 */
function alignment(htf, mtf, ltf, td = null) {
  const trend = (s) => (s && s.smc && s.smc.structure ? s.smc.structure.trend : 'ranging');
  const indScore = (s) => (s && s.ind && s.ind.ok ? s.ind.score : 0);

  const htfTrend = trend(htf);
  const mtfTrend = trend(mtf);
  const ltfTrend = trend(ltf);

  const rows = [
    {
      tf: htf.tf, weight: 3, role: 'bias', job: 'decides direction · holds the CRT range',
      bias: indScore(htf), trend: htfTrend,
      decisive: htfTrend !== 'ranging',
      note: htfTrend === 'ranging' ? `${htf.tf} has no structural direction — there is no bias to follow from it.` : `${htf.tf} is the boss: ${htfTrend}.`,
      last_break: htf.smc && htf.smc.structure ? htf.smc.structure.last_break : null,
    },
    {
      tf: mtf.tf, weight: 2, role: 'location', job: 'premium/discount · zone · gap',
      bias: indScore(mtf), trend: mtfTrend,
      decisive: mtfTrend !== 'ranging',
      note: 'Where the entry lives. This layer cannot choose the direction.',
    },
    {
      tf: ltf.tf, weight: 1, role: 'trigger', job: 'confirmation only',
      bias: indScore(ltf), trend: ltfTrend,
      decisive: ltfTrend !== 'ranging',
      note: 'This layer can delay an entry or veto it. It can never choose the direction.',
    },
  ];

  /* --- direction: higher timeframe first, then its CRT, then nothing ------ */
  const crtDir = td && td.direction ? td.direction : 0;
  const structDir = htfTrend === 'bullish' ? 1 : htfTrend === 'bearish' ? -1 : 0;
  const crtState = td && td.layers && td.layers.bias ? td.layers.bias.state : null;
  let source = 'none';
  let bias = 0;
  let provisional = false;

  if (crtDir) {
    bias = crtDir;
    source = `CRT confirmed on ${htf.tf}`;
  } else if (structDir) {
    bias = structDir;
    provisional = true;
    source = `${htf.tf} structure (${htfTrend}) — no CRT trigger yet`;
  } else if (mtfTrend !== 'ranging' && htfTrend === 'ranging') {
    // the higher timeframe has no read at all: the next timeframe down may only
    // be used as a *watch* direction, clearly labelled as unconfirmed by the boss
    bias = 0;
    source = `${htf.tf} ranging, so no bias — a ${mtf.tf} ${mtfTrend} read is not a reason to trade`;
  } else {
    source = 'no directional read on the higher timeframe';
  }

  const score = r2(rows.reduce((s, r) => s + r.bias * r.weight, 0) / rows.reduce((s, r) => s + r.weight, 0));
  const signs = rows.map((r) => (r.trend === 'bullish' ? 1 : r.trend === 'bearish' ? -1 : 0));
  const agree = bias !== 0 && rows.every((r) => r.trend !== 'ranging' && (r.trend === 'bullish' ? 1 : -1) === bias);
  const ltfAgainst = bias !== 0 && ltfTrend !== 'ranging' && (ltfTrend === 'bullish' ? 1 : -1) === -bias;
  const conflict = !!(td && td.conflicts && td.conflicts.some((c) => c.blocks_trade));

  const reason = bias === 0
    ? `Higher timeframe first: ${htf.tf} structure reads ${htfTrend}${crtState ? ` and its CRT range is "${crtState}"` : ''} — with no decisive higher-timeframe read there is no direction to trade.${source.startsWith(`${htf.tf} ranging`) ? ' A lower-timeframe trend is not a substitute for the higher-timeframe bias.' : ''}`
    : `${htf.tf} decides direction (${bias > 0 ? 'long' : 'short'}) from ${source}. `
      + `${agree ? `All three layers line up: ${rows.map((r) => `${r.tf} ${r.trend}`).join(', ')}.` : ''}`
      + `${ltfAgainst ? `The ${ltf.tf} currently runs ${ltfTrend} — that is the liquidity being taken inside the ${bias > 0 ? 'buy' : 'sell'} area, so it times the entry, it does not overrule the ${htf.tf}.` : ''}`
      + `${!agree && !ltfAgainst && mtfTrend !== 'ranging' ? `Location timeframe reads ${mtfTrend}, so entries are taken on the pullback rather than at market.` : ''}`
      + `${provisional ? ' The CRT trigger has not fired yet: this is a bias, not an entry.' : ''}`;

  return {
    rows, score, bias, agree, conflict, reason,
    source, provisional, ltf_against_htf: ltfAgainst,
    hierarchy: 'higher timeframe decides direction · lower timeframes only time it',
    display_note: 'The weighted score below is a display of the three indicator readings only. Direction is taken from the top of the stack, never from this average.',
    trends: { bias: htfTrend, location: mtfTrend, trigger: ltfTrend },
  };
}

/* ═════════════════════════════════════════════════════ 2. mechanics score ══ */

/**
 * Market mechanics score 0-100 + the read aloud.
 * The first factor is the method itself, not an indicator average.
 * @param {object} p { htf, mtf, ltf, align, td }
 */
/**
 * M50 — bias hysteresis.
 *
 * Ep 15 states the rule twice. Mistake #4: *"changing bias after every single candlestick… your
 * bias only change when your invalidation is hit."* Step 5: *"If my bias is invalidated, I reset
 * my bias… I accept the fact that I am wrong and I reread the market."* Both require STATE, and
 * `alignment()` above has none — it re-derives from scratch on every call, so the invalidation
 * level was never the gate that changes the bias. `probe-ep15-bias-flips.js` measured the result:
 * 3612 calls → 413 sign flips, of which only 148 (35.8 %) were preceded by an invalidating close
 * and 265 (64.2 %) were not.
 *
 * **This function is deliberately PURE and deliberately NOT called from `alignment()`.** Folding
 * state into `alignment()` would make it order-dependent, so every probe and backtest that calls
 * it across a walk would carry state between unrelated windows and silently change what all of
 * them measure — the M120 class of mistake, committed on purpose. State belongs to the caller,
 * which is why this takes the prior bias as an argument and returns the new one.
 *
 * The fairness note from the ledger row still holds and is the reason this is worth doing: a bot
 * has no emotions, so this is not the human failure mode he describes. The divergence is narrower
 * and real — his invalidation is a *close beyond a key level*, which is a STRONGER condition than
 * the structure relabel that actually drives `align.bias`, so the code's bias was free to change
 * more easily than his rule permits.
 *
 * @param {number|null} priorBias   the stored bias (1, -1, 0 or null on a first read)
 * @param {number}      freshBias   what alignment() derives from scratch this candle
 * @param {object|null} invalidation `{ level, side }` — the level whose breach voids the PRIOR
 *                                 bias; `side` is 'below' for a long, 'above' for a short
 * @param {number}      close       the latest CLOSED price (never a wick — he says "close")
 * @returns {{bias, held, changed, invalidated, changed_because, disagreement}}
 */
function biasHysteresis({ priorBias = null, freshBias = 0, invalidation = null, close = null } = {}) {
  const prior = Number(priorBias) || 0;
  const fresh = Number(freshBias) || 0;
  const out = { bias: prior, held: false, changed: false, invalidated: false, changed_because: null, disagreement: null };

  // First read, or the stored bias was flat: nothing to protect, so take the fresh derivation.
  if (prior === 0) {
    out.bias = fresh;
    out.changed = fresh !== 0;
    out.changed_because = fresh !== 0 ? 'no prior bias — first read' : null;
    return out;
  }

  // The from-scratch read agrees: hold, and say nothing.
  if (fresh === prior) { out.bias = prior; return out; }

  // It disagrees. His rule: the bias changes ONLY when the invalidation is hit — a CLOSE beyond
  // the level, not a wick and not a structure relabel.
  //
  // `num` treats null and undefined as ABSENT rather than as 0. `Number(null)` is 0 and
  // `Number.isFinite(0)` is true, so the obvious guard would accept a null level as 0 — and a
  // level of 0 with side 'above' makes `close > 0` true on every call, invalidating the bias
  // constantly while looking like hysteresis was working. Found by checking the hazard rather than
  // assuming the guard was right; the unit tests covered NaN but not null.
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const level = invalidation ? num(invalidation.level) : null;
  const side = invalidation && invalidation.side;
  const c = num(close);
  const breached = level !== null && c !== null &&
    (side === 'below' ? c < level : side === 'above' ? c > level : false);

  if (breached) {
    out.bias = fresh !== 0 ? fresh : 0;
    out.changed = true;
    out.invalidated = true;
    out.changed_because = `invalidation hit: a close at ${close} beyond ${level} (${side}) voids the prior ${prior > 0 ? 'long' : 'short'} bias`;
    return out;
  }

  // Not breached: HOLD the prior bias and report the disagreement rather than hiding it. A fresh
  // read of 0 (the higher timeframe went ranging) is an ABSENCE of information, not an
  // invalidation, so it is held too — the `ranging` vetoes elsewhere already stand the trade down,
  // so holding the label does not mean trading through a range.
  out.bias = prior;
  out.held = true;
  out.disagreement = fresh;
  out.changed_because = null;
  return out;
}

function mechanics({ htf, mtf, ltf, align, td = null }) {
  const smc = mtf.smc;
  const ind = mtf.ind;
  const sessions = smc.sessions || {};
  const factors = [];
  const add = (key, label, points, max, detail) => factors.push({ key, label, points: r2(points), max, detail });

  /* 1. top-down method (30) — right candle, range, sweep, trigger, location */
  const methodPts = td ? (td.score / 100) * 30 : (clamp(align.score, -100, 100) / 100 + 1) / 2 * 30;
  add('topdown', 'Top-down method (right candle → range → sweep)', methodPts, 30,
    td ? `${td.status === 'confirmed' ? 'Confirmed' : 'Not confirmed'} · score ${td.score}/100 (${td.grade}) — ${td.headline}` : align.reason);

  /* 2. indicator mechanics (14) — supporting evidence, not the decision */
  const indPts = (clamp(ind.ok ? ind.score : 0, -100, 100) / 100 + 1) / 2 * 14;
  add('indicators', 'Indicator mechanics (supporting)', indPts, 14, ind.ok ? `${ind.label} (${ind.score}). ${ind.regime}.` : 'Indicators unavailable.');

  /* 3. the trigger: liquidity sweep (18) */
  const tdSweep = td && td.layers && td.layers.bias ? td.layers.bias.sweep : null;
  const tdConfirmed = !!(td && td.layers && td.layers.bias && td.layers.bias.state === 'confirmed');
  const sweeps = smc.sweeps || [];
  const sweep = sweeps.find((s) => s.bars_ago <= 25);
  const sweepPts = tdConfirmed ? 18 : sweep ? clamp(8 + sweep.wick_atr * 5, 0, 18) : 0;
  add('sweep', 'Liquidity sweep (the trigger)', sweepPts, 18,
    tdConfirmed ? `Sweep of the ${td.layers.bias.sweep.high ? 'buyside' : 'sellside'} of the ${td.layers.bias.tf} range failed to hold — the trigger the method waits for.`
      : sweep ? `${sweep.label} — ${sweep.wick_atr} ATR wick, ${sweep.bars_ago} bars ago. Stops were taken.`
        : 'No sweep yet: nothing has been stopped out, so there is no fuel for the reversal.');

  /* 4. displacement / reaction (14) */
  const conf = td && td.layers && td.layers.trigger ? td.layers.trigger.confirmation : null;
  const disp = (smc.displacement || [])[0];
  const dispRecent = disp && disp.bars_ago <= 12;
  const dispPts = conf && conf.ok ? 14 : dispRecent ? clamp(6 + disp.rangeAtr * 3, 0, 14) : disp ? 4 : 0;
  add('displacement', 'Displacement reaction', dispPts, 14,
    conf && conf.ok ? conf.note
      : dispRecent ? `${disp.rangeAtr} ATR expansion bar ${disp.bars_ago} bars ago breaking structure — smart money moved.`
        : disp ? `Last displacement was ${disp.bars_ago} bars ago — stale, the leg has been consumed.` : 'No displacement: price is drifting, not being repriced.');

  /* 5. location: fresh zone / discount-premium (14) */
  const zone = (smc.order_blocks || []).find((z) => !z.breached && z.fresh && z.distance_atr <= 4);
  const pd = smc.premium_discount;
  const alignedHalf = pd ? (align.bias > 0 ? pd.position_pct < 55 : align.bias < 0 ? pd.position_pct > 45 : false) : false;
  const locPts = (zone ? 8 : 0) + (alignedHalf ? 6 : 0);
  add('location', 'Location (zone + range)', locPts, 14,
    `${zone ? `Fresh ${zone.side} zone ${zone.bottom}–${zone.top} within ${zone.distance_atr} ATR. ` : 'No fresh zone near price. '}${pd ? `Price sits at ${pd.position_pct}% of the ${pd.range_low}–${pd.range_high} dealing range (${pd.zone}).` : ''}`);

  /* 6. session quality (6) */
  add('session', 'Session / killzone', clamp(sessions.quality ? sessions.quality * 6 : 3, 0, 6), sessions.note || '');

  /* 7. volatility regime (4) */
  const rank = ind.ind ? ind.ind.atr_rank : null;
  const volPts = rank == null ? 2 : rank > 92 ? 0.7 : rank < 12 ? 4 : 2 + (1 - Math.abs(rank - 55) / 55) * 2;
  add('volatility', 'Volatility regime', volPts, 4,
    rank == null ? 'ATR percentile unavailable.' : rank > 92 ? `Chaos: ATR ${rank}th percentile — spreads and slippage balloon.` : rank < 12 ? `Compression: ATR ${rank}th percentile — expansion likely.` : `ATR ${rank}th percentile — normal conditions.`);

  const score = clamp(factors.reduce((s, f) => s + f.points, 0), 0, 100);
  const grade = score >= 80 ? 'A+' : score >= 68 ? 'A' : score >= 55 ? 'B' : score >= 42 ? 'C' : 'D';
  return {
    score: r2(score), grade, factors,
    label: score >= 80 ? 'Textbook conditions' : score >= 68 ? 'Strong conditions' : score >= 55 ? 'Workable conditions' : score >= 42 ? 'Thin conditions' : 'Stand down',
  };
}

/* ═══════════════════════════════════════════════════════ 3. the read-aloud ══ */

/** The narrative: what the market did, in order, and what it means. */
function narrative({ symbol, mtf, htf, ltf, align, mech, td = null }) {
  const smc = mtf.smc || {};
  const ind = mtf.ind || null;
  const lines = [];
  const struct = smc.structure || {};
  const pd = smc.premium_discount;
  const liq = smc.liquidity || {};

  lines.push({ title: 'Bias', dir: align.bias, text: align.reason });
  if (td && td.layers && td.layers.bias && td.layers.bias.right_candle) {
    const rc = td.layers.bias.right_candle;
    lines.push({
      title: 'The right candle', dir: align.bias,
      text: `${td.layers.bias.tf} candle ${new Date(rc.candle.t).toISOString().slice(0, 16)}Z reacted at the ${rc.level.label} (${rc.level.price}) — ${rc.reaction_atr} ATR of reaction, ${rc.index_from_end} candle${rc.index_from_end === 1 ? '' : 's'} back${rc.forming ? ', still forming' : ''}. Range marked: ${td.layers.bias.range ? `${td.layers.bias.range.low} – ${td.layers.bias.range.high}` : '—'}.`,
    });
  }

  lines.push({
    title: 'Structure', dir: struct.trend === 'bullish' ? 1 : struct.trend === 'bearish' ? -1 : 0,
    text: `${mtf.tf} structure reads ${struct.trend}. Sequence: ${(struct.recent_labels || []).map((l) => l.label).join(' → ')}.${struct.last_break ? ` Last event: ${struct.last_break.type} ${struct.last_break.dir} at ${struct.last_break.level}${struct.last_break.mss ? ' — a market structure shift (sweep, then shift)' : ''}.` : ''}`,
  });

  const bigPools = (liq.pools || []).slice(0, 4);
  lines.push({
    title: 'Liquidity', dir: 0,
    text: bigPools.length
      ? `Resting orders: ${bigPools.map((p) => `${p.label} ${p.type === 'BSL' ? 'above' : 'below'} ${p.price}${p.swept ? ' (already swept)' : ''}`).join('; ')}.`
      : 'No significant pools mapped — the level map is thin.',
  });

  if (td && td.layers && td.layers.bias && td.layers.bias.state) {
    const L = td.layers.bias;
    // `sweep` and `plan` can legitimately be absent (a range that was consumed
    // before the sweep was read, a candle that has not closed yet) — never assume.
    const swept = L.sweep || null;
    const stateText = {
      confirmed: swept
        ? `The ${swept.high ? 'buyside' : 'sellside'} of the range was swept and failed to hold — CRT is live${L.plan ? `: ${L.plan.side} back to the ${L.plan.target_note}` : ''}.`
        : 'The range is marked as confirmed, but the sweep that confirmed it is no longer in the window — treat the range as marked, not as a live signal.',
      sweeping: `Price has traded through the ${swept && swept.high ? 'high' : 'low'} of the range but has not closed back inside — a sweep in progress. Wait for the reclaim; entering mid-sweep is how the level takes your stop.`,
      'no-sweep': 'Neither side of the range has been taken yet. This is the waiting part of the method — the sweep is the signal, and there is no trade without it.',
      'both-sides': 'Both sides of the range have been swept. That is chop engineered for a bigger move; stand down until a new right candle forms.',
      'no-right-candle': `No ${L.tf} candle has reacted at a level that matters yet, so there is no range to mark.`,
      unswept: 'The range is marked and waiting.',
    }[L.state] || '';
    if (stateText) lines.push({ title: `CRT on ${L.tf}`, dir: td.direction, text: stateText });
  }

  if ((smc.sweeps || []).length && (!td || !td.layers.bias || !td.layers.bias.sweep)) {
    const s = smc.sweeps[0];
    lines.push({
      title: 'The sweep', dir: s.dir,
      text: `${s.label} ${s.bars_ago} bars ago with a ${s.wick_atr} ATR wick that closed back inside. That is a stop run: the orders under/over the level are now filled, and the market is free to move the other way.`,
    });
  }
  const disp = (smc.displacement || [])[0];
  if (disp) {
    lines.push({
      title: 'The reaction', dir: disp.dir,
      text: `${disp.rangeAtr} ATR displacement bar ${disp.bars_ago} bars ago (${(disp.bodyRatio * 100).toFixed(0)}% body) — this is the footprint that leaves the zones: ${(smc.fvgs || []).filter((g) => !g.filled).slice(0, 2).map((g) => `FVG ${g.bottom}–${g.top}`).join(', ') || 'none unfilled'}.`,
    });
  }
  if (pd) {
    // M52: this line tested `zone === 'discount'` binarily — discount got +1, everything else
    // got -1 with "longs here are paying up". Widening the equilibrium band in smc.js without
    // touching this would have pushed 45–50% of the range into that else branch and told the
    // trader price was premium while it was still BELOW the midpoint. `dir: 0` is the neutral
    // value this same array already uses for Next step / Inducement / Timing.
    const LOCATION_DIR = { discount: 1, premium: -1, equilibrium: 0 };
    const LOCATION_TEXT = {
      discount: 'Buying in discount and selling in premium is the whole game — this is the value side for longs.',
      premium: 'Premium is where short-sellers want to be; longs here are paying up.',
      equilibrium: 'Mid-range: neither side has value here. Ep 15 mistake #3 — either stay out and wait for price to come to an extreme, or take it at reduced size.',
    };
    lines.push({
      title: 'Location', dir: LOCATION_DIR[pd.zone] !== undefined ? LOCATION_DIR[pd.zone] : 0,
      text: `Dealing range ${pd.range_low}–${pd.range_high}; price is at ${pd.position_pct}% (${pd.zone})${pd.ote ? `, inside the 0.62–0.79 OTE band (${pd.ote} bias)` : ''}. ${LOCATION_TEXT[pd.zone] || LOCATION_TEXT.equilibrium}`,
    });
  }
  if (td && td.steps) {
    const pendingStep = td.steps.find((s) => !s.done);
    if (pendingStep) lines.push({ title: `Next step: ${pendingStep.title}`, dir: 0, text: pendingStep.text });
  }
  if ((smc.inducement || []).length) {
    lines.push({ title: 'Inducement', dir: 0, text: smc.inducement[0].note });
  }
  const sessions = smc.sessions || {};
  lines.push({ title: 'Timing', dir: 0, text: `${sessions.note || ''} ${sessions.best_time || ''}` });

  /* ---- conflicts: sentences for the API, structured objects for the UI ---- */
  const detail = (td && td.conflicts ? td.conflicts.slice() : []);
  if (ind && ind.ok && align.bias !== 0 && Math.sign(ind.score) !== Math.sign(align.bias) && Math.abs(ind.score) > 25) {
    detail.push({
      kind: 'indicators-against-bias',
      sides: `${mtf.tf} indicators read ${ind.score} against a ${align.bias > 0 ? 'long' : 'short'} bias`,
      rule: 'Indicators are supporting evidence only. They cannot flip the higher-timeframe direction; they tighten the entry (wait for the pullback) or reduce its size.',
      resolution: `Keep the ${align.bias > 0 ? 'long' : 'short'} bias; insist on the confirmation before entering.`,
      blocks_trade: false,
    });
  }
  if (smc.counts && smc.counts.sweeps > 6) {
    detail.push({
      kind: 'choppy',
      sides: `${smc.counts.sweeps} sweeps inside the window`,
      rule: 'A market chopping between pools gives no clean sweep to trade against.',
      resolution: 'Raise the bar: only take a confirmed CRT on the higher timeframe, or stand down.',
      blocks_trade: false,
    });
  }
  if (mech && mech.score < 45) {
    detail.push({
      kind: 'thin-mechanics',
      sides: `mechanics score ${mech.score}/100 (${mech.label})`,
      rule: 'The method is a checklist, not a vibe: with the checklist unmet there is no setup.',
      resolution: 'Wait for the conditions rather than trading a half-setup.',
      blocks_trade: false,
    });
  }

  const conflicts = detail.map((c) => `${c.sides}. ${c.rule} → ${c.resolution}`);
  return { lines, conflicts, detail };
}

/* ═══════════════════════════════════════════════════ the analysed payload ══ */

/** The live CRT read, in the shape the API/UI already consume as `smc.crt`. */
function crtView(td, tf) {
  if (!td || !td.layers || !td.layers.bias || !td.layers.bias.range) return null;
  const L = td.layers.bias;
  const plan = L.plan;
  const price = td.price;
  const span = L.range.high - L.range.low;
  return {
    htf_candle: L.right_candle ? { ...L.right_candle.candle, timeframe: L.tf, level: L.right_candle.level } : null,
    prev_candle_bias: null,
    range_high: L.range.high, range_low: L.range.low, mid: L.range.mid,
    swept_high: !!(L.sweep && L.sweep.high), swept_low: !!(L.sweep && L.sweep.low),
    ltf_high: null, ltf_low: null,
    back_inside: span ? r2(((price - L.range.low) / span) * 100) : null,
    position: price > L.range.high ? 'above range' : price < L.range.low ? 'below range' : 'inside range',
    state: L.state,
    setup: plan ? {
      dir: plan.dir, side: plan.side,
      sweep_level: plan.sweep.level, sweep_extreme: plan.sweep.extreme, sweep_at: plan.sweep.at,
      entry: plan.safer.entry, stop: plan.safer.stop, target: plan.safer.target,
      target_label: plan.target_note, rr: plan.safer.rr,
      aggressive: plan.aggressive, safer: plan.safer,
      note: `Sweep of ${plan.sweep.level} (${plan.sweep.wick_atr} ATR wick beyond the range) failed to hold — CRT expects the opposite side of the ${L.tf} range.`,
    } : null,
    steps: (td.steps || []).filter((s) => s.n >= 2 && s.n <= 4).map((s) => `${s.done ? '' : '[waiting] '}${s.title}: ${s.text}`),
    topdown: { status: td.status, direction: td.direction, blocked: td.blocked, playbook: td.playbook, method: td.method.name, timeframe: tf },
  };
}

/** The live regime the momentum read describes, for the cover/nav badges. */
function regimeOf(htf) {
  const t = htf && htf.smc && htf.smc.structure ? htf.smc.structure.trend : 'ranging';
  return { trend: t, atr_rank: htf && htf.ind && htf.ind.ind ? htf.ind.ind.atr_rank : null };
}

/**
 * Full momentum read for a symbol.
 * @param {string} symbol
 * @param {string} tf
 */
async function analyse(symbol, tf = '15m', opts = {}) {
  const L = TD.layersFor(tf);
  const cut = { trim: opts.trim || 0, asOf: opts.asOf || null };
  const [htf, mtf, ltfRaw] = await Promise.all([
    series(symbol, L.bias_tf, opts.htfLimit || 400, cut),
    series(symbol, tf, opts.limit || 600, cut),
    L.trigger_tf === tf ? null : series(symbol, L.trigger_tf, opts.ltfLimit || 400, cut),
  ]);
  const ltf = ltfRaw || mtf;

  const td = TD.build({ symbol, tf, series: mtf, biasSeries: htf, triggerSeries: ltf, opts: { minRR: opts.minRR } });
  const align = alignment(htf, mtf, ltf, td);
  const mech = mechanics({ htf, mtf, ltf, align, td });
  const read = narrative({ symbol, mtf, htf, ltf, align, mech, td });
  mtf.smc.crt = crtView(td, tf);

  return {
    symbol, timeframe: tf,
    direction: align.bias > 0 ? 'bullish' : align.bias < 0 ? 'bearish' : 'neutral',
    bias: align.bias, bias_score: align.score,
    bias_provisional: align.provisional,
    topdown: {
      method: td.method, layers: td.layers, steps: td.steps, checks: td.checks,
      score: td.score, grade: td.grade, status: td.status, direction: td.direction,
      headline: td.headline, playbook: td.playbook, blocked: td.blocked,
      conviction: td.conviction,
      conflict_detail: td.conflicts, crt_plan: td.crt_plan, levels: td.levels,
      inputs: td.inputs,
    },
    alignment: align,
    mechanics: mech,
    narrative: read.lines,
    conflicts: read.conflicts,
    conflict_detail: read.detail,
    series: { htf: htf.tf, mtf: mtf.tf, ltf: ltf.tf, jobs: { bias: 'decides direction', location: 'entry location', trigger: 'confirmation' } },
    replay: { trim: cut.trim, as_of: cut.asOf ? new Date(Number(cut.asOf)).toISOString() : null },
    htf: {
      tf: htf.tf, structure: htf.smc.structure ? htf.smc.structure.trend : null,
      score: htf.ind.ok ? htf.ind.score : 0,
      last_break: htf.smc.structure ? htf.smc.structure.last_break : null,
      premium_discount: htf.smc.premium_discount,
    },
    quote: {
      price: r4(mtf.price), atr: r4(mtf.atr), atr_pct: mtf.ind.ok ? mtf.ind.ind.atr_pct : null,
      bars: mtf.bars, last_bar: mtf.meta.last_bar, provider: mtf.meta.provider, ticker: mtf.meta.ticker,
      warnings: mtf.meta.warnings,
    },
    series_raw: {
      htf: { candles: htf.candles.length, first: htf.candles[0] ? htf.candles[0].t : null, last: htf.candles[htf.candles.length - 1].t },
      mtf: { candles: mtf.candles.length, first: mtf.candles[0] ? mtf.candles[0].t : null, last: mtf.candles[mtf.candles.length - 1].t },
      ltf: { candles: ltf.candles.length, first: ltf.candles[0] ? ltf.candles[0].t : null, last: ltf.candles[ltf.candles.length - 1].t },
    },
  };
}

module.exports = {
  analyse, series, alignment, mechanics, narrative, crtView, regimeOf,
  MTF, htfOf, ltfOf, topdown: TD,
  // M50: exported pure so the hysteresis RULE can be unit-tested and measured against the same
  // walk that found the defect, without any caller having to own a state store first.
  biasHysteresis,
};
