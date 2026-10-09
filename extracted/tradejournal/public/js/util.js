/* util.js — formatting, DOM helpers, SVG chart engine. No dependencies. */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------ formatting */
  const nf = (v, dp = 2) => (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toFixed(dp);
  function money(v, dp) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const n = Number(v);
    const abs = Math.abs(n);
    const d = dp !== undefined ? dp : (abs >= 1000 ? 0 : 2);
    return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function moneySign(v, dp) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const n = Number(v);
    return (n > 0 ? '+' : n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp !== undefined ? dp : 2, maximumFractionDigits: dp !== undefined ? dp : 2 });
  }
  const signed = (v, dp = 2, suffix = '') => (v === null || v === undefined || isNaN(v)) ? '—' : (Number(v) > 0 ? '+' : '') + Number(v).toFixed(dp) + suffix;
  const pct = (v, dp = 1) => (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toFixed(dp) + '%';
  const num = (v, dp = 2) => (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toFixed(dp);
  const R = (v, dp = 2) => (v === null || v === undefined || isNaN(v)) ? '—' : (Number(v) > 0 ? '+' : '') + Number(v).toFixed(dp) + 'R';
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted');
  const rClass = (v) => (Number(v) > 0.05 ? 'pos' : Number(v) < -0.05 ? 'neg' : 'muted');
  const signCls = (v) => (v === null || v === undefined ? '' : Number(v) > 0 ? 'pos' : Number(v) < 0 ? 'neg' : '');
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const compact = (v) => {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const n = Number(v), a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e9) return s + (a / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return s + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return s + (a / 1e3).toFixed(1) + 'k';
    return s + (a >= 1000 ? a.toLocaleString('en-US', { maximumFractionDigits: 0 }) : a.toFixed(a < 10 ? 2 : 0));
  };
  const price = (v) => {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const n = Number(v), a = Math.abs(n);
    const dp = a >= 1000 ? 2 : a >= 100 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : 5;
    return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  };
  function dur(minutes) {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
    const m = Math.round(Number(minutes));
    if (m < 60) return m + 'm';
    if (m < 1440) return (m / 60).toFixed(m < 600 ? 1 : 0) + 'h';
    return (m / 1440).toFixed(1) + 'd';
  }
  function dt(iso, opts) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, ...(opts || {}) });
  }
  const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  function ago(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  /** Adherence shown as a plain fraction: no star glyphs, no emoji. */
  const rating = (n) => (n == null || n === '') ? '—' : `${Math.max(0, Math.min(5, Math.round(Number(n))))}/5`;

  /* --------------------------------------------------------------- DOM */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  /* ------------------------------------------------------------- charts */
  const CH = { height: 240 };

  function niceTicks(min, max, count = 4) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let v = start; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  /**
   * Line / area chart with optional drawdown shading and positive-colour.
   * series: [{ name, points:[{x:index|Date, y}], color, fill, dashed }]
   */
  function lineChart(container, opts) {
    const o = Object.assign({ height: 240, padding: { t: 14, r: 14, b: 22, l: 54 }, yFormat: (v) => v, xFormat: null, area: true, ddShade: false, zeroLine: false }, opts);
    const w = Math.max(320, container.clientWidth || 640), hgt = o.height;
    const pts = o.series.reduce((a, s) => a.concat(s.points), []);
    if (!pts.length) { container.innerHTML = '<div class="empty">No data yet</div>'; return; }
    const xs = pts.map((p) => Number(p.x)), ys = pts.map((p) => Number(p.y));
    let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    if (o.zeroLine) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
    const padY = (y1 - y0) * 0.08 || 1;
    y0 -= padY; y1 += padY;
    const iw = w - o.padding.l - o.padding.r, ih = hgt - o.padding.t - o.padding.b;
    const sx = (v) => o.padding.l + (x1 === x0 ? iw / 2 : ((v - x0) / (x1 - x0)) * iw);
    const sy = (v) => o.padding.t + ih - ((v - y0) / (y1 - y0)) * ih;

    let svg = `<svg class="chart" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" role="img">`;
    // horizontal grid + y labels
    for (const t of niceTicks(y0, y1, 4)) {
      const y = sy(t);
      if (y < o.padding.t - 2 || y > hgt - o.padding.b + 2) continue;
      svg += `<line class="grid-line" x1="${o.padding.l}" x2="${w - o.padding.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
      svg += `<text x="${o.padding.l - 7}" y="${(y + 3).toFixed(1)}" text-anchor="end">${esc(o.yFormat(t))}</text>`;
    }
    // x labels
    const xTickCount = Math.max(2, Math.min(7, Math.floor(iw / 110)));
    for (let i = 0; i <= xTickCount; i++) {
      const v = x0 + ((x1 - x0) * i) / xTickCount;
      const x = sx(v);
      const label = o.xFormat ? o.xFormat(v) : String(Math.round(v));
      svg += `<text x="${x.toFixed(1)}" y="${hgt - 6}" text-anchor="${i === 0 ? 'start' : i === xTickCount ? 'end' : 'middle'}">${esc(label)}</text>`;
    }
    if (o.ddShade && o.series[0]) {
      const p = o.series[0].points;
      const eq = p.map((q) => q.y);
      let peak = eq[0];
      let shade = '';
      for (let i = 0; i < p.length; i++) {
        peak = Math.max(peak, eq[i]);
        const x = sx(Number(p[i].x));
        shade += `${x.toFixed(1)},${sy(peak).toFixed(1)} ${x.toFixed(1)},${sy(eq[i]).toFixed(1)} `;
      }
      svg += `<polygon points="${shade}" fill="rgba(255,92,120,.16)" stroke="none"/>`;
    }
    for (const s of o.series) {
      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(Number(p.x)).toFixed(1)},${sy(Number(p.y)).toFixed(1)}`).join(' ');
      if (s.fill && o.area) {
        const gid = 'g' + Math.random().toString(36).slice(2, 8);
        svg += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${s.color}" stop-opacity=".30"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`;
        svg += `<path d="${d} L${sx(Number(s.points[s.points.length - 1].x))},${sy(y0)} L${sx(Number(s.points[0].x))},${sy(y0)} Z" fill="url(#${gid})" stroke="none"/>`;
      }
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-dasharray="${s.dashed ? '4 4' : ''}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    svg += '</svg>';
    container.innerHTML = svg;
  }

  /** Vertical bars; values array of {label, value, color}. */
  function barChart(container, opts) {
    const o = Object.assign({ height: 220, padding: { t: 14, r: 14, b: 30, l: 54 }, yFormat: (v) => v, labelEvery: 1 }, opts);
    const w = Math.max(320, container.clientWidth || 640), hgt = o.height;
    const data = o.data || [];
    if (!data.length) { container.innerHTML = '<div class="empty">No data yet</div>'; return; }
    const vals = data.map((d) => Number(d.value) || 0);
    let y0 = Math.min(0, ...vals), y1 = Math.max(0, ...vals);
    const padY = (y1 - y0) * 0.08 || 1; y0 -= padY; y1 += padY;
    const iw = w - o.padding.l - o.padding.r, ih = hgt - o.padding.t - o.padding.b;
    const bw = iw / data.length;
    const sy = (v) => o.padding.t + ih - ((v - y0) / (y1 - y0)) * ih;
    let svg = `<svg class="chart" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">`;
    for (const t of niceTicks(y0, y1, 3)) {
      const y = sy(t);
      svg += `<line class="grid-line" x1="${o.padding.l}" x2="${w - o.padding.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
      svg += `<text x="${o.padding.l - 7}" y="${(y + 3).toFixed(1)}" text-anchor="end">${esc(o.yFormat(t))}</text>`;
    }
    data.forEach((d, i) => {
      const v = Number(d.value) || 0;
      const x = o.padding.l + i * bw + bw * 0.15;
      const bwid = bw * 0.7;
      const y = Math.min(sy(v), sy(0)), hh = Math.max(1, Math.abs(sy(v) - sy(0)));
      const color = d.color || (v >= 0 ? 'var(--green)' : 'var(--red)');
      svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bwid.toFixed(1)}" height="${hh.toFixed(1)}" rx="2.5" fill="${color}" opacity=".92"><title>${esc(d.label)}: ${esc(o.yFormat(v))}</title></rect>`;
      if (i % o.labelEvery === 0) svg += `<text x="${(x + bwid / 2).toFixed(1)}" y="${hgt - 8}" text-anchor="middle">${esc(d.short || d.label)}</text>`;
    });
    svg += `<line class="axis" x1="${o.padding.l}" x2="${w - o.padding.r}" y1="${sy(0).toFixed(1)}" y2="${sy(0).toFixed(1)}"/>`;
    svg += '</svg>';
    container.innerHTML = svg;
  }

  /** Sparkline as an inline SVG string. */
  function sparkline(values, { color = 'var(--accent)', height = 34, width = 120 } = {}) {
    if (!values || values.length < 2) return '<div class="muted tiny">—</div>';
    const min = Math.min(...values), max = Math.max(...values);
    const sx = (i) => (i / (values.length - 1)) * width;
    const sy = (v) => height - ((v - min) / ((max - min) || 1)) * (height - 6) - 3;
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8"/></svg>`;
  }

  /** Donut/gauge for a 0-100 score. */
  function gauge(value, { size = 92, label = '', max = 100, color } = {}) {
    const v = Math.max(0, Math.min(max, Number(value) || 0));
    const r = size / 2 - 8, c = 2 * Math.PI * r;
    const off = c - (v / max) * c;
    const col = color || (v >= 72 ? 'var(--green)' : v >= 55 ? 'var(--amber)' : 'var(--red)');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--panel-3)" stroke-width="8"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="${size / 2}" y="${size / 2 + 2}" text-anchor="middle" font-size="19" font-weight="700" fill="var(--text)">${Math.round(v)}</text>
      <text x="${size / 2}" y="${size / 2 + 16}" text-anchor="middle" font-size="8" fill="var(--muted)">${esc(label)}</text></svg>`;
  }

  /** Horizontal bar row used in segment tables. */
  function bar(v, max, cls2) {
    const w = Math.max(2, Math.min(100, (Math.abs(v) / (max || 1)) * 100));
    return `<span class="bar-track"><i class="${cls2 || ''}" style="width:${w.toFixed(0)}%"></i></span>`;
  }

  function heatColor(v, max) {
    if (!v) return 'var(--panel-3)';
    const t = Math.max(-1, Math.min(1, v / (max || 1)));
    if (t >= 0) return `rgba(47,209,139,${(0.13 + t * 0.62).toFixed(2)})`;
    return `rgba(255,92,120,${(0.13 + Math.abs(t) * 0.62).toFixed(2)})`;
  }

  /** Distribution histogram (fixed-width buckets). */
  function histogram(container, data, opts = {}) {
    barChart(container, {
      height: opts.height || 200,
      data: data.map((d) => ({ label: d.label, short: d.label.replace(/R|to|>/g, '').slice(0, 7), value: d.count, color: d.label.includes('-') || d.label.startsWith('≤') ? 'var(--red)' : 'var(--green)' })),
      yFormat: (v) => String(Math.round(v)), labelEvery: opts.labelEvery || 1,
    });
  }

  const SESSIONS_UTC = [
    { key: 'sydney', label: 'Sydney', start: 21, end: 6 },
    { key: 'tokyo', label: 'Tokyo', start: 0, end: 9 },
    { key: 'london', label: 'London', start: 7, end: 16 },
    { key: 'newyork', label: 'New York', start: 12, end: 21 },
  ];
  function sessionOpenNow() {
    const h = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
    return SESSIONS_UTC.filter((s) => s.start < s.end ? (h >= s.start && h < s.end) : (h >= s.start || h < s.end));
  }

  global.U = {
    nf, money, moneySign, signed, pct, num, R, cls, rClass, signCls, esc, compact, price, dur, dt, dateOnly, ago, rating,
    h, $, $$, clear, lineChart, barChart, sparkline, gauge, bar, heatColor, histogram, sessionOpenNow, niceTicks,
  };
})(window);
