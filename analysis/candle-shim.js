'use strict';
/**
 * candle-shim.js — redirect the app's market-data fetches to REAL historical
 * OHLCV downloaded from public GitHub datasets.
 *
 * WHY THIS EXISTS
 *   This sandbox's egress is an SNI allowlist of exactly six hosts
 *   (github.com, codeload.github.com, api.github.com, registry.npmjs.org,
 *   pypi.org, files.pythonhosted.org). DNS and TCP to Yahoo/OKX succeed, then
 *   the TLS handshake is reset. So src/candles.js cannot reach its providers.
 *
 * WHAT IT DOES
 *   Patches global.fetch ONLY. It answers the two provider URL shapes that
 *   src/candles.js actually builds:
 *     https://query{1,2}.finance.yahoo.com/v8/finance/chart/<ticker>?range=&interval=
 *     https://www.okx.com/api/v5/market/candles?instId=&bar=&limit=
 *   and returns the exact JSON envelope each parser expects. Everything above
 *   the network layer — resolveSymbol, sanitise, aggregate, SMC, top-down,
 *   setups, prediction — is the project's own unmodified code.
 *
 * WHAT IT IS NOT
 *   Not live data. The bars are real but historical (2020 and 2025-26), so
 *   freshness/aging checks in now.js will correctly report the data as stale.
 *
 * Data provenance (all fetched via api.github.com on 2026-10-07, then validated
 * for TRUE inter-bar spacing before use — a median step that disagrees with the
 * filename means the file is rejected):
 *
 *   EURUSD-5m.csv    12 054 bars, step  5 min, 2025-12-15 → 2026-02-13
 *                    shahryarashiq/my-vs-code-project- · datasets/EURUSD-5m.csv
 *   EURUSD-15m.csv    4 032 bars, step 15 min, 2025-12-15 → 2026-02-13
 *                    shahryarashiq/my-vs-code-project- · datasets/EURUSD-15m.csv
 *   EURUSD-1h.csv     3 015 bars, step 60 min, 2025-09-03 → 2026-03-02
 *                    shahryarashiq/my-vs-code-project- · datasets/EURUSD-1h.csv
 *   XAUUSD-5m.csv     3 081 bars, step  5 min, 2026-04-10 → 2026-04-27
 *                    Quantam-imo/newcpu · market-causality-lab/data/live/mt5/XAUUSD_5m.csv
 *                    (source is ';'-delimited with YYYY.MM.DD stamps; normalised to CSV here)
 *   XAUUSD-15m.csv    4 534 bars, step 15 min, 2026-06-28 → 2026-09-04
 *                    fatihdogann/trading-models · data/XAUUSD_15m.csv
 *   EURUSD-1d.csv     3 186 bars, step  1 day, 1999-01-04 → 2011-08-03  (→ 656 weekly bars)
 *                    ABTSoftware/SciChart.Android.Examples · assets/data/EURUSD_Daily.csv
 *                    (source is headerless MetaTrader 'YYYY.MM.DD,o,h,l,c,vol,0'; normalised here)
 *   BTCUSDT-1h.csv    3 001 bars, step 60 min, 2020-08-01 → 2020-12-05
 *                    priyanshux/cryptopy · CryptoPy/data_hourly/Binance_BTCUSDT_1h.csv
 *   BTCUSDT-1d.csv    3 200 bars, step  1 day, 2017-08-17 → 2026-05-21  (→ 457 weekly bars)
 *                    wickra-lib/wickra · examples/data/btcusdt-1d.csv
 *
 * The 1h and 1d BTC sets cover different eras; that is fine for the stack
 * (each layer is analysed on its own timeframe) but means cross-timeframe
 * comparisons over a shared clock are not meaningful on fixtures.
 *
 * REJECTED on validation: shahryarashiq XAUUSD-15m.csv (median step 270 min, not
 * 15m) and shahryarashiq XAUUSD-5m.csv (median step 90 min, not 5m).
 */
const fs = require('fs');
const path = require('path');

const FX = path.join(__dirname, 'fixtures');

/* ------------------------------------------------------------- csv parsing */

