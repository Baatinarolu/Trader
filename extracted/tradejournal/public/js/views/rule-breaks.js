/* M12 rule-break tally from the guardrail audit: recorded events, not a score, not an outcome claim. */
(function(global){
 'use strict';const Views=global.Views=global.Views||{},U=global.U,finite=n=>typeof n==='number'&&Number.isFinite(n),context=()=>({user:global.Store.user?.id,account:global.Store.accountId,token:global.API.getToken()}),same=c=>!!c&&c.user===global.Store.user?.id&&c.account===global.Store.accountId&&c.token===global.API.getToken();
 Views.ruleBreaks={context,same,
  card(report){const node=U.h('section',{class:'card',style:'margin-top:14px',dataset:{ruleBreaks:'true'}}),expected=context();node.appendChild(U.h('h3',{text:'Rule breaks recorded · guardrail audit'}));
   node.appendChild(U.h('p',{class:'field-note',text:'Recorded audit events for your own accounts, split by what happened: an attempt the guardrail PREVENTED, an OVERRIDE you took with a stated reason, a live stop state OBSERVED (a condition, not an attempt) and legal records excluded. It is not broker verification, not your mental state, not a market edge and it does not join a break to an outcome. It writes nothing and changes no grade, cap, permission or guardrail decision.'}));
   if(!report||report.state!=='available'){node.appendChild(U.h('p',{class:'sticky-note warn',text:'Guardrail audit evidence unavailable. This is unknown, not a clean week and not zero rule breaks.'}));return node;}
   const rules=report.by_rule||[],days=report.by_day||[];
   node.appendChild(U.h('p',{class:'small',dataset:{ruleBreaksTotal:true},text:`${report.breaks} rule break${report.breaks===1?'':'s'} recorded in this scope (${report.prevented} prevented, ${report.accepted} accepted override${report.accepted===1?'':'s'}) · ${report.observations} live stop${report.observations===1?'':'s'} observed · ${report.records_excluded} legal record${report.records_excluded===1?'':'s'} excluded from the count.`}));
   node.appendChild(U.h('p',{class:'small',text:report.windows&&(report.windows.first_date||report.windows.days)?`Window ${report.windows.first_date||'unbounded'} → ${report.windows.last_date||'unbounded'} · ${report.windows.days} day${report.windows.days===1?'':'s'} with a recorded event${report.truncated?' · read bounded to the most recent events (truncation flagged)':''}.`:'No recorded guardrail event carries a date in this scope yet.'}));
   if(!rules.length)node.appendChild(U.h('p',{class:'muted',text:'No prevented attempt and no override is recorded here. That is a recorded tally, not a claim about unrecorded behaviour.'}));
   for(const r of rules){node.appendChild(U.h('p',{class:'small',dataset:{ruleBreakRule:r.rule},text:`${r.rule} · ${r.breaks} break${r.breaks===1?'':'s'} (${r.prevented} prevented, ${r.accepted} accepted) · last ${r.last_at||'unrecorded'}`}));}
   if(report.unreadable_snapshots)node.appendChild(U.h('p',{class:'small warn',text:`${report.unreadable_snapshots} break event${report.unreadable_snapshots===1?'':'s'} stored a snapshot this app could not decode; recorded as unreadable, never assumed clean and never attributed to a rule.`}));
   if(report.unnamed_rule_events)node.appendChild(U.h('p',{class:'small warn',text:`${report.unnamed_rule_events} break event${report.unnamed_rule_events===1?'':'s'} named no rule in the stored snapshot; counted but left unnamed rather than attributed.`}));
   for(const d of days.slice(0,14)){node.appendChild(U.h('p',{class:'tiny muted',dataset:{ruleBreakDay:d.date},text:`${d.date} · ${d.breaks} break${d.breaks===1?'':'s'} (${d.prevented}/${d.accepted}) · ${d.observations} observed${d.rules.length?' · '+d.rules.join(', '):''}`}));}
   node.appendChild(U.h('p',{class:'tiny muted',text:(report.basis||'Recorded guardrail audit events; not broker.')+' '+(report.scope||'')}));
   node.appendChild(U.h('button',{class:'btn sm ghost',type:'button',dataset:{ruleBreaksRefresh:true},text:'Reload this tally',onclick:()=>{if(!same(expected))return global.App.toast('Workspace/account/session changed; reopen the review.','err');return global.App.go?global.App.go('analytics'):location.reload();}}));
   return node;
  }
 };
})(window);
