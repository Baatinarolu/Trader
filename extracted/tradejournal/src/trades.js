'use strict';
/**
 * trades.js — turn raw client input into a fully-computed journal record.
 * One place that decides what a trade *is*, so API, importer and demo seeder agree.
 */
const I = require('./instruments');
const P = require('./performance');

const num = (v, d = 0) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

/**
 * @param {object} raw   client payload
 * @param {object} ctx   { instrument: spec|null, tz, defaultAccountId }
 */
function normalise(raw, ctx = {}) {
  const spec = ctx.instrument || I.genericSpec(raw.symbol, raw.asset_class);
  const direction = String(raw.direction || 'long').toLowerCase() === 'short' ? 'short' : 'long';
  const status = String(raw.status || 'closed').toLowerCase() === 'open' ? 'open' : 'closed';
  const entry = num(raw.entry);
  const exit = raw.exit === '' || raw.exit === null || raw.exit === undefined ? null : num(raw.exit);
  const size = num(raw.size);
  const fees = num(raw.fees);
  const vpp = num(spec.value_per_point, 1) || 1;

  const t = {
    symbol: String(raw.symbol || spec.symbol || '').toUpperCase().trim(),
    asset_class: spec.asset_class || raw.asset_class || 'stocks',
    direction, status,
    opened_at: toIso(raw.opened_at) || new Date().toISOString(),
    closed_at: status === 'closed' ? (toIso(raw.closed_at) || (exit ? new Date().toISOString() : null)) : null,
    entry,
    exit,
    stop: raw.stop === '' || raw.stop === null || raw.stop === undefined ? null : num(raw.stop),
    target: raw.target === '' || raw.target === null || raw.target === undefined ? null : num(raw.target),
    size, fees,
    stop_moved: raw.stop_moved ? 1 : 0,
    exit_reason: raw.exit_reason || '',
    strategy_id: raw.strategy_id ? num(raw.strategy_id) : null,
    strategy_name: raw.strategy_name || '',
    setup_grade: raw.setup_grade || '',
    session: raw.session || '',
    timeframes: raw.timeframes || '',
    emotion_before: raw.emotion_before || '',
    emotion_after: raw.emotion_after || '',
    confidence: raw.confidence === '' || raw.confidence == null ? null : num(raw.confidence),
    adherence: raw.adherence === '' || raw.adherence == null ? null : num(raw.adherence),
    mistakes: arrayToCsv(raw.mistakes),
    tags: arrayToCsv(raw.tags),
    thesis: raw.thesis || '',
    lesson: raw.lesson || '',
    execution_notes: raw.execution_notes || '',
    notes: raw.notes || '',
    screenshot_url: raw.screenshot_url || '',
    planned_r: raw.planned_r ? num(raw.planned_r) : null,
  };

  // --- M36: entry legs (scale-ins): the weighted entry price is what the P&L uses ---
  // Ep 11, his live scalper trade on camera: "enter for the long for the first position right
  // here. And then later on price pullback to this area here, giving me more confirmation. So,
  // this is where I decided to scale in for my second position." -- with the stop then moved
  // "below this new low... of my second position."
  // Scaling OUT already had this mechanism (`legs`, below). Scaling IN did not, so a pyramid
  // could only be journalled as two unrelated trades and the coach could not see the pattern.
  // Mirrors `legs` deliberately: same JSON column shape, same weighted-average arithmetic, so
  // the two directions cannot drift apart.
  let entries = [];
  if (Array.isArray(raw.entries)) entries = raw.entries;
  else if (typeof raw.entries === 'string' && raw.entries.trim().startsWith('[')) { try { entries = JSON.parse(raw.entries); } catch { entries = []; } }
  entries = entries.map((l) => ({
    pct: num(l.pct, 0), price: num(l.price, null),
    reason: l.reason ? String(l.reason).slice(0, 60) : '', at: l.at || null,
    stop_after: l.stop_after === '' || l.stop_after == null ? null : num(l.stop_after),
  })).filter((l) => l.price !== null && l.pct > 0);
  let weightedEntry = entry;
  if (entries.length) {
    const totalPct = entries.reduce((a, l) => a + l.pct, 0);
    if (totalPct > 0) weightedEntry = r4(entries.reduce((a, l) => a + l.pct * l.price, 0) / totalPct);
    t.entry = weightedEntry;
    // the stop follows the most recent add that carries one -- that is the course's rule
    const lastStop = entries.slice().reverse().find((l) => l.stop_after !== null);
    if (lastStop) { t.stop = lastStop.stop_after; t.stop_moved = 1; }
  }
  t.entries = entries.length ? JSON.stringify(entries) : null;
  t.entries_n = entries.length;
  t.weighted_entry = entries.length ? weightedEntry : null;
  // Ep 18 distinguishes the two: adding into a winner is the method, adding into a loser is
  // averaging down. The coach needs the flag to tell them apart.
  t.adds_into_winner = entries.length > 1
    ? (direction === 'long'
      ? (entries[entries.length - 1].price > weightedEntry ? 1 : 0)
      : (entries[entries.length - 1].price < weightedEntry ? 1 : 0))
    : null;

  // --- legs (scale-outs): the weighted exit price is what the P&L uses ---
  let legs = [];
  if (Array.isArray(raw.legs)) legs = raw.legs;
  else if (typeof raw.legs === 'string' && raw.legs.trim().startsWith('[')) { try { legs = JSON.parse(raw.legs); } catch { legs = []; } }
  legs = legs.map((l) => ({
    pct: num(l.pct, 0), price: num(l.price, null),
    reason: l.reason ? String(l.reason).slice(0, 60) : '', at: l.at || null,
  })).filter((l) => l.price !== null && l.pct > 0);
  let effectiveExit = exit;
  if (legs.length) {
    const totalPct = legs.reduce((a, l) => a + l.pct, 0);
    if (totalPct > 0) effectiveExit = r4(legs.reduce((a, l) => a + l.pct * l.price, 0) / totalPct);
  }
  t.legs = legs.length ? JSON.stringify(legs) : null;
  t.legs_n = legs.length;
  t.weighted_exit = legs.length ? effectiveExit : null;
  if (legs.length) t.exit = effectiveExit;

  // --- P&L ---
  const closed = status === 'closed' && effectiveExit !== null && effectiveExit !== undefined && size;
  const pnl = closed ? I.computePnl({ ...t, exit: effectiveExit, value_per_point: vpp }) : { gross: 0, net: 0 };
  t.gross_pnl = pnl.gross; t.net_pnl = pnl.net;

  // --- risk ---
  const risk = t.stop ? I.riskAmount({ ...t, value_per_point: vpp }) : null;
  t.risk_amount = risk || 0;
  if (!t.planned_r && t.stop && t.target && entry) {
    const reward = Math.abs(num(t.target) - entry) * size * vpp;
    if (risk) t.planned_r = r2(reward / risk);
  }

  // --- R multiple ---
  t.r_multiple = t.risk_amount > 0 && closed ? r4(t.net_pnl / t.risk_amount) : 0;

  // --- MAE / MFE (accept explicit R, or price extremes, or derive nothing) ---
  let mae_r = numOrNull(raw.mae_r), mfe_r = numOrNull(raw.mfe_r);
  const perUnit = t.stop ? Math.abs(entry - num(t.stop)) : 0;
  if (perUnit > 0) {
    if (mae_r === null && raw.mae_price != null && raw.mae_price !== '') {
      const adverse = direction === 'long' ? entry - num(raw.mae_price) : num(raw.mae_price) - entry;
      mae_r = r4(-Math.max(0, adverse) / perUnit);
    }
    if (mfe_r === null && raw.mfe_price != null && raw.mfe_price !== '') {
      const fav = direction === 'long' ? num(raw.mfe_price) - entry : entry - num(raw.mfe_price);
      mfe_r = r4(Math.max(0, fav) / perUnit);
    }
    // If the user gave no excursions at all we can still bound them from the realised result
    if (mae_r === null && t.r_multiple < 0) mae_r = r4(Math.min(t.r_multiple, 0));
    if (mfe_r === null && t.r_multiple > 0) mfe_r = r4(Math.max(t.r_multiple, 0));
  }
  t.mae_r = mae_r; t.mfe_r = mfe_r;

  t.session = t.session || P.sessionOf(t.opened_at);
  if (!t.exit_reason && status === 'closed') t.exit_reason = P.deriveExitReason({ ...t, exit_reason: '' });
  return t;
}

