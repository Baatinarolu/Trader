'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SMC ENGINE — the market mechanics taught in the "Market Mechanics Mentorship"
 *  playlist (Brad Goh / The Trading Geek), expressed as pure functions.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Pipeline the curriculum teaches, and the pipeline implemented here:
 *
 *    1. bias      higher-timeframe direction (delegated: momentum.js / MTF)
 *    2. structure swing points -> HH/HL/LH/LL -> BOS / CHoCH / MSS
 *    3. liquidity equal highs/lows, PDH/PDL, PWH/PWL, session extremes, inducement
 *    4. sweep     price wicks through a pool and CLOSES BACK INSIDE (stop hunt)
 *    5. displacement  large-bodied expansion bar that breaks structure
 *    6. imbalance order blocks + fair value gaps left behind by the displacement
 *    7. entry     retrace into the zone (OB 50% / FVG CE), stop beyond sweep/zone,
 *                 target the opposing liquidity pool — minimum 1:2
 *    8. filters   killzones, premium/discount, news blackout, CRT range play
 *
 *  Everything here is deterministic and side-effect free: same candles in, same
 *  analysis out. No opinions on size or money — that lives in setup.js.
 */

const I = require('../indicators');

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ══════════════════════════════════════════════════════════════ 1. SWINGS */

/**
 * Fractal swing points. A swing high is a bar whose high is the highest of the
 * `strength` bars either side of it (right side must be strictly lower so that
 * plateaus produce one point, not two).
 * @returns {Array<{i:number,t:number,price:number,type:'high'|'low',strength:number}>}
 */
// M24: how many recent swings of one side define the "current swing range" whose extreme is
// the strong level. Measured rather than chosen by taste: at 300 bars over 40 series the CHoCH
// count is 15 / 14 / 14 / 14 for lookback 3 / 5 / 8 / 12, so the result is insensitive to it
// and 5 sits in the middle of the flat region. Do NOT set it to 0 — `slice(-0)` is `slice(0)`,
// which silently means "every swing in the window" rather than "none".
const STRONG_LOOKBACK = 5;

function findSwings(candles, strength = 2) {
  const out = [];
  const n = candles.length;
  for (let i = strength; i < n - strength; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) isHigh = false;
      if (candles[j].l <= candles[i].l) isLow = false;
    }
    if (isHigh) out.push({ i, t: candles[i].t, price: candles[i].h, type: 'high', strength });
    if (isLow) out.push({ i, t: candles[i].t, price: candles[i].l, type: 'low', strength });
  }
  return out;
}

/** Keep only alternating highs/lows — keeps the most extreme when two of a kind repeat. */
function alternate(swings) {
  const out = [];
  for (const s of swings) {
    const lastS = out[out.length - 1];
    if (!lastS || lastS.type !== s.type) { out.push(s); continue; }
    const better = s.type === 'high' ? s.price > lastS.price : s.price < lastS.price;
    if (better) out[out.length - 1] = s;
  }
  return out;
}

/**
 * M1 - the course's swing definition, offered alongside the local-extremum one.
 *
 * `findSwings` marks a bar that is the strict local max/min of N bars either side. Ep 5 defines
 * a swing differently: the swing low is "the lowest point that CREATED the break of structure" -
 * the extreme that originated the impulse, not merely a turning point. A local turn that never
 * produced a break is not a swing by that definition.
 *
 * MEASURED, NOT ADOPTED (analysis/probe-m1-swing-definition.js, 40 series x 300 bars, driven
 * through the project's own marketStructure):
 *   - keeps 46% of the swings (18.2 vs 39.7 per series)
 *   - the swing range is 3.5x wider (3.42% vs 0.97% of price): leg extremes, not tight turns
 *   - the trend label changes on 63% of series (25/40: bullish->bearish x13,
 *     bearish->bullish x9, ->ranging x3)
 *
 * That is a strategy change, not a refinement, so it is opt-in via analyse(candles,
 * { swingMode: 'bos' }) and OFF by default. Making it the default needs its own backtest and a
 * decision - see the ledger entry for M1.
 */
function bosSwings(candles, minor) {
  const kept = [];
  for (let k = 0; k < minor.length; k++) {
    const s = minor[k];
    let level = null;
    for (let j = k - 1; j >= 0; j--) { if (minor[j].type !== s.type) { level = minor[j]; break; } }
    if (!level) { kept.push(s); continue; }
    const after = candles.slice(s.i + 1);
    const broke = s.type === 'low'
      ? after.some((c) => c.c > level.price)
      : after.some((c) => c.c < level.price);
    if (broke) kept.push(s);
  }
  return alternate(kept);
}

/* ══════════════════════════════════════════════ 2. MARKET STRUCTURE / BOS */

/**
 * Label swings HH / HL / LH / LL and derive trend, BOS, CHoCH and MSS events.
 * @param {Array} candles
 * @param {Array} swings  alternating swings (see alternate())
 */
