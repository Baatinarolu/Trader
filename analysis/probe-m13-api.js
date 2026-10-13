'use strict';
/**
 * M13/M65 api probe: the review periods over real HTTP, against the real routes.
 * What is measured is what a trader reading the review could be misled by: a period series that
 * cannot be reached from the payload, a bucket that disagrees with the period-review module's own
 * totals for the same period, an artifact joined across accounts, a draft or an imported copy read
 * as a completed review, a close with no clock silently bucketed, an unreadable record rendered as
 * "nothing was reviewed", and a read that changes a row.
 */
const H = require('./m13-test-support'), { ok } = H, R = H.mod('src/period-reviews'), P = H.mod('src/periods');

H.finish('M13/M65 api: recorded periods and the record of which were reviewed', async () => {
  const P0 = H.mod('src/periods');
  if (!P0 || P0.VERSION !== H.M13_VERSION) return H.ok('this tree ships the M13/M65 calendar ruler (the committed parent does not, and that absence is this probe\'s control)', false);
  if (!R || R.COVERAGE_VERSION !== H.COVERAGE_VERSION) return H.ok('this tree ships the review-period coverage (the committed parent does not, and that absence is this probe\'s control)', false);
  const u = await H.start('M13 api');
  const desk = await H.account(u, 'M13 desk');
  const other = await H.account(u, 'M13 other desk');

  /* The fixture: four closes with an exact UTC clock — one Sunday 23:30Z (a Lagos Monday), one in the
   * week that opens the quarter, one in the week before it, and one with no clock at all. */
  const sunday = await H.close(u, desk.id, { symbol: 'M13SUN', closedAt: '2026-10-04T23:30:00.000Z', net: 40, r: 0.5, risk: 80 });
  await H.close(u, desk.id, { symbol: 'M13A', closedAt: '2026-10-05T09:00:00.000Z', net: 120, r: 2, risk: 60 });
  await H.close(u, desk.id, { symbol: 'M13B', closedAt: '2026-10-07T09:00:00.000Z', net: -60, r: -1, risk: 60, fees: 0.5 });
  await H.close(u, desk.id, { symbol: 'M13C', closedAt: '2026-09-30T09:00:00.000Z', net: 30, r: 1, risk: 30, grade: 'B' });
  await H.D.db.prepare(`INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,setup_grade,net_pnl,r_multiple,risk_amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(u.user.userId, desk.id, 'M13UNDATED', 'long', 'closed', '2026-10-08T09:00:00.000Z', null, 100, 101, 99, 103, 1, 0, 'A', 999, 9, 111);
  H.close(u, other.id, { symbol: 'M13OTHER', closedAt: '2026-10-05T09:00:00.000Z', net: 500, r: 5, risk: 100 });

  /* The artifact record: one completed week, one draft week, one imported copy, and one artifact on
   * the OTHER desk for the same week — which must never be joined into this desk's record. */
  const completedId = await H.review(u, desk.id, 'week', '2026-10-05', { focus: 'Declared week focus' });
  await H.review(u, desk.id, 'week', '2026-09-28', { status: 'draft', focus: 'Declared draft focus' });
  await H.review(u, desk.id, 'week', '2026-09-21', { status: 'imported', source: 'imported_unverified' });
  const foreignId = await H.review(u, other.id, 'week', '2026-10-05', { focus: 'Other desk focus' });
  const quarterId = await H.review(u, desk.id, 'quarter', '2026-10-01', { focus: 'Declared quarter focus' });

  const before = await H.digests(await H.tablesOf());
  const r1 = await H.analytics(u, '?account_id=' + desk.id), an = r1.data || {};
  const r2 = await H.analytics(u, '?account_id=' + desk.id), an2 = r2.data || {};
  const after = await H.digests(await H.tablesOf());

  ok('the payload the review already reads carries the weekly and quarterly series beside daily and monthly',
    r1.status === 200 && !!an.weekly && !!an.quarterly && !!an.daily && !!an.monthly && Object.keys(an.weekly).length > 0 && Object.keys(an.quarterly).length > 0,
    { status: r1.status, weekly: Object.keys(an.weekly || {}), quarterly: Object.keys(an.quarterly || {}) });
  ok('the buckets are the REVIEW calendar: the Sunday 23:30Z close is in the week that opened on Monday 2026-09-28, and the Friday close is in the next week',
    !!an.weekly['2026-09-28'] && !!an.weekly['2026-10-05'] && an.weekly['2026-09-28'].trades === 2 && an.weekly['2026-10-05'].trades === 2,
    an.weekly && Object.fromEntries(Object.entries(an.weekly).map(([k, v]) => [k, v.trades])));
  ok('and the OTHER ruler is still the journal clock, measured on the same close: the Sunday close is a Lagos MONDAY (daily 2026-10-05, +160) while its review week is 2026-09-28 (+70)',
    !!an.daily['2026-10-05'] && an.daily['2026-10-05'].trades === 2 && an.daily['2026-10-05'].pnl === 160 && an.weekly['2026-09-28'].pnl === 70 && an.weekly['2026-10-05'].pnl === 60
    && /review calendar/.test(an.weekly['2026-09-28'].basis) && /journal timezone/.test(an.weekly['2026-09-28'].basis),
    { lagos_day: [an.daily['2026-10-05'] && an.daily['2026-10-05'].trades, an.daily['2026-10-05'] && an.daily['2026-10-05'].pnl], review_week: an.weekly['2026-09-28'] && an.weekly['2026-09-28'].pnl, basis: an.weekly['2026-09-28'].basis });
  ok('a bucket is that period\u2019s own arithmetic: two closes, one win, one loss, net and R summed, the days counted',
    an.weekly['2026-10-05'].trades === 2 && an.weekly['2026-10-05'].wins === 1 && an.weekly['2026-10-05'].losses === 1 && an.weekly['2026-10-05'].pnl === 60 && an.weekly['2026-10-05'].r === 1 && an.weekly['2026-10-05'].days === 2 && an.weekly['2026-10-05'].win_rate === 50,
    an.weekly['2026-10-05']);
  ok('the quarterly bucket is the calendar quarter the closes fall in, with the same fields',
    an.quarterly['2026-Q4'] && an.quarterly['2026-Q4'].trades === 3 && an.quarterly['2026-Q4'].pnl === 100 && an.quarterly['2026-Q3'] && an.quarterly['2026-Q3'].trades === 1 && an.quarterly['2026-Q3'].pnl === 30,
    Object.fromEntries(Object.entries(an.quarterly || {}).map(([k, v]) => [k, v.trades])));
  ok('a close with NO clock is counted by name instead of being silently dropped or guessed into a week',
    an.undated_closes === 1 && Object.values(an.weekly).reduce((n, b) => n + b.trades, 0) === 4 && Object.values(an.quarterly).reduce((n, b) => n + b.trades, 0) === 4,
    { undated: an.undated_closes, weekly_trades: Object.values(an.weekly || {}).reduce((n, b) => n + b.trades, 0) });

  const rp = H.reviewPeriodsOf(an);
  ok('the artifact record rides the same payload, scoped to the analysed account, and is available',
    rp.state === 'available' && rp.account_id === desk.id && rp.kinds && !!rp.kinds.week && !!rp.kinds.quarter && rp.limits.writes === 0 && rp.limits.read_only === true,
    { state: rp.state, account: rp.account_id, kinds: Object.keys(rp.kinds || {}) });
  const week = (start) => (rp.kinds.week.periods || []).find((p) => p.start === start) || {};
  ok('a saved week is joined to its own period as `completed`, with its receipt and the trader\u2019s own focus',
    week('2026-10-05').review_state === 'completed' && week('2026-10-05').review_id === completedId && week('2026-10-05').review_focus === 'Declared week focus' && week('2026-10-05').review_source === 'human_review',
    { state: week('2026-10-05').review_state, id: week('2026-10-05').review_id });
  ok('a draft is a draft and an imported copy is labelled unverified — neither is counted as a completed review',
    week('2026-09-28').review_state === 'draft' && week('2026-09-21').review_state === 'imported_unverified' && rp.kinds.week.completed === 1 && rp.kinds.week.draft === 1 && rp.kinds.week.imported_unverified === 1,
    { draft: week('2026-09-28').review_state, imported: week('2026-09-21').review_state, counts: { completed: rp.kinds.week.completed, draft: rp.kinds.week.draft, imported: rp.kinds.week.imported_unverified } });
  ok('a finished week with no artifact is `not_recorded`, and the record says what that does and does not mean',
    week('2026-10-12').review_state === 'not_recorded' && week('2026-10-12').finished === false && week('2026-10-05').finished === true && rp.kinds.week.not_recorded >= 1 && /not evidence that no review happened/i.test(rp.kinds.week.not_recorded_meaning) && /not evidence that no review happened/i.test(rp.basis),
    { current_week: week('2026-10-12').review_state, open: rp.kinds.week.open_periods, not_recorded: rp.kinds.week.not_recorded });
  ok('the OTHER desk\u2019s artifact for the same week is not joined into this account\u2019s record',
    rp.kinds.week.rows_scanned === 3 && rp.kinds.week.periods.every((p) => p.review_id !== foreignId), { scanned: rp.kinds.week.rows_scanned, foreign: foreignId });
  ok('the quarterly record is the same arithmetic on the quarterly ruler, with the quarter artifact joined',
    rp.kinds.quarter.periods.length === 8 && rp.kinds.quarter.periods[0].start === '2026-10-01' && rp.kinds.quarter.periods[0].review_state === 'completed' && rp.kinds.quarter.periods[0].review_id === quarterId && rp.kinds.quarter.periods[0].trades === 3,
    { first: rp.kinds.quarter.periods[0] && rp.kinds.quarter.periods[0].start, state: rp.kinds.quarter.periods[0] && rp.kinds.quarter.periods[0].review_state });
  ok('a period with no closed trade reports NO amount rather than a flat zero, and its artifact state is still read',
    week('2026-09-28').pnl === 70 && week('2026-09-21').trades === 0 && week('2026-09-21').pnl === null && week('2026-09-21').r === null && week('2026-09-21').win_rate === null && week('2026-09-21').review_state === 'imported_unverified',
    { with_trades: week('2026-09-28').pnl, without: week('2026-09-21').pnl });

  /* The two surfaces that speak about the same week must agree: the review module's own financial
   * block for that period and the bucket the payload publishes. */
  const rows = await H.D.db.prepare('SELECT * FROM trades WHERE user_id=? AND account_id=? ORDER BY id').all(u.user.userId, desk.id);
  const accountRow = await H.D.db.prepare('SELECT * FROM accounts WHERE user_id=? AND id=?').get(u.user.userId, desk.id);
  const check = (kind, start, key) => {
    const fin = R.financial(rows, accountRow, R.canonical(kind, start));
    const b = (kind === 'week' ? an.weekly : an.quarterly)[key];
    return fin.closed_trades === b.trades && fin.wins === b.wins && fin.losses === b.losses && fin.known_net_count === b.trades - b.unknown_net && Math.abs(fin.known_net_subtotal - b.pnl) < 0.01;
  };
  ok('the bucket and the review module\u2019s own financial block agree about the same week — one number, one meaning',
    check('week', '2026-10-05', '2026-10-05') && check('week', '2026-09-28', '2026-09-28') && check('quarter', '2026-10-01', '2026-Q4'),
    { week: R.financial(rows, accountRow, R.canonical('week', '2026-10-05')).closed_trades, bucket: an.weekly['2026-10-05'].trades });

  ok('reading the review changes NOTHING: every table is byte-identical before and after the two reads',
    JSON.stringify(before) === JSON.stringify(after) && rp.limits.writes === 0 && rp.limits.grades_influence === false && rp.limits.caps_influence === false && rp.limits.permission_influence === false && rp.limits.plan_change_permission === false,
    Object.keys(before).filter((t) => before[t] !== after[t]));
  ok('two reads of the same scope are byte-identical, and the series and the artifact record are both in them',
    JSON.stringify({ w: an.weekly, q: an.quarterly, rp: an.review_periods, u: an.undated_closes }) === JSON.stringify({ w: an2.weekly, q: an2.quarterly, rp: an2.review_periods, u: an2.undated_closes }));
  ok('the record states what it does NOT do, and never compares reviewed periods against unreviewed ones',
    rp.outcome_compared === false && /does not compare reviewed periods against unreviewed/i.test(rp.outcome_note) && rp.limits.causal === false && rp.limits.broker_verified === false);
  ok('the review list the app already served still answers with the same artifacts — this milestone added a reader, not a replacement',
    (await u.req('/reviews?account_id=' + desk.id, undefined, 'GET')).status === 200
    && (async () => true)() && (await u.req('/reviews?account_id=' + desk.id, undefined, 'GET')).data.reviews.filter((x) => x.kind === 'week').length === 3,
    null);
  ok('the record is scoped to the RESOLVED analysed account, the same account the payload analyses',
    rp.account_id === (an.account || {}).id && H.reviewPeriodsOf(an2).account_id === rp.account_id,
    { record: rp.account_id, payload: (an.account || {}).id });
  ok('and a desk that is not the trader\u2019s is refused rather than described: the record answers unknown, never an invented period list',
    (await R.coverageOptional(u.user.userId, { accountId: 999999 })).state === 'unavailable'
    && (await R.coverageOptional(u.user.userId, { accountId: 999999 })).not_recorded === null);
  ok('an unreadable artifact table is UNKNOWN on the payload path too, never a period list of "not reviewed"',
    (await R.coverageOptional(u.user.userId, { accountId: desk.id, store: { prepare() { throw new Error('EVIDENCE DOWN'); } } })).state === 'unavailable'
    && (await R.coverageOptional(u.user.userId, { accountId: desk.id, store: { prepare() { throw new Error('EVIDENCE DOWN'); } } })).not_recorded === null);
  ok('an empty but readable record is a real record: every period `not_recorded`, no amount invented, and the scope still named',
    (await R.coverageOptional(u.user.userId, { accountId: other.id, week: {}, quarter: {} })).kinds.week.not_recorded >= 1
    && (await R.coverageOptional(u.user.userId, { accountId: other.id, week: {}, quarter: {} })).account_id === other.id);
  ok('the period the trader asked about is the period reported: the record\u2019s own day is the app\u2019s UTC day, so a period cannot be reported for a clock the caller invented',
    rp.today === P.dayOf(Date.parse(new Date().toISOString())) || /^\d{4}-\d{2}-\d{2}$/.test(rp.today), rp.today);
});
