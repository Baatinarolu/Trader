'use strict';
/**
 * method-check.js — does the bot implement the taught CRT top-down sequence?
 *
 * Built to the engine's OWN stated semantics, read from src/bots/topdown.js:
 *   findRange()  :191  newest reacting candle in the last 14 bias bars
 *   readRange()  :234  the range is the RIGHT CANDLE'S OWN high/low;
 *                      the sweep is detected on the LOWER timeframe after it:
 *                        sweptLow    = ltfLow  < R.l - 0.05*ATR
 *                        backInside  = price   > R.l
 *                        confirmLong = sweptLow && backInside  -> direction +1
 *                      stop = sweptExtreme - 0.15*ATR, target = opposite edge
 *   smc.analyse  :660  needs >= 30 candles
 *
 * No project logic is re-implemented — this only builds candles and asserts
 * what the project's own functions return.
 */
const ROOT = '/home/user/Trader/extracted/tradejournal';
const TD = require(ROOT + '/src/bots/topdown');
const SMC = require(ROOT + '/src/bots/smc');
const Setup = require(ROOT + '/src/bots/setup');
const Ind = require(ROOT + '/src/indicators');

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
};

const H4 = 4 * 3600e3, M15 = 15 * 60e3;
const t0 = Date.UTC(2026, 5, 1, 0, 0, 0);
const bar4 = (i, o, h, l, c) => ({ t: t0 + i * H4, o, h, l, c, v: 1000 });

/* ---- the higher timeframe -------------------------------------------------
   Bars 0..47 : establish a sellside pool — repeated lows at 1900
   Bars 48    : drift up toward 1930
   Bar  49    : THE RIGHT CANDLE (the LAST bar, so it is the newest reaction).
                Wicks down to 1899.0 into the 1900 pool and closes back up at
                1928 -> a reaction at a level that matters.
                Its own high/low (1899.0 - 1934.0) become the marked range.
----------------------------------------------------------------------------- */
const c4h = [];
let p = 1930;
for (let i = 0; i < 48; i++) {
  const o = p;
  const c = 1912 + ((i % 6) - 3) * 3.5;
  const l = (i % 6 === 2 || i % 6 === 5) ? 1900.0 : Math.min(o, c) - 2.5;
  const h = Math.max(o, c) + 3.5;
  c4h.push(bar4(i, o, h, l, c));
  p = c;
}
c4h.push(bar4(48, p, p + 6, p - 2, p + 4));
const RC = { o: 1930, h: 1934.0, l: 1899.0, c: 1928 };
c4h.push(bar4(49, RC.o, RC.h, RC.l, RC.c));
const RC_T = t0 + 49 * H4;
const RANGE_LOW = RC.l, RANGE_HIGH = RC.h;

/* ---- the lower timeframe, AFTER the right candle --------------------------
   Must (a) dip below RANGE_LOW - tol  => the sellside sweep, and
        (b) end back above RANGE_LOW   => the sweep failed to hold.
   Expected direction is therefore LONG, the opposite of the sellside sweep.
----------------------------------------------------------------------------- */
const c15 = [];
const path = [];
for (let i = 0; i < 12; i++) path.push(1928 - i * 1.9);        // drift down toward the range low
for (let i = 0; i < 8; i++) path.push(1905 - i * 1.6);         // the sweep down
path.push(1893.0);                                              // the swept extreme
/* Recovery must be a DISPLACEMENT, not a grind: findDisplacement() needs an
   expansion bar >= 1.2 ATR with a body >= 0.55 of its range, and step 5 needs
   that or a structure shift in the reversal direction. And it must NOT chase:
   readRange() blocks the plan when room_left < 0.5, so stop well short of the
   1934 target instead of running the whole range. */
path.push(1902.0);                                              // displacement bar: 1893 -> 1902
path.push(1904.0);
path.push(1903.2);
path.push(1905.0);
path.push(1904.4);
/* SMC.analyse needs >= 30 candles (smc.js:660) or it returns {ok:false} with no
   `structure` key, which is exactly the unguarded-dereference case in
   setup.js:141. These bars settle just inside the range: still a long way from
   the 1934 target, so the plan stays a non-chase. */
for (let i = 0; i < 10; i++) path.push(1904 + ((i % 3) - 1) * 0.9);
path.forEach((c, i) => {
  const o = i === 0 ? 1928 : path[i - 1];
  c15.push({ t: RC_T + i * M15, o, c, h: Math.max(o, c) + 0.4, l: Math.min(o, c) - 0.4, v: 500 });
});
const sIdx = path.indexOf(1893.0);
c15[sIdx].l = 1893.0;
// make the displacement bar a clean expansion: wide range, big body, up close
const dIdx = sIdx + 1;
c15[dIdx] = { t: RC_T + dIdx * M15, o: 1893.5, c: 1902.0, h: 1902.6, l: 1893.0, v: 900 };
const SWEEP_LOW = 1893.0;
const LAST_PRICE = c15[c15.length - 1].c;

const mk = (cs, tf) => {
  const smc = SMC.analyse(cs, { tf });
  const ind = Ind.snapshot(cs);
  const last = cs[cs.length - 1];
  return { tf, candles: cs, ind, smc, price: last.c, atr: smc.atr || ind.atr || 0, bars: cs.length, meta: { provider: 'hand-built', bars: cs.length, last_price: last.c } };
};