function marketStructure(candles, swings) {
  const labels = [];
  let prevHigh = null, prevLow = null;
  for (const s of swings) {
    if (s.type === 'high') {
      const tag = prevHigh === null ? 'H' : s.price > prevHigh.price ? 'HH' : s.price < prevHigh.price ? 'LH' : 'EH';
      labels.push({ ...s, label: tag });
      prevHigh = s;
    } else {
      const tag = prevLow === null ? 'L' : s.price > prevLow.price ? 'HL' : s.price < prevLow.price ? 'LL' : 'EL';
      labels.push({ ...s, label: tag });
      prevLow = s;
    }
  }

  // trend = read of the last few labelled swings
  const recent = labels.slice(-5);
  const hh = recent.filter((x) => x.label === 'HH').length, hl = recent.filter((x) => x.label === 'HL').length;
  const lh = recent.filter((x) => x.label === 'LH').length, ll = recent.filter((x) => x.label === 'LL').length;
  let trend = 'ranging';
  if (hh + hl >= 3 && hh > 0 && hl > 0) trend = 'bullish';
  else if (lh + ll >= 3 && lh > 0 && ll > 0) trend = 'bearish';
  else if (hh + hl > lh + ll + 1) trend = 'bullish';
  else if (lh + ll > hh + hl + 1) trend = 'bearish';

  // BOS / CHoCH: walk bars after each confirmed swing and look for a CLOSE beyond it
  const events = [];
  const swingHighs = labels.filter((x) => x.type === 'high');
  const swingLows = labels.filter((x) => x.type === 'low');
  // M24 — is `s` the extreme (strong) level among the recent swings of its own side?
  const isStrongLevel = (list, s, i, dir) => {
    const prior = list.filter((x) => x.i < i).slice(-STRONG_LOOKBACK);
    if (!prior.length) return false;
    const extreme = dir === 'up'
      ? prior.reduce((a, b) => (b.price > a.price ? b : a))   // strong HIGH = highest high
      : prior.reduce((a, b) => (b.price < a.price ? b : a));  // strong LOW  = lowest low
    return Math.abs(extreme.price - s.price) < 1e-9;
  };
  const scanBreaks = (list, dir) => {
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      for (let i = s.i + 1; i < candles.length; i++) {
        const c = candles[i];
        const broke = dir === 'up' ? c.c > s.price : c.c < s.price;
        if (!broke) continue;
        // `type` is NOT decided here. See the chronological pass below — deciding it during
        // the scan is what made bullish reversals undetectable.
        events.push({
          dir, i, t: c.t, level: r4(s.price), close: r4(c.c),
          sweptBefore: false,
          // M24: did this break take out the extreme (strong) level of the recent swings on
          // its own side? Decided here because the swing list is in scope, applied later.
          broke_strong: isStrongLevel(list, s, i, dir),
        });
        break; // one break per swing level
      }
    }
    return events;
  };


  const all = [...scanBreaks(swingHighs, 'up'), ...scanBreaks(swingLows, 'down')].sort((a, b) => a.i - b.i);
  // dedupe: consecutive same-direction events closer than 3 bars collapse to the first
  const breaks = [];
  for (const e of all) {
    const lastB = breaks[breaks.length - 1];
    if (lastB && lastB.dir === e.dir && e.i - lastB.i < 3) continue;
    breaks.push(e);
  }

  // M24 — classify CHoCH vs BOS in ONE chronological pass over the merged, deduped sequence.
  // It used to be decided inside scanBreaks, which runs every swing high before any swing low;
  // during that phase `events` held only up-breaks, so `lastEvent.dir === 'down'` could never
  // be true and an UP break could never be a CHoCH. Measured: 0 up-direction CHoCH across 40
  // series — a bullish reversal was structurally undetectable. Both sides are now classified
  // against the same sorted sequence.
  //
  // And a direction flip alone is still not a reversal. Ep 5: "in order for the trend to shift
  // from bullish to bearish, price needs to come down and TAKE OUT THE STRONG LOW", and "a lot
  // of beginners tend to get trapped because they think that every pullback is a reversal."
  // A pullback breaks intermediate swings; it does not break the extreme that defines the
  // current swing range. So a CHoCH requires the flip AND the strong level.
  for (let k = 0; k < breaks.length; k++) {
    const e = breaks[k];
    const prev = breaks[k - 1];
    e.flipped = !!prev && prev.dir !== e.dir;
    e.type = e.flipped && e.broke_strong ? 'CHoCH' : 'BOS';
  }

  // MSS = CHoCH whose break bar swept liquidity in the opposite direction first.
  // M23: this used to read `e.mss = e.type === 'CHoCH'`, which made MSS a synonym for CHoCH
  // and threw the sweep test away — the comment even claimed the flag was "checked in
  // sweeps() and patched there", but the patch below could only ever set it to true, never
  // back to false, so a CHoCH with no stop run was still reported as an MSS. Initialised
  // false here and decided once `sweeps` exists.
  for (const e of breaks) { e.mss = false; }

  const lastHigh = swingHighs[swingHighs.length - 1] || null;
  const lastLow = swingLows[swingLows.length - 1] || null;
  const lastBreak = breaks[breaks.length - 1] || null;

  return {
    labels, breaks, trend,
    last_break: lastBreak ? { type: lastBreak.type, dir: lastBreak.dir, level: lastBreak.level, t: lastBreak.t, bars_ago: candles.length - 1 - lastBreak.i, mss: !!lastBreak.mss } : null,
    recent_labels: labels.slice(-6).map((x) => ({ label: x.label, price: r4(x.price), t: x.t, type: x.type })),
    last_swing_high: lastHigh ? { price: r4(lastHigh.price), t: lastHigh.t, i: lastHigh.i, label: lastHigh.label } : null,
    last_swing_low: lastLow ? { price: r4(lastLow.price), t: lastLow.t, i: lastLow.i, label: lastLow.label } : null,
    // M2 - the swing range. Ep 5: "this becomes my swing range and this is the area that I
    // want to focus on. I don't care about what price is doing outside of this swing range."
    // The two extremes were already exposed individually; what was missing is the span between
    // them as a single object, so nothing downstream could ask "is price inside the range?".
    // Report-only for now, per the ledger: bounding zone validity by it is a separate,
    // measurable change.
    swing_range: lastHigh && lastLow && lastHigh.price > lastLow.price ? {
      high: r4(lastHigh.price), low: r4(lastLow.price),
      width: r4(lastHigh.price - lastLow.price),
      width_pct: r4((lastHigh.price - lastLow.price) / lastLow.price * 100),
    } : null,
  };
}

/* ══════════════════════════════════════════════════════ 3. DISPLACEMENT */

/** Expansion bars: body dominates the range and the range beats ATR — the "engine" behind SMC. */
function findDisplacement(candles, atr, { minAtr = 1.2, minBody = 0.55 } = {}) {
  const out = [];
  for (let i = 1; i < candles.length; i++) {
    const b = candles[i];
    const range = b.h - b.l;
    const body = Math.abs(b.c - b.o);
    if (!range || !atr) continue;
    const dir = b.c > b.o ? 1 : b.c < b.o ? -1 : 0;
    if (!dir) continue;
    const bodyRatio = body / range;
    const rangeAtr = range / atr;
    if (bodyRatio >= minBody && rangeAtr >= minAtr) {
      out.push({ i, t: b.t, dir, rangeAtr: r2(rangeAtr), bodyRatio: r2(bodyRatio), close: b.c, open: b.o, high: b.h, low: b.l });
    }
  }
  return out;
}

/* ═════════════════════════════════════════════════ 4. ORDER BLOCKS / FVG */

/**
 * Order blocks: the last opposite candle before a displacement leg.
 * Bundles supply (bearish OB) and demand (bullish OB) with freshness + confluence tags.
 */
