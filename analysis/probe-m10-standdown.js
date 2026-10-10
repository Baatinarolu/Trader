'use strict';
/**
 * probe-m10-standdown.js — does Ep 19's stand-down actually filter B and C?
 *
 * WHY THIS EXISTS
 *   M10 demotes B and C to 'no-trade' on Monday, Friday and December while leaving A
 *   and A+ untouched, per the course's own exception ("if a setup meets my criteria, I
 *   will take the trade regardless of the day"). That exemption is the whole design and
 *   it is also the part most likely to be wrong: a filter implemented as another score
 *   cap would flatten A+ too, and a filter that fires when the calendar is MISSING would
 *   stand down every short-series analysis. Neither shows up in the app suites, because
 *   they run on whatever day it happens to be — and on a Saturday the filter is inert, so
 *   a live check proves nothing.
 *
 *   So this drives both layers directly: the pure policy function across every day and
 *   month, and the real engine on REAL Monday/Friday/Tuesday bars from the recovered
 *   fixtures, where the weekday is a fact rather than a coincidence of the run date.
 *
 *   Every assertion prints the denominator it compared. A band with no candidates in it
 *   is reported as UNTESTED, never as a pass.
 *
 *   node analysis/probe-m10-standdown.js
 */
const path = require('path');
const fs = require('fs');

const APP = process.env.TJ_ROOT
  ? path.resolve(process.env.TJ_ROOT)
  : path.join(__dirname, '..', 'extracted', 'tradejournal');
const Setup = require(path.join(APP, 'src', 'bots', 'setup.js'));
const SMC = require(path.join(APP, 'src', 'bots', 'smc.js'));

let pass = 0, fail = 0, untested = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log(`   ok   ${label}${detail ? '  · ' + detail : ''}`); }
  else { fail++; console.log(`   FAIL ${label}${detail ? '  · ' + detail : ''}`); }
};
const skip = (label, detail) => {
  untested++;
  console.log(`   --   UNTESTED ${label}${detail ? '  · ' + detail : ''}`);
};

console.log('='.repeat(78));
console.log(' M10 — Ep 19 STAND-DOWN: a grade filter on B and C, not a blackout');
console.log('='.repeat(78));
console.log(` app: ${APP}`);
console.log(` default policy: ${JSON.stringify(Setup.M10_DEFAULT)}  (1=Mon, 5=Fri, 12=Dec)`);
console.log(` A floor: ${Setup.GRADE_A_MIN}  ·  demotion target: ${Setup.NO_TRADE_MAX}\n`);

/* ── 0. the constants are what the grade table says they are ─────────────── */
console.log(' 0. the demotion band lines up with the grade table');
const gradeAt = (s) => Setup.gradeFor(s).grade;
ok('A floor 72 grades A', gradeAt(Setup.GRADE_A_MIN) === 'A', `gradeFor(72) = ${gradeAt(72)}`);
ok('one point below the A floor grades B', gradeAt(Setup.GRADE_A_MIN - 1) === 'B', `gradeFor(71) = ${gradeAt(71)}`);
ok('the demotion target grades no-trade', gradeAt(Setup.NO_TRADE_MAX) === 'no-trade',
  `gradeFor(${Setup.NO_TRADE_MAX}) = ${gradeAt(Setup.NO_TRADE_MAX)}`);
ok('the demotion target is below the C floor of 44', Setup.NO_TRADE_MAX < 44,
  `${Setup.NO_TRADE_MAX} < 44 — a demoted B cannot survive as a C`);

/* ── 1. the pure policy across every day and month ───────────────────────── */
console.log('\n 1. standDownFor() — every weekday, default policy');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const expectDay = { 0: false, 1: true, 2: false, 3: false, 4: false, 5: true, 6: false };
for (let d = 0; d < 7; d++) {
  const r = Setup.standDownFor({ dow: d, month: 7 });   // July, so only the day can fire
  ok(`${DAYS[d].padEnd(9)} applies=${r.applies}`, r.applies === expectDay[d],
    `expected ${expectDay[d]}${r.applies ? ' · ' + r.reason : ''}`);
}

console.log('\n 1b. December fires on any day');
for (const d of [0, 2, 4, 6]) {
  const r = Setup.standDownFor({ dow: d, month: 12 });
  ok(`December ${DAYS[d]} applies`, r.applies === true, r.reason ? r.reason.slice(0, 60) + '...' : 'no reason given');
}

console.log('\n 1c. a MISSING calendar must NOT fire (the M8 lesson)');
for (const [label, sess] of [['sessions = {}', {}], ['dow undefined', { month: 12 }],
  ['dow null', { dow: null, month: 7 }], ['dow NaN', { dow: NaN, month: 7 }],
  ['sessions null', null]]) {
  const r = Setup.standDownFor(sess);
  ok(`${label.padEnd(16)} -> applies=false`, r.applies === false,
    `a filter that fires on missing data would stand down every short-series analysis`);
  // applies=false is not sufficient on its own: Number(null) === 0 reads a missing day as
  // SUNDAY, which does not fire under the default policy, so the assertion would pass for
  // the wrong reason and the bug would survive into a policy that lists Sunday.
  ok(`${label.padEnd(16)} -> calendar_known=false`, r.calendar_known === false,
    `got ${r.calendar_known} — a missing calendar must be reported as missing, not coerced to a day`);
}

