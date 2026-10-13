'use strict';
/** M112 consumers probe: what the merged state DOES on the surfaces that already read it. The
 * window must arrive as the same kind of stop the personal guardrails produce (so the entry
 * admission path, the scan path and the audit trail refuse through code that was already
 * measured), it must never hide a stop that was already there, and `unset` must be measurably
 * nothing. The account, its zone and the completed pre-market routine come through the app's own
 * endpoints; only the window columns are written directly, so the derivation is measured against a
 * journal the probe knows exactly. */
const path = require('path');
const H = require('./m112-test-support'), { ok } = H;
const N = H.mod('src/trading-window');
const B = require(path.join(H.APP, 'src/bots'));
const Cor = B.correction, Guards = require(path.join(H.APP, 'src/bots/guardrails'));
const T = Date.UTC(2026, 9, 13, 12, 0);                 // 13:00 Africa/Lagos
const ZONE = 'Africa/Lagos';
const setWindow = (id, s, e, zone = ZONE, source = 'manual') => H.D.db.prepare('UPDATE accounts SET window_start=?, window_end=?, window_timezone=?, window_source=? WHERE id=?').run(s, e, zone, source, id);
H.finish('M112 consumers: the same stop, the same admission path', async () => {
  if (!H.shipped(N, 'the M112 trading-window rule')) return;
  const u = await H.start('m112-consumers');
  const desk = await H.account(u, 'M112 desk', { routine_window_start: '08:00', routine_timezone: ZONE });
  const idle = await H.account(u, 'M112 idle desk', { routine_window_start: '08:00', routine_timezone: ZONE });
  H.setNow(T);
  const uid = u.user.userId;
  /* The instant is always the frozen clock the app itself reads (the same one the routine was
   * completed on), because the routine's own step provenance is validated against it. */
  const daily = (id, nowMs = H.now()) => Cor.dailyState(uid, { accountId: id, entryTf: '5m', forEntry: true, nowMs });
  const windowBreaches = (d) => ((d && d.breaches) || []).filter((b) => String(b.rule).startsWith('trading_window'));
  /* A tree that never merges the window has no `trading_window` on the daily object at all, so every
   * read of it is guarded: the absent merge is a FAILING ASSERTION, never a TypeError. */
  const tw = (d) => ((d && d.trading_window) || {});

  await H.admit(u, desk.id, T);
  const clean = await daily(desk.id);
  ok('with the routine complete and no window selected the desk is clear — so every refusal below is the window', clean.status === 'clear' && windowBreaches(clean).length === 0 && tw(clean).state === 'unset', { status: clean.status, tw: tw(clean).state });

  /* ------------------------------------------------------------ outside: a hard block */
  await setWindow(desk.id, '07:00', '10:00');
  const out = await daily(desk.id);
  ok('a window that cannot contain the trader\u2019s local time produces the SAME kind of stop the personal guardrails produce', out.status === 'stop' && out.permission.allowed === false && out.permission.can_override === false && out.permission.state === 'trading_window', out.permission);
  ok('and the breach names the rule rather than a generic stand-down', windowBreaches(out).length === 1 && windowBreaches(out)[0].rule === 'trading_window_outside' && windowBreaches(out)[0].trading_window === true, out.breaches.map((b) => b.rule));
  ok('the state is published on the daily object every consumer already reads, beside the breaches', tw(out).state === 'outside' && (tw(out).window || {}).start === '07:00' && (tw(out).window || {}).local_time === '13:15', out.trading_window);
  ok('the message is the module sentence, so the UI and the refusal cannot drift apart', out.message === 'Stand down: ' + tw(out).detail && /Outside your trading window/.test(out.message), out.message);

  const calls = [];
  const op = async (store, d) => { calls.push(d); return { id: 999, saved: 1 }; };
  let thrown = null;
  try { await Guards.admit(uid, { accountId: desk.id, entryTf: '5m', nowMs: H.now(), action: 'entry' }, op); } catch (e) { thrown = e; }
  ok('the entry-admission path REFUSES it: 409, the guardrail code, and the operation never runs (no trade is written)', thrown && thrown.status === 409 && thrown.code === 'guardrail_stop' && calls.length === 0, { status: thrown && thrown.status, code: thrown && thrown.code, ran: calls.length });
  let overridden = null;
  try { await Guards.admit(uid, { accountId: desk.id, entryTf: '5m', nowMs: H.now(), overrideReason: 'I really want this one', action: 'entry' }, op); } catch (e) { overridden = e; }
  ok('and an override reason cannot open it, because the window sets can_override false', overridden && overridden.code === 'guardrail_stop' && (overridden.daily.permission || {}).can_override === false && calls.length === 0, { code: overridden && overridden.code, can_override: overridden && (overridden.daily.permission || {}).can_override, ran: calls.length });
  const evs = await H.D.db.prepare("SELECT * FROM guardrail_events WHERE account_id=? AND kind='blocked_attempt' ORDER BY id DESC").all(desk.id);
  ok('the refusal is AUDITED with the window in the snapshot, so the trader can see which boundary stopped which attempt', evs.length >= 1 && JSON.parse(evs[0].snapshot).trading_window.state === 'outside' && /trading_window_outside/.test(evs[0].snapshot), evs.length);

  /* ------------------------------------------------------------ an existing stop survives */
  const idleOut = await daily(idle.id);      // no routine completed on this desk
  ok('a desk whose routine is incomplete is stopped by its own rule, and the window is not needed to explain it', idleOut.status === 'stop' && (idleOut.breaches || []).some((b) => b.rule === 'pre_market_routine'), idleOut.breaches.map((b) => b.rule));
  ok('without a window that stop is overridable with a stated reason — the routine is a stop the trader may answer for', idleOut.permission.can_override === true, idleOut.permission);
  await setWindow(idle.id, '07:00', '10:00');
  const both = await daily(idle.id);
  ok('with the window outside as well, BOTH rules are in the breach list — the window appends, it never replaces', (both.breaches || []).some((b) => b.rule === 'pre_market_routine') && windowBreaches(both).length === 1 && both.breaches.length === idleOut.breaches.length + 1, both.breaches.map((b) => b.rule));
  ok('and the window is the stricter rule: an overridable routine stop becomes non-overridable once the boundary is crossed', both.permission.can_override === false && both.permission.state === 'trading_window', both.permission);
  let idleThrown = null;
  try { await Guards.admit(uid, { accountId: idle.id, entryTf: '5m', nowMs: H.now(), overrideReason: 'Routine skipped deliberately', action: 'entry' }, op); } catch (e) { idleThrown = e; }
  ok('so the stated reason no longer admits the entry, and the refusal still names the routine as well as the window', idleThrown && idleThrown.code === 'guardrail_stop' && idleThrown.daily.breaches.length === 2 && /Outside your trading window/.test(idleThrown.message), idleThrown && idleThrown.message);

  /* ------------------------------------------------------------ inside, and derived per read */
  await setWindow(desk.id, '12:00', '15:00');   // 12:00-15:00 local contains the 13:15 local clock
  const inside = await daily(desk.id);
  ok('a window that CONTAINS the local time blocks nothing at all — it is a boundary, not a permission', inside.status === 'clear' && windowBreaches(inside).length === 0 && tw(inside).state === 'inside', { status: inside.status, tw: tw(inside).state });
  const admitted = await Guards.admit(uid, { accountId: desk.id, entryTf: '5m', nowMs: H.now(), action: 'entry' }, op);
  ok('and the same call that was refused a moment ago now admits the entry', admitted && admitted.id === 999 && calls.length === 1 && calls[0].admission.state === 'admitted', { calls: calls.length, state: calls[0] && calls[0].admission.state });
  // A window that wraps midnight, read at two instants of the SAME stored row.
  await setWindow(desk.id, '22:00', '02:00');   // 22:00-02:00 local
  const now1 = await daily(desk.id);
  const later = await daily(desk.id, Date.UTC(2026, 9, 13, 22, 0));   // 23:00 local, inside the wrap
  ok('the state is DERIVED from the stored window and the clock on every read: the same row is outside at 13:15 local and inside the wrap at 23:00 local', tw(now1).state === 'outside' && windowBreaches(now1).length === 1 && tw(later).state === 'inside' && windowBreaches(later).length === 0 && later.status === 'clear', { now: tw(now1).state, later: tw(later).state, later_status: later.status });
  const afterMidnight = await daily(desk.id, Date.UTC(2026, 9, 14, 0, 30));   // 01:30 local, the far side of the same wrap
  const atTheEnd = await daily(desk.id, Date.UTC(2026, 9, 14, 1, 0));           // 02:00 local — the end minute itself
  ok('and the wrapped window is ONE boundary: `inside` at 01:30 the far side of midnight, and the end minute is OUTSIDE it', tw(afterMidnight).state === 'inside' && tw(atTheEnd).state === 'outside', { far_side: tw(afterMidnight).state, end_minute: tw(atTheEnd).state });
  const back = await daily(desk.id);
  ok('and reading it again at the frozen clock refuses again — nothing was cached and nothing decayed', tw(back).state === 'outside' && back.status === 'stop', tw(back).state);

  /* ------------------------------------------------------------ unset, and the scan path */
  await setWindow(desk.id, '07:00', '10:00');
  await setWindow(desk.id, null, null, null, null);
  const none = await daily(desk.id);
  ok('clearing the window (four NULLs) blocks nothing, and the daily is what it was before any window existed', none.status === 'clear' && windowBreaches(none).length === 0 && tw(none).state === 'unset' && (none.breaches || []).length === (clean.breaches || []).length, { status: none.status, tw: tw(none).state });
  await setWindow(desk.id, '07:00', '10:00');
  const blocked = await daily(desk.id);
  const setups = { candidates: [{ ok: true, action: 'BUY', grade: 'A', market_ok: true, action_market: 'BUY', no_trade: [] }], verdict: { action: 'BUY', dir: 1 } };
  const applied = Guards.applyToSetups(setups, blocked);
  ok('the scan path turns the same state into NO TRADE on the candidate, with the market read preserved beside it', applied.candidates[0].ok === false && applied.candidates[0].market_ok === true && applied.candidates[0].personal_blocked === true && applied.verdict.action === 'NO TRADE' && applied.verdict.dir === 0, applied.candidates[0]);
  ok('and it says WHY in the candidate\u2019s own no-trade list, prefixed as a personal guardrail rather than a market fact', applied.candidates[0].no_trade.some((t) => /^Personal guardrail: Stand down: Outside your trading window/.test(t)), applied.candidates[0].no_trade);
  ok('the permission it publishes is the window\u2019s own stop, so a client renders the personal state rather than re-deriving it', applied.execution_permission.allowed === false && applied.execution_permission.can_override === false && applied.execution_permission.state === 'trading_window', applied.execution_permission);
  ok('and the action permission that accompanies a recorded action keeps its scope note, so nothing here is broker permission', (() => { const p = Guards.actionPermission(blocked); return p.allowed === false && p.scope === 'personal rules for this recorded action only, not broker execution or future permission'; })(), null);

  /* ------------------------------------------------------ consumer 2: the desk playlist */
  /* The window rides the SAME daily object the playlist already reads, so the surface that tells the
   * trader what to do now refuses it too — measured here rather than re-derived in the view. */
  const Now = require(path.join(H.APP, 'src/bots/now'));
  const series = H.bars().slice(-260);
  const smc = H.smc().analyse(series, { tf: '15m', now: series[series.length - 1].t, swingMode: 'bos', nested: true });
  const playlistIn = { symbol: 'EURUSD', tf: '15m', nowMs: series[series.length - 1].t, td: {}, setups: {}, news: null, quote: null,
    series: { candles: series, atr: smc.atr, price: series[series.length - 1].c, smc } };
  const playOutside = Now.build({ ...playlistIn, daily: blocked });
  const playInside = Now.build({ ...playlistIn, daily: inside });
  const playQuiet = Now.build({ ...playlistIn, daily: clean });
  const windowText = (p) => JSON.stringify([p.guards || [], p.headline || '', p.execution_permission || {}]);
  ok('the desk playlist publishes the window\u2019s own stop rather than a second opinion about it: the SAME input is allowed when the clock is inside and refused when it is outside', (playOutside.execution_permission || {}).state === 'trading_window' && playOutside.execution_permission.allowed === false && playOutside.execution_permission.can_override === false && (playInside.execution_permission || {}).allowed === true, { outside: playOutside.execution_permission, inside: playInside.execution_permission });
  ok('and it SAYS it: the window adds exactly one block-level guard carrying the module\u2019s sentence, and the headline names it too', (playOutside.guards || []).length === (playInside.guards || []).length + 1 && (playOutside.guards || []).some((g) => g.level === 'block' && /Outside your trading window/.test(g.text || '')) && /Outside your trading window/.test(playOutside.headline || '') && !/trading window/i.test(playInside.headline || ''), { outside: playOutside.guards, inside: playInside.guards, headline: playOutside.headline });
  ok('with no window selected the playlist is measurably what it was: no window sentence anywhere in it and permission unchanged', !/trading window/i.test(windowText(playQuiet)) && (playQuiet.execution_permission || {}).allowed === true && (playInside.guards || []).length === (playQuiet.guards || []).length, { text: windowText(playQuiet).slice(0, 160) });

  /* ------------------------------------------------------------ unreadable is a refusal too */
  await setWindow(desk.id, '07:00', '10:00', 'Europe/London');
  const moved = await daily(desk.id);
  ok('a window authored in a zone the trader has since changed is `unavailable`, and BOTH zones are named in the sentence', tw(moved).state === 'unavailable' && tw(moved).reason === 'window_zone_changed' && /Europe\/London/.test(moved.message) && /Africa\/Lagos/.test(moved.message), tw(moved).reason);
  ok('and it blocks: an unreadable window refuses the entry rather than opening the gate the trader asked to close', moved.status === 'stop' && windowBreaches(moved)[0].rule === 'trading_window_window_zone_changed' && moved.permission.can_override === false, moved.breaches.map((b) => b.rule));

  /* ------------------------------------------------------------ read-only about the journal */
  await setWindow(desk.id, '07:00', '10:00');
  const before = await H.snapshot();
  const a1 = await daily(desk.id), a2 = await daily(desk.id);
  const after = await H.snapshot();
  const accountsRow = await H.D.db.prepare('SELECT window_start, window_end, window_timezone, window_source FROM accounts WHERE id=?').get(desk.id);
  ok('reading the state twice is idempotent: the same breaches, the same window, no counter and no journal row moved', JSON.stringify(a1.breaches) === JSON.stringify(a2.breaches) && JSON.stringify(tw(a1)) === JSON.stringify(tw(a2)) && Object.values(accountsRow).join('|') === '07:00|10:00|Africa/Lagos|manual', accountsRow);
  ok('the only tables two reads touch are the guardrail audit tables the existing observe path already writes (and the rowid counter beside them)', H.changed(before, after).every((t) => /guardrail_events|guardrail_day_state|sqlite_sequence/.test(t)), H.changed(before, after));
  ok('no journal row, no account row, no setting and no trade moved: the window is read, not stored', !H.changed(before, after).some((t) => /^(trades|accounts|users|journal_entries|signals|routines)/.test(t)), H.changed(before, after));
});
