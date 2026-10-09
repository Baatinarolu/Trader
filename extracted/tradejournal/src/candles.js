'use strict';
/**
 * Candle / OHLCV provider layer.
 *
 * The Market Mechanics bots are price-action bots: they need real OHLC bars,
 * not the single quote tick that the journal's market overview uses. This
 * module hides the provider zoo behind one function:
 *
 *     const { candles, meta } = await getCandles('XAUUSD', '15m', { limit: 600 });
 *
 * Providers (all free, no API key, chosen because they answer from arbitrary hosts):
 *   - OKX public candles   -> crypto, best intraday granularity, always current
 *   - Yahoo Finance chart  -> forex / indices / futures / stocks / ETFs  (=X, ^, =F)
 *   - CoinGecko OHLC       -> crypto fallback when OKX is unreachable (4h only)
 *
 * Guarantees the callers rely on:
 *   - bars are sorted oldest -> newest
 *   - every bar has finite o/h/l/c, high >= max(o,c), low <= min(o,c)
 *   - the newest bar may still be forming; meta.last_bar_closed tells the caller
 *   - results are cached per (symbol, timeframe) with a timeframe-aware TTL
 */

const { YAHOO_MAP, COINGECKO_IDS } = require('./market');
const B = require('./instruments');

/* ------------------------------------------------------------------ timeframes */

/**
 * tf -> provider mapping. `yahooRange` is the largest range Yahoo answers for
 * that interval; `agg` means "fetch `base` then aggregate by `factor`".
 */
const TIMEFRAMES = {
  '1m': { ms: 60e3, yahoo: '1m', yahooRange: '7d', okx: '1m', ttl: 25, label: '1 minute' },
  '3m': { ms: 180e3, yahoo: null, yahooRange: null, okx: '3m', ttl: 40, label: '3 minutes' },
  '5m': { ms: 300e3, yahoo: '5m', yahooRange: '1mo', okx: '5m', ttl: 45, label: '5 minutes' },
  '15m': { ms: 900e3, yahoo: '15m', yahooRange: '60d', okx: '15m', ttl: 60, label: '15 minutes' },
  '30m': { ms: 1800e3, yahoo: '30m', yahooRange: '60d', okx: '30m', ttl: 120, label: '30 minutes' },
  '1h': { ms: 3600e3, yahoo: '1h', yahooRange: '730d', okx: '1H', ttl: 180, label: '1 hour' },
  '4h': { ms: 4 * 3600e3, yahoo: null, yahooRange: null, yahooFrom: '1h', agg: 4, okx: '4H', ttl: 300, label: '4 hours' },
  '1d': { ms: 864e5, yahoo: '1d', yahooRange: '2y', okx: '1D', ttl: 900, label: '1 day' },
  '1w': { ms: 7 * 864e5, yahoo: '1wk', yahooRange: '5y', okx: '1W', ttl: 3600, label: '1 week' },
};
const TF_KEYS = Object.keys(TIMEFRAMES);
const DEFAULT_TF = '15m';

/** Timeframes a user can pick for a chart, in display order. */
const CHART_TFS = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

function tfInfo(tf) {
  const key = TIMEFRAMES[tf] ? tf : DEFAULT_TF;
  return { key, ...TIMEFRAMES[key] };
}

/* ------------------------------------------------------------------ symbols */

const CRYPTO_YAHOO = {
  BTCUSDT: 'BTC-USD', ETHUSDT: 'ETH-USD', SOLUSDT: 'SOL-USD', BNBUSDT: 'BNB-USD',
  XRPUSDT: 'XRP-USD', ADAUSDT: 'ADA-USD', DOGEUSDT: 'DOGE-USD', LINKUSDT: 'LINK-USD',
  BTCUSD: 'BTC-USD', ETHUSD: 'ETH-USD', SOLUSD: 'SOL-USD', BTCUSDC: 'BTC-USD', ETHUSDC: 'ETH-USD',
  XAUUSDT: 'GOLD-USD',
};

const isCryptoSymbol = (s) => !!(COINGECKO_IDS[s] || CRYPTO_YAHOO[s] || /USDT$/.test(s));

