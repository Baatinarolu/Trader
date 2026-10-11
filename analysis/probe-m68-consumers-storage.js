'use strict';
/** Controlled M68 consumer and persistence probes, NOT OHLC discovery/edge.
 * TJ_APP isolates execution/storage implementation; TJ_CONTROL optionally seeds
 * pre-M68 trades/signals before boot to exercise real additive migrations.
 * All DB/HTTP/UI work is isolated, real auth tokens, no production providers. */
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const MAIN=path.join(__dirname,'../extracted/tradejournal'),APP=process.env.TJ_APP||MAIN;
const file=path.join(os.tmpdir(),`m68-${process.pid}.db`);
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN','VERCEL'])delete process.env[k];
process.env.TRADEJOURNAL_DB=file;
if(process.env.TJ_CONTROL){
 const old=path.join(process.env.TJ_CONTROL,'src/db');
 cp.execFileSync(process.execPath,['-e',`(async()=>{const d=require(${JSON.stringify(old)});await d.ready;
 const u=await d.createUser({email:'historical@m68.test',password:'fixture-only',name:'Historical'});
 const a=await d.db.prepare('SELECT id FROM accounts WHERE user_id=?').get(u.userId);
 await d.db.prepare("INSERT INTO trades(user_id,account_id,symbol,direction,size,entry,stop,status,opened_at) VALUES(?,?, 'TEST','short',1,96.5,97.5,'open','2026-10-09T08:00:00Z')").run(u.userId,a.id);
 await d.db.prepare("INSERT INTO bot_signals(user_id,symbol,timeframe,dir,side,entry,stop,t1) VALUES(?,'OLD','15m',-1,'short',96.5,97.5,92.5)").run(u.userId);d.client.close();})().catch(e=>{console.error(e);process.exitCode=1})`],{env:process.env,stdio:'inherit'});
}
const D=require(path.join(APP,'src/db')),SU=require(path.join(APP,'src/bots/setup')),
 TD=require(path.join(APP,'src/bots/topdown')),SMC=require(path.join(APP,'src/bots/smc')),
 Mom=require(path.join(APP,'src/bots/momentum')),Bots=require(path.join(APP,'src/bots'));
