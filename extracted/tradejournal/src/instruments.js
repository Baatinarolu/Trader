'use strict';
/**
 * Instrument specification library + multi-asset P&L / position-sizing math.
 *
 * The single hardest problem in a multi-asset journal is normalising "1 unit":
 *   1 lot of EURUSD ≠ 1 share of AAPL ≠ 1 contract of ES ≠ 1 BTC.
 * Everything downstream (R-multiples, expectancy, risk %) only works if the
 * journal knows the value of a 1-unit price move for each instrument.
 */

const ASSET_CLASSES = ['forex', 'futures', 'stocks', 'etf', 'crypto', 'cfd_index', 'commodity', 'options'];

const CLASS_LABELS = {
  forex: 'Forex',
  futures: 'Futures',
  stocks: 'Stocks',
  etf: 'ETFs',
  crypto: 'Crypto',
  cfd_index: 'Indices / CFDs',
  commodity: 'Metals & Energy',
  options: 'Options',
};

// ---------------------------------------------------------------------------
// Trading costs, per instrument, measured in BASIS POINTS of the traded price.
//
//   round-trip cost = spread + slippage + 2 x commission (per side)
//
// Basis points are the only unit that survives a multi-asset journal: 1 pip of
// EURUSD, 1 tick of ES, 1 bp of BTC and 1 cent of a $230 stock are all the same
// number once normalised to price.  The cost in R then follows from the trade's
// own stop distance:
//
//   cost_R = (bps / 10000) * entry / |entry - stop|
//
// so a scalper with a 6-pip stop pays a visibly different bill from a swing
// trader risking 1.5 % — which is exactly the point.  Defaults are typical
// retail-ECN round turns for the asset class; per-symbol overrides cover the
// instruments whose spreads are not class-typical (oil, nat gas, silver).
// ---------------------------------------------------------------------------
const COST_BPS = {
  // M27: these forex figures sit BELOW the ones the course itself quotes. Ep 3 gives a spread
  // of "1.5 pips" (= 1.38 bp at EURUSD 1.09) and commission of "$7 per lot... round trip... $14"
  // (= 1.28 bp on $109k notional) — 2.66 bp round turn against the 1.70 bp below, i.e. the
  // model is 1.57x optimistic, with commission the largest gap (3.7x). His numbers are
  // illustrative for one broker rather than a spec, so the default is NOT silently raised;
  // instead the shortfall is recorded here and callers can pass real terms via opts.costs
  // ({ symbol: {...} } or { asset_class: {...} }), which costBps() already merges.
  // READ EVERY BACKTEST AS OPTIMISTIC BY ~1.57x ON COST until real broker terms are supplied.
  forex:     { spread: 0.80, slippage: 0.20, commission: 0.35, swap_per_day: 0.25 },   // 1.7 bp round turn + swap
  commodity: { spread: 0.60, slippage: 0.30, commission: 0.20, swap_per_day: 0.30 },   // 1.3 bp + swap
  cfd_index: { spread: 0.60, slippage: 0.30, commission: 0.00, swap_per_day: 0.35 },   // 0.9 bp + swap
  futures:   { spread: 0.45, slippage: 0.45, commission: 0.20, swap_per_day: 0.00 },   // 1.1 bp; futures roll, they do not swap
  crypto:    { spread: 1.00, slippage: 1.50, commission: 5.00 },   // 12.5 bp (taker fee dominates)
  stocks:    { spread: 1.00, slippage: 1.00, commission: 0.00 },   // 2.0 bp
  etf:       { spread: 0.50, slippage: 0.50, commission: 0.00 },   // 1.0 bp
  options:   { spread: 180.0, slippage: 50.00, commission: 20.00 }, // 250 bp of *premium* — option spreads are wide, and the 50 %-width rule does not apply
};

