#!/usr/bin/env node
/**
 * analysis/probe-reverify-applied.js — the §8.2 re-verification sweep.
 *
 * For every ledger row marked APPLIED this tests the claim that actually matters:
 * not "is the value computed" but **"is the value CONSUMED, and does it SURVIVE TO
 * THE OUTPUT"**.
 *
 * Why this probe exists. M21 sat marked APPLIED while silently dead. targetPools()
 * deliberately put the weak structural extreme first; setup.js then ran
 * `targets.sort((a,b) => a.rr - b.rr)`, undoing it, so the weak extreme led only when
 * it happened to be nearest — 77 of 1174 eligible candidates. It looked fine because
 * the three-rung ladder could surface it in ANY rung and the old probe accepted
 * `targets.some(kind === 'weak_structure')`, which passed by coincidence.
 *
 * Two rules from the ledger are enforced here on every new term:
 *   §6 "A classifier returning one value across the whole sample is broken, however
 *       plausible the logic. Print distinct-value counts to prove a new term
 *       discriminates."  -> every boolean/enum field must show BOTH values.
 *   §6 "Grep every .map( that reconstructs an object — new fields get dropped there."
 *       -> survival is asserted on the emitted object, not on the producer.
 *
 * It drives the REAL engine — src/bots/smc.js analyse() + src/bots/setup.js
 * buildSetups() — the same two calls the server makes, over seeded synthetic candles.
 *
 *   node analysis/probe-reverify-applied.js              # from the repo root
 *   node analysis/probe-reverify-applied.js --seeds 40
 *
 * ⚠ DATA IS SYNTHETIC (analysis/harness/synth.js). Nothing here is evidence of a
 *   trading edge; it measures whether the engine's decisions are internally
 *   consistent and whether implemented values reach the output.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* --------------------------------------------------------------- locate the app */
function findRoot() {
  const cands = [
    path.join(__dirname, '..', 'extracted', 'tradejournal'),  // repo root CWD (usual)
    path.join(__dirname, '..'),                               // analysis/ inside the app
    path.join(process.cwd(), 'extracted', 'tradejournal'),
    process.cwd(),
  ];
  for (const c of cands) {
    if (fs.existsSync(path.join(c, 'src', 'bots', 'smc.js'))) return c;
  }
  throw new Error('cannot locate src/bots/smc.js — run from the repo root or extracted/tradejournal');
}
const ROOT = findRoot();
const SMC = require(path.join(ROOT, 'src/bots/smc.js'));
const Setup = require(path.join(ROOT, 'src/bots/setup.js'));
const Synth = require(path.join(__dirname, 'harness', 'synth.js'));
const GRADE_RISK_MULT = Setup.GRADE_RISK_MULT;

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d; };
const SEEDS = arg('seeds', 25);
const BARS = arg('bars', 1500);
const WINDOW = arg('window', 300);
const WARMUP = 120;
const STRIDE = arg('stride', 3);          // sample every Nth window: structure fields need volume, not density

/* ------------------------------------------------------------------- harness */
let pass = 0, fail = 0;
const notes = [];
function check(id, ok, detail) {
  if (ok) { pass++; console.log(`  ok    ${id}  ${detail || ''}`); }
  else { fail++; console.log(`  FAIL  ${id}  ${detail || ''}`); }
  return ok;
}
function note(s) { notes.push(s); }
const r2 = (x) => Math.round(x * 100) / 100;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const distinct = (a) => [...new Set(a)];

/* ------------------------------------------------------------- collect a sample */
const cand = [];          // every emitted candidate
const tradeable = [];     // ok === true
const obs = [];           // order blocks
const brks = [];          // breakers
const breaks = [];        // structure break events
const swingRanges = [];
let analyses = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  const candles = Synth.series({ seed, bars: BARS });
  const htfAll = Synth.aggregate(candles, 4);
  for (let i = WARMUP; i < candles.length - 5; i += STRIDE) {
    const win = candles.slice(Math.max(0, i - WINDOW), i + 1);
    const htf = htfAll.filter((b) => b.t <= candles[i].t).slice(-80);
    let a;
    try {
      a = SMC.analyse(win, { tf: '15m', htfCandles: htf.length > 30 ? htf : null, now: candles[i].t });
    } catch (e) { continue; }
    if (!a || !a.ok) continue;
    analyses++;
    if (a.structure && a.structure.swing_range) swingRanges.push(a.structure.swing_range);
    for (const o of (a.order_blocks || [])) obs.push(o);
    for (const b of (a.breakers || [])) brks.push(b);
    for (const e of ((a.structure && a.structure.breaks) || [])) breaks.push(e);

    let res;
    try {
      res = Setup.buildSetups(a, {
        price: candles[i].c, balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex',
      });
    } catch (e) { continue; }
    for (const c of ((res && res.candidates) || [])) {
      cand.push(c);
      if (c.ok) tradeable.push(c);
    }
  }
}

