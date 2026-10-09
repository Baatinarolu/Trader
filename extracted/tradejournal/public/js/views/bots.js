/* views/bots.js — Market Mechanics bots: analyse · predict · scan · correct · signals */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};
  const h = (t, p, ...k) => global.U.h(t, p, ...k);
  const esc = global.U.esc;

  /** Persistent view state so switching tabs does not lose the analysis. */
  const B = {
    tab: 'mechanic',
    symbol: 'XAUUSD',
    tf: '15m',
    prediction: true,
    minRR: Number(((global.Store.user || {}).settings || {}).min_rr) > 0 ? Number(global.Store.user.settings.min_rr) : 1,
    bars: 1200,
    data: null, predict: null, scan: null, correction: null, signals: null, chart: null,
    scanList: ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSDT', 'ETHUSDT', 'ES', 'NAS100', 'US30'],
    busy: '', error: '', updated: null,
    trim: 0,              // bar replay: 0 = live, N = read the chart N bars back
    chartH: null,         // chart height, remembered between visits
    drawings: [],
  };

  /** bar length per timeframe — used to decide when a read has gone stale */
  const TF_MS = {
    '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3,
    '1h': 3600e3, '4h': 14400e3, '1d': 86400e3, '1w': 604800e3,
  };

  const TABS = [
    ['mechanic', 'Market mechanics'],
    ['predict', 'Prediction'],
    ['scan', 'Scan'],
    ['correct', 'Corrections'],
    ['signals', 'Signals'],
  ];

  const fmt = (v, dp = 4) => (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: dp });
  const chip = (text, cls) => h('span', { class: 'chip ' + (cls || ''), text });

  /* ══════════════════════════════════════════════ the desk chart ══════════
     The chart is drawn by js/chart.js — candles, volume, axes, killzones, the
     dealing range, order blocks, gaps, liquidity pools, sweeps, structure
     marks and the plan as a risk/reward box. This view only decides which
     payload goes into it and what the caption says.                        */

  const CHART_SIZES = [['M', 460], ['L', 600], ['XL', 760], ['Full', 0]];

  function deskChart(payload, { title = null } = {}) {
    const wrap = h('div', { class: 'bot-chart' });
    if (!payload) { wrap.appendChild(h('div', { class: 'empty', text: 'No chart payload yet.' })); return wrap; }
    if (!global.Chart) {
      // chart.js missing (an old cached page): say so rather than drawing nothing
      wrap.appendChild(h('div', { class: 'empty', text: 'Chart module not loaded — hard-refresh the page (Ctrl/Cmd+Shift+R).' }));
      return wrap;
    }
    // remembered size: a trader who widened the chart does not want it small again
    if (B.chartH === null) {
      const saved = Number((global.localStorage && localStorage.getItem('tj_chart_h')) || 0);
      B.chartH = saved || 600;
    }
    const height = B.chartH || Math.max(520, Math.round((global.innerHeight || 900) * 0.78));
    const el = global.Chart.render({
      candles: payload.candles,
      smc: payload.smc,
      plan: payload.plan,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      meta: payload.meta,
      height,
      bars: 170,
      drawings: B.drawings,
      persist: true,
      replay: B.trim ? { trim: B.trim } : null,
      onDrawings: (list) => {
        B.drawings = list;
        // the server owns the storage: drawings are the trader's own work
        global.API.put('/chart/drawings', { symbol: payload.symbol, timeframe: payload.timeframe, drawings: list })
          .catch((e) => global.App.toast('Drawing saved on screen but not in your workspace: ' + e.message, 'warn'));
      },
    });
    wrap.appendChild(el);

    // ---- size row: M / L / XL / full height, remembered
    const sizeRow = h('div', { class: 'row gap-6 wrap', style: 'margin-top:8px' });
    sizeRow.appendChild(h('span', { class: 'tiny muted', text: 'chart size' }));
    CHART_SIZES.forEach(([label, px]) => {
      const on = (px === 0 && B.chartH === 0) || (px !== 0 && B.chartH === px);
      const b = h('button', { class: 'btn xs ' + (on ? 'primary' : 'ghost'), text: label, title: px ? px + ' px tall' : 'fill the window' });
      b.addEventListener('click', () => {
        B.chartH = px;
        try { localStorage.setItem('tj_chart_h', String(px)); } catch (e) { /* private mode */ }
        global.App.refresh();
      });
      sizeRow.appendChild(b);
    });
    sizeRow.appendChild(h('span', { class: 'tiny muted', style: 'margin-left:auto',
      text: 'draw with the tool row · right of the chart is the price axis · wheel to zoom' }));
    wrap.appendChild(sizeRow);
    return wrap;
  }

  /** The three timeframes of the stack, drawn small, each with its job + level. */
  function miniStack(payload) {
    const row = h('div', { class: 'stack-row' });
    if (!payload || !payload.stack || !global.Chart) return row;
    [['bias', 'decides direction'], ['location', 'entry location'], ['trigger', 'confirmation']].forEach(([key, fallback]) => {
      const L = payload.stack[key];
      if (!L) return;
      const tone = L.structure === 'bullish' ? 'pos' : L.structure === 'bearish' ? 'neg' : '';
      const levels = [];
      if (L.level) {
        if (L.level.low !== undefined) levels.push({ price: L.level.low, text: '', colour: 'rgba(217,84,103,0.5)' });
        if (L.level.high !== undefined) levels.push({ price: L.level.high, text: '', colour: 'rgba(217,84,103,0.5)' });
        if (L.level.mid !== undefined) levels.push({ price: L.level.mid, text: 'EQ', colour: 'rgba(153,161,175,0.6)' });
        if (L.level.bottom !== undefined) levels.push({ price: L.level.top, text: 'zone', colour: 'rgba(63,127,224,0.6)' });
        if (L.level.price !== undefined) levels.push({ price: L.level.price, text: 'sweep', colour: 'rgba(207,154,69,0.7)' });
      }
      const cell = h('div', { class: 'stack-cell' });
      const chart = global.Chart.mini({
        candles: L.candles, label: `${L.tf}`, sub: L.job || fallback,
        levels, height: 116, tone,
      });
      cell.appendChild(chart);
      cell.appendChild(h('div', {
        class: 'stack-foot',
        html: `<span class="stack-state ${tone}">${esc(L.structure || 'ranging')}</span>`
          + (L.state ? `<span class="muted">CRT ${esc(L.state)}</span>` : ''),
      }));
      row.appendChild(cell);
    });
    return row;
  }

  function toolbar(onChange) {
    const symbols = (global.Store.instruments || []).map((i) => i.symbol).sort();
    const tfs = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
    const row = h('div', { class: 'row wrap gap-8 bot-toolbar' });
    const symInput = h('input', { class: 'input', list: 'bot-symbols', value: B.symbol, style: 'max-width:150px', placeholder: 'Symbol' });
    const dl = h('datalist', { id: 'bot-symbols' });
    symbols.forEach((s) => dl.appendChild(h('option', { value: s })));
    const tfSel = h('select', { class: 'input', style: 'max-width:110px' });
    tfs.forEach((t) => tfSel.appendChild(h('option', { value: t, text: t, selected: t === B.tf ? 'selected' : null })));
    const predChk = h('label', { class: 'row gap-4 muted', style: 'align-items:center' });
    const predBox = h('input', { type: 'checkbox', checked: B.prediction ? 'checked' : null });
    predChk.appendChild(predBox); predChk.appendChild(document.createTextNode('prediction'));

    const runBtn = h('button', { class: 'btn primary sm', text: B.busy === 'analyse' ? 'Analysing…' : 'Analyse' });
    const saveBtn = h('button', { class: 'btn sm', text: 'Save as signal' });
    const resolveBtn = h('button', { class: 'btn ghost sm', text: 'Resolve signals' });
    const tvBtn = h('a', { class: 'btn ghost sm', text: 'TradingView chart', target: '_blank', rel: 'noopener', href: (global.TV ? global.TV.link(B.symbol, B.tf) : '#'), title: 'Open this market on TradingView' });
    // the same chart, embedded in the app, with the bot's read beside it
    const tvInApp = h('button', { class: 'btn ghost sm', text: 'TV in app', title: 'Open this market in the app\'s TradingView panel' });
    tvInApp.addEventListener('click', () => {
      Store.filters.symbol = B.symbol;
      try { localStorage.setItem('tj_tv_symbol', B.symbol); localStorage.setItem('tj_tv_tf', B.tf); } catch (e) { /* private mode */ }
      global.App.go('market');
    });
    const levelsBtn = h('button', { class: 'btn ghost sm', text: 'Copy plan', title: 'Copy entry / stop / targets as text — handy for a TradingView alert' });

    symInput.addEventListener('change', () => { B.symbol = symInput.value.trim().toUpperCase(); onChange(); });
    tfSel.addEventListener('change', () => { B.tf = tfSel.value; onChange(); });
    predBox.addEventListener('change', () => { B.prediction = predBox.checked; });
    runBtn.addEventListener('click', async () => {
      B.symbol = symInput.value.trim().toUpperCase();
      B.data = null; B.predict = null; B.error = ''; B.busy = 'analyse';
      onChange(true);
    });
    saveBtn.addEventListener('click', async () => {
      try {
        const r = await global.API.post('/bots/signals/save', { symbol: B.symbol, timeframe: B.tf, prediction: B.prediction });
        global.App.toast(r.saved && r.saved.saved ? `Saved ${r.saved.saved} signal(s)` : 'No actionable setup to save', r.saved && r.saved.saved ? 'ok' : 'warn');
        if (r.saved && r.saved.saved) { B.signals = null; }
      } catch (e) { global.App.toast(e.message, 'err'); }
    });
    resolveBtn.addEventListener('click', async () => {
      global.App.toast('Resolving pending signals against live candles…');
      try {
        const r = await global.API.post('/bots/signals/resolve', { limit: 25 });
        B.signals = null;
        global.App.toast(`Checked ${r.checked} signal(s)`, 'ok');
        onChange();
      } catch (e) { global.App.toast(e.message, 'err'); }
    });

    levelsBtn.addEventListener('click', () => {
      const best = B.data && B.data.setups && B.data.setups.candidates ? B.data.setups.candidates[0] : null;
      if (!best) return global.App.toast('Analyse a market first', 'warn');
      global.TV.copy(global.TV.planText(B.symbol, B.tf, best), 'Trade plan');
    });
    [symInput, tfSel, predChk, runBtn, saveBtn, resolveBtn, tvBtn, tvInApp, levelsBtn].forEach((n) => row.appendChild(n));
    const wrap = h('div', { class: 'card' });
    wrap.appendChild(row);
    wrap.appendChild(dl);
    if (B.data && B.data.headline) {
      const hl = B.data.headline;
      const line = h('div', { class: 'bot-headline' });
      line.appendChild(h('span', { class: 'chip ' + (hl.action === 'BUY' ? 'pos' : hl.action === 'SELL' ? 'neg' : ''), text: hl.action }));
      line.appendChild(h('span', { class: 'chip info', text: `${hl.grade} · ${hl.score}/100` }));
      if (hl.method_status) {
        line.appendChild(h('span', {
          class: 'chip ' + (hl.method_blocked ? 'warn' : 'pos'),
          text: `method ${hl.method_status}${hl.method_direction ? (hl.method_direction > 0 ? ' · long' : ' · short') : ''}`,
          title: 'The higher-timeframe CRT state: a confirmed sweep is what arms a trade',
        }));
      }
      line.appendChild(h('span', { class: 'chip', text: `mechanics ${hl.mechanics}` }));
      line.appendChild(h('span', { class: 'chip', text: hl.killzone || 'outside killzone' }));
      if (B.data.momentum && B.data.momentum.quote) line.appendChild(h('span', { class: 'chip', text: `${fmt(B.data.momentum.quote.price, 5)} · ${B.data.momentum.quote.provider}` }));
      line.appendChild(h('span', { class: 'muted', style: 'flex:1;min-width:240px', text: hl.text }));
      wrap.appendChild(line);
    }
    return wrap;
  }

  /* ══════════════════════════════════════════════ panel: mechanics */

  /* ═════════════════════════════════════════ the top-down method panel ════
     The five steps of the method, the job each timeframe does, what the method
     is waiting for, and every disagreement with the rule that settles it.   */

  function panelMethod(d) {
    const td = d.topdown || null;
    const card = h('div', { class: 'card' });
    card.appendChild(h('div', { class: 'card-head', html: `<strong>Top-down method</strong> <span class="muted">${td ? esc(td.method.name) + ' · ' + esc(td.method.stack) : 'CRT'}</span>` }));
    if (!td) { card.appendChild(h('div', { class: 'empty', text: 'No top-down read for this market yet.' })); return card; }

    const head = h('div', { class: 'td-head' });
    head.appendChild(h('span', { class: 'td-status ' + (td.status === 'confirmed' && !td.blocked ? 'pos' : 'warn'), text: td.status === 'confirmed' && !td.blocked ? 'CONFIRMED' : 'WAITING' }));
    head.appendChild(h('span', { class: 'chip', text: `${td.grade} · ${td.score}/100` }));
    head.appendChild(h('span', { class: 'chip', text: td.direction > 0 ? 'method long' : td.direction < 0 ? 'method short' : 'no direction' }));
    head.appendChild(h('span', { class: 'muted td-headline', text: td.headline }));
    card.appendChild(head);

    /* steps */
    const steps = h('div', { class: 'td-steps' });
    (td.steps || []).forEach((st) => {
      const row = h('div', { class: 'td-step' + (st.done ? ' done' : '') });
      row.appendChild(h('span', { class: 'td-n', text: String(st.n) }));
      row.appendChild(h('span', { class: 'td-title', text: st.title }));
      row.appendChild(h('span', { class: 'td-state', text: st.done ? 'done' : 'waiting' }));
      row.appendChild(h('span', { class: 'td-text muted', text: st.text }));
      steps.appendChild(row);
    });
    card.appendChild(steps);

    /* the three layers, with their jobs */
    const layers = h('div', { class: 'td-layers' });
    const L = td.layers || {};
    [['bias', 'decides direction'], ['zone', 'entry location'], ['trigger', 'confirmation']].forEach(([key, fallback]) => {
      const lay = L[key];
      if (!lay) return;
      const box = h('div', { class: 'td-layer' });
      box.appendChild(h('div', { class: 'td-layer-head' }, h('b', { text: lay.tf }), h('span', { class: 'muted', text: lay.job || fallback })));
      box.appendChild(h('div', { class: 'muted-2 td-layer-note', text: lay.role_note || '' }));
      if (key === 'bias') {
        box.appendChild(h('div', { class: 'kv', html: `<span>structure</span><b>${esc(lay.structure || 'ranging')}</b>` }));
        box.appendChild(h('div', { class: 'kv', html: `<span>CRT state</span><b>${esc(lay.state || '—')}</b>` }));
        if (lay.range) box.appendChild(h('div', { class: 'kv', html: `<span>range</span><b>${fmt(lay.range.low, 5)} – ${fmt(lay.range.high, 5)}</b>` }));
        if (lay.right_candle) {
          box.appendChild(h('div', { class: 'kv', html: `<span>right candle</span><b>${esc(lay.right_candle.level.label)} ${fmt(lay.right_candle.level.price, 5)}</b>` }));
          box.appendChild(h('div', { class: 'muted-2 td-layer-note', text: `${lay.right_candle.side} · ${lay.right_candle.reaction_atr} ATR reaction · ${lay.right_candle.index_from_end} candle(s) back${lay.right_candle.forming ? ' · still forming' : ''}` }));
        }
        (lay.consumed_ranges || []).forEach((c) => box.appendChild(h('div', { class: 'muted-2 td-layer-note', text: 'skipped: ' + c })));
      }
      if (key === 'zone') {
        if (lay.premium_discount) box.appendChild(h('div', { class: 'kv', html: `<span>position</span><b>${lay.premium_discount.position_pct}% (${esc(lay.premium_discount.zone)})</b>` }));
        if (lay.fresh_zone) box.appendChild(h('div', { class: 'kv', html: `<span>fresh zone</span><b>${esc(lay.fresh_zone.side)} ${fmt(lay.fresh_zone.bottom, 5)}–${fmt(lay.fresh_zone.top, 5)}</b>` }));
        if (lay.unfilled_fvg) box.appendChild(h('div', { class: 'kv', html: `<span>gap</span><b>${fmt(lay.unfilled_fvg.bottom, 5)}–${fmt(lay.unfilled_fvg.top, 5)}</b>` }));
        if (lay.crt) box.appendChild(h('div', { class: 'kv', html: `<span>own CRT</span><b>${esc(lay.crt.state)}${lay.crt.dir ? ' · ' + (lay.crt.dir > 0 ? 'long' : 'short') : ''}</b>` }));
      }
      if (key === 'trigger') {
        const c = lay.confirmation || {};
        box.appendChild(h('div', { class: 'kv', html: `<span>confirmation</span><b class="${c.ok ? 'pos' : 'neg'}">${c.ok ? 'yes' : 'not yet'}</b>` }));
        if (c.displacement) box.appendChild(h('div', { class: 'kv', html: `<span>displacement</span><b>${c.displacement.range_atr} ATR · ${c.displacement.bars_ago} bars ago</b>` }));
        if (c.structure_shift) box.appendChild(h('div', { class: 'kv', html: `<span>shift</span><b>${esc(c.structure_shift.type)} ${esc(c.structure_shift.dir)} · ${c.structure_shift.bars_ago} bars ago</b>` }));
        box.appendChild(h('div', { class: 'muted-2 td-layer-note', text: c.note || '' }));
      }
      layers.appendChild(box);
    });
    card.appendChild(layers);

    /* the playbook — what to do next, in the method's words */
    if ((td.playbook || []).length) {
      const pb = h('div', { class: 'td-playbook' });
      pb.appendChild(h('div', { class: 'td-sub', text: 'What the method says to do next' }));
      td.playbook.forEach((line) => pb.appendChild(h('div', { class: 'td-play', text: line })));
      card.appendChild(pb);
    }

    /* the CRT plan, when there is one */
    if (td.crt_plan) {
      const p = td.crt_plan;
      const box = h('div', { class: 'td-plan' });
      box.appendChild(h('div', { class: 'td-sub', text: `${p.side.toUpperCase()} · ${td.layers.bias.tf} CRT range ${fmt(p.range.low, 5)} – ${fmt(p.range.high, 5)}` }));
      const tbl = h('table', { class: 'data-table' });
      tbl.innerHTML = '<thead><tr><th>entry</th><th>stop</th><th>target</th><th>R:R</th><th>when to use</th></tr></thead><tbody>'
        + `<tr><td class="num">${fmt(p.aggressive.entry, 5)}</td><td class="num">${fmt(p.aggressive.stop, 5)}</td><td class="num">${fmt(p.aggressive.target, 5)}</td><td class="num">${p.aggressive.rr}R</td><td class="muted">aggressive — at the confirmation</td></tr>`
        + `<tr><td class="num">${fmt(p.safer.entry, 5)}</td><td class="num">${fmt(p.safer.stop, 5)}</td><td class="num">${fmt(p.safer.target, 5)}</td><td class="num">${p.safer.rr}R</td><td class="muted">safer — on the pullback into the range</td></tr>`
        + '</tbody>';
      box.appendChild(tbl);
      if (p.below_min_rr) {
        box.appendChild(h('div', { class: 'bot-warn', text: `Below your minimum: this pays ${p.safer.rr}R against a ${p.min_rr}R floor. The method is not hiding it — but it is a scenario, not an order.` }));
      }
      box.appendChild(h('div', { class: 'muted-2 td-layer-note', text: `Stop goes beyond the candle that made the sweep (${fmt(p.sweep.level, 5)} swept to ${fmt(p.sweep.extreme, 5)}, ${p.sweep.wick_atr} ATR). ${p.invalidation}` }));
      const save = h('button', { class: 'btn sm', text: 'Save this CRT plan' });
      save.addEventListener('click', async () => {
        try {
          const r = await global.API.post('/bots/signals/save-plan', {
            symbol: d.symbol, timeframe: d.timeframe, entry: p.safer.entry, stop: p.safer.stop,
            targets: [{ price: p.safer.target }], note: `CRT ${p.side} — ${td.layers.bias.tf} range ${p.range.low}–${p.range.high}`, entry_mode: 'crt', mtf_tf: td.layers.bias.tf,
          });
          global.App.toast(r.saved ? 'CRT plan saved to the signal ledger' : 'Plan not saved', r.saved ? 'ok' : 'warn');
        } catch (e) { global.App.toast(e.message, 'err'); }
      });
      box.appendChild(save);
      card.appendChild(box);
    }

    /* every disagreement, with the rule that settles it */
    const conflicts = td.conflicts || [];
    if (conflicts.length) {
      const box = h('div', { class: 'td-conflicts' });
      box.appendChild(h('div', { class: 'td-sub', text: 'Disagreements and how the method resolves them' }));
      conflicts.forEach((c) => {
        const item = h('div', { class: 'td-conflict' + (c.blocks_trade ? ' blocking' : '') });
        item.appendChild(h('div', { class: 'td-c-head' }, h('span', { class: 'chip ' + (c.blocks_trade ? 'neg' : 'warn'), text: c.kind.replace(/-/g, ' ') }), h('span', { text: c.sides })));
        item.appendChild(h('div', { class: 'muted-2', text: 'Rule: ' + c.rule }));
        item.appendChild(h('div', { class: 'td-c-res', text: (c.blocks_trade ? 'Stand down — ' : 'Keep the trade — ') + c.resolution }));
        box.appendChild(item);
      });
      card.appendChild(box);
    }

    /* the method's checklist */
    const checks = h('div', { class: 'td-checks' });
    (td.checks || []).forEach((c) => {
      const row = h('div', { class: 'td-check' + (c.ok ? ' ok' : '') });
      row.appendChild(h('span', { class: 'td-check-mark', text: c.ok ? 'met' : 'not met' }));
      row.appendChild(h('span', { class: 'td-check-label', text: c.label }));
      row.appendChild(h('span', { class: 'muted td-check-detail', text: c.detail || '' }));
      checks.appendChild(row);
    });
    card.appendChild(checks);
    return card;
  }

  /* ══════════════════════════════════ the "now" strip ═════════════════════
     One action, one level, one clock, and the age of the data it is based on.
     This is the first thing on the panel because it is the only thing a trader
     can act on; everything below it is the reasoning.                        */

  function nowStrip(d) {
    const n = d.now || null;
    const card = h('div', { class: 'card now-strip' });
    if (!n) { card.appendChild(h('div', { class: 'empty', text: 'No current call for this market.' })); return card; }

    const cls = n.action === 'BUY' ? 'pos' : n.action === 'SELL' ? 'neg' : (n.action === 'RE-CHECK' ? 'warn' : 'muted');
    const head = h('div', { class: 'now-head' });
    head.appendChild(h('span', { class: 'now-action ' + cls, text: n.action }));
    head.appendChild(h('div', { class: 'now-text' }, h('div', { class: 'now-headline', text: n.headline })));
    head.appendChild(h('span', { class: 'chip', text: n.freshness && n.freshness.state ? n.freshness.state : '' }));
    // a size is only claimed when the method has actually graded the setup:
    // "conviction none · half size" would be a promise the engine is not making
    const tier = n.conviction && String(n.conviction).toUpperCase();
    if (tier === 'A' || tier === 'B') head.appendChild(h('span', { class: 'chip ' + (tier === 'A' ? 'pos' : ''), text: `conviction ${tier} · ${n.full_risk ? 'full size' : 'half size'}` }));
    else head.appendChild(h('span', { class: 'chip muted', text: 'no conviction yet — nothing to size' }));
    head.appendChild(h('span', { class: 'chip', text: `steps ${n.steps_done}/${n.steps_total}` }));
    card.appendChild(head);

    // the four facts a decision needs, side by side
    const grid = h('div', { class: 'now-grid' });
    if (n.order) {
      grid.appendChild(h('div', { class: 'now-cell' },
        h('span', { class: 'now-k', text: 'The order' }),
        h('b', { class: 'mono', text: `${n.order.side} ${fmt(n.order.entry, 5)}` }),
        h('em', { text: `stop ${fmt(n.order.stop, 5)} · target ${fmt(n.order.target, 5)} · ${n.order.rr}R` })));
    } else {
      grid.appendChild(h('div', { class: 'now-cell' },
        h('span', { class: 'now-k', text: 'The order' }),
        h('b', { text: 'Nothing armed' }),
        h('em', { text: 'Do not put an order on this market yet.' })));
    }
    grid.appendChild(h('div', { class: 'now-cell' },
      h('span', { class: 'now-k', text: 'Watch' }),
      h('b', { class: 'mono', text: n.watch && n.watch.level != null ? fmt(n.watch.level, 5) : '—' }),
      h('em', { text: (n.watch && n.watch.condition) || '—' })));
    grid.appendChild(h('div', { class: 'now-cell' },
      h('span', { class: 'now-k', text: 'Until' }),
      h('b', { text: n.checkpoint ? n.checkpoint.label : '—' }),
      h('em', { text: n.checkpoint ? n.checkpoint.text : '' })));
    grid.appendChild(h('div', { class: 'now-cell' },
      h('span', { class: 'now-k', text: 'Read from' }),
      h('b', { text: `${esc(d.timeframe)} bar closed ${n.evaluated_on.last_closed_bar ? n.evaluated_on.last_closed_bar.replace('T', ' ').slice(0, 16) + 'Z' : '—'}` }),
      h('em', { text: n.freshness ? n.freshness.note : '' })));
    card.appendChild(grid);

    if (n.order) {
      const o = n.order;
      if (o.rr_warning) {
        // the trader asked to see these rather than have them hidden — so the
        // warning is the first thing under the order, in red, not a footnote
        card.appendChild(h('div', { class: 'now-note rr-warn', text: o.rr_warning }));
      }
      card.appendChild(h('div', { class: 'now-note', text: `${o.type} · ${o.size_note}` }));
      if (o.alt_entry) card.appendChild(h('div', { class: 'now-note muted-2', text: `Also valid: the ${o.mode === 'safer' ? 'aggressive' : 'safer'} fill at ${fmt(o.alt_entry, 5)} (target ${fmt(o.alt_target, 5)}, ${o.alt_rr}R).` }));
    }
    card.appendChild(h('div', { class: 'now-note warn-note', text: 'If it is wrong: ' + (n.invalidate || '—') }));

    if (n.other_side) {
      const det = h('details', { class: 'now-other' });
      det.appendChild(h('summary', { text: `The other side (${n.other_side.side}) — blocked, not armed` }));
      det.appendChild(h('div', { class: 'muted-2', text: n.other_side.text }));
      card.appendChild(det);
    }
    (n.guards || []).forEach((g) => card.appendChild(h('div', { class: 'now-guard ' + esc(g.level), text: g.text })));
    if (n.since) card.appendChild(h('div', { class: 'now-note', text: n.since.text }));
    return card;
  }

  /* ══════════════════════════════════ bar replay ═══════════════════════════
     "Read the chart as of N bars ago" — the same analysis, the same rules, on
     the candles that existed then. It answers "was the bot right?" honestly,
     because there is no way for the rules to see the future.                 */

  function replayBar() {
    const max = 160;
    const card = h('div', { class: 'card replay-card' });
    const row = h('div', { class: 'row gap-8 wrap', style: 'align-items:center' });
    row.appendChild(h('strong', { text: 'Bar replay' }));
    row.appendChild(h('span', { class: 'tiny muted', text: 're-read this market as of an earlier close — the rules only see the candles up to that point' }));

    const back = h('button', { class: 'btn xs ghost', text: '− 5', title: 'Five bars further back' });
    const fwd = h('button', { class: 'btn xs ghost', text: '+ 5', title: 'Five bars forward' });
    const live = h('button', { class: 'btn xs ' + (B.trim ? 'ghost' : 'primary'), text: 'Live' });
    const range = h('input', { type: 'range', min: '0', max: String(max), step: '1', value: String(B.trim), class: 'replay-range' });
    const label = h('span', { class: 'mono tiny', text: B.trim ? `${B.trim} bars back` : 'live' });
    [back, fwd, live, range, label].forEach((n) => row.appendChild(n));
    card.appendChild(row);

    const apply = (v, rerun) => {
      B.trim = Math.max(0, Math.min(max, v));
      range.value = String(B.trim);
      label.textContent = B.trim ? `${B.trim} bars back` : 'live';
      live.className = 'btn xs ' + (B.trim ? 'ghost' : 'primary');
      if (rerun !== false) { B.data = null; B.chart = null; global.App.refresh(); }
    };
    back.addEventListener('click', () => apply(B.trim + 5));
    fwd.addEventListener('click', () => apply(B.trim - 5));
    live.addEventListener('click', () => apply(0));
    range.addEventListener('change', () => apply(Number(range.value)));

    if (B.trim) {
      const note = h('div', { class: 'muted-2 tiny', style: 'margin-top:6px' },
        h('span', { text: 'Everything on this panel — the chart, the steps, the plan — is built from the candles up to that close only. Nothing here can see the bars after it.' }));
      card.appendChild(note);
    }
    return card;
  }

  function panelMechanic(pane) {
    const d = B.data;
    if (!d) { pane.appendChild(h('div', { class: 'empty', text: B.busy === 'analyse' ? 'Running the full mechanics pass…' : 'Pick a market and press Analyse.' })); return pane; }

    /* --- the one answer, first ------------------------------------------- */
    pane.appendChild(nowStrip(d));
    pane.appendChild(replayBar());

    /* --- the chart, full width: candles, volume, killzones, zones, plan --- */
    const chartCard = h('div', { class: 'card' });
    const plan = B.chart && B.chart.plan;
    chartCard.appendChild(h('div', { class: 'card-head', html: `<strong>${esc(d.symbol)} · ${esc(d.timeframe)}</strong> <span class="muted">${plan ? (plan.source === 'crt' ? 'the CRT plan' : 'the graded plan') + ' drawn as a risk / reward box' : 'levels only — the method has not armed a trade'} · ⌘/Ctrl + wheel to zoom, drag to pan, hover to read a bar — the wheel still scrolls the page</span>` }));
    chartCard.appendChild(deskChart(B.chart || null, { title: null }));
    pane.appendChild(chartCard);

    /* --- the top-down method: steps, layers, conflicts, playbook --- */
    pane.appendChild(panelMethod(d));

    /* --- the timeframe stack, drawn --- */
    if (B.chart && B.chart.stack) {
      const stackCard = h('div', { class: 'card' });
      stackCard.appendChild(h('div', { class: 'card-head', html: `<strong>Timeframe stack</strong> <span class="muted">each timeframe has one job — the higher one decides direction</span>` }));
      stackCard.appendChild(miniStack(B.chart));
      pane.appendChild(stackCard);
    }

    const grid = h('div', { class: 'bot-grid' });
    const left = h('div', { class: 'bot-col' });
    const right = h('div', { class: 'bot-col' });

    /* --- narrative --- */
    const nar = h('div', { class: 'card' });
    nar.appendChild(h('div', { class: 'card-head', html: `<strong>What the market is doing</strong> <span class="muted">in order — this is the read-aloud</span>` }));
    const list = h('div', { class: 'bot-narrative' });
    (d.momentum.narrative || []).forEach((l) => {
      const item = h('div', { class: 'bot-nline' });
      item.appendChild(h('span', { class: 'bot-ntag ' + (l.dir > 0 ? 'pos' : l.dir < 0 ? 'neg' : 'muted'), text: l.title }));
      item.appendChild(h('span', { text: l.text }));
      list.appendChild(item);
    });
    nar.appendChild(list);
    (d.conflict_detail || []).forEach((c) => nar.appendChild(h('div', { class: 'bot-warn', text: `${c.kind.replace(/-/g, ' ')}: ${c.sides} → ${c.resolution}` })));
    left.appendChild(nar);

    /* --- mechanics score breakdown --- */
    const mech = h('div', { class: 'card' });
    mech.appendChild(h('div', { class: 'card-head', html: `<strong>Mechanics score</strong> <span class="muted">how textbook the conditions are</span>` }));
    const gauges = h('div', { class: 'row gap-12 wrap', style: 'align-items:center' });
    gauges.appendChild(h('div', { html: global.U.gauge(d.momentum.mechanics.score, { label: 'mechanics' }) }));
    gauges.appendChild(h('div', { html: global.U.gauge(Math.round((d.indicators ? d.indicators.score : 0) / 2 + 50), { label: 'indicators' }) }));
    const fl = h('div', { class: 'bot-factors', style: 'flex:1;min-width:260px' });
    (d.momentum.mechanics.factors || []).forEach((f) => {
      const r = h('div', { class: 'bot-factor' });
      r.appendChild(h('span', { class: 'muted', text: f.label }));
      r.appendChild(h('span', { class: 'bot-bar' , html: `<i style="width:${Math.round((f.points / (f.max || 1)) * 100)}%"></i>` }));
      r.appendChild(h('span', { class: 'mono', text: `${f.points}/${f.max}` }));
      fl.appendChild(r);
      if (f.detail) fl.appendChild(h('div', { class: 'muted-2 bot-detail', text: f.detail }));
    });
    gauges.appendChild(fl);
    mech.appendChild(gauges);
    left.appendChild(mech);

    /* --- structure + liquidity tables --- */
    const struct = h('div', { class: 'card' });
    struct.appendChild(h('div', { class: 'card-head', html: `<strong>Structure & liquidity</strong>` }));
    const s = d.smc.structure || {};
    struct.appendChild(h('div', { class: 'bot-kv', html: `
      <div><span class="muted">Trend</span><b>${esc(s.trend)}</b></div>
      <div><span class="muted">Last event</span><b>${s.last_break ? `${esc(s.last_break.type)} ${esc(s.last_break.dir)} · ${s.last_break.bars_ago} bars ago${s.last_break.mss ? ' · MSS' : ''}` : '—'}</b></div>
      <div><span class="muted">Sequence</span><b>${(s.recent_labels || []).map((l) => esc(l.label)).join(' → ')}</b></div>
      <div><span class="muted">Dealing range</span><b>${d.smc.premium_discount ? `${fmt(d.smc.premium_discount.range_low, 5)} – ${fmt(d.smc.premium_discount.range_high, 5)} (${d.smc.premium_discount.position_pct}% ${esc(d.smc.premium_discount.zone)})` : '—'}</b></div>
      <div><span class="muted">Session</span><b>${esc((d.smc.sessions || {}).active)} · ${esc((d.smc.sessions || {}).killzone || 'outside killzone')}</b></div>
      <div><span class="muted">HTF</span><b>${esc((d.smc.htf_structure || {}).trend || '—')}</b></div>`}));
    const liqRows = ((d.smc.liquidity || {}).pools || []).map((p) => `<tr>
        <td><span class="chip ${p.type === 'BSL' ? 'info' : 'warn'}">${esc(p.type)}</span></td>
        <td>${esc(p.label)}</td><td class="mono">${fmt(p.price, 5)}</td>
        <td class="mono">${p.distance_pct}%</td><td class="mono">${p.distance_atr} ATR</td>
        <td>${p.swept ? '<span class="chip neg">swept</span>' : '<span class="chip muted">resting</span>'}</td></tr>`).join('');
    struct.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Type</th><th>Pool</th><th>Price</th><th>Dist</th><th>ATR</th><th>State</th></tr></thead><tbody>${liqRows || '<tr><td colspan="6" class="muted">No pools mapped.</td></tr>'}</tbody></table>` }));
    const sweepRows = (d.smc.sweeps || []).map((sw) => `<tr><td>${esc(sw.label)}</td><td class="mono">${sw.wick_atr} ATR</td><td class="mono">${sw.bars_ago} bars ago</td><td><span class="chip ${sw.dir > 0 ? 'pos' : 'neg'}">${sw.dir > 0 ? 'bullish reversal fuel' : 'bearish reversal fuel'}</span></td></tr>`).join('');
    if (sweepRows) struct.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Sweep</th><th>Wick</th><th>When</th><th>Reads as</th></tr></thead><tbody>${sweepRows}</tbody></table>` }));
    left.appendChild(struct);

    /* The CRT read now lives in the top-down method panel above (it is the same
       object, drawn once instead of twice).                                    */

    /* --- setups (right column) ------------------------------------------
       Exactly one plan is presented as the call. The entry model grades both
       directions — that is its job — but the method permits one, so the other is
       collapsed with the reason, and it carries no levels. A panel that shows a
       buy and a sell at the same size is not a decision, it is a coin toss.   */
    const setups = (d.setups.candidates || []);
    const td = d.topdown || null;
    const dirAllowed = td && td.direction ? td.direction : 0;
    const best = (dirAllowed ? setups.find((c) => c.dir === dirAllowed) : null) || setups[0] || null;
    const others = setups.filter((c) => c !== best);
    setups.filter((c) => c === best).forEach((c) => {
      const card = h('div', { class: 'card bot-best' });
      const action = c.grade === 'no-trade' ? 'NO TRADE' : c.side.toUpperCase();
      // A plan is only "the call" when the method permits that side. Otherwise the
      // heading says so — a big BUY card above a NO TRADE headline is exactly the
      // contradiction this view exists to remove.
      const isCall = !!dirAllowed && c.dir === dirAllowed;
      const heading = isCall ? `THE CALL · ${action}` : `NOT ARMED · ${action}`;
      card.appendChild(h('div', { class: 'card-head', html: `<strong class="${c.dir > 0 ? 'pos' : 'neg'}">${heading} · ${esc(c.grade)}</strong> <span class="muted">${esc(c.grade_label || '')} — score ${c.score}/100 (${c.passed}/${c.total_checks} checks)${isCall ? '' : ' · the entry model only'}</span>` }));
      if (dirAllowed && c.dir !== dirAllowed) card.appendChild(h('div', { class: 'bot-warn', text: 'This side is not the one the higher timeframe permits — it is shown for context only, and no order belongs here.' }));
      else if (!dirAllowed) card.appendChild(h('div', { class: 'bot-warn', text: `The method has not permitted a side yet${(d.topdown && d.topdown.blocked) ? ' (it is blocking this market)' : ''}, so this is the entry model's best read rather than a trade. Nothing here is armed.` }));
      if (c.levels) {
        const L = c.levels;
        const rows = (L.targets || []).map((t) => `<tr><td>${esc(t.role)}</td><td>${esc(t.label)}</td><td class="mono">${fmt(t.price, 5)}</td><td class="mono">${t.rr}R</td></tr>`).join('');
        card.appendChild(h('div', { class: 'bot-plan', html: `
          <div class="bot-levels">
            <div><span class="muted">Entry</span><b class="mono">${fmt(L.entry, 5)}</b><em>${esc(L.entry_kind)} · ${L.entry_zone[0]}–${L.entry_zone[1]}</em></div>
            <div><span class="muted">Stop</span><b class="mono neg">${fmt(L.stop, 5)}</b><em>${L.risk_atr} ATR risk</em></div>
            <div><span class="muted">Status</span><b>${esc(L.entry_status)}</b><em>${esc(L.entry_note || '')}</em></div>
          </div>` }));
        card.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Leg</th><th>Where</th><th>Price</th><th>R:R</th></tr></thead><tbody>${rows}</tbody></table>` }));
        if (L.management) card.appendChild(h('div', { class: 'muted bot-detail', text: 'Rules: ' + L.management.rule }));
        if (L.risk_warning) card.appendChild(h('div', { class: 'bot-warn', text: 'Risk: ' + L.risk_warning }));
        card.appendChild(h('div', { class: 'muted bot-detail', text: L.invalidation }));
      }
      if (c.risk) {
        card.appendChild(h('div', { class: 'bot-kv', html: `
          <div><span class="muted">Size</span><b>${fmt(c.risk.size, 4)} ${esc(c.risk.unit)}</b></div>
          <div><span class="muted">Risk</span><b>$${fmt(c.risk.actual_risk, 2)} (${c.risk.risk_pct}%)</b></div>
          <div><span class="muted">Managed target</span><b>$${fmt(c.risk.managed, 2)}</b></div>` }));
        if (c.risk.note) card.appendChild(h('div', { class: 'bot-warn', text: c.risk.note }));
      }
      // checklist
      const chk = h('div', { class: 'bot-checks' });
      (c.checks || []).forEach((k) => {
        const row = h('div', { class: 'bot-check ' + (k.pass ? 'ok' : 'no') });
        row.appendChild(h('span', { class: 'mark ' + (k.pass ? 'ok' : 'no'), text: k.pass ? 'ok' : 'no' }));
        row.appendChild(h('span', { class: 'lbl', text: k.label + (k.weight ? ` (${k.weight})` : '') }));
        if (k.detail) row.appendChild(h('span', { class: 'muted-2 det', text: k.detail }));
        chk.appendChild(row);
      });
      card.appendChild(chk);
      card.appendChild(h('div', { class: 'bot-action', text: c.action }));
      const btnRow = h('div', { class: 'row gap-8' });
      const logBtn = h('button', { class: 'btn sm primary', text: 'Log this plan', onclick: () => {
        if (!c.levels) return global.App.toast('No levels to log', 'warn');
        const L = c.levels;
        global.App.openTrade(null, {
          symbol: d.symbol, asset_class: (d.instrument || {}).asset_class || 'stocks',
          direction: c.dir > 0 ? 'long' : 'short',
          entry: L.entry, stop: L.stop, target: L.targets[0] ? L.targets[0].price : null,
          size: c.risk ? c.risk.size : null, risk_amount: c.risk ? c.risk.actual_risk : null,
          planned_r: L.rr_final, setup_grade: c.grade, session: (d.smc.sessions || {}).killzone || '',
          timeframes: d.timeframe.toUpperCase(), strategy_name: 'Market Mechanics',
          thesis: `${c.levels.entry_kind} retest after a liquidity sweep. ${c.levels.management ? c.levels.management.rule : ''}`.trim(),
          tags: 'bot,smc', adherence: 5,
        });
      } });
      btnRow.appendChild(logBtn);
      card.appendChild(btnRow);
      right.appendChild(card);
    });

    if (others.length) {
      const det = h('details', { class: 'card bot-other' });
      const names = others.map((c) => `${c.side} (${c.score}/100, ${c.grade})`).join(' · ');
      det.appendChild(h('summary', { text: `The other side is not armed — ${names}. Click to see why.` }));
      det.appendChild(h('div', { class: 'muted-2', text: dirAllowed
        ? `The higher timeframe decides direction (${td && td.layers && td.layers.bias ? td.layers.bias.tf : ''} → ${dirAllowed > 0 ? 'long' : 'short'}). The opposite plan only becomes live if that read flips; until then it is a scenario, so it is not priced and has no place in your order book.`
        : 'No higher-timeframe direction yet, so neither side is armed.' }));
      others.forEach((c) => {
        const row = h('div', { class: 'other-plan' });
        row.appendChild(h('span', { class: 'chip ' + (c.dir > 0 ? 'pos' : 'neg'), text: c.side }));
        row.appendChild(h('span', { class: 'muted', text: `score ${c.score}/100 · ${c.grade} · ${c.action || ''}` }));
        if (c.levels) row.appendChild(h('span', { class: 'mono tiny muted', text: `would be entry ${fmt(c.levels.entry, 5)} / stop ${fmt(c.levels.stop, 5)}` }));
        det.appendChild(row);
      });
      right.appendChild(det);
    }

    /* --- prediction teaser inside mechanic panel --- */
    if (d.prediction && d.prediction.ok) {
      const p = h('div', { class: 'card' });
      p.appendChild(h('div', { class: 'card-head', html: `<strong>Odds</strong> <span class="muted">from the historical replay</span>` }));
      (d.prediction.summary || []).forEach((x) => p.appendChild(h('div', { class: 'bot-detail', text: '• ' + x })));
      const setups2 = d.prediction.setups || [];
      setups2.forEach((sp) => {
        p.appendChild(h('div', { class: 'bot-plan', html: `<b class="${sp.dir > 0 ? 'pos' : 'neg'}">${sp.side.toUpperCase()}</b> P(win) <b>${sp.p_win}%</b> · expected <b>${sp.expected_r}R</b> · ${sp.similar_setups} similar setups · model ${sp.p_model}% / empirical ${sp.p_empirical}%` }));
      });
      right.appendChild(p);
    }

    /* --- indicator table --- */
    if (d.indicators) {
      const ic = h('div', { class: 'card' });
      ic.appendChild(h('div', { class: 'card-head', html: `<strong>Indicators</strong> <span class="muted">${esc(d.indicators.label)} · ${esc(d.indicators.regime)} · score ${d.indicators.score}</span>` }));
      const groups = [['trend', 'Trend'], ['momentum', 'Momentum'], ['volatility', 'Volatility'], ['volume', 'Volume']];
      let tableHtml = '';
      groups.forEach(([g, label]) => {
        const ms = (d.indicators.metrics || []).filter((m) => m.group === g);
        if (!ms.length) return;
        tableHtml += `<tr><td colspan="4" class="muted-2"><b>${label} — ${(d.indicators.groups[g] || {}).score}</b></td></tr>`;
        ms.forEach((m) => {
          const biasCls = typeof m.bias === 'number' ? (m.bias > 0 ? 'pos' : m.bias < 0 ? 'neg' : 'muted') : 'muted';
          tableHtml += `<tr><td>${esc(m.label)}</td><td class="mono">${esc(String(m.display))}</td><td class="${biasCls}">${m.bias > 0 ? 'bullish' : m.bias < 0 ? 'bearish' : '—'}</td><td class="mono muted">${m.weight || ''}</td></tr>`;
        });
      });
      ic.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Indicator</th><th>Value</th><th>Read</th><th>W</th></tr></thead><tbody>${tableHtml}</tbody></table>` }));
      (d.indicators.notes || []).forEach((n) => ic.appendChild(h('div', { class: 'bot-warn', text: 'Note: ' + n.text })));
      right.appendChild(ic);
    }

    grid.appendChild(left); grid.appendChild(right);
    pane.appendChild(grid);

    if (d.saved) pane.appendChild(h('div', { class: 'card', text: `Saved ${d.saved.saved} signal(s) for tracking.` }));
  }

  /* ══════════════════════════════════════════════ panel: prediction */

  function panelPredict(pane) {
    const p = B.predict || (B.data && B.data.prediction);
    if (!p) { pane.appendChild(h('div', { class: 'empty', text: 'Run an analysis first (or open this tab after analysing) — prediction replays the model over history.' })); return; }
    if (p.ok === false) { pane.appendChild(h('div', { class: 'card', text: 'Prediction unavailable: ' + (p.error || 'unknown error') })); return; }

    const strip = h('div', { class: 'card' });
    strip.appendChild(h('div', { class: 'stat-strip', html: `
      <div><div class="l">Resolved setups</div><div class="v">${p.backtest ? p.backtest.decided : '—'}</div></div>
      <div><div class="l">Managed expectancy</div><div class="v ${p.backtest && p.backtest.expectancy_r > 0 ? 'pos' : 'neg'}">${p.backtest ? p.backtest.expectancy_r + 'R' : '—'}</div></div>
      <div><div class="l">Base win rate</div><div class="v">${p.backtest ? p.backtest.base_rate + '%' : '—'}</div></div>
      <div><div class="l">Partial hit</div><div class="v">${p.backtest ? p.backtest.partial_rate + '%' : '—'}</div></div>
      <div><div class="l">Runner hit</div><div class="v">${p.backtest ? p.backtest.runner_rate + '%' : '—'}</div></div>
      <div><div class="l">No fill</div><div class="v muted">${p.backtest ? p.backtest.no_fill : '—'}</div></div>` }));
    pane.appendChild(strip);

    const sum = h('div', { class: 'card' });
    sum.appendChild(h('div', { class: 'card-head', html: `<strong>What the numbers say</strong> <span class="muted">${p.quote ? p.quote.provider + ' · ' + p.quote.ticker : ''}</span>` }));
    (p.summary || []).forEach((x) => sum.appendChild(h('div', { class: 'bot-detail', text: '• ' + x })));
    pane.appendChild(sum);

    /* --- exit frontier + the honest 70 % question ----------------------- */
    const bt = p.backtest || {};
    if (bt.verdict) {
      const card = h('div', { class: 'card' });
      card.appendChild(h('div', { class: 'card-head', html: '<strong>Management &amp; re-entry, measured</strong> <span class="spacer"></span><span class="tiny muted">the decisions after the entry</span>' }));

      if (bt.second_chance) {
        const sc = bt.second_chance;
        card.appendChild(h('div', { class: 'card-head', style: 'margin-top:10px', html: '<h3>Second-chance re-entry</h3><span class="spacer"></span><span class="tiny muted">“the zone came back — take it again?”</span>' }));
        card.appendChild(h('div', { class: 'bot-detail', text: `First attempt stopped before the target: ${sc.first_attempt_stopped} of ${bt.counts ? bt.counts.decided : '—'} trades (${sc.share_of_filled_pct}%). Of those, price tapped the level again ${sc.retapped} times (${sc.retap_rate_pct}%). The re-entry itself won ${sc.second_attempt_win_rate == null ? '—' : sc.second_attempt_win_rate}% at ${sc.second_attempt_expectancy_r == null ? '—' : sc.second_attempt_expectancy_r + 'R'} average — net effect on the whole sample: ${sc.net_effect_r_per_trade == null ? '—' : (sc.net_effect_r_per_trade > 0 ? '+' : '') + sc.net_effect_r_per_trade + 'R'} per trade.` }));
        card.appendChild(h('div', { class: 'bot-detail muted', text: sc.note }));
      }

      if (bt.meta && bt.meta.entry_mode) {
        const htf = (B.data && B.data.timeframe) || B.tf;
        const pair = bt.meta.mtf_tf ? `${htf} confirmed on ${bt.meta.mtf_tf} (${bt.meta.ltf_bars ? bt.meta.ltf_bars + ' bars' : 'no bars'}${bt.meta.ltf_provider ? ', ' + bt.meta.ltf_provider : ''})` : '';
        const modeNote = { entry: 'first touch of the zone', mid: '50 % of the zone', deep: 'far edge of the zone', leg: 'requires a displacement leg', ote: 'entry must sit in the 50–79 % retrace of the leg', mtf: 'lower timeframe must sweep + displace inside the zone' }[bt.meta.entry_mode] || '';
        card.appendChild(h('div', { class: 'muted bot-detail', text: `Entry policy: ${bt.meta.entry_mode}${modeNote ? ' — ' + modeNote : ''}${pair ? ' · ' + pair : ''}` }));
      }
      pane.appendChild(card);
    }

    /* ------------------------------------------------------------------ *
     * The honest panel: what this market's own exits paid after costs.    *
     * ------------------------------------------------------------------ */
    const honest = h('div', { class: 'card' });
    const v = bt.verdict;
    honest.appendChild(h('div', { class: 'card-head', html: `<strong>Exit frontier &amp; the 70 % question</strong>
      <span class="spacer"></span>${v ? `<span class="chip ${v.meets_target ? 'ok' : 'warn'}">${v.meets_target ? '70 % bar met on this market' : '70 % bar not met here'}</span>` : ''}` }));
    if (v) honest.appendChild(h('div', { class: 'bot-detail', text: v.note }));
    honest.appendChild(h('div', { class: 'muted bot-detail', html: `A <em>win</em> below means the trade banked <strong>+0.5R or better after costs</strong> — not “closed green by a tick”. The break-even column is the win rate that exit needs just to survive, so a high win rate at a small target can never look like an edge.` }));

    const fr = (bt.frontier || []).filter((f) => f.trades >= 20);
    const ranked = fr.slice().sort((a, b) => (b.win_rate_0_5r || 0) - (a.win_rate_0_5r || 0)).slice(0, 6);
    if (ranked.length) {
      const ft = h('table', { class: 'data-table' });
      ft.innerHTML = `<thead><tr><th>Exit plan</th><th class="num">Trades</th><th class="num">Win ≥ +0.5R</th><th class="num">Expectancy</th><th class="num">Needs to break even</th><th class="num">Video-faithful pool</th></tr></thead><tbody>
        ${ranked.map((f) => `<tr>
          <td>${esc(f.label)}</td>
          <td class="num">${f.trades}</td>
          <td class="num ${(f.win_rate_0_5r || 0) >= 60 ? 'pos' : ''}">${f.win_rate_0_5r == null ? '—' : f.win_rate_0_5r + '%'}</td>
          <td class="num ${f.expectancy_r > 0 ? 'pos' : 'neg'}">${f.expectancy_r == null ? '—' : (f.expectancy_r > 0 ? '+' : '') + f.expectancy_r + 'R'}</td>
          <td class="num muted">${f.breakeven_win_rate == null ? '—' : f.breakeven_win_rate + '%'}</td>
          <td class="num muted">${f.video_faithful ? `${f.video_faithful.win_rate_0_5r}% · ${f.video_faithful.trades} trades` : '—'}</td>
        </tr>`).join('')}</tbody>`;
      honest.appendChild(ft);
    }

    const fl = (bt.filters || []).filter((f) => ['playlist', 'playlist_ema', 'video', 'leg_only'].includes(f.key));
    if (fl.length) {
      honest.appendChild(h('div', { class: 'card-head', style: 'margin-top:10px', html: '<h3>The playlist’s own filters, measured</h3><span class="spacer"></span><span class="tiny muted">same trades, filtered the videos’ way</span>' }));
      const fT = h('table', { class: 'data-table' });
      fT.innerHTML = `<thead><tr><th>Filter</th><th class="num">Setups</th><th class="num">Share</th><th class="num">Expectancy</th></tr></thead><tbody>
        ${fl.map((f) => `<tr><td>${esc(f.label)}</td><td class="num">${f.trades}</td><td class="num muted">${f.share_of_filled_pct == null ? '—' : f.share_of_filled_pct + '%'}</td>
          <td class="num ${f.expectancy_r > 0 ? 'pos' : 'neg'}">${f.expectancy_r == null ? '—' : (f.expectancy_r > 0 ? '+' : '') + f.expectancy_r + 'R'}</td></tr>`).join('')}</tbody>`;
      honest.appendChild(fT);
    }
    honest.appendChild(h('div', { class: 'field-note', text: 'Per-market samples are small (a few dozen trades is normal for one market at one timeframe). The pooled version — 24 markets, every trade charged its own instrument’s spread + slippage + commission — is re-runnable with `node scripts/edge-report.js` and is what the pinned numbers in the docs come from.' }));
    pane.appendChild(honest);

    /* ------------------------------------------------------------------ *
     * The centrepiece: win rate is a dial you set with the target.        *
     * Rendered straight from the bot's own replay of this market.         *
     * ------------------------------------------------------------------ */
    const views = bt.frontier_views || {};
    const plain = bt.target_frontier || [];
    if (!plain.length) return;
    const hc = h('div', { class: 'card' });
    hc.appendChild(h('div', { class: 'card-head', html: `<strong>Win rate is a dial, not a skill badge</strong> <span class="muted">measured on ${esc(p.symbol || (B.data && B.data.symbol) || '')} with its own costs</span>` }));
    hc.appendChild(h('div', { class: 'bot-detail', text: `Every row below exits the whole position at that target. Two questions are separated on purpose: how often price reached the target before the stop (the mechanical hit rate) and how often the trade actually finished in profit after costs. On this market the round-trip cost is ${bt.meta && bt.meta.cost_r_median != null ? bt.meta.cost_r_median + 'R' : '—'} per trade (${bt.meta && bt.meta.cost_bps != null ? bt.meta.cost_bps + ' bp of price' : '—'}${bt.meta && bt.meta.cost_source ? ', ' + esc(bt.meta.cost_source) : ''}) — so a target smaller than the cost cannot win, however often it is touched.` }));

    const viewKeys = Object.keys(views);
    const measuredDefault = (bt.default_view && views[bt.default_view]) ? bt.default_view : 'all';
    let view = (B.fview && views[B.fview]) ? B.fview : measuredDefault;
    if (viewKeys.length) {
      const row = h('div', { class: 'chip-row' });
      viewKeys.forEach((k) => {
        const on = k === view;
        const isDefault = k === measuredDefault;
        const chip = h('button', { class: 'chip ' + (on ? 'ok' : ''), title: ((views[k] || {}).label || k) + (isDefault ? ' — the measured default view' : ''), text: `${k}${isDefault ? ' · default' : ''} (n=${(views[k] || {}).trades || 0})` });
        chip.addEventListener('click', () => { B.fview = k; global.App.refresh(); });
        row.appendChild(chip);
      });
      hc.appendChild(row);
      hc.appendChild(h('div', { class: 'muted bot-detail', text: (views[view] || {}).label || '' }));
      if (measuredDefault !== 'all' && view === measuredDefault) {
        hc.appendChild(h('div', { class: 'field-note', text: `View shown by default: ${measuredDefault} (marked "default" on the chip) — the gate combination that measured the highest expectancy in docs/MEASURED-RULES.md (rules rule-sweep: leg entry + stop ≥ 0.6 ATR + first target ≥ 3R). Switch chips to see the other shapes; the default is a measurement, not a preference.` }));
      }
    }
    const rows = (views[view] && views[view].rows && views[view].rows.length) ? views[view].rows : plain;
    const note = (views[view] && views[view].note) || '';
    if (note) hc.appendChild(h('div', { class: 'bot-warn', text: note }));
    const tt = h('table', { class: 'data-table' });
    tt.innerHTML = `<thead><tr><th>Target</th><th class="num">Trades</th><th class="num">Touched</th><th class="num">Net win</th><th class="num">Net ≥ +0.5R</th><th class="num">Expectancy</th><th class="num">Break-even needs</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td class="mono">${r.target_r}R</td>
        <td class="num">${r.trades}</td>
        <td class="num muted">${r.hit_pct == null ? '—' : r.hit_pct + '%'}</td>
        <td class="num ${r.net_win_pct >= 60 ? 'pos' : ''}">${r.net_win_pct == null ? '—' : r.net_win_pct + '%'}</td>
        <td class="num">${r.clean_pct == null ? '—' : r.clean_pct + '%'}</td>
        <td class="num ${r.expectancy_r > 0 ? 'pos' : 'neg'}">${r.expectancy_r == null ? '—' : (r.expectancy_r > 0 ? '+' : '') + r.expectancy_r + 'R'}</td>
        <td class="num muted">${r.breakeven_pct == null ? '—' : r.breakeven_pct + '%'}</td>
      </tr>`).join('')}</tbody>`;
    hc.appendChild(tt);
    const topWin = rows.slice().sort((a, b) => b.net_win_pct - a.net_win_pct)[0];
    const topExp = rows.slice().sort((a, b) => b.expectancy_r - a.expectancy_r)[0];
    if (topWin && topExp) {
      hc.appendChild(h('div', { class: 'bot-detail', text: `Read on this market: the highest net win rate is ${topWin.net_win_pct}% at a ${topWin.target_r}R target (its expectancy: ${topWin.expectancy_r}R). The best expectancy is ${topExp.expectancy_r > 0 ? '+' : ''}${topExp.expectancy_r}R at ${topExp.target_r}R with ${topExp.net_win_pct}% wins. Those two rows are the whole trade-off — the peaks are never in the same row.` }));
    }

    if ((bt.presets || []).length) {
      hc.appendChild(h('div', { class: 'card-head', style: 'margin-top:10px', html: '<h3>Three ways to trade this model</h3><span class="spacer"></span><span class="tiny muted">each with its measured number</span>' }));
      (bt.presets || []).forEach((pr) => {
        const m = pr.measured || {};
        const num = pr.key === 'winrate' ? `${m.test_win_pct == null ? '' : m.test_win_pct.toFixed(1) + '% wins on unseen data · '}${m.expectancy_r == null ? '' : m.expectancy_r + 'R'}`
          : pr.key === 'edge' ? `${m.test_exp_r == null ? '' : '+' + m.test_exp_r + 'R on unseen data · '}${m.win_pct == null ? '' : m.win_pct + '% wins'}`
          : 'high-30s / low-40s % wins · ≈ 0R';
        hc.appendChild(h('div', { class: 'muted bot-detail', text: `${pr.label} — ${num}. ${pr.note}` }));
      });
      hc.appendChild(h('div', { class: 'field-note', text: `Preset provenance: scripts/rule-sweep.js, 24 markets, ${bt.measured_rules_at ? String(bt.measured_rules_at).slice(0, 10) : ''} — see docs/MEASURED-RULES.md. The app deliberately does not claim a 70 % win rate and a positive expectancy at the same time: measured 2026-10-06, no configuration of this entry model produced both.` }));
    }
    pane.appendChild(hc);

    const grid = h('div', { class: 'bot-grid' });
    const left = h('div', { class: 'bot-col' }), right = h('div', { class: 'bot-col' });

    /* live probabilities */
    const live = h('div', { class: 'card' });
    live.appendChild(h('div', { class: 'card-head', html: `<strong>Live setups</strong> <span class="muted">probability to reach the first target before the stop</span>` }));
    if (!(p.setups || []).length) live.appendChild(h('div', { class: 'empty', text: 'No qualifying setup right now — nothing to price.' }));
    (p.setups || []).forEach((s) => {
      const row = h('div', { class: 'bot-prob ' + (s.dir > 0 ? 'pos' : 'neg') });
      row.appendChild(h('div', { class: 'bot-prob-head', html: `<b>${s.side.toUpperCase()}</b> ${esc(s.grade)} · ${s.entry_status || ''}` }));
      row.appendChild(h('div', { class: 'bot-prob-bar', html: `<i style="width:${s.p_win || 0}%"></i><span>${s.p_win == null ? '—' : s.p_win + '%'}</span>` }));
      row.appendChild(h('div', { class: 'muted bot-detail', text: `entry ${fmt(s.entry, 5)} · stop ${fmt(s.stop, 5)} · target ${fmt(s.target, 5)} · ${s.rr_primary}R` }));
      row.appendChild(h('div', { class: 'muted bot-detail', text: `model ${s.p_model}% · empirical ${s.p_empirical}% (${s.similar_setups} similar setups) · expected value ${s.expected_r}R` }));
      // the playlist's own refinement loop, measured: does this setup satisfy it?
      const pl = s.playlist;
      if (pl) {
        const flags = [
          ['OTE retrace', pl.ote === 1, pl.ote === 1 ? 'entry sits in the 50–79 % retrace of the displacement leg' : 'entry is outside the 50–79 % retrace band'],
          ['MACD agrees', pl.macd_align === 1, pl.macd_align === 1 ? 'MACD (12,26) is on the trade’s side of zero' : 'MACD disagrees with the direction'],
          ['With the 50 EMA', pl.ema50_align === 1, pl.ema50_align === 1 ? 'price is on the trend side of the 50 EMA and the EMA is sloping that way' : 'the 50 EMA does not confirm this direction'],
          ['Fresh sweep', pl.sweep_bars != null && pl.sweep_bars <= 5, pl.sweep_bars == null ? 'no sweep in the last 26 bars' : `sweep was ${pl.sweep_bars} bars ago`],
        ];
        row.appendChild(h('div', { class: 'chip-row', html: flags.map(([label, on, title]) =>
          `<span class="chip ${on ? 'ok' : 'warn'}" title="${esc(title)}">${esc(label)} <b>${on ? 'ok' : 'no'}</b></span>`).join('') }));
        if (pl.mtf) {
          const m = pl.mtf;
          const live = m.status === 'live' || m.status === 'recent';
          row.appendChild(h('div', { class: 'chip-row', html: `<span class="chip ${m.status === 'waiting' || !m.available || m.status === 'rejected' ? 'warn' : 'ok'}" title="${esc(m.note || '')}">LTF confirmation (${esc(m.tf || '—')}) <b>${m.status === 'live' ? 'live' : m.status === 'recent' ? `fired ${m.bars_ago} bars ago` : m.status === 'rejected' ? 'sub-noise' : m.available ? 'waiting' : 'no data'}</b></span>` }));
          row.appendChild(h('div', { class: 'muted bot-detail', text: m.note }));
          // the confirmation is not just a status: it is a plan you can take and be graded on
          if (live && m.plan) {
            const plan = m.plan;
            const tgt = (plan.targets || []).filter((t) => t.rr >= 0.9);
            row.appendChild(h('div', { class: 'bot-detail', html: `<strong>Refined plan (${esc(m.tf)} confirmation)</strong> — entry <b>${fmt(plan.entry, 5)}</b> · stop ${fmt(plan.stop, 5)} · risk ${fmt(plan.risk, 5)} (${plan.risk_atr} ATR) · ${tgt.length ? tgt.slice(0, 3).map((t) => `${t.label ? esc(t.label) + ' ' : ''}${fmt(t.price, 5)} (${t.rr}R)`).join(' → ') : 'no target ≥ 0.9R from here'}` }));
            const btn = h('button', { class: 'btn small', text: 'Save refined plan to signals' });
            btn.addEventListener('click', async () => {
              try {
                const r = await global.API.post('/bots/signals/save-plan', {
                  symbol: (B.data && B.data.symbol) || B.symbol, timeframe: B.tf,
                  entry: plan.entry, stop: plan.stop, targets: plan.targets,
                  grade: s.grade, score: s.score, p_win: s.p_win, rr_primary: plan.rr_primary,
                  entry_mode: 'mtf', mtf_tf: m.tf, risk_atr: plan.risk_atr,
                  note: `MTF entry: ${B.tf} setup confirmed by the ${m.tf} (sweep + displacement inside the zone)`,
                });
                global.App.toast(r.saved ? 'Refined plan saved — resolve it later to grade the bot' : (r.reason || 'Not saved'), r.saved ? 'ok' : 'warn');
                if (r.saved) B.signals = null;
              } catch (e) { global.App.toast(e.message, 'err'); }
            });
            row.appendChild(btn);
          }
        }
        const mg = s.measured_gates;
        if (mg) {
          row.appendChild(h('div', { class: 'chip-row', html: [
            `<span class="chip ${mg.stop_ge_06atr ? 'ok' : 'warn'}" title="Stop distance ÷ ATR at entry (${s.risk_atr == null ? '—' : s.risk_atr}). Every positive-expectancy rule that survived the out-of-sample sweep required 0.6 × ATR or more (scripts/rule-sweep.js, 2026-10-06).">Stop ≥ 0.6 ATR <b>${mg.stop_ge_06atr ? 'ok' : 'no'}</b></span>`,
            `<span class="chip ${mg.runway3 ? 'ok' : 'warn'}" title="First target ${s.rr_primary == null ? '—' : s.rr_primary}R away. The measured maximum-expectancy shape needs a 3R first target (docs/MEASURED-RULES.md).">Target ≥ 3R <b>${mg.runway3 ? 'ok' : 'no'}</b></span>`,
          ].join('') }));
        }
        const oe = pl.ote_entry;
        if (oe) {
          row.appendChild(h('div', { class: 'muted bot-detail', text: oe.inside_band
            ? `OTE band ${oe.ote_band ? oe.ote_band.join(' – ') : ''}: the planned entry is already inside it (risk ${oe.risk} = ${oe.risk_atr} ATR, first target ${oe.rr_primary}R).`
            : `Refinement suggestion — wait for the retrace into the OTE band ${oe.ote_band ? oe.ote_band.join(' – ') : ''} at ${oe.price} instead of ${s.entry}: risk becomes ${oe.risk} (${oe.risk_atr} ATR) and the first target pays ${oe.rr_primary}R instead of ${s.rr_primary}R.` }));
        }
        row.appendChild(h('div', { class: 'muted bot-detail', text: pl.ote === 1 && pl.macd_align === 1
          ? 'This setup satisfies the two refinements that measured best (OTE retrace + MACD): recorded in docs/EDGE-REPORT.md as the only filters that lifted the clean-win rate out of sample — still not 70 % on their own.'
          : 'The playlist’s refinement loop would have you wait: the measured best filters are entry inside the OTE retrace band with MACD agreement (docs/EDGE-REPORT.md).' }));
        row.appendChild(h('div', { class: 'muted bot-detail', text: 'Multi-timeframe entry (wait for the ' + (pl.mtf && pl.mtf.tf ? pl.mtf.tf : 'lower timeframe') + ' to sweep + displace inside the zone) was measured 2026-10-06 on 24 markets with per-instrument costs: it lifts the video-plan win rate to 46.2 % — the highest of any entry rule tried — but average expectancy stays −0.27R because the confirmation moves the entry, not the stop/target geometry. Trade it for hit rate, not for expectancy. Market-by-market base-vs-MTF table: docs/MTF-REPORT.md.' }));
      }
      live.appendChild(row);
    });
    left.appendChild(live);

    /* direction buckets */
    if (p.direction) {
      const dir = h('div', { class: 'card' });
      dir.appendChild(h('div', { class: 'card-head', html: `<strong>Odds, not instructions</strong> <span class="muted">P(price higher in ${p.direction.horizon_bars} bars) from the trend read · the method, not this number, decides which side may be traded</span>` }));
      const rows = (p.direction.buckets || []).map((b) => `<tr class="${b === p.direction.bucket ? 'hl' : ''}">
        <td>${esc(b.label)}</td><td class="mono">${b.score}</td><td class="mono">${b.samples}</td>
        <td class="mono ${b.p_up >= 50 ? 'pos' : 'neg'}">${b.p_up}%</td><td class="mono">${b.avg_return_pct}%</td></tr>`).join('');
      dir.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Read</th><th>Score</th><th>Cases</th><th>P(up)</th><th>Avg move</th></tr></thead><tbody>${rows}</tbody></table>` }));
      dir.appendChild(h('div', { class: 'muted bot-detail', text: p.direction.note || '' }));
      if (p.direction.p_up_pct != null) dir.appendChild(h('div', { class: 'bot-plan', html: `Right now: <b>${p.direction.bucket}</b> → <b>${p.direction.p_up_pct}%</b> of ${p.direction.samples} historical cases closed higher ${p.direction.horizon_bars} bars later.` }));
      left.appendChild(dir);
    }

    /* model card */
    const m = p.model || {};
    const mc = h('div', { class: 'card' });
    mc.appendChild(h('div', { class: 'card-head', html: `<strong>Model</strong> <span class="muted">logistic regression on the confluence checklist</span>` }));
    if (!m.ok) mc.appendChild(h('div', { class: 'empty', text: m.note || 'Not enough resolved setups to train.' }));
    else {
      mc.appendChild(h('div', { class: 'bot-kv', html: `
        <div><span class="muted">Trained on</span><b>${m.n} setups</b></div>
        <div><span class="muted">In-sample accuracy</span><b>${m.accuracy}% (base ${m.base_rate}%)</b></div>
        <div><span class="muted">Log loss</span><b>${m.log_loss}</b></div>
        ${p.backtest && p.backtest.out_of_sample ? `<div><span class="muted">Out-of-sample</span><b>${p.backtest.out_of_sample.accuracy}% acc · base ${p.backtest.out_of_sample.base_rate}% (tested on the last ${p.backtest.out_of_sample.test_n} setups)</b></div>` : ''}` }));
      const ws = Object.entries(m.weights || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      mc.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Feature</th><th>Weight</th><th>Effect</th></tr></thead><tbody>${ws.map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td class="mono">${v}</td><td>${v > 0 ? '<span class="chip pos">helps</span>' : '<span class="chip neg">hurts</span>'}</td></tr>`).join('')}</tbody></table>` }));
      mc.appendChild(h('div', { class: 'muted bot-detail', text: 'Weights are standardised: they show which part of the checklist actually predicted outcomes on this market, and in which direction.' }));
    }
    right.appendChild(mc);

    /* calibration + grades */
    if (p.backtest && p.backtest.calibration) {
      const cal = h('div', { class: 'card' });
      cal.appendChild(h('div', { class: 'card-head', html: `<strong>Calibration</strong> <span class="muted">predicted vs what actually happened</span>` }));
      cal.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Bucket</th><th>n</th><th>Predicted</th><th>Actual</th></tr></thead><tbody>${p.backtest.calibration.map((c) => `<tr><td>${esc(c.range)}</td><td class="mono">${c.n}</td><td class="mono">${c.predicted}%</td><td class="mono ${c.actual >= c.predicted ? 'pos' : 'neg'}">${c.actual}%</td></tr>`).join('')}</tbody></table>` }));
      right.appendChild(cal);
    }
    if (p.backtest && p.backtest.by_grade) {
      const g = h('div', { class: 'card' });
      g.appendChild(h('div', { class: 'card-head', html: `<strong>Outcome by grade</strong> <span class="muted">does the letter grade actually work here?</span>` }));
      g.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Grade</th><th>Setups</th><th>Win rate</th><th>Expectancy</th></tr></thead><tbody>${p.backtest.by_grade.map((x) => `<tr><td><b>${esc(x.grade)}</b></td><td class="mono">${x.trades}</td><td class="mono">${x.win_rate}%</td><td class="mono ${x.expectancy_r > 0 ? 'pos' : 'neg'}">${x.expectancy_r}R</td></tr>`).join('')}</tbody></table>` }));
      g.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Side</th><th>Setups</th><th>Win rate</th><th>Expectancy</th></tr></thead><tbody>${(p.backtest.by_direction || []).map((x) => `<tr><td>${esc(x.side)}</td><td class="mono">${x.trades}</td><td class="mono">${x.win_rate == null ? '—' : x.win_rate + '%'}</td><td class="mono ${x.expectancy_r > 0 ? 'pos' : 'neg'}">${x.expectancy_r}R</td></tr>`).join('')}</tbody></table>` }));
      right.appendChild(g);
    }

    grid.appendChild(left); grid.appendChild(right);
    pane.appendChild(grid);

    /* trade-by-trade */
    if (B.backtestTrades && B.backtestTrades.length) {
      const t = h('div', { class: 'card' });
      t.appendChild(h('div', { class: 'card-head', html: `<strong>Recent replay</strong> <span class="muted">the last ${B.backtestTrades.length} resolved setups on this market</span>` }));
      t.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>When</th><th>Side</th><th>Grade</th><th>Score</th><th>Plan R:R</th><th>Outcome</th><th>R</th><th>MAE</th><th>MFE</th></tr></thead><tbody>${B.backtestTrades.map((x) => `<tr><td class="mono">${esc(x.t)}</td><td>${esc(x.side)}</td><td>${esc(x.grade)}</td><td class="mono">${x.score}</td><td class="mono">${x.rr}</td><td>${esc(x.outcome)}</td><td class="mono ${x.r > 0 ? 'pos' : 'neg'}">${x.r}</td><td class="mono muted">${x.mae}</td><td class="mono muted">${x.mfe}</td></tr>`).join('')}</tbody></table>` }));
      pane.appendChild(t);
    }
  }

  /* ══════════════════════════════════════════════════════ panel: scan */

  function panelScan(pane) {
    const head = h('div', { class: 'card' });
    const row = h('div', { class: 'row gap-8 wrap' });
    const input = h('input', { class: 'input', style: 'flex:1;min-width:260px', value: B.scanList.join(', '), placeholder: 'comma separated symbols' });
    const tfSel = h('select', { class: 'input', style: 'max-width:100px' });
    ['5m', '15m', '30m', '1h', '4h'].forEach((t) => tfSel.appendChild(h('option', { value: t, text: t, selected: t === B.tf ? 'selected' : null })));
    const btn = h('button', { class: 'btn primary sm', text: B.busy === 'scan' ? 'Scanning…' : 'Scan markets' });
    btn.addEventListener('click', async () => {
      B.scanList = input.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      B.tf = tfSel.value; B.scan = null; B.busy = 'scan'; global.App.refresh();
    });
    [input, tfSel, btn].forEach((n) => row.appendChild(n));
    head.appendChild(row);
    head.appendChild(h('div', { class: 'muted bot-detail', text: 'The scan ranks markets by mechanics + setup quality. It is the "where should I look" tool — no prediction cost, so it is fast.' }));
    pane.appendChild(head);

    if (!B.scan) { pane.appendChild(h('div', { class: 'empty', text: B.busy === 'scan' ? 'Fetching candles for the watchlist…' : 'Press scan.' })); return; }
    const s = B.scan;
    pane.appendChild(h('div', { class: 'card', html: `<div class="muted">${s.count} markets scanned · ${s.actionable} with an actionable setup · ${s.killzone ? 'killzone: ' + esc(s.killzone) : 'outside killzones'}</div>` }));
    const rows = (s.rows || []).map((r) => `<tr class="bot-scan-row" data-symbol="${esc(r.symbol)}">
        <td><b>${esc(r.symbol)}</b><div class="muted-2">${esc(r.provider)}</div></td>
        <td class="mono">${fmt(r.price, 5)}</td>
        <td>${r.direction === 'bullish' ? '<span class="chip pos">bullish</span>' : r.direction === 'bearish' ? '<span class="chip neg">bearish</span>' : '<span class="chip muted">neutral</span>'}</td>
        <td class="mono">${r.mechanics} <span class="muted">${esc(r.mechanics_grade)}</span></td>
        <td><b class="${r.action === 'BUY' ? 'pos' : r.action === 'SELL' ? 'neg' : 'muted'}">${esc(r.action)}</b> <span class="muted">${esc(r.grade)} · ${r.score}</span></td>
        <td>${esc(r.entry_status || '—')}</td>
        <td class="mono">${r.entry ? fmt(r.entry, 5) : '—'}</td>
        <td class="mono">${r.stop ? fmt(r.stop, 5) : '—'}</td>
        <td class="mono">${r.rr_final ? r.rr_final + 'R' : '—'}</td>
        <td class="mono">${r.sweeps}</td></tr>`).join('');
    const table = h('div', { class: 'card' });
    table.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Market</th><th>Price</th><th>Read</th><th>Mechanics</th><th>Setup</th><th>Entry status</th><th>Entry</th><th>Stop</th><th>Final R:R</th><th>Sweeps</th></tr></thead><tbody>${rows}</tbody></table>` }));
    table.querySelectorAll('.bot-scan-row').forEach((tr) => tr.addEventListener('click', () => {
      B.symbol = tr.dataset.symbol; B.tab = 'mechanic'; B.data = null;
      global.App.refresh();
    }));
    pane.appendChild(table);
    if ((s.errors || []).length) pane.appendChild(h('div', { class: 'card', html: `<div class="muted">Unavailable: ${s.errors.map((e) => esc(e.symbol) + ' (' + esc(e.error || '') + ')').join(', ')}</div>` }));
  }

  /* ════════════════════════════════════════════════ panel: corrections */

  function panelCorrect(pane) {
    const c = B.correction;
    if (!c) {
      pane.appendChild(h('div', { class: 'card' }, h('button', { class: 'btn primary sm', text: B.busy === 'correct' ? 'Reading your journal…' : 'Analyse my trading', onclick: () => { B.busy = 'correct'; global.App.refresh(); } })));
      return;
    }
    const top = h('div', { class: 'card' });
    const summary = h('div', { style: 'flex:1;min-width:260px' });
    summary.appendChild(h('div', { html: `<b style="font-size:1.1rem">${esc(c.behavior_grade)}</b> <span class="muted">— ${c.sample.trades} closed trades analysed (${esc(c.sample.from || '')} → ${esc(c.sample.to || '')})</span>` }));
    summary.appendChild(h('div', { class: 'muted bot-detail', text: `Behaviour score ${c.behavior_score}/100. Each mistake below costs 3–12 points; fixes earn them back.` }));
    if (c.top_fix) summary.appendChild(h('div', { class: 'bot-warn', text: `Top priority: ${c.top_fix.title} — ${c.top_fix.fix}` }));
    top.appendChild(h('div', { class: 'row gap-16 wrap', style: 'align-items:center' },
      h('div', { html: global.U.gauge(c.behavior_score, { label: 'behaviour', max: 100 }) }),
      summary));
    pane.appendChild(top);

    const g = c.guardrails.guardrails || {};
    const gr = h('div', { class: 'card' });
    gr.appendChild(h('div', { class: 'card-head', html: `<strong>Your guardrails</strong> <span class="muted">derived from your own winning behaviour</span>` }));
    gr.appendChild(h('div', { class: 'stat-strip', html: `
      <div><div class="l">Risk / trade</div><div class="v">${g.max_risk_pct}%</div></div>
      <div><div class="l">Trades / day</div><div class="v">${g.max_trades_day}</div></div>
      <div><div class="l">Cooldown after a loss</div><div class="v">${g.cooldown_min}m</div></div>
      <div><div class="l">Stop after</div><div class="v">${g.max_consecutive_losses} losses</div></div>
      <div><div class="l">Daily loss limit</div><div class="v">${g.daily_loss_limit_pct}%</div></div>` }));
    if (g.size_cap_note) gr.appendChild(h('div', { class: 'bot-detail', text: '• ' + g.size_cap_note }));
    gr.appendChild(h('div', { class: 'muted bot-detail', text: g.basis || '' }));
    gr.appendChild(h('div', { class: 'bot-plan ' + (c.daily.status === 'stop' ? 'neg' : c.daily.status === 'caution' ? 'warn' : ''), text: c.daily.message || '' }));
    pane.appendChild(gr);

    const grid = h('div', { class: 'bot-grid' });
    const left = h('div', { class: 'bot-col' }), right = h('div', { class: 'bot-col' });
    (c.mistakes || []).forEach((m) => {
      const card = h('div', { class: 'card' });
      const sev = m.severity === 'high' ? 'neg' : m.severity === 'medium' ? 'warn' : 'muted';
      card.appendChild(h('div', { class: 'card-head', html: `<span class="chip ${sev}">${esc(m.severity)}</span> <strong>${esc(m.title)}</strong>` }));
      card.appendChild(h('div', { class: 'bot-detail', text: m.metric }));
      if (m.impact != null) card.appendChild(h('div', { class: 'bot-plan', html: `Cost: <b class="${m.impact < 0 ? 'neg' : 'pos'}">${m.impact} ${esc(m.impact_unit || '')}</b>` }));
      if (m.evidence && m.evidence.length) card.appendChild(h('div', { class: 'muted bot-detail', html: m.evidence.map((e) => '· ' + esc(e)).join('<br>') }));
      card.appendChild(h('div', { class: 'bot-fix', text: '→ ' + m.fix }));
      card.appendChild(h('div', { class: 'row gap-8' }, h('button', { class: 'btn xs', text: 'Show the trades', onclick: () => {
        global.Store.filters.symbol = ''; global.Store.filters.q = ''; global.Store.invalidate();
        global.App.go('trades');
      } })));
      left.appendChild(card);
    });

    const grades = h('div', { class: 'card' });
    grades.appendChild(h('div', { class: 'card-head', html: `<strong>Auto-graded setups</strong> <span class="muted">every trade graded from its own data</span>` }));
    grades.appendChild(h('div', { class: 'table-wrap', html: `<table class="table"><thead><tr><th>Grade</th><th>Trades</th><th>Win rate</th><th>Net</th><th>Expectancy</th></tr></thead><tbody>${(c.grades || []).map((x) => `<tr><td><b>${esc(x.grade)}</b></td><td class="mono">${x.trades}</td><td class="mono">${x.win_rate}%</td><td class="mono ${x.net > 0 ? 'pos' : 'neg'}">${global.U.moneySign(x.net)}</td><td class="mono ${x.expectancy_r > 0 ? 'pos' : 'neg'}">${x.expectancy_r}R</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No graded trades yet.</td></tr>'}</tbody></table>` }));
    const backfill = h('button', { class: 'btn sm', text: 'Auto-grade the trades that have no grade' });
    backfill.addEventListener('click', async () => {
      try {
        const r = await global.API.post('/bots/correction/backfill', {});
        global.App.toast(`Graded ${r.updated} trade(s)`, 'ok');
        B.correction = null; global.App.refresh();
      } catch (e) { global.App.toast(e.message, 'err'); }
    });
    grades.appendChild(h('div', { class: 'card' }, backfill));
    right.appendChild(grades);

    const fb = h('div', { class: 'card' });
    fb.appendChild(h('div', { class: 'card-head', html: `<strong>Review one trade</strong> <span class="muted">behavioural feedback, nothing personal</span>` }));
    const idIn = h('input', { class: 'input', type: 'number', placeholder: 'trade id', style: 'max-width:130px' });
    const fbOut = h('div', { class: 'bot-col' });
    const fbBtn = h('button', { class: 'btn sm primary', text: 'Review' });
    fbBtn.addEventListener('click', async () => {
      try {
        const r = await global.API.get('/bots/feedback/' + Number(idIn.value));
        global.U.clear(fbOut);
        fbOut.appendChild(h('div', { class: 'bot-plan', html: `<b>${esc(r.symbol)}</b> — grade <b>${esc(r.grade)}</b> (${r.score}/100): ${esc(r.summary)}` }));
        (r.notes || []).forEach((n) => fbOut.appendChild(h('div', { class: 'bot-' + (n.tone === 'bad' ? 'warn' : n.tone === 'good' ? 'good' : 'detail'), text: (n.tone === 'good' ? 'Kept: ' : n.tone === 'bad' ? 'Fix: ' : '') + n.text })));
        if (!r.notes || !r.notes.length) fbOut.appendChild(h('div', { class: 'muted', text: 'No behavioural flags on this trade.' }));
      } catch (e) { global.App.toast(e.message, 'err'); }
    });
    fb.appendChild(h('div', { class: 'row gap-8' }, idIn, fbBtn));
    fb.appendChild(fbOut);
    right.appendChild(fb);

    grid.appendChild(left); grid.appendChild(right);
    pane.appendChild(grid);
  }

  /* ═════════════════════════════════════════════════════ panel: signals */

  function panelSignals(pane) {
    const s = B.signals;
    if (!s) { pane.appendChild(h('div', { class: 'empty', text: 'Loading signals…' })); return; }
    const st = s.stats || {};
    pane.appendChild(h('div', { class: 'card', html: `<div class="stat-strip">
      <div><div class="l">Tracked</div><div class="v">${st.total || 0}</div></div>
      <div><div class="l">Pending</div><div class="v">${st.pending || 0}</div></div>
      <div><div class="l">Resolved</div><div class="v">${st.resolved || 0}</div></div>
      <div><div class="l">Win rate</div><div class="v">${st.win_rate == null ? '—' : st.win_rate + '%'}</div></div>
      <div><div class="l">Expectancy</div><div class="v ${st.expectancy_r > 0 ? 'pos' : 'neg'}">${st.expectancy_r == null ? '—' : st.expectancy_r + 'R'}</div></div>
      <div><div class="l">Total</div><div class="v">${st.total_r == null ? '—' : st.total_r + 'R'}</div></div>
    </div>` }));
    if (!(s.signals || []).length) { pane.appendChild(h('div', { class: 'empty', text: 'No signals saved yet. Analyse a market and press "Save as signal" — the bot then grades itself against live candles.' })); return; }
    const rows = s.signals.map((g) => `<tr>
      <td>#${g.id}</td><td><b>${esc(g.symbol)}</b> <span class="muted">${esc(g.timeframe)}</span></td>
      <td class="${g.dir > 0 ? 'pos' : 'neg'}">${esc(g.side.toUpperCase())}</td>
      <td>${esc(g.grade)} <span class="muted">${g.score}</span></td>
      <td class="mono">${g.p_win == null ? '—' : g.p_win + '%'}</td>
      <td class="mono">${fmt(g.entry, 5)}</td><td class="mono">${fmt(g.stop, 5)}</td>
      <td class="mono">${g.rr_final ? g.rr_final + 'R' : '—'}</td>
      <td>${g.status === 'pending' ? '<span class="chip info">pending</span>' : g.status === 'win' ? '<span class="chip pos">win</span>' : g.status === 'loss' ? '<span class="chip neg">loss</span>' : `<span class="chip muted">${esc(g.status)}</span>`}</td>
      <td class="mono">${g.outcome_r == null ? '—' : g.outcome_r + 'R'}</td>
      <td class="muted-2">${esc(String(g.created_at || '').slice(0, 16))}</td></tr>`).join('');
    pane.appendChild(h('div', { class: 'card', html: `<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Market</th><th>Side</th><th>Grade</th><th>P(win)</th><th>Entry</th><th>Stop</th><th>Final R:R</th><th>Status</th><th>R</th><th>Saved</th></tr></thead><tbody>${rows}</tbody></table></div>` }));
    if ((st.by_grade || []).length) {
      pane.appendChild(h('div', { class: 'card', html: `<div class="card-head"><strong>Signal quality by grade</strong></div><div class="table-wrap"><table class="table"><thead><tr><th>Grade</th><th>Resolved</th><th>Win rate</th><th>Expectancy</th></tr></thead><tbody>${st.by_grade.map((x) => `<tr><td><b>${esc(x.grade)}</b></td><td class="mono">${x.resolved}</td><td class="mono">${x.win_rate}%</td><td class="mono ${x.expectancy_r > 0 ? 'pos' : 'neg'}">${x.expectancy_r}R</td></tr>`).join('')}</tbody></table></div>` }));
    }
    (s.signals || []).filter((g) => g.outcome_note).slice(0, 6).forEach((g) => pane.appendChild(h('div', { class: 'muted bot-detail', text: `#${g.id} ${g.symbol}: ${g.outcome_note}` })));
  }

  /* ═════════════════════════════════════════════════════════════ render */

  Views.bots = {
    title: 'Bots',
    render(root) {
      root.innerHTML = '';                       // replace the shell's skeleton placeholder
      if (global.__botRequest) {                 // handed over from the Market chart panel
        B.symbol = String(global.__botRequest.symbol || B.symbol).toUpperCase();
        B.tf = global.__botRequest.tf || B.tf;
        B.tab = 'mechanic';
        B.data = null; B.predict = null; B.error = '';
        delete global.__botRequest;
      }
      const card = h('div', { class: 'view-bots' });
      const tabs = h('div', { class: 'tabs' });
      TABS.forEach(([id, label]) => tabs.appendChild(h('button', { class: B.tab === id ? 'active' : '', text: label, onclick: () => { B.tab = id; global.App.refresh(); } })));
      card.appendChild(tabs);

      card.appendChild(toolbar(() => global.App.refresh()));

      const pane = h('div', { class: 'bot-pane' });
      if (B.busy === 'analyse') pane.appendChild(h('div', { class: 'card', text: 'Running the mechanics pass…' }));
      else if (B.tab === 'mechanic') panelMechanic(pane);
      else if (B.tab === 'predict') panelPredict(pane);
      else if (B.tab === 'scan') panelScan(pane);
      else if (B.tab === 'correct') panelCorrect(pane);
      else panelSignals(pane);
      card.appendChild(pane);
      if (B.error) card.appendChild(h('div', { class: 'card pad neg', text: B.error }));
      root.appendChild(card);

      /* ── async loaders: one explicit state machine, independent of the tab ── */

      // first visit to the view: run an analysis straight away
      if (!B.data && !B.busy && !B.error) B.busy = 'analyse';
      /* …and a read that has gone stale re-runs itself when the trader comes
         back. The whole point of this screen is "what to do at the moment": a
         payload from three bars ago is history, and until now re-entering the
         view just showed it again (a same-document hash navigation does not even
         re-run the loader). One bar of grace, then re-run in the background —
         the strip keeps showing the previous read with its age until the new one
         lands, so nothing flickers to an empty state.                        */
      if (B.data && !B.busy && !B.error && B.updated) {
        const ms = TF_MS[B.tf] || 900000;
        if (Date.now() - B.updated > ms) B.busy = 'analyse';
      }
      // entering a tab that needs data starts its own load once
      if (!B.busy && B.tab === 'scan' && !B.scan) B.busy = 'scan';
      if (!B.busy && B.tab === 'correct' && !B.correction) B.busy = 'correct';

      if (B.busy === 'analyse') {
        const sym = B.symbol, tf = B.tf;
        const trim = B.trim || 0;
        Promise.all([
          API.get('/bots/analyse', { symbol: sym, tf, prediction: B.prediction ? 1 : 0, bars: B.bars, min_rr: B.minRR, trim }),
          API.get('/bots/chart', { symbol: sym, tf, bars: 600, min_rr: B.minRR, trim }).catch(() => null),
          API.get('/chart/drawings', { symbol: sym, tf }).catch(() => ({ drawings: [] })),
        ]).then(([d, ch, dr]) => {
          B.data = d; B.predict = d.prediction; B.chart = ch; B.candles = (ch && ch.candles) || [];
          B.drawings = (dr && dr.drawings) || [];
          B.backtestTrades = null; B.busy = ''; B.updated = Date.now();
          global.App.refresh();
        }).catch((e) => { B.error = 'Analysis failed: ' + e.message; B.busy = ''; global.App.refresh(); });
      } else if (B.busy === 'scan') {
        API.get('/bots/scan', { symbols: B.scanList.join(','), tf: B.tf })
          .then((r) => { B.scan = r; B.busy = ''; global.App.refresh(); })
          .catch((e) => { B.error = 'Scan failed: ' + e.message; B.busy = ''; global.App.refresh(); });
      } else if (B.busy === 'correct') {
        API.get('/bots/correction', {})
          .then((c) => { B.correction = c; B.busy = ''; global.App.refresh(); })
          .catch((e) => { B.error = 'Correction bot failed: ' + e.message; B.busy = ''; global.App.refresh(); });
      } else if (B.busy === 'backtest') {
        // handled inline below (predict tab)
      } else if (B.tab === 'predict' && B.data && !B.backtestTrades) {
        B.busy = 'backtest';
        API.get('/bots/backtest', { symbol: B.data.symbol, tf: B.data.timeframe, bars: B.bars, step: 2, samples: 25 })
          .then((bt) => { B.backtestTrades = bt.trades || []; B.busy = ''; global.App.refresh(); })
          .catch(() => { B.busy = ''; global.App.refresh(); });
      } else if (B.tab === 'signals' && !B.signals) {
        API.get('/bots/signals', {})
          .then((r) => { B.signals = r; global.App.refresh(); })
          .catch(() => {});
      }
    },
    reset() { B.data = null; B.predict = null; B.scan = null; B.correction = null; B.signals = null; B.candles = null; B.chart = null; B.backtestTrades = null; B.error = ''; },
  };

  B.initial = null;
})(window);
