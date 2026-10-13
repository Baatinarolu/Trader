'use strict';
/**
 * M106 — the fresh in-session four-question state gate.
 *
 * Saved Ep28 states the rule verbatim: "Am I calm? Am I clear? Am I following the
 * trade plan? Would I take this trade if I was already up big today? If the answer to
 * any of these questions is no, then you don't trade yet."
 *
 * The app cannot read a mind. What this module does is record THE TRADER'S OWN
 * answers with a server receipt, refuse to call a missing, stale or unavailable answer
 * set a pass, and refuse the app's own actionable surface when an answer set that was
 * actually given says no. It is deterministic and auditable; it is not a mental-state
 * measurement, a score, a grade, or a broker/execution block.
 */
const crypto = require('crypto');
const VERSION = 'state-gate-v1';
/** APP freshness policy for an in-session check — not a course, broker or clock rule. */
const WINDOW_MIN = 60;
const QUESTIONS = [
  { id: 'calm', text: 'Am I calm?' },
  { id: 'clear', text: 'Am I clear?' },
  { id: 'following_plan', text: 'Am I following the trade plan?' },
  { id: 'would_take_if_up_big', text: 'Would I take this trade if I was already up big today?' },
];
const ANSWER_IDS = QUESTIONS.map((q) => q.id);
const BASIS = 'Recorded self-declared answers to the four saved questions with a server receipt; a fresh pass is the trader\'s own statement, not verified calmness, clear thinking, plan adherence, broker state or an edge. A no blocks the app\'s own actionable surface the way the killzone veto does and cannot reach a broker. Absence of answers is never a pass, and imported copies never grant permission.';

const id = (n) => Number.isSafeInteger(n) && n > 0;
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function invalid(message, status = 400) { return Object.assign(new Error(message), { code: 'state_gate_invalid', status }); }
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const Clock = (s, o) => require('./process-outcomes').clock(s, o);

/** null = "not answered now". Any other value must be exactly the four booleans. */
function answers(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Answer all four questions yes/no, or explicitly record that you have not answered.');
  const keys = Object.keys(value);
  if (keys.length !== ANSWER_IDS.length || ANSWER_IDS.some((k) => !Object.hasOwn(value, k)) || keys.some((k) => !ANSWER_IDS.includes(k))) throw invalid('Answer exactly the four saved questions: calm, clear, following the plan, would take it if already up big.');
  const out = {};
  for (const k of ANSWER_IDS) { if (typeof value[k] !== 'boolean') throw invalid('Each answer is a truthful yes or no; there is no "maybe" and no default.'); out[k] = value[k]; }
  return out;
}
function input(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !['answers', 'revision'].includes(k)) || !Object.hasOwn(body, 'answers') || typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision)) throw invalid('Send the displayed revision and explicit answers/null only; the app records your answers, so no caller clock, source or owner authority is accepted.');
  return { answers: answers(body.answers), revision: body.revision };
}

