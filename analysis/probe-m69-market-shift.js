'use strict';
/**
 * probe-m69-market-shift.js — is the market shift a BREAK EVENT or a trend LABEL?
 *
 * WHY THIS EXISTS
 *   Ep 17: *"There are mainly two things that I look out for before I actually enter for the
 *   trade… Two things, liquidity sweep and market shift."*
 *   Ep 20: *"we need to have some form of market shift. That's the prerequisite. That's the
 *   non-negotiable for each one of these entry models."*
 *   Ep 20, on why a failed reaction is not an entry: *"Because you haven't gotten a
 *   confirmation that the structure is indeed shifting bullish. You haven't gotten the market
 *   shift."*
 *   Ep 17, on direction: *"You don't want to enter for a sell when the internal structure is
 *   still bullish."*
 *
 *   The gate tested only that the structure LABEL agreed with the trade direction. A label
 *   summarises the whole window and can read 'bullish' with no break in the required direction
 *   on this leg — so the non-negotiable could be satisfied without the event it names. The
 *   sweep, the other of the same "two things", was already a veto; the shift was a 12-point
 *   weight, so losing it cost 12 of 155 and the setup still cleared the bar.
 *
 * HOW IT TESTS, AND WHY NOT VIA THE BACKTEST
 *   Measured over 400 synthetic candidates the veto fires on 200 — correctly wired — yet
 *   tradeable count and the grade histogram are IDENTICAL before and after, because 399 of 400
 *   were already refused by other conditions. A generator that refuses nearly everything cannot
 *   show whether a new refusal is right; it can only hide it. So this probe drives the
 *   divergence DIRECTLY: it runs a real Smc.analyse() to get a valid analysis object, then
 *   rewrites `structure.last_break.dir` and `structure.trend` independently, which is the only
 *   way to construct the case that matters — label says yes, event says no.
 *
 *   It also proves M8's rule survived: MISSING DATA MUST NOT VETO. The short-series sentinel
 *   has no `structure` key, and a gate that fired on it would stand down every analysis of a
 *   short series.
 *
 *   node analysis/probe-m69-market-shift.js
 */
const path = require('path');
const APP = path.resolve(__dirname, '..', 'extracted', 'tradejournal');
const Smc = require(path.join(APP, 'src/bots/smc'));
const Setup = require(path.join(APP, 'src/bots/setup'));

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log(`   ok   ${label}${detail ? '  · ' + detail : ''}`); }
  else { fail++; console.log(`   FAIL ${label}${detail ? '  · ' + detail : ''}`); }
};

/* a series with real structure — enough bars and enough swing to produce breaks */
function gen(seed, n) {
  let x = seed, s = 1.10; const out = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    s += ((x / 2147483648) - 0.5) * 0.004;
    const o = s, c = s + ((x % 7) - 3) * 0.0006;
    out.push({ t: Date.UTC(2026, 0, 5) + i * 900000, o, h: Math.max(o, c) + 0.0004, l: Math.min(o, c) - 0.0004, c, v: 1000 });
  }
  return out;
}

const SHIFT_VETO = /^No market shift/;
const ctxFor = (candles, an) => ({
  price: candles[candles.length - 1].c, atr: an.atr, bias: 0, biasReason: '',
  balance: 10000, riskPct: 0.5, maxRiskPct: 1, minRR: 2,
});

/* Build setups for one direction and return the candidate plus its veto strings. */
function probe(analysis, candles, dir) {
  const r = Setup.buildSetups(analysis, ctxFor(candles, analysis));
  const c = (r.candidates || []).find((x) => x.dir === dir) || (r.candidates || [])[0] || {};
  const wn = Array.isArray(c.no_trade) ? c.no_trade : [];
  const chk = (c.checks || []).find((x) => x.key === 'structure') || {};
  return {
    grade: c.grade, ok: !!c.ok, vetoes: wn,
    shiftVetoed: wn.some((s) => SHIFT_VETO.test(s)),
    checkPass: !!chk.pass, detail: chk.detail || '',
  };
}

/** Force the structure to a chosen label + break event, leaving everything else real. */
function setStructure(an, trend, breakDir) {
  an.structure.trend = trend;
  if (breakDir === null) an.structure.last_break = null;
  else an.structure.last_break = { ...(an.structure.last_break || {}), type: 'BOS', dir: breakDir, bars_ago: 3, mss: false };
  return an;
}

console.log('='.repeat(80));
console.log(' M69 / M63 / M48 — MARKET SHIFT: BREAK EVENT, NOT TREND LABEL');
console.log('='.repeat(80));

/* ---------------------------------------------------------------- 0. sanity */
const candles = gen(11, 400);
const base = Smc.analyse(candles, { tf: '15m' });
ok('Smc.analyse produced usable structure', !!(base && base.ok && base.structure),
  base && base.structure ? `trend=${base.structure.trend}, last_break=${base.structure.last_break ? base.structure.last_break.dir : 'none'}` : 'no structure — the rest of this probe would be vacuous');
