#!/usr/bin/env node
'use strict';
/** Build a real shipped-parent SQLite schema in a child, migrate with current
 * code twice, preserve legacy bytes/NULL provenance and observe without guessing
 * historical permission. Local migration only, not hosted Turso/Vercel proof. */
const path=require('path'),fs=require('fs'),os=require('os'),cp=require('child_process');
const APP=process.env.TJ_APP || path.join(__dirname,'../extracted/tradejournal');
const PARENT=process.env.TJ_PARENT || '/tmp/m79-parent/extracted/tradejournal';
const file=path.join(os.tmpdir(),`m79-migration-${process.pid}.db`),NOW=Date.UTC(2026,9,11,12);
const env={...process.env,TRADEJOURNAL_DB:file,TURSO_DATABASE_URL:'',LIBSQL_URL:'',TURSO_AUTH_TOKEN:''};
let pass=0,fail=0;const results=[];const ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
function child(app,code){const r=cp.spawnSync(process.execPath,['-e',`const D=require(${JSON.stringify(path.join(app,'src/db'))});D.ready.then(async()=>{${code}}).then(x=>{console.log('RESULT_JSON '+JSON.stringify(x));process.exit(0)}).catch(e=>{console.error(e.stack);process.exit(1)});`],{env,encoding:'utf8'});const line=r.stdout.split('\n').find(l=>l.startsWith('RESULT_JSON '));if(r.status || !line)throw Error(r.stderr || r.stdout);return JSON.parse(line.slice(12));}
(async()=>{try{
 const initial=child(PARENT,`const u=await D.createUser({email:'m79-migration@test.local',name:'Old data',password:'test-only'});await D.db.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,closed_at,entry,exit,net_pnl,notes) VALUES (?,?,'TEST','closed','2025-01-01T09:00:00Z','2025-01-01T10:00:00Z',100,101,50,'Keep this truthful history')").run(u.userId,u.accountId);await D.db.prepare("INSERT INTO trades(user_id,account_id,symbol,status,opened_at,entry,notes) VALUES (?,?,'TEST','open','2026-10-11T11:00:00Z',100,'Legacy open: no invented permit')").run(u.userId,u.accountId);return {u,rows:await D.db.prepare('SELECT * FROM trades ORDER BY id').all(),columns:await D.db.prepare('PRAGMA table_info(trades)').all()};`);
 ok('real parent schema lacks newly introduced admission provenance',initial.rows.length===2 && !initial.columns.some(c=>c.name==='guardrail_snapshot'));
 const code=`return {rows:await D.db.prepare('SELECT * FROM trades ORDER BY id').all(),account:await D.db.prepare('SELECT * FROM accounts WHERE id=?').get(${initial.u.accountId}),tables:await D.db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'guardrail_%' ORDER BY name").all(),events:await D.db.prepare('SELECT COUNT(*) n FROM guardrail_events').get(),admissions:await D.db.prepare('SELECT COUNT(*) n FROM guardrail_entry_admissions').get()};`;
 const one=child(APP,code),two=child(APP,code);
 ok('additive migration preserves every original legacy trade field',initial.rows.every((old,i)=>Object.keys(old).every(k=>one.rows[i][k]===old[k])));
 ok('legacy snapshots/reasons/permissions stay NULL, never reconstructed',one.rows.every(r=>r.guardrail_snapshot===null && r.entry_permission===null && r.override_reason===null));
 ok('existing account receives the explicit default cap of three',one.account.max_trades_day===3);
 ok('fresh schema contains cap, immutable history and separate mechanical state/admissions',one.tables.length===4,one.tables);
 ok('migration fabricates no historical event or entry permission',one.events.n===0 && one.admissions.n===0);
 ok('second boot is byte-equivalent/idempotent for legacy data',JSON.stringify(one)===JSON.stringify(two));
 const observed=child(APP,`const daily=await require(${JSON.stringify(path.join(APP,'src/bots/correction'))}).dailyState(${initial.u.userId},{accountId:${initial.u.accountId},nowMs:${NOW},entryTf:'5m',forEntry:true});return {daily,rows:await D.db.prepare('SELECT * FROM trades ORDER BY id').all(),admissions:await D.db.prepare('SELECT COUNT(*) n FROM guardrail_entry_admissions').get()};`);
 ok('current observation counts the one legacy entry without inventing admission',observed.daily.today.trades===1 && observed.admissions.n===0 && observed.rows.every(r=>r.entry_permission===null),observed.daily.today);
 ok('day-start equity includes the actual older closed P&L, unchanged by migration',observed.daily.today.balance===10050 && observed.daily.status==='clear',observed.daily.today);
}catch(e){fail++;console.error(e.stack);}finally{if(process.env.M79_RESULT)fs.writeFileSync(process.env.M79_RESULT,JSON.stringify({app:APP,parent:PARENT,pass,fail,results,scope:'Actual prior-schema local SQLite migration/idempotence; no legacy backfill and no hosted/production migration claim'},null,2)+'\n');console.log(`M79 migration: ${pass} passed, ${fail} failed`);for(const s of ['','-wal','-shm'])try{fs.unlinkSync(file+s);}catch{}process.exitCode=fail?1:0;}})();
