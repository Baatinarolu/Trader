#!/usr/bin/env node
'use strict';
/**
 * Stability report — does a measured shape survive a regime split?
 *
 * The edge report trains on the earlier 70 % of history and reports the last
 * 30 %.  This script answers the narrower question the register asks: for the
 * shapes we actually recommend (the video plan, the cost-floor exit, and the
 * measured maximum-expectancy shape), what did each *half* of the window pay?
 * Two halves that disagree in sign are a regime artefact, not an edge.
 *
 *   node scripts/stability-report.js                                   # crypto, 4 000 bars
 *   node scripts/stability-report.js --bars 2000 --markets "XAUUSD:1h,EURUSD:1h"
 *   node scripts/stability-report.js --json 0
 */
const fs = require('fs');
const path = require('path');
const P = require('../src/bots/predict');

function argOf(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
}

const DEFAULT_MARKETS = ['BTCUSDT:1h', 'BTCUSDT:4h', 'BTCUSDT:1d', 'ETHUSDT:1h', 'ETHUSDT:4h', 'SOLUSDT:1h', 'XRPUSDT:1h', 'ETHUSDT:1d'];
const MARKETS = String(argOf('markets', DEFAULT_MARKETS.join(','))).split(',').map((s) => s.trim()).filter(Boolean);
const BARS = Number(argOf('bars', 4000));
const STEP = Number(argOf('step', 6));
const MODES = String(argOf('modes', 'entry')).split(',').map((s) => s.trim()).filter(Boolean);
const SPLIT = Number(argOf('split', 0.5));           // two equal halves: the regime test
const WRITE = argOf('json', '1') !== '0';
const OUT_MD = path.join(__dirname, '..', 'docs', 'STABILITY-REPORT.md');
const OUT_JSON = path.join(__dirname, '..', 'docs', 'stability-report.json');

