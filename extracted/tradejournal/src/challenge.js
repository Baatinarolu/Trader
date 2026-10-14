'use strict';
/**
 * challenge.js — M115. The clean-rep count.
 *
 * WHAT WAS MISSING: Ep 32 defines the exercise by a COUNT — *"you're going to be taking 21 trades
 * that are fully in accordance with the trade plan"* — and each of those trades has to meet three
 * criteria: *"it must be aligned with your trade plan. It must be executed cleanly, which means you
 * have to follow your risk management rules. And then you have to journal immediately after you
 * close the position."* The app held the data for all three (`strategy_id` on the trade, the
 * `rule_checks` checklist rows and `stop_honoured`, and M85's explicit hash-verified journal
 * acknowledgement) and counted none of it as a rep. The only goal concept in the app was
 * `profit_target_pct` — a MONEY target, i.e. the opposite of what the exercise measures: *"money is
 * not the goal here… It's to build a habit of confident execution."*
 *
 * WHAT THIS IS: a read-only counter of RECORDED reps over closed trades. A rep requires all three,
 * each of them an explicit recorded fact:
 *   - `plan_linked` — the trade carries a reference to one of the trader's OWN saved written plans.
 *     An unlinked trade is not counted, and this criterion is deliberately the weakest of the three:
 *     a linked plan is not proof the plan was followed. That is what the next one is for.
 *   - `no_recorded_breach` — the trade's own recorded checklist is complete (at least one
 *     `rule_checks` row) and every recorded check PASSED, and the trade does not record a decision
 *     not to honour its stop (`stop_honoured === 0`). A trade with no checklist at all FAILS this
 *     criterion, because no record is not a clean record — it is reported as `unrecorded_checks`
 *     rather than silently counted.
 *   - `journalled_same_close_day` — M85's own `journaling.info().complete` (explicit review
 *     acknowledgement whose stored hash matches the current record, plus the core fields, plus a
 *     known realised result and an observed close) AND the acknowledgement's UTC day equals the
 *     trade's UTC close day. The app cannot observe human immediacy, so the operationalisation is
 *     stated in the payload and the observed gap is reported: a review written after midnight of
 *     the close day does not count, and the payload says so.
 *
 * COUNT TRADES, NEVER DAYS. The episode explicitly permits skipping days — *"you're allowed to skip
 * those days"*, because forcing it *"you're going to end up forcing trades"* — so an empty day adds
 * nothing and breaks nothing, and the counter never counts calendar days. `days_with_a_rep` is
 * reported for information only and is labelled as not the measure.
 *
 * WHAT IT IS NOT: not a score, not a grade, not money. Progress is never joined to P&L (the payload
 * and the card carry no amounts and no goal figure), the counter changes no grade, cap, permission,
 * guardrail decision or plan-change permission, and a failing rep is not a punishment: the count is
 * cumulative, a bad trade does not erase it, and only the reported `run` (consecutive reps, newest
 * first) restarts. Unknown is not zero: a count that has not been started reports `counted:null`,
 * never `0`, and an unreadable read reports `unavailable` rather than an empty challenge.
 *
 * The START and the TARGET are the trader's own declarations, stored like every other preference in
 * `users.settings` (M115 adds NO schema object of any kind). The start is explicit — the count is
 * never backfilled onto history — and it can be corrected only while no closed trade exists at or
 * after it, because once the window has trades in it the count is a record and not a dial.
 */