console.log(`\nre-verification sweep of the APPLIED rows`);
console.log(`  engine      ${path.relative(process.cwd(), ROOT) || ROOT}/src/bots/{smc,setup}.js (real, unmodified paths)`);
console.log(`  sample      ${SEEDS} seeds × ${BARS} bars, window ${WINDOW}, stride ${STRIDE}`);
console.log(`              ${analyses} analyses · ${cand.length} candidates · ${tradeable.length} tradeable`);
console.log(`              ${obs.length} order blocks · ${brks.length} breakers · ${breaks.length} break events\n`);

if (!cand.length) {
  console.log('BROKEN PROBE: no candidates were produced at all. Per §6 a probe that measures');
  console.log('nothing is a broken probe, not a null result — fix the sample before reading on.');
  process.exit(1);
}

/* ============================================================ SURVIVAL TO OUTPUT */
console.log('— does the value survive to the emitted object? —');

// M2 — swing range. Sanctioned scope: "emitted, not enforced".
{
  const withAll = swingRanges.filter((s) => ['high', 'low', 'width', 'width_pct'].every((k) => typeof s[k] === 'number'));
  check('M2  swing_range survives to structure output',
    swingRanges.length > 0 && withAll.length === swingRanges.length,
    `${withAll.length}/${swingRanges.length} carry high+low+width+width_pct`);
  const w = distinct(swingRanges.map((s) => s.width_pct));
  check('M2  swing_range.width_pct discriminates', w.length > 1,
    `${w.length} distinct widths (${w.slice(0, 4).join(', ')}${w.length > 4 ? ', …' : ''})`);
}

// M25 — market phase, "reported on every candidate as `phase`".
{
  const have = cand.filter((c) => c.phase && typeof c.phase.phase === 'string');
  check('M25 phase survives on every candidate', have.length === cand.length,
    `${have.length}/${cand.length}`);
  const d = distinct(have.map((c) => c.phase.phase));
  check('M25 phase is not a constant classifier (§6)', d.length >= 2,
    `values: ${d.join(', ')} — counts ${d.map((v) => `${v}=${have.filter((c) => c.phase.phase === v).length}`).join(' ')}`);
  const withNote = have.filter((c) => typeof c.phase.note === 'string' && c.phase.note.length > 10);
  check('M25 phase carries a plain-language note', withNote.length === have.length, `${withNote.length}/${have.length}`);
}

// M21 — strong/weak, and the ordering guarantee that was silently dead.
{
  const have = cand.filter((c) => c.strong_weak && 'strong' in c.strong_weak && 'weak' in c.strong_weak);
  check('M21 strong_weak survives on every candidate', have.length === cand.length, `${have.length}/${cand.length}`);
  const trendy = have.filter((c) => c.strong_weak.trend && c.strong_weak.trend !== 'ranging');
  // The real guarantee is NOT "trending => both labels". strongWeak() has a sanctioned
  // third branch: when the trend label contradicts the swing geometry it emits
  // strong/weak = null WITH stale:true and a note attributing the contradiction to M50
  // (no bias hysteresis) rather than inventing a target on the wrong side of the entry.
  // Asserting the naive form produced a false failure of 92/1936 on the first run of
  // this probe — the probe was wrong, not the code, so the check was corrected rather
  // than the finding recorded. §6: check the input before reporting the output.
  const labelled = trendy.filter((c) => c.strong_weak.strong && c.strong_weak.weak);
  const staleBranch = trendy.filter((c) => !c.strong_weak.strong && !c.strong_weak.weak
    && c.strong_weak.stale === true && String(c.strong_weak.note || '').length > 20);
  const unexplained = trendy.length - labelled.length - staleBranch.length;
  check('M21 every trending candidate is either labelled or the sanctioned stale branch',
    trendy.length === 0 || unexplained === 0,
    `${labelled.length} labelled + ${staleBranch.length} stale (M50) of ${trendy.length}; ${unexplained} unexplained nulls`);
  // And a label must never put the weak extreme on the wrong side of the strong one —
  // that is the geometry the stale branch exists to refuse.
  const contradictory = labelled.filter((c) => c.strong_weak.trend === 'bullish'
    ? !(c.strong_weak.weak.price > c.strong_weak.strong.price)
    : !(c.strong_weak.weak.price < c.strong_weak.strong.price));
  check('M21 no labelled candidate puts weak on the wrong side of strong', contradictory.length === 0,
    `${labelled.length - contradictory.length}/${labelled.length} geometrically consistent`);

  // The guarantee the old probe missed: when a weak_structure target exists in the
  // emitted ladder, it must LEAD — not merely appear somewhere in it.
  const withTargets = cand.filter((c) => c.levels && Array.isArray(c.levels.targets) && c.levels.targets.length);
  const hasWeak = withTargets.filter((c) => c.levels.targets.some((t) => t.kind === 'weak_structure'));
  const weakLeads = hasWeak.filter((c) => c.levels.targets[0].kind === 'weak_structure');
  check('M21 weak_structure LEADS the emitted target ladder',
    hasWeak.length > 0 && weakLeads.length === hasWeak.length,
    `${weakLeads.length}/${hasWeak.length} (the dead-wiring figure was 77/1174)`);

  // .map()/spread survival: primary_target is `{...ladder[0]}`, so kind must survive.
  const pt = withTargets.filter((c) => c.levels.primary_target);
  const ptKind = pt.filter((c) => typeof c.levels.primary_target.kind === 'string');
  check('M21 primary_target keeps kind through the spread', ptKind.length === pt.length, `${ptKind.length}/${pt.length}`);

  // risk.at_targets is a .map() that reconstructs the object — record what it drops.
  const at = cand.filter((c) => c.risk && Array.isArray(c.risk.at_targets) && c.risk.at_targets.length);
  const atKind = at.filter((c) => c.risk.at_targets.some((t) => 'kind' in t));
  note(`M21 risk.at_targets drops \`kind\` (${atKind.length}/${at.length} retain it). Benign: it is a PnL view ` +
       `(role/price/rr/pnl) and the authoritative list levels.targets keeps kind. Recorded, not failed.`);
}