const make=require(path.join(MAIN,'scripts/fixtures/entry-model-fixture'));
let pass=0,fail=0,server;
const ok=(n,c,d='')=>{console.log((c?' ok   ':' FAIL ')+n+(c||!d?'':' — '+d));c?pass++:fail++;};
function fresh(dir=-1,model='market_shift'){
 const f=make(dir,model);for(const x of [f.input.series,f.input.biasSeries,f.input.triggerSeries])x.smc.sessions=SMC.sessionState(new Date(f.END));return f;
}
(async()=>{try{
 await D.ready;
 const tc=await D.db.prepare('PRAGMA table_info(trades)').all(),sc=await D.db.prepare('PRAGMA table_info(bot_signals)').all();
 ok('both DB schema owners expose all three nullable model columns',['entry_model','entry_tf','entry_evidence'].every(x=>tc.some(c=>c.name===x&&c.notnull===0)&&sc.some(c=>c.name===x&&c.notnull===0)));
 if(process.env.TJ_CONTROL){
  const t=await D.db.prepare("SELECT * FROM trades WHERE symbol='TEST'").get(),s=await D.db.prepare("SELECT * FROM bot_signals WHERE symbol='OLD'").get();
  ok('actual pre-M68 rows migrate as NULL, not guessed market_shift/flip/none',t.entry_model===null&&s.entry_model===null&&t.entry_tf===null&&s.entry_evidence===null);
 }
 const u=await D.createUser({email:`m68-${process.pid}@test.local`,password:'fixture-only',name:'M68 fixture'}),v=await D.createUser({email:`m68-other-${process.pid}@test.local`,password:'fixture-only',name:'Other'});
 const token=await D.createSession(u.userId),other=await D.createSession(v.userId);
 require(path.join(APP,'src/market')).getCalendar=async()=>({events:[]});
 const original=Mom.analyse,sourceSeries=Mom.series;let current=fresh();
 const load=async(symbol,tf)=>({'4h':current.input.biasSeries,'15m':current.input.series,'5m':current.input.triggerSeries}[tf]);
 Mom.analyse=(symbol,tf,opts)=>original(symbol,tf,{...opts,seriesLoader:load});Mom.series=load;
 const CandleIO=require(path.join(APP,'src/candles')),originalCandles=CandleIO.getCandles;
 let raw=structuredClone(current.input.triggerSeries.candles);
 CandleIO.getCandles=async()=>({candles:raw,meta:{provider:'fixture',last_bar:new Date(raw.at(-1).t).toISOString()}});
 const observed=await sourceSeries('TEST','5m',400,{closedOnly:true,observedAt:current.END});
 raw.at(-1).c=500;raw.at(-1).h=501;raw.push({t:current.END+300000,o:500,c:600,h:601,l:499,v:1});
 const altered=await sourceSeries('TEST','5m',400,{closedOnly:true,observedAt:current.END});CandleIO.getCandles=originalCandles;
 const snap=s=>JSON.stringify([s.candles,s.price,s.atr,s.smc.structure,s.smc.order_blocks,s.smc.breakers,s.smc.sweeps]);
 ok('real lower loader filters forming/future OHLC BEFORE ATR, structure and causal zones',snap(observed)===snap(altered)&&observed.candles.length===119);
 const early={includePrediction:false,nowMs:current.END-1};
 const earlyA=await Bots.analyse('TEST','15m',early),earlyC=await Bots.chart('TEST','15m',early);
 ok('analyse and chart obey the SAME explicit clock, before the mitigation close',!earlyA.now.armed&&!earlyC.now.armed&&earlyA.topdown.entry_setup?.state==='waiting_pullback'&&earlyC.topdown.entry_setup?.state==='waiting_pullback');
 let uiData,uiChart,approved;
 for(const model of ['market_shift','flip'])for(const dir of [-1,1]){
  current=fresh(dir,model);await D.clearBiasState('TEST','15m');
  const opts={includePrediction:false,useBreakers:model==='flip',balance:10000,riskPct:.5,nowMs:current.END};
  const a=await Bots.analyse('TEST','15m',opts),c=a.setups.candidates.find(c=>c.dir===dir),ch=await Bots.chart('TEST','15m',{...opts,bars:200});
  ok(`${model} ${dir}: analyse candidate → Now → chart ALL retain the actual LTF identity/prices`,c.entry_model===model&&a.now.order?.entry_model===model
    &&a.now.order.entry_tf==='5m'&&a.now.order.entry===c.levels?.entry&&ch.plan?.entry_model===model&&ch.plan.entry_tf==='5m'
    &&ch.plan.entry===c.levels.entry&&ch.plan.stop===c.levels.stop&&ch.now.order.entry===c.levels.entry);
  const scan=await Bots.scan(['TEST'],'15m',opts);
  ok(`${model} ${dir}: scan keeps the same named executable candidate`,scan.rows.length===1&&scan.rows[0].entry_model===model&&scan.rows[0].entry_tf==='5m'
   &&scan.rows[0].action===(dir>0?'BUY':'SELL'));
  if(dir<0&&model==='market_shift'){uiData=a;uiChart=ch;approved=a;}
  a.prediction={setups:[{dir,p_win:99}]};
  const saved=await Bots.saveSignals(u.userId,a),row=saved.saved?await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(saved.ids[0]):null;
  ok(`${model} ${dir}: saved signal keeps exact model/timeframe/evidence/geometry, NOT legacy p_win`,row?.entry_model===model&&row.entry_tf==='5m'
   &&JSON.parse(row.entry_evidence||'null')?.model===model&&row.entry===c.levels?.entry&&row.stop===c.levels.stop&&row.t1===current.target&&row.t2===null&&row.p_win===null);
  if(row)await D.db.prepare("UPDATE bot_signals SET status=?,outcome_r=? WHERE id=?").run(dir<0?'win':'loss',dir<0?2:-1,row.id);
 }
 const Predictor=require(path.join(APP,'src/bots/predict')),predictOrig=Predictor.predict;
 Predictor.predict=async()=>({ok:true,setups:[{dir:-1,side:'short',p_win:99}],backtest:{decided:100,expectancy_r:1},summary:['99% live']});
 current=fresh();await D.clearBiasState('TEST','15m');
 const calibrated=await Bots.analyse('TEST','15m',{includePrediction:true,nowMs:current.END});Predictor.predict=predictOrig;
 ok('API prediction withholds live legacy probabilities/refined plans for the named model',calibrated.prediction?.setups.length===0
   &&calibrated.prediction.live_model_calibration==='unvalidated'&&calibrated.prediction.backtest.decided===100&&!calibrated.headline.text.includes('99%'));
 uiData=calibrated;
 // Storage-only negative control always receives the SAME completed named
 // execution record, so the parent cannot pass merely by never naming it.
 const f=fresh(),mainTD=require(path.join(MAIN,'src/bots/topdown')).build(f.input),mainSU=require(path.join(MAIN,'src/bots/setup'));
 const named=mainSU.buildSetups(f.input.series.smc,{price:96.5,bias:1,topdown:mainTD,balance:10000,riskPct:.5}).candidates.find(c=>c.dir===-1);
 const evidence=named.entry_evidence,plan={symbol:'NAMED',timeframe:'15m',entry:named.levels.entry,stop:named.levels.stop,t1:92.5,
  entry_model:'market_shift',entry_tf:'5m',entry_evidence:evidence,p_win:99};
 const p=await Bots.savePlan(u.userId,plan),pr=await D.db.prepare('SELECT * FROM bot_signals WHERE id=?').get(p.ids[0]);
 ok('refined savePlan preserves identity/evidence and withholds uncalibrated p_win',pr.entry_model==='market_shift'&&pr.entry_tf==='5m'
   &&JSON.parse(pr.entry_evidence||'null')?.model==='market_shift'&&pr.p_win===null);
 await D.db.prepare("UPDATE bot_signals SET status='win',outcome_r=2 WHERE id=?").run(pr.id);
 const unknown=await Bots.savePlan(u.userId,{...plan,symbol:'UNKNOWN',entry_model:null,entry_tf:null,entry_evidence:null});
 const none=await Bots.savePlan(u.userId,{...plan,symbol:'NONE',entry_model:'none',entry_tf:null,entry_evidence:null});
 for(const id of [...unknown.ids,...none.ids])await D.db.prepare("UPDATE bot_signals SET status='loss',outcome_r=-1 WHERE id=?").run(id);
 const stats=await Bots.signalStats(u.userId);
 ok('resolved signal review separates flip/market_shift/none/unknown, below-floor marked thin',stats.by_entry_model?.length===4&&['flip','market_shift','none','unknown'].every(x=>stats.by_entry_model.some(m=>m.entry_model===x&&m.sample_ready===false)));
 ok('another user cannot list or aggregate the saved named signals',(await Bots.listSignals(v.userId)).length===0&&(await Bots.signalStats(v.userId)).resolved===0);
 const rejected=await Bots.saveSignals(u.userId,{...approved,setups:{candidates:approved.setups.candidates.map(c=>({...c,ok:false}))}});
 ok('storage still refuses ok=false, regardless of letter/model tag',rejected.saved===0);
 // Probe the fallback schema owner itself against a genuinely old signal table.
 const before=await D.db.prepare('SELECT COUNT(*) n FROM bot_signals').get();
 const supportSchema=sc.filter(c=>!['entry_model','entry_tf','entry_evidence'].includes(c.name));
 await D.db.exec('ALTER TABLE bot_signals RENAME TO m68_saved_signals');
 await D.db.exec(`CREATE TABLE bot_signals (${supportSchema.map(c=>`${c.name} ${c.type}${c.pk?' PRIMARY KEY':''}${c.notnull?' NOT NULL':''}${c.dflt_value!=null?' DEFAULT ('+c.dflt_value+')':''}`).join(',')})`);
 await D.db.exec(`INSERT INTO bot_signals(${supportSchema.map(c=>c.name).join(',')}) SELECT ${supportSchema.map(c=>c.name).join(',')} FROM m68_saved_signals`);
 await Bots.ensureSignalsTable();
 const sc2=await D.db.prepare('PRAGMA table_info(bot_signals)').all();
 ok('Index-owned migration ALSO restores all model columns without inventing history',['entry_model','entry_tf','entry_evidence'].every(x=>sc2.some(c=>c.name===x)));
 await D.db.exec('DROP TABLE bot_signals');await D.db.exec('ALTER TABLE m68_saved_signals RENAME TO bot_signals');
 ok('migration round trip keeps all original saved rows',(await D.db.prepare('SELECT COUNT(*) n FROM bot_signals').get()).n===before.n);
 // Real API auth/normaliser/import-export lifecycle on a tiny isolated HTTP app.
 const express=require(path.join(APP,'node_modules/express')),app=express();app.use(express.json({limit:'2mb'}));app.use('/api',require(path.join(APP,'src/routes/api')));
 app.use((e,req,res,next)=>res.status(500).json({error:e.message}));
 server=await new Promise(resolve=>{const s=app.listen(0,'0.0.0.0',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/api`;
 async function call(method,url,body,who=token){const r=await fetch(base+url,{method,headers:{'content-type':'application/json','x-session':who},body:body?JSON.stringify(body):undefined});const text=await r.text();return{status:r.status,data:r.headers.get('content-type')?.includes('json')?JSON.parse(text):text};}
 const accounts=(await call('GET','/accounts')).data.accounts,account=accounts[0].id;
 const payload={symbol:'TEST',asset_class:'index',direction:'short',size:1,entry:plan.entry,stop:plan.stop,target:92.5,status:'open',opened_at:'2026-10-09T08:00:00Z',account_id:account,entry_model:'market_shift',entry_tf:'5m',entry_evidence:evidence};
 const created=await call('POST','/trades',payload),id=created.data.trade?.id;
 ok('POST /trades persists the actual Log-trade fields',created.status===200&&created.data.trade.entry_model==='market_shift'&&created.data.trade.entry_tf==='5m'&&JSON.parse(created.data.trade.entry_evidence||'null')?.model==='market_shift');
 ok('arrays cannot impersonate a scalar model enum',(await call('POST','/trades',{...payload,entry_model:['flip']})).status===400);
 ok('malformed journal evidence fails validation without a write',(await call('POST','/trades',{...payload,entry_evidence:'{broken'})).status===400);
 ok('invalid manual model names are rejected, not silently relabeled',(await call('POST','/trades',{...payload,entry_model:'fake-model'})).status===400);
 ok('another user cannot update a tagged journal trade',(await call('PUT',`/trades/${id}`,{entry_model:'flip'},other)).status===404);
 const edit=await call('PUT',`/trades/${id}`,{notes:'editing keeps model'});
 ok('partial PUT preserves the nullable model/evidence snapshot',edit.data.trade?.entry_model==='market_shift'&&edit.data.trade.entry_evidence===created.data.trade.entry_evidence);
 const closed=await call('POST',`/trades/${id}/close`,{exit:92.5,closed_at:'2026-10-09T09:00:00Z'});
 ok('closing a trade preserves its executed entry model, not a fresh guess',closed.data.trade?.entry_model==='market_shift'&&closed.data.trade.entry_tf==='5m');
 const oldTrade=await call('POST','/trades',{...payload,entry_model:null,entry_evidence:null,status:'closed',exit:97.5,closed_at:'2026-10-09T09:00:00Z'});
 await call('POST','/trades',{...payload,entry_model:'none',entry_evidence:null,status:'closed',exit:97.5,closed_at:'2026-10-09T09:00:00Z'});
 const flip=await call('POST','/trades',{...payload,entry_model:'flip',entry_evidence:{...evidence,model:'flip'},status:'closed',exit:92.5,closed_at:'2026-10-09T09:00:00Z'});
 const an=(await call('GET','/analytics')).data;
 ok('closed journal review separates all four cohorts and marks thin samples',an.by_entry_model?.length===4&&an.by_entry_model.every(x=>!x.sample_ready&&x.sample_floor===30));
 ok('model filter and unknown filter are distinct and owner-scoped',(await call('GET','/trades?entry_model=flip')).data.trades.length===1
  &&(await call('GET','/trades?entry_model=unknown')).data.trades.length===1&&(await call('GET','/trades?entry_model=flip',null,other)).data.trades.length===0);
 ok('malformed model query is an explicit 400',(await call('GET','/trades?entry_model=bogus')).status===400);
 const csv=(await call('GET','/export/csv')).data,backup=(await call('GET','/export/json')).data;
 ok('CSV and JSON exports retain model/timeframe/evidence',csv.includes('entry_model,entry_tf,entry_evidence')&&backup.trades.some(t=>t.entry_model==='flip'&&t.entry_tf==='5m'&&t.entry_evidence));
 const ci=await call('POST','/import/csv',{csv},other),otherTrades=(await call('GET','/trades?limit=500',null,other)).data.trades;
 ok('CSV round trip keeps real model/timeframe/evidence and historical-null rows',ci.data.inserted===4&&otherTrades.filter(t=>t.entry_model==='market_shift').length===1
  &&otherTrades.find(t=>t.entry_model==='market_shift')?.entry_evidence===created.data.trade.entry_evidence&&otherTrades.filter(t=>t.entry_model===null).length===1);
 const ji=await call('POST','/import/json',backup,other),jsonTrades=(await call('GET','/trades?limit=500',null,other)).data.trades;
 ok('JSON round trip preserves the same cohorts and snapshots',ji.data.inserted===4&&jsonTrades.filter(t=>t.entry_model==='flip').length===2&&jsonTrades.filter(t=>t.entry_model===null).length===2);
 const retag=await call('PUT',`/trades/${flip.data.trade.id}`,{entry_model:'market_shift'});
 ok('manual retag cannot carry contradictory flip evidence forward',retag.data.trade?.entry_model==='market_shift'&&retag.data.trade.entry_evidence===null);
 ok('malformed refined-plan evidence is a clear 400, not a server error',(await call('POST','/bots/signals/save-plan',{...plan,entry_evidence:'{broken'})).status===400);
 ok('save-plan HTTP rejects unknown enum values',(await call('POST','/bots/signals/save-plan',{...plan,entry_model:'invented'})).status===400);
 // Execute the real browser form, bot card, chart Copy helper, and model review.
 const {JSDOM,VirtualConsole}=require(path.join(APP,'node_modules/jsdom')),errs=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://preview.example/',runScripts:'outside-only',virtualConsole:vc}),w=dom.window;w.requestAnimationFrame=()=>0;
 w.Views={};w.API={get:async(url)=>url.startsWith('/bots/chart')?uiChart:url.startsWith('/bots/analyse')?uiData:url.startsWith('/analytics')?an:url.startsWith('/accounts')?{accounts}:url.startsWith('/bots/state')?{ok:true,settings:{},equity:10000}:url.startsWith('/bots/markets')?{timeframes:['15m'],instruments:[{symbol:'TEST'}],sessions:{name:'New York'}}:{}};
 let copied,prefill;w.TV={link:()=> '#',planText:(sym,tf,c)=>c,copy:x=>{copied=x;}};w.Chart={render:()=>w.document.createElement('div'),mini:()=>w.document.createElement('div')};
 w.App={openTrade(id,p){prefill=p;},goto(){},toast(){},refresh(){try{w.Views.bots.render(w.document.getElementById('root'));}catch(e){errs.push(e.message);}}};w.toast=()=>{};w.confirm=()=>false;
 for(const f of ['util.js','store.js'])w.eval(fs.readFileSync(path.join(APP,'public/js',f),'utf8'));
 w.Store.user={settings:{timezone:'UTC'}};w.Store.accounts=accounts;w.Store.strategies=[];w.Store.instruments=[];w.Store.queryParams=()=>({});
 const fmt=w.Views;w.eval(fs.readFileSync(path.join(APP,'public/js/views/trades.js'),'utf8'));
 const form=w.Views.tradeForm(created.data.trade),collected=form.collect();
 ok('actual trade modal round trips model/timeframe/evidence',!!form.node.querySelector('#tf-entrymodel')&&collected.entry_model==='market_shift'&&collected.entry_tf==='5m'&&collected.entry_evidence===created.data.trade.entry_evidence);
 const unknownForm=w.Views.tradeForm(oldTrade.data.trade);
 ok('historical-null trade modal remains Unknown, never defaults to none',unknownForm.collect().entry_model===null);
 w.eval(fs.readFileSync(path.join(APP,'public/js/views/bots.js'),'utf8'));const root=w.document.getElementById('root');
 w.__botRequest={symbol:'TEST',tf:'15m'};await w.Views.bots.render(root);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 const log=[...root.querySelectorAll('button')].find(b=>b.textContent==='Log this plan'),copy=[...root.querySelectorAll('button')].find(b=>b.textContent==='Copy plan');if(log)log.click();if(copy)copy.click();
 ok('real Bots Log-trade prefill carries executable identity and evidence',prefill?.entry_model==='market_shift'&&prefill.entry_tf==='5m'&&prefill.entry===uiData.now.order.entry&&prefill.entry_evidence?.model==='market_shift');
 ok('real Bots Copy-plan keeps named prices, not a parallel CRT',copied?.levels.entry===uiData.now.order.entry&&copied.entry_model==='market_shift');
 // Exercise TVChart.copyPlan itself, not a duplicated formatter.
 let text;w.navigator.clipboard={writeText:async x=>{text=x;}};
 w.eval(fs.readFileSync(path.join(APP,'public/js/tv.js'),'utf8'));await w.TV.copy(w.TV.planText('TEST','15m',copied));
 ok('actual chart clipboard names the 5m market-shift execution',text?.includes('market_shift')&&text.includes('5m')&&text.includes(String(uiData.now.order.entry)));
 w.eval(fs.readFileSync(path.join(APP,'public/js/views/analytics.js'),'utf8'));
 await w.Views.analytics.render(root);[...root.querySelectorAll('button')].find(b=>b.textContent==='Segments')?.click();
 ok('actual Analytics Segments renders all models plus the course sample warning',root.textContent.includes('Entry model')&&root.textContent.includes('market_shift')&&root.textContent.includes('flip')&&root.textContent.includes('Unknown (unrecorded)')&&root.textContent.includes('Below 30'));
 w.App.refresh=()=>{try{w.Views.bots.render(root);}catch(e){errs.push(e.message);}};
 const signalRows=await Bots.listSignals(u.userId),oldAPI=w.API.get;
 w.API.get=async(url,...args)=>url.startsWith('/bots/signals')?{ok:true,signals:signalRows,stats}:oldAPI(url,...args);
 w.Views.bots.render(root);[...root.querySelectorAll('button')].find(b=>b.textContent==='Signals')?.click();
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 ok('actual Signals tab displays identity and per-model thin-sample review',root.textContent.includes('Resolved signals by entry model')&&root.textContent.includes('market_shift')&&root.textContent.includes('flip')&&root.textContent.includes('thin sample'));
 ok('all actual browser scripts ran without JS errors',errs.length===0,errs.join('; '));dom.window.close();
 }finally{if(server)await new Promise(r=>server.close(r));D.client.close();for(const p of [file,file+'-wal',file+'-shm'])try{fs.unlinkSync(p);}catch{}}
 console.log(`\nM68 consumers/storage: ${pass} passed / ${fail} failed`);process.exitCode=fail?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
