/* M41 — the Asia session range as a liquidity level.
 *
 * Run from the REPO ROOT:  node analysis/probe-m41-asia-range.js
 *   TJ_APP=/path/to/app node analysis/probe-m41-asia-range.js   (negative control)
 *
 * His playbook: *"If the daily structure is bullish, what tends to happen is that price will
 * sweep the Asia high, creates the high of the day, and then goes down… if price is actually
 * bearish, then… price can come up there, sweep the Asia low… and then reverse and go back
 * up."* Nothing in src/ marked an Asia high or low, so the pool could not be swept.
 *
 * SCOPE, stated up front: this probe covers the LEVEL and the sweep DETECTION that falls out
 * of it for free (findSweeps reads the pool list and stamps `pool: p.kind`). It does not
 * assert the directional playbook — bullish daily structure implying a fade of the Asia high
 * into the high of the day — because he qualifies it twice ("not always, right?", "sometimes
 * this Asia sweep strategy works really, really well") and points to a video outside this
 * playlist. That half stays scoped out and is recorded as such in the ledger row.
 *
 * Bars are crafted, not random, where an assertion needs a specific event: a random walk
 * cannot be told to spike through the Asia high and close back inside it.
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const S = require(path.join(APP, 'src/bots/smc.js'));

let pass = 0, fail = 0, skip = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         ' + detail : '')); }
}
const M15 = 15 * 60 * 1000, H1 = 3600 * 1000;

/* A flat series at 1.1000 with a bump inside the Asia window and a spike after it.
 * `asiaBump` sets the Asia high/low; `spike` is the post-Asia excursion that should sweep. */
function crafted(endIso, { asiaHigh = 1.1050, asiaLow = 1.0950, spikeHigh = null, spikeLow = null, preHigh = null, preLow = null, bars = 96 } = {}) {
  const end = Date.parse(endIso);
  const out = [];
  for (let i = bars - 1; i >= 0; i--) {
    const t = end - i * M15;
    const d = new Date(t);
    const nyH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(d));
    let h = 1.1010, l = 1.0990;
    if (nyH >= 20) {                       // inside the Asia window: build the range
      if (nyH === 21) { h = asiaHigh; l = 1.1000; }
      if (nyH === 22) { h = 1.1000; l = asiaLow; }
    } else if (preHigh !== null && nyH === 12) { h = preHigh; l = 1.1000; }      // earlier high, above the range
    else if (preLow !== null && nyH === 13) { h = 1.1000; l = preLow; }          // earlier low, below the range
    else if (spikeHigh !== null && nyH === 3) { h = spikeHigh; l = 1.1000; }   // London spike
    else if (spikeLow !== null && nyH === 4) { h = 1.1000; l = spikeLow; }
    out.push({ t, o: 1.1000, h, l, c: 1.1000 });
  }
  return out;
}
function walk(n, end, step, seed) {
  let x = seed, out = [], p = 1.10;
  const r = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  for (let i = n - 1; i >= 0; i--) {
    const t = end - i * step, d = (r() - 0.5) * 0.004, o = p, c = p + d;
    out.push({ t, o, h: Math.max(o, c) + r() * 0.0015, l: Math.min(o, c) - r() * 0.0015, c });
    p = c;
  }
  return out;
}

console.log('\n=== 1. The range is marked, and it is the Asia window\'s, not the day\'s ===');
if (typeof S.asiaRange !== 'function') {
  /* Negative control: on a tree without M41 these three are the whole claim, so fail all
   * three and stop rather than throwing on the first property access further down. */
  ok('asiaRange() exists', false, 'absent on this tree — M41 not applied');
  ok('an ASIA_HIGH / ASIA_LOW liquidity pool exists', false, 'no asiaRange, so no Asia pools');
  ok('a sweep of the Asia high is detectable', false, 'no Asia pool means findSweeps cannot see one');
  console.log('\n' + pass + ' passed / ' + fail + ' failed');
  process.exit(1);
}
{
  // 2026-07-15T08:00Z = 04:00 EDT; the Asia window ran 00:00-04:00 UTC on the 15th, and
  // the one before it 00:00-04:00 UTC on the 14th — the completed one is the 14th's.
  const cs = crafted('2026-07-15T08:00:00Z', {});
  const ar = S.asiaRange(cs);
  ok('a completed Asia range is returned', !!ar && ar.forming === false, JSON.stringify(ar));
  ok('its high and low are the ones built inside the window', !!ar && ar.high === 1.1050 && ar.low === 1.0950,
    ar ? 'high=' + ar.high + ' low=' + ar.low : 'null');
  ok('mid and range are consistent', !!ar && Math.abs(ar.mid - (ar.high + ar.low) / 2) < 1e-9
    && Math.abs(ar.range - (ar.high - ar.low)) < 1e-9, JSON.stringify(ar && { mid: ar.mid, range: ar.range }));
  ok('it reports the window it used, in ET', !!ar && /20:00-24:00 ET/.test(ar.window_et || ''), ar && ar.window_et);
  ok('it counts the bars it was built from', !!ar && ar.bars > 0, ar && String(ar.bars));
  // Winter: the same ET window sits an hour later in UTC, so a UTC-hardcoded range would miss it.
  const cw = crafted('2026-01-15T08:00:00Z', {});
  const aw = S.asiaRange(cw);
  ok('the winter range is found at the EST hours (not UTC-hardcoded)', !!aw && aw.high === 1.1050 && aw.low === 1.0950,
    JSON.stringify(aw && { day: aw.day, high: aw.high, low: aw.low }));
  ok('and it is a different ET day from the summer case', !!ar && !!aw && ar.day !== aw.day, (ar && ar.day) + ' vs ' + (aw && aw.day));
}

