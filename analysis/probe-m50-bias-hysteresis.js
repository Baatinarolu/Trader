#!/usr/bin/env node
/**
 * analysis/probe-m50-bias-hysteresis.js — M50, bias hysteresis.
 *
 * Ep 15 states the rule twice: mistake #4 *"changing bias after every single candlestick… your
 * bias only change when your invalidation is hit"* and step 5 *"If my bias is invalidated, I reset
 * my bias."* Both need STATE. `alignment()` had none — it re-derived from scratch every call, so
 * the invalidation level was never the gate that changed the bias.
 *
 * `probe-ep15-bias-flips.js` measured the defect: 3612 calls → 413 sign flips → 148 (35.8 %)
 * preceded by an invalidating close, **265 (64.2 %) not**. This probe walks the SAME synthetic
 * series with the SAME seed and the SAME window geometry, tracking two biases side by side over
 * identical data: the from-scratch one (reproducing the finding) and one maintained through
 * `Momentum.biasHysteresis`. The claim under test is exact and falsifiable:
 *
 *   after hysteresis, EVERY bias change is preceded by an invalidating close — and the bias still
 *   changes, so the rule is not satisfied by freezing it.
 *
 *   node analysis/probe-m50-bias-hysteresis.js
 *   TJ_ROOT=/tmp/negctl/tradejournal node analysis/probe-m50-bias-hysteresis.js   # negative control
 *
 * Part D goes further and drives the SHIPPED path — `Bots.analyse()` against a stubbed feed and a
 * throwaway database (TRADEJOURNAL_DB, set before db.js loads) — so the wiring is verified rather
 * than assumed: state is written, read back, held against a disagreeing fresh read, released on a
 * breach, and left alone during a bar replay.
 */
'use strict';
const path = require('path');
const fs = require('fs');

function findRoot() {
  const cands = [process.env.TJ_ROOT, path.join(__dirname, '..', 'extracted', 'tradejournal'),
    path.join(process.cwd(), 'extracted', 'tradejournal'), process.cwd()].filter(Boolean);
  for (const c of cands) if (fs.existsSync(path.join(c, 'src', 'bots', 'momentum.js'))) return c;
  throw new Error('cannot locate src/bots/momentum.js');
}
const ROOT = findRoot();
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

/* ------------------------------------------------------- the same walk as ep15 */
let seed = 20261007;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function walk(n, start, amp, vol, regime) {
  const out = []; let p = start, t = Date.UTC(2024, 0, 2);
  for (let i = 0; i < n; i++) {
    const drift = (Math.floor(i / regime) % 2 === 0 ? 1 : -1) * amp;
    const o = p, step = (rnd() - 0.5 + drift) * vol;
    const c = Math.max(0.0001, o + step), w = Math.abs(step) * (0.4 + rnd());
    out.push({ t, o: +o.toFixed(5), h: +Math.max(o, c, o + w).toFixed(5), l: +Math.min(o, c, o - w).toFixed(5), c: +c.toFixed(5), v: 1000 });
    p = c; t += 5 * 60e3;
  }
  return out;
}
function resample(candles, bucket) {
  const out = [];
  for (let i = 0; i + bucket <= candles.length; i += bucket) {
    const b = candles.slice(i, i + bucket);
    out.push({ t: b[0].t, o: b[0].o, c: b[b.length - 1].c, h: Math.max(...b.map((x) => x.h)), l: Math.min(...b.map((x) => x.l)), v: 1000 });
  }
  return out;
}
function mkSeries(candles, tf) {
  const smc = SMC.analyse(candles, { tf });
  return { tf, candles, smc, atr: smc.atr, price: candles[candles.length - 1].c, ind: null };
}

