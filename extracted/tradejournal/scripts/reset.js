#!/usr/bin/env node
'use strict';
/**
 * Delete the database and rebuild a clean workspace.
 *
 *   node scripts/reset.js          → asks for confirmation (interactive terminal)
 *   node scripts/reset.js --yes    → no prompt (npm run reset)
 *   node scripts/reset.js --empty  → rebuild, but leave the journal empty
 *
 * Honours TRADEJOURNAL_DB / TURSO_DATABASE_URL style overrides through src/db.js,
 * so it can also repoint you at a fresh file without touching the old one.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const YES = args.includes('--yes') || args.includes('-y');
const EMPTY = args.includes('--empty');
const KEEP = args.includes('--keep-file');      // wipe rows instead of deleting the file

const dbPath = process.env.TRADEJOURNAL_DB || path.join(__dirname, '..', 'data', 'journal.db');
const files = [dbPath, dbPath + '-wal', dbPath + '-shm'];

function describe() {
  console.log('\nThis will DELETE the journal database and rebuild it from scratch:');
  files.forEach((f) => console.log('  · ' + f + (fs.existsSync(f) ? '' : '  (not present)')));
  console.log(EMPTY ? '\nThe rebuilt workspace will be EMPTY (no sample trades).\n' : '\nThe rebuilt workspace gets the standard demo dataset.\n');
}

async function confirm() {
  if (YES) return true;
  if (!process.stdin.isTTY) {
    console.log('Refusing to delete anything without confirmation. Re-run with --yes.');
    return false;
  }
  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => readline.question('Type "reset" to continue: ', r));
  readline.close();
  return String(answer).trim().toLowerCase() === 'reset';
}

(async () => {
  describe();
  if (!(await confirm())) process.exit(1);

  if (KEEP) {
    const { db, ready } = require('../src/db');
    await ready;
    for (const t of ['tv_alerts', 'bot_signals', 'rule_checks', 'journal_entries', 'goals', 'watchlist', 'trades', 'strategies', 'accounts', 'sessions']) {
      try { await db.prepare(`DELETE FROM ${t}`).run(); } catch { /* table may not exist yet */ }
    }
    console.log('Rows wiped (file kept).');
  } else {
    for (const f of files) if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('removed ' + f); }
  }

  // fresh database: schema + instrument presets are created on require
  const { db, ready, seedGlobalInstruments, createUser } = require('../src/db');
  await ready;
  await seedGlobalInstruments();
  void db;

  if (EMPTY) {
    const made = await createUser({ email: 'local@tradejournal.local', name: 'Local workspace', password: require('crypto').randomBytes(18).toString('hex') });
    console.log(`Empty workspace ready (user ${made.userId}, account ${made.accountId}).`);
  } else {
    const { seedUser } = require('../src/demo-data');
    const email = 'demo@tradejournal.pro';
    const existing = await db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const created = existing
      ? { userId: existing.id, accountId: (await db.prepare('SELECT id FROM accounts WHERE user_id=? ORDER BY is_default DESC LIMIT 1').get(existing.id)).id }
      : await createUser({ email, name: 'Demo Trader', password: 'demo1234' });
    const n = await seedUser(created.userId, created.accountId, { force: true });
    const s = await db.prepare('SELECT COUNT(*) n, ROUND(SUM(net_pnl),2) pnl FROM trades WHERE user_id=?').get(created.userId);
    console.log(`Seeded ${n} trades (net $${s.pnl}).`);
  }

  const counts = ['users', 'accounts', 'trades', 'strategies', 'instruments', 'journal_entries', 'tv_alerts', 'webhook_tokens'];
  console.log('\nRebuilt ' + dbPath);
  for (const t of counts) {
    try { console.log(`  ${t.padEnd(18)} ${(await db.prepare(`SELECT COUNT(*) n FROM ${t}`).get()).n}`); } catch { /* ignore */ }
  }
  console.log('\nStart the app with: npm start\n');
  process.exit(0);
})().catch((e) => { console.error('Reset failed:', e.message); process.exit(1); });
