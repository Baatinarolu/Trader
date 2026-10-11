#!/usr/bin/env node
'use strict';
/** M76 pure concept seams + ACTUAL OHLC detector census and annotation neutrality.
 * poolBefore in unit cases is explicit source evidence, not detector discovery.
 * The census/prefix checks call the actual SMC detector, with no injected pools.
 */
const fs = require('fs'), path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const CONTROL = process.env.TJ_CONTROL || '/tmp/m75-control/extracted/tradejournal';
const SMC = require(path.join(APP, 'src/bots/smc')), Setup = require(path.join(APP, 'src/bots/setup'));
const mod = path.join(APP, 'src/bots/protected.js'), P = fs.existsSync(mod) ? require(mod) : {};
const Synth = require('./harness/synth'), F = require('./helpers/target-timeframe-fixture');
let pass = 0, fail = 0;
const ok = (label, c, detail = '') => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${label}${!c && detail ? ' — ' + detail : ''}`); c ? pass++ : fail++; };
const clone = x => structuredClone(x), STEP = 900000, T = Date.UTC(2026, 9, 6, 9);
function input(dir = -1) {
  const m = x => dir < 0 ? x : 200 - x;
  const make = (t, o, h, l, c) => ({ t, o: m(o), h: dir < 0 ? h : m(l), l: dir < 0 ? l : m(h), c: m(c), v: 1 });
  const b = [make(T, 99, 100, 98, 99), make(T + STEP, 99, 103, 98, 99.5)];
  return { b, s: { i: 1, t: b[1].t, dir, type: dir < 0 ? 'BSL' : 'SSL', level: 100,
    extreme: dir < 0 ? 103 : 97, close: b[1].c, pool: dir < 0 ? 'equal_highs' : 'equal_lows' },
    pool: { kind: dir < 0 ? 'equal_highs' : 'equal_lows', type: dir < 0 ? 'BSL' : 'SSL',
      price: 100, tf: '15m', source_t: T, available_at: T + STEP, basis: 'explicit_unit_prefix_evidence' } };
}
function discover(f, options = {}) {
  return P.discover ? P.discover(f.b, Array.isArray(f.s) ? f.s : [f.s], {
    tf: '15m', observedAt: f.b.at(-1).t + STEP, poolBefore: () => f.pool, ...options }) : {};
}
for (const dir of [-1, 1]) {
  const f = input(dir), r = discover(f), p = r.levels?.[0], tag = dir < 0 ? 'high' : 'low';
  ok(tag + ': a closed sweep/rejection creates one protected institutional boundary',
    r.state === 'known' && r.levels.length === 1 && p.type === tag && p.price === f.s.extreme && p.status === 'intact');
  ok(tag + ': provenance names the real TF/close/known prior pool, not a stronger swing label',
    p?.tf === '15m' && p.available_at === f.s.t + STEP && p.liquidity[0].available_at <= p.t
    && p.sweep_level === f.s.level && p.sweep_close === f.b[1].c && p.basis === 'closed_liquidity_rejection');
  const points = [{ type: tag, price: f.s.extreme, t: f.s.t }, { type: tag, price: 102, t: T - STEP }];
  const ann = P.annotate ? P.annotate(points, r) : [];
  ok(tag + ': only the sweeping swing is protected; an unswept/strong swing is not inferred',
    ann[0]?.protected === true && ann[1]?.protected === false && ann[1]?.protection_state === 'not_proven');
  const taken = clone(f); taken.b.push({ ...taken.b[1], t: T + 2 * STEP,
    h: dir < 0 ? 104 : 102, l: dir < 0 ? 98 : 96, c: dir < 0 ? 99.5 : 100.5 });
  const tr = discover(taken);
  ok(tag + ': wick through later TAKES the old boundary even if it closes back inside',
    tr.levels?.[0]?.status === 'taken' && tr.levels[0].invalidated_at === T + 3 * STEP);
  const forming = discover(taken, { observedAt: T + 2 * STEP });
  ok(tag + ': forming/future excursion cannot invalidate a closed protected boundary', forming.levels?.[0]?.status === 'intact');
  const duplicate = clone(f); duplicate.s = [duplicate.s, { ...duplicate.s }];
  ok(tag + ': several swept pool records at one physical peak cannot invent several highs/lows', discover(duplicate).levels?.length === 1);
  const bad = clone(f); bad.b[1].c = dir < 0 ? 100.5 : 99.5; bad.s.close = bad.b[1].c;
  ok(tag + ': closing THROUGH liquidity is a breakout, not protection', discover(bad).levels?.length === 0);
  const wrong = clone(f); wrong.s.extreme += .3;
  ok(tag + ': a stamped arbitrary extreme cannot override actual OHLC', discover(wrong).levels?.length === 0);
  const future = discover(f, { poolBefore: () => ({ ...f.pool, available_at: f.s.t + 1 }) });
  ok(tag + ': future liquidity is explicitly unknown, never retrodated', future.levels?.length === 0
    && future.rejected?.some(x => x.state === 'unknown' && x.reason === 'liquidity_not_proven_before_sweep'));
  const noPool = discover(f, { poolBefore: null });
  ok(tag + ': missing prior-pool evidence remains unknown', noPool.levels?.length === 0 && noPool.rejected?.[0]?.state === 'unknown');
  ok(tag + ': an HTF pool cannot be relabelled as entry-TF protection', discover(f, { poolBefore: () => ({ ...f.pool, tf: '4h' }) }).levels?.length === 0);
  ok(tag + ': an unclosed sweep itself is not a protected high/low', discover(f, { observedAt: f.s.t }).levels?.length === 0);
  ok(tag + ': scope rejects future snapshots and wrong physical TF', P.scope
    && P.scope(r, '5m', T + 3 * STEP).state === 'unknown'
    && P.scope(r, '15m', T + STEP).state === 'unknown');
}
ok('short-series sentinel says protection is UNKNOWN, not a fabricated false/zero level',
  SMC.analyse([], { tf: '15m', observedAt: T }).protected_levels?.state === 'unknown');

// ACTUAL OHLC discovery; same full inputs on current and parent. Only added
// M76/M75/M78 annotation fields are removed -- never old prices/gates/grades/risk.
// M78 separately proves its annotation neutrality against shipped 256299e.
const annotationKeys = new Set(['protected', 'protection_state', 'protected_level', 'protected_levels', 'protection', 'stop_policy', 'entry_preference', 'structure_source']);
function strip(x) {
  if (Array.isArray(x)) return x.map(strip);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k]) => !annotationKeys.has(k)).map(([k, v]) => [k, strip(v)]));
  return x;
}
const oldSMC = fs.existsSync(path.join(CONTROL, 'src/bots/smc.js')) ? require(path.join(CONTROL, 'src/bots/smc')) : null;
const oldSetup = oldSMC ? require(path.join(CONTROL, 'src/bots/setup')) : null;
let reads = 0, highs = 0, lows = 0, alive = 0, taken = 0, badSource = 0, legacyDiffs = 0, setupDiffs = 0, prefixDiffs = 0;
for (let seed = 1; seed <= 20; seed++) {
  const bars = Synth.series({ seed, bars: 600 });
  for (let end = 360; end <= 600; end += 60) {
    const win = bars.slice(end - 300, end), clock = win.at(-1).t + STEP;
    const opts = { tf: '15m', now: win.at(-1).t, observedAt: clock };
    const a = SMC.analyse(win, opts); reads++;
    for (const p of a.protected_levels?.levels || []) {
      if (p.dir < 0) highs++; else lows++;
      if (p.status === 'intact') alive++; else taken++;
      const b = win.find(b => b.t === p.t);
      if (!b || p.tf !== '15m' || p.available_at > clock || p.raw_price !== (p.dir < 0 ? b.h : b.l)
          || !p.liquidity.length || p.liquidity.some(l => l.tf !== '15m' || l.available_at > p.t)) badSource++;
    }
    if (oldSMC) {
      const old = oldSMC.analyse(win, opts);
      if (JSON.stringify(strip(a)) !== JSON.stringify(strip(old))) legacyDiffs++;
      const ctx = { price: a.price, atr: a.atr, balance: 10000, riskPct: 1, stopPolicy: 'legacy' };
      if (JSON.stringify(strip(Setup.buildSetups(a, ctx))) !== JSON.stringify(strip(oldSetup.buildSetups(old, ctx)))) setupDiffs++;
    }
    // Full future/forming input, altered without changing any observed close.
    const future = bars.slice(end, Math.min(end + 8, bars.length)).map(b => ({ ...b, h: b.h + 10, l: Math.max(.01, b.l - 5) }));
    if (future.length) {
      const fa = SMC.analyse(win.concat(future), opts);
      if (JSON.stringify(a.protected_levels) !== JSON.stringify(fa.protected_levels)) prefixDiffs++;
    }
  }
}
ok('actual SMC census runs 100 reads without stamped pools/sweeps/protection', reads === 100);
ok('actual OHLC discovers protected HIGHs and LOWs, not just unit tags', highs > 0 && lows > 0, `${highs}/${lows}`);
ok('actual detector carries both intact and physically taken historical boundaries', alive > 0 && taken > 0, `${alive}/${taken}`);
ok('no detector source/physical-edge/availability errors', badSource === 0);
ok('forming/future perturbations leave the entire observed protected catalogue identical', prefixDiffs === 0, String(prefixDiffs));
ok('annotation stage changes ZERO old SMC fields versus 9f629c1', !!oldSMC && legacyDiffs === 0, String(legacyDiffs));
ok('annotation/legacy-stop arm changes ZERO existing setup results/geometry/risk after removing only added facts', !!oldSetup && setupDiffs === 0, String(setupDiffs));
console.log(JSON.stringify({ reads, highs, lows, intact: alive, taken, source_errors: badSource,
  legacy_differences: legacyDiffs, setup_differences: setupDiffs, prefix_differences: prefixDiffs }));
console.log(`M76 PROTECTED: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
