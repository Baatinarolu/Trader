'use strict';
/** M12 migration probe: the tally added NO schema object of any kind, and it reads a database the
 * committed parent created and wrote without changing a byte of it. The strong claim here is
 * negative — M12 stores nothing new — so it is measured in both trees' OWN code: each is asked for
 * its `sqlite_master` and its per-table digests, on the same fixture and on the same file. */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const H = require('./m12-test-support'), { ok } = H;
const APP = H.APP, PARENT = process.env.TJ_PARENT || '/tmp/m12-parent/app';
const file = path.join(os.tmpdir(), `m12-migration-${process.pid}.db`), fileApp = file + '.app';
const inspectFn = `const inspect=async()=>{const objects=await D.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),digests={},crypto=require('crypto');for(const {name,sql} of objects.filter(o=>o.sql&&o.sql.startsWith('CREATE TABLE'))){try{const rows=await D.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all();digests[name]=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,32);}catch{digests[name]='<unreadable>';}}return {objects,digests};};`;
/** The same fixture in both trees: the app's OWN tables and columns, including one guardrail audit
 * row written the way `logEvent` writes it, with its UNIQUE dedupe_key. */
const SEED = `const u=await D.db.prepare('INSERT INTO users (email,name,password_hash) VALUES (?,?,?)').run('m12@test.local','M12 trader','x');
const uid=Number(u.lastInsertRowid);await D.db.prepare('INSERT INTO accounts (user_id,name,starting_balance) VALUES (?,?,?)').run(uid,'M12 desk',10000);
const acc=(await D.db.prepare('SELECT id FROM accounts WHERE user_id=?').get(uid)).id;
await D.db.prepare('INSERT INTO guardrail_events (user_id,account_id,rule_date,observed_at,kind,action,reason,snapshot,dedupe_key) VALUES (?,?,?,?,?,?,?,?,?)')
  .run(uid,acc,'2026-10-06','2026-10-06T08:05:00.000Z','blocked_attempt','entry',null,JSON.stringify({date:'2026-10-06',status:'stop',breaches:[{rule:'pre_market_routine',detail:'Routine incomplete'}],message:'Stand down: Routine incomplete'}),'2026-10-06:blocked_attempt:pre_market_routine');
const out={seeded:{users:(await D.db.prepare('SELECT COUNT(*) c FROM users').get()).c,events:(await D.db.prepare('SELECT COUNT(*) c FROM guardrail_events').get()).c},uid,acc,cols:(await D.db.prepare("PRAGMA table_info('guardrail_events')").all()).map(c=>c.name+':'+c.type+':'+c.notnull),look:await inspect()};console.log(JSON.stringify(out));`;
const READ_BACK = `const rows={users:(await D.db.prepare('SELECT COUNT(*) c FROM users').get()).c,events:(await D.db.prepare('SELECT COUNT(*) c FROM guardrail_events').get()).c,accounts:(await D.db.prepare('SELECT COUNT(*) c FROM accounts').get()).c};console.log(JSON.stringify({rows,look:await inspect()}));`;
const READ_TALLY = `const uid=(await D.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()).id,acc=(await D.db.prepare('SELECT id FROM accounts ORDER BY id LIMIT 1').get()).id;
const before=await inspect(),rb=await require(path.join(APP,'src/rule-breaks')).inspect(uid,{accountId:acc,store:D.db}),after=await inspect();
console.log(JSON.stringify({tally:{state:rb.state,breaks:rb.breaks,prevented:rb.prevented,by_rule:rb.by_rule.map(r=>r.rule),account_ids:rb.account_ids,limits:rb.limits},before,after}));`;
const run = (app, db, code) => { const out = cp.spawnSync(process.execPath, ['-e', `const path=require('path'),APP=${JSON.stringify(app)},RealDate=Date,NOW=Date.UTC(2026,9,13,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';const D=require(path.join(APP,'src/db'));${inspectFn}(async()=>{await D.ready;${code}})().catch(e=>{console.error(e.stack);process.exit(1);});`], { env: { ...process.env, TRADEJOURNAL_DB: db, NODE_OPTIONS: '', TURSO_DATABASE_URL: '', LIBSQL_URL: '', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 }); if (out.status !== 0) throw Error('child ' + out.status + ': ' + out.stderr + out.stdout); return JSON.parse(out.stdout); };
H.finish('M12 migration: no schema object added, and the parent\u2019s own file is read untouched', async () => {
  const N = H.mod('src/rule-breaks');
  if (!H.shipped(N, 'the M12 rule-break tally')) return;
  ok('the parent tree IS the committed 67f2ed2 M112 release: it has the guardrail audit and the trading-window columns, but no rule-break tally at all', fs.existsSync(path.join(PARENT, 'src/db.js')) && !fs.existsSync(path.join(PARENT, 'src/rule-breaks.js')) && /window_start/.test(fs.readFileSync(path.join(PARENT, 'src/db.js'), 'utf8')), { parent: fs.existsSync(PARENT) });
  for (const f of [file, fileApp]) { try { fs.unlinkSync(f); } catch {} }
  const parentSeeded = run(PARENT, file, SEED);
  const deliveredSeeded = run(APP, fileApp, SEED);
  ok('the delivered tree creates exactly the parent\u2019s schema: every table, index and trigger is byte-identical DDL, so M12 adds no schema object of any kind', JSON.stringify(deliveredSeeded.look.objects) === JSON.stringify(parentSeeded.look.objects), { parent: parentSeeded.look.objects.length, delivered: deliveredSeeded.look.objects.length });
  const differing = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
  ok('and on the same fixture every table is byte-identical, the audit table included — the tally stores nothing new', differing(deliveredSeeded.look.digests, parentSeeded.look.digests).length === 0 && !!deliveredSeeded.look.digests.guardrail_events, differing(deliveredSeeded.look.digests, parentSeeded.look.digests));
  ok('the audit table the tally reads carries exactly the columns the parent declared, in order — none added, none moved', JSON.stringify(parentSeeded.cols) === JSON.stringify(['id:INTEGER:0', 'user_id:INTEGER:1', 'account_id:INTEGER:0', 'rule_date:TEXT:1', 'observed_at:TEXT:1', 'kind:TEXT:1', 'action:TEXT:1', 'entity_type:TEXT:0', 'entity_id:INTEGER:0', 'reason:TEXT:0', 'snapshot:TEXT:1', 'dedupe_key:TEXT:0']) && JSON.stringify(deliveredSeeded.cols) === JSON.stringify(parentSeeded.cols), parentSeeded.cols);
  const withTally = run(APP, file, READ_TALLY);   // the parent's own already-seeded file
  ok('the delivered tree reads a file the parent created and wrote, and counts the parent\u2019s OWN audit row: one prevented attempt on the rule the parent named', withTally.tally.state === 'available' && withTally.tally.breaks === 1 && withTally.tally.prevented === 1 && JSON.stringify(withTally.tally.by_rule) === JSON.stringify(['pre_market_routine']) && JSON.stringify(withTally.tally.account_ids) === JSON.stringify([1]), withTally.tally);
  ok('reading the tally on that file changes NOTHING: every table\u2019s digest is identical before and after the read', differing(withTally.after.digests, withTally.before.digests).length === 0, differing(withTally.after.digests, withTally.before.digests));
  ok('and reading it twice is idempotent — the second read is the same tally, with no counter and no audit row added', JSON.stringify(withTally.after.digests) === JSON.stringify(withTally.before.digests) && withTally.after.objects.length === withTally.before.objects.length, null);
  ok('the tally\u2019s limits are the ones a review needs: read-only, zero writes, no grade/cap/permission/guardrail-decision influence', withTally.tally.limits.read_only === true && withTally.tally.limits.writes === 0 && withTally.tally.limits.grades_influence === false && withTally.tally.limits.permission_influence === false && withTally.tally.limits.caps_influence === false && withTally.tally.limits.guardrail_decisions_influence === false, withTally.tally.limits);
  const back = run(PARENT, file, READ_BACK);
  ok('the parent\u2019s own code still opens the file afterwards and sees exactly the rows it left: one user, one account and its one audit row', back.rows.users === parentSeeded.seeded.users && back.rows.events === parentSeeded.seeded.events && back.rows.accounts === 1, back.rows);
  ok('nothing is read into the parent\u2019s digests by the tally: the parent\u2019s view of its own file is unchanged after the delivered tree read it', differing(back.look.digests, parentSeeded.look.digests).length === 0, differing(back.look.digests, parentSeeded.look.digests));
  ok('the delivered tree ships the tally in exactly two files — the module and the route that serves it — so no guardrail decision path can require it', (() => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
    const hits = walk(path.join(APP, 'src')).filter((f) => f.endsWith('.js') && /rule-breaks/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(APP, f).split(path.sep).join('/')).sort();
    return JSON.stringify(hits) === JSON.stringify(['src/routes/api.js', 'src/rule-breaks.js']);
  })(), null);
  for (const f of [file, fileApp]) { try { fs.unlinkSync(f); } catch {} }
});
