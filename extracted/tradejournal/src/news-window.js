'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  M110 — THE NEWS STAND-DOWN IS TWO RULES, NOT ONE NUMBER.
 *
 * Ep 30 gives the news block **two distinct stand-down periods** and the audit
 * recorded them as one knob:
 *
 *   pre-release block  "you don't open new positions during that window where the
 *                       news is coming out, like 15 minutes before and after news"
 *   post-release settle "after the news came out, you want to wait for the volatility
 *                       to settle, maybe 30 minutes to 60 minutes after the high impact
 *                       news comes out. Once the structure start becoming much more
 *                       clearer, this is where you can continue trading."
 *
 * `bots/index.js` applied ONE number symmetrically
 * (`Math.abs(event - now) <= windowMin * 60000`). At the default of 45 that happened to
 * comply (45 ≥ 15 before; 45 is inside 30–60 after) — the recorded gap is that it could
 * not comply at every value he offers: 5, 10, 15, 30 and 60 are all sanctioned settings,
 * so a 5-minute window silently shortened the post-news settle to 5 minutes, 6–12× below
 * the range he states, with nothing said about it.
 *
 * The fix is structural, not a better default: there is no single knob anywhere in this
 * delivery. `parse()` and `plan()` deal only in a pair, `hit()` is the ONE place the
 * asymmetric test lives (so the two sides cannot drift back into one), and a bare number
 * is refused rather than reinterpreted as "both sides".
 *
 * LIMITS, STATED SO THIS IS NOT OVER-READ.
 *   - The numbers are the episode's own: 15 is his stated default for the block and his
 *     recommended minimum, 30–60 is the settle range he names. This module treats 30 as
 *     the settle FLOOR and refuses to store less, because a shorter settle is the exact
 *     failure the finding recorded. It does not claim his range is a law of trading and
 *     it does not grade, score or override anything: the blackout is still the same
 *     veto it was, applied to the same analyse path.
 *   - Nothing here fetches a calendar. `hit()` is pure arithmetic over whatever
 *     `M.getCalendar()` returned, and the state vocabulary below (M111) is pure too: it
 *     classifies the READ, it does not perform it. A calendar that cannot be read is
 *     `unknown` — never `clear`.
 *   - No provider/broker/pixel/human proof, and no claim about volatility, spreads or
 *     what a release will do to price: the rule is a stand-down clock, nothing else.
 * ────────────────────────────────────────────────────────────────────────────*/

const VERSION = 'news-window-v1';

/** The two settings, each with the role it plays and the bounds this app enforces. */
const BEFORE = {
  field: 'news_block_before_min',
  role: 'pre-release block',
  default: 15,
  min: 1,
  max: 240,
  recommended_min: 15,   // his "at least 15 minutes before and after" — advisory, not a floor:
                         // he also demonstrates 5 and 10 as settings, so a lower value is stored
                         // with a named warning instead of being refused.
};
const AFTER = {
  field: 'news_settle_after_min',
  role: 'post-release settle',
  default: 45,
  min: 30,               // the FLOOR: his own stated settle range starts at 30 minutes
  max: 240,
  recommended_min: 30,
  recommended_max: 60,
};

const BASIS = 'The news stand-down is two clocks, not one setting: a short pre-release block ' +
  '(default 15 min, his stated default and recommended minimum) and a longer post-release settle ' +
  '(default 45 min, floor 30 min, inside the 30–60 min range he names). Both are compared against ' +
  'signed offsets from the release time, and the pre-release block is never used to shorten the ' +
  'settle. Recommendations are labelled as recommendations: only the 30-minute settle floor is ' +
  'enforced, because a shorter settle is the recorded failure this milestone fixes.';

