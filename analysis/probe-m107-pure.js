'use strict';
/** M107 pure-policy probe: the saved process rule, the bounded classifier, the same-day
 * contract and the derived state. No database, no HTTP — the module only. */
const H = require('./m107-test-support'), { ok, finish } = H, path = require('path');
let G; try { G = require(path.join(H.APP, 'src/intention')); } catch {}
const test = (l, v, d) => ok(l, !!G && v, d);
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const row = (over = {}) => ({ id: over.id || 1, source: 'human_declared', schema_version: G ? G.VERSION : 'intention-v1', account_key: 7, account_id: over.account_id === undefined ? 7 : over.account_id, day: '2026-10-13', version: 1, template_id: 'follow_plan', text: 'Today I follow my plan', framing: 'process_template', cues_json: JSON.stringify({ sentences: 1, money_target_sentences: 0, outcome_language: false, prediction_language: false, control_language: true, chars: 23 }), recorded_at: iso(NOW - 60000), historical_json: null, ...over });
const refuse = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

finish('M107 daily process intention policy and classifier', async () => {
  test('the four saved examples are verbatim and each is one sentence', G?.TEMPLATES.length === 4 && JSON.stringify(G.TEMPLATES.map((t) => t.text)) === JSON.stringify(['Today I follow my plan', 'Today I will take only A+ setups', 'Today I will journal every trade', 'Today I will not revenge trade']), G?.TEMPLATES);
  test('the examples are behavioural and within control (no money, no prediction)', G.TEMPLATES.every((t) => !/\d|\$|%|will (rise|fall|go)/i.test(t.text)));
  test('basis refuses gate/score/verification claims', /Not a readiness gate/.test(G?.BASIS || '') && /no permission/.test(G.BASIS) && /never proof that the intention was followed/.test(G.BASIS), G?.BASIS);

  test('the worked counter-example “make $5,000 today” is refused with its own code', refuse(() => G.classify('Today I’m going to make $5,000 from the market')) === 'intention_outcome_target');
  test('an outcome percentage target is refused', refuse(() => G.classify('I will make 5% today')) === 'intention_outcome_target');
  test('a negated money sentence is process language, not a target', refuse(() => G.classify('Today I will not turn a $500 loss into a revenge trade')) === null);
  test('an outcome without an amount is flagged, not refused', G.classify('Today I will have a green day').framing === 'outcome_language' && G.classify('Today I will have a green day').cues.outcome_language === true);
  test('a market prediction is flagged as unverified, never as a plan', G.classify('The market will rise today').framing === 'outcome_language' && G.classify('The market will rise today').cues.prediction_language === true);
  test('free process text is stored unverified rather than labelled process-oriented', G.classify('Today I will wait for the retest before entering').framing === 'unverified_free_text' && /not_process_verified/.test(G.classify('Today I will wait for the retest before entering').warnings.join(' ')));
  test('two sentences warn but are kept', /multiple_sentences/.test(G.classify('Today I follow my plan. And journal every trade').warnings.join(' ')));
  test('the cues are the app’s own measurements, not a verdict', (() => { const c = G.classify('Today I will wait for the retest before entering').cues; return c.sentences === 1 && c.money_target_sentences === 0 && c.chars === 48 && c.control_language === true; })(), G.classify('Today I will wait for the retest before entering').cues);

  test('one single-line sentence up to the character cap is accepted', G.text('Today I follow my plan') === 'Today I follow my plan' && G.CHAR_MAX === 120);
  for (const [label, value] of [['empty', ''], ['whitespace', '   '], ['too long', 'x'.repeat(121)], ['multi-line', 'a\nb'], ['non-string', 5]]) test('text contract rejects ' + label, refuse(() => G.text(value)) === 'intention_invalid');

  test('a template id is stored as the saved example, framed as such', (() => { const i = G.input({ template: 'no_revenge', revision: 'a'.repeat(64) }); return i.framing === 'process_template' && i.text === 'Today I will not revenge trade'; })());
  test('free text is framed unverified, never process_template', G.input({ intention: 'Today I will wait for the retest', revision: 'a'.repeat(64) }).framing === 'unverified_free_text');
  test('choosing a template and writing text at once is refused', refuse(() => G.input({ template: 'follow_plan', intention: 'x', revision: 'a'.repeat(64) })) === 'intention_invalid');
  test('neither a template nor text is refused', refuse(() => G.input({ revision: 'a'.repeat(64) })) === 'intention_invalid');
  test('an unknown template id is refused', refuse(() => G.input({ template: 'make_money', revision: 'a'.repeat(64) })) === 'intention_invalid');
  for (const [label, body] of [['missing revision', { template: 'follow_plan' }], ['short revision', { template: 'follow_plan', revision: 'a'.repeat(63) }], ['caller day', { template: 'follow_plan', revision: 'a'.repeat(64), day: '2026-10-14' }], ['caller clock', { template: 'follow_plan', revision: 'a'.repeat(64), recorded_at: iso(NOW) }], ['caller source', { template: 'follow_plan', revision: 'a'.repeat(64), source: 'human_declared' }], ['caller owner', { template: 'follow_plan', revision: 'a'.repeat(64), user_id: 9 }]]) test('write contract rejects ' + label, refuse(() => G.input(body)) === 'intention_invalid');

  const empty = G.evaluate([], 7, { nowMs: NOW });
  test('no record for the day is unrecorded, not a failure and never carried over', empty.state === 'unrecorded' && empty.text === null && empty.last_recorded === null && empty.authority === 'none', empty.state);
  const yesterdayOnly = G.evaluate([row({ day: '2026-10-12', recorded_at: iso(Date.UTC(2026, 9, 12, 12)) })], 7, { nowMs: NOW });
  test('an earlier day’s intention is reported as history only, never as today’s', yesterdayOnly.state === 'unrecorded' && yesterdayOnly.last_recorded?.day === '2026-10-12' && yesterdayOnly.text === null);
  const recorded = G.evaluate([row()], 7, { nowMs: NOW });
  test('a recorded template is the day’s intention with its receipt', recorded.state === 'recorded' && recorded.template === 'follow_plan' && !!recorded.receipt && recorded.same_day === true, recorded);
  test('the record carries no score, percentage, net or permission field', !('score' in recorded) && !('percent' in recorded) && !('net' in recorded) && !('allowed' in recorded) && recorded.authority === 'none' && recorded.broker_verified === false);
  const free = G.evaluate([row({ template_id: null, text: 'Today I will wait for the retest', framing: 'unverified_free_text' })], 7, { nowMs: NOW });
  test('free text keeps its unverified warning in the day view', free.framing === 'unverified_free_text' && /not_process_verified/.test(free.warnings.join(' ')));
  const outcome = G.evaluate([row({ template_id: null, text: 'Today I will have a green day', framing: 'outcome_language' })], 7, { nowMs: NOW });
  test('outcome-framed words are recorded as unverified rather than rewritten', outcome.state === 'recorded' && outcome.framing === 'outcome_language' && /outcome_language/.test(outcome.warnings.join(' ')));

  const day = G.evaluate([row({ day: '2026-10-12', recorded_at: iso(Date.UTC(2026, 9, 12, 12)) })], 7, { nowMs: NOW, date: '2026-10-12' });
  test('a historical day shows exactly that day’s record, read-only', day.state === 'recorded' && day.same_day === false && day.day === '2026-10-12');
  const badDate = G.evaluate([], 7, { nowMs: NOW, date: '13-10-2026' });
  test('an invalid requested date claims nothing', badDate.state === 'unavailable' && badDate.text === null);
  const futureDay = G.evaluate([], 7, { nowMs: NOW, date: '2026-10-14' });
  test('a day that has not happened cannot be read as one that did', futureDay.state === 'unavailable' && futureDay.text === null && /future UTC day/.test(futureDay.message));
  const future = G.evaluate([row({ day: '2026-10-13', recorded_at: iso(NOW + 60000) })], 7, { nowMs: NOW });
  test('a future/corrupt receipt cannot claim that day was recorded', future.state === 'unavailable' && future.text === null);
  test('a foreign schema version is unavailable, not silently re-read', G.evaluate([row({ schema_version: 'intention-v0' })], 7, { nowMs: NOW }).state === 'unavailable');
  const imported = G.evaluate([row({ source: 'imported_unverified' })], 7, { nowMs: NOW });
  test('imported words never become the account’s recorded intention', imported.state === 'unrecorded' && imported.imported_archives === 1);
  test('the newest record for the day wins', G.evaluate([row({ id: 1, text: 'Today I follow my plan' }), row({ id: 2, version: 2, template_id: 'no_revenge', text: 'Today I will not revenge trade', recorded_at: iso(NOW - 1000) })], 7, { nowMs: NOW }).template === 'no_revenge');
  test('a template row whose stored text was tampered with is unavailable', G.publicRow(row({ text: 'Today I will make $5,000' })).state === 'unavailable');
  test('an imported archive never claims a pass, a day or a score', G.publicRow(row({ source: 'imported_unverified' })).state === 'imported_unverified' && G.publicRow(row({ source: 'imported_unverified' })).warnings.join(' ').includes('imported_unverified'));
  test('equal records yield identical evaluations', JSON.stringify(G.evaluate([row()], 7, { nowMs: NOW })) === JSON.stringify(G.evaluate([row()], 7, { nowMs: NOW })));
  test('unavailable() claims neither a record nor a failure', G.unavailable().state === 'unavailable' && G.unavailable().text === null && /not a block/.test(G.unavailable().message));
  const row7 = G.publicRow(row({ account_id: 8, account_key: 7 }));
  test('publicRow refuses a wrong-owner row without inventing words', row7.state === 'unavailable' && row7.text === null);
});
