'use strict';
/** M106 portable probe: backup/restore of the four-question history across owners and
 * accounts. Restored copies must be visible, own-account, clock-preserving archives
 * that can never pass, never fail and never block the receiving trader. */
const H = require('./m106-test-support'), { ok, start, finish, D } = H;
const YES = { calm: true, clear: true, following_plan: true, would_take_if_up_big: true };
const ALL_NO = { calm: false, clear: false, following_plan: false, would_take_if_up_big: false };
const entry = (u, p = {}) => ({ account_id: u.accountId, symbol: 'DECLARED_STOCK', direction: 'long', status: 'open', exit: null, opened_at: '2026-10-13T11:00:00.000Z', entry: 100, stop: 99, target: 102, size: 100, fees: 0, setup_grade: 'B', adherence: 5, emotion_before: 'Calm and following the plan', ...p });

finish('M106 answer-history portability without permission transfer', async () => {
  const { user: u, other, req, otherToken } = await start('state-gate-portable');
  await H.prepare(u, 20); await H.prepare(other, 20);

  let v = (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data;
  await req('/state-gate?account_id=' + u.accountId, { answers: YES, revision: v.revision }, 'PUT');
  v = (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data;
  await req('/state-gate?account_id=' + u.accountId, { answers: null, revision: v.revision }, 'PUT');
  v = (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data;
  const failing = await req('/state-gate?account_id=' + u.accountId, { answers: ALL_NO, revision: v.revision }, 'PUT');
  ok('the source account ends on a recorded no with the exact receipt retained', failing.data.state === 'failed' && failing.data.version === 3, failing.data.state);
  const backup = (await req('/export/json', undefined, 'GET')).data.state_gate_answers;
  ok('the backup carries all three versions with receipts and no verification claim', backup.version === 1 && backup.records.length === 3 && backup.records.every((x) => x.broker_verified === false && x.source === 'human_declared' && !!x.recorded_at), backup.records.map((x) => x.version));

  let r = await req('/import/json', { trades: [H.body(other, { entry: 100, exit: 101 })], state_gate_answers: backup }, 'POST', otherToken);
  ok('restoring into another owner keeps the finance import legal while the gate history becomes archives', r.status === 200 && r.data.inserted === 1 && Array.isArray(r.data.state_gate_warnings), r.data.state_gate_warnings);
  const dest = (await req('/state-gate?account_id=' + other.accountId, undefined, 'GET', otherToken)).data;
  ok('imported answers never become a pass on the receiving account', dest.state === 'not_adopted' && dest.allowed === false && dest.adopted === false, dest.state);
  ok('the receiving account is told how many unverified archives it holds', dest.imported_archives === 3, dest.imported_archives);
  const destHistory = (await req('/state-gate/history?account_id=' + other.accountId, undefined, 'GET', otherToken)).data.records;
  ok('every restored row is labelled imported_unverified and owned by the receiving account', destHistory.length === 3 && destHistory.every((x) => x.source === 'imported_unverified' && x.account_key === other.accountId && x.account_id === other.accountId), destHistory.map((x) => [x.source, x.account_key]));
  ok('the original receipts survive as history, not as borrowed evidence of the receiving trader', destHistory.map((x) => x.historical.recorded_at).join(',') === backup.records.map((x) => x.recorded_at).join(',') && destHistory.every((x) => x.historical.source === 'human_declared'), destHistory.map((x) => x.historical.recorded_at));
  ok('an imported all-no history does not block the receiving trader either', (await req('/trades', entry(other), 'POST', otherToken)).status === 200);
  const source = (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data;
  ok('the source account keeps its own recorded no and its own history untouched by the restore', source.state === 'failed' && source.version === 3 && (await req('/trades', entry(u), 'POST')).status === 409, source.state);

  r = await req('/state-gate?account_id=' + other.accountId, { answers: YES, revision: dest.revision }, 'PUT', otherToken);
  ok('the receiving trader’s own fresh answers are the only thing that can pass their own account', r.status === 200 && r.data.state === 'passed' && r.data.imported_archives === 3, r.data.state);
  ok('the receiving trader’s live entry is then admitted normally', (await req('/trades', entry(other), 'POST', otherToken)).status === 200);

  const malformed = [
    ['not an object', false],
    ['wrong version', { version: 2, records: [] }],
    ['records not a list', { version: 1, records: 'bad' }],
    ['more than 500 records', { version: 1, records: Array(501).fill({}) }],
    ['three of four answers', { version: 1, records: [{ account_id: other.accountId, answers: { calm: true, clear: true, following_plan: true }, source: 'human_declared', recorded_at: '2026-10-01T10:00:00.000Z', version: 1 }] }],
    ['non-boolean answers', { version: 1, records: [{ account_id: other.accountId, answers: { calm: 'yes', clear: true, following_plan: true, would_take_if_up_big: true }, version: 1 }] }],
    ['future original clock', { version: 1, records: [{ account_id: other.accountId, answers: YES, source: 'human_declared', recorded_at: '2030-01-01T00:00:00.000Z', version: 1 }] }],
    ['marked unavailable', { version: 1, records: [], unavailable_records: 2 }],
  ];
  for (const [label, payload] of malformed) {
    const out = await req('/import/json', { trades: [H.body(other, { entry: 100, exit: 101 })], state_gate_answers: payload }, 'POST', otherToken);
    ok('malformed/unavailable optional history only warns while the financial import stays legal: ' + label, out.status === 200 && Number(out.data.inserted) >= 1 && out.data.state_gate_warnings?.length > 0, { status: out.status, warnings: out.data.state_gate_warnings });
  }
  const afterWarnings = (await req('/state-gate?account_id=' + other.accountId, undefined, 'GET', otherToken)).data;
  const archives = (await req('/state-gate/history?account_id=' + other.accountId, undefined, 'GET', otherToken)).data.records.filter((x) => x.source === 'imported_unverified');
  ok('no malformed payload can change the receiving trader’s own state or their first-party history', afterWarnings.state === 'passed' && afterWarnings.version === 4 && afterWarnings.imported_archives === 4, { state: afterWarnings.state, version: afterWarnings.version, archives: afterWarnings.imported_archives });
  ok('a future original receipt is archived without a clock, never relabelled with the receiving clock', archives.filter((x) => !x.historical.recorded_at).length === 1 && archives.filter((x) => !!x.historical.recorded_at).length === 3, archives.map((x) => x.historical.recorded_at));
  const rows = await D.db.prepare('SELECT source,COUNT(*) n FROM state_gate_answers GROUP BY source').all();
  ok('every stored row is either a first-party answer or a labelled archive', rows.every((x) => ['human_declared', 'imported_unverified'].includes(x.source)), rows);
  ok('a missing optional history is not an error at all', (await req('/import/json', { trades: [H.body(other, { entry: 100, exit: 100 })] }, 'POST', otherToken)).data.state_gate_warnings.length === 0);
});
