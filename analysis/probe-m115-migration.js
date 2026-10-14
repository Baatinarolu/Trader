'use strict';
/**
 * M115 migration probe: the clean-rep count adds NO schema object of any kind — its two declarations
 * live in the settings object the app has always stored — and it reads a database the committed
 * parent created and wrote without changing a byte of it.
 *
 * The strong claims are negative, so they are measured in both trees' OWN code: each tree is asked
 * for its `sqlite_master` and its per-table digests on the same fixture, each tree's OWN
 * `journaling.fingerprint` writes the acknowledgements, and the delivered tree is only allowed to
 * interpret a rep after the parent's own modules have read the same rows.
 */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const H = require('./m115-test-support'), { ok } = H;
const APP = H.APP, PARENT = process.env.TJ_PARENT || '/tmp/m115-parent/app';
const file = path.join(os.tmpdir(), `m115-migration-${process.pid}.db`), fileApp = file + '.app';

const INSPECT = `
const inspect=async()=>{const objects=await D.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),digests={},crypto=require('crypto');
for(const {name,sql} of objects.filter(o=>o.sql&&o.sql.startsWith('CREATE TABLE'))){try{digests[name]=crypto.createHash('sha256').update(JSON.stringify(await D.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all())).digest('hex');}catch{digests[name]='<unreadable>';}}
return {objects:objects.map(o=>o.type+':'+o.name+':'+o.sql),digests};};`;

/**
 * The fixture, written with the columns the app itself writes and PINNED clocks (a `datetime('now')`
 * default would otherwise differ by a second between the two child runs and turn the byte-identical
 * claim into a race). The settings row is seeded as JSON — the object the app has always stored — and
 * the two declarations simply sit in it, which is the whole of this milestone's storage story.
 */
