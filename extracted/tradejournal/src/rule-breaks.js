'use strict';
/**
 * rule-breaks.js — M12. The guardrail audit trail, aggregated into the review the
 * trader actually reads.
 *
 * WHAT WAS MISSING: `correction.dailyState()` produced named breaches and the M64-era
 * guardrail audit already WROTE every observation and every attempt into
 * `guardrail_events`, but nothing aggregated them: `performance.js` had zero references
 * to a rule break, so the weekly review could show P&L, session, grade and mistake
 * segments and still never answer "how many times did my own rules stop me this week,
 * and which rule was it?". Ep 26 lists rule breaks among the metrics a review tracks.
 *
 * WHAT THIS IS: a read-only tally of RECORDED audit events, split by what actually
 * happened, because collapsing them would overstate the number:
 *   - `prevented` — a `blocked_attempt`: the trader tried to enter while a personal
 *     stop was live and the guardrail refused it. A rule break that was stopped.
 *   - `accepted`  — an `override`: an overridable stop was crossed with a stated
 *     reason. A rule break that was allowed, with the reason kept.
 *   - `observations` — a `breach`/`state_observed` row: the daily state was observed
 *     with a live stop. That is a CONDITION, not an attempt, so it is reported
 *     separately and is never counted as a break.
 *   - `records` — `journal_record` rows (legal records and closes during a stop).
 *     Excluded from the break count on purpose: honest history is not misconduct.
 * Both `prevented` and `accepted` break down by the RULE the audit named (parsed from
 * the stored snapshot), so the review can say WHICH rule fired, not just how often.
 *
 * WHAT IT IS NOT: not broker verification, not a market edge, not psychology, and not
 * a score. It writes nothing, it changes no grade, no permission, no cap and no
 * guardrail decision (the guardrail reads the live state, never this tally), and it
 * deliberately does NOT join breaks to outcomes — "breaks cost you money" is a causal
 * claim the journal has not measured. `outcome_joined:false` says so in the payload.
 *
 * EVIDENCE RULES: an event whose stored snapshot cannot be decoded is counted as
 * `unreadable` and left explicitly named, never dropped and never assumed clean; a
 * read failure returns `unavailable` (not zero, not "no rule breaks"); the count is of
 * RECORDED events, so the payload says that an event the app never recorded is not
 * visible here; and a row with no rule named in its snapshot is reported as
 * `unnamed` rather than attributed to a rule it did not carry.
 */
const VERSION = 'rule-breaks-v1';
const KINDS = Object.freeze({ prevented: ['blocked_attempt'], accepted: ['override'], observation: ['breach'], record: ['journal_record'] });
const BASIS = 'RECORDED guardrail audit events for the trader\u2019s own accounts (attempted entries refused, overrides taken with a stated reason, live stop states observed, legal records excluded). Not broker verification, not a market result, not the trader\u2019s mental state, and not a cause of any P&L.';
const SCOPE = 'A tally of what the app recorded, per rule and per day: it writes nothing, changes no grade, cap, permission or guardrail decision, and does not join a break to an outcome. An event that was never recorded is invisible here, and a snapshot that cannot be decoded is reported unreadable rather than treated as clean.';
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const id = (n) => Number.isSafeInteger(n) && n > 0;
const utc = (ms) => new Date(ms).toISOString().slice(0, 10);

function invalid(message, status = 400) { return Object.assign(new Error(message), { code: 'rule_breaks_invalid', status }); }
function dateKey(v, field) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw invalid(`Choose a valid UTC ${field} date.`);
  const d = new Date(v + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime()) || utc(d.getTime()) !== v) throw invalid(`Choose a valid UTC ${field} date.`);
  return v;
}
/** The rule names the audit itself stored in the day snapshot, in order, deduplicated. */
function rulesOf(snapshot) {
  const named = [];
  const push = (v) => { const s = typeof v === 'string' ? v.trim() : ''; if (s && !named.includes(s)) named.push(s); };
  const list = Array.isArray(snapshot) ? snapshot : (snapshot && Array.isArray(snapshot.breaches) ? snapshot.breaches : null);
  if (!list) return { ok: false, rules: named };
  for (const b of list) {
    if (b && typeof b === 'object') push(b.rule);
    else push(b);
  }
  return { ok: true, rules: named };
}

