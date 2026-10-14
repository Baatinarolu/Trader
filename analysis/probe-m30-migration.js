'use strict';
/**
 * M30 migration probe: the choice lives in the settings JSON that ALREADY exists, so the row a
 * committed release wrote is read by the delivered tree with nothing migrated, nothing re-stamped
 * and not one byte rewritten by a read.
 *
 * The claims are mostly negative and they are measured in both trees' OWN code on ONE fixture: the
 * parent's real `PUT /api/settings` route (booted in its own process, on the fixture file) writes
 * the row the way every existing trader's row was written — with `zone_method` in the body and
 * dropped on the floor — and the delivered tree then opens that same file and is asked what
 * geometry it reads. Its own `/api/bots/analyse` answers, so the thing measured is the route the
 * screen calls, not a helper this probe could have gotten wrong the same way twice.
 *
 * Order is part of the evidence: the parent writes FIRST, the delivered tree reads and chooses
 * SECOND, and the parent opens the file a THIRD time to show what a released build does with a key
 * it has never heard of.
 */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const H = require('./m30-test-support'), { ok } = H;
const APP = H.APP, PARENT = process.env.TJ_PARENT || '/tmp/m30-parent/app';
const SHIM = path.join(__dirname, 'candle-shim.js');
const SYNTH = path.join(__dirname, 'harness', 'synth');
const file = path.join(os.tmpdir(), `m30-migration-${process.pid}.db`);

const INSPECT = `
const inspect=async()=>{const objects=await D.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),digests={};
for(const {name,sql} of objects.filter(o=>o.sql&&o.sql.startsWith('CREATE TABLE'))){try{digests[name]=crypto.createHash('sha256').update(JSON.stringify(await D.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all())).digest('hex');}catch{digests[name]='<unreadable>';}}
return {objects:objects.map(o=>o.type+':'+o.name+':'+o.sql),digests};};`;

/** The two fixture rows, written by whichever tree seeds: a user through the app's own user
 *  creation, an account, and two closed trades so the boot paths that read history run here too. */
const SEED = `
const made=await D.createUser({email:'m30@test.local',name:'M30 trader',password:'test-only'});
const seededIds={uid:made.userId,acc:null};
await D.db.prepare("INSERT INTO accounts (user_id,name,starting_balance,created_at) VALUES (?,?,?,datetime('2026-10-13 08:00:00'))").run(seededIds.uid,'M30 desk',10000);
seededIds.acc=Number((await D.db.prepare('SELECT id FROM accounts WHERE user_id=?').get(seededIds.uid)).id);
const trade=D.db.prepare("INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,setup_grade,net_pnl,r_multiple,risk_amount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('2026-10-13 08:00:00'),datetime('2026-10-13 08:00:00'))");
const at=(d,t)=>d+'T'+t+':00.000Z';
await trade.run(seededIds.uid,seededIds.acc,'EURUSD','long','closed',at('2026-10-13','07:00'),at('2026-10-13','08:00'),1.1,1.1010,1.0990,1.1030,1,0,'A',100,1.0,100);
await trade.run(seededIds.uid,seededIds.acc,'EURUSD','short','closed',at('2026-10-12','07:00'),at('2026-10-12','08:00'),1.1,1.0990,1.1010,1.0970,1,0,'B',-50,-0.5,100);
console.log(JSON.stringify({uid:seededIds.uid,acc:seededIds.acc,tables:Object.keys((await inspect()).digests).length}));`;

/** The parent's own route, on the fixture file: the write every existing trader's row went through.
 *  `zone_method` is in the body because that is what a client following the new docs sends to an
 *  old server — and what the old server does with it is the thing being measured. */
