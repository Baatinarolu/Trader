#!/usr/bin/env node
'use strict';
/** The final single-target headline correction changes presentation ONLY.
 * Reconstruct its immutable before-source from c326651 + the measured defensive
 * patch, compile that module against identical dependencies, and compare full
 * candidates/results over 200 actual SMC reads + 16 named composition contexts.
 * Explicit structural-input named cases are not historical discovery or edge.
 */
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { execFileSync } = require('child_process'), Module = require('module'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), APP = process.env.TJ_APP || path.join(ROOT, 'extracted/tradejournal');
const file = path.join(APP, 'src/bots/setup.js'), scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'm54-summary-'));
try {
  let before = process.env.TJ_BEFORE;
  if (!before) {
    before = path.join(scratch, 'src/bots/setup.js'); fs.mkdirSync(path.dirname(before), { recursive: true });
    fs.writeFileSync(before, execFileSync('git', ['show', 'c326651:extracted/tradejournal/src/bots/setup.js'], { cwd: ROOT }));
    const patch = path.join(ROOT, 'analysis/patches/m77-defensive-measured.patch');
    for (const check of [true, false]) execFileSync('git', ['apply', ...(check ? ['--check'] : []),
      '--include=src/bots/setup.js', patch], { cwd: scratch });
  }
  const bytes = fs.readFileSync(before);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
    'd5d8d59b745854bf112a24bf5f00315896fe41096a6380468659fc601f0200c1', 'wrong before-source');
  const moduleBefore = new Module(file); moduleBefore.filename = file;
  moduleBefore.paths = Module._nodeModulePaths(path.dirname(file)); moduleBefore._compile(bytes.toString(), file);
  const old = moduleBefore.exports, now = require(file), SMC = require(path.join(APP, 'src/bots/smc')),
    TD = require(path.join(APP, 'src/bots/topdown')), Synth = require('./harness/synth'), F = require('./helpers/target-timeframe-fixture');
  let reads = 0, named = 0, changed = 0, candidateDiffs = 0, otherDiffs = 0;
  function compare(a, ctx) {
    const b = old.buildSetups(structuredClone(a), structuredClone(ctx));
    const c = now.buildSetups(structuredClone(a), structuredClone(ctx));
    if (JSON.stringify(b.candidates) !== JSON.stringify(c.candidates)) candidateDiffs++;
    if (b.verdict.headline !== c.verdict.headline) changed++;
    b.verdict.headline = c.verdict.headline;
    if (JSON.stringify(b) !== JSON.stringify(c)) otherDiffs++;
  }
  for (let seed = 1; seed <= 20; seed++) {
    const bars = Synth.series({ seed, bars: 600 });
    for (let end = 270; end <= 540; end += 30) {
      const a = SMC.analyse(bars.slice(end - 180, end), { tf: '15m' });
      a.sessions = SMC.sessionState(new Date(bars[end - 1].t)); reads++;
      compare(a, { price: a.price, atr: a.atr, bias: 0, balance: 10000, riskPct: 1 });
    }
  }
  for (const dir of [-1, 1]) for (const model of ['market_shift', 'flip'])
    for (const ordinary of [false, true]) for (const pullback of [true, false]) {
      const f = F.named(dir, model), opts = { useBreakers: model === 'flip' };
      if (!pullback) for (const b of f.input.triggerSeries.candles.slice(118)) {
        const m = x => dir < 0 ? x : 200 - x;
        b.h = dir < 0 ? 96.2 : m(96); b.l = dir < 0 ? 96 : m(96.2); b.c = m(96.1);
      }
      for (const s of [f.input.series, f.input.biasSeries, f.input.triggerSeries])
        s.smc.sessions = SMC.sessionState(new Date(f.END));
      const base = TD.build({ ...f.input, opts });
      const td = ordinary ? F.asOrdinaryCRT(base, f) : base;
      compare(f.input.series.smc, { price: f.input.series.price, atr: 1, bias: f.htfDir,
        topdown: td, balance: 10000, riskPct: .5, valuePerPoint: 1, ...opts }); named++;
    }
  assert.equal(candidateDiffs, 0); assert.equal(otherDiffs, 0); assert.ok(changed > 0);
  console.log(JSON.stringify({ detector_reads: reads, named_contexts: named,
    full_candidate_array_differences: candidateDiffs, non_headline_result_differences: otherDiffs,
    headline_changes: changed }));
  console.log('M54 SUMMARY: before-source verified; 216 comparisons; presentation-only invariance PASS');
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
