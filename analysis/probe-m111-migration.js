'use strict';
/** M111 migration probe: M111 is a READ-SEMANTICS fix, so on the database it must be invisible and
 * on the payload it must be unmistakable. The ACTUAL committed M110 release builds its own history
 * first, the SAME failing read is then made on that parent tree and on the delivered tree, and the
 * two answers are compared: the parent reports a quiet calendar with no state at all (the recorded
 * defect, measured on the parent's own code), the delivered tree reports `unknown`. Every schema
 * object and every inherited fact must be byte-identical across the change. */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const H = require('./m111-test-support'), { ok } = H;
const APP = H.APP, PARENT = process.env.TJ_PARENT || '/tmp/m111-parent/app';
const file = path.join(os.tmpdir(), `m111-migration-${process.pid}.db`);
const child = (app, code) => {
  const r = cp.spawnSync(process.execPath, ['-e', `const path=require('path'),APP=${JSON.stringify(app)},RealDate=Date,NOW=Date.UTC(2026,9,13,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};for(const k of ['TURSO_DATABASE_URL','LIBSQL_URL','TURSO_AUTH_TOKEN'])process.env[k]='';const D=require(path.join(APP,'src/db')),M=require(path.join(APP,'src/market')),B=require(path.join(APP,'src/bots'));const inspect=async uid=>{const objects=await D.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),facts={},digests={},crypto=require('crypto');for(const {name,sql} of objects.filter(o=>o.sql&&o.sql.startsWith('CREATE TABLE'))){try{const rows=await D.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all();facts[name]=rows;digests[name]=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,32);}catch{digests[name]='<unreadable>';}}return {objects,digests,accounts:facts.accounts||[],row:(facts.accounts||[]).find(a=>a.user_id===uid)||null};};(async()=>{await D.ready;${code}})().catch(e=>{console.error(e.stack);process.exit(1);});`],
    { env: { ...process.env, TRADEJOURNAL_DB: file, NODE_OPTIONS: '', TURSO_DATABASE_URL: '', LIBSQL_URL: '', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw Error('child ' + r.status + ': ' + r.stderr + r.stdout);
  return JSON.parse(r.stdout);
};
/** The failing read as a CHILD sees it: the market reader is patched to the layer's own failure
 * shape, so no feed, no shim and no network is involved in either tree. */
const failingRead = `const real=M.getCalendar;M.getCalendar=async()=>({ok:false,error:'Economic calendar unavailable (probe)',events:[]});const pair=require(path.join(APP,'src/news-window')).plan({news_block_before_min:15,news_settle_after_min:45});const out=await B.newsCheck('EURUSD',pair);M.getCalendar=real;`;
H.finish('M111 migration: no schema change, and the same read answers differently', async () => {
  if (!H.shipped(H.mod('src/news-window'), 'the M111 calendar-read state vocabulary')) return;
  const N = H.mod('src/news-window'), S = N.STATES;

  const parentSrc = fs.existsSync(path.join(PARENT, 'src/news-window.js')) ? fs.readFileSync(path.join(PARENT, 'src/news-window.js'), 'utf8') : '';
  ok('the parent tree IS the committed M110 release: it owns the two clocks and refuses the single knob, but it has no state vocabulary at all', /news_block_before_min/.test(parentSrc) && /LEGACY_SINGLE/.test(parentSrc) && !/STATES/.test(parentSrc) && !/unknownNote/.test(parentSrc), { parent: fs.existsSync(PARENT) });

  const parent = child(PARENT, `const u=await D.createUser({email:'m111-parent@test.local',name:'Actual M110 parent',password:'test-only'});const UID=u.userId,ACC=u.accountId;for(let i=0;i<3;i++)await D.db.prepare('INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,setup_grade) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(UID,ACC,'DECLARED','long','closed','2026-10-12T10:00:00.000Z','2026-10-12T11:00:00.000Z',100,101,99,102,1,0,'B');${failingRead}console.log(JSON.stringify({u,parent_read:out,parent_keys:Object.keys(out),...await inspect(UID)}));`);
  const uid = parent.u.userId;
  /* The parent's own RESTART lazily creates its M102 default strategy snapshot and moves
   * sqlite_sequence — inherited behaviour of the tree being upgraded, isolated here exactly as the
   * M110 migration probe isolates it, so it cannot be mistaken for an M111 write. */
  const stable = child(PARENT, `const UID=${uid};console.log(JSON.stringify(await inspect(UID)));`);
  const lazy = Object.keys(parent.digests).filter((t) => parent.digests[t] !== stable.digests[t]);
  ok('the parent\'s own restart isolates its lazy M102 default strategy snapshot (and the sequence it moves) rather than merging it into the delta', JSON.stringify(lazy) === JSON.stringify(['sqlite_sequence', 'strategy_versions']), lazy);
  parent.digests = stable.digests;
  ok('the parent produced owned history to inherit: three closed trades and one account row at the M110 defaults', parent.digests.trades !== undefined && parent.accounts.length === 1, { accounts: parent.accounts.length });
  ok('the parent\'s account pair defaults to 15/45 and the row carries both columns', parent.row && parent.row.news_block_before_min === 15 && parent.row.news_settle_after_min === 45, parent.row && [parent.row.news_block_before_min, parent.row.news_settle_after_min]);

  /* ------------------------------------------------- the recorded defect, on the parent */
  ok('ON THE PARENT the same failing read is the recorded FAIL-OPEN: a null blackout, an empty event list, no state, no reason and no note — the payload that reads exactly like a quiet week', parent.parent_read.blackout === null && parent.parent_read.events.length === 0 && !('state' in parent.parent_read) && !('unavailable' in parent.parent_read) && !('unavailable_note' in parent.parent_read) && !('error' in parent.parent_read), parent.parent_keys);
  ok('the parent still echoes its pair on that path, which is why the two payloads are comparable line for line', parent.parent_read.windows.before_min === 15 && parent.parent_read.windows.after_min === 45 && parent.parent_read.windows.unavailable === undefined, parent.parent_read.windows);

  /* ---------------------------------------------- the same read, on the delivered tree */
  const up = child(APP, `const UID=${uid};${failingRead}console.log(JSON.stringify({delivered_read:out,...await inspect(UID)}));`);
  ok('ON THE DELIVERED TREE the identical read is `unknown`, with the reason and the sentence attached', up.delivered_read.state === S.UNKNOWN && /Economic calendar unavailable \(probe\)/.test(up.delivered_read.unavailable) && up.delivered_read.unavailable_note === N.unknownNote(up.delivered_read.unavailable) && up.delivered_read.error === up.delivered_read.unavailable, up.delivered_read);
  ok('and everything else about the payload is unchanged: same pair, same currencies, same empty lists, no invented release', JSON.stringify([up.delivered_read.windows.before_min, up.delivered_read.windows.after_min, up.delivered_read.currencies, up.delivered_read.events, up.delivered_read.upcoming]) === JSON.stringify([15, 45, parent.parent_read.currencies, parent.parent_read.events, parent.parent_read.upcoming]), { delivered: up.delivered_read.windows, parent: parent.parent_read.windows });
  ok('the two payloads differ ONLY by the state and the failure it names, which is the whole change', (() => {
    const p = { ...parent.parent_read }, d = { ...up.delivered_read };
    delete p.windows; delete d.windows;
    const added = Object.keys(d).filter((k) => !(k in p)).sort();
    const removed = Object.keys(p).filter((k) => !(k in d) && !k.startsWith('error'));
    return JSON.stringify(added) === JSON.stringify(['error', 'state', 'unavailable', 'unavailable_note']) && removed.length === 0 && p.blackout === d.blackout && JSON.stringify(p.events) === JSON.stringify(d.events);
  })(), { parent: Object.keys(parent.parent_read), delivered: Object.keys(up.delivered_read) });

  /* ------------------------------------------------------------ the database is untouched */
  const addedObjs = up.objects.filter((o) => !parent.objects.some((p) => p.name === o.name));
  const goneObjs = parent.objects.filter((p) => !up.objects.some((o) => o.name === p.name));
  const changedObjs = up.objects.filter((o) => { const p = parent.objects.find((x) => x.name === o.name); return p && p.sql !== o.sql; });
  ok('M111 adds NO schema object of any kind and changes none: every table, index and trigger is byte-identical to the parent\'s', addedObjs.length === 0 && goneObjs.length === 0 && changedObjs.length === 0, { added: addedObjs.map((o) => o.name), gone: goneObjs.map((o) => o.name), changed: changedObjs.map((o) => o.name) });
  const moved = Object.keys(parent.digests).filter((t) => parent.digests[t] !== up.digests[t]);
  ok('every inherited fact is byte-identical after the upgrade: a state that is derived on every read has nothing to store', moved.length === 0, moved);
  ok('the pair the trader stored is still the pair the app applies, and the read did not move it', up.row && up.row.news_block_before_min === 15 && up.row.news_settle_after_min === 45, up.row && [up.row.news_block_before_min, up.row.news_settle_after_min]);

  /* --------------------------------------------------------------- and it stays a no-op */
  const again = child(APP, `const UID=${uid};console.log(JSON.stringify(await inspect(UID)));`);
  ok('a second open of the database is a no-op: same objects, same facts, same pair', JSON.stringify(again.objects.map((o) => [o.type, o.name, o.sql])) === JSON.stringify(up.objects.map((o) => [o.type, o.name, o.sql])) && JSON.stringify(again.digests) === JSON.stringify(up.digests), { cols: null });
  const back = child(PARENT, `const UID=${uid};${failingRead}console.log(JSON.stringify({parent_read_again:out,trades:(await D.db.prepare('SELECT COUNT(*) AS n FROM trades WHERE user_id=?').get(UID)).n}));`);
  ok('the change is additive in the strongest sense available here: the PARENT\'s own code still reads the file the delivered tree wrote, and still reports its own quiet shape there', back.trades === 3 && back.parent_read_again.blackout === null && !('state' in back.parent_read_again), { trades: back.trades, keys: Object.keys(back.parent_read_again) });

  /* ------------------------------------------------- the state is not smuggled into a store */
  const cols = await H.D.db.prepare('PRAGMA table_info(accounts)').all();
  ok('and there is nothing to migrate for it: no column anywhere stores a calendar state', !cols.some((c) => /state|unavailable/i.test(c.name)), cols.map((c) => c.name).filter((c) => /news|state/i.test(c)));
});
