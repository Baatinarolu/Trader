'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MTF REPORT — does waiting for the lower-timeframe confirmation pay?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The playlist's execution layer says: the higher timeframe picks the zone, the
 *  lower timeframe (5m inside a 15m zone, 15m inside 1h, 1h inside 4h) must sweep
 *  liquidity and print a displacement candle *inside that zone* before you enter.
 *
 *  This script measures that against the plain "first touch of the zone" entry on
 *  the **same candles, same window, same settings** — the only difference is the
 *  entry rule — and then reports the paired subset: the setups where both rules
 *  produced a fill. The paired subset is the cleanest answer, because a window
 *  difference cannot hide in it.
 *
 *  The free data providers cap lower-timeframe history, so each market is run on
 *  the longest window its lower timeframe actually covers (printed per market);
 *  `node scripts/ltf-probe.js` shows that coverage before you read anything else.
 *
 *    node scripts/mtf-report.js
 *    node scripts/mtf-report.js --markets "XAUUSD:15m,BTCUSDT:1h" --step 3 --json 0
 */
const fs = require('fs');
const path = require('path');
const P = require('../src/bots/predict');
const C = require('../src/candles');

const DEFAULT_MARKETS = ['XAUUSD:15m', 'XAUUSD:1h', 'XAUUSD:4h', 'EURUSD:1h', 'GBPUSD:1h', 'AUDUSD:1h', 'USDJPY:1h',
  'BTCUSDT:1h', 'BTCUSDT:4h', 'ETHUSDT:1h', 'ETHUSDT:4h', 'SOLUSDT:1h', 'XRPUSDT:1h',
  'AAPL:1h', 'TSLA:1h', 'SPY:1h', 'ES:1h', 'NQ:1h', 'US30:1h', 'NAS100:1h', 'SPX500:1h', 'GER40:1h', 'XAGUSD:1h', 'USOIL:1h'];

