'use strict';
/** M107 API probe: owned intention routes against a real HTTP server, real auth and real
 * SQL — the same-day pin, the revisioned record, the one refusal and the readonly history. */
const H = require('./m107-test-support'), { ok, start, finish, D } = H;
finish('M107 owned daily intention over actual HTTP/auth/SQL', async () => {
  const { user: u, other, req } = await start('intention-api');
  const mine = (q = '') => req('/intention?account_id=' + u.accountId + q, undefined, 'GET');

  let r = await mine();
  ok('a fresh account has no intention for today, not a failure', r.status === 200 && r.data.state === 'unrecorded' && r.data.day === '2026-10-13' && r.data.text === null, r.data.state);
  ok('the view publishes authority none and the saved templates', r.data.authority === 'none' && r.data.templates.length === 4 && r.data.templates[0].id === 'follow_plan', r.data.templates);
  const rev = r.data.revision;
  ok('the displayed revision is a 64-hex server receipt', typeof rev === 'string' && /^[a-f0-9]{64}$/.test(rev));

  r = await req('/intention?account_id=' + u.accountId, { template: 'follow_plan', revision: rev }, 'PUT');
  ok('recording a saved example is the day’s process intention', r.status === 200 && r.data.state === 'recorded' && r.data.template === 'follow_plan' && r.data.framing === 'process_template' && r.data.text === 'Today I follow my plan', r.data.state);
  ok('the record carries a server receipt and no score/percentage/permission', !!r.data.receipt && !('score' in r.data) && !('percent' in r.data) && r.data.authority === 'none');
  const revision1 = r.data.revision;
  ok('the day view keeps this day’s history rows', (r.data.history || []).length === 1 && r.data.history[0].version === 1, r.data.history);

  r = await req('/intention?account_id=' + u.accountId, { template: 'follow_plan', revision: revision1 }, 'PUT');
  ok('recording the identical choice again is a no-op, not a new version', r.status === 200 && r.data.history.length === 1 && r.data.revision === revision1, r.data.revision === revision1);

  r = await req('/intention?account_id=' + u.accountId, { intention: 'Today I will wait for the retest before entering', revision: revision1 }, 'PUT');
  ok('free text is stored verbatim and labelled unverified', r.status === 200 && r.data.text === 'Today I will wait for the retest before entering' && r.data.framing === 'unverified_free_text' && r.data.template === null, r.data.text);
  ok('free text keeps the app’s own cue warnings, not a verdict', (r.data.warnings || []).some((w) => w.startsWith('not_process_verified')), r.data.warnings);
  const revision2 = r.data.revision;

  r = await req('/intention?account_id=' + u.accountId, { intention: 'Today I will make $5,000 from the market', revision: revision2 }, 'PUT');
  ok('a money target is refused with its own code and nothing written', r.status === 400 && r.data.code === 'intention_outcome_target' && /outcome goal/.test(r.data.error), r.data);
  r = await mine();
  ok('the refused target left the recorded intention untouched', r.data.text === 'Today I will wait for the retest before entering' && r.data.history.length === 2, r.data.text);

  for (const [label, body] of [['template and text together', { template: 'follow_plan', intention: 'x', revision: revision2 }], ['neither', { revision: revision2 }], ['unknown template', { template: 'make_money', revision: revision2 }], ['missing revision', { template: 'no_revenge' }], ['caller day', { template: 'no_revenge', revision: revision2, day: '2026-10-14' }]]) {
    r = await req('/intention?account_id=' + u.accountId, body, 'PUT');
    ok('write contract refuses ' + label + ' with intention_invalid', r.status === 400 && r.data.code === 'intention_invalid', r.data.code);
  }
  r = await req('/intention?account_id=' + u.accountId, { template: 'no_revenge', revision: 'a'.repeat(64) }, 'PUT');
  ok('a stale displayed revision is 409 with nothing written', r.status === 409, r.status);
  r = await req('/intention?account_id=' + u.accountId, { template: 'no_revenge', revision: (await mine()).data.revision }, 'PUT');
  ok('reloading the displayed revision then saving succeeds', r.status === 200 && r.data.template === 'no_revenge', r.data.template);
  const revision3 = r.data.revision;

  r = await req('/intention?account_id=' + other.accountId, undefined, 'GET', other.token === undefined ? undefined : undefined);
  ok('another account id is not readable without its owner', r.status === 404, r.status);
  const foreign = await req('/intention?account_id=' + other.accountId, { template: 'follow_plan', revision: revision3 }, 'PUT');
  ok('a foreign account cannot be written with this session', foreign.status === 404, foreign.status);
  r = await req('/intention?account_id=' + u.accountId + '&date=2026-10-12', undefined, 'GET');
  ok('a past day is readonly and shows nothing was recorded then', r.status === 200 && r.data.day === '2026-10-12' && r.data.state === 'unrecorded' && r.data.same_day === false, r.data.state);
  ok('the past day points at nothing earlier and carries no later words', r.data.last_recorded === null && r.data.text === null, r.data.last_recorded);
  r = await req('/intention?account_id=' + u.accountId + '&date=2026-10-14', undefined, 'GET');
  ok('a future day is refused rather than faked as unrecorded', r.status === 400 && r.data.code === 'intention_invalid' && /future UTC day/.test(r.data.error), r.data);
  r = await req('/intention?account_id=' + u.accountId + '&date=13-10-2026', undefined, 'GET');
  ok('a malformed date is refused', r.status === 400 && r.data.code === 'intention_invalid', r.data.code);

  r = await req('/intention/history?account_id=' + u.accountId, undefined, 'GET');
  ok('the readonly history lists the revisions in order with authority none', r.status === 200 && r.data.records.length === 3 && r.data.readonly === true && r.data.authority === 'none' && r.data.records[0].version === 1, r.data.records.length);
  r = await req('/intention/history?account_id=' + u.accountId + '&date=2026-10-13', undefined, 'GET');
  ok('the history can be bounded to one day', r.data.records.length === 3);
  r = await req('/intention/history?account_id=' + other.accountId, undefined, 'GET');
  ok('history for a foreign account is refused', r.status === 404, r.status);

  const rows = await D.db.prepare('SELECT * FROM daily_intentions WHERE user_id=? ORDER BY id').all(u.userId);
  ok('the stored rows are this user’s own, human-declared and on the server day', rows.length === 3 && rows.every((x) => x.source === 'human_declared' && x.day === '2026-10-13' && x.account_key === u.accountId), rows.map((x) => [x.source, x.day]));
  ok('an outcome target never reaches storage as a framing', rows.every((x) => ['process_template', 'unverified_free_text', 'outcome_language'].includes(x.framing)) && rows.some((x) => x.framing === 'process_template'), rows.map((x) => x.framing));
  let threw = null; try { await D.db.prepare('UPDATE daily_intentions SET text=? WHERE id=?').run('Today I will make $5,000', rows[0].id); } catch (e) { threw = e.message; }
  ok('a recorded intention cannot be rewritten in place', /immutable/i.test(threw || ''), threw);
  await D.db.prepare('DELETE FROM daily_intentions WHERE user_id=?').run(u.userId);
  r = await mine();
  ok('with the rows gone the day is unrecorded again, not failed', r.data.state === 'unrecorded' && r.data.text === null);
});
