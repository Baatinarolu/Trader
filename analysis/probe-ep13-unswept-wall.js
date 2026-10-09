'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
 * Ep 13 — "I'm not going to enter until that liquidity gets swept."
 *
 * Brad Goh, Ep 13, on the retail mistake at a supply zone:
 *   "They see price comes up to this supply zone and they immediately enter for
 *    a sell the minute price mitigate the supply zone... we are not going to be
 *    entering for a sell right here. We acknowledge that okay, swing highs are
 *    formed right there. There is available liquidity being built up right there
 *    and I'm not going to enter for sell until those get swept."
 *
 * The code KNOWS about the wall -- setup.js:198-201 comments "The FIRST pool is
 * a wall, not a nuisance" -- but it manages it with a partial rather than
 * refusing the entry. This probe measures how often a candidate the model calls
 * tradeable still has an unswept pool sitting between entry and target.
 *
 * Synthetic OHLC random walk on purpose (no fixture CSVs survive in this
 * workspace). The question is about code behaviour, not any real market.
 * ─────────────────────────────────────────────────────────────────────────── */
const path = require('path');
const BASE = path.resolve(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(BASE, 'src', 'bots', 'smc.js'));
const Setup = require(path.join(BASE, 'src', 'bots', 'setup.js'));

let seed = 424242;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function walk(n, start, drift, vol) {
  const out = []; let p = start, t = Date.UTC(2024, 0, 2);
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

let cands = 0, tradeable = 0, withWall = 0, wallAndTradeable = 0;
const unsweptCounts = [];

for (let run = 0; run < 300; run++) {
  const drift = (run % 3 - 1) * 0.06;
  const candles = walk(600, 1.08 + (run % 7) * 0.002, drift, 0.0018);
  let a;
  try { a = SMC.analyse(candles, { tf: '15m' }); } catch (e) { continue; }
  const r = Setup.buildSetups(a, {
    price: a.price, atr: a.atr, bias: 0, balance: 10000, riskPct: 1,
    valuePerPoint: 100000, assetClass: 'forex', symbol: 'EURUSD', minRR: 2,
  });
  const pools = (a.liquidity && a.liquidity.pools) || [];
  unsweptCounts.push(pools.filter((p) => !p.swept).length);

  for (const c of (r.candidates || [])) {
    cands++;
    const L = c.levels;
    if (!L) continue;
    // is there a target the model itself flagged as a wall (first pool < 1.3R)?
    const wall = (L.targets || []).find((t) => t.rr < 1.3);
    if (wall) withWall++;
    if (c.ok) {
      tradeable++;
      if (wall) wallAndTradeable++;
    }
  }
}

const avg = (unsweptCounts.reduce((s, x) => s + x, 0) / (unsweptCounts.length || 1)).toFixed(1);
console.log('=== Ep 13 "do not enter until the adjacent liquidity is swept" ===');
console.log(`candidates returned                          : ${cands}`);
console.log(`candidates the model calls ok:true           : ${tradeable}`);
console.log(`candidates with an unswept pool < 1.3R ahead : ${withWall}  (the model's own "wall")`);
console.log(`  ...of which still ok:true                  : ${wallAndTradeable}`);
console.log(`\nunswept liquidity pools per chart: mean ${avg}, max ${Math.max(...unsweptCounts)}`);
console.log('\nsource: setup.js:198-201 -- the wall is priced into the ladder as a partial,');
console.log('not treated as a reason to wait. His rule is to wait.');
