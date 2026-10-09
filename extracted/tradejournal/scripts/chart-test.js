'use strict';
/**
 * Chart renderer test — runs public/js/chart.js in Node against a recording
 * 2D-context stub, over real market data, and asserts that:
 *
 *   1. it draws (hundreds of canvas operations, across the full op set),
 *   2. it draws the things that matter (candles, zones, pools, the plan box,
 *      axis labels, the crosshair legend, killzone bands),
 *   3. it never throws on degenerate input (no candles, no SMC, no plan,
 *      a single candle, zero-range prices),
 *   4. the no-canvas fallback still reports the plan in text (jsdom path).
 *
 *   node scripts/chart-test.js
 */
const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------ DOM doubles */
function makeCtx(ops) {
  const rec = (name) => (...args) => { ops.push([name, args]); };
  const grad = { addColorStop() {} };
  return {
    ops,
    setTransform: rec('setTransform'), clearRect: rec('clearRect'),
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'),
    beginPath: rec('beginPath'), closePath: rec('closePath'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    stroke: rec('stroke'), fill: rec('fill'),
    fillText: rec('fillText'), strokeText: rec('strokeText'),
    measureText: (t) => ({ width: String(t).length * 5.5 }),
    createLinearGradient: (...a) => { ops.push(['createLinearGradient', a]); return grad; },
    setLineDash: rec('setLineDash'), save: rec('save'), restore: rec('restore'),
    arc: rec('arc'), rect: rec('rect'),
    font: '10px monospace', textBaseline: 'alphabetic',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
  };
}

function makeEl(tag, ctxOps) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [], style: {}, dataset: {}, _text: '', _html: '',
    clientWidth: 900, clientHeight: 460,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 460 }; },
    getContext() { return makeCtx(ctxOps); },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
  };
  el.style = {};
  return el;
}

function loadChart() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'chart.js'), 'utf8');
  const win = {
    devicePixelRatio: 2,
    innerWidth: 1400, innerHeight: 900,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    location: { href: 'http://localhost/' },
    document: {
      createElement: (t) => makeEl(t, []),
      body: makeEl('body', []),
    },
  };
  const fn = new Function('window', 'document', 'setTimeout', code + '\n;return window.Chart;');
  return { Chart: fn(win, win.document, setTimeout), win };
}

/* ------------------------------------------------------------- fixtures */
const C = require('../src/candles');
const SMC = require('../src/bots/smc');
const Setup = require('../src/bots/setup');
const TD = require('../src/bots/topdown');
const ChartServer = require('../src/bots/index');   // the payload the endpoint returns

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  console.log(` ${cond ? 'ok  ' : 'FAIL'} ${label}${cond || detail === undefined ? '' : ' — ' + detail}`);
  cond ? pass++ : fail++;
};

