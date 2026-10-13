'use strict';
const { asyncRouter } = require('./async-router');
const { db, createUser, verifyPassword, createSession, userFromToken, destroySession, getMeta, DEFAULT_CHECKLIST,
  currentStrategyVersion, snapshotStrategyVersion, strategyRulesChanged } = require('../db');
const I = require('../instruments');
const TV = require('../tradingview');
const P = require('../performance');
const Coach = require('../coach');
const M = require('../market');
const T = require('../trades');
const Guards = require('../bots/guardrails');
const SessionTime = require('../session-time');
const J = require('../journaling');
const RR = require('../routine-records');
const Routine = require('../routine');
const Execution = require('../execution-review');
const Screenshots = require('../screenshots');
const Confluences = require('../confluences');
const Emotions = require('../emotions');
const RuleBreaks = require('../rule-breaks');   // M12 — the guardrail audit, aggregated for the review
const PeriodReviews = require('../period-reviews');
const RuleChanges = require('../rule-changes');
const Identity = require('../identity');
const StateGate = require('../state-gate');
const Intention = require('../intention');
const Practice = require('../practice');
const Ask = require('../ask');
const NewsWindow = require('../news-window');   // M110 — the two news clocks
const Opportunities = require('../opportunities');
const ProcessOutcomes = require('../process-outcomes');
const BehaviorDays = require('../behavior-days');
const journalTrade = (t,tz) => ({...P.decorate(t,tz),journal:J.info(t),execution_review:Execution.review(t),entry_confluence_review:Confluences.info(t)});
const O = require('../options');
const Exp = require('../exposure');
const Prop = require('../prop');
const N = require('../notify');
const createBotsRouter = require('./bots');

const router = asyncRouter();
router.use((req, res, next) => {
  if (req.query.entry_model && req.query.entry_model !== 'unknown') {
    try { require('../bots/entry-models').normaliseName(req.query.entry_model); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  next();
});
const num = (v, d = 0) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Wrap async handlers: a rejected promise becomes a 500 response, never a dead server. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error(`API error on ${req.method} ${req.originalUrl}:`, err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message || 'Internal error' });
});

/* ------------------------------------------------------------------- auth */
const COOKIE = 'tj_session';
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i > -1) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}
function readToken(req) { return parseCookies(req)[COOKIE] || req.headers['x-session'] || null; }

async function requireAuth(req, res, next) {
  try {
    const user = await userFromToken(readToken(req));
    if (!user) {
      /* "Not signed in" is the wrong diagnosis on a serverless host with no remote DB.
       * db.js falls back to file:/tmp/journal.db when VERCEL is set and no
       * TURSO_DATABASE_URL / LIBSQL_URL / TRADEJOURNAL_DB is provided, and /tmp is wiped
       * between invocations — so the session row written at sign-in is simply GONE by the
       * next request. The user sees an auth failure and reaches for their password when
       * the actual fault is the missing environment variable. /api/health already reports
       * this, but the error the user actually reads did not. */
      const ephemeral = !!process.env.VERCEL && !require('../db').REMOTE;
      return res.status(401).json({
        error: 'Not signed in',
        ...(ephemeral ? {
          cause: 'ephemeral_database',
          detail: 'This deployment has no persistent database: it is using /tmp, which the '
            + 'platform wipes between invocations, so the session created at sign-in does not '
            + 'survive to the next request. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, then '
            + 'redeploy. GET /api/health reports database.persistent:false while this is so.',
        } : {}),
      });
    }
    req.user = user;
    next();
  } catch (e) { next(e); }
}
router.use(async (req, res, next) => {
  try {
    const user = await userFromToken(readToken(req));
    if (user) req.user = user;
    next();
  } catch (e) { next(e); }
});
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);
}
function clearSessionCookie(res) { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }

/* ---------------------------------------------------------------- bots */
router.use('/bots', createBotsRouter({ requireAuth }));

router.post('/auth/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (await db.prepare('SELECT id FROM users WHERE email=?').get(String(email).toLowerCase().trim())) {
    return res.status(409).json({ error: 'That email is already registered.' });
  }
  const { userId } = await createUser({ email, password, name });
  const token = await createSession(userId);
  setSessionCookie(res, token);
  res.json({ ok: true, token });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const row = await db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase().trim());
  if (!row || !verifyPassword(password, row.password_hash)) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = await createSession(row.id);
  setSessionCookie(res, token);
  res.json({ ok: true, token });
});

router.post('/auth/logout', async (req, res) => { await destroySession(readToken(req)); clearSessionCookie(res); res.json({ ok: true }); });

/** One-click demo account: full of realistic data so the analytics are alive immediately. */
router.post('/auth/demo', async (req, res) => {
  const email = 'demo@tradejournal.pro';
  let row = await db.prepare('SELECT * FROM users WHERE email=?').get(email);
  let userId;
  if (!row) {
    const created = await createUser({ email, name: 'Demo Trader', password: 'demo1234' });
    userId = created.userId;
    require('../demo-data').seedUser(userId, created.accountId);
  } else userId = row.id;
  const token = await createSession(userId);
  setSessionCookie(res, token);
  res.json({ ok: true, token, demo: true });
});

/**
 * Local / anonymous workspace.
 *
 * The app deliberately has NO sign-in wall: opening it connects you straight to a
 * workspace. Running on your own machine it attaches to the workspace in
 * data/journal.db; deployed, each browser gets a private one created on first
 * visit (the token lives in localStorage — no email, no password, no wall).
 * `fresh=1` always opens a brand new empty workspace.
 */
router.post('/auth/local', async (req, res) => {
  const crypto = require('crypto');
  const fresh = String((req.query.fresh || (req.body && req.body.fresh) || '')).match(/^(1|true|yes)$/i);
  const hosted = Boolean(process.env.VERCEL || process.env.TRADEJOURNAL_HOSTED);

  // already connected? keep the same workspace
  if (!fresh && req.user) {
    return res.json({ ok: true, token: readToken(req), workspace: 'existing', hosted, user: { id: req.user.id, name: req.user.name, email: req.user.email } });
  }

  let userId, workspace;
  if (fresh) {
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n;
    const email = `workspace${n + 1}@tradejournal.local`;
    const created = await createUser({ email, name: `Workspace ${n + 1}`, password: crypto.randomBytes(18).toString('hex') });
    userId = created.userId; workspace = 'new';
  } else if (!hosted) {
    // single-machine mode: the workspace that already lives in this database
    const demo = await db.prepare('SELECT * FROM users WHERE email=?').get('demo@tradejournal.pro');
    const any = demo || await db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
    if (any) { userId = any.id; workspace = 'main'; }
    else {
      const created = await createUser({ email: 'local@tradejournal.local', name: 'Local workspace', password: crypto.randomBytes(18).toString('hex') });
      userId = created.userId; workspace = 'new';
      require('../demo-data').seedUser(userId, created.accountId);
    }
  } else {
    // hosted mode: a private workspace for this browser, seeded so it is alive on arrival
    const created = await createUser({ email: `w${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}@tradejournal.local`, name: 'My workspace', password: crypto.randomBytes(18).toString('hex') });
    userId = created.userId; workspace = 'new';
    require('../demo-data').seedUser(userId, created.accountId);
  }

  const token = await createSession(userId);
  setSessionCookie(res, token);
  const row = await db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  res.json({ ok: true, token, workspace, hosted, user: { id: row.id, name: row.name, email: row.email } });
});

router.get('/auth/me', (req, res) => {
  if (!req.user) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: publicUser(req.user) });
});
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, settings: u.settings, default_checklist: u.settings.default_checklist || DEFAULT_CHECKLIST };
}

/* -------------------------------------------------------------- bootstrap */
router.get('/bootstrap', requireAuth, async (req, res) => {
  const accounts = await db.prepare('SELECT * FROM accounts WHERE user_id=? AND archived=0 ORDER BY is_default DESC, id').all(req.user.id);
  const strategies = (await db.prepare('SELECT * FROM strategies WHERE user_id=? ORDER BY active DESC, name').all(req.user.id)).map(parseStrategy);
  const instruments = await db.prepare('SELECT * FROM instruments WHERE user_id IS NULL OR user_id=? ORDER BY asset_class, symbol').all(req.user.id);
  const customSymbols = new Set((await db.prepare('SELECT symbol FROM instruments WHERE user_id=?').all(req.user.id)).map((r) => r.symbol));
  const tradeStats = await db.prepare(`SELECT COUNT(*) n, SUM(status='open') open_n, MIN(COALESCE(closed_at,opened_at)) first_t, MAX(COALESCE(closed_at,opened_at)) last_t FROM trades WHERE user_id=?`).get(req.user.id);
  res.json({
    user: publicUser(req.user),
    accounts,
    strategies,
    instruments: instruments.map((i) => ({ ...i, is_custom: customSymbols.has(i.symbol), tv_symbol: TV.tvSymbol(i.symbol) })),
    stats: { trades: tradeStats.n || 0, open: tradeStats.open_n || 0, first_trade: tradeStats.first_t, last_trade: tradeStats.last_t },
    meta: { asset_classes: I.ASSET_CLASSES, class_labels: I.CLASS_LABELS, unit_labels: I.UNIT_LABELS, sessions: P.SESSIONS },
  });
});
function parseStrategy(s) {
  const j = (v, d) => { try { return JSON.parse(v || d); } catch { return JSON.parse(d); } };
  return { ...s, entry_rules: j(s.entry_rules, '[]'), exit_rules: j(s.exit_rules, '[]'), checklist: j(s.checklist, '[]') };
}

/* ------------------------------------------------------------------ helpers */
async function settingsOf(req) {
  const row = await db.prepare('SELECT settings FROM users WHERE id=?').get(req.user.id);
  let s = {};
  try { s = JSON.parse(row.settings || '{}'); } catch { s = {}; }
  return { timezone: 'Africa/Lagos', ...s };
}
const NOTIFY_EVENTS = ['signal_resolved', 'signal_saved', 'challenge_warning', 'trade_closed', 'test'];

function safeJson(v) { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } }

/** Balance + the highest equity the account has reached (for trailing-DD maths). */
async function equityPeak(userId, acct) {
  const row = await db.prepare(`SELECT COALESCE(SUM(net_pnl),0) AS pnl FROM trades WHERE user_id=? AND account_id=? AND status='closed'`).get(userId, acct.id);
  const start = Number(acct.starting_balance) || 0;
  const balance = start + (Number(row && row.pnl) || 0);
  const per = await db.prepare(`SELECT closed_at, net_pnl FROM trades WHERE user_id=? AND account_id=? AND status='closed' ORDER BY COALESCE(closed_at, opened_at) ASC`).all(userId, acct.id);
  let eq = start, peak = start;
  per.forEach((t) => { eq += Number(t.net_pnl) || 0; if (eq > peak) peak = eq; });
  return { balance: Math.round(balance * 100) / 100, peak: Math.round(peak * 100) / 100 };
}

/** Send to one stored channel and remember how it went. */
async function notifyOne(userId, channel, event, text, data) {
  const out = await N.sendOne(channel, event, text, data);
  try {
    await db.prepare(`UPDATE notify_channels SET last_status=?, last_error=?, last_at=datetime('now') WHERE id=?`)
      .run(out.status || null, out.ok ? null : String(out.error || out.reason || out.body || 'failed').slice(0, 200), channel.id);
  } catch { /* best effort */ }
  return out;
}

/** Notify every enabled channel that subscribes to an event. */
async function notifyEvent(userId, event, text, data) {
  const rows = await db.prepare('SELECT * FROM notify_channels WHERE user_id=? AND enabled=1').all(userId);
  const subs = rows.filter((c) => String(c.events || '').split(',').map((x) => x.trim()).includes(event));
  const results = [];
  for (const c of subs) results.push({ id: c.id, kind: c.kind, ...(await notifyOne(userId, c, event, text, data)) });
  return results;
}

async function instrumentMap(userId) {
  const rows = await db.prepare('SELECT * FROM instruments WHERE user_id IS NULL OR user_id=?').all(userId);
  const map = {};
  for (const r of rows) if (!map[r.symbol] || r.user_id) map[r.symbol] = r;   // user override wins
  return map;
}
async function accountOr404(req, res) {
  const id = req.query.account_id ? Number(req.query.account_id) : null;
  const acc = id
    ? await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(id, req.user.id)
    : await db.prepare('SELECT * FROM accounts WHERE user_id=? AND archived=0 ORDER BY is_default DESC, id LIMIT 1').get(req.user.id);
  if (!acc) { res.status(404).json({ error: 'Account not found' }); return null; }
  return acc;
}
function tradeFilters(req) {
  return {
    account_id: req.query.account_id || null,
    status: req.query.status && req.query.status !== 'all' ? req.query.status : null,
    symbol: req.query.symbol || null,
    strategy_id: req.query.strategy_id || null,
    entry_model: req.query.entry_model || null,
    from: req.query.from || null, to: req.query.to || null,
    asset_class: req.query.asset_class || null,
    tag: req.query.tag || null,
    q: req.query.q || null,
    sort: req.query.sort || 'closed',
  };
}
async function fetchTrades(req, { limit = 5000 } = {}) {
  const f = tradeFilters(req);
  const { where, params, order } = T.listQuery(f);
  const rows = await db.prepare(`SELECT * FROM trades WHERE ${where} ORDER BY ${order} LIMIT ${limit}`).all({ ...params, user_id: req.user.id });
  // extra client-side filters that are easier outside SQL
  let out = rows;
  if (f.tag) {
    const want = String(f.tag).toLowerCase();
    out = out.filter((t) => T.listQuery({}).params && true && String(t.tags || '').toLowerCase().split(',').map((x) => x.trim()).includes(want));
  }
  if (f.q) {
    const q = String(f.q).toLowerCase();
    out = out.filter((t) => [t.symbol, t.strategy_name, t.tags, t.thesis, t.notes, t.mistakes].some((v) => String(v || '').toLowerCase().includes(q)));
  }
  const tz = (await settingsOf(req)).timezone;
  return { trades: out.map((t) => P.decorate(t, tz)), account: await accountOr404(req, { status: () => ({ json: () => {} }), setHeader: () => {} }) };
}

/* ------------------------------------------------------------------ trades */
router.get('/trades', requireAuth, async (req, res) => {
  const tz = (await settingsOf(req)).timezone;
  const f = tradeFilters(req);
  const { where, params, order } = T.listQuery(f);
  let rows = await db.prepare(`SELECT * FROM trades WHERE ${where} ORDER BY ${order} LIMIT ${num(req.query.limit, 500)} OFFSET ${num(req.query.offset, 0)}`).all({ ...params, user_id: req.user.id });
  if (f.tag) {
    const want = String(f.tag).toLowerCase();
    rows = rows.filter((t) => String(t.tags || '').toLowerCase().split(',').map((x) => x.trim()).includes(want));
  }
  if (f.q) {
    const q = String(f.q).toLowerCase();
    rows = rows.filter((t) => [t.symbol, t.strategy_name, t.tags, t.thesis, t.notes, t.mistakes, t.lesson]
      .some((v) => String(v || '').toLowerCase().includes(q)));
  }
  const total = (await db.prepare(`SELECT COUNT(*) n FROM trades WHERE ${where}`).get({ ...params, user_id: req.user.id })).n;
  res.json({ trades: rows.map((t) => journalTrade(t, tz)), total });
});

