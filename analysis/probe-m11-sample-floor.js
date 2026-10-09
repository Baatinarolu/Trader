'use strict';
/**
 * probe-m11-sample-floor.js — does M11's minimum-sample floor actually bind?
 *
 * WHY THIS EXISTS
 *   M11 raised the sample floor from 10 trades (guardrails) and 5 trades (severity
 *   escalation, behavioural grade) to Ep 27's 30. A threshold change is the easiest
 *   kind of fix to get vacuously wrong: the constant can be defined and never read,
 *   or read in a branch that never executes, and every suite still passes because no
 *   test constructs a small sample. So this probe drives the REAL exported function
 *   with constructed journals at n=5, n=29 and n=30 and asserts the behaviour on
 *   both sides of the floor.
 *
 *   It prints the denominator it actually compared at every step. A severity that
 *   was never computed is reported as MISSING, not as a pass.
 *
 * WHAT IT DOES NOT TEST
 *   guardrails() and the report's behavior_grade need a database, so they are
 *   asserted by source inspection in part 3 rather than by execution. That is a
 *   weaker form of evidence and is labelled as such rather than dressed up.
 *
 *   node analysis/probe-m11-sample-floor.js      (run from anywhere; resolves the app itself)
 */
const path = require('path');
const fs = require('fs');

const APP = process.env.TJ_ROOT
  ? path.resolve(process.env.TJ_ROOT)
  : path.join(__dirname, '..', 'extracted', 'tradejournal');
const C = require(path.join(APP, 'src', 'bots', 'correction.js'));

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log(`   ok   ${label}${detail ? '  · ' + detail : ''}`); }
  else { fail++; console.log(`   FAIL ${label}${detail ? '  · ' + detail : ''}`); }
};

const FLOOR = 30;

/** A closed trade with the fields the detectors read. */
function trade(i, { moved = false, r = -1 } = {}) {
  return {
    id: 't' + i, symbol: 'EURUSD', side: 'long', grade: 'A',
    opened_at: new Date(Date.UTC(2026, 0, 1 + i, 9, 0)).toISOString(),
    closed_at: new Date(Date.UTC(2026, 0, 1 + i, 12, 0)).toISOString(),
    net_pnl: r * 100, r_multiple: r, risk_amount: 100,
    stop_moved: moved, mfe_r: Math.max(0, r), mae_r: Math.min(0, r),
  };
}

/** n trades of which k widened their stop — the ratio that used to escalate severity. */
function journal(n, k) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(trade(i, i < k ? { moved: true, r: -1.4 } : { r: 0.4 }));
  return out;
}

console.log('='.repeat(78));
console.log(' M11 — MINIMUM SAMPLE FLOOR: does it bind?');
console.log('='.repeat(78));
console.log(` app: ${APP}`);
console.log(` floor under test: ${FLOOR} trades (Ep 27: "at least 30 to 50 minimum")\n`);

/* ── 1. the exported constant really is the one the code reads ───────────── */
console.log(' 1. the floor is wired, not just declared');
const src = fs.readFileSync(path.join(APP, 'src', 'bots', 'correction.js'), 'utf8');
ok('MIN_ADAPT_TRADES is defined as 30', /const MIN_ADAPT_TRADES = 30;/.test(src));
ok('MIN_PATTERN_TRADES is defined as 30', /const MIN_PATTERN_TRADES = 30;/.test(src));
ok('the guardrails gate reads MIN_ADAPT_TRADES', /trades\.length < MIN_ADAPT_TRADES/.test(src));
ok('no 10-trade guardrail gate survives', !/trades\.length < 10\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
  'comments excluded so the historical note does not count as a live gate');