const VERSION = 'clean-reps-v1';
const DEFAULT_TARGET = 21;
const TARGET_MIN = 1;
const TARGET_MAX = 999;
const CRITERIA = Object.freeze(['plan_linked', 'no_recorded_breach', 'journalled_same_close_day']);
const BASIS = 'A rep is a CLOSED trade that (1) is linked to one of your own saved written plans, (2) carries no recorded rule breach \u2014 its checklist is recorded, every recorded check passed, and its stop was not recorded as deliberately not honoured \u2014 and (3) was journalled with the explicit acknowledgement on its own UTC close day. Counts TRADES, never calendar days: an empty day neither adds a rep nor breaks a run.';
const SCOPE = 'Only what the app recorded: a trade the guardrail refused leaves no trade row, so it is neither a rep nor a failure; a trade with no recorded checklist fails the clean criterion because no record is not a clean record; and "journalled immediately" is operationalised as the same UTC close day, with the observed gap reported beside it. Nothing here is a score, a grade or money.';
const NOTES = Object.freeze({
  setting: 'The start and the target are the trader\u2019s own saved settings, written through the existing settings route like every other preference. This module writes nothing and cannot change them.',
  money: 'Progress is never joined to P&L: the exercise measures a habit, not a result, and no amount is reported beside the count.',
  days: 'Skipping days is permitted by the exercise, so days are never counted. A day with no closed trade adds no rep and breaks no run.',
  unknown: 'A count that has not been started is NOT zero reps, and an unreadable read is NOT an empty challenge.',
});
const STATUS_OPEN = 'open';

const id = (n) => Number.isSafeInteger(n) && n > 0;
const pad = (n) => String(n).padStart(2, '0');

function invalid(message, status = 400) { return Object.assign(new Error(message), { code: 'challenge_invalid', status }); }

/** A UTC calendar day, `YYYY-MM-DD`, as a real day rather than a plausible-looking one. */
function dayKey(value, field = 'start') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid(`Choose a valid UTC ${field} date.`);
  const d = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime()) || `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` !== value) throw invalid(`Choose a valid UTC ${field} date.`);
  return value;
}
/** The UTC day an instant falls on, or null when the clock is unusable. */
function dayOf(ms) { return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null; }
const msOf = (v) => { const ms = Date.parse(v); return Number.isFinite(ms) ? ms : null; };

/** The stored start: `null` when never set, a validated day when set, `unusable` when it is corrupt. */
function startOf(settings) {
  const raw = settings && typeof settings === 'object' ? settings.challenge_start : undefined;
  if (raw === null || raw === undefined || raw === '') return { state: 'not_set', value: null };
  try { return { state: 'set', value: dayKey(raw) }; } catch { return { state: 'unusable', value: null }; }
}
/** The stored target: the default when unset, a validated integer when set, `unusable` when corrupt. */
function targetOf(settings) {
  const raw = settings && typeof settings === 'object' ? settings.challenge_target : undefined;
  if (raw === null || raw === undefined || raw === '') return { state: 'default', value: DEFAULT_TARGET };
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isSafeInteger(n) || n < TARGET_MIN || n > TARGET_MAX) return { state: 'unusable', value: null };
  return { state: 'set', value: n };
}
/** Validate a target a caller wants to store. Throws the module's own error; never coerces. */
function targetKey(value) {
  const n = typeof value === 'number' ? value : Number(String(value == null ? '' : value).trim());
  if (!Number.isSafeInteger(n) || n < TARGET_MIN || n > TARGET_MAX) throw invalid(`Choose a whole-number rep target between ${TARGET_MIN} and ${TARGET_MAX}.`);
  return n;
}
/** Validate a start a caller wants to store. `null` clears it (only while nothing is in its window). */
function startKey(value) { return value === null || value === undefined || value === '' ? null : dayKey(value); }