/** The episode's own words, quoted rather than paraphrased, as the reason for each bound. */
const DOCTRINE = {
  pre: 'You don’t open new positions during that window where the news is coming out, like 15 minutes before and after news.',
  settle: 'After the news came out, you want to wait for the volatility to settle, maybe 30 minutes to 60 minutes after the high impact news comes out. Once the structure start becoming much more clearer, this is where you can continue trading.',
  at_least: 'I would recommend you to at least put it at 15 minutes before and after.',
  options: 'The default state is probably like 15 minutes, right? But you can set it to 5 minutes, 10 minutes, 30 minutes, 60 minutes.',
};

function invalid(message, code, status = 400) {
  return Object.assign(new Error(message), { code: code || 'news_window_invalid', status });
}

/** One side, as an integer inside its own bounds. Never coerced from booleans/arrays. */
function parse(bounds, value, label) {
  if (value == null || value === '' || typeof value === 'boolean' || Array.isArray(value) || typeof value === 'object') {
    throw invalid(`${label} must be a whole number of minutes (${bounds.min}–${bounds.max}).`, 'news_window_invalid');
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < bounds.min || n > bounds.max) {
    if (bounds.field === AFTER.field && Number.isInteger(n) && n >= 1 && n < AFTER.min) {
      throw invalid(`The post-release settle cannot be set below ${AFTER.min} minutes. He waits "maybe 30 minutes to 60 minutes" after a high-impact release; a shorter settle is the recorded failure this setting exists to prevent — and it is a separate setting from the pre-release block, so shortening one cannot shorten the other.`, 'news_settle_below_floor');
    }
    throw invalid(`${label} must be a whole number of minutes from ${bounds.min} to ${bounds.max}.`, 'news_window_invalid');
  }
  return n;
}

/**
 * Read a request pair. Only the fields the request actually supplies are parsed; an
 * omitted field keeps `current` (itself already clamped by `plan()`).
 * @returns {{before_min:number, after_min:number, warnings:Array}}
 */
/** The spellings the single symmetric knob has been known by: `window_min`/`newsWindowMin` in a
 *  request body, `window`/`windowMin` in a query. Any of them means "one number for both sides",
 *  which is the recorded defect, so all of them are refused with the same code. */
const LEGACY_SINGLE = ['window_min', 'windowMin', 'newsWindowMin', 'news_window_min', 'window'];

function parsePair(input = {}, current = {}) {
  const cur = { before_min: current.before_min === undefined ? BEFORE.default : current.before_min, after_min: current.after_min === undefined ? AFTER.default : current.after_min };
  const warnings = [];
  let before_min = cur.before_min;
  let after_min = cur.after_min;
  const beforeFromRequest = input[BEFORE.field] !== undefined;
  const afterFromRequest = input[AFTER.field] !== undefined;
  // The old single knob, refused rather than reinterpreted — and refused FIRST, so it cannot be
  // smuggled in beside a valid pair and quietly ignored. Silently choosing a side for the caller
  // is precisely how a 5-minute setting shortened a 30–60 minute settle.
  if (LEGACY_SINGLE.some((k) => input[k] !== undefined)) {
    throw invalid('One number can no longer set both sides of the news rule. Set news_block_before_min (pre-release block) and news_settle_after_min (post-release settle, floor 30) separately.', 'news_window_split_required');
  }
  if (beforeFromRequest) before_min = parse(BEFORE, input[BEFORE.field], 'news_block_before_min');
  if (afterFromRequest) after_min = parse(AFTER, input[AFTER.field], 'news_settle_after_min');
  if (before_min < BEFORE.recommended_min) {
    warnings.push({
      code: 'news_block_before_below_recommended',
      message: `The pre-release block is ${before_min} minute${before_min === 1 ? '' : 's'}, below the 15 minutes he recommends ("${DOCTRINE.at_least}"). It is stored as you set it — that is your setting, not an error — and it does not shorten the post-release settle.`,
      cites: [DOCTRINE.at_least],
    });
  }
  return {
    before_min, after_min, warnings,
    source: [`${BEFORE.field}:${beforeFromRequest ? 'request' : 'current'}`, `${AFTER.field}:${afterFromRequest ? 'request' : 'current'}`],
    clamped: current.clamped || [],
  };
}

