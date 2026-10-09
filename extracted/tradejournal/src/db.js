'use strict';
/**
 * Data layer.
 *
 * One driver: libSQL (`@libsql/client`). The same code talks to
 *   · a local file        → file:./data/journal.db      (local dev, zero setup)
 *   · a Turso database    → libsql://…turso.io + token  (free hosted, Vercel)
 * That is what makes the app deployable to a serverless host where the filesystem
 * is read-only and ephemeral, without shipping a second implementation.
 *
 * Everything that touches the database is therefore **async**. To keep 200+ call
 * sites readable, `prepare()/get()/all()/run()` keep the shape everyone knows from
 * better-sqlite3, one `await` away:
 *
 *     const row  = await db.prepare('SELECT * FROM users WHERE id=?').get(id);
 *     const rows = await db.prepare('SELECT * FROM trades').all();
 *     await db.prepare('UPDATE x SET y=? WHERE id=?').run(v, id);
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');
const { PRESETS } = require('./instruments');

const DATA_DIR = path.join(__dirname, '..', 'data');

/** Where the data lives. Env wins, then a local file (or /tmp when hosted read-only). */
function resolveUrl() {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  if (process.env.LIBSQL_URL) return process.env.LIBSQL_URL;
  if (process.env.TRADEJOURNAL_DB) return /^(file|libsql|https?|wss?):/.test(process.env.TRADEJOURNAL_DB)
    ? process.env.TRADEJOURNAL_DB
    : 'file:' + process.env.TRADEJOURNAL_DB;
  if (process.env.VERCEL) return 'file:/tmp/journal.db';   // ephemeral fallback: the app still boots
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return 'file:' + path.join(DATA_DIR, 'journal.db');
}

const DB_URL = resolveUrl();
const REMOTE = /^(libsql|https?|wss?):/i.test(DB_URL);
const DB_PATH = DB_URL.replace(/^file:/, '');

