'use strict';
/** M107 consumers probe: the app's own day surfaces (dashboard briefing and the Journal
 * day) show the day's intention, and the intention is deliberately NOT a permission:
 * it never reaches guardrail snapshots, admission, sizing or journal text. */
const H = require('./m107-test-support'), { ok, start, finish, D } = H;
const entry = (u, p = {}) => ({ account_id: u.accountId, symbol: 'DECLARED_STOCK', direction: 'long', status: 'open', exit: null, opened_at: '2026-10-13T11:00:00.000Z', entry: 100, stop: 99, target: 102, size: 100, fees: 0, setup_grade: 'B', adherence: 5, emotion_before: 'Calm and following the plan', ...p });

finish('M107 intention on the day surfaces, with no permission authority', async () => {
  const { user: u, req } = await start('intention-consumers');
  await H.prepare(u, 20);

  let brief = await req('/briefing?account_id=' + u.accountId, undefined, 'GET');
  ok('the dashboard briefing carries today’s intention object', brief.status === 200 && brief.data.intention && brief.data.intention.day === '2026-10-13' && brief.data.intention.authority === 'none', brief.data.intention);
  ok('an intent-free day is reported as unrecorded, not as a failure or a gate', brief.data.intention.state === 'unrecorded' && brief.data.intention.text === null, brief.data.intention.state);
  const statusBefore = brief.data.daily && brief.data.daily.status;

  const v = (await req('/intention?account_id=' + u.accountId, undefined, 'GET')).data;
  let r = await req('/intention?account_id=' + u.accountId, { template: 'a_plus_only', revision: v.revision }, 'PUT');
  ok('the day’s intention is recorded through the owned route', r.status === 200 && r.data.template === 'a_plus_only', r.data.template);

  brief = await req('/briefing?account_id=' + u.accountId, undefined, 'GET');
  ok('the briefing now reports the recorded day with its words and framing', brief.data.intention.state === 'recorded' && brief.data.intention.text === 'Today I will take only A+ setups' && brief.data.intention.framing === 'process_template', brief.data.intention.text);
  ok('recording an intention changes no daily permission or guardrail state', (brief.data.daily && brief.data.daily.status) === statusBefore && !JSON.stringify(brief.data.daily || {}).includes('intention'), { before: statusBefore, after: brief.data.daily && brief.data.daily.status });

  const day = await req('/journal/2026-10-13?account_id=' + u.accountId, undefined, 'GET');
  ok('the Journal day carries the day’s own intention', day.status === 200 && day.data.daily_intention && day.data.daily_intention.day === '2026-10-13' && day.data.daily_intention.text === 'Today I will take only A+ setups', day.data.daily_intention);
  const past = await req('/journal/2026-10-12?account_id=' + u.accountId, undefined, 'GET');
  ok('an earlier day shows nothing recorded and borrows no later words', past.status === 200 && past.data.daily_intention.state === 'unrecorded' && past.data.daily_intention.text === null && past.data.daily_intention.same_day === false, past.data.daily_intention.state);

  /* Regression lock: the journal day surface answered a day that has not happened long
   * before M107 existed (M85 journal-core/journal-ui). The embedded intention read must
   * therefore refuse the day inside the payload — explicitly unavailable, never a thrown
   * 400/500 and never a fabricated empty day. */
  const future = await req('/journal/2026-10-14?account_id=' + u.accountId, undefined, 'GET');
  ok('the journal day still answers a day that has not happened, with the intention explicitly unavailable', future.status === 200 && future.data.daily_intention.state === 'unavailable' && future.data.daily_intention.text === null && /not a past-or-today UTC calendar day/.test(future.data.daily_intention.message || ''), { status: future.status, state: future.data.daily_intention && future.data.daily_intention.state });

  const before = await req('/trades', entry(u), 'POST');
  ok('the inherited live-entry path is unchanged by the intention', before.status === 200 && before.data.trade && before.data.trade.guardrail_snapshot, before.status);
  const snapshot = JSON.parse(before.data.trade.guardrail_snapshot);
  ok('the guardrail snapshot records the state gate but never an intention authority', !('intention' in snapshot) && !JSON.stringify(snapshot).includes('a_plus_only'), Object.keys(snapshot));
  const breaches = await D.db.prepare('SELECT kind,reason,snapshot FROM guardrail_events WHERE user_id=?').all(u.userId);
  ok('no guardrail event is created by an intention and none mentions its words', !breaches.some((b) => /intention|a_plus_only/i.test([b.kind, b.reason, b.snapshot].join(' '))), breaches.map((b) => b.kind));

  const posted = await req('/journal', { account_id: u.accountId, entry_date: '2026-10-13', tomorrow: 'Watch the retest tomorrow', lessons: 'Process first' }, 'POST');
  ok('the nightly reflection that already owns “tomorrow” still records', posted.status === 200, posted.status);
  const dayAfter = await req('/journal/2026-10-13?account_id=' + u.accountId, undefined, 'GET');
  ok('the intention never overwrote the journal day’s own text fields', dayAfter.data.entry && dayAfter.data.entry.tomorrow === 'Watch the retest tomorrow' && dayAfter.data.daily_intention.text === 'Today I will take only A+ setups', dayAfter.data.entry && dayAfter.data.entry.tomorrow);
  const row = await D.db.prepare('SELECT * FROM journal_entries WHERE user_id=? AND entry_date=?').get(u.userId, '2026-10-13');
  ok('the journal row itself carries no intention column or copied intention', row && row.tomorrow === 'Watch the retest tomorrow' && !('intention' in row), row && Object.keys(row).filter((k) => /intention/i.test(k)));

  const list = await req('/trades?account_id=' + u.accountId, undefined, 'GET');
  ok('trades are returned without any intention decoration or permission', list.status === 200 && !JSON.stringify(list.data).includes('a_plus_only'), list.status);
  const hist = await req('/intention/history?account_id=' + u.accountId, undefined, 'GET');
  ok('the readonly history is the only place the words are replayed, with authority none', hist.data.records.length === 1 && hist.data.authority === 'none' && hist.data.readonly === true, hist.data.records.length);
});
