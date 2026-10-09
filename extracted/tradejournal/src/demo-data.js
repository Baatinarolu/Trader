'use strict';
/**
 * demo-data.js — generates a realistic, deliberately *flawed* trade history.
 *
 * Why flawed on purpose?  Because an empty journal shows nothing and a perfect
 * journal teaches nothing.  The seeded trader has real leaks (a losing setup, a
 * bad hour, revenge entries, early exits, size creep) so the coach engine has
 * genuine patterns to find the first time you open it.
 */
const { db } = require('./db');
const T = require('./trades');

const SYMBOLS = [
  { symbol: 'EURUSD', base: 1.0850, stopPct: 0.0032, feePerUnit: 3.5, lotRound: 2 },
  { symbol: 'GBPUSD', base: 1.2710, stopPct: 0.0035, feePerUnit: 3.5, lotRound: 2 },
  { symbol: 'XAUUSD', base: 2650, stopPct: 0.0075, feePerUnit: 3.5, lotRound: 2 },
  { symbol: 'NAS100', base: 20500, stopPct: 0.0060, feePerUnit: 1.2, lotRound: 1 },
  { symbol: 'US30', base: 43900, stopPct: 0.0050, feePerUnit: 1.2, lotRound: 1 },
  { symbol: 'BTCUSDT', base: 86000, stopPct: 0.022, feePerUnit: 0, feePct: 0.0004, lotRound: 4 },
];
/**
 * Outcome model = probability bands × R ranges.  Bands must NOT sum to 1 before
 * the loss band, otherwise the trader never loses — a subtle bug worth guarding.
 *   pBig  : runner           pMid : normal win
 *   pSmall: scratch-ish win  pLoss: loss (sum of all four = 1)
 */
const SETUPS = [
  {
    name: 'Trend Pullback (continuation)', weight: 0.42, grade: ['A+', 'A', 'A', 'B'],
    pBig: 0.11, pMid: 0.34, pSmall: 0.10, rBig: [2.0, 4.2], rMid: [0.6, 1.6], rSmall: [0.05, 0.4], rLoss: [-1.05, -0.5],
  },
  {
    name: 'Breakout / Range Expansion', weight: 0.30, grade: ['A', 'B', 'B', 'C'],
    pBig: 0.10, pMid: 0.32, pSmall: 0.10, rBig: [1.8, 3.6], rMid: [0.5, 1.6], rSmall: [0.05, 0.4], rLoss: [-1.05, -0.55],
  },
  {
    name: 'Mean Reversion (range fade)', weight: 0.22, grade: ['B', 'C', 'C', 'D'],
    pBig: 0.02, pMid: 0.45, pSmall: 0.08, rBig: [1.6, 2.2], rMid: [0.35, 1.05], rSmall: [0.05, 0.3], rLoss: [-1.35, -0.8],
  },
  {
    name: '', weight: 0.06, grade: ['', '', 'C'],
    pBig: 0.03, pMid: 0.31, pSmall: 0.07, rBig: [1.6, 2.6], rMid: [0.4, 1.2], rSmall: [0.05, 0.3], rLoss: [-1.3, -0.6],
  },
];
// Hours (UTC) that the seeded trader is bad at — creates a genuine time-of-day leak
const HOUR_WEIGHT = { 7: 1.3, 8: 1.6, 9: 1.4, 10: 1.2, 11: 0.9, 12: 1.1, 13: 1.1, 14: 0.8, 15: 1.0, 16: 0.9, 20: 0.4, 2: 0.5 };
const BAD_HOURS = new Set([15, 16]);
const EMOTIONS_GOOD = ['Calm', 'Focused', 'Neutral', 'Patient', 'Confident'];
const EMOTIONS_BAD = ['FOMO', 'Revenge', 'Impatient', 'Anxious', 'Frustrated', 'Greedy'];
const MISTAKES = ['Moved stop', 'Entered early', 'Overtraded', 'No plan', 'Chased price', 'Ignored higher timeframe', 'Sized up on tilt', 'Exited too early'];
const TAGS = ['A+ setup', 'News play', 'Pullback', 'Range', 'Breakout', 'Pre-session plan', 'Missed entry then chased', 'Scaled in', 'Partial taken'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} userId
 * @param {number|null} accountId
 * @param {object} opts { force: wipe existing demo rows first, days, tradesPerDay }
 */
