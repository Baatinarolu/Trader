'use strict';
/** M89 APP-record/response timing, never broker-time or mental-state proof.
 * Optional evidence cannot authorise entry, score execution or complete writing. */
const crypto=require('crypto');
const WINDOW_MS=300000; // APP five-minute budget, not a course quotation.
const ENTRY=['id','user_id','account_id','symbol','direction','entry','stop','target','size','strategy_id','strategy_version','entry_model','entry_tf','opened_at'];
const EXIT=[...ENTRY,'closed_at','exit','fees','net_pnl','risk_amount','r_multiple','legs'];
function invalid(message,status=400){return Object.assign(new Error(message),{code:'emotion_capture_invalid',status});}
function input(value){if(value===null)return null;if(typeof value!=='string'||!value.trim()||value.length>100||/[\x00-\x1f\x7f]/.test(value))throw invalid('Name the emotional state in1–100 single-line characters or explicitly choose unknown.');return value.trim();}
function stamp(value){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))return null;const n=Date.parse(value);return Number.isFinite(n)&&new Date(n).toISOString()===value?n:null;}
function snapshot(t,phase){if(!['entry','exit'].includes(phase))throw invalid('Unknown capture phase.');return Object.fromEntries([...new Set([...(phase==='entry'?ENTRY:EXIT),'status'])].map(k=>[k,t[k]??null]));}
const hash=(s,phase)=>crypto.createHash('sha256').update(JSON.stringify((phase==='entry'?ENTRY:EXIT).map(k=>[k,s[k]??null]))).digest('hex');
function classify(t,event,response,now=Date.now()){
  const base={event_id:event?.id??null,phase:event?.phase??null,state:'unavailable',emotion:null,source:event?.source??null,app_observed_at:event?.source==='imported'?null:event?.app_observed_at??null,answered_at:response?.answered_at??null,received_at:event?.source==='imported'?event.app_observed_at:null,delay_ms:null,current_context:false,eligible:false,window_ms:WINDOW_MS,broker_verified:false,basis:'Server app-event and first-response timing only; not broker execution, actual mental state, causation, permission or grade.'};
  try{
    if(!event||!['entry','exit'].includes(event.phase)||!['app_entry','app_close','retrospective','imported'].includes(event.source)||event.source==='app_entry'&&event.phase!=='entry'||event.source==='app_close'&&event.phase!=='exit'||event.user_id!==t.user_id||event.trade_id!==t.id)throw invalid('Unavailable event identity.');
    const s=JSON.parse(event.snapshot),at=stamp(event.app_observed_at);if(event.source==='app_entry'&&s?.status!=='open'||event.source==='app_close'&&s?.status!=='closed')throw invalid('Unavailable observed lifecycle.');if(!s||s.id!==t.id||s.user_id!==t.user_id||s.account_id!==event.account_id||hash(s,event.phase)!==event.context_hash||at===null||at>now)throw invalid('Unavailable event context/clock.');
    const matches=hash(snapshot(t,event.phase),event.phase)===event.context_hash;let state=matches?'pending':'prior',emotion=null,answered=null,delay=null;
    if(response){const r=JSON.parse(response.snapshot),ms=stamp(response.answered_at);emotion=input(response.emotion);if(response.event_id!==event.id||!r||hash(r,event.phase)!==event.context_hash||ms===null||ms<at||ms>now)throw invalid('Unavailable response.');answered=response.answered_at;delay=ms-at;
      if(matches){const financial=stamp(event.phase==='entry'?s.opened_at:s.closed_at),age=financial===null?Infinity:at-financial;state=emotion===null?'unknown':event.source==='imported'?'imported':event.source==='retrospective'?'retrospective':delay<=WINDOW_MS&&age>=0&&age<=WINDOW_MS&&(event.phase==='exit'?r.status==='closed':r.status==='open')?'timely':'late';}
    }
    if(event.source==='imported')state='imported';return {...base,state,emotion,historical:event.historical_json?JSON.parse(event.historical_json):null,answered_at:event.source==='imported'?null:answered,delay_ms:event.source==='imported'?null:delay,current_context:matches&&event.source!=='imported',eligible:state==='timely',recorded_context:s};
  }catch{return base;}
}

