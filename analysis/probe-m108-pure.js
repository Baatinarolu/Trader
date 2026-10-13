'use strict';
/** M108 pure-policy probe: the presets and custom length, the bell markers, the curated
 * toolkit, the shared intention/refusal contract and the honest timer/record reads.
 * No database, no HTTP — the module only. */
const H = require('./m108-test-support'), { ok, finish } = H, path = require('path');
let G; try { G = require(path.join(H.APP, 'src/practice')); } catch {}
const test = (l, v, d) => ok(l, !!G && v, d);
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const refuse = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
const timerRow = (over = {}) => ({ user_id: 1, state: 'idle', preset: null, target_seconds: null, bell_interval_seconds: null, ambience: null, intention: null, intention_framing: null, intention_cues_json: null, accumulated_ms: 0, pause_count: 0, started_at: null, updated_at: iso(NOW - 60000), version: 0, schema_version: 'practice-v1', ...over });
const sessionRow = (over = {}) => ({ id: over.id || 1, user_id: 1, day: '2026-10-13', version: 1, preset: 'p10', target_seconds: 600, elapsed_ms: 600000, pause_count: 0, bell_interval_seconds: 120, bell_marks_json: JSON.stringify([120, 240, 360, 480, 600]), ambience: 'rain', intention: null, intention_framing: null, intention_cues_json: null, note: null, source: 'human_declared', recorded_at: iso(NOW - 60000), historical_json: null, schema_version: 'practice-v1', ...over });

