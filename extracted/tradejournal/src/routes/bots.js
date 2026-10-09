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

function createBotsRouter({ requireAuth }) {
  const router = asyncRouter();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`BOT API error on ${req.method} ${req.originalUrl}:`, err.message);
    if (res.headersSent) return;
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
async function floorOf(req) {
  const q = Number(req.query.min_rr);
  if (Number.isFinite(q) && q > 0) return Math.min(Math.max(q, 0.1), 10);
  try {
    const row = await db.prepare('SELECT settings FROM users WHERE id=?').get(req.user.id);
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
      force: req.query.force === '1',
      trim: Math.min(Math.max(num(req.query.trim, 0), 0), 400),       // bar replay: drop the last N candles
      as_of: req.query.as_of || null,                                  // bar replay: read as of this instant
    });
    let saved = null;
    if (req.query.save === '1') saved = await Bots.saveSignals(req.user.id, payload);
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
      trim: Math.min(Math.max(num(req.query.trim, 0), 0), 400), as_of: req.query.as_of || null,
    });
    res.json({
      ok: true, symbol: out.symbol, timeframe: out.timeframe,
      generated_at: out.generated_at,
      method: out.topdown.method, layers: out.topdown.layers, steps: out.topdown.steps,
      checks: out.topdown.checks, score: out.topdown.score, grade: out.topdown.grade,
      status: out.topdown.status, direction: out.topdown.direction,
      headline: out.topdown.headline, playbook: out.topdown.playbook,
      blocked: out.topdown.blocked, conflicts: out.topdown.conflicts,
      crt_plan: out.topdown.crt_plan, levels: out.topdown.levels, inputs: out.topdown.inputs,
      verdict: out.setups.verdict, meta: out.meta,
    });
  }));

  /* ----------------------------------------------------------------- scan */

  router.get('/scan', requireAuth, wrap(async (req, res) => {
    const symbols = String(req.query.symbols || req.query.symbol || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (!symbols.length) return res.status(400).json({ error: 'symbols is required (comma separated)' });
    const tf = String(req.query.tf || '15m');
    const out = await Bots.scan(symbols, tf, { userId: req.user.id });
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
    res.json({ ok: true, ...out });
  }));

  router.post('/correction/backfill', requireAuth, wrap(async (req, res) => {
    const out = await Bots.correction.backfillGrades(req.user.id);
    res.json({ ok: true, ...out });
  }));

  router.get('/guardrails', requireAuth, wrap(async (req, res) => {
    const accountId = req.query.account_id ? Number(req.query.account_id) : null;
    const g = await Bots.correction.guardrails(req.user.id, { accountId });
    const daily = await Bots.correction.dailyState(req.user.id, { accountId });
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
    res.json({ ok: true, signals: await Bots.listSignals(req.user.id, { status, limit: Math.min(num(req.query.limit, 50), 200) }), stats: await Bots.signalStats(req.user.id) });
  }));

  router.post('/signals/save', requireAuth, wrap(async (req, res) => {
    const symbol = String((req.body && req.body.symbol) || '').toUpperCase();
    const tf = String((req.body && req.body.timeframe) || '15m');
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const payload = await Bots.analyse(symbol, tf, {
      userId: req.user.id,
      accountId: (req.body && req.body.account_id) || null,
      includePrediction: req.body && req.body.prediction !== false,
    });
    const saved = await Bots.saveSignals(req.user.id, payload);
    res.json({ ok: true, saved, headline: payload.headline, setups: payload.setups.verdict });
  }));

  /**
   * Save a refined plan exactly as it was shown (the lower-timeframe
   * confirmation re-anchors entry/stop, so it is not the HTF plan anymore).
   */
  router.post('/signals/save-plan', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    const out = await Bots.savePlan(req.user.id, {
      symbol: b.symbol, timeframe: b.timeframe, entry: b.entry, stop: b.stop,
      targets: b.targets, t1: b.t1, t2: b.t2, grade: b.grade, score: b.score, p_win: b.p_win,
      mechanics: b.mechanics, note: b.note, entry_mode: b.entry_mode, mtf_tf: b.mtf_tf, risk_atr: b.risk_atr,
    });
    res.json({ ok: out.saved > 0, saved: out.saved, ids: out.ids || [], reason: out.reason || null });
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
    const alerts = await D.db.prepare('SELECT id, tv_symbol, symbol, action, price, timeframe, received_at, handled, error, result FROM tv_alerts WHERE user_id=? ORDER BY id DESC LIMIT 8').all(req.user.id);
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
      sample_text: 'BUY {{ticker}} @ {{close}} {{interval}}',
      sample_json: '{"symbol":"{{ticker}}","action":"{{strategy.order.action}}","price":"{{close}}","tf":"{{interval}}","time":"{{timenow}}"}',
      alerts,
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
        const payload = await Bots.analyse(parsed.symbol, tf, { userId: user.id, includePrediction: false, bars: 600 });
        plan = summarise(payload, parsed);
        if (user.autocreate && payload.setups && payload.setups.verdict && payload.setups.verdict.action !== 'NO TRADE') {
          const saved = await Bots.saveSignals(user.id, payload);
          signal = saved && saved.saved ? saved.saved[0] : (Array.isArray(saved) ? saved[0] : saved);
        }
      } catch (e) { error = e.message; }
    }
    const result = plan || (error ? { error } : { skipped: 'analysis off' });
    await D.db.prepare('UPDATE tv_alerts SET handled=1, error=?, signal_id=?, result=? WHERE id=?')
      .run(error, signal && signal.id ? signal.id : null, JSON.stringify(result).slice(0, 4000), info.lastInsertRowid);

    res.json({
      ok: true, alert_id: Number(info.lastInsertRowid),
      received: { symbol: parsed.symbol, action: parsed.action, price: parsed.price, timeframe: tf, tv_symbol: parsed.tv_symbol },
      plan,
      signal_id: signal && signal.id ? signal.id : null,
      error,
    });
  }));

  /** Helpers used by the two routes above. */
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

  router.get('/news/:symbol', requireAuth, wrap(async (req, res) => {
    res.json({ ok: true, ...(await Bots.newsCheck(String(req.params.symbol).toUpperCase(), Math.min(num(req.query.window, 45), 240))) });
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