const {db}=require('./db');
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function owned(store,userId,id){if(!Number.isSafeInteger(id)||id<1)throw invalid('Trade not found.',404);const t=await store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,userId);if(!t)throw invalid('Trade not found.',404);return t;}
async function rowsOn(store,userId,id){const rows=await store.prepare(`SELECT e.*,r.event_id response_id,r.emotion,r.answered_at,r.snapshot answer_snapshot FROM trade_emotion_events e LEFT JOIN trade_emotion_responses r ON r.event_id=e.id WHERE e.user_id=? AND e.trade_id=? ORDER BY e.id`).all(userId,id);return rows.map(r=>({event:r,response:r.response_id==null?null:{event_id:r.response_id,emotion:r.emotion,answered_at:r.answered_at,snapshot:r.answer_snapshot}}));}
const revision=(t,phase,selected)=>sha([require('./confluences').info(t).revision,phase,selected?.event,selected?.response]);
function view(t,rows){
  const phases={};for(const phase of ['entry','exit']){
    const all=rows.filter(r=>r.event.phase===phase),app=all.filter(r=>r.event.source===(phase==='entry'?'app_entry':'app_close'));
    const clock=phase==='entry'?'opened_at':'closed_at',sameCycle=app.filter(r=>{try{return JSON.parse(r.event.snapshot)[clock]===t[clock];}catch{return false;}});
    const selected=sameCycle.at(-1)||app.at(-1)||all.at(-1);
    phases[phase]={...(selected?classify(t,selected.event,selected.response):{event_id:null,phase,state:'unknown',emotion:null,eligible:false,broker_verified:false,window_ms:WINDOW_MS,app_observed_at:null,answered_at:null}),revision:revision(t,phase,selected)};
  }
  return {trade_id:t.id,account_id:t.account_id,saved_record:{symbol:t.symbol,status:t.status,entry:t.entry,stop:t.stop,exit:t.exit},...phases,history:rows.map(r=>classify(t,r.event,r.response)),legacy:{emotion_before:t.emotion_before||'',emotion_after:t.emotion_after||'',basis:'Compatibility self-report, NOT timing proof. Later journal edits do not rewrite the immutable first response.'}};
}
async function read(userId,id){return db.tx(async tx=>{const store=db.transactionStore(tx),t=await owned(store,userId,id);return view(t,await rowsOn(store,userId,id));});}
async function eventOn(store,t,phase,source,transition=''){
  const s=snapshot(t,phase),digest=hash(s,phase),at=new Date().toISOString(),eventKey=sha([phase,source,digest,transition]);
  await store.prepare('INSERT INTO trade_emotion_events(user_id,trade_id,account_id,phase,source,event_key,app_observed_at,snapshot,context_hash) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,trade_id,event_key) DO NOTHING').run(t.user_id,t.id,t.account_id,phase,source,eventKey,at,JSON.stringify(s),digest);
  return store.prepare('SELECT * FROM trade_emotion_events WHERE user_id=? AND trade_id=? AND event_key=?').get(t.user_id,t.id,eventKey);
}
/** Called AFTER truthful financial commit. Evidence outage is an explicit warning,
 * never financial rollback or guessed clock/state; concurrent correction skips. */
