'use strict';
/**
 * M115 pure probe: the clean-rep count as arithmetic — which trades count, why the others do not, and
 * what the number refuses to do. No database and no server: the rows, the plans, the recorded checks
 * and the day are handed to `evaluate`, and the journalling criterion is exercised through the app's
 * OWN `journaling.fingerprint`/`info`, so "journalled" cannot drift into a second definition here.
 */
const path = require('path');
const H = require('./m115-test-support'), { ok } = H;

H.finish('M115 pure: the clean-rep count, its criteria and its refusals', async () => {
  const C = H.mod('src/challenge');
  if (!H.shipped(C, 'the clean-rep count (src/challenge.js)')) return;
  const J = require(path.join(H.APP, 'src/journaling'));

  const NOW = Date.UTC(2026, 9, 13, 12);
  const DAY = H.dayOf(NOW);
  /** A closed trade shaped the way the trades table stores one, with ack-able journal fields. */
  const row = (id, closedAt, extra = {}) => ({
    id, user_id: 1, account_id: 2, symbol: 'M115X', direction: 'long', status: 'closed',
    opened_at: closedAt, closed_at: closedAt, entry: 100, exit: 101, stop: 99, target: 103, size: 1, fees: 0,
    net_pnl: 100, r_multiple: 1, risk_amount: 100, strategy_id: 7, stop_honoured: null,
    emotion_before: 'calm', emotion_after: 'flat', execution_notes: 'What happened', lesson: 'What I would change',
    mistakes: '', mistakes_none: 1, journal_reviewed_at: null, journal_review_hash: null, ...extra,
  });
  /** The app's own acknowledgement: the same hash `reviewTrade` stores, over the same fields. */
  const ack = (r, reviewedAt) => ({ ...r, journal_reviewed_at: reviewedAt, journal_review_hash: J.fingerprint(r) });
  const OWN = new Set([7]);
  const checks = (map) => new Map(Object.entries(map).map(([k, v]) => [Number(k), v]));
  const check = (total, failed = 0) => ({ total, passed: total - failed, failed });
  const ev = (rows, opts = {}) => C.evaluate(rows, { start: '2026-10-01', target: 21, today: DAY, nowMs: NOW, ownedPlans: OWN, checks: opts.checks || checks({}), ...opts });

  /* --------------------------------------------------------------- 1. the declarations */
  ok('the count is versioned and names its three criteria in order, as the recorded facts they are', C.VERSION === 'clean-reps-v1' && JSON.stringify(C.CRITERIA) === '["plan_linked","no_recorded_breach","journalled_same_close_day"]', C.CRITERIA);
  ok('the basis says it counts TRADES and never days, and that an empty day neither adds nor breaks', /Counts TRADES, never calendar days/.test(C.BASIS) && /empty day neither adds a rep nor breaks a run/.test(C.BASIS));
  ok('the scope says a refused entry leaves no trade row (so it is neither a rep nor a failure) and that no record is not a clean record', /leaves no trade row/.test(C.SCOPE) && /no record is not a clean record/.test(C.SCOPE));
  ok('an unset start is `not_set`, a valid one is a real UTC day, and a corrupt one is `unusable` rather than silently replaced',
    C.startOf({}).state === 'not_set' && C.startOf({ challenge_start: '2026-10-01' }).value === '2026-10-01' && C.startOf({ challenge_start: 'soon' }).state === 'unusable' && C.startOf({ challenge_start: '2026-02-30' }).state === 'unusable');
  ok('an unset target is the DEFAULT 21, a valid one is used, and a corrupt one is `unusable` (never silently 21)',
    C.targetOf({}).value === C.DEFAULT_TARGET && C.targetOf({}).state === 'default' && C.targetOf({ challenge_target: 3 }).value === 3 && C.targetOf({ challenge_target: 'seven' }).state === 'unusable' && C.targetOf({ challenge_target: 0 }).state === 'unusable' && C.targetOf({ challenge_target: 1000 }).state === 'unusable' && C.targetOf({ challenge_target: 21.5 }).state === 'unusable');
  ok('a target a caller wants to store is validated, not coerced: 3 and "3" pass, "seven"/0/1000/21.5 are refused with the module\u2019s own code',
    C.targetKey(3) === 3 && C.targetKey('3') === 3 && ['seven', 0, 1000, 21.5, '', null].every((v) => { try { C.targetKey(v); return false; } catch (e) { return e.code === 'challenge_invalid'; } }));
  ok('a start must be a real UTC day, and clearing it is a distinct, explicit value',
    C.startKey('2026-10-01') === '2026-10-01' && C.startKey(null) === null && ['2026-13-01', '01-10-2026', 'soon'].every((v) => { try { C.startKey(v); return false; } catch (e) { return e.code === 'challenge_invalid'; } }));

  /* --------------------------------------------------------------- 2. one trade's verdict */
  const r1 = ack(row(1, '2026-10-05T09:00:00.000Z'), '2026-10-05T20:00:00.000Z');
  ok('a trade that is plan-linked, checklist-clean and journalled on its own close day is a rep', C.repOf(r1, { nowMs: NOW, ownedPlans: OWN, checks: checks({ 1: check(2) }) }).counted === true);
  ok('a trade with NO plan link is not a rep, and each failing criterion is named rather than summarised',
    (() => { const v = C.repOf({ ...r1, strategy_id: null }, { nowMs: NOW, ownedPlans: OWN, checks: checks({ 1: check(2) }) }); return v.counted === false && JSON.stringify(v.failed) === '["plan_linked"]'; })());
  ok('a plan link that points at somebody else\u2019s strategy is NOT a plan link: ownership is re-read, never trusted from the row',
    (() => { const v = C.repOf({ ...r1, strategy_id: 99 }, { nowMs: NOW, ownedPlans: OWN, checks: checks({ 1: check(2) }) }); return v.counted === false && v.failed.includes('plan_linked') && v.plan.owned === false && v.plan.strategy_id === 99; })());
  ok('a trade with NO recorded checklist is not a rep: no record is not a clean record',
    (() => { const v = C.repOf(r1, { nowMs: NOW, ownedPlans: OWN, checks: checks({}) }); return v.counted === false && v.failed.includes('no_recorded_breach') && v.breaches.checks_recorded === 0; })());
  ok('one FAILED checklist item is a recorded breach, and the count of recorded checks rides the verdict',
    (() => { const v = C.repOf(r1, { nowMs: NOW, ownedPlans: OWN, checks: checks({ 1: check(3, 1) }) }); return v.counted === false && v.failed.includes('no_recorded_breach') && v.breaches.failed_checks === 1 && v.breaches.checks_recorded === 3; })());
  ok('a recorded decision NOT to honour the stop is a breach even when every check passed',
    (() => { const v = C.repOf({ ...r1, stop_honoured: 0 }, { nowMs: NOW, ownedPlans: OWN, checks: checks({ 1: check(2) }) }); return v.counted === false && v.failed.includes('no_recorded_breach') && v.breaches.stop_not_honoured === true; })());
  ok('a stop whose honour was never recorded is not a recorded breach \u2014 the criterion is literally `no_recorded_breach`',
    C.repOf({ ...r1, stop_honoured: null }, { nowMs: NOW, ownedPlans: OWN, checks: checks({ 1: check(2) }) }).counted === true);
  ok('a hand-written `journal_reviewed_at` with no matching hash does NOT count: the app\u2019s own acknowledgement cannot be forged by filling the column',
    (() => { const v = C.repOf({ ...r1, journal_review_hash: 'a'.repeat(64) }, { nowMs: NOW, ownedPlans: OWN, checks: checks({ 1: check(2) }) }); return v.counted === false && v.journal.complete === false && v.journal.missing.includes('explicit_review_acknowledgement'); })());
  ok('the criterion is the CLOSE DAY, not merely a completed review: the same acknowledgement a day later completes the journal and still does not count',
    (() => { const late = ack(row(2, '2026-10-05T09:00:00.000Z'), '2026-10-06T20:00:00.000Z'), v = C.repOf(late, { nowMs: NOW, ownedPlans: OWN, checks: checks({ 2: check(2) }) });
      return v.journal.complete === true && v.journal.same_close_day === false && v.counted === false && v.failed.includes('journalled_same_close_day') && v.journal.review_day === '2026-10-06'; })());
  ok('and it is the UTC day at BOTH ends: a close and an acknowledgement 30 minutes apart across midnight UTC are two different days',
    (() => { const early = ack(row(3, '2026-10-05T23:45:00.000Z'), '2026-10-06T00:15:00.000Z'), v = C.repOf(early, { nowMs: NOW, ownedPlans: OWN, checks: checks({ 3: check(1) }) });
      return v.close_day === '2026-10-05' && v.journal.review_day === '2026-10-06' && v.counted === false; })());
  ok('an OPEN trade is never a rep, whatever else it carries: the SAME row is a rep when closed and is not when open',
    (() => { const opts = { nowMs: NOW, ownedPlans: OWN, checks: checks({ 1: check(2) }) };
      const open = C.repOf({ ...r1, status: 'open' }, opts), closed = C.repOf(r1, opts);
      return closed.counted === true && open.counted === false && open.open === true; })());

  /* --------------------------------------------------------------- 3. the count over a window */
  const good = (id, day, at = 'T09:00:00.000Z') => ack(row(id, day + at), day + 'T20:00:00.000Z');
  const allClean = (ids) => checks(Object.fromEntries(ids.map((i) => [i, check(2)])));
  const rows = [good(10, '2026-10-05'), good(11, '2026-10-09'), ack(row(12, '2026-10-07T09:00:00.000Z'), '2026-10-08T20:00:00.000Z'), good(13, '2026-09-28')];
  const e1 = ev(rows, { checks: allClean([10, 11, 12, 13]) });
  ok('the window holds the trades from the start day on, and a trade closed BEFORE the start day is excluded \u2014 not counted and not a failure',
    e1.window.trades_closed === 3 && e1.window.before_start === 1 && e1.progress.counted === 2 && e1.not_counted.total === 1, e1.window);
  ok('a day with no closed trade is simply absent: the run is over consecutive REPS, not consecutive days, and the payload says skipping days is permitted',
    e1.progress.days_note.includes('Skipping days is permitted') && ev([good(60, '2026-10-05'), good(61, '2026-10-09')], { checks: allClean([60, 61]) }).progress.run === 2,
    'two reps four days apart, nothing between them');
  ok('the run is consecutive reps NEWEST first: a failure after a rep leaves the count intact and restarts only the run',
    (() => { const e = ev([good(10, '2026-10-05'), good(11, '2026-10-09'), ack(row(12, '2026-10-12T09:00:00.000Z'), '2026-10-13T20:00:00.000Z')], { checks: allClean([10, 11, 12]) });
      return e.progress.counted === 2 && e.progress.run === 0; })(),
    'the newest trade is not journalled on its close day');
  ok('and a failure OLDER than every rep does not break the run either: the run is scanned from the newest trade, not from the start day',
    (() => { const e = ev([ack(row(9, '2026-10-01T09:00:00.000Z'), '2026-10-02T20:00:00.000Z'), good(10, '2026-10-05'), good(11, '2026-10-09')], { checks: allClean([9, 10, 11]) });
      return e.not_counted.total === 1 && e.progress.counted === 2 && e.progress.run === 2; })());
  ok('but a failure in the MIDDLE does break the run while leaving the count: the two numbers measure different things',
    e1.progress.counted === 2 && e1.progress.run === 1 && e1.progress.days_with_a_rep === 2);
  ok('the oldest and newest counted reps are reported by their own close instants, and the count is a count of trades',
    e1.progress.first_counted_at === '2026-10-05T09:00:00.000Z' && e1.progress.last_counted_at === '2026-10-09T09:00:00.000Z');
  ok('a trade with no usable close clock is counted in `undated_closes` rather than guessed onto a day',
    (() => { const e = ev([...rows, row(15, null)], { checks: allClean([10, 11, 12, 13, 15]) }); return e.window.undated_closes === 1 && e.window.trades_closed === 3 && e.progress.counted === 2; })());
  ok('open trades are excluded from the window AND reported, so an open position can never look like a failed rep',
    (() => { const e = ev([...rows, { ...row(16, '2026-10-12T09:00:00.000Z'), status: 'open' }], { checks: allClean([10, 11, 12, 13]) }); return e.window.open_excluded === 1 && e.window.trades_closed === 3 && e.progress.counted === 2; })());
  ok('each failure is attributed to its OWN criterion, a trade may fail several, and the reasons add up per criterion',
    (() => { const e = ev([good(20, '2026-10-05'), { ...row(21, '2026-10-06T09:00:00.000Z'), strategy_id: null }, row(22, '2026-10-07T09:00:00.000Z')], { checks: checks({ 20: check(2), 21: check(2, 1), 22: check(0) }) });
      return e.not_counted.total === 2 && e.not_counted.by_criterion.plan_linked === 1 && e.not_counted.by_criterion.no_recorded_breach === 2 && e.not_counted.by_criterion.journalled_same_close_day === 2; })(),
    'the second trade has no plan link and a failed check, the third has neither checks nor an acknowledgement');
  ok('the trades with NO recorded checklist at all are counted by name, so the trader learns why they do not count',
    (() => { const e = ev([good(30, '2026-10-05'), row(31, '2026-10-06T09:00:00.000Z')], { checks: checks({ 30: check(1) }) }); return e.not_counted.unrecorded_checks === 1; })());
  ok('the journal criterion reports the waiting trades by the fields the APP ITSELF says are missing, in the app\u2019s own words',
    (() => { const r = row(40, '2026-10-05T09:00:00.000Z'), e = ev([r], { checks: checks({ 40: check(1) }) }), own = J.info(r, NOW);
      return e.journaling.waiting_on_acknowledgement === 1 && e.not_counted.missing_journal_fields.join() === own.missing.slice().sort().join() && own.missing.includes('explicit_review_acknowledgement'); })());
  ok('the observed gap between the recorded close and the recorded acknowledgement is reported, median and worst, so the calendar proxy can be read for what it is',
    (() => { const e = ev([good(50, '2026-10-05'), ack(row(51, '2026-10-06T09:00:00.000Z'), '2026-10-06T21:00:00.000Z'), ack(row(52, '2026-10-07T09:00:00.000Z'), '2026-10-08T09:00:00.000Z')], { checks: allClean([50, 51, 52]) });
      return e.journaling.reviewed_in_window === 3 && e.journaling.same_close_day === 2 && e.journaling.later_than_close_day === 1 && e.journaling.median_gap_minutes === 720 && e.journaling.max_gap_minutes === 1440 && /observed time between the recorded close and the recorded acknowledgement/.test(e.journaling.basis); })());
  ok('`remaining` counts down to the target and `beyond_target` counts past it, both null when the stored target is unusable',
    (() => { const a = ev([good(60, '2026-10-05')], { target: 3, checks: checks({ 60: check(1) }) }), b = ev([good(60, '2026-10-05'), good(61, '2026-10-06')], { target: 1, checks: allClean([60, 61]) }), c = ev([good(60, '2026-10-05')], { target: null, targetState: 'unusable', checks: checks({ 60: check(1) }) });
      return a.progress.remaining === 2 && a.progress.beyond_target === 0 && b.progress.remaining === 0 && b.progress.beyond_target === 1 && c.progress.remaining === null && c.progress.beyond_target === null && c.target.state === 'unusable'; })());
  ok('moving the target never moves the count: the same rows scored against 2 and against 30 report the same reps and the same run',
    (() => { const a = ev(rows, { target: 2, checks: allClean([10, 11, 12, 13]) }), b = ev(rows, { target: 30, checks: allClean([10, 11, 12, 13]) });
      return a.progress.counted === b.progress.counted && a.progress.run === b.progress.run && a.progress.counted === 2; })());
  ok('the newest trades in the window are listed with their own verdict and reasons, counted or not',
    (() => { const e = e1;
      return e.recent.length === 3 && e.recent[0].trade_id === 11 && e.recent[0].counted === true && e.recent.some((t) => t.counted === false && t.failed.join() === 'journalled_same_close_day'); })());
  ok('a bounded read says so: the truncation flag is reported rather than the old trades quietly disappearing',
    (() => { const many = Array.from({ length: 6 }, (_, i) => good(70 + i, `2026-10-0${i + 1}`)), e = C.evaluate(many, { start: '2026-10-01', target: 5, today: DAY, nowMs: NOW, ownedPlans: OWN, checks: allClean(many.map((r) => r.id)), limit: 5 });
      return e.window.truncated === true; })());

  /* --------------------------------------------------------------- 4. the shapes the count refuses */
  const ns = C.notStarted({}, { accountId: 2, today: DAY });
  ok('an UNSTARTED count reports `not_started` with `counted:null` \u2014 never zero reps \u2014 and says starting it is the trader\u2019s own act',
    ns.state === 'not_started' && ns.progress.counted === null && ns.progress.run === null && /NOT zero reps/.test(ns.started_note) && /never backfilled/.test(ns.started_note) && ns.start.state === 'not_set');
  const un = C.unavailable('EVIDENCE DOWN');
  ok('an unreadable count is UNKNOWN: `unavailable` with `counted:null`, never an empty challenge, and the default wording says so in as many words',
    un.state === 'unavailable' && un.progress.counted === null && un.not_counted.total === null && un.progress.by_criterion === undefined && un.recent.length === 0
    && /not zero reps and not a clean count/.test(C.unavailable().reason) && C.unavailable().progress.counted === null && un.reason === 'EVIDENCE DOWN');
  ok('both shapes are read-only with zero writes and no influence on any grade, cap, permission, guardrail decision or plan change',
    ['read_only', 'writes', 'grades_influence', 'permission_influence', 'caps_influence', 'guardrail_decisions_influence', 'plan_change_permission'].every((k) => (k === 'read_only' ? un.limits[k] === true && e1.limits[k] === true : k === 'writes' ? un.limits[k] === 0 && e1.limits[k] === 0 : un.limits[k] === false && e1.limits[k] === false)));
  ok('and the count is never joined to an outcome: `outcome_joined:false` with the sentence saying why the exercise counts a habit',
    e1.outcome_joined === false && /causal claim this journal has not measured/.test(e1.outcome_note) && /counts a habit/.test(e1.outcome_note));
  ok('the payload carries NO money figure anywhere: nothing named for P&L, profit, amount, equity or a goal \u2014 the only `money` word is the note saying there is none',
    (() => {
      const hits = (v, p = '') => { if (v === null || typeof v !== 'object') return []; if (Array.isArray(v)) return v.flatMap((x, i) => hits(x, `${p}[${i}]`)); return Object.entries(v).flatMap(([k, x]) => (/pnl|profit|amount|equity|goal/i.test(k) ? [p + '.' + k] : /money/i.test(k) ? [p + '.' + k + '=' + (typeof x)] : hits(x, p + '.' + k))); };
      const found = hits(e1);
      return found.length === 1 && found[0] === '.notes.money=string' && /never joined to P&L/.test(e1.notes.money);
    })(), (() => { const hits = (v, p = '') => { if (v === null || typeof v !== 'object') return []; return Object.entries(v).flatMap(([k, x]) => (/pnl|profit|amount|equity|goal|money/i.test(k) ? [p + '.' + k] : hits(x, p + '.' + k))); }; return hits(e1); })());
  const bad = await (async () => { try { await C.inspect(0, {}); return null; } catch (e) { return e; } })();
  ok('an owner that is not a positive id is refused with the module\u2019s own code before any read happens',
    !!bad && bad.code === 'challenge_invalid' && bad.status === 400, bad && { code: bad.code, status: bad.status });
});