function toIso(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  // datetime-local strings ("2026-10-06T14:30") have no timezone → treat as UTC offset of the browser
  return d.toISOString();
}
function arrayToCsv(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(', ');
  return String(v || '').trim();
}
function numOrNull(v) { return v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v); }

const COLUMNS = ['user_id', 'account_id', 'symbol', 'asset_class', 'direction', 'status', 'opened_at', 'closed_at',
  'entry', 'exit', 'stop', 'target', 'size', 'fees', 'gross_pnl', 'net_pnl', 'risk_amount', 'r_multiple', 'planned_r',
  'mae_r', 'mfe_r', 'stop_moved', 'exit_reason', 'strategy_id', 'strategy_name', 'setup_grade', 'session', 'timeframes',
  'emotion_before', 'emotion_after', 'confidence', 'adherence', 'mistakes', 'tags', 'thesis', 'lesson', 'execution_notes',
  'strategy_version',
  'notes', 'screenshot_url', 'legs', 'entries'];

async function insert(db, userId, t) {
  const row = { ...t, user_id: userId };
  const cols = COLUMNS.filter((c) => row[c] !== undefined);
  const stmt = await db.prepare(`INSERT INTO trades (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`);
  const payload = {}; for (const c of cols) payload[c] = row[c] === undefined ? null : row[c];
  const info = await stmt.run(payload);
  return Number(info.lastInsertRowid);
}