const COST_BPS_OVERRIDE = {
  XAUUSD: { spread: 0.50, slippage: 0.25, commission: 0 },   // ~$0.21 on a $4 250 quote
  XAGUSD: { spread: 1.50, slippage: 0.50, commission: 0 },   // ~$0.06 on $40
  USOIL:  { spread: 4.50, slippage: 1.50, commission: 0 },   // ~$0.04 on $65
  UKOIL:  { spread: 4.50, slippage: 1.50, commission: 0 },
  NATGAS: { spread: 8.00, slippage: 3.00, commission: 0 },
  JP225:  { spread: 1.20, slippage: 0.30, commission: 0 },
  BTCUSDT: { spread: 1.00, slippage: 1.50, commission: 5.00 },   // Binance taker
  ETHUSDT: { spread: 1.50, slippage: 2.00, commission: 5.00 },
  SOLUSDT: { spread: 2.00, slippage: 2.50, commission: 5.00 },
};

/** Cost model for one instrument: { bps, parts, source }. */
function costBps(instrument, opts = {}) {
  const ins = instrument || {};
  const preset = PRESETS.find((x) => x.symbol === ins.symbol) || {};
  const merged = Object.assign({}, preset, ins);
  const cls = merged.asset_class || 'stocks';
  const base = COST_BPS[cls] || COST_BPS.stocks;
  const over = COST_BPS_OVERRIDE[merged.symbol] || {};
  const ext = (opts.costs && (opts.costs[merged.symbol] || opts.costs[cls])) || {};
  const parts = Object.assign({}, base, over, ext);
  const bps = parts.spread + parts.slippage + 2 * (parts.commission || 0);
  // M27: swap / rollover was not modelled at all, though `swing` and `position` presets hold
  // for days. It is per-day and directional in reality (long and short pay different rates),
  // so it is applied only when the caller says how long the trade is held. Without
  // opts.hold_days the round-turn figure is unchanged, so no existing result moves.
  const holdDays = Number(opts.hold_days || 0);
  const swap = holdDays > 0 ? (Number(parts.swap_per_day) || 0) * holdDays : 0;
  return { bps: bps + swap, bps_round_turn: bps, swap_bps: swap, hold_days: holdDays || null,
    parts, source: ext && Object.keys(ext).length ? 'custom' : (over && Object.keys(over).length ? 'instrument' : cls) };
}

/** Round-trip cost as a fraction of price (0.00012 = 1.2 bp). */
function costFraction(instrument, opts = {}) {
  const c = costBps(instrument, opts);
  const pip = Number((instrument && instrument.pip_size) || (PRESETS.find((x) => x.symbol === (instrument || {}).symbol) || {}).pip_size || 0.0001) || 0.0001;
  const px = Number(opts.price || 0);
  return { fraction: c.bps / 10000, bps: c.bps, pips: px ? (c.bps / 10000 * px) / pip : null, source: c.source, parts: c.parts };
}

/** Cost of one trade plan, in R.  Null when the stop distance is unusable. */
function costR(instrument, entry, stop, opts = {}) {
  const c = costFraction(instrument, opts);
  const risk = Math.abs(Number(entry) - Number(stop));
  if (!isFinite(c.fraction) || !risk) return null;
  return (c.fraction * Number(entry)) / risk;
}

const UNIT_LABELS = {
  forex: 'lots',
  futures: 'contracts',
  stocks: 'shares',
  etf: 'shares',
  crypto: 'coins',
  cfd_index: 'contracts',
  commodity: 'units',
  options: 'contracts',
};

/**
 * valuePerPoint = account-currency value of a 1.0 (one full point) price move
 * per 1 unit of size.  P&L = (exit - entry) * size * valuePerPoint  (signed by direction)
 * pipSize / tickSize drive the "how many pips/ticks did I make" display.
 */
/** Equity/index option root: 100 multiplier, penny tick, contract unit. */
const opt = (symbol, name, exchange) => ({
  symbol, name, asset_class: 'options', exchange, currency: 'USD',
  tick_size: 0.01, pip_size: 0.01, value_per_point: 100, unit: 'contracts',
});