const f = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : Number(x).toFixed(d));
const pct = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${Number(x).toFixed(1)}%`);

/* ---- one shape's outcome on one sample, charged the trade's own cost ---- */
function flatR(s, x) {
  const c = s.sweep.cost_r || 0;
  if (s.sweep.t_bar && s.sweep.t_bar[x] !== undefined) return x - c;
  if (s.sweep.stopped) return -1 - c;
  return (s.sweep.close_r || 0) - c;
}
const videoR = (s) => (s.profiles && s.profiles.video ? s.profiles.video.r : null);
const has = (s, keys) => keys.every((k) => s.gates && s.gates[k]);

const SHAPES = [
  { key: 'video', label: 'Video plan (50 % at T1 → BE → runner)', gates: [], r: videoR },
  { key: 'video_full', label: 'Video plan + measured shape (leg + stop ≥ 0.6 ATR + target ≥ 3R)', gates: ['displacement', 'stop_ge_06atr', 'runway3'], r: videoR },
  { key: 'flat1', label: 'Whole position at 1R', gates: [], r: (s) => flatR(s, 1) },
  { key: 'flat1_floor', label: 'Whole position at 1R + cost floor (leg + stop ≥ 0.6 ATR)', gates: ['displacement', 'stop_ge_06atr'], r: (s) => flatR(s, 1) },
  { key: 'flat3', label: 'Whole position at 3R', gates: [], r: (s) => flatR(s, 3) },
  { key: 'flat3_full', label: 'Whole position at 3R + measured shape (leg + stop ≥ 0.6 ATR + target ≥ 3R)', gates: ['displacement', 'stop_ge_06atr', 'runway3'], r: (s) => flatR(s, 3) },
];

function stats(samples, shape) {
  let n = 0, win = 0, clean = 0, sum = 0, cost = 0;
  for (const s of samples) {
    if (!s.sweep || !s.sweep.fill) continue;
    if (shape.gates.length && !has(s, shape.gates)) continue;
    const r = shape.r(s);
    if (r === null || r === undefined || !Number.isFinite(r)) continue;
    n++; cost += s.sweep.cost_r || 0;
    if (r > 0) win++;
    if (r >= 0.5) clean++;
    sum += r;
  }
  return {
    n, win_pct: n ? (win / n) * 100 : null, clean_pct: n ? (clean / n) * 100 : null,
    expectancy_r: n ? sum / n : null, cost_r: n ? cost / n : null,
  };
}

(async () => {
  const started = new Date();
  process.stdout.write(`stability report · ${MARKETS.length} markets · ${BARS} bars · step ${STEP} · modes ${MODES.join(',')} · halves ${SPLIT}/${1 - SPLIT}\n`);
  const perMarket = [];
  let pool = [];
  for (const key of MARKETS) {
    const [symbol, tf] = key.split(':');
    const row = { market: key, bars: 0, from: null, to: null, split_ts: null, shapes: {}, gate_pass: {}, error: null };
    try {
      const samples = [];
      for (const mode of MODES) {
        const bt = await P.backtest(symbol, tf, { bars: BARS, step: STEP, force: true, entry: mode });
        if (bt.error) throw new Error(bt.error);
        (bt.samples || []).forEach((s) => { s.mode = mode; samples.push(s); });
        row.bars = Math.max(row.bars, (bt.meta && bt.meta.bars) || 0);
        row.from = (bt.meta && bt.meta.from) || row.from;
        row.to = (bt.meta && bt.meta.to) || row.to;
      }
      const filled = samples.filter((s) => s.sweep && s.sweep.fill);
      if (!filled.length) throw new Error('no filled samples');
      const times = filled.map((s) => s.t).sort((a, b) => a - b);
      const splitTs = times[Math.floor(times.length * SPLIT)];
      row.split_ts = new Date(splitTs).toISOString().slice(0, 10);
      const early = filled.filter((s) => s.t < splitTs);
      const late = filled.filter((s) => s.t >= splitTs);
      SHAPES.forEach((shape) => {
        row.shapes[shape.key] = {
          early: stats(early, shape), late: stats(late, shape), all: stats(filled, shape),
          label: shape.label,
        };
        const a = row.shapes[shape.key].early.expectancy_r, b = row.shapes[shape.key].late.expectancy_r;
        row.shapes[shape.key].sign_agrees = a !== null && b !== null ? (a > 0) === (b > 0) : null;
      });
      row.gate_pass = {
        stop_ge_06atr: filled.length ? (filled.filter((s) => s.gates && s.gates.stop_ge_06atr).length / filled.length) * 100 : null,
        runway3: filled.length ? (filled.filter((s) => s.gates && s.gates.runway3).length / filled.length) * 100 : null,
      };
      pool = pool.concat(filled.map((s) => ({ ...s, market: key, splitTs })));
      process.stdout.write(`  ${key}: ${filled.length} filled (early ${early.length} / late ${late.length}, split ${row.split_ts})\n`);
    } catch (e) {
      row.error = e.message;
      process.stdout.write(`  ${key}: ERROR ${e.message}\n`);
    }
    perMarket.push(row);
  }

  const earlyPool = pool.filter((s) => s.t < s.splitTs);
  const latePool = pool.filter((s) => s.t >= s.splitTs);
  const pooled = SHAPES.map((shape) => ({
    key: shape.key, label: shape.label,
    early: stats(earlyPool, shape), late: stats(latePool, shape), all: stats(pool, shape),
    sign_agrees: (() => {
      const a = stats(earlyPool, shape).expectancy_r, b = stats(latePool, shape).expectancy_r;
      return a !== null && b !== null ? (a > 0) === (b > 0) : null;
    })(),
  }));

  const report = {
    generated_at: started.toISOString(), command: `node scripts/stability-report.js --markets "${MARKETS.join(',')}" --bars ${BARS} --step ${STEP} --modes ${MODES.join(',')} --split ${SPLIT}`,
    markets: MARKETS, bars: BARS, step: STEP, modes: MODES, split: SPLIT,
    pool_early: earlyPool.length, pool_late: latePool.length,
    per_market: perMarket, pooled,
  };

  const L = [];
  L.push('# Stability report — does the shape hold in both halves of the window?');
  L.push('');
  L.push(`Generated **${started.toISOString().slice(0, 19).replace('T', ' ')} UTC** by \`${report.command}\` — re-run it to reproduce.`);
  L.push('');
  L.push(`* ${MARKETS.length} markets × ${MODES.join('/')} entry policies, ${BARS} candles requested, signal every ${STEP} bars, every trade charged its own instrument's cost.`);
  L.push(`* Each market is split **in half by time** (not 70/30): early ${earlyPool.length} vs late ${latePool.length} filled setups pooled. A shape whose expectancy changes sign between halves is a regime artefact, not an edge.`);
  L.push('');
  L.push('## Pooled, both halves');
  L.push('');
  L.push('| shape | early n | early win | early exp | late n | late win | late exp | sign agrees |');
  L.push('|---|---|---|---|---|---|---|---|');
  pooled.forEach((p) => {
    L.push(`| ${p.label} | ${p.early.n} | ${pct(p.early.win_pct)} | ${f(p.early.expectancy_r)}R | ${p.late.n} | ${pct(p.late.win_pct)} | ${f(p.late.expectancy_r)}R | ${p.sign_agrees ? 'yes' : '**no**'} |`);
  });
  L.push('');
  const agree = pooled.filter((p) => p.sign_agrees && p.all.n >= 40);
  L.push(agree.length
    ? `Shapes whose expectancy keeps its sign in both halves (n ≥ 40): ${agree.map((p) => `${p.label} (${f(p.early.expectancy_r)}R → ${f(p.late.expectancy_r)}R)`).join('; ')}.`
    : '**No shape kept the sign of its expectancy across both halves with n ≥ 40** — everything measured here is regime-dependent on this sample.');
  L.push('');
  L.push('## Per market — the measured maximum-expectancy shape (leg + stop ≥ 0.6 ATR + 3R target, whole position at 3R)');
  L.push('');
  L.push('| market | bars | early → late | early n / exp | late n / exp | sign agrees | gate pass (stop ≥0.6 ATR / target ≥3R) |');
  L.push('|---|---|---|---|---|---|---|');
  perMarket.forEach((m) => {
    if (m.error) { L.push(`| ${m.market} | — | — | n/a (${m.error}) | — | — | — |`); return; }
    const s = m.shapes.flat3_full;
    L.push(`| ${m.market} | ${m.bars} | ${m.from} → ${m.to} | ${s.early.n} / ${f(s.early.expectancy_r)}R | ${s.late.n} / ${f(s.late.expectancy_r)}R | ${s.sign_agrees ? 'yes' : '**no**'} | ${pct(m.gate_pass.stop_ge_06atr)} / ${pct(m.gate_pass.runway3)} |`);
  });
  L.push('');
  L.push('## Every shape, pooled (all / early / late)');
  L.push('');
  L.push('| shape | all n | all win | all exp | all ≥ +0.5R |');
  L.push('|---|---|---|---|---|');
  pooled.forEach((p) => L.push(`| ${p.label} | ${p.all.n} | ${pct(p.all.win_pct)} | ${f(p.all.expectancy_r)}R | ${pct(p.all.clean_pct)} |`));
  L.push('');
  L.push('*Note:* per-market rows are small by construction — a 4 000-bar window on a 1h timeframe is ~5 months of candles, and the measured shape passes its gates on a minority of setups. Read the pooled rows as the result and the per-market rows as a consistency check.');
  L.push('');

  if (WRITE) {
    fs.writeFileSync(OUT_MD, L.join('\n'));
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 1));
  }
  process.stdout.write('\npooled early vs late expectancy:\n');
  pooled.forEach((p) => process.stdout.write(`  ${String(p.key).padEnd(12)} ${f(p.early.expectancy_r)}R → ${f(p.late.expectancy_r)}R (n ${p.early.n}/${p.late.n}) sign ${p.sign_agrees ? 'ok' : 'FLIPS'}\n`));
  if (WRITE) process.stdout.write(`\nwrote ${OUT_MD}\nwrote ${OUT_JSON}\n`);
})().catch((e) => { console.error(e); process.exit(1); });
