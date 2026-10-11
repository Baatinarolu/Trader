'use strict';
/** M14/M94: owned nullable human records, actual workflow and immutable first
 * executed-admission evidence. No retrospective permission/causal/sizing claim.
 * Outcome buckets are UTC CLOSE-day daily realised P&L, not floating/sample-
 * weighted expectancy. This does not attribute an overnight trade to its entry. */
const {db}=require('./db');const {dayKey,msOf}=require('./bots/guardrails');
function input(message,status=400){const e=new Error(message);e.status=status;e.code='routine_input_invalid';return e;}
function dateKey(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(msOf(value))||dayKey(msOf(value))!==value)throw input('A valid UTC calendar date is required.');return value;}
function parseFlag(value){if(value===null)return null;if(typeof value!=='boolean')throw input('pre_market_done must be an explicit true, false or null/unknown.');return value?1:0;}
async function owned(store,userId,accountId=null){
  let row;if(accountId==null||accountId==='')row=await store.prepare('SELECT * FROM accounts WHERE user_id=? ORDER BY archived,is_default DESC,id LIMIT 1').get(userId);
  else{if(!['number','string'].includes(typeof accountId)||(typeof accountId==='string'&&!/^[1-9]\d*$/.test(accountId))||!Number.isSafeInteger(Number(accountId))||Number(accountId)<=0)throw input('Account not found',404);row=await store.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(Number(accountId),userId);}
  if(!row)throw input('Account not found',404);return row;
}
function publicRecord(row,date,accountId,nowMs=Date.now()){
  const valid=!row||([null,0,1].includes(row.pre_market_done)&&row.basis==='self_reported'&&Number.isFinite(msOf(row.recorded_at))&&msOf(row.recorded_at)<=nowMs);
  return {date,account_id:accountId,done:!valid||row?.pre_market_done==null?null:row.pre_market_done===1,basis:valid?(row?.basis||'unrecorded'):'self_report_unavailable',recorded_at:valid?(row?.recorded_at||null):null,workflow_complete:false,scope:'Self-reported daily fact alone never satisfies workflow; NULL/unrecorded/unavailable means unknown'};
}
async function admission(store,userId,accountId,date,nowMs=Date.now(),{strict=false}={}){
  const row=await store.prepare('SELECT * FROM routine_day_admissions WHERE user_id=? AND account_id=? AND rule_date=?').get(userId,accountId,date);if(!row)return null;
  try{
    const s=JSON.parse(row.snapshot),at=msOf(row.recorded_at),complete=s?.workflow_complete_at_entry,before=s?.completed_before_window;
    if(!s||s.user_id!==userId||s.account_id!==accountId||s.rule_date!==date||s.recorded_at!==row.recorded_at||s.first_trade_id!==row.first_trade_id||s.cycle_id!==row.cycle_id||!Number.isSafeInteger(row.first_trade_id)||row.first_trade_id<=0||!Number.isFinite(at)||at>nowMs||dayKey(at)!==date||typeof complete!=='boolean'||(before!==null&&typeof before!=='boolean')||![0,1].includes(row.prepared)||![0,1].includes(row.workflow_complete_at_entry)||row.workflow_complete_at_entry!==(complete?1:0)||row.prepared!==((complete&&before===true)?1:0)||s.prepared_at_entry!==(row.prepared===1)||s.source!=='first_executed_admission')throw Error();
    if(row.cycle_id===null){if(complete||before!==null||s.completed_at!==null||s.window_at!==null)throw Error();}
    else{if(!Number.isSafeInteger(row.cycle_id)||row.cycle_id<=0||!Number.isFinite(msOf(s.window_at)))throw Error();if(complete&&(!Number.isFinite(msOf(s.completed_at))||msOf(s.completed_at)>at||before!==(msOf(s.completed_at)<=msOf(s.window_at))))throw Error();if(!complete&&(s.completed_at!==null||before!==null))throw Error();}
    return {state:'captured',cycle_id:row.cycle_id,prepared:row.prepared===1,workflow_complete_at_entry:complete,first_trade_id:row.first_trade_id,recorded_at:row.recorded_at,snapshot:s};
  }catch{if(strict)throw input('Stored first-entry preparation evidence is unavailable.',503);return {state:'unknown',prepared:null,recorded_at:null,cycle_id:null,message:'First-entry preparation evidence could not be verified; not a self-report fallback pass.'};}
}
async function enrich(store,userId,accountId,date,manual,nowMs=Date.now()){
  const first=await admission(store,userId,accountId,date,nowMs),cycles=await store.prepare('SELECT * FROM routine_cycles WHERE user_id=? AND account_id=? AND rule_date=? ORDER BY id DESC').all(userId,accountId,date);
  let workflow={state:'unrecorded',complete:null,completed_at:null,completed_before_window:null,scope:'No inferred legacy routine or actual meditation/mental/news proof'};
  if(cycles.length){try{const R=require('./routine'),row=cycles[0],cfg=R.validateCycle(row,nowMs,{active:false}),steps=(await store.prepare('SELECT * FROM routine_checks WHERE cycle_id=?').all(row.id)).map(r=>({...r,payload:JSON.parse(r.payload)})).sort((a,b)=>R.ORDERS[cfg.routine_order].indexOf(a.step)-R.ORDERS[cfg.routine_order].indexOf(b.step));R.validateSteps(row,steps,R.ORDERS[cfg.routine_order],userId,nowMs);workflow={state:row.completed_at?'complete':'pending',cycle_id:row.id,cycle_date:row.cycle_date,cycle_count:cycles.length,complete:!!row.completed_at,completed_at:row.completed_at,completed_before_window:row.completed_before_window===null?null:row.completed_before_window===1,window_at:row.window_at,observed_at:row.selected_at,first_action_at:row.first_action_at,scope:'Latest actual selected-window workflow for UTC window-day; human steps + server running-time only, not actual mental state/news or per-trade attribution'};}catch{workflow={state:'unknown',complete:null,completed_at:null,completed_before_window:null,scope:'Stored workflow unavailable; not self-reported or inferred complete'};}}
  const result={...manual,self_report:{done:manual.done,basis:manual.basis,recorded_at:manual.recorded_at},workflow,first_admission:first};
  if(workflow.state!=='unrecorded'){result.done=workflow.complete;result.workflow_complete=workflow.complete===true;result.basis=workflow.state==='unknown'?'workflow_unavailable':'workflow_steps';result.recorded_at=workflow.completed_at||workflow.observed_at||null;}
  else if(first?.state==='captured'){result.done=first.workflow_complete_at_entry;result.workflow_complete=first.workflow_complete_at_entry;result.basis='first_executed_admission';result.recorded_at=first.recorded_at;}
  if(first){result.prepared=first.prepared;result.cohort_basis=first.state==='captured'?'first_executed_admission':'first_admission_unavailable';}
  else if(workflow.state==='unknown'){result.prepared=null;result.cohort_basis='workflow_unavailable';}
  else if(workflow.state!=='unrecorded'){
    result.prepared=workflow.completed_before_window===true?true:nowMs>=msOf(workflow.window_at)?false:null;result.cohort_basis=workflow.completed_before_window===true||nowMs>=msOf(workflow.window_at)?'scheduled_deadline':'pending_deadline';
  }else{result.prepared=manual.done;result.cohort_basis=manual.basis;}
  result.scope='Current workflow completion is distinct from on-time/before-first-entry preparation. Manual self-report is shown separately; it never satisfies the execution gate. UTC window-day/close-day association is descriptive, not causal/per-trade evidence.';
  return result;
}
async function daily(userId,{accountId=null,date,store=db,nowMs=Date.now()}={}){date=dateKey(date);const acc=await owned(store,userId,accountId),row=await store.prepare('SELECT * FROM routine_day_records WHERE user_id=? AND account_id=? AND rule_date=?').get(userId,acc.id,date);return enrich(store,userId,acc.id,date,publicRecord(row,date,acc.id,nowMs),nowMs);}
async function setManual(store,userId,accountId,date,value){date=dateKey(date);const done=parseFlag(value);if(done!==null && date>dayKey(Date.now()))throw input('Future routine completion/skipping cannot be recorded as an actual daily fact.');await owned(store,userId,accountId);await store.prepare(`INSERT INTO routine_day_records(user_id,account_id,rule_date,pre_market_done,basis,recorded_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,account_id,rule_date) DO UPDATE SET pre_market_done=excluded.pre_market_done,basis=excluded.basis,recorded_at=excluded.recorded_at`).run(userId,accountId,date,done,'self_reported',new Date().toISOString());return daily(userId,{accountId,date,store});}
async function list(userId,{accountId=null,store=db,nowMs=Date.now()}={}){
  const acc=await owned(store,userId,accountId),rows=await store.prepare(`SELECT rule_date FROM routine_day_records WHERE user_id=? AND account_id=? UNION SELECT rule_date FROM routine_cycles WHERE user_id=? AND account_id=? UNION SELECT rule_date FROM routine_day_admissions WHERE user_id=? AND account_id=? ORDER BY rule_date DESC LIMIT 400`).all(userId,acc.id,userId,acc.id,userId,acc.id);
  const result=[];for(const r of rows)result.push(await daily(userId,{accountId:acc.id,date:r.rule_date,store,nowMs}));return result;
}
async function report(userId,{accountId=null,from=null,to=null,store=db,nowMs=Date.now()}={}){
  if(from)dateKey(from);if(to)dateKey(to);if(from&&to&&from>to)throw input('from must not be after to.');const acc=await owned(store,userId,accountId),rows=await store.prepare("SELECT * FROM trades WHERE user_id=? AND account_id=? AND status='closed'").all(userId,acc.id),grouped=new Map(),unassigned=[];
  for(const t of rows){const ms=msOf(t.closed_at);if(!Number.isFinite(ms)){unassigned.push(t.id);continue;}if(ms>nowMs)continue;const date=dayKey(ms);if((from&&date<from)||(to&&date>to))continue;if(!grouped.has(date))grouped.set(date,[]);grouped.get(date).push(t);}
  const days=[];for(const [date,trades] of grouped){const known=trades.every(t=>t.net_pnl!==null&&t.net_pnl!==undefined&&t.net_pnl!==''&&Number.isFinite(Number(t.net_pnl))),r=await daily(userId,{accountId:acc.id,date,store,nowMs});days.push({date,trades:trades.length,realised_pnl:known?trades.reduce((s,t)=>s+Number(t.net_pnl),0):null,pre_market:r,cohort_basis:r.cohort_basis,status:r.prepared===null?'unknown':r.prepared?'completed':'not_completed'});}days.sort((a,b)=>a.date.localeCompare(b.date));
  const buckets=['completed','not_completed','unknown'].map(status=>{const all=days.filter(d=>d.status===status),known=all.filter(d=>d.realised_pnl!==null),net=known.reduce((s,d)=>s+d.realised_pnl,0);return {status,days:all.length,known_pnl_days:known.length,unavailable_pnl_days:all.length-known.length,net_pnl:known.length?net:null,mean_daily_pnl:known.length?net/known.length:null};});
  return {account_id:acc.id,timezone:'UTC',days,buckets,total_closed_trades:days.reduce((s,d)=>s+d.trades,0),unassigned_close_date_ids:unassigned,cohort:'Frozen first executed admission preparation where observed, otherwise selected-window deadline workflow, otherwise explicit self-report/unknown',descriptive_only:true,causation_established:false,note:'Observational UTC close-day daily realised P&L, trading days only. Workflow-completed is not necessarily on-time/before-first-entry prepared. Overnight entries can close on another day: this is NOT per-trade routine attribution. Unknown is not skipped, missing P&L is not zero; small/selected samples and retrospective self-reports do not prove causation or justify resizing/strategy tuning.'};
}
module.exports={input,dateKey,parseFlag,owned,daily,setManual,list,report,admission,enrich};
