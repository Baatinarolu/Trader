'use strict';
/**
 * market.js — live context feeds (economic calendar, news, quotes).
 *
 * Design rules:
 *  • never block the UI — every call has a timeout, an in-memory TTL cache and a
 *    hard failure path that returns { ok:false } instead of throwing;
 *  • no API keys required — free public endpoints only;
 *  • degrade, don't break: a trader with no internet still gets their journal.
 */

const CACHE = new Map();
const TTL = { calendar: 15 * 60e3, news: 10 * 60e3, quotes: 60e3, fng: 60 * 60e3 };

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { CACHE.delete(key); return null; }
  return hit.value;
}
function cacheSet(key, value, ttl) { CACHE.set(key, { value, expires: Date.now() + ttl }); return value; }

async function fetchText(url, { timeout = 12000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json, text/xml, application/xml, text/html, */*',
        ...headers,
      },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(timer); }
}
async function fetchJson(url, opts) { return JSON.parse(await fetchText(url, opts)); }

/* ------------------------------------------------------------------ calendar */
const FF_URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

async function getCalendar({ timezone = 'Africa/Lagos', force = false } = {}) {
  const key = 'cal:' + timezone;
  if (!force) { const hit = cacheGet(key); if (hit) return hit; }
  try {
    const results = await Promise.allSettled(FF_URLS.map((u) => fetchJson(u)));
    const rows = [];
    for (const r of results) if (r.status === 'fulfilled' && Array.isArray(r.value)) rows.push(...r.value);
    if (!rows.length) throw new Error('empty calendar');
    const events = rows.map((e) => {
      const dt = new Date(e.date);
      const { timeLabel, dayLabel, dateStr } = localise(dt, timezone);
      const title = (e.title || '').trim();
      return {
        title,
        currency: e.country && e.country !== 'All' ? e.country : (guessCurrency(title) || '—'),
        impact: (e.impact || 'Low').toLowerCase(),
        date: dt.toISOString(),
        date_str: dateStr, time_label: timeLabel, day_label: dayLabel,
        forecast: e.forecast || '', previous: e.previous || '', actual: e.actual || '',
        released: !!e.actual,
      };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    return cacheSet(key, { ok: true, events, fetched_at: new Date().toISOString() }, TTL.calendar);
  } catch (err) {
    return { ok: false, error: 'Economic calendar unavailable (' + err.message + ')', events: [], fetched_at: new Date().toISOString() };
  }
}
function guessCurrency(title) {
  const t = title.toLowerCase();
  const map = [
    [/non-?farm|fomc|fed |federal funds|cpi \(us|usd|ism |initial jobless|crude oil inventories|jolts|ppi \(us/, 'USD'],
    [/ecb|euro|german|eur/, 'EUR'],
    [/boe|uk |british|gbp/, 'GBP'],
    [/boj|japan|jpy|tokyo/, 'JPY'],
    [/rba|australian|aud/, 'AUD'],
    [/rbnz|new zealand|nzd/, 'NZD'],
    [/boc|canadian|cad/, 'CAD'],
    [/snb|swiss|chf/, 'CHF'],
    [/china|chinese|cny/, 'CNY'],
  ];
  for (const [re, c] of map) if (re.test(t)) return c;
  return null;
}
function localise(dt, tz) {
  try {
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
    const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(dt);
    const dayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(dt);
    return { timeLabel, dayLabel, dateStr };
  } catch {
    return { timeLabel: dt.toISOString().slice(11, 16), dayLabel: dt.toISOString().slice(0, 10), dateStr: dt.toISOString().slice(0, 10) };
  }
}

/* ---------------------------------------------------------------------- news */
const FEEDS = [
  { id: 'forexlive', name: 'ForexLive', category: 'Forex', url: 'https://www.forexlive.com/feed' },
  { id: 'investing-markets', name: 'Investing.com', category: 'Markets', url: 'https://www.investing.com/rss/news_1.rss' },
  { id: 'bloomberg', name: 'Bloomberg Markets', category: 'Markets', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  { id: 'cnbc', name: 'CNBC', category: 'Markets', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { id: 'marketwatch', name: 'MarketWatch', category: 'Markets', url: 'https://www.marketwatch.com/rss/topstories' },
  { id: 'dj-markets', name: 'WSJ Markets', category: 'Markets', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { id: 'seekingalpha', name: 'Seeking Alpha', category: 'Stocks', url: 'https://seekingalpha.com/market_currents.xml' },
  { id: 'cointelegraph', name: 'Cointelegraph', category: 'Crypto', url: 'https://cointelegraph.com/rss' },
  { id: 'theblock', name: 'The Block', category: 'Crypto', url: 'https://www.theblock.co/rss.xml' },
  { id: 'decrypt', name: 'Decrypt', category: 'Crypto', url: 'https://decrypt.co/feed' },
];

async function getNews({ category = 'all', limit = 60, force = false } = {}) {
  const key = 'news:all';
  let payload = force ? null : cacheGet(key);
  if (!payload) {
    const results = await Promise.allSettled(FEEDS.map(async (f) => {
      const xml = await fetchText(f.url, { timeout: 12000 });
      return parseRss(xml, f);
    }));
    const items = [];
    const status = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.length) { items.push(...r.value); status.push({ feed: FEEDS[i].name, count: r.value.length, ok: true }); }
      else status.push({ feed: FEEDS[i].name, count: 0, ok: false });
    });
    if (!items.length) {
      payload = { ok: false, items: [], feeds: status, error: 'No news feeds reachable from this machine.', fetched_at: new Date().toISOString() };
    } else {
      items.sort((a, b) => new Date(b.published) - new Date(a.published));
      const seen = new Set();
      const deduped = items.filter((i) => { const k = i.title.toLowerCase().slice(0, 90); if (seen.has(k)) return false; seen.add(k); return true; });
      payload = { ok: true, items: deduped, feeds: status, fetched_at: new Date().toISOString() };
    }
    cacheSet(key, payload, TTL.news);
  }
  const filtered = category && category !== 'all' ? payload.items.filter((i) => i.category.toLowerCase() === String(category).toLowerCase()) : payload.items;
  return { ...payload, items: filtered.slice(0, limit) };
}

function parseRss(xml, feed) {
  const out = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const raw of blocks) {
    const body = raw.split(/<\/item>/i)[0];
    const title = clean(tag(body, 'title'));
    const link = clean(tag(body, 'link'));
    const pub = clean(tag(body, 'pubDate')) || clean(tag(body, 'dc:date')) || '';
    const desc = stripTags(clean(tag(body, 'description'))).slice(0, 260);
    const cat = clean(tag(body, 'category'));
    if (!title || !link) continue;
    const published = pub ? new Date(pub).toISOString() : new Date().toISOString();
    out.push({ title, link, description: desc, published, source: feed.name, category: feed.category, feed_category: cat });
  }
  if (!out.length) {
    // Atom fallback
    const entries = xml.split(/<entry[\s>]/i).slice(1);
    for (const raw of entries) {
      const body = raw.split(/<\/entry>/i)[0];
      const title = clean(tag(body, 'title'));
      let link = (body.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
      const pub = clean(tag(body, 'updated')) || '';
      if (!title || !link) continue;
      out.push({ title, link, description: stripTags(clean(tag(body, 'summary'))).slice(0, 260), published: pub ? new Date(pub).toISOString() : new Date().toISOString(), source: feed.name, category: feed.category });
    }
  }
  return out;
}
function tag(body, name) {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = body.match(re);
  return m ? m[1] : '';
}
function clean(s) { return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(); }
function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;/g, "'").replace(/\s+/g, ' ').trim(); }

/* -------------------------------------------------------------------- quotes */
/** Map a journal symbol to a Yahoo Finance ticker (proxies noted). */
const YAHOO_MAP = {
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'USDJPY=X', USDCHF: 'USDCHF=X', USDCAD: 'USDCAD=X',
  AUDUSD: 'AUDUSD=X', NZDUSD: 'NZDUSD=X', EURGBP: 'EURGBP=X', EURJPY: 'EURJPY=X', GBPJPY: 'GBPJPY=X', AUDJPY: 'AUDJPY=X', EURAUD: 'EURAUD=X',
  XAUUSD: 'GC=F', XAGUSD: 'SI=F', USOIL: 'CL=F', UKOIL: 'BZ=F', NATGAS: 'NG=F',
  US30: '^DJI', NAS100: '^NDX', SPX500: '^GSPC', GER40: '^GDAXI', UK100: '^FTSE', JP225: '^N225',
  ES: 'ES=F', MES: 'ES=F', NQ: 'NQ=F', MNQ: 'NQ=F', YM: 'YM=F', MYM: 'YM=F', RTY: 'RTY=F', M2K: 'RTY=F',
  CL: 'CL=F', MCL: 'CL=F', GC: 'GC=F', MGC: 'GC=F', '6E': '6E=F', ZN: 'ZN=F',
};
const COINGECKO_IDS = {
  BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', SOLUSDT: 'solana', BNBUSDT: 'binancecoin',
  XRPUSDT: 'ripple', ADAUSDT: 'cardano', DOGEUSDT: 'dogecoin', LINKUSDT: 'chainlink',
  BTCUSD: 'bitcoin', ETHUSD: 'ethereum', SOLUSD: 'solana',
};
const PROXY_NOTE = { XAUUSD: 'COMEX gold futures', XAGUSD: 'COMEX silver futures', USOIL: 'WTI futures', UKOIL: 'Brent futures', NATGAS: 'Henry Hub futures', US30: 'Dow Jones index', NAS100: 'Nasdaq 100 index', SPX500: 'S&P 500 index', GER40: 'DAX index', UK100: 'FTSE 100 index', JP225: 'Nikkei 225 index', ES: 'ES futures', MES: 'ES futures (micro proxy)', NQ: 'NQ futures', MNQ: 'NQ futures (micro proxy)', CL: 'WTI futures', MCL: 'WTI futures (micro proxy)', GC: 'Gold futures', MGC: 'Gold futures (micro proxy)', MYM: 'YM futures (micro proxy)', M2K: 'RTY futures (micro proxy)' };

async function getQuotes(symbols = [], { force = false } = {}) {
  const wanted = [...new Set(symbols.filter(Boolean).map((s) => String(s).toUpperCase()))];
  if (!wanted.length) return { ok: true, quotes: {}, fetched_at: new Date().toISOString() };
  const key = 'quotes:' + wanted.join(',');
  if (!force) { const hit = cacheGet(key); if (hit) return hit; }

  const out = {};
  const cryptoSyms = wanted.filter((s) => COINGECKO_IDS[s]);
  const yahooSyms = wanted.filter((s) => !COINGECKO_IDS[s] && YAHOO_MAP[s]);
  const yahooDirect = wanted.filter((s) => !COINGECKO_IDS[s] && !YAHOO_MAP[s]);
  const errors = [];

  // Crypto via CoinGecko
  if (cryptoSyms.length) {
    try {
      const ids = [...new Set(cryptoSyms.map((s) => COINGECKO_IDS[s]))].join(',');
      const data = await fetchJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`, { timeout: 12000 });
      for (const row of data) {
        for (const sym of cryptoSyms) {
          if (COINGECKO_IDS[sym] === row.id) {
            out[sym] = { price: row.current_price, change_pct: round2(row.price_change_percentage_24h), source: 'CoinGecko', high: row.high_24h, low: row.low_24h, volume: row.total_volume };
          }
        }
      }
    } catch (e) { errors.push('CoinGecko: ' + e.message); }
  }

  // Everything else via Yahoo chart API (two hosts for resilience)
  const tickers = [...yahooSyms.map((s) => YAHOO_MAP[s]), ...yahooDirect];
  const labelFor = (ticker) => { const f = [...yahooSyms].find((s) => YAHOO_MAP[s] === ticker); return f || ticker; };
  await Promise.all(tickers.map(async (ticker) => {
    const url = (host) => `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`;
    for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
      try {
        const j = await fetchJson(url(host), { timeout: 9000 });
        const meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
        if (!meta) throw new Error('no meta');
        const sym = labelFor(ticker);
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose || meta.previousClose;
        const src = PROXY_NOTE[sym] ? `Yahoo · ${PROXY_NOTE[sym]} proxy` : 'Yahoo Finance';
        if (sym === ticker) out[sym] = { price, change_pct: prev ? round2(((price - prev) / prev) * 100) : 0, source: src, currency: meta.currency };
        else {
          out[sym] = {
            price, change_pct: prev ? round2(((price - prev) / prev) * 100) : 0, source: src,
            currency: meta.currency, market_time: meta.regularMarketTime,
          };
        }
        return;
      } catch (e) { errors.push(`${ticker}@${host}: ${e.message}`); }
    }
  }));

  // FX fallback (ECB reference rates) for anything still missing
  const missingFx = wanted.filter((s) => !out[s] && /^[A-Z]{6}$/.test(s));
  if (missingFx.length) {
    try {
      const fx = await fetchJson('https://api.frankfurter.dev/v1/latest?base=USD', { timeout: 10000 });
      const r = fx.rates || {};
      for (const sym of missingFx) {
        const base = sym.slice(0, 3), quote = sym.slice(3, 6);
        const price = deriveFx(base, quote, r);
        if (price) out[sym] = { price: round(price, quote === 'JPY' ? 3 : 5), change_pct: null, source: 'ECB reference rate (daily)', reference: true };
      }
    } catch (e) { errors.push('Frankfurter: ' + e.message); }
  }

  const payload = { ok: Object.keys(out).length > 0, quotes: out, errors: [...new Set(errors)].slice(0, 6), fetched_at: new Date().toISOString() };
  cacheSet(key, payload, TTL.quotes);
  return payload;
}
function deriveFx(base, quote, rates) {
  const usd = { USD: 1, ...rates };
  const b = usd[base], q = usd[quote];
  if (!b || !q) return null;
  return q / b;
}
const round = (v, dp = 5) => Math.round(Number(v) * Math.pow(10, dp)) / Math.pow(10, dp);
const round2 = (v) => (v === null || v === undefined || isNaN(v)) ? null : Math.round(Number(v) * 100) / 100;

/* ------------------------------------------------------------ fear & greed */
async function getFearGreed({ force = false } = {}) {
  const key = 'fng';
  if (!force) { const hit = cacheGet(key); if (hit) return hit; }
  try {
    const j = await fetchJson('https://api.alternative.me/fng/?limit=8', { timeout: 10000 });
    const data = (j.data || []).map((d) => ({ value: Number(d.value), label: d.value_classification, ts: Number(d.timestamp) * 1000 }));
    return cacheSet(key, { ok: true, current: data[0], history: data.reverse(), fetched_at: new Date().toISOString() }, TTL.fng);
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { getCalendar, getNews, getQuotes, getFearGreed, FEEDS, YAHOO_MAP, COINGECKO_IDS };
