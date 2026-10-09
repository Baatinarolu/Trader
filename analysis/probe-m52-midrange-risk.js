#!/usr/bin/env node
/**
 * analysis/probe-m52-midrange-risk.js — M52, mid-range risk reduction.
 *
 * Ep 15 mistake #3: *"If it's mid-range, if it's consolidating, if it's sideways, it's either you
 * stay out of the market completely and wait for price to come up to the extremes. Or if you do
 * want to trade this, reduce your risk, use like a smaller position size."*
 *
 * Before M52 the DETECTION existed (`inGoodHalf`, a weight-10 check) but the SIZE response did
 * not: `riskPct` was a constant from the request context, so a mid-range entry deployed the same
 * percentage of the account as one at the extreme of the dealing range. The row also asked for the
 * `'equilibrium'` label to become a real band — it was reachable only at `pos === 0.5` exactly, so
 * it was cosmetic while the 45–55 band in `inGoodHalf` was the only live mechanism.
 *
 * Four layers are checked here, because the change touches three files and the third is easy to
 * miss:
 *   A  the multiplier curve itself            (setup.js  rangeRiskMult)
 *   B  the zone label the curve must agree with (smc.js   premiumDiscount)
 *   C  the narrative line that consumes the label (momentum.js) — this tested `zone === 'discount'`
 *      BINARILY, so widening the band without touching it would have pushed 45–50% of the range
 *      into the "longs here are paying up" branch while price was still below the midpoint
 *   D  the wired-up engine, end to end
 *
 *   node analysis/probe-m52-midrange-risk.js                       # patched tree
 *   TJ_ROOT=/tmp/negctl/tradejournal node analysis/probe-m52-midrange-risk.js   # negative control
 *
 * The negative control is what makes this probe meaningful: it must FAIL on an unpatched tree.
 * See analysis/YAHOO-CANDLES.md §3 for how to build one from tradingpro-main.zip.
 */
'use strict';
const path = require('path');
const fs = require('fs');

function findRoot() {
  const cands = [process.env.TJ_ROOT, path.join(__dirname, '..', 'extracted', 'tradejournal'),
    path.join(process.cwd(), 'extracted', 'tradejournal'), process.cwd()].filter(Boolean);
  for (const c of cands) if (fs.existsSync(path.join(c, 'src', 'bots', 'setup.js'))) return c;
  throw new Error('cannot locate src/bots/setup.js');
}
const ROOT = findRoot();
const S = require(path.join(ROOT, 'src/bots/setup.js'));
const SMC = require(path.join(ROOT, 'src/bots/smc.js'));
const MOM = require(path.join(ROOT, 'src/bots/momentum.js'));

let pass = 0, fail = 0;
const notes = [];
function check(id, ok, detail) {
  if (ok) { pass++; console.log(`  ok    ${id}  ${detail || ''}`); }
  else { fail++; console.log(`  FAIL  ${id}  ${detail || ''}`); }
  return ok;
}
const note = (s) => notes.push(s);
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

