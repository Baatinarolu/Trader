'use strict';
/**
 * Bot API — mounted at /api/bots from routes/api.js.
 * Every endpoint is user-scoped: signals, guardrails and feedback are personal.
 */

const { asyncRouter } = require('./async-router');
const Bots = require('../bots');
const C = require('../candles');
const I = require('../instruments');
const TV = require('../tradingview');
const D = require('../db');
const Opportunities = require('../opportunities');
const NewsWindow = require('../news-window');   // M110
const TradingWindow = require('../trading-window');   // M112
const Performance = require('../performance');   // M112 — the same by_session read the analytics page shows

function createBotsRouter({ requireAuth }) {
  const router = asyncRouter();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`BOT API error on ${req.method} ${req.originalUrl}:`, err.message);
    if (res.headersSent) return;
    if(err.code==='execution_review_invalid')return res.status(err.status).json({error:err.message,code:err.code});
    if (err.code?.startsWith('guardrail_')) return res.status(err.status).json({error:err.message,code:err.code,daily:err.daily});
    if (err.code?.startsWith('state_gate_')) return res.status(err.status).json({error:err.message,code:err.code,state_gate:err.state_gate});
    /* M56 — the plan gate's own errors (an unowned plan id, a malformed one) carry their status:
     * a 404 for somebody else's plan is a real answer, not an internal failure. */
    if (err.code?.startsWith('plan_')) return res.status(err.status || 400).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message || 'Bot error' });
  });
  const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? d : Number(v));

  /* ------------------------------------------------------------- markets */

  /**
 * The trader's own minimum reward:risk. It lives in user settings (`min_rr`),
 * defaults to 1R — the line between "this pays for the risk" and "this is a
 * scenario". `?min_rr=` overrides it for a single request so a probe or a test
 * can measure the same plan against a different floor.
 */
/* M26 — the trader's own window restriction. The query wins (that is the UI's
 * selector), then the saved preference, so a bot run from the journal and the same bot
 * run from the API cannot disagree about which window is being traded. Read the way
 * floorOf reads min_rr: the restriction is per-user, so it lives in per-user settings. */
async function prefOf(req) {
  const q = req.query.session_pref;
  if (q != null && String(q).trim() !== '') return String(q).trim();
  try {
    const row = await D.db.prepare('SELECT settings FROM users WHERE id=?').get(req.user.id);
    const set = row && row.settings ? JSON.parse(row.settings) : {};
    if (set.session_pref != null && String(set.session_pref).trim() !== '') return String(set.session_pref).trim();
  } catch (e) { /* no row, no settings — no restriction */ }
  return null;
}

/* M30 — the trader's zone method: Ep 7 gives TWO (the pivot candle and the whole consolidation
 * high-to-low) and advises testing both, so WHICH one this analysis runs on is a choice. The query
 * wins (that is the selector on the bot screen, and it is what a probe measures with), then the
 * saved preference, exactly as prefOf reads the window and floorOf reads min_rr. An unrecognised
 * value is never silently applied: the pivot method runs and `setups.filters.zone_method` carries
 * the request and the sentence naming what this app can plot. */
async function zoneMethodFor(userId, requested) {
  if (requested != null && String(requested).trim() !== '') return { method: String(requested).trim(), source: 'request' };
  try {
    const row = await D.db.prepare('SELECT settings FROM users WHERE id=?').get(userId);
    const set = row && row.settings ? JSON.parse(row.settings) : {};
    if (set.zone_method != null && String(set.zone_method).trim() !== '') return { method: String(set.zone_method).trim(), source: 'settings' };
  } catch (e) { /* no row, no settings — the default geometry */ }
  return { method: null, source: 'default' };
}
const zoneMethodOf = (req) => zoneMethodFor(req.user.id, req.query.zone_method);

async function floorOf(req) {
  const q = Number(req.query.min_rr);
  if (Number.isFinite(q) && q > 0) return Math.min(Math.max(q, 0.1), 10);
  try {
    const row = await D.db.prepare('SELECT settings FROM users WHERE id=?').get(req.user.id);
    const set = row && row.settings ? JSON.parse(row.settings) : {};
    const v = Number(set.min_rr);
    if (Number.isFinite(v) && v > 0) return Math.min(Math.max(v, 0.1), 10);
  } catch (e) { /* no row, no settings — fall through to the default */ }
  return 1;
}

