'use strict';
/** M127 — an execution veto must survive the final verdict, Now order and Copy plan.
 * Run from repo root. TJ_APP selects the app under test; TJ_CONTROL optionally names
 * the pre-change app for a same-input candidate/output comparison. All prices are synthetic.
 * The measurement arm explicitly disables M3 so the propagation fix is attributable alone.
 */
const path = require('path');
const fs = require('fs');
const APP = process.env.TJ_APP || path.join(__dirname, '..', 'extracted', 'tradejournal');
const SMC = require(path.join(APP, 'src/bots/smc'));
const Setup = require(path.join(APP, 'src/bots/setup'));
const Now = require(path.join(APP, 'src/bots/now'));
const Synth = require('./harness/synth');
let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(' ok   ' + label); }
  else { fail++; console.log(' FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
const directional = (v) => v.action === 'BUY' || v.action === 'SELL';
const selected = (r) => r.candidates.find((c) => c.dir === r.verdict.dir);
const ctx = (price) => ({ price, balance: 10000, riskPct: 1,
  valuePerPoint: 100000, assetClass: 'forex', chaseGuard: false });
function planFor(c) {
  const l = c.levels;
  const entry = l ? l.entry : 1.1, stop = l ? l.stop : 1.09;
  const target = l && l.targets.length ? l.targets[0].price : 1.15;
  const rr = l ? l.rr_final : 5;
  return { direction: c.dir, blocked: false, status: 'confirmed', conviction: { tier: 'A' },
    crt_plan: { aggressive: { entry, stop, target, rr }, safer: { entry, stop, target, rr } },
    layers: { bias: { tf: '4h' } }, steps: [], conflicts: [] };
}
function nowFor(an, r, c, candles) {
  return Now.build({ symbol: 'EURUSD', tf: '15m', nowMs: candles[candles.length - 1].t + 60e3,
    td: planFor(c), setups: r, series: { candles, smc: an, price: an.price, atr: an.atr } });
}

async function uiCase(setups) {
  const { JSDOM } = require(path.join(APP, 'node_modules', 'jsdom'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://preview.example/', runScripts: 'outside-only' });
  const w = dom.window, root = w.document.getElementById('root');
  let copied = null;
  w.Store = { user: { settings: {} }, instruments: [], filters: {} };
  w.API = { get: (url) => url === '/bots/analyse' ? Promise.resolve({ setups })
    : url === '/bots/chart' ? Promise.resolve(null)
    : url === '/chart/drawings' ? Promise.resolve({ drawings: [] })
    : new Promise(() => {}), put: async () => ({}), post: async () => ({}) };
  w.App = { refresh: () => w.Views.bots.render(root), toast: () => {}, go: () => {} };
  w.TV = { link: () => '#', planText: (sym, tf, c) => c, copy: (v) => { copied = v; } };
  w.eval(fs.readFileSync(path.join(APP, 'public/js/util.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(APP, 'public/js/views/bots.js'), 'utf8'));
  w.Views.bots.render(root);
  // Render the toolbar without needing unrelated momentum/prediction panel fixtures.
  [...root.querySelectorAll('.tabs button')].find((b) => b.textContent === 'Scan').click();
  await new Promise((resolve) => setImmediate(resolve));
  const btn = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Copy plan');
  const disabled = btn.disabled;
  btn.click();
  // Even a synthetic event that bypasses HTML disabled behavior must not copy a refused plan.
  if (disabled) btn.dispatchEvent(new w.Event('click'));
  const result = { disabled, copiedDir: copied ? copied.dir : null, copiedOk: copied ? copied.ok : null };
  dom.window.close();
  return result;
}

(async () => {
  console.log('=== 1. Same input, no M3 gate: measure verdict propagation separately ===');
  const control = process.env.TJ_CONTROL ? require(path.join(process.env.TJ_CONTROL, 'src/bots/setup')) : null;
  let total = 0, acts = 0, bad = 0, emptyBad = 0, beforeActs = 0, beforeBad = 0, changedCandidates = 0;
  let refusedFixture = null, allowedFixture = null;
  for (let seed = 1; seed <= 8; seed++) {
    const cs = Synth.series({ seed, bars: 1500 });
    const hAll = Synth.aggregate(cs, 4);
    for (let i = 120; i < cs.length - 5; i += 12) {
      const csWin = cs.slice(Math.max(0, i - 300), i + 1);
      const h = hAll.filter((b) => b.t <= cs[i].t).slice(-80);
      const an = SMC.analyse(csWin, { tf: '15m', htfCandles: h.length > 30 ? h : null, now: cs[i].t });
      if (!an.ok) continue;
      const r = Setup.buildSetups(an, ctx(cs[i].c));
      total++;
      if (directional(r.verdict)) { acts++; if (!selected(r) || !selected(r).ok) bad++; }
      if (!r.candidates.some((c) => c.ok) && r.verdict.setup_action) emptyBad++;
      if (!refusedFixture && r.candidates[0].levels && !r.candidates[0].ok) refusedFixture = { an, r, c: r.candidates[0], cs: csWin };
      const yes = r.candidates.find((c) => c.ok && c.levels);
      if (!allowedFixture && yes) allowedFixture = { an, r, c: yes, cs: csWin };
      if (control) {
        const pre = control.buildSetups(an, ctx(cs[i].c));
        if (JSON.stringify(pre.candidates) !== JSON.stringify(r.candidates)) changedCandidates++;
        if (directional(pre.verdict)) { beforeActs++; if (!selected(pre) || !selected(pre).ok) beforeBad++; }
      }
    }
  }
  console.log(` measured: ${total} analyses, ${acts} directional summaries, ${bad} point to refused candidates, ${emptyBad} phantom setup actions`);
  if (control) console.log(` control: ${beforeActs} directional summaries, ${beforeBad} point to refused candidates; candidate-array diffs ${changedCandidates}/${total}`);
  ok('the sample includes both directional and refused verdicts', acts > 0 && total > acts, `${acts}/${total}`);
  ok('every directional summary points to an ok=true candidate', bad === 0, 'violations=' + bad);
  ok('when every candidate is refused, setup_action is null', emptyBad === 0, 'violations=' + emptyBad);
  if (control) {
    ok('the parent really exhibits the defect (negative control is non-vacuous)', beforeBad > 0, 'beforeBad=' + beforeBad);
    ok('M127 changes no candidate grade, price, veto or sizing — only consumption', changedCandidates === 0, 'candidate-array diffs=' + changedCandidates);
  }

  console.log('\n=== 2. The visible Now order consumes the same-side veto ===');
  ok('a refused priced candidate exists in the sample', !!refusedFixture);
  ok('an allowed priced candidate exists in the sample', !!allowedFixture);
  if (refusedFixture) {
    const { an, r, c, cs } = refusedFixture;
    const n = nowFor(an, r, c, cs);
    ok('a valid method scenario cannot arm a refused candidate', n.action === 'NO TRADE' && n.side === 0, n.action + '/' + n.side);
    ok('a refusal has neither order nor armed flag', n.order === null && n.armed === false, JSON.stringify(n.order));
    ok('a refused call has no permitted side or live opposite scenario', n.other_side === null, JSON.stringify(n.other_side));
    ok('the headline carries the engine veto verbatim', n.headline.includes(c.no_trade[0]), n.headline);
    ok('NO TRADE still supplies a re-check clock', !!n.checkpoint.at && !/order live/.test(n.checkpoint.label), n.checkpoint.label);
  }
  if (allowedFixture) {
    const { an, r, c, cs } = allowedFixture;
    const n = nowFor(an, r, c, cs);
    ok('an ok=true same-side candidate still arms the method plan', directional(n) && n.armed && !!n.order, n.action);
    const unknown = { ...r, candidates: r.candidates.map((x) => { const y = { ...x }; delete y.ok; return y; }) };
    const u = nowFor(an, unknown, c, cs);
    ok('missing eligibility is unknown, not a fabricated refusal (legacy/sentinel inputs)', directional(u), u.action);
    const td = { ...planFor(c), blocked: true, conflicts: [{ kind: 'no-trigger', blocks_trade: true, resolution: 'Method has not fired.' }] };
    const blocked = Setup.buildSetups(an, { ...ctx(an.price), topdown: td });
    ok('an allowed candidate never overrides a blocking topdown method', blocked.verdict.action === 'NO TRADE', blocked.verdict.action);
    const opposite = Setup.buildSetups(an, { ...ctx(an.price), topdown: { ...td, blocked: false, direction: -c.dir, conflicts: [] } });
    ok('the verdict never substitutes an allowed opposite side for the method side', !directional(opposite.verdict) || opposite.verdict.dir === -c.dir, JSON.stringify(opposite.verdict));
  }

  console.log('\n=== 3. Copy plan cannot export a refused highest score ===');
  const levels = { entry: 1.1, stop: 1.09, targets: [{ price: 1.14 }] };
  const refused = { dir: 1, side: 'buy', grade: 'A+', score: 95, ok: false, levels };
  const permitted = { dir: -1, side: 'sell', grade: 'B', score: 60, ok: true, levels };
  const none = await uiCase({ candidates: [refused], verdict: { action: 'NO TRADE', dir: 0 }, filters: {} });
  ok('Copy plan is disabled after a NO TRADE verdict', none.disabled, JSON.stringify(none));
  ok('even a forced click exports no refused plan', none.copiedDir === null, JSON.stringify(none));
  const lower = await uiCase({ candidates: [refused, permitted], verdict: { action: 'SELL', dir: -1 }, filters: {} });
  ok('B remains copyable when it is allowed (the user keeps B/C tradeable)', !lower.disabled, JSON.stringify(lower));
  ok('Copy plan exports the permitted side, not candidates[0]', lower.copiedDir === -1 && lower.copiedOk === true, JSON.stringify(lower));
  const window = await uiCase({ candidates: [permitted], verdict: { action: 'SELL', dir: -1 }, filters: { session_pref: { blocked_now: true } } });
  ok('M26\'s closed-window hard stop remains independent', window.disabled, JSON.stringify(window));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
