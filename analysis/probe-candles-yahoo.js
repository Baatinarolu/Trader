#!/usr/bin/env node
/**
 * analysis/probe-candles-yahoo.js — M121, the candle-provider path.
 *
 * This sandbox cannot reach Yahoo, OKX or CoinGecko at all: DNS and TCP succeed and the TLS
 * handshake is reset (ANALYSIS.md §3 — an SNI allowlist of six package/VCS hosts). That is not a
 * code defect and not a blanket no-network condition. It does mean the provider path cannot be
 * tested by calling it, so this probe **stubs `global.fetch`** and answers the exact URL shapes
 * `src/candles.js` builds. Everything above the network layer is the project's own unmodified
 * code: resolveSymbol, tfInfo, aggregate, sanitise, getCandles.
 *
 * Stubbing is not a compromise here, it is the stronger test: it can simulate a 401 carrying
 * Yahoo's real error body, a 429, a 200-with-`chart.error`, and a provider that answers the wrong
 * interval — none of which can be summoned on demand from a live endpoint.
 *
 *   node analysis/probe-candles-yahoo.js          # from the repo root or extracted/tradejournal
 *
 * The defect it was written for: a crypto 4h request returned **1h bars labelled 4h**, with
 * `aggregation: null` and no warning, whenever OKX was unavailable — because the Yahoo fallback
 * branch substituted `info.yahoo || '1h'` and set `got`, which skipped the aggregation step. 4h is
 * the higher-timeframe bias layer, so the direction decision was made on the wrong timeframe.
 */
'use strict';
const path = require('path');
const fs = require('fs');

function findRoot() {
  // TJ_ROOT overrides the app location so this probe can be run against a pristine copy as a
  // NEGATIVE CONTROL. A probe that passes on both the broken and the fixed code proves nothing
  // (§6: "a probe that reports zero on both arms is a broken probe, not a null result"), so the
  // fixed run is always paired with a run against the unpatched tree.
  const cands = [process.env.TJ_ROOT, path.join(__dirname, '..', 'extracted', 'tradejournal'), path.join(__dirname, '..'),
    path.join(process.cwd(), 'extracted', 'tradejournal'), process.cwd()].filter(Boolean);
  for (const c of cands) if (fs.existsSync(path.join(c, 'src', 'candles.js'))) return c;
  throw new Error('cannot locate src/candles.js');
}
const ROOT = findRoot();
const C = require(path.join(ROOT, 'src/candles.js'));

let pass = 0, fail = 0;
const notes = [];
function check(id, ok, detail) {
  if (ok) { pass++; console.log(`  ok    ${id}  ${detail || ''}`); }
  else { fail++; console.log(`  FAIL  ${id}  ${detail || ''}`); }
  return ok;
}
const note = (s) => notes.push(s);

/* --------------------------------------------------------------------- stub */
const HOUR = 3600e3;
const T0 = Date.UTC(2026, 0, 5, 0, 0, 0);
const IV_MS = { '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': HOUR, '1d': 864e5, '1wk': 7 * 864e5 };

function envelope(intervalMs, n) {
  const ts = [], o = [], h = [], l = [], c = [], v = [];
  for (let i = 0; i < n; i++) {
    const p = 100 + i * 0.1;
    ts.push(Math.floor((T0 + i * intervalMs) / 1000));
    o.push(p); h.push(p + 0.5); l.push(p - 0.5); c.push(p + 0.2); v.push(1000);
  }
  return { chart: { result: [{ meta: { currency: 'USD', exchangeName: 'CCC', exchangeTimezoneName: 'UTC' }, timestamp: ts, indicators: { quote: [{ open: o, high: h, low: l, close: c, volume: v }] } }], error: null } };
}