/**
 * Statement list for a bulk insert — one SQL shape for every row (libSQL batches
 * share a single statement), falling back to SQLite's own defaults for the
 * columns a given trade does not carry.
 */
function batchStatements(userId, trades) {
  if (!trades || !trades.length) return [];
  const rows = trades.map((t) => ({ ...t, user_id: userId }));
  const cols = COLUMNS.filter((c) => rows.some((r) => r[c] !== undefined));
  const sql = `INSERT INTO trades (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`;
  return rows.map((row) => {
    const args = {};
    for (const c of cols) args[c] = row[c] === undefined ? null : row[c];
    return { sql, args };
  });
}

const UPDATABLE = COLUMNS.filter((c) => !['user_id'].includes(c));
async function update(db, userId, id, fields) {
  const cols = UPDATABLE.filter((c) => fields[c] !== undefined);
  if (!cols.length) return;
  const stmt = await db.prepare(`UPDATE trades SET ${cols.map((c) => c + '=@' + c).join(',')}, updated_at=datetime('now') WHERE id=@id AND user_id=@user_id`);
  const payload = { id, user_id: userId }; for (const c of cols) payload[c] = fields[c] === undefined ? null : fields[c];
  await stmt.run(payload);
}

/** Sort/export order: newest close first. */
function listQuery(filters = {}) {
  const where = ['user_id = @user_id'];
  const params = {};
  if (filters.account_id) { where.push('account_id = @account_id'); params.account_id = Number(filters.account_id); }
  if (filters.status) { where.push('status = @status'); params.status = filters.status; }
  if (filters.symbol) { where.push('UPPER(symbol) = @symbol'); params.symbol = String(filters.symbol).toUpperCase(); }
  if (filters.strategy_id) { where.push('strategy_id = @strategy_id'); params.strategy_id = Number(filters.strategy_id); }
  if (filters.from) { where.push("date(COALESCE(closed_at, opened_at)) >= date(@from)"); params.from = filters.from; }
  if (filters.to) { where.push("date(COALESCE(closed_at, opened_at)) <= date(@to)"); params.to = filters.to; }
  if (filters.asset_class) { where.push('asset_class = @asset_class'); params.asset_class = filters.asset_class; }
  if (filters.tag) { where.push("(',' || REPLACE(tags,' ','') || ',') LIKE @tag"); params.tag = `%,${String(filters.tag).replace(/\s/g, '')},%`; }
  if (filters.q) { where.push('(UPPER(symbol) LIKE @q OR LOWER(strategy_name) LIKE @q OR LOWER(tags) LIKE @q OR LOWER(thesis) LIKE @q OR LOWER(notes) LIKE @q)'); params.q = '%' + String(filters.q).toLowerCase() + '%'; }
  const order = filters.sort === 'opened' ? 'opened_at DESC' : 'COALESCE(closed_at, opened_at) DESC';
  return { where: where.join(' AND '), params, order };
}

module.exports = { normalise, insert, batchStatements, update, listQuery, COLUMNS, toIso, r2, r4 };
