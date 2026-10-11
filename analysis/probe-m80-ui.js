#!/usr/bin/env node
'use strict';
/** Actual App/modal/trade form/API/browser scripts, real auth + SQL writes.
 * jsdom is DOM/event composition, NOT pixel/renderer/production proof. Bot
 * candle IO is declared; Setup/Now and persisted plan writes are real. */
const path=require('path'),fs=require('fs'),os=require('os');
const APP=process.env.TJ_APP || path.join(__dirname,'../extracted/tradejournal');
const RealDate=Date,NOW=Date.UTC(2026,9,11,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';
const file=path.join(os.tmpdir(),`m80-ui-${process.pid}.db`);process.env.TRADEJOURNAL_DB=file;
const D=require(path.join(APP,'src/db')),B=require(path.join(APP,'src/bots')),Cor=B.correction;
let pass=0,fail=0,server,dom;const results=[],errors=[],ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
(async()=>{try{
 await D.ready;const u=await D.createUser({email:`m80-ui-${process.pid}@test.local`,name:'UI',password:'test-only'});const second=(await D.db.prepare("INSERT INTO accounts(user_id,name,starting_balance,current_balance) VALUES (?,'Other owned account',10000,10000)").run(u.userId)).lastInsertRowid;const token=await D.createSession(u.userId);
 const now=new Date().toISOString();const seed=async()=>{for(let i=0;i<3;i++)await D.db.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,entry) VALUES (?,?,?,'open',?,100)").run(u.userId,u.accountId,'TEST',now);};await seed();
 const express=require(path.join(APP,'node_modules/express')),app=express();app.use(express.json());app.use('/api',require(path.join(APP,'src/routes/api')));server=await new Promise(resolve=>{const s=app.listen(0,'0.0.0.0',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}`;
 const {JSDOM}=require(path.join(APP,'node_modules/jsdom'));dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{runScripts:'outside-only',url:'https://fixture.example'});const w=dom.window,requests=[],pending=[];w.addEventListener('error',e=>errors.push(e.message));
 w.fetch=(url,opts)=>{requests.push({url:String(url),method:opts?.method || 'GET',body:opts?.body?JSON.parse(opts.body):null});return fetch(new URL(url,base),opts);};
 const load=p=>w.eval(fs.readFileSync(path.join(APP,'public/js',p),'utf8'));
 load('util.js');load('api.js');w.API.setToken(token);load('store.js');
 w.Store.user={settings:{timezone:'UTC'},default_checklist:[]};w.Store.accounts=await D.db.prepare('SELECT * FROM accounts WHERE user_id=?').all(u.userId);w.Store.accountId=u.accountId;w.Store.strategies=[];w.Store.instruments=[];
 load('views/trades.js');load('views/journal.js');
 // Bootstrap is outside this DOM-composition probe; never run the shell on a
 // deliberately minimal fixture document. Functions under test stay unmodified.
 const addEvent=w.addEventListener.bind(w);w.addEventListener=(type,...a)=>type==='DOMContentLoaded'?undefined:addEvent(type,...a);
 Object.defineProperty(w.document,'readyState',{value:'loading',configurable:true});load('app.js');delete w.document.readyState;w.addEventListener=addEvent;
 w.App.boot=async()=>{};w.App.toast=()=>{};w.App.refresh=()=>{};
 // Track real API promise completion rather than arbitrary sleeps.
 for(const name of ['get','post','put']){const original=w.API[name];w.API[name]=(...a)=>{const p=original(...a);pending.push(p.catch(()=>{}));return p;};}
 async function settle(){await Promise.all(pending);await new Promise(r=>setImmediate(r));await Promise.all(pending);await new Promise(r=>setImmediate(r));}
 const closeAll=()=>{while(w.App.modalStack.length)w.App.modalStack[w.App.modalStack.length-1]();};
 const entry={symbol:'TEST',status:'open',account_id:u.accountId,entry:100,stop:99,target:110,size:1,entry_tf:'5m',opened_at:now};
 const tradePosts=()=>requests.filter(r=>r.url==='/api/trades' && r.method==='POST');
 const count=async()=>(await D.db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id=?').get(u.userId)).n;
 const lastModal=()=>[...w.document.querySelectorAll('.modal')].at(-1),buttons=()=>[...lastModal().querySelectorAll('.modal-foot button')];
 await w.App.openTrade(null,entry);await settle();let modal=lastModal(),btn=buttons().at(-1),before=tradePosts().length;
 ok('known stop greys BOTH actual save-entry actions',buttons().slice(1).every(b=>b.classList.contains('guardrail-stop')) && /reason required/.test(btn.textContent),buttons().map(b=>({text:b.textContent,disabled:b.disabled,class:b.className})));
 ok('trade form preflight uses selected account and actual entry TF',requests.some(r=>r.url.includes('/api/bots/guardrails') && r.url.includes('account_id='+u.accountId) && r.url.includes('entry_tf=5m')),requests);
 btn.click();await settle();const reason=w.document.querySelector('#guardrail-override-reason');
 ok('grey entry click opens required reason, not a trade POST',!!reason && tradePosts().length===before && await count()===3,{reason:!!reason,posts:tradePosts().length});
 if(reason){let confirm=buttons().at(-1);ok('blank reason cannot activate override confirmation',confirm.disabled);reason.value=' \n ';reason.dispatchEvent(new w.Event('input'));ok('whitespace reason remains disabled',confirm.disabled);buttons()[0].click();await settle();ok('cancelling override writes nothing',await count()===3 && tradePosts().length===before);}else{for(const label of ['blank reason cannot activate override confirmation','whitespace reason remains disabled','cancelling override writes nothing'])ok(label,false,'no reason dialog');}
 closeAll();await w.App.openTrade(null,entry);await settle();buttons().at(-1).click();await settle();let input=w.document.querySelector('#guardrail-override-reason');const typed='Deliberate exception after reviewing my cap.';
 if(input){input.value=' '+typed+' ';input.dispatchEvent(new w.Event('input'));ok('nonblank text enables explicit confirmation',!buttons().at(-1).disabled);buttons().at(-1).click();await settle();}else ok('nonblank text enables explicit confirmation',false,'no dialog');
 const saved=await D.db.prepare("SELECT * FROM trades WHERE user_id=? AND symbol='TEST' ORDER BY id DESC LIMIT 1").get(u.userId);
 ok('actual browser confirmation POSTs reason to server',tradePosts().some(r=>r.body.override_reason===typed),tradePosts());
 ok('browser-selected reason persists with fresh stopped snapshot',saved?.override_reason===typed && saved.entry_permission==='overridden' && JSON.parse(saved.guardrail_snapshot || '{}').status==='stop',saved);
 const history=await w.API.get('/journal/2026-10-11');const historyNode=w.Views.guardrailHistory ? w.Views.guardrailHistory(history.guardrail_events || []) : w.document.createElement('div');ok('actual review renders the captured reason AND violated rule',historyNode.textContent.includes(typed) && historyNode.textContent.includes('max_trades_day'),historyNode.textContent);
 closeAll();const actualDaily=Cor.dailyState;Cor.dailyState=async()=>{throw Error('Declared preflight outage');};await w.App.openTrade(null,entry);await settle();
 ok('unavailable check disables both entry actions; no override affordance',buttons().slice(1).every(b=>b.disabled && !b.classList.contains('guardrail-stop')),buttons().map(b=>({text:b.textContent,disabled:b.disabled})));
 const recordOnly=w.document.querySelector('#tf-record-only');before=await count();
 if(recordOnly){recordOnly.checked=true;recordOnly.dispatchEvent(new w.Event('change'));await settle();ok('honest record-only mode remains enabled during unknown permission',buttons().slice(1).every(b=>!b.disabled));buttons().at(-1).click();await settle();}else ok('honest record-only mode remains enabled during unknown permission',false,'no record-only mode');
 const record=await D.db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY id DESC LIMIT 1').get(u.userId);ok('record-only mode records OPEN reality but never grants permission',await count()===before+1 && record.entry_permission==='record_only' && JSON.parse(record.guardrail_snapshot || '{}').status==='unknown',record);Cor.dailyState=actualDaily;
 closeAll();await w.App.openTrade(null,{...entry,account_id:second});await settle();ok('other owned clear account is not poisoned by first account stop',buttons().slice(1).every(b=>!b.disabled && !b.classList.contains('guardrail-stop')),buttons().map(b=>b.textContent));
 let select=w.document.querySelector('#tf-account');select.value=String(u.accountId);select.dispatchEvent(new w.Event('change'));await settle();ok('switching form account rechecks and reinstates its stop',buttons().at(-1).classList.contains('guardrail-stop'),buttons().at(-1).textContent);
 closeAll();const get=w.API.get;let release;const stopState=await Cor.dailyState(u.userId,{accountId:u.accountId,entryTf:'5m',forEntry:true});
 w.API.get=(url,params)=>url==='/bots/guardrails' && Number(params.account_id)===u.accountId ? new Promise(r=>release=()=>r({daily:stopState})) : get(url,params);
 await w.App.openTrade(null,entry);select=w.document.querySelector('#tf-account');select.value=String(second);select.dispatchEvent(new w.Event('change'));await settle();if(release)release();await settle();ok('late first-account preflight cannot overwrite second-account state',!!release && !buttons().at(-1).disabled && !buttons().at(-1).classList.contains('guardrail-stop'),buttons().at(-1).textContent);w.API.get=get;closeAll();
 // Exercise the actual trade-form copy handler with exact integer price100.
 let copied=null;w.TV={link:()=> '#',openInApp(){},copy:text=>{copied=text;}};
 await w.App.openTrade(null,{...entry,account_id:second});await settle();const copy=[...lastModal().querySelectorAll('button')].find(b=>b.textContent==='Copy plan (alert text)');copy?.click();await settle();
 ok('manual prospective plan copy goes through fresh server admission',requests.some(r=>r.url==='/api/bots/signals/save-plan' && r.body.account_id===second && r.body.entry===100 && r.body.stop===99),requests.filter(r=>r.url.includes('save-plan')).at(-1));
 ok('authorised clipboard preserves integer entry100/target110, not trailing-zero truncation',copied?.includes('entry 100') && copied.includes('target 110'),copied);
 closeAll();await w.App.openTrade(null,{...entry,record_only:true});await settle();copied=null;[...lastModal().querySelectorAll('button')].find(b=>b.textContent==='Copy plan (alert text)')?.click();await settle();ok('historical clipboard is explicitly labelled journal/research, not live permission',copied?.startsWith('JOURNAL / RESEARCH ONLY'),copied);closeAll();
 // Actual market-read composition for the bot UI. Declare candle IO/ordinary CRT only.
 const F=require('./helpers/entry-preference-fixture'),P=require(path.join(APP,'src/bots/protected')),Mom=B.momentum,TD=Mom.topdown,SU=B.setup,rawSetup=SU.buildSetups,rawTD=TD.build;
 const f=F.named(P,-1,'market_shift',true);for(const s of [f.input.series,f.input.biasSeries,f.input.triggerSeries])s.smc.sessions=B.smc.sessionState(new Date(f.END));
 const c=rawSetup(f.input.series.smc,{price:f.input.series.price,atr:1,bias:f.htfDir,balance:10000,riskPct:.5,entrySeries:f.input.series,observedAt:f.END,topdown:rawTD(f.input)}).candidates.find(c=>c.dir===-1);const target=c.levels.entry-Math.abs(c.levels.entry-c.levels.stop)*1.5;
 f.input.triggerSeries.smc.order_blocks.push({dir:-1,bottom:target-.1,top:target,strength:1,breached:false,mitigated:false,t:f.END-300000});
 const series=async(symbol,tf)=>({'4h':f.input.biasSeries,'15m':f.input.series,'5m':f.input.triggerSeries}[tf]);const rawAnalyse=Mom.analyse;TD.build=args=>F.asOrdinaryCRT(rawTD({...args,opts:{...args.opts,observedAt:f.END}}),f);Mom.analyse=(symbol,tf,opts)=>rawAnalyse(symbol,tf,{...opts,nowMs:f.END,seriesLoader:series});Mom.series=series;require(path.join(APP,'src/candles')).getCandles=series;require(path.join(APP,'src/market')).getCalendar=async()=>({events:[]});B.predict.predict=async()=>({ok:false,note:'No calibration in this fixture'});
 // Draw widgets are an explicit seam; no pixel rendering is claimed.
 w.TV={ok:false,link:()=> '#',fallback:()=>w.document.createElement('div'),mini:()=>w.document.createElement('div'),planText:()=> 'exact fixture plan',copy:text=>{copied=text;}};w.requestAnimationFrame=()=>0;
 const apiGet=w.API.get,reads=[];w.API.get=(url,params)=>{reads.push({url,params});if(url==='/bots/analyse'){const p=B.analyse('TEST','15m',{userId:u.userId,accountId:params.account_id || u.accountId,minRR:1,nowMs:f.END,includePrediction:false});pending.push(p);return p;}if(url==='/bots/chart'){const p=B.chart('TEST','15m',{userId:u.userId,accountId:params.account_id || u.accountId,minRR:1,nowMs:f.END,bars:200});pending.push(p);return p;}if(url==='/bots/markets')return Promise.resolve({markets:[]});if(url==='/chart/drawings')return Promise.resolve({drawings:[]});return apiGet(url,params);};
 load('views/bots.js');const root=w.document.getElementById('root');w.App.refresh=()=>{try{w.Views.bots.render(root);}catch(e){errors.push(e.message);}};w.__botRequest={symbol:'TEST',tf:'15m'};w.Views.bots.render(root);await settle();await settle();
 const find=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);const regular=find('Copy plan'),overrideCopy=find('Override & copy plan'),save=find('Override & save signal');
 ok('bot UI disables ordinary Copy at personal stop',regular?.disabled,regular?.disabled);
 ok('technically eligible personal stop gets a grey reason-required copy path',overrideCopy?.classList.contains('guardrail-stop') && !overrideCopy.disabled,root.textContent.slice(0,400));
 ok('save-signal is grey and explicit about override',save?.classList.contains('guardrail-stop') && !save.disabled,save?.textContent);
 before=requests.filter(r=>r.url.includes('save-plan')).length;copied=null;overrideCopy?.click();await settle();input=w.document.querySelector('#guardrail-override-reason');ok('bot copy asks reason before clipboard or plan POST',!!input && copied===null && requests.filter(r=>r.url.includes('save-plan')).length===before,{dialog:!!input,copied});
 if(input){input.value=typed;input.dispatchEvent(new w.Event('input'));buttons().at(-1).click();await settle();}ok('bot copy follows a recorded single-action override, labelled not a broker order',copied?.startsWith('PERSONAL OVERRIDE RECORDED (not a broker order)'),copied);
 closeAll();w.Store.accountId=second;w.Views.bots.render(root);await settle();await settle();ok('shared account switch refreshes bot data for selected account',reads.filter(r=>r.url==='/bots/analyse').at(-1)?.params?.account_id===second && !find('Override & copy plan'),reads.filter(r=>r.url==='/bots/analyse').at(-1));
 ok('UI composition has no runtime errors',errors.length===0,errors);
}catch(e){fail++;console.error(e.stack);}finally{dom?.window.close();if(server)await new Promise(r=>server.close(r));if(process.env.M79_RESULT)fs.writeFileSync(process.env.M79_RESULT,JSON.stringify({app:APP,pass,fail,results,errors,scope:'Actual browser scripts/auth/SQL, declared graph/bootstrap/candle IO seams; no pixel, production feed, broker or outcome claim'},null,2)+'\n');console.log(`M80 UI: ${pass} passed, ${fail} failed`);for(const x of ['','-wal','-shm'])try{fs.unlinkSync(file+x);}catch{}process.exitCode=fail?1:0;}})();