function evaluate(rows, accountId, { nowMs = Date.now() } = {}) {
  const human = (rows || []).filter((r) => r && r.source === 'human_declared');
  const archives = (rows || []).filter((r) => r && r.source === 'imported_unverified');
  /** Using the gate at all — including an explicit "not answered now" — is adoption;
   * recording a null can therefore never be a way to un-adopt the check and act. */
  const adopted = human.length > 0;
  const base = {
    schema: VERSION, version: null, account_id: accountId, state: 'not_adopted', allowed: false, adopted,
    answers: null, receipt: null, recorded_at: null, age_minutes: null, expires_at: null,
    questions: QUESTIONS, window_minutes: WINDOW_MIN, imported_archives: archives.length,
    failed_questions: [], broker_verified: false, service: VERSION, basis: BASIS,
  };
  const last = human.length ? human[human.length - 1] : null;
  if (!last) return base;
  const receipt = Clock(last.recorded_at, { canonical: true, now: nowMs });
  if (receipt === null) return { ...base, state: 'unavailable' };
  if (last.schema_version !== VERSION) return { ...base, state: 'unavailable', recorded_at: last.recorded_at };
  let given; try { given = last.answers_json === null || last.answers_json === undefined ? null : JSON.parse(last.answers_json); } catch { return { ...base, state: 'unavailable', recorded_at: last.recorded_at }; }
  try { given = answers(given); } catch { return { ...base, state: 'unavailable', recorded_at: last.recorded_at }; }
  const age = nowMs - receipt, fresh = age >= 0 && age <= WINDOW_MIN * 60000 && utcDay(receipt) === utcDay(nowMs);
  const failed = given ? ANSWER_IDS.filter((k) => given[k] === false) : [];
  const state = given === null ? 'unanswered' : !fresh ? 'stale' : failed.length ? 'failed' : 'passed';
  return {
    ...base, state, allowed: state === 'passed', answers: given, failed_questions: failed,
    recorded_at: last.recorded_at, receipt: receipt === null ? null : new Date(receipt).toISOString(),
    version: id(Number(last.version)) ? Number(last.version) : null,
    age_minutes: Math.max(0, Math.round(age / 60000)),
    expires_at: new Date(receipt + WINDOW_MIN * 60000).toISOString(),
  };
}

function publicRow(row) {
  if (!row) return null;
  try {
    if (!['human_declared', 'imported_unverified'].includes(row.source) || row.schema_version !== VERSION || !id(row.account_key) || (row.account_id !== null && row.account_id !== row.account_key) || !id(row.version) || Clock(row.recorded_at, { canonical: true }) === null) throw invalid('Unavailable state-gate answer record.');
    const given = row.answers_json === null || row.answers_json === undefined ? null : answers(JSON.parse(row.answers_json));
    return { id: row.id, account_id: row.account_id, account_key: row.account_key, version: Number(row.version), answers: given, state: row.source === 'imported_unverified' ? 'imported_unverified' : given === null ? 'unanswered' : 'answered', source: row.source, recorded_at: row.recorded_at, historical: row.historical_json ? JSON.parse(row.historical_json) : null, broker_verified: false };
  } catch { return { id: row.id, account_key: row.account_key, version: null, answers: null, state: 'unavailable', source: 'unavailable', recorded_at: null, broker_verified: false }; }
}

async function owned(store, userId, accountId) {
  if (!['string', 'number'].includes(typeof accountId) || (typeof accountId === 'string' && !/^[1-9]\d*$/.test(accountId)) || !id(Number(accountId))) throw invalid('Account not found.', 404);
  const a = await store.prepare('SELECT * FROM accounts WHERE user_id=? AND id=?').get(userId, Number(accountId));
  if (!a) throw invalid('Account not found.', 404);
  return a;
}
const rowsOn = (store, userId, accountId) => store.prepare('SELECT * FROM state_gate_answers WHERE user_id=? AND account_key=? ORDER BY id').all(userId, accountId);

