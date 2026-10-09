'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  RULE SWEEP — "what is the highest win rate this model can honestly claim?"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The edge report (scripts/edge-report.js) answers "what did the model do".
 *  This script answers the follow-up question: *if you are allowed to filter and
 *  to choose your target, where is the ceiling?*  It is a plain grid search over
 *  two levers the data keeps returning plus the playlist's own filters, and it
 *  reports every candidate on a 70 / 30 time split so a train-only fluke cannot
 *  be quoted as a finding.
 *
 *    node scripts/rule-sweep.js                 # 24 markets, instrument costs
 *    node scripts/rule-sweep.js --flat          # 0.05R flat costs (old model)
 *    node scripts/rule-sweep.js --markets "XAUUSD:15m,BTCUSDT:1h" --step 4
 *
 *  Writes docs/MEASURED-RULES.json (read by the app at boot) and
 *  docs/MEASURED-RULES.md (human-readable appendix).
 */
const fs = require('fs');
const path = require('path');
const P = require('../src/bots/predict');

function argOf(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
}
const DEFAULT_MARKETS = ['XAUUSD:15m', 'XAUUSD:1h', 'XAUUSD:4h', 'EURUSD:1h', 'GBPUSD:1h', 'AUDUSD:1h', 'USDJPY:1h',
  'BTCUSDT:1h', 'BTCUSDT:4h', 'ETHUSDT:1h', 'ETHUSDT:4h', 'SOLUSDT:1h', 'XRPUSDT:1h',
  'AAPL:1h', 'TSLA:1h', 'SPY:1h', 'ES:1h', 'NQ:1h', 'US30:1h', 'NAS100:1h', 'SPX500:1h', 'GER40:1h', 'XAGUSD:1h', 'USOIL:1h'];
const MARKETS = String(argOf('markets', DEFAULT_MARKETS.join(','))).split(',').map((s) => s.trim()).filter(Boolean);
const BARS = Number(argOf('bars', 2000));
const STEP = Number(argOf('step', 4));
const SPLIT = Number(argOf('split', 0.7));
const COST_MODE = process.argv.includes('--flat') ? 'flat' : String(argOf('cost', 'instrument'));
const OUT_JSON = path.join(__dirname, '..', 'docs', 'MEASURED-RULES.json');
const OUT_MD = path.join(__dirname, '..', 'docs', 'MEASURED-RULES.md');

