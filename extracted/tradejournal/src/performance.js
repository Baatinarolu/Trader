'use strict';
/**
 * performance.js — the analytics engine.
 *
 * Every number the journal shows is computed here from the raw trade rows so the
 * UI, the coach, the exporter and the API can never disagree with each other.
 * All statistics are multi-asset safe because each trade already carries a
 * normalised `risk_amount`, `net_pnl` and `r_multiple`.
 */

const num = (v, d = 0) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

/* ------------------------------------------------------------------ sessions */
const SESSIONS = [
  { key: 'sydney', label: 'Sydney', start: 21, end: 6, colour: '#8b7cf6' },
  { key: 'tokyo', label: 'Tokyo', start: 0, end: 9, colour: '#f7b955' },
  { key: 'london', label: 'London', start: 7, end: 16, colour: '#4f8cff' },
  { key: 'newyork', label: 'New York', start: 12, end: 21, colour: '#3ddc97' },
  { key: 'overlap', label: 'London/NY Overlap', start: 12, end: 16, colour: '#ff6b9d' },
];

function utcParts(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return { h: d.getUTCHours() + d.getUTCMinutes() / 60, dowUTC: d.getUTCDay(), d };
}

/** Primary trading session for a timestamp (UTC-based, standard FX session map). */
function sessionOf(iso) {
  const p = utcParts(iso);
  if (!p) return '';
  const h = p.h;
  if (h >= 12 && h < 16) return 'overlap';
  if (h >= 7 && h < 12) return 'london';
  if (h >= 16 && h < 21) return 'newyork';
  if (h >= 0 && h < 7) return 'tokyo';
  return 'sydney';
}
const SESSION_LABEL = (k) => (SESSIONS.find((s) => s.key === k) || {}).label || (k === 'asia' ? 'Asia' : (k || '—'));

