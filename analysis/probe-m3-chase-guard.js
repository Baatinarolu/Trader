/* M3 — Ep 5's timing rule: the anti-chase gate is keyed to the BREAK OF STRUCTURE, not to
 * distance from a zone.
 *
 * Run from the REPO ROOT:  node analysis/probe-m3-chase-guard.js
 * Pristine negative control: TJ_APP=/tmp/p3/tradejournal node analysis/probe-m3-chase-guard.js
 *
 * Ep 2, in the audit's words "the clearest statement in the series so far", reinforces
 * Ep 5's "after a break of structure... expect... retracing" rule:
 *   "your goal as a trader is to get in during the balance phase, so that you can capture the
 *    imbalance. Your goal is not to get in after the imbalance, but rather before the
 *    imbalance."
 * and the failure mode he names for it:
 *   "The reason why they fail is because they tend to chase after price during an
 *    expansion... It's because you are not trading price. You are just trading your ego."
 *
 * The bot already refused a chase, but by ZONE DISTANCE (entry_status 'waiting', and the
 * action string's "Chasing here breaks the model's edge"). The two rules are not equivalent:
 * price can be far from a zone and mid-expansion, or NEAR a zone and mid-expansion. The
 * second is what the zone rule cannot see, and it is what this probe is here to prove is now
 * refused — along with the thing that makes the gate honest rather than merely stricter: it
 * fires on EXACTLY M25's classifier, on nothing else, and it can be switched off.
 */
const path = require('path');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc.js'));
const SU = require(path.join(APP, 'src/bots/setup.js'));

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         ' + detail : '')); }
}
function note(text) { console.log('    note ' + text); }
function absent(name, why) { fail++; console.log('  FAIL ' + name + '\n         (absent in this tree) ' + why); }

function walk(n, endMs, stepMs, seed) {
  let x = seed, out = [];
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  let p = 1.10;
  for (let i = n - 1; i >= 0; i--) {
    const t = endMs - i * stepMs;
    const d = (rnd() - 0.5) * 0.004;
    const o = p, c = p + d;
    out.push({ t, o, h: Math.max(o, c) + rnd() * 0.0015, l: Math.min(o, c) - rnd() * 0.0015, c });
    p = c;
  }
  return out;
}

/* Pinned inside the London killzone with a pair London wants, so the session vetoes (M8/M26)
 * stay out of the way and this probe measures the timing rule on its own. */
const ISO = '2026-07-15T07:00:00Z';
const END = Date.parse(ISO);

function build(an, sym, extra) {
  const ctx = { price: an.price, atr: an.atr, bias: 1, biasReason: 'probe',
    balance: 10000, riskPct: 1, maxRiskPct: 2, minRR: 2, symbol: sym };
  if (extra) for (const k of Object.keys(extra)) ctx[k] = extra[k];
  return SU.buildSetups(an, ctx);
}
const series = (seed) => {
  const an = SMC.analyse(walk(400, END, 15 * 60 * 1000, seed), { tf: '15m' });
  an.sessions = SMC.sessionState(new Date(ISO));
  return an;
};
const chaseVeto = (c) => /Chasing an expansion/i.test(String(c.no_trade || ''));

/* The OFF arm is the observation instrument: it reports the classifier's phase without
 * acting on it, so "the gate fires exactly when the classifier says expansion" is testable
 * rather than assumed. */
const HAS = (() => {
  try {
    const r = build(series(1), 'EURUSD', { chaseGuard: false });
    return !!(r && r.filters && r.filters.chase_guard && typeof r.filters.chase_guard.phase === 'string');
  } catch (e) { return false; }
})();