/** Base/quote split for a crypto symbol, e.g. BTCUSDT -> {base:'BTC', quote:'USDT'} */
function cryptoSplit(sym) {
  const m = /^([A-Z0-9]{2,6}?)(USDT|USDC|USD|BTC|ETH)$/.exec(sym);
  if (m) return { base: m[1], quote: m[2] };
  return { base: sym.replace(/(USDT|USDC|USD)$/, '') || sym, quote: 'USD' };
}

/**
 * Work out how to fetch a journal instrument symbol.
 * @returns {{symbol:string, provider:'okx'|'yahoo'|'coingecko', ticker:string, note:string, assetClass:string}}
 */
function resolveSymbol(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  const spec = B.PRESETS.find((p) => p.symbol === sym);
  const assetClass = spec ? spec.asset_class : isCryptoSymbol(sym) ? 'crypto' : 'stocks';

  if (isCryptoSymbol(sym)) {
    const { base, quote } = cryptoSplit(sym);
    const q = quote === 'USDC' ? 'USDC' : 'USDT';
    return {
      symbol: sym, provider: 'okx', ticker: `${base}-${q}`,
      fallback: CRYPTO_YAHOO[sym] || `${base}-USD`,
      coingecko: COINGECKO_IDS[sym] || null,
      assetClass: 'crypto', note: `OKX ${base}/${q}`,
    };
  }
  const ticker = YAHOO_MAP[sym] || sym;
  return { symbol: sym, provider: 'yahoo', ticker, assetClass, note: `Yahoo ${ticker}` };
}

/* ------------------------------------------------------------------ cache */

const cache = new Map(); // key -> { at, candles, meta }
const CACHE_MAX = 300;

function cacheGet(key, ttlSec) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlSec * 1000) { cache.delete(key); return null; }
  return hit;
}
function cacheSet(key, candles, meta) {
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), candles, meta });
}
function clearCache() { cache.clear(); }

/* ------------------------------------------------------------------ fetch */

/**
 * M121 — the User-Agent this used to send was `Mozilla/5.0 (compatible; TradeJournalPro/2.0)`.
 * That is the *conventional bot format* — `Mozilla/5.0 (compatible; <name>/<version>)` is exactly
 * what Googlebot and Bingbot announce themselves with. Yahoo's edge is documented to treat such
 * callers as automated and to answer them with 401/403/429, and the public chart endpoint needs
 * no crumb or cookie, so an announce-yourself-as-a-bot UA buys nothing and risks the request.
 * A plain browser UA is what every maintained Yahoo client sends.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Pull the human-readable reason out of a Yahoo error body. Yahoo answers 401/429 with JSON
 * that says precisely what is wrong — `{"finance":{"result":null,"error":{"code":"Unauthorized",
 * "description":"Invalid Crumb"}}}` — and the old code threw a bare `HTTP 401` and discarded it,
 * so the one string that identifies the cause never reached the caller, the log, or the UI.
 * @returns {string} the reason, or '' when the body carries none
 */
