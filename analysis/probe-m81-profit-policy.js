#!/usr/bin/env node
'use strict';
/** Actual SQLite/libSQL + authenticated account API. Policy only, measured
 * separately from profit-trigger/admission/UI behavior. Fixed server UTC clock. */
const fs=require('fs'),path=require('path'),os=require('os');
const APP=process.env.TJ_APP || path.join(__dirname,'../extracted/tradejournal');
const RealDate=Date,NOW=Date.UTC(2026,9,11,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';const file=path.join(os.tmpdir(),`m81-policy-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db')),Cor=require(path.join(APP,'src/bots/correction')),G=require(path.join(APP,'src/bots/guardrails'));
let server,pass=0,fail=0;const results=[],ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m81-policy-${process.pid}@test.local`,name:'Profit policy',password:'test-only'}),other=await D.createUser({email:`m81-policy-other-${process.pid}@test.local`,name:'Other',password:'test-only'});const token=await D.createSession(u.userId),otherToken=await D.createSession(other.userId);
 const express=require(path.join(APP,'node_modules/express')),app=express();app.use(express.json());app.use('/api',require(path.join(APP,'src/routes/api')));server=await new Promise(r=>{const s=app.listen(0,'0.0.0.0',()=>r(s));});const base=`http://127.0.0.1:${server.address().port}/api`;
 const req=async(url,body,method='POST',tok=token)=>{const r=await fetch(base+url,{method,headers:{'x-session':tok,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
 const acc=id=>D.db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(id,u.userId);
 const count=async()=>(await D.db.prepare('SELECT COUNT(*) n FROM accounts WHERE user_id=?').get(u.userId)).n;
 const columns=await D.db.prepare('PRAGMA table_info(accounts)').all(),dayColumns=await D.db.prepare('PRAGMA table_info(guardrail_day_caps)').all();
 ok('additive account schema has optional daily profit percentage',columns.some(c=>c.name==='daily_profit_limit_pct'));
 ok('daily policy can distinguish unselected legacy state from selected OFF',dayColumns.some(c=>c.name==='daily_profit_limit_pct') && dayColumns.some(c=>c.name==='profit_selected_at'));
 ok('existing/default accounts start OFF, not an invented universal ceiling',(await acc(u.accountId)).daily_profit_limit_pct===null);
 let r=await req('/accounts',{name:'Default profit policy'});ok('POST without ceiling defaults explicitly OFF',r.status===200 && r.data.account?.daily_profit_limit_pct===null,r.status);
 for(const value of [null,'','  ',0.25,1,'2.50',3,5,10,100]){
  const expected=value===null || String(value).trim()===''?null:Number(value);
  r=await req('/accounts',{name:'Explicit choice',daily_profit_limit_pct:value});
  ok('POST roundtrips explicit optional percentage '+JSON.stringify(value),r.status===200 && r.data.account?.daily_profit_limit_pct===expected,{status:r.status,value:r.data.account?.daily_profit_limit_pct});
  r=await req('/accounts/'+u.accountId,{daily_profit_limit_pct:value},'PUT');
  ok('PUT roundtrips optional percentage '+JSON.stringify(value),r.status===200 && (await acc(u.accountId)).daily_profit_limit_pct===expected,{status:r.status,value:(await acc(u.accountId)).daily_profit_limit_pct});
 }
 await req('/accounts/'+u.accountId,{daily_profit_limit_pct:1},'PUT');
 for(const value of [0,-1,100.01,true,false,[],{},'bad','NaN','Infinity','0x10']){
  const n=await count();r=await req('/accounts',{name:'Invalid choice',daily_profit_limit_pct:value});
  ok('invalid POST rejected without account write '+JSON.stringify(value),r.status===400 && await count()===n,r.status);
  r=await req('/accounts/'+u.accountId,{daily_profit_limit_pct:value},'PUT');
  ok('invalid PUT rejected without changing selected setting '+JSON.stringify(value),r.status===400 && (await acc(u.accountId)).daily_profit_limit_pct===1,r.status);
 }
 r=await req('/accounts/'+u.accountId,{name:'Renamed, same risk policy'},'PUT');ok('unrelated account edit retains selected ceiling',r.status===200 && r.data.account.daily_profit_limit_pct===1,r.status);
 r=await req('/accounts/'+u.accountId,{daily_profit_limit_pct:5},'PUT',otherToken);ok('another user cannot edit the ceiling',r.status===404 && (await acc(u.accountId)).daily_profit_limit_pct===1,r.status);
 const first=await Cor.guardrails(u.userId,{accountId:u.accountId,nowMs:NOW});
 ok('empty-sample operative rules use selected1%, not a guessed history number',first.daily_profit_limit_pct===1,first.daily_profit_limit_pct);
 ok('first scoped check persists the profit-selection clock',first.trade_cap_policy?.profit_selected_at===new Date(NOW).toISOString(),first.trade_cap_policy);
 await req('/accounts/'+u.accountId,{daily_profit_limit_pct:5},'PUT');const during=await Cor.guardrails(u.userId,{accountId:u.accountId,nowMs:NOW});
 ok('midday increase cannot erase the frozen1% ceiling',during.daily_profit_limit_pct===1,during.daily_profit_limit_pct);
 const tomorrow=await Cor.guardrails(u.userId,{accountId:u.accountId,nowMs:NOW+864e5});ok('next UTC day adopts the explicitly selected5%',tomorrow.daily_profit_limit_pct===5,tomorrow.daily_profit_limit_pct);
 for(let i=0;i<36;i++){const at=new Date(NOW-(2+Math.floor(i/12))*864e5+i%12*60000).toISOString();await D.db.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,closed_at,entry,exit,net_pnl,r_multiple,risk_amount) VALUES (?,?,'TEST','closed',?,?,100,101,100,1,100)").run(u.userId,u.accountId,at,at);}
 const history=await Cor.guardrails(u.userId,{accountId:u.accountId,nowMs:NOW});ok('profitable36-trade history cannot raise the preselected profit ceiling',history.daily_profit_limit_pct===1,history.daily_profit_limit_pct);
 const off=(await req('/accounts',{name:'Deliberately off',daily_profit_limit_pct:null})).data.account;
 const offFirst=await Cor.guardrails(u.userId,{accountId:off.id,nowMs:NOW});await req('/accounts/'+off.id,{daily_profit_limit_pct:1},'PUT');const offToday=await Cor.guardrails(u.userId,{accountId:off.id,nowMs:NOW}),offNext=await Cor.guardrails(u.userId,{accountId:off.id,nowMs:NOW+864e5});
 ok('OFF is a frozen policy too; enabling afterward applies next day',offFirst.daily_profit_limit_pct===null && offToday.daily_profit_limit_pct===null && offNext.daily_profit_limit_pct===1);
 await req('/accounts/'+u.accountId,{daily_profit_limit_pct:null},'PUT');const still=await Cor.guardrails(u.userId,{accountId:u.accountId,nowMs:NOW});const disabled=await Cor.guardrails(u.userId,{accountId:u.accountId,nowMs:NOW+2*864e5});
 ok('disabling midday does not erase today; future day can be OFF',still.daily_profit_limit_pct===1 && disabled.daily_profit_limit_pct===null);
 const race=(await req('/accounts',{name:'Concurrent selection',daily_profit_limit_pct:'2.5'})).data.account;const selected=await Promise.all(Array.from({length:8},()=>G.dailyCap(D.db,u.userId,race,NOW)));
 ok('eight simultaneous first checks agree on one profit policy/clock',selected.every(x=>x.daily_profit_limit_pct===2.5 && x.profit_selected_at===new Date(NOW).toISOString()),selected);
 ok('daily ceiling does not overwrite lifetime/prop profit target',(await acc(u.accountId)).profit_target_pct===8);
 ok('M11 below-floor rules still disclose30 and no personal adaptation',offFirst.min_trades_for_personal_guardrails===30 && offFirst.sample_sufficient===false);
 r=await req('/accounts',{name:'Unauthenticated',daily_profit_limit_pct:1},'POST','');ok('new setting still requires real authentication',r.status===401,r.status);
}catch(e){fail++;console.error(e.stack);}finally{if(server)await new Promise(r=>server.close(r));if(process.env.M81_RESULT)fs.writeFileSync(process.env.M81_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Actual local SQL/auth/account/UTC optional profit-policy selection, not trigger/market/broker/production proof'},null,2)+'\n');console.log(`M81 profit policy: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