/* ================================================== A. the multiplier curve */
console.log('\n— M52 A: the range-risk multiplier curve (setup.js) —');
const RM = S.rangeRiskMult;
if (typeof RM !== 'function') {
  check('rangeRiskMult is exported', false, 'absent — pre-M52 tree');
} else {
  check('rangeRiskMult is exported', true, 'present');
  const PD = (p) => ({ position_pct: p, eq_band: [45, 55] });

  // Bounded: it may only ever REDUCE risk. Anything above 1 would mean a mid-range entry sizing
  // UP, which is the opposite of the rule and would also bypass M9's ceiling.
  let minM = Infinity, maxM = -Infinity;
  for (let p = 0; p <= 100; p += 0.25) for (const long of [true, false]) {
    const m = RM(PD(p), long).mult;
    if (m < minM) minM = m;
    if (m > maxM) maxM = m;
  }
  check('the multiplier stays within [0.5, 1] over the whole range, both directions', minM === 0.5 && maxM === 1,
    `min ${minM} max ${maxM}`);

  check('full risk at the favourable extreme (long at the range low)', RM(PD(0), true).mult === 1, `×${RM(PD(0), true).mult}`);
  check('full risk at the favourable extreme (short at the range high)', RM(PD(100), false).mult === 1, `×${RM(PD(100), false).mult}`);
  check('half risk at the midpoint', RM(PD(50), true).mult === 0.5, `×${RM(PD(50), true).mult}`);
  check('half risk throughout the equilibrium band (45 and 55)', RM(PD(45), true).mult === 0.5 && RM(PD(55), true).mult === 0.5,
    `45→×${RM(PD(45), true).mult} 55→×${RM(PD(55), true).mult}`);
  check('half risk is also the floor in the WRONG half (not a reward for being on the wrong side)',
    RM(PD(90), true).mult === 0.5 && RM(PD(10), false).mult === 0.5,
    `long@90%→×${RM(PD(90), true).mult} short@10%→×${RM(PD(10), false).mult}`);

  // Symmetry: a long at p and a short at 100-p are the same situation mirrored.
  let asym = 0;
  for (let p = 0; p <= 100; p += 0.5) if (Math.abs(RM(PD(p), true).mult - RM(PD(100 - p), false).mult) > 1e-9) asym++;
  check('longs and shorts are exact mirror images', asym === 0, `${asym} asymmetric points of 201`);

  // Monotone in depth: moving toward your own extreme must never reduce risk.
  let nonMono = 0;
  for (const long of [true, false]) {
    let prev = null;
    for (let p = 0; p <= 100; p += 0.25) {
      const m = RM(PD(p), long).mult;
      const depth = RM(PD(p), long).depth;
      if (prev !== null && depth > prev.d + 1e-12 && m < prev.m - 1e-9) nonMono++;
      prev = { d: depth, m };
    }
  }
  check('risk never falls as price moves toward the favourable extreme', nonMono === 0, `${nonMono} violations`);

  // NO CLIFF. This is the property a naive implementation gets wrong: a hard `if (p < 45) 0.5
  // else 1` would make position size discontinuous in price, so a one-tick move across a
  // threshold would double the position. Assert the largest jump over a 0.1% move is small.
  let maxJump = 0, jumpAt = null;
  for (let p = 0; p + 0.1 <= 100; p += 0.1) for (const long of [true, false]) {
    const j = Math.abs(RM(PD(p + 0.1), long).mult - RM(PD(p), long).mult);
    if (j > maxJump) { maxJump = j; jumpAt = `${long ? 'long' : 'short'}@${r4(p)}%`; }
  }
  check('the curve is continuous — no cliff at the band edge', maxJump < 0.005,
    `largest jump over a 0.1% move is ${r4(maxJump)} (${jumpAt})`);

  // Inert when there is nothing to size against.
  check('inert when the dealing range is unavailable', RM(null, true).mult === 1, `×${RM(null, true).mult}`);
  check('inert when position_pct is not a number', RM({ position_pct: NaN }, true).mult === 1,
    `×${RM({ position_pct: NaN }, true).mult}`);
  check('falls back to a 45–55 band if eq_band is missing', RM({ position_pct: 50 }, true).mult === 0.5,
    `×${RM({ position_pct: 50 }, true).mult}`);

  // The band must be READ from pd, not redeclared — that is what makes the label and the sizing
  // unable to drift apart. Prove it by handing it a different band.
  const wide = RM({ position_pct: 40, eq_band: [20, 80] }, true);
  check('the band is taken from pd.eq_band, not hardcoded here', wide.mult === 0.5,
    `a 20–80 band puts 40% inside it → ×${wide.mult} (a hardcoded 45–55 band would give ×1)`);
}

/* ============================================= B. the zone label it agrees with */
console.log('\n— M52 B: the equilibrium label in premiumDiscount (smc.js) —');
/**
 * Build a candle window whose LAST close sits at a chosen fraction of a known dealing range, so
 * `position_pct` is controlled rather than hoped for. premiumDiscount is exported and takes
 * (candles, swings); with one high and one low the swing walk-back loop cannot run, so the range
 * is exactly [90, 110] and pos = (last - 90) / 20.
 */
