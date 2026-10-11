'use strict';
/** M84: optional, explicitly manual time tracking. It never grants/denies entry,
 * infers broker activity or resets other guardrails. Durations are app choices;
 * two hours is a course example, not a universal rule. */
const {db}=require('./db');const {dayKey,msOf}=require('./bots/guardrails');
function input(message,status=400){const e=new Error(message);e.status=status;e.code='session_time_invalid';return e;}
function parseLimit(value){
  if(value==null || (typeof value==='string' && !value.trim()))return null;
  if((typeof value!=='number' && typeof value!=='string') || (typeof value==='string' && !/^\+?\d+(?:\.0+)?$/.test(value.trim())))throw input('max_session_minutes must be Off or an integer from 1 to 1440');
  const n=Number(value);if(!Number.isInteger(n)||n<1||n>1440)throw input('max_session_minutes must be Off or an integer from 1 to 1440');return n;
}
async function owned(store,userId,accountId){
  let row;
  if(accountId==null||accountId==='')row=await store.prepare('SELECT * FROM accounts WHERE user_id=? AND archived=0 ORDER BY is_default DESC,id LIMIT 1').get(userId);
  else{
    if(typeof accountId==='boolean'||!Number.isSafeInteger(Number(accountId))||Number(accountId)<=0)throw input('An owned active account is required',404);
    row=await store.prepare('SELECT * FROM accounts WHERE id=? AND user_id=? AND archived=0').get(Number(accountId),userId);
  }
  if(!row)throw input('Account not found',404);return row;
}
function unavailable(message='Manual session time could not be verified. No broker screen time or permission is inferred.'){
  return {state:'unavailable',advisory:true,elapsed_minutes:null,message,scope:'manual marker only; never execution permission'};
}
function describe(account,row,nowMs=Date.now()){
  if(!Number.isFinite(nowMs))return unavailable();
  let setting;try{setting=parseLimit(account.max_session_minutes);}catch{return unavailable();}
  const base={account_id:account.id,advisory:true,evaluated_at:new Date(nowMs).toISOString(),timezone:'UTC',saved_limit_minutes:setting,scope:'Manual marker only, not measured broker/chart screen time or execution permission'};
  if(!row)return {...base,state:setting===null?'off':'not_started',limit_minutes:setting,elapsed_minutes:null,started_at:null,ended_at:null,
    message:setting===null?'Session-duration warning is Off (optional).':`Selected ${setting} minutes. Start the manual marker before the session; unstarted does not mean zero chart time.`};
  let limit;try{limit=parseLimit(row.limit_minutes);}catch{return {...base,...unavailable()};}
  const start=msOf(row.started_at),end=row.ended_at==null?null:msOf(row.ended_at);
  if(limit===null||!Number.isFinite(start)||start>nowMs||dayKey(start)!==row.rule_date||(end!==null&&(!Number.isFinite(end)||end<start||end>nowMs)))return {...base,...unavailable()};
  const elapsed=((end??nowMs)-start)/60000,reached=elapsed>=limit;
  return {...base,state:reached?'limit_reached':end!==null?'ended':'running',rule_date:row.rule_date,started_at:row.started_at,ended_at:row.ended_at,
    limit_minutes:limit,elapsed_minutes:elapsed,deadline_at:new Date(start+limit*60000).toISOString(),warning:reached,
    message:reached?`Manual session has reached the selected ${limit}-minute ceiling. Stand down from this session; this warning cannot stop your broker or override any other app rule.`
      :end!==null?`Manual session ended after ${Math.floor(elapsed)} minutes. Marker history and other rule stops remain.`
        :`Manual marker: ${Math.floor(elapsed)} / ${limit} minutes. Only time since your server-recorded start is known.`};
}
async function marker(store,userId,account,nowMs){
  return await store.prepare('SELECT * FROM session_time_markers WHERE user_id=? AND account_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(userId,account.id)
    || await store.prepare('SELECT * FROM session_time_markers WHERE user_id=? AND account_id=? AND rule_date=?').get(userId,account.id,dayKey(nowMs));
}
async function inspect(userId,{accountId=null,account=null,store=db,nowMs=Date.now()}={}){
  const acc=account||await owned(store,userId,accountId);return describe(acc,await marker(store,userId,acc,nowMs),nowMs);
}
async function start(userId,accountId){
  return db.tx(async tx=>{const store=db.transactionStore(tx),now=Date.now(),acc=await owned(store,userId,accountId),existing=await marker(store,userId,acc,now);
    if(existing)return describe(acc,existing,now); // duplicate/today-end/overnight never reset
    const limit=parseLimit(acc.max_session_minutes);if(limit===null)throw input('Choose an optional session-duration ceiling before starting its marker.');
    await store.prepare('INSERT INTO session_time_markers(user_id,account_id,rule_date,started_at,limit_minutes) VALUES (?,?,?,?,?)').run(userId,acc.id,dayKey(now),new Date(now).toISOString(),limit);
    return inspect(userId,{account:acc,store,nowMs:now});
  });
}
async function end(userId,accountId){
  return db.tx(async tx=>{const store=db.transactionStore(tx),now=Date.now(),acc=await owned(store,userId,accountId),row=await marker(store,userId,acc,now);
    if(!row)throw input('There is no manual session marker to end.');
    const current=describe(acc,row,now);if(current.state==='unavailable')throw input('Repair the unavailable manual marker before ending it.');
    await store.prepare('UPDATE session_time_markers SET ended_at=? WHERE user_id=? AND account_id=? AND rule_date=? AND ended_at IS NULL').run(new Date(now).toISOString(),userId,acc.id,row.rule_date);
    return inspect(userId,{account:acc,store,nowMs:now});
  });
}
module.exports={parseLimit,owned,describe,inspect,start,end,unavailable};