/** Local hour / weekday in a given IANA timezone (used for time-of-day analysis). */
function localParts(iso, tz = 'Africa/Lagos') {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    });
    const parts = fmt.formatToParts(d);
    const hh = Number(parts.find((p) => p.type === 'hour').value);
    const mm = Number(parts.find((p) => p.type === 'minute').value);
    const wd = parts.find((p) => p.type === 'weekday').value;
    return { hour: hh + mm / 60, hourInt: hh, weekday: wd, weekdayIndex: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd) };
  } catch {
    return { hour: d.getUTCHours(), hourInt: d.getUTCHours(), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()], weekdayIndex: (d.getUTCDay() + 6) % 7 };
  }
}
function localDateStr(iso, tz = 'Africa/Lagos') {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Decorate a raw DB trade with computed analysis fields. */
function decorate(t, tz) {
  const out = { ...t };
  out.session = t.session || sessionOf(t.opened_at);
  out.session_label = SESSION_LABEL(out.session);
  const lp = localParts(t.opened_at, tz) || {};
  out.hour = lp.hourInt ?? null;
  out.weekday = lp.weekday ?? '';
  out.weekday_index = lp.weekdayIndex ?? null;
  out.day = localDateStr(t.opened_at, tz);
  out.close_day = t.closed_at ? localDateStr(t.closed_at, tz) : null;
  out.dir_sign = String(t.direction).toLowerCase() === 'short' ? -1 : 1;
  out.is_win = num(t.net_pnl) > 0.005;
  out.is_loss = num(t.net_pnl) < -0.005;
  out.is_be = !out.is_win && !out.is_loss;
  out.tags_arr = splitTags(t.tags);
  out.mistakes_arr = splitTags(t.mistakes);
  if (t.opened_at && t.closed_at) {
    const ms = new Date(t.closed_at) - new Date(t.opened_at);
    out.hold_minutes = ms > 0 ? Math.round(ms / 60000) : 0;
  } else out.hold_minutes = null;
  out.risk_used = num(t.risk_amount) || null;
  // scale-outs: surface the leg count and the pct-weighted exit the P&L used,
  // so an API caller can see the trade was closed in pieces without parsing JSON
  let legsArr = [];
  if (Array.isArray(t.legs)) legsArr = t.legs;
  else if (typeof t.legs === 'string' && t.legs.trim().startsWith('[')) { try { legsArr = JSON.parse(t.legs); } catch { legsArr = []; } }
  legsArr = (legsArr || []).filter((l) => l && num(l.pct) > 0 && l.price != null);
  out.legs_n = legsArr.length;
  out.weighted_exit = legsArr.length
    ? r4(legsArr.reduce((acc, l) => acc + num(l.pct) * num(l.price), 0) / legsArr.reduce((acc, l) => acc + num(l.pct), 0))
    : null;
  return out;
}
function splitTags(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  return String(s).split(',').map((x) => x.trim()).filter(Boolean);
}
function holdBucket(min) {
  if (min == null) return 'unknown';
  if (min < 5) return '<5m (scalp)';
  if (min < 15) return '5–15m';
  if (min < 60) return '15–60m';
  if (min < 240) return '1–4h';
  if (min < 1440) return '4h–1d';
  if (min < 7200) return '1–5d';
  return '5d+';
}

/* ---------------------------------------------------------------- statistics */
function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function percentile(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[idx];
}

/**
 * Core KPI block.  `trades` must be decorated closed trades sorted by close time.
 */
function kpis(trades, opts = {}) {
  const startBal = num(opts.startingBalance, 10000);
  const closed = trades.filter((t) => t.status !== 'open');
  const n = closed.length;
  const pnls = closed.map((t) => num(t.net_pnl));
  const rs = closed.map((t) => num(t.r_multiple));
  const wins = closed.filter((t) => t.is_win);
  const losses = closed.filter((t) => t.is_loss);
  const bes = closed.filter((t) => t.is_be);
  const gp = sum(wins.map((t) => num(t.net_pnl)));
  const gl = Math.abs(sum(losses.map((t) => num(t.net_pnl))));
  const net = sum(pnls);
  const fees = sum(closed.map((t) => num(t.fees)));
  const gross = sum(closed.map((t) => num(t.gross_pnl)));
  const winRate = n ? wins.length / n : 0;
  const avgWin = wins.length ? gp / wins.length : 0;
  const avgLoss = losses.length ? gl / losses.length : 0;
  const payoff = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);
  const profitFactor = gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0);
  const expectancy = n ? net / n : 0;
  const expectancyR = n ? mean(rs) : 0;
  const sdR = stdev(rs);
  const sqn = n >= 2 && sdR > 0 ? Math.min(100, (Math.sqrt(n) * expectancyR) / sdR) : 0;
  const kelly = payoff && isFinite(payoff) && payoff > 0 ? winRate - (1 - winRate) / payoff : 0;

  const risks = closed.map((t) => num(t.risk_amount)).filter((v) => v > 0);
  const avgRisk = risks.length ? mean(risks) : 0;
  const riskStdPct = avgRisk ? (stdev(risks) / avgRisk) * 100 : 0;

  const winHold = mean(wins.map((t) => num(t.hold_minutes, 0)));
  const lossHold = mean(losses.map((t) => num(t.hold_minutes, 0)));

  const eq = equityCurve(closed, startBal);
  const dd = drawdownStats(eq);

  const daily = dailySeries(closed);
  const dayReturns = Object.values(daily).map((d) => d.pnl);
  const dayEquityBase = startBal;
  const rets = dayReturns.map((v) => v / dayEquityBase);
  const sharpe = annualisedSharpe(rets);
  const sortino = annualisedSortino(rets);

  const maeVals = closed.map((t) => t.mae_r).filter((v) => v !== null && v !== undefined && !isNaN(v));
  const mfeVals = closed.map((t) => t.mfe_r).filter((v) => v !== null && v !== undefined && !isNaN(v));
  const winnerR = wins.map((t) => num(t.r_multiple));
  const winnerMfe = wins.map((t) => num(t.mfe_r)).filter((v) => v > 0);
  const capture = winnerMfe.length && mean(winnerMfe) > 0 ? mean(winnerR) / mean(winnerMfe) : null;
  const rejected = closed.filter((t) => t.mae_r !== null && t.mae_r !== undefined && num(t.mae_r) < -1.001);

  const exitsCounts = {};
  for (const t of closed) {
    const k = t.exit_reason || deriveExitReason(t);
    exitsCounts[k] = (exitsCounts[k] || 0) + 1;
  }

  const sortedWins = [...wins].sort((a, b) => num(b.net_pnl) - num(a.net_pnl));
  const top5 = sum(sortedWins.slice(0, 5).map((t) => num(t.net_pnl)));

  return {
    trades: n, wins: wins.length, losses: losses.length, breakevens: bes.length,
    win_rate: r2(winRate * 100), loss_rate: r2((n ? losses.length / n : 0) * 100),
    net_pnl: r2(net), gross_pnl: r2(gross), fees: r2(fees), fees_pct: gross ? r2((fees / Math.abs(gross)) * 100) : 0,
    gross_profit: r2(gp), gross_loss: r2(gl),
    avg_win: r2(avgWin), avg_loss: r2(avgLoss), payoff: isFinite(payoff) ? r2(payoff) : null,
    profit_factor: isFinite(profitFactor) ? r2(profitFactor) : null,
    expectancy: r2(expectancy), expectancy_r: r4(expectancyR),
    total_r: r2(sum(rs)), avg_r: r4(mean(rs)), median_r: r4(median(rs)),
    std_r: r4(sdR), sqn: r2(sqn), kelly: r2(kelly * 100),
    best_trade: closed.length ? r2(Math.max(...pnls)) : 0,
    worst_trade: closed.length ? r2(Math.min(...pnls)) : 0,
    best_r: rs.length ? r4(Math.max(...rs)) : 0,
    worst_r: rs.length ? r4(Math.min(...rs)) : 0,
    max_drawdown: dd.maxDD, max_drawdown_pct: dd.maxDDPct,
    current_drawdown: dd.currentDD, current_drawdown_pct: dd.currentDDPct,
    recovery_factor: Math.abs(dd.maxDD) > 0.01 ? r2(net / Math.abs(dd.maxDD)) : null,
    sharpe: r2(sharpe), sortino: r2(sortino),
    calmar: Math.abs(dd.maxDDPct) > 0.01 ? r2((((net / startBal) * 100 * (365 / Math.max(1, daysBetween(closed)))) / Math.abs(dd.maxDDPct))) : null,
    avg_risk: r2(avgRisk), avg_risk_pct_of_balance: startBal ? r2((avgRisk / startBal) * 100) : 0,
    risk_consistency: r2(riskStdPct),
    avg_hold_minutes: r2(mean(closed.map((t) => num(t.hold_minutes, 0)))),
    avg_win_hold: r2(winHold), avg_loss_hold: r2(lossHold),
    hold_asymmetry: lossHold > 0 ? r2(winHold / lossHold) : null,
    avg_mae_r: maeVals.length ? r4(mean(maeVals)) : null,
    avg_mfe_r: mfeVals.length ? r4(mean(mfeVals)) : null,
    mae_coverage: closed.length ? r2((maeVals.length / closed.length) * 100) : 0,
    capture_efficiency: capture === null ? null : r2(capture * 100),
    stops_overshot: rejected.length,
    avg_adherence: mean(closed.map((t) => num(t.adherence, 0)).filter((v) => v > 0)) || null,
    profit_concentration: gp > 0 ? r2((top5 / gp) * 100) : null,
    streaks: streaks(closed),
    trading_days: Object.keys(daily).length,
    avg_trades_per_day: Object.keys(daily).length ? r2(n / Object.keys(daily).length) : 0,
    exit_reasons: exitsCounts,
    period: periodOf(closed),
  };
}