function findOrderBlocks(candles, atr, displacement, breaks, { maxAge = 250, maxBlocks = 14, fvgs = null, requireFvg = false } = {}) {
  const out = [];
  const n = candles.length;
  // M31 - the dealing range the zone's depth is measured against. Ep 8: "the more extreme the
  // zone is within the range, the higher the probability", because "the previous low has to
  // hold in order for price to remain bullish."
  const look = candles.slice(Math.max(0, n - maxAge));
  const rangeHigh = look.length ? Math.max(...look.map((b) => b.h)) : 0;
  const rangeLow = look.length ? Math.min(...look.map((b) => b.l)) : 0;
  const eq = (rangeHigh + rangeLow) / 2;
  const span = rangeHigh - rangeLow || 1;
  for (const d of displacement) {
    if (n - 1 - d.i > maxAge) continue;
    // walk back from the displacement bar to find the last opposite-colour candle
    let idx = -1;
    for (let j = d.i - 1; j >= Math.max(0, d.i - 6); j--) {
      const b = candles[j];
      const opposite = d.dir > 0 ? b.c < b.o : b.c > b.o;
      if (opposite) { idx = j; break; }
    }
    if (idx < 0) continue;
    const ob = candles[idx];
    const dir = d.dir > 0 ? 1 : -1; // 1 = demand (bullish OB), -1 = supply
    const top = ob.h, bottom = ob.l;
    const bodyTop = Math.max(ob.o, ob.c), bodyBottom = Math.min(ob.o, ob.c);

    // mitigation: how has price interacted with the zone SINCE the displacement leg?
    // (bars inside the leg itself are the move that created the zone, not a test)
    // M29 - mitigation needs the 50% level, not a touch. Ep 7: "it counts as a mitigation if
    // price... has pulled back very aggressively into the 50% of this zone... if price just
    // touches this zone and then continues going down, I personally do not like to count that
    // as a valid mitigation." A wick to the zone edge therefore leaves it fresh, and the code
    // was more permissive than the course, not stricter. `touched` keeps the old behaviour
    // visible for display so the change is auditable rather than silent.
    const mid = (top + bottom) / 2;
    let tests = 0, mitigated = false, breached = false, touched = false, firstTest = null;
    for (let i = Math.max(idx + 1, d.i + 1); i < n; i++) {
      const b = candles[i];
      const inside = b.l <= top && b.h >= bottom;
      if (inside && !firstTest) firstTest = i;
      if (inside) tests++;
      if (dir > 0 ? b.c < bottom : b.c > top) { breached = true; mitigated = true; }
      else if (dir > 0 ? b.l <= mid : b.h >= mid) mitigated = true;   // reached the 50% level
      else if (dir > 0 ? b.l <= top : b.h >= bottom) touched = true;  // probed the edge only
    }
    const brokeStructure = breaks.some((x) => x.i > idx && x.i <= d.i + 1 && ((dir > 0 && x.dir === 'up') || (dir < 0 && x.dir === 'down')));
    // M42 - Ep 13: "liquidity zone is simply A POINT OF INTEREST THAT SWEPT LIQUIDITY... an
    // area where price first takes an obvious high or low, triggers the resting orders right
    // there and then reacts from that point MAKING THE POINT OF INTEREST MUCH MORE STRONGER."
    // His zone-one/zone-two ranking turns on exactly this: zone one is premium + swept +
    // broke structure, zone two is discount + un-swept, and "zone one has a higher chance of
    // working out... It's just math." Strength had no swept term at all.
    // Mechanical test, using only the candles: did the move INTO the block take out the
    // extreme of the run immediately before it? That is the stop run he describes.
    let sweptLiquidity = false;
    {
      const pre = candles.slice(Math.max(0, idx - 12), idx);
      if (pre.length >= 4) {
        const ref = pre.slice(0, -2), probe = pre.slice(-2);
        const refLow = Math.min(...ref.map((b) => b.l));
        const refHigh = Math.max(...ref.map((b) => b.h));
        sweptLiquidity = dir > 0
          ? probe.some((b) => b.l < refLow)
          : probe.some((b) => b.h > refHigh);
      }
    }
    // M31 - depth into the range, on the correct side, capped at the extreme half.
    const depth = dir > 0
      ? clamp((eq - top) / span, 0, 0.5) / 0.5      // demand: the further below equilibrium
      : clamp((bottom - eq) / span, 0, 0.5) / 0.5;  // supply: the further above it
    const strength = clamp(
      0.4 + Math.min(d.rangeAtr / 3, 1) * 0.3 + (brokeStructure ? 0.2 : 0) + (tests === 0 ? 0.15 : 0)
      // M30 - Ep 7: "price respected multiple times... this is a very strong supply zone." The
      // formula only rewarded an UNTESTED zone and gave nothing for repeated respect, which is
      // the opposite of the rule. Both are kept: fresh is valuable, and so is proven respect.
      + (tests >= 2 ? 0.15 : 0)
      // M31
      + depth * 0.15
      // M42 - the sweep is what upgrades a point of interest to a liquidity zone. Weighted
      // alongside broke_structure, which is the other half of his zone-one description.
      + (sweptLiquidity ? 0.2 : 0)
      - (breached ? 0.5 : 0), 0, 1.4,
    );
    // M32 - Ep 10 states the prerequisite twice: "fair value gap must be present in order for
    // us to identify order block. No imbalance, no fair value gap." and "for supply and demand
    // zone it doesn't matter whether there's imbalance or not... but for order block, one of
    // the very strict criteria for it to be valid is that it needs to have an imbalance."
    // Requiring DISPLACEMENT did not satisfy this: displacement is one large candle
    // (rangeAtr >= 1.2, bodyRatio >= 0.55), whereas an FVG is a three-candle gap. The gap must
    // belong to the same leg that created the block.
    const gap = requireFvg && Array.isArray(fvgs)
      ? fvgs.find((g) => g.dir === dir && g.i >= idx && g.i <= d.i + 2) || null
      : null;
    if (requireFvg && !gap) continue;
    const firstTouch = firstTest;
    out.push({
      kind: 'OB', dir, side: dir > 0 ? 'demand' : 'supply',
      top: r4(top), bottom: r4(bottom), mid: r4((top + bottom) / 2),
      body_top: r4(bodyTop), body_bottom: r4(bodyBottom), body_mid: r4((bodyTop + bodyBottom) / 2),
      i: idx, t: ob.t, displacement_i: d.i, displacement_atr: d.rangeAtr,
      tests, first_touch: firstTouch, mitigated, breached, touched, fresh: tests === 0,
      broke_structure: brokeStructure, swept_liquidity: sweptLiquidity, strength: r2(strength), depth_in_range: r2(depth),
      has_fvg: !!gap, fvg_i: gap ? gap.i : null,
      bars_ago: n - 1 - idx,
      distance_pct: r2(((dir > 0 ? top : bottom) - candles[n - 1].c) / candles[n - 1].c * 100),
      distance_atr: r2(Math.abs(((dir > 0 ? top : bottom) - candles[n - 1].c)) / (atr || 1)),
    });
  }
  // best-first: strong, fresh, not breached, near price
  out.sort((a, b) => (b.strength - (b.breached ? 1 : 0)) - (a.strength - (a.breached ? 1 : 0)));
  const seen = new Set();
  const dedup = [];
  for (const z of out) {
    const key = `${z.dir}:${z.t}:${z.bottom.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(z);
    if (dedup.length >= maxBlocks) break;
  }
  return dedup;
}

/** Fair value gaps / imbalances — the 3-candle void displacement leaves behind. */
function findFvgs(candles, atr, { minAtr = 0.12, maxAge = 250, maxGaps = 14 } = {}) {
  const out = [];
  const n = candles.length;
  for (let i = 2; i < n; i++) {
    const a = candles[i - 2], b = candles[i - 1], c = candles[i];
    if (n - 1 - i > maxAge) continue;
    const bull = c.l > a.h;          // gap between candle A high and candle C low
    const bear = c.h < a.l;
    if (!bull && !bear) continue;
    const bottom = bull ? a.h : c.h;
    const top = bull ? c.l : a.l;
    const size = top - bottom;
    if (!atr || size < minAtr * atr) continue;
    // fill tracking
    let fillPct = 0, filled = false;
    for (let j = i + 1; j < n; j++) {
      const x = candles[j];
      if (bull) {
        if (x.l <= bottom) { filled = true; fillPct = 100; break; }
        if (x.l < top) fillPct = Math.max(fillPct, ((top - x.l) / size) * 100);
      } else {
        if (x.h >= top) { filled = true; fillPct = 100; break; }
        if (x.h > bottom) fillPct = Math.max(fillPct, ((x.h - bottom) / size) * 100);
      }
    }
    const dir = bull ? 1 : -1;
    out.push({
      kind: 'FVG', dir, side: bull ? 'bullish' : 'bearish',
      top: r4(top), bottom: r4(bottom), mid: r4((top + bottom) / 2),
      size: r4(size), size_atr: r2(size / atr), i, t: candles[i].t,
      filled, fill_pct: r2(fillPct), bars_ago: n - 1 - i,
      strength: r2(clamp(size / atr / 3 + (filled ? -0.3 : 0.1), 0, 1.4)),
    });
  }
  out.sort((a, b) => (b.size_atr - b.fill_pct / 100) - (a.size_atr - a.fill_pct / 100));
  const seen = new Set();
  const dedup = [];
  for (const g of out) {
    const key = `${g.dir}:${g.t}`;
    if (seen.has(key)) continue;
    seen.add(key); dedup.push(g);
    if (dedup.length >= maxGaps) break;
  }
  return dedup;
}

/**
 * Breaker blocks / flip zones: a zone that failed in its own direction and now acts
 * the other way. A demand OB that closes below becomes resistance (bearish breaker).
 */
function findBreakers(orderBlocks, candles, atr, breaks = []) {
  const out = [];
  const n = candles.length;
  for (const z of orderBlocks) {
    if (!z.breached) continue;
    let brokeAt = null;
    for (let i = z.i + 1; i < n; i++) {
      const c = candles[i];
      const through = z.dir > 0 ? c.c < z.bottom : c.c > z.top;
      if (through) { brokeAt = i; break; }
    }
    if (brokeAt === null) continue;
    // M48 - Ep 14 gives a CLOSED LIST of three criteria: "A flip zone is only confirmed when
    // there is a FAILED REACTION, when price BREAKS STRUCTURE and price actually CLOSE ABOVE
    // THE OR BELOW THE REACTION POINT." Only the close test existed here, and the other two
    // were not merely untested but unmeasurable - no reaction extreme was ever recorded.
    // (1) failed reaction: the zone did its job first. Price has to have reacted off it before
    //     it failed, otherwise it was never a zone that "worked" - just price passing through.
    //     The reaction point is the extreme of that reaction, measured from the zone to the
    //     break.
    let reactionPoint = null;
    for (let i = z.i; i < brokeAt; i++) {
      const v = z.dir > 0 ? candles[i].h : candles[i].l;
      reactionPoint = reactionPoint === null ? v : (z.dir > 0 ? Math.max(reactionPoint, v) : Math.min(reactionPoint, v));
    }
    const reactionSize = reactionPoint === null ? 0
      : Math.abs(reactionPoint - (z.dir > 0 ? z.top : z.bottom)) / (atr || 1);
    const failedReaction = reactionSize >= 0.5;
    // (2) break of structure AFTER the failure, in the flip direction. "If this flip zone did
    //     not break structure it is NOT COUNTED AS A FLIP ZONE."
    const structureBreak = (breaks || []).find((k) => k.i > brokeAt
      && ((z.dir > 0 && k.dir === 'down') || (z.dir < 0 && k.dir === 'up')));
    const brokeStructure = !!structureBreak;
    // retest since the break = confirmation the flip holds
    let retested = false;
    for (let i = brokeAt + 1; i < n; i++) {
      const c = candles[i];
      if (c.h >= z.bottom && c.l <= z.top) { retested = true; break; }
    }
    out.push({
      kind: 'breaker', dir: -z.dir, side: z.dir > 0 ? 'supply' : 'demand',
      top: z.top, bottom: z.bottom, mid: z.mid, i: brokeAt, t: candles[brokeAt].t,
      origin: { top: z.top, bottom: z.bottom, side: z.side, t: z.t }, retested,
      // M48: the two criteria that were missing, recorded so the emitted set can be audited
      failed_reaction: failedReaction, reaction_point: reactionPoint === null ? null : r4(reactionPoint),
      broke_structure: brokeStructure, confirmed: failedReaction && brokeStructure,
      // M47 bug: `z.strength` here is ALREADY penalised -0.5 for being breached (see the
      // strength formula above), and then takes a further -0.2. But the breach is the
      // PRECONDITION for a flip zone existing, not a defect in it - "a supply flip zone is
      // formed when a demand zone fails". Measured, this double penalty put retested breakers
      // at 0.355 average strength against 0.898 for un-breached order blocks, so they lost the
      // point-of-interest ranking 0 of 6 times and could never be selected. The origin's
      // pre-breach strength is restored; the -0.2 staleness term and the +0.2 retest
      // confirmation are kept.
      strength: r2(clamp(z.strength + (z.breached ? 0.5 : 0) + (retested ? 0.2 : 0) - 0.2, 0, 1.4)),
      bars_ago: n - 1 - brokeAt, distance_atr: r2(Math.abs(((z.dir > 0 ? z.bottom : z.top) - candles[n - 1].c)) / (atr || 1)),
    });
  }
  return out;
}

/* ══════════════════════════════════════════════════════ 5. LIQUIDITY POOLS */

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
function weekKey(t) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

/** Cluster swing levels that sit within `tol` of each other => equal highs / equal lows. */
function clusterLevels(swings, tol) {
  const sorted = [...swings].sort((a, b) => a.price - b.price);
  const clusters = [];
  for (const s of sorted) {
    const c = clusters[clusters.length - 1];
    if (c && Math.abs(s.price - c.price) <= tol) {
      c.members.push(s);
      c.price = (c.price * (c.members.length - 1) + s.price) / c.members.length;
      c.lastT = Math.max(c.lastT, s.t);
    } else {
      clusters.push({ price: s.price, members: [s], lastT: s.t, type: s.type });
    }
  }
  return clusters.map((c) => ({ ...c, touches: c.members.length, price: r4(c.price) }));
}

/**
 * Every pool of resting orders the bots care about:
 *   BSL (buy-side liquidity, above price)  /  SSL (sell-side, below price)
 * Sources: equal highs/lows, prior day/week extremes, session extremes, old swing points.
 */
function liquidity(candles, swings, atr, { tf = '15m', equalTolAtr = 0.18, maxPools = 16, allSwings = false } = {}) {
  const n = candles.length;
  if (!n) return { pools: [], equal_highs: [], equal_lows: [] };
  const price = candles[n - 1].c;
  const tol = Math.max((atr || price * 0.001) * equalTolAtr, price * 0.00005);

  // prior day / week extremes from the candle series
  const byDay = new Map(), byWeek = new Map();
  for (const b of candles) {
    const dk = dayKey(b.t), wk = weekKey(b.t);
    const d = byDay.get(dk) || { h: -Infinity, l: Infinity, t: b.t };
    d.h = Math.max(d.h, b.h); d.l = Math.min(d.l, b.l);
    byDay.set(dk, d);
    const w = byWeek.get(wk) || { h: -Infinity, l: Infinity, t: b.t };
    w.h = Math.max(w.h, b.h); w.l = Math.min(w.l, b.l);
    byWeek.set(wk, w);
  }
  const dayKeys = [...byDay.keys()];
  const wkKeys = [...byWeek.keys()];
  const todayKey = dayKey(Date.now());
  const thisWeek = weekKey(Date.now());
  const prevDayKeys = dayKeys.filter((k) => k < todayKey);
  const prevDay = prevDayKeys.length ? byDay.get(prevDayKeys[prevDayKeys.length - 1]) : null;
  const thisDayKey = dayKeys[dayKeys.length - 1];
  const sessionDay = byDay.get(thisDayKey);
  const prevWeek = wkKeys.filter((k) => k < thisWeek).map((k) => byWeek.get(k)).pop() || null;

  const pools = [];
  const push = (p) => { if (Number.isFinite(p.price) && p.price > 0) pools.push(p); };

  // equal highs / lows (2+ touches) — the classic "obvious" liquidity
  const highs = alternate(swings).filter((s) => s.type === 'high');
  const lows = alternate(swings).filter((s) => s.type === 'low');
  const eh = clusterLevels(highs, tol).filter((c) => c.touches >= 2);
  const el = clusterLevels(lows, tol).filter((c) => c.touches >= 2);
  for (const c of eh) push({ kind: 'equal_highs', type: 'BSL', price: c.price, touches: c.touches, t: c.lastT, label: `Equal highs ×${c.touches}`, strength: clamp(0.4 + c.touches * 0.2, 0, 1.2) });
  for (const c of el) push({ kind: 'equal_lows', type: 'SSL', price: c.price, touches: c.touches, t: c.lastT, label: `Equal lows ×${c.touches}`, strength: clamp(0.4 + c.touches * 0.2, 0, 1.2) });

  if (prevDay) {
    push({ kind: 'PDH', type: 'BSL', price: prevDay.h, t: prevDay.t, label: 'Previous day high', strength: 0.9 });
    push({ kind: 'PDL', type: 'SSL', price: prevDay.l, t: prevDay.t, label: 'Previous day low', strength: 0.9 });
  }
  if (sessionDay && sessionDay.h > -Infinity) {
    push({ kind: 'TDH', type: 'BSL', price: sessionDay.h, t: sessionDay.t, label: "Today's high", strength: 0.6 });
    push({ kind: 'TDL', type: 'SSL', price: sessionDay.l, t: sessionDay.t, label: "Today's low", strength: 0.6 });
  }
  if (prevWeek) {
    push({ kind: 'PWH', type: 'BSL', price: prevWeek.h, t: prevWeek.t, label: 'Previous week high', strength: 1.0 });
    push({ kind: 'PWL', type: 'SSL', price: prevWeek.l, t: prevWeek.t, label: 'Previous week low', strength: 1.0 });
  }
  // remaining un-swept swing extremes (old highs above, old lows below)
  // M44 - Ep 13: "always assume that there is resting liquidity behind ANY high or low that
  // price has not yet traded." Only the last four of each side were ever eligible, so an
  // un-swept swing from six moves back - exactly the "fuel" his narrative sends price to fetch
  // next - was invisible to liquidity(), to findSweeps(), and therefore to the target ladder.
  // Measured: 6.4 of 14.0 minor swings per series, i.e. 46% of swings could ever become a pool.
  // NOTE what this deliberately does NOT do: it does not filter on `swept` here, because
  // `swept` is patched onto these objects later and findSweeps() reads this same list to find
  // the trigger. Filtering at construction would delete the sweep events the entry model needs.
  const poolHighs = allSwings ? highs : highs.slice(-4);
  const poolLows = allSwings ? lows : lows.slice(-4);
  for (const s of poolHighs) push({ kind: 'swing_high', type: 'BSL', price: s.price, t: s.t, label: 'Swing high', strength: 0.55, i: s.i });
  for (const s of poolLows) push({ kind: 'swing_low', type: 'SSL', price: s.price, t: s.t, label: 'Swing low', strength: 0.55, i: s.i });

  // sort by strength, annotate side: above price = BSL, below = SSL (regardless of source)
  const merged = [];
  const seen = new Set();
  for (const p of pools.sort((a, b) => b.strength - a.strength)) {
    const key = `${p.type}:${p.price.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...p,
      side: p.price > price ? 'above' : 'below',
      distance_pct: r2(Math.abs(p.price - price) / price * 100),
      distance_atr: r2(Math.abs(p.price - price) / (atr || 1)),
      swept: false, swept_t: null,
    });
    // M44: expanding the candidate set without raising this cap makes new pools DISPLACE old
    // ones - measured at maxPools 16 the pool count rose 20% but sweep events fell 82 -> 76,
    // because the recently-swept levels the trigger needs were pushed out by stronger distant
    // ones. Measured across caps: sweeps stop shrinking at 24 and saturate by 32 (356 pools at
    // 32 vs 357 at 48). The cap is only raised when allSwings is on, so the default is untouched.
    if (merged.length >= (allSwings ? Math.max(maxPools, 32) : maxPools)) break;
  }
  merged.sort((a, b) => a.distance_pct - b.distance_pct);
  return {
    pools: merged,
    equal_highs: eh.map((c) => ({ price: c.price, touches: c.touches, t: c.lastT })),
    equal_lows: el.map((c) => ({ price: c.price, touches: c.touches, t: c.lastT })),
    pdh: prevDay ? r4(prevDay.h) : null, pdl: prevDay ? r4(prevDay.l) : null,
    pwh: prevWeek ? r4(prevWeek.h) : null, pwl: prevWeek ? r4(prevWeek.l) : null,
    tolerance: r4(tol), price: r4(price),
  };
}

