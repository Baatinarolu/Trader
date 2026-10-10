'use strict';
/**
 * probe-m124-chart-parity.js — do /bots/chart and /bots/analyse agree on the same bar?
 *
 * WHY THIS EXISTS
 *   The two endpoints are the same read shown two ways: the chart draws it and the
 *   analysis strip words it. index.js carried a comment claiming they "can never
 *   disagree about what to do". They could, and did — chart() fetched a caller-controlled
 *   entry window (`clamp(opts.bars||400,80,1200)`) while analyse() fetched a hardcoded
 *   600, so the same request made the two paths analyse different windows, produce
 *   different structure, a different topdown direction, and a different ACTION for the
 *   same bar. Measured before the fix on EURUSD 15m at 2026-10-10T07:15Z:
 *
 *       analyse  direction 1 · status confirmed · BUY
 *       chart    direction 0 · status waiting · blocked on no-trigger + chase · NO TRADE
 *
 *   bots-test has one parity assertion, but it compares a single bar at a single depth and
 *   only when the two calls happen to land on the same bar — so it can pass while the
 *   defect is live at every other depth. This varies the timeframe AND the requested bar
 *   count, which is what actually exposes it: the bug was a function of `bars`, not of the
 *   market.
 *
 *   It also checks the thing the fix must NOT break — that `bars` still controls how many
 *   candles come back for drawing. Decoupling display depth from method depth is the fix;
 *   making the chart ignore `bars` entirely would be a regression dressed as one.
 *
 *   node analysis/probe-m124-chart-parity.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';

let pass = 0, fail = 0, skipped = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log(`   ok   ${label}${detail ? '  · ' + detail : ''}`); }
  else { fail++; console.log(`   FAIL ${label}${detail ? '  · ' + detail : ''}`); }
};

const TFS = ['1d', '1h', '15m', '5m'];
const BARS = [200, 400, 800, 1200];   // spans below, at and above METHOD_ENTRY_BARS (600)

(async () => {
  console.log('='.repeat(80));
  console.log(' M124 — CHART / ANALYSE PARITY ON THE SAME BAR');
  console.log('='.repeat(80));
  console.log(` server: ${BASE}`);
  console.log(` matrix: ${TFS.length} timeframes x ${BARS.length} bar depths = ${TFS.length * BARS.length} comparisons\n`);

  const h = await fetch(BASE + '/api/health').then((r) => r.json()).catch(() => null);
  if (!h || !h.ok) {
    console.log(`   FAIL server not reachable at ${BASE}. Start it:`);
    console.log('        cd extracted/tradejournal && TJ_OFFLINE_CANDLES=1 node server.js');
    process.exit(1);
  }

  const reg = await fetch(BASE + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `m124-${Date.now()}@probe.local`, password: 'probepass123', name: 'M124 Probe' }),
  }).then((r) => r.json());
  if (!reg.token) { console.log(`   FAIL could not authenticate: ${JSON.stringify(reg).slice(0, 160)}`); process.exit(1); }
  const H = { 'x-session': reg.token };
  ok('authenticated', true);

  const get = async (p) => (await fetch(BASE + '/api' + p, { headers: H })).json();
  const barOf = (o) => o && o.now && o.now.evaluated_on && o.now.evaluated_on.last_closed_bar;
  const tdOf = (o) => { const t = (o && o.topdown) || {}; return { dir: t.direction, status: t.status, blocked: !!t.blocked }; };

  let compared = 0, diverged = 0, tdDiverged = 0, notSameBar = 0;
  const examples = [];

  for (const tf of TFS) {
    for (const bars of BARS) {
      const a = await get(`/bots/analyse?symbol=EURUSD&tf=${tf}&bars=${bars}`);
      const c = await get(`/bots/chart?symbol=EURUSD&tf=${tf}&bars=${bars}`);
      if (!a || !a.now || !c || !c.now) { skipped++; continue; }
      if (barOf(a) !== barOf(c)) { notSameBar++; continue; }   // a live tick between calls; not comparable
      compared++;

      const ta = tdOf(a), tc = tdOf(c);
      const tdSame = ta.dir === tc.dir && ta.status === tc.status && ta.blocked === tc.blocked;
      const actSame = a.now.action === c.now.action && a.now.side === c.now.side;
      if (!tdSame) {
        tdDiverged++;
        if (examples.length < 4) examples.push(`${tf}@${bars} topdown analyse dir=${ta.dir}/${ta.status}${ta.blocked ? '/BLOCKED' : ''} vs chart dir=${tc.dir}/${tc.status}${tc.blocked ? '/BLOCKED' : ''}`);
      }
      if (!actSame) {
        diverged++;
        if (examples.length < 4) examples.push(`${tf}@${bars} action analyse=${a.now.action} vs chart=${c.now.action}`);
      }

      // the fix must not break the display contract
      const n = Array.isArray(c.candles) ? c.candles.length : 0;
      if (n === 0) { fail++; console.log(`   FAIL ${tf}@${bars} chart returned no candles`); }
      else if (n > bars) { fail++; console.log(`   FAIL ${tf}@${bars} chart returned ${n} candles, more than the ${bars} asked for`); }
    }
  }

  console.log(`\n   comparisons on the SAME bar: ${compared}  (skipped ${skipped}, different bar ${notSameBar})`);
  if (examples.length) { console.log('   divergences:'); for (const e of examples) console.log('     · ' + e); }
  console.log('');

  ok('at least one comparison actually ran', compared > 0,
    compared ? `${compared} same-bar comparisons` : 'nothing compared — this probe would be vacuous');
  ok('topdown direction/status/blocked agree on every same-bar comparison', tdDiverged === 0,
    `${tdDiverged} of ${compared} disagreed`);
  ok('action AND side agree on every same-bar comparison', diverged === 0,
    `${diverged} of ${compared} disagreed — the chart and the words on screen must not contradict each other`);
  ok('the result does not depend on the requested bar depth',
    compared >= TFS.length * 2 && diverged === 0,
    `bars varied over ${BARS.join(', ')} — before the fix the divergence was a function of bars, not of the market`);

  console.log('\n' + '='.repeat(80));
  console.log(` ${pass} passed, ${fail} failed${skipped || notSameBar ? ` (${skipped} skipped, ${notSameBar} not same-bar)` : ''}`);
  console.log('='.repeat(80));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('probe crashed:', (e && e.stack) || e); process.exit(1); });
