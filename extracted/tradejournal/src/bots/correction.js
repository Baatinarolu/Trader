'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CORRECTIONAL BOT  (playlist episodes 19, 21, 22, 23, 24, 26, 27, 28, 32)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Reads the trader's own journal and does the thing a good mentor does:
 *
 *    1. finds recurring mistakes, with NUMBERS (not vibes)
 *    2. turns each one into one concrete fix
 *    3. derives personal guardrails from the trader's own winning behaviour
 *    4. auto-grades every trade so the feedback loop closes without extra work
 *    5. reviews an individual trade the moment it closes (behavioural feedback)
 *
 *  Everything is evidence-first: if the bot says "you are cutting winners early",
 *  it shows the trades, the R left on the table, and the money that represents.
 */

const { db } = require('../db');
const SMC = require('./smc');

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const dayKey = (iso) => String(iso || '').slice(0, 10);

/** Session label -> killzone quality (accepts the many ways traders type a session). */
const SESSION_QUALITY = {
  newyork: 1, newyorkam: 1, ny: 1, nyam: 1, overlap: 1, londonnewyork: 1,
  london: 0.85, newyorkpm: 0.6, nypm: 0.6, asia: 0.5, tokyo: 0.5, sydney: 0.3,
};
const sessionQuality = (s) => {
  const k = String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  return k in SESSION_QUALITY ? SESSION_QUALITY[k] : null;
};

/* ═══════════════════════════════════════════════════════════ data loading */

async function loadTrades(userId, { days = 365, accountId = null } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const rows = accountId
    ? await db.prepare(`SELECT * FROM trades WHERE user_id=? AND account_id=? AND opened_at >= ? ORDER BY opened_at ASC`).all(userId, accountId, since)
    : await db.prepare(`SELECT * FROM trades WHERE user_id=? AND opened_at >= ? ORDER BY opened_at ASC`).all(userId, since);
  return rows.filter((t) => t.status === 'closed' && t.exit != null);
}

/* ═══════════════════════════════════════════════════════════ statistics */

function statsOf(trades) {
  const n = trades.length;
  if (!n) return null;
  const wins = trades.filter((t) => t.net_pnl > 0), losses = trades.filter((t) => t.net_pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.net_pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0));
  const rSum = trades.reduce((s, t) => s + (t.r_multiple || 0), 0);
  return {
    trades: n, wins: wins.length, losses: losses.length,
    win_rate: r2((wins.length / n) * 100),
    net: r2(trades.reduce((s, t) => s + (t.net_pnl || 0), 0)),
    expectancy_r: r2(rSum / n), total_r: r2(rSum),
    profit_factor: grossLoss ? r2(grossWin / grossLoss) : (grossWin ? 99 : 0),
    avg_win_r: wins.length ? r2(wins.reduce((s, t) => s + (t.r_multiple || 0), 0) / wins.length) : 0,
    avg_loss_r: losses.length ? r2(losses.reduce((s, t) => s + (t.r_multiple || 0), 0) / losses.length) : 0,
    median_risk: median(trades.map((t) => t.risk_amount || 0).filter((x) => x > 0)),
  };
}

/** The account the bots should size and guard against. */
async function accountOf(userId, accountId = null) {
  const acc = accountId
    ? await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(accountId, userId)
    : await db.prepare('SELECT * FROM accounts WHERE user_id=? AND archived=0 ORDER BY is_default DESC, id LIMIT 1').get(userId);
  return acc || { id: null, current_balance: 0, starting_balance: 0, risk_per_trade_pct: 0.5, daily_loss_limit_pct: 3, currency: 'USD' };
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
}

/* ═════════════════════════════════════════════════ 1. MISTAKE DETECTION */

/**
 * Every detector returns null (not enough evidence / nothing wrong) or:
 *   { key, title, severity, count, impact, impact_unit, evidence[], fix, metric }
 */
/* -------------------------------------------------------------------------
 * M11 — MINIMUM SAMPLE SIZES. Ep 27: "you need at least 30 to 50 minimum
 * trades just to see anything meaningful", and below that "don't tweak the
 * system at all". Ep 26: no plan changes before a quarterly review, 100 trades
 * or three months. coach.js already QUOTES the 30-50 figure to the user while
 * the code underneath acted on 10 and on 5 — the app told traders the right
 * rule and then broke it.
 *
 * ★ WHY THERE ARE TWO THRESHOLDS AND NOT ONE. The course's rule is about
 * CHANGING THE SYSTEM, not about NOTICING. Widening a stop is visible in a
 * single trade; it is a rule violation, not a statistical pattern, and a mentor
 * should say so immediately. So detection still runs from n >= 5 — raising that
 * to 30 would hide real discipline breaches for weeks and would be a WORSE
 * reading of the course, not a stricter one. What a small sample cannot support
 * is (a) rewriting the trader's guardrails from their own history and (b)
 * escalating a mistake to 'high' severity on the strength of a RATIO, because
 * `2 of 5 trades` and `24 of 60 trades` produce the same 40% and mean entirely
 * different things. Both of those now wait for MIN_ADAPT_TRADES.
 *
 * The 30 is the course's own floor, not a fitted constant. Nothing here was
 * tuned against a backtest — and per Baseline 7 the harness could not have
 * validated it anyway.
 * ------------------------------------------------------------------------*/
const MIN_ADAPT_TRADES = 30;      // Ep 27's floor: below this, do not change the system
const MIN_PATTERN_TRADES = 30;    // below this a ratio cannot escalate severity or grade behaviour

/**
 * Severity that refuses to escalate on a ratio computed from too few trades.
 * `cond` may be null/undefined (one call site short-circuits on a missing
 * impulseStats) so it is tested for truthiness, not equality.
 */
