#!/usr/bin/env node
'use strict';
/** Controlled actual DROP of optional media table. Capture unhandled promises
 * only to MEASURE the parent's missing HTTP error response; request abort500ms
 * bounds that NEGATIVE, never grants success or repairs production. */
const H=require('./m87-test-support'),{D,ok,start,body,finish}=H;
const rejected=[];process.on('unhandledRejection',e=>{rejected.push(e.message);console.error('MEASURED unhandled parent/route promise:',e.stack);});
finish('M87 screenshot-enabled backup storage outage',async()=>{const {user:u,req,token}=await start('backup-outage');await req('/trades',body(u));const before=JSON.stringify(await D.db.prepare('SELECT * FROM trades ORDER BY id').all());await D.db.prepare('DROP TABLE trade_screenshots').run();for(const kind of ['json','csv']){let status=null,text=null,abort=null;try{const r=await fetch('http://127.0.0.1:'+H.port()+'/api/export/'+kind,{headers:{'x-session':token},signal:AbortSignal.timeout(500)});status=r.status;text=await r.text();}catch(e){abort=e.name;}ok('actual '+kind+' backup missing media store returns503 JSON, not unhandled/hung success',status===503&&JSON.parse(text||'{}').error?.includes('unavailable'),{status,text,abort,rejected:[...rejected]});}ok('missing evidence backup does not erase or alter financial/grade/core rows',JSON.stringify(await D.db.prepare('SELECT * FROM trades ORDER BY id').all())===before);ok('actual owned export routes no unhandled promise rejection',rejected.length===0,rejected);});
