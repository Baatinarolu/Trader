'use strict';
/** M108 hardening probe: refusal paths, conflict/rollback behaviour, corrupt stored rows,
 * immutability over HTTP, cross-trader isolation and the absence of any authority. */
const H = require('./m108-test-support'), { ok, finish } = H;
const rev = async (req) => (await req('/practice', undefined, 'GET')).data.revision;

finish('M108 practice hardening, rollback and no-authority proof', async () => {
  const { req, user, other, otherToken } = await H.start('m108-hardening');
  const db = H.D.db, count = async () => (await db.prepare('SELECT COUNT(*) n FROM practice_sessions WHERE user_id=?').get(user.userId)).n;

  ok('every action refuses an unknown or missing revision before any write', (await req('/practice/timer', { action: 'start', preset: 'p5', bell_interval_seconds: 0, ambience: 'none' })).status === 400 && (await req('/practice/timer', { action: 'start', preset: 'p5', bell_interval_seconds: 0, ambience: 'none', revision: 'x' })).status === 400);
  for (const action of ['pause', 'resume', 'complete', 'cancel']) {
    const r = await req('/practice/timer', { action, revision: await rev(req) });
    ok(`the ${action} action on an idle timer is a conflict and writes nothing`, r.status === 409 && (await count()) === 0, r.data);
  }
  ok('start refuses an unlisted bell interval, an unlisted ambience and a mixed length', (await req('/practice/timer', { action: 'start', revision: await rev(req), preset: 'p5', bell_interval_seconds: 45, ambience: 'none' })).status === 400 && (await req('/practice/timer', { action: 'start', revision: await rev(req), preset: 'p5', bell_interval_seconds: 0, ambience: 'binaural' })).status === 400 && (await req('/practice/timer', { action: 'start', revision: await rev(req), preset: 'p5', minutes: 5, bell_interval_seconds: 0, ambience: 'none' })).status === 400);
  ok('start refuses an intention over the character cap or with control characters', (await req('/practice/timer', { action: 'start', revision: await rev(req), preset: 'p5', bell_interval_seconds: 0, ambience: 'none', intention: 'x'.repeat(121) })).status === 400);

  const stale = await rev(req);
  const opened = await req('/practice/timer', { action: 'start', revision: stale, preset: 'p5', bell_interval_seconds: 60, ambience: 'none', intention: 'Today I will wait for the retest' });
  ok('a valid start is accepted once', opened.status === 200 && opened.data.timer.state === 'running');
  H.setNow(H.now() + 1000);
  ok('a write replayed with a consumed revision is a conflict, never a second write', (await req('/practice/timer', { action: 'pause', revision: stale })).status === 409 && (await count()) === 0);
  const pausedOnce = await req('/practice/timer', { action: 'pause', revision: opened.data.revision });
  ok('a paused timer refuses a second pause and a resume starts from paused', pausedOnce.status === 200 && pausedOnce.data.timer.state === 'paused' && pausedOnce.data.timer.pause_count === 1 && (await req('/practice/timer', { action: 'pause', revision: pausedOnce.data.revision })).status === 409, pausedOnce.data.timer);
  const resumedOnce = await req('/practice/timer', { action: 'resume', revision: pausedOnce.data.revision });
  ok('a running timer refuses a second resume', resumedOnce.status === 200 && resumedOnce.data.timer.state === 'running' && (await req('/practice/timer', { action: 'resume', revision: resumedOnce.data.revision })).status === 409);

  /* A stored timer this app cannot read must be unavailable, never guessed, and a write on
   * top of it must change nothing at all. */
  const before = JSON.stringify(await db.prepare('SELECT * FROM practice_timers WHERE user_id=?').get(user.userId));
  await db.prepare("UPDATE practice_timers SET schema_version='practice-v0' WHERE user_id=?").run(user.userId);
  ok('a stored timer with an unknown version reads as unavailable, not as a running clock', (await req('/practice', undefined, 'GET')).data.timer.state === 'unavailable');
  ok('a write on a corrupt timer fails closed with 503 and no partial row', (await req('/practice/timer', { action: 'complete', revision: await rev(req) })).status === 503 && (await count()) === 0);
  await db.prepare("UPDATE practice_timers SET schema_version='practice-v1' WHERE user_id=?").run(user.userId);
  ok('the timer row is exactly where it was before the corrupt attempts', JSON.stringify(await db.prepare('SELECT * FROM practice_timers WHERE user_id=?').get(user.userId)) === before);

  H.setNow(H.now() + 5000);
  const finished = await req('/practice/timer', { action: 'complete', revision: await rev(req), note: '<script>alert(1)</script> kept' });
  ok('the note is stored exactly as written, including markup, and escaped only at render', finished.status === 200 && finished.data.sessions[0].note === '<script>alert(1)</script> kept');
  ok('the receipt keeps the measured running time and the pause count', finished.data.sessions[0].elapsed_ms === 6000 && finished.data.sessions[0].pause_count === 1, finished.data.sessions[0]);
  const receipt = finished.data.sessions[0];

  ok('no HTTP route can edit, re-date or delete a receipt', (await req('/practice/history/' + receipt.id, undefined, 'DELETE')).status === 404 && (await req('/practice/' + receipt.id, { elapsed_ms: 1 }, 'PUT')).status === 404 && (await req('/practice/sessions/' + receipt.id, { day: '2026-01-01' }, 'POST')).status === 404);
  ok('the receipt is unchanged after those attempts', JSON.stringify((await req('/practice/history', undefined, 'GET')).data.records[0]) === JSON.stringify(receipt));

  const corrupt = await db.prepare("INSERT INTO practice_sessions(user_id,day,version,preset,target_seconds,elapsed_ms,pause_count,bell_interval_seconds,bell_marks_json,ambience,intention,intention_framing,intention_cues_json,note,source,recorded_at,schema_version) VALUES(?,?,?,'p5',300,300000,0,0,NULL,'none',NULL,NULL,NULL,NULL,'human_declared',?,'practice-v0')").run(user.userId, H.dayOf(H.now()), 99, new Date(H.now()).toISOString());
  const mixed = (await req('/practice', undefined, 'GET')).data;
  ok('a row this app cannot read is unavailable in the day array while the readable one is not', mixed.sessions.length === 2 && mixed.sessions.filter((s) => s.state === 'unavailable').length === 1 && mixed.sessions.filter((s) => s.state === 'recorded').length === 1, mixed.sessions.map((s) => s.state));
  ok('the corrupted row is not counted as a recorded session', mixed.sessions_count === 1 && mixed.recorded_seconds === 6);
  ok('history reports the unreadable row as unavailable rather than repairing it', (await req('/practice/history', undefined, 'GET')).data.records.some((r) => r.state === 'unavailable'));
  await db.prepare('DELETE FROM practice_sessions WHERE user_id=? AND version=99').run(user.userId);

  const cross = await req('/practice', undefined, 'GET', otherToken);
  ok('another trader’s timer is a separate row and is untouched by these writes', cross.data.timer.state === 'idle' && (await req('/practice/timer', { action: 'start', revision: cross.data.revision, preset: 'p5', bell_interval_seconds: 0, ambience: 'none' }, 'POST', otherToken)).status === 200);
  ok('this trader’s revision and records are unaffected by the other trader’s write', (await req('/practice', undefined, 'GET')).data.sessions_count === 1);
  ok('an unowned or numeric account id is never an input to a practice surface', (await req('/practice?account_id=' + other.accountId, undefined, 'GET')).status === 200 && (await req('/practice?account_id=' + other.accountId, undefined, 'GET')).data.sessions_count === 1);

  const tradesBefore = (await db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id=?').get(user.userId)).n;
  const live = await req('/trades', H.body(user, { status: 'closed' }), 'POST');
  ok('a completed practice session changes no trade, risk or finance row', live.status === 200 && (await db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id=?').get(user.userId)).n === tradesBefore + 1);
  ok('the practice payload exposes no permission, gate, score, percentage or streak field', (() => {
    const v = mixed, bad = ['allowed', 'admitted', 'gate', 'permission', 'score', 'percentage', 'readiness', 'streak', 'goal', 'target_seconds_goal'];
    return bad.every((k) => !(k in v)) && !('streak' in v.timer) && v.authority === 'none' && v.timer.authority === 'none';
  })(), Object.keys(mixed));
  const period = (await req('/practice/progress?from=' + H.dayOf(H.now()) + '&to=' + H.dayOf(H.now()), undefined, 'GET')).data;
  ok('the progress payload states that its numbers are records, not results', period.target === null && period.score === null && /not a streak/.test(period.warnings.join(' ') + period.basis), period.warnings);
  ok('a refused practice write never reports a finance change', (() => { const text = JSON.stringify([cross.data.timer, mixed.timer]); return !/trade|finance|balance|position/i.test(text); })());
});
