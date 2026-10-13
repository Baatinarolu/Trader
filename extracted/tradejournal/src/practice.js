'use strict';
/**
 * M108 — the regulation layer (the "Sanctuary" half), built as a personal practice log.
 *
 * Saved Ep28: the guardrails stop you mechanically, and "sanctuary fixes the emotional
 * cause" — a meditation timer with 5/10/15/30/60-minute presets and a custom length,
 * interval bells, ambient sound, a post-session note, a progress view and a mental toolkit
 * grouped reboot / rewire / recovery. The daily intention half of that list is already
 * owned by M107 and is deliberately NOT duplicated here.
 *
 * What this module is allowed to claim is deliberately narrow, because a meditation timer
 * is the easiest place in this codebase to write a lie:
 *   - The only thing proven is ELAPSED SERVER RUNNING TIME. A paused gap does not count.
 *     Nothing here verifies that a person meditated, that a session calmed anyone, or that
 *     any physiological, emotional or performance effect occurred. No such effect is
 *     claimed anywhere in the payload.
 *   - The four saved presets are the episode's own list; "custom" is the trader's own
 *     h/m/s choice. Ambient sound is recorded as the trader's own DECLARATION and is never
 *     played by this app (no audio assets, no streaming provider) — `played_by_this_app`
 *     stays false in every response. Bells are elapsed-time MARKERS, not proof of sound.
 *   - An optional one-line practice intention reuses M107's bounded classifier and the same
 *     money/outcome-target refusal; it is free text kept as written and labelled
 *     unverified. It is never the day's trading intention and no trading surface reads it.
 *   - There is NO authority: no score, percentage, streak pressure, goal, target,
 *     readiness, gate or permission over entries/signals/risk/cap/routine/core/grades/
 *     history. A missing or short session is not a failure, and a recorded one is never
 *     evidence that anything was achieved.
 */
const crypto = require('crypto');
const Intention = require('./intention');
const VERSION = 'practice-v1';
const CHAR_MAX = Intention.CHAR_MAX;
/** The episode's own preset list, kept in seconds so nothing is inferred at read time. */
const PRESETS = [
  { id: 'p5', seconds: 300, label: '5 minutes' },
  { id: 'p10', seconds: 600, label: '10 minutes' },
  { id: 'p15', seconds: 900, label: '15 minutes' },
  { id: 'p30', seconds: 1800, label: '30 minutes' },
  { id: 'p60', seconds: 3600, label: '60 minutes' },
];
const CUSTOM_MIN_SECONDS = 60, CUSTOM_MAX_SECONDS = 7200;
/** Recorded as the trader's own declaration; this app ships and plays no ambient audio. */
const AMBIENCE = ['none', 'rain', 'ocean', 'forest', 'fireplace', 'white_noise'];
/** Elapsed-time markers only. 0 means no marker. */
const BELL_INTERVALS = [0, 60, 120, 300, 600];
const MAX_SESSION_MS = 86400000;
/** Curated practice text, grouped as the episode groups it. Attribution is explicit and
 * every item that the episode describes with an effect the app cannot verify says so. */
