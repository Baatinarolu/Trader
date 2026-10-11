'use strict';
/** M64: explicitly selected local-window routine, immutable active-cycle policy.
 * Human steps/timer are preparation, not broker activity/verified mental state,
 * provider news clearance, allowed-hour enforcement or new market geometry. */
const {db}=require('./db'),RR=require('./routine-records'),{dayKey,msOf}=require('./bots/guardrails');
const ORDERS={ep17:['calendar','plan','charts','meditation','check_in'],meditation_first:['meditation','calendar','plan','charts','check_in']};
const MEDITATION_MS=15*60000;
function clock(value){if(!Number.isFinite(value))throw RR.input('Routine server clock is unavailable.',503);return value;}
function config(raw={}){
  const start=raw.routine_window_start==null||raw.routine_window_start===''?null:raw.routine_window_start;
  if(start!==null&&(typeof start!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)))throw RR.input('Select a local trading-window start as HH:MM.');
  const zone=raw.routine_timezone==null||raw.routine_timezone===''?null:raw.routine_timezone;
  if(zone!==null){if(typeof zone!=='string'||zone.length>100||/^[+-]/.test(zone))throw RR.input('Select a valid IANA routine timezone.');try{new Intl.DateTimeFormat('en',{timeZone:zone}).format(0);}catch{throw RR.input('Select a valid IANA routine timezone.');}}
  if(start!==null && zone===null)throw RR.input('An explicit IANA timezone is required with the selected window.');
  const lead=raw.routine_lead_minutes??60;if((typeof lead!=='number'&&typeof lead!=='string')||(typeof lead==='string'&&!/^\d+$/.test(lead))||!Number.isInteger(Number(lead))||Number(lead)<1||Number(lead)>180)throw RR.input('Routine lead must be whole minutes from 1 to 180.');
  const order=raw.routine_order??'ep17';if(!Object.prototype.hasOwnProperty.call(ORDERS,order))throw RR.input('Choose ep17 or meditation_first routine order.');
  return {routine_window_start:start,routine_timezone:zone,routine_lead_minutes:Number(lead),routine_order:order};
}
const formatters=new Map(),windows=new Map();
function parts(ms,zone){let fmt=formatters.get(zone);if(!fmt){fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatters.set(zone,fmt);}return Object.fromEntries(fmt.formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function civil(p){return Date.UTC(p.year,p.month-1,p.day,p.hour||0,p.minute||0);}
function localDate(ms,zone){const p=parts(ms,zone);return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;}
function addDay(date,n){return dayKey(msOf(date)+n*864e5);}
/** Explicit DST policy: earlier fold occurrence, shift nonexistent clocks forward
 * by the gap. Offset candidates from +/-36h avoid a hard-coded UTC session. */
function windowAt(date,time,zone){const key=[date,time,zone].join('|');if(windows.has(key))return windows.get(key);const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number),wanted=Date.UTC(year,month-1,day,hour,minute),offsets=new Set([-36,-12,0,12,36].map(h=>{const sample=wanted+h*3600000;return civil(parts(sample,zone))-sample;}));
  const candidates=[...offsets].map(offset=>wanted-offset),exact=candidates.filter(ms=>civil(parts(ms,zone))===wanted);let value;
  if(exact.length)value=Math.min(...exact);else{const shifted=candidates.map(ms=>({ms,delta:civil(parts(ms,zone))-wanted})).filter(x=>x.delta>0).sort((a,b)=>a.delta-b.delta||a.ms-b.ms);if(!shifted.length)throw RR.input('Selected local routine time could not be resolved.',503);value=shifted[0].ms;}
  if(windows.size>500)windows.clear();windows.set(key,value);return value;
}
function boundaries(cfg,nowMs=Date.now()){
  clock(nowMs);const today=localDate(nowMs,cfg.routine_timezone);
  for(const n of [-1,0,1]){const date=addDay(today,n),window=windowAt(date,cfg.routine_window_start,cfg.routine_timezone),reset=window-cfg.routine_lead_minutes*60000,next=windowAt(addDay(date,1),cfg.routine_window_start,cfg.routine_timezone)-cfg.routine_lead_minutes*60000;if(nowMs>=reset&&nowMs<next)return {cycle_date:date,rule_date:dayKey(window),reset_at:new Date(reset).toISOString(),window_at:new Date(window).toISOString(),expires_at:new Date(next).toISOString()};}
  throw RR.input('Routine cycle boundary could not be resolved.',503);
}
function validateCycle(row,nowMs,{active=true}={}){
  clock(nowMs);let cfg;try{cfg=config({routine_window_start:row.window_start,routine_timezone:row.timezone,routine_lead_minutes:row.lead_minutes,routine_order:row.step_order});}catch{throw RR.input('Stored routine policy is unavailable.',503);}
  const reset=msOf(row.reset_at),end=msOf(row.expires_at),selected=msOf(row.selected_at),window=msOf(row.window_at);
  if(cfg.routine_window_start===null||!Number.isFinite(reset)||!Number.isFinite(end)||!Number.isFinite(selected)||!Number.isFinite(window)||selected>nowMs||selected<reset||selected>=end||(active&&!(reset<=nowMs&&nowMs<end))||reset>=window||window>=end||dayKey(window)!==row.rule_date)throw RR.input('Stored routine cycle is unavailable.',503);
  // Validate the frozen boundary even when a corrupt row would be excluded by
  // an active-range SQL query. Never silently create a replacement known cycle.
  const expected=boundaries(cfg,window);if(['cycle_date','rule_date','reset_at','window_at','expires_at'].some(k=>row[k]!==expected[k]))throw RR.input('Stored routine boundary is unavailable.',503);return cfg;
}
async function current(userId,{accountId=null,account=null,store=db,nowMs=Date.now()}={}){
  clock(nowMs);const acc=account||await RR.owned(store,userId,accountId),at=new Date(nowMs).toISOString();
  const last=await store.prepare('SELECT * FROM routine_cycles WHERE user_id=? AND account_id=? ORDER BY id DESC LIMIT 1').get(userId,acc.id);
  if(last)validateCycle(last,nowMs,{active:false});
  let row=last&&msOf(last.reset_at)<=nowMs&&nowMs<msOf(last.expires_at)?last:null;
  if(!row){let cfg;try{cfg=config(acc);}catch{throw RR.input('Stored routine configuration is unavailable.',503);}if(cfg.routine_window_start===null){await RR.admission(store,userId,acc.id,dayKey(nowMs),nowMs,{strict:true});return {account_id:acc.id,state:'setup_required',complete:false,cycle:null,order:ORDERS[cfg.routine_order],steps:[],next_step:'setup',message:'Select your own local window/timezone, then complete the pre-market routine. No trader/broker hours or prior preparation are inferred.',scope:'Personal preparation requirement, not broker-hours or market permission'};}
    const b=boundaries(cfg,nowMs);await store.prepare(`INSERT OR IGNORE INTO routine_cycles(user_id,account_id,cycle_date,rule_date,timezone,window_start,lead_minutes,step_order,reset_at,window_at,expires_at,selected_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(userId,acc.id,b.cycle_date,b.rule_date,cfg.routine_timezone,cfg.routine_window_start,cfg.routine_lead_minutes,cfg.routine_order,b.reset_at,b.window_at,b.expires_at,at);
    row=await store.prepare('SELECT * FROM routine_cycles WHERE user_id=? AND account_id=? AND reset_at=?').get(userId,acc.id,b.reset_at);
  }
  await RR.admission(store,userId,acc.id,dayKey(nowMs),nowMs,{strict:true});
  const cfg=validateCycle(row,nowMs),order=ORDERS[cfg.routine_order],checks=await store.prepare('SELECT * FROM routine_checks WHERE cycle_id=? ORDER BY completed_at').all(row.id);
  const steps=checks.map(r=>({...r,payload:JSON.parse(r.payload)})).sort((a,b)=>order.indexOf(a.step)-order.indexOf(b.step));
  validateSteps(row,steps,order,userId,nowMs);
  const complete=steps.length===order.length&&!!row.completed_at;
  const attempts=await store.prepare('SELECT * FROM routine_checkin_attempts WHERE cycle_id=? ORDER BY id').all(row.id);
  const check_in_attempts=attempts.map(r=>({...r,answers:JSON.parse(r.answers)}));
  if(check_in_attempts.some(r=>!Number.isFinite(msOf(r.captured_at))||msOf(r.captured_at)>nowMs||msOf(r.captured_at)<msOf(row.selected_at)||![0,1].includes(r.passed)||!validAnswers(r.answers)||r.passed!==(Object.values(r.answers).every(v=>v===true)?1:0)))throw RR.input('Stored morning check-in is unavailable.',503);
  return {account_id:acc.id,state:complete?'complete':'pending',complete,cycle:{...row,dst_policy:'earlier fold / shift forward gap'},order,steps,check_in_attempts,next_step:order.find(s=>!steps.some(c=>c.step===s))||null,meditation:{minimum_ms:MEDITATION_MS,state:row.meditation_state,elapsed_ms:elapsed(row,nowMs),actual_meditation_verified:false},evaluated_at:at,
    message:complete?'Current routine steps acknowledged; this is preparation, not reusable entry/mental/news permission.':'Complete your pre-market routine before execution. The banner persists until every selected step and morning check-in is acknowledged.',scope:'Explicit human preparation and server timer only; no broker window/actual meditation or live mental/news proof'};
}

function text(value,label,max=4000){if(typeof value!=='string'||!value.trim()||value.length>max)throw RR.input(`${label}: enter plain nonblank text, at most ${max} characters.`);return value.trim();}
const ANSWERS=['calm','clear','following_plan','would_take_if_up_big'];
function validAnswers(p){return p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===4&&ANSWERS.every(k=>typeof p[k]==='boolean');}
function answers(body){const out=Object.fromEntries(ANSWERS.map(k=>[k,body[k]]));if(!validAnswers(out))throw RR.input('Answer all four morning questions with literal true/false values. These are human morning confirmations, not fresh in-session clearance.');return out;}
function elapsed(row,nowMs){
  if(!['not_started','running','paused','completed'].includes(row.meditation_state)||!Number.isSafeInteger(row.meditation_elapsed_ms)||row.meditation_elapsed_ms<0)throw RR.input('Stored meditation timer is unavailable.',503);
  const started=msOf(row.meditation_started_at);
  if(row.meditation_state==='running'){
    if(!Number.isFinite(started)||started>nowMs||started<msOf(row.selected_at)||started>=msOf(row.expires_at))throw RR.input('Stored meditation timer clock is unavailable.',503);return row.meditation_elapsed_ms+nowMs-started;
  }
  if(row.meditation_started_at!==null||(row.meditation_state==='not_started'&&row.meditation_elapsed_ms!==0))throw RR.input('Stored meditation timer state is unavailable.',503);
  return row.meditation_elapsed_ms;
}
function validateSteps(row,steps,order,userId,nowMs){
  elapsed(row,nowMs);let previous=msOf(row.selected_at);
  for(let i=0;i<steps.length;i++){
    const s=steps[i],p=s.payload,at=msOf(s.completed_at);
    if(s.step!==order[i]||!Number.isFinite(at)||at<previous||at>nowMs||at>=msOf(row.expires_at)||!p||typeof p!=='object')throw RR.input('Stored routine step order/time is unavailable.',503);previous=at;
    try{
      if(s.step==='calendar'){if(p.reviewed!==true||p.method!=='manual_external'||p.source!=='human_calendar_review')throw Error();text(p.summary,'Calendar review');}
      if(s.step==='plan'){if(p.reviewed!==true)throw Error();if(p.source==='own_strategy_snapshot'){if(p.snapshot?.user_id!==userId||!Number.isSafeInteger(p.snapshot?.id))throw Error();}else if(p.source==='manual_plan_text')text(p.plan_text,'Manual plan');else throw Error();}
      if(s.step==='charts'){if(p.reviewed!==true||p.source!=='human_chart_review'||!['bullish','bearish','neutral'].includes(p.daily_bias)||!['set','not_applicable'].includes(p.alert_status))throw Error();text(p.htf_range,'Chart review');text(p.alert_note,'Alert report');}
      if(s.step==='meditation'){if(p.source!=='server_running_time'||p.minimum_ms!==MEDITATION_MS||p.actual_meditation_verified!==false||!Number.isSafeInteger(p.elapsed_ms)||p.elapsed_ms<MEDITATION_MS||row.meditation_state!=='completed'||row.meditation_elapsed_ms!==p.elapsed_ms)throw Error();}
      if(s.step==='check_in'){if(p.source!=='human_morning_check_in'||!validAnswers(p.answers)||!Object.values(p.answers).every(v=>v===true))throw Error();}
    }catch{throw RR.input('Stored routine acknowledgement is unavailable.',503);}
  }
  const hasMeditation=steps.some(s=>s.step==='meditation');if((row.meditation_state==='completed')!==hasMeditation)throw RR.input('Stored timer acknowledgement is unavailable.',503);
  if(row.meditation_state!=='not_started'&&!hasMeditation&&order[steps.length]!=='meditation')throw RR.input('Stored timer step order is unavailable.',503);
  if(steps.length===order.length){const at=msOf(row.completed_at);if(!Number.isFinite(at)||at!==previous||![0,1].includes(row.completed_before_window)||row.completed_before_window!==(at<=msOf(row.window_at)?1:0))throw RR.input('Stored completion provenance is unavailable.',503);}
  else if(row.completed_at!==null||row.completed_before_window!==null)throw RR.input('Stored incomplete routine provenance is unavailable.',503);
  if(row.first_action_at!==null&&(!Number.isFinite(msOf(row.first_action_at))||msOf(row.first_action_at)>nowMs||msOf(row.first_action_at)<msOf(row.selected_at)||msOf(row.first_action_at)>=msOf(row.expires_at)))throw RR.input('Stored first-action provenance is unavailable.',503);
}
async function actionState(store,userId,body,nowMs){
  const account=await RR.owned(store,userId,body.account_id);if(account.archived)throw RR.input('Archived accounts cannot complete a new execution routine.',409);
  if(!['number','string'].includes(typeof body.cycle_id)||(typeof body.cycle_id==='string'&&!/^[1-9]\d*$/.test(body.cycle_id))||!Number.isSafeInteger(Number(body.cycle_id))||Number(body.cycle_id)<=0)throw RR.input('Select the actual current routine cycle.',409);
  const state=await current(userId,{account,store,nowMs});if(!state.cycle||state.cycle.id!==Number(body.cycle_id))throw RR.input('This is not the current routine cycle. Reload the current routine.',409);
  return state;
}
async function stepPayload(store,userId,step,body){
  if(step==='calendar'){if(body.reviewed!==true||body.method!=='manual_external')throw RR.input('Acknowledge your actual external-calendar review. It is not verified provider clearance.');return {reviewed:true,method:'manual_external',summary:text(body.summary,'Calendar review'),source:'human_calendar_review'};}
  if(step==='plan'){
    if(body.reviewed!==true)throw RR.input('Explicitly acknowledge reviewing your own plan.');
    if(body.plan_id!==undefined&&body.plan_id!==null&&body.plan_id!==''){
      if(typeof body.plan_id==='boolean'||!Number.isSafeInteger(Number(body.plan_id))||Number(body.plan_id)<=0)throw RR.input('Owned plan not found',404);
      const snapshot=await store.prepare('SELECT * FROM strategies WHERE id=? AND user_id=?').get(Number(body.plan_id),userId);if(!snapshot)throw RR.input('Owned plan not found',404);
      const version=await store.prepare('SELECT MAX(version) AS version FROM strategy_versions WHERE strategy_id=?').get(snapshot.id);
      return {reviewed:true,source:'own_strategy_snapshot',snapshot:{...snapshot,version:version?.version||null}};
    }
    return {reviewed:true,source:'manual_plan_text',plan_text:text(body.plan_text,'Your explicit manual plan')};
  }
  if(step==='charts'){
    if(body.reviewed!==true||!['bullish','bearish','neutral'].includes(body.daily_bias)||!['set','not_applicable'].includes(body.alert_status))throw RR.input('Review the chart/range, report a human daily bias and an actual alert or explicit not-applicable reason.');
    return {reviewed:true,daily_bias:body.daily_bias,htf_range:text(body.htf_range,'Chart/range review'),alert_status:body.alert_status,alert_note:text(body.alert_note,'Alert report/reason'),source:'human_chart_review'};
  }
  if(step==='check_in')return {source:'human_morning_check_in',answers:answers(body)};
  throw RR.input('Choose the actual next named step. Complete meditation with the server timer.');
}
async function saveStep(store,state,step,payload,nowMs){
  const at=new Date(nowMs).toISOString();await store.prepare('INSERT INTO routine_checks(cycle_id,step,completed_at,payload) VALUES (?,?,?,?)').run(state.cycle.id,step,at,JSON.stringify(payload));
  if(step==='check_in')await store.prepare('UPDATE routine_cycles SET completed_at=?,completed_before_window=? WHERE id=? AND completed_at IS NULL').run(at,nowMs<=msOf(state.cycle.window_at)?1:0,state.cycle.id);
}
async function acknowledge(userId,body={},nowMs=Date.now()){
  clock(nowMs);return db.tx(async tx=>{const store=db.transactionStore(tx),state=await actionState(store,userId,body,nowMs),step=body.step;
    if(['completed_at','elapsed_ms','started_at','complete','pre_market_done'].some(k=>Object.prototype.hasOwnProperty.call(body,k)))throw RR.input('Routine completion/source/time are derived by the server, not client proof.');
    // Resolve payload ownership/strict values before an idempotency/order response.
    const payload=await stepPayload(store,userId,step,body),existing=state.steps.find(s=>s.step===step);
    if(existing){if(JSON.stringify(existing.payload)!==JSON.stringify(payload))throw RR.input('The completed step is frozen. It cannot be rewritten for this cycle.',409);return state;}
    if(state.next_step!==step)throw RR.input('Complete the current routine step in your selected order.',409);
    if(step==='check_in'){
      const passed=Object.values(payload.answers).every(v=>v===true);await store.prepare('INSERT INTO routine_checkin_attempts(cycle_id,captured_at,passed,answers) VALUES (?,?,?,?)').run(state.cycle.id,new Date(nowMs).toISOString(),passed?1:0,JSON.stringify(payload.answers));
      if(!passed)return current(userId,{accountId:state.account_id,store,nowMs});
    }
    await saveStep(store,state,step,payload,nowMs);return current(userId,{accountId:state.account_id,store,nowMs});
  });
}
async function meditation(userId,body={},nowMs=Date.now()){
  clock(nowMs);return db.tx(async tx=>{const store=db.transactionStore(tx),state=await actionState(store,userId,body,nowMs),row=state.cycle,action=body.action;
    if(Object.keys(body).some(k=>!['account_id','cycle_id','action'].includes(k))||!['start','pause','resume','complete'].includes(action))throw RR.input('Choose start, pause, resume or complete. No client elapsed/start/finish clocks are accepted.');
    if(row.meditation_state==='completed'&&action==='complete')return state;
    if(state.next_step!=='meditation')throw RR.input('Complete the current routine step before meditation.',409);
    const value=elapsed(row,nowMs),at=new Date(nowMs).toISOString();
    if(action==='start'||action==='resume'){
      if(row.meditation_state!==(action==='start'?'not_started':'paused'))throw RR.input('Timer is not in the state required for this action.',409);
      await store.prepare("UPDATE routine_cycles SET meditation_state='running',meditation_started_at=? WHERE id=?").run(at,row.id);
    }else if(action==='pause'){
      if(row.meditation_state!=='running')throw RR.input('Only an active timer can be paused.',409);
      await store.prepare("UPDATE routine_cycles SET meditation_state='paused',meditation_started_at=NULL,meditation_elapsed_ms=? WHERE id=?").run(value,row.id);
    }else{
      if(!['running','paused'].includes(row.meditation_state)||value<MEDITATION_MS)throw RR.input('Fifteen minutes of server-timed running time are required. A paused gap does not count.',409);
      await store.prepare("UPDATE routine_cycles SET meditation_state='completed',meditation_started_at=NULL,meditation_elapsed_ms=? WHERE id=?").run(value,row.id);
      await saveStep(store,state,'meditation',{source:'server_running_time',minimum_ms:MEDITATION_MS,elapsed_ms:value,actual_meditation_verified:false},nowMs);
    }
    return current(userId,{accountId:state.account_id,store,nowMs});
  });
}
async function observeAdmission(store,userId,daily,tradeId){
  const r=daily.routine;if(!r||!['pending','complete','setup_required'].includes(r.state)||typeof r.complete!=='boolean')throw RR.input('Routine observation missing from actual admission.',503);
  const before=r.cycle?.completed_before_window===null||!r.cycle?null:r.cycle.completed_before_window===1,prepared=r.complete&&before===true;
  const snapshot={user_id:userId,account_id:daily.account_id,rule_date:daily.date,recorded_at:daily.evaluated_at,first_trade_id:Number(tradeId),cycle_id:r.cycle?.id||null,workflow_complete_at_entry:r.complete,completed_before_window:before,completed_at:r.cycle?.completed_at||null,window_at:r.cycle?.window_at||null,prepared_at_entry:prepared,source:'first_executed_admission'};
  await store.prepare(`INSERT INTO routine_day_admissions(user_id,account_id,rule_date,first_trade_id,cycle_id,recorded_at,prepared,workflow_complete_at_entry,snapshot) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,account_id,rule_date) DO NOTHING`).run(userId,daily.account_id,daily.date,Number(tradeId),r.cycle?.id||null,daily.evaluated_at,prepared?1:0,r.complete?1:0,JSON.stringify(snapshot));
  if(r.cycle)await store.prepare('UPDATE routine_cycles SET first_action_at=? WHERE id=? AND user_id=? AND account_id=? AND first_action_at IS NULL').run(daily.evaluated_at,r.cycle.id,userId,daily.account_id);
}
module.exports={ORDERS,MEDITATION_MS,config,parts,windowAt,boundaries,validateCycle,current,acknowledge,meditation,elapsed,validateSteps,observeAdmission};