function deriveExitReason(t) {
  if (t.exit_reason) return t.exit_reason;
  const r = num(t.r_multiple);
  if (t.stop && t.exit && num(t.size)) {
    const hitStop = Math.abs(num(t.exit) - num(t.stop)) / (Math.abs(num(t.entry) - num(t.stop)) || 1) < 0.12;
    if (hitStop) return 'Stop loss';
  }
  if (t.target && t.exit && Math.abs(num(t.exit) - num(t.target)) / (Math.abs(num(t.target) - num(t.entry)) || 1) < 0.08) return 'Target';
  if (r > 0) return 'Discretionary win';
  if (r < 0) return 'Discretionary loss';
  return 'Breakeven / scratch';
}

/** Cumulative equity, peak and drawdown series. */
function equityCurve(closed, startBal) {
  const sorted = [...closed].sort((a, b) => new Date(a.closed_at || a.opened_at) - new Date(b.closed_at || b.opened_at));
  let eq = num(startBal, 10000);
  let peak = eq;
  const out = [{ i: 0, t: sorted[0] ? sorted[0].opened_at : null, equity: r2(eq), peak: r2(peak), dd: 0, dd_pct: 0, r_cum: 0, label: 'Start' }];
  let rCum = 0;
  sorted.forEach((t, i) => {
    eq += num(t.net_pnl);
    rCum += num(t.r_multiple);
    peak = Math.max(peak, eq);
    out.push({
      i: i + 1, id: t.id, symbol: t.symbol,
      t: t.closed_at || t.opened_at, equity: r2(eq), peak: r2(peak),
      dd: r2(eq - peak), dd_pct: peak ? r2(((eq - peak) / peak) * 100) : 0,
      r_cum: r4(rCum), label: t.symbol,
    });
  });
  return out;
}