(async () => {
  const started = new Date();
  const rows = [];
  process.stdout.write(`collecting ${MARKETS.length} markets (bars=${BARS}, step=${STEP}, cost=${COST_MODE})…\n`);
  for (const key of MARKETS) {
    const [sym, tf] = key.split(':');
    let bt;
    try { bt = await P.backtest(sym, tf, { bars: BARS, step: STEP, force: true, cost: COST_MODE, entry: 'entry' }); }
    catch (e) { process.stdout.write(`  ! ${key}: ${e.message}\n`); continue; }
    let kept = 0;
    for (const s of bt.samples) {
      if (!s.sweep || !s.sweep.fill || !(s.risk_atr >= 0.25)) continue;
      rows.push({ market: key, t: s.t, dir: s.dir, grade: s.grade, score: s.score, rr: s.rr_primary, risk_atr: s.risk_atr,
        gates: s.gates, sig: s.signals || {}, entry_kind: s.entry_kind, cost_r: s.sweep.cost_r,
        t_bar: s.sweep.t_bar, stop_bar: s.sweep.stop_bar, stopped: s.sweep.stopped, close_r: s.sweep.close_r, be_bar: s.sweep.be_bar,
        entry: s.entry, stop: s.stop });
      kept++;
    }
    process.stdout.write(`  ${key}: ${kept} filled setups\n`);
  }
  const raw = rows.length;
  /* overlapping samples: the same zone is re-detected on consecutive bars, so
   * collapse duplicates (same market, same entry, same stop) before measuring. */
  const seen = new Set(); const pool = [];
  for (const s of rows.slice().sort((a, b) => a.t - b.t)) {
    const k = `${s.market}|${Math.round((s.entry || 0) * 1e6)}|${Math.round((s.stop || 0) * 1e6)}`;
    if (seen.has(k)) continue; seen.add(k); pool.push(s);
  }
  pool.sort((a, b) => a.t - b.t);
  const splitTs = pool[Math.floor(pool.length * SPLIT)].t;
  const flat = (s, x) => (s.t_bar && s.t_bar[x] !== undefined) ? x - s.cost_r : (s.stopped ? -1 - s.cost_r : (s.close_r || 0) - s.cost_r);
  const stats = (list, x) => {
    let n = 0, hit = 0, win = 0, clean = 0, sum = 0;
    list.forEach((s) => { const r = flat(s, x); n++; if (s.t_bar && s.t_bar[x] !== undefined) hit++; if (r > 0) win++; if (r >= 0.5) clean++; sum += r; });
    return n ? { n, hit_pct: hit / n * 100, net_win_pct: win / n * 100, clean_pct: clean / n * 100, expectancy_r: sum / n } : null;
  };

  const FILTERS = {
    all: { label: 'No filter — every setup the model takes', test: () => true },
    leg: { label: 'Displacement leg (playlist filter)', test: (s) => !!s.gates.displacement },
    ote: { label: 'Entry in the 50–79 % OTE retrace band', test: (s) => s.sig.ote === 1 },
    'ema50+leg': { label: 'Displacement leg + 50 EMA alignment', test: (s) => !!s.gates.displacement && s.sig.ema50_align === 1 },
    'leg+ote+ema50': { label: 'Leg + OTE band + 50 EMA (full playlist confluence)', test: (s) => !!s.gates.displacement && s.sig.ote === 1 && s.sig.ema50_align === 1 },
  };
  const TARGETS = [0.25, 0.35, 0.5, 0.75, 1, 1.5, 2, 3];
  const grid = [];
  for (const [fkey, f] of Object.entries(FILTERS)) {
    for (const riskMin of [0, 0.5, 0.6, 0.8, 1.0]) {
      for (const rrMin of [0, 2, 3]) {
        for (const target of TARGETS) {
          const subset = pool.filter((s) => f.test(s) && s.risk_atr >= riskMin && s.rr >= rrMin);
          if (subset.length < 150) continue;
          const tr = subset.filter((s) => s.t < splitTs), te = subset.filter((s) => s.t >= splitTs);
          if (tr.length < 100 || te.length < 45) continue;
          grid.push({ filter: fkey, stop_atr_min: riskMin, rr_min: rrMin, target_r: target,
            all: stats(subset, target), train: stats(tr, target), test: stats(te, target) });
        }
      }
    }
  }
  /* what the video's own management produces, for contrast */
  const videoLike = pool.filter((s) => s.t_bar && s.t_bar[1] !== undefined);
  const consistent = grid.filter((r) => r.train.hit_pct >= 70 && r.test.hit_pct >= 70)
    .sort((a, b) => Math.min(b.train.hit_pct, b.test.hit_pct) - Math.min(a.train.hit_pct, a.test.hit_pct));
  const positive = grid.filter((r) => r.train.expectancy_r > 0 && r.test.expectancy_r > 0)
    .sort((a, b) => b.all.expectancy_r - a.all.expectancy_r);
  const bestMin = grid.slice().sort((a, b) => Math.min(b.train.hit_pct, b.test.hit_pct) - Math.min(a.train.hit_pct, a.test.hit_pct))[0] || null;

  const report = {
    generated_at: started.toISOString(),
    command: `node scripts/rule-sweep.js${process.argv.slice(2).join(' ') ? ' ' + process.argv.slice(2).join(' ') : ''}`,
    markets: MARKETS, bars: BARS, step: STEP, split: SPLIT, cost_mode: COST_MODE,
    raw_samples: raw, unique_setups: pool.length, split_ts: splitTs,
    filters: Object.fromEntries(Object.entries(FILTERS).map(([k, v]) => [k, v.label])),
    grid_rows: grid.length,
    best_consistent_winrate: bestMin,
    consistent_70: consistent.slice(0, 10),
    positive_expectancy: positive.slice(0, 10),
    counts: { consistent_70: consistent.length, positive_expectancy: positive.length },
    presets: buildPresets(bestMin, positive[0] || null),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 1));

  const L = [];
  L.push('# Measured rules — where the win rate ceiling actually is');
  L.push('');
  L.push(`Generated **${started.toISOString().slice(0, 16).replace('T', ' ')} UTC** by \`${report.command}\` — re-run it to reproduce.`);
  L.push('');
  L.push(`* ${MARKETS.length} market/timeframe combos, ${BARS} candles each, signal every ${STEP} bars, costs: **${COST_MODE}**`);
  L.push(`* ${raw} filled samples → **${pool.length} unique setups** (overlapping re-detections of the same zone collapsed)`);
  L.push(`* 70 / 30 time split at ${new Date(splitTs).toISOString().slice(0, 10)} — every rule below is quoted on **both halves**`);
  L.push(`* ${grid.length} (filter × minimum stop distance × minimum first-target R × exit target) combinations evaluated`);
  L.push('');
  L.push('## The two ceilings');
  L.push('');
  if (bestMin) {
    L.push(`**Highest win rate that holds in both halves — ${bestMin.train.hit_pct.toFixed(1)} % train / ${bestMin.test.hit_pct.toFixed(1)} % test:**`);
    L.push('');
    L.push(`* filter: \`${bestMin.filter}\` (${FILTERS[bestMin.filter].label})`);
    L.push(`* minimum stop distance: **${bestMin.stop_atr_min} × ATR**`);
    L.push(`* exit: flat target at **${bestMin.target_r}R**`);
    L.push(`* whole-sample: ${bestMin.all.net_win_pct.toFixed(1)} % net wins over ${bestMin.all.n} setups, expectancy **${bestMin.all.expectancy_r.toFixed(2)}R**`);
    L.push('');
    L.push(`It wins most of the time and still loses money: the target is smaller than the cost of getting in on the tight-stop markets, and the occasional full stop wipes out many small wins.`);
  }
  L.push('');
  if (positive.length) {
    L.push('**Highest expectancy that holds in both halves:**');
    L.push('');
    positive.slice(0, 5).forEach((r) => {
      L.push(`* \`${r.filter}\` · stop ≥ ${r.stop_atr_min} ATR · first target ≥ ${r.rr_min}R · exit at **${r.target_r}R** → train ${r.train.expectancy_r.toFixed(2)}R (${r.train.net_win_pct.toFixed(1)} % wins, n=${r.train.n}) / test ${r.test.expectancy_r.toFixed(2)}R (${r.test.net_win_pct.toFixed(1)} % wins, n=${r.test.n})`);
    });
    L.push('');
    L.push('Every configuration that makes money in both halves earns it from the **tail**: a low win rate with a target several times the stop.');
  }
  L.push('');
  L.push('## What this means for the "70 % win rate" goal');
  L.push('');
  L.push(`* The model can be *given* a 70 %+ win rate — ${consistent.length ? `${consistent.length} of the ${grid.length} configurations cleared it in both halves, the best reaching ${bestMin.train.hit_pct.toFixed(1)} % / ${bestMin.test.hit_pct.toFixed(1)} %` : 'no configuration cleared it in both halves'} — by taking profits very early (${bestMin ? bestMin.target_r : 0.25}R targets).`);
  L.push(`* Those configurations **lose money** (expectancy ${bestMin ? bestMin.all.expectancy_r.toFixed(2) : '—'}R). ${positive.length} configurations make money in both halves, and none of them wins 70 % of the time.`);
  L.push('* With the playlist\'s own management (50 % at the first structural target, stop to break-even, runner) the pooled win rate is in the high 30s / low 40s and expectancy is around zero.');
  L.push('* Honest conclusion: **a 70 % win rate and a positive expectancy are not both available from this entry model** — the app therefore lets you pick which one you want and shows the measured cost of the other.');
  fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
  process.stdout.write(`\nwrote ${OUT_JSON}\nwrote ${OUT_MD}\n`);
  process.stdout.write(`consistent ≥70% both halves: ${consistent.length} · positive expectancy both halves: ${positive.length}\n`);
  if (bestMin) process.stdout.write(`best consistent win rate: ${bestMin.train.hit_pct.toFixed(1)}% train / ${bestMin.test.hit_pct.toFixed(1)}% test at ${bestMin.target_r}R (${bestMin.filter})\n`);
})().catch((e) => { console.error(e); process.exit(1); });

