'use strict';
/**
 * coach.js — deterministic behavioural analytics.
 *
 * This is the "assistant" brain: instead of vague AI prose it hunts for the
 * specific, quantified leaks that cost real money and ranks them by dollar
 * impact, then produces a per-session focus plan. Deterministic = auditable:
 * every claim points at a slice of your own trade rows.
 */
const P = require('./performance');

const num = (v, d = 0) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const money = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');

function stat(list) {
  const n = list.length;
  const net = sum(list.map((t) => num(t.net_pnl)));
  const rs = list.map((t) => num(t.r_multiple));
  const w = list.filter((t) => t.is_win).length;
  const gp = sum(list.filter((t) => t.is_win).map((t) => num(t.net_pnl)));
  const gl = Math.abs(sum(list.filter((t) => t.is_loss).map((t) => num(t.net_pnl))));
  return {
    n, net: r2(net), exp_r: n ? r2(mean(rs)) : 0, win_rate: n ? r2((w / n) * 100) : 0,
    pf: gl > 0 ? r2(gp / gl) : null, total_r: r2(sum(rs)),
  };
}
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const sum = (a) => a.reduce((s, v) => s + (Number(v) || 0), 0);
const pct = (v) => `${Math.round(v)}%`;

/**
 * Run every check.  Returns insights sorted by severity then absolute impact.
 */
