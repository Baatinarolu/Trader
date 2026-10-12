'use strict';
/** M91: current financial account-days + actually captured trade exceptions.
 * Read-only review annotation, not a broker/causal/clean-process certificate,
 * score penalty, financial-win filter or trading/sizing authority. */
const BASIS='Whole owned account UTC close-day current journal P&L + retained server rule-day trade-exception facts. Not causal reinforcement, broker execution or per-trade attribution.';
const CONTEXT=['observed_stop','blocked_attempt','research_exception','recording_observation'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const id=n=>Number.isSafeInteger(n)&&n>0;
function invalid(message,status=400){return Object.assign(new Error(message),{code:'process_outcome_invalid',status});}
function dateKey(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw invalid('Select a valid UTC calendar date.');return s;}
function clock(s,{canonical=false,now=Date.now()}={}){
 if(typeof s!=='string'||!s.trim())return null;const value=/^\d{4}-\d\d-\d\d [\d:.]+$/.test(s)?s.replace(' ','T')+'Z':s,n=Date.parse(value);
 try{dateKey(s.slice(0,10));if(!Number.isFinite(n)||n>now||canonical&&new Date(n).toISOString()!==s)return null;return n;}catch{return null;}
}
const utc=n=>new Date(n).toISOString().slice(0,10);
function snapshot(row,userId,accountId,at,now){
 const s=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot,ms=clock(at,{canonical:true,now});
 if(!s||typeof s!=='object'||Array.isArray(s)||row.user_id!==userId||row.account_id!==accountId||s.account_id!==accountId||s.date!==row.rule_date||s.timezone!=='UTC'||ms===null||utc(ms)!==row.rule_date||s.evaluated_at!==at)throw invalid('Captured rule context unavailable.');return s;
}
function tradedException(row,s,at,source){
 const a=s.admission,tradeId=source==='admission'?row.trade_id:row.entity_id;
 if(!id(tradeId)||s.status!=='stop'||s.permission?.can_override!==true||s.permission.allowed!==false||!a||a.allowed!==true||a.state!=='overridden'||a.can_override!==false||a.action!==row.action||typeof a.override_reason!=='string'||!a.override_reason.trim()||a.override_reason.length>2000||!Array.isArray(s.breaches)||!s.breaches.length||s.breaches.some(b=>typeof b?.rule!=='string'||!b.rule||typeof b.detail!=='string'))throw invalid('Captured traded exception unavailable.');
 if(source==='event'&&(!Array.isArray(a.entity_ids)||!a.entity_ids.includes(tradeId)||row.reason!==a.override_reason))throw invalid('Event action identity unavailable.');
 return {trade_id:tradeId,rule_date:row.rule_date,account_id:row.account_id,at,action:row.action,reason:a.override_reason,rules:s.breaches.map(b=>({rule:b.rule,detail:b.detail})),sources:[source],admission_ids:source==='admission'?[row.id]:[],event_ids:source==='event'?[row.id]:[]};
}
const signature=e=>JSON.stringify([e.account_id,e.rule_date,e.at,e.action,e.trade_id]);
function evaluate({userId,accounts=[],trades=[],admissions=[],events=[],from=null,to=null,nowMs=Date.now()}={}){
 if(from!=null)dateKey(from);if(to!=null)dateKey(to);if(from&&to&&from>to)throw invalid('UTC date range is reversed.');if(!id(userId))throw invalid('An owned review scope is required.');
 const accountIds=new Set(accounts.filter(a=>a.user_id===userId&&id(a.id)).map(a=>a.id)),days=new Map(),unassigned=new Map(),unassignedEvidence=new Map();
 const get=(account,date)=>{const key=account+':'+date;if(!days.has(key))days.set(key,{account_id:account,date,closed_trades:0,known_net_count:0,unknown_net_count:0,known_net_sum:0,realised_net:null,unassigned_closed:0,exception_entries:0,exceptions:[],admitted_entries:0,evidence_unavailable:0,context_counts:Object.fromEntries(CONTEXT.map(k=>[k,0])),rewarded_breach:false,process_state:'unknown',broker_verified:false});return days.get(key);};
 for(const t of trades){if(t.user_id!==userId||!accountIds.has(t.account_id)||t.status!=='closed')continue;const at=clock(t.closed_at,{now:nowMs});if(at===null){unassigned.set(t.account_id,(unassigned.get(t.account_id)||0)+1);continue;}const d=get(t.account_id,utc(at));d.closed_trades++;if(finite(t.net_pnl)){d.known_net_count++;d.known_net_sum+=t.net_pnl;}else d.unknown_net_count++;}
 const tracked=new Map();
 for(const a of admissions){if(a.user_id!==userId||!accountIds.has(a.account_id))continue;let d;try{d=get(a.account_id,dateKey(a.rule_date));const s=snapshot(a,userId,a.account_id,a.admitted_at,nowMs);if(a.admission_state==='overridden'){const ex=tradedException(a,s,a.admitted_at,'admission');d.exceptions.push(ex);const k=signature(ex);if(!tracked.has(k))tracked.set(k,[]);tracked.get(k).push(ex);}else if(a.admission_state==='admitted'&&s.admission?.state==='admitted'&&s.admission.allowed===true&&s.admission.action===a.action&&id(a.trade_id)&&['clear','caution'].includes(s.status)&&s.permission?.allowed===true&&s.permission.can_override===false&&Array.isArray(s.breaches)&&s.breaches.length===0)d.admitted_entries++;else throw invalid('Admission state unavailable.');}catch{if(d)d.evidence_unavailable++;else unassignedEvidence.set(a.account_id,(unassignedEvidence.get(a.account_id)||0)+1);}}
 for(const e of events){if(e.user_id!==userId||!accountIds.has(e.account_id))continue;let d;try{d=get(e.account_id,dateKey(e.rule_date));const s=snapshot(e,userId,e.account_id,e.observed_at,nowMs);
   if(e.kind==='override'&&e.entity_type==='trade'){const ex=tradedException(e,s,e.observed_at,'event'),matched=tracked.get(signature(ex));if(matched?.length){if(matched.some(a=>a.reason!==ex.reason||JSON.stringify(a.rules)!==JSON.stringify(ex.rules)))throw invalid('Conflicting captured action metadata unavailable.');for(const a of matched){if(!a.sources.includes('event'))a.sources.push('event');a.event_ids.push(e.id);}}else d.exceptions.push(ex);}
   else if(e.kind==='override'&&e.entity_type==='signal')d.context_counts.research_exception++;
   else if(e.kind==='breach')d.context_counts.observed_stop++;
   else if(e.kind==='blocked_attempt')d.context_counts.blocked_attempt++;
   else if(e.kind==='journal_record')d.context_counts.recording_observation++;
   else throw invalid('Event kind unavailable.');
  }catch{if(d)d.evidence_unavailable++;else unassignedEvidence.set(e.account_id,(unassignedEvidence.get(e.account_id)||0)+1);}}
 const list=[...days.values()].filter(d=>(!from||d.date>=from)&&(!to||d.date<=to)).sort((a,b)=>b.date.localeCompare(a.date)||a.account_id-b.account_id);
 const coverage={account_days:list.length,profitable_exception_days:0,exception_days:0,exception_entries:0,outcome_unavailable_days:0,process_unknown_days:0,evidence_unavailable:0,unassigned_closed:[...unassigned.values()].reduce((a,b)=>a+b,0),unassigned_evidence:[...unassignedEvidence.values()].reduce((a,b)=>a+b,0)};
 for(const d of list){d.unassigned_closed=unassigned.get(d.account_id)||0;d.evidence_unavailable+=unassignedEvidence.get(d.account_id)||0;d.exception_entries=d.exceptions.length;d.known_net_sum=finite(d.known_net_sum)?Number(d.known_net_sum.toFixed(2)):null;d.realised_net=d.unknown_net_count||d.unassigned_closed||d.known_net_sum===null?null:d.known_net_sum;d.outcome=d.realised_net===null?'unavailable':!d.closed_trades?'empty':d.realised_net>0?'profit':d.realised_net<0?'loss':'breakeven';d.process_state=d.exception_entries?'recorded_exception':d.evidence_unavailable?'unavailable':d.admitted_entries?'captured_admission_only':'unknown';d.rewarded_breach=d.exception_entries>0&&d.outcome==='profit';if(d.rewarded_breach)coverage.profitable_exception_days++;if(d.exception_entries)coverage.exception_days++;coverage.exception_entries+=d.exception_entries;coverage.evidence_unavailable+=d.evidence_unavailable;if(d.realised_net===null)coverage.outcome_unavailable_days++;if(d.process_state==='unknown'||d.process_state==='unavailable')coverage.process_unknown_days++;}
 return {state:'available',timezone:'UTC',account_ids:[...accountIds],from,to,days:list,coverage,broker_verified:false,basis:BASIS,metrics_policy:'Financial wins, P&L and expectancy remain unchanged. A positive account-day is not a clean-process certificate; no proof of causal reward or rule violation at a broker.'};
}
function insight(review){
 if(review?.state!=='available')return null;const days=review.days.filter(d=>d.rewarded_breach);if(!days.length)return null;const sum=days.reduce((s,d)=>s+d.realised_net,0),net=finite(sum)?Number(sum.toFixed(2)):null,n=days.length;
 return {id:'rewarded_breach',category:'discipline',severity:'warning',title:'Positive P&L with recorded guardrail exceptions',detail:`${n} owned UTC account-day${n===1?'':'s'} had positive current recorded realised P&L and an actual captured trade exception under a personal stop. This is a day-level review association, not a causal dollar cost, proof of psychological reinforcement, broker execution or a label on every winning trade. Merely observed stops/blocked attempts/research/history do not establish this case.`,impact:net,recorded_net_available:net!==null,money_basis:'recorded_flagged_account_day_net',evidence:[{label:'Flagged account-days',value:String(n)},{label:'Financial scope',value:'Whole account UTC close days, not selected symbol/strategy'},{label:'Basis',value:'Retained server exceptions + current corrected journal outcomes'}],action:'Review the captured rule/reason alongside the day and identify a process fix. Financial wins stay wins; this annotation never grants entry, changes grades or authorises sizing.',process_review_basis:'captured_trade_exception_day_association'};
}


function unavailable(){return {state:'unavailable',days:[],coverage:null,timezone:'UTC',broker_verified:false,basis:BASIS,metrics_policy:'Process history unavailable, not clean. Existing financial metrics remain financial; no inferred rule-following or profit/permission change.'};}
async function inspect(userId,{accountId=null,from=null,to=null,store=null}={}){
 if(from!=null)dateKey(from);if(to!=null)dateKey(to);if(from&&to&&from>to)throw invalid('UTC date range is reversed.');
 if(accountId!=null&&(!['string','number'].includes(typeof accountId)||typeof accountId==='string'&&!/^[1-9]\d*$/.test(accountId)||!id(Number(accountId))))throw invalid('Account not found.',404);
 const {db}=require('./db'),read=async store=>{const accounts=await store.prepare('SELECT * FROM accounts WHERE user_id=?'+(accountId==null?'':' AND id=?')).all(...(accountId==null?[userId]:[userId,Number(accountId)]));if(accountId!=null&&!accounts.length)throw invalid('Account not found.',404);const trades=await store.prepare('SELECT * FROM trades WHERE user_id=?').all(userId),admissions=await store.prepare('SELECT * FROM guardrail_entry_admissions WHERE user_id=? ORDER BY id').all(userId),events=await store.prepare('SELECT * FROM guardrail_events WHERE user_id=? ORDER BY id').all(userId);return evaluate({userId,accounts,trades,admissions,events,from,to,nowMs:Date.now()});};
 return store?read(store):db.tx(async tx=>read(db.transactionStore(tx)));
}
async function optional(userId,options){try{return await inspect(userId,options);}catch{return unavailable();}}
function withCoach(data,review){const warning=insight(review);return {...data,process_review:review,insights:warning?[...(data.insights||[]),warning]:data.insights};}
module.exports={BASIS,invalid,dateKey,clock,evaluate,insight,inspect,optional,unavailable,withCoach};
