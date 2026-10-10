/* M37 — the two killzone constants were encoded against two different Eastern offsets.
 *
 * Run from the REPO ROOT:  node analysis/probe-m37-killzone-offsets.js
 *
 * Pristine `SILVER_BULLETS` was fixed UTC hours: London 06:00-09:00, NY AM 12:00-15:00,
 * NY PM 15:00-18:00. Checked numerically, London reproduced his 02:00-05:00 ET only at
 * UTC-4 while NY AM reproduced 07:00-10:00 ET only at UTC-5 — they could not both be
 * right, and the loser was NY AM: at 11:00 UTC, the first hour of his New York killzone
 * in summer, `in_killzone` returned false.
 *
 * M5 (patch `analysis/0002-fix-killzone-dst.patch`) fixed the mechanism: the windows are
 * stated in New York time and converted at call time through `Intl.DateTimeFormat` +
 * `America/New_York`. This probe is the guard that keeps them from drifting apart again.
 *
 * NOTE on the row's prescription. Its first half — "set NY AM killzone to 11:00-14:00
 * UTC" — must NOT be applied literally now. 11:00-14:00 UTC is his window only while New
 * York is on daylight time; in EST the same window is 12:00-15:00 UTC. Hardcoding either
 * pair re-creates exactly the defect this row describes. Assertions 5 and 6 below fail on
 * purpose if anyone does.
 */
const path = require('path');
/* TJ_APP lets this probe be pointed at another copy of the app — used as a negative
 * control against the pristine zip, where these assertions must FAIL. A guard that passes
 * on both trees guards nothing. */
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc.js'));

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         ' + detail : '')); }
}

/* An EST date and an EDT date, both well clear of the March/November transitions. */
const EST = '2026-01-15';   // New York = UTC-5
const EDT = '2026-07-15';   // New York = UTC-4
const at = (iso) => SMC.sessionState(new Date(iso));
const activeName = (iso) => (at(iso).bullets.find((b) => b.active) || {}).name || null;
const utcPart = (iso, name) => {
  const b = at(iso).bullets.find((x) => x.name === name) || {};
  const m = /\((\d{2}):(\d{2}).*?(\d{2}):(\d{2})\s*UTC\)/.exec(b.window || '');
  return m ? { s: Number(m[1]) * 60 + Number(m[2]), e: Number(m[3]) * 60 + Number(m[4]), raw: b.window } : null;
};
const hm = (h, m) => h * 60 + (m || 0);

console.log('\n=== 1. The constants are Eastern wall-clock, not UTC hours ===');
{
  const byName = {};
  for (const b of SMC.SILVER_BULLETS) byName[b.name] = b;
  const want = {
    'London killzone': [2, 5], 'NY AM killzone': [7, 10],
    'NY PM killzone': [10, 12], 'Asia killzone': [20, 24],
  };
  for (const name of Object.keys(want)) {
    const b = byName[name];
    ok(name + ' is stated as ' + want[name][0] + ':00-' + want[name][1] + ':00 ET',
      !!b && b.startH === want[name][0] && b.startM === 0 && b.endH === want[name][1] && b.endM === 0,
      b ? JSON.stringify({ startH: b.startH, endH: b.endH }) : 'missing');
  }
  ok('none of them is encoded as a UTC hour (6/9, 12/15, 15/18 were the pristine values)',
    !SMC.SILVER_BULLETS.some((b) => (b.startH === 6 && b.endH === 9) || (b.startH === 15 && b.endH === 18)),
    JSON.stringify(SMC.SILVER_BULLETS.map((b) => [b.name, b.startH, b.endH])));
}

console.log('\n=== 2. The row\'s headline measurement: 11:00 UTC in summer IS his NY killzone ===');
{
  ok('NY AM killzone is OPEN at 11:00 UTC on an EDT date (pristine said false)',
    activeName(EDT + 'T11:00:00Z') === 'NY AM killzone' && at(EDT + 'T11:00:00Z').in_killzone === true,
    'active=' + activeName(EDT + 'T11:00:00Z'));
  ok('and closed one minute earlier at 10:59 UTC',
    activeName(EDT + 'T10:59:00Z') === null && at(EDT + 'T10:59:00Z').in_killzone === false,
    'active=' + activeName(EDT + 'T10:59:00Z'));
  ok('NY AM closes at 14:00 UTC on an EDT date (NY PM takes over)',
    activeName(EDT + 'T13:59:00Z') === 'NY AM killzone' && activeName(EDT + 'T14:00:00Z') === 'NY PM killzone',
    activeName(EDT + 'T13:59:00Z') + ' -> ' + activeName(EDT + 'T14:00:00Z'));
}