function analyse(trades, ctx = {}) {
  const closed = trades.filter((t) => t.status !== 'open');
  const out = [];
  const add = (o) => { if (o) out.push(o); };
  const n = closed.length;

  if (n < 5) {
    return {
      insights: [{
        id: 'need_data', severity: 'info', title: 'Not enough trades yet',
        detail: `You have ${n} closed trade${n === 1 ? '' : 's'} logged. Consistent logging matters more than any single result — patterns become statistically meaningful around 30–50 trades per setup.`,
        impact: 0, evidence: [{ label: 'Closed trades', value: String(n) }],
        action: 'Log every closed trade, including the mistakes. Gaps make your expectancy number dishonest.',
      }],
      score: null,
    };
  }

  const k = P.kpis(closed, { startingBalance: num(ctx.startingBalance, 10000) });
  const base = k.expectancy_r || 0;

  /* 1 — negative expectancy setups ------------------------------------- */
  for (const row of P.segment(closed, (t) => t.strategy_name || 'Untagged')) {
    if (row.trades >= 8 && row.expectancy_r < -0.05) {
      const list = closed.filter((t) => (t.strategy_name || 'Untagged') === row.key);
      add({
        id: 'neg_setup_' + row.key, category: 'strategy', severity: 'critical',
        title: `"${row.key}" has negative expectancy`,
        detail: `${row.trades} trades, ${pct(row.win_rate)} win rate, ${row.expectancy_r}R average, ${money(row.net_pnl)} total. At ~${row.trades} trades this is no longer bad luck — it is a leak.`,
        impact: row.net_pnl, evidence: evidenceOf(row),
        action: `Paper-trade or drop "${row.key}" until the entry criteria are re-written and it shows positive expectancy over 30+ trades.`,
      });
    }
  }

  /* 2 — time-of-day leak ------------------------------------------------ */
  if (k.trading_days >= 8) {
    const hours = P.timeGrids(closed).hours.filter((h) => h.trades >= 8);
    const worstHour = [...hours].sort((a, b) => a.net_pnl - b.net_pnl)[0];
    const bestHour = [...hours].sort((a, b) => b.expectancy_r - a.expectancy_r)[0];
    if (worstHour && worstHour.net_pnl < 0 && worstHour.expectancy_r < -0.1) {
      add({
        id: 'hour_leak_' + worstHour.key, category: 'timing', severity: 'critical',
        title: `Your ${worstHour.label} trades bleed money`,
        detail: `${worstHour.trades} trades taken in the ${worstHour.label} hour produced ${money(worstHour.net_pnl)} (${worstHour.expectancy_r}R average, ${pct(worstHour.win_rate)} win rate). You are bringing your worst decision-making to the same hour over and over.`,
        impact: worstHour.net_pnl, evidence: evidenceOf(worstHour),
        action: `Blackout the ${worstHour.label} window for 2 weeks. Nothing to prove by trading it — your own data says your edge is elsewhere.`,
      });
    }
    if (bestHour && bestHour.expectancy_r > Math.max(0.1, base * 1.5) && bestHour.net_pnl > 0) {
      add({
        id: 'hour_edge_' + bestHour.key, category: 'timing', severity: 'positive',
        title: `Your edge concentrates at ${bestHour.label}`,
        detail: `${bestHour.trades} trades in the ${bestHour.label} hour earn ${bestHour.expectancy_r}R per trade (${pct(bestHour.win_rate)} win rate, ${money(bestHour.net_pnl)}). That is your best window.`,
        impact: bestHour.net_pnl, evidence: evidenceOf(bestHour),
        action: `When time is scarce, protect the ${bestHour.label} window and size up to your normal risk there. Trade the rest of the day only on A+ setups.`,
      });
    }
  }

  /* 3 — day-of-week leak ------------------------------------------------ */
  const dowRows = P.timeGrids(closed).dow.filter((d) => d.trades >= 8 && d.net_pnl < 0 && d.expectancy_r < -0.1);
  const worstDow = dowRows.sort((a, b) => a.net_pnl - b.net_pnl)[0];
  if (worstDow) {
    add({
      id: 'dow_leak_' + worstDow.key, category: 'timing', severity: 'warning',
      title: `${worstDow.key} is a losing day for you`,
      detail: `${worstDow.trades} ${worstDow.key} trades total ${money(worstDow.net_pnl)} at ${worstDow.expectancy_r}R average.`,
      impact: worstDow.net_pnl, evidence: evidenceOf(worstDow),
      action: `Reduce ${worstDow.key} to review-only trading, or halve your risk on that day and re-measure in a month.`,
    });
  }

  /* 4 — revenge trading -------------------------------------------------- */
  const sorted = [...closed].sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at));
  let bestRevenge = null;
  for (const minutes of [30, 45, 60]) {
    const after = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      const gap = (new Date(cur.opened_at) - new Date(prev.closed_at || prev.opened_at)) / 60000;
      if (prev.is_loss && gap >= 0 && gap <= minutes && cur.day === prev.day) after.push(cur);
    }
    if (after.length < 6) continue;
    const s = stat(after);
    const delta = s.exp_r - base;
    if (delta < -0.15 && (!bestRevenge || Math.abs(delta) > Math.abs(bestRevenge.delta))) {
      bestRevenge = { minutes, s, delta };
    }
  }
  if (bestRevenge) {
    const { minutes, s, delta } = bestRevenge;
    const swing = s.net - s.n * k.expectancy;
    add({
      id: 'revenge_' + minutes, category: 'behaviour', severity: 'critical',
      title: `Trades opened within ${minutes} min of a loss underperform`,
      detail: `${s.n} re-entries inside ${minutes} minutes of a loss average ${s.exp_r}R versus your baseline ${r2(base)}R — a gap of ${r2(delta)}R per trade, about ${money(Math.abs(swing))} of difference against your own average.`,
      impact: swing, evidence: [...evidenceOf(s), { label: 'Baseline expectancy', value: `${r2(base)}R` }],
      action: `Adopt a ${minutes}-minute cooling-off rule after any loss: no new entry until the timer ends AND the setup reappears in your playbook.`,
    });
  }
  // After two consecutive losses
  const afterTwo = [];
  let run = 0;
  for (const t of sorted) {
    if (run >= 2) afterTwo.push(t);
    if (t.is_loss) run++; else if (t.is_win) run = 0;
  }
  if (afterTwo.length >= 6) {
    const s = stat(afterTwo);
    if (s.exp_r < base - 0.15) {
      add({
        id: 'after_two_losses', category: 'behaviour', severity: 'warning',
        title: 'You trade worse after two losses in a row',
        detail: `Trades taken while already down two consecutive losses: ${s.n} trades at ${s.exp_r}R versus ${r2(base)}R baseline.`,
        impact: s.net - s.n * k.expectancy, evidence: evidenceOf(s),
        action: 'Hard rule: stop for the session after 2 consecutive losses, or cut size to 25% for the rest of the day.',
      });
    }
  }

  /* 5 — overtrading / trade-count curve -------------------------------- */
  const byDay = {};
  for (const t of closed) { byDay[t.day] = byDay[t.day] || []; byDay[t.day].push(t); }
  const dayCounts = Object.values(byDay).map((l) => l.length);
  if (dayCounts.length >= 8) {
    const med = P.median(dayCounts);
    const threshold = Math.max(3, Math.ceil(med * 1.5));
    const heavy = Object.values(byDay).filter((l) => l.length > threshold).flat();
    const light = Object.values(byDay).filter((l) => l.length <= threshold).flat();
    if (heavy.length >= 8 && light.length >= 8) {
      const sh = stat(heavy), sl = stat(light);
      if (sh.exp_r < sl.exp_r - 0.1) {
        add({
          id: 'overtrading', category: 'behaviour', severity: 'critical',
          title: `Your ${threshold + 1}th trade of the day is where the money goes`,
          detail: `On days with more than ${threshold} trades you average ${sh.exp_r}R (net ${money(sh.net)} across ${sh.n} trades). On ordinary days you average ${sl.exp_r}R. The extra trades are not free — they are the invoice.`,
          impact: sh.net - sh.n * sl.exp_r * (k.avg_risk || 1) / Math.max(1, k.avg_risk ? 1 : 1) - 0, evidence: [
            ...evidenceOf(sh), { label: `Days ≤ ${threshold} trades`, value: `${sl.exp_r}R over ${sl.n}` },
          ],
          action: `Cap at ${threshold} trades per day. Once the cap is hit the platform is closed — review instead of trading.`,
        });
      }
    }
  }

  /* 6 — early exits / capture efficiency -------------------------------- */
  if (k.capture_efficiency !== null && k.capture_efficiency < 65 && k.mae_coverage > 40) {
    const left = closed.filter((t) => t.is_win && num(t.mfe_r) > 0).reduce((s, t) => s + (num(t.mfe_r) - num(t.r_multiple)) * num(t.risk_amount), 0);
    add({
      id: 'early_exits', category: 'management', severity: 'warning',
      title: 'You exit winners early',
      detail: `Your winners capture only ${k.capture_efficiency}% of the favourable excursion available (avg exit ${r2(k.avg_r)}R vs avg MFE ${r2(k.avg_mfe_r)}R). At your own risk sizing that is roughly ${money(left)} of profit handed back across ${k.wins} winners.`,
      impact: -left, evidence: [
        { label: 'Capture efficiency', value: `${k.capture_efficiency}%` }, { label: 'Avg realised (winners)', value: `${r2(k.avg_r)}R` },
        { label: 'Avg MFE', value: `${r2(k.avg_mfe_r)}R` }, { label: 'Profit left on table', value: money(left) },
      ],
      action: 'Two exits are measurable on your own data: hold the whole position to the structural target, or bank part at a fixed early R and move the stop to break-even. Measured across 24 market/timeframe series on 2026-10-06 (7,028 unique setups, docs/MEASURED-RULES.md): filtering for a high win rate lifted it to 69–75% while expectancy stayed negative (−0.08R at a 0.25R target), whereas a displacement-leg entry with a stop ≥ 0.6 ATR held to a 3R target earned +0.31R on 261 in-sample setups and +0.56R on 109 out-of-sample ones, at 35–42% wins. Recompute your own MFE before choosing.',
    });
  }

  /* 6a — the win-rate dial: what YOUR payoff needs ---------------------- */
  if (closed.length >= 20 && isFinite(k.payoff) && k.payoff > 0) {
    const need = (1 / (1 + k.payoff)) * 100;
    const margin = k.win_rate - need;
    add({
      id: 'win_rate_dial', category: 'management', severity: margin < -5 ? 'warning' : 'info',
      title: `${r2(k.win_rate)}% wins — your own payoff only needs ${r2(need)}%`,
      detail: `You average ${r2(k.avg_win)} on winners and ${r2(k.avg_loss)} on losers, a payoff of ${r2(k.payoff)}:1. That ratio breaks even at a ${r2(need)}% win rate and you are running ${r2(k.win_rate)}% — a margin of ${margin >= 0 ? '+' : ''}${r2(margin)} points. Chasing a 70% win rate is only worth it if it does not shrink the payoff: measured on 24 markets (2026-10-06, docs/MEASURED-RULES.md) the same entry model can be filtered to win 69–75% at a 0.25R target and still lose 0.08R per trade, or to win 42% and earn +0.56R per trade out of sample.`,
      impact: margin >= 0 ? Math.abs(k.net_pnl || 0) * 0 : null,
      evidence: [
        { label: 'Your win rate', value: `${r2(k.win_rate)}%` },
        { label: 'Break-even for your payoff', value: `${r2(need)}%` },
        { label: 'Payoff (avg win / avg loss)', value: `${r2(k.payoff)}:1` },
        { label: 'Expectancy per trade', value: `${r2(k.expectancy_r === null || k.expectancy_r === undefined ? 0 : k.expectancy_r * 100) / 100}R` },
      ],
      action: margin >= 0
        ? 'Your win rate already beats the break-even your payoff demands — protect the payoff: let the structural target pay instead of closing early, and keep the stop where the idea is wrong.'
        : 'Do not buy the missing points with an early exit: raise the payoff instead (hold to the first structural target, skip entries whose reward is under 1.5:1). An earlier exit raises the win rate and lowers the money — that trade-off is measured in docs/MEASURED-RULES.md.',
    });
  }

  /* 6b — runs handed back (management is the measured edge) ------------- */
  const gaveBack = closed.filter((t) => num(t.mfe_r) >= 1 && num(t.r_multiple) <= 0.2);
  if (gaveBack.length >= 3) {
    const given = gaveBack.reduce((s, t) => s + (num(t.mfe_r) - Math.max(0, num(t.r_multiple))), 0);
    const share = Math.round((gaveBack.length / closed.length) * 100);
    add({
      id: 'gave_back_runner', category: 'management', severity: gaveBack.length / closed.length > 0.25 ? 'critical' : 'warning',
      title: 'Trades that ran +1R and still closed flat or red',
      detail: `${gaveBack.length} trades (${share}% of the sample) were at least +1R in your favour and finished at ${r2(gaveBack.reduce((s, t) => s + num(t.r_multiple), 0) / gaveBack.length)}R on average — ${r2(given)}R of open profit round-tripped.`,
      impact: -given, evidence: [
        { label: 'Trades at +1R that ended ≤ +0.2R', value: `${gaveBack.length}` },
        { label: 'Average MFE on those trades', value: `${r2(gaveBack.reduce((s, t) => s + num(t.mfe_r), 0) / gaveBack.length)}R` },
        { label: 'R handed back', value: `${r2(given)}R` },
      ],
      action: 'Bank the partial at the first structural target, move the stop to break-even, then leave the runner alone until the opposing pool. Measured over 11,092 walk-forward replays (docs/EDGE-REPORT.md, 2026-10-06) the entry model only clears its own break-even bar when the runners are protected — every exit plan that let a full position run unprotected measured negative expectancy.',
    });
  }

  /* 7 — stops inside the noise ------------------------------------------ */
  if (k.avg_mae_r !== null && k.avg_mae_r < -0.72 && k.mae_coverage > 40) {
    add({
      id: 'tight_stops', category: 'risk', severity: 'warning',
      title: 'Your stop losses sit inside normal noise',
      detail: `Average adverse excursion is ${k.avg_mae_r}R — losing trades routinely push close to your full stop before deciding. That is a coin-flip plus spread, not a risk plan.`,
      impact: k.net_pnl * -0.15, evidence: [{ label: 'Avg MAE', value: `${k.avg_mae_r}R` }, { label: 'Stops nearly hit', value: String(k.stops_overshot) }],
      action: 'Push stops beyond the last swing + ATR buffer and cut size proportionally to keep the same dollar risk.',
    });
  }

  /* 8 — risk creep ------------------------------------------------------- */
  const winsSeq = [];
  let prevWasWin = null;
  for (const t of sorted) {
    if (prevWasWin === true && num(t.risk_amount) > 0) winsSeq.push({ t, afterWin: true });
    else if (prevWasWin === false && num(t.risk_amount) > 0) winsSeq.push({ t, afterWin: false });
    prevWasWin = t.is_win;
  }
  if (winsSeq.length >= 20) {
    const afterW = winsSeq.filter((x) => x.afterWin).map((x) => num(x.t.risk_amount));
    const afterL = winsSeq.filter((x) => !x.afterWin).map((x) => num(x.t.risk_amount));
    if (afterW.length >= 8 && afterL.length >= 8) {
      const mw = mean(afterW), ml = mean(afterL);
      if (mw > ml * 1.25) {
        const s = stat(winsSeq.filter((x) => x.afterWin).map((x) => x.t));
        add({
          id: 'size_creep', category: 'risk', severity: 'warning',
          title: 'You size up after wins',
          detail: `Average risk after a win is ${money(mw)} versus ${money(ml)} after a loss (+${Math.round((mw / ml - 1) * 100)}%). Confidence sizing compounds drawdowns: those trades returned ${s.exp_r}R.`,
          impact: mw - ml, evidence: [{ label: 'Avg risk after win', value: money(mw) }, { label: 'Avg risk after loss', value: money(ml) }, { label: 'Expectancy (post-win)', value: `${s.exp_r}R` }],
          action: 'Fix a single risk unit (e.g. 1% = one size) and only change it monthly based on equity, never on mood.',
        });
      }
    }
  }

  /* 9 — rule adherence vs results ---------------------------------------- */
  const adh = closed.filter((t) => num(t.adherence) > 0);
  if (adh.length >= 12) {
    const high = adh.filter((t) => num(t.adherence) >= 4);
    const low = adh.filter((t) => num(t.adherence) <= 2);
    if (high.length >= 5 && low.length >= 4) {
      const sh = stat(high), sl = stat(low);
      const cost = sl.net - sl.n * (sh.exp_r);
      if (sl.exp_r < sh.exp_r - 0.15) {
        add({
          id: 'adherence', category: 'discipline', severity: 'warning',
          title: 'Breaking your own rules is the expensive part',
          detail: `Trades you rated 4–5★ for rule adherence: ${sh.exp_r}R over ${sh.n}. Trades rated 1–2★: ${sl.exp_r}R over ${sl.n}.`,
          impact: cost, evidence: [...evidenceOf(sh, 'Plan followed'), ...evidenceOf(sl, 'Rules broken')],
          action: 'Your entry checklist is the edge. If a setup cannot pass 8/8 checks, it is not the trade you are good at — skip it.',
        });
      } else if (sh.exp_r > 0.15) {
        add({
          id: 'adherence_pos', category: 'discipline', severity: 'positive',
          title: 'Discipline is your highest-value habit',
          detail: `4–5★ adherence trades return ${sh.exp_r}R versus ${sl.exp_r}R when rules slip. That difference is your whole edge, quantified.`,
          impact: sh.net, evidence: evidenceOf(sh, 'Plan followed'), action: 'Keep grading every trade honestly — the number only works if the rating is honest.',
        });
      }
    }
  }

  /* 10 — emotional state ------------------------------------------------- */
  const negWords = ['revenge', 'fomo', 'anxious', 'angry', 'frustrated', 'greedy', 'impatient', 'tilted', 'bored', 'tired', 'fear'];
  const neg = closed.filter((t) => negWords.some((w) => String(t.emotion_before || '').toLowerCase().includes(w)));
  const pos = closed.filter((t) => /calm|confident|focused|patient|neutral|disciplined/i.test(String(t.emotion_before || '')));
  if (neg.length >= 6 && pos.length >= 5) {
    const sn = stat(neg), sp = stat(pos);
    if (sn.exp_r < sp.exp_r - 0.15) {
      add({
        id: 'emotion', category: 'psychology', severity: 'critical',
        title: `${neg.length} trades were taken in a bad mental state`,
        detail: `Trades tagged with a negative state (${[...new Set(neg.map((t) => t.emotion_before))].slice(0, 4).join(', ')}) average ${sn.exp_r}R. Calm/focused trades average ${sp.exp_r}R. Same trader, different state, ${money(sn.net)} difference.`,
        impact: sn.net - sn.n * sp.exp_r, evidence: [...evidenceOf(sn, 'Negative state'), ...evidenceOf(sp, 'Calm / focused')],
        action: 'Add a 10-second state check before every entry. If the honest answer is not calm/neutral, the trade does not happen.',
      });
    }
  }

  /* 11 — symbol leak ----------------------------------------------------- */
  const symRows = P.segment(closed, (t) => t.symbol).filter((r) => r.trades >= 6 && r.net_pnl < 0 && r.expectancy_r < -0.15);
  if (symRows.length) {
    const top = symRows.slice(0, 3);
    add({
      id: 'symbol_leak', category: 'instrument', severity: 'warning',
      title: `${top.length === 1 ? 'One instrument is' : 'Some instruments are'} costing you`,
      detail: top.map((r) => `${r.key}: ${money(r.net_pnl)} over ${r.trades} trades (${r.expectancy_r}R)`).join(' · '),
      impact: sum(top.map((r) => r.net_pnl)),
      evidence: top.map((r) => ({ label: r.key, value: `${r.expectancy_r}R / ${r.trades} trades` })),
      action: 'Concentrate on the 2–3 instruments where your read is genuinely better and delete the rest from your watchlist.',
    });
  }

  /* 12 — long/short bias -------------------------------------------------- */
  const longRows = P.segment(closed, (t) => 'Long'), shortRows = P.segment(closed, (t) => 'Short');
  const dir = (k2) => stat(closed.filter((t) => (String(t.direction).toLowerCase() === 'short' ? 'Short' : 'Long') === k2));
  const L = dir('Long'), S = dir('Short');
  if (L.n >= 10 && S.n >= 10 && Math.abs(L.exp_r - S.exp_r) > 0.3 && Math.min(L.exp_r, S.exp_r) < 0) {
    const bad = L.exp_r < S.exp_r ? 'Long' : 'Short';
    const good = bad === 'Long' ? 'Short' : 'Long';
    add({
      id: 'side_bias', category: 'strategy', severity: 'warning',
      title: `Your ${bad.toLowerCase()} side is the weak one`,
      detail: `${bad}s: ${(bad === 'Long' ? L : S).exp_r}R over ${(bad === 'Long' ? L : S).n} trades. ${good}s: ${(good === 'Long' ? L : S).exp_r}R over ${(good === 'Long' ? L : S).n}. You are fighting the market on one side.`,
      impact: (bad === 'Long' ? L : S).net,
      evidence: [{ label: `Long (${L.n})`, value: `${L.exp_r}R` }, { label: `Short (${S.n})`, value: `${S.exp_r}R` }],
      action: `Restrict ${bad.toLowerCase()}s to A+ setups for the next 20 trades (strong higher-timeframe agreement), and re-measure.`,
    });
  }

  /* 13 — disposition effect (hold losers longer) -------------------------- */
  if (k.hold_asymmetry !== null && k.hold_asymmetry < 1 && k.avg_loss_hold > 0 && k.avg_win_hold > 0 && k.losses >= 8 && k.wins >= 8) {
    add({
      id: 'disposition', category: 'management', severity: 'warning',
      title: 'You hold losers longer than winners',
      detail: `Average losing trade lasts ${fmtMin(k.avg_loss_hold)} versus ${fmtMin(k.avg_win_hold)} for winners (${k.hold_asymmetry}× ratio). Hope is getting more screen time than edge.`,
      impact: -Math.abs(k.avg_loss) * k.losses * 0.15,
      evidence: [{ label: 'Avg loss hold', value: fmtMin(k.avg_loss_hold) }, { label: 'Avg win hold', value: fmtMin(k.avg_win_hold) }],
      action: 'Add a time-stop to every trade: if the setup has not worked in its expected window, close it — no re-negotiating with the chart.',
    });
  }

  /* 13b — M36: how you scale in ------------------------------------------
     Ep 11 shows the method (add into a winner after confirmation, then move the stop below the
     new low). Ep 18 warns about the opposite: adding into a loser is averaging down, and it is
     the most expensive habit in the book. Now that `entries` legs exist the two can be told
     apart, which they could not be when a pyramid was journalled as two unrelated trades. */
  {
    const pyramids = closed.filter((t) => Number(t.entries_n) > 1);
    if (pyramids.length >= 4) {
      const intoWinners = pyramids.filter((t) => Number(t.adds_into_winner) === 1);
      const intoLosers = pyramids.filter((t) => Number(t.adds_into_winner) === 0);
      const exp = (rows) => rows.length
        ? rows.reduce((a, t) => a + (Number(t.net_pnl) || 0), 0) / rows.length : 0;
      if (intoLosers.length > intoWinners.length) {
        add({
          id: 'averaging_down', category: 'risk', severity: 'critical',
          title: 'Most of your adds are into losers, not winners',
          detail: `${intoLosers.length} of ${pyramids.length} pyramided trades were added to BELOW the average entry (averaging down), versus ${intoWinners.length} added into a winner. The course adds only after further confirmation in the trade's favour, then moves the stop below the new low — the opposite of rescuing a losing idea.`,
          impact: -(Math.abs(exp(intoLosers)) * intoLosers.length) * 0.5,
          evidence: [
            { label: 'Adds into losers', value: String(intoLosers.length) },
            { label: 'Adds into winners', value: String(intoWinners.length) },
            { label: 'Avg P&L, adds into losers', value: String(Math.round(exp(intoLosers))) },
          ],
          action: 'Only add when the trade has confirmed in your favour, and move the stop to below the new low before you do. If the reason to add is "it is cheaper now", that is averaging down — stand down instead.',
        });
      } else if (intoWinners.length >= 3) {
        add({
          id: 'scaling_in_well', category: 'discipline', severity: 'positive',
          title: 'You scale into winners, not into losers',
          detail: `${intoWinners.length} of ${pyramids.length} pyramided trades were added above the average entry — adding after confirmation, the way the method describes.`,
          impact: Math.abs(exp(intoWinners)) * intoWinners.length * 0.1,
          evidence: [
            { label: 'Adds into winners', value: String(intoWinners.length) },
            { label: 'Adds into losers', value: String(intoLosers.length) },
          ],
          action: 'Keep the stop discipline with it: every add moves the stop below the new low, so the added size never increases the risk of the original idea.',
        });
      }
    }
  }

  /* 14 — drawdown concentration ------------------------------------------ */
  const days = P.dailySeries(closed);
  const dayList = Object.values(days).sort((a, b) => a.pnl - b.pnl);
  const totalLoss = Math.abs(sum(Object.values(days).filter((d) => d.pnl < 0).map((d) => d.pnl)));
  if (dayList.length >= 10 && totalLoss > 0) {
    const worst = dayList[0];
    const share = Math.abs(worst.pnl) / totalLoss;
    if (share > 0.22) {
      add({
        id: 'dd_concentration', category: 'risk', severity: 'critical',
        title: 'A single day causes most of your damage',
        detail: `${worst.date} lost ${money(worst.pnl)} across ${worst.trades} trades — ${Math.round(share * 100)}% of all your losing dollars. One session is deciding your month.`,
        impact: worst.pnl, evidence: [{ label: 'Worst day', value: `${worst.date} ${money(worst.pnl)}` }, { label: 'Trades that day', value: String(worst.trades) }, { label: 'Share of all losses', value: pct(share * 100) }],
        action: 'Set a hard daily stop: -3% (or 2 full R) and flat the platform. The best traders are defined by the days they stop trading, not the days they win.',
      });
    }
  }

  /* 15 — fees / costs ---------------------------------------------------- */
  if (k.fees > 0 && Math.abs(k.gross_pnl) > 0 && k.fees / Math.abs(k.gross_pnl) > 0.18) {
    add({
      id: 'fees', category: 'costs', severity: 'warning',
      title: 'Costs are eating a fifth of your gross profit',
      detail: `${money(k.fees)} of commissions/fees against ${money(k.gross_pnl)} gross (${k.fees_pct}%).`,
      impact: -k.fees, evidence: [{ label: 'Fees', value: money(k.fees) }, { label: 'Gross P&L', value: money(k.gross_pnl) }],
      action: 'Fewer, larger, higher-conviction trades beat many small ones once costs are counted. Also check your per-trade commission tier.',
    });
  }

  /* 16 — missing stops ---------------------------------------------------- */
  const noStop = closed.filter((t) => !num(t.stop));
  if (noStop.length >= 3) {
    add({
      id: 'no_stop', category: 'risk', severity: 'critical',
      title: `${noStop.length} trades have no stop recorded`,
      detail: 'A trade without a pre-defined stop has no defined risk, which means R-multiples, expectancy and position sizing are all fiction for that trade.',
      impact: sum(noStop.map((t) => t.net_pnl)), evidence: [{ label: 'Trades without stop', value: String(noStop.length) }, { label: 'Net P&L of those', value: money(sum(noStop.map((t) => t.net_pnl))) }],
      action: 'Record the stop on every trade from now on — it is what turns a P&L log into a decision tool.',
    });
  }

  /* 17 — stop overshoot --------------------------------------------------- */
  if (k.stops_overshot >= 3) {
    add({
      id: 'stop_overshoot', category: 'risk', severity: 'warning',
      title: `${k.stops_overshot} trades lost more than 1R`,
      detail: `Realised risk exceeded the planned stop on ${k.stops_overshot} trades — either the stop was moved, or slippage ate the difference. Your realised average risk is ${money(k.avg_risk)}.`,
      impact: sum(closed.filter((t) => num(t.mae_r) < -1).map((t) => num(t.net_pnl))) * 0.3,
      evidence: [{ label: 'Trades worse than -1R', value: String(k.stops_overshot) }, { label: 'Worst', value: `${k.worst_r}R` }],
      action: 'Use hard stop orders in the market, not mental stops. If you widen stops mid-trade, log it as a mistake tag so the pattern is visible.',
    });
  }

  /* 18 — positive: best setup -------------------------------------------- */
  const bestSetup = [...P.segment(closed, (t) => t.strategy_name || 'Untagged')]
    .filter((r) => r.trades >= 6 && r.expectancy_r > 0.2)
    .sort((a, b) => b.expectancy_r - a.expectancy_r)[0];
  if (bestSetup) {
    add({
      id: 'best_setup', category: 'strategy', severity: 'positive',
      title: `"${bestSetup.key}" is your A-game`,
      detail: `${bestSetup.trades} trades, ${bestSetup.expectancy_r}R average, ${pct(bestSetup.win_rate)} win rate, ${money(bestSetup.net_pnl)} total. This is what "only my best setup" looks like in numbers.`,
      impact: bestSetup.net_pnl, evidence: evidenceOf(bestSetup),
      action: 'Build your week around this pattern. If a day offers nothing that looks like it, the correct number of trades is zero.',
    });
  }

  /* 19 — profit concentration / fragility -------------------------------- */
  const sortedDays = Object.values(days).sort((a, b) => b.pnl - a.pnl);
  const totalWin = sum(sortedDays.filter((d) => d.pnl > 0).map((d) => d.pnl));
  if (sortedDays.length >= 10 && totalWin > 0 && sortedDays[0].pnl / totalWin > 0.4) {
    add({
      id: 'fragile', category: 'consistency', severity: 'info',
      title: 'Your profits lean on very few days',
      detail: `Your single best day (${sortedDays[0].date}, ${money(sortedDays[0].pnl)}) is ${Math.round((sortedDays[0].pnl / totalWin) * 100)}% of all winning dollars. Remove it and your month looks very different.`,
      impact: 0, evidence: [{ label: 'Best day', value: money(sortedDays[0].pnl) }, { label: 'Total profits', value: money(totalWin) }, { label: 'Days traded', value: String(sortedDays.length) }],
      action: 'Judge yourself on median day and expectancy, not the outlier. Consistency shows up as a smooth equity curve, not a lucky Tuesday.',
    });
  }

  /* 20 — risk consistency ------------------------------------------------- */
  if (k.risk_consistency > 45 && k.trades >= 20) {
    add({
      id: 'risk_inconsistency', category: 'risk', severity: 'warning',
      title: 'Your position risk is inconsistent',
      detail: `Risk per trade varies by ${k.risk_consistency}% around its average (${money(k.avg_risk)}). Variable risk makes every statistic downstream noisier and makes big losses more likely.`,
      impact: -Math.abs(k.max_drawdown) * 0.1,
      evidence: [{ label: 'Avg risk', value: money(k.avg_risk) }, { label: 'Variation', value: `${k.risk_consistency}%` }],
      action: 'Normalise to a fixed fraction of equity (e.g. 1%) and let the position size — not your conviction — absorb the difference.',
    });
  }

  /* 21 — session quality -------------------------------------------------- */
  const sessRows = P.segment(closed, (t) => t.session_label).filter((r) => r.trades >= 8);
  if (sessRows.length >= 2) {
    const bestS = sessRows[0], worstS = sessRows[sessRows.length - 1];
    if (bestS.expectancy_r > 0 && worstS.expectancy_r < 0) {
      add({
        id: 'session_split', category: 'timing', severity: 'info',
        title: `${bestS.key} is your session, ${worstS.key} is not`,
        detail: `${bestS.key}: ${bestS.expectancy_r}R over ${bestS.trades} trades. ${worstS.key}: ${worstS.expectancy_r}R over ${worstS.trades} trades (${money(worstS.net_pnl)}).`,
        impact: worstS.net_pnl, evidence: [...evidenceOf(bestS), ...evidenceOf(worstS)],
        action: `Consider trading only your strongest session for a month and journal the extra free time instead of the extra trades.`,
      });
    }
  }

  const order = { critical: 0, warning: 1, info: 2, positive: 3 };
  out.sort((a, b) => (order[a.severity] - order[b.severity]) || (Math.abs(b.impact) - Math.abs(a.impact)));

  return {
    insights: out,
    score: disciplineScore(k, closed, out),
    summary: {
      headline: headline(k, out),
      expectancy_r: k.expectancy_r, net_pnl: k.net_pnl, profit_factor: k.profit_factor,
      win_rate: k.win_rate, trades: k.trades, max_dd_pct: k.max_drawdown_pct,
      critical: out.filter((i) => i.severity === 'critical').length,
      warnings: out.filter((i) => i.severity === 'warning').length,
    },
  };
}

