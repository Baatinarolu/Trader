'use strict';
/** M111 engine probe: the READ itself. Both failure shapes the market layer can produce — its own
 * `{ok:false}` return and a thrown read — must arrive as `unknown`, while an honestly empty week
 * must stay `clear`. Nothing here reads a live feed: the calendar comes through the app's own
 * parser with the shim answering the two URLs, and the thrown path is produced by patching the
 * shipped reader for the duration of one call (test-only; the module is restored afterwards). */
const path = require('path');
const H = require('./m111-test-support'), { ok } = H;
const N = H.mod('src/news-window');
const B = require(path.join(H.APP, 'src/bots'));
const M = H.app('src/market');
H.finish('M111 engine: a read that failed is unknown, a read that worked is clear', async () => {
  if (!H.shipped(N, 'the M111 calendar-read state vocabulary')) return;
  const S = N.STATES;
  const pair = N.plan({ news_block_before_min: 15, news_settle_after_min: 45 });

  /* ------------------------------------------- a calendar that WAS read and is quiet is CLEAR */
  H.calendarSpec([{ offset_min: 10, currency: 'JPY', title: 'BoJ rate' }, { offset_min: 10, currency: 'USD', title: 'Low-impact print', impact: 'Low' }]);
  const quiet = await B.newsCheck('EURUSD', pair);
  ok('a calendar that WAS read and holds nothing that touches this symbol reads as `clear`, with no unavailability anywhere', quiet.state === S.CLEAR && quiet.blackout === null && quiet.events.length === 0 && !('unavailable' in quiet) && !('unavailable_note' in quiet) && !('error' in quiet) && quiet.windows.unavailable === undefined, Object.keys(quiet));

  /* ---------------------------------------------------------------------------------------
   * The app's own market layer turns an EMPTY feed into `{ok:false, error:'…(empty calendar)'}`,
   * so an empty week and an unreachable feed are the SAME shape before this milestone reads it.
   * That is measured rather than assumed: it is why the fix must not treat "no rows" as quiet, and
   * it is the conservative direction — a genuinely empty week is `unknown`, never a manufactured
   * all-clear.                                */
  H.calendarSpec([]);
  const emptyFeed = await M.getCalendar();
  const emptyRead = await B.newsCheck('EURUSD', pair);
  ok('an empty feed is reported by the market layer as a failure (its own "empty calendar" error), not as a quiet week with zero rows', emptyFeed.ok === false && /empty calendar/.test(emptyFeed.error || ''), emptyFeed);
  ok('so it reaches the news check as `unknown` too — counting rows cannot manufacture an all-clear', emptyRead.state === S.UNKNOWN && emptyRead.blackout === null && /empty calendar/.test(emptyRead.unavailable), { state: emptyRead.state, why: emptyRead.unavailable });

  /* ----------------------------------------------------- the market layer's own failure */
  H.calendarSpec(null);
  const dead = await M.getCalendar();
  ok('the outage is real at the source: the market layer refuses the read rather than serving an empty week', dead.ok === false && /calendar/i.test(dead.error || '') && (dead.events || []).length === 0, { ok: dead.ok, error: dead.error });
  const outage = await B.newsCheck('EURUSD', pair);
  ok('the outage reaches the news check as `unknown` — NOT as a quiet calendar', outage.state === S.UNKNOWN && outage.blackout === null, outage.state);
  ok('and the reason travels with it, so a caller never has to say "unknown" without saying why', typeof outage.unavailable === 'string' && /calendar/i.test(outage.unavailable) && outage.unavailable.length > 10, outage.unavailable);
  ok('the payload carries the module\'s own sentence rather than a second wording invented here', outage.unavailable_note === N.unknownNote(outage.unavailable) && /NOT an all-clear/.test(outage.unavailable_note), outage.unavailable_note);
  ok('the failure is NOT dressed as data: no events, no upcoming list, and the currencies still name the symbol\'s own', outage.events.length === 0 && outage.upcoming.length === 0 && outage.currencies.includes('USD'), outage);
  ok('the two windows are STILL echoed on the unknown path, so an outage can never be read as "the window was applied and nothing was found"', outage.windows.before_min === 15 && outage.windows.after_min === 45 && outage.windows.available === undefined, outage.windows);
  ok('the windows also say the read failed, beside the pair they belong to', outage.windows.unavailable === true, outage.windows);
  ok('the old `error` key is still there AND still names the read, so a consumer written against the previous shape is not silently blinded', typeof outage.error === 'string' && outage.error === outage.unavailable, outage.error);
  ok('the payload still has no top-level single knob: M111 added states, it did not resurrect a number', !('window_min' in outage) && !('window_min' in quiet), Object.keys(outage));

  /* ------------------------------------------------------------- a THROWN read is the same */
  const real = M.getCalendar;
  M.getCalendar = async () => { throw new Error('boom: feed reset mid-read'); };
  const thrown = await B.newsCheck('EURUSD', pair);
  M.getCalendar = real;
  ok('a thrown read is the SAME outcome as `{ok:false}` — one unknown state, not two behaviours', thrown.state === S.UNKNOWN && thrown.blackout === null && thrown.events.length === 0, thrown.state);
  ok('the thrown message is the reason, quoted rather than replaced by a generic phrase', thrown.unavailable === 'boom: feed reset mid-read' && /boom: feed reset mid-read/.test(thrown.unavailable_note), thrown.unavailable);
  ok('a thrown read does not escape the engine: no exception reaches a route, and the pair is still echoed', thrown.windows.before_min === 15 && thrown.windows.after_min === 45 && thrown.windows.unavailable === true, thrown.windows);
  const nonError = M.getCalendar; M.getCalendar = async () => { throw 'string failure'; };
  const threwString = await B.newsCheck('EURUSD', pair); M.getCalendar = nonError;
  ok('even a non-Error throw is stringified into a readable reason rather than leaking a bare value', threwString.state === S.UNKNOWN && threwString.unavailable === 'string failure', threwString.unavailable);

  /* ------------------------------------------------------------- and the fix is not wider */
  H.calendarSpec([{ offset_min: 10, currency: 'USD', title: 'CPI' }]);
  const blocked = await B.newsCheck('EURUSD', pair);
  ok('a release INSIDE the block is still `blocked` with the M110 sentence, so the new state did not replace the old rule', blocked.state === S.BLOCKED && typeof blocked.blackout === 'string' && /CPI in 10 min/.test(blocked.blackout) && !('unavailable' in blocked), { state: blocked.state, blackout: blocked.blackout });
  H.calendarSpec([{ offset_min: -45, currency: 'USD', title: 'NFP' }, { offset_min: -46, currency: 'USD', title: 'Just settled' }]);
  const settle = await B.newsCheck('EURUSD', pair);
  ok('the asymmetric boundaries are untouched by M111: the 45-minute print is blocked on the settle side, 46 is let go', settle.state === S.BLOCKED && settle.events.length === 1 && settle.events[0].side === 'after' && settle.events[0].window_min === 45, settle.events);

  /* ------------------------------------------------------------ the read-only claim */
  H.calendarSpec([{ offset_min: 5, currency: 'USD', title: 'Read-only check' }]);
  const before = await H.snapshot();
  await B.newsCheck('EURUSD', pair);
  H.calendarSpec(null);
  await B.newsCheck('EURUSD', pair);
  await B.newsCheck('EURUSD', pair);
  const after = await H.snapshot();
  ok('an outage and a block are both READS: every table is byte-identical afterwards, and an unknown never becomes a stored fact', H.changed(before, after).length === 0, H.changed(before, after));

  /* ------------------------------------------------------------------ the doc marker */
  const engineSrc = require('fs').readFileSync(path.join(H.APP, 'src/bots/index.js'), 'utf8');
  ok('the engine states the three outcomes at the function it happens in, so the rule is readable where it is applied', /M111 — the read itself has three outcomes/.test(engineSrc) && /unknown\` \(the calendar could not be read\)/.test(engineSrc), 'marker');
});
