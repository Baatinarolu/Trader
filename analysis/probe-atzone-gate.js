'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
 * Ep 11 gate measurement — corrected accessors.
 *
 * Brad Goh, Ep 11 (Top Down Analysis Strategy):
 *   "you only go down to the lower time frame ONCE price have touched your
 *    medium time frame point of interest. This prevents you from trading when
 *    price is in the middle of nowhere."
 *   "maybe I would like to set an alert right here at the edge of the zone,
 *    and then I just wait."
 *
 * Setup.buildSetups() derives levels.entry_status in setup.js:220-238:
 *   invalid    price already beyond the zone  -> score capped 20, ok:false
 *   at-entry   price inside the zone          -> "the retest is happening now"
 *   approaching within 1.5 ATR                -> "waiting for the retrace"
 *   waiting    beyond 1.5 ATR                 -> score capped 66, "do not chase;
 *                                                set an alert at ..."
 *
 * This probe measures which of those states real calls actually land in, and
 * whether any candidate comes back ok:true while 'waiting'.
 *
 * Data is a synthetic but internally-consistent OHLC random walk (open = prev
 * close, high/low bracket the body by a random wick). Synthetic on purpose: no
 * fixture CSVs survive in this workspace. The claim under test is about code
 * behaviour, not about any real market.
 * ─────────────────────────────────────────────────────────────────────────── */
const path = require('path');
const BASE = path.resolve(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(BASE, 'src', 'bots', 'smc.js'));
const Setup = require(path.join(BASE, 'src', 'bots', 'setup.js'));

let seed = 20261008;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function walk(n, start, drift, vol) {
  const out = [];
  let p = start, t = Date.UTC(2024, 0, 2);
  for (let i = 0; i < n; i++) {
    const o = p;
    const step = (rnd() - 0.5 + drift) * vol;
    const c = Math.max(0.0001, o + step);
    const w = Math.abs(step) * (0.4 + rnd());
    out.push({ t, o: +o.toFixed(5), h: +Math.max(o, c, o + w).toFixed(5), l: +Math.min(o, c, o - w).toFixed(5), c: +c.toFixed(5), v: 1000 });
    p = c; t += 15 * 60e3;
  }
  return out;
}

const tally = {};
let candidates = 0, withLevels = 0, okTrue = 0, okTrueWaiting = 0, cappedWaiting = 0;
const gradesByStatus = {};

for (let run = 0; run < 300; run++) {
  const drift = (run % 3 - 1) * 0.06;
  const candles = walk(600, 1.08 + (run % 7) * 0.002, drift, 0.0018);
  let a;
  try { a = SMC.analyse(candles, { tf: '15m' }); } catch (e) { continue; }
  const r = Setup.buildSetups(a, {
    price: a.price, atr: a.atr, bias: 0, balance: 10000, riskPct: 1,
    valuePerPoint: 100000, assetClass: 'forex', symbol: 'EURUSD', minRR: 2,
  });
  for (const c of (r.candidates || [])) {
    candidates++;
    const L = c.levels;
    if (!L || !L.entry_status) continue;
    withLevels++;
    const st = L.entry_status;
    tally[st] = (tally[st] || 0) + 1;
    (gradesByStatus[st] = gradesByStatus[st] || {})[c.grade] = (gradesByStatus[st][c.grade] || 0) + 1;
    if (c.ok) {
      okTrue++;
      if (st === 'waiting') okTrueWaiting++;
    }
    if (st === 'waiting' && c.score > 66) cappedWaiting++;
  }
}

console.log('=== Ep 11 "price must be at the medium-TF POI" gate — SYNTHETIC OHLC walk ===');
console.log(`candidates returned                 : ${candidates}`);
console.log(`candidates with a priced zone+levels: ${withLevels}`);
console.log(`of those, ok:true                   : ${okTrue}`);
console.log('\nentry_status distribution:');
for (const k of ['at-entry', 'approaching', 'waiting', 'invalid']) {
  if (!tally[k]) continue;
  const g = gradesByStatus[k] || {};
  console.log(`  ${k.padEnd(12)} ${String(tally[k]).padStart(4)}  grades: ${Object.entries(g).map(([a, b]) => `${a}=${b}`).join(' ')}`);
}
console.log(`\nok:true WHILE entry_status==='waiting' : ${okTrueWaiting}   <- the number that would falsify the gate`);
console.log(`'waiting' candidates scoring above 66   : ${cappedWaiting}  <- the cap at setup.js:284`);
