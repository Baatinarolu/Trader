/* app.js — shell, router, auth gate, modals, toasts, global actions */
(function (global) {
  'use strict';
  /**
   * Line icons, drawn inline as SVG. The app deliberately carries no icon font,
   * no emoji and no glyph characters in its chrome: text glyphs render
   * differently on every platform and make a trading terminal look like a toy.
   */
  const SVG = (body, size) => `<svg width="${size || 17}" height="${size || 17}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICO = {
    dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    bots: '<path d="M3.5 20.5V3.5"/><path d="M3.5 20.5h17"/><path d="M7 16.5l3.8-4.6 3 2.8L20 7.5"/>',
    coach: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9.5 4.5V3h5v1.5"/><path d="M9 12.5l2 2 4-4"/>',
    market: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.4 2.5 14.1 0 17c-2.5-2.9-2.5-14.6 0-17z"/>',
    trades: '<path d="M4 6.5h16M4 12h16M4 17.5h9"/>',
    journal: '<path d="M5 4.5h11.5L20 8v11.5H5z"/><path d="M9 9.5h7M9 13h7M9 16.5h4"/>',
    calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M8 3.5v4M16 3.5v4M3.5 10.5h17"/>',
    analytics: '<path d="M5 20V10.5M12 20V4.5M19 20v-6.5"/>',
    playbook: '<path d="M4.5 6a2 2 0 012-2H19.5v16H6.5a2 2 0 01-2-2z"/><path d="M8.5 4v16"/>',
    risk: '<path d="M12 3.5l7.5 3.6v5.4c0 4.7-3.2 7.6-7.5 8.5c-4.3-.9-7.5-3.8-7.5-8.5V7.1z"/><path d="M9 12.5l2 2 4-4.5"/>',
    settings: '<path d="M4 7.5h8M17 7.5h3M4 16.5h3M12 16.5h8"/><circle cx="14.5" cy="7.5" r="2.2"/><circle cx="9.5" cy="16.5" r="2.2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };

  const NAV = [
    { section: 'Operate', items: [['dashboard', 'Dashboard', SVG(ICO.dashboard)], ['bots', 'Bots', SVG(ICO.bots)], ['coach', 'Coach', SVG(ICO.coach)], ['market', 'Market', SVG(ICO.market)]] },
    { section: 'Record', items: [['trades', 'Trade log', SVG(ICO.trades)], ['journal', 'Journal', SVG(ICO.journal)], ['calendar', 'Calendar', SVG(ICO.calendar)]] },
    { section: 'Improve', items: [['analytics', 'Analytics', SVG(ICO.analytics)], ['playbook', 'Playbook', SVG(ICO.playbook)], ['risk', 'Risk tools', SVG(ICO.risk)]] },
    { section: 'System', items: [['settings', 'Settings & data', SVG(ICO.settings)]] },
  ];

  const App = global.App = {
    route: 'dashboard',
    modalStack: [],
    _renderToken: 0,

    async boot() {
      if (this._booted) return;          // the script tag can fire boot twice
      this._booted = true;
      try {
        const me = await API.me();
        // No sign-in wall: if this browser has no session yet we just connect it to
        // a workspace (the one on this machine, or a fresh private one when hosted).
        if (!me.authenticated) await API.local();
        await Store.load(true);
        API.setWorkspaceName(Store.user && Store.user.name);
        this.shell();
        // First paint: set the route AND render it. (A silent go() here left the
        // content area empty until the first nav click — found by the real-browser
        // test, invisible to the jsdom smoke test because that calls views directly.)
        const hash = (location.hash || '').replace(/^#\/?/, '');
        const target = NAV.flatMap((s) => s.items).some(([id]) => id === hash) ? hash : 'dashboard';
        this.route = target;
        if (location.hash !== '#/' + target) location.hash = '#/' + target;
        await this.refresh();
      } catch (e) {
        this.offlineScreen(e);
      }
    },

    /**
     * Workspaces instead of logins. `switchWorkspace('fresh')` opens a brand-new
     * empty workspace and parks the current one; `switchWorkspace('back')` swaps
     * back. Both are one click, no credentials, and the losing side stays in the
     * database untouched.
     */
    async switchWorkspace(mode) {
      try {
        if (mode === 'fresh') {
          API.stashWorkspace();
          await API.local(true);
          API.setWorkspaceName('empty workspace');
        } else {
          const prev = API.previousWorkspace();
          if (!prev) return this.toast('This browser has no other workspace stored', 'warn');
          API.stashWorkspace(API.workspaceName());     // park the one we are leaving first
          await API.openWorkspace(prev.token);
          API.setWorkspaceName(prev.name);
        }
        await Store.reloadAll();
        this.shell();
        this.go('dashboard');            // switching workspaces must repaint, not go silent
        this.toast(mode === 'fresh' ? 'Fresh, empty workspace ready' : 'Back in ' + API.workspaceName(), 'ok');
      } catch (e) { this.toast(e.message, 'err'); }
    },

    /** Only reached when the API itself is unreachable — there is no login screen. */
    offlineScreen(err) {
      const app = U.$('#app');
      U.clear(app).className = '';
      const box = U.h('div', { class: 'offline-card' });
      box.appendChild(U.h('div', { class: 'offline-title', text: 'SERVER UNREACHABLE' }));
      box.appendChild(U.h('div', { class: 'offline-code', text: (err && err.message) || 'Unknown error' }));
      box.appendChild(U.h('div', { class: 'offline-hint', text: 'The app could not reach its own backend. Start it with "npm start", or check that the database file is writable, then retry.' }));
      box.appendChild(U.h('button', { class: 'btn sm', text: 'Retry', onclick: () => location.reload() }));
      app.appendChild(U.h('div', { class: 'offline-wrap' }, box));
    },

    /* --------------------------------------------------------------- shell */
    shell() {
      const app = U.$('#app');
      U.clear(app).className = '';
      const shell = U.h('div', { class: 'shell' });
      const side = U.h('aside', { class: 'sidebar', id: 'sidebar' });
      const account = Store.account();
      side.innerHTML = `
        <div class="brand"><span class="dot"></span><b>TradeJournal<span>Pro</span></b></div>
        ${NAV.map((s) => `<div class="nav-label">${s.section}</div>${s.items.map(([id, label, ico]) =>
          `<button class="nav-item" data-route="${id}"><span class="ico">${ico}</span>${label}</button>`).join('')}`).join('')}
        <div class="sidebar-foot">
          <button class="btn primary block sm" id="side-new" style="margin-bottom:8px">+ Log a trade <span class="tiny muted" style="margin-left:auto">n</span></button>
          <div class="kv tiny" style="padding:0 8px 8px">
            <div class="k">Equity</div><div class="v" id="side-equity">—</div>
            <div class="k">This month</div><div class="v" id="side-month">—</div>
          </div>
          <div class="build-tag" id="build-tag"></div>
          <div class="user-chip" id="user-chip">
            <div class="avatar">${U.esc((Store.user.name || Store.user.email || 'T').slice(0, 1).toUpperCase())}</div>
            <div style="min-width:0"><div class="tiny" style="overflow:hidden;text-overflow:ellipsis">${U.esc(Store.user.name || 'Trader')}</div><small>${U.esc(Store.user.email)}</small></div>
          </div>
        </div>`;
      shell.appendChild(side);

      const main = U.h('div', { class: 'main' });
      const top = U.h('header', { class: 'topbar' });
      top.innerHTML = `
        <button class="hamburger" id="ham" aria-label="Menu">${SVG(ICO.menu, 18)}</button>
        <h1 id="page-title">Dashboard</h1>
        <span class="chip" id="filter-chip" hidden></span>
        <span class="spacer"></span>
        <div class="sessions" id="clocks"></div>
        <select id="account-switch" style="width:auto">${Store.accounts.map((a) => `<option value="${a.id}" ${a.id === Store.accountId ? 'selected' : ''}>${U.esc(a.name)}</option>`).join('')}</select>
        <select id="range-switch" style="width:auto">
          ${[['30d', 'Last 30 days'], ['7d', 'Last 7 days'], ['90d', 'Last 90 days'], ['mtd', 'Month to date'], ['ytd', 'Year to date'], ['all', 'All time'], ['custom', 'Custom range…']].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}
        </select>
        <button class="btn sm" id="top-new">+ Trade</button>`;
      main.appendChild(top);
      const content = U.h('main', { class: 'content', id: 'content' });
      main.appendChild(content);
      shell.appendChild(main);
      app.appendChild(shell);

      U.$('#side-new', side).addEventListener('click', () => this.openTrade(null));
      U.$('#top-new', top).addEventListener('click', () => this.openTrade(null));
      U.$('#user-chip', side).addEventListener('click', () => this.go('settings'));
      const buildEl = U.$('#build-tag', side);
      if (buildEl) {
        const raw = String(window.__BUILD__ || '');
        const stamp = /^[0-9a-z]{4,}$/i.test(raw) ? raw : '';
        if (stamp) buildEl.textContent = 'build ' + stamp + ' · UI v2';
      }
      U.$('#account-switch', top).addEventListener('change', (e) => { Store.setAccount(e.target.value); Store.invalidate(); this.refresh(); });
      U.$('#range-switch', top).addEventListener('change', (e) => {
        const v = e.target.value;
        if (v === 'custom') {
          const from = prompt('From date (YYYY-MM-DD)', Store.filters.from || Store.isoDaysAgo(30));
          const to = prompt('To date (YYYY-MM-DD)', Store.filters.to || Store.isoToday());
          if (from && to) { Store.filters.from = from; Store.filters.to = to; }
        } else { const p = Store.presets[v](); Store.filters.from = p.from; Store.filters.to = p.to; }
        Store.invalidate(); this.refresh();
      });
      U.$('#ham', top).addEventListener('click', () => side.classList.toggle('open'));
      U.$$('.nav-item', side).forEach((b) => b.addEventListener('click', () => { this.go(b.dataset.route); side.classList.remove('open'); }));

      this.tickClocks();
      if (this._clockTimer) clearInterval(this._clockTimer);
      this._clockTimer = setInterval(() => this.tickClocks(), 30000);
      this.updateSidebarStats();
    },

    tickClocks() {
      const el = U.$('#clocks'); if (!el) return;
      const tz = (Store.user.settings || {}).timezone || 'Africa/Lagos';
      const zones = [['London', 'Europe/London', 7, 16], ['New York', 'America/New_York', 12, 21], ['Tokyo', 'Asia/Tokyo', 0, 9], ['Sydney', 'Australia/Sydney', 21, 6]];
      const nowUTC = new Date();
      const uh = nowUTC.getUTCHours() + nowUTC.getUTCMinutes() / 60;
      el.innerHTML = zones.map(([name, zone, s, e]) => {
        const open = s < e ? (uh >= s && uh < e) : (uh >= s || uh < e);
        let time = '';
        try { time = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(nowUTC); } catch { time = '--:--'; }
        return `<span class="session-clock ${open ? 'open' : ''}" title="${name} session ${open ? 'open' : 'closed'}"><i></i>${name.slice(0, 3).toUpperCase()} ${time}</span>`;
      }).join('') + `<span class="session-clock" title="Your journal timezone: ${U.esc(tz)}">${U.esc(tz.split('/')[1] || tz)}</span>`;
    },

    async updateSidebarStats() {
      try {
        const an = await Store.fetch('/analytics', Store.queryParams(), 20000);
        const eq = (an.account ? an.account.starting_balance : 10000) + an.kpis.net_pnl;
        const mEl = U.$('#side-equity'); if (mEl) { mEl.textContent = U.money(eq); mEl.className = 'v ' + U.cls(an.kpis.net_pnl); }
        const month = Object.values(an.monthly).pop();
        const mo = U.$('#side-month'); if (mo) { mo.textContent = month ? U.moneySign(month.pnl) : '—'; mo.className = 'v ' + U.cls(month ? month.pnl : 0); }
      } catch {}
    },

    /* -------------------------------------------------------------- router */
    go(route, silent) {
      this.route = route;
      location.hash = '#/' + route;
      if (!silent) this.refresh();
    },

    async refresh() {
      const view = Views[this.route] || Views.dashboard;
      const content = U.$('#content');
      if (!content) return;
      // Rapid interactions (type a symbol, tab out, click Analyse) fire more than
      // one refresh. A stale render must never paint over a newer one, and the
      // skeleton must be swapped atomically — assigning innerHTML while a blur
      // handler was moving nodes threw "the node to be removed is no longer a
      // child of this node" in a real browser.
      const token = ++this._renderToken;
      // Leave the current event dispatch before touching the DOM. A `change`
      // handler that fires on blur (type a symbol, tab out) is still mid-flight
      // when it asks for a refresh, and Chrome refuses to detach the very node it
      // is blurring ("the node to be removed is no longer a child of this node").
      await new Promise((r) => setTimeout(r, 0));
      if (token !== this._renderToken) return;
      U.$$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.route === this.route));
      const titleEl = U.$('#page-title');
      if (titleEl) titleEl.textContent = view.title || 'Dashboard';
      const chip = U.$('#filter-chip');
      if (chip) {
        const n = Store.activeFilterCount();
        const range = Store.filters.from && Store.filters.to ? `${Store.filters.from} → ${Store.filters.to}` : '';
        chip.hidden = !n;
        chip.textContent = n ? `${n} filter${n > 1 ? 's' : ''}${range ? ' · ' + range : ''}` : '';
        chip.className = 'chip info clickable';
        chip.onclick = () => { Store.resetFilters(); Store.invalidate(); this.refresh(); };
      }
      const rs = U.$('#range-switch');
      if (rs) {
        const match = Object.entries(Store.presets).find(([k, f]) => { const p = f(); return p.from === Store.filters.from && p.to === Store.filters.to; });
        rs.value = match ? match[0] : 'custom';
      }
      const skeleton = U.h('div');
      skeleton.innerHTML = '<div class="skeleton" style="height:220px;margin-bottom:14px"></div><div class="skeleton" style="height:320px"></div>';
      content.replaceChildren ? content.replaceChildren(skeleton) : (content.innerHTML = skeleton.innerHTML);
      try {
        await view.render(content);
        if (token !== this._renderToken) return;      // superseded while we were awaiting
        Store.booted && this.updateSidebarStats();
      } catch (err) {
        if (token !== this._renderToken) return;
        content.replaceChildren ? content.replaceChildren() : (content.innerHTML = '');
        const box = U.h('div', { class: 'card' });
        box.appendChild(U.h('div', { class: 'empty', html: `Could not load this view.<br><span class="tiny">${U.esc(err.message)}</span><br><br><button class="btn sm" onclick="App.refresh()">Retry</button>` }));
        content.appendChild(box);
        console.error(err);
      }
    },

    /* -------------------------------------------------------------- modals */
    modal({ title, body, actions = [], wide, large, small }) {
      const back = U.h('div', { class: 'modal-back' });
      const m = U.h('div', { class: 'modal' + (wide ? ' lg' : small ? ' sm' : large ? ' lg' : '') });
      const close = () => { back.remove(); this.modalStack = this.modalStack.filter((x) => x !== close); if (!this.modalStack.length) document.body.style.overflow = ''; };
      const head = U.h('div', { class: 'modal-head' }, U.h('h3', { text: title }), U.h('span', { class: 'spacer', style: 'flex:1' }), U.h('button', { class: 'btn xs ghost', text: 'Close', onclick: close }));
      m.appendChild(head);
      const b = U.h('div', { class: 'modal-body' });
      b.appendChild(body);
      m.appendChild(b);
      if (actions.length) {
        const foot = U.h('div', { class: 'modal-foot' });
        actions.forEach((a) => foot.appendChild(U.h('button', { class: 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger ghost' : 'ghost'), text: a.label, onclick: () => a.onClick ? a.onClick(close) : close() })));
        m.appendChild(foot);
      }
      back.appendChild(m);
      back.addEventListener('click', (e) => { if (e.target === back) close(); });
      document.body.appendChild(back);
      document.body.style.overflow = 'hidden';
      this.modalStack.push(close);
      const first = U.$('input,textarea,select', m);
      if (first) setTimeout(() => first.focus(), 60);
      return { close, node: m };
    },

    /* ------------------------------------------------------------ trade I/O */
    async openTrade(id, prefill) {
      let trade = null;
      if (id) {
        try { const d = await API.get('/trades/' + id); trade = d.trade; } catch (e) { return this.toast('Trade not found', 'err'); }
      } else if (prefill) {
        trade = { ...prefill };
        if (trade.opened_at && /^\d{4}-\d{2}-\d{2}$/.test(trade.opened_at)) trade.opened_at = trade.opened_at + 'T09:00:00';
      }
      if (trade && trade.server) delete trade.server;
      const form = Views.tradeForm(trade);
      const actions = [
        { label: id ? 'Delete' : 'Cancel', danger: !!id, onClick: async (close) => {
            if (!id) return close();
            if (!confirm('Delete this trade?')) return;
            await API.del('/trades/' + id); Store.invalidate(); close(); this.toast('Trade deleted', 'ok'); this.refresh();
          } },
        { label: 'Save & close', ghost: true, onClick: (close) => this.saveTrade(form, id, close, true) },
        { label: id ? 'Update trade' : 'Save trade', primary: true, onClick: (close) => this.saveTrade(form, id, close, false) },
      ];
      this.modal({ title: id ? `Edit trade — ${U.esc(trade.symbol)}` : 'Log a trade', body: form.node, actions, wide: true });
    },

    async saveTrade(form, id, close, andNew) {
      let payload;
      try { payload = form.collect(); } catch (e) { return this.toast(e.message, 'err'); }
      try {
        const d = id ? await API.put('/trades/' + id, payload) : await API.post('/trades', payload);
        Store.invalidate();
        close();
        const t = d.trade || {};
        this.toast(`${id ? 'Updated' : 'Logged'} ${t.symbol} · ${U.R(t.r_multiple)}${t.net_pnl ? ' · ' + U.moneySign(t.net_pnl) : ''}`, t.net_pnl >= 0 ? 'ok' : 'warn');
        this.refresh();
        if (andNew) this.openTrade(null);
      } catch (e) { this.toast(e.message, 'err'); }
    },

    importDialog() {
      const body = U.h('div');
      body.innerHTML = `<p class="small muted-2">Paste a broker CSV export and the journal will auto-detect the columns. Supported headers include symbol/ticker, side/type, size/qty/volume/lots, entry/open price, exit/close price, stop, target, open/close dates, fees and net P&L.</p>
        <textarea id="imp-csv" style="min-height:200px" placeholder="symbol,direction,size,entry,exit,stop,opened_at,closed_at,fees"></textarea>
        <div id="imp-out" class="field-note"></div>`;
      this.modal({
        title: 'Import trades from CSV', body,
        actions: [{ label: 'Cancel', ghost: true }, {
          label: 'Import', primary: true, onClick: async (close) => {
            const out = U.$('#imp-out', body);
            out.textContent = 'Importing…';
            try {
              const d = await API.post('/import/csv', { csv: U.$('#imp-csv', body).value });
              out.innerHTML = `Imported <b>${d.inserted}</b> trades (skipped ${d.skipped}).`;
              Store.invalidate();
              setTimeout(() => { close(); this.refresh(); this.toast(`${d.inserted} trades imported`, 'ok'); }, 700);
            } catch (e) { out.innerHTML = `<span class="neg">${U.esc(e.message)}</span>`; }
          },
        }],
      });
    },

    editChecklist() {
      const body = U.h('div');
      body.innerHTML = `<p class="small muted-2">One rule per line. This list is your pre-trade gate and the standard the coach measures you against.</p>
        <textarea id="chk" style="min-height:220px">${U.esc((Store.user.settings.default_checklist || []).join('\n'))}</textarea>`;
      this.modal({
        title: 'My pre-trade rules', body, small: true,
        actions: [{ label: 'Cancel', ghost: true }, {
          label: 'Save rules', primary: true, onClick: async (close) => {
            const list = U.$('#chk', body).value.split('\n').map((x) => x.trim()).filter(Boolean);
            await API.put('/settings', { default_checklist: list });
            await Store.load(true); close(); this.toast('Rules updated', 'ok'); this.refresh();
          },
        }],
      });
    },

    /* ------------------------------------------------------------ feedback */
    toast(msg, kind = '') {
      let box = U.$('#toasts');
      if (!box) { box = U.h('div', { id: 'toasts' }); document.body.appendChild(box); }
      const t = U.h('div', { class: 'toast ' + kind, text: msg });
      box.appendChild(t);
      setTimeout(() => t.remove(), 4200);
    },

    /** Forget the session in this browser, then reconnect to a workspace. */
    async logout() {
      await API.logout();
      Store.booted = false;
      API.invalidate && API.invalidate();
      await this.boot();
    },
  };

  /* -------------------------------------------------------------- shortcuts */
  document.addEventListener('keydown', (e) => {
    const typing = /input|textarea|select/i.test((e.target.tagName || '')) || e.target.isContentEditable;
    if (e.key === 'Escape' && App.modalStack.length) { App.modalStack[App.modalStack.length - 1](); return; }
    if (typing) return;
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); App.openTrade(null); }
    if (e.key === '/') { e.preventDefault(); App.go('trades'); setTimeout(() => { const q = U.$('#f-q'); if (q) q.focus(); }, 400); }
    if (e.key === 'g') { App._g = true; setTimeout(() => { App._g = false; }, 900); return; }
    if (App._g) {
      const map = { d: 'dashboard', c: 'coach', t: 'trades', j: 'journal', a: 'analytics', m: 'market', p: 'playbook', r: 'risk', k: 'calendar', s: 'settings' };
      if (map[e.key]) { App._g = false; App.go(map[e.key]); }
    }
  });
  window.addEventListener('hashchange', () => {
    const h = (location.hash || '').replace(/^#\/?/, '');
    if (h && h !== App.route && Views[h]) { App.route = h; App.refresh(); }
  });

  window.addEventListener('DOMContentLoaded', () => App.boot());
  if (document.readyState !== 'loading') App.boot();
})(window);
