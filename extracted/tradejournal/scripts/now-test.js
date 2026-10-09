'use strict';
/**
 * now-test.js — the "what do I do right now" call, tested on hand-built inputs.
 *
 * The point of these assertions is that the panel can never show two sides at
 * once, that "wait" always carries a clock, and that the read always states the
 * bar it came from. All of it offline: no network, no database, no browser.
 *
 *   node scripts/now-test.js
 */
const Now = require('../src/bots/now');

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log(' ok   ' + label); }
  else { fail++; console.log(' FAIL ' + label + (detail ? '  → ' + detail : '')); }
};

const TF_MS = { '15m': 900000, '1h': 3600000 };
/** a synthetic trading series: `n` bars ending `ageMin` minutes before "now" */
function series({ tf = '1h', n = 120, price = 1.1250, atr = 0.0016, ageMin = 5, nowMs = Date.UTC(2026, 9, 6, 14, 5) } = {}) {
  const span = TF_MS[tf];
  const candles = [];
  const lastT = nowMs - ageMin * 60000 - (nowMs % span);      // a tidy bar boundary
  for (let i = n - 1; i >= 0; i--) {
    const t = lastT - i * span;
    candles.push({ t, o: price, h: price + atr, l: price - atr, c: price + (i % 3 - 1) * atr * 0.2, v: 1000 + i });
  }
  return { tf, candles, price, atr, smc: { atr }, ind: { atr } };
}

const baseTd = (over = {}) => ({
  status: 'waiting', direction: 0, blocked: false, score: 40, grade: 'C',
  headline: 'The daily range high has been traded through but has not failed to hold yet.',
  steps: [
    { n: 1, title: 'Find the right candle', done: true, text: '' },
    { n: 2, title: 'Mark the range', done: true, text: '' },
    { n: 3, title: 'Wait for the sweep', done: false, text: '' },
    { n: 4, title: 'Confirm on the lower timeframe', done: false, text: '' },
  ],
  checks: [], playbook: [], conflicts: [],
  layers: { bias: { tf: '1d', state: 'no-sweep', range: { low: 1.1162, high: 1.1257, mid: 1.1210 } } },
  ...over,
});

const armedTd = (over = {}) => baseTd({
  status: 'confirmed', direction: -1, blocked: false, score: 80, grade: 'B',
  conviction: { tier: 'B', text: 'confirmed, no lower-timeframe confirmation yet' },
  layers: { bias: { tf: '1d', state: 'confirmed', range: { low: 1.1162, high: 1.1257, mid: 1.1210 }, sweep: { high: true, level: 1.1257, extreme: 1.1263 } } },
  crt_plan: {
    side: 'short', dir: -1, range: { low: 1.1162, high: 1.1257 },
    sweep: { level: 1.1257, extreme: 1.1263, wick_atr: 0.4 },
    aggressive: { entry: 1.1248, stop: 1.1266, target: 1.1162, rr: 2.7 },
    safer: { entry: 1.1253, stop: 1.1266, target: 1.1162, rr: 1.8 },
    invalidation: 'A close back above 1.1266 voids the short.',
    target_note: 'opposite side of the range',
  },
  steps: [
    { n: 1, title: 'Find the right candle', done: true }, { n: 2, title: 'Mark the range', done: true },
    { n: 3, title: 'Wait for the sweep', done: true }, { n: 4, title: 'Confirm on the lower timeframe', done: false },
  ],
  ...over,
});

const setups = (dirs = [{ dir: -1, side: 'short', grade: 'B', score: 78 }, { dir: 1, side: 'long', grade: 'C', score: 52 }]) => ({
  verdict: { action: 'SELL', dir: -1, grade: 'B', score: 78, headline: 'short setup' },
  candidates: dirs.map((d) => ({ ...d, levels: { entry: 1.1250, stop: 1.1266, targets: [{ price: 1.1162, rr: 2 }] } })),
});

