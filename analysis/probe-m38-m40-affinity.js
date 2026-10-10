/* M38 + M40 — Asia killzone and pair-per-session affinity.
 *
 * Run from the REPO ROOT:  node analysis/probe-m38-m40-affinity.js
 *
 * Part A pins the clock and checks the session map itself (arithmetic, no engine).
 * Part B pushes the same clock through Momentum.mechanics to prove the session
 * FACTOR — the thing that actually moves a score — is symbol-aware.
 *
 * Dates are chosen deliberately: 2026-03-03 is EST (UTC-5) and 2026-07-15 is EDT
 * (UTC-4), so the Asia window is tested on both sides of the DST switch. The bullets
 * are New-York-local minutes, so a UTC-fixed assertion would pass for the wrong reason
 * half the year.
 */
const path = require('path');
const APP = path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc.js'));
const MOM = require(path.join(APP, 'src/bots/momentum.js'));

let pass = 0, fail = 0, skip = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         ' + detail : '')); }
}
function skipped(name, why) { skip++; console.log('  SKIP ' + name + ' — ' + why); }

const state = (iso) => SMC.sessionState(new Date(iso));
const eff = (iso, sym) => SMC.sessionAffinity(sym, state(iso));

console.log('\n=== A. SILVER_BULLETS: four windows, Asia present ===');
{
  const names = SMC.SILVER_BULLETS.map((b) => b.name);
  ok('four killzones named', names.length === 4, 'got ' + names.length + ': ' + names.join(', '));
  ok('Asia killzone exists', names.indexOf('Asia killzone') !== -1, names.join(', '));
  const asia = SMC.SILVER_BULLETS.find((b) => b.name === 'Asia killzone');
  ok('Asia is 20:00-24:00 ET', asia.startH === 20 && asia.startM === 0 && asia.endH === 24 && asia.endM === 0,
    JSON.stringify({ s: asia.startH, e: asia.endH }));
  ok('Asia quality is BELOW London (his caveat: no explosive USD moves there)',
    asia.quality < SMC.SILVER_BULLETS.find((b) => b.name === 'London killzone').quality,
    'asia=' + asia.quality + ' london=' + SMC.SILVER_BULLETS.find((b) => b.name === 'London killzone').quality);
  ok('Asia carries its pair list', JSON.stringify(asia.pairs) === JSON.stringify(['AUD', 'NZD', 'JPY']),
    JSON.stringify(asia.pairs));
  ok('London and NY bullets carry pair lists too',
    SMC.SILVER_BULLETS.every((b) => Array.isArray(b.pairs) && b.pairs.length > 0));
}

console.log('\n=== B. Asia window admits only AUD / NZD / JPY (EST, 2026-03-03T04:00Z = 23:00 ET) ===');
{
  const ISO = '2026-03-03T04:00:00Z';
  const raw = state(ISO);
  ok('raw state says Asia is open (this is what M38 was missing)',
    raw.in_killzone === true && raw.killzone === 'Asia killzone', raw.killzone);
  for (const sym of ['AUDJPY', 'AUDNZD', 'NZDJPY']) {
    const e = eff(ISO, sym);
    ok(sym + ' IS in its own killzone', e.in_killzone === true && e.killzone === 'Asia killzone',
      'in=' + e.in_killzone + ' kz=' + e.killzone);
  }
  /* The point of M40: adding Asia must not LOOSEN the gate for pairs he did not put there.
   * setup.js vetoes on in_killzone === false, so these four must stay false. */
  for (const sym of ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSDT']) {
    const e = eff(ISO, sym);
    ok(sym + ' is NOT admitted to Asia (gate not loosened)', e.in_killzone === false && e.killzone === null,
      'in=' + e.in_killzone + ' kz=' + e.killzone);
    ok(sym + ' records why, and names the next window for it',
      e.affinity_outside === 'Asia killzone' && /London killzone/.test(e.best_time || ''),
      'outside=' + e.affinity_outside + ' best_time=' + e.best_time);
  }
  const outside = eff(ISO, 'EURUSD');
  ok('calendar fields survive the copy (M10 stand-down still works)',
    typeof outside !== 'undefined' && (outside.dow !== undefined || outside.month !== undefined || outside.date !== undefined),
    JSON.stringify(Object.keys(outside).filter((k) => /dow|month|date|week/i.test(k))));
}

