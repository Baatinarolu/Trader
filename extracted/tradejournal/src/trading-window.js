'use strict';
/**
 * M112 — the trading window: the trader's own best-hours boundary.
 *
 * Ep31 states the guardrail and where it comes from: *"for a trading window, you only want to set
 * your best session window… on data, based on historical performance, what is the time window that
 * you tend to perform the best in?"*, and his own answer is a window in a named zone —
 * *"based on my data, I figured out that my trades tend to work out really really well during the
 * London Q-Zone… 7:00 a.m. UTC to around 10:00 a.m. UTC."* He uses it as an overtrading control
 * (*"Edge Flow fixes that with max trades per day and a shorter trading window. So, you're only
 * trading your best hours."*), and `ixmTrvUB1Ks` settles its SHAPE: *"you can select a window in
 * which you want to be trading within… if you try to trade outside of this window, the guardrail
 * will prevent you from doing so."* — a hard block, not a scored penalty. The rationale:
 * *"just because the Forex market is open 24 hours a day, doesn't mean you should be trading 24
 * hours a day. For most traders, less screen time equal better trades"*, and he calls it *"a cheat
 * code if you struggle with impulse trades."*
 *
 * This module is a LEAF, like `news-window.js`: no requires, no environment, no filesystem, no
 * database and no clock of its own (`nowMs` is passed in), so the rule is the file and it answers
 * identically when copied out of the tree. It owns four things and nothing else:
 *
 *   1. the WINDOW vocabulary — `unset` / `inside` / `outside` / `unavailable` — where an
 *      UNREADABLE stored window is never silently "inside" (that would open the gate the trader
 *      asked to close), and `unset` is NOT `outside` (no window selected blocks nothing);
 *   2. the boundary rule, half-open `[start, end)` on the trader's own local clock: the start
 *      minute is inside, the end minute is outside, and a window whose start is later than its end
 *      runs through midnight on purpose (an Asia session that starts at 22:00 is one window);
 *   3. the refusal of anything that cannot be evaluated honestly — a malformed time, a window
 *      authored in a DIFFERENT zone than the account's owned zone, a missing zone, a degenerate
 *      pair — each with one sentence and one repair action;
 *   4. the DERIVED suggestion: the middle 50 % band of the trader's own recorded entry hours inside
 *      their best recorded session, labelled as a description of their journal, refused entirely
 *      below the course's own 30-trade review floor, and never applied without them accepting it.
 *
 * What it does NOT do: it does not retune the existing weight-8 session/killzone row, it does not
 * claim a market edge, it does not say an hour will be profitable, and it does not decide anything
 * about a broker. It reads the trader's own stored setting and their own recorded journal.
 */
const VERSION = 'trading-window-v1';
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const STATES = { UNSET: 'unset', INSIDE: 'inside', OUTSIDE: 'outside', UNAVAILABLE: 'unavailable' };
const SOURCES = { MANUAL: 'manual', FROM_HISTORY: 'from_session_history' };
const FLOOR = 30;            // the course's 30-trade review floor, reused — never retuned here
const MAX_SPAN_HOURS = 12;   // a "best hours" band wider than half the clock describes nothing
const WIDE_WARNING_HOURS = 16;
const BASIS = 'Your own recorded journal outcomes, described as they were recorded. This is not a '
  + 'prediction, not a market edge and not a permission: the window is a boundary you own, and '
  + 'outside it the guardrail refuses the entry.';
const DOCTRINE = [
  '"For a trading window, you only want to set your best session window… on data, based on historical performance, what is the time window that you tend to perform the best in?"',
  '"Edge Flow fixes that with max trades per day and a shorter trading window. So, you\'re only trading your best hours."',
  '"If you try to trade outside of this window, the guardrail will prevent you from doing so."',
  '"Just because the Forex market is open 24 hours a day, doesn\'t mean you should be trading 24 hours a day. For most traders, less screen time equal better trades."',
];

function invalid(message, code = 'trading_window_invalid') {
  const e = new Error(message);
  e.status = 400;
  e.code = code;
  return e;
}

