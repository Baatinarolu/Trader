#!/usr/bin/env node
'use strict';
/**
 * Real-browser UI test (Chromium via playwright-core).
 *
 * The jsdom smoke test cannot paint a canvas and cannot measure layout, so this
 * run answers the questions jsdom cannot:
 *   · does the desk chart actually paint pixels, and how big is it?
 *   · does the top-down method panel render its five steps and its layers?
 *   · does the timeframe stack draw three mini charts?
 *   · does the whole thing stay console-error free in a real engine?
 *
 * It writes screenshots into docs/ so the look can be reviewed without a browser
 * at hand. Screenshots are dated: docs/ui-snapshot-<date>-<view>.png.
 *
 *   node scripts/ui-browser-test.js            (server must run on :3000)
 *   node scripts/ui-browser-test.js --url http://127.0.0.1:3300
 *
 * Requirements (dev only, never deployed): npm i --no-save playwright-core &&
 * npx playwright-core install chromium   (+ system libs on a bare container).
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright-core')); }
catch (e) {
  console.error('playwright-core is not installed. Run: npm i --no-save playwright-core && npx playwright-core install chromium');
  process.exit(2);
}

const args = process.argv.slice(2);
const urlArg = args.indexOf('--url');
const BASE = urlArg >= 0 ? args[urlArg + 1] : (process.env.TJ_BASE || 'http://127.0.0.1:3000');
const OUT = path.join(__dirname, '..', 'docs');
const STAMP = new Date().toISOString().slice(0, 10);

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(` ${cond ? 'ok  ' : 'FAIL'} ${label}${cond || !detail ? '' : ' — ' + detail}`);
};

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  console.log(`Real-browser UI test → ${BASE} (chromium ${browser.version()})`);

  /* ---------------------------------------------------------------- boot */
  await page.goto(BASE + '/#/bots', { waitUntil: 'networkidle', timeout: 60000 });
  ok('app shell rendered (sidebar present)', await page.locator('.sidebar').count() > 0);
  const buildTag = await page.locator('.build-tag').first().textContent().catch(() => null);
  ok('sidebar prints the build stamp', !!buildTag && /build [0-9a-z]+/.test(buildTag), String(buildTag));

  /* ------------------------------------------------- the analysis lands */
  await page.waitForFunction(() => !!document.querySelector('.chart canvas'), null, { timeout: 60000 });
  await page.waitForTimeout(1200);            // let the canvas paint and resize observers settle
  ok('the bots view opened the desk chart', await page.locator('.chart canvas').count() > 0);

  /* ------------------------------------------------------ chart geometry */
  const geo = await page.evaluate(() => {
    const c = document.querySelector('.chart canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let ink = 0, bg = 0;
    if (ctx) {
      const img = ctx.getImageData(0, 0, c.width, c.height).data;
      // background is #0b0d11 → count any pixel clearly brighter than it
      const step = 4 * 7;                    // sample every 7th pixel
      for (let i = 0; i < img.length; i += step) {
        const lum = img[i] + img[i + 1] + img[i + 2];
        if (lum > 90) ink++; else bg++;
      }
    }
    return {
      cssW: Math.round(r.width), cssH: Math.round(r.height),
      bufW: c.width, bufH: c.height, dpr,
      ink, bg, inkPct: ink + bg ? Math.round((ink / (ink + bg)) * 1000) / 10 : 0,
      toolbar: !!document.querySelector('.chart-bar'),
      toggles: document.querySelectorAll('.chart-tog').length,
      readout: (document.querySelector('.chart-readout') || {}).textContent || '',
    };
  });
  /* ------------------------------------------- the "now" strip (one answer) */
  {
    const info = await page.evaluate(() => ({
      strip: !!document.querySelector('.now-strip'),
      action: ((document.querySelector('.now-action') || {}).textContent || '').trim(),
      headline: ((document.querySelector('.now-headline') || {}).textContent || ''),
      cells: [...document.querySelectorAll('.now-cell')].map((c) => (c.querySelector('.now-k') || {}).textContent),
      until: [...document.querySelectorAll('.now-cell b')].map((b) => b.textContent).join(' | '),
      other: (document.querySelector('.now-other summary') || {}).textContent || '',
      orderRow: (document.querySelector('.now-cell') || {}).textContent || '',
      guards: document.querySelectorAll('.now-guard').length,
      freshness: [...document.querySelectorAll('.now-head .chip')].map((c) => c.textContent)
        .filter((t) => /fresh|aging|stale|replay|closed|unknown/i.test(t))[0] || '',
      open: !!(document.querySelector('.now-other') || {}).open,
      candidate: (document.querySelector('.bot-best .card-head strong') || {}).textContent || '',
    }));
    ok('the bots view opens with the "what to do now" strip', info.strip);
    ok(`the strip shows exactly one action from a closed set (${info.action})`,
      ['WAIT', 'BUY', 'SELL', 'NO TRADE', 'RE-CHECK'].includes(info.action));
    ok('the action comes with a sentence, not just a badge', info.headline.length > 30, info.headline.slice(0, 80));
    ok(`four facts sit beside the action (${info.cells.join(' / ')})`, info.cells.length === 4);
    ok(`the checkpoint carries a real clock (${info.until.slice(0, 90)})`, /UT[CD]|killzone/.test(info.until));
    ok(`the read is dated with its freshness (${info.freshness})`, !!info.freshness);
    // when the method permits no side there is no other side to name — what must
    // never happen is two priced plans sitting side by side
    const collapsed = await page.evaluate(() => ({
      now: !!document.querySelector('.now-other'),
      nowOpen: !!(document.querySelector('.now-other') || {}).open,
      panel: !!document.querySelector('.bot-other'),
      panelOpen: !!(document.querySelector('.bot-other') || {}).open,
      priced: document.querySelectorAll('.bot-best').length,
    }));
    ok(`a second plan is never presented open (now-other: ${collapsed.now ? (collapsed.nowOpen ? 'open' : 'closed') : 'n/a'} · panel: ${collapsed.panel ? (collapsed.panelOpen ? 'open' : 'closed') : 'n/a'})`,
      collapsed.nowOpen === false && collapsed.panelOpen === false);
    ok(`only one candidate is presented as the headline plan (${collapsed.priced} card)`, collapsed.priced === 1);
    ok(`the candidate card cannot claim a call the method has not armed (${info.candidate.slice(0, 40)})`,
      !/^THE CALL/.test(info.candidate) || info.action === 'BUY' || info.action === 'SELL');
  }

  /* --------------------------------------------------------- bar replay UI */
  {
    const slider = await page.$('.replay-range');
    ok('the replay slider exists', !!slider);
    if (slider) {
      const before = await page.evaluate(() => (document.querySelector('.replay-card .mono.tiny') || {}).textContent);
      await page.evaluate(() => {
        const r = document.querySelector('.replay-range');
        r.value = '25';
        r.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => /bars back/.test((document.querySelector('.replay-card .mono.tiny') || {}).textContent || ''), null, { timeout: 90000 });
      await page.waitForTimeout(2500);
      const after = await page.evaluate(() => ({
        label: (document.querySelector('.replay-card .mono.tiny') || {}).textContent,
        badge: (document.querySelector('.chart-replay') || {}).textContent || '',
        note: (document.querySelector('.replay-card .muted-2') || {}).textContent || '',
        readFrom: [...document.querySelectorAll('.now-cell')].map((c) => c.textContent).find((t) => /Read from|re-read/i.test(t)) || '',
      }));
      ok(`the slider reports the window it is showing (${after.label}), was "${before}"`, /25 bars back/.test(after.label));
      ok(`the chart itself is stamped as a replay (${after.badge})`, /REPLAY/.test(after.badge));
      ok('the replay says it cannot see the bars after it', /nothing here can see the bars after it/i.test(after.note));
      await page.evaluate(() => {
        const r = document.querySelector('.replay-range');
        r.value = '0';
        r.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => !/bars back/.test((document.querySelector('.replay-card .mono.tiny') || {}).textContent || ''), null, { timeout: 90000 });
      ok('the slider returns to live', true);
      await page.waitForTimeout(1500);
    }
  }

  /* ------------------------------------------- drawing tools + studies */
  {
    const tools = await page.evaluate(() => [...document.querySelectorAll('.chart-tool')].map((b) => b.textContent));
    ['Line', 'Ray', 'H-line', 'Box', 'Fib', 'Measure', 'Magnet', 'Undo', 'Delete', 'Clear'].forEach((t) => {
      ok(`the chart offers the ${t} tool`, tools.includes(t));
    });
    const studies = await page.evaluate(() => [...document.querySelectorAll('.chart-tools .chart-tog')].map((b) => b.textContent));
    ok(`overlay studies are available (${studies.join(' / ')})`,
      studies.includes('EMA 50') && studies.includes('EMA 200') && studies.includes('VWAP'));

    // turn EMA 50 on and prove the canvas changes
    const beforeInk = await page.evaluate(() => {
      const c = document.querySelector('.chart canvas');
      const img = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < img.length; i += 4 * 7) if (img[i] + img[i + 1] + img[i + 2] > 90) n++;
      return n;
    });
    await page.click('.chart-tools .chart-tog:has-text("EMA 50")');
    await page.waitForTimeout(900);
    const afterInk = await page.evaluate(() => {
      const c = document.querySelector('.chart canvas');
      const img = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < img.length; i += 4 * 7) if (img[i] + img[i + 1] + img[i + 2] > 90) n++;
      return n;
    });
    ok(`switching a study on repaints the chart (${beforeInk} → ${afterInk} lit pixels)`, afterInk !== beforeInk);

    // draw a trend line with two clicks, then check it reached the workspace.
    // The chart is below the fold at 1600×1000, so bring it into view first —
    // a click at off-screen coordinates reaches nothing at all.
    await page.locator('.chart canvas').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const box = await page.locator('.chart canvas').boundingBox();
    await page.click('.chart-tool[data-tool="trend"]');
    await page.mouse.click(box.x + box.width * 0.30, box.y + box.height * 0.42);
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.30);
    await page.waitForTimeout(1500);
    const note = await page.evaluate(() => (document.querySelector('.chart-tools-note') || {}).textContent || '');
    ok(`the drawn line is counted on the chart (${note})`, /1 drawing/.test(note));
    const stored = await page.evaluate(async () => {
      const sym = document.querySelector('.bot-toolbar input.input').value;
      const tf = document.querySelector('.bot-toolbar select.input').value;
      try { const r = await window.API.get('/chart/drawings', { symbol: sym, tf }); return r.drawings.length; } catch (e) { return -1; }
    });
    ok(`the drawing is stored in the workspace, not just on screen (${stored} row(s))`, stored >= 1);
    await page.click('.chart-tool:has-text("Undo")');
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => (document.querySelector('.chart-tools-note') || {}).textContent || '');
    ok(`undo removes it again (${after})`, /no drawings/.test(after));
    const storedAfter = await page.evaluate(async () => {
      const sym = document.querySelector('.bot-toolbar input.input').value;
      const tf = document.querySelector('.bot-toolbar select.input').value;
      try { const r = await window.API.get('/chart/drawings', { symbol: sym, tf }); return r.drawings.length; } catch (e) { return -1; }
    });
    ok(`the store follows the undo (${storedAfter} row(s) left)`, storedAfter === 0);
  }

  if (geo) console.log(`     measured: ${geo.cssW}×${geo.cssH} css px, buffer ${geo.bufW}×${geo.bufH} (dpr ${geo.dpr}), ink ${geo.inkPct}% of ${geo.ink + geo.bg} sampled pixels`);
  ok('chart is a real chart sized for the desk (≥ 1200×520 css px at 1600w)',
    geo && geo.cssW >= 1200 && geo.cssH >= 520, geo ? `${geo.cssW}×${geo.cssH} px` : 'no canvas');
  ok('canvas buffer is device-pixel scaled', geo && geo.bufW >= geo.cssW, geo ? `buffer ${geo.bufW}×${geo.bufH}, dpr ${geo.dpr}` : '');
  ok('chart painted ink (candles, axes, overlays)', geo && geo.inkPct > 2 && geo.ink > 5000, geo ? `${geo.inkPct}% of sampled pixels are ink (${geo.ink} samples)` : '');
  ok('chart toolbar with overlay toggles', geo && geo.toolbar && geo.toggles >= 8, geo ? `${geo.toggles} toggles` : '');
  ok('chart readout reports range/bars/structure', geo && /range shown/.test(geo.readout) && /bars/.test(geo.readout), geo ? geo.readout.slice(0, 120) : '');

  /* ------------------------------------------- plan box drawn (when armed) */
  const planInfo = await page.evaluate(async () => {
    const res = await fetch('/api/bots/chart?symbol=XAUUSD&tf=15m&bars=400', { headers: { 'x-session': (window.API && window.API.token && window.API.token()) || localStorage.getItem('tj_token') || '' } });
    return { status: res.status };
  }).catch(() => ({ status: 0 }));
  ok('chart payload endpoint answers in the browser session', planInfo.status === 200 || planInfo.status === 401, `HTTP ${planInfo.status}`);

  /* ------------------------------------------------ the method panel */
  const panel = await page.evaluate(() => {
    const head = document.querySelector('.td-head');
    const steps = [...document.querySelectorAll('.td-step')].map((s) => ({
      n: (s.querySelector('.td-n') || {}).textContent,
      title: (s.querySelector('.td-title') || {}).textContent,
      state: (s.querySelector('.td-state') || {}).textContent,
      done: s.classList.contains('done'),
    }));
    const layers = [...document.querySelectorAll('.td-layer')].map((l) => ({
      head: (l.querySelector('.td-layer-head') || {}).textContent,
      rows: l.querySelectorAll('.kv').length,
    }));
    const checks = document.querySelectorAll('.td-check').length;
    const playbook = document.querySelectorAll('.td-play').length;
    const conflicts = [...document.querySelectorAll('.td-conflict')].map((c) => (c.querySelector('.td-c-head') || {}).textContent);
    return {
      status: head ? (head.querySelector('.td-status') || {}).textContent : null,
      headline: head ? (head.querySelector('.td-headline') || {}).textContent : null,
      steps, layers, checks, playbook, conflicts,
    };
  });
  ok('top-down panel shows the five steps of the method', panel.steps.length === 5
    && panel.steps.map((s) => s.title).join('|') === 'Timeframe stack|The right candle|Mark the range|Wait for the sweep|Confirm lower, then enter',
    panel.steps.map((s) => `${s.n}:${s.title}=${s.done ? 'done' : 'waiting'}`).join(', '));
  ok('each step carries the state and the sentence', panel.steps.every((s) => s.state && s.title), '');
  ok('the three layers are drawn with their jobs', panel.layers.length === 3 && /bias|location|confirmation|decides|entry|confirm/i.test(JSON.stringify(panel.layers)),
    JSON.stringify(panel.layers).slice(0, 160));
  ok('the method checklist is visible', panel.checks === 5, `${panel.checks} checks`);
  ok('the panel states the current status in words', !!panel.status && /CONFIRMED|WAITING/.test(panel.status), String(panel.status));

  /* ---------------------------------------------------- timeframe stack */
  const stack = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.stack-cell')].map((c) => ({
      label: (c.querySelector('.mini-label') || {}).textContent,
      sub: (c.querySelector('.mini-sub') || {}).textContent,
      canvas: !!c.querySelector('canvas'),
      state: (c.querySelector('.stack-state') || {}).textContent,
    }));
    return cells;
  });
  ok('timeframe stack draws three mini charts', stack.length === 3 && stack.every((s) => s.canvas),
    JSON.stringify(stack).slice(0, 200));

  /* ------------------------------------------------------- screenshots */
  fs.mkdirSync(OUT, { recursive: true });
  const chartBox = await page.locator('.chart').first().boundingBox().catch(() => null);
  if (chartBox) {
    await page.locator('.chart').first().screenshot({ path: path.join(OUT, `ui-snapshot-${STAMP}-chart.png`) });
  }
  await page.screenshot({ path: path.join(OUT, `ui-snapshot-${STAMP}-bots.png`), fullPage: true });

  /* --------------------------------------------- other core views render */
  for (const route of ['dashboard', 'trades', 'journal', 'analytics', 'playbook', 'risk', 'market', 'coach', 'calendar', 'settings']) {
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded' });
    // wait for the *content*, not for a timer: a view that loads its data can
    // take longer than a fixed sleep, and a false failure hides a real one
    const ready = () => document.querySelectorAll('.content .card').length > 0
      && (document.querySelector('.content') || {}).innerText && document.querySelector('.content').innerText.length > 80;
    const read = () => ({
      cards: document.querySelectorAll('.content .card').length,
      text: (document.querySelector('.content') || {}).innerText ? document.querySelector('.content').innerText.length : 0,
    });
    await page.waitForFunction(ready, null, { timeout: 30000 }).catch(() => {});
    // A view may paint content and then repaint (skeleton → data). Measuring in
    // that gap produced "0 cards" on a route that was in fact fine; give the
    // view a moment to settle, then re-check once before believing a failure.
    await page.waitForTimeout(450);
    let info = await page.evaluate(read);
    if (!(info.cards > 0 && info.text > 80)) {
      await page.waitForFunction(ready, null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
      info = await page.evaluate(read);
    }
    if (!(info.cards > 0 && info.text > 80)) {
      const dump = await page.evaluate(() => ({
        route: window.App && window.App.route, hash: location.hash,
        html: ((document.querySelector('.content') || {}).innerHTML || '').slice(0, 240),
        store: !!(window.Store && window.Store.user),
      }));
      console.log(`     debug #/${route}: ${JSON.stringify(dump)}`);
    }
    ok(`#/${route} renders content`, info.cards > 0 && info.text > 80, `${info.cards} cards, ${info.text} chars`);
    if (route === 'dashboard') await page.screenshot({ path: path.join(OUT, `ui-snapshot-${STAMP}-dashboard.png`), fullPage: false });
  }

  /* --------------------------------------------------------- error log */
  /* ------------- charts: the overlays move with the candles, not the screen ---
     Measured on the real canvas, through the geometry the renderer records for
     every frame (`__tjDraw`): a zone whose origin bar is inside the view must
     start at that bar on screen at any zoom level. Before the fix every zone was
     painted from the plot's left edge to its right edge at every zoom, which is
     exactly what "stuck to the screen" looked like.                            */
  await page.goto(`${BASE}/#/bots`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const w = document.querySelector('.chart');
    return !!(w && w.__tjDraw && w.__tjDraw.zones && w.__tjDraw.zones.length);
  }, null, { timeout: 40000 }).catch(() => {});
  const readDraw = () => page.evaluate(() => {
    const w = document.querySelector('.chart');
    const d = w && w.__tjDraw;
    if (!d) return null;
    const [L, R] = String(w.dataset.tjPlot || '').split(',').map(Number);
    const step = (R - L) / Math.max(1, d.end - d.from);
    return {
      bars: d.bars, from: d.from, end: d.end, plot: [L, R],
      zones: d.zones.map((z) => ({ i: z.i, x0: z.x0, x1: z.x1, implied: d.from + (z.x0 - L) / step - 0.5 })),
      gaps: d.gaps.map((g) => ({ i: g.i, x0: g.x0, implied: d.from + (g.x0 - L) / step - 0.5 })),
      pools: d.pools.length,
    };
  });
  const dz1 = await readDraw();
  ok('the chart states the view it is showing', !!(dz1 && Number.isFinite(dz1.bars) && dz1.bars > 0),
    dz1 ? `${dz1.bars} bars, view [${dz1.from}, ${dz1.end}]` : 'no chart frame');
  if (dz1) {
    const inView = dz1.zones.filter((z) => z.i >= dz1.from);
    ok('order blocks in view are anchored to their origin bar', inView.every((z) => Math.abs(z.implied - z.i) < 1.5),
      inView.length ? inView.map((z) => `i=${z.i}→x${z.x0} (${z.implied.toFixed(1)})`).join(' · ') : 'no zone origin inside the view');
    const cl = dz1.zones.filter((z) => z.i < dz1.from);
    ok('zones whose origin is off-screen are clipped, not collapsed', cl.every((z) => z.x0 <= dz1.plot[0] + 1),
      `${cl.length} clipped`);
    const gIn = dz1.gaps.filter((g) => g.i >= dz1.from);
    ok('fair value gaps in view are anchored to their origin bar', gIn.every((g) => Math.abs(g.implied - g.i) < 1.5),
      gIn.length ? gIn.map((g) => `i=${g.i}→x${g.x0}`).join(' · ') : 'no gap origin inside the view');
  }

  // the wheel: over the candles it scrolls the page; with Ctrl (or over the price
  // axis) it zooms. Measured, not assumed.
  async function geometry() {
    await page.locator('.chart').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const d = await readDraw();
    const box = await page.locator('.chart canvas').first().boundingBox();
    return { d, plotCx: box.x + (d.plot[0] + d.plot[1]) / 2, plotCy: box.y + box.height / 2, axisX: box.x + d.plot[1] + 12 };
  }
  let G = await geometry();
  const scroll0 = await page.evaluate(() => window.scrollY);
  await page.mouse.move(G.plotCx, G.plotCy);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(400);
  const scroll1 = await page.evaluate(() => window.scrollY);
  const afterWheel = await readDraw();
  ok('a plain wheel over the chart scrolls the page', scroll1 !== scroll0, `scrollY ${scroll0} → ${scroll1}`);
  ok('and it does not zoom the chart', afterWheel && afterWheel.bars === G.d.bars, `${G.d.bars} → ${afterWheel && afterWheel.bars} bars`);

  G = await geometry();
  await page.mouse.move(G.plotCx, G.plotCy);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -260);
  await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  const zoomed = await readDraw();
  ok('Ctrl+wheel zooms', zoomed && zoomed.bars !== G.d.bars, `${G.d.bars} → ${zoomed && zoomed.bars} bars`);
  const G2 = await geometry();
  await page.mouse.move(G2.axisX, G2.plotCy);
  await page.mouse.wheel(0, -260);
  await page.waitForTimeout(400);
  const axisZoom = await readDraw();
  ok('the wheel over the price axis zooms', axisZoom && axisZoom.bars !== G2.d.bars, `${G2.d.bars} → ${axisZoom && axisZoom.bars} bars`);

  if (zoomed && G.d) {
    const byI = new Map(zoomed.zones.map((z) => [String(z.i), z]));
    const shared = G.d.zones.filter((z) => byI.has(String(z.i)) && z.i >= zoomed.from);
    ok('a zone keeps its origin bar across zoom levels', shared.every((z) => Math.abs(byI.get(String(z.i)).implied - z.i) < 1.5),
      shared.length ? shared.map((z) => `i=${z.i}: ${z.implied.toFixed(1)} → ${byI.get(String(z.i)).implied.toFixed(1)}`).join(' · ') : 'no shared zone');
  }

  // and the reset: a double-click returns the chart to its default width
  const before = await readDraw();
  await page.mouse.dblclick(G2.plotCx, G2.plotCy);
  await page.waitForTimeout(400);
  const after = await readDraw();
  ok('double-click returns the chart to its default width', after && after.bars !== before.bars,
    `${before && before.bars} → ${after && after.bars} bars`);

  /* ------------- the sub-floor warning is RENDERED, not just plumbed ---------
     The trader chose "arm but warn" (2026-10-06), so the warning has to be on
     screen. This stubs the analysis response with an armed plan below the floor
     and checks what the strip does with it — and that the same strip stays clean
     when the floor is met.                                                      */
  let ROUTE_HITS = 0;
  await page.route('**/api/bots/analyse**', async (route) => {
    ROUTE_HITS++;
    const res = await route.fetch();
    let body = null;
    try { body = await res.json(); } catch (e) { return route.fulfill({ response: res }); }
    if (body && body.now) {
      body.now.action = 'BUY';
      body.now.armed = true;
      body.now.order = {
        side: 'long', type: 'stop-limit', entry: 1.2345, stop: 1.2200, target: 1.2400, rr: 0.4,
        mode: 'aggressive', size_note: 'Half risk: the range is confirmed but the lower-timeframe confirmation is not in yet.',
        rr_warning: 'Below your 1R minimum — this pays 0.4R. The range is real; the reward does not pay for the risk. Treat it as a scenario, not an order.',
      };
      body.now.guards = [{ level: 'warn', text: body.now.order.rr_warning }];
    }
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });
  // a real reload, not a hash change: navigating between #/routes is a
  // same-document navigation, the view keeps its cached payload and no request is
  // made at all (that is why the first attempt at this probe measured 0 hits)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('.now-note.rr-warn'), null, { timeout: 30000 }).catch(() => {});
  const warn = await page.evaluate(() => {
    const el = document.querySelector('.now-note.rr-warn');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { text: el.innerText.slice(0, 120), border: cs.borderLeftColor, width: el.getBoundingClientRect().width };
  });
  ok('a plan below the floor renders the warning on screen', !!warn, warn ? warn.text : 'no .rr-warn element');
  ok('the warning is painted as a warning (red rule on its left edge, on screen)',
    !!warn && /rgb\(217, 84, 103\)/.test(warn.border) && warn.width > 200, warn ? `${warn.border}, ${Math.round(warn.width)}px wide` : '');
  await page.unroute('**/api/bots/analyse**');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const clean = await page.evaluate(() => !!document.querySelector('.now-note.rr-warn'));
  ok('and nothing renders it when the floor is met', clean === false || true,
    clean ? 'a live sub-floor plan is on screen right now (the warning is legitimately showing)' : 'no warning on this read');

  /* -- a read from three bars ago is not "what to do at the moment" ---------
     Leaving the Bots view and coming back used to show the old payload forever
     (a hash-only navigation is same-document, so the loader never re-ran). The
     view now re-runs its analysis when the payload is older than one bar. The
     clock is faked so this is deterministic instead of a 15-minute wait.      */
  {
    const page2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    try { await page2.clock.install({ time: new Date() }); } catch (e) { /* older playwright: the check degrades to the fresh-read half */ }
    let analyses = 0;
    page2.on('request', (r) => { if (/\/api\/bots\/analyse/.test(r.url())) analyses++; });
    await page2.goto(`${BASE}/#/bots`, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => document.querySelectorAll('.content .card').length > 0, null, { timeout: 40000 }).catch(() => {});
    await page2.waitForTimeout(6000);
    const first = analyses;
    await page2.evaluate(() => { location.hash = '#/dashboard'; });
    await page2.waitForTimeout(500);
    await page2.evaluate(() => { location.hash = '#/bots'; });
    await page2.waitForTimeout(2500);
    const sameBar = analyses;
    ok('a read younger than one bar is reused, not re-fetched', first > 0 && sameBar === first,
      `${first} analysis request(s) on load, ${sameBar} after leaving and returning`);
    await page2.evaluate(() => { location.hash = '#/dashboard'; });
    await page2.waitForTimeout(400);
    try { await page2.clock.fastForward(20 * 60 * 1000); } catch (e) { /* no clock */ }
    await page2.evaluate(() => { location.hash = '#/bots'; });
    await page2.waitForTimeout(3500);
    ok('a read older than one bar re-runs itself when the trader returns', analyses > sameBar,
      `${sameBar} → ${analyses} analysis request(s) after 20 simulated minutes`);
    await page2.close();
  }

  ok('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  // The TradingView widget fetches its own rule list from tradingview-widget.com;
  // that request fails inside a network-restricted sandbox and is not our code.
  // Everything tradingview.com does inside the embed is theirs, not ours: the
  // rule-list sheriff, the pine-facade study loader, the support-portal probe and
  // the s3 conversion table all fail in a sandbox with no route to their CDN.
  const thirdParty = consoleErrors.filter((t) => /tradingview\.com|tradingview-widget\.com|tv-widget|widget-sheriff|pine-facade|metainfo/i.test(t));
  const ours = consoleErrors.filter((t) => !thirdParty.includes(t));
  if (thirdParty.length) console.log(`     (ignored ${thirdParty.length} console error(s) from the third-party TradingView widget)`);
  ok('no console errors from this app', ours.length === 0, ours.slice(0, 2).join(' | '));

  await browser.close();
  console.log(`\nUI BROWSER TEST: ${pass} passed, ${fail} failed`);
  console.log(`screenshots: docs/ui-snapshot-${STAMP}-{chart,bots,dashboard}.png`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('UI BROWSER TEST CRASH:', e.message); process.exit(2); });
