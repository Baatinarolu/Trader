#!/usr/bin/env node
'use strict';
/** M78 selector + actual-source neutrality. Named/legacy composition fixtures
 * declare structural inputs; the 100-read census below uses actual OHLC→SMC.
 * TJ_APP allows the identical assertions against shipped 256299e.
 */
const path = require('path'), fs = require('fs');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const CONTROL = process.env.M78_CONTROL || '/tmp/m78-control/extracted/tradejournal';
const load = f => require(path.join(APP, 'src/bots', f));
const ep = path.join(APP, 'src/bots/entry-preference.js');
const P = fs.existsSync(ep) ? require(ep) : {}, SMC = load('smc'), Setup = load('setup'),
  TD = load('topdown'), Now = load('now'), Entry = load('entry-models'), Protected = load('protected');
const F = require('./helpers/entry-preference-fixture'), Synth = require('./harness/synth');
const clone = x => JSON.parse(JSON.stringify(x));
let pass = 0, fail = 0;
function ok(label, v, detail = '') { console.log(` ${v ? 'ok  ' : 'FAIL'} ${label}${!v && detail ? ' — ' + detail : ''}`); v ? pass++ : fail++; }
const strip = x => Array.isArray(x) ? x.map(strip) : x && typeof x === 'object'
  ? Object.fromEntries(Object.entries(x).filter(([k]) => !['entry_preference', 'entry_selection', 'entry_variant', 'structure_source'].includes(k)).map(([k, v]) => [k, strip(v)])) : x;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = Date.UTC(2026, 6, 15, 8, 30), HOUR = 3600000;
function series(trend = 'bearish') {
  const s = { tf: '1h', price: 100, atr: 1,
    candles: Array.from({ length: 120 }, (_, i) => ({ t: T - (120 - i) * HOUR, o: 100, c: 100, h: 101, l: 99, v: 100 })),
    smc: { ok: true, tf: '1h', atr: 1, structure: { trend,
      last_break: { dir: trend === 'bearish' ? 'up' : 'down' } } } };
  return F.stamp(s, T);
}
function legacy(dir, tier, frame, projection = false) {
  const td = { direction: dir, blocked: false, status: 'confirmed', steps: [], conflicts: [],
    conviction: { tier }, layers: { bias: { tf: '1d', state: 'confirmed', structure: dir < 0 ? 'bullish' : 'bearish' } },
    crt_plan: { projection_only: projection, dir, side: dir > 0 ? 'long' : 'short',
      range: { low: 90, high: 110 }, aggressive: { entry: 100, stop: dir > 0 ? 98 : 102, target: dir > 0 ? 108 : 92, rr: 4 },
      safer: { entry: dir > 0 ? 99 : 101, stop: dir > 0 ? 98 : 102, target: dir > 0 ? 108 : 92, rr: 9 } } };
  return Now.build({ td, setups: { candidates: [] }, series: frame, symbol: 'TEST', tf: '1h', nowMs: T });
}
for (const dir of [-1, 1]) for (const trend of ['bearish', 'bullish', 'ranging', undefined]) {
  const s = series(trend), aligned = (dir < 0 && trend === 'bearish') || (dir > 0 && trend === 'bullish');
  if (trend === undefined) delete s.smc.structure.trend;
  const wanted = aligned ? 'aggressive' : 'conservative', field = aligned ? 'aggressive' : 'safer';
  const p = P.read?.({ dir, series: s, tf: s.tf, observedAt: T });
  ok(`${dir}/${trend || 'unknown'}: actual internal label selects ${wanted}, not the opposed break/HTF`,
    p?.variant === wanted && p.entry_tf === '1h' && p.source_tf === '1h' && p.dir === dir);
  const a = legacy(dir, 'A', s), b = legacy(dir, 'B', s);
  ok(`${dir}/${trend || 'unknown'}: A AND B select the same CRT variant/price`,
    a.order?.mode === field && b.order?.mode === field && a.order.entry === b.order.entry);
  ok(`${dir}/${trend || 'unknown'}: conviction still sizes independently`, a.full_risk === true && b.full_risk === false);
  ok(`${dir}/${trend || 'unknown'}: selector exposes the rule/reason, not an advanced shortcut`,
    a.entry_preference?.rule === 'entry_tf_internal_structure' && a.order?.entry_preference?.variant === wanted
    && a.entry_preference.advanced_shortcut === false && /structure/i.test(a.entry_preference.reason));
}
const base = series('bearish');
for (const [label, mutate] of [
  ['missing source provenance', s => delete s.smc.structure_source],
  ['wrong analysis TF', s => s.smc.tf = '4h'],
  ['wrong physical TF', s => s.tf = '4h'],
  ['future snapshot', s => s.smc.structure_source.observed_at = T + 1],
  ['forming-built label', s => s.smc.structure_source.closed_only = false],
  ['unobserved last close', s => s.smc.structure_source.last_t = T],
  ['truncated stamp/window mismatch', s => s.candles.shift()],
  ['duplicate timestamps', s => s.candles[1].t = s.candles[0].t],
  ['unsupported trend label', s => s.smc.structure.trend = 'up'],
  ['short-series sentinel', s => s.smc = { ok: false, tf: '1h' }],
]) {
  const s = clone(base); mutate(s); const p = P.read?.({ dir: -1, series: s, tf: '1h', observedAt: T });
  ok(`${label}: explicitly unknown/conservative, never guessed agreement`,
    p?.state === 'unknown' && p.variant === 'conservative' && p.aligned === null && p.trend === null);
}
const p = P.read?.({ dir: -1, series: base, tf: '1h', observedAt: T });
const appended = clone(base); appended.candles.push({ t: T, o: 100, h: 1e9, l: .01, c: 1e8 });
ok('appending unobserved display candles cannot change a genuinely closed structural snapshot',
  !!p && eq(p, P.read?.({ dir: -1, series: appended, tf: '1h', observedAt: T })));