const PRESETS = [
  // ---------------- FX majors & crosses (size = standard lots) ----------------
  fx('EURUSD', 'Euro / US Dollar', 0.0001, 1e5, 'USD'),
  fx('GBPUSD', 'British Pound / US Dollar', 0.0001, 1e5, 'USD'),
  fx('AUDUSD', 'Australian Dollar / US Dollar', 0.0001, 1e5, 'USD'),
  fx('NZDUSD', 'New Zealand Dollar / US Dollar', 0.0001, 1e5, 'USD'),
  fx('USDJPY', 'US Dollar / Japanese Yen', 0.01, 1e5, 'JPY'),
  fx('USDCHF', 'US Dollar / Swiss Franc', 0.0001, 1e5, 'CHF'),
  fx('USDCAD', 'US Dollar / Canadian Dollar', 0.0001, 1e5, 'CAD'),
  fx('EURGBP', 'Euro / British Pound', 0.0001, 1e5, 'GBP'),
  fx('EURJPY', 'Euro / Japanese Yen', 0.01, 1e5, 'JPY'),
  fx('GBPJPY', 'British Pound / Japanese Yen', 0.01, 1e5, 'JPY'),
  fx('AUDJPY', 'Australian Dollar / Japanese Yen', 0.01, 1e5, 'JPY'),
  fx('EURAUD', 'Euro / Australian Dollar', 0.0001, 1e5, 'AUD'),

  // ---------------- Metals & energy (size = lots / contracts) ----------------
  { symbol: 'XAUUSD', name: 'Gold Spot / US Dollar', asset_class: 'commodity', tick_size: 0.01, pip_size: 0.1, value_per_point: 100, unit: 'lots', currency: 'USD', exchange: 'OTC' },
  { symbol: 'XAGUSD', name: 'Silver Spot / US Dollar', asset_class: 'commodity', tick_size: 0.001, pip_size: 0.01, value_per_point: 5000, unit: 'lots', currency: 'USD', exchange: 'OTC' },
  { symbol: 'USOIL', name: 'WTI Crude Oil (CFD)', asset_class: 'commodity', tick_size: 0.01, pip_size: 0.01, value_per_point: 1000, unit: 'lots', currency: 'USD', exchange: 'OTC' },
  { symbol: 'UKOIL', name: 'Brent Crude Oil (CFD)', asset_class: 'commodity', tick_size: 0.01, pip_size: 0.01, value_per_point: 1000, unit: 'lots', currency: 'USD', exchange: 'OTC' },
  { symbol: 'NATGAS', name: 'Natural Gas (CFD)', asset_class: 'commodity', tick_size: 0.001, pip_size: 0.001, value_per_point: 10000, unit: 'lots', currency: 'USD', exchange: 'OTC' },

  // ---------------- Index CFDs ----------------
  cfd('US30', 'Dow Jones 30 (CFD)', 1, 1, 'USD'),
  cfd('NAS100', 'Nasdaq 100 (CFD)', 1, 1, 'USD'),
  cfd('SPX500', 'S&P 500 (CFD)', 1, 1, 'USD'),
  cfd('GER40', 'DAX 40 (CFD)', 1, 1, 'EUR'),
  cfd('UK100', 'FTSE 100 (CFD)', 1, 1, 'GBP'),
  cfd('JP225', 'Nikkei 225 (CFD)', 1, 1, 'JPY'),

  // ---------------- CME / CME-micro futures (size = contracts) ----------------
  fut('ES', 'E-mini S&P 500', 0.25, 50, 'CME'),
  fut('MES', 'Micro E-mini S&P 500', 0.25, 5, 'CME'),
  fut('NQ', 'E-mini Nasdaq 100', 0.25, 20, 'CME'),
  fut('MNQ', 'Micro E-mini Nasdaq 100', 0.25, 2, 'CME'),
  fut('YM', 'E-mini Dow', 1, 5, 'CBOT'),
  fut('MYM', 'Micro E-mini Dow', 1, 0.5, 'CBOT'),
  fut('RTY', 'E-mini Russell 2000', 0.1, 50, 'CME'),

  /* options: the contract specs, so multiplier and tick maths are right.
   * Premiums come from your platform; the app never invents an option price. */
  opt('SPY-OPT', 'SPY options (100 × premium)', 'CBOE'),
  opt('QQQ-OPT', 'QQQ options (100 × premium)', 'CBOE'),
  opt('SPX-OPT', 'SPX index options (100 × premium)', 'CBOE'),
  opt('AAPL-OPT', 'AAPL options (100 × premium)', 'CBOE'),
  opt('TSLA-OPT', 'TSLA options (100 × premium)', 'CBOE'),
  opt('NVDA-OPT', 'NVDA options (100 × premium)', 'CBOE'),
  opt('IWM-OPT', 'IWM options (100 × premium)', 'CBOE'),
  fut('M2K', 'Micro E-mini Russell 2000', 0.1, 5, 'CME'),
  fut('CL', 'Crude Oil (WTI)', 0.01, 1000, 'NYMEX'),
  fut('MCL', 'Micro Crude Oil (WTI)', 0.01, 100, 'NYMEX'),
  fut('GC', 'Gold Futures', 0.1, 100, 'COMEX'),
  fut('MGC', 'Micro Gold Futures', 0.1, 10, 'COMEX'),
  fut('6E', 'Euro FX Futures', 0.00005, 125000, 'CME'),
  fut('ZN', '10-Year T-Note', 0.015625, 1000, 'CBOT'),

  // ---------------- Crypto (size = coins) ----------------
  cg('BTCUSDT', 'Bitcoin / USDT', 0.01, 'BINANCE'),
  cg('ETHUSDT', 'Ethereum / USDT', 0.01, 'BINANCE'),
  cg('SOLUSDT', 'Solana / USDT', 0.01, 'BINANCE'),
  cg('BNBUSDT', 'BNB / USDT', 0.01, 'BINANCE'),
  cg('XRPUSDT', 'XRP / USDT', 0.0001, 'BINANCE'),
  cg('ADAUSDT', 'Cardano / USDT', 0.0001, 'BINANCE'),
  cg('DOGEUSDT', 'Dogecoin / USDT', 0.00001, 'BINANCE'),
  cg('LINKUSDT', 'Chainlink / USDT', 0.001, 'BINANCE'),

  // ---------------- Stocks & ETFs (size = shares) ----------------
  st('AAPL', 'Apple Inc.', 'NASDAQ'),
  st('MSFT', 'Microsoft Corp.', 'NASDAQ'),
  st('NVDA', 'NVIDIA Corp.', 'NASDAQ'),
  st('TSLA', 'Tesla Inc.', 'NASDAQ'),
  st('AMZN', 'Amazon.com Inc.', 'NASDAQ'),
  st('META', 'Meta Platforms', 'NASDAQ'),
  st('GOOGL', 'Alphabet Inc.', 'NASDAQ'),
  st('AMD', 'Advanced Micro Devices', 'NASDAQ'),
  st('NFLX', 'Netflix Inc.', 'NASDAQ'),
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', asset_class: 'etf', tick_size: 0.01, pip_size: 0.01, value_per_point: 1, unit: 'shares', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', asset_class: 'etf', tick_size: 0.01, pip_size: 0.01, value_per_point: 1, unit: 'shares', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', asset_class: 'etf', tick_size: 0.01, pip_size: 0.01, value_per_point: 1, unit: 'shares', currency: 'USD', exchange: 'NYSE' },
];

