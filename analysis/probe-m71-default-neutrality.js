#!/usr/bin/env node
'use strict';
/** Explain the intentional historical M76/M78 full-object parity failures with
 * an exhaustive path-level comparison against exact 184695d. Do not strip old
 * prices/gates/grades/risk. Only explicitly checked new RR metadata/narration
 * may differ; all remaining fields of the ENTIRE default Setup output must match.
 */
const path = require('path'), fs = require('fs');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const CONTROL = process.env.M71_CONTROL || '/tmp/m71-control/extracted/tradejournal';
const S = require(path.join(APP, 'src/bots/setup')), O = require(path.join(CONTROL, 'src/bots/setup')),
  M = require(path.join(APP, 'src/bots/smc')), Y = require('./harness/synth');
let reads = 0, unexpected = [], counts = {};
function walk(a, b, p, rootA, rootB) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k, rootA, rootB);
    return;
  }
  counts[p] = (counts[p] || 0) + 1;
  const match = p.match(/^candidates\.(\d+)\./), c = match ? rootB.candidates[Number(match[1])] : null;
  let allowed = false;
  if (/^candidates\.\d+\.levels\.rr_primary_exact$/.test(p)) allowed = a === undefined && Number.isFinite(b)
    && b === c.levels.rr_final_exact && c.levels.targets.length <= 1;
  if (/^candidates\.\d+\.levels\.rr_floor$/.test(p)) allowed = a === undefined && b.rule === 'primary_target'
    && b.min_rr === 2 && b.rr === c.levels.rr_primary_exact
    && b.passed === (c.levels.targets.length > 0 && b.rr + 1e-9 >= b.min_rr);
  if (/^candidates\.\d+\.levels\.management\.rule$/.test(p)) allowed = a === 'Single target: manage as one position, trail behind structure after 1R.'
    && b === 'Single target: set and forget the defined stop and selected target; no partials or break-even move.';
  if (/^candidates\.\d+\.checks\.\d+\.label$/.test(p)) allowed = a === 'Risk plan protects the trade at the first pool'
    && b === 'First paid target meets the configured minimum RR';
  // Veto text and action quote change, not membership/decision or geometry.
  if (/^candidates\.\d+\.(no_trade\.\d+|action)$/.test(p)) {
    const normalize = s => typeof s === 'string' ? s.replace(/First-target risk:reward/g, 'Risk:reward')
      .replace(/; a farther runner cannot rescue it/g, '') : s;
    allowed = normalize(a) === normalize(b);
  }
  if (!allowed) unexpected.push({ path: p, before: a, after: b });
}
for (let seed = 1; seed <= 5; seed++) {
  const bars = Y.series(seed, 500);
  for (let i = 200; i < 500; i += 15) {
    const a = M.analyse(bars.slice(Math.max(0, i - 299), i + 1), { tf: '15m', now: bars[i].t, swingMode: 'bos', nested: true });
    const ctx = { price: bars[i].c, atr: a.atr || 1, bias: seed % 2 ? 1 : -1,
      balance: 10000, riskPct: .5, minRR: 2, observedAt: bars[i].t + 900000 };
    const old = O.buildSetups(a, ctx), now = S.buildSetups(a, ctx); reads++; walk(old, now, '', old, now);
  }
}
const result = { reads, candidates: reads * 2, allowed_path_counts: counts, unexpected_differences: unexpected,
  scope: 'Full default-output comparison, allowing only individually validated M71 added metadata/narration. Not optional ladder parity or market edge.' };
if (process.env.M71_RESULT) fs.writeFileSync(process.env.M71_RESULT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
console.log(`M71 default full-object neutrality: ${reads === 100 && !unexpected.length ? '1 passed, 0 failed' : '0 passed, 1 failed'}`);
process.exitCode = reads === 100 && !unexpected.length ? 0 : 1;