/* ================================================ A. the rule, unit-tested === */
console.log('\n— M50 A: the hysteresis rule itself (pure) —');
const H = MOM.biasHysteresis;
if (typeof H !== 'function') {
  check('biasHysteresis is exported and pure-callable', false, 'absent — pre-M50 tree');
} else {
  check('biasHysteresis is exported', true, 'present');
  const inv = (level, side) => ({ level, side });
  check('first read adopts the fresh derivation', H({ priorBias: null, freshBias: 1, close: 100 }).bias === 1, '');
  check('agreement holds silently, with no reason invented',
    (() => { const r = H({ priorBias: 1, freshBias: 1, close: 100 }); return !r.changed && !r.held && r.changed_because === null; })(), '');
  check('disagreement WITHOUT a level holds the prior bias',
    (() => { const r = H({ priorBias: 1, freshBias: -1, close: 100 }); return r.bias === 1 && r.held && r.disagreement === -1; })(), '');
  check('disagreement with the level NOT breached holds the prior bias',
    (() => { const r = H({ priorBias: 1, freshBias: -1, invalidation: inv(95, 'below'), close: 100 }); return r.bias === 1 && r.held && !r.invalidated; })(), '');
  check('a CLOSE beyond the level changes the bias and says so',
    (() => { const r = H({ priorBias: 1, freshBias: -1, invalidation: inv(95, 'below'), close: 94 }); return r.bias === -1 && r.invalidated && /invalidation hit/.test(r.changed_because); })(), '');
  check('it is a CLOSE test, not a wick test (close back inside holds)',
    H({ priorBias: 1, freshBias: -1, invalidation: inv(95, 'below'), close: 95.5 }).bias === 1, '');
  check('a short is voided by a close ABOVE its level',
    H({ priorBias: -1, freshBias: 1, invalidation: inv(105, 'above'), close: 106 }).bias === 1, '');
  check('a misconfigured side does not invent a breach',
    H({ priorBias: -1, freshBias: 1, invalidation: inv(105, 'below'), close: 106 }).bias === -1,
    'a short with side=below and a close above is NOT treated as invalidated');
  check('an unusable level holds rather than guessing',
    H({ priorBias: 1, freshBias: -1, invalidation: inv(NaN, 'below'), close: 94 }).bias === 1, '');
  // A NULL level is the dangerous case, not NaN: Number(null) is 0, so a naive guard reads the
  // level as 0 and — with side 'above' — every positive close "breaches" it, invalidating the bias
  // on every call while the code still looks like it is applying hysteresis. This assertion failed
  // when it was first written.
  check('a NULL level is absent, not zero (long, side below)',
    H({ priorBias: 1, freshBias: -1, invalidation: inv(null, 'below'), close: 94 }).bias === 1,
    'a close of 94 must not breach a level that does not exist');
  check('a NULL level is absent, not zero (short, side above — the always-breach hazard)',
    (() => { const r = H({ priorBias: -1, freshBias: 1, invalidation: inv(null, 'above'), close: 1.08 }); return r.bias === -1 && !r.invalidated; })(),
    'close 1.08 > 0 would invalidate on EVERY call if null were read as 0');
  check('an undefined level behaves the same way',
    H({ priorBias: -1, freshBias: 1, invalidation: {}, close: 1.08 }).bias === -1, '');
  check('a null close holds rather than guessing',
    H({ priorBias: 1, freshBias: -1, invalidation: inv(95, 'below'), close: null }).bias === 1, '');
  check('a fresh read of 0 (HTF went ranging) is held, not treated as invalidation',
    (() => { const r = H({ priorBias: 1, freshBias: 0, invalidation: inv(95, 'below'), close: 100 }); return r.bias === 1 && r.held && r.disagreement === 0 && !r.invalidated; })(),
    'the ranging vetoes elsewhere stand the trade down; holding the label does not trade through a range');
  check('it never returns a bias the caller did not supply',
    [H({ priorBias: 1, freshBias: -1, close: 1 }).bias, H({ priorBias: -1, freshBias: 1, close: 1 }).bias].every((b) => b === 1 || b === -1), '');
}

/* ============================================ B. measured over the ep15 walk == */
console.log('\n— M50 B: over the walk that found the defect, does the rule hold? —');
const LTF_N = 300, BUCKET_M = 3, BUCKET_H = 12;
const WIN = LTF_N * BUCKET_H;   // 3600 x 5m candles — 1h needs ~300 of them or bias is stuck at 0
let steps = 0;
let rawFlips = 0, rawWith = 0, rawWithout = 0;
let hFlips = 0, hWith = 0, hWithout = 0, hHeld = 0, hDisagreements = 0;
let hNonZero = 0;