function fx(symbol, name, pip, contract, quote) {
  // For a USD-quoted pair, 1 standard lot = 100,000 units ⇒ $10 per pip (1.00 per 0.0001).
  return {
    symbol, name, asset_class: 'forex', tick_size: pip / 10, pip_size: pip,
    value_per_point: contract, unit: 'lots', currency: 'USD', quote_currency: quote, exchange: 'OTC',
    pip_value: pip * contract,
  };
}
function cfd(symbol, name, tick, vpp, ccy) {
  return { symbol, name, asset_class: 'cfd_index', tick_size: tick, pip_size: tick, value_per_point: vpp, unit: 'contracts', currency: ccy, exchange: 'OTC' };
}
function fut(symbol, name, tick, vpp, ex) {
  return { symbol, name, asset_class: 'futures', tick_size: tick, pip_size: tick, value_per_point: vpp, unit: 'contracts', currency: 'USD', exchange: ex };
}
function cg(symbol, name, tick, ex) {
  return { symbol, name, asset_class: 'crypto', tick_size: tick, pip_size: tick, value_per_point: 1, unit: 'coins', currency: 'USD', exchange: ex };
}
function st(symbol, name, ex) {
  return { symbol, name, asset_class: 'stocks', tick_size: 0.01, pip_size: 0.01, value_per_point: 1, unit: 'shares', currency: 'USD', exchange: ex };
}