const NOW = Date.UTC(2026, 9, 6, 14, 5);
const S = series({ nowMs: NOW });

/* ------------------------------------------------------------------ 1. waiting */
{
  const n = Now.build({ td: baseTd(), setups: setups([]), series: S, symbol: 'EURUSD', tf: '1h', nowMs: NOW });
  ok(n.action === 'WAIT', 'no direction → WAIT');
  ok(n.armed === false && n.order === null, 'nothing is armed, and no order is invented');
  ok(!!n.watch && n.watch.kind === 'range' && n.watch.low === 1.1162, 'an undecided market still names the two edges to watch', JSON.stringify(n.watch));
  ok(/swept and closes back inside/.test(n.watch.condition), 'the watch condition is the taught one: sweep + close back inside');
  ok(!!n.checkpoint.at, 'WAIT still carries a clock');
  ok(/next 1h close|killzone/.test(n.checkpoint.label), 'the checkpoint names the next bar close or the next window', n.checkpoint.label);
  ok(n.evaluated_on.last_closed_bar === new Date(S.candles[S.candles.length - 1].t).toISOString(), 'the read says which bar it came from');
}

/* ------------------------------------------------------------------ 2. armed */
{
  const n = Now.build({ td: armedTd(), setups: setups(), series: S, symbol: 'EURUSD', tf: '1h', nowMs: NOW });
  ok(n.action === 'SELL' && n.side === -1, 'a confirmed short sets the action to SELL');
  ok(n.armed && n.order && n.order.side === 'short', 'the order is priced');
  ok(n.order.entry === 1.1248 && n.order.stop === 1.1266 && n.order.target === 1.1162, 'entry / stop / target come from the method plan');
  ok(n.order.mode === 'aggressive' && /Half risk/.test(n.order.size_note), 'conviction B takes the deeper fill at half risk', n.order.size_note);
  ok(n.other_side && n.other_side.side === 'long', 'the other side is named');
  ok(!n.other_side.levels, 'the other side carries no levels (never two priced plans)', JSON.stringify(n.other_side.levels || null));
  ok(/higher timeframe decides direction/.test(n.other_side.text), 'the other side states why it is blocked');

  const a = Now.build({
    td: armedTd({ conviction: { tier: 'A', text: 'ltf confirmed' } }),
    setups: setups(), series: S, symbol: 'EURUSD', tf: '1h', nowMs: NOW,
  });
  ok(a.full_risk === true && a.order.mode === 'safer', 'conviction A takes full risk at the better-quality fill', a.order && a.order.mode);
}

/* ------------------------------------------------------------------ 3. blocked */
{
  const td = baseTd({
    status: 'waiting', direction: 0, blocked: true,
    conflicts: [{ kind: 'both-sides-taken', blocks_trade: true, sides: 'high and low', rule: 'Both sides swept.', resolution: 'Stand down until a new right candle forms.' }],
  });
  const n = Now.build({ td, setups: setups(), series: S, symbol: 'EURUSD', tf: '1h', nowMs: NOW });
  ok(n.action === 'NO TRADE', 'a blocking conflict → NO TRADE');
  ok(n.armed === false, 'a blocked method arms nothing');
  ok(/do not trade this right now/i.test(n.headline), 'the headline is an instruction, not an opinion', n.headline);
  ok(/Stand down|stand down/.test(n.headline) || /wait for a fresh right candle/.test(n.watch.text), 'the resolution is carried into the instruction');
}

/* ------------------------------------------------------------------ 4. chase */
{
  const td = armedTd({
    conflicts: [{ kind: 'chase', blocks_trade: true, sides: 'entry vs range', rule: 'Most of the range is gone.', resolution: 'Wait for the next right candle.' }],
    crt_plan: { ...armedTd().crt_plan, chase: true },
  });
  const n = Now.build({ td, setups: setups(), series: S, symbol: 'EURUSD', tf: '1h', nowMs: NOW });
  ok(n.action === 'WAIT' && n.armed === false, 'a chased range is WAIT with no order, not a signal', n.action);
  ok(/easy part of the range is gone/.test(n.headline), 'the headline says why waiting beats chasing');
}