function pdAt(pos) {
  const candles = [];
  for (let i = 0; i < 40; i++) {
    const c = 100 + Math.sin(i / 3) * 2;
    candles.push({ t: Date.UTC(2026, 0, 1) + i * 900e3, o: c, h: c + 0.6, l: c - 0.6, c, v: 100 });
  }
  candles[candles.length - 1].c = 90 + 20 * pos;
  const swings = [
    { type: 'high', price: 110, index: 10, t: candles[10].t },
    { type: 'low', price: 90, index: 30, t: candles[30].t },
  ];
  return SMC.premiumDiscount(candles, swings);
}
{
  const mid = pdAt(0.5);
  if (!mid) {
    check('premiumDiscount returns a result', false, 'null — fixture does not produce a dealing range');
  } else {
    check('premiumDiscount returns a result', true, `range ${mid.range_low}–${mid.range_high}`);
    check('emits the band it used, so consumers cannot redeclare their own',
      Array.isArray(mid.eq_band) && mid.eq_band[0] === 45 && mid.eq_band[1] === 55,
      `eq_band ${JSON.stringify(mid.eq_band)}`);
    // Boundaries are probed from just INSIDE and just OUTSIDE rather than exactly on the edge.
    // The first version of this check asserted `pos === 0.55 -> equilibrium` and failed: the
    // fixture computes 90 + 20*0.55, and 20*0.55 is 11.000000000000002 in binary floating point,
    // so the true position is 0.5500000000000004 — premium, correctly. An exact-boundary
    // assertion on a float-derived quantity tests the representation, not the band.
    const cases = [
      [0.30, 'discount'], [0.44, 'discount'], [0.4499, 'discount'],
      [0.4501, 'equilibrium'], [0.47, 'equilibrium'], [0.50, 'equilibrium'],
      [0.53, 'equilibrium'], [0.5499, 'equilibrium'],
      [0.5501, 'premium'], [0.56, 'premium'], [0.70, 'premium'],
    ];
    let bad = [];
    for (const [p, want] of cases) {
      const got = pdAt(p).zone;
      if (got !== want) bad.push(`${(p * 100).toFixed(2)}%→${got} (want ${want})`);
    }
    check('the label is a real 45–55 band, probed from inside and outside the edges', bad.length === 0,
      bad.length ? bad.join(', ') : `${cases.length} boundary cases correct`);
    // The specific pre-M52 defect: 47% was 'discount' because inDiscount was `pos < 0.5`.
    check('47% of the range is no longer called discount (the pre-M52 defect)', pdAt(0.47).zone === 'equilibrium',
      `got '${pdAt(0.47).zone}'`);
    // And the label must agree with the sizing across a fine sweep — the row's actual ask.
    if (typeof RM === 'function') {
      // Two implications, checked over a fine sweep. The first version of this also required
      // `p <= 0.5` for the multiplier to be at its floor, which produced 51 false disagreements:
      // for a LONG the floor covers the whole equilibrium band AND the wrong half above it, so
      // every p in (0.5, 0.55] was counted against the code. The floor is not "below the
      // midpoint", it is "not deep enough into discount".
      let disagree = 0, ex = null;
      // `position_pct` is reported rounded to 2dp while the label is computed at full precision,
      // so (i) can only be asserted to within half a unit of the reported precision — the same
      // tolerance probe-reverify-applied.js uses. Comparing them exactly fails on a single point
      // of 1001: a true pos of 0.5500000000000004 is correctly 'premium' but reports 55.00.
      const TOL = 0.005;
      for (let p = 0; p <= 1; p += 0.001) {
        const d = pdAt(p);
        const eq = d.zone === 'equilibrium';
        const m = RM({ position_pct: d.position_pct, eq_band: d.eq_band }, true).mult;
        // (i) equilibrium implies the reported position is compatible with the band, and a
        //     reported position strictly inside the band implies equilibrium
        const badLabel = eq ? !(d.position_pct >= 45 - TOL && d.position_pct <= 55 + TOL)
          : (d.position_pct > 45 + TOL && d.position_pct < 55 - TOL);
        if (badLabel) { disagree++; if (!ex) ex = `${d.position_pct}%→${d.zone}`; }
        // (ii) inside the band the long multiplier is at its floor
        if (eq && m !== 0.5) { disagree++; if (!ex) ex = `${d.position_pct}% labelled equilibrium but mult ${m}`; }
        // (iii) outside the band and below it, a long is NOT floored
        if (!eq && d.position_pct < 45 && m === 0.5) { disagree++; if (!ex) ex = `${d.position_pct}% is discount but mult floored`; }
      }
      check('the label and the sizing agree across 1001 positions', disagree === 0,
        disagree ? `${disagree} disagreements, e.g. ${ex}` : 'label ⇔ band, band ⇔ floor multiplier');
    }
  }
}

