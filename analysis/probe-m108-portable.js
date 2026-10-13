'use strict';
/** M108 portable probe: the backup/restore round trip for practice records. A restored
 * session is an archive of someone's record: separate day, separate clock, separate count. */
const H = require('./m108-test-support'), { ok, finish } = H;
const rev = async (req) => (await req('/practice', undefined, 'GET')).data.revision;

finish('M108 practice backup and restore', async () => {
  const { req, user, otherToken } = await H.start('m108-portable');
  const today = H.dayOf(H.now());
  await req('/practice/timer', { action: 'start', revision: await rev(req), preset: 'p10', bell_interval_seconds: 120, ambience: 'ocean', intention: 'Today I will wait for the retest' });
  H.setNow(H.now() + 600000);
  await req('/practice/timer', { action: 'complete', revision: await rev(req), note: 'own session' });

  const exported = await req('/export/json', undefined, 'GET');
  const bundle = exported.data.practice_sessions;
  ok('the backup carries a versioned practice bundle and nothing more', exported.status === 200 && bundle.version === 1 && Array.isArray(bundle.records) && bundle.unavailable_records === 0 && Object.keys(bundle).sort().join() === 'records,unavailable_records,version', Object.keys(bundle));
  ok('the exported records carry no score, streak or summary field', bundle.records.every((r) => !('score' in r) && !('streak' in r) && r.authority === 'none' && r.actual_meditation_verified === false));
  ok('the export keeps the measured running time and the trader’s own words', bundle.records[0].elapsed_ms === 600000 && bundle.records[0].intention === 'Today I will wait for the retest' && bundle.records[0].elapsed_source === 'server_running_time');

  const payload = (records) => ({ data: { trades: [], accounts: [], practice_sessions: { version: 1, records } } });
  const archive = { id: 77, day: '2026-09-29', preset: 'p60', target_seconds: 3600, elapsed_ms: 3600000, pause_count: 2, bell_interval_seconds: 300, ambience: 'white_noise', intention: 'Today I follow my plan', framing: 'unverified_free_text', note: 'restored note', recorded_at: '2026-09-29T05:00:00.000Z' };
  const imported = await req('/import/json', payload([archive]));
  ok('a well-formed archive is accepted', imported.status === 200 && Array.isArray(imported.data.practice_warnings));
  const history = (await req('/practice/history', undefined, 'GET')).data.records;
  const restored = history.find((r) => r.state === 'imported_unverified');
  ok('the restored session is labelled imported, never recorded', !!restored && restored.day === '2026-09-29' && restored.elapsed_ms === 3600000);
  ok('the restored session keeps its original clock and version as history', restored.historical.recorded_at === '2026-09-29T05:00:00.000Z' && restored.historical.original_id === 77 && restored.recorded_at !== '2026-09-29T05:00:00.000Z');
  ok('restoring never touches the trader’s own recorded day', (await req('/practice?date=' + today, undefined, 'GET')).data.sessions_count === 1 && (await req('/practice?date=2026-09-29', undefined, 'GET')).data.sessions_count === 0);
  const period = (await req('/practice/progress?from=2026-09-01&to=' + today, undefined, 'GET')).data;
  ok('progress counts the archive separately and never merges it', period.sessions_count === 1 && period.imported_count === 1 && period.recorded_seconds === 600, period);

  const twice = await req('/import/json', payload([archive]));
  ok('importing the same archive twice adds a second archive rather than editing the first', twice.status === 200 && (await req('/practice/history', undefined, 'GET')).data.records.filter((r) => r.state === 'imported_unverified').length === 2);

  const malformed = await req('/import/json', payload([
    { ...archive, id: 78, day: '2026-13-01' },
    { ...archive, id: 79, recorded_at: '2099-01-01T00:00:00.000Z' },
    { ...archive, id: 80, preset: 'p90' },
    { ...archive, id: 81, elapsed_ms: undefined, elapsed_seconds: undefined },
    { ...archive, id: 82, ambience: 'binaural' },
  ]));
  ok('malformed archives warn instead of pretending to restore', malformed.status === 200 && malformed.data.practice_warnings.length >= 3, malformed.data.practice_warnings);
  const kept = (await req('/practice/history', undefined, 'GET')).data.records.filter((r) => r.state === 'imported_unverified');
  ok('a record with no readable day is kept without claiming a day', kept.some((r) => r.day === null));
  ok('a record with an unusable duration or preset is omitted, not repaired', !kept.some((r) => r.elapsed_ms === null || r.preset === 'p90'));
  ok('a record with an unlisted ambience falls back to none rather than inventing a sound', kept.filter((r) => r.historical.original_id === 82).every((r) => r.ambience === 'none'));

  ok('a foreign trader importing the same bundle keeps their own archive counts', (await req('/import/json', payload([archive]), 'POST', otherToken)).status === 200 && (await req('/practice', undefined, 'GET', otherToken)).data.sessions_count === 0);
  ok('the export of the receiver still carries their own records only', (await req('/export/json', undefined, 'GET', otherToken)).data.practice_sessions.records.length === 1);
  ok('deleting the trader removes their archives with them', await (async () => { await H.D.db.prepare('DELETE FROM users WHERE id=?').run(user.userId); return (await H.D.db.prepare('SELECT COUNT(*) n FROM practice_sessions WHERE user_id=?').get(user.userId)).n === 0; })());
});