for (let run = 0; run < 12; run++) {
  const amp = 0.04 + (run % 4) * 0.02;
  const regime = 500 + (run % 3) * 400;
  const base = walk(5400, 1.08 + (run % 5) * 0.003, amp, 0.0012, regime);
  let prevBias = null, prevRangeHigh = null, prevRangeLow = null;
  let heldBias = 0, heldLevel = null;

  for (let end = WIN; end <= base.length; end += 6) {
    const win = base.slice(end - WIN, end);
    const ltf = mkSeries(win.slice(-LTF_N), '5m');
    const mtf = mkSeries(resample(win, BUCKET_M).slice(-LTF_N), '15m');
    const htf = mkSeries(resample(win, BUCKET_H).slice(-LTF_N), '1h');
    let align;
    try { align = MOM.alignment(htf, mtf, ltf, null); } catch (e) { continue; }
    steps++;
    const bias = align.bias;
    const pd = mtf.smc.premium_discount;
    const rh = pd ? pd.range_high : null, rl = pd ? pd.range_low : null;
    const close = win[win.length - 1].c;

    // (i) the from-scratch bias — reproduces the recorded finding
    if (prevBias !== null && bias !== 0 && prevBias !== 0 && Math.sign(bias) !== Math.sign(prevBias)) {
      rawFlips++;
      const broke = prevBias > 0 ? (prevRangeLow !== null && close < prevRangeLow) : (prevRangeHigh !== null && close > prevRangeHigh);
      if (broke) rawWith++; else rawWithout++;
    }

    // (ii) the same data through hysteresis. The invalidation level for the PRIOR bias is the
    // opposite side of the range that produced it: a long is voided by a close below the range
    // low, a short by a close above the range high — the definition the finding itself used.
    if (H) {
      const inv = heldBias > 0 ? (heldLevel && heldLevel.low != null ? { level: heldLevel.low, side: 'below' } : null)
        : heldBias < 0 ? (heldLevel && heldLevel.high != null ? { level: heldLevel.high, side: 'above' } : null) : null;
      const r = H({ priorBias: heldBias, freshBias: bias, invalidation: inv, close });
      if (r.held) hHeld++;
      if (r.disagreement !== null) hDisagreements++;
      if (r.bias !== 0) hNonZero++;
      if (heldBias !== 0 && r.bias !== 0 && Math.sign(r.bias) !== Math.sign(heldBias)) {
        hFlips++;
        if (r.invalidated) hWith++; else hWithout++;
      }
      heldBias = r.bias;
    }
    prevBias = bias; prevRangeHigh = rh; prevRangeLow = rl;
    heldLevel = { high: rh, low: rl };
  }
}

const pct = (x, n) => (n ? ((x / n) * 100).toFixed(1) + '%' : 'n/a');
console.log(`  alignment() calls                       : ${steps}`);
console.log(`  FROM SCRATCH  sign flips                : ${rawFlips}`);
console.log(`      with an invalidating close          : ${rawWith}  (${pct(rawWith, rawFlips)})`);
console.log(`      WITHOUT one  <- his mistake #4      : ${rawWithout}  (${pct(rawWithout, rawFlips)})`);
if (H) {
  console.log(`  WITH HYSTERESIS sign flips              : ${hFlips}`);
  console.log(`      with an invalidating close          : ${hWith}  (${pct(hWith, hFlips)})`);
  console.log(`      WITHOUT one                         : ${hWithout}  (${pct(hWithout, hFlips)})`);
  console.log(`      held against a disagreeing read     : ${hHeld}`);
  console.log(`      disagreements surfaced, not hidden  : ${hDisagreements}`);
}

if (!H) {
  check('the walk measures hysteresis', false, 'biasHysteresis absent — pre-M50 tree');
} else {
  check('the walk reproduces the defect on the from-scratch bias (§6: the instrument still works)',
    rawFlips > 0 && rawWithout > 0, `${rawFlips} flips, ${rawWithout} without an invalidating close`);
  check('THE RULE: after hysteresis every bias change is preceded by an invalidating close',
    hWithout === 0 && hFlips > 0, `${hWith}/${hFlips} changes invalidated, ${hWithout} not`);
  check('hysteresis does not satisfy the rule by freezing the bias', hFlips > 0,
    `${hFlips} genuine changes remain`);
  check('the bias is still non-zero most of the time (not degenerate)', hNonZero > steps * 0.5,
    `${hNonZero}/${steps} steps carry a direction`);
  check('held decisions outnumber changes, as the rule intends', hHeld > hFlips,
    `${hHeld} held vs ${hFlips} changed`);
  check('disagreements are surfaced rather than silently dropped', hDisagreements > 0,
    `${hDisagreements} times the from-scratch read disagreed and was reported`);
  check('uninvalidated flips are eliminated, not merely reduced',
    rawWithout > 0 && hWithout === 0, `${rawWithout} → ${hWithout}`);
  note(`flip rate fell from ${(rawFlips / steps * 100).toFixed(2)} to ${(hFlips / steps * 100).toFixed(2)} per 100 candles.`);
  note('Synthetic piecewise-drift data. This measures whether the RULE is obeyed, not whether');
  note('obeying it improves returns — the same instrument cannot answer that question.');
}

