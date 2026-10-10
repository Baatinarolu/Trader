'use strict';
/**
 * fetch-fixtures.js — re-download the REAL market data the harness measures against.
 *
 * WHY THIS IS A COMMITTED SCRIPT AND NOT A HEREDOC
 *   analysis/fixtures/ is gitignored (third-party datasets do not belong in this repo), so
 *   it is wiped whenever the workspace is rebuilt — and it has been wiped mid-audit more
 *   than once, each time silently downgrading a probe's real-data section to UNTESTED. A
 *   probe that reports UNTESTED is honest; a probe that reports a pass without ever
 *   loading data is not. This makes recovery one command.
 *
 *   It works because api.github.com is inside the sandbox egress allowlist while Yahoo and
 *   OKX are not: DNS and TCP to the market-data providers succeed and then the TLS
 *   handshake is reset, so src/candles.js cannot reach them from here.
 *
 *   node analysis/fetch-fixtures.js [--tf 15m] [--force]
 *
 * VALIDATION IS THE POINT. Each file is checked for TRUE inter-bar spacing before it is
 * accepted: the median step must match the timeframe in the filename within 5 %. That is
 * what rejected two of the original sources (a file named XAUUSD-15m.csv whose median step
 * was 270 minutes), and accepting a mislabelled file would silently corrupt every
 * measurement downstream — the M121 bug was exactly this, on the live path.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, 'fixtures');

/* owner/repo · path · format · expected step in minutes.
 * Formats: csv = header + ISO-ish stamp; semi = ';'-delimited YYYY.MM.DD;
 * mt = headerless MetaTrader 'YYYY.MM.DD,o,h,l,c,vol,0'. */
const SOURCES = [
  ['EURUSD-5m.csv',   'shahryarashiq/my-vs-code-project-',        'datasets/EURUSD-5m.csv',                          'csv',  5],
  ['EURUSD-15m.csv',  'shahryarashiq/my-vs-code-project-',        'datasets/EURUSD-15m.csv',                         'csv',  15],
  ['EURUSD-1h.csv',   'shahryarashiq/my-vs-code-project-',        'datasets/EURUSD-1h.csv',                          'csv',  60],
  ['XAUUSD-5m.csv',   'Quantam-imo/newcpu',                       'market-causality-lab/data/live/mt5/XAUUSD_5m.csv', 'semi', 5],
  ['XAUUSD-15m.csv',  'fatihdogann/trading-models',               'data/XAUUSD_15m.csv',                             'csv',  15],
  ['EURUSD-1d.csv',   'ABTSoftware/SciChart.Android.Examples',    'assets/data/EURUSD_Daily.csv',                    'mt',   1440],
  ['BTCUSDT-1h.csv',  'priyanshux/cryptopy',                      'CryptoPy/data_hourly/Binance_BTCUSDT_1h.csv',      'csv',  60],
  ['BTCUSDT-1d.csv',  'wickra-lib/wickra',                        'examples/data/btcusdt-1d.csv',                    'csv',  1440],
];

/* Node's TLS verifier does not trust this sandbox's intercepted certificate, although curl
 * and Python both do. Rather than disable verification — which would ship a script that
 * silently accepts any certificate on the user's own machine — try Node first and fall back
 * to curl only for a certificate error. On a normal machine the Node path succeeds and curl
 * is never invoked. Set NODE_EXTRA_CA_CERTS to a bundle containing the intercepting CA to
 * make the Node path work here too. */
const { execFileSync } = require('child_process');

function getViaCurl(url) {
  const out = execFileSync('curl', ['-sfL', '--max-time', '60',
    '-H', 'Accept: application/vnd.github.raw+json',
    '-H', 'User-Agent: tj-audit-fetch-fixtures', url],
    { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return out.toString('utf8');
}

const CERT_ERRORS = ['unable to verify the first certificate', 'self signed certificate',
  'self-signed certificate', 'unable to get local issuer certificate', 'certificate has expired'];

function get(repo, file) {
  const url = `https://api.github.com/repos/${repo}/contents/${file.split('/').map(encodeURIComponent).join('/')}`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      headers: { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'tj-audit-fetch-fixtures' },
      timeout: 60000,
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let b = ''; res.setEncoding('utf8');
      res.on('data', (d) => { b += d; });
      res.on('end', () => resolve(b));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => {
      const msg = String(e && e.message || '');
      if (CERT_ERRORS.some((c) => msg.includes(c))) {
        try { return resolve(getViaCurl(url)); }
        catch (e2) { return reject(new Error('TLS verify failed and the curl fallback also failed: ' + (e2 && e2.message))); }
      }
      reject(e);
    });
    req.end();
  });
}

const STAMP_FORMATS = ['%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M',
  '%Y-%m-%d %H:%M:%S.%f', '%Y.%m.%d %H:%M:%S', '%Y.%m.%d %H:%M', '%Y.%m.%d', '%Y-%m-%d'];

function parseStamp(raw) {
  const s = String(raw).trim().replace('Z', '').split('+')[0].split('.')[0];
  for (const f of STAMP_FORMATS) {
    const iso = f.replace('%Y', '(\\d{4})').replace('%m', '(\\d{2})').replace('%d', '(\\d{2})')
      .replace('%H', '(\\d{2})').replace('%M', '(\\d{2})').replace('%S', '(\\d{2})').replace('%f', '\\d+');
    const m = s.match(new RegExp('^' + iso + '$'));
    if (m) {
      const g = m.slice(1).map(Number);
      return Date.UTC(g[0], g[1] - 1, g[2], g[3] || 0, g[4] || 0, g[5] || 0);
    }
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 1e9) return n < 1e11 ? n * 1000 : n;   // unix s or ms
  return NaN;
}