router.get('/trades/:id', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Trade not found' });
  res.json({ trade: journalTrade(row, (await settingsOf(req)).timezone) });
});

router.post('/trades', requireAuth, async (req, res) => {
  const instruments = await instrumentMap(req.user.id);
  const body = req.body || {};
  const confluences=Confluences.optional(body.entry_confluences);
  const spec = instruments[String(body.symbol || '').toUpperCase()] || null;
  const accountId = num(body.account_id, 0) || (await db.prepare('SELECT id FROM accounts WHERE user_id=? AND archived=0 ORDER BY is_default DESC LIMIT 1').get(req.user.id) || {}).id;
  if (!body.symbol) return res.status(400).json({ error: 'Symbol is required' });
  if (!body.entry) return res.status(400).json({ error: 'Entry price is required' });
  let trade;
  try { trade = T.normalise(body, { instrument: spec, tz: (await settingsOf(req)).timezone }); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  /* M102 — stamp the version the trade is taken under, AT THE MOMENT IT IS TAKEN. Without
   * this the version history exists but nothing is attributed to it and by_strategy would
   * still average across revisions, which is the exact defect being fixed. Stamped only when
   * the caller did not supply one (an import of historical trades may legitimately know
   * better) and only when a strategy is attached. A trade with no strategy stays NULL rather
   * than being guessed at, so the version column never carries an invented value. */
  if (trade && trade.strategy_id && trade.strategy_version === undefined) {
    const v = await currentStrategyVersion(Number(trade.strategy_id));
    if (v) trade.strategy_version = v;
  }
  const owned = await db.prepare('SELECT id FROM accounts WHERE id=? AND user_id=?').get(accountId,req.user.id);
  if (!owned) return res.status(404).json({error:'Account not found'});
  let id, permission, written;
  try {
    if (trade.status === 'open' && body.record_only !== true) {
      try { trade.emotion_before=J.text(body.emotion_before,'Name your emotional state before prospective entry',100); }
      catch(e){throw Guards.inputError(e.message);}
      /* M106 — a live prospective entry is the app's own actionable surface, so an
       * ADOPTED four-question check must be fresh and non-failing before the entry is
       * admitted. An account that never answered the gate has no recorded refusal to
       * honour and is told so instead of being blocked by an invented rule. */
      const gate = await StateGate.permission(req.user.id, accountId);
      if (!gate.allowed) return res.status(409).json({ error: gate.message, code: gate.state === 'failed' ? 'state_gate_failed' : 'state_gate_unanswered', state_gate: { state: gate.state, adopted: gate.adopted, failed_questions: gate.failed_questions || [], window_minutes: gate.window_minutes, expires_at: gate.expires_at || null }, hint: 'Answer the four questions fresh (or record this as already-executed history with record_only) — nothing financial was written.' });
      const out = await Guards.admit(req.user.id,{accountId,entryTf:trade.entry_tf,action:'trade_entry',entityType:'trade',overrideReason:body.override_reason},async (store,daily) => {
        const entry = {...trade,account_id:accountId,opened_at:daily.evaluated_at,...Guards.snapshotFields(StateGate.apply(daily, gate))};
        const id=await T.insert(store,req.user.id,entry);await Confluences.attachOn(store,req.user.id,id,confluences);return {id,record:await store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,req.user.id),permission:Guards.actionPermission(daily)}; });
      id = out.id; permission = out.permission; written=out.record;
    } else {
      const out = await Guards.record(req.user.id,{accountId,entryTf:trade.entry_tf,action:'journal_trade',entityType:'trade'},async (store,daily)=>{const id=await T.insert(store,req.user.id,{...trade,account_id:accountId,...Guards.snapshotFields(daily,'record_only')});await Confluences.attachOn(store,req.user.id,id,confluences);return {id};});
      id = out.id; permission = {allowed:false,state:'record_only',can_override:false};
    }
  } catch(e) {
    if (e.code?.startsWith('guardrail_')) return res.status(e.status).json({error:e.message,code:e.code,daily:e.daily});
    throw e;
  }
  if (Array.isArray(body.rule_checks)) {
    const ins = await db.prepare('INSERT INTO rule_checks(trade_id,label,passed) VALUES(?,?,?)');
    for (const rc of body.rule_checks) await ins.run(id, String(rc.label || ''), rc.passed ? 1 : 0);
  }
  const saved = await db.prepare('SELECT * FROM trades WHERE id=?').get(id);
  const emotion=permission?.allowed&&written?await Emotions.observe(req.user.id,written,'entry','app_entry'):{};
  const association=permission?.allowed&&written?await Opportunities.autoLink(req.user.id,body.source_signal_id,written):{};
  res.json({ ok: true, permission, ...emotion, ...association,confluence_warnings:confluences.warnings, trade: journalTrade(saved, (await settingsOf(req)).timezone) });
});

// Optional reasons never grant entry, complete core writing or alter execution/risk.
const confluenceRoute=fn=>async(req,res)=>{try{if(req.params.id&&!/^[1-9]\d*$/.test(req.params.id))throw Confluences.invalid('Trade not found.',404);res.json(await fn(req));}catch(e){if(e.code==='confluence_invalid')return res.status(e.status).json({error:e.message,code:e.code});return res.status(503).json({error:'Entry confluence evidence unavailable; existing financial truth unchanged.'});}};
router.get('/confluences',requireAuth,confluenceRoute(req=>Confluences.vocabulary(req.user.id)));
router.get('/trades/:id/confluences',requireAuth,confluenceRoute(req=>Confluences.read(req.user.id,Number(req.params.id))));
router.put('/trades/:id/confluences',requireAuth,confluenceRoute(req=>Confluences.change(req.user.id,Number(req.params.id),req.body)));

const emotionRoute=fn=>async(req,res)=>{try{if(!/^[1-9]\d*$/.test(req.params.id))throw Emotions.invalid('Trade not found.',404);res.json(await fn(req));}catch(e){if(e.code==='emotion_capture_invalid')return res.status(e.status).json({error:e.message,code:e.code});return res.status(503).json({error:'Optional emotion evidence unavailable; financial truth unchanged.'});}};
router.get('/trades/:id/emotions',requireAuth,emotionRoute(req=>Emotions.read(req.user.id,Number(req.params.id))));
router.post('/trades/:id/emotions/:phase',requireAuth,emotionRoute(req=>Emotions.answer(req.user.id,Number(req.params.id),req.params.phase,req.body)));

router.put('/trades/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Trade not found' });
  const instruments = await instrumentMap(req.user.id);
  const merged = { ...existing, ...req.body };
  const spec = instruments[String(merged.symbol || '').toUpperCase()] || null;
  let trade;
  try { trade = T.normalise(merged, { instrument: spec, tz: (await settingsOf(req)).timezone }); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  const accountId = num(merged.account_id,existing.account_id);
  if (!await db.prepare('SELECT id FROM accounts WHERE id=? AND user_id=?').get(accountId,req.user.id)) return res.status(404).json({error:'Account not found'});
  let written;const write=async(store,fields)=>{await T.update(store,req.user.id,id,fields);return store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,req.user.id);};
  try {
    if (existing.status !== 'open' && trade.status === 'open' && req.body.record_only !== true) {
      try { trade.emotion_before=J.text(req.body.emotion_before,'Name your current emotional state before reopening',100); }
      catch(e){throw Guards.inputError(e.message);}
      /* M106 — reopening a closed trade into a live position is the same prospective act as a new entry. */
      const reopenGate=await StateGate.permission(req.user.id,accountId);
      if(!reopenGate.allowed)return res.status(409).json({error:reopenGate.message,code:reopenGate.state==='failed'?'state_gate_failed':'state_gate_unanswered',state_gate:{state:reopenGate.state,adopted:reopenGate.adopted,failed_questions:reopenGate.failed_questions||[],window_minutes:reopenGate.window_minutes,expires_at:reopenGate.expires_at||null},hint:'Answer the four questions fresh, or record this as journal history with record_only — nothing financial was written.'});
      written=await Guards.admit(req.user.id,{accountId,entryTf:trade.entry_tf,action:'reopen_entry',entityType:'trade',entityId:id,overrideReason:req.body.override_reason},(store,daily)=>write(store,{...trade,account_id:accountId,opened_at:daily.evaluated_at,...Guards.snapshotFields(StateGate.apply(daily,reopenGate))}));
    } else written=await Guards.record(req.user.id,{accountId,entryTf:trade.entry_tf,action:'journal_correction',entityType:'trade',entityId:id},store=>write(store,{...trade,account_id:accountId}));
  } catch(e) {
    if (e.code?.startsWith('guardrail_')) return res.status(e.status).json({error:e.message,code:e.code,daily:e.daily});
    throw e;
  }
  if (Array.isArray(req.body.rule_checks)) {
    await db.prepare('DELETE FROM rule_checks WHERE trade_id=?').run(id);
    const ins = await db.prepare('INSERT INTO rule_checks(trade_id,label,passed) VALUES(?,?,?)');
    for (const rc of req.body.rule_checks) ins.run(id, String(rc.label || ''), rc.passed ? 1 : 0);
  }
  const phase=existing.status!=='open'&&trade.status==='open'&&req.body.record_only!==true?'entry':existing.status==='open'&&trade.status==='closed'?'exit':null;
  const emotion=phase?await Emotions.observe(req.user.id,written,phase,phase==='entry'?'app_entry':'app_close',existing.closed_at||''):{};
  const association=phase==='entry'?await Opportunities.autoLink(req.user.id,req.body.source_signal_id,written):{};
  res.json({ ok: true, ...emotion, ...association,trade: journalTrade(await db.prepare('SELECT * FROM trades WHERE id=?').get(id), (await settingsOf(req)).timezone) });
});

// M87 optional owned visual evidence is independent from financial truth,
// mandatory writing and permission. Never infer legacy role or capture time.
const media=fn=>async(req,res)=>{
  try {
    if(!/^[1-9]\d*$/.test(req.params.id))return res.status(404).json({error:'Trade not found'});
    res.json(await fn(req));
  }catch(e){if(e.code==='screenshot_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Screenshot evidence could not be read/recorded. Existing financial truth is unchanged.'});}
};
router.get('/trades/:id/screenshots',requireAuth,media(req=>Screenshots.read(req.user.id,Number(req.params.id))));
router.put('/trades/:id/screenshots/:role',requireAuth,media(req=>Screenshots.change(req.user.id,Number(req.params.id),req.params.role,req.body)));
router.delete('/trades/:id/screenshots/:role',requireAuth,media(req=>Screenshots.change(req.user.id,Number(req.params.id),req.params.role,req.body,{remove:true})));

// Optional post-close HUMAN execution review is separate from financial CRUD
// and mandatory core/loss writing. It cannot backfill pre-entry setup grades.
router.post('/trades/:id/execution-review',requireAuth,async(req,res)=>{
  try {
    if(!/^[1-9]\d*$/.test(req.params.id))return res.status(404).json({error:'Trade not found'});
    const row=await Execution.acknowledge(req.user.id,Number(req.params.id),req.body);
    res.json({ok:true,trade:journalTrade(row,(await settingsOf(req)).timezone)});
  } catch(e) {
    if(e.code==='execution_review_invalid')return res.status(e.status).json({error:e.message,code:e.code});
    res.status(503).json({error:'Execution review could not be recorded.'});
  }
});

router.post('/trades/:id/journal', requireAuth,async(req,res)=>{
  try { const row=await J.reviewTrade(req.user.id,Number(req.params.id),req.body||{});res.json({ok:true,trade:journalTrade(row,(await settingsOf(req)).timezone)}); }
  catch(e){if(e.code==='journal_input_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Journal review could not be recorded.'});}
});

router.post('/trades/:id/close', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Trade not found' });
  const body = req.body || {};
  const merged = {
    ...existing,
    status: 'closed',
    exit: body.exit,
    fees: body.fees !== undefined ? body.fees : existing.fees,
    closed_at: body.closed_at || new Date().toISOString(),
    exit_reason: body.exit_reason || existing.exit_reason,
    mae_r: body.mae_r, mfe_r: body.mfe_r, mae_price: body.mae_price, mfe_price: body.mfe_price,
    legs: body.legs !== undefined ? body.legs : existing.legs,
    lesson: body.lesson || existing.lesson,
    execution_notes: body.execution_notes || existing.execution_notes,
    emotion_after: body.emotion_after || existing.emotion_after,
  };
  const instruments = await instrumentMap(req.user.id);
  const trade = T.normalise(merged, { instrument: instruments[existing.symbol] || null, tz: (await settingsOf(req)).timezone });
  const written=await Guards.record(req.user.id,{accountId:existing.account_id,entryTf:trade.entry_tf,action:'journal_close',entityType:'trade',entityId:id},async store=>{await T.update(store,req.user.id,id,trade);return store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,req.user.id);});
  const fresh = await db.prepare('SELECT * FROM trades WHERE id=?').get(id);
  if (req.body && req.body.notify !== false) {
    notifyEvent(req.user.id, 'trade_closed', `${trade.symbol} ${trade.direction} closed ${fresh.net_pnl >= 0 ? '+' : ''}${fresh.net_pnl} (${fresh.r_multiple}R)${trade.legs_n ? ` · ${trade.legs_n} scale-outs` : ''}`, { trade_id: id, symbol: trade.symbol, net_pnl: fresh.net_pnl, r_multiple: fresh.r_multiple }).catch(() => {});
  }
  const emotion=existing.status==='open'?await Emotions.observe(req.user.id,written,'exit','app_close'):{};
  res.json({ ok: true, ...emotion, trade: journalTrade(fresh, (await settingsOf(req)).timezone) });
});

router.delete('/trades/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.prepare('SELECT account_id FROM trades WHERE id=? AND user_id=?').get(id,req.user.id);
  if (!existing) return res.json({ok:false});
  const info = await Guards.record(req.user.id,{accountId:existing.account_id,action:'journal_delete',entityType:'trade',entityId:id},
    store=>store.prepare('DELETE FROM trades WHERE id=? AND user_id=?').run(id,req.user.id));
  res.json({ ok: !!info.changes });
});

