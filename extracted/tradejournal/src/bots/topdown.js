'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TOP-DOWN ANALYSIS — the video's method, implemented literally
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The playlist (Market Mechanics / Brad Goh) teaches one procedure, and it is
 *  not "average three timeframes and wait for them to agree". It is:
 *
 *    STEP 1  Pick the timeframe stack and give every timeframe ONE job.
 *              higher timeframe = bias + the range    ("where are we going")
 *              trading timeframe = location            ("where is the level")
 *              lower timeframe = trigger               ("what proves it started")
 *    STEP 2  Find the RIGHT CANDLE — the higher-timeframe candle that reacted at
 *            a level that matters (previous high/low, an order block, or a
 *            supply/demand zone). If no candle has reacted anywhere important,
 *            there is no right candle and therefore no trade. No forcing.
 *    STEP 3  Mark that candle's high and low. That is the CRT range.
 *    STEP 4  Wait for a sweep: price trades through one side of the range and
 *            closes back inside. Sweep of the high → look short. Sweep of the
 *            low → look long. Equal highs/lows are the bait (inducement).
 *    STEP 5  Confirm on the lower timeframe: displacement / a structure shift in
 *            the direction of the expected reversal. Aggressive entry = at the
 *            confirmation; safer entry = wait for the pullback (the 50% of the
 *            leg or the fresh FVG) and enter there.
 *            Stop = beyond the candle that made the sweep.
 *            Target = the opposite side of the range (then the next pool).
 *
 *  CONFLICT HANDLING (this is the part the old code got wrong). The taught
 *  hierarchy is not a vote:
 *
 *    1. The higher timeframe is the boss. Bias comes from it, alone. Lower
 *       timeframes never overrule it — they only time it.
 *    2. Lower-timeframe disagreement is NOT a conflict. A sweep of a low inside
 *       a higher-timeframe demand zone is a long setup; it looks "bearish" on
 *       the small chart because that is exactly how the liquidity is taken.
 *    3. A genuine conflict is the higher timeframe printing its own opposite
 *       signal at its own extreme: e.g. bias is bullish, but price has swept the
 *       high of the higher-timeframe range and failed to hold. The taught answer
 *       is: stand aside on the old direction, wait for the next right candle —
 *       do not "split the difference" and trade a half-size long.
 *    4. If the higher timeframe has no bias (ranging, no right candle, both
 *       sides already taken), the answer is WAIT — the range edges are the only
 *       thing worth trading, one side at a time.
 *
 *  Everything below returns that procedure as data, with the sentence the
 *  mentor would say at each step, so the UI can show the reasoning rather than
 *  a score.
 */

const C = require('../candles');

const r4 = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 10000) / 10000);
const r2 = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ layers */

/** tf → the two timeframes around it, with the job each one does. */
const STACK = {
  '1m': { bias: '15m', zone: '5m', entry: '1m', trigger: '1m', style: 'scalp' },
  '3m': { bias: '30m', zone: '15m', entry: '3m', trigger: '1m', style: 'scalp' },
  '5m': { bias: '1h', zone: '15m', entry: '5m', trigger: '1m', style: 'scalp' },
  '15m': { bias: '4h', zone: '1h', entry: '15m', trigger: '5m', style: 'day' },
  '30m': { bias: '4h', zone: '1h', entry: '30m', trigger: '15m', style: 'day' },
  '1h': { bias: '1d', zone: '4h', entry: '1h', trigger: '15m', style: 'swing' },
  '4h': { bias: '1w', zone: '1d', entry: '4h', trigger: '1h', style: 'swing' },
  '1d': { bias: '1w', zone: '1d', entry: '1d', trigger: '4h', style: 'position' },
  '1w': { bias: '1w', zone: '1d', entry: '1w', trigger: '1d', style: 'position' },
};

const TF_MS = {
  '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3,
  '1h': 3600e3, '4h': 4 * 3600e3, '1d': 24 * 3600e3, '1w': 7 * 24 * 3600e3,
};

/**
 * Build higher-timeframe candles from a lower-timeframe series, anchored to the
 * calendar (t / tfMs) rather than to the first bar fetched, so the buckets line
 * up with what a charting platform shows.
 */