const sev = (cond, n) => (cond && n >= MIN_PATTERN_TRADES ? 'high' : 'medium');

function detectMistakes(trades) {
  const out = [];
  const n = trades.length;
  if (n < 5) return out;

  const push = (m) => { if (m) out.push(m); };

  /* --- stop widening (ep 20/21: the stop is the plan) --- */
  const widened = trades.filter((t) => t.stop_moved);
  const widenedAvgR = widened.length ? r2(widened.reduce((s, t) => s + (t.r_multiple || 0), 0) / widened.length) : 0;
  const widenedDrag = r2(widened.reduce((s, t) => s + Math.min(0, (t.r_multiple || 0) + 1), 0)); // R lost beyond the 1R the plan allowed
  push(widened.length >= 2 && {
    key: 'stop_widened', severity: sev((widened.length / n > 0.2 || widenedAvgR < -0.5), n),
    title: 'You move your stop away from the entry',
    count: widened.length,
    impact: widenedDrag, impact_unit: 'R lost beyond the 1R limit',
    metric: `${widened.length} of ${n} trades (${r2((widened.length / n) * 100)}%) closed at ${widenedAvgR}R average`,
    evidence: widened.slice(-4).map((t) => `#${t.id} ${t.symbol} ${dayKey(t.opened_at)}: ${(t.r_multiple || 0).toFixed(2)}R after moving the stop`),
    fix: 'The stop is a line in the sand, not a suggestion. If price reaches it the idea is wrong — take the loss and re-map. Moving it turns a 1R loss into a 3R loss, which is how a good month dies.',
  });

  /* --- held past the stop --- */
  const past = trades.filter((t) => (t.r_multiple || 0) < -1.15 && !t.stop_moved);
  push(past.length >= 3 && {
    key: 'held_past_stop', severity: sev(past.length / n > 0.25, n),
    title: 'Losers are being held past 1R',
    count: past.length, impact: r2(past.reduce((s, t) => s + ((t.r_multiple || 0) + 1), 0)), impact_unit: 'R',
    metric: `avg loss ${r2(past.reduce((s, t) => s + (t.r_multiple || 0), 0) / past.length)}R across ${past.length} trades`,
    evidence: past.slice(-4).map((t) => `#${t.id} ${t.symbol} ${dayKey(t.opened_at)}: ${(t.r_multiple || 0).toFixed(2)}R (limit is -1R)`),
    fix: 'Cap every loss at 1R. If slippage or gaps push it past that, the size was too big for the market — not the stop.',
  });

  /* --- cutting winners early (ep 27: improve with data) --- */
  const cut = trades.filter((t) => (t.mfe_r || 0) >= 1 && ((t.mfe_r || 0) - (t.r_multiple || 0)) >= 1);
  const leftR = cut.reduce((s, t) => s + ((t.mfe_r || 0) - (t.r_multiple || 0)), 0);
  push(cut.length >= 3 && {
    key: 'cut_winners', severity: sev(leftR / n > 0.6, n),
    title: 'You are cutting winners before they reach the target',
    count: cut.length, impact: r2(leftR), impact_unit: 'R left on the table',
    metric: `${cut.length} trades closed an average of ${r2(leftR / cut.length)}R before the move was over`,
    evidence: cut.slice(-4).map((t) => `#${t.id} ${t.symbol}: closed ${(t.r_multiple || 0).toFixed(2)}R, but price ran to ${(t.mfe_r || 0).toFixed(2)}R`),
    fix: 'Judge exits by the plan, not by comfort: your own MFE data says the structural target was reachable. Measured over 24 market/timeframe series on 2026-10-06 (7,028 unique setups, docs/MEASURED-RULES.md) the model\'s positive expectancy lives in the tail: the one combination that survived out-of-sample was a displacement-leg entry with a stop ≥ 0.6 ATR held to a 3R target — +0.31R on 261 in-sample setups, +0.56R on 109 out-of-sample ones, at 35–42% wins — while filtering for a high win rate (69–75% at a 0.25R target) kept expectancy negative (−0.08R). Pick the exit you can execute and measure it, but do not confuse a high win rate with an edge.',
  });

  /* --- runs handed back: reached +1R, finished flat or red (management gap) --- */
  const gaveBack = trades.filter((t) => (t.mfe_r || 0) >= 1 && (t.r_multiple || 0) <= 0.2);
  const given = gaveBack.reduce((s, t) => s + ((t.mfe_r || 0) - Math.max(0, t.r_multiple || 0)), 0);
  push(gaveBack.length >= 3 && {
    key: 'gave_back_runner', severity: sev(gaveBack.length / n > 0.25, n),
    title: 'Trades that ran at least +1R and still finished flat or negative',
    count: gaveBack.length, impact: r2(given), impact_unit: 'R round-tripped',
    metric: `${gaveBack.length} of ${n} trades (${r2((gaveBack.length / n) * 100)}%) reached +1R or better and closed at ${r2(gaveBack.reduce((s, t) => s + (t.r_multiple || 0), 0) / gaveBack.length)}R on average`,
    evidence: gaveBack.slice(-4).map((t) => `#${t.id} ${t.symbol}: peak ${(t.mfe_r || 0).toFixed(2)}R → closed ${(t.r_multiple || 0).toFixed(2)}R`),
    fix: 'Bank the partial at the first structural target, move the stop to break-even, then let the runner work to the opposing pool. Exits are where this model earns: the entry side measured roughly break-even over 11,092 walk-forward replays (docs/EDGE-REPORT.md, 2026-10-06), so protecting runners is the difference between a losing and a surviving system.',
  });

  /* --- oversizing --- */
  const risks = trades.map((t) => t.risk_amount || 0).filter((x) => x > 0);
  const med = median(risks);
  const oversized = trades.filter((t) => (t.risk_amount || 0) > med * 1.5 && med > 0);
  const oversizeLoss = oversized.reduce((s, t) => s + Math.min(0, t.net_pnl || 0), 0);
  push(oversized.length >= 3 && {
    key: 'oversizing', severity: sev(oversized.length / n > 0.3, n),
    title: 'Position sizes are inconsistent (spikes in risk)',
    count: oversized.length, impact: r2(oversizeLoss), impact_unit: '$ lost on oversized trades',
    metric: `median risk $${r2(med)} vs ${oversized.length} trades at $${r2(oversized.reduce((s, t) => s + t.risk_amount, 0) / oversized.length)} average`,
    evidence: oversized.slice(-4).map((t) => `#${t.id} ${t.symbol} ${dayKey(t.opened_at)}: risked $${r2(t.risk_amount)} (${r2(((t.risk_amount / med) - 1) * 100)}% above your median)`),
    fix: 'Fixed fractional risk. Pick one number (1% of the account) and let the stop distance decide the size — never the other way round.',
  });

  /* --- revenge trading: a trade taken right after a loss (same day, within 30 min) --- */
  const revenge = [];
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1], t = trades[i];
    if ((prev.net_pnl || 0) >= 0 || !prev.closed_at || !t.opened_at) continue;
    const gapMin = (new Date(t.opened_at) - new Date(prev.closed_at)) / 60000;
    if (gapMin >= 0 && gapMin <= 30) revenge.push({ t, prev, gapMin: r2(gapMin), bigger: (t.risk_amount || 0) > (prev.risk_amount || 0) * 1.2 });
  }
  const revengeCost = revenge.reduce((s, x) => s + Math.min(0, x.t.net_pnl || 0), 0);
  push(revenge.length >= 3 && {
    key: 'revenge', severity: sev(revenge.length / n > 0.15 || revenge.filter((x) => x.bigger).length >= 3, n),
    title: 'Revenge trading window (re-entry within 30 min of a loss)',
    count: revenge.length, impact: r2(revengeCost), impact_unit: '$ lost in these re-entries',
    metric: `${revenge.length} trades re-entered within 30 minutes of a loss; ${revenge.filter((x) => x.bigger).length} of them were BIGGER than the losing trade`,
    evidence: revenge.slice(-4).map((x) => `#${x.t.id} ${x.t.symbol}: entered ${x.gapMin} min after losing #${x.prev.id}, risk $${r2(x.t.risk_amount)} vs $${r2(x.prev.risk_amount)}`),
    fix: 'Mandatory 30-minute cooldown after any loss. The market will still be there — your judgement will be better after a walk.',
  });

  /* --- overtrading --- */
  const byDay = new Map();
  for (const t of trades) {
    const k = dayKey(t.opened_at);
    const d = byDay.get(k) || { trades: 0, pnl: 0 };
    d.trades++; d.pnl += t.net_pnl || 0;
    byDay.set(k, d);
  }
  const dayCounts = [...byDay.values()].map((d) => d.trades);
  const busiest = [...byDay.entries()].sort((a, b) => b[1].trades - a[1].trades).slice(0, 5);
  const heavyCut = Math.max(3, percentile(dayCounts, 80));
  const heavyDays = [...byDay.values()].filter((d) => d.trades >= heavyCut);
  const lightDays = [...byDay.values()].filter((d) => d.trades < heavyCut);
  const heavyPnl = heavyDays.reduce((s, d) => s + d.pnl, 0);
  const heavyAvg = heavyDays.length ? heavyPnl / heavyDays.length : 0;
  const lightAvg = lightDays.length ? lightDays.reduce((s, d) => s + d.pnl, 0) / lightDays.length : 0;
  push(heavyDays.length >= 3 && heavyPnl < 0 && heavyAvg < lightAvg && {
    key: 'overtrading', severity: sev(heavyAvg < -25, n),
    title: 'Your busiest days are your worst days',
    count: heavyDays.length, impact: r2(heavyPnl), impact_unit: '$ across your heaviest days',
    metric: `days with ${heavyCut}+ trades: ${heavyDays.length} days averaging $${r2(heavyAvg)}/day, versus $${r2(lightAvg)}/day on your lighter days`,
    evidence: busiest.map(([d, v]) => `${d}: ${v.trades} trades, ${v.pnl >= 0 ? '+' : ''}$${r2(v.pnl)}`),
    fix: 'Set a hard daily trade cap (start with 3). More trades is not more edge — after the A+ setups are gone you are just paying spread to feel busy.',
  });

  /* --- no plan / sub-2R targets --- */
  const noPlan = trades.filter((t) => !t.planned_r && t.stop && t.target && t.entry);
  const lowRR = trades.filter((t) => t.planned_r && t.planned_r < 1.8);
  const lowRRpnl = lowRR.reduce((s, t) => s + (t.net_pnl || 0), 0);
  push(lowRR.length >= 4 && {
    key: 'low_rr', severity: sev(lowRRpnl < 0, n),
    title: 'Taking trades with less than 1:2 planned',
    count: lowRR.length, impact: r2(lowRRpnl), impact_unit: '$',
    metric: `${lowRR.length} trades planned under 1.8R (avg ${r2(lowRR.reduce((s, t) => s + t.planned_r, 0) / lowRR.length)}R)`,
    evidence: lowRR.slice(-4).map((t) => `#${t.id} ${t.symbol}: planned ${(t.planned_r || 0).toFixed(2)}R, outcome ${(t.r_multiple || 0).toFixed(2)}R`),
    fix: 'No target under 2R. At a 45% win rate, 1:1 trades lose money — the maths only works when winners pay for the losers.',
  });
  push(noPlan.length >= 6 && {
    key: 'no_plan', severity: 'medium',
    title: 'Trades entered without a planned R:R',
    count: noPlan.length, impact: null, impact_unit: '',
    metric: `${noPlan.length} of ${n} trades have no planned target`,
    evidence: noPlan.slice(-3).map((t) => `#${t.id} ${t.symbol} ${dayKey(t.opened_at)}`),
    fix: 'Log the stop and target BEFORE entry (the Planner does this in seconds). A trade you cannot grade is a trade you cannot improve.',
  });

  /* --- rule adherence --- */
  const lowAdh = trades.filter((t) => t.adherence != null && t.adherence <= 3);
  const adhStats = statsOf(lowAdh);
  push(lowAdh.length >= 4 && {
    key: 'adherence', severity: adhStats && adhStats.expectancy_r < 0 ? 'high' : 'low',
    title: 'Low-adherence trades are your losses',
    count: lowAdh.length,
    impact: adhStats ? r2(adhStats.expectancy_r) : null, impact_unit: 'R expectancy',
    metric: `Trades rated 3/5 or less on rule adherence: ${lowAdh.length} trades, ${adhStats ? `${adhStats.win_rate}% win rate, ${adhStats.expectancy_r}R expectancy` : ''}`,
    evidence: lowAdh.slice(-3).map((t) => `#${t.id} ${t.symbol}: adherence ${t.adherence}/5 → ${(t.r_multiple || 0).toFixed(2)}R`),
    fix: 'Your edge lives in the checklist. Backtest says it plainly: when you rate yourself ≤3/5 you lose money. Do not take a trade you would score below 4/5.',
  });

  /* --- impulse tags --- */
  const impulseTags = trades.filter((t) => /impulse|fomo|revenge|tilt|angry|greed|bored/i.test(`${t.tags || ''},${t.mistakes || ''}`));
  const impulseStats = statsOf(impulseTags);
  push(impulseTags.length >= 3 && {
    key: 'emotional', severity: sev(impulseStats && impulseStats.expectancy_r < -0.2, n),
    title: 'Emotion-tagged trades are dragging your results',
    count: impulseTags.length,
    impact: impulseStats ? r2(impulseStats.expectancy_r) : null, impact_unit: 'R expectancy',
    metric: `${impulseTags.length} trades tagged impulse/FOMO/revenge → ${impulseStats ? `${impulseStats.expectancy_r}R expectancy vs ${statsOf(trades).expectancy_r}R overall` : ''}`,
    evidence: impulseTags.slice(-4).map((t) => `#${t.id} ${t.symbol}: "${(t.tags || '').slice(0, 40)}" → ${(t.r_multiple || 0).toFixed(2)}R`),
    fix: 'Tag them, then stop feeding them. Two of those in a session = close the platform. Your tagged "impulse" trades are funding the market.',
  });

  /* --- session bleed --- */
  const bySession = new Map();
  for (const t of trades) {
    const k = (t.session || 'unlogged').toLowerCase();
    const s = bySession.get(k) || { trades: 0, pnl: 0, r: 0 };
    s.trades++; s.pnl += t.net_pnl || 0; s.r += t.r_multiple || 0;
    bySession.set(k, s);
  }
  const worstSession = [...bySession.entries()].filter(([, v]) => v.trades >= 8).sort((a, b) => (a[1].r / a[1].trades) - (b[1].r / b[1].trades))[0];
  const bestSession = [...bySession.entries()].filter(([, v]) => v.trades >= 8).sort((a, b) => (b[1].r / b[1].trades) - (a[1].r / a[1].trades))[0];
  push(worstSession && worstSession[1].r < 0 && {
    key: 'session', severity: 'medium',
    title: `The ${worstSession[0]} session is where your money goes`,
    count: worstSession[1].trades, impact: r2(worstSession[1].pnl), impact_unit: '$',
    metric: `${worstSession[0]}: ${worstSession[1].trades} trades, ${r2(worstSession[1].r / worstSession[1].trades)}R expectancy${bestSession ? ` — while ${bestSession[0]} gives you ${r2(bestSession[1].r / bestSession[1].trades)}R` : ''}`,
    evidence: [...bySession.entries()].map(([k, v]) => `${k}: ${v.trades} trades, ${r2(v.r / v.trades)}R avg, $${r2(v.pnl)}`),
    fix: `Trade your strong session and skip the weak one for two weeks. ${bestSession && bestSession[1].r > 0 ? `Your edge is clearly in ${bestSession[0]} — that is the window to protect.` : ''} Killzones exist for a reason: London open and the NY overlap.`,
  });

  /* --- instrument bleed --- */
  const bySym = new Map();
  for (const t of trades) {
    const s = bySym.get(t.symbol) || { trades: 0, pnl: 0, r: 0 };
    s.trades++; s.pnl += t.net_pnl || 0; s.r += t.r_multiple || 0;
    bySym.set(t.symbol, s);
  }
  const worstSym = [...bySym.entries()].filter(([, v]) => v.trades >= 6).sort((a, b) => a[1].pnl - b[1].pnl)[0];
  push(worstSym && worstSym[1].pnl < 0 && {
    key: 'instrument', severity: 'low',
    title: `${worstSym[0]} is your worst market`,
    count: worstSym[1].trades, impact: r2(worstSym[1].pnl), impact_unit: '$',
    metric: `${worstSym[0]}: ${worstSym[1].trades} trades, ${r2(worstSym[1].r / worstSym[1].trades)}R average`,
    evidence: [...bySym.entries()].sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 3).map(([k, v]) => `${k}: $${r2(v.pnl)} over ${v.trades} trades`),
    fix: 'You do not have to trade everything. Cut your worst instrument for a month and put that attention into your best one.',
  });

  /* --- journalling discipline (ep 23/24) --- */
  const recent = trades.filter((t) => new Date(t.closed_at || t.opened_at) > new Date(Date.now() - 30 * 864e5));
  const documented = recent.filter((t) => (t.thesis || '').trim().length > 10 || (t.lesson || '').trim().length > 10);
  push(recent.length >= 8 && documented.length / recent.length < 0.5 && {
    key: 'journaling', severity: 'medium',
    title: 'Most recent trades have no written thesis',
    count: recent.length - documented.length, impact: null, impact_unit: '',
    metric: `${documented.length} of ${recent.length} trades in the last 30 days have a thesis or lesson written`,
    evidence: recent.filter((t) => !(t.thesis || '').trim() && !(t.lesson || '').trim()).slice(0, 4).map((t) => `#${t.id} ${t.symbol} ${dayKey(t.opened_at)}`),
    fix: 'One line before the trade (why this level, what invalidates it) and one line after (what did the market teach me). The 21-day discipline episode is exactly this — the review IS the edge.',
  });

  return out.sort((a, b) => (
    ({ high: 3, medium: 2, low: 1 }[b.severity] - { high: 3, medium: 2, low: 1 }[a.severity])
    || (b.count || 0) - (a.count || 0)
  ));
}

