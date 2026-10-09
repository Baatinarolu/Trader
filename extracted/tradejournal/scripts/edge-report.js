#!/usr/bin/env node
'use strict';
/**
 * EDGE REPORT — the honest "what win rate can this model actually produce?" harness.
 * ────────────────────────────────────────────────────────────────────────────────
 *
 *   node scripts/edge-report.js                      # default 24 market/timeframes, 3 entry depths
 *   node scripts/edge-report.js --markets BTCUSDT:1h,XAUUSD:1h --tf all --out docs/EDGE-REPORT.md
 *   node scripts/edge-report.js --split 0.7 --bars 2000 --step 6
 *
 * What it does
 *   1. Replays the prediction bot over every market in the list ONCE PER ENTRY DEPTH
 *      (zone midpoint, and the deeper "wait for the retrace" variants).
 *   2. Pools every filled trade in memory.
 *   3. Splits the pool by TIME — the first `--split` of the bars is the search set,
 *      the rest is never used to choose anything, only to check the choice.
 *   4. Enumerates filter combinations (the bot's own checklist gates, the playlist's
 *      50-EMA / MACD / OTE refinements, grade, score and structural RR) × 16 exit
 *      plans, and reports which ones hold up out of sample.
 *
 * Honesty rules baked in
 *   · a "win" is net ≥ +0.5R after costs  (NOT "r > 0" — that would count a scratched
 *     runner as a win and flatter every number here)
 *   · every row carries the win rate that plan needs just to break even, so a 58 %
 *     win rate at a 0.6R target is shown as the loser it is
 *   · the report lists how many rules looked good in-sample and died out-of-sample
 *
 * Output: stdout summary + a Markdown file (default docs/EDGE-REPORT.md).
 */

const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'src', 'bots', 'predict'));

const COST_R = 0.05;                      // flat fallback, in R (what the bot used before 2026-10-06)
const DEDUPE = String(argOf('dedupe', '1')) !== '0';   // collapse overlapping samples (the same zone sampled bar after bar)
const COST_MODE = String(argOf('cost', 'instrument'));   // 'instrument' = spread/slippage/commission per asset class, in bp of price

const DEFAULT_MARKETS = [
  'BTCUSDT:1h', 'ETHUSDT:1h', 'SOLUSDT:1h', 'XRPUSDT:1h',
  'XAUUSD:1h', 'XAUUSD:15m', 'XAGUSD:1h',
  'EURUSD:1h', 'USDJPY:1h', 'GBPUSD:1h', 'AUDUSD:1h',
  'NAS100:1h', 'SPX500:1h', 'US30:1h', 'GER40:1h',
  'AAPL:1h', 'TSLA:1h', 'USOIL:1h',
  'ES:1h', 'NQ:1h', 'SPY:1h',
  'BTCUSDT:4h', 'ETHUSDT:4h', 'XAUUSD:4h',
];

