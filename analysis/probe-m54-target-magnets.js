#!/usr/bin/env node
'use strict';
/** M54 explicit structural-input fixtures. Not market performance evidence.
 * TJ_APP runs the same assertions against a frozen pre-M54 control.
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted/tradejournal');
const Setup = require(path.join(APP, 'src/bots/setup'));
let pass = 0, fail = 0;
const ok = (name, c, detail = '') => {
  console.log(` ${c ? 'ok  ' : 'FAIL'} ${name}${!c && detail ? ' — ' + detail : ''}`);
  c ? pass++ : fail++;
};
const clone = (x) => JSON.parse(JSON.stringify(x));
function fixture(dir = 1) {
  const a = { ok: true, tf: '15m', price: 100, atr: 1,
    structure: { trend: 'bullish', last_break: { dir: 'up', type: 'BOS', bars_ago: 10 },
      last_swing_high: { price: 110, label: 'HH', t: 10 }, last_swing_low: { price: 99, label: 'HL', t: 20 } },
    sweeps: [{ dir: 1, extreme: 99.3, bars_ago: 2, wick_atr: 1, label: 'swept sellside' }],
    displacement: [{ dir: 1, bars_ago: 1, rangeAtr: 2, bodyRatio: .8 }],
    sessions: { in_killzone: true, quality: 1 },
    order_blocks: [
      { dir: 1, kind: 'OB', bottom: 99.5, top: 100.5, mid: 100, breached: false,
        mitigated: true, tests: 1, fresh: false, strength: 1.2, distance_atr: 0, bars_ago: 5 },
      { dir: -1, kind: 'OB', bottom: 103, top: 104, mid: 103.5, breached: false,
        mitigated: false, tests: 0, fresh: true, strength: .8, distance_atr: 3, t: 30 },
    ],
    fvgs: [{ dir: -1, bottom: 105, top: 106, filled: false, fill_pct: 0, strength: .6, t: 40 }],
    liquidity: { pools: [{ price: 108, kind: 'PDH', label: 'Previous day high', strength: .9, swept: false, t: 50 }] },
    premium_discount: { range_high: 112, range_low: 98, position: .143, location: 'discount', eq_band: [.45, .55] },
  };
  if (dir < 0) {
    const px = (p) => 200 - p;
    a.structure.trend = 'bearish'; a.structure.last_break.dir = 'down';
    a.structure.last_swing_low = { price: 90, label: 'LL', t: 10 };
    a.structure.last_swing_high = { price: 101, label: 'LH', t: 20 };
    for (const z of a.order_blocks) {
      [z.bottom, z.top] = [px(z.top), px(z.bottom)]; z.mid = px(z.mid); z.dir *= -1;
    }
    for (const g of a.fvgs) { [g.bottom, g.top] = [px(g.top), px(g.bottom)]; g.dir *= -1; }
    a.liquidity.pools[0] = { ...a.liquidity.pools[0], price: 92, kind: 'PDL', label: 'Previous day low' };
    a.premium_discount = { range_high: 102, range_low: 88, position: .857, location: 'premium', eq_band: [.45, .55] };
    a.sweeps[0].dir = -1; a.sweeps[0].extreme = 100.7; a.displacement[0].dir = -1;
  }
  return a;
}
function read(a, dir = 1, ctx = {}) {
  const result = Setup.buildSetups(a, { price: 100, bias: dir, atr: 1, balance: 10000,
    riskPct: 1, assetClass: 'stocks', valuePerPoint: 1, ...ctx });
  return { result, c: result.candidates.find((c) => c.dir === dir) };
}

for (const dir of [1, -1]) {
  const tag = dir > 0 ? 'long' : 'short', a = fixture(dir);
  const rows = Setup.targetPools(a, dir, 100);
  const kinds = rows.map((p) => p.kind);
  ok(tag + ': three distinct magnets plus weak/structural candidates are present',
    kinds.includes(dir > 0 ? 'PDH' : 'PDL') && kinds.includes('opposing_order_block')
    && kinds.includes('unfilled_fvg') && kinds.includes('weak_structure') && kinds.includes('range'), kinds.join(','));
  ok(tag + ': the next opposing OB uses its near edge',
    rows[0] && rows[0].kind === 'opposing_order_block' && rows[0].price === (dir > 0 ? 103 : 97));
  ok(tag + ': provenance says actual observed catalogue TF; PD period is separate',
    rows.every((p) => p.source_tf === '15m') && rows.find((p) => /^PD/.test(p.kind))?.period_tf === '1d');
  ok(tag + ': all targets are in the profit direction and sorted by distance',
    rows.every((p, i) => dir * (p.price - 100) > 0 && (!i || dir * (p.price - rows[i - 1].price) >= 0)));
  const r = read(a, dir), lv = r.c.levels;
  ok(tag + ': actual Setup emits ONE nearest magnet, not a farther weak extreme',
    lv.targets.length === 1 && lv.targets[0].kind === 'opposing_order_block' && lv.targets[0].price === (dir > 0 ? 103 : 97));
  ok(tag + ': complete candidate catalogue remains available for audit',
    lv.target_candidates?.some((p) => p.kind === 'weak_structure') && lv.target_candidates?.some((p) => p.kind === 'unfilled_fvg'));
  ok(tag + ': single target management/checklist does not advertise fictitious partials',
    lv.management.partial_at === null && lv.management.break_even_after === null
    && !/Take 50%/.test(r.c.checks.find((c) => c.key === 'management')?.detail || ''));
  ok(tag + ': actionable verdict also says one target, never a fictitious partial/runner',
    r.result.verdict.action === (dir > 0 ? 'BUY' : 'SELL')
    && /one target/.test(r.result.verdict.headline) && !/partial|runner/.test(r.result.verdict.headline));
  const legacy = read(a, dir, { targetMagnets: false });
  ok(tag + ': explicit old-composition arm still puts weak structure first', legacy.c.levels.targets[0].kind === 'weak_structure');
  ok(tag + ': target composition does not move entry/stop or the sizing policy',
    lv.entry === legacy.c.levels.entry && lv.stop === legacy.c.levels.stop
    && r.c.risk.grade_risk_multiplier === legacy.c.risk.grade_risk_multiplier
    && r.c.risk.range_risk_multiplier === legacy.c.risk.range_risk_multiplier);

  const close = clone(a);
  const z = close.order_blocks[1];
  [z.bottom, z.top] = dir > 0 ? [100.4, 100.6] : [99.4, 99.6]; z.mid = 100 + dir * .5;
  const cr = read(close, dir);
  ok(tag + ': a real <0.9R wall is NOT dropped for a farther 2R+ target',
    cr.c.levels.targets[0]?.price === 100 + dir * .4 && cr.c.levels.rr_primary < .9 && !cr.c.ok);
  ok(tag + ': runway check uses the SAME refused target as the final veto',
    !cr.c.checks.find((x) => x.key === 'runway').pass && cr.c.no_trade.some((v) => /floor/.test(v)));

  const fg = clone(a); fg.order_blocks = [fg.order_blocks[0]];
  fg.fvgs[0].fill_pct = 50;
  const fr = read(fg, dir);
  ok(tag + ': partially filled gap targets the remaining unfilled edge',
    fr.c.levels.targets[0]?.kind === 'unfilled_fvg' && fr.c.levels.targets[0].price === (dir > 0 ? 105.5 : 94.5));
  ok(tag + ': FVG target preserves remaining/original gap bounds and lifecycle',
    fr.c.levels.targets[0]?.fill_pct === 50 && fr.c.levels.targets[0].status === 'partially_unfilled'
    && fr.c.levels.targets[0].original_zone?.length === 2);

  const empty = clone(a); empty.order_blocks = [empty.order_blocks[0]]; empty.fvgs = [];
  empty.liquidity.pools = []; empty.structure = { trend: 'ranging' }; empty.premium_discount = null;
  const er = read(empty, dir, { minRR: 1 });
  ok(tag + ': no real magnet => no measured-move fallback, even at a lowered research RR floor',
    er.c.levels.targets.length === 0 && er.c.levels.primary_target === null && !er.c.ok);
  ok(tag + ': missing-target management/veto is explicit and does not crash',
    er.c.no_trade.some((v) => /No real opposing target/.test(v)) && /No real target/.test(er.c.checks.find((x) => x.key === 'management').detail));

  const nearRange = clone(empty);
  nearRange.premium_discount = { range_high: dir > 0 ? 100.5 : 105, range_low: dir > 0 ? 95 : 99.5 };
  const nr = read(nearRange, dir);
  ok(tag + ': near structural range is retained below 1R; not silently ignored',
    nr.c.levels.targets[0]?.kind === 'range' && nr.c.levels.targets[0]?.price === 100 + dir * .5 && !nr.c.ok);
  const wrongRange = clone(empty);
  wrongRange.premium_discount = { range_high: dir > 0 ? 99 : 105, range_low: dir > 0 ? 95 : 101 };
  ok(tag + ': a wrong-side range never becomes a reward via Math.abs', read(wrongRange, dir).c.levels.targets.length === 0);
}

const rejects = [
  ['mitigated OB', (a) => { a.order_blocks[1].mitigated = true; }],
  ['breached OB', (a) => { a.order_blocks[1].breached = true; }],
  ['unknown OB mitigation', (a) => { delete a.order_blocks[1].mitigated; }],
  ['unknown OB breach', (a) => { delete a.order_blocks[1].breached; }],
  ['same-direction OB', (a) => { a.order_blocks[1].dir = 1; }],
  ['invalid OB bounds', (a) => { a.order_blocks[1].top = a.order_blocks[1].bottom; }],
  ['NaN OB boundary', (a) => { a.order_blocks[1].bottom = 'NaN'; }],
  ['behind-entry OB', (a) => { a.order_blocks[1].bottom = 98; a.order_blocks[1].top = 99; }],
  ['filled FVG', (a) => { a.fvgs[0].filled = true; }],
  ['100% filled FVG despite inconsistent false flag', (a) => { a.fvgs[0].fill_pct = 100; }],
  ['unknown FVG fill', (a) => { delete a.fvgs[0].filled; }],
  ['unknown FVG remaining boundary', (a) => { delete a.fvgs[0].fill_pct; }],
  ['same-direction FVG', (a) => { a.fvgs[0].dir = 1; }],
  ['invalid FVG bounds', (a) => { a.fvgs[0].top = 104; }],
  ['behind-entry FVG', (a) => { a.fvgs[0].bottom = 98; a.fvgs[0].top = 99; }],
  ['swept liquidity', (a) => { a.liquidity.pools[0].swept = true; }],
];
for (const [label, mutate] of rejects) {
  const a = fixture(); mutate(a);
  const rows = Setup.targetPools(a, 1, 100);
  const kind = /OB/.test(label) ? 'opposing_order_block' : /FVG/.test(label) ? 'unfilled_fvg' : 'PDH';
  ok(label + ' is not a genuine available magnet', !rows.some((p) => p.kind === kind));
}
ok('short-series sentinel has no invented targets and no throw', Setup.targetPools({ ok: false, tf: '15m' }, 1, 100).length === 0);
const source = fixture(), before = JSON.stringify(source); Setup.targetPools(source, 1, 100); read(source);
ok('catalogue/Setup do not mutate detector lifecycle or pool provenance', JSON.stringify(source) === before);
console.log(`\nM54 PROBE: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