/* ══════════════════════════════════════════════════════ 2. AUTO-GRADING */

/**
 * Grade a trade from its own data (no opinions). Used to backfill `setup_grade`
 * so the analytics "grade" breakdown is never empty again.
 * @returns {{score:number, grade:string, reasons:string[]}}
 */
function autograde(trade) {
  const reasons = [];
  let score = 50;

  // 1. planned R:R (the model's minimum is 2)
  const planned = trade.planned_r || null;
  if (planned == null) { reasons.push('No planned R:R logged (-10)'); score -= 10; }
  else if (planned >= 3) { score += 20; reasons.push(`Planned ${r2(planned)}R — excellent pay-off (+20)`); }
  else if (planned >= 2) { score += 14; reasons.push(`Planned ${r2(planned)}R — meets the 2R minimum (+14)`); }
  else if (planned >= 1.5) { score += 2; reasons.push(`Planned ${r2(planned)}R — below the 2R minimum (+2)`); }
  else { score -= 10; reasons.push(`Planned only ${r2(planned)}R (-10)`); }

  // 2. execution quality: outcome vs plan
  const r = trade.r_multiple || 0;
  if (r >= 2) { score += 16; reasons.push(`Closed ${r2(r)}R — plan executed (+16)`); }
  else if (r > 0.5) { score += 12; reasons.push(`Closed ${r2(r)}R — winner, but short of a full target (+12)`); }
  else if (r > 0) { score += 4; reasons.push(`Closed ${r2(r)}R — small win (+4)`); }
  else if (r >= -1.05) { score += 6; reasons.push(`Loss of ${r2(r)}R — within the 1R limit, that is a good loss (+6)`); }
  else { score -= 12; reasons.push(`Loss of ${r2(r)}R exceeds the 1R stop (-12)`); }

  // 3. risk discipline
  if (trade.stop_moved) { score -= 18; reasons.push('Stop was moved away from entry (-18)'); }
  else if (r < -1.05) { reasons.push('Stop not honoured (-6)'); score -= 6; }
  else { score += 6; reasons.push('Stop left where the plan put it (+6)'); }

  // 4. excursion discipline (entry timing + exit timing)
  if (trade.mae_r != null && trade.mae_r > -0.9 && r < 0) { score += 4; reasons.push('Entry was not run over (MAE under 0.9R) (+4)'); }
  if (trade.mae_r != null && trade.mae_r < -1.2) { score -= 6; reasons.push(`Entry was immediately underwater (MAE ${r2(trade.mae_r)}R) (-6)`); }
  if (trade.mfe_r != null && r > 0 && trade.mfe_r - r <= 0.75) { score += 8; reasons.push('Exited near the peak excursion (+8)'); }
  if (trade.mfe_r != null && r > 0 && trade.mfe_r - r >= 1.5) { score -= 8; reasons.push(`Left ${r2(trade.mfe_r - r)}R on the table (MFE was ${r2(trade.mfe_r)}R) (-8)`); }

  // 5. adherence self-score
  if (trade.adherence != null) {
    if (trade.adherence >= 4) { score += 6; reasons.push(`Rule adherence ${trade.adherence}/5 (+6)`); }
    else if (trade.adherence <= 2) { score -= 10; reasons.push(`Rule adherence only ${trade.adherence}/5 (-10)`); }
  }

  // 6. session quality (killzone windows)
  const sess = String(trade.session || '').toLowerCase();
  if (sess) {
    const quality = sessionQuality(sess);
    if (quality != null && quality < 0.55) { score -= 6; reasons.push(`Traded the ${sess} session — low-probability window (-6)`); }
    else if (quality != null && quality >= 0.85) { score += 4; reasons.push(`Traded the ${sess} killzone (+4)`); }
  }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? 'A+' : score >= 68 ? 'A' : score >= 54 ? 'B' : score >= 40 ? 'C' : 'D';
  return { score, grade, reasons };
}

