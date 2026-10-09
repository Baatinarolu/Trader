'use strict';
/**
 * Test hygiene: a suite must leave the database exactly as it found it.
 *
 * The suites open their own throwaway workspace (never the human one) and this
 * module deletes it — and everything hanging off it — when the run finishes.
 * Without it, every `npm test` leaves another orphan workspace behind, and the
 * counts quoted in the docs rot.
 *
 *   const { purgeUser, purgeByPattern } = require('./test-cleanup');
 *   await purgeUser(email);                       // one workspace, after a run
 *   await purgeByPattern('%@test.local');          // sweep older residue
 *
 * Usable as a script too:  node scripts/test-cleanup.js            (sweeps known
 * test-account patterns and reports what it removed)
 */
const { db } = require('../src/db');

/** every table that hangs off a user, newest-independent order of deletion */
const USER_TABLES = [
  'trades', 'journal_entries', 'goals', 'watchlist', 'bot_signals', 'bot_alerts',
  'tv_alerts', 'webhook_tokens', 'rule_checks', 'notify_channels', 'strategies',
  'accounts', 'sessions', 'coach_notes', 'playbook_items', 'trade_images',
];

const TEST_PATTERNS = [
  '%@test.local',
  'workspace%@tradejournal.local',   // auto-provisioned by POST /api/auth/local (the jsdom UI run)
  '%@selftest.local',
];

/**
 * Throwaway workspaces are cheap to make and easy to forget. Anything that is
 * not the human's own workspace and has no trades is residue from a test run.
 * `keep` names the workspace(s) to preserve (the one the browser is using).
 */
async function purgeResidue({ keep = ['demo@tradejournal.pro'] } = {}) {
  const users = await db.prepare('SELECT id, email FROM users ORDER BY id').all();
  const out = [];
  for (const u of users) {
    if (keep.includes(u.email)) continue;
    const t = await db.prepare('SELECT COUNT(*) n FROM trades WHERE user_id=?').get(u.id);
    const j = await db.prepare('SELECT COUNT(*) n FROM journal_entries WHERE user_id=?').get(u.id);
    if (t.n === 0 && j.n === 0) out.push(await purgeUser(u.email));
  }
  return out;
}

async function tableExists(name) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

/** Delete one workspace by email. Returns a per-table count of what was removed. */
async function purgeUser(email) {
  const user = await db.prepare('SELECT id, email FROM users WHERE email=?').get(email);
  if (!user) return { email, found: false, removed: {} };
  const removed = {};
  for (const table of USER_TABLES) {
    if (!(await tableExists(table))) continue;
    try {
      const info = await db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(user.id);
      const n = Number((info && (info.changes !== undefined ? info.changes : info.rowsAffected)) || 0);
      if (n) removed[table] = n;
    } catch (e) { /* table shape without user_id — skip */ }
  }
  // tables that reference the user indirectly
  for (const [table, column] of [['alerts', 'user_id'], ['coach_reports', 'user_id']]) {
    if (await tableExists(table)) {
      try {
        const info = await db.prepare(`DELETE FROM ${table} WHERE ${column}=?`).run(user.id);
        const n = Number((info && (info.changes !== undefined ? info.changes : info.rowsAffected)) || 0);
        if (n) removed[table] = n;
      } catch (e) { /* ignore */ }
    }
  }
  await db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  return { email, found: true, id: user.id, removed };
}

/** Sweep every workspace matching the known test patterns (an older residue). */
async function purgeByPattern(patterns = TEST_PATTERNS) {
  const out = [];
  for (const pattern of patterns) {
    const rows = await db.prepare('SELECT email FROM users WHERE email LIKE ?').all(pattern);
    for (const r of rows) out.push(await purgeUser(r.email));
  }
  return out;
}

module.exports = { purgeUser, purgeByPattern, purgeResidue, USER_TABLES, TEST_PATTERNS };

if (require.main === module) {
  (async () => {
    const results = (await purgeByPattern()).concat(await purgeResidue());
    const total = results.reduce((s, r) => s + Object.values(r.removed).reduce((a, b) => a + b, 0), 0);
    if (!results.length) console.log('no test workspaces found — the database is clean');
    else {
      console.log(`removed ${results.length} test workspace(s), ${total} row(s):`);
      results.forEach((r) => console.log(`  ${r.email}${r.found ? ` — ${JSON.stringify(r.removed)}` : ' (already gone)'}`));
    }
    const users = await db.prepare('SELECT id, email FROM users ORDER BY id').all();
    console.log(`\nworkspaces left (${users.length}):`);
    users.forEach((u) => console.log(`  ${u.id} ${u.email}`));
  })().catch((e) => { console.error('cleanup failed:', e.message); process.exit(1); });
}
