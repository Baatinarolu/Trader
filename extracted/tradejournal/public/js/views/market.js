/* views/market.js — economic calendar, news, quotes, watchlist, sentiment */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};


  /* ══════════════════════════════════════════════ TradingView chart panel */

  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

  /**
   * The official TradingView embed. The widget needs their servers, so we always
   * paint the toolbar first (symbol, timeframe, deep link, "analyse with the bot")
   * and let tv.js swap in a fallback card if the script can't load.
   */
  const TV_SIZES = [['M', 480], ['L', 640], ['XL', 820], ['Full', 0]];

  function tvPanel() {
    const focus = (Store.user && Store.user.settings && Store.user.settings.focus_symbols) || [];
    const tfList = ['1m', '5m', '15m', '1h', '4h', '1d', '1W'];
    let symbol = String(Store.filters.symbol || lsGet('tj_tv_symbol') || focus[0] || 'XAUUSD').toUpperCase();
    let tf = tfList.includes(lsGet('tj_tv_tf')) ? lsGet('tj_tv_tf') : '15m';
    let style = lsGet('tj_tv_style') || '1';
    let height = Number(lsGet('tj_tv_h') || 640);
    let full = false;
    let studies = [];
    try { studies = JSON.parse(lsGet('tj_tv_studies') || '["", "STD;VWAP"]'); } catch { studies = []; }
    if (!Array.isArray(studies)) studies = [];

    const card = U.h('div', { class: 'card tv-panel' });
    card.appendChild(U.h('div', { class: 'card-head', html: '<h3>TradingView chart</h3><span class="spacer"></span><span class="tiny muted">official embed · full TradingView toolbar, drawing tools and indicators · the chart itself loads from tradingview.com</span>' }));

    /* ---- row 1: market, interval, style, size --------------------------- */
    const bar = U.h('div', { class: 'row wrap gap-8 tv-toolbar' });
    const symInput = U.h('input', { class: 'input', list: 'tv-symbols', value: symbol, style: 'max-width:150px', placeholder: 'Symbol' });
    const dl = U.h('datalist', { id: 'tv-symbols' });
    (Store.instruments || []).forEach((i) => dl.appendChild(U.h('option', { value: i.symbol })));

    const seg = U.h('div', { class: 'seg tv-tf' });
    tfList.forEach((t) => seg.appendChild(U.h('button', { class: 'btn xs', 'data-tf': t, text: t })));

    const styleSel = U.h('select', { class: 'input', style: 'width:auto', title: 'Chart style' });
    (global.TV.CHART_STYLES || [['1', 'Candles']]).forEach(([v, label]) => styleSel.appendChild(U.h('option', { value: v, text: label, selected: v === style ? 'selected' : null })));

    const sizeSeg = U.h('div', { class: 'seg tv-size' });
    TV_SIZES.forEach(([label, px]) => sizeSeg.appendChild(U.h('button', { class: 'btn xs', 'data-h': String(px), text: label, title: px ? px + ' px tall' : 'fill the window' })));

    const fullBtn = U.h('button', { class: 'btn sm ghost', text: 'Full screen', title: 'Fill the whole window (Esc to leave)' });
    const open = U.h('a', { class: 'btn sm ghost', href: global.TV.link(symbol, tf), target: '_blank', rel: 'noopener', text: 'Open on TradingView' });
    const botBtn = U.h('button', { class: 'btn sm', text: 'Analyse with the bot' });
    const copyBtn = U.h('button', { class: 'btn sm ghost', text: 'Copy link' });
    const retryBtn = U.h('button', { class: 'btn xs ghost', text: 'Reload chart' });
    const host = U.h('div', { class: 'tv-host' });
    [symInput, dl, seg, styleSel, sizeSeg, fullBtn, open, botBtn, copyBtn, retryBtn].forEach((n) => bar.appendChild(n));
    card.appendChild(bar);

    /* ---- row 2: indicators (TradingView studies, applied to the embed) --- */
    const studyRow = U.h('div', { class: 'row wrap gap-8 tv-studies' });
    studyRow.appendChild(U.h('span', { class: 'tiny muted', text: 'Indicators' }));
    const studyBtns = [];
    (global.TV.STUDIES || []).forEach(([id, label]) => {
      const b = U.h('button', { class: 'btn xs ' + (studies.includes(id) ? 'primary' : 'ghost'), text: label, title: 'Add ' + label + ' to the TradingView chart' });
      b.addEventListener('click', () => {
        const i = studies.indexOf(id);
        if (i >= 0) studies.splice(i, 1); else studies.push(id);
        b.className = 'btn xs ' + (studies.includes(id) ? 'primary' : 'ghost');
        lsSet('tj_tv_studies', JSON.stringify(studies));
        paint();
      });
      studyBtns.push(b);
      studyRow.appendChild(b);
    });
    card.appendChild(studyRow);

    card.appendChild(host);
    card.appendChild(U.h('div', { class: 'tiny muted', style: 'margin-top:8px', text: 'Reading the chart on TradingView is free. The bots read the same market from the same candles and grade it here — tradingview.com never sees your journal.' }));

    const paint = () => {
      lsSet('tj_tv_symbol', symbol); lsSet('tj_tv_tf', tf); lsSet('tj_tv_style', style); lsSet('tj_tv_h', String(height));
      if (symInput.value !== symbol) symInput.value = symbol;
      open.href = global.TV.link(symbol, tf);
      U.$$('.tv-tf .btn', seg).forEach((b) => { b.className = 'btn xs ' + (b.dataset.tf === tf ? 'primary' : 'ghost'); });
      U.$$('.tv-size .btn', sizeSeg).forEach((b) => { b.className = 'btn xs ' + (Number(b.dataset.h) === height && !full ? 'primary' : 'ghost'); });
      fullBtn.classList.toggle('primary', full);
      card.classList.toggle('tv-fullscreen', full);
      host.style.height = (full ? Math.max(520, (global.innerHeight || 900) - 190) : height) + 'px';
      host.__tvKey = null;
      global.TV.widget(host, { symbol, tf, style, studies: studies.slice(), sideToolbar: true });
    };

    symInput.addEventListener('change', () => { const v = symInput.value.trim().toUpperCase(); if (v) { symbol = v; paint(); } });
    seg.addEventListener('click', (e) => { const b = e.target.closest('[data-tf]'); if (b) { tf = b.dataset.tf; paint(); } });
    sizeSeg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-h]'); if (!b) return;
      height = Number(b.dataset.h) || 0;
      if (height === 0) { full = true; } else { full = false; }
      paint();
    });
    styleSel.addEventListener('change', () => { style = styleSel.value; paint(); });
    fullBtn.addEventListener('click', () => { full = !full; paint(); });
    retryBtn.addEventListener('click', () => { global.TV.reset(); paint(); });
    copyBtn.addEventListener('click', () => global.TV.copy(global.TV.link(symbol, tf), 'Chart link'));
    botBtn.addEventListener('click', () => { global.__botRequest = { symbol, tf }; global.App.go('bots'); });
    const onKey = (e) => { if (e.key === 'Escape' && full) { full = false; paint(); } };
    global.addEventListener('keydown', onKey);
    paint();
    return card;
  }

  Views.market = {
    title: 'Market',
    async render(root) {
      // The chart panel and the watchlist do not depend on the quote service, so
      // they are painted FIRST. This used to wait for /market/overview before
      // drawing anything, which left a bare skeleton for as long as the external
      // provider was slow (measured: >30 s when the provider rate-limits).
      root.innerHTML = '';
      root.appendChild(tvPanel());
      const body = U.h('div');
      root.appendChild(body);
      const pending = U.h('div', { class: 'card', html: '<div class="empty">Loading quotes, calendar and news…</div>' });
      body.appendChild(pending);

      const [ov, wl] = await Promise.all([
        API.get('/market/overview').catch(() => null),
        API.get('/watchlist').catch(() => ({ watchlist: [] })),
      ]);
      if (!ov) {
        pending.remove();
        body.appendChild(U.h('div', { class: 'card', html: '<div class="empty">Could not reach the market data service. Your journal works offline — market context needs an internet connection.</div>' }));
        return root;
      }
      pending.remove();
      root = body;                       // everything below fills the body in place

      /* ------------------------------------------------------ quote strip */
      const quotes = ov.quotes && ov.quotes.quotes ? ov.quotes.quotes : {};
      const fg = ov.fear_greed && ov.fear_greed.ok ? ov.fear_greed.current : null;
      const strip = U.h('div', { class: 'grid g6' });
      const keys = Object.keys(quotes).slice(0, 5);
      keys.forEach((sym) => {
        const q = quotes[sym];
        const chg = q.change_pct;
        strip.appendChild(U.h('div', { class: 'kpi' },
          U.h('div', { class: 'k-label', text: sym }),
          U.h('div', { class: 'k-value', style: 'font-size:1.1rem', text: U.price(q.price) }),
          U.h('div', { class: 'k-sub ' + (chg === null ? 'muted' : U.cls(chg)), text: chg === null ? U.esc(q.source || '') : `${U.signed(chg, 2)}% today` })));
      });
      if (fg) {
        strip.appendChild(U.h('div', { class: 'kpi' },
          U.h('div', { class: 'k-label', text: 'Crypto fear & greed' }),
          U.h('div', { class: 'k-value', style: 'font-size:1.1rem', text: String(fg.value) }),
          U.h('div', { class: 'k-sub', text: fg.label })));
      }
      root.appendChild(strip);
      if (ov.quotes && ov.quotes.errors && ov.quotes.errors.length) {
        root.appendChild(U.h('div', { class: 'tiny muted', style: 'margin-top:6px', text: 'Some quotes unavailable: ' + ov.quotes.errors.join(' · ') }));
      }

      const cols = U.h('div', { class: 'grid g-2-1', style: 'margin-top:14px' });
      const left = U.h('div', { class: 'grid', style: 'align-content:start' });

      /* ------------------------------------------------------- calendar */
      const calCard = U.h('div', { class: 'card' });
      const events = (ov.calendar && ov.calendar.events) || [];
      const days = {};
      events.forEach((e) => { const k = e.date_str || e.date.slice(0, 10); (days[k] = days[k] || []).push(e); });
      calCard.innerHTML = `<div class="card-head"><h3>Economic calendar</h3><span class="spacer"></span>
          <select id="cal-impact" style="width:auto"><option value="all">All impacts</option><option value="high">High only</option><option value="medium">Medium+</option></select>
          <span class="tiny muted">${ov.calendar && ov.calendar.ok ? 'live' : 'unavailable'} · times in ${U.esc(Store.user.settings.timezone || 'your timezone')}</span></div>
        <div id="cal-body">${Object.keys(days).length ? Object.keys(days).sort().map((d) => `
          <div class="row" style="margin:12px 0 4px"><b class="small">${U.esc(days[d][0].day_label || d)}</b><span class="tiny muted" style="margin-left:8px">${days[d].length} events</span></div>
          ${days[d].map((e) => `<div class="cal-event" data-impact="${e.impact}">
            <span class="mono tiny">${U.esc(e.time_label)}</span>
            <span class="impact-dot impact-${U.esc(e.impact)}">${U.esc(e.impact.slice(0, 3))}</span>
            <span>${U.esc(e.title)} <span class="muted tiny">· ${U.esc(e.currency)}</span></span>
            <span class="tiny mono muted">${e.actual ? '<b class="' + (e.actual && e.forecast ? (parseFloat(e.actual) >= parseFloat(e.forecast) ? 'pos' : 'neg') : '') + '">' + U.esc(e.actual) + '</b>' : ''} ${e.forecast ? 'f/c ' + U.esc(e.forecast) : ''} ${e.previous ? 'p: ' + U.esc(e.previous) : ''}</span>
          </div>`).join('')}`).join('') : '<div class="empty">No events available.</div>'}</div>`;
      left.appendChild(calCard);

      /* ----------------------------------------------------------- news */
      const newsCard = U.h('div', { class: 'card' });
      const items = (ov.news && ov.news.items) || [];
      newsCard.innerHTML = `<div class="card-head"><h3>Headlines</h3><span class="spacer"></span>
          <select id="news-cat" style="width:auto"><option value="all">All categories</option><option>Forex</option><option>Markets</option><option>Stocks</option><option>Crypto</option></select>
          <label class="tiny muted row" style="gap:5px"><input type="checkbox" id="news-relevant" /> only my instruments</label></div>
        <div id="news-body">${items.length ? items.map((n) => `<div class="news-item" data-cat="${U.esc(n.category)}">
          <a href="${U.esc(n.link)}" target="_blank" rel="noopener">${U.esc(n.title)}</a>
          <div class="news-meta"><span class="chip">${U.esc(n.source)}</span><span>${U.esc(n.category)}</span><span>${U.ago(n.published)}</span>${n.relevant ? '<span class="chip pos">your market</span>' : ''}</div>
          ${n.description ? `<div class="small muted-2" style="margin-top:4px">${U.esc(n.description).slice(0, 180)}…</div>` : ''}
        </div>`).join('') : '<div class="empty">No headlines available — check your internet connection.</div>'}</div>`;
      left.appendChild(newsCard);
      cols.appendChild(left);

      /* ------------------------------------------------------- watchlist */
      const side = U.h('div', { class: 'grid', style: 'align-content:start' });
      const wlCard = U.h('div', { class: 'card' });
      const wlItems = wl.watchlist || [];
      wlCard.innerHTML = `<div class="card-head"><h3>Watchlist & thesis</h3></div>
        ${wlItems.length ? wlItems.map((w) => {
          const q = quotes[w.symbol];
          return `<div class="news-item">
            <div class="row-between"><div><b>${U.esc(w.symbol)}</b> <span class="chip ${w.bias === 'bullish' ? 'pos' : w.bias === 'bearish' ? 'neg' : ''}">${U.esc(w.bias)}</span></div>
            <div class="row" style="gap:8px">${q ? `<span class="mono tiny">${U.price(q.price)} <span class="${U.cls(q.change_pct)}">${q.change_pct === null ? '' : U.signed(q.change_pct, 2) + '%'}</span></span>` : ''}
              <button class="btn xs ghost danger" data-wdel="${w.id}">×</button></div></div>
            ${w.key_level ? `<div class="tiny muted">Levels: ${U.esc(w.key_level)}</div>` : ''}
            ${w.thesis ? `<div class="small muted-2" style="margin-top:3px">${U.esc(w.thesis)}</div>` : ''}
            <button class="btn xs ghost" data-wlog="${U.esc(w.symbol)}" style="margin-top:6px">Log a trade</button>
          </div>`;
        }).join('') : '<div class="empty">Nothing on the watchlist yet.</div>'}
        <div class="sep"></div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr">
          <input id="w-symbol" placeholder="Symbol" />
          <select id="w-bias"><option value="neutral">Neutral</option><option value="bullish">Bullish</option><option value="bearish">Bearish</option></select>
        </div>
        <input id="w-level" placeholder="Key levels" style="margin-top:8px" />
        <textarea id="w-thesis" placeholder="What are you waiting for before you take it?" style="margin-top:8px"></textarea>
        <button class="btn sm block primary" id="w-add" style="margin-top:8px">Add to watchlist</button>`;
      side.appendChild(wlCard);

      const sent = U.h('div', { class: 'card' });
      sent.innerHTML = `<div class="card-head"><h3>Sentiment</h3></div>
        <div class="row" style="gap:14px">${fg ? U.gauge(fg.value, { label: fg.label, size: 96, color: fg.value > 60 ? 'var(--green)' : fg.value < 40 ? 'var(--red)' : 'var(--amber)' }) : '<div class="muted small">Sentiment unavailable.</div>'}
        <div class="small muted-2">${fg ? `Crypto market sentiment is <b>${U.esc(fg.label)}</b> at ${fg.value}/100. Extreme readings often precede reversals — useful context, never a signal on its own.` : ''}</div></div>`;
      if (ov.fear_greed && ov.fear_greed.history && ov.fear_greed.history.length > 2) {
        sent.innerHTML += `<div style="margin-top:10px">${U.sparkline(ov.fear_greed.history.map((h) => h.value), { color: 'var(--purple)', height: 40, width: 240 })}</div><div class="tiny muted">Last ${ov.fear_greed.history.length} days</div>`;
      }
      side.appendChild(sent);

      const feeds = U.h('div', { class: 'card' });
      feeds.innerHTML = `<div class="card-head"><h3>Sources</h3></div><div class="kv">${((ov.news && ov.news.feeds) || []).map((f) => `<div class="k">${U.esc(f.feed)}</div><div class="v ${f.ok ? 'pos' : 'neg'}">${f.ok ? f.count + ' items' : 'offline'}</div>`).join('')}</div>
        <div class="tiny muted" style="margin-top:8px">Everything is fetched server-side and cached (news 10 min, calendar 15 min, quotes 1 min).</div>`;
      side.appendChild(feeds);
      cols.appendChild(side);
      root.appendChild(cols);

      /* --------------------------------------------------------- wiring */
      const calSel = U.$('#cal-impact', calCard);
      calSel.addEventListener('change', () => {
        U.$$('.cal-event', calCard).forEach((el) => {
          const imp = el.dataset.impact;
          el.style.display = calSel.value === 'all' ? '' : (calSel.value === 'high' ? (imp === 'high' ? '' : 'none') : (imp === 'high' || imp === 'medium' ? '' : 'none'));
        });
      });
      const newsSel = U.$('#news-cat', newsCard);
      const relChk = U.$('#news-relevant', newsCard);
      const filterNews = () => {
        U.$$('.news-item', newsCard).forEach((el, i) => {
          const n = items[i]; if (!n) return;
          const catOk = newsSel.value === 'all' || n.category === newsSel.value;
          const relOk = !relChk.checked || n.relevant;
          el.style.display = catOk && relOk ? '' : 'none';
        });
      };
      newsSel.addEventListener('change', filterNews); relChk.addEventListener('change', filterNews);

      wlCard.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.wdel) { await API.del('/watchlist/' + b.dataset.wdel); global.App.refresh(); }
        if (b.dataset.wlog) global.App.openTrade(null, { symbol: b.dataset.wlog, status: 'open' });
      });
      U.$('#w-add', wlCard).addEventListener('click', async () => {
        const sym = U.$('#w-symbol', wlCard).value.trim().toUpperCase();
        if (!sym) return global.App.toast('Enter a symbol', 'err');
        await API.post('/watchlist', {
          symbol: sym, asset_class: (Store.instrumentBy(sym) || {}).asset_class,
          bias: U.$('#w-bias', wlCard).value, key_level: U.$('#w-level', wlCard).value, thesis: U.$('#w-thesis', wlCard).value,
        });
        global.App.toast('Added to watchlist', 'ok'); global.App.refresh();
      });
      return root;
    },
  };
})(window);
