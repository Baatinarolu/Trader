'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
 * Ep 20 — Stop placement: nearer vs further of (zone edge, sweep extreme).
 *
 * Brad Goh, Ep 20, gives the rule explicitly:
 *   "if there is a protected high, place it right there. If there is no
 *    protected high, place it at either the nearest protected high that was
 *    formed in the past OR a few pips above a supply zone if you're selling...
 *    WHICHEVER ONE THAT IS NEARER... whichever one that offers you a BETTER
 *    RISK-TO-REWARD RATIO."
 * And he gives the reason for preferring the zone: "if I place it a few pips
 * above this supply zone, this will give me a much better risk-to-reward ratio
 * compared to placing it above this protected high. So that is where I will go
 * to the [latter] option."
 *
 * setup.js:174 does the opposite:
 *   const stopBase = long
 *     ? Math.min(zone.bottom, recentSweep ? recentSweep.extreme : zone.bottom)
 *     : Math.max(zone.top,    recentSweep ? recentSweep.extreme : zone.top);
 * Math.min for longs / Math.max for shorts selects the FURTHER of the two,
 * i.e. the wider stop and the worse R:R.
 *
 * This probe runs the real SMC.analyse -> Setup.buildSetups and, for every
 * candidate that has both a zone and a recent sweep, reports how often the two
 * candidates differ, by how much, and what it does to R:R.
 * Synthetic OHLC on purpose (no fixture CSVs survive in this workspace).
 * ─────────────────────────────────────────────────────────────────────────── */
const path = require('path');
const BASE = path.resolve(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(BASE, 'src', 'bots', 'smc.js'));
const SETUP = require(path.join(BASE, 'src', 'bots', 'setup.js'));

let seed = 5551212;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function walk(n, start, amp, vol, regime) {
  const out = []; let p = start, t = Date.UTC(2024, 0, 2);
  for (let i = 0; i < n; i++) {
    const drift = (Math.floor(i / regime) % 2 === 0 ? 1 : -1) * amp;
    const o = p, step = (rnd() - 0.5 + drift) * vol;
    const c = Math.max(0.0001, o + step), w = Math.abs(step) * (0.4 + rnd());
    out.push({ t, o: +o.toFixed(5), h: +Math.max(o, c, o + w).toFixed(5), l: +Math.min(o, c, o - w).toFixed(5), c: +c.toFixed(5), v: 1000 });
    p = c; t += 15 * 60e3;
  }
  return out;
}

let cand = 0, withZone = 0, withSweep = 0, differ = 0, excluded = 0;
const extraRiskAtr = [];   // how much wider the code's stop is than the nearer option
const rrLoss = [];         // R:R the code reports vs R:R the nearer stop would give

for (let run = 0; run < 40; run++) {
  const amp = 0.04 + (run % 4) * 0.02;
  const regime = 90 + (run % 3) * 50;
  const candles = walk(600, 1.08 + (run % 6) * 0.003, amp, 0.0016, regime);
  let a;
  try { a = SMC.analyse(candles, { tf: '15m' }); } catch (e) { continue; }
  const atr = a.atr || 0.001;
  const price = candles[candles.length - 1].c;
  let built;
  try {
    built = SETUP.buildSetups(a, {
      price, atr, bias: 0, biasReason: '', indicators: null, momentum: null,
      balance: 10000, riskPct: 1, valuePerPoint: 10, assetClass: 'forex',
      symbol: 'EURUSD', newsBlackout: null, minRR: 2, maxRiskPct: 2,
    });
  } catch (e) { continue; }

  const arr = (built && built.candidates) || [];
  for (const s of arr) {
    cand++;
    const L = s && s.levels;
    if (!L) continue;
    withZone++;
    // re-derive the two candidate stop bases the way setup.js does
    // VERIFIED against the real output: `dir` is +1/-1 and `side` is 'buy'/'sell'
    // (NOT 'demand'/'supply' -- the first version of this probe assumed the latter
    // and therefore treated every candidate as a short, inverting the result).
    const long = s.dir === 1;
    // setup.js:95 filters sweeps on s.dir === dir (same sign), not the opposite.
    const sweeps = ((a.sweeps) || []).filter((x) => x.dir === (long ? 1 : -1));
    const recentSweep = sweeps.find((x) => x.bars_ago <= 25) || null;
    if (!recentSweep) continue;
    withSweep++;
    const [zLo, zHi] = L.entry_zone;
    const nearer = long ? Math.max(zLo, recentSweep.extreme) : Math.min(zHi, recentSweep.extreme);
    const further = long ? Math.min(zLo, recentSweep.extreme) : Math.max(zHi, recentSweep.extreme);
    if (Math.abs(nearer - further) < 1e-12) continue;
    // A stop base must sit on the correct side of the entry, or it is not a stop
    // at all. Without this guard a sweep extreme above a long entry produces a
    // meaningless "risk" and flips the sign of the measurement -- which is
    // exactly what the earlier run produced (mean -2.94 ATR, max +6.36 ATR).
    const valid = long
      ? (nearer < L.entry && further < L.entry)
      : (nearer > L.entry && further > L.entry);
    if (!valid) { excluded++; continue; }
    differ++;
    const riskFurther = Math.abs(L.entry - further);
    const riskNearer = Math.abs(L.entry - nearer);
    if (riskNearer > 1e-9 && riskFurther > 1e-9) {
      extraRiskAtr.push((riskFurther - riskNearer) / atr);
      // R:R to the same primary target under each stop
      const tgt = L.primary_target ? L.primary_target.price : null;
      if (tgt) {
        const rrF = Math.abs(tgt - L.entry) / riskFurther;
        const rrN = Math.abs(tgt - L.entry) / riskNearer;
        rrLoss.push(rrN - rrF);
      }
    }
  }
}

const mean = (x) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : 0);
const med = (x) => { const s = [...x].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

console.log('=== Ep 20: does the code take the NEARER stop (his rule) or the further? ===');
console.log(`candidates built                     : ${cand}`);
console.log(`  with a zone                        : ${withZone}`);
console.log(`  with a zone AND a recent sweep     : ${withSweep}`);
console.log(`  where the two stop bases DIFFER    : ${differ}  (${withSweep ? (differ / withSweep * 100).toFixed(1) : 'n/a'}%)`);
console.log(`  excluded (a stop base on the wrong side of entry): ${excluded}`);
console.log(`\nextra risk the code carries vs the nearer option:`);
console.log(`  mean ${mean(extraRiskAtr).toFixed(3)} ATR   median ${med(extraRiskAtr).toFixed(3)} ATR   max ${Math.max(...extraRiskAtr, 0).toFixed(3)} ATR`);
console.log(`R:R given up by using the further stop:`);
console.log(`  mean +${mean(rrLoss).toFixed(2)}R   median +${med(rrLoss).toFixed(2)}R   (positive = the nearer stop would have been better)`);
console.log('\nsetup.js:174 uses Math.min for longs / Math.max for shorts, which selects the');
console.log('FURTHER of (zone edge, sweep extreme). His rule: "whichever one that is NEARER".');