const SEED = `
const J=require(path.join(APP,'src/journaling'));
const u=await D.db.prepare("INSERT INTO users (email,name,password_hash,settings,created_at) VALUES (?,?,?,?,datetime('2026-10-13 08:00:00'))").run('m115@test.local','M115 trader','x',JSON.stringify({timezone:'Africa/Lagos',base_currency:'USD',challenge_start:'2026-10-08',challenge_target:3}));
const uid=Number(u.lastInsertRowid);
await D.db.prepare("INSERT INTO accounts (user_id,name,starting_balance,created_at) VALUES (?,?,?,datetime('2026-10-13 08:00:00'))").run(uid,'M115 desk',10000);
const acc=(await D.db.prepare('SELECT id FROM accounts WHERE user_id=?').get(uid)).id;
const st=await D.db.prepare("INSERT INTO strategies (user_id,name,colour,active,created_at) VALUES (?,?,?,1,datetime('2026-10-13 08:00:00'))").run(uid,'M115 plan','#5b8def');
const plan=Number(st.lastInsertRowid);
const trade=D.db.prepare("INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,setup_grade,net_pnl,r_multiple,risk_amount,strategy_id,stop_honoured,stop_honoured_source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('2026-10-13 08:00:00'),datetime('2026-10-13 08:00:00'))");
const check=D.db.prepare('INSERT INTO rule_checks (trade_id,label,passed) VALUES (?,?,?)');
const at=(d,t)=>d+'T'+t+':00.000Z';   // '2026-10-13','07:00' → the instant, not a doubled clock
/* T1 a clean rep; T2 unlinked; T3 a FAILED check; T4 never acknowledged; T5 before the start day;
 * T6 a recorded decision not to honour the stop. */
const ids={};
ids.T1=Number((await trade.run(uid,acc,'T1','long','closed',at('2026-10-13','07:00'),at('2026-10-13','08:00'),100,101,99,103,1,0,'A',120,1.2,100,plan,null,null)).lastInsertRowid);
ids.T2=Number((await trade.run(uid,acc,'T2','long','closed',at('2026-10-12','07:00'),at('2026-10-12','08:00'),100,101,99,103,1,0,'A',100,1,100,null,null,null)).lastInsertRowid);
ids.T3=Number((await trade.run(uid,acc,'T3','long','closed',at('2026-10-11','07:00'),at('2026-10-11','08:00'),100,99,101,97,1,0,'B',-60,-1,60,plan,null,null)).lastInsertRowid);
ids.T4=Number((await trade.run(uid,acc,'T4','long','closed',at('2026-10-10','07:00'),at('2026-10-10','08:00'),100,101,99,103,1,0,'A',80,1,80,plan,null,null)).lastInsertRowid);
ids.T5=Number((await trade.run(uid,acc,'T5','long','closed',at('2026-09-01','07:00'),at('2026-09-01','08:00'),100,101,99,103,1,0,'A',50,1,50,plan,null,null)).lastInsertRowid);
ids.T6=Number((await trade.run(uid,acc,'T6','short','closed',at('2026-10-09','07:00'),at('2026-10-09','08:00'),100,102,101,97,1,0,'C',-30,-0.5,60,plan,0,'self_reported')).lastInsertRowid);
for(const [t,label,passed] of [[ids.T1,'risk 1%',1],[ids.T1,'no news window',1],[ids.T2,'risk 1%',1],[ids.T3,'risk 1%',1],[ids.T3,'no revenge entry',0],[ids.T4,'risk 1%',1],[ids.T5,'risk 1%',1],[ids.T6,'risk 1%',1]])
  await check.run(t,label,passed);
/* The acknowledgements are written with THIS tree's own fingerprint, so the parent's code and the
 * delivered tree must agree on what an acknowledged journal is before any rep can be counted. */
const hashes={},reviewed={};
/* T1..T5 plus T6: T6 isolates the STOP criterion, everything else about it being clean. */
for(const t of ['T1','T2','T3','T5','T6']){const id=ids[t],day=(await D.db.prepare('SELECT closed_at FROM trades WHERE id=?').get(id)).closed_at.slice(0,10);
  const row=await D.db.prepare('SELECT * FROM trades WHERE id=?').get(id);
  const fields={emotion_before:'calm',emotion_after:'flat',execution_notes:'What happened',lesson:'What I would change',mistakes:'',mistakes_none:1,journal_reviewed_at:day+'T09:30:00.000Z'};
  const next={...row,...fields},hash=J.fingerprint(next);
  await D.db.prepare('UPDATE trades SET emotion_before=?,emotion_after=?,execution_notes=?,lesson=?,mistakes=?,mistakes_none=?,journal_reviewed_at=?,journal_review_hash=? WHERE id=?')
    .run(fields.emotion_before,fields.emotion_after,fields.execution_notes,fields.lesson,fields.mistakes,fields.mistakes_none,fields.journal_reviewed_at,hash,id);
  hashes[t]=hash; reviewed[t]=fields.journal_reviewed_at;}
const out={seeded:{users:(await D.db.prepare('SELECT COUNT(*) c FROM users').get()).c,trades:(await D.db.prepare('SELECT COUNT(*) c FROM trades').get()).c,checks:(await D.db.prepare('SELECT COUNT(*) c FROM rule_checks').get()).c,plans:(await D.db.prepare('SELECT COUNT(*) c FROM strategies').get()).c},
 uids:uid,acc,plan,ids,hashes,reviewed,settings_keys:Object.keys(JSON.parse((await D.db.prepare('SELECT settings FROM users WHERE id=?').get(uid)).settings||'{}')),look:await inspect()};
console.log(JSON.stringify(out));`;

/** The PARENT's own code reading the fixture: its payload has no rep count, its journal module is
 *  the authority on the acknowledgement, and it has no challenge module at all. */
