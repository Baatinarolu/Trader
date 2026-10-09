'use strict';
/**
 * Options maths — no data feed, no dependencies.
 *
 * Everything here is deterministic pricing you can check by hand:
 * Black-Scholes price + greeks (with an optional dividend-free, risk-free rate),
 * contract-level sizing (premium × multiplier), and the two numbers an options
 * trader actually manages: max loss (premium paid) and breakeven at expiry.
 *
 * What it is NOT: an implied-volatility feed. You supply IV; the app does the
 * arithmetic and stores the result with the trade. If you leave IV out, the
 * calculator says so instead of inventing a number.
 */

const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 — max error 7.5e-8). */
function ncdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
const npdf = (x) => 0.3989422804014327 * Math.exp(-x * x / 2);

/**
 * Black-Scholes price and greeks.
 * @param {object} o { spot, strike, iv (as decimal, 0.35 = 35 %), dte (days), rate = 0.04, type: 'call'|'put' }
 */
function greeks(o = {}) {
  const spot = Number(o.spot), strike = Number(o.strike), iv = Number(o.iv);
  const dte = Number(o.dte), rate = o.rate === undefined ? 0.04 : Number(o.rate);
  const type = String(o.type || 'call').toLowerCase() === 'put' ? 'put' : 'call';
  if (![spot, strike, iv, dte].every((x) => Number.isFinite(x)) || spot <= 0 || strike <= 0 || iv <= 0 || dte <= 0) {
    return { ok: false, error: 'spot, strike, iv (> 0) and dte (> 0) are required' };
  }
  const T = dte / 365;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (rate + (iv * iv) / 2) * T) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const disc = Math.exp(-rate * T);
  const price = type === 'call'
    ? spot * ncdf(d1) - strike * disc * ncdf(d2)
    : strike * disc * ncdf(-d2) - spot * ncdf(-d1);
  const delta = type === 'call' ? ncdf(d1) : ncdf(d1) - 1;
  const gamma = npdf(d1) / (spot * iv * sqrtT);
  const vega = (spot * npdf(d1) * sqrtT) / 100;                 // per 1 vol point
  const theta = (type === 'call'
    ? (-(spot * npdf(d1) * iv) / (2 * sqrtT) - rate * strike * disc * ncdf(d2))
    : (-(spot * npdf(d1) * iv) / (2 * sqrtT) + rate * strike * disc * ncdf(-d2))) / 365; // per day
  const rho = (type === 'call' ? strike * T * disc * ncdf(d2) : -strike * T * disc * ncdf(-d2)) / 100;
  const intrinsic = type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  return {
    ok: true, type, spot, strike, iv, dte, rate,
    price: r4(price), intrinsic: r4(intrinsic), extrinsic: r4(Math.max(0, price - intrinsic)),
    delta: r4(delta), gamma: r4(gamma), theta: r4(theta), vega: r4(vega), rho: r4(rho),
    breakeven_at_expiry: r4(type === 'call' ? strike + price : strike - price),
    moneyness: strike === spot ? 'atm' : (type === 'call' ? (strike < spot ? 'itm' : 'otm') : (strike > spot ? 'itm' : 'otm')),
    note: 'Solved locally from your inputs — no options data feed is used, so IV is yours to supply.',
  };
}

/**
 * Contract-level plan: what the position costs, what it can lose, and where it
 * has to be by expiry to pay.
 */
function plan(o = {}) {
  const g = greeks(o);
  if (!g.ok) return g;
  const contracts = Math.max(1, Math.round(Number(o.contracts) || 1));
  const multiplier = Number(o.multiplier) || 100;
  const entryPremium = o.entry_premium === undefined ? g.price : Number(o.entry_premium);
  const cost = entryPremium * multiplier * contracts;
  const targetPremium = o.target_premium === undefined ? null : Number(o.target_premium);
  const stopPremium = o.stop_premium === undefined ? null : Number(o.stop_premium);
  const riskPerContract = stopPremium === null ? cost / contracts : (entryPremium - stopPremium) * multiplier;
  const targetPerContract = targetPremium === null ? null : (targetPremium - entryPremium) * multiplier;
  return {
    ok: true, contracts, multiplier,
    entry_premium: r4(entryPremium), cost: r2(cost),
    max_loss: r2(cost),                                  // long premium: the debit is the risk
    stop_premium: stopPremium === null ? null : r4(stopPremium),
    risk_per_contract: r2(riskPerContract),
    risk_total: stopPremium === null ? r2(cost) : r2(riskPerContract * contracts),
    target_premium: targetPremium === null ? null : r4(targetPremium),
    reward_total: targetPerContract === null ? null : r2(targetPerContract * contracts),
    rr: targetPerContract !== null && targetPerContract > 0 && riskPerContract > 0 ? r4(targetPerContract / riskPerContract) : null,
    warning: targetPerContract !== null && targetPerContract <= 0
      ? 'The target premium is not above the entry premium — for a long option that is a loss, not a target.'
      : null,
    breakeven_at_expiry: r4(g.breakeven_at_expiry),
    greeks: g,
    note: stopPremium === null
      ? 'With no stop premium the whole debit is the risk — that is the honest default for long options.'
      : 'R is measured premium-to-premium (your stop premium vs entry premium), which is the only stop an option really has.',
  };
}

/** Position size from an account-level risk budget: how many contracts can you buy? */
function size(o = {}) {
  const contracts = Math.max(0, Math.floor(Number(o.contracts_available) || 0));
  const premium = Number(o.premium);
  const multiplier = Number(o.multiplier) || 100;
  const budget = Number(o.risk_budget);                 // in account currency
  if (!Number.isFinite(premium) || premium <= 0 || !Number.isFinite(budget) || budget <= 0) {
    return { ok: false, error: 'premium (> 0) and risk_budget (> 0) are required' };
  }
  const perContract = premium * multiplier;
  const byBudget = Math.floor(budget / perContract);
  return {
    ok: true, premium: r4(premium), multiplier, cost_per_contract: r2(perContract),
    contracts_by_budget: byBudget, contracts_available: contracts || null,
    contracts_allowed: contracts ? Math.min(byBudget, contracts) : byBudget,
    cash_required: r2(perContract * (contracts ? Math.min(byBudget, contracts) : byBudget)),
  };
}

module.exports = { ncdf, npdf, greeks, plan, size };
