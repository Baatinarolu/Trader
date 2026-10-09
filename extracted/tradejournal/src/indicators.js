'use strict';
/**
 * Indicator engine — one call turns a candle array into a complete, bias-labelled
 * snapshot. The bots never compute an indicator themselves; everything routed
 * through here so the "why" shown in the UI is always the same number the score used.
 *
 * Design rules:
 *  - every metric returns { value, bias (-1|0|1), note } so the UI can show a table
 *  - group scores (trend / momentum / volatility / volume) are weighted averages
 *  - the composite score is -100..100 (bearish..bullish) plus a regime label
 *  - indicators are computed on CLOSED bars only (the forming candle is excluded
 *    from indicator input but kept for price / sweep detection)
 */

const ti = require('technicalindicators');

/* ---------------------------------------------------------------- helpers */

const last = (a) => (Array.isArray(a) && a.length ? a[a.length - 1] : undefined);
const prev = (a) => (Array.isArray(a) && a.length > 1 ? a[a.length - 2] : undefined);
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

function sma(values, period) {
  if (values.length < period) return null;
  const s = values.slice(-period).reduce((a, b) => a + b, 0);
  return s / period;
}
function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = sma(values.slice(0, period), period);
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}
function rsi(values, period = 14) {
  const out = ti.RSI.calculate({ values, period });
  return fin(last(out)) === null ? null : last(out);
}
function atr(candles, period = 14) {
  const out = ti.ATR.calculate({ high: candles.map((c) => c.h), low: candles.map((c) => c.l), close: candles.map((c) => c.c), period });
  return fin(last(out)) === null ? null : last(out);
}
function slope(values, period = 10) {
  if (values.length < period + 1) return 0;
  const a = values[values.length - 1 - period];
  const b = values[values.length - 1];
  if (!a) return 0;
  return ((b - a) / Math.abs(a)) * 100;
}
function crossUp(a, b) { return a != null && b != null && a > b; }
function pctRank(values, v) {
  if (!values.length) return 50;
  const below = values.filter((x) => x < v).length;
  return Math.round((below / values.length) * 100);
}

/* ---------------------------------------------------------------- patterns */

const PATTERNS = [
  ['bullishengulfingpattern', 'Bullish engulfing', 2], ['bearishengulfingpattern', 'Bearish engulfing', -2],
  ['bullishharami', 'Bullish harami', 1], ['bearishharami', 'Bearish harami', -1],
  ['bullishharamicross', 'Bullish harami cross', 1], ['bearishharamicross', 'Bearish harami cross', -1],
  ['hammerpattern', 'Hammer', 2], ['hammerpatternunconfirmed', 'Hammer (unconfirmed)', 1],
  ['hangingman', 'Hanging man', -2], ['shootingstar', 'Shooting star', -2], ['shootingstarunconfirmed', 'Shooting star (unconfirmed)', -1],
  ['morningstar', 'Morning star', 2], ['eveningstar', 'Evening star', -2],
  ['morningdojistar', 'Morning doji star', 2], ['eveningdojistar', 'Evening doji star', -2],
  ['bullishmarubozu', 'Bullish marubozu', 1], ['bearishmarubozu', 'Bearish marubozu', -1], ['marubozu', 'Marubozu', 0],
  ['threewhitesoldiers', 'Three white soldiers', 3], ['threeblackcrows', 'Three black crows', -3],
  ['piercingline', 'Piercing line', 2], ['darkcloudcover', 'Dark cloud cover', -2],
  ['tweezerbottom', 'Tweezer bottom', 1], ['tweezertop', 'Tweezer top', -1],
  ['bullishspinningtop', 'Bullish spinning top', 1], ['bearishspinningtop', 'Bearish spinning top', -1],
  ['dragonflydoji', 'Dragonfly doji', 1], ['gravestonedoji', 'Gravestone doji', -1],
  ['downsidetasukigap', 'Downside tasuki gap', -2], ['doji', 'Doji', 0],
];