const PARENT_READ = `
const uid=(await D.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()).id,acc=(await D.db.prepare('SELECT id FROM accounts ORDER BY id LIMIT 1').get()).id;
const P=require(path.join(APP,'src/performance')),J=require(path.join(APP,'src/journaling')),E=require(path.join(APP,'src/execution-review'));
const rows=await D.db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY id').all(uid),before=await inspect();
const payload=P.fullAnalytics(rows.map(t=>P.decorate(t,'Africa/Lagos')),{startingBalance:10000});
const journals={};for(const r of rows)journals[r.symbol]={complete:J.info(r,Date.now()).complete,reviewed_at:J.info(r,Date.now()).reviewed_at,fingerprint:J.fingerprint(r)};
const exec={};for(const r of rows)exec[r.symbol]=E.outcome(r).state;
const settings=JSON.parse((await D.db.prepare('SELECT settings FROM users WHERE id=?').get(uid)).settings||'{}');
console.log(JSON.stringify({has_challenge_module:require('fs').existsSync(path.join(APP,'src/challenge.js')),challenge_keys:Object.keys(payload).filter(k=>/challenge|rep/i.test(k)),
 journals,exec,stop:rows.filter(r=>r.stop_honoured===0).map(r=>[r.symbol,r.stop_honoured_source]),settings_keys:Object.keys(settings),samples:rows.length,after:await inspect()}));`;

/** The DELIVERED tree on the PARENT's own file: the count, its per-criterion tallies, and nothing written. */
const DELIVERED_READ = `
const uid=(await D.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()).id,acc=(await D.db.prepare('SELECT id FROM accounts ORDER BY id LIMIT 1').get()).id;
const C=require(path.join(APP,'src/challenge')),J=require(path.join(APP,'src/journaling'));
const settings=JSON.parse((await D.db.prepare('SELECT settings FROM users WHERE id=?').get(uid)).settings||'{}');
const rows=await D.db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY id').all(uid);
const before=await inspect(),rep=await C.inspect(uid,{accountId:acc,settings,nowMs:Date.now()}),after=await inspect();
const fingerprints={};for(const r of rows)fingerprints[r.symbol]=J.fingerprint(r);
console.log(JSON.stringify({declarations:{start:C.startOf(settings).state,startValue:C.startOf(settings).value,target:C.targetOf(settings).value},
 state:rep.state,counted:rep.progress.counted,run:rep.progress.run,before_start:rep.window.before_start,trades:rep.window.trades_closed,by_criterion:rep.not_counted.by_criterion,unrecorded:rep.not_counted.unrecorded_checks,
 recent:rep.recent.map(r=>[r.symbol,r.counted,r.failed.join('|')]),broken_counts:Object.entries(rep.not_counted.by_criterion).filter(([k,v])=>!/^[a-z_]+$/.test(k)||v<0).length,
 limits:rep.limits,outcome_joined:rep.outcome_joined,fingerprints,before,after}));`;

const WARM = `
const out={look:await inspect(),versions:(await D.db.prepare('SELECT COUNT(*) n FROM strategy_versions').get()).n,attributed:(await D.db.prepare('SELECT COUNT(*) n FROM trades WHERE strategy_version=1').get()).n};
console.log(JSON.stringify(out));`;

