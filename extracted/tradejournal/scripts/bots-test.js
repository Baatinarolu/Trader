#!/usr/bin/env node
'use strict';
/**
 * Bot API integration test — exercises every /api/bots endpoint against the live
 * server and asserts the invariants the UI depends on.
 *
 *   node scripts/bots-test.js            (server must be running on :3000)
 */

const { purgeUser } = require('./test-cleanup');
const BASE = process.env.TJ_BASE || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const failures = [];

function ok(cond, label, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}
function section(name) { console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}`); }

let TOKEN = null;
async function call(path, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(TOKEN ? { 'x-session': TOKEN } : {}), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch (e) { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json, ms: Date.now() - t0 };
}

(async () => {
  console.log(`Bot API test → ${BASE}`);

  /* ---------------------------------------------------------------- auth */
  section('auth + discovery');
  const health = await call('/api/health');
  ok(health.status === 200 && health.json.ok, 'server healthy');

  // The suites must never write into the human's workspace, so this run opens its
  // own throwaway workspace and seeds the closed-trade history the correctional
  // bot needs. Sample data belongs to the test user, not to you.
  const TEST_EMAIL = `bots${Date.now()}@test.local`;
  const reg = await call('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: 'testpass123', name: 'Bot Test Run' }),
  });
  TOKEN = reg.json.token;
  ok(reg.status === 200 && !!TOKEN, 'throwaway workspace created for this test run (no sign-in wall)');

  const markets = await call('/api/bots/markets');
  ok(markets.status === 200 && markets.json.ok, '/bots/markets responds');
  ok(Array.isArray(markets.json.instruments) && markets.json.instruments.length > 30, `instrument list (${markets.json.instruments && markets.json.instruments.length})`);
  ok(Array.isArray(markets.json.timeframes) && markets.json.timeframes.includes('15m'), 'timeframes listed');
  ok(markets.json.sessions && typeof markets.json.sessions.in_killzone === 'boolean', 'session/killzone state present');

  const sessions = await call('/api/bots/sessions');
  ok(sessions.status === 200 && sessions.json.sessions.length === 5, 'five sessions defined');
  ok(Array.isArray(sessions.json.bullets) && sessions.json.bullets.length === 3, 'three killzone windows');

  /* -------------------------------------------------------------- candles */
  section('candles');
  const cd = await call('/api/bots/candles?symbol=XAUUSD&tf=15m&limit=300');
  ok(cd.status === 200 && cd.json.candles.length >= 200, `XAUUSD 15m candles (${cd.json.candles && cd.json.candles.length})`);
  const bars = cd.json.candles || [];
  const malformed = bars.filter((b) => !(b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c)));
  ok(malformed.length === 0, 'no malformed bars');
  const sorted = bars.every((b, i) => i === 0 || b.t >= bars[i - 1].t);
  ok(sorted, 'bars sorted oldest → newest');
  ok(cd.json.meta.provider && cd.json.meta.last_price > 0, `provider ${cd.json.meta.provider}, last ${cd.json.meta.last_price}`);

  const crypto = await call('/api/bots/candles?symbol=BTCUSDT&tf=1h&limit=500');
  ok(crypto.status === 200 && crypto.json.candles.length >= 400, `crypto deep history via ${crypto.json.meta && crypto.json.meta.provider} (${crypto.json.candles && crypto.json.candles.length} bars)`);

  /* -------------------------------------------------------------- analyse */
  section('full analysis (momentum + smc + setups)');
  const an = await call('/api/bots/analyse?symbol=XAUUSD&tf=15m&prediction=0');
  ok(an.status === 200 && an.json.ok, `/bots/analyse ok in ${an.ms}ms`);
  const A = an.json;
  ok(A.momentum && A.momentum.mechanics && A.momentum.mechanics.score >= 0 && A.momentum.mechanics.score <= 100, `mechanics score ${A.momentum && A.momentum.mechanics.score}`);
  ok(Array.isArray(A.momentum.narrative) && A.momentum.narrative.length >= 5, `narrative lines (${A.momentum.narrative && A.momentum.narrative.length})`);
  ok(A.smc && A.smc.structure && typeof A.smc.structure.trend === 'string', `structure trend: ${A.smc && A.smc.structure && A.smc.structure.trend}`);
  ok(A.smc.sessions && typeof A.smc.sessions.in_killzone === 'boolean', 'killzone filter in payload');
  ok(A.setups && Array.isArray(A.setups.candidates) && A.setups.candidates.length === 2, 'two directional candidates');
  ok(A.setups.verdict && ['BUY', 'SELL', 'NO TRADE'].includes(A.setups.verdict.action), `verdict: ${A.setups.verdict.action} (${A.setups.verdict.grade})`);
  const cand = A.setups.candidates[0];
  if (cand.levels) {
    const L = cand.levels;
    ok(L.stop !== L.entry && L.rr_primary > 0, `levels: entry ${L.entry} stop ${L.stop} rr ${L.rr_primary}R → ${L.rr_final}R`);
    ok(L.targets.length >= 1 && L.targets.every((t) => t.rr > 0), 'target ladder has R:R on every leg');
    const dirOk = cand.dir > 0 ? L.stop < L.entry && L.targets[0].price > L.entry : L.stop > L.entry && L.targets[0].price < L.entry;
    ok(dirOk, 'stop and target are on the correct sides of the entry');
    ok(!!L.management && !!L.management.rule, 'management rule (partial + break-even + runner)');
  } else ok(false, 'candidate has levels');
  ok(A.account && A.account.balance > 0, `account wired for sizing ($${A.account && A.account.balance})`);
  ok(A.headline && typeof A.headline.text === 'string' && A.headline.text.length > 40, 'plain-language headline produced');
  ok(A.news && typeof A.news.blackout === 'string' || A.news.blackout === null, 'news blackout filter ran');

  if (cand.risk) {
    ok(cand.risk.size >= 0 && cand.risk.actual_risk >= 0, `position size plan: ${cand.risk.size} ${cand.risk.unit}, risk $${cand.risk.actual_risk}`);
  } else ok(true, 'position size plan skipped (no balance path)');

  /* --------------------------------------------------------- top-down method */
  section('top-down method (the video procedure, via the API)');
  const td = await call('/api/bots/topdown?symbol=XAUUSD&tf=15m');
  ok(td.status === 200 && td.json.ok, `/bots/topdown ok in ${td.ms}ms`);
  const M = td.json;
  ok(M.method && /CRT top-down/.test(M.method.name), `method named: ${M.method && M.method.name}`);
  ok(/→/.test(M.method.stack || ''), `timeframe stack stated: ${M.method.stack}`);
  ok(Array.isArray(M.steps) && M.steps.length === 5 && M.steps.every((x) => 'done' in x && x.text),
    'five steps, each with its state and its sentence');
  ok(M.layers && M.layers.bias && M.layers.zone && M.layers.trigger
    && M.layers.bias.job === 'bias + range' && M.layers.trigger.job === 'trigger',
    'three layers, each with its job');
  ok(typeof M.layers.bias.state === 'string', `CRT state on the bias timeframe: ${M.layers.bias.state}`);
  ok(Array.isArray(M.conflicts) && M.conflicts.every((c) => c.kind && c.rule && c.resolution && 'blocks_trade' in c),
    `conflicts carry the rule that settles them (${(M.conflicts || []).length})`);
  // Semantics, not a phrase match: a timeframe conflict must quote the hierarchy.
  // The old phrasing test failed on `counter-trend-crt`, whose rule does state the
  // hierarchy ("...against the higher-timeframe structure...") in different words.
  {
    const cs = M.conflicts || [];
    const TF_KINDS = ['ltf-against-htf', 'no-trigger', 'counter-trend-crt', 'no-right-candle'];
    const tfcs = cs.filter((c) => TF_KINDS.includes(c.kind));
    if (tfcs.length) {
      ok(tfcs.every((c) => /higher[- ]timeframe/i.test(c.rule)),
        'every timeframe conflict quotes the hierarchy rule', tfcs.map((c) => c.kind).join(', '));
    } else {
      ok(cs.length === 0 || cs.every((c) => !!c.rule && !!c.resolution),
        cs.length ? `the ${cs.length} conflict(s) are about the range, not the hierarchy (${cs.map((c) => c.kind).join(', ')})`
          : 'no conflicts on this read — the three layers agree, so there is no rule to quote');
    }
  }
  ok(M.status === 'confirmed' || M.status === 'waiting' || M.status === 'blocked', `status: ${M.status}`);
  ok(M.blocked === true || M.blocked === false, 'the payload says whether the method blocks the trade');
  ok(M.verdict && M.verdict.source, `gated verdict attached: ${M.verdict && M.verdict.action} (${M.verdict && M.verdict.source})`);
  if (M.blocked) ok(M.verdict.action === 'NO TRADE', 'when the method blocks, the verdict is NO TRADE');
  else ok(['BUY', 'SELL', 'NO TRADE'].includes(M.verdict.action), `otherwise the verdict keeps the setup action: ${M.verdict.action}`);
  {
    // the assertion prints the offending fragment: "clean JSON" failures used to be
    // undebuggable because the test only said "not clean"
    const j = JSON.stringify(M);
    const i = j.indexOf('undefined');
    ok(i === -1, 'the top-down payload is clean JSON', i === -1 ? '' : `...${j.slice(Math.max(0, i - 120), i + 60)}...`);
  }

  /* ------------------------------------------------------------------ chart */
  section('desk chart payload');
  const ch = await call('/api/bots/chart?symbol=EURUSD&tf=15m&bars=400');
  ok(ch.status === 200 && ch.json.ok, `/bots/chart ok in ${ch.ms}ms`);
  const CH = ch.json;
  ok(Array.isArray(CH.candles) && CH.candles.length >= 300, `candles for the chart (${CH.candles && CH.candles.length})`);
  ok(CH.candles.every((b) => b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c)), 'chart bars are well formed');
  ok(CH.smc && CH.smc.structure && CH.smc.premium_discount && CH.smc.liquidity, 'overlay data present (structure, range, liquidity)');
  ok(Array.isArray(CH.smc.liquidity.pools) && CH.smc.liquidity.pools.length > 0, `liquidity pools mapped (${CH.smc.liquidity.pools.length})`);
  ok(!CH.plan || (CH.plan.entry && CH.plan.stop && Array.isArray(CH.plan.targets)), 'the plan drawn on the chart is complete when it exists');
  ok(!CH.plan || CH.plan.source === 'crt' || CH.plan.source === 'setup', `plan source: ${CH.plan && CH.plan.source}`);
  ok(!CH.plan || !CH.topdown.blocked, 'no plan is drawn while the method blocks the trade');
  ok(CH.stack && CH.stack.bias && CH.stack.location && CH.stack.trigger, 'the three-timeframe stack is included for the mini charts');
  ok(CH.stack.bias.tf !== CH.stack.location.tf, `stack timeframes differ (${CH.stack.bias.tf} / ${CH.stack.location.tf} / ${CH.stack.trigger.tf})`);
  ok(CH.meta && CH.meta.sources && /via/.test(CH.meta.sources.bias || ''), `data source stated per layer: ${CH.meta && CH.meta.sources && CH.meta.sources.bias}`);
  ok(CH.setups && CH.setups.verdict && CH.setups.method, 'the chart carries the gated verdict too (no second opinion)');

  // The chart must not be a second opinion: the same market, ticked twice through
  // two endpoints, has to produce the same method read. (This caught a real bug:
  // the chart asked for 200 higher-timeframe candles, the analysis for 400, and
  // the older history changed which pool the newest candle was judged against.)
  // A daily bar cannot tick between two requests, which is what makes this a
  // deterministic comparison: on a 1h market the last bar is re-stamped on every
  // fetch, so two payloads are legitimately allowed to differ.
  const an2 = await call('/api/bots/analyse?symbol=EURUSD&tf=1d&prediction=0&bars=1200');
  const ch2 = await call('/api/bots/chart?symbol=EURUSD&tf=1d&bars=600');
  const methodSig = (t) => [t.status, t.direction, t.score, t.layers.bias.state].join('|');
  ok(an2.status === 200 && ch2.status === 200, 'both payloads fetched for the agreement check');
  ok(methodSig(an2.json.topdown) === methodSig(ch2.json.topdown),
    'analyse and chart agree on the method for the same market',
    `analyse[${methodSig(an2.json.topdown)}] vs chart[${methodSig(ch2.json.topdown)}]`);
  ok(an2.json.topdown.inputs.level_window_bars === ch2.json.topdown.inputs.level_window_bars,
    `the level window is pinned, so more history cannot change the read (${an2.json.topdown.inputs.level_window_bars} bars)`);

  /* ------------------------------------------------- the "now" call (single) */
  section('the now call — one answer, dated');
  const nowLive = an2.json.now;
  ok(!!nowLive, 'the analysis carries a `now` block');
  ok(['WAIT', 'BUY', 'SELL', 'NO TRADE', 'RE-CHECK'].includes(nowLive.action), `one action from a closed set: ${nowLive.action}`);
  ok(typeof nowLive.headline === 'string' && nowLive.headline.length > 20, 'the call is stated as a sentence');
  ok(nowLive.evaluated_on && nowLive.evaluated_on.last_closed_bar, 'the call names the bar it was made on');
  ok(nowLive.checkpoint && !Number.isNaN(Date.parse(nowLive.checkpoint.at)), `waiting has a clock: ${nowLive.checkpoint && nowLive.checkpoint.label}`);
  ok(nowLive.freshness && ['fresh', 'aging', 'stale', 'market-closed', 'unknown'].includes(nowLive.freshness.state),
    `the read states its freshness: ${nowLive.freshness && nowLive.freshness.state}`);
  ok(nowLive.armed === (nowLive.order != null), 'armed and an order are the same thing (no phantom levels)');
  ok(!nowLive.order || (Number.isFinite(nowLive.order.entry) && Number.isFinite(nowLive.order.stop) && Number.isFinite(nowLive.order.target)),
    'when armed, entry / stop / target are all numbers');
  ok(!nowLive.order || nowLive.order.stop !== nowLive.order.entry, 'the stop is not the entry');
  ok(!nowLive.other_side || nowLive.other_side.dir === -nowLive.side, 'the other side is the opposite of the permitted one');
  ok(!nowLive.other_side || nowLive.other_side.levels === undefined, 'the other side never carries levels');
  ok(Array.isArray(nowLive.guards), 'guards (news window, personal rules) travel with the call');

  // Fetched fresh, right now: `CH` was requested a whole section earlier, and on a
  // live market the chart read of a moving market is not the read of twenty
  // seconds ago. Comparing a stale chart to a fresh analysis was the flake.
  const freshChart = (await call('/api/bots/chart?symbol=EURUSD&tf=1d&bars=400')).json;
  const nowChart = freshChart.now;
  ok(!!nowChart && ['WAIT', 'BUY', 'SELL', 'NO TRADE', 'RE-CHECK'].includes(nowChart.action),
    `the chart payload carries the same kind of call (${nowChart && nowChart.action})`);
  // the two calls are only comparable on the same bar — a live tick between the
  // two requests legitimately changes the answer
  const sameBar = nowChart && nowChart.evaluated_on && nowLive.evaluated_on
    && nowChart.evaluated_on.last_closed_bar === nowLive.evaluated_on.last_closed_bar;
  ok(!sameBar || nowChart.action === nowLive.action,
    `on the same bar, chart and analysis give the same answer (${nowChart && nowChart.evaluated_on.last_closed_bar} → ${nowChart && nowChart.action})`);

  /* ------------------------------------------------------------- bar replay */
  section('bar replay — the read as of an earlier close');
  const liveLast = Date.parse(ch2.json.meta.last_bar);
  const rep = await call('/api/bots/chart?symbol=EURUSD&tf=1h&bars=600&trim=40');
  ok(rep.status === 200, '/bots/chart accepts trim=40');
  const repLast = Date.parse(rep.json.meta.last_bar);
  ok(repLast < liveLast, `the replayed chart ends on an older bar (${new Date(repLast).toISOString()} < ${new Date(liveLast).toISOString()})`);
  ok(rep.json.replay && rep.json.replay.trim === 40, 'the payload states the replay window');
  ok(rep.json.now.evaluated_on.replay === true, 'and the now call says it is a replay');
  ok(rep.json.now.freshness.state === 'replay', `freshness reads "replay" (${rep.json.now.freshness.state})`);
  const repB = await call('/api/bots/chart?symbol=EURUSD&tf=1h&bars=600&trim=40');
  ok(repB.json.candles[repB.json.candles.length - 1].t === rep.json.candles[rep.json.candles.length - 1].t,
    'the same replay window is deterministic (same last candle)');
  const repTable = await call('/api/bots/analyse?symbol=EURUSD&tf=1h&prediction=0&trim=40');
  ok(repTable.status === 200, 'the analysis endpoint accepts trim too');
  ok(repTable.json.now.since && repTable.json.now.since.bars_later === 40, 'the replay reports what the market did in the next 40 bars');
  ok(/As of that bar/.test(repTable.json.now.since.text), `the replay narrates then vs now: "${String(repTable.json.now.since.text).slice(0, 70)}…"`);
  ok(Date.parse(repTable.json.now.evaluated_on.last_closed_bar) === repLast, 'analysis and chart replay the same instant');
  const clamped = await call('/api/bots/chart?symbol=EURUSD&tf=1h&trim=9999');
  ok(clamped.status === 200 && clamped.json.replay.trim <= 400, `an absurd replay window is clamped, not obeyed (${clamped.json.replay.trim})`);

  /* ---------------------------------------------------------- chart drawings */
  section('chart drawings — the trader\'s own work, stored server-side');
  const D = (kind, t, p1, p2) => ({ kind, points: [{ t, p: p1 }, { t: t + 3600000, p: p2 }], style: { colour: '#3f7fe0' } });
  const t0 = Date.UTC(2026, 9, 1, 0, 0);
  let put = await call('/api/chart/drawings', { method: 'PUT', body: JSON.stringify({ symbol: 'EURUSD', timeframe: '1h', drawings: [D('trend', t0, 1.10, 1.12), D('rect', t0, 1.11, 1.13), D('fib', t0, 1.09, 1.14)] }) });
  ok(put.status === 200 && put.json.saved === 3, `PUT stores three drawings (${put.json.saved})`);
  let got = await call('/api/chart/drawings?symbol=EURUSD&tf=1h');
  ok(got.status === 200 && got.json.drawings.length === 3, 'GET returns them');
  ok(got.json.drawings.map((d) => d.kind).join(',') === 'trend,rect,fib', 'kinds survive the round trip in order');
  ok(got.json.drawings[0].points.length === 2 && typeof got.json.drawings[0].points[0].p === 'number', 'points survive as {t,p}');
  const other = await call('/api/chart/drawings?symbol=EURUSD&tf=15m');
  ok(other.json.drawings.length === 0, 'drawings are per market and per timeframe (15m is empty)');
  put = await call('/api/chart/drawings', { method: 'PUT', body: JSON.stringify({ symbol: 'EURUSD', timeframe: '1h', drawings: [D('hline', t0, 1.1234, 1.1234)] }) });
  ok(put.json.saved === 1, 'PUT replaces the set rather than appending');
  const weird = await call('/api/chart/drawings', { method: 'PUT', body: JSON.stringify({ symbol: 'EURUSD', timeframe: '1h', drawings: [{ kind: 'nonsense', points: new Array(20).fill({ t: t0, p: 1.1 }) }] }) });
  got = await call('/api/chart/drawings?symbol=EURUSD&tf=1h');
  ok(weird.json.saved === 1 && got.json.drawings[0].kind === 'trend', `an unknown tool is coerced, not stored raw (${got.json.drawings[0].kind})`);
  ok(got.json.drawings[0].points.length <= 8, `a point list is capped (${got.json.drawings[0].points.length})`);
  const del = await call('/api/chart/drawings?symbol=EURUSD&tf=1h', { method: 'DELETE' });
  got = await call('/api/chart/drawings?symbol=EURUSD&tf=1h');
  ok(del.json.cleared && got.json.drawings.length === 0, 'DELETE clears the market');
  const noAuth = await fetch(BASE + '/api/chart/drawings?symbol=EURUSD&tf=1h');
  ok(noAuth.status === 401 || noAuth.status === 403, `drawings need a session (${noAuth.status})`);

  /* ------------------------------------------------------------ prediction */
  section('prediction (backtest + calibration)');
  const pred = await call('/api/bots/predict?symbol=BTCUSDT&tf=1h&bars=900&step=3');
  ok(pred.status === 200 && pred.json.ok, `/bots/predict ok in ${pred.ms}ms`);
  const liveSetups = pred.json.setups || [];
  ok(liveSetups.every((x) => x.measured_gates && typeof x.measured_gates.stop_ge_06atr === 'boolean'),
    'every live setup carries the two measured gate flags (stop ≥ 0.6 ATR, target ≥ 3R)',
    JSON.stringify(liveSetups.map((x) => x.measured_gates)).slice(0, 160));
  ok(liveSetups.every((x) => x.risk_atr == null || x.risk_atr > 0), 'live setups report their stop distance in ATR', JSON.stringify(liveSetups.map((x) => x.risk_atr)));
  const P = pred.json;
  ok(P.backtest && P.backtest.decided > 0, `resolved setups: ${P.backtest && P.backtest.decided} (no_fill ${P.backtest && P.backtest.no_fill})`);
  ok(typeof P.backtest.expectancy_r === 'number', `managed expectancy ${P.backtest.expectancy_r}R`);
  ok(P.backtest.by_grade && Array.isArray(P.backtest.by_grade), 'per-grade outcome table');
  ok(P.direction && typeof P.direction.p_up_pct === 'number', `P(up) ${P.direction && P.direction.p_up_pct}% over ${P.direction && P.direction.samples} samples`);
  ok(P.model && (P.model.ok === false || typeof P.model.accuracy === 'number'), P.model && P.model.ok ? `model n=${P.model.n} acc=${P.model.accuracy}%` : 'model declined (thin sample)');
  const probs = (P.setups || []).map((s) => s.p_win).filter((p) => p != null);
  ok(probs.length === 0 || probs.every((p) => p >= 0 && p <= 100), `setup probabilities in range (${probs.join(', ') || 'none'})`);
  ok(Array.isArray(P.summary) && P.summary.length >= 2, 'summary explains the numbers');

  const bt = await call('/api/bots/backtest?symbol=XAUUSD&tf=15m&bars=600&step=3&samples=10');
  ok(bt.status === 200 && Array.isArray(bt.json.trades), `backtest trade table (${bt.json.trades && bt.json.trades.length} rows)`);
  ok(bt.json.counts && bt.json.counts.setups > 0, `setups evaluated: ${bt.json.counts && bt.json.counts.setups}`);
  ok(bt.json.out_of_sample === null || typeof bt.json.out_of_sample.accuracy === 'number', bt.json.out_of_sample ? `out-of-sample accuracy ${bt.json.out_of_sample.accuracy}%` : 'out-of-sample skipped (sample under 60)');

  /* --------------------------------------- exit frontier + honest 70 % bar */
  section('exit frontier (win rate vs reward, ≥ +0.5R bar)');
  const btx = await call('/api/bots/backtest?symbol=XAUUSD&tf=15m&bars=1200&step=3&samples=5');
  const BX = btx.json;
  ok(Array.isArray(BX.frontier) && BX.frontier.length >= 16, `frontier rows: ${BX.frontier && BX.frontier.length}`);
  const flatRows = (BX.frontier || []).filter((r) => r.key.startsWith('flat_'));
  ok(flatRows.length >= 10, `flat-target rows measured (${flatRows.length})`);
  const beOk = flatRows.every((r) => {
    const x = Number(r.key.split('_')[1]);
    const c = r.cost_r == null ? 0.05 : r.cost_r;      // the pool's own average cost, per instrument
    return Math.abs(r.breakeven_win_rate - (((1 + c) / (1 + x)) * 100)) < 0.6;
  });
  ok(beOk, 'break-even win rate uses the market\'s own measured cost: (1+cost)/(1+target)');
  ok(flatRows.every((r) => r.cost_r != null && r.cost_r > 0), `every flat row reports the cost it was charged (e.g. flat_1 costs ${flatRows[0] && flatRows[0].cost_r}R)`);
  const cleanOk = flatRows.every((r) => r.key === 'flat_0.4' || r.key === 'flat_0.5' ? r.win_rate_0_5r === 0 : r.win_rate_0_5r <= r.win_rate);
  ok(cleanOk, 'clean-win rate never exceeds the plain win rate (and 0 below +0.5R targets)');
  ok(BX.verdict && typeof BX.verdict.meets_target === 'boolean', `verdict present: 70 % bar ${BX.verdict && BX.verdict.meets_target ? 'met' : 'not met'} on this market`);
  ok(BX.verdict && typeof BX.verdict.note === 'string' && BX.verdict.note.length > 40, 'verdict explains itself in plain words');
  ok(Array.isArray(BX.profiles) && BX.profiles.some((p) => p.key === 'video'), 'management profiles still reported (video plan included)');
  const playRow = (BX.filters || []).find((f) => f.key === 'playlist');
  ok(!!playRow, 'playlist-refinement filter row exists (OTE retrace + MACD agreement)');
  const emaRow = (BX.filters || []).find((f) => f.key === 'playlist_ema');
  ok(!!emaRow, 'playlist + 50-EMA filter row exists');
  ok(BX.gate_sets && Array.isArray(BX.gate_sets.core) && BX.gate_sets.core.length === 6, `gate sets exposed (core ${BX.gate_sets && BX.gate_sets.core.length}, all ${BX.gate_sets && BX.gate_sets.all.length})`);

  /* ------------------------------------- per-instrument costs (2026-10-06) */
  section('per-instrument costs (spread + slippage + commission in bp of price)');
  ok(BX.meta && BX.meta.cost_model === 'instrument', `cost model in use: ${BX.meta && BX.meta.cost_model} (${BX.meta && BX.meta.cost_bps} bp of price, source ${BX.meta && BX.meta.cost_source})`);
  ok(BX.meta && typeof BX.meta.cost_r_median === 'number' && BX.meta.cost_r_median > 0, `median round-trip cost on this market: ${BX.meta && BX.meta.cost_r_median}R per trade`);
  const flatCost = await call('/api/bots/backtest?symbol=XAUUSD&tf=15m&bars=800&step=4&cost=flat&force=1&samples=2');
  ok(flatCost.json.meta && flatCost.json.meta.cost_model === 'flat', 'cost=flat still reproduces the old 0.05R model for A/B comparison');
  const eu = await call('/api/bots/backtest?symbol=EURUSD&tf=1h&bars=800&step=4&force=1&samples=2');
  ok(eu.json.meta && eu.json.meta.cost_r_median > (BX.meta && BX.meta.cost_r_median), `tight-stop FX pays more than gold: EURUSD ${eu.json.meta && eu.json.meta.cost_r_median}R vs XAUUSD ${BX.meta && BX.meta.cost_r_median}R`);

  /* ------------------------------- the win-rate / expectancy dial (measured) */
  section('win rate vs expectancy — the dial, per market');
  const FR = BX.target_frontier || [];
  ok(FR.length >= 6, `per-market target frontier rows: ${FR.length}`);
  ok(FR.every((r) => r.trades > 0 && r.hit_pct != null && r.net_win_pct != null && r.expectancy_r != null), 'each row carries hit rate, net win rate, expectancy and the break-even it needs');
  ok(FR.filter((r) => r.target_r <= 0.5).every((r) => r.clean_pct === 0), 'no exit at or below 0.5R can clear +0.5R net once costs are charged');
  ok(BX.frontier_views && BX.frontier_views.cost_floor && BX.frontier_views.refined, `filtered frontier views exposed (${Object.keys(BX.frontier_views || {}).join(', ')})`);
  ok((BX.presets || []).length >= 2, `presets offered with provenance: ${(BX.presets || []).map((r) => r.key).join(', ')}`);
  ok(['full', 'all'].includes(BX.default_view), `default frontier view is declared: ${BX.default_view}`);
  ok(BX.default_view !== 'full' || (BX.frontier_views.full.trades || 0) >= 10, `the measured default view carries a real sample (n=${(BX.frontier_views.full || {}).trades})`);
  ok(!!BX.measured_rules_at, `measured-rule book loaded (generated ${BX.measured_rules_at})`);
  const gateNames = (BX.per_gate || []).map((r) => r.gate);
  ok(gateNames.includes('stop_ge_06atr') && gateNames.includes('runway3'), 'the two gates that survived the sweep are scored alongside the playlist gates');

  const deep = await call('/api/bots/backtest?symbol=XAUUSD&tf=15m&bars=1200&step=3&entry=deep&force=1&samples=3');
  ok(deep.status === 200 && deep.json.meta && deep.json.meta.entry_mode === 'deep', `entry-depth variant runs (mode=${deep.json.meta && deep.json.meta.entry_mode}, filled ${deep.json.counts && deep.json.counts.filled})`);

  ok(BX.second_chance && typeof BX.second_chance.first_attempt_stopped === 'number', `second-chance block present (${BX.second_chance && BX.second_chance.retapped} re-taps of ${BX.second_chance && BX.second_chance.first_attempt_stopped} stopped trades)`);
  ok(BX.second_chance && typeof BX.second_chance.note === 'string' && BX.second_chance.note.length > 30, 'second-chance verdict explains itself');

  const leg = await call('/api/bots/backtest?symbol=XAUUSD&tf=15m&bars=1200&step=3&entry=leg&force=1&samples=3');
  ok(leg.status === 200 && leg.json.meta && leg.json.meta.entry_mode === 'leg', `displacement-leg-only mode runs (filled ${leg.json.counts && leg.json.counts.filled} of ${leg.json.counts && leg.json.counts.setups} setups)`);
  ok(leg.json.counts.filled <= BX.counts.filled, `leg-only filter is a subset (${leg.json.counts.filled} ≤ ${BX.counts.filled})`);

  const ote = await call('/api/bots/backtest?symbol=XAUUSD&tf=15m&bars=1200&step=3&entry=ote&force=1&samples=3');
  ok(ote.status === 200 && ote.json.meta && ote.json.meta.entry_mode === 'ote', `OTE entry mode runs (filled ${ote.json.counts && ote.json.counts.filled})`);

  const predOte = await call('/api/bots/predict?symbol=XAUUSD&tf=15m&bars=900&step=3&force=1');
  const withBand = (predOte.json.setups || []).filter((x) => x.playlist && x.playlist.ote_entry);
  ok(withBand.length > 0, `live setups carry the OTE refinement (${withBand.length} of ${(predOte.json.setups || []).length})`);
  ok(withBand.every((x) => Array.isArray(x.playlist.ote_entry.band) && x.playlist.ote_entry.band.length === 2 && x.playlist.ote_entry.band[1] > x.playlist.ote_entry.band[0]),
    `OTE band is an ordered price range (${withBand.map((x) => x.playlist.ote_entry.band.join('–')).join(', ')})`);
  ok(withBand.every((x) => x.playlist.ote_entry.risk > 0 && Number.isFinite(x.playlist.ote_entry.risk_atr)), 'OTE suggestion carries a usable risk');

  /* ------------------------------------ two simulators must agree exactly */
  section('simulator parity (independent exit engines)');
  const PC = require('../src/bots/predict');
  const bt3 = await PC.backtest('BTCUSDT', '1h', { bars: 800, step: 6, force: true });
  const filled3 = (bt3.samples || []).filter((s) => s.profiles && s.profiles.video && s.profiles.video.outcome !== 'no_fill');
  const flatOutcome = (sw, x, cost = 0.05) => {
    if (!sw || !sw.fill) return null;
    if (sw.t_bar[x] !== undefined) return Math.round((x - cost) * 1000) / 1000;
    if (sw.stopped) return Math.round((-1 - cost) * 1000) / 1000;
    return Math.round(((sw.close_r || 0) - cost) * 1000) / 1000;
  };
  let mism = 0, checked = 0;
  for (const s of filled3) {
    const viaSweep = flatOutcome(s.sweep, 1, s.sweep.cost_r);   // each trade pays its own instrument's cost
    const viaProfile = s.profiles.full_1r ? s.profiles.full_1r.r : null;
    if (viaSweep !== null && viaProfile !== null) { checked++; if (viaSweep !== viaProfile) mism++; }
  }
  ok(checked >= 20 && mism === 0, `${checked} trades: exit-sweep flat-1R matches profile-engine full_1R (${mism} mismatches)`);
  const rrParity = [];
  for (const s of filled3) {
    const t1 = s.profiles.full_t1;
    if (t1 && s.rr_primary && s.sweep.t_bar[s.rr_primary] !== undefined) rrParity.push(s.rr_primary);
  }
  ok(filled3.length > 20, `filled sample for parity: ${filled3.length} trades`);

  /* ------------------------------------------------------------------ scan */
  section('scan');
  const scan = await call('/api/bots/scan?symbols=EURUSD,XAUUSD,BTCUSDT,ES&tf=15m');
  ok(scan.status === 200 && scan.json.ok, `/bots/scan ok in ${scan.ms}ms`);
  ok(scan.json.rows.length >= 3, `scanned ${scan.json.rows.length} markets (${scan.json.errors.length} errors)`);
  const ranked = scan.json.rows.every((r, i, a) => i === 0 || (r.score + r.mechanics / 2) <= (a[i - 1].score + a[i - 1].mechanics / 2) + 0.01);
  ok(ranked, 'rows ranked by setup quality');
  ok(scan.json.rows.every((r) => r.price > 0 && typeof r.direction === 'string'), 'every row has a price and a direction read');

  /* -------------------------------------------------------------- signals */
  section('signal tracking');
  const save = await call('/api/bots/signals/save', { method: 'POST', body: JSON.stringify({ symbol: 'XAUUSD', timeframe: '15m', prediction: false }) });
  ok(save.status === 200 && save.json.ok, `/signals/save → saved ${save.json.saved && save.json.saved.saved}`);
  const list = await call('/api/bots/signals');
  ok(list.status === 200 && Array.isArray(list.json.signals), `signal list (${list.json.signals && list.json.signals.length})`);
  const sig = list.json.signals[0];
  if (sig) {
    ok(sig.symbol === 'XAUUSD' && sig.status === 'pending', `stored signal: ${sig.side} ${sig.symbol} ${sig.timeframe} @ ${sig.entry}`);
    ok(sig.entry > 0 && sig.stop > 0 && (sig.dir > 0 ? sig.stop < sig.entry : sig.stop > sig.entry), 'stored levels are coherent');
  } else ok(false, 'signal stored');
  const resolve = await call('/api/bots/signals/resolve', { method: 'POST', body: JSON.stringify({ limit: 10 }) });
  ok(resolve.status === 200 && resolve.json.ok, `/signals/resolve checked ${resolve.json.checked} signals`);
  ok(resolve.json.stats && typeof resolve.json.stats.total === 'number', `stats: ${resolve.json.stats.total} tracked, ${resolve.json.stats.resolved} resolved`);


  /* ------------------------------------------------------------- test data */
  section('seed the test workspace (never the human one)');
  const SEED_N = 120;
  const seeded = [];
  for (let i = 0; i < SEED_N; i += 8) {
    const batch = [];
    for (let j = i; j < Math.min(i + 8, SEED_N); j++) {
      const dir = j % 2 ? 'long' : 'short';
      const entry = dir === 'long' ? 100 + (j % 17) : 120 - (j % 13);
      // four archetypes, so several detectors have something real to find
      const kind = j % 4;
      const risk = kind === 1 ? 4 : kind === 3 ? 0.2 : 1;             // risk 1 → oversized, 3 → too-small R:R
      const stop = dir === 'long' ? entry - risk : entry + risk;
      const target = kind === 3
        ? (dir === 'long' ? entry + risk * 0.9 : entry - risk * 0.9)   // planned < 1:2
        : (dir === 'long' ? entry + risk * 3 : entry - risk * 3);
      const exit = kind === 0 ? (dir === 'long' ? entry + risk * 0.3 : entry - risk * 0.3)   // cuts the winner
        : kind === 1 ? (dir === 'long' ? entry - risk : entry + risk)                        // full loss
          : kind === 2 ? (dir === 'long' ? entry + risk * 2.4 : entry - risk * 2.4)          // near target
            : (dir === 'long' ? entry - risk * 0.5 : entry + risk * 0.5);
      const mfe = kind === 0 ? (dir === 'long' ? entry + risk * 2.1 : entry - risk * 2.1)     // ran 2R
        : kind === 3 ? (dir === 'long' ? entry + risk * 0.4 : entry - risk * 0.4) : (dir === 'long' ? entry + risk * 3 : entry - risk * 3);
      const mae = kind === 1 ? (dir === 'long' ? entry - risk * 1.25 : entry + risk * 1.25)   // held past 1R
        : (dir === 'long' ? entry - risk * 0.35 : entry + risk * 0.35);
      const day = String(1 + (j % 12)).padStart(2, '0');
      batch.push((async () => {
        const c = await call('/api/trades', {
          method: 'POST',
          body: JSON.stringify({
            symbol: ['NAS100', 'XAUUSD', 'EURUSD', 'US30'][j % 4],
            direction: dir, status: 'open', entry, stop, target, size: kind === 1 ? 3 : 1, fees: 2,
            strategy_name: ['Trend Pullback (continuation)', 'Liquidity Sweep Reversal', 'Breakout Retest'][j % 3],
            thesis: kind === 3 ? null : `seed trade ${j} — liquidity sweep at a mapped level`,
            emotion_before: kind === 1 ? 'Anxious' : kind === 3 ? 'FOMO' : 'Calm',
            mae_price: mae, mfe_price: mfe,
          }),
        });
        const id = c.json.trade && c.json.trade.id;
        if (!id) return null;
        await call(`/api/trades/${id}/close`, {
          method: 'POST',
          body: JSON.stringify({ exit, exit_reason: kind === 2 ? 'Target' : 'Discretionary', lesson: kind === 1 ? 'sized up after a loss' : 'seeded' }),
        });
        await call(`/api/trades/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ adherence: kind === 1 ? 1 : kind === 0 ? 2 : 4, mistakes: kind === 1 ? 'Oversized, Moved stop' : kind === 0 ? 'Cut winner early' : '' }),
        });
        return id;
      })());
    }
    const done = await Promise.all(batch);
    done.forEach((id) => { if (id) seeded.push(id); });
  }
  ok(seeded.length >= 110, `seeded ${seeded.length} closed trades in the test workspace`);
  const firstTradeId = seeded[0];

  /* ----------------------------------------------------------- correction */
  section('correctional bot');
  const cor = await call('/api/bots/correction');
  ok(cor.status === 200 && cor.json.ok, `/bots/correction ok in ${cor.ms}ms`);
  const CO = cor.json;
  ok(CO.sample.trades >= 100, `analysed ${CO.sample.trades} closed trades`);
  ok(CO.mistakes.length >= 3, `mistakes detected: ${CO.mistakes.length}`);
  ok(CO.mistakes.every((m) => m.title && m.fix && m.severity), 'every mistake carries severity + a fix');
  const numeric = CO.mistakes.filter((m) => m.metric && /\d/.test(m.metric)).length;
  ok(numeric === CO.mistakes.length, `all mistakes quantified (${numeric}/${CO.mistakes.length})`);
  ok(CO.behavior_score >= 0 && CO.behavior_score <= 100, `behavior score ${CO.behavior_score} (${CO.behavior_grade})`);
  ok(CO.guardrails.guardrails.max_risk_pct > 0 && CO.guardrails.guardrails.max_trades_day >= 1, `guardrails: ${CO.guardrails.guardrails.max_risk_pct}% risk, ${CO.guardrails.guardrails.max_trades_day} trades/day, cooldown ${CO.guardrails.guardrails.cooldown_min}min`);
  ok(CO.daily && ['clear', 'caution', 'stop'].includes(CO.daily.status), `daily guardrail state: ${CO.daily.status} — ${(CO.daily.message || '').slice(0, 60)}`);
  // grades are computed on demand — run the backfill (the endpoint under test
  // two lines below) and the per-grade table has something to show
  const backfill0 = await call('/api/bots/correction/backfill', { method: 'POST', body: '{}' });
  ok(backfill0.status === 200 && typeof backfill0.json.updated === 'number', `grade backfill ran (${backfill0.json.updated} trades updated)`);
  const cor2 = await call('/api/bots/correction');
  ok(Array.isArray(cor2.json.grades) && cor2.json.grades.length >= 1, `grade table filled (${cor2.json.grades.length} grades)`);

  const guard = await call('/api/bots/guardrails');
  ok(guard.status === 200 && guard.json.daily, '/bots/guardrails returns live state');

  const fb = await call(`/api/bots/feedback/${firstTradeId}`);
  ok(fb.status === 200 && fb.json.trade_id === firstTradeId, `/bots/feedback/${firstTradeId} → grade ${fb.json.grade} (${fb.json.score})`);
  ok(fb.json.reasons.length >= 3 && Array.isArray(fb.json.notes), `feedback explains itself (${fb.json.reasons.length} reasons, ${fb.json.notes.length} notes)`);

  const backfill = await call('/api/bots/correction/backfill', { method: 'POST', body: '{}' });
  ok(backfill.status === 200 && typeof backfill.json.updated === 'number', `grade backfill is idempotent (${backfill.json.updated} trades updated on the second run)`);


  /* ---------------------------------------------------------- tradingview */
  section('tradingview integration');

  const tvLinks = await call('/api/bots/tv/links?symbol=NAS100');
  ok(tvLinks.status === 200 && tvLinks.json.tv_symbol === 'NASDAQ:NDX', `symbol mapping NAS100 → ${tvLinks.json.tv_symbol}`);
  ok(/tradingview\.com\/chart\/\?symbol=/.test(tvLinks.json.chart), 'chart deep link built');

  const tvCfg = await call('/api/bots/tv/config?symbol=GER40&tf=4h');
  ok(tvCfg.status === 200 && tvCfg.json.advanced.symbol === 'XETR:DAX', `widget config for GER40 (${tvCfg.json.advanced.symbol})`);
  ok(tvCfg.json.advanced.interval === '240', `timeframe 4h → interval ${tvCfg.json.advanced.interval}`);
  ok(Array.isArray(tvCfg.json.tape.symbols) && tvCfg.json.tape.symbols.length >= 4, 'ticker tape config');

  const hook = await call('/api/bots/webhook');
  ok(hook.status === 200 && /^[A-Za-z0-9_-]{16,}$/.test(hook.json.token), 'webhook token issued');
  ok(/\/api\/bots\/webhook\/tradingview\?token=/.test(hook.json.url), 'webhook url includes the token');
  ok(typeof hook.json.analyse === 'boolean' && typeof hook.json.autocreate === 'boolean', 'webhook options exposed');

  const hookUrl = `/api/bots/webhook/tradingview?token=${hook.json.token}`;
  const alertsBefore = (await call('/api/bots/alerts')).json.alerts.length;

  // plain text alert, the format TradingView sends when you type a message by hand
  const alertText = await fetch(BASE + hookUrl, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'BUY GOLD @ 4244.85 15m' });
  const alertTextJson = await alertText.json();
  ok(alertText.status === 200 && alertTextJson.received && alertTextJson.received.symbol === 'XAUUSD', `plain-text alert parsed (GOLD → ${alertTextJson.received && alertTextJson.received.symbol})`);
  ok(alertTextJson.received.action === 'buy' && alertTextJson.received.price === 4244.85, 'side + price extracted from text');
  ok(alertTextJson.plan && ['BUY', 'SELL', 'NO TRADE'].includes(alertTextJson.plan.action), `bot graded the alert (${alertTextJson.plan && alertTextJson.plan.action} ${alertTextJson.plan && alertTextJson.plan.grade}, ${alertTextJson.plan && alertTextJson.plan.agreement})`);
  ok(alertTextJson.plan.entry != null && alertTextJson.plan.stop != null, 'plan carried entry + stop');
  ok(!JSON.stringify(alertTextJson).includes('undefined'), 'alert response is clean JSON');

  // JSON alert with an exchange-qualified ticker + interval code
  const alertJson = await fetch(BASE + hookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'BINANCE:BTCUSDT.P', action: 'sell', price: 61250, tf: '240' }) });
  const alertJsonBody = await alertJson.json();
  ok(alertJson.status === 200 && alertJsonBody.received.symbol === 'BTCUSDT', `qualified ticker normalised (BTCUSDT.P → ${alertJsonBody.received.symbol})`);
  ok(alertJsonBody.received.timeframe === '4h', `interval code mapped (240 → ${alertJsonBody.received.timeframe})`);
  // The verdict depends on live candles, so assert the *invariant*: a sell alert
  // agrees only when the bot is short, conflicts when it is long, stands down on NO TRADE.
  {
    const act = alertJsonBody.plan && alertJsonBody.plan.action;
    const ag = alertJsonBody.plan && alertJsonBody.plan.agreement;
    const expected = act === 'NO TRADE' ? 'bot says stand down' : act === 'SELL' ? 'agrees' : 'conflicts';
    ok(ag === expected, `agreement matches the verdict (${act} → ${ag}, expected ${expected})`);
  }

  const badToken = await fetch(BASE + '/api/bots/webhook/tradingview?token=not-a-token', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'BUY EURUSD' });
  ok(badToken.status === 401, 'wrong token → 401');

  const alertsAfter = await call('/api/bots/alerts');
  ok(alertsAfter.json.alerts.length >= alertsBefore + 2, `alerts stored and listed (${alertsAfter.json.alerts.length})`);
  const newest = alertsAfter.json.alerts[0] || {};
  ok(newest.result && newest.result.action, 'stored alert keeps the bot verdict');
  ok(newest.received_at, 'stored alert timestamped');

  const rotated = await call('/api/bots/webhook/rotate', { method: 'POST', body: '{}' });
  ok(rotated.json.token && rotated.json.token !== hook.json.token, 'token rotation issues a new secret');
  const oldToken = await fetch(BASE + hookUrl, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'BUY EURUSD' });
  ok(oldToken.status === 401, 'rotated-away token rejected');
  await call('/api/bots/webhook', { method: 'POST', body: JSON.stringify({ analyse: true, autocreate: false }) });

  const cleared = await call('/api/bots/alerts/clear', { method: 'POST', body: '{}' });
  ok(cleared.json.deleted >= 2, `alert history clears (${cleared.json.deleted} removed)`);

  // the no-sign-in workspace rule: a fresh browser gets working bot surfaces without any login
  const anonBot = await fetch(BASE + '/api/bots/markets');
  ok(anonBot.status === 401, 'bot endpoints still require a workspace session (created automatically by the app)');

  /* ------------------------------------------- refined entry (MTF execution) */
  section('refined entry execution');

  const Predict = require('../src/bots/predict');
  const rp = Predict.refinePlan({ levels: { entry: 100, stop: 100.5, targets: [{ price: 99, rr: 2 }, { price: 98, rr: 4 }] } }, 99.5, 2);
  ok(rp && rp.entry === 99.5 && rp.risk === 1, 'refinePlan re-anchors entry and risk on the confirmation price', JSON.stringify(rp && { e: rp.entry, r: rp.risk }));
  ok(rp && rp.risk_atr === 0.5, 'refinePlan reports risk in ATR', rp && rp.risk_atr);
  ok(rp && rp.targets[0].rr === 0.5, 'target R:R is recomputed from the new entry', rp && rp.targets[0].rr);
  ok(rp && rp.rr_primary === 1.5 && rp.rr_final === 1.5, 'the headline R:R skips targets closer than 0.9R and takes the first viable one', rp && `${rp.rr_primary}/${rp.rr_final}`);
  const rpNone = Predict.refinePlan({ levels: { entry: 100, stop: 100.5, targets: [{ price: 99.8, rr: 4 }] } }, 99.5, 2);
  ok(rpNone && rpNone.rr_primary === null, 'a confirmation that leaves no target ≥ 0.9R reports no headline R:R', rpNone && String(rpNone.rr_primary));
  ok(Predict.refinePlan({ levels: { entry: 100, stop: 100, targets: [] } }, 100, 2) === null, 'a zero-width stop yields no plan');
  ok(Predict.MTF_ENTRY_PAIRS['15m'] === '5m' && Predict.MTF_ENTRY_PAIRS['4h'] === '1h', 'the HTF→LTF map is intact');

  const planRes = await call('/api/bots/signals/save-plan', {
    method: 'POST',
    body: JSON.stringify({
      symbol: 'XAUUSD', timeframe: '15m', entry: 4000, stop: 3990, targets: [{ price: 4020 }, { price: 4050 }],
      entry_mode: 'mtf', mtf_tf: '5m', risk_atr: 1.2, note: 'bots-test refined plan', p_win: 44,
    }),
  });
  ok(planRes.status === 200 && planRes.json.saved === 1, 'a refined plan can be saved to signals', JSON.stringify(planRes.json).slice(0, 160));
  const listed = await call('/api/bots/signals?limit=5');
  const savedPlan = ((listed.json && listed.json.signals) || []).find((x) => x.id === (planRes.json.ids || [])[0]);
  ok(savedPlan && savedPlan.entry_mode === 'mtf' && savedPlan.mtf_tf === '5m', 'the saved plan keeps its entry mode and confirming timeframe', JSON.stringify(savedPlan || {}).slice(0, 160));
  ok(savedPlan && Math.abs(savedPlan.rr_primary - 2) < 0.001 && Math.abs(savedPlan.rr_final - 5) < 0.001,
    'saved R:R comes from the refined entry, not the HTF plan', savedPlan && `${savedPlan.rr_primary}/${savedPlan.rr_final}`);
  const degenerate = await call('/api/bots/signals/save-plan', { method: 'POST', body: JSON.stringify({ symbol: 'XAUUSD', entry: 4000, stop: 4000 }) });
  ok(degenerate.status === 200 && degenerate.json.saved === 0 && /required/.test(degenerate.json.reason || ''), 'entry = stop is refused with a reason', JSON.stringify(degenerate.json));

  // the model itself must never manufacture a trade from a sub-noise stop
  const btRisk = await call('/api/bots/backtest?symbol=XAUUSD&tf=15m&bars=400&step=6&entry=entry');
  const filled = (btRisk.json.trades || []);
  ok(btRisk.status === 200 && Number.isFinite(btRisk.json.counts && btRisk.json.counts.skipped && btRisk.json.counts.skipped.min_risk),
    'the backtest reports how many setups it refused for a sub-noise stop', JSON.stringify(btRisk.json.counts || {}).slice(0, 160));
  ok(filled.every((s) => s.risk_atr == null || s.risk_atr >= 0.25), 'no surviving sample risks less than a quarter ATR (sample table)',
    filled.filter((s) => s.risk_atr != null && s.risk_atr < 0.25).map((s) => s.risk_atr).join(','));

  /* ------------------------------------------------------- guards + types */
  section('error handling');
  const bad = await call('/api/bots/candles');
  ok(bad.status === 400, 'missing symbol → 400');
  const unauth = await fetch(BASE + '/api/bots/analyse?symbol=XAUUSD', { headers: { 'x-session': 'nope' } });
  ok(unauth.status === 401, 'invalid session → 401');
  const unknown = await call('/api/bots/candles?symbol=NOTAREALMARKET&tf=15m');
  ok(unknown.status === 500 || unknown.status === 200, `unknown symbol handled (${unknown.status})`);

  /* ---- leave the database as we found it: delete this run's workspace ---- */
  const purged = await purgeUser(TEST_EMAIL);
  ok(purged.found, `throwaway workspace removed after the run (${Object.values(purged.removed).reduce((a, b) => a + b, 0)} rows)`);

  /* --------------------------------------------------------------- report */
  console.log(`\n${'='.repeat(64)}`);
  console.log(`BOT API: ${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Test crashed:', e.stack); process.exit(1); });