/* ============================================ C. the narrative that reads it */
console.log('\n— M52 C: the Location line in narrative() (momentum.js) —');
/**
 * This is the coupling that makes M52 a three-file change. The line was
 * `dir: pd.zone === 'discount' ? 1 : -1` with the else-branch text asserting "longs here are
 * paying up". Widening the band in smc.js alone would have made 45–50% of the range report
 * dir -1 and tell the trader price was premium while it was still below the midpoint.
 */
function locationLine(pd) {
  const n = MOM.narrative({
    symbol: 'TEST',
    mtf: {
      tf: '15m', ind: null,
      smc: {
        structure: { trend: 'ranging', recent_labels: [], last_break: null },
        premium_discount: pd, liquidity: {}, displacement: [], sweeps: [], inducement: [], sessions: {},
      },
    },
    htf: {}, ltf: {}, align: { bias: 0, reason: 'probe' }, mech: {}, td: null,
  });
  return (n.lines || n || []).find ? (n.lines || n).find((l) => l.title === 'Location') : null;
}
{
  const at = (p) => { const d = pdAt(p); return locationLine(d); };
  const disc = at(0.30), eq = at(0.50), prem = at(0.70);
  if (!disc || !eq || !prem) {
    check('narrative() emits a Location line', false,
      `discount=${!!disc} equilibrium=${!!eq} premium=${!!prem} — check the fixture against narrative()'s inputs`);
  } else {
    check('narrative() emits a Location line', true, 'all three states produced one');
    check('discount → dir +1 and the value-side text', disc.dir === 1 && /value side for longs/.test(disc.text), `dir ${disc.dir}`);
    check('premium → dir -1 and the paying-up text', prem.dir === -1 && /paying up/.test(prem.text), `dir ${prem.dir}`);
    check('equilibrium → dir 0 (the neutral value this array already uses)', eq.dir === 0, `dir ${eq.dir}`);
    check('equilibrium text carries the course response, not a premium claim',
      /mid-range/i.test(eq.text) && /reduced size|stay out/i.test(eq.text), eq.text.slice(eq.text.indexOf('.') + 2).slice(0, 96));
    // The regression this whole section exists to prevent.
    const justBelow = at(0.47);
    check('47% is NOT reported as premium / "paying up" (the binary-test regression)',
      justBelow.dir !== -1 && !/paying up/.test(justBelow.text),
      `dir ${justBelow.dir}; text ${/paying up/.test(justBelow.text) ? 'says "paying up"' : 'does not say "paying up"'}`);
    check('the Location line still reports the position and range', /at 47/.test(justBelow.text.replace(/47(\.\d+)?%/, 'at 47')) || /47(\.\d+)?%/.test(justBelow.text),
      (/[0-9.]+% \([a-z]+\)/.exec(justBelow.text) || [''])[0]);
  }
}