function detectPatterns(candles) {
  const n = candles.length;
  if (n < 5) return [];
  // The library console.warn()s whenever a pattern needs more bars than we have.
  // Detection is fully synchronous, so swapping the logger for this block is safe.
  const warn = console.warn;
  console.warn = () => {};
  const input = {
    open: candles.map((c) => c.o), high: candles.map((c) => c.h),
    low: candles.map((c) => c.l), close: candles.map((c) => c.c),
  };
  const found = [];
  for (const [fn, label, bias] of PATTERNS) {
    if (typeof ti[fn] !== 'function') continue;
    try {
      const slice = (arr) => arr.slice(-3);
      const res = ti[fn]({ open: slice(input.open), high: slice(input.high), low: slice(input.low), close: slice(input.close) });
      if (res === true) found.push({ name: label, bias: Math.sign(bias), strength: Math.abs(bias) });
    } catch (e) { /* pattern not applicable to 3 bars */ }
  }
  console.warn = warn;
  // strongest first, keep it readable
  return found.sort((a, b) => b.strength - a.strength).slice(0, 4);
}

/* ---------------------------------------------------------------- snapshot */

/**
 * Full indicator snapshot.
 * @param {Array} candles oldest -> newest
 * @param {{closedOnly?:boolean}} [opts]
 */