/** One trade's verdict, from its OWN recorded facts. Pure: the checks, the plans and the day are given. */
function repOf(row, { nowMs = Date.now(), ownedPlans = null, checks = null } = {}) {
  /* A row that is not closed is never a rep, whatever else it carries: the exercise counts closed
   * trades. `evaluate`'s window excludes these rows anyway, so this is the second lock on the same
   * door — the verdict says `open:true` rather than pretending a criterion failed. */
  const isOpen = !!(row && row.status === STATUS_OPEN);
  const status = isOpen ? STATUS_OPEN : 'closed';
  const closedMs = row ? msOf(row.closed_at) : null;
  const closeDay = dayOf(closedMs);

  const strategyId = row && row.strategy_id !== null && row.strategy_id !== undefined ? Number(row.strategy_id) : null;
  const planLinked = id(strategyId) && (ownedPlans === null ? true : ownedPlans.has(strategyId));
  const plan = { strategy_id: id(strategyId) ? strategyId : null, owned: !!(id(strategyId) && (ownedPlans === null || ownedPlans.has(strategyId))) };

  const entry = checks === null ? null : checks.get(row && row.id);
  const failedChecks = entry && Number.isFinite(entry.failed) ? entry.failed : 0;
  const checksRecorded = entry && Number.isFinite(entry.total) ? entry.total : 0;
  const stopDishonoured = !!(row && row.stop_honoured === 0);
  const breaches = { checks_recorded: checksRecorded, failed_checks: failedChecks, stop_not_honoured: stopDishonoured };
  const clean = checksRecorded > 0 && failedChecks === 0 && !stopDishonoured;

  let journal = { available: false, complete: false, missing: [], reviewed_at: null, review_day: null, same_close_day: false };
  try {
    /* M85's own definition of "journalled", reused rather than re-derived: the explicit
     * acknowledgement AND a stored hash that still matches the current record. */
    const J = require('./journaling');
    const info = J.info(row, nowMs);
    const reviewedMs = msOf(row && row.journal_reviewed_at);
    const reviewDay = dayOf(reviewedMs);
    journal = { available: true, complete: !!info.complete, missing: Array.isArray(info.missing) ? info.missing.slice() : [], reviewed_at: info.reviewed_at || null, review_day: reviewDay, same_close_day: !!(closeDay && reviewDay && closeDay === reviewDay) };
  } catch { journal = { available: false, complete: false, missing: ['journal_state_unreadable'], reviewed_at: null, review_day: null, same_close_day: false }; }

  const criteria = { plan_linked: !!planLinked, no_recorded_breach: !!clean, journalled_same_close_day: !!(journal.complete && journal.same_close_day) };
  const failed = CRITERIA.filter((k) => !criteria[k]);
  return { counted: !isOpen && failed.length === 0, open: isOpen, criteria, failed, plan, breaches, journal, closed_ms: closedMs, close_day: closeDay };
}

/**
 * The count over the trader's own closed trades. Pure — the caller hands the rows, the plans, the
 * recorded checks and the day — so every arithmetic fact below is testable without a database.
 */