function evidenceOf(s, label) {
  return [{ label: (label ? label + ': ' : '') + 'Trades', value: `${s.n ?? s.trades}` },
    { label: 'Expectancy', value: `${s.exp_r ?? s.expectancy_r}R` },
    { label: 'Win rate', value: `${s.win_rate}%` },
    { label: 'Net', value: money(s.net ?? s.net_pnl) }];
}
function fmtMin(m) {
  const v = Math.round(Number(m) || 0);
  if (v < 60) return `${v}m`;
  if (v < 1440) return `${(v / 60).toFixed(1)}h`;
  return `${(v / 1440).toFixed(1)}d`;
}
function headline(k, insights) {
  const worst = insights.filter((i) => i.severity === 'critical')[0];
  if (k.trades < 20) return `You have ${k.trades} closed trades. Keep logging — the analytics get sharp after 30+ per setup.`;
  if (worst) return `Your biggest leak right now: ${worst.title.toLowerCase()} — worth about ${money(Math.abs(worst.impact))}.`;
  if (k.expectancy_r > 0.15) return `Positive expectancy of ${k.expectancy_r}R per trade with a ${k.profit_factor ?? '—'} profit factor. Your job now is repetition, not discovery.`;
  return `Expectancy is ${k.expectancy_r}R — close to flat. Tighten the filters rather than adding strategies.`;
}