const TOOLKIT = [
  { id: 'box_breathing', group: 'reboot', label: 'Box breathing', source: 'episode_example', steps: ['Breathe in for a count of four.', 'Hold for four.', 'Breathe out for four.', 'Hold for four, then repeat at your own pace.'], note: 'The episode names box breathing as one way to reset before the session; the app times nothing here and verifies no bodily effect.' },
  { id: 'sixty_second_reboot', group: 'reboot', label: '60-second reboot', source: 'episode_example', steps: ['Stop looking at the chart for one minute.', 'Breathe out longer than you breathe in — four in, six out.', 'Then ask the four state questions before touching the mouse.'], note: 'The episode describes this as settling the parasympathetic system; this app cannot verify that and does not claim it. The four state questions live in the M106 state gate, not here.' },
  { id: 'short_sit', group: 'reboot', label: 'Short sit (5–10 minutes)', source: 'episode_example', steps: ['Start the timer at 5 or 10 minutes.', 'Sit still; the timer measures running time only.'], note: 'Recorded as a practice session like any other. Nothing about attention, calm or focus is measured.' },
  { id: 'detach_after_loss', group: 'rewire', label: 'Detach from the last trade', source: 'episode_example', steps: ['Name the fact: the last outcome does not change the odds of the next one.', 'Write nothing in the journal you do not mean.', 'Return to the process, not to the outcome.'], note: 'The episode\'s randomness doctrine is his claim, quoted here as text; the app verifies nothing about odds or about how you feel.' },
  { id: 'review_the_process', group: 'rewire', label: 'Rewire on the process', source: 'curated_app_text', steps: ['Mark the trade against your own plan.', 'Keep the plan; change nothing mid-session.'], note: 'Curated app text. It points at surfaces the app already owns (journal, execution review) rather than judging your state.' },
  { id: 'name_the_state', group: 'recovery', label: 'Name the state', source: 'episode_example', steps: ['Answer in your own words what you are walking into the market as.', 'If you want that kept, record it in the emotion capture — not here.'], note: 'The episode says naming the state matters; the app does not read your words back to you as a diagnosis, and this text is not your emotion record.' },
  { id: 'step_away', group: 'recovery', label: 'Step away', source: 'curated_app_text', steps: ['Close the platform.', 'Do something that is not the market.', 'Come back only when you can answer the four state questions honestly.'], note: 'Curated app text with no timer and no measurement; the app cannot see what you do away from it.' },
];
const BASIS = 'A personal practice log: server-measured RUNNING time only. Nothing here verifies that a meditation happened, that anyone calmed down, or that any physiological, emotional or performance effect occurred — and no such effect is claimed. Bells are elapsed-time markers, ambience is your own declaration (this app plays and ships no ambient audio), and the optional one-line intention is unverified free text that no trading surface reads. No score, percentage, streak pressure, goal, target, readiness, gate or permission over entries/signals/risk/cap/routine/core/grades/history.';

function invalid(message, status = 400) { return Object.assign(new Error(message), { code: 'practice_invalid', status }); }
const id = (n) => Number.isSafeInteger(n) && n > 0;
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const Clock = (s, o) => require('./process-outcomes').clock(s, o);
const iso = (ms) => new Date(ms).toISOString();
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
/** The one day policy the app already owns (M107): a malformed or not-yet UTC day is
 * refused rather than rendered as a day with nothing recorded. */
function day(date, { nowMs = Date.now() } = {}) {
  try { return Intention.dayKey(date, { nowMs }); }
  catch (e) { throw invalid(e.message || 'Use a valid past-or-today UTC calendar date (YYYY-MM-DD).'); }
}
const presetById = (v) => PRESETS.find((p) => p.id === v) || null;
const whole = (v) => Number.isSafeInteger(v) && v >= 0;

/** A chosen length is either one saved preset or the trader's own h/m/s. */
function length(body) {
  const hasPreset = Object.hasOwn(body, 'preset') && body.preset !== null;
  const customKeys = ['hours', 'minutes', 'seconds'].filter((k) => Object.hasOwn(body, k) && body[k] !== null);
  if (hasPreset && customKeys.length) throw invalid('Choose ONE saved preset or your own h/m/s length — not both.');
  if (hasPreset) {
    const p = presetById(body.preset);
    if (!p) throw invalid('Unknown practice preset.');
    return { preset: p.id, target_seconds: p.seconds };
  }
  if (customKeys.length !== 3) throw invalid('Choose a saved preset or give hours, minutes and seconds for a custom length.');
  const h = body.hours, m = body.minutes, s = body.seconds;
  if (!whole(h) || !whole(m) || !whole(s) || m > 59 || s > 59 || h > 2) throw invalid('A custom length is whole hours (0–2), minutes and seconds (0–59).');
  const seconds = h * 3600 + m * 60 + s;
  if (seconds < CUSTOM_MIN_SECONDS || seconds > CUSTOM_MAX_SECONDS) throw invalid(`A custom length is between ${CUSTOM_MIN_SECONDS} and ${CUSTOM_MAX_SECONDS} seconds (1 minute to 2 hours).`);
  return { preset: 'custom', target_seconds: seconds };
}
const bellInterval = (v) => { if (!BELL_INTERVALS.includes(v)) throw invalid('Choose a bell interval from the listed elapsed-time markers (0 means none).'); return v; };
const ambienceValue = (v) => { if (typeof v !== 'string' || !AMBIENCE.includes(v)) throw invalid('Choose an ambience from the listed options, or none.'); return v; };
/** Optional one-line practice intention: M107's contract and classifier, practice labels.
 * The episode's own anti-example (an asserted amount plus outcome in one sentence) is
 * refused here for the same reason it is refused there. */