async function seedUser(userId, accountId, opts = {}) {
  if (!accountId) {
    const acc = await db.prepare('SELECT id FROM accounts WHERE user_id=? ORDER BY is_default DESC LIMIT 1').get(userId);
    accountId = acc ? acc.id : null;
  }
  if (!accountId) return 0;
  if (opts.force) await db.prepare('DELETE FROM trades WHERE user_id=? AND account_id=?').run(userId, accountId);

  const rnd = mulberry32(20261006);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const weighted = (list, key = 'weight') => {
    const total = list.reduce((s, x) => s + x[key], 0);
    let r = rnd() * total;
    for (const item of list) { r -= item[key]; if (r <= 0) return item; }
    return list[list.length - 1];
  };
  const between = (a, b) => a + rnd() * (b - a);

  const account = await db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId);
  let balance = account.starting_balance;
  const strategies = await db.prepare('SELECT * FROM strategies WHERE user_id=?').all(userId);
  const stratByName = Object.fromEntries(strategies.map((s) => [s.name, s]));
  const instruments = await db.prepare('SELECT * FROM instruments WHERE user_id IS NULL').all();
  const specMap = Object.fromEntries(instruments.map((i) => [i.symbol, i]));

  const DAYS = opts.days || 78;               // ~3.5 months of trading days
  const start = new Date(Date.now() - DAYS * 864e5);
  const rows = [];
  const journalRows = [];

  let dayDate = new Date(start);
  let consecutiveLosses = 0;
  let lastLossClose = null;
  let openRisk = 0;

  while (dayDate <= new Date()) {
    const dow = dayDate.getUTCDay();
    if (dow === 0 || dow === 6) { dayDate = addDays(dayDate, 1); continue; }
    const isFriday = dow === 5;
    // fewer trades on Monday, more on Tue–Thu
    const baseCount = isFriday ? between(1, 4) : between(2, 7);
    let count = Math.round(baseCount * (rnd() < 0.12 ? 2.2 : 1));  // occasional overtrading day
    if (rnd() < 0.08) count = 0;                                   // some no-trade days
    const dayTrades = [];
    let dayPnl = 0;
    
    

    for (let i = 0; i < count; i++) {
      // ---- when ----
      const hourPool = Object.entries(HOUR_WEIGHT).flatMap(([h, w]) => Array(Math.max(1, Math.round(w * 10))).fill(Number(h)));
      let hour = pick(hourPool);
      const minute = Math.floor(rnd() * 60);
      const opened = new Date(Date.UTC(dayDate.getUTCFullYear(), dayDate.getUTCMonth(), dayDate.getUTCDate(), hour, minute));
      if (opened > new Date()) continue;

      // leak #2 — the trader keeps trading a bad hour, but only sometimes
      const badHour = BAD_HOURS.has(hour) && rnd() < 0.8;

      // ---- revenge trade? (leak #1) ----
      let revenge = false;
      if (lastLossClose && rnd() < 0.2) {
        const gapMin = (opened - lastLossClose) / 60000;
        if (gapMin >= 0 && gapMin <= 55) revenge = true;
      }
      // after 2 losses in a row, more likely to force a trade
      const afterTwo = consecutiveLosses >= 2;

      // ---- what ----
      const setup = weighted(SETUPS);
      const sym = pick(SYMBOLS);
      const spec = specMap[sym.symbol] || { value_per_point: 1, pip_size: 0.0001 };
      const inst = specMap[sym.symbol];
      const vpp = inst ? inst.value_per_point : 1;
      const direction = rnd() < 0.58 ? 'long' : 'short';

      // ---- sizing (with size creep after wins — leak #5) ----
      let riskPct = 0.9 + rnd() * 0.35;                 // 0.9% – 1.25% baseline
      if (rnd() < 0.14) riskPct = 1.6 + rnd() * 0.6;    // occasional over-size
      if (revenge) riskPct *= 1.4;
      if (afterTwo) riskPct *= 1.2;
      const riskMoney = balance * (riskPct / 100);

      const entry = round(sym.base * (1 + (rnd() - 0.5) * 0.02), inst ? entryDp(inst) : 5);
      const stopDist = entry * sym.stopPct * (0.75 + rnd() * 0.6);
      const stop = round(direction === 'long' ? entry - stopDist : entry + stopDist, inst ? entryDp(inst) : 5);
      const plannedR = round(between(1.6, 3.2), 1);
      const target = round(direction === 'long' ? entry + stopDist * plannedR : entry - stopDist * plannedR, inst ? entryDp(inst) : 5);

      let size = riskMoney / (stopDist * vpp);
      size = round(size, sym.lotRound);
      if (size <= 0) size = Math.pow(10, -sym.lotRound);

      // ---- outcome from the probability bands ----
      const q = rnd();
      let R;
      if (q < setup.pBig) R = between(setup.rBig[0], setup.rBig[1]);
      else if (q < setup.pBig + setup.pMid) R = between(setup.rMid[0], setup.rMid[1]);
      else if (q < setup.pBig + setup.pMid + setup.pSmall) R = between(setup.rSmall[0], setup.rSmall[1]);
      else R = between(setup.rLoss[0], setup.rLoss[1]);

      // ---- behavioural penalties: bad entries shrink wins and deepen losses ----
      const penalties = [];
      if (revenge) penalties.push([0.62, 1.12]);       // cuts winners, deepens losses
      if (afterTwo) penalties.push([0.82, 1.06]);
      if (badHour) penalties.push([0.70, 1.15]);
      if (count > 5) penalties.push([0.88, 1.04]);     // overtrading day
      if (isFriday) penalties.push([0.93, 1.02]);
      for (const [winMult, lossMult] of penalties) R = R > 0 ? R * winMult : R * lossMult;
      if (rnd() < 0.045) R = between(-1.35, -1.02);    // stop overshoot / slippage (leak)
      R = Math.max(-1.6, Math.min(5.5, R));
      R = round(R, 2);

      // ---- exits & excursions ----
      const realised = R;
      let mfe, mae;
      if (realised > 0) {
        // winners: they cut them early — capture efficiency around 55-65%
        mfe = round(Math.max(0.4, realised * between(1.35, 2.4)), 2);
        mae = round(-Math.abs(between(0, 0.28)), 2);
      } else {
        mae = round(realised * between(0.9, 1.0), 2);
        mfe = round(Math.abs(between(0.05, 0.55)), 2);
      }

      const risk = round(stopDist * size * vpp, 2);
      const gross = round(realised * risk, 2);
      const fees = inst && inst.asset_class === 'crypto'
        ? round(entry * size * 0.0004 * 2, 2)
        : round(sym.feePerUnit * (inst && inst.asset_class === 'cfd_index' ? size : size) * (inst && inst.asset_class === 'cfd_index' ? 1 : 1) + (inst && inst.asset_class === 'commodity' ? size * 2.1 : 0), 2);
      const exit = round(direction === 'long' ? entry + (gross / (size * vpp)) : entry - (gross / (size * vpp)), decimalsFor(entryDp(inst)));

      const holdMinutes = Math.round(between(12, 300) * (rnd() < 0.15 ? 6 : 1));
      const closed = new Date(opened.getTime() + holdMinutes * 60000);

      const noStop = rnd() < 0.03;                        // leak: missing stops
      const adherence = revenge ? Math.round(between(1, 3)) : (badHour ? Math.round(between(2, 4)) : Math.round(between(3, 5)));
      const emotion = revenge ? 'Revenge' : (badHour && rnd() < 0.5 ? 'FOMO' : (rnd() < 0.35 ? pick(EMOTIONS_BAD) : pick(EMOTIONS_GOOD)));
      const mistakes = [];
      if (rnd() < 0.22) mistakes.push(pick(MISTAKES));
      if (realised > 0 && mfe > realised * 1.5 && rnd() < 0.5) mistakes.push('Exited too early');
      if (revenge) mistakes.push('Sized up on tilt');

      const tagList = [setup.name ? pick(TAGS) : 'Impulse'].filter(Boolean);
      if (rnd() < 0.3) tagList.push(pick(TAGS));
      const timeframe = inst && inst.asset_class === 'forex' ? pick(['M15', 'H1', 'H1', 'H4']) : pick(['M5', 'M15', 'M15', 'H1']);

      rows.push({
        user_id: userId, account_id: accountId,
        symbol: sym.symbol, asset_class: inst ? inst.asset_class : 'stocks', direction,
        status: 'closed',
        opened_at: opened.toISOString(), closed_at: closed.toISOString(),
        entry, exit, stop: noStop ? null : stop, target,
        size, fees,
        gross_pnl: gross, net_pnl: round(gross - fees, 2),
        risk_amount: noStop ? 0 : risk,
        r_multiple: noStop ? 0 : round((gross - fees) / risk, 4),
        planned_r: noStop ? null : plannedR,
        mae_r: mae, mfe_r: mfe,
        stop_moved: rnd() < 0.08 ? 1 : 0,
        exit_reason: realised <= -0.95 ? 'Stop loss' : (realised >= plannedR * 0.92 ? 'Target' : (realised > 0 ? 'Discretionary win' : 'Discretionary loss')),
        strategy_id: setup.name && stratByName[setup.name] ? stratByName[setup.name].id : null,
        strategy_name: setup.name,
        setup_grade: pick(setup.grade),
        session: '',
        timeframes: timeframe,
        emotion_before: emotion,
        emotion_after: realised > 0 ? pick(['Satisfied', 'Calm', 'Relieved']) : pick(['Frustrated', 'Neutral', 'Annoyed']),
        confidence: Math.max(1, Math.min(5, Math.round(3 + (revenge ? -1.5 : 0) + (rnd() - 0.5)))),
        adherence,
        mistakes: [...new Set(mistakes)].join(', '),
        tags: [...new Set(tagList)].join(', '),
        thesis: thesisFor(sym.symbol, direction, setup.name),
        lesson: realised < -0.9 && rnd() < 0.5 ? 'Stop was correct — entry timing was late.' : '',
        execution_notes: '',
        notes: rnd() < 0.4 ? 'Managed per plan.' : '',
      });

      dayPnl += round(gross - fees, 2);
      consecutiveLosses = R < 0 ? consecutiveLosses + 1 : 0;
      lastLossClose = R < 0 ? closed : lastLossClose;
      dayTrades.push(R);
    }

    balance += dayPnl;
    if (dayPnl < 0 && dayPnl < -account.starting_balance * 0.02 && rnd() < 0.75) {
      journalRows.push({
        user_id: userId, account_id: accountId, entry_date: dayDate.toISOString().slice(0, 10),
        market_bias: pick(['Bullish', 'Bearish', 'Choppy', 'Neutral']),
        mood: Math.round(between(1, 3)), energy: Math.round(between(2, 4)),
        focus: 'Recover the day', plan: 'Wait for A+ setup only.',
        review: `Down ${Math.round(dayPnl)} on ${dayTrades.length} trades. Oversized after the first loss and kept pressing.`,
        lessons: pick(['Cut the day at 2 losses.', 'The third entry after a loss is never the good one.', 'Size discipline beats setup hunting.', 'Should have stopped at the daily limit.']),
        tomorrow: 'Half size until I bank a clean A+ trade.',
        screen_time_minutes: Math.round(between(180, 480)),
      });
    } else if (rnd() < 0.25) {
      journalRows.push({
        user_id: userId, account_id: accountId, entry_date: dayDate.toISOString().slice(0, 10),
        market_bias: pick(['Bullish', 'Bearish', 'Choppy', 'Neutral']),
        mood: Math.round(between(3, 5)), energy: Math.round(between(3, 5)),
        focus: pick(['Patient execution', 'Only A+ setups', 'Follow the plan', 'Protect the week']),
        plan: 'Standard risk, max 4 trades, no trading the 15:00 hour.',
        review: `${dayTrades.length} trades, P&L ${Math.round(dayPnl)}. Execution ${dayPnl > 0 ? 'clean' : 'sloppy'}.`,
        lessons: dayPnl > 0 ? 'Patience paid.' : 'Forced a trade that was not there.',
        tomorrow: pick(['Repeat the process.', 'Tighter filters.', 'Wait for the pullback.']),
        screen_time_minutes: Math.round(between(120, 420)),
      });
    }

    dayDate = addDays(dayDate, 1);
  }

  // One atomic write batch: libSQL transactions must not interleave with other
  // statements on the same connection, so every row is collected first.
  const INS_TRADE = `INSERT INTO trades (user_id,account_id,symbol,asset_class,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,
      gross_pnl,net_pnl,risk_amount,r_multiple,planned_r,mae_r,mfe_r,stop_moved,exit_reason,strategy_id,strategy_name,setup_grade,session,timeframes,
      emotion_before,emotion_after,confidence,adherence,mistakes,tags,thesis,lesson,execution_notes,notes)
    VALUES (@user_id,@account_id,@symbol,@asset_class,@direction,@status,@opened_at,@closed_at,@entry,@exit,@stop,@target,@size,@fees,
      @gross_pnl,@net_pnl,@risk_amount,@r_multiple,@planned_r,@mae_r,@mfe_r,@stop_moved,@exit_reason,@strategy_id,@strategy_name,@setup_grade,@session,@timeframes,
      @emotion_before,@emotion_after,@confidence,@adherence,@mistakes,@tags,@thesis,@lesson,@execution_notes,@notes)`;

  const stmts = [];
  for (const r of rows) {
    r.session = sessionFromHour(new Date(r.opened_at).getUTCHours());
    stmts.push({ sql: INS_TRADE, args: r });
  }
  for (const j of journalRows) {
    stmts.push({
      sql: `INSERT INTO journal_entries (user_id,account_id,entry_date,market_bias,mood,energy,focus,plan,review,lessons,tomorrow,screen_time_minutes)
        VALUES (@user_id,@account_id,@entry_date,@market_bias,@mood,@energy,@focus,@plan,@review,@lessons,@tomorrow,@screen_time_minutes)
        ON CONFLICT(user_id,entry_date) DO NOTHING`,
      args: j,
    });
  }
  const WL = `INSERT INTO watchlist (user_id,symbol,asset_class,thesis,bias,key_level,catalyst) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(user_id,symbol) DO NOTHING`;
  stmts.push({ sql: WL, args: [userId, 'EURUSD', 'forex', 'Range above 1.0800 while DXY holds below 105 — long from the lower edge.', 'bullish', '1.0800 support / 1.0925 supply', 'ECB speakers, US CPI'] });
  stmts.push({ sql: WL, args: [userId, 'XAUUSD', 'commodity', 'Trend intact above the 20EMA daily; buy dips into 2600.', 'bullish', '2600 demand', 'NFP, geopolitical headlines'] });
  stmts.push({ sql: WL, args: [userId, 'BTCUSDT', 'crypto', 'Half-way back to range highs; only interested on a clean reclaim.', 'neutral', '82k / 90k', 'ETF flows, FOMC'] });
  const GOAL = 'INSERT INTO goals (user_id,title,metric,target,period) VALUES (?,?,?,?,?)';
  stmts.push({ sql: GOAL, args: [userId, 'Finish the month green', 'net_pnl', 3000, 'month'] });
  stmts.push({ sql: GOAL, args: [userId, 'Average 4★+ rule adherence', 'adherence', 4, 'month'] });
  stmts.push({ sql: GOAL, args: [userId, 'Keep expectancy above +0.15R', 'expectancy_r', 0.15, 'month'] });

  await db.batch(stmts);
  return rows.length;
}

