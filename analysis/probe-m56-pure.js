'use strict';
/**
 * M56 pure probe: the plan gate's vocabulary, its parse and its evaluation — the rules, with no
 * database, no HTTP and no market. What is measured here is the part a trader's own plan depends on:
 * that every documented line is enforceble, that prose and unrecognised `require` lines are reported
 * rather than passed, that the operators cannot be inverted, that an unreadable fact is `unknown`
 * (never `met` and never `refused`), and that nothing about a grade, score or amount is influenced.
 */
const H = require('./m56-test-support'), { ok } = H;

H.finish('M56 pure: the plan gate\u2019s vocabulary, parse and evaluation', async () => {
  const P = H.mod('src/bots/plan-gate');
  if (!H.shipped(P, 'the plan gate (src/bots/plan-gate.js)')) return;

  /* ------------------------------------------------------------------ 1. the vocabulary */
  const vocab = P.vocabulary();
  ok('the vocabulary is a closed list of named facts, each with a documented line', vocab.length >= 10
    && vocab.every((v) => v.fact && v.line && v.label && ['boolean', 'enum', 'compare'].includes(v.form)), JSON.stringify(vocab.map((v) => v.line)));
  ok('every documented line parses as a MACHINE rule \u2014 the documentation cannot drift from the engine',
    vocab.every((v) => P.parseRule(v.line).kind === 'machine'), JSON.stringify(vocab.filter((v) => P.parseRule(v.line).kind !== 'machine').map((v) => v.line)));
  ok('and each fact appears exactly once', new Set(vocab.map((v) => v.fact)).size === vocab.length);
  ok('the compare facts document their own operator, so a trader never has to guess the direction',
    vocab.filter((v) => v.form === 'compare').every((v) => /(>=|<=)/.test(v.line))
    && vocab.filter((v) => v.form === 'compare').every((v) => v.op === (v.line.match(/(>=|<=)/) || [])[1]), JSON.stringify(vocab.filter((v) => v.form === 'compare').map((v) => [v.line, v.op])));
  ok('a fact with a closed value set publishes that set, so a client can render the choices',
    vocab.filter((v) => v.values).every((v) => v.values.length >= 3));

  /* ------------------------------------------------------------------ 2. what is NOT a rule */
  const p1 = P.parseRule('Wait for the sweep then look for the shift');
  ok('a line that does not start with `require` is prose \u2014 context for the human, never a rule for the engine',
    p1.kind === 'prose' && !!p1.reason, JSON.stringify(p1));
  const p2 = P.parseRule('require swep');
  ok('a `require` line naming a fact the vocabulary does not know is reported as unrecognised, NOT passed as satisfied',
    p2.kind === 'unknown_fact' && /not a requirement this app can check/.test(p2.reason), JSON.stringify(p2));
  ok('an empty line is prose rather than an empty rule', P.parseRule('   ').kind === 'prose' && P.parseRule('   ').text === '');

  /* ------------------------------------------------------- 3. operators cannot be inverted */
  ok('a floor cannot be written as a ceiling: `require min_rr <= 2` is unrecognised, not a rule',
    P.parseRule('require min_rr <= 2').kind === 'unknown_fact', JSON.stringify(P.parseRule('require min_rr <= 2')));
  ok('and a ceiling cannot be written as a floor: `require risk >= 1` is unrecognised',
    P.parseRule('require risk >= 1').kind === 'unknown_fact');
  ok('a boolean fact takes no operator or value', P.parseRule('require killzone >= 1').kind === 'unknown_fact');
  ok('an enum fact must be one of its own values (a misspelling is not a silent pass)',
    P.parseRule('require session tokyo').kind === 'unknown_fact' && P.parseRule('require session london').kind === 'machine');
  ok('a compare fact must have a positive number', ['require min_rr >= 0', 'require min_rr >= abc', 'require min_rr >='].every((l) => P.parseRule(l).kind === 'unknown_fact'));

  /* ----------------------------------------------------------------- 4. the comparison itself */
  const f = (fact, v, detail) => { const o = {}; o[fact] = P.read(v, detail); return P.facts(o); };
  const run = (line, fact, value, detail) => P.evaluate({ rules: [P.parseRule(line)], counts: { machine: 1, prose: 0, unknown_fact: 0 } }, f(fact, value, detail), 1);
  ok('`min_rr >= 2` is met at the boundary (2.0R) and refused just below it',
    run('require min_rr >= 2', 'min_rr', 2).refused === 0 && run('require min_rr >= 2', 'min_rr', 1.999).refused === 1);
  ok('`risk <= 1` is met at the boundary (1%) and refused above it',
    run('require risk <= 1', 'risk', 1).refused === 0 && run('require risk <= 1', 'risk', 1.01).refused === 1);
  ok('the grade ladder is ordered A+ > A > B > C > D, so `>= B` is met by A+ and refused by C',
    run('require grade >= B', 'grade', 'A+').refused === 0 && run('require grade >= B', 'grade', 'B').refused === 0
    && run('require grade >= B', 'grade', 'C').refused === 1);
  ok('a stood-down setup cannot satisfy a plan that asked for a tradeable grade',
    run('require grade >= C', 'grade', 'no-trade').refused === 1, JSON.stringify(run('require grade >= C', 'grade', 'no-trade').results));
  ok('an enum comparison is case-insensitive on both sides',
    P.parseRule('require session LONDON').value === 'london' && P.parseRule('require GRADE >= a+').value === 'A+'
    && run('require trend BULLISH', 'trend', 'bullish').refused === 0);
  ok('a boolean fact is refused only when it is known false',
    run('require killzone', 'killzone', false).refused === 1 && run('require killzone', 'killzone', true).refused === 0);

  /* ------------------------------------------------------------ 5. unknown is never a pass */
  const allUnknown = P.facts({});
  ok('a fact the caller did not hand over is UNKNOWN \u2014 never `met`',
    Object.keys(allUnknown).length === vocab.length && Object.values(allUnknown).every((r) => r.state === 'unknown'), JSON.stringify(allUnknown.min_rr));
  ok('and every read that could not be made is unknown: undefined, null and NaN alike',
    [undefined, null, NaN].every((v) => P.read(v).state === 'unknown'));
  const blindRules = vocab.map((v) => P.parseRule(v.line));
  ok('every documented line is a machine rule, so the sweep below covers the whole vocabulary',
    blindRules.every((r) => r.kind === 'machine') && blindRules.length === vocab.length);
  const blind = P.evaluate({ rules: blindRules, counts: { machine: vocab.length, prose: 0, unknown_fact: 0 } }, allUnknown, 1);
  ok('with nothing readable, every rule is unknown and NOT ONE veto is fabricated',
    blind.refused === 0 && blind.unknown === vocab.length && blind.vetoes.length === 0, JSON.stringify({ refused: blind.refused, unknown: blind.unknown }));
  ok('and an unknown rule carries no sentence either (a refusal must always be a measured false)',
    blind.results.every((r) => r.state === 'unknown' && r.detail === null));

  /* ------------------------------------------------------------- 6. the refusal sentence */
  const parsed = { rules: [P.parseRule('require min_rr >= 2')], counts: { machine: 1, prose: 0, unknown_fact: 0 },
    plan: { id: 7, name: 'London reversal', version: 4 } };
  const e = P.evaluate(parsed, f('min_rr', 1.5, 'The first target is 1.50R against a 1.00R stop.'), 1);
  const s = e.vetoes[0];
  ok('a refusal names the trader\u2019s own plan, its version and its own rule text',
    /London reversal/.test(s) && /v4/.test(s) && /min_rr >= 2/.test(s), s);
  ok('it states the fact that failed, and quotes the episode\u2019s own non-negotiable',
    /first-target risk:reward/.test(s) && /1\.50R/.test(s) && /if even just one of these boxes are not being checked/i.test(s), s);
  ok('and it is exactly one sentence per refused rule, in the plan\u2019s own order',
    P.evaluate({ ...parsed, rules: [P.parseRule('require min_rr >= 2'), P.parseRule('require killzone')] }, P.facts({ min_rr: P.read(1), killzone: P.read(false) }), 1).vetoes.length === 2);

  /* ------------------------------------------------------------------- 7. the payload view */
  const absent = P.view(undefined, []);
  ok('a path with no trader is `not_consulted`, which is a different token from a plan that failed to read',
    absent.state === 'not_consulted' && absent.enforced === 0);
  ok('no plan is `no_plan` and blocks nothing, with the reason in the note',
    P.view(P.marked('no_plan', 'Nothing to gate on.'), []).state === 'no_plan');
  const amb = P.view({ state: 'ambiguous', candidates: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], note: 'name one' }, []);
  ok('two active plans are reported as ambiguous WITH both names, never silently intersected or picked',
    amb.state === 'ambiguous' && amb.candidates.length === 2 && /name one/.test(amb.note));
  const un = P.view(P.unavailable('read failed'), []);
  ok('an unreadable plan is `unavailable` and carries the reason, so a broken read can never look like compliance',
    un.state === 'unavailable' && un.reason === 'read failed');
  const ready = P.view({ state: 'ready', plan: { id: 1, name: 'X', version: 3 }, counts: { machine: 2, prose: 1, unknown_fact: 1 },
    rules: [P.parseRule('require min_rr >= 2'), P.parseRule('require killzone'), P.parseRule('Wait'), P.parseRule('require swep')],
    note: 'Checked against 2 machine-checkable requirements in your plan.' }, [e]);
  ok('a ready plan reports what is enforced, what is prose and what is unrecognised \u2014 as three separate lists',
    ready.enforced === 2 && ready.prose === 1 && ready.unknown_fact === 1
    && ready.enforced_lines.length === 2 && ready.unverifiable_lines.length === 1 && ready.unrecognised_lines[0].text === 'require swep',
    JSON.stringify({ enforced: ready.enforced_lines, prose: ready.unverifiable_lines, unknown: ready.unrecognised_lines }));
  ok('the per-direction results ride the view, so a client can explain which side a rule refused',
    ready.candidates.length === 1 && ready.candidates[0].dir === 1 && ready.candidates[0].refused === 1 && ready.refused_now === true);
  ok('the limits name the vocabulary and deny every influence a gate could be mistaken for',
    ready.limits.enforced_vocabulary.length === vocab.length && ready.limits.prose_is_not_parsed === true
    && ready.limits.market_conditions_field_is_not_parsed === true && ready.limits.exit_rules_are_not_parsed === true
    && ready.limits.grade_influence === false && ready.limits.score_influence === false && ready.limits.cap_influence === false
    && ready.limits.price_influence === false && ready.limits.unknown_is_never_met === true && ready.limits.broker_verified === false,
    JSON.stringify(ready.limits));
  ok('nothing in the gate is money-shaped: no amount, P&L, equity or goal key anywhere in the payload',
    !/"(pnl|profit|equity|amount|money|goal)[^"]*"\s*:/i.test(JSON.stringify(ready)), 'money-shaped key found');

  /* ------------------------------------------------------------- 8. the stored column shape */
  const parses = (r) => P.parse({ entry_rules: r });
  ok('a plan whose rules were never written parses to zero rules, not to an error',
    parses(undefined).rules.length === 0 && parses('').rules.length === 0 && parses(null).rules.length === 0);
  ok('a stored value that is not an array (or not JSON at all) also yields zero rules \u2014 the gate can never crash a signal',
    parses('{"nope":1}').rules.length === 0 && parses('not json at all').rules.length === 0 && parses('"a string"').rules.length === 0);
  ok('and it is reported as MALFORMED rather than as a plan with nothing to enforce',
    parses('{"nope":1}').malformed === true && parses('not json at all').malformed === true
    && parses('"a string"').malformed === true && parses(JSON.stringify(['require killzone'])).malformed === false,
    JSON.stringify([parses('{"nope":1}').malformed, parses(JSON.stringify(['require killzone'])).malformed]));
  ok('an array of strings is parsed in order, and blank entries are dropped rather than counted',
    parses(JSON.stringify(['require killzone', '', 'prose', 'require min_rr >= 2'])).rules.length === 3);
  const counted = parses(JSON.stringify(['require killzone', 'prose', 'require swep'])).counts;
  ok('and the counts a client renders are the parse\u2019s own counts', counted.machine === 1 && counted.prose === 1 && counted.unknown_fact === 1, JSON.stringify(counted));

  /* ------------------------------------------------------- 9. what the gate cannot decide */
  ok('the gate exposes no way to change a grade, a score, a cap or a price: the module exports no such setter',
    !Object.keys(P).some((k) => /set|apply|influence|adjust/i.test(k)), Object.keys(P).join());
  ok('and it names that limit itself, so the refusal can never be quoted as a performance claim',
    typeof P.safe === 'function' && ready.limits.broker_verified === false && ready.limits.enforced_vocabulary.length === vocab.length);
});

module.exports = {};
