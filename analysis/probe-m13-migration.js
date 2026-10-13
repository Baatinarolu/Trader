'use strict';
/**
 * M13/M65 migration probe: this milestone adds NO schema object of any kind — the tickets, the
 * artifacts and the periods they belong to are all derived or already stored — and it reads a
 * database the committed 67f2ed2 M112 release created and wrote without changing a byte of it.
 *
 * The strong claim is negative, so it is measured in both trees' OWN code: each tree is asked for
 * its `sqlite_master` and its per-table digests on the same fixture and the same file, and the
 * artifact row is one the PARENT's own review module reads back as a completed review before the
 * delivered tree is allowed to interpret it.
 */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const H = require('./m13-test-support'), { ok } = H;
const APP = H.APP, PARENT = process.env.TJ_PARENT || '/tmp/m13-parent/app';
const file = path.join(os.tmpdir(), `m13-migration-${process.pid}.db`), fileApp = file + '.app';

const inspectFn = `
const inspect=async()=>{const objects=await D.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),digests={},crypto=require('crypto');
for(const {name,sql} of objects.filter(o=>o.sql&&o.sql.startsWith('CREATE TABLE'))){try{digests[name]=crypto.createHash('sha256').update(JSON.stringify(await D.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all())).digest('hex').slice(0,32);}catch{digests[name]='unreadable';}}
return {objects:objects.map(o=>o.type+':'+o.name+':'+o.sql),digests};};`;

/* Every clock-defaulted column is PINNED in the fixture (`datetime('now')` defaults would otherwise differ
 * by a second between the two child runs and turn the byte-identical claim into a race). */
/** The fixture, identical in both trees: three closed trades with exact clocks and ONE saved weekly
 * artifact, written with the same columns and the same `human_review` source `save()` writes. */
const SEED = `const u=await D.db.prepare("INSERT INTO users (email,name,password_hash,created_at) VALUES (?,?,?,datetime('2026-10-13 08:00:00'))").run('m13@test.local','M13 trader','x');
const uid=Number(u.lastInsertRowid);await D.db.prepare("INSERT INTO accounts (user_id,name,starting_balance,created_at) VALUES (?,?,?,datetime('2026-10-13 08:00:00'))").run(uid,'M13 desk',10000);
const acc=(await D.db.prepare('SELECT id FROM accounts WHERE user_id=?').get(uid)).id;
const trade=D.db.prepare("INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,setup_grade,net_pnl,r_multiple,risk_amount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('2026-10-13 08:00:00'),datetime('2026-10-13 08:00:00'))");
await trade.run(uid,acc,'M13A','long','closed','2026-10-05T08:00:00.000Z','2026-10-05T09:00:00.000Z',100,102,99,104,1,0,'A',120,2,60);
await trade.run(uid,acc,'M13B','short','closed','2026-10-07T08:00:00.000Z','2026-10-07T09:00:00.000Z',100,99,101,97,1,0.5,'B',-60,-1,60);
await trade.run(uid,acc,'M13C','long','closed','2026-09-30T08:00:00.000Z','2026-09-30T09:00:00.000Z',100,101,99,103,1,0,'B',30,1,30);
const Q=require(path.join(APP,'src/period-reviews')),range=Q.canonical('week','2026-10-05'),metrics={financial:{basis:'seeded',closed_trades:2,known_net_subtotal:60},period:range,policy:{period_finished:true}};
const r=await D.db.prepare('INSERT INTO period_reviews (user_id,account_id,account_key,period_kind,period_start,period_end,version,template_version,status,answers_json,focus,followup_json,metrics_json,context_hash,source,recorded_at,amendment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
 .run(uid,acc,acc,'week',range.start,range.end,1,Q.VERSION,'completed',JSON.stringify({worked_and_why:'Declared honest answer'}),'Declared parent focus',null,JSON.stringify(metrics),'a'.repeat(64),'human_review','2026-10-13T09:00:00.000Z',null);
const out={seeded:{users:(await D.db.prepare('SELECT COUNT(*) c FROM users').get()).c,trades:(await D.db.prepare('SELECT COUNT(*) c FROM trades').get()).c,artifacts:(await D.db.prepare('SELECT COUNT(*) c FROM period_reviews').get()).c},
 uid,acc,review_id:Number(r.lastInsertRowid),range,look:await inspect()};
console.log(JSON.stringify(out));`;

/** The PARENT's own code reading the artifact: it must agree it is a completed review, and its own
 * payload must have no weekly/quarterly series — that absence is what this milestone closes. */
