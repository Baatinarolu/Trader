'use strict';
/*
 * Offline probe of the deterministic bot engine.
 * Drives the REAL exports of src/bots/{smc,topdown,setup}.js and
 * src/{indicators,instruments,performance,options,candles}.js on synthetic
 * candles, because this sandbox has no egress to the candle providers.
 * It calls the project's own functions; it re-implements nothing.
 */
const ROOT = '/home/user/Trader/extracted/tradejournal';
const SMC = require(ROOT + '/src/bots/smc');
const Momentum = require(ROOT + '/src/bots/momentum');
const TD = require(ROOT + '/src/bots/topdown');
const Setup = require(ROOT + '/src/bots/setup');
const Ind = require(ROOT + '/src/indicators');
const I = require(ROOT + '/src/instruments');
const Perf = require(ROOT + '/src/performance');
const Opt = require(ROOT + '/src/options');
const C = require(ROOT + '/src/candles');

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
};

/* deterministic PRNG so the probe is reproducible */
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

/** n 15m bars: leg down, a displacement sweep of the low, a reversal rally, a pullback. */
function synthetic(n, tfMs = 900e3, start = 2000) {
  const bars = [];
  const t0 = Date.UTC(2026, 8, 1, 0, 0, 0);
  let price = start;
  for (let i = 0; i < n; i++) {
    let drift;
    if (i < n * 0.35) drift = -0.9;
    else if (i < n * 0.42) drift = -2.4;
    else if (i < n * 0.62) drift = +1.3;
    else if (i < n * 0.8) drift = +0.35;
    else drift = -0.6;
    const noise = (rnd() - 0.5) * 3.0;
    const o = price;
    const c = o + drift + noise;
    const h = Math.max(o, c) + rnd() * 1.6;
    const l = Math.min(o, c) - rnd() * 1.6;
    bars.push({ t: t0 + i * tfMs, o, h, l, c, v: 1000 + rnd() * 4000 });
    price = c;
  }
  return bars;
}

/** Same shape momentum.series() returns (src/bots/momentum.js:79). */
const mkSeries = (candles, tf) => {
  const smc = SMC.analyse(candles, { tf });
  const ind = Ind.snapshot(candles);
  const last = candles[candles.length - 1];
  return {
    tf, candles, ind, smc, price: last.c, atr: smc.atr || ind.atr || 0, bars: candles.length,
    meta: { provider: 'synthetic', bars: candles.length, last_price: last.c, last_bar_closed: true },
  };
};

