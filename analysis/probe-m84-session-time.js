#!/usr/bin/env node
'use strict';
/** Real HTTP/auth/local SQL; mutable server clock. Manual marker, not broker
 * screen time, execution permission or elapsed client-clock trust. */
const fs=require('fs'),path=require('path'),os=require('os');const APP=process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal');
const RealDate=Date;let NOW=Date.UTC(2026,9,11,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';const file=path.join(os.tmpdir(),`m84-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db')),C=require(path.join(APP,'src/bots/correction'));let server,pass=0,fail=0;const results=[];const ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m84-${process.pid}@test.local`,name:'Time marker',password:'test-only'}),other=await D.createUser({email:`m84-other-${process.pid}@test.local`,name:'Other',password:'test-only'}),token=await D.createSession(u.userId);
 const express=require(path.join(APP,'node_modules/express')),app=express();app.use(express.json());app.use('/api',require(path.join(APP,'src/routes/api')));server=await new Promise(r=>{const s=app.listen(0,'0.0.0.0',()=>r(s));});const base=`http://127.0.0.1:${server.address().port}/api`;
 const req=async(url,body,method='POST',auth=token)=>{const r=await fetch(base+url,{method,headers:{'content-type':'application/json',...(auth?{'x-session':auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});let data;try{data=await r.json();}catch{data={};}return {status:r.status,data};};
 const get=()=>req('/session-time?account_id='+u.accountId,undefined,'GET');const set=v=>req('/accounts/'+u.accountId,{max_session_minutes:v},'PUT');const start=(id=u.accountId)=>req('/session-time/start',{account_id:id,started_at:'2020-01-01T00:00:00Z',now_ms:1});const end=()=>req('/session-time/end',{account_id:u.accountId,ended_at:'2020-01-01T00:00:00Z'});const account=()=>D.db.prepare('SELECT * FROM accounts WHERE id=?').get(u.accountId);
 ok('additive account schema exposes nullable optional time selection',(await D.db.prepare('PRAGMA table_info(accounts)').all()).some(c=>c.name==='max_session_minutes'));
 ok('existing/new account defaults OFF, never a universal120-minute rule',(await account()).max_session_minutes===null);
 let r=await get();ok('real owned inspection accurately reports OFF/advisory only',r.status===200 && r.data.session?.state==='off' && r.data.session.advisory===true,r);
 r=await start();ok('cannot silently start an unconfigured time ceiling',r.status===400,r.status);
 const nativeAccount=await account();for(const v of [0,-1,1441,1.5,true,[],{},'0x78','bad']){r=await set(v);ok('invalid session-minute input is400/no selection write: '+JSON.stringify(v),r.status===400 && (await account()).max_session_minutes===nativeAccount.max_session_minutes,r.status);}
 for(const v of [1,'120',1440,null,'']){r=await set(v);ok('valid scalar session selection roundtrips: '+JSON.stringify(v),r.status===200 && r.data.account?.max_session_minutes===(v===null||v===''?null:Number(v)),r.data.account?.max_session_minutes);}
 await set(120);r=await req('/accounts/'+u.accountId,{name:'Other edit preserves time'},'PUT');ok('unrelated account edit retains chosen120 minutes',r.data.account?.max_session_minutes===120);
 r=await get();ok('selected but unstarted marker is not zero minutes of proven chart time',r.data.session?.state==='not_started' && r.data.session.elapsed_minutes===null,r.data.session);
 const before=await C.dailyState(u.userId,{accountId:u.accountId});r=await start();const original=r.data.session?.started_at;
 ok('manual start records SERVER clock and freezes chosen120 minutes',r.status===200 && original===new Date(NOW).toISOString() && r.data.session.limit_minutes===120,r);
 r=await start();ok('duplicate start is idempotent, not a way to replenish time',r.status===200 && r.data.session?.started_at===original,r);
 await set(240);NOW+=119*60000+59999;r=await get();ok('saved future duration240 cannot extend active frozen120',r.data.session?.limit_minutes===120 && r.data.session.state==='running' && r.data.session.started_at===original,r.data.session);
 NOW++;r=await get();ok('exact120-minute inclusive boundary gives elapsed warning',r.data.session?.state==='limit_reached' && r.data.session.elapsed_minutes===120 && /120/.test(r.data.session.message||''),r.data.session);
 await set(null);r=await get();ok('settings OFF cannot erase active time observation',r.data.session?.state==='limit_reached' && r.data.session.limit_minutes===120,r.data.session);
 const after=await C.dailyState(u.userId,{accountId:u.accountId});ok('time warning never creates an execution veto or changes other cap/risk rules',after.permission.allowed===before.permission.allowed && after.guardrails.max_trades_day===before.guardrails.max_trades_day && after.guardrails.max_risk_pct===before.guardrails.max_risk_pct);
 r=await end();ok('manual end uses server time and retains original elapsed warning',r.status===200 && r.data.session?.ended_at===new Date(NOW).toISOString() && r.data.session.state==='limit_reached',r);
 r=await end();ok('end retry cannot rewrite prior end timestamp',r.status===200 && r.data.session?.ended_at===new Date(NOW).toISOString(),r);
 await set(120);r=await start();ok('end/start on same UTC start-day does not reset frozen marker',r.status===200 && r.data.session?.started_at===original && !!r.data.session.ended_at,r);
 r=await req('/session-time?account_id='+other.accountId,undefined,'GET');ok('another owner cannot inspect marker/config404',r.status===404,r.status);r=await start(other.accountId);ok('another owner cannot write marker404',r.status===404,r.status);
 r=await req('/session-time?account_id='+u.accountId,undefined,'GET',null);ok('marker endpoint requires actual authentication401',r.status===401,r.status);
 NOW=Date.UTC(2026,9,12,23,30);await set(120);r=await start();const overnight=r.data.session?.started_at;ok('next UTC start-day permits a genuinely new server marker',r.status===200 && overnight===new Date(NOW).toISOString(),r);
 NOW+=60*60000;r=await get();ok('active marker crosses midnight without inventing a reset',!!r.data.session && r.data.session.started_at===overnight && r.data.session.elapsed_minutes===60 && r.data.session.state==='running',r.data.session);
 NOW+=60*60000;r=await get();ok('overnight marker still warns at selected two-hour boundary',r.data.session?.state==='limit_reached' && r.data.session.elapsed_minutes===120,r.data.session);
 r=await start();ok('new UTC day cannot silently replace an ongoing overnight marker',r.status===200 && r.data.session?.started_at===overnight,r);
 r=await end();await set(1);r=await start();ok('after explicit overnight end, today can start its own selected marker',r.status===200 && r.data.session?.limit_minutes===1 && r.data.session.started_at===new Date(NOW).toISOString(),r);
 const rows=await D.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='session_time_markers'").get();ok('marker table is real durable SQL, not localStorage-only decoration',rows.n===1);
 if(rows.n){const captures=await D.db.prepare('SELECT * FROM session_time_markers WHERE user_id=? AND account_id=? ORDER BY started_at').all(u.userId,u.accountId);ok('completed markers retain their frozen start/duration/end bytes',captures.length===3 && captures[0].started_at===original && captures[0].limit_minutes===120 && !!captures[0].ended_at,captures);}
 else ok('completed markers retain their frozen start/duration/end bytes',false,'no table');
}catch(e){fail++;console.error(e.stack);}finally{if(server)await new Promise(r=>server.close(r));if(process.env.M84_RESULT)fs.writeFileSync(process.env.M84_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Real auth/HTTP/SQL with declared mutable UTC server clock, manual advisory only; not broker screen time, automatic market/provider/production/pixel proof'},null,2)+'\n');console.log(`M84 session time: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
