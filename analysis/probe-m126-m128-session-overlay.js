'use strict';
/** M126: coarse UTC overlay provenance. M128: its open/next names tell the truth.
 * Kept as separate sections/measurements. TJ_APP negative tree; TJ_CONTROL parent.
 * Only prescribed Ep 12 killzones are Eastern-local; do not invent full-session ET hours.
 */
const fs = require('fs');
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc'));
const PRE = process.env.TJ_CONTROL ? require(path.join(process.env.TJ_CONTROL, 'src/bots/smc')) : null;
let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(' ok   ' + label); }
  else { fail++; console.log(' FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
const source = fs.readFileSync(path.join(APP, 'src/bots/smc.js'), 'utf8');
console.log('=== M126: explicit provenance, no invented hours ===');
ok('the module header distinguishes a COARSE UTC OVERLAY', /Session-clock provenance[\s\S]*?COARSE UTC\s*\*?\s*OVERLAY/.test(source));
ok('it explicitly says the session schedule is NOT transcript-anchored', /NOT transcript-anchored/.test(source));
ok('it documents that session quality is consulted only outside every killzone', /quality is consulted only outside every killzone/.test(source));
const want = [['sydney', 21, 6, 0.3], ['tokyo', 0, 7, 0.5], ['london', 7, 12, 0.85], ['ny_am', 12, 16, 1], ['ny_pm', 16, 21, 0.6]];
ok('every legacy UTC hour and numerical quality is preserved',
  JSON.stringify(SMC.SESSIONS.map((s) => [s.key, s.start, s.end, s.quality])) === JSON.stringify(want));
let reads = 0, qualityDiffs = 0, tableDiffs = 0, dayDiffs = 0, windowDiffs = 0;
let noteChanges = 0, nameChanges = 0, priorNameErrors = 0, nameErrors = 0, hintErrors = 0, qualityErrors = 0;
let labelChanges = 0, countdownChanges = 0; // M129's distinct presentation/cadence projection
function nextSession(st, minute) {
  return st.sessions.map((s) => ({ s, delta: ((s.start * 60 - minute + 1440) % 1440) || 1440 }))
    .sort((a, b) => a.delta - b.delta)[0].s;
}
for (const day of ['2026-01-14', '2026-07-15', '2026-03-08', '2026-11-01']) {
  for (let minute = 0; minute < 1440; minute += 15) {
    const date = new Date(Date.parse(day + 'T00:00:00Z') + minute * 60000);
    const st = SMC.sessionState(date), active = st.sessions.filter((s) => s.active);
    const bullet = st.bullets.find((b) => b.active);
    reads++;
    if (st.quality !== (bullet ? bullet.quality : active.length ? Math.max(...active.map((s) => s.quality)) : 0.3)) qualityErrors++;
    const expectedOpen = active.length ? active[0].name : null;
    const expectedNext = nextSession(st, minute);
    if (st.open_session !== expectedOpen || st.next_session.name !== expectedNext.name) nameErrors++;
    if (!bullet) {
      const nextBullet = st.bullets.filter((b) => b.minutes_to_start > 0).sort((a, b) => a.minutes_to_start - b.minutes_to_start)[0];
      if (!nextBullet || !st.note.includes(nextBullet.name) || !st.note.includes(nextBullet.window)) hintErrors++;
    }
    if (PRE) {
      const old = PRE.sessionState(date);
      if (old.quality !== st.quality) qualityDiffs++;
      if (JSON.stringify(old.sessions) !== JSON.stringify(st.sessions)) tableDiffs++;
      if (old.dow !== st.dow || old.day_name !== st.day_name || old.month !== st.month) dayDiffs++;
      if (old.in_killzone !== st.in_killzone || old.killzone !== st.killzone
        || old.bullets.some((b, i) => b.active !== st.bullets[i].active || b.quality !== st.bullets[i].quality
          || JSON.stringify(b.pairs) !== JSON.stringify(st.bullets[i].pairs))) windowDiffs++;
      for (let i = 0; i < old.bullets.length; i++) {
        if (old.bullets[i].window !== st.bullets[i].window) labelChanges++;
        if (old.bullets[i].minutes_to_start !== st.bullets[i].minutes_to_start
          || old.bullets[i].minutes_to_end !== st.bullets[i].minutes_to_end) countdownChanges++;
      }
      if (old.note !== st.note) noteChanges++;
      if (old.open_session !== st.open_session || JSON.stringify(old.next_session) !== JSON.stringify(st.next_session)) nameChanges++;
      if (old.open_session !== expectedOpen || old.next_session.name !== expectedNext.name) priorNameErrors++;
    }
  }
}
console.log(` measured: ${reads} quarter-hour reads, active/next label errors=${nameErrors}, inactive hint errors=${hintErrors}`);
if (PRE) console.log(` control: quality diffs=${qualityDiffs}, table diffs=${tableDiffs}, UTC calendar diffs=${dayDiffs}, window gate/pair diffs=${windowDiffs}, note changes=${noteChanges}; overlay-name changes=${nameChanges}, prior name errors=${priorNameErrors}`);
if (PRE) console.log(` M129 projection: ${labelChanges} UTC label changes; ${countdownChanges} countdown corrections out of ${reads * SMC.SILVER_BULLETS.length} bullet reads`);
ok('an open killzone always supplies its own quality; the overlay is fallback only', qualityErrors === 0, String(qualityErrors));
ok('the inactive hint renders the next real bullet’s own ET/UTC label, never 07:00/12:00 literals', hintErrors === 0, String(hintErrors));
if (PRE) {
  ok('M126 does not change any quality value', qualityDiffs === 0, String(qualityDiffs));
  ok('M126 does not change the coarse session table or its active windows', tableDiffs === 0, String(tableDiffs));
  ok('calendar/day boundaries remain UTC', dayDiffs === 0, String(dayDiffs));
  ok('neither metadata fix changes which killzone is open or which pairs it accepts', windowDiffs === 0, String(windowDiffs));
  ok('the new hint actually differs on an inactive window (non-vacuous)', noteChanges > 0, String(noteChanges));
}
const midnight = SMC.sessionState(new Date('2026-07-15T01:00:00Z'));
ok('New York is on the preceding date while the reported session-day remains Wednesday UTC',
  midnight.dow === 3 && midnight.day_name === 'Wednesday' && midnight.killzone === 'Asia killzone');

console.log('\n=== M128: overlay open/next names, independent of the killzones ===');
ok('all sampled open_session labels name an active session, never a closed Sydney', nameErrors === 0, String(nameErrors));
for (const [iso, open, next] of [
  ['2026-07-15T08:30:00Z', 'London', 'New York AM'],
  ['2026-07-15T13:30:00Z', 'New York AM', 'New York PM'],
  ['2026-07-15T02:30:00Z', 'Sydney', 'London'],
  ['2026-07-15T23:30:00Z', 'Sydney', 'Tokyo / Asia'],
  ['2026-07-15T00:00:00Z', 'Sydney', 'London'],
]) {
  const st = SMC.sessionState(new Date(iso));
  ok(`${iso}: active ${open}; next future opening ${next}`,
    st.open_session === open && st.next_session.name === next,
    `${st.open_session} / ${st.next_session.name}`);
}
if (PRE) ok('the parent has real overlay-name errors, and the fix changes only those labels', priorNameErrors > 0 && nameChanges === priorNameErrors,
  `parent errors=${priorNameErrors}, changed=${nameChanges}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