router.post('/trades/bulk-delete', requireAuth, async (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (ids.length) {
    const accounts = await db.prepare(`SELECT DISTINCT account_id FROM trades WHERE user_id=? AND id IN (${ids.map(()=>'?').join(',')})`).all(req.user.id,...ids.map(Number));
    if (accounts.length) await Guards.record(req.user.id,{accountIds:accounts.map(a=>a.account_id),action:'journal_bulk_delete',entityType:'trade'},async store=>{
      const del = store.prepare('DELETE FROM trades WHERE id=? AND user_id=?');
      for (const id of ids) await del.run(Number(id),req.user.id);
    });
  }
  res.json({ ok: true, deleted: ids.length });
});

/* --------------------------------------------------------------- analytics */
/* ── M57 — COMPLIANCE, the one derived discipline metric, finally read ──────────
 * Ep 26 states the formula verbatim: *"If you are supposed to follow your trade plan
 * 10 times, but you only follow it 8 times, then your compliance rate is probably
 * around 80%."* The raw rows already existed — rule_checks(trade_id,label,passed),
 * written on trade create and update and rendered as checkboxes in the trade view —
 * but no SELECT on the table existed anywhere in src/; its only other reference was a
 * DELETE on update. So the metric was collected, displayed per trade, and never
 * aggregated, while the subjective 1-5 self-score (adherence) stood in for it. His
 * whole point is the difference: a derived metric *"removes the choice"* of being
 * honest, a self-score does not.
 *
 * Two readings are returned on purpose. `compliance` is the prescribed one — the
 * per-trade passed/total ratio, averaged over trades that carry a checklist.
 * `compliance_pooled` is the ratio Ep 26's sentence literally describes, followed
 * steps over required steps across the set. They differ whenever trades carry
 * different numbers of checks, and returning both means neither can be quoted
 * without its denominator: compliance_trades / compliance_checks / compliance_passed.
 * Null, never 0, when no trade in the set has a checklist — an empty denominator is
 * an absence of evidence, not 0% discipline. */
async function complianceByTrade(userId) {
  const rows = await db.prepare(
    'SELECT trade_id, passed FROM rule_checks WHERE trade_id IN (SELECT id FROM trades WHERE user_id=?)'
  ).all(userId);
  const m = new Map();
  for (const r of rows) {
    const e = m.get(r.trade_id) || { passed: 0, total: 0 };
    e.total += 1; if (r.passed) e.passed += 1;
    m.set(r.trade_id, e);
  }
  return m;
}
function complianceOver(map, ids) {
  let trades = 0, checks = 0, passed = 0, sumRatio = 0;
  for (const id of ids || []) {
    const e = map.get(id);
    if (!e || !e.total) continue;
    trades += 1; checks += e.total; passed += e.passed; sumRatio += e.passed / e.total;
  }
  return {
    compliance: trades ? Number((100 * sumRatio / trades).toFixed(1)) : null,
    compliance_pooled: checks ? Number((100 * passed / checks).toFixed(1)) : null,
    compliance_trades: trades, compliance_checks: checks, compliance_passed: passed,
  };
}

router.get('/behavior-days',requireAuth,async(req,res)=>{
  try{res.json({report:await BehaviorDays.inspect(req.user.id,{accountId:req.query.account_id??null,from:req.query.from??null,to:req.query.to??null})});}
  catch(e){if(e.code==='behavior_day_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Daily behavior evidence unavailable, not clean or scored.'});}
});

router.get('/process-outcomes',requireAuth,async(req,res)=>{
  try{res.json({review:await ProcessOutcomes.inspect(req.user.id,{accountId:req.query.account_id??null,from:req.query.from??null,to:req.query.to??null})});}
  catch(e){if(e.code==='process_outcome_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Process history unavailable; not a clean-process certificate.'});}
});

router.get('/analytics', requireAuth, async (req, res) => {
  const tz = (await settingsOf(req)).timezone;
  const f = tradeFilters(req);
  // analytics always include only closed trades, but respect every other filter
  const { where, params } = T.listQuery({ ...f, status: null, sort: 'closed' });
  let rows = await db.prepare(`SELECT * FROM trades WHERE ${where} ORDER BY COALESCE(closed_at, opened_at) ASC`).all({ ...params, user_id: req.user.id });
  if (f.tag) {
    const want = String(f.tag).toLowerCase();
    rows = rows.filter((t) => String(t.tags || '').toLowerCase().split(',').map((x) => x.trim()).includes(want));
  }
  const decorated = (await Emotions.annotate(rows)).map((t) => P.decorate(t, tz));
  const closed = decorated.filter((t) => t.status !== 'open');
  const acc = await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(num(req.query.account_id, 0), req.user.id)
    || await db.prepare('SELECT * FROM accounts WHERE user_id=? AND archived=0 ORDER BY is_default DESC LIMIT 1').get(req.user.id)
    || { starting_balance: 10000, id: null };
  const analytics = P.fullAnalytics(closed, { startingBalance: acc.starting_balance });
  /* M57 — compliance over exactly the closed trades this payload analyses, so the
   * discipline figure and the performance figures can never describe different sets. */
  Object.assign(analytics, complianceOver(await complianceByTrade(req.user.id), closed.map((t) => t.id)));
  analytics.account = acc;
  analytics.open_positions = decorated.filter((t) => t.status === 'open');
  analytics.opportunity_review=await Opportunities.optional(req.user.id,{accountId:req.query.account_id??null,from:req.query.from??null,to:req.query.to??null});
  analytics.behavior_days=await BehaviorDays.optional(req.user.id,{accountId:req.query.account_id??null,from:req.query.from??null,to:req.query.to??null});
  analytics.process_review=await ProcessOutcomes.optional(req.user.id,{accountId:req.query.account_id??null,from:req.query.from??null,to:req.query.to??null});
  /* M12 — the audit tally is scoped to the SAME account this payload analyses (the resolved
   * account, not every account the trader owns), so the review cannot read one desk's performance
   * beside another desk's rule breaks. `from`/`to` are the payload's own window when given. */
  analytics.rule_breaks=await RuleBreaks.optional(req.user.id,{accountId:acc.id??null,from:req.query.from??null,to:req.query.to??null});
  res.json(analytics);
});

router.get('/analytics/monte-carlo', requireAuth, async (req, res) => {
  const tz = (await settingsOf(req)).timezone;
  const f = tradeFilters(req);
  const { where, params } = T.listQuery({ ...f, status: 'closed' });
  const rows = (await db.prepare(`SELECT * FROM trades WHERE ${where} AND status='closed' ORDER BY COALESCE(closed_at,opened_at)`).all({ ...params, user_id: req.user.id }))
    .map((t) => P.decorate(t, tz));
  const rs = rows.map((t) => num(t.r_multiple));
  const acc = await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(num(req.query.account_id, 0), req.user.id)
    || await db.prepare('SELECT * FROM accounts WHERE user_id=? ORDER BY is_default DESC LIMIT 1').get(req.user.id) || { current_balance: 10000, risk_per_trade_pct: 0.5 };  // M9: fallback 1 -> 0.5
  const start = num(req.query.start_equity, acc.current_balance);
  // M9: `risk_pct` was accepted here as a raw query param and fed straight into the Monte
  // Carlo simulation, so a ruin projection could be run at any percentage. An explicit value
  // is the trader's own manual act (ceiling: the 1 % absolute maximum); the FALLBACK is the
  // stored account setting, clamped by that account's own unlock so a legacy row cannot
  // smuggle an unclamped number in sideways.
  const riskPct = req.query.risk_pct !== undefined && req.query.risk_pct !== ''
    ? I.clampRiskPct(req.query.risk_pct, { fallback: I.RISK_GUARDRAIL.default_pct, unlocked: true })
    : I.clampRiskPct(acc.risk_per_trade_pct, { fallback: I.RISK_GUARDRAIL.default_pct, unlocked: !!acc.risk_unlocked });
  res.json({
    monte_carlo: P.monteCarlo(rs, { startEquity: start, riskPct, horizon: num(req.query.horizon, 100), sims: num(req.query.sims, 2000), ruinPct: num(req.query.ruin, 50) }),
    optimal_risk: P.optimalRisk(rs),
    sample: { trades: rows.length, expectancy_r: r2(P.mean(rs)), std_r: P.stdev(rs) },
  });
});

router.get('/coach', requireAuth, async (req, res) => {
  const tz = (await settingsOf(req)).timezone;
  const f = tradeFilters(req);
  const { where, params } = T.listQuery({ ...f, status: null });
  const rows = (await db.prepare(`SELECT * FROM trades WHERE ${where} ORDER BY COALESCE(closed_at, opened_at)`).all({ ...params, user_id: req.user.id }))
    .map((t) => P.decorate(t, tz));
  const acc = await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(num(req.query.account_id, 0), req.user.id)
    || await db.prepare('SELECT * FROM accounts WHERE user_id=? ORDER BY is_default DESC LIMIT 1').get(req.user.id);
  const data=ProcessOutcomes.withCoach(Coach.analyse(await Emotions.annotate(rows), { startingBalance: acc ? acc.starting_balance : 10000, timezone: tz }),await ProcessOutcomes.optional(req.user.id,{accountId:req.query.account_id??null,from:req.query.from??null,to:req.query.to??null}));
  data.behavior_days=await BehaviorDays.optional(req.user.id,{accountId:req.query.account_id??null,from:req.query.from??null,to:req.query.to??null});
  res.json(data);
});

router.get('/briefing', requireAuth, wrap(async (req, res) => {
  const settings = await settingsOf(req);
  const tz = settings.timezone;
  const acc = await accountOr404(req, res);
  if (!acc) return;
  let rows = (await db.prepare('SELECT * FROM trades WHERE user_id=? AND account_id=? ORDER BY COALESCE(closed_at, opened_at)').all(req.user.id, acc.id)).map((t) => P.decorate(t, tz));
  rows=await Emotions.annotate(rows);
  const todayStr = P.localDateStr(new Date().toISOString(), tz);
  const journalEntry = await db.prepare('SELECT * FROM journal_entries WHERE user_id=? AND entry_date=?').get(req.user.id, todayStr) || null;
  const symbols = [...new Set([...(settings.focus_symbols || []), ...rows.slice(-25).map((t) => t.symbol)])].slice(0, 12);
  const [cal, quotes] = await Promise.all([M.getCalendar({ timezone: tz }), M.getQuotes(symbols)]);
  const events = (cal.events || []).filter((e) => ['high', 'medium'].includes(e.impact) && new Date(e.date) > new Date(Date.now() - 6 * 3600e3)).slice(0, 40);
  const capPolicy = await Guards.dailyCap(db, req.user.id, acc);
  const briefing = Coach.briefing({ trades: rows, events, quotes: quotes.quotes || {}, account: { ...acc, max_trades_day: capPolicy.max_trades_day }, journalEntry, riskRules: settings });
  briefing.risk_plan.trade_cap_policy = capPolicy;
  briefing.identity_context=await Identity.optional(req.user.id,acc.id,Guards.dayKey(Date.now()));
  briefing.state_gate=await StateGate.optional(req.user.id,acc.id);
  briefing.intention=await Intention.optional(req.user.id,acc.id);
  briefing.practice=await Practice.optional(req.user.id);
  briefing.behavior_days=await BehaviorDays.optional(req.user.id,{accountId:acc.id,from:Guards.dayKey(Date.now()),to:Guards.dayKey(Date.now())});
  briefing.process_review=await ProcessOutcomes.optional(req.user.id,{accountId:acc.id,from:Guards.dayKey(Date.now()),to:Guards.dayKey(Date.now())});
  // Briefing amounts are advice, NOT permission. Use the same close-day UTC
  // state as entry admission for the optional profit display/retained latch.
  let daily;
  try { daily = await require('../bots/correction').dailyState(req.user.id,{accountId:acc.id}); }
  catch { daily = Guards.unavailable({accountId:acc.id}); }
  briefing.daily = daily;
  briefing.risk_plan.profit_stop = daily.profit_stop || {
    enabled:capPolicy.daily_profit_limit_pct!==null,limit_pct:capPolicy.daily_profit_limit_pct,
    limit_amount:null,realised_amount:null,selected_at:capPolicy.profit_selected_at,timezone:'UTC'};
  briefing.calendar_ok = cal.ok;
  briefing.quotes_ok = quotes.ok;
  res.json(briefing);
}));

/* M84 optional manual marker: server clock/owner-scoped, not trade permission. */
router.get('/session-time', requireAuth, async (req,res)=>{
  try { res.json({session:await SessionTime.inspect(req.user.id,{accountId:req.query.account_id})}); }
  catch(e){if(e.code==='session_time_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Manual session time could not be verified.'});}
});
for(const action of ['start','end'])router.post('/session-time/'+action,requireAuth,async(req,res)=>{
  try{res.json({ok:true,session:await SessionTime[action](req.user.id,req.body?.account_id)});}
  catch(e){if(e.code==='session_time_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Manual session marker could not be recorded.'});}
});

/* ----------------------------------------------------------------- journal */
const opportunityRoute=fn=>async(req,res)=>{try{for(const key of ['id','link'])if(req.params[key]&&!/^[1-9]\d*$/.test(req.params[key]))throw Opportunities.invalid('Owned opportunity/signal/link not found.',404);res.json(await fn(req));}catch(e){if(e.code==='opportunity_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Optional opportunity evidence unavailable; financial/signal/permission state unchanged.'});}};
router.get('/opportunities',requireAuth,opportunityRoute(req=>Opportunities.report(req.user.id,{accountId:req.query.account_id??null,from:req.query.from??null,to:req.query.to??null})));
router.get('/opportunities/signals/:id',requireAuth,opportunityRoute(req=>Opportunities.readSignal(req.user.id,Number(req.params.id),req.query.account_id)));
router.post('/opportunities/signals/:id',requireAuth,opportunityRoute(req=>Opportunities.review(req.user.id,Number(req.params.id),req.query.account_id,req.body)));
router.get('/opportunities/:id',requireAuth,opportunityRoute(req=>Opportunities.read(req.user.id,Number(req.params.id))));
router.post('/opportunities/:id/links',requireAuth,opportunityRoute(req=>Opportunities.link(req.user.id,Number(req.params.id),req.body)));
router.post('/opportunities/:id/links/:link/retract',requireAuth,opportunityRoute(req=>Opportunities.retract(req.user.id,Number(req.params.id),Number(req.params.link),req.body)));