const PARENT_READ = `const uid=(await D.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()).id,acc=(await D.db.prepare('SELECT id FROM accounts ORDER BY id LIMIT 1').get()).id;
const Q=require(path.join(APP,'src/period-reviews')),P=require(path.join(APP,'src/performance')),rows=await D.db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY id').all(uid),look=await inspect();
const view=await Q.read(uid,acc,'week','2026-10-05'),payload=P.fullAnalytics(rows.map(t=>P.decorate(t,'Africa/Lagos')),{startingBalance:10000});
console.log(JSON.stringify({latest:{status:view.latest.status,focus:view.latest.focus,recorded_at:view.latest.recorded_at,id:view.latest.id,sample_ready:view.preview.financial.closed_trades,net:view.preview.financial.known_net_subtotal},
 payload_keys:Object.keys(payload).filter(k=>/week|quarter|period/i.test(k)),look,list:await Q.list(uid,acc)}));`;

/** The DELIVERED tree reading the same file: the period, its bucket and the artifact record. */
const DELIVERED_READ = `const uid=(await D.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()).id,acc=(await D.db.prepare('SELECT id FROM accounts ORDER BY id LIMIT 1').get()).id;
const P=require(path.join(APP,'src/performance')),Q=require(path.join(APP,'src/period-reviews')),Pe=require(path.join(APP,'src/periods'));
const rows=await D.db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY id').all(uid),before=await inspect();
const payload=P.fullAnalytics(rows.map(t=>P.decorate(t,'Africa/Lagos')),{startingBalance:10000});
const cov=await Q.coverage(uid,{accountId:acc,week:payload.weekly,quarter:payload.quarterly}),after=await inspect();
console.log(JSON.stringify({state:cov.state,ruler:Pe.VERSION,weekly:Object.fromEntries(Object.entries(payload.weekly).map(([k,v])=>[k,[v.trades,v.pnl,v.wins,v.losses]])),quarterly:Object.keys(payload.quarterly),
 week:(cov.kinds.week.periods.find(p=>p.start==='2026-10-05')||{}),not_recorded:cov.kinds.week.not_recorded,open:cov.kinds.week.open_periods,limits:cov.limits,before,after}));`;