(async () => {
  const { Chart } = loadChart();
  ok('Chart global exposes render + mini', typeof Chart.render === 'function' && typeof Chart.mini === 'function');

  const markets = [['XAUUSD', '1h'], ['EURUSD', '15m'], ['BTCUSDT', '4h']];

  for (const [symbol, tf] of markets) {
    const { candles, meta } = await C.getCandles(symbol, tf, { limit: 500 });
    const smc = SMC.analyse(candles, { tf });
    const L = TD.layersFor(tf);
    const layers = await Promise.all([L.bias_tf, L.trigger_tf].map((t) => (t === tf ? null : C.getCandles(symbol, t, { limit: 300 }))));
    const biasRow = L.bias_tf === tf ? { candles, meta: {} } : { candles: layers[0].candles, meta: layers[0].meta };
    const trigRow = L.trigger_tf === tf ? { candles, meta: {} } : (layers[1] ? { candles: layers[1].candles, meta: layers[1].meta } : { candles, meta: {} });
    const td = TD.build({
      symbol, tf,
      series: { tf, candles, smc, price: candles[candles.length - 1].c, atr: smc.atr, ind: null },
      biasSeries: { tf: L.bias_tf, candles: biasRow.candles, smc: SMC.analyse(biasRow.candles, { tf: L.bias_tf }), atr: smc.atr },
      triggerSeries: { tf: L.trigger_tf, candles: trigRow.candles, smc: SMC.analyse(trigRow.candles, { tf: L.trigger_tf }) },
    });
    smc.crt = require('../src/bots/momentum').crtView(td, tf);
    const setups = Setup.buildSetups(smc, { price: candles[candles.length - 1].c, atr: smc.atr, bias: td.direction, minRR: 2, topdown: td });
    const plan = (td.crt_plan && td.direction !== 0)
      ? { source: 'crt', dir: td.crt_plan.dir, side: td.crt_plan.side, entry: td.crt_plan.safer.entry, stop: td.crt_plan.safer.stop, targets: [{ price: td.crt_plan.safer.target, rr: td.crt_plan.safer.rr, role: 'T1' }], entry_status: td.status }
      : (setups.candidates[0] && setups.candidates[0].levels ? { source: 'setup', ...setups.candidates[0].levels } : null);

    /* --- full render, all overlays on -------------------------------- */
    const ops = [];
    const localWin = {
      devicePixelRatio: 2, innerWidth: 1400, innerHeight: 900,
      addEventListener() {}, requestAnimationFrame: (fn) => fn(),
    };
    const localDoc = { createElement: (t) => makeEl(t, ops), body: makeEl('body', ops) };
    const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'chart.js'), 'utf8');
    const fn = new Function('window', 'document', 'setTimeout', code + '\n;return window.Chart;');
    const chart = fn(localWin, localDoc, (f) => f());

    let el = null, threw = null;
    try {
      el = chart.render({ candles, smc, plan, symbol, timeframe: tf, meta, height: 460 });
    } catch (e) { threw = e; }
    ok(`${symbol} ${tf}: full render does not throw`, !threw, threw && threw.message);
    if (threw) continue;

    const count = (name) => ops.filter(([n]) => n === name).length;
    const texts = ops.filter(([n]) => n === 'fillText').map(([, a]) => String(a[0]));
    ok(`${symbol} ${tf}: draws candles (fillRect ≥ bars)`, count('fillRect') > 100, `fillRect=${count('fillRect')}`);
    ok(`${symbol} ${tf}: draws wicks (moveTo/lineTo stroke pairs)`, count('moveTo') > 100 && count('stroke') > 40, `moveTo=${count('moveTo')} stroke=${count('stroke')}`);
    ok(`${symbol} ${tf}: writes axis + zone labels`, count('fillText') > 20, `fillText=${count('fillText')}`);
    ok(`${symbol} ${tf}: price axis prints numbers`, texts.some((t) => /\d/.test(t) && t.length <= 12));
    ok(`${symbol} ${tf}: the dealing range is marked (EQ 50%)`, texts.some((t) => /EQ 50%/.test(t)));
    const bands = ops.filter(([n]) => n === 'createLinearGradient').length;
    ok(`${symbol} ${tf}: session bands are shaded`, bands >= 1, `gradient bands=${bands}`);
    // labels only where a band spans at least three bars (a 3h window is a
    // sliver of a 4h chart) — intraday timeframes must carry the captions
    if (['1m', '5m', '15m', '30m'].includes(tf)) {
      ok(`${symbol} ${tf}: killzones are labelled on an intraday chart`, texts.some((t) => /KZ|Asia|London|NY/.test(t)),
        texts.filter((t) => /KZ|Asia|London|NY/.test(t)).slice(0, 3).join(' | '));
    }
    if (plan) {
      ok(`${symbol} ${tf}: the plan is boxed (entry/stop/targets)`,
        texts.some((t) => /entry/.test(t)) && texts.some((t) => /^stop/.test(t)) && texts.some((t) => /^T\d/.test(t)),
        texts.filter((t) => /entry|stop|^T\d/.test(t)).slice(0, 4).join(' | '));
    }
    ok(`${symbol} ${tf}: structure/liquidity tags appear`, texts.some((t) => /BSL|SSL|FVG|DEMAND|SUPPLY|BOS|MSS|CHoCH/.test(t)),
      texts.filter((t) => /BSL|SSL|FVG|DEMAND|SUPPLY|BOS|MSS|CHoCH/.test(t)).slice(0, 3).join(' | '));

    /* --- degenerate inputs ------------------------------------------- */
    const bad = [];
    const tries = [
      ['no candles', { candles: [], smc, plan, symbol, timeframe: tf }],
      ['no smc', { candles, smc: null, plan, symbol, timeframe: tf }],
      ['no plan', { candles, smc, plan: null, symbol, timeframe: tf }],
      ['one candle', { candles: candles.slice(-1), smc, plan, symbol, timeframe: tf }],
      ['zero-range candles', { candles: candles.slice(-20).map((b) => ({ ...b, o: 100, h: 100, l: 100, c: 100 })), smc, plan, symbol, timeframe: tf }],
      ['plan with no targets', { candles, smc, plan: { entry: 100, stop: 99, targets: [] }, symbol, timeframe: tf }],
    ];
    tries.forEach(([label, arg]) => {
      try { chart.render(arg); } catch (e) { bad.push(`${label}: ${e.message}`); }
    });
    ok(`${symbol} ${tf}: degenerate inputs are handled (6 cases)`, bad.length === 0, bad.join(' · '));

    /* --- mini chart -------------------------------------------------- */
    let miniThrew = null;
    try { chart.mini({ candles, label: 'H4', sub: 'bias', levels: [{ price: smc.premium_discount ? smc.premium_discount.mid : 0, text: 'EQ' }] }); }
    catch (e) { miniThrew = e; }
    ok(`${symbol} ${tf}: mini chart renders`, !miniThrew, miniThrew && miniThrew.message);
  }

  /* --- the no-canvas fallback (jsdom / text-only environments) -------- */
  const noCtxWin = {
    devicePixelRatio: 1, innerWidth: 900, innerHeight: 700,
    addEventListener() {}, requestAnimationFrame: (f) => f(),
  };
  const fallbackEl = makeEl('div', []);
  fallbackEl.getContext = () => null;
  const noCtxDoc = {
    createElement: (t) => { const e = makeEl(t, []); if (t === 'canvas') e.getContext = () => null; return e; },
    body: fallbackEl,
  };
  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'chart.js'), 'utf8');
  const fn2 = new Function('window', 'document', 'setTimeout', code + '\n;return window.Chart;');
  const chart2 = fn2(noCtxWin, noCtxDoc, (f) => f());
  const { candles } = await C.getCandles('EURUSD', '1h', { limit: 300 });
  const smc = SMC.analyse(candles, { tf: '1h' });
  const el = chart2.render({ candles, smc, plan: { levels: { entry: 1.1, stop: 1.09, targets: [{ price: 1.12, rr: 2 }] } }, symbol: 'EURUSD', timeframe: '1h' });
  const walk = (node, out = []) => {
    if (!node) return out;
    if (node._text) out.push(node._text);
    (node.children || []).forEach((c) => walk(c, out));
    return out;
  };
  const flat = walk(el).join(' | ');
  ok('no-canvas environments get a text fallback naming the plan', /entry 1\.1/.test(flat) && /2R/.test(flat), flat.slice(0, 200));

  console.log(`\nCHART TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CHART TEST CRASH:', e); process.exit(2); });