/* ═══════════════════════════════════════════════════ 6. SWEEPS (stop hunts) */

/**
 * A sweep = a bar that trades through a liquidity level and CLOSES BACK INSIDE.
 * That is the "stop hunt / liquidity grab" the curriculum builds entries around.
 * A bar that closes through the level is a breakout, not a sweep.
 */
function findSweeps(candles, pools, atr, { lookback = 80, minWickAtr = 0.08 } = {}) {
  const n = candles.length;
  const from = Math.max(1, n - lookback);
  const out = [];
  for (let i = from; i < n; i++) {
    const b = candles[i];
    const prevClose = candles[i - 1] ? candles[i - 1].c : b.o;
    for (const p of pools) {
      // A genuine sweep runs ABOVE liquidity that was sitting above price (or below
      // liquidity that was sitting below price). Levels already on the wrong side of
      // the prior close are ordinary support/resistance, not stop runs.
      const levelAbove = p.price > prevClose;
      const levelBelow = p.price < prevClose;
      // buy-side sweep: wick above the pool, close back below it
      if (levelAbove && b.h > p.price && b.c < p.price) {
        const wick = (b.h - p.price) / (atr || 1);
        if (wick < minWickAtr) continue;
        out.push({
          i, t: b.t, type: 'BSL', dir: -1, pool: p.kind, pool_label: p.label, level: p.price,
          extreme: b.h, close: b.c, wick_atr: r2(wick), bars_ago: n - 1 - i,
          rejected_by: r2(((b.h - b.c) / (atr || 1))),
          strength: r2(clamp(wick * 1.2 + p.strength * 0.5 + (b.c < b.o ? 0.2 : 0), 0, 2)),
          label: `Swept ${p.label} at ${r4(p.price)}`,
        });
      }
      // sell-side sweep: wick below the pool, close back above it
      if (levelBelow && b.l < p.price && b.c > p.price) {
        const wick = (p.price - b.l) / (atr || 1);
        if (wick < minWickAtr) continue;
        out.push({
          i, t: b.t, type: 'SSL', dir: 1, pool: p.kind, pool_label: p.label, level: p.price,
          extreme: b.l, close: b.c, wick_atr: r2(wick), bars_ago: n - 1 - i,
          rejected_by: r2(((b.c - b.l) / (atr || 1))),
          strength: r2(clamp(wick * 1.2 + p.strength * 0.5 + (b.c > b.o ? 0.2 : 0), 0, 2)),
          label: `Swept ${p.label} at ${r4(p.price)}`,
        });
      }
    }
  }
  // strongest + most recent first, one entry per level per 4 bars (consecutive
  // bars re-testing the same pool is one event, not three)
  out.sort((a, b) => (b.strength - b.bars_ago * 0.01) - (a.strength - a.bars_ago * 0.01));
  const kept = [];
  for (const s of out) {
    const dup = kept.find((k) => k.type === s.type && Math.abs(k.level - s.level) < 1e-9 && Math.abs(k.i - s.i) <= 4);
    if (dup) continue;
    kept.push(s);
    if (kept.length >= 10) break;
  }
  return kept;
}