console.log('\n 1d. the override the measured Friday contradiction makes necessary');
const monDec = { days: [1], months: [12] };
ok('Mon+Dec: Friday does NOT apply', Setup.standDownFor({ dow: 5, month: 7 }, monDec).applies === false,
  'Baseline 7 measured Friday as the BEST real-data day (+0.2649R, 33.3% win)');
ok('Mon+Dec: Monday still applies', Setup.standDownFor({ dow: 1, month: 7 }, monDec).applies === true);
ok('Mon+Dec: December still applies', Setup.standDownFor({ dow: 3, month: 12 }, monDec).applies === true);
ok('disabled: nothing applies', [0, 1, 5].every((d) =>
  Setup.standDownFor({ dow: d, month: 12 }, { days: [], months: [] }).applies === false));
ok('null disables it entirely', Setup.standDownFor({ dow: 1, month: 12 }, null).applies === false);
// The coercion bug is only visible under a policy that lists Sunday, so test that too:
// with days:[0], a null dow must NOT be read as Sunday and fire.
ok('null dow does not become Sunday under a Sunday policy',
  Setup.standDownFor({ dow: null, month: 7 }, { days: [0], months: [] }).applies === false,
  'Number(null) === 0 would make this fire');
ok('a real Sunday DOES fire under a Sunday policy',
  Setup.standDownFor({ dow: 0, month: 7 }, { days: [0], months: [] }).applies === true,
  'so the test above is not passing because the policy is inert');