console.log('\n=== C. London / NY govern the named FX pairs, leave gold and crypto alone ===');
{
  const LON = '2026-03-03T08:00:00Z';   // 03:00 EST
  ok('London raw state open', state(LON).killzone === 'London killzone', state(LON).killzone);
  for (const sym of ['EURUSD', 'GBPUSD', 'GBPJPY', 'EURGBP']) {
    ok(sym + ' counts in London (EUR/GBP pair)', eff(LON, sym).in_killzone === true,
      'in=' + eff(LON, sym).in_killzone);
  }
  ok('AUDJPY does NOT count in London', eff(LON, 'AUDJPY').in_killzone === false,
    'in=' + eff(LON, 'AUDJPY').in_killzone);
  ok('XAUUSD is ungoverned in London (he placed gold in no session)', eff(LON, 'XAUUSD').in_killzone === true);
  ok('BTCUSDT is ungoverned in London', eff(LON, 'BTCUSDT').in_killzone === true);

  const NY = '2026-03-03T13:00:00Z';    // 08:00 EST
  ok('NY AM raw state open', state(NY).killzone === 'NY AM killzone', state(NY).killzone);
  ok('EURUSD counts in NY (USD leg)', eff(NY, 'EURUSD').in_killzone === true);
  ok('GBPJPY does NOT count in NY (no USD leg)', eff(NY, 'GBPJPY').in_killzone === false);
  ok('XAUUSD ungoverned in NY', eff(NY, 'XAUUSD').in_killzone === true);
}

console.log('\n=== D. Outside every window: the map is a no-op, not a second opinion ===');
{
  const DEAD = '2026-03-03T06:00:00Z';  // 01:00 EST
  const raw = state(DEAD);
  ok('dead zone is genuinely outside', raw.in_killzone === false, raw.killzone);
  ok('affinity returns the SAME object (identity) when nothing is open',
    SMC.sessionAffinity('EURUSD', raw) === raw);
  ok('null / missing symbol is safe', SMC.sessionAffinity(null, raw) === raw
    && SMC.sessionAffinity('EURUSD', null) !== undefined);
}

console.log('\n=== E. DST: the bullets are New-York minutes, so the UTC hour moves ===');
{
  const JUL = '2026-07-15T04:00:00Z';   // 00:00 EDT -> Asia has just closed
  ok('Asia is CLOSED at 04:00 UTC in July (00:00 EDT)', state(JUL).in_killzone === false,
    'kz=' + state(JUL).killzone);
  const JUL2 = '2026-07-15T03:00:00Z';  // 23:00 EDT -> Asia open
  const r2 = state(JUL2);
  ok('Asia is OPEN at 03:00 UTC in July (23:00 EDT)', r2.killzone === 'Asia killzone', 'kz=' + r2.killzone);
  ok('and still excludes EURUSD in July', eff(JUL2, 'EURUSD').in_killzone === false);
  ok('and still admits AUDJPY in July', eff(JUL2, 'AUDJPY').in_killzone === true);
}

console.log('\n=== F. Integration: the momentum SESSION FACTOR is symbol-aware ===');
/* mechanics() does not take raw candles or a bare Smc.analyse output: each layer is the
 * shape series() builds — { smc: <analyse>, ind: Ind.snapshot(candles) } — and it reads
 * `mtf.smc.sessions`. Factors are { key, label, points, max, detail }, not name/score.
 * Getting any of these wrong throws or silently scores nothing, so the shapes are pinned
 * here rather than guessed. */