const PARENT_WRITE = `
const D_READ=async()=>JSON.parse((await D.db.prepare('SELECT settings FROM users WHERE id=?').get(uid)).settings);
const before=await inspect();
const me=await req('/auth/me',undefined,'GET');
const write=await req('/settings',{zone_method:'range',min_rr:1.5},'PUT');
const stored=await D_READ();
const SMC=require(path.join(APP,'src/bots/smc')),Synth=require(SYNTH);
const cs=Synth.series({seed:3,bars:900});
let zoneKeys=[],sameBoxes=null,zones=0;
for(let i=400;i<cs.length-5;i+=7){const an=SMC.analyse(cs.slice(i-300,i+1),{tf:'15m',now:cs[i].t});
 if(!an.ok||!an.order_blocks.length)continue;
 const again=SMC.analyse(cs.slice(i-300,i+1),{tf:'15m',now:cs[i].t,zoneMethod:'range'});
 zoneKeys=Object.keys(an.order_blocks[0]);zones=an.order_blocks.length;
 sameBoxes=JSON.stringify(an.order_blocks.map(z=>[z.top,z.bottom]))===JSON.stringify(again.order_blocks.map(z=>[z.top,z.bottom]));
 break;}
console.log(JSON.stringify({me_settings:me.data.user.settings,write_status:write.status,echo:write.data.settings||write.data,
 stored,stored_keys:Object.keys(stored),zones,zoneKeys,sameBoxes_with_zoneMethod_opt:sameBoxes,before}));`;

/** The DELIVERED tree on the parent's own row: what the routes read, and what a choice costs. */
const DELIVERED_READ = `
const D_READ=async()=>JSON.parse((await D.db.prepare('SELECT settings FROM users WHERE id=?').get(uid)).settings);
const SMC=require(path.join(APP,'src/bots/smc'));
const read=async(q)=>{const r=await req('/bots/analyse'+q,undefined,'GET');
 const f=(r.data.setups&&r.data.setups.filters&&r.data.setups.filters.zone_method)||null;
 const s=r.data.smc||{};
 return {status:r.status,method:f&&f.method,requested:f&&f.requested,source:f&&f.source,applied:f&&f.applied_zones,
  fallbacks:f&&f.base_fallbacks,error:f&&f.error,
  engine:{method:s.zone_method,requested:s.zone_method_requested,source:s.zone_method_source,applied:s.zone_method_applied,fallback:s.zone_method_fallback},
  zone_keys:(s.order_blocks&&s.order_blocks[0])?Object.keys(s.order_blocks[0]):[],
  zones:(s.order_blocks||[]).length,range_zones:(s.order_blocks||[]).filter(z=>z.zone_method==='range').length,
  boxes:(s.order_blocks||[]).map(z=>[z.top,z.bottom])};};
const Q='?symbol=EURUSD&tf=15m&prediction=0&bars=600&account_id='+acc;
const before=await inspect();
const stored_before=await D_READ();
const unset=await read(Q);
const write=await req('/settings',{zone_method:'range'},'PUT');
const stored_after=await D_READ();
const mid=await inspect();
const chosen=await read(Q);const chosen2=await read(Q);
const after_reads=await inspect();
const bad=await req('/settings',{zone_method:'consolidation'},'PUT');
const bad_left_the_row=(JSON.stringify(await D_READ())===JSON.stringify(stored_after));
/* A value the app cannot plot, written straight into the JSON by something that is not this route:
 * the read must REPORT it rather than quietly run a default and say nothing. */
await D.db.prepare('UPDATE users SET settings=? WHERE id=?').run(JSON.stringify({...stored_after,zone_method:'consolidation'}),uid);
const foreign=await read(Q);
await D.db.prepare('UPDATE users SET settings=? WHERE id=?').run(JSON.stringify(stored_after),uid);
const edited_back=(JSON.stringify(await D_READ())===JSON.stringify(stored_after));
const read_write_set=Object.keys({...mid.digests,...after_reads.digests}).filter(k=>mid.digests[k]!==after_reads.digests[k]).sort();
console.log(JSON.stringify({stored_before,unset,write_status:write.status,read_write_set,
 settings_row_untouched_by_reads:mid.digests.users===after_reads.digests.users,
 stability:JSON.stringify(chosen)===JSON.stringify(chosen2),
 added_keys:Object.keys(write.data.settings||{}).filter(k=>!(k in stored_before)),
 dropped_keys:Object.keys(stored_before).filter(k=>!(k in (write.data.settings||{}))),
 stored_after,chosen,bad:{status:bad.status,code:bad.data&&bad.data.code,error:bad.data&&bad.data.error,left_the_row:bad_left_the_row},
 foreign,edited_back,zone_method_in_ddl:before.objects.filter(o=>/zone_method/i.test(o)),
 before,after_reads,vocab:SMC.ZONE_METHODS,sources:SMC.ZONE_METHOD_SOURCES}));`;