/** Strict `HH:MM` on a 24-hour clock. Nothing is coerced: `7:00`, `0700`, `07:00:00`, `24:00`,
 * `7.0` and booleans are refusals rather than guesses, because a boundary the app guessed is a
 * boundary the trader does not own. */
function parseTime(value, side) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  if (typeof value !== 'string') throw invalid(`The ${side} of the trading window must be a HH:MM clock time or blank.`);
  const text = value.trim();
  if (!TIME.test(text)) throw invalid(`The ${side} of the trading window must be HH:MM on a 24-hour clock (for example 07:00).`);
  return text;
}

function minutesOf(hhmm) {
  const m = typeof hhmm === 'string' ? TIME.exec(hhmm) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Both sides or neither; equal sides are refused rather than read as "all day". */
function parsePair(input = {}) {
  const start = parseTime(input.window_start, 'start');
  const end = parseTime(input.window_end, 'end');
  if ((start === null) !== (end === null)) {
    throw invalid('A trading window needs both a start and an end, or neither. One side alone is not a window.', 'trading_window_incomplete');
  }
  if (start !== null && start === end) {
    throw invalid('A trading window whose start equals its end is refused: it is either no window or the whole clock, and this app will not choose for you.', 'trading_window_degenerate');
  }
  const zone = input.window_timezone === null || input.window_timezone === undefined ? null
    : (typeof input.window_timezone === 'string' && !input.window_timezone.trim() ? null : String(input.window_timezone).trim());
  return { start, end, timezone: zone, set: start !== null };
}

/** An explicit IANA zone, validated by asking the runtime to format with it. Offsets such as
 * `UTC+1` and abbreviations are refused: they are not the trader's own zone and they follow no
 * daylight-saving rule, so a window in one would silently move twice a year. */
function zoneOk(zone) {
  if (typeof zone !== 'string' || !zone.trim() || zone.length > 100 || /^[+-]/.test(zone.trim())) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone.trim() }).format(0); return true; } catch { return false; }
}

const FORMATTERS = new Map();
function parts(ms, zone) {
  let fmt = FORMATTERS.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    FORMATTERS.set(zone, fmt);
  }
  const out = {};
  for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = p.value;
  const hour = Number(out.hour) % 24;
  return { date: `${out.year}-${out.month}-${out.day}`, hour, minute: Number(out.minute), minutes: hour * 60 + Number(out.minute), hhmm: `${String(hour).padStart(2, '0')}:${out.minute}` };
}

/** Half-open `[start, end)`, wrapping midnight when the start is later than the end. */
function inside(startMin, endMin, cursorMin) {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || !Number.isFinite(cursorMin)) return null;
  return endMin > startMin ? (cursorMin >= startMin && cursorMin < endMin) : (cursorMin >= startMin || cursorMin < endMin);
}

function spanHours(startMin, endMin) {
  const raw = endMin > startMin ? endMin - startMin : (1440 - startMin) + endMin;
  return raw % 1440;
}

function note(win, extra = '') {
  if (!win || win.state === STATES.UNSET) {
    return 'No trading window is selected, so this app blocks nothing on one. Your own best hours can come from your recorded journal — the suggestion is labelled as such, and only you can accept it.' + (extra ? ' ' + extra : '');
  }
  if (win.state === STATES.UNAVAILABLE) return win.detail;
  const span = win.window && Number.isFinite(win.window.span_minutes) ? win.window.span_minutes : null;
  const tz = win.window ? win.window.timezone : null;
  return `Your trading window is ${win.window.start}–${win.window.end}${tz ? ' ' + tz : ''}${span === null ? '' : ` (${Math.round(span / 60 * 10) / 10} hours)`}`
    + `, ${win.window.source === SOURCES.FROM_HISTORY ? 'accepted from your own recorded journal' : 'set by you'}.`
    + (extra ? ' ' + extra : '');
}

/**
 * The one evaluation. `account` is the stored row (a plain object), `nowMs` the server clock.
 * `outsideAvailableZone` is the account's CURRENT owned zone (the routine's own explicit IANA
 * setting), so a window authored in a zone the trader has since changed is reported as unavailable
 * with both zones named instead of being silently reinterpreted on the new clock — a hard boundary
 * must not move because another setting changed.
 */