function yahooErrorText(body) {
  const s = String(body || '').trim();
  if (!s) return '';
  try {
    const j = JSON.parse(s);
    const e = (j && j.finance && j.finance.error) || (j && j.chart && j.chart.error) || null;
    if (e) return [e.code, e.description].filter(Boolean).join(': ');
  } catch (_) { /* not JSON — fall through to the raw snippet */ }
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

/**
 * Fetch JSON, retrying ONLY on a server-side throttle/5xx.
 *
 * Deliberately does not retry on network errors or timeouts: those cost the full `timeout` each
 * attempt, and retrying them turns a 14 s failure into a 42 s one on every symbol the scheduler
 * fans out across. A 429 answers immediately, so backing off it is cheap — and Yahoo's throttle
 * is the documented reason a chart call fails intermittently after a burst of them.
 */
async function fetchJson(url, { timeout = 12000, headers = {}, retries = 2 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));   // 400ms, then 800ms
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9', ...headers },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const why = yahooErrorText(body);
        const err = new Error(`HTTP ${res.status}${res.status === 429 ? ' (rate limited)' : ''}${why ? ` — ${why}` : ''}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      const retryable = e.status === 429 || (e.status >= 500 && e.status <= 599);
      if (!retryable || attempt === retries) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

const n2 = (v) => (Number.isFinite(v) ? v : null);

/* ═══════════════════════════════════════════════════ M123: offline demo bars ══
 * The live providers are unreachable from some hosts. Concretely, from the sandbox
 * this repository is previewed in: DNS resolves and TCP 443 connects to
 * query1/query2.finance.yahoo.com, then the TLS handshake is reset (ECONNRESET),
 * while allowlisted hosts answer 200 from the same process. No change to this file
 * can fix that — it is a property of the network the process sits on.
 *
 * What that leaves is a choice between an app that cannot be exercised at all and
 * an app that can be exercised on data it is honest about. This is the second one.
 *
 * OFF BY DEFAULT, and it has to stay that way: a trading journal that quietly
 * invented prices would be far worse than one that refused to answer. It is enabled
 * only by TJ_OFFLINE_CANDLES=1 in the environment, and every bar it produces is
 * labelled in three places at once — meta.provider ('offline-synthetic'), meta.demo
 * (true) and meta.warning (a sentence) — so it cannot be mistaken for a feed, and a
 * caller can refuse to render it by checking one field.
 *
 * Deterministic on purpose: the same symbol and timeframe always produce the same
 * series, so two people looking at the same preview see the same chart and a UI
 * regression is reproducible. It is a random walk, not a model of anything, and it
 * carries no view about where price goes next.
 */
const OFFLINE = /^(1|true|yes|on)$/i.test(String(process.env.TJ_OFFLINE_CANDLES || '').trim());
const OFFLINE_WARNING = 'OFFLINE DEMO DATA — these bars were generated on this machine because no '
  + 'market-data host was reachable. They are synthetic, not prices, and must not be used for a '
  + 'trading decision. Unset TJ_OFFLINE_CANDLES to require a live feed.';

// A handful of recognisable levels so the preview does not show gold at 3.7. Anything
// not listed gets a stable hash-derived level; the walk is arbitrary either way.
const OFFLINE_BASE = {
  XAUUSD: 2650, 'GC=F': 2650, XAGUSD: 31, EURUSD: 1.09, GBPUSD: 1.27, USDJPY: 152,
  AUDUSD: 0.66, USDCAD: 1.36, USDCHF: 0.88, NZDUSD: 0.61, BTCUSDT: 68000,
  ETHUSDT: 3500, SPX500: 5750, NAS100: 20000, US30: 42000,
};
const OFFLINE_PROVIDER = 'offline-synthetic';

function offlineSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
// mulberry32 — small, fast, and reproducible across processes and Node versions,
// which Math.random() seeded by hand would not be.
function offlineRnd(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The price the demo series ends on. Derived from the SYMBOL ONLY, never the timeframe,
 * so every chart of one instrument agrees about where price is now. The first version of
 * this let the drift term compound: 300 weekly bars walked gold from 2650 to 27362 while
 * the 15m series ended at 2899 — three different current prices for one symbol, which is
 * obviously broken data and would have made the preview misleading rather than merely
 * synthetic.
 */
function offlineAnchor(res) {
  const base = OFFLINE_BASE[res.symbol] || OFFLINE_BASE[res.ticker]
    || Math.round((5 + (offlineSeed(res.symbol) % 40000)) * 100) / 100;
  const jitter = ((offlineSeed(res.symbol + '|anchor') % 1000) / 1000 - 0.5) * 0.10;
  return base * (1 + jitter);
}

/**
 * Build `limit` bars of the exact requested timeframe, ending on the most recent closed
 * boundary. Spacing is exact by construction, so the M121 interval guard — which exists to
 * catch a provider answering the wrong timeframe — passes for the right reason rather than
 * being bypassed. OHLC is clamped after rounding so a bar can never come out malformed.
 */
function offlineCandles(res, info, limit) {
  const rnd = offlineRnd(offlineSeed(`${res.symbol}|${info.key}`));
  const anchor = offlineAnchor(res);
  // Per-bar volatility scaled from a 15m reference by sqrt(time), the usual diffusion
  // scaling, so a weekly bar is not the same size as a one-minute bar.
  const vol = 0.0009 * Math.sqrt(info.ms / 900000);
  const digits = anchor < 10 ? 5 : anchor < 1000 ? 3 : 2;
  const rd = (v) => Number(v.toFixed(digits));

  // Log returns first, then re-centred so the walk ENDS on the anchor whatever its length
  // or timeframe. A slow sinusoidal regime drift keeps trends and ranges in the series —
  // the structure engines downstream need something to find, or every demo chart is a flat
  // blob and the UI looks broken for an unrelated reason.
  const rets = [];
  for (let i = 0; i < limit; i++) {
    const drift = Math.sin(i / 90) * vol * 0.5 + Math.sin(i / 23) * vol * 0.18;
    const shock = (rnd() + rnd() + rnd() - 1.5) * vol;        // ~normal, mean 0
    rets.push(drift + shock);
  }
  let price = anchor * Math.exp(-rets.reduce((a, b) => a + b, 0));

  const step = info.ms;
  const lastT = Math.floor(Date.now() / step) * step;          // current boundary
  const out = [];
  for (let i = 0; i < limit; i++) {
    const o = price;
    const c = o * Math.exp(rets[i]);
    price = c;                                                 // walk on unrounded values
    const O = rd(o), C = rd(c);
    let H = rd(Math.max(o, c) * (1 + rnd() * vol * 0.7));
    let L = rd(Math.min(o, c) * (1 - rnd() * vol * 0.7));
    // Rounding can invert a very small wick, and bots-test asserts h >= max(o,c) and
    // l <= min(o,c) on every bar. Clamp rather than hope.
    const top = Math.max(O, C), bot = Math.min(O, C);
    if (H < top) H = top;
    if (L > bot) L = bot;
    if (H < L) H = L;
    out.push({ t: lastT - (limit - 1 - i) * step, o: O, h: H, l: L, c: C, v: Math.round(500 + rnd() * 4000) });
  }
  return out;
}

/* Transport-level failure markers. A failure matching one of these means the request never got a
 * reply: DNS did not resolve, TCP did not connect, or TLS was reset. That is a different problem
 * from an HTTP 4xx/5xx, an unknown symbol, or a symbol Yahoo knows but has no bars for — and the
 * three call for different responses (fix connectivity / fix the symbol / nothing is wrong). */
const NET_MARKERS = ['fetch failed', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'UND_ERR', 'socket hang up',
  'network socket disconnected', 'TLS', 'SSL', 'getaddrinfo'];

/**
 * Classify a list of provider error strings.
 * Returns a sentence ONLY when every provider failed at the transport layer, so it can never
 * claim "unreachable" while one host was actually answering with a 404 or an empty dataset.
 * Exported so the probe can test the classifier directly rather than only through a live fetch.
 */
function netHint(errors) {
  const list = (errors || []).filter((e) => typeof e === 'string' && e.trim());
  if (!list.length) return null;
  const net = list.filter((e) => NET_MARKERS.some((m) => e.includes(m)));
  if (net.length !== list.length) return null;
  return '[network: every provider failed at the transport layer, so the data hosts were '
    + 'unreachable from this machine. That is a connectivity problem, not a bad symbol, an '
    + 'unsupported interval, or an empty dataset — no data source replied at all.]';
}

/**
 * Yahoo chart API -> bars. Tries both hosts (they fail independently).
 *
 * M121: this needs no crumb or cookie. The v8 chart endpoint is the one Yahoo endpoint that
 * still answers unauthenticated — it is what yfinance's `Ticker.history()` uses, and clients
 * that DO send a cookie+crumb here report persistent 429 outages as a result. So the
 * crumb-free design is correct and is deliberately kept; what was missing is the diagnostics.
 */
async function yahooCandles(ticker, interval, range) {
  const path = (host) => `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&includePrePost=false`;
  const errs = [];
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const j = await fetchJson(path(host), { timeout: 14000 });
      const chart = j && j.chart;
      // Yahoo answers HTTP 200 with the error in the BODY for a bad or delisted symbol:
      // {"chart":{"result":null,"error":{"code":"Not Found","description":"No data found,
      // symbol may be delisted"}}}. `!res.ok` never fires for that, so it used to collapse
      // into a bare "no result" and the explanation was thrown away.
      if (chart && chart.error) {
        throw new Error([chart.error.code, chart.error.description].filter(Boolean).join(': ') || 'chart error');
      }
      const r = chart && chart.result && chart.result[0];
      if (!r || !r.timestamp) throw new Error('no result in response');
      const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
      const out = [];
      for (let i = 0; i < r.timestamp.length; i++) {
        const o = n2(q.open && q.open[i]); const h = n2(q.high && q.high[i]);
        const l = n2(q.low && q.low[i]); const c = n2(q.close && q.close[i]);
        if (o === null || h === null || l === null || c === null) continue;
        out.push({ t: r.timestamp[i] * 1000, o, h, l, c, v: n2(q.volume && q.volume[i]) || 0 });
      }
      // Say how many were dropped: "no bars" alone does not distinguish an empty response
      // from a full one whose OHLC were all null (which is what Yahoo returns for a symbol
      // it knows but has no data for).
      if (!out.length) throw new Error(`no usable bars in ${r.timestamp.length} timestamps (every OHLC value null)`);
      return { candles: out, meta: { provider: 'yahoo', ticker, currency: r.meta && r.meta.currency, exchange: (r.meta && r.meta.exchangeName) || null, tz: (r.meta && r.meta.exchangeTimezoneName) || null } };
    } catch (e) {
      // Name the transport cause. undici reports every network-level failure as the bare
      // string "fetch failed" and puts the actual evidence in e.cause.code, so without this
      // a TLS reset, a DNS failure and a refused connection all look identical — and all three
      // mean "this host could not be reached", not "Yahoo has no data for that symbol".
      const code = e && e.cause && (e.cause.code || e.cause.message);
      errs.push(`${host.split('.')[0]}: ${e.message}${code ? ` (${code})` : ''}`);
    }
  }
  // Report BOTH hosts. Keeping only the last one let a network failure on query1 mask an
  // authentication failure on query2, which is the one that actually explains the outage.
  throw new Error(`Yahoo ${ticker} [${interval}/${range}]: ${errs.join(' | ') || 'unavailable'}`);
}

/** OKX public candles -> bars (newest first upstream, reversed here). */
async function okxCandles(instId, bar, limit = 300, { after = null } = {}) {
  const cursor = after ? `&after=${encodeURIComponent(after)}` : '';
  const url = `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${Math.min(Math.max(limit, 20), 300)}${cursor}`;
  const j = await fetchJson(url, { timeout: 14000 });
  if (!j || j.code !== '0' || !Array.isArray(j.data)) throw new Error((j && j.msg) || 'OKX error');
  const out = j.data
    .map((row) => ({ t: Number(row[0]), o: Number(row[1]), h: Number(row[2]), l: Number(row[3]), c: Number(row[4]), v: Number(row[5]) }))
    .filter((b) => [b.t, b.o, b.h, b.l, b.c].every(Number.isFinite))
    .sort((a, b) => a.t - b.t);
  if (!out.length) throw new Error('OKX returned no bars');
  return { candles: out, meta: { provider: 'okx', ticker: instId } };
}

/** CoinGecko OHLC fallback (only 1d/4h style granularity for short ranges). */
async function coingeckoCandles(coinId, days = 30) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${days}`;
  const arr = await fetchJson(url, { timeout: 15000 });
  if (!Array.isArray(arr) || !arr.length) throw new Error('CoinGecko returned no bars');
  const out = arr.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: 0 })).sort((a, b) => a.t - b.t);
  const step = out.length > 2 ? out[1].t - out[0].t : 4 * 3600e3;
  return { candles: out, meta: { provider: 'coingecko', ticker: coinId, barMs: step, note: `${Math.round(step / 3600e3)}h bars` } };
}