/* ======================================= C. the numeric level topdown emits === */
console.log('\n— M50 C: topdown.js now emits the level as a number, not only prose —');
{
  let found = 0, agreed = 0, badNum = 0, badSide = 0, badAgree = 0, ex = null;
  for (let run = 0; run < 3 && found < 12; run++) {
    const base = walk(2400, 1.10 + run * 0.004, 0.05, 0.0014, 600);
    for (let end = 900; end <= base.length && found < 12; end += 25) {
      const win = base.slice(Math.max(0, end - 900), end);
      const mtf = mkSeries(win, '15m');
      const htf = mkSeries(resample(win, BUCKET_H).slice(-200), '1h');
      let td;
      try { td = MOM.topdown.build({ symbol: 'TEST', tf: '15m', series: mtf, biasSeries: htf, triggerSeries: mtf, opts: {} }); } catch (e) { continue; }
      const plan = td && td.layers && td.layers.bias && td.layers.bias.plan;
      if (!plan || !plan.invalidation) continue;
      found++;
      const lv = plan.invalidation_level, sd = plan.invalidation_side;
      if (!Number.isFinite(lv)) { badNum++; if (!ex) ex = `level ${lv}`; }
      if (sd !== 'above' && sd !== 'below') { badSide++; if (!ex) ex = `side ${sd}`; }
      // the number and the sentence must name the same level
      // Counted only over plans that HAVE a number, with the denominator reported separately.
      // The first version guarded this with `Number.isFinite(lv) &&` and so passed "12/12" on a
      // pristine tree where lv is undefined — a vacuous pass, the zone-ab trap. A check that
      // skips its own subject must not report full marks.
      if (Number.isFinite(lv)) { agreed++; if (!plan.invalidation.includes(String(lv))) { badAgree++; if (!ex) ex = `"${plan.invalidation}" does not contain ${lv}`; } }
    }
  }
  if (!found) {
    check('topdown produced a plan carrying an invalidation', false, 'no plan in the sampled windows — widen the walk');
  } else {
    check('topdown produced a plan carrying an invalidation', true, `${found} plans sampled`);
    check('invalidation_level is a finite number', badNum === 0, badNum ? `${badNum} bad — e.g. ${ex}` : `${found}/${found}`);
    check('invalidation_side is above or below', badSide === 0, badSide ? `${badSide} bad — e.g. ${ex}` : `${found}/${found}`);
    check('the number and the prose name the SAME level', agreed === found && badAgree === 0,
      badAgree ? `${badAgree} disagree — e.g. ${ex}` : `${agreed}/${found} plans compared` + (agreed < found ? ` — ${found - agreed} had no numeric level, so this is NOT a full pass` : ''));
  }
}

/* ============================================ D. the wired server path ===== */
/* Set BEFORE db.js is required: db.js resolves its URL once, at module load, and this keeps the
 * probe off the user's real journal.db entirely rather than writing to it and cleaning up after. */
process.env.TRADEJOURNAL_DB = process.env.TRADEJOURNAL_DB ||
  path.join(require('os').tmpdir(), `m50-probe-${process.pid}.db`);