/** A 0–100 "process health" score blending discipline, risk and consistency. */
function disciplineScore(k, closed, insights) {
  if (!k.trades) return null;
  let s = 55;
  s += Math.min(15, Math.max(-20, k.expectancy_r * 20));               // edge quality
  s += k.risk_consistency ? Math.max(-12, 12 - (k.risk_consistency - 20) * 0.3) : 0;
  s += k.avg_adherence ? (k.avg_adherence - 3) * 6 : 0;                 // self-graded discipline
  const untagged = closed.filter((t) => !t.strategy_name).length / k.trades;
  s -= untagged * 15;
  const unstopped = closed.filter((t) => !num(t.stop)).length / k.trades;
  s -= unstopped * 20;
  const logged = closed.filter((t) => t.notes || t.thesis || t.lesson || t.execution_notes).length / k.trades;
  s += (logged - 0.5) * 10;
  s -= Math.min(12, insights.filter((i) => i.severity === 'critical').length * 2.5);
  s -= Math.abs(k.max_drawdown_pct) > 15 ? 6 : 0;
  s += (k.profit_factor && k.profit_factor > 1 ? 4 : 0);
  const grade = s >= 85 ? 'A' : s >= 72 ? 'B' : s >= 60 ? 'C' : s >= 45 ? 'D' : 'F';
  return { score: Math.max(0, Math.min(100, Math.round(s))), grade };
}