function intention(value) {
  if (value === null || value === undefined) return { intention: null, framing: null, cues: null };
  /* Leaving the field empty is the normal case for an optional line, not an error. */
  if (typeof value === 'string' && !value.trim()) return { intention: null, framing: null, cues: null };
  try {
    const text = Intention.text(value);
    const c = Intention.classify(text);
    const framing = c.framing === 'process_template' ? 'unverified_free_text' : c.framing;
    return { intention: text, framing, cues: c.cues };
  } catch (e) {
    if (e.code === 'intention_outcome_target') throw Object.assign(invalid('That is an outcome goal: it names an amount and an outcome in the same sentence, and a practice intention is not a money target either. Keep it to one behaviour within your control, or leave it empty.', 400), { code: 'practice_outcome_target' });
    throw invalid(e.message || `Write one single-line practice intention up to ${CHAR_MAX} characters.`);
  }
}
function note(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw invalid('A post-session note is free text up to 2000 characters.');
  return value.normalize('NFC');
}
/** Elapsed-time markers strictly inside the measured running time. */
const bellMarks = (elapsedMs, intervalSeconds) => { const out = []; if (!intervalSeconds || !Number.isSafeInteger(elapsedMs) || elapsedMs <= 0) return out; for (let t = intervalSeconds; t * 1000 <= elapsedMs; t += intervalSeconds) out.push(t); return out; };
const runningElapsed = (row, nowMs) => {
  if (!row || typeof row !== 'object') throw invalid('Stored practice timer is unavailable.', 503);
  if (!['idle', 'running', 'paused'].includes(row.state) || !Number.isSafeInteger(row.accumulated_ms) || row.accumulated_ms < 0 || row.schema_version !== VERSION) throw invalid('Stored practice timer is unavailable.', 503);
  if (row.state === 'running') {
    const started = Clock(row.started_at, { canonical: true });
    if (started === null || started > nowMs || started < Clock(row.updated_at, { canonical: true })) throw invalid('Stored practice timer clock is unavailable.', 503);
    return row.accumulated_ms + (nowMs - started);
  }
  if (row.started_at !== null) throw invalid('Stored practice timer clock is unavailable.', 503);
  return row.accumulated_ms;
};

