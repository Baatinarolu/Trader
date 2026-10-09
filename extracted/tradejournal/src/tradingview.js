'use strict';
/**
 * TradingView integration.
 *
 * Two directions:
 *   1. OUT — map our instruments to TradingView tickers, build chart links, and
 *      generate the exact widget payloads the frontend embeds.
 *   2. IN  — receive TradingView alerts (webhook), normalise whatever the user
 *      configured (JSON or plain text) into a row we can act on: symbol → our
 *      instrument, side, price, timeframe, and then optionally run the bot on it.
 *
 * Nothing here calls out to TradingView servers — the embed widgets load in the
 * user's browser and the alert direction is a plain HTTP POST. That keeps the app
 * free and means it degrades to a link when there is no network.
 */

const PRESETS = require('./instruments').PRESETS;
const KNOWN = new Set(PRESETS.map((p) => p.symbol));

/** Curated exchange-qualified tickers so the widget opens the right feed first time. */
const TV_MAP = {
  // ---- FX ------------------------------------------------------------------
  EURUSD: 'FX:EURUSD', GBPUSD: 'FX:GBPUSD', AUDUSD: 'FX:AUDUSD', NZDUSD: 'FX:NZDUSD',
  USDJPY: 'FX:USDJPY', USDCHF: 'FX:USDCHF', USDCAD: 'FX:USDCAD', EURGBP: 'FX:EURGBP',
  EURJPY: 'FX:EURJPY', GBPJPY: 'FX:GBPJPY', AUDJPY: 'FX:AUDJPY', EURAUD: 'FX:EURAUD',
  EURCHF: 'FX:EURCHF', GBPCHF: 'FX:GBPCHF', CADJPY: 'FX:CADJPY', NZDJPY: 'FX:NZDJPY',
  USDSGD: 'FX:USDSGD', USDMXN: 'FX:USDMXN', USDZAR: 'FX:USDZAR', USDTRY: 'FX:USDTRY',
  // ---- metals & energy -----------------------------------------------------
  XAUUSD: 'OANDA:XAUUSD', XAGUSD: 'OANDA:XAGUSD', XPTUSD: 'OANDA:XPTUSD',
  USOIL: 'TVC:USOIL', UKOIL: 'TVC:UKOIL', NATGAS: 'TVC:NATURALGAS', COPPER: 'COMEX:HG1!',
  // ---- indices -------------------------------------------------------------
  NAS100: 'NASDAQ:NDX', SPX500: 'SP:SPX', US30: 'DJ:DJI', US2000: 'TVC:RUT',
  GER40: 'XETR:DAX', UK100: 'TVC:UKX', JP225: 'TVC:NI225', HK50: 'TVC:HSI',
  FRA40: 'EURONEXT:CAC', AUS200: 'ASX:XJO', EU50: 'TVC:SX5E',
  // ---- futures (continuous front month) ------------------------------------
  ES: 'CME_MINI:ES1!', NQ: 'CME_MINI:NQ1!', YM: 'CBOT_MINI:YM1!', RTY: 'CME_MINI:RTY1!',
  GC: 'COMEX:GC1!', SI: 'COMEX:SI1!', HG: 'COMEX:HG1!', CL: 'NYMEX:CL1!', NG: 'NYMEX:NG1!',
  ZB: 'CBOT:ZB1!', ZN: 'CBOT:ZN1!', ZC: 'CBOT:ZC1!', ZS: 'CBOT:ZS1!', '6E': 'CME:6E1!',
  BTCF: 'CME:BTC1!', ETHF: 'CME:ETH1!',
  // ---- crypto --------------------------------------------------------------
  BTCUSDT: 'BINANCE:BTCUSDT', ETHUSDT: 'BINANCE:ETHUSDT', SOLUSDT: 'BINANCE:SOLUSDT',
  XRPUSDT: 'BINANCE:XRPUSDT', BNBUSDT: 'BINANCE:BNBUSDT', ADAUSDT: 'BINANCE:ADAUSDT',
  DOGEUSDT: 'BINANCE:DOGEUSDT', AVAXUSDT: 'BINANCE:AVAXUSDT', LINKUSDT: 'BINANCE:LINKUSDT',
  MATICUSDT: 'BINANCE:MATICUSDT', DOTUSDT: 'BINANCE:DOTUSDT', LTCUSDT: 'BINANCE:LTCUSDT',
  ATOMUSDT: 'BINANCE:ATOMUSDT', TONUSDT: 'BINANCE:TONUSDT', SUIUSDT: 'BINANCE:SUIUSDT',
  PEPEUSDT: 'BINANCE:PEPEUSDT',
  // ---- stocks & ETFs -------------------------------------------------------
  AAPL: 'NASDAQ:AAPL', MSFT: 'NASDAQ:MSFT', NVDA: 'NASDAQ:NVDA', AMZN: 'NASDAQ:AMZN',
  GOOGL: 'NASDAQ:GOOGL', META: 'NASDAQ:META', TSLA: 'NASDAQ:TSLA', NFLX: 'NASDAQ:NFLX',
  AMD: 'NASDAQ:AMD', AVGO: 'NASDAQ:AVGO', ADBE: 'NASDAQ:ADBE', CRM: 'NYSE:CRM',
  JPM: 'NYSE:JPM', BAC: 'NYSE:BAC', GS: 'NYSE:GS', V: 'NYSE:V', MA: 'NYSE:MA',
  XOM: 'NYSE:XOM', CVX: 'NYSE:CVX', WMT: 'NYSE:WMT', DIS: 'NYSE:DIS', BABA: 'NYSE:BABA',
  SPY: 'AMEX:SPY', QQQ: 'NASDAQ:QQQ', IWM: 'AMEX:IWM', DIA: 'AMEX:DIA', GLD: 'AMEX:GLD',
  SLV: 'AMEX:SLV', USO: 'AMEX:USO', TLT: 'NASDAQ:TLT', VTI: 'AMEX:VTI', XLE: 'AMEX:XLE',
  ARKK: 'AMEX:ARKK', EEM: 'AMEX:EEM', VIXY: 'AMEX:VIXY',
};