router.get('/markets', requireAuth, (req, res) => {
    const presets = I.PRESETS.map((p) => ({
      symbol: p.symbol, name: p.name, asset_class: p.asset_class, unit: p.unit,
      value_per_point: p.value_per_point, pip_size: p.pip_size,
      tv_symbol: TV.tvSymbol(p.symbol),
    }));
    const crypto = [];
    const seen = new Set(presets.map((p) => p.symbol));
    for (const [sym] of Object.entries(C.CRYPTO_YAHOO)) {
      if (!seen.has(sym)) { crypto.push({ symbol: sym, name: `${sym} spot`, asset_class: 'crypto', unit: 'coins', value_per_point: 1, tv_symbol: TV.tvSymbol(sym) }); seen.add(sym); }
    }
    res.json({
      ok: true,
      timeframes: C.CHART_TFS,
      default_timeframe: '15m',
      instruments: [...presets, ...crypto],
      sessions: require('../bots/smc').sessionState(),
      providers: ['OKX (crypto)', 'Yahoo Finance (fx, indices, futures, stocks, ETFs)', 'CoinGecko (crypto fallback)'],
    });
  });

  /* -------------------------------------------------------------- candles */

  router.get('/candles', requireAuth, wrap(async (req, res) => {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const tf = String(req.query.tf || '15m');
    const limit = Math.min(Math.max(num(req.query.limit, 400), 50), 1500);
    const { candles, meta } = await C.getCandles(symbol, tf, { limit, force: req.query.force === '1' });
    res.json({
      ok: true, symbol, timeframe: tf, meta,
      candles: candles.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })),
    });
  }));

  /* ------------------------------------------------------------- plan gate */

  /**
   * M56 — the written plan's gate: the vocabulary this app can actually enforce, and how each of the
   * trader's own rule lines parses. The plan editor reads this so its hint can never drift from the
   * grammar the engine runs, and the trader can see which of their lines are gating, which are prose
   * and which the app does not understand (`unrecognised`) — the last of those is the one that must
   * never look like a satisfied requirement.
   */
  router.get('/plan-gate', requireAuth, wrap(async (req, res) => {
    const PlanGate = require('../bots/plan-gate');
    const loaded = await PlanGate.safe(req.user.id, req.query.strategy_id || null);
    res.json({
      ok: true, version: PlanGate.VERSION, vocabulary: PlanGate.vocabulary(),
      state: loaded.state, plan: loaded.plan || null, note: loaded.note || null, reason: loaded.reason || null,
      candidates: loaded.candidates || null,
      counts: loaded.counts || null,
      // A stored value that cannot be read as a list of lines is a THIRD state the client must be able
      // to name: an empty checklist and an unreadable one look identical in `lines`, so the flag rides
      // beside them and the trader is told to re-save instead of reading a silent pass.
      malformed: !!loaded.malformed,
      lines: loaded.state === PlanGate.STATES.READY
        ? loaded.rules.map((r) => ({ text: r.text, kind: r.kind, fact: r.fact || null, reason: r.reason || null }))
        : [],
      limits: {
        prose_is_not_parsed: true, market_conditions_field_is_not_parsed: true, exit_rules_are_not_parsed: true,
        unknown_is_never_met: true, grade_influence: false, score_influence: false, broker_verified: false,
      },
    });
  }));

  /* -------------------------------------------------------------- analyse */

  router.get('/analyse', requireAuth, wrap(async (req, res) => {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const tf = String(req.query.tf || '15m');
    const payload = await Bots.analyse(symbol, tf, {
      userId: req.user.id,
      accountId: req.query.account_id ? Number(req.query.account_id) : null,
      includePrediction: req.query.prediction !== '0',
      predictionBars: Math.min(Math.max(num(req.query.bars, 1200), 300), 3000),
      step: Math.min(Math.max(num(req.query.step, 2), 1), 6),
      minRR: await floorOf(req),
      sessionPref: await prefOf(req),                                  // M26
      zoneMethod: (await zoneMethodOf(req)).method,                    // M30
      zoneMethodSource: (await zoneMethodOf(req)).source,               // M30 — request, settings or default
      /* M56 — which written plan this analysis is confirmed against. Optional: omitted, the gate
       * uses the trader's single active plan (and says so); a plan that is not theirs is a 404 from
       * the gate itself, never a silent fallback to somebody else's rules. */
      strategyId: req.query.strategy_id || null,
      force: req.query.force === '1',
      trim: Math.min(Math.max(num(req.query.trim, 0), 0), 400),       // bar replay: drop the last N candles
      as_of: req.query.as_of || null,                                  // bar replay: read as of this instant
    });
    let saved = null;
    if (req.query.save === '1') {saved = await Bots.saveSignals(req.user.id, payload);Object.assign(saved,await Opportunities.observeSaved(req.user.id,saved,'app_analysis'));}
    res.json({ ...payload, saved });
  }));

  /* ----------------------------------------------------------------- chart */

  /**
   * One payload for the desk chart: candles, the SMC overlay, the plan the
   * method allows, the CRT range and the three-layer stack. Deliberately the
   * same numbers the analysis used — the chart is not a second opinion.
   */
  router.get('/chart', requireAuth, wrap(async (req, res) => {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const tf = String(req.query.tf || '15m');
    const out = await Bots.chart(symbol, tf, {
      bars: Math.min(Math.max(num(req.query.bars, 400), 80), 1200),
      userId: req.user.id,
      accountId: req.query.account_id ? Number(req.query.account_id) : null,
      minRR: await floorOf(req),
      sessionPref: await prefOf(req),                                  // M26
      zoneMethod: (await zoneMethodOf(req)).method,                    // M30
      zoneMethodSource: (await zoneMethodOf(req)).source,               // M30
      strategyId: req.query.strategy_id || null,                       // M56
      trim: Math.min(Math.max(num(req.query.trim, 0), 0), 400),
      as_of: req.query.as_of || null,
    });
    res.json(out);
  }));

  /* -------------------------------------------------------------- top-down */

  /** The top-down method on its own (steps, layers, conflicts, playbook). */
  router.get('/topdown', requireAuth, wrap(async (req, res) => {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const tf = String(req.query.tf || '15m');
    const out = await Bots.chart(symbol, tf, {
      bars: Math.min(Math.max(num(req.query.bars, 300), 80), 900), userId: req.user.id,
      accountId:req.query.account_id ? Number(req.query.account_id) : null,
      sessionPref: await prefOf(req),                                  // M26
      zoneMethod: (await zoneMethodOf(req)).method,                    // M30
      zoneMethodSource: (await zoneMethodOf(req)).source,               // M30
      trim: Math.min(Math.max(num(req.query.trim, 0), 0), 400), as_of: req.query.as_of || null,
    });
    res.json({
      ok: true, symbol: out.symbol, timeframe: out.timeframe,
      generated_at: out.generated_at,
      method: out.topdown.method, layers: out.topdown.layers, steps: out.topdown.steps,
      checks: out.topdown.checks, score: out.topdown.score, grade: out.topdown.grade,
      status: out.topdown.status, direction: out.topdown.direction,
      headline: out.topdown.headline, playbook: out.topdown.playbook,
      blocked: out.topdown.blocked || !!out.now?.execution_permission && !out.now.execution_permission.allowed, market_blocked:out.topdown.blocked, execution_permission:out.now?.execution_permission, conflicts: out.topdown.conflicts,
      crt_plan: out.topdown.crt_plan, target_sources: out.topdown.target_sources, levels: out.topdown.levels, inputs: out.topdown.inputs,
      verdict: out.setups.verdict, meta: out.meta,
    });
  }));

  /* ----------------------------------------------------------------- scan */

  router.get('/scan', requireAuth, wrap(async (req, res) => {
    const symbols = String(req.query.symbols || req.query.symbol || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (!symbols.length) return res.status(400).json({ error: 'symbols is required (comma separated)' });
    const tf = String(req.query.tf || '15m');
    const zm = await zoneMethodOf(req);                                                                                          // M30
    const out = await Bots.scan(symbols, tf, { userId: req.user.id, accountId:req.query.account_id ? Number(req.query.account_id) : null, sessionPref: await prefOf(req), strategyId: req.query.strategy_id || null, zoneMethod: zm.method, zoneMethodSource: zm.source });  // M26/M56/M30
    res.json(out);
  }));

  /* ------------------------------------------------------------ prediction */

  router.get('/predict', requireAuth, wrap(async (req, res) => {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const tf = String(req.query.tf || '15m');
    const out = await Bots.predict.predict(symbol, tf, {
      bars: Math.min(Math.max(num(req.query.bars, 1200), 300), 3000),
      step: Math.min(Math.max(num(req.query.step, 2), 1), 6),
      horizon: Math.min(Math.max(num(req.query.horizon, 20), 5), 200),
      exit: req.query.exit ? String(req.query.exit) : null,
      sniper: req.query.sniper === '1',
      force: req.query.force === '1',
    });
    res.json({
      ok: out.ok, symbol: out.symbol, timeframe: out.timeframe, quote: out.quote,
      direction: out.direction, setups: out.setups, buy: out.buy, sell: out.sell,
      model: out.model, backtest: out.backtest, summary: out.summary, exit_profile: out.exit_profile,
      samples: Bots.predict.sampleTable({ samples: [] }, 0), // kept out of payload by default
      generated_at: out.generated_at,
    });
  }));

  /** Backtest detail (with the trade-by-trade sample table). */
  router.get('/backtest', requireAuth, wrap(async (req, res) => {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const tf = String(req.query.tf || '15m');
    const bt = await Bots.predict.backtest(symbol, tf, {
      bars: Math.min(Math.max(num(req.query.bars, 1200), 300), 3000),
      step: Math.min(Math.max(num(req.query.step, 2), 1), 6),
      entry: ['mid', 'deep', 'leg', 'ote', 'mtf'].includes(req.query.entry) ? req.query.entry : 'entry',
      mtf: req.query.mtf ? String(req.query.mtf) : null,
      cost: ['flat', 'instrument'].includes(String(req.query.cost)) ? String(req.query.cost) : 'instrument',
      force: req.query.force === '1',
    });
    res.json({
      ok: bt.ok, symbol: bt.symbol, timeframe: bt.timeframe, meta: bt.meta, counts: bt.counts,
      base_rate: bt.base_rate, expectancy_r: bt.expectancy_r, hold_to_target_expectancy_r: bt.hold_to_target_expectancy_r,
      partial_rate: bt.partial_rate, runner_rate: bt.runner_rate,
      by_grade: bt.by_grade, by_direction: bt.by_direction, model: bt.model,
      profiles: bt.profiles, frontier: bt.frontier, best_exit: bt.best_exit, verdict: bt.verdict, second_chance: bt.second_chance, filters: bt.filters, quality_ladder: bt.quality_ladder, gate_sets: bt.gate_sets, per_gate: bt.per_gate,
      target_frontier: bt.target_frontier, frontier_views: bt.frontier_views, default_view: bt.default_view || 'all', presets: bt.presets, measured_rules_at: bt.measured_rules_at,
      out_of_sample: bt.out_of_sample, calibration: bt.calibration,
      trades: Bots.predict.sampleTable(bt, Math.min(num(req.query.samples, 30), 100)),
      cached: bt.cached,
    });
  }));

  /* ------------------------------------------------------------ correction */

  router.get('/correction', requireAuth, wrap(async (req, res) => {
    const out = await Bots.correction.analyse(req.user.id, {
      accountId: req.query.account_id ? Number(req.query.account_id) : null,
      days: Math.min(Math.max(num(req.query.days, 365), 7), 2000),
      backfill: req.query.backfill === '1',
    });
    out.behavior_days=await require('../behavior-days').optional(req.user.id,{accountId:req.query.account_id??null,from:req.query.from??null,to:req.query.to??null});
    res.json({ ok: true, ...out });
  }));

  router.post('/correction/backfill', requireAuth, wrap(async (req, res) => {
    const value=req.body?.account_id;
    if(value!==undefined && !(typeof value==='number'&&Number.isSafeInteger(value)&&value>0))return res.status(400).json({error:'account_id must be a positive whole number when selected.'});
    const out = await Bots.correction.backfillGrades(req.user.id,{accountId:value===undefined?null:value});
    res.json({ ok: true, ...out });
  }));

  router.get('/guardrails', requireAuth, wrap(async (req, res) => {
    const accountId = req.query.account_id ? Number(req.query.account_id) : null;
    const daily = await Bots.correction.dailyState(req.user.id, { accountId, entryTf:req.query.entry_tf || null, forEntry:true });
    if (daily.status === 'unknown') return res.status(503).json({error:daily.message,code:'guardrail_unavailable',daily});
    const g = daily.guardrails;
    res.json({ ok: true, guardrails: g.guardrails, stats: g.stats, evidence: g.evidence, daily });
  }));

  router.get('/feedback/:tradeId', requireAuth, wrap(async (req, res) => {
    const { db } = require('../db');
    const trade = await db.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(Number(req.params.tradeId), req.user.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    const g = await Bots.correction.guardrails(req.user.id, { accountId: trade.account_id });
    const siblings = await Bots.correction.loadTrades(req.user.id, { days: 30, accountId: trade.account_id });
    const fb = Bots.correction.feedback(trade, { guardrails: g, siblings });
    res.json({ ok: true, ...fb });
  }));

  /* --------------------------------------------------------------- signals */

  router.get('/signals', requireAuth, wrap(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    res.json({ ok: true, signals: await Bots.listSignals(req.user.id, { status, limit: Math.min(num(req.query.limit, 50), 200) }), stats: await Bots.signalStats(req.user.id),opportunity_review:await Opportunities.optional(req.user.id,{accountId:req.query.account_id??null}) });
  }));

  router.post('/signals/save', requireAuth, wrap(async (req, res) => {
    const symbol = String((req.body && req.body.symbol) || '').toUpperCase();
    const tf = String((req.body && req.body.timeframe) || '15m');
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const payload = await Bots.analyse(symbol, tf, {
      userId: req.user.id,
      accountId: (req.body && req.body.account_id) || null,
      includePrediction: req.body && req.body.prediction !== false,
      /* M30 — saving a signal stores the read that was made, so it is made with the trader's own
       * zone method. Reading the preference here (rather than taking the client's word for it) is
       * the same rule the window and the plan already follow on this route. */
      zoneMethod: (await zoneMethodOf(req)).method,
      zoneMethodSource: (await zoneMethodOf(req)).source,
    });
    const saved = await Bots.saveSignals(req.user.id, payload, {accountId:req.body?.account_id || null,research_only:req.body?.research_only === true,override_reason:req.body?.override_reason});
    Object.assign(saved,await Opportunities.observeSaved(req.user.id,saved,'app_analysis'));
    res.json({ ok: true, saved, permission:saved.permission || null, headline: payload.headline, setups: payload.setups.verdict });
  }));

  /**
   * Save a refined plan exactly as it was shown (the lower-timeframe
   * confirmation re-anchors entry/stop, so it is not the HTF plan anymore).
   */
  router.post('/signals/save-plan', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    try {
      const E = require('../bots/entry-models'), model = E.normaliseName(b.entry_model);
      E.encodeEvidence(b.entry_evidence, model, b.entry_tf);
    }
    catch (e) { return res.status(400).json({ error: e.message }); }
    if (b.stop_policy) {
      try { require('../bots/stops').check(b.stop_policy, Number(b.stop), b.entry_tf); }
      catch (e) { return res.status(400).json({ error: e.message }); }
    }
    if (b.entry_preference) {
      try {
        require('../bots/entry-preference').check(b.entry_preference, b.entry_tf, Number(b.stop) < Number(b.entry) ? 1 : -1);
        const evidence = typeof b.entry_evidence === 'string' ? JSON.parse(b.entry_evidence) : b.entry_evidence;
        if (evidence && evidence.entry_preference && !require('../bots/entry-preference').same(evidence.entry_preference, b.entry_preference))
          throw new Error('entry_preference contradicts the named entry_evidence snapshot');
      } catch (e) { return res.status(400).json({ error: e.message }); }
    }
    const out = await Bots.savePlan(req.user.id, {
      symbol: b.symbol, timeframe: b.timeframe, entry: b.entry, stop: b.stop,
      targets: b.targets, t1: b.t1, t2: b.t2, grade: b.grade, score: b.score, p_win: b.p_win,
      account_id:b.account_id || null, research_only:b.research_only === true, override_reason:b.override_reason, mechanics: b.mechanics, note: b.note, entry_model: b.entry_model, entry_tf: b.entry_tf, entry_evidence: b.entry_evidence, entry_mode: b.entry_mode, mtf_tf: b.mtf_tf, risk_atr: b.risk_atr, target_policy: b.target_policy, stop_policy: b.stop_policy, entry_preference: b.entry_preference,
    });
    const opportunity=await Opportunities.observeSaved(req.user.id,out,'app_declared_plan');
    res.json({ ...opportunity,ok: out.saved > 0, saved: out.saved, ids: out.ids || [], reason: out.reason || null,permission:out.permission || null });
  }));

  router.post('/signals/resolve', requireAuth, wrap(async (req, res) => {
    const out = await Bots.resolveSignals(req.user.id, { limit: Math.min(num(req.body && req.body.limit, 20), 60) });
    res.json({ ok: true, ...out });
  }));

  router.get('/signals/stats', requireAuth, wrap(async (req, res) => res.json({ ok: true, ...(await Bots.signalStats(req.user.id)) })));


  /* ================================================================ TradingView
   * Out: embed configs + chart links (the widgets themselves run in the browser).
   * In : a public webhook that turns TradingView alerts into analysed ideas.
   * ======================================================================== */

  /** Widget payloads + deep links for a symbol (the frontend embeds the official chart). */
  router.get('/tv/config', requireAuth, (req, res) => {
    const symbol = String(req.query.symbol || 'XAUUSD').toUpperCase();
    const tf = String(req.query.tf || '15m');
    res.json({
      ok: true, symbol, timeframe: tf,
      tv_symbol: TV.tvSymbol(symbol),
      links: TV.links(symbol),
      advanced: TV.advancedChart({ symbol, tf, studies: String(req.query.studies || '').split(',').filter(Boolean) }),
      mini: TV.miniChart({ symbol }),
      tape: TV.tickerTape({}),
      interval: TV.TF_TO_TV[tf] || '15',
    });
  });

  /** Everything the Settings → Integrations panel needs. */
  router.get('/webhook', requireAuth, wrap(async (req, res) => {
    const row = await D.getOrCreateWebhookToken(req.user.id);
    const alerts = await D.db.prepare('SELECT id, tv_symbol, symbol, action, price, timeframe, received_at, handled, error, result, signal_id FROM tv_alerts WHERE user_id=? ORDER BY id DESC LIMIT 8').all(req.user.id);
    const stats = await D.db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN error IS NULL THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) AS analysed FROM tv_alerts WHERE user_id=?`).get(req.user.id);
    const base = `${req.protocol}://${req.get('host')}`;
    res.json({
      ok: true,
      token: row.token,
      url: `${base}/api/bots/webhook/tradingview?token=${row.token}`,
      analyse: !!row.analyse,
      autocreate: !!row.autocreate,
      label: row.label,
      uses: row.uses, last_used_at: row.last_used_at,
      stats: { total: stats.total || 0, ok: stats.ok || 0, analysed: stats.analysed || 0 },
      // M56 — `result` is stored as JSON TEXT, and the Settings panel reads `r.action`, `r.grade` and now
      // the plan gate off it. The sibling `/bots/alerts` route already parses it; leaving this one raw
      // meant the alert-verdict column could never render anything but a dash, and a plan refusal stored
      // here would have been invisible on the only screen that shows the alert history.
      alerts: alerts.map((a) => ({ ...a, result: safeJson(a.result) })),
      sample_text: 'BUY {{ticker}} @ {{close}} {{interval}}',
      sample_json: '{"symbol":"{{ticker}}","action":"{{strategy.order.action}}","price":"{{close}}","tf":"{{interval}}","time":"{{timenow}}"}',
    });
  }));

  /** Toggle what happens to incoming alerts. */
  router.post('/webhook', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    const row = await D.setWebhookOptions(req.user.id, { analyse: b.analyse, autocreate: b.autocreate, label: b.label });
    res.json({ ok: true, analyse: !!row.analyse, autocreate: !!row.autocreate, label: row.label });
  }));

  /** Burn the token and issue a new URL. */
  router.post('/webhook/rotate', requireAuth, wrap(async (req, res) => {
    const row = await D.rotateWebhookToken(req.user.id);
    res.json({ ok: true, token: row.token, url: `${req.protocol}://${req.get('host')}/api/bots/webhook/tradingview?token=${row.token}` });
  }));

  /** Recent alerts + their bot verdict. */
  router.get('/alerts', requireAuth, wrap(async (req, res) => {
    const limit = Math.min(num(req.query.limit, 25), 200);
    const rows = await D.db.prepare('SELECT * FROM tv_alerts WHERE user_id=? ORDER BY id DESC LIMIT ?').all(req.user.id, limit);
    res.json({
      ok: true,
      alerts: rows.map((r) => ({
        id: r.id, symbol: r.symbol, tv_symbol: r.tv_symbol, action: r.action, price: r.price,
        timeframe: r.timeframe, received_at: r.received_at, handled: !!r.handled, error: r.error,
        result: safeJson(r.result), note: r.note, signal_id: r.signal_id,
      })),
    });
  }));

  router.post('/alerts/clear', requireAuth, wrap(async (req, res) => {
    const info = await D.db.prepare('DELETE FROM tv_alerts WHERE user_id=?').run(req.user.id);
    res.json({ ok: true, deleted: info.changes });
  }));

  /**
   * PUBLIC alert receiver.
   * TradingView posts here (Alert → Notifications → Webhook URL). No session —
   * the token in the query string identifies the workspace.
   */
  router.post('/webhook/tradingview', readBody, wrap(async (req, res) => {
    const q = req.query || {};
    const rawBody = (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) && Object.keys(req.body).length)
      ? req.body
      : (req.rawBody || '');
    const token = q.token || q.key || req.get('x-webhook-token') ||
      (rawBody && typeof rawBody === 'object' ? (rawBody.token || rawBody.secret || rawBody.key) : null);
    const user = await D.userFromWebhookToken(token);
    if (!user) return res.status(401).json({ ok: false, error: 'Invalid or missing webhook token' });

    // cheap flood guard: 240 alerts/hour/token
    const recent = (await D.db.prepare("SELECT COUNT(*) AS n FROM tv_alerts WHERE user_id=? AND received_at > datetime('now','-1 hour')").get(user.id)).n;
    if (recent >= 240) return res.status(429).json({ ok: false, error: 'Too many alerts in the last hour' });

    const parsed = TV.parseAlert(rawBody);
    const info = await D.db.prepare(`INSERT INTO tv_alerts
      (user_id, tv_symbol, symbol, known, action, price, timeframe, note, raw, alert_time)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      user.id, parsed.tv_symbol || '', parsed.symbol || '', parsed.known ? 1 : 0,
      parsed.action || '', parsed.price, parsed.timeframe || '', parsed.note || '',
      (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {})).slice(0, 4000),
      parsed.time);

    if (!parsed.ok) {
      await D.db.prepare('UPDATE tv_alerts SET error=? WHERE id=?').run('Could not find a symbol in the alert body', info.lastInsertRowid);
      return res.status(200).json({ ok: false, alert_id: Number(info.lastInsertRowid), error: 'Could not find a symbol in the alert body', hint: 'Send {"symbol":"XAUUSD","action":"buy","price":4244.8,"tf":"15m"} or "BUY XAUUSD @ 4244.8 15m"' });
    }

    const tf = parsed.timeframe || '15m';
    let plan = null, signal = null, error = null;
    if (user.analyse && !/^close$/i.test(parsed.action)) {
      try {
        /* M30 — an incoming alert is read with the trader's own zone method too: the alert does not
         * carry a geometry, and the signal it may create is the same signal the bot screen would. */
        const alertZone = await zoneMethodFor(user.id, null);
        const payload = await Bots.analyse(parsed.symbol, tf, { userId: user.id, includePrediction: false, bars: 600,
          zoneMethod: alertZone.method, zoneMethodSource: alertZone.source });
        plan = summarise(payload, parsed);
        if (user.autocreate && payload.setups && payload.setups.verdict && payload.setups.verdict.action !== 'NO TRADE') {
          const saved = await Bots.saveSignals(user.id, payload);
          Object.assign(saved,await Opportunities.observeSaved(user.id,saved,'app_analysis'));
          signal = saved && saved.saved ? saved.saved[0] : (Array.isArray(saved) ? saved[0] : saved);
        }
      } catch (e) { error = e.message; }
    }
    const result = plan || (error ? { error } : { skipped: 'analysis off' });
    await D.db.prepare('UPDATE tv_alerts SET handled=1, error=?, signal_id=?, result=? WHERE id=?')
      .run(error, signal && signal.id ? signal.id : null, boundedResult(result), info.lastInsertRowid);

    res.json({
      ok: true, alert_id: Number(info.lastInsertRowid),
      received: { symbol: parsed.symbol, action: parsed.action, price: parsed.price, timeframe: tf, tv_symbol: parsed.tv_symbol },
      plan,
      signal_id: signal && signal.id ? signal.id : null,
      error,
    });
  }));

  /** Helpers used by the two routes above. */
  /* A stored verdict must always be PARSEABLE. This column used to be `JSON.stringify(result).slice(0, 4000)`,
   * which is not a cap on a payload: it is a cap on a JSON DOCUMENT, and a payload that crossed it was
   * written as text nothing could read back — this route's own `safeJson`, and therefore the Settings
   * verdict column, silently went blank (measured: a refusal carrying both the plan gate and the zone
   * method serialises past 4 000 characters). The cap stays — a row is not a data store — but what
   * shrinks is the DETAIL, never the document: optional blocks are dropped one at a time, largest and
   * most verbose first, each drop is named in `truncated_fields`, and the keys a verdict is read by
   * (`action`, `grade`, `plan_gate.state`, `zone_method.method`) are never among them. If even the bare
   * verdict could not fit, that is SAID rather than stored as unparseable text. */
  function boundedResult(result, limit = 4000) {
    /* Which keys may be dropped, by NAME and wherever they sit: a verdict's optional verbosity lives in
     * sentences and lists (`note`, `sources`, `enforced_lines`, `candidates`, …), while the facts it is
     * read by — `action`, `grade`, `state`, `method`, `plan`, `refused_now` — are never in this set. The
     * chooser is mechanical and terminates: the largest optional branch is dropped first, then the next,
     * and every drop is named in `truncated_fields`. */
    const OPTIONAL_KEYS = new Set(['note', 'notes', 'basis', 'sources', 'vocabulary', 'enforced_lines', 'unverifiable_lines',
      'unrecognised_lines', 'candidates', 'counts', 'targets', 'whynot', 'playbook', 'lines', 'rules', 'detail', 'text',
      'limits', 'conflicts', 'checks', 'steps', 'blocks', 'samples']);
    const copy = JSON.parse(JSON.stringify(result || {}));
    const paths = [];
    (function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      for (const k of Object.keys(node)) {
        let v; try { v = node[k]; } catch (e) { continue; }
        const p = path.concat(k);
        if (OPTIONAL_KEYS.has(k)) { let size = 0; try { size = JSON.stringify(v === undefined ? null : v).length; } catch (e) { size = 0; } paths.push({ p, size }); }
        walk(v, p);
      }
    })(copy, []);
    paths.sort((a, b) => b.size - a.size);
    const dropped = [];
    let text = JSON.stringify(copy);
    for (const { p } of paths) {
      if (text.length <= limit) break;
      let node = copy;
      for (const k of p.slice(0, -1)) node = node && typeof node === 'object' ? node[k] : null;
      if (!node || typeof node !== 'object' || !(p[p.length - 1] in node)) continue;
      delete node[p[p.length - 1]];
      dropped.push(p.join('.'));
      text = JSON.stringify(copy);
    }
    if (dropped.length) copy.truncated_fields = dropped;
    text = JSON.stringify(copy);
    if (text.length > limit) {
      /* Nothing optional left to drop: keep the facts a verdict is read by and say the rest was dropped. */
      const bare = { action: copy.action || null, grade: copy.grade == null ? null : copy.grade,
        error: 'the stored verdict exceeded the column and was reduced to its verdict fields',
        truncated_fields: dropped.concat(['__all_optional__']) };
      if (copy.plan_gate) bare.plan_gate = { state: copy.plan_gate.state || null, enforced: copy.plan_gate.enforced == null ? null : copy.plan_gate.enforced,
        refused_now: !!copy.plan_gate.refused_now, plan: copy.plan_gate.plan || null };
      if (copy.zone_method) bare.zone_method = { method: copy.zone_method.method || null, source: copy.zone_method.source || null };
      text = JSON.stringify(bare);
    }
    return text.slice(0, limit);
  }

  function summarise(payload, parsed) {
    const h = payload.headline || {};
    const v = (payload.setups && payload.setups.verdict) || {};
    const mv = payload.method_verdict || null;
    const best = (v.best || (payload.setups && payload.setups.candidates && payload.setups.candidates[0])) || null;
    return {
      // the method decides: when it has not fired, the alert is graded as a stand-down
      action: (mv && mv.blocked) ? 'NO TRADE' : (v.action || h.action || 'NO TRADE'),
      setup_action: v.action || null,
      method: mv ? {
        status: mv.status, direction: mv.direction, blocked: mv.blocked,
        headline: mv.headline, pending_step: mv.pending_step ? mv.pending_step.title : null,
        conviction: mv.conviction || null,
        playbook: (mv.playbook || []).slice(0, 3),
      } : null,
      grade: h.grade || v.grade || null,
      score: h.score != null ? h.score : (best ? best.score : null),
      mechanics: h.mechanics != null ? h.mechanics : null,
      text: h.text || '',
      entry: best && best.levels ? best.levels.entry : null,
      stop: best && best.levels ? best.levels.stop : null,
      targets: best && best.levels ? best.levels.targets : [],
      rr: best && best.levels ? best.levels.rr_final : null,
      whynot: (v.why_not || []).slice(0, 4),
      /* M56 — the incoming alert is analysed like any other read, so the trader's written plan gates it
       * too. It travels WITH the alert (rather than only inside the analysis nobody stores): a NO TRADE in
       * the alert history that the plan caused must name the plan, its version and the line that refused,
       * or the trader is left reading an unattributed stand-down. `null` when no plan was consulted. */
      plan_gate: (payload.setups && payload.setups.filters && payload.setups.filters.plan_gate) || null,
      /* M30 — and the GEOMETRY it was read on. An alert is the one analysis the trader did not watch
       * being made, so the alert history is exactly where "which zone method produced this verdict?"
       * must be answerable without re-running anything: the method travels with the stored result,
       * `null` when the read never reached the zone stage. */
      zone_method: (payload.setups && payload.setups.filters && payload.setups.filters.zone_method) || null,
      agreement: agreement(parsed, v.action, best),
      generated_at: payload.generated_at || new Date().toISOString(),
    };
  }

  /** Does the bot agree with the alert that triggered it? */
  function agreement(parsed, verdictAction, best) {
    const alert = String((parsed && parsed.action) || '').toLowerCase();
    if (!alert) return 'unknown';
    if (!verdictAction || verdictAction === 'NO TRADE') return 'bot says stand down';
    const side = alert === 'close' ? 'close' : alert === 'sell' ? 'sell' : alert === 'buy' ? 'buy' : 'unknown';
    if (side === 'unknown') return 'unknown';
    if (side === 'close') return 'position management';
    // verdict actions arrive upper-cased ("BUY"/"SELL"/"NO TRADE")
    const verdict = String(verdictAction || '').toLowerCase();
    return side === verdict ? 'agrees' : 'conflicts';
  }

  /** Read the raw body for text/plain webhooks (express.json only parses JSON). */
  function readBody(req, res, next) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) && Object.keys(req.body).length) return next();
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 64 * 1024) { data = data.slice(0, 64 * 1024); req.destroy(); } });
    req.on('end', () => { req.rawBody = data; next(); });
    req.on('error', () => { req.rawBody = ''; next(); });
  }

  function safeJson(v) { if (!v) return null; try { return JSON.parse(v); } catch { return null; } }

  /* ---------------------------------------------------------------- misc */

  /* M110 — the news endpoint takes the SAME two settings the engine uses, never one number.
   * `?before=` / `?after=` are per-request research overrides and go through the owner
   * module's parser (so the settle floor applies here too); omitted fields fall back to the
   * trader's own stored pair, resolved exactly the way the analyse path resolves its account.
   * The old `?window=N` is REFUSED rather than silently split: choosing a side for the caller
   * is how a 5-minute setting used to shorten the 30–60 minute settle. */
  router.get('/news/:symbol', requireAuth, wrap(async (req, res) => {
    // Every spelling of the old single knob is refused here, not just `?window=`: a legacy client
    // that still sends one number must be told the rule was split, not silently served the stored
    // pair (which would make a 5-minute caller believe 5 minutes was applied).
    if (NewsWindow.LEGACY_SINGLE.some((k) => req.query[k] !== undefined)) {
      return res.status(400).json({
        error: 'One number no longer sets both sides of the news rule. Use ?before= for the pre-release block and ?after= for the post-release settle (floor 30 minutes), or leave both out to use the account settings.',
        code: 'news_window_split_required',
      });
    }
    const account = await Bots.correction.accountOf(req.user.id, req.query.account_id ? Number(req.query.account_id) : null);
    let pair;
    try {
      pair = NewsWindow.parsePair(
        { news_block_before_min: req.query.before, news_settle_after_min: req.query.after },
        NewsWindow.plan(account),
      );
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message, code: e.code || 'news_window_invalid' });
    }
    res.json({ ok: true, ...(await Bots.newsCheck(String(req.params.symbol).toUpperCase(), pair)), settings: NewsWindow.noteFor(pair, pair.warnings) });
  }));

  /* M112 — the trading window: the trader's own best-hours boundary, and the ONE derived
   * suggestion the data implies. Both endpoints are read-only about the market and about the
   * journal: nothing here touches a broker, a candle, a signal or another trader's desk. */
  const windowNowMs = () => Date.now();
  const windowStateFor = (account) => TradingWindow.safeState({ start: account.window_start, end: account.window_end,
    timezone: account.window_timezone, ownedZone: account.routine_timezone, source: account.window_source, nowMs: windowNowMs() });
  const windowSuggestionFor = async (account) => {
    const rows = await D.db.prepare('SELECT * FROM trades WHERE user_id=? AND account_id=?').all(account.user_id, account.id);
    return Performance.windowSuggestion(rows, { zone: account.routine_timezone || null });
  };

  /** GET /api/bots/window — the stored window, the live state and the labelled suggestion. */
  router.get('/window', requireAuth, wrap(async (req, res) => {
    const account = await Bots.correction.accountOf(req.user.id, req.query.account_id ? Number(req.query.account_id) : null);
    if (!account || !account.id) return res.status(404).json({ error: 'Account not found' });
    const state = windowStateFor(account);
    res.json({ ok: true, account_id: account.id, owned_timezone: account.routine_timezone || null,
      ...state, suggestion: await windowSuggestionFor(account),
      settings: TradingWindow.noteFor(state), doctrine: TradingWindow.DOCTRINE, basis: TradingWindow.BASIS,
      limits: { read_only: true, writes: 0, grants_permission: false, predicts: false, infers_a_window: false } });
  }));

  /** PUT /api/bots/window — set, accept or clear the window. The trader is always the author:
   * `from_session_history` is recorded ONLY when the submitted pair is exactly the candidate this
   * account derives right now, so a derived window can never be mislabelled as typed (or the other
   * way round). A clear writes four NULLs and blocks nothing. */
  router.put('/window', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    const account = await Bots.correction.accountOf(req.user.id, b.account_id !== undefined ? Number(b.account_id) : null);
    if (!account || !account.id) return res.status(404).json({ error: 'Account not found' });
    const ownedZone = account.routine_timezone || null;
    let pair;
    try { pair = TradingWindow.parsePair({ window_start: b.window_start, window_end: b.window_end, window_timezone: b.window_timezone === undefined ? ownedZone : b.window_timezone }); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message, code: e.code || 'trading_window_invalid' }); }
    if (b.accept_suggestion) {
      const suggestion = await windowSuggestionFor(account);
      if (!suggestion.available) return res.status(409).json({ error: suggestion.reason_detail, code: 'trading_window_suggestion_unavailable', suggestion });
      pair = TradingWindow.parsePair({ window_start: suggestion.window.start, window_end: suggestion.window.end, window_timezone: suggestion.window.timezone });
    } else if (!pair.set) {
      // An explicit clear. It is a real choice: no window selected blocks nothing, and it is
      // reported as `unset` rather than as an empty window or a silent pass.
      const at = new Date().toISOString();
      await D.db.prepare('UPDATE accounts SET window_start=NULL, window_end=NULL, window_timezone=NULL, window_source=NULL WHERE id=? AND user_id=?').run(account.id, req.user.id);
      const cleared = { ...account, window_start: null, window_end: null, window_timezone: null, window_source: null };
      return res.json({ ok: true, account_id: account.id, cleared_at: at, ...windowStateFor(cleared), settings: TradingWindow.noteFor(windowStateFor(cleared)) });
    }
    // The account's OWN zone is the precondition: judged first, so a trader who has not selected
    // one is told to select it (409, with the repair named) rather than being handed a complaint
    // about the zone they did or did not type. Only then is the supplied zone itself validated.
    if (pair.set && !ownedZone) {
      return res.status(409).json({ error: 'Select your own local window/timezone first (routine schedule), then save the trading window. No zone is inferred from the server clock, a session label or an offset.', code: 'trading_window_zone_required' });
    }
    if (pair.set && !TradingWindow.zoneOk(pair.timezone)) {
      return res.status(400).json({ error: 'Select a valid IANA timezone (for example Africa/Lagos) with the window. The app will not place your boundary on a zone it cannot resolve.', code: 'trading_window_zone_invalid' });
    }
    if (pair.set && pair.timezone !== ownedZone) {
      return res.status(409).json({ error: `This account\u2019s selected local timezone is ${ownedZone}. A trading window is expressed in that one zone, so the boundary cannot sit on a different clock: change the routine timezone first, or set the window in ${ownedZone}.`, code: 'trading_window_zone_not_owned' });
    }
    const suggestion = await windowSuggestionFor(account);
    const derived = !!suggestion.available && suggestion.window.start === pair.start && suggestion.window.end === pair.end && suggestion.window.timezone === pair.timezone;
    const source = derived ? TradingWindow.SOURCES.FROM_HISTORY : TradingWindow.SOURCES.MANUAL;
    await D.db.prepare('UPDATE accounts SET window_start=?, window_end=?, window_timezone=?, window_source=? WHERE id=? AND user_id=?')
      .run(pair.start, pair.end, pair.timezone, source, account.id, req.user.id);
    const saved = { ...account, window_start: pair.start, window_end: pair.end, window_timezone: pair.timezone, window_source: source };
    const state = windowStateFor(saved);
    res.json({ ok: true, account_id: account.id, saved_at: new Date().toISOString(), source, derived_current_suggestion: derived,
      ...state, suggestion, settings: TradingWindow.noteFor(state), limits: { writes: 1, grants_permission: false, predicts: false } });
  }));

  router.get('/tv/links', requireAuth, (req, res) => {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    res.json({ ok: true, ...TV.links(symbol), timeframe: String(req.query.tf || '15m') });
  });

  router.get('/sessions', requireAuth, (req, res) => {
    res.json({ ok: true, ...require('../bots/smc').sessionState() });
  });

  return router;
}

module.exports = createBotsRouter;
