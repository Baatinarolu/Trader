'use strict';
/** M33: HTF narrative != bounded MTF counter-pullback execution.
 * Controlled structural-input fixtures, never market data or an edge claim.
 * TJ_APP selects the pre-M33 app; core/consumer assertions fail without crashing.
 * Orchestration/storage run only in an isolated SQLite database with frame IO stubbed.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const file = path.join(os.tmpdir(), `m33-${process.pid}.db`);
delete process.env.TURSO_DATABASE_URL;
delete process.env.LIBSQL_URL;
delete process.env.TURSO_AUTH_TOKEN;
process.env.TRADEJOURNAL_DB = file;
const TD = require(path.join(APP, 'src/bots/topdown'));
const SU = require(path.join(APP, 'src/bots/setup'));
const SMC = require(path.join(APP, 'src/bots/smc'));
const Mom = require(path.join(APP, 'src/bots/momentum'));
const Now = require(path.join(APP, 'src/bots/now'));
const make = require('./helpers/countertrend-fixture');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(' ok   ' + name); }
  else { fail++; console.log(' FAIL ' + name + (detail ? ' — ' + detail : '')); }
};
function fresh(dir = -1) {
  const f = make(dir);
  for (const x of [f.input.series, f.input.biasSeries, f.input.triggerSeries]) x.smc.sessions = SMC.sessionState(new Date(f.END));
  return f;
}
function read(f, opts = {}) {
  const td = TD.build({ ...f.input, opts });
  const align = Mom.alignment(f.input.biasSeries, f.input.series, f.input.triggerSeries, td);
  const setups = SU.buildSetups(f.input.series.smc, { price: f.input.series.price, atr: 1,
    bias: f.htfDir, indicators: f.input.series.ind, topdown: td, balance: 10000, riskPct: .5,
    valuePerPoint: 1, assetClass: 'stocks', minRR: 2 });
  const candidate = setups.candidates.find((c) => c.dir === f.execDir);
  const now = Now.build({ td, setups, series: f.input.series, symbol: 'TEST', tf: '15m', nowMs: f.END });
  return { td, align, setups, candidate, now };
}
const HAS = !!read(fresh()).td.countertrend;
console.log('=== 1. Both explicit structural-input directions, final consumers included ===');
for (const dir of [-1, 1]) {
  const f = fresh(dir), r = read(f), name = dir < 0 ? 'HTF long / MTF short' : 'HTF short / MTF long';
  const action = dir > 0 ? 'BUY' : 'SELL';
  ok(name + ': the prescribed roles are distinct and the break is confirmed',
    f.input.biasSeries.tf === '4h' && f.input.series.tf === '15m' && f.input.triggerSeries.tf === '5m'
    && f.input.series.smc.structure.last_break.dir === (dir > 0 ? 'up' : 'down'));
  ok(name + ': the MTF internal shift can originate the counter execution',
    r.td.direction === dir && !r.td.blocked && r.td.countertrend && r.td.countertrend.kind === 'internal-pullback', r.td.headline);
  ok(name + ': the daily narrative is unchanged, not the execution sign', r.align.bias === f.htfDir, `${r.align.bias}`);
  ok(name + ': final summary AND visible order use the permitted execution',
    r.setups.verdict.action === action && r.now.action === action && r.now.armed, `${r.setups.verdict.action}/${r.now.action}`);
  ok(name + ': exactly ONE target is the nearest HTF opposing zone',
    r.candidate.levels && r.candidate.levels.targets.length === 1
    && r.candidate.levels.targets[0].kind === 'htf_order_block' && r.candidate.levels.targets[0].tf === '4h'
    && r.candidate.levels.targets[0].price === f.target, JSON.stringify(r.candidate.levels && r.candidate.levels.targets));
  ok(name + ': order prices are EXACTLY the actual candidate, not a parallel CRT plan',
    r.now.order && r.now.order.entry === r.candidate.levels.entry && r.now.order.stop === r.candidate.levels.stop
    && r.now.order.target === r.candidate.levels.targets[0].price);
  ok(name + ': confirmed A does NOT mean full counter-trend risk',
    r.candidate.risk && r.candidate.risk.method_risk_multiplier === .5
    && r.candidate.risk.risk_pct === r.candidate.risk.risk_pct_ordinary * .5 && r.now.full_risk === false);
  ok(name + ': the lower sweep, not the MTF sweep, defines the stop geometry',
    r.candidate.levels && Math.abs(r.candidate.levels.stop - (dir < 0 ? 97.18 : 102.82)) < 1e-8,
    String(r.candidate.levels && r.candidate.levels.stop));
  ok(name + ': the model is not falsely named/represented as CRT',
    /internal/i.test(r.td.method.name) && r.td.crt_plan === null && Mom.crtView(r.td, '15m') === null);
}

console.log('\n=== 2. Every prerequisite gets its own negative control ===');
const guardCases = [
  ['HTF ranging never yields an MTF-originated counter order', (f) => { f.input.biasSeries.smc.structure.trend = 'ranging'; }],
  ['MTF label alone, with no break event, cannot originate execution', (f) => { f.input.series.smc.structure.last_break = null; }],
  ['a wrong-direction MTF break cannot masquerade as the internal shift', (f) => { f.input.series.smc.structure.last_break.dir = 'up'; }],
  ['a future MTF event is not observed evidence', (f) => { f.input.series.smc.structure.last_break.t = f.END + 900000; }],
  ['no HTF opposing zone means no invented target', (f) => { f.input.biasSeries.smc.order_blocks = []; }],
  ['a target zone formed AFTER the MTF shift is not its pre-existing magnet', (f) => { f.input.biasSeries.smc.order_blocks[0].t = f.END; }],
  ['no MTF OB means no standalone-FVG counter entry', (f) => { f.input.series.smc.order_blocks = []; }],
  ['no lower sweep cannot borrow the MTF sweep', (f) => { f.input.triggerSeries.smc.sweeps = []; }],
  ['no lower structural shift cannot be replaced by displacement', (f) => {
    f.input.triggerSeries.smc.structure.last_break = null;
    f.input.triggerSeries.smc.displacement = [{ dir: -1, t: f.END - 300000, i: 118, rangeAtr: 2, bodyRatio: .9 }];
  }],
  ['a lower shift BEFORE its sweep is not the required sequence', (f) => { f.input.triggerSeries.smc.sweeps[0].t = f.END - 300000; }],
  ['future LTF confirmation is not observed evidence', (f) => { f.input.triggerSeries.smc.structure.last_break.t = f.END + 300000; }],
  ['one reused timeframe is not three mandatory roles', (f) => { f.input.triggerSeries.tf = '15m'; }],
  ['M3 recent expansion remains a refusal even at the zone', (f) => { f.input.series.smc.structure.last_break.bars_ago = 2; }],
  ['M26 chosen-window restriction still refuses the otherwise valid counter order', null],
  ['an untouched MTF POI cannot be front-run from the lower chart', (f) => {
    f.input.series.price = f.input.series.smc.price = 95.6;
    for (const b of f.input.series.candles) if (b.t >= f.input.series.smc.structure.last_break.t) { b.h = 95.8; b.l = 95; b.c = 95.6; b.o = 95.6; }
  }],
];
for (const [label, mutate] of guardCases) {
  const f = fresh(); if (mutate) mutate(f);
  const r = read(f);
  if (!mutate) {
    const s = SU.buildSetups(f.input.series.smc, { price: 96.5, bias: 1, topdown: r.td, sessionPref: 'ny_am' });
    ok(label, s.verdict.action === 'NO TRADE' && s.candidates.every((c) => !c.ok));
  } else {
    ok(label, r.setups.verdict.action === 'NO TRADE' && !r.now.armed, `${r.setups.verdict.action}/${r.now.action}`);
  }
}
if (HAS) {
  let f = fresh(); f.input.series.smc.sweeps = [];
  ok('a valid LOWER sweep is sufficient when the MTF has no sweep of its own', read(f).setups.verdict.action === 'SELL');
  f = fresh(); f.input.series.smc.structure.trend = 'bullish';
  ok('confirmed MTF break, not a lagging trend label, supplies execution', read(f).setups.verdict.action === 'SELL');
  f = fresh(); const deeper = { ...f.input.biasSeries.smc.order_blocks[0], bottom: 89, top: 90.5, mid: 89.75 };
  f.input.biasSeries.smc.order_blocks.push(deeper);
  f.input.series.candles.at(-2).l = f.target - .1;
  const hit = read(f);
  ok('a reached target completes the pullback instead of switching to a farther HTF zone',
    hit.td.countertrend.completed && hit.td.countertrend.target.price === f.target && !hit.now.armed);
  f = fresh();
  const oldDead = { ...f.input.biasSeries.smc.order_blocks[0], bottom: 95, top: 95.5,
    t: f.END - 30 * 14400000, breached: true };
  f.input.biasSeries.smc.order_blocks.unshift(oldDead);
  const oldBar = f.input.biasSeries.candles.find((b) => b.t > oldDead.t);
  oldBar.c = oldBar.l = 94.5;
  const valid = read(f);
  ok('an HTF zone proven obsolete BEFORE the shift is not this leg’s permanent target',
    valid.td.countertrend && valid.td.countertrend.target.price === f.target && valid.setups.verdict.action === 'SELL');
  f = fresh(); const r = read(f);
  r.td.countertrend.target.price = 96.4; // isolated consumer-floor test, not a claimed market fixture
  const tiny = SU.buildSetups(f.input.series.smc, { price: 96.5, bias: 1, topdown: r.td, minRR: 2 });
  const c = tiny.candidates.find((c) => c.dir === -1);
  ok('the ACTUAL bounded target fails the RR floor; no farther pool replaces it',
    !c.ok && c.levels.targets.length === 1 && c.levels.targets[0].price === 96.4 && tiny.verdict.action === 'NO TRADE');
  const ladder = SU.buildSetups(fresh().input.series.smc, { price: 96.5, bias: 1, topdown: read(fresh()).td, ladderTargets: true });
  ok('even the optional ladder cannot run a counter leg beyond its one HTF target', ladder.candidates.find((c) => c.dir === -1).levels.targets.length === 1);
  const small = SU.buildSetups(fresh().input.series.smc, { price: 96.5, bias: 1, topdown: read(fresh()).td,
    balance: 10000, riskPct: .01, valuePerPoint: 1 });
  const risk = small.candidates.find((c) => c.dir === -1).risk;
  ok('0.005% is not rounded back up to 0.01%, cancelling half risk', risk.risk_pct === .005, String(risk.risk_pct));
} else {
  for (const label of ['LTF sweep consumed instead of MTF sweep', 'break overrides lagging MTF label',
    'target completion cannot move farther', 'bounded-target RR floor consumed', 'counter ladder remains one target',
    'tiny risk reduction survives rounding']) ok(label, false, 'counter path absent in this tree');
}

console.log('\n=== 2b. Old CRT priority and actual counter-CRT risk consumption ===');
{
  const f = fresh();
  const t = f.END - 4 * 14400000;
  const bar = (t, o, h, l, c) => ({ t, o, h, l, c, v: 100 });
  f.input.biasSeries.candles = [bar(t - 14400000, 95, 96, 94.8, 95),
    bar(t, 94.2, 94.6, 93.6, 94.4), bar(t + 14400000, 94.4, 94.9, 94.45, 94.6)];
  f.input.biasSeries.smc.liquidity.pools = [{ type: 'SSL', price: 94, strength: .9, label: 'HTF swing low' }];
  f.input.series.candles = [bar(t + 900000, 94.3, 94.4, 93, 94.3),
    bar(t + 1800000, 93.9, 94, 93.8, 93.95), bar(t + 2700000, 93.95, 94.05, 93.9, 94)];
  f.input.series.price = f.input.series.smc.price = 94;
  const legacy = TD.build(f.input);
  ok('a real confirmed HTF-CRT keeps priority over the other MTF direction',
    legacy.direction === 1 && legacy.crt_plan && !legacy.countertrend, legacy.headline);
  f.input.series.candles.push(bar(t + 3600000, 94, 96, 93.9, 94));
  const chop = TD.build(f.input);
  ok('a both-sides HTF-CRT block is NOT bypassed by M33', chop.blocked && !chop.countertrend, chop.headline);

  const normal = fresh();
  const td = { direction: -1, status: 'confirmed', blocked: false, steps: [],
    layers: { bias: { tf: '4h' } }, conviction: { tier: 'A' },
    conflicts: [{ kind: 'counter-trend-crt', blocks_trade: false }],
    crt_plan: { aggressive: { entry: 96.5, stop: 97.78, target: 90, rr: 5.08 },
      safer: { entry: 96.8, stop: 97.78, target: 90, rr: 6.94 }, range: { low: 90, high: 98 } } };
  const setups = SU.buildSetups(normal.input.series.smc, { price: 96.5, bias: 1, topdown: td,
    balance: 10000, riskPct: .5, valuePerPoint: 1 });
  const c = setups.candidates.find((x) => x.dir === -1);
  const n = Now.build({ td, setups, series: normal.input.series, symbol: 'TEST', tf: '15m', nowMs: normal.END });
  ok('legacy counter-CRT’s promised half risk now reaches actual sizing, not just prose',
    c.risk && c.risk.method_risk_multiplier === .5 && c.risk.risk_pct === .25);
  // M77 deliberately replaces the parallel safer/aggressive order with the
  // actual eligible candidate; M33's counter-CRT HALF-RISK promise must survive.
  ok('M77 confirmed counter-CRT uses the actual candidate geometry, still at half risk',
    n.order && n.order.mode === 'entry-aligned' && n.order.entry === c.levels.entry
    && n.order.stop === c.levels.stop && n.order.target === c.levels.targets[0].price
    && n.order.risk_pct === c.risk.risk_pct && n.full_risk === false);
}

console.log('\n=== 3. Actual orchestration, state, chart, scan, and signal storage ===');
(async () => {
  const Db = require(path.join(APP, 'src/db'));
  await Db.ready;
  try {
    if (!HAS) {
      for (const label of ['Momentum.analyse forwards counter metadata', 'analyse preserves daily bias and executes pullback',
        'chart preserves daily bias', 'chart/analysis order prices agree', 'scan preserves daily bias',
        'held-context disagreement cannot bypass M50', 'signal storage consumes ok', 'saved counter signal has no legacy p_win'])
        ok(label, false, 'counter execution absent');
    } else {
      const Market = require(path.join(APP, 'src/market'));
      const Bots = require(path.join(APP, 'src/bots'));
      Market.getCalendar = async () => ({ events: [] });
      let current = fresh();
      const load = async (symbol, tf) => ({ '4h': current.input.biasSeries, '15m': current.input.series, '5m': current.input.triggerSeries }[tf]);
      const original = Mom.analyse;
      Mom.analyse = (symbol, tf, opts) => original(symbol, tf, { ...opts, seriesLoader: load });
      Mom.series = load;
      let uiData = null, uiChart = null;
      for (const dir of [-1, 1]) {
        current = fresh(dir);
        const level = dir < 0 ? 91.8 : 108.2;
        await Db.clearBiasState('TEST', '15m');
        await Db.setBiasState({ symbol: 'TEST', tf: '15m', bias: current.htfDir,
          invalidation_level: level, invalidation_side: current.htfDir > 0 ? 'below' : 'above',
          since_t: current.END - 86400000, age_bars: 3 });
        const a = await Bots.analyse('TEST', '15m', { includePrediction: false, balance: 10000, riskPct: .5, nowMs: current.END });
        ok(`dir ${dir}: actual Momentum.analyse whitelist retains the counter read and blockers`,
          a.topdown.countertrend && Array.isArray(a.topdown.conflicts) && a.topdown.countertrend.dir === dir);
        ok(`dir ${dir}: API orchestration preserves daily narrative but arms counter execution`,
          a.momentum.bias === current.htfDir && a.momentum.bias_fresh === current.htfDir
          && a.momentum.execution_direction === dir && a.now.side === dir && a.now.armed);
        const row = await Db.getBiasState('TEST', '15m');
        ok(`dir ${dir}: repeated execution does NOT move or flip the stored daily plan`,
          row.bias === current.htfDir && row.invalidation_level === level);
        const ch = await Bots.chart('TEST', '15m', { bars: 200, balance: 10000, riskPct: .5, nowMs: current.END });
        const afterChart = await Db.getBiasState('TEST', '15m');
        ok(`dir ${dir}: chart path also preserves the original defining anchor`,
          afterChart.bias === current.htfDir && afterChart.invalidation_level === level);
        ok(`dir ${dir}: chart/analysis action AND execution prices match`,
          ch.now.action === a.now.action && ch.now.side === a.now.side && ch.now.order.entry === a.now.order.entry
          && ch.now.order.stop === a.now.order.stop && ch.now.order.target === a.now.order.target);
        if (dir === -1) { uiData = a; uiChart = ch; }
        ok(`dir ${dir}: chart draws the permitted bounded plan, not the opposite raw score`,
          ch.plan && ch.plan.source === 'countertrend-pullback' && ch.plan.targets[0].price === current.target);
        const scan = await Bots.scan(['TEST'], '15m');
        ok(`dir ${dir}: scan carries separate narrative and execution signs`,
          scan.rows.length === 1 && scan.rows[0].bias === current.htfDir && scan.rows[0].execution_direction === dir
          && scan.rows[0].action === (dir > 0 ? 'BUY' : 'SELL'));
      }
      current = fresh();
      await Db.setBiasState({ symbol: 'TEST', tf: '15m', bias: -1, invalidation_level: 110,
        invalidation_side: 'above', since_t: current.END - 86400000, age_bars: 5 });
      const held = await Bots.analyse('TEST', '15m', { includePrediction: false });
      ok('a genuinely HELD opposite narrative blocks the fresh counter context, never resets it',
        held.momentum.bias === -1 && held.momentum.bias_hysteresis.held && held.now.action === 'NO TRADE');
      const user = await Db.createUser({ email: `m33-${process.pid}@test.local`, password: 'fixture-only', name: 'M33 fixture' });
      const userId = user.userId;
      const rejected = await Bots.saveSignals(userId, held);
      ok('signal storage rejects a good letter with ok=false', rejected.saved === 0, String(rejected.saved));
      await Db.clearBiasState('TEST', '15m');
      const approved = await Bots.analyse('TEST', '15m', { includePrediction: false });
      approved.prediction = { setups: [{ dir: -1, p_win: 99 }] }; // NOT calibrated for this new target/model
      const saved = await Bots.saveSignals(userId, approved);
      const stored = saved.saved ? await Db.db.prepare('SELECT dir,t1,t2,p_win FROM bot_signals WHERE id=?').get(saved.ids[0]) : null;
      ok('a permitted counter signal stores exactly its bounded target', saved.saved === 1 && stored.t1 === current.target && stored.t2 === null);
      ok('legacy-target probabilities are NOT attached to the new counter model', stored && stored.p_win === null);
      await Db.clearWorkspace(userId);
      const { JSDOM, VirtualConsole } = require(path.join(APP, 'node_modules/jsdom'));
      const errors = [], vc = new VirtualConsole();
      vc.on('jsdomError', (e) => errors.push(e.message));
      const dom = new JSDOM('<div id="root"></div>', { url: 'https://preview.example/',
        runScripts: 'outside-only', virtualConsole: vc });
      const w = dom.window, root = w.document.getElementById('root');
      let copied = null;
      w.Store = { user: { settings: {} }, instruments: [], accounts: [], strategies: [], filters: {} };
      w.__botRequest = { symbol: 'TEST', tf: '15m' };
      w.API = { get: (url) => Promise.resolve(url === '/bots/analyse' ? uiData
        : url === '/bots/chart' ? uiChart : url === '/chart/drawings' ? { drawings: [] } : {}),
        post: async () => ({}), put: async () => ({}) };
      w.App = { refresh: () => { try { w.Views.bots.render(root); } catch (e) { errors.push(e.message); } }, toast: () => {}, go: () => {} };
      w.TV = { link: () => '#', planText: (sym, tf, c) => c, copy: (v) => { copied = v; } };
      w.Chart = { render: () => w.document.createElement('div'), mini: () => w.document.createElement('div') }; // rendering physics are chart-test's job
      w.eval(fs.readFileSync(path.join(APP, 'public/js/util.js'), 'utf8'));
      w.eval(fs.readFileSync(path.join(APP, 'public/js/views/bots.js'), 'utf8'));
      w.Views.bots.render(root);
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      const text = root.textContent;
      ok('actual bots view renders the counter method without JS errors', errors.length === 0, errors.join('; '));
      ok('UI says counter-pullback, not daily-bias reset or CRT', /Counter-HTF internal pullback — not a daily-bias reset/.test(text));
      ok('UI makes the one bounded target and reduced risk visible', /ONE target: 4h demand/.test(text) && /half ordinary same-grade risk/.test(text));
      const button = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Copy plan');
      ok('Copy plan is enabled only for the eligible execution', !!button && !button.disabled);
      if (button) button.click();
      ok('the copied plan preserves execution side and bounded target', copied && copied.dir === -1 && copied.levels.targets[0].price === uiData.now.order.target);
      dom.window.close();
    }
    await Db.clearBiasState('TEST', '15m');
  } finally {
    if (Db.client && Db.client.close) Db.client.close();
    for (const p of [file, file + '-wal', file + '-shm']) { try { fs.unlinkSync(p); } catch {} }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