function bucket(map, key, seed) { if (!map.has(key)) map.set(key, seed()); return map.get(key); }

/** Pure aggregation over already-read audit rows. No clock of its own beyond the window. */
function evaluate({ userId, events = [], from = null, to = null, nowMs = Date.now(), limit = null, scopeAccountIds = null } = {}) {
  if (!id(userId)) throw invalid('Owned review required.');
  if (from != null) dateKey(from, 'start');
  if (to != null) dateKey(to, 'end');
  if (from && to && from > to) throw invalid('UTC date range is reversed.');
  const kindOf = (k) => Object.entries(KINDS).find(([, list]) => list.includes(k))?.[0] || 'other';
  const rows = (events || []).filter((e) => e && e.user_id === userId && typeof e.rule_date === 'string' && (!from || e.rule_date >= from) && (!to || e.rule_date <= to));
  const days = new Map(), byKind = new Map(), byAction = new Map(), byRule = new Map();
  let prevented = 0, accepted = 0, observations = 0, records = 0, other = 0, unreadable = 0, unnamed = 0, accounts = new Set(), first = null, last = null;
  for (const e of rows) {
    const kind = kindOf(e.kind);
    if (kind === 'other') other++;
    if (kind === 'prevented') prevented++; else if (kind === 'accepted') accepted++;
    else if (kind === 'observation') observations++; else if (kind === 'record') records++;
    byKind.set(e.kind, (byKind.get(e.kind) || 0) + 1);
    byAction.set(e.action, (byAction.get(e.action) || 0) + 1);
    if (e.account_id != null) accounts.add(e.account_id);
    const day = bucket(days, e.rule_date, () => ({ date: e.rule_date, prevented: 0, accepted: 0, observations: 0, records: 0, other: 0, rules: [] }));
    day[kind] = (day[kind] || 0) + 1;
    if (first === null || e.rule_date < first) first = e.rule_date;
    if (last === null || e.rule_date > last) last = e.rule_date;
    if (kind !== 'prevented' && kind !== 'accepted') continue;
    let snapshot;
    try { snapshot = JSON.parse(e.snapshot); } catch { snapshot = null; }
    const parsed = snapshot === null ? { ok: false, rules: [] } : rulesOf(snapshot);
    if (!parsed.ok) { unreadable++; continue; }
    if (!parsed.rules.length) { unnamed++; continue; }
    for (const rule of parsed.rules) {
      const r = bucket(byRule, rule, () => ({ rule, prevented: 0, accepted: 0, last_at: null, days: [] }));
      r[kind]++;
      if (!r.days.includes(e.rule_date)) r.days.push(e.rule_date);
      if (r.last_at === null || e.observed_at > r.last_at) r.last_at = e.observed_at;
      if (!day.rules.includes(rule)) day.rules.push(rule);
    }
  }
  /* The scope is what was ASKED for, not only what happened to appear in a row: a zero-break account
   * must still say which account was covered, otherwise an empty audit reads as no scope at all. */
  for (const a of scopeAccountIds || []) if (Number.isSafeInteger(Number(a)) && Number(a) > 0) accounts.add(Number(a));
  const list = (map, key) => [...map.values()].sort((a, b) => (b[key] - a[key]) || String(a.rule || a.date).localeCompare(String(b.rule || b.date)));
  const dayList = [...days.values()].sort((a, b) => b.date.localeCompare(a.date)).map((d) => ({ ...d, breaks: d.prevented + d.accepted }));
  const ruleList = list(byRule, 'breaks').map((r) => ({ ...r, breaks: r.prevented + r.accepted }));
  const breaks = prevented + accepted;
  return {
    state: 'available', version: VERSION, user_id: userId, account_ids: [...accounts].sort((a, b) => a - b),
    from, to, windows: { first_date: first, last_date: last, days: dayList.length },
    breaks, prevented, accepted, observations, records_excluded: records, other_kinds: other,
    unreadable_snapshots: unreadable, unnamed_rule_events: unnamed,
    by_rule: ruleList, by_day: dayList, by_kind: [...byKind.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    by_action: [...byAction.entries()].map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count),
    outcome_joined: false, outcome_note: 'Rule breaks are NOT joined to results here: a counted break is a recorded observation, and saying what it cost would be a causal claim this journal has not measured.',
    limits: { read_only: true, writes: 0, grades_influence: false, permission_influence: false, caps_influence: false, guardrail_decisions_influence: false, predicts: false, causal: false, broker_verified: false, truncation_applied: limit != null },
    basis: BASIS, scope: SCOPE, events_considered: rows.length, events_total_for_user: (events || []).filter((e) => e && e.user_id === userId).length,
  };
}