/** The timer row is the only mutable row in this layer; the receipt it produces is not. */
async function timerRow(store, userId) {
  const row = await store.prepare('SELECT * FROM practice_timers WHERE user_id=?').get(userId);
  if (row) return row;
  await store.prepare("INSERT INTO practice_timers(user_id,state,preset,target_seconds,bell_interval_seconds,ambience,intention,intention_framing,intention_cues_json,accumulated_ms,pause_count,started_at,updated_at,version,schema_version) VALUES(?,'idle',NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,NULL,?,0,?)").run(userId, iso(Date.now()), VERSION);
  return await store.prepare('SELECT * FROM practice_timers WHERE user_id=?').get(userId);
}
function publicTimer(row, nowMs) {
  if (!row) return { state: 'unavailable', elapsed_ms: null, elapsed_source: null, preset: null, target_seconds: null, bell_interval_seconds: null, ambience: null, intention: null, framing: null, warnings: ['unavailable: no practice timer could be read, so nothing is inferred.'], bells: [], actual_meditation_verified: false, authority: 'none' };
  let elapsed = null;
  try { elapsed = runningElapsed(row, nowMs); }
  catch { return { state: 'unavailable', elapsed_ms: null, elapsed_source: null, preset: null, target_seconds: null, bell_interval_seconds: null, ambience: null, intention: null, framing: null, warnings: ['unavailable: the stored timer cannot be read back, so nothing is inferred.'], bells: [], actual_meditation_verified: false, authority: 'none' }; }
  let cues = null; try { cues = row.intention_cues_json ? JSON.parse(row.intention_cues_json) : null; } catch { cues = null; }
  return {
    state: row.state, elapsed_ms: elapsed, elapsed_source: elapsed === null ? null : 'server_running_time', preset: row.preset, target_seconds: row.target_seconds,
    reached_target: row.state === 'idle' ? null : elapsed >= row.target_seconds * 1000, bell_interval_seconds: row.bell_interval_seconds,
    ambience: row.ambience, ambience_played_by_this_app: false, ambience_note: 'Recorded as your own declaration; this app plays and ships no ambient audio.',
    intention: row.intention, framing: row.intention_framing, cues, warnings: row.intention ? Intention.warningsFor(row.intention_framing, cues) : [],
    pause_count: row.pause_count, bells: bellMarks(elapsed, row.bell_interval_seconds), actual_meditation_verified: false, authority: 'none', authority_note: 'No gate, score, target or permission; a missing or short session is not a failure.',
  };
}
function publicRow(row) {
  if (!row) return null;
  try {
    if (!['human_declared', 'imported_unverified'].includes(row.source) || row.schema_version !== VERSION || typeof row.day !== 'string' || !id(row.version) ||
        (row.preset !== 'custom' && !presetById(row.preset)) || !Number.isSafeInteger(row.target_seconds) || row.target_seconds < CUSTOM_MIN_SECONDS || row.target_seconds > CUSTOM_MAX_SECONDS ||
        !Number.isSafeInteger(row.elapsed_ms) || row.elapsed_ms < 0 || !Number.isSafeInteger(row.pause_count) || row.pause_count < 0 ||
        !BELL_INTERVALS.includes(row.bell_interval_seconds) || !AMBIENCE.includes(row.ambience) || Clock(row.recorded_at, { canonical: true }) === null) throw invalid('Unavailable practice session record.');
    let cues = null; try { cues = row.intention_cues_json ? JSON.parse(row.intention_cues_json) : null; } catch { cues = null; }
    let bells = []; try { bells = row.bell_marks_json ? JSON.parse(row.bell_marks_json) : []; } catch { bells = []; }
    const framed = row.intention ? ['outcome_language', 'unverified_free_text'].includes(row.intention_framing) : null;
    if (row.intention && !framed) throw invalid('Unavailable practice intention framing.');
    return {
      id: row.id, day: row.day || null, version: Number(row.version), preset: row.preset, target_seconds: row.target_seconds,
      elapsed_ms: row.elapsed_ms, elapsed_source: 'server_running_time', elapsed_seconds: Math.floor(row.elapsed_ms / 1000), reached_target: row.elapsed_ms >= row.target_seconds * 1000,
      pause_count: Number(row.pause_count), bell_interval_seconds: row.bell_interval_seconds, bells, ambience: row.ambience, ambience_played_by_this_app: false,
      intention: row.intention || null, framing: framed, cues, warnings: row.intention ? Intention.warningsFor(row.intention_framing, cues) : [],
      note: row.note || null, source: row.source, state: row.source === 'imported_unverified' ? 'imported_unverified' : 'recorded',
      recorded_at: row.recorded_at, historical: row.historical_json ? JSON.parse(row.historical_json) : null,
      actual_meditation_verified: false, authority: 'none',
    };
  } catch {
    return { id: row.id, day: row.day || null, version: null, state: 'unavailable', preset: null, target_seconds: null, elapsed_ms: null, pause_count: null, bells: [], ambience: null, intention: null, framing: null, cues: null, warnings: ['unavailable: the stored session cannot be read back, so nothing is inferred.'], note: null, source: 'unavailable', recorded_at: null, authority: 'none', actual_meditation_verified: false };
  }
}
const rowsOf = (store, userId) => store.prepare('SELECT * FROM practice_sessions WHERE user_id=? ORDER BY day,id').all(userId);
const ownedDay = (store, userId, date, nowMs) => store.prepare('SELECT * FROM practice_sessions WHERE user_id=? AND day=? ORDER BY id').all(userId, day(date, { nowMs }));

