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
const O = require('../options');
const Exp = require('../exposure');
const Prop = require('../prop');
const N = require('../notify');
const createBotsRouter = require('./bots');

const router = asyncRouter();
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
    if (!user) return res.status(401).json({ error: 'Not signed in' });
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
  res.json({ trades: rows.map((t) => P.decorate(t, tz)), total });
});

router.get('/trades/:id', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Trade not found' });
  res.json({ trade: P.decorate(row, (await settingsOf(req)).timezone) });
});

router.post('/trades', requireAuth, async (req, res) => {
  const instruments = await instrumentMap(req.user.id);
  const body = req.body || {};
  const spec = instruments[String(body.symbol || '').toUpperCase()] || null;
  const accountId = num(body.account_id, 0) || (await db.prepare('SELECT id FROM accounts WHERE user_id=? AND archived=0 ORDER BY is_default DESC LIMIT 1').get(req.user.id) || {}).id;
  if (!body.symbol) return res.status(400).json({ error: 'Symbol is required' });
  if (!body.entry) return res.status(400).json({ error: 'Entry price is required' });
  const trade = T.normalise(body, { instrument: spec, tz: (await settingsOf(req)).timezone });
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
  const id = await T.insert(db, req.user.id, { ...trade, account_id: accountId });
  if (Array.isArray(body.rule_checks)) {
    const ins = await db.prepare('INSERT INTO rule_checks(trade_id,label,passed) VALUES(?,?,?)');
    for (const rc of body.rule_checks) ins.run(id, String(rc.label || ''), rc.passed ? 1 : 0);
  }
  const saved = await db.prepare('SELECT * FROM trades WHERE id=?').get(id);
  res.json({ ok: true, trade: P.decorate(saved, (await settingsOf(req)).timezone) });
});

router.put('/trades/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Trade not found' });
  const instruments = await instrumentMap(req.user.id);
  const merged = { ...existing, ...req.body };
  const spec = instruments[String(merged.symbol || '').toUpperCase()] || null;
  const trade = T.normalise(merged, { instrument: spec, tz: (await settingsOf(req)).timezone });
  await T.update(db, req.user.id, id, { ...trade, account_id: num(merged.account_id, existing.account_id) });
  if (Array.isArray(req.body.rule_checks)) {
    await db.prepare('DELETE FROM rule_checks WHERE trade_id=?').run(id);
    const ins = await db.prepare('INSERT INTO rule_checks(trade_id,label,passed) VALUES(?,?,?)');
    for (const rc of req.body.rule_checks) ins.run(id, String(rc.label || ''), rc.passed ? 1 : 0);
  }
  res.json({ ok: true, trade: P.decorate(await db.prepare('SELECT * FROM trades WHERE id=?').get(id), (await settingsOf(req)).timezone) });
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
  await T.update(db, req.user.id, id, trade);
  const fresh = await db.prepare('SELECT * FROM trades WHERE id=?').get(id);
  if (req.body && req.body.notify !== false) {
    notifyEvent(req.user.id, 'trade_closed', `${trade.symbol} ${trade.direction} closed ${fresh.net_pnl >= 0 ? '+' : ''}${fresh.net_pnl} (${fresh.r_multiple}R)${trade.legs_n ? ` · ${trade.legs_n} scale-outs` : ''}`, { trade_id: id, symbol: trade.symbol, net_pnl: fresh.net_pnl, r_multiple: fresh.r_multiple }).catch(() => {});
  }
  res.json({ ok: true, trade: P.decorate(fresh, (await settingsOf(req)).timezone) });
});

router.delete('/trades/:id', requireAuth, async (req, res) => {
  const info = await db.prepare('DELETE FROM trades WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  res.json({ ok: !!info.changes });
});

router.post('/trades/bulk-delete', requireAuth, async (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (ids.length) {
    // one atomic batch (libSQL batches share a single statement shape)
    await db.batch(ids.map((id) => ({ sql: 'DELETE FROM trades WHERE id=? AND user_id=?', args: [Number(id), req.user.id] })));
  }
  res.json({ ok: true, deleted: ids.length });
});

/* --------------------------------------------------------------- analytics */
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
  const decorated = rows.map((t) => P.decorate(t, tz));
  const closed = decorated.filter((t) => t.status !== 'open');
  const acc = await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(num(req.query.account_id, 0), req.user.id)
    || await db.prepare('SELECT * FROM accounts WHERE user_id=? AND archived=0 ORDER BY is_default DESC LIMIT 1').get(req.user.id)
    || { starting_balance: 10000, id: null };
  const analytics = P.fullAnalytics(closed, { startingBalance: acc.starting_balance });
  analytics.account = acc;
  analytics.open_positions = decorated.filter((t) => t.status === 'open');
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
  res.json(Coach.analyse(rows, { startingBalance: acc ? acc.starting_balance : 10000, timezone: tz }));
});