ok('scope rejects another TF, direction and future decision clock', !!P.scope && p
  && P.scope(p, '5m', T, -1) === null && P.scope(p, '1h', T, 1) === null && P.scope(p, '1h', T - 1, -1) === null);
function rejected(v, tf = '1h', dir = -1) { try { if (!P.check) return false; P.check(v, tf, dir); return false; } catch (_) { return true; } }
ok('saved metadata cannot claim aligned aggression against its declared internal trend', rejected({ ...p, trend: 'bullish' }));
ok('saved unknown metadata cannot claim aggression', rejected({ ...p, state: 'unknown', variant: 'aggressive', trend: null, aligned: null }));
ok('saved metadata cannot claim proprietary advanced authorization', rejected({ ...p, advanced_shortcut: true }));
ok('saved metadata cannot hide a wrong execution TF/direction', rejected({ ...p, entry_tf: '5m' }) && rejected({ ...p, dir: 1 }));
const projection = legacy(-1, 'A', base, true);
ok('CRT preference NEVER promotes projection-only prices into an executable Now fallback',
  projection.action === 'WAIT' && !projection.armed && !projection.order && /projection only/.test(projection.headline));

function runNamed(f) {
  const td = TD.build(f.input), ctx = { price: f.input.series.price, atr: 1,
    balance: 10000, riskPct: .5, maxRiskPct: 1, assetClass: 'stocks', bias: f.htfDir,
    entrySeries: f.input.series, observedAt: f.END, useBreakers: !!f.input.opts.useBreakers, topdown: td };
  const setups = Setup.buildSetups(f.input.series.smc, ctx), c = setups.candidates.find(c => c.dir === f.execDir);
  return { td, ctx, setups, c, now: Now.build({ td, setups, series: f.input.series, symbol: 'TEST', tf: '15m', nowMs: f.END }) };
}
for (const dir of [-1, 1]) for (const model of ['market_shift', 'flip']) {
  const aligned = runNamed(F.named(Protected, dir, model, true));
  for (const agrees of [true, false, null]) {
    const f = F.named(Protected, dir, model, agrees), r = runNamed(f), c = r.c, pref = c.entry_preference;
    const variant = agrees === true ? 'aggressive' : 'conservative', label = `${dir}/${model}/${agrees}`;
    ok(`${label}: actual candidate exposes ${variant} on actual 5m, independent of opposing HTF narrative`,
      c.ok && pref?.variant === variant && pref.entry_tf === '5m' && pref.source_tf === '5m'
      && pref.state === (agrees === null ? 'unknown' : 'known') && r.td.countertrend.htf_bias === -dir);
    ok(`${label}: M69 shift remains mandatory but does NOT trivialize this selector`,
      c.checks.find(x => x.key === 'structure').pass && pref?.variant === variant);
    ok(`${label}: basic causal pullback entry/stop/target/RR/risk/grade remain unchanged`,
      eq(strip(c), strip(aligned.c)));
    ok(`${label}: Now actual prices remain candidate-owned, not an aggressive CRT shortcut`,
      r.now.armed && r.now.order.entry === c.levels.entry && r.now.order.stop === c.levels.stop
      && r.now.order.target === c.levels.targets[0].price && r.now.order.entry_preference?.variant === variant
      && r.now.order.entry_preference.execution === 'basic_causal_pullback');
    ok(`${label}: named evidence stores the same selection and no advanced authorization`,
      pref && eq(c.entry_evidence?.entry_preference, pref) && pref.advanced_shortcut === false
      && JSON.parse(Entry.encodeEvidence(c.entry_evidence, model, '5m')).entry_preference?.variant === variant);
  }
  const f = F.named(Protected, dir, model, true);
  // Remove all post-shift bars while retaining the real shift/sweep/causal zone.
  f.input.triggerSeries.candles = f.input.triggerSeries.candles.filter(b => b.t <= f.input.triggerSeries.smc.structure.last_break.t);
  F.stamp(f.input.triggerSeries, f.END);
  const missing = runNamed(f);
  ok(`${dir}/${model}: aligned aggressive preference does not bypass missing post-shift pullback`,
    missing.td.entry_setup.state === 'waiting_pullback' && !missing.c.ok && !missing.now.armed
    && missing.c.entry_preference?.variant === 'aggressive');
}

