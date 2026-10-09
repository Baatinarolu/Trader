/* views/playbook.js — strategies, entry/exit rules, checklist runner, edge per setup */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  Views.playbook = {
    title: 'Playbook',
    async render(root) {
      const data = await API.get('/strategies');
      const stats = data.stats || {};
      root.innerHTML = '';

      const head = U.h('div', { class: 'row-between', style: 'margin-bottom:14px;flex-wrap:wrap;gap:10px' });
      head.innerHTML = `<div><h2 style="margin:0">Your playbook</h2><div class="muted small">Written rules are the only thing that separates a system from an opinion. Each card shows what the market has actually paid you for that setup.</div></div>
        <button class="btn primary" id="pb-new">+ New setup</button>`;
      root.appendChild(head);

      const grid = U.h('div', { class: 'grid g3' });
      root.appendChild(grid);

      if (!data.strategies.length) {
        grid.innerHTML = '<div class="card"><div class="empty">No setups yet. Create your first one and every trade gets a home.</div></div>';
      }
      data.strategies.forEach((s) => {
        const st = stats[s.id] || { trades: 0 };
        const grade = !st.trades ? '—' : st.expectancy_r > 0.25 ? 'A' : st.expectancy_r > 0.1 ? 'B' : st.expectancy_r > 0 ? 'C' : 'D';
        const card = U.h('div', { class: 'card', style: `border-top:3px solid ${s.colour}` });
        card.innerHTML = `
          <div class="row-between" style="align-items:flex-start">
            <div><h3 style="margin:0 0 4px">${U.esc(s.name)} ${s.active ? '' : '<span class="chip warn" style="margin-left:6px">paused</span>'}</h3>
              <div class="tiny muted">${U.esc(s.market_conditions || '')}${s.timeframes ? ' · ' + U.esc(s.timeframes) : ''} · target ${U.num(s.target_r_multiple, 1)}R</div></div>
            <span class="grade" style="font-size:1.4rem;color:${grade === 'A' ? 'var(--green)' : grade === 'B' ? 'var(--accent-2)' : grade === 'C' ? 'var(--amber)' : grade === 'D' ? 'var(--red)' : 'var(--muted)'}">${grade}</span>
          </div>
          <p class="small muted-2" style="margin:10px 0">${U.esc(s.description || '')}</p>
          <div class="grid g4" style="gap:8px;margin-bottom:10px">
            <div><div class="k-label">Trades</div><div class="mono">${st.trades || 0}</div></div>
            <div><div class="k-label">Win %</div><div class="mono">${st.trades ? U.pct(st.win_rate, 0) : '—'}</div></div>
            <div><div class="k-label">Expectancy</div><div class="mono ${U.cls(st.expectancy_r)}">${st.trades ? U.signed(st.expectancy_r, 2) + 'R' : '—'}</div></div>
            <div><div class="k-label">Net</div><div class="mono ${U.cls(st.net_pnl)}">${st.trades ? U.moneySign(st.net_pnl, 0) : '—'}</div></div>
          </div>
          <div class="sep" style="margin:8px 0"></div>
          <div class="tiny"><b style="color:var(--green)">Entry</b> <span class="muted-2">${(s.entry_rules || []).slice(0, 3).map((r) => U.esc(r)).join(' · ') || '—'}</span></div>
          <div class="tiny" style="margin-top:5px"><b style="color:var(--red)">Exit</b> <span class="muted-2">${(s.exit_rules || []).slice(0, 3).map((r) => U.esc(r)).join(' · ') || '—'}</span></div>
          ${s.risk_rules ? `<div class="tiny" style="margin-top:5px"><b style="color:var(--amber)">Risk</b> <span class="muted-2">${U.esc(s.risk_rules)}</span></div>` : ''}
          <div class="row" style="gap:6px;margin-top:12px">
            <button class="btn xs" data-check="${s.id}">Run checklist</button>
            <button class="btn xs ghost" data-edit="${s.id}">Edit</button>
            <button class="btn xs ghost" data-log="${s.id}">Log a trade</button>
            <button class="btn xs ghost danger" data-del="${s.id}" style="margin-left:auto">Delete</button>
          </div>`;
        grid.appendChild(card);
      });

      grid.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.edit) return strategyDialog(data.strategies.find((s) => s.id === Number(b.dataset.edit)), root);
        if (b.dataset.log) { const s = data.strategies.find((x) => x.id === Number(b.dataset.log)); return global.App.openTrade(null, { strategy_id: s.id }); }
        if (b.dataset.check) { const s = data.strategies.find((x) => x.id === Number(b.dataset.check)); return checklistRunner(s); }
        if (b.dataset.del) {
          if (!confirm('Delete this setup? Trades keep their name but lose the link.')) return;
          await API.del('/strategies/' + b.dataset.del);
          await Store.reloadAll(); global.App.refresh();
        }
      });
      U.$('#pb-new', root).addEventListener('click', () => strategyDialog(null, root));
      return root;
    },
  };

  function strategyDialog(s, root) {
    const isNew = !s;
    const v = s || { name: '', description: '', market_conditions: '', timeframes: '', entry_rules: [], exit_rules: [], checklist: [], risk_rules: '', target_r_multiple: 2, colour: '#4f8cff', active: 1 };
    const body = U.h('div');
    body.innerHTML = `<div class="form-grid">
      <label class="field span2"><span>Setup name</span><input id="s-name" value="${U.esc(v.name)}" placeholder="e.g. London open reversal" /></label>
      <label class="field"><span>Market conditions</span><input id="s-cond" value="${U.esc(v.market_conditions)}" placeholder="Trending / ranging / news" /></label>
      <label class="field"><span>Timeframes</span><input id="s-tf" value="${U.esc(v.timeframes)}" placeholder="H4 / H1 / M15" /></label>
      <label class="field span2"><span>Description</span><textarea id="s-desc" placeholder="When this setup is valid and when it is not">${U.esc(v.description)}</textarea></label>
      <label class="field"><span>Target R multiple</span><input id="s-target" type="number" step="0.1" value="${v.target_r_multiple}" /></label>
      <label class="field"><span>Colour</span><input id="s-colour" type="color" value="${v.colour}" style="height:38px" /></label>
      <label class="field span2"><span>Entry rules (one per line)</span><textarea id="s-entry" placeholder="One rule per line">${U.esc((v.entry_rules || []).join('\n'))}</textarea></label>
      <label class="field span2"><span>Exit rules (one per line)</span><textarea id="s-exit">${U.esc((v.exit_rules || []).join('\n'))}</textarea></label>
      <label class="field span2"><span>Pre-trade checklist (one per line)</span><textarea id="s-check">${U.esc((v.checklist || []).join('\n'))}</textarea></label>
      <label class="field span2"><span>Risk rules</span><textarea id="s-risk" placeholder="Max risk, max trades, cooldowns…">${U.esc(v.risk_rules)}</textarea></label>
      <label class="field"><span>Status</span><select id="s-active"><option value="1" ${v.active ? 'selected' : ''}>Active</option><option value="0" ${!v.active ? 'selected' : ''}>Paused</option></select></label>
    </div>`;
    const lines = (id) => U.$('#' + id, body).value.split('\n').map((x) => x.trim()).filter(Boolean);
    global.App.modal({
      title: isNew ? 'New setup' : 'Edit setup',
      body,
      actions: [
        { label: 'Cancel', ghost: true },
        {
          label: isNew ? 'Create setup' : 'Save changes', primary: true,
          onClick: async (close) => {
            const payload = {
              name: U.$('#s-name', body).value.trim(),
              description: U.$('#s-desc', body).value,
              market_conditions: U.$('#s-cond', body).value,
              timeframes: U.$('#s-tf', body).value,
              entry_rules: lines('s-entry'), exit_rules: lines('s-exit'), checklist: lines('s-check'),
              risk_rules: U.$('#s-risk', body).value,
              target_r_multiple: U.$('#s-target', body).value,
              colour: U.$('#s-colour', body).value,
              active: U.$('#s-active', body).value === '1',
            };
            if (!payload.name) return global.App.toast('Give the setup a name.', 'err');
            try {
              if (isNew) await API.post('/strategies', payload); else await API.put('/strategies/' + s.id, payload);
              await Store.reloadAll();
              close(); global.App.toast('Playbook updated', 'ok'); global.App.refresh();
            } catch (err) { global.App.toast(err.message, 'err'); }
          },
        },
      ],
    });
  }

  function checklistRunner(s) {
    const items = (s.checklist && s.checklist.length) ? s.checklist : (Store.user.default_checklist || []);
    const body = U.h('div');
    body.innerHTML = `<div class="small muted-2" style="margin-bottom:12px">Run this before you click buy or sell. If you cannot tick every box, the trade is not this setup — and that is information, not a loss.</div>
      <div id="cr-list">${items.map((x, i) => `<label class="rule"><input type="checkbox" data-i="${i}" /> <span>${U.esc(x)}</span></label>`).join('')}</div>
      <div class="sep"></div>
      <div id="cr-result" class="sticky-note">0 / ${items.length} checks passed</div>`;
    const update = () => {
      const boxes = U.$$('[data-i]', body);
      const passed = boxes.filter((b) => b.checked).length;
      const r = U.$('#cr-result', body);
      const pct = items.length ? passed / items.length : 1;
      r.className = pct === 1 ? 'sticky-note' : pct >= 0.75 ? 'sticky-note' : '';
      r.style.background = pct === 1 ? 'rgba(47,209,139,.12)' : pct >= 0.75 ? '' : 'rgba(255,92,120,.12)';
      r.style.borderColor = pct === 1 ? 'rgba(47,209,139,.35)' : pct >= 0.75 ? '' : 'rgba(255,92,120,.35)';
      r.style.color = pct === 1 ? '#8ef0c4' : pct >= 0.75 ? '' : '#ffb3c1';
      r.innerHTML = `<b>${passed} / ${items.length}</b> checks passed — ${pct === 1 ? 'green light: this is the trade you practised.' : pct >= 0.75 ? 'proceed only at reduced size.' : 'stand down. This is not the setup; it is an impulse.'}`;
    };
    U.$$('[data-i]', body).forEach((b) => b.addEventListener('change', update));
    update();
    global.App.modal({
      title: 'Pre-trade checklist — ' + s.name, body,
      actions: [{ label: 'Close', ghost: true }, { label: 'Log this trade', primary: true, onClick: (close) => { close(); global.App.openTrade(null, { strategy_id: s.id }); } }],
    });
  }
})(window);