/* ---------------------------------------------------------- daily briefing */
/**
 * Pre-session briefing: combines live market context with the trader's own
 * behavioural record so the plan is personal, not generic.
 */
function briefing({ trades, events = [], quotes = {}, account, journalEntry, riskRules }) {
  const closed = trades.filter((t) => t.status !== 'open');
  const open = trades.filter((t) => t.status === 'open');
  const today = P.localDateStr(new Date().toISOString());
  const analysis = analyse(closed, { startingBalance: account ? account.starting_balance : 10000 });
  const k = P.kpis(closed, { startingBalance: account ? account.starting_balance : 10000 });
  const dow = P.localParts(new Date().toISOString()).weekday;
  const dowStat = P.timeGrids(closed).dow.find((d) => d.key === dow);
  const weekStart = startOfWeek(new Date());
  const weekTrades = closed.filter((t) => new Date(t.opened_at) >= weekStart);
  const weekPnl = sum(weekTrades.map((t) => num(t.net_pnl)));
  const todayTrades = closed.filter((t) => t.day === today);
  const todayPnl = sum(todayTrades.map((t) => num(t.net_pnl)));
  const streak = k.streaks;
  const dd = k.current_drawdown_pct;

  // Risk state: shrink size when in drawdown or after a bad day
  let riskMultiplier = 1;
  const reasons = [];
  if (dd <= -6) { riskMultiplier *= 0.5; reasons.push(`Drawdown of ${dd}% from peak equity → half size.`); }
  else if (dd <= -3) { riskMultiplier *= 0.75; reasons.push(`Drawdown of ${dd}% from peak → 75% size.`); }
  if (todayPnl < 0 && account && todayPnl < -account.starting_balance * 0.02) { riskMultiplier *= 0.5; reasons.push('Down more than 2% today → half size or stop.'); }
  if (streak.current_type === 'loss' && Math.abs(streak.current) >= 3) { riskMultiplier *= 0.6; reasons.push(`${Math.abs(streak.current)} losses in a row → cut size until a clean win.`); }
  if (streak.current_type === 'win' && streak.current >= 4) { riskMultiplier *= 0.9; reasons.push(`${streak.current} wins in a row → resist size creep, keep the same unit.`); }
  if (!reasons.length) reasons.push('No drawdown or streak flags. Trade your standard risk unit.');

  const highEvents = events.filter((e) => String(e.impact).toLowerCase() === 'high');
  const dayEvents = highEvents.filter((e) => String(e.date).slice(0, 10) === today);
  if (dayEvents.length) reasons.push(`${dayEvents.length} high-impact event${dayEvents.length > 1 ? 's' : ''} today — expect spikes and wider spreads.`);

  const focus = analysis.insights.filter((i) => i.severity === 'critical' || i.severity === 'warning').slice(0, 3);
  const realised = closed.reduce((s2, t) => s2 + num(t.net_pnl), 0);
  const bank = account ? r2(num(account.starting_balance, 10000) + realised) : 10000;
  const suggestedRiskPct = account ? account.risk_per_trade_pct : 0.5;  // M9: fallback 1 -> 0.5
  const suggestedRisk = r2(bank * (suggestedRiskPct / 100) * riskMultiplier);

  return {
    date: today, weekday: dow,
    greeting: greeting(),
    market_context: {
      events_today: dayEvents.slice(0, 8),
      events_next: highEvents.filter((e) => new Date(e.date) > new Date()).slice(0, 8),
      quotes,
    },
    account: account ? {
      name: account.name, balance: bank, starting_balance: account.starting_balance,
      daily_loss_limit: r2(bank * (num(account.daily_loss_limit_pct, 3) / 100)),
      max_drawdown_allowed: r2(account.starting_balance * (num(account.max_drawdown_pct, 10) / 100)),
    } : null,
    performance: {
      today_pnl: r2(todayPnl), today_trades: todayTrades.length,
      week_pnl: r2(weekPnl), week_trades: weekTrades.length,
      expectancy_r: k.expectancy_r, win_rate: k.win_rate, profit_factor: k.profit_factor,
      current_drawdown_pct: k.current_drawdown_pct, streak,
      weekday_record: dowStat ? { day: dow, net_pnl: dowStat.net_pnl, expectancy_r: dowStat.expectancy_r, trades: dowStat.trades, win_rate: dowStat.win_rate } : null,
    },
    risk_plan: {
      multiplier: r2(riskMultiplier), suggested_risk: suggestedRisk,
      suggested_risk_pct: r2(suggestedRiskPct * riskMultiplier),
      max_trades_today: Math.max(2, Math.round(k.avg_trades_per_day || 3)),
      max_loss_today: r2(bank * (num(account && account.daily_loss_limit_pct, 3) / 100) * (riskMultiplier < 1 ? 0.6 : 1)),
      reasons,
    },
    open_positions: open.map((t) => ({
      id: t.id, symbol: t.symbol, direction: t.direction, entry: t.entry, stop: t.stop,
      target: t.target, size: t.size, opened_at: t.opened_at, risk_amount: t.risk_amount,
      unrealised: quotes[t.symbol] && quotes[t.symbol].price
        ? r2((quotes[t.symbol].price - t.entry) * (String(t.direction).toLowerCase() === 'short' ? -1 : 1) * t.size * 1)
        : null,
    })),
    focus: focus.map((f) => ({ title: f.title, action: f.action, impact: f.impact })),
    checklist: (riskRules && riskRules.default_checklist) || [],
    journal_entry: journalEntry || null,
    plan_of_the_day: buildPlanOfDay(analysis, dowStat, dayEvents),
  };
}

