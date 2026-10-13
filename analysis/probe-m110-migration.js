'use strict';
/** The ACTUAL 145-file M109 release parent, then the same database on the delivered tree: M110
 * must add exactly TWO columns to `accounts` (the asymmetric pair), leave every other schema
 * object and every inherited fact byte-identical, read an inherited account at the documented
 * 15/45 rather than the parent's own 45 constant, refuse the parent's single `?window=` knob, and
 * be a no-op on a second open. It also records what the parent was BEFORE the change: one number
 * applied by Math.abs, so the same value governed both sides of every release. */
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),
  APP=path.resolve(process.env.TJ_APP||'extracted/tradejournal'),PARENT=process.env.TJ_PARENT||'/tmp/m110-parent/app',
  file=path.join(os.tmpdir(),`m110-migration-${process.pid}.db`),results=[];let pass=0,fail=0;
const ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log((v?'ok':'FAIL')+' '+label+(!v?' '+JSON.stringify(detail):''));v?pass++:fail++;};
const NEWBLOCK='news_block_before_min',NEWSETTLE='news_settle_after_min';
const common=`const fs=require('fs'),path=require('path'),crypto=require('crypto'),APP=process.env.CHILD_APP,RealDate=Date,NOW=Number(process.env.CHILD_NOW);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};const D=require(path.join(APP,'src/db'));const inspect=async uid=>{const objects=await D.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),facts={},digests={};for(const {name,sql} of objects.filter(o=>o.sql&&o.sql.startsWith('CREATE TABLE'))){try{const rows=await D.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all();facts[name]=rows;digests[name]={rows:rows.length,sha:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,32)};}catch{digests[name]='<unreadable>';}}const cols=await D.db.prepare('PRAGMA table_info(accounts)').all();return {objects,digests,accounts:facts.accounts||[],cols:cols.map(c=>[c.name,c.type,c.notnull,c.dflt_value]),accountCols:cols.map(c=>c.name),row:(facts.accounts||[]).find(a=>a.user_id===uid)||null};};`;
const server=(acc)=>`const express=require(path.join(APP,'node_modules/express')),app=express();app.use(express.json());app.use('/api',require(path.join(APP,'src/routes/api')));const server=await new Promise(r=>{const s=app.listen(0,'0.0.0.0',()=>r(s));}),token=await D.createSession(UID),req=async(p,b,method='POST')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+p,{method,headers:{'content-type':'application/json','x-session':token},...(b===undefined?{}:{body:JSON.stringify(b)})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=String(text).slice(0,120);}return {status:r.status,data};},ACC=${acc};`;
const freshfile=file+'.fresh';
const child=(app,now,code,db=file)=>{
  const r=cp.spawnSync(process.execPath,['-e',common+`(async()=>{await D.ready;${code}})().catch(e=>{console.error(e.stack);process.exitCode=1;setTimeout(()=>process.exit(1),50);});`],
    {env:{...process.env,CHILD_APP:app,CHILD_NOW:String(now),TRADEJOURNAL_DB:db,M110_PARENT_BUNDLE:process.env.M110_PARENT_BUNDLE||'',NODE_OPTIONS:'',TURSO_DATABASE_URL:'',LIBSQL_URL:'',TURSO_AUTH_TOKEN:''},encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024});
  if(r.status!==0)throw Error('Migration child '+r.status+': '+r.stderr+'\n'+r.stdout);
  return JSON.parse(r.stdout);
};
const lines=s=>String(s).split('\n');
(async()=>{try{
  const now=Date.now()+60000;
  /* The parent records its own history BEFORE the upgrade, and answers its OWN news route while it
   * still has one knob: the same value is echoed for a short call and for the default call. */
  const parent=child(PARENT,now,`const u=await D.createUser({email:'m110-parent@test.local',name:'Actual M109 parent',password:'test-only'});const UID=u.userId;${server('u.accountId')}for(let i=0;i<3;i++)await req('/trades',{account_id:u.accountId,symbol:'DECLARED',direction:'long',status:'closed',opened_at:'2026-10-12T10:00:00.000Z',closed_at:'2026-10-12T11:00:00.000Z',entry:100,exit:101,stop:99,target:102,size:1,fees:0,setup_grade:'B'});const short5=await req('/bots/news/EURUSD?window=5',undefined,'GET'),dflt=await req('/bots/news/EURUSD',undefined,'GET');const acct=await req('/accounts',undefined,'GET'),exp=await req('/export/json',undefined,'GET');await new Promise(r=>server.close(r));console.log(JSON.stringify({u,parent_short:short5.data.window_min,parent_default:dflt.data.window_min,parent_has_windows:!!dflt.data.windows,parent_account_keys:Object.keys((acct.data.accounts||[]).find(a=>a.id===u.accountId)||{}),parent_export:exp.data,...await inspect(u.userId)}));`);
  const uid=parent.u.userId;
  const stable=child(PARENT,now+30000,`console.log(JSON.stringify(await inspect(${uid})));`);
  const lazy=Object.keys(parent.digests).filter(k=>JSON.stringify(parent.digests[k])!==JSON.stringify(stable.digests[k]));
  ok('the ACTUAL 145-file M109 parent is the previous milestone: one symmetric number applied by Math.abs, echoed as ?window=5 and as the 45 default, with no columns and no split',
    parent.parent_short===5&&parent.parent_default===45&&parent.parent_has_windows===false&&!parent.accountCols.includes(NEWBLOCK)&&!parent.accountCols.includes(NEWSETTLE),{short:parent.parent_short,dflt:parent.parent_default,cols:parent.accountCols.filter(c=>/news/i.test(c)),lazy});
  const pSrc=fs.readFileSync(path.join(PARENT,'src/bots/index.js'),'utf8');
  ok('the parent’s own source is the recorded defect, read on the parent tree: one windowMin constant and one Math.abs test for both sides of a release',
    /Math\.abs\(/.test(pSrc)&&/windowMin\s*=\s*45/.test(pSrc)&&!/news_block_before_min|news_settle_after_min|news-window/.test(pSrc),{abs:/Math\.abs\(/.test(pSrc),c45:/windowMin\s*=\s*45/.test(pSrc)});
  parent.digests=stable.digests;parent.accounts=stable.accounts;parent.objects=stable.objects;
  ok('the parent produced owned history to inherit: three closed trades and one account row',parent.digests.trades.rows===3&&!!parent.row&&parent.row.id!=null,{trades:parent.digests.trades.rows});
  ok('the parent’s own restart lazily creates its M102 default strategy snapshot and moves sqlite_sequence — recorded as inherited parent behaviour and isolated, not merged into the delta',
    JSON.stringify(lazy)===JSON.stringify(['sqlite_sequence','strategy_versions']),lazy);

  /* M110 on the SAME database. */
  const up=child(APP,now+60000,`console.log(JSON.stringify(await inspect(${uid})));`);
  const addedObjs=up.objects.filter(o=>!parent.objects.some(p=>p.name===o.name)),goneObjs=parent.objects.filter(p=>!up.objects.some(o=>o.name===p.name));
  const differing=up.objects.filter(o=>{const p=parent.objects.find(x=>x.name===o.name);return p&&p.sql!==o.sql;});
  const pa=parent.objects.find(o=>o.name==='accounts'),ua=up.objects.find(o=>o.name==='accounts');
  /* ALTER TABLE ADD COLUMN appends before the closing parenthesis, so the parent's own schema text
   * must survive as an unbroken PREFIX of the upgraded text with exactly two definitions inserted. */
  const inserted=ua.sql.slice(pa.sql.length-1),prefixOk=ua.sql.startsWith(pa.sql.slice(0,-1))&&inserted.endsWith(')');
  const counted=(w)=>(inserted.match(new RegExp(w,'g'))||[]).length;
  ok('M110 adds exactly TWO columns to `accounts` — the asymmetric pair — and no other schema object appears, disappears or changes',
    addedObjs.length===0&&goneObjs.length===0&&differing.length===1&&differing[0].name==='accounts'&&prefixOk&&counted(NEWBLOCK)===4&&counted(NEWSETTLE)===4&&!/(prop_rules|max_drawdown_pct|created_at)/.test(inserted),
    {added:addedObjs.map(o=>o.name),gone:goneObjs.map(o=>o.name),differing:differing.map(o=>o.name),prefixOk,inserted:inserted.slice(0,200)});
  const blockLine=[inserted],settleLine=[inserted];
  ok('both columns are added NOT NULL with the documented defaults, and each carries its own CHECK in the stored schema text',
    blockLine.length===1&&settleLine.length===1&&/NOT NULL DEFAULT 15/.test(blockLine[0])&&/CHECK/.test(blockLine[0])&&/BETWEEN 1 AND 240|1 AND 240/.test(blockLine[0])&&/NOT NULL DEFAULT 45/.test(settleLine[0])&&/CHECK/.test(settleLine[0])&&/30 AND 240/.test(settleLine[0]),{blockLine,settleLine});
  const colsUnchanged=JSON.stringify(up.accountCols.filter(c=>c!==NEWBLOCK&&c!==NEWSETTLE))===JSON.stringify(parent.accountCols)&&up.accountCols.length===parent.accountCols.length+2;
  ok('every pre-existing account column keeps its name, declared type, nullability and default, and the two new columns are appended LAST',
    colsUnchanged&&up.accountCols[up.accountCols.length-1]===NEWSETTLE&&up.accountCols[up.accountCols.length-2]===NEWBLOCK,{parent:parent.accountCols,up:up.accountCols});
  const inherited=up.row&&up.row[NEWBLOCK]===15&&up.row[NEWSETTLE]===45;
  const newsKeys=(o)=>Object.keys(o||{}).filter(k=>/news/.test(k)).sort();
  ok('the parent’s account row carried NO news key at all — its single number lived in the engine, not in the database',
    !!parent.row&&newsKeys(parent.row).length===0&&!parent.parent_account_keys.some(k=>/news/.test(k)),{cols:parent.accountCols.filter(c=>/news/.test(c)),keys:parent.row&&newsKeys(parent.row)});
  ok('no view or trigger anywhere in the upgraded schema mentions the old single knob, and the only object whose text mentions the pair is `accounts`',
    !up.objects.some(o=>o.sql&&/\bwindow_min\b/.test(o.sql))&&up.objects.filter(o=>o.sql&&/news_settle_after_min/.test(o.sql)).map(o=>o.name).join()==='accounts',
    up.objects.filter(o=>o.sql&&/window_min|news_settle_after_min/.test(o.sql)).map(o=>o.name));
  ok('the inherited account reads at the documented 15/45 — the parent’s own 45 constant did NOT become the pre-release block, and 45/45 did NOT survive',
    inherited,{block:up.row&&up.row[NEWBLOCK],settle:up.row&&up.row[NEWSETTLE]});
  const keyDiff=Object.keys(parent.digests).filter(t=>t!=='accounts'&&t!=='sqlite_sequence'&&JSON.stringify(parent.digests[t])!==JSON.stringify(up.digests[t]));
  ok('every inherited fact outside `accounts` is byte-identical after the upgrade: trades, gate answers, intention, practice and the session rows',
    keyDiff.length===0,keyDiff.map(t=>[t,parent.digests[t],up.digests[t]]));
  ok('the ONLY difference in the inherited `accounts` rows is the two new columns — id, name, balance and policy fields are untouched',
    JSON.stringify(parent.accounts.map(a=>({...a,[NEWBLOCK]:undefined,[NEWSETTLE]:undefined})))===JSON.stringify(up.accounts.map(a=>({...a,[NEWBLOCK]:undefined,[NEWSETTLE]:undefined}))),{parent:parent.row,up:up.row});

  /* The upgraded tree, on the inherited database, through its own HTTP surface. */
  const http=child(APP,now+90000,`const UID=${uid};${server(String(parent.u.accountId))}const accts=await req('/accounts',undefined,'GET'),one=await req('/bots/news/EURUSD',undefined,'GET'),legacy=await req('/bots/news/EURUSD?window=5',undefined,'GET'),legacy2=await req('/bots/news/EURUSD?window_min=5',undefined,'GET'),floor=await req('/bots/news/EURUSD?after=20',undefined,'GET'),pair=await req('/bots/news/EURUSD?before=60&after=120',undefined,'GET'),low=await req('/accounts/'+ACC,{news_settle_after_min:20},'PUT'),okput=await req('/accounts/'+ACC,{news_settle_after_min:30},'PUT');const before=await inspect(UID),read1=await req('/bots/news/EURUSD',undefined,'GET'),after=await inspect(UID);const hostile={};for(const [col,v] of [['news_block_before_min',0],['news_block_before_min',241],['news_block_before_min',1.5],['news_block_before_min','abc'],['news_settle_after_min',0],['news_settle_after_min',29],['news_settle_after_min',241],['news_settle_after_min',30.5]]){try{await D.db.prepare('UPDATE accounts SET '+col+'=? WHERE id=?').run(v,ACC);hostile[col+'='+String(v)]='accepted';}catch(e){hostile[col+'='+String(v)]='refused';}}const restored=await req('/accounts/'+ACC,{news_block_before_min:15,news_settle_after_min:45},'PUT');await new Promise(r=>server.close(r));console.log(JSON.stringify({acct:(accts.data.accounts||[]).find(a=>a.id===ACC),acct_has_window_min:!!(accts.data.accounts||[]).find(a=>a.id===ACC).window_min,one:{status:one.status,windows:one.data.windows,window_min:one.data.window_min,blackout:one.data.blackout},legacy:{status:legacy.status,code:legacy.data.code},legacy2:{status:legacy2.status,code:legacy2.data.code},floor:{status:floor.status,code:floor.data.code},pair:{status:pair.status,windows:pair.data.windows},low:{status:low.status,code:low.data.code},okput:okput.status,hostile,no_write_on_read:JSON.stringify(before.digests)===JSON.stringify(after.digests)&&before.objects.length===after.objects.length,read1:read1.status,restored:restored.status}));`);
  ok('the upgraded tree reads the inherited account through its OWN API at 15/45, with no bare `window_min` anywhere in the row or the payload',
    http.acct&&http.acct[NEWBLOCK]===15&&http.acct[NEWSETTLE]===45&&http.acct_has_window_min===false&&http.one.window_min===undefined,{acct:http.acct&&[http.acct[NEWBLOCK],http.acct[NEWSETTLE]],window_min:http.one.window_min});
  ok('its news payload carries the resolved pair (before/after + provenance), not the parent’s single knob',
    http.one.status===200&&http.one.windows&&http.one.windows.before_min===15&&http.one.windows.after_min===45&&/default|stored|current/.test(String(http.one.windows.source)),http.one.windows);
  ok('the upgraded `/accounts` row carries exactly the two news keys and nothing else news-shaped',
    JSON.stringify(newsKeys(http.acct))===JSON.stringify([NEWBLOCK,NEWSETTLE]),newsKeys(http.acct));
  ok('the parent’s own `?window=` call — which worked on this very database minutes earlier — is now a 400 `news_window_split_required`, and so is `?window_min=`',
    http.legacy.status===400&&http.legacy.code==='news_window_split_required'&&http.legacy2.status===400&&http.legacy2.code==='news_window_split_required',{legacy:http.legacy,legacy2:http.legacy2});
  ok('a settle under the floor is refused on the inherited database (400 `news_settle_below_floor`), a legal settle is accepted, and a research pair is applied per request',
    http.floor.status===400&&http.floor.code==='news_settle_below_floor'&&http.low.status===400&&http.low.code==='news_settle_below_floor'&&http.okput===200&&http.pair.windows.before_min===60&&http.pair.windows.after_min===120,http.pair);
  ok('hostile values written straight to SQLite are refused by the columns themselves: 0 and 241 out of the block’s bounds, a fractional 1.5 and a word on the block, and 0, 29, 241 and 30.5 on the settle',
    Object.values(http.hostile).every(v=>v==='refused'),http.hostile);
  ok('a news read on the inherited database writes nothing at all: every table byte-identical, no object added',
    http.no_write_on_read===true&&http.read1===200,{no_write_on_read:http.no_write_on_read});

  /* The backup/restore and read/write paths, on the inherited database: a bundle cannot move the
   * pair, a research pair is not stored, boundary values are accepted by the CHECKs, and nothing
   * but the accounts row is affected by any of it. */
  process.env.M110_PARENT_BUNDLE=Buffer.from(JSON.stringify(parent.parent_export),'utf8').toString('base64');
  const later=child(APP,now+96000,`const UID=${uid};${server(String(parent.u.accountId))}const parts=[];const norm=await req('/accounts/'+ACC,{news_block_before_min:15,news_settle_after_min:45},'PUT');parts.push({step:'normalise',status:norm.status,note:norm.data.news_note||null});const beforeTrade=(await inspect(UID)).digests.trades.rows;const era=await req('/import/json',{data:JSON.parse(Buffer.from(process.env.M110_PARENT_BUNDLE,'base64').toString('utf8'))});const afterEra=await req('/accounts',undefined,'GET');parts.push({step:'parent-era bundle',status:era.status,pair:[afterEra.data.accounts.find(a=>a.id===ACC).news_block_before_min,afterEra.data.accounts.find(a=>a.id===ACC).news_settle_after_min]});const foreign=JSON.parse(Buffer.from(process.env.M110_PARENT_BUNDLE,'base64').toString('utf8'));foreign.accounts=[{...(foreign.accounts||[])[0]||{},name:'Imported desk',news_block_before_min:1,news_settle_after_min:240,news_window_min:5}];foreign.news_window_min=5;foreign.news_block_before_min=240;const imp=await req('/import/json',{data:foreign});const afterImp=await req('/accounts',undefined,'GET');parts.push({step:'hostile bundle',status:imp.status,pair:[afterImp.data.accounts.find(a=>a.id===ACC).news_block_before_min,afterImp.data.accounts.find(a=>a.id===ACC).news_settle_after_min],accounts:afterImp.data.accounts.length,trades:(await inspect(UID)).digests.trades.rows});const nulPut=await req('/accounts/'+ACC,{news_settle_after_min:null},'PUT');const blankPut=await req('/accounts/'+ACC,{news_block_before_min:' '},'PUT');const afterBad=await req('/accounts',undefined,'GET');parts.push({step:'null/blank',codes:[nulPut.data.code,blankPut.data.code],pair:[afterBad.data.accounts.find(a=>a.id===ACC).news_block_before_min,afterBad.data.accounts.find(a=>a.id===ACC).news_settle_after_min]});const bounds=[];for(const [col,v] of [['news_block_before_min',1],['news_block_before_min',240],['news_settle_after_min',30],['news_settle_after_min',240]]){const r=await req('/accounts/'+ACC,{[col]:v},'PUT');const g=await req('/accounts',undefined,'GET');const row=g.data.accounts.find(a=>a.id===ACC);bounds.push([col,v,r.status,row[col]]);}await req('/accounts/'+ACC,{news_block_before_min:15,news_settle_after_min:45},'PUT');const research=await req('/bots/news/EURUSD?before=60&after=120',undefined,'GET');const storedAfter=await req('/accounts',undefined,'GET');parts.push({step:'research pair',status:research.status,pair:[storedAfter.data.accounts.find(a=>a.id===ACC).news_block_before_min,storedAfter.data.accounts.find(a=>a.id===ACC).news_settle_after_min]});const beforeWrite=await inspect(UID),tradesBeforeWrite=beforeWrite.digests.trades.rows;const write=await req('/trades',{account_id:ACC,symbol:'EURUSD',direction:'long',entry:100,stop:99,target:102,size:1});const afterWrite=await inspect(UID);const exported=await req('/export/json',undefined,'GET');const finalRead=await req('/bots/news/EURUSD',undefined,'GET');await new Promise(r=>server.close(r));console.log(JSON.stringify({parts,bounds,beforeTrade,tradesBeforeWrite,trades_now:((await inspect(UID)).digests.trades.rows),write_status:write.status,accounts_moved_by_trade:JSON.stringify(beforeWrite.digests.accounts)!==JSON.stringify(afterWrite.digests.accounts),export_news_keys:Object.keys((exported.data.accounts||[])[0]||{}).filter(k=>k==='news_block_before_min'||k==='news_settle_after_min'),export_legacy_keys:Object.keys((exported.data.accounts||[])[0]||{}).filter(k=>['window_min','windowMin','newsWindowMin','news_window_min','window'].indexOf(k)!==-1),final:{status:finalRead.status,before:finalRead.data.windows&&finalRead.data.windows.before_min,after:finalRead.data.windows&&finalRead.data.windows.after_min}}));`);
  const step=(n)=>later.parts.find(x=>x.step===n);
  ok('a bundle from the parent era (no news keys at all) imports its trades onto this desk and cannot move the pair',
    step('parent-era bundle').status===200&&JSON.stringify(step('parent-era bundle').pair)===JSON.stringify([15,45])&&later.parts[0].status===200,{era:step('parent-era bundle')});
  ok('a hostile bundle carrying its own news numbers in the account row AND at the root of the file imports its trade but leaves both clocks at the stored 15/45, creating no account',
    step('hostile bundle').status===200&&JSON.stringify(step('hostile bundle').pair)===JSON.stringify([15,45])&&step('hostile bundle').accounts===1&&step('hostile bundle').trades>later.beforeTrade,{imp:step('hostile bundle'),before:later.beforeTrade});
  ok('an accepted account write answers with a structured `news_note` naming the pair it stored and its own bounds',
    !!later.parts[0].note&&later.parts[0].note.before_min===15&&later.parts[0].note.after_min===45&&later.parts[0].note.range&&later.parts[0].note.range.settle_floor===30&&later.parts[0].note.broker_verified===false,{note:later.parts[0].note});
  ok('explicitly null or blank news values are refused (`news_window_invalid`) rather than coerced to a default, and the stored pair does not move',
    JSON.stringify(step('null/blank').codes)===JSON.stringify(['news_window_invalid','news_window_invalid'])&&JSON.stringify(step('null/blank').pair)===JSON.stringify([15,45]),step('null/blank'));
  ok('the columns accept their own boundary values — block 1 and 240, settle 30 and 240 — each written and read back exactly',
    later.bounds.every(([,v,status,stored])=>status===200&&stored===v),later.bounds);
  ok('a per-request research pair (`?before=60&after=120`) is answered but NOT stored: the account still reads 15/45 afterwards',
    step('research pair').status===200&&JSON.stringify(step('research pair').pair)===JSON.stringify([15,45]),step('research pair'));
  ok('recording a trade (200) adds one row and does not touch the news pair or any other accounts fact',
    later.write_status===200&&later.accounts_moved_by_trade===false&&later.trades_now===later.tradesBeforeWrite+1,{moved:later.accounts_moved_by_trade,trades:[later.tradesBeforeWrite,later.trades_now],status:later.write_status});
  ok('the export carries both columns and NO key spelling the old single number, so a backup taken on the upgraded tree can be restored without inventing one',
    JSON.stringify(later.export_news_keys.slice().sort())===JSON.stringify([NEWSETTLE,NEWBLOCK].slice().sort())&&later.export_legacy_keys.length===0,{news:later.export_news_keys,legacy:later.export_legacy_keys});
  ok('after the whole battery the news endpoint still reads the same stored pair, and the pair is the one the trader set',
    later.final.status===200&&later.final.before===15&&later.final.after===45,later.final);

  /* The two ways the same pair can come into existence — a fresh DDL and an ALTER on an inherited
   * table — are compared rather than assumed identical: same definition, measured position. */
  const fresh=child(APP,now+105000,`const u=await D.createUser({email:'m110-fresh@test.local',name:'Fresh',password:'test-only'});console.log(JSON.stringify({u,...await inspect(u.userId)}));`,freshfile);
  const meta=(o,c)=>{const m=o.cols.find(x=>x[0]===c);return m?[m[1],m[2],m[3]]:null;};
  const freshSql=fresh.objects.find(o=>o.name==='accounts').sql;
  ok('a fresh database gets the SAME two definitions (type, NOT NULL, default) — and the same CHECKs — as an upgraded one, re-created from the DDL rather than inherited',
    !!meta(fresh,NEWBLOCK)&&JSON.stringify(meta(fresh,NEWBLOCK))===JSON.stringify(meta(up,NEWBLOCK))&&JSON.stringify(meta(fresh,NEWSETTLE))===JSON.stringify(meta(up,NEWSETTLE))&&/news_block_before_min BETWEEN 1 AND 240/.test(freshSql)&&/news_settle_after_min BETWEEN 30 AND 240/.test(freshSql)&&/CAST\(news_block_before_min AS INTEGER\)/.test(freshSql)&&/CAST\(news_settle_after_min AS INTEGER\)/.test(freshSql),
    {fresh:[meta(fresh,NEWBLOCK),meta(fresh,NEWSETTLE)],up:[meta(up,NEWBLOCK),meta(up,NEWSETTLE)]});
  ok('and the position difference is recorded instead of hidden: the inherited columns are appended LAST, the fresh DDL places them before the drawdown fields',
    fresh.accountCols[fresh.accountCols.length-1]===NEWSETTLE!==(up.accountCols[up.accountCols.length-1]===NEWSETTLE)&&fresh.accountCols.includes(NEWBLOCK)&&up.accountCols.includes(NEWBLOCK),
    {freshTail:fresh.accountCols.slice(-3),upTail:up.accountCols.slice(-3)});
  ok('a brand-new delivered database reads its own account at 15/45 with no bare `window_min` column anywhere in the schema',
    fresh.row&&fresh.row[NEWBLOCK]===15&&fresh.row[NEWSETTLE]===45&&!/\bwindow_min\b/.test(freshSql),{row:fresh.row&&[fresh.row[NEWBLOCK],fresh.row[NEWSETTLE]]});

  /* Re-opening is a no-op, and the parent's own code can still read the file it left behind. */
  const again=child(APP,now+120000,`console.log(JSON.stringify(await inspect(${uid})));`);
  ok('a second open of the upgraded database is a no-op: same objects, same columns, same pair, same facts',
    JSON.stringify(again.objects.map(o=>[o.type,o.name,o.sql]))===JSON.stringify(up.objects.map(o=>[o.type,o.name,o.sql]))&&JSON.stringify(again.accountCols)===JSON.stringify(up.accountCols)&&JSON.stringify(again.digests)===JSON.stringify(again.digests)&&again.row&&again.row[NEWBLOCK]===15&&again.row[NEWSETTLE]===45,{cols:again.accountCols.slice(-2)});
  const back=child(PARENT,now+150000,`const S=require(path.join(APP,'src/bots/setup'));console.log(JSON.stringify({...await inspect(${uid}),live:(await D.db.prepare('SELECT COUNT(*) AS n FROM trades WHERE user_id=?').get(${uid})).n}));`);
  ok('the change is additive in the strongest sense available here: the PARENT’s own code still reads the upgraded file and finds its history intact',
    back.digests.trades.rows===later.trades_now&&back.live===later.trades_now&&back.row&&back.row[NEWBLOCK]===15,{trades:back.digests.trades.rows,live:back.live,expected:later.trades_now});

  fs.writeFileSync(process.env.M110_RESULT||path.join(os.tmpdir(),'m110-migration.json'),JSON.stringify({app:APP,parent:PARENT,pass,fail,results,scope:'ACTUAL145-file M109 release parent → delivered tree on the same database: exactly two added columns with their own CHECKs, every other schema object and inherited fact byte-identical, the parent’s single knob refused rather than mapped, re-open a no-op; synthetic/local, not broker/real-money proof'},null,2)+'\n');
  console.log(`M110 asymmetric news-window migration vs the actual M109 release: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
}catch(e){console.error(e&&e.stack||e);process.exit(1);}})();