function snapshot(candles, opts = {}) {
  const all = Array.isArray(candles) ? candles : [];
  // indicators on closed bars; if the caller says the last bar is live, drop it
  const live = opts.closedOnly === false ? all : all.slice(0, -1);
  const src = live.length >= 30 ? live : all;
  const h = src.map((c) => c.h), l = src.map((c) => c.l), c = src.map((c) => c.c), o = src.map((c) => c.o), v = src.map((c) => c.v || 0);
  const price = all.length ? all[all.length - 1].c : null;
  const meta = { bars_used: src.length, price, last_bar: all.length ? all[all.length - 1].t : null };
  const out = { ok: false, meta };

  if (src.length < 30 || !price) { out.note = 'Need at least 30 bars to compute indicators.'; return out; }

  const ind = {};
  const metrics = []; // { group, key, label, value, display, bias, weight, note }

  /* ---- trend: EMA stack ---- */
  const e9 = ema(c, 9), e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), s200 = sma(c, 200);
  const stack = e9 != null && e21 != null && e50 != null
    ? (e9 > e21 && e21 > e50 ? 1 : e9 < e21 && e21 < e50 ? -1 : 0) : 0;
  ind.ema = { e9: fin(e9), e21: fin(e21), e50: fin(e50), e200: fin(e200), sma200: fin(s200) };
  metrics.push({
    group: 'trend', key: 'ema_stack', label: 'EMA stack (9/21/50)', value: stack, display: stack === 1 ? 'Bullish stack' : stack === -1 ? 'Bearish stack' : 'Tangled',
    bias: stack, weight: 1.4,
    note: stack === 0 ? 'Moving averages are crossed — no trend edge, range tactics apply.' : null,
  });
  if (s200 != null) {
    const above = price > s200;
    metrics.push({ group: 'trend', key: 'sma200', label: 'Price vs SMA200', value: above ? 1 : -1, display: above ? 'Above' : 'Below', bias: above ? 1 : -1, weight: 1.2,
      note: 'Institutional trend filter (higher-timeframe bias).' });
  }
  // price vs EMA200 in ATR units (stretched = mean-reversion risk)
  if (e200 != null) {
    const a = atr(src, 14);
    const dist = a ? (price - e200) / a : null;
    ind.ema_dist_atr = fin(dist === null ? null : r2(dist));
    if (dist != null) metrics.push({
      group: 'trend', key: 'ema200_dist', label: 'Distance from EMA200', value: ind.ema_dist_atr, display: `${ind.ema_dist_atr} ATR`, bias: 0, weight: 0,
      note: Math.abs(dist) > 3 ? 'Price is stretched >3 ATR from EMA200 — chase risk is high.' : null,
    });
  }

  /* ---- trend: ADX / DI ---- */
  let adx = null;
  try { adx = last(ti.ADX.calculate({ high: h, low: l, close: c, period: 14 })); } catch (e) { adx = null; }
  if (adx) {
    ind.adx = { value: r2(adx.adx), pdi: r2(adx.pdi), mdi: r2(adx.mdi) };
    const diBias = adx.pdi > adx.mdi ? 1 : -1;
    const strength = adx.adx >= 25 ? 'strong' : adx.adx >= 18 ? 'developing' : 'weak';
    metrics.push({ group: 'trend', key: 'adx', label: 'ADX / DI', value: ind.adx, display: `${ind.adx.value} (${strength} ${adx.pdi > adx.mdi ? 'bull' : 'bear'})`,
      bias: adx.adx >= 20 ? diBias : 0, weight: 1.1,
      note: adx.adx < 18 ? 'ADX below 18 — the market is ranging; trend entries have low odds.' : null });
  }

  /* ---- trend: PSAR ---- */
  let psar = null;
  try { psar = fin(last(ti.PSAR.calculate({ high: h, low: l, step: 0.02, max: 0.2 }))); } catch (e) { psar = null; }
  if (psar != null) {
    ind.psar = r4(psar);
    const b = price > psar ? 1 : -1;
    metrics.push({ group: 'trend', key: 'psar', label: 'Parabolic SAR', value: ind.psar, display: b === 1 ? 'Bullish (dots below)' : 'Bearish (dots above)', bias: b, weight: 0.6 });
  }

  /* ---- trend: Ichimoku ---- */
  let ichi = null;
  try { ichi = last(ti.IchimokuCloud.calculate({ high: h, low: l, conversionPeriod: 9, basePeriod: 26, spanPeriod: 52, displacement: 26 })); } catch (e) { ichi = null; }
  if (ichi) {
    const cloudTop = Math.max(ichi.spanA, ichi.spanB), cloudBot = Math.min(ichi.spanA, ichi.spanB);
    ind.ichimoku = { conversion: r4(ichi.conversion), base: r4(ichi.base), spanA: r4(ichi.spanA), spanB: r4(ichi.spanB), cloud: [r4(cloudBot), r4(cloudTop)] };
    const pos = price > cloudTop ? 1 : price < cloudBot ? -1 : 0;
    metrics.push({ group: 'trend', key: 'ichimoku', label: 'Ichimoku cloud', value: pos, display: pos === 1 ? 'Above cloud' : pos === -1 ? 'Below cloud' : 'Inside cloud',
      bias: pos, weight: 1.0, note: pos === 0 ? 'Price inside the Kumo — no directional edge.' : null });
    const tk = ichi.conversion > ichi.base ? 1 : -1;
    metrics.push({ group: 'trend', key: 'tk_cross', label: 'Tenkan/Kijun', value: tk, display: tk === 1 ? 'Tenkan above Kijun' : 'Tenkan below Kijun', bias: tk, weight: 0.6 });
  }

  /* ---- momentum: RSI ---- */
  const r = rsi(c, 14);
  if (r != null) {
    ind.rsi14 = r2(r);
    const b = r >= 55 ? 1 : r <= 45 ? -1 : 0;
    metrics.push({ group: 'momentum', key: 'rsi', label: 'RSI(14)', value: ind.rsi14, display: r2(r).toString(), bias: b, weight: 1.0,
      note: r >= 70 ? 'RSI overbought — chasing longs here is how tops get bought (wait for a pullback into a zone).'
        : r <= 30 ? 'RSI oversold — shorts here are late; look for a sweep + reversal instead.' : null });
  }

  /* ---- momentum: MACD ---- */
  let macd = null;
  try { macd = last(ti.MACD.calculate({ values: c, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false })); } catch (e) { macd = null; }
  if (macd) {
    const hist = macd.histogram || 0;
    const prevHist = last(ti.MACD.calculate({ values: c.slice(0, -1), fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false })) || {};
    const rising = hist > (prevHist.histogram || 0);
    ind.macd = { macd: r4(macd.MACD), signal: r4(macd.signal), hist: r4(hist), rising };
    const b = hist > 0 ? 1 : hist < 0 ? -1 : 0;
    metrics.push({ group: 'momentum', key: 'macd', label: 'MACD (12,26,9)', value: b, display: `${r4(hist)} ${rising ? '↑' : '↓'}`,
      bias: b, weight: 1.2, note: b !== 0 && !rising ? 'Momentum is fading against the signal — tightening the trade.' : null });
  }

  /* ---- momentum: oscillators ---- */
  let stoch = null, srsi = null, wr = null, cci = null;
  try { stoch = last(ti.Stochastic.calculate({ high: h, low: l, close: c, period: 14, signalPeriod: 3 })); } catch (e) { stoch = null; }
  try { srsi = last(ti.StochasticRSI.calculate({ values: c, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 })); } catch (e) { srsi = null; }
  try { wr = fin(last(ti.WilliamsR.calculate({ high: h, low: l, close: c, period: 14 }))); } catch (e) { wr = null; }
  try { cci = fin(last(ti.CCI.calculate({ high: h, low: l, close: c, period: 20 }))); } catch (e) { cci = null; }
  if (stoch) {
    ind.stoch = { k: r2(stoch.k), d: r2(stoch.d) };
    metrics.push({ group: 'momentum', key: 'stoch', label: 'Stochastic (14,3,3)', value: ind.stoch, display: `K ${ind.stoch.k} / D ${ind.stoch.d}`,
      bias: stoch.k > stoch.d ? (stoch.k < 80 ? 1 : 0) : (stoch.k > 20 ? -1 : 0), weight: 0.7 });
  }
  if (srsi) { ind.stochrsi = { k: r2(srsi.k), d: r2(srsi.d) }; }
  if (wr != null) { ind.williams_r = r2(wr); }
  if (cci != null) { ind.cci20 = r2(cci); metrics.push({ group: 'momentum', key: 'cci', label: 'CCI(20)', value: ind.cci20, display: `${ind.cci20}`, bias: cci > 100 ? 1 : cci < -100 ? -1 : 0, weight: 0.5 }); }

  /* ---- momentum: rate of change ---- */
  const roc20 = c.length > 21 ? ((price - c[c.length - 21]) / c[c.length - 21]) * 100 : null;
  if (roc20 != null) {
    ind.roc20 = r2(roc20);
    metrics.push({ group: 'momentum', key: 'roc', label: '20-bar change', value: ind.roc20, display: `${r2(roc20)}%`, bias: roc20 > 0.15 ? 1 : roc20 < -0.15 ? -1 : 0, weight: 0.6 });
  }

  /* ---- volatility ---- */
  const a14 = atr(src, 14);
  if (a14 != null) {
    const atrPct = (a14 / price) * 100;
    ind.atr14 = r4(a14);
    ind.atr_pct = r2(atrPct);
    const hist = [];
    const from = Math.max(15, src.length - 120);
    const st = Math.max(1, Math.floor((src.length - from) / 40));
    for (let i = from; i <= src.length; i += st) hist.push((atr(src.slice(0, i), 14) || 0) / src[i - 1].c * 100);
    const rank = pctRank(hist.filter((x) => x > 0), atrPct);
    ind.atr_rank = rank;
    metrics.push({ group: 'volatility', key: 'atr', label: 'ATR(14)', value: r4(a14), display: `${r4(a14)} (${ind.atr_pct}% of price)`, bias: 0, weight: 0,
      note: rank > 85 ? `Volatility is in the top ${100 - rank}% of the last 120 bars — widen stops or cut size (${rank}th percentile).`
        : rank < 15 ? 'Volatility is compressed — breakout/expansion setups are likely to trigger soon.' : null });
  }
  let bb = null, kel = null;
  try { bb = last(ti.BollingerBands.calculate({ values: c, period: 20, stdDev: 2 })); } catch (e) { bb = null; }
  try { kel = last(ti.KeltnerChannels.calculate({ high: h, low: l, close: c, maPeriod: 20, useSMA: true, multiplier: 2, atrPeriod: 10 })); } catch (e) { kel = null; }
  if (bb) {
    const width = ((bb.upper - bb.lower) / bb.middle) * 100;
    const widths = [];
    const start = Math.max(20, c.length - 150);
    const step = Math.max(1, Math.floor((c.length - start) / 40));
    for (let i = start; i <= c.length; i += step) {
      const w = last(ti.BollingerBands.calculate({ values: c.slice(0, i), period: 20, stdDev: 2 }));
      if (w) widths.push(((w.upper - w.lower) / w.middle) * 100);
    }
    const wRank = pctRank(widths, width);
    ind.bollinger = { upper: r4(bb.upper), middle: r4(bb.middle), lower: r4(bb.lower), width: r2(width), pb: r2(bb.pb), squeeze: wRank < 20 };
    if (kel) ind.bollinger.tm_squeeze = !!(kel.upper < bb.upper && kel.lower > bb.lower); // TTM squeeze: BB inside KC
    ind.bandwidth_rank = wRank;
    metrics.push({ group: 'volatility', key: 'bb', label: 'Bollinger (20,2)', value: ind.bollinger.width, display: `${ind.bollinger.width}% · %B ${ind.bollinger.pb}`,
      bias: 0, weight: 0, note: ind.bollinger.squeeze ? 'Bollinger squeeze (bottom 20% of width) — expect an expansion move.' : null });
  }
  if (kel) ind.keltner = { upper: r4(kel.upper), middle: r4(kel.middle), lower: r4(kel.lower) };

  /* ---- volume ---- */
  const hasVolume = v.some((x) => x > 0);
  ind.volume_available = hasVolume;
  const vol20 = hasVolume ? sma(v, 20) : 0, volNow = v.length ? v[v.length - 1] : 0;
  if (vol20) {
    const rel = volNow / vol20;
    ind.volume_ratio = r2(rel);
    ind.volume_ma20 = Math.round(vol20);
    metrics.push({ group: 'volume', key: 'volume', label: 'Volume vs 20-avg', value: ind.volume_ratio, display: `${r2(rel)}×`,
      bias: 0, weight: 0, note: rel > 1.8 ? 'Volume spike — expansion bar; displacement is real.' : rel < 0.6 ? 'Thin volume — moves are easily faded.' : null });
  }
  let obv = null, mfi = null;
  if (hasVolume) { try { obv = ti.OBV.calculate({ close: c, volume: v }); } catch (e) { obv = null; } }
  if (obv && obv.length > 12) {
    const s = slope(obv, 10);
    ind.obv_slope = r2(s);
    metrics.push({ group: 'volume', key: 'obv', label: 'OBV slope (10 bar)', value: ind.obv_slope, display: `${ind.obv_slope}%`, bias: s > 0.5 ? 1 : s < -0.5 ? -1 : 0, weight: 0.5 });
  }
  if (hasVolume) { try { mfi = fin(last(ti.MFI.calculate({ high: h, low: l, close: c, volume: v, period: 14 }))); } catch (e) { mfi = null; } }
  if (mfi != null) { ind.mfi14 = r2(mfi); metrics.push({ group: 'volume', key: 'mfi', label: 'Money Flow Index', value: ind.mfi14, display: `${ind.mfi14}`, bias: mfi > 60 ? 1 : mfi < 40 ? -1 : 0, weight: 0.4 }); }

  /* ---- anchored VWAP (rolling ~1 day of bars) ---- */
  const vwapBars = Math.min(src.length, 96);
  const seg = src.slice(-vwapBars);
  const pv = seg.reduce((sum, b) => sum + ((b.h + b.l + b.c) / 3) * (b.v || 0), 0);
  const vv = seg.reduce((sum, b) => sum + (b.v || 0), 0);
  if (vv > 0 && hasVolume) {
    const avwap = pv / vv;
    ind.vwap = r4(avwap);
    const b = price > avwap ? 1 : -1;
    metrics.push({ group: 'volume', key: 'vwap', label: `VWAP (${vwapBars} bars)`, value: ind.vwap, display: `${r4(avwap)} · price ${b === 1 ? 'above' : 'below'}`, bias: b, weight: 0.7,
      note: 'Anchored VWAP = where the volume-weighted crowd is positioned; reclaiming it is a bullish tell.' });
  }

  /* ---- chandelier exit (ATR trailing stop reference) ---- */
  let chand = null;
  try { chand = last(ti.ChandelierExit.calculate({ high: h, low: l, close: c, period: 22, multiplier: 3 })); } catch (e) { chand = null; }
  if (chand) ind.chandelier = { long: r4(chand.exitLong), short: r4(chand.exitShort) };

  /* ---- candlestick patterns ---- */
  const patterns = detectPatterns(all);
  ind.patterns = patterns;
  if (patterns.length) {
    const strongest = patterns[0];
    metrics.push({ group: 'momentum', key: 'pattern', label: 'Candle pattern', value: strongest.name, display: patterns.map((p) => p.name).join(', '),
      bias: strongest.bias, weight: 0.5 * strongest.strength });
  }

  /* ---- group + composite scores ---- */
  const groups = {};
  for (const g of ['trend', 'momentum', 'volatility', 'volume']) {
    const ms = metrics.filter((m) => m.group === g && m.weight > 0);
    const wsum = ms.reduce((s, m) => s + m.weight, 0);
    const score = wsum ? ms.reduce((s, m) => s + m.bias * m.weight, 0) / wsum : 0;
    groups[g] = { score: r2(score * 100), votes: ms.map((m) => ({ key: m.key, bias: m.bias, weight: m.weight })) };
  }
  const weights = { trend: 1.3, momentum: 1.1, volatility: 0.3, volume: 0.8 };
  const tw = Object.entries(weights).reduce((s, [g, w]) => s + w, 0);
  const composite = Object.entries(weights).reduce((s, [g, w]) => s + groups[g].score * w, 0) / tw;

  const label = composite >= 40 ? 'Strong bullish' : composite >= 15 ? 'Bullish' : composite <= -40 ? 'Strong bearish' : composite <= -15 ? 'Bearish' : 'Neutral / ranging';
  const regime = (() => {
    const trending = ind.adx ? ind.adx.value >= 20 : false;
    const dir = composite > 0 ? 'up' : 'down';
    if (trending) return `Trending ${dir} (ADX ${ind.adx.value})`;
    return 'Ranging / mean-reverting';
  })();

  const notes = metrics.filter((m) => m.note).map((m) => ({ key: m.key, group: m.group, text: m.note }));

  out.ok = true;
  out.ind = ind;
  out.metrics = metrics.map((m) => ({ group: m.group, key: m.key, label: m.label, value: m.value, display: m.display, bias: m.bias, weight: m.weight }));
  out.groups = groups;
  out.score = r2(composite);
  out.label = label;
  out.regime = regime;
  out.notes = notes;
  out.atr = ind.atr14 || null;
  return out;
}

/** Quick directional bias only (for multi-timeframe alignment). */
function biasOf(candles, opts) {
  const s = snapshot(candles, opts);
  if (!s.ok) return { score: 0, bias: 0, label: 'n/a', ok: false };
  return { score: s.score, bias: s.score > 12 ? 1 : s.score < -12 ? -1 : 0, label: s.label, ok: true };
}

module.exports = { snapshot, biasOf, detectPatterns, sma, ema, rsi, atr, slope, pctRank, helpers: { last, prev, r2, r4 } };
