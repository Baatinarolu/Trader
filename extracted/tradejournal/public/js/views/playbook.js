/* views/playbook.js — strategies, entry/exit rules, checklist runner, edge per setup */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};let renderEpoch=0;
  /* M56 — the plan gate's vocabulary, fetched from the server so the editor's hint can never drift
   * from the grammar the engine actually enforces (a hard-coded copy here would be a second source of
   * truth, and the first time the two disagreed the trader would write rules that silently do nothing). */
  function loadPlanVocabulary() {
    if (global.PLAN_GATE_VOCABULARY) return Promise.resolve(global.PLAN_GATE_VOCABULARY);
    if (global.PLAN_GATE_VOCABULARY_ASKED) return global.PLAN_GATE_VOCABULARY_ASKED;
    const asked = global.API.get('/bots/plan-gate').then((r) => {
      global.PLAN_GATE_VOCABULARY = (r && r.vocabulary) || [];
      return global.PLAN_GATE_VOCABULARY;
    }).catch(() => []);
    global.PLAN_GATE_VOCABULARY_ASKED = asked;
    return asked;
  }

  Views.playbook = {
    title: 'Playbook',
    async render(root) {
      const epoch=++renderEpoch,context=Views.ruleChanges?.ctx();let result;try{result=await Promise.all([API.get('/strategies'),API.get('/strategy-changes').catch(()=>({report:{state:'unavailable'}}))]);}catch(e){if(epoch!==renderEpoch||Views.ruleChanges&&!Views.ruleChanges.same(context))return;throw e;}const [data,discipline]=result;
      if(epoch!==renderEpoch||Views.ruleChanges&&!Views.ruleChanges.same(context))return;
      const stats = data.stats || {};
      root.innerHTML = '';

      const head = U.h('div', { class: 'row-between', style: 'margin-bottom:14px;flex-wrap:wrap;gap:10px' });
      head.innerHTML = `<div><h2 style="margin:0">Your playbook</h2><div class="muted small">Written rules are the only thing that separates a system from an opinion. Each card shows what the market has actually paid you for that setup.</div></div>
        <button class="btn primary" id="pb-new">+ New setup</button>`;
      root.appendChild(head);if(Views.ruleChanges)root.appendChild(Views.ruleChanges.card(discipline.report,discipline.archives));

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
            <button class="btn xs ghost" data-edit="${s.id}">Edit</button><button class="btn xs ghost" data-rule-history="${s.id}">Rule-change history</button>
            <button class="btn xs ghost" data-log="${s.id}">Log a trade</button>
            <button class="btn xs ghost danger" data-del="${s.id}" style="margin-left:auto">Delete</button>
          </div>`;
        grid.appendChild(card);
      });

      grid.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if(b.dataset.ruleHistory)return Views.ruleChanges?Views.ruleChanges.open(Number(b.dataset.ruleHistory)):global.App.toast('Rule history unavailable.','err');
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

  async function strategyDialog(s, root) {
    // M56 — the enforced-rule hint under the Entry rules field needs the engine's own vocabulary, and it
    // has to be THERE when the editor opens: a hint reading "loading…" is the same as no hint for the
    // one edit it exists to inform. The read is cached, so only the first dialog waits for it.
    await loadPlanVocabulary();
    const R=Views.ruleChanges,context=R?.ctx(),number=R?.nextSerial();let discipline;
    if(s&&R){try{discipline=await API.get('/strategies/'+s.id+'/change-discipline');if(!R.same(context)||!R.current(number))return;s=discipline.strategy;}catch(e){if(R.same(context)&&R.current(number))global.App.toast(e.message,'err');return;}}
    let alive=true,stale=false;
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
      <div class="muted-2 small span2" data-plan-vocabulary="true">Lines beginning <b>require&nbsp;</b> are ENFORCED by the bots — a candidate that breaks one is refused, and nothing else in the app can overrule it. Everything else is context for you and is never interpreted.<br>Checkable so far (the app’s own list — hover a rule for its allowed values): ${(global.PLAN_GATE_VOCABULARY || []).map((x) => `<code title="${U.esc(x.label + (x.values ? ' — one of: ' + x.values.join(', ') : ''))}">${U.esc(x.line)}</code>`).join(' · ') || '<span class="muted">the app could not read its own rule list — reload the page before trusting a rule.</span>'}<br>A <code>require</code> line the app does not recognise is reported loudly on the bots page and in the payload rather than passing as though it were checked.</div>
      <label class="field span2"><span>Exit rules (one per line)</span><textarea id="s-exit">${U.esc((v.exit_rules || []).join('\n'))}</textarea></label>
      <label class="field span2"><span>Pre-trade checklist (one per line)</span><textarea id="s-check">${U.esc((v.checklist || []).join('\n'))}</textarea></label>
      <label class="field span2"><span>Risk rules</span><textarea id="s-risk" placeholder="Max risk, max trades, cooldowns…">${U.esc(v.risk_rules)}</textarea></label>
      <label class="field"><span>Status</span><select id="s-active"><option value="1" ${v.active ? 'selected' : ''}>Active</option><option value="0" ${!v.active ? 'selected' : ''}>Paused</option></select></label>
    </div>`;
    const lines = (id) => U.$('#' + id, body).value.split('\n').map((x) => x.trim()).filter(Boolean);
    let editor;editor=global.App.modal({
      onClose:()=>{alive=false;},
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
            if(R&&(!alive||!R.same(context)||!R.current(number)||!body.isConnected))return global.App.toast('Workspace/account/session/editor changed; reopen the current rules.','err');
            if(stale)return global.App.toast('Reload current strategy/history before editing.','err');
            try {
              if(!isNew&&R){const preview=await API.post('/strategies/'+s.id+'/change-preview',{revision:discipline.revision,changes:payload});if(!alive||!R.same(context)||!R.current(number)||!body.isConnected)return;global.App.modal({title:'Review proposed rule deltas',body:R.preview(preview),wide:true,actions:[{label:'Cancel — no rules changed',ghost:true},{label:'Save shown configuration (advice retained)',primary:true,onClick:async confirmClose=>{if(!alive||!R.same(context)||!R.current(number)||!body.isConnected)return;const current={...payload,name:U.$('#s-name',body).value.trim(),description:U.$('#s-desc',body).value,market_conditions:U.$('#s-cond',body).value,timeframes:U.$('#s-tf',body).value,entry_rules:lines('s-entry'),exit_rules:lines('s-exit'),checklist:lines('s-check'),risk_rules:U.$('#s-risk',body).value,target_r_multiple:U.$('#s-target',body).value,colour:U.$('#s-colour',body).value,active:U.$('#s-active',body).value==='1'};if(JSON.stringify(current)!==JSON.stringify(payload))return global.App.toast('Draft changed after preview; cancel and preview the new fields.','err');try{const result=await API.put('/strategies/'+s.id,{...payload,strategy_revision:preview.revision});if(!alive||!R.same(context)||!R.current(number)||!body.isConnected)return;confirmClose();close();await Store.reloadAll();if(!R.same(context))return;global.App.toast('Strategy/version/change recorded; no trade, risk or grade permission implied.','ok');global.App.refresh();global.App.modal({title:'Saved configuration — quarter advice',body:R.card(result.quarter_rule_changes),wide:true,actions:[{label:'Close advice',ghost:true}]});}catch(err){if(alive&&R.same(context)&&R.current(number)){stale=err.status===409;global.App.toast(err.message,'err');confirmClose();}}}}]});return;}
              if (isNew) await API.post('/strategies', payload); else await API.put('/strategies/' + s.id, payload);
              await Store.reloadAll();
              close(); global.App.toast('Playbook updated', 'ok'); global.App.refresh();
            } catch (err) { if(!R||alive&&R.same(context)&&R.current(number)){stale=err.status===409;global.App.toast(err.message, 'err');} }
          },
        },
      ],
    });
    if(!isNew&&R)body.appendChild(U.h('button',{class:'btn sm ghost',type:'button',dataset:{strategyReload:'true'},text:'Reload current rules/history (discard unsaved draft)',onclick:()=>{if(!alive||!R.same(context)||!R.current(number))return;editor.close();return strategyDialog(s,root);}}));
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