/** Things TradingView users write that are not our symbols. */
const ALIASES = {
  GOLD: 'XAUUSD', SILVER: 'XAGUSD', WTI: 'USOIL', BRENT: 'UKOIL', OIL: 'USOIL',
  US100: 'NAS100', USTEC: 'NAS100', NDX: 'NAS100', SPX: 'SPX500', SP500: 'SPX500',
  US500: 'SPX500', SPX500USD: 'SPX500', DOW: 'US30', DJI: 'US30', WS30: 'US30',
  DAX: 'GER40', DE40: 'GER40', DE30: 'GER40', GER30: 'GER40', FTSE: 'UK100', UKX: 'UK100',
  NI225: 'JP225', NIKKEI: 'JP225', HSI: 'HK50', CAC: 'FRA40', SX5E: 'EU50', ASX200: 'AUS200',
  NATURALGAS: 'NATGAS', XAU: 'XAUUSD', XAG: 'XAGUSD',
  BTCUSD: 'BTCUSDT', ETHUSD: 'ETHUSDT', SOLUSD: 'SOLUSDT', XRPUSD: 'XRPUSDT',
  BNBUSD: 'BNBUSDT', ADAUSD: 'ADAUSDT', DOGEUSD: 'DOGEUSDT', AVAXUSD: 'AVAXUSDT',
  LINKUSD: 'LINKUSDT', DOTUSD: 'DOTUSDT', LTCUSD: 'LTCUSDT', MATICUSD: 'MATICUSDT',
  BTCUSDT_PERP: 'BTCUSDT', XBTUSD: 'BTCUSDT',
  MICRO_ES: 'MES', MICROES: 'MES', MES1: 'MES', ESMINI: 'ES', NQMINI: 'NQ',
  APPLE: 'AAPL', TESLA: 'TSLA', NVIDIA: 'NVDA', MICROSOFT: 'MSFT', AMAZON: 'AMZN',
  ALPHABET: 'GOOGL', FACEBOOK: 'META', NETFLIX: 'NFLX',
};