async function viewOn(store, userId, accountId, { nowMs = Date.now() } = {}) {
  const a = await owned(store, userId, accountId);
  const rows = await rowsOn(store, userId, a.id);
  return { account_id: a.id, ...evaluate(rows, a.id, { nowMs }), history: rows.map(publicRow), revision: hash([userId, a.id, rows]) };
}
async function read(userId, accountId, options) { const { db } = require('./db'); return db.tx(async (tx) => viewOn(db.transactionStore(tx), userId, accountId, options)); }
async function save(userId, accountId, body, { nowMs = Date.now() } = {}) {
  const fields = input(body); const { db } = require('./db');
  return db.tx(async (tx) => {
    const store = db.transactionStore(tx), v = await viewOn(store, userId, accountId, { nowMs });
    if (fields.revision !== v.revision) throw invalid('State-gate answers or account changed. Explicitly reload before answering.', 409);
    const next = (await store.prepare('SELECT MAX(version) v FROM state_gate_answers WHERE user_id=? AND account_key=?').get(userId, v.account_id)).v || 0;
    await store.prepare('INSERT INTO state_gate_answers(user_id,account_id,account_key,version,answers_json,source,recorded_at,schema_version) VALUES(?,?,?,?,?,?,?,?)')
      .run(userId, v.account_id, v.account_id, Number(next) + 1, fields.answers === null ? null : JSON.stringify(fields.answers), 'human_declared', new Date(nowMs).toISOString(), VERSION);
    return viewOn(store, userId, accountId, { nowMs });
  });
}
function unavailable(reason = 'State-gate answers unavailable — not answered, not a pass, and not a block.') { return { schema: VERSION, version: null, account_id: null, state: 'unavailable', allowed: false, adopted: false, answers: null, receipt: null, recorded_at: null, age_minutes: null, expires_at: null, questions: QUESTIONS, window_minutes: WINDOW_MIN, imported_archives: 0, failed_questions: [], broker_verified: false, service: VERSION, message: reason, basis: BASIS }; }
async function optional(userId, accountId, { nowMs = Date.now(), store = null } = {}) {
  try {
    if (store) return await viewOn(store, userId, accountId, { nowMs });
    return await read(userId, accountId, { nowMs });
  } catch { return unavailable(); }
}
/** The write paths' own permission question. `not_adopted` is the ONE state that is
 * not an enforcement: an account that has never answered the four questions has no
 * recorded refusal for the app to honour, so the desk stays legible and says so
 * rather than inventing a check the trader never gave. Everything else refuses. */
