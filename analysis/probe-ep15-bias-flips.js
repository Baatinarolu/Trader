'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
 * Ep 15 — Daily Bias: how often does the derived bias change, and does the
 * code's own invalidation level gate that change?
 *
 * Brad Goh, Ep 15, mistake #4: "changing bias after every single candlestick…
 * your bias ONLY CHANGE WHEN YOUR INVALIDATION IS HIT." And step 5: "if my bias
 * is invalidated, I RESET my bias."
 *
 * grep -rn 'bias' src/bots/index.js | grep -i 'prev|last|store|persist|history|cache'
 * returns nothing -- bias is re-derived from scratch on every call, so there is
 * no hysteresis. The invalidation level EXISTS (setup.js:262-264, "A 15m close
 * below X invalidates the idea") but nothing feeds it back as the gate.
 *
 * This probe rolls a window over a synthetic series, resamples to 1h/15m/5m, and
 * calls the REAL Momentum.alignment() at every step. It counts:
 *   (a) how often align.bias changes sign candle-to-candle, and
 *   (b) of those flips, how many were preceded by a genuine invalidating close
 *       beyond the range extreme of the window that produced the old bias.
 * Synthetic OHLC on purpose (no fixture CSVs survive in this workspace).
 * ─────────────────────────────────────────────────────────────────────────── */
const path = require('path');
const BASE = path.resolve(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(BASE, 'src', 'bots', 'smc.js'));
const MOM = require(path.join(BASE, 'src', 'bots', 'momentum.js'));

let seed = 20261007;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// Drift is PIECEWISE and alternates sign every `regime` candles. A constant drift
// would leave the 1h structure permanently one-sided and the probe would count
// zero flips while measuring nothing -- that was the first version's flaw.
function walk(n, start, amp, vol, regime) {
  const out = []; let p = start, t = Date.UTC(2024, 0, 2);
  for (let i = 0; i < n; i++) {
    const drift = (Math.floor(i / regime) % 2 === 0 ? 1 : -1) * amp;
    const o = p, step = (rnd() - 0.5 + drift) * vol;
    const c = Math.max(0.0001, o + step), w = Math.abs(step) * (0.4 + rnd());
    out.push({ t, o: +o.toFixed(5), h: +Math.max(o, c, o + w).toFixed(5), l: +Math.min(o, c, o - w).toFixed(5), c: +c.toFixed(5), v: 1000 });
    p = c; t += 5 * 60e3;   // 5m base
  }
  return out;
}

/** OHLC resample by integer bucket size. */
function resample(candles, bucket) {
  const out = [];
  for (let i = 0; i + bucket <= candles.length; i += bucket) {
    const b = candles.slice(i, i + bucket);
    out.push({
      t: b[0].t, o: b[0].o, c: b[b.length - 1].c,
      h: Math.max(...b.map((x) => x.h)), l: Math.min(...b.map((x) => x.l)), v: 1000,
    });
  }
  return out;
}

function mkSeries(candles, tf) {
  const smc = SMC.analyse(candles, { tf });
  return { tf, candles, smc, atr: smc.atr, price: candles[candles.length - 1].c, ind: null };
}

// The window fed to each timeframe must yield ~300 candles AT THAT timeframe,
// or findSwings(candles, 5) never produces a decisive structure and align.bias is
// permanently 0. The first version used a 300-candle 5m base, which resamples to
// only 25 x 1h candles -- every step returned bias 0 and the probe measured
// nothing. 1h needs 300 candles => 3600 x 5m candles per window.
const LTF_N = 300, BUCKET_M = 3, BUCKET_H = 12;
const WIN = LTF_N * BUCKET_H;   // 3600 x 5m candles
let steps = 0, flips = 0, flipWithInvalidation = 0, flipWithout = 0;
const runs = [];

for (let run = 0; run < 12; run++) {
  const amp = 0.04 + (run % 4) * 0.02;      // regime strength
  const regime = 500 + (run % 3) * 400;     // 5m candles per regime (~42h - ~62h)
  const base = walk(5400, 1.08 + (run % 5) * 0.003, amp, 0.0012, regime);
  let prevBias = null, prevRangeHigh = null, prevRangeLow = null;
  let rFlips = 0, rValid = 0;

  for (let end = WIN; end <= base.length; end += 6) {
    const win = base.slice(end - WIN, end);
    const ltf = mkSeries(win.slice(-LTF_N), '5m');
    const mtf = mkSeries(resample(win, BUCKET_M).slice(-LTF_N), '15m');
    const htf = mkSeries(resample(win, BUCKET_H).slice(-LTF_N), '1h');
    let align;
    try { align = MOM.alignment(htf, mtf, ltf, null); } catch (e) { continue; }
    steps++;
    const bias = align.bias;
    const pd = mtf.smc.premium_discount;
    const rh = pd ? pd.range_high : null, rl = pd ? pd.range_low : null;

    if (prevBias !== null && bias !== 0 && prevBias !== 0 && Math.sign(bias) !== Math.sign(prevBias)) {
      flips++; rFlips++;
      // his invalidation: a CLOSE beyond the key level of the range that produced
      // the OLD bias (not a wick, not a mere structure relabel)
      const c = win[win.length - 1].c;
      const broke = prevBias > 0
        ? (prevRangeLow !== null && c < prevRangeLow)
        : (prevRangeHigh !== null && c > prevRangeHigh);
      if (broke) { flipWithInvalidation++; rValid++; } else { flipWithout++; }
    }
    prevBias = bias; prevRangeHigh = rh; prevRangeLow = rl;
  }
  runs.push({ rFlips, rValid });
}

const pct = (x) => (flips ? ((x / flips) * 100).toFixed(1) + '%' : 'n/a');
console.log('=== Ep 15: bias flips vs his "only change on invalidation" rule ===');
console.log(`alignment() calls                       : ${steps}  (${runs.length} runs x ${WIN}-candle window)`);
console.log(`sign flips of align.bias candle-to-candle: ${flips}`);
console.log(`  flips WITH an invalidating close      : ${flipWithInvalidation}  (${pct(flipWithInvalidation)})`);
console.log(`  flips WITHOUT one                     : ${flipWithout}  (${pct(flipWithout)})   <- his mistake #4`);
console.log(`flips per 100 candles                   : ${(flips / steps * 100).toFixed(2)}`);
console.log('\nHis rule: "your bias only change when your invalidation is hit."');
console.log('The invalidation level exists in the code (setup.js:262-264) but nothing');
console.log('feeds it back -- there is no bias state to gate.');
