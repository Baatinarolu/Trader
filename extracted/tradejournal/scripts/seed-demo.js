'use strict';
/**
 * Reseeds the demo user with a fresh simulated history.
 *   npm run seed          → top up
 *   npm run reset         → delete the database and rebuild everything
 */
const { db, ready, seedGlobalInstruments, createUser } = require('../src/db');
const { seedUser } = require('../src/demo-data');

(async () => {
await ready;
await seedGlobalInstruments();
const email = 'demo@tradejournal.pro';
let row = await db.prepare('SELECT * FROM users WHERE email=?').get(email);
let userId, accountId;
if (!row) {
  const created = await createUser({ email, name: 'Demo Trader', password: 'demo1234' });
  userId = created.userId; accountId = created.accountId;
} else {
  userId = row.id;
  const acc = await db.prepare('SELECT id FROM accounts WHERE user_id=? ORDER BY is_default DESC LIMIT 1').get(userId);
  accountId = acc ? acc.id : null;
  await db.prepare('DELETE FROM journal_entries WHERE user_id=?').run(userId);
}
const n = await seedUser(userId, accountId, { force: true });
const stats = await db.prepare(`SELECT COUNT(*) n, ROUND(SUM(net_pnl),2) pnl, ROUND(AVG(r_multiple),3) avg_r FROM trades WHERE user_id=?`).get(userId);
console.log(`Demo user: ${email} / demo1234`);
console.log(`Inserted ${n} trades. Net P&L $${stats.pnl}, average ${stats.avg_r}R across ${stats.n} trades.`);
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
