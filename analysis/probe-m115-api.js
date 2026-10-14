'use strict';
/**
 * M115 API probe: the clean-rep count as the product serves it. Every fixture is created through the
 * app's OWN routes (accounts, strategies, trades with `rule_checks`, the journal acknowledgement,
 * the settings route), so a rep here is a rep the app would really write — and the count is read from
 * the same payload the dashboard reads. The read-only claim is measured, not asserted: every table
 * and index is digested before and after and must be byte-identical.
 */
const H = require('./m115-test-support'), { ok } = H;

H.finish('M115 api: the rep count over the real routes, its declarations and its read-only proof', async () => {
  const u = await H.start('m115-api');
  const C = H.mod('src/challenge');
  if (!H.shipped(C, 'the clean-rep count (src/challenge.js)')) return;

  const desk = await H.account(u, 'M115 desk');
  const plan = await H.strategy(u, 'M115 plan');
  const otherPlan = await H.strategy({ ...u, req: (url, body, method, auth) => u.req(url, body, method, auth || u.otherToken) }, 'Somebody else\u2019s plan');

  const TODAY = H.today();                       // the harness's frozen UTC day
  const yesterday = H.dayAgo(1), twoDaysAgo = H.dayAgo(2), longAgo = H.dayAgo(40);
  const an = (q = '') => H.analytics(u, q + (q.includes('account_id') ? '' : (q ? '&' : '?') + 'account_id=' + desk.id));
  const challenge = async (q = '') => H.challengeOfPayload((await an(q)).data);

  /* -------------------------------------------------------- 1. before the trader declares anything */
  const unstarted = await challenge();
  // The counter-only arm carries the module and nothing that serves it, so this opener is that arm's
  // one measured absence: named here rather than crashed on, and the probe stops because there is no
  // payload to measure any further fact against.
  const served = !!(unstarted && typeof unstarted === 'object' && unstarted.progress && unstarted.window);
  ok('the analytics payload carries the clean-rep count for the account it analyses', served, JSON.stringify(unstarted));
  if (!served) return;
  ok('an unstarted count is served on the payload as `not_started` with `counted:null`, the DEFAULT 21 target and no failed-trade tally',
    unstarted.state === 'not_started' && unstarted.progress.counted === null && unstarted.target.value === C.DEFAULT_TARGET && unstarted.target.state === 'default' && unstarted.not_counted.total === null,
    JSON.stringify({ state: unstarted.state, counted: unstarted.progress.counted, target: unstarted.target }));
  ok('and it is served for the SAME account the payload analyses, with the module\u2019s version on it',
    unstarted.account_id === desk.id && unstarted.version === C.VERSION);
  const early = await H.trade(u, desk.id, { closedAt: longAgo + 'T09:00:00.000Z', strategyId: plan, checks: [{ label: 'risk 1%', passed: true }] });
  await H.journal(u, early.id);
  const beforeStart = await challenge();
  ok('a real journalled trade taken BEFORE the start day does NOT make the count zero: it stays unstarted, and the trade is visible in the window tally as history rather than as a failed rep',
    beforeStart.state === 'not_started' && beforeStart.progress.counted === null && beforeStart.window.trades_closed === 1 && beforeStart.window.truncated === false,
    JSON.stringify(beforeStart.window));

  /* -------------------------------------------------------- 2. the declarations go through the settings route */
  const badTarget = await H.settings(u, { challenge_target: 'seven' });
  ok('a target that is not a whole number 1\u2013999 is refused by the settings route with the module\u2019s own code, and nothing is stored',
    badTarget.status === 400 && badTarget.data.code === 'challenge_invalid' && (await challenge()).target.state === 'default', JSON.stringify(badTarget.data));
  const badStart = await H.settings(u, { challenge_start: '2026-13-40' });
  ok('and so is a start that is not a real UTC date', badStart.status === 400 && badStart.data.code === 'challenge_invalid');
  const saved = await H.settings(u, { challenge_start: yesterday, challenge_target: 3 });
  const savedChallenge = await challenge();
  ok('a valid start and target are saved as the trader\u2019s own settings and the count begins from the NEXT payload, not retroactively',
    saved.status === 200 && savedChallenge.state === 'available' && savedChallenge.start.value === yesterday && savedChallenge.progress.target === 3 && savedChallenge.progress.counted === 0 && savedChallenge.window.before_start === 1 && savedChallenge.window.trades_closed === 0,
    JSON.stringify({ counted: savedChallenge.progress.counted, before_start: savedChallenge.window.before_start }),
    'the count begins empty and the 40-day-old journalled trade is before the start: neither a rep nor a failure, never backfilled');

  /* -------------------------------------------------------- 3. the three criteria, through the routes */
  const rep = await H.trade(u, desk.id, { closedAt: H.isoHoursAgo(6), strategyId: plan, net: 120, rMultiple: 1.2, checks: [{ label: 'risk 1%', passed: true }, { label: 'no news window', passed: true }] });
  await H.journal(u, rep.id);
  const c3 = await challenge();
  const repRow = c3.recent.find((t) => t.trade_id === Number(rep.id));
  ok('a trade closed on the current UTC day, linked to the trader\u2019s own plan, checklist-clean and journalled through the app is COUNTED, and the count is a count of trades',
    c3.progress.counted === 1 && repRow && repRow.counted === true && c3.progress.run === 1 && c3.progress.first_counted_at === repRow.closed_at, JSON.stringify(repRow));

  const noPlan = await H.trade(u, desk.id, { closedAt: H.isoHoursAgo(5), strategyId: null, checks: [{ label: 'risk 1%', passed: true }] });
  await H.journal(u, noPlan.id);
  const rival = await H.trade(u, desk.id, { closedAt: H.isoHoursAgo(5), strategyId: otherPlan, checks: [{ label: 'risk 1%', passed: true }] });
  await H.journal(u, rival.id);
  const breach = await H.trade(u, desk.id, { closedAt: H.isoHoursAgo(4), strategyId: plan, checks: [{ label: 'risk 1%', passed: true }, { label: 'no revenge entry', passed: false }] });
  await H.journal(u, breach.id);
  const noChecks = await H.trade(u, desk.id, { closedAt: H.isoHoursAgo(3), strategyId: plan });
  await H.journal(u, noChecks.id);
  const stopNo = await H.trade(u, desk.id, { closedAt: H.isoHoursAgo(2), strategyId: plan, checks: [{ label: 'risk 1%', passed: true }] });
  await H.journal(u, stopNo.id);
  /* The recorded decision itself, through the app's own execution-review route (the only writer of
   * `stop_honoured`, and a SELF-REPORTED acknowledgement — the payload says broker_verified:false). */
  await H.execution(u, stopNo.id, { adherence: 4, stopHonoured: false });
  /* A trade closed YESTERDAY and journalled NOW: the journal is complete and valid — the app's own
   * hash check says so — and the acknowledgement falls on the next UTC day, which is exactly the
   * case the calendar proxy is labelled for. */
  const lateJournal = await H.trade(u, desk.id, { closedAt: yesterday + 'T09:00:00.000Z', strategyId: plan, checks: [{ label: 'risk 1%', passed: true }] });
  await H.journal(u, lateJournal.id);
  const unacknowledged = await H.trade(u, desk.id, { closedAt: H.isoHoursAgo(1), strategyId: plan, checks: [{ label: 'risk 1%', passed: true }] });
  const c4 = await challenge();
  const rowOf = (t) => c4.recent.find((x) => x.trade_id === Number(t.id));
  ok('an unlinked trade is not a rep and says `plan_linked`',
    rowOf(noPlan).counted === false && rowOf(noPlan).failed.join() === 'plan_linked', JSON.stringify(rowOf(noPlan)));
  ok('a link to a plan the trader does NOT own is not a plan link either: ownership is re-read on the way out, so a foreign id in the column buys nothing',
    rowOf(rival).counted === false && rowOf(rival).failed.includes('plan_linked') && rowOf(rival).plan.owned === false && rowOf(rival).plan.strategy_id === Number(otherPlan), JSON.stringify(rowOf(rival)));
  ok('a recorded FAILED checklist item is a recorded breach: the trade is not counted even though its plan link and its journal are fine',
    rowOf(breach).counted === false && rowOf(breach).failed.join() === 'no_recorded_breach' && rowOf(breach).breaches.failed_checks === 1 && rowOf(breach).breaches.checks_recorded === 2 && rowOf(breach).journal.complete === true, JSON.stringify(rowOf(breach)));
  ok('a trade with NO recorded checklist at all is not counted either \u2014 no record is not a clean record \u2014 and the payload counts those trades by name',
    rowOf(noChecks).counted === false && rowOf(noChecks).breaches.checks_recorded === 0 && c4.not_counted.unrecorded_checks >= 1, JSON.stringify({ unrecorded: c4.not_counted.unrecorded_checks }));
  ok('a RECORDED decision not to honour the stop is a breach on its own, with every checklist item passed — and it is the trader’s own self-reported, hash-stamped acknowledgement that says so, which the payload states',
    rowOf(stopNo).counted === false && rowOf(stopNo).failed.join() === 'no_recorded_breach' && rowOf(stopNo).breaches.stop_not_honoured === true && rowOf(stopNo).breaches.failed_checks === 0 && c4.limits.broker_verified === false, JSON.stringify(rowOf(stopNo)));
  const stopRow = await H.D.db.prepare('SELECT stop_honoured, stop_honoured_source, execution_review_hash FROM trades WHERE id=?').get(stopNo.id);
  ok('and the row really carries that decision as the app stores it (0, self_reported, with the review hash), so the criterion reads a recorded fact and not an inference',
    stopRow.stop_honoured === 0 && stopRow.stop_honoured_source === 'self_reported' && /^[a-f0-9]{64}$/.test(String(stopRow.execution_review_hash)), JSON.stringify(stopRow));
  ok('a COMPLETE journal whose acknowledgement landed on the next UTC day is still not a rep, and the payload says which criterion failed rather than calling the trade unclean',
    rowOf(lateJournal).counted === false && rowOf(lateJournal).failed.join() === 'journalled_same_close_day' && rowOf(lateJournal).journal.complete === true && rowOf(lateJournal).journal.same_close_day === false && c4.journaling.later_than_close_day === 1, JSON.stringify(rowOf(lateJournal)));
  ok('a closed trade with NO journal acknowledgement waits rather than counts, and the payload reports it as waiting with the app\u2019s own missing-field list',
    rowOf(unacknowledged).counted === false && rowOf(unacknowledged).failed.join() === 'journalled_same_close_day' && c4.journaling.waiting_on_acknowledgement === 1 && c4.not_counted.missing_journal_fields.includes('explicit_review_acknowledgement'), JSON.stringify({ waiting: c4.journaling.waiting_on_acknowledgement, missing: c4.not_counted.missing_journal_fields }));
  ok('the count carries NO amount and NO goal figure, while the payload it rides on does report P&L \u2014 so the absence is the count\u2019s choice, not the payload\u2019s',
    JSON.stringify(c4).indexOf('net_pnl') === -1 && JSON.stringify(c4).indexOf('r_multiple') === -1 && /never joined to P&L/.test(c4.notes.money) && JSON.stringify((await an()).data).indexOf('net_pnl') !== -1,
    JSON.stringify({ count_has_net_pnl: JSON.stringify(c4).indexOf('net_pnl') !== -1, payload_has_net_pnl: JSON.stringify((await an()).data).indexOf('net_pnl') !== -1 }));
  const otherSees = H.challengeOfPayload((await H.analytics({ ...u, req: (url, body, method, auth) => u.req(url, body, method, auth || u.otherToken) })).data);
  ok('and the other trader\u2019s stored settings are their own: their count is unstarted with the default target while this trader\u2019s stands at three',
    otherSees.state === 'not_started' && otherSees.progress.counted === null && otherSees.target.state === 'default', JSON.stringify({ state: otherSees.state, target: otherSees.target }));

  /* -------------------------------------------------------- 4. scope: the resolved account, and the challenge window not the page filter */
  const second = await H.account(u, 'M115 second desk');
  const elsewhere = await H.trade(u, second.id, { closedAt: H.isoHoursAgo(4), strategyId: plan, checks: [{ label: 'risk 1%', passed: true }] });
  await H.journal(u, elsewhere.id);
  const scoped = await challenge();
  const secondChallenge = H.challengeOfPayload((await H.analytics(u, '?account_id=' + second.id)).data);
  ok('a rep on ANOTHER desk is not counted on this desk\u2019s payload, and that desk\u2019s own payload DOES count it: the count is scoped to the account the payload analyses, like every other figure on it',
    scoped.window.trades_closed === c4.window.trades_closed && !scoped.recent.some((t) => t.trade_id === Number(elsewhere.id)) && secondChallenge.recent.some((t) => t.trade_id === Number(elsewhere.id)) && secondChallenge.progress.counted === 1,
    JSON.stringify({ scoped_trades: scoped.window.trades_closed, second_desk_counted: secondChallenge.progress.counted }));
  const narrowed = await challenge('?from=' + TODAY + '&to=' + TODAY);
  ok('narrowing the page\u2019s date filter does NOT narrow the challenge window: the start day is the window the trader declared, so a record cannot be made to look smaller by a filter',
    narrowed.window.trades_closed === scoped.window.trades_closed && narrowed.progress.counted === scoped.progress.counted, JSON.stringify({ filtered: narrowed.window.trades_closed, unfiltered: scoped.window.trades_closed }));

  /* -------------------------------------------------------- 5. the start is a record, not a dial */
  const moved = await H.settings(u, { challenge_start: twoDaysAgo });
  const movedBack = await H.settings(u, { challenge_start: longAgo });
  ok('the start cannot be moved once closed trades sit in its window: BOTH a later and an earlier start are refused with 409 and the number of trades in the way',
    moved.status === 409 && moved.data.code === 'challenge_start_locked' && moved.data.closed_in_window > 0 && movedBack.status === 409 && movedBack.data.code === 'challenge_start_locked', JSON.stringify({ later: { s: moved.status, n: moved.data.closed_in_window }, earlier: { s: movedBack.status, n: movedBack.data.closed_in_window } }));
  const sameAgain = await H.settings(u, { challenge_start: yesterday });
  ok('re-sending the SAME start is accepted (a settings screen that posts the whole form must not be locked out of saving), and the count is unchanged',
    sameAgain.status === 200 && (await challenge()).progress.counted === scoped.progress.counted);
  const newTarget = await H.settings(u, { challenge_target: 1 });
  const afterTarget = await challenge();
  ok('moving the target changes the target and NOT the count, the run, or a single trade\u2019s verdict',
    newTarget.status === 200 && afterTarget.progress.counted === scoped.progress.counted && afterTarget.progress.run === scoped.progress.run && afterTarget.progress.target === 1 && afterTarget.progress.beyond_target === Math.max(0, scoped.progress.counted - 1), JSON.stringify({ counted: afterTarget.progress.counted, target: afterTarget.progress.target, beyond: afterTarget.progress.beyond_target }));
  const cleared = await H.settings(u, { challenge_start: null });
  ok('clearing the start is refused for the same reason as moving it: un-starting a count that has trades in it would erase a record',
    cleared.status === 409 && cleared.data.code === 'challenge_start_locked');
  ok('the settings screen\u2019s own payload shape is preserved: an ordinary settings save still returns the settings it saved',
    (await H.settings(u, { timezone: 'Africa/Lagos' })).status === 200 && (await H.settings(u, { timezone: 'Africa/Lagos' })).data.settings.timezone === 'Africa/Lagos');

  /* -------------------------------------------------------- 6. read-only, measured on every table and index */
  const before = await H.snapshot();
  const a = await challenge();
  const b = await challenge();
  const unbounded = H.challengeOfPayload((await H.analytics(u)).data);
  const after = await H.snapshot();
  ok('reading the count TWICE changes not one byte of any table, index or trigger in the database \u2014 the read is a read',
    H.changed(before, after).length === 0 && a.progress.counted === b.progress.counted, JSON.stringify(H.changed(before, after)));
  ok('and the count cannot influence a decision: the payload\u2019s limits say read-only with zero writes and no influence on grades, caps, permissions, guardrail decisions or plan changes',
    unbounded.limits.read_only === true && unbounded.limits.writes === 0 && unbounded.limits.grades_influence === false && unbounded.limits.caps_influence === false && unbounded.limits.permission_influence === false && unbounded.limits.guardrail_decisions_influence === false && unbounded.limits.plan_change_permission === false && unbounded.limits.outcome_joined !== true && unbounded.outcome_joined === false, JSON.stringify(unbounded.limits));
  const otherTables = await H.tablesOf();
  ok('the milestone added NO table of its own: the declarations live in the users\u2019 settings and nowhere else',
    !otherTables.some((t) => /challenge|rep_/i.test(t)), otherTables.filter((t) => /challenge|rep_/i.test(t)).join());
  const settingsRow = await H.D.db.prepare('SELECT settings FROM users WHERE id=?').get(u.user.userId);
  const stored = JSON.parse(settingsRow.settings || '{}');
  ok('and the two declarations are exactly two keys in that settings object, each of them an explicit value the trader set',
    stored.challenge_start === yesterday && stored.challenge_target === 1 && Object.keys(stored).filter((k) => /^challenge/.test(k)).length === 2,
    JSON.stringify({ challenge_start: stored.challenge_start, challenge_target: stored.challenge_target }));
});
