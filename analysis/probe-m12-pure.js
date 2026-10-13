'use strict';
/** M12 pure probe: the aggregation RULE itself, on audit rows shaped the way the app writes them.
 * The claims under test are the ones a review can be misled by — a condition counted as an attempt,
 * a prevented attempt counted as a break the trader took, a legal record counted as misconduct, an
 * undecodable snapshot silently dropped or attributed to a rule, a static tally that drifts with the
 * clock, and any influence on a grade, a cap or a guardrail decision. */
const H = require('./m12-test-support'), { ok } = H;
const N = H.mod('src/rule-breaks');
const fs = require('fs'), path = require('path');
const UID = 7;
const snap = (rules) => H.snapshotOf(rules.map((r) => ({ rule: r, detail: `Recorded ${r} breach` })));
const ev = (kind, rule, date, extra = {}) => ({ user_id: UID, account_id: 1, rule_date: date, observed_at: `${date}T09:30:00.000Z`, kind, action: extra.action || 'entry', reason: extra.reason || null, snapshot: extra.snapshot === undefined ? snap([rule]) : extra.snapshot, ...extra.row });
H.finish('M12 pure: the guardrail audit, aggregated without inflating it', async () => {
  if (!H.shipped(N, 'the M12 rule-break tally')) return;
  const rows = [
    ev('blocked_attempt', 'pre_market_routine', '2026-10-06'),
    ev('blocked_attempt', 'pre_market_routine', '2026-10-06', { action: 'reopen' }),
    ev('override', 'trade_cap', '2026-10-07', { reason: 'One more setup after the cap' }),
    ev('breach', 'pre_market_routine', '2026-10-07'),
    ev('journal_record', 'pre_market_routine', '2026-10-07', { action: 'record_only' }),
    ev('blocked_attempt', 'news_blackout', '2026-10-08', { snapshot: '{not json' }),
    ev('blocked_attempt', null, '2026-10-08', { snapshot: JSON.stringify({ date: '2026-10-08', status: 'stop', breaches: [], message: 'Stand down.' }) }),
    { user_id: 99, account_id: 1, rule_date: '2026-10-06', observed_at: '2026-10-06T09:30:00.000Z', kind: 'blocked_attempt', action: 'entry', reason: null, snapshot: snap(['someone_elses_rule']) },
    ev('blocked_attempt', 'trading_window_outside', '2026-09-30'),
  ];
  const out = N.evaluate({ userId: UID, events: rows });
  ok('the vocabulary is the audit\u2019s own kinds: a prevented attempt, an accepted override, an observed condition, a legal record', N.KINDS.prevented[0] === 'blocked_attempt' && N.KINDS.accepted[0] === 'override' && N.KINDS.observation[0] === 'breach' && N.KINDS.record[0] === 'journal_record', N.KINDS);
  ok('breaks are the ATTEMPTS: five prevented entries and one accepted override, not the conditions', out.prevented === 5 && out.accepted === 1 && out.breaks === 6, { prevented: out.prevented, accepted: out.accepted, breaks: out.breaks });
  ok('a live stop state is reported SEPARATELY as an observation and is never counted as a break', out.observations === 1 && out.by_kind.some((k) => k.kind === 'breach' && k.count === 1), out.by_kind);
  ok('a legal record during a stop is excluded from the break count on purpose — honest history is not misconduct', out.records_excluded === 1 && out.breaks === out.prevented + out.accepted && out.by_kind.some((k) => k.kind === 'journal_record' && k.count === 1), { records: out.records_excluded, breaks: out.breaks });
  ok('rules are named from the stored snapshot, so the review says WHICH rule fired', JSON.stringify(out.by_rule.map((r) => r.rule).sort()) === JSON.stringify(['pre_market_routine', 'trade_cap', 'trading_window_outside']), out.by_rule.map((r) => r.rule));
  ok('prevented and accepted are kept apart PER RULE, so an unwaivable block is not blurred with an override', out.by_rule.find((r) => r.rule === 'pre_market_routine').prevented === 2 && out.by_rule.find((r) => r.rule === 'pre_market_routine').accepted === 0 && out.by_rule.find((r) => r.rule === 'trade_cap').accepted === 1 && out.by_rule.find((r) => r.rule === 'trade_cap').prevented === 0, out.by_rule);
  ok('a snapshot this app cannot decode is COUNTED as a break and REPORTED unreadable — never dropped, never attributed', out.unreadable_snapshots === 1 && out.by_rule.every((r) => r.rule !== 'unreadable') && out.by_rule.every((r) => r.rule !== 'news_blackout') && out.prevented === 5, { unreadable: out.unreadable_snapshots, prevented: out.prevented });
  ok('a decodable snapshot that names no rule is counted but left UNNAMED rather than attributed to a rule it never carried', out.unnamed_rule_events === 1 && out.by_rule.every((r) => r.rule !== 'unnamed'), out.unnamed_rule_events);
  ok('another trader\u2019s audit rows are excluded from every number in the payload', out.by_rule.every((r) => r.rule !== 'someone_elses_rule') && out.events_considered === 8 && out.events_total_for_user === 8, { considered: out.events_considered, total: out.events_total_for_user });
  ok('an unreadable snapshot is still a break event: the total counts what happened, the rule list counts what could be named', out.breaks === 6 && out.by_rule.reduce((n, r) => n + r.breaks, 0) === 4, { breaks: out.breaks, named: out.by_rule.reduce((n, r) => n + r.breaks, 0) });
  const win = N.evaluate({ userId: UID, events: rows, from: '2026-10-07', to: '2026-10-07' });
  ok('the window filters on the audit\u2019s own day, not on the clock of the read', win.breaks === 1 && win.prevented === 0 && win.accepted === 1 && win.by_day.length === 1 && win.by_day[0].date === '2026-10-07', { breaks: win.breaks, days: win.by_day.map((d) => d.date) });
  ok('each day carries its own split and the rules that fired on it, and days are newest-first', JSON.stringify(out.by_day.map((d) => d.date)) === JSON.stringify(['2026-10-08', '2026-10-07', '2026-10-06', '2026-09-30']) && out.by_day.find((d) => d.date === '2026-10-06').prevented === 2 && out.by_day.find((d) => d.date === '2026-10-07').rules.includes('trade_cap'), out.by_day);
  ok('the window it actually used is reported, so a review can state the period it covers', out.windows.first_date === '2026-09-30' && out.windows.last_date === '2026-10-08' && out.windows.days === 4, out.windows);
  ok('reading the tally twice is identical: it is a function of the recorded rows, not of when it was read', JSON.stringify(N.evaluate({ userId: UID, events: rows, nowMs: 1 })) === JSON.stringify(N.evaluate({ userId: UID, events: rows, nowMs: Date.UTC(2030, 0, 1) })), null);
  ok('a range that is reversed is refused with the module\u2019s own code rather than answered backwards', (() => { try { N.evaluate({ userId: UID, events: rows, from: '2026-10-08', to: '2026-10-06' }); return false; } catch (e) { return e.code === 'rule_breaks_invalid' && e.status === 400; } })(), null);
  ok('a date that is not a real UTC day is refused, so a window cannot silently become a different one', ['2026-2-3', '20261013', '2026-13-01', ''].every((bad) => { try { N.evaluate({ userId: UID, events: rows, from: bad }); return false; } catch (e) { return e.code === 'rule_breaks_invalid'; } }) && N.dateKey('2026-10-13', 'start') === '2026-10-13', null);
  ok('an owned user is required: an unowned or absent id is refused rather than answered', [0, -1, null, 1.5].every((bad) => { try { N.evaluate({ userId: bad, events: rows }); return false; } catch (e) { return e.code === 'rule_breaks_invalid'; } }), null);
  ok('the payload refuses to join a break to an outcome, and says why in its own words', out.outcome_joined === false && /not joined to results/i.test(out.outcome_note) && /causal claim/i.test(out.outcome_note), out.outcome_note);
  ok('the tally cannot influence a grade, a cap, a permission or a guardrail decision, and writes nothing', out.limits.read_only === true && out.limits.writes === 0 && out.limits.grades_influence === false && out.limits.permission_influence === false && out.limits.caps_influence === false && out.limits.guardrail_decisions_influence === false && out.limits.causal === false && out.limits.broker_verified === false, out.limits);
  ok('the basis and scope sentences say what a counted break is and is not, including that an unrecorded break is invisible', /RECORDED guardrail audit/i.test(out.basis) && /never recorded is invisible/i.test(out.scope) && /does not join a break to an outcome/i.test(out.scope), out.basis);
  const gone = N.unavailable();
  ok('an unreadable audit is UNKNOWN, not zero and not a clean week: every count is null and the rule list is empty', gone.state === 'unavailable' && gone.breaks === null && gone.prevented === null && gone.accepted === null && gone.observations === null && gone.by_rule.length === 0 && /not zero and not a clean week/i.test(gone.reason), gone.reason);
  ok('an empty but readable audit is a real ZERO with its own shape — distinguishable from the unreadable case above', (() => { const z = N.evaluate({ userId: UID, events: [] }); return z.state === 'available' && z.breaks === 0 && z.prevented === 0 && z.accepted === 0 && z.by_rule.length === 0 && z.by_day.length === 0 && z.windows.days === 0; })(), null);
  const own = N.evaluate({ userId: UID, events: rows.filter((r, i) => i === 0 || i === 1) });
  ok('the same rows give the same answer whether they arrive as a slice or as the whole audit (no hidden global)', own.breaks === 2 && own.by_rule.length === 1 && own.by_rule[0].rule === 'pre_market_routine', own.by_rule);
  const rules = N.rulesOf(JSON.parse(snap(['a', 'b'])));
  ok('the rule parser reads the audit\u2019s stored breach list (and a bare list), deduplicating names within one snapshot', rules.ok === true && JSON.stringify(rules.rules) === JSON.stringify(['a', 'b']) && JSON.stringify(N.rulesOf(['x', 'x']).rules) === JSON.stringify(['x']) && N.rulesOf({}).ok === false, rules);
  ok('the module is a leaf about the DECISION: neither the guardrail nor the correction bot requires it, so no rule can be crossed because a tally was stale', ['src/bots/guardrails.js', 'src/bots/correction.js', 'src/bots/setup.js'].every((rel) => !/rule-breaks/.test(fs.readFileSync(path.join(H.APP, rel), 'utf8'))), null);
});