/** The parent opening the file AFTER the delivered tree chose: a released build has never heard of
 *  the key. It round-trips whatever sits in the JSON and reads none of it — measured, not assumed. */
const PARENT_AFTER = `
const D_READ=async()=>JSON.parse((await D.db.prepare('SELECT settings FROM users WHERE id=?').get(uid)).settings);
const stored=await D_READ();
const write=await req('/settings',{timezone:'Europe/London'},'PUT');
const echo=write.data.settings||{};
const SMC=require(path.join(APP,'src/bots/smc')),Synth=require(SYNTH);
const cs=Synth.series({seed:3,bars:900});
let hasZoneMethodKey=false,zonesWithMethod=0,ignoredOptIdentical=null;
for(let i=400;i<cs.length-5;i+=7){const an=SMC.analyse(cs.slice(i-300,i+1),{tf:'15m',now:cs[i].t,zoneMethod:'range'});
 if(!an.ok||!an.order_blocks.length)continue;
 const base=SMC.analyse(cs.slice(i-300,i+1),{tf:'15m',now:cs[i].t});
 hasZoneMethodKey=an.order_blocks.some(z=>'zone_method' in z);
 zonesWithMethod=an.order_blocks.filter(z=>(z.zone_method||'pivot')==='range').length;
 ignoredOptIdentical=JSON.stringify(an.order_blocks.map(z=>[z.top,z.bottom]))===JSON.stringify(base.order_blocks.map(z=>[z.top,z.bottom]));
 break;}
console.log(JSON.stringify({stored,echo_keys:Object.keys(echo),kept_key:Object.prototype.hasOwnProperty.call(echo,'zone_method'),
 timezone_echo:echo.timezone,hasZoneMethodKey,zonesWithMethod,ignoredOptIdentical,look:await inspect()}));`;

/** The parent doing nothing but reading, twice, on the same fixture: the set of tables a read
 *  writes is the released build's own set, which is the control the delivered set is compared to. */
const PARENT_READS = `
const Q='?symbol=EURUSD&tf=15m&prediction=0&bars=600&account_id='+acc;
/* The window is mirrored on purpose: a WARM-UP read first (the delivered child's first analyse),
 * then two measured reads. A cold first read creates the day-state rows, and measuring the parent
 * cold against the delivered warm would compare two different windows and call it a difference. */
const warm=await req('/bots/analyse'+Q,undefined,'GET');
const m1=await inspect();
const a=await req('/bots/analyse'+Q,undefined,'GET'),b=await req('/bots/analyse'+Q,undefined,'GET');
const m2=await inspect();
const s=a.data.smc||{};
console.log(JSON.stringify({status:a.status,warm:!!warm.data,stable:JSON.stringify(a.data.smc&&a.data.smc.order_blocks)!==JSON.stringify(b.data.smc&&b.data.smc.order_blocks)?'differs':'same',
 zone_keys:(s.order_blocks&&s.order_blocks[0])?Object.keys(s.order_blocks[0]):[],smc_zone_method:s.zone_method===undefined?null:s.zone_method,
 top_keys:Object.keys(a.data.setups&&a.data.setups.filters||{}),
 read_write_set:Object.keys({...m1.digests,...m2.digests}).filter(k=>m1.digests[k]!==m2.digests[k]).sort()}));`;