/* ═══════════════════════════════════════ 7. PREMIUM / DISCOUNT & DEALING RANGE */

/** Dealing range + premium/discount/equilibrium + OTE (0.62–0.79) band. */
function premiumDiscount(candles, swings) {
  const n = candles.length;
  if (!n) return null;
  const last = candles[n - 1].c;
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');
  if (!highs.length || !lows.length) return null;
  // The dealing range must be a meaningful swing pair: walk back through the swings
  // until the leg spans a useful distance (>= 6 ATR) so premium/discount actually means
  // something on every timeframe. Falls back to the extremes if history is short.
  const closed = candles.slice(0, -1);
  const atrRef = I.atr(closed.length > 20 ? closed : candles, 14) || 0;
  const minSpan = atrRef * 6;
  let recentHi = highs[highs.length - 1], recentLo = lows[lows.length - 1];
  for (let back = 2; back <= Math.min(highs.length, lows.length, 8); back++) {
    const hSlice = highs.slice(-back), lSlice = lows.slice(-back);
    const h = hSlice.reduce((a, b) => (b.price > a.price ? b : a), hSlice[0]);
    const l = lSlice.reduce((a, b) => (b.price < a.price ? b : a), lSlice[0]);
    recentHi = h; recentLo = l;
    if (h.price - l.price >= minSpan) break;
  }
  const rangeHigh = recentHi.price, rangeLow = recentLo.price;
  const span = rangeHigh - rangeLow;
  if (!span) return null;
  const pos = (last - rangeLow) / span; // 0 = range low, 1 = range high
  // M52: the `equilibrium` label used to be unreachable in practice — `inDiscount = pos < 0.5`
  // and `inPremium = pos > 0.5` left the third branch only `pos === 0.5` exactly, so the label
  // was cosmetic while `setup.js`'s weight-10 `inGoodHalf` check used a real 45–55 band. The two
  // now agree because they read the SAME number: EQ_BAND_PCT is exported on the result, and
  // setup.js's mid-range risk multiplier takes the band from there rather than declaring its own
  // copy that could drift. Ep 15 mistake #3 treats mid-range as a distinct condition deserving a
  // distinct response, which it cannot have while the label never fires.
  const EQ_HALF_PCT = 5;                                  // ±5% around the midpoint = 45–55
  const inDiscount = pos * 100 < 50 - EQ_HALF_PCT;
  const inPremium = pos * 100 > 50 + EQ_HALF_PCT;
  const ote = pos >= 0.62 && pos <= 0.79;  // favourable long continuation zone in an uptrend
  const oteShort = pos >= 0.21 && pos <= 0.38;
  return {
    range_high: r4(rangeHigh), range_low: r4(rangeLow), mid: r4(rangeLow + span / 2),
    span: r4(span), position_pct: r2(pos * 100),
    zone: inPremium ? 'premium' : inDiscount ? 'discount' : 'equilibrium',
    eq_band: [50 - EQ_HALF_PCT, 50 + EQ_HALF_PCT],
    ote: ote || oteShort ? (ote ? 'long' : 'short') : null,
    ote_band: [r4(rangeLow + span * 0.62), r4(rangeLow + span * 0.79)],
    levels: {
      '0': r4(rangeLow), '0.236': r4(rangeLow + span * 0.236), '0.382': r4(rangeLow + span * 0.382),
      '0.5': r4(rangeLow + span * 0.5), '0.618': r4(rangeLow + span * 0.618),
      '0.705': r4(rangeLow + span * 0.705), '0.79': r4(rangeLow + span * 0.79), '1': r4(rangeHigh),
    },
    high_t: recentHi.t, low_t: recentLo.t,
  };
}