function stateOf({ start = null, end = null, timezone = null, ownedZone = null, source = null, nowMs = null } = {}) {
  const base = { version: VERSION, window: { start, end, timezone, source, span_minutes: null }, in_window: null, until: null };
  // Three different things, deliberately not collapsed: BLANK is no window (nothing is blocked),
  // MALFORMED is an unreadable window (refused, repair one action away), and two different
  // well-formed times are the window itself.
  const s = rawTime(start), e = rawTime(end);
  if (s === undefined || e === undefined) {
    return unavailable(base, 'window_value_unreadable', 'The stored trading window could not be read as two well-formed HH:MM times. Repair it in the account settings — until then this guardrail refuses the entry rather than opening it.');
  }
  if (s === null && e === null) {
    return { ...base, state: STATES.UNSET, block: false, reason: 'no_window_selected',
      detail: note({ state: STATES.UNSET }), suggestion_available: true };
  }
  if (s === null || e === null || s === e) {
    return unavailable(base, 'window_value_unreadable', 'The stored trading window has one side without the other (or two equal sides), which is not a window. Repair it in the account settings — until then this guardrail refuses the entry rather than opening it.');
  }
  if (!Number.isFinite(nowMs)) {
    return unavailable(base, 'clock_unavailable', 'The server clock could not be read, so your trading window cannot be evaluated. Nothing was assumed.');
  }
  const zone = timezone || ownedZone;
  if (!zoneOk(zone)) {
    return unavailable(base, timezone ? 'window_zone_invalid' : 'window_zone_missing',
      timezone ? 'The zone this trading window was set in is not a valid IANA timezone. Re-select it in the account settings — the window is not applied on a guessed zone.'
        : 'This trading window has no zone. Select your own local timezone first, then re-save the window; nothing is inferred from the server clock or a session label.');
  }
  if (timezone && ownedZone && timezone !== ownedZone) {
    return unavailable(base, 'window_zone_changed',
      `This trading window was set in ${timezone}, but your selected local timezone is now ${ownedZone}. Nothing was reinterpreted on the new clock: re-save the window in ${ownedZone} (or change it back), because a hard boundary must not move when another setting does.`,
      { start: s, end: e, timezone, owned_zone: ownedZone, source, span_minutes: spanHours(minutesOf(s), minutesOf(e)) });
  }
  const startMin = minutesOf(s), endMin = minutesOf(e);
  const local = parts(nowMs, zone);
  const inWindow = inside(startMin, endMin, local.minutes);
  const span = spanHours(startMin, endMin);
  const win = { start: s, end: e, timezone: zone, source: source || SOURCES.MANUAL, span_minutes: span, local_time: local.hhmm, local_date: local.date };
  // Minutes until the window next opens (0 when already inside): computed on the trader's clock.
  const until = inWindow ? 0 : (startMin - local.minutes + 1440) % 1440;
  const shared = { ...base, window: win, in_window: inWindow, until_minutes: until, span_exceeds_half_clock: span > MAX_SPAN_HOURS * 60 };
  const quote = '"Just because the Forex market is open 24 hours a day, doesn\'t mean you should be trading 24 hours a day. For most traders, less screen time equal better trades."';
  if (inWindow) {
    return { ...shared, state: STATES.INSIDE, block: false, reason: 'inside_window',
      detail: `Inside your trading window (${s}–${e}${zone ? ' ' + zone : ''}; it is ${local.hhmm} there). This is a boundary, not a permission: every other guardrail still decides the entry.` };
  }
  return { ...shared, state: STATES.OUTSIDE, block: true, reason: 'outside_window',
    detail: `Outside your trading window — ${s}–${e}${zone ? ' ' + zone : ''}, and it is ${local.hhmm} there (it opens in ${Math.floor(until / 60)}h ${until % 60}m). The guardrail prevents the entry rather than scoring it. ${quote}` };
}

/** `null` = blank, `undefined` = present but unreadable, string = a well-formed HH:MM. */
function rawTime(value) {
  try { return parseTime(value, 'side'); } catch { return undefined; }
}