/* ------------------------------------------------------------------ aggregation */

/** Group bars into buckets of `factor` base bars (aligned to the UTC epoch). */
function aggregate(candles, factor) {
  if (!factor || factor <= 1) return candles;
  const out = [];
  for (let i = 0; i < candles.length; i += factor) {
    const slice = candles.slice(i, i + factor);
    if (!slice.length) continue;
    out.push({
      t: slice[0].t,
      o: slice[0].o,
      h: Math.max(...slice.map((b) => b.h)),
      l: Math.min(...slice.map((b) => b.l)),
      c: slice[slice.length - 1].c,
      v: slice.reduce((a, b) => a + (b.v || 0), 0),
      n: slice.length,
    });
  }
  return out;
}

/** Defensive clean-up so the engines never see a malformed bar. */
function sanitise(candles) {
  const out = [];
  for (const b of candles) {
    const o = Number(b.o), h = Number(b.h), l = Number(b.l), c = Number(b.c);
    if (![o, h, l, c].every(Number.isFinite) || o <= 0 || h <= 0 || l <= 0 || c <= 0) continue;
    out.push({ t: Number(b.t) || 0, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: Number(b.v) || 0, n: b.n });
  }
  return out;
}

/**
 * Fetch normalised candles.
 * @param {string} symbol  journal instrument symbol (XAUUSD, BTCUSDT, ES, AAPL…)
 * @param {string} tf      one of TF_KEYS
 * @param {{limit?:number, force?:boolean}} [opts] limit = bars to return (backtest wants ~1500)
 * @returns {Promise<{candles:Array, meta:object}>}
 */
