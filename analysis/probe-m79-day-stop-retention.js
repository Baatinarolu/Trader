#!/usr/bin/env node
'use strict';
/** Deliberately retained acceptance test for the remaining M79 gap: mutable
 * journal rows cannot be the lifetime counter of new-entry admissions. Do not
 * make this green by disabling honest deletion/correction or lowering its rule.
 */
const path=require('path'),fs=require('fs'),os=require('os');const APP=process.env.TJ_APP || path.join(__dirname,'../extracted/tradejournal');
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';const file=path.join(os.tmpdir(),`m79-retain-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db'));let server,pass=0,fail=0;const results=[],ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m79-retain-${process.pid}@test.local`,name:'Day retention',password:'test-only'});const token=await D.createSession(u.userId);
 const express=require(path.join(APP,'node_modules/express')),app=express();app.use(express.json());app.use('/api',require(path.join(APP,'src/routes/api')));server=await new Promise(resolve=>{const s=app.listen(0,'0.0.0.0',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/api`;
 const req=async(url,body,method='POST')=>{const r=await fetch(base+url,{method,headers:{'x-session':token,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const entry={symbol:'TEST',entry:100,stop:99,size:1,status:'open',entry_tf:'5m',account_id:u.accountId};const admitted=[];for(let i=0;i<3;i++)admitted.push(await req('/trades',entry));ok('three initial guarded entry admissions are real, not injected rows',admitted.every(r=>r.status===200 && r.data.permission?.allowed),admitted.map(r=>r.status));
 const stopped=await req('/trades',entry);ok('fourth current-journal entry is blocked',stopped.status===409,stopped.status);
 await req('/trades/'+admitted[0].data.trade.id,{},'DELETE');
 const again=await req('/trades',entry);ok('deleting an honest journal record cannot replenish the admission cap',again.status===409 && again.data.code==='guardrail_stop',{status:again.status,permission:again.data.permission,override_reason:again.data.trade?.override_reason});
 const response=await fetch(base+'/journal/'+new Date().toISOString().slice(0,10),{headers:{'x-session':token}});const day=await response.json();ok('breach history survives deletion even while remaining gate test exposes row counter gap',day.guardrail_events?.some(e=>e.snapshot.breaches.some(b=>b.rule==='max_trades_day')),day.guardrail_events?.length);
}catch(e){fail++;console.error(e.stack);}finally{if(server)await new Promise(r=>server.close(r));if(process.env.M79_RESULT)fs.writeFileSync(process.env.M79_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Retained M79 acceptance negative. Needs a separate durable admission/day-stop state; journal CRUD must remain honest.'},null,2)+'\n');console.log(`M79 day retention: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