/** Fallback spec for anything the user invents (treated as 1:1 per unit). */
function genericSpec(symbol, assetClass) {
  return {
    symbol, name: symbol, asset_class: assetClass || 'stocks', tick_size: 0.01,
    pip_size: 0.01, value_per_point: 1, unit: UNIT_LABELS[assetClass] || 'units',
    currency: 'USD', exchange: '—',
  };
}

function unitLabel(assetClass) { return UNIT_LABELS[assetClass] || 'units'; }
function classLabel(assetClass) { return CLASS_LABELS[assetClass] || assetClass; }

/** Signed multiplier from direction. */
function dirSign(direction) { return String(direction).toLowerCase() === 'short' ? -1 : 1; }

/**
 * Compute gross / net P&L for a closed trade.
 * @param {object} p { asset_class, value_per_point, direction, size, entry, exit }
 * @param {number} fees
 */
function computePnl(p) {
  const sign = dirSign(p.direction);
  const vpp = num(p.value_per_point, 1) || 1;
  const size = num(p.size, 0);
  const entry = num(p.entry, 0);
  const exit = num(p.exit, 0);
  if (!size || !entry || !exit) return { gross: 0, net: 0 };
  const gross = sign * (exit - entry) * size * vpp;
  const net = gross - num(p.fees, 0);
  return { gross: round2(gross), net: round2(net) };
}

/** Money risked from entry to stop, in account currency. */
function riskAmount(p) {
  const entry = num(p.entry, 0), stop = num(p.stop, 0), size = num(p.size, 0);
  const vpp = num(p.value_per_point, 1) || 1;
  if (!entry || !stop || !size) return null;
  return round2(Math.abs(entry - stop) * size * vpp);
}

/** Price move needed for 1R (per unit). */
function riskPerUnit(entry, stop) {
  const e = num(entry, 0), s = num(stop, 0);
  if (!e || !s) return null;
  return Math.abs(e - s);
}

/**
 * Position size for a given account risk.
 * @param {object} p { balance, riskPct, entry, stop, value_per_point, asset_class, maxSize? }
 * @returns {object} { size, riskAmount, perUnit, unit, steps, note }
 */
function positionSize(p) {
  const balance = num(p.balance, 0);
  const riskPct = num(p.riskPct, 1) / 100;
  const money = round2(balance * riskPct);
  const perUnit = riskPerUnit(p.entry, p.stop);
  const vpp = num(p.value_per_point, 1) || 1;
  if (!perUnit) return { size: 0, riskAmount: 0, perUnit: 0, unit: unitLabel(p.asset_class), note: 'Enter entry and stop price.' };
  const raw = money / (perUnit * vpp);
  let size = raw;
  const unit = unitLabel(p.asset_class);
  if (p.asset_class === 'forex' || p.asset_class === 'commodity' || p.asset_class === 'cfd_index') size = floor(raw, 2);
  else if (p.asset_class === 'crypto') size = floor(raw, 6);
  else size = Math.floor(raw);
  if (p.maxSize && size > p.maxSize) size = p.maxSize;
  const actualRisk = round2(size * perUnit * vpp);
  return {
    size, riskAmount: actualRisk, intendedRisk: money, perUnit, unit,
    steps: raw ? (raw / size) : 0,
    note: size <= 0 ? 'Risk is too small for 1 minimum unit at this stop distance — widen the account risk or tighten the stop.' : null,
  };
}

/** Position size from a "risk per R distance in R" helper for scalpers: risk fixed $ per trade. */
function sizeFromMoneyRisk({ money, entry, stop, value_per_point, asset_class }) {
  return positionSize({ balance: money * 100, riskPct: 1, entry, stop, value_per_point, asset_class });
}

const num = (v, d = 0) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
function floor(v, dp) { const f = Math.pow(10, dp); return Math.floor(v * f) / f; }

/** Pips / ticks / points travelled, for display. */
function pipsMoved({ entry, exit, pip_size, direction }) {
  const e = num(entry), x = num(exit), ps = num(pip_size, 0.0001) || 0.0001;
  if (!e || !x) return 0;
  return round2(((x - e) * dirSign(direction)) / ps);
}