function drawdownStats(eq) {
  let maxDD = 0, maxDDPct = 0, peak = eq[0] ? eq[0].equity : 0;
  for (const p of eq) {
    peak = Math.max(peak, p.equity);
    const dd = p.equity - peak;
    const ddp = peak ? (dd / peak) * 100 : 0;
    if (Math.abs(dd) > Math.abs(maxDD)) { maxDD = dd; maxDDPct = ddp; }
  }
  const last = eq[eq.length - 1] || { equity: 0 };
  const runPeak = Math.max(...eq.map((p) => p.equity), 0);
  return {
    maxDD: r2(maxDD), maxDDPct: r2(maxDDPct),
    currentDD: r2(last.equity - runPeak), currentDDPct: runPeak ? r2(((last.equity - runPeak) / runPeak) * 100) : 0,
  };
}

function dailySeries(closed) {
  const out = {};
  for (const t of closed) {
    const d = t.close_day || t.day;
    if (!d) continue;
    if (!out[d]) out[d] = { date: d, pnl: 0, r: 0, trades: 0, wins: 0, losses: 0, risk: 0, fees: 0 };
    const o = out[d];
    o.pnl += num(t.net_pnl); o.r += num(t.r_multiple); o.trades += 1;
    if (t.is_win) o.wins += 1; else if (t.is_loss) o.losses += 1;
    o.risk += num(t.risk_amount); o.fees += num(t.fees);
  }
  for (const k of Object.keys(out)) { out[k].pnl = r2(out[k].pnl); out[k].r = r4(out[k].r); out[k].risk = r2(out[k].risk); }
  return out;
}

function monthlySeries(closed) {
  const out = {};
  for (const t of closed) {
    const d = t.close_day || t.day;
    if (!d) continue;
    const key = d.slice(0, 7);
    if (!out[key]) out[key] = { month: key, pnl: 0, r: 0, trades: 0, wins: 0, losses: 0 };
    const o = out[key];
    o.pnl += num(t.net_pnl); o.r += num(t.r_multiple); o.trades += 1;
    if (t.is_win) o.wins += 1; else if (t.is_loss) o.losses += 1;
  }
  for (const k of Object.keys(out)) { out[k].pnl = r2(out[k].pnl); out[k].r = r4(out[k].r); out[k].win_rate = out[k].trades ? r2((out[k].wins / out[k].trades) * 100) : 0; }
  return out;
}

function streaks(closed) {
  const sorted = [...closed].sort((a, b) => new Date(a.closed_at || a.opened_at) - new Date(b.closed_at || b.opened_at));
  let best = 0, worst = 0, curW = 0, curL = 0;
  let bW = 0, bL = 0, cW = 0, cL = 0;
  for (const t of sorted) {
    if (t.is_win) { curW++; curL = 0; } else if (t.is_loss) { curL++; curW = 0; } else { curW = 0; curL = 0; }
    best = Math.max(best, curW); worst = Math.max(worst, curL);
    bW = curW; bL = curL;
  }
  return { longest_win: best, longest_loss: worst, current: bW > 0 ? bW : -bL, current_type: bW > 0 ? 'win' : (bL > 0 ? 'loss' : 'none') };
}