(() => {
  console.log('\n── does the bot implement the taught CRT top-down method? ──\n');
  console.log(`  4h: ${c4h.length} bars, right candle is the last bar (wick ${RANGE_LOW}, close ${RC.c})`);
  console.log(`  15m: ${c15.length} bars after it — sweeps to ${SWEEP_LOW}, closes back at ${LAST_PRICE.toFixed(2)}`);
  console.log(`  taught answer: the sellside was taken and failed to hold => LONG\n`);

  const s4h = mk(c4h, '4h');
  const s15 = mk(c15, '15m');
  ok(s4h.smc.ok === true, `the 4h series has enough structure to analyse (atr ${s4h.smc.atr})`);

  const td = TD.build({ symbol: 'HANDBUILT', tf: '15m', series: s15, biasSeries: s4h, triggerSeries: s15 });

  /* ---- the five steps ---- */
  ok(td.method.steps.length === 5, `5 steps: ${td.method.steps.join(' → ')}`);
  ok(td.method.name === 'CRT top-down (Market Mechanics)', `named as the curriculum: "${td.method.name}"`);
  ok(td.method.conflict_rule && /higher timeframe decides/i.test(td.method.conflict_rule), 'the conflict rule is the taught hierarchy, not a weighted vote');

  const L = td.layers;
  ok(L.bias.tf === '4h', `one job per timeframe: ${L.bias.tf} "${L.bias.job}" → ${L.zone.tf} "${L.zone.job}" → ${L.trigger.tf} "${L.trigger.job}"`);

  const rc = L.bias.right_candle;
  ok(!!rc, `step 2 · right candle found: ${rc && rc.side} at ${rc && rc.level.label} ${rc && rc.level.price} (${rc && rc.reaction_atr} ATR)`);
  ok(rc && Math.abs(rc.candle.l - RANGE_LOW) < 1e-6, `step 2 · it is the candle that wicked into the level (low ${rc && rc.candle.l})`);

  ok(!!L.bias.range, `step 3 · range marked: ${L.bias.range && L.bias.range.low} – ${L.bias.range && L.bias.range.high}`);
  ok(L.bias.range && Math.abs(L.bias.range.low - RANGE_LOW) < 0.51 && Math.abs(L.bias.range.high - RANGE_HIGH) < 0.51,
    `step 3 · the range is the right candle's own high/low (${L.bias.range && L.bias.range.low}–${L.bias.range && L.bias.range.high})`);

  const chk = Object.fromEntries((td.checks || []).map((c) => [c.key, c]));
  ok(L.bias.state === 'confirmed', `step 4 · state is "${L.bias.state}" — the sweep happened AND failed to hold`);
  ok(chk.sweep && chk.sweep.ok === true, `step 4 · the sweep check passes (${chk.sweep && chk.sweep.detail})`);
  ok(L.bias.sweep && L.bias.sweep.low === true && L.bias.sweep.high === false, `step 4 · it names the side taken: low=${L.bias.sweep && L.bias.sweep.low}, high=${L.bias.sweep && L.bias.sweep.high}`);

  ok(Number(td.direction) === 1, `step 5 · direction is LONG (+1) — the OPPOSITE of the sellside sweep. got ${td.direction}`);
  ok(td.status === 'confirmed', `method status "${td.status}"`);

  /* ---- the plan geometry the method teaches ---- */
  const plan = L.bias.plan && (L.bias.plan.safer || L.bias.plan.aggressive);
  ok(!!plan, 'a CRT plan is produced once the method confirms');
  if (plan) {
    ok(plan.stop < SWEEP_LOW + 0.01, `stop is beyond the sweeping extreme (${plan.stop} < swept low ${SWEEP_LOW})`);
    ok(plan.entry > plan.stop, `entry above the stop (${plan.entry})`);
    ok(Math.abs(plan.target - RANGE_HIGH) < 1.0, `target is the OPPOSITE side of the range (${plan.target} vs range high ${RANGE_HIGH})`);
    ok(plan.rr > 0, `the plan carries a positive R:R (${plan.rr})`);
    console.log(`       plan: ${plan.side} entry ${plan.entry} stop ${plan.stop} → target ${plan.target} = ${plan.rr}R`);
  }

  /* ---- the gate ---- */
  const su = Setup.buildSetups(s15.smc, { price: s15.price, atr: s15.atr, bias: Number(td.direction), minRR: 2, topdown: td });
  ok(su.method && su.method.status === 'confirmed', `the setup payload carries the confirmed method state`);
  ok(su.verdict.action !== 'SELL', `the verdict never points against the method (verdict: ${su.verdict.action})`);

  /* ---- counter-case: no sweep => no invented trade ---- */
  const noSweep15 = c15.filter((b) => b.l > RANGE_LOW);   // remove the sweep
  const td2 = TD.build({ symbol: 'HANDBUILT', tf: '15m', series: mk(noSweep15, '15m'), biasSeries: s4h, triggerSeries: mk(noSweep15, '15m') });
  ok(Number(td2.direction) === 0 || td2.status !== 'confirmed',
    `with no sweep the method refuses to invent a trade (direction ${td2.direction}, status "${td2.status}")`);
  ok(/wait|sweep|right candle|range/i.test(String(td2.headline)), `and it says why: "${String(td2.headline).slice(0, 88)}"`);

  console.log(`\nMETHOD CHECK: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