async function permission(userId, accountId, { nowMs = Date.now() } = {}) {
  let view; try { view = await read(userId, accountId, { nowMs }); } catch (e) { if (e.code === 'state_gate_invalid' && e.status === 404) throw e; return { ...unavailable(), adopted: true, message: 'State gate unavailable; the app cannot claim a fresh pass.' }; }
  const allowed = view.state === 'passed' || view.state === 'not_adopted';
  const message = view.state === 'failed' ? `State gate: you answered no to ${view.failed_questions.map((k) => `"${QUESTIONS.find((q) => q.id === k).text}"`).join(', ')}. You do not trade yet.`
    : view.state === 'stale' ? `State gate: your last answers are ${view.age_minutes} minutes old (APP window ${WINDOW_MIN} min) and cannot stand in for a fresh in-session check.`
      : view.state === 'unanswered' ? 'State gate: you have not answered the four questions for this session.'
        : view.state === 'unavailable' ? 'State gate: the stored answers cannot be read back, so no pass is claimed.'
          : view.state === 'not_adopted' ? 'The four-question state gate is not adopted on this account: the desk cannot claim a state check it never received, and this is not a pass.' : `State gate passed at ${view.receipt} (trader's own answers, expired ${view.expires_at}).`;
  return { ...view, allowed, message };
}
async function history(userId, accountId = null) {
  const { db } = require('./db');
  if (accountId !== null) await owned(db, userId, accountId);
  const rows = await db.prepare('SELECT * FROM state_gate_answers WHERE user_id=?' + (accountId === null ? '' : ' AND account_key=?') + ' ORDER BY id').all(...(accountId === null ? [userId] : [userId, Number(accountId)]));
  return { records: rows.map(publicRow), readonly: true, broker_verified: false, basis: BASIS };
}
function portable(raw) {
  const out = { records: [], warnings: [] };
  if (raw == null) return out;
  try {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.records) || raw.records.length > 500) throw invalid('Optional state-gate history requires version 1 and at most 500 records.');
    if (raw.unavailable || raw.unavailable_records > 0) out.warnings.push('Original state-gate history unavailable/omitted; no pass and no refusal is inferred.');
    for (const r of raw.records) {
      try {
        const given = answers(r.answers === undefined ? null : r.answers);
        const original = r.historical || {}, oldClock = original.recorded_at ?? r.recorded_at;
        let declared = oldClock;
        if (oldClock != null && Clock(oldClock, { canonical: true }) === null) { out.warnings.push('Invalid/future original state-gate receipt omitted, not receiving-clock proof.'); declared = null; }
        out.records.push({ account_id: r.account_id ?? r.account_key, answers: given, historical: { source: original.source || r.source || null, recorded_at: declared, original_version: original.original_version ?? r.version ?? null, original_id: original.original_id ?? r.id ?? null } });
      } catch (e) { out.warnings.push(e.message || 'Invalid optional state-gate answer set omitted.'); }
    }
  } catch (e) { out.warnings.push(e.message || 'Optional state-gate history omitted.'); }
  out.warnings = out.warnings.slice(0, 20);
  return out;
}
async function exportOwned(userId) {
  try { const { db } = require('./db'), rows = await db.prepare('SELECT * FROM state_gate_answers WHERE user_id=? ORDER BY id').all(userId), records = rows.map(publicRow).filter((p) => p.state !== 'unavailable'); return { version: 1, records, unavailable_records: rows.length - records.length }; }
  catch { return { version: 1, records: [], unavailable: true }; }
}
async function importOn(store, userId, parsed, map = {}, fallback = null) {
  for (const p of parsed.records) {
    const accountId = map[p.account_id] || fallback;
    await owned(store, userId, accountId);
    const next = (await store.prepare('SELECT MAX(version) v FROM state_gate_answers WHERE user_id=? AND account_key=?').get(userId, accountId)).v || 0;
    await store.prepare('INSERT INTO state_gate_answers(user_id,account_id,account_key,version,answers_json,source,recorded_at,historical_json,schema_version) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(userId, accountId, accountId, Number(next) + 1, p.answers === null ? null : JSON.stringify(p.answers), 'imported_unverified', new Date().toISOString(), JSON.stringify(p.historical), VERSION);
  }
}
/** Merge into the desk's personal state. A recorded no — or an adopted account whose
 * check is missing/stale/unreadable — becomes the same kind of stop the personal
 * guardrails already produce, so `Guards.applyToSetups` and the Now surface refuse the
 * signal. `not_adopted` is reported, never silently upgraded into a block. */
function apply(daily, gate) {
  if (!daily || !gate) return daily;
  /* `allowed` in the published object always means "a fresh all-yes pass exists".
   * `permission` is the app's own write decision, where an account that never adopted
   * the gate is deliberately not refused. Keeping the two distinct is what stops a
   * snapshot of an unadopted account from reading like a state check that passed. */
  const published = { ...gate, permission: gate.state === 'passed' || gate.state === 'not_adopted', allowed: gate.state === 'passed' };
  const out = { ...daily, state_gate: published };
  const refusing = gate.state === 'failed' || (gate.adopted && gate.state !== 'passed');
  if (!refusing) return out;
  const rule = gate.state === 'failed' ? 'state_gate_failed' : `state_gate_${gate.state}`;
  const detail = gate.state === 'failed'
    ? `State gate: your own recorded answer was no to ${gate.failed_questions.map((k) => `"${QUESTIONS.find((q) => q.id === k).text}"`).join(', ')} — you do not trade yet, and a fresh honest answer is the only way to change that.`
    : `State gate: an adopted in-session check is not currently passed (${gate.state}). Answer the four questions; this refusal is the app's own and cannot reach a broker.`;
  return {
    ...out,
    state_gate: { ...published, rule, detail },
    breaches: [...(daily.breaches || []), { rule, detail, state_gate: true }],
    status: 'stop',
    message: 'Stand down: ' + detail,
    permission: { ...(daily.permission || {}), allowed: false, can_override: false, state: 'state_gate', message: 'Stand down: ' + detail },
  };
}
module.exports = { VERSION, WINDOW_MIN, QUESTIONS, ANSWER_IDS, BASIS, id, hash, invalid, answers, input, evaluate, publicRow, owned, viewOn, read, save, permission, optional, unavailable, history, portable, exportOwned, importOn, apply };