// M51 — one target by default; no partial on a single-target trade.
{
  const withLev = cand.filter((c) => c.levels && c.levels.management && Array.isArray(c.levels.targets));
  const single = withLev.filter((c) => c.levels.targets.length === 1);
  const multi = withLev.filter((c) => c.levels.targets.length > 1);
  const badSingle = single.filter((c) => c.levels.management.partial_at !== null || c.levels.management.break_even_after !== null);
  check('M51 single-target trades emit no partial_at / break_even_after',
    badSingle.length === 0, `${single.length - badSingle.length}/${single.length} single-target candidates clean`);
  const badSingleRunner = single.filter((c) => c.levels.management.runner_target && c.levels.management.runner_target.size !== '100%');
  check('M51 single-target runner is sized 100%, not 50%', badSingleRunner.length === 0,
    `${single.length - badSingleRunner.length}/${single.length}`);
  const badMulti = multi.filter((c) => !c.levels.management.partial_at);
  check('M51 multi-target trades DO emit partial_at', badMulti.length === 0, `${multi.length - badMulti.length}/${multi.length}`);
  note(`M51 target-count split: single=${single.length} multi=${multi.length} — the single target is the default as claimed.`);
}

// M58 / M98 — grade must drive position size.
{
  const withRisk = cand.filter((c) => c.risk && typeof c.risk.risk_pct === 'number');
  check('M58 risk plan survives to output', withRisk.length > 0, `${withRisk.length}/${cand.length} candidates carry risk`);
  const badMult = withRisk.filter((c) => c.risk.grade_risk_multiplier !== GRADE_RISK_MULT[c.grade]);
  check('M58 grade_risk_multiplier matches GRADE_RISK_MULT[grade]', badMult.length === 0,
    `${withRisk.length - badMult.length}/${withRisk.length}` + (badMult.length ? ` — e.g. ${badMult[0].grade}→${badMult[0].risk.grade_risk_multiplier}` : ''));
  // M52 put a SECOND multiplier in this pipeline, so the identity this line asserts is now
  // configured × grade × range instead of configured × grade. Restating it is not weakening it:
  // the M58 claim itself is checked unchanged immediately above (`grade_risk_multiplier` equals
  // GRADE_RISK_MULT[grade], and it discriminates across the sample), and leaving the old form in
  // place would make this probe assert that mid-range risk reduction does NOT happen.
  const rangeMultOf = (c) => (c.risk.range_risk_multiplier === undefined ? 1 : c.risk.range_risk_multiplier);
  const badRange = withRisk.filter((c) => !(rangeMultOf(c) > 0 && rangeMultOf(c) <= 1));
  check('M52 range_risk_multiplier is within (0,1] — it can only ever REDUCE risk', badRange.length === 0,
    `${withRisk.length - badRange.length}/${withRisk.length}` + (badRange.length ? ` — e.g. ${badRange[0].risk.range_risk_multiplier}` : ''));
  const badArith = withRisk.filter((c) => Math.abs(c.risk.risk_pct - r2(c.risk.risk_pct_configured * c.risk.grade_risk_multiplier * rangeMultOf(c))) > 0.011);
  check('M58 risk_pct === configured × grade × range multiplier (it is CONSUMED, not decorative)', badArith.length === 0,
    `${withRisk.length - badArith.length}/${withRisk.length}`);
  const mults = distinct(withRisk.map((c) => c.risk.grade_risk_multiplier));
  check('M58 the multiplier discriminates across the sample (§6)', mults.length > 1,
    `values ${mults.sort().join(', ')}`);
  const downsized = withRisk.filter((c) => ['B', 'C'].includes(c.grade));
  const badDown = downsized.filter((c) => !(c.risk.risk_pct < c.risk.risk_pct_configured));
  check('M58 B and C are actually down-sized (the M95 compensating control)',
    downsized.length === 0 || badDown.length === 0,
    downsized.length ? `${downsized.length - badDown.length}/${downsized.length} B/C candidates sized below configured` : 'no B/C candidates in sample');
}