function evaluate(rows = [], { start = null, target = DEFAULT_TARGET, targetState = 'set', today = null, nowMs = Date.now(), ownedPlans = null, checks = null, limit = null } = {}) {
  const day = today || dayOf(Number.isFinite(nowMs) ? nowMs : Date.now());
  const before = [], window = [], undated = [];
  for (const row of rows) {
    if (!row || row.status === STATUS_OPEN) continue;
    const ms = msOf(row.closed_at);
    if (ms === null) { undated.push(row); continue; }
    const close = dayOf(ms);
    if (start !== null && close < start) { before.push(row); continue; }
    window.push(row);
  }
  window.sort((a, b) => (msOf(a.closed_at) - msOf(b.closed_at)) || (Number(a.id) - Number(b.id)));

  const verdicts = new Map();
  const counted = [];
  const notCounted = [];
  const unrecorded = [];
  const byCriterion = { plan_linked: 0, no_recorded_breach: 0, journalled_same_close_day: 0 };
  const journaling = { reviewed: 0, same_close_day: 0, later_than_close_day: 0, gaps_minutes: [], waiting_on_acknowledgement: 0 };
  for (const row of window) {
    const v = repOf(row, { nowMs, ownedPlans, checks });
    verdicts.set(row, v);
    if (v.counted) counted.push({ row, v }); else {
      notCounted.push({ row, v });
      for (const k of v.failed) byCriterion[k] += 1;
      if (!v.criteria.no_recorded_breach && v.breaches.checks_recorded === 0 && !v.breaches.stop_not_honoured) unrecorded.push(row);
    }
    if (v.journal.available && v.journal.reviewed_at) {
      journaling.reviewed += 1;
      if (v.journal.same_close_day) journaling.same_close_day += 1; else journaling.later_than_close_day += 1;
      const gap = msOf(v.journal.reviewed_at) - v.closed_ms;
      if (Number.isFinite(gap) && gap >= 0) journaling.gaps_minutes.push(Math.round(gap / 60000));
    } else if (v.journal.available && v.journal.missing.includes('explicit_review_acknowledgement')) journaling.waiting_on_acknowledgement += 1;
  }
  /* The run: consecutive reps scanning NEWEST first, stopping at the first trade that is not a rep.
   * A day with no closed trade simply is not in this list, so it can neither add nor break a run. */
  let run = 0;
  for (let i = window.length - 1; i >= 0; i--) { if (!verdicts.get(window[i]).counted) break; run += 1; }
  const gaps = journaling.gaps_minutes.slice().sort((a, b) => a - b);
  const median = gaps.length ? (gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : Math.round((gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2)) : null;
  const days = new Set(counted.map(({ row }) => dayOf(msOf(row.closed_at))));
  const usableTarget = Number.isSafeInteger(target) && target >= TARGET_MIN && target <= TARGET_MAX ? target : null;
  /* The newest trades in the window, counted or not, each with ITS OWN reasons: a trader reading the
   * list sees why the last trade did not count, not a verdict about them. */
  const recent = window.slice(-20).reverse().map((row) => {
    const v = verdicts.get(row);
    return {
      trade_id: Number(row.id), symbol: String(row.symbol || ''), closed_at: row.closed_at, close_day: v.close_day,
      counted: v.counted, failed: v.failed, plan: v.plan, breaches: v.breaches,
      journal: { complete: v.journal.complete, reviewed_at: v.journal.reviewed_at, same_close_day: v.journal.same_close_day, missing: v.journal.missing },
    };
  });

  return {
    state: 'available', version: VERSION, account_id: null, today: day,
    criteria: CRITERIA.slice(), basis: BASIS, scope: SCOPE, notes: { ...NOTES },
    start: { state: start === null ? 'not_set' : 'set', value: start },
    target: { state: targetState, value: usableTarget, default: DEFAULT_TARGET, min: TARGET_MIN, max: TARGET_MAX },
    progress: {
      counted: counted.length, target: usableTarget,
      remaining: usableTarget === null ? null : Math.max(0, usableTarget - counted.length),
      beyond_target: usableTarget === null ? null : Math.max(0, counted.length - usableTarget),
      run,
      days_with_a_rep: days.size, days_note: NOTES.days,
      first_counted_at: counted.length ? counted[0].row.closed_at : null,
      last_counted_at: counted.length ? counted[counted.length - 1].row.closed_at : null,
    },
    window: {
      trades_closed: window.length, before_start: before.length, undated_closes: undated.length,
      open_excluded: rows.filter((r) => r && r.status === STATUS_OPEN).length,
      truncated: limit !== null && Number.isSafeInteger(limit) ? rows.length > limit : false,
    },
    not_counted: {
      total: notCounted.length, by_criterion: byCriterion, unrecorded_checks: unrecorded.length,
      missing_journal_fields: notCounted.filter(({ v }) => v.failed.includes('journalled_same_close_day')).map(({ v }) => v.journal.missing).flat().filter((x, i, a) => a.indexOf(x) === i).sort(),
    },
    journaling: { reviewed_in_window: journaling.reviewed, same_close_day: journaling.same_close_day, later_than_close_day: journaling.later_than_close_day, median_gap_minutes: median, max_gap_minutes: gaps.length ? gaps[gaps.length - 1] : null, waiting_on_acknowledgement: journaling.waiting_on_acknowledgement, basis: 'The acknowledgement\u2019s UTC day against the trade\u2019s UTC close day; the gap is the observed time between the recorded close and the recorded acknowledgement, so the calendar rule can be read for what it is.' },
    recent,
    outcome_joined: false,
    outcome_note: 'Reps are NOT joined to results: this exercise counts a habit, and saying a rep made or saved money would be a causal claim this journal has not measured.',
    limits: { read_only: true, writes: 0, grades_influence: false, permission_influence: false, caps_influence: false, guardrail_decisions_influence: false, plan_change_permission: false, causal: false, broker_verified: false },
  };
}

/** The not-yet-started shape. `counted:null` on purpose: an unstarted count is not zero reps. */
function notStarted(settings, { accountId = null, today = null, windowRows = null } = {}) {
  const s = startOf(settings), t = targetOf(settings);
  return {
    state: 'not_started', version: VERSION, account_id: accountId, today,
    criteria: CRITERIA.slice(), basis: BASIS, scope: SCOPE, notes: { ...NOTES },
    start: { state: s.state, value: s.value }, target: { state: t.state, value: t.value, default: DEFAULT_TARGET, min: TARGET_MIN, max: TARGET_MAX },
    progress: { counted: null, target: t.value, remaining: null, beyond_target: null, run: null, days_with_a_rep: null, days_note: NOTES.days, first_counted_at: null, last_counted_at: null },
    window: windowRows || { trades_closed: null, before_start: null, undated_closes: null, open_excluded: null, truncated: false },
    not_counted: { total: null, by_criterion: { plan_linked: null, no_recorded_breach: null, journalled_same_close_day: null }, unrecorded_checks: null, missing_journal_fields: [] },
    journaling: { reviewed_in_window: null, same_close_day: null, later_than_close_day: null, median_gap_minutes: null, max_gap_minutes: null, waiting_on_acknowledgement: null, basis: '' },
    recent: [], started_note: 'The rep count has not been started, so there is nothing counted yet \u2014 this is NOT zero reps. Starting it is your own act and the count is never backfilled onto trades taken before the start day.',
    outcome_joined: false, outcome_note: 'Reps are NOT joined to results.', limits: { read_only: true, writes: 0, grades_influence: false, permission_influence: false, caps_influence: false, guardrail_decisions_influence: false, plan_change_permission: false, causal: false, broker_verified: false },
  };
}

/** The unreadable shape: unknown, never an empty challenge. */
function unavailable(reason = 'The trade and journal records could not be read, so the rep count is unknown here. This is not zero reps and not a clean count.') {
  const out = notStarted({}, {});
  return {
    state: 'unavailable', version: VERSION, account_id: null, today: null, reason,
    criteria: CRITERIA.slice(), basis: BASIS, scope: SCOPE, notes: { ...NOTES },
    start: { state: 'unknown', value: null }, target: { state: 'unknown', value: null, default: DEFAULT_TARGET, min: TARGET_MIN, max: TARGET_MAX },
    progress: { counted: null, target: null, remaining: null, beyond_target: null, run: null, days_with_a_rep: null, days_note: NOTES.days, first_counted_at: null, last_counted_at: null },
    window: { trades_closed: null, before_start: null, undated_closes: null, open_excluded: null, truncated: false },
    not_counted: { total: null, by_criterion: { plan_linked: null, no_recorded_breach: null, journalled_same_close_day: null }, unrecorded_checks: null, missing_journal_fields: [] },
    journaling: { reviewed_in_window: null, same_close_day: null, later_than_close_day: null, median_gap_minutes: null, max_gap_minutes: null, waiting_on_acknowledgement: null, basis: '' },
    recent: [], outcome_joined: false, outcome_note: 'Reps are NOT joined to results.', limits: { ...out.limits },
  };
}

/**
 * Read the trader's own closed trades and count the reps. `settings` is the trader's own settings
 * object (the route already reads it): the start and the target live there, so this module adds no
 * schema object and no second source of truth for either.
 */
async function inspect(userId, { accountId = null, settings = null, store = null, limit = 5000, nowMs = Date.now() } = {}) {
  if (!id(userId)) throw invalid('Owned review required.');
  if (accountId != null && !id(Number(accountId))) throw invalid('Account not found.', 404);
  const s = startOf(settings), t = targetOf(settings);
  const day = dayOf(Number.isFinite(nowMs) ? nowMs : Date.now());
  const { db } = require('./db');
  const read = async (session) => {
    const where = ['user_id=?'];
    const args = [userId];
    if (accountId != null) { where.push('account_id=?'); args.push(Number(accountId)); }
    if (accountId != null) {
      const owned = await session.prepare('SELECT id FROM accounts WHERE id=? AND user_id=?').get(Number(accountId), userId);
      if (!owned) throw invalid('Account not found.', 404);
    }
    const bound = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 20000) : 5000;
    const rows = await session.prepare(`SELECT * FROM trades WHERE ${where.join(' AND ')} ORDER BY COALESCE(closed_at, opened_at) DESC, id DESC LIMIT ?`).all(...args, bound + 1);
    const truncated = rows.length > bound;
    const kept = (truncated ? rows.slice(0, bound) : rows).slice().reverse();
    const plans = await session.prepare('SELECT id FROM strategies WHERE user_id=?').all(userId);
    const ownedPlans = new Set(plans.map((p) => Number(p.id)));
    const checkRows = await session.prepare('SELECT trade_id, passed FROM rule_checks WHERE trade_id IN (SELECT id FROM trades WHERE user_id=?)').all(userId);
    const checks = new Map();
    for (const r of checkRows) {
      const e = checks.get(r.trade_id) || { total: 0, passed: 0, failed: 0 };
      e.total += 1; if (r.passed) e.passed += 1; else e.failed += 1;
      checks.set(r.trade_id, e);
    }
    if (s.state === 'unusable') throw invalid('The stored rep-count start is not a valid UTC date, so the window it covers is unknown.');
    if (s.state === 'not_set') return { ...notStarted(settings, { accountId, today: day }), window: { trades_closed: kept.filter((r) => r.status !== STATUS_OPEN).length, before_start: null, undated_closes: kept.filter((r) => r.status !== STATUS_OPEN && msOf(r.closed_at) === null).length, open_excluded: kept.filter((r) => r.status === STATUS_OPEN).length, truncated } };
    const out = evaluate(kept, { start: s.value, target: t.value, targetState: t.state, today: day, nowMs, ownedPlans, checks, limit: truncated ? bound : null });
    out.account_id = accountId;
    return out;
  };
  return store ? read(store) : db.tx(async (tx) => read(db.transactionStore(tx)));
}