// ACTUAL SMC, no declared pools/zones/trends in this arm. Compared against the
// unchanged shipped parent, stripping only M78's new metadata, never old facts.
const oldSMC = fs.existsSync(path.join(CONTROL, 'src/bots/smc.js')) ? require(path.join(CONTROL, 'src/bots/smc')) : null;
const oldSetup = oldSMC ? require(path.join(CONTROL, 'src/bots/setup')) : null;
let reads = 0, variants = { aggressive: 0, conservative: 0 }, trends = {}, sourceErrors = 0,
  oldSmcDiffs = 0, oldSetupDiffs = 0, prefixDiffs = 0, unobservedErrors = 0, disagreementReads = 0;
for (let seed = 1; seed <= 20; seed++) {
  const all = Synth.series({ seed, bars: 610 });
  for (let end = 360; end <= 600; end += 60) {
    const candles = all.slice(end - 300, end), clock = candles.at(-1).t + 900000;
    const opts = { tf: '15m', now: candles.at(-1).t, observedAt: clock }, a = SMC.analyse(candles, opts);
    const frame = { tf: '15m', candles, smc: a }, ctx = { price: a.price, atr: a.atr, balance: 10000,
      riskPct: 1, entrySeries: frame, observedAt: clock }; reads++;
    trends[a.structure.trend] = (trends[a.structure.trend] || 0) + 1;
    const eventDir = a.structure.last_break?.dir;
    if (eventDir && ((eventDir === 'up' && a.structure.trend !== 'bullish') || (eventDir === 'down' && a.structure.trend !== 'bearish'))) disagreementReads++;
    const future = all.slice(end, end + 5).map(b => ({ ...b, h: b.h + 10, l: Math.max(.01, b.l - 5) }));
    const futureSMC = SMC.analyse(candles.concat(future), opts);
    for (const dir of [-1, 1]) {
      const pref = P.read?.({ dir, series: frame, tf: '15m', observedAt: clock });
      const expected = (dir > 0 && a.structure.trend === 'bullish') || (dir < 0 && a.structure.trend === 'bearish');
      if (!pref || pref.state !== 'known' || pref.source_tf !== '15m' || pref.variant !== (expected ? 'aggressive' : 'conservative')
          || pref.source_close_at > clock || pref.source_close_at !== candles.at(-1).t + 900000) sourceErrors++;
      if (pref) variants[pref.variant]++;
      const appendedFrame = { ...frame, candles: candles.concat(future) };
      if (!pref || !eq(pref, P.read?.({ dir, series: appendedFrame, tf: '15m', observedAt: clock }))) prefixDiffs++;
      const unknown = P.read?.({ dir, series: { tf: '15m', candles: candles.concat(future), smc: futureSMC }, tf: '15m', observedAt: clock });
      if (!unknown || unknown.state !== 'unknown' || unknown.variant !== 'conservative') unobservedErrors++;
    }
    if (oldSMC) {
      const old = oldSMC.analyse(candles, opts);
      if (!eq(strip(a), strip(old))) oldSmcDiffs++;
      const oldCtx = { ...ctx, entrySeries: { ...frame, smc: old } };
      if (!eq(strip(Setup.buildSetups(a, ctx)), strip(oldSetup.buildSetups(old, oldCtx)))) oldSetupDiffs++;
    }
  }
}
ok('actual OHLC census exercises 100 genuine SMC reads with both observed structural preferences',
  reads === 100 && variants.aggressive > 0 && variants.conservative > 0);
ok('actual OHLC preference source/clock/TF/label selection errors: ZERO', sourceErrors === 0, String(sourceErrors));
ok('actual closed source snapshot ignores appended future display bars: ZERO preference differences', prefixDiffs === 0, String(prefixDiffs));
ok('labels recomputed with unobserved candles are NOT promoted as closed knowledge', unobservedErrors === 0, String(unobservedErrors));
ok('actual detector old SMC facts unchanged versus 256299e (only M78 annotation removed)', !!oldSMC && oldSmcDiffs === 0, String(oldSmcDiffs));
ok('actual detector old Setup prices/gates/grades/risk unchanged versus 256299e', !!oldSetup && oldSetupDiffs === 0, String(oldSetupDiffs));
console.log(JSON.stringify({ reads, preferences: variants, trends, break_label_disagreements: disagreementReads,
  source_errors: sourceErrors, smc_differences: oldSmcDiffs, setup_differences: oldSetupDiffs,
  appended_future_differences: prefixDiffs, forming_source_errors: unobservedErrors }));
console.log(`M78 CORE: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