// M52 — mid-range risk reduction, plus the label/sizing agreement the row also asked for.
{
  const withRange = cand.filter((c) => c.risk && Number.isFinite(c.risk.range_position_pct));
  check('M52 the risk plan carries the range position it was sized from', withRange.length > 0,
    `${withRange.length}/${cand.length} candidates`);
  // Recomputed HERE from the emitted fields rather than by calling Setup.rangeRiskMult: a check
  // that calls the function it is verifying is vacuous (§6). Same curve, written independently.
  const FULL_AT = 0.20, HALF_AT = 0.05, FLOOR = 0.5;
  const expectMult = (posPct, long) => {
    const depth = long ? 0.5 - posPct / 100 : posPct / 100 - 0.5;
    if (depth >= FULL_AT) return 1;
    if (depth <= HALF_AT) return FLOOR;
    return FLOOR + (1 - FLOOR) * (depth - HALF_AT) / (FULL_AT - HALF_AT);
  };
  const badMult = withRange.filter((c) => Math.abs(c.risk.range_risk_multiplier - expectMult(c.risk.range_position_pct, c.dir > 0)) > 1e-3);
  check('M52 range_risk_multiplier follows the depth curve, recomputed independently', badMult.length === 0,
    `${withRange.length - badMult.length}/${withRange.length}` +
    (badMult.length ? ` — e.g. pos ${badMult[0].risk.range_position_pct}% dir ${badMult[0].dir} → ${badMult[0].risk.range_risk_multiplier}, expected ${expectMult(badMult[0].risk.range_position_pct, badMult[0].dir > 0)}` : ''));
  // The label and the sizing must agree — the second half of the row. Before M52 'equilibrium'
  // was reachable only at pos === 0.5 exactly, so the label was cosmetic and the 45–55 band in
  // setup.js's inGoodHalf was the only real mechanism.
  // `position_pct` is reported rounded to 2dp while the label is computed at full precision, so
  // the two can only be compared to within half a unit of the reported precision. The first
  // version of this check compared them exactly and produced 2 false failures out of 17023 — a
  // true pos of 0.550004 reports `position_pct: 55` with `zone: 'premium'`, which looks like a
  // disagreement and is not one. Stated in both directions so the tolerance cannot be used to
  // smuggle a genuinely wrong label through: equilibrium implies the reported value is compatible
  // with the band, and a reported value strictly inside the band implies equilibrium.
  const TOL = 0.005;
  const badBand = withRange.filter((c) => {
    const p = c.risk.range_position_pct, eq = c.risk.range_zone === 'equilibrium';
    return eq ? !(p >= 45 - TOL && p <= 55 + TOL) : (p > 45 + TOL && p < 55 - TOL);
  });
  check("M52 zone label 'equilibrium' agrees with the 45–55 band to within reported precision", badBand.length === 0,
    `${withRange.length - badBand.length}/${withRange.length}` + (badBand.length
      ? ` — e.g. ${badBand.slice(0, 4).map((c) => `pos ${c.risk.range_position_pct}% zone ${c.risk.range_zone} mult ${c.risk.range_risk_multiplier}`).join(' ; ')}`
      : ''));
  const eqCount = withRange.filter((c) => c.risk.range_zone === 'equilibrium').length;
  check('M52 the equilibrium label is actually reachable (§6: not a dead branch)', eqCount > 0,
    `${eqCount}/${withRange.length} candidates labelled equilibrium`);
  const rmults = distinct(withRange.map((c) => c.risk.range_risk_multiplier));
  check('M52 the range multiplier discriminates across the sample (§6)', rmults.length > 1,
    `${rmults.length} distinct values, min ${Math.min(...rmults)} max ${Math.max(...rmults)}`);
  // At the same grade, less-favourable range position must deploy less capital. Grouped rather
  // than pairwise — an O(n²) scan over ~23k candidates is not a check anyone will run twice.
  const byGradeMult = {};
  for (const c of withRange) {
    const g = byGradeMult[c.grade] = byGradeMult[c.grade] || {};
    const s = g[c.risk.range_risk_multiplier] = g[c.risk.range_risk_multiplier] || { min: Infinity, max: -Infinity };
    if (c.risk.risk_pct < s.min) s.min = c.risk.risk_pct;
    if (c.risk.risk_pct > s.max) s.max = c.risk.risk_pct;
  }
  // Two restatements, both after false failures in the first version of this check:
  //  (a) grade 'no-trade' carries gradeMult 0, so risk_pct is 0 at EVERY range position and no
  //      ordering between buckets is possible. That is correct behaviour, asserted on its own.
  //  (b) risk_pct is rounded to 2dp, so adjacent buckets differing in the 4th decimal (0.5 vs
  //      0.5003) collapse to the same number. Strict ordering is therefore only asserted across a
  //      gap the rounding cannot absorb — the floor bucket against the full-risk bucket — and
  //      NON-DECREASING monotonicity is asserted across every adjacent pair.
  const noTrade = withRange.filter((c) => c.grade === 'no-trade');
  const badNoTrade = noTrade.filter((c) => c.risk.risk_pct !== 0);
  check('M52 a no-trade setup deploys nothing whatever the range position', badNoTrade.length === 0,
    noTrade.length ? `${noTrade.length - badNoTrade.length}/${noTrade.length}` : 'no no-trade candidates carrying a risk plan in sample');
  let mono = 0, badMono = 0; const monoEx = [];
  let strict = 0, badStrict = 0; const strictEx = [];
  for (const grade of Object.keys(byGradeMult)) {
    if (GRADE_RISK_MULT[grade] === 0) continue;                    // risk_pct is 0 by construction
    const buckets = byGradeMult[grade];
    const ms = Object.keys(buckets).map(Number).sort((a, b) => a - b);
    for (let i = 0; i + 1 < ms.length; i++) {
      mono++;
      if (!(buckets[ms[i]].max <= buckets[ms[i + 1]].min)) {
        badMono++;
        if (monoEx.length < 3) monoEx.push(`${grade} ×${ms[i]} max ${buckets[ms[i]].max} > ×${ms[i + 1]} min ${buckets[ms[i + 1]].min}`);
      }
    }
    if (ms[0] < 1 && buckets[1]) {
      strict++;
      if (!(buckets[ms[0]].max < buckets[1].min)) {
        badStrict++;
        if (strictEx.length < 3) strictEx.push(`${grade} ×${ms[0]} max ${buckets[ms[0]].max} not < ×1 min ${buckets[1].min}`);
      }
    }
  }
  check('M52 risk_pct is monotone non-decreasing in the range multiplier within a grade',
    mono > 0 && badMono === 0,
    (mono ? `${mono - badMono}/${mono} adjacent same-grade buckets ordered` : 'no adjacent buckets in sample') +
    (monoEx.length ? ` — e.g. ${monoEx.join(' ; ')}` : ''));
  check('M52 at the SAME grade, a mid-range entry deploys STRICTLY less than one at the extreme',
    strict > 0 && badStrict === 0,
    (strict ? `${strict - badStrict}/${strict} grades separate floor from full risk` : 'no grade has both a floor and a full-risk bucket in sample') +
    (strictEx.length ? ` — e.g. ${strictEx.join(' ; ')}` : ''));
  note('M52 range multiplier distribution: ' +
    rmults.sort((x, y) => x - y).map((v) => `${v}×${withRange.filter((c) => c.risk.range_risk_multiplier === v).length}`).join(' '));
  note('M52 zone label distribution: ' +
    distinct(withRange.map((c) => c.risk.range_zone)).sort()
      .map((z) => `${z}=${withRange.filter((c) => c.risk.range_zone === z).length}`).join(' '));
}

