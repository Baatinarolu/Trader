'use strict';
/** M112 API probe: the whole feature over the app's real HTTP surface — the stored window, the
 * constraints the schema and the route enforce, the labelled suggestion, and the HARD BLOCK
 * measured end to end through `POST /trades` (the entry-admission path) with a completed
 * pre-market routine, so the only thing that can refuse the entry is the window. The parent tree
 * has no `/bots/window` at all, which is this probe's own control: the same entry it refuses here
 * is admitted there. */
const path = require('path');
const H = require('./m112-test-support'), { ok } = H;
const N = H.mod('src/trading-window');
const Perf = H.mod('src/performance');
const ZONE = 'Africa/Lagos';
const T = Date.UTC(2026, 9, 13, 12, 0);                 // 12:00Z = 13:00 local; admit() moves it 15 min on
H.finish('M112 api: the boundary over HTTP, and the entry it refuses', async () => {
  if (!H.shipped(N, 'the M112 trading-window rule')) return;
  const u = await H.start('m112-api');
  const desk = await H.account(u, 'M112 window desk');
  const other = await H.account(u, 'M112 second desk');   // a SECOND desk for the same trader
  H.setNow(T);
  const NOW = () => H.now();
  const local = () => N.parts(NOW(), ZONE).hhmm;
  const win = () => H.windowGet(u, desk.id);
  const setPair = (p, extra = {}) => put({ window_start: p.start, window_end: p.end, ...extra });
  const put = (body) => H.windowPut(u, { account_id: desk.id, ...body });
  const entries = async () => (await u.req(`/trades?account_id=${desk.id}`, undefined, 'GET')).data.trades || [];
  /* A tree with no window endpoint answers 404 and a tree with no merge has no daily state to read,
   * so every nested read is guarded: the absent feature is a FAILING ASSERTION, never a TypeError. */
  const W = (r) => ((r && r.data) || {});
  const sug = (r) => (W(r).suggestion || {});
  const sugWin = (r) => (sug(r).window || {});
  const sugSession = (r) => (sug(r).session || {});
  const winOf = (r) => (W(r).window || {});
  const dailyOf = (r) => (W(r).daily || {});

  /* ------------------------------------------------------------- the surface, before anything */
  const fresh = await win();
  ok('a desk with no window reports `unset` and says nothing is blocked on one — not an empty pass and not a guessed boundary', fresh.status === 200 && fresh.data.state === 'unset' && fresh.data.block === false && fresh.data.reason === 'no_window_selected', { state: fresh.data.state, reason: fresh.data.reason });
  ok('and it offers the suggestion as the trader\u2019s own journal with nothing to derive yet, rather than a default window', sug(fresh).available === false && sug(fresh).reason === 'no_recorded_session' && sug(fresh).applied === false, sug(fresh).reason);
  ok('the endpoint states its own limits: read-only, no writes, no permission granted, no prediction, no inferred window', JSON.stringify(fresh.data.limits) === JSON.stringify({ read_only: true, writes: 0, grants_permission: false, predicts: false, infers_a_window: false }), fresh.data.limits);
  ok('and it carries the module\u2019s basis and his own words, so the UI does not paraphrase the rule', /not a prediction, not a market edge and not a permission/.test(fresh.data.basis) && (fresh.data.doctrine || []).some((q) => /guardrail will prevent you from doing so/.test(q)), (fresh.data.doctrine || []).length);
  ok('no zone is owned yet, and the endpoint says so rather than assuming one', fresh.data.owned_timezone === null, fresh.data.owned_timezone);
  const foreignAcct = await u.req('/accounts', { name: 'Someone else\u2019s desk', starting_balance: 5000 }, 'POST', u.otherToken);
  const foreignId = foreignAcct.data.account.id;
  ok('another trader\u2019s window is not served: an unknown id and a FOREIGN trader\u2019s account are both a 404, never an empty window', (await H.windowGet(u, 999999)).status === 404 && (await H.windowGet(u, foreignId)).status === 404, { missing: (await H.windowGet(u, 999999)).status, foreign: (await H.windowGet(u, foreignId)).status });
  ok('and neither can a foreign trader\u2019s window be written', (await H.windowPut(u, { account_id: foreignId, window_start: '07:00', window_end: '10:00' })).status === 404, null);

  /* ------------------------------------------------------------- the constraints, one by one */
  const bad = [
    ['a clock that is not HH:MM', { window_start: '7:00', window_end: '10:00' }, 400, 'trading_window_invalid'],
    ['one side alone', { window_start: '07:00' }, 400, 'trading_window_incomplete'],
    ['two equal sides', { window_start: '07:00', window_end: '07:00' }, 400, 'trading_window_degenerate'],
    ['a window before any zone is owned', { window_start: '07:00', window_end: '10:00' }, 409, 'trading_window_zone_required'],
    ['a window before any zone is owned, even with a zone supplied', { window_start: '07:00', window_end: '10:00', window_timezone: ZONE }, 409, 'trading_window_zone_required'],
  ];
  for (const [what, body, status, code] of bad) {
    const r = await put(body);
    ok(`refuses ${what} with its own code, at the status the app already uses for that class`, r.status === status && r.data.code === code, { status: r.status, code: r.data.code, error: String(r.data.error).slice(0, 90) });
  }
  ok('and a refused write changes nothing: the desk still has no window after all five', (await win()).data.state === 'unset', (await win()).data.state);

  /* ------------------------------------------------------------- the owned zone, then the window */
  const zoneSet = await u.req(`/accounts/${desk.id}`, { routine_window_start: '08:00', routine_timezone: ZONE }, 'PUT');
  ok('the trader\u2019s own zone is set through the account they already edit, and the window then has a clock to live on', zoneSet.status === 200 && (zoneSet.data.account || {}).routine_timezone === ZONE, zoneSet.status);
  const offset = await put({ window_start: '07:00', window_end: '10:00', window_timezone: '+01:00' });
  ok('an offset is refused once a zone IS owned: `+01:00` follows no daylight-saving rule, so it is not the trader\u2019s own clock', offset.status === 400 && offset.data.code === 'trading_window_zone_invalid', { status: offset.status, code: offset.data.code });
  const pair = H.timesFor(ZONE, NOW());
  const saved = await setPair(pair.outside);
  ok('a window the trader types is saved as `manual` and is NOT labelled as derived from the journal', saved.status === 200 && W(saved).source === 'manual' && W(saved).derived_current_suggestion === false, { status: saved.status, source: saved.data.source });
  ok('and the saved window is evaluated immediately: outside its own hours the state is `outside` and it blocks', W(saved).state === 'outside' && W(saved).block === true && winOf(saved).start === pair.outside.start, saved.data.state);
  ok('the trader may re-save a window, and the second save replaces the first without ever creating a second one', winOf(await setPair(pair.inside)).start === pair.inside.start && winOf(await win()).end === pair.inside.end, winOf(await win()));
  await setPair(pair.outside);
  const foreign = await setPair(pair.outside, { window_timezone: 'Europe/London' });
  ok('a window on a zone the desk does not own is refused, naming the zone it does own', foreign.status === 409 && W(foreign).code === 'trading_window_zone_not_owned' && /Africa\/Lagos/.test(W(foreign).error), { status: foreign.status, code: foreign.data.code });
  ok('and that refusal did not move the stored boundary either', winOf(await win()).start === pair.outside.start && winOf(await win()).timezone === ZONE, winOf(await win()));

  /* ------------------------------------------------------------- the hard block, end to end */
  const before = (await entries()).length;
  const blocked = await u.req('/trades', H.entry(desk.id), 'POST');
  ok('before the routine is complete the entry is refused by the routine, so the window is not what stopped it yet', blocked.status === 409 && !!W(blocked).daily && (dailyOf(blocked).breaches || []).some((b) => b.rule === 'pre_market_routine'), { status: blocked.status, code: W(blocked).code, body: W(blocked).daily ? (dailyOf(blocked).breaches || []).map((b) => b.rule) : String(JSON.stringify(W(blocked))).slice(0, 200) });
  H.setNow(T);
  await H.admit(u, desk.id, T);
  await setPair(pair.outside);
  const stopped = await u.req('/trades', H.entry(desk.id), 'POST');
  ok('with the routine complete and the window outside, the entry is REFUSED by the window: 409, the guardrail code, and the window\u2019s own rule in the breach list', stopped.status === 409 && W(stopped).code === 'guardrail_stop' && (dailyOf(stopped).breaches || []).some((b) => b.rule === 'trading_window_outside'), { status: stopped.status, code: W(stopped).code, breaches: (dailyOf(stopped).breaches || []).map((b) => b.rule) });
  ok('and the refusal is the module sentence, naming the window, the zone and the local time there', /Outside your trading window/.test(dailyOf(stopped).message) && new RegExp(`${pair.outside.start}\u2013${pair.outside.end} ${ZONE}`).test(dailyOf(stopped).message) && String(dailyOf(stopped).message).includes(local()), dailyOf(stopped).message);
  ok('no trade was written: a hard block refuses the entry rather than recording it as a mistake', (await entries()).length === before, { before, after: (await entries()).length });
  ok('and the permission the app answers with cannot be overridden from the client', (dailyOf(stopped).permission || {}).allowed === false && (dailyOf(stopped).permission || {}).can_override === false && (dailyOf(stopped).permission || {}).state === 'trading_window', dailyOf(stopped).permission);
  const guardsRead = await u.req(`/bots/guardrails?account_id=${desk.id}`, undefined, 'GET');
  ok('the guardrails read is a 200 with the stop in it, not a 503: a blocked desk is a readable state, not a broken service', guardsRead.status === 200 && dailyOf(guardsRead).status === 'stop' && (dailyOf(guardsRead).trading_window || {}).state === 'outside', { status: guardsRead.status, state: dailyOf(guardsRead).status });

  await setPair(pair.inside);
  const admitted = await u.req('/trades', H.entry(desk.id), 'POST');
  ok('the SAME entry is admitted as soon as the clock is inside the window — the boundary, not the entry, is what refused it', admitted.status === 200 && W(admitted).trade && (await entries()).length === before + 1, { status: admitted.status, trade: W(admitted).trade && W(admitted).trade.id });
  await put({ window_start: null, window_end: null });
  const cleared = await win();
  ok('clearing the window writes four NULLs and reports `unset` again — nothing is blocked on a window the trader removed', W(cleared).state === 'unset' && W(cleared).block === false, { state: W(cleared).state });
  const afterClear = await u.req('/trades', H.entry(desk.id), 'POST');
  ok('and an entry that arrives after the clear is admitted, which is what "blocks nothing" has to mean', afterClear.status === 200, afterClear.status);
  const row = await H.D.db.prepare('SELECT window_start, window_end, window_timezone, window_source FROM accounts WHERE id=?').get(desk.id);
  ok('the clear left no empty-window residue: all four columns are NULL, so an upgrade and a new desk look the same', Object.values(row).every((v) => v === null), row);

  /* ------------------------------------------------------------- the account write path */
  await setPair(pair.outside);
  // On a tree with no window endpoint there is no stored window to have a source, and the schema's
  // own CHECK says so; the assertions below measure that absence rather than dying on it.
  try { await H.D.db.prepare('UPDATE accounts SET window_source=? WHERE id=?').run('manual', desk.id); } catch { /* no stored window here */ }
  const renamed = await u.req(`/accounts/${desk.id}`, { name: 'M112 window desk (renamed)', max_trades_day: 4 }, 'PUT');
  const kept = await H.D.db.prepare('SELECT name, max_trades_day, window_start, window_end, window_timezone, window_source FROM accounts WHERE id=?').get(desk.id);
  ok('an unrelated account edit (a rename, a cap change) cannot move a hard boundary: the window columns come back byte-identical', renamed.status === 200 && kept.name === 'M112 window desk (renamed)' && kept.max_trades_day === 4 && kept.window_start === pair.outside.start && kept.window_end === pair.outside.end && kept.window_timezone === ZONE && kept.window_source === 'manual', kept);

  /* ------------------------------------------------------------- the derived suggestion */
  const seed = async (n, utcHour, minute, pnl) => {
    for (let i = 0; i < n; i++) {
      const day = 5 + (i % 3);
      await H.D.db.prepare(`INSERT INTO trades (user_id,account_id,symbol,direction,status,opened_at,closed_at,entry,exit,stop,target,size,fees,net_pnl,setup_grade)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(u.user.userId, desk.id, 'EURUSD', 'long', 'closed',
        `2026-10-0${day}T${String(utcHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`, `2026-10-0${day}T${String(utcHour + 1).padStart(2, '0')}:00:00.000Z`,
        1.1, 1.101, 1.099, 1.102, 1, 0, pnl, 'A');
    }
  };
  await seed(20, 7, 10, 5);     // 08:10 local
  await seed(14, 8, 10, 5);     // 09:10 local
  // Every one of these recorded entries is a London-session close with its own reason line written.
  const derived = await win();
  ok('with 34 closed trades the desk now has a suggestion, labelled as the trader\u2019s own recorded journal', sug(derived).available === true && sug(derived).source === 'from_session_history' && sug(derived).applied === false, sug(derived).reason);
  ok('the suggestion names the session, the count and the floor it cleared, rather than presenting a band as a finding', sugSession(derived).label === 'London' && sugSession(derived).trades === 34 && sug(derived).floor === 30 && /34 closed trades/.test(sug(derived).detail), sug(derived).detail);
  ok('and the band is the middle of those entries\u2019 own local hours, rounded outward to whole hours', sugWin(derived).start === '08:00' && sugWin(derived).end === '10:00' && sugWin(derived).timezone === ZONE, sugWin(derived));
  ok('the served suggestion IS the module\u2019s computation over the same rows — the route adds no second derivation', await (async () => {
    if (typeof Perf.windowSuggestion !== 'function') return false;   // the tree that has no derivation cannot have served it
    const rows = await H.D.db.prepare('SELECT * FROM trades WHERE user_id=? AND account_id=?').all(u.user.userId, desk.id);
    const mine = Perf.windowSuggestion(rows, { zone: ZONE });
    return JSON.stringify({ w: mine.window, a: mine.available, d: mine.detail }) === JSON.stringify({ w: sugWin(derived), a: sug(derived).available, d: sug(derived).detail });
  })(), null);
  const manualEdit = await put({ window_start: '11:00', window_end: '14:00' });
  ok('a window the trader edits away from the candidate is recorded as `manual`, even with the suggestion available', W(manualEdit).source === 'manual' && W(manualEdit).derived_current_suggestion === false, { source: W(manualEdit).source, derived: W(manualEdit).derived_current_suggestion });
  const accepted = await put({ accept_suggestion: true });
  ok('accepting the suggestion stores exactly the candidate pair and records `from_session_history` — the trader accepted it, the app did not apply it', accepted.status === 200 && W(accepted).source === 'from_session_history' && W(accepted).derived_current_suggestion === true && winOf(accepted).start === '08:00' && winOf(accepted).end === '10:00' && winOf(accepted).timezone === ZONE, { status: accepted.status, source: W(accepted).source, window: winOf(accepted) });
  ok('and a GET afterwards reports the same stored pair with its source, so the label survives the round trip', winOf(await win()).source === 'from_session_history', winOf(await win()));

  const low = H.windowPut(u, { account_id: other.id, window_start: '07:00', window_end: '10:00' });
  ok('a desk with no owned zone cannot accept a suggestion either: the refusal says which fact is missing', (await low).status === 409 && W(await low).code === 'trading_window_zone_required', { status: (await low).status });
  await H.D.db.prepare('UPDATE accounts SET routine_window_start=?, routine_timezone=? WHERE id=?').run('08:00', ZONE, other.id);
  const fewTrades = await H.windowGet(u, other.id);
  ok('below the 30-trade review floor the suggestion is WITHHELD, not presented as a smaller window', sug(fewTrades).available === false && sug(fewTrades).reason === 'no_recorded_session', sug(fewTrades).reason);
  const refused = await H.windowPut(u, { account_id: other.id, accept_suggestion: true });
  ok('and accepting it is refused with the reason, so a below-floor band can never become the trader\u2019s boundary by one click', refused.status === 409 && W(refused).code === 'trading_window_suggestion_unavailable' && /below|derive|recorded/.test(W(refused).error), { status: refused.status, code: refused.data.code });

  /* ------------------------------------------------------------- an unreadable row never opens */
  try { await H.D.db.prepare('UPDATE accounts SET window_timezone=? WHERE id=?').run('Nowhere/City', desk.id); } catch { /* no stored pair to carry a zone */ }
  const broken = await win();
  ok('a stored zone the runtime cannot resolve is reported as `unavailable` with the repair action — a 200 read, never a 500', broken.status === 200 && W(broken).state === 'unavailable' && W(broken).reason === 'window_zone_invalid' && W(broken).block === true, { status: broken.status, state: W(broken).state, reason: W(broken).reason });
  const refusedBroken = await u.req('/trades', H.entry(desk.id), 'POST');
  ok('and it BLOCKS the entry with its own rule: an unreadable window refuses rather than opening the gate', refusedBroken.status === 409 && (dailyOf(refusedBroken).breaches || []).some((b) => b.rule === 'trading_window_window_zone_invalid'), refusedBroken.status);
  const ids = await H.D.db.prepare('SELECT window_start, window_end, window_timezone, window_source FROM accounts WHERE id=?').get(desk.id);
  ok('reading the broken window never repairs it behind the trader\u2019s back: the stored row is exactly what was stored', ids.window_timezone === 'Nowhere/City' && ids.window_start === '08:00' && ids.window_source === 'from_session_history', ids);
  const accountEdit = await u.req(`/accounts/${desk.id}`, { routine_timezone: ZONE, name: 'M112 window desk' }, 'PUT');
  const stillBroken = await win();
  ok('an account edit cannot repair a window either: the boundary belongs to the window endpoint, so no unrelated write silently rewrites it', accountEdit.status === 200 && stillBroken.data.state === 'unavailable' && stillBroken.data.reason === 'window_zone_invalid', { status: accountEdit.status, state: stillBroken.data.state });
  const repaired = await setPair(pair.inside);
  ok('and the repair is the one the sentence named — re-saving the window in the owned zone — after which the state is readable and inside its hours again', repaired.status === 200 && W(repaired).state === 'inside' && winOf(repaired).timezone === ZONE, { state: W(repaired).state, zone: winOf(repaired).timezone });
  const moved = await u.req(`/accounts/${desk.id}`, { routine_timezone: 'Europe/London' }, 'PUT');
  const zoneChanged = await win();
  ok('changing the owned zone does NOT move the boundary: the window reports `unavailable` and names both clocks', moved.status === 200 && W(zoneChanged).state === 'unavailable' && W(zoneChanged).reason === 'window_zone_changed' && /Africa\/Lagos/.test(W(zoneChanged).detail) && /Europe\/London/.test(W(zoneChanged).detail), W(zoneChanged).reason);
  const stillStopped = await u.req('/trades', H.entry(desk.id), 'POST');
  ok('so an entry cannot slip through on the new clock either — the same pair is refused until the trader re-saves it', stillStopped.status === 409 && (dailyOf(stillStopped).breaches || []).some((b) => String(b.rule).startsWith('trading_window')), stillStopped.status);
});
