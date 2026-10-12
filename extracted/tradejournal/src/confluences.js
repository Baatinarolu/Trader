'use strict';
/** M88 human-declared entry reasons, NOT model checks/emotions/mistakes,
 * entry-time/broker proof, grades or risk inputs. NULL unknown != explicit []. */
const crypto=require('crypto');
const key=s=>s.normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase();
function invalid(message,status=400){return Object.assign(new Error(message),{code:'confluence_invalid',status});}
function labels(value){
  if(value===null)return null;
  if(!Array.isArray(value)||value.length>20)throw invalid('Use an explicit array of at most5 distinct plain-text entry reasons, or null for unknown.');
  const seen=new Set(),out=[];for(const raw of value){if(typeof raw!=='string'||/[\x00-\x1f\x7f]/.test(raw))throw invalid('Confluences must be single-line plain text.');const s=raw.normalize('NFC').trim().replace(/\s+/gu,' ');if(!s||s.length>80)throw invalid('Each entry confluence needs1–80 characters.');const k=key(s);if(!seen.has(k)){seen.add(k);out.push(s);}}
  if(out.length>5)throw invalid('Choose at most5 confluences you actually used; do not pad your reasons.');return out;
}

const {db}=require('./db');
const contextFields=['id','user_id','account_id','symbol','asset_class','direction','status','opened_at','closed_at','entry','exit','stop','target','size','fees','net_pnl','r_multiple','risk_amount','strategy_id','strategy_version','entry_model','entry_tf','entry_evidence','thesis','lesson','execution_notes','notes','tags','mistakes','mistakes_none','adherence','stop_honoured','stop_honoured_source','stop_honoured_recorded_at','execution_review_hash','journal_reviewed_at','journal_review_hash','setup_grade','screenshot_url','entry_confluences','entry_confluences_source','entry_confluences_recorded_at','gross_pnl','planned_r','mae_r','mfe_r','stop_moved','exit_reason','strategy_name','session','timeframes','emotion_before','emotion_after','confidence','guardrail_snapshot','entry_permission','override_reason','legs','entries','manual_mae','manual_mfe','created_at','updated_at'];
const revision=t=>crypto.createHash('sha256').update(JSON.stringify(contextFields.map(k=>[k,t[k]??null]))).digest('hex');
function info(t){
  let selected=null,state='unknown';try{if(t.entry_confluences!=null){selected=labels(JSON.parse(t.entry_confluences));state=selected===null?'unknown':selected.length===0?'none':selected.length===1?'partial':'selected';}
    const source=t.entry_confluences_source,time=t.entry_confluences_recorded_at;
    if(selected!==null||source!=null||time!=null){if(!['human_declared','imported'].includes(source)||typeof time!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time)||!Number.isFinite(Date.parse(time))||new Date(time).toISOString()!==time||Date.parse(time)>Date.now())throw invalid('Unavailable declaration metadata.');}
  }catch{selected=null;state='unavailable';}
  return {state,labels:selected,source:state==='unavailable'?null:t.entry_confluences_source??null,recorded_at:state==='unavailable'?null:t.entry_confluences_recorded_at??null,entry_time_verified:false,revision:revision(t),basis:'Human-declared market/setup reasons only; declaration/receiving time is NOT original entry-time or broker proof.'};
}
function optional(value,{json=false,present=value!==undefined}={}){
  if(!present||(json&&(value===undefined||value==='')))return {present:false,warnings:[]};
  try{return {present:true,labels:labels((json||typeof value==='string')&&value!==null?JSON.parse(value):value),warnings:[]};}catch(e){return {present:false,warnings:[e.message||'Invalid optional entry confluences skipped.']};}
}
async function owned(store,userId,id){if(!Number.isSafeInteger(id)||id<1)throw invalid('Trade not found.',404);const t=await store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,userId);if(!t)throw invalid('Trade not found.',404);return t;}
async function recordOn(store,t,value,{source='human_declared'}={}){
  const selected=labels(value),encoded=selected===null?null:JSON.stringify(selected),previous=info(t);
  if(t.entry_confluences===encoded&&t.entry_confluences_source===source&&previous.state!=='unavailable')return t;
  const recorded=new Date().toISOString();
  for(const label of selected||[])await store.prepare('INSERT INTO confluence_labels(user_id,label_key,label) VALUES(?,?,?) ON CONFLICT(user_id,label_key) DO NOTHING').run(t.user_id,key(label),label);
  await store.prepare('UPDATE trades SET entry_confluences=?,entry_confluences_source=?,entry_confluences_recorded_at=? WHERE id=? AND user_id=?').run(encoded,source,recorded,t.id,t.user_id);return owned(store,t.user_id,t.id);
}
async function attachOn(store,userId,id,input,{source='human_declared'}={}){if(!input?.present)return;return recordOn(store,await owned(store,userId,id),input.labels,{source});}
async function read(userId,id){const t=await owned(db,userId,id);return {trade_id:t.id,account_id:t.account_id,saved_record:{symbol:t.symbol,status:t.status,entry:t.entry,stop:t.stop,exit:t.exit},review:info(t)};}
async function change(userId,id,body){
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['labels','revision'].includes(k))||typeof body.revision!=='string'||!/^[a-f0-9]{64}$/.test(body.revision)||!Object.hasOwn(body,'labels'))throw invalid('Use labels and the displayed saved-record revision only.');
  const value=labels(body.labels);return db.tx(async tx=>{const store=db.transactionStore(tx),t=await owned(store,userId,id);if(body.revision!==revision(t))throw invalid('This trade changed. Reload and deliberately review its reasons before saving.',409);return {review:info(await recordOn(store,t,value))};});
}
function portableVocabulary(raw){
  if(raw===undefined)return {labels:[],warnings:[]};
  if(!Array.isArray(raw)||raw.length>5000)return {labels:[],warnings:['Optional reusable choices must be an array of at most5000 plain-text labels; skipped, financial rows unaffected.']};
  const values=new Map(),warnings=[];for(const item of raw){try{const value=labels([item])[0];if(!values.has(key(value)))values.set(key(value),value);}catch(e){if(warnings.length<20)warnings.push(e.message);}}return {labels:[...values.values()],warnings};
}
async function vocabularyOn(store,userId,values){for(const label of values)await store.prepare('INSERT INTO confluence_labels(user_id,label_key,label) VALUES(?,?,?) ON CONFLICT(user_id,label_key) DO NOTHING').run(userId,key(label),label);}
async function vocabulary(userId){return {labels:(await db.prepare('SELECT label FROM confluence_labels WHERE user_id=? ORDER BY label_key').all(userId)).map(t=>t.label)};}

