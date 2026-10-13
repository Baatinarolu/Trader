'use strict';
/** M108 freshness probe: the shared day policy at every practice surface, same-day writes
 * and the honest UTC-midnight behaviour of a running session. */
const H = require('./m108-test-support'), { ok, finish } = H;
const rev = async (req) => (await req('/practice', undefined, 'GET')).data.revision;

finish('M108 practice day policy and UTC boundaries', async () => {
  const { req } = await H.start('m108-freshness');
  const T0 = H.now(), today = H.dayOf(T0), tomorrow = H.dayOf(T0 + 86400000), yesterday = H.dayOf(T0 - 86400000);

  ok('today and yesterday are readable days', (await req('/practice?date=' + today, undefined, 'GET')).status === 200 && (await req('/practice?date=' + yesterday, undefined, 'GET')).status === 200);
  const future = await req('/practice?date=' + tomorrow, undefined, 'GET');
  ok('a day that has not happened is refused, not read as nothing recorded', future.status === 400 && /future UTC day cannot be read/.test(future.data.error), future.data);
  ok('the same refusal covers the history surface', (await req('/practice/history?date=' + tomorrow, undefined, 'GET')).status === 400);
  ok('a malformed day is refused at both surfaces', (await req('/practice?date=' + today + 'x', undefined, 'GET')).status === 400 && (await req('/practice/history?date=2026-02-30', undefined, 'GET')).status === 400);
  ok('a non-string day is refused', (await req('/practice?date[]=' + today, undefined, 'GET')).status === 400);
  ok('the progress period refuses a future day', (await req('/practice/progress?from=' + tomorrow + '&to=' + tomorrow, undefined, 'GET')).status === 400);
  ok('the progress period refuses a reversed or over-long span', (await req('/practice/progress?from=' + today + '&to=' + yesterday, undefined, 'GET')).status === 400 && (await req('/practice/progress?from=2024-01-01&to=' + today, undefined, 'GET')).status === 400);
  ok('a single-day period is allowed', (await req('/practice/progress?from=' + today + '&to=' + today, undefined, 'GET')).status === 200);

  const started = await req('/practice/timer', { action: 'start', revision: await rev(req), preset: 'p5', bell_interval_seconds: 0, ambience: 'none' });
  ok('the write path pins the session to the server’s own day and takes no day input', started.status === 200 && started.data.day === today && (await req('/practice/timer', { action: 'start', revision: await rev(req), preset: 'p5', bell_interval_seconds: 0, ambience: 'none', day: tomorrow })).status === 400);

  /* A session that crosses UTC midnight: the timer keeps measuring, and the receipt is
   * recorded on the day it was completed. Both facts are asserted rather than assumed. */
  const lateStart = H.now();
  H.setNow(Date.UTC(2026, 9, 13, 23, 55));
  await req('/practice/timer', { action: 'cancel', revision: await rev(req) });
  await req('/practice/timer', { action: 'start', revision: await rev(req), preset: 'p30', bell_interval_seconds: 600, ambience: 'none' });
  H.setNow(Date.UTC(2026, 9, 14, 0, 25));
  const running = (await req('/practice', undefined, 'GET')).data;
  ok('a session running past UTC midnight keeps measuring its running time', running.timer.state === 'running' && running.timer.elapsed_ms === 1800000, running.timer);
  ok('the running session is visible on the new day and not on the old one', running.day === '2026-10-14' && running.timer.state === 'running');
  const completed = await req('/practice/timer', { action: 'complete', revision: running.revision });
  ok('the receipt lands on the day the session was completed and says which day that is', completed.status === 200 && completed.data.day === '2026-10-14' && completed.data.sessions[0].day === '2026-10-14' && completed.data.sessions[0].elapsed_ms === 1800000);
  const oldDay = (await req('/practice?date=2026-10-13', undefined, 'GET')).data;
  ok('the previous day shows nothing recorded, never the later session', oldDay.sessions_count === 0 && oldDay.state === 'unrecorded');
  ok('the progress period counts the session on its completion day only', (() => {
    return req('/practice/progress?from=2026-10-13&to=2026-10-13', undefined, 'GET').then((r) => r.data.sessions_count === 0 && r.data.imported_count === 0);
  })());
  ok('the completion-day period counts it once', (await req('/practice/progress?from=2026-10-14&to=2026-10-14', undefined, 'GET')).data.sessions_count === 1);
  H.setNow(lateStart);
});
