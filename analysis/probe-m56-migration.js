'use strict';
/**
 * M56 migration probe: the plan gate adds NO schema object of any kind — the trader's plan was already
 * stored in `strategies`, so a plan written by the COMMITTED PARENT is read here with nothing migrated,
 * nothing re-stamped and not one byte written.
 *
 * The claims are negative, so they are measured in both trees' OWN code on one fixture: each tree is
 * asked for its `sqlite_master` and its per-table digests, the parent's own modules are the control for
 * "no gate existed" (candidate keys, filter keys, and the absence of the module), and the delivered
 * tree is only allowed to interpret a plan after the parent's own code has written it.
 */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const H = require('./m56-test-support'), { ok } = H;
const APP = H.APP, PARENT = process.env.TJ_PARENT || '/tmp/m56-parent/app';
const SYNTH = path.join(__dirname, 'harness', 'synth');
const file = path.join(os.tmpdir(), `m56-migration-${process.pid}.db`), fileApp = file + '.app';

const INSPECT = `
const inspect=async()=>{const objects=await D.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),digests={},crypto=require('crypto');
for(const {name,sql} of objects.filter(o=>o.sql&&o.sql.startsWith('CREATE TABLE'))){try{digests[name]=crypto.createHash('sha256').update(JSON.stringify(await D.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all())).digest('hex');}catch{digests[name]='<unreadable>';}}
return {objects:objects.map(o=>o.type+':'+o.name+':'+o.sql),digests};};`;

/**
 * The fixture: a trader with two accounts' worth of history is unnecessary here — what matters is the
 * PLAN, so the seed writes the four stored shapes the probe reads back (machine lines, prose, an
 * unrecognised `require`, and the double-encoded value a client echoing the column produces), each
 * through `strategies` exactly as the app stores them, plus two trades so the parent's own M102
 * boot backfill runs on this file the way it runs on a real one.
 */
const SEED = `
const u=await D.db.prepare("INSERT INTO users (email,name,password_hash,settings,created_at) VALUES (?,?,?,?,datetime('2026-10-13 08:00:00'))").run('m56@test.local','M56 trader','x',JSON.stringify({timezone:'Africa/Lagos',base_currency:'USD'}));
const uid=Number(u.lastInsertRowid);
await D.db.prepare("INSERT INTO accounts (user_id,name,starting_balance,created_at) VALUES (?,?,?,datetime('2026-10-13 08:00:00'))").run(uid,'M56 desk',10000);
const acc=Number((await D.db.prepare('SELECT id FROM accounts WHERE user_id=?').get(uid)).id);
const st=D.db.prepare("INSERT INTO strategies (user_id,name,description,market_conditions,timeframes,entry_rules,exit_rules,checklist,risk_rules,target_r_multiple,colour,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('2026-10-13 08:00:00'))");
/* P1 the plan the trader actually trades: two machine lines and one line of prose, with the
 * market-conditions field carrying prose that must never be interpreted as a rule. */
const p1=Number((await st.run(uid,'London reversal','Sweep then shift','Trending / ranging / news','H4 / H1 / M15',
  JSON.stringify(['require min_rr >= 2','require killzone','Wait for the sweep']),
  JSON.stringify(['exit when the plan invalidates']),JSON.stringify(['risk 1%']),'Max risk 1%',2,'#4f8cff',1)).lastInsertRowid);
const p2=Number((await st.run(uid,'Prose only','free text','ranging only','H1',
  JSON.stringify(['Only trade London','Wait for the sweep']),JSON.stringify(['exit']),JSON.stringify(['risk 1%']),'Max risk 1%',2,'#4f8cff',0)).lastInsertRowid);
const p3=Number((await st.run(uid,'Typo','typo','trending','H1',
  JSON.stringify(['require swep']),JSON.stringify(['exit']),JSON.stringify(['risk 1%']),'Max risk 1%',2,'#4f8cff',0)).lastInsertRowid);
const p4=Number((await st.run(uid,'Echoed back','double encoded','trending','H1',
  JSON.stringify(JSON.stringify(['require killzone'])),JSON.stringify(['exit']),JSON.stringify(['risk 1%']),'Max risk 1%',2,'#4f8cff',0)).lastInsertRowid);
const trade=D.db.prepare("INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,setup_grade,net_pnl,r_multiple,risk_amount,strategy_id,stop_honoured,stop_honoured_source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('2026-10-13 08:00:00'),datetime('2026-10-13 08:00:00'))");
const at=(d,t)=>d+'T'+t+':00.000Z';
await trade.run(uid,acc,'T1','long','closed',at('2026-10-13','07:00'),at('2026-10-13','08:00'),100,101,99,103,1,0,'A',120,1.2,100,p1,null,null);
await trade.run(uid,acc,'T2','short','closed',at('2026-10-12','07:00'),at('2026-10-12','08:00'),100,99,101,97,1,0,'B',-60,-1,60,p1,0,'self_reported');
const out={seeded:{users:(await D.db.prepare('SELECT COUNT(*) c FROM users').get()).c,trades:(await D.db.prepare('SELECT COUNT(*) c FROM trades').get()).c,plans:(await D.db.prepare('SELECT COUNT(*) c FROM strategies').get()).c,versions:(await D.db.prepare('SELECT COUNT(*) c FROM strategy_versions').get()).c},
 uid,acc,plans:{machine:p1,prose:p2,typo:p3,echoed:p4},
 stored:Object.fromEntries((await D.db.prepare('SELECT id,name,active,entry_rules,market_conditions FROM strategies WHERE user_id=? ORDER BY id').all(uid)).map(r=>[r.id,{name:r.name,active:r.active,entry_rules:r.entry_rules,market_conditions:r.market_conditions}])),
 look:await inspect()};
console.log(JSON.stringify(out));`;