function unavailable(base, reason, detail, window = null) {
  return { ...base, ...(window ? { window } : {}), state: STATES.UNAVAILABLE, block: true, reason, detail, in_window: null, until_minutes: null };
}

/** Never a pass, never a crash: an unreadable row is the module's own sentence. */
function safeState(input = {}) {
  try { return stateOf(input); } catch (e) {
    return unavailable({ version: VERSION, window: { start: null, end: null, timezone: null, source: null, span_minutes: null }, in_window: null, until: null },
      'window_unavailable', `The trading window could not be evaluated (${e && e.message ? e.message : 'unknown error'}). Nothing was assumed and the entry is refused until it can be read.`);
  }
}

/* ---------------------------------------------------------------- the derived suggestion */

/** Circular percentiles: recorded entry hours live on a clock, so 23:00 and 01:00 are neighbours.
 * The band is the middle 50 % of the bucket's entry hours, rounded outward to whole hours, and it
 * is refused (never softened) when the bucket is below the review floor or spread around the
 * clock. */
function hourBand(hours) {
  const hs = (hours || []).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  if (!hs.length) return null;
  const angles = hs.map((h) => (h / 24) * 2 * Math.PI);
  const cx = angles.reduce((s, a) => s + Math.cos(a), 0), cy = angles.reduce((s, a) => s + Math.sin(a), 0);
  if (Math.abs(cx) < 1e-9 && Math.abs(cy) < 1e-9) return { spread_across_the_clock: true, start: null, end: null };
  const centre = Math.atan2(cy, cx);
  const rotated = hs.map((h) => {
    const a = (h / 24) * 2 * Math.PI;
    let d = a - centre;
    while (d <= -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    return (d / (2 * Math.PI)) * 24;
  }).sort((a, b) => a - b);
  const at = (p) => rotated[Math.min(rotated.length - 1, Math.max(0, Math.ceil(p * rotated.length) - 1))];
  const wrap = (x) => ((Math.round(x) % 24) + 24) % 24;
  const lo = wrap(Math.floor(centre / (2 * Math.PI) * 24 + at(0.25)));
  const hi = wrap(Math.ceil(centre / (2 * Math.PI) * 24 + at(0.75)) + 1);
  if (lo === hi) return { spread_across_the_clock: true, start: null, end: null };
  const span = spanHours(lo * 60, hi * 60);
  if (span > MAX_SPAN_HOURS * 60) return { spread_across_the_clock: true, start: null, end: null };
  return { start: `${String(lo).padStart(2, '0')}:00`, end: `${String(hi).padStart(2, '0')}:00`, span_hours: span / 60, middle_50: true };
}

/**
 * The derived candidate. `bucket` is one `by_session` row exactly as `performance.js` computes it
 * (`{ label, trades, net, win_rate, ... }`), `rows` the same bucket's decorated trades
 * (`{ hour, net_pnl }`), `zone` the account's owned zone. Below the review floor nothing is
 * suggested at all: a window derived from too few trades would be a guess wearing a measurement's
 * clothes, and it is reported as `below_review_floor` rather than softened.
 */
function suggest({ bucket = null, rows = [], zone = null, floor = FLOOR, sample_ready = null } = {}) {
  const meta = { version: VERSION, source: SOURCES.FROM_HISTORY, floor, basis: BASIS, doctrine: DOCTRINE, applied: false };
  if (!bucket || !Number.isInteger(bucket.trades) || bucket.trades <= 0) {
    return { ...meta, available: false, reason: 'no_recorded_session', reason_detail: 'No closed trade in this journal carries a recorded session yet, so there is nothing to derive a window from.' };
  }
  const ready = sample_ready === null ? bucket.trades >= floor : !!sample_ready;
  if (!ready) {
    return { ...meta, available: false, reason: 'below_review_floor', session: { label: bucket.label, trades: bucket.trades, net: bucket.net === undefined ? null : bucket.net },
      reason_detail: `Your best recorded session (${bucket.label}) holds ${bucket.trades} closed trade${bucket.trades === 1 ? '' : 's'}, below the course's ${floor}-trade review floor. Nothing is suggested from it — the description is withheld rather than presented as a window.` };
  }
  if (!zoneOk(zone)) {
    return { ...meta, available: false, reason: 'zone_required', session: { label: bucket.label, trades: bucket.trades },
      reason_detail: 'Select your own local timezone first: a window derived on any other clock would not be yours.' };
  }
  const band = hourBand((rows || []).map((r) => (Number.isInteger(r.hour) ? r.hour : null)));
  if (!band || band.spread_across_the_clock) {
    return { ...meta, available: false, reason: 'no_single_band', session: { label: bucket.label, trades: bucket.trades },
      reason_detail: `Your recorded ${bucket.label} entries are spread around the clock, so no single best-hours band describes them. Pick the window yourself rather than accept a band the data does not support.` };
  }
  return { ...meta, available: true, reason: 'derived_from_your_journal', session: { label: bucket.label, trades: bucket.trades, net: bucket.net === undefined ? null : bucket.net, win_rate: bucket.win_rate === undefined ? null : bucket.win_rate, net_is_best: true },
    window: { start: band.start, end: band.end, timezone: zone, source: SOURCES.FROM_HISTORY },
    detail: `${bucket.label} holds ${bucket.trades} closed trades and is your best recorded session by net result. The middle of those entries clocks ${band.start}–${band.end} ${zone} (${band.span_hours} hour${band.span_hours === 1 ? '' : 's'}). Accept it as your window, edit it, or keep none.` };
}

/**
 * Merge the window into the desk's personal state, in the same shape `state-gate.js` uses: a
 * blocking window becomes the kind of stop the existing guardrails already produce, so
 * `Guards.applyToSetups`, the admission path, the Now playlist and every scan row refuse the
 * signal through code that is already measured. It ADDS a stop and never removes one: an existing
 * `unknown`/`stop` (or an existing breach list) is preserved and the window's own sentence is
 * appended, so nothing that was already refusing can be hidden behind this rule.
 *
 * `unset` publishes the state and blocks nothing — that is the whole difference between "you
 * selected no window" and "your window could not be read", and collapsing the two would either
 * invent a boundary or open a gate.
 */
function apply(daily, win) {
  if (!daily || !win) return daily;
  const out = { ...daily, trading_window: win };
  if (!win.block) return out;
  const rule = win.reason === 'outside_window' ? 'trading_window_outside' : `trading_window_${win.reason}`;
  const detail = win.detail;
  return {
    ...out,
    breaches: [...(daily.breaches || []), { rule, detail, trading_window: true, state: win.state }],
    status: 'stop',
    message: 'Stand down: ' + detail,
    permission: { ...(daily.permission || {}), allowed: false, can_override: false, state: 'trading_window', message: 'Stand down: ' + detail },
  };
}

/** The settings-facing note for a stored window: names what is set, warns without repairing. */
function noteFor(win, warnings = []) {
  const out = { version: VERSION, state: win && win.state ? win.state : STATES.UNSET, note: note(win), warnings: [...warnings] };
  if (win && win.window && win.window.start) {
    const span = spanHours(minutesOf(win.window.start), minutesOf(win.window.end));
    if (span > WIDE_WARNING_HOURS * 60) out.warnings.push({ code: 'window_covers_most_of_the_day', message: `This window covers ${Math.round(span / 60)} of the clock's 24 hours, so it refuses very little. He is describing "a shorter trading window"; the number is yours to choose.` });
    if (span > MAX_SPAN_HOURS * 60) out.warnings.push({ code: 'window_wider_than_best_hours', message: 'A window wider than half the clock does not describe "your best hours" — it is still applied as you set it.' });
  }
  return out;
}

module.exports = { VERSION, STATES, SOURCES, FLOOR, MAX_SPAN_HOURS, WIDE_WARNING_HOURS, BASIS, DOCTRINE, TIME_RE: TIME, apply, invalid, parseTime, parsePair, minutesOf, zoneOk, parts, inside, spanHours, stateOf, safeState, hourBand, suggest, note, noteFor };
