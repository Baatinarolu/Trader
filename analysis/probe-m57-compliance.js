'use strict';
/**
 * probe-m57-compliance.js — is the checklist actually aggregated into a compliance figure?
 *
 * WHY THIS EXISTS
 *   Ep 26: *"If you are supposed to follow your trade plan 10 times, but you only follow it 8
 *   times, then your compliance rate is probably around 80%."* The raw rows always existed —
 *   rule_checks(trade_id,label,passed), written on trade create and update, rendered as
 *   checkboxes in the trade view — but NO SELECT on the table existed anywhere in src/. The
 *   metric was collected, shown per trade, and never aggregated, while a subjective 1-5
 *   self-score stood in for it. His whole point is the difference: a derived metric removes the
 *   choice of being honest.
 *
 *   The probe writes two trades with KNOWN checklists (3 of 4 passed, then 2 of 2) so the
 *   expected figures are arithmetic, not judgement: per-trade average = (75 + 100) / 2 = 87.5,
 *   pooled followed-steps = 5 / 6 = 83.3. The two readings differ on purpose and both are
 *   returned, each with its denominators, so neither can be quoted naked. An empty checklist
 *   set must yield null, never 0 — an absent denominator is an absence of evidence, not 0%
 *   discipline.
 *
 *   node analysis/probe-m57-compliance.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log(`   ok   ${label}${detail ? '  · ' + detail : ''}`); }
  else { fail++; console.log(`   FAIL ${label}${detail ? '  · ' + detail : ''}`); }
};
const near = (g, e) => g !== null && g !== undefined && Math.abs(g - e) < 0.05;

(async () => {
  console.log('='.repeat(80));
  console.log(' M57 — COMPLIANCE: the derived discipline metric, aggregated at last');
  console.log('='.repeat(80));
  const h = await fetch(BASE + '/api/health').then((r) => r.json()).catch(() => null);
  if (!h || !h.ok) { console.log('   FAIL server not reachable at ' + BASE); process.exit(1); }
  const reg = await fetch(BASE + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `m57-${Date.now()}@probe.local`, password: 'probepass123', name: 'M57 Probe' }),
  }).then((r) => r.json());
  if (!reg.token) { console.log('   FAIL auth: ' + JSON.stringify(reg).slice(0, 160)); process.exit(1); }
  const H = { 'x-session': reg.token, 'Content-Type': 'application/json' };
  const mk = (rc) => fetch(BASE + '/api/trades', { method: 'POST', headers: H, body: JSON.stringify({
    symbol: 'EURUSD', side: 'long', status: 'closed', entry: 1.10, exit: 1.12, stop: 1.09, target: 1.14,
    r: 1.5, opened_at: '2026-01-05T10:00:00Z', closed_at: '2026-01-05T14:00:00Z', rule_checks: rc }) }).then((r) => r.json());

  const t1 = await mk([{ label: 'sweep', passed: true }, { label: 'shift', passed: true }, { label: 'zone', passed: true }, { label: 'rr', passed: false }]);
  const t2 = await mk([{ label: 'sweep', passed: true }, { label: 'shift', passed: true }]);
  ok('two closed trades written with checklists 3/4 and 2/2', !!(t1.trade && t2.trade), t1.trade ? '' : JSON.stringify(t1).slice(0, 140));

  const an = await fetch(BASE + '/api/analytics', { headers: H }).then((r) => r.json());
  const a = an.analytics || an;
  ok('per-trade compliance = 87.5 ( (75+100)/2 )', near(a.compliance, 87.5), 'got ' + a.compliance);
  ok('pooled compliance = 83.3 ( 5 of 6 steps )', near(a.compliance_pooled, 83.3), 'got ' + a.compliance_pooled);
  ok('denominators ride along: 2 trades, 6 checks, 5 passed',
    a.compliance_trades === 2 && a.compliance_checks === 6 && a.compliance_passed === 5,
    `${a.compliance_trades}/${a.compliance_checks}/${a.compliance_passed}`);

  const st = await fetch(BASE + '/api/strategies', { headers: H }).then((r) => r.json());
  const seg = Object.values(st.stats || {})[0] || {};
  ok('per-strategy stats carry the same fields', 'compliance' in seg && 'compliance_pooled' in seg,
    'compliance=' + seg.compliance);

  const empty = await fetch(BASE + '/api/analytics?tag=never-used-tag', { headers: H }).then((r) => r.json());
  const e2 = empty.analytics || empty;
  ok('an empty set yields null, never 0 (absence of evidence is not 0% discipline)',
    e2.compliance === null && e2.compliance_pooled === null, 'got ' + e2.compliance);

  console.log('\n' + '='.repeat(80));
  console.log(` ${pass} passed, ${fail} failed`);
  console.log('='.repeat(80));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('probe crashed:', (e && e.stack) || e); process.exit(1); });