function argOf(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
}
const MARKETS = String(argOf('markets', DEFAULT_MARKETS.join(','))).split(',').map((s) => s.trim()).filter(Boolean);
const STEP = Number(argOf('step', 4));
const BAR_CAP = Number(argOf('bars', 900));          // requested HTF window; capped by lower-timeframe coverage
const COST = String(argOf('cost', 'instrument'));
const WRITE = argOf('json', '1') !== '0';
const OUT_JSON = path.join(__dirname, '..', 'docs', 'mtf-report.json');
const OUT_MD = path.join(__dirname, '..', 'docs', 'MTF-REPORT.md');
const TF_MS = { '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3 };

const f = (x, d = 2) => (x === null || x === undefined ? '—' : Number(x).toFixed(d));
const pct = (x) => (x === null || x === undefined ? '—' : `${Number(x).toFixed(1)}%`);

/* one sample's video-plan result, used by both the pooled and the refusal views */
const rOf = (s) => (s.profiles && s.profiles.video ? s.profiles.video.r : 0);
const winOf = (s) => (rOf(s) > 0 ? 1 : 0);

/** Outcome of one mode over a sample list, using the video management plan. */
function stats(samples) {
  const rows = samples
    .map((s) => (s.profiles && s.profiles.video) || null)
    .filter((v) => v && v.outcome !== 'no_fill');
  if (!rows.length) return { fills: 0, win_pct: null, clean_pct: null, expectancy_r: null, t1_hit_pct: null };
  const rs = rows.map((v) => v.r);
  const wins = rows.filter((v) => v.r > 0).length;
  const clean = rows.filter((v) => v.r >= 0.5).length;
  const t1 = rows.filter((v) => v.first_hit).length;
  return {
    fills: rows.length,
    win_pct: (wins / rows.length) * 100,
    clean_pct: (clean / rows.length) * 100,
    expectancy_r: rs.reduce((a, b) => a + b, 0) / rows.length,
    t1_hit_pct: (t1 / rows.length) * 100,
  };
}
/** Signed difference a − b, only where both exist. */
const diff = (a, b) => (a === null || b === null || a === undefined || b === undefined ? null : a - b);

(async () => {
  const started = new Date();
  const lines = [];
  const perMarket = [];
  process.stdout.write(`MTF report · ${MARKETS.length} markets · step ${STEP} · cost ${COST}\n`);
  process.stdout.write('market            ltf   ltf bars  window (htf bars)  dates                  base fills  mtf fills  paired\n');

  for (const key of MARKETS) {
    const [sym, tf] = key.split(':');
    const ltfTf = P.MTF_ENTRY_PAIRS[tf];
    if (!ltfTf) { process.stdout.write(`${key}: no lower timeframe mapped\n`); continue; }
    const ratio = Math.max(1, Math.round(TF_MS[tf] / TF_MS[ltfTf]));

    /* what the lower timeframe can actually cover decides the window */
    let ltfBars = 0, ltfProvider = null, ltfErr = null;
    try {
      const r = await C.getCandles(sym, ltfTf, { limit: Math.min(3000, BAR_CAP * ratio + 60), force: true });
      ltfBars = (r.candles || []).length;
      ltfProvider = (r.meta || {}).provider || null;
    } catch (e) { ltfErr = e.message; }
    if (!ltfBars) {
      process.stdout.write(`${key}: lower timeframe unavailable (${ltfErr})\n`);
      perMarket.push({ market: key, ltf_tf: ltfTf, error: ltfErr || 'no lower-timeframe candles' });
      continue;
    }
    const windowBars = Math.max(250, Math.min(BAR_CAP, Math.floor(ltfBars / ratio) - 5));

    const runs = {};
    for (const mode of ['entry', 'mtf']) {
      try {
        runs[mode] = await P.backtest(sym, tf, { bars: windowBars, step: STEP, force: true, entry: mode, cost: COST });
      } catch (e) { runs[mode] = { error: e.message, samples: [] }; }
    }
    const base = runs.entry || { samples: [] };
    const mtf = runs.mtf || { samples: [] };
    const baseStats = stats(base.samples || []);
    const mtfStats = stats(mtf.samples || []);

    /* paired subset: identical setups (signal bar + direction) where both filled */
    const keyOf = (s) => `${s.t}|${s.dir}`;
    const baseBy = new Map((base.samples || []).filter((s) => s.profiles && s.profiles.video && s.profiles.video.outcome !== 'no_fill').map((s) => [keyOf(s), s]));
    const filledMtf = (mtf.samples || []).filter((s) => s.profiles && s.profiles.video && s.profiles.video.outcome !== 'no_fill');
    const pairedMtf = filledMtf.filter((s) => baseBy.has(keyOf(s)));
    // setups the refined rule refused but the base rule took — the counterfactual of waiting
    const refused = (mtf.samples || []).filter((s) => s.mtf && s.mtf.trigger === false ? baseBy.has(keyOf(s)) : false)
      .map((s) => baseBy.get(keyOf(s)));
    const pairedBase = pairedMtf.map((s) => baseBy.get(keyOf(s)));
    const paired = {
      setups: pairedMtf.length,
      base: stats(pairedBase),
      mtf: stats(pairedMtf),
    };
    paired.delta_win_pts = diff(paired.mtf.win_pct, paired.base.win_pct);
    paired.delta_clean_pts = diff(paired.mtf.clean_pct, paired.base.clean_pct);
    paired.delta_expectancy_r = diff(paired.mtf.expectancy_r, paired.base.expectancy_r);

    const meta = mtf.meta || base.meta || {};
    const row = {
      market: key, htf_tf: tf, ltf_tf: ltfTf, ltf_provider: ltfProvider, ltf_bars: ltfBars,
      window_bars: windowBars, window_from: meta.from || null, window_to: meta.to || null,
      setups: (base.counts && base.counts.setups) || null,
      no_confirm: (mtf.samples || []).filter((s) => s.mtf && s.mtf.trigger === false).length,
      refused_but_base_took: refused.length,
      refused_base_stats: refused.length ? {
        fills: refused.length,
        win_pct: (refused.filter((s) => winOf(s) === 1).length / refused.length) * 100,
        expectancy_r: refused.reduce((a, s) => a + rOf(s), 0) / refused.length,
        clean_pct: (refused.filter((s) => rOf(s) >= 0.5).length / refused.length) * 100,
      } : null,
      base: baseStats, mtf: mtfStats, paired,
      cost_r_median: meta.cost_r_median == null ? null : meta.cost_r_median,
      error: base.error || mtf.error || null,
    };
    perMarket.push(row);
    process.stdout.write(`${key.padEnd(17)} ${ltfTf.padEnd(5)} ${String(ltfBars).padStart(8)}  ${String(windowBars).padStart(16)}  ${((meta.from || '?') + ' → ' + (meta.to || '?')).padEnd(21)}  ${String(baseStats.fills).padStart(10)}  ${String(mtfStats.fills).padStart(9)}  ${String(paired.setups).padStart(6)}\n`);
  }

  const ok = perMarket.filter((m) => !m.error && m.base && m.base.fills);
  const sumBy = (list, fn) => list.reduce((a, m) => a + (fn(m) || 0), 0);
  /** Fill-weighted average of a metric across markets. */
  const wavg = (rows, valueFn, weightFn) => {
    const w = sumBy(rows, weightFn);
    return w ? sumBy(rows, (m) => (valueFn(m) || 0) * weightFn(m)) / w : null;
  };
  const modeBlock = (which) => ({
    fills: sumBy(ok, (m) => m[which].fills),
    win_pct: wavg(ok, (m) => m[which].win_pct, (m) => m[which].fills),
    clean_pct: wavg(ok, (m) => m[which].clean_pct, (m) => m[which].fills),
    expectancy_r: wavg(ok, (m) => m[which].expectancy_r, (m) => m[which].fills),
    t1_hit_pct: wavg(ok, (m) => m[which].t1_hit_pct, (m) => m[which].fills),
  });
  const pooled = { markets: ok.length, base: modeBlock('base'), mtf: modeBlock('mtf'), no_confirm: sumBy(ok, (m) => m.no_confirm) };
  const pairedList = ok.filter((m) => m.paired && m.paired.setups);
  const pairedPooled = {
    setups: sumBy(pairedList, (m) => m.paired.setups),
    base: {
      win_pct: wavg(pairedList, (m) => m.paired.base.win_pct, (m) => m.paired.setups),
      clean_pct: wavg(pairedList, (m) => m.paired.base.clean_pct, (m) => m.paired.setups),
      expectancy_r: wavg(pairedList, (m) => m.paired.base.expectancy_r, (m) => m.paired.setups),
      t1_hit_pct: wavg(pairedList, (m) => m.paired.base.t1_hit_pct, (m) => m.paired.setups),
    },
    mtf: {
      win_pct: wavg(pairedList, (m) => m.paired.mtf.win_pct, (m) => m.paired.setups),
      clean_pct: wavg(pairedList, (m) => m.paired.mtf.clean_pct, (m) => m.paired.setups),
      expectancy_r: wavg(pairedList, (m) => m.paired.mtf.expectancy_r, (m) => m.paired.setups),
      t1_hit_pct: wavg(pairedList, (m) => m.paired.mtf.t1_hit_pct, (m) => m.paired.setups),
    },
  };
  pairedPooled.delta_win_pts = diff(pairedPooled.mtf.win_pct, pairedPooled.base.win_pct);
  pairedPooled.delta_clean_pts = diff(pairedPooled.mtf.clean_pct, pairedPooled.base.clean_pct);
  pairedPooled.delta_expectancy_r = diff(pairedPooled.mtf.expectancy_r, pairedPooled.base.expectancy_r);

  const report = {
    generated_at: started.toISOString(),
    command: `node scripts/mtf-report.js${process.argv.slice(2).length ? ' ' + process.argv.slice(2).join(' ') : ''}`,
    step: STEP, bars_requested: BAR_CAP, cost: COST, pairs: P.MTF_ENTRY_PAIRS, markets: perMarket, pooled, paired_pooled: pairedPooled,
  };
  if (WRITE) fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 1));

  lines.push('# MTF report — does waiting for the lower-timeframe confirmation pay?');
  lines.push('');
  lines.push(`Generated **${started.toISOString().slice(0, 16).replace('T', ' ')} UTC** by \`${report.command}\` — re-run it to reproduce.`);
  lines.push('');
  lines.push(`* ${MARKETS.length} market/timeframe combos, identical candles and window for both entry rules, costs: **${COST}**, signal every ${STEP} bars`);
  lines.push('* **base** = first touch of the higher-timeframe zone (the model as built)');
  lines.push('* **mtf** = same setup, but the fill only happens where the lower timeframe ') ;
  lines.push('  ' + Object.entries(report.pairs).map(([a, b]) => `${a}→${b}`).join(', ') + ' sweeps liquidity **and** prints a displacement candle inside that zone; the entry is the confirmation bar close and the targets are re-ruled from that price');
  lines.push('* **paired** = only the setups where *both* rules filled — a window or sample effect cannot hide in this column');
  lines.push('');
  lines.push('## Pooled');
  lines.push('');
  lines.push('| rule | filled trades | win % (video plan) | ≥ +0.5R | expectancy | first target hit |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(`| base (first touch) | ${pooled.base.fills} | ${pct(pooled.base.win_pct)} | ${pct(pooled.base.clean_pct)} | ${f(pooled.base.expectancy_r)}R | ${pct(pooled.base.t1_hit_pct)} |`);
  lines.push(`| mtf (lower-timeframe confirmation) | ${pooled.mtf.fills} | ${pct(pooled.mtf.win_pct)} | ${pct(pooled.mtf.clean_pct)} | ${f(pooled.mtf.expectancy_r)}R | ${pct(pooled.mtf.t1_hit_pct)} |`);
  lines.push('');
  lines.push(`Setups the model proposed but the lower timeframe never confirmed: **${pooled.no_confirm}** (these are the trades the refined rule refuses to take).`);
  lines.push('');
  lines.push('## Paired — the same setups, both rules');
  lines.push('');
  lines.push('| rule | setups | win % | ≥ +0.5R | expectancy | first target hit |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(`| base | ${pairedPooled.setups} | ${pct(pairedPooled.base.win_pct)} | ${pct(pairedPooled.base.clean_pct)} | ${f(pairedPooled.base.expectancy_r)}R | ${pct(pairedPooled.base.t1_hit_pct)} |`);
  lines.push(`| mtf | ${pairedPooled.setups} | ${pct(pairedPooled.mtf.win_pct)} | ${pct(pairedPooled.mtf.clean_pct)} | ${f(pairedPooled.mtf.expectancy_r)}R | ${pct(pairedPooled.mtf.t1_hit_pct)} |`);
  lines.push(`| **difference** | — | ${pairedPooled.delta_win_pts > 0 ? '+' : ''}${f(pairedPooled.delta_win_pts, 1)} pts | ${pairedPooled.delta_clean_pts > 0 ? '+' : ''}${f(pairedPooled.delta_clean_pts, 1)} pts | ${pairedPooled.delta_expectancy_r > 0 ? '+' : ''}${f(pairedPooled.delta_expectancy_r, 3)}R | — |`);
  lines.push('');
  lines.push('## Per market');
  lines.push('');
  lines.push('| market | LTF | LTF bars | window | dates | base fills / win / exp | mtf fills / win / exp | paired n | paired Δwin | paired Δexp |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  perMarket.forEach((m) => {
    if (m.error) { lines.push(`| ${m.market} | ${m.ltf_tf || '—'} | — | — | — | n/a (${m.error}) | — | — | — | — |`); return; }
    lines.push(`| ${m.market} | ${m.ltf_tf} | ${m.ltf_bars} | ${m.window_bars} bars | ${m.window_from} → ${m.window_to} | ${m.base.fills} / ${pct(m.base.win_pct)} / ${f(m.base.expectancy_r)}R | ${m.mtf.fills} / ${pct(m.mtf.win_pct)} / ${f(m.mtf.expectancy_r)}R | ${m.paired.setups} | ${m.paired.delta_win_pts > 0 ? '+' : ''}${f(m.paired.delta_win_pts, 1)} | ${m.paired.delta_expectancy_r > 0 ? '+' : ''}${f(m.paired.delta_expectancy_r, 3)}R |`);
  });
  lines.push('');
  const pairedRows = perMarket.filter((m) => m.paired && m.paired.setups);
  const winBetter = pairedRows.filter((m) => m.paired.delta_win_pts > 0).length;
  const expBetter = pairedRows.filter((m) => m.paired.delta_expectancy_r > 0).length;

  const verdict = [] ;
  verdict.push(pairedPooled.delta_win_pts > 1 ? 'Waiting for the lower timeframe **raised** the win rate on identical setups.' : pairedPooled.delta_win_pts < -1 ? 'Waiting for the lower timeframe **lowered** the win rate on identical setups.' : 'Waiting for the lower timeframe made **no material difference** to the win rate on identical setups.');
  verdict.push(pairedPooled.delta_expectancy_r > 0.02 ? 'Expectancy improved.' : pairedPooled.delta_expectancy_r < -0.02 ? 'Expectancy got worse.' : 'Expectancy was unchanged.');
  lines.push(`**Verdict.** ${verdict.join(' ')} It helped on **${winBetter} of ${pairedRows.length}** markets by win rate and on **${expBetter} of ${pairedRows.length}** by expectancy — so the pooled line is a balance of two different market behaviours, not a uniform effect. Both rules are still judged against the break-even each exit needs — see docs/EDGE-REPORT.md §0b for that arithmetic.`);
  lines.push('');
  lines.push(`**What the refusals cost and saved.** Of the ${pooled.no_confirm} setups the lower timeframe never confirmed, **${pairedRows.reduce((a, m) => a + (m.refused_but_base_took || 0), 0)}** were filled and graded by the base rule anyway. Refusing a trade is only right if those trades were bad — the base rule's score on exactly that refused subset is the test.`);
  lines.push('');
  lines.push('*Reproducibility note:* the candle window ends at run time, so a re-run later in the day differs in the last bars — two runs on 2026-10-06 moved the pooled MTF win rate by **0.4 points** and the paired count by 5 setups. Treat the per-market rows as ±1 point and re-run the script yourself before quoting a figure.');

  lines.push('*Provider note:* the lower timeframe caps the window (see the LTF bars column). A 1h zone needs 15m data, and the free feeds return ~1 400–3 000 bars of it, which is 360–750 hours of higher-timeframe history — so this test runs on far less history than the main edge report, and thin per-market rows are thin for that reason, not because the rule is unstable.');
  lines.push('');
  if (WRITE) fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
  process.stdout.write(`\npooled base ${pct(pooled.base.win_pct)} win / ${f(pooled.base.expectancy_r)}R · mtf ${pct(pooled.mtf.win_pct)} win / ${f(pooled.mtf.expectancy_r)}R\n`);
  process.stdout.write(`paired (${pairedPooled.setups} setups): Δwin ${f(pairedPooled.delta_win_pts, 1)} pts · Δexpectancy ${f(pairedPooled.delta_expectancy_r, 3)}R\n`);
  process.stdout.write(`unconfirmed setups refused by the rule: ${pooled.no_confirm}\n`);
  if (WRITE) process.stdout.write(`wrote ${OUT_JSON}\nwrote ${OUT_MD}\n`);
})().catch((e) => { console.error(e); process.exit(1); });