/* ── 2. end to end on REAL bars, where the weekday is a fact ─────────────── */
console.log('\n 2. end to end on real fixture bars');
const FIX = path.join(__dirname, 'fixtures');
function loadFixture(f) {
  const p = path.join(FIX, f);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => {
    const c = l.split(',');
    return { t: Date.parse(c[0].trim().replace(' ', 'T') + 'Z'), o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] || 0 };
  }).filter((b) => Number.isFinite(b.t) && Number.isFinite(b.c));
}
const bars = loadFixture('EURUSD-15m.csv');
if (!bars || bars.length < 400) {
  skip('real-bar section', `fixtures missing or too short (${bars ? bars.length : 0} bars) — re-fetch per candle-shim.js`);
} else {
  const W = 300;
  const buckets = { Monday: [], Friday: [], Tuesday: [], TuesdayDec: [], December: [] };
  // The stop condition must include EVERY bucket. An earlier version stopped once Monday and
  // Friday were full, so Tuesday was never collected and its negative control reported
  // "0 of 0" — an empty denominator is not a control, it is a missing measurement.
  const notFull = () => Object.keys(buckets).some((k) => buckets[k].length < 40);
  for (let i = W; i < bars.length - 5 && notFull(); i++) {
    const d = new Date(bars[i].t);
    const dow = d.getUTCDay(), mon = d.getUTCMonth() + 1;
    const win = bars.slice(i - W + 1, i + 1);
    let a;
    try { a = SMC.analyse(win, { tf: '15m', now: bars[i].t, swingMode: 'bos', nested: true }); } catch (e) { continue; }
    if (!a || !a.sessions) continue;
    const rec = { i, dow, mon };
    if (dow === 1 && buckets.Monday.length < 40) buckets.Monday.push(rec);
    else if (dow === 5 && buckets.Friday.length < 40) buckets.Friday.push(rec);
    else if (dow === 2 && mon === 12 && buckets.TuesdayDec.length < 40) buckets.TuesdayDec.push(rec);
    else if (dow === 2 && mon !== 12 && buckets.Tuesday.length < 40) buckets.Tuesday.push(rec);
    if (mon === 12 && buckets.December.length < 40) buckets.December.push(rec);
  }
  console.log(`   bars walked: ${bars.length} · Monday ${buckets.Monday.length}, Friday ${buckets.Friday.length}, Tuesday(non-Dec) ${buckets.Tuesday.length}, Tuesday(Dec) ${buckets.TuesdayDec.length}, December ${buckets.December.length}`);

  // The engine must agree with the pure policy about which day a real bar falls on.
  let agreed = 0, checked = 0;
  for (const key of ['Monday', 'Friday', 'Tuesday']) {
    for (const rec of buckets[key].slice(0, 5)) {
      const win = bars.slice(rec.i - W + 1, rec.i + 1);
      const a = SMC.analyse(win, { tf: '15m', now: bars[rec.i].t, swingMode: 'bos', nested: true });
      checked++;
      if (a.sessions.dow === rec.dow) agreed++;
    }
  }
  ok('the engine reads the same weekday as the bar timestamp', checked > 0 && agreed === checked,
    `${agreed}/${checked} bars agreed — smc.js must expose the calendar setup.js filters on`);

  /** Run both arms on one bar and compare what the filter did. */
  function compareBar(rec) {
    const win = bars.slice(rec.i - W + 1, rec.i + 1);
    const a = SMC.analyse(win, { tf: '15m', now: bars[rec.i].t, swingMode: 'bos', nested: true });
    const ctx = { price: bars[rec.i].c, balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex' };
    const on = Setup.buildSetups(a, ctx);
    const off = Setup.buildSetups(a, Object.assign({}, ctx, { standDown: { days: [], months: [] } }));
    return { on, off, a };
  }

  let demotions = 0, demotedFromA = 0, sparedA = 0, aCandidates = 0, offTradeable = 0, onTradeable = 0;
  const seen = [];
  for (const key of ['Monday', 'Friday']) {
    for (const rec of buckets[key]) {
      const { on, off } = compareBar(rec);
      const f = on.filters && on.filters.stand_down;
      if (!f || !f.applies) continue;
      const onC = on.candidates || [], offC = off.candidates || [];
      for (let k = 0; k < Math.max(onC.length, offC.length); k++) {
        const cOn = onC[k], cOff = offC[k];
        if (!cOn || !cOn.stand_down) continue;
        if (cOff && cOff.grade !== 'no-trade') offTradeable++;
        if (cOn.grade !== 'no-trade') onTradeable++;
        const before = cOn.stand_down.grade_before;
        if (before === 'A+' || before === 'A') {
          aCandidates++;
          if (cOn.stand_down.demoted) demotedFromA++; else sparedA++;
        } else if (cOn.stand_down.demoted) {
          demotions++;
          if (seen.length < 3) seen.push(`${key} ${before}(${cOn.stand_down.score_before}) -> ${cOn.stand_down.grade_after}(${cOn.stand_down.score_after})`);
        }
      }
    }
  }

  console.log(`\n   on stood-down bars: ${demotions} B/C demotions, ${aCandidates} A-or-better candidates seen`);
  if (seen.length) console.log(`   examples: ${seen.join(' · ')}`);
  ok('B and C candidates ARE demoted on stood-down days', demotions > 0,
    demotions ? `${demotions} demotions` : 'zero — the filter would be inert, exactly the failure mode this probe exists to catch');

  if (aCandidates > 0) {
    ok('A and A+ are NEVER demoted (the course exception)', demotedFromA === 0,
      `${sparedA} spared, ${demotedFromA} wrongly demoted out of ${aCandidates}`);
  } else {
    skip('the A/A+ exemption', `no candidate scored >= ${Setup.GRADE_A_MIN} on any stood-down bar in this sample, so the exemption is asserted by construction (score < GRADE_A_MIN) and not by observation`);
  }
  ok('the filter changes how many setups are tradeable', offTradeable !== onTradeable || demotions > 0,
    `tradeable with filter off = ${offTradeable}, on = ${onTradeable}`);

  // Tuesday must be untouched — a filter that fires every day is not a day filter.
  let tueDemotions = 0, tueChecked = 0;
  for (const rec of buckets.Tuesday) {
    const { on } = compareBar(rec);
    const f = on.filters && on.filters.stand_down;
    tueChecked++;
    if (f && f.applies) tueDemotions++;
  }
  if (tueChecked === 0) skip('the Tuesday negative control', 'no non-December Tuesday bars collected — the control needs a real denominator');
  else ok('non-December Tuesday bars are NOT stood down', tueDemotions === 0,
    `${tueDemotions} of ${tueChecked} fired — a filter that fires every day is not a day filter`);

  /* The first version of this control used ANY Tuesday and reported 40 of 40 firing, which
   * looked like a bug and was not: EURUSD-15m starts 2025-12-15, so those Tuesdays are in
   * December and the month rule correctly stands them down. A negative control drawn from
   * inside the condition it is meant to exclude tests nothing, so December Tuesdays are now
   * a POSITIVE control for the month rule instead. */
  let decTueFired = 0, decTueChecked = 0;
  for (const rec of buckets.TuesdayDec) {
    const { on } = compareBar(rec);
    const f = on.filters && on.filters.stand_down;
    decTueChecked++;
    if (f && f.applies) decTueFired++;
  }
  if (decTueChecked === 0) skip('the December positive control', 'no December Tuesday bars collected');
  else ok('December Tuesdays ARE stood down (month rule, not day rule)', decTueFired === decTueChecked,
    `${decTueFired} of ${decTueChecked} fired`);
}

console.log('\n' + '='.repeat(78));
console.log(` ${pass} passed, ${fail} failed, ${untested} untested`);
if (untested) console.log(' Untested rows are printed, not folded into the pass count.');
console.log('='.repeat(78));
process.exit(fail ? 1 : 0);