/** Day view: exactly what was recorded that day, or that nothing was. Never a judgement. */
async function viewOn(store, userId, { nowMs = Date.now(), date = null } = {}) {
  const row = await timerRow(store, userId);
  const target = date === null ? utcDay(nowMs) : day(date, { nowMs });
  const rows = await ownedDay(store, userId, target, nowMs);
  const readable = rows.map(publicRow);
  /* A row this app cannot read back is never counted as a recorded session or a measured
   * second: the totals are the readable receipts only. */
  const recorded = readable.filter((s) => s.state === 'recorded');
  const archives = readable.filter((s) => s.state === 'imported_unverified');
  const seconds = recorded.reduce((n, s) => n + (Number.isSafeInteger(s.elapsed_seconds) ? s.elapsed_seconds : 0), 0);
  return {
    schema: VERSION, day: target, today: utcDay(nowMs), same_day: target === utcDay(nowMs),
    state: rows.length ? 'recorded' : 'unrecorded',
    message: rows.length ? 'Practice sessions recorded for this day: server-measured running time only.' : 'No practice session recorded for this day. Nothing is carried over, and an empty day is not a failure.',
    sessions: readable, archives, recorded_seconds: seconds, sessions_count: recorded.length, imported_count: archives.length,
    timer: publicTimer(row, nowMs), presets: PRESETS, custom: { min_seconds: CUSTOM_MIN_SECONDS, max_seconds: CUSTOM_MAX_SECONDS, max_hours: 2 },
    ambience_options: AMBIENCE, bell_intervals: BELL_INTERVALS, toolkit: TOOLKIT, char_max: CHAR_MAX,
    revision: hash([userId, row.state, row.preset, row.target_seconds, row.bell_interval_seconds, row.ambience, row.intention, row.accumulated_ms, row.pause_count, row.started_at, row.version, rows.length]),
    authority: 'none', actual_meditation_verified: false, broker_verified: false, service: VERSION, basis: BASIS,
  };
}
async function read(userId, options = {}) { const { db } = require('./db'); return db.tx(async (tx) => viewOn(db.transactionStore(tx), userId, options)); }

/** Progress is a count of records, never a target, a score or a streak to protect. */
async function progress(userId, { from, to, nowMs = Date.now() } = {}) {
  const start = day(from, { nowMs }), end = day(to, { nowMs });
  if (start > end) throw invalid('The progress period starts after it ends.');
  if ((Clock(end + 'T00:00:00.000Z', { canonical: true }) - Clock(start + 'T00:00:00.000Z', { canonical: true })) / 86400000 > 366) throw invalid('A progress period is at most 366 days.');
  const { db } = require('./db');
  const rows = await db.prepare('SELECT * FROM practice_sessions WHERE user_id=? ORDER BY day,id').all(userId);
  const inRange = rows.filter((r) => typeof r.day === 'string' && r.day >= start && r.day <= end).map(publicRow);
  const recorded = inRange.filter((r) => r.state === 'recorded');
  const days = [...new Set(recorded.map((r) => r.day))].sort();
  let run = 0;
  for (let d = new Date(end + 'T00:00:00.000Z'); days.includes(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1)) run++;
  return {
    schema: VERSION, from: start, to: end, period_days: (Clock(end + 'T00:00:00.000Z', { canonical: true }) - Clock(start + 'T00:00:00.000Z', { canonical: true })) / 86400000 + 1,
    sessions_count: recorded.length, recorded_seconds: recorded.reduce((n, r) => n + (Number.isSafeInteger(r.elapsed_seconds) ? r.elapsed_seconds : 0), 0),
    days_with_recorded_session: days.length, consecutive_days_with_a_recorded_session_ending_on_to: run,
    imported_count: inRange.filter((r) => r.state === 'imported_unverified').length,
    counts_are_records_only: true, authority: 'none', target: null, score: null,
    warnings: ['progress_are_records_not_results: these numbers count recorded sessions and their measured running time. They are not a streak to protect, not a goal, not adherence, and not evidence of calm, focus, discipline or any effect.'],
    basis: BASIS, actual_meditation_verified: false,
  };
}
async function history(userId, { date = null, nowMs = Date.now() } = {}) {
  const { db } = require('./db');
  const rows = date === null
    ? await db.prepare('SELECT * FROM practice_sessions WHERE user_id=? ORDER BY day,id').all(userId)
    : await db.prepare('SELECT * FROM practice_sessions WHERE user_id=? AND day=? ORDER BY id').all(userId, day(date, { nowMs }));
  return { records: rows.map(publicRow), readonly: true, authority: 'none', actual_meditation_verified: false, basis: BASIS };
}