async function inspectOptional(userId, options) { try { return await inspect(userId, options); } catch { return unavailable(); } }

/**
 * May the stored start be changed to `proposed`? Only while NO closed trade exists at or after the
 * stored one: once the window holds trades, the count is a record and not a dial. Returns a verdict
 * rather than throwing so the settings route can answer with a code and the number of trades.
 */
async function startGuard(userId, { accountId = null, current = null, proposed, store = null, nowMs = Date.now() } = {}) {
  if (!id(userId)) throw invalid('Owned review required.');
  const to = startKey(proposed);
  if (to !== null) dayKey(to);
  if (current !== null && to === current) return { ok: true, changed: false, closed_in_window: 0 };
  const { db } = require('./db');
  const read = async (session) => {
    if (current === null) return { ok: true, changed: to !== null, closed_in_window: 0 };
    const where = ['user_id=?', "status<>'open'", 'date(closed_at)>=?'];
    const args = [userId, current];
    if (accountId != null) { where.push('account_id=?'); args.push(Number(accountId)); }
    const row = await session.prepare(`SELECT COUNT(*) AS n FROM trades WHERE ${where.join(' AND ')}`).get(...args);
    const n = Number(row && row.n) || 0;
    if (n === 0) return { ok: true, changed: to !== current, closed_in_window: 0 };
    return {
      ok: false, changed: false, closed_in_window: n,
      reason: `The rep count has already begun: ${n} closed trade${n === 1 ? ' is' : 's are'} inside the window of ${current}. Progress is a record, not a dial \u2014 the start cannot be moved.`,
    };
  };
  return store ? read(store) : db.tx(async (tx) => read(db.transactionStore(tx)));
}

module.exports = {
  VERSION, DEFAULT_TARGET, TARGET_MIN, TARGET_MAX, CRITERIA, BASIS, SCOPE, NOTES,
  invalid, dayKey, dayOf, startOf, targetOf, targetKey, startKey, repOf, evaluate, notStarted, unavailable, inspect, inspectOptional, startGuard,
};