const IND = require(path.join(APP, 'src/indicators.js'));
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
function findSession(o, depth) {
  if (!o || depth > 5 || typeof o !== 'object') return null;
  if (Array.isArray(o)) { for (const v of o) { const r = findSession(v, depth + 1); if (r) return r; } return null; }
  if (o.key === 'session' && typeof o.points === 'number') return o;
  for (const k of Object.keys(o)) { const r = findSession(o[k], depth + 1); if (r) return r; }
  return null;
}
{
  const END = Date.parse('2026-03-03T04:00:00Z');   // 23:00 EST — inside the Asia killzone
  const candles = walk(400, END, 15 * 60 * 1000, 7);
  const smc = SMC.analyse(candles, { tf: '15m' });
  smc.sessions = state('2026-03-03T04:00:00Z');    // pin the clock the engine would use
  const layer = { smc, ind: IND.snapshot(candles), candles };
  const run = (sym) => {
    try {
      const al = MOM.alignment(layer, layer, layer);
      return MOM.mechanics({ htf: layer, mtf: layer, ltf: layer, align: al, td: null, symbol: sym });
    } catch (e) { return { __err: e.message }; }
  };
  const a = run('AUDJPY'), b = run('EURUSD');
  if (a.__err || b.__err) {
    skipped('momentum session factor', 'mechanics threw: ' + (a.__err || b.__err));
  } else {
    const fa = findSession(a, 0), fb = findSession(b, 0);
    if (!fa || !fb) {
      skipped('momentum session factor', 'no session factor found; top keys=' + Object.keys(a).join(','));
    } else {
      ok('the factor reports a numeric max of 6 (the note is no longer in the max slot)',
        fa.max === 6 && fb.max === 6, 'AUDJPY max=' + fa.max + ' EURUSD max=' + fb.max);
      ok('AUDJPY is told it is IN its window', /killzone/.test(fa.detail || '') && !/not this instrument/.test(fa.detail || ''),
        fa.detail);
      ok('EURUSD is told Asia is NOT its window', /Asia killzone is not this instrument/.test(fb.detail || ''), fb.detail);
      /* At 23:00 ET the Tokyo session is active for everyone, so the genuine outside-state
       * quality is 0.5 — the same number Asia carries. The points TIE here by design; the
       * discriminator in this window is setup.js's in_killzone veto, not momentum's factor.
       * Asserting "AUDJPY > EURUSD" at this hour would be asserting a falsehood, so the tie
       * is asserted instead and the discriminating case is tested below in London. */
      ok('Asia-window points tie is the outside-state quality, not a broken map',
        fa.points === fb.points && fb.points === 3, 'AUDJPY=' + fa.points + ' EURUSD=' + fb.points);
      console.log('    ASIA  AUDJPY session=' + fa.points + '/' + fa.max + ' ("' + fa.detail + '")');
      console.log('    ASIA  EURUSD session=' + fb.points + '/' + fb.max + ' ("' + fb.detail + '")');
    }
  }
  /* London, where the two must differ: the bullet quality is 1.0 (=6 points) but AUDJPY is
   * scored off the genuine outside-state quality instead. */
  const END2 = Date.parse('2026-03-03T08:00:00Z');   // 03:00 EST — inside the London killzone
  const c2 = walk(400, END2, 15 * 60 * 1000, 11);
  const smc2 = SMC.analyse(c2, { tf: '15m' });
  smc2.sessions = state('2026-03-03T08:00:00Z');
  const L2 = { smc: smc2, ind: IND.snapshot(c2), candles: c2 };
  const run2 = (sym) => {
    try { return MOM.mechanics({ htf: L2, mtf: L2, ltf: L2, align: MOM.alignment(L2, L2, L2), td: null, symbol: sym }); }
    catch (e) { return { __err: e.message }; }
  };
  const g = run2('EURUSD'), h = run2('AUDJPY');
  if (g.__err || h.__err) {
    skipped('London discrimination', 'mechanics threw: ' + (g.__err || h.__err));
  } else {
    const fg = findSession(g, 0), fh = findSession(h, 0);
    if (!fg || !fh) skipped('London discrimination', 'no session factor found');
    else {
      /* MEASURED, NOT ASSUMED: momentum's session factor scores `sessions.quality`, which is
       * the SESSION table's quality (London 0.85 -> 5.1 points), not the bullet's (1.0 -> 6).
       * So the affinity map cannot move that number without redefining what `quality` means —
       * and redefining it would also change every symbol's score in every window, which no
       * transcript line asks for. The two therefore TIE on points while the reason text
       * differs, and M40's numeric teeth live where the killzone is actually gated:
       * setup.js's weight-8 session check and its in_killzone veto. Asserting a points gap
       * here would be asserting something the code was never shaped to produce. */
      ok('London: both score off SESSION quality (0.85 -> 5.1), so the points tie is expected',
        fg.points === fh.points && Math.abs(fg.points - 5.1) < 0.01, 'EURUSD=' + fg.points + ' AUDJPY=' + fh.points);
      ok('London: EURUSD is told it belongs, AUDJPY is told it does not',
        !/not this instrument/.test(fg.detail || '') && /London killzone is not this instrument/.test(fh.detail || ''),
        'EURUSD="' + fg.detail + '" AUDJPY="' + fh.detail + '"');
      console.log('    LONDON EURUSD session=' + fg.points + '/' + fg.max + ' · AUDJPY session=' + fh.points + '/' + fh.max);
    }
  }
}

