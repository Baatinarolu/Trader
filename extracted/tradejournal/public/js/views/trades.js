/* views/trades.js — trade log, filters, and the trade entry form */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  const EMOTIONS = ['Calm', 'Focused', 'Neutral', 'Patient', 'Confident', 'FOMO', 'Revenge', 'Impatient', 'Anxious', 'Frustrated', 'Greedy', 'Bored', 'Tired'];
  const MISTAKES = ['Moved stop', 'Entered early', 'Entered late', 'Oversized', 'Overtraded', 'No plan', 'Chased price', 'Ignored higher timeframe', 'Sized up on tilt', 'Exited too early', 'Revenge trade', 'Broke daily limit', 'Traded news', 'Averaged down'];
  const TAGS = ['A+ setup', 'B setup', 'News play', 'Pullback', 'Range', 'Breakout', 'Reversal', 'Trend day', 'Scaled in', 'Partial taken', 'Held overnight', 'Paper trade'];
  const EXIT_REASONS = ['Target', 'Stop loss', 'Trailing stop', 'Time stop', 'Discretionary win', 'Discretionary loss', 'Breakeven / scratch', 'Manual close', 'News exit'];

  // Explicit core review; missing fields never silently become "no mistakes".
  // Not broker-time capture provenance or screenshots/confluence completeness.
  Views.openJournalReview = async function(id,{capture=null,onComplete=null}={}) {
    let trade;
    try{trade=capture?capture.snapshot:(await API.get('/trades/'+id)).trade;}
    catch(e){return global.App.toast(e.message||'Trade not found','err');}
    if(!capture && trade.status!=='closed')return global.App.toast('Record the actual close before completing its journal.','err');
    const body=U.h('div');
    body.innerHTML=`<p class="small muted">${capture?`Writing for the <b>observed</b> loss #${U.esc(capture.loss_trade_id)} · ${U.esc(trade.symbol)} · ${U.moneySign(trade.net_pnl)}. Corrected/deleted journal truth is not recreated.`:'Core review of the current closed journal record.'} Name what happened, the rule/mistake (or explicitly none), and what you would do differently. If entry emotion was not recorded, say so; do not reconstruct it as live capture.</p>
      <div class="form-grid" style="grid-template-columns:1fr 1fr"><label class="field"><span>Entry emotional state (or honestly not recorded)</span><input id="jr-before" maxlength="100" value="${U.esc(trade.emotion_before||'')}" /></label>
      <label class="field"><span>Exit emotional state</span><input id="jr-after" maxlength="100" value="${U.esc(trade.emotion_after||'')}" /></label></div>
      <label class="field"><span>1. What happened?</span><textarea id="jr-what" maxlength="2000">${U.esc(trade.execution_notes||'')}</textarea></label>
      <label class="field"><span>2. What rule/mistake?</span><input id="jr-mistakes" maxlength="2000" value="${U.esc(trade.mistakes||'')}" /></label>
      <label class="row gap-8"><input id="jr-none" type="checkbox" ${trade.mistakes_none===1?'checked':''} /><span>Explicitly followed plan; no mistakes to report (not inferred from a win)</span></label>
      <label class="field"><span>3. What would you do differently / repeat?</span><textarea id="jr-different" maxlength="2000">${U.esc(trade.lesson||'')}</textarea></label>
      <div class="field-note">This acknowledges core writing only. It does not waive cap/loss/streak/cooldown rules, grant an entry, or prove live emotion timing/the entire course journal is complete.</div>`;
    if(!capture&&Views.execution)body.appendChild(Views.execution.card(trade));
    if(!capture&&Views.screenshots)body.appendChild(Views.screenshots.card(trade));
    if(!capture&&Views.confluences)body.appendChild(Views.confluences.card(trade));
    const f=id=>body.querySelector('#'+id),none=f('jr-none');none.addEventListener('change',()=>{f('jr-mistakes').disabled=none.checked;});f('jr-mistakes').disabled=none.checked;
    return global.App.modal({title:capture || Number(trade.net_pnl)<0?'Post-loss reflection':'Complete trade journal',body,wide:true,
      actions:[{label:'Review later — remains incomplete',ghost:true},{label:'Complete core journal',primary:true,onClick:async close=>{
        const payload={emotion_before:f('jr-before').value,emotion_after:f('jr-after').value,execution_notes:f('jr-what').value,lesson:f('jr-different').value,mistakes:none.checked?'':f('jr-mistakes').value,mistakes_none:none.checked};
        if([payload.emotion_before,payload.emotion_after,payload.execution_notes,payload.lesson].some(v=>!v.trim())||(!none.checked&&!payload.mistakes.trim()))return global.App.toast('Name both emotional states and complete all three reflection lines; choose mistakes or explicit none.','err');
        try{await API.post(capture?'/journal/reflections/'+capture.id:'/trades/'+id+'/journal',payload);Store.invalidate();close();global.App.toast('Core journal acknowledged; other rule stops remain.','ok');if(onComplete)onComplete();else global.App.refresh();}
        catch(e){global.App.toast(e.message||'Journal review could not be recorded.','err');}
      }}]});
  };
  Views.lossWritingCard = function(writing={}) {
    const node=U.h('div',{class:'card',style:'margin-top:14px'}),pending=writing.pending||[];
    node.innerHTML=`<div class="card-head"><h3>Post-loss writing</h3><span class="chip ${pending.length?'warn':'muted'}">${writing.pending_count===undefined?'unavailable':pending.length+' pending'}</span></div>
      <div class="tiny muted">Required after observed current-day losses: pause AND write. A reasoned action exception does not complete the reflection; other day stops/cooldowns remain. No pending loss does not mean every historical journal is complete.</div>
      ${pending.map(p=>`<div class="row-between" style="padding:8px"><span class="small">Observed #${U.esc(p.loss_trade_id)} ${U.esc(p.snapshot?.symbol||'')} · ${U.moneySign(p.snapshot?.net_pnl)} · ${U.esc(p.observed_at)}</span><button class="btn sm" data-loss-reflect="${p.id}">Write reflection</button></div>`).join('')}`;
    node.querySelectorAll('[data-loss-reflect]').forEach(b=>b.addEventListener('click',()=>Views.openJournalReview(null,{capture:pending.find(p=>p.id===Number(b.dataset.lossReflect))})));
    return node;
  };

  Views.trades = {
    title: 'Trade log',
    async render(root) {
      const params = Store.queryParams();
      root.innerHTML = '';
      const bar = U.h('div', { class: 'card', style: 'margin-bottom:14px' });
      bar.innerHTML = `
        <div class="row-between wrap" style="gap:10px">
          <div class="filters">
            <div class="preset-row">${[['7d', '7D'], ['30d', '30D'], ['90d', '90D'], ['ytd', 'YTD'], ['all', 'All']].map(([k, l]) => `<button class="btn xs ${datePresetActive(k) ? '' : 'ghost'}" data-preset="${k}">${l}</button>`).join('')}</div>
            <input type="date" id="f-from" value="${Store.filters.from || ''}" title="From" />
            <input type="date" id="f-to" value="${Store.filters.to || ''}" title="To" />
            <select id="f-status">
              <option value="all">All statuses</option>
              <option value="closed" ${Store.filters.status === 'closed' ? 'selected' : ''}>Closed</option>
              <option value="open" ${Store.filters.status === 'open' ? 'selected' : ''}>Open</option>
            </select>
            <select id="f-strategy"><option value="">All setups</option>${Store.strategies.map((s) => `<option value="${s.id}" ${String(Store.filters.strategy_id) === String(s.id) ? 'selected' : ''}>${U.esc(s.name)}</option>`).join('')}</select>
            <input id="f-q" placeholder="Search symbol, tag, note…" value="${U.esc(Store.filters.q)}" style="min-width:190px" />
            <button class="btn xs ghost" id="f-clear">Clear</button>
          </div>
          <div class="row" style="gap:8px">
            <button class="btn sm" id="btn-new">+ New trade</button>
            <button class="btn sm ghost" id="btn-csv">Export CSV</button>
            <button class="btn sm ghost" id="btn-import">Import</button>
          </div>
        </div>`;
      root.appendChild(bar);

      const body = U.h('div', { class: 'card' });
      body.innerHTML = '<div class="skeleton" style="height:320px"></div>';
      root.appendChild(body);

      wireFilters(root);

      const data = await API.get('/trades', { ...params, limit: 800 });
      const trades = data.trades || [];
      renderTable(body, trades, data.total);
      return root;
    },
  };

  function datePresetActive(k) {
    const p = Store.presets[k] ? Store.presets[k]() : null;
    return p && Store.filters.from === p.from && Store.filters.to === p.to;
  }
  function wireFilters(root) {
    U.$$('[data-preset]', root).forEach((b) => b.addEventListener('click', () => {
      const p = Store.presets[b.dataset.preset]();
      Store.filters.from = p.from; Store.filters.to = p.to;
      global.App.refresh();
    }));
    const on = (sel, key, ev = 'change') => {
      const el = U.$(sel, root);
      if (el) el.addEventListener(ev, () => {
        Store.filters[key] = el.value || (key === 'strategy_id' ? '' : null);
        if (key === 'q') return; // search on enter only
        global.App.refresh();
      });
    };
    on('#f-from', 'from'); on('#f-to', 'to'); on('#f-status', 'status'); on('#f-strategy', 'strategy_id');
    const q = U.$('#f-q', root);
    if (q) q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { Store.filters.q = q.value; global.App.refresh(); } });
    const cl = U.$('#f-clear', root);
    if (cl) cl.addEventListener('click', () => { Store.resetFilters(); global.App.refresh(); });
    const nw = U.$('#btn-new', root);
    if (nw) nw.addEventListener('click', () => global.App.openTrade(null));
    const csv = U.$('#btn-csv', root);
    if (csv) csv.addEventListener('click', async () => {
      try { await API.download('/export/csv' + new URLSearchParams(cleanParams(Store.queryParams())).toString().replace(/^/, '?'), 'trades.csv'); toast('CSV exported', 'ok'); }
      catch (e) { toast('Export failed', 'err'); }
    });
    const imp = U.$('#btn-import', root);
    if (imp) imp.addEventListener('click', () => global.App.importDialog());
  }
  function cleanParams(p) { const o = {}; for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') o[k] = v; return o; }

  /* ----------------------------------------------------------- table */
  function renderTable(body, trades, total) {
    if (!trades.length) {
      body.innerHTML = `<div class="empty">No trades match this filter.<br><button class="btn sm" id="empty-new" style="margin-top:12px">+ Log your first trade</button></div>`;
      const b = U.$('#empty-new', body);
      if (b) b.addEventListener('click', () => global.App.openTrade(null));
      return;
    }
    let sortKey = 'date', sortDir = -1;
    const sum = {
      net: trades.reduce((s, t) => s + (t.net_pnl || 0), 0),
      r: trades.reduce((s, t) => s + (t.r_multiple || 0), 0),
      wins: trades.filter((t) => t.is_win).length,
    };
    const closed=trades.filter(t=>t.status==='closed'),journaled=closed.filter(t=>t.journal?.complete).length;
    const draw = () => {
      const rows = [...trades].sort((a, b) => {
        const va = val(a, sortKey), vb = val(b, sortKey);
        if (va === vb) return 0;
        return (va > vb ? 1 : -1) * sortDir;
      });
      body.innerHTML = `
        <div class="row-between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div class="row" style="gap:14px;flex-wrap:wrap">
            <div><div class="l k-label">Showing</div><div class="mono">${trades.length}${total > trades.length ? ' / ' + total : ''}</div></div>
            <div><div class="k-label">Filtered net</div><div class="mono ${U.cls(sum.net)}">${U.moneySign(sum.net)}</div></div>
            <div><div class="k-label">Filtered R</div><div class="mono ${U.cls(sum.r)}">${U.signed(sum.r, 1)}R</div></div>
            <div><div class="k-label">Core journal (loaded closed trades)</div><div class="mono">${journaled} / ${closed.length}</div></div>
            <div><div class="k-label">Win rate</div><div class="mono">${U.pct((sum.wins / trades.length) * 100, 1)}</div></div>
          </div>
          <div class="row" style="gap:8px">
            <button class="btn xs ghost" id="sel-all">Select all</button>
            <button class="btn xs ghost danger" id="bulk-del" disabled>Delete selected</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="width:28px"><input type="checkbox" id="chk-all" /></th>
            ${[['date', 'Closed'], ['symbol', 'Symbol'], ['direction', 'Side'], ['size', 'Size'], ['entry', 'Entry'], ['exit', 'Exit'], ['stop', 'Stop'],
              ['r_multiple', 'R'], ['net_pnl', 'Net P&L'], ['strategy_name', 'Setup'], ['setup_grade', 'Entry setup grade'], ['entry_model', 'Entry model'], ['session_label', 'Session'],
              ['adherence', 'Adh'], ['mistakes', 'Mistakes'], ['', 'Execution self-review'], ['', 'Journal'], ['', 'Visual evidence'], ['', 'Entry confluences'], ['', '']].map(([k, l]) =>
              `<th class="${['size', 'entry', 'exit', 'stop', 'r_multiple', 'net_pnl'].includes(k) ? 'num ' : ''}${k ? 'sortable' : ''}" data-sort="${k}">${l}${sortKey === k ? (sortDir > 0 ? ' asc' : ' desc') : ''}</th>`).join('')}
          </tr></thead>
          <tbody>
          ${rows.map((t) => `<tr data-id="${t.id}">
            <td><input type="checkbox" class="row-chk" value="${t.id}" /></td>
            <td class="mono tiny nowrap">${U.dt(t.closed_at || t.opened_at)}</td>
            <td class="nowrap"><b>${U.esc(t.symbol)}</b> <span class="tiny muted">${U.esc((Store.classLabels[t.asset_class] || t.asset_class || '').slice(0, 3))}</span></td>
            <td><span class="${Store.dirClass(t)}">${U.esc(String(t.direction).slice(0, 4))}</span></td>
            <td class="num">${U.nf(t.size, 2)} <span class="tiny muted">${U.esc(Store.unitLabels[t.asset_class] || '')}</span></td>
            <td class="num">${U.price(t.entry)}</td>
            <td class="num">${t.exit ? U.price(t.exit) : '<span class="chip info">open</span>'}</td>
            <td class="num muted">${t.stop ? U.price(t.stop) : '<span class="warn tiny">none</span>'}</td>
            <td class="num ${U.rClass(t.r_multiple)}"><b>${U.R(t.r_multiple)}</b></td>
            <td class="num ${U.cls(t.net_pnl)}">${U.moneySign(t.net_pnl)}</td>
            <td class="tiny nowrap">${U.esc(t.strategy_name || '<span class="muted">untagged</span>').replace(/&lt;|&gt;/g, '')}</td>
            <td class="tiny">${U.esc(t.setup_grade || '—')}</td>
            <td class="tiny nowrap">${U.esc(t.entry_model == null ? 'Unknown' : t.entry_model)}${t.entry_tf ? ' · ' + U.esc(t.entry_tf) : ''}</td>
            <td class="tiny nowrap">${U.esc(t.session_label || '—')}</td>
            <td class="tiny"><span class="rating ${t.adherence >= 4 ? 'strong' : t.adherence <= 2 ? 'weak' : ''}">${U.rating(t.adherence)}</span></td>
            <td class="tiny mistake-line nowrap" title="${U.esc(t.mistakes)}">${U.esc((t.mistakes || '').slice(0, 26))}</td>
            <td class="tiny"><span data-execution-state>${U.esc(Views.execution?Views.execution.state(t.execution_review):'Unreviewed')}</span>${t.status==='closed'?` <button class="btn xs ghost" data-execution="${t.id}">Execution</button>`:''}</td>
            <td class="tiny" title="${U.esc(t.journal?.scope||'Core journal state unavailable')}"><span class="chip ${t.journal?.complete?'pos':'muted'}">${t.journal?.complete?'Journaled':t.status==='open'?'Awaiting close':'<i style="display:inline-block;width:6px;height:6px;background:#6b7280;border-radius:50%;margin-right:4px" aria-hidden="true"></i>Journal missing'}</span>${t.status==='closed'?` <button class="btn xs ghost" data-journal="${t.id}">Journal</button>`:''}</td>
            <td class="tiny"><button class="btn xs ghost" data-screenshots="${t.id}">HTF / MTF / LTF</button></td>
            <td class="tiny"><button class="btn xs ghost" data-confluences="${t.id}">Entry reasons</button></td>
            <td class="nowrap"><button class="btn xs ghost" data-edit="${t.id}">Edit</button></td>
          </tr>`).join('')}
          </tbody>
        </table></div>`;

      U.$$('[data-sort]', body).forEach((th) => th.addEventListener('click', () => {
        const k = th.dataset.sort; if (!k) return;
        if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = -1; }
        draw();
      }));
      U.$$('[data-execution]',body).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();if(Views.execution)Views.execution.open(Number(b.dataset.execution));else global.App.toast('Execution review UI unavailable; no grade inferred.','err');}));
      U.$$('[data-journal]',body).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();Views.openJournalReview(Number(b.dataset.journal));}));
      U.$$('[data-screenshots]',body).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();if(Views.screenshots)Views.screenshots.open(Number(b.dataset.screenshots));else global.App.toast('Visual evidence UI unavailable; nothing is inferred.','err');}));
      U.$$('[data-confluences]',body).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();if(Views.confluences)Views.confluences.open(Number(b.dataset.confluences));else global.App.toast('Entry reasons UI unavailable; nothing inferred.','err');}));
      U.$$('[data-edit]', body).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); global.App.openTrade(Number(b.dataset.edit)); }));
      U.$$('tr[data-id]', body).forEach((tr) => tr.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox' || e.target.closest('[data-edit],[data-journal],[data-execution],[data-confluences]')) return;
        global.App.openTrade(Number(tr.dataset.id));
      }));
      const chkAll = U.$('#chk-all', body);
      const upd = () => {
        const sel = U.$$('.row-chk:checked', body).length;
        const btn = U.$('#bulk-del', body);
        if (btn) { btn.disabled = !sel; btn.textContent = sel ? `Delete ${sel} selected` : 'Delete selected'; }
      };
      if (chkAll) chkAll.addEventListener('change', () => { U.$$('.row-chk', body).forEach((c) => { c.checked = chkAll.checked; }); upd(); });
      U.$$('.row-chk', body).forEach((c) => c.addEventListener('change', upd));
      const sa = U.$('#sel-all', body);
      if (sa) sa.addEventListener('click', () => { U.$$('.row-chk', body).forEach((c) => { c.checked = true; }); if (chkAll) chkAll.checked = true; upd(); });
      const bd = U.$('#bulk-del', body);
      if (bd) bd.addEventListener('click', async () => {
        const ids = U.$$('.row-chk:checked', body).map((c) => Number(c.value));
        if (!ids.length) return;
        if (!confirm(`Delete ${ids.length} trade(s)? This cannot be undone.`)) return;
        await API.post('/trades/bulk-delete', { ids });
        Store.invalidate(); toast(`${ids.length} trades deleted`, 'ok'); global.App.refresh();
      });
    };
    draw();
  }
  function val(t, k) {
    if (k === 'date') return new Date(t.closed_at || t.opened_at).getTime();
    const v = t[k];
    return typeof v === 'number' ? v : String(v || '').toLowerCase();
  }

  /* ------------------------------------------------------- trade form */
  /**
   * Builds the trade entry/edit form.  Returns { node, collect(), live() }.
   * The form is deliberately long: the point of a journal is that you can
   * record *why*, not just how much.
   */
  Views.tradeForm = function (trade, opts = {}) {
    const isNew = !trade || !trade.id;
    const t = trade || { direction: 'long', status: 'open', size: 1, opened_at: localNow(), symbol: (Store.user.settings.focus_symbols || [])[0] || 'EURUSD' };
    const node = U.h('div');
    const strategyOptions = Store.strategies.filter((s) => s.active !== 0).map((s) => `<option value="${s.id}" ${Number(t.strategy_id) === s.id ? 'selected' : ''}>${U.esc(s.name)}</option>`).join('');
    const list = (arr, sel) => arr.map((x) => `<option value="${U.esc(x)}" ${String(sel || '').toLowerCase() === x.toLowerCase() ? 'selected' : ''}>${U.esc(x)}</option>`).join('');
    const symOptions = Store.instruments.map((i) => `<option value="${i.symbol}" ${t.symbol === i.symbol ? 'selected' : ''}>${i.symbol} — ${U.esc(i.name || '')}</option>`).join('');

    node.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <label class="row gap-8"><input id="tf-record-only" type="checkbox" ${!isNew || t.record_only ? 'checked' : ''} /><span>Already executed outside the app / historical record only — not entry permission</span></label>
        <div class="field-note" id="tf-guardrail-state">Checking the selected account's personal guardrails…</div>
        <button class="btn xs ghost" id="tf-guardrail-refresh" type="button">Recheck guardrails</button>
        ${t.override_reason ? `<div class="bot-warn"><b>Recorded override reason (not editable):</b> ${U.esc(t.override_reason)}</div>` : ''}
      </div>
      <div class="form-grid">
        <label class="field"><span>Symbol</span>
          <input id="tf-symbol" list="tf-symbols" value="${U.esc(t.symbol || '')}" placeholder="EURUSD, ES, AAPL, BTCUSDT…" />
          <datalist id="tf-symbols">${symOptions}</datalist>
          <div class="field-note" id="tf-spec"></div>
        </label>
        <label class="field"><span>Direction</span>
          <select id="tf-direction"><option value="long" ${t.direction === 'long' ? 'selected' : ''}>Long / Buy</option><option value="short" ${t.direction === 'short' ? 'selected' : ''}>Short / Sell</option></select>
        </label>
        <label class="field"><span>Status</span>
          <select id="tf-status"><option value="closed" ${t.status === 'closed' ? 'selected' : ''}>Closed</option><option value="open" ${t.status === 'open' ? 'selected' : ''}>Open (still running)</option></select>
        </label>
        <label class="field"><span>Account</span>
          <select id="tf-account">${Store.accounts.map((a) => `<option value="${a.id}" ${Number(t.account_id) === a.id || (!t.account_id && a.id === Store.accountId) ? 'selected' : ''}>${U.esc(a.name)}</option>`).join('')}</select>
        </label>

        <label class="field"><span>Entry price</span><input id="tf-entry" type="number" step="any" value="${t.entry ?? ''}" /></label>
        <label class="field"><span>Stop loss</span><input id="tf-stop" type="number" step="any" value="${t.stop ?? ''}" /><div class="field-note" id="tf-risk"></div></label>
        <label class="field"><span>Target</span><input id="tf-target" type="number" step="any" value="${t.target ?? ''}" /><div class="field-note" id="tf-rr"></div></label>
        <label class="field"><span>Exit price</span><input id="tf-exit" type="number" step="any" value="${t.exit ?? ''}" /></label>

        <label class="field"><span>Size (lots / contracts / shares / coins)</span><input id="tf-size" type="number" step="any" value="${t.size ?? ''}" /><div class="field-note" id="tf-calc"></div></label>
        <label class="field"><span>Fees / commission</span><input id="tf-fees" type="number" step="any" value="${t.fees ?? 0}" /></label>
        <label class="field"><span>Opened at</span><input id="tf-opened" type="datetime-local" value="${toLocalInput(t.opened_at)}" /></label>
        <label class="field"><span>Closed at</span><input id="tf-closed" type="datetime-local" value="${toLocalInput(t.closed_at)}" /></label>

        <label class="field span2"><span>Strategy / setup</span>
          <select id="tf-strategy"><option value="">— untagged —</option>${strategyOptions}</select>
        </label>
        <label class="field"><span>Entry setup grade</span>
          <select id="tf-grade"><option value="">—</option>${list(['A+', 'A', 'B', 'C', 'D'], t.setup_grade)}</select>
        </label>
        <label class="field"><span>Entry model</span>
          <select id="tf-entrymodel"><option value="" ${t.entry_model == null ? 'selected' : ''}>Unknown / not recorded</option>
            ${[['market_shift', 'Market shift'], ['flip', 'Flip'], ['none', 'None (explicitly no named model)']].map(([v, name]) => `<option value="${v}" ${t.entry_model === v ? 'selected' : ''}>${name}</option>`).join('')}</select>
          <div class="field-note">Record the actual model; old untagged trades are never guessed.</div>
        </label>
        <label class="field"><span>Entry timeframe</span><input id="tf-entrytf" value="${U.esc(t.entry_tf || '')}" placeholder="e.g. 5m" /></label>
        <label class="field"><span>Exit reason</span>
          <select id="tf-exitreason"><option value="">—</option>${list(EXIT_REASONS, t.exit_reason)}</select>
        </label>

        <label class="field"><span>Planned R:R</span><input id="tf-plannedr" type="number" step="any" value="${t.planned_r ?? ''}" /></label>
        <label class="field"><span>MAE (worst excursion, R)</span><input id="tf-mae" type="number" step="any" value="${t.mae_r ?? ''}" placeholder="e.g. -0.8" /></label>
        <label class="field"><span>MFE (best excursion, R)</span><input id="tf-mfe" type="number" step="any" value="${t.mfe_r ?? ''}" placeholder="e.g. 2.4" /></label>
        <label class="field"><span>Timeframe(s)</span><input id="tf-timeframes" value="${U.esc(t.timeframes || '')}" placeholder="H1 / M15" /></label>

        <label class="field"><span>Emotion before (required for prospective entry)</span><select id="tf-emo-before"><option value="">—</option>${list(EMOTIONS, t.emotion_before)}</select></label>
        <label class="field"><span>Emotion after</span><select id="tf-emo-after"><option value="">—</option>${list(EMOTIONS, t.emotion_after)}</select></label>
        <label class="field"><span>Confidence (1–5)</span><input id="tf-confidence" type="number" min="1" max="5" value="${t.confidence ?? ''}" /></label>
        <label class="field"><span>Rule adherence (1–5)</span><input id="tf-adherence" type="number" min="1" max="5" value="${t.adherence ?? ''}" /></label>

        <label class="field span2"><span>Mistakes</span><input id="tf-mistakes" list="tf-mistake-list" value="${U.esc(t.mistakes || '')}" placeholder="comma separated" />
          <datalist id="tf-mistake-list">${MISTAKES.map((m) => `<option value="${m}">`).join('')}</datalist>
        </label>
        <label class="field span2"><span>Tags</span><input id="tf-tags" list="tf-tag-list" value="${U.esc(t.tags || '')}" placeholder="comma separated" />
          <datalist id="tf-tag-list">${TAGS.map((m) => `<option value="${m}">`).join('')}</datalist>
        </label>

        <label class="field span4"><span>Thesis — why did you take this trade?</span><textarea id="tf-thesis" placeholder="Context, level, catalyst, what would invalidate it…">${U.esc(t.thesis || '')}</textarea></label>
        <label class="field span2"><span>Execution notes</span><textarea id="tf-notes" placeholder="Management decisions, partials, how you felt during…">${U.esc(t.execution_notes || '')}</textarea></label>
        <label class="field span2"><span>Lesson / review</span><textarea id="tf-lesson" placeholder="What will you repeat or never do again?">${U.esc(t.lesson || '')}</textarea></label>

      </div>
      <div class="sep"></div>
      <div class="row-between"><h3 style="margin:0">Pre-trade checklist</h3><label class="tiny muted row" style="gap:6px"><input type="checkbox" id="tf-apply-checklist" /> use playbook checklist</label></div>
      <div id="tf-checklist" class="grid g2" style="margin-top:8px"></div>
      <div class="sticky-note" style="margin-top:14px" id="tf-summary"></div>`;

    /* live computed readouts */
    const g = (id) => U.$('#tf-' + id, node);
    const spec = () => Store.instrumentBy(g('symbol').value);
    function updateSpec() {
      const i = spec();
      g('spec').textContent = i ? `${i.name} · ${Store.classLabels[i.asset_class]} · 1 ${Store.unitLabels[i.asset_class]} = ${U.price(i.value_per_point)} per 1.0 move` : 'Custom instrument — treated as 1 unit = 1 currency unit per point.';
    }
    function calc() {
      const i = spec();
      const vpp = i ? i.value_per_point : 1;
      const entry = Number(g('entry').value), stop = Number(g('stop').value), target = Number(g('target').value), size = Number(g('size').value);
      if (entry && stop && size) {
        const risk = Math.abs(entry - stop) * size * vpp;
        const r = Number(g('exit').value) ? null : undefined;
        g('risk').textContent = `Risk ${U.money(risk)} (${(Math.abs(entry - stop) / entry * 100).toFixed(2)}% move)`;
        const acc = Store.account();
        if (acc) {
          const pctOfAcc = (risk / (acc.starting_balance || 1)) * 100;
          const warn = pctOfAcc > acc.risk_per_trade_pct * 1.25;
          g('risk').innerHTML += ` · <span class="${warn ? 'warn' : 'muted'}">${pctOfAcc.toFixed(2)}% of balance</span>`;
        }
      } else g('risk').textContent = 'Enter entry, stop and size to see your risk.';
      if (entry && stop && target) {
        const rr = Math.abs(target - entry) / Math.abs(entry - stop);
        g('rr').innerHTML = `R:R <b>${rr.toFixed(2)}</b> · needs ${(100 / (1 + rr)).toFixed(1)}% win rate to break even`;
      } else g('rr').textContent = '';
      // live position size helper
      const acc = Store.account();
      if (acc && entry && stop) {
        const riskMoney = (acc.starting_balance || 10000) * ((acc.risk_per_trade_pct || 1) / 100);
        const unit = Math.abs(entry - stop) * (i ? i.value_per_point : 1);
        if (unit > 0) {
          let sz = riskMoney / unit;
          sz = ['forex', 'commodity', 'cfd_index'].includes(i && i.asset_class) ? Math.floor(sz * 100) / 100 : i && i.asset_class === 'crypto' ? Math.floor(sz * 1e6) / 1e6 : Math.floor(sz);
          g('calc').innerHTML = `For ${U.money(riskMoney)} risk (${acc.risk_per_trade_pct || 1}%) size = <b>${U.nf(sz, sz < 10 ? 4 : 2)}</b> ${i ? Store.unitLabels[i.asset_class] : ''} <button class="btn xs ghost" id="tf-use-size" type="button">use</button>`;
          const btn = U.$('#tf-use-size', node);
          if (btn) btn.addEventListener('click', () => { g('size').value = sz; calc(); });
        } else g('calc').textContent = '';
      } else g('calc').textContent = '';
      // summary line
      const exit = Number(g('exit').value);
      if (entry && exit && size) {
        const dir = g('direction').value === 'short' ? -1 : 1;
        const gross = dir * (exit - entry) * size * vpp;
        const net = gross - (Number(g('fees').value) || 0);
        const risk = Math.abs(entry - stop) * size * vpp;
        g('summary').innerHTML = `Gross <b class="${U.cls(gross)}">${U.moneySign(gross)}</b> · net <b class="${U.cls(net)}">${U.moneySign(net)}</b>
          ${risk > 0 ? ` · <b class="${U.cls(net)}">${U.signed(net / risk, 2)}R</b>` : ' · <span class="warn">no stop → R undefined</span>'}
          ${risk > 0 ? ` · risked ${U.money(risk)}` : ''}`;
      } else g('summary').innerHTML = '<span class="muted">Fill entry, exit and size to see the result before saving.</span>';
    }
    ['symbol', 'entry', 'stop', 'target', 'size', 'exit', 'fees'].forEach((id) => {
      const el = g(id); if (el) el.addEventListener('input', () => { if (id === 'symbol') updateSpec(); calc(); });
    });
    g('direction').addEventListener('change', calc);

    /* checklist */
    const applyChk = U.$('#tf-apply-checklist', node);
    const chkWrap = U.$('#tf-checklist', node);
    function renderChecklist(items) {
      chkWrap.innerHTML = items.map((label, i) => `<label class="rule"><input type="checkbox" data-chk="${i}" checked /> <span>${U.esc(label)}</span></label>`).join('') || '<div class="muted tiny">No checklist defined — add one in the playbook.</div>';
    }
    renderChecklist(Store.user.default_checklist || []);
    applyChk.addEventListener('change', () => {
      const s = Store.strategyById(g('strategy').value);
      if (applyChk.checked && s && s.checklist && s.checklist.length) renderChecklist(s.checklist);
      else renderChecklist(Store.user.default_checklist || []);
    });
    g('strategy').addEventListener('change', () => { if (applyChk.checked) { const s = Store.strategyById(g('strategy').value); renderChecklist(s && s.checklist && s.checklist.length ? s.checklist : (Store.user.default_checklist || [])); } });

    updateSpec(); calc();
    const confluenceDraft=isNew&&Views.confluences?Views.confluences.draft():null;
    if(confluenceDraft){const box=U.h('section',{class:'card',style:'margin-top:12px'});box.appendChild(U.h('h3',{text:'Entry confluences — actual market/setup reasons'}));box.appendChild(confluenceDraft.node);node.appendChild(box);}

    function collect() {
      const body = {
        record_only:U.$('#tf-record-only',node).checked,
        symbol: g('symbol').value.toUpperCase().trim(),
        direction: g('direction').value,
        status: g('status').value,
        account_id: Number(g('account').value),
        entry: g('entry').value, stop: g('stop').value, target: g('target').value,
        exit: g('status').value === 'open' ? null : g('exit').value,
        size: g('size').value, fees: g('fees').value,
        opened_at: g('opened').value ? new Date(g('opened').value).toISOString() : null,
        closed_at: g('status').value === 'closed' && g('closed').value ? new Date(g('closed').value).toISOString() : (g('status').value === 'closed' ? new Date().toISOString() : null),
        strategy_id: g('strategy').value || null,
        strategy_name: g('strategy').value ? (Store.strategyById(g('strategy').value) || {}).name : '',
        setup_grade: g('grade').value,
        entry_model: g('entrymodel').value || null, entry_tf: g('entrytf').value || null,
        entry_evidence: g('entrymodel').value === t.entry_model && g('entrytf').value === (t.entry_tf || '') ? t.entry_evidence || null : null,
        exit_reason: g('exitreason').value,
        planned_r: g('plannedr').value,
        mae_r: g('mae').value, mfe_r: g('mfe').value,
        timeframes: g('timeframes').value,
        emotion_before: g('emo-before').value, emotion_after: g('emo-after').value,
        confidence: g('confidence').value, adherence: g('adherence').value,
        mistakes: g('mistakes').value, tags: g('tags').value,
        thesis: g('thesis').value, execution_notes: g('notes').value, lesson: g('lesson').value,
        screenshot_url: t.screenshot_url || '', // Preserve unassigned legacy; role evidence is a separate saved-record API.
        rule_checks: U.$$('[data-chk]', chkWrap).map((c, i) => ({ label: c.parentElement.textContent.trim(), passed: c.checked })),
      };
      if(requiresAdmission() && !body.emotion_before.trim())throw new Error('Name your emotional state before a prospective entry. Already-executed/historical truth can remain incomplete.');
      if (body.status === 'closed' && !body.exit) throw new Error('A closed trade needs an exit price (or set the status to Open).');
      if (!body.symbol) throw new Error('Symbol is required.');
      if (!body.entry) throw new Error('Entry price is required.');
      if(confluenceDraft?.dirty())body.entry_confluences=confluenceDraft.value();
      return body;
    }
    /* --------------------------------------------- TradingView helpers */
    if (global.TV) {
      const tvStrip = U.h('div', { class: 'card', style: 'margin-top:12px;background:var(--bg-2)' });
      tvStrip.innerHTML = `<div class="row wrap gap-8" style="align-items:center">
          <span class="chip info">TradingView</span>
          <span class="small muted-2">Check the level on a real chart before you log it, or copy a one-line alert.</span>
          <span class="spacer"></span>
        </div>`;
      const tvRow = U.h('div', { class: 'row wrap gap-8', style: 'margin-top:8px' });
      const tvOpen = U.h('a', { class: 'btn xs', target: '_blank', rel: 'noopener', text: 'Open chart' });
      const tvCopy = U.h('button', { class: 'btn xs ghost', text: 'Copy plan (alert text)' });
      const tvBot = U.h('button', { class: 'btn xs ghost', text: 'Grade with the bot' });
      [tvOpen, tvCopy, tvBot].forEach((n) => tvRow.appendChild(n));
      tvStrip.appendChild(tvRow);
      node.appendChild(tvStrip);

      const symOf = () => String(U.$('#tf-symbol', node).value || '').trim().toUpperCase() || 'EURUSD';
      const numOf = (id) => { const v = U.$('#' + id, node).value; return v === '' ? null : Number(v); };
      const syncTv = () => { tvOpen.href = global.TV.link(symOf(), '15m'); };
      syncTv();
      const symInput = U.$('#tf-symbol', node);
      if (symInput) symInput.addEventListener('change', syncTv);
      tvCopy.addEventListener('click', async () => {
        const dir = (U.$('#tf-direction', node).value === 'short' ? 'SELL' : 'BUY');
        const entry = numOf('tf-entry'), stop = numOf('tf-stop'), target = numOf('tf-target');
        const fmt = (v) => (v == null ? '—' : String(Number(v.toFixed ? v.toFixed(6) : v)));
        const parts = [`${dir} ${symOf()}`, entry != null ? `entry ${fmt(entry)}` : null, stop != null ? `stop ${fmt(stop)}` : null, target != null ? `target ${fmt(target)}` : null].filter(Boolean);
        if (!requiresAdmission()) return global.TV.copy('JOURNAL / RESEARCH ONLY · '+parts.join(' · '),'Recorded plan');
        try {
          const out = await global.App.runGuarded(reason=>API.post('/bots/signals/save-plan',{
            symbol:symOf(),timeframe:g('entrytf').value || '15m',entry_tf:g('entrytf').value || null,account_id:Number(g('account').value),
            entry,stop,t1:target,...(reason?{override_reason:reason}:{})}),guard);
          if (out?.saved) global.TV.copy((out.permission?.state==='overridden'?'PERSONAL OVERRIDE RECORDED · ':'')+parts.join(' · '),'Plan');
        } catch(e) { toast(e.message,'err'); }
      });
      tvBot.addEventListener('click', () => { global.__botRequest = { symbol: symOf(), tf: '15m' }; App.go('bots'); });
    }

    let guard = null, guardRequest = 0;
    const requiresAdmission = () => g('status').value==='open' && !U.$('#tf-record-only',node).checked && (isNew || t.status!=='open');
    async function refreshGuard() {
      const request = ++guardRequest;
      const note = U.$('#tf-guardrail-state',node);
      g('emo-before').required=requiresAdmission();
      if (!requiresAdmission()) {
        guard = null; note.textContent = 'Journal record/correction only. It records what happened; it does not authorise a new entry.';
        if (opts.onPermissionChange) opts.onPermissionChange(null); return;
      }
      guard = {status:'loading'}; note.textContent = 'Checking personal guardrails — the server rechecks again on entry.';
      if (opts.onPermissionChange) opts.onPermissionChange(guard);
      try {
        const out = await API.get('/bots/guardrails',{account_id:g('account').value,entry_tf:g('entrytf').value || ''});
        if (request!==guardRequest) return;
        guard = out.daily;
        if (!guard?.permission) guard = {status:'unknown',message:'Guardrail response did not include verified permission.',permission:{allowed:false,can_override:false}};
      } catch(e) {
        if (request!==guardRequest) return;
        guard = e.data?.daily || {status:'unknown',message:e.message || 'Guardrails unavailable.',permission:{allowed:false,can_override:false}};
      }
      note.textContent = `${guard.message || guard.status} UTC rule day. ${guard.status==='stop' ? 'The grey entry button opens a required-reason override, not an immediate entry.' : ''}`;
      if (opts.onPermissionChange) opts.onPermissionChange(guard);
    }
    for (const field of [g('status'),g('account'),U.$('#tf-record-only',node)]) field.addEventListener('change',refreshGuard);
    g('entrytf').addEventListener('change',refreshGuard);
    U.$('#tf-guardrail-refresh',node).addEventListener('click',refreshGuard);
    refreshGuard();
    if(!isNew&&Views.execution)node.appendChild(Views.execution.card(t));
    if(Views.screenshots)node.appendChild(Views.screenshots.card(t));
    if(!isNew&&Views.confluences)node.appendChild(Views.confluences.card(t));
    return { node, collect, isNew, requiresAdmission, refreshGuard, guardrailState:()=>guard };
  };

  function localNow() { const d = new Date(); return d.toISOString(); }
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  Views.toLocalInput = toLocalInput;
  function toast(msg, kind) { if (global.App && global.App.toast) global.App.toast(msg, kind); }
})(window);