router.get('/briefing', requireAuth, wrap(async (req, res) => {
  const settings = await settingsOf(req);
  const tz = settings.timezone;
  const acc = await accountOr404(req, res);
  if (!acc) return;
  const rows = (await db.prepare('SELECT * FROM trades WHERE user_id=? AND account_id=? ORDER BY COALESCE(closed_at, opened_at)').all(req.user.id, acc.id)).map((t) => P.decorate(t, tz));
  const todayStr = P.localDateStr(new Date().toISOString(), tz);
  const journalEntry = await db.prepare('SELECT * FROM journal_entries WHERE user_id=? AND entry_date=?').get(req.user.id, todayStr) || null;
  const symbols = [...new Set([...(settings.focus_symbols || []), ...rows.slice(-25).map((t) => t.symbol)])].slice(0, 12);
  const [cal, quotes] = await Promise.all([M.getCalendar({ timezone: tz }), M.getQuotes(symbols)]);
  const events = (cal.events || []).filter((e) => ['high', 'medium'].includes(e.impact) && new Date(e.date) > new Date(Date.now() - 6 * 3600e3)).slice(0, 40);
  const briefing = Coach.briefing({ trades: rows, events, quotes: quotes.quotes || {}, account: acc, journalEntry, riskRules: settings });
  briefing.calendar_ok = cal.ok;
  briefing.quotes_ok = quotes.ok;
  res.json(briefing);
}));

