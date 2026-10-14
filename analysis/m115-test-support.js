'use strict';
/**
 * M115 test support: the M13 harness plus the four things only the rep count needs — the app's own
 * strategy/trade/journal/settings routes used as the fixture writers (so a rep is created the way the
 * product creates one and no probe can pass on a row shape the app would never write), the UTC day
 * helpers the count is denominated in, and a reader for the payload's `challenge` key.
 */
/* The M12/M111 harness writes its summary to M111_RESULT; accept M115_RESULT as well so a probe can
 * be run directly without the runner having to know which milestone's harness is underneath. */
if (process.env.M115_RESULT && !process.env.M111_RESULT) process.env.M111_RESULT = process.env.M115_RESULT;
const H = require('./m13-test-support');
const M115_VERSION = 'clean-reps-v1';
const challengeOf = (M) => !!(M && M.VERSION === M115_VERSION && typeof M.repOf === 'function' && typeof M.evaluate === 'function' && typeof M.inspect === 'function' && typeof M.startGuard === 'function');
/** The uniform parent-control opener; `false` on the committed parent, where the count is absent. */
const shipped = (M, what) => { H.ok(`this tree ships ${what} (the committed parent does not, and that absence is this probe's control)`, challengeOf(M)); return challengeOf(M); };

/** The UTC day an instant falls on, and the ISO instant `hours` before now. */
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const today = () => dayOf(Date.now());
const isoHoursAgo = (hours) => new Date(Date.now() - hours * 3600e3).toISOString();
const isoDaysAgo = (days, at = 'T09:00:00.000Z') => dayAgo(days) + at;
/** The UTC DAY KEY `days` ago — what a start/target declaration actually stores. */
const dayAgo = (days) => dayOf(Date.now() - days * 86400e3);

const settings = (u, body) => u.req('/settings', body, 'PUT');
const strategy = async (u, name, extra = {}) => {
  const r = await u.req('/strategies', { name, entry_rules: ['sweep'], exit_rules: ['target'], checklist: ['risk 1%'], risk_rules: '1% risk', ...extra });
  if (r.status !== 200) throw new Error('strategy create failed: ' + JSON.stringify(r.data));
  return Number(((r.data.strategy || r.data) || {}).id);
};
/** A closed trade through the app's own route: `strategy_id`, the checklist rows, the clocks. */
async function trade(u, accountId, { closedAt, net = 100, rMultiple = 1, strategyId = null, checks = [], symbol = 'M115X', ...rest } = {}) {
  const r = await u.req('/trades', {
    symbol, direction: 'long', status: 'closed', opened_at: closedAt, closed_at: closedAt,
    entry: 100, exit: 101, stop: 99, target: 103, size: 1, net_pnl: net, r_multiple: rMultiple, risk_amount: 100,
    setup_grade: 'A', account_id: accountId, ...(strategyId ? { strategy_id: strategyId } : {}), ...(checks.length ? { rule_checks: checks } : {}), ...rest,
  });
  if (r.status !== 200) throw new Error('trade create failed: ' + JSON.stringify(r.data));
  return r.data.trade || r.data;
}
/** The app's own journal acknowledgement, which computes and stores the hash the count re-reads. */
const journal = (u, tradeId, body = {}) => u.req(`/trades/${tradeId}/journal`, {
  emotion_before: 'calm', emotion_after: 'flat', execution_notes: 'What happened', lesson: 'What I would change', mistakes_none: true, ...body,
});
/**
 * The app's OWN execution review, which is the only writer of `stop_honoured` — the recorded decision
 * the clean criterion reads. The revision is computed with the app's own `fingerprint`, exactly as the
 * UI sends back the revision the server displayed, so the probe cannot record a decision the product
 * would refuse to store.
 */
async function execution(u, tradeId, { adherence = 4, stopHonoured = true } = {}) {
  const R = require(require('path').join(H.APP, 'src/execution-review'));
  const row = await H.D.db.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(tradeId, u.user.userId);
  const r = await u.req(`/trades/${tradeId}/execution-review`, { adherence, stop_honoured: stopHonoured, record_revision: R.fingerprint(row) });
  if (r.status !== 200) throw new Error('execution review failed: ' + JSON.stringify(r.data));
  return r.data.trade || r.data;
}
const challengeOfPayload = (payload) => (payload && payload.challenge) || {};
const analytics = (u, query = '') => u.req('/analytics' + query, undefined, 'GET');
const journalPayload = (u, query = '') => u.req('/journal' + query, undefined, 'GET');

module.exports = { ...H, challengeOf, shipped, settings, strategy, trade, journal, execution, analytics, challengeOfPayload, journalPayload, dayOf, today, dayAgo, isoHoursAgo, isoDaysAgo, M115_VERSION };