/** Fill in setup_grade for trades that have none. */
async function backfillGrades(userId) {
  const rows = await db.prepare(`SELECT * FROM trades WHERE user_id=? AND status='closed' AND (setup_grade IS NULL OR setup_grade='')`).all(userId);
  const upd = await db.prepare(`UPDATE trades SET setup_grade=?, updated_at=datetime('now') WHERE id=?`);
  const dist = {};
  for (const t of rows) {
    const g = autograde(t);
    await upd.run(g.grade, t.id);
    dist[g.grade] = (dist[g.grade] || 0) + 1;
  }
  return { updated: rows.length, distribution: dist };
}

/* ══════════════════════════════════════════════════ 3. GUARDRAILS (ep 21/31) */

/**
 * Derive personal risk guardrails from the trader's own distribution — not from
 * generic advice. These are the numbers the app will hold them to.
 */
async function guardrails(userId, { accountId = null } = {}) {
  const trades = await loadTrades(userId, { days: 180, accountId });
  const st = statsOf(trades);
  const base = {
    max_risk_pct: 1, max_trades_day: 3, cooldown_min: 30, max_consecutive_losses: 2,
    daily_loss_limit_pct: 3, size_cap_note: null, basis: 'Defaults from the risk engine (not enough personal data yet).',
  };
  /* M11 — this was `trades.length < 10`. At 10 trades the app began deriving the
   * trader's max risk %, max trades/day, cooldown, consecutive-loss stop and daily
   * loss limit from their own history, i.e. the system rewriting its own rules on a
   * sample Ep 27 explicitly forbids ("don't tweak the system at all" below 30-50).
   * Below the floor it now returns the risk engine's defaults and SAYS so, rather
   * than silently presenting personal numbers that cannot be personal yet. */
  if (!st || trades.length < MIN_ADAPT_TRADES) {
    const short = trades.length > 0 && trades.length < MIN_ADAPT_TRADES;
    return {
      ...base,
      basis: short
        ? `Defaults from the risk engine. ${trades.length} closed trades is below the ${MIN_ADAPT_TRADES}-trade minimum the method requires before personal guardrails are derived — Ep 27: "at least 30 to 50 minimum trades just to see anything meaningful", and below that "don't tweak the system at all". These are NOT your personal numbers yet.`
        : base.basis,
      guardrails: base, stats: st,
      user: { trades: trades.length },
      sample_sufficient: !short && !!st,
      min_trades_for_personal_guardrails: MIN_ADAPT_TRADES,
    };
  }

  const risks = trades.map((t) => t.risk_amount || 0).filter((x) => x > 0);
  const winners = trades.filter((t) => t.net_pnl > 0).map((t) => t.risk_amount || 0).filter((x) => x > 0);
  // their own best practice: the risk level on winning trades (90th percentile is still winning)
  const riskCap = percentile(winners.length >= 8 ? winners : risks, 90);
  const account = await accountOf(userId, accountId);
  const accountBalance = Number(account.current_balance || account.starting_balance || 0);
  // cap = min(their configured risk %, the risk their own winning trades actually survived)
  const ownCapPct = accountBalance > 0 ? (riskCap / accountBalance) * 100 : 0;
  const maxRiskPct = accountBalance > 0
    // M9: ceiling 2 -> 1. The course's hard maximum is 1% and its guardrail default is 0.5%;
    // the old clamp allowed 2%, a 4x gap against the guardrail. Fallbacks || 1 -> || 0.5 so a
    // null/zero account risk falls back to the guardrail rather than to double it.
    ? Math.max(0.25, Math.min(1, r2(ownCapPct > 0 ? Math.min(Number(account.risk_per_trade_pct) || 0.5, Math.max(ownCapPct, 0.5)) : Number(account.risk_per_trade_pct) || 0.5)))
    : Number(account.risk_per_trade_pct) || 0.5;

  // their own best days set the trade cap
  const byDay = new Map();
  for (const t of trades) {
    const k = dayKey(t.opened_at);
    const d = byDay.get(k) || { trades: 0, pnl: 0 };
    d.trades++; d.pnl += t.net_pnl || 0;
    byDay.set(k, d);
  }
  const profitDayTrades = [...byDay.values()].filter((d) => d.pnl > 0).map((d) => d.trades);
  const cap = Math.max(2, Math.min(6, Math.round(percentile(profitDayTrades.length ? profitDayTrades : [3], 70) || 3)));

  // how often does trade #4+ of the day actually pay?
  const ordered = [...trades].sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at));
  const perDayIndex = new Map();
  let lateWins = 0, lateCount = 0;
  for (const t of ordered) {
    const k = dayKey(t.opened_at);
    const idx = (perDayIndex.get(k) || 0) + 1;
    perDayIndex.set(k, idx);
    if (idx > cap) { lateCount++; if ((t.net_pnl || 0) > 0) lateWins++; }
  }
  const lateRate = lateCount ? r2((lateWins / lateCount) * 100) : null;

  const consecutive = trades.filter((t) => (t.r_multiple || 0) < 0).length;
  const dailyLosses = [...byDay.values()].map((d) => d.pnl).filter((x) => x < 0);
  const dailyLossLimit = dailyLosses.length && accountBalance > 0
    ? r2(Math.min(Number(account.daily_loss_limit_pct) || 3, Math.max(1, (Math.abs(median(dailyLosses)) / accountBalance) * 100)))
    : Number(account.daily_loss_limit_pct) || base.daily_loss_limit_pct;

  const g = {
    max_risk_pct: maxRiskPct,
    max_trades_day: cap,
    cooldown_min: 30,
    max_consecutive_losses: 2,
    daily_loss_limit_pct: dailyLossLimit,
    size_cap_note: riskCap ? `Your own winning trades risked a median of $${r2(median(winners.length ? winners : risks))} (90th pct $${r2(riskCap)}). Stay under that and you never blow a good month on one idea.` : null,
    basis: `Derived from your last ${trades.length} closed trades (${byDay.size} trading days, ${consecutive} losers in the sample).`,
    evidence: {
      risk_p90_of_winners: r2(riskCap), median_risk: r2(median(risks)),
      trade_cap_basis: `your profitable days average ${r2(percentile(profitDayTrades.length ? profitDayTrades : [3], 70))} trades`,
      trades_past_cap: lateCount ? { count: lateCount, win_rate: lateRate } : null,
    },
  };
  return { ...g, guardrails: g, stats: st, user: { trades: trades.length } };
}

