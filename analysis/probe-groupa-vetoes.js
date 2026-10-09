/* Group A verification — the all-or-nothing rules now actually refuse trades.
 *
 * Checks, in order:
 *   1. a sub-minRR idea is refused (M7 / M96)
 *   2. outside the killzone is refused (M8)
 *   3. `waiting` is refused, and still visible so it can be alerted on (M35)
 *   4. the GRADE of a tradeable candidate no longer depends on the hour (M8)
 *   5. `no_trade` names the reason
 *
 *   node analysis/probe-groupa-vetoes.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', 'extracted', 'tradejournal');
const S = require(path.join(ROOT, 'src/bots/setup.js'));
const SMC = require(path.join(ROOT, 'src/bots/smc.js'));
const Synth = require('./harness/synth.js');

let pass = 0, fail = 0;
const ck = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n        ' + extra : '')); }
};
// A single window per seed almost never lands on entry_status==='at-entry', so the probe walks
// windows the way the harness does. Without this every check SKIPped and the suite reported a
// false green — 4 skips plus a vacuous "0 candidates, 0 unstable" pass.
const CACHE = new Map();
const series = (seed) => {
  if (!CACHE.has(seed)) {
    const c = Synth.series({ seed, bars: 1500 });
    CACHE.set(seed, { c, htf: Synth.aggregate(c, 4) });
  }
  return CACHE.get(seed);
};
const setupsAt = (seed, i, now) => {
  const { c, htf } = series(seed);
  const win = c.slice(Math.max(0, i - 300), i + 1);
  const h = htf.filter((b) => b.t <= c[i].t).slice(-80);
  const a = SMC.analyse(win, { tf: '15m', htfCandles: h.length > 30 ? h : null, now });
  if (!a || !a.ok) return [];
  return S.buildSetups(a, {
    price: c[i].c, balance: 10000, riskPct: 0.5, valuePerPoint: 100000, assetClass: 'forex',
  }).candidates.map((x) => Object.assign({ _seed: seed, _i: i }, x));
};
/** every candidate over the first `nSeeds` series, at a fixed clock */
const sweep = (nSeeds, now, want) => {
  const out = [];
  for (let seed = 1; seed <= nSeeds; seed++) {
    const { c } = series(seed);
    for (let i = 120; i < c.length - 5; i++) {
      for (const cand of setupsAt(seed, i, now)) {
        if (!want || want(cand)) out.push(cand);
        if (out.length >= 4000) return out;
      }
    }
  }
  return out;
};
// kept for the single-window call sites that do not need at-entry states
const setups = (seed, now) => setupsAt(seed, 600, now).map((x) => ({ candidates: [x] }));

console.log('\n=== 1. sub-minRR is refused (M7 / M96) ===');
{
  const hits = sweep(8, '2026-03-04T13:30:00Z',
    (c) => c.levels && c.levels.rr_final > 0 && c.levels.rr_final < 2);
  if (!hits.length) { console.log('  SKIP  no sub-2R candidate found'); }
  else {
    const c = hits[0]; const seed = c._seed;
    console.log(`  seed ${seed}  ${c.side}  rr_final=${c.levels.rr_final}  grade=${c.grade}  score=${c.score}  (of ${hits.length} sub-2R candidates)`);
    ck('EVERY sub-2R candidate is refused', hits.every((x) => x.ok === false),
      hits.filter((x) => x.ok !== false).slice(0,3).map((x)=>`seed${x._seed} ok=${x.ok} rr=${x.levels.rr_final}`).join(' / '));
    ck('sub-2R idea is ok:false', c.ok === false, 'ok=' + c.ok);
    ck('refusal names the RR floor',
      (c.no_trade || []).some((v) => /below the .*R floor/.test(v)),
      JSON.stringify(c.no_trade));
    ck('action says no trade', /^No trade/.test(c.action), c.action);
  }
}

console.log('\n=== 2. outside the killzone is refused (M8) ===');
{
  // 02:30Z is inside no killzone; 13:30Z is inside NY AM. Same candles both times.
  const atEntryOut = sweep(6, '2026-03-04T02:30:00Z',
    (c) => c.levels && c.levels.entry_status === 'at-entry');
  let outside = null, inside = null;
  if (atEntryOut.length) {
    const c = atEntryOut[0];
    outside = { seed: c._seed, c };
    inside = setupsAt(c._seed, c._i, '2026-03-04T13:30:00Z').find((x) => x.dir === c.dir);
  }
  if (!outside || !inside) { console.log('  SKIP  no at-entry candidate found'); }
  else {
    console.log(`  seed ${outside.seed}  ${outside.c.side}  02:30Z ok=${outside.c.ok}  13:30Z ok=${inside.ok}  (${atEntryOut.length} at-entry outside KZ)`);
    ck('EVERY at-entry candidate outside the killzone is refused',
      atEntryOut.every((x) => x.ok === false),
      atEntryOut.filter((x)=>x.ok!==false).slice(0,3).map((x)=>'seed'+x._seed+' ok='+x.ok).join(' / '));
    ck('at-entry outside the killzone is refused', outside.c.ok === false, 'ok=' + outside.c.ok);
    ck('refusal names the killzone',
      (outside.c.no_trade || []).some((v) => /Outside the killzone/.test(v)),
      JSON.stringify(outside.c.no_trade));
    ck('the same setup inside the killzone is not refused for that reason',
      !(inside.no_trade || []).some((v) => /Outside the killzone/.test(v)),
      JSON.stringify(inside.no_trade));
  }
}

