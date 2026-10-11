'use strict';
/** M129 — UTC label and countdown must describe the SAME active/next NY window.
 * Both DST dates, next-day changes and sub-minute inputs. The opening gate itself
 * still uses NY wall-clock time. TJ_APP selects the pre-change negative control.
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc'));
const Now = require(path.join(APP, 'src/bots/now'));
let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(' ok   ' + label); }
  else { fail++; console.log(' FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
const read = (iso) => SMC.sessionState(new Date(iso));
const bullet = (iso, key) => read(iso).bullets.find((b) => b.key === key);
const utc = (b) => { const m = /\(([^)]+ UTC)\)/.exec(b.window); return m ? m[1] : null; };
console.log('=== active London: the label end equals the countdown end ===');
for (const [iso, label, end] of [
  ['2026-01-15T08:30:00Z', '07:00–10:00 UTC', '2026-01-15T10:00:00.000Z'],
  ['2026-07-15T07:30:00Z', '06:00–09:00 UTC', '2026-07-15T09:00:00.000Z'],
  ['2026-03-08T07:30:00Z', '07:00–09:00 UTC', '2026-03-08T09:00:00.000Z'],
  ['2026-11-01T07:30:00Z', '07:00–10:00 UTC', '2026-11-01T10:00:00.000Z'],
]) {
  const b = bullet(iso, 'london');
  ok(`${iso}: London is active`, !!b && b.active);
  ok(`${iso}: both UTC boundaries use their own IANA offset`, utc(b) === label, utc(b));
  ok(`${iso}: countdown reaches the stated real UTC end`,
    new Date(Date.parse(iso) + b.minutes_to_end * 60000).toISOString() === end, String(b.minutes_to_end));
}
console.log('\n=== repeated fall hour and next-day offset changes ===');
for (const [iso, minute, start] of [
  ['2026-11-01T04:30:00Z', 150, '2026-11-01T07:00:00.000Z'],
  ['2026-11-01T05:30:00Z', 90, '2026-11-01T07:00:00.000Z'],
  ['2026-11-01T06:30:00Z', 30, '2026-11-01T07:00:00.000Z'],
  ['2026-10-31T21:30:00Z', 570, '2026-11-01T07:00:00.000Z'],
]) {
  const b = bullet(iso, 'london');
  ok(`${iso}: London has not opened prematurely`, b.active === false);
  ok(`${iso}: countdown includes the repeated hour`, b.minutes_to_start === minute, String(b.minutes_to_start));
  const londonAt = Math.floor(Date.parse(iso) / 60000) * 60000 + b.minutes_to_start * 60000;
  ok(`${iso}: London countdown reaches that same real opening`,
    new Date(londonAt).toISOString() === start, new Date(londonAt).toISOString());
}
// Now chooses the EARLIEST next window, not necessarily London. The evening
// case above has an Asia opening before tomorrow's London; assert both separately.
for (const iso of ['2026-11-01T04:30:00Z', '2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']) {
  const n = Now.nextKillzone(Date.parse(iso));
  ok(`${iso}: earliest next window is London at 07:00 UTC`, n.key === 'london'
    && new Date(n.at).toISOString() === '2026-11-01T07:00:00.000Z', new Date(n.at).toISOString());
}
const asiaNext = Now.nextKillzone(Date.parse('2026-10-31T21:30:00Z'));
ok('before fall-change evening, Asia opens BEFORE tomorrow’s London', asiaNext.key === 'asia'
  && new Date(asiaNext.at).toISOString() === '2026-11-01T00:00:00.000Z', new Date(asiaNext.at).toISOString());
const springNext = bullet('2026-03-07T17:30:00Z', 'ny_am');
ok('tomorrow’s NY AM before the spring change is labelled with TOMORROW’s offset',
  utc(springNext) === '11:00–14:00 UTC', utc(springNext));
const fallNext = bullet('2026-10-31T17:30:00Z', 'ny_am');
ok('tomorrow’s NY AM before the fall change is labelled with TOMORROW’s offset',
  utc(fallNext) === '12:00–15:00 UTC', utc(fallNext));
for (const iso of ['2026-11-01T05:30:27.534Z', '2026-11-01T06:59:59.999Z']) {
  const n = Now.nextKillzone(Date.parse(iso));
  ok(`${iso}: request seconds do not shift the opening checkpoint`,
    new Date(n.at).toISOString() === '2026-11-01T07:00:00.000Z', new Date(n.at).toISOString());
}
console.log('\n=== exact boundaries and Asia’s midnight rollover ===');
for (const [iso, key] of [
  ['2026-03-08T06:59:59Z', null], ['2026-03-08T07:00:00Z', 'london'],
  ['2026-03-08T08:59:59Z', 'london'], ['2026-03-08T09:00:00Z', null],
  ['2026-11-01T06:59:59Z', null], ['2026-11-01T07:00:00Z', 'london'],
  ['2026-11-01T09:59:59Z', 'london'], ['2026-11-01T10:00:00Z', null],
]) {
  const st = read(iso);
  const active = st.bullets.find((b) => b.active);
  ok(`${iso}: opening gate remains ${key || 'closed'}`, (active ? active.key : null) === key, active ? active.key : 'none');
}
for (const [iso, label] of [
  ['2026-03-08T01:30:00Z', '01:00–05:00 UTC'],
  ['2026-03-09T00:30:00Z', '00:00–04:00 UTC'],
  ['2026-11-01T00:30:00Z', '00:00–04:00 UTC'],
  ['2026-11-02T01:30:00Z', '01:00–05:00 UTC'],
]) {
  const b = bullet(iso, 'asia');
  ok(`${iso}: Asia stays active across the correct NY midnight`, b.active && utc(b) === label, b.window);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