function buildPlanOfDay(analysis, dowStat, dayEvents) {
  const lines = [];
  if (dowStat && dowStat.trades >= 6 && dowStat.expectancy_r < -0.1) lines.push(`Historically your ${dowStat.key} expectancy is ${dowStat.expectancy_r}R — take fewer, better setups today.`);
  else if (dowStat && dowStat.trades >= 6 && dowStat.expectancy_r > 0.2) lines.push(`${dowStat.key} is historically one of your better days (${dowStat.expectancy_r}R). Trade it normally.`);
  if (dayEvents.length) lines.push(`Event risk: ${dayEvents.map((e) => `${e.title} (${e.currency}) @ ${e.time_label || e.date}`).slice(0, 3).join(', ')}. Flatten or hedge around the release.`);
  const crit = analysis.insights.find((i) => i.severity === 'critical');
  if (crit) lines.push(`One focus: ${crit.action}`);
  if (!lines.length) lines.push('No flags from your history — trade the playbook, log everything, review at the close.');
  return lines;
}
function startOfWeek(d) {
  const x = new Date(d); const day = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - day); x.setUTCHours(0, 0, 0, 0); return x;
}
function greeting() {
  const h = new Date().getUTCHours();
  if (h < 5) return 'Quiet hours';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

module.exports = { analyse, briefing, disciplineScore };