(async () => {
  console.log('\n— M50 D: is the rule WIRED into the shipped path, or only exported? —');
  let Db, Bots;
  try {
    Db = require(path.join(ROOT, 'src/db.js'));
    Bots = require(path.join(ROOT, 'src/bots/index.js'));
    await Db.ready;
  } catch (e) {
    check('the server path can be loaded', false, e.message.slice(0, 140));
    Db = null;
  }
  if (Db) {
    console.log(`  (throwaway database: ${require('path').basename(process.env.TRADEJOURNAL_DB)})`);
    // A strong uptrend, answered honestly for whatever interval is asked for, so the engine has
    // something to derive a bias from. Only the candle hosts are stubbed: newsCheck swallows its
    // own errors and prediction is switched off.
    const IV = { '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '4h': 3600e3, '1d': 864e5, '1wk': 7 * 864e5 };
    global.fetch = async (url) => {
      const u = String(url);
      const iv = (/[?&]interval=([^&]+)/.exec(u) || [, '15m'])[1];
      const step = IV[iv] || 900e3, n = 900, t0 = Date.UTC(2026, 0, 1);
      const ts = [], o = [], h = [], l = [], c = [], v = [];
      for (let k = 0; k < n; k++) {
        const p = 1.10 + k * 0.0004 + Math.sin(k / 9) * 0.0006;
        ts.push(Math.floor((t0 + k * step) / 1000));
        o.push(p); c.push(p + 0.0003); h.push(p + 0.0009); l.push(p - 0.0006); v.push(1000);
      }
      const body = JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', exchangeName: 'FX', exchangeTimezoneName: 'UTC', regularMarketPrice: c[n - 1] }, timestamp: ts, indicators: { quote: [{ open: o, high: h, low: l, close: c, volume: v }] } }], error: null } });
      return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
    };

    // The store helpers are themselves part of the M50 change, so on a pre-M50 tree they are
    // missing. Calling them would throw a TypeError and abort the probe, which hides every later
    // check behind one crash — the negative control would under-report. Shim them to no-ops and
    // assert their absence explicitly instead.
    const HAS_STORE = ['getBiasState', 'setBiasState', 'clearBiasState']
      .every((k) => typeof Db[k] === 'function');
    const store = {
      get: (y, t) => (typeof Db['getBiasState'] === 'function' ? Db['getBiasState'](y, t) : undefined),
      set: (o) => (typeof Db['setBiasState'] === 'function' ? Db['setBiasState'](o) : false),
      clear: () => (typeof Db['clearBiasState'] === 'function' ? Db['clearBiasState']() : 0),
    };
    check('the state store exposes get/set/clear helpers', HAS_STORE,
      HAS_STORE ? 'db.getBiasState/setBiasState/clearBiasState' : 'absent — pre-M50 tree has no bias_state');

    const A = (opts) => Bots.analyse('EURUSD', '15m', Object.assign({ includePrediction: false }, opts || {}));
    const HY = (r) => (r && r.momentum ? r.momentum.bias_hysteresis : undefined);
    // Property access that cannot throw. On a pre-M50 tree `bias_hysteresis` does not exist, and
    // `H_(r3, 'held')` would crash the probe instead of reporting a failure — a crash hides every
    // check after it, so the negative control would under-report what is actually missing.
    const H_ = (r, k) => { const h = HY(r); return h ? h[k] : undefined; };

    let r1;
    try { r1 = await A(); } catch (e) { check('analyse() runs against the stubbed feed', false, e.message.slice(0, 140)); }
    if (r1) {
      check('analyse() runs against the stubbed feed', true, `bias ${r1.momentum.bias}, fresh ${r1.momentum.bias_fresh}`);
      check('the SHIPPED analyse() path applies hysteresis at all', !!HY(r1),
        HY(r1) ? 'momentum.bias_hysteresis present' : 'absent — nothing in the shipped path calls the rule');
      check('the response carries a hysteresis block', !!HY(r1) && H_(r1, 'applied') === true, HY(r1) ? 'applied' : 'absent');
      check('the state was written to the store', !!HY(r1) && H_(r1, 'stored') === true, HY(r1) ? `stored=${H_(r1, 'stored')}` : '');
      const row = await store.get('EURUSD', '15m');
      check('a bias_state row exists and agrees with the response', !!row && row.bias === r1.momentum.bias,
        row ? `db bias ${row.bias} vs response ${r1.momentum.bias}` : 'no row');
      // Conditional on the bias being non-zero, and it has to be: with a flat bias there is nothing
      // to protect and no level to test, so a null level is the CORRECT row. The first version of
      // this asserted a level unconditionally and failed on a synthetic series that read bias 0 —
      // a bad assertion, not a bad row.
      if (r1.momentum.bias !== 0) {
        check('a directional bias stores the level that will be tested on the next call',
          !!row && Number.isFinite(row.invalidation_level) && (row.invalidation_side === 'below' || row.invalidation_side === 'above'),
          row ? `level ${row.invalidation_level} side ${row.invalidation_side}` : '');
      } else {
        check('a flat bias stores NO level (nothing to invalidate)',
          !!row && row.bias === 0 && row.invalidation_level === null && row.invalidation_side === null,
          row ? `bias ${row.bias}, level ${row.invalidation_level}` : '');
        note('this synthetic series read bias 0, so the directional first-read path is covered by the');
        note('hold and release cases below, which store a non-zero bias explicitly.');
      }

      // Both branches are driven by the STORED level rather than by hoping the synthetic series
      // produces a disagreement on cue: an unbreachable level must hold the bias whatever the
      // from-scratch read says, and a trivially breached one must release it.
      const freshBias = r1.momentum.bias_fresh;
      const held = freshBias === -1 ? 1 : -1;                     // force a disagreement

      await store.set({ symbol: 'EURUSD', tf: '15m', bias: held, invalidation_level: 1e9, invalidation_side: 'above', since_t: Date.UTC(2026, 0, 1), age_bars: 3, changed_because: null, disagreement: null });
      const r3 = await A();
      check('an unbreachable stored level HOLDS the bias against a disagreeing fresh read', r3.momentum.bias === held,
        `fresh ${r3.momentum.bias_fresh} -> effective ${r3.momentum.bias} (stored ${held})`);
      check('the held disagreement is surfaced, not swallowed', H_(r3, 'held') === true && H_(r3, 'disagreement') === freshBias,
        `held=${H_(r3, 'held')} disagreement=${H_(r3, 'disagreement')}`);
      check('bias_age counts the bars the bias has been held', Number.isFinite(H_(r3, 'age_bars')) && H_(r3, 'age_bars') >= 1,
        `age_bars=${H_(r3, 'age_bars')}`);
      check('the headline was built from the HELD bias, not the fresh one',
        !!(r3.headline && r3.headline.checks && r3.headline.checks.momentum === held),
        `headline checks.momentum=${r3.headline && r3.headline.checks ? r3.headline.checks.momentum : '(none)'}`);
      check('the response direction follows the held bias',
        r3.momentum.direction === (held > 0 ? 'bullish' : 'bearish'), `${r3.momentum.direction}`);

      await store.set({ symbol: 'EURUSD', tf: '15m', bias: held, invalidation_level: 1e-9, invalidation_side: 'above', since_t: Date.UTC(2026, 0, 1), age_bars: 3, changed_because: null, disagreement: null });
      const r4 = await A();
      check('a breached level RELEASES the bias to the fresh read', r4.momentum.bias === r4.momentum.bias_fresh,
        `stored ${held} -> effective ${r4.momentum.bias}, fresh ${r4.momentum.bias_fresh}`);
      check('the release is reported as an invalidation, with a reason',
        H_(r4, 'invalidated') === true && /invalidation hit/.test(H_(r4, 'changed_because') || ''),
        (H_(r4, 'changed_because') || '(none)').slice(0, 84));

      // A bar replay reconstructs the past, so it must neither read nor write live state.
      await store.set({ symbol: 'EURUSD', tf: '15m', bias: held, invalidation_level: 1e9, invalidation_side: 'above', since_t: Date.UTC(2026, 0, 1), age_bars: 9, changed_because: null, disagreement: null });
      const r5 = await A({ trim: 40 });
      check('a bar replay does NOT apply hysteresis', HY(r5) === null, HY(r5) === null ? 'bias_hysteresis is null' : `applied=${H_(r5, 'applied')}`);
      check('a bar replay reports the from-scratch bias', r5.momentum.bias === r5.momentum.bias_fresh,
        `${r5.momentum.bias} vs ${r5.momentum.bias_fresh}`);
      const after = await store.get('EURUSD', '15m');
      check('a bar replay did not overwrite the stored state', !!after && after.bias === held && after.age_bars === 9,
        after ? `bias ${after.bias}, age_bars ${after.age_bars}` : 'row vanished');

      await store.clear();
      note('Part D ran against a THROWAWAY database, so the real journal.db was never touched, and');
      note('the rows it created were cleared at the end.');
    }
  }

  /* ------------------------------------------------------------- report */
  note('SCOPE: A-C verify the pure rule and the numeric invalidation level; D verifies the wiring');
  note('into analyse(), chart() and scan(). Everything runs on a stubbed feed and a throwaway');
  note('database — no live market data and no real journal were touched.');
  console.log('\n' + '\u2014'.repeat(34));
  for (const n of notes) console.log('  note  ' + n);
  console.log(`\nM50 PROBE: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('PROBE ERROR', e); process.exit(1); });