/* ------------------------------------------------- M121: interval integrity */

/** Median inter-bar spacing in ms, or null when there are too few bars to judge. */
function medianStep(candles) {
  if (!Array.isArray(candles) || candles.length < 3) return null;
  const d = [];
  for (let i = 1; i < candles.length; i++) d.push(candles[i].t - candles[i - 1].t);
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

const fmtStep = (ms) => (ms >= 864e5 ? `${Math.round(ms / 864e5)}d`
  : ms >= 3600e3 ? `${Math.round(ms / 3600e3 * 10) / 10}h`
    : `${Math.round(ms / 60e3)}m`);

/**
 * Does the spacing that actually arrived match the timeframe that was asked for?
 *
 * 10 % tolerance: intraday bars are exact, and daily/weekly bars jitter with weekends and
 * holidays, but a skipped aggregation step is off by a factor of 4 or more — so this catches
 * the real failure without failing on a calendar.
 */
function spacingOk(median, expected) {
  if (median === null || !(expected > 0)) return true;
  return Math.abs(median - expected) / expected <= 0.10;
}

/**
 * The tightest Yahoo `range` that still covers `limit` bars for this interval.
 *
 * The old code always asked for `yahooRange`, the LARGEST range the interval supports — a 15m
 * request pulled 60 days (~5 700 bars) to serve a default limit of 400, about 14x the data
 * needed. That is not merely wasteful: payload size and call volume are what trip Yahoo's
 * throttle, so asking for less is part of not getting 429'd. Never returns a range larger than
 * the interval's documented maximum, and never one too small to cover the request.
 */
const RANGE_LADDER = {
  '1m': [{ r: '1d', bars: 390 }, { r: '5d', bars: 1950 }, { r: '7d', bars: 2730 }],
  '5m': [{ r: '5d', bars: 390 }, { r: '1mo', bars: 2340 }, { r: '3mo', bars: 7020 }, { r: '60d', bars: 14040 }],
  '15m': [{ r: '5d', bars: 130 }, { r: '1mo', bars: 780 }, { r: '3mo', bars: 2340 }, { r: '60d', bars: 4680 }],
  '30m': [{ r: '1mo', bars: 390 }, { r: '3mo', bars: 1170 }, { r: '60d', bars: 2340 }],
  '1h': [{ r: '1mo', bars: 150 }, { r: '3mo', bars: 450 }, { r: '6mo', bars: 900 }, { r: '1y', bars: 1800 }, { r: '730d', bars: 3600 }],
  '1d': [{ r: '6mo', bars: 126 }, { r: '1y', bars: 252 }, { r: '2y', bars: 504 }, { r: '5y', bars: 1260 }],
  '1wk': [{ r: '2y', bars: 104 }, { r: '5y', bars: 260 }, { r: '10y', bars: 520 }],
};
function rangeFor(interval, maxRange, limit) {
  const ladder = RANGE_LADDER[interval];
  if (!ladder) return maxRange;                       // unknown interval: keep today's behaviour
  for (const rung of ladder) {
    if (rung.bars >= limit && (maxRange === null || ladder.indexOf(rung) <= ladder.findIndex((x) => x.r === maxRange))) {
      return rung.r;
    }
  }
  return maxRange || ladder[ladder.length - 1].r;     // nothing on the ladder is big enough
}

async function getCandles(symbol, tf = DEFAULT_TF, opts = {}) {
  const info = tfInfo(tf);
  const res = resolveSymbol(symbol);
  const limit = Math.max(60, Math.min(Number(opts.limit) || 400, 3000));
  const key = `${res.symbol}:${info.key}:${limit}`;
  if (!opts.force) {
    const hit = cacheGet(key, info.ttl);
    if (hit) return { candles: hit.candles, meta: { ...hit.meta, cached: true } };
  }

  // M123: the offline source, when explicitly enabled. Placed after the cache lookup so
  // caching behaves normally, and before any provider is contacted so it works with no
  // network at all. It returns the same shape as the live path, with the demo labels on it.
  if (OFFLINE) {
    const candles = offlineCandles(res, info, limit);
    const last = candles[candles.length - 1];
    const meta = {
      symbol: res.symbol, timeframe: info.key, timeframe_label: info.label, bars: candles.length,
      asset_class: res.assetClass, provider: OFFLINE_PROVIDER, ticker: res.ticker,
      note: res.note || null, currency: res.currency || null, aggregation: null,
      first_bar: candles.length ? new Date(candles[0].t).toISOString() : null,
      last_bar: last ? new Date(last.t).toISOString() : null,
      last_price: last ? last.c : null,
      last_bar_closed: true,
      warnings: [OFFLINE_WARNING],
      warning: OFFLINE_WARNING,
      demo: true,
      offline: true,
      fetched_at: new Date().toISOString(),
      cached: false,
    };
    cacheSet(key, candles, meta);
    return { candles, meta };
  }

  const errors = [];
  let got = null;

  // 1) Crypto -> OKX first (deep intraday history, always live)
  if (res.provider === 'okx') {
    try {
      const bars = Math.min(limit, 300);
      const first = await okxCandles(res.ticker, info.okx, bars);
      let candles = first.candles;
      // OKX caps each call at 300 bars: page backwards with the `after` cursor
      // (returns records EARLIER than the timestamp) until we have enough history.
      let guard = 0;
      while (candles.length < limit && guard < 10) {
        guard++;
        const oldest = candles[0].t;
        const paged = await okxCandles(res.ticker, info.okx, 300, { after: oldest }).catch(() => null);
        if (!paged) break;
        const older = paged.candles.filter((b) => b.t < oldest);
        if (!older.length) break;
        candles = older.concat(candles);
      }
      got = { candles, meta: { ...first.meta, note: `OKX ${res.ticker}` } };
    } catch (e) { errors.push('OKX: ' + e.message); }
  }

  // 2) Yahoo (everything, and crypto fallback)
  if (!got && info.yahoo) {
    try {
      // M121: ask for the tightest range that covers `limit`, not the interval's maximum.
      got = await yahooCandles(res.ticker, info.yahoo, rangeFor(info.yahoo, info.yahooRange, limit));
    } catch (e) { errors.push('Yahoo: ' + e.message); }
  }
  // 2b) Crypto whose OKX call failed -> Yahoo under the -USD ticker.
  // M121 — THE BUG THIS FIXES. This branch used to fire for timeframes Yahoo does NOT serve
  // (3m, 4h) by substituting `info.yahoo || '1h'`, and because it assigned `got`, step 3's
  // aggregation was skipped. A 4h request therefore returned 1h BARS LABELLED 4h, with
  // `aggregation: null` and no warning anywhere in the response. 4h is the higher-timeframe bias
  // layer, so the direction decision was made on the wrong timeframe — silently, and only when
  // OKX was unavailable, which is exactly when nobody is looking. Proven with a stubbed fetch:
  // `4h -> median step 1h, expected 4h` and `3m -> median step 1h, expected 3m`.
  // It now goes through the same base+aggregate path as step 3, and a timeframe with neither a
  // Yahoo interval nor an aggregatable base is REFUSED rather than served wrong bars.
  if (!got && res.fallback) {
    const baseInfo = info.yahooFrom ? tfInfo(info.yahooFrom) : null;
    const fbInterval = info.yahoo || (baseInfo ? baseInfo.yahoo : null);
    if (!fbInterval) {
      errors.push(`Yahoo fallback: ${info.key} is not served by Yahoo and has no aggregatable base`);
    } else {
      try {
        const fbRange = rangeFor(fbInterval, info.yahooRange || (baseInfo ? baseInfo.yahooRange : null),
          info.yahoo ? limit : limit * (info.agg || 4) + 20);
        const r = await yahooCandles(res.fallback, fbInterval, fbRange);
        got = info.yahoo
          ? r
          : { candles: aggregate(r.candles, info.agg || 4), meta: { ...r.meta, aggregated: `${info.agg || 4}×${info.yahooFrom}` } };
      } catch (e) { errors.push('Yahoo fallback: ' + e.message); }
    }
  }

  // 3) Timeframes Yahoo does not serve (3m, 4h…) -> aggregate a smaller one
  if (!got && info.yahooFrom) {
    try {
      const baseTf = tfInfo(info.yahooFrom);
      const base = await getCandles(res.symbol, info.yahooFrom, { limit: limit * (info.agg || 4) + 20, force: opts.force });
      got = { candles: aggregate(base.candles, info.agg || 4), meta: { ...base.meta, aggregated: `${info.agg}×${info.yahooFrom}` } };
    } catch (e) { errors.push('aggregate: ' + e.message); }
  }

  // 4) CoinGecko last resort for crypto
  if (!got && res.coingecko) {
    try {
      const days = info.key === '1w' || info.key === '1d' ? 365 : info.key === '4h' ? 90 : 30;
      got = await coingeckoCandles(res.coingecko, days);
      errors.push('fell back to CoinGecko (coarser bars)');
    } catch (e) { errors.push('CoinGecko: ' + e.message); }
  }

  if (!got) {
    const hint = netHint(errors);
    throw new Error(`No candles for ${res.symbol} ${info.key} (${errors.join('; ')})${hint ? ` ${hint}` : ''}`);
  }

  let candles = sanitise(got.candles);
  if (candles.length > limit) candles = candles.slice(-limit);

  // M121: validate the spacing of what actually came back. This is the same discipline
  // ANALYSIS.md §4 already applies to every fixture — "a median step that disagrees with the
  // filename means rejection" — now applied to live data, where it matters more.
  //
  // It is the guard that makes silent timeframe mislabelling impossible from ANY provider or
  // path, not just the crypto fallback found above: a provider answering the wrong interval, a
  // skipped aggregation, or CoinGecko's coarse last-resort bars all fail here with the real
  // numbers in the message, instead of being fed to SMC, top-down and the setup model as though
  // they were the timeframe that was asked for. Refusing is the honest outcome — analysing a 4h
  // decision on 1h bars produces confidently wrong direction, which is worse than no answer.
  const median = medianStep(candles);
  if (!spacingOk(median, info.ms)) {
    throw new Error(`No candles for ${res.symbol} ${info.key}: ${got.meta.provider} returned bars spaced ` +
      `${fmtStep(median)} apart, not ${fmtStep(info.ms)} — refusing to analyse the wrong timeframe` +
      `${errors.length ? ` (${errors.join('; ')})` : ''}`);
  }

  const last = candles[candles.length - 1];
  const meta = {
    symbol: res.symbol, timeframe: info.key, timeframe_label: info.label, bars: candles.length,
    asset_class: res.assetClass, provider: got.meta.provider, ticker: got.meta.ticker,
    note: got.meta.note || res.note, currency: got.meta.currency || null,
    aggregation: got.meta.aggregated || null,
    first_bar: candles.length ? new Date(candles[0].t).toISOString() : null,
    last_bar: last ? new Date(last.t).toISOString() : null,
    last_price: last ? last.c : null,
    last_bar_closed: last ? (Date.now() - last.t) >= info.ms : false,
    warnings: errors,
    fetched_at: new Date().toISOString(),
    cached: false,
  };
  cacheSet(key, candles, meta);
  return { candles, meta };
}

module.exports = {
  TIMEFRAMES, TF_KEYS, CHART_TFS, tfInfo, resolveSymbol, getCandles, aggregate,
  clearCache, isCryptoSymbol, cryptoSplit, CRYPTO_YAHOO,
  // M121: exported so the interval-integrity guard is unit-testable on its own rather than
  // only observable through a live fetch this sandbox cannot make.
  UA, yahooErrorText, netHint, NET_MARKERS, medianStep, spacingOk, fmtStep, rangeFor, RANGE_LADDER,
  // M123: exported so the offline source is testable without a second process per assertion.
  OFFLINE, OFFLINE_WARNING, OFFLINE_PROVIDER, offlineCandles, offlineSeed,
};
