'use strict';
/**
 * M54 — Ep 15, 20:39–22:57: ONE next magnet, not a list of hoped-for exits.
 * Liquidity/weak structure, an unmitigated opposing OB, and the remaining part
 * of an unfilled opposing FVG are different target kinds. They are NOT entries.
 * This module never alters the entry, stop, direction, or risk policy.
 *
 * Proximity is physical price distance, BEFORE an RR gate. A nearer <2R magnet
 * refuses the idea; a farther pool must not be used to rescue its RR. A weak
 * extreme remains a structural candidate/label, not permission to skip a wall.
 * Detector lifecycle is window-bounded (M30); no whole-history claim is made.
 */
const number = (v) => v === null || v === undefined || v === '' || typeof v === 'boolean'
  ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const r4 = (v) => Math.round(v * 10000) / 10000;
const r2 = (v) => Math.round(v * 100) / 100;

// Only break an EXACT-price tie. Never place weak structure ahead of a nearer zone.
const TIE = { weak_structure: 0, opposing_order_block: 1, unfilled_fvg: 2, range: 4 };
function byProximity(dir) {
  return (a, b) => dir * (a.price - b.price)
    || (TIE[a.kind] ?? 3) - (TIE[b.kind] ?? 3);
}

function ordered(rows, dir) {
  const out = [], seen = new Map();
  for (const row of rows.slice().sort(byProximity(dir))) {
    // Keep honest source TFs distinct even when the prices coincide.
    const key = `${row.source_tf || '?'}:${row.price.toFixed(4)}`;
    const kept = seen.get(key);
    if (kept) {
      kept.also_targets = (kept.also_targets || []).concat({ ...row });
      continue;
    }
    const copy = { ...row };
    seen.set(key, copy);
    out.push(copy);
  }
  return out;
}

function catalogue(analysis, dir, entry, weak = null) {
  if (!analysis || ![1, -1].includes(dir) || number(entry) === null) return [];
  const sourceTf = typeof analysis.tf === 'string' ? analysis.tf : null;
  const rows = [];
  const push = (row) => {
    const raw = number(row.price);
    if (raw === null || raw <= 0) return;
    const price = r4(raw);
    if (!(dir * (price - entry) > 0)) return;
    rows.push({ ...row, price, source_tf: sourceTf });
  };

  if (weak) push({ price: weak.price, strength: 0.9, kind: 'weak_structure',
    label: `Weak ${weak.label} — the level structure is expected to take out`, touches: null,
    origin_t: number(weak.t), status: 'structural_extreme' });
  for (const p of (analysis.liquidity && analysis.liquidity.pools) || []) {
    if (!p || p.swept === true || !(number(p.strength) >= 0.5)) continue;
    push({ ...p, origin_t: number(p.t), status: p.swept === false ? 'unswept' : 'unknown',
      // A day's timebox is NOT the TF of a structural detector. PDH may be
      // measured from real 5m candles; do not relabel that catalogue as 1d/1m.
      ...(/^PD[HL]$/.test(p.kind) ? { period_tf: '1d' }
        : /^PW[HL]$/.test(p.kind) ? { period_tf: '1w' } : {}) });
  }
  for (const z of analysis.order_blocks || []) {
    if (!z || z.dir !== -dir || z.breached !== false || z.mitigated !== false) continue;
    const bottom = number(z.bottom), top = number(z.top);
    if (!(bottom > 0 && top > bottom)) continue;
    push({ price: dir > 0 ? bottom : top, kind: 'opposing_order_block',
      label: `Next opposing ${dir > 0 ? 'supply' : 'demand'} order block`,
      strength: number(z.strength), origin_t: number(z.t),
      formed_t: number(z.displacement_t), status: 'unmitigated', zone: [bottom, top] });
  }
  for (const g of analysis.fvgs || []) {
    if (!g || g.dir !== -dir || g.filled !== false) continue;
    const bottom = number(g.bottom), top = number(g.top), pct = number(g.fill_pct);
    if (!(bottom > 0 && top > bottom) || pct === null || pct < 0 || pct >= 100) continue;
    // Fill tracking enters a bearish gap from below / bullish gap from above.
    // Aim at the first STILL UNFILLED edge, not an already-consumed original edge.
    const remainingBottom = g.dir < 0 ? bottom + (top - bottom) * pct / 100 : bottom;
    const remainingTop = g.dir > 0 ? top - (top - bottom) * pct / 100 : top;
    push({ price: dir > 0 ? remainingBottom : remainingTop, kind: 'unfilled_fvg',
      label: `Unfilled opposing ${dir > 0 ? 'bearish' : 'bullish'} FVG${pct > 0 ? ' (remaining gap)' : ''}`,
      strength: number(g.strength), origin_t: number(g.t), status: pct > 0 ? 'partially_unfilled' : 'unfilled',
      fill_pct: pct, zone: [r4(remainingBottom), r4(remainingTop)], original_zone: [bottom, top] });
  }
  const pd = analysis.premium_discount;
  if (pd) push({ price: dir > 0 ? pd.range_high : pd.range_low, kind: 'range',
    label: dir > 0 ? 'Dealing range high' : 'Dealing range low', strength: 0.9,
    origin_t: null, status: 'structural_range' });
  return ordered(rows, dir);
}

