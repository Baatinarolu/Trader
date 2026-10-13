'use strict';
/**
 * M13/M65 pure probe: the calendar ruler, the two series and the coverage arithmetic — no HTTP, no
 * database. What is measured is what a review period can get WRONG: a week that does not start on
 * Monday, a quarter that starts in the wrong month, a boundary that disagrees with the arithmetic
 * the review artifacts and the rule-change advisory already use, a bucket that reads a missing
 * number as zero, a close with no clock that lands in a week anyway, and a period record that calls
 * "no artifact saved" a period that was not reviewed.
 */
const H = require('./m13-test-support'), { ok } = H;
const P = H.mod('src/periods'), S = H.mod('src/performance'), R = H.mod('src/period-reviews'), RC = H.mod('src/rule-changes');

H.finish('M13/M65 pure: the review calendar, its series and the artifact record', async () => {
  if (!H.shipped(P, 'the M13/M65 calendar ruler (src/periods.js)')) return;

  /* ---------------------------------------------------------------- 1. the ruler itself */
  ok('the ruler is a leaf: it requires nothing, so it cannot inherit a schema or a clock from anywhere',
    !/require\(/.test(require('fs').readFileSync(require('path').join(H.APP, 'src/periods.js'), 'utf8')), 'requires found');
  ok('Monday-start weeks: every day of one week resolves to the same Monday, and the next Monday opens the next week',
    ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].every((d) => P.startOf('week', d) === '2026-10-12')
    && ['2026-10-19', '2026-10-25'].every((d) => P.startOf('week', d) === '2026-10-19'), ['2026-10-12', '2026-10-19']);
  ok('the week is half-open and whole: [Monday, next Monday) with last_day the Sunday before it',
    JSON.stringify([P.period('week', '2026-10-14').start, P.period('week', '2026-10-14').end, P.period('week', '2026-10-14').last_day]) === JSON.stringify(['2026-10-12', '2026-10-19', '2026-10-18']));
  ok('a week that crosses a year boundary is still one week and still Monday-start, and its prior week is adjacent',
    P.period('week', '2026-01-01').start === '2025-12-29' && P.period('week', '2026-01-01').end === '2026-01-05' && P.period('week', '2026-01-01').previous_start === '2025-12-22' && P.period('week', '2025-12-22').end === P.period('week', '2026-01-01').start, P.period('week', '2026-01-01'));
  ok('quarters are calendar quarters: the start is the first of Jan/Apr/Jul/Oct and the prior quarter is adjacent',
    ['2026-01-01:2026-01-01', '2026-03-31:2026-01-01', '2026-04-01:2026-04-01', '2026-09-30:2026-07-01', '2026-10-01:2026-10-01', '2026-12-31:2026-10-01'].every((pair) => { const [day, start] = pair.split(':'); const p = P.period('quarter', day); return p.start === start && p.end === P.period('quarter', day === start ? day : start).end; })
    && P.period('quarter', '2026-01-01').previous_start === '2025-10-01' && P.period('quarter', '2026-10-01').previous_start === '2026-07-01', P.period('quarter', '2026-10-01'));
  ok('months and years are whole calendars too, February 29 included',
    P.period('month', '2024-02-29').start === '2024-02-01' && P.period('month', '2024-02-29').last_day === '2024-02-29' && P.period('month', '2026-12-31').end === '2027-01-01'
    && P.period('year', '2026-10-12').start === '2026-01-01' && P.period('year', '2026-10-12').last_day === '2026-12-31');
  ok('every period states its own calendar basis, so a bucket cannot be read on an unstated clock',
    H.M13_VERSION === P.VERSION && P.KINDS.join(',') === 'week,month,quarter,year' && /APP/.test(P.PERIOD_BASIS) && /UTC/.test(P.PERIOD_BASIS) && /Monday/.test(P.PERIOD_BASIS) && P.KINDS.every((k) => /APP/.test(P.period(k, '2026-10-12').basis)));
  ok('a period is addressed by its canonical start only: a mid-week or mid-quarter address is refused, never rounded',
    (() => { let bad = 0; for (const [k, d] of [['week', '2026-10-13'], ['month', '2026-10-02'], ['quarter', '2026-05-01'], ['year', '2026-02-01']]) { try { P.canonical(k, d); } catch (e) { bad += e.code === 'periods_invalid' ? 1 : 0; } } return bad === 4; })()
    && P.canonical('week', '2026-10-12').start === '2026-10-12');
  ok('a day that is not a real calendar day is refused rather than parsed into a nearby one',
    (() => { let bad = 0; for (const d of ['2026-02-30', '2026-13-01', '202-10-12', '2026-10-12T00:00:00Z', '', null, 20261012, {}]) { try { P.dayKey(d); } catch (e) { bad += e.code === 'periods_invalid' ? 1 : 0; } } return bad === 8; })());
  ok('the bucket key is the period symbol, and a quarter key is the shape a reader can address back',
    P.bucketOf('week', '2026-10-11') === '2026-10-05' && P.bucketOf('month', '2026-10-13') === '2026-10' && P.bucketOf('quarter', '2026-10-13') === '2026-Q4' && P.bucketOf('year', '2026-10-13') === '2026'
    && P.bucketOf('quarter', '2026-03-31') === '2026-Q1' && P.bucketOf('quarter', '2026-01-01') === '2026-Q1', [P.bucketOf('quarter', '2026-10-13'), P.bucketOf('quarter', '2026-03-31')]);
  ok('a sequence is the canonical periods ending at the asked-for period, newest first, each one whole',
    (() => { const seq = P.sequence('week', '2026-10-12', 4); return seq.length === 4 && seq[0].start === '2026-10-12' && seq[3].start === '2026-09-21' && seq.every((p, i) => i === 0 || seq[i - 1].previous_start === p.start); })()
    && P.sequence('quarter', '2026-10-01', 3).map((p) => p.start).join(',') === '2026-10-01,2026-07-01,2026-04-01');
  ok('a sequence is bounded rather than unbounded, so a caller cannot ask for a window it cannot read',
    (() => { let bad = 0; for (const n of [0, -1, 521, 1.5, '12']) { try { P.sequence('week', '2026-10-12', n); } catch (e) { bad += e.code === 'periods_invalid' ? 1 : 0; } } return bad === 5; })()
    && P.label('quarter', '2026-10-01') === 'Q4 2026' && P.label('week', '2026-10-12') === 'Week of 2026-10-12' && P.label('month', '2026-09-01') === 'September 2026' && P.label('year', '2026-01-01') === '2026');

  /* ------------------------------------- 2. ONE ruler: the reviews and the advisory already use it */
  ok('the review module re-exports the SAME ruler, so a review period and a bucket cannot be computed twice',
    P.KINDS.every((k) => ['2026-01-01', '2026-03-31', '2026-06-15', '2026-10-12', '2026-12-31', '2024-02-29'].every((d) => JSON.stringify(R.period(k, d)) === JSON.stringify(P.period(k, d)))));
  ok('the review module keeps its OWN error code and wording, so the contract its routes and probes use is unchanged',
    (() => { try { R.canonical('week', '2026-10-13'); return false; } catch (e) { return e.code === 'period_review_invalid' && e.message === 'Use the displayed canonical period start.'; } })()
    && (() => { try { R.period('day', '2026-10-12'); return false; } catch (e) { return e.code === 'period_review_invalid' && e.message === 'Choose week, month, quarter or year.'; } })());
  ok('the quarterly rule-change advisory agrees with the ruler on every day of three years — measured, not assumed',
    (() => {
      const mismatches = [];
      for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += 86400000) {
        const advisory = RC.quarter(t).start, ruler = P.period('quarter', P.dayOf(t)).start;
        if (advisory !== ruler) mismatches.push([t, advisory, ruler]);
      }
      return mismatches.length === 0;
    })(), 'a quarter boundary disagreed between src/rule-changes.js and src/periods.js');

  /* ------------------------------------------------------------------------- 3. the two series */
  const t = (closedAt, net, r) => ({ id: Math.round(Date.parse(closedAt) / 1000), status: 'closed', closed_at: closedAt, net_pnl: net, r_multiple: r, risk_amount: 10 });
  const weekly = S.weeklySeries, quarterly = S.quarterlySeries;
  ok('the series bucket on the REVIEW calendar: a UTC close-day decides the week, not the trade order',
    Object.keys(weekly([t('2026-10-05T00:00:00.000Z', 10, 1), t('2026-10-11T23:59:59.000Z', 20, 2), t('2026-10-12T00:00:00.000Z', 30, 3)])).join(',') === '2026-10-05,2026-10-12', Object.keys(weekly([t('2026-10-05T00:00:00.000Z', 10, 1), t('2026-10-11T23:59:59.000Z', 20, 2), t('2026-10-12T00:00:00.000Z', 30, 3)])));
  ok('a bucket is a whole period with its own range, its own trade count, its own days and its own win rate',
    (() => { const b = weekly([t('2026-10-05T09:00:00.000Z', 100, 1), t('2026-10-05T15:00:00.000Z', -50, -0.5), t('2026-10-07T09:00:00.000Z', 0, 0)])['2026-10-05'];
      return b.trades === 3 && b.wins === 1 && b.losses === 1 && b.breakeven === 1 && b.pnl === 50 && b.days === 2 && b.start === '2026-10-05' && b.end === '2026-10-12' && Math.abs(b.win_rate - 33.33) < 0.01 && /review calendar/.test(b.basis); })());
  ok('a close with no recorded amount is NOT a zero: the bucket reports no recorded amount and counts the close',
    (() => { const b = weekly([t('2026-10-05T09:00:00.000Z', null, null)])['2026-10-05']; return b.pnl === null && b.r === null && b.unknown_net === 1 && b.unknown_r === 1 && b.win_rate === null; })()
    && (() => { const b = weekly([t('2026-10-05T09:00:00.000Z', null, null), t('2026-10-06T09:00:00.000Z', 40, 1)])['2026-10-05']; return b.pnl === 40 && b.unknown_net === 1 && b.win_rate === 100 && b.trades === 2; })(), 'an unreported close must not read as a loss and must not be dropped');
  ok('a close with no clock at all is skipped by the series rather than guessed into a week',
    Object.keys(weekly([{ id: 1, status: 'closed', closed_at: null, net_pnl: 10, r_multiple: 1 }, { id: 2, status: 'closed', closed_at: '2026-10-05T09:00:00.000Z', net_pnl: 10, r_multiple: 1 }])).join(',') === '2026-10-05');
  ok('quarters roll over on the calendar quarter, and a bucket never spans two of them',
    Object.keys(quarterly([t('2026-09-30T23:00:00.000Z', 1, 1), t('2026-10-01T00:00:00.000Z', 2, 2)])).join(',') === '2026-Q3,2026-Q4'
    && quarterly([t('2026-10-01T00:00:00.000Z', 2, 2)])['2026-Q4'].last_day === '2026-12-31');
  ok('the buckets are ordered oldest first, so a reader can read a period series without re-sorting it',
    Object.keys(quarterly([t('2027-01-05T09:00:00.000Z', 1, 1), t('2026-10-05T09:00:00.000Z', 1, 1), t('2026-04-05T09:00:00.000Z', 1, 1)])).join(',') === '2026-Q2,2026-Q4,2027-Q1');
  ok('an empty series is an empty object, never a zero-filled calendar of periods nothing happened in',
    Object.keys(weekly([])).length === 0 && Object.keys(quarterly([])).length === 0);
  ok('two rulers, both labelled, and neither converts a trade into the other: the same instant is a different week on the journal clock',
    (() => {
      const at = '2026-10-04T23:30:00.000Z';                 // Sunday 23:30 UTC
      const utcWeek = P.bucketOf('week', P.dayOf(Date.parse(at)));              // the review ruler
      const plusTwo = new Date(Date.parse(at) + 2 * 3600000).toISOString().slice(0, 10);
      const journalWeek = P.bucketOf('week', plusTwo);                          // a UTC+2 journal clock
      return utcWeek === '2026-09-28' && journalWeek === '2026-10-05';
    })(), 'the divergence this milestone labels must be real, or the warning is decoration');

  /* ------------------------------------------------------------- 4. the artifact record (pure) */
  const row = (kind, start, version, status, source, recordedAt) => ({ id: version + (start.length), user_id: 1, account_id: 2, account_key: 2, period_kind: kind, period_start: start, period_end: P.period(kind, start).end, version, template_version: R.VERSION, status, answers_json: JSON.stringify({ worked_and_why: 'x' }), focus: 'Declared focus', followup_json: null, metrics_json: JSON.stringify({ financial: { closed_trades: 0 } }), context_hash: 'a'.repeat(64), source, recorded_at: recordedAt || '2026-10-13T09:00:00.000Z', amendment: null });
  const cover = (rows, series = {}, today = '2026-10-13') => R.coverageOf({ userId: 1, accountId: 2, rows, series, today });
  const empty = cover([]);
  ok('a period with no saved artifact is `not_recorded`, with the meaning spelled out — not "missed", not a clean record',
    empty.state === 'available' && empty.kinds.week.periods.every((p) => p.review_state === 'not_recorded') && /not evidence that no review happened/i.test(empty.kinds.week.not_recorded_meaning)
    && empty.kinds.week.not_recorded === 11 && empty.kinds.week.open_periods === 1, [empty.kinds.week.not_recorded, empty.kinds.week.open_periods]);
  ok('the period still running is counted as open rather than as a period that was not reviewed',
    empty.kinds.week.periods[0].start === '2026-10-12' && empty.kinds.week.periods[0].finished === false && empty.kinds.week.periods[1].finished === true);
  ok('a saved artifact is joined by its canonical period start and reported as `completed` with its own receipt',
    (() => { const c = cover([row('week', '2026-10-05', 1, 'completed', 'human_review')]); const p = c.kinds.week.periods.find((x) => x.start === '2026-10-05'); return p.review_state === 'completed' && p.review_source === 'human_review' && p.review_recorded_at === '2026-10-13T09:00:00.000Z' && p.review_focus === 'Declared focus' && c.kinds.week.completed === 1 && c.kinds.week.not_recorded === 10; })());
  ok('a draft is a draft: it is never counted as a completed review',
    (() => { const c = cover([row('week', '2026-10-05', 1, 'draft', 'human_review')]); return c.kinds.week.draft === 1 && c.kinds.week.completed === 0 && c.kinds.week.periods.find((x) => x.start === '2026-10-05').review_state === 'draft'; })());
  ok('an imported copy is labelled unverified and is never counted as the trader\u2019s own completed review',
    (() => { const c = cover([row('week', '2026-10-05', 1, 'imported', 'imported_unverified')]); return c.kinds.week.imported_unverified === 1 && c.kinds.week.completed === 0 && c.kinds.week.periods.find((x) => x.start === '2026-10-05').review_state === 'imported_unverified'; })());
  ok('an unreadable artifact row is reported as unavailable rather than as a period with no review',
    (() => { const bad = { ...row('week', '2026-10-05', 1, 'completed', 'human_review'), period_end: '2026-10-19', context_hash: 'nope' }; const c = cover([bad]); return c.kinds.week.unavailable_rows === 1 && c.kinds.week.periods.find((x) => x.start === '2026-10-05').review_state === 'unavailable'; })());
  ok('the LATEST saved version of a period is the one reported, the way the review module reads its own history',
    (() => { const c = cover([row('week', '2026-10-05', 1, 'draft', 'human_review'), row('week', '2026-10-05', 2, 'completed', 'human_review', '2026-10-12T09:00:00.000Z')]); const p = c.kinds.week.periods.find((x) => x.start === '2026-10-05'); return p.review_state === 'completed' && p.review_version === 2 && c.kinds.week.completed === 1 && c.kinds.week.draft === 0; })());
  ok('another account\u2019s artifact and another owner\u2019s row are not joined into this record',
    (() => { const foreign = { ...row('week', '2026-10-05', 1, 'completed', 'human_review'), account_key: 9, account_id: 9 }; const other = { ...row('week', '2026-10-05', 1, 'completed', 'human_review'), user_id: 7 }; const c = cover([foreign, other]); return c.kinds.week.completed === 0 && c.kinds.week.rows_scanned === 0; })());
  ok('an artifact whose stored start is not a canonical period start is COUNTED as outside the window rather than silently invisible',
    (() => { const c = cover([row('week', '2026-10-05', 1, 'completed', 'human_review'), { ...row('week', '2026-10-05', 1, 'completed', 'human_review'), id: 99, period_start: '2026-10-04' }]); return c.kinds.week.artifacts_outside_scope === 1 && c.kinds.week.rows_scanned === 2; })());
  ok('the recorded amounts are the period\u2019s own: a week with two closes reports them, a week with none reports no amount',
    (() => { const series = { week: { '2026-10-05': { start: '2026-10-05', end: '2026-10-12', trades: 2, wins: 1, losses: 1, pnl: 60, r: 1, win_rate: 50, unknown_net: 0, unknown_r: 0, days: 2 } } };
      const c = cover([row('week', '2026-10-05', 1, 'completed', 'human_review')], series);
      const withTrades = c.kinds.week.periods.find((x) => x.start === '2026-10-05'), without = c.kinds.week.periods.find((x) => x.start === '2026-09-28');
      return withTrades.trades === 2 && withTrades.pnl === 60 && withTrades.win_rate === 50 && without.trades === 0 && without.pnl === null && without.r === null && without.win_rate === null; })(),
    'a bucket joined on anything but its own `start` would show every period as having no closes');
  ok('a bucket is joined by its own `start`, so a QUARTER bucket \u2014 whose key is `2026-Q4`, not a date \u2014 still reaches its period',
    (() => { const series = { quarter: { '2026-Q4': { start: '2026-10-01', end: '2027-01-01', trades: 3, wins: 2, losses: 1, pnl: 100, r: 3, win_rate: 66.67, unknown_net: 0, unknown_r: 0, days: 3 } } };
      const c = cover([row('quarter', '2026-10-01', 1, 'completed', 'human_review')], series);
      const q = c.kinds.quarter.periods.find((x) => x.start === '2026-10-01'), other = c.kinds.quarter.periods.find((x) => x.start === '2026-07-01');
      return q.trades === 3 && q.pnl === 100 && q.win_rate === 66.67 && q.review_state === 'completed' && other.trades === 0 && other.pnl === null; })(),
    'joining on the bucket KEY silently drops every quarter: the key is `YYYY-Qn` while the period start is a date');
  ok('quarterly coverage is the same arithmetic on the quarterly ruler, over its own window',
    empty.kinds.quarter.periods.length === 8 && empty.kinds.quarter.periods[0].start === '2026-10-01' && empty.kinds.quarter.periods.map((p) => p.start).join(',') === '2026-10-01,2026-07-01,2026-04-01,2026-01-01,2025-10-01,2025-07-01,2025-04-01,2025-01-01');
  ok('the record is read-only and states what it does not do: no write, no grade/cap/permission influence, no reviewed-vs-unreviewed comparison',
    empty.limits.read_only === true && empty.limits.writes === 0 && empty.limits.grades_influence === false && empty.limits.caps_influence === false && empty.limits.permission_influence === false && empty.limits.plan_change_permission === false && empty.outcome_compared === false && /does not compare reviewed periods against unreviewed/i.test(empty.outcome_note));
  ok('an unreadable record is UNKNOWN, never a period list full of "not reviewed"',
    (() => { const u = R.coverageUnavailable(); return u.state === 'unavailable' && u.not_recorded === null && u.kinds && Object.keys(u.kinds).length === 0 && /not a period with no review/.test(u.reason); })());
  ok('sampling the pure record against the shipped routes\u2019 error contract: a bad owner or account is refused, not defaulted',
    (() => { let bad = 0; for (const args of [{ userId: 0 }, { userId: 'x' }]) { try { R.coverageOf(args); } catch (e) { bad += e.code === 'period_review_invalid' ? 1 : 0; } } return bad === 2; })());
});
