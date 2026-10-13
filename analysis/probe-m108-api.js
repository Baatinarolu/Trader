'use strict';
/** M108 API probe: the real routes, the server-measured timer, the day/period reads and the
 * stored receipts, over HTTP with the frozen UTC clock. */
const H = require('./m108-test-support'), { ok, finish } = H, path = require('path');
const REV = async (req) => (await req('/practice', undefined, 'GET')).data.revision;
const start = async (req, extra = {}, preset = { preset: 'p5' }) => req('/practice/timer', { action: 'start', revision: await REV(req), ...preset, bell_interval_seconds: 60, ambience: 'rain', ...extra });

finish('M108 practice API and server-measured timer', async () => {
  const { req, user, other, otherToken } = await H.start('m108-api');
  const today = H.dayOf(H.now()), T0 = H.now();

  const empty = await req('/practice', undefined, 'GET');
  ok('the practice surface answers with the saved options and an idle timer', empty.status === 200 && empty.data.timer.state === 'idle' && empty.data.presets.length === 5 && empty.data.ambience_options.length === 6 && empty.data.bell_intervals.length === 5 && empty.data.toolkit.length === 7, empty.data);
  ok('an empty day is unrecorded and is not a failure', empty.data.state === 'unrecorded' && /not a failure/.test(empty.data.message) && empty.data.sessions_count === 0 && empty.data.recorded_seconds === 0);
  ok('no length, ambience or intention is preselected on an idle timer', empty.data.timer.preset === null && empty.data.timer.target_seconds === null && empty.data.timer.ambience === null && empty.data.timer.intention === null);
  ok('the payload claims no state, no effect and no authority', empty.data.timer.actual_meditation_verified === false && empty.data.timer.authority === 'none' && empty.data.authority === 'none' && /no such effect is claimed/.test(empty.data.basis), empty.data.basis);

  ok('starting without a saved preset or h/m/s is refused', (await req('/practice/timer', { action: 'start', revision: empty.data.revision, bell_interval_seconds: 0, ambience: 'none' })).status === 400);
  const money = await start(req, { intention: 'Today I’m going to make $5,000 from the market' });
  ok('a money target is refused as a practice intention too, and nothing is written', money.status === 400 && money.data.code === 'practice_outcome_target' && (await req('/practice', undefined, 'GET')).data.timer.state === 'idle', money.data);
  ok('no caller clock, owner, account or elapsed time is accepted', (await start(req, { now: H.now() })).status === 400 && (await start(req, { account_id: user.accountId })).status === 400 && (await start(req, { elapsed_ms: 600000 })).status === 400 && (await start(req, { user_id: 99 })).status === 400);
  ok('a stale revision is a conflict, not a write', (await req('/practice/timer', { action: 'start', preset: 'p5', bell_interval_seconds: 0, ambience: 'none', revision: 'b'.repeat(64) })).status === 409);

  const started = await start(req, { intention: 'Today I will pause before the second trade' });
  ok('a saved preset starts a running timer at zero on the server’s clock', started.status === 200 && started.data.timer.state === 'running' && started.data.timer.elapsed_ms === 0 && started.data.timer.target_seconds === 300 && started.data.timer.elapsed_source === 'server_running_time', started.data.timer);
  ok('the chosen ambience is recorded as the trader’s declaration and never as playback', started.data.timer.ambience === 'rain' && started.data.timer.ambience_played_by_this_app === false && /never played|no ambient audio/.test(started.data.timer.ambience_note));
  ok('the optional intention is kept unverified, not labelled process-oriented', started.data.timer.intention === 'Today I will pause before the second trade' && started.data.timer.framing === 'unverified_free_text' && /not_process_verified/.test(started.data.timer.warnings.join(' ')), started.data.timer.warnings);
  ok('a second start is refused while a session is open', (await start(req, {}, { preset: 'p10' })).status === 409);

  H.setNow(H.now() + 120000);
  const running = (await req('/practice', undefined, 'GET')).data;
  ok('the running time is measured by the server, not reported by the caller', running.timer.elapsed_ms === 120000 && running.timer.state === 'running');
  ok('bell markers are elapsed-time marks inside the measured time', JSON.stringify(running.timer.bells) === JSON.stringify([60, 120]));

  const paused = await req('/practice/timer', { action: 'pause', revision: running.revision });
  ok('pause keeps the measured running time and counts one pause', paused.status === 200 && paused.data.timer.state === 'paused' && paused.data.timer.elapsed_ms === 120000 && paused.data.timer.pause_count === 1);
  H.setNow(H.now() + 300000);
  const stillPaused = (await req('/practice', undefined, 'GET')).data;
  ok('a paused gap is not counted as practice', stillPaused.timer.elapsed_ms === 120000 && stillPaused.timer.state === 'paused');
  const resumed = await req('/practice/timer', { action: 'resume', revision: stillPaused.revision });
  ok('resume restarts the running clock without losing the earlier running time', resumed.status === 200 && resumed.data.timer.state === 'running' && resumed.data.timer.elapsed_ms === 120000);

  H.setNow(H.now() + 300000);
  const done = await req('/practice/timer', { action: 'complete', revision: (await req('/practice', undefined, 'GET')).data.revision, note: 'kept as written' });
  ok('completing writes one receipt with the server-measured running time', done.status === 200 && done.data.sessions_count === 1 && done.data.sessions[0].elapsed_ms === 420000 && done.data.sessions[0].elapsed_source === 'server_running_time' && done.data.sessions[0].pause_count === 1, done.data.sessions[0]);
  ok('the receipt carries the chosen length, the declaration and the note', done.data.sessions[0].preset === 'p5' && done.data.sessions[0].target_seconds === 300 && done.data.sessions[0].ambience === 'rain' && done.data.sessions[0].ambience_played_by_this_app === false && done.data.sessions[0].note === 'kept as written');
  ok('reaching the chosen length is a fact, and no effect is claimed about it', done.data.sessions[0].reached_target === true && done.data.sessions[0].actual_meditation_verified === false && done.data.sessions[0].authority === 'none');
  ok('the day totals are the recorded sessions and their measured seconds', done.data.state === 'recorded' && done.data.sessions_count === 1 && done.data.recorded_seconds === 420);
  ok('nothing is carried over once the session is complete', done.data.timer.state === 'idle' && done.data.timer.preset === null && done.data.timer.target_seconds === null && done.data.timer.ambience === null && done.data.timer.intention === null && done.data.timer.elapsed_ms === 0);

  const history = await req('/practice/history', undefined, 'GET');
  ok('history is readonly and keeps the recorded receipt', history.status === 200 && history.data.readonly === true && history.data.records.length === 1 && history.data.records[0].elapsed_ms === 420000 && history.data.records[0].state === 'recorded');
  const period = await req(`/practice/progress?from=${today}&to=${today}`, undefined, 'GET');
  ok('progress counts records, never results', period.status === 200 && period.data.sessions_count === 1 && period.data.recorded_seconds === 420 && period.data.days_with_recorded_session === 1 && period.data.consecutive_days_with_a_recorded_session_ending_on_to === 1, period.data);
  ok('progress has no target, no score and says so', period.data.target === null && period.data.score === null && period.data.counts_are_records_only === true && /progress_are_records_not_results/.test(period.data.warnings.join(' ')));
  ok('progress is bounded and ordered', (await req(`/practice/progress?from=${today}&to=2026-10-12`, undefined, 'GET')).status === 400 && (await req('/practice/progress?from=nope&to=' + today, undefined, 'GET')).status === 400);

  const early = await req('/practice/timer', { action: 'start', revision: (await req('/practice', undefined, 'GET')).data.revision, hours: 0, minutes: 10, seconds: 0, bell_interval_seconds: 0, ambience: 'none' });
  ok('a custom h/m/s length is accepted and labelled custom', early.status === 200 && early.data.timer.preset === 'custom' && early.data.timer.target_seconds === 600);
  H.setNow(H.now() + 60000);
  const short = await req('/practice/timer', { action: 'complete', revision: (await req('/practice', undefined, 'GET')).data.revision });
  ok('completing early is recorded as it happened, with no failure label', short.status === 200 && short.data.sessions.length === 2 && short.data.sessions[1].reached_target === false && short.data.sessions[1].elapsed_ms === 60000 && !/fail/i.test(JSON.stringify(short.data.sessions[1])));
  ok('the second record of the day is a second version, both retained', short.data.sessions[0].version === 1 && short.data.sessions[1].version === 2 && short.data.sessions[1].preset === 'custom');

  const beforeCancel = (await req('/practice/history', undefined, 'GET')).data.records.length;
  await start(req, {}, { preset: 'p5' });
  H.setNow(H.now() + 30000);
  const cancelled = await req('/practice/timer', { action: 'cancel', revision: (await req('/practice', undefined, 'GET')).data.revision });
  ok('cancel writes no session at all', cancelled.status === 200 && cancelled.data.timer.state === 'idle' && (await req('/practice/history', undefined, 'GET')).data.records.length === beforeCancel, cancelled.data.timer);
  ok('completing or cancelling with nothing open is refused', (await req('/practice/timer', { action: 'complete', revision: await REV(req) })).status === 409 && (await req('/practice/timer', { action: 'cancel', revision: await REV(req) })).status === 409);

  await start(req, {}, { preset: 'p5' });
  H.setNow(H.now() + 25 * 3600000);
  const abandoned = await req('/practice/timer', { action: 'complete', revision: (await req('/practice', undefined, 'GET')).data.revision });
  ok('a timer open for more than 24 hours cannot be completed as one session', abandoned.status === 409 && /more than 24 hours/.test(abandoned.data.error) && /Cancel it instead/.test(abandoned.data.error), abandoned.data);
  ok('cancelling that abandoned timer writes nothing and claims nothing', (await req('/practice/timer', { action: 'cancel', revision: (await req('/practice', undefined, 'GET')).data.revision })).status === 200 && (await req('/practice/history', undefined, 'GET')).data.records.length === beforeCancel);

  const future = await req('/practice?date=2099-01-01', undefined, 'GET');
  ok('a day that has not happened is refused at the day surface', future.status === 400 && /future UTC day cannot be read/.test(future.data.error), future.data);
  ok('a malformed day is refused at the day surface', (await req('/practice?date=2026-13-01', undefined, 'GET')).status === 400 && (await req('/practice/history?date=notaday', undefined, 'GET')).status === 400);

  /* Back onto the day the two sessions were recorded: the consumer views are day views. */
  H.setNow(T0 + 900000);
  const foreign = await req('/practice', undefined, 'GET', otherToken);
  ok('another trader sees an unrecorded day, never these records', foreign.status === 200 && foreign.data.sessions_count === 0 && foreign.data.timer.state === 'idle');
  ok('another trader starting a session does not touch this trader’s records', (await req('/practice/timer', { action: 'start', revision: foreign.data.revision, preset: 'p60', bell_interval_seconds: 0, ambience: 'white_noise' }, 'POST', otherToken)).status === 200 && (await req('/practice', undefined, 'GET')).data.sessions_count === 2);

  const briefing = await req('/briefing?account_id=' + user.accountId, undefined, 'GET');
  ok('the briefing carries the practice day view with no authority', briefing.status === 200 && briefing.data.practice && briefing.data.practice.authority === 'none' && briefing.data.practice.sessions_count === 2 && briefing.data.practice.timer.state === 'idle');
  const day = await req('/journal/' + today + '?account_id=' + user.accountId, undefined, 'GET');
  ok('the journal day carries that day’s practice records only', day.status === 200 && day.data.practice && day.data.practice.day === today && day.data.practice.sessions_count === 2);
  const otherDay = await req('/journal/2026-10-12?account_id=' + user.accountId, undefined, 'GET');
  ok('another day shows nothing recorded, never today’s sessions', otherDay.status === 200 && otherDay.data.practice.sessions_count === 0 && otherDay.data.practice.state === 'unrecorded');

  const beforeTrade = await req('/trades', H.body(user), 'POST');
  const afterTrade = await req('/trades', H.body(user), 'POST');
  ok('practice state never appears in a trade refusal: it is not a gate', JSON.stringify(beforeTrade) === JSON.stringify(afterTrade) || (beforeTrade.status === afterTrade.status && !/practice/i.test(JSON.stringify(beforeTrade.data))), { beforeTrade: beforeTrade.status, afterTrade: afterTrade.status });

  const exported = await req('/export/json', undefined, 'GET');
  ok('the backup carries the practice records', exported.status === 200 && exported.data.practice_sessions && exported.data.practice_sessions.version === 1 && exported.data.practice_sessions.records.length === 2, exported.data.practice_sessions);
  const imported = await req('/import/json', { data: { trades: [], accounts: [], practice_sessions: { version: 1, records: [{ id: 9, day: '2026-09-30', preset: 'p15', target_seconds: 900, elapsed_ms: 900000, pause_count: 0, bell_interval_seconds: 300, ambience: 'ocean', intention: 'Today I will journal every trade', note: 'restored', recorded_at: '2026-09-30T06:00:00.000Z' }] } } });
  ok('a restored archive is accepted as an archive', imported.status === 200 && /practice_warnings/.test(JSON.stringify(imported.data)), imported.data);
  const afterImport = (await req('/practice', undefined, 'GET')).data;
  ok('a restored archive never becomes this trader’s recorded session', afterImport.sessions_count === 2 && afterImport.sessions.every((s) => s.state === 'recorded') && (await req('/practice/history', undefined, 'GET')).data.records.some((r) => r.state === 'imported_unverified' && r.day === '2026-09-30' && r.intention === 'Today I will journal every trade'));
  const periodAfter = await req(`/practice/progress?from=2026-09-01&to=${today}`, undefined, 'GET');
  ok('progress counts the archive separately and never merges it in', periodAfter.data.sessions_count === 2 && periodAfter.data.imported_count === 1 && periodAfter.data.recorded_seconds === 480, periodAfter.data);

  const db = H.D.db;
  const rows = await db.prepare('SELECT * FROM practice_sessions WHERE user_id=?').all(user.userId);
  ok('two receipts and one archive are stored under this trader', rows.length === 3 && rows.filter((r) => r.source === 'human_declared').length === 2);
  let immutable = null; try { await db.prepare('UPDATE practice_sessions SET elapsed_ms=999999 WHERE user_id=? AND version=1').run(user.userId); } catch (e) { immutable = e.message; }
  ok('a recorded session cannot be edited in place', /immutable/i.test(String(immutable)), immutable);
  let reDated = null; try { await db.prepare("UPDATE practice_sessions SET day='2026-01-01' WHERE user_id=? AND version=1").run(user.userId); } catch (e) { reDated = e.message; }
  ok('a recorded session cannot be re-dated', /immutable/i.test(String(reDated)));
  await db.prepare('DELETE FROM users WHERE id=?').run(user.userId);
  ok('deleting the trader removes their practice records with them', (await db.prepare('SELECT COUNT(*) n FROM practice_sessions WHERE user_id=?').get(user.userId)).n === 0 && (await db.prepare('SELECT COUNT(*) n FROM practice_timers WHERE user_id=?').get(user.userId)).n === 0);
});