function levels(rows, dir, entry, risk) {
  if (!(number(risk) > 0)) return [];
  // Do NOT discard the nearest magnet because it is inside 0.9R/2R.
  return ordered(rows, dir).filter((p) => dir * (p.price - entry) > 0).map((p) => ({
    ...p, price: r4(p.price), rr: r2(dir * (p.price - entry) / risk),
  }));
}

module.exports = { catalogue, levels, ordered, byProximity };

/** M77 — Ep20 13:32–16:15. The course explicitly allows 1m -> 5m,
 * not 1m -> 1h. It does not enumerate a full ladder. The remaining core
 * adjacency and the app's 3m/30m extensions are documented engineering policy,
 * not a claim that the teacher supplied these nine mappings. Never use the
 * narrative/bias stack as an exit-TF ladder (15m's boss is 4h, not its next TF).
 */
const NEXT_TF = Object.freeze({ '1m': '5m', '3m': '5m', '5m': '15m',
  '15m': '1h', '30m': '1h', '1h': '4h', '4h': '1d', '1d': '1w', '1w': null });
function timeframePolicy(entryTf) {
  const known = typeof entryTf === 'string' && Object.hasOwn(NEXT_TF, entryTf);
  return { rule: 'entry_or_one_above', state: known ? 'known' : 'unknown',
    entry_tf: known ? entryTf : null,
    allowed_tfs: known ? [entryTf, NEXT_TF[entryTf]].filter(Boolean) : [], exception: null };
}

// These are real observed analyses, NOT MTF targets relabelled with an LTF name.
// Only the small target-relevant facts cross the TD/Setup boundary, no OHLC copy.
function sourceFrames(series) {
  return (series || []).filter((s) => s && s.smc).map((s) => {
    const a = s.smc, st = a.structure || {};
    return { tf: typeof s.tf === 'string' ? s.tf : null, analysis: {
      tf: typeof a.tf === 'string' ? a.tf : null,
      structure: { trend: st.trend, last_swing_high: st.last_swing_high || null,
        last_swing_low: st.last_swing_low || null },
      liquidity: { pools: (a.liquidity && a.liquidity.pools) || [] },
      order_blocks: (a.order_blocks || []).map((z) => ({ kind: z.kind, dir: z.dir,
        bottom: z.bottom, top: z.top, breached: z.breached, mitigated: z.mitigated,
        strength: z.strength, t: z.t, displacement_t: z.displacement_t })),
      fvgs: (a.fvgs || []).map((g) => ({ dir: g.dir, bottom: g.bottom, top: g.top,
        filled: g.filled, fill_pct: g.fill_pct, strength: g.strength, t: g.t })),
      premium_discount: a.premium_discount ? { range_high: a.premium_discount.range_high,
        range_low: a.premium_discount.range_low } : null,
    } };
  });
}

function scopeSources(sources, entryTf) {
  const policy = timeframePolicy(entryTf), accepted = [], rejected = [], seen = new Set();
  for (const s of sources || []) {
    const tf = s && s.tf, analysisTf = s && s.analysis && s.analysis.tf;
    let reason = null;
    if (!tf || !analysisTf) reason = 'unknown_source_tf';
    else if (tf !== analysisTf) reason = 'source_tf_mismatch';
    else if (!policy.allowed_tfs.includes(tf)) reason = 'outside_entry_target_band';
    if (reason) { rejected.push({ source_tf: tf || null, analysis_tf: analysisTf || null, reason }); continue; }
    if (seen.has(tf)) continue; // do not let a secondary catalogue override the actual primary
    seen.add(tf); accepted.push(s);
  }
  return { sources: accepted, policy: { ...policy, source_tfs: [...seen], rejected_sources: rejected } };
}
module.exports.NEXT_TF = NEXT_TF;
module.exports.timeframePolicy = timeframePolicy;
module.exports.sourceFrames = sourceFrames;
module.exports.scopeSources = scopeSources;