finish('M108 practice policy, presets, bells and honest reads', async () => {
  test('the schema name is versioned', G?.VERSION === 'practice-v1');
  test('the basis refuses effect/gate/score claims', /no such effect is claimed/.test(G.BASIS) && /No score, percentage, streak pressure/.test(G.BASIS) && /elapsed-time markers/.test(G.BASIS) && /ships no ambient audio/.test(G.BASIS) && /unverified free text that no trading surface reads/.test(G.BASIS), G?.BASIS);

  test('the five saved presets are the episode’s own minutes', JSON.stringify(G.PRESETS.map((p) => [p.id, p.seconds])) === JSON.stringify([['p5', 300], ['p10', 600], ['p15', 900], ['p30', 1800], ['p60', 3600]]), G?.PRESETS);
  test('a custom length is bounded 1 minute to 2 hours', G.CUSTOM_MIN_SECONDS === 60 && G.CUSTOM_MAX_SECONDS === 7200);
  test('a saved preset resolves to its own seconds', JSON.stringify(G.length({ preset: 'p15' })) === JSON.stringify({ preset: 'p15', target_seconds: 900 }));
  test('a custom h/m/s length resolves to seconds and is labelled custom', JSON.stringify(G.length({ hours: 1, minutes: 30, seconds: 0 })) === JSON.stringify({ preset: 'custom', target_seconds: 5400 }));
  for (const [label, body] of [
    ['a preset and h/m/s together', { preset: 'p5', hours: 0, minutes: 5, seconds: 0 }],
    ['an unknown preset', { preset: 'p90' }],
    ['only some custom fields', { hours: 1 }],
    ['a custom length below one minute', { hours: 0, minutes: 0, seconds: 30 }],
    ['a custom length above two hours', { hours: 3, minutes: 0, seconds: 0 }],
    ['non-integer minutes', { hours: 0, minutes: 1.5, seconds: 0 }],
    ['negative seconds', { hours: 0, minutes: 1, seconds: -1 }],
    ['sixty minutes instead of an hour', { hours: 0, minutes: 60, seconds: 0 }],
    ['more than two hours in hours', { hours: 3 }],
  ]) test('length contract rejects ' + label, refuse(() => G.length(body)) === 'practice_invalid');

  test('the bell intervals are elapsed-time markers, none first', JSON.stringify(G.BELL_INTERVALS) === JSON.stringify([0, 60, 120, 300, 600]));
  test('markers fall on the interval inside the measured running time', JSON.stringify(G.bellMarks(600000, 120)) === JSON.stringify([120, 240, 360, 480, 600]));
  test('a marker that has not been reached is not listed', JSON.stringify(G.bellMarks(239999, 120)) === JSON.stringify([120]));
  test('no interval means no marker', JSON.stringify(G.bellMarks(600000, 0)) === JSON.stringify([]) && JSON.stringify(G.bellMarks(0, 60)) === JSON.stringify([]));
  test('a bad interval is refused', refuse(() => G.length({ preset: 'p5' })) === null && refuse(() => G.bellMarks(-1, 60)) === null && G.bellMarks(-1, 60).length === 0);

  test('the six saved ambience options are recorded choices, none first', JSON.stringify(G.AMBIENCE) === JSON.stringify(['none', 'rain', 'ocean', 'forest', 'fireplace', 'white_noise']));
  test('the toolkit has three groups and every group is populated', JSON.stringify([...new Set(G.TOOLKIT.map((i) => i.group))].sort()) === JSON.stringify(['reboot', 'recovery', 'rewire']) && ['reboot', 'rewire', 'recovery'].every((g) => G.TOOLKIT.some((i) => i.group === g)), G.TOOLKIT.map((i) => i.id));
  test('every toolkit item carries steps, a note and an honest source label', G.TOOLKIT.every((i) => i.steps.length && i.note && ['episode_example', 'curated_app_text'].includes(i.source)));
  test('no toolkit item claims an effect on the trader', !G.TOOLKIT.some((i) => [...i.steps, i.note].some((t) => /will calm|reduces stress|improves focus|calms you|cures|guarantees|makes you/i.test(t))), G.TOOLKIT.filter((i) => [...i.steps, i.note].some((t) => /will calm|reduces stress|improves focus|calms you|cures|guarantees|makes you/i.test(t))).map((i) => i.id));
  test('a physiological word in the toolkit is attributed and disclaimed, never asserted', G.TOOLKIT.filter((i) => /parasympathetic|nervous system/i.test([...i.steps, i.note].join(' '))).every((i) => /cannot verify|cannot verify that and does not claim|does not claim/i.test(i.note)));

  test('an optional practice intention is kept as free text and labelled unverified', (() => { const i = G.intention('Today I will wait for the retest'); return i.framing === 'unverified_free_text' && i.intention === 'Today I will wait for the retest' && i.cues.chars === 32; })());
  test('the episode’s own anti-example is refused here too, with its own code', refuse(() => G.intention('Today I’m going to make $5,000 from the market')) === 'practice_outcome_target');
  test('an outcome without an amount is flagged, not refused', G.intention('Today I will have a green day').framing === 'outcome_language');
  test('a negated money sentence is not a target', refuse(() => G.intention('Today I will not turn a $500 loss into a revenge trade')) === null);
  test('no practice intention can ever be labelled a saved process template', G.intention('Today I follow my plan').framing === 'unverified_free_text');
  test('no intention at all is allowed and stays null', (() => { const i = G.intention(null); return i.intention === null && i.framing === null && i.cues === null; })());
  for (const [label, value] of [['a non-string', 5], ['over the character cap', 'x'.repeat(121)], ['a control character', 'a\u0001b']]) test('intention contract rejects ' + label, refuse(() => G.intention(value)) === 'practice_invalid');
  test('an empty or whitespace-only intention line is "no intention", never an error and never a zero-length intention', ['', '   ', '\t\n'].every((v) => { try { const i = G.intention(v); return i.intention === null && i.framing === null && i.cues === null; } catch { return false; } }));

  test('a post-session note is optional free text', G.note(null) === null && G.note('  kept as written  ') === '  kept as written  ');
  test('a note over 2000 characters is refused', refuse(() => G.note('x'.repeat(2001))) === 'practice_invalid');
  test('a note with control characters is refused', refuse(() => G.note('a\u0000b')) === 'practice_invalid');

  test('the day policy is the app’s one policy: today is readable', G.day('2026-10-13', { nowMs: NOW }) === '2026-10-13');
  test('a day that has not happened is refused, not read as nothing recorded', /future UTC day cannot be read/.test((() => { try { G.day('2026-10-14', { nowMs: NOW }); } catch (e) { return e.message; } return ''; })()));
  test('a malformed day is refused', refuse(() => G.day('2026-13-01', { nowMs: NOW })) === 'practice_invalid');
  test('a non-string day is refused', refuse(() => G.day(null, { nowMs: NOW })) === 'practice_invalid');

  test('an idle timer measures zero and claims nothing', (() => { const t = G.publicTimer(timerRow(), NOW); return t.state === 'idle' && t.elapsed_ms === 0 && t.actual_meditation_verified === false && t.authority === 'none'; })());
  test('a running timer is measured from the server’s own clock', G.publicTimer(timerRow({ state: 'running', preset: 'p5', target_seconds: 300, bell_interval_seconds: 60, ambience: 'none', started_at: iso(NOW - 5000) }), NOW).elapsed_ms === 5000);
  test('a paused gap is not counted', G.publicTimer(timerRow({ state: 'paused', preset: 'p5', target_seconds: 300, bell_interval_seconds: 60, ambience: 'none', accumulated_ms: 5000 }), NOW).elapsed_ms === 5000);
  test('a running timer with a future start is unavailable, not guessed', G.publicTimer(timerRow({ state: 'running', preset: 'p5', target_seconds: 300, bell_interval_seconds: 60, ambience: 'none', started_at: iso(NOW + 5000) }), NOW).state === 'unavailable');
  test('an unknown timer state is unavailable with a warning', (() => { const t = G.publicTimer(timerRow({ state: 'meditating' }), NOW); return t.state === 'unavailable' && /unavailable/.test(t.warnings.join(' ')); })());
  test('runningElapsed refuses to invent an elapsed time for a corrupt row', (() => { try { G.runningElapsed(timerRow({ state: 'running', accumulated_ms: -1 }), NOW); return null; } catch (e) { return e.status; } })() === 503);

  test('a recorded session reads back as measured running time and claims nothing more', (() => { const p = G.publicRow(sessionRow()); return p.state === 'recorded' && p.elapsed_seconds === 600 && p.elapsed_source === 'server_running_time' && p.reached_target === true && p.actual_meditation_verified === false && p.authority === 'none'; })());
  test('a record shorter than its chosen length says so as a fact, not a failure', G.publicRow(sessionRow({ elapsed_ms: 60000 })).reached_target === false);
  test('an imported archive is labelled imported and never recorded', G.publicRow(sessionRow({ source: 'imported_unverified', historical_json: JSON.stringify({ recorded_at: iso(NOW - 86400000) }) })).state === 'imported_unverified');
  test('a record carrying an unknown preset is unavailable, not repaired', G.publicRow(sessionRow({ preset: 'p90' })).state === 'unavailable');
  test('a record carrying an unknown ambience is unavailable', G.publicRow(sessionRow({ ambience: 'binaural' })).state === 'unavailable');
  test('a record with a non-listed bell interval is unavailable', G.publicRow(sessionRow({ bell_interval_seconds: 45 })).state === 'unavailable');
  test('a record with negative measured time is unavailable', G.publicRow(sessionRow({ elapsed_ms: -1 })).state === 'unavailable');
  test('a record with a bad receipt is unavailable', G.publicRow(sessionRow({ recorded_at: 'yesterday' })).state === 'unavailable');
  test('a record with an unknown schema version is unavailable', G.publicRow(sessionRow({ schema_version: 'practice-v2' })).state === 'unavailable');

  test('the write contract accepts only the named actions and the named fields', G.input({ action: 'start', revision: 'a'.repeat(64) }).action === 'start');
  test('an unknown action is refused', refuse(() => G.input({ action: 'meditate', revision: 'a'.repeat(64) })) === 'practice_invalid');
  test('a missing or malformed revision is refused', refuse(() => G.input({ action: 'start' })) === 'practice_invalid' && refuse(() => G.input({ action: 'start', revision: 'nope' })) === 'practice_invalid');
  test('no caller clock, account, owner or elapsed time is accepted', refuse(() => G.input({ action: 'start', revision: 'a'.repeat(64), now: NOW })) === 'practice_invalid' && refuse(() => G.input({ action: 'start', revision: 'a'.repeat(64), account_id: 1 })) === 'practice_invalid' && refuse(() => G.input({ action: 'start', revision: 'a'.repeat(64), elapsed_ms: 600000 })) === 'practice_invalid' && refuse(() => G.input({ action: 'start', revision: 'a'.repeat(64), user_id: 2 })) === 'practice_invalid');

  test('portable history requires version 1', G.portable({ version: 2, records: [] }).records.length === 0 && /version 1/.test(G.portable({ version: 2, records: [] }).warnings.join(' ')));
  test('portable history is bounded', /at most 500/.test(G.portable({ version: 1, records: new Array(501).fill({}) }).warnings.join(' ')));
  test('an archived session keeps its own words rather than being refused', (() => { const out = G.portable({ version: 1, records: [{ id: 1, day: '2026-10-01', preset: 'p5', target_seconds: 300, elapsed_ms: 300000, bell_interval_seconds: 0, ambience: 'none', intention: 'Today I will make $5,000', framing: 'unverified_free_text', note: 'n', recorded_at: '2026-10-01T07:00:00.000Z' }] }); return out.records.length === 1 && out.records[0].intention === 'Today I will make $5,000' && out.records[0].historical.day === '2026-10-01'; })(), G.portable({ version: 1, records: [{ day: '2026-10-01', preset: 'p5', target_seconds: 300, elapsed_ms: 300000, bell_interval_seconds: 0, ambience: 'none', intention: 'Today I will make $5,000', recorded_at: '2026-10-01T07:00:00.000Z' }] }).records[0]);
  test('an archived duration given in seconds is converted, not dropped', G.portable({ version: 1, records: [{ day: '2026-10-01', preset: 'p5', target_seconds: 300, elapsed_seconds: 300, bell_interval_seconds: 0, ambience: 'none', recorded_at: '2026-10-01T07:00:00.000Z' }] }).records[0].elapsed_ms === 300000);
  test('an archived session with no readable duration is omitted with a warning', (() => { const out = G.portable({ version: 1, records: [{ day: '2026-10-01', preset: 'p5', target_seconds: 300, bell_interval_seconds: 0, ambience: 'none', recorded_at: '2026-10-01T07:00:00.000Z' }] }); return out.records.length === 0 && /without a readable measured duration/.test(out.warnings.join(' ')); })());
  test('an archived session with an unknown preset is omitted with a warning', /unknown preset/.test(G.portable({ version: 1, records: [{ day: '2026-10-01', preset: 'p90', target_seconds: 300, elapsed_ms: 300000, bell_interval_seconds: 0, ambience: 'none', recorded_at: '2026-10-01T07:00:00.000Z' }] }).warnings.join(' ')));
  test('an archived future receipt is not accepted as receiving-clock proof', /not receiving-clock proof/.test(G.portable({ version: 1, records: [{ day: '2026-10-01', preset: 'p5', target_seconds: 300, elapsed_ms: 300000, bell_interval_seconds: 0, ambience: 'none', recorded_at: '2099-01-01T07:00:00.000Z' }] }).warnings.join(' ')));
  test('an archived session with no readable day keeps its record without claiming a day', (() => { const out = G.portable({ version: 1, records: [{ preset: 'p5', target_seconds: 300, elapsed_ms: 300000, bell_interval_seconds: 0, ambience: 'none', recorded_at: '2026-10-01T07:00:00.000Z' }] }); return out.records.length === 1 && out.records[0].day === null && /kept without claiming a day/.test(out.warnings.join(' ')); })());

  test('the unavailable payload claims nothing and blocks nothing', (() => { const u = G.unavailable(); return u.state === 'unavailable' && u.sessions.length === 0 && u.authority === 'none' && u.timer.state === 'unavailable' && /nothing is blocked|nothing is inferred/.test(u.message); })());
  test('the day policy runs through the same module the M107 intention uses', (() => { const I = require(path.join(H.APP, 'src/intention')); return G.day('2026-10-13', { nowMs: NOW }) === I.dayKey('2026-10-13', { nowMs: NOW }); })());
});