async function observe(userId,expected,phase,source,transition=''){
  try{return await db.tx(async tx=>{const store=db.transactionStore(tx),t=await owned(store,userId,expected.id);if(t.account_id!==expected.account_id||hash(snapshot(t,phase),phase)!==hash(snapshot(expected,phase),phase)||t.status!==(phase==='entry'?'open':'closed'))return {emotion_prompt:null,emotion_warnings:['Financial record changed before optional emotion observation; no timely capture inferred.']};const e=await eventOn(store,t,phase,source,transition);return {emotion_prompt:{phase,event_id:e.id,trade_id:t.id,account_id:t.account_id},emotion_warnings:[]};});}catch{return {emotion_prompt:null,emotion_warnings:['Financial truth recorded; optional emotion observation unavailable. No captured state or timing inferred.']};}
}
async function answer(userId,id,phase,body){
  if(!['entry','exit'].includes(phase)||!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['event_id','emotion','revision'].includes(k))||!Object.hasOwn(body,'emotion')||!Object.hasOwn(body,'event_id')||body.event_id!==null&&(!Number.isSafeInteger(body.event_id)||body.event_id<1)||typeof body.revision!=='string'||!/^[a-f0-9]{64}$/.test(body.revision))throw invalid('Use the displayed event_id/revision and an explicit emotional state or null only.');
  const value=input(body.emotion);return db.tx(async tx=>{const store=db.transactionStore(tx),t=await owned(store,userId,id),rows=await rowsOn(store,userId,id),v=view(t,rows),slot=v[phase];
    if(phase==='exit'&&t.status!=='closed')throw invalid('Record the actual close before an exit-state report.',409);
    if(body.revision!==slot.revision||body.event_id!==slot.event_id)throw invalid('Saved record or capture changed. Reload and deliberately review the current event.',409);
    let selected=rows.find(r=>r.event.id===body.event_id);
    if(selected?.response){if(selected.response.emotion===value)return v;throw invalid('The first response is retained unchanged. Later corrections belong in retrospective journal text, not a new fresh capture.',409);}
    if(selected&&(!slot.current_context||slot.state==='unavailable'||slot.source==='imported'))throw invalid('Prior/imported/unavailable events cannot be converted into new timely proof.',409);
    if(!selected){const e=await eventOn(store,t,phase,'retrospective','explicit manual '+new Date().toISOString());selected={event:e};}
    const at=new Date().toISOString(),s=snapshot(t,phase);await store.prepare('INSERT INTO trade_emotion_responses(event_id,emotion,answered_at,snapshot) VALUES(?,?,?,?)').run(selected.event.id,value,at,JSON.stringify(s));
    if(value!==null)await store.prepare('UPDATE trades SET '+(phase==='entry'?'emotion_before':'emotion_after')+'=? WHERE id=? AND user_id=?').run(value,id,userId);
    return view(await owned(store,userId,id),await rowsOn(store,userId,id));
  });
}
async function annotate(rows){try{if(!rows.length)return [];const user=rows[0].user_id,events=await db.prepare(`SELECT e.*,r.event_id response_id,r.emotion,r.answered_at,r.snapshot answer_snapshot FROM trade_emotion_events e LEFT JOIN trade_emotion_responses r ON r.event_id=e.id WHERE e.user_id=? ORDER BY e.id`).all(user),map=new Map();for(const r of events){if(!map.has(r.trade_id))map.set(r.trade_id,[]);map.get(r.trade_id).push({event:r,response:r.response_id==null?null:{event_id:r.response_id,emotion:r.emotion,answered_at:r.answered_at,snapshot:r.answer_snapshot}});}return rows.map(t=>({...t,emotion_capture:view(t,map.get(t.id)||[])}));}catch{return rows.map(t=>({...t,emotion_capture:{entry:{state:'unavailable',eligible:false},exit:{state:'unavailable',eligible:false}}}));}}

function captured(t){const v=t.emotion_capture?.entry;return t.status==='closed'&&v?.state==='timely'&&v.eligible===true&&v.source==='app_entry'&&v.broker_verified===false&&v.current_context===true&&typeof v.emotion==='string'&&v.emotion.trim()&&typeof v.delay_ms==='number'&&v.delay_ms>=0&&v.delay_ms<=WINDOW_MS?v.emotion:null;}
function aggregate(trades){
 const coverage={closed_trades:0,timely:0,late:0,unknown:0,pending:0,retrospective:0,imported:0,prior:0,unavailable:0,window_ms:WINDOW_MS,broker_verified:false},map=new Map();
 for(const t of trades){if(t.status!=='closed')continue;coverage.closed_trades++;const state=t.emotion_capture?.entry?.state||'unknown',value=captured(t);if(value){coverage.timely++;const text=value.trim().replace(/\s+/gu,' '),k=text.toLowerCase();if(!map.has(k))map.set(k,{text,rows:[]});map.get(k).rows.push(t);}else coverage[Object.hasOwn(coverage,state)&&state!=='timely'?state:'unavailable']++;}
 const finite=n=>typeof n==='number'&&Number.isFinite(n),round=(n,d=2)=>Math.round(n*10**d)/10**d,rows=[];
 for(const {text,rows:list}of map.values()){const known=list.filter(t=>finite(t.net_pnl)),rs=list.filter(t=>finite(t.net_pnl)&&finite(t.r_multiple)&&finite(t.risk_amount)&&t.risk_amount>0&&Math.abs(t.net_pnl-t.risk_amount*t.r_multiple)<=Math.max(.02,t.risk_amount*.0001)),n=list.length,net=known.reduce((s,t)=>s+t.net_pnl,0),r=rs.reduce((s,t)=>s+t.r_multiple,0),wins=known.filter(t=>t.net_pnl>0).length,losses=known.filter(t=>t.net_pnl<0).length;rows.push({key:text,trades:n,known_net_count:known.length,unavailable_net_count:n-known.length,wins,losses,breakeven:known.length-wins-losses,win_rate:known.length?round(wins*100/known.length):null,net_pnl:known.length===n?round(net):null,known_r_count:rs.length,expectancy_r:rs.length===n?round(r/n,4):null,sample_floor:30,sample_ready:n>=30,capture_basis:'app_record_window_self_report',broker_verified:false});}
 rows.sort((a,b)=>b.trades-a.trades||a.key.localeCompare(b.key));return {rows,coverage};
}

