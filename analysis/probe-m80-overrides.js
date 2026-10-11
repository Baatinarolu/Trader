#!/usr/bin/env node
'use strict';
/** Actual server/auth/libSQL reason overrides and rollback. This tests personal
 * admission only; broker orders and market performance are not simulated. */
const path=require('path'),fs=require('fs'),os=require('os');
const APP=process.env.TJ_APP || path.join(__dirname,'../extracted/tradejournal');
const RealDate=Date,NOW=Date.UTC(2026,9,11,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';
const file=path.join(os.tmpdir(),`m80-overrides-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db')),B=require(path.join(APP,'src/bots')),Cor=B.correction;
let pass=0,fail=0,server;const results=[],ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m80-${process.pid}@test.local`,name:'Override',password:'test-only'}),foreign=await D.createUser({email:`m80-other-${process.pid}@test.local`,name:'Other',password:'test-only'});const token=await D.createSession(u.userId);
 const has=(await D.db.prepare("SELECT name FROM sqlite_master WHERE name='guardrail_events'").get())?.name;
 const events=async()=>has?await D.db.prepare('SELECT * FROM guardrail_events WHERE user_id=? ORDER BY id').all(u.userId):[];
 const count=async()=>(await D.db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id=?').get(u.userId)).n;
 const now=new Date().toISOString();for(let i=0;i<3;i++)await D.db.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,entry) VALUES (?,?,?,'open',?,100)").run(u.userId,u.accountId,'TEST',now);
 const express=require(path.join(APP,'node_modules/express')),app=express();app.use(express.json());app.use('/api',require(path.join(APP,'src/routes/api')));server=await new Promise(resolve=>{const s=app.listen(0,'0.0.0.0',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/api`;
 const req=async(url,body,method='POST')=>{const r=await fetch(base+url,{method,headers:{'x-session':token,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const entry={symbol:'TEST',entry:100,stop:99,size:1,status:'open',entry_tf:'5m',account_id:u.accountId};
 for(const reason of [undefined,null,'','  \n  ']){const before=await count(),r=await req('/trades',{...entry,override_reason:reason});ok('missing/blank reason cannot override: '+JSON.stringify(reason),r.status===409 && await count()===before,r);}
 for(const reason of [true,5,{},[], 'x'.repeat(2001)]){const before=await count(),r=await req('/trades',{...entry,override_reason:reason});ok('invalid plain-text reason rejected without a write: '+(typeof reason),r.status===400 && await count()===before,{status:r.status,length:reason?.length});}
 const reason='I accept this cap violation deliberately; this is not an automatic unlock.';
 const accepted=await req('/trades',{...entry,override_reason:' \n '+reason+' \n ',guardrail_snapshot:'forged',entry_permission:'clear',daily:{status:'clear',today:{trades:0}}});
 const trade=accepted.data.trade || {},snapshot=JSON.parse(trade.guardrail_snapshot || '{}');
 ok('known stop plus nonblank reason admits exactly this action',accepted.status===200 && accepted.data.permission?.allowed===true && accepted.data.permission?.state==='overridden',accepted);
 ok('server trims and persists reason on trade',trade.override_reason===reason,trade.override_reason);
 ok('server persists stopped rule snapshot, never client-supplied clear',trade.entry_permission==='overridden' && snapshot.status==='stop' && snapshot.today?.trades===3 && snapshot.breaches?.some(b=>b.rule==='max_trades_day') && snapshot.admission?.override_reason===reason,snapshot);
 ok('override snapshot uses actual account/server date/time',snapshot.account_id===u.accountId && snapshot.date==='2026-10-11' && snapshot.evaluated_at===now,snapshot);
 let e=await events();const override=e.find(e=>e.kind==='override');ok('reason/rule/id committed together in durable day audit',override?.reason===reason && override.entity_type==='trade' && override.entity_id===trade.id && JSON.parse(override.snapshot).breaches.some(b=>b.rule==='max_trades_day'),override);
 const oldReason=trade.override_reason,oldSnapshot=trade.guardrail_snapshot;
 const edited=trade.id?await req('/trades/'+trade.id,{notes:'Honest edit',override_reason:'rewrite attempt',guardrail_snapshot:'forged edit',entry_permission:'clear'},'PUT'):{status:0,data:{}};
 ok('ordinary edit cannot rewrite the captured reason/violated rule',edited.status===200 && edited.data.trade?.override_reason===oldReason && edited.data.trade?.guardrail_snapshot===oldSnapshot,edited);
 const repeat=await req('/trades',entry);ok('one override does not unlock the rest of the day',repeat.status===409,repeat);
 const plan={symbol:'TEST',timeframe:'15m',entry_tf:'5m',entry:100,stop:99,t1:110,account_id:u.accountId};
 const saved=await req('/bots/signals/save-plan',{...plan,override_reason:reason});const sig=saved.data.ids?.[0]?await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(saved.data.ids[0]):{};
 ok('save-plan requires and records the same reasoned server override',saved.status===200 && saved.data.permission?.state==='overridden' && sig.override_reason===reason && sig.entry_permission==='overridden',{saved,sig});
 ok('plan override cannot move entry/stop/target to fake permission',sig.entry===100 && sig.stop===99 && sig.t1===110,sig);
 const eligible={symbol:'TEST',timeframe:'15m',topdown:{direction:1,blocked:false},setups:{verdict:{action:'BUY',dir:1},candidates:[{dir:1,side:'long',ok:true,grade:'A',score:80,entry_tf:'5m',levels:{entry:100,stop:99,targets:[{price:110,rr:10}],rr_primary:10,rr_final:10}}]}};
 let storage;try{storage=await B.saveSignals(u.userId,eligible,{accountId:u.accountId,override_reason:reason});}catch(e){storage={error:e.message};}
 const stored=storage.ids?.[0]?await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(storage.ids[0]):{};
 ok('eligible signal storage uses fresh override, not stale read permission',storage.saved===1 && stored.override_reason===reason && JSON.parse(stored.guardrail_snapshot || '{}').today?.trades===4,storage);
 const veto={...eligible,setups:{...eligible.setups,candidates:eligible.setups.candidates.map(c=>({...c,ok:false,market_ok:false,no_trade:['technical RR veto']}))}};const beforeSignals=(await D.db.prepare('SELECT COUNT(*) n FROM bot_signals').get()).n;
 const refused=await B.saveSignals(u.userId,veto,{accountId:u.accountId,override_reason:reason});ok('personal override cannot waive a TECHNICAL candidate veto',refused.saved===0 && (await D.db.prepare('SELECT COUNT(*) n FROM bot_signals').get()).n===beforeSignals,refused);
 const actualAnalyse=B.analyse;B.analyse=async()=>veto;
 const routeVeto=await req('/bots/signals/save',{symbol:'TEST',timeframe:'15m',account_id:u.accountId,override_reason:reason});B.analyse=actualAnalyse;
 ok('public save-signal uses server analysis veto, not supplied client approval',routeVeto.status===200 && routeVeto.data.saved?.saved===0,routeVeto);
 const actualDaily=Cor.dailyState;Cor.dailyState=async()=>{throw Error('Declared read outage');};const before=await count(),unknown=await req('/trades',{...entry,override_reason:reason});Cor.dailyState=actualDaily;
 ok('even a reason cannot override an unavailable guardrail check',unknown.status===503 && await count()===before && unknown.data.daily?.permission?.can_override===false,unknown);
 const notOwned=await req('/trades',{...entry,account_id:foreign.accountId,override_reason:reason});ok('override is not an account-ownership bypass',notOwned.status===404,notOwned);
 const past=await req('/trades',{...entry,status:'closed',exit:101,opened_at:'2025-01-01T09:00:00Z',closed_at:'2025-01-01T10:00:00Z',record_only:true});
 const reopened=await req('/trades/'+past.data.trade.id,{status:'open',override_reason:reason},'PUT');ok('reopened prospective entry records reason and fresh stop',reopened.status===200 && reopened.data.trade?.override_reason===reason && JSON.parse(reopened.data.trade?.guardrail_snapshot || '{}').status==='stop',reopened);
 if(has){await D.db.prepare("CREATE TRIGGER audit_failure BEFORE INSERT ON guardrail_events WHEN NEW.kind='override' BEGIN SELECT RAISE(ABORT,'declared audit write failure'); END").run();const n=await count(),auditBefore=(await events()).filter(e=>e.kind==='override').length;const r=await req('/trades',{...entry,override_reason:reason});ok('audit failure rolls back BOTH entry and override, never an unlogged exception',r.status===503 && await count()===n && (await events()).filter(e=>e.kind==='override').length===auditBefore,{response:r,count:await count()});await D.db.exec('DROP TRIGGER audit_failure');}else ok('audit failure rolls back BOTH entry and override, never an unlogged exception',false,'no event table');
 const reviewed=await fetch(base+'/journal/2026-10-11',{headers:{'x-session':token}});const review=await reviewed.json();ok('day review actually returns override reason AND violated rule',review.guardrail_events?.some(e=>e.kind==='override' && e.reason===reason && e.snapshot.breaches.some(b=>b.rule==='max_trades_day')),review.guardrail_events?.length);
 await D.db.prepare('DELETE FROM trades WHERE user_id=?').run(u.userId);const remains=await events();ok('trade deletion cannot erase override reasons in day audit',remains.some(e=>e.kind==='override' && e.reason===reason && e.entity_id===trade.id),remains.filter(e=>e.kind==='override').length);
 // A new, genuinely clear account tests unnecessary reasons. Journal deletion
 // is deliberately NOT used to erase the preceding account's rule-day stop.
 const clearAccount=(await D.db.prepare("INSERT INTO accounts(user_id,name,starting_balance,current_balance) VALUES (?,'Clear reason control',10000,10000)").run(u.userId)).lastInsertRowid;
 const unnecessary=await req('/trades',{...entry,account_id:clearAccount,override_reason:reason});ok('a reason submitted while CLEAR is not falsely called an override',unnecessary.status===200 && unnecessary.data.trade?.override_reason===null && unnecessary.data.trade?.entry_permission==='admitted',unnecessary);
 await D.db.prepare('DELETE FROM trades WHERE user_id=?').run(u.userId);await D.db.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,closed_at,entry,exit,net_pnl) VALUES (?,?,?,'closed',?,?,100,99,-1)").run(u.userId,u.accountId,'LOSS',now,now);
 const noTf=await req('/trades',{...entry,entry_tf:null,override_reason:reason});ok('no-next-candle unknown TF cannot be waived by reason',noTf.status===503 && noTf.data.daily?.permission?.can_override===false,noTf);
}catch(e){fail++;console.error(e.stack);}finally{if(server)await new Promise(r=>server.close(r));if(process.env.M79_RESULT)fs.writeFileSync(process.env.M79_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Actual local API/transaction overrides and audit rollback; no broker/production/market-edge claim'},null,2)+'\n');console.log(`M80 overrides: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
