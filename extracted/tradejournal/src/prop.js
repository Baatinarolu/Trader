'use strict';
/**
 * Prop-firm challenges — the rule pack, the arithmetic, and the policing.
 *
 * The presets below are *shapes* of challenge (daily loss / max drawdown /
 * profit target / minimum days), not endorsements, and the numbers are typical
 * values published by the industry, not any one firm's current contract. Pick
 * one and edit it — the app stores your numbers and polices those.
 */

const PRESETS = [
  { key: 'custom', name: 'Custom / broker account', daily_loss_pct: 3, max_dd_pct: 6, dd_type: 'static', target_pct: 8, min_days: 0, notes: 'The defaults the app ships with.' },
  { key: 'eval_5_10', name: 'Evaluation: 5 % daily / 10 % total, 8 % target', daily_loss_pct: 5, max_dd_pct: 10, dd_type: 'static', target_pct: 8, min_days: 0, notes: 'The most common funded-account shape.' },
  { key: 'eval_trailing_6', name: 'Evaluation: 5 % daily / 6 % trailing drawdown', daily_loss_pct: 5, max_dd_pct: 6, dd_type: 'trailing', target_pct: 6, min_days: 0, notes: 'Trailing DD follows the equity high — the pack that ends accounts.' },
  { key: 'instant_3_6', name: 'Instant funding: 3 % daily / 6 % total', daily_loss_pct: 3, max_dd_pct: 6, dd_type: 'static', target_pct: 0, min_days: 0, notes: 'No target, just survival rules.' },
  { key: 'swing_4_8', name: 'Swing: 4 % daily / 8 % total, 10 % target, 5 days', daily_loss_pct: 4, max_dd_pct: 8, dd_type: 'static', target_pct: 10, min_days: 5, notes: 'For multi-day holds.' },
];

const byKey = (k) => PRESETS.find((p) => p.key === k) || PRESETS[0];

/**
 * @param {object} o
 *  { rules, starting_balance, balance, peak_balance, day_pnl, days_traded, trades_today }
 *  day_pnl = realised P&L for the current trading day (currency), peak_balance = highest equity seen
 */
function status(o = {}) {
  const rules = (o.rules && typeof o.rules === 'object') ? o.rules : byKey(o.preset);
  const start = Number(o.starting_balance) || 0;
  const balance = Number(o.balance) || 0;
  const peak = Number(o.peak_balance) || Math.max(start, balance);
  if (!start) return { ok: false, error: 'the account needs a starting balance for challenge maths' };
  const dailyLimit = start * (Number(rules.daily_loss_pct) || 0) / 100;
  const ddFloor = rules.dd_type === 'trailing' ? peak - start * (Number(rules.max_dd_pct) || 0) / 100
    : start - start * (Number(rules.max_dd_pct) || 0) / 100;
  const target = start + start * (Number(rules.target_pct) || 0) / 100;
  const dayPnl = Number(o.day_pnl) || 0;
  const ddUsed = rules.dd_type === 'trailing' ? Math.max(0, peak - balance) : Math.max(0, start - balance);
  const ddBudget = start * (Number(rules.max_dd_pct) || 0) / 100;
  const checks = [
    { key: 'daily_loss', label: 'Daily loss', used: Math.max(0, -dayPnl), limit: dailyLimit, breached: dayPnl < 0 && -dayPnl >= dailyLimit, unit: 'currency' },
    { key: 'max_drawdown', label: `Max drawdown (${rules.dd_type})`, used: ddUsed, limit: ddBudget, breached: balance <= ddFloor, unit: 'currency' },
    { key: 'min_days', label: 'Minimum trading days', used: Number(o.days_traded) || 0, limit: Number(rules.min_days) || 0, breached: false, unit: 'days' },
    { key: 'target', label: 'Profit target', used: Math.max(0, balance - start), limit: Math.max(0, target - start), breached: false, unit: 'currency', done: (Number(rules.target_pct) || 0) > 0 && balance >= target },
  ].map((c) => ({
    ...c,
    pct_of_limit: c.limit > 0 ? Math.round((c.used / c.limit) * 1000) / 10 : null,
    remaining: Math.round((c.limit - c.used) * 100) / 100,
  }));
  const breached = checks.filter((c) => c.breached).map((c) => c.label);
  return {
    ok: true, rules, starting_balance: start, balance, peak_balance: peak,
    dd_floor: Math.round(ddFloor * 100) / 100, target_balance: Math.round(target * 100) / 100,
    target_progress_pct: (Number(rules.target_pct) || 0) > 0 ? Math.max(0, Math.round(((balance - start) / (target - start)) * 1000) / 10) : null,
    checks, breached, passed: checks.every((c) => !c.breached) && (!rules.min_days || (Number(o.days_traded) || 0) >= rules.min_days) && (!rules.target_pct || balance >= target),
    risk_per_trade_cap_pct: Number(rules.daily_loss_pct) ? Math.min(1, Number(rules.daily_loss_pct) / 5) : 1,
    note: 'Presets are common challenge shapes, not any firm\u2019s current contract — edit the numbers and the app polices yours.',
  };
}

module.exports = { PRESETS, byKey, status };
