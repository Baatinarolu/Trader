'use strict';
/** M106 pure-policy probe: the four saved questions, the strict answer contract and
 * the derived state machine. No database, no HTTP — the module only. */
const H = require('./m106-test-support'), { ok, finish } = H, path = require('path');
let G; try { G = require(path.join(H.APP, 'src/state-gate')); } catch {}
const test = (l, v, d) => ok(l, !!G && v, d);
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const row = (over = {}) => ({ id: over.id || 1, source: 'human_declared', schema_version: G ? G.VERSION : 'state-gate-v1', account_key: 7, account_id: over.account_id === undefined ? 7 : over.account_id, version: 1, answers_json: JSON.stringify({ calm: true, clear: true, following_plan: true, would_take_if_up_big: true }), recorded_at: iso(NOW - 60000), historical_json: null, ...over });

finish('M106 four-question state-gate policy and answer contract', async () => {
  test('the four saved questions are exactly calm/clear/plan/would-take-if-up-big', JSON.stringify(G?.ANSWER_IDS) === JSON.stringify(['calm', 'clear', 'following_plan', 'would_take_if_up_big']) && G.QUESTIONS.every((q) => q.text.endsWith('?')), G?.ANSWER_IDS);
  test('basis refuses mental-state/score/edge claims', /not verified calmness/.test(G?.BASIS || '') && /never a pass/.test(G.BASIS) && /cannot reach a broker/.test(G.BASIS), G?.BASIS);

  for (const value of [true, false]) test('single answer '+value+' is not accepted as a whole answer set', (() => { try { G.answers(value); return false; } catch (e) { return e.code === 'state_gate_invalid'; } })());
  test('null is the explicit "not answered now"', G.answers(null) === null);
  const good = G.answers({ calm: true, clear: false, following_plan: true, would_take_if_up_big: true });
  test('a complete yes/no set is accepted verbatim', good.calm === true && good.clear === false);
  for (const [label, value] of [['missing one question', { calm: true, clear: true, following_plan: true }], ['extra key', { calm: true, clear: true, following_plan: true, would_take_if_up_big: true, mood: true }], ['non-boolean', { calm: 'yes', clear: true, following_plan: true, would_take_if_up_big: true }], ['null inside', { calm: null, clear: true, following_plan: true, would_take_if_up_big: true }], ['array', []], ['string', 'calm']]) {
    let code = null; try { G.answers(value); } catch (e) { code = e.code; }
    test('answer contract rejects '+label+' with no default/maybe', code === 'state_gate_invalid');
  }
  for (const [label, body] of [['missing revision', { answers: null }], ['short revision', { answers: null, revision: 'a'.repeat(63) }], ['caller clock', { answers: null, revision: 'a'.repeat(64), recorded_at: iso(NOW) }], ['caller source', { answers: null, revision: 'a'.repeat(64), source: 'human_declared' }], ['caller owner', { answers: null, revision: 'a'.repeat(64), user_id: 9 }], ['missing answers key', { revision: 'a'.repeat(64) }]]) {
    let code = null; try { G.input(body); } catch (e) { code = e.code; }
    test('write contract rejects '+label, code === 'state_gate_invalid');
  }
  test('write contract accepts displayed revision + explicit null', G.input({ answers: null, revision: 'a'.repeat(64) }).answers === null);

  const empty = G.evaluate([], 7, { nowMs: NOW });
  test('no answers at all is not_adopted, never passed', empty.state === 'not_adopted' && empty.allowed === false && empty.adopted === false, empty.state);
  const importedOnly = G.evaluate([row({ source: 'imported_unverified' })], 7, { nowMs: NOW });
  test('imported-only answers stay archives and never grant a pass', importedOnly.state === 'not_adopted' && importedOnly.imported_archives === 1 && importedOnly.allowed === false, importedOnly);

  const passed = G.evaluate([row()], 7, { nowMs: NOW });
  test('fresh all-yes answers are the only pass', passed.state === 'passed' && passed.allowed === true && passed.failed_questions.length === 0, passed.state);
  test('pass carries receipt/window/expiry and no money or score field', !!passed.receipt && passed.window_minutes === G.WINDOW_MIN && !!passed.expires_at && !('score' in passed) && !('net' in passed) && passed.broker_verified === false && passed.schema === G.VERSION, passed);

  const failed = G.evaluate([row({ answers_json: JSON.stringify({ calm: false, clear: true, following_plan: true, would_take_if_up_big: false }) })], 7, { nowMs: NOW });
  test('a recorded no fails the gate and names the questions', failed.state === 'failed' && failed.allowed === false && JSON.stringify(failed.failed_questions) === JSON.stringify(['calm', 'would_take_if_up_big']), failed);
  test('explicit unknown is unanswered, not a pass and not a failure', G.evaluate([row({ answers_json: null })], 7, { nowMs: NOW }).state === 'unanswered');

  const stale = G.evaluate([row({ recorded_at: iso(NOW - (G.WINDOW_MIN + 1) * 60000) })], 7, { nowMs: NOW });
  test('answers older than the APP window are stale, not permission', stale.state === 'stale' && stale.allowed === false && stale.age_minutes === G.WINDOW_MIN + 1, stale);
  const edge = G.evaluate([row({ recorded_at: iso(NOW - G.WINDOW_MIN * 60000) })], 7, { nowMs: NOW });
  test('the window edge is inclusive in the trader’s favour', edge.state === 'passed');
  const yesterday = G.evaluate([row({ recorded_at: iso(Date.UTC(2026, 9, 12, 23, 30)) })], 7, { nowMs: Date.UTC(2026, 9, 13, 0, 20) });
  test('an answer set never survives the UTC day boundary', yesterday.state === 'stale' && yesterday.allowed === false, yesterday.state);
  const future = G.evaluate([row({ recorded_at: iso(NOW + 60000) })], 7, { nowMs: NOW });
  test('a future/corrupt receipt cannot grant a pass', future.state === 'unavailable' && future.allowed === false);
  test('unreadable stored answers are unavailable, not a pass', G.evaluate([row({ answers_json: '{oops' })], 7, { nowMs: NOW }).state === 'unavailable');
  const corrupt = G.evaluate([row({ schema_version: 'state-gate-v0' })], 7, { nowMs: NOW });
  test('a foreign schema version is refused as unavailable', corrupt.state === 'unavailable', corrupt.state);

  const order = G.evaluate([row({ id: 1, recorded_at: iso(NOW - 3600000) }), row({ id: 2, version: 2, recorded_at: iso(NOW - 5000) })], 7, { nowMs: NOW });
  test('the last recorded answer set is the effective one', order.state === 'passed' && order.version === 2);
  const latestFails = G.evaluate([row({ id: 1 }), row({ id: 2, version: 2, recorded_at: iso(NOW - 5000), answers_json: JSON.stringify({ calm: false, clear: true, following_plan: true, would_take_if_up_big: true }) })], 7, { nowMs: NOW });
  test('a newer no is not overwritten by the older yes', latestFails.state === 'failed');

  const daily = { account_id: 7, status: 'clear', message: 'No personal stop.', breaches: [], permission: { allowed: true, state: 'clear' }, evaluated_at: iso(NOW) };
  test('not_adopted is reported, never silently upgraded into a block', G.apply(daily, empty).status === 'clear' && G.apply(daily, empty).state_gate.state === 'not_adopted');
  const blocked = G.apply(daily, failed);
  test('a failed gate becomes the same kind of stop the personal guardrails produce', blocked.status === 'stop' && blocked.permission.allowed === false && blocked.permission.can_override === false && blocked.breaches.at(-1).rule === 'state_gate_failed', blocked.message);
  test('the refusal message is the gate’s own and cannot reach a broker', /you do not trade yet/.test(blocked.message) && /cannot reach a broker/.test(blocked.message) === false, blocked.message);
  const adoptedMissing = G.apply(daily, G.evaluate([row({ answers_json: null })], 7, { nowMs: NOW }));
  test('an adopted account with no fresh check is refused with its own rule', adoptedMissing.status === 'stop' && adoptedMissing.breaches.at(-1).rule === 'state_gate_unanswered');
  const staleApplied = G.apply(daily, stale);
  test('stale answers refuse with the stale rule rather than pretending to pass', staleApplied.status === 'stop' && staleApplied.breaches.at(-1).rule === 'state_gate_stale');
  test('the market daily object is not mutated in place', daily.status === 'clear' && daily.breaches.length === 0);
  test('equal answers yield identical evaluations', JSON.stringify(G.evaluate([row()], 7, { nowMs: NOW })) === JSON.stringify(G.evaluate([row()], 7, { nowMs: NOW })));
  test('unavailable() claims neither a pass nor a block', G.unavailable().state === 'unavailable' && G.unavailable().allowed === false && /not a pass/.test(G.unavailable().message));
  test('publicRow refuses a wrong-kind or wrong-owner row without inventing answers', G.publicRow(row({ account_id: 8, account_key: 7 })).state === 'unavailable');
});