const client = createClient({ url: DB_URL, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

/* ------------------------------------------------------------ tiny helpers */

const clean = (v) => (v === undefined ? null : v);

function argsOf(a) {
  if (a.length === 1 && a[0] && typeof a[0] === 'object' && !Array.isArray(a[0]) && typeof a[0].getTime !== 'function') {
    const o = {};
    for (const [k, v] of Object.entries(a[0])) o[k] = clean(v);
    return o;
  }
  return a.map(clean);
}

async function execute(sql, args) {
  return client.execute({ sql, args: args || [], rowMode: 'object' });
}

/** better-sqlite3-shaped prepared statement, minus the blocking. */
function prepare(sql) {
  return {
    async get(...a) { const r = await execute(sql, argsOf(a)); return r.rows[0] === undefined ? undefined : r.rows[0]; },
    async all(...a) { const r = await execute(sql, argsOf(a)); return r.rows; },
    async run(...a) {
      const r = await execute(sql, argsOf(a));
      return { changes: Number(r.rowsAffected || 0), lastInsertRowid: r.lastInsertRowid === null || r.lastInsertRowid === undefined ? undefined : Number(r.lastInsertRowid) };
    },
  };
}

/** Run several statements atomically. */
async function batch(statements) {
  const stmts = statements.map((s) => (typeof s === 'string' ? { sql: s, args: [] } : { sql: s.sql, args: s.args || [] }));
  if (!stmts.length) return [];
  return client.batch(stmts, 'write');
}

/** Multi-statement DDL/DML (no parameters). */
async function exec(sql) {
  const parts = String(sql).split(';').map((s) => s.trim()).filter(Boolean);
  return batch(parts.map((s) => ({ sql: s, args: [] })));
}

/** Interactive write transaction. */
async function tx(fn) {
  const t = await client.transaction('write');
  try {
    const out = await fn(t);
    await t.commit();
    return out;
  } catch (e) {
    try { await t.rollback(); } catch { /* already rolled back */ }
    throw e;
  }
}

const db = {
  prepare,
  get: (sql, ...a) => prepare(sql).get(...a),
  all: (sql, ...a) => prepare(sql).all(...a),
  run: (sql, ...a) => prepare(sql).run(...a),
  exec, batch, tx,
};

/* ------------------------------------------------------------------ schema */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  broker TEXT DEFAULT '',
  account_type TEXT DEFAULT 'live',          -- live | demo | prop
  currency TEXT DEFAULT 'USD',
  starting_balance REAL DEFAULT 10000,
  current_balance REAL DEFAULT 10000,
  risk_per_trade_pct REAL DEFAULT 0.5,   -- M9 guardrail 0.5 pct, manual maximum 1 pct, settable per account
  risk_unlocked INTEGER DEFAULT 0,       -- M9: 1 pct is behind a MANUAL unlock, so the unlock has to be
                                         -- persisted. Without this column a stored 1 pct would be re-clamped
                                         -- to 0.5 on every read and the row would disagree with the sizing.
  daily_loss_limit_pct REAL DEFAULT 3.0,
  max_drawdown_pct REAL DEFAULT 10.0,
  profit_target_pct REAL DEFAULT 8.0,
  is_default INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- M50 bias hysteresis. Ep 15 mistake 4 says the bias only changes when its invalidation is hit,
-- which needs the prior bias and its level to survive between calls. alignment() is deliberately
-- pure so this state lives here rather than inside it, and nothing that measures the engine has to
-- carry state between unrelated windows. Keyed by symbol and timeframe only, not by user, because
-- the bias is a property of the market rather than of the account. CREATE TABLE IF NOT EXISTS runs
-- on every boot, so databases created before this row pick the table up with no ALTER needed.
CREATE TABLE IF NOT EXISTS bias_state (
  symbol TEXT NOT NULL,
  tf TEXT NOT NULL,
  bias INTEGER NOT NULL DEFAULT 0,        -- 1 long, -1 short, 0 flat
  invalidation_level REAL,                -- level whose CLOSE voids this bias
  invalidation_side TEXT,                 -- below for a long, above for a short
  since_t INTEGER,                        -- candle time in ms when this bias was set
  age_bars INTEGER NOT NULL DEFAULT 0,    -- bars observed since it was set
  changed_because TEXT,                   -- why it last changed, null when it has not
  disagreement INTEGER,                   -- the from-scratch read that was held against
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (symbol, tf)
);
CREATE TABLE IF NOT EXISTS bot_signals (
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
    entry_mode TEXT,          -- entry | mid | deep | leg | ote | mtf  (how this plan was anchored)
    mtf_tf TEXT,              -- the lower timeframe that confirmed an mtf plan
    risk_atr REAL,            -- stop distance in ATR at plan time
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | win | loss | no_fill | expired
    outcome_r REAL,
    outcome_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  metric TEXT DEFAULT 'net_pnl',              -- net_pnl | expectancy_r | win_rate | profit_factor | adherence | trades
  target REAL NOT NULL DEFAULT 0,
  period TEXT DEFAULT 'month',                -- month | quarter | year
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS instruments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,                            -- NULL = global preset
  symbol TEXT NOT NULL,
  name TEXT DEFAULT '',
  asset_class TEXT NOT NULL DEFAULT 'stocks',
  exchange TEXT DEFAULT '',
  currency TEXT DEFAULT 'USD',
  tick_size REAL DEFAULT 0.01,
  pip_size REAL DEFAULT 0.01,
  value_per_point REAL DEFAULT 1,
  unit TEXT DEFAULT 'units',
  UNIQUE(user_id, symbol)
);
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,                   -- YYYY-MM-DD
  market_bias TEXT DEFAULT '',                -- bullish / bearish / neutral / choppy
  mood INTEGER,                               -- 1-5
  energy INTEGER,                             -- 1-5
  focus TEXT DEFAULT '',
  plan TEXT DEFAULT '',
  review TEXT DEFAULT '',
  lessons TEXT DEFAULT '',
  tomorrow TEXT DEFAULT '',
  -- M28: Ep 4 nightly reflection protocol asks for three fields each night. The tomorrow
  -- column already covered the third. These two cover the rest.
  -- NOTE: SQL comments here live inside a JS template literal, so no backticks and no
  -- semicolons (see M117).
  proof_lived TEXT DEFAULT '',                -- one proof that you lived your edge today
  rule_broke TEXT DEFAULT '',                 -- one moment you broke it
  broke_trigger TEXT DEFAULT '',              -- and what triggered it
  screen_time_minutes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, entry_date)
);
CREATE TABLE IF NOT EXISTS chart_drawings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  kind TEXT NOT NULL,
  points TEXT NOT NULL DEFAULT '[]',
  style TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_drawings_user ON chart_drawings(user_id, symbol, timeframe);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS rule_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  passed INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  market_conditions TEXT DEFAULT '',          -- trending / ranging / volatile / news
  timeframes TEXT DEFAULT '',
  entry_rules TEXT DEFAULT '[]',              -- JSON array of strings
  exit_rules TEXT DEFAULT '[]',
  checklist TEXT DEFAULT '[]',                -- JSON array of strings (pre-trade)
  risk_rules TEXT DEFAULT '',
  target_r_multiple REAL DEFAULT 2.0,
  colour TEXT DEFAULT '#4f8cff',
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- M102 strategy versioning. Ep 27 - without this "you will never ever truly know what
-- worked", because PUT /strategies/:id overwrote the rule set in place, so a trade taken
-- under the January rules and one taken under the March rules were indistinguishable and
-- the expectancy of "the strategy" was an average across several different strategies.
-- Rows here are APPEND ONLY and never updated. The name column is stored for readability
-- but a name change does not bump the version - only the rule-bearing fields do.
-- active and colour are metadata about presentation and state, not rules, so they are
-- not versioned either. UNIQUE(strategy_id, version) is what makes the history immutable at
-- the database level rather than by convention.
CREATE TABLE IF NOT EXISTS strategy_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  market_conditions TEXT DEFAULT '',
  timeframes TEXT DEFAULT '',
  entry_rules TEXT DEFAULT '[]',
  exit_rules TEXT DEFAULT '[]',
  checklist TEXT DEFAULT '[]',
  risk_rules TEXT DEFAULT '',
  target_r_multiple REAL DEFAULT 2.0,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(strategy_id, version)
);
CREATE INDEX IF NOT EXISTS idx_stratver ON strategy_versions(strategy_id, version);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_class TEXT DEFAULT 'stocks',
  direction TEXT NOT NULL DEFAULT 'long',
  status TEXT NOT NULL DEFAULT 'closed',      -- open | closed
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  entry REAL NOT NULL,
  exit REAL,
  stop REAL,
  target REAL,
  size REAL NOT NULL DEFAULT 0,
  fees REAL DEFAULT 0,
  gross_pnl REAL DEFAULT 0,
  net_pnl REAL DEFAULT 0,
  risk_amount REAL DEFAULT 0,
  r_multiple REAL DEFAULT 0,
  planned_r REAL,
  mae_r REAL,                                 -- worst excursion in R (negative number)
  mfe_r REAL,                                 -- best excursion in R (positive number)
  stop_moved INTEGER DEFAULT 0,
  exit_reason TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
  strategy_name TEXT DEFAULT '',
  setup_grade TEXT DEFAULT '',                -- A+ / A / B / C
  session TEXT DEFAULT '',
  timeframes TEXT DEFAULT '',
  emotion_before TEXT DEFAULT '',
  emotion_after TEXT DEFAULT '',
  confidence INTEGER,                         -- 1-5
  adherence INTEGER,                          -- 1-5 rule-adherence self score
  mistakes TEXT DEFAULT '',                   -- comma separated
  tags TEXT DEFAULT '',                       -- comma separated
  thesis TEXT DEFAULT '',
  lesson TEXT DEFAULT '',
  execution_notes TEXT DEFAULT '',
  screenshot_url TEXT DEFAULT '',
  manual_mae REAL,                            -- price values if user knows excursions
  manual_mfe REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tv_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tv_symbol TEXT DEFAULT '',
  symbol TEXT DEFAULT '',
  known INTEGER DEFAULT 0,
  action TEXT DEFAULT '',
  price REAL,
  timeframe TEXT DEFAULT '',
  note TEXT DEFAULT '',
  raw TEXT DEFAULT '',
  alert_time TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  handled INTEGER DEFAULT 0,
  error TEXT,
  signal_id INTEGER,
  result TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_class TEXT DEFAULT 'stocks',
  thesis TEXT DEFAULT '',
  bias TEXT DEFAULT 'neutral',
  key_level TEXT DEFAULT '',
  catalyst TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, symbol)
);
CREATE TABLE IF NOT EXISTS webhook_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  label TEXT DEFAULT 'TradingView',
  analyse INTEGER DEFAULT 1,                   -- run the bot on every alert
  autocreate INTEGER DEFAULT 0,                -- log the plan as a tracked signal
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  uses INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bot_signals_user ON bot_signals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_user_date ON trades(user_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_tv_alerts_user ON tv_alerts(user_id, id DESC);

CREATE TABLE IF NOT EXISTS notify_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                  -- telegram | discord | slack | webhook
  label TEXT,
  url TEXT NOT NULL,
  chat_id TEXT,
  events TEXT,                         -- csv: signal_resolved, challenge_warning, mtf_confirmed, trade_closed
  enabled INTEGER NOT NULL DEFAULT 1,
  last_status INTEGER, last_error TEXT, last_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notify_channels_user ON notify_channels(user_id, enabled);
`;

const SCHEMA_VERSION = 5;

/** Runs once per process; every caller can await it. */
const ready = (async () => {
  await exec(SCHEMA);
  if (!REMOTE) { try { await client.execute('PRAGMA foreign_keys = ON'); } catch { /* local only */ } }
  await seedGlobalInstruments();
  await migrate();
  return true;
})();

/**
 * Additive migrations for databases created by an earlier version.  Each ALTER
 * is guarded by the column list, so this is safe to run on every boot.
 */
async function migrate() {
  const add = async (table, col, type) => {
    const cols = await db.prepare(`PRAGMA table_info(${table})`).all();
    if (!(cols || []).some((c) => c.name === col)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  };
  await add('trades', 'legs', 'TEXT');
  // M36: scale-IN legs. `legs` already covered scaling OUT; pyramiding had nowhere to live.
  await add('trades', 'entries', 'TEXT');
  await add('accounts', 'prop_preset', 'TEXT');
  await add('accounts', 'prop_rules', 'TEXT');
  // M28: Ep 4 nightly reflection protocol, the two fields that were missing
  await add('journal_entries', 'proof_lived', "TEXT DEFAULT ''");
  await add('journal_entries', 'rule_broke', "TEXT DEFAULT ''");
  await add('journal_entries', 'broke_trigger', "TEXT DEFAULT ''");
  // M9: the manual unlock that lets an account sit above the 0.5 % guardrail, up to the
  // 1 % absolute maximum. Persisted so the write path and every later read agree.
  await add('accounts', 'risk_unlocked', 'INTEGER DEFAULT 0');
  // M102: which version of its strategy a trade was taken under. NULL means the trade
  // predates versioning or has no strategy at all - it is never guessed at read time.
  await add('trades', 'strategy_version', 'INTEGER');

  /* M102 backfill. Every strategy that has no version history gets an immutable v1
   * snapshot of the rule set it currently holds, and every trade already linked to it is
   * attributed to that v1. That attribution is an ASSUMPTION and is labelled as one in
   * the snapshot's own note: those trades may have been taken under several earlier
   * revisions that were overwritten before versioning existed and are now unrecoverable.
   * Recording them as v1 is the honest floor - it makes the gap visible and dated rather
   * than silently merging unknown history into the current rules. Idempotent: the guard
   * is the existence of any version row, so booting twice creates nothing twice. */
  try {
    const unversioned = await db.prepare(
      'SELECT s.* FROM strategies s WHERE NOT EXISTS (SELECT 1 FROM strategy_versions v WHERE v.strategy_id = s.id)'
    ).all();
    for (const st of (unversioned || [])) {
      await db.prepare(`INSERT INTO strategy_versions
        (strategy_id, version, name, description, market_conditions, timeframes, entry_rules, exit_rules, checklist, risk_rules, target_r_multiple, note)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        st.id, 1, st.name || '', st.description || '', st.market_conditions || '', st.timeframes || '',
        st.entry_rules || '[]', st.exit_rules || '[]', st.checklist || '[]', st.risk_rules || '',
        Number(st.target_r_multiple) || 2,
        'Backfilled v1 when versioning was added. Trades attributed to this version may have been taken under earlier revisions that were overwritten in place and cannot now be recovered.');
    }
    if ((unversioned || []).length) {
      await db.exec('UPDATE trades SET strategy_version = 1 WHERE strategy_id IS NOT NULL AND strategy_version IS NULL');
    }
  } catch (e) {
    // A failed backfill must not stop the app booting - versioning is additive.
    console.error('  M102 backfill skipped:', e && e.message);
  }
  return true;
}

