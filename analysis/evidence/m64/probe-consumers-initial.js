#!/usr/bin/env node
'use strict';
/** Real analyse/chart/scan/Now and signal/plan persistence. Candle IO, ordinary
 * CRT report and exact journal P&L are declared seams; market rules stay real. */
const path=require('path'),fs=require('fs'),os=require('os');const APP=process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal');
const RealDate=Date;let NOW=Date.UTC(2026,9,11,13);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';const file=path.join(os.tmpdir(),`m64-consumers-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db')),B=require(path.join(APP,'src/bots')),Mom=B.momentum,TD=Mom.topdown,SU=B.setup,SMC=B.smc,P=require(path.join(APP,'src/bots/protected'));const F=require('./helpers/entry-preference-fixture'),rawSetup=SU.buildSetups,rawTD=TD.build;
let pass=0,fail=0,current;const results=[],ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
function fresh(dir,model){const f=F.named(P,dir,model,true);for(const s of [f.input.series,f.input.biasSeries,f.input.triggerSeries])s.smc.sessions=SMC.sessionState(new Date(f.END));const c=rawSetup(f.input.series.smc,{price:f.input.series.price,atr:1,bias:f.htfDir,balance:10000,riskPct:.5,entrySeries:f.input.series,observedAt:f.END,useBreakers:model==='flip',topdown:rawTD(f.input)}).candidates.find(c=>c.dir===dir);const target=c.levels.entry+dir*Math.abs(c.levels.entry-c.levels.stop)*1.5;f.input.triggerSeries.smc.order_blocks.push({dir:-dir,bottom:dir>0?target:target-.1,top:dir>0?target+.1:target,strength:1,breached:false,mitigated:false,t:f.END-300000});return f;}
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m64-consumer-${process.pid}@test.local`,name:'Consumer',password:'test-only'}),other=await D.createUser({email:`m64-consumer-other-${process.pid}@test.local`,name:'Other',password:'test-only'});
 const R=require(path.join(APP,'src/routine'));
 async function prepare(uid,aid){await D.db.prepare("UPDATE accounts SET routine_window_start='15:00',routine_timezone='UTC',routine_lead_minutes=180 WHERE id=?").run(aid);const state=await R.current(uid,{accountId:aid}),cycle=state.cycle.id;
  for(const payload of [{step:'calendar',reviewed:true,method:'manual_external',summary:'Actual human review of external calendar'},{step:'plan',reviewed:true,plan_text:'My manual plan: valid model, fixed risk, no chasing'},{step:'charts',reviewed:true,daily_bias:'neutral',htf_range:'Human range review',alert_status:'not_applicable',alert_note:'No relevant zone for this report'}])await R.acknowledge(uid,{account_id:aid,cycle_id:cycle,...payload});await R.meditation(uid,{account_id:aid,cycle_id:cycle,action:'start'});NOW+=900000;await R.meditation(uid,{account_id:aid,cycle_id:cycle,action:'complete'});await R.acknowledge(uid,{account_id:aid,cycle_id:cycle,step:'check_in',calm:true,clear:true,following_plan:true,would_take_if_up_big:true});
 }
 await prepare(other.userId,other.accountId);
 require(path.join(APP,'src/market')).getCalendar=async()=>({events:[]});const load=async(s,tf)=>({'4h':current.input.biasSeries,'15m':current.input.series,'5m':current.input.triggerSeries}[tf]);const rawAnalyse=Mom.analyse;TD.build=a=>F.asOrdinaryCRT(rawTD({...a,opts:{...a.opts,observedAt:current.END}}),current);Mom.analyse=(s,tf,o)=>rawAnalyse(s,tf,{...o,nowMs:current.END,seriesLoader:load});Mom.series=load;require(path.join(APP,'src/candles')).getCandles=load;
 const cdir=a=>a.setups.candidates.find(c=>c.dir===current.dir),reason='One explicit routineable-day exception, not a broker order or tomorrow permission.';
 for(const model of ['market_shift','flip'])for(const dir of [-1,1]){
  current=fresh(dir,model);current.dir=dir;await D.clearBiasState('TEST','15m');
  // Independent accounts avoid resetting production latches as fixture cleanup.
  const accountId=(await D.db.prepare("INSERT INTO accounts(user_id,name,starting_balance,current_balance,risk_per_trade_pct,max_trades_day) VALUES (?,'Routine consumer case',10000,10000,.5,20)").run(u.userId)).lastInsertRowid;
  await D.db.prepare("UPDATE accounts SET routine_window_start='15:00',routine_timezone='UTC',routine_lead_minutes=180 WHERE id=?").run(accountId);
  const opts={userId:u.userId,accountId,minRR:1,useBreakers:model==='flip',nowMs:current.END,includePrediction:false};const clear=await B.analyse('TEST','15m',{...opts,userId:null,accountId:null,balance:10000,riskPct:.5}),c=cdir(clear);
  ok(`${dir}/${model}: positive control qualifies in unowned research, not personal clearance`,c.ok && clear.now.armed && !!clear.now.order,{ok:c.ok,action:clear.now.action,no_trade:c.no_trade});
  const stop=await B.analyse('TEST','15m',opts),st=cdir(stop),chart=await B.chart('TEST','15m',{...opts,bars:200}),scan=await B.scan(['TEST'],'15m',opts);
  ok(`${dir}/${model}: routine is the actual rule, with no writing/cap/streak/day-loss breach`,stop.daily?.breaches?.map(b=>b.rule).join(',')==='pre_market_routine',stop.daily?.breaches?.map(b=>b.rule));
  ok(`${dir}/${model}: analyse/headline/method verdict refuse routine-day entry`,!st.ok && stop.setups.verdict.action==='NO TRADE' && stop.headline.action==='NO TRADE' && stop.method_verdict.blocked,{setup:stop.setups.verdict.action,headline:stop.headline.action,method:stop.method_verdict.action});
  ok(`${dir}/${model}: Now unarms order and records a blocking guard`,stop.now.action==='NO TRADE' && !stop.now.armed && !stop.now.order && stop.now.guards.some(g=>g.level==='block'),stop.now.action);
  ok(`${dir}/${model}: chart removes actionable plan at uncompleted routine stop`,!chart.now.armed && !chart.now.order && !chart.plan && chart.setups.verdict.action==='NO TRADE',chart.now.action);
  ok(`${dir}/${model}: scan refuses same routine permission`,scan.rows[0]?.action==='NO TRADE' && scan.rows[0]?.execution_permission?.allowed===false,scan.rows[0]?.action);
  // Cash is deliberately held fixed in the raw journal-seed fixture; this checks
  // permission composition, not whether a broker's realised-loss equity changes.
  ok(`${dir}/${model}: geometry/grade/score/risk remain byte-equal market context`,JSON.stringify(st.levels)===JSON.stringify(c.levels) && st.grade===c.grade && st.score===c.score && JSON.stringify(st.risk)===JSON.stringify(c.risk));
  ok(`${dir}/${model}: technical eligibility is retained, personal routine veto is explicit`,st.market_ok===true && st.personal_blocked===true && st.no_trade.some(t=>/pre.market routine/i.test(t)),{ok:st.ok,market_ok:st.market_ok});
  try{await B.saveSignals(u.userId,clear,{accountId});ok(`${dir}/${model}: stale clear signal is freshly rejected`,false);}catch(e){ok(`${dir}/${model}: stale clear signal is freshly rejected`,e.code==='guardrail_stop',e.code);}
  const over=await B.saveSignals(u.userId,stop,{accountId,override_reason:reason});
  ok(`${dir}/${model}: technically eligible stopped signal can use recorded reason`,over.saved>0 && over.permission?.state==='overridden',over);
  const audit=(await D.db.prepare("SELECT * FROM guardrail_events WHERE user_id=? AND account_id=? AND kind='override'").all(u.userId,accountId));
  ok(`${dir}/${model}: saved signal records routine rule and supplied reason`,audit.some(e=>e.reason===reason && JSON.parse(e.snapshot).breaches.some(b=>b.rule==='pre_market_routine')));
  const bad=JSON.parse(JSON.stringify(stop));for(const c of bad.setups.candidates){c.ok=false;c.market_ok=false;}
  const blocked=await B.saveSignals(u.userId,bad,{accountId,override_reason:reason});
  ok(`${dir}/${model}: personal routine exception never revives technical veto`,blocked.saved===0,blocked);
  ok(`${dir}/${model}: technical no-op creates no false override audit`,(await D.db.prepare("SELECT COUNT(*) n FROM guardrail_events WHERE user_id=? AND account_id=? AND kind='override'").get(u.userId,accountId)).n===audit.length);
  await prepare(u.userId,accountId);
  const resolved=await B.analyse('TEST','15m',opts);ok(`${dir}/${model}: actual ordered/timed/four-question completion restores only preparation permission`,cdir(resolved).ok && resolved.now.armed && resolved.daily.routine?.complete===true && JSON.stringify(cdir(resolved).levels)===JSON.stringify(c.levels),resolved.now.action);
  const admissionFacts=(await D.db.prepare('SELECT COUNT(*) n FROM routine_day_admissions WHERE account_id=?').get(accountId)).n;ok(`${dir}/${model}: saved/copied signal research never creates first-executed-trade routine evidence`,admissionFacts===0,admissionFacts);
  await D.db.prepare("UPDATE routine_checks SET payload='{}' WHERE cycle_id=? AND step='calendar'").run(resolved.daily.routine.cycle.id);
  const uncertain=await B.analyse('TEST','15m',opts);ok(`${dir}/${model}: corrupt acknowledged routine unarms all new execution`,uncertain.daily.status==='unknown'&&!uncertain.now.armed&&!uncertain.now.order&&!cdir(uncertain).ok,uncertain.daily.status);
  try{await B.saveSignals(u.userId,resolved,{accountId,override_reason:reason});ok(`${dir}/${model}: stale resolved analysis cannot waive current routine uncertainty`,false);}catch(e){ok(`${dir}/${model}: stale resolved analysis cannot waive current routine uncertainty`,e.code==='guardrail_unavailable',e.code);}
  const unrelated=await B.analyse('TEST','15m',{...opts,userId:other.userId,accountId:other.accountId});ok(`${dir}/${model}: second actually prepared user has independent qualifying permission`,cdir(unrelated).ok && unrelated.now.armed,unrelated.now.action);
  const research=await B.analyse('TEST','15m',{...opts,userId:null,accountId:null,balance:10000,riskPct:.5});ok(`${dir}/${model}: unauthenticated research remains context, not claimed personal approval`,cdir(research).ok && !research.daily,research.now.action);
 }
}catch(e){fail++;console.error(e.stack);}finally{if(process.env.M64_RESULT)fs.writeFileSync(process.env.M64_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Actual pending-routine/ordered15m+checks resolution consumer+signal SQL composition, declared candle/CRT/exact-net seams and fixed cash; no pixel/provider/broker/outcome proof'},null,2)+'\n');console.log(`M64 routine consumers: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