const run = (app, db, code) => {
  const out = cp.spawnSync(process.execPath, ['-e', `const path=require('path'),APP=${JSON.stringify(app)},RealDate=Date,NOW=Date.UTC(2026,9,13,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';\nconst D=require(path.join(APP,'src/db'));\n${inspectFn}\n(async()=>{await D.ready;${code}})().catch(e=>{console.error(e.stack);process.exitCode=1;});`],
    { env: { ...process.env, TRADEJOURNAL_DB: db, NODE_OPTIONS: '', TURSO_DATABASE_URL: '', LIBSQL_URL: '', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8', timeout: 60000 });
  if (out.status !== 0) throw new Error('child ' + out.status + ': ' + out.stderr + '\n' + out.stdout);
  return JSON.parse(out.stdout);
};
const differing = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);

H.finish('M13/M65 migration: no schema object added, and the parent\u2019s own file is read untouched', async () => {
  const P0 = H.mod('src/periods');
  if (!P0 || P0.VERSION !== H.M13_VERSION) return H.ok('this tree ships the M13/M65 calendar ruler (the committed parent does not, and that absence is this probe\u2019s control)', false);
  ok('the parent tree IS the committed 67f2ed2 M112 release: it HAS the review artifacts of M99/M101 and no period ruler of its own',
    fs.existsSync(path.join(PARENT, 'src/period-reviews.js')) && !fs.existsSync(path.join(PARENT, 'src/periods.js')) && !/weeklySeries/.test(fs.readFileSync(path.join(PARENT, 'src/performance.js'), 'utf8')),
    { parent: fs.existsSync(PARENT) });
  for (const f of [file, fileApp]) { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch { } } }
  const parentSeeded = run(PARENT, file, SEED);
  const deliveredSeeded = run(APP, fileApp, SEED);
  ok('the delivered tree creates exactly the parent\u2019s schema: every table, index and trigger is byte-identical DDL, so this milestone adds no schema object of any kind',
    JSON.stringify(deliveredSeeded.look.objects) === JSON.stringify(parentSeeded.look.objects),
    { parent: parentSeeded.look.objects.length, delivered: deliveredSeeded.look.objects.length, extra: deliveredSeeded.look.objects.filter((o) => !parentSeeded.look.objects.includes(o)) });
  ok('and on the same fixture every table is byte-identical, the review table included — the periods and the coverage store nothing new',
    differing(deliveredSeeded.look.digests, parentSeeded.look.digests).length === 0 && !!deliveredSeeded.look.digests.period_reviews,
    differing(deliveredSeeded.look.digests, parentSeeded.look.digests));
  ok('the review table the coverage reads has exactly the columns the parent declared, so a period cannot be addressed by a column this milestone invented',
    JSON.stringify(parentSeeded.look.objects.filter((o) => /^table:period_reviews:/.test(o)).length) === '1' && /period_kind TEXT/.test(parentSeeded.look.objects.find((o) => /^table:period_reviews:/.test(o))) && /period_start TEXT/.test(parentSeeded.look.objects.find((o) => /^table:period_reviews:/.test(o))));

  const parentRead = run(PARENT, file, PARENT_READ);
  ok('the PARENT\u2019s own code reads the seeded artifact as a completed review, so the delivered tree is interpreting a legal row rather than a fixture shape',
    parentRead.latest.status === 'completed' && parentRead.latest.focus === 'Declared parent focus' && parentRead.latest.recorded_at === '2026-10-13T09:00:00.000Z' && parentRead.latest.id === parentSeeded.review_id && parentRead.list.reviews.length === 1,
    parentRead.latest);
  ok('and the parent\u2019s own payload has NO period series and no period record — the absence this milestone closes, measured in the parent\u2019s code rather than asserted about it',
    JSON.stringify(parentRead.payload_keys) === '[]', parentRead.payload_keys);

  const deliveredRead = run(APP, file, DELIVERED_READ);
  ok('the delivered tree reads the parent\u2019s OWN file and reports the same period on the review calendar: the week of 2026-10-05',
    deliveredRead.state === 'available' && deliveredRead.ruler === 'periods-v1' && !!deliveredRead.weekly['2026-10-05'] && deliveredRead.weekly['2026-10-05'][0] === 2 && deliveredRead.weekly['2026-10-05'][1] === 60,
    deliveredRead.weekly);
  ok('the weekly and quarterly buckets are derived from the closes the parent wrote, and the quarter the closes fall in is named',
    JSON.stringify(Object.keys(deliveredRead.weekly)) === '["2026-09-28","2026-10-05"]' && JSON.stringify(deliveredRead.quarterly) === '["2026-Q3","2026-Q4"]', [Object.keys(deliveredRead.weekly), deliveredRead.quarterly]);
  ok('the artifact the parent\u2019s own module wrote is joined to that period as `completed`, with its id and focus intact',
    deliveredRead.week.review_state === 'completed' && deliveredRead.week.review_id === parentSeeded.review_id && deliveredRead.week.review_focus === 'Declared parent focus' && deliveredRead.week.review_recorded_at === '2026-10-13T09:00:00.000Z',
    { state: deliveredRead.week.review_state, id: deliveredRead.week.review_id });
  ok('the periods the parent never reviewed are `not_recorded`, and the period still running is counted as open rather than skipped',
    deliveredRead.not_recorded === 10 && deliveredRead.open === 1, { not_recorded: deliveredRead.not_recorded, open: deliveredRead.open });
  ok('reading the periods on the parent\u2019s file changes NOTHING: every table\u2019s digest is identical before and after the read',
    differing(deliveredRead.after.digests, deliveredRead.before.digests).length === 0 && differing(deliveredRead.after.digests, parentSeeded.look.digests).length === 0,
    differing(deliveredRead.after.digests, deliveredRead.before.digests));
  ok('the record\u2019s limits are the ones a review needs: read-only, zero writes, no grade/cap/permission/plan-change influence, nothing causal',
    deliveredRead.limits.read_only === true && deliveredRead.limits.writes === 0 && deliveredRead.limits.grades_influence === false && deliveredRead.limits.caps_influence === false && deliveredRead.limits.permission_influence === false && deliveredRead.limits.plan_change_permission === false && deliveredRead.limits.guardrail_decisions_influence === false && deliveredRead.limits.causal === false);

  const back = run(PARENT, file, PARENT_READ);
  ok('the parent\u2019s own code still opens the file afterwards and sees exactly the artifact it left: one review, completed, with no row this milestone added',
    back.latest.id === parentRead.latest.id && back.latest.status === 'completed' && back.list.reviews.length === 1 && differing(back.look.digests, parentSeeded.look.digests).length === 0,
    differing(back.look.digests, parentSeeded.look.digests));
  for (const f of [file, fileApp]) { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch { } } }
});