/* ------------------------------------------------ M102 strategy versioning */
/** The fields whose change constitutes a NEW STRATEGY rather than a rename. */
const STRATEGY_RULE_FIELDS = ['description', 'market_conditions', 'timeframes', 'entry_rules',
  'exit_rules', 'checklist', 'risk_rules', 'target_r_multiple'];

/**
 * Highest existing version for a strategy, or 0 when it has no history yet.
 * @param {number} strategyId
 * @returns {Promise<number>}
 */
async function currentStrategyVersion(strategyId) {
  const r = await db.prepare('SELECT MAX(version) AS v FROM strategy_versions WHERE strategy_id=?').get(strategyId);
  return r && Number.isFinite(r.v) && r.v !== null ? Number(r.v) : 0;
}

/**
 * Append an immutable snapshot of a strategy's rule set as the next version.
 * Never updates an existing row - that is the whole point of the table.
 * @param {number} strategyId
 * @param {object} fields  the strategy's rule-bearing values, already normalised
 * @param {string} [note]  why this version exists, shown next to the diff in the UI
 * @returns {Promise<number>} the version number just written
 */
async function snapshotStrategyVersion(strategyId, fields, note = '') {
  const next = (await currentStrategyVersion(strategyId)) + 1;
  await db.prepare(`INSERT INTO strategy_versions
    (strategy_id, version, name, description, market_conditions, timeframes, entry_rules, exit_rules, checklist, risk_rules, target_r_multiple, note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    strategyId, next, fields.name || '', fields.description || '', fields.market_conditions || '',
    fields.timeframes || '', fields.entry_rules || '[]', fields.exit_rules || '[]',
    fields.checklist || '[]', fields.risk_rules || '',
    Number.isFinite(Number(fields.target_r_multiple)) ? Number(fields.target_r_multiple) : 2,
    String(note || ''));
  return next;
}

/**
 * Do two strategies differ in a way that makes them DIFFERENT STRATEGIES?
 * Compares only STRATEGY_RULE_FIELDS, so a rename or a recolour does not fragment the
 * performance history of a strategy the trader has not actually changed.
 */
function strategyRulesChanged(before, after) {
  for (const f of STRATEGY_RULE_FIELDS) {
    const a = before[f], b = after[f];
    if (f === 'target_r_multiple') { if (Number(a) !== Number(b)) return f; continue; }
    if (String(a === undefined || a === null ? '' : a) !== String(b === undefined || b === null ? '' : b)) return f;
  }
  return null;
}

/* ------------------------------------------------- M50 bias hysteresis state */
/**
 * The stored bias for a symbol and timeframe, or null on a first read. Deliberately tolerant of a
 * missing table: a database opened before this row existed has the table created on boot by
 * `exec(SCHEMA)`, but a caller should never hard-fail an analysis over hysteresis state.
 */
async function getBiasState(symbol, tf) {
  try {
    const r = await db.prepare('SELECT symbol, tf, bias, invalidation_level, invalidation_side, since_t, age_bars, changed_because, disagreement, updated_at FROM bias_state WHERE symbol=? AND tf=?')
      .get(String(symbol || '').toUpperCase(), String(tf || ''));
    return r || null;
  } catch (e) { return null; }
}

/**
 * Numeric-or-null. `Number(null)` is 0 and `Number.isFinite(0)` is true, so the obvious
 * `Number.isFinite(Number(v)) ? Number(v) : null` guard stores 0 for an explicit null. That is not
 * cosmetic here: an `invalidation_level` of 0 with `invalidation_side` 'above' makes `close > 0`
 * true on every single call, so the bias would be invalidated constantly and hysteresis would do
 * nothing while looking like it was working. 0 is also a meaningful BIAS value (flat), so a
 * `disagreement` of 0 must not be conflated with "there was no disagreement".
 */
const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Upsert the bias state after an analysis. `age_bars` is carried by the caller. */
async function setBiasState(s) {
  const sym = String((s && s.symbol) || '').toUpperCase();
  const tf = String((s && s.tf) || '');
  if (!sym || !tf) return false;
  try {
    await db.prepare(`INSERT INTO bias_state
        (symbol, tf, bias, invalidation_level, invalidation_side, since_t, age_bars, changed_because, disagreement, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?, datetime('now'))
      ON CONFLICT(symbol, tf) DO UPDATE SET
        bias=excluded.bias,
        invalidation_level=excluded.invalidation_level,
        invalidation_side=excluded.invalidation_side,
        since_t=excluded.since_t,
        age_bars=excluded.age_bars,
        changed_because=excluded.changed_because,
        disagreement=excluded.disagreement,
        updated_at=excluded.updated_at`)
      .run(sym, tf, Number(s.bias) || 0,
        numOrNull(s.invalidation_level),
        s.invalidation_side === 'above' || s.invalidation_side === 'below' ? s.invalidation_side : null,
        numOrNull(s.since_t),
        numOrNull(s.age_bars) === null ? 0 : numOrNull(s.age_bars),
        s.changed_because == null ? null : String(s.changed_because),
        numOrNull(s.disagreement));
    return true;
  } catch (e) { return false; }
}

/** Drop stored bias state — for tests, for a reset, and for a symbol the user re-maps. */
async function clearBiasState(symbol, tf) {
  try {
    if (!symbol) { await db.prepare('DELETE FROM bias_state').run(); return true; }
    await db.prepare('DELETE FROM bias_state WHERE symbol=? AND tf=?').run(String(symbol).toUpperCase(), String(tf || ''));
    return true;
  } catch (e) { return false; }
}

/* ------------------------------------------------------------------- meta */

async function getMeta(k) {
  const r = await db.prepare('SELECT value FROM meta WHERE key=?').get(k);
  return r ? r.value : null;
}
async function setMeta(k, v) {
  await db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
}

/* --------------------------------------------------------------- seeds */

async function seedGlobalInstruments() {
  if ((await getMeta('global_instruments')) === 'v1') return 0;
  const rows = PRESETS.map((p) => ({
    sql: `INSERT INTO instruments (user_id,symbol,name,asset_class,exchange,currency,tick_size,pip_size,value_per_point,unit)
          VALUES (NULL,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(user_id,symbol) DO UPDATE SET name=excluded.name, value_per_point=excluded.value_per_point,
            tick_size=excluded.tick_size, pip_size=excluded.pip_size, asset_class=excluded.asset_class`,
    args: [p.symbol, p.name || p.symbol, p.asset_class, p.exchange || '', p.currency || 'USD',
      p.tick_size === undefined ? 0.01 : p.tick_size, p.pip_size === undefined ? 0.01 : p.pip_size,
      p.value_per_point === undefined ? 1 : p.value_per_point, p.unit || 'units'],
  }));
  await batch(rows);
  await setMeta('global_instruments', 'v1');
  await setMeta('schema_version', SCHEMA_VERSION);
  return rows.length;
}

const DEFAULT_STRATEGIES = [
  {
    name: 'Trend Pullback (continuation)', colour: '#3ddc97',
    description: 'Enter the first pullback into a value area (EMA20 / prior structure) inside an established trend.',
    market_conditions: 'Trending', timeframes: 'H1 / H4 / Daily',
    entry_rules: ['Higher-timeframe trend aligned (H4 structure)', 'Price pulls back into EMA20 or broken structure', 'Rejection candle / engulfing on LTF', 'No major news within 30 min'],
    exit_rules: ['Stop below the pullback swing', 'Partial at 1R, trail the rest', 'Exit on close back through EMA20'],
    checklist: ['HTF trend confirmed', 'Pullback into value done', 'Trigger candle closed', 'Risk ≤ 1%', 'Event calendar checked'],
    risk_rules: 'Risk 1% max. No averaging down. Move to BE at +1R.', target_r_multiple: 2.5,
  },
  {
    name: 'Breakout / Range Expansion', colour: '#4f8cff',
    description: 'Trade the expansion out of a tight consolidation with rising volume.',
    market_conditions: 'Compression → expansion', timeframes: 'M15 / H1',
    entry_rules: ['Range of 15+ candles with clean edges', 'Break + retest of the level', 'Volume expansion on the break', 'Avoid trading straight into HTF resistance'],
    exit_rules: ['Stop on the opposite side of the range', 'Target measured move', 'Kill the trade if it re-enters the range'],
    checklist: ['Range quality graded', 'Measured move ≥ 2R', 'Liquidity above/below checked', 'No event risk'],
    risk_rules: 'Risk 0.75–1%. One re-entry max after a false break.', target_r_multiple: 3,
  },
  {
    name: 'Mean Reversion (range fade)', colour: '#f7b955',
    description: 'Fade extremes of a well-defined range when momentum is fading.',
    market_conditions: 'Ranging / low volatility', timeframes: 'H1 / M15',
    entry_rules: ['Clear multi-touch range', 'Price at range extreme', 'Divergence / exhaustion wick', 'Not during trend day'],
    exit_rules: ['Target mid-range then opposite extreme', 'Hard stop beyond range edge + buffer', 'Time stop: out if no move in 2 sessions'],
    checklist: ['Range not about to break', 'RSI divergence present', 'Risk ≤ 0.75%', 'No high-impact news'],
    risk_rules: 'Smaller size, tighter stop. This is the lowest-expectancy of the three — size accordingly.', target_r_multiple: 1.5,
  },
];

const DEFAULT_CHECKLIST = [
  'Bias and higher timeframe alignment checked',
  'Setup matches a written playbook entry',
  'Entry, stop and target defined BEFORE entry',
  'Position size calculated from stop distance',
  'Risk ≤ account limit for this trade',
  'No high-impact news inside the trade window',
  'Not revenge trading / not after a red day',
  'Daily loss limit not hit',
];

/** Create a user with its first account, playbook and preferences. */
async function createUser({ email, name, password }) {
  const hash = hashPassword(password || crypto.randomBytes(18).toString('hex'));
  const info = await db.prepare('INSERT INTO users(email,name,password_hash,settings) VALUES(?,?,?,?)')
    .run(email.toLowerCase().trim(), name || '', hash, JSON.stringify({
      timezone: 'Africa/Lagos',
      default_checklist: DEFAULT_CHECKLIST,
      focus_symbols: ['EURUSD', 'XAUUSD', 'NAS100', 'BTCUSDT'],
      base_currency: 'USD',
    }));
  const userId = info.lastInsertRowid;
  const acc = await db.prepare(`INSERT INTO accounts
    (user_id,name,broker,account_type,currency,starting_balance,current_balance,is_default)
    VALUES(?,?,?,?,?,?,?,1)`).run(userId, 'Main Account', '', 'live', 'USD', 10000, 10000);
  const stmts = DEFAULT_STRATEGIES.map((s) => ({
    sql: `INSERT INTO strategies
      (user_id,name,description,market_conditions,timeframes,entry_rules,exit_rules,checklist,risk_rules,target_r_multiple,colour)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    args: [userId, s.name, s.description, s.market_conditions, s.timeframes,
      JSON.stringify(s.entry_rules), JSON.stringify(s.exit_rules), JSON.stringify(s.checklist),
      s.risk_rules, s.target_r_multiple, s.colour],
  }));
  await batch(stmts);
  return { userId, accountId: acc.lastInsertRowid };
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}
function verifyPassword(pw, stored) {
  try {
    const [algo, salt, key] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const calc = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(calc, 'hex'));
  } catch { return false; }
}