/** Descriptive overlapping CLOSED journal cohorts, not predictive/causal evidence.
 * Strict outcome availability here is deliberately separate from legacy segments. */
function aggregate(trades){
  const coverage={closed_trades:0,unknown:0,none:0,partial:0,selected:0,unavailable:0,memberships:0,overlapping_labels:true,sample_floor:30};const map=new Map();
  for(const t of trades){if(t.status!=='closed')continue;coverage.closed_trades++;const v=info(t);coverage[v.state]++;if(!['partial','selected'].includes(v.state))continue;
    for(const label of v.labels){const k=key(label);if(!map.has(k))map.set(k,{label,list:[]});map.get(k).list.push({t,v});coverage.memberships++;}
  }
  const finite=n=>typeof n==='number'&&Number.isFinite(n),round=(n,d=2)=>Math.round(n*10**d)/10**d;
  const rows=[];for(const {label,list} of map.values()){
    const known=list.filter(({t})=>finite(t.net_pnl)),knownR=list.filter(({t})=>finite(t.net_pnl)&&finite(t.r_multiple)&&finite(t.risk_amount)&&t.risk_amount>0&&Math.abs(t.net_pnl-t.risk_amount*t.r_multiple)<=Math.max(.02,Math.abs(t.risk_amount)*.0001));
    const n=list.length,net=known.reduce((s,{t})=>s+t.net_pnl,0),r=knownR.reduce((s,{t})=>s+t.r_multiple,0),wins=known.filter(({t})=>t.net_pnl>0).length,losses=known.filter(({t})=>t.net_pnl<0).length;
    rows.push({key:label,label,trades:n,known_net_count:known.length,unavailable_net_count:n-known.length,wins,losses,breakeven:known.length-wins-losses,win_rate:known.length?round(wins*100/known.length):null,net_pnl:known.length===n?round(net):null,known_net_subtotal:known.length?round(net):null,known_r_count:knownR.length,total_r:knownR.length===n?round(r,4):null,expectancy_r:knownR.length===n?round(r/n,4):null,known_r_mean:knownR.length?round(r/knownR.length,4):null,human_declared_count:list.filter(({v})=>v.source==='human_declared').length,imported_count:list.filter(({v})=>v.source==='imported').length,entry_time_verified:false,sample_floor:30,sample_ready:n>=30,sample_note:n<30?'Descriptive only; below the course30-trade review floor.':'Descriptive recorded associations only; labels overlap and self-report does not prove prediction, causality or market edge.'});
  }
  rows.sort((a,b)=>b.trades-a.trades||key(a.key).localeCompare(key(b.key)));return {rows,coverage};
}
module.exports={key,labels,invalid,info,optional,owned,recordOn,attachOn,read,change,vocabulary,portableVocabulary,vocabularyOn,aggregate};
