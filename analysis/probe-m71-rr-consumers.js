#!/usr/bin/env node
'use strict';
/** M71 real consumers, auth routes and browser scripts. Candle IO/structure and
 * ordinary CRT reports are declared composition seams; Setup's opt-in ladder
 * is forced at its ctx boundary (not offered by today's public API/UI).
 * No renderer/pixel or live-provider/production validation is claimed.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
for (const k of ['TURSO_DATABASE_URL', 'LIBSQL_URL', 'TURSO_AUTH_TOKEN']) process.env[k] = '';
const dbFile = path.join(os.tmpdir(), `m71-consumers-${process.pid}.db`); process.env.TRADEJOURNAL_DB = dbFile;
const D = require(path.join(APP, 'src/db')), B = require(path.join(APP, 'src/bots')),
  Mom = require(path.join(APP, 'src/bots/momentum')), TD = require(path.join(APP, 'src/bots/topdown')),
  SU = require(path.join(APP, 'src/bots/setup')), SMC = require(path.join(APP, 'src/bots/smc')),
  P = require(path.join(APP, 'src/bots/protected'));
const F = require('./helpers/entry-preference-fixture'), baselineSetup = SU.buildSetups, baselineTD = TD.build;
let pass = 0, fail = 0, server, dom, current, forceLadder = true;
const ok = (label, value, detail = '') => { console.log(` ${value ? 'ok  ' : 'FAIL'} ${label}${!value && detail ? ' — ' + detail : ''}`); value ? pass++ : fail++; };
const results = [];
function fresh(dir = -1, model = 'market_shift', primaryR = 1.5) {
  const f = F.named(P, dir, model, true), previous = current; current = f;
  for (const frame of [f.input.series, f.input.biasSeries, f.input.triggerSeries]) frame.smc.sessions = SMC.sessionState(new Date(f.END));
  const base = baselineSetup(f.input.series.smc, { price: f.input.series.price, atr: 1, bias: f.htfDir,
    balance: 10000, riskPct: .5, entrySeries: f.input.series, observedAt: f.END,
    useBreakers: model === 'flip', topdown: baselineTD(f.input) }).candidates.find(c => c.dir === dir);
  const { entry, stop } = base.levels;
  const price = entry + dir * Math.abs(entry - stop) * primaryR;
  f.input.triggerSeries.smc.order_blocks.push({ dir: -dir, bottom: dir > 0 ? price : price - .1,
    top: dir > 0 ? price + .1 : price, strength: 1, breached: false, mitigated: false, t: f.END - 300000 });
  current = previous; return f;
}
(async () => { try {
  await D.ready;
  const user = await D.createUser({ email: `m71-${process.pid}@test.local`, password: 'fixture-only', name: 'RR fixture' });
  const token = await D.createSession(user.userId);
  require(path.join(APP, 'src/market')).getCalendar = async () => ({ events: [] });
  const rawBuild = TD.build, rawAnalyse = Mom.analyse, rawSetup = SU.buildSetups;
  const load = async (symbol, tf) => ({ '4h': current.input.biasSeries, '15m': current.input.series, '5m': current.input.triggerSeries }[tf]);
  TD.build = args => F.asOrdinaryCRT(rawBuild({ ...args, opts: { ...args.opts, observedAt: current.END } }), current);
  Mom.analyse = (symbol, tf, opts) => rawAnalyse(symbol, tf, { ...opts, nowMs: current.END, seriesLoader: load });
  Mom.series = load; require(path.join(APP, 'src/candles')).getCandles = async (symbol, tf) => load(symbol, tf);
  SU.buildSetups = (a, ctx) => rawSetup(a, { ...ctx, ladderTargets: forceLadder, observedAt: current.END });
  require(path.join(APP, 'src/bots/predict')).predict = async () => ({ ok: true,
    setups: [{ dir: -1, p_win: 99 }], backtest: { decided: 100 }, summary: ['legacy research fixture'] });
  let uiRefused, uiAllowed;
  for (const model of ['market_shift', 'flip']) for (const dir of [-1, 1]) {
    current = fresh(dir, model); await D.clearBiasState('TEST', '15m');
    const opts = { minRR: 2, useBreakers: model === 'flip', nowMs: current.END, balance: 10000, riskPct: .5, includePrediction: true };
    const a = await B.analyse('TEST', '15m', opts), c = a.setups.candidates.find(c => c.dir === dir), l = c.levels;
    const chart = await B.chart('TEST', '15m', { ...opts, bars: 200 }), scan = await B.scan(['TEST'], '15m', opts);
    ok(`${dir}/${model}: final analyser refuses 1.5R T1 even when final runner is >2R`,
      !c.ok && l.rr_primary === 1.5 && l.rr_final > 2 && l.rr_floor?.rule === 'primary_target'
      && !l.rr_floor.passed && a.setups.verdict.action === 'NO TRADE');
    ok(`${dir}/${model}: Now/chart cannot arm the refused candidate or HTF projection`,
      !a.now.armed && !a.now.order && !chart.now.armed && !chart.now.order && !chart.plan);
    ok(`${dir}/${model}: scan cannot emit BUY/SELL from this runner-rescued idea`,
      scan.rows[0]?.action === 'NO TRADE' && scan.rows[0].t1 === l.targets[0].price && scan.rows[0].target_tf === '5m');
    const noSave = await B.saveSignals(user.userId, a);
    ok(`${dir}/${model}: automatic signal storage cannot persist refused first-target geometry`, noSave.saved === 0);
    ok(`${dir}/${model}: primary-floor correction cannot resurrect stale 99% probabilities`,
      a.prediction?.setups.length === 0 && a.prediction.live_target_calibration === 'unvalidated');
    const low = await B.analyse('TEST', '15m', { ...opts, minRR: 1 });
    const lc = low.setups.candidates.find(c => c.dir === dir), stored = await B.saveSignals(user.userId, low);
    const row = stored.saved ? await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(stored.ids[0]) : null;
    ok(`${dir}/${model}: configured 1R may permit that same 1.5R magnet; no forced 2R floor or price change`,
      lc.ok && lc.levels.rr_floor?.min_rr === 1 && lc.levels.rr_floor.passed
      && lc.levels.entry === l.entry && lc.levels.stop === l.stop && lc.levels.targets[0].price === l.targets[0].price
      && low.now.armed && low.now.order.target === l.targets[0].price);
    ok(`${dir}/${model}: eligible signal preserves distinct primary/final endpoints, not runner-as-T1`,
      row?.t1 === l.targets[0].price && row.t2 === lc.levels.targets.at(-1).price
      && row.rr_primary === 1.5 && row.rr_final === lc.levels.rr_final && row.p_win === null);
    results.push({ dir, model, first_r: l.rr_primary, final_r: l.rr_final, refused_at_2: !c.ok,
      allowed_at_1: lc.ok, auto_saved_refused: noSave.saved, auto_saved_allowed: stored.saved });
    if (dir < 0 && model === 'market_shift') { uiRefused = a; uiAllowed = low; }
  }
  const express = require(path.join(APP, 'node_modules/express')), app = express(); app.use(express.json());
  app.use('/api', require(path.join(APP, 'src/routes/api')));
  app.use((e, req, res, next) => res.status(500).json({ error: e.message }));
  server = await new Promise(resolve => { const s = app.listen(0, '0.0.0.0', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  current = fresh();
  async function get(query, expectedFloor, eligible) {
    await D.clearBiasState('TEST', '15m');
    const res = await fetch(base + '/bots/analyse?symbol=TEST&tf=15m&prediction=0' + query, { headers: { 'x-session': token } });
    const data = await res.json(), c = data.setups?.candidates.find(c => c.dir === -1);
    ok(`authenticated route ${query || '(no query)'} uses floor ${expectedFloor} on PRIMARY geometry`,
      res.status === 200 && c?.levels.rr_floor?.min_rr === expectedFloor
      && c.ok === eligible && c.levels.rr_floor.passed === eligible,
      JSON.stringify({ status: res.status, floor: c?.levels.rr_floor, ok: c?.ok }));
    return data;
  }
  await get('', 1, true); // API/UI default; direct Setup separately remains 2.
  await get('&min_rr=2', 2, false); await get('&min_rr=0.01', .1, true); await get('&min_rr=100', 10, false);
  await D.db.prepare('UPDATE users SET settings=? WHERE id=?').run(JSON.stringify({ min_rr: 3 }), user.userId);
  await get('', 3, false); await get('&min_rr=1', 1, true); await get('&min_rr=bad', 3, false);
  await get('&min_rr=0', 3, false);
  await D.db.prepare('UPDATE users SET settings=? WHERE id=?').run('{}', user.userId);
  const denied = await fetch(base + '/bots/analyse?symbol=TEST&tf=15m&prediction=0');
  ok('authentication remains mandatory; RR tests do not replace authorization', denied.status === 401);
  const saved = await get('&min_rr=2&save=1', 2, false);
  ok('actual authenticated analyser/save=1 endpoint stores no refused primary-floor signal', saved.saved?.saved === 0);
  forceLadder = false; const single = await get('&min_rr=2', 2, false);
  ok('actual route retains one-target default management, never manufactures 2R geometry',
    single.setups.candidates.find(c => c.dir === -1).levels.targets.length === 1);
  forceLadder = true;

  const { JSDOM } = require(path.join(APP, 'node_modules/jsdom'));
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://fixture.test', runScripts: 'outside-only' });
  const w = dom.window, errors = []; let ui = uiRefused, copied, body, logged, text;
  w.requestAnimationFrame = () => 0; // deliberate chart-render seam
  w.addEventListener('error', e => errors.push(e.message)); w.Views = {};
  w.API = { get: async url => /analyse/.test(url) ? ui : /markets/.test(url) ? { markets: [] } : /signals/.test(url) ? { signals: [] } : {},
    post: async (url, b) => { body = b; return { saved: 1 }; }, put: async () => ({ ok: true }) };
  w.TV = { ok: false, link: () => '#', planText: (s, tf, c) => { copied = c; return 'fixture'; }, copy() {},
    fallback: () => w.document.createElement('div'), mini: () => w.document.createElement('div') };
  w.App = { refresh() { try { w.Views.bots.render(w.document.getElementById('root')); } catch(e) { errors.push(e.message); } },
    toast() {}, goto() {}, openTrade: (id, p) => { logged = p; } };
  for (const p of ['util.js', 'store.js']) w.eval(fs.readFileSync(path.join(APP, 'public/js', p), 'utf8'));
  w.Store.user = { settings: { timezone: 'UTC' } }; w.Store.accounts = []; w.Store.strategies = []; w.Store.instruments = [];
  w.Store.queryParams = () => ({});
  w.eval(fs.readFileSync(path.join(APP, 'public/js/views/bots.js'), 'utf8'));
  const root = w.document.getElementById('root');
  async function render() { w.__botRequest = { symbol: 'TEST', tf: '15m' }; await w.Views.bots.render(root); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); }
  const button = name => [...root.querySelectorAll('button')].find(b => b.textContent === name);
  await render(); const refusedSave = button('Nothing eligible to save'); button('Copy plan')?.click();
  ok('actual browser Copy/Save cannot promote the refused runner-rescued candidate', refusedSave?.disabled && !copied && !body);
  ok('actual browser displays first-target floor/refusal, not final runner as permission',
    /First-target RR floor: 1\.5000R \/ 2R — refused/.test(root.textContent));
  ui = uiAllowed; await render(); button('Copy plan')?.click();
  ok('actual browser Copy retains first-target floor snapshot and ladder endpoints',
    copied?.levels.rr_floor?.rule === 'primary_target' && copied.levels.rr_floor.min_rr === 1
    && copied.levels.targets.length > 1 && copied.levels.rr_primary === 1.5);
  const allowedSave = button('Save eligible entry-aligned plan'); allowedSave?.click(); await new Promise(r => setImmediate(r));
  const lc = uiAllowed.setups.candidates.find(c => c.dir === -1), l = lc.levels;
  ok('actual browser Save uses permitted T1/stop/entry, not farther CRT scenario',
    allowedSave && !allowedSave.disabled && body?.entry === l.entry && body.stop === l.stop && body.targets[0].price === l.targets[0].price);
  const logButtons = [...root.querySelectorAll('button')].filter(b => b.textContent === 'Log this plan');
  for (const b of logButtons) { logged = null; b.click(); if (logged?.entry === l.entry) break; }
  ok('actual Log-this-plan payout matches the journal target T1, not rr_final runner',
    logged?.target === l.targets[0].price && logged.planned_r === l.rr_primary && logged.planned_r !== l.rr_final);
  w.navigator.clipboard = { writeText: async x => { text = x; } };
  w.eval(fs.readFileSync(path.join(APP, 'public/js/tv.js'), 'utf8'));
  await w.TV.copy(w.TV.planText('TEST', '15m', lc));
  ok('actual clipboard formatter labels primary floor and final as NOT floor evidence',
    text?.includes('first-target 1.5000R / 1R floor (met)') && text.includes('not floor evidence') && text.includes('[5m]'));
  ok('browser-script composition has no console/runtime errors', errors.length === 0, errors.join('; '));
  console.log('\nScope: optional ladder forced at Setup boundary; not a newly exposed API option. Manual save-plan/journal entry is not an execution authorization or server OHLC validation.');
} catch(e) { fail++; console.error(e.stack); } finally {
  dom?.window.close(); if (server) await new Promise(resolve => server.close(resolve));
  try { await D.db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + suffix); } catch {} }
  const result = { app: APP, pass, fail, cases: results,
    scope: 'Real consumer/auth/browser code, declared IO/CRT/ladder ctx seams; no production, live-provider, native discovery, pixel or manual-save authorization claim.' };
  if (process.env.M71_RESULT) fs.writeFileSync(process.env.M71_RESULT, JSON.stringify(result, null, 2) + '\n');
  console.log(`\nM71 consumers: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
} })();