function sessionFromHour(h) {
  if (h >= 12 && h < 16) return 'overlap';
  if (h >= 7 && h < 12) return 'london';
  if (h >= 16 && h < 21) return 'newyork';
  if (h >= 0 && h < 7) return 'tokyo';
  return 'sydney';
}
function thesisFor(symbol, direction, setup) {
  const bias = direction === 'long' ? 'Long' : 'Short';
  const map = {
    EURUSD: `${bias} EURUSD — dollar softening into the London fix, 4H structure higher, entering on the pullback into value.`,
    GBPUSD: `${bias} cable — momentum continuation, watching the prior session high for acceptance.`,
    XAUUSD: `${bias} gold — real yields drifting, dip buyers defending the 20EMA on the daily.`,
    NAS100: `${bias} Nasdaq — breadth improving, index holding above the overnight range.`,
    US30: `${bias} Dow — rotation into industrials, index at the top of the value area.`,
    BTCUSDT: `${bias} BTC — liquidity sweep of the session low, then reclaim. Watching funding and ETF flows.`,
  };
  return map[symbol] || `${bias} ${symbol} — ${setup || 'discretionary'} execution.`;
}
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function round(v, dp) { const f = Math.pow(10, dp); return Math.round(v * f) / f; }
function entryDp(inst) {
  if (!inst) return 2;
  if (inst.asset_class === 'forex') return inst.pip_size === 0.01 ? 3 : 5;
  if (inst.asset_class === 'crypto') return 2;
  return 2;
}
function decimalsFor(dp) { return dp > 3 ? 5 : dp; }

module.exports = { seedUser };