// M9 — the guardrail default, the ceiling, and whether the BOUNDARIES consult it.
//
// First version of this check was a regex for an inline `Math.min(1, …risk_pct…)` in
// routes/api.js. That passed/failed on the SHAPE of the implementation rather than the
// guarantee, so it reported a false failure the moment the clamp was correctly factored
// into the shared instruments.js helper. Rewritten to test semantics + wiring, per §6:
// a probe must test the guarantee, and a probe that measures nothing is broken.
{
  const I = require(path.join(ROOT, 'src/instruments.js'));
  const G = I.RISK_GUARDRAIL;
  check('M9  the guardrail constants are the course\'s numbers',
    G && G.default_pct === 0.5 && G.max_pct === 1 && G.floor_pct === 0.25,
    G ? `default ${G.default_pct}% · guardrail ${G.guardrail_pct}% · max ${G.max_pct}% · floor ${G.floor_pct}%` : 'RISK_GUARDRAIL missing');
  check('M9  absent risk falls back to 0.5, not 1', I.clampRiskPct(undefined, {}) === 0.5 && I.clampRiskPct(null, {}) === 0.5,
    `undefined→${I.clampRiskPct(undefined, {})} null→${I.clampRiskPct(null, {})}`);
  check('M9  above the guardrail needs the manual unlock', I.clampRiskPct(0.75, {}) === 0.5 && I.clampRiskPct(0.75, { unlocked: true }) === 0.75,
    `0.75 locked→${I.clampRiskPct(0.75, {})} unlocked→${I.clampRiskPct(0.75, { unlocked: true })}`);
  check('M9  1% is the absolute ceiling even when unlocked (Ep 21)', I.clampRiskPct(50, { unlocked: true }) === 1,
    `50 unlocked→${I.clampRiskPct(50, { unlocked: true })}`);
  check('M9  a clamp is explained, not silent', typeof I.riskGuardrailNote(50, 1, { unlocked: true }) === 'string' && I.riskGuardrailNote(0.5, 0.5, {}) === null,
    'note on a clamp, null when honoured as asked');

  // Wiring: every boundary the finding named must route through the shared guardrail.
  const api = fs.readFileSync(path.join(ROOT, 'src/routes/api.js'), 'utf8');
  const idx = fs.readFileSync(path.join(ROOT, 'src/bots/index.js'), 'utf8');
  const sites = [
    ['POST/PUT /accounts (stored unclamped)', /risk_unlocked/.test(api) && (api.match(/I\.clampRiskPct\(/g) || []).length >= 3],
    ['/tools/size + monte-carlo request params', (api.match(/I\.clampRiskPct\(/g) || []).length >= 4],
    ['bots/index.js read path (main signal path)', /riskPlan\(/.test(idx) && /I\.clampRiskPct\(/.test(idx)],
  ];
  for (const [name, ok] of sites) check('M9  guarded: ' + name, ok, ok ? 'routes through clampRiskPct' : 'NOT guarded');

  // Behavioural: setup.js must actually READ ctx.maxRiskPct — the finding was that it was
  // documented in the ctx docstring and never read.
  const a = SMC.analyse(Synth.series({ seed: 11, bars: 500 }).slice(-300), { tf: '15m' });
  if (a && a.ok) {
    const mk = (ctx) => {
      const r = Setup.buildSetups(a, Object.assign({ price: 1, balance: 10000, valuePerPoint: 100000, assetClass: 'forex' }, ctx));
      const c = (r.candidates || []).find((x) => x.risk);
      return c ? c.risk.risk_pct_configured : null;
    };
    const capped = mk({ riskPct: 5, maxRiskPct: 1 });
    const inert = mk({ riskPct: 5 });
    check('M9  setup.js READS ctx.maxRiskPct (was docstring-only, never read)', capped === 1,
      `riskPct=5 with maxRiskPct=1 → risk_pct_configured=${capped}`);
    check('M9  inert when maxRiskPct is absent, so the baseline still reproduces', inert === 5,
      `riskPct=5 with no maxRiskPct → ${inert} (unchanged; the harness passes none)`);
  } else {
    note('M9  setup.js maxRiskPct check skipped — seed 11 produced no analysable window.');
  }
}

// M47 — three zone kinds; the string must describe the decision actually taken.
{
  const withLev = cand.filter((c) => c.levels && c.levels.entry_kind);
  const kinds = distinct(withLev.map((c) => c.levels.entry_kind));
  const known = kinds.every((k) => ['order_block', 'flip_zone', 'fvg'].includes(k));
  check('M47 entry_kind stays inside the known set', known, `kinds: ${kinds.join(', ') || '(none)'}`);
  // §6: "A classifier returning one value across the whole sample is broken." Only ONE
  // kind appears here, so say why rather than let it pass silently — and it is two
  // sanctioned decisions, not a dead path: M16 requires an order block, so a standalone
  // FVG can no longer win the POI gate and `fvg` is unreachable by construction; and
  // `flip_zone` needs breakers, which M47 ships opt-in (--breakers, off by default).
  if (kinds.length === 1) {
    note(`M47 entry_kind shows only '${kinds[0]}' in this sample. Explained, not a defect: M16 makes an ` +
         `order block mandatory so 'fvg' cannot win the POI gate, and 'flip_zone' needs --breakers, ` +
         `which M47 deliberately ships opt-in. Re-run the harness with --breakers to exercise flip_zone.`);
  }
  const WORD = { order_block: 'order block', flip_zone: 'flip zone', fvg: 'FVG' };
  const lied = withLev.filter((c) => {
    const sr = String(c.levels.stop_reason || '');
    const want = WORD[c.levels.entry_kind];
    // a stop_reason naming a DIFFERENT zone kind than the one actually used is the
    // hardcoded-'order_block' defect this row fixed.
    return Object.entries(WORD).some(([k, w]) => k !== c.levels.entry_kind && sr.includes(w) && !sr.includes(want));
  });
  check('M47 stop_reason never names a zone kind other than the one used', lied.length === 0,
    `${withLev.length - lied.length}/${withLev.length} consistent` + (lied.length ? ` — e.g. ${lied[0].levels.entry_kind} described as "${lied[0].levels.stop_reason}"` : ''));
}

/* ============================================================ CONSUMED, NOT EMITTED */
console.log('\n— is the value actually consumed by a decision? —');

// M31 — depth term in the strength formula.
{
  const withDepth = obs.filter((o) => typeof o.depth_in_range === 'number');
  check('M31 depth_in_range emitted on every order block', withDepth.length === obs.length, `${withDepth.length}/${obs.length}`);
  const d = distinct(withDepth.map((o) => o.depth_in_range));
  check('M31 depth discriminates (§6)', d.length > 3, `${d.length} distinct depth values`);
  // Consumption test: strength must rise with depth, holding everything else aside.
  const lo = withDepth.filter((o) => o.depth_in_range <= 0.25), hi = withDepth.filter((o) => o.depth_in_range >= 0.75);
  check('M31 depth is CONSUMED — strength rises with depth', lo.length > 3 && hi.length > 3 && mean(hi.map((o) => o.strength)) > mean(lo.map((o) => o.strength)),
    `mean strength depth<=0.25 ${r2(mean(lo.map((o) => o.strength)))} (n=${lo.length}) vs depth>=0.75 ${r2(mean(hi.map((o) => o.strength)))} (n=${hi.length})`);
}

// M42 — swept liquidity weighted in the strength formula.
{
  const withSwept = obs.filter((o) => typeof o.swept_liquidity === 'boolean');
  check('M42 swept_liquidity emitted on every order block', withSwept.length === obs.length, `${withSwept.length}/${obs.length}`);
  const t = withSwept.filter((o) => o.swept_liquidity), f = withSwept.filter((o) => !o.swept_liquidity);
  check('M42 swept_liquidity shows BOTH values (§6: one value = broken classifier)', t.length > 0 && f.length > 0,
    `swept=${t.length} unswept=${f.length}`);
  check('M42 the sweep is CONSUMED — swept zones score stronger', t.length > 3 && f.length > 3 && mean(t.map((o) => o.strength)) > mean(f.map((o) => o.strength)),
    `mean strength swept ${r2(mean(t.map((o) => o.strength)))} vs unswept ${r2(mean(f.map((o) => o.strength)))}`);
}

// M32 — the FVG prerequisite. Sanctioned scope: opt-in, OFF by default (§5 decision).
{
  const withFvg = obs.filter((o) => typeof o.has_fvg === 'boolean');
  check('M32 has_fvg/fvg_i emitted on every order block', withFvg.length === obs.length, `${withFvg.length}/${obs.length}`);
  // The gate must actually bite when switched on. Measured on a reduced seed set for speed.
  let offCount = 0, onCount = 0, onAllHaveFvg = true;
  for (let seed = 1; seed <= 5; seed++) {
    const candles = Synth.series({ seed, bars: 900 });
    const win = candles.slice(-300);
    try {
      const aOff = SMC.analyse(win, { tf: '15m', now: candles[candles.length - 1].t });
      const aOn = SMC.analyse(win, { tf: '15m', now: candles[candles.length - 1].t, obRequiresFvg: true });
      if (aOff && aOff.ok) offCount += (aOff.order_blocks || []).length;
      if (aOn && aOn.ok) {
        const o = aOn.order_blocks || [];
        onCount += o.length;
        if (o.some((x) => !x.has_fvg)) onAllHaveFvg = false;
      }
    } catch (e) { /* skip */ }
  }
  check('M32 obRequiresFvg is a real gate, not a label', onCount < offCount && onAllHaveFvg,
    `order blocks ${offCount} (off) -> ${onCount} (on); all surviving have has_fvg=${onAllHaveFvg}`);
  note(`M32 stays opt-in per the §5 decision (default requireFvg=false, verified in findOrderBlocks' signature).`);
}

// M48 — the two missing breaker criteria, recorded and auditable (gating NOT adopted).
{
  if (!brks.length) {
    note('M48 no breakers in this sample — the field checks below are vacuous. Raise --seeds to exercise them.');
  }
  const have = brks.filter((b) => 'failed_reaction' in b && 'reaction_point' in b && 'confirmed' in b);
  check('M48 failed_reaction/reaction_point/confirmed survive on every breaker', have.length === brks.length,
    `${have.length}/${brks.length}`);
  if (brks.length) {
    const bad = brks.filter((b) => b.confirmed !== (b.failed_reaction && b.broke_structure));
    check('M48 confirmed === failed_reaction && broke_structure (it is CONSUMED)', bad.length === 0,
      `${brks.length - bad.length}/${brks.length}`);
    const dt = distinct(brks.map((b) => b.failed_reaction));
    check('M48 failed_reaction shows BOTH values (§6)', dt.length > 1, `values ${dt.join(', ')}`);
  }
}

// M23 / M24 / M119 — CHoCH vs BOS vs MSS, and the report-only scope that must stay true.
{
  const typed = breaks.filter((e) => e.type === 'CHoCH' || e.type === 'BOS');
  check('M24 every break is classified CHoCH or BOS', typed.length === breaks.length, `${typed.length}/${breaks.length}`);
  const dt = distinct(breaks.map((e) => e.type));
  check('M24 type shows BOTH values (§6)', dt.length > 1, `counts ${dt.map((v) => `${v}=${breaks.filter((e) => e.type === v).length}`).join(' ')}`);
  const badStrong = breaks.filter((e) => typeof e.broke_strong !== 'boolean');
  check('M24 broke_strong present on every break', badStrong.length === 0, `${breaks.length - badStrong.length}/${breaks.length}`);
  const ds = distinct(breaks.map((e) => e.broke_strong));
  check('M24 broke_strong shows BOTH values (§6) — the up-direction asymmetry M119 fixed', ds.length > 1,
    `counts ${ds.map((v) => `${v}=${breaks.filter((e) => e.broke_strong === v).length}`).join(' ')}`);
  const choch = breaks.filter((e) => e.type === 'CHoCH');
  const badChoch = choch.filter((e) => !(e.flipped && e.broke_strong));
  check('M24 CHoCH requires flip AND a strong level', badChoch.length === 0, `${choch.length - badChoch.length}/${choch.length}`);
  const mssTrue = breaks.filter((e) => e.mss === true), mssFalse = breaks.filter((e) => e.mss === false);
  check('M23 mss can be false (it is no longer a synonym for CHoCH)', mssTrue.length > 0 && mssFalse.length > 0,
    `mss true=${mssTrue.length} false=${mssFalse.length}`);
  const badMss = mssTrue.filter((e) => e.type !== 'CHoCH');
  check('M23 every MSS is a CHoCH (sweep + CHoCH, not sweep alone)', badMss.length === 0, `${mssTrue.length - badMss.length}/${mssTrue.length}`);
}

/* ============================================================ THE TRADEABILITY GATE */
console.log('\n— does the gate decide, and does the score only rank? (M7/M8/M35/M61/M95/M96/M97) —');
{
  // M96/M95: tradeability comes from the vetoes, not from the weighted score.
  const bad = cand.filter((c) => c.ok !== (Array.isArray(c.no_trade) && c.no_trade.length === 0 && c.grade !== 'no-trade'));
  check('M95/M96 ok === (no vetoes && grade !== no-trade) on every candidate', bad.length === 0,
    `${cand.length - bad.length}/${cand.length}` + (bad.length ? ` — e.g. ok=${bad[0].ok} no_trade=${JSON.stringify(bad[0].no_trade)}` : ''));

  // A refused setup must still advertise itself as refused (§6: "a refused setup that
  // advertised itself as tradeable").
  const refused = cand.filter((c) => !c.ok);
  const lyingAction = refused.filter((c) => /enter|take the trade|execute/i.test(String(c.action || '')) && !/not|no |refus|wait|pass|avoid|stand aside/i.test(String(c.action || '')));
  check('M61 no refused setup advertises itself as tradeable', lyingAction.length === 0,
    `${refused.length - lyingAction.length}/${refused.length} refusals worded consistently` + (lyingAction.length ? ` — e.g. "${lyingAction[0].action}"` : ''));

  // M7: sub-2R is a hard refusal.
  const subRR = cand.filter((c) => c.levels && typeof c.levels.rr_final === 'number' && c.levels.rr_final < 2);
  const subRROk = subRR.filter((c) => c.ok);
  check('M7  every sub-2R candidate is refused', subRROk.length === 0, `${subRR.length - subRROk.length}/${subRR.length} refused`);

  // M35: `waiting` is refused but STILL VISIBLE (hiding it would suppress a real alert).
  const waiting = cand.filter((c) => c.levels && c.levels.entry_status === 'waiting');
  const waitingOk = waiting.filter((c) => c.ok);
  check('M35 every waiting candidate is refused', waitingOk.length === 0, `${waiting.length - waitingOk.length}/${waiting.length} refused`);
  check('M35 waiting candidates are still emitted, not dropped', waiting.length === 0 || waiting.every((c) => c.levels && c.levels.entry > 0),
    `${waiting.length} waiting candidates remain visible with their level`);

  // M8: outside a killzone is a refusal, tested so the short-series sentinel cannot
  // falsely refuse (sessions.in_killzone === false, not merely falsy).
  const outside = cand.filter((c) => (c.no_trade || []).some((v) => /killzone/i.test(String(v))));
  check('M8  the killzone veto fires and is attributed', outside.length > 0,
    `${outside.length} candidates refused for the killzone`);

  // M96: the score must still rank — i.e. it varies independently of the decision.
  const scores = distinct(cand.map((c) => c.score));
  check('M96 score still varies (left to rank, not to decide)', scores.length > 3, `${scores.length} distinct scores`);
}

/* ------------------------------------------------------------------ report */
console.log('\n' + '—'.repeat(36));
for (const n of notes) console.log('  note  ' + n);
console.log('\nRE-VERIFICATION SWEEP: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
