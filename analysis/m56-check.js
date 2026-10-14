'use strict';
/* M56 smoke: the plan gate refuses a candidate that breaks the trader's own written rule, and
 * changes nothing when there is no plan. Synthetic candles; no network. */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc'));
const Setup = require(path.join(APP, 'src/bots/setup'));
const PlanGate = require(path.join(APP, 'src/bots/plan-gate'));
const Synth = require(path.join(__dirname, 'harness', 'synth'));
let pass = 0, fail = 0;
const ok = (l, c, d) => { if (c) { pass++; console.log(' ok   ' + l); } else { fail++; console.log(' FAIL ' + l + (d ? ' — ' + d : '')); } };
const ctx = (price, extra) => ({ price, balance: 10000, riskPct: 1, valuePerPoint: 100000, assetClass: 'forex', chaseGuard: false, ...extra });

let fixture = null;
for (let seed = 1; seed <= 6 && !fixture; seed++) {
  const cs = Synth.series({ seed, bars: 1500 });
  const hAll = Synth.aggregate(cs, 4);
  for (let i = 120; i < cs.length - 5; i += 7) {
    const win = cs.slice(Math.max(0, i - 300), i + 1);
    const h = hAll.filter((b) => b.t <= cs[i].t).slice(-80);
    const an = SMC.analyse(win, { tf: '15m', htfCandles: h.length > 30 ? h : null, now: cs[i].t });
    if (!an.ok) continue;
    const plain = Setup.buildSetups(an, ctx(cs[i].c));
    const armed = plain.candidates.find((c) => c.ok && c.levels && c.levels.rr_primary_exact > 0);
    if (armed) { fixture = { an, price: cs[i].c, armed }; break; }
  }
}
ok('a tradeable fixture candidate with computed levels exists', !!fixture, 'none found');
if (!fixture) { console.log(`M56 smoke: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
const { an, price, armed } = fixture;
console.log(` fixture: candidate dir=${armed.dir} grade=${armed.grade} rr=${armed.levels.rr_primary_exact} reward:risk`);

const plan = (rules) => ({ state: 'ready', plan: { id: 1, name: 'Fixture plan', version: 2 }, counts: PlanGate.parse({ entry_rules: JSON.stringify(rules) }).counts, rules: PlanGate.parse({ entry_rules: JSON.stringify(rules) }).rules });

// 1. no plan: nothing changes at all (byte-for-byte candidate comparison).
const base = Setup.buildSetups(an, ctx(price));
const none = Setup.buildSetups(an, ctx(price, { planGate: PlanGate.marked('no_plan', 'no plan') }));
ok('with no plan the engine is byte-identical to not consulting one', JSON.stringify(base.candidates) === JSON.stringify(none.candidates));
ok('and the filter block says no_plan rather than reporting an empty (perfect-looking) rule list',
  none.filters.plan_gate.state === 'no_plan' && none.filters.plan_gate.enforced === 0);
ok('a research path that hands no gate is not_consulted, which is not the same token as a failed read',
  base.filters.plan_gate.state === 'not_consulted');

// 2. a rule the candidate cannot meet refuses it, by name.
const impossible = plan(['require min_rr >= 999']);
const refused = Setup.buildSetups(an, ctx(price, { planGate: impossible }));
const rc = refused.candidates.find((c) => c.dir === armed.dir);
ok('a machine-checkable plan rule the candidate breaks turns ok=false', rc.ok === false, `ok=${rc.ok}`);
ok('the refusal is an ordinary no_trade entry naming the plan, its version and the rule',
  rc.no_trade.some((v) => /Fixture plan/.test(v) && /v2/.test(v) && /min_rr >= 999/.test(v)), JSON.stringify(rc.no_trade.slice(-1)));
ok('the action line leads with the refusal', /^No trade — /.test(rc.action), rc.action);
ok('the per-candidate block carries the rule and its resolved state',
  !!rc.plan_rules && rc.plan_rules.rules.some((r) => r.fact === 'min_rr' && r.state === 'refused'), JSON.stringify(rc.plan_rules));
ok('the plan-level filter reports the refusal on the candidate it belongs to',
  refused.filters.plan_gate.state === 'ready' && refused.filters.plan_gate.refused_now === true);

// 3. a rule it does meet changes nothing.
const satisfied = plan([`require min_rr >= ${Math.floor(armed.levels.rr_primary_exact)}`, 'require min_rr <= 1']);
const metPlan = plan([`require min_rr >= ${Math.max(0.1, armed.levels.rr_primary_exact - 0.5).toFixed(2)}`]);
const met = Setup.buildSetups(an, ctx(price, { planGate: metPlan }));
const mc = met.candidates.find((c) => c.dir === armed.dir);
ok('a rule the candidate meets leaves ok=true', mc.ok === true, JSON.stringify(mc.plan_rules));
ok('and the grade, score and levels are untouched by a satisfied plan',
  mc.grade === armed.grade && mc.score === armed.score && JSON.stringify(mc.levels) === JSON.stringify(armed.levels));
ok('a plan with no machine-checkable line gates nothing (prose is reported, never enforced)',
  Setup.buildSetups(an, ctx(price, { planGate: plan(['Wait for the sweep', 'Only trade London']) })).candidates.every((c) => c.no_trade.length === base.candidates.find((b) => b.dir === c.dir).no_trade.length));

// 4. an unrecognised `require` line is LOUD, not silently green.
const typo = plan(['require swep']);
const typoRun = Setup.buildSetups(an, ctx(price, { planGate: typo }));
ok('a `require` line outside the vocabulary is reported as unrecognised rather than passing quietly',
  typoRun.filters.plan_gate.unrecognised_lines.length === 1 && /not a requirement this app can check/.test(typoRun.filters.plan_gate.unrecognised_lines[0].reason));
ok('and it refuses nothing, because refusing on a typo would make the app unusable',
  typoRun.candidates.every((c) => c.ok === base.candidates.find((b) => b.dir === c.dir).ok));

// 5. unknown is never met: the M8 short-series sentinel leaves the killzone unreadable, and the
// M111 unknown news state leaves the blackout unreadable. Neither may become a refusal, and neither
// may become a silent pass.
const blindPlan = (rules) => ({ state: 'ready', plan: { id: 9, name: 'Blind plan' },
  counts: PlanGate.parse({ entry_rules: JSON.stringify(rules) }).counts,
  rules: PlanGate.parse({ entry_rules: JSON.stringify(rules) }).rules });
const sentinel = Setup.buildSetups({ ...an, sessions: {} }, ctx(price, { planGate: blindPlan(['require killzone', 'require session london']) }));
ok('an unreadable killzone is reported unknown per rule and refuses nothing',
  sentinel.candidates.every((c) => c.plan_rules && c.plan_rules.refused === 0)
  && sentinel.candidates.some((c) => c.plan_rules.rules.filter((r) => r.state === 'unknown').length === 2),
  JSON.stringify(sentinel.candidates.map((c) => c.plan_rules && c.plan_rules.rules.map((r) => r.state))));
ok('and the plan-level block reports that unknown explicitly rather than only the refusals',
  sentinel.filters.plan_gate.unknown_now === true && sentinel.filters.plan_gate.refused_now === false);
const noNews = Setup.buildSetups(an, ctx(price, { newsState: 'unknown', newsBlackout: 'News blackout: CPI', planGate: blindPlan(['require no_news_blackout']) }));
ok('an unreadable news calendar cannot satisfy a no-news requirement (and cannot fail it either)',
  noNews.candidates.every((c) => c.plan_rules.rules.every((r) => r.state === 'unknown')),
  JSON.stringify(noNews.candidates.map((c) => c.plan_rules.rules.map((r) => r.state))));

console.log(`\nM56 smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
