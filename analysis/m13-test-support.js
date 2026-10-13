'use strict';
/**
 * M13/M65 test support: the M12 harness plus the three things only this milestone needs — a way to
 * write CLOSED trades with an exact `closed_at` (so a bucket boundary is a fact and not a
 * coincidence of the run date), a way to write a saved review artifact the way the app's own
 * `period-reviews.save()` writes it, and readers for both.
 *
 * The artifact writer mirrors the real INSERT (every column, the same `human_review` source and the
 * same `metrics_json` shape) rather than inventing a row the app would never store: a probe that
 * passes on a row shape the app does not write proves nothing about the coverage read.
 */
/* The M12/M111 harness writes its summary to M111_RESULT; accept M13_RESULT as well so a probe can
 * be run directly without the runner having to know which milestone's harness is underneath. */
if (process.env.M13_RESULT && !process.env.M111_RESULT) process.env.M111_RESULT = process.env.M13_RESULT;
const H = require('./m12-test-support');
const M13_VERSION = 'periods-v1';
const COVERAGE_VERSION = 'review-coverage-v1';
const periodsOf = (M) => !!(M && M.VERSION === M13_VERSION && typeof M.period === 'function' && typeof M.bucketOf === 'function' && typeof M.sequence === 'function');
const coverageOf = (M) => !!(M && M.COVERAGE_VERSION === COVERAGE_VERSION && typeof M.coverageOf === 'function' && typeof M.coverageOptional === 'function');
/** The uniform parent-control opener; `false` on the committed parent, where both are absent. */
const shipped = (M, what) => { H.ok(`this tree ships ${what} (the committed parent does not, and that absence is this probe's control)`, periodsOf(M)); return periodsOf(M); };

/** A closed trade with an exact UTC close instant, inserted with the columns the app writes. */
async function close(u, accountId, { symbol = 'M13X', closedAt, openedAt, net = 100, r = 1, risk = 100, fees = 0, grade = 'A', direction = 'long' } = {}) {
  const row = await H.D.db.prepare(`INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,setup_grade,net_pnl,r_multiple,risk_amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(u.user.userId, accountId, symbol, direction, 'closed', openedAt || closedAt, closedAt, 100, 101, 99, 103, 1, fees, grade, net, r, risk);
  return Number(row.lastInsertRowid);
}

/** A saved review artifact, written the way `period-reviews.save()` writes it. */
async function review(u, accountId, kind, start, { status = 'completed', source = 'human_review', focus = 'Declared focus for the period', version = 1, metrics = null, recordedAt = '2026-10-13T09:00:00.000Z', answers = { worked_and_why: 'Declared honest answer' } } = {}) {
  const R = require(require('path').join(H.APP, 'src/period-reviews'));
  const range = R.canonical(kind, start);
  const financial = metrics || { basis: 'seeded for the coverage read', closed_trades: 0, known_net_subtotal: 0 };
  const row = await H.D.db.prepare(`INSERT INTO period_reviews (user_id,account_id,account_key,period_kind,period_start,period_end,version,template_version,status,answers_json,focus,followup_json,metrics_json,context_hash,source,recorded_at,amendment)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(u.user.userId, accountId, accountId, kind, range.start, range.end, version, R.VERSION, status, JSON.stringify(answers), focus, null,
    JSON.stringify({ financial, period: range, policy: { period_finished: range.end <= '2026-10-13' } }), 'a'.repeat(64), source, recordedAt, null);
  return Number(row.lastInsertRowid);
}

const analytics = (u, query = '') => u.req('/analytics' + query, undefined, 'GET');
const reviewPeriodsOf = (payload) => (payload && payload.review_periods) || {};
/** Every table's rows, for the "a read changes nothing" digests. */
const digests = async (tables) => {
  const out = {};
  for (const t of tables) out[t] = JSON.stringify(await H.D.db.prepare('SELECT * FROM ' + t + ' ORDER BY 1').all());
  return out;
};
const tablesOf = async () => (await H.D.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).map((r) => r.name);

module.exports = { ...H, periodsOf, coverageOf, shipped, close, review, analytics, reviewPeriodsOf, digests, tablesOf, M13_VERSION, COVERAGE_VERSION };