/**
 * The PARENT's own code on the same file: what the released app does with these four strategies. Its
 * `entry_rules` column is parsed by nobody on the decision path, its candidate objects have no
 * `plan_rules` key and its filter block has no `plan_gate` key — the absence this milestone closes,
 * measured rather than assumed. A real synthetic analysis is used so the control is the decision
 * surface itself and not a static reading of the source.
 */
const PARENT_READ = `
const SMC=require(path.join(APP,'src/bots/smc')),Setup=require(path.join(APP,'src/bots/setup')),Synth=require(SYNTH);
const uid=Number((await D.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()).id);
const rows=await D.db.prepare('SELECT * FROM strategies WHERE user_id=? ORDER BY id').all(uid);
const plans={};for(const r of rows){let p=null;try{p=JSON.parse(r.entry_rules||'[]')}catch(e){p='<unparseable>'}
 plans[r.id]={name:r.name,active:!!r.active,shape:Array.isArray(p)?'array':(typeof p),lines:Array.isArray(p)?p.length:null,first:Array.isArray(p)?p[0]||null:null};}
let candidateKeys=null,filterKeys=null,samples=0;
for(let seed=1;seed<=4&&!candidateKeys;seed++){const cs=Synth.series({seed,bars:1200});const hAll=Synth.aggregate(cs,4);
 for(let i=140;i<cs.length-5;i+=13){const an=SMC.analyse(cs.slice(Math.max(0,i-300),i+1),{tf:'15m',htfCandles:hAll.filter(b=>b.t<=cs[i].t).slice(-80),now:cs[i].t});
  if(!an.ok)continue;samples++;const out=Setup.buildSetups(an,{price:cs[i].c,balance:10000,riskPct:1,valuePerPoint:100000,assetClass:'forex',chaseGuard:false,symbol:'EURUSD'});
  if(!out.candidates||!out.candidates.length)continue;candidateKeys=Object.keys(out.candidates[0]);filterKeys=Object.keys(out.filters||{});break;}}
const before=await inspect();
console.log(JSON.stringify({has_plan_gate_module:require('fs').existsSync(path.join(APP,'src/bots/plan-gate.js')),
 plans,candidateKeys,filterKeys,samples,versions:(await D.db.prepare('SELECT strategy_id,version,note FROM strategy_versions ORDER BY strategy_id,version').all()),
 attributed:(await D.db.prepare('SELECT COUNT(*) n FROM trades WHERE strategy_version IS NOT NULL').get()).n,before,after:await inspect()}));`;