/** Today's live risk state — what the guardrails say RIGHT NOW. */
async function dailyState(userId, { accountId = null } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const g = guardrails(userId, { accountId });
  const rows = (await db.prepare(`SELECT * FROM trades WHERE user_id=? ORDER BY opened_at ASC`).all(userId)).filter((t) => dayKey(t.opened_at) === today);
  const closed = rows.filter((t) => t.status === 'closed');
  const realised = r2(closed.reduce((s, t) => s + (t.net_pnl || 0), 0));
  const rSum = r2(closed.reduce((s, t) => s + (t.r_multiple || 0), 0));
  // consecutive losses counting back from the most recent closed trade of today
  const recent = await db.prepare(`SELECT r_multiple, net_pnl, opened_at FROM trades WHERE user_id=? AND status='closed' ORDER BY closed_at DESC LIMIT 10`).all(userId);
  let streak = 0;
  for (const t of recent) { if ((t.net_pnl || 0) < 0) streak++; else break; }
  const account = await accountOf(userId, accountId);
  const balance = Number(account.current_balance || account.starting_balance || 0);

  const breaches = [];
  if (closed.length >= g.max_trades_day) breaches.push({ rule: 'max_trades_day', detail: `${closed.length} trades today — your cap is ${g.max_trades_day}.` });
  if (streak >= g.max_consecutive_losses) breaches.push({ rule: 'consecutive_losses', detail: `${streak} losses in a row — the cooldown/stop rule is triggered.` });
  if (balance > 0 && realised < -Math.abs(balance * g.daily_loss_limit_pct / 100)) breaches.push({ rule: 'daily_loss_limit', detail: `Down $${r2(Math.abs(realised))} today (limit ${g.daily_loss_limit_pct}% = $${r2(balance * g.daily_loss_limit_pct / 100)}).` });

  return {
    date: today,
    guardrails: g,
    today: { trades: rows.length, closed: closed.length, realised, r_sum: rSum, avg_r: closed.length ? r2(rSum / closed.length) : 0, loss_streak: streak, balance: r2(balance) },
    breaches,
    status: breaches.length ? 'stop' : closed.length >= g.max_trades_day - 1 ? 'caution' : 'clear',
    message: breaches.length
      ? `Stand down: ${breaches.map((b) => b.detail).join(' ')}`
      : streak >= 1 ? `${streak} loss${streak > 1 ? 'es' : ''} in a row — take the ${g.cooldown_min}-minute cooldown before the next entry.`
        : `Clear to trade. Cap: ${g.max_trades_day} trades / ${g.max_risk_pct}% risk per trade today.`,
    remaining_trades: Math.max(0, g.max_trades_day - closed.length),
  };
}