function aggregateByTf(candles, fromTf, toTf) {
  const step = TF_MS[toTf];
  const src = TF_MS[fromTf];
  if (!step || !src || step <= src) return (candles || []).slice();
  const buckets = new Map();
  for (const b of candles || []) {
    const key = Math.floor(Number(b.t) / step) * step;
    const cur = buckets.get(key);
    if (!cur) buckets.set(key, { t: key, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0, n: 1 });
    else {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l);
      cur.c = b.c; cur.v += b.v || 0; cur.n += 1;
    }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

/** Fill in whatever the caller did not fetch, using the stack for this tf. */
function layersFor(tf) {
  const s = STACK[tf] || STACK['15m'];
  return {
    style: s.style,
    bias_tf: s.bias,
    // M20: DEAD CONFIG. `s.zone` is declared per-timeframe in STACK above (e.g. '15m'
    // declares zone:'1h') and this field computes it, but NOTHING reads `zone_tf` —
    // verified: it appears exactly once in all of src/. Callers fetch series for
    // `bias_tf` and `trigger_tf` only, so the location layer silently runs on `entryTf`.
    // The API report is honest about that (layers.zone.tf === entryTf at :697); it is the
    // STACK declaration that is misleading. Wiring this up changes where zones are found,
    // so it belongs in a backtested batch, not here. Kept for the future fix.
    zone_tf: s.zone === s.bias ? s.bias : s.zone,
    entry_tf: tf,          // the chart the trader is actually trading
    trigger_tf: s.trigger, // the chart used for the confirmation
  };
}

/* ------------------------------------------------------- significant levels */

/**
 * The levels that qualify as "somewhere that matters" for step 2.
 * Previous highs/lows (swing + session/day extremes), strongest first.
 *
 * Pools older than `opts.from` are ignored on purpose: the level map must not
 * change just because more history was fetched. (Found by comparing the analyse
 * and chart payloads on the same market — they disagreed, because one was built
 * from 400 higher-timeframe candles and the other from 200, and the older
 * history changed which pool the newest candle "reacted" at.)
 */
function significantLevels(smc, opts = {}) {
  const liq = (smc && smc.liquidity) || {};
  const from = Number(opts.from || 0) || 0;
  const out = [];
  const push = (kind, type, price, label, strength, t) => {
    if (!Number.isFinite(Number(price))) return;
    if (out.some((l) => Math.abs(l.price - price) < 1e-9)) return;
    out.push({ kind, type, price: Number(price), label, strength: strength || 0.5, t: t || null });
  };
  for (const p of (liq.pools || [])) {
    if (from && Number(p.t || 0) && Number(p.t) < from) continue;      // outside the level window
    if (out.length >= 12) break;
    push(p.kind, p.type, p.price, p.label || p.kind, p.strength, p.t);
  }
  push('PDH', 'BSL', liq.pdh, 'Previous day high', 0.9, null);
  push('PDL', 'SSL', liq.pdl, 'Previous day low', 0.9, null);
  push('PWH', 'BSL', liq.pwh, 'Previous week high', 0.95, null);
  push('PWL', 'SSL', liq.pwl, 'Previous week low', 0.95, null);
  const st = (smc && smc.structure) || {};
  if (st.last_swing_high) push('swing_high', 'BSL', st.last_swing_high.price || st.last_swing_high, 'Last swing high', 0.65, st.last_swing_high.t);
  if (st.last_swing_low) push('swing_low', 'SSL', st.last_swing_low.price || st.last_swing_low, 'Last swing low', 0.65, st.last_swing_low.t);
  return out.sort((a, b) => b.strength - a.strength).slice(0, 10);
}

/* ------------------------------------------------------------- the steps */

/**
 * STEP 2 — find the right candle.
 *
 * The right candle is a completed (or currently forming) higher-timeframe candle
 * whose wick traded into a significant level and then closed back away from it.
 * Newest first, because the freshest reaction is the one in play.
 *
 * @returns {null|{i,candle,level,side,reaction_atr,index_from_end,forming}}
 */
function bestLevelAt(candle, levels, atr, tolerance = 0.15, minReaction = 0.2) {
  const tol = (atr || 0) * tolerance || 0;
  let best = null;
  for (const lv of levels) {
    const touched = lv.type === 'BSL' ? candle.h >= lv.price - tol : candle.l <= lv.price + tol;
    if (!touched) continue;
    const reacted = lv.type === 'BSL' ? (lv.price - candle.c) > tol : (candle.c - lv.price) > tol;
    if (!reacted) continue;                          // it broke through and stayed out: not a reaction
    const reactionAtr = atr ? Math.abs(lv.type === 'BSL' ? candle.h - candle.c : candle.c - candle.l) / atr : 0;
    if (reactionAtr < minReaction) continue;         // a tap that goes nowhere is not a reaction
    const score = lv.strength * 2 + Math.min(2, reactionAtr);
    if (!best || score > best.score) {
      best = {
        score,
        level: { kind: lv.kind, type: lv.type, price: r4(lv.price), label: lv.label, strength: lv.strength },
        side: lv.type === 'BSL' ? 'sell-side reaction (high rejected)' : 'buy-side reaction (low rejected)',
        reaction_atr: r2(reactionAtr),
        reaction_from: lv.type === 'BSL' ? 'high' : 'low',
      };
    }
  }
  return best;
}

/**
 * STEP 2+3 (walking back from the newest candle: the freshest reaction is the
 * one in play). Returns the right candle AND its marked range. A candle whose
 * range has already been consumed — swept, no reclaim, price still running past
 * the sweep extreme — is skipped, because that range has been played out and
 * the next right candle is the operative one.
 *
 * @returns {{right:object|null, range:object|null, skipped:string[]}}
 */
function findRange(htf, ltf, levels, atr, { lookback = 14 } = {}) {
  const skipped = [];
  if (!htf || htf.length < 3) return { right: null, range: null, skipped };
  const lastIndex = htf.length - 1;
  for (let i = lastIndex; i >= Math.max(0, lastIndex - lookback); i--) {
    const c = htf[i];
    const hit = bestLevelAt(c, levels, atr);
    if (!hit) continue;
    const right = {
      i, index_from_end: lastIndex - i, forming: i === lastIndex,
      candle: { t: c.t, o: r4(c.o), h: r4(c.h), l: r4(c.l), c: r4(c.c) },
      level: hit.level, side: hit.side, reaction_atr: hit.reaction_atr, reaction_from: hit.reaction_from,
    };
    const range = readRange(right, htf, ltf, atr);
    // A range is consumed — not merely mid-sweep — when price is still outside it
    // by more than half an ATR after taking the side. A poke that is still
    // deciding (price just beyond the edge) stays "sweeping".
    const beyond = range.swept.low ? (range.range.low - range.price) / (atr || 1)
      : range.swept.high ? (range.price - range.range.high) / (atr || 1) : 0;
    const runaway = range.state === 'sweeping' && beyond > 0.5;
    if (runaway) {
      skipped.push(`${new Date(right.candle.t).toISOString().slice(0, 16)}Z range ${range.range.low}–${range.range.high} already consumed (price is ${r2(beyond)} ATR outside it and never reclaimed)`);
      continue;
    }
    return { right, range, skipped };
  }
  return { right: null, range: null, skipped };
}

/** Back-compat / test helper: the right candle on its own. */
function pickRightCandle(htf, levels, atr, { lookback = 14 } = {}) {
  const lastIndex = (htf || []).length - 1;
  for (let i = lastIndex; i >= Math.max(0, lastIndex - lookback); i--) {
    const hit = bestLevelAt(htf[i], levels, atr);
    if (hit) return { i, index_from_end: lastIndex - i, forming: i === lastIndex, candle: { t: htf[i].t, o: r4(htf[i].o), h: r4(htf[i].h), l: r4(htf[i].l), c: r4(htf[i].c) }, ...hit };
  }
  return null;
}

/**
 * STEP 3 + 4 — mark the range, then look inside it for the sweep and the
 * failure to hold, using the lower timeframe.
 */
function readRange(right, htf, ltf, atr, { tolerance = 0.05 } = {}) {
  const R = right.candle;
  const span = R.h - R.l;
  const tol = (atr || 0) * tolerance || 0;
  const inside = (ltf || []).filter((b) => Number(b.t) >= Number(R.t));
  const window = inside.length >= 3 ? inside : (ltf || []).slice(-Math.max(3, Math.min(60, (ltf || []).length)));

  let hi = -Infinity, lo = Infinity, hiAt = null, loAt = null;
  for (const b of window) {
    if (b.h > hi) { hi = b.h; hiAt = b.t; }
    if (b.l < lo) { lo = b.l; loAt = b.t; }
  }
  const price = (ltf || []).length ? ltf[ltf.length - 1].c : R.c;
  const sweptHigh = hi > R.h + tol;
  const sweptLow = lo < R.l - tol;
  const backInsideHigh = price < R.h;
  const backInsideLow = price > R.l;

  // failure to hold = the sweep happened, then price closed back inside the
  // range. Confirmation = a displacement bar in the reversal direction after
  // the sweep (checked against the entry timeframe's own analysis elsewhere).
  const confirmShort = sweptHigh && backInsideHigh;
  const confirmLong = sweptLow && backInsideLow;
  let dir = 0;
  if (confirmShort && !confirmLong) dir = -1;
  else if (confirmLong && !confirmShort) dir = 1;
  else if (confirmShort && confirmLong) dir = (price < (R.h + R.l) / 2) ? -1 : 1;   // both sides taken: trade away from the last taken side

  const both = confirmShort && confirmLong;
  const state = !sweptHigh && !sweptLow ? 'no-sweep'
    : (!confirmShort && !confirmLong) ? 'sweeping'
      : both ? 'both-sides'
        : 'confirmed';

  const sweepPrice = dir === -1 ? hi : dir === 1 ? lo : null;
  const rangeMid = (R.h + R.l) / 2;
  const half = span / 2;

  let plan = null;
  if (dir !== 0) {
    /* ── the two entries the method teaches, on the geometry it teaches ──────
       The sweep took one side of the range; the stop goes beyond the candle that
       made the sweep; the target is the opposite side of the range.

         aggressive  enter at the confirmation — the price back inside the range
                     now. Risk is the distance to the swept extreme, reward is the
                     distance to the opposite edge.
         safer       wait for the pullback to the edge that was swept (the retest).
                     Same target, better price, smaller risk.

       This is the correction to a real defect: the previous code moved the
       aggressive entry a quarter of the range AWAY from the swept edge (an
       anti-chase cap) and then clamped the "safer" midpoint into the same slot,
       so both entries were identical and the R:R was mutilated — measured over
       60 live plans: aggressive and safer were the same number every time, median
       0.59R, never once reaching 2R. The anti-chase job is done by `chase` below
       (room_left < 0.5 blocks the plan outright), which is where it belongs.  */
    const opposite = dir === -1 ? R.l : R.h;
    // How much of the range is left BETWEEN the price and the target. This must be
    // DIRECTIONAL. The old code took Math.abs(opposite - price): when price had
    // already blown through the opposite edge, the absolute value still reported
    // "room", the entry clamped onto the target, and the plan printed with a 0R
    // reward instead of being declared gone. room_left < 0 means the move has
    // already happened.
    const roomLeft = (dir === -1 ? price - opposite : opposite - price) / (span || 1);
    const edge = dir === -1 ? R.h : R.l;                     // the side that was swept
    const stop = dir === -1 ? (sweepPrice || R.h) + atr * 0.15 : (sweepPrice || R.l) - atr * 0.15;

    // aggressive: at the confirmation price, but never printed BELOW the swept
    // edge (a price back inside is the whole point) and never beyond the target
    // a hair beyond the target in the worst case, so a plan that is already spent
    // prints a tiny but real R:R instead of a 0R row (the chase flag still refuses it)
    const edgeFloor = dir === -1 ? opposite + atr * 0.05 : opposite - atr * 0.05;
    const aggEntry = dir === -1
      ? Math.min(Math.max(price, edgeFloor), R.h)
      : Math.max(Math.min(price, edgeFloor), R.l);
    /* safer: the retest of the swept edge — sell the high again / buy the low
       again. It is exactly the edge, not "the edge minus a tenth of an ATR":
       the earlier clamp pulled it back toward the confirmation price, so the two
       fills collapsed onto each other whenever price was already near the edge
       (measured live: BTCUSDT 5m and UKOIL 5m printed the same entry for both
       rows, while the method's pullback fill was 1.9R against 1.73R at the
       confirmation). If price is already at the edge the two fills DO coincide —
       that is information, and the table shows it rather than hiding it.       */
    const safeEntry = edge;
    const mk = (entry, stopP, kind) => {
      const risk = Math.abs(entry - stopP);
      const reward = Math.abs(opposite - entry);
      return {
        kind,
        entry: r4(entry), stop: r4(stopP), target: r4(opposite),
        risk: r4(risk), reward: r4(reward), rr: risk ? r2(reward / risk) : 0,
        risk_atr: atr ? r2(risk / atr) : null,
      };
    };
    const aggressive = mk(aggEntry, stop, 'at the confirmation');
    const safer = mk(safeEntry, stop, 'on the retest of the swept edge');
    const chase = roomLeft < 0.5;                 // <0 = the move is already done
    /* Are the range and the sweep the SAME event? The method pairs a wick just
       beyond the range with that range, so the stop lands just past the range's
       edge and the risk is about the width of the range. When the risk is several
       RANGES wide, the "sweep" belongs to a different move — the newest candle
       that reacted at a level is not the candle this extreme was made for.
       Measured live (2026-10-07, 70 instruments × 5 tfs): proper pairs sit at
       risk/range 1.0–1.4, the broken pairs at 7.7–22.7 (MSFT 1d 22.7, NVDA 1d
       11.6, JP225 1d 13.0 — all of which printed 0.04–0.10R "plans").         */
    const bestRisk = Math.min(aggressive.risk, safer.risk);
    const riskOverRange = span ? bestRisk / span : null;
    // 2, not 3: measured on 2026-10-07 across 70 instruments, the properly paired
    // plans sat at risk/range 0.31–1.52 and the broken ones at 2.6–22.7. The
    // threshold goes in the gap, not at the edge of it.
    const lopsided = riskOverRange !== null && riskOverRange > 2;
    /* The stop has to clear the market's own noise. A stop 0.05 ATR from the
       entry is inside the spread and the tick-to-tick jitter: it will be taken
       out by nothing, which prints an enormous R:R that cannot be traded
       (measured live 2026-10-07: XRPUSDT 5m showed 10.46R on a 0.08 ATR risk —
       i.e. a stop roughly one spread away). The floor is 0.25 ATR.            */
    const wickAtr = atr ? Math.abs(sweepPrice - (dir === -1 ? R.h : R.l)) / atr : null;
    const subNoise = atr > 0 && Math.min(aggressive.risk_atr, safer.risk_atr) < 0.25;
    // informational: how deep the sweep went beyond the level, in ATR. A very
    // shallow wick is not a defect by itself (the method wants price to trade
    // outside and come back), so this does NOT block a plan — it is context.
    const thinSweep = wickAtr !== null && wickAtr < 0.25;
    plan = {
      dir, side: dir > 0 ? 'long' : 'short',
      sweep: {
        level: dir === -1 ? r4(R.h) : r4(R.l),
        extreme: r4(sweepPrice), at: dir === -1 ? hiAt : loAt,
        wick_atr: atr ? r2(Math.abs(sweepPrice - (dir === -1 ? R.h : R.l)) / atr) : null,
      },
      aggressive, safer,
      chase,
      sub_noise: subNoise,
      thin_sweep: thinSweep,
      risk_over_range: riskOverRange === null ? null : r2(riskOverRange),
      lopsided,
      wick_atr: wickAtr === null ? null : r2(wickAtr),
      room_left: r2(roomLeft),
      warning: chase
        ? `Price has already travelled ${Math.round((1 - roomLeft) * 100)}% of the way to the opposite side of the range — the trade is gone. Wait for the next right candle instead of chasing the one that has run.`
        : lopsided
          ? `The stop sits ${riskOverRange.toFixed(1)} ranges away from the entry: this range and this sweep are not the same event. The setup engine found a level, not a trade.`
          : subNoise
            ? `The stop would sit ${Math.min(aggressive.risk_atr, safer.risk_atr)} ATR from the entry — inside the noise. The reward on paper is an artefact of a stop that cannot be traded.`
            : null,
      target_note: `opposite side of the range (${dir === -1 ? 'range low' : 'range high'} ${r4(opposite)})`,
      invalidation: dir === -1 ? `a close back above ${r4(sweepPrice || R.h)} voids the short` : `a close back below ${r4(sweepPrice || R.l)} voids the long`,
      // M50: the SAME level as a number and a direction, not only as prose. The finding was that
      // the invalidation level exists but nothing can feed it back as the gate that changes the
      // bias — and a sentence cannot be compared against a close. `invalidation_side` says which
      // way a close voids the idea: a short is voided by a close ABOVE, a long by a close BELOW.
      // Kept next to the prose so the two cannot disagree about which level they mean.
      invalidation_level: r4(dir === -1 ? (sweepPrice || R.h) : (sweepPrice || R.l)),
      invalidation_side: dir === -1 ? 'above' : 'below',
    };
  }

  return {
    range: { high: r4(R.h), low: r4(R.l), mid: r4(rangeMid), span: r4(span), span_atr: atr ? r2(span / atr) : null },
    opened_at: R.t,
    ltf_extremes: { high: Number.isFinite(hi) ? r4(hi) : null, low: Number.isFinite(lo) ? r4(lo) : null, bars_in_range: window.length },
    swept: { high: sweptHigh, low: sweptLow, high_at: sweptHigh ? hiAt : null, low_at: sweptLow ? loAt : null },
    held: { high: backInsideHigh, low: backInsideLow },
    both_sides_taken: both,
    state, dir, plan,
    price: r4(price),
    position_pct: span ? r2(((price - R.l) / span) * 100) : null,
  };
}

/** STEP 5 — the lower-timeframe confirmation, described in the method's words. */
/**
 * Direction as ±1, whichever shape it arrives in.
 *
 * Structure breaks carry `dir` as the STRING 'up'/'down'; displacement legs carry
 * it as a NUMBER ±1. Comparing the two with Math.sign() silently produced NaN —
 * so the confirmation gate below could never pass. This is the one-line reason
 * conviction tier A was unreachable; it is kept as a named function so nobody
 * has to rediscover it.
 */
function dirSign(d) {
  if (d === 'up' || d === 'bullish') return 1;
  if (d === 'down' || d === 'bearish') return -1;
  const n = Number(d);
  return Number.isFinite(n) ? Math.sign(n) : 0;
}

/**
 * Step 5 — did the lower timeframe confirm?
 *
 * Displacement legs are stored as { i, t, dir, rangeAtr, ... } (absolute bar
 * index, no `bars_ago`) while structure breaks carry `bars_ago`. Both shapes are
 * handled here, and the *newest* leg in the trade direction is the one that
 * counts — the oldest expansion in a 400-bar window is history, not a trigger.
 */
function confirmation(trigger, dir, atr) {
  const smc = (trigger && trigger.smc) || {};
  const candles = (trigger && trigger.candles) || [];
  const n = candles.length;
  const ageOf = (item) => {
    if (!item) return null;
    if (Number.isFinite(Number(item.bars_ago))) return Number(item.bars_ago);
    if (Number.isFinite(Number(item.i)) && n) return Math.max(0, n - 1 - Number(item.i));
    return null;
  };

  // newest expansion bar in the direction we are trading
  const legs = (smc.displacement || []).filter((d) => dirSign(d.dir) === dir);
  const disp = legs.length ? legs[legs.length - 1] : null;
  const dispAgo = ageOf(disp);
  const dispOk = !!(disp && dispAgo !== null && dispAgo <= 8 && Number(disp.rangeAtr) >= 0.8);

  const struct = smc.structure || {};
  const lastBreak = struct.last_break || null;
  const breakAgo = ageOf(lastBreak);
  const shiftOk = !!(lastBreak && breakAgo !== null && breakAgo <= 8 && dirSign(lastBreak.dir) === dir);
  const fvgs = (smc.fvgs || []).filter((g) => !g.filled && Math.sign(g.dir) === dir);
  const ob = (smc.order_blocks || []).find((z) => !z.breached && Math.sign(z.dir) === dir);
  const pullback = fvgs[0] || ob || null;
  const ok = !!(dispOk || shiftOk);
  return {
    ok, tf: trigger ? trigger.tf : null,
    displacement: disp ? { dir: dirSign(disp.dir), bars_ago: dispAgo, range_atr: Number(disp.rangeAtr), ok: !!dispOk } : null,
    structure_shift: lastBreak ? { dir: dirSign(lastBreak.dir), direction: lastBreak.dir, type: lastBreak.type, bars_ago: breakAgo, ok: !!shiftOk } : null,
    pullback_zone: pullback ? (pullback.bottom !== undefined
      ? { kind: fvgs.includes(pullback) ? 'FVG' : 'order block', bottom: r4(pullback.bottom), top: r4(pullback.top), dir: pullback.dir }
      : null) : null,
    note: ok
      ? `${trigger.tf} confirmed: ${dispOk ? `${disp.rangeAtr} ATR displacement ${dispAgo} bars ago` : ''}${dispOk && shiftOk ? ' plus ' : ''}${shiftOk ? `a ${lastBreak.type} ${lastBreak.dir} ${breakAgo} bars ago` : ''}. Enter at confirmation, or wait for the pullback into the ${pullback ? (pullback.bottom !== undefined ? 'zone/FVG' : 'level') : 'mid of the leg'}.`
      : `${trigger ? trigger.tf : 'Lower timeframe'} has not confirmed yet — no displacement and no structure shift in the reversal direction. This is a watch, not an entry.`,
  };
}

/* ---------------------------------------------------------- the three layers */

/**
 * The full top-down object.
 *
 * @param {object} args
 * @param {string} args.symbol
 * @param {string} args.tf          trading timeframe (the chart on screen)
 * @param {object} args.series      the trading-timeframe series (candles, smc, ind, atr, price)
 * @param {object} [args.biasSeries]  pre-fetched higher-timeframe series (recommended)
 * @param {object} [args.triggerSeries] pre-fetched lower-timeframe series
 */
function build({ symbol, tf, series, biasSeries = null, triggerSeries = null, zoneSeries = null, opts = {} }) {
  const L = layersFor(tf);
  const entrySeries = series;
  const entryTf = tf;

  // ---- Layer 1: bias -----------------------------------------------------
  const biasCandles = (biasSeries && biasSeries.candles) || aggregateByTf(entrySeries.candles, entryTf, L.bias_tf);
  const biasAtr = (biasSeries && biasSeries.atr) || (biasCandles.length ? biasCandles.slice(-30).reduce((s, b) => s + (b.h - b.l), 0) / Math.min(30, biasCandles.length) : 0);
  const biasSmc = (biasSeries && biasSeries.smc) || null;
  // the level map is built from a fixed trailing window of the bias timeframe, so
  // the same market analyses identically however much history the caller fetched
  const LEVEL_BARS = 120;
  const levelFrom = biasCandles.length > LEVEL_BARS ? biasCandles[biasCandles.length - LEVEL_BARS].t : 0;
  const levels = significantLevels(biasSmc || entrySeries.smc, { from: levelFrom });
  const found = findRange(biasCandles, entrySeries.candles, levels, biasAtr, { lookback: 14 });
  const right = found.right;
  const biasRange = found.range;

  // ---- Layer 2: the zone on the trading timeframe -------------------------
  const entrySmc = entrySeries.smc || {};
  const pd = entrySmc.premium_discount || null;
  const freshZone = (entrySmc.order_blocks || []).find((z) => !z.breached && z.distance_atr <= 4) || null;
  const unfilledFvg = (entrySmc.fvgs || []).filter((g) => !g.filled)[0] || null;
  const entryCrt = (() => {
    // the trading timeframe also gets the CRT treatment: its own newest reacting
    // candle, read against the trigger timeframe as the confirmation series
    const tLevels = significantLevels(entrySmc, {
      from: entrySeries.candles.length > 240 ? entrySeries.candles[entrySeries.candles.length - 240].t : 0,
    });
    const eAtr = entrySeries.atr || 0;
    const f = findRange(entrySeries.candles, triggerSeries ? triggerSeries.candles : entrySeries.candles, tLevels, eAtr, { lookback: 20 });
    return f.right ? { right: f.right, skipped: f.skipped, ...f.range } : null;
  })();

  // ---- Layer 3: the trigger ----------------------------------------------
  const trigger = triggerSeries || entrySeries;
  const dirForConfirm = (biasRange && biasRange.dir) || (biasSmc && biasSmc.structure && biasSmc.structure.trend === 'bullish' ? 1 : biasSmc && biasSmc.structure && biasSmc.structure.trend === 'bearish' ? -1 : 0);
  const conf = dirForConfirm ? confirmation(trigger, dirForConfirm, entrySeries.atr) : { ok: false, note: 'No direction yet, so there is nothing to confirm.' };

  // ---- the verdict --------------------------------------------------------
  let direction = 0;
  let status = 'waiting';
  let headline = '';
  const playbook = [];

  if (!right) {
    headline = `No right candle on ${L.bias_tf}: no ${L.bias_tf} candle has reacted at a level that matters (previous high/low, order block or supply/demand). The method says wait — there is nothing to mark, so there is nothing to trade.`;
    playbook.push(`Mark the ${L.bias_tf} levels that matter (previous highs/lows, supply and demand) and come back when a candle reacts at one.`);
  } else if (!biasRange.swept.high && !biasRange.swept.low) {
    direction = 0;
    headline = `Right candle found on ${L.bias_tf} (${right.side}, ${right.reaction_atr} ATR reaction at the ${right.level.label} ${right.level.price}). Range ${biasRange.range.low}–${biasRange.range.high} is marked, but neither side has been swept yet. Step 4 is the trigger: do not front-run the sweep.`;
    playbook.push(`Set an alert at ${biasRange.range.high} (buyside) and ${biasRange.range.low} (sellside). Trade the side that gets taken and fails to hold.`);
    playbook.push(biasRange.position_pct > 50
      ? `Price is in the upper half of the range (${biasRange.position_pct}%) — the buy-side sweep is the nearer event.`
      : `Price is in the lower half of the range (${biasRange.position_pct}%) — the sell-side sweep is the nearer event.`);
  } else if (biasRange.state === 'sweeping') {
    direction = 0;
    const which = biasRange.swept.high ? 'high' : 'low';
    headline = `The ${L.bias_tf} range ${which} has been traded through but has not failed to hold yet. The sweep is in progress: wait for the close back inside the range, then the lower-timeframe confirmation.`;
    playbook.push(`Do not enter mid-sweep. Wait for a ${L.bias_tf} candle to close back inside ${biasRange.range.low}–${biasRange.range.high}.`);
  } else if (biasRange.state === 'both-sides') {
    direction = 0;
    headline = `Both sides of the ${L.bias_tf} range have been swept — this is chop, not a setup. The method says stand down until a new right candle forms.`;
    playbook.push('Wait for a new right candle with a clean one-sided sweep.');
  } else if (biasRange.state === 'confirmed' && biasRange.plan && biasRange.plan.chase) {
    direction = 0;
    headline = `The ${L.bias_tf} sweep fired but price has already covered ${Math.round((1 - biasRange.plan.room_left) * 100)}% of the range to the target — chasing it now is taking the trade after the move. The method waits for the next right candle.`;
    playbook.push(`Mark the next ${L.bias_tf} candle that reacts at a level and start again from step 2.`);
  } else if (biasRange.state === 'confirmed') {
    direction = biasRange.dir;
    status = 'confirmed';
    const biasStruct = (biasSmc && biasSmc.structure) || {};
    const biasTrend = biasStruct.trend || 'ranging';
    const agrees = (direction > 0 && biasTrend === 'bullish') || (direction < 0 && biasTrend === 'bearish');
    const fights = (direction > 0 && biasTrend === 'bearish') || (direction < 0 && biasTrend === 'bullish');
    headline = `${L.bias_tf} swept the ${direction > 0 ? 'sellside' : 'buyside'} of ${biasRange.range.low}–${biasRange.range.high} and closed back inside: CRT is ${direction > 0 ? 'long' : 'short'} back to ${direction > 0 ? 'the range high' : 'the range low'} (${direction > 0 ? biasRange.range.high : biasRange.range.low}).`
      + (agrees ? ` That agrees with the ${L.bias_tf} structure (${biasTrend}) — this is the A-setup.`
        : fights ? ` Note: ${L.bias_tf} structure is still ${biasTrend}, so this is a counter-trend reversal. The method allows it — the failed sweep is the evidence — but it is a smaller-size trade with the target kept at the range edge, not beyond it.`
          : ` ${L.bias_tf} structure is ranging, so treat it as a range rotation, not a trend trade.`);
    playbook.push(`Wait for the ${trigger.tf || L.trigger_tf} to confirm (displacement or a structure shift ${direction > 0 ? 'up' : 'down'}).`);
    playbook.push(`Aggressive: enter at the confirmation, stop beyond the candle that made the sweep (${biasRange.plan.aggressive.stop}).`);
    playbook.push(`Safer: wait for the pullback to ${biasRange.plan.safer.entry} (mid of the range / the fresh FVG), same stop.`);
    playbook.push(`Target: ${biasRange.plan.target_note}. Take the first target at the range edge; only hold a runner if ${L.bias_tf} structure has shifted with you.`);
  }

  // ---- conflicts, resolved by the hierarchy, not by a vote ----------------
  const conflicts = [];
  const biasTrend = (biasSmc && biasSmc.structure && biasSmc.structure.trend) || null;
  const entryTrend = (entrySmc.structure && entrySmc.structure.trend) || null;

  if (direction !== 0 && biasTrend && ((direction > 0 && biasTrend === 'bearish') || (direction < 0 && biasTrend === 'bullish'))) {
    conflicts.push({
      kind: 'counter-trend-crt',
      sides: `${L.bias_tf} structure ${biasTrend} vs a confirmed ${direction > 0 ? 'bullish' : 'bearish'} CRT sweep`,
      rule: 'A failed sweep is allowed to trade against the higher-timeframe structure, but only with a range target and reduced size — it is a rotation, not a reversal of the higher timeframe.',
      resolution: 'Included, marked as counter-trend: target the opposite side of the range only, half size, and stand down if price closes back beyond the sweep extreme.',
      blocks_trade: false,
    });
  }
  if (direction !== 0 && entryTrend && ((direction > 0 && entryTrend === 'bearish') || (direction < 0 && entryTrend === 'bullish'))) {
    conflicts.push({
      kind: 'ltf-against-htf',
      sides: `${entryTf} structure ${entryTrend} vs the ${L.bias_tf} direction ${direction > 0 ? 'up' : 'down'}`,
      rule: 'The lower timeframe never overrules the higher one — it only times it. A lower-timeframe downtrend inside a higher-timeframe demand zone is the liquidity being taken, not a reason to flip.',
      resolution: `Follow ${L.bias_tf}. Use the ${(trigger.tf || L.trigger_tf)} only for the entry: wait for its structure to turn ${direction > 0 ? 'up' : 'down'} before clicking.`,
      blocks_trade: false,
    });
  }
  if (direction === 0 && biasTrend && entryTrend && biasTrend !== entryTrend && biasTrend !== 'ranging' && entryTrend !== 'ranging') {
    conflicts.push({
      kind: 'no-trigger',
      sides: `${L.bias_tf} ${biasTrend} vs ${entryTf} ${entryTrend}`,
      rule: 'The higher timeframe decides the direction, and it has not given one: no right candle, no confirmed sweep. The trading timeframe disagreeing with it is not a signal to trade the other way — the method has no trade in it at all. There is no "compromise" direction.',
      resolution: `Wait for the ${L.bias_tf} to sweep a range edge and fail to hold. Do not take the ${entryTf} trade on its own.`,
      blocks_trade: true,
    });
  }
  if (biasRange && biasRange.plan && biasRange.plan.chase) {
    conflicts.push({
      kind: 'chase',
      sides: `${biasRange.plan.room_left * 100}% of the ${L.bias_tf} range is left between price and the target`,
      rule: 'The method takes the sweep, not the tail end of the move. Once price has covered most of the range, the trade has been paid.',
      resolution: 'Wait for the next right candle. Do not chase a range that has already run.',
      blocks_trade: true,
    });
  }
  if (biasRange && biasRange.both_sides_taken) {
    conflicts.push({
      kind: 'both-sides-taken',
      sides: `both the high and the low of the ${L.bias_tf} range were swept`,
      rule: 'A range with both sides taken is being engineered for a bigger move; entries inside it are coin flips.',
      resolution: 'Stand down until a new right candle forms with a clean one-sided sweep.',
      blocks_trade: true,
    });
  }
  if (!right) {
    conflicts.push({
      kind: 'no-right-candle',
      sides: `no ${L.bias_tf} candle has reacted at a significant level`,
      rule: 'Step 2 has no answer, so steps 3–5 have nothing to work with.',
      resolution: 'Watch, mark levels, wait for the reaction candle.',
      blocks_trade: true,
    });
  }

  const blockers = conflicts.filter((c) => c.blocks_trade);
  if (blockers.length && status === 'confirmed') status = 'blocked';
  else if (blockers.length) status = 'waiting';

  // ---- the score: the method's own checks, not a weighted average ---------
  const checks = [
    { key: 'right_candle', label: `Step 2 · right candle on ${L.bias_tf}`, ok: !!right, detail: right ? `${right.side} at the ${right.level.label} ${right.level.price}` : 'no candle has reacted anywhere important' },
    { key: 'range_marked', label: 'Step 3 · range marked', ok: !!biasRange, detail: biasRange ? `${biasRange.range.low} – ${biasRange.range.high}` : 'nothing to mark' },
    { key: 'sweep', label: 'Step 4 · liquidity swept and failed to hold', ok: !!(biasRange && biasRange.state === 'confirmed'), detail: biasRange ? biasRange.state : '—' },
    { key: 'trigger', label: `Step 5 · ${trust(trigger)} confirmation`, ok: !!conf.ok, detail: conf.note },
    { key: 'location', label: 'Location · entry is in the right half of the range', ok: !biasRange ? false : direction === 0 ? false : (direction > 0 ? biasRange.position_pct < 55 : biasRange.position_pct > 45), detail: biasRange ? `${biasRange.position_pct}% of the ${L.bias_tf} range` : '—' },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);

  const steps = [
    {
      n: 1, title: 'Timeframe stack', done: true,
      text: `${L.bias_tf} decides the bias and holds the range · ${entryTf} holds the location · ${trigger.tf || L.trigger_tf} gives the trigger. Style: ${L.style}.`,
    },
    {
      n: 2, title: 'The right candle', done: !!right,
      text: right
        ? `${L.bias_tf} candle at ${new Date(right.candle.t).toISOString().slice(0, 16)}Z reacted at the ${right.level.label} ${right.level.price} (${right.reaction_atr} ATR reaction, ${right.index_from_end} candle${right.index_from_end === 1 ? '' : 's'} back${right.forming ? ', still forming' : ''}).`
        : `No ${L.bias_tf} candle has reacted at a level that matters yet.`,
    },
    {
      n: 3, title: 'Mark the range', done: !!biasRange,
      text: biasRange ? `${biasRange.range.low} – ${biasRange.range.high} (${biasRange.range.span_atr} ATR wide). Price now at ${biasRange.position_pct}% of it.` : '—',
    },
    {
      n: 4, title: 'Wait for the sweep', done: !!(biasRange && biasRange.state === 'confirmed'),
      text: biasRange ? ({
        'no-sweep': 'Neither side has been taken. This is the waiting part of the method — the sweep is the signal.',
        sweeping: `The ${biasRange.swept.high ? 'high' : 'low'} has been traded through but has not closed back inside. Sweep in progress.`,
        'both-sides': 'Both sides taken — chop. Stand down.',
        confirmed: `Sweep of the ${biasRange.swept.high ? 'high' : 'low'} failed to hold: ${biasRange.plan && biasRange.plan.sweep ? `${biasRange.plan.sweep.wick_atr} ATR wick beyond ${biasRange.plan.sweep.level}, now back inside.` : ''}`,
      })[biasRange.state] : '—',
    },
    {
      n: 5, title: 'Confirm lower, then enter', done: !!conf.ok,
      text: conf.note,
    },
  ];

  // How much conviction the method itself gives the setup. The video is explicit
  // that size follows the evidence: a confirmed sweep plus a lower-timeframe
  // confirmation is the A trade; a confirmed sweep without the confirmation is a
  // smaller, range-target trade; anything else is a watch.
  const conviction = status === 'confirmed' && conf.ok
    ? { tier: 'A', why: `Sweep of the ${L.bias_tf} range failed to hold AND the ${trigger.tf || L.trigger_tf} confirmed it.`, size_hint: 'full plan risk, target the opposite side of the range, runner only if the higher-timeframe structure shifts with you' }
    : status === 'confirmed'
      ? { tier: 'B', why: `The ${L.bias_tf} sweep failed to hold, but ${trigger.tf || L.trigger_tf} has not confirmed yet.`, size_hint: 'half risk, take the range edge as the only target, or wait for the confirmation and take it as an A trade' }
      : blockedBy(blockers) || { tier: 'watch', why: `Step ${(steps.find((s) => !s.done) || {}).n || 4} is outstanding: ${headline}`, size_hint: 'no position — the method has not armed a trade' };



  return {
    method: {
      name: 'CRT top-down (Market Mechanics)',
      stack: `${L.bias_tf} bias → ${entryTf} location → ${trigger.tf || L.trigger_tf} trigger`,
      style: L.style,
      steps: steps.map((s) => s.title),
      conflict_rule: 'The higher timeframe decides direction; lower timeframes only time it. A lower-timeframe move against the higher-timeframe direction is the liquidity being taken — not a conflict. A genuine conflict (higher timeframe sweeping its own opposing extreme) means stand down and wait for the next right candle, never a split-the-difference trade.',
    },
    layers: {
      bias: {
        tf: L.bias_tf, job: 'bias + range',
        role_note: 'This timeframe decides direction. Nothing lower is allowed to override it.',
        structure: biasTrend, levels: levels.length,
        right_candle: right || null,
        range: biasRange ? biasRange.range : null,
        state: biasRange ? biasRange.state : (right ? 'unswept' : 'no-right-candle'),
        sweep: biasRange ? biasRange.swept : null,
        held: biasRange ? biasRange.held : null,
        plan: biasRange ? biasRange.plan : null,
        consumed_ranges: found.skipped,
        bars: biasCandles.length, atr: r4(biasAtr),
      },
      zone: {
        tf: entryTf, job: 'location',
        role_note: 'Where the entry lives: premium/discount, fresh zone, unfilled gap.',
        structure: entryTrend,
        premium_discount: pd ? { zone: pd.zone, position_pct: pd.position_pct, range: [pd.range_low, pd.range_high], ote_band: pd.ote_band || null, ote: pd.ote || null } : null,
        fresh_zone: freshZone ? { side: freshZone.side, top: r4(freshZone.top), bottom: r4(freshZone.bottom), distance_atr: freshZone.distance_atr } : null,
        unfilled_fvg: unfilledFvg ? { dir: unfilledFvg.dir, top: r4(unfilledFvg.top), bottom: r4(unfilledFvg.bottom) } : null,
        crt: entryCrt,
      },
      trigger: {
        tf: trigger.tf || L.trigger_tf, job: 'trigger',
        role_note: 'Confirmation only. It can delay an entry or veto it, but it can never choose the direction.',
        bar_count: (trigger.candles || []).length,
        session: (trigger.smc && trigger.smc.sessions) ? { killzone: trigger.smc.sessions.killzone, quality: trigger.smc.sessions.quality, active: trigger.smc.sessions.active } : null,
        confirmation: conf,
      },
    },
    steps,
    checks,
    score,
    grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
    direction,
    side: direction > 0 ? 'long' : direction < 0 ? 'short' : null,
    status,
    conviction,
    headline,
    playbook,
    conflicts,
    blocked: blockers.length > 0,
    crt_plan: biasRange && direction !== 0 ? (() => {
      const plan = { tf: L.bias_tf, ...biasRange.plan, range: biasRange.range, state: biasRange.state };
      // The CRT plan bypassed the entry model's 1:2 floor: it could be presented as an
      // armed order with a 0.08R target. It is still shown (the trader may want the
      // scenario) but it is labelled, loudly, and the UI turns it red.
      const minRR = Number(opts.minRR) > 0 ? Number(opts.minRR) : 1;   // the trader's floor, default 1R
      const aRR = Number(plan.aggressive && plan.aggressive.rr) || 0;
      const sRR = Number(plan.safer && plan.safer.rr) || 0;
      plan.min_rr = minRR;
      plan.aggressive.below_min_rr = aRR > 0 && aRR < minRR;
      plan.safer.below_min_rr = sRR > 0 && sRR < minRR;
      plan.best_rr = Math.max(aRR, sRR);
      plan.below_min_rr = plan.best_rr > 0 && plan.best_rr < minRR;
      plan.rr_note = plan.below_min_rr
        ? `Below your minimum: the best fill pays ${plan.best_rr}R against a ${minRR}R floor. The range is real; the reward is not worth the stop — it is a scenario, not an order.`
        : null;
      return plan;
    })() : null,
    levels: levels.slice(0, 6),
    price: r4(entrySeries.price),
    inputs: {
      bias_bars: biasCandles.length, entry_bars: (entrySeries.candles || []).length,
      trigger_bars: (trigger.candles || []).length, aggregated_bias: !biasSeries,
      level_window_bars: LEVEL_BARS, level_window_from: levelFrom ? new Date(levelFrom).toISOString() : null,
    },
  };

  function trust(t) { return (t && t.tf) || L.trigger_tf; }
  function blockedBy(list) {
    return (list && list.length)
      ? { tier: 'none', why: list.map((c) => c.sides).join('; '), size_hint: `stand down — ${list[0].resolution}` }
      : null;
  }
}

module.exports = { dirSign,
  build, layersFor, aggregateByTf, significantLevels, bestLevelAt, findRange, pickRightCandle,
  readRange, confirmation, STACK, TF_MS,
};