console.log('\n=== 2. It is a liquidity pool alongside PDH/PDL ===');
{
  /* The excursion has to be a LONDON spike, not an earlier pre-Asia bar, and the reason is
   * worth stating because the first draft of this probe got it wrong: the Asia window's bars
   * (20:00-24:00 ET) fall in the NEXT UTC day (00:00-04:00Z), which is also the series' last
   * UTC day, so `prevDay` resolves to that day and PDH/PDL land on exactly the Asia high/low.
   * A pre-Asia bar only moves PWH/PWL and leaves the PDH coincidence in place, so the Asia
   * pools dedupe away and this section tests nothing. Spiking beyond the range during London
   * moves the day extreme, which is what makes the Asia level a distinct pool. Section 2b
   * covers the coincident case, where the survivor must carry the Asia label as `also`. */
  const cs = crafted('2026-07-15T08:00:00Z', { spikeHigh: 1.1090, spikeLow: 1.0910 });
  const an = S.analyse(cs, { tf: '15m' });
  const liq = an.liquidity || {};
  const kinds = (liq.pools || []).map((p) => p.kind);
  ok('liquidity() exposes asia_range next to pdh/pdl', !!liq.asia_range && 'pdh' in liq,
    JSON.stringify({ asia: !!liq.asia_range, pdh: 'pdh' in liq }));
  ok('an ASIA_HIGH pool exists', kinds.indexOf('ASIA_HIGH') !== -1, kinds.join(','));
  ok('an ASIA_LOW pool exists', kinds.indexOf('ASIA_LOW') !== -1, kinds.join(','));
  const hi = (liq.pools || []).find((p) => p.kind === 'ASIA_HIGH');
  const lo = (liq.pools || []).find((p) => p.kind === 'ASIA_LOW');
  ok('ASIA_HIGH is buyside at the range high', !!hi && hi.type === 'BSL' && hi.price === 1.1050, JSON.stringify(hi));
  ok('ASIA_LOW is sellside at the range low', !!lo && lo.type === 'SSL' && lo.price === 1.0950, JSON.stringify(lo));
  ok('both sit above the generic swing pools in strength (0.55) and at or below PDH/PDL (0.9)',
    !!hi && !!lo && hi.strength > 0.55 && hi.strength <= 0.9 && lo.strength === hi.strength,
    'high=' + (hi && hi.strength) + ' low=' + (lo && lo.strength));
}

console.log('\n=== 2b. When the Asia range IS the day extreme, the attribution survives ===');
{
  /* The common case, and the one that broke the first draft of this probe: the Asia window's
   * bars fall in the same UTC day as the series' last day, so PDH/PDL land on exactly the Asia
   * high/low. Dedupe keeps one pool per price — correct — but it used to keep PDH (strength
   * 0.9) and throw the Asia label away, so a sweep of the Asia high was reported as "Previous
   * day high" and his playbook could not be told apart from a generic day-extreme run. */
  const cs = crafted('2026-07-15T08:00:00Z', {});          // no pre-Asia excursion: they coincide
  const an = S.analyse(cs, { tf: '15m' });
  const pools = (an.liquidity || {}).pools || [];
  const atAsiaHigh = pools.find((x) => x.price === 1.1050 && x.type === 'BSL');
  const atAsiaLow = pools.find((x) => x.price === 1.0950 && x.type === 'SSL');
  ok('one pool survives at the Asia high price', !!atAsiaHigh, JSON.stringify(pools.map((x) => [x.kind, x.price])));
  ok('and it records that it is ALSO the Asia session high',
    !!atAsiaHigh && Array.isArray(atAsiaHigh.also) && atAsiaHigh.also.indexOf('ASIA_HIGH') !== -1,
    JSON.stringify(atAsiaHigh && { kind: atAsiaHigh.kind, also: atAsiaHigh.also }));
  ok('the Asia label text is carried too, not just the kind',
    !!atAsiaHigh && (atAsiaHigh.also_labels || []).some((l) => /Asia session high/.test(l)),
    JSON.stringify(atAsiaHigh && atAsiaHigh.also_labels));
  ok('same for the Asia low / PDL coincidence',
    !!atAsiaLow && (atAsiaLow.also || []).indexOf('ASIA_LOW') !== -1,
    JSON.stringify(atAsiaLow && { kind: atAsiaLow.kind, also: atAsiaLow.also }));
}