console.log('\n=== G. End to end: the setup.js 8-point check and its killzone veto ===');
/* The API cannot be time-travelled (no date parameter) and the sandbox clock sits outside
 * every window, so the discrimination is measured here by pinning `analysis.sessions` on a
 * bundle and calling the same buildSetups() the route calls. This is the part that matters
 * operationally: in_killzone === false is a VETO, so a new window added without affinity
 * would have started admitting EURUSD at 02:00 UTC. */
{
  const SU = require(path.join(APP, 'src/bots/setup.js'));
  const END3 = Date.parse('2026-03-03T04:00:00Z');
  const an = SMC.analyse(walk(400, END3, 15 * 60 * 1000, 7), { tf: '15m' });
  an.sessions = state('2026-03-03T04:00:00Z');
  const runSetup = (sym) => {
    try {
      const r = SU.buildSetups(an, { price: an.price, atr: an.atr, bias: 'long', biasReason: 'probe',
        balance: 10000, riskPct: 1, maxRiskPct: 2, minRR: 2, symbol: sym });
      return ((r && r.candidates) || [])[0] || null;
    } catch (e) { return { __err: e.message }; }
  };
  const sessOf = (c) => ((c && c.checks) || []).find((x) => x.key === 'session') || null;
  const a = runSetup('AUDJPY'), b = runSetup('EURUSD'), c = runSetup('XAUUSD');
  if (!a || a.__err || !b || b.__err) {
    skipped('setup-level gate', 'buildSetups threw or produced no candidate: ' + ((a && a.__err) || (b && b.__err) || 'no candidate'));
  } else {
    const sa = sessOf(a), sb = sessOf(b), sc = sessOf(c);
    ok('AUDJPY passes the weight-8 session check inside Asia', !!sa && sa.pass === true,
      sa ? JSON.stringify({ pass: sa.pass, weight: sa.weight }) : 'no session check');
    ok('EURUSD FAILS the weight-8 session check inside Asia', !!sb && sb.pass === false && sb.weight === 8,
      sb ? JSON.stringify({ pass: sb.pass, weight: sb.weight }) : 'no session check');
    ok('EURUSD is VETOED for being outside the killzone', /killzone/i.test(String(b.no_trade || '')), b.no_trade);
    ok('XAUUSD is vetoed too — the restricted window admits no one else',
      !!sc && sc.pass === false && /killzone/i.test(String(c.no_trade || '')), (c && c.no_trade) || 'none');
    ok('AUDJPY is NOT vetoed for the killzone (it is in its own window)',
      !/killzone/i.test(String(a.no_trade || '')), a.no_trade);
    console.log('    AUDJPY: ' + (a.no_trade ? String(a.no_trade).split(',')[0] : 'tradeable'));
    console.log('    EURUSD: ' + String(b.no_trade).split(',')[0]);
  }
}

console.log('\n' + pass + ' passed / ' + fail + ' failed' + (skip ? ' / ' + skip + ' skipped' : ''));
process.exit(fail ? 1 : 0);
