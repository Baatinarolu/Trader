/* M13/M65 review periods: the weekly/quarterly buckets and which periods have a saved review artifact.
   Read-only. A period with no artifact is `not_recorded`, never "missed" and never a clean record. */
(function(global){
 'use strict';const Views=global.Views=global.Views||{},U=global.U,context=()=>({user:global.Store.user?.id,account:global.Store.accountId,token:global.API.getToken()}),same=c=>!!c&&c.user===global.Store.user?.id&&c.account===global.Store.accountId&&c.token===global.API.getToken();
 const money=v=>v===null||v===undefined?'no recorded amount':(v>=0?'+':'')+U.money?U.money(v):String(v);
 const STATE_TEXT={completed:'review saved',draft:'draft only, not completed',imported_unverified:'imported copy, unverified',unavailable:'saved artifact could not be read',not_recorded:'no artifact recorded'};
 const num=(v,d=2)=>v===null||v===undefined?'—':U.num?U.num(v,d):String(v);
 const pct=v=>v===null||v===undefined?'—':U.pct?U.pct(v,1):String(v)+'%';
 Views.reviewPeriods={context,same,
  card(report){const node=U.h('section',{class:'card',style:'margin-top:14px',dataset:{reviewPeriods:'true'}}),expected=context();node.appendChild(U.h('h3',{text:'Review periods · weekly and quarterly'}));
   node.appendChild(U.h('p',{class:'field-note',text:'The weekly and quarterly buckets below are bucketed on the REVIEW calendar (UTC close-day, Monday-start weeks, calendar quarters), which is the calendar a period review is addressed by. The Analytics Daily and Monthly series use your journal timezone instead: two different rulers, both labelled, and nothing here moves a trade from one into the other. Each period is listed with its own recorded closes and with the artifact the app has saved for that exact period. A period with no artifact is "no artifact recorded" \u2014 that is not evidence that you did not review it somewhere else. A saved artifact is an acknowledgement that a review was written and stored, not proof that the period was reviewed well, that its numbers are complete, or that any rule changed. The app does not compare reviewed periods against unreviewed ones.'}));
   if(!report||report.state!=='available'){node.appendChild(U.h('p',{class:'sticky-note warn',text:'Saved review artifacts unavailable. Which periods were reviewed is UNKNOWN here \u2014 this is not a period with no review and not a clean record.'}));return node;}
   for(const kind of ['week','quarter']){const k=(report.kinds||{})[kind];if(!k)continue;
    const block=U.h('div',{dataset:{reviewPeriodsKind:kind}});
    block.appendChild(U.h('h4',{text:(kind==='week'?'Weekly':'Quarterly')+' review record'}));
    block.appendChild(U.h('p',{class:'small',dataset:{reviewPeriodsTotals:kind},text:`${k.completed} completed \u00b7 ${k.draft} draft only \u00b7 ${k.imported_unverified} imported copy (unverified) \u00b7 ${k.unavailable_rows} unreadable \u00b7 ${k.not_recorded} no artifact recorded (of ${k.periods_scanned} periods scanned${k.open_periods?`, ${k.open_periods} still open`:''}).`}));
    if(k.artifacts_outside_scope)block.appendChild(U.h('p',{class:'small warn',text:`${k.artifacts_outside_scope} saved ${kind==='week'?'weekly':'quarterly'} artifact${k.artifacts_outside_scope===1?' carries':'s carry'} a period start this window does not scan; counted here rather than dropped, and not included in the figures above.`}));
    for(const p of k.periods){const bits=[p.trades?`${p.trades} close${p.trades===1?'':'s'} over ${p.days} day${p.days===1?'':'s'}`:'no closed trade recorded',p.pnl===null?'no recorded amount':(p.pnl>=0?'+':'')+(U.money?U.money(p.pnl):String(p.pnl)),p.r===null?'no recorded R':`${num(p.r,2)}R`,p.win_rate===null?'win rate unavailable':pct(p.win_rate)+' win',p.unknown_net?`${p.unknown_net} close${p.unknown_net===1?'':'s'} with no recorded amount`:null,p.unknown_r?`${p.unknown_r} with no recorded R`:null].filter(Boolean);
     const line=U.h('p',{class:'tiny '+(p.review_state==='completed'?'':'muted'),dataset:{reviewPeriodsPeriod:p.start,reviewPeriodsState:p.review_state}});
     line.textContent=`${p.label} \u00b7 ${bits.join(' \u00b7 ')} \u00b7 review: ${STATE_TEXT[p.review_state]||p.review_state}${p.review_recorded_at?' ('+p.review_recorded_at+')':''}${p.review_focus?' \u00b7 focus: '+p.review_focus:''}${p.finished?'':' \u00b7 still open'}`;
     block.appendChild(line);}
    block.appendChild(U.h('p',{class:'tiny muted',text:k.calendar+' '+k.not_recorded_meaning}));
    node.appendChild(block);}
   node.appendChild(U.h('p',{class:'tiny muted',text:(report.basis||'')+' '+(report.outcome_note||'')}));
   node.appendChild(U.h('button',{class:'btn sm ghost',type:'button',dataset:{reviewPeriodsRefresh:true},text:'Reload this record',onclick:()=>{if(!same(expected))return global.App.toast('Workspace/account/session changed; reopen the review.','err');return global.App.go?global.App.go('analytics'):location.reload();}}));
   return node;
  }
 };
})(window);