const FLAT_TARGETS = [0.15, 0.25, 0.35, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const SCALE_PLANS = [
  { key: 'half_05_run1', part: 0.5, partial: 0.5, runner: 1 },
  { key: 'half_05_run15', part: 0.5, partial: 0.5, runner: 1.5 },
  { key: 'half_05_run2', part: 0.5, partial: 0.5, runner: 2 },
  { key: 'half_06_run15', part: 0.5, partial: 0.6, runner: 1.5 },
  { key: 'half_075_run2', part: 0.5, partial: 0.75, runner: 2 },
  { key: 'half_1_run2', part: 0.5, partial: 1, runner: 2 },
];
const PLANS = [
  ...FLAT_TARGETS.map((target) => ({ key: `flat_${target}`, kind: 'flat', target })),
  ...SCALE_PLANS.map((p) => ({ key: p.key, kind: 'scale', ...p })),
];

/* --------------------------------------------------------------- arguments */
function argOf(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
}
const MARKETS = String(argOf('markets', DEFAULT_MARKETS.join(','))).split(',').map((s) => s.trim()).filter(Boolean);
const SPLIT = Number(argOf('split', 0.7));
const BARS = Number(argOf('bars', 2000));
const STEP = Number(argOf('step', 6));
const OUT = argOf('out', path.join(__dirname, '..', 'docs', 'EDGE-REPORT.md'));
const MODES = String(argOf('modes', 'entry,leg,ote,mtf')).split(',').map((s) => s.trim()).filter(Boolean);
/* R is only a stable unit if the stop is a sane distance away. An entry that
 * squeezes the stop to a fraction of ATR produces 20R "wins" that mean nothing,
 * so those trades are dropped and counted. */
const MIN_RISK_ATR = Number(argOf('min-risk-atr', 0.25));

const f = (x, d = 2) => (x === null || x === undefined ? '—' : Number(x).toFixed(d));
const pct = (x) => (x === null || x === undefined ? '—' : `${Number(x).toFixed(2)}%`);

/* ------------------------------------------------------- exit-plan outcome */
function outcome(sw, plan, costR = COST_R) {
  if (!sw || !sw.fill) return null;
  if (plan.kind === 'flat') {
    if (sw.t_bar[plan.target] !== undefined) return plan.target - costR;
    if (sw.stopped) return -1 - costR;
    return (sw.close_r || 0) - costR;
  }
  const partialBar = sw.t_bar[plan.partial];
  if (partialBar === undefined) return sw.stopped ? -1 - costR : (sw.close_r || 0) - costR;
  const runnerBar = sw.t_bar[plan.runner];
  const runnerHit = runnerBar !== undefined && (sw.be_bar === null || runnerBar < sw.be_bar);
  const runnerR = runnerHit ? plan.runner
    : (sw.be_bar !== null && sw.be_bar > partialBar ? 0 : (sw.close_r || 0));
  return plan.part * plan.partial + (1 - plan.part) * runnerR - costR;
}

/* ------------------------------------------------------------------ atoms */
const ATOMS = [];
const gate = (g) => ATOMS.push({ id: g, test: (s) => !!(s.gates && s.gates[g]) });
['sweep', 'displacement', 'zone', 'range', 'structure', 'htf', 'bias', 'session', 'news', 'runway', 'entry', 'entry_valid'].forEach(gate);
[55, 65, 75].forEach((sc) => ATOMS.push({ id: `score>=${sc}`, test: (s) => s.score >= sc }));
ATOMS.push({ id: 'grade>=A', test: (s) => s.grade === 'A+' || s.grade === 'A' });
ATOMS.push({ id: 'rr>=2', test: (s) => (s.rr || 0) >= 2 });
ATOMS.push({ id: 'ema50', test: (s) => !!(s.sig && s.sig.ema50_align) });
ATOMS.push({ id: 'macd', test: (s) => !!(s.sig && s.sig.macd_align) });
ATOMS.push({ id: 'ote', test: (s) => !!(s.sig && s.sig.ote) });
ATOMS.push({ id: 'fvg', test: (s) => !!(s.sig && s.sig.entry_kind === 'fvg') });
ATOMS.push({ id: 'order_block', test: (s) => !!(s.sig && s.sig.entry_kind === 'order_block') });
ATOMS.push({ id: 'dist_ema>=1atr', test: (s) => !!(s.sig && s.sig.dist_ema_atr != null && s.sig.dist_ema_atr >= 1) });
ATOMS.push({ id: 'sweep<=5bar', test: (s) => !!(s.sig && s.sig.sweep_bars != null && s.sig.sweep_bars <= 5) });

function rules() {
  const out = [];
  for (let i = 0; i < ATOMS.length; i++) {
    out.push({ id: ATOMS[i].id, mask: ATOMS[i].mask });
  }
  for (let i = 0; i < ATOMS.length; i++) {
    for (let j = i + 1; j < ATOMS.length; j++) {
      out.push({ id: `${ATOMS[i].id}+${ATOMS[j].id}`, mask: ATOMS[i].mask.map((v, k) => v && ATOMS[j].mask[k]) });
    }
  }
  return out;
}

function stats(idxs, outs, pi) {
  let n = 0, wins = 0, clean = 0, sum = 0;
  for (const i of idxs) {
    const r = outs[i][pi];
    if (r === null || r === undefined) continue;
    n++; if (r > 0) wins++; if (r >= 0.5) clean++; sum += r;
  }
  return { n, win: n ? (wins / n) * 100 : null, clean: n ? (clean / n) * 100 : null, exp: n ? sum / n : null };
}
let costRef = COST_R;                     // mean cost per trade over the pool, set once the pool exists
const breakeven = (plan) => {
  const maxWin = plan.kind === 'flat' ? plan.target : plan.part * plan.partial + (1 - plan.part) * plan.runner;
  return ((1 + costRef) / (1 + maxWin)) * 100;
};

/* ------------------------------------------------------------------- main */
(async () => {
  const started = new Date();
  const pool = [];
  const perMarket = [];
  process.stdout.write(`collecting ${MARKETS.length} markets × ${MODES.length} entry depths (bars=${BARS}, step=${STEP})…\n`);
  for (const key of MARKETS) {
    const [sym, tf] = key.split(':');
    const line = { market: key, modes: {} };
    for (const mode of MODES) {
      let bt;
      try {
        bt = await P.backtest(sym, tf, { bars: BARS, step: STEP, force: true, entry: mode, cost: COST_MODE });
      } catch (e) {
        process.stdout.write(`  ! ${key} ${mode}: ${e.message}\n`);
        continue;
      }
      let kept = 0;
      let dropped = 0;
      for (const s of bt.samples) {
        if (!s.profiles || !s.profiles.video || s.profiles.video.outcome === 'no_fill') continue;
        if (!(s.risk_atr >= MIN_RISK_ATR)) { dropped++; continue; }
        pool.push({
          market: key, mode, t: s.t, grade: s.grade, score: s.score, rr: s.rr_primary, risk_atr: s.risk_atr,
          gates: s.gates, sig: s.signals,
          sweep: {
            t_bar: s.sweep.t_bar, be_bar: s.sweep.be_bar, stop_bar: s.sweep.stop_bar,
            stopped: s.sweep.stopped, close_r: s.sweep.close_r, fill: s.sweep.fill,
          },
          second: s.second ? { first: s.second.first, retap: !!s.second.retap, r: s.second.second ? s.second.second.r : null } : null,
          entry_ote: s.entry_ote || 0,
          video_r: s.profiles.video.r, video_win: s.profiles.video.win,
          cost_r: s.sweep.cost_r != null ? s.sweep.cost_r : COST_R,
          entry: s.entry, stop: s.stop,
        });
        kept++;
      }
      line.modes[mode] = {
        filled: kept, dropped_tight_stops: dropped, setups: bt.counts.setups, no_fill: bt.counts.no_fill,
        mtf_tf: (bt.meta || {}).mtf_tf || null, ltf_bars: (bt.meta || {}).ltf_bars || 0,
        video_plan: (bt.profiles || []).find((p) => p.key === 'video') || null,
        verdict: bt.verdict || null, second_chance: bt.second_chance || null,
      };
    }
    perMarket.push(line);
    process.stdout.write(`  ${key}: ${MODES.map((m) => `${m}=${(line.modes[m] || {}).filled || 0}`).join(' ')}\n`);
  }
  const poolRaw = pool.length;
  if (DEDUPE) {
    const seen = new Set();
    const kept = [];
    for (const s of pool) {                       // pool is chronological within a market, so the first sighting wins
      const key = `${s.market}|${s.mode}|${Math.round((s.entry || 0) * 1e6)}|${Math.round((s.stop || 0) * 1e6)}`;
      if (seen.has(key)) continue;
      seen.add(key); kept.push(s);
    }
    pool.length = 0; pool.push(...kept);
  }
  process.stdout.write(`pooled ${poolRaw} filled trades${DEDUPE ? ` · ${pool.length} unique setups after collapsing overlapping samples` : ''}\n`);

  const ordered = pool.map((s, i) => i).sort((a, b) => pool[a].t - pool[b].t);
  const splitTs = ordered.length ? pool[ordered[Math.floor(ordered.length * SPLIT)]].t : Date.now();
  const train = ordered.filter((i) => pool[i].t < splitTs);
  const test = ordered.filter((i) => pool[i].t >= splitTs);
  costRef = pool.length ? pool.reduce((a, s) => a + s.cost_r, 0) / pool.length : COST_R;
  const outs = pool.map((s) => PLANS.map((p) => outcome(s.sweep, p, s.cost_r)));
  ATOMS.forEach((a) => { a.mask = pool.map((s) => a.test(s)); });
  /* ---- win rate as a function of the target itself ---------------------- */
  /* For every target distance x in the ladder: how often was x touched before
   * the stop (the honest win rate of a flat xR exit), what that exit needs to
   * break even, and what it actually earned.  This answers "can the success
   * rate be 70 %?" without moving any goalposts — it shows the price of a high
   * hit rate instead of hiding it. */
  const frontierByTarget = FLAT_TARGETS.map((x) => {
    let n = 0, win = 0, clean = 0, sum = 0, sumClean = 0, costSum = 0, hit = 0;
    pool.forEach((s) => {
      const r = outcome(s.sweep, { kind: 'flat', target: x }, s.cost_r);
      if (r === null) return;
      n++; costSum += s.cost_r;
      if (s.sweep.t_bar && s.sweep.t_bar[x] !== undefined) hit++;
      if (r > 0) win++;
      if (r >= 0.5) { clean++; sumClean += r; }
      sum += r;
    });
    if (!n) return null;
    const cost = costSum / n;
    return { target_r: x, n, hit_pct: (hit / n) * 100, win_pct: (win / n) * 100, clean_pct: (clean / n) * 100,
      expectancy_r: sum / n, clean_expectancy_r: clean ? sumClean / clean : null,
      breakeven_pct: ((1 + cost) / (1 + x)) * 100, cost_r: cost };
  }).filter(Boolean);

  const costByMarket = {};
  pool.forEach((s) => { (costByMarket[s.market] = costByMarket[s.market] || []).push(s.cost_r); });
  const costTable = Object.keys(costByMarket).sort().map((m) => {
    const v = costByMarket[m].slice().sort((a, b) => a - b);
    return { market: m, trades: v.length, median_r: v[Math.floor(v.length / 2)], mean_r: v.reduce((a, b) => a + b, 0) / v.length, max_r: v[v.length - 1] };
  });
  const report = { generated_at: started.toISOString(), markets: MARKETS, modes: MODES, split: SPLIT, bars: BARS, step: STEP, cost_mode: COST_MODE, cost_mean_r: costRef, cost_median_r: (() => { const v = pool.map((s) => s.cost_r).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; })(), cost_table: costTable, pool: pool.length, pool_raw: poolRaw, dedupe: DEDUPE, train: train.length, test: test.length, split_ts: splitTs, entry_modes: {}, baseline: [], rules: {} };

  /* ---- how each entry depth behaves, on the untouched test window -------- */
  for (const mode of MODES) {
    const idxs = pool.map((s, i) => i).filter((i) => pool[i].mode === mode);
    const testIdx = idxs.filter((i) => pool[i].t >= splitTs);
    report.entry_modes[mode] = {
      trades: idxs.length,
      test_trades: testIdx.length,
      video_plan_test: (() => { const r = testIdx.map((i) => pool[i].video_r); return { n: r.length, win: r.length ? (r.filter((x) => x > 0).length / r.length) * 100 : null, exp: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null }; })(),
      plans: PLANS.map((p, pi) => ({ plan: p.key, ...stats(testIdx, outs, pi), breakeven: breakeven(p) })),
    };
  }

  /* ---- second-chance re-entry, pooled ---------------------------------- */
  const secondTests = [];
  for (const mode of MODES) {
    const idxs = pool.map((s, i) => i).filter((i) => pool[i].mode === mode && pool[i].second && pool[i].second.first === 'loss');
    const retaps = idxs.filter((i) => pool[i].second.retap && pool[i].second.r !== null);
    const sumR = retaps.reduce((a, i) => a + pool[i].second.r, 0);
    const allOf = pool.filter((s) => s.mode === mode).length;
    secondTests.push({
      mode,
      stopped_before_target: idxs.length,
      retapped: retaps.length,
      retap_rate_pct: idxs.length ? (retaps.length / idxs.length) * 100 : null,
      second_win_rate: retaps.length ? (retaps.filter((i) => pool[i].second.r > 0).length / retaps.length) * 100 : null,
      second_expectancy_r: retaps.length ? sumR / retaps.length : null,
      net_effect_r_per_trade: allOf ? sumR / allOf : null,
    });
  }
  report.second_chance = secondTests;

  /* ---- what the trades actually paid, per market ------------------------ */
  const tracking = MODES.map((mode) => {
    const m = report.entry_modes[mode];
    if (!m) return null;
    const rows = m.plans.filter((p) => p.n >= 50);
    const best = rows.slice().sort((a, b) => b.exp - a.exp)[0] || null;
    const worst = rows.slice().sort((a, b) => a.exp - b.exp)[0] || null;
    return {
      mode,
      trades: m.trades,
      best_exit: best ? { plan: best.plan, expectancy_r: best.exp, clean: best.clean, needed: best.breakeven, gap_pts: best.clean - best.breakeven, n: best.n } : null,
      worst_exit: worst ? { plan: worst.plan, expectancy_r: worst.exp, clean: worst.clean, needed: worst.breakeven, gap_pts: worst.clean - worst.breakeven } : null,
      video_plan: m.video_plan_test,
    };
  }).filter(Boolean);
  report.breakeven_tracking = tracking;
  report.cost_table = costTable;
  report.target_frontier = frontierByTarget;

  /* ---- baseline over the whole test window ------------------------------ */
  report.baseline = PLANS.map((p, pi) => {
    const rs = test.map((i) => outs[i][pi]).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
    const median = rs.length ? rs[Math.floor(rs.length / 2)] : null;
    const trimmed = rs.length > 20 ? rs.slice(Math.floor(rs.length * 0.05), Math.ceil(rs.length * 0.95)) : rs;
    return { plan: p.key, ...stats(test, outs, pi), breakeven: breakeven(p), median_r: median, trimmed_expectancy_r: trimmed.length ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length : null };
  });

  /* ---- rule search: choose on train, report test ------------------------ */
  const RULES = rules();
  const all = [];
  for (const { id, mask } of RULES) {
    const tr = train.filter((i) => mask[i]);
    const te = test.filter((i) => mask[i]);
    if (tr.length < Number(argOf('min-train', 40))) continue;
    PLANS.forEach((p, pi) => all.push({ rule: id, plan: p.key, tr: stats(tr, outs, pi), te: stats(te, outs, pi) }));
  }
  const MIN_TEST_N = Number(argOf('min-test', 40));
  const survivors = all.filter((r) => r.tr.exp > 0 && r.tr.clean >= 50 && r.te.exp > 0 && r.te.clean >= 50 && r.te.n >= MIN_TEST_N)
    .sort((a, b) => b.te.exp - a.te.exp);
  const bestCleanTrain = all.slice().sort((a, b) => (b.tr.clean || 0) - (a.tr.clean || 0)).slice(0, 12);
  const bestCleanTest = all.filter((r) => r.te.n >= 15).slice().sort((a, b) => (b.te.clean || 0) - (a.te.clean || 0)).slice(0, 12);
  const above70test = all.filter((r) => r.te.n >= 15 && (r.te.clean || 0) >= 70);
  report.rules = {
    evaluated: all.length,
    combos: RULES.length,
    survivors,
    best_clean_train: bestCleanTrain,
    best_clean_test: bestCleanTest,
    above_70_test: above70test,
    selection_warning: `${above70test.length} of ${all.length} rule×exit combinations cross 70 % clean win rate on the test window — those are post-hoc picks, and the same table shows how many looked good on the training window and failed.`,
  };
  /* ---- rule × target frontier: can ANY filter reach 70 % win and still earn? --
   * The question "raise the success rate above 70 %" has two halves: a high hit
   * rate (bought by shortening the target) and a positive expectancy (bought by
   * lengthening it).  This cross-tabulates every single/pair filter against every
   * target distance on the untouched test window so the trade-off is explicit. */
  const flatPlans = PLANS.map((p, i) => (p.kind === 'flat' ? { i, target: p.target } : null)).filter(Boolean);
  const ruleFrontier = [];
  for (const { id, mask } of RULES) {
    const te = test.filter((i) => mask[i]);
    if (te.length < MIN_TEST_N) continue;
    const rows = flatPlans.map(({ i: pi, target }) => {
      let n = 0, win = 0, clean = 0, sum = 0;
      for (const i of te) {
        const r = outs[i][pi];
        if (r === null || r === undefined) continue;
        n++; if (r > 0) win++; if (r >= 0.5) clean++; sum += r;
      }
      return { target_r: target, n, win_pct: n ? (win / n) * 100 : null, clean_pct: n ? (clean / n) * 100 : null, expectancy_r: n ? sum / n : null };
    });
    const bestWin = rows.slice().sort((a, b) => (b.win_pct || 0) - (a.win_pct || 0))[0];
    const bestExp = rows.slice().sort((a, b) => (b.expectancy_r == null ? -9 : b.expectancy_r) - (a.expectancy_r == null ? -9 : a.expectancy_r))[0];
    const seventy = rows.filter((r) => (r.win_pct || 0) >= 70);
    ruleFrontier.push({
      rule: id, trades: te.length,
      best_win: bestWin, best_expectancy: bestExp,
      targets_at_70_win: seventy.map((r) => r.target_r),
      profitable_at_70_win: seventy.filter((r) => r.expectancy_r > 0).map((r) => ({ target_r: r.target_r, win_pct: r.win_pct, expectancy_r: r.expectancy_r })),
    });
  }
  const hitting70 = ruleFrontier.filter((r) => r.targets_at_70_win.length);
  const profitable70 = ruleFrontier.filter((r) => r.profitable_at_70_win.length);
  report.rule_frontier = {
    test_trades: test.length, min_test_n: MIN_TEST_N,
    rules_with_70_win: hitting70.length, rules_profitable_at_70: profitable70.length,
    best_win_overall: ruleFrontier.slice().sort((a, b) => (b.best_win.win_pct || 0) - (a.best_win.win_pct || 0)).slice(0, 10),
    best_expectancy_overall: ruleFrontier.slice().sort((a, b) => (b.best_expectancy.expectancy_r || -9) - (a.best_expectancy.expectancy_r || -9)).slice(0, 10),
    rows: ruleFrontier,
  };
  report.per_market = perMarket;

  /* ---- markdown --------------------------------------------------------- */
  const L = [];
  L.push('# Edge report — what win rate does the SMC model actually produce?');
  L.push('');
  L.push(`Generated **${started.toISOString().slice(0, 19).replace('T', ' ')} UTC** by \`node scripts/edge-report.js\` — re-run it yourself to reproduce every number below.`);
  L.push('');
  L.push(`* pooled trades: **${poolRaw}** filled samples${DEDUPE ? `, **${pool.length} unique setups** once overlapping samples are collapsed (the same zone is sampled on consecutive bars, so raw counts are correlated — \`--dedupe 0\` to see the raw pool)` : ''}`);
  L.push(`* ${MARKETS.length} market/timeframe combos, ${MODES.length} entry policies (\`${MODES.join('`, `')}\`)`);
  L.push(`* \`mtf\` = the refined entry: the HTF zone decides the trade, the lower timeframe (5m for 15m, 15m for 1h, 1h for 4h) must sweep liquidity **and** print a displacement candle inside the zone before the entry fires; the fill is a market entry at that confirmation close, so its window is limited by how much lower-timeframe history the data source returns (3 000 bars ≈ 750 higher-timeframe bars).`);
  L.push(`* ${pool.length} filled trades pooled · search set ${train.length} · untouched test set ${test.length} (split at ${new Date(splitTs).toISOString().slice(0, 10)})`);
  L.push(COST_MODE === 'flat'
    ? `* candles: ${BARS} bars per market, signal every ${STEP} bars; costs charged at a flat ${COST_R}R per trade (\`--cost flat\`)`
    : `* candles: ${BARS} bars per market, signal every ${STEP} bars; **costs are charged per instrument** — spread + slippage + commission per asset class, in basis points of price, turned into R by the trade's own stop distance (\`--cost instrument\`; mean ${f(costRef, 3)}R, median ${f(report.cost_median_r, 3)}R per trade). Pass \`--cost flat\` to reproduce the older 0.05R figures.`);
  L.push(`* trades whose stop sat closer than ${MIN_RISK_ATR} × ATR were dropped (${pool.dropped || 0} of ${pool.length + (pool.dropped || 0)}): at that distance R is a meaningless unit`);
  L.push(`* median expectancy is reported next to the mean, because one 9R tail trade can carry an average`);
  L.push(`* **a win = net ≥ +0.5R.** A scratched runner or a +0.2R scalp counts as *not* a win here.`);
  L.push('');
  if (COST_MODE !== 'flat') {
    L.push('## 0. What each trade paid to get in');
    L.push('');
    L.push('Round-trip cost in R, per market, measured on the pooled trades (spread + slippage + commission from `src/instruments.js`, converted to R by each trade\'s stop distance). A 15m FX entry with a 5-pip stop pays a very different bill from a 1h gold entry with a $35 stop — that difference is real money and it is why win rates below are read against the break-even column.');
    L.push('');
    L.push('| market | trades | median cost | mean cost | worst trade |');
    L.push('|---|---|---|---|---|');
    costTable.slice().sort((a, b) => b.median_r - a.median_r).forEach((c) => L.push(`| ${c.market} | ${c.trades} | ${f(c.median_r, 3)}R | ${f(c.mean_r, 3)}R | ${f(c.max_r, 3)}R |`));
    L.push('');
  }
  L.push('## 0b. Win rate is a dial you set with the target — the measured curve');
  L.push('');
  L.push('Each row is a plain flat exit: take the whole position off at `x`R, no partials, no break-even. Two different numbers are easy to confuse, so both are shown:');
  L.push('');
  L.push('* **target touched** — how often price reached `x`R before the stop. This is the *mechanical* hit rate of the exit.');
  L.push('* **net win** — how often the trade actually finished in profit **after costs**. For small targets these diverge, because the round-trip cost is subtracted from the `x`R you banked: if the cost exceeds the target, a "winning" exit still loses money.');
  L.push('');
  L.push('| target | trades | target touched | net win | net ≥ +0.5R | expectancy | break-even needed | margin |');
  L.push('|---|---|---|---|---|---|---|---|');
  frontierByTarget.forEach((t) => {
    const margin = t.win_pct - t.breakeven_pct;
    L.push(`| ${f(t.target_r, 2)}R | ${t.n} | ${pct(t.hit_pct)} | ${pct(t.win_pct)} | ${pct(t.clean_pct)} | ${f(t.expectancy_r)}R | ${pct(t.breakeven_pct)} | ${margin > 0 ? '+' : ''}${f(margin, 1)} pts |`);
  });
  const hit70 = frontierByTarget.filter((t) => t.hit_pct >= 70);
  const net70 = frontierByTarget.filter((t) => t.win_pct >= 70);
  L.push('');
  L.push(hit70.length
    ? `Targets whose *mechanical* hit rate reaches 70 %: ${hit70.map((t) => `${f(t.target_r, 2)}R (${pct(t.hit_pct)} touched, ${pct(t.win_pct)} net win, ${f(t.expectancy_r)}R expectancy)`).join(', ')}.`
    : '**No target distance reached a 70 % mechanical hit rate on this pool.**');
  L.push(net70.length
    ? `Targets with a **≥ 70 % net win rate**: ${net70.map((t) => `${f(t.target_r, 2)}R (${pct(t.win_pct)}, ${f(t.expectancy_r)}R)`).join(', ')}.`
    : '**No target distance reached a 70 % net win rate on this pool** — the net win rate peaks at ' + pct(Math.max(...frontierByTarget.map((t) => t.win_pct))) + ' and falls away on both sides of the peak.');
  const posExp = frontierByTarget.filter((t) => t.expectancy_r > 0);
  L.push(posExp.length
    ? `Targets with **positive expectancy**: ${posExp.map((t) => `${f(t.target_r, 2)}R (${pct(t.win_pct)} win, ${f(t.expectancy_r)}R)`).join(', ')}.`
    : '**No target distance earned a positive expectancy on this pool.**');
  L.push('');

  const rf = report.rule_frontier;
  L.push(`### Can any filter reach 70 % and still earn? (${rf.rules_with_70_win} of ${rf.rows.length} single/pair filters reach 70 % win at some target on the test window; ${rf.rules_profitable_at_70} of them keep a positive expectancy there)`);
  L.push('');
  if (rf.rules_profitable_at_70) {
    L.push('| filter | test trades | target at ≥70 % win | win % | expectancy |');
    L.push('|---|---|---|---|---|');
    rf.rows.filter((r) => r.profitable_at_70_win.length).slice(0, 10).forEach((r) => {
      r.profitable_at_70_win.forEach((x) => L.push(`| \`${r.rule}\` | ${r.trades} | ${f(x.target_r, 2)}R | ${pct(x.win_pct)} | ${f(x.expectancy_r)}R |`));
    });
  } else {
    L.push('**No single or paired filter reaches a 70 % win rate at any target distance while keeping a positive expectancy on the test window.** The closest win-rate outcomes and the most profitable filters are listed below so the trade-off is visible rather than hidden.');
  }
  L.push('');
  L.push('Highest win rate at any target (test window):');
  L.push('');
  L.push('| filter | test trades | best target | win % | expectancy there | its best expectancy (any target) |');
  L.push('|---|---|---|---|---|---|');
  rf.best_win_overall.forEach((r) => L.push(`| \`${r.rule}\` | ${r.trades} | ${f(r.best_win.target_r, 2)}R | ${pct(r.best_win.win_pct)} | ${f(r.best_win.expectancy_r)}R | ${f(r.best_expectancy.expectancy_r)}R @ ${f(r.best_expectancy.target_r, 2)}R |`));
  L.push('');
  L.push('Most profitable filters (test window):');
  L.push('');
  L.push('| filter | test trades | best target | expectancy | win % there | needs to break even |');
  L.push('|---|---|---|---|---|---|');
  rf.best_expectancy_overall.forEach((r) => {
    const be = ((1 + costRef) / (1 + (r.best_expectancy.target_r || 1))) * 100;
    L.push(`| \`${r.rule}\` | ${r.trades} | ${f(r.best_expectancy.target_r, 2)}R | ${f(r.best_expectancy.expectancy_r)}R | ${pct(r.best_expectancy.win_pct)} | ${pct(be)} |`);
  });
  L.push('');

  L.push('## 1. Entry policy, untouched test window');
  L.push('');
  L.push('| entry policy | filled trades | video plan (50 % at T1 → BE → runner) | best clean-win exit |');
  L.push('|---|---|---|---|');
  for (const mode of MODES) {
    const m = report.entry_modes[mode];
    if (!m) continue;
    const best = m.plans.filter((p) => p.n >= 15).slice().sort((a, b) => (b.clean || 0) - (a.clean || 0))[0];
    L.push(`| ${mode} | ${m.trades} (test ${m.test_trades}) | ${pct(m.video_plan_test.win)} wins · ${f(m.video_plan_test.exp)}R avg | ${best ? `${best.plan} → ${pct(best.clean)} clean · ${f(best.exp)}R` : '—'} |`);
  }
  L.push('');
  L.push('## 1b. Does the hit rate clear the break-even bar anywhere?');
  L.push('');
  L.push('For each entry policy, the best and worst exit on the untouched test window (n ≥ 50), with the gap between the clean-win rate actually achieved and the rate that exit needs just to survive. A real edge shows up as a **positive gap on a meaningful sample**.');
  L.push('');
  L.push('| entry policy | best exit | expectancy | clean % | needed % | gap | worst exit | gap |');
  L.push('|---|---|---|---|---|---|---|---|');
  report.breakeven_tracking.forEach((t) => {
    const b = t.best_exit, w = t.worst_exit;
    L.push(`| ${t.mode} | ${b ? `${b.plan} (n=${b.n})` : '—'} | ${f(b && b.expectancy_r)}R | ${pct(b && b.clean)} | ${pct(b && b.needed)} | ${b && b.gap_pts > 0 ? '+' : ''}${f(b && b.gap_pts, 1)} pts | ${w ? w.plan : '—'} | ${w && w.gap_pts > 0 ? '+' : ''}${f(w && w.gap_pts, 1)} pts |`);
  });
  L.push('');
  L.push('## 2. Exit frontier on the untouched test window (no filter)');
  L.push('');
  L.push('| exit plan | trades | win % | ≥ +0.5R % | expectancy | 5 %-trimmed expectancy | median | break-even win % needed |');
  L.push('|---|---|---|---|---|---|---|---|');
  report.baseline.forEach((b) => L.push(`| ${b.plan} | ${b.n} | ${pct(b.win)} | ${pct(b.clean)} | ${f(b.exp)}R | ${f(b.trimmed_expectancy_r)}R | ${f(b.median_r)}R | ${pct(b.breakeven)} |`));
  L.push('');
  L.push('## 2b. Second-chance re-entry (take the zone again after a failed first attempt)');
  L.push('');
  L.push('| entry policy | stopped before target | re-tapped | fake-out rate | 2nd attempt win % | 2nd attempt expectancy | net effect per trade |');
  L.push('|---|---|---|---|---|---|---|');
  report.second_chance.forEach((x) => L.push(`| ${x.mode} | ${x.stopped_before_target} | ${x.retapped} | ${pct(x.retap_rate_pct)} | ${pct(x.second_win_rate)} | ${f(x.second_expectancy_r)}R | ${f(x.net_effect_r_per_trade)}R |`));
  L.push('');
  L.push('The net-effect column is the honest one: the second attempt adds that much R to **every** trade in the pool, which is what happens to your equity if you systematically re-enter.');
  L.push('');
  L.push('## 3. Best filter combinations chosen on the search set');
  L.push('');
  L.push('| rule | exit | search: n / clean % / exp | test: n / clean % / exp |');
  L.push('|---|---|---|---|');
  bestCleanTrain.forEach((r) => L.push(`| ${r.rule} | ${r.plan} | ${r.tr.n} · ${pct(r.tr.clean)} · ${f(r.tr.exp)}R | ${r.te.n} · ${pct(r.te.clean)} · ${f(r.te.exp)}R |`));
  L.push('');
  L.push('## 4. Out of sample survivors (positive expectancy **and** ≥ 50 % clean in both halves)');
  L.push('');
  if (!survivors.length) {
    L.push('**None.** No filter × exit combination held a positive expectancy and a ≥ 50 % clean win rate in both halves of the data.');
  } else {
    L.push('| rule | exit | search | test |');
    L.push('|---|---|---|---|');
    survivors.slice(0, 20).forEach((r) => L.push(`| ${r.rule} | ${r.plan} | ${r.tr.n} · ${pct(r.tr.clean)} · ${f(r.tr.exp)}R | ${r.te.n} · ${pct(r.te.clean)} · ${f(r.te.exp)}R |`));
  }
  L.push('');
  L.push('## 5. The 70 % question');
  L.push('');
  L.push(`* Combinations evaluated: **${all.length}** (${RULES.length} filter rules × ${PLANS.length} exit plans).`);
  L.push(`* Rules crossing a **70 % clean win rate** on the test window: **${above70test.length}** (survivor rows additionally require n ≥ ${MIN_TEST_N} in the test window, so thin samples cannot be published as findings).`);
  L.push(`* ${report.rules.selection_warning}`);
  L.push(`* Best clean win rate that also has a positive expectancy in *both* halves: ${survivors.length ? `${pct(survivors[0].te.clean)} (${survivors[0].rule} + ${survivors[0].plan}, test n=${survivors[0].te.n})` : 'none'}.`);
  L.push('');
  L.push('### How to read this');
  L.push('');
  L.push('A 55 % win rate at a 1:2 target and a 70 % win rate at a 0.5R target are not the same trade — the second one needs a 66 % win rate just to break even. Every table above prints the break-even win rate next to the achieved one so the two can never be confused.');
  L.push('');
  L.push('## 6. Per market (video plan, latest replay)');
  L.push('');
  L.push('| market | filled | video plan win % | video plan expectancy | 70 % clean met? |');
  L.push('|---|---|---|---|---|');
  perMarket.forEach((m) => {
    const e = m.modes.entry || m.modes[MODES[0]] || {};
    const vp = e.video_plan || {};
    L.push(`| ${m.market} | ${e.filled || 0} | ${pct(vp.win_rate)} | ${f(vp.expectancy_r)}R | ${e.verdict ? (e.verdict.meets_target ? 'yes' : 'no') : '—'} |`);
  });
  L.push('');
  L.push('> These are walk-forward replays of the bot\'s own entry model on ~2 months of recent candles per market. One regime, one model, no live fills — read them as *what this model did*, never as a promise of what it will do.');
  L.push('');
  fs.writeFileSync(OUT, L.join('\n'));
  fs.writeFileSync(path.join(path.dirname(OUT), 'edge-report.json'), JSON.stringify(report, null, 2));

  /* ---- stdout summary --------------------------------------------------- */
  process.stdout.write(`\n=== pooled ${pool.length} trades · search ${train.length} · test ${test.length} ===\n`);
  process.stdout.write('entry depth            video plan (test)      best clean exit (test)\n');
  for (const mode of MODES) {
    const m = report.entry_modes[mode];
    if (!m) continue;
    const best = m.plans.filter((p) => p.n >= 15).slice().sort((a, b) => (b.clean || 0) - (a.clean || 0))[0];
    process.stdout.write(`${mode.padEnd(22)} ${pct(m.video_plan_test.win).padStart(8)} win ${f(m.video_plan_test.exp).padStart(7)}R   ${best ? `${best.plan} ${pct(best.clean)} clean ${f(best.exp)}R` : '—'}\n`);
  }
  process.stdout.write(`\nrules ${RULES.length} × exits ${PLANS.length} = ${all.length} evaluations\n`);
  process.stdout.write(`survivors (positive expectancy + ≥50% clean in both halves): ${survivors.length}\n`);
  process.stdout.write(`rules ≥70% clean on the test window: ${above70test.length}\n`);
  for (const x of report.second_chance) {
    process.stdout.write(`second chance (${x.mode}): re-tap ${pct(x.retap_rate_pct)}, 2nd attempt ${pct(x.second_win_rate)} win / ${f(x.second_expectancy_r)}R, net ${f(x.net_effect_r_per_trade)}R per trade\n`);
  }
  process.stdout.write(`\nwrote ${OUT} (+ edge-report.json next to it)\n`);
})();