function annualisedSharpe(returns) {
  if (returns.length < 3) return 0;
  const sd = stdev(returns);
  return sd ? (mean(returns) / sd) * Math.sqrt(252) : 0;
}
function annualisedSortino(returns) {
  if (returns.length < 3) return 0;
  const downs = returns.filter((r) => r < 0);
  if (!downs.length) return 0;
  const dd = Math.sqrt(downs.reduce((s, v) => s + v * v, 0) / downs.length);
  return dd ? (mean(returns) / dd) * Math.sqrt(252) : 0;
}
function daysBetween(closed) {
  if (!closed.length) return 1;
  const dates = closed.map((t) => new Date(t.close_day || t.closed_at || t.opened_at).getTime()).sort();
  const days = (dates[dates.length - 1] - dates[0]) / 864e5;
  return Math.max(1, days);
}
function periodOf(closed) {
  if (!closed.length) return null;
  const dates = closed.map((t) => t.close_day || t.day).filter(Boolean).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

/* ------------------------------------------------------- grouping / segments */
/**
 * Group trades by an arbitrary key function and return KPI rows sorted by impact.
 */
function segment(trades, keyFn, { minTrades = 1, label = 'group' } = {}) {
  const map = new Map();
  for (const t of trades) {
    const keys = [].concat(keyFn(t)).filter((k) => k !== null && k !== undefined && k !== '');
    for (const k of keys) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
  }
  const rows = [];
  for (const [k, list] of map) {
    if (list.length < minTrades) continue;
    const net = sum(list.map((t) => num(t.net_pnl)));
    const rs = list.map((t) => num(t.r_multiple));
    const w = list.filter((t) => t.is_win).length;
    const l = list.filter((t) => t.is_loss).length;
    const gp = sum(list.filter((t) => t.is_win).map((t) => num(t.net_pnl)));
    const gl = Math.abs(sum(list.filter((t) => t.is_loss).map((t) => num(t.net_pnl))));
    rows.push({
      key: k, label: String(k), trades: list.length, net_pnl: r2(net),
      total_r: r2(sum(rs)), expectancy_r: r4(mean(rs)), expectancy: r2(net / list.length),
      win_rate: list.length ? r2((w / list.length) * 100) : 0,
      wins: w, losses: l,
      profit_factor: gl > 0 ? r2(gp / gl) : (gp > 0 ? null : 0),
      avg_hold: r2(mean(list.map((t) => num(t.hold_minutes, 0)))),
      avg_risk: r2(mean(list.map((t) => num(t.risk_amount, 0)))),
      std_r: r4(stdev(rs)),
      contribution: 0,
    });
  }
  const total = sum(rows.map((r) => Math.abs(r.net_pnl))) || 1;
  for (const row of rows) row.contribution = r2((Math.abs(row.net_pnl) / total) * 100);
  rows.sort((a, b) => b.net_pnl - a.net_pnl);
  return rows;
}

/** Histogram of R-multiples. */
function rDistribution(trades) {
  const buckets = [
    { label: '≤ -2R', min: -Infinity, max: -2 },
    { label: '-2R to -1R', min: -2, max: -1 },
    { label: '-1R to 0', min: -1, max: 0 },
    { label: '0 to +1R', min: 0, max: 1 },
    { label: '+1R to +2R', min: 1, max: 2 },
    { label: '+2R to +3R', min: 2, max: 3 },
    { label: '+3R to +5R', min: 3, max: 5 },
    { label: '> +5R', min: 5, max: Infinity },
  ];
  const out = buckets.map((b) => ({ ...b, count: 0, pnl: 0 }));
  for (const t of trades) {
    const r = num(t.r_multiple);
    const b = out.find((x) => r > x.min && r <= x.max) || out[2];
    b.count += 1; b.pnl += num(t.net_pnl);
  }
  return out.map((b) => ({ label: b.label, count: b.count, pnl: r2(b.pnl) }));
}

/** Day-of-week and hour-of-day grids (uses the journal timezone). */
function timeGrids(trades) {
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => {
    const list = trades.filter((t) => t.weekday_index === i);
    return { key: d, ...slim(list) };
  });
  const hours = Array.from({ length: 24 }, (_, h) => {
    const list = trades.filter((t) => t.hour === h);
    return { key: h, label: `${String(h).padStart(2, '0')}:00`, ...slim(list) };
  });
  return { dow, hours };
}
function slim(list) {
  const rs = list.map((t) => num(t.r_multiple));
  const net = sum(list.map((t) => num(t.net_pnl)));
  const w = list.filter((t) => t.is_win).length;
  const l = list.filter((t) => t.is_loss).length;
  const gp = sum(list.filter((t) => t.is_win).map((t) => num(t.net_pnl)));
  const gl = Math.abs(sum(list.filter((t) => t.is_loss).map((t) => num(t.net_pnl))));
  return {
    trades: list.length, net_pnl: r2(net), total_r: r2(sum(rs)), expectancy_r: r4(mean(rs)),
    win_rate: list.length ? r2((w / list.length) * 100) : 0,
    profit_factor: gl > 0 ? r2(gp / gl) : (gp > 0 ? null : 0),
  };
}