/** Timer actions. Every write path validates the previous state inside one transaction. */
function input(body) {
  const allowed = ['action', 'preset', 'hours', 'minutes', 'seconds', 'bell_interval_seconds', 'ambience', 'intention', 'note', 'revision'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !allowed.includes(k))) throw invalid('Send a practice action with its settings; no caller clock, day, source, owner, account or elapsed time is accepted.');
  if (!['start', 'pause', 'resume', 'complete', 'cancel'].includes(body.action)) throw invalid('Choose start, pause, resume, complete or cancel.');
  if (typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision)) throw invalid('Send the displayed revision; another write may have changed the timer.');
  return body;
}
async function save(userId, body, { nowMs = Date.now() } = {}) {
  const fields = input(body);
  const { db } = require('./db');
  return db.tx(async (tx) => {
    const store = db.transactionStore(tx);
    const before = await timerRow(store, userId);
    const view = await viewOn(store, userId, { nowMs });
    if (fields.revision !== view.revision) throw invalid('The practice timer or this day\u2019s records changed. Explicitly reload before acting.', 409);
    const elapsed = runningElapsed(before, nowMs);
    const at = iso(nowMs);
    if (fields.action === 'start') {
      if (before.state !== 'idle') throw invalid('A practice session is already open. Pause, resume, complete or cancel it first.', 409);
      const len = length(fields), bell = bellInterval(fields.bell_interval_seconds), amb = ambienceValue(fields.ambience), intent = intention(fields.intention);
      await store.prepare("UPDATE practice_timers SET state='running',preset=?,target_seconds=?,bell_interval_seconds=?,ambience=?,intention=?,intention_framing=?,intention_cues_json=?,accumulated_ms=0,pause_count=0,started_at=?,updated_at=?,version=version+1 WHERE user_id=?")
        .run(len.preset, len.target_seconds, bell, amb, intent.intention, intent.framing, intent.cues ? JSON.stringify(intent.cues) : null, at, at, userId);
    } else if (fields.action === 'pause') {
      if (before.state !== 'running') throw invalid('Only a running practice timer can be paused.', 409);
      await store.prepare("UPDATE practice_timers SET state='paused',accumulated_ms=?,pause_count=pause_count+1,started_at=NULL,updated_at=?,version=version+1 WHERE user_id=?").run(elapsed, at, userId);
    } else if (fields.action === 'resume') {
      if (before.state !== 'paused') throw invalid('Only a paused practice timer can be resumed.', 409);
      await store.prepare("UPDATE practice_timers SET state='running',started_at=?,updated_at=?,version=version+1 WHERE user_id=?").run(at, at, userId);
    } else if (fields.action === 'cancel') {
      if (before.state === 'idle') throw invalid('There is no open practice session to cancel.', 409);
      await store.prepare("UPDATE practice_timers SET state='idle',preset=NULL,target_seconds=NULL,bell_interval_seconds=NULL,ambience=NULL,intention=NULL,intention_framing=NULL,intention_cues_json=NULL,accumulated_ms=0,pause_count=0,started_at=NULL,updated_at=?,version=version+1 WHERE user_id=?").run(at, userId);
    } else {
      if (before.state === 'idle') throw invalid('There is no open practice session to complete.', 409);
      if (elapsed > MAX_SESSION_MS) throw invalid('A timer open for more than 24 hours cannot be completed as one session. Cancel it instead: nothing is written and no elapsed time is claimed.', 409);
      const paused = before.state === 'paused';
      const value = paused ? before.accumulated_ms : elapsed;
      const next = (await store.prepare('SELECT MAX(version) v FROM practice_sessions WHERE user_id=? AND day=?').get(userId, utcDay(nowMs))).v || 0;
      await store.prepare('INSERT INTO practice_sessions(user_id,day,version,preset,target_seconds,elapsed_ms,pause_count,bell_interval_seconds,bell_marks_json,ambience,intention,intention_framing,intention_cues_json,note,source,recorded_at,schema_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(userId, utcDay(nowMs), Number(next) + 1, before.preset, before.target_seconds, value, before.pause_count || 0, before.bell_interval_seconds, JSON.stringify(bellMarks(value, before.bell_interval_seconds)), before.ambience,
          before.intention, before.intention_framing, before.intention_cues_json, note(fields.note), 'human_declared', at, VERSION);
      await store.prepare("UPDATE practice_timers SET state='idle',preset=NULL,target_seconds=NULL,bell_interval_seconds=NULL,ambience=NULL,intention=NULL,intention_framing=NULL,intention_cues_json=NULL,accumulated_ms=0,pause_count=0,started_at=NULL,updated_at=?,version=version+1 WHERE user_id=?").run(at, userId);
    }
    return viewOn(store, userId, { nowMs });
  });
}
/** Read-only day view for the Journal/day surfaces: that day's sessions, nothing inferred. */
async function dayView(userId, date) { return read(userId, { date }); }
function unavailable(reason = 'Practice log unavailable — nothing was read, nothing is inferred, and nothing is blocked.') {
  return { schema: VERSION, day: null, today: utcDay(Date.now()), same_day: false, state: 'unavailable', message: reason, sessions: [], archives: [], recorded_seconds: 0, sessions_count: 0, imported_count: 0, timer: publicTimer(null), presets: PRESETS, custom: { min_seconds: CUSTOM_MIN_SECONDS, max_seconds: CUSTOM_MAX_SECONDS, max_hours: 2 }, ambience_options: AMBIENCE, bell_intervals: BELL_INTERVALS, toolkit: TOOLKIT, char_max: CHAR_MAX, revision: null, authority: 'none', actual_meditation_verified: false, broker_verified: false, service: VERSION, basis: BASIS };
}
async function optional(userId, { nowMs = Date.now(), store = null, date = null } = {}) {
  try { return store ? await viewOn(store, userId, { nowMs, date }) : await read(userId, { nowMs, date }); }
  catch { return unavailable(date === null ? undefined : `No practice log can be read for the requested day (${date}): it is not a past-or-today UTC calendar day, so nothing is inferred for it.`); }
}