console.log('\n=== 3. Winter: the same ET window sits one UTC hour later ===');
{
  ok('NY AM is CLOSED at 11:00 UTC on an EST date (06:00 ET)',
    activeName(EST + 'T11:00:00Z') === null, 'active=' + activeName(EST + 'T11:00:00Z'));
  ok('NY AM is OPEN at 12:00 UTC on an EST date (07:00 ET)',
    activeName(EST + 'T12:00:00Z') === 'NY AM killzone', 'active=' + activeName(EST + 'T12:00:00Z'));
}

console.log('\n=== 4. Both windows move together — the two constants cannot disagree ===');
{
  const lonEst = utcPart(EST + 'T12:00:00Z', 'London killzone');
  const lonEdt = utcPart(EDT + 'T12:00:00Z', 'London killzone');
  const nyEst = utcPart(EST + 'T12:00:00Z', 'NY AM killzone');
  const nyEdt = utcPart(EDT + 'T12:00:00Z', 'NY AM killzone');
  const haveLabels = !!(lonEst && lonEdt && nyEst && nyEdt);
  ok('the UTC label is present for both windows on both dates', haveLabels,
    'london EST=' + JSON.stringify(lonEst && lonEst.raw) + ' NY EDT=' + JSON.stringify(nyEdt && nyEdt.raw));
  /* Guarded as a block: a run against the pristine tree has no UTC label at all — its
   * windows ARE fixed UTC hours — so these four would dereference null. Skipping them
   * keeps the negative control reporting a tally instead of crashing, and on the current
   * tree all four run. */
  if (haveLabels) {
    ok('London is 07:00-10:00 UTC in EST and 06:00-09:00 UTC in EDT',
      lonEst.s === hm(7) && lonEst.e === hm(10) && lonEdt.s === hm(6) && lonEdt.e === hm(9),
      'EST=' + lonEst.raw + ' EDT=' + lonEdt.raw);
    ok('NY AM is 12:00-15:00 UTC in EST and 11:00-14:00 UTC in EDT',
      nyEst.s === hm(12) && nyEst.e === hm(15) && nyEdt.s === hm(11) && nyEdt.e === hm(14),
      'EST=' + nyEst.raw + ' EDT=' + nyEdt.raw);
    ok('both shifted by exactly one hour — same clock, same offset, no drift',
      (lonEst.s - lonEdt.s) === 60 && (nyEst.s - nyEdt.s) === 60,
      'london shift=' + (lonEst.s - lonEdt.s) + ' ny shift=' + (nyEst.s - nyEdt.s));
    ok('the gap between London close and NY AM open is 2 hours in BOTH seasons',
      (nyEst.s - lonEst.e) === 120 && (nyEdt.s - lonEdt.e) === 120,
      'EST gap=' + (nyEst.s - lonEst.e) + ' EDT gap=' + (nyEdt.s - lonEdt.e));
  } else {
    console.log('  (four label-based assertions skipped — this tree has no UTC label)');
  }
}

console.log('\n=== 5. Guard against re-hardcoding a fixed UTC pair ===');
{
  /* If someone "fixes" this by writing 11:00-14:00 UTC into the constant, winter breaks;
   * if they write 12:00-15:00 UTC, summer breaks. Either way one of these two fails. */
  const summerOpen = activeName(EDT + 'T11:00:00Z') === 'NY AM killzone';
  const winterOpen = activeName(EST + 'T12:00:00Z') === 'NY AM killzone';
  ok('the window is correct in summer AND winter simultaneously (a fixed UTC pair cannot be)',
    summerOpen && winterOpen, 'summer=' + summerOpen + ' winter=' + winterOpen);
  const winterClosed = activeName(EST + 'T11:00:00Z') === null;
  const summerClosed = activeName(EDT + 'T15:00:00Z') === null || activeName(EDT + 'T15:00:00Z') === 'NY PM killzone';
  ok('and it is NOT open an hour early in winter / an hour late in summer',
    winterClosed && summerClosed, 'winter 11:00Z=' + activeName(EST + 'T11:00:00Z') + ' summer 15:00Z=' + activeName(EDT + 'T15:00:00Z'));
}

console.log('\n=== 6. Asia (added by M38) rides the same clock ===');
{
  ok('Asia is open at 03:00 UTC on an EDT date (23:00 ET)',
    activeName(EDT + 'T03:00:00Z') === 'Asia killzone', activeName(EDT + 'T03:00:00Z'));
  ok('Asia is closed at 04:00 UTC on an EDT date (00:00 ET)',
    activeName(EDT + 'T04:00:00Z') === null, activeName(EDT + 'T04:00:00Z'));
  ok('Asia is open at 04:00 UTC on an EST date (23:00 ET)',
    activeName(EST + 'T04:00:00Z') === 'Asia killzone', activeName(EST + 'T04:00:00Z'));
}

console.log('\n' + pass + ' passed / ' + fail + ' failed');
process.exit(fail ? 1 : 0);
