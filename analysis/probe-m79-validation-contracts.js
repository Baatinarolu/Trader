#!/usr/bin/env node
'use strict';
/** Real route/SQL tests of the admission error boundary. Deliberately tagged
 * local validation remains 400; unknown state, driver/audit failure cannot leak
 * details, waive permission or partially write. No provider/broker simulation. */
const path=require('path'),fs=require('fs'),os=require('os');
const APP=process.env.TJ_APP || path.join(__dirname,'../extracted/tradejournal');
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';
const file=path.join(os.tmpdir(),`m79-validation-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db')),B=require(path.join(APP,'src/bots')),G=require(path.join(APP,'src/bots/guardrails'));
let server,pass=0,fail=0;const results=[],ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m79-validation-${process.pid}@test.local`,name:'Input contracts',password:'test-only'}),token=await D.createSession(u.userId);
 const express=require(path.join(APP,'node_modules/express')),app=express();app.use(express.json());app.use('/api',require(path.join(APP,'src/routes/api')));server=await new Promise(r=>{const s=app.listen(0,'0.0.0.0',()=>r(s));});const base=`http://127.0.0.1:${server.address().port}/api`;
 const req=async(url,body)=>{const r=await fetch(base+url,{method:'POST',headers:{'x-session':token,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const plan={symbol:'TEST',timeframe:'15m',entry_tf:'5m',entry:100,stop:99,t1:110,account_id:u.accountId};
 const signals=async()=>(await D.db.prepare('SELECT COUNT(*) n FROM bot_signals WHERE user_id=?').get(u.userId)).n;
 const events=async()=>await D.db.prepare("SELECT * FROM guardrail_events WHERE user_id=? AND kind='override'").all(u.userId);
 const bad=[['model name',{entry_model:'bogus'}],['model type',{entry_model:{}}],['stop provenance',{stop_policy:{}}],['entry variant',{entry_preference:{}}],['evidence array',{entry_model:'market_shift',entry_evidence:[1]}],['evidence malformed JSON',{entry_model:'market_shift',entry_evidence:'{'}],['oversized evidence',{entry_model:'market_shift',entry_evidence:{model:'market_shift',tf:'5m',notes:'x'.repeat(16000)}}]];
 for(const [name,fields] of bad){
  const n=await signals(),r=await req('/bots/signals/save-plan',{...plan,...fields});
  // Existing public-route prevalidation intentionally keeps its {error} body.
  ok('existing HTTP input validation remains 400 without writing: '+name,r.status===400 && typeof r.data.error==='string' && await signals()===n,{status:r.status});
  let e;try{await B.savePlan(u.userId,{...plan,...fields});}catch(err){e=err;}
  ok('direct plan admission preserves trusted 400 instead of masking as outage: '+name,e?.status===400 && e.code==='guardrail_input_invalid' && await signals()===n,{status:e?.status,code:e?.code});
 }
 let r=await req('/bots/signals/save-plan',{...plan,entry:99});ok('zero saved actions do not claim personal permission',r.status===200 && r.data.saved===0 && r.data.permission?.allowed===false,r);
 const valid=await req('/bots/signals/save-plan',plan),id=valid.data.ids?.[0];const row=id?await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(id):{};
 ok('valid plan retains levels, grade-free semantics and real permission',valid.status===200 && valid.data.saved===1 && valid.data.permission?.state==='admitted' && row.entry===100 && row.stop===99 && row.t1===110,valid.status);
 const entry={symbol:'TEST',entry:100,stop:99,size:1,status:'open',entry_tf:'5m',account_id:u.accountId};for(let i=0;i<3;i++)await req('/trades',entry);
 const reason='One consciously reviewed exception, not a persistent unlock.';const before=await signals(),nEvents=(await events()).length;
 r=await req('/bots/signals/save-plan',{...plan,stop_policy:{},override_reason:reason});ok('stopped-day validation stays 400 and cannot fabricate an override',r.status===400 && await signals()===before && (await events()).length===nEvents,r.status);
 r=await req('/bots/signals/save-plan',{...plan,entry:99,override_reason:reason});ok('reason plus no action does not fabricate override permission or audit',r.status===200 && r.data.saved===0 && r.data.permission?.allowed===false && (await events()).length===nEvents,r);
 const original=B.correction.dailyState;B.correction.dailyState=async()=>{throw Error('Declared permission read outage');};r=await req('/bots/signals/save-plan',{...plan,override_reason:reason});B.correction.dailyState=original;
 ok('unavailable state still cannot be reason-waived',r.status===503 && r.data.daily?.permission?.can_override===false && await signals()===before,r.status);
 const clear=(await D.db.prepare("INSERT INTO accounts(user_id,name,starting_balance,current_balance) VALUES (?,'Validation rollback',10000,10000)").run(u.userId)).lastInsertRowid;
 let error;try{await G.admit(u.userId,{accountId:clear,entryTf:'5m',entityType:'trade'},async store=>{await store.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,entry) VALUES (?,?,'TEST','open',?,100)").run(u.userId,clear,new Date().toISOString());if(G.inputError)throw G.inputError('The locally validated input is invalid.');const e=Error('The locally validated input is invalid.');e.status=400;throw e;});}catch(e){error=e;}
 const count=async()=>(await D.db.prepare('SELECT COUNT(*) n FROM trades WHERE account_id=?').get(clear)).n;
 ok('tagged validation survives transaction boundary with exact public contract',error?.status===400 && error.message==='The locally validated input is invalid.',{status:error?.status,message:error?.message});
 ok('validation after a provisional insert rolls back that insert',await count()===0);
 try{await G.admit(u.userId,{accountId:clear,entryTf:'5m',entityType:'trade'},async()=>{const e=Error('PRIVATE_DRIVER_DETAIL SELECT internal_table');e.status=400;throw e;});}catch(e){error=e;}
 ok('arbitrary driver 4xx is NOT treated as public validation',error?.status===503 && error.code==='guardrail_unavailable' && !error.message.includes('PRIVATE_DRIVER_DETAIL') && await count()===0,{status:error?.status,message:error?.message});
 try{await G.admit(u.userId,{accountId:clear,entryTf:'5m',entityType:'trade',entityId:999999},async()=>undefined);error=null;}catch(e){error=e;}
 ok('a missing/no-op trade write cannot mint a durable entry admission',error?.status===503 && await count()===0,error?.status);
 await D.db.prepare("CREATE TRIGGER input_db_failure BEFORE INSERT ON bot_signals BEGIN SELECT RAISE(ABORT,'PRIVATE_DATABASE_DETAIL'); END").run();r=await req('/bots/signals/save-plan',{...plan,account_id:clear});await D.db.exec('DROP TRIGGER input_db_failure');
 ok('database write failure remains generic 503 with no secret/detail leak or signal',r.status===503 && !JSON.stringify(r.data).includes('PRIVATE_DATABASE_DETAIL') && await signals()===before,r.status);
}catch(e){fail++;console.error(e.stack);}finally{if(server)await new Promise(r=>server.close(r));if(process.env.M79_RESULT)fs.writeFileSync(process.env.M79_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Real HTTP/auth/SQL, declared local validation and driver-failure seams; transaction contract, not broker/live-feed/outcome proof'},null,2)+'\n');console.log(`M79 input contracts: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