/* ==================================================== D. the wired-up engine */
console.log('\n— M52 D: does the size actually change, end to end? —');
{
  let Synth = null;
  try { Synth = require(path.join(__dirname, 'harness', 'synth.js')); } catch (e) { note('synth.js unavailable: ' + e.message); }
  if (!Synth) {
    check('engine-level sizing carries the range multiplier', false, 'harness/synth.js not found');
  } else {
    const CTX = { balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex' };
    const rows = [];
    for (let seed = 1; seed <= 4 && rows.length < 400; seed++) {
      const candles = Synth.series({ seed, bars: 600 });
      const htf = Synth.aggregate(candles, 4);
      for (let i = 140; i < candles.length - 5 && rows.length < 400; i++) {
        const win = candles.slice(Math.max(0, i - 280), i + 1);
        const h = htf.filter((b) => b.t <= candles[i].t).slice(-80);
        let a; try { a = SMC.analyse(win, { tf: '15m', htfCandles: h.length > 30 ? h : null, now: candles[i].t }); } catch (e) { continue; }
        if (!a || !a.ok) continue;
        let r; try { r = S.buildSetups(a, { ...CTX, price: candles[i].c }); } catch (e) { continue; }
        for (const c of (r.candidates || [])) if (c.risk) rows.push(c);
      }
    }
    check('the engine produces candidates carrying a risk plan', rows.length > 0, `${rows.length} from 4 seeds`);
    const withR = rows.filter((c) => c.risk.range_risk_multiplier !== undefined && Number.isFinite(c.risk.range_position_pct));
    check('every risk plan carries the range multiplier and the position it came from',
      rows.length > 0 && withR.length === rows.length, `${withR.length}/${rows.length}`);
    const reduced = withR.filter((c) => c.risk.range_risk_multiplier < 1);
    check('the reduction actually fires in practice (§6: not a dead branch)', reduced.length > 0,
      `${reduced.length}/${withR.length} candidates sized below full`);
    // The arithmetic, from the fields the API returns — this is what a consumer would audit.
    const GM = S.GRADE_RISK_MULT;
    const badArith = withR.filter((c) => Math.abs(c.risk.risk_pct - Math.round(c.risk.risk_pct_configured * GM[c.grade] * c.risk.range_risk_multiplier * 100) / 100) > 0.011);
    check('risk_pct === configured × grade × range, on real engine output', badArith.length === 0,
      `${withR.length - badArith.length}/${withR.length}` + (badArith.length ? ` — e.g. ${badArith[0].risk.risk_pct} vs ${badArith[0].risk.risk_pct_configured}×${GM[badArith[0].grade]}×${badArith[0].risk.range_risk_multiplier}` : ''));
    // The note must explain the cut and name its cause; and must be absent when nothing moved.
    const cutNoNote = reduced.filter((c) => !c.risk.risk_adjustment_note || !/range position/i.test(c.risk.risk_adjustment_note));
    check('a range-driven cut is explained to the trader, naming the range as the cause', cutNoNote.length === 0,
      `${reduced.length - cutNoNote.length}/${reduced.length}` + (cutNoNote.length ? ` — e.g. ${JSON.stringify(cutNoNote[0].risk.risk_adjustment_note)}` : ''));
    const untouched = withR.filter((c) => c.risk.range_risk_multiplier === 1 && GM[c.grade] === 1);
    const noisy = untouched.filter((c) => c.risk.risk_adjustment_note !== null);
    check('no note is emitted when nothing was adjusted', noisy.length === 0,
      `${untouched.length - noisy.length}/${untouched.length}`);
    // Same grade, floor vs full — the guarantee stated in dollars, not multipliers.
    let dollarPairs = 0, badDollars = 0;
    for (const grade of [...new Set(withR.map((c) => c.grade))]) {
      if (GM[grade] === 0) continue;
      const g = withR.filter((c) => c.grade === grade);
      const floorMax = Math.max(...g.filter((c) => c.risk.range_risk_multiplier === 0.5).map((c) => c.risk.risk_amount), -1);
      const fullMin = Math.min(...g.filter((c) => c.risk.range_risk_multiplier === 1).map((c) => c.risk.risk_amount), Infinity);
      if (floorMax >= 0 && fullMin !== Infinity) { dollarPairs++; if (!(floorMax < fullMin)) badDollars++; }
    }
    check('at the same grade a mid-range entry risks strictly fewer DOLLARS than one at the extreme',
      dollarPairs > 0 && badDollars === 0, `${dollarPairs - badDollars}/${dollarPairs} grades`);
    note(`engine sample: ${rows.length} candidates, ${withR.length} with a range multiplier, ${reduced.length} reduced; ` +
      `zones ${['discount', 'equilibrium', 'premium'].map((z) => `${z}=${withR.filter((c) => c.risk.range_zone === z).length}`).join(' ')}`);
  }
}

/* ------------------------------------------------------------- report */
note('Synthetic data throughout. This proves the sizing RULE is implemented, wired and internally');
note('consistent — it is not evidence that reducing mid-range risk improves returns. That is a');
note('separate measurement: see the M52 section of analysis/harness/BASELINE.txt.');
console.log('\n' + '—'.repeat(34));
for (const n of notes) console.log('  note  ' + n);
console.log(`\nM52 PROBE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