const reviewRoute=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){if(e.code==='period_review_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Periodic review unavailable; financial/core/permission state unchanged.'});}};
router.get('/reviews',requireAuth,reviewRoute(req=>PeriodReviews.list(req.user.id,req.query.account_id??null)));
router.get('/reviews/template',requireAuth,reviewRoute(req=>{const p=PeriodReviews.period(req.query.kind,req.query.date);return PeriodReviews.read(req.user.id,req.query.account_id,p.kind,p.start);}));
router.get('/reviews/by-id/:id',requireAuth,reviewRoute(req=>{if(!/^[1-9]\d*$/.test(req.params.id))throw PeriodReviews.invalid('Review not found.',404);return PeriodReviews.byId(req.user.id,Number(req.params.id));}));
router.get('/reviews/:kind/:start',requireAuth,reviewRoute(req=>PeriodReviews.read(req.user.id,req.query.account_id,req.params.kind,req.params.start)));
router.post('/reviews/:kind/:start',requireAuth,reviewRoute(req=>PeriodReviews.save(req.user.id,req.query.account_id,req.params.kind,req.params.start,req.body,'draft')));
for(const action of ['complete','amend'])router.post('/reviews/:kind/:start/'+action,requireAuth,reviewRoute(req=>PeriodReviews.save(req.user.id,req.query.account_id,req.params.kind,req.params.start,req.body,action)));

const identityRoute=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){if(e.code==='identity_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Identity declaration/tally unavailable; no finance/core/permission state changed.'});}};
router.get('/identity',requireAuth,identityRoute(req=>Identity.read(req.user.id,req.query.account_id,{quarterStart:req.query.quarter_start??null})));
router.get('/identity/history',requireAuth,identityRoute(req=>Identity.history(req.user.id,req.query.account_id??null)));
router.get('/identity/tally',requireAuth,identityRoute(async req=>({tally:await Identity.reportTally(req.user.id,req.query.account_id,{from:req.query.from??null,to:req.query.to??null})})));
router.get('/identity/daily/:date',requireAuth,identityRoute(req=>Identity.daily(req.user.id,req.query.account_id,req.params.date)));
router.put('/identity/statement',requireAuth,identityRoute(req=>Identity.save(req.user.id,req.query.account_id,'identity','',req.body)));
router.put('/identity/theme/:start',requireAuth,identityRoute(req=>Identity.save(req.user.id,req.query.account_id,'theme',req.params.start,req.body)));

const stateGateRoute=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){if(e.code==='state_gate_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'State-gate answers unavailable; no finance/core/permission state changed.'});}};
router.get('/state-gate',requireAuth,stateGateRoute(req=>StateGate.read(req.user.id,req.query.account_id)));
router.get('/state-gate/history',requireAuth,stateGateRoute(req=>StateGate.history(req.user.id,req.query.account_id??null)));
router.put('/state-gate',requireAuth,stateGateRoute(req=>StateGate.save(req.user.id,req.query.account_id,req.body)));

const intentionRoute=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){if(e.code==='intention_invalid'||e.code==='intention_outcome_target')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Daily intention unavailable; no finance/permission state changed.'});}};
router.get('/intention',requireAuth,intentionRoute(req=>Intention.read(req.user.id,req.query.account_id,{date:req.query.date??null})));
router.get('/intention/history',requireAuth,intentionRoute(req=>Intention.history(req.user.id,req.query.account_id??null,{date:req.query.date??null})));
router.put('/intention',requireAuth,intentionRoute(req=>Intention.save(req.user.id,req.query.account_id,req.body)));

const practiceRoute=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){if(e.code==='practice_invalid'||e.code==='practice_outcome_target'||e.code==='intention_outcome_target')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Practice log unavailable; no finance/permission state changed.'});}};
/* Personal, never desk-scoped: an account_id is not an input here, so no caller can
 * attribute a practice record to an account or bind one to a desk. */
router.get('/practice',requireAuth,practiceRoute(req=>Practice.read(req.user.id,{date:req.query.date??null})));
router.get('/practice/history',requireAuth,practiceRoute(req=>Practice.history(req.user.id,{date:req.query.date??null})));
router.get('/practice/progress',requireAuth,practiceRoute(req=>Practice.progress(req.user.id,{from:req.query.from??'',to:req.query.to??''})));
router.post('/practice/timer',requireAuth,practiceRoute(req=>Practice.save(req.user.id,req.body)));

/* M109 the advisory channel. Every reader in src/ask.js is a SELECT (or a module's
 * documented read path), so asking cannot latch, repair or acknowledge anything; a
 * refusal and an honest non-answer are successful 200s carrying their reason, and only
 * a malformed question is a 400. No model, no key, no network, no authority. */
const askRoute=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){if(e.code==='ask_invalid')return res.status(e.status||400).json({error:e.message,code:e.code});res.status(503).json({error:'The advisory channel could not read its stored facts; nothing was changed and nothing was inferred.',code:'ask_unavailable'});}};
router.get('/ask/topics',requireAuth,askRoute(()=>Ask.topics()));
router.post('/ask',requireAuth,askRoute(async req=>Ask.ask(req.user.id,req.body,{db,timezone:(await settingsOf(req)).timezone||'UTC'})));