/* ----------------------------------------------------------------- journal */
router.get('/journal', requireAuth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM journal_entries WHERE user_id=? ORDER BY entry_date DESC LIMIT 400').all(req.user.id);
  res.json({ entries: rows });
});
router.get('/journal/:date', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT * FROM journal_entries WHERE user_id=? AND entry_date=?').get(req.user.id, req.params.date);
  const tz = (await settingsOf(req)).timezone;
  const trades = (await db.prepare(`SELECT * FROM trades WHERE user_id=? AND date(COALESCE(closed_at,opened_at))=date(?)`).all(req.user.id, req.params.date)).map((t) => P.decorate(t, tz));
  res.json({ entry: row || null, trades });
});
router.post('/journal', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.entry_date) return res.status(400).json({ error: 'entry_date is required' });
  const acc = b.account_id ? Number(b.account_id) : (await db.prepare('SELECT id FROM accounts WHERE user_id=? ORDER BY is_default DESC LIMIT 1').get(req.user.id) || {}).id;
  // M28: proof_lived / rule_broke / broke_trigger are Ep 4's nightly reflection protocol.
  await db.prepare(`INSERT INTO journal_entries (user_id,account_id,entry_date,market_bias,mood,energy,focus,plan,review,lessons,tomorrow,proof_lived,rule_broke,broke_trigger,screen_time_minutes)
    VALUES (@user_id,@account_id,@entry_date,@market_bias,@mood,@energy,@focus,@plan,@review,@lessons,@tomorrow,@proof_lived,@rule_broke,@broke_trigger,@screen_time_minutes)
    ON CONFLICT(user_id,entry_date) DO UPDATE SET
      market_bias=excluded.market_bias, mood=excluded.mood, energy=excluded.energy, focus=excluded.focus,
      plan=excluded.plan, review=excluded.review, lessons=excluded.lessons, tomorrow=excluded.tomorrow,
      proof_lived=excluded.proof_lived, rule_broke=excluded.rule_broke, broke_trigger=excluded.broke_trigger,
      screen_time_minutes=excluded.screen_time_minutes`).run({
    user_id: req.user.id, account_id: acc, entry_date: b.entry_date,
    market_bias: b.market_bias || '', mood: b.mood || null, energy: b.energy || null,
    focus: b.focus || '', plan: b.plan || '', review: b.review || '', lessons: b.lessons || '',
    tomorrow: b.tomorrow || '', proof_lived: b.proof_lived || '', rule_broke: b.rule_broke || '',
    broke_trigger: b.broke_trigger || '', screen_time_minutes: b.screen_time_minutes || null,
  });
  res.json({ ok: true, entry: await db.prepare('SELECT * FROM journal_entries WHERE user_id=? AND entry_date=?').get(req.user.id, b.entry_date) });
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
  for (const s of strategies) {
    const list = rows.filter((t) => t.strategy_id === s.id || (t.strategy_name && t.strategy_name === s.name));
    stats[s.id] = { trades: list.length, ...P.segment(list.length ? list : [{}], (t) => t.symbol)[0] };
    const k = list.length ? P.kpis(list, { startingBalance: 10000 }) : null;
    stats[s.id] = k ? { trades: k.trades, net_pnl: k.net_pnl, win_rate: k.win_rate, expectancy_r: k.expectancy_r, profit_factor: k.profit_factor, avg_r: k.avg_r, total_r: k.total_r } : { trades: 0 };
  }
  res.json({ strategies, stats });
});
router.post('/strategies', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Name is required' });
  const info = await db.prepare(`INSERT INTO strategies (user_id,name,description,market_conditions,timeframes,entry_rules,exit_rules,checklist,risk_rules,target_r_multiple,colour,active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    req.user.id, b.name, b.description || '', b.market_conditions || '', b.timeframes || '',
    JSON.stringify(b.entry_rules || []), JSON.stringify(b.exit_rules || []), JSON.stringify(b.checklist || []),
    b.risk_rules || '', num(b.target_r_multiple, 2), b.colour || '#4f8cff', b.active === false ? 0 : 1);
  // M102: a new strategy is version 1 of itself from the moment it exists, so there is
  // never a window in which trades can be taken against an unversioned rule set.
  const v1 = await snapshotStrategyVersion(info.lastInsertRowid, {
    name: b.name, description: b.description || '', market_conditions: b.market_conditions || '',
    timeframes: b.timeframes || '', entry_rules: JSON.stringify(b.entry_rules || []),
    exit_rules: JSON.stringify(b.exit_rules || []), checklist: JSON.stringify(b.checklist || []),
    risk_rules: b.risk_rules || '', target_r_multiple: num(b.target_r_multiple, 2),
  }, 'Strategy created.');
  res.json({ ok: true, version: v1, strategy: parseStrategy(await db.prepare('SELECT * FROM strategies WHERE id=?').get(info.lastInsertRowid)) });
});
router.put('/strategies/:id', requireAuth, async (req, res) => {
  const b = req.body || {};
  const id = Number(req.params.id);
  const cur = await db.prepare('SELECT * FROM strategies WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: 'Strategy not found' });
  /* M102 — this UPDATE used to overwrite the rule set in place, which is why Ep 27's
   * "you will never ever truly know what worked" applied: the strategy whose expectancy
   * you were reading had silently been a different strategy for part of the sample.
   * The row is still updated (it remains the CURRENT rule set, and every existing reader
   * depends on that), but the values are computed first so they can be compared, and a
   * change to a RULE-BEARING field appends an immutable version instead of vanishing.
   * A rename or a recolour deliberately does NOT bump: that would fragment the history of
   * a strategy the trader never actually changed. */
  const next = {
    name: b.name !== undefined ? b.name : cur.name,
    description: b.description !== undefined ? b.description : cur.description,
    market_conditions: b.market_conditions !== undefined ? b.market_conditions : cur.market_conditions,
    timeframes: b.timeframes !== undefined ? b.timeframes : cur.timeframes,
    entry_rules: JSON.stringify(b.entry_rules || JSON.parse(cur.entry_rules || '[]')),
    exit_rules: JSON.stringify(b.exit_rules || JSON.parse(cur.exit_rules || '[]')),
    checklist: JSON.stringify(b.checklist || JSON.parse(cur.checklist || '[]')),
    risk_rules: b.risk_rules !== undefined ? b.risk_rules : cur.risk_rules,
    target_r_multiple: b.target_r_multiple !== undefined ? num(b.target_r_multiple, 2) : cur.target_r_multiple,
    colour: b.colour || cur.colour,
    active: b.active === undefined ? cur.active : (b.active ? 1 : 0),
  };
  await db.prepare(`UPDATE strategies SET name=@name, description=@description, market_conditions=@market_conditions, timeframes=@timeframes,
    entry_rules=@entry_rules, exit_rules=@exit_rules, checklist=@checklist, risk_rules=@risk_rules, target_r_multiple=@target_r_multiple,
    colour=@colour, active=@active WHERE id=@id AND user_id=@user_id`).run({ id, user_id: req.user.id, ...next });

  const changedField = strategyRulesChanged(cur, next);
  let version = await currentStrategyVersion(id);
  if (changedField) {
    const prevVersion = version;
    version = await snapshotStrategyVersion(id, next,
      `Rule changed: ${changedField}. Trades from here on are attributed to v${prevVersion + 1}; trades already logged keep the version they were taken under.`);
  } else if (!version) {
    // A strategy that predates versioning and somehow has no snapshot yet - the backfill
    // covers this, but do not rely on it having run.
    version = await snapshotStrategyVersion(id, next, 'First snapshot recorded for a pre-existing strategy.');
  }
  res.json({
    ok: true, version, new_version: !!changedField, changed_field: changedField,
    strategy: parseStrategy(await db.prepare('SELECT * FROM strategies WHERE id=?').get(id)),
  });
});
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
  const unlocked = !!b.risk_unlocked;
  const riskPct = I.clampRiskPct(b.risk_per_trade_pct, { fallback: I.RISK_GUARDRAIL.default_pct, unlocked });
  const info = await db.prepare(`INSERT INTO accounts (user_id,name,broker,account_type,currency,starting_balance,current_balance,risk_per_trade_pct,risk_unlocked,daily_loss_limit_pct,max_drawdown_pct,profit_target_pct)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    req.user.id, b.name, b.broker || '', b.account_type || 'live', b.currency || 'USD',
    num(b.starting_balance, 10000), num(b.starting_balance, 10000), riskPct, unlocked ? 1 : 0,
    num(b.daily_loss_limit_pct, 3), num(b.max_drawdown_pct, 10), num(b.profit_target_pct, 8));
  res.json({
    ok: true,
    account: await db.prepare('SELECT * FROM accounts WHERE id=?').get(info.lastInsertRowid),
    risk_note: I.riskGuardrailNote(b.risk_per_trade_pct, riskPct, { unlocked }),
  });
});
router.put('/accounts/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const cur = await db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!cur) return res.status(404).json({ error: 'Account not found' });
  const b = req.body || {};
  // M9: the same guardrail on the update path, which also stored the value via num() with no
  // clamp. Only a value THIS request supplies is clamped — a row stored above the guardrail
  // before the fix is left untouched here and clamped on READ (bots/index.js) instead, so an
  // unrelated edit such as a rename cannot silently move the trader's risk setting.
  const unlocked = b.risk_unlocked !== undefined ? !!b.risk_unlocked : !!cur.risk_unlocked;
  const riskPct = b.risk_per_trade_pct !== undefined
    ? I.clampRiskPct(b.risk_per_trade_pct, { fallback: num(cur.risk_per_trade_pct, I.RISK_GUARDRAIL.default_pct), unlocked })
    : num(cur.risk_per_trade_pct, I.RISK_GUARDRAIL.default_pct);
  await db.prepare(`UPDATE accounts SET name=@name, broker=@broker, account_type=@account_type, currency=@currency,
    starting_balance=@starting_balance, risk_per_trade_pct=@risk_per_trade_pct, risk_unlocked=@risk_unlocked, daily_loss_limit_pct=@daily_loss_limit_pct,
    max_drawdown_pct=@max_drawdown_pct, profit_target_pct=@profit_target_pct, prop_preset=@prop_preset,
    prop_rules=@prop_rules, archived=@archived WHERE id=@id AND user_id=@user_id`).run({
    id, user_id: req.user.id,
    name: b.name !== undefined ? b.name : cur.name,
    broker: b.broker !== undefined ? b.broker : cur.broker,
    account_type: b.account_type !== undefined ? b.account_type : cur.account_type,
    currency: b.currency !== undefined ? b.currency : cur.currency,
    starting_balance: b.starting_balance !== undefined ? num(b.starting_balance, cur.starting_balance) : cur.starting_balance,
    risk_per_trade_pct: riskPct,
    risk_unlocked: unlocked ? 1 : 0,
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
router.get('/export/csv', requireAuth, async (req, res) => {
  const tz = (await settingsOf(req)).timezone;
  const f = tradeFilters(req);
  const { where, params, order } = T.listQuery(f);
  const rows = (await db.prepare(`SELECT * FROM trades WHERE ${where} ORDER BY ${order}`).all({ ...params, user_id: req.user.id })).map((t) => P.decorate(t, tz));
  const cols = ['id', 'account_id', 'symbol', 'asset_class', 'direction', 'status', 'opened_at', 'closed_at', 'entry', 'exit', 'stop', 'target',
    'size', 'fees', 'gross_pnl', 'net_pnl', 'risk_amount', 'r_multiple', 'mae_r', 'mfe_r', 'planned_r', 'exit_reason', 'strategy_name',
    'setup_grade', 'session', 'timeframe' , 'timeframes', 'emotion_before', 'emotion_after', 'confidence', 'adherence', 'mistakes', 'tags',
    'thesis', 'lesson', 'execution_notes', 'notes'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="trades-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.get('/export/json', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const data = {
    exported_at: new Date().toISOString(), version: 1,
    user: { email: req.user.email, name: req.user.name, settings: req.user.settings },
    accounts: await db.prepare('SELECT * FROM accounts WHERE user_id=?').all(userId),
    strategies: (await db.prepare('SELECT * FROM strategies WHERE user_id=?').all(userId)).map(parseStrategy),
    instruments: await db.prepare('SELECT * FROM instruments WHERE user_id=?').all(userId),
    trades: await db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY opened_at').all(userId),
    journal: await db.prepare('SELECT * FROM journal_entries WHERE user_id=?').all(userId),
    goals: await db.prepare('SELECT * FROM goals WHERE user_id=?').all(userId),
    watchlist: await db.prepare('SELECT * FROM watchlist WHERE user_id=?').all(userId),
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="tradejournal-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

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
    strategy: findCol(['strategy', 'setup', 'system', 'playbook']),
    tags: findCol(['tags', 'tag', 'labels']),
    notes: findCol(['notes', 'note', 'comment', 'comments', 'remark']),
    net: findCol(['net_pnl', 'net', 'profit', 'pnl', 'p/l', 'realized_pnl', 'profit_loss', 'net_profit']),
  };
  if (map.symbol < 0) return res.status(400).json({ error: 'Could not find a symbol/ticker column in the CSV.' });
  const accountId = num(req.body.account_id, 0) || (await db.prepare('SELECT id FROM accounts WHERE user_id=? ORDER BY is_default DESC LIMIT 1').get(req.user.id) || {}).id;
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
          tags: map.tags > -1 ? r[map.tags] : '',
          notes: map.notes > -1 ? r[map.notes] : '',
          status: (map.exit > -1 && String(r[map.exit] || '').trim()) ? 'closed' : 'open',
        }, { instrument: spec, tz });
        trade.account_id = accountId;
        if (map.net > -1 && String(r[map.net] || '').trim() && !isNaN(Number(String(r[map.net]).replace(/[^0-9.\-]/g, '')))) {
          const net = Number(String(r[map.net]).replace(/[^0-9.\-]/g, ''));
          if (net !== 0) {
            trade.net_pnl = net;
            trade.gross_pnl = net + num(trade.fees);
            if (trade.risk_amount > 0) trade.r_multiple = Math.round((net / trade.risk_amount) * 10000) / 10000;
          }
        }
        collected.push(trade);
        inserted++;
      } catch (e) { skipped++; if (errors.length < 5) errors.push(`Row ${i + 1}: ${e.message}`); }
    }
  }
  if (collected.length) await db.batch(T.batchStatements(req.user.id, collected));
  res.json({
    ok: true, inserted, skipped, errors,
    detected: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v > -1 ? header[v] : null])),
  });
});

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
  const accountMap = {};
  const instruments = await instrumentMap(userId);
  const tz = (await settingsOf(req)).timezone;
  let inserted = 0;
  try {
    // reads happen before the write batch (libSQL never interleaves them)
    const myAccounts = await db.prepare('SELECT * FROM accounts WHERE user_id=?').all(userId);
    const def = myAccounts[0];
    for (const a of (data.accounts || [])) {
      const match = myAccounts.find((m) => m.name === a.name) || def;
      accountMap[a.id] = match ? match.id : (def ? def.id : null);
    }
    const existingStrategies = new Set((await db.prepare('SELECT name FROM strategies WHERE user_id=?').all(userId)).map((r) => r.name));
    const collected = [];
    const stmts = [];
    for (const t of data.trades) {
      const spec = instruments[String(t.symbol).toUpperCase()] || null;
      const trade = T.normalise(t, { instrument: spec, tz });
      trade.account_id = accountMap[t.account_id] || (def ? def.id : null);
      if (!trade.account_id) continue;
      collected.push(trade);
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
    await db.batch([...T.batchStatements(userId, collected), ...stmts]);
  } catch (e) { return res.status(400).json({ error: 'Import failed: ' + e.message }); }
  res.json({ ok: true, inserted });
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
  res.json({ ok: true, inserted });
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
