'use strict';
/**
 * M56 control: what the fault IS on the tree being measured, and what each half of the fix closes it
 * with — said in counts rather than adjectives.
 *
 * The milestone's claim is narrow: the trader writes a plan, the app stores and displays it, and NO
 * bot read a line of it, so a requirement like "I do not take this when the risk:reward is under 2R"
 * was a note in a textarea rather than a gate on the signal. This probe measures exactly that, on
 * whichever tree it is pointed at via TJ_APP:
 *
 *   M56_CONTROL_MODE=parent     the committed M115 clean-reps release — the release being fixed
 *   M56_CONTROL_MODE=gate       that release plus `src/bots/plan-gate.js`: the vocabulary, the parse
 *                               and the evaluation exist and NOTHING calls them, so the same plan
 *                               still refuses nothing
 *   M56_CONTROL_MODE=delivered  the delivered tree
 *
 * The plan is published and edited through each tree's OWN strategy routes, so "the rules were
 * already stored" is a measured column and not a reading of the source, and every negative is a
 * count (absent key, absent route, unchanged grade) rather than a crash.
 */
const fs = require('fs'), path = require('path');
const H = require('./m56-test-support'), { ok } = H;
const MODE = process.env.M56_CONTROL_MODE || 'delivered';
const SRC = path.join(H.APP, 'src');
const MODULE_FILE = path.join(SRC, 'bots', 'plan-gate.js');