/** Parse an OHLCV csv with a flexible header into [{t,o,h,l,c,v}] sorted by t. */
function parseCsv(file) {
  const raw = fs.readFileSync(path.join(FX, file), 'utf8').replace(/\r/g, '');
  const lines = raw.split('\n').filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (names) => {
    for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; }
    return -1;
  };
  const iT = idx(['unix', 'timestamp', 'datetime', 'date', 'stamp', 'time']);
  const iO = idx(['open']), iH = idx(['high']), iL = idx(['low']), iC = idx(['close']);
  const iV = idx(['volume', 'volume btc', 'vol']);
  const isUnixMs = head[iT] === 'unix' || head[iT] === 'timestamp';
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length <= Math.max(iT, iO, iH, iL, iC)) continue;
    let t;
    if (isUnixMs) {
      const n = Number(p[iT]);
      // some exports use microseconds
      t = n > 1e14 ? Math.floor(n / 1000) : n;
    } else {
      const s = p[iT].trim();
      // naive "YYYY-MM-DD HH:MM:SS" -> treat as UTC, otherwise let Date parse the offset
      t = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)
        ? Date.parse(s.replace(' ', 'T') + 'Z')
        : Date.parse(s);
    }
    const o = Number(p[iO]), h = Number(p[iH]), l = Number(p[iL]), c = Number(p[iC]);
    if (!Number.isFinite(t) || ![o, h, l, c].every(Number.isFinite)) continue;
    out.push({ t, o, h, l, c, v: iV >= 0 ? (Number(p[iV]) || 0) : 0 });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Median inter-bar gap, used to refuse inventing bars finer than the source. */
