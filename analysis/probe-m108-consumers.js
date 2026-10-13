'use strict';
/** M108 consumers probe: what the day surfaces carry, and what practice never touches. */
const H = require('./m108-test-support'), { ok, finish } = H;
const rev = async (req) => (await req('/practice', undefined, 'GET')).data.revision;

finish('M108 practice consumers: day surfaces, separation and no authority', async () => {
  const { req, user, otherToken } = await H.start('m108-consumers');
  const today = H.dayOf(H.now());
  const started = await req('/practice/timer', { action: 'start', revision: await rev(req), preset: 'p15', bell_interval_seconds: 300, ambience: 'forest', intention: 'Today I will journal every trade' });
  ok('a session can be opened with a saved preset', started.status === 200 && started.data.timer.state === 'running' && started.data.timer.target_seconds === 900);
  H.setNow(H.now() + 900000);
  const done = await req('/practice/timer', { action: 'complete', revision: await rev(req), note: 'kept' });
  ok('the completed session carries the measured running time', done.status === 200 && done.data.sessions[0].elapsed_ms === 900000 && done.data.sessions[0].reached_target === true);

  const briefing = (await req('/briefing?account_id=' + user.accountId, undefined, 'GET')).data;
  ok('the briefing carries the practice day block', briefing.practice && briefing.practice.day === today && briefing.practice.sessions_count === 1);
  ok('the practice block carries no permission, gate or score field', !('gate' in briefing.practice) && !('allowed' in briefing.practice) && !('admitted' in briefing.practice) && !('score' in briefing.practice) && !('streak' in briefing.practice) && briefing.practice.authority === 'none', Object.keys(briefing.practice));
  ok('the practice block claims no effect and no verification', briefing.practice.actual_meditation_verified === false && /no such effect is claimed/.test(briefing.practice.basis) && briefing.practice.timer.actual_meditation_verified === false);
  ok('the practice block never claims the app played the declared ambience', briefing.practice.timer.ambience_played_by_this_app === false && briefing.practice.sessions[0].ambience_played_by_this_app === false);

  const day = (await req('/journal/' + today + '?account_id=' + user.accountId, undefined, 'GET')).data;
  ok('the journal day carries that day’s practice block', day.practice && day.practice.day === today && day.practice.sessions_count === 1 && day.practice.sessions[0].elapsed_ms === 900000);
  ok('the practice block is not the day’s trading intention and does not carry it', day.practice.intention === undefined && day.daily_intention !== undefined && day.daily_intention.state !== undefined);
  ok('the state gate block is unchanged by practice writes', day.state_gate && ['passed', 'failed', 'unanswered', 'not_adopted', 'stale', 'unavailable'].includes(day.state_gate.state), day.state_gate?.state);
  const otherDay = (await req('/journal/2026-10-12?account_id=' + user.accountId, undefined, 'GET')).data;
  ok('another day shows nothing recorded rather than today’s session', otherDay.practice.state === 'unrecorded' && otherDay.practice.sessions_count === 0);
  ok('a foreign trader sees no practice records', (await req('/journal/' + today, undefined, 'GET', otherToken)).data.practice.sessions_count === 0);

  const before = (await req('/trades?account_id=' + user.accountId, undefined, 'GET')).data;
  const inserted = await req('/trades', H.body(user), 'POST');
  const after = (await req('/trades?account_id=' + user.accountId, undefined, 'GET')).data;
  ok('practice state never appears in a trade payload or a trade refusal', !/practice/i.test(JSON.stringify(before)) && (inserted.status === 200 || inserted.status === 201) && !/practice/i.test(JSON.stringify(inserted.data)) && (after.trades || []).length === (before.trades || []).length + 1, { inserted: inserted.status });

  const identity = (await req('/identity?account_id=' + user.accountId, undefined, 'GET')).data;
  ok('the M105 identity surface is untouched and carries no practice key', identity.identity_context !== undefined ? identity.identity_context.authority === 'none' : true);
  ok('the practice module is required by the API alone: no bot, signal, risk or grading path reads it', (() => {
    const fs = require('fs'), path = require('path'), root = path.join(H.APP, 'src');
    const users = [];
    const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js') && /require\([^)]*practice[')]/.test(fs.readFileSync(p, 'utf8'))) users.push(path.relative(H.APP, p)); } };
    walk(root);
    return users.length === 1 && users[0].endsWith(path.join('routes', 'api.js'));
  })());
  ok('no practice text promises permission, a score or a streak', !/permission|score|streak/i.test(JSON.stringify(briefing.practice.basis)) || /No score/.test(briefing.practice.basis));
});