/* Backup/restore. A restored session is an archive of someone's record: it keeps its own
 * original day and clock as history, never becomes the receiver's recorded session, and is
 * counted separately from the receiver's own practice everywhere. */
function portable(raw) {
  const out = { records: [], warnings: [] };
  if (raw == null) return out;
  try {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.records) || raw.records.length > 500) throw invalid('Optional practice history requires version 1 and at most 500 records.');
    if (raw.unavailable || raw.unavailable_records > 0) out.warnings.push('Original practice history unavailable/omitted; nothing is inferred about those sessions.');
    for (const r of raw.records) {
      try {
        const original = r.historical || {}, oldClock = original.recorded_at ?? r.recorded_at, oldDay = original.day ?? r.day ?? null;
        let declared = oldClock;
        if (oldClock != null && Clock(oldClock, { canonical: true }) === null) { out.warnings.push('Invalid/future original practice receipt omitted, not receiving-clock proof.'); declared = null; }
        let dayValue = null;
        if (typeof oldDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(oldDay) && Clock(oldDay + 'T00:00:00.000Z', { canonical: true }) !== null) dayValue = oldDay;
        else out.warnings.push('Original practice day unknown; the archive is kept without claiming a day.');
        const seconds = Number.isSafeInteger(r.elapsed_ms) && r.elapsed_ms >= 0 ? r.elapsed_ms : (Number.isSafeInteger(r.elapsed_seconds) && r.elapsed_seconds >= 0 ? r.elapsed_seconds * 1000 : null);
        if (seconds === null) throw invalid('Practice record without a readable measured duration omitted.');
        const preset = r.preset === 'custom' || presetById(r.preset) ? r.preset : null;
        if (preset === null) throw invalid('Practice record with an unknown preset omitted.');
        const target = Number.isSafeInteger(r.target_seconds) && r.target_seconds >= CUSTOM_MIN_SECONDS && r.target_seconds <= CUSTOM_MAX_SECONDS ? r.target_seconds : null;
        if (target === null) throw invalid('Practice record without a readable chosen length omitted.');
        const bell = BELL_INTERVALS.includes(r.bell_interval_seconds) ? r.bell_interval_seconds : 0;
        const amb = AMBIENCE.includes(r.ambience) ? r.ambience : 'none';
        const value = r.intention == null ? null : Intention.text(r.intention);
        out.records.push({
          day: dayValue, preset, target_seconds: target, elapsed_ms: seconds, pause_count: Number.isSafeInteger(r.pause_count) && r.pause_count >= 0 ? r.pause_count : 0,
          bell_interval_seconds: bell, ambience: amb, intention: value, framing: value ? (r.framing === 'outcome_language' ? 'outcome_language' : 'unverified_free_text') : null,
          note: typeof r.note === 'string' ? r.note.slice(0, 2000) : null,
          historical: { source: original.source || r.source || null, recorded_at: declared, day: dayValue, original_version: original.original_version ?? r.version ?? null, original_id: original.original_id ?? r.id ?? null },
        });
      } catch (e) { out.warnings.push(e.message || 'Invalid optional practice record omitted.'); }
    }
  } catch (e) { out.warnings.push(e.message || 'Optional practice history omitted.'); }
  out.warnings = out.warnings.slice(0, 20);
  return out;
}
async function exportOwned(userId) {
  try {
    const { db } = require('./db'), rows = await db.prepare('SELECT * FROM practice_sessions WHERE user_id=? ORDER BY day,id').all(userId), records = rows.map(publicRow).filter((p) => p.state !== 'unavailable');
    return { version: 1, records, unavailable_records: rows.length - records.length };
  } catch { return { version: 1, records: [], unavailable: true }; }
}
async function importOn(store, userId, parsed) {
  for (const p of parsed.records) {
    const next = (await store.prepare('SELECT MAX(version) v FROM practice_sessions WHERE user_id=? AND day=?').get(userId, p.day || '')).v || 0;
    const cues = (() => { try { return p.intention ? Intention.classify(p.intention).cues : null; } catch { return null; } })();
    await store.prepare('INSERT INTO practice_sessions(user_id,day,version,preset,target_seconds,elapsed_ms,pause_count,bell_interval_seconds,bell_marks_json,ambience,intention,intention_framing,intention_cues_json,note,source,recorded_at,historical_json,schema_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(userId, p.day || '', Number(next) + 1, p.preset, p.target_seconds, p.elapsed_ms, p.pause_count, p.bell_interval_seconds, JSON.stringify(bellMarks(p.elapsed_ms, p.bell_interval_seconds)), p.ambience,
        p.intention, p.framing, cues ? JSON.stringify(cues) : null, p.note, 'imported_unverified', iso(Date.now()), JSON.stringify(p.historical), VERSION);
  }
}
module.exports = { VERSION, CHAR_MAX, PRESETS, CUSTOM_MIN_SECONDS, CUSTOM_MAX_SECONDS, AMBIENCE, BELL_INTERVALS, MAX_SESSION_MS, TOOLKIT, BASIS, invalid, day, presetById, length, intention, note, bellMarks, runningElapsed, publicTimer, publicRow, viewOn, read, progress, history, input, save, dayView, optional, unavailable, portable, exportOwned, importOn, utcDay, hash };
