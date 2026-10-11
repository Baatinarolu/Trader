/* M64 persistent, account-scoped pre-market workflow. Server facts only: local
 * timer display is never a completion/admission proof. No verified mental/news
 * state, broker activity, allowed-hour enforcement or full Sanctuary claim. */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};
  const NAMES = {calendar:'Review the economic calendar',plan:'Review your own trading plan',charts:'Review charts, daily bias and zone alert',meditation:'15-minute meditation / breathwork',check_in:'Four morning readiness questions'};
  const truth = v => v === true ? 'Yes' : v === false ? 'No' : 'Unknown';
  const money = v => v === null || v === undefined ? 'Unavailable' : U.moneySign(v);
  const R = Views.routine = {
    state:null, slot:null, sequence:0, timer:null,
    async mount(slot) {
      this.slot=slot;this.state=null;this.sequence++;if(this.timer)clearInterval(this.timer);
      this.paint({state:'unknown',complete:null,message:'Checking this account’s routine…'});
      this.timer=setInterval(()=>this.refresh(),15000);await this.refresh();
    },
    async refresh() {
      if(!this.slot?.isConnected)return null;
      const account=Number(Store.accountId),seq=++this.sequence;
      if(this.state?.account_id!==account){this.state={state:'unknown',complete:null,message:'Checking the selected account…'};this.paint(this.state);}
      try {
        const d=await API.get('/routine',{account_id:account});
        if(seq!==this.sequence || account!==Number(Store.accountId))return null;
        if(!d.routine || d.routine.account_id!==account)throw new Error('Current account routine is unavailable.');
        this.state=d.routine;this.paint(d.routine);this.updateTimer();return d.routine;
      }catch(e){
        if(seq!==this.sequence || account!==Number(Store.accountId))return null;
        this.state={state:'unknown',complete:null,message:e.message};this.paint(this.state);this.updateTimer();return this.state;
      }
    },
    paint(state) {
      if(!this.slot)return;
      const finished=state.state==='complete'&&state.complete===true&&!!state.cycle;
      this.slot.hidden=finished;this.slot.className='routine-banner '+(state.state==='unknown'?'routine-unknown':'');
      if(finished){this.slot.replaceChildren();return;}
      const c=state.cycle;
      this.slot.innerHTML=`<div class="routine-banner-copy"><b>Pre-market routine ${state.state==='unknown'?'unavailable':state.state==='setup_required'?'needs a schedule':'unfinished'}</b>
        <div class="small">${U.esc(state.state==='unknown'?'No verified preparation state. An explanation cannot waive missing data.':state.message||'Complete every selected step before execution.')}</div>
        <div class="tiny muted">${c?`${state.steps?.length||0} / ${state.order?.length||5} steps · ${U.esc(c.cycle_date)} · ${U.esc(c.window_start)} ${U.esc(c.timezone)} · reset ${U.esc(c.reset_at)} · `:''}Human confirmations + server timing, not live mental/news/broker permission.</div></div>`;
      this.slot.appendChild(U.h('button',{class:'btn sm',id:'routine-continue',text:state.state==='unknown'?'Retry routine':state.state==='setup_required'?'Choose my window':'Continue routine',onclick:()=>state.state==='unknown'?this.refresh():this.open()}));
    },
    scheduleFields(account={}) {
      const box=U.h('fieldset',{class:'routine-schedule'});
      box.innerHTML=`<legend>My pre-market routine schedule</legend><div class="form-grid" style="grid-template-columns:1fr 1fr">
        <label class="field"><span>My selected local window start</span><input type="time" id="r-window" value="${U.esc(account.routine_window_start||'')}" /><div class="field-note">Leave blank if not selected. No broker/trader hour is invented.</div></label>
        <label class="field"><span>Explicit IANA timezone</span><input id="r-zone" value="${U.esc(account.routine_timezone||'')}" placeholder="e.g. Africa/Lagos" /></label>
        <label class="field"><span>Lead / reset before window (minutes)</span><input id="r-lead" type="number" min="1" max="180" step="1" value="${U.esc(account.routine_lead_minutes??60)}" /></label>
        <label class="field"><span>Selected step order</span><select id="r-order"><option value="ep17" ${account.routine_order!=='meditation_first'?'selected':''}>Ep17 — meditation last</option><option value="meditation_first" ${account.routine_order==='meditation_first'?'selected':''}>Meditation first — explicit variant</option></select></label>
      </div><div class="field-note">Ep17 suggests one-hour lead and calendar → plan → charts → meditation. The partially captured bonus says 30–45 minutes lead and meditation first; its remaining order is unknown. This variant keeps the remaining known Ep17 steps. Both end with four morning human checks, not the separate in-session gate. Active cycles freeze until their saved reset; edits apply after that, never reset other rules. DST: earlier repeated clock / shift a nonexistent clock forward by the gap.</div>`;
      return box;
    },
    collectSchedule(node) {
      const start=U.$('#r-window',node).value,zone=U.$('#r-zone',node).value.trim(),lead=Number(U.$('#r-lead',node).value);
      if(start&&!zone)throw new Error('Choose an explicit IANA timezone with your own window.');
      if(!Number.isInteger(lead)||lead<1||lead>180)throw new Error('Routine lead must be whole minutes from 1 to 180.');
      return {routine_window_start:start||null,routine_timezone:zone||null,routine_lead_minutes:lead,routine_order:U.$('#r-order',node).value};
    },
    openSchedule() {
      const account=Store.account(),body=U.h('div');if(!account)return;
      body.appendChild(this.scheduleFields(account));
      global.App.modal({title:'Select my routine schedule',body,wide:true,actions:[{label:'Cancel',ghost:true},{label:'Save schedule',primary:true,onClick:async close=>{
        try{const b=this.collectSchedule(body);await API.put('/accounts/'+account.id,b);await Store.load(true);close();await this.refresh();global.App.toast('Routine schedule saved. An active cycle keeps its original policy until reset.','ok');}
        catch(e){global.App.toast(e.message,'err');}
      }}]});
    },
    updateTimer() {
      const el=U.$('#routine-timer-clock');if(!el)return;
      const state=this.state,c=state?.cycle,match=state?.account_id===Number(el.dataset.account)&&c?.id===Number(el.dataset.cycle);
      if(!match){el.textContent='State/reset/account changed. Close and reopen the current routine.';const finish=U.$('#routine-timer-complete');if(finish)finish.disabled=true;return;}
      const ms=state.meditation?.elapsed_ms||0;
      el.textContent=`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')} / 15:00 · ${state.meditation?.state||'unavailable'} (server running time)`;
      const finish=U.$('#routine-timer-complete');if(finish)finish.disabled=ms<900000||!['running','paused'].includes(state.meditation?.state);
    },
    async open() {
      const state=await this.refresh();if(!state)return;
      if(state.state==='unknown'){global.App.toast('Routine data is unavailable; repair/retry, not a reason waiver.','err');return;}
      if(state.state==='setup_required'){this.openSchedule();return;}
      const account=state.account_id,cycle=state.cycle.id,step=state.next_step,body=U.h('div');
      body.innerHTML=`<div class="small"><b>${U.esc(state.cycle.cycle_date)}</b> · window ${U.esc(state.cycle.window_start)} ${U.esc(state.cycle.timezone)} · ${U.esc(state.cycle.step_order)} · reset ${U.esc(state.cycle.reset_at)}</div>
        <ol class="routine-step-list">${state.order.map(s=>`<li>${U.esc(NAMES[s])} <span class="chip ${state.steps.some(x=>x.step===s)?'pos':'warn'}">${state.steps.some(x=>x.step===s)?'Acknowledged':s===step?'Current':'Pending'}</span></li>`).join('')}</ol>
        <div class="tiny muted">Preparation only. Manual calendar review is not live-feed no-news clearance. Chart bias/alert is your report, not an OHLC/broker order. Morning questions are not reusable in-session emotional permission.</div>`;
      if(state.complete){body.appendChild(this.dayCard({workflow:{state:'complete',complete:true,completed_at:state.cycle.completed_at,completed_before_window:state.cycle.completed_before_window===1},prepared:null}));body.appendChild(U.h('button',{class:'btn sm',text:'Edit next-cycle schedule',onclick:()=>this.openSchedule()}));global.App.modal({title:'Routine complete',body,wide:true,actions:[{label:'Close',ghost:true}]});return;}
      const form=U.h('div',{class:'routine-step-form'});body.appendChild(form);
      if(step==='calendar')form.innerHTML='<label class="field"><span>What did you actually review in the external economic calendar?</span><textarea id="r-calendar-summary" rows="3" maxlength="4000"></textarea></label><label class="field"><span><input id="r-reviewed" type="checkbox" /> I reviewed the external calendar myself (human attestation, not machine clearance)</span></label>';
      if(step==='plan'){
        form.innerHTML=`<label class="field"><span>My owned plan / playbook</span><select id="r-plan"><option value="">Use my explicitly written manual plan</option>${Store.strategies.map(p=>`<option value="${p.id}">${U.esc(p.name)}</option>`).join('')}</select></label><pre id="r-plan-preview" class="routine-plan-preview"></pre><label class="field"><span>My manual plan (required if no owned playbook selected)</span><textarea id="r-plan-text" rows="4" maxlength="4000"></textarea></label><label class="field"><span><input id="r-reviewed" type="checkbox" /> I actually reviewed this plan; snapshot it at acknowledgment</span></label>`;
        U.$('#r-plan',form).addEventListener('change',()=>{const p=Store.strategyById(Number(U.$('#r-plan',form).value));U.$('#r-plan-preview',form).textContent=p?`${p.name}\nEntry: ${p.entry_rules}\nExit: ${p.exit_rules}\nRisk: ${p.risk_rules}`:'';});
      }
      if(step==='charts')form.innerHTML='<label class="field"><span>My human daily-bias report</span><select id="r-bias"><option value="">Choose explicitly</option><option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="neutral">Neutral / no directional edge</option></select></label><label class="field"><span>Higher-timeframe range / chart review</span><textarea id="r-range" rows="3" maxlength="4000"></textarea></label><label class="field"><span>My zone alert report</span><select id="r-alert"><option value="">Choose explicitly</option><option value="set">I set the relevant alert</option><option value="not_applicable">Not applicable — explain why</option></select></label><label class="field"><span>Alert location / not-applicable reason (human report)</span><textarea id="r-alert-note" rows="2" maxlength="4000"></textarea></label><label class="field"><span><input id="r-reviewed" type="checkbox" /> I reviewed the charts/range and reported my bias/alert</span></label>';
      if(step==='check_in')form.innerHTML=`<div class="small">Answer all FOUR questions explicitly. A “No” is retained but leaves the routine unfinished. Reassess after regulating; these are morning human reports, not a live mental-state assessment.</div>${[['calm','Am I calm?'],['clear','Am I clear?'],['following_plan','Am I following my plan?'],['would_take_if_up_big','Would I take this trade if I were already up big?']].map(([k,label])=>`<label class="field"><span>${label}</span><select id="r-${k}"><option value="">Choose explicitly</option><option value="true">Yes</option><option value="false">No</option></select></label>`).join('')}`;
      const guarded=()=>{if(Number(Store.accountId)!==account||this.state?.cycle?.id!==cycle)throw new Error('The account or cycle changed. Close and reopen the current routine.');};
      const actions=[{label:'Close (unfinished)',ghost:true}];
      if(step==='meditation'){
        form.innerHTML=`<div id="routine-timer-clock" class="routine-timer-clock" data-account="${account}" data-cycle="${cycle}" role="status"></div><p class="small muted">Fifteen minutes of server-timed running time, including explicit start/resume and excluding pause. A running timer survives restart. It does not verify actual meditation, breathing, focus or mental state. This is the routine subset, not the full Sanctuary toolkit.</p><div class="row gap-8" id="r-timer-actions"></div>`;
        const buttons=U.$('#r-timer-actions',form),timerState=state.meditation.state,allowed=timerState==='not_started'?['start']:timerState==='running'?['pause']:['resume'];
        for(const action of [...allowed,'complete'])buttons.appendChild(U.h('button',{class:'btn sm',id:action==='complete'?'routine-timer-complete':'routine-timer-'+action,text:action==='complete'?'Acknowledge 15-minute step':action[0].toUpperCase()+action.slice(1),onclick:async()=>{try{guarded();await API.post('/routine/meditation',{account_id:account,cycle_id:cycle,action});closeDialog.close();await this.open();}catch(e){global.App.toast(e.message,'err');}}}));
      }else actions.push({label:'Save step & continue',primary:true,onClick:async close=>{
        try{
          guarded();let b={account_id:account,cycle_id:cycle,step};
          if(step==='calendar')b={...b,reviewed:U.$('#r-reviewed',form).checked,method:'manual_external',summary:U.$('#r-calendar-summary',form).value};
          if(step==='plan')b={...b,reviewed:U.$('#r-reviewed',form).checked,...(U.$('#r-plan',form).value?{plan_id:Number(U.$('#r-plan',form).value)}:{plan_text:U.$('#r-plan-text',form).value})};
          if(step==='charts')b={...b,reviewed:U.$('#r-reviewed',form).checked,daily_bias:U.$('#r-bias',form).value,htf_range:U.$('#r-range',form).value,alert_status:U.$('#r-alert',form).value,alert_note:U.$('#r-alert-note',form).value};
          if(step==='check_in')for(const k of ['calm','clear','following_plan','would_take_if_up_big']){const v=U.$('#r-'+k,form).value;if(!v)throw new Error('Answer every morning question explicitly.');b[k]=v==='true';}
          await API.post('/routine/step',b);close();await this.open();Store.invalidate();
        }catch(e){global.App.toast(e.message,'err');}
      }});
      const closeDialog=global.App.modal({title:NAMES[step],body,wide:true,actions});this.updateTimer();
    },
    dayCard(fact={}) {
      const node=U.h('div',{class:'routine-day-card'}),w=fact.workflow||{};
      node.innerHTML=`<h3>Pre-market routine facts</h3><div class="small">Workflow completed: <b>${truth(w.complete)}</b> · On time before selected window: <b>${truth(w.completed_before_window)}</b> · Prepared at first observed entry / deadline: <b>${truth(fact.prepared)}</b></div>
        <div class="tiny muted">${U.esc(w.completed_at||'No verified workflow completion time')} · ${U.esc(fact.cohort_basis||'unrecorded')} ${fact.first_admission?.recorded_at?'· first entry capture '+U.esc(fact.first_admission.recorded_at):''}</div>
        <div class="tiny muted">Late completion does not rewrite earlier admissions. Daily self-report: ${truth(fact.self_report?.done)} · ${U.esc(fact.self_report?.basis||'unrecorded')} · ${U.esc(fact.self_report?.recorded_at||'no capture')}. Human morning preparation, not reusable execution/mental/news permission.</div>`;
      return node;
    },
    reportCard(report={}) {
      const node=U.h('div',{class:'card routine-report'});
      node.innerHTML=`<div class="card-head"><h3>Routine vs daily realised P&L — descriptive only</h3></div><div class="tiny muted">UTC close-day, trading days only. Completed/prepared uses frozen first-entry evidence when available, otherwise deadline workflow, otherwise labelled self-report. Unknown is not skipped; missing P&L is not zero. No causation or risk/strategy tuning.</div>
        ${report.buckets?`<div class="table-wrap"><table><thead><tr><th>Preparation group</th><th>Days</th><th>Known / unavailable P&L days</th><th>Net</th><th>Mean daily P&L</th></tr></thead><tbody>${report.buckets.map(b=>`<tr><td>${U.esc(b.status)}</td><td>${b.days}</td><td>${b.known_pnl_days} / ${b.unavailable_pnl_days}</td><td>${money(b.net_pnl)}</td><td>${money(b.mean_daily_pnl)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Routine outcome report unavailable — no inferred correlation.</div>'}
        ${(report.days||[]).length?`<details><summary>Inspect day and evidence basis</summary>${report.days.map(d=>`<div class="tiny" style="padding:6px">${U.esc(d.date)} · ${U.esc(d.status)} · ${money(d.realised_pnl)} · ${U.esc(d.cohort_basis||'unrecorded')} · workflow ${truth(d.pre_market?.workflow?.complete)}</div>`).join('')}</details>`:''}<p class="tiny muted">${U.esc(report.note||'Unknown or small samples are not proof of benefit. Overnight trades may close on another day; this is not per-trade attribution.')}</p>`;
      return node;
    },
  };
})(window);
