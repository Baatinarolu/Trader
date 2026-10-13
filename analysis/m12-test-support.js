'use strict';
/** M12 test support: the M111 harness plus the two things only this milestone needs — a way to
 * write guardrail-audit rows the way the app's own `observe()`/`record()` paths write them, and a
 * reader for them. Seeding writes the SAME columns the audit writes, including its UNIQUE
 * `dedupe_key`, so a probe cannot pass by inventing a row shape the app would never store. */
const H = require('./m111-test-support');
/* Required EAGERLY: it installs the fetch wrapper that records the harness loopback port. */
const M112_SUPPORT = require('./m112-test-support');
const M12_VERSION = 'rule-breaks-v1';
const m12 = (M) => !!(M && M.VERSION === M12_VERSION && typeof M.evaluate === 'function' && typeof M.inspect === 'function' && typeof M.unavailable === 'function');
/** The uniform parent-control opener; `false` on the committed parent, where the module is absent. */
const shipped = (M, what) => { H.ok(`this tree ships ${what} (the committed parent does not, and that absence is this probe's control)`, m12(M)); return m12(M); };
const snapshotOf = (breaches, extra = {}) => JSON.stringify({ date: extra.date || '2026-10-13', status: 'stop', breaches, message: 'Stand down: ' + breaches.map((b) => b.detail || b.rule).join(' '), ...extra });
/** INSERT the way `guardrails.logEvent` does. A row with no explicit snapshot gets the day shape
 * the audit stores, so the rule parser is exercised on the real payload rather than a stub. */
const audit = (userId, accountId, rows) => {
  const stmt = H.D.db.prepare('INSERT OR IGNORE INTO guardrail_events (user_id,account_id,rule_date,observed_at,kind,action,entity_type,entity_id,reason,snapshot,dedupe_key) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  for (const r of rows) {
    stmt.run(userId, accountId, r.date, r.at || `${r.date}T09:30:00.000Z`, r.kind, r.action || 'entry', r.entityType || null, r.entityId || null, r.reason || null,
      r.snapshot === undefined ? snapshotOf([{ rule: r.rule, detail: `Recorded ${r.rule || 'rule'} breach` }], { date: r.date }) : r.snapshot,
      r.dedupe === undefined ? `${r.date}:${r.kind}:${r.rule || 'none'}:${r.at || ''}:${r.reason || ''}` : r.dedupe);
  }
  return rows.length;
};
const auditRows = async (userId, accountId = null) => (accountId == null
  ? await H.D.db.prepare('SELECT * FROM guardrail_events WHERE user_id=? ORDER BY id').all(userId)
  : await H.D.db.prepare('SELECT * FROM guardrail_events WHERE user_id=? AND account_id=? ORDER BY id').all(userId, accountId));
const analytics = (u, query = '') => u.req('/analytics' + query, undefined, 'GET');
const ruleBreaksOf = (payload) => (payload && payload.rule_breaks) || {};
module.exports = { ...H, m12, shipped, audit, auditRows, analytics, ruleBreaksOf, snapshotOf, M12_VERSION, port: () => M112_SUPPORT.port() };