console.log('\n=== 3. Sweeping it is now detectable — the half that comes free ===');
{
  const cs = crafted('2026-07-15T08:00:00Z', { spikeHigh: 1.1075 });   // London runs the Asia high
  const an = S.analyse(cs, { tf: '15m' });
  const sw = an.sweeps || [];
  const asia = sw.filter((x) => /^ASIA/.test(x.pool || ''));
  ok('a spike through the Asia high registers as a sweep OF the Asia high',
    asia.some((x) => x.pool === 'ASIA_HIGH'), JSON.stringify(sw.map((x) => x.pool)));
  ok('that sweep is on the buyside and carries the pool label',
    asia.some((x) => x.pool === 'ASIA_HIGH' && x.type === 'BSL' && /Asia session high/.test(x.pool_label || '')),
    JSON.stringify(asia[0] || null));
  const cs2 = crafted('2026-07-15T09:00:00Z', { spikeLow: 1.0925 });   // London runs the Asia low
  const an2 = S.analyse(cs2, { tf: '15m' });
  const asia2 = (an2.sweeps || []).filter((x) => /^ASIA/.test(x.pool || ''));
  ok('a dive through the Asia low registers as a sweep OF the Asia low',
    asia2.some((x) => x.pool === 'ASIA_LOW' && x.type === 'SSL'), JSON.stringify((an2.sweeps || []).map((x) => x.pool)));
  // negative control: no excursion, no Asia sweep
  const cs3 = crafted('2026-07-15T08:00:00Z', {});
  const an3 = S.analyse(cs3, { tf: '15m' });
  ok('with no excursion through the range, no Asia sweep is invented',
    (an3.sweeps || []).filter((x) => /^ASIA/.test(x.pool || '')).length === 0,
    JSON.stringify((an3.sweeps || []).map((x) => x.pool)));
}

console.log('\n=== 4. A range still forming is labelled, not passed off as complete ===');
{
  // 2026-07-15T02:00Z = 22:00 EDT, inside the window: the current range is incomplete.
  const cs = crafted('2026-07-15T02:00:00Z', {});
  const ar = S.asiaRange(cs);
  ok('the completed previous window is still the primary answer', !!ar && ar.forming === false, JSON.stringify(ar));
  ok('the window still building is exposed as forming_now', !!ar && !!ar.forming_now && ar.forming_now.bars > 0,
    JSON.stringify(ar && ar.forming_now));
  // A series that holds no completed window must say so rather than silently using a partial one.
  const short = walk(8, Date.parse('2026-07-15T13:00:00Z'), M15, 3);
  ok('a series with no Asia window at all returns null', S.asiaRange(short) === null, JSON.stringify(S.asiaRange(short)));
  ok('empty and malformed input return null instead of throwing',
    S.asiaRange([]) === null && S.asiaRange(null) === null && S.asiaRange([{ t: Date.now(), h: 1, l: 1 }]) === null);
}

console.log('\n=== 5. Cost: the memoised New York clock ===');
{
  const cs = walk(3000, Date.parse('2026-07-15T08:00:00Z'), H1, 17);   // 3000 hourly bars ~ 125 days
  const t0 = Date.now();
  let ar = null;
  for (let i = 0; i < 5; i++) ar = S.asiaRange(cs);
  const ms = Date.now() - t0;
  ok('3000 bars resolve five times in under 250ms total', ms < 250, ms + 'ms');
  ok('and still return a sane range on a long series', !!ar && ar.high > ar.low && ar.bars > 0,
    JSON.stringify(ar && { day: ar.day, bars: ar.bars, high: ar.high, low: ar.low }));
  console.log('    5 x asiaRange(3000 bars) = ' + ms + 'ms');
}

console.log('\n' + pass + ' passed / ' + fail + ' failed' + (skip ? ' / ' + skip + ' skipped' : ''));
process.exit(fail ? 1 : 0);
