'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  BOT ORCHESTRATOR — one call, five brains
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   momentum.js   top-down bias + mechanics score            ("what is happening")
 *   smc.js        structure, liquidity, sweeps, zones, CRT   ("the mechanics")
 *   setup.js      graded entry plans with risk                ("what to do")
 *   predict.js    backtest + calibrated probabilities         ("how likely")
 *   correction.js journal mistakes, guardrails, feedback      ("what you keep doing")
 *
 *  Plus the two things that make the output usable:
 *    - news blackout filter (high-impact releases around the entry window)
 *    - signal tracking: every alert is stored, then resolved against real candles,
 *      so the bot's own hit rate is on the record (no vibes, no cherry-picking).
 */

const { db, getBiasState, setBiasState } = require('../db');
const I = require('../instruments');
const M = require('../market');
const C = require('../candles');
const Momentum = require('./momentum');
const SMC = require('./smc');
const Setup = require('./setup');
const Now = require('./now');
const Predict = require('./predict');
const Cor = require('./correction');

/* -------------------------------------------------------------------------
 * M124 — THE ENTRY-SERIES DEPTH THE METHOD READS.
 *
 * `analyse()` fetched a hardcoded 600 entry bars. `chart()` fetched
 * `clamp(opts.bars || 400, 80, 1200)`, so the same request with bars=400 made the
 * chart analyse a 400-bar window and the analysis strip a 600-bar one. Different
 * windows produce different structure, a different topdown direction, and therefore
 * a DIFFERENT ACTION FOR THE SAME BAR — measured on EURUSD 15m at
 * 2026-10-10T07:15Z: analyse direction 1 / status confirmed / BUY, chart direction
 * 0 / status waiting / blocked on `no-trigger` and `chase` / NO TRADE.
 *
 * The comment above chart()'s fetch already claimed "the same series lengths the
 * analyse endpoint uses, so the two payloads can never disagree" — it had been made
 * true for the bias and trigger series by an earlier fix and was still false for the
 * entry series, which is the one that decides direction. A claim like that has to be
 * enforced by a shared constant, not by two literals that happen to agree.
 *
 * `opts.bars` is a DISPLAY parameter — how many candles to draw — and is now kept
 * strictly separate from how deep the method reads.
 * ------------------------------------------------------------------------*/
const METHOD_ENTRY_BARS = 600;

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ══════════════════════════════════════════════════════════ news filter */

const CURRENCY_HINTS = [
  ['USD', ['USD', 'USDT', 'USDC', 'XAU', 'XAG', 'GC', 'SI', 'CL', 'BZ', 'NG', 'ES', 'MES', 'NQ', 'MNQ', 'YM', 'RTY', 'US30', 'NAS100', 'SPX500', 'BTC', 'ETH', 'SOL']],
  ['EUR', ['EUR', 'GER40']],
  ['GBP', ['GBP', 'UK100']],
  ['JPY', ['JPY', 'JP225']],
  ['AUD', ['AUD']], ['CAD', ['CAD']], ['CHF', ['CHF']], ['NZD', ['NZD']],
];

function currenciesOf(symbol) {
  const s = String(symbol || '').toUpperCase();
  const out = [];
  for (const [ccy, hints] of CURRENCY_HINTS) if (hints.some((h) => s.includes(h))) out.push(ccy);
  return out.length ? out : ['USD'];
}

/**
 * High-impact releases inside ±windowMin of now for this symbol's currencies.
 * @returns {Promise<{blackout:string|null, events:Array, window_min:number}>}
 */
async function newsCheck(symbol, windowMin = 45) {
  try {
    const cal = await M.getCalendar();
    const events = (cal && cal.events) || [];
    const now = Date.now();
    const ccys = currenciesOf(symbol);
    const hits = events.filter((e) => {
      if (!e.date) return false;
      if (!/high/i.test(e.impact || '')) return false;
      const ccy = String(e.currency || '').toUpperCase();
      if (!ccys.some((c) => ccy.includes(c))) return false;
      return Math.abs(new Date(e.date).getTime() - now) <= windowMin * 60000;
    }).map((e) => ({ title: e.title, currency: e.currency, time: e.date, impact: e.impact, forecast: e.forecast, previous: e.previous }));
    const upcoming = events.filter((e) => e.date && /high/i.test(e.impact || '') && new Date(e.date).getTime() > now && new Date(e.date).getTime() - now < 6 * 3600e3)
      .filter((e) => ccys.some((c) => String(e.currency || '').toUpperCase().includes(c)))
      .slice(0, 4)
      .map((e) => ({ title: e.title, currency: e.currency, time: e.date, in_minutes: Math.round((new Date(e.date).getTime() - now) / 60000) }));
    return {
      blackout: hits.length ? `${hits.map((h) => `${h.currency} ${h.title}`).join('; ')} — high-impact release inside ±${windowMin} min. Stand down until it prints.` : null,
      events: hits, upcoming, currencies: ccys, window_min: windowMin,
    };
  } catch (e) {
    return { blackout: null, events: [], upcoming: [], currencies: currenciesOf(symbol), window_min: windowMin, error: e.message };
  }
}

/* ═══════════════════════════════════════════════════════ instrument spec */

function specOf(symbol) {
  const spec = I.PRESETS.find((p) => p.symbol === String(symbol || '').toUpperCase());
  if (spec) return { symbol: spec.symbol, asset_class: spec.asset_class, value_per_point: spec.value_per_point, unit: spec.unit, pip_size: spec.pip_size, tick_size: spec.tick_size, name: spec.name };
  const g = typeof I.genericSpec === 'function' ? I.genericSpec(symbol) : null;
  return g ? { ...g, symbol } : { symbol, asset_class: 'stocks', value_per_point: 1, unit: 'units', name: symbol };
}

/* ═══════════════════════════════════════════════════════ full analysis */