/* ═════════════════════════════════════════════════════ 8. CRT (range theory) */

/**
 * Candle Range Theory: pick the right candle (the HTF one), mark its range, wait for
 * a sweep of one side that FAILS TO HOLD, then trade the reversal toward the other side.
 * @param {Array} htfCandles  e.g. daily candles
 * @param {Array} ltfCandles  e.g. 15m candles (used to see the sweep happen)
 */
function crt(htfCandles, ltfCandles, atr) {
  if (!htfCandles || htfCandles.length < 3) return null;
  const n = htfCandles.length;
  const target = htfCandles[n - 1];            // the "right candle" = current HTF candle
  const prevC = htfCandles[n - 2];
  const rangeHigh = target.h, rangeLow = target.l;
  const span = rangeHigh - rangeLow;
  if (!span) return null;
  const openedAt = target.t;
  const inside = (ltfCandles || []).filter((c) => c.t >= openedAt);
  if (inside.length < 3) return null;

  const price = inside[inside.length - 1].c;
  let hi = -Infinity, lo = Infinity, hiAt = null, loAt = null;
  for (const c of inside) {
    if (c.h > hi) { hi = c.h; hiAt = c.t; }
    if (c.l < lo) { lo = c.l; loAt = c.t; }
  }
  const sweptHigh = hi > rangeHigh + (atr || 0) * 0.05;
  const sweptLow = lo < rangeLow - (atr || 0) * 0.05;
  const backInsideHigh = price < rangeHigh;
  const backInsideLow = price > rangeLow;

  let setup = null;
  if (sweptHigh && backInsideHigh && !(sweptLow && backInsideLow)) {
    setup = {
      dir: -1, side: 'short', sweep_level: r4(rangeHigh), sweep_at: hiAt,
      entry: r4((rangeHigh + hi) / 2), stop: r4(hi + (atr || 0) * 0.15),
      target: r4(rangeLow + (atr || 0) * 0.15), target_label: 'opposite side of the CRT range (range low)',
      note: 'Buyside of the HTF range was swept and failed to hold — CRT expects the range low.',
    };
  } else if (sweptLow && backInsideLow && !(sweptHigh && backInsideHigh)) {
    setup = {
      dir: 1, side: 'long', sweep_level: r4(rangeLow), sweep_at: loAt,
      entry: r4((rangeLow + lo) / 2), stop: r4(lo - (atr || 0) * 0.15),
      target: r4(rangeHigh - (atr || 0) * 0.15), target_label: 'opposite side of the CRT range (range high)',
      note: 'Sellside of the HTF range was swept and failed to hold — CRT expects the range high.',
    };
  }
  if (setup) {
    const risk = Math.abs(setup.entry - setup.stop), reward = Math.abs(setup.target - setup.entry);
    setup.risk = r4(risk); setup.reward = r4(reward); setup.rr = risk ? r2(reward / risk) : 0;
    setup.hit_target_side = setup.dir > 0 ? 'range high' : 'range low';
  }

  return {
    htf_candle: { t: target.t, o: r4(target.o), h: r4(target.h), l: r4(target.l), c: r4(target.c), high_low: r2((rangeHigh - rangeLow) / rangeLow * 100) + '%' },
    prev_candle_bias: prevC.c > prevC.o ? 'bullish' : 'bearish',
    range_high: r4(rangeHigh), range_low: r4(rangeLow), mid: r4((rangeHigh + rangeLow) / 2),
    swept_high: sweptHigh, swept_low: sweptLow,
    ltf_high: r4(hi), ltf_low: r4(lo),
    back_inside: r2(((price - rangeLow) / span) * 100),
    position: price > rangeHigh ? 'above range' : price < rangeLow ? 'below range' : 'inside range',
    setup,
    steps: [
      `Right candle: current ${htfCandles === htfCandles ? 'HTF' : ''} candle ${new Date(target.t).toISOString().slice(0, 16)}Z, range ${r4(rangeLow)} – ${r4(rangeHigh)}.`,
      sweptHigh && sweptLow ? 'Both sides swept — messy, stand down until one side is reclaimed.' : sweptHigh ? 'Buyside swept' : sweptLow ? 'Sellside swept' : 'No sweep of the range yet — wait, do not front-run.',
      setup ? `Failure to hold confirmed; trading back to the ${setup.hit_target_side}.` : 'No confirmed failure to hold yet.',
    ],
  };
}

/* ═══════════════════════════════════════════════════════════ 9. KILLZONES */

const SESSIONS = [
  { key: 'sydney', name: 'Sydney', start: 21, end: 6, quality: 0.3 },
  { key: 'tokyo', name: 'Tokyo / Asia', start: 0, end: 7, quality: 0.5 },
  { key: 'london', name: 'London', start: 7, end: 12, quality: 0.85 },
  { key: 'ny_am', name: 'New York AM', start: 12, end: 16, quality: 1.0 },
  { key: 'ny_pm', name: 'New York PM', start: 16, end: 21, quality: 0.6 },
];
/**
 * The windows the curriculum trades hardest, stated in NEW YORK time — which is
 * how the course teaches them (Ep12: "Q zones"). They used to be hardcoded as
 * fixed UTC hours, which silently drifted by an hour every time the US changed
 * clocks, and the three windows had been pinned to different offsets (London to
 * EDT, NY AM to EST) so they could never all be right at once. Defining them in
 * ET and converting at call time makes them correct year-round.
 *
 *   London       02:00–05:00 ET   EUR, GBP
 *   New York AM  07:00–10:00 ET   USD pairs
 *   London close 10:00–12:00 ET   USD pair retracements
 */
/* M38 / M40 — he names FOUR killzones and assigns pairs to each; this array had three and no
 * Asia, so `in_killzone` could never be true in the one window he gives to AUD, NZD and JPY
 * pairs (20:00-00:00 ET). Asia is added at a LOWER quality (0.5): his own caveat is that it is
 * not where "the big explosive move on the USD pairs" happens, so it must not score like London.
 * `pairs` is M40's mapping — the currencies that actually move in each window. A window with no
 * `pairs` entry counts for every instrument, which is how the pre-existing three behave. */
const SILVER_BULLETS = [
  { name: 'Asia killzone', startH: 20, startM: 0, endH: 24, endM: 0, quality: 0.5, restricted: true, pairs: ['AUD', 'NZD', 'JPY'] },
  { name: 'London killzone', startH: 2, startM: 0, endH: 5, endM: 0, quality: 1.0, pairs: ['EUR', 'GBP'] },
  { name: 'NY AM killzone', startH: 7, startM: 0, endH: 10, endM: 0, quality: 1.0, pairs: ['USD'] },
  { name: 'NY PM killzone', startH: 10, startM: 0, endH: 12, endM: 0, quality: 0.7, pairs: ['USD'] },
];

/** Minutes since midnight in New York, DST handled by the IANA database. */
function nyMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => Number((parts.find((p) => p.type === t) || {}).value || 0);
  return get('hour') * 60 + get('minute');
}

/** The same window rendered back in UTC, so the UI label is still truthful. */
function utcLabel(date, startMins, endMins) {
  const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  // nyMinutes(base) is New York's own midnight, expressed in minutes-past-UTC-midnight.
  const nyOffset = nyMinutes(new Date(base)) ;
  const fmt = (m) => new Date(base + (m - nyOffset) * 60000).toISOString().slice(11, 16);
  return `${fmt(startMins)}–${fmt(endMins)} UTC`;
}