function medianStep(bars) {
  if (bars.length < 3) return 0;
  const d = [];
  for (let i = 1; i < bars.length; i++) d.push(bars[i].t - bars[i - 1].t);
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

/**
 * UTC-aligned bucketing onto absolute clock boundaries, so gaps (weekends,
 * session breaks) never smear a bar across a boundary it does not belong to.
 * Returns [] rather than inventing bars when the source is coarser than asked.
 */
function toTf(bars, tfMs) {
  if (!bars.length) return [];
  const base = medianStep(bars);
  if (Math.abs(base - tfMs) / tfMs < 0.02) return bars;   // already this timeframe
  if (base > tfMs * 1.02) return [];                      // cannot make finer bars
  const buckets = new Map();
  for (const b of bars) {
    const k = Math.floor(b.t / tfMs) * tfMs;
    const cur = buckets.get(k);
    if (!cur) buckets.set(k, { t: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

/* ----------------------------------------------------------- fixture store */

const NATIVE = {
  EURUSD: { '5m': 'EURUSD-5m.csv', '15m': 'EURUSD-15m.csv', '1h': 'EURUSD-1h.csv', '1d': 'EURUSD-1d.csv' },
  GBPUSD: { '5m': 'GBPUSD-5m.csv', '1h': 'GBPUSD-1h.csv' },
  XAUUSD: { '5m': 'XAUUSD-5m.csv', '15m': 'XAUUSD-15m.csv' },
  // 5m/15m/4h are one coherent set from Wastetoken/ATS (2026-07-25 → 2026-08-29),
  // so the 15m stack (bias 4h / entry 15m / trigger 5m) reads a consistent period.
  // 1h and 1d come from a different source and era; they are coherent with each
  // other and are only used by the 1h and 4h stacks.
  BTCUSDT: { '5m': 'BTCUSDT-5m.csv', '15m': 'BTCUSDT-15m.csv', '4h': 'BTCUSDT-4h.csv', '1h': 'BTCUSDT-1h.csv', '1d': 'BTCUSDT-1d.csv' },
};
const TF_MS = { '1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };

const loaded = {};   // symbol -> { tf -> bars }
function seriesFor(symbol, tf) {
  if (!NATIVE[symbol]) return null;
  loaded[symbol] = loaded[symbol] || {};
  if (loaded[symbol][tf]) return loaded[symbol][tf];
  const ms = TF_MS[tf];
  if (!ms) return null;
  // prefer a native set at exactly this tf, else build up from the finest we have
  const direct = NATIVE[symbol][tf];
  if (direct) { loaded[symbol][tf] = parseCsv(direct); return loaded[symbol][tf]; }
  const bases = Object.keys(NATIVE[symbol]).map((k) => ({ k, ms: TF_MS[k] })).filter((b) => b.ms < ms).sort((a, b) => b.ms - a.ms);
  for (const b of bases) {
    const src = parseCsv(NATIVE[symbol][b.k]);
    const agg = toTf(src, ms);
    if (agg.length >= 60) { loaded[symbol][tf] = agg; return agg; }
  }
  return null;
}

/* -------------------------------------------------- ticker <-> symbol maps */

/** Mirror of resolveSymbol()'s outbound tickers (src/candles.js). */
const YAHOO_TO_SYMBOL = {
  'EURUSD=X': 'EURUSD', 'GBPUSD=X': 'GBPUSD', 'GC=F': 'XAUUSD', 'BTC-USD': 'BTCUSDT',
  'XAUUSD=X': 'XAUUSD', 'BTC-USDT': 'BTCUSDT',
};
const OKX_TO_SYMBOL = { 'BTC-USDT': 'BTCUSDT', 'ETH-USDT': 'ETHUSDT' };
const YAHOO_IV_TO_TF = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '60m': '1h', '1d': '1d', '1wk': '1w' };
const OKX_BAR_TO_TF = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w' };

/* -------------------------------------------------------------- responses */

const realFetch = global.fetch;
let hits = 0, misses = [];

function json(obj) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

global.fetch = async function patched(input, init) {
  const url = String(typeof input === 'string' ? input : (input && input.url) || '');

  /* ---- Yahoo chart API ---- */
  let m = /^https:\/\/query[12]\.finance\.yahoo\.com\/v8\/finance\/chart\/([^?]+)\?([^#]*)$/.exec(url);
  if (m) {
    const ticker = decodeURIComponent(m[1]);
    const q = new URLSearchParams(m[2]);
    const tf = YAHOO_IV_TO_TF[String(q.get('interval'))] || null;
    const symbol = YAHOO_TO_SYMBOL[ticker];
    const bars = symbol && tf ? seriesFor(symbol, tf) : null;
    if (!bars || !bars.length) {
      misses.push(`yahoo ${ticker} ${q.get('interval')} (${symbol || 'unmapped'}/${tf || 'unmapped tf'})`);
      return json({ chart: { result: null, error: { code: 'Not Found', description: 'fixture: no data' } } });
    }
    hits++;
    return json({
      chart: {
        result: [{
          meta: { currency: 'USD', symbol: ticker, exchangeName: 'FIXTURE', exchangeTimezoneName: 'UTC', regularMarketPrice: bars[bars.length - 1].c },
          timestamp: bars.map((b) => Math.floor(b.t / 1000)),
          indicators: { quote: [{ open: bars.map((b) => b.o), high: bars.map((b) => b.h), low: bars.map((b) => b.l), close: bars.map((b) => b.c), volume: bars.map((b) => b.v) }] },
        }],
        error: null,
      },
    });
  }

  /* ---- OKX candles ---- */
  m = /^https:\/\/www\.okx\.com\/api\/v5\/market\/candles\?(.*)$/.exec(url);
  if (m) {
    const q = new URLSearchParams(m[1]);
    const instId = String(q.get('instId'));
    const tf = OKX_BAR_TO_TF[String(q.get('bar'))] || null;
    const symbol = OKX_TO_SYMBOL[instId];
    const bars = symbol && tf ? seriesFor(symbol, tf) : null;
    if (!bars || !bars.length) {
      misses.push(`okx ${instId} ${q.get('bar')} (${symbol || 'unmapped'}/${tf || 'unmapped tf'})`);
      return json({ code: '0', msg: '', data: [] });
    }
    hits++;
    const limit = Math.min(Math.max(Number(q.get('limit')) || 100, 20), 300);
    const after = q.get('after') ? Number(q.get('after')) : null;
    let sel = after ? bars.filter((b) => b.t < after) : bars;
    sel = sel.slice(-limit);
    // OKX returns newest-first rows: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    const data = sel.slice().reverse().map((b) => [String(b.t), String(b.o), String(b.h), String(b.l), String(b.c), String(b.v), '0', '0', '1']);
    return json({ code: '0', msg: '', data });
  }

  return realFetch(input, init);
};

process.on('exit', () => {
  if (process.env.TJ_SHIM_QUIET) return;
  console.log(`\n[candle-shim] served ${hits} fixture response(s)${misses.length ? '; unmapped: ' + [...new Set(misses)].slice(0, 6).join(', ') : ''}`);
});
