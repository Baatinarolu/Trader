#!/usr/bin/env node
'use strict';
/**
 * M58 probe — does the grade actually drive capital deployment?
 *
 * GRADES promises "B — reduced size" and "C — paper/demo or half risk at most". Before M58
 * nothing enforced either. This calls the real buildSetups() and checks that a lower grade
 * produces a smaller position for the SAME account and the SAME configured risk.
 *
 * Run from extracted/tradejournal:  node ../../analysis/probe-m58-grade-sizing.js
 */
const path = require('path');
const Setup = require(path.join(process.cwd(), 'src/bots/setup.js'));
const SMC = require(path.join(process.cwd(), 'src/bots/smc.js'));
const Synth = require('./harness/synth.js');

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${m}`); c ? pass++ : fail++; };

const MULT = Setup.GRADE_RISK_MULT;
ok(!!MULT, 'GRADE_RISK_MULT is exported');
ok(MULT && MULT['A+'] === 1 && MULT.A === 1, 'A+ and A deploy full configured risk');
ok(MULT && MULT.B < MULT.A, 'B deploys less than A');
ok(MULT && MULT.C < MULT.B, 'C deploys less than B');
ok(MULT && MULT.C <= 0.5, `C honours its own "half risk at most" label (×${MULT && MULT.C})`);
ok(MULT && MULT['no-trade'] === 0, 'no-trade deploys nothing');

/* ---- drive the real engine and collect one candidate per grade ---- */
const CTX = { balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex' };
const found = {};

for (let seed = 1; seed <= 6 && Object.keys(found).length < 4; seed++) {
  const candles = Synth.series({ seed, bars: 700 });
  const htf = Synth.aggregate(candles, 4);
  for (let i = 120; i < candles.length - 5; i++) {
    const win = candles.slice(Math.max(0, i - 280), i + 1);
    const h = htf.filter((b) => b.t <= candles[i].t).slice(-80);
    let a; try { a = SMC.analyse(win, { tf: '15m', htfCandles: h.length > 30 ? h : null, now: candles[i].t }); } catch (e) { continue; }
    if (!a || !a.ok) continue;
    let r; try { r = Setup.buildSetups(a, { ...CTX, price: candles[i].c }); } catch (e) { continue; }
    for (const c of (r.candidates || [])) {
      if (!c.risk || found[c.grade]) continue;
      found[c.grade] = c.risk;
    }
  }
}

console.log(`\n  (collected grades from the real engine: ${Object.keys(found).sort().join(', ') || 'none'})\n`);

for (const g of ['A+', 'A', 'B', 'C']) {
  const rk = found[g];
  if (!rk) { console.log(` --   grade ${g}: no candidate found in the sample, skipped`); continue; }
  ok(rk.grade_risk_multiplier === MULT[g], `grade ${g} multiplier applied (×${rk.grade_risk_multiplier})`);
  // M52 added a second multiplier to this pipeline (mid-range risk reduction), so the arithmetic
  // identity is now configured × grade × range. The M58 claim is NOT weakened: the line above
  // still pins the grade multiplier to exactly GRADE_RISK_MULT[grade], and the new factor is
  // bounded to (0,1] here so it can only reduce. Keeping the old two-factor form would turn this
  // probe into an assertion that mid-range sizing does not happen.
  const rm = rk.range_risk_multiplier === undefined ? 1 : rk.range_risk_multiplier;
  ok(rm > 0 && rm <= 1, `grade ${g} range multiplier within (0,1] (×${rm}, at ${rk.range_position_pct}% of range)`);
  ok(Math.abs(rk.risk_pct - CTX.riskPct * MULT[g] * rm) < 0.011,
    `grade ${g} risk_pct scaled ${rk.risk_pct_configured}% → ${rk.risk_pct}% (expected ${(CTX.riskPct * MULT[g] * rm).toFixed(2)}%)`);
  ok(Math.abs(rk.risk_amount - CTX.balance * rk.risk_pct / 100) < 0.02,
    `grade ${g} risk_amount $${rk.risk_amount} matches balance × scaled pct`);
  // The note is now a faithful "was risk adjusted at all?" flag rather than a grade-only one, so
  // the invariant is stated that way: present iff risk actually moved, absent iff it did not.
  const reduced = rk.risk_pct < rk.risk_pct_configured - 1e-9;
  if (reduced) ok(!!rk.risk_adjustment_note, `grade ${g} explains the reduction to the trader`);
  else ok(rk.risk_adjustment_note === null, `grade ${g} adds no noise when risk is unchanged`);
}

/* ---- the reduction must be strictly ordered by grade, on real numbers ---- */
const amt = (g) => (found[g] ? found[g].risk_amount : null);
if (amt('A') !== null && amt('B') !== null) ok(amt('B') < amt('A'), `B risks less than A ($${amt('B')} < $${amt('A')})`);
if (amt('B') !== null && amt('C') !== null) ok(amt('C') < amt('B'), `C risks less than B ($${amt('C')} < $${amt('B')})`);

console.log(`\nM58 PROBE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