const run = (app, db, code) => {
  const out = cp.spawnSync(process.execPath, ['-e', `const path=require('path'),APP=${JSON.stringify(app)},RealDate=Date,NOW=Date.UTC(2026,9,13,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';
const D=require(path.join(APP,'src/db'));
${INSPECT}
(async()=>{await D.ready;${code}})().catch(e=>{console.error(e.stack);process.exitCode=1;});`],
    { env: { ...process.env, TRADEJOURNAL_DB: db, NODE_OPTIONS: '', TURSO_DATABASE_URL: '', LIBSQL_URL: '', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8', timeout: 120000 });
  if (out.status !== 0) throw new Error('child ' + out.status + ': ' + out.stderr + '\n' + out.stdout);
  return JSON.parse(out.stdout);
};
const differing = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
const clean = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch { } } };

H.finish('M115 migration: no schema object added, and the parent\u2019s own file is read untouched', async () => {
  const C0 = H.mod('src/challenge');
  if (!H.shipped(C0, 'the clean-rep count (src/challenge.js)')) return;
  ok('the parent tree IS the committed M13 release: it has the review periods and no rep count of its own',
    fs.existsSync(path.join(PARENT, 'src/periods.js')) && fs.existsSync(path.join(PARENT, 'src/period-reviews.js')) && !fs.existsSync(path.join(PARENT, 'src/challenge.js')),
    { parent: fs.existsSync(PARENT) });
  for (const f of [file, fileApp]) clean(f);
  const parentSeeded = run(PARENT, file, SEED);
  const deliveredSeeded = run(APP, fileApp, SEED);
  ok('the fixture is the SAME shape in both trees: the same trades, the same recorded checklist rows, the same plan link and the same acknowledgements — written by each tree\u2019s own journal module',
    JSON.stringify(parentSeeded.seeded) === JSON.stringify(deliveredSeeded.seeded) && JSON.stringify(parentSeeded.hashes) === JSON.stringify(deliveredSeeded.hashes),
    { parent: parentSeeded.seeded, delivered: deliveredSeeded.seeded, hashes_agree: JSON.stringify(parentSeeded.hashes) === JSON.stringify(deliveredSeeded.hashes) });
  ok('the delivered tree creates exactly the parent\u2019s schema: every table, index and trigger is byte-identical DDL, so this milestone adds NO schema object of any kind',
    JSON.stringify(deliveredSeeded.look.objects) === JSON.stringify(parentSeeded.look.objects),
    { parent: parentSeeded.look.objects.length, delivered: deliveredSeeded.look.objects.length, extra: deliveredSeeded.look.objects.filter((o) => !parentSeeded.look.objects.includes(o)) });
  ok('and on that fixture every table is byte-identical, the settings the declarations live in included — the milestone stores nothing new anywhere',
    differing(deliveredSeeded.look.digests, parentSeeded.look.digests).length === 0 && !!deliveredSeeded.look.digests.users && !!deliveredSeeded.look.digests.trades,
    differing(deliveredSeeded.look.digests, parentSeeded.look.digests));
  /* The search is by OBJECT NAME and by the two declaration tokens, not by any occurrence of the
   * word "challenge": the pre-existing `notify_channels` event comment already contains it, and a
   * substring search that trips on that comment would be measuring the wrong thing. */
  const named = (o) => /^(table|index|trigger):[^:]*?(challenge|clean_rep|rep_count|reps)/i.test(o);
  const declares = (o) => /challenge_start|challenge_target|clean_rep|rep_count/.test(o);
  ok('there is no rep/challenge table, index or trigger to find, and no DDL that declares either key: the schema search the negative claim rests on is empty',
    !parentSeeded.look.objects.some(named) && !deliveredSeeded.look.objects.some(named) && !deliveredSeeded.look.objects.some(declares),
    { named: deliveredSeeded.look.objects.filter(named), declares: deliveredSeeded.look.objects.filter(declares).map((o) => o.slice(0, 40)) });
  ok('the two declarations ARE in the stored settings object in BOTH trees \u2014 the parent stores the unknown keys without a migration, which is exactly why this milestone needs none',
    parentSeeded.settings_keys.includes('challenge_start') && parentSeeded.settings_keys.includes('challenge_target') && JSON.stringify(parentSeeded.settings_keys) === JSON.stringify(deliveredSeeded.settings_keys), parentSeeded.settings_keys);

  /* The app's OWN M102 behaviour, named so it cannot be mistaken for a write by the count: the first
   * boot after a strategy exists snapshots its v1 rule set and attributes its trades to v1, and every
   * later boot changes nothing. The digest baseline below is taken AFTER that boot has happened. */
  const warm1 = run(PARENT, file, WARM);
  const warm2 = run(PARENT, file, WARM);
  ok('the parent\u2019s own second boot performs its M102 v1 backfill exactly once (one version row, one trade attributed) and a further boot changes not one byte',
    warm1.versions === 1 && warm2.versions === 1 && warm2.attributed === warm1.attributed && differing(warm2.look.digests, warm1.look.digests).length === 0,
    { first: warm1.versions, second: warm2.versions, attributed: warm2.attributed, drift: differing(warm2.look.digests, warm1.look.digests) });

  const parentRead = run(PARENT, file, PARENT_READ);
  ok('the parent\u2019s own modules read the fixture the way the count needs: the acknowledgements VERIFY against the parent\u2019s own fingerprints and the execution review records the stop decision',
    ['T1', 'T2', 'T3', 'T5', 'T6'].every((t) => parentRead.journals[t].complete === true) && parentRead.journals.T4.complete === false && JSON.stringify(parentRead.stop) === '[["T6","self_reported"]]' && parentRead.samples === 6,
    { journals: parentRead.journals, stop: parentRead.stop });
  ok('and the parent has NO rep count at all: no module and no key on the payload it serves \u2014 the absence this milestone closes, measured in the parent\u2019s own code',
    parentRead.has_challenge_module === false && JSON.stringify(parentRead.challenge_keys) === '[]', parentRead.challenge_keys);
  const deliveredRead = run(APP, file, DELIVERED_READ);
  ok('the delivered tree reads the PARENT\u2019s own file and counts exactly one rep: the clean, linked, acknowledged trade on the current UTC day',
    deliveredRead.state === 'available' && deliveredRead.counted === 1 && deliveredRead.trades === 5 && deliveredRead.before_start === 1 && deliveredRead.run === 1,
    { state: deliveredRead.state, counted: deliveredRead.counted, window: deliveredRead.trades, before_start: deliveredRead.before_start });
  ok('and every other closed trade is accounted for by its OWN criterion: one unlinked, two with a recorded breach, one never acknowledged',
    JSON.stringify(deliveredRead.by_criterion) === '{"plan_linked":1,"no_recorded_breach":2,"journalled_same_close_day":1}' && deliveredRead.unrecorded === 0,
    { by_criterion: deliveredRead.by_criterion, unrecorded: deliveredRead.unrecorded });
  ok('the newest trades are listed newest-first with their verdicts, so each reason is attributable to a trade and not to the trader',
    JSON.stringify(deliveredRead.recent) === '[["T1",true,""],["T2",false,"plan_linked"],["T3",false,"no_recorded_breach"],["T4",false,"journalled_same_close_day"],["T6",false,"no_recorded_breach"]]',
    deliveredRead.recent);
  const parentFp = Object.fromEntries(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((sym) => [sym, parentRead.journals[sym].fingerprint]));
  ok('the fingerprints the PARENT\u2019s own journal module computes over these rows are byte-identical to the delivered tree\u2019s: an acknowledgement recorded under the released code verifies here, with nothing re-stamped',
    JSON.stringify(parentFp) === JSON.stringify(deliveredRead.fingerprints),
    { parent: parentFp.T1.slice(0, 12), delivered: deliveredRead.fingerprints.T1.slice(0, 12) });

  ok('the declarations are read from the parent\u2019s settings row as the trader\u2019s own: start 2026-10-08, target 3',
    deliveredRead.declarations.start === 'set' && deliveredRead.declarations.startValue === '2026-10-08' && deliveredRead.declarations.target === 3, deliveredRead.declarations);
  ok('reading the count on the parent\u2019s file changes NOTHING: every table\u2019s digest is identical before and after the count, and identical to the parent\u2019s own post-backfill state',
    differing(deliveredRead.after.digests, deliveredRead.before.digests).length === 0 && differing(deliveredRead.before.digests, warm2.look.digests).length === 0,
    { by_the_count: differing(deliveredRead.after.digests, deliveredRead.before.digests), since_the_parents_boot: differing(deliveredRead.before.digests, warm2.look.digests) });
  ok('the count is read-only with zero writes and no influence on a grade, cap, permission, guardrail decision or plan change',
    deliveredRead.limits.read_only === true && deliveredRead.limits.writes === 0 && deliveredRead.limits.grades_influence === false && deliveredRead.limits.caps_influence === false && deliveredRead.limits.permission_influence === false && deliveredRead.limits.guardrail_decisions_influence === false && deliveredRead.limits.plan_change_permission === false && deliveredRead.outcome_joined === false);

  const back = run(PARENT, file, PARENT_READ);
  ok('the parent\u2019s own code still opens the file afterwards and sees exactly the six trades it left, with no row and no column this milestone added',
    back.samples === 6 && differing(back.after.digests, warm2.look.digests).length === 0 && back.has_challenge_module === false,
    differing(back.after.digests, warm2.look.digests));
  for (const f of [file, fileApp]) clean(f);
});