/* --------------------------------------------------------------- monte carlo */
/** Deterministic PRNG (mulberry32) so results are reproducible between renders. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bootstrap Monte Carlo: what does the *next* N trades look like if your
 * behaviour stays exactly the same?  Answers "am I risking ruin?"
 */
function monteCarlo(rs, opts = {}) {
  const sims = Math.min(20000, num(opts.sims, 2000));
  const horizon = Math.min(2000, num(opts.horizon, 100));
  const startEquity = num(opts.startEquity, 10000);
  const riskPct = num(opts.riskPct, 1) / 100;
  const ruinLevel = num(opts.ruinPct, 50) / 100;
  if (!rs.length) return null;
  const rnd = rng(num(opts.seed, 12345));
  const ends = [], dds = [], ruinHits = [];
  let longestLosing = 0;
  for (let s = 0; s < sims; s++) {
    let eq = startEquity, peak = startEquity, maxDD = 0, streakL = 0, streakMax = 0, ruined = 0;
    for (let i = 0; i < horizon; i++) {
      const r = rs[Math.floor(rnd() * rs.length)];
      eq += eq * riskPct * r;
      peak = Math.max(peak, eq);
      maxDD = Math.max(maxDD, (peak - eq) / peak);
      if (r < 0) { streakL++; streakMax = Math.max(streakMax, streakL); } else streakL = 0;
      if (eq <= startEquity * ruinLevel && !ruined) ruined = 1;
      if (eq <= 0) { eq = 0; break; }
    }
    ends.push(eq); dds.push(maxDD * 100); ruinHits.push(ruined);
    longestLosing = Math.max(longestLosing, streakMax);
  }
  const sortedEnds = [...ends].sort((a, b) => a - b);
  return {
    sims, horizon, start_equity: startEquity, risk_pct: riskPct * 100,
    median_end: r2(percentile(ends, 50)), mean_end: r2(mean(ends)),
    p5_end: r2(percentile(ends, 5)), p25_end: r2(percentile(ends, 25)),
    p75_end: r2(percentile(ends, 75)), p95_end: r2(percentile(ends, 95)),
    best_end: r2(sortedEnds[sortedEnds.length - 1]), worst_end: r2(sortedEnds[0]),
    median_max_dd_pct: r2(percentile(dds, 50)), p95_max_dd_pct: r2(percentile(dds, 95)), worst_max_dd_pct: r2(Math.max(...dds)),
    risk_of_ruin: r2((sum(ruinHits) / sims) * 100),
    prob_profit: r2((ends.filter((e) => e > startEquity).length / sims) * 100),
    longest_losing_streak: longestLosing,
    median_return_pct: r2(((percentile(ends, 50) - startEquity) / startEquity) * 100),
    p5_return_pct: r2(((percentile(ends, 5) - startEquity) / startEquity) * 100),
    p95_return_pct: r2(((percentile(ends, 95) - startEquity) / startEquity) * 100),
  };
}

/**
 * Kelly-optimal constant risk fraction from the R distribution, capped for safety.
 * Returns fraction of equity to risk per trade.
 */
