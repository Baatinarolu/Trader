'use strict';
/** M132 — cleanup is atomic, correctly owner-scoped, and handles indirect child ownership.
 * Isolated SQLite only; neither this probe nor M33 touches the actual workspace.
 * Test FK ON and OFF so remote behavior cannot rely on a local-only PRAGMA.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const file = path.join(os.tmpdir(), `m132-${process.pid}.db`);
delete process.env.TURSO_DATABASE_URL; delete process.env.LIBSQL_URL; delete process.env.TURSO_AUTH_TOKEN;
process.env.TRADEJOURNAL_DB = file;
const Db = require(path.join(APP, 'src/db'));
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(' ok   ' + name); }
  else { fail++; console.log(' FAIL ' + name + (detail ? ' — ' + detail : '')); } };
const count = async (table, uid) => Number((await Db.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(uid)).n);
async function seed(label) {
  const user = await Db.createUser({ email: `m132-${process.pid}-${label}@test.local`, name: label, password: 'fixture-only' });
  const strategy = await Db.db.prepare('SELECT id FROM strategies WHERE user_id=? ORDER BY id LIMIT 1').get(user.userId);
  const t = await Db.db.prepare('INSERT INTO trades(user_id,account_id,symbol,opened_at,entry,size,strategy_id) VALUES(?,?,?,?,?,?,?)')
    .run(user.userId, user.accountId, 'TEST', '2026-07-15T08:30:00Z', 100, 1, strategy.id);
  await Db.db.prepare('INSERT INTO rule_checks(trade_id,label) VALUES(?,?)').run(t.lastInsertRowid, 'fixture rule');
  await Db.db.prepare('INSERT INTO strategy_versions(strategy_id,version,name) VALUES(?,1,?)').run(strategy.id, 'fixture v1');
  await Db.db.prepare('INSERT INTO chart_drawings(user_id,symbol,timeframe,kind) VALUES(?,?,?,?)').run(user.userId, 'TEST', '15m', 'line');
  await Db.db.prepare('INSERT INTO instruments(user_id,symbol) VALUES(?,?)').run(user.userId, 'CUSTOM-' + label);
  await Db.db.prepare('INSERT INTO notify_channels(user_id,kind,url) VALUES(?,?,?)').run(user.userId, 'webhook', 'https://example.invalid/fixture');
  await Db.db.prepare('INSERT INTO journal_entries(user_id,entry_date) VALUES(?,?)').run(user.userId, '2026-07-15');
  return { ...user, tradeId: t.lastInsertRowid, strategyId: strategy.id };
}
(async () => {
  await Db.ready;
  await Db.setBiasState({ symbol: 'SHARED', tf: '15m', bias: 1, invalidation_level: 90, invalidation_side: 'below' });
  const globalN = Number((await Db.db.prepare('SELECT COUNT(*) AS n FROM instruments WHERE user_id IS NULL').get()).n);
  for (const fk of ['ON', 'OFF']) {
    await Db.client.execute(`PRAGMA foreign_keys=${fk}`);
    const a = await seed('delete-' + fk), b = await seed('keep-' + fk);
    let error = null;
    try { await Db.clearWorkspace(a.userId); } catch (e) { error = e.message; }
    ok(`FK ${fk}: clearWorkspace does not assume rule_checks.user_id exists`, !error, error || '');
    for (const table of ['accounts', 'strategies', 'trades', 'journal_entries', 'chart_drawings', 'instruments', 'notify_channels']) {
      ok(`FK ${fk}: ${table} removed ONLY for its owner`, await count(table, a.userId) === 0 && await count(table, b.userId) > 0);
    }
    const ar = Number((await Db.db.prepare('SELECT COUNT(*) AS n FROM rule_checks WHERE trade_id=?').get(a.tradeId)).n);
    const br = Number((await Db.db.prepare('SELECT COUNT(*) AS n FROM rule_checks WHERE trade_id=?').get(b.tradeId)).n);
    const av = Number((await Db.db.prepare('SELECT COUNT(*) AS n FROM strategy_versions WHERE strategy_id=?').get(a.strategyId)).n);
    const bv = Number((await Db.db.prepare('SELECT COUNT(*) AS n FROM strategy_versions WHERE strategy_id=?').get(b.strategyId)).n);
    ok(`FK ${fk}: indirect trade-rule children are correctly owner-scoped`, ar === 0 && br === 1);
    ok(`FK ${fk}: indirect strategy versions are correctly owner-scoped`, av === 0 && bv === 1);
    const au = await Db.db.prepare('SELECT id FROM users WHERE id=?').get(a.userId);
    const bu = await Db.db.prepare('SELECT id FROM users WHERE id=?').get(b.userId);
    ok(`FK ${fk}: owner removed, other workspace still exists`, !au && !!bu);
  }
  ok('global instrument presets survive workspace cleanup', Number((await Db.db.prepare('SELECT COUNT(*) AS n FROM instruments WHERE user_id IS NULL').get()).n) === globalN);
  ok('market-scoped daily bias is NOT deleted with a user workspace', !!await Db.getBiasState('SHARED', '15m'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
  if (Db.client && Db.client.close) Db.client.close();
  for (const p of [file, file + '-wal', file + '-shm']) { try { fs.unlinkSync(p); } catch {} }
});