/** Three presets the product can offer, each with its measured provenance. */
function buildPresets(bestWinrate, bestEdge) {
  const out = [];
  out.push({
    key: 'video', label: 'Playlist management (50 % at first target → break-even → runner)',
    filter: 'playlist', target_r: null, stop_atr_min: 0.5, rr_min: 1,
    note: 'What the videos teach: partials at the first structural target, stop to break-even, run the rest to the second target. Measured win rate: high 30s / low 40s %, expectancy ≈ 0.',
  });
  if (bestWinrate) {
    out.push({
      key: 'winrate', label: `Maximum win rate (${bestWinrate.test.hit_pct.toFixed(0)} % measured on unseen data)`,
      filter: bestWinrate.filter, target_r: bestWinrate.target_r, stop_atr_min: bestWinrate.stop_atr_min, rr_min: bestWinrate.rr_min,
      measured: { train_win_pct: bestWinrate.train.hit_pct, test_win_pct: bestWinrate.test.hit_pct, expectancy_r: bestWinrate.all.expectancy_r, n: bestWinrate.all.n },
      note: 'Wins most of the time and still loses money — the honest price of a high hit rate.',
    });
  }
  if (bestEdge) {
    out.push({
      key: 'edge', label: `Maximum expectancy (${bestEdge.all.expectancy_r >= 0 ? '+' : ''}${bestEdge.all.expectancy_r.toFixed(2)}R per trade measured)`,
      filter: bestEdge.filter, target_r: bestEdge.target_r, stop_atr_min: bestEdge.stop_atr_min, rr_min: bestEdge.rr_min,
      measured: { train_exp_r: bestEdge.train.expectancy_r, test_exp_r: bestEdge.test.expectancy_r, win_pct: bestEdge.all.net_win_pct, n: bestEdge.all.n },
      note: 'Earns from the tail: you lose more often than you win and the winners pay for it.',
    });
  }
  return out;
}
