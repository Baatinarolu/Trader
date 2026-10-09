#!/usr/bin/env node
'use strict';
/**
 * Batch 0 probe — exercises the two changed code paths in src/bots/setup.js.
 *
 *   M6  buildSetups() must survive the short-series sentinel that SMC.analyse()
 *       returns for <30 candles: `{ ok:false, tf }` with NO `structure` key.
 *   M4  the news "all clear" string must not assert a window size or a direction.
 *
 * Run from extracted/tradejournal:  node ../../analysis/probe-batch0.js
 */
const path = require('path');
const Setup = require(path.join(process.cwd(), 'src/bots/setup.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${m}`); c ? pass++ : fail++; };

/* ---------------------------------------------------------------- M6 */
// 1. Prove the mechanism: the sentinel really has no `structure` key, and the
//    OLD expression (`analysis.structure.last_break`) really does throw on it.
const sentinel = { ok: false, tf: '15m', note: 'Not enough candles for structure analysis (need 30+).' };
ok(sentinel.structure === undefined, 'sentinel from smc.analyse() has no `structure` key');

let oldExprThrew = false, oldMsg = '';
try { void sentinel.structure.last_break; } catch (e) { oldExprThrew = true; oldMsg = e.message; }
ok(oldExprThrew, `the PRE-FIX expression throws on that sentinel: ${oldMsg}`);

// 2. Prove the fix: buildSetups() now completes instead of throwing.
let result = null, buildThrew = null;
try {
  result = Setup.buildSetups(sentinel, { price: 1.1050, newsBlackout: null });
} catch (e) { buildThrew = e; }
ok(buildThrew === null, `POST-FIX buildSetups(sentinel) does not throw${buildThrew ? ': ' + buildThrew.message : ''}`);
ok(result !== null && typeof result === 'object', 'buildSetups(sentinel) returns an object');

// 3. The degraded build must be honest, not silently optimistic.
const flat = JSON.stringify(result || {});
ok(/Structure reads ranging/.test(flat), "structure checkpoint falls back to 'ranging' rather than inventing a trend");

/* ---------------------------------------------------------------- M4 */
const checks = ((result && result.candidates) || []).flatMap((c) => c.checks || []);
const news = checks.find((c) => c.key === 'news');
ok(!!news, 'news checkpoint is present in the build');
if (news) {
  const t = String(news.detail || '');
  ok(!/next 60 minutes/.test(t), `stale "next 60 minutes" is gone (got: "${t.slice(0, 70)}")`);
  ok(!/\bnext\b/.test(t), 'does not assert a forward-only direction');
  ok(!/\b(15|30|45|60)\s*minutes/.test(t), 'does not hardcode a window that can drift from config');
}

/* ------------------------------------------------- regression: happy path */
// A normal analysis object must still produce the richer structure string.
const rich = {
  ok: true, tf: '15m', price: 1.1050,
  structure: { trend: 'bullish', last_break: { type: 'BOS', dir: 'up', bars_ago: 4, mss: false } },
  htf_structure: { trend: 'bullish' },
};
const r2 = Setup.buildSetups(rich, { price: 1.1050 });
const f2 = JSON.stringify(r2 || {});
ok(/Structure reads bullish after a BOS up 4 bars ago/.test(f2), 'happy path still renders the full last_break detail');

console.log(`\nBATCH 0 PROBE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
