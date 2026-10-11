#!/usr/bin/env node
'use strict';
/** M77 source/entry timeframe composition. Explicit facts, NOT market edge.
 * TJ_APP controls implementation; the same fixtures/assertions run on M54/parent. */
const path = require('path'), fs = require('fs');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const SU = require(path.join(APP, 'src/bots/setup')), TD = require(path.join(APP, 'src/bots/topdown')),
  SMC = require(path.join(APP, 'src/bots/smc')), Now = require(path.join(APP, 'src/bots/now')),
  Mom = require(path.join(APP, 'src/bots/momentum'));
const targetPath = path.join(APP, 'src/bots/targets.js');
const T = fs.existsSync(targetPath) ? require(targetPath) : {};
const F = require('./helpers/target-timeframe-fixture');
let pass = 0, fail = 0;
const ok = (name, c, d = '') => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${name}${!c && d ? ' — ' + d : ''}`); c ? pass++ : fail++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
function read(a, sources = [], ctx = {}) {
  const setups = SU.buildSetups(a, { price: a.price, atr: 1, bias: 1, balance: 10000,
    riskPct: 1, valuePerPoint: 1, targetSources: sources, ...ctx });
  return setups.candidates.find((c) => c.dir === 1);
}
const ladder = { '1m': '5m', '3m': '5m', '5m': '15m', '15m': '1h', '30m': '1h',
  '1h': '4h', '4h': '1d', '1d': '1w', '1w': null };
for (const [tf, next] of Object.entries(ladder)) {
  const policy = T.timeframePolicy ? T.timeframePolicy(tf) : {};
  ok(tf + ': explicit same/one-above mapping (not the bias stack)',
    policy.rule === 'entry_or_one_above' && policy.entry_tf === tf
    && JSON.stringify(policy.allowed_tfs) === JSON.stringify([tf, next].filter(Boolean)));
  const c = read(F.ordinary(tf), next ? [F.opposing(next, 103), F.opposing('bogus', 100.1)] : []);
  ok(tf + ': actual final target has a permitted, honestly labelled source TF',
    c.levels?.target_policy?.rule === 'entry_or_one_above'
    && [tf, next].filter(Boolean).includes(c.levels.target_tf)
    && c.levels.targets[0]?.source_tf === c.levels.target_tf);
  ok(tf + ': entry and stop provenance are actual geometry, not narrative TF',
    c.levels?.entry_tf === tf && c.levels.stop_tf === tf && new RegExp(tf + ' close').test(c.levels.invalidation));
}

const a = F.ordinary('1m'), candidates = [F.opposing('1h', 100.1), F.opposing('5m', 103)];
const c = read(a, candidates);
ok('1m scalp targets next 5m supply, never the closer 1h zone',
  c.ok && c.levels.targets.length === 1 && c.levels.targets[0].price === 103 && c.levels.target_tf === '5m');
ok('known out-of-band source is explicitly recorded as rejected',
  c.levels.target_policy?.rejected_sources.some((r) => r.source_tf === '1h' && r.reason === 'outside_entry_target_band'));
ok('rejected higher zones never leak into the audited target candidate catalogue',
  !c.levels.target_candidates?.some((t) => t.source_tf === '1h'));
ok('PDH timebox does not falsely relabel its actual 1m observation TF as 1d',
  c.levels.target_candidates?.some((t) => t.kind === 'PDH' && t.source_tf === '1m' && t.period_tf === '1d'));
const spoof = F.opposing('1h', 100.1); spoof.tf = '1m';
const sp = read(a, [spoof]);
ok('a wrapper cannot relabel real 1h analysis as 1m',
  sp.levels.target_policy?.rejected_sources.some((r) => r.reason === 'source_tf_mismatch')
  && !sp.levels.target_candidates?.some((t) => t.price === 100.1));
const unknown = F.opposing('5m', 100.1); delete unknown.analysis.tf;
const uk = read(a, [unknown]);
ok('missing source provenance remains UNKNOWN, not guessed from wrapper/entry TF',
  uk.levels.target_policy?.rejected_sources.some((r) => r.reason === 'unknown_source_tf')
  && !uk.levels.target_candidates?.some((t) => t.price === 100.1));
for (const tf of [null, '2h', '1M', 'unknown']) {
  const u = read({ ...F.ordinary('1m'), tf }, [F.opposing('1h', 103)]);
  ok(String(tf) + ': unsupported/missing entry TF cannot acquire a guessed target band',
    u.levels.target_policy?.state === 'unknown' && u.levels.targets.length === 0 && !u.ok);
}
const nearer = read(a, [F.opposing('5m', 100.4), F.opposing('1h', 110)]);
ok('eligible near 5m magnet below 0.9R refuses; 1h/weak/farther RR rescue is impossible',
  nearer.levels.targets[0]?.price === 100.4 && nearer.levels.rr_final < .9 && !nearer.ok
  && !nearer.checks.find((x) => x.key === 'runway').pass);
const border = read(a, [F.opposing('5m', 100 + .88 * 1.999)]);
ok('display-rounded 2.00R cannot rescue a true sub-2R nearest target',
  border.levels.rr_final === 2 && border.levels.rr_final_exact < 2 && !border.ok
  && !border.checks.find((x) => x.key === 'runway').pass
  && border.no_trade.some((r) => /unrounded geometry/.test(r)));
const empty = clone(a); empty.structure = { trend: 'ranging' }; empty.liquidity.pools = []; empty.premium_discount = null;
const em = read(empty, [F.opposing('1h', 103)]);
ok('only out-of-band targets => no target/no trade, no measured move fallback',
  em.levels.targets.length === 0 && !em.ok && em.no_trade.some((r) => /No real opposing target/.test(r)));
ok('empty ordinary band names the legal target TFs, not a generic missing magnet',
  /entry timeframe or one level above/.test(em.checks.find((x) => x.key === 'runway').detail)
  && /entry timeframe or one level above/.test(em.no_trade.join(' ')));
const bytes = JSON.stringify(candidates); read(a, candidates);
ok('timeframe filtering does not mutate original physical catalogues', JSON.stringify(candidates) === bytes);
const legacy = read(a, candidates, { targetAlignment: false });
ok('explicit pre-M77 research arm preserves frozen M54 single-source geometry',
  legacy.levels.target_policy?.rule === 'pre_m77_research' && legacy.levels.targets[0]?.price === 108);

for (const dir of [-1, 1]) for (const model of ['market_shift', 'flip']) {
  const f = F.named(dir, model), opts = { useBreakers: model === 'flip' };
  for (const s of [f.input.series, f.input.biasSeries, f.input.triggerSeries]) s.smc.sessions = SMC.sessionState(new Date(f.END));
  const base = TD.build({ ...f.input, opts });
  const scoped = SU.buildSetups(f.input.series.smc, { price: f.input.series.price, topdown: base,
    atr: 1, bias: f.htfDir, balance: 10000, riskPct: .5, valuePerPoint: 1, ...opts });
  const ct = scoped.candidates.find((x) => x.dir === dir), tag = `${dir} ${model}`;
  ok(tag + ': TD supplies distinct actual 5m/15m/4h target catalogues',
    base.target_sources?.some((s) => s.tf === '5m' && s.analysis.tf === '5m')
    && base.target_sources?.some((s) => s.tf === '15m') && base.target_sources?.some((s) => s.tf === '4h'));
  ok(tag + ': M33 alone retains ONE prescribed 4h opposing-zone exception, despite a nearer 5m magnet',
    ct.ok && ct.levels.targets.length === 1 && ct.levels.targets[0].price === f.target
    && ct.levels.target_tf === '4h' && ct.levels.target_policy?.exception === 'm33_internal_pullback');
  ok(tag + ': exception does not reset narrative or remove half ordinary risk',
    Mom.alignment(f.input.biasSeries, f.input.series, f.input.triggerSeries, base).bias === f.htfDir && ct.risk.method_risk_multiplier === .5
    && ct.risk.risk_pct === ct.risk.risk_pct_ordinary * .5);
  const missingTarget = clone(base); delete missingTarget.countertrend.target;
  let refusedTarget, targetError;
  try { refusedTarget = SU.buildSetups(f.input.series.smc, { price: f.input.series.price,
    atr: 1, bias: f.htfDir, topdown: missingTarget, balance: 10000, riskPct: .5, ...opts })
    .candidates.find((x) => x.dir === dir); } catch (e) { targetError = e.message; }
  ok(tag + ': missing M33 prescribed target stays unknown/refused, never crashes or falls back',
    !targetError && refusedTarget && !refusedTarget.ok && refusedTarget.levels.targets.length === 0
    && refusedTarget.levels.target_policy.state === 'unknown', targetError || '');
  const ordinary = F.asOrdinaryCRT(base, f);
  const crt = Mom.crtView({ ...ordinary, layers: { ...ordinary.layers,
    bias: { ...ordinary.layers.bias, range: { low: 91, high: 109, mid: 100 },
      plan: ordinary.crt_plan } } }, '15m');
  ok(tag + ': actual Momentum CRT adapter marks projected HTF prices as non-executable',
    crt?.setup?.projection_only === true && crt.setup.execution_authority === 'setup_candidate'
    && /HTF projection only/.test(crt.setup.target_label) && /not an executable exit/.test(crt.setup.note));
  const build = (extra = {}) => SU.buildSetups(f.input.series.smc, { price: f.input.series.price, atr: 1,
    bias: f.htfDir, topdown: ordinary, balance: 10000, riskPct: .5, valuePerPoint: 1, ...opts, ...extra });
  const r = build(), current = r.candidates.find((x) => x.dir === dir), lv = current.levels;
  const nr = Now.build({ td: ordinary, setups: r, series: f.input.series, symbol: 'TEST', tf: '15m', nowMs: f.END });
  ok(tag + ': ordinary named CRT exits at the genuine 5m opposing zone, not its 4h projection',
    current.ok && lv.targets.length === 1 && lv.target_tf === '5m'
    && lv.targets[0].kind === 'opposing_order_block' && lv.targets[0].price === (dir < 0 ? 94.8 : 105.2));
  ok(tag + ': actual 5m entry/stop and named identity survive the target-only revision',
    current.entry_model === model && lv.entry_tf === '5m' && lv.stop_tf === '5m'
    && lv.entry === ct.levels.entry && lv.stop === ct.levels.stop);
  ok(tag + ': ordinary rule has NO inherited exception and rejects original bias TF',
    lv.target_policy?.rule === 'entry_or_one_above' && lv.target_policy.exception === null
    && !lv.target_candidates.some((t) => t.source_tf === '4h'));
  ok(tag + ': Now is exactly the eligible candidate and records target TF/kind',
    nr.armed && nr.order?.entry === lv.entry && nr.order.stop === lv.stop
    && nr.order.target === lv.targets[0].price && nr.order.target_tf === lv.target_tf
    && nr.order.target_kind === lv.targets[0].kind);
  const old = build({ targetAlignment: false }).candidates.find((x) => x.dir === dir);
  ok(tag + ': isolated M54 arm keeps old CRT target but cannot change entry/stop composition',
    old.levels.targets[0].price === ordinary.crt_plan.aggressive.target
    && old.levels.entry === lv.entry && old.levels.stop === lv.stop);
  const legalPlan = clone(ordinary); legalPlan.crt_plan.tf = '15m'; legalPlan.layers.bias.tf = '15m';
  legalPlan.crt_plan.aggressive.target = dir < 0 ? 93 : 107;
  const legal = SU.buildSetups(f.input.series.smc, { price: f.input.series.price, bias: f.htfDir,
    topdown: legalPlan, balance: 10000, riskPct: .5, ...opts }).candidates.find((x) => x.dir === dir);
  ok(tag + ': even a legally sourced CRT edge cannot override a nearer qualified magnet',
    legal.levels.targets[0].price === lv.targets[0].price && legal.levels.target_candidates.some((t) => t.kind === 'crt_range'));
}
console.log(`\nM77 PROBE: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