/** Our timeframe strings → TradingView intervals. */
const TF_TO_TV = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '45m': '45', '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1d': 'D', '3d': '3D', '1w': 'W', '1M': 'M' };
/** TradingView intervals → ours. */
const TV_TO_TF = { '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m', '45': '45m', '60': '1h', '120': '2h', '240': '4h', '360': '6h', '480': '8h', '720': '12h', 'D': '1d', '1D': '1d', 'W': '1w', '1W': '1w', 'M': '1M' };

/* ------------------------------------------------------------------ symbols */

function presetOf(symbol) {
  return PRESETS.find((p) => p.symbol === symbol) || null;
}

/** Our symbol → TradingView ticker (exchange-qualified where we know it). */
function tvSymbol(symbol) {
  const s = String(symbol || '').toUpperCase().trim();
  if (!s) return '';
  if (TV_MAP[s]) return TV_MAP[s];
  const p = presetOf(s);
  if (p && p.exchange && p.exchange !== 'OTC') return `${p.exchange}:${s}`;
  return s;
}

/** Strip an exchange prefix / futures suffix so `OANDA:XAUUSD` → `XAUUSD`. */
function bare(tv) {
  let s = String(tv || '').toUpperCase().trim();
  s = s.replace(/^[A-Z0-9_.\-]+:/, '');       // EXCHANGE:
  s = s.replace(/([12])!$/, '');               // ES1! → ES
  s = s.replace(/\.P$|PERP$|\.D$/i, '');       // BTCUSDT.P / BTCUSDT.PERP
  s = s.replace(/[^A-Z0-9]/g, '') === 'XAUUSD' ? 'XAUUSD' : s;
  return s.trim();
}

/**
 * TradingView ticker (or anything a trader typed) → our instrument symbol.
 * Returns { symbol, known } — `known:false` means custom instrument, we still
 * accept it so personal tickers keep working.
 */
function fromTvSymbol(tv) {
  const b = bare(tv);
  if (!b) return { symbol: '', known: false };
  const compact = b.replace(/[^A-Z0-9]/g, '');
  const candidates = [compact, b.replace(/[^A-Z0-9]/g, '_')];
  for (const c of candidates) {
    if (KNOWN.has(c)) return { symbol: c, known: true };
    if (ALIASES[c]) return { symbol: ALIASES[c], known: KNOWN.has(ALIASES[c]) };
  }
  // 6-letter FX / crypto pairs written without a slash are already compact
  if (/^[A-Z]{6}$/.test(compact) && KNOWN.has(compact)) return { symbol: compact, known: true };
  // `EUR/USD` style
  const slashed = b.replace('/', '');
  if (KNOWN.has(slashed)) return { symbol: slashed, known: true };
  if (ALIASES[slashed]) return { symbol: ALIASES[slashed], known: KNOWN.has(ALIASES[slashed]) };
  return { symbol: compact || b, known: false };
}

/* ------------------------------------------------------------------ parsing */

const ACTION_MAP = [
  [/^(buy|long|enter long|buy long|bto|open long|go long|bull)/i, 'buy'],
  [/^(sell|short|enter short|sell short|sto|open short|go short|bear)/i, 'sell'],
  [/^(close|exit|flat|close long|close short|tp|take ?profit|square ?off)/i, 'close'],
  [/^(cancel|ignore|none|wait)/i, 'none'],
];

function normaliseAction(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  for (const [re, out] of ACTION_MAP) if (re.test(s)) return out;
  const low = s.toLowerCase();
  if (low.includes('long') || low.includes('buy')) return 'buy';
  if (low.includes('short') || low.includes('sell')) return 'sell';
  if (low.includes('close') || low.includes('exit')) return 'close';
  return low;
}

