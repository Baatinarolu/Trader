#!/usr/bin/env node
'use strict';
/** M71 first-paid-target invariant and geometry neutrality. Identical assertions
 * run with TJ_APP on frozen 184695d. Fixtures declare SMC/CRT facts; a separate
 * 100-read census uses real SMC analysis of synthetic OHLC, not declared labels.
 */
const path = require('path'), fs = require('fs');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const CONTROL = process.env.M71_CONTROL || '/tmp/m71-control/extracted/tradejournal';
const load = (app, p) => require(path.join(app, 'src/bots', p));
const S = load(APP, 'setup'), Old = load(CONTROL, 'setup'), SMC = load(APP, 'smc'),
  TD = load(APP, 'topdown'), Now = load(APP, 'now');
const F = require('./helpers/primary-rr-fixture'), TF = require('./helpers/target-timeframe-fixture'),
  Synth = require('./harness/synth');
let pass = 0, fail = 0;
const ok = (label, value, detail = '') => { console.log(` ${value ? 'ok  ' : 'FAIL'} ${label}${!value && detail ? ' — ' + detail : ''}`); value ? pass++ : fail++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const build = (f, engine = S) => {
  const sets = engine.buildSetups(f.a, f.ctx);
  return { sets, c: sets.candidates.find(c => c.dir === f.dir) };
};
const geometry = c => {
  const l = c.levels;
  return l ? { entry: l.entry, stop: l.stop, entry_tf: l.entry_tf, stop_tf: l.stop_tf,
    stop_policy: l.stop_policy, target_policy: l.target_policy, targets: l.targets,
    catalogue: l.target_candidates, primary: l.primary_target, final_exact: l.rr_final_exact,
    risk_per_unit: c.risk?.per_unit, configured_risk: c.risk?.risk_pct_configured, range_multiplier: c.risk?.range_risk_multiplier,
    method_multiplier: c.risk?.method_risk_multiplier, entry_preference: c.entry_preference, entry_evidence: c.entry_evidence,
    partial: l.management.partial_at, be: l.management.break_even_after, runner: l.management.runner_target } : null;
};
const rows = [];
for (const dir of [-1, 1]) {
  for (const [name, primaryR, floor, expected] of [
    ['sub-1R', .45, 2, false], ['sub-2R', 1.5, 2, false],
    ['display rounds to 2.00R', 1.999, 2, false], ['exact boundary', 2, 2, true],
    ['above floor', 2.5, 2, true], ['custom lower floor', 1.5, 1, true],
    ['custom higher floor', 2.5, 4, false], ['custom higher boundary', 4, 4, true],
    ['0.1R configured floor', .45, .1, true], ['non-integer configured floor', 1.5, 1.25, true],
  ]) {
    for (const ladderTargets of [false, true]) {
      const f = F.ordinary(dir, primaryR, floor, ladderTargets), bytes = JSON.stringify(f);
      const { c, sets } = build(f), old = build(f, Old).c, l = c.levels;
      const rr = dir * (l.targets[0].price - l.entry) / Math.abs(l.entry - l.stop);
      const label = `${dir}/${name}/${ladderTargets ? 'ladder' : 'single'}`;
      ok(label + ': primary target alone governs runway, management check, veto and eligibility',
        c.ok === expected && c.checks.find(k => k.key === 'runway').pass === expected
        && c.checks.find(k => k.key === 'management').pass === expected
        && (expected || (c.grade === 'C' && c.no_trade.some(v => /floor/.test(v)) && sets.verdict.action === 'NO TRADE')),
        JSON.stringify({ ok: c.ok, grade: c.grade, rr, primary: l.rr_primary, final: l.rr_final }));
      ok(label + ': exact first-target evidence names the configured floor and honest target/TF',
        Math.abs(l.rr_primary_exact - rr) < 1e-9 && l.rr_floor?.rule === 'primary_target'
        && l.rr_floor.min_rr === floor && l.rr_floor.rr === l.rr_primary_exact && l.rr_floor.passed === expected
        && l.rr_floor.precision === 'working_and_published' && l.rr_floor.target_price === l.targets[0].price
        && l.rr_floor.target_tf === l.targets[0].source_tf);
      ok(label + ': entry, stop, configured risk policy, target prices/source, catalogue and partial sizes remain byte-equal to shipped control',
        eq(geometry(c), geometry(old)) && JSON.stringify(f) === bytes);
      ok(label + ': target-count/management policy remains explicit, not artificial 2R geometry',
        ladderTargets ? l.targets.length > 1 && l.management.partial_at?.size === '50%'
          && l.management.runner_target?.size === '50%' && l.targets[0].price === old.levels.targets[0].price
          : l.targets.length === 1 && l.management.partial_at === null && l.management.break_even_after === null
            && /set and forget/.test(l.management.rule));
      const mult = ({ 'A+': 1, A: .5, B: .5, C: .25 })[c.grade];
      const ordinaryPct = Math.round(f.ctx.riskPct * mult * c.risk.range_risk_multiplier * 100) / 100;
      ok(label + ': existing grade/range sizing policy retained (refused grade C may lower hypothetical size)',
        c.risk.grade_risk_multiplier === mult && c.risk.risk_pct === ordinaryPct
        && c.risk.per_unit === old.risk.per_unit && (c.ok !== old.ok || eq(c.risk, old.risk)));
      if (name === 'display rounds to 2.00R') ok(label + ': display-rounding cannot confer permission',
        l.rr_primary === 2 && l.rr_primary_exact < floor && !c.ok);
      rows.push({ label, primary_r: l.rr_primary, primary_exact: l.rr_primary_exact,
        final_r: l.rr_final, configured_floor: floor, before_ok: old.ok, after_ok: c.ok,
        targets: l.targets.map(t => ({ price: t.price, source_tf: t.source_tf })), geometry_equal: eq(geometry(c), geometry(old)) });
    }
  }
  const no = F.ordinary(dir); no.a.structure = { trend: 'ranging' }; no.a.liquidity.pools = [];
  no.a.order_blocks = no.a.order_blocks.filter(z => z.dir === dir); no.a.premium_discount = null;
  const nc = build(no).c;
  ok(`${dir}: no real magnet remains no-target/no-trade, never a synthetic 2R rescue`,
    !nc.ok && nc.levels.targets.length === 0 && nc.levels.rr_primary_exact === 0 && nc.levels.rr_floor?.passed === false);
  const emptyTf = F.ordinary(dir); emptyTf.a.tf = 'bogus'; const ec = build(emptyTf).c;
  ok(`${dir}: unknown physical target band cannot manufacture a qualifying first target`,
    !ec.ok && ec.levels.targets.length === 0 && ec.levels.rr_floor?.passed === false);
  const research = F.ordinary(dir, 1.999, 2); research.ctx.targetAlignment = false;
  const rc = build(research).c;
  ok(`${dir}: explicit pre-M77 research rounding is labelled, not advertised as exact live geometry`,
    rc.levels.rr_floor?.precision === 'legacy_display_rounding' && rc.levels.rr_floor.rule === 'primary_target');
  const defaultFloor = F.ordinary(dir, 1.5, 2); delete defaultFloor.ctx.minRR;
  ok(`${dir}: direct Setup default remains 2R; no user floor is silently replaced`,
    build(defaultFloor).c.levels.rr_floor?.min_rr === 2 && !build(defaultFloor).c.ok);
}
for (const dir of [-1, 1]) for (const model of ['market_shift', 'flip']) {
  const f = TF.named(dir, model);
  for (const frame of [f.input.series, f.input.biasSeries, f.input.triggerSeries]) frame.smc.sessions = SMC.sessionState(new Date(f.END));
  const raw = TD.build({ ...f.input, opts: { useBreakers: model === 'flip', observedAt: f.END } });
  const ctx = { price: f.input.series.price, atr: 1, bias: f.htfDir, balance: 10000, riskPct: .5,
    entrySeries: f.input.series, observedAt: f.END, minRR: 2, useBreakers: model === 'flip', ladderTargets: true };
  const ct = S.buildSetups(f.input.series.smc, { ...ctx, topdown: raw }).candidates.find(c => c.dir === dir);
  ok(`${dir}/${model}: M33 bounded counter-HTF exception stays one target and half-risk`,
    ct.ok && ct.levels.execution_kind === 'countertrend-pullback' && ct.levels.targets.length === 1 && ct.levels.management.partial_at === null
    && ct.levels.rr_primary_exact === ct.levels.rr_final_exact && ct.levels.rr_floor?.passed && ct.risk.risk_pct === .25);
  const ordinary = TF.asOrdinaryCRT(raw, f), first = S.buildSetups(f.input.series.smc, { ...ctx, topdown: ordinary }).candidates.find(c => c.dir === dir);
  const entry = first.levels.entry, distance = Math.abs(entry - first.levels.stop) * 1.5, price = entry + dir * distance;
  f.input.triggerSeries.smc.order_blocks.push({ dir: -dir, bottom: dir > 0 ? price : price - .1,
    top: dir > 0 ? price + .1 : price, strength: 1, breached: false, mitigated: false, t: f.END - 300000 });
  const td = TF.asOrdinaryCRT(TD.build({ ...f.input, opts: { useBreakers: model === 'flip', observedAt: f.END } }), f);
  const inputs = { a: f.input.series.smc, dir, ctx: { ...ctx, topdown: td } }, result = build(inputs), c = result.c;
  const old = build(inputs, Old).c, now = Now.build({ td, setups: result.sets, series: f.input.series, symbol: 'TEST', tf: '15m', nowMs: f.END });
  ok(`${dir}/${model}: named basic pullback with sub-floor first target refuses despite a farther qualifying runner`,
    !c.ok && c.entry_model === model && c.levels.rr_primary < 2 && c.levels.rr_final > 2
    && !c.checks.find(k => k.key === 'runway').pass && !now.armed && !now.order);
  ok(`${dir}/${model}: rejection does not edit named geometry/evidence or authorize CRT projected alternatives`,
    eq(geometry(c), geometry(old)) && !now.order && c.entry_evidence && c.entry_tf === '5m');
}
// Actual synthetic OHLC -> SMC, 100 observations / both directions. Check all
// current single/opt-in ladder candidates against frozen control geometry.
let reads = 0, candidates = 0, defaultChanges = 0, geometryChanges = 0, floorErrors = 0, rescued = 0;
for (let seed = 1; seed <= 5; seed++) {
  const bars = Synth.series(seed, 500);
  for (let i = 200; i < 500; i += 15) {
    const win = bars.slice(Math.max(0, i - 299), i + 1), a = SMC.analyse(win, { tf: '15m', now: bars[i].t, swingMode: 'bos', nested: true });
    reads++;
    for (const ladderTargets of [false, true]) {
      const ctx = { price: bars[i].c, atr: a.atr || 1, bias: seed % 2 ? 1 : -1,
        balance: 10000, riskPct: .5, minRR: 2, ladderTargets, observedAt: bars[i].t + 900000 };
      const b = Old.buildSetups(a, ctx), n = S.buildSetups(a, ctx);
      for (const c of n.candidates) {
        candidates++; const old = b.candidates.find(x => x.dir === c.dir);
        geometryChanges += !eq(geometry(c), geometry(old));
        if (!ladderTargets) defaultChanges += c.ok !== old.ok || c.grade !== old.grade || c.score !== old.score;
        if (c.ok && (!c.levels?.targets.length || c.levels.rr_primary_exact + 1e-9 < 2)) floorErrors++;
        if (ladderTargets && old.ok && !c.ok && c.levels?.rr_primary_exact + 1e-9 < 2) rescued++;
      }
    }
  }
}
ok('100 actual OHLC reads/400 candidates: published geometry/configured risk policy/evidence never moved', reads === 100 && candidates === 400 && geometryChanges === 0, JSON.stringify({ reads, candidates, geometryChanges }));
ok('actual OHLC census: default score/grade/permission unchanged; all permitted targets meet the primary floor',
  defaultChanges === 0 && floorErrors === 0, JSON.stringify({ defaultChanges, floorErrors, rescued }));
const result = { app: APP, control: CONTROL, pass, fail, fixtures: rows,
  census: { reads, candidates, defaultChanges, geometryChanges, floorErrors, previously_rescued: rescued },
  scope: 'Declared boundary fixtures plus actual synthetic OHLC geometry census. Not market edge; no native named outcome claim.' };
if (process.env.M71_RESULT) fs.writeFileSync(process.env.M71_RESULT, JSON.stringify(result, null, 2) + '\n');
console.log(`\nM71 primary RR: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