function parse(txt, kind) {
  const rows = [];
  const push = (t, o, h, l, c) => {
    if (Number.isFinite(t) && [o, h, l, c].every(Number.isFinite)) rows.push({ t, o, h, l, c });
  };
  if (kind === 'semi' || kind === 'mt') {
    const sep = kind === 'semi' ? ';' : ',';
    for (const line of txt.split(/\r?\n/)) {
      const p = line.split(sep);
      if (p.length < 5) continue;
      push(parseStamp(p[0]), +p[1], +p[2], +p[3], +p[4]);
    }
  } else {
    const lines = txt.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return rows;
    const hdr = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const hasHdr = hdr.some((h) => ['datetime', 'date', 'time', 'timestamp', 'open'].includes(h));
    const di = hasHdr ? Math.max(0, hdr.findIndex((h) => ['datetime', 'date', 'time', 'timestamp'].includes(h))) : 0;
    const oi = hasHdr ? Math.max(1, hdr.indexOf('open')) : 1;
    for (const line of (hasHdr ? lines.slice(1) : lines)) {
      const p = line.split(',');
      if (p.length < 5) continue;
      push(parseStamp(p[di]), +p[oi], +p[oi + 1], +p[oi + 2], +p[oi + 3]);
    }
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

function medianStepMin(rows) {
  if (rows.length < 3) return NaN;
  const steps = [];
  for (let i = 1; i < rows.length; i++) steps.push((rows[i].t - rows[i - 1].t) / 60000);
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

(async () => {
  const onlyTf = (() => { const i = process.argv.indexOf('--tf'); return i > -1 ? process.argv[i + 1] : null; })();
  const force = process.argv.includes('--force');
  fs.mkdirSync(OUT, { recursive: true });

  const list = SOURCES.filter(([, , , , ]) => true).filter((s) => !onlyTf || s[0].endsWith('-' + onlyTf + '.csv'));
  console.log('='.repeat(88));
  console.log(' FETCHING REAL OHLCV FIXTURES via api.github.com');
  console.log('='.repeat(88));
  console.log(` destination: ${OUT}`);
  console.log(` requested:   ${list.length} file(s)${onlyTf ? ` (tf=${onlyTf})` : ''}\n`);
  console.log(' file                bars   median step  expected  span                        verdict');
  console.log(' ' + '-'.repeat(86));

  let accepted = 0, rejected = 0, skipped = 0;
  for (const [name, repo, file, kind, expectMin] of list) {
    const dest = path.join(OUT, name);
    if (fs.existsSync(dest) && !force) {
      const n = fs.readFileSync(dest, 'utf8').trim().split(/\r?\n/).length - 1;
      console.log(` ${name.padEnd(18)} ${String(n).padStart(6)}   (already present — pass --force to re-fetch)`);
      skipped++; accepted++;
      continue;
    }
    let txt;
    try { txt = await get(repo, file); }
    catch (e) { console.log(` ${name.padEnd(18)} ${'-'.padStart(6)}        -      ${String(expectMin).padStart(5)}m  ${'-'.padEnd(28)}REJECTED ${e.message}`); rejected++; continue; }

    const rows = parse(txt, kind);
    if (rows.length < 50) {
      console.log(` ${name.padEnd(18)} ${String(rows.length).padStart(6)}        -      ${String(expectMin).padStart(5)}m  ${'-'.padEnd(28)}REJECTED only ${rows.length} rows parsed`);
      rejected++; continue;
    }
    const med = medianStepMin(rows);
    const within = Math.abs(med - expectMin) / expectMin < 0.05;
    const span = `${new Date(rows[0].t).toISOString().slice(0, 10)} → ${new Date(rows[rows.length - 1].t).toISOString().slice(0, 10)}`;
    if (!within) {
      // Accepting a mislabelled file corrupts every measurement downstream, so it is
      // refused even though it downloaded fine. This is what rejected two of the
      // original XAUUSD sources.
      console.log(` ${name.padEnd(18)} ${String(rows.length).padStart(6)}  ${med.toFixed(1).padStart(8)}m  ${String(expectMin).padStart(5)}m  ${span.padEnd(28)}REJECTED step mismatch`);
      rejected++; continue;
    }
    const out = ['datetime,open,high,low,close,volume'];
    for (const r of rows) out.push(`${new Date(r.t).toISOString().slice(0, 19).replace('T', ' ')},${r.o},${r.h},${r.l},${r.c},0`);
    fs.writeFileSync(dest, out.join('\n') + '\n');
    console.log(` ${name.padEnd(18)} ${String(rows.length).padStart(6)}  ${med.toFixed(1).padStart(8)}m  ${String(expectMin).padStart(5)}m  ${span.padEnd(28)}ACCEPTED`);
    accepted++;
  }

  console.log(' ' + '-'.repeat(86));
  console.log(` accepted/present ${accepted} · rejected ${rejected} · of ${list.length} requested`);
  if (rejected) console.log(' A rejection is not a network failure to retry blindly: read the reason. A 404 means the');
  if (rejected) console.log(' upstream path moved; a step mismatch means the file is mislabelled and must not be used.');
  console.log('='.repeat(88));
  process.exit(0);
})().catch((e) => { console.error('fetch-fixtures crashed:', e && e.stack || e); process.exit(1); });