/** Install a stub. `behaviour(url)` returns {json} | {status,body} | {throw}. Records every call. */
function installStub(behaviour) {
  const calls = [];
  global.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, ua: (init && init.headers && init.headers['User-Agent']) || '' });
    const out = await behaviour(u, calls.length - 1);
    if (out.throw) throw out.throw;
    const status = out.status || 200;
    const body = out.json !== undefined ? JSON.stringify(out.json) : String(out.body || '');
    return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
  };
  return calls;
}
const yahooOk = (u) => ({ json: envelope(IV_MS[/[?&]interval=([^&]+)/.exec(u)[1]] || HOUR, 3000) });
const okxFail = { throw: Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }) };
const get = (sym, tf, limit = 200) => C.getCandles(sym, tf, { limit, force: true });

/* Measurement helpers are defined HERE rather than taken from the module under test, so that
 * the behavioural assertions run identically against a pristine (pre-M121) tree as a negative
 * control. Assertions about the module's own exported helpers are guarded with `has()`. */
const med = (a) => {
  if (!a || a.length < 2) return null;
  const g = [];
  for (let i = 1; i < a.length; i++) { const d = a[i].t - a[i - 1].t; if (d > 0) g.push(d); }
  if (!g.length) return null;
  g.sort((x, y) => x - y);
  return g[Math.floor(g.length / 2)];
};
const spacingFine = (ms, want) => ms == null || (want > 0 && Math.abs(ms - want) <= want * 0.10);
const fmt = (ms) => {
  if (ms == null) return 'n/a';
  if (ms >= 864e5) return (ms / 864e5) + 'd';
  if (ms >= HOUR) return (ms / HOUR) + 'h';
  return (ms / 60e3) + 'm';
};
const has = (name) => typeof C[name] === 'function' || (name in C);
const tryGet = async (sym, tf, limit) => { try { return { res: await get(sym, tf, limit) }; } catch (e) { return { err: e }; } };

