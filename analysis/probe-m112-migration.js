'use strict';
/** M112 migration probe: the window is FOUR ADDITIVE COLUMNS on `accounts`, and this measures what
 * that costs an existing database. The ACTUAL committed M111 release builds its own history first
 * (account, trades, a routine config), the delivered tree then opens that same file, and the two
 * states are compared column by column. Nothing is guessed from source text: the migrated table's
 * own `CREATE TABLE` text is compared with the text a FRESH delivered database declares, so an
 * upgraded desk and a new desk cannot drift apart, and no window is invented for a desk that never
 * had one. */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const H = require('./m112-test-support'), { ok } = H;
const APP = H.APP, PARENT = process.env.TJ_PARENT || '/tmp/m112-parent/app';
const file = path.join(os.tmpdir(), `m112-migration-${process.pid}.db`);
const fresh = path.join(os.tmpdir(), `m112-fresh-${process.pid}.db`);
const child = (app, code, dbFile = file) => {
  const r = cp.spawnSync(process.execPath, ['-e', `const path=require('path'),APP=${JSON.stringify(app)},RealDate=Date,NOW=Date.UTC(2026,9,13,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';const D=require(path.join(APP,'src/db'));const crypto=require('crypto');const inspect=async()=>{const accounts=await D.db.prepare("SELECT * FROM accounts ORDER BY id").all();const cols=(await D.db.prepare('PRAGMA table_info(accounts)').all()).map(c=>[c.name,c.type,c.notnull,c.dflt_value,c.pk]);return {accounts,cols,digests:Object.fromEntries(await Promise.all(['trades','users','routine_cycles','guardrail_day_state'].map(async t=>{try{const rows=await D.db.prepare('SELECT * FROM '+t+' ORDER BY 1').all();return [t,crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,32)];}catch(e){return [t,'<absent>'];}}))) };};const tableText=async t=>((await D.db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(t))||{}).sql||null;(async()=>{await D.ready;${code}})().catch(e=>{console.error(e.stack);process.exit(1);});`],
    { env: { ...process.env, TRADEJOURNAL_DB: dbFile, NODE_OPTIONS: '', TURSO_DATABASE_URL: '', LIBSQL_URL: '', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw Error('child ' + r.status + ': ' + r.stderr + r.stdout);
  return JSON.parse(r.stdout);
};
const WINDOW_COLS = ['window_start', 'window_end', 'window_timezone', 'window_source'];
H.finish('M112 migration: four additive columns, and no window invented for an existing desk', async () => {
  if (!H.shipped(H.mod('src/trading-window'), 'the M112 trading-window rule')) return;

  const parentSrc = fs.existsSync(path.join(PARENT, 'src/trading-window.js')) ? fs.readFileSync(path.join(PARENT, 'src/trading-window.js'), 'utf8') : '';
  const parentDdl = (fs.readFileSync(path.join(PARENT, 'src/db.js'), 'utf8').match(/CREATE TABLE IF NOT EXISTS accounts[\s\S]*?\)/) || [''])[0];
  ok('the parent tree IS the committed M111 release: it has no window module and its accounts table declares none of the four columns', !parentSrc && WINDOW_COLS.every((c) => !parentDdl.includes(c)), WINDOW_COLS.filter((c) => parentDdl.includes(c)));

  /* ------------------------------------------------------------- the parent builds its own history */
  const build = `const u=await D.createUser({email:'m112-parent@test.local',name:'Actual M111 parent',password:'test-only'});
await D.db.prepare('UPDATE accounts SET routine_window_start=?, routine_timezone=?, max_trades_day=? WHERE id=?').run('08:00','Africa/Lagos',5,u.accountId);
for(let i=0;i<3;i++)await D.db.prepare('INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,setup_grade) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(u.userId,u.accountId,'DECLARED','long','closed','2026-10-12T10:00:00.000Z','2026-10-12T11:00:00.000Z',100,101,99,102,1,0,'B');
console.log(JSON.stringify({u,ddl:await tableText('accounts'),...await inspect()}));`;
  const parent = child(PARENT, build);                                     // first open: the parent writes its own M102 snapshot lazily
  const baseline = child(PARENT, `console.log(JSON.stringify({u:{userId:${parent.u.userId},accountId:${parent.u.accountId}},ddl:await tableText('accounts'),...await inspect()}));`);  // the honest baseline restart
  const uid = parent.u.userId, acc = parent.u.accountId;

  ok('the parent\u2019s own schema has no window column, and the account it wrote carries the routine zone it selected', !WINDOW_COLS.some((c) => baseline.accounts[0] && c in baseline.accounts[0]) && baseline.accounts[0].routine_timezone === 'Africa/Lagos', Object.keys(baseline.accounts[0] || {}).filter((k) => /window/.test(k)));

  /* ------------------------------------------------------------- the delivered tree opens it */
  const up = child(APP, `console.log(JSON.stringify({ddl:await tableText('accounts'),...await inspect()}));`);
  ok('opening the parent\u2019s file adds exactly the four window columns, and nothing else about the row changed', WINDOW_COLS.every((c) => c in up.accounts[0]) && Object.keys(up.accounts[0]).length === Object.keys(baseline.accounts[0]).length + 4, { added: Object.keys(up.accounts[0]).filter((k) => !(k in baseline.accounts[0])), removed: Object.keys(baseline.accounts[0]).filter((k) => !(k in up.accounts[0])) });
  ok('no window is invented for a desk that never had one: all four columns are NULL, so the state is `unset` and it blocks nothing', WINDOW_COLS.every((c) => up.accounts[0][c] === null), WINDOW_COLS.map((c) => [c, up.accounts[0][c]]));
  ok('every inherited fact is preserved: the account row, the trades, the users and the guardrail state hash the same as the parent left them', JSON.stringify(up.digests) === JSON.stringify(baseline.digests), { parent: baseline.digests, delivered: up.digests });
  ok('the parent\u2019s own routine settings survive the upgrade untouched, so the window did not reopen a schedule', up.accounts[0].routine_window_start === '08:00' && up.accounts[0].routine_timezone === 'Africa/Lagos' && up.accounts[0].max_trades_day === 5, { start: up.accounts[0].routine_window_start, zone: up.accounts[0].routine_timezone });

  /* ------------------------------------------------------------- fresh and upgraded must agree */
  /** The CHECK a column carries, extracted with balanced parentheses (the constraints contain
   * commas and nested calls, so a regex over the text would compare truncated fragments). */
  const checkOf = (ddl, col) => {
    // A word boundary matters here: `routine_window_start TEXT` contains `window_start TEXT`,
    // and matching that would test the ROUTINE schedule's CHECK while claiming to test the window's.
    const m = new RegExp('(?:^|[\\s,(])' + col + ' TEXT').exec(ddl);
    if (!m) return null;
    const i = m.index + m[0].indexOf(col);
    const c = ddl.indexOf('CHECK', i + col.length);
    if (c < 0) return null;
    const j = ddl.indexOf('(', c);
    let depth = 0;
    for (let k = j; k < ddl.length; k++) {
      if (ddl[k] === '(') depth++;
      else if (ddl[k] === ')') { depth--; if (!depth) return ddl.slice(j, k + 1).replace(/\s+/g, ' '); }
    }
    return null;
  };
  const brandNew = child(APP, `const u=await D.createUser({email:'m112-fresh@test.local',name:'Fresh',password:'test-only'});console.log(JSON.stringify({ddl:await tableText('accounts'),cols:(await D.db.prepare('PRAGMA table_info(accounts)').all()).map(c=>[c.name,c.type,c.notnull,c.dflt_value,c.pk])}));`, fresh);
  const metaOf = (x) => x.cols.filter((c) => WINDOW_COLS.includes(c[0]));
  ok('the four columns an upgraded database inherits carry the SAME declared type, NOT NULL and default as the ones a fresh database is created with', JSON.stringify(metaOf(brandNew)) === JSON.stringify(metaOf(up)) && metaOf(up).length === 4, { fresh: metaOf(brandNew), upgraded: metaOf(up) });
  ok('and the SAME CHECK on each of them, re-created from the DDL rather than inherited: both sides or neither, the format, the unequal pair, the zone with the pair, the source list', WINDOW_COLS.every((c) => checkOf(up.ddl, c) && checkOf(up.ddl, c) === checkOf(brandNew.ddl, c)), WINDOW_COLS.map((c) => [c, checkOf(up.ddl, c) === checkOf(brandNew.ddl, c)]));
  ok('the CHECKs are the ones that describe the rule, not placeholders', /GLOB '\[0-2\]\[0-9\]:\[0-5\]\[0-9\]'/.test(checkOf(up.ddl, 'window_start')) && /BETWEEN 0 AND 23/.test(checkOf(up.ddl, 'window_start')) && /window_end<>window_start/.test(checkOf(up.ddl, 'window_end')) && /=\(window_start IS NULL\)/.test(checkOf(up.ddl, 'window_timezone')) && /'manual'/.test(checkOf(up.ddl, 'window_source')) && /'from_session_history'/.test(checkOf(up.ddl, 'window_source')), { start: checkOf(up.ddl, 'window_start'), source: checkOf(up.ddl, 'window_source') });
  ok('and the position difference is RECORDED rather than hidden: an inherited table appends the four columns last, the fresh DDL places them before the prop fields', up.cols.slice(-4).map((c) => c[0]).join(',') === WINDOW_COLS.join(',') && brandNew.cols.slice(-4).map((c) => c[0]).join(',') !== WINDOW_COLS.join(',') && brandNew.cols.some((c) => c[0] === 'window_start'), { upgradedTail: up.cols.slice(-4).map((c) => c[0]), freshTail: brandNew.cols.slice(-4).map((c) => c[0]) });

  /* ------------------------------------------------------------- the constraints, measured */
  const probes = `const bad=[];
const tryInsert=async(label,sql,args)=>{try{await D.db.prepare(sql).run(...args);bad.push([label,'ACCEPTED']);}catch(e){bad.push([label,String(e.code||e.message).slice(0,40)]);}};
await tryInsert('half a window','UPDATE accounts SET window_start=? WHERE id=?',['07:00',${acc}]);
await tryInsert('two equal sides','UPDATE accounts SET window_start=?,window_end=? WHERE id=?',['07:00','07:00',${acc}]);
await tryInsert('a malformed clock','UPDATE accounts SET window_start=?,window_end=? WHERE id=?',['7:00','10:00',${acc}]);
await tryInsert('an hour that does not exist','UPDATE accounts SET window_start=?,window_end=? WHERE id=?',['25:00','10:00',${acc}]);
await tryInsert('a pair with no zone','UPDATE accounts SET window_start=?,window_end=? WHERE id=?',['07:00','10:00',${acc}]);
await tryInsert('a source the app never writes','UPDATE accounts SET window_start=?,window_end=?,window_timezone=?,window_source=? WHERE id=?',['07:00','10:00','Africa/Lagos','guessed',${acc}]);
await tryInsert('a real window','UPDATE accounts SET window_start=?,window_end=?,window_timezone=?,window_source=? WHERE id=?',['07:00','10:00','Africa/Lagos','manual',${acc}]);
console.log(JSON.stringify({bad,row:(await D.db.prepare('SELECT window_start,window_end,window_timezone,window_source FROM accounts WHERE id=?').get(${acc}))}));`;
  const cons = child(APP, probes);
  const byLabel = Object.fromEntries(cons.bad);
  ok('the schema refuses half a window, two equal sides, a malformed clock and an hour the clock does not have', ['half a window', 'two equal sides', 'a malformed clock', 'an hour that does not exist'].every((l) => byLabel[l] !== 'ACCEPTED'), byLabel);
  ok('and it refuses a pair with no zone as firmly as it refuses a source the app never writes', byLabel['a pair with no zone'] !== 'ACCEPTED' && byLabel['a source the app never writes'] !== 'ACCEPTED', byLabel);
  ok('while the real window IS accepted and stored exactly as written — the constraints refuse shapes, not the feature', byLabel['a real window'] === 'ACCEPTED' && cons.row.window_start === '07:00' && cons.row.window_end === '10:00' && cons.row.window_timezone === 'Africa/Lagos' && cons.row.window_source === 'manual', { verdict: byLabel['a real window'], row: cons.row });

  /* ------------------------------------------------------------- the parent still reads the file */
  const back = child(PARENT, `console.log(JSON.stringify({row:(await D.db.prepare('SELECT * FROM accounts WHERE id=?').get(${acc}))||null,trades:(await D.db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id=?').get(${uid})).n}));`);
  ok('the parent\u2019s OWN code still reads the upgraded file: its account row and its trades are there, and the extra columns are simply invisible to it', back.row && back.row.id === acc && back.row.routine_timezone === 'Africa/Lagos' && back.trades === 3, { row: !!back.row, trades: back.trades });
  ok('reading it with the parent does not drop the window either: the delivered tree still sees the pair afterwards', (() => {
    const after = child(APP, `console.log(JSON.stringify({row:await D.db.prepare('SELECT window_start,window_end,window_timezone,window_source FROM accounts WHERE id=?').get(${acc})}));`);
    return after.row.window_start === '07:00' && after.row.window_source === 'manual';
  })(), null);
  for (const f of [file, fresh]) for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(f + s); } catch { /* already gone */ }
});
