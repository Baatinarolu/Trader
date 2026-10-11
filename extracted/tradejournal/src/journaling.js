'use strict';
/** M85 core input-capture/completeness only. No score, grade, risk or market
 * retuning. Explicit review acknowledgement, never a legacy completion backfill.
 * Entry/exit emotion capture-time provenance (M89) is a separate remaining scope. */
const crypto=require('crypto');const {db}=require('./db');const {msOf,dayKey}=require('./bots/guardrails');
function invalid(message,status=400){const e=new Error(message);e.status=status;e.code='journal_input_invalid';return e;}
function text(value,label,max=2000){
  if(typeof value!=='string'||!value.trim()||value.length>max)throw invalid(`${label} requires plain nonblank text, at most ${max} characters.`);return value.trim();
}
function reviewFields(body={}){
  const emotion_before=text(body.emotion_before,'Entry emotion (say not recorded if genuinely unknown)',100),emotion_after=text(body.emotion_after,'Exit emotion',100);
  const execution_notes=text(body.execution_notes,'What happened'),lesson=text(body.lesson,'What you would do differently');
  if(body.mistakes_none!==undefined && typeof body.mistakes_none!=='boolean')throw invalid('mistakes_none must be an explicit true/false selection.');
  let mistakes=body.mistakes??'';
  if(Array.isArray(mistakes)){if(mistakes.some(x=>typeof x!=='string'))throw invalid('Mistakes must be plain text tags.');mistakes=mistakes.map(x=>x.trim()).filter(Boolean).join(', ');}
  if(typeof mistakes!=='string'||mistakes.length>2000)throw invalid('Mistakes must be plain text, at most 2000 characters.');mistakes=mistakes.trim();
  const mistakes_none=body.mistakes_none===true?1:0;
  if((mistakes_none && mistakes)||(!mistakes_none&&!mistakes))throw invalid('Name the broken rule/mistakes OR explicitly confirm followed plan, nothing to note; not both.');
  return {emotion_before,emotion_after,execution_notes,lesson,mistakes,mistakes_none};
}
const CORE=['emotion_before','emotion_after','execution_notes','lesson'];
const HASH_KEYS=['user_id','account_id','id','status','opened_at','closed_at','entry','exit','stop','target','size','fees','net_pnl',...CORE,'mistakes','mistakes_none'];
function fingerprint(t){return crypto.createHash('sha256').update(JSON.stringify(HASH_KEYS.map(k=>[k,t[k]??null]))).digest('hex');}
function knownNet(t){return t.net_pnl!==null&&t.net_pnl!==undefined&&t.net_pnl!==''&&Number.isFinite(Number(t.net_pnl));}
function info(t,nowMs=Date.now()){
  if(t.status!=='closed')return {state:'awaiting_close',complete:false,missing:[],reflection_required:false,reviewed_at:null,scope:'Core journal; awaiting actual close, not entry permission'};
  const missing=CORE.filter(k=>typeof t[k]!=='string'||!t[k].trim()||t[k].length>(k.startsWith('emotion_')?100:2000));
  if(!knownNet(t))missing.push('known_realised_result');
  if(!Number.isFinite(msOf(t.closed_at)))missing.push('actual_close_time');
  else if(msOf(t.closed_at)>nowMs)missing.push('actual_close_not_yet_observed');
  const mistakes=typeof t.mistakes==='string'?t.mistakes.trim():'';
  if(!(t.mistakes_none===1&&!mistakes) && !(t.mistakes_none===0&&mistakes&&mistakes.length<=2000))missing.push('mistakes_or_explicit_none');
  const at=msOf(t.journal_reviewed_at),ack=Number.isFinite(at)&&at<=nowMs&&t.journal_review_hash===fingerprint(t);
  if(!ack)missing.push('explicit_review_acknowledgement');
  const complete=missing.length===0;
  return {state:complete?'complete':'incomplete',complete,missing,reflection_required:knownNet(t)&&Number(t.net_pnl)<0,reviewed_at:t.journal_reviewed_at||null,
    scope:'Explicit core review of the current journal record; not broker-time emotion provenance, screenshots, confluences or whole-course completeness'};
}
function summary(trades,nowMs=Date.now()){
  const closed=trades.filter(t=>t.status==='closed'),journaled=closed.filter(t=>info(t,nowMs).complete).length,total=closed.length;
  return {total,journaled,missing:total-journaled,complete:total>0&&journaled===total,state:total===0?'empty':journaled===total?'complete':'incomplete',timezone:'UTC',scope:'Closed-trade core journal acknowledgement only, not P&L/grade or every course field'};
}
function days(trades,nowMs=Date.now()){
  const grouped=new Map();for(const t of trades.filter(t=>t.status==='closed')){const ms=msOf(t.closed_at),date=Number.isFinite(ms)?dayKey(ms):'unknown_close_date';if(!grouped.has(date))grouped.set(date,[]);grouped.get(date).push(t);}
  return [...grouped].map(([date,rows])=>({date,...summary(rows,nowMs)})).sort((a,b)=>b.date.localeCompare(a.date));
}
async function reviewTrade(userId,id,body){
  if(!Number.isSafeInteger(id)||id<=0)throw invalid('Trade not found',404);
  return db.tx(async tx=>{const store=db.transactionStore(tx),row=await store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,userId);
    if(!row)throw invalid('Trade not found',404);
    if(row.status!=='closed'||!knownNet(row)||!Number.isFinite(msOf(row.closed_at))||msOf(row.closed_at)>Date.now())throw invalid('Record the actual close time and realised result before completing its journal.');
    const fields=reviewFields(body),at=new Date().toISOString(),hash=fingerprint({...row,...fields});
    await store.prepare(`UPDATE trades SET emotion_before=?,emotion_after=?,execution_notes=?,lesson=?,mistakes=?,mistakes_none=?,journal_reviewed_at=?,journal_review_hash=?,updated_at=datetime('now') WHERE id=? AND user_id=?`)
      .run(fields.emotion_before,fields.emotion_after,fields.execution_notes,fields.lesson,fields.mistakes,fields.mistakes_none,at,hash,id,userId);
    await acknowledgeTradeLosses(store,userId,row.id,fields,at);
    return await store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,userId);
  });
}
// Pending writing is resolvable, unlike the latched cap/loss/streak day stops.
// Keep its immutable observation/completion independent of truthful trade CRUD.
const SNAP_KEYS=['id','user_id','account_id','symbol','status','opened_at','closed_at','net_pnl','r_multiple','entry','exit','stop','target','size','fees','emotion_before','emotion_after'];
function lossKey(t){return crypto.createHash('sha256').update(JSON.stringify([t.user_id,t.account_id,t.id,t.opened_at??null,t.closed_at])).digest('hex');}
function capture(row,nowMs=Date.now()){
  let snapshot,reflection=null;try{snapshot=JSON.parse(row.snapshot);if(row.reflection_json)reflection=JSON.parse(row.reflection_json);}catch{throw invalid('The observed post-loss writing record is unavailable.',503);}
  const observed=msOf(row.observed_at),close=msOf(snapshot?.closed_at),at=row.completed_at===null?null:msOf(row.completed_at);
  if(snapshot?.status!=='closed'||!knownNet(snapshot)||Number(snapshot.net_pnl)>=0||snapshot.user_id!==row.user_id||snapshot.account_id!==row.account_id||snapshot.id!==row.loss_trade_id
    || !Number.isFinite(observed)||observed>nowMs||!Number.isFinite(close)||close>observed||dayKey(close)!==row.rule_date||lossKey(snapshot)!==row.obligation_key
    ||(at!==null&&(!Number.isFinite(at)||at<observed||at>nowMs||!['trade_journal','loss_reflection'].includes(row.completion_source))))throw invalid('The observed post-loss writing record is unavailable.',503);
  if(at!==null){if(!reflection||![0,1].includes(reflection.mistakes_none))throw invalid('The captured explicit-none value is unavailable.',503);try{reviewFields({...reflection,mistakes_none:reflection.mistakes_none===1});}catch{throw invalid('The captured post-loss writing is unavailable.',503);}}
  return {...row,snapshot,reflection};
}
async function syncLosses(store,userId,account,rows,nowMs=Date.now()){
  const date=dayKey(nowMs),now=new Date(nowMs).toISOString(),today=rows.filter(t=>t.status==='closed' && Number.isFinite(msOf(t.closed_at)) && dayKey(msOf(t.closed_at))===date && msOf(t.closed_at)<=nowMs);
  if(today.some(t=>!knownNet(t)))throw invalid('The current-day realised result is unknown; post-loss writing cannot be verified.',503);
  for(const t of today.filter(t=>Number(t.net_pnl)<0)){
    const snap=Object.fromEntries(SNAP_KEYS.map(k=>[k,t[k]??null]));
    await store.prepare('INSERT OR IGNORE INTO guardrail_reflections(user_id,account_id,rule_date,obligation_key,loss_trade_id,observed_at,snapshot) VALUES (?,?,?,?,?,?,?)')
      .run(userId,account.id,date,lossKey(t),t.id,now,JSON.stringify(snap));
    // An explicitly reviewed known loss satisfies writing on first observation.
    // Legacy populated notes without an acknowledgement do not.
    if(info(t,nowMs).complete)await acknowledgeTradeLosses(store,userId,t.id,reviewFields({...t,mistakes_none:t.mistakes_none===1}),now,nowMs);
  }
  const captures=await store.prepare('SELECT * FROM guardrail_reflections WHERE user_id=? AND account_id=? AND rule_date=? ORDER BY id').all(userId,account.id,date);
  const all=captures.map(r=>capture(r,nowMs)),pending=all.filter(r=>r.completed_at===null);
  return {pending_count:pending.length,pending,completed_count:all.length-pending.length,timezone:'UTC',rule_date:date,scope:'Observed current-day known losses, required writing; not a broker-time entry violation or all historical incomplete journals'};
}
async function acknowledgeTradeLosses(store,userId,tradeId,fields,at,nowMs=Date.now()){
  const rows=await store.prepare('SELECT * FROM guardrail_reflections WHERE user_id=? AND loss_trade_id=? AND completed_at IS NULL').all(userId,tradeId);
  for(const row of rows){capture(row,nowMs);await store.prepare("UPDATE guardrail_reflections SET completed_at=?,reflection_json=?,completion_source='trade_journal' WHERE id=? AND user_id=? AND completed_at IS NULL").run(at,JSON.stringify(fields),row.id,userId);}
}
async function reflectionsForDay(userId,{accountId=null,date=dayKey(Date.now()),store=db}={}){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(msOf(date))||dayKey(msOf(date))!==date)throw invalid('A valid UTC rule date is required.');
  if(accountId!==null && !await store.prepare('SELECT id FROM accounts WHERE id=? AND user_id=?').get(Number(accountId),userId))throw invalid('Account not found',404);
  const rows=await store.prepare('SELECT * FROM guardrail_reflections WHERE user_id=? AND rule_date=?'+(accountId===null?'':' AND account_id=?')+' ORDER BY id').all(...(accountId===null?[userId,date]:[userId,date,Number(accountId)]));return rows.map(r=>capture(r));
}
async function reflectLoss(userId,id,body){
  if(!Number.isSafeInteger(id)||id<=0)throw invalid('Observed loss not found',404);
  return db.tx(async tx=>{const store=db.transactionStore(tx),row=await store.prepare('SELECT * FROM guardrail_reflections WHERE id=? AND user_id=?').get(id,userId);
    if(!row)throw invalid('Observed loss not found',404);const previous=capture(row);if(row.completed_at!==null)return previous; // immutable acknowledgement/idempotent retry
    const fields=reviewFields(body),at=new Date().toISOString();
    await store.prepare("UPDATE guardrail_reflections SET completed_at=?,reflection_json=?,completion_source='loss_reflection' WHERE id=? AND user_id=? AND completed_at IS NULL").run(at,JSON.stringify(fields),id,userId);
    return capture(await store.prepare('SELECT * FROM guardrail_reflections WHERE id=? AND user_id=?').get(id,userId));
  });
}
module.exports={invalid,text,reviewFields,fingerprint,knownNet,info,summary,days,reviewTrade,syncLosses,reflectionsForDay,reflectLoss};