function parseTime(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) {                       // unix seconds (TradingView {{timenow}})
    const n = Number(s);
    return new Date((n > 1e12 ? n : n * 1000)).toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Accepts the TradingView webhook body in any shape a user might configure:
 *   - JSON: {symbol, action, price, tf, time, ...}  ({{...}} placeholders already filled)
 *   - JSON wrapper: {message: "..."} / {data: {...}}
 *   - plain text: "BUY XAUUSD @ 4244.85 15m" / "{{strategy.order.action}} {{ticker}} ..."
 */
function parseAlert(input) {
  let body = input;
  let text = '';
  if (typeof body === 'string') {
    text = body.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try { body = JSON.parse(text); } catch { body = null; }
    } else {
      body = null;
    }
  }

  const out = { symbol: '', tv_symbol: '', known: false, action: '', price: null, timeframe: '', time: null, note: '', text: text.slice(0, 1500) };

  if (body && typeof body === 'object') {
    const inner = (body.data && typeof body.data === 'object' ? body.data : null) ||
                  (body.payload && typeof body.payload === 'object' ? body.payload : null) || body;
    const pick = (...keys) => {
      for (const k of keys) {
        if (inner && inner[k] !== undefined && inner[k] !== null && inner[k] !== '') return inner[k];
        if (body[k] !== undefined && body[k] !== null && body[k] !== '') return body[k];
      }
      return null;
    };
    const rawSym = pick('symbol', 'ticker', 'pair', 'instrument', 'sym');
    const rawAct = pick('action', 'side', 'order_action', 'strategy.order.action', 'direction', 'signal', 'order');
    const rawPrice = pick('price', 'close', 'last', 'entry', 'fill_price', 'strategy.order.price');
    const rawTf = pick('tf', 'timeframe', 'interval', 'resolution', 'period');
    const rawTime = pick('time', 'timenow', 'timestamp', 'date');
    const msg = pick('message', 'comment', 'text', 'note');

    if (rawSym) { const r = fromTvSymbol(rawSym); out.symbol = r.symbol; out.known = r.known; out.tv_symbol = String(rawSym).toUpperCase(); }
    out.action = normaliseAction(rawAct);
    const p = Number(String(rawPrice == null ? '' : rawPrice).replace(/[^0-9.\-]/g, ''));
    out.price = isFinite(p) && p !== 0 ? p : null;
    if (rawTf) out.timeframe = TV_TO_TF[String(rawTf).toUpperCase()] || (String(rawTf).match(/^\d+[mhdw]$/) ? String(rawTf) : '');
    out.time = parseTime(rawTime);
    if (msg) out.note = String(msg).slice(0, 500);
    if (!out.symbol && msg) { const t = parseText(String(msg)); Object.assign(out, { ...t, time: out.time || t.time, note: out.note }); }
  }

  if (!out.symbol && text) {
    const t = parseText(text);
    out.symbol = t.symbol; out.tv_symbol = t.tv_symbol; out.known = t.known;
    out.action = out.action || t.action;
    out.price = out.price == null ? t.price : out.price;
    out.timeframe = out.timeframe || t.timeframe;
    out.time = out.time || t.time;
  }

  out.ok = Boolean(out.symbol);
  return out;
}

/** `BUY XAUUSD @ 4244.85 15m` style, plus tolerates commas and extra words. */
function parseText(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const out = { symbol: '', tv_symbol: '', known: false, action: '', price: null, timeframe: '', time: null };
  if (!s) return out;

  // action — look for a keyword anywhere, cheapest first
  const actMatch = s.match(/\b(buy|sell|long|short|close|exit|flat|sto|bto|none|wait)\b/i);
  if (actMatch) out.action = normaliseAction(actMatch[1]);

  // price — "@ 4244.85", "price 4244.85", "$4244.85" or a bare decimal
  const priceMatch = s.match(/(?:@|\bprice\b|\bat\b|\$)\s*([0-9][0-9,]*\.?[0-9]*)/i) || s.match(/\b([0-9]+\.[0-9]{1,6})\b/);
  if (priceMatch) { const p = Number(priceMatch[1].replace(/,/g, '')); if (isFinite(p)) out.price = p; }

  // timeframe — "15m" / "1h" / "4h" / "D"
  const tfMatch = s.match(/\b(\d{1,2}\s?[mhdw])\b/i) || s.match(/\b(1D|1W)\b/);
  if (tfMatch) {
    const raw = tfMatch[1].replace(/\s/, '').toLowerCase();
    out.timeframe = TV_TO_TF[raw.toUpperCase()] || (/^\d{1,2}[mhdw]$/.test(raw) ? raw : '');
  }

  // symbol — try every token, prefer ones we know
  const tokens = s.split(/[\s,;|@=]+/).filter(Boolean);
  let fallback = '';
  for (const tk of tokens) {
    const cleaned = tk.replace(/[^A-Za-z0-9\/._!-]/g, '');
    if (!cleaned || /^\d+[mhdw]?$/i.test(cleaned)) continue;
    if (/^(buy|sell|long|short|close|exit|flat|sto|bto|none|wait|price|at|alert|signal|order|tp|sl)$/i.test(cleaned)) continue;
    const r = fromTvSymbol(cleaned);
    if (!r.symbol) continue;
    if (r.known) { out.symbol = r.symbol; out.known = true; out.tv_symbol = cleaned.toUpperCase(); break; }
    if (!fallback) { fallback = r.symbol; out.tv_symbol = cleaned.toUpperCase(); }
  }
  if (!out.symbol && fallback) { out.symbol = fallback; out.known = false; }
  return out;
}