/**
 * The effective pair for one account, CLAMPED ON READ (the M9 pattern): a row stored by a
 * path that bypasses the API can never shorten the settle below its floor or push either
 * side past its maximum. Missing/unreadable values fall back to the episode's defaults and
 * say so in `source`.
 */
function plan(account = null, opts = {}) {
  const clamped = [];
  const source = [];
  const read = (bounds, raw) => {
    if (raw === undefined || raw === null || raw === '') { source.push(`${bounds.field}:default`); return bounds.default; }
    const n = Number(raw);
    if (!Number.isInteger(n)) { clamped.push({ field: bounds.field, from: String(raw), to: bounds.default, because: 'the stored value is not a whole number of minutes' }); source.push(`${bounds.field}:default`); return bounds.default; }
    const v = Math.min(Math.max(n, bounds.min), bounds.max);
    if (v !== n) { clamped.push({ field: bounds.field, from: n, to: v, because: `${bounds.field} is bounded ${bounds.min}–${bounds.max}` }); source.push(`${bounds.field}:clamped`); return v; }
    source.push(`${bounds.field}:stored`);
    return v;
  };
  // A per-request pair is research input, and is still put through the same bounds.
  const request = opts.newsWindow && typeof opts.newsWindow === 'object' ? opts.newsWindow : null;
  const before_min = request && request.before_min !== undefined ? parse(BEFORE, request.before_min, 'news_block_before_min') : read(BEFORE, account ? account[BEFORE.field] : undefined);
  const after_min = request && request.after_min !== undefined ? parse(AFTER, request.after_min, 'news_settle_after_min') : read(AFTER, account ? account[AFTER.field] : undefined);
  const warnings = before_min < BEFORE.recommended_min && !(request && request.before_min !== undefined)
    ? [{ code: 'news_block_before_below_recommended', message: `The stored pre-release block is ${before_min} minute${before_min === 1 ? '' : 's'}, below the 15 minutes he recommends. It is used as stored and does not shorten the settle.`, cites: [DOCTRINE.at_least] }]
    : [];
  if (after_min < AFTER.recommended_min || after_min > AFTER.recommended_max) {
    warnings.push({ code: 'news_settle_outside_stated_range', message: `The post-release settle is ${after_min} minutes, outside the 30–60 minutes he names for the settle. It is a longer stand-down than his range, which suppresses trades rather than permitting them, so it is stored and reported rather than refused.`, cites: [DOCTRINE.settle] });
  }
  return { version: VERSION, before_min, after_min, source, clamped, warnings, policy: policy() };
}

/**
 * THE asymmetric test — the only place a release is judged against the window.
 * A release that has not printed yet is judged against the pre-release block; one that has
 * printed is judged against the settle. They are separate comparisons, never one absolute
 * difference.
 * @returns {null|{side:'before'|'after', offset_min:number, window_min:number}}
 */
function hit(eventMs, nowMs, pair) {
  if (!Number.isFinite(eventMs) || !Number.isFinite(nowMs)) return null;
  const offsetMs = eventMs - nowMs;
  const minutes = (ms) => Math.round(ms / 60000);
  if (offsetMs >= 0) return offsetMs <= pair.before_min * 60000 ? { side: 'before', offset_min: minutes(offsetMs), window_min: pair.before_min } : null;
  const elapsed = -offsetMs;
  return elapsed <= pair.after_min * 60000 ? { side: 'after', offset_min: minutes(elapsed), window_min: pair.after_min } : null;
}

/** The honest description of the rule in force — with the configured numbers interpolated,
 *  so a note can never describe a window the app is not applying (M62's surviving half). */
function detail(pair) {
  return `No high-impact releases inside your news window: ${pair.before_min} min before and ${pair.after_min} min after a release (checked either side of the entry, from this account's settings).`;
}