if (!HAS) {
  console.log('\n=== this tree has no phase-keyed chase gate (expected on the pristine zip) ===');
  absent('buildSetups reports filters.chase_guard', 'no chase_guard field');
  absent('a candidate during an expansion is refused', 'no gate');
  absent('the refusal quotes Ep 2 rather than zone distance', 'no message');
  absent('the gate fires on exactly the classifier and nothing else', 'no classifier link');
  absent('chaseGuard:false reproduces the pre-M3 engine', 'no opt-out');
  absent('"BOS just printed, expect retrace" is a distinct reported state', 'no state');
  absent('the near-zone-mid-expansion case the zone rule cannot see is refused', 'no gate');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

console.log('\n=== 1. The state is reported, and the opt-out arm reports it without acting ===');
const counts = { expansion: 0, pullback: 0, balance: 0, unknown: 0 };
const perSeed = [];
for (let seed = 1; seed <= 80; seed++) {
  const an = series(seed);
  const off = build(an, 'EURUSD', { chaseGuard: false });
  const on = build(an, 'EURUSD');
  const g = off.filters.chase_guard;
  counts[g.phase] = (counts[g.phase] || 0) + 1;
  perSeed.push({ seed, phase: g.phase, ago: g.bars_since_break, off, on, an });
}
{
  const g = perSeed[0].off.filters.chase_guard;
  ok('chase_guard reports on / phase / bars_since_break / blocking / note',
    ['on', 'phase', 'bars_since_break', 'blocking', 'note'].every((k) => k in g), Object.keys(g).join(','));
  ok('the opt-out arm reports the phase but does not block',
    perSeed.every((p) => p.off.filters.chase_guard.on === false && p.off.filters.chase_guard.blocking === false), '');
  ok('the shipped arm marks blocking exactly when the phase is expansion',
    perSeed.every((p) => p.on.filters.chase_guard.blocking === (p.on.filters.chase_guard.phase === 'expansion')), '');
  console.log('    phase distribution over ' + perSeed.length + ' series: ' + JSON.stringify(counts));
}

console.log('\n=== 2. The gate fires on EXACTLY the classifier, and on every candidate ===');
{
  const exp = perSeed.filter((p) => p.phase === 'expansion');
  const other = perSeed.filter((p) => p.phase !== 'expansion');
  ok('expansion series exist in the sample (denominator, not a vacuous pass)', exp.length > 0, 'expansion=' + exp.length);
  ok('every candidate of an expansion series is refused when the guard is on',
    exp.every((p) => p.on.candidates.length > 0 && p.on.candidates.every(chaseVeto)),
    exp.filter((p) => !p.on.candidates.every(chaseVeto)).map((p) => p.seed).join(','));
  ok('no candidate of an expansion series carries the chase veto when the guard is off',
    exp.every((p) => p.off.candidates.every((c) => !chaseVeto(c))), '');
  ok('no candidate of a NON-expansion series is refused by this gate, in either arm',
    other.every((p) => p.on.candidates.every((c) => !chaseVeto(c)) && p.off.candidates.every((c) => !chaseVeto(c))),
    'other=' + other.length);
  ok('the opt-out arm is not merely quieter — it is at least as tradeable',
    exp.every((p) => p.off.candidates.filter((c) => c.ok).length >= p.on.candidates.filter((c) => c.ok).length), '');
  const msg = exp.length ? String(exp[0].on.candidates[0].no_trade) : '';
  ok('the refusal quotes Ep 2, not zone distance', /before the imbalance/.test(msg), msg.slice(0, 150));
  ok('the refusal names the break-of-structure event and its age',
    /break of structure printed \d+ bars? ago/.test(msg), msg.slice(0, 150));
  const consistent = exp.every((p) => {
    const n = p.on.filters.chase_guard.bars_since_break;
    return String(p.on.candidates[0].no_trade).indexOf(`printed ${n} bar${n === 1 ? '' : 's'} ago`) !== -1;
  });
  ok('the age in the message is the classifier\'s own bars_since_break', consistent, '');
  ok('the age is inside the classifier\'s RECENT window (5 bars), never beyond it',
    exp.every((p) => Number(p.on.filters.chase_guard.bars_since_break) <= 5), '');
}

console.log('\n=== 3. The case the zone-distance rule cannot see ===');
{
  /* "price can be far from a zone and mid-expansion, or NEAR a zone and mid-expansion" —
   * the second is the whole point of keying the rule to the BOS. M35 already refuses the
   * first (entry_status 'waiting'), so a gate that only fired there would change nothing. */
  let near = 0, far = 0, nearTradedOff = 0;
  for (const p of perSeed.filter((x) => x.phase === 'expansion')) {
    for (let i = 0; i < p.on.candidates.length; i++) {
      const st = p.on.candidates[i].levels && p.on.candidates[i].levels.entry_status;
      if (st === 'at-entry' || st === 'approaching') { near++; if (p.off.candidates[i].ok) nearTradedOff++; }
      else if (st === 'waiting') far++;
    }
  }
  ok('near-zone-mid-expansion candidates occur, and are now refused', near > 0,
    'near(at-entry/approaching)=' + near + ' far(waiting)=' + far);
  /* The invariant that holds in both worlds: anything the gate now refuses was refused or is
   * refused for the stated reason — no candidate silently changes status. */
  let flipped = 0;
  for (const p of perSeed.filter((x) => x.phase === 'expansion')) {
    for (let i = 0; i < p.on.candidates.length; i++) {
      const st = p.on.candidates[i].levels && p.on.candidates[i].levels.entry_status;
      if (st !== 'at-entry' && st !== 'approaching') continue;
      if (p.off.candidates[i].ok && chaseVeto(p.on.candidates[i])) flipped++;
      ok('a near-zone expansion candidate is either already refused, or refused by this gate',
        !p.off.candidates[i].ok || (p.on.candidates[i].ok === false && chaseVeto(p.on.candidates[i])),
        'seed ' + p.seed + ' candidate ' + i + ' status ' + st);
    }
  }
  console.log('    during expansion: ' + near + ' candidate(s) at/near a zone, ' + far + ' waiting; '
    + nearTradedOff + ' of the near ones traded before the gate (' + flipped + ' flipped by it)');
  /* MEASURED RARITY, recorded rather than dressed up: the audit expected the phase rule and
   * the zone rule to differ materially ("near a zone and mid-expansion"). Over this sample
   * they differ in `flipped` candidates. The harness at 200 seeds x 1500 bars finds the same
   * thing at trade-count level: 99 fills -> 97. Those aggregate counts do NOT identify
   * the rejected signal population: cooldown also changes later entries. The natural
   * at-entry fixture below proves the gate can be the sole veto, without guessing why
   * the 80-series sample's candidates were already refused. */
  if (flipped === 0) note('no candidate in this sample was refused ONLY by the chase gate; the harness measures 2 such trades in 99.');
}

console.log('\n=== 4. Precedence: the sharper reason leads, and nothing is lost ===');
{
  const both = perSeed.find((p) => p.phase === 'expansion'
    && p.on.candidates.some((c) => c.levels && c.levels.entry_status === 'waiting'));
  if (!both) {
    ok('a series where BOTH the chase gate and M35\'s zone veto apply', false, 'none in 80 seeds');
  } else {
    const c = both.on.candidates.find((x) => x.levels && x.levels.entry_status === 'waiting');
    ok('a series where BOTH the chase gate and M35\'s zone veto apply', true, '');
    ok('the action string leads with the timing reason', /^No trade — Chasing an expansion/.test(String(c.action)), String(c.action).slice(0, 140));
    ok('...and still carries M35\'s watch instruction, so the level is not lost',
      /Watch for the retrace to/.test(String(c.action)), String(c.action).slice(0, 200));
    ok('both reasons are present in the candidate', /Chasing an expansion/.test(String(c.no_trade))
      && /has not reached the point of interest/.test(String(c.no_trade)), String(c.no_trade).slice(0, 200));
  }
  /* The window rules are not masked by the new one. Note that vetoes[0] is simply whichever
   * rule pushes first, and M69's market-shift veto sits AHEAD of the session one — that is the
   * pre-existing order, not something M3 changed — so what is assertable is that the session
   * refusal is still recorded and that the chase reason does not become the leading one. */
  const expSeed = perSeed.find((p) => p.phase === 'expansion');
  const an = series(expSeed.seed);
  an.sessions = SMC.sessionState(new Date('2026-07-15T17:30:00Z'));   // dead zone, no window open
  const r = build(an, 'EURUSD');
  const c0 = r.candidates[0];
  ok('outside every killzone, with the phase at expansion, BOTH refusals are recorded',
    /Outside the killzone/.test(String(c0.no_trade)) && /Chasing an expansion/.test(String(c0.no_trade)),
    String(c0.no_trade).slice(0, 230));
  ok('...and the chase reason does not displace the earlier veto as the leading one',
    !/^No trade — Chasing an expansion/.test(String(c0.action)), String(c0.action).slice(0, 160));
}

console.log('\n=== 5. The classifier is M25\'s, used as defined (one threshold, one source) ===');
{
  const src = require('fs').readFileSync(path.join(APP, 'src/bots/setup.js'), 'utf8');
  const decls = (src.match(/const RECENT = \d+/g) || []).length;
  ok('RECENT is declared once — the gate did not bring its own bar count', decls === 1, 'declarations=' + decls);
  const calls = (src.match(/= marketPhase\(/g) || []).length;
  ok('the gate calls no second classifier (one assignment, one definition)',
    calls === 1 && (src.match(/function marketPhase\(/g) || []).length === 1,
    'assignments=' + calls + ' mentions=' + (src.match(/marketPhase\(/g) || []).length);
  ok('the gate reads the classifier, not the raw structure field',
    /chaseGuard && phaseInfo\.phase === 'expansion'/.test(src), '');
}

console.log('\n=== 6. A natural at-entry fixture, and the classifier boundary ===');
{
  // Found in the measured walk-forward arm, not invented to flatter the new gate:
  // seed 6 / bar 797 is a bullish BOS 3 bars ago, at entry, grade A, with NO other veto.
  const synth = require('./harness/synth');
  const cs = synth.series({ seed: 6, bars: 1500 });
  const i = 797;
  const h = synth.aggregate(cs, 4).filter((b) => b.t <= cs[i].t).slice(-80);
  const an = SMC.analyse(cs.slice(i - 300, i + 1), {
    tf: '15m', htfCandles: h, now: cs[i].t,
  });
  const ctx = { price: cs[i].c, balance: 10000, riskPct: 1,
    valuePerPoint: 100000, assetClass: 'forex' };
  const off = SU.buildSetups(an, { ...ctx, chaseGuard: false });
  const on = SU.buildSetups(an, ctx);
  const buy = (r) => r.candidates.find((c) => c.dir === 1);
  const cOff = buy(off), cOn = buy(on);
  ok('the natural fixture is at entry, not merely approaching',
    cOff.levels.entry_status === 'at-entry', cOff.levels.entry_status);
  ok('without the chase guard it is actually tradeable (ok=true, no_trade=[]), not a truthy empty-array test',
    cOff.ok === true && Array.isArray(cOff.no_trade) && cOff.no_trade.length === 0,
    JSON.stringify({ ok: cOff.ok, no_trade: cOff.no_trade }));
  ok('with the guard it is refused ONLY by the BOS timing rule',
    cOn.ok === false && cOn.no_trade.length === 1 && chaseVeto(cOn), JSON.stringify(cOn.no_trade));
  ok('the verdict changes BUY -> NO TRADE, so the state is consumed, not just emitted',
    off.verdict.action === 'BUY' && on.verdict.action === 'NO TRADE',
    off.verdict.action + ' -> ' + on.verdict.action);
  ok('grade, score, levels and risk are unchanged — this is a gate, not a ranking/sizing change',
    cOn.grade === cOff.grade && cOn.score === cOff.score
      && JSON.stringify(cOn.levels) === JSON.stringify(cOff.levels)
      && JSON.stringify(cOn.risk) === JSON.stringify(cOff.risk), '');
  ok('the action never arms the refused entry', /^No trade/.test(cOn.action) && !/^Arm the entry/.test(cOn.action), cOn.action);
  for (const ago of [0, 5, 6]) {
    // Deliberately isolate the bar-age input; this is a classifier boundary test, not
    // another empirical walk. At 6 bars the *same* setup is allowed, at 0/5 it is not.
    const varied = { ...an, structure: { ...an.structure,
      last_break: { ...an.structure.last_break, bars_ago: ago } } };
    const r = SU.buildSetups(varied, ctx), c = buy(r);
    ok(`age ${ago}: blocking agrees with the single RECENT=5 classifier`,
      r.filters.chase_guard.blocking === (ago <= 5) && chaseVeto(c) === (ago <= 5), JSON.stringify(r.filters.chase_guard));
    ok(`age ${ago}: at-entry setup ${ago <= 5 ? 'refused' : 'tradeable'}`, c.ok === (ago > 5), JSON.stringify(c.no_trade));
  }
  const missing = SU.buildSetups({ ok: false, tf: '15m' }, { price: 1 });
  ok('a short-series sentinel remains unknown, not expansion, and gets no chase veto',
    missing.filters.chase_guard.phase === 'unknown' && !missing.filters.chase_guard.blocking
      && missing.candidates.every((c) => !chaseVeto(c)), '');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
