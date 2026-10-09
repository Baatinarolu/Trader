'use strict';
/**
 * probe-m102-versioning.js — does strategy versioning actually work END TO END?
 *
 * WHY THIS EXISTS
 *   M102 adds an append-only strategy_versions table, stamps each new trade with the
 *   version it was taken under, and segments by_strategy on (strategy, version). Every
 *   one of those can fail vacuously: `T.normalise()` can drop the stamped field before it
 *   reaches the INSERT whitelist, the PUT can bump on a cosmetic change and fragment the
 *   history, or the backfill can silently not run. Source inspection cannot see any of
 *   that. So this drives the real HTTP API against a running server and reads the values
 *   back out of the database through the API.
 *
 *   It prints what it actually observed at every step. An absent field is reported as
 *   MISSING, never as a pass.
 *
 *   node analysis/probe-m102-versioning.js [baseUrl]     (default http://localhost:3000)
 */
const BASE = process.argv[2] || 'http://localhost:3000';
let token = null;
let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log(`   ok   ${label}${detail ? '  · ' + detail : ''}`); }
  else { fail++; console.log(`   FAIL ${label}${detail ? '  · ' + detail : ''}`); }
};

async function call(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-session'] = token;
  const res = await fetch(BASE + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data };
}

(async () => {
  console.log('='.repeat(78));
  console.log(' M102 — STRATEGY VERSIONING, END TO END OVER HTTP');
  console.log('='.repeat(78));
  console.log(` server: ${BASE}\n`);

  const health = await call('GET', '/health');
  if (health.status !== 200) {
    console.log(`   FAIL server not reachable at ${BASE} (GET /api/health -> ${health.status}).`);
    console.log('        Start it:  cd extracted/tradejournal && TJ_OFFLINE_CANDLES=1 node server.js');
    process.exit(1);
  }
  ok('server reachable', true, `store=${health.data.store || '?'}`);

  /* ── auth ─────────────────────────────────────────────────────────────── */
  const email = `m102-${Date.now()}@probe.local`;
  const reg = await call('POST', '/auth/register', { email, password: 'probepass123', name: 'M102 Probe' });
  token = reg.data && (reg.data.token || (reg.data.session && reg.data.session.token)) || null;
  if (!token) { console.log(`   FAIL could not register/authenticate: ${JSON.stringify(reg.data).slice(0, 200)}`); process.exit(1); }
  ok('registered and authenticated', true, email);

  /* ── 1. a new strategy starts at v1 ───────────────────────────────────── */
  console.log('\n 1. creating a strategy');
  const created = await call('POST', '/strategies', {
    name: 'SMC London Open', description: 'Original rules',
    market_conditions: 'trending', timeframes: '15m',
    entry_rules: ['Wait for a sweep of Asia low', 'Enter on the CHoCH retrace'],
    exit_rules: ['Target weak structure'], checklist: ['Killzone only'],
    risk_rules: '0.5% per trade', target_r_multiple: 2, colour: '#4f8cff', active: true,
  });
  const sid = created.data && created.data.strategy && created.data.strategy.id;
  ok('POST /strategies -> 200', created.status === 200, `got ${created.status}`);
  ok('response reports version 1', created.data.version === 1, `got ${JSON.stringify(created.data.version)}`);
  if (!sid) { console.log('   FAIL no strategy id returned; cannot continue'); process.exit(1); }

  /* ── 2. a trade taken now is stamped v1 ───────────────────────────────── */
  console.log('\n 2. a trade taken under v1');
  const t1 = await call('POST', '/trades', {
    symbol: 'EURUSD', direction: 'long', entry: 1.1000, stop: 1.0980, target: 1.1040,
    size: 10000, opened_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    strategy_id: sid, strategy_name: 'SMC London Open',
  });
  const t1id = t1.data && (t1.data.id || (t1.data.trade && t1.data.trade.id));
  ok('POST /trades -> 200', t1.status === 200, `got ${t1.status}`);
  let read1 = null;
  if (t1id) { const r = await call('GET', '/trades/' + t1id); read1 = r.data && (r.data.trade || r.data); }
  const v1stamp = read1 ? read1.strategy_version : undefined;
  ok('the trade is stamped strategy_version = 1', v1stamp === 1,
    v1stamp === undefined ? 'MISSING from GET /trades/:id — either not written or not returned' : `got ${JSON.stringify(v1stamp)}`);

  /* ── 3. changing a RULE appends v2 ────────────────────────────────────── */
  console.log('\n 3. changing an entry rule (a real strategy change)');
  const put1 = await call('PUT', '/strategies/' + sid, {
    entry_rules: ['Wait for a sweep of Asia low', 'Enter on the CHoCH retrace', 'Require displacement'],
  });
  ok('PUT -> 200', put1.status === 200, `got ${put1.status}`);
  ok('version bumped to 2', put1.data.version === 2, `got ${JSON.stringify(put1.data.version)}`);
  ok('new_version is true', put1.data.new_version === true, `got ${JSON.stringify(put1.data.new_version)}`);
  ok('changed_field names the rule that changed', put1.data.changed_field === 'entry_rules',
    `got ${JSON.stringify(put1.data.changed_field)}`);

  /* ── 4. a trade taken now is stamped v2 ───────────────────────────────── */
  console.log('\n 4. a trade taken under v2');
  const t2 = await call('POST', '/trades', {
    symbol: 'EURUSD', direction: 'long', entry: 1.1010, stop: 1.0990, target: 1.1050,
    size: 10000, opened_at: new Date(Date.now() - 86400000).toISOString(),
    strategy_id: sid, strategy_name: 'SMC London Open',
  });
  const t2id = t2.data && (t2.data.id || (t2.data.trade && t2.data.trade.id));
  let read2 = null;
  if (t2id) { const r = await call('GET', '/trades/' + t2id); read2 = r.data && (r.data.trade || r.data); }
  const v2stamp = read2 ? read2.strategy_version : undefined;
  ok('the second trade is stamped strategy_version = 2', v2stamp === 2,
    v2stamp === undefined ? 'MISSING' : `got ${JSON.stringify(v2stamp)}`);
  ok('the two trades are distinguishable by version', v1stamp === 1 && v2stamp === 2,
    `v1 trade=${JSON.stringify(v1stamp)}, v2 trade=${JSON.stringify(v2stamp)} — this is the whole point of M102`);

  /* ── 5. a COSMETIC change must NOT fragment the history ───────────────── */
  console.log('\n 5. changing only the colour (must not bump)');
  const put2 = await call('PUT', '/strategies/' + sid, { colour: '#ff0000' });
  ok('version stays at 2', put2.data.version === 2, `got ${JSON.stringify(put2.data.version)}`);
  ok('new_version is false', put2.data.new_version === false, `got ${JSON.stringify(put2.data.new_version)}`);
  ok('changed_field is null', put2.data.changed_field === null || put2.data.changed_field === undefined,
    `got ${JSON.stringify(put2.data.changed_field)}`);

  console.log('\n 5b. changing only the name (must not bump either)');
  const put3 = await call('PUT', '/strategies/' + sid, { name: 'SMC London Open (renamed)' });
  ok('version still 2 after a rename', put3.data.version === 2, `got ${JSON.stringify(put3.data.version)}`);
  ok('new_version false after a rename', put3.data.new_version === false, `got ${JSON.stringify(put3.data.new_version)}`);

  /* ── 6. the history is readable and immutable ─────────────────────────── */
  console.log('\n 6. GET /strategies/:id/versions');
  const vers = await call('GET', `/strategies/${sid}/versions`);
  ok('versions route -> 200', vers.status === 200, `got ${vers.status}`);
  const list = (vers.data && vers.data.versions) || [];
  ok('exactly 2 versions recorded (not 4 — cosmetics did not append)', list.length === 2,
    `got ${list.length}: ${list.map((v) => 'v' + v.version).join(', ') || 'none'}`);
  ok('newest first', list.length === 2 && list[0].version === 2 && list[1].version === 1,
    list.map((v) => 'v' + v.version).join(', '));
  const v1row = list.find((v) => v.version === 1);
  const v2row = list.find((v) => v.version === 2);
  ok('v1 still holds the ORIGINAL entry rules',
    !!v1row && Array.isArray(v1row.entry_rules) && v1row.entry_rules.length === 2,
    v1row ? `${v1row.entry_rules && v1row.entry_rules.length} rules: ${JSON.stringify(v1row.entry_rules)}` : 'v1 row MISSING');
  ok('v2 holds the CHANGED entry rules',
    !!v2row && Array.isArray(v2row.entry_rules) && v2row.entry_rules.length === 3,
    v2row ? `${v2row.entry_rules && v2row.entry_rules.length} rules` : 'v2 row MISSING');
  ok('each version reports how many trades were taken under it',
    !!v1row && v1row.trades === 1 && !!v2row && v2row.trades === 1,
    `v1=${v1row && v1row.trades}, v2=${v2row && v2row.trades}`);
  ok('the note explains why each version exists', !!v2row && typeof v2row.note === 'string' && v2row.note.length > 10,
    v2row ? v2row.note.slice(0, 70) + '...' : 'MISSING');
  ok('comparable[] is empty at 1 trade each, per Ep 27\'s 30-trade floor',
    Array.isArray(vers.data.comparable) && vers.data.comparable.length === 0,
    `got ${JSON.stringify(vers.data.comparable)}`);
  ok('trades_with_no_recorded_version is reported, not hidden',
    typeof vers.data.trades_with_no_recorded_version === 'number',
    `got ${JSON.stringify(vers.data.trades_with_no_recorded_version)}`);

  /* ── 7. by_strategy segments on version ───────────────────────────────── */
  console.log('\n 7. performance segmentation (GET /analytics -> fullAnalytics)');
  const perf = await call('GET', '/analytics');
  ok('GET /analytics -> 200', perf.status === 200, `got ${perf.status}`);
  // Search the whole response for a by_strategy key rather than guessing its nesting:
  // a wrong path here would report MISSING for a segmentation that is in fact correct.
  const findKey = (o, key, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 6) return undefined;
    if (Object.prototype.hasOwnProperty.call(o, key)) return o[key];
    for (const v of Object.values(o)) { const r = findKey(v, key, depth + 1); if (r !== undefined) return r; }
    return undefined;
  };
  const bs = findKey(perf.data, 'by_strategy');
  if (bs && typeof bs === 'object') {
    const keys = Array.isArray(bs) ? bs.map((x) => x.label || x.key || x.name || x.segment) : Object.keys(bs);
    const versioned = keys.filter((k) => / v[0-9]/.test(String(k)));
    ok('by_strategy is present', true, `${keys.length} segment(s)`);
    ok('segments carry a version suffix', versioned.length >= 2,
      `keys: ${keys.join(' | ').slice(0, 180)}`);
    ok('v1 and v2 are SEPARATE segments, not merged',
      versioned.some((k) => /v1/.test(String(k))) && versioned.some((k) => /v2/.test(String(k))),
      'this is the defect M102 exists to fix');
  } else {
    ok('by_strategy present in /analytics', false,
      `MISSING — response keys: ${Object.keys(perf.data || {}).join(', ').slice(0, 160)}`);
  }

  /* ── cleanup ──────────────────────────────────────────────────────────── */
  try {
    if (t1id) await call('DELETE', '/trades/' + t1id);
    if (t2id) await call('DELETE', '/trades/' + t2id);
    await call('DELETE', '/strategies/' + sid);
  } catch (e) { /* best effort */ }

  console.log('\n' + '='.repeat(78));
  console.log(` ${pass} passed, ${fail} failed`);
  console.log('='.repeat(78));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('probe crashed:', e && e.stack || e); process.exit(1); });