/* ------------------------------------------------------------------- links */

function link(symbol, tf, opts = {}) {
  const tv = tvSymbol(symbol);
  const interval = TF_TO_TV[String(tf || '15m')] || '15';
  const q = new URLSearchParams({ symbol: tv, interval });
  if (opts.utm) q.set('utm_source', 'tradejournalpro');
  return `https://www.tradingview.com/chart/?${q.toString()}`;
}

/** Chart + watchlist pages that need no widget script (work without JS embeds). */
function links(symbol) {
  const tv = tvSymbol(symbol);
  return {
    chart: link(symbol, '15m'),
    chart_url: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`,
    symbol_page: `https://www.tradingview.com/symbols/${encodeURIComponent(tv.replace(':', '-'))}/`,
    ideas: `https://www.tradingview.com/symbols/${encodeURIComponent(tv.replace(':', '-'))}/ideas/`,
    tv_symbol: tv,
  };
}

/** Widget config payloads — the frontend injects the official embed scripts with these. */
function advancedChart({ symbol, tf, studies = [], theme = 'dark', height = 420, hideTopToolbar = false, withLegend = true }) {
  return {
    autosize: true,
    symbol: tvSymbol(symbol),
    interval: TF_TO_TV[String(tf || '15m')] || '15',
    timezone: 'Etc/UTC',
    theme,
    style: '1',
    locale: 'en',
    backgroundColor: 'rgba(11, 15, 23, 1)',
    gridColor: 'rgba(255, 255, 255, 0.05)',
    hide_side_toolbar: false,
    hide_top_toolbar: Boolean(hideTopToolbar),
    allow_symbol_change: true,
    save_image: true,
    calendar: false,
    withdateranges: true,
    details: false,
    hotlist: false,
    watchlist: [],
    show_popup_button: true,
    popup_width: '1200',
    popup_height: '800',
    studies,
    support_host: 'https://www.tradingview.com',
    height,
    with_legend: Boolean(withLegend),
  };
}

function miniChart({ symbol, theme = 'dark', height = 200 }) {
  return { symbol: tvSymbol(symbol), width: '100%', height, locale: 'en', dateRange: '1M', colorTheme: theme, isTransparent: true, autosize: false };
}

function tickerTape({ symbols, theme = 'dark' }) {
  const list = (symbols && symbols.length ? symbols : ['FX:EURUSD', 'OANDA:XAUUSD', 'BINANCE:BTCUSDT', 'SP:SPX', 'NASDAQ:NDX'])
    .map((s) => (String(s).includes(':') ? String(s) : tvSymbol(s)));
  return { symbols: list.map((s) => ({ proName: s, title: s.split(':').pop() })), showSymbolLogo: true, isTransparent: true, displayMode: 'adaptive', colorTheme: theme, locale: 'en' };
}

module.exports = {
  TV_MAP, ALIASES, TF_TO_TV, TV_TO_TF,
  tvSymbol, fromTvSymbol, parseAlert, parseText, normaliseAction,
  link, links, advancedChart, miniChart, tickerTape,
};
