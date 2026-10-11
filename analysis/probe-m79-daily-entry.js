#!/usr/bin/env node
'use strict';
/** Real libSQL + Cor.dailyState + authenticated entry/plan routes. Fixed server
 * clock is internal to this test process, never an accepted public timestamp.
 */
const path=require('path'),fs=require('fs'),os=require('os');
const APP=process.env.TJ_APP || path.join(__dirname,'../extracted/tradejournal');
const RealDate=Date, NOW=Date.UTC(2026,9,11,12,0);
global.Date=class extends RealDate { constructor(...a){super(...(a.length?a:[NOW]));} static now(){return NOW;} };
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN']) process.env[k]='';
const file=path.join(os.tmpdir(),`m79-entry-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db')),Cor=require(path.join(APP,'src/bots/correction')),B=require(path.join(APP,'src/bots')),N=require(path.join(APP,'src/bots/now'));
let pass=0,fail=0,server;const rejections=[];process.on('unhandledRejection',e=>{rejections.push(String(e?.message || e));console.error('OBSERVED unhandled rejection:',e?.message || e);});const results=[],iso=ms=>new Date(ms).toISOString();
function ok(label,v,detail){results.push({label,passed:!!v,...(!v?{detail}: {})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;}
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m79-entry-${process.pid}@test.local`,name:'Entry guard',password:'test-only'}),other=await D.createUser({email:`m79-entry-other-${process.pid}@test.local`,name:'Other',password:'test-only'});
 const token=await D.createSession(u.userId);const second=await D.db.prepare("INSERT INTO accounts(user_id,name,starting_balance,current_balance) VALUES (?,'Second',10000,10000)").run(u.userId);const a2=second.lastInsertRowid;
 // Each numeric boundary is an independent fixture, NOT a user CRUD action.
 // Durable deletion/restart semantics are tested WITHOUT resets in the dedicated
 // durable-state and retained day-stop acceptance probes.
 const hasRetention=!!(await D.db.prepare("SELECT name FROM sqlite_master WHERE name='guardrail_day_state'").get());
 const reset=async()=>{await D.db.prepare('DELETE FROM trades').run();if(hasRetention){await D.db.exec('DELETE FROM guardrail_day_state; DELETE FROM guardrail_entry_admissions');}};
 const row=async(o={})=>{const t={user:u.userId,account:u.accountId,status:'closed',opened:iso(NOW-7200000),closed:iso(NOW-3600000),pnl:10,...o};return (await D.db.prepare('INSERT INTO trades(user_id,account_id,symbol,status,opened_at,closed_at,entry,exit,net_pnl,r_multiple) VALUES (?,?,\'TEST\',?,?,?,100,101,?,?)').run(t.user,t.account,t.status,t.opened,t.closed,t.pnl,t.pnl/100)).lastInsertRowid;};
 const state=(opts={})=>Cor.dailyState(u.userId,{accountId:u.accountId,nowMs:NOW,entryTf:'5m',forEntry:true,...opts});
 const rule=(d,k)=>d.breaches?.some(b=>b.rule===k);
 await reset();let d=await state();ok('resolved rule numbers, never a Promise/empty object',d.guardrails?.max_trades_day===3 && !(d.guardrails instanceof Promise),d.guardrails);ok('empty positive account is clear,3 remain',d.status==='clear' && d.remaining_trades===3 && d.permission?.allowed,d);
 for(let i=0;i<2;i++) await row({status:'open',closed:null,pnl:0});d=await state();ok('two OPEN attempts count; last remaining entry is caution, not a stop',d.status==='caution' && d.today?.trades===2 && d.remaining_trades===1 && d.permission?.allowed,d);
 await row({status:'open',closed:null,pnl:0});d=await state();ok('three OPEN attempts exhaust the cap',d.status==='stop' && rule(d,'max_trades_day') && d.remaining_trades===0,d);
 await reset();for(let i=0;i<3;i++)await row();d=await state();ok('three CLOSED attempts also exhaust the cap',rule(d,'max_trades_day') && !d.permission?.allowed,d);
 await reset();for(let i=0;i<7;i++)await row({account:a2,pnl:-100});for(let i=0;i<7;i++)await row({user:other.userId,account:other.accountId,pnl:-100});d=await state();ok('foreign account and foreign user do not consume count/P&L/streak',d.today?.trades===0 && d.today?.realised===0 && d.today?.loss_streak===0 && d.status==='clear',d);
 const defaultD=await Cor.dailyState(u.userId,{entryTf:'5m',forEntry:true});ok('omitted account resolves ONE owned default, not combined accounts',defaultD.account_id===u.accountId && defaultD.today?.trades===0,defaultD);
 const foreign=await state({accountId:other.accountId});ok('foreign account cannot receive clear permission',foreign.status==='unknown' && !foreign.permission?.allowed && !foreign.permission?.can_override,foreign);
 await D.db.prepare('UPDATE accounts SET archived=1 WHERE id=?').run(a2);const archived=await state({accountId:a2});ok('archived account cannot receive clear permission',archived.status==='unknown' && !archived.permission?.allowed,archived);await D.db.prepare('UPDATE accounts SET archived=0 WHERE id=?').run(a2);
 await reset();await row({pnl:-300});d=await state();ok('daily realised loss stops at EXACT3% boundary',rule(d,'daily_loss_limit'),d);
 await reset();await row({pnl:-299.99});d=await state();ok('one cent short of daily loss limit does not trigger that rule',!rule(d,'daily_loss_limit'),d);
 await reset();await row({status:'open',closed:null,pnl:-4000});d=await state();ok('floating/open P&L never triggers realised loss stop',d.today?.realised===0 && !rule(d,'daily_loss_limit'),d);
 await reset();await row({opened:iso(NOW-864e5),closed:iso(NOW-3600000),pnl:-300});d=await state();ok('overnight trade CLOSED today enters today realised loss',d.today?.trades===0 && d.today?.closed===1 && rule(d,'daily_loss_limit'),d);
 await reset();await row({opened:iso(NOW-7200000),closed:iso(NOW-864e5),pnl:-200});d=await state();ok('a close yesterday is not today realised P&L',d.today?.realised===0 && d.today?.loss_streak===0 && d.status==='clear',d);
 await reset();await row({opened:iso(NOW-2*864e5),closed:iso(NOW-864e5),pnl:1000});await row({pnl:-330});d=await state();ok('percentage loss anchor is day-start realised11000, boundary330',d.today?.balance===11000 && d.today?.loss_limit===330 && rule(d,'daily_loss_limit'),d);
 await reset();await row({pnl:-10,closed:iso(NOW-7200000)});await row({pnl:-10,closed:iso(NOW-3600000)});d=await state();ok('two consecutive losses today stop',d.today?.loss_streak===2 && rule(d,'consecutive_losses'),d);
 await row({pnl:1,closed:iso(NOW-3000000)});d=await state();ok('later non-loss resets current streak but not an already observed rule-day stop',d.today?.loss_streak===0 && (hasRetention ? rule(d,'consecutive_losses') && !d.permission.allowed : !rule(d,'consecutive_losses')),d);
 await reset();await row({pnl:-10,opened:iso(NOW-2*864e5),closed:iso(NOW-864e5)});await row({pnl:-10,opened:iso(NOW-2*864e5),closed:iso(NOW-864e5+60000)});d=await state();ok('yesterday loss streak does not lock the new day',!rule(d,'consecutive_losses') && d.status==='clear',d);
 await reset();await row({pnl:-10,closed:iso(NOW-1799999)});d=await state();ok('post-loss cooldown is a STOP one millisecond before30min',rule(d,'post_loss_cooldown') && !d.permission?.allowed,d);
 await reset();await row({pnl:-10,closed:iso(NOW-1800000)});d=await state();ok('cooldown expires at exact30min boundary',!rule(d,'post_loss_cooldown') && d.permission?.allowed,d);
 await reset();await row({pnl:-10,closed:iso(NOW-1860000)});d=await state({entryTf:'1h'});ok('very next1h candle still blocks after30min cooldown',rule(d,'no_next_candle') && !rule(d,'post_loss_cooldown'),d);
 await reset();await row({pnl:-10,closed:iso(NOW-3600000)});d=await state({entryTf:'1h'});ok('next-candle barrier expires on its exact close',!rule(d,'no_next_candle') && d.permission?.allowed,d);
 await reset();await row({pnl:-10,closed:iso(NOW-2700000)});d=await state({entryTf:'1h'});ok('loss inside a bar excludes the next FULL candle',rule(d,'no_next_candle') && d.post_loss?.next_candle_until===iso(NOW+3600000),d);
 for(const tf of [null,'bad']){d=await state({entryTf:tf});ok('unknown prospective entry TF is not guessed: '+tf,d.status==='unknown' && !d.permission?.allowed && !d.permission?.can_override,d);}
 await reset();await row({closed:null,pnl:-10});d=await state();ok('today closed record with unknown close time fails closed, not a fabricated cooldown',d.status==='unknown' && !d.permission?.allowed,d);
 await reset();await row({opened:iso(NOW+60000),closed:iso(NOW+120000),pnl:-400});d=await state();ok('future journal timestamps do not count as already occurred',d.today?.trades===0 && d.today?.realised===0,d);
 await reset();await D.db.prepare('UPDATE accounts SET starting_balance=0 WHERE id=?').run(u.accountId);d=await state();ok('zero day-start equity is unavailable, not silently clear',d.status==='unknown' && !d.permission?.allowed,d);await D.db.prepare('UPDATE accounts SET starting_balance=10000 WHERE id=?').run(u.accountId);
 const series={price:100,atr:1,candles:[{t:NOW-300000,o:100,h:101,l:99,c:100,v:1}],smc:{atr:1}};
 const td={direction:1,status:'confirmed',blocked:false,conviction:{tier:'A'},steps:[],conflicts:[],playbook:[],layers:{bias:{state:'confirmed',range:{low:99,high:110}}},crt_plan:{side:'long',dir:1,range:{low:99,high:110},sweep:{level:99,extreme:98},aggressive:{entry:100,stop:99,target:110,rr:10},safer:{entry:100,stop:99,target:110,rr:10}}};
 const setups={verdict:{action:'BUY',dir:1},candidates:[{dir:1,side:'long',ok:true,levels:{entry:100,stop:99,targets:[{price:110,rr:10}],rr_primary:10,rr_final:10}}]};
 for(const status of ['stop','unknown']){const n=N.build({td,setups,series,symbol:'TEST',tf:'5m',nowMs:NOW,daily:{status,message:'Personal stop fixture',permission:{allowed:false,can_override:status==='stop'}}});ok('Now cannot arm a technically qualifying order during '+status,n.action==='NO TRADE' && !n.armed && !n.order && !n.full_risk && n.guards.some(g=>g.level==='block'),n);}
 const express=require(path.join(APP,'node_modules/express')),app=express();app.use(express.json());app.use('/api',require(path.join(APP,'src/routes/api')));
 server=await new Promise(resolve=>{const s=app.listen(0,'0.0.0.0',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/api`;
 const request=async(url,body,method='POST',tok=token)=>{const r=await fetch(base+url,{method,headers:{'x-session':tok,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
 const entry={symbol:'TEST',entry:100,stop:99,size:1,status:'open',entry_tf:'5m',account_id:u.accountId};
 await reset();const admitted=await request('/trades',{...entry,opened_at:iso(NOW-864e5)});ok('clear live entry is admitted',admitted.status===200 && admitted.data.permission?.allowed,admitted);ok('live entry timestamp is server-stamped, cannot dodge count by backdating',admitted.data.trade?.opened_at===iso(NOW),admitted);
 await reset();for(let i=0;i<3;i++)await row({status:'open',closed:null,pnl:0});let r=await request('/trades',entry);ok('authenticated POST mechanically blocks open entry at cap',r.status===409 && r.data.code==='guardrail_stop',r);ok('blocked POST creates no extra trade',(await D.db.prepare('SELECT COUNT(*) n FROM trades').get()).n===3);
 const record=await request('/trades',{...entry,record_only:true});ok('honest already-executed OPEN record remains recordable, no permission',record.status===200 && record.data.permission?.allowed===false && record.data.permission?.state==='record_only',record);
 const historical=await request('/trades',{...entry,status:'closed',exit:99,opened_at:iso(NOW-864e5),closed_at:iso(NOW-863e5)});ok('historical CLOSED record remains recordable at stop, no permission',historical.status===200 && historical.data.permission?.allowed===false,historical);
 const reopen=await request('/trades/'+historical.data.trade.id,{status:'open'},'PUT');ok('closed-to-open update cannot evade the new-entry gate',reopen.status===409,reopen);
 const edit=await request('/trades/'+historical.data.trade.id,{notes:'Honest retrospective correction'},'PUT');ok('historical correction is not blocked by current permission',edit.status===200,edit);
 const close=await request('/trades/'+record.data.trade.id+'/close',{exit:99,notify:false});ok('recording an actual close is never blocked by entry stop',close.status===200,close);
 const plan={symbol:'TEST',timeframe:'15m',entry_tf:'5m',entry:100,stop:99,t1:110,account_id:u.accountId};r=await request('/bots/signals/save-plan',plan);ok('save-plan route rechecks cap, not just client snapshot',r.status===409 && r.data.code==='guardrail_stop',r);
 const research=await request('/bots/signals/save-plan',{...plan,research_only:true});ok('explicit research plan is recordable, never permission',research.status===200 && research.data.saved===1,research);
 const stale={symbol:'TEST',timeframe:'15m',topdown:{direction:1,blocked:false},setups};try{await B.saveSignals(u.userId,stale);ok('saveSignals cannot replay a formerly clear client/analysis payload through current stop',false);}catch(e){ok('saveSignals cannot replay a formerly clear client/analysis payload through current stop',e.code==='guardrail_stop',{code:e.code,status:e.status});}
 await reset();for(let i=0;i<2;i++)await row({status:'open',closed:null,pnl:0});const races=await Promise.all(Array.from({length:6},()=>request('/trades',entry)));const count=(await D.db.prepare('SELECT COUNT(*) n FROM trades').get()).n;
 ok('atomic concurrent admission never exceeds the3-entry cap',count===3 && races.filter(r=>r.status===200).length===1,{count,statuses:races.map(r=>r.status)});ok('remaining concurrent requests are guardrail stops, not duplicate admissions/errors',races.filter(r=>r.status!==200).every(r=>r.status===409),races.map(r=>r.status));
 const unauth=await request('/trades',entry,'POST','');ok('entry gate still requires real authentication',unauth.status===401,unauth);
 await reset();const actualDaily=Cor.dailyState;Cor.dailyState=async()=>{throw new Error('declared DB read failure');};
 r=await request('/trades',entry);ok('daily-state read error fails closed, no entry record',r.status===503 && r.data.code==='guardrail_unavailable' && (await D.db.prepare('SELECT COUNT(*) n FROM trades').get()).n===0,r);
 r=await request('/bots/signals/save-plan',plan);ok('plan daily-state read error fails closed',r.status===503 && r.data.code==='guardrail_unavailable',r);Cor.dailyState=actualDaily;
await new Promise(r=>setImmediate(r));ok('daily state leaves no unhandled guardrail Promise rejection',rejections.length===0,rejections);
}catch(e){fail++;console.error(e.stack);}finally{if(server)await new Promise(r=>server.close(r));if(process.env.M79_RESULT)fs.writeFileSync(process.env.M79_RESULT,JSON.stringify({app:APP,pass,fail,results,unhandled_rejections:rejections,scope:'Personal rule state/admission, declared history, fixed internal server clock; not market outcomes or external broker enforcement'},null,2)+'\n');console.log(`M79 daily/entry: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