function unavailable(reason = 'The guardrail audit trail could not be read, so no rule-break tally is reported. This is unknown, not zero and not a clean week.') {
  return {
    state: 'unavailable', version: VERSION, reason, breaks: null, prevented: null, accepted: null, observations: null, records_excluded: null,
    unreadable_snapshots: null, unnamed_rule_events: null, by_rule: [], by_day: [], by_kind: [], by_action: [],
    outcome_joined: false, limits: { read_only: true, writes: 0, grades_influence: false, permission_influence: false, causal: false, broker_verified: false },
    basis: BASIS, scope: SCOPE,
  };
}

/**
 * Read the audit trail for this trader's own accounts only. `limit` bounds the scan and
 * is reported as a truncation flag rather than silently hiding rows: the payload reads
 * the MOST RECENT events first so a bounded read is still a recent one.
 */
async function inspect(userId, { accountId = null, from = null, to = null, store = null, limit = 20000 } = {}) {
  if (!id(userId)) throw invalid('Owned review required.');
  if (from != null) dateKey(from, 'start');
  if (to != null) dateKey(to, 'end');
  if (from && to && from > to) throw invalid('UTC date range is reversed.');
  if (accountId != null && !id(Number(accountId))) throw invalid('Account not found.', 404);
  const { db } = require('./db');
  const read = async (s) => {
    const where = ['user_id=?'];
    const args = [userId];
    if (accountId != null) { where.push('account_id=?'); args.push(Number(accountId)); }
    if (from != null) { where.push('rule_date>=?'); args.push(from); }
    if (to != null) { where.push('rule_date<=?'); args.push(to); }
    const bound = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100000) : 20000;
    const rows = await s.prepare(`SELECT * FROM guardrail_events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args, bound + 1);
    const truncated = rows.length > bound;
    const kept = truncated ? rows.slice(0, bound) : rows;
    const accounts = await s.prepare('SELECT id FROM accounts WHERE user_id=?').all(userId);
    if (accountId != null && !accounts.some((a) => a.id === Number(accountId))) throw invalid('Account not found.', 404);
    const scopeAccountIds = accountId != null ? [Number(accountId)] : accounts.map((a) => a.id);
    const out = evaluate({ userId, events: kept.slice().reverse(), from, to, limit: truncated ? bound : null, scopeAccountIds });
    if (truncated) out.truncated = true;
    return out;
  };
  return store ? read(store) : db.tx(async (tx) => read(db.transactionStore(tx)));
}

async function optional(userId, options) { try { return await inspect(userId, options); } catch { return unavailable(); } }

module.exports = { VERSION, KINDS, BASIS, SCOPE, invalid, dateKey, rulesOf, evaluate, inspect, optional, unavailable };