function declaredContext(raw,phase){
 if(raw==null)return null;if(typeof raw!=='object'||Array.isArray(raw)||Buffer.byteLength(JSON.stringify(raw),'utf8')>8192)throw invalid('Unverified original emotion context omitted: invalid shape/app8KB budget.');const out={};
 for(const k of [...(phase==='entry'?ENTRY:EXIT),'status']){if(!Object.hasOwn(raw,k))continue;const v=raw[k];if(v!==null&&!(typeof v==='string'&&v.length<=2048)&&!(typeof v==='number'&&Number.isFinite(v)))throw invalid('Unverified original emotion context omitted: invalid field '+k+'.');out[k]=v;}return out;
}
function parsePortable(raw,{json=false}={}){
 const result={entries:[],warnings:[]};if(raw===undefined||raw===null||raw==='')return result;
 try{if(json||typeof raw==='string')raw=JSON.parse(raw);if(!raw||raw.version!==1||!Array.isArray(raw.entries)||raw.entries.length>50)throw invalid('Optional emotion history needs version1 and at most50 entries.');if(raw.unavailable||raw.unavailable_events>0)result.warnings.push('Original backup reports unavailable emotion history; no lost response can be inferred.');
  for(const e of raw.entries){try{if(!e||!['entry','exit'].includes(e.phase)||!Object.hasOwn(e,'emotion'))throw invalid('Invalid optional emotion phase/state.');const emotion=input(e.emotion),originalSource=e.historical?.source??e.source,historical={source:typeof originalSource==='string'?originalSource.slice(0,80):null,app_observed_at:null,answered_at:null,recorded_context:null};try{historical.recorded_context=declaredContext(e.historical?.recorded_context??e.recorded_context,e.phase);}catch(err){result.warnings.push(err.message);}for(const field of ['app_observed_at','answered_at']){const value=e.historical?.[field]??e[field];if(value!=null){const n=stamp(value);if(n!==null&&n<=Date.now())historical[field]=value;else result.warnings.push('Unverified invalid/future original emotion clock omitted.');}}result.entries.push({phase:e.phase,emotion,historical});}catch(err){result.warnings.push(err.message);}}
 }catch(err){result.warnings.push(err.message||'Invalid optional emotion history omitted.');}result.warnings=result.warnings.slice(0,20);return result;
}
async function importOn(store,t,parsed){for(const e of parsed?.entries||[]){const s=snapshot(t,e.phase),at=new Date().toISOString(),key=sha(['imported',t.id,e.phase,crypto.randomUUID()]);const r=await store.prepare('INSERT INTO trade_emotion_events(user_id,trade_id,account_id,phase,source,event_key,app_observed_at,snapshot,context_hash,historical_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run(t.user_id,t.id,t.account_id,e.phase,'imported',key,at,JSON.stringify(s),hash(s,e.phase),JSON.stringify(e.historical));await store.prepare('INSERT INTO trade_emotion_responses(event_id,emotion,answered_at,snapshot) VALUES(?,?,?,?)').run(r.lastInsertRowid,e.emotion,at,JSON.stringify(s));}}
async function portableRowsOn(store,rows){const out=[];for(const t of rows){let events;try{events=await rowsOn(store,t.user_id,t.id);}catch{out.push({...t,emotion_events:{version:1,entries:[],unavailable_events:null,unavailable:true}});continue;}const entries=[];let unavailable=0;for(const r of events){const v=classify(t,r.event,r.response);if(v.state==='unavailable'){unavailable++;continue;}if(!r.response)continue;entries.push({phase:v.phase,emotion:v.emotion,source:v.source,app_observed_at:v.app_observed_at,answered_at:v.answered_at,recorded_context:v.recorded_context,...(v.historical?{historical:v.historical}:{})});}out.push({...t,emotion_events:{version:1,entries,unavailable_events:unavailable}});}return out;}
module.exports={WINDOW_MS,input,stamp,snapshot,hash,classify,invalid,owned,view,read,observe,answer,annotate,rowsOn,eventOn,captured,aggregate,parsePortable,importOn,portableRowsOn};