/* --------------------------------------------------------------- sessions */

async function createSession(userId, days = 30) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + days * 864e5).toISOString();
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash, userId, expires);
  return token;
}

async function userFromToken(token) {
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = await db.prepare(`SELECT s.user_id, s.expires_at, u.email, u.name, u.settings
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=?`).get(tokenHash);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
    return null;
  }
  let settings = {};
  try { settings = JSON.parse(row.settings || '{}'); } catch { settings = {}; }
  return { id: row.user_id, email: row.email, name: row.name, settings };
}

async function destroySession(token) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(token).digest('hex'));
}

/* --------------------------------------------------------- webhook tokens */

function urlSafeToken() { return crypto.randomBytes(20).toString('base64url'); }

async function getOrCreateWebhookToken(userId, label = 'TradingView') {
  const row = await db.prepare('SELECT * FROM webhook_tokens WHERE user_id=? ORDER BY id LIMIT 1').get(userId);
  if (row) return row;
  const token = urlSafeToken();
  const info = await db.prepare('INSERT INTO webhook_tokens(user_id,token,label) VALUES(?,?,?)').run(userId, token, label);
  return db.prepare('SELECT * FROM webhook_tokens WHERE id=?').get(info.lastInsertRowid);
}

async function rotateWebhookToken(userId) {
  await db.prepare('DELETE FROM webhook_tokens WHERE user_id=?').run(userId);
  return getOrCreateWebhookToken(userId);
}

