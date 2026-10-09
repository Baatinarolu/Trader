'use strict';
/**
 * Portfolio exposure — the risk you cannot see trade by trade.
 *
 * Three things a per-trade risk number misses: how much of the account is
 * riding at once (heat), whether several positions are really the same bet
 * (correlation clusters), and whether the position is on both sides of the
 * same market (offsetting or accidental doubling).
 *
 * Clusters are declared, not estimated: two metals are one bet because they
 * are two metals, not because a correlation coefficient said so last month.
 */

/** Correlation clusters, by instrument class and known co-movement groups. */
const CLUSTERS = [
  { key: 'metals', label: 'Precious metals', symbols: ['XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD', 'GC', 'SI'] },
  { key: 'energy', label: 'Energy', symbols: ['USOIL', 'UKOIL', 'WTI', 'BRENT', 'NATGAS', 'CL', 'NG'] },
  { key: 'us_indices', label: 'US equity indices', symbols: ['ES', 'NQ', 'YM', 'RTY', 'SPX500', 'NAS100', 'US30', 'US2000', 'SPY', 'QQQ', 'DIA', 'IWM'] },
  { key: 'eu_indices', label: 'European indices', symbols: ['GER40', 'UK100', 'FRA40', 'EU50', 'JP225'] },
  { key: 'crypto_majors', label: 'Crypto majors', symbols: ['BTCUSDT', 'BTCUSD', 'BTC', 'ETHUSDT', 'ETHUSD', 'ETH'] },
  { key: 'crypto_alts', label: 'Crypto alts', symbols: ['SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT', 'LTCUSDT'] },
  { key: 'usd_majors', label: 'USD majors (all one dollar bet)', symbols: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCHF', 'USDCAD'] },
  { key: 'us_tech', label: 'US tech single names', symbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD', 'NFLX'] },
];
const BY_SYMBOL = {};
CLUSTERS.forEach((c) => c.symbols.forEach((s) => { BY_SYMBOL[s] = c.key; }));
const LABEL = Object.fromEntries(CLUSTERS.map((c) => [c.key, c.label]));

/** Asset class + quote currency fallback when a symbol is not in a named cluster. */
function classify(symbol, assetClass) {
  const sym = String(symbol || '').toUpperCase();
  if (BY_SYMBOL[sym]) return { key: BY_SYMBOL[sym], label: LABEL[BY_SYMBOL[sym]], why: 'named correlation cluster' };
  const cls = String(assetClass || '').toLowerCase();
  if (cls === 'forex' || /^[A-Z]{6}$/.test(sym)) {
    const quote = sym.slice(-3);
    const key = quote === 'USD' ? 'usd_majors' : `quote_${quote}`;
    return { key, label: quote === 'USD' ? LABEL.usd_majors : `${quote} denominated FX`, why: quote === 'USD' ? 'USD majors' : 'same quote currency' };
  }
  return { key: cls || 'other', label: (cls ? cls.replace(/_/g, ' ') : 'other') + ' (by asset class)', why: 'asset class fallback' };
}

/**
 * @param {object[]} openTrades rows with symbol, asset_class, direction, risk_amount, net_pnl?
 * @param {object} opts { balance, maxHeatPct = 6, maxPerCluster = 2 }
 */
function analyse(openTrades = [], opts = {}) {
  const balance = Number(opts.balance) || 0;
  const maxHeatPct = Number(opts.maxHeatPct) || 6;
  const maxPerCluster = Number(opts.maxPerCluster) || 2;
  const rows = openTrades.filter((t) => String(t.status || 'open') === 'open');
  const heat = rows.reduce((a, t) => a + (Number(t.risk_amount) || 0), 0);
  const groups = {};
  rows.forEach((t) => {
    const c = classify(t.symbol, t.asset_class);
    const g = (groups[c.key] = groups[c.key] || { key: c.key, label: c.label, why: c.why, trades: [], risk: 0, longs: 0, shorts: 0 });
    g.trades.push({ id: t.id, symbol: t.symbol, direction: t.direction, risk_amount: t.risk_amount == null ? null : Number(t.risk_amount) });
    g.risk += Number(t.risk_amount) || 0;
    if (String(t.direction).toLowerCase() === 'long') g.longs++; else g.shorts++;
  });
  const clusters = Object.values(groups).map((g) => ({
    ...g,
    risk: Math.round(g.risk * 100) / 100,
    share_of_heat_pct: heat ? Math.round((g.risk / heat) * 1000) / 10 : null,
    share_of_balance_pct: balance ? Math.round((g.risk / balance) * 1000) / 10 : null,
    hedged: g.longs > 0 && g.shorts > 0,
    breaches: [
      g.trades.length > maxPerCluster ? `${g.trades.length} positions (limit ${maxPerCluster})` : null,
      g.longs > 0 && g.shorts > 0 ? 'both directions in one cluster — is it a hedge or a doubled bet?' : null,
    ].filter(Boolean),
  })).sort((a, b) => b.risk - a.risk);
  const heatPct = balance ? (heat / balance) * 100 : null;
  const warnings = [];
  if (heatPct !== null && heatPct > maxHeatPct) warnings.push(`Open risk is ${heatPct.toFixed(1)} % of the account (your cap: ${maxHeatPct} %).`);
  clusters.filter((c) => c.breaches.length).forEach((c) => warnings.push(`${c.label}: ${c.breaches.join('; ')}.`));
  return {
    open_positions: rows.length, heat: Math.round(heat * 100) / 100,
    heat_pct: heatPct === null ? null : Math.round(heatPct * 10) / 10,
    max_heat_pct: maxHeatPct, clusters, warnings,
    note: balance
      ? 'Heat is the sum of every open position\u2019s risk at its own stop, in account currency. Clusters are declared groups, not fitted correlations — see src/exposure.js.'
      : 'No balance on the account, so heat is shown in currency only. Set a starting balance to see it as a percentage.',
  };
}

module.exports = { CLUSTERS, classify, analyse };
