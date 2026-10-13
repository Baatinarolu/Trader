'use strict';
/** M112 pure probe: the trading-window rule is a leaf, so its whole vocabulary can be measured with
 * no database, no server and no clock of its own — every instant is passed in. The committed parent
 * does not ship the module, and that absence is the control. */
const H = require('./m112-test-support'), { ok } = H;
const N = H.mod('src/trading-window');
const T = Date.UTC(2026, 9, 13, 12, 0);       // 12:00 UTC = 13:00 in Africa/Lagos (UTC+1)
const st = (b) => N.stateOf({ ownedZone: 'Africa/Lagos', nowMs: T, ...b });
H.finish('M112 portability: the rule is the file', async () => {
  if (!shippedOrFail()) return;
  /* ------------------------------------------------------------- the four states */
  ok('the module names exactly four states, and `unset` is not one of the two refusals', JSON.stringify(Object.values(N.STATES).sort()) === JSON.stringify(['inside', 'outside', 'unavailable', 'unset']), N.STATES);
  const un = st({});
  ok('no window selected is `unset`, blocks nothing, and says so', un.state === 'unset' && un.block === false && /blocks nothing on one/.test(un.detail), un);
  const inside = st({ start: '12:00', end: '14:00' });
  ok('a window containing the trader\u2019s local time is `inside` and blocks nothing', inside.state === 'inside' && inside.block === false && inside.in_window === true, { state: inside.state, local: inside.window.local_time });
  const outside = st({ start: '07:00', end: '10:00' });
  ok('a window that cannot contain it is `outside` and DOES block — the hard block, not a penalty', outside.state === 'outside' && outside.block === true && outside.reason === 'outside_window', outside);
  ok('the refusal names the window, the zone, the local time there and the minutes until it opens — never a generic phrase', /07:00\u201310:00 Africa\/Lagos/.test(outside.detail) && /13:00 there/.test(outside.detail) && /opens in \d+h \d+m/.test(outside.detail), outside.detail);
  ok('and it carries his own rationale for a boundary he calls a cheat code', /less screen time equal better trades/.test(outside.detail) && N.DOCTRINE.some((q) => /guardrail will prevent you from doing so/.test(q)), outside.detail.slice(-120));

  /* ------------------------------------------------- the boundary is half-open */
  ok('the start minute is INSIDE the window', st({ start: '13:00', end: '15:00' }).state === 'inside');
  ok('the end minute is OUTSIDE it — the window ends when the clock reaches its end', st({ start: '11:00', end: '13:00' }).state === 'outside');
  ok('a start later than the end runs through midnight on purpose (one Asia window, not two)', st({ start: '22:00', end: '02:00' }).state === 'outside' && N.spanHours(22 * 60, 2 * 60) === 240, N.spanHours(22 * 60, 2 * 60));
  ok('and just before that wrapped start is inside it', N.stateOf({ start: '22:00', end: '02:00', ownedZone: 'Africa/Lagos', nowMs: Date.UTC(2026, 9, 13, 22, 30) }).state === 'inside');

  /* ------------------------------------------------- unreadable is never inside */
  const bad = st({ start: '7:00', end: '10:00' });
  ok('a malformed stored clock is `unavailable` — a refusal with a repair action, never a silent pass', bad.state === 'unavailable' && bad.block === true && /Repair it in the account settings/.test(bad.detail), bad);
  ok('one side without the other is unreadable rather than half a window', st({ start: '07:00' }).state === 'unavailable' && st({ end: '10:00' }).state === 'unavailable');
  ok('two equal times are refused rather than read as "all day"', st({ start: '07:00', end: '07:00' }).state === 'unavailable');
  ok('a window with no zone at all is unreadable, and the sentence says nothing is inferred from the server clock or a session label', st({ start: '07:00', end: '10:00', ownedZone: null }).state === 'unavailable' && /nothing is inferred from the server clock or a session label/i.test(st({ start: '07:00', end: '10:00', ownedZone: null }).detail));
  ok('a missing server clock is unavailable too, not an assumed instant', N.stateOf({ start: '07:00', end: '10:00', ownedZone: 'Africa/Lagos', nowMs: null }).reason === 'clock_unavailable');
  ok('`safeState` cannot throw: even a stored row whose field explodes on read comes back as the module\u2019s own refusal', (() => {
    const hostile = { ownedZone: 'Africa/Lagos', nowMs: T, get start() { throw new Error('boom'); } };
    const out = N.safeState(hostile);
    return out.state === 'unavailable' && out.block === true && /boom/.test(out.detail);
  })());
  ok('the time parser accepts exactly HH:MM and coerces nothing else (surrounding blanks are trimmed, the clock itself is not guessed)', ['07:00', '00:00', '23:59'].every((v) => N.parseTime(v, 'start') === v) && N.parseTime(' 07:00 ', 'start') === '07:00'
    && ['7:00', '0700', '07:00:00', '24:00', '07:60', true, 7, [], {}, '07:0a', 'Seven'].every((v) => throws(() => N.parseTime(v, 'start'))), null);
  ok('and blank means "not set" rather than invalid, so clearing a window is a real choice', N.parseTime('', 'start') === null && N.parseTime('   ', 'start') === null && N.parseTime(null, 'start') === null && N.parseTime(undefined, 'start') === null);

  /* ------------------------------------------------- the zone it was authored in */
  const moved = st({ start: '07:00', end: '10:00', timezone: 'Europe/London', ownedZone: 'Africa/Lagos' });
  ok('a window authored in a zone the trader has since changed is UNAVAILABLE, and both zones are named — a hard boundary never moves on a new clock', moved.state === 'unavailable' && moved.reason === 'window_zone_changed' && /Europe\/London/.test(moved.detail) && /Africa\/Lagos/.test(moved.detail), moved.detail);
  ok('an offset or abbreviation is not a zone: the module would not follow its daylight-saving rule', !N.zoneOk('+01:00') && !N.zoneOk('GMT+1') && !N.zoneOk('-05:00') && !N.zoneOk('') && !N.zoneOk(null) && !N.zoneOk(7) && N.zoneOk('UTC') && N.zoneOk('Africa/Lagos') && N.zoneOk('America/New_York'));
  ok('the zone actually drives the answer: the same pair is outside at one instant and inside at another', st({ start: '07:00', end: '10:00' }).state === 'outside' && st({ start: '12:30', end: '13:30' }).state === 'inside');

  /* ------------------------------------------------- the derived suggestion */
  const rows = (hours) => hours.map((h) => ({ hour: h, net_pnl: 10 }));
  const good = N.suggest({ bucket: { label: 'London', trades: 40, net: 900 }, rows: rows([7, 8, 8, 9, 9, 10, 11]), zone: 'Africa/Lagos' });
  ok('the suggestion is labelled as the trader\u2019s own recorded journal, with the bucket, the count and the floor', good.available === true && good.source === 'from_session_history' && good.floor === 30 && /London/.test(good.detail) && /40 closed trades/.test(good.detail), good.detail);
  ok('it is explicitly NOT a prediction, an edge or a permission, and it is not applied by the module', /not a prediction, not a market edge and not a permission/.test(good.basis) && good.applied === false);
  const low = N.suggest({ bucket: { label: 'London', trades: 12, net: 90 }, rows: rows([8, 9]), zone: 'Africa/Lagos' });
  ok('below the course\u2019s 30-trade review floor nothing is suggested at all — the description is withheld rather than presented as a window', low.available === false && low.reason === 'below_review_floor' && !low.window, low.reason_detail);
  ok('with no closed recorded session there is nothing to derive, and it says which fact is missing', N.suggest({ bucket: null, rows: [], zone: 'Africa/Lagos' }).reason === 'no_recorded_session');
  ok('without the trader\u2019s own zone the suggestion is refused rather than computed on another clock', N.suggest({ bucket: { label: 'London', trades: 40, net: 1 }, rows: rows([8]), zone: null }).reason === 'zone_required');
  ok('entries spread around the clock yield NO single band rather than a stretched one', N.suggest({ bucket: { label: 'London', trades: 40, net: 1 }, rows: rows([1, 5, 9, 13, 17, 21]), zone: 'Africa/Lagos' }).reason === 'no_single_band');
  ok('a band around midnight is ONE band on the clock, not a 0-width or inside-out pair', JSON.stringify(N.hourBand([23, 23, 0, 0, 1])) === JSON.stringify({ start: '23:00', end: '01:00', span_hours: 2, middle_50: true }), N.hourBand([23, 23, 0, 0, 1]));
  ok('the band is the middle 50 % of the recorded hours, rounded outward to whole hours', JSON.stringify(N.hourBand([7, 8, 8, 9, 9, 10, 11])) === JSON.stringify({ start: '08:00', end: '12:00', span_hours: 4, middle_50: true }), N.hourBand([7, 8, 8, 9, 9, 10, 11]));

  /* ------------------------------------------------- the merge into a personal state */
  const daily = { status: 'clear', message: 'clear', breaches: [], permission: { allowed: true, can_override: false, state: 'clear' } };
  const blocked = N.apply({ ...daily }, outside);
  ok('a blocking window becomes the SAME kind of stop the personal guardrails produce, and it cannot be overridden', blocked.status === 'stop' && blocked.permission.allowed === false && blocked.permission.can_override === false && blocked.breaches[0].rule === 'trading_window_outside', blocked.permission);
  ok('an unreadable window blocks as its own rule, so a repair is named rather than a boundary invented', N.apply({ ...daily }, bad).breaches[0].rule === 'trading_window_window_value_unreadable');
  ok('`unset` is published and blocks nothing — the difference between "you selected none" and "it could not be read" survives the merge', (() => { const o = N.apply({ ...daily }, un); return o.status === 'clear' && o.breaches.length === 0 && o.trading_window.state === 'unset'; })());
  const existing = { status: 'stop', message: 'Stand down: something else', breaches: [{ rule: 'pre_market_routine', detail: 'x' }], permission: { allowed: false, can_override: true, state: 'stopped' } };
  const merged = N.apply({ ...existing, breaches: [...existing.breaches] }, outside);
  ok('an existing stop is never hidden: the window appends its own breach and can only make the refusal stricter', merged.status === 'stop' && merged.breaches.length === 2 && merged.breaches[0].rule === 'pre_market_routine' && merged.permission.can_override === false, merged.breaches.map((b) => b.rule));
  ok('the module writes nothing: no store, no clock, no counter is touched by an evaluation', !/require\(/.test(require('fs').readFileSync(require('path').join(H.APP, 'src/trading-window.js'), 'utf8')));
  ok('and the settings note warns without repairing: a window covering most of the clock is reported, not shortened', (() => {
    const wide = N.stateOf({ start: '00:00', end: '20:00', ownedZone: 'Africa/Lagos', nowMs: T });
    const note = N.noteFor(wide);
    return note.warnings.some((w) => w.code === 'window_covers_most_of_the_day') && wide.window.end === '20:00';
  })());
});
function throws(fn) { try { fn(); return false; } catch { return true; } }
function shippedOrFail() { return H.shipped(N, 'the M112 trading-window module'); }
