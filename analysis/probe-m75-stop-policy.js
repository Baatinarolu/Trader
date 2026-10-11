#!/usr/bin/env node
'use strict';
/** Course hierarchy, not a universal nearer stop. Structural-input cases are
 * declared composition seams; M76 has its own actual OHLC discovery census.
 */
const fs = require('fs'), path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const Setup = require(path.join(APP, 'src/bots/setup'));
const load = name => fs.existsSync(path.join(APP, 'src/bots', name + '.js')) ? require(path.join(APP, 'src/bots', name)) : {};
const P = load('protected'), Stops = load('stops'), F = require('./helpers/protected-stop-fixture');
let pass = 0, fail = 0;
const ok = (label, c, detail = '') => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${label}${!c && detail ? ' — ' + detail : ''}`); c ? pass++ : fail++; };
const close = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-8;
function read(f, dir, ctx = {}) {
  const out = Setup.buildSetups(f.a, { price: 100, atr: 1, bias: dir, balance: 10000,
    riskPct: .5, observedAt: f.clock, ...ctx });
  return { c: out.candidates.find(c => c.dir === dir), out };
}
function plan(f, dir, extra = {}) {
  return Stops.plan ? Stops.plan({ dir, entry: 100, zone: { ...f.a.order_blocks[0], kind: 'order_block' }, atr: 1, tf: '15m',
    report: f.report, observedAt: f.clock, currentSweep: f.sweep, currentIsCausal: false, ...extra }) : {};
}
for (const dir of [1, -1]) {
  const tag = dir > 0 ? 'long' : 'short', far = dir > 0 ? 97 : 103, near = dir > 0 ? 99.6 : 100.4;
  const zoneNear = F.ordinary(dir, { peak: far }, P), z = read(zoneNear, dir), old = read(zoneNear, dir, { stopPolicy: 'legacy' });
  ok(tag + ': no CURRENT protected level => choose nearer zone, not a farther old protected peak',
    z.c.levels.stop_policy?.rule === 'nearer_valid_fallback'
    && z.c.levels.stop_policy.kind === 'order_block' && close(z.c.levels.stop, dir > 0 ? 99.32 : 100.68));
  ok(tag + ': legacy research arm retains the measured parent farther-stop geometry', close(old.c.levels.stop, dir > 0 ? 96.82 : 103.18));
  ok(tag + ': unchanged entry/target price, exact TF band and configured risk ceiling survive',
    z.c.levels.entry === old.c.levels.entry && z.c.levels.targets[0]?.price === old.c.levels.targets[0]?.price
    && z.c.levels.target_policy.rule === 'entry_or_one_above' && z.c.levels.target_tf === '15m'
    && z.c.risk.risk_pct <= .5 && z.c.risk.risk_pct_configured === .5);
  ok(tag + ': sizing actually uses the new published stop, not the old wider denominator',
    close(z.c.risk.per_unit, Math.abs(z.c.levels.entry - z.c.levels.stop))
    && z.c.risk.size !== old.c.risk.size && z.c.risk.actual_risk <= z.c.risk.risk_amount + 1);
  const pastNear = F.ordinary(dir, { peak: near, edge: dir > 0 ? 99 : 101 }, P), pn = read(pastNear, dir);
  ok(tag + ': an older protected boundary nearer than the zone wins the fallback',
    pn.c.levels.stop_policy?.kind === (dir > 0 ? 'protected_low' : 'protected_high')
    && pn.c.levels.stop_policy.rule === 'nearer_valid_fallback' && close(pn.c.levels.stop, dir > 0 ? 99.42 : 100.58));
  const currentFar = F.ordinary(dir, { peak: far, current: true }, P), cf = read(currentFar, dir);
  ok(tag + ': CURRENT causal protected boundary overrides a nearer zone (no RR-driven tightening)',
    cf.c.levels.stop_policy?.rule === 'current_protected' && close(cf.c.levels.stop, dir > 0 ? 96.82 : 103.18));
  const currentNear = F.ordinary(dir, { peak: near, edge: dir > 0 ? 99 : 101, current: true }, P), cn = read(currentNear, dir);
  ok(tag + ': current protected peak may also be the tighter valid stop; not always wider',
    cn.c.levels.stop_policy?.rule === 'current_protected' && close(cn.c.levels.stop, dir > 0 ? 99.42 : 100.58));
  ok(tag + ': selected institutional price and source-pool provenance reach executable levels',
    cn.c.levels.stop_policy?.protected_level?.raw_price === near
    && cn.c.levels.stop_policy.protected_level.liquidity[0].available_at <= cn.c.levels.stop_policy.protected_level.t
    && cn.c.levels.stop_tf === '15m');
  ok(tag + ': buffer is still exactly .18 actual entry-TF ATR for BOTH branches',
    close(cf.c.levels.stop_policy?.buffer, .18) && close(z.c.levels.stop_policy?.buffer, .18));
  ok(tag + ': stop explanation/invalidation name the chosen base/rule/TF, not the former farther extreme',
    z.c.levels.stop_reason.includes('nearer_valid_fallback') && z.c.levels.invalidation.includes(dir > 0 ? '99.5' : '100.5')
    && cn.c.levels.invalidation.includes(dir > 0 ? '99.6' : '100.4') && /15m close/.test(cn.c.levels.invalidation));
  const floor = F.ordinary(dir, { peak: dir > 0 ? 90 : 110, current: true }, P);
  const fr = read(floor, dir);
  ok(tag + ': far CURRENT protected boundary below RR floor refuses; no nearer-zone or farther-target rescue',
    fr.c.levels.stop_policy?.rule === 'current_protected' && !fr.c.ok
    && fr.c.levels.targets[0]?.price === (dir > 0 ? 108 : 92) && fr.c.levels.rr_final_exact < 2);

  if (Stops.plan) {
    const wrong = structuredClone(pastNear); wrong.report.levels[0].raw_price = dir > 0 ? 101 : 99;
    wrong.report.levels[0].price = wrong.report.levels[0].raw_price;
    const w = plan(wrong, dir);
    ok(tag + ': wrong-side old protected base is rejected before comparing reward ratios', w.state === 'known' && w.kind === 'order_block');
    const tk = structuredClone(zoneNear); tk.report.levels[0].status = 'taken'; tk.report.levels[0].invalidated_at = tk.clock;
    const historical = plan(tk, dir), causal = plan(tk, dir, { currentIsCausal: true });
    ok(tag + ': taken older boundary cannot be recycled as a valid stop', historical.kind === 'order_block');
    ok(tag + ': taken CURRENT causal boundary refuses rather than switching invalidation to rescue the model', causal.state === 'invalid' && causal.price === null && causal.rule === 'current_protected_taken');
    const mismatch = plan(zoneNear, dir, { report: { ...zoneNear.report, tf: '4h' } });
    ok(tag + ': HTF protection cannot be renamed entry-TF; unknown retains honest conservative geometry',
      mismatch.rule === 'protection_unknown_conservative' && mismatch.protected_level === null
      && close(mismatch.price, dir > 0 ? 96.82 : 103.18));
    const future = plan(zoneNear, dir, { report: { ...zoneNear.report, observed_at: zoneNear.clock + 1 } });
    ok(tag + ': future protection snapshot cannot authorize a tighter stop', future.rule === 'protection_unknown_conservative');
    const noData = plan(zoneNear, dir, { report: null });
    ok(tag + ': unknown does not mean unprotected; no invented nearest/protected classification', noData.rule === 'protection_unknown_conservative');
    const noStops = plan(zoneNear, dir, { zone: { bottom: 101, top: 99 }, currentSweep: { extreme: dir > 0 ? 102 : 98 }, report: null });
    ok(tag + ': if every candidate base is wrong-side, no stop is invented with an ATR buffer', noStops.state === 'invalid' && noStops.price === null);
    const tie = structuredClone(zoneNear); tie.report.levels[0].raw_price = dir > 0 ? 99.5 : 100.5;
    tie.report.levels[0].price = tie.report.levels[0].raw_price;
    ok(tag + ': exact fallback-distance tie chooses the zone, not an arbitrary old swing', plan(tie, dir).kind === 'order_block');
  } else for (const label of ['wrong-side', 'taken older', 'taken current', 'wrong TF', 'future', 'unknown', 'no valid', 'tie']) ok(tag + ': missing stop selector ' + label, false);
}
// Rounding must not turn an undefined tiny stop into an executable order.
if (Stops.plan && P.discover) {
  const f = F.ordinary(-1, { peak: 100.00001, current: true }, P);
  for (const b of f.b.slice(2)) Object.assign(b, { o: 99.98, h: 99.99, l: 99.5, c: 99.98 });
  f.report = P.discover(f.b, [f.sweep], { tf: '15m', observedAt: f.clock, poolBefore: () => f.pool });
  const r = Stops.plan({ dir: -1, entry: 100, atr: .00005, tf: '15m', report: f.report,
    observedAt: f.clock, currentSweep: f.sweep, currentIsCausal: true, zone: { top: 100.2, bottom: 99.8 } });
  ok('published zero-risk CURRENT stop refuses, rather than borrowing a farther zone/ATR', r.state === 'invalid' && r.price === null && r.rule === 'current_protected_invalid' && f.report.levels[0].status === 'intact');
} else ok('published zero-risk CURRENT stop cannot be checked by parent', false);
const unknown = structuredClone(F.ordinary(1, {}, P)); unknown.a.protected_levels = null;
const u = read(unknown, 1);
ok('ordinary unknown protection still respects existing trigger/session/risk rules, not a fake no-data success',
  u.c.levels.stop_policy?.rule === 'protection_unknown_conservative' && close(u.c.levels.stop, 96.82));
const bad = F.ordinary(1, { current: true }, P);
if (bad.a.protected_levels) bad.a.protected_levels.levels[0].status = 'taken';
const br = read(bad, 1);
ok('actual Setup propagates a known invalid protected stop to refusal and no risk plan',
  br.c.levels.stop_policy?.state === 'invalid' && !br.c.ok && br.c.levels.stop === null && br.c.risk === null
  && br.c.no_trade.some(x => /No defined valid stop/.test(x)));
console.log(`M75 STOPS: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
