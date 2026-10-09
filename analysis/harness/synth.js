'use strict';
/**
 * SYNTHETIC OHLC GENERATOR — for the independent backtest harness.
 *
 * ⚠ THIS IS NOT MARKET DATA. Every series produced here is generated from a seeded
 * PRNG. Nothing in this file fetches, caches or approximates real prices. Any
 * expectancy figure derived from it measures the INTERNAL CONSISTENCY of the entry /
 * stop / target logic — whether the method is profitable on data that contains the
 * structure it claims to exploit — and says nothing about real-market edge.
 *
 * The generator is deliberately structured rather than a pure random walk, because a
 * random walk has no liquidity to sweep and no zones to mitigate, so the method under
 * test would have nothing to detect:
 *
 *   · regime switching between trend-up, trend-down and range
 *   · volatility clustering (GARCH-like: today's step scales yesterday's)
 *   · deliberate liquidity sweeps — a spike through the recent swing extreme that is
 *     then reversed, which is the trigger the method keys on
 *   · displacement legs (a run of same-direction bars) that create order blocks / FVGs
 */

/** Deterministic PRNG (mulberry32). Same seed → same series, byte for byte. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximate standard normal via the sum of uniforms (good enough for shape). */
function normal(rand) {
  return (rand() + rand() + rand() + rand() + rand() + rand() - 3) / 1.5;
}

/**
 * @param {object} o
 * @param {number} o.seed        PRNG seed
 * @param {number} o.bars        how many 15m bars
 * @param {number} o.start       opening price
 * @param {number} o.baseVol     per-bar base move, in price units
 * @param {number} o.trendBias   extra drift applied inside a trending regime
 * @param {number} o.sweepEvery  approx. bars between deliberate liquidity sweeps
 * @returns {Array<{t:number,o:number,h:number,l:number,c:number,v:number}>}
 */
function series({ seed = 1, bars = 1500, start = 1.1000, baseVol = 0.0012, trendBias = 0.35, sweepEvery = 55 } = {}) {
  const rand = rng(seed);
  const out = [];
  const t0 = Date.UTC(2024, 0, 1, 0, 0, 0);
  const STEP = 15 * 60 * 1000;

  let price = start;
  let vol = baseVol;
  let regime = 'range';
  let regimeLeft = 40;

  for (let i = 0; i < bars; i++) {
    if (regimeLeft <= 0) {
      const r = rand();
      regime = r < 0.34 ? 'up' : r < 0.68 ? 'down' : 'range';
      regimeLeft = 30 + Math.floor(rand() * 90);
    }
    regimeLeft--;

    // volatility clustering
    vol = baseVol * (0.55 + 0.9 * (vol / baseVol) * 0.5 + 0.35 * rand());
    vol = Math.max(baseVol * 0.35, Math.min(baseVol * 2.6, vol));

    let drift = 0;
    if (regime === 'up') drift = trendBias * vol;
    else if (regime === 'down') drift = -trendBias * vol;

    const o = price;
    let c = o + drift + normal(rand) * vol;

    // deliberate liquidity sweep: spike past the recent extreme, then reverse
    const sweepDue = i > 20 && (i % sweepEvery) === Math.floor(rand() * 3);
    let wick = Math.abs(normal(rand)) * vol * 0.8;
    if (sweepDue) wick = vol * (2.2 + rand() * 2.0);

    let h = Math.max(o, c) + wick;
    let l = Math.min(o, c) - Math.abs(normal(rand)) * vol * 0.8;

    // a sweep that gets bought/sold back closes back inside the prior range
    if (sweepDue) {
      if (rand() < 0.5) { h = Math.max(o, c) + vol * (2.0 + rand() * 1.6); c = o - drift * 0.5; }
      else { l = Math.min(o, c) - vol * (2.0 + rand() * 1.6); c = o - drift * 0.5; }
    }

    // displacement leg: force a run of same-direction bars so OBs / FVGs form
    if (regime !== 'range' && (i % 9) < 3) {
      c = o + (regime === 'up' ? 1 : -1) * vol * (1.4 + rand());
      h = Math.max(o, c) + wick * 0.4;
      l = Math.min(o, c) - wick * 0.4;
    }

    if (h < Math.max(o, c)) h = Math.max(o, c);
    if (l > Math.min(o, c)) l = Math.min(o, c);

    out.push({ t: t0 + i * STEP, o: r6(o), h: r6(h), l: r6(l), c: r6(c), v: 800 + Math.floor(rand() * 900) });
    price = c;
  }
  return out;
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;

/** Higher-timeframe series by simple 4-bar aggregation of a 15m series (1h). */
function aggregate(candles, factor = 4) {
  const out = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const g = candles.slice(i, i + factor);
    out.push({
      t: g[0].t,
      o: g[0].o,
      c: g[g.length - 1].c,
      h: Math.max.apply(null, g.map((b) => b.h)),
      l: Math.min.apply(null, g.map((b) => b.l)),
      v: g.reduce((s, b) => s + b.v, 0),
    });
  }
  return out;
}

module.exports = { series, aggregate, rng, SYNTHETIC: true };
