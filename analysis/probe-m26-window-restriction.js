/* M26 — "there's no way to restrict the bot to one trading window."
 *
 * Run from the REPO ROOT:  node analysis/probe-m26-window-restriction.js
 * Pristine negative control: TJ_APP=/tmp/p3/tradejournal node analysis/probe-m26-window-restriction.js
 *
 * Ep 3: "find one specific window and just focus on that window... but just stick to one."
 * Ep 12 turns that into a product requirement he ships in his own app: "we have actually
 * built a feature that allows you to define your own trading window... this trade button
 * will be blocked... grayed out... You physically can't press the trade button", because
 * "you're not relying on discipline. You are just implementing that discipline into your
 * trading system itself."
 *
 * What the code could already do, and what it could not: setup.js vetoed on
 * `in_killzone === false` (M8) and, since M38/M40, on the pair-affinity view of the open
 * window — so a setup outside EVERY window was refused. What nothing could express was
 * WHICH window this trader trades: all four were equally welcome, so a London trader was
 * handed NY AM signals and an Asia trader was handed London ones. `ctx.sessionPref` is
 * that missing input; this probe pins the clock (the live API cannot be time-travelled)
 * and checks the refusal, its precedence against M8/M40, its composition with M40's pair
 * lists and M25's phase classifier, and that an unknown value is reported rather than
 * silently ignored.
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
/* A negative control has to TALLY, not throw: on a tree without the feature every
 * property access below would blow up on the first one and report nothing. */
function absent(name, why) { fail++; console.log('  FAIL ' + name + '\n         (absent in this tree) ' + why); }

const HAS = typeof SMC.normalizeWindowPref === 'function' && typeof SMC.pairCountsFor === 'function'
  && typeof SMC.windowLabel === 'function' && !!SMC.WINDOW_BY_KEY;

