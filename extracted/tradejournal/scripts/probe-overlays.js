process.env.TJ_SCHEDULER = '0';
/**
 * Geometry probe: do the overlays move with the candles, and does the wheel
 * behave the way the trader asked?
 *
 *   node probe-overlays.js
 *
 * Measured on a real Chromium at 1600x900 against the running app (:3000),
 * `#/bots`. Nothing here reads app internals except the chart's own
 * `data-tj-*` view-window attributes and the canvas pixels.
 */
const { chromium } = require('playwright-core');

const ZONE = { r: 217, g: 84, b: 103 };   // THEME.zoneSupply, composited at 13%

async function bandOf(page) {
  return page.evaluate(() => {
    // THEME.zoneSupply is rgba(217,84,103,0.13) painted over a dark canvas, so the
    // pixels on screen are ~(38,22,28). Matching the base colour (217,84,103) also
    // matched red text and red lines, which made the scan report "bands" running
    // through the price axis. This matches what is actually composited, inside the
    // plot area only.
    const cv = document.querySelector('.chart canvas');
    if (!cv) return null;
    const w = document.querySelector('.chart');
    const [L, R] = (w.dataset.tjPlot || '10,1000').split(',').map(Number);
    const ratio = cv.width / cv.clientWidth;
    const x0 = Math.round(L * ratio), x1 = Math.round(R * ratio);
    const g = cv.getContext('2d');
    const d = g.getImageData(x0, 0, Math.max(1, x1 - x0), cv.height).data;
    const W = Math.max(1, x1 - x0), H = cv.height;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let n = 0, first = -1, last = -1;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (Math.abs(r - 38) < 9 && Math.abs(gg - 22) < 9 && Math.abs(b - 28) < 9) {
          if (first < 0) first = x; last = x; n++;
        }
      }
      if (n > 40) rows.push({ y, n, first: first + x0, last: last + x0 });
    }
    if (!rows.length) return null;
    const best = rows.sort((a, b) => b.n - a.n)[0];
    return { y: best.y, x0: best.first, x1: best.last, width: best.last - best.first, rows: rows.length, canvasW: cv.width, plot: [L, R] };
  });
}

async function drawOf(page) {
  return page.evaluate(() => {
    const w = document.querySelector('.chart');
    const d = w && w.__tjDraw;
    if (!d) return null;
    return {
      bars: d.bars, from: d.from, end: d.end,
      zones: (d.zones || []).map((z) => ({ i: z.i, i0: z.i0, x0: z.x0, x1: z.x1, side: z.side })),
      gapsD: d.gaps || [], poolsD: d.pools || [],
      gaps: (d.gaps || []).length, pools: (d.pools || []).length,
      plan: d.plan || null,
      plot: w.dataset.tjPlot,
    };
  });
}

