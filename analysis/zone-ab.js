'use strict';
/**
 * ZONE-LAYER A/B (v2) — measured on the thing the change actually moves.
 *
 * v1 compared topdown `direction` and found zero disagreements. That was the
 * wrong variable: direction comes from the BIAS layer, which both variants
 * share. Diagnostics showed the location read differs on 75 of 116 bars, so the
 * effect has to surface downstream — in the graded setup the bot actually acts
 * on. This version compares the SETUP verdict instead.
 *
 * Variants differ in exactly one input:
 *   A  zoneSeries = 1h   -> location read on the stack's declared MTF (patch 0003)
 *   B  zoneSeries = null -> location read falls back to the entry chart (previous)
 *
 * No lookahead: at bar i the method and the setup are built from candles up to
 * and including i only; the outcome is measured on bars after i.
 *
 * Outcome is the forward move over HORIZON bars, in ATR, signed by the call.
 * A win is a forward move of at least +0.5 ATR in the called direction, which
 * mirrors the project's own edge-report honesty rule (net >= +0.5R, not r > 0).
 *
 * Run: node analysis/zone-ab.js [stepBars] [horizonBars]
 */

const ROOT = '/home/user/Trader/extracted/tradejournal/src/bots';
const M = require(`${ROOT}/momentum`);
const TD = require(`${ROOT}/topdown`);
const SMC = require(`${ROOT}/smc`);
const Setup = require(`${ROOT}/setup`);

const MARKETS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSDT'];
const STEP = Number(process.argv[2] || 4);
const HORIZON = Number(process.argv[3] || 16);
const WARMUP = 120;
const WIN_ATR = 0.5;

function slice(series, n) {
  const candles = series.candles.slice(0, n);
  if (candles.length < 40) return null;
  const smc = SMC.analyse(candles, { tf: series.tf });
  return { ...series, candles, smc, atr: smc.atr || series.atr, price: candles[candles.length - 1].c };
}

/** The best graded setup for one variant, or null if it would not trade. */
function bestSetup(td, entry, dir) {
  if (!dir) return null;
  const su = Setup.buildSetups(entry.smc, {
    price: entry.price, atr: entry.atr, bias: dir, minRR: 2, topdown: td,
  });
  const ok = (su.candidates || []).filter((c) => c.ok).sort((a, b) => b.score - a.score);
  return ok[0] || null;
}

