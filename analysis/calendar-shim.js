'use strict';
/**
 * calendar-shim.js — TEST ONLY (M110). Redirect the app's economic-calendar fetch to a
 * synthetic feed, so the REAL parser in `src/market.js` is what builds the events.
 *
 * WHY THIS EXISTS
 *   The sandbox cannot reach `nfs.faireconomy.media`, and `M.getCalendar()` swallows that
 *   failure into `{ok:false, events:[]}` — which is the fail-open behaviour of the still-open
 *   M111. A probe of the news window therefore cannot rely on the live feed and must not
 *   pretend an empty calendar is a quiet one. This patches `global.fetch` ONLY, answers the
 *   two URLs `src/market.js` actually requests, and lets every line of the project's own
 *   parsing, currency guessing, localisation and caching run unmodified.
 *
 * WHAT IT IS NOT
 *   Not a live calendar, not a provider proof. The events are synthetic and generated
 *   relative to the frozen clock the probe installs (`Date.now()`), so an offset cannot move
 *   with the wall clock. Nothing here is used outside `analysis/`.
 *
 * M110_CALENDAR_SPEC — JSON array of `{offset_min, title, currency, impact}`; a positive
 * offset is a release that has not printed yet (it must be judged against the pre-release
 * block), a negative one is a release that has already printed (the post-release settle).
 * A spec of `[]` is an honestly empty calendar; `null`/unset means "fail the fetch", which
 * exercises the M111 path rather than a quiet market. `at_ms` pins an event absolutely.
 */
let OVERRIDE = null;   // set by a probe that needs a second calendar in the same process:
                       // `setSpec([...])`, then advance the frozen clock past the 15-minute
                       // cache TTL so the app re-fetches — the cache is time-based, and an
                       // expired entry is the app's own invalidation, not a bypass of it.
function spec() {
  if (OVERRIDE !== null) return OVERRIDE;
  if (process.env.M110_CALENDAR_SPEC === undefined) return [];
  try { return JSON.parse(process.env.M110_CALENDAR_SPEC); } catch { return []; }
}
const realFetch = global.fetch.bind(global);

function rows() {
  const SPEC = spec();
  if (!Array.isArray(SPEC)) return [];
  return SPEC.map((e, i) => ({
    title: e.title || `M110 synthetic release ${i + 1}`,
    country: e.currency || 'USD',
    impact: e.impact || 'High',
    // `at_ms` pins an event to an absolute instant: a probe can then judge ONE event against
    // several frozen clocks, including clocks past the app's 15-minute cache TTL (where the feed
    // is re-read and, with `offset_min`, the event would have moved with the clock).
    date: new Date(e.at_ms !== undefined ? Number(e.at_ms) : Date.now() + Number(e.offset_min || 0) * 60000).toISOString(),
    forecast: '', previous: '', actual: '',
  }));
}

global.fetch = async function shimmed(url, opts) {
  const u = String(url);
  if (u.includes('nfs.faireconomy.media/ff_calendar_')) {
    if (spec() === null) throw new Error('M110 shim: calendar fetch forced to fail');
    // The app merges this-week and next-week. The spec is ONE week, so the other feeds an
    // empty array: otherwise every synthetic event would appear twice and a blackout string
    // would name it twice, which is the shim's artefact and not the app's behaviour.
    const value = u.includes('thisweek') ? rows() : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(value), json: async () => value };
  }
  return realFetch(url, opts);
};

module.exports = { rows, spec, setSpec: (v) => { OVERRIDE = v; }, realFetch };
