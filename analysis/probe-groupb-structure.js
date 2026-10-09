/* Group B verification — Ep 5 structure rules (M23, M24).
 *
 *   1. M23  mss is derived from the sweep test, not a synonym for CHoCH
 *   2. M24  a CHoCH requires the strong level, so a pullback is not a reversal
 *   3. the up/down asymmetry is gone — a bullish reversal is detectable at all
 *   4. HONESTY CHECK: these are report-only. Assert that no decision consumes them, so the
 *      claim "the backtest did not move" is verified rather than assumed.
 *
 *   node analysis/probe-groupb-structure.js     (run from anywhere)
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(ROOT, 'src/bots/smc.js'));
const Synth = require('./harness/synth.js');

let pass = 0, fail = 0;
const ck = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n        ' + extra : '')); }
};

const SER = [];
for (let seed = 1; seed <= 40; seed++) SER.push(Synth.series({ seed, bars: 300 }));
const AN = SER.map((s) => SMC.analyse(s, { tf: '15m' })).filter((a) => a && a.structure);

const allBreaks = [];
for (const a of AN) for (const e of a.structure.breaks) allBreaks.push({ a, e });
const choch = allBreaks.filter((x) => x.e.type === 'CHoCH');
const bos = allBreaks.filter((x) => x.e.type === 'BOS');

console.log(`\n ${AN.length} series analysed · ${allBreaks.length} breaks · ${choch.length} CHoCH · ${bos.length} BOS`);

console.log('\n=== 1. M23 — mss comes from the sweep test ===');
{
  const chMss = choch.filter((x) => x.e.mss).length;
  console.log(`  CHoCH with mss=true ${chMss} / ${choch.length}`);
  ck('mss is not simply true for every CHoCH (the old behaviour)',
    chMss < choch.length, `${chMss}/${choch.length} were true`);
  ck('every CHoCH flagged mss carries the sweep that justified it',
    choch.filter((x) => x.e.mss).every((x) => !!x.e.swept),
    JSON.stringify(choch.filter((x) => x.e.mss).map((x) => x.e.swept)));
  ck('no BOS carries mss', bos.every((x) => !x.e.mss));
  // last_break must agree with the last element of breaks — it is a copy, so it can drift
  let drift = 0;
  for (const a of AN) {
    const b = a.structure.breaks[a.structure.breaks.length - 1];
    const lb = a.structure.last_break;
    if (b && lb && (!!b.mss !== !!lb.mss)) drift++;
  }
  ck('structure.last_break.mss agrees with the last break', drift === 0, drift + ' series disagree');
}

console.log('\n=== 2. M24 — a CHoCH required the strong level ===');
{
  ck('every CHoCH broke a strong level', choch.every((x) => x.e.broke_strong === true),
    choch.filter((x) => !x.e.broke_strong).length + ' did not');
  ck('every CHoCH was also a direction flip', choch.every((x) => x.e.flipped === true));
  const flips = allBreaks.filter((x) => x.e.flipped);
  const flipNotStrong = flips.filter((x) => !x.e.broke_strong);
  console.log(`  direction flips ${flips.length}, of which ${flipNotStrong.length} did NOT break the strong level`);
  ck('the strong test actually excludes flips (a pullback is not a reversal)',
    flipNotStrong.length > 0, 'every flip broke the strong level — the test excludes nothing');
}

console.log('\n=== 3. the up/down asymmetry is gone ===');
{
  const up = choch.filter((x) => x.e.dir === 'up').length;
  const dn = choch.filter((x) => x.e.dir === 'down').length;
  console.log(`  CHoCH up=${up} down=${dn}`);
  ck('up-direction CHoCH occur (bullish reversals are detectable)', up > 0,
    'up=' + up + ' — the old code produced exactly 0 across 40 series');
  ck('both directions occur', up > 0 && dn > 0);
}

console.log('\n=== 4. HONESTY CHECK — are these values consumed by any decision? ===');
{
  // Read the source and assert where CHoCH/mss are actually used. If someone later wires them
  // into a gate, this test fails and the "report-only" claim in the ledger must be updated.
  const consumers = [];
  for (const f of ['src/bots/setup.js', 'src/bots/momentum.js', 'src/bots/topdown.js',
    'src/bots/predict.js', 'src/bots/index.js', 'src/bots/correction.js']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (/CHoCH|\.mss\b|broke_strong|\.flipped\b/.test(l) && !/^\s*(\*|\/\/)/.test(l)) {
        consumers.push(`${f}:${i + 1}  ${l.trim().slice(0, 88)}`);
      }
    });
  }
  console.log('  non-comment references outside smc.js:');
  consumers.forEach((c) => console.log('    ' + c));
  const inTemplateOnly = consumers.every((c) => /\$\{|`|text:|detail|add\(/.test(c));
  ck('every consumer is a display string, not a pass/fail condition', inTemplateOnly,
    consumers.filter((c) => !/\$\{|`|text:|detail|add\(/.test(c)).join('\n        '));
  console.log('\n  => M23/M24 correct what the bot SAYS about structure. They do not gate');
  console.log('     trades, which is why the 60-seed backtest is unchanged (156 / -0.2845R).');
}

console.log(`\n ${pass}/${pass + fail} passed${fail ? '  — ' + fail + ' FAILED' : ''}\n`);
process.exit(fail ? 1 : 0);
