/* views/journal.js — daily review notebook + goals */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  Views.journal = {
    title: 'Journal',
    async render(root) {
      const processContext=Views.processOutcomes?.context();
      const [entries, goals,outcomes] = await Promise.all([API.get('/journal',{account_id:Store.accountId}), API.get('/goals'),API.get('/routine/report',{account_id:Store.accountId}).catch(()=>({report:{state:'unknown'}}))]);
      if(Views.processOutcomes&&!Views.processOutcomes.same(processContext))return;
      root.innerHTML = '';
      const layout = U.h('div', { class: 'grid g-2-1' });
      root.appendChild(layout);

      const listCol = U.h('div');
      const head = U.h('div', { class: 'card', style: 'margin-bottom:14px' });
      head.innerHTML = `<div class="row-between">
          <div><h2 style="margin:0">Daily reviews</h2><div class="muted small">${entries.entries.length} entries — the habit that turns a log into a system.</div></div>
          <button class="btn primary" id="j-new">+ Today's review</button></div>`;
      listCol.appendChild(head);
      if(Views.behaviorDays)listCol.appendChild(Views.behaviorDays.card(entries.behavior_days));
      if(Views.processOutcomes)listCol.appendChild(Views.processOutcomes.card(entries.process_review));
      const list = U.h('div', { class: 'card' });
      if (!entries.entries.length) {
        list.innerHTML = '<div class="empty">No reviews yet. Write one at the end of every session — three sentences is enough to start.</div>';
      } else {
        list.innerHTML = entries.entries.map((e) => `
          <div class="news-item">
            <div class="row-between">
              <div>
                <b class="mono">${U.esc(e.entry_date)}</b>
                ${e.market_bias ? `<span class="chip" style="margin-left:6px">${U.esc(e.market_bias)}</span>` : ''}
                ${e.mood ? `<span class="chip" style="margin-left:4px">mood ${e.mood}/5</span>` : ''}
                ${e.energy ? `<span class="chip" style="margin-left:4px">energy ${e.energy}/5</span>` : ''}
                ${e.screen_time_minutes ? `<span class="chip" style="margin-left:4px">${e.screen_time_minutes}m screen</span>` : ''}
              </div>
              <div class="row" style="gap:6px">
                <button class="btn xs ghost" data-open="${U.esc(e.entry_date)}">Open</button>
                <button class="btn xs ghost danger" data-del="${e.id}">Delete</button>
              </div>
            </div>
            ${e.focus ? `<div class="small" style="margin-top:6px"><span class="muted">Focus:</span> ${U.esc(e.focus)}</div>` : ''}
            ${e.review ? `<div class="small muted-2" style="margin-top:4px">${U.esc(e.review).slice(0, 260)}</div>` : ''}
            ${e.lessons ? `<div class="small" style="margin-top:6px;color:#ffd99b">Lesson: ${U.esc(e.lessons).slice(0, 220)}</div>` : ''}
          </div>`).join('');
      }
      listCol.appendChild(list);
      const counts=U.h('div',{class:'card',style:'margin-top:14px'});
      counts.innerHTML=`<div class="card-head"><h3>Core journal completeness (UTC close day)</h3></div><div class="tiny muted">Explicit closed-trade writing, not notebook text/P&L/grade or all course fields. Unknown close dates need truthful repair.</div>${(entries.journal_days||[]).map(d=>`<div class="row-between" style="padding:8px"><span>${U.esc(d.date)} · ${d.journaled} / ${d.total} journaled · ${U.esc(d.state)}</span>${/^\d{4}-\d{2}-\d{2}$/.test(d.date)?`<button class="btn xs ghost" data-day-journal="${U.esc(d.date)}">Review trades</button>`:''}</div>`).join('')||'<div class="empty">No closed trade journals yet; 0/0 is not a completed day.</div>'}`;
      counts.querySelectorAll('[data-day-journal]').forEach(b=>b.addEventListener('click',()=>openEditor(b.dataset.dayJournal,root)));listCol.appendChild(counts);
      const captured = U.h('div', {class:'card',style:'margin-top:14px'});
      captured.innerHTML = `<div class="card-head"><h3>Captured guardrail days (UTC)</h3></div>
        ${(entries.guardrail_days || []).map(d=>`<div class="row-between" style="padding:8px"><span class="mono">${U.esc(d.rule_date)} · ${d.events} events · ${d.overrides || 0} overrides</span><button class="btn xs ghost" data-open="${U.esc(d.rule_date)}">Review rules & reasons</button></div>`).join('') || '<div class="empty">No stops captured yet. Older violations are not inferred or backfilled.</div>'}`;
      captured.addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b)openEditor(b.dataset.open,root);});
      listCol.appendChild(captured);
      if(Views.routine){
        const routineDays=U.h('div',{class:'card',style:'margin-top:14px'});
        routineDays.innerHTML=`<div class="card-head"><h3>Recorded pre-market routine days (UTC)</h3></div><div class="tiny muted">Actual workflow and separately labelled self-reports, not inferred older completion. Shared daily notes do not merge independent account routine facts.</div>${(entries.pre_market_days||[]).map(d=>`<div class="row-between" style="padding:8px"><span>${U.esc(d.date)} · workflow ${d.workflow?.complete===true?'complete':d.workflow?.complete===false?'incomplete':'unknown'} · prepared ${d.prepared===true?'yes':d.prepared===false?'no':'unknown'} · ${U.esc(d.cohort_basis||d.basis)}</span><button class="btn xs ghost" data-routine-day="${U.esc(d.date)}">Review routine fact</button></div>`).join('')||'<div class="empty">No observed routine days; missing history is unknown, not skipped.</div>'}`;
        routineDays.querySelectorAll('[data-routine-day]').forEach(b=>b.addEventListener('click',()=>openEditor(b.dataset.routineDay,root)));listCol.appendChild(routineDays);listCol.appendChild(Views.routine.reportCard(outcomes.report));
      }
      layout.appendChild(listCol);

      /* goals column */
      const goalsCol = U.h('div', { class: 'grid', style: 'align-content:start' });
      const gc = U.h('div', { class: 'card' });
      gc.innerHTML = `<div class="card-head"><h3>Targets in progress</h3></div>
        ${goals.goals.length ? goals.goals.map((g) => {
          const bar = Math.min(100, g.progress);
          const good = g.metric === 'net_pnl' ? g.actual >= 0 : true;
          return `<div style="margin-bottom:14px">
            <div class="row-between"><div class="small">${U.esc(g.title)}</div><div class="tiny mono ${good ? 'pos' : 'neg'}">${g.metric === 'net_pnl' ? U.moneySign(g.actual) : U.num(g.actual, 2)} / ${g.metric === 'net_pnl' ? U.money(g.target) : U.num(g.target, 2)}</div></div>
            <div class="bar-track" style="margin-top:6px"><i class="${g.progress >= 100 ? 'pos' : ''}" style="width:${bar}%"></i></div>
            <div class="tiny muted" style="margin-top:3px">${U.pct(g.progress, 0)} of target · ${U.esc(g.period)} · ${U.esc(g.metric)}</div>
          </div>`;
        }).join('') : '<div class="empty">No targets set. Discipline needs a scoreboard.</div>'}
        <button class="btn sm block ghost" id="g-new">+ Add a target</button>`;
      goalsCol.appendChild(gc);

      const prompt = U.h('div', { class: 'card' });
      prompt.innerHTML = `<div class="card-head"><h3>Review prompts</h3></div>
        <div class="small muted-2">
          <p><b>1.</b> Did I trade my plan, or did I trade my mood?</p>
          <p><b>2.</b> Which single decision cost me the most money today?</p>
          <p><b>3.</b> What did the market teach me that I will write down for tomorrow?</p>
          <p><b>4.</b> Am I still within my risk rules — risk per trade, daily loss, trade count?</p>
          <p><b>5.</b> If today repeated for a month, would I still be profitable?</p>
        </div>`;
      goalsCol.appendChild(prompt);
      layout.appendChild(goalsCol);

      list.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.open) return openEditor(b.dataset.open, root);
        if (b.dataset.del) {
          if (!confirm('Delete this journal entry?')) return;
          await API.del('/journal/' + b.dataset.del); global.App.refresh();
        }
      });
      U.$('#j-new', head).addEventListener('click', () => openEditor(Store.isoToday(), root));
      U.$('#g-new', gc).addEventListener('click', () => goalDialog(root));
      return root;
    },
  };

  function goalDialog(root) {
    const body = U.h('div');
    body.innerHTML = `<div class="form-grid" style="grid-template-columns:1fr 1fr">
      <label class="field span2"><span>Target name</span><input id="g-title" placeholder="e.g. Finish the quarter green" /></label>
      <label class="field"><span>Metric</span><select id="g-metric">
        <option value="net_pnl">Net P&L ($)</option><option value="expectancy_r">Expectancy (R)</option>
        <option value="win_rate">Win rate (%)</option><option value="profit_factor">Profit factor</option>
        <option value="adherence">Rule adherence (1–5)</option><option value="trades">Number of trades</option></select></label>
      <label class="field"><span>Target value</span><input id="g-target" type="number" step="any" /></label>
      <label class="field"><span>Period</span><select id="g-period"><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option></select></label>
    </div>`;
    global.App.modal({
      title: 'Add a target', body,
      actions: [{ label: 'Cancel', ghost: true }, {
        label: 'Save target', primary: true, onClick: async (close) => {
          await API.post('/goals', {
            title: U.$('#g-title', body).value || 'Target', metric: U.$('#g-metric', body).value,
            target: U.$('#g-target', body).value, period: U.$('#g-period', body).value,
          });
          close(); global.App.refresh(); global.App.toast('Target saved', 'ok');
        },
      }],
    });
  }

  /** Historical snapshots, not a rerun against today's changed settings. */
  Views.guardrailHistory = function(events = []) {
    const node = U.h('div',{class:'card',style:'margin-top:14px'});
    node.innerHTML = `<div class="card-head"><h3>Guardrail history — UTC rule day</h3></div>
      <div class="tiny muted">Captured from server checks since this feature was installed. Research/imports and journal corrections are not execution permission. Observed stops/blocked requests are not traded violations. Recording-time flags do not infer what happened at a historical entry.</div>
      ${events.length ? `<div class="table-wrap"><table><thead><tr><th>Captured at (UTC)</th><th>Account / action</th><th>Observed stop/rule(s)</th><th>Reason / decision</th></tr></thead><tbody>
        ${events.map(ev=>`<tr><td class="mono tiny">${U.esc(ev.observed_at)}</td>
          <td>${U.esc(ev.account_id == null ? 'account removed' : '#'+ev.account_id)} · ${U.esc(ev.action)}<br><span class="tiny muted">${U.esc(ev.kind)}${ev.entity_type && ev.entity_id ? ' · '+U.esc(ev.entity_type)+' #'+U.esc(ev.entity_id) : ''}</span></td>
          <td class="tiny">${(ev.snapshot?.breaches || []).map(b=>`<b>${U.esc(b.rule)}</b>: ${U.esc(b.detail)}`).join('<br>') || U.esc(ev.snapshot?.message || 'No known stop in the captured snapshot.')}</td>
          <td class="tiny">${ev.reason ? `<b>Override reason:</b> ${U.esc(ev.reason)}` : ev.kind==='journal_record' ? 'Recording-time observation only; no execution permission.' : 'No override taken.'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No captured guardrail events for this day. This does not prove that older trades followed the rules.</div>'}`;
    return node;
  };

  let processDaySerial=0;
  Views.openProcessDay=async(date,accountId)=>{if(Number(Store.accountId)!==Number(accountId))return global.App.toast('Select the original account before reviewing its day.','err');return openEditor(date,null);};
  async function openEditor(dateISO, root) {
    const serial=++processDaySerial,accountId=Store.accountId,userId=Store.user?.id,token=API.getToken();
    const sameContext=()=>serial===processDaySerial&&accountId===Store.accountId&&userId===Store.user?.id&&token===API.getToken();
    let day;try{day=await API.get('/journal/' + dateISO,{account_id:accountId});}catch(e){if(sameContext())global.App.toast(e.message||'Day process/financial review unavailable; retry without inferring completion.','err');return;}
    if(!sameContext())return global.App.toast('Workspace/account changed while loading the day; reopen it.','err');
    const e = day.entry || {};
    const trades = day.trades || [];
    const pnl=day.execution_summary?.pnl?.realised_total??null,totalR=day.execution_summary?.pnl?.recorded_total_r??null;
    const body = U.h('div');
    body.innerHTML = `
      <div class="small">Core journal ${day.journal_summary?.journaled ?? 'unavailable'} / ${day.journal_summary?.total ?? 'unavailable'} · ${U.esc(day.journal_summary?.state || 'unavailable')} — notebook review and trading P&L are separate.</div>
      <div class="grid g4" style="margin-bottom:14px">
        <div class="kpi"><div class="k-label">Date</div><div class="k-value" style="font-size:1rem">${U.esc(dateISO)}</div></div>
        <div class="kpi ${pnl==null?'':pnl >= 0 ? 'pos' : 'neg'}"><div class="k-label">UTC close-day realised P&L</div><div class="k-value ${pnl==null?'':U.cls(pnl)}" data-day-realised-pnl>${pnl==null?'Unavailable':U.moneySign(pnl)}</div></div>
        <div class="kpi"><div class="k-label">Records (incl. open)</div><div class="k-value">${trades.length}</div></div>
        <div class="kpi"><div class="k-label">Recorded realised R</div><div class="k-value" data-day-total-r>${totalR==null?'Unavailable':U.signed(totalR,2)+'R'}</div></div>
      </div>
      <div class="form-grid" style="grid-template-columns:repeat(3,1fr)">
        <label class="field"><span>Market bias</span><select id="j-bias">${['', 'Bullish', 'Bearish', 'Neutral', 'Choppy'].map((v) => `<option ${e.market_bias === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Mood (1–5)</span><input id="j-mood" type="number" min="1" max="5" value="${e.mood ?? ''}" /></label>
        <label class="field"><span>Energy (1–5)</span><input id="j-energy" type="number" min="1" max="5" value="${e.energy ?? ''}" /></label>
      </div>
      <label class="field"><span>Focus for the session</span><input id="j-focus" value="${U.esc(e.focus)}" /></label>
      <label class="field"><span>Plan (written before the session)</span><textarea id="j-plan">${U.esc(e.plan)}</textarea></label>
      <label class="field"><span>Review (what actually happened)</span><textarea id="j-review">${U.esc(e.review)}</textarea></label>
      <label class="field"><span>Lessons</span><textarea id="j-lessons">${U.esc(e.lessons)}</textarea></label>
      <label class="field"><span>Tomorrow</span><textarea id="j-tomorrow">${U.esc(e.tomorrow)}</textarea></label>
      <label class="field"><span>Screen time (minutes)</span><input id="j-screen" type="number" value="${e.screen_time_minutes ?? ''}" /></label>
      ${trades.length ? `<div class="sep"></div><h3>Trades this day</h3><table><thead><tr><th>Time</th><th>Symbol</th><th>R</th><th>P&L</th><th>Core journal</th><th>Visual evidence</th><th>Note</th></tr></thead><tbody>
        ${trades.map((t) => `<tr><td class="mono tiny">${U.dt(t.opened_at, { day: undefined, month: undefined })}</td><td>${U.esc(t.symbol)}</td>
        <td class="num ${U.rClass(t.r_multiple)}">${U.R(t.r_multiple)}</td><td class="num ${U.cls(t.net_pnl)}">${U.moneySign(t.net_pnl)}</td>
        <td class="tiny">${t.journal?.complete?'Journaled':'Journal missing'}${t.status==='closed'?` <button class="btn xs ghost" data-day-trade-journal="${t.id}">Journal</button>`:''}</td>
        <td class="tiny"><button class="btn xs ghost" type="button" data-day-emotions="${t.id}">Emotion timing</button> <button class="btn xs ghost" type="button" data-day-confluences="${t.id}">Entry reasons</button> <button class="btn xs ghost" data-day-screenshots="${t.id}">HTF / MTF / LTF</button></td>
        <td class="tiny muted">${U.esc((t.lesson || t.notes || '').slice(0, 80))}</td></tr>`).join('')}</tbody></table>` : ''}`;
    if(Views.behaviorDays)body.prepend(Views.behaviorDays.card(day.behavior_days));
    if(Views.processOutcomes)body.prepend(Views.processOutcomes.card(day.process_review));
    if(Views.execution)body.appendChild(Views.execution.summaryCard(day.execution_summary||{}));
    let routineDirty=false;
    if(Views.routine){
      body.prepend(Views.routine.dayCard(day.pre_market||{}));
      const flag=day.pre_market?.self_report?.done??(day.pre_market?.basis==='self_reported'?day.pre_market.done:null),selection=U.h('label',{class:'field'});
      selection.innerHTML=`<span>Daily routine completion — explicit self-report (never workflow permission)</span><select id="j-pre-market"><option value="" ${flag===null?'selected':''}>Unknown / not recorded</option><option value="true" ${flag===true?'selected':''}>Completed — my self-report</option><option value="false" ${flag===false?'selected':''}>Not completed — my self-report</option></select><div class="field-note">Current account only, separate from the shared daily note and actual ordered/timed workflow. Unrelated note edits preserve this flag/source/time. Retrospective self-report cannot rewrite first-entry/on-time evidence.</div>`;
      U.$('#j-pre-market',selection).addEventListener('change',()=>{routineDirty=true;});body.prepend(selection);
    }
    body.querySelectorAll('[data-day-emotions]').forEach(b=>b.addEventListener('click',()=>Views.emotions?Views.emotions.open(Number(b.dataset.dayEmotions)):global.App.toast('Emotion timing unavailable.','err')));
    body.querySelectorAll('[data-day-confluences]').forEach(b=>b.addEventListener('click',()=>Views.confluences?Views.confluences.open(Number(b.dataset.dayConfluences)):global.App.toast('Entry reasons UI unavailable.','err')));
    body.querySelectorAll('[data-day-screenshots]').forEach(b=>b.addEventListener('click',()=>Views.screenshots?Views.screenshots.open(Number(b.dataset.dayScreenshots)):global.App.toast('Visual evidence UI unavailable.','err')));
    body.querySelectorAll('[data-day-trade-journal]').forEach(b=>b.addEventListener('click',()=>Views.openJournalReview(Number(b.dataset.dayTradeJournal))));
    if(Views.lossWritingCard)body.appendChild(Views.lossWritingCard({pending:(day.loss_reflections||[]).filter(r=>r.completed_at===null),pending_count:(day.loss_reflections||[]).filter(r=>r.completed_at===null).length}));
    body.appendChild(Views.guardrailHistory(day.guardrail_events || []));
    global.App.modal({
      title: 'Day review — ' + dateISO, body, wide: true,
      actions: [{ label: 'Cancel', ghost: true }, {
        label: 'Save review', primary: true, onClick: async (close) => {
          if(!sameContext())return global.App.toast('Workspace/account changed; reopen this day before saving.','err');
          const payload = {
            entry_date: dateISO,account_id:accountId,
            market_bias: U.$('#j-bias', body).value, mood: U.$('#j-mood', body).value || null, energy: U.$('#j-energy', body).value || null,
            focus: U.$('#j-focus', body).value, plan: U.$('#j-plan', body).value, review: U.$('#j-review', body).value,
            lessons: U.$('#j-lessons', body).value, tomorrow: U.$('#j-tomorrow', body).value,
            screen_time_minutes: U.$('#j-screen', body).value || null,
          };
          if(routineDirty){const v=U.$('#j-pre-market',body).value;payload.pre_market_done=v===''?null:v==='true';}
          try { await API.post('/journal', payload); close(); global.App.toast('Review saved', 'ok'); global.App.refresh(); }
          catch (err) { global.App.toast(err.message, 'err'); }
        },
      }],
    });
  }
})(window);