function optimalRisk(rs, { cap = 0.05, floor = 0.001 } = {}) {
  const n = rs.length;
  if (n < 20) return { kelly: null, half: null, quarter: null, note: 'Need at least 20 trades.' };
  // Solve for f maximising E[log(1 + f*r)] over the empirical distribution.
  let best = 0, bestVal = -Infinity;
  for (let f = floor; f <= cap; f += 0.0005) {
    let v = 0, ok = true;
    for (const r of rs) { const x = 1 + f * r; if (x <= 0) { ok = false; break; } v += Math.log(x); }
    if (!ok) continue;
    v /= n;
    if (v > bestVal) { bestVal = v; best = f; }
  }
  return {
    kelly: r4(best * 100), half: r4((best / 2) * 100), quarter: r4((best / 4) * 100),
    growth_rate: r4(bestVal), note: 'Fraction of equity to risk per trade (log-growth optimal on your own R distribution).',
  };
}

/** Aggregate everything the dashboard needs in one payload. */
function fullAnalytics(trades, opts = {}) {
  const k = kpis(trades, opts);
  const closed = trades.filter((t) => t.status !== 'open');
  return {
    kpis: k,
    points: closed.map((t, i) => ({
      i: i + 1, id: t.id, symbol: t.symbol, r: r4(num(t.r_multiple)), risk: r2(num(t.risk_amount)),
      mae: t.mae_r === null || t.mae_r === undefined ? null : r4(num(t.mae_r)),
      mfe: t.mfe_r === null || t.mfe_r === undefined ? null : r4(num(t.mfe_r)),
      pnl: r2(num(t.net_pnl)), day: t.day, setup: t.strategy_name || '', grade: t.setup_grade || '',
      adherence: t.adherence || null, mistakes: t.mistakes || '', hold: num(t.hold_minutes),
      hour: t.hour, session: t.session_label, dir: String(t.direction).toLowerCase() === 'short' ? 'Short' : 'Long',
    })),
    equity: equityCurve(trades.filter((t) => t.status !== 'open'), num(opts.startingBalance, 10000)),
    daily: dailySeries(trades.filter((t) => t.status !== 'open')),
    monthly: monthlySeries(trades.filter((t) => t.status !== 'open')),
    distribution: rDistribution(trades.filter((t) => t.status !== 'open')),
    /* M102 — segment on (strategy, VERSION), not on the name alone. Two defects were live
     * here: renaming a strategy silently merged or split its whole performance history, and
     * trades taken under different revisions of the same rules were averaged together into a
     * single number, which is precisely what Ep 27 warns makes it impossible to know what
     * worked. A trade with no recorded version is labelled as such rather than folded into
     * v1, so the pre-versioning gap stays visible in the report instead of disappearing. */
    by_strategy: segment(trades, (t) => (t.strategy_name || 'Untagged')
      + (t.strategy_id ? (t.strategy_version ? ` · v${t.strategy_version}` : ' · version unknown') : '')),
    by_symbol: segment(trades, (t) => t.symbol),
    by_session: segment(trades, (t) => t.session_label),
    by_direction: segment(trades, (t) => (String(t.direction).toLowerCase() === 'short' ? 'Short' : 'Long')),
    by_grade: segment(trades, (t) => t.setup_grade || 'Ungraded'),
    by_emotion: segment(trades, (t) => splitTags(t.emotion_before)),
    by_mistake: segment(trades, (t) => splitTags(t.mistakes)),
    by_tag: segment(trades, (t) => splitTags(t.tags)),
    by_hold: segment(trades, (t) => holdBucket(t.hold_minutes)),
    by_asset: segment(trades, (t) => t.asset_class || 'other'),
    by_adherence: segment(trades, (t) => (t.adherence ? `${t.adherence}★ adherence` : null)),
    by_confidence: segment(trades, (t) => (t.confidence ? `${t.confidence}★ conviction` : null)),
    time: timeGrids(trades.filter((t) => t.status !== 'open')),
  };
}
const sum = (a) => a.reduce((s, v) => s + (Number(v) || 0), 0);

module.exports = {
  decorate, kpis, equityCurve, drawdownStats, dailySeries, monthlySeries, segment, rDistribution,
  timeGrids, monteCarlo, optimalRisk, fullAnalytics, sessionOf, SESSION_LABEL, SESSIONS,
  localParts, localDateStr, holdBucket, mean, stdev, median, percentile, splitTags, deriveExitReason, r2, r4,
};