function sessionState(date = new Date()) {
  const h = date.getUTCHours(), m = date.getUTCMinutes();
  const mins = h * 60 + m;
  const inWindow = (s, e) => (e > s ? mins >= s && mins < e : mins >= s || mins < e);
  const sessions = SESSIONS.map((s) => ({ ...s, active: inWindow(s.start * 60, s.end * 60), window: `${String(s.start).padStart(2, '0')}:00–${String(s.end).padStart(2, '0')}:00 UTC` }));
  const active = sessions.filter((s) => s.active);
  const open = sessions[0];
  const nextIdx = (sessions.findIndex((s) => s.active) + 1) % sessions.length;
  const nyMins = nyMinutes(date);
  const inWindowNY = (s, e) => (e > s ? nyMins >= s && nyMins < e : nyMins >= s || nyMins < e);
  const bullets = SILVER_BULLETS.map((b) => {
    const s = b.startH * 60 + b.startM, e = b.endH * 60 + b.endM;
    const open_ = inWindowNY(s, e);
    const until = (e - nyMins + 1440) % 1440;
    const et = `${String(b.startH).padStart(2, '0')}:${String(b.startM).padStart(2, '0')}–${String(b.endH).padStart(2, '0')}:${String(b.endM).padStart(2, '0')} ET`;
    return { name: b.name, window: `${et} (${utcLabel(date, s, e)})`, window_et: et, active: open_, minutes_to_end: open_ ? until : null, minutes_to_start: open_ ? 0 : ((s - nyMins + 1440) % 1440), quality: b.quality, pairs: b.pairs || null, restricted: !!b.restricted };
  });
  const activeBullet = bullets.find((b) => b.active) || null;
  return {
    now_utc: date.toISOString().slice(0, 16) + 'Z',
    // M10 — Ep 19's stand-down is a CALENDAR rule, so the calendar has to be visible to
    // the layer that grades. Previously `date` was consumed inside this function to compute
    // New York minutes and then thrown away, so nothing downstream could tell Monday from
    // Tuesday. UTC is used deliberately: the candles are stamped UTC and a session-day
    // boundary drawn in New York would disagree with the bar it is filtering.
    dow: date.getUTCDay(),
    day_name: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getUTCDay()],
    month: date.getUTCMonth() + 1,
    active: active.length ? active.map((s) => s.name).join(' + ') : 'Between sessions',
    sessions, bullets,
    in_killzone: !!activeBullet,
    killzone: activeBullet ? activeBullet.name : null,
    quality: active ? Math.max(...active.map((s) => s.quality)) : 0.3,
    best_time: !activeBullet ? `Next high-quality window: ${bullets.filter((b) => b.minutes_to_start > 0).sort((a, b) => a.minutes_to_start - b.minutes_to_start)[0].name}` : null,
    note: activeBullet ? `${activeBullet.name} — highest-probability window for the entry models.` : 'Outside the killzones: entries here have materially lower odds. Wait for London (07:00) or the NY overlap (12:00 UTC).',
    open_session: open.name,
    next_session: { name: sessions[nextIdx].name, starts: sessions[nextIdx].window },
  };
}

/* ── M40 — pair-per-session affinity ───────────────────────────────────────────
 * *"Don't try to trade every pair in every session… make sure that you combine the
 * currency pairs that you are trading with the right time."* His reason: *"if you are
 * trading EURUSD, you cannot expect to get the same volatility in Asia session as you
 * do in London session."* The code applied one session quality to every symbol, so
 * EURUSD and AUDNZD scored identically inside the Asia window where he says only the
 * latter belongs.
 *
 * Returns `sessions` untouched when the active window counts for this instrument, and a
 * copy that reads EXACTLY like the true outside-state when it does not: in_killzone
 * false, killzone null, the outside note. Mirroring the outside-state rather than
 * zeroing one field is the point — setup.js vetoes on `in_killzone === false` and
 * momentum's session factor reads `quality`, so a half-adjusted object would let a pair
 * keep the veto-free benefit of a window it does not belong to while losing only the
 * points. Adding Asia without this would have LOOSENED the gate for EURUSD at 02:00 UTC,
 * the opposite of his instruction.
 *
 * Two exemptions, both deliberate. An instrument whose legs are not all in the named
 * currency set (XAUUSD, BTCUSDT — XAU and BTC appear in no session list of his) is
 * ungoverned: absence of a statement is not a prohibition. And a window with no `pairs`
 * counts for everyone, which preserves the pre-M38 behaviour of any bullet this table
 * does not describe. */
const NAMED_SESSION_CURRENCIES = ['AUD', 'NZD', 'JPY', 'EUR', 'GBP', 'USD'];
function sessionAffinity(symbol, sessions) {
  const ses = sessions || {};
  if (!ses.in_killzone) return ses;
  const bullet = (ses.bullets || []).find((x) => x.active) || null;
  const pairs = bullet && bullet.pairs;
  if (!pairs || !pairs.length) return ses;
  /* Symbols carry no separator ('EURUSD', 'XAUUSD', 'BTCUSDT'), so legs are taken
   * positionally: first three characters against the remainder. Splitting on
   * non-letters yields ONE leg for every symbol and silently disables the whole map. */
  const base = String(symbol || '').toUpperCase().replace(/[^A-Z]/g, '');
  const legs = base.length >= 6 ? [base.slice(0, 3), base.slice(3)] : (base ? [base] : []);
  const match = legs.some((l) => pairs.indexOf(l) !== -1);
  /* A RESTRICTED window exists only for its pairs: Asia was added BY this fix for AUD, NZD
   * and JPY, so for every other instrument it must not exist at all — admitting XAUUSD or
   * BTCUSDT into it would loosen their gate at 02:00 UTC, the exact opposite of the intent.
   * An UNRESTRICTED window (London, NY) existed for everyone before M38 and still does; its
   * pairs list is M40's affinity guidance and governs only the named FX pairs, because he
   * never placed gold or crypto in any session and absence of a statement is not a rule. */
  if (bullet.restricted) { if (match) return ses; }
  else {
    if (legs.length !== 2 || legs.some((l) => NAMED_SESSION_CURRENCIES.indexOf(l) === -1)) return ses;
    if (match) return ses;
  }
  /* Which window opens next FOR THIS INSTRUMENT. An ungoverned one (gold, crypto — a leg
   * outside his named set) is welcome in every window, so it must not be filtered by the
   * pair lists at all; filtering it left BTCUSDT with no next window whatsoever. */
  const governed = legs.length === 2 && legs.every((l) => NAMED_SESSION_CURRENCIES.indexOf(l) !== -1);
  const counts = (x) => !x.pairs || !x.pairs.length || (x.restricted ? false : !governed) || legs.some((l) => x.pairs.indexOf(l) !== -1);
  const nxt = (ses.bullets || []).filter((x) => x.minutes_to_start > 0 && counts(x))
    .sort((x, y) => x.minutes_to_start - y.minutes_to_start)[0];
  /* Mirror the GENUINE outside-state, not just the two flags momentum and setup read.
   * sessionState's real outside branch sets `quality` to the best active SESSION quality
   * (0.3 when none is active) and momentum scores `quality * 6` — leaving the bullet's own
   * quality in place would keep paying session credit to a pair this window does not want. */
  const actSes = (ses.sessions || []).filter((x) => x.active);
  const outsideQ = actSes.length ? Math.max.apply(null, actSes.map((x) => x.quality || 0)) : 0.3;
  return Object.assign({}, ses, {
    in_killzone: false, killzone: null, quality: outsideQ, affinity_outside: bullet.name,
    best_time: nxt ? `Next window for this pair: ${nxt.name}` : ses.best_time,
    note: `${bullet.name} is not this instrument's window — ${String(symbol || '').toUpperCase()} scores as if outside the killzones. `,
  });
}

/* ═══════════════════════════════════════════════════════ ANALYSE (bundle) */

/**
 * Run the full mechanics pass on one series.
 * @returns {{swings, structure, displacement, order_blocks, fvgs, breakers, liquidity, sweeps, premium_discount, crt, atr, price}}
 */