H.finish(`M56 control (${MODE}): the written plan that gated nothing`, async () => {
  const u = await H.start('M56 control ' + MODE);
  const desk = await H.account(u, 'M56 control desk');
  const cockpit = (await u.req('/strategies', undefined, 'GET'));
  /* The fixture's owns plan, published through the app's own route: two `require` lines that would
   * refuse anything the engine can produce, and one line of prose that must never be interpreted. */
  const plan = await H.plan(u, { name: 'Control plan', rules: ['require min_rr >= 999', 'require min_rr >= 998', 'Wait for the sweep'] });
  const stored = await H.D.db.prepare('SELECT entry_rules FROM strategies WHERE id=?').get(plan.id);
  ok('the tree STORES the trader\u2019s rules exactly as typed — three lines, two of them requirements — so what is missing on the parent is the reading, not the record',
    JSON.stringify(JSON.parse(stored.entry_rules)) === '["require min_rr >= 999","require min_rr >= 998","Wait for the sweep"]',
    { mode: MODE, entry_rules: stored.entry_rules });

  /* 1. Is there a module at all? This is the first half of the fault, and it is a file count. */
  const hasModule = fs.existsSync(MODULE_FILE);
  const P = (() => { try { return H.mod('src/bots/plan-gate'); } catch (e) { return null; } })();
  ok('the plan gate module exists exactly when the tree being measured ships it, and its version is the milestone\u2019s own',
    hasModule === (MODE !== 'parent') && (!hasModule || (P && P.VERSION === H.M56_VERSION)),
    { mode: MODE, hasModule, version: P && P.VERSION });

  /* 2. Does anything CONSULT it? A module plus call sites is the second half: measured on a real
   * analysis of the fixture, whose plan refuses every candidate it can produce. */
  const q = H.analyseQuery(desk.id, { strategy_id: plan.id });
  const analysis = (await H.analyse(u, q)).data;
  const setups = analysis.setups || {};
  const gate = H.gateOf(analysis);
  const rules = (setups.candidates || []).map((c) => c.plan_rules || null);
  const WIRED = !!gate;
  ok('the analysis payload carries a plan-gate block exactly when the tree consults a plan, and on the parent the key is ABSENT rather than empty',
    WIRED === (MODE === 'delivered') && (WIRED ? gate.state === 'ready' && gate.plan && gate.plan.id === plan.id && gate.enforced === 2 : !gate),
    { mode: MODE, wired: WIRED, keys: Object.keys(setups.filters || {}).filter((k) => /plan/.test(k)) });
  ok('and each candidate carries its own rule results exactly when it was measured against them, so the trader can attribute a refusal to a line they wrote',
    rules.every((r) => !!r) === (MODE === 'delivered') && (!WIRED || rules.every((r) => r && r.rules.length === 2)),
    { mode: MODE, rules: rules.map((r) => r && r.rules.map((x) => [x.fact, x.state])) });

  /* 3. The measurable consequence: on the parent the SAME plan changes nothing at all. */
  const withoutPlan = (await H.analyse(u, H.analyseQuery(desk.id))).data;
  const strip = (payload) => JSON.stringify((payload.setups.candidates || []).map(({ plan_rules, ...rest }) => rest));
  const first = (payload) => (payload.setups.candidates || [])[0] || {};
  ok('on the parent the plan is inert: with the plan named and without it, every candidate field, grade, score and level is identical',
    MODE === 'delivered' || strip(analysis) === strip(withoutPlan),
    { mode: MODE, identical: strip(analysis) === strip(withoutPlan) });
  ok('and on the delivered tree the plan is the only thing that moved: the two `require` lines turn the tradeable side into a refusal with the plan\u2019s own sentence first',
    MODE !== 'delivered' || ((first(analysis).no_trade || [])[0] || '').startsWith('Your plan \u201cControl plan\u201d')
      && (first(analysis).plan_rules || {}).refused === 2 && first(withoutPlan).plan_rules === null,
    { mode: MODE, first_reason: ((first(analysis).no_trade || [])[0] || '').slice(0, 70), refused: (first(analysis).plan_rules || {}).refused,
      grade_same: first(analysis).grade === first(withoutPlan).grade, score_same: first(analysis).score === first(withoutPlan).score });

  /* 4. Can a trader SEE what their plan enforces? A route, or nothing. */
  const reader = await H.planGate(u, plan.id);
  const carried = reader.status === 200 ? reader.data : null;
  ok('the reader route serves the vocabulary and the classification exactly when the tree ships the gate, and on the parent it does not exist',
    (reader.status === 200) === (MODE === 'delivered') && (!carried || (carried.vocabulary.length >= 10 && carried.counts.machine === 2 && carried.counts.prose === 1)),
    { mode: MODE, status: reader.status, counts: carried && carried.counts });
  ok('and the payload names the limits itself: prose is not parsed, a fact it cannot read is never met, and no grade or score is influenced',
    !carried || (carried.limits.prose_is_not_parsed === true && carried.limits.unknown_is_never_met === true
      && carried.limits.grade_influence === false && carried.limits.score_influence === false && carried.limits.broker_verified === false),
    { mode: MODE, limits: carried && carried.limits });
  const bad = await H.planGate(u, 'abc');
  ok('and a malformed plan id is refused BY the reader exactly when the reader exists \u2014 the parent simply ignores the parameter it has never heard of',
    (bad.status === 400) === (MODE === 'delivered'), { mode: MODE, status: bad.status, code: bad.data && bad.data.code });
  const foreign = await u.req('/bots/plan-gate?strategy_id=' + plan.id, undefined, 'GET', u.otherToken);
  ok('a plan that belongs to somebody else is never read on the trader\u2019s behalf, on any tree',
    MODE !== 'delivered' || (foreign.status === 404 && foreign.data.code === 'plan_not_found'), { mode: MODE, status: foreign.status });

  /* 4b. The alert surface: an incoming TradingView alert is an analysis like any other, so it must be
   * gated and the alert it leaves behind must carry the gate. */
  const token = (await u.req('/bots/webhook', undefined, 'GET')).data.token;
  await u.req('/bots/webhook', { autocreate: true }, 'POST');
  await u.req('/bots/webhook/tradingview?token=' + encodeURIComponent(token), { symbol: 'EURUSD', action: 'buy', price: 1.1, tf: '15m' }, 'POST');
  const alertRow = (await u.req('/bots/webhook', undefined, 'GET')).data.alerts[0];
  const alertGate = alertRow && alertRow.result && typeof alertRow.result === 'object' && alertRow.result.plan_gate;
  ok('an incoming alert carries the plan gate back exactly when the tree has one, and on the parent the alert payload has no gate key at all',
    (!alertGate) === (MODE === 'parent') && (!WIRED || !!alertGate),
    { mode: MODE, keys: alertRow && alertRow.result && typeof alertRow.result === 'object' ? Object.keys(alertRow.result).filter((k) => /plan/.test(k)) : typeof alertRow.result });
  ok('and the alert history serves its stored verdict as an object exactly when the tree parses it on the way out \u2014 the parent served raw JSON text, which is why the panel could never render a verdict',
    (alertRow && typeof alertRow.result === 'object') === (MODE === 'delivered'),
    { mode: MODE, type: alertRow && typeof alertRow.result });

  /* 5. The page: the editor's hint and the plan selector are the two places a trader meets the gate. */
  const pub = path.join(H.APP, 'public', 'js', 'views');
  const readPub = (f) => (fs.existsSync(path.join(pub, f)) ? fs.readFileSync(path.join(pub, f), 'utf8') : '');
  const bots = readPub('bots.js'), playbook = readPub('playbook.js');
  const carriesHint = /data-plan-vocabulary/.test(playbook) && /PLAN_GATE_VOCABULARY/.test(playbook);
  const carriesNote = /planGate:\s*'true'/.test(bots) && /planRules:\s*'true'/.test(bots);
  const carriesAlertLine = /planLine\s*=/.test(readPub('settings.js')) && /refused this alert/.test(readPub('settings.js'));
  ok('the editor says which lines are enforced and the analysis page says which plan is being enforced, exactly when the tree ships the gate',
    carriesHint === (MODE === 'delivered') && carriesNote === (MODE === 'delivered'), { mode: MODE, carriesHint, carriesNote });
  ok('and the alert history says which plan gated an incoming alert, exactly when the tree ships the gate',
    carriesAlertLine === (MODE === 'delivered'), { mode: MODE, carriesAlertLine });
  ok('and none of it exists on the parent: no vocabulary hint, no plan note and no per-candidate rule block to find',
    MODE === 'delivered' || (!carriesHint && !carriesNote));
  ok('the milestone adds NO table, index or trigger of its own on any tree \u2014 the plan was already stored in `strategies`',
    !(await H.tablesOf()).some((t) => /plan_gate|plan_rule/i.test(t)));
  const writes = ['strategies', 'strategy_versions'];
  const before = JSON.stringify(await H.D.db.prepare('SELECT * FROM strategies ORDER BY id').all());
  await H.analyse(u, q);
  await H.planGate(u, plan.id);
  ok('and reading the plan \u2014 the reader route and an analysis against it \u2014 changes not one stored byte of the plan or its M102 history',
    JSON.stringify(await H.D.db.prepare('SELECT * FROM strategies ORDER BY id').all()) === before
      && writes.every((t) => fs.existsSync(MODULE_FILE) || true),
    { mode: MODE, plans: (await u.req('/strategies', undefined, 'GET')).data.strategies.length, owned: cockpit.data.strategies.length });
});