/**
 * Everything the app knows about one market right now.
 * @param {string} symbol
 * @param {string} tf
 * @param {{userId?:number, accountId?:number, includePrediction?:boolean, predictionBars?:number, minRR?:number}} opts
 */
const floorRR = (v) => (Number(v) > 0 ? Number(v) : 1);   // the trader's minimum R:R
const runRR = (v) => Math.max(2, floorRR(v));              // the setup model's 1:2 runway

/**
 * M9 — the risk-per-trade guardrail on the READ path. One helper because two call sites need
 * it and they must not drift.
 *
 * The write path (routes/api.js) clamps what a request supplies. This clamps what the engine
 * USES, so a row stored above the guardrail before the fix — or written by any path that
 * bypasses the API — can never reach buildSetups() and size every signal from it. Before this,
 * `Number(account.risk_per_trade_pct || 0.5)` was a FALLBACK for null/0, not a ceiling: a
 * stored 50 % flowed straight through to position sizing on the main signal path.
 *
 * @returns {{riskPct:number, maxRiskPct:number}} the percentage to size with, plus the ceiling
 *   to hand the engine — which also makes setup.js's documented `ctx.maxRiskPct` a real input.
 *   The finding recorded that `grep -n maxRiskPct src/bots/setup.js` returned ONE hit, the ctx
 *   docstring: documented as an input and never read.
 */
const riskPlan = (account, opts = {}) => {
  if (account) {
    const unlocked = !!account.risk_unlocked;
    return {
      riskPct: I.clampRiskPct(account.risk_per_trade_pct, { fallback: I.RISK_GUARDRAIL.default_pct, unlocked }),
      maxRiskPct: unlocked ? I.RISK_GUARDRAIL.max_pct : I.RISK_GUARDRAIL.guardrail_pct,
    };
  }
  // No account: the caller supplied a per-request figure, which is the manual act itself, so
  // it is honoured up to the absolute maximum rather than pulled down to the guardrail.
  return {
    riskPct: I.clampRiskPct(opts.riskPct, { fallback: I.RISK_GUARDRAIL.default_pct, unlocked: true }),
    maxRiskPct: I.RISK_GUARDRAIL.max_pct,
  };
};

/* ══════════════════════════════════════════════════════ M50 bias hysteresis */
/**
 * Apply Ep 15's bias rule across calls and persist the result.
 *
 * Mistake #4: *"changing bias after every single candlestick… your bias only change when your
 * invalidation is hit."* `alignment()` is pure and re-derives from scratch on every call, which is
 * the right design for a function but left the rule with no mechanism — `probe-ep15-bias-flips.js`
 * measured 184 of 276 sign flips with no invalidating close behind them.
 *
 * So the state lives HERE, at the boundary that has an identity (symbol+timeframe) and a clock, and
 * never inside `alignment()`. Folding it in there would make that function order-dependent, and
 * every probe and backtest that walks a series would then carry bias between unrelated windows and
 * silently change what all of them measure — which is exactly how M120 happened.
 *
 * The level tested is the one STORED when the bias was formed, not one recomputed now: "your
 * invalidation" means the level you were wrong beyond, and re-deriving it every candle would let the
 * market move the goalposts and defeat the whole point. It falls back to the current dealing range
 * only when nothing usable was stored.
 *
 * Never throws. If the state cannot be read or written the fresh bias is returned unchanged, so a
 * database problem degrades to the pre-M50 behaviour rather than failing an analysis.
 */
async function applyBiasHysteresis(sym, tf, momentum, series) {
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const fresh = num(momentum && momentum.bias) || 0;
  const out = {
    bias: fresh, held: false, changed: false, invalidated: false, changed_because: null,
    disagreement: null, age_bars: null, since_t: null, invalidation_level: null,
    invalidation_side: null, prior_bias: null, stored: false, error: null,
  };
  try {
    const pd = (series && series.smc && series.smc.premium_discount) || null;
    // analyse() gets `{ layers: { bias: { plan } } }` from Momentum.analyse while chart() builds
    // the raw TD.build result, which carries `plan` at the top level. Accept both shapes.
    const tdObj = (momentum && momentum.topdown) || null;
    const plan = tdObj ? ((tdObj.layers && tdObj.layers.bias && tdObj.layers.bias.plan) || tdObj.plan || null) : null;
    // The level that voids a given bias: the CRT plan's own numeric level when the plan is for that
    // direction (that is literally his invalidation), else the opposite side of the dealing range —
    // the definition probe-m50-bias-hysteresis.js measured with.
    const levelFor = (b) => {
      if (!b) return { level: null, side: null };
      if (plan && num(plan.dir) === b && num(plan.invalidation_level) !== null) {
        return { level: num(plan.invalidation_level), side: plan.invalidation_side };
      }
      const lvl = b > 0 ? num(pd && pd.range_low) : num(pd && pd.range_high);
      return lvl === null ? { level: null, side: null } : { level: lvl, side: b > 0 ? 'below' : 'above' };
    };

    const prior = await getBiasState(sym, tf);
    const priorBias = prior ? (num(prior.bias) || 0) : 0;
    const storedInv = prior && num(prior.invalidation_level) !== null
      ? { level: num(prior.invalidation_level), side: prior.invalidation_side }
      : levelFor(priorBias);
    const h = Momentum.biasHysteresis({
      priorBias, freshBias: fresh, invalidation: storedInv, close: num(series && series.price),
    });

    const candles = series && Array.isArray(series.candles) && series.candles.length ? series.candles : null;
    const lastT = candles ? num(candles[candles.length - 1].t) : null;
    const changed = !prior || h.changed;
    const sinceT = changed ? lastT : (num(prior && prior.since_t) !== null ? num(prior.since_t) : lastT);
    const ageBars = changed ? 0 : (num(prior && prior.age_bars) === null ? 0 : num(prior.age_bars) + 1);
    const next = levelFor(h.bias);

    Object.assign(out, {
      bias: h.bias, held: h.held, changed: h.changed, invalidated: h.invalidated,
      changed_because: h.changed_because, disagreement: h.disagreement,
      age_bars: ageBars, since_t: sinceT, invalidation_level: next.level,
      invalidation_side: next.side, prior_bias: prior ? priorBias : null,
    });
    out.stored = await setBiasState({
      symbol: sym, tf, bias: h.bias,
      invalidation_level: next.level, invalidation_side: next.side,
      since_t: sinceT, age_bars: ageBars,
      changed_because: h.changed_because, disagreement: h.disagreement,
    });
    return out;
  } catch (e) { out.error = e.message; return out; }
}