// `now` pins the killzone clock. Without it the session state is taken from the wall clock,
// which makes every downstream number time-of-day dependent — `setup.js` multiplies the score
// by (0.82 + 0.18 * sessions.quality), so the same candles grade differently at 07:00 UTC
// (London, quality 0.85) than at 02:00 UTC. Live callers should leave it null; backtests and
// tests must set it, or their baselines are not reproducible.
function analyse(candles, { tf = '15m', htfCandles = null, now = null,
  // M1 and M22 are DEFAULTS as of the user's decision (see analysis/harness/BASELINE.txt).
  // Re-measured against Baseline 4 at two sample sizes, each improves every metric and
  // together they were the best configuration measured in this audit: expectancy -0.2891R ->
  // -0.0935R, profit factor 0.53 -> 0.85, and A+ turns positive. Pass swingMode:'local' or
  // nested:false to get the old behaviour back.
  swingMode = 'bos', nested = true,
  // M32 stays OPT-IN by the same decision: it cuts trades 190 -> 18, and the headline A+
  // figure rested on three trades.
  obRequiresFvg = false, allSwings = false } = {}) {
  const out = { ok: false, tf };
  if (!candles || candles.length < 30) { out.note = 'Not enough candles for structure analysis (need 30+).'; return out; }
  const closed = candles.slice(0, -1);
  const atr = I.atr(closed.length > 20 ? closed : candles, 14) || 0;

  // M1: the minor tier is what feeds `structure`, and therefore the trend label the setup
  // checklist scores against. swingMode 'bos' substitutes the course's definition; see
  // bosSwings() for the measurement that keeps it off by default.
  const minorRaw = alternate(findSwings(candles, 2));
  const minorSwings = swingMode === 'bos' ? bosSwings(candles, minorRaw) : minorRaw;
  const majorSwings = alternate(findSwings(candles, 5));
  // M22 - Ep 5 sequences this: "the first step is to always identify your swing range", and
  // "the only way you can identify your internal structure is if you have identified your
  // swing structure and your swing range." The two tiers are computed in parallel today, so the
  // internal read runs over swings belonging to legs that have already resolved.
  // MEASURED (analysis/probe-m22-nested-range.js, 40 series x 300 bars): 56% of minor swings
  // sit outside the range the major tier defines, structure events halve (17.4 -> 8.4 per
  // series), and the internal trend label changes on 20% of series. Material, but smaller than
  // M1's 63% - and the range itself is unstable: its width runs 0.18% to 21% of price across
  // the same sample, a 100x spread, because it is just the most recent major high and low.
  // Bounding by something that unstable makes the internal read erratic, so this is opt-in and
  // OFF by default. Adopting it needs a decision, not a default flip.
  const nestedSwings = nested && majorSwings.length >= 2 ? (() => {
    const mh = majorSwings.filter((x) => x.type === 'high').slice(-1)[0];
    const ml = majorSwings.filter((x) => x.type === 'low').slice(-1)[0];
    if (!mh || !ml || !(mh.price > ml.price)) return minorSwings;
    const kept = minorSwings.filter((x) => x.price <= mh.price && x.price >= ml.price);
    // Fewer than 3 swings cannot label a trend; fall back rather than silently blanking it.
    return kept.length >= 3 ? kept : minorSwings;
  })() : minorSwings;
  const structure = marketStructure(candles, nestedSwings);
  const htfStructure = majorSwings.length ? marketStructure(candles, majorSwings) : null;
  const displacement = findDisplacement(candles, atr);
  // M32: FVGs are computed FIRST now, because an order block is only valid if the leg that
  // created it left an imbalance. The order was the other way round, which is part of why the
  // prerequisite could not be enforced.
  const fvgs = findFvgs(candles, atr);
  const orderBlocks = findOrderBlocks(candles, atr, displacement, structure.breaks,
    { fvgs, requireFvg: obRequiresFvg });
  const breakers = findBreakers(orderBlocks, candles, atr, structure.breaks);
  const liq = liquidity(candles, majorSwings.length ? majorSwings : minorSwings, atr, { tf, allSwings });
  const sweeps = findSweeps(candles, liq.pools, atr);
  const pd = premiumDiscount(candles, majorSwings.length ? majorSwings : minorSwings);
  const crtRes = htfCandles ? crt(htfCandles, candles, atr) : null;

  // mark sweeps on the pool objects + flag MSS breaks
  for (const s of sweeps) {
    const pool = liq.pools.find((p) => p.kind === s.pool && Math.abs(p.price - s.level) < 1e-9);
    if (pool) { pool.swept = true; pool.swept_t = s.t; }
  }
  // M23: decide MSS from the actual sweep test, for every break — not just the last one, and
  // in both directions. `structure.breaks` is the live array the caller sees, so patching it
  // in place is enough there; `last_break` is a copy built inside marketStructure() and has
  // to be updated separately.
  const breaks = structure.breaks || [];
  const barIndexOfSweep = (sw) => candles.length - 1 - (sw.bars_ago || 0);
  for (const e of breaks) {
    if (e.type !== 'CHoCH') { e.mss = false; continue; }
    const sw = sweeps.find((x) => Math.abs(barIndexOfSweep(x) - e.i) <= 6);
    e.mss = !!sw;
    if (sw) e.swept = sw.pool_label; else delete e.swept;
  }
  if (structure.last_break) {
    const lb = breaks[breaks.length - 1];
    structure.last_break.mss = !!(lb && lb.mss);
    if (lb && lb.swept) structure.last_break.swept = lb.swept;
    else delete structure.last_break.swept;
  }
  // inducement: a minor pool sitting between price and a major pool, on the way to it
  const big = liq.pools.filter((p) => p.strength >= 0.8 && !p.swept);
  const small = liq.pools.filter((p) => p.strength < 0.8 && !p.swept);
  const inducement = [];
  for (const m of big) {
    for (const s of small) {
      if (s.side !== m.side) continue;
      const closer = s.distance_pct < m.distance_pct;
      if (closer && m.distance_pct - s.distance_pct < 1.2) {
        inducement.push({ target: m.label, target_price: m.price, inducement: s.label, inducement_price: s.price, note: `Retail stops sit at the ${s.label.toLowerCase()} — expect a poke there before the run to the ${m.label.toLowerCase()}.` });
        break;
      }
    }
  }

  const price = candles[candles.length - 1].c;
  out.ok = true;
  out.price = r4(price);
  out.atr = r4(atr);
  // M22: report the tier `structure` was actually built from, not the raw minor tier. Without
  // this the output would claim swings the internal read never saw whenever nested is on.
  out.swings = { minor: nestedSwings.slice(-14), major: majorSwings.slice(-10),
    nested: nested && nestedSwings !== minorSwings };
  out.structure = structure;
  out.htf_structure = htfStructure ? { trend: htfStructure.trend, last_break: htfStructure.last_break, recent_labels: htfStructure.recent_labels } : null;
  out.displacement = displacement.slice(-8).reverse();
  out.order_blocks = orderBlocks;
  out.fvgs = fvgs;
  out.breakers = breakers.slice(0, 6);
  out.liquidity = liq;
  out.sweeps = sweeps;
  out.premium_discount = pd;
  out.crt = crtRes;
  out.sessions = sessionState(now ? new Date(now) : new Date());
  out.inducement = inducement.slice(0, 4);
  out.counts = {
    swings: nestedSwings.length, breaks: structure.breaks.length, displacement: displacement.length,
    order_blocks: orderBlocks.filter((z) => !z.breached).length, fvgs: fvgs.filter((g) => !g.filled).length,
    sweeps: sweeps.length, pools: liq.pools.length,
  };
  return out;
}

module.exports = {
  findSwings, alternate, bosSwings, marketStructure, findDisplacement, findOrderBlocks, findFvgs, findBreakers,
  liquidity, findSweeps, premiumDiscount, crt, sessionState, analyse, clusterLevels,
  SESSIONS, SILVER_BULLETS, dayKey, weekKey, sessionAffinity,
};