/* ═════════════════════════════════════════════════ 4. PER-TRADE FEEDBACK */

/**
 * Behavioural review of a single closed trade (playlist ep 23/24/26).
 * Returns a grade plus specific, numeric commentary.
 */
function feedback(trade, { guardrails: g = null, siblings = null } = {}) {
  const auto = autograde(trade);
  const notes = [];
  const r = trade.r_multiple || 0, mfe = trade.mfe_r, mae = trade.mae_r;

  if (trade.stop_moved) notes.push({ tone: 'bad', text: `You moved the stop on this one. That single decision turned a ${r2(Math.abs(1))}R planned loss into ${r2(r)}R.` });
  if (r < -1.15 && !trade.stop_moved) notes.push({ tone: 'bad', text: `Loss was ${r2(r)}R — beyond the 1R limit. Either the stop was too tight for the volatility, or the exit was late.` });
  if (mfe != null && mfe >= 1 && r >= 0 && mfe - r >= 1) notes.push({ tone: 'warn', text: `Price reached ${r2(mfe)}R but you closed at ${r2(r)}R — ${r2(mfe - r)}R left for someone else.` });
  if (mfe != null && mfe < 0.5 && r < 0) notes.push({ tone: 'info', text: `The trade never worked (MFE ${r2(mfe)}R). That is a location problem, not an exit problem — the entry was early or against the flow.` });
  if (mae != null && mae < -1 && r >= 0) notes.push({ tone: 'info', text: `It went ${r2(mae)}R against you before working — your entry could be moved deeper into the zone (the 50% level).` });
  if (trade.planned_r && trade.planned_r >= 2 && r >= trade.planned_r * 0.9) notes.push({ tone: 'good', text: `Full target executed at ${r2(r)}R. This is the trade that pays for the losers — repeat it.` });
  else if (r >= 1) notes.push({ tone: 'good', text: `Banked ${r2(r)}R. ${trade.planned_r ? `Plan was ${r2(trade.planned_r)}R target.` : ''}` });
  if (trade.adherence != null && trade.adherence <= 3) notes.push({ tone: 'bad', text: `You rated your own adherence ${trade.adherence}/5. Trades you cannot grade highly should not be taken.` });
  if (g && trade.risk_amount && g.stats && g.stats.median_risk && trade.risk_amount > g.stats.median_risk * 1.5) notes.push({ tone: 'warn', text: `Risked $${r2(trade.risk_amount)} against your usual $${r2(g.stats.median_risk)} — the size is what makes the loss hurt, not the loss itself.` });

  const today = dayKey(trade.opened_at);
  if (siblings && siblings.length) {
    const sameDay = siblings.filter((t) => t.id !== trade.id && dayKey(t.opened_at) === today).sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at));
    const before = sameDay.filter((t) => new Date(t.opened_at) < new Date(trade.opened_at));
    const last = before[before.length - 1];
    if (last && (last.net_pnl || 0) < 0) {
      const gapMin = (new Date(trade.opened_at) - new Date(last.closed_at || last.opened_at)) / 60000;
      if (gapMin <= 30) notes.push({ tone: 'bad', text: `This entry came ${r2(gapMin)} minutes after a loss (#${last.id}). That is the revenge window — the next trade after a loss should be after a break, not immediately.` });
    }
    if (before.length + 1 > (g ? g.max_trades_day : 99)) notes.push({ tone: 'warn', text: `This was trade #${before.length + 1} of the day; your cap is ${g ? g.max_trades_day : '—'}.` });
  }

  return {
    trade_id: trade.id, symbol: trade.symbol, grade: auto.grade, score: auto.score,
    reasons: auto.reasons, notes,
    summary: auto.grade === 'A+' || auto.grade === 'A'
      ? 'Textbook execution — this is the behaviour to repeat.'
      : auto.grade === 'B' ? 'Decent trade with fixable leaks — see notes.'
        : auto.grade === 'C' ? 'Process errors here; the P&L is beside the point.' : 'This trade should not have been taken in this form.',
  };
}