console.log('\n=== 3. waiting is refused but stays visible (M35) ===');
{
  const ws = sweep(6, '2026-03-04T13:30:00Z',
    (c) => c.levels && c.levels.entry_status === 'waiting');
  if (!ws.length) { console.log('  SKIP  no waiting candidate found'); }
  else {
    const w = { seed: ws[0]._seed, c: ws[0] };
    console.log(`  seed ${w.seed}  ${w.c.side}  grade=${w.c.grade}  score=${w.c.score}  ok=${w.c.ok}  (${ws.length} waiting candidates)`);
    ck('EVERY waiting candidate is refused', ws.every((x) => x.ok === false),
      ws.filter((x)=>x.ok!==false).slice(0,3).map((x)=>'seed'+x._seed+' ok='+x.ok).join(' / '));
    ck('waiting is ok:false', w.c.ok === false, 'ok=' + w.c.ok);
    ck('waiting names the retrace',
      (w.c.no_trade || []).some((v) => /has not reached the point of interest/.test(v)),
      JSON.stringify(w.c.no_trade));
    ck('it is still emitted as a candidate (alertable, not hidden)', typeof w.c.action === 'string' && w.c.action.length > 0);
    // The refusal must lead, AND the setup must still say where to watch -- a `waiting` setup
    // is refused now but becomes valid at the zone, so dropping the level would hide a real alert.
    ck('its action leads with the refusal, not with "get ready"', /^No trade/.test(w.c.action), w.c.action);
    ck('it still names the zone to watch', /Watch for the retrace to/.test(w.c.action), w.c.action);
  }
}

console.log('\n=== 4. the grade of a TRADEABLE candidate is clock-independent (M8) ===');
{
  const clocks = ['2026-03-04T06:30:00Z', '2026-03-04T08:30:00Z', '2026-03-04T13:30:00Z', '2026-03-04T17:30:00Z'];
  const seen = new Map();
  for (let seed = 1; seed <= 6; seed++) {
    const { c } = series(seed);
    for (let i = 120; i < c.length - 5; i++) {
      for (const now of clocks) {
        for (const cand of setupsAt(seed, i, now)) {
          if (!cand.ok) continue;                  // only tradeable candidates
          const k = seed + ':' + i + ':' + cand.dir;
          if (!seen.has(k)) seen.set(k, new Set());
          seen.get(k).add(cand.grade + '/' + cand.score);
        }
      }
    }
  }
  const tradeable = [...seen.entries()];
  ck('the clock-independence test actually found tradeable candidates', tradeable.length > 0,
    'found ' + tradeable.length);
  const unstable = tradeable.filter(([, v]) => v.size > 1);
  console.log(`  tradeable candidates seen: ${tradeable.length}  ·  clock-stable: ${tradeable.length - unstable.length}`);
  ck('every tradeable candidate grades identically at every killzone hour',
    unstable.length === 0,
    unstable.slice(0, 5).map(([k, v]) => k + ' -> ' + [...v].join(' vs ')).join('\n        '));
}

console.log('\n=== 5. a clean setup still passes ===');
{
  const cleans = sweep(8, '2026-03-04T13:30:00Z',
    (c) => c.ok && c.levels && c.levels.entry_status === 'at-entry' && c.levels.rr_final >= 2);
  if (!cleans.length) { console.log('  SKIP  no clean candidate found'); }
  else {
    const clean = { seed: cleans[0]._seed, c: cleans[0] };
    console.log(`  seed ${clean.seed}  ${clean.c.side}  ${clean.c.grade}  rr=${clean.c.levels.rr_final}  ok=${clean.c.ok}  (${cleans.length} tradeable)`);
    ck('a valid setup is still tradeable', clean.c.ok === true);
    ck('it has no veto recorded', (clean.c.no_trade || []).length === 0, JSON.stringify(clean.c.no_trade));
  }
}

console.log(`\n ${pass}/${pass + fail} passed${fail ? '  — ' + fail + ' FAILED' : ''}\n`);
process.exit(fail ? 1 : 0);
