/* ==========================================================================
   chart.js — the desk chart
   --------------------------------------------------------------------------
   A real price chart, drawn on canvas: candles, volume, axes with nice-number
   ticks, killzone shading, the dealing range, order blocks, fair value gaps,
   liquidity pools, sweep and structure markers, and the trade plan drawn as a
   risk/reward box.

   Written by hand rather than embedded, because the app must work offline and
   must never show a chart it does not control. No dependencies, no CDN, no
   iframe: TradingView stays optional on top of this, not underneath it.

   Public API
     Chart.render({ candles, smc, plan, symbol, timeframe, height, bars, meta })
       → DOM element (canvas + toolbar + readout), and it keeps itself in sync
         on resize, hover, drag-pan, wheel-zoom and double-click-reset.
     Chart.mini({ candles, label, sub, side, height })
       → small sparkline chart used for the top-down timeframe stack.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------- constants */
  const KILLZONES = [
    { key: 'asia', label: 'Asia', from: 0, to: 6 },
    { key: 'london', label: 'London KZ', from: 6, to: 9 },
    { key: 'ny_am', label: 'NY AM KZ', from: 12, to: 15 },
    { key: 'ny_pm', label: 'NY PM KZ', from: 15, to: 18 },
  ];
  const ZOOM_STEPS = [80, 120, 170, 240, 340, 500];

  const THEME = {
    bg: '#0b0d11', grid: '#1b1f27', gridStrong: '#252a34',
    text: '#99a1af', textStrong: '#dfe3ea', faint: '#5d6572',
    up: '#2aa877', down: '#d95467',
    accent: '#3f7fe0', amber: '#cf9a45', steel: '#7a8494',
    premium: 'rgba(122,132,148,0.055)', discount: 'rgba(63,127,224,0.05)',
    zoneSupply: 'rgba(217,84,103,0.13)', zoneSupplyEdge: 'rgba(217,84,103,0.55)',
    zoneDemand: 'rgba(42,168,119,0.13)', zoneDemandEdge: 'rgba(42,168,119,0.55)',
    fvg: 'rgba(122,132,148,0.10)', fvgEdge: 'rgba(122,132,148,0.4)',
    risk: 'rgba(217,84,103,0.13)', reward: 'rgba(42,168,119,0.10)',
    volume: 'rgba(122,132,148,0.35)',
    crosshair: 'rgba(153,161,175,0.55)',
  };

  const fmt = (v, dp) => (v === null || v === undefined || Number.isNaN(Number(v)))
    ? '—'
    : Number(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const nf = (v) => (v === null || v === undefined || Number.isNaN(Number(v))) ? '—' : Number(v).toLocaleString();

  /** decimal places that suit the instrument's price scale */
  function dpFor(price) {
    const p = Math.abs(Number(price) || 0);
    if (p >= 1000) return 2;
    if (p >= 100) return 2;
    if (p >= 10) return 3;
    if (p >= 1) return 4;
    if (p >= 0.1) return 5;
    return 6;
  }

  /** human "nice" step so the price axis shows round numbers */
  function niceStep(span, target) {
    const raw = span / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = norm >= 5 ? 5 : norm >= 2.5 ? 2.5 : norm >= 2 ? 2 : norm >= 1 ? 1 : 0.5;
    return step * mag;
  }

  function timeLabel(t, spanMs) {
    const d = new Date(Number(t));
    const day = `${String(d.getUTCDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}`;
    const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    if (spanMs <= 2 * 24 * 3600 * 1000) return hm;
    if (spanMs <= 12 * 24 * 3600 * 1000) return `${day} ${hm}`;
    return day;
  }

  function killzoneAt(t) {
    const h = new Date(Number(t)).getUTCHours();
    return KILLZONES.find((z) => h >= z.from && h < z.to) || null;
  }


  /* --------------------------------------------------------------- studies
     EMA and session VWAP computed on the client: the chart is offline-capable,
     so it may not depend on a server round-trip (or a CDN) to draw a line.    */

  function ema(values, period) {
    const k = 2 / (period + 1);
    const out = new Array(values.length).fill(null);
    let e = null;
    for (let i = 0; i < values.length; i++) {
      const v = Number(values[i]);
      if (!Number.isFinite(v)) continue;
      e = e === null ? v : v * k + e * (1 - k);
      if (i >= period - 1) out[i] = e;
    }
    return out;
  }

  /** VWAP anchored to the UTC session (resets at midnight UTC). */
  function sessionVwap(candles) {
    const out = new Array(candles.length).fill(null);
    let day = null, pv = 0, vol = 0;
    for (let i = 0; i < candles.length; i++) {
      const b = candles[i];
      const d = new Date(Number(b.t)).toISOString().slice(0, 10);
      if (d !== day) { day = d; pv = 0; vol = 0; }
      const typical = (Number(b.h) + Number(b.l) + Number(b.c)) / 3;
      const v = Number(b.v) || 0;
      pv += typical * v; vol += v;
      out[i] = vol > 0 ? pv / vol : null;
    }
    return out;
  }

  function studiesFor(candles) {
    if (!candles || !candles.length) return null;
    const closes = candles.map((b) => b.c);
    return {
      ema50: ema(closes, 50),
      ema200: ema(closes, 200),
      vwap: sessionVwap(candles),
    };
  }

  const DRAW_KINDS = { cursor: 'Cursor', trend: 'Trend line', ray: 'Horizontal ray', hline: 'Price line', rect: 'Box', fib: 'Fib retracement', measure: 'Measure' };
  const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  /* -------------------------------------------------------------- helpers */
  /**
   * Label placement with collision avoidance.
   *
   * A chart that prints every level's caption on top of every other caption is
   * unreadable — and that is exactly what a naive "draw the text at the line"
   * chart does. This keeps a list of the boxes already placed (inside the plot
   * and in the price-axis strip, separately) and either nudges a label to a free
   * slot or skips the caption while keeping the level's line. The line is the
   * data; the caption is a nicety, so it is the caption that yields.
   */
  function labeller(ctx, state) {
    const placed = [];
    const axis = [];
    const box = { x: 0, y: 0, w: 0, h: 0 };
    const hits = (list, b) => list.some((r) => !(b.x + b.w < r.x || b.x > r.x + r.w || b.y + b.h < r.y || b.y > r.y + r.h));
    /**
     * @param {string} text
     * @param {number} x  left edge (or right edge when align:'right')
     * @param {number} y  baseline of the text
     * @param {{fg?:string,bg?:string,border?:string,font?:string,align?:'left'|'right',axis?:boolean,nudge?:number,pad?:number}} o
     * @returns {boolean} whether it was drawn
     */
    function put(text, x, y, o = {}) {
      if (text === null || text === undefined || text === '') return false;
      const pad = o.pad === undefined ? 4 : o.pad;
      const h = 14;
      let label = String(text);
      ctx.font = o.font || '10px ui-monospace, Menlo, monospace';
      // the price gutter is a hard boundary: shrink the type, then trim, rather
      // than letting a caption run off the edge of the canvas
      if (o.maxWidth) {
        if (ctx.measureText(label).width + pad * 2 > o.maxWidth) ctx.font = '9px ui-monospace, Menlo, monospace';
        while (ctx.measureText(label).width + pad * 2 > o.maxWidth && label.length > 4) label = label.slice(0, -2);
        if (label !== String(text)) label += '…';
      }
      text = label;
      const w = ctx.measureText(String(text)).width + pad * 2;
      const list = o.axis ? axis : placed;
      const nudge = o.nudge === undefined ? 0 : o.nudge;
      const cands = [0];
      for (let i = 1; i <= nudge; i++) cands.push(-i * 13, i * 13);
      for (const dy of cands) {
        const left = o.align === 'right' ? x - w : x;
        const b = { x: left, y: y + dy - h + 3, w, h };
        if (hits(list, b)) continue;
        if (list === placed && hits(axis, b)) continue;      // never cover the axis strip
        list.push(b);
        if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(b.x, b.y, w, h); }
        if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, w - 1, h - 1); }
        ctx.fillStyle = o.fg || THEME.text;
        ctx.fillText(String(text), b.x + pad, b.y + h - 4);
        return true;
      }
      return false;
    }
    return { put, placed, axis };
  }

  function dash(ctx, on, pattern) {
    if (on) ctx.setLineDash(pattern || [4, 4]); else ctx.setLineDash([]);
  }

  /* ============================================================ main chart */
  function render(opts) {
    const o = opts || {};
    const all = (o.candles || []).filter((b) => b && b.t != null);
    const state = {
      bars: Math.min(Math.max(o.bars || 170, 40), 500),
      offset: 0,                  // bars scrolled back from the newest
      hover: null,                // {i, px, py} while the pointer is over the canvas
      drag: null,                 // panning state
      expanded: false,
      show: Object.assign({
        zones: true, fvgs: true, pools: true, sweeps: true,
        structure: true, plan: true, volume: true, sessions: true, range: true,
      }, o.show || {}),
      hoverIdx: null,
      tool: o.tool || 'cursor',
      magnet: o.magnet !== false,
      drawings: Array.isArray(o.drawings) ? o.drawings.slice() : [],
      pending: null,             // {kind, a:{t,p}, b:{t,p}} while a tool is mid-click
      selected: -1,              // index of the drawing under the cursor
      studies: Object.assign({ ema50: false, ema200: false, vwap: false }, o.studies || {}),
      replay: o.replay || null,  // {trim} — the chart is showing an older instant
      map: null,                 // last price/time mapping, for the pointer tools
    };

    const wrap = document.createElement('div');
    wrap.className = 'chart';

    /* ---------------------------------------------------------- toolbar */
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    const name = document.createElement('div');
    name.className = 'chart-id';
    const last = all.length ? all[all.length - 1] : null;
    const prev = all.length > 1 ? all[all.length - 2] : null;
    const chg = last && prev ? ((last.c - prev.c) / prev.c) * 100 : 0;
    name.innerHTML = `<b>${(o.symbol || '').toUpperCase()}</b><span class="chart-tf">${o.timeframe || ''}</span>`
      + (last ? `<span class="chart-last ${chg >= 0 ? 'pos' : 'neg'}">${fmt(last.c, dpFor(last.c))}</span><span class="chart-chg ${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>` : '');
    bar.appendChild(name);

    const toggles = [
      ['plan', 'Plan'], ['zones', 'Zones'], ['fvgs', 'FVG'], ['pools', 'Liquidity'],
      ['sweeps', 'Sweeps'], ['structure', 'Structure'], ['sessions', 'Sessions'], ['volume', 'Volume'],
    ];
    const toggleRow = document.createElement('div');
    toggleRow.className = 'chart-toggles';
    toggles.forEach(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chart-tog' + (state.show[key] ? ' on' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        state.show[key] = !state.show[key];
        b.classList.toggle('on', state.show[key]);
        draw();
      });
      toggleRow.appendChild(b);
    });
    bar.appendChild(toggleRow);

    const zoomRow = document.createElement('div');
    zoomRow.className = 'chart-zoom';
    const mkBtn = (label, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chart-btn'; b.textContent = label; b.title = title;
      b.addEventListener('click', fn);
      zoomRow.appendChild(b);
      return b;
    };
    mkBtn('−', 'Zoom out', () => setBars(state.bars * 1.4));
    mkBtn('+', 'Zoom in', () => setBars(state.bars / 1.4));
    mkBtn('Reset', 'Reset zoom and pan', () => { state.offset = 0; setBars(Math.min(170, widthCap())); });
    mkBtn('Expand', 'Taller chart', (e) => {
      state.expanded = !state.expanded;
      e.target.textContent = state.expanded ? 'Collapse' : 'Expand';
      wrap.classList.toggle('chart-expanded', state.expanded);
      resize();
    });
    /* The wheel was deliberately made Ctrl/⌘-only so a bare wheel keeps scrolling the
     * page, and panning is drag-only — both reasonable, but neither was written down
     * anywhere the user could see, so the controls read as broken ("I can't zoom, I
     * can't scroll"). The behaviour stays; it is now stated next to the buttons. */
    const hint = document.createElement('span');
    hint.className = 'chart-hint';
    hint.textContent = 'Ctrl/\u2318 + scroll = zoom \u00b7 drag = pan \u00b7 double-click = reset';
    zoomRow.appendChild(hint);
    bar.appendChild(zoomRow);

    /* ---- studies + drawing tools: the second row of the toolbar ---------- */
    const tools = document.createElement('div');
    tools.className = 'chart-tools';

    const studyRow = document.createElement('div');
    studyRow.className = 'chart-toggles';
    [['ema50', 'EMA 50'], ['ema200', 'EMA 200'], ['vwap', 'VWAP']].forEach(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chart-tog' + (state.studies[key] ? ' on' : '');
      b.textContent = label;
      b.title = 'Overlay study';
      b.addEventListener('click', () => {
        state.studies[key] = !state.studies[key];
        b.classList.toggle('on', state.studies[key]);
        draw();
      });
      studyRow.appendChild(b);
    });
    tools.appendChild(studyRow);

    const toolRow = document.createElement('div');
    toolRow.className = 'chart-toolrow';
    const toolBtns = {};
    Object.keys(DRAW_KINDS).forEach((key) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chart-tool' + (state.tool === key ? ' on' : '');
      b.dataset.tool = key;
      const short = { cursor: 'Cursor', trend: 'Line', ray: 'Ray', hline: 'H-line', rect: 'Box', fib: 'Fib', measure: 'Measure' };
      b.textContent = short[key] || key;
      b.title = DRAW_KINDS[key] + ' — ' + (key === 'cursor'
        ? 'select a drawing (Delete removes it)'
        : 'click once to start, again to finish · Esc cancels');
      b.addEventListener('click', () => setTool(key));
      toolBtns[key] = b;
      toolRow.appendChild(b);
    });
    const magnetBtn = document.createElement('button');
    magnetBtn.type = 'button';
    magnetBtn.className = 'chart-tool mag' + (state.magnet ? ' on' : '');
    magnetBtn.textContent = 'Magnet';
    magnetBtn.title = 'Snap the cursor to the nearest open / high / low / close';
    magnetBtn.addEventListener('click', () => {
      state.magnet = !state.magnet;
      magnetBtn.classList.toggle('on', state.magnet);
    });
    toolRow.appendChild(magnetBtn);

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button'; undoBtn.className = 'chart-tool'; undoBtn.textContent = 'Undo';
    undoBtn.title = 'Remove the last drawing';
    undoBtn.addEventListener('click', () => {
      if (!state.drawings.length) return;
      state.drawings.pop();
      state.selected = -1;
      commitDrawings();
      draw();
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button'; delBtn.className = 'chart-tool'; delBtn.textContent = 'Delete';
    delBtn.title = 'Delete the selected drawing';
    delBtn.addEventListener('click', () => {
      if (state.selected < 0) return;
      state.drawings.splice(state.selected, 1);
      state.selected = -1;
      commitDrawings();
      draw();
    });
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button'; clearBtn.className = 'chart-tool'; clearBtn.textContent = 'Clear';
    clearBtn.title = 'Delete every drawing on this market';
    clearBtn.addEventListener('click', () => {
      if (!state.drawings.length) return;
      if (global.confirm && !global.confirm('Delete every drawing on ' + (o.symbol || 'this market') + ' ' + (o.timeframe || '') + '?')) return;
      state.drawings = [];
      state.selected = -1;
      commitDrawings();
      draw();
    });
    [undoBtn, delBtn, clearBtn].forEach((b) => toolRow.appendChild(b));
    tools.appendChild(toolRow);

    const drawNote = document.createElement('div');
    drawNote.className = 'chart-tools-note';
    drawNote.textContent = (state.drawings.length ? state.drawings.length + ' drawing' + (state.drawings.length === 1 ? '' : 's') : 'no drawings')
      + (o.persist !== false ? ' · saved to your workspace' : '');
    tools.appendChild(drawNote);
    wrap.appendChild(bar);
    wrap.appendChild(tools);

    /* ----------------------------------------------------------- canvas */
    const plot = document.createElement('div');
    plot.className = 'chart-plot';
    const canvas = document.createElement('canvas');
    plot.appendChild(canvas);
    wrap.appendChild(plot);

    const readout = document.createElement('div');
    readout.className = 'chart-readout';
    wrap.appendChild(readout);

    let ctx = null;
    try { ctx = canvas.getContext && canvas.getContext('2d'); } catch (e) { ctx = null; }

    if (!ctx || !all.length) {
      // No 2D context (jsdom, text browsers) or no data: say so and print the
      // numbers a chart would have shown, instead of rendering nothing.
      const p = document.createElement('div');
      p.className = 'chart-empty';
      const L = (o.plan && o.plan.levels) || (o.plan && o.plan.entry ? o.plan : null);
      if (!all.length) p.textContent = 'No candles for this market right now.';
      else p.textContent = 'Canvas unavailable in this environment — '
        + (L ? `plan: entry ${fmt(L.entry, dpFor(L.entry))}, stop ${fmt(L.stop, dpFor(L.stop))}, targets ${(L.targets || []).map((t) => `${fmt(t.price, dpFor(t.price))} (${t.rr}R)`).join(', ')}` : 'price data loaded but cannot be plotted here.');
      plot.appendChild(p);
      return wrap;
    }

    function barsVisible() {
      const end = Math.max(20, all.length - state.offset);
      const from = Math.max(0, end - state.bars);
      return all.slice(from, end);
    }

    /* --------------------------------------------------- time / price map --
       Drawings are stored in (time, price), so they survive zoom, pan and even a
       timeframe change. These translate them onto whichever window is on screen. */
    function visibleRange() {
      const end = Math.max(20, all.length - state.offset);
      return { from: Math.max(0, end - state.bars), end };
    }
    function barMs() {
      if (all.length < 3) return 60000;
      const a = Number(all[all.length - 1].t) - Number(all[all.length - 3].t);
      return a > 0 ? a / 2 : 60000;
    }
    function xForIndex(i) {
      const m = state.map; if (!m) return null;
      return m.LEFT + (i - m.from) * m.step + m.step / 2;
    }
    function yForPrice(p) {
      const m = state.map; if (!m) return null;
      return m.TOP + ((m.hi - p) / (m.hi - m.lo)) * (m.BOTTOM - m.TOP);
    }
    function indexForX(px) {
      const m = state.map; if (!m) return null;
      return Math.round((px - m.LEFT - m.step / 2) / m.step) + m.from;
    }
    function xForTime(t) {
      const m = state.map; if (!m) return null;
      const span = barMs();
      if (t >= m.firstT && t <= m.lastT) {
        // interpolate inside the window (linear in time, like the bars are)
        return m.LEFT + ((t - m.firstT) / span) * m.step + m.step / 2;
      }
      const edgeI = t < m.firstT ? m.from : m.end - 1;
      const edgeT = t < m.firstT ? m.firstT : m.lastT;
      const edgeX = xForIndex(edgeI);
      return edgeX + ((t - edgeT) / span) * m.step;
    }
    function barIndexAtTime(t) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < all.length; i++) {
        const d = Math.abs(Number(all[i].t) - t);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }
    /* ------------------------------------------------------- anchoring ----
       Every overlay that has an ORIGIN — order blocks, fair value gaps,
       liquidity pools, the dealing range, the plan — is anchored to the bar it
       was born at, not stretched across the plot. Zones and gaps are drawn from
       their origin bar to the right edge, the way a charting platform draws a
       box; pools start at the bar that created them.
       
       (Before this, zones and gaps were painted from LEFT to RIGHT at every
       zoom level, which is why they looked stuck to the screen instead of the
       candles: they were anchored to the price axis alone.)                  */

    /** absolute bar index of an overlay item, from whichever field it carries */
    function anchorIndex(item) {
      if (!item) return null;
      if (Number.isFinite(Number(item.i))) return Number(item.i);
      if (Number.isFinite(Number(item.bars_ago))) return Math.max(0, all.length - 1 - Number(item.bars_ago));
      if (Number.isFinite(Number(item.t))) return barIndexAtTime(Number(item.t));
      return null;
    }

    /** screen x of an overlay's origin, clamped inside the plot */
    function anchorX(item, fallback) {
      const i = anchorIndex(item);
      if (i === null) return fallback === undefined ? null : fallback;
      const m = state.map;
      const px = m.LEFT + (i - m.from) * m.step + m.step / 2;
      return Math.max(m.LEFT, Math.min(m.RIGHT, px));
    }

    /** an item whose origin is still ahead of the visible window is skipped */
    function beforeWindow(item) {
      const i = anchorIndex(item);
      const m = state.map;
      return i !== null && i < m.from;
    }

    /** price under the pointer, snapped to an OHLC when magnet is on */
    function probe(px, py) {
      const m = state.map; if (!m) return null;
      let price = m.hi - ((py - m.TOP) / (m.BOTTOM - m.TOP)) * (m.hi - m.lo);
      const i = Math.max(0, Math.min(all.length - 1, indexForX(px)));
      const b = all[i];
      if (state.magnet && b) {
        const cands = [b.o, b.h, b.l, b.c].filter((v) => Number.isFinite(Number(v)));
        let nearest = price, nd = Infinity;
        cands.forEach((v) => { const d = Math.abs(Number(v) - price); if (d < nd) { nd = d; nearest = Number(v); } });
        // snap the price, and pull the time to that OHLC's own bar
        price = nearest;
      }
      const t = b ? Number(b.t) : Date.now();
      return { t, p: Number(price.toFixed(6)), px, py };
    }
    function commitDrawings() {
      drawNote.textContent = (state.drawings.length ? state.drawings.length + ' drawing' + (state.drawings.length === 1 ? '' : 's') : 'no drawings')
        + (o.persist !== false ? ' · saved to your workspace' : '');
      if (typeof o.onDrawings === 'function') {
        try { o.onDrawings(state.drawings.map((d) => ({ kind: d.kind, points: d.points, style: d.style || {} }))); } catch (e) { /* the chart keeps working */ }
      }
    }
    function setTool(key) {
      state.tool = key;
      state.pending = null;
      Object.keys(toolBtns).forEach((k) => toolBtns[k].classList.toggle('on', k === key));
      canvas.style.cursor = key === 'cursor' ? 'crosshair' : 'crosshair';
      draw();
    }
    /** the geometric distance from a point to a drawing, for hit-testing */
    function hit(d, px, py) {
      const pts = (d.points || []).map((pt) => ({ x: xForTime(pt.t), y: yForPrice(pt.p) }));
      if (!pts.length || pts.some((q) => q.x == null)) return false;
      const near = (ax, ay, bx, by) => {
        const len2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay) || 1;
        let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * (bx - ax), cy = ay + t * (by - ay);
        return Math.hypot(px - cx, py - cy) < 7;
      };
      if (d.kind === 'hline') return Math.abs(py - pts[0].y) < 6 && px > state.map.LEFT - 20;
      if (pts.length === 1) return Math.hypot(px - pts[0].x, py - pts[0].y) < 8;
      if (d.kind === 'rect') {
        const x0 = Math.min(pts[0].x, pts[1].x), x1 = Math.max(pts[0].x, pts[1].x);
        const y0 = Math.min(pts[0].y, pts[1].y), y1 = Math.max(pts[0].y, pts[1].y);
        return ((px > x0 - 6 && px < x1 + 6 && Math.abs(py - y0) < 6) || (px > x0 - 6 && px < x1 + 6 && Math.abs(py - y1) < 6)
          || (py > y0 - 6 && py < y1 + 6 && Math.abs(px - x0) < 6) || (py > y0 - 6 && py < y1 + 6 && Math.abs(px - x1) < 6));
      }
      if (d.kind === 'fib') return Math.abs(px - Math.min(pts[0].x, pts[1].x)) < 10 || Math.abs(px - Math.max(pts[0].x, pts[1].x)) < 10
        || FIB_LEVELS.some((f) => Math.abs(py - (pts[0].y + (pts[1].y - pts[0].y) * f)) < 5);
      return near(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    }
    /** a finished or in-progress drawing, painted on top of the candles */
    function paint(d, alpha) {
      const m = state.map; if (!m) return;
      const pts = (d.points || []).map((pt) => ({ x: xForTime(pt.t), y: yForPrice(pt.p) }));
      if (!pts.length || pts.some((q) => q.x == null || q.y == null)) return;
      const col = (d.style && d.style.colour) || THEME.accent;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1.2;
      const dashOn = () => { if (ctx.setLineDash) ctx.setLineDash([5, 4]); };
      const dashOff = () => { if (ctx.setLineDash) ctx.setLineDash([]); };

      if (d.kind === 'hline' || d.kind === 'ray') {
        dashOn();
        ctx.beginPath(); ctx.moveTo(m.LEFT, pts[0].y); ctx.lineTo(m.RIGHT, pts[0].y); ctx.stroke();
        dashOff();
        LAB.put(fmt(d.points[0].p, dpFor(state.lo + state.hi / 2)), m.RIGHT + 4, pts[0].y + 3,
          { fg: col, bg: 'rgba(11,13,17,0.94)', border: col, axis: true, nudge: 4, pad: 3, maxWidth: m.W - m.RIGHT - 8 });
      } else if (d.kind === 'trend') {
        if (pts.length < 2) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 3, 0, 6.3); ctx.fill(); return; }
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
        [pts[0], pts[1]].forEach((q) => { ctx.beginPath(); ctx.arc(q.x, q.y, 2.5, 0, 6.3); ctx.fill(); });
      } else if (d.kind === 'rect') {
        if (pts.length < 2) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 3, 0, 6.3); ctx.fill(); return; }
        const x0 = Math.min(pts[0].x, pts[1].x), w = Math.abs(pts[1].x - pts[0].x);
        const y0 = Math.min(pts[0].y, pts[1].y), h = Math.abs(pts[1].y - pts[0].y);
        ctx.globalAlpha = alpha * 0.16; ctx.fillRect(x0, y0, w, h);
        ctx.globalAlpha = alpha; ctx.strokeRect(x0, y0, w, h);
      } else if (d.kind === 'fib') {
        if (pts.length < 2) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 3, 0, 6.3); ctx.fill(); return; }
        const x0 = Math.min(pts[0].x, pts[1].x), x1 = Math.max(pts[0].x, pts[1].x);
        const yA = pts[0].y, yB = pts[1].y;
        FIB_LEVELS.forEach((f) => {
          const yy = yA + (yB - yA) * f;
          const inOte = f >= 0.618 && f <= 0.786;
          ctx.globalAlpha = inOte ? alpha * 0.22 : alpha * 0.10;
          ctx.fillStyle = inOte ? THEME.accent : THEME.steel;
          ctx.fillRect(x0, Math.min(yy, yA + (yB - yA) * (f === 0 ? 1 : 0)) , x1 - x0, 1);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = col;
          ctx.strokeStyle = col;
          ctx.setLineDash && ctx.setLineDash(f === 0 || f === 1 ? [] : [3, 3]);
          ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
          ctx.setLineDash && ctx.setLineDash([]);
          const price = d.points[0].p + (d.points[1].p - d.points[0].p) * f;
          LAB.put(`${(f * 100).toFixed(1)}% ${fmt(price, 4)}`, x0 + 2, yy - 3,
            { fg: inOte ? THEME.accent : THEME.text, bg: 'rgba(11,13,17,0.85)', pad: 2 });
        });
      } else if (d.kind === 'measure') {
        if (pts.length < 2) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 3, 0, 6.3); ctx.fill(); return; }
        const up = d.points[1].p >= d.points[0].p;
        ctx.strokeStyle = up ? THEME.up : THEME.down;
        ctx.fillStyle = up ? THEME.up : THEME.down;
        const x0 = Math.min(pts[0].x, pts[1].x), w = Math.abs(pts[1].x - pts[0].x);
        const y0 = Math.min(pts[0].y, pts[1].y), h = Math.abs(pts[1].y - pts[0].y);
        ctx.globalAlpha = alpha * 0.14; ctx.fillRect(x0, y0, w, h);
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
        const dP = d.points[1].p - d.points[0].p;
        const dPct = (dP / d.points[0].p) * 100;
        const bars = Math.abs(barIndexAtTime(d.points[1].t) - barIndexAtTime(d.points[0].t));
        const atr = (o.smc && o.smc.atr) || 0;
        const txt = `${dP >= 0 ? '+' : ''}${fmt(dP, dpFor(d.points[0].p))}  (${dPct >= 0 ? '+' : ''}${dPct.toFixed(2)}%)  ·  ${bars} bars  ·  ${atr ? (dP / atr).toFixed(2) + ' ATR' : '—'}`;
        ctx.fillStyle = 'rgba(11,13,17,0.9)';
        ctx.font = '10px ui-monospace, Menlo, monospace';
        const tw = ctx.measureText(txt).width + 12;
        const tx = Math.min(Math.max(x0 + w / 2 - tw / 2, m.LEFT), m.RIGHT - tw);
        ctx.fillRect(tx, y0 - 20, tw, 17);
        ctx.fillStyle = up ? THEME.up : THEME.down;
        ctx.fillText(txt, tx + 6, y0 - 8);
      }
      ctx.restore();
      dashOff();
    }

    /* ── THE VISIBLE COUNT IS NOW DERIVED FROM THE REAL PIXEL WIDTH ────────────────
     * `bars` defaulted to 170 no matter how wide the panel was, so in a narrow column
     * each candle was about 2 px wide and the chart was unreadable — reported as "the
     * candles are too small". A fixed count can only ever be right at one width. Capping
     * the count by width guarantees a candle is never thinner than MIN_CANDLE_PX, which
     * makes the default legible in any container instead of only in a wide one, and it
     * keeps working when the panel is resized or the chart is expanded. */
    const MIN_CANDLE_PX = 5;
    function widthCap() {
      const W = plot.clientWidth || wrap.clientWidth || 900;
      return Math.max(20, Math.floor(W / MIN_CANDLE_PX));
    }

    function setBars(n) {
      const cap = widthCap();
      const hi = Math.min(500, Math.max(40, all.length), cap);
      state.bars = Math.round(Math.min(Math.max(n, Math.min(40, hi)), hi));
      draw();
    }

    function resize() {
      const dpr = global.devicePixelRatio || 1;
      const W = plot.clientWidth || wrap.clientWidth || 900;
      const H = state.expanded ? Math.max(520, Math.round((global.innerHeight || 800) * 0.68)) : (o.height || 460);
      canvas.width = Math.max(320, W) * dpr;
      canvas.height = H * dpr;
      canvas.style.width = '100%';
      canvas.style.height = H + 'px';
      state.W = W; state.H = H; state.dpr = dpr;
      /* Re-apply the width cap on every layout, using the W measured two lines above.
       * This MUST use that W and not re-read the element: at first paint the container has
       * not been laid out, clientWidth is 0, and the `|| 900` fallback inside widthCap()
       * yields a cap of 180 — which left the 170-bar default untouched in exactly the
       * narrow panel it was written for. The bug was reported back by the user as a
       * screenshot still reading "bars 170" after the fix shipped. */
      const cap = Math.max(20, Math.floor(W / MIN_CANDLE_PX));
      if (state.bars > cap) state.bars = cap;
      draw();
    }

    /* ------------------------------------------------------------- draw */
    function draw() {
      if (!ctx) return;
      const dpr = state.dpr || 1;
      const W = state.W || 900, H = state.H || 460;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = 'alphabetic';

      const bars = barsVisible();
      if (!bars.length) return;

      const smc = o.smc || {};
      const planLevels = (o.plan && o.plan.levels) || (o.plan && o.plan.entry != null ? o.plan : null);
      const pd = state.show.range ? (smc.premium_discount || null) : null;
      const zones = state.show.zones ? (smc.order_blocks || []).filter((z) => !z.breached).slice(0, 6) : [];
      const gaps = state.show.fvgs ? (smc.fvgs || []).filter((g) => !g.filled).slice(0, 5) : [];
      const allPools = (smc.liquidity && smc.liquidity.pools) || [];
      const pools = state.show.pools
        ? allPools.filter((p) => !p.swept).slice(0, 5)
          .concat(allPools.filter((p) => p.swept).slice(0, 3))
        : [];
      const sweeps = state.show.sweeps ? (smc.sweeps || []).slice(0, 4) : [];
      const breaks = state.show.structure && smc.structure ? (smc.structure.breaks || []).slice(-2) : [];
      const labels = state.show.structure && smc.structure ? (smc.structure.recent_labels || []).slice(-7) : [];

      /* ---------------------------------------------------- label placer */
      const LAB = labeller(ctx, state);
      // Captions are queued so that the things a trader must read win the space:
      //   1. plan pills (placed immediately, in the price-axis strip)
      //   2. LAB_MID  — the dealing range and the OTE band on top of the candles
      //   3. LAB_LATE — zones, structure marks, pools, sweeps
      // The *lines* are all drawn in the pass that owns them, so the geometry is
      // never reordered — only the text placement is prioritised.
      const LAB_MID = [];
      const LAB_LATE = [];

      /* ----------------------------------------------------- the frame */
      const LEFT = 10;
      const RIGHT = W - 112;
      const TOP = 22;                                     // room for killzone labels
      const VOLH = state.show.volume ? 54 : 0;
      const BOTTOM = H - 22 - VOLH;
      const volTop = BOTTOM + 6;
      const volBottom = H - 22;

      /* ------------------------------------------------- price window */
      let lo = Infinity, hi = -Infinity;
      bars.forEach((b) => { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); });
      const widen = (a, b) => {
        if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return;
        lo = Math.min(lo, a, b); hi = Math.max(hi, a, b);
      };
      zones.forEach((z) => widen(z.bottom, z.top));
      gaps.forEach((g) => widen(g.bottom, g.top));
      pools.forEach((p) => widen(p.price, p.price));
      if (pd) widen(pd.range_low, pd.range_high);
      if (planLevels) {
        widen(planLevels.entry, planLevels.entry);
        widen(planLevels.stop, planLevels.stop);
        (planLevels.targets || []).forEach((t) => widen(t.price, t.price));
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) { hi = lo + 1; }
      const pad = (hi - lo) * 0.07;
      lo -= pad; hi += pad;
      state.lo = lo; state.hi = hi;

      const y = (p) => TOP + ((hi - p) / (hi - lo)) * (BOTTOM - TOP);
      const step = (RIGHT - LEFT) / bars.length;
      const x = (i) => LEFT + i * step + step / 2;
      const priceAt = (py) => hi - ((py - TOP) / (BOTTOM - TOP)) * (hi - lo);
      const dp = dpFor((hi + lo) / 2);

      // publish the mapping so the drawing tools (which run outside draw()) can
      // turn a pointer position into the same time/price the chart is showing
      const vr = visibleRange();
      state.map = {
        LEFT, RIGHT, TOP, BOTTOM, step, lo, hi, W, H,
        from: vr.from, end: vr.end,
        firstT: Number(bars[0].t), lastT: Number(bars[bars.length - 1].t),
      };
      // The view window as data attributes: a test (or the trader, in the
      // console) can read what the chart is actually showing — bars on screen,
      // first and last bar index — without reaching into this closure.
      // What this frame actually painted, in screen px, with the source bar for
      // every time-based overlay. Tests (and anyone in the console) can check
      // that an overlay is anchored to its bar rather than to the screen.
      const tjDraw = { bars: state.bars, from: vr.from, end: vr.end, zones: [], gaps: [], pools: [], plan: null };
      wrap.__tjDraw = tjDraw;
      wrap.dataset.tjBars = String(state.bars);
      wrap.dataset.tjFrom = String(vr.from);
      wrap.dataset.tjEnd = String(vr.end);
      wrap.dataset.tjPlot = `${LEFT},${RIGHT},${TOP},${BOTTOM}`;

      /* ------------------------------------------------------ gridlines */
      ctx.lineWidth = 1;
      const pstep = niceStep(hi - lo, 7);
      let first = Math.ceil(lo / pstep) * pstep;
      ctx.font = '10px ui-monospace, Menlo, monospace';
      for (let p = first; p <= hi; p += pstep) {
        const yy = Math.round(y(p)) + 0.5;
        ctx.strokeStyle = THEME.grid;
        ctx.beginPath(); ctx.moveTo(LEFT, yy); ctx.lineTo(RIGHT, yy); ctx.stroke();
        ctx.fillStyle = THEME.text;
        ctx.fillText(fmt(p, dp), RIGHT + 6, yy + 3);
      }

      /* time gridlines: one per killzone boundary or per N bars */
      const spanMs = (bars[bars.length - 1].t - bars[0].t) || 1;
      const targetTicks = Math.max(3, Math.floor((RIGHT - LEFT) / 130));
      const tickEvery = Math.max(1, Math.round(bars.length / targetTicks));
      for (let i = 0; i < bars.length; i += tickEvery) {
        const xx = Math.round(x(i)) + 0.5;
        ctx.strokeStyle = THEME.grid;
        ctx.beginPath(); ctx.moveTo(xx, TOP); ctx.lineTo(xx, volBottom); ctx.stroke();
        ctx.fillStyle = THEME.text;
        const label = timeLabel(bars[i].t, spanMs);
        ctx.fillText(label, Math.min(RIGHT - ctx.measureText(label).width, xx + 4), H - 7);
      }
      ctx.strokeStyle = THEME.gridStrong;
      ctx.beginPath(); ctx.moveTo(LEFT, BOTTOM + 0.5); ctx.lineTo(RIGHT, BOTTOM + 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(RIGHT + 0.5, TOP); ctx.lineTo(RIGHT + 0.5, volBottom); ctx.stroke();

      /* -------------------------------------------------- killzone bands */
      if (state.show.sessions) {
        let runStart = null, runKz = null;
        const flush = (uptoIdx) => {
          if (runKz && runStart != null && uptoIdx > runStart) {
            const x0 = LEFT + runStart * step;
            const width = (uptoIdx - runStart) * step;      // never subtract two absolute x's: fp cancellation
            const x1 = x0 + width;
            const grad = ctx.createLinearGradient(0, TOP, 0, BOTTOM);
            grad.addColorStop(0, runKz.key === 'london' ? 'rgba(63,127,224,0.075)' : runKz.key === 'asia' ? 'rgba(122,132,148,0.05)' : 'rgba(207,154,69,0.06)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x0, TOP, Math.max(1, width), BOTTOM - TOP);
            // The caption has to fit the band, otherwise a 3-hour killzone on an
            // hourly chart prints "London" over "Asia". Try the full name, then
            // the short one, then a coloured notch in the top margin.
            const short = { asia: 'ASIA', london: 'LDN', ny_am: 'NY', ny_pm: 'PM' }[runKz.key] || '';
            const colour = runKz.key === 'london' ? 'rgba(63,127,224,0.85)' : runKz.key === 'asia' ? 'rgba(153,161,175,0.8)' : 'rgba(207,154,69,0.85)';
            ctx.font = '9px ui-monospace, Menlo, monospace';
            ctx.fillStyle = colour;
            if (ctx.measureText(runKz.label).width + 8 <= width) ctx.fillText(runKz.label, x0 + 3, TOP - 8);
            else if (short && ctx.measureText(short).width + 8 <= width) ctx.fillText(short, x0 + 3, TOP - 8);
            else { ctx.fillRect(x0, TOP - 13, 5, 5); }        // notch: present, but no room to spell it
          }
          runStart = null; runKz = null;
        };
        bars.forEach((b, i) => {
          const kz = killzoneAt(b.t);
          const key = kz ? kz.key : null;
          const cur = runKz ? runKz.key : null;
          if (key !== cur) { flush(i); if (kz) { runStart = i; runKz = kz; } }
        });
        flush(bars.length);
      }

      /* ------------------------------------------------ dealing range */
      if (pd) {
        // the dealing range starts at the older of the two swings that define it
        const rangeStart = [pd.low_t, pd.high_t].filter((t) => Number.isFinite(Number(t))).sort((a, b) => a - b)[0];
        const rx0 = rangeStart ? anchorX({ t: rangeStart }, LEFT) : LEFT;
        const rw = Math.max(2, RIGHT - rx0);
        ctx.fillStyle = THEME.premium;
        ctx.fillRect(rx0, y(pd.range_high), rw, Math.max(0, y(pd.mid) - y(pd.range_high)));
        ctx.fillStyle = THEME.discount;
        ctx.fillRect(rx0, y(pd.mid), rw, Math.max(0, y(pd.range_low) - y(pd.mid)));
        ctx.font = '9px ui-monospace, Menlo, monospace';
        const mark = (price, label, style, colour) => {
          const yy = Math.round(y(price)) + 0.5;
          dash(ctx, true, style);
          ctx.strokeStyle = 'rgba(122,132,148,0.5)';
          ctx.beginPath(); ctx.moveTo(LEFT, yy); ctx.lineTo(RIGHT, yy); ctx.stroke();
          dash(ctx, false);
          LAB_MID.push(() => LAB.put(label, LEFT + 4, yy - 3, { fg: colour || THEME.faint, bg: 'rgba(11,13,17,0.78)', nudge: 2 }));
        };
        mark(pd.range_high, `range high ${fmt(pd.range_high, dp)}`, [3, 5], THEME.steel);
        mark(pd.mid, `EQ 50% ${fmt(pd.mid, dp)}`, [2, 4], THEME.text);
        mark(pd.range_low, `range low ${fmt(pd.range_low, dp)}`, [3, 5], THEME.steel);
        if (pd.ote_band) {
          const a = Math.min(y(pd.ote_band[0]), y(pd.ote_band[1]));
          const b = Math.max(y(pd.ote_band[0]), y(pd.ote_band[1]));
          ctx.fillStyle = 'rgba(63,127,224,0.07)';
          ctx.fillRect(rx0, a, rw, Math.max(1, b - a));
          if (b - a >= 12) {
            LAB_MID.push(() => LAB.put(`OTE ${fmt(pd.ote_band[0], dp)}–${fmt(pd.ote_band[1], dp)}`, RIGHT - 6, a - 3,
              { fg: 'rgba(63,127,224,0.95)', align: 'right', bg: 'rgba(11,13,17,0.78)' }));
          }
        }
      }

      /* ------------------------------------------------------- volume */
      if (state.show.volume) {
        const vmax = Math.max(1, ...bars.map((b) => b.v || 0));
        bars.forEach((b, i) => {
          if (!b.v) return;
          const h = ((b.v / vmax) * (volBottom - volTop)) * 0.92;
          ctx.fillStyle = b.c >= b.o ? 'rgba(42,168,119,0.35)' : 'rgba(217,84,103,0.32)';
          ctx.fillRect(x(i) - Math.max(1, step * 0.3), volBottom - h, Math.max(1, step * 0.6), h);
        });
        ctx.fillStyle = THEME.faint;
        ctx.font = '9px ui-monospace, Menlo, monospace';
        ctx.fillText('volume', LEFT + 2, volTop + 9);
      }

      /* --------------------------------------------------- fvg + zones */
      gaps.forEach((g) => {
        const top = y(g.top), bot = y(g.bottom);
        const x0 = anchorX(g, LEFT);
        const w = Math.max(2, RIGHT - x0);
        tjDraw.gaps.push({ i: anchorIndex(g), t: g.t == null ? null : Number(g.t), x0: Math.round(x0), x1: Math.round(x0 + w), filled: !!g.filled });
        ctx.fillStyle = THEME.fvg;
        ctx.fillRect(x0, top, w, Math.max(1, bot - top));
        dash(ctx, true, [3, 3]);
        ctx.strokeStyle = THEME.fvgEdge;
        ctx.strokeRect(x0 + 0.5, top + 0.5, w - 1, Math.max(1, bot - top));
        dash(ctx, false);
        if (g.mid != null) {
          dash(ctx, true, [2, 4]);
          ctx.strokeStyle = 'rgba(122,132,148,0.3)';
          ctx.beginPath(); ctx.moveTo(x0, y(g.mid)); ctx.lineTo(RIGHT, y(g.mid)); ctx.stroke();
          dash(ctx, false);
        }
        LAB.put(`FVG ${g.dir > 0 ? 'bull' : 'bear'}`, RIGHT - 6, top + 10, { fg: THEME.steel, align: 'right', bg: 'rgba(11,13,17,0.7)' });
      });

      zones.forEach((z) => {
        const isDemand = z.dir > 0 || z.side === 'demand';
        const top = y(z.top), bot = y(z.bottom);
        // the box starts at the candle that created it and runs to the right edge
        const x0 = anchorX(z, LEFT);
        const w = Math.max(2, RIGHT - x0);
        tjDraw.zones.push({ i: anchorIndex(z), i0: z.i, t: z.t == null ? null : Number(z.t), x0: Math.round(x0), x1: Math.round(x0 + w), top: Math.round(top), bottom: Math.round(bot), side: isDemand ? 'demand' : 'supply' });
        ctx.fillStyle = isDemand ? THEME.zoneDemand : THEME.zoneSupply;
        ctx.fillRect(x0, top, w, Math.max(1, bot - top));
        ctx.strokeStyle = isDemand ? THEME.zoneDemandEdge : THEME.zoneSupplyEdge;
        ctx.strokeRect(x0 + 0.5, top + 0.5, w - 1, Math.max(1, bot - top));
        const text = `${isDemand ? 'DEMAND' : 'SUPPLY'}${z.fresh ? ' · fresh' : z.tests ? ` · ${z.tests} test${z.tests > 1 ? 's' : ''}` : ''}`;
        LAB_LATE.push(() => LAB.put(text, x0 + 4, top - 3, {
          fg: isDemand ? THEME.up : THEME.down, bg: 'rgba(11,13,17,0.82)', nudge: 3, pad: 3,
          font: '9px ui-monospace, Menlo, monospace',
        }));
      });

      /* ------------------------------------------------------- pools */
      pools.forEach((p) => {
        const yy = Math.round(y(p.price)) + 0.5;
        const isBsl = p.type === 'BSL';
        dash(ctx, true, p.swept ? [2, 5] : [7, 5]);
        ctx.strokeStyle = p.swept ? 'rgba(122,132,148,0.45)' : (isBsl ? 'rgba(63,127,224,0.8)' : 'rgba(207,154,69,0.8)');
        const x0 = anchorX(p, LEFT);          // a ray: starts where the pool formed
        tjDraw.pools.push({ label: p.label || p.kind || null, t: p.t == null ? null : Number(p.t), i: anchorIndex(p), x0: Math.round(x0), x1: Math.round(RIGHT), price: Number(p.price) });
        ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(RIGHT, yy); ctx.stroke();
        dash(ctx, false);
        LAB_LATE.push(() => LAB.put(`${p.type} ${p.label || p.kind || ''}${p.swept ? ' (taken)' : ''}`, x0 + 4, yy + 10, {
          fg: p.swept ? THEME.faint : THEME.text, bg: 'rgba(11,13,17,0.72)', nudge: 2, pad: 3,
          font: '9px ui-monospace, Menlo, monospace',
        }));
        LAB_LATE.push(() => LAB.put(fmt(p.price, dp), RIGHT + 6, yy + 3, {
          fg: THEME.faint, axis: true, nudge: 1, pad: 3, font: '9px ui-monospace, Menlo, monospace',
        }));
      });

      /* ------------------------------------------------------ candles */
      const bodyW = Math.max(1.5, Math.min(step * 0.66, 13));
      bars.forEach((b, i) => {
        const up = b.c >= b.o;
        const cx = x(i);
        ctx.strokeStyle = up ? THEME.up : THEME.down;
        ctx.fillStyle = up ? THEME.up : THEME.down;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(cx) + 0.5, y(b.h));
        ctx.lineTo(Math.round(cx) + 0.5, y(b.l));
        ctx.stroke();
        const yo = y(b.o), yc = y(b.c);
        const top = Math.min(yo, yc);
        const h = Math.max(1, Math.abs(yc - yo));
        ctx.fillRect(cx - bodyW / 2, top, bodyW, h);
      });

      /* --------------------------------------------------- structure */
      labels.forEach((l) => {
        const i = bars.findIndex((b) => Math.abs(new Date(b.t).getTime() - new Date(l.t).getTime()) < 1);
        if (i < 0) return;
        const isHigh = l.type === 'high';
        const yy = y(l.price) + (isHigh ? -6 : 12);
        const colour = l.label === 'HH' || l.label === 'HL' ? THEME.up : l.label === 'LH' || l.label === 'LL' ? THEME.down : THEME.text;
        LAB_LATE.push(() => LAB.put(l.label, x(i) - 8, yy, {
          fg: colour, bg: 'rgba(11,13,17,0.6)', nudge: 1, pad: 2, font: '9px ui-monospace, Menlo, monospace',
        }));
      });
      breaks.forEach((brk) => {
        const i = bars.findIndex((b) => Math.abs(new Date(b.t).getTime() - new Date(brk.t).getTime()) < 1);
        if (i < 0) return;
        const yy = y(brk.level);
        dash(ctx, true, [5, 3]);
        ctx.strokeStyle = brk.type === 'MSS' ? (brk.dir === 'up' ? THEME.up : THEME.down) : 'rgba(153,161,175,0.6)';
        ctx.beginPath(); ctx.moveTo(x(i), yy); ctx.lineTo(RIGHT, yy); ctx.stroke();
        dash(ctx, false);
        LAB_LATE.push(() => LAB.put(brk.type + (brk.dir === 'up' ? ' up' : ' down'), x(i) + 3, yy - 4, {
          fg: brk.dir === 'up' ? THEME.up : THEME.down, bg: 'rgba(11,13,17,0.85)', nudge: 2, pad: 3,
          font: '9px ui-monospace, Menlo, monospace',
        }));
      });

      /* ------------------------------------------------------ sweeps */
      sweeps.forEach((s, sIdx) => {
        let i = bars.findIndex((b) => Math.abs(new Date(b.t).getTime() - new Date(s.t).getTime()) < 1);
        if (i < 0) i = Math.max(0, bars.length - 1 - (s.bars_ago || 0));
        const px = x(i);
        const py = y(s.extreme != null ? s.extreme : s.level);
        const up = s.type === 'SSL';
        ctx.fillStyle = up ? THEME.up : THEME.down;
        ctx.beginPath();
        if (up) { ctx.moveTo(px, py + 10); ctx.lineTo(px - 5, py + 2); ctx.lineTo(px + 5, py + 2); }
        else { ctx.moveTo(px, py - 10); ctx.lineTo(px - 5, py - 2); ctx.lineTo(px + 5, py - 2); }
        ctx.closePath(); ctx.fill();
        if (sIdx >= 2) return;                     // older sweeps keep the arrow, lose the caption
        LAB_LATE.push(() => LAB.put('sweep', px + 7, py + (up ? 12 : -6), {
          fg: THEME.text, bg: 'rgba(11,13,17,0.7)', nudge: 2, pad: 3, font: '9px ui-monospace, Menlo, monospace',
        }));
      });

      /* --------------------------------------------------------- plan */
      /* --------------------------------------------------------- studies */
      if (state.studies.ema50 || state.studies.ema200 || state.studies.vwap) {
        const st = studiesFor(all);
        const vFrom = Math.max(0, all.length - state.offset - state.bars);
        const vTo = Math.max(20, all.length - state.offset);
        const line = (arr, colour, label) => {
          if (!arr) return;
          ctx.strokeStyle = colour;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          let started = false;
          for (let i = vFrom; i < vTo; i++) {
            const v = arr[i];
            if (v === null || v === undefined) { started = false; continue; }
            const px = x(i - vFrom), py = y(v);
            if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
          }
          ctx.stroke();
          const lastI = vTo - 1;
          if (arr[lastI] != null) {
            LAB.put(`${label} ${fmt(arr[lastI], dp)}`, x(lastI - vFrom) + 4, y(arr[lastI]) - 4,
              { fg: colour, bg: 'rgba(11,13,17,0.8)', pad: 2 });
          }
        };
        if (state.studies.ema50) line(st.ema50, THEME.amber, 'EMA50');
        if (state.studies.ema200) line(st.ema200, '#9b7fd4', 'EMA200');
        if (state.studies.vwap) line(st.vwap, THEME.accent, 'VWAP');
      }

      /* -------------------------------------------------------- drawings */
      if (state.drawings.length || state.pending) {
        state.drawings.forEach((d, i) => paint(d, i === state.selected ? 1 : 0.9));
        if (state.pending) paint(state.pending, 0.7);
      }

      if (planLevels && state.show.plan) {
        const d = planLevels;
        const entryY = y(d.entry);
        const stopY = y(d.stop);
        // The plan box starts where the plan was born — at the sweep that provoked it
        // (or at the newest few bars when there is no sweep in the window) — and runs
        // right, instead of being painted across the whole chart.
        const planOrigin = (sweeps && sweeps.length ? anchorX(sweeps[0], null) : null);
        const px0 = planOrigin !== null ? planOrigin : Math.max(LEFT, RIGHT - Math.min(24, bars.length * 0.2) * step);
        const pw = Math.max(2, RIGHT - px0);
        tjDraw.plan = { x0: Math.round(px0), x1: Math.round(RIGHT), i: anchorIndex((sweeps || [])[0]) };
        ctx.fillStyle = THEME.risk;
        ctx.fillRect(px0, Math.min(entryY, stopY), pw, Math.max(1, Math.abs(stopY - entryY)));
        ctx.strokeStyle = 'rgba(217,84,103,0.5)';
        dash(ctx, true, [4, 3]);
        ctx.strokeRect(px0 + 0.5, Math.min(entryY, stopY) + 0.5, pw - 1, Math.max(1, Math.abs(stopY - entryY)));
        dash(ctx, false);
        // reward boxes, target by target
        let prevY = entryY;
        (d.targets || []).forEach((t) => {
          const ty = y(t.price);
          ctx.fillStyle = THEME.reward;
          ctx.fillRect(px0, Math.min(prevY, ty), pw, Math.max(1, Math.abs(ty - prevY)));
          prevY = ty;
        });
        const line = (price, colour, label, pattern) => {
          const yy = Math.round(y(price)) + 0.5;
          dash(ctx, !!pattern, pattern);
          ctx.strokeStyle = colour; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(px0, yy); ctx.lineTo(RIGHT, yy); ctx.stroke();
          ctx.lineWidth = 1; dash(ctx, false);
          LAB.put(label, RIGHT + 4, yy + 3, {
            fg: colour, bg: 'rgba(11,13,17,0.94)', border: colour, axis: true,
            nudge: 4, pad: 3, maxWidth: W - RIGHT - 8,
          });
          return true;
        };
        line(d.stop, THEME.down, `stop ${fmt(d.stop, dp)}`);
        line(d.entry, THEME.accent, `entry ${fmt(d.entry, dp)}`, [6, 4]);
        (d.targets || []).forEach((t) => line(t.price, THEME.up, `${t.role || 'T'} ${fmt(t.price, dp)} · ${t.rr}R`));
      }

      /* --------------------------------------------------- last price */
      if (last) {
        const yy = Math.round(y(last.c)) + 0.5;
        ctx.strokeStyle = 'rgba(153,161,175,0.35)';
        dash(ctx, true, [2, 3]);
        ctx.beginPath(); ctx.moveTo(LEFT, yy); ctx.lineTo(RIGHT, yy); ctx.stroke();
        dash(ctx, false);
        const text = fmt(last.c, dp);
        ctx.font = '10px ui-monospace, Menlo, monospace';
        const w = ctx.measureText(text).width + 10;
        ctx.fillStyle = chg >= 0 ? THEME.up : THEME.down;
        ctx.fillRect(RIGHT + 1, yy - 8, w, 16);
        ctx.fillStyle = '#08120e';
        ctx.fillText(text, RIGHT + 6, yy + 3);
      }

      LAB_MID.forEach((fn) => fn());
      LAB_LATE.forEach((fn) => fn());

      /* ------------------------------------------------------ crosshair */
      if (state.hover) {
        const { px, py } = state.hover;
        const i = Math.min(bars.length - 1, Math.max(0, Math.floor((px - LEFT) / step)));
        const b = bars[i];
        state.hoverIdx = i;
        ctx.strokeStyle = THEME.crosshair;
        dash(ctx, true, [3, 3]);
        ctx.beginPath(); ctx.moveTo(Math.round(x(i)) + 0.5, TOP); ctx.lineTo(Math.round(x(i)) + 0.5, volBottom); ctx.stroke();
        if (py > TOP && py < BOTTOM) {
          ctx.beginPath(); ctx.moveTo(LEFT, Math.round(py) + 0.5); ctx.lineTo(RIGHT, Math.round(py) + 0.5); ctx.stroke();
          dash(ctx, false);
          const pv = priceAt(py);
          ctx.font = '10px ui-monospace, Menlo, monospace';
          const t = fmt(pv, dp);
          const w = ctx.measureText(t).width + 10;
          ctx.fillStyle = '#22262f';
          ctx.fillRect(RIGHT + 1, py - 8, w, 16);
          ctx.fillStyle = THEME.textStrong;
          ctx.fillText(t, RIGHT + 6, py + 3);
        }
        dash(ctx, false);
        // OHLCV legend, always top-left, frozen while hovering
        const up = b.c >= b.o;
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.fillStyle = 'rgba(11,13,17,0.88)';
        const legend = `${new Date(b.t).toISOString().slice(0, 16).replace('T', ' ')}Z   O ${fmt(b.o, dp)}  H ${fmt(b.h, dp)}  L ${fmt(b.l, dp)}  C ${fmt(b.c, dp)}  ${b.v ? 'V ' + nf(b.v) : ''}`;
        ctx.fillRect(LEFT, TOP - 21, ctx.measureText(legend).width + 14, 17);
        ctx.fillStyle = up ? THEME.up : THEME.down;
        ctx.fillText(legend, LEFT + 7, TOP - 9);
      }

      /* ------------------------------------------------ range summary */
      const rHigh = Math.max(...bars.map((b) => b.h));
      const rLow = Math.min(...bars.map((b) => b.l));
      readout.innerHTML = `<span class="chart-k">range shown</span> <b>${fmt(rLow, dp)} – ${fmt(rHigh, dp)}</b>`
        + `<span class="chart-k">bars</span> <b>${bars.length}</b>`
        + `<span class="chart-k">ATR</span> <b>${smc.atr ? fmt(smc.atr, dp) : '—'}</b>`
        + `<span class="chart-k">structure</span> <b>${(smc.structure && smc.structure.trend) || '—'}</b>`
        + `<span class="chart-k">vendors</span> <b>${(o.meta && o.meta.provider) || '—'}</b>`
        + (state.offset ? `<button class="chart-btn" id="chart-live">jump to latest</button>` : '')
        + (state.replay ? `<span class="chart-replay">REPLAY · ${state.replay.trim} bar${state.replay.trim === 1 ? '' : 's'} back</span>` : '');
      const live = readout.querySelector('#chart-live');
      if (live) live.addEventListener('click', () => { state.offset = 0; draw(); });
    }

    /* ------------------------------------------------------- interaction */
    let raf = 0;
    const schedule = () => { if (!raf) raf = global.requestAnimationFrame ? global.requestAnimationFrame(() => { raf = 0; draw(); }) : setTimeout(() => { raf = 0; draw(); }, 16); };

    const isDrawing = () => state.tool && state.tool !== 'cursor';

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (state.drag) {
        const perBar = (state.W - 10 - 112) / state.bars;
        const moved = state.drag.px - px;
        const barsMove = Math.round(moved / perBar);
        if (barsMove) {
          state.offset = Math.min(Math.max(state.offset + barsMove, 0), Math.max(0, all.length - 40));
          state.drag.px = px;
        }
      } else if (state.pending) {
        // a tool is mid-click: the second point follows the pointer (move or drag)
        const q = probe(px, py);
        if (q) state.pending.points[1] = { t: q.t, p: q.p };
      }
      state.hover = { px, py };
      // highlight the drawing the pointer is over (cursor mode only)
      if (!isDrawing()) {
        const found = state.drawings.findIndex((d) => hit(d, px, py));
        if (found !== state.selected) state.selected = found;
      }
      schedule();
    });
    canvas.addEventListener('mouseleave', () => { state.hover = null; schedule(); });
    canvas.addEventListener('mousedown', (e) => {
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (isDrawing()) {
        e.preventDefault();
        const q = probe(px, py);
        if (!q) return;
        if (!state.pending) {
          state.pending = { kind: state.tool, points: [{ t: q.t, p: q.p }, { t: q.t, p: q.p }], style: { colour: THEME.accent } };
          if (state.tool === 'hline') { state.drawings.push(state.pending); state.pending = null; commitDrawings(); }
        } else {
          const a = state.pending.points[0], b = state.pending.points[1];
          if (Math.abs(a.p - b.p) > 1e-9 || Math.abs(a.t - b.t) > 0) {
            state.drawings.push({ kind: state.pending.kind, points: [a, b], style: state.pending.style });
            commitDrawings();
          }
          state.pending = null;
        }
        schedule();
        return;
      }
      state.drag = { px };
      canvas.style.cursor = 'grabbing';
    });
    global.addEventListener('mouseup', () => {
      if (state.drag) { state.drag = null; canvas.style.cursor = 'crosshair'; }
    });
    // Esc cancels a half-drawn shape, Delete removes the selected one
    global.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.pending) { state.pending = null; schedule(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected >= 0) {
        state.drawings.splice(state.selected, 1);
        state.selected = -1;
        commitDrawings();
        schedule();
      }
    });
    canvas.addEventListener('dblclick', () => { state.offset = 0; state.bars = Math.min(170, all.length); draw(); });
    // The wheel belongs to the page. Zooming on a bare wheel over a 600-px chart
    // hijacked two-finger scrolling, so zoom now needs the modifier every charting
    // platform uses: Ctrl/⌘ + wheel. Everything else keeps scrolling normally.
    canvas.addEventListener('wheel', (e) => {
      // Over the price axis the wheel zooms, exactly like every charting platform
      // (the axis is a control, not a page). Over the candles it does nothing
      // unless Ctrl/⌘ is held, so the page still scrolls under the pointer.
      const m = state.map;
      const overAxis = !!(m && e.offsetX > m.RIGHT);
      if (!overAxis && !(e.ctrlKey || e.metaKey)) return;   // let the page scroll
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1.25 : 0.8;
      setBars(state.bars * dir);
    }, { passive: false });
    canvas.style.cursor = 'crosshair';

    global.addEventListener('resize', () => { resize(); });
    /* The first resize() can run before layout, when clientWidth is still 0 and the cap
     * falls back to a guess. Measuring again on the next frame costs one redraw and makes
     * the candle width correct on load instead of only after the first window resize. */
    /* Guarded: chart-test renders this module in plain Node, which has no
     * requestAnimationFrame, and an unguarded call took the suite from 36/0 to 2/3. */
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { resize(); });
    else setTimeout(() => { resize(); }, 0);

    // the plot box is often laid out after the first paint; observe it
    if (global.ResizeObserver) {
      try { new global.ResizeObserver(() => resize()).observe(plot); } catch (e) { /* older engines */ }
    }
    setTimeout(resize, 0);
    resize();

    return wrap;
  }

  /* ============================================================ mini chart
     Compact panel used for the top-down timeframe stack: candles, the last
     price, the key level that matters on that timeframe, and a bias strip.  */
  function mini(opts) {
    const o = opts || {};
    const candles = (o.candles || []).filter((b) => b && b.t != null);
    const wrap = document.createElement('div');
    wrap.className = 'mini' + (o.tone ? ' mini-' + o.tone : '');
    const head = document.createElement('div');
    head.className = 'mini-head';
    head.innerHTML = `<span class="mini-label">${o.label || ''}</span><span class="mini-sub">${o.sub || ''}</span>`;
    wrap.appendChild(head);

    const canvas = document.createElement('canvas');
    canvas.className = 'mini-canvas';
    wrap.appendChild(canvas);

    const H = o.height || 120;
    let ctx = null;
    try { ctx = canvas.getContext && canvas.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx || !candles.length) {
      const p = document.createElement('div');
      p.className = 'mini-empty';
      p.textContent = candles.length ? 'no canvas here' : 'no data';
      wrap.appendChild(p);
      return wrap;
    }

    function draw() {
      const dpr = global.devicePixelRatio || 1;
      const W = canvas.clientWidth || wrap.clientWidth || 320;
      canvas.width = Math.max(120, W) * dpr;
      canvas.height = H * dpr;
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, W, H);
      const bars = candles.slice(-90);
      let lo = Infinity, hi = -Infinity;
      bars.forEach((b) => { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); });
      (o.levels || []).forEach((l) => { if (Number.isFinite(l.price)) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); } });
      const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
      const y = (p) => 6 + ((hi - p) / (hi - lo)) * (H - 12);
      const step = (W - 4) / bars.length;
      const bw = Math.max(1, Math.min(step * 0.66, 7));
      bars.forEach((b, i) => {
        const up = b.c >= b.o;
        const cx = 2 + i * step + step / 2;
        ctx.strokeStyle = up ? THEME.up : THEME.down;
        ctx.fillStyle = up ? THEME.up : THEME.down;
        ctx.beginPath();
        ctx.moveTo(Math.round(cx) + 0.5, y(b.h)); ctx.lineTo(Math.round(cx) + 0.5, y(b.l)); ctx.stroke();
        ctx.fillRect(cx - bw / 2, Math.min(y(b.o), y(b.c)), bw, Math.max(1, Math.abs(y(b.c) - y(b.o))));
      });
      (o.levels || []).forEach((l) => {
        if (!Number.isFinite(l.price)) return;
        const yy = Math.round(y(l.price)) + 0.5;
        dash(ctx, true, [3, 4]);
        ctx.strokeStyle = l.colour || 'rgba(153,161,175,0.6)';
        ctx.beginPath(); ctx.moveTo(2, yy); ctx.lineTo(W - 2, yy); ctx.stroke();
        dash(ctx, false);
        ctx.font = '9px ui-monospace, Menlo, monospace';
        ctx.fillStyle = THEME.faint;
        ctx.fillText(l.text || '', 4, yy - 3);
      });
      const last = bars[bars.length - 1];
      const yy = Math.round(y(last.c)) + 0.5;
      ctx.strokeStyle = 'rgba(153,161,175,0.4)';
      ctx.beginPath(); ctx.moveTo(2, yy); ctx.lineTo(W - 2, yy); ctx.stroke();
    }

    global.addEventListener('resize', draw);
    setTimeout(draw, 0);
    if (global.ResizeObserver) { try { new global.ResizeObserver(() => draw()).observe(wrap); } catch (e) {} }
    draw();
    return wrap;
  }

  global.Chart = { render, mini, THEME, KILLZONES };
})(window);
