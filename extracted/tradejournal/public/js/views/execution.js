/* M86/M92 — HUMAN retrospective execution review, separate from entry setup
 * quality, financial edits, core writing, routine and permission. */
(function(global){
  'use strict';
  const Views=global.Views=global.Views||{},U=global.U;let opened=0;
  const state=g=>g?.state==='reviewed'&&typeof g.score==='number'&&Number.isFinite(g.score)?`${g.grade} · ${g.score}/100`:'Unreviewed';
  const money=v=>typeof v==='number'&&Number.isFinite(v)?U.moneySign(v):'Unavailable';
  const context=()=>({account:global.Store.accountId,user:global.Store.user?.id});
  const same=c=>c.account===global.Store.accountId&&c.user===global.Store.user?.id;
  const X=Views.execution={state,
    card(trade){
      const g=trade.execution_review||{},node=U.h('div',{class:'card',style:'margin-top:12px'});
      node.innerHTML=`<div class="card-head"><h3>Execution self-review</h3><span class="chip muted" data-execution-state>${U.esc(state(g))}</span></div>
        <div class="small">Entry setup grade ${U.esc(trade.setup_grade||'unknown')} is separate from the execution review.</div>
        <div class="field-note">Retrospective human assessment, not broker-verified plan compliance or fresh emotional capture. It does not complete core writing/routine or alter risk/permission. Review the saved record — save financial edits first.</div>
        <div class="tiny muted">${U.esc(g.state==='reviewed'?'Reported '+g.execution_quality.replace(/_/g,' '):'Missing or stale execution evidence; no score is inferred from P&L.')}</div>`;
      if(trade.id&&trade.status==='closed')node.appendChild(U.h('button',{class:'btn sm',type:'button',dataset:{executionOpen:String(trade.id)},text:'Review saved execution',onclick:()=>X.open(Number(trade.id))}));
      else node.appendChild(U.h('div',{class:'tiny muted',text:'Record the actual close before reviewing execution.'}));return node;
    },
    async open(id){
      const before=context(),serial=++opened;let trade;
      try{trade=(await global.API.get('/trades/'+id)).trade;}catch(e){return global.App.toast(e.message||'Current record unavailable','err');}
      if(!same(before)||serial!==opened)return global.App.toast('Workspace/account changed while loading; reopen the current record.','err');
      if(trade.status!=='closed')return global.App.toast('Record the actual close before reviewing execution.','err');
      const body=U.h('div'),g=trade.execution_review||{},validStop=g.evidence?.stop_honoured;
      body.innerHTML=`<p class="small"><b>#${U.esc(trade.id)} ${U.esc(trade.symbol)}</b> · account #${U.esc(trade.account_id)}<br>Actual saved entry ${U.price(trade.entry)}, stop ${trade.stop==null?'unknown':U.price(trade.stop)}, exit ${U.price(trade.exit)}. Entry setup grade ${U.esc(trade.setup_grade||'unknown')}.</p>
        <p class="field-note">This is a retrospective HUMAN report, not broker-verified compliance or an actual fresh entry/exit emotion. It does not grant an entry, resize a setup, complete core writing/routine or remove any guard stop. Outcome is not execution quality. Changed saved records require a new current screen.</p>
        <label class="field"><span>How closely did you follow your plan? (your 1–5 self-rating)</span><select id="xr-adherence"><option value="">Unknown / not reviewed</option>${[1,2,3,4,5].map(a=>`<option value="${a}" ${trade.adherence===a?'selected':''}>${a} / 5</option>`).join('')}</select></label>
        <label class="field"><span>Did you honour the planned stop, including only moves the plan allowed?</span><select id="xr-stop"><option value="" ${validStop==null?'selected':''}>Unknown / not reviewed</option><option value="true" ${validStop===true?'selected':''}>Yes — my explicit report</option><option value="false" ${validStop===false?'selected':''}>No — I violated it</option></select></label>
        <div class="tiny muted">A moved stop may be protective. A gap/slippage-like result beyond1R is not by itself a violation. Missing answers remain unreviewed, not bad/good. Rubric: adherence1/2/3/4/5 →20/40/60/75/95 points, explicit stop violation capped39; P&L/R/RR/session/excursions add no points. This is an app display rubric, not an empirically validated edge.</div>`;
      return global.App.modal({title:'Review saved execution',body,wide:true,actions:[{label:'Cancel — no review recorded',ghost:true},{label:'Save execution self-review',primary:true,onClick:async close=>{
        if(!same(before))return global.App.toast('Workspace/account changed; reopen the current saved record.','err');
        const a=body.querySelector('#xr-adherence').value,stop=body.querySelector('#xr-stop').value;
        try{
          const out=await global.API.post('/trades/'+id+'/execution-review',{adherence:a===''?null:Number(a),stop_honoured:stop===''?null:stop==='true',record_revision:g.record_revision});
          global.Store.invalidate();close();global.App.toast(`Execution ${state(out.trade.execution_review)} recorded as your self-report; other stops/core writing unchanged.`,'ok');if(same(before))global.App.refresh();
        }catch(e){global.App.toast(e.message||'Execution review could not be recorded.','err');}
      }}]});
    },
    summaryCard(summary={}){
      const node=U.h('div',{class:'card',style:'margin-top:14px'});
      node.appendChild(U.h('div',{class:'card-head',html:'<h3>Best / worst by reported execution</h3>'}));
      node.appendChild(U.h('div',{class:'tiny muted',text:summary.note||'Execution summary unavailable; money is not an execution fallback.'}));
      for(const [key,label] of [['best','Best among reviewed'],['worst','Worst among reviewed']]){
        const value=summary[key],box=U.h('div',{style:'padding:8px',dataset:{[key==='best'?'executionBest':'executionWorst']:'true'}});
        box.appendChild(U.h('div',{class:'small',text:label+': '+(value?`${value.grade} · ${value.score}/100${value.tie_count>1?' · '+value.tie_count+' tied':''}`:'Unavailable / no reviewed execution')}));
        for(const t of value?.trades||[])box.appendChild(U.h('button',{class:'btn xs ghost',type:'button',text:`#${t.trade_id} ${t.symbol} — review`,onclick:()=>X.open(Number(t.trade_id))}));node.appendChild(box);
      }
      node.appendChild(U.h('div',{class:'tiny muted',text:`${summary.ranked??'unavailable'} ranked · ${summary.unranked??'unavailable'} unranked. Relative extremes, not a declaration that an unknown trade was worst or a good trade is profitable.`}));
      const p=summary.pnl||{};node.appendChild(U.h('div',{class:'small',text:`Money-only P&L extremes: max ${money(p.best)} / min ${money(p.worst)} · ${p.known??'unavailable'} known / ${p.unavailable??'unavailable'} unavailable. Separate from execution, no P&L tiebreak.`}));return node;
    },
    correctionCard(c,{onRefresh=null}={}){
      const node=U.h('div',{class:'card'}),rows=c.grades||[],value=v=>v==null?'Unavailable':U.esc(v);
      node.innerHTML=`<div class="card-head"><strong>Execution self-reviews</strong><span class="muted">human reports, not automatic entry setup grades</span></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Execution</th><th>Closed journals</th><th>Known outcomes</th><th>Win rate (descriptive)</th><th>Known net</th><th>Known R mean</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${U.esc(r.grade)}</td><td>${r.trades}</td><td>${r.known_outcomes} / ${r.trades}</td><td>${value(r.win_rate)}${r.win_rate==null?'':'%'}</td><td>${money(r.net)}</td><td>${value(r.expectancy_r)}${r.expectancy_r==null?'':'R'}</td></tr>`).join('')||'<tr><td colspan="6">No closed journals in this cohort.</td></tr>'}</tbody></table></div>
        <div class="tiny muted">Current self-reported execution is derived on read, including Unreviewed evidence. No score is manufactured from outcome, and these associations are not causal or sizing guidance.</div>
        <h4>Entry setup grades — separate stored history</h4><div class="tiny muted">Legacy source may be manual, model or earlier unproven auto-backfill. Values are preserved, not reclassified or promoted into execution.</div>
        <div class="small">${(c.setup_grades||[]).map(r=>U.esc(r.grade)+': '+r.trades).join(' · ')||'No stored entry setup grades.'}</div>`;
      node.appendChild(U.h('button',{class:'btn sm',dataset:{executionRefresh:'true'},text:'Refresh derived execution reviews — no backfill',onclick:async()=>{
        try{const id=global.Store.accountId,r=await global.API.post('/bots/correction/backfill',id==null?{}:{account_id:Number(id)});global.App.toast(`Checked ${r.evaluated}; ${r.reviewed} reviewed, ${r.unreviewed} unreviewed. Entry setup grades unchanged.`,'ok');if(onRefresh)onRefresh();}
        catch(e){global.App.toast(e.message,'err');}
      }}));return node;
    },
    feedbackCard(r){
      const node=U.h('div',{class:'bot-col'});node.appendChild(U.h('div',{class:'bot-plan',text:`${r.symbol} — execution ${state(r)}: ${r.summary}`}));
      node.appendChild(U.h('div',{class:'tiny muted',text:`Entry setup grade ${r.entry_setup_grade||'unknown'} is separate; retrospective self-report, not verified broker execution.`}));
      for(const n of r.notes||[])node.appendChild(U.h('div',{class:n.tone==='bad'?'bot-warn':n.tone==='good'?'bot-good':'bot-detail',text:n.text}));return node;
    },
  };
})(window);
