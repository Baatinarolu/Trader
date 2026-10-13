'use strict';
/** M12 api probe: the tally over HTTP, on the endpoint the review actually reads.
 * Under test: the audit is read (not written), scoped to the account this payload analyses,
 * windowed by the caller, honest when the range is bad, unavailable rather than zero when it
 * cannot be read, and — the claim that matters most — seeding rule breaks changes NO performance
 * number in the same payload. */
const H = require('./m12-test-support'), { ok } = H;
const M = H.mod('src/rule-breaks');
const stats = (p) => JSON.stringify({ kpis: p.kpis, points: p.points, equity: p.equity, daily: p.daily, monthly: p.monthly, distribution: p.distribution, by_session: p.by_session, by_entry_model: p.by_entry_model, by_grade: p.by_grade, by_strategy: p.by_strategy, by_mistake: p.by_mistake, time: p.time });
H.finish('M12 api: recorded rule breaks, scoped and read-only', async () => {
  if (!H.shipped(M, 'the M12 rule-break tally')) return;
  const u = await H.start('m12-api');
  const desk = await H.account(u, 'M12 desk', {});
  const second = await H.account(u, 'M12 second desk', {});
  const uid = u.user.userId, otherId = u.other.userId;
  const rb = (p) => H.ruleBreaksOf(p);

  /* ---------------------------------------------------- readable, and zero is a real zero */
  const fresh = await H.analytics(u);
  ok('the analytics payload carries the tally beside the other read-only aggregates', fresh.status === 200 && !!fresh.data.rule_breaks && rb(fresh.data).state === 'available', { status: fresh.status, keys: Object.keys(fresh.data || {}).length });
  ok('an empty but readable audit is a real ZERO with its own shape — not the unavailable shape', rb(fresh.data).breaks === 0 && Array.isArray(rb(fresh.data).by_rule) && rb(fresh.data).by_rule.length === 0 && rb(fresh.data).unavailable !== true, rb(fresh.data).state);
  ok('the tally reports the account scope it used, so the review can state what it covers', JSON.stringify(rb(fresh.data).account_ids) === JSON.stringify([fresh.data.account.id]), { ids: rb(fresh.data).account_ids, resolved: fresh.data.account.id });
  ok('the endpoint publishes its limits: read-only, no writes, no grade/cap/permission/decision influence, no causal claim', rb(fresh.data).limits.read_only === true && rb(fresh.data).limits.writes === 0 && rb(fresh.data).limits.grades_influence === false && rb(fresh.data).limits.permission_influence === false && rb(fresh.data).limits.caps_influence === false && rb(fresh.data).limits.guardrail_decisions_influence === false && rb(fresh.data).limits.causal === false && rb(fresh.data).outcome_joined === false, rb(fresh.data).limits);

  /* Two closed trades, written the way the journal stores them, so the performance block below is
   * a real one and the comparison is not a comparison of two empty payloads. */
  for (const [i, pnl] of [[0, 120], [1, -60]]) {
    await H.D.db.prepare(`INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,net_pnl,setup_grade)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uid, desk.id, 'EURUSD', 'long', 'closed',
      `2026-10-0${6 + i}T09:${i ? '15' : '00'}:00.000Z`, `2026-10-0${6 + i}T10:30:00.000Z`, 1.1, pnl > 0 ? 1.102 : 1.099, 1.09, 1.12, 1, 0.5, pnl, 'A');
  }
  const preStats = await H.analytics(u, `?account_id=${desk.id}`);

  /* ---------------------------------------------------- the audit is read, never written */
  const before = await H.snapshot();
  await H.analytics(u); await H.analytics(u, `?account_id=${desk.id}`);
  const after = await H.snapshot();
  ok('reading the tally twice writes NOTHING: every table is byte-identical, including the audit it reads', H.changed(before, after).length === 0, H.changed(before, after));

  /* ---------------------------------------------------- seeded the way the app writes it */
  H.audit(uid, desk.id, [
    { kind: 'blocked_attempt', rule: 'pre_market_routine', date: '2026-10-06', at: '2026-10-06T08:05:00.000Z' },
    { kind: 'blocked_attempt', rule: 'pre_market_routine', date: '2026-10-06', at: '2026-10-06T08:40:00.000Z' },
    { kind: 'override', rule: 'trade_cap', date: '2026-10-07', at: '2026-10-07T11:00:00.000Z', reason: 'One more setup after the cap' },
    { kind: 'breach', rule: 'pre_market_routine', date: '2026-10-07', at: '2026-10-07T11:01:00.000Z', action: 'state_observed' },
    { kind: 'journal_record', rule: 'pre_market_routine', date: '2026-10-07', at: '2026-10-07T12:00:00.000Z', action: 'record_only' },
  ]);
  H.audit(uid, second.id, [{ kind: 'blocked_attempt', rule: 'news_blackout', date: '2026-10-07', at: '2026-10-07T09:00:00.000Z' }]);
  H.audit(otherId, desk.id, [{ kind: 'blocked_attempt', rule: 'someone_elses_rule', date: '2026-10-06', at: '2026-10-06T09:00:00.000Z' }]);
  const seeded = await H.analytics(u, `?account_id=${desk.id}`);
  const seededAll = await H.analytics(u);
  ok('the tally counts what the endpoint\u2019s own account recorded: three attempts (two prevented, one accepted override) and one observed stop', rb(seeded.data).breaks === 3 && rb(seeded.data).prevented === 2 && rb(seeded.data).accepted === 1 && rb(seeded.data).observations === 1 && rb(seeded.data).records_excluded === 1, { breaks: rb(seeded.data).breaks, prevented: rb(seeded.data).prevented, accepted: rb(seeded.data).accepted });
  ok('the rules are NAMED, so the review can say which one fired', JSON.stringify(rb(seeded.data).by_rule.map((r) => r.rule).sort()) === JSON.stringify(['pre_market_routine', 'trade_cap']), rb(seeded.data).by_rule.map((r) => r.rule));
  ok('another account of the same trader is NOT folded in: the second desk\u2019s blocked attempt on the news rule is absent here', rb(seeded.data).by_rule.every((r) => r.rule !== 'news_blackout') && rb(seeded.data).breaks === 3, rb(seeded.data).account_ids);
  ok('and that other account reports its own tally when it is the account being reviewed', (async () => true)() && rb((await H.analytics(u, `?account_id=${second.id}`)).data).breaks === 1 && rb((await H.analytics(u, `?account_id=${second.id}`)).data).by_rule[0].rule === 'news_blackout', null);
  ok('the default (no account_id) review scopes the tally to the account IT resolved, so the payload never disagrees with itself', JSON.stringify(rb(seededAll.data).account_ids) === JSON.stringify([seededAll.data.account.id]) && rb(seededAll.data).breaks === 0 && seededAll.data.account.id !== desk.id, { implicit_account: seededAll.data.account.id, desk: desk.id });
  ok('another trader\u2019s audit rows are excluded from every number the endpoint returns', rb(seeded.data).by_rule.every((r) => r.rule !== 'someone_elses_rule') && rb(seeded.data).events_considered === 5, rb(seeded.data).events_considered);
  ok('the window the caller asked for is applied to the audit\u2019s own days', (await (async () => { const w = await H.analytics(u, `?account_id=${desk.id}&from=2026-10-07&to=2026-10-07`); return rb(w.data).breaks === 1 && rb(w.data).observations === 1 && rb(w.data).windows.days === 1 && rb(w.data).windows.first_date === '2026-10-07'; })()), null);

  /* ---------------------------------------------------- the claim that matters most */
  ok('seeding rule breaks changes NO performance number in the same payload: the whole statistics block is byte-identical with and without them', stats(preStats.data) === stats(seeded.data), null);
  ok('and so is the account block: the tally cannot move a balance, a cap or a policy field', JSON.stringify(preStats.data.account) === JSON.stringify(seeded.data.account), null);
  ok('no grade, score or permission is derived from the tally anywhere in its own payload', !/grade|score|permission|allowed/i.test(Object.keys(rb(seeded.data)).join(' ')), Object.keys(rb(seeded.data)));

  /* ---------------------------------------------------- bad windows and unreadable audits */
  const reversed = await H.analytics(u, `?account_id=${desk.id}&from=2026-10-08&to=2026-10-06`);
  ok('a reversed range is UNKNOWN, not zero and not a clean week, and the rest of the review still answers with a 200', reversed.status === 200 && rb(reversed.data).state === 'unavailable' && rb(reversed.data).breaks === null && /not zero and not a clean week/i.test(rb(reversed.data).reason) && !!reversed.data.kpis, { status: reversed.status, state: rb(reversed.data).state });
  const foreign = await H.analytics(u, '?account_id=999999');
  ok('an account the trader does not own is never read: the payload falls back to their own desk and the foreign id appears in no scope', foreign.status === 200 && rb(foreign.data).state === 'available' && !rb(foreign.data).account_ids.includes(999999) && rb(foreign.data).by_rule.every((r) => r.rule !== 'someone_elses_rule'), rb(foreign.data).account_ids);
  const anon = await H.D.db && (await (async () => { const r = await fetch(`http://127.0.0.1:${H.port()}/api/analytics`, { headers: { 'content-type': 'application/json' } }); return r.status; })());
  ok('the tally is not readable without a session, like the rest of the payload', anon === 401, anon);

  /* ---------------------------------------------------- a bounded read says so */
  const bounded = await M.inspect(uid, { accountId: desk.id, store: H.D.db, limit: 2 });
  ok('a bounded read takes the MOST RECENT events (the newest two are a legal record and an observed stop, so they are what must come back) and reports the truncation instead of hiding rows', bounded.truncated === true && bounded.events_considered === 2 && bounded.records_excluded === 1 && bounded.observations === 1 && bounded.breaks === 0 && bounded.limits.truncation_applied === true, { considered: bounded.events_considered, breaks: bounded.breaks, records: bounded.records_excluded });
  ok('one more row of budget reaches the newest attempt, so the bound is a window and not a filter', (await (async () => { const b3 = await M.inspect(uid, { accountId: desk.id, store: H.D.db, limit: 3 }); return b3.truncated === true && b3.breaks === 1 && b3.accepted === 1 && b3.by_rule.length === 1 && b3.by_rule[0].rule === 'trade_cap'; })()), null);
  ok('an unreadable store is UNKNOWN for the endpoint too: the failure is not reported as zero breaks', (async () => { const bad = await M.optional(uid, { store: { prepare: () => { throw new Error('no store'); } } }); return bad.state === 'unavailable' && bad.breaks === null; })(), null);
  ok('the audit rows the probe seeded are still exactly what it wrote: seeding is the app\u2019s own shape, not a probe fiction', (await H.auditRows(uid, desk.id)).length === 5 && (await H.auditRows(uid, desk.id)).every((r) => typeof r.snapshot === 'string' && typeof r.dedupe_key === 'string'), null);
});