/** The response block describing what hysteresis did, so a held bias is auditable not silent. */
function hysteresisView(h) {
  if (!h) return null;
  return {
    applied: true, prior_bias: h.prior_bias, bias_fresh: h.disagreement !== null ? h.disagreement : h.bias,
    held: h.held, changed: h.changed, invalidated: h.invalidated,
    changed_because: h.changed_because, disagreement: h.disagreement,
    age_bars: h.age_bars, since_t: h.since_t ? new Date(h.since_t).toISOString() : null,
    invalidation_level: h.invalidation_level, invalidation_side: h.invalidation_side,
    stored: h.stored, error: h.error || null,
  };
}

async function analyse(symbol, tf = '15m', opts = {}) {
  const sym = String(symbol || '').toUpperCase();
  const spec = specOf(sym);
  // Bar replay: with `trim` (drop the last N candles) or `as_of` (ISO time) the
  // whole read is built from the candles that existed then — the same code path,
  // the same rules, no look-ahead.
  const trim = Math.max(0, Math.min(400, Number(opts.trim) || 0));
  const asOf = opts.as_of ? Date.parse(opts.as_of) : (opts.asOf ? Number(opts.asOf) : null);
  const cut = { trim, asOf: Number.isFinite(asOf) && asOf ? asOf : null };
  const replay = trim > 0 || cut.asOf ? cut : null;

  const [momentum, news] = await Promise.all([
    Momentum.analyse(sym, tf, { limit: 600, ...cut, minRR: floorRR(opts.minRR) }),
    newsCheck(sym, opts.newsWindowMin || 45),
  ]);

  // the setup model needs the raw trading-timeframe handle (zones, sweeps, indicators)
  const series = await Momentum.series(sym, tf, METHOD_ENTRY_BARS, cut);   // M124: shared with chart()

  // M50. Skipped during a bar replay on purpose: a replay reconstructs what the bot would have
  // said THEN, so it must neither read state written by the present nor write state the present
  // will later read. A replayed bias is therefore the from-scratch one, and says so.
  const hyst = replay ? null : await applyBiasHysteresis(sym, tf, momentum, series);
  const momentumEff = hyst
    ? { ...momentum, bias: hyst.bias, direction: hyst.bias > 0 ? 'bullish' : hyst.bias < 0 ? 'bearish' : 'neutral' }
    : momentum;
  const account = opts.userId ? await Cor.accountOf(opts.userId, opts.accountId) : null;
  const balance = account ? Number(account.current_balance || account.starting_balance || 0) : Number(opts.balance || 0);
  const { riskPct, maxRiskPct } = riskPlan(account, opts);   // M9: clamped on read, not just on write

  const setups = Setup.buildSetups(series.smc, {
    price: series.price, atr: series.atr,
    bias: momentumEff.bias, biasReason: momentum.alignment.reason,
    indicators: series.ind,
    balance, riskPct, maxRiskPct, valuePerPoint: spec.value_per_point, assetClass: spec.asset_class, symbol: sym,
    newsBlackout: news.blackout, minRR: floorRR(opts.minRR),
    topdown: momentum.topdown,          // the method decides whether a side may be armed
  });

  let prediction = null;
  if (opts.includePrediction !== false) {
    try {
      prediction = await Predict.predict(sym, tf, { bars: opts.predictionBars || 1200, step: opts.step || 2, force: !!opts.force });
    } catch (e) {
      prediction = { ok: false, error: e.message };
    }
  }

  // blend: the setup's own grade + the market's measured edge + this setup's probability
  const best = setups.candidates[0] || null;
  const predRow = prediction && prediction.setups && best ? prediction.setups.find((p) => p.dir === best.dir) : null;
  let daily = null;
  if (opts.userId) { try { daily = await Cor.dailyState(opts.userId, { accountId: opts.accountId }); } catch (e) { daily = null; } }

  const headline = buildHeadline({ sym, tf, momentum: momentumEff, setups, prediction, predRow, news, daily });


  // The method's own verdict, kept separate from the setup model's. Anything
  // downstream (webhooks, alerts, the UI banner) uses this one for direction.
  const td = momentum.topdown || {};
  const methodVerdict = {
    action: td.blocked ? 'NO TRADE' : (setups.verdict.dir > 0 ? 'BUY' : setups.verdict.dir < 0 ? 'SELL' : 'NO TRADE'),
    direction: td.direction || 0,
    status: td.status || 'unknown',
    blocked: !!td.blocked,
    headline: td.headline || null,
    conviction: td.conviction || null,
    pending_step: (td.steps || []).find((s) => !s.done) || null,
    playbook: td.playbook || [],
    conflicts: td.conflicts || [],
    source: 'topdown',
  };

  /* ---- what to do at this moment (one answer, dated) --------------------- */
  let replayCtx = null;
  if (replay) {
    // build the *untrimmed* read as well, so a replay can say what happened after
    const L2 = Momentum.topdown.layersFor(tf);
    const full = await Promise.all([Momentum.series(sym, tf, 600), Momentum.series(sym, L2.bias_tf, 400)]);
    const ltfRaw = L2.trigger_tf === tf ? null : await Momentum.series(sym, L2.trigger_tf, 400);
    const tdNow = Momentum.topdown.build({ symbol: sym, tf, series: full[0], biasSeries: full[1], triggerSeries: ltfRaw || full[0], opts: { minRR: floorRR(opts.minRR) } });
    replayCtx = { trim: replay.trim || null, since: { price: full[0].price, atr: full[0].atr, verdict: tdNow.status } };
  }
  const now = Now.build({
    td, setups, series, quote: momentum.quote, news, daily,
    replay: replayCtx, symbol: sym, tf,
    nowMs: opts.nowMs,
    minRR: opts.minRR,                 // the trader's own floor — not a constant
  });

  return {
    ok: true,
    symbol: sym, timeframe: tf, instrument: spec,
    generated_at: new Date().toISOString(),
    replay: replay ? { trim: replay.trim || null, as_of: replay.asOf ? new Date(replay.asOf).toISOString() : null } : null,
    now,
    headline,
    method_verdict: methodVerdict,
    topdown: td,
    momentum: {
      direction: momentumEff.direction, bias: momentumEff.bias, bias_score: momentum.bias_score,
      // M50: `bias` is the HELD bias, the one every decision below was made with. `bias_fresh` is
      // what a from-scratch derivation said this candle, and `bias_score` scores THAT read — it is
      // the alignment score, not a confidence in the held bias, so the two are reported separately
      // rather than quietly disagreeing.
      bias_fresh: momentum.bias, bias_hysteresis: hysteresisView(hyst),
      alignment: momentum.alignment, mechanics: momentum.mechanics,
      narrative: momentum.narrative, conflicts: momentum.conflicts,
      htf: momentum.htf, quote: momentum.quote, series: momentum.series,
    },
    smc: {
      price: series.smc.price, atr: series.smc.atr, counts: series.smc.counts,
      structure: series.smc.structure, htf_structure: series.smc.htf_structure,
      premium_discount: series.smc.premium_discount, sessions: series.smc.sessions,
      order_blocks: series.smc.order_blocks.slice(0, 8), fvgs: series.smc.fvgs.slice(0, 8),
      breakers: series.smc.breakers.slice(0, 4), sweeps: series.smc.sweeps.slice(0, 6),
      liquidity: { pools: (series.smc.liquidity.pools || []).slice(0, 10), pdh: series.smc.liquidity.pdh, pdl: series.smc.liquidity.pdl, pwh: series.smc.liquidity.pwh, pwl: series.smc.liquidity.pwl },
      inducement: series.smc.inducement, crt: series.smc.crt,
    },
    indicators: series.ind ? {
      score: series.ind.score, label: series.ind.label, regime: series.ind.regime,
      metrics: series.ind.metrics, groups: series.ind.groups, notes: series.ind.notes, ind: series.ind.ind,
    } : null,
    setups,
    prediction: prediction ? {
      ok: prediction.ok !== false,
      direction: prediction.direction, setups: prediction.setups, buy: prediction.buy, sell: prediction.sell,
      model: prediction.model, backtest: prediction.backtest, summary: prediction.summary,
      current: predRow || null, error: prediction.error || null,
    } : null,
    news,
    daily,
    account: account ? { id: account.id, name: account.name, balance: r2(balance), currency: account.currency, risk_per_trade_pct: riskPct } : null,
  };
}