async function setWebhookOptions(userId, { analyse, autocreate, label } = {}) {
  const row = await getOrCreateWebhookToken(userId);
  const nextA = analyse === undefined || analyse === null ? row.analyse : (analyse ? 1 : 0);
  const nextC = autocreate === undefined || autocreate === null ? row.autocreate : (autocreate ? 1 : 0);
  await db.prepare('UPDATE webhook_tokens SET analyse=?, autocreate=?, label=? WHERE id=?')
    .run(nextA, nextC, label === undefined || label === null ? row.label : String(label).slice(0, 60), row.id);
  return db.prepare('SELECT * FROM webhook_tokens WHERE id=?').get(row.id);
}

async function userFromWebhookToken(token) {
  if (!token) return null;
  const row = await db.prepare(`SELECT t.id AS token_id, t.user_id, t.analyse, t.autocreate, u.email, u.name, u.settings
    FROM webhook_tokens t JOIN users u ON u.id = t.user_id WHERE t.token=?`).get(String(token));
  if (!row) return null;
  await db.prepare("UPDATE webhook_tokens SET last_used_at=datetime('now'), uses=uses+1 WHERE id=?").run(row.token_id);
  let settings = {};
  try { settings = JSON.parse(row.settings || '{}'); } catch { settings = {}; }
  return { id: row.user_id, email: row.email, name: row.name, settings, token_id: row.token_id, analyse: !!row.analyse, autocreate: !!row.autocreate };
}