async function main() {
  const rows = [];
  const skipped = [];

  for (const sym of MARKETS) {
    let full;
    try {
      full = {
        '4h': await M.series(sym, '4h', 600, { trim: 0, asOf: null }),
        '1h': await M.series(sym, '1h', 600, { trim: 0, asOf: null }),
        '15m': await M.series(sym, '15m', 600, { trim: 0, asOf: null }),
        '5m': await M.series(sym, '5m', 600, { trim: 0, asOf: null }),
      };
    } catch (e) { skipped.push(`${sym} (${String(e.message || e).slice(0, 40)})`); continue; }

    const n = full['15m'].candles.length;
    if (n < WARMUP + HORIZON + 20) { skipped.push(`${sym} (${n} bars)`); continue; }

    let sampled = 0, tradesA = 0, tradesB = 0;

    for (let i = WARMUP; i + HORIZON < n; i += STEP) {
      const entry = slice(full['15m'], i + 1);
      const bias = slice(full['4h'], Math.min(full['4h'].candles.length, i + 1));
      const zone = slice(full['1h'], Math.min(full['1h'].candles.length, i + 1));
      const trig = slice(full['5m'], Math.min(full['5m'].candles.length, i + 1));
      if (!entry || !bias || !trig) continue;
      sampled++;

      const common = { symbol: sym, tf: '15m', series: entry, biasSeries: bias, triggerSeries: trig };
      let tdA, tdB;
      try {
        tdA = TD.build({ ...common, zoneSeries: zone });
        tdB = TD.build({ ...common, zoneSeries: null });
      } catch (e) { continue; }

      const dir = tdA.direction || 0;
      if (!dir) continue;

      const sA = bestSetup(tdA, entry, dir);
      const sB = bestSetup(tdB, entry, dir);
      if (sA) tradesA++;
      if (sB) tradesB++;

      // Only bars where the two variants make a different DECISION carry signal:
      // one trades and the other does not, or they pick different directions.
      const dA = sA ? (sA.dir || dir) : 0;
      const dB = sB ? (sB.dir || dir) : 0;
      if (dA === dB) continue;

      const p0 = entry.price;
      const p1 = full['15m'].candles[i + HORIZON].c;
      const move = (p1 - p0) / (entry.atr || 1);

      rows.push({
        sym, i, dA, dB,
        rA: dA ? move * dA : null,
        rB: dB ? move * dB : null,
        gradeA: sA ? sA.grade : '-', gradeB: sB ? sB.grade : '-',
      });
    }
    console.log(`  ${sym.padEnd(8)} sampled ${String(sampled).padStart(4)} bars · setups offered: A ${tradesA}, B ${tradesB}`);
  }

  if (skipped.length) console.log(`  skipped: ${skipped.join(', ')}`);

  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
  const wr = (xs) => (xs.length ? (xs.filter((x) => x >= WIN_ATR).length / xs.length) * 100 : NaN);

  const rA = rows.filter((r) => r.rA !== null).map((r) => r.rA);
  const rB = rows.filter((r) => r.rB !== null).map((r) => r.rB);

  console.log(`\n  decision-level disagreements: ${rows.length}`);
  if (!rows.length) { console.log('  nothing to compare'); return; }
  console.log(`  horizon ${HORIZON} bars · win = forward move >= +${WIN_ATR} ATR in the called direction\n`);
  console.log('  variant                              n    win%   mean ATR');
  console.log('  ' + '-'.repeat(54));
  if (rA.length) console.log(`  A  trades it   (1h location)  ${String(rA.length).padStart(5)}  ${wr(rA).toFixed(1).padStart(5)}%  ${mean(rA) >= 0 ? '+' : ''}${mean(rA).toFixed(4)}`);
  else console.log('  A  trades it   (1h location)      0      -         -');
  if (rB.length) console.log(`  B  trades it   (15m location) ${String(rB.length).padStart(5)}  ${wr(rB).toFixed(1).padStart(5)}%  ${mean(rB) >= 0 ? '+' : ''}${mean(rB).toFixed(4)}`);
  else console.log('  B  trades it   (15m location)     0      -         -');

  const onlyA = rows.filter((r) => r.dA && !r.dB);
  const onlyB = rows.filter((r) => !r.dA && r.dB);
  console.log(`\n  A trades where B stands down: ${onlyA.length}`);
  if (onlyA.length) console.log(`     win ${wr(onlyA.map((r) => r.rA)).toFixed(1)}%  mean ${mean(onlyA.map((r) => r.rA)) >= 0 ? '+' : ''}${mean(onlyA.map((r) => r.rA)).toFixed(4)} ATR`);
  console.log(`  B trades where A stands down: ${onlyB.length}`);
  if (onlyB.length) console.log(`     win ${wr(onlyB.map((r) => r.rB)).toFixed(1)}%  mean ${mean(onlyB.map((r) => r.rB)) >= 0 ? '+' : ''}${mean(onlyB.map((r) => r.rB)).toFixed(4)} ATR`);

  const d = (rA.length ? mean(rA) : 0) - (rB.length ? mean(rB) : 0);
  console.log(`\n  verdict on this sample: ${Math.abs(d) < 0.02 ? 'no meaningful difference' : d > 0 ? 'the 1h location read was better' : 'the 15m location read was better'}`);
}

main().catch((e) => { console.error('FAILED', e); process.exit(1); });