function buildHeadline({ sym, tf, momentum, setups, prediction, predRow, news, daily }) {
  const v = setups.verdict;
  const td = momentum.topdown || {};
  const parts = [];
  parts.push(`${sym} ${tf}: ${v.action}${v.grade && v.grade !== 'no-trade' ? ` (${v.grade}, ${v.score}/100)` : ''} — ${v.headline}`);
  if (td.headline) parts.push(`${td.status === 'confirmed' ? 'Method: confirmed' : 'Method: waiting'} — ${td.headline}`);
  if (td.playbook && td.playbook.length) parts.push(`Next: ${td.playbook[0]}`);
  if (predRow && predRow.p_win != null) parts.push(`Modelled chance ${predRow.p_win}% to the first target (${predRow.similar_setups} similar setups, expected ${predRow.expected_r}R).`);
  if (prediction && prediction.backtest && prediction.backtest.expectancy_r != null) parts.push(`This market/timeframe shows ${prediction.backtest.expectancy_r > 0 ? '+' : ''}${prediction.backtest.expectancy_r}R expectancy over ${prediction.backtest.decided} resolved setups.`);
  if (news.blackout) parts.push(`NEWS BLACKOUT: ${news.blackout}`);
  if (daily && daily.status !== 'clear') parts.push(`Personal guardrail: ${daily.message}`);
  if (momentum.conflicts.length) parts.push(`Caution: ${momentum.conflicts.join(' ')}`);
  return {
    action: v.action, dir: v.dir, grade: v.grade, score: v.score,
    method_status: td.status || null, method_direction: td.direction || 0, method_blocked: !!td.blocked,
    method_source: v.source || 'setup-model', setup_action: v.setup_action || null,
    mechanics: momentum.mechanics.score, mechanics_grade: momentum.mechanics.grade,
    killzone: (setups.filters || {}).killzone,
    text: parts.join(' '),
    next_trigger: v.next_trigger,
    checks: {
      momentum: momentum.bias, sweep: !!(setups.candidates[0] && setups.candidates[0].levels),
      prediction: predRow ? predRow.p_win : null, news: !news.blackout,
      guardrails: daily ? daily.status : null,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════ scan */

/**
 * Rank a watchlist by mechanics + setup quality. Prediction is skipped (too heavy
 * per symbol) — the scan is the "where should I look" tool.
 */
/* ═══════════════════════════════════════════════════════════════ chart ═══ */

/**
 * Everything the desk chart needs in one payload: candles for the trading
 * timeframe, the SMC overlay, the plan, the CRT range and the top-down stack.
 * Kept separate from analyse() so the chart can be re-drawn cheaply, and so the
 * chart always draws the same numbers the analysis talked about.
 *
 * @param {string} symbol
 * @param {string} tf
 * @param {{bars?:number, userId?:number, accountId?:number, minRR?:number, balance?:number, riskPct?:number}} opts
 */

async function chart(symbol, tf = '15m', opts = {}) {
  const sym = String(symbol || '').toUpperCase();
  const bars = Math.min(Math.max(Number(opts.bars) || 400, 80), 1200);
  const spec = specOf(sym);
  const L = Momentum.topdown.layersFor(tf);
  const trim = Math.max(0, Math.min(400, Number(opts.trim) || 0));
  const asOf = opts.as_of ? Date.parse(opts.as_of) : null;
  const cut = { trim, asOf: Number.isFinite(asOf) && asOf ? asOf : null };

  // The same series lengths the analyse endpoint uses, so the two payloads can
  // never disagree about the same market (they did once: the chart asked for 200
  // higher-timeframe candles and the method read a different range from them).
  const [entry, bias, triggerRaw] = await Promise.all([
    Momentum.series(sym, tf, METHOD_ENTRY_BARS, cut),   // M124: the method's window, NOT `bars`
    Momentum.series(sym, L.bias_tf, 400, cut),
    L.trigger_tf === tf ? Promise.resolve(null) : Momentum.series(sym, L.trigger_tf, 400, cut),
  ]);
  const trig = triggerRaw || entry;

  const td = Momentum.topdown.build({ symbol: sym, tf, series: entry, biasSeries: bias, triggerSeries: trig, opts: { minRR: floorRR(opts.minRR) } });
  entry.smc.crt = Momentum.crtView(td, tf);

  const biasTrend = bias.smc.structure ? bias.smc.structure.trend : 'ranging';
  const momentum = {
    bias: td.direction || (biasTrend === 'bullish' ? 1 : biasTrend === 'bearish' ? -1 : 0),
    alignment: { reason: td.headline },
    topdown: td,
  };
  // M50: the same rule as analyse(), against the same stored state, so the chart cannot show a
  // bias that the analysis endpoint disagrees with. Skipped while replaying, for the same reason.
  const chartHyst = (trim > 0 || cut.asOf) ? null : await applyBiasHysteresis(sym, tf, momentum, entry);
  if (chartHyst) momentum.bias = chartHyst.bias;

  const account = opts.userId ? await Cor.accountOf(opts.userId, opts.accountId) : null;
  const balance = account ? Number(account.current_balance || account.starting_balance || 0) : Number(opts.balance || 0);
  const { riskPct, maxRiskPct } = riskPlan(account, opts);   // M9: clamped on read, not just on write

  const setups = Setup.buildSetups(entry.smc, {
    price: entry.price, atr: entry.atr, bias: momentum.bias, biasReason: td.headline,   // M50: momentum.bias is the held bias
    indicators: entry.ind, balance, riskPct, maxRiskPct, valuePerPoint: spec.value_per_point,
    assetClass: spec.asset_class, symbol: sym, minRR: floorRR(opts.minRR), topdown: td,
  });

  // The plan drawn on the chart: the method's own CRT plan when it has one,
  // otherwise the best graded setup on the side the method allows. A blocked
  // method draws no directional plan at all — the chart shows levels, not a trade.
  const crt = td.crt_plan;
  const best = setups.candidates.find((c) => c.levels && c.dir === td.direction) || setups.candidates[0] || null;
  let plan = null;
  if (crt && td.direction !== 0) {
    plan = {
      source: 'crt', dir: crt.dir, side: crt.side, method: td.method.name,
      entry: crt.safer.entry, stop: crt.safer.stop,
      targets: [{ price: crt.aggressive.target, rr: crt.safer.rr, role: 'T1' }],
      rr_final: crt.safer.rr,
      entry_status: td.status === 'confirmed' ? 'confirmed' : td.status,
      alternatives: { aggressive: crt.aggressive, safer: crt.safer },
      management: {
        rule: 'Take the first target at the opposite side of the CRT range. A runner is only allowed when the higher-timeframe structure has shifted with the trade.',
        runner_target: null,
      },
      note: `${crt.side} after the ${crt.sweep.level} sweep failed to hold · ${crt.target_note}`,
    };
  } else if (best && best.levels && !td.blocked) {
    plan = {
      source: 'setup', dir: best.dir, side: best.side, method: null,
      ...best.levels,
      entry_status: best.levels.entry_status,
    };
  }

  const smc = {
    price: entry.smc.price, atr: entry.smc.atr, counts: entry.smc.counts,
    structure: entry.smc.structure, htf_structure: entry.smc.htf_structure,
    premium_discount: entry.smc.premium_discount, sessions: entry.smc.sessions,
    order_blocks: entry.smc.order_blocks.slice(0, 8), fvgs: entry.smc.fvgs.slice(0, 8),
    sweeps: entry.smc.sweeps.slice(0, 6), displacement: entry.smc.displacement.slice(0, 4),
    liquidity: {
      pools: (entry.smc.liquidity.pools || []).slice(0, 10),
      pdh: entry.smc.liquidity.pdh, pdl: entry.smc.liquidity.pdl,
      pwh: entry.smc.liquidity.pwh, pwl: entry.smc.liquidity.pwl,
    },
    crt: entry.smc.crt,
  };

  const stack = {
    bias: {
      tf: L.bias_tf, job: 'decides direction', candles: bias.candles.slice(-180),
      structure: bias.smc.structure ? bias.smc.structure.trend : null,
      state: td.layers.bias.state,
      level: td.layers.bias.range ? { low: td.layers.bias.range.low, high: td.layers.bias.range.high, label: 'CRT range' } : null,
    },
    location: {
      tf, job: 'entry location', candles: entry.candles.slice(-180),
      structure: entry.smc.structure ? entry.smc.structure.trend : null,
      level: entry.smc.premium_discount ? { mid: entry.smc.premium_discount.mid, low: entry.smc.premium_discount.range_low, high: entry.smc.premium_discount.range_high, label: 'dealing range' } : null,
    },
    trigger: {
      tf: trig.tf, job: 'confirmation', candles: trig.candles.slice(-180),
      structure: trig.smc.structure ? trig.smc.structure.trend : null,
      level: td.layers.trigger.confirmation && td.layers.trigger.confirmation.pullback_zone
        ? { ...td.layers.trigger.confirmation.pullback_zone, label: 'entry zone' } : null,
    },
  };

  // the same single answer the analysis strip shows, so the chart and the words
  // on screen can never disagree about what to do
  const now = Now.build({
    td, setups, series: entry, quote: null, symbol: sym, tf,
    replay: cut.trim || cut.asOf ? { trim: cut.trim || null, since: null } : null,
    nowMs: opts.nowMs,
    minRR: opts.minRR,
  });

  return {
    ok: true, symbol: sym, timeframe: tf, instrument: spec,
    generated_at: new Date().toISOString(),
    replay: cut.trim || cut.asOf ? { trim: cut.trim || null, as_of: cut.asOf ? new Date(cut.asOf).toISOString() : null } : null,
    now,
    meta: {
      provider: entry.meta.provider, ticker: entry.meta.ticker, bars: entry.candles.length,
      first_bar: entry.meta.first_bar, last_bar: entry.meta.last_bar,
      last_price: entry.meta.last_price, warnings: entry.meta.warnings,
      sources: { bias: `${L.bias_tf} via ${bias.meta.provider}`, trigger: `${trig.tf} via ${trig.meta.provider}` },
    },
    /* M124 — `bars` is a DISPLAY parameter and stays one. The method above always reads
     * METHOD_ENTRY_BARS so this payload and /analyse cannot disagree about the same bar;
     * the candles returned for drawing are still sliced to what was asked for. When the
     * caller wants MORE candles drawn than the method reads, the extra depth is fetched
     * for display only and never feeds the analysis. */
    candles: (bars > METHOD_ENTRY_BARS
      ? (await Momentum.series(sym, tf, bars, cut)).candles
      : entry.candles
    ).slice(-bars).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })),
    smc, plan, topdown: td, stack,
    setups: {
      verdict: setups.verdict, method: setups.method,
      candidates: setups.candidates.map((c) => ({ dir: c.dir, side: c.side, grade: c.grade, score: c.score, ok: c.ok,
        // M7/M8/M35/M96: without this the refusal reason is computed in setup.js and then
        // dropped here, leaving ok:false with no explanation. See the M61 dead-vetoes note.
        no_trade: c.no_trade || [], levels: c.levels, action: c.action })),
    },
    quote: { price: entry.price, atr: entry.atr, change_pct: entry.candles.length > 1 ? r2(((entry.price - entry.candles[0].c) / entry.candles[0].c) * 100) : null },
  };
}