/* ------------------------------------------------------------------ 5. freshness */
{
  const old = Now.build({ td: baseTd(), setups: setups([]), series: series({ ageMin: 400, nowMs: NOW }), symbol: 'EURUSD', tf: '1h', nowMs: NOW });
  ok(old.freshness.state === 'stale', 'an old last bar is flagged stale', old.freshness.state);
  ok(old.guards.some((g) => /stale|ago/.test(g.text)), 'a stale read raises a guard');

  const drift = Now.build({
    td: baseTd(), setups: setups([]),
    series: series({ ageMin: 5, nowMs: NOW }),
    quote: { price: 1.1250 + 0.0016 * 1.2, at: NOW, provider: 'test' },
    symbol: 'EURUSD', tf: '1h', nowMs: NOW,
  });
  ok(drift.freshness.state === 'aging', 'a price that has moved > 0.5 ATR since the close is flagged aging', drift.freshness.state);
  ok(/entry may already be gone/.test(drift.freshness.note), 'the aging note warns the entry may be gone');
  const lastClose = S.candles[S.candles.length - 1].c;
  const expected = (1.1250 + 0.0016 * 1.2 - lastClose) / 0.0016;
  ok(drift.live && Math.abs(drift.live.drift_atr - expected) < 0.02, 'the drift is reported in ATR', drift.live && String(drift.live.drift_atr));

  const replay = Now.build({
    td: baseTd(), setups: setups([]), series: series({ ageMin: 5, nowMs: NOW }),
    replay: { trim: 12, since: { price: 1.1240, atr: 0.0016, verdict: 'waiting' } },
    symbol: 'EURUSD', tf: '1h', nowMs: NOW,
  });
  ok(replay.freshness.state === 'replay', 'a replay says it is a replay');
  ok(replay.since && replay.since.bars_later === 12, 'the replay reports how many bars later we are');
  ok(/the read is now/.test(replay.since.text), 'the replay states the verdict then and now');
}

/* ------------------------------------------------------------------ 6. guards */
{
  const n = Now.build({
    td: baseTd(), setups: setups([]), series: S,
    news: { blackout: 'NFP in 20 minutes (USD)' },
    daily: { status: 'cooldown', message: 'You are inside your 30-minute revenge cooldown.' },
    symbol: 'EURUSD', tf: '1h', nowMs: NOW,
  });
  ok(n.guards.some((g) => g.level === 'block' && /NFP/.test(g.text)), 'a news blackout is carried as a blocking guard');
  ok(n.guards.some((g) => /cooldown/.test(g.text)), 'a personal guardrail is carried through');
}

/* ------------------------------------------------------------ 7. pure helpers */
{
  ok(Now.nextBarClose(Date.UTC(2026, 9, 6, 14, 7), '15m') === Date.UTC(2026, 9, 6, 14, 15), 'nextBarClose rounds up to the 15m boundary');
  ok(Now.nextBarClose(Date.UTC(2026, 9, 6, 14, 7), '1h') === Date.UTC(2026, 9, 6, 15, 0), 'nextBarClose rounds up to the hourly boundary');
  ok((Now.killzoneAt(Date.UTC(2026, 9, 6, 13, 0)) || {}).key === 'ny_am', 'killzoneAt knows the New York AM window');
  ok(Now.killzoneAt(Date.UTC(2026, 9, 6, 20, 0)) === null, 'outside every killzone is reported as outside');
  ok(Now.nextKillzone(Date.UTC(2026, 9, 6, 20, 0)).key === 'asia', 'the next window after 20:00 UTC is Asia');
}

console.log('\n' + '═'.repeat(64));
console.log(`NOW TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