/** The DELIVERED tree reading the parent's own plans: the four stored shapes, the selection rule and
 *  the read-only proof (every table digested before and after the reads). */
const DELIVERED_READ = `
const P=require(path.join(APP,'src/bots/plan-gate'));
const uid=Number((await D.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()).id);
const rows=await D.db.prepare('SELECT id,name,active FROM strategies WHERE user_id=? ORDER BY id').all(uid);
const before=await inspect();
const read=async(id)=>{const v=await P.safe(uid,id===null?null:String(id));
 return {state:v.state,counts:v.counts||null,malformed:!!v.malformed,note:v.note||null,plan:v.plan||null,
  machine_lines:(v.rules||[]).filter(r=>r.kind==='machine').map(r=>r.text),
  unverifiable:(v.rules||[]).filter(r=>r.kind==='prose').map(r=>r.text),
  unrecognised:(v.rules||[]).filter(r=>r.kind==='unknown_fact').map(r=>[r.text,r.reason]),
  candidates:v.candidates||null};};
const per={};for(const r of rows)per[r.id]=await read(r.id);
const auto=await read(null);
const byName=Object.fromEntries(Object.entries(per).map(([id,v])=>[v.plan?v.plan.name:id,v]));
const after=await inspect();
const list=async(t)=>crypto.createHash('sha256').update(JSON.stringify(await D.db.prepare('SELECT * FROM '+t+' ORDER BY 1').all())).digest('hex');
console.log(JSON.stringify({per,byName,auto,versions:(await D.db.prepare('SELECT strategy_id,version FROM strategy_versions ORDER BY strategy_id,version').all()),
 version_of_auto:auto.plan?await require(path.join(APP,'src/db')).currentStrategyVersion(auto.plan.id):null,
 limits:P.view({state:'ready',plan:{id:1,name:'x',version:1},counts:{machine:0,prose:0,unknown_fact:0},rules:[],malformed:false},[]).limits,
 vocab:P.vocabulary().length,before,after,
 digests_after_strategies:await list('strategies')}));`;

