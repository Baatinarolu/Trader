'use strict';
/** M112 engine probe: the boundary as the ENTRY ENGINE sees it. A window that cannot contain the
 * trader's local time must arrive as a veto beside the other non-negotiables (not as a penalty
 * inside a score), the window's own state must be published as a filter, and `unset` must block
 * nothing at all. The synthetic series is the same one the M110/M111 probes use, so the ONLY
 * difference between the arms below is the window. */
const path = require('path');
const H = require('./m112-test-support'), { ok } = H;
const N = H.mod('src/trading-window');
const Setup = H.setup(), SMC = H.smc();
const T = Date.UTC(2026, 9, 13, 12, 0);                 // 13:00 in Africa/Lagos
const ZONE = 'Africa/Lagos';
H.finish('M112 engine: outside the window is a veto, unset is nothing', async () => {
  if (!H.shipped(N, 'the M112 trading-window rule')) return;
  const series = H.bars(); const win = series.slice(-260);
  const smc = SMC.analyse(win, { tf: '15m', now: win[win.length - 1].t, swingMode: 'bos', nested: true });
  const base = { price: win[win.length - 1].c, atr: smc.atr, entrySeries: { smc, price: win[win.length - 1].c, atr: smc.atr, ind: smc.ind }, indicators: smc.ind, balance: 10000, riskPct: 0.5, maxRiskPct: 1, valuePerPoint: 100000, assetClass: 'forex', symbol: 'EURUSD', minRR: 1 };
  const w = (start, end, extra = {}) => N.stateOf({ start, end, timezone: ZONE, ownedZone: ZONE, nowMs: T, ...extra });
  const notes = (r) => ((r.candidates || [])[0] || {}).no_trade || [];
  /* A tree that does not ship the veto has no `trading_window` filter at all, so every read of it is
   * guarded: the absent feature is a FAILING ASSERTION, never a TypeError that stops the probe. */
  const twf = (r) => ((r && r.filters && r.filters.trading_window) || {});

  const bare = Setup.buildSetups(smc, base);
  const outside = Setup.buildSetups(smc, { ...base, tradingWindow: w('07:00', '10:00') });
  const inside = Setup.buildSetups(smc, { ...base, tradingWindow: w('12:00', '15:00') });
  const unset = Setup.buildSetups(smc, { ...base, tradingWindow: w(null, null) });
  const unreadable = Setup.buildSetups(smc, { ...base, tradingWindow: w('07:00', null) });

  ok('a caller that consulted no window publishes `not_consulted` — its own token, never mapped onto unset or inside', twf(bare).state === 'not_consulted' && twf(bare).block === false, twf(bare));
  ok('with no window selected the engine vetoes nothing and says so', twf(unset).state === 'unset' && twf(unset).block === false && notes(unset).length === notes(bare).length, { state: twf(unset).state, vetoes: notes(unset).length, clean: notes(bare).length });
  ok('inside the window the engine also vetoes nothing — the block is the boundary, not the feature', twf(inside).state === 'inside' && twf(inside).block === false && notes(inside).length === notes(bare).length, { inside: notes(inside).length, clean: notes(bare).length });

  const veto = notes(outside).find((t) => /Outside your trading window/.test(t));
  ok('outside the window the candidate carries the refusal in its no-trade list — a veto, not a lower score', !!veto, notes(outside));
  ok('the veto IS the module sentence, so the engine invents no second wording and cannot drift from the rule', veto === N.stateOf({ start: '07:00', end: '10:00', timezone: ZONE, ownedZone: ZONE, nowMs: T }).detail, veto);
  ok('and it is a real veto: the same bars carry one more blocking reason than they did a moment ago', notes(outside).length === notes(bare).length + 1, { outside: notes(outside).length, clean: notes(bare).length });
  ok('the sentence names the trader\u2019s own window, zone, local time and the wait — never a generic phrase', /07:00\u201310:00 Africa\/Lagos/.test(veto) && /it is 13:00 there/.test(veto) && /opens in 18h 0m/.test(veto), veto);
  ok('and it carries his rationale for calling the boundary a cheat code', /less screen time equal better trades/.test(veto), (veto || '').slice(-80));

  ok('the filter states the window beside the killzone so a client renders it without parsing the veto', twf(outside).state === 'outside' && twf(outside).start === '07:00' && twf(outside).end === '10:00' && twf(outside).timezone === ZONE && twf(outside).local_time === '13:00' && twf(outside).block === true && twf(outside).reason === 'outside_window', twf(outside));
  ok('an unreadable window is its OWN reason on the filter, so a client can offer the repair rather than a countdown', twf(unreadable).state === 'unavailable' && twf(unreadable).block === true && twf(unreadable).reason === 'window_value_unreadable', twf(unreadable));
  ok('and its veto is the module\u2019s own repair sentence — the payload names the fix, it does not invent one', notes(unreadable).some((t) => /Repair it in the account settings/.test(t)), notes(unreadable));
  ok('a window authored on a zone the trader has since changed refuses as well, naming both clocks', (() => {
    const moved = Setup.buildSetups(smc, { ...base, tradingWindow: N.stateOf({ start: '07:00', end: '10:00', timezone: 'Europe/London', ownedZone: ZONE, nowMs: T }) });
    return twf(moved).state === 'unavailable' && twf(moved).reason === 'window_zone_changed' && twf(moved).block === true;
  })(), null);

  /* the boundary is a boundary, not a widening of the fix: everything else is untouched */
  const checks = (r) => (((r.candidates || [])[0] || {}).checks || []);
  ok('the test rows and their weights are identical with and without the window — M112 adds a veto, it retunes nothing', JSON.stringify(checks(outside).map((c) => [c.key, c.pass, c.weight])) === JSON.stringify(checks(bare).map((c) => [c.key, c.pass, c.weight])), checks(outside).map((c) => c.key));
  ok('no candidate was silently converted to `ok` or to a better grade by the window either', JSON.stringify((outside.candidates || []).map((c) => [c.ok, c.grade])) === JSON.stringify((bare.candidates || []).map((c) => [c.ok, c.grade])), (outside.candidates || []).map((c) => [c.ok, c.grade]));
  ok('the window filter sits beside the killzone filter rather than replacing it', typeof outside.filters.killzone === 'string' && twf(outside).state === 'outside' && 'stand_down' in outside.filters, Object.keys(outside.filters).filter((k) => /window|killzone|stand_down/.test(k)));
  ok('and the module is consulted, never mutated: the engine holds the state object it was given, with no write path on it', (() => { const s = w('07:00', '10:00'); const before = JSON.stringify(s); Setup.buildSetups(smc, { ...base, tradingWindow: s }); return JSON.stringify(s) === before; })(), null);
  ok('the engine reads the window from its own ctx and does not go looking for an account row or a clock of its own', (() => {
    const src = require('fs').readFileSync(path.join(H.APP, 'src/bots/setup.js'), 'utf8');
    return /ctx\.tradingWindow && ctx\.tradingWindow\.block/.test(src) && !/routine_timezone|Date\.now\(\)/.test(src.slice(src.indexOf('M112'), src.indexOf('M112') + 1200));
  })(), null);
});
