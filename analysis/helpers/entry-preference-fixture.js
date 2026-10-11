'use strict';
/** Explicit M78 composition inputs: internal labels/window provenance are
 * DECLARED seams, not naturally discovered trends. Real OHLC census is separate.
 * M75's physical protected boundary and M68's causal entry composer still run.
 */
const F = require('./named-protected-stop-fixture');
function stamp(series, observedAt) {
  const step = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000 }[series.tf];
  // These fixtures declare a CLOSED structural label despite a later appended
  // forming display candle; only the declared observation window is stamped.
  const b = series.candles.filter(x => x.t + step <= observedAt);
  series.smc.structure_source = { version: 'm78', tf: series.tf, observed_at: observedAt,
    bars: b.length, first_t: b[0]?.t ?? null, last_t: b.at(-1)?.t ?? null,
    closed_only: b.length >= 30 && b.every((x, i) => x.t + step <= observedAt && (!i || x.t > b[i - 1].t)) };
  return series;
}
function named(P, dir = -1, model = 'market_shift', aligned = true) {
  const f = F.named(P, dir, model);
  const s = f.input.triggerSeries;
  s.smc.structure.trend = aligned === null ? undefined
    : (aligned ? dir : -dir) > 0 ? 'bullish' : 'bearish';
  for (const frame of [f.input.series, f.input.biasSeries, s]) stamp(frame, f.END);
  f.input.opts = { observedAt: f.END, minRR: 2, useBreakers: model === 'flip' };
  return f;
}
module.exports = { named, stamp, asOrdinaryCRT: F.asOrdinaryCRT };