(async () => {
  /* ============================================ 1. interval integrity ====== */
  console.log('\n— M121: does the timeframe that comes back match the one asked for? —');
  console.log('  crypto, OKX unavailable -> the Yahoo -USD fallback where the bug lived');

  for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '3m']) {
    C.clearCache();
    installStub((u) => (u.includes('okx.com') ? okxFail : yahooOk(u)));
    const info = C.tfInfo(tf);
    const { res, err } = await tryGet('BTCUSDT', tf);
    if (res) {
      const m = med(res.candles);
      check(`crypto ${tf.padEnd(3)} returns genuinely ${tf} bars`, spacingFine(m, info.ms),
        `median ${fmt(m)} vs expected ${fmt(info.ms)} · bars ${res.candles.length}` +
        (res.meta.aggregation ? ` · aggregation ${res.meta.aggregation}` : ''));
    } else {
      // 3m has neither a Yahoo interval nor an aggregatable base: refusing is the correct answer.
      const refused = /not served by Yahoo|refusing to analyse/i.test(err.message);
      check(`crypto ${tf.padEnd(3)} refused rather than mislabelled`, refused, err.message.slice(0, 92));
    }
  }

  console.log('\n  non-crypto, Yahoo primary — must be unchanged by the fix');
  for (const tf of ['15m', '1h', '4h', '1d', '1w']) {
    C.clearCache();
    installStub(yahooOk);
    const info = C.tfInfo(tf);
    const { res, err } = await tryGet('EURUSD', tf);
    if (res) {
      const m = med(res.candles);
      check(`EURUSD ${tf.padEnd(3)} spacing correct`, spacingFine(m, info.ms),
        `median ${fmt(m)} · provider ${res.meta.provider}` + (res.meta.aggregation ? ` · ${res.meta.aggregation}` : ''));
    } else check(`EURUSD ${tf.padEnd(3)} spacing correct`, false, err.message.slice(0, 92));
  }

  /* ============================================ 2. the guard itself ========= */
  console.log('\n— M121: the guard refuses a provider that answers the wrong interval —');
  {
    C.clearCache();
    installStub((u) => (u.includes('okx.com') ? okxFail : { json: envelope(HOUR, 3000) }));  // 1h bars for a 15m ask
    const { res, err } = await tryGet('BTCUSDT', '15m');
    check('a wrong-interval answer is refused, not silently relabelled',
      !!err && /refusing to analyse the wrong timeframe/.test(err.message),
      err ? err.message.slice(0, 116) : `ACCEPTED it — median ${fmt(med(res.candles))}`);
    check('the refusal names both spacings', !!err && /1h apart, not 15m/.test(err.message),
      err ? '"1h apart, not 15m"' : '');
  }
  {
    const daily = [];
    let t = T0;
    for (let i = 0; i < 200; i++) { daily.push({ t, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }); t += 864e5; if (i % 5 === 4) t += 2 * 864e5; }
    check('daily bars with weekend gaps still pass the 10% tolerance', spacingFine(med(daily), 864e5),
      `median ${fmt(med(daily))}`);
    check('the same tolerance still catches a 4x error', !spacingFine(HOUR, 4 * HOUR), '1h vs 4h rejected');
    check('too few bars to judge is not a failure', spacingFine(null, 900e3), 'null median passes');
  }

  /* ============================================ 3. error fidelity ========== */
  console.log('\n— M121: does a failure say WHY? (the old code threw a bare `HTTP 401`) —');
  {
    const BODY = JSON.stringify({ finance: { result: null, error: { code: 'Unauthorized', description: 'Invalid Crumb' } } });
    C.clearCache();
    installStub((u) => (u.includes('okx.com') ? okxFail : { status: 401, body: BODY }));
    const { err } = await tryGet('EURUSD', '15m');
    check("a 401 surfaces Yahoo's own reason", !!err && /Invalid Crumb/.test(err.message), err ? err.message.slice(0, 126) : 'no error');
    check('a 401 names BOTH hosts, so neither masks the other',
      !!err && /query2/.test(err.message) && /query1/.test(err.message),
      err ? (err.message.match(/query[12]/g) || []).join(' + ') : '');
  }
  {
    C.clearCache();
    const calls = installStub((u) => (u.includes('okx.com') ? okxFail : { status: 429, body: 'Too Many Requests' }));
    const { err } = await tryGet('EURUSD', '15m');
    const yCalls = calls.filter((c) => c.url.includes('finance.yahoo')).length;
    check('a 429 is labelled as rate limiting', !!err && /rate limited/i.test(err.message), err ? err.message.slice(0, 86) : '');
    check('a 429 is retried with backoff (3 attempts x 2 hosts)', yCalls === 6, `${yCalls} Yahoo calls`);
  }
  {
    C.clearCache();
    installStub((u) => (u.includes('okx.com') ? okxFail : { json: { chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } } }));
    const { err } = await tryGet('ZZZZZ', '15m');
    check('a 200-with-chart.error is surfaced, not collapsed to "no result"',
      !!err && /No data found, symbol may be delisted/.test(err.message), err ? err.message.slice(0, 106) : '');
  }
  {
    C.clearCache();
    const nullEnv = envelope(900e3, 50);
    nullEnv.chart.result[0].indicators.quote[0] = { open: null, high: null, low: null, close: null, volume: null };
    installStub((u) => (u.includes('okx.com') ? okxFail : { json: nullEnv }));
    const { err } = await tryGet('EURUSD', '15m');
    check('an all-null response says how many bars were dropped', !!err && /no usable bars in 50 timestamps/.test(err.message),
      err ? err.message.slice(0, 96) : '');
  }
  {
    C.clearCache();
    const calls = installStub((u) => (u.includes('okx.com') ? okxFail : okxFail));
    await tryGet('EURUSD', '15m');
    const yCalls = calls.filter((c) => c.url.includes('finance.yahoo')).length;
    check('a network reset is NOT retried (bounded latency)', yCalls === 2,
      `${yCalls} Yahoo calls — one per host, no backoff loop; a 14s timeout stays 14s, not 42s`);
  }

  /* ============================================ 4. the User-Agent ========== */
  console.log('\n— M121: the User-Agent no longer announces itself as a bot —');
  {
    C.clearCache();
    const calls = installStub((u) => (u.includes('okx.com') ? okxFail : yahooOk(u)));
    await tryGet('EURUSD', '15m');
    const ua = (calls.find((c) => c.url.includes('finance.yahoo')) || {}).ua || '';
    check('not the `Mozilla/5.0 (compatible; Bot/x)` format', !/Mozilla\/5\.0 \(compatible;/i.test(ua), ua.slice(0, 68));
    check('is a browser UA', /AppleWebKit|Chrome|Safari/i.test(ua), ua.slice(0, 68));
    if (has('UA')) check('the sent UA matches the exported constant', ua === C.UA, 'consistent');
    else note('UA constant not exported — pre-M121 tree, skipping that one assertion');
  }

  /* ============================================ 5. range sizing =========== */
  console.log('\n— M121: ask Yahoo for the tightest range that covers the request —');
  {
    if (!has('rangeFor')) { note('rangeFor not exported — pre-M121 tree, skipping range-sizing unit tests'); }
    else {
      check('15m/limit 400 asks for 1mo, not the 60d maximum', C.rangeFor('15m', '60d', 400) === '1mo', `got ${C.rangeFor('15m', '60d', 400)}`);
      check('15m/limit 4000 still escalates to 60d', C.rangeFor('15m', '60d', 4000) === '60d', `got ${C.rangeFor('15m', '60d', 4000)}`);
      check('1h/limit 300 asks for 3mo, not 730d', C.rangeFor('1h', '730d', 300) === '3mo', `got ${C.rangeFor('1h', '730d', 300)}`);
      check('never exceeds the interval maximum', C.rangeFor('1m', '7d', 99999) === '7d', `got ${C.rangeFor('1m', '7d', 99999)}`);
      check('unknown interval keeps the old behaviour', C.rangeFor('99m', '60d', 100) === '60d', `got ${C.rangeFor('99m', '60d', 100)}`);
    }
    C.clearCache();
    const calls = installStub(yahooOk);
    await tryGet('EURUSD', '15m', 400);
    const u = (calls.find((c) => c.url.includes('finance.yahoo')) || {}).url || '';
    check('the URL actually carries the tighter range', /range=1mo&interval=15m/.test(u),
      (/[?&]range=[^&]+&interval=[^&]+/.exec(u) || [''])[0]);
  }

  /* ============================================ 6. error-body parsing ===== */
  console.log('\n— M121: yahooErrorText parses what Yahoo actually sends —');
  {
    if (!has('yahooErrorText')) { note('yahooErrorText not exported — pre-M121 tree, skipping parser unit tests'); }
    else {
      const crumb = C.yahooErrorText('{"finance":{"result":null,"error":{"code":"Unauthorized","description":"Invalid Crumb"}}}');
      check('finance.error envelope', crumb === 'Unauthorized: Invalid Crumb', crumb);
      const notFound = C.yahooErrorText('{"chart":{"error":{"description":"No data found"}}}');
      check('chart.error envelope', /No data found/.test(notFound), notFound);
      check('non-JSON body passes through, truncated', C.yahooErrorText('x'.repeat(400)).length <= 121, `${C.yahooErrorText('x'.repeat(400)).length} chars`);
      check('empty body yields an empty reason', C.yahooErrorText('') === '', 'no spurious text');
    }
  }

  /* ============================ 4. is it unreachable, or is it bad data? ==== */
  // Added after a real report of `Analysis failed: No candles for XAUUSD 1w (... query2: fetch
  // failed | query1: fetch failed)`. That message names the hosts and the queries but does not say
  // which FAMILY of failure it is, and the two families need opposite responses: a transport
  // failure means fix connectivity (or run the app somewhere that can reach Yahoo), while a 4xx or
  // an empty dataset means fix the symbol. Conflating them sends the user debugging the wrong thing.
  console.log('\n— M122: does the failure say WHETHER the hosts were reachable at all? —');
  const HAS_HINT = typeof C.netHint === 'function';
  check('candles.js exposes a failure classifier', HAS_HINT, HAS_HINT ? 'netHint exported' : 'absent — pre-M122 tree');
  if (HAS_HINT) {
    const H = C.netHint;
    const netList = ['Yahoo: fetch failed (ECONNRESET)', 'OKX: fetch failed (ENOTFOUND)'];
    const mixed = ['Yahoo: fetch failed (ECONNRESET)', 'Yahoo: HTTP 404 — No data found for symbol'];
    const dataOnly = ['Yahoo: no usable bars in 3000 timestamps (every OHLC value null)'];
    check('an all-transport failure list IS classified as connectivity', !!H(netList),
      H(netList) ? H(netList).slice(0, 72) + '…' : 'null');
    check('the classification says it is NOT a symbol or interval problem',
      /connectivity/.test(H(netList) || '') && /not a bad symbol/.test(H(netList) || ''), (H(netList) || '').slice(0, 90));
    // The important direction: it must never claim "unreachable" when a host DID answer.
    check('a MIXED list is NOT classified as connectivity (one host answered 404)', H(mixed) === null,
      H(mixed) === null ? 'null — no false claim' : 'FALSE CLAIM: ' + H(mixed).slice(0, 60));
    check('a pure data problem is NOT classified as connectivity', H(dataOnly) === null,
      H(dataOnly) === null ? 'null' : 'FALSE CLAIM');
    check('an empty error list yields no hint', H([]) === null && H(null) === null && H(undefined) === null,
      `${H([])} / ${H(null)} / ${H(undefined)}`);
    check('a bare "fetch failed" with no cause code still classifies', !!H(['Yahoo: fetch failed']), 'matched');
    check('an HTTP-only list is not connectivity', H(['Yahoo: HTTP 429 (rate limited) — Too Many Requests']) === null, 'null');
  }

  {   // end to end: every provider unreachable at the transport layer
    C.clearCache();
    const netErr = () => ({ throw: Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }) });
    installStub(netErr);
    const { err } = await tryGet('EURUSD', '15m');
    check('a transport failure surfaces the CAUSE CODE, not just "fetch failed"',
      !!err && /ECONNRESET/.test(err.message), err ? (err.message.match(/\((ECONNRESET|ENOTFOUND)\)/g) || ['no code']).join(',') : 'no error');
    check('and the end-to-end message carries the connectivity classification',
      !!err && /\[network:/.test(err.message), err ? (/\[network:/.test(err.message) ? 'present' : 'ABSENT: ' + err.message.slice(0, 90)) : 'no error');
  }
  {   // end to end: the hosts ANSWER, with a 404 — must not be called unreachable
    C.clearCache();
    installStub((u) => (u.includes('okx.com') ? okxFail : { status: 404, body: JSON.stringify({ chart: { result: null, error: { code: 'Not Found', description: 'No data found for symbol' } } }) }));
    const { err } = await tryGet('EURUSD', '15m');
    check('a 404 is reported as a data/symbol problem, NOT as connectivity',
      !!err && !/\[network:/.test(err.message), err ? (/\[network:/.test(err.message) ? 'FALSE CLAIM' : 'correctly withheld') : 'no error');
    check('the 404 still names both hosts and Yahoo\'s own reason',
      !!err && /query2/.test(err.message) && /query1/.test(err.message) && /No data found/.test(err.message),
      err ? err.message.slice(0, 110) : '');
  }

  /* ==================== 5. the offline demo source (M123) ================== */
  // TJ_OFFLINE_CANDLES is read once at module load, so the "on" arm has to run in a child
  // process. Both arms are asserted: the default must be OFF (a trading journal that quietly
  // invented prices would be worse than one that refused), and the on arm must be labelled,
  // coherent across timeframes, and exactly spaced.
  console.log('\n— M123: is the offline demo source off by default, and honest when on? —');
  const cp = require('child_process');
  check('the offline source is OFF unless explicitly enabled', C.OFFLINE === false, `OFFLINE=${C.OFFLINE}`);
  const run = (env, script) => {
    const r = cp.spawnSync(process.execPath, ['-e', script], {
      cwd: ROOT, env: Object.assign({}, process.env, env), encoding: 'utf8',
    });
    if (r.status !== 0) return { err: (r.stderr || r.stdout || '').slice(0, 160) };
    try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { err: 'unparsable: ' + r.stdout.slice(0, 120) }; }
  };
  const PROBE = `const C=require('./src/candles.js');(async()=>{
    const out={offline:C.OFFLINE};
    // With the flag off this arm must NOT try to fetch: the whole point is that the default
    // path still requires a live feed, and in this sandbox that throws. Report the flag only.
    if (!C.OFFLINE) { console.log(JSON.stringify(out)); return; }
    const seen={};
    for (const tf of ['15m','1h','4h','1d','1w']) {
      const r=await C.getCandles('XAUUSD',tf,{limit:200,force:true});
      const m=r.meta, bad=r.candles.filter(b=>!(b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c))).length;
      const sorted=r.candles.every((b,i)=>i===0||b.t>r.candles[i-1].t);
      seen[tf]={bars:r.candles.length,provider:m.provider,demo:!!m.demo,warn:!!m.warning,
        last:m.last_price,bad,sorted,step:C.fmtStep(C.medianStep(r.candles)),
        spaced:C.spacingOk(C.medianStep(r.candles),C.tfInfo(tf).ms)};
    }
    out.seen=seen;
    const a=await C.getCandles('XAUUSD','15m',{limit:80,force:true});
    const b=await C.getCandles('XAUUSD','15m',{limit:80,force:true});
    out.deterministic=JSON.stringify(a.candles)===JSON.stringify(b.candles);
    console.log(JSON.stringify(out));})()`;
  const off = run({ TJ_OFFLINE_CANDLES: '' }, PROBE);
  const on = run({ TJ_OFFLINE_CANDLES: '1' }, PROBE);
  check('a child process with no flag reports OFFLINE false', off && off.offline === false, off && off.err ? off.err : `offline=${off && off.offline}`);
  check('a child process with the flag reports OFFLINE true', on && on.offline === true, on && on.err ? on.err : `offline=${on && on.offline}`);
  if (on && on.seen) {
    const tfs = Object.keys(on.seen);
    check('every timeframe returns bars with no network at all',
      tfs.length === 5 && tfs.every((t) => on.seen[t].bars === 200), tfs.map((t) => `${t}:${on.seen[t].bars}`).join(' '));
    check('every bar is labelled offline-synthetic', tfs.every((t) => on.seen[t].provider === 'offline-synthetic'), 'all five');
    check('every response carries demo:true AND a warning sentence',
      tfs.every((t) => on.seen[t].demo && on.seen[t].warn), 'both labels on all five');
    check('spacing is exact, so the M121 interval guard passes for the right reason',
      tfs.every((t) => on.seen[t].spaced), tfs.map((t) => `${t}:${on.seen[t].step}`).join(' '));
    check('no malformed bars (h >= max(o,c), l <= min(o,c))', tfs.every((t) => on.seen[t].bad === 0),
      tfs.map((t) => `${t}:${on.seen[t].bad}`).join(' '));
    check('bars are sorted oldest to newest', tfs.every((t) => on.seen[t].sorted), 'all five');
    // One instrument cannot have five current prices. The first version of this did: the drift
    // term compounded, so 1w ended at 27362 while 15m ended at 2899.
    const prices = tfs.map((t) => on.seen[t].last);
    check('all timeframes of one symbol agree on the current price',
      new Set(prices).size === 1, prices.join(' / '));
    check('the series is deterministic, so a preview is reproducible', on.deterministic === true, `${on.deterministic}`);
  }

  /* ------------------------------------------------------------- report */
  note('Everything above ran against a STUBBED fetch. It proves request-building, fallback order,');
  note('aggregation, the guard and the error reporting. It cannot prove Yahoo ACCEPTS the request —');
  note('nothing in this sandbox can (TLS reset, ANALYSIS.md §3). Re-run where the network is open.');
  console.log('\n' + '—'.repeat(34));
  for (const n of notes) console.log('  note  ' + n);
  console.log('\nCANDLE/PROVIDER PROBE: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('PROBE ERROR', e); process.exit(1); });