if (!(base && base.ok && base.structure)) { console.log('\n cannot continue without structure'); process.exit(1); }

const clone = () => JSON.parse(JSON.stringify({ ...base, structure: base.structure }));
// a deep clone loses nothing here; rebuild the full object properly instead
const fresh = () => Smc.analyse(candles, { tf: '15m' });

/* ------------------------------------ 1. the case M69 exists for: label yes, event no */
{
  const an = setStructure(fresh(), 'bullish', 'down');   // label bullish, last break DOWN
  const L = probe(an, candles, 1);                        // a LONG
  ok('LONG refused when the label is bullish but the last break was DOWN', L.shiftVetoed,
    `vetoes: ${L.vetoes.filter((s) => SHIFT_VETO.test(s)).join(' / ') || '(none)'}`);
  ok('  ...and the weighted structure check FAILS on the event, not the label', L.checkPass === false,
    `checkPass=${L.checkPass}`);
  ok('  ...and the report says the label and the event disagree', /LABEL agrees but the EVENT does not/.test(L.detail),
    L.detail.slice(0, 96));
}
{
  const an = setStructure(fresh(), 'bearish', 'up');      // label bearish, last break UP
  const S = probe(an, candles, -1);                       // a SHORT
  ok('SHORT refused when the label is bearish but the last break was UP', S.shiftVetoed,
    '"You don\'t want to enter for a sell when the internal structure is still bullish."');
}

/* ------------------------------------ 2. the positive: event in the trade's direction */
{
  const an = setStructure(fresh(), 'bullish', 'up');
  const L = probe(an, candles, 1);
  ok('LONG NOT refused for market shift when the last break was UP', !L.shiftVetoed,
    `checkPass=${L.checkPass}`);
  ok('  ...and the weighted structure check passes', L.checkPass === true, `checkPass=${L.checkPass}`);
}
{
  const an = setStructure(fresh(), 'ranging', 'down');    // label says NOTHING, event says short
  const S = probe(an, candles, -1);
  ok('SHORT not refused when the label is "ranging" but the break is DOWN', !S.shiftVetoed,
    'the event is the criterion, so a non-committal label must not veto it');
  ok('  ...and the check passes on the event even though the label is ranging', S.checkPass === true,
    `checkPass=${S.checkPass}`);
}

/* ------------------------------------ 3. no break at all in the window */
{
  const an = setStructure(fresh(), 'bullish', null);
  const L = probe(an, candles, 1);
  ok('refused when there is NO structural break at all', L.shiftVetoed,
    L.vetoes.filter((s) => SHIFT_VETO.test(s))[0] || '(none)');
  ok('  ...and the wording says no break occurred, not that the direction was wrong',
    /no structural break/i.test((L.vetoes.filter((s) => SHIFT_VETO.test(s))[0]) || ''), '');
}

/* ------------------------------------ 4. M8 — missing data must NOT veto */
{
  const sentinel = { ok: false, tf: '15m' };   // smc.analyse()'s short-series shape: NO structure key
  let crashed = null, r = null;
  try { r = Setup.buildSetups(sentinel, { price: 1.1, atr: 0.001, bias: 0, biasReason: '', balance: 10000, riskPct: 0.5, maxRiskPct: 1, minRR: 2 }); }
  catch (e) { crashed = e; }
  ok('the short-series sentinel does not crash buildSetups', !crashed, crashed ? crashed.message : '');
  if (r) {
    const cs = r.candidates || [];
    const anyShiftVeto = cs.some((c) => (Array.isArray(c.no_trade) ? c.no_trade : []).some((s) => SHIFT_VETO.test(s)));
    ok('M8: an UNKNOWN structure does NOT veto (would stand down every short series)', !anyShiftVeto,
      `${cs.length} candidates, ${anyShiftVeto ? 'shift veto fired' : 'no shift veto'}`);
    const chk = cs.map((c) => (c.checks || []).find((x) => x.key === 'structure')).filter(Boolean);
    ok('  ...and reports itself as unknown rather than as a failed shift',
      chk.every((k) => /not available on this series/i.test(k.detail || '')),
      chk.length ? (chk[0].detail || '').slice(0, 88) : 'no structure check emitted');
  } else { ok('M8: sentinel produced a result to inspect', false, 'buildSetups returned nothing'); }
}

/* ------------------------------------ 5. the veto must be a VETO, not just a score cut */
{
  const an = setStructure(fresh(), 'bullish', 'down');
  const L = probe(an, candles, 1);
  ok('a refused market shift makes the candidate not ok', L.ok === false, `ok=${L.ok}`);
  ok('  ...and cannot reach an A or A+ grade', L.grade !== 'A' && L.grade !== 'A+', `grade=${L.grade}`);
}

console.log('\n' + '='.repeat(80));
console.log(` ${pass} passed, ${fail} failed`);
console.log('='.repeat(80));
process.exit(fail ? 1 : 0);