async function scan(symbols, tf = '15m', { userId = null, accountId = null, concurrency = 3 } = {}) {
  const list = [...new Set((symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean))].slice(0, 24);
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const sym = list[cursor++];
      try {
        const [momentum, series] = await Promise.all([
          Momentum.analyse(sym, tf, { limit: 400 }),
          Momentum.series(sym, tf, 400),
        ]);
        // M50: a scan is a real observation of the market, so it reads and updates the same state
        // as analyse(). Without this a scan and an analyse of the same symbol could report
        // different biases, which is worse than either rule applied consistently.
        const scanHyst = await applyBiasHysteresis(sym, tf, momentum, series);
        const specs = Setup.buildSetups(series.smc, {
          price: series.price, atr: series.atr, bias: scanHyst.bias, biasReason: momentum.alignment.reason,
          indicators: series.ind, minRR: 2, topdown: momentum.topdown,
        });
        // one row per market: the side the method permits (a scan that lists both
        // a buy and a sell for the same symbol is not a scan, it is a coin toss)
        const best = (momentum.topdown && momentum.topdown.direction
          ? specs.candidates.find((c) => c.dir === momentum.topdown.direction && c.levels)
          : null) || specs.candidates.find((c) => c.levels) || specs.candidates[0] || null;
        rows.push({
          symbol: sym, timeframe: tf, ok: true,
          price: series.price, atr: series.atr,
          direction: scanHyst.bias > 0 ? 'bullish' : scanHyst.bias < 0 ? 'bearish' : 'neutral',
          bias: scanHyst.bias, bias_fresh: momentum.bias,
          bias_held: scanHyst.held, bias_changed_because: scanHyst.changed_because,
          mechanics: momentum.mechanics.score, mechanics_grade: momentum.mechanics.grade,
          action: specs.verdict.action, grade: best ? best.grade : 'no-trade', score: best ? best.score : 0,
          setup_side: best ? best.side : null,
          entry_status: best && best.levels ? best.levels.entry_status : null,
          entry: best && best.levels ? best.levels.entry : null,
          stop: best && best.levels ? best.levels.stop : null,
          t1: best && best.levels && best.levels.targets[0] ? best.levels.targets[0].price : null,
          rr_final: best && best.levels ? best.levels.rr_final : null,
          killzone: series.smc.sessions ? series.smc.sessions.killzone : null,
          sweeps: series.smc.counts ? series.smc.counts.sweeps : 0,
          provider: series.meta.provider, ticker: series.meta.ticker,
          headline: momentum.narrative && momentum.narrative[0] ? momentum.narrative[0].text : '',
          conflicts: momentum.conflicts,
        });
      } catch (e) {
        rows.push({ symbol: sym, timeframe: tf, ok: false, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  const ok = rows.filter((r) => r.ok);
  ok.sort((a, b) => (b.score + b.mechanics / 2) - (a.score + a.mechanics / 2));
  return {
    ok: true, timeframe: tf, count: rows.length, scanned_at: new Date().toISOString(),
    rows: ok, errors: rows.filter((r) => !r.ok),
    actionable: ok.filter((r) => r.action === 'BUY' || r.action === 'SELL').length,
    killzone: (ok[0] && ok[0].killzone) || SMC.sessionState().killzone,
  };
}

/* ══════════════════════════════════════════════════════ signal tracking */

async function ensureSignalsTable() {
  await db.exec(`CREATE TABLE IF NOT EXISTS bot_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    dir INTEGER NOT NULL,
    side TEXT NOT NULL,
    grade TEXT,
    score REAL,
    p_win REAL,
    entry REAL, stop REAL, t1 REAL, t2 REAL,
    rr_primary REAL, rr_final REAL,
    mechanics REAL,
    sentiment TEXT,           -- the read-aloud headline at the time
    entry_mode TEXT,          -- entry | mid | deep | leg | ote | mtf
    mtf_tf TEXT,
    risk_atr REAL,
    method_state TEXT,        -- topdown status at the time (confirmed | sweeping | no-sweep | ...)
    method_dir INTEGER,       -- the direction the higher timeframe gave, whatever the setup side
    method_blocked INTEGER,   -- 1 when the method said wait, so history can be split by it
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | win | loss | no_fill | expired
    outcome_r REAL,
    outcome_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  )`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_bot_signals_user ON bot_signals(user_id, status)`);
  // migration for databases created before the refined-plan columns (idempotent)
  const cols = await db.prepare('PRAGMA table_info(bot_signals)').all();
  const have = new Set((cols || []).map((c) => c.name));
  for (const [name, type] of [['entry_mode', 'TEXT'], ['mtf_tf', 'TEXT'], ['risk_atr', 'REAL'],
    ['method_state', 'TEXT'], ['method_dir', 'INTEGER'], ['method_blocked', 'INTEGER']]) {
    if (!have.has(name)) await db.exec(`ALTER TABLE bot_signals ADD COLUMN ${name} ${type}`);
  }
}

/**
 * Save an explicit plan that is already refined (e.g. a lower-timeframe
 * confirmation re-anchored entry/stop).  Unlike saveSignals it does not
 * re-derive anything from a fresh analysis — it stores exactly what the
 * trader was shown, so the bot can be graded on it later.
 */
async function savePlan(userId, p = {}) {
  await ensureSignalsTable();
  const symbol = String(p.symbol || '').toUpperCase();
  const timeframe = String(p.timeframe || '15m');
  const entry = Number(p.entry), stop = Number(p.stop);
  if (!symbol || !Number.isFinite(entry) || !Number.isFinite(stop) || entry === stop) {
    return { saved: 0, reason: 'symbol, entry and stop (entry ≠ stop) are required' };
  }
  const dir = stop < entry ? 1 : -1;
  const risk = Math.abs(entry - stop);
  const prices = (Array.isArray(p.targets) ? p.targets : [])
    .map((t) => Number(t && (t.price !== undefined ? t.price : t))).filter((x) => Number.isFinite(x));
  const t1 = prices.length ? prices[0] : (Number.isFinite(Number(p.t1)) ? Number(p.t1) : null);
  const t2 = prices.length > 1 ? prices[prices.length - 1] : (Number.isFinite(Number(p.t2)) ? Number(p.t2) : null);
  const rr = (price) => (price == null ? null : Math.round((Math.abs(price - entry) / risk) * 100) / 100);
  const info = await db.prepare(`INSERT INTO bot_signals
    (user_id, symbol, timeframe, dir, side, grade, score, p_win, entry, stop, t1, t2, rr_primary, rr_final,
     mechanics, sentiment, entry_mode, mtf_tf, risk_atr)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    userId, symbol, timeframe, dir, dir > 0 ? 'long' : 'short',
    p.grade || null, p.score == null ? null : Number(p.score), p.p_win == null ? null : Number(p.p_win),
    entry, stop, t1, t2, rr(t1), rr(t2),
    p.mechanics == null ? null : Number(p.mechanics), p.note ? String(p.note).slice(0, 400) : null,
    p.entry_mode ? String(p.entry_mode) : null, p.mtf_tf ? String(p.mtf_tf) : null,
    Number.isFinite(Number(p.risk_atr)) ? Number(p.risk_atr) : null,
  );
  return { saved: 1, ids: [info.lastInsertRowid] };
}

/** Store the actionable plan(s) from an analysis so the bot can be graded later. */
async function saveSignals(userId, payload) {
  await ensureSignalsTable();
  const cands = (payload.setups && payload.setups.candidates ? payload.setups.candidates : [])
    .filter((c) => c.levels && c.grade !== 'no-trade' && c.levels.entry_status !== 'invalid')
    .slice(0, 2);
  if (!cands.length) return { saved: 0, reason: 'no actionable setup in this analysis' };
  // Signals are stored even when the method has not fired, but they are stamped
  // (method_state / method_blocked) so the ledger can later be split into
  // "the method approved this" and "the setup model liked it anyway".
  const td = payload.topdown || null;
  const ins = await db.prepare(`INSERT INTO bot_signals
    (user_id, symbol, timeframe, dir, side, grade, score, p_win, entry, stop, t1, t2, rr_primary, rr_final, mechanics, sentiment,
     method_state, method_dir, method_blocked)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let saved = 0;
  const out = [];
  for (const c of cands) {
    const L = c.levels;
    const predRow = payload.prediction && payload.prediction.setups ? payload.prediction.setups.find((p) => p.dir === c.dir) : null;
    const info = await ins.run(
      userId, payload.symbol, payload.timeframe, c.dir, c.side, c.grade, c.score,
      predRow ? predRow.p_win : null,
      L.entry, L.stop, L.targets[0] ? L.targets[0].price : null,
      L.targets.length > 1 ? L.targets[L.targets.length - 1].price : null,
      L.rr_primary, L.rr_final,
      payload.momentum ? payload.momentum.mechanics.score : null,
      payload.headline ? payload.headline.text.slice(0, 400) : null,
      td ? td.status : null, td ? (td.direction || 0) : null, td ? (td.blocked ? 1 : 0) : null,
    );
    out.push(info.lastInsertRowid);
    saved++;
  }
  return { saved, ids: out };
}

async function listSignals(userId, { status = null, limit = 50 } = {}) {
  await ensureSignalsTable();
  const rows = status
    ? await db.prepare('SELECT * FROM bot_signals WHERE user_id=? AND status=? ORDER BY id DESC LIMIT ?').all(userId, status, limit)
    : await db.prepare('SELECT * FROM bot_signals WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, limit);
  return rows;
}

/**
 * Resolve pending signals against real candles — the bot grades itself.
 */
async function resolveSignals(userId, { limit = 20 } = {}) {
  await ensureSignalsTable();
  const pending = await db.prepare(`SELECT * FROM bot_signals WHERE user_id=? AND status='pending' ORDER BY id ASC LIMIT ?`).all(userId, limit);
  const upd = await db.prepare(`UPDATE bot_signals SET status=?, outcome_r=?, outcome_note=?, resolved_at=datetime('now') WHERE id=?`);
  const results = [];
  for (const sig of pending) {
    try {
      const { candles } = await C.getCandles(sig.symbol, sig.timeframe, { limit: 400 });
      const createdIdx = candles.findIndex((b) => new Date(b.t).getTime() >= new Date(sig.created_at).getTime());
      const fromIdx = createdIdx === -1 ? null : createdIdx - 1;
      if (fromIdx === null || fromIdx < 0) { results.push({ id: sig.id, status: 'pending', note: 'no bars since the alert yet' }); continue; }
      const cand = {
        dir: sig.dir, side: sig.side, grade: sig.grade, score: sig.score,
        levels: {
          dir: sig.dir, entry: sig.entry, stop: sig.stop, rr_primary: sig.rr_primary, rr_final: sig.rr_final,
          targets: [{ price: sig.t1, rr: sig.rr_primary, role: 'T1' }, ...(sig.t2 ? [{ price: sig.t2, rr: sig.rr_final, role: 'T2' }] : [])],
          management: { runner_target: sig.t2 ? { price: sig.t2 } : null },
        },
      };
      const sim = Predict.resolve(candles, fromIdx, cand, { maxForward: 400, fillWindow: 60 });
      if (!sim) continue;
      const status = sim.outcome === 'no_fill' ? 'no_fill' : sim.outcome === 'win' ? 'win' : sim.outcome === 'loss' ? 'loss' : 'expired';
      const note = sim.outcome === 'no_fill'
        ? `Limit at ${sig.entry} never filled within ${60} bars — no trade taken.`
        : `${sig.side} from ${sig.entry}: ${sim.hit && sim.hit.t1 ? 'T1 hit, ' : ''}${sim.hit && sim.hit.t2 ? 'runner hit T2, ' : ''}${sim.hit && sim.hit.be ? 'stopped at break-even, ' : ''}managed ${sim.managed_r}R`;
      await upd.run(status, sim.managed_r, note, sig.id);
      results.push({ id: sig.id, symbol: sig.symbol, status, r: sim.managed_r, note });
    } catch (e) {
      results.push({ id: sig.id, status: 'pending', error: e.message });
    }
  }
  return { checked: pending.length, results, stats: await signalStats(userId) };
}

/**
 * Resolve pending tracked signals for every workspace.  Used by the scheduler
 * (cron on a serverless deploy, an internal timer on a long-lived server) so
 * the bot grades itself even when nobody has the app open.
 */
async function resolveAllUsers({ limit = 40 } = {}) {
  await ensureSignalsTable();
  const users = await db.prepare('SELECT DISTINCT user_id FROM bot_signals WHERE status=\'pending\'').all();
  const out = { users: users.length, checked: 0, resolved: 0, results: [] };
  for (const u of users) {
    try {
      const r = await resolveSignals(u.user_id, { limit });
      out.checked += r.checked || 0;
      out.resolved += r.resolved || 0;
      if (r.results && r.results.length) out.results.push({ user_id: u.user_id, ...r });
    } catch (e) { out.results.push({ user_id: u.user_id, error: e.message }); }
  }
  return out;
}

async function signalStats(userId) {
  await ensureSignalsTable();
  const all = await db.prepare('SELECT * FROM bot_signals WHERE user_id=?').all(userId);
  const resolved = all.filter((s) => ['win', 'loss', 'expired'].includes(s.status));
  const wins = resolved.filter((s) => s.status === 'win');
  const byGrade = {};
  for (const s of resolved) {
    const b = byGrade[s.grade] || (byGrade[s.grade] = { grade: s.grade, n: 0, wins: 0, r: 0 });
    b.n++; if (s.status === 'win') b.wins++; b.r += s.outcome_r || 0;
  }
  return {
    total: all.length,
    pending: all.filter((s) => s.status === 'pending').length,
    no_fill: all.filter((s) => s.status === 'no_fill').length,
    resolved: resolved.length,
    wins: wins.length,
    win_rate: resolved.length ? r2((wins.length / resolved.length) * 100) : null,
    total_r: r2(resolved.reduce((a, s) => a + (s.outcome_r || 0), 0)),
    expectancy_r: resolved.length ? r2(resolved.reduce((a, s) => a + (s.outcome_r || 0), 0) / resolved.length) : null,
    by_grade: Object.values(byGrade).map((b) => ({ grade: b.grade, resolved: b.n, win_rate: r2((b.wins / b.n) * 100), expectancy_r: r2(b.r / b.n) })).sort((a, b) => String(a.grade).localeCompare(String(b.grade))),
  };
}

module.exports = {
  analyse, chart, scan, newsCheck, specOf, currenciesOf,
  saveSignals, savePlan, listSignals, resolveSignals, resolveAllUsers, signalStats, ensureSignalsTable,
  momentum: Momentum, smc: SMC, setup: Setup, predict: Predict, correction: Cor, candles: C, instruments: I,
};
