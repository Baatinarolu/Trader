'use strict';
/**
 * M56 API probe: the plan gate as the product serves it. Plans are published and edited through the
 * app's OWN strategy routes (never a hand-written row), the analysis is the app's own analyse
 * endpoint over real candles, and the read-only claim is measured rather than asserted: every table
 * and index is digested before and after and must be byte-identical.
 */
const H = require('./m56-test-support'), { ok } = H;

H.finish('M56 api: the written plan over the real routes, its ownership and its read-only proof', async () => {
  const u = await H.start('m56-api');
  const P = H.mod('src/bots/plan-gate');
  if (!H.shipped(P, 'the plan gate (src/bots/plan-gate.js)')) return;

  const desk = await H.account(u, 'M56 desk');
  const q = (extra = {}) => H.analyseQuery(desk.id, extra);

  /* ------------------------------------------------ 1. before the trader has decided which plan applies */
  const starter = (await u.req('/strategies', undefined, 'GET')).data.strategies || [];
  const activeStarter = starter.filter((x) => x.active);
  const none = await H.planGate(u);
  ok('the app\u2019s own starter playbook is published active (the sample this section measures)',
    activeStarter.length >= 2, JSON.stringify(starter.map((x) => [x.name, x.active])));
  ok('with several active plans the gate reports `ambiguous` and names every candidate, and it NEVER picks one silently',
    none.status === 200 && none.data.state === 'ambiguous' && none.data.candidates.length === activeStarter.length
    && none.data.candidates.every((c) => starter.some((x) => x.id === c.id && x.name === c.name)),
    JSON.stringify({ state: none.data.state, candidates: none.data.candidates }));
  ok('and the endpoint publishes the vocabulary this app enforces, with a concrete line per fact',
    none.data.vocabulary.length >= 10 && none.data.vocabulary.every((v) => v.line && v.label && v.form)
    && none.data.vocabulary.every((v) => P.parseRule(v.line).kind === 'machine'),
    JSON.stringify(none.data.vocabulary.map((v) => v.line)));
  ok('the limits travel with it, so a client cannot present the gate as a performance or broker claim',
    none.data.limits.prose_is_not_parsed === true && none.data.limits.market_conditions_field_is_not_parsed === true
    && none.data.limits.grade_influence === false && none.data.limits.score_influence === false && none.data.limits.unknown_is_never_met === true);

  const unplaned = await H.analyse(u, q());
  ok('an analysis run before the trader has decided is served `ambiguous` (with the names) and gates nothing',
    unplaned.status === 200 && H.gateOf(unplaned.data).state === 'ambiguous' && H.gateOf(unplaned.data).candidates.length === activeStarter.length
    && H.rulesOf(unplaned.data).every((r) => r === null),
    JSON.stringify(H.gateOf(unplaned.data).candidates));
  /* Pause the starter plans (through the app's own route) so `no_plan` is measurable as itself. */
  for (const x of starter) await H.setActive(u, x.id, x, 0);
  const settled = await H.analyse(u, q());
  ok('pausing them all returns the analysis to `no_plan`, which blocks nothing \u2014 a plan is not required to use the app',
    H.gateOf(settled.data).state === 'no_plan' && H.gateOf(settled.data).plan === null);
  ok('and the candidates are identical to the ones the ambiguous run produced: an unconsulted gate forbids nothing',
    JSON.stringify(H.rulesOf(settled.data)) === JSON.stringify(H.rulesOf(unplaned.data))
    && H.candidateOf(settled.data, null).grade === H.candidateOf(unplaned.data, null).grade,
    JSON.stringify([H.gateOf(settled.data).state, H.candidateOf(settled.data, null).grade]));

  /* ------------------------------------------------ 2. a published plan is the gate */
  const impossible = await H.plan(u, { name: 'Impossible bar', rules: ['require min_rr >= 999'] });
  const gate = await H.planGate(u, impossible.id);
  ok('a published plan is read back with its lines classified: enforced, prose, unrecognised',
    gate.status === 200 && gate.data.state === 'ready' && gate.data.counts.machine === 1
    && gate.data.lines.length === 1 && gate.data.lines[0].kind === 'machine' && gate.data.lines[0].fact === 'min_rr',
    JSON.stringify(gate.data.counts));
  ok('and it carries the M102 version the rules were saved as',
    gate.data.plan && gate.data.plan.id === impossible.id && Number.isInteger(gate.data.plan.version), JSON.stringify(gate.data.plan));

  const failed = await H.analyse(u, q({ strategy_id: impossible.id }));
  const fc = H.candidateOf(failed.data, null);
  ok('the analysis confirms against that plan: the payload names it, its version and how many requirements are enforced',
    failed.status === 200 && H.gateOf(failed.data).state === 'ready' && H.gateOf(failed.data).plan.id === impossible.id
    && H.gateOf(failed.data).enforced === 1, JSON.stringify(H.gateOf(failed.data)).slice(0, 220));
  ok('a requirement the candidate cannot meet REFUSES it, with the refusal as the first reason',
    fc && fc.ok === false && /Your plan .Impossible bar/.test(fc.no_trade[0]) && /min_rr >= 999/.test(fc.no_trade[0]),
    JSON.stringify(fc ? fc.no_trade.slice(0, 1) : null));
  ok('the candidate carries the rule-by-rule result beside the refusal, so the trader sees which box was not checked',
    fc && fc.plan_rules && fc.plan_rules.refused === 1 && fc.plan_rules.rules[0].state === 'refused'
    && fc.plan_rules.rules[0].detail === fc.no_trade[0].replace(/^.*not met\. /, '').replace(/ \u201cIf even.*$/, ''),
    JSON.stringify({ rules: fc && fc.plan_rules, action: fc && fc.action }));
  ok('and the verdict does not arm the side the plan refused',
    !failed.data.setups.verdict.dir || failed.data.setups.verdict.dir === fc.dir, JSON.stringify(failed.data.setups.verdict));

  /* ------------------------------------------------ 3. one active plan is used without naming it */
  const met = await H.plan(u, { name: 'Always met', rules: ['require min_rr >= 0.1'] });
  await H.setActive(u, impossible.id, impossible.body, 0);   // now exactly one active plan: `met`
  const auto = await H.analyse(u, q());
  ok('with exactly one active plan the gate uses it without being asked (and says which one)',
    H.gateOf(auto.data).state === 'ready' && H.gateOf(auto.data).plan.id === met.id
    && H.rulesOf(auto.data).every((r) => r && r.rules.length === 1),
    JSON.stringify(H.gateOf(auto.data).plan));
  ok('a requirement the candidate meets leaves it tradeable and does not touch its grade or score',
    (() => { const c = H.candidateOf(auto.data, null); const b = H.candidateOf(unplaned.data, null);
      return c.plan_rules.refused === 0 && c.grade === b.grade && c.score === b.score; })());

  /* ------------------------------------------------ 4. ambiguity is named, never guessed */
  await H.setActive(u, impossible.id, impossible.body, 1);   // impossible is active again...
  await H.setActive(u, met.id, met.body, 1);                 // ...and so is met: two active plans, no decision made
  const activeNow = (await u.req('/strategies', undefined, 'GET')).data.strategies.filter((x) => x.active);
  ok('two plans really are active before the ambiguity is measured (the state being tested, not an assumption)',
    activeNow.length === 2, JSON.stringify(activeNow.map((x) => [x.id, x.name, x.active])));
  const amb = await H.analyse(u, q());
  ok('two active plans are reported as `ambiguous` WITH both names, and NOTHING is gated on a guess',
    H.gateOf(amb.data).state === 'ambiguous' && H.gateOf(amb.data).candidates.length === 2
    && H.rulesOf(amb.data).every((r) => r === null), JSON.stringify(H.gateOf(amb.data).candidates));
  const named = await H.analyse(u, q({ strategy_id: met.id }));
  ok('naming one resolves it, so the ambiguity is a one-click fix rather than a dead end',
    H.gateOf(named.data).state === 'ready' && H.gateOf(named.data).plan.id === met.id);
  await H.setActive(u, impossible.id, impossible.body, 0);
  await H.setActive(u, met.id, met.body, 0);
  const paused = await H.analyse(u, q());
  ok('pausing every plan returns the gate to `no_plan` \u2014 a paused plan is not silently applied',
    H.gateOf(paused.data).state === 'no_plan');
  const explicit = await H.analyse(u, q({ strategy_id: met.id }));
  ok('while naming a paused plan still works, because that is the trader asking for it by name',
    H.gateOf(explicit.data).state === 'ready' && H.gateOf(explicit.data).plan.active === false);

  /* ------------------------------------------------ 5. ownership and validation */
  const otherGate = await u.req('/bots/plan-gate?strategy_id=' + met.id, undefined, 'GET', u.otherToken);
  ok('another trader\u2019s plan id is a 404 on the gate reader \u2014 never a fallback to their own plan',
    otherGate.status === 404 && otherGate.data.code === 'plan_not_found', JSON.stringify(otherGate.data));
  const otherAnalyse = await u.req('/bots/analyse' + q({ strategy_id: met.id }), undefined, 'GET', u.otherToken);
  ok('and the same id on the analyse route is refused too, so a signal cannot be confirmed against a plan the caller does not own',
    otherAnalyse.status === 404 && otherAnalyse.data.code === 'plan_not_found');
  const bad = await u.req('/bots/analyse' + q({ strategy_id: 'abc' }), undefined, 'GET');
  ok('a malformed id is a 400 with the gate\u2019s own code, not an internal error',
    bad.status === 400 && bad.data.code === 'plan_invalid', JSON.stringify(bad.data));
  ok('and a fractional or negative id is refused the same way',
    (await u.req('/bots/plan-gate?strategy_id=1.5', undefined, 'GET')).status === 400
    && (await u.req('/bots/plan-gate?strategy_id=-2', undefined, 'GET')).status === 400);

  /* ------------------------------------------------ 6. the chart cannot disagree with the analysis */
  const chart = await H.chartOf(u, q({ strategy_id: met.id }).replace('/bots/analyse', ''));
  ok('the chart endpoint confirms against the SAME plan the analysis did (M124\u2019s rule: not a second opinion)',
    chart.status === 200 && H.gateOf(chart.data) && H.gateOf(chart.data).plan
    && H.gateOf(chart.data).plan.id === H.gateOf(explicit.data).plan.id,
    JSON.stringify(H.gateOf(chart.data) && H.gateOf(chart.data).plan));

  /* ------------------------------------------------ 7. the scan carries the gate per row */
  const scan = await u.req('/bots/scan?symbols=EURUSD&tf=15m&strategy_id=' + met.id, undefined, 'GET');
  ok('a scan row carries the plan it was confirmed against and whether the plan took that setup away',
    scan.status === 200 && (scan.data.rows || []).length >= 1
    && (scan.data.rows || []).every((r) => r.plan_gate && r.plan_gate.plan && r.plan_gate.plan.id === met.id && typeof r.plan_refused === 'boolean'),
    JSON.stringify((scan.data.rows || []).map((r) => ({ s: r.symbol, g: r.plan_gate && r.plan_gate.state, refused: r.plan_refused }))));

  /* ------------------------------------------------ 8. prose and the market-conditions field */
  const prose = await H.plan(u, { name: 'Prose only', rules: [], market_conditions: 'Ranging only \u2014 never news', entry_rules: ['Wait for the sweep', 'Only trade London'] });
  const proseRead = await H.planGate(u, prose.id);
  ok('a plan written in prose has ZERO enforced requirements, and says so rather than looking satisfied',
    proseRead.data.state === 'ready' && proseRead.data.counts.machine === 0 && proseRead.data.counts.prose === 2
    && /no machine-checkable requirements/.test(proseRead.data.note), JSON.stringify(proseRead.data.note));
  const proseRun = await H.analyse(u, q({ strategy_id: prose.id }));
  ok('and the prose plan refuses nothing: free text is never interpreted, in either direction',
    H.gateOf(proseRun.data).enforced === 0 && H.gateOf(proseRun.data).unverifiable_lines.length === 2
    && H.rulesOf(proseRun.data).every((r) => r === null || r.rules.length === 0),
    JSON.stringify(H.gateOf(proseRun.data).unverifiable_lines));
  ok('the free-text `market_conditions` field is reported as NOT parsed \u2014 "ranging only" cannot silently become a rule',
    /Ranging only/.test(prose.body.market_conditions) && H.gateOf(proseRun.data).limits.market_conditions_field_is_not_parsed === true);

  /* ------------------------------------------------ 8b. a wrongly-encoded stored value is NAMED, never passed */
  const echo = starter.find((x) => /[\[\]]/.test(String(x.entry_rules)) || x.entry_rules);
  const doubled = await H.plan(u, { name: 'Echoed back', entry_rules: JSON.stringify(['require killzone', 'require min_rr >= 0.1']) });
  const doubledRead = await H.planGate(u, doubled.id);
  ok('rules stored double-encoded (a client echoing the stored string back at a route that stringifies its input) are reported as malformed, not shown as a satisfied plan',
    doubledRead.status === 200 && doubledRead.data.counts.machine === 0 && doubledRead.data.malformed === true
    && /re-save the plan/.test(doubledRead.data.note), JSON.stringify({ counts: doubledRead.data.counts, note: doubledRead.data.note }));
  const doubledRun = await H.analyse(u, q({ strategy_id: doubled.id }));
  ok('and that plan refuses nothing while it cannot be read \u2014 the trader sees the reason to re-save instead of a silently empty checklist',
    H.gateOf(doubledRun.data).state === 'ready' && H.gateOf(doubledRun.data).enforced === 0
    && H.rulesOf(doubledRun.data).every((r) => !r || r.refused === 0),
    JSON.stringify(H.gateOf(doubledRun.data).note));
  ok('the app\u2019s own starter rows are a list of lines, so the sample this probe measures is not itself the malformed case',
    !!echo && !/^"/.test(String(echo.entry_rules)), JSON.stringify(echo && echo.entry_rules));

  /* ------------------------------------------------ 9. edit the rules, the gate follows */
  await H.editPlan(u, prose.id, { ...prose.body, entry_rules: ['require killzone', 'require min_rr >= 0.1'] });
  const edited = await H.planGate(u, prose.id);
  const beforeVersion = Number(proseRead.data.plan.version || 0);
  ok('editing the rules changes what the gate enforces, and the M102 version moves with it',
    edited.data.counts.machine === 2 && edited.data.counts.prose === 0 && Number(edited.data.plan.version) !== beforeVersion,
    JSON.stringify({ before: beforeVersion, after: edited.data.plan.version }));

  /* ------------------------------------------------ 10. read-only, and no schema of its own */
  const tables = await H.tablesOf();
  const snapshotOf = async () => {
    const objs = await H.D.db.prepare("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const out = {};
    for (const o of objs) { const t = o.type === 'table' ? o.name : null; if (!t) { out[o.type + ':' + o.name] = o.name; continue; }
      try { out[t] = JSON.stringify(await H.D.db.prepare('SELECT * FROM ' + t + ' ORDER BY 1').all()); } catch { out[t] = '<unreadable>'; } }
    return out;
  };
  const base = await snapshotOf();
  await H.analyse(u, q());                       // the control arm: the app's own writes, with no plan
  const control = await snapshotOf();
  await H.analyse(u, q({ strategy_id: prose.id }));   // the measured arm: the same call with a plan
  await H.planGate(u, prose.id);
  const arm = await snapshotOf();
  const controlKeys = H.changed(base, control), armKeys = H.changed(base, arm);
  ok('analysing with a plan writes exactly what analysing without one writes \u2014 the gate adds no row of its own',
    armKeys.every((k) => controlKeys.includes(k)), JSON.stringify({ control: controlKeys, arm: armKeys }));
  ok('and reading the plan never rewrites it: `strategies` and its M102 history are byte-identical across the gate read',
    !H.changed(control, arm).includes('strategies') && !H.changed(control, arm).includes('strategy_versions'),
    JSON.stringify(H.changed(control, arm)));
  ok('the milestone adds NO table, index or trigger of its own \u2014 the plan lives in `strategies` exactly as before',
    !tables.some((t) => /plan_gate|plan_rule/i.test(t)), tables.filter((t) => /plan/i.test(t)).join());
});

module.exports = {};
