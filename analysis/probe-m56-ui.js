'use strict';
/**
 * M56 ui probe: the plan gate as a trader sees it, rendered in jsdom against the payloads the server
 * really serves. What is measured is what a trader can be misled by: an empty rule list that renders
 * like a perfect plan, an unreadable plan that renders like no plan at all, a refusal the screen does
 * not attribute to the rule that caused it, a plan the app picked without being asked, and an editor
 * whose "what the bots check" list could disagree with the grammar the engine actually enforces.
 *
 * jsdom has no browser engine: this is a structural and behavioural proof, not a pixel proof. The
 * payloads are the app's own (fetched from a running server in every state except `unavailable`, which
 * no HTTP call can produce — that one is handed to the view and labelled as such).
 */
const fs = require('fs'), path = require('path');
const H = require('./m56-test-support'), { ok } = H;

H.finish('M56 real DOM: the plan, its refusals and the vocabulary a trader edits against', async () => {
  const P = H.mod('src/bots/plan-gate');
  if (!H.shipped(P, 'the plan gate (src/bots/plan-gate.js)')) return;
  const u = await H.start('m56-ui');
  const desk = await H.account(u, 'M56 ui desk');
  const q = (extra = {}) => H.analyseQuery(desk.id, extra);

  /* ---------------------------------------------------------- real payloads, real states */
  /* The harness account arrives with the app's own starter playbook published active; pause it first
   * so `no_plan` and `one active plan` are measurable as themselves. */
  const starter = (await u.req('/strategies', undefined, 'GET')).data.strategies;
  for (const x of starter) await H.setActive(u, x.id, x, 0);
  const withPlan = await H.plan(u, { name: 'London reversal', rules: ['require min_rr >= 999', 'require session asia', 'Wait for the sweep', 'require swep'] });
  const ready = (await H.analyse(u, q({ strategy_id: withPlan.id }))).data;
  const second = await H.plan(u, { name: 'Second plan', rules: ['require killzone'] });
  const ambiguous = (await H.analyse(u, q())).data;
  await H.setActive(u, second.id, second.body, 0);
  const auto = (await H.analyse(u, q())).data;
  await H.setActive(u, withPlan.id, withPlan.body, 0);
  const none = (await H.analyse(u, q())).data;
  const echoed = await H.plan(u, { name: 'Echoed back', entry_rules: JSON.stringify(['require killzone']) });
  const malformed = (await H.analyse(u, q({ strategy_id: echoed.id }))).data;
  /* Leave the trader with two active plans and one paused one, so the selector below has a real list. */
  await H.setActive(u, echoed.id, echoed.body, 0);
  await H.setActive(u, withPlan.id, withPlan.body, 1);
  await H.setActive(u, second.id, second.body, 1);
  ok('the probe renders the states the server really sends: a refused candidate, an ambiguous choice, an auto-selected plan, no plan, and an unreadable stored value',
    H.gateOf(ready).state === 'ready' && H.gateOf(ready).refused_now === true
    && H.gateOf(ambiguous).state === 'ambiguous' && H.gateOf(ambiguous).candidates.length === 2
    && H.gateOf(auto).state === 'ready' && H.gateOf(auto).plan.id === withPlan.id
    && H.gateOf(none).state === 'no_plan' && H.gateOf(malformed).malformed === true,
    JSON.stringify([H.gateOf(ready).state, H.gateOf(ambiguous).candidates, H.gateOf(auto).plan && H.gateOf(auto).plan.name, H.gateOf(none).state, H.gateOf(malformed).malformed]));
  ok('and the refusal the screen has to attribute is a real one: the plan sentence is the FIRST reason on the candidate',
    (H.candidateOf(ready, null).no_trade || [])[0].startsWith('Your plan \u201cLondon reversal\u201d'),
    JSON.stringify((H.candidateOf(ready, null).no_trade || [])[0]));


  const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
  const dom = new JSDOM('<body><div id="app"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const strategies = (await u.req('/strategies', undefined, 'GET')).data.strategies;
  const asked = [];
  let payload = ready;
  w.Store = { accountId: desk.id, strategies, user: { id: 1 }, settings: {}, reloadAll: async () => {} };
  w.API = {
    get: (url, params) => {
      asked.push([url, params || null]);
      if (url === '/bots/analyse') return Promise.resolve(payload);
      if (url === '/bots/chart') return Promise.resolve({ candles: [] });
      if (url === '/chart/drawings') return Promise.resolve({ drawings: [] });
      if (url === '/strategies') return Promise.resolve({ strategies, stats: {} });
      if (url === '/strategy-changes') return Promise.resolve({ report: { state: 'unavailable' } });
      if (url === '/strategies/change-discipline') return Promise.resolve({ strategy: null });
      if (url === '/bots/plan-gate') return Promise.resolve({ ok: true, version: P.VERSION, state: 'no_plan', vocabulary: null, counts: null, lines: [], limits: null });
      return Promise.resolve({});
    },
    put: (url, body) => { asked.push(['PUT ' + url, body]); return Promise.resolve({ ok: true }); },
    post: (url, body) => { asked.push(['POST ' + url, body]); return Promise.resolve({ ok: true, strategy: { id: 99 } }); },
  };
  const toasts = [];
  let modal = null, painting = false;
  w.App = { refresh: () => { if (painting) return; painting = true; try { w.Views.bots.render(root); } finally { painting = false; } },
    toast: (t, ty) => toasts.push([t, ty]),
    modal: (o) => { modal = o; return { close() {} }; }, openTrade: () => {}, runGuarded: (fn) => fn(null) };
  w.Chart = null;

  const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
  load('util.js'); load('views/bots.js'); load('views/playbook.js');
  const root = w.document.getElementById('app');
  const qs = (sel, r) => (r || root).querySelector(sel);
  const qsa = (sel, r) => [...(r || root).querySelectorAll(sel)];
  const text = (n) => (n ? n.textContent : '');

  const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
  const paint = async (p) => { payload = p; w.Views.bots.reset(); w.Views.bots.render(root); await tick(); };
  await paint(ready);

  /* ---------------------------------------------------------- 1. which plan the screen names */
  ok('the toolbar carries the choice of plan, with `my active plan` as the default rather than a silent pick',
    !!qs('[data-plan-select]') && /my active plan/.test(text(qs('[data-plan-select] option'))), text(qs('[data-plan-select]')));
  ok('and it offers exactly the trader\u2019s ACTIVE plans by name \u2014 a paused plan is not a choice the screen makes for them',
    (() => { const opts = qsa('[data-plan-select] option').map(text);
      const active = strategies.filter((s) => s.active).map((s) => s.name);
      return opts.length === active.length + 1 && active.every((n) => opts.includes(n))
        && strategies.filter((s) => !s.active).every((s) => !opts.includes(s.name)); })(),
    JSON.stringify(qsa('[data-plan-select] option').map(text)));
  ok('choosing one re-runs the analysis WITH that plan on the request, so what the screen shows and what the engine checked cannot drift apart',
    (() => { const sel = qs('[data-plan-select]'); sel.value = String(second.id); sel.dispatchEvent(new w.Event('change')); return true; })());
  await tick();
  ok('and the request the view then makes names it (`strategy_id`), rather than re-reading a plan it assumed',
    asked.some(([url, p]) => url === '/bots/analyse' && p && String(p.strategy_id) === String(second.id)),
    JSON.stringify(asked.filter(([url]) => url === '/bots/analyse').map(([, p]) => p && p.strategy_id)));

  /* ---------------------------------------------------------- 2. the gate, in words that act */
  await paint(ready);
  const readyNote = text(qs('[data-plan-gate]'));
  ok('a running plan is named with the version its rules were saved as, and how many requirements are enforced',
    /Plan London reversal v\d+/.test(readyNote) && /2 requirements enforced/.test(readyNote), readyNote);
  ok('the screen says a candidate below is refused BY the plan, rather than leaving the trader to guess why nothing is tradeable',
    /one of them refuses a candidate below/.test(readyNote), readyNote);
  ok('the line that is not machine-checkable is reported as never enforced, and the `require` line the app does not recognise is printed as NOT CHECKED \u2014 neither can pass for a checked box',
    /1 line not machine-checkable \(never enforced\)/.test(readyNote) && /NOT CHECKED: require swep/.test(readyNote), readyNote);
  ok('the per-candidate block shows the trader\u2019s own rule text beside its resolved state, with the measured detail that makes the refusal checkable',
    (() => { const block = qs('[data-plan-rules]'); if (!block) return false;
      const rows = qsa('[data-plan-rule]', block);
      const refused = rows.find((r) => r.dataset.planState === 'refused');
      return rows.length === 2 && rows.every((r) => ['met', 'refused', 'unknown'].includes(r.dataset.planState))
        && refused && refused.dataset.planRule === 'min_rr' && /require min_rr >= 999/.test(text(refused))
        && /R against a [\d.]+ stop/.test(text(refused)) && /2 refused · 0 unreadable/.test(text(block)); })(),
    text(qs('[data-plan-rules]')));
  ok('a plan refusal is attributed on the card even when the trader\u2019s own guardrail owns the action line: both reasons are visible, and the plan is not swallowed by the guardrail message',
    (() => { const actions = qsa('.bot-action').map(text);
      // The fixture desk has no trading window, so the M96 guardrail layer owns `action` (unchanged by
      // this milestone). The plan's refusal must still be on screen, rule by rule.
      const guardrailOwns = actions.some((t) => /Select your own local window\/timezone/.test(t));
      const planBlock = !!qs('[data-plan-rules]') && /require min_rr >= 999/.test(text(qs('[data-plan-rules]')))
        && /one of them refuses a candidate below/.test(text(qs('[data-plan-gate]')));
      // …and the sentence is first in the candidate's own reasons, which is what the card renders from.
      const firstReason = (H.candidateOf(ready, null).no_trade || [])[0];
      return guardrailOwns && planBlock && /still not trade/.test(firstReason) && qsa('.bot-action').every((n) => !/Buy|Sell/.test(text(n))); })(),
    JSON.stringify({ actions: qsa('.bot-action').map((n) => text(n).slice(0, 70)), reasons: (H.candidateOf(ready, null).no_trade || []).map((v) => v.slice(0, 50)) }));

  /* The engine's own resolution of a fact it could NOT read is measured in the pure and engine probes;
   * here the view is asked to render that state and must not turn it into a checked box. */
  const unknownFact = { ...ready, setups: { ...ready.setups,
    candidates: ready.setups.candidates.map((c, i) => (i ? c : { ...c, plan_rules: { ...c.plan_rules, unknown: 1,
      rules: [{ text: 'require no_news_blackout', fact: 'no_news_blackout', state: 'unknown', detail: null }, ...c.plan_rules.rules] } })) } };
  await paint(unknownFact);
  ok('a requirement whose fact could not be read is rendered as unreadable and says it refused nothing \u2014 it never appears as a satisfied box',
    (() => { const row = qsa('[data-plan-rule]').find((r) => r.dataset.planState === 'unknown');
      return !!row && row.dataset.planRule === 'no_news_blackout' && /could not be read, so it refused nothing/.test(text(row)) && /1 unreadable/.test(text(qs('[data-plan-rules]'))); })(),
    JSON.stringify(qsa('[data-plan-rule]').map((r) => [r.dataset.planRule, r.dataset.planState, text(r).slice(0, 40)])));
  ok('the plan block adds no control of its own: the gate is explanation, not a second decision surface with its own button',
    qsa('[data-plan-rules] button').length === 0 && qsa('[data-plan-rules] input').length === 0, qsa('[data-plan-rules] button').length);

  await paint(none);
  ok('with no active plan the screen says so out loud, tells the trader where a plan is published, and claims nothing was gated',
    /No active plan/.test(text(qs('[data-plan-gate]'))) && /Playbook/.test(text(qs('[data-plan-gate]'))) && /nothing is gated/.test(text(qs('[data-plan-gate]'))),
    text(qs('[data-plan-gate]')));
  await paint(ambiguous);
  ok('two active plans are named on screen with the way out, and the screen does not pick one for the trader',
    /More than one active plan/.test(text(qs('[data-plan-gate]'))) && /London reversal/.test(text(qs('[data-plan-gate]')))
    && /Second plan/.test(text(qs('[data-plan-gate]'))) && /nothing is gated until then/.test(text(qs('[data-plan-gate]'))),
    text(qs('[data-plan-gate]')));
  await paint(auto);
  ok('with one active plan the screen names the plan it used, so the default is visible rather than silent',
    /Plan London reversal/.test(text(qs('[data-plan-gate]'))), text(qs('[data-plan-gate]')));
  await paint(malformed);
  ok('a stored plan whose rules cannot be read is shown as a plan that needs re-saving \u2014 it does NOT render as an empty list of satisfied requirements',
    /re-save the plan/.test(text(qs('[data-plan-gate]'))) && /0 requirements enforced/.test(text(qs('[data-plan-gate]'))), text(qs('[data-plan-gate]')));
  const unreadable = { ...ready, setups: { ...ready.setups, filters: { ...ready.setups.filters,
    plan_gate: { ...H.gateOf(ready), state: 'unavailable', plan: null, candidates: null, machine: 0, enforced: 0, refused_now: false, unknown_now: false,
      note: null, reason: 'the playbook could not be read', enforced_lines: [], unverifiable_lines: [], unrecognised_lines: [] } } } };
  await paint(unreadable);
  ok('an unreadable plan refuses every signal on screen and says every signal is refused until it can be read \u2014 a broken read is never shown as a clean, plan-less chart',
    /could not be read/.test(text(qs('[data-plan-gate]'))) && /every signal is refused/.test(text(qs('[data-plan-gate]'))) && /could not be read/.test(text(qs('[data-plan-gate]'))),
    text(qs('[data-plan-gate]')));
  const research = { ...ready, setups: { ...ready.setups, filters: { ...ready.setups.filters,
    plan_gate: { ...H.gateOf(ready), state: 'not_consulted', plan: null, candidates: null, machine: 0, enforced: 0, refused_now: false, unknown_now: false,
      note: 'No written plan was consulted on this path.', enforced_lines: [], unverifiable_lines: [], unrecognised_lines: [] } } } };
  await paint(research);
  ok('and a research path that consults no plan says nothing at all, because a research payload is not a claim about a trader\u2019s plan',
    text(qs('[data-plan-gate]')) === '', JSON.stringify(text(qs('[data-plan-gate]'))));

  /* ---------------------------------------------------------- 3. the editor's own rule list */
  w.PLAN_GATE_VOCABULARY = null; delete w.PLAN_GATE_VOCABULARY;
  delete w.PLAN_GATE_VOCABULARY_ASKED;
  const vocabAsked = [];
  const realVocabulary = (await H.planGate(u)).data.vocabulary;
  w.API.get = (url, params) => {
    if (url === '/bots/plan-gate') { vocabAsked.push(url); return Promise.resolve({ ok: true, version: P.VERSION, vocabulary: realVocabulary, state: 'no_plan', counts: null, lines: [], limits: null }); }
    if (url === '/strategies') return Promise.resolve({ strategies, stats: {} });
    if (url === '/strategy-changes') return Promise.resolve({ report: { state: 'unavailable' } });
    return Promise.resolve({});
  };
  w.Views.ruleChanges = undefined;
  await w.Views.playbook.render(root);
  qs('#pb-new').dispatchEvent(new w.Event('click'));
  await tick(60);
  root.appendChild(modal.body);           // the editor guards on a connected body: it must be in the page to save
  ok('the editor\u2019s hint is populated on the FIRST open \u2014 it does not sit on `loading…` while the trader types the rules it is meant to inform',
    vocabAsked.length === 1 && !!qs('[data-plan-vocabulary]'), JSON.stringify(vocabAsked));
  ok('and it lists the engine\u2019s own vocabulary, line for line, from the server \u2014 there is no second copy in the browser to drift out of date',
    (() => { // The div also emphasises the word `require` once in its own closing sentence; every OTHER
      // code element must be a line the server published, and every published line must be there.
      const codes = qsa('code', qs('[data-plan-vocabulary]')).map(text).filter((t) => t !== 'require');
      return codes.length === realVocabulary.length && realVocabulary.every((v) => codes.includes(v.line)); })(),
    JSON.stringify(qsa('code', qs('[data-plan-vocabulary]')).map(text)));
  ok('an enumerated fact carries its allowed values on hover, so a trader can write a line the engine will accept rather than guessing',
    (() => { const c = qsa('code', qs('[data-plan-vocabulary]')).find((x) => /require session asia/.test(text(x)));
      return !!c && /one of: asia/.test(c.getAttribute('title') || ''); })(),
    qsa('code', qs('[data-plan-vocabulary]')).map((x) => x.getAttribute('title')));
  ok('and the hint states the deal: `require` lines are enforced and cannot be overruled, everything else is context that is never interpreted',
    /are ENFORCED by the bots/.test(text(qs('[data-plan-vocabulary]'))) && /never interpreted/.test(text(qs('[data-plan-vocabulary]')))
    && /does not recognise is reported loudly/.test(text(qs('[data-plan-vocabulary]'))), text(qs('[data-plan-vocabulary]')));
  /* ---------------------------------------------------------- 4. the alert history names the plan */
  /* An incoming TradingView alert is an analysis the trader did not ask for at that moment. The Settings
   * panel is the only place its verdict appears, so an alert the plan refused must name the plan there. */
  const plugins = [];
  w.Views.settings = undefined;
  load('views/settings.js');
  const hookAlert = { id: 1, symbol: 'EURUSD', tv_symbol: 'FX:EURUSD', action: 'buy', price: 1.1, timeframe: '15m',
    received_at: '2026-10-14 10:00:00', handled: 1, error: null, signal_id: null,
    result: { action: 'NO TRADE', grade: 'C', score: 41, agreement: 'against', whynot: [],
      plan_gate: { version: 'plan-gate-v1', state: 'ready', plan: { id: withPlan.id, name: 'London reversal', version: 3, active: true },
        enforced: 2, refused_now: true, unknown_now: false, enforced_lines: ['require min_rr >= 999', 'require session asia'],
        unverifiable_lines: [], unrecognised_lines: [], candidates: [] } } };
  const botsApi = w.API;                 // the settings pane needs its own reads; the bots API is restored after
  w.API = { get: (url) => { plugins.push(url);
    if (url === '/accounts') return Promise.resolve({ accounts: [], stats: {} });
    if (url === '/bots/webhook') return Promise.resolve({ ok: true, token: 'tok', url: 'https://x/api/bots/webhook/tradingview?token=tok', analyse: true, autocreate: true,
      stats: { total: 1, ok: 1, analysed: 1 }, alerts: [hookAlert], sample_text: '', sample_json: '' });
    return Promise.resolve({}); },
    post: () => Promise.resolve({ ok: true }), put: () => Promise.resolve({ ok: true }) };
  w.localStorage.setItem('tj_token', 'tok');
  await w.Views.settings.render(root);
  const tab = [...root.querySelectorAll('button')].find((b) => text(b) === 'Integrations');
  tab.dispatchEvent(new w.Event('click'));
  await tick(80);
  ok('the Settings alert history names the plan that gated an incoming alert, with the version and how many rules were enforced, and says it REFUSED this alert',
    (() => { const cell = qsa('tbody tr').map((tr) => tr.cells[4]).find((c) => /London reversal/.test(text(c)));
      return !!cell && /Plan London reversal v3: 2 rules enforced — refused this alert/.test(text(cell)) && /NO TRADE/.test(text(cell)); })(),
    JSON.stringify(qsa('tbody tr').map((tr) => tr.cells[4] && text(tr.cells[4]))));
  ok('and the alert row carries no signal id, so a refused alert is distinguishable from one that became a signal',
    /NO TRADE/.test(text(qs('tbody tr'))) && hookAlert.signal_id === null, text(qs('tbody tr')));
  ok('the alert history endpoint the panel reads is the one it needs, twice (the pane and its own refresh) \u2014 not a second source of truth',
    plugins.filter((u) => u === '/bots/webhook').length >= 1 && plugins.includes('/accounts'), JSON.stringify(plugins));

  w.API = botsApi;                // the editor underneath is the playbook's, not the settings pane's
  root.appendChild(modal.body);   // the Settings pane replaced the root: put the open editor back in the page
  qs('#s-name').value = 'Probe setup';
  qs('#s-entry').value = 'require killzone\nWait for the sweep';
  await modal.actions.find((a) => a.primary).onClick(() => {});
  await tick();
  ok('and the body it sends is an array (one entry per line), which is what the route stores and what the gate parses back \u2014 the editor and the gate cannot disagree about the shape',
    (() => { const sent = asked.find(([m, b]) => /^(PUT|POST) /.test(m) && b && b.entry_rules);
      return Array.isArray(sent && sent[1].entry_rules) && JSON.stringify(sent[1].entry_rules) === '["require killzone","Wait for the sweep"]'
        && sent[1].name === 'Probe setup'; })(),
    JSON.stringify(asked.filter(([m]) => /^(PUT|POST) /.test(m)).map(([m, b]) => [m, b && b.entry_rules])));
});