function noteFor(pair, warnings = []) {
  return {
    before_min: pair.before_min, after_min: pair.after_min,
    basis: BASIS,
    range: { before: `${BEFORE.min}–${BEFORE.max}`, after: `${AFTER.min}–${AFTER.max}`, settle_floor: AFTER.min },
    recommended: { before_min: BEFORE.recommended_min, settle: `${AFTER.recommended_min}–${AFTER.recommended_max}` },
    sources: pair.source || [], clamped: pair.clamped || [],
    warnings: warnings.concat(pair.warnings || []).filter((w, i, a) => a.findIndex((x) => x.code === w.code) === i),
    models: 'two separate clocks over the same stored calendar, applied asymmetrically; no model, no prediction and no claim about what a release will do to price',
    broker_verified: false,
  };
}

/* ─────────────────────────────────────────────── M111: UNKNOWN IS A STATE OF ITS OWN ──
 * The stand-down above is only as true as the calendar it is measured against, and Ep 30
 * frames the block as a SAFETY mechanism — "it prevent you from getting wiped out ... it's
 * simply a mechanism for Edge Flow to protect you from impulse", "it's trying to keep you
 * alive and disciplined". A safety gate that answers "clear" when it cannot SEE is the
 * wrong default: the failure would be indistinguishable from a genuinely quiet week, and
 * the all-clear would be manufactured rather than observed.
 *
 * So a calendar read has exactly three outcomes, and they are mutually exclusive:
 *
 *   blocked  a known high-impact release is inside its clock (the stand-down above)
 *   clear    the calendar WAS read and nothing high-impact is inside its clock
 *   unknown  the calendar could not be read — NOT clear, and not a pass
 *
 * `stateOf()` is the one place that mapping lives, ordered so a known block can never be
 * masked by a read that failed later, and `unknownNote()` is the sentence shown in place of
 * an all-clear. Nothing here fetches anything or claims that a release will move price: this
 * module owns the vocabulary, `bots/index.js` owns the read.
 */
const STATES = { BLOCKED: 'blocked', CLEAR: 'clear', UNKNOWN: 'unknown' };

function stateOf({ blackout = null, unavailable = null } = {}) {
  if (blackout) return STATES.BLOCKED;
  return unavailable ? STATES.UNKNOWN : STATES.CLEAR;
}

/** The reason as a readable phrase: a string is used as-is, an Error/object contributes its
 * `message` (or a compact JSON form), and a circular or otherwise unusable value degrades to a
 * phrase rather than printing `[object Object]` at the trader. */
function reasonOf(unavailable) {
  if (unavailable == null) return '';
  if (typeof unavailable === 'string') return unavailable.trim();
  if (typeof unavailable === 'object') {
    if (typeof unavailable.message === 'string' && unavailable.message.trim()) return unavailable.message.trim();
    try { const j = JSON.stringify(unavailable); if (j && j !== '{}') return j; } catch { /* circular */ }
    return 'unreadable calendar error';
  }
  return String(unavailable);
}

function unknownNote(unavailable) {
  const reason = reasonOf(unavailable);
  const why = reason ? ` (${reason})` : '';
  return `News risk UNKNOWN — the economic calendar could not be read${why}. Nothing was checked against your stand-down windows, so this is NOT an all-clear.`;
}

function policy() {
  return {
    version: VERSION,
    states: STATES,
    unknown_is_not_clear: true,
    before: { field: BEFORE.field, default: BEFORE.default, min: BEFORE.min, max: BEFORE.max, recommended_min: BEFORE.recommended_min },
    after: { field: AFTER.field, default: AFTER.default, min: AFTER.min, max: AFTER.max, recommended_min: AFTER.recommended_min, recommended_max: AFTER.recommended_max },
    single_knob: false,
    doctrine: DOCTRINE,
    basis: BASIS,
  };
}

module.exports = { VERSION, STATES, BEFORE, AFTER, BASIS, DOCTRINE, parse, parsePair, plan, hit, detail, noteFor, stateOf, unknownNote, reasonOf, policy, invalid, LEGACY_SINGLE };
