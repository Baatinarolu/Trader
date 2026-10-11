#!/usr/bin/env node
'use strict';
/** Real analyse/chart/scan/Now and signal/plan persistence. Candle IO, ordinary
 * CRT report and exact journal P&L are declared seams; market rules stay real. */
const path=require('path'),fs=require('fs'),os=require('os');const APP=process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal');
const RealDate=Date,NOW=Date.UTC(2026,9,11,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';const file=path.join(os.tmpdir(),`m81-consumers-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db')),B=require(path.join(APP,'src/bots')),Mom=B.momentum,TD=Mom.topdown,SU=B.setup,SMC=B.smc,P=require(path.join(APP,'src/bots/protected'));const F=require('./helpers/entry-preference-fixture'),rawSetup=SU.buildSetups,rawTD=TD.build;
let pass=0,fail=0,current;const results=[],ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
function fresh(dir,model){const f=F.named(P,dir,model,true);for(const s of [f.input.series,f.input.biasSeries,f.input.triggerSeries])s.smc.sessions=SMC.sessionState(new Date(f.END));const c=rawSetup(f.input.series.smc,{price:f.input.series.price,atr:1,bias:f.htfDir,balance:10000,riskPct:.5,entrySeries:f.input.series,observedAt:f.END,useBreakers:model==='flip',topdown:rawTD(f.input)}).candidates.find(c=>c.dir===dir);const target=c.levels.entry+dir*Math.abs(c.levels.entry-c.levels.stop)*1.5;f.input.triggerSeries.smc.order_blocks.push({dir:-dir,bottom:dir>0?target:target-.1,top:dir>0?target+.1:target,strength:1,breached:false,mitigated:false,t:f.END-300000});return f;}
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m81-consumer-${process.pid}@test.local`,name:'Consumer',password:'test-only'}),other=await D.createUser({email:`m81-consumer-other-${process.pid}@test.local`,name:'Other',password:'test-only'});
 require(path.join(APP,'src/market')).getCalendar=async()=>({events:[]});const load=async(s,tf)=>({'4h':current.input.biasSeries,'15m':current.input.series,'5m':current.input.triggerSeries}[tf]);const rawAnalyse=Mom.analyse;TD.build=a=>F.asOrdinaryCRT(rawTD({...a,opts:{...a.opts,observedAt:current.END}}),current);Mom.analyse=(s,tf,o)=>rawAnalyse(s,tf,{...o,nowMs:current.END,seriesLoader:load});Mom.series=load;require(path.join(APP,'src/candles')).getCandles=load;
 const cdir=a=>a.setups.candidates.find(c=>c.dir===current.dir),reason='One explicit profitable-day exception, not a broker order or tomorrow permission.';
 for(const model of ['market_shift','flip'])for(const dir of [-1,1]){
  current=fresh(dir,model);current.dir=dir;await D.clearBiasState('TEST','15m');
  // Independent accounts avoid resetting production latches as fixture cleanup.
  const accountId=(await D.db.prepare("INSERT INTO accounts(user_id,name,starting_balance,current_balance,risk_per_trade_pct,max_trades_day,daily_profit_limit_pct) VALUES (?,'Profit consumer case',10000,10000,.5,20,1)").run(u.userId)).lastInsertRowid;
  const opts={userId:u.userId,accountId,minRR:1,useBreakers:model==='flip',nowMs:current.END,includePrediction:false};const clear=await B.analyse('TEST','15m',opts),c=cdir(clear);
  ok(`${dir}/${model}: positive control qualifies before profit stop`,c.ok && clear.now.armed && !!clear.now.order,{ok:c.ok,action:clear.now.action,no_trade:c.no_trade});
  await D.db.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,closed_at,entry,exit,net_pnl) VALUES (?,?,'DECLARED_NET','closed',?,?,100,101,100)").run(u.userId,accountId,new Date(NOW-864e5).toISOString(),new Date(NOW-3600000).toISOString());
  const stop=await B.analyse('TEST','15m',opts),st=cdir(stop),chart=await B.chart('TEST','15m',{...opts,bars:200}),scan=await B.scan(['TEST'],'15m',opts);
  ok(`${dir}/${model}: profit is the actual rule, with no cap/streak/loss breach`,stop.daily?.breaches?.map(b=>b.rule).join(',')==='daily_profit_limit',stop.daily?.breaches?.map(b=>b.rule));
  ok(`${dir}/${model}: analyse/headline/method verdict refuse profit-day entry`,!st.ok && stop.setups.verdict.action==='NO TRADE' && stop.headline.action==='NO TRADE' && stop.method_verdict.blocked,{setup:stop.setups.verdict.action,headline:stop.headline.action,method:stop.method_verdict.action});
  ok(`${dir}/${model}: Now unarms order and records a blocking guard`,stop.now.action==='NO TRADE' && !stop.now.armed && !stop.now.order && stop.now.guards.some(g=>g.level==='block'),stop.now.action);
  ok(`${dir}/${model}: chart removes actionable plan at realised profit stop`,!chart.now.armed && !chart.now.order && !chart.plan && chart.setups.verdict.action==='NO TRADE',chart.now.action);
  ok(`${dir}/${model}: scan refuses same profit permission`,scan.rows[0]?.action==='NO TRADE' && scan.rows[0]?.execution_permission?.allowed===false,scan.rows[0]?.action);
  // Cash is deliberately held fixed in the raw journal-seed fixture; this checks
  // permission composition, not whether a broker's post-win equity compounds.
  ok(`${dir}/${model}: geometry/grade/score/risk remain byte-equal market context`,JSON.stringify(st.levels)===JSON.stringify(c.levels) && st.grade===c.grade && st.score===c.score && JSON.stringify(st.risk)===JSON.stringify(c.risk));
  ok(`${dir}/${model}: technical eligibility is retained, personal profit veto is explicit`,st.market_ok===true && st.personal_blocked===true && st.no_trade.some(t=>/Realised profit/.test(t)),{ok:st.ok,market_ok:st.market_ok});
  try{await B.saveSignals(u.userId,clear,{accountId});ok(`${dir}/${model}: stale clear signal is freshly rejected`,false);}catch(e){ok(`${dir}/${model}: stale clear signal is freshly rejected`,e.code==='guardrail_stop',e.code);}
  const over=await B.saveSignals(u.userId,stop,{accountId,override_reason:reason});
  ok(`${dir}/${model}: technically eligible stopped signal can use recorded reason`,over.saved>0 && over.permission?.state==='overridden',over);
  const audit=(await D.db.prepare("SELECT * FROM guardrail_events WHERE user_id=? AND account_id=? AND kind='override'").all(u.userId,accountId));
  ok(`${dir}/${model}: saved signal records profit rule and supplied reason`,audit.some(e=>e.reason===reason && JSON.parse(e.snapshot).breaches.some(b=>b.rule==='daily_profit_limit')));
  const bad=JSON.parse(JSON.stringify(stop));for(const c of bad.setups.candidates){c.ok=false;c.market_ok=false;}
  const blocked=await B.saveSignals(u.userId,bad,{accountId,override_reason:reason});
  ok(`${dir}/${model}: personal profit exception never revives technical veto`,blocked.saved===0,blocked);
  ok(`${dir}/${model}: technical no-op creates no false override audit`,(await D.db.prepare("SELECT COUNT(*) n FROM guardrail_events WHERE user_id=? AND account_id=? AND kind='override'").get(u.userId,accountId)).n===audit.length);
  const unrelated=await B.analyse('TEST','15m',{...opts,userId:other.userId,accountId:other.accountId});ok(`${dir}/${model}: second user has independent qualifying permission`,cdir(unrelated).ok && unrelated.now.armed,unrelated.now.action);
  const research=await B.analyse('TEST','15m',{...opts,userId:null,accountId:null,balance:10000,riskPct:.5});ok(`${dir}/${model}: unauthenticated research remains context, not claimed personal approval`,cdir(research).ok && !research.daily,research.now.action);
 }
}catch(e){fail++;console.error(e.stack);}finally{if(process.env.M81_RESULT)fs.writeFileSync(process.env.M81_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Actual consumer/SQL persistence composition, declared candle/CRT/exact-net seams and fixed cash; no pixel/live-provider/broker/outcome proof'},null,2)+'\n');console.log(`M81 profit consumers: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