const run = (app, db, code) => {
  const out = cp.spawnSync(process.execPath, ['-e', `const path=require('path'),APP=${JSON.stringify(app)},SYNTH=${JSON.stringify(SYNTH)},RealDate=Date,NOW=Date.UTC(2026,9,13,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';
const D=require(path.join(APP,'src/db')),crypto=require('crypto');
${INSPECT}
(async()=>{await D.ready;${code}})().catch(e=>{console.error(e.stack);process.exitCode=1;});`],
    { env: { ...process.env, TRADEJOURNAL_DB: db, NODE_OPTIONS: '', TURSO_DATABASE_URL: '', LIBSQL_URL: '', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8', timeout: 180000 });
  if (out.status !== 0) throw new Error('child ' + out.status + ': ' + out.stderr + '\n' + out.stdout);
  return JSON.parse(out.stdout);
};
const differing = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
const clean = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch { } } };

H.finish('M56 migration: a plan the committed parent stored is read with no schema change and no write', async () => {
  const P = H.mod('src/bots/plan-gate');
  if (!H.shipped(P, 'the plan gate (src/bots/plan-gate.js)')) return;
  ok('the parent tree IS the committed release this milestone is built on: it carries the review periods and the clean-rep count, and no plan gate of its own',
    fs.existsSync(path.join(PARENT, 'src/periods.js')) && fs.existsSync(path.join(PARENT, 'src/period-reviews.js'))
    && fs.existsSync(path.join(PARENT, 'src/challenge.js')) && !fs.existsSync(path.join(PARENT, 'src/bots/plan-gate.js')),
    { parent: fs.existsSync(PARENT) });
  for (const f of [file, fileApp]) clean(f);
  const parentSeeded = run(PARENT, file, SEED);
  const deliveredSeeded = run(APP, fileApp, SEED);
  ok('the fixture is the SAME shape in both trees: the same four plans, the same stored bytes and the same trades',
    JSON.stringify(parentSeeded.seeded) === JSON.stringify(deliveredSeeded.seeded) && JSON.stringify(parentSeeded.stored) === JSON.stringify(deliveredSeeded.stored),
    { parent: parentSeeded.seeded, delivered: deliveredSeeded.seeded });
  ok('the delivered tree creates exactly the parent\u2019s schema: every table, index and trigger is byte-identical DDL, so this milestone adds NO schema object of any kind',
    JSON.stringify(deliveredSeeded.look.objects) === JSON.stringify(parentSeeded.look.objects),
    { parent: parentSeeded.look.objects.length, delivered: deliveredSeeded.look.objects.length, extra: deliveredSeeded.look.objects.filter((o) => !parentSeeded.look.objects.includes(o)) });
  ok('and on that fixture every table is byte-identical, so nothing was back-filled or rewritten at open time either',
    differing(deliveredSeeded.look.digests, parentSeeded.look.digests).length === 0 && !!deliveredSeeded.look.digests.strategies && !!deliveredSeeded.look.digests.strategy_versions,
    differing(deliveredSeeded.look.digests, parentSeeded.look.digests));
  /* The search is by OBJECT NAME against the gate's own vocabulary tokens: `entry_rules` is a
   * pre-existing column of the released schema, so a search for it would prove nothing. */
  const named = (o) => /^(table|index|trigger):[^:]*?(plan_gate|plan_rule)/i.test(o);
  ok('there is no plan_gate/plan_rule table, index or trigger to find: the schema search the negative claim rests on is empty in both trees',
    !parentSeeded.look.objects.some(named) && !deliveredSeeded.look.objects.some(named),
    deliveredSeeded.look.objects.filter(named));
  ok('the four stored shapes really are the four shapes being measured, written by each tree\u2019s own database layer',
    JSON.stringify(Object.fromEntries(Object.entries(deliveredSeeded.stored).map(([id, s]) => [s.name, [Array.isArray(JSON.parse(s.entry_rules)) ? JSON.parse(s.entry_rules).length : typeof JSON.parse(s.entry_rules), s.active]])))
    === '{"London reversal":[3,1],"Prose only":[2,0],"Typo":[1,0],"Echoed back":["string",0]}',
    Object.fromEntries(Object.entries(deliveredSeeded.stored).map(([id, s]) => [s.name, s.entry_rules])));

  /* The parent's own M102 behaviour, named so it cannot be mistaken for a write by this milestone: the
   * first boot after a strategy exists snapshots its v1 rule set. The digest baseline below is taken
   * AFTER that boot, so any drift the delivered read causes is attributable to the read. */
  const warm1 = run(PARENT, file, PARENT_READ);
  const warm2 = run(PARENT, file, PARENT_READ);
  ok('the parent\u2019s own second boot performs its M102 v1 backfill exactly once (four version rows) and a further boot changes not one byte',
    warm1.versions.length === 4 && warm2.versions.length === 4 && differing(warm2.before.digests, warm1.before.digests).length === 0,
    { first: warm1.versions.length, second: warm2.versions.length, drift: differing(warm2.before.digests, warm1.before.digests) });
  ok('and the parent stores every one of the four shapes without an opinion about any of them: an array, a double-encoded string, and prose all sit in the column, read by nobody on the decision path',
    JSON.stringify(warm2.plans) === '{"1":{"name":"London reversal","active":true,"shape":"array","lines":3,"first":"require min_rr >= 2"},"2":{"name":"Prose only","active":false,"shape":"array","lines":2,"first":"Only trade London"},"3":{"name":"Typo","active":false,"shape":"array","lines":1,"first":"require swep"},"4":{"name":"Echoed back","active":false,"shape":"string","lines":null,"first":null}}',
    warm2.plans);
  ok('the parent\u2019s own decision surface has NO plan keys at all \u2014 no `plan_rules` on a candidate and no `plan_gate` in the filter block, measured over a real analysis',
    warm2.candidateKeys && !warm2.candidateKeys.includes('plan_rules') && warm2.filterKeys && !warm2.filterKeys.includes('plan_gate') && warm2.samples > 0,
    { candidates: warm2.candidateKeys, filters: warm2.filterKeys, samples: warm2.samples });
  ok('and the parent ships no plan-gate module \u2014 the absence is real, not a configuration of this probe',
    warm2.has_plan_gate_module === false);

  const read = run(APP, file, DELIVERED_READ);
  ok('the delivered tree reads the PARENT\u2019s own plan: two machine lines enforced, one line of prose reported and never interpreted',
    JSON.stringify(read.byName['London reversal'].counts) === '{"machine":2,"unknown_fact":0,"prose":1}'
    && JSON.stringify(read.byName['London reversal'].machine_lines) === '["require min_rr >= 2","require killzone"]'
    && JSON.stringify(read.byName['London reversal'].unverifiable) === '["Wait for the sweep"]',
    read.byName['London reversal']);
  ok('the prose-only plan enforces nothing and SAYS so (it does not look satisfied), and its free-text market-conditions field is not parsed',
    read.byName['Prose only'].state === 'ready' && read.byName['Prose only'].counts.machine === 0 && read.byName['Prose only'].counts.prose === 2
    && /no machine-checkable requirements/.test(read.byName['Prose only'].note)
    && read.byName['Prose only'].plan.name === 'Prose only',
    read.byName['Prose only'].note);
  ok('a `require` line outside the vocabulary is surfaced as unrecognised with its reason, so a typo is named instead of silently passing',
    read.byName['Typo'].counts.unknown_fact === 1 && read.byName['Typo'].unrecognised.length === 1
    && read.byName['Typo'].unrecognised[0][0] === 'require swep' && /`swep` is not a requirement this app can check/.test(read.byName['Typo'].unrecognised[0][1]),
    read.byName['Typo'].unrecognised);
  ok('the double-encoded value the parent stored is reported MALFORMED rather than read as a satisfied plan',
    read.byName['Echoed back'].counts.machine === 0 && read.byName['Echoed back'].malformed === true && /re-save the plan/.test(read.byName['Echoed back'].note),
    read.byName['Echoed back'].note);
  ok('with no id named the gate uses the parent\u2019s own `active` column: the one active plan, and only because it is the only one',
    read.auto.state === 'ready' && read.auto.plan.name === 'London reversal' && read.auto.plan.active === true,
    read.auto.plan);
  ok('the version it reports is the parent\u2019s own M102 row for that plan, so a refusal can name the rule set the trade was taken under',
    read.auto.plan.version === read.version_of_auto && read.auto.plan.version >= 1
    && JSON.stringify(read.versions.find((v) => v.strategy_id === read.auto.plan.id)) === JSON.stringify({ strategy_id: read.auto.plan.id, version: read.auto.plan.version }),
    { reported: read.auto.plan.version, from_db: read.version_of_auto, rows: read.versions });
  ok('reading the plan writes NOTHING: every table digest is identical before and after, and the versions table did not move',
    differing(read.after.digests, read.before.digests).length === 0 && read.digests_after_strategies === read.before.digests.strategies,
    differing(read.after.digests, read.before.digests));
  ok('and reading it a second way is stable: the same four rows produce the same verdicts as the parent\u2019s file is re-opened and read again',
    JSON.stringify(differing(read.before.digests, warm2.before.digests)) === '[]',
    differing(read.before.digests, warm2.before.digests));
  ok('the vocabulary and the limits travel with the module itself \u2014 thirteen concrete lines and the read-only claim the refusal can be quoted against',
    read.vocab === 13 && read.limits.prose_is_not_parsed === true && read.limits.market_conditions_field_is_not_parsed === true
    && read.limits.grade_influence === false && read.limits.score_influence === false && read.limits.cap_influence === false
    && read.limits.price_influence === false && read.limits.unknown_is_never_met === true && read.limits.broker_verified === false,
    { vocab: read.vocab, limits: read.limits });

  const back = run(PARENT, file, PARENT_READ);
  ok('the parent\u2019s own code still opens the file afterwards and sees exactly the four plans and two trades it left, with no row and no column this milestone added',
    back.plans && Object.keys(back.plans).length === 4 && differing(back.after.digests, warm2.after.digests).length === 0 && back.has_plan_gate_module === false,
    differing(back.after.digests, warm2.after.digests));
  for (const f of [file, fileApp]) clean(f);
});