/** One minimal server over the app's real API router — the same recipe the harness uses, so the
 *  routes are the app's own and the session is one this tree minted. */
const BOOT = `const express=require(path.join(APP,'node_modules/express'));const app=express();app.use(express.json({limit:'25mb'}));app.use('/api',require(path.join(APP,'src/routes/api')));const server=await new Promise(r=>{const s=app.listen(0,'0.0.0.0',()=>r(s));});const token=await D.createSession(uid);const req=async(url,body,method='POST')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+url,{method,headers:{'content-type':'application/json',...(token?{'x-session':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data};};`;

const run = (app, db, code, { shim = false, boot = true } = {}) => {
  const head = boot ? `const uid=Number((await D.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()).id);
const acc=Number((await D.db.prepare('SELECT id FROM accounts WHERE user_id=? ORDER BY id LIMIT 1').get(uid)).id);
${BOOT}` : '';
  const out = cp.spawnSync(process.execPath, ['-e', `const path=require('path'),APP=${JSON.stringify(app)},SYNTH=${JSON.stringify(SYNTH)},crypto=require('crypto');
for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';
const D=require(path.join(APP,'src/db'));
${INSPECT}
(async()=>{await D.ready;
${head}
${code}
/* The fixture server is this child's own: it is closed explicitly so the process exits on the
 * printed answer rather than being killed for still listening. */
try{server.close()}catch(e){}process.exit(0);})().catch(e=>{console.error(e.stack);process.exitCode=1;});`],
    { env: { ...process.env, TRADEJOURNAL_DB: db, NODE_OPTIONS: shim ? '--require=' + SHIM : '', TURSO_DATABASE_URL: '', LIBSQL_URL: '', TURSO_AUTH_TOKEN: '', TJ_SHIM_QUIET: '1' }, encoding: 'utf8', timeout: 300000 });
  if (out.status !== 0) throw new Error('child ' + out.status + ': ' + out.stderr + '\n' + out.stdout);
  const last = out.stdout.trim().split('\n').filter(Boolean).pop();
  return JSON.parse(last);
};
const differing = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
const clean = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch { } } };

H.finish('M30 migration: a settings row the committed parent wrote is read with no migration and no write', async () => {
  const S = H.mod('src/bots/smc');
  if (!H.shipped(S, 'the zone-method vocabulary and the consolidation walk (src/bots/smc.js)')) return;
  ok('the parent tree IS the committed release this milestone is built on: it carries the M56 plan gate and the earlier review modules, and no zone-method vocabulary',
    fs.existsSync(path.join(PARENT, 'src/bots/plan-gate.js')) && fs.existsSync(path.join(PARENT, 'src/periods.js'))
    && !/ZONE_METHODS/.test(fs.readFileSync(path.join(PARENT, 'src/bots/smc.js'), 'utf8')),
    { parent: fs.existsSync(PARENT) });
  clean(file);
  const seeded = run(PARENT, file, SEED, { boot: false });
  ok('the fixture is a real workspace on the parent\u2019s own boot: a user, an account and two closed trades, with the parent\u2019s whole schema created around them',
    seeded.uid > 0 && seeded.acc > 0 && seeded.tables > 20, seeded);

  const parentWrite = run(PARENT, file, PARENT_WRITE);
  ok('the parent\u2019s own settings route accepts the new key with 200 and stores a row WITHOUT it \u2014 the shape every existing trader\u2019s row is in',
    parentWrite.write_status === 200 && parentWrite.stored_keys.indexOf('zone_method') === -1
    && parentWrite.echo && !Object.prototype.hasOwnProperty.call(parentWrite.echo, 'zone_method'),
    { status: parentWrite.write_status, keys: parentWrite.stored_keys, echo: parentWrite.echo });
  ok('and the row it wrote really is a settings row the app serves: the other body field lands (min_rr 1.5), so the drop is the KEY and not the write',
    parentWrite.stored.min_rr === 1.5 && parentWrite.me_settings && typeof parentWrite.me_settings === 'object',
    { stored: parentWrite.stored });
  ok('the parent\u2019s engine carries no zone-method key on a zone and ignores the option entirely: `zoneMethod: \'range\'` returns byte-identical boxes',
    parentWrite.zones > 0 && parentWrite.zoneKeys.indexOf('zone_method') === -1 && parentWrite.zoneKeys.indexOf('base') === -1
    && parentWrite.sameBoxes_with_zoneMethod_opt === true,
    { zoneKeys: parentWrite.zoneKeys, identical: parentWrite.sameBoxes_with_zoneMethod_opt, zones: parentWrite.zones });

  /* The parent's own read set is measured BEFORE the delivered assertions that compare against it,
   * and after the delivered read has already moved the fixture to the chosen geometry — the parent
   * read is a control for the WRITES a read performs, not for the geometry it reads. */
  const parentReads = run(PARENT, file, PARENT_READS, { shim: true });
  const read = run(APP, file, DELIVERED_READ, { shim: true });
  ok('the delivered tree creates exactly the parent\u2019s schema: every table, index and trigger is byte-identical DDL, and no object anywhere is named after the key',
    JSON.stringify(read.before.objects) === JSON.stringify(parentWrite.before.objects) && read.zone_method_in_ddl.length === 0,
    { extra: read.before.objects.filter((o) => !parentWrite.before.objects.includes(o)), named: read.zone_method_in_ddl });
  ok('the parent\u2019s own row is read un-migrated: the stored settings the delivered tree sees are the parent\u2019s bytes, with no `zone_method` added at open time',
    JSON.stringify(read.stored_before) === JSON.stringify(parentWrite.stored) && !('zone_method' in read.stored_before),
    { parent: parentWrite.stored, delivered: read.stored_before });
  ok('with that row a real `/bots/analyse` reports the PIVOT method and says WHERE it came from: nobody chose (`default`) and nothing was requested (`requested: null`)',
    read.unset.status === 200 && read.unset.method === 'pivot' && read.unset.requested === null && read.unset.source === 'default'
    && read.unset.applied === 0 && read.unset.engine.method === 'pivot' && read.unset.engine.source === 'default',
    { filters: { method: read.unset.method, requested: read.unset.requested, source: read.unset.source, applied: read.unset.applied }, engine: read.unset.engine });
  ok('so the row the parent wrote is read exactly as the parent read it: not one zone carries the range geometry',
    read.unset.range_zones === 0 && read.unset.zones > 0,
    { zones: read.unset.zones, range: read.unset.range_zones });
  ok('and the zones now carry the geometry that was used (`zone_method`) and the walk behind it (`base`) \u2014 the naming the parent had nowhere to put',
    read.unset.zone_keys.indexOf('zone_method') !== -1 && read.unset.zone_keys.indexOf('base') !== -1,
    read.unset.zone_keys);

  ok('choosing the range method through the delivered route writes ONE key into the parent\u2019s row \u2014 `zone_method` \u2014 and drops nothing',
    read.write_status === 200 && JSON.stringify(read.added_keys) === '["zone_method"]' && read.dropped_keys.length === 0
    && read.stored_after.zone_method === 'range' && read.stored_after.min_rr === read.stored_before.min_rr,
    { added: read.added_keys, dropped: read.dropped_keys, stored: read.stored_after });
  ok('with no migration step and no re-save, the very next read runs the chosen geometry and names its source as `settings`',
    read.chosen.method === 'range' && read.chosen.requested === 'range' && read.chosen.source === 'settings'
    && read.chosen.applied > 0 && read.chosen.engine.applied === read.chosen.applied
    && read.chosen.range_zones > 0 && read.chosen.range_zones <= read.chosen.applied,
    { method: read.chosen.method, source: read.chosen.source, applied: read.chosen.applied, range: read.chosen.range_zones });
  ok('the geometry really changed the drawing and not just the label: the range boxes differ from the pivot boxes on the same candles',
    JSON.stringify(read.chosen.boxes) !== JSON.stringify(read.unset.boxes),
    { pivot: read.unset.boxes.slice(0, 3), range: read.chosen.boxes.slice(0, 3) });
  ok('a value this app cannot plot is REFUSED on the way in \u2014 400 `zone_method_invalid` \u2014 and the stored row is left exactly as it was',
    read.bad.status === 400 && read.bad.code === 'zone_method_invalid' && /not a zone method this app can plot/.test(read.bad.error || '')
    && read.bad.left_the_row === true,
    { status: read.bad.status, code: read.bad.code, error: read.bad.error, left: read.bad.left_the_row });
  ok('and a value that reached the row anyway (written by something that is not this route) is REPORTED by the read, never silently defaulted: pivot runs, the request is carried, the sentence names the vocabulary',
    read.foreign.method === 'pivot' && read.foreign.requested === 'consolidation' && read.foreign.source === 'settings'
    && /is not a zone method this app can plot/.test(read.foreign.error || '') && /pivot, range/.test(read.foreign.error || '')
    && read.foreign.range_zones === 0,
    { method: read.foreign.method, requested: read.foreign.requested, error: read.foreign.error });
  ok('two reads in a row answer identically, and neither one rewrites the settings row or anything this milestone owns: the row the choice wrote survives both reads byte-for-byte',
    read.stability === true && read.settings_row_untouched_by_reads === true && read.edited_back === true
    && !read.read_write_set.includes('users') && !read.read_write_set.includes('strategies') && !read.read_write_set.includes('strategy_versions'),
    { touched: read.read_write_set, settings_row: read.settings_row_untouched_by_reads, stable: read.stability });
  ok('and the tables a read DOES touch are exactly the ones the released build touched on the same two reads \u2014 this milestone adds no write of its own',
    JSON.stringify(read.read_write_set) === JSON.stringify(parentReads.read_write_set),
    { delivered: read.read_write_set, parent: parentReads.read_write_set });
  ok('the vocabulary and the closed source list travel with the module itself: `pivot`/`range`, and `request`/`settings`/`unspecified`/`default`',
    JSON.stringify(read.vocab) === '["pivot","range"]' && JSON.stringify(read.sources) === '["request","settings","unspecified","default"]',
    { vocab: read.vocab, sources: read.sources });

    const parentAfter = run(PARENT, file, PARENT_AFTER);
  ok('a committed parent opening the file AFTER a choice was made has never heard of the key: it round-trips it in its own echo (it spreads what it found) and reads none of it',
    parentAfter.kept_key === true && parentAfter.timezone_echo === 'Europe/London' && parentAfter.stored.zone_method === 'range',
    { echo_keys: parentAfter.echo_keys, stored: parentAfter.stored });
  ok('and on that same file the parent still plots one geometry with nothing named: no `zone_method` on any zone, no range zone, and its own `zoneMethod` option is ignored',
    parentAfter.hasZoneMethodKey === false && parentAfter.zonesWithMethod === 0 && parentAfter.ignoredOptIdentical === true,
    { keys: parentAfter.hasZoneMethodKey, range: parentAfter.zonesWithMethod, identical: parentAfter.ignoredOptIdentical });
  ok('the schema the parent leaves behind is the schema the delivered tree created \u2014 this milestone added no table, index or trigger, so there is nothing to migrate',
    JSON.stringify(parentAfter.look.objects) === JSON.stringify(parentWrite.before.objects),
    parentAfter.look.objects.filter((o) => !parentWrite.before.objects.includes(o)));
});
