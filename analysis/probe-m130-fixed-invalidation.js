'use strict';
/** M130 / M50 follow-up: a held idea must keep its ORIGINAL invalidation across calls.
 * Drives the shipped Bots.analyse + real SQLite store. Market reads are controlled
 * input fixtures, not price predictions; the model stays blocked so no order is placed.
 * TJ_APP selects the pre-fix control. Never touches the user's journal.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const file = path.join(os.tmpdir(), `m130-${process.pid}.db`);
delete process.env.TURSO_DATABASE_URL;
delete process.env.LIBSQL_URL;
delete process.env.TURSO_AUTH_TOKEN;
process.env.TRADEJOURNAL_DB = file;
const Db = require(path.join(APP, 'src/db'));
const SMC = require(path.join(APP, 'src/bots/smc'));
const Mom = require(path.join(APP, 'src/bots/momentum'));
const Market = require(path.join(APP, 'src/market'));
const Bots = require(path.join(APP, 'src/bots'));
const Synth = require('./harness/synth');
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(' ok   ' + name); }
  else { fail++; console.log(' FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const T0 = Date.parse('2026-07-15T07:00:00Z');
const baseCandles = Synth.series({ seed: 6, bars: 240 }).map((b, i) => ({ ...b, t: T0 - (239 - i) * 900000 }));
const baseSmc = SMC.analyse(baseCandles, { tf: '15m', now: T0 });
let tick = 0, feed = { bias: 1, close: 1.1, low: 1, high: 1.2, anchor: 'range' };
function series(tf) {
  const candles = baseCandles.map((b) => ({ ...b, t: b.t + tick * 900000 }));
  candles.at(-1).c = feed.close;
  candles.at(-1).h = Math.max(candles.at(-1).h, feed.close);
  candles.at(-1).l = Math.min(candles.at(-1).l, feed.close);
  return { tf, candles, price: feed.close, atr: baseSmc.atr, ind: null,
    smc: { ...baseSmc, price: feed.close, premium_discount: { ...baseSmc.premium_discount,
      range_low: feed.low, range_high: feed.high }, sessions: SMC.sessionState(new Date(T0 + tick * 900000)) } };
}
Market.getCalendar = async () => ({ events: [] });
Mom.series = async (sym, tf) => series(tf);
Mom.analyse = async () => {
  const plan = feed.anchor === 'crt' ? { dir: feed.bias,
    invalidation_level: feed.bias > 0 ? feed.low : feed.high,
    invalidation_side: feed.bias > 0 ? 'below' : 'above' } : null;
  return { bias: feed.bias, bias_score: 50, direction: feed.bias > 0 ? 'bullish' : 'bearish',
    alignment: { bias: feed.bias, reason: 'controlled HTF read', rows: [] },
    mechanics: { score: 80, grade: 'A', factors: [] }, narrative: [], conflicts: [], series: {},
    topdown: { direction: 0, status: 'waiting', blocked: true, headline: 'Lifecycle fixture, no execution plan.',
      layers: { bias: { tf: '4h', plan } }, steps: [], conflicts: [], playbook: [] } };
};
const call = async (next) => { feed = { ...feed, ...next }; tick++; return Bots.analyse('EURUSD', '15m', { includePrediction: false }); };
const hy = (r) => r.momentum.bias_hysteresis;

(async () => {
  await Db.ready;
  console.log('=== range and CRT anchors: agree, disagree, then breach ORIGINAL level ===');
  let retained = 0, tested = 0, released = 0;
  for (const anchor of ['range', 'crt']) {
    for (const dir of [1, -1]) {
      await Db.clearBiasState('EURUSD', '15m');
      const name = `${anchor} / ${dir > 0 ? 'long' : 'short'}`;
      const first = await call({ anchor, bias: dir, close: 1.1, low: 1, high: 1.2 });
      const firstRow = await Db.getBiasState('EURUSD', '15m');
      const original = dir > 0 ? 1 : 1.2;
      ok(name + ': first read stores the defining level', firstRow.invalidation_level === original);
      const agree = await call({ bias: dir, low: 0.9, high: 1.3, close: 1.1 });
      const agreeRow = await Db.getBiasState('EURUSD', '15m');
      tested++;
      if (agreeRow.invalidation_level === original) retained++;
      ok(name + ': a changing range/plan does NOT move the level during agreement',
        agreeRow.invalidation_level === original && hy(agree).invalidation_level === original,
        `${original} -> ${agreeRow.invalidation_level}`);
      const disagree = await call({ bias: -dir, low: 0.85, high: 1.35, close: 1.1 });
      const disagreeRow = await Db.getBiasState('EURUSD', '15m');
      ok(name + ': disagreement holds the prior direction', disagree.momentum.bias === dir && hy(disagree).held);
      ok(name + ': disagreement still preserves ORIGINAL level and side',
        disagreeRow.invalidation_level === original && disagreeRow.invalidation_side === (dir > 0 ? 'below' : 'above'),
        JSON.stringify({ level: disagreeRow.invalidation_level, side: disagreeRow.invalidation_side }));
      const close = dir > 0 ? 0.95 : 1.25; // breaches original, but not the widened new range
      const breach = await call({ bias: -dir, close });
      if (hy(breach).invalidated && breach.momentum.bias === -dir) released++;
      ok(name + ': a close beyond ORIGINAL level releases the plan', hy(breach).invalidated && breach.momentum.bias === -dir,
        `bias=${breach.momentum.bias} invalidated=${hy(breach).invalidated}`);
      ok(name + ': a new direction may adopt its own new anchor',
        hy(breach).invalidated && hy(breach).invalidation_level === (dir > 0 ? feed.high : feed.low));
      ok(name + ': breach resets origin/age rather than ageing the old idea',
        hy(breach).invalidated && hy(breach).age_bars === 0 && hy(breach).since_t !== hy(first).since_t);
    }
  }
  console.log(` measured: ${retained}/${tested} original anchors retained after agreement; ${released}/${tested} original-level breaches released`);

  console.log('\n=== a breach is not vetoed by a still-agreeing fresh label ===');
  for (const dir of [1, -1]) {
    const name = dir > 0 ? 'long' : 'short';
    await Db.clearBiasState('EURUSD', '15m');
    await call({ anchor: 'range', bias: dir, close: 1.1, low: 1, high: 1.2 });
    const b = await call({ bias: dir, close: dir > 0 ? 0.95 : 1.25, low: 0.9, high: 1.3 });
    ok(name + ': original invalidation is reported even when fresh direction agrees', hy(b).invalidated && hy(b).changed,
      JSON.stringify(hy(b)));
    ok(name + ': direction may stay the same after re-read, with a NEW defining level',
      hy(b).invalidated && b.momentum.bias === dir && hy(b).invalidation_level === (dir > 0 ? 0.9 : 1.3));
  }

  console.log('\n=== shared lifecycle rule used by server and held-bias harness ===');
  const A = Mom.nextBiasInvalidation;
  ok('nextBiasInvalidation is exported for BOTH callers', typeof A === 'function');
  if (typeof A === 'function') {
    const proposed = { level: 90, side: 'below' };
    const old = { bias: 1, invalidation_level: 100, invalidation_side: 'below' };
    const r = { bias: 1, changed: false };
    ok('unchanged direction keeps a valid defining anchor', A({ prior: old, result: r, proposed }).level === 100);
    ok('a reported plan reset adopts the proposed anchor', A({ prior: old, result: { ...r, changed: true }, proposed }).level === 90);
    ok('flat result stores no defining anchor', A({ prior: old, result: { bias: 0, changed: true }, proposed }).level === null);
    for (const level of [null, undefined, '', NaN]) {
      ok(`missing/invalid prior anchor ${String(level)} may attach the first usable anchor`,
        A({ prior: { ...old, invalidation_level: level }, result: r, proposed }).level === 90);
    }
    ok('zero is preserved as a real number, never confused with null',
      A({ prior: { ...old, invalidation_level: 0 }, result: r, proposed }).level === 0);
    ok('a malformed prior side is not frozen forever',
      A({ prior: { ...old, invalidation_side: 'unknown' }, result: r, proposed }).side === 'below');
  }
  await Db.clearBiasState('EURUSD', '15m');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
  if (Db.db && Db.db.close) Db.db.close();
  for (const p of [file, file + '-wal', file + '-shm']) { try { fs.unlinkSync(p); } catch {} }
});