// ---------------------------------------------------------------------------
// M9 — the risk-per-trade guardrail, in ONE place.
//
// Ep 21: "the rule of thumb is to risk like 1 %... the maximum is 1 %. Anywhere
// below 1 % that's great. The lower the better." Ep 31: "in your guardrails, just
// stick to 0.5 %... because when you risk only 0.5 % of your capital on any given
// trade, now you have more room to breathe." The ledger decision is 0.5 % by
// default with 1 % behind a MANUAL UNLOCK.
//
// This lives in instruments.js because it is already the sizing maths module that
// BOTH boundaries import — routes/api.js and bots/setup.js each `require` it — so
// the request boundary and the engine clamp against one definition instead of two
// that can drift. It was previously enforced in exactly one place
// (bots/correction.js:403), which is a review endpoint: the value the finding
// actually named, `risk_per_trade_pct` accepted from a request, reached
// positionSize() unclamped and sized a $10k account at 9.95 % of equity for a
// request that said risk_pct=10.
// ---------------------------------------------------------------------------
const RISK_GUARDRAIL = {
  default_pct: 0.5,    // Ep 31's guardrail setting, and the schema default
  guardrail_pct: 0.5,  // the ceiling until the trader manually unlocks more
  max_pct: 1,          // Ep 21's absolute maximum — never exceeded, unlocked or not
  floor_pct: 0.25,     // correction.js's existing floor; below this the size is untradeable
};

/**
 * Clamp a risk-per-trade percentage against the guardrail.
 * @param {*} v          the requested value (anything a request or a DB row holds)
 * @param {object} opts  { fallback, unlocked, floor, guardrail, max }
 * @returns {number}     a percentage safe to size with
 */
function clampRiskPct(v, opts = {}) {
  const fallback = num(opts.fallback, RISK_GUARDRAIL.default_pct);
  const floor = num(opts.floor, RISK_GUARDRAIL.floor_pct);
  const guardrail = num(opts.guardrail, RISK_GUARDRAIL.guardrail_pct);
  const max = num(opts.max, RISK_GUARDRAIL.max_pct);
  const requested = num(v, fallback);
  // Above the guardrail requires an explicit unlock; 1 % is the ceiling either way.
  const ceiling = Math.min(opts.unlocked ? max : guardrail, max);
  if (!(requested > 0)) return Math.min(Math.max(fallback > 0 ? fallback : guardrail, floor), ceiling);
  return Math.min(Math.max(requested, floor), ceiling);
}

/**
 * Explain a clamp so the UI can say what happened instead of silently returning a
 * different number from the one asked for. §6: a field that describes a decision
 * which no longer exists is the recurring trap — so is a number that does.
 * @returns {string|null} null when the request was honoured as given
 */
function riskGuardrailNote(requested, applied, opts = {}) {
  const req = num(requested, NaN), app = num(applied, NaN);
  if (!isFinite(req) || !isFinite(app) || Math.abs(req - app) < 0.005) return null;
  const max = num(opts.max, RISK_GUARDRAIL.max_pct);
  if (req > max) {
    return `Risk capped at ${app}% — ${max}% is the course's absolute maximum per trade (Ep 21: "the maximum is 1%. Anywhere below 1% that's great. The lower the better").`;
  }
  if (!opts.unlocked) {
    return `Risk held at ${app}%, the guardrail default (Ep 31: "in your guardrails, just stick to 0.5%"). Going above it needs a manual unlock; ${max}% is the ceiling even then.`;
  }
  return `Risk adjusted from ${req}% to ${app}% by the guardrail.`;
}

module.exports = {
  COST_BPS, COST_BPS_OVERRIDE, costBps, costFraction, costR,
  ASSET_CLASSES, CLASS_LABELS, UNIT_LABELS, PRESETS,
  genericSpec, unitLabel, classLabel, dirSign, computePnl, riskAmount, riskPerUnit,
  positionSize, sizeFromMoneyRisk, pipsMoved, num, round2,
  RISK_GUARDRAIL, clampRiskPct, riskGuardrailNote,
};
