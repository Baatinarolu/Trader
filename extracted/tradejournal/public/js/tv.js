/* tv.js — TradingView integration (client side)
 *
 * The official embed widgets are loaded from s3.tradingview.com. That is fine in a
 * real browser but the sandboxed in-app preview has no network, so every widget
 * degrades into a useful fallback card: the TradingView deep link, the symbol /
 * interval we were about to open, and (when the caller passes one) our own chart
 * summary. Nothing here ever throws — the journal must keep working offline.
 */
(function (global) {
  'use strict';

  /** Everything the chart panel lets a trader configure, in one place. */
  const CHART_STYLES = [
    ['1', 'Candles'], ['0', 'Bars'], ['9', 'Hollow candles'], ['8', 'Heikin Ashi'], ['2', 'Line'], ['3', 'Area'], ['10', 'Baseline'], ['5', 'Columns'],
  ];
  const STUDIES = [
    ['', 'Volume'],
    ['MASimple@tv-basicstudies', 'EMA (built-in)'],
    ['STD;VWAP', 'VWAP'],
    ['STD;Bollinger_Bands', 'Bollinger Bands'],
    ['STD;Ichimoku%1Cloud', 'Ichimoku Cloud'],
    ['STD;Supertrend', 'Supertrend'],
    ['STD;Pivot%1Points%1Standard', 'Pivot points'],
    ['STD;RSI', 'RSI'],
    ['STD;MACD', 'MACD'],
    ['STD;Stochastic%1RSI', 'Stoch RSI'],
    ['STD;ATR', 'ATR'],
    ['STD;Session%1Volume%1HD', 'Session volume'],
  ];

  /** Our timeframes → TradingView intervals. */
  const TF = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '45m': '45', '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1d': 'D', '3d': '3D', '1w': 'W', '1M': 'M' };

  /** Compact fallback map (the server sends `tv_symbol` on every instrument; this covers fresh/unknown ones). */
  const MAP = {
    EURUSD: 'FX:EURUSD', GBPUSD: 'FX:GBPUSD', USDJPY: 'FX:USDJPY', AUDUSD: 'FX:AUDUSD',
    USDCAD: 'FX:USDCAD', USDCHF: 'FX:USDCHF', NZDUSD: 'FX:NZDUSD', EURJPY: 'FX:EURJPY',
    GBPJPY: 'FX:GBPJPY', EURGBP: 'FX:EURGBP',
    XAUUSD: 'OANDA:XAUUSD', XAGUSD: 'OANDA:XAGUSD', USOIL: 'TVC:USOIL', UKOIL: 'TVC:UKOIL', NATGAS: 'TVC:NATURALGAS',
    NAS100: 'NASDAQ:NDX', SPX500: 'SP:SPX', US30: 'DJ:DJI', GER40: 'XETR:DAX', UK100: 'TVC:UKX', JP225: 'TVC:NI225', HK50: 'TVC:HSI',
    ES: 'CME_MINI:ES1!', NQ: 'CME_MINI:NQ1!', YM: 'CBOT_MINI:YM1!', RTY: 'CME_MINI:RTY1!',
    GC: 'COMEX:GC1!', SI: 'COMEX:SI1!', CL: 'NYMEX:CL1!', NG: 'NYMEX:NG1!', ZB: 'CBOT:ZB1!', ZN: 'CBOT:ZN1!',
    BTCUSDT: 'BINANCE:BTCUSDT', ETHUSDT: 'BINANCE:ETHUSDT', SOLUSDT: 'BINANCE:SOLUSDT', XRPUSDT: 'BINANCE:XRPUSDT',
    AAPL: 'NASDAQ:AAPL', MSFT: 'NASDAQ:MSFT', NVDA: 'NASDAQ:NVDA', TSLA: 'NASDAQ:TSLA', AMZN: 'NASDAQ:AMZN', META: 'NASDAQ:META', GOOGL: 'NASDAQ:GOOGL',
    SPY: 'AMEX:SPY', QQQ: 'NASDAQ:QQQ', GLD: 'AMEX:GLD',
  };

  const EMBED = 'https://s3.tradingview.com/external-embedding/embed-widget-';
  const DOWNLOAD_TIMEOUT = 2600;

  const TV = {
    TF, CHART_STYLES, STUDIES,
    /* availability: null = untested, true = widgets load here, false = blocked/offline */
    ok: null,
    lastError: null,
    _inflight: 0,

    /** Our symbol → TradingView ticker. Prefers whatever the server told us. */
    symbol(sym) {
      const s = String(sym || '').toUpperCase().trim();
      if (!s) return '';
      try {
        const inst = global.Store && Store.instrumentBy ? Store.instrumentBy(s) : null;
        if (inst && inst.tv_symbol) return inst.tv_symbol;
      } catch { /* store not loaded yet */ }
      return MAP[s] || s;
    },

    interval(tf) { return TF[String(tf || '15m')] || '15'; },

    /** Deep links that work with no scripts at all. */
    link(sym, tf) {
      const q = new URLSearchParams({ symbol: this.symbol(sym), interval: this.interval(tf) });
      return 'https://www.tradingview.com/chart/?' + q.toString();
    },
    symbolPage(sym) {
      return 'https://www.tradingview.com/symbols/' + encodeURIComponent(this.symbol(sym).replace(':', '-')) + '/';
    },

    /** "OANDA:XAUUSD · 15m" — the string you paste into a TradingView alert. */
    label(sym, tf) { return `${this.symbol(sym)} · ${tf || '15m'}`; },

    /**
     * Copy-to-clipboard with two fallbacks (clipboard API → execCommand → modal).
     * Sandboxed iframes often block the clipboard, so never assume it worked.
     */
    async copy(text, label) {
      const done = () => { if (global.App && App.toast) App.toast((label || 'Copied') + ' — clipboard', 'ok'); };
      try {
        if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text); done(); return true;
        }
      } catch { /* fall through */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.top = '-1000px';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) { done(); return true; }
      } catch { /* fall through */ }
      if (global.App && App.modal) {
        const box = U.h('textarea', { rows: 6, style: 'width:100%;font-family:var(--mono);font-size:12px' });
        box.value = text;
        App.modal({
          title: label || 'Copy this',
          body: U.h('div', {}, U.h('div', { class: 'tiny muted', style: 'margin-bottom:6px', text: 'Copy blocked by the browser — select all and copy manually.' }), box),
          actions: [{ label: 'Close', kind: 'ghost', onClick: (close) => close() }],
        });
        setTimeout(() => { box.focus(); box.select(); }, 60);
      }
      return false;
    },

    /** The message to paste into a TradingView alert so our webhook understands it. */
    alertTemplate(json) {
      return json
        ? '{"symbol":"{{ticker}}","action":"{{strategy.order.action}}","price":"{{close}}","tf":"{{interval}}","time":"{{timenow}}"}'
        : 'BUY {{ticker}} @ {{close}} {{interval}}';
    },

    /** A plan (from /bots/analyse) as a copyable one-liner. */
    planText(symbol, tf, plan) {
      if (!plan) return '';
      const lv = plan.levels || plan;
      const targets = (lv.targets || []).map((t) => `${t.label || t.role || 'T'} ${Number(t.price).toFixed(4)}`).join(' → ');
      return `${plan.action} ${symbol} ${tf} | entry ${lv.entry != null ? Number(lv.entry).toFixed(4) : '—'} | stop ${lv.stop != null ? Number(lv.stop).toFixed(4) : '—'} | ${targets}${lv.rr_final ? ' | ' + Number(lv.rr_final).toFixed(2) + 'R' : ''}`;
    },

    /**
     * Embed an official TradingView widget.
     * host: element, opts: { kind:'advanced'|'mini'|'tape', symbol, tf, height, studies, config }
     */
    widget(host, opts = {}) {
      if (!host) return null;
      if (this.ok === false) return this.fallback(host, opts);          // already known-blocked: no second attempt
      const kind = opts.kind || 'advanced';
      const key = kind + '|' + (opts.symbol || '') + '|' + (opts.tf || '') + '|'
        + (opts.style || '1') + '|' + ((opts.studies || []).join(',')) + '|' + (opts.sideToolbar === false ? 'plain' : 'tools');
      if (host.__tvKey === key) return host.__tvWidget;                 // idempotent re-render
      host.__tvKey = key;
      host.innerHTML = '';

      const cfg = opts.config || (kind === 'mini'
        ? { symbol: this.symbol(opts.symbol), width: '100%', height: opts.height || 190, locale: 'en', dateRange: '1M', colorTheme: 'dark', isTransparent: true, autosize: false }
        : kind === 'tape'
          ? { symbols: (opts.symbols || ['FX:EURUSD', 'OANDA:XAUUSD', 'BINANCE:BTCUSDT', 'SP:SPX']).map((s) => ({ proName: s.includes(':') ? s : this.symbol(s), title: s.split(':').pop() })), showSymbolLogo: true, isTransparent: true, displayMode: 'adaptive', colorTheme: 'dark', locale: 'en' }
          : {
            autosize: true, symbol: this.symbol(opts.symbol), interval: this.interval(opts.tf),
            timezone: 'Etc/UTC', theme: 'dark', style: String(opts.style || '1'), locale: 'en',
            backgroundColor: 'rgba(11, 15, 23, 1)', gridColor: 'rgba(255,255,255,0.05)',
            // the side toolbar is TradingView's own drawing toolbar: leave it on
            // unless a caller explicitly asks for the compact chart
            hide_side_toolbar: opts.sideToolbar === false ? false : !!opts.compact,
            hide_top_toolbar: !!opts.minimal,
            allow_symbol_change: opts.allowSymbolChange !== false, save_image: false,
            withdateranges: true, details: false, hotlist: false, calendar: false,
            studies: opts.studies || [], support_host: 'https://www.tradingview.com',
          });

      const wrap = document.createElement('div');
      wrap.className = 'tradingview-widget-container';
      wrap.style.cssText = 'height:100%;width:100%;position:relative';
      const inner = document.createElement('div');
      inner.className = 'tradingview-widget-container__widget';
      inner.style.cssText = 'height:100%;width:100%';
      wrap.appendChild(inner);
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = EMBED + (kind === 'mini' ? 'mini-symbol-overview.js' : kind === 'tape' ? 'ticker-tape.js' : 'advanced-chart.js');
      script.textContent = JSON.stringify(cfg);
      wrap.appendChild(script);
      host.appendChild(wrap);

      const self = this;
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; self._fail(host, opts, 'TradingView did not load (no network, blocked script or ad-blocker).'); } }, DOWNLOAD_TIMEOUT);
      script.addEventListener('error', () => { if (!settled) { settled = true; clearTimeout(timer); self._fail(host, opts, 'Could not fetch the TradingView widget script.'); } });
      const iv = setInterval(() => {
        if (settled) return clearInterval(iv);
        if (inner.querySelector('iframe') || host.querySelector('iframe')) { settled = true; clearInterval(iv); clearTimeout(timer); self.ok = true; }
      }, 400);

      host.__tvWidget = wrap;
      return wrap;
    },

    /** A widget failed: remember it and paint something useful instead. */
    _fail(host, opts, reason) {
      this.ok = false;
      this.lastError = reason;
      this.fallback(host, opts, reason);
    },

    /** Offline / blocked fallback: link + context. Never an empty box. */
    fallback(host, opts = {}, reason) {
      if (!host) return null;
      const sym = opts.symbol || '';
      const tf = opts.tf || '15m';
      host.innerHTML = '';
      const card = U.h('div', { class: 'tv-fallback' });
      card.innerHTML = `
        <div class="tv-fb-head">
          <span class="chip info">${U.esc(this.symbol(sym) || 'TradingView')}</span>
          <span class="chip">${U.esc(tf)}</span>
          <span class="tiny muted">${U.esc(reason || 'Chart widgets are unavailable without an internet connection.')}</span>
        </div>
        <div class="tv-fb-body">
          <div class="tv-fb-msg">TradingView's chart runs from their servers, so it can't load inside the offline preview. The journal, the bots and every calculation keep working.</div>
          <div class="row gap-8">
            <a class="btn sm primary" href="${U.esc(this.link(sym, tf))}" target="_blank" rel="noopener">Open ${U.esc(sym || 'chart')} on TradingView</a>
            ${opts.onRetry ? '<button class="btn sm ghost" data-tv-retry>Try again</button>' : ''}
            <button class="btn sm ghost" data-tv-copy>Copy link</button>
          </div>
        </div>`;
      host.appendChild(card);
      const retry = card.querySelector('[data-tv-retry]');
      if (retry) retry.addEventListener('click', () => { this.ok = null; host.__tvKey = null; this.widget(host, opts.onRetry && opts.onRetry()); });
      const cp = card.querySelector('[data-tv-copy]');
      if (cp) cp.addEventListener('click', () => this.copy(this.link(sym, tf), 'Chart link'));
      return card;
    },

    /** Reset the cached availability (used by the "Try again" buttons). */
    reset() { this.ok = null; this.lastError = null; },
  };

  global.TV = TV;
})(window);
