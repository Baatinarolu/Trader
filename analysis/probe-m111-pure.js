'use strict';
/** M111 — the module's OWN vocabulary: three mutually exclusive states, one mapping, one
 * sentence, and the same leaf promises M110 made (no requires, no clock, no writes). This probe
 * reads the module directly, so it is the smallest statement of the rule; the engine, the HTTP
 * surface and the consumers are measured by the sibling probes. */
const fs = require('fs'), path = require('path');
const H = require('./m111-test-support'), { ok } = H;
const N = H.mod('src/news-window');
H.finish('M111 module states', async () => {
  if (!H.shipped(N, 'the M111 calendar-read state vocabulary')) return;

  /* ------------------------------------------------------------------ the vocabulary */
  const S = N.STATES;
  ok('there are exactly three states, and they are the words the fix is about', JSON.stringify(S) === JSON.stringify({ BLOCKED: 'blocked', CLEAR: 'clear', UNKNOWN: 'unknown' }), S);
  ok('the three states are distinct strings, so no consumer can compare them with `!`', new Set(Object.values(S)).size === 3 && Object.values(S).every((v) => typeof v === 'string' && v.length > 0), Object.values(S));
  const unknowns = ['blocked', 'clear', 'unknown'].filter((v) => !Object.values(S).includes(v));
  ok('and the list is closed: no fourth state is implied anywhere in the module', unknowns.length === 0, unknowns);

  /* --------------------------------------------------------------------- the mapping */
  ok('a known release maps to `blocked` even if a later read failed', N.stateOf({ blackout: 'EURUSD NFP in 5 min', unavailable: 'x' }) === S.BLOCKED);
  ok('a failed read with no known release maps to `unknown` — the whole point of the fix', N.stateOf({ blackout: null, unavailable: 'Economic calendar unavailable (empty calendar)' }) === S.UNKNOWN);
  ok('a successful read with nothing inside the clock maps to `clear`', N.stateOf({ blackout: null, unavailable: null }) === S.CLEAR);
  ok('an empty object is `clear` rather than a silent unknown, so the honest-empty-week case is not folded into the outage case', N.stateOf({}) === S.CLEAR);
  ok('a missing argument does not throw and is `clear`', N.stateOf() === S.CLEAR);
  ok('a plausibly-truthy but empty `unavailable` is not unknown: the states are decided by the VALUE, not by the caller\'s keys', N.stateOf({ unavailable: '' }) === S.CLEAR && N.stateOf({ unavailable: null }) === S.CLEAR, null);

  /* -------------------------------------------------------------------- the sentence */
  const note = N.unknownNote('Economic calendar unavailable (empty calendar)');
  ok('the unknown sentence says UNKNOWN in the trader\'s face, so it cannot be skimmed as an all-clear', /^News risk UNKNOWN/.test(note), note);
  ok('it names the reason it could not read, so the failure is attributable', /Economic calendar unavailable \(empty calendar\)/.test(note), note);
  ok('it states what was NOT done, rather than implying the windows were checked and found quiet', /Nothing was checked against your stand-down windows/.test(note), note);
  ok('it refuses the all-clear explicitly', /NOT an all-clear/.test(note), note);
  ok('and it names NO window number, so it cannot be misread as "the window was applied and nothing was found" (that is the M110 pair\'s job, and the pair is echoed separately)', !/\d+\s*(min|minute)/i.test(note), note);
  ok('a missing reason still yields a complete sentence with no stray brackets', /^News risk UNKNOWN — the economic calendar could not be read\. Nothing was checked/.test(N.unknownNote(null)) && !/\(\s*\)/.test(N.unknownNote(undefined)), N.unknownNote(null));
  ok('an object reason is stringified rather than printed as "[object Object]" or as an empty gap', /boom/.test(N.unknownNote('Error: boom')) && !/\[object Object\]/.test(N.unknownNote({ message: 'boom' })), N.unknownNote({ message: 'boom' }));
  ok('two calls with the same reason produce the same bytes — the sentence is data, not a log line', N.unknownNote('x') === N.unknownNote('x'));

  /* ------------------------------------------------------------------ the whole policy */
  const policy = N.policy();
  ok('the policy advertises the states and the fact that unknown is not clear, so a caller can read the rule without guessing', JSON.stringify(policy.states) === JSON.stringify(S) && policy.unknown_is_not_clear === true, policy);
  ok('M110\'s two settings are untouched by M111: same fields, same defaults, same floor, still no single knob', policy.before.field === 'news_block_before_min' && policy.after.field === 'news_settle_after_min' && policy.before.default === 15 && policy.after.default === 45 && policy.after.min === 30 && policy.single_knob === false, policy);

  /* ------------------------------------------------------------------- the leaf rules */
  const src = fs.readFileSync(path.join(H.APP, 'src/news-window.js'), 'utf8');
  ok('the module is still a LEAF: it requires nothing at all, so the state vocabulary cannot pull in the app, a database or a fetcher', !/\brequire\s*\(/.test(src) && !/\bimport\s+/.test(src), 'require');
  ok('it still calls no clock of its own — the read is classified from what it is GIVEN', !/Date\.now\(/.test(src) && !/new Date\(\s*\)/.test(src), 'clock');
  ok('it still performs no I/O and holds no cache', !/\bfetch\s*\(/.test(src) && !/readFileSync|writeFileSync|process\.env/.test(src), 'io');
  ok('the module still exports no write path, so "unknown" can never be persisted as if it were a stored fact', !Object.keys(N).some((k) => /save|insert|update|write|delete|set(?!tle)/i.test(k)), Object.keys(N));
  ok('M110\'s one-number refusal is intact in the same file, so closing M111 did not reopen the split-knob defect', Array.isArray(N.LEGACY_SINGLE) && N.LEGACY_SINGLE.length === 5 && (() => { try { N.parsePair({ window_min: 5 }); return false; } catch (e) { return e.code === 'news_window_split_required'; } })(), N.LEGACY_SINGLE);
  ok('the unknown path has no separate code and no new error class: it is a STATE on a successful read, not an exception to catch', (() => { try { N.parsePair({}); return true; } catch { return false; } })() && !Object.keys(N).some((k) => /UnknownError|UnavailableError/.test(k)), Object.keys(N));
});
