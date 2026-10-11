#!/usr/bin/env node
'use strict';
/** Actual analyse/chart/scan/Now consumers. Only candle IO and the ordinary CRT
 * composition seam are declared fixtures. Real Setup/entry-model/stop/TP rules.
 */
const path=require('path'),fs=require('fs'),os=require('os');
const APP=process.env.TJ_APP || path.join(__dirname,'../extracted/tradejournal');
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';
const file=path.join(os.tmpdir(),`m79-consumers-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db')),B=require(path.join(APP,'src/bots')),Mom=B.momentum,TD=Mom.topdown,SU=B.setup,SMC=B.smc,Cor=B.correction,P=require(path.join(APP,'src/bots/protected'));
const F=require('./helpers/entry-preference-fixture'),rawSetup=SU.buildSetups,rawTD=TD.build;
let pass=0,fail=0,current;const results=[];const ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
function fresh(dir,model){const f=F.named(P,dir,model,true);for(const s of [f.input.series,f.input.biasSeries,f.input.triggerSeries])s.smc.sessions=SMC.sessionState(new Date(f.END));const c=rawSetup(f.input.series.smc,{price:f.input.series.price,atr:1,bias:f.htfDir,balance:10000,riskPct:.5,entrySeries:f.input.series,observedAt:f.END,useBreakers:model==='flip',topdown:rawTD(f.input)}).candidates.find(c=>c.dir===dir);const {entry,stop}=c.levels;const target=entry+dir*Math.abs(entry-stop)*1.5;f.input.triggerSeries.smc.order_blocks.push({dir:-dir,bottom:dir>0?target:target-.1,top:dir>0?target+.1:target,strength:1,breached:false,mitigated:false,t:f.END-300000});return f;}
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m79-consumer-${process.pid}@test.local`,name:'Consumer',password:'test-only'});
 const second=await D.createUser({email:`m79-consumer-other-${process.pid}@test.local`,name:'Other',password:'test-only'});
 require(path.join(APP,'src/market')).getCalendar=async()=>({events:[]});
 const load=async(symbol,tf)=>({'4h':current.input.biasSeries,'15m':current.input.series,'5m':current.input.triggerSeries}[tf]);
 const rawAnalyse=Mom.analyse;TD.build=args=>F.asOrdinaryCRT(rawTD({...args,opts:{...args.opts,observedAt:current.END}}),current);
 Mom.analyse=(symbol,tf,opts)=>rawAnalyse(symbol,tf,{...opts,nowMs:current.END,seriesLoader:load});Mom.series=load;
 require(path.join(APP,'src/candles')).getCandles=async(symbol,tf)=>load(symbol,tf);
 const cdir=a=>a.setups.candidates.find(c=>c.dir===current.dir);
 for(const model of ['market_shift','flip'])for(const dir of [-1,1]){
   current=fresh(dir,model);current.dir=dir;await D.clearBiasState('TEST','15m');await D.db.prepare('DELETE FROM trades').run();
   // Different direction/model cases have independent account/day fixtures.
   if(await D.db.prepare("SELECT name FROM sqlite_master WHERE name='guardrail_day_state'").get())await D.db.exec('DELETE FROM guardrail_day_state; DELETE FROM guardrail_entry_admissions');
   const opts={userId:u.userId,accountId:u.accountId,minRR:1,useBreakers:model==='flip',nowMs:current.END,includePrediction:false};
   const clear=await B.analyse('TEST','15m',opts),c=cdir(clear);
   ok(`${dir}/${model}: positive control qualifies before personal stop`,c.ok && clear.now.armed && !!clear.now.order,{ok:c.ok,action:clear.now.action,no_trade:c.no_trade});
   const opened=new Date().toISOString();for(let i=0;i<3;i++)await D.db.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,entry) VALUES (?,?,?,'open',?,100)").run(u.userId,u.accountId,'JOURNAL',opened);
   const stop=await B.analyse('TEST','15m',opts),st=cdir(stop),ch=await B.chart('TEST','15m',{...opts,bars:200}),scan=await B.scan(['TEST'],'15m',{...opts});
   ok(`${dir}/${model}: analyser and method verdict cannot emit BUY/SELL at personal stop`,!st.ok && stop.setups.verdict.action==='NO TRADE' && stop.headline.action==='NO TRADE' && stop.method_verdict.action==='NO TRADE' && stop.method_verdict.blocked,{setup:stop.setups.verdict.action,headline:stop.headline.action,method:stop.method_verdict.action});
   ok(`${dir}/${model}: Now unarms the order, marks guard as blocking`,stop.now.action==='NO TRADE' && !stop.now.armed && !stop.now.order && stop.now.guards.some(g=>g.level==='block'),stop.now.action);
   ok(`${dir}/${model}: chart unarms and removes the actionable plan`,!ch.now.armed && !ch.now.order && !ch.plan && ch.setups.verdict.action==='NO TRADE',{action:ch.now.action,plan:ch.plan});
   ok(`${dir}/${model}: scan action refuses same cap`,scan.rows[0]?.action==='NO TRADE' && scan.rows[0]?.execution_permission?.allowed===false,scan.rows[0]?.action);
   ok(`${dir}/${model}: original geometry/grade/score/risk remain byte-equal market context`,JSON.stringify(st.levels)===JSON.stringify(c.levels) && st.grade===c.grade && st.score===c.score && JSON.stringify(st.risk)===JSON.stringify(c.risk),{before:c.levels,after:st.levels});
   ok(`${dir}/${model}: veto explains PERSONAL rule; market eligibility is separate`,st.market_ok===true && st.personal_blocked===true && st.no_trade.some(t=>/Personal guardrail/.test(t)),{ok:st.ok,market_ok:st.market_ok,no_trade:st.no_trade});
   try{await B.saveSignals(u.userId,clear);ok(`${dir}/${model}: fresh signal admission rejects stale clear analysis`,false);}catch(e){ok(`${dir}/${model}: fresh signal admission rejects stale clear analysis`,e.code==='guardrail_stop',e.code);}
   const unrelated=await B.analyse('TEST','15m',{...opts,userId:second.userId,accountId:second.accountId});ok(`${dir}/${model}: second user still has qualifying permission`,cdir(unrelated).ok && unrelated.now.armed,unrelated.now.action);
   const read=Cor.dailyState;Cor.dailyState=async()=>{throw Error('Declared personal-state read failure');};
   const unknown=await B.analyse('TEST','15m',opts),unknownChart=await B.chart('TEST','15m',{...opts,bars:200}),unknownScan=await B.scan(['TEST'],'15m',opts);Cor.dailyState=read;
   ok(`${dir}/${model}: read error fails closed across analysis/chart/scan, never daily=null`,unknown.daily?.status==='unknown' && unknown.now.action==='NO TRADE' && !unknown.now.order && !unknownChart.plan && unknownScan.rows[0]?.action==='NO TRADE',{daily:unknown.daily?.status,a:unknown.now.action,c:unknownChart.now.action,s:unknownScan.rows[0]?.action});
   const research=await B.analyse('TEST','15m',{...opts,userId:null,accountId:null,balance:10000,riskPct:.5});ok(`${dir}/${model}: unsized/unauthenticated research remains market context, not personally vetoed`,cdir(research).ok && research.now.armed && !research.daily,research.now.action);
 }
}catch(e){fail++;console.error(e.stack);}finally{if(process.env.M79_RESULT)fs.writeFileSync(process.env.M79_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Real consumers, declared candle/ordinary-CRT IO seams; no live provider, pixels, broker or market outcome validation'},null,2)+'\n');console.log(`M79 consumers: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
