#!/usr/bin/env node
'use strict';
/** Actual M78 analyse/chart/scan/storage/API and browser-script consumers.
 * Candle IO/closed structure labels are declared M68/M78 composition inputs; an ordinary CRT REPORT is
 * supplied at TD's boundary (not claimed as naturally discovered HTF CRT).
 * HTTP auth/save and browser scripts are real; chart RAF is a rendering seam.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
for (const k of ['TURSO_DATABASE_URL', 'LIBSQL_URL', 'TURSO_AUTH_TOKEN']) process.env[k] = '';
const dbFile = path.join(os.tmpdir(), `m78-${process.pid}.db`); process.env.TRADEJOURNAL_DB = dbFile;
const D = require(path.join(APP, 'src/db')), B = require(path.join(APP, 'src/bots')),
  Mom = require(path.join(APP, 'src/bots/momentum')), TD = require(path.join(APP, 'src/bots/topdown')),
  SMC = require(path.join(APP, 'src/bots/smc'));
const RawF = require('./helpers/entry-preference-fixture');
const pp = path.join(APP, 'src/bots/protected.js'), P = fs.existsSync(pp) ? require(pp) : {};
const F = { named: (d, m, a) => RawF.named(P, d, m, a), asOrdinaryCRT: RawF.asOrdinaryCRT };
let pass = 0, fail = 0, server;
const ok = (name, c, d = '') => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${name}${!c && d ? ' — ' + d : ''}`); c ? pass++ : fail++; };
let current = F.named(), forceOrdinary = true;
function fresh(dir = -1, model = 'market_shift', agrees = true) {
  const f = F.named(dir, model, agrees);
  for (const s of [f.input.series, f.input.biasSeries, f.input.triggerSeries]) s.smc.sessions = SMC.sessionState(new Date(f.END));
  return f;
}
(async () => { try {
  await D.ready;
  const user = await D.createUser({ email: `m78-${process.pid}@test.local`, password: 'fixture-only', name: 'Target fixture' });
  const token = await D.createSession(user.userId);
  require(path.join(APP, 'src/market')).getCalendar = async () => ({ events: [] });
  const rawBuild = TD.build, rawAnalyse = Mom.analyse;
  const load = async (symbol, tf) => ({ '4h': current.input.biasSeries, '15m': current.input.series, '5m': current.input.triggerSeries }[tf]);
  TD.build = (args) => { const r = rawBuild(args); return forceOrdinary ? F.asOrdinaryCRT(r, current) : r; };
  Mom.analyse = (symbol, tf, opts) => rawAnalyse(symbol, tf, { ...opts, seriesLoader: load }); Mom.series = load;
  require(path.join(APP, 'src/candles')).getCandles = async (symbol, tf) => load(symbol, tf);
  const Predictor = require(path.join(APP, 'src/bots/predict'));
  Predictor.predict = async () => ({ ok: true, setups: [{ dir: -1, p_win: 99 }], backtest: { decided: 100 }, summary: ['99% legacy research'] });
  let uiData, uiChart;
  for (const model of ['market_shift', 'flip']) for (const dir of [-1, 1]) for (const agrees of [true, false, null]) {
    current = fresh(dir, model, agrees); await D.clearBiasState('TEST', '15m');
    const opts = { includePrediction: true, useBreakers: model === 'flip', balance: 10000, riskPct: .5, nowMs: current.END };
    const a = await B.analyse('TEST', '15m', opts), c = a.setups.candidates.find((x) => x.dir === dir), lv = c.levels;
    const ch = await B.chart('TEST', '15m', { ...opts, bars: 200 }), scan = await B.scan(['TEST'], '15m', opts);
    ok(`${dir} ${model}: selected protected stop is actual candidate/Now/chart source, not a stale wider zone`,
      lv.stop_policy?.rule === 'current_protected' && lv.stop_policy.source_tf === '5m'
      && lv.stop_policy.kind === (dir < 0 ? 'protected_high' : 'protected_low')
      && lv.stop === (dir < 0 ? 97.18 : 102.82)
      && a.now.order?.stop_policy?.stop === lv.stop && ch.plan?.stop_policy?.stop === lv.stop);
    ok(`${dir} ${model}: immutable entry evidence stores that SAME selected institutional stop`,
      c.entry_evidence?.stop_policy?.stop === lv.stop && c.entry_evidence.stop_policy.protected_level.raw_price === (dir < 0 ? 97 : 103));
    ok(`${dir} ${model}: analyse retains actual 5m target source through Momentum's forwarding`,
      a.topdown.target_sources?.some((s) => s.tf === '5m') && lv.target_tf === '5m' && lv.targets[0]?.price === (dir < 0 ? 94.8 : 105.2));
    ok(`${dir} ${model}: final candidate, Now, chart plan and chart Now use exactly the same geometry/TF`,
      c.ok && a.now.armed && ch.plan?.entry === lv.entry && ch.plan.stop === lv.stop && ch.plan.target_tf === '5m'
      && ch.plan.targets[0].price === lv.targets[0].price && ch.now.order?.target === lv.targets[0].price
      && a.now.order?.target === lv.targets[0].price && a.now.order.target_tf === '5m');
    ok(`${dir} ${model}: scan does not relabel its smaller execution/exit as the 15m request or 4h bias`,
      scan.rows[0]?.entry_tf === '5m' && scan.rows[0].target_tf === '5m'
      && scan.rows[0].target_kind === 'opposing_order_block' && scan.rows[0].t1 === lv.targets[0].price);
    ok(`${dir} ${model}: revised target geometry never inherits old 99% live probabilities`,
      a.prediction?.setups.length === 0 && a.prediction.live_target_calibration === 'unvalidated'
      && !a.headline.text.includes('99%'));
    const prediction = a.prediction; a.prediction = { setups: [{ dir, p_win: 99 }] }; // force a storage-only negative
    const saved = await B.saveSignals(user.userId, a), row = saved.saved ? await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(saved.ids[0]) : null;
    ok(`${dir} ${model}: signal stores actual aligned target, no second target/probability, and exit provenance in note`,
      row?.t1 === lv.targets[0].price && row.t2 === null && row.entry === lv.entry && row.stop === lv.stop
      && row.p_win === null && /Exit 5m opposing_order_block/.test(row.sentiment || ''));
    ok(`${dir} ${model}: saved signal retains stop provenance and geometry, not only a model name`,
      row?.stop === lv.stop && /Stop 5m protected_/.test(row.sentiment || '')
      && JSON.parse(row.entry_evidence || '{}').stop_policy?.stop === lv.stop);
    a.prediction = prediction;
    const variant = agrees === true ? 'aggressive' : 'conservative', pref = c.entry_preference;
    ok(`${dir} ${model}/${agrees}: analyse candidate/Now/chart/scan expose SAME entry-TF structural variant`,
      pref?.variant === variant && pref.entry_tf === '5m' && pref.source_tf === '5m'
      && pref.state === (agrees === null ? 'unknown' : 'known') && pref.advanced_shortcut === false
      && a.now.entry_preference?.variant === variant && a.now.order.entry_preference?.variant === variant
      && ch.plan?.entry_preference?.variant === variant && ch.now.entry_preference?.variant === variant
      && ch.setups.candidates.find(x => x.dir === dir).entry_preference?.variant === variant
      && scan.rows[0]?.entry_preference?.variant === variant && scan.rows[0].entry_preference.entry_tf === '5m',
      JSON.stringify({ expected: variant, candidate: pref, now: a.now.entry_preference, order: a.now.order.entry_preference,
        chart: ch.plan?.entry_preference, chartNow: ch.now.entry_preference, chartCandidate: ch.setups.candidates.find(x => x.dir === dir).entry_preference, scan: scan.rows[0]?.entry_preference }));
    ok(`${dir} ${model}/${agrees}: saved named evidence and note retain the actual variant/source`,
      JSON.parse(row.entry_evidence || '{}').entry_preference?.variant === variant
      && (row.sentiment || '').includes(`Entry preference ${variant} on 5m internal structure`));
    ok(`${dir} ${model}/${agrees}: variant is separate from model, risk sizing and basic pullback authority`,
      pref?.execution === 'basic_causal_pullback' && a.now.order.mode === 'named-entry'
      && c.entry_model === model && a.now.order.entry === lv.entry && a.now.order.stop === lv.stop
      && c.risk.risk_pct === .5);
    if (dir < 0 && model === 'market_shift' && agrees === false) { uiData = a; uiChart = ch; }
  }
  // The ordinary unnamed/legacy CRT path was a separate parallel-order loophole.
  current = fresh(-1, 'market_shift', false); await D.clearBiasState('TEST', '15m');
  const ordinary = await B.analyse('TEST', '15m', { entryModels: false, nowMs: current.END, includePrediction: true, balance: 10000, riskPct: .5 });
  const oc = ordinary.setups.candidates.find((c) => c.dir === -1), ol = oc.levels;
  const chart = await B.chart('TEST', '15m', { entryModels: false, nowMs: current.END, bars: 200 });
  ok('ordinary unnamed CRT Now uses actual candidate, not its safer/aggressive HTF scenario',
    oc.ok && ordinary.now.order?.entry === ol.entry && ordinary.now.order.stop === ol.stop
    && ordinary.now.order.target === ol.targets[0].price && ordinary.now.order.mode === 'entry-aligned');
  ok('ordinary unnamed CRT chart uses that SAME target/stop/entry, not the projected range',
    chart.plan?.entry === ol.entry && chart.plan.stop === ol.stop && chart.plan.targets[0]?.price === ol.targets[0].price
    && chart.plan.target_tf === ol.target_tf && chart.plan.source === 'setup');
  ok('ordinary unnamed current target policy also withholds legacy calibration',
    ordinary.prediction?.setups.length === 0 && ordinary.prediction.withheld_for_target_policy === 'm54_m77_targets');
  ordinary.prediction = { setups: [{ dir: -1, p_win: 99 }] };
  const stored = await B.saveSignals(user.userId, ordinary), legacyRow = stored.saved ? await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(stored.ids[0]) : null;
  ok('even injected old probability cannot enter a new unnamed aligned signal', legacyRow?.p_win === null && legacyRow.t1 === ol.targets[0].price);

  ok('unnamed actual 15m candidate uses 15m internal structure, not opposing 5m trigger or conviction',
    oc.entry_preference?.entry_tf === '15m' && oc.entry_preference.source_tf === '15m'
    && oc.entry_preference.variant === 'aggressive' && ordinary.now.entry_preference?.variant === 'aggressive'
    && chart.plan?.entry_preference?.variant === 'aggressive'
    && /Entry preference aggressive on 15m/.test(legacyRow?.sentiment || ''));

  // Real authenticated save endpoint: same payload the browser's revised button posts.
  const express = require(path.join(APP, 'node_modules/express')), app = express(); app.use(express.json());
  app.use('/api', require(path.join(APP, 'src/routes/api'))); app.use((e, req, res, next) => res.status(500).json({ error: e.message }));
  server = await new Promise((resolve) => { const s = app.listen(0, '0.0.0.0', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function post(url, body) {
    const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': token }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  }
  const chosen = uiData.setups.candidates.find((c) => c.dir === -1), lv = chosen.levels;
  // The SAME well-formed client snapshot is submitted even to a parent that
  // cannot emit M78 metadata. This keeps rejection tests discriminating rather
  // than crashing/skipping when the feature is absent.
  const declaredPreference = chosen.entry_preference || { version: 'm78', rule: 'entry_tf_internal_structure',
    state: 'known', variant: 'conservative', dir: -1, entry_tf: '5m', source_tf: '5m',
    trend: 'bullish', aligned: false, observed_at: Date.parse('2026-07-15T08:30:00Z'),
    source_close_at: Date.parse('2026-07-15T08:30:00Z'), execution: 'basic_causal_pullback', advanced_shortcut: false,
    reason: '5m internal structure is bullish, not with the short execution: conservative preference (Ep20). Risk tier and the HTF narrative are not this selector.' };
  const plan = { symbol: 'TEST', timeframe: '15m', entry: lv.entry, stop: lv.stop, targets: lv.targets,
    grade: chosen.grade, score: chosen.score, entry_model: chosen.entry_model, entry_tf: chosen.entry_tf,
    entry_evidence: { ...chosen.entry_evidence, entry_preference: declaredPreference }, entry_preference: declaredPreference, target_policy: lv.target_policy, stop_policy: lv.stop_policy, p_win: 99,
    note: `5m ${lv.targets[0].kind} target, not the HTF projection`, entry_mode: 'crt', mtf_tf: '15m' };
  const saved = await post('/bots/signals/save-plan', plan), savedRow = saved.data.ids?.[0] ? await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(saved.data.ids[0]) : null;
  ok('authenticated Save-plan API keeps exact displayed entry/stop/aligned target and identity',
    saved.status === 200 && savedRow?.entry === lv.entry && savedRow.stop === lv.stop && savedRow.t1 === lv.targets[0].price
    && savedRow.entry_model === chosen.entry_model && savedRow.entry_tf === '5m' && savedRow.p_win === null);
  ok('Save-plan stores explicit stop provenance without requiring a new DB column', /Stop 5m protected_high/.test(savedRow?.sentiment || ''));
  const contradictory = await post('/bots/signals/save-plan', { ...plan, stop_policy: { ...lv.stop_policy, stop: 999 } });
  ok('authenticated API rejects stop metadata contradicting the displayed/saved price', contradictory.status === 400);
  const unnamed = await post('/bots/signals/save-plan', { ...plan, entry_model: 'none', entry_evidence: null });
  const un = unnamed.data.ids?.[0] ? await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(unnamed.data.ids[0]) : null;
  ok('authenticated Save-plan API also withholds old odds for unnamed revised targets', un?.p_win === null);

  ok('authenticated Save-plan preserves identical named preference evidence and visible provenance',
    JSON.parse(savedRow?.entry_evidence || '{}').entry_preference?.variant === 'conservative'
    && /Entry preference conservative on 5m/.test(savedRow?.sentiment || ''));
  for (const [label, changed] of [
    ['wrong TF', { ...declaredPreference, entry_tf: '4h' }],
    ['wrong direction', { ...declaredPreference, dir: 1 }],
    ['false aggression', { ...declaredPreference, variant: 'aggressive' }],
    ['advanced shortcut', { ...declaredPreference, advanced_shortcut: true }],
    ['contradictory named snapshot', { ...declaredPreference, reason: 'a different declared snapshot' }],
  ]) {
    const bad = await post('/bots/signals/save-plan', { ...plan, entry_preference: changed });
    ok(`authenticated API refuses M78 ${label}, not silently discarded metadata`, bad.status === 400);
  }
  const malformed = structuredClone(plan); malformed.entry_evidence.entry_preference.advanced_shortcut = true;
  const nestedBad = await post('/bots/signals/save-plan', { ...malformed, entry_preference: undefined });
  ok('authenticated API validates nested named preference too, even without top-level duplicate', nestedBad.status === 400);
  const reordered = await post('/bots/signals/save-plan', { ...plan,
    entry_preference: Object.fromEntries(Object.entries(declaredPreference).reverse()) });
  ok('semantically identical preference with reordered JSON keys is accepted', reordered.status === 200 && reordered.data.saved === 1);
  ok('unnamed Save-plan also persists actual preference without inventing a historical model',
    un?.entry_model === 'none' && /Entry preference conservative on 5m/.test(un.sentiment || ''));

  // Actual browser JS; chart paint intentionally excluded, not a screenshot claim.
  // Inject a stale/mixed legacy prediction payload at the browser boundary; the
  // real view obtains prediction from /analyse, not a separate /predict fetch.
  const namedUI = uiData, legacyPrediction = { ok: true, backtest: { target_frontier: [{ target_r: 3, trades: 100, net_win_pct: 60, expectancy_r: .2 }] },
    summary: ['Historical research fixture'], setups: [{ dir: -1, side: 'short', grade: 'A', p_win: 99 }] };
  uiData.prediction = legacyPrediction;
  const { JSDOM, VirtualConsole } = require(path.join(APP, 'node_modules/jsdom')), errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://preview.example/', runScripts: 'outside-only', virtualConsole: vc });
  const w = dom.window; w.requestAnimationFrame = () => 0; w.Views = {}; let copied, body;
  w.API = { get: async (url) => url.startsWith('/bots/chart') ? uiChart : url.startsWith('/bots/analyse') ? uiData
    : url.startsWith('/bots/state') ? { ok: true, settings: {}, equity: 10000 } : url.startsWith('/bots/markets')
      ? { timeframes: ['15m'], instruments: [{ symbol: 'TEST' }], sessions: { name: 'London' } } : {},
    post: async (url, p) => { body = p; return { saved: 1 }; } };
  w.TV = { link: () => '#', planText: (s, tf, c) => c, copy: (x) => { copied = x; } };
  w.Chart = { render: () => w.document.createElement('div'), mini: () => w.document.createElement('div') };
  w.App = { refresh() { try { w.Views.bots.render(w.document.getElementById('root')); } catch (e) { errors.push(e.message); } }, toast() {}, goto() {} };
  for (const f of ['util.js', 'store.js']) w.eval(fs.readFileSync(path.join(APP, 'public/js', f), 'utf8'));
  w.Store.user = { settings: { timezone: 'UTC' } }; w.Store.accounts = []; w.Store.strategies = []; w.Store.instruments = [];
  w.Store.queryParams = () => ({}); w.__botRequest = { symbol: 'TEST', tf: '15m' };
  w.eval(fs.readFileSync(path.join(APP, 'public/js/views/bots.js'), 'utf8'));
  const root = w.document.getElementById('root');
  async function render() { await w.Views.bots.render(root); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); }
  await render();
  ok('browser explicitly labels HTF table as projection, not an executable alternative',
    /HTF projection \(not an order\)/.test(root.textContent) && /entry-aligned exit/i.test(root.textContent));
  ok('Mechanics pane cannot turn stale legacy odds into a current named probability',
    !root.textContent.includes('P(win)'));
  const copy = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Copy plan'); copy?.click();
  ok('actual browser Copy-plan retains chosen target kind/TF/price', copied?.levels.targets[0]?.source_tf === '5m'
    && copied.levels.targets[0].price === lv.targets[0].price && copied.levels.targets[0].kind === 'opposing_order_block');
  const save = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Save eligible entry-aligned plan'); save?.click(); await new Promise((r) => setImmediate(r));
  ok('actual browser Save button posts ONLY the eligible candidate, not p.safer/p.aggressive',
    save && !save.disabled && body?.entry === lv.entry && body.stop === lv.stop && body.targets[0].price === lv.targets[0].price
    && body.entry_tf === '5m' && body.target_policy.rule === 'entry_or_one_above');
  let text; w.navigator.clipboard = { writeText: async (x) => { text = x; } };
  w.eval(fs.readFileSync(path.join(APP, 'public/js/tv.js'), 'utf8')); await w.TV.copy(w.TV.planText('TEST', '15m', copied));
  ok('actual clipboard formatter names honest exit TF, not just chart timeframe', text?.includes('[5m]') && text.includes(String(lv.targets[0].price)));
  ok('actual browser names conservative preference, true 5m source and structure-based reason',
    !!root.querySelector('.entry-preference') && /Entry preference: conservative/.test(root.textContent)
    && /5m internal structure is bullish/.test(root.textContent) && /not an advanced entry model/.test(root.textContent),
    root.textContent.match(/.{0,30}(?:Entry preference|internal structure|advanced entry model).{0,230}/g)?.join(' | '));
  ok('actual browser Save/Copy retain the preference WITHOUT substituting a CRT entry price',
    body?.entry_preference?.variant === 'conservative' && body.entry_preference.entry_tf === '5m'
    && body.entry === lv.entry && copied?.entry_preference?.variant === 'conservative'
    && text?.includes('conservative preference (5m internal bullish; basic pullback)'));
  ok('actual browser renders the selected stop/invalidation policy, not only the price',
    !!root.querySelector('.stop-policy') && /current_protected/.test(root.textContent));
  ok('actual browser Save posts the SAME protected stop snapshot; Copy names stop TF/kind/rule',
    body?.stop_policy?.stop === lv.stop && text?.includes('protected_high; current_protected') && text.includes('stop 97.1800 [5m]'));
  async function openPrediction() {
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Prediction')?.click();
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  }
  await openPrediction();
  ok('named browser execution withholds stale 99% live probabilities',
    !!root.querySelector('.live-calibration-withheld') && root.querySelectorAll('.bot-prob').length === 0);
  ok('calibration guard retains labelled historical research rather than inventing new odds',
    root.textContent.includes('Historical research fixture') && /different entry\/target geometry/.test(root.textContent));
  uiData = ordinary; uiData.prediction = legacyPrediction;
  w.__botRequest = { symbol: 'TEST', tf: '15m' }; await render(); await openPrediction();
  ok('unnamed revised-target browser execution also withholds stale 99% live probabilities',
    !!root.querySelector('.live-calibration-withheld') && root.querySelectorAll('.bot-prob').length === 0);
  ok('Mechanics/Prediction revised-target candidates remain the actual unnamed path',
    !uiData.topdown.entry_setup?.applies && uiData.setups.candidates.some(c => c.levels?.target_policy?.rule === 'entry_or_one_above'));
  for (const fullN of [9, 10]) {
    const def = fullN >= 10 ? 'full' : 'all';
    uiData.prediction = { ...legacyPrediction, backtest: { ...legacyPrediction.backtest,
      default_view: def, frontier_views: { all: { trades: 100, label: 'every setup' },
        full: { trades: fullN, label: 'maximum-expectancy shape' } } } };
    w.__botRequest = { symbol: 'TEST', tf: '15m' }; await render(); await openPrediction();
    const chip = [...root.querySelectorAll('button.chip')].find(b => b.textContent.startsWith(def + ' · default (n='));
    ok(`historical default with full n=${fullN}: actual browser marks/selects payload's ${def} view`,
      chip?.classList.contains('ok') && (def !== 'full' || root.textContent.includes('View shown by default: full')));
  }
  uiData.prediction = { ...legacyPrediction, backtest: {} };
  w.__botRequest = { symbol: 'TEST', tf: '15m' }; await render(); await openPrediction();
  ok('empty research frontier still explains withholding rather than rendering stale live odds',
    !!root.querySelector('.live-calibration-withheld') && root.querySelectorAll('.bot-prob').length === 0);
  uiData.prediction = null;
  w.__botRequest = { symbol: 'TEST', tf: '15m' }; await render(); await openPrediction();
  ok('prediction-disabled current-policy read explains withholding and shows zero live cards',
    !!root.querySelector('.live-calibration-withheld') && root.querySelectorAll('.bot-prob').length === 0);
  uiData = namedUI;
  w.__botRequest = { symbol: 'TEST', tf: '15m' }; await render();
  const refused = structuredClone(uiData); const rc = refused.setups.candidates.find((c) => c.dir === -1);
  rc.ok = false; rc.no_trade = ['Near qualified target below 2R']; refused.now.armed = false; refused.now.order = null; refused.now.action = 'NO TRADE';
  Object.assign(uiData, refused); await render();
  const disabled = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Nothing eligible to save');
  ok('a refused candidate cannot be saved via the HTF projection button', disabled?.disabled === true);
  ok('actual browser scripts complete without JS errors', errors.length === 0, errors.join('; ')); dom.window.close();
} finally {
  if (server) await new Promise((r) => server.close(r)); D.client.close();
  for (const p of [dbFile, dbFile + '-wal', dbFile + '-shm']) try { fs.unlinkSync(p); } catch {}
}
console.log(`\nM78 CONSUMERS: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