/** Wipe every table for a workspace (used by the "fresh workspace" flow). */
async function clearWorkspace(userId) {
  const tables = ['tv_alerts', 'webhook_tokens', 'bot_signals', 'rule_checks', 'journal_entries', 'goals', 'watchlist', 'trades', 'strategies', 'accounts'];
  await batch(tables.map((t) => ({ sql: `DELETE FROM ${t} WHERE user_id=?`, args: [userId] })));
  await db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  await db.prepare('DELETE FROM users WHERE id=?').run(userId);
}

module.exports = {
  migrate,
  client, db, prepare, exec, batch, tx, ready,
  DB_URL, DB_PATH, REMOTE, DATA_DIR, SCHEMA_VERSION,
  getMeta, setMeta, seedGlobalInstruments, createUser, hashPassword, verifyPassword,
  // M50: bias hysteresis state. Exported so the server path can hold a bias between calls and so
  // a probe can reset it deterministically instead of depending on whatever the last run left.
  getBiasState, setBiasState, clearBiasState,
  createSession, userFromToken, destroySession, clearWorkspace,
  getOrCreateWebhookToken, rotateWebhookToken, setWebhookOptions, userFromWebhookToken,
  DEFAULT_CHECKLIST, DEFAULT_STRATEGIES, currentStrategyVersion, snapshotStrategyVersion, strategyRulesChanged, STRATEGY_RULE_FIELDS};