const sevSites = (src.match(/severity: sev\(/g) || []).length;
ok('all 9 severity escalations route through sev()', sevSites === 9, `found ${sevSites}`);
ok('no raw severity ternary survives outside the helper',
  (src.match(/\? 'high' : 'medium'/g) || []).length === 1, 'the single remaining one is sev() itself');

/* ── 2. behaviour on both sides of the floor ─────────────────────────────── */
console.log('\n 2. detectMistakes(), driven with constructed journals');
console.log('    the stop_widened ratio is > 0.2 in every case below, so the ONLY');
console.log('    thing that can differ between rows is the sample floor.\n');

const cases = [
  { n: 5,  k: 2,  note: '2 of 5 = 40 % — well over the 0.2 escalation ratio' },
  { n: 10, k: 4,  note: '4 of 10 = 40 % — the OLD guardrail floor' },
  { n: 29, k: 12, note: '12 of 29 = 41 % — one trade below the floor' },
  { n: 30, k: 13, note: '13 of 30 = 43 % — AT the floor' },
  { n: 60, k: 25, note: '25 of 60 = 42 % — comfortably above' },
];

let sawMediumBelow = 0, sawHighAtOrAbove = 0, sawMissing = 0;
for (const c of cases) {
  let mistakes;
  try { mistakes = C.detectMistakes(journal(c.n, c.k)); }
  catch (e) { console.log(`   FAIL detectMistakes threw at n=${c.n}: ${e.message}`); fail++; continue; }
  const m = (mistakes || []).find((x) => x.key === 'stop_widened');
  // Print the denominator actually compared: MISSING is not a pass.
  if (!m) {
    sawMissing++;
    ok(`n=${String(c.n).padStart(2)} detector did not fire`, false, `stop_widened ABSENT from ${mistakes.length} mistakes — cannot assess severity`);
    continue;
  }
  const expected = c.n >= FLOOR ? 'high' : 'medium';
  const ratio = (100 * c.k / c.n).toFixed(0);
  ok(`n=${String(c.n).padStart(2)} (${ratio}% widened) -> severity '${m.severity}'`,
    m.severity === expected, `expected '${expected}' · ${c.note}`);
  if (c.n < FLOOR && m.severity === 'medium') sawMediumBelow++;
  if (c.n >= FLOOR && m.severity === 'high') sawHighAtOrAbove++;
}

console.log('');
ok('below the floor the ratio was DEMOTED, not merely absent', sawMediumBelow === 3,
  `${sawMediumBelow} of 3 sub-floor cases returned 'medium'`);
ok('at and above the floor the ratio still escalates', sawHighAtOrAbove === 2,
  `${sawHighAtOrAbove} of 2 cases returned 'high' — the fix must not flatten real patterns`);
ok('no case failed to produce the detector at all', sawMissing === 0, `${sawMissing} missing`);

/* ── 3. detection still runs below the floor (noticing != acting) ────────── */
console.log('\n 3. small samples still get TOLD about a violation');
const small = C.detectMistakes(journal(6, 3));
ok('detectMistakes still reports at n=6', Array.isArray(small) && small.length > 0,
  `${small ? small.length : 0} mistakes reported — the course says do not CHANGE the system on a small sample, not do not NOTICE`);
const sevList = (small || []).map((m) => m.severity).filter((s) => s === 'high');
ok("no 'high' severity at n=6", sevList.length === 0, `${sevList.length} highs`);

/* ── 4. the two database-backed gates, asserted by source (labelled weaker) ─ */
console.log('\n 4. guardrails() and behavior_grade — SOURCE ASSERTIONS ONLY');
console.log('    these need a database to execute, so this is weaker evidence than');
console.log('    section 2 and is reported as such rather than counted the same.\n');
ok('guardrails() returns defaults below the floor', /trades\.length < MIN_ADAPT_TRADES\) \{/.test(src));
ok('guardrails() publishes the minimum it is waiting for', /min_trades_for_personal_guardrails: MIN_ADAPT_TRADES/.test(src));
ok('guardrails() says WHY in the basis string, not silently', /These are NOT your personal numbers yet/.test(src));
ok('behavior_grade is withheld below the floor', /trades\.length >= MIN_PATTERN_TRADES\s*\?\s*\(behaviourScore >= 85/.test(src));
ok("the withheld grade is a string, not null, so no badge renderer breaks", /'Insufficient sample'/.test(src));
ok('behavior_grade_note explains the withholding', /behavior_grade_note:/.test(src));

const coachPath = path.join(APP, 'src', 'coach.js');
if (fs.existsSync(coachPath)) {
  const cs = fs.readFileSync(coachPath, 'utf8');
  ok('coach.js defines the same floor', /const MIN_ADAPT_TRADES = 30;/.test(cs));
  ok('coach.js withholds its discipline score below the floor',
    /score: closed\.length >= MIN_ADAPT_TRADES \? disciplineScore/.test(cs));
  ok('coach.js still emits insights below the floor', /if \(n < 5\) \{/.test(cs),
    'logging advice is useful immediately and is not a statistical claim');
} else {
  ok('coach.js present', false, 'file not found — cannot assess');
}

console.log('\n' + '='.repeat(78));
console.log(` ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail ? 1 : 0);