/* ═══════════════════════════════════════════════════════════ 5. BUNDLE */

async function analyse(userId, { accountId = null, backfill = false, days = 365 } = {}) {
  const trades = await loadTrades(userId, { days, accountId });
  const overall = statsOf(trades);
  const mistakes = detectMistakes(trades);
  const g = await guardrails(userId, { accountId });
  const state = await dailyState(userId, { accountId });
  const graded = backfill ? await backfillGrades(userId) : null;
  const accountRow = await accountOf(userId, accountId);

  const byGrade = {};
  for (const t of trades) {
    if (!t.setup_grade) continue;
    const k = t.setup_grade;
    const s = byGrade[k] || { grade: k, trades: 0, wins: 0, net: 0, r: 0 };
    s.trades++; if ((t.net_pnl || 0) > 0) s.wins++; s.net += t.net_pnl || 0; s.r += t.r_multiple || 0;
    byGrade[k] = s;
  }
  const gradeTable = Object.values(byGrade).map((s) => ({
    grade: s.grade, trades: s.trades, win_rate: r2((s.wins / s.trades) * 100),
    net: r2(s.net), expectancy_r: r2(s.r / s.trades),
  })).sort((a, b) => String(a.grade).localeCompare(String(b.grade)));

  // behaviour score: how close are they to their own guardrails?
  const penalties = mistakes.reduce((s, m) => s + ({ high: 12, medium: 6, low: 3 }[m.severity] || 0), 0);
  const behaviourScore = Math.max(0, Math.min(100, 100 - penalties));

  return {
    generated_at: new Date().toISOString(),
    account: { id: accountRow.id, name: accountRow.name, currency: accountRow.currency, balance: r2(accountRow.current_balance || accountRow.starting_balance || 0), risk_per_trade_pct: accountRow.risk_per_trade_pct, daily_loss_limit_pct: accountRow.daily_loss_limit_pct },
    sample: { trades: trades.length, from: trades.length ? dayKey(trades[0].opened_at) : null, to: trades.length ? dayKey(trades[trades.length - 1].opened_at) : null },
    overall,
    behavior_score: behaviourScore,
    /* M116 — a five-tier behavioural grade was published from as few as 5 trades.
     * A grade is a statistical claim about the trader, so it waits for the same
     * floor as everything else. The SCORE is still returned (it is just 100 minus
     * weighted penalties and is useful as a running tally) but the tiered label is
     * withheld, and the reason is published next to it rather than implied. Kept a
     * string so no caller that renders the badge receives an unexpected null. */
    behavior_grade: trades.length >= MIN_PATTERN_TRADES
      ? (behaviourScore >= 85 ? 'Disciplined' : behaviourScore >= 70 ? 'Solid' : behaviourScore >= 55 ? 'Leaking' : behaviourScore >= 40 ? 'Undisciplined' : 'Critical')
      : 'Insufficient sample',
    behavior_grade_note: trades.length >= MIN_PATTERN_TRADES ? null
      : `Withheld: ${trades.length} closed trades is below the ${MIN_PATTERN_TRADES}-trade minimum. A behavioural grade is a statistical claim about you, and Ep 27 asks for 30-50 trades before drawing one. The raw score above is still shown as a running tally.`,
    behavior_sample_sufficient: trades.length >= MIN_PATTERN_TRADES,
    mistakes,
    guardrails: g,
    daily: state,
    grades: gradeTable,
    backfill: graded,
    top_fix: mistakes.length ? { title: mistakes[0].title, fix: mistakes[0].fix, impact: mistakes[0].impact, impact_unit: mistakes[0].impact_unit } : null,
    session_state: SMC.sessionState(),
  };
}

module.exports = { analyse, detectMistakes, autograde, backfillGrades, guardrails, dailyState, feedback, loadTrades, statsOf, accountOf };