if (!HAS) {
  console.log('\n=== this tree has no per-window restriction (expected on the pristine zip) ===');
  absent('SMC exports normalizeWindowPref / pairCountsFor / windowLabel / WINDOW_BY_KEY', 'no window index');
  absent('sessionState().bullets carry a stable key', 'no key field');
  absent('buildSetups refuses a setup outside the chosen window', 'no ctx.sessionPref');
  absent('the refusal names the window the trader chose', 'no message');
  absent('a window whose pairs exclude the symbol is reported as a setting that cannot fire', 'no M40 composition');
  absent('the phase is read inside the chosen window', 'no M25 composition');
  absent('an unknown window value is reported, not silently applied', 'no error path');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

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

const state = (iso) => SMC.sessionState(new Date(iso));

/* One instant per window, in EDT (2026-07-15 is UTC-4), with a symbol entitled to it:
 * Asia is RESTRICTED to AUD/NZD/JPY, London wants EUR/GBP, NY AM and the London close
 * want USD. The dead zone is 13:30 EDT, after the London close and before nothing. */
const WINDOWS = [
  { key: 'asia', iso: '2026-07-16T01:00:00Z', sym: 'AUDJPY', name: 'Asia killzone', other: 'london' },
  { key: 'london', iso: '2026-07-15T07:00:00Z', sym: 'EURUSD', name: 'London killzone', other: 'ny_am' },
  { key: 'ny_am', iso: '2026-07-15T12:00:00Z', sym: 'EURUSD', name: 'NY AM killzone', other: 'london_close' },
  { key: 'london_close', iso: '2026-07-15T15:00:00Z', sym: 'GBPUSD', name: 'London close killzone', other: 'london' },
];
const DEAD = '2026-07-15T17:30:00Z';

/** buildSetups with the clock pinned, exactly as the route calls it, plus sessionPref. */
function run(iso, sym, pref, seed) {
  const end = Date.parse(iso);
  const an = SMC.analyse(walk(400, end, 15 * 60 * 1000, seed || 7), { tf: '15m' });
  an.sessions = state(iso);
  let r = null, err = null;
  try {
    r = SU.buildSetups(an, { price: an.price, atr: an.atr, bias: 1, biasReason: 'probe',
      balance: 10000, riskPct: 1, maxRiskPct: 2, minRR: 2, symbol: sym, sessionPref: pref });
  } catch (e) { err = e.message; }
  const cands = (r && r.candidates) || [];
  return {
    err,
    pref: r && r.filters ? r.filters.session_pref : undefined,
    cand: cands[0] || null,
    n: cands.length,
    windowVeto: cands.filter((c) => /Outside your window/i.test(String(c.no_trade || ''))).length,
    killzoneVeto: cands.filter((c) => /Outside the killzone/i.test(String(c.no_trade || ''))).length,
  };
}

console.log('\n=== 1. The four windows are indexed once, from their own definition ===');
{
  const keys = Object.keys(SMC.WINDOW_BY_KEY).sort();
  ok('exactly his four windows are selectable',
    JSON.stringify(keys) === JSON.stringify(['asia', 'london', 'london_close', 'ny_am']), keys.join(','));
  ok('every selectable window IS one of his bullets (nothing invented)',
    keys.every((k) => SMC.SILVER_BULLETS.some((b) => b.key === k && b.name === SMC.WINDOW_BY_KEY[k].name)), keys.join(','));
  const p2 = (n) => String(n).padStart(2, '0');
  ok('the label restates the bullet\'s own hours rather than a copy of them',
    keys.every((k) => {
      const b = SMC.WINDOW_BY_KEY[k];
      return SMC.windowLabel(k) === `${b.name} ${p2(b.startH)}:${p2(b.startM)}–${p2(b.endH)}:${p2(b.endM)} New York`;
    }), keys.map((k) => SMC.windowLabel(k)).join(' | '));
  /* sessionState maps bullets through an EXPLICIT-field map, so a key added only to the
   * config would silently not survive it — the trap that ate a field before. */
  const b = state(WINDOWS[1].iso).bullets || [];
  ok('sessionState().bullets carry the key through the map', b.length === 4 && b.every((x) => typeof x.key === 'string' && !!x.key),
    b.map((x) => x.key).join(','));
  const np = (v) => SMC.normalizeWindowPref(v);
  ok('"london", "NY AM", "london close" and "asian" all resolve',
    np('london').key === 'london' && np('NY AM').key === 'ny_am' && np('london close').key === 'london_close' && np('asian').key === 'asia',
    [np('london'), np('NY AM'), np('london close'), np('asian')].map((x) => x.key).join(','));
  ok('"any" is an explicit no-restriction, not an unknown value',
    np('any').restricted === false && np('any').error === null, JSON.stringify(np('any')));
  ok('nothing supplied means nothing read', np(null) === null && np('') === null && np(undefined) === null, '');
  ok('a value that names no window is an ERROR, not a silent fallback',
    np('mars').error === 'mars' && np('mars').restricted === false && np('mars').key === null, JSON.stringify(np('mars')));
}

console.log('\n=== 2. Restricted to one window, a setup in another is refused ===');
for (const w of WINDOWS) {
  const a = run(w.iso, w.sym, w.key, 11);          // the window he chose, at its own hour
  const o = run(w.iso, w.sym, w.other, 11);        // a DIFFERENT window chosen, same hour
  const n = run(w.iso, w.sym, null, 11);           // no restriction at all
  ok(`${w.key}: allowed inside its own window`, a.pref && a.pref.blocked_now === false && a.windowVeto === 0,
    JSON.stringify({ pref: a.pref && a.pref.blocked_now, vetoes: a.windowVeto, err: a.err }));
  ok(`${w.key}: the label it reports is the window's own`, a.pref && a.pref.label === SMC.windowLabel(w.key), a.pref && a.pref.label);
  ok(`${w.key}: refused when the trader chose ${w.other} instead`, o.pref && o.pref.blocked_now === true && o.windowVeto === o.n && o.n > 0,
    JSON.stringify({ blocked: o.pref && o.pref.blocked_now, vetoes: o.windowVeto, n: o.n, err: o.err }));
  ok(`${w.key}: the refusal names BOTH the chosen window and the one that is open`,
    o.cand && /restricted to/.test(String(o.cand.no_trade)) && String(o.cand.no_trade).indexOf(w.name) !== -1
      && o.pref.open_now === w.name, String(o.cand && o.cand.no_trade).slice(0, 160));
  ok(`${w.key}: no restriction leaves the old behaviour untouched`, n.pref === null && n.windowVeto === 0,
    JSON.stringify({ pref: n.pref, vetoes: n.windowVeto }));
}
{
  const d = run(DEAD, 'EURUSD', 'london', 11);
  ok('dead zone: refused, and it says no window is open rather than naming one',
    d.pref && d.pref.blocked_now === true && d.pref.open_now === null && /no killzone is open now/.test(String(d.cand && d.cand.no_trade)),
    JSON.stringify({ blocked: d.pref && d.pref.blocked_now, open: d.pref && d.pref.open_now, msg: String(d.cand && d.cand.no_trade).slice(0, 140) }));
}

console.log('\n=== 3. M8/M40 precedence: the more specific refusal wins, and only once ===');
{
  /* Asia is open and the trader chose Asia, but EURUSD is not an Asia pair: M40's affinity
   * copy already refuses it, with a better message than "outside your window". The window
   * veto must NOT fire on top of it, or the trader is told two things about one clock. */
  const e = run(WINDOWS[0].iso, 'EURUSD', 'asia', 11);
  ok('excluded pair in the chosen window: refused by affinity, not by the window rule',
    e.windowVeto === 0 && e.killzoneVeto === e.n && e.n > 0,
    JSON.stringify({ windowVetoes: e.windowVeto, killzoneVetoes: e.killzoneVeto, n: e.n, msg: String(e.cand && e.cand.no_trade).slice(0, 150) }));
  ok('...and it is still reported as a setting that can never fire',
    e.pref && e.pref.pair_counts === false && /can never fire/.test(String(e.pref.conflict)), JSON.stringify(e.pref && { p: e.pref.pair_counts, c: e.pref.conflict }));
  const j = run(WINDOWS[0].iso, 'AUDJPY', 'asia', 11);
  ok('a pair the window DOES want has no conflict', j.pref && j.pref.pair_counts === true && j.pref.conflict === null,
    JSON.stringify(j.pref && { p: j.pref.pair_counts, c: j.pref.conflict }));
  const g = run(WINDOWS[3].iso, 'XAUUSD', 'london_close', 11);
  ok('gold is not falsely conflicted: he placed it in no session, so every window is open to it',
    g.pref && g.pref.pair_counts === true && g.pref.conflict === null, JSON.stringify(g.pref && { p: g.pref.pair_counts, c: g.pref.conflict }));
  /* The scan path passes no symbol. Unknown must stay unknown — reporting a conflict for
   * a symbol nobody named would be inventing a reason to distrust the setting. */
  const end = Date.parse(WINDOWS[0].iso);
  const an = SMC.analyse(walk(400, end, 15 * 60 * 1000, 7), { tf: '15m' });
  an.sessions = state(WINDOWS[0].iso);
  const r = SU.buildSetups(an, { price: an.price, atr: an.atr, bias: 1, minRR: 2, sessionPref: 'asia' });
  const sp = r && r.filters ? r.filters.session_pref : null;
  ok('no symbol (the scan path): pair_counts is null, not false', sp && sp.pair_counts === null && sp.conflict === null,
    JSON.stringify(sp && { p: sp.pair_counts, c: sp.conflict }));
}

console.log('\n=== 4. M25 composition: inside the chosen window the phase is read ===');
{
  const seen = {};
  for (const w of WINDOWS) {
    const a = run(w.iso, w.sym, w.key, 3);
    seen[w.key] = a.pref && a.pref.phase;
    ok(`${w.key}: inside the window the phase is reported`, ['balance', 'expansion', 'pullback'].indexOf(a.pref && a.pref.phase) !== -1,
      String(a.pref && a.pref.phase));
    ok(`${w.key}: consolidation inside the window is said out loud, and only then`,
      (a.pref && a.pref.phase) === 'balance' ? /balance|consolidation/i.test(String(a.pref.phase_note)) : a.pref && a.pref.phase_note === null,
      JSON.stringify({ phase: a.pref && a.pref.phase, note: a.pref && a.pref.phase_note }));
    const o = run(w.iso, w.sym, w.other, 3);
    ok(`${w.key}: a blocked window has no phase to report (it is not open)`, o.pref && o.pref.phase === null, String(o.pref && o.pref.phase));
  }
  console.log('    phases seen: ' + JSON.stringify(seen));
}

console.log('\n=== 5. An unknown window is reported and NOT applied ===');
{
  const u = run(WINDOWS[1].iso, 'EURUSD', 'mars', 11);
  ok('the payload carries the error and the list of real windows',
    u.pref && u.pref.error === 'mars' && /asia/.test(String(u.pref.note)) && /london_close/.test(String(u.pref.note)),
    JSON.stringify(u.pref && { e: u.pref.error, n: String(u.pref.note).slice(0, 120) }));
  ok('a typo does not turn into a restriction', u.windowVeto === 0 && u.pref.restricted === false,
    JSON.stringify({ vetoes: u.windowVeto, restricted: u.pref && u.pref.restricted }));
  ok('...and it does not change the killzone veto either', u.killzoneVeto === 0, 'killzoneVetoes=' + u.killzoneVeto);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