router.get('/journal', requireAuth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM journal_entries WHERE user_id=? ORDER BY entry_date DESC LIMIT 400').all(req.user.id);
  const guardrailDays = await db.prepare(`SELECT rule_date,COUNT(*) AS events,SUM(kind='override') AS overrides FROM guardrail_events WHERE user_id=? GROUP BY rule_date ORDER BY rule_date DESC LIMIT 400`).all(req.user.id);
  if(req.query.account_id && !await db.prepare('SELECT id FROM accounts WHERE id=? AND user_id=?').get(Number(req.query.account_id),req.user.id))return res.status(404).json({error:'Account not found'});
  const journalRows=await db.prepare('SELECT * FROM trades WHERE user_id=?'+(req.query.account_id?' AND account_id=?':'')).all(...(req.query.account_id?[req.user.id,Number(req.query.account_id)]:[req.user.id]));
  res.json({ entries: rows, guardrail_days:guardrailDays, journal_days:J.days(journalRows),pre_market_days:await RR.list(req.user.id,{accountId:req.query.account_id}),journal_timezone:'UTC',behavior_days:await BehaviorDays.optional(req.user.id,{accountId:req.query.account_id??null}),process_review:await ProcessOutcomes.optional(req.user.id,{accountId:req.query.account_id??null}) });
});
router.get('/routine',requireAuth,async(req,res)=>{
  try{res.json({routine:await Routine.current(req.user.id,{accountId:req.query.account_id})});}catch(e){if(e.code==='routine_input_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Pre-market routine state could not be verified.'});}
});
router.post('/routine/step',requireAuth,async(req,res)=>{
  try{res.json({routine:await Routine.acknowledge(req.user.id,req.body)});}catch(e){if(e.code==='routine_input_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Pre-market routine step could not be verified.'});}
});
router.post('/routine/meditation',requireAuth,async(req,res)=>{
  try{res.json({routine:await Routine.meditation(req.user.id,req.body)});}catch(e){if(e.code==='routine_input_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Pre-market meditation timer could not be verified.'});}
});
router.get('/routine/daily/:date',requireAuth,async(req,res)=>{
  try{res.json({pre_market:await RR.daily(req.user.id,{accountId:req.query.account_id,date:req.params.date})});}catch(e){if(e.code==='routine_input_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Daily routine record could not be verified.'});}
});
router.get('/routine/report',requireAuth,async(req,res)=>{
  try{res.json({report:await RR.report(req.user.id,{accountId:req.query.account_id,from:req.query.from,to:req.query.to})});}catch(e){if(e.code==='routine_input_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Routine/day outcome comparison could not be verified.'});}
});
router.get('/journal/reflections',requireAuth,async(req,res)=>{
  try{res.json({reflections:await J.reflectionsForDay(req.user.id,{accountId:req.query.account_id?Number(req.query.account_id):null,date:req.query.date||Guards.dayKey(Date.now())}),timezone:'UTC'});}
  catch(e){if(e.code==='journal_input_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Post-loss writing records could not be verified.'});}
});
router.post('/journal/reflections/:id',requireAuth,async(req,res)=>{
  try{res.json({ok:true,reflection:await J.reflectLoss(req.user.id,Number(req.params.id),req.body||{})});}
  catch(e){if(e.code==='journal_input_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Post-loss writing could not be recorded.'});}
});
router.get('/journal/:date', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT * FROM journal_entries WHERE user_id=? AND entry_date=?').get(req.user.id, req.params.date);
  const tz = (await settingsOf(req)).timezone;
  if(req.query.account_id!==undefined && (typeof req.query.account_id!=='string'||!/^([1-9]\d*)$/.test(req.query.account_id)))return res.status(400).json({error:'Select a canonical positive owned account ID.'});
  const account=await accountOr404(req,res);if(!account)return;
  const accountId=account.id;
  const trades = (await db.prepare(`SELECT * FROM trades WHERE user_id=? AND date(COALESCE(closed_at,opened_at))=date(?)${accountId===null?'':' AND account_id=?'}`).all(...(accountId===null?[req.user.id,req.params.date]:[req.user.id,req.params.date,accountId]))).map((t) => journalTrade(t, tz));
  const guardrailEvents = await Guards.eventsForDay(db,req.user.id,req.params.date,accountId);
  res.json({ entry: row || null, trades,account_id:accountId,execution_summary:Execution.summary(trades,{accountId,date:req.params.date,timezone:'UTC'}),pre_market:await RR.daily(req.user.id,{accountId,date:req.params.date}), journal_summary:J.summary(trades),loss_reflections:await J.reflectionsForDay(req.user.id,{accountId,date:req.params.date}),guardrail_events:guardrailEvents, guardrail_timezone:'UTC',identity_context:await Identity.optional(req.user.id,accountId,req.params.date),state_gate:await StateGate.optional(req.user.id,accountId),daily_intention:await Intention.optional(req.user.id,accountId,{date:req.params.date}),practice:await Practice.optional(req.user.id,{date:req.params.date}),behavior_days:await BehaviorDays.optional(req.user.id,{accountId,from:req.params.date,to:req.params.date}),process_review:await ProcessOutcomes.optional(req.user.id,{accountId,from:req.params.date,to:req.params.date}) });
});
router.post('/journal', requireAuth, async (req, res) => {
  const b = req.body || {};
  let acc;try{RR.dateKey(b.entry_date);acc=(await RR.owned(db,req.user.id,b.account_id)).id;if(Object.prototype.hasOwnProperty.call(b,'pre_market_done')){RR.parseFlag(b.pre_market_done);if(b.pre_market_done!==null && b.entry_date>Guards.dayKey(Date.now()))throw RR.input('Future routine completion cannot be recorded as an actual daily fact.');}}catch(e){if(e.code==='routine_input_invalid')return res.status(e.status).json({error:e.message});throw e;}
  const explicit=Object.prototype.hasOwnProperty.call(b,'pre_market_done');
  const result=await db.tx(async tx=>{const store=db.transactionStore(tx),prior=await store.prepare('SELECT * FROM journal_entries WHERE user_id=? AND entry_date=?').get(req.user.id,b.entry_date);
  const pre_market=explicit?await RR.setManual(store,req.user.id,acc,b.entry_date,b.pre_market_done):await RR.daily(req.user.id,{accountId:acc,date:b.entry_date,store});
  const mirror=(!prior||Number(prior.account_id)===acc);
  const mirrorDone=explicit&&mirror?RR.parseFlag(b.pre_market_done):prior?.pre_market_done??null;
  const mirrorBasis=explicit&&mirror?'self_reported':prior?.pre_market_basis??null,mirrorAt=explicit&&mirror?pre_market.self_report.recorded_at:prior?.pre_market_recorded_at??null;
  // M28: proof_lived / rule_broke / broke_trigger are Ep 4's nightly reflection protocol.
  await store.prepare(`INSERT INTO journal_entries (user_id,account_id,entry_date,market_bias,mood,energy,focus,plan,review,lessons,tomorrow,proof_lived,rule_broke,broke_trigger,screen_time_minutes,pre_market_done,pre_market_basis,pre_market_recorded_at)
    VALUES (@user_id,@account_id,@entry_date,@market_bias,@mood,@energy,@focus,@plan,@review,@lessons,@tomorrow,@proof_lived,@rule_broke,@broke_trigger,@screen_time_minutes,@pre_market_done,@pre_market_basis,@pre_market_recorded_at)
    ON CONFLICT(user_id,entry_date) DO UPDATE SET
      market_bias=excluded.market_bias, mood=excluded.mood, energy=excluded.energy, focus=excluded.focus,
      plan=excluded.plan, review=excluded.review, lessons=excluded.lessons, tomorrow=excluded.tomorrow,
      proof_lived=excluded.proof_lived, rule_broke=excluded.rule_broke, broke_trigger=excluded.broke_trigger,
      screen_time_minutes=excluded.screen_time_minutes,pre_market_done=excluded.pre_market_done,pre_market_basis=excluded.pre_market_basis,pre_market_recorded_at=excluded.pre_market_recorded_at`).run({
    user_id: req.user.id, account_id: acc, entry_date: b.entry_date,
    market_bias: b.market_bias || '', mood: b.mood || null, energy: b.energy || null,
    focus: b.focus || '', plan: b.plan || '', review: b.review || '', lessons: b.lessons || '',
    tomorrow: b.tomorrow || '', proof_lived: b.proof_lived || '', rule_broke: b.rule_broke || '',
    broke_trigger: b.broke_trigger || '', screen_time_minutes: b.screen_time_minutes || null,
    pre_market_done:mirrorDone,pre_market_basis:mirrorBasis,pre_market_recorded_at:mirrorAt,
  });
  return {ok:true,entry:await store.prepare('SELECT * FROM journal_entries WHERE user_id=? AND entry_date=?').get(req.user.id,b.entry_date),pre_market};
  });res.json(result);
});
router.delete('/journal/:id', requireAuth, async (req, res) => {
  await db.prepare('DELETE FROM journal_entries WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

/* -------------------------------------------------------------- strategies */
router.get('/strategies', requireAuth, async (req, res) => {
  const strategies = (await db.prepare('SELECT * FROM strategies WHERE user_id=? ORDER BY active DESC, name').all(req.user.id)).map(parseStrategy);
  const stats = {};
  const tz = (await settingsOf(req)).timezone;
  const rows = (await db.prepare("SELECT * FROM trades WHERE user_id=? AND status='closed'").all(req.user.id)).map((t) => P.decorate(t, tz));
  const cMap = await complianceByTrade(req.user.id);   // M57: one read, aggregated per strategy below
  for (const s of strategies) {
    const list = rows.filter((t) => t.strategy_id === s.id || (t.strategy_name && t.strategy_name === s.name));
    stats[s.id] = { trades: list.length, ...P.segment(list.length ? list : [{}], (t) => t.symbol)[0] };
    const k = list.length ? P.kpis(list, { startingBalance: 10000 }) : null;
    stats[s.id] = k ? { trades: k.trades, net_pnl: k.net_pnl, win_rate: k.win_rate, expectancy_r: k.expectancy_r, profit_factor: k.profit_factor, avg_r: k.avg_r, total_r: k.total_r, ...complianceOver(cMap, list.map((t) => t.id)) } : { trades: 0, ...complianceOver(cMap, []) };
  }
  res.json({ strategies, stats });
});
function strategyValues(cur,b){return {
 name:b.name!==undefined?b.name:cur.name,description:b.description!==undefined?b.description:cur.description,
 market_conditions:b.market_conditions!==undefined?b.market_conditions:cur.market_conditions,timeframes:b.timeframes!==undefined?b.timeframes:cur.timeframes,
 entry_rules:JSON.stringify(b.entry_rules||JSON.parse(cur.entry_rules||'[]')),exit_rules:JSON.stringify(b.exit_rules||JSON.parse(cur.exit_rules||'[]')),checklist:JSON.stringify(b.checklist||JSON.parse(cur.checklist||'[]')),
 risk_rules:b.risk_rules!==undefined?b.risk_rules:cur.risk_rules,target_r_multiple:b.target_r_multiple!==undefined?num(b.target_r_multiple,2):cur.target_r_multiple,
 colour:b.colour||cur.colour,active:b.active===undefined?cur.active:(b.active?1:0)};}
router.post('/strategies',requireAuth,async(req,res)=>{const b=req.body||{};if(!b.name)return res.status(400).json({error:'Name is required'});try{const out=await db.tx(async tx=>{const store=db.transactionStore(tx),fields={name:b.name,description:b.description||'',market_conditions:b.market_conditions||'',timeframes:b.timeframes||'',entry_rules:JSON.stringify(b.entry_rules||[]),exit_rules:JSON.stringify(b.exit_rules||[]),checklist:JSON.stringify(b.checklist||[]),risk_rules:b.risk_rules||'',target_r_multiple:num(b.target_r_multiple,2),colour:b.colour||'#4f8cff',active:b.active===false?0:1};const r=await store.prepare('INSERT INTO strategies(user_id,name,description,market_conditions,timeframes,entry_rules,exit_rules,checklist,risk_rules,target_r_multiple,colour,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id,fields.name,fields.description,fields.market_conditions,fields.timeframes,fields.entry_rules,fields.exit_rules,fields.checklist,fields.risk_rules,fields.target_r_multiple,fields.colour,fields.active),id=r.lastInsertRowid,version=await snapshotStrategyVersion(id,fields,'Strategy created.',store);return {ok:true,version,strategy:parseStrategy(await store.prepare('SELECT * FROM strategies WHERE id=? AND user_id=?').get(id,req.user.id))};});res.json(out);}catch{res.status(503).json({error:'Strategy/version creation could not be recorded; no unsnapshotted setup committed.'});}});
const strategyChangeRoute=fn=>async(req,res)=>{try{const out=await fn(req);if(out.strategy)out.strategy=parseStrategy(out.strategy);res.json(out);}catch(e){if(e.code==='rule_change_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Rule-change guidance unavailable; original finance/risk/permission state unchanged.'});}};
function strategyKey(value){if(typeof value!=='string'||!(/^[1-9]\d*$/.test(value))||!Number.isSafeInteger(Number(value)))throw RuleChanges.invalid('Strategy not found.',404);return Number(value);}
router.get('/strategy-changes',requireAuth,strategyChangeRoute(req=>RuleChanges.inspect(req.user.id,null,req.query.quarter_start??null)));
router.get('/strategies/:id/change-discipline',requireAuth,strategyChangeRoute(req=>RuleChanges.inspect(req.user.id,strategyKey(req.params.id),req.query.quarter_start??null)));
router.post('/strategies/:id/change-preview',requireAuth,strategyChangeRoute(async req=>{const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['revision','changes'].includes(k))||!b.changes||typeof b.changes!=='object'||Array.isArray(b.changes)||typeof b.revision!=='string'||!/^[a-f0-9]{64}$/.test(b.revision))throw RuleChanges.invalid('Use the displayed revision and proposed fields only.');if(Object.keys(b.changes).some(k=>!['name','description','market_conditions','timeframes','entry_rules','exit_rules','checklist','risk_rules','target_r_multiple','colour','active'].includes(k)))throw RuleChanges.invalid('Propose only saved strategy fields, not clocks/owner/permission authority.');const view=await RuleChanges.inspect(req.user.id,strategyKey(req.params.id));if(view.revision!==b.revision)throw RuleChanges.invalid('Strategy or owned quarter history changed; explicitly reload.',409);const next=strategyValues(view.strategy,b.changes);return {...view,preview:RuleChanges.proposal(view.report,RuleChanges.diff(view.strategy,next))};}));
router.put('/strategies/:id',requireAuth,async(req,res)=>{const b=req.body||{};let id;try{id=strategyKey(req.params.id);}catch(e){return res.status(e.status).json({error:e.message,code:e.code});}try{const out=await db.tx(async tx=>{const store=db.transactionStore(tx),cur=await store.prepare('SELECT * FROM strategies WHERE id=? AND user_id=?').get(id,req.user.id);if(!cur)return null;if(b.strategy_revision!==undefined){if(typeof b.strategy_revision!=='string'||!/^[a-f0-9]{64}$/.test(b.strategy_revision))throw RuleChanges.invalid('Use the displayed strategy revision.');const seen=await RuleChanges.inspectOn(store,req.user.id,id);if(seen.revision!==b.strategy_revision)throw RuleChanges.invalid('Strategy or global owned quarter history changed. Reload before editing.',409);}const next=strategyValues(cur,b),changedField=strategyRulesChanged(cur,next);let version=await currentStrategyVersion(id,store);if(!version)version=await snapshotStrategyVersion(id,cur,'First pre-edit snapshot of current unversioned strategy; not reconstructed original entry rules.',store);
 await store.prepare(`UPDATE strategies SET name=@name,description=@description,market_conditions=@market_conditions,timeframes=@timeframes,
 entry_rules=@entry_rules,exit_rules=@exit_rules,checklist=@checklist,risk_rules=@risk_rules,target_r_multiple=@target_r_multiple,colour=@colour,active=@active WHERE id=@id AND user_id=@user_id`).run({id,user_id:req.user.id,...next});let delta=RuleChanges.diff(cur,next);if(changedField){const old=version;version=await snapshotStrategyVersion(id,next,`Rule changed: ${changedField}. Trades from here on are attributed to v${old+1}; trades already logged keep the version they were taken under.`,store);delta=await RuleChanges.recordOn(store,req.user.id,id,cur,next,old,version);}const guidance=await RuleChanges.optionalOn(store,req.user.id,id);return {ok:true,version,new_version:!!changedField,changed_field:changedField,changed_fields:delta.fields,rule_delta:delta,revision_checked:b.strategy_revision!==undefined,quarter_rule_changes:guidance.report,strategy:parseStrategy(await store.prepare('SELECT * FROM strategies WHERE id=? AND user_id=?').get(id,req.user.id))};});if(!out)return res.status(404).json({error:'Strategy not found'});res.json(out);}catch(e){if(e.code==='rule_change_invalid')return res.status(e.status).json({error:e.message,code:e.code});res.status(503).json({error:'Strategy/version/change edit not recorded; current rules and original facts unchanged.'});}});
/* M102 — the version history has to be READABLE or the table is write-only and the fix is
 * half a fix: a trader who cannot see that their strategy changed in March cannot interpret
 * their own expectancy. Newest first, with the note that says WHY each version exists and
 * how many trades were taken under it, which is the number that decides whether a comparison
 * between two versions means anything at all. */
router.get('/strategies/:id/versions', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const own = await db.prepare('SELECT id FROM strategies WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!own) return res.status(404).json({ error: 'Strategy not found' });
  const rows = await db.prepare(`SELECT id, version, name, description, market_conditions, timeframes,
      entry_rules, exit_rules, checklist, risk_rules, target_r_multiple, note, created_at
    FROM strategy_versions WHERE strategy_id=? ORDER BY version DESC`).all(id);
  const counts = await db.prepare('SELECT strategy_version AS v, COUNT(*) AS n FROM trades WHERE strategy_id=? GROUP BY strategy_version').all(id);
  const byV = {}; for (const c of (counts || [])) byV[c.v === null ? 'null' : c.v] = c.n;
  const unattributed = byV['null'] || 0;
  res.json({
    ok: true, strategy_id: id, count: (rows || []).length,
    versions: (rows || []).map((r) => ({
      ...r,
      entry_rules: safeJson(r.entry_rules), exit_rules: safeJson(r.exit_rules), checklist: safeJson(r.checklist),
      trades: byV[r.version] || 0,
    })),
    trades_with_no_recorded_version: unattributed,
    comparable: (rows || []).filter((r) => (byV[r.version] || 0) >= 30).map((r) => r.version),
    comparable_note: 'Ep 27 asks for 30-50 trades minimum before a version\'s numbers mean anything. Versions listed in `comparable` clear that floor; comparing two versions where either is below it is not evidence.',
  });
});
router.delete('/strategies/:id', requireAuth, async (req, res) => {
  await db.prepare('DELETE FROM strategies WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- accounts */
router.get('/accounts', requireAuth, async (req, res) => {
  const accounts = await db.prepare('SELECT * FROM accounts WHERE user_id=? AND archived=0 ORDER BY is_default DESC, id').all(req.user.id);
  const tz = (await settingsOf(req)).timezone;
  const out = await Promise.all(accounts.map(async (a) => {
    const rows = (await db.prepare('SELECT * FROM trades WHERE user_id=? AND account_id=?').all(req.user.id, a.id)).map((t) => P.decorate(t, tz));
    const closed = rows.filter((t) => t.status !== 'open');
    const k = P.kpis(closed, { startingBalance: a.starting_balance });
    const openRisk = rows.filter((t) => t.status === 'open').reduce((s, t) => s + num(t.risk_amount), 0);
    return {
      ...a,
      stats: {
        trades: k.trades, net_pnl: k.net_pnl, win_rate: k.win_rate, expectancy_r: k.expectancy_r,
        profit_factor: k.profit_factor, max_drawdown_pct: k.max_drawdown_pct, current_drawdown_pct: k.current_drawdown_pct,
        equity: a.starting_balance + k.net_pnl, open_trades: rows.length - closed.length, open_risk: r2(openRisk),
        target_progress: a.profit_target_pct ? r2((k.net_pnl / (a.starting_balance * a.profit_target_pct / 100)) * 100) : null,
        dd_limit_used: a.max_drawdown_pct ? r2((Math.abs(Math.min(0, k.current_drawdown_pct)) / a.max_drawdown_pct) * 100) : null,
      },
    };
  }));
  res.json({ accounts: out });
});
router.post('/accounts', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Account name is required' });
  // M9: the guardrail is enforced HERE, at the boundary the finding names — `api.js` stored
  // `risk_per_trade_pct` via num() with no clamp at all, so an account could be configured at
  // any percentage and every later signal sized from it. A STORED value is a standing
  // instruction that silently drives every future trade, so going above the 0.5 % guardrail
  // (Ep 31) requires the unlock to be asked for explicitly and is persisted beside it; 1 %
  // (Ep 21) is the ceiling either way.
  let maxTrades;
  try { maxTrades = b.max_trades_day === undefined ? Guards.DEFAULT_CAP : Guards.parseCap(b.max_trades_day); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  let profitLimit;
  try { profitLimit = Guards.parseProfitLimit(b.daily_profit_limit_pct); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  let sessionLimit;
  try { sessionLimit = SessionTime.parseLimit(b.max_session_minutes); }
  catch(e){return res.status(400).json({error:e.message});}
  let routineConfig;try{routineConfig=Routine.config(b);}catch(e){return res.status(400).json({error:e.message});}
  // M110 — the news stand-down is two settings, parsed together by the owner module (which
  // also refuses the old single-number shape rather than choosing a side for the caller).
  let newsWindow;
  try { newsWindow = NewsWindow.parsePair(b); }
  catch (e) { return res.status(400).json({ error: e.message, code: e.code || 'news_window_invalid' }); }
  const unlocked = !!b.risk_unlocked;
  const riskPct = I.clampRiskPct(b.risk_per_trade_pct, { fallback: I.RISK_GUARDRAIL.default_pct, unlocked });
  const info = await db.prepare(`INSERT INTO accounts (user_id,name,broker,account_type,currency,starting_balance,current_balance,risk_per_trade_pct,risk_unlocked,max_trades_day,daily_loss_limit_pct,max_drawdown_pct,profit_target_pct,daily_profit_limit_pct,max_session_minutes,routine_window_start,routine_timezone,routine_lead_minutes,routine_order,news_block_before_min,news_settle_after_min)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    req.user.id, b.name, b.broker || '', b.account_type || 'live', b.currency || 'USD',
    num(b.starting_balance, 10000), num(b.starting_balance, 10000), riskPct, unlocked ? 1 : 0, maxTrades,
    num(b.daily_loss_limit_pct, 3), num(b.max_drawdown_pct, 10), num(b.profit_target_pct, 8), profitLimit, sessionLimit,routineConfig.routine_window_start,routineConfig.routine_timezone,routineConfig.routine_lead_minutes,routineConfig.routine_order,
    newsWindow.before_min, newsWindow.after_min);
  res.json({
    ok: true,
    account: await db.prepare('SELECT * FROM accounts WHERE id=?').get(info.lastInsertRowid),
    risk_note: I.riskGuardrailNote(b.risk_per_trade_pct, riskPct, { unlocked }),
    news_note: NewsWindow.noteFor(newsWindow, newsWindow.warnings),
  });
});
router.put('/accounts/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const cur = await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: 'Account not found' });
  const b = req.body || {};
  let maxTrades;
  try { maxTrades = b.max_trades_day === undefined ? Guards.configuredCap(cur) : Guards.parseCap(b.max_trades_day); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  let profitLimit;
  try { profitLimit = b.daily_profit_limit_pct === undefined ? Guards.parseProfitLimit(cur.daily_profit_limit_pct) : Guards.parseProfitLimit(b.daily_profit_limit_pct); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  let sessionLimit;
  try { sessionLimit = SessionTime.parseLimit(b.max_session_minutes === undefined ? cur.max_session_minutes : b.max_session_minutes); }
  catch(e){return res.status(400).json({error:e.message});}
  let routineConfig;try{routineConfig=Routine.config({...cur,...b});}catch(e){return res.status(400).json({error:e.message});}
  // M110: only the fields THIS request supplies are parsed; an omitted field keeps the
  // stored pair (already clamped by plan()), so an unrelated edit such as a rename cannot
  // silently move the trader's news windows. A stored pair outside the bounds is clamped on
  // READ by the engine as well, so this is defence in depth rather than the only guard.
  let newsWindow;
  try { newsWindow = NewsWindow.parsePair(b, NewsWindow.plan(cur)); }
  catch (e) { return res.status(400).json({ error: e.message, code: e.code || 'news_window_invalid' }); }
  // M9: the same guardrail on the update path, which also stored the value via num() with no
  // clamp. Only a value THIS request supplies is clamped — a row stored above the guardrail
  // before the fix is left untouched here and clamped on READ (bots/index.js) instead, so an
  // unrelated edit such as a rename cannot silently move the trader's risk setting.
  const unlocked = b.risk_unlocked !== undefined ? !!b.risk_unlocked : !!cur.risk_unlocked;
  const riskPct = b.risk_per_trade_pct !== undefined
    ? I.clampRiskPct(b.risk_per_trade_pct, { fallback: num(cur.risk_per_trade_pct, I.RISK_GUARDRAIL.default_pct), unlocked })
    : num(cur.risk_per_trade_pct, I.RISK_GUARDRAIL.default_pct);
  await db.prepare(`UPDATE accounts SET name=@name, broker=@broker, account_type=@account_type, currency=@currency,
    starting_balance=@starting_balance, risk_per_trade_pct=@risk_per_trade_pct, risk_unlocked=@risk_unlocked, max_trades_day=@max_trades_day, daily_loss_limit_pct=@daily_loss_limit_pct,
    max_drawdown_pct=@max_drawdown_pct, profit_target_pct=@profit_target_pct, daily_profit_limit_pct=@daily_profit_limit_pct, max_session_minutes=@max_session_minutes,routine_window_start=@routine_window_start,routine_timezone=@routine_timezone,routine_lead_minutes=@routine_lead_minutes,routine_order=@routine_order, prop_preset=@prop_preset,
    news_block_before_min=@news_block_before_min, news_settle_after_min=@news_settle_after_min,
    prop_rules=@prop_rules, archived=@archived WHERE id=@id AND user_id=@user_id`).run({
    id, user_id: req.user.id,
    name: b.name !== undefined ? b.name : cur.name,
    broker: b.broker !== undefined ? b.broker : cur.broker,
    account_type: b.account_type !== undefined ? b.account_type : cur.account_type,
    currency: b.currency !== undefined ? b.currency : cur.currency,
    starting_balance: b.starting_balance !== undefined ? num(b.starting_balance, cur.starting_balance) : cur.starting_balance,
    risk_per_trade_pct: riskPct,
    risk_unlocked: unlocked ? 1 : 0,
    max_trades_day: maxTrades,
    daily_profit_limit_pct: profitLimit,
    max_session_minutes: sessionLimit,
    news_block_before_min: newsWindow.before_min,
    news_settle_after_min: newsWindow.after_min,
    ...routineConfig,
    daily_loss_limit_pct: b.daily_loss_limit_pct !== undefined ? num(b.daily_loss_limit_pct, cur.daily_loss_limit_pct) : cur.daily_loss_limit_pct,
    max_drawdown_pct: b.max_drawdown_pct !== undefined ? num(b.max_drawdown_pct, cur.max_drawdown_pct) : cur.max_drawdown_pct,
    prop_preset: b.prop_preset !== undefined ? (b.prop_preset ? String(b.prop_preset) : null) : cur.prop_preset,
    prop_rules: b.prop_rules !== undefined ? (b.prop_rules ? JSON.stringify(b.prop_rules) : null) : cur.prop_rules,
    profit_target_pct: b.profit_target_pct !== undefined ? num(b.profit_target_pct, cur.profit_target_pct) : cur.profit_target_pct,
    archived: b.archived === undefined ? cur.archived : (b.archived ? 1 : 0),
  });
  res.json({
    ok: true,
    account: await db.prepare('SELECT * FROM accounts WHERE id=?').get(id),
    risk_note: b.risk_per_trade_pct !== undefined ? I.riskGuardrailNote(b.risk_per_trade_pct, riskPct, { unlocked }) : null,
    news_note: NewsWindow.noteFor(newsWindow, newsWindow.warnings),
  });
});
router.delete('/accounts/:id', requireAuth, async (req, res) => {
  await db.prepare('DELETE FROM accounts WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------- instruments */
router.get('/instruments', requireAuth, async (req, res) => {
  res.json({ instruments: await db.prepare('SELECT * FROM instruments WHERE user_id IS NULL OR user_id=? ORDER BY asset_class, symbol').all(req.user.id) });
});
router.post('/instruments', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.symbol) return res.status(400).json({ error: 'Symbol is required' });
  await db.prepare(`INSERT INTO instruments (user_id,symbol,name,asset_class,exchange,currency,tick_size,pip_size,value_per_point,unit)
    VALUES (@user_id,@symbol,@name,@asset_class,@exchange,@currency,@tick_size,@pip_size,@value_per_point,@unit)
    ON CONFLICT(user_id,symbol) DO UPDATE SET name=excluded.name, asset_class=excluded.asset_class, exchange=excluded.exchange,
      currency=excluded.currency, tick_size=excluded.tick_size, pip_size=excluded.pip_size,
      value_per_point=excluded.value_per_point, unit=excluded.unit`).run({
    user_id: req.user.id, symbol: String(b.symbol).toUpperCase(), name: b.name || b.symbol,
    asset_class: b.asset_class || 'stocks', exchange: b.exchange || '', currency: b.currency || 'USD',
    tick_size: num(b.tick_size, 0.01), pip_size: num(b.pip_size, 0.01), value_per_point: num(b.value_per_point, 1),
    unit: b.unit || I.unitLabel(b.asset_class),
  });
  res.json({ ok: true });
});
router.delete('/instruments/:id', requireAuth, async (req, res) => {
  await db.prepare('DELETE FROM instruments WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- goals */
router.get('/goals', requireAuth, async (req, res) => {
  const goals = await db.prepare('SELECT * FROM goals WHERE user_id=? ORDER BY done, due_date').all(req.user.id);
  const tz = (await settingsOf(req)).timezone;
  const closed = (await db.prepare("SELECT * FROM trades WHERE user_id=? AND status='closed'").all(req.user.id)).map((t) => P.decorate(t, tz));
  const now = new Date();
  const out = goals.map((g) => {
    let from;
    if (g.period === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (g.period === 'quarter') from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    else from = new Date(now.getFullYear(), 0, 1);
    const list = closed.filter((t) => new Date(t.closed_at || t.opened_at) >= from);
    const k = P.kpis(list, { startingBalance: 10000 });
    const actual = g.metric === 'net_pnl' ? k.net_pnl : g.metric === 'expectancy_r' ? k.expectancy_r
      : g.metric === 'win_rate' ? k.win_rate : g.metric === 'profit_factor' ? (k.profit_factor || 0)
        : g.metric === 'adherence' ? (k.avg_adherence || 0) : k.trades;
    return { ...g, actual: r2(actual), progress: g.target ? Math.max(0, Math.min(200, r2((actual / g.target) * 100))) : 0 };
  });
  res.json({ goals: out });
});
router.post('/goals', requireAuth, async (req, res) => {
  const b = req.body || {};
  const info = await db.prepare('INSERT INTO goals (user_id,title,metric,target,period,due_date) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, b.title || 'Goal', b.metric || 'net_pnl', num(b.target, 0), b.period || 'month', b.due_date || null);
  res.json({ ok: true, goal: await db.prepare('SELECT * FROM goals WHERE id=?').get(info.lastInsertRowid) });
});
router.delete('/goals/:id', requireAuth, async (req, res) => { await db.prepare('DELETE FROM goals WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id); res.json({ ok: true }); });
router.put('/goals/:id', requireAuth, async (req, res) => {
  const b = req.body || {};
  await db.prepare('UPDATE goals SET title=COALESCE(?,title), metric=COALESCE(?,metric), target=COALESCE(?,target), period=COALESCE(?,period), done=COALESCE(?,done) WHERE id=? AND user_id=?')
    .run(b.title || null, b.metric || null, b.target !== undefined ? num(b.target) : null, b.period || null, b.done === undefined ? null : (b.done ? 1 : 0), Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

/* -------------------------------------------------------------- watchlist */
router.get('/watchlist', requireAuth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM watchlist WHERE user_id=? ORDER BY symbol').all(req.user.id);
  res.json({ watchlist: rows });
});
router.post('/watchlist', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.symbol) return res.status(400).json({ error: 'Symbol required' });
  await db.prepare(`INSERT INTO watchlist (user_id,symbol,asset_class,thesis,bias,key_level,catalyst) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id,symbol) DO UPDATE SET thesis=excluded.thesis, bias=excluded.bias, key_level=excluded.key_level, catalyst=excluded.catalyst`)
    .run(req.user.id, String(b.symbol).toUpperCase(), b.asset_class || 'stocks', b.thesis || '', b.bias || 'neutral', b.key_level || '', b.catalyst || '');
  res.json({ ok: true });
});
router.delete('/watchlist/:id', requireAuth, async (req, res) => { await db.prepare('DELETE FROM watchlist WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id); res.json({ ok: true }); });

/* ----------------------------------------------- chart drawings (per market) */

/**
 * Drawings the trader puts on a chart are their own work, so they live in the
 * database next to the journal — not in one browser's localStorage where a new
 * device or a cleared cache silently loses them.
 *
 * Stored per (user, symbol, timeframe). PUT replaces the set for that market:
 * the client owns the drawing list, the server owns where it is kept.
 */
router.get('/chart/drawings', requireAuth, async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const tf = String(req.query.tf || '15m');
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  const rows = await db.prepare('SELECT id,kind,points,style,updated_at FROM chart_drawings WHERE user_id=? AND symbol=? AND timeframe=? ORDER BY id')
    .all(req.user.id, symbol, tf);
  res.json({
    symbol, timeframe: tf,
    drawings: rows.map((r) => ({
      id: r.id, kind: r.kind,
      points: safeJson(r.points, []), style: safeJson(r.style, {}), updated_at: r.updated_at,
    })),
  });
});

router.put('/chart/drawings', requireAuth, async (req, res) => {
  const b = req.body || {};
  const symbol = String(b.symbol || '').toUpperCase();
  const tf = String(b.timeframe || b.tf || '15m');
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  const list = Array.isArray(b.drawings) ? b.drawings.slice(0, 400) : [];
  const KINDS = ['trend', 'hline', 'ray', 'rect', 'fib', 'measure', 'text'];
  await db.prepare('DELETE FROM chart_drawings WHERE user_id=? AND symbol=? AND timeframe=?').run(req.user.id, symbol, tf);
  for (const d of list) {
    const kind = KINDS.includes(d.kind) ? d.kind : 'trend';
    const pts = (Array.isArray(d.points) ? d.points : []).slice(0, 8).map((p) => ({ t: Number(p.t) || 0, p: Number(p.p) || 0 }));
    await db.prepare('INSERT INTO chart_drawings (user_id,symbol,timeframe,kind,points,style) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, symbol, tf, kind, JSON.stringify(pts), JSON.stringify(d.style && typeof d.style === 'object' ? d.style : {}));
  }
  const n = await db.prepare('SELECT COUNT(*) c FROM chart_drawings WHERE user_id=? AND symbol=? AND timeframe=?').get(req.user.id, symbol, tf);
  res.json({ ok: true, symbol, timeframe: tf, saved: n.c });
});

router.delete('/chart/drawings', requireAuth, async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const tf = String(req.query.tf || '15m');
  await db.prepare('DELETE FROM chart_drawings WHERE user_id=? AND symbol=? AND timeframe=?').run(req.user.id, symbol, tf);
  res.json({ ok: true, cleared: true });
});

/* ------------------------------------------------------------------ tools */
router.post('/tools/size', requireAuth, async (req, res) => {
  const b = req.body || {};
  const instruments = await instrumentMap(req.user.id);
  const spec = instruments[String(b.symbol || '').toUpperCase()] || I.genericSpec(b.symbol, b.asset_class);
  const acc = b.account_id ? await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(Number(b.account_id), req.user.id) : null;
  const balance = num(b.balance, acc ? acc.current_balance : 10000);
  // M9: this is the endpoint that ACTUALLY sizes a position, and it took `risk_pct` straight
  // from the request body — measured before the fix: a body saying risk_pct=10 sized a $10k
  // account at $995 of risk, 9.95 % of equity, against a stated maximum of 1 %. A number typed
  // into the calculator is the manual act the decision asks for, so it is honoured up to the
  // 1 % absolute maximum (Ep 21) and the clamp is reported rather than silent; the account
  // fallback is clamped by that account's own persisted unlock.
  const riskRequested = b.risk_pct !== undefined && b.risk_pct !== null && b.risk_pct !== '';
  const riskAsked = riskRequested ? b.risk_pct : (acc ? acc.risk_per_trade_pct : I.RISK_GUARDRAIL.default_pct);
  const riskPct = riskRequested
    ? I.clampRiskPct(b.risk_pct, { fallback: I.RISK_GUARDRAIL.default_pct, unlocked: true })
    : I.clampRiskPct(acc ? acc.risk_per_trade_pct : I.RISK_GUARDRAIL.default_pct,
        { fallback: I.RISK_GUARDRAIL.default_pct, unlocked: !!(acc && acc.risk_unlocked) });
  const riskNote = I.riskGuardrailNote(riskAsked, riskPct, { unlocked: true });
  const entry = num(b.entry), stop = num(b.stop), target = num(b.target);
  const out = I.positionSize({ balance, riskPct, entry, stop, asset_class: spec.asset_class, value_per_point: spec.value_per_point, maxSize: b.max_size });
  const risk = I.riskAmount({ entry, stop, size: out.size, value_per_point: spec.value_per_point });
  const reward = target ? Math.abs(target - entry) * out.size * (num(spec.value_per_point, 1) || 1) : null;
  res.json({
    ...out, symbol: spec.symbol, name: spec.name, asset_class: spec.asset_class,
    value_per_point: spec.value_per_point, unit: out.unit || spec.unit,
    risk: risk, reward: reward ? r2(reward) : null,
    rr: risk && reward ? r2(reward / risk) : (b.target && b.entry && b.stop ? r2(Math.abs(target - entry) / Math.abs(entry - stop)) : null),
    breakeven_win_rate: b.target && b.entry && b.stop ? r2((Math.abs(entry - stop) / (Math.abs(target - entry) + Math.abs(entry - stop))) * 100) : null,
    pips_to_stop: spec.pip_size ? I.pipsMoved({ entry, exit: stop, pip_size: spec.pip_size, direction: 'long' }) : null,
    pips_to_target: target && spec.pip_size ? Math.abs(r2((target - entry) / spec.pip_size)) : null,
    percent_move_stop: entry && stop ? r2((Math.abs(entry - stop) / entry) * 100) : null,
    // M9: reported beside `note`, never over it — `note` is positionSize()'s own wording
    // ("risk too small for 1 contract") and scripts/api-test.js asserts on that string.
    risk_pct_applied: riskPct,
    risk_note: riskNote,
  });
});

router.post('/tools/expectancy', requireAuth, (req, res) => {
  const b = req.body || {};
  const wr = num(b.win_rate) / 100, aw = num(b.avg_win_r, 1), al = Math.abs(num(b.avg_loss_r, 1));
  const exp = wr * aw - (1 - wr) * al;
  res.json({
    expectancy_r: Math.round(exp * 10000) / 10000,
    expectancy_per_100_trades: Math.round(exp * 10000) / 100,
    breakeven_win_rate: (al + aw) ? Math.round((al / (al + aw)) * 10000) / 100 : 0,
    verdict: exp > 0.2 ? 'Strong edge' : exp > 0.05 ? 'Thin but real edge' : exp > 0 ? 'Marginal — costs may erase it' : 'Negative expectancy',
  });
});

/* --------------------------------------------------------------- market */
router.get('/market/calendar', requireAuth, wrap(async (req, res) => {
  const settings = await settingsOf(req);
  const cal = await M.getCalendar({ timezone: settings.timezone });
  const impact = req.query.impact;
  const events = impact && impact !== 'all' ? cal.events.filter((e) => e.impact === impact) : cal.events;
  const focus = (settings.focus_symbols || []).map((s) => (s.length > 3 && /^[A-Z]{6}$/.test(s) ? s.slice(0, 3) : s));
  res.json({ ...cal, events, high_impact_count: cal.events.filter((e) => e.impact === 'high').length, focus_currencies: focus });
}));
router.get('/market/news', requireAuth, wrap(async (req, res) => {
  const news = await M.getNews({ category: req.query.category || 'all', limit: num(req.query.limit, 60) });
  const watch = ((await settingsOf(req)).focus_symbols || []).map((s) => String(s).toUpperCase());
  const items = news.items.map((i) => ({ ...i, relevant: watch.some((w) => i.title.toUpperCase().includes(w.replace('USDT', '').replace('USD', '')) && w.length >= 3) }));
  res.json({ ...news, items, relevant_count: items.filter((i) => i.relevant).length });
}));
router.get('/market/quotes', requireAuth, wrap(async (req, res) => {
  const symbols = String(req.query.symbols || '').split(',').map((s) => s.trim()).filter(Boolean);
  const fallback = (await settingsOf(req)).focus_symbols || [];
  const q = await M.getQuotes(symbols.length ? symbols : fallback);
  res.json(q);
}));
router.get('/market/overview', requireAuth, wrap(async (req, res) => {
  const settings = await settingsOf(req);
  const tz = settings.timezone;
  const [cal, news, fng, quotes] = await Promise.all([
    M.getCalendar({ timezone: tz }), M.getNews({ limit: 40 }),
    M.getFearGreed(), M.getQuotes(settings.focus_symbols || []),
  ]);
  res.json({
    calendar: { ok: cal.ok, error: cal.error, events: (cal.events || []).filter((e) => e.impact !== 'low' && e.impact !== 'holiday').slice(0, 30) },
    news: { ok: news.ok, error: news.error, items: news.items.slice(0, 30), feeds: news.feeds },
    fear_greed: fng,
    quotes,
    fetched_at: new Date().toISOString(),
  });
}));

/* ------------------------------------------------------- import / export */
const backup=fn=>async(req,res)=>{try{await fn(req,res);}catch{return res.status(503).json({error:'Screenshot-enabled backup unavailable; existing financial truth unchanged.'});}};
router.get('/export/csv', requireAuth, backup(async (req, res) => {
  const tz = (await settingsOf(req)).timezone;
  const f = tradeFilters(req);
  const { where, params, order } = T.listQuery(f);
  const rows = (await db.tx(async tx=>{const store=db.transactionStore(tx);return Emotions.portableRowsOn(store,await Screenshots.portableRowsOn(store,await store.prepare(`SELECT * FROM trades WHERE ${where} ORDER BY ${order}`).all({...params,user_id:req.user.id})));})).map(t=>({...P.decorate(t,tz),screenshot_views_json:JSON.stringify(t.screenshots),emotion_events_json:JSON.stringify(t.emotion_events)}));
  const cols = ['id', 'account_id', 'symbol', 'asset_class', 'direction', 'status', 'opened_at', 'closed_at', 'entry', 'exit', 'stop', 'target',
    'size', 'fees', 'gross_pnl', 'net_pnl', 'risk_amount', 'r_multiple', 'mae_r', 'mfe_r', 'planned_r', 'exit_reason', 'strategy_name',
    'setup_grade', 'entry_model', 'entry_tf', 'entry_evidence', 'session', 'timeframe' , 'timeframes', 'emotion_before', 'emotion_after', 'confidence', 'adherence', 'mistakes', 'tags',
    'thesis', 'lesson', 'execution_notes', 'notes', 'screenshot_url', 'screenshot_views_json', 'entry_confluences', 'entry_confluences_source', 'entry_confluences_recorded_at','emotion_events_json'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="trades-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

router.get('/export/json', requireAuth, backup(async (req, res) => {
  const userId = req.user.id;
  const data = {
    exported_at: new Date().toISOString(), version: 1,
    confluence_labels:(await Confluences.vocabulary(userId)).labels,
    period_reviews:await PeriodReviews.exportOwned(userId),
    strategy_rule_changes:await RuleChanges.exportOwned(userId),
    identity_declarations:await Identity.exportOwned(userId),
    state_gate_answers:await StateGate.exportOwned(userId),
    daily_intentions:await Intention.exportOwned(userId),
    practice_sessions:await Practice.exportOwned(userId),
    opportunity_history:await Opportunities.exportOwned(userId),
    user: { email: req.user.email, name: req.user.name, settings: req.user.settings },
    accounts: await db.prepare('SELECT * FROM accounts WHERE user_id=?').all(userId),
    strategies: (await db.prepare('SELECT * FROM strategies WHERE user_id=?').all(userId)).map(parseStrategy),
    instruments: await db.prepare('SELECT * FROM instruments WHERE user_id=?').all(userId),
    trades: await db.tx(async tx=>{const store=db.transactionStore(tx);return Emotions.portableRowsOn(store,await Screenshots.portableRowsOn(store,await store.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY opened_at').all(userId)));}),
    journal: await db.prepare('SELECT * FROM journal_entries WHERE user_id=?').all(userId),
    goals: await db.prepare('SELECT * FROM goals WHERE user_id=?').all(userId),
    watchlist: await db.prepare('SELECT * FROM watchlist WHERE user_id=?').all(userId),
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="tradejournal-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));

/** Import from CSV — auto-detects the usual broker column names. */
router.post('/import/csv', requireAuth, async (req, res) => {
  const text = (req.body && req.body.csv) || '';
  if (!text.trim()) return res.status(400).json({ error: 'No CSV content provided.' });
  const rows = parseCsv(text);
  if (rows.length < 2) return res.status(400).json({ error: 'CSV needs a header row and at least one data row.' });
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const findCol = (names) => { for (const n of names) { const i = header.indexOf(n); if (i > -1) return i; } return -1; };
  const map = {
    symbol: findCol(['symbol', 'ticker', 'instrument', 'pair', 'market', 'contract']),
    direction: findCol(['direction', 'side', 'type', 'action', 'buy/sell', 'position']),
    size: findCol(['size', 'quantity', 'qty', 'volume', 'lots', 'shares', 'contracts', 'units']),
    entry: findCol(['entry', 'entry_price', 'open_price', 'price_open', 'buy_price', 'open', 'entryprice']),
    exit: findCol(['exit', 'exit_price', 'close_price', 'price_close', 'sell_price', 'close', 'exitprice']),
    stop: findCol(['stop', 'stop_loss', 'sl', 'stop_price', 'stoploss']),
    target: findCol(['target', 'take_profit', 'tp', 'profit_target']),
    opened: findCol(['opened_at', 'open_time', 'entry_time', 'date', 'datetime', 'open_date', 'time_open', 'opened']),
    closed: findCol(['closed_at', 'close_time', 'exit_time', 'close_date', 'time_close', 'closed']),
    fees: findCol(['fees', 'commission', 'fee', 'cost', 'swap']),
    strategy: findCol(['strategy_name', 'strategy', 'setup', 'system', 'playbook']),
    entry_model: findCol(['entry_model']), entry_tf: findCol(['entry_tf']), entry_evidence: findCol(['entry_evidence']),
    tags: findCol(['tags', 'tag', 'labels']),
    notes: findCol(['notes', 'note', 'comment', 'comments', 'remark']),
    emotion_events_json:findCol(['emotion_events_json']), entry_confluences:findCol(['entry_confluences']), screenshot_url: findCol(['screenshot_url']), screenshot_views_json: findCol(['screenshot_views_json']),
    net: findCol(['net_pnl', 'net', 'profit', 'pnl', 'p/l', 'realized_pnl', 'profit_loss', 'net_profit']),
  };
  if (map.symbol < 0) return res.status(400).json({ error: 'Could not find a symbol/ticker column in the CSV.' });
  const accountId = num(req.body.account_id, 0) || (await db.prepare('SELECT id FROM accounts WHERE user_id=? ORDER BY is_default DESC LIMIT 1').get(req.user.id) || {}).id;
  if(!Number.isSafeInteger(accountId)||!await db.prepare('SELECT id FROM accounts WHERE id=? AND user_id=?').get(accountId,req.user.id))return res.status(404).json({error:'Owned destination account not found.'});
  const instruments = await instrumentMap(req.user.id);
  const tz = (await settingsOf(req)).timezone;
  let inserted = 0, skipped = 0;
  const errors = [];
  const collected = [];
  {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.length || r.every((c) => !String(c).trim())) continue;
      try {
        const symbol = String(r[map.symbol] || '').toUpperCase().trim();
        if (!symbol) { skipped++; continue; }
        const rawDir = map.direction > -1 ? String(r[map.direction] || '').toLowerCase() : 'long';
        const direction = /sell|short|s/.test(rawDir) && !/buy|long/.test(rawDir) ? 'short' : 'long';
        const spec = instruments[symbol] || null;
        const trade = T.normalise({
          symbol, direction,
          size: map.size > -1 ? r[map.size] : 1,
          entry: map.entry > -1 ? r[map.entry] : null,
          exit: map.exit > -1 ? r[map.exit] : null,
          stop: map.stop > -1 ? r[map.stop] : null,
          target: map.target > -1 ? r[map.target] : null,
          opened_at: map.opened > -1 ? r[map.opened] : null,
          closed_at: map.closed > -1 ? r[map.closed] : null,
          fees: map.fees > -1 ? r[map.fees] : 0,
          strategy_name: map.strategy > -1 ? r[map.strategy] : '',
          entry_model: map.entry_model > -1 ? r[map.entry_model] : null,
          entry_tf: map.entry_tf > -1 ? r[map.entry_tf] : null,
          entry_evidence: map.entry_evidence > -1 ? r[map.entry_evidence] : null,
          tags: map.tags > -1 ? r[map.tags] : '',
          notes: map.notes > -1 ? r[map.notes] : '',
          status: (map.exit > -1 && String(r[map.exit] || '').trim()) ? 'closed' : 'open',
        }, { instrument: spec, tz });
        trade.account_id = accountId;
        trade.entry_permission = 'record_only';
        trade.guardrail_snapshot = null;
        if (map.net > -1 && String(r[map.net] || '').trim() && !isNaN(Number(String(r[map.net]).replace(/[^0-9.\-]/g, '')))) {
          const net = Number(String(r[map.net]).replace(/[^0-9.\-]/g, ''));
          if (net !== 0) {
            trade.net_pnl = net;
            trade.gross_pnl = net + num(trade.fees);
            if (trade.risk_amount > 0) trade.r_multiple = Math.round((net / trade.risk_amount) * 10000) / 10000;
          }
        }
        const media=Screenshots.parsePortable(map.screenshot_views_json>-1?r[map.screenshot_views_json]:undefined,{json:true});
        trade.screenshot_url=Screenshots.legacyImport(map.screenshot_url>-1?r[map.screenshot_url]:undefined,media);
        collected.push({trade,media,confluences:Confluences.optional(map.entry_confluences>-1?r[map.entry_confluences]:undefined,{json:true}),emotions:Emotions.parsePortable(map.emotion_events_json>-1?r[map.emotion_events_json]:undefined,{json:true})});
        inserted++;
      } catch (e) { skipped++; if (errors.length < 5) errors.push(`Row ${i + 1}: ${e.message}`); }
    }
  }
  let media_imported=0;try{if(collected.length)media_imported=await importTradesWithMedia(req.user.id,collected);}catch{return res.status(503).json({error:'Import could not be recorded; no trades/images from this request committed.'});}
  res.json({
    ok: true, inserted, skipped, errors, media_imported, ...mediaFeedback(collected),
    detected: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v > -1 ? header[v] : null])),
  });
});

// Actual transaction insert IDs (never raw backup IDs), with optional media
// warnings separate from financial parsing. Storage failure rolls back together.
function mediaFeedback(collected){return {emotion_warnings:collected.flatMap((c,i)=>(c.emotions?.warnings||[]).map(w=>'Imported row '+(i+1)+': '+w)).slice(0,20),confluence_warnings:collected.flatMap((c,i)=>(c.confluences?.warnings||[]).map(w=>'Imported row '+(i+1)+': '+w)).slice(0,20),media_skipped:collected.reduce((n,c)=>n+c.media.skipped,0),media_warnings:collected.flatMap((c,i)=>c.media.warnings.map(w=>'Imported row '+(i+1)+': '+w)).slice(0,20)};}
async function importTradesWithMedia(userId,collected,extras=[],vocabulary=[],reviews=null,reviewAccounts={},reviewFallback=null,opportunities=null,ruleHistory=null,identities=null,stateGate=null,intentions=null,practice=null){return db.tx(async tx=>{const store=db.transactionStore(tx);let n=0;
  for(const c of collected){if(!await store.prepare('SELECT id FROM accounts WHERE id=? AND user_id=?').get(c.trade.account_id,userId))throw new Error('Owned destination account unavailable.');const id=await T.insert(store,userId,c.trade),t=await Screenshots.owned(store,userId,id);n+=await Screenshots.insertPortableOn(store,t,c.media);await Confluences.attachOn(store,userId,id,c.confluences,{source:'imported'});await Emotions.importOn(store,t,c.emotions);}
  for(const stmt of extras)await store.prepare(stmt.sql).run(stmt.args);await Confluences.vocabularyOn(store,userId,vocabulary);if(reviews)await PeriodReviews.importOn(store,userId,reviews,reviewAccounts,reviewFallback);if(opportunities)await Opportunities.importOn(store,userId,opportunities,reviewAccounts,reviewFallback);if(ruleHistory)await RuleChanges.importOn(store,userId,ruleHistory);if(identities)await Identity.importOn(store,userId,identities,reviewAccounts,reviewFallback);if(stateGate)await StateGate.importOn(store,userId,stateGate,reviewAccounts,reviewFallback);if(intentions)await Intention.importOn(store,userId,intentions,reviewAccounts,reviewFallback);if(practice)await Practice.importOn(store,userId,practice);return n;
});}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delim = (s.split('\n')[0].match(/\t/g) || []).length > (s.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] || '').trim());
}

router.post('/import/json', requireAuth, async (req, res) => {
  const data = req.body && req.body.data ? req.body.data : req.body;
  if (!data || !Array.isArray(data.trades)) return res.status(400).json({ error: 'Expected an exported backup object with a trades array.' });
  const userId = req.user.id;
  const ruleHistory=RuleChanges.portable(data.strategy_rule_changes),identities=Identity.portable(data.identity_declarations),stateGate=StateGate.portable(data.state_gate_answers);
  const intentions=Intention.portable(data.daily_intentions);
  const practice=Practice.portable(data.practice_sessions);
  const vocabulary=Confluences.portableVocabulary(data.confluence_labels),reviews=PeriodReviews.portable(data.period_reviews),opportunities=Opportunities.portable(data.opportunity_history);
  const accountMap = Object.create(null);
  const instruments = await instrumentMap(userId);
  const tz = (await settingsOf(req)).timezone;
  let inserted = 0,media_imported=0;
  const collected = [];
  try {
    // reads happen before the write batch (libSQL never interleaves them)
    const myAccounts = await db.prepare('SELECT * FROM accounts WHERE user_id=?').all(userId);
    const def = myAccounts[0];
    for (const a of (data.accounts || [])) {
      const match = myAccounts.find((m) => m.name === a.name) || def;
      accountMap[a.id] = match ? match.id : (def ? def.id : null);
    }
    const existingStrategies = new Set((await db.prepare('SELECT name FROM strategies WHERE user_id=?').all(userId)).map((r) => r.name));
    const stmts = [];
    for (const t of data.trades) {
      const spec = instruments[String(t.symbol).toUpperCase()] || null;
      const trade = T.normalise(t, { instrument: spec, tz });
      trade.account_id = accountMap[t.account_id] || (def ? def.id : null);
      trade.entry_permission = 'record_only';
      trade.guardrail_snapshot = null;
      if (!trade.account_id) continue;
      const media=Screenshots.parsePortable(t.screenshots);
      trade.screenshot_url=Screenshots.legacyImport(t.screenshot_url,media);
      collected.push({trade,media,confluences:Confluences.optional(t.entry_confluences),emotions:Emotions.parsePortable(t.emotion_events)});
      inserted++;
    }
    for (const s of (data.strategies || [])) {
      if (existingStrategies.has(s.name)) continue;
      stmts.push({
        sql: `INSERT INTO strategies (user_id,name,description,market_conditions,timeframes,entry_rules,exit_rules,checklist,risk_rules,target_r_multiple,colour)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [userId, s.name, s.description || '', s.market_conditions || '', s.timeframes || '',
          JSON.stringify(s.entry_rules || []), JSON.stringify(s.exit_rules || []), JSON.stringify(s.checklist || []),
          s.risk_rules || '', num(s.target_r_multiple, 2), s.colour || '#4f8cff'],
      });
    }
    for (const j of (data.journal || [])) {
      stmts.push({
        sql: `INSERT INTO journal_entries (user_id,account_id,entry_date,market_bias,mood,energy,focus,plan,review,lessons,tomorrow,screen_time_minutes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,entry_date) DO NOTHING`,
        args: [userId, accountMap[j.account_id] || (def ? def.id : null), j.entry_date,
          j.market_bias || '', j.mood || null, j.energy || null, j.focus || '', j.plan || '', j.review || '', j.lessons || '', j.tomorrow || '', j.screen_time_minutes || null],
      });
    }
    try{media_imported=await importTradesWithMedia(userId,collected,stmts,vocabulary.labels,reviews,accountMap,def?.id??null,opportunities,ruleHistory,identities,stateGate,intentions,practice);}catch{return res.status(503).json({error:'Import could not be recorded; no trades/images from this request committed.'});}
  } catch (e) { return res.status(400).json({ error: 'Import failed: ' + e.message }); }
  res.json({ ok: true, inserted, media_imported, ...mediaFeedback(collected),confluence_warnings:[...mediaFeedback(collected).confluence_warnings,...vocabulary.warnings].slice(0,20),review_warnings:reviews.warnings,rule_change_warnings:ruleHistory.warnings,identity_warnings:identities.warnings,state_gate_warnings:stateGate.warnings,intention_warnings:intentions.warnings,practice_warnings:practice.warnings,opportunity_warnings:opportunities.warnings });
});

/* ---------------------------------------------------------------- settings */
router.put('/settings', requireAuth, async (req, res) => {
  const b = req.body || {};
  const cur = await settingsOf(req);
  const next = {
    ...cur,
    timezone: b.timezone || cur.timezone,
    default_checklist: Array.isArray(b.default_checklist) ? b.default_checklist : (cur.default_checklist || DEFAULT_CHECKLIST),
    focus_symbols: Array.isArray(b.focus_symbols) ? b.focus_symbols.map((s) => String(s).toUpperCase()) : (cur.focus_symbols || []),
    base_currency: b.base_currency || cur.base_currency || 'USD',
    risk_defaults: b.risk_defaults || cur.risk_defaults || { risk_pct: 1, daily_limit_pct: 3, max_trades: 5 },
    // the floor every plan is judged against: below it a plan may still be shown,
    // but it is labelled and never reads as a plain order
    /* M26 — one window, chosen once and stored, so the bots enforce it instead of the
     * trader having to remember it. Folded to the canonical key here; a value that names
     * no window keeps whatever was stored rather than silently clearing the restriction
     * (setup.js reports an unknown value back to the caller as an error). */
    session_pref: (() => {
      if (b.session_pref === undefined) return cur.session_pref || null;
      const v = String(b.session_pref == null ? '' : b.session_pref).trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (!v || v === 'any' || v === 'all' || v === 'every' || v === 'none' || v === 'off') return null;
      return ['asia', 'london', 'ny_am', 'london_close'].indexOf(v) !== -1 ? v : (cur.session_pref || null);
    })(),
    min_rr: Number.isFinite(Number(b.min_rr)) && Number(b.min_rr) > 0
      ? Math.min(Math.max(Number(b.min_rr), 0.1), 10)
      : (Number.isFinite(Number(cur.min_rr)) ? Number(cur.min_rr) : 1),
  };
  await db.prepare('UPDATE users SET settings=?, name=COALESCE(?,name) WHERE id=?').run(JSON.stringify(next), b.name || null, req.user.id);
  res.json({ ok: true, settings: next });
});

router.post('/demo/seed', requireAuth, async (req, res) => {
  const acc = await db.prepare('SELECT * FROM accounts WHERE user_id=? ORDER BY is_default DESC LIMIT 1').get(req.user.id);
  const inserted = await require('../demo-data').seedUser(req.user.id, acc ? acc.id : null, { force: true });
  res.json({ok:true,inserted});
});

/**
 * Sample data, on request only. `POST /demo/seed` loads the 235-trade walkthrough
 * workspace; `POST /demo/clear` removes everything that looks like the trader's
 * own activity (trades, journal entries, goals, watchlist, tracked signals) and
 * leaves the account, instruments and playbook in place.
 */
router.post('/demo/clear', requireAuth, async (req, res) => {
  const uid = req.user.id;
  const before = {};
  const count = async (sql) => { try { return (await db.prepare(sql).get(uid)).n; } catch (e) { return 0; } };
  before.trades = await count('SELECT COUNT(*) n FROM trades WHERE user_id=?');
  before.journal_entries = await count('SELECT COUNT(*) n FROM journal_entries WHERE user_id=?');
  before.goals = await count('SELECT COUNT(*) n FROM goals WHERE user_id=?');
  before.watchlist = await count('SELECT COUNT(*) n FROM watchlist WHERE user_id=?');
  before.bot_signals = await count('SELECT COUNT(*) n FROM bot_signals WHERE user_id=?');
  for (const table of ['trades', 'journal_entries', 'goals', 'watchlist', 'bot_signals']) {
    try { await db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(uid); } catch (e) { /* table may not exist yet */ }
  }
  res.json({ ok: true, removed: before });
});

router.get('/health', async (req, res) => res.json({ ok: true, db: !!db, time: new Date().toISOString(), version: (await getMeta('schema_version')) || 1, store: require('../db').REMOTE ? 'libsql (remote)' : 'libsql (file)' }));

/* ------------------------------------------------------- options (no feed) */
/**
 * Greeks and contract maths for an option *you* are looking at.  No options
 * feed is used: you supply spot, strike, IV and days to expiry; the app does
 * the arithmetic locally and stores nothing unless you log the trade.
 */
router.post('/options/greeks', requireAuth, (req, res) => {
  const b = req.body || {};
  res.json(O.greeks({ spot: b.spot, strike: b.strike, iv: b.iv, dte: b.dte, rate: b.rate, type: b.type }));
});

router.post('/options/plan', requireAuth, (req, res) => {
  const b = req.body || {};
  res.json(O.plan({
    spot: b.spot, strike: b.strike, iv: b.iv, dte: b.dte, rate: b.rate, type: b.type,
    contracts: b.contracts, multiplier: b.multiplier, entry_premium: b.entry_premium,
    stop_premium: b.stop_premium, target_premium: b.target_premium,
  }));
});

router.post('/options/size', requireAuth, (req, res) => {
  const b = req.body || {};
  res.json(O.size({ premium: b.premium, multiplier: b.multiplier, risk_budget: b.risk_budget, contracts_available: b.contracts_available }));
});

/* ------------------------------------------------ prop-firm challenge packs */
router.get('/prop/presets', requireAuth, (req, res) => res.json({ ok: true, presets: Prop.PRESETS }));

router.get('/accounts/:id/challenge', requireAuth, async (req, res) => {
  const acct = await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.id);
  if (!acct) return res.status(404).json({ error: 'Account not found' });
  const tz = (await settingsOf(req)).timezone;
  const today = new Date().toISOString().slice(0, 10);
  const closed = await db.prepare(`SELECT closed_at, net_pnl FROM trades WHERE user_id=? AND account_id=? AND status='closed'`).all(req.user.id, acct.id);
  const dayPnl = closed.filter((t) => String(t.closed_at || '').slice(0, 10) === today).reduce((a, t) => a + (Number(t.net_pnl) || 0), 0);
  const daysTraded = new Set(closed.map((t) => String(t.closed_at || '').slice(0, 10)).filter(Boolean)).size;
  const rules = acct.prop_rules ? safeJson(acct.prop_rules) : Prop.byKey(acct.prop_preset);
  const equity = await equityPeak(req.user.id, acct);
  res.json({
    ok: true, account: { id: acct.id, name: acct.name, currency: acct.currency, starting_balance: acct.starting_balance },
    preset: acct.prop_preset || 'custom',
    status: Prop.status({
      rules, starting_balance: acct.starting_balance, balance: equity.balance, peak_balance: equity.peak,
      day_pnl: dayPnl, days_traded: daysTraded,
    }),
  });
});

/* ---------------------------------------------------- portfolio exposure */
router.get('/risk/exposure', requireAuth, async (req, res) => {
  const accountId = req.query.account_id ? Number(req.query.account_id) : null;
  const rows = await db.prepare(`SELECT * FROM trades WHERE user_id=? AND status='open'${accountId ? ' AND account_id=?' : ''}`)
    .all(...(accountId ? [req.user.id, accountId] : [req.user.id]));
  const acct = accountId
    ? await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(accountId, req.user.id)
    : await db.prepare('SELECT * FROM accounts WHERE user_id=? ORDER BY is_default DESC, id ASC LIMIT 1').get(req.user.id);
  const bal = acct ? (Number(acct.current_balance) || Number(acct.starting_balance) || 0) : 0;
  res.json({ ok: true, account_id: acct ? acct.id : null, ...Exp.analyse(rows, { balance: bal, maxHeatPct: acct && acct.daily_loss_limit_pct ? Number(acct.daily_loss_limit_pct) * 2 : 6 }) });
});

/* ----------------------------------------------------- notifying the user */
router.get('/notify/channels', requireAuth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM notify_channels WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json({ ok: true, channels: rows.map((c) => ({ ...c, url: c.url.replace(/\/(bot[^/]+\/)[^/]*$/, '/$1…') })), kinds: Object.keys(N.FORMAT), events: NOTIFY_EVENTS });
});

router.post('/notify/channels', requireAuth, async (req, res) => {
  const b = req.body || {};
  const kind = Object.keys(N.FORMAT).includes(String(b.kind)) ? String(b.kind) : 'webhook';
  const url = String(b.url || '').trim();
  if (!/^https:\/\//i.test(url)) return res.status(400).json({ error: 'an https:// url is required' });
  const events = Array.isArray(b.events) && b.events.length ? b.events.filter((e) => NOTIFY_EVENTS.includes(e)).join(',') : NOTIFY_EVENTS.join(',');
  const info = await db.prepare('INSERT INTO notify_channels (user_id, kind, label, url, chat_id, events, enabled) VALUES (?,?,?,?,?,?,1)')
    .run(req.user.id, kind, b.label ? String(b.label).slice(0, 60) : kind, url, b.chat_id ? String(b.chat_id) : null, events);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.delete('/notify/channels/:id', requireAuth, async (req, res) => {
  const info = await db.prepare('DELETE FROM notify_channels WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: !!info.changes });
});

router.post('/notify/test', requireAuth, async (req, res) => {
  const id = req.body && req.body.id ? Number(req.body.id) : null;
  const ch = id
    ? await db.prepare('SELECT * FROM notify_channels WHERE id=? AND user_id=?').get(id, req.user.id)
    : await db.prepare('SELECT * FROM notify_channels WHERE user_id=? AND enabled=1 ORDER BY id DESC LIMIT 1').get(req.user.id);
  if (!ch) return res.status(404).json({ error: 'no channel configured' });
  const out = await notifyOne(req.user.id, ch, 'test', 'TradeJournal Pro test notification — this channel works.', { at: new Date().toISOString() });
  res.json({ ok: out.ok, result: out });
});

/* --------------------------------------------------------------- scheduled */
/**
 * The job runner. On a long-lived server it is called by the internal timer;
 * on a serverless deploy it is called by the platform's cron (Vercel sends
 * `Authorization: Bearer $CRON_SECRET` when that env var is set).
 */
router.get('/cron/tick', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const given = req.headers['x-cron-secret'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (secret && given !== secret) return res.status(401).json({ error: 'cron secret required' });
  if (!secret && !req.app.get('tj-internal')) return res.status(403).json({ error: 'set CRON_SECRET to expose this endpoint' });
  const out = await require('../bots').resolveAllUsers({ limit: 40 });
  res.json({ ok: true, ...out, at: new Date().toISOString() });
});

module.exports = router;