async function viewOf(page) {
  return page.evaluate(() => {
    const w = document.querySelector('.chart');
    return { bars: Number(w.dataset.tjBars), from: Number(w.dataset.tjFrom), end: Number(w.dataset.tjEnd), plot: w.dataset.tjPlot };
  });
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  await page.goto('http://127.0.0.1:3000/#/bots', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const c = document.querySelector('.chart canvas');
    const w = document.querySelector('.chart');
    return !!(c && c.width > 200 && w && w.dataset.tjBars);
  }, null, { timeout: 40000 });
  await page.locator('.chart').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  // every interaction re-reads the geometry: a wheel that scrolls the page moves
  // the chart under the pointer, and stale coordinates silently miss the canvas
  async function geom() {
    await page.locator('.chart').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const v = await viewOf(page);
    const [L, R] = v.plot.split(',').map(Number);
    const box = await page.locator('.chart canvas').first().boundingBox();
    const g = { LEFT: L, RIGHT: R, plotCx: box.x + (L + R) / 2, plotCy: box.y + box.height / 2, axisX: box.x + R + 12, over: null };
    g.over = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.tagName + (el.closest('.chart') ? ' inside the chart' : ' OUTSIDE the chart') : 'nothing';
    }, [g.plotCx, g.plotCy]);
    g.axisOver = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.tagName + (el.closest('.chart') ? ' inside the chart' : ' OUTSIDE the chart') : 'nothing';
    }, [g.axisX, g.plotCy]);
    return g;
  }

  let G = await geom();

  const out = [];
  const line = (label, v) => { out.push(`${label.padEnd(46)} ${v}`); };
  function parsePlot(str) { const [L, R] = String(str).split(',').map(Number); return { L, R }; }
  /** bar index the band's left edge implies, from the view window it was drawn in */
  function originBar(band, view) {
    if (!band || !view) return null;
    const [L, R] = view.plot.split(',').map(Number);
    const step = (R - L) / Math.max(1, view.end - view.from);
    return view.from + (band.x0 - L) / step - 0.5;
  }

  const v0 = await viewOf(page);
  const b0 = await bandOf(page);
  const d0 = await drawOf(page);
  line('start: bars on screen', v0.bars);
  line('start: view [from, end]', `[${v0.from}, ${v0.end}]`);
  line('start: supply band x0..x1 (canvas px)', b0 ? `${b0.x0}..${b0.x1} (w ${b0.width}, ${b0.canvasW}px wide)` : 'no supply band in view');
  line('  plot area (LEFT,RIGHT) and view', `${v0.plot}  [${v0.from}, ${v0.end}]`);
  line('  → band left edge implies bar', b0 ? String(originBar(b0, v0)) : '-');
  if (d0) {
    line('renderer: overlays in this frame', `${d0.zones.length} zone(s), ${d0.gaps} fvg(s), ${d0.pools} pool(s)${d0.plan ? ', a plan box' : ''}`);
    (d0.gapsD || []).slice(0, 3).forEach((g, n) => {
      const { L, R } = parsePlot(d0.plot);
      const step = (R - L) / Math.max(1, d0.end - d0.from);
      const bar = d0.from + (g.x0 - L) / step - 0.5;
      line(`  fvg ${n}`, `x0=${g.x0} x1=${g.x1}${g.filled ? ' (filled)' : ''} | source bar i=${g.i} | implies ${bar.toFixed(2)} | ${Math.abs(bar - g.i) < 1.5 ? 'ANCHORED' : 'clipped/edge'}`);
    });
    (d0.poolsD || []).slice(0, 3).forEach((p, n) => {
      const { L, R } = parsePlot(d0.plot);
      const step = (R - L) / Math.max(1, d0.end - d0.from);
      const bar = d0.from + (p.x0 - L) / step - 0.5;
      line(`  pool ${n}`, `${p.label || ''} x0=${p.x0} | source bar i=${p.i} | implies ${bar.toFixed(2)} | ${p.i === null ? 'no time on the pool' : (Math.abs(bar - p.i) < 1.5 ? 'ANCHORED' : 'clipped/edge')}`);
    });
    d0.zones.slice(0, 4).forEach((z, n) => {
      const step = (parsePlot(d0.plot).R - parsePlot(d0.plot).L) / Math.max(1, d0.end - d0.from);
      const implied = d0.from + (z.x0 - parsePlot(d0.plot).L) / step - 0.5;
      const anchored = Math.abs(implied - z.i) < 1.5;
      const clipped = z.x0 <= parsePlot(d0.plot).L + 1 && z.i < d0.from;
      line(`  zone ${n} (${z.side})`, `x0=${z.x0} x1=${z.x1} | source bar i=${z.i} | screen implies bar ${implied.toFixed(2)} | ${anchored ? 'ANCHORED to its bar' : clipped ? 'origin off-screen left — clipped to the left edge (by design)' : 'MIS-ANCHORED'}`);
    });
  }

  /* ------------------------------------------------ wheel over the plot ---- */
  const beforeScroll = await page.evaluate(() => window.scrollY);
  line('pointer over the plot lands on', G.over);
  await page.mouse.move(G.plotCx, G.plotCy);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(400);
  const afterScroll = await page.evaluate(() => window.scrollY);
  const vWheel = await viewOf(page);
  line('plain wheel: page scrollY', `${beforeScroll} → ${afterScroll} (${afterScroll !== beforeScroll ? 'PAGE SCROLLED' : 'page did not move'})`);
  line('plain wheel: bars on screen', `${v0.bars} → ${vWheel.bars} (${vWheel.bars === v0.bars ? 'unchanged — correct' : 'ZOOMED — wrong'})`);

  /* --------------------------------------- ctrl+wheel zooms over the plot -- */
  G = await geom();
  await page.mouse.move(G.plotCx, G.plotCy);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await page.waitForTimeout(450);
  const vZoom = await viewOf(page);
  const bZoom = await bandOf(page);
  line('ctrl+wheel: bars on screen', `${vWheel.bars} → ${vZoom.bars} (${vZoom.bars !== vWheel.bars ? 'zoomed' : 'no change'})`);
  line('ctrl+wheel: view [from, end]', `[${vZoom.from}, ${vZoom.end}]`);
  line('ctrl+wheel: supply band x0..x1', bZoom ? `${bZoom.x0}..${bZoom.x1} (w ${bZoom.width})` : 'not in view');
  line('  → band left edge implies bar', bZoom ? String(originBar(bZoom, vZoom)) : '-');
  {
    const dz = await drawOf(page);
    if (dz && dz.zones.length) {
      const { L, R } = parsePlot(dz.plot);
      const step = (R - L) / Math.max(1, dz.end - dz.from);
      dz.zones.slice(0, 4).forEach((z, n) => {
        const implied = dz.end - (R - z.x0) / step + 1 - dz.end; // solved below instead
        const bar = dz.from + (z.x0 - L) / step - 0.5;
        const okz = Math.abs(bar - z.i) < 1.5;
        line(`  after zoom, zone ${n} (${z.side})`, `x0=${z.x0} | source bar i=${z.i} | implies ${bar.toFixed(2)} | ${okz ? 'ANCHORED to its bar' : 'clipped to the left edge (origin off-screen)'}`);
      });
    }
  }
  /* the verdict comes from the renderer's own record, not from a pixel scan:
     the same zone, seen at two zoom levels, must report the same source bar */
  {
    const dz = await drawOf(page);
    const byI = (d) => new Map((d ? d.zones : []).map((z) => [String(z.i), z]));
    const a = byI(d0), b = byI(dz);
    const seen = [];
    a.forEach((z, k) => { if (b.has(k)) seen.push([z, b.get(k)]); });
    if (!seen.length) line('  → zone anchored to its bar?', 'no zone visible at both zoom levels in this sample');
    else {
      const measures = [];
      seen.forEach(([x, y]) => {
        const PX = parsePlot(d0.plot), PY = parsePlot(dz.plot);
        const stepX = (PX.R - PX.L) / Math.max(1, d0.end - d0.from);
        const stepY = (PY.R - PY.L) / Math.max(1, dz.end - dz.from);
        const imX = d0.from + (x.x0 - PX.L) / stepX - 0.5;
        const imY = dz.from + (y.x0 - PY.L) / stepY - 0.5;
        // a zone whose origin is left of the view is deliberately drawn from the
        // plot's left edge (clipping, not mis-anchoring)
        const clipped = (x.x0 <= PX.L + 1 && x.i < d0.from) || (y.x0 <= PY.L + 1 && y.i < dz.from);
        measures.push({ i: x.i, imX, imY, clipped, bad: !clipped && (Math.abs(imX - x.i) > 1.5 || Math.abs(imY - y.i) > 1.5) });
      });
      const bad = measures.filter((m) => m.bad);
      const good = measures.filter((m) => !m.bad && !m.clipped);
      line(`  → ${measures.length} zone(s) present at both zoom levels`, bad.length
        ? `MIS-ANCHORED: ${bad.map((m) => `i=${m.i} (implies ${m.imX.toFixed(1)}/${m.imY.toFixed(1)})`).join(', ')}`
        : `${good.length} anchored to their source bar at both widths, ${measures.length - good.length} clipped because their origin is off-screen`);
      good.slice(0, 3).forEach((m) => line(`      i=${m.i}`, `implies bar ${m.imX.toFixed(2)} at 170 bars and ${m.imY.toFixed(2)} at 136 bars — same bar both times`));
    }
  }

  /* ---------------------------------------- wheel over the price axis ------ */
  G = await geom();
  line('pointer over the price axis lands on', G.axisOver);
  const vBeforeAxis = await viewOf(page);
  await page.mouse.move(G.axisX, G.plotCy);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(450);
  const vAfterAxis = await viewOf(page);
  line('wheel over the price axis: bars', `${vBeforeAxis.bars} → ${vAfterAxis.bars} (${vAfterAxis.bars !== vBeforeAxis.bars ? 'zoomed — correct' : 'no change'})`);

  /* ------------------------------------------------------- drag to pan ----- */
  G = await geom();
  await page.mouse.move(G.plotCx, G.plotCy);
  await page.mouse.down();
  await page.mouse.move(G.plotCx + 260, G.plotCy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(450);
  const vPan = await viewOf(page);
  const bPan = await bandOf(page);
  line('drag right: view [from, end]', `[${vPan.from}, ${vPan.end}] (${vPan.end < vPan.from + 9999 && vPan.from !== vZoom.from ? 'panned into history' : 'no pan'})`);
  line('drag right: supply band x0..x1', bPan ? `${bPan.x0}..${bPan.x1}` : 'not in view');
  line('  → band left edge implies bar', bPan ? String(originBar(bPan, vPan)) : '-');
  {
    const dz = await drawOf(page);
    if (dz && dz.zones.length) {
      const { L, R } = parsePlot(dz.plot);
      const step = (R - L) / Math.max(1, dz.end - dz.from);
      dz.zones.slice(0, 4).forEach((z, n) => {
        const bar = dz.from + (z.x0 - L) / step - 0.5;
        line(`  after pan, zone ${n} (${z.side})`, `x0=${z.x0} | source bar i=${z.i} | implies ${bar.toFixed(2)} | ${Math.abs(bar - z.i) < 1.5 ? 'ANCHORED' : 'clipped at the view edge'}`);
      });
      if (dz.plan) line('  plan box', `x0=${dz.plan.x0} x1=${dz.plan.x1} | source i=${dz.plan.i}`);
    }
  }

  /* ---------------------------------------- the band must track the bars --- */
  if (bPan && bPan.x0 > 0) {
    const pxPerBar = (G.RIGHT - G.LEFT) / Math.max(1, vPan.end - vPan.from);
    line('  → band anchors to the origin bar', `band starts ${bPan.x0}px from the canvas edge (${((bPan.x0 - G.LEFT) / pxPerBar).toFixed(1)} bars into the view)`);
  }

  /* --------------------------------------------------------- dblclick ----- */
  G = await geom();
  await page.mouse.dblclick(G.plotCx, G.plotCy);
  await page.waitForTimeout(500);
  const vReset = await viewOf(page);
  line('double-click: bars on screen', `${vPan.bars} → ${vReset.bars} (${vReset.bars === v0.bars ? 'back to the default width' : 'changed'})`);
  line('page errors', errors.length ? errors.join(' | ') : 'none');

  console.log(out.join('\n'));
  await browser.close();
  process.exit(0);
})();