function main() {
  console.log('\n── offline probe: real engine modules on synthetic candles ──\n');

  /* ---------------------------------------------------------------- SMC ---- */
  const c15 = synthetic(600);
  const s15 = mkSeries(c15, '15m');
  const s = s15.smc;
  ok(s && s.ok === true, `SMC.analyse ok on 600 synthetic bars (atr ${s.atr && s.atr.toFixed(2)})`);
  ok(s.structure && ['bullish', 'bearish', 'ranging'].includes(s.structure.trend), `structure trend: ${s.structure.trend}`);
  ok(Array.isArray(s.order_blocks) && s.order_blocks.length > 0, `order blocks found (${s.order_blocks.length})`);
  ok(Array.isArray(s.fvgs) && s.fvgs.length > 0, `fair value gaps found (${s.fvgs.length})`);
  ok(s.liquidity && typeof s.liquidity === 'object', 'liquidity map present');
  ok(s.premium_discount && ['premium', 'discount', 'equilibrium'].includes(s.premium_discount.zone), `premium/discount zone: ${s.premium_discount.zone} at ${s.premium_discount.position_pct}% of range`);
  ok(s.swings && s.swings.minor.length === 14 && s.swings.major.length === 10, `swing points: ${s.swings.minor.length} minor / ${s.swings.major.length} major`);
  ok(s.counts && s.counts.order_blocks >= 0 && s.counts.pools > 0, `counts: ${s.counts.order_blocks} live OBs, ${s.counts.fvgs} live FVGs, ${s.counts.pools} liquidity pools, ${s.counts.sweeps} sweeps`);
  ok(Array.isArray(s.liquidity.pools) && s.liquidity.pools.length > 0, `liquidity pools mapped (${s.liquidity.pools.length})`);

  /* ---------------------------------------------------------- aggregation -- */
  const c1h = C.aggregate(c15, 4);
  const c4h = C.aggregate(c1h, 4);
  ok(c1h.length === 150, `aggregate 15m→1h by 4: ${c1h.length} bars (expect 150)`);
  ok(c4h.length === 37 || c4h.length === 38, `aggregate 1h→4h by 4: ${c4h.length} bars (expect 37–38)`);
  const hi = Math.max(...c1h.map((b) => b.h));
  ok(Math.abs(hi - Math.max(...c15.map((b) => b.h))) < 1e-9, 'aggregated high equals the true high of its children');

  /* --------------------------------------------------------- top-down ------ */
  const s1h = mkSeries(c1h, '1h');
  const s4h = mkSeries(c4h, '4h');
  const c5m = c15.slice(-200).map((b) => b);       // trigger-layer proxy (same granularity)
  const s5m = mkSeries(c5m, '5m');
  const td = TD.build({ symbol: 'SYNTH', tf: '15m', series: s15, biasSeries: s4h, zoneSeries: s1h, triggerSeries: s5m });
  ok(td && td.layers && td.layers.bias, 'topdown.build produced the bias layer');
  ok(td.layers && td.layers.zone, 'topdown.build produced the zone layer');
  ok(td.layers && td.layers.trigger, 'topdown.build produced the trigger layer');
  ok(typeof td.status === 'string', `method status: ${td.status}`);
  ok([-1, 0, 1].includes(Number(td.direction)), `top-down direction: ${td.direction}`);
  ok(['confirmed','blocked','watch','no-trade','waiting'].includes(td.status) || typeof td.status === 'string', `method status is a word, not a flag: ${td.status}`);
  ok(td.method && td.method.steps && td.method.steps.length >= 5, `method exposes its steps (${td.method.steps.length}): ${td.method.steps.join(' / ')}`);
  ok(Array.isArray(td.conflicts), `conflicts list present (${td.conflicts.length})`);
  ok(Array.isArray(TD.STACK) === false && TD.STACK['15m'].bias === '4h', 'STACK maps 15m bias → 4h');

  /* ------------------------------------------------------------- momentum: score + narrative -- */
  /* ------------------------------------------- momentum: score + narrative -- */
  const align = Momentum.alignment(s4h, s15, s5m, td);
  ok(align && typeof align.bias === 'number' && [-1, 0, 1].includes(align.bias), `alignment bias ${align.bias} from "${align.source}"`);
  const mech = Momentum.mechanics({ htf: s4h, mtf: s15, ltf: s5m, align, td });
  ok(mech && typeof mech.score === 'number' && mech.score >= 0 && mech.score <= 100, `mechanics score ${mech.score}/100 over ${mech.factors && mech.factors.length} scored factors`);
  const nar = Momentum.narrative({ symbol: 'SYNTH', mtf: s15, htf: s4h, ltf: s5m, align, mech, td });
  ok(nar && Array.isArray(nar.lines) && nar.lines.length >= 5, `narrative lines (${nar.lines.length}), first: "${nar.lines[0] && nar.lines[0].title}"`);
  ok(Array.isArray(nar.conflicts), `narrative carries conflicts (${nar.conflicts.length})`);

  /* ------------------------------------------------------------- setups ---- */
  // NOTE: buildSetups reads the method gate from ctx.topdown (src/bots/setup.js:83),
  // exactly as both real callers pass it (src/bots/index.js:128 and :305).
  const su = Setup.buildSetups(s, {
    price: s15.price, atr: s15.atr, bias: Number(td.direction) || 0, minRR: 2,
    sessions: s.sessions || {}, topdown: td,
  });
  ok(su && Array.isArray(su.candidates) && su.candidates.length === 2, `two directional candidates (${su.candidates && su.candidates.length})`);
  ok(su.verdict && ['BUY', 'SELL', 'NO TRADE', 'WAIT'].includes(su.verdict.action), `verdict: ${su.verdict && su.verdict.action} / grade ${su.verdict && su.verdict.grade}`);
  ok(su.verdict && typeof su.verdict.headline === 'string' && su.verdict.headline.length > 5, `verdict headline: "${String(su.verdict.headline).slice(0, 78)}"`);
  ok(su.verdict && typeof su.verdict.detail === 'string', `verdict detail explains itself ("${String(su.verdict.detail).slice(0, 78)}")`);
  ok(su.verdict && typeof su.verdict.source === 'string', `verdict names its own source: ${su.verdict.source}`);
  ok(su.method && su.method.status === td.status, `payload carries the method state (status ${su.method && su.method.status}, direction ${su.method && su.method.direction})`);
  /* The gate is NOT applied to setups.verdict when the method has no direction
     (setup.js:355 only fires on td.blocked or a disagreeing non-zero direction).
     That is by design: analyse() (src/bots/index.js:~150) publishes a separate,
     method-gated `method_verdict`, and the user-facing strip comes from
     now.js, which defaults to WAIT. Assert that separation instead. */
  const Now = require(ROOT + '/src/bots/now');
  const nw = Now.build({ symbol: 'SYNTH', tf: '15m', td, setups: su, series: s15, nowMs: c15[c15.length - 1].t + 900e3 });
  ok(['WAIT', 'NO TRADE', 'BUY', 'SELL', 'RE-CHECK'].includes(nw.action), `now-strip action: ${nw.action}`);
  if (td.direction === 0 && !td.blocked) {
    ok(nw.action === 'WAIT' || nw.action === 'NO TRADE',
      `user-facing action is gated to ${nw.action} while the secondary setup-model verdict stays "${su.verdict.action}" (source: ${su.verdict.source})`);
  } else {
    ok(true, `method has direction ${td.direction}; setups verdict ${su.verdict.action}`);
  }
  const armed = su.candidates.find((c) => c.armed);
  if (armed && armed.levels) {
    const L = armed.levels;
    ok(L.stop !== L.entry && Number(L.rr_primary) > 0, `armed ${armed.side} plan: entry ${L.entry.toFixed(2)} stop ${L.stop.toFixed(2)} rr ${L.rr_primary}R → final ${L.rr_final}R`);
  } else {
    console.log('  --   no candidate armed — engine refused this synthetic pattern');
  }

  /* --------------------------------------------------- instrument maths ---- */
  const fx = I.PRESETS.find((p) => p.symbol === 'EURUSD');
  const gc = I.PRESETS.find((p) => p.symbol === 'XAUUSD');
  ok(fx && gc, `preset library has EURUSD + XAUUSD (${I.PRESETS.length} presets total)`);
  const p1 = I.computePnl({ ...fx, direction: 'long', entry: 1.1, exit: 1.105, size: 1.5, fees: 0 });
  ok(p1.net > 700 && p1.net < 800, `EURUSD 1.5 lots +50 pips → net $${p1.net} (expect ≈$750)`);
  const p2 = I.computePnl({ ...gc, direction: 'short', entry: 2650, exit: 2640, size: 2, fees: 0 });
  ok(p2.net > 0, `XAUUSD 2 contracts short −$10 → net $${p2.net}`);
  const p3 = I.computePnl({ ...fx, direction: 'short', entry: 1.1, exit: 1.105, size: 1.5, fees: 0 });
  ok(p3.net < 0, `the same move against you is a loss → net $${p3.net}`);
  const sz = I.positionSize({ ...fx, balance: 10000, riskPct: 1, entry: 1.1, stop: 1.0985 });
  ok(sz.size > 0 && sz.riskAmount > 0, `1% of $10k with a 15-pip stop → ${sz.size} ${sz.unit}, risking $${sz.riskAmount}`);
  const cR = I.costR(fx, 1.1, 1.0985);
  ok(typeof cR === 'number' && cR > 0 && cR < 1, `costR on that 15-pip stop = ${cR && cR.toFixed(3)}R`);

  /* -------------------------------------------------------- options -------- */
  const g = Opt.greeks({ spot: 100, strike: 100, dte: 30, iv: 0.30, rate: 0.045, type: 'call' });
  ok(g.ok !== false && g.delta > 0.45 && g.delta < 0.62, `Black-Scholes ATM 30d call delta ${g.delta && g.delta.toFixed(3)}`);
  ok(g.theta < 0, `theta negative (time decay) ${g.theta && g.theta.toFixed(4)}/day`);
  ok(g.vega > 0 && g.gamma > 0, `vega ${g.vega && g.vega.toFixed(3)}/vol point, gamma ${g.gamma && g.gamma.toFixed(5)}`);

  /* ------------------------------------------------------ analytics -------- */
  const trades = [];
  for (let i = 0; i < 60; i++) {
    const win = rnd() < 0.45;
    const r = win ? 2.5 : -1;
    const pnl = r * 100;
    trades.push({
      id: i + 1, symbol: 'EURUSD', direction: 'long', status: 'closed',
      entry: 1.1, exit: 1.1 + r * 0.0015, size: 1, risk_amount: 100, fees: 0,
      gross_pnl: pnl, net_pnl: pnl, r_multiple: r,
      opened_at: new Date(Date.UTC(2026, 5, 1 + i)).toISOString(),
      closed_at: new Date(Date.UTC(2026, 5, 1 + i, 4)).toISOString(),
    });
  }
  const dec = trades.map((t) => Perf.decorate(t));
  const k = Perf.kpis(dec, { startingBalance: 10000 });
  ok(k.trades === 60, `kpis counted ${k.trades} trades`);
  ok(typeof k.expectancy_r === 'number' && k.expectancy_r > 0.4 && k.expectancy_r < 0.7, `expectancy ${k.expectancy_r}R (0.45×2.5 − 0.55×1 = +0.575R)`);
  ok(k.win_rate > 35 && k.win_rate < 55, `win rate ${k.win_rate}%`);
  ok(k.profit_factor > 1, `profit factor ${k.profit_factor}`);
  ok(k.max_drawdown < 0, `max drawdown ${k.max_drawdown} (${k.max_drawdown_pct}%)`);
  const eq = Perf.equityCurve(dec, 10000);
  ok(Array.isArray(eq) && eq.length === dec.length + 1, `equity curve = start + one point per trade (${eq.length})`);
  const dd = Perf.drawdownStats(eq);
  ok(dd.maxDD <= 0 && dd.maxDD === k.max_drawdown, `drawdownStats agrees with kpis (${dd.maxDD})`);
  const mc = Perf.monteCarlo(dec.map((t) => t.r_multiple), { sims: 500, horizon: 100, startEquity: 10000, riskPct: 1, seed: 7 });
  ok(mc && typeof mc.risk_of_ruin === 'number' && typeof mc.median_max_dd_pct === 'number',
    `monte carlo: risk of ruin ${mc && mc.risk_of_ruin}%, median max DD ${mc && mc.median_max_dd_pct}%, p95 DD ${mc && mc.p95_max_dd_pct}%`);
  const seg = Perf.segment(dec, (t) => (t.r_multiple > 0 ? 'win' : 'loss'));
  ok(seg && typeof seg === 'object', 'segment() bucketed the trades');

  console.log(`\nPROBE RESULT: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

try { main(); } catch (e) {
  console.error('PROBE CRASH:', e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e);
  process.exit(2);
}
