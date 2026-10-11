'use strict';
/** Personal admission rules, not a market/entry model. Rule days are UTC,
 * matching the existing daily journal API. Server time, never a client clock.
 */
const DEFAULT_CAP = 3;
const TF_MS = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000,
  '1h': 3600000, '4h': 14400000, '1d': 86400000, '1wk': 604800000 };
function parseCap(value) {
  if (value == null || value === '' || typeof value === 'boolean') throw new Error('max_trades_day must be an integer from 1 to 100');
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('max_trades_day must be an integer from 1 to 100');
  return n;
}
function configuredCap(account = {}) {
  try { return parseCap(account.max_trades_day); } catch { return DEFAULT_CAP; }
}
/** Ep31 calls this optional; NULL/blank is OFF. The range is app validation,
 * not a course-mandated universal ceiling. Never coerce booleans/arrays to money. */
function parseProfitLimit(value) {
  if (value == null || (typeof value==='string' && !value.trim())) return null;
  if ((typeof value!=='number' && typeof value!=='string')
      || (typeof value==='string' && !/^(?:\+?\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())))
    throw new Error('daily_profit_limit_pct must be blank/off or a positive percentage up to 100');
  const n = Number(value);
  if (!Number.isFinite(n) || n<=0 || n>100)
    throw new Error('daily_profit_limit_pct must be blank/off or a positive percentage up to 100');
  return n;
}
const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
const msOf = value => value == null || value === '' ? NaN : Date.parse(/^[\d-]+ [\d:.]+$/.test(String(value)) ? String(value).replace(' ', 'T')+'Z' : value);
const number = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const r2 = v => Math.round(v * 100) / 100;
/** Freeze the preselected cap on the first check of a rule day. An account edit
 * selects tomorrow's cap; it cannot erase today's stop in the middle of a streak.
 */
async function dailyCap(store, userId, account, nowMs = Date.now()) {
  const date = dayKey(nowMs);
  if (!account.id) throw new Error('An owned active account is required');
  const at = new Date(nowMs).toISOString(), profit = parseProfitLimit(account.daily_profit_limit_pct);
  await store.prepare(`INSERT OR IGNORE INTO guardrail_day_caps
    (user_id,account_id,rule_date,max_trades_day,selected_at,daily_profit_limit_pct,profit_selected_at) VALUES (?,?,?,?,?,?,?)`)
    .run(userId, account.id, date, configuredCap(account), at, profit, at);
  // A legacy row froze its trade cap before the optional profit field existed.
  // Select that NEW policy exactly once now, not a fabricated past selection.
  await store.prepare(`UPDATE guardrail_day_caps SET daily_profit_limit_pct=?,profit_selected_at=?
    WHERE user_id=? AND account_id=? AND rule_date=? AND profit_selected_at IS NULL`).run(profit,at,userId,account.id,date);
  const row = await store.prepare('SELECT * FROM guardrail_day_caps WHERE user_id=? AND account_id=? AND rule_date=?').get(userId, account.id, date);
  if (!Number.isFinite(msOf(row.profit_selected_at)) || dayKey(msOf(row.profit_selected_at))!==date)
    throw new Error('Stored profit policy selection is invalid');
  return { max_trades_day: parseCap(row.max_trades_day), selected_at: row.selected_at,
    daily_profit_limit_pct:parseProfitLimit(row.daily_profit_limit_pct),profit_selected_at:row.profit_selected_at,
    rule_date: date, timezone: 'UTC' };
}
const DAY_STOP_RULES = new Set(['max_trades_day','consecutive_losses','daily_loss_limit','daily_profit_limit']);
/** Durable observations, NOT reconstructed historical admissions. The count is
 * a monotonic floor: observed journal entries plus subsequent server admissions.
 * Day stops latch until UTC rollover. Time stops retain the observed loss clock,
 * but still expire at their exact cooldown/candle boundaries. */
async function retainedState(store,userId,accountId,nowMs) {
  const date = dayKey(nowMs);
  const row = await store.prepare('SELECT * FROM guardrail_day_state WHERE user_id=? AND account_id=? AND rule_date=?').get(userId,accountId,date);
  const loss = await store.prepare(`SELECT last_loss_at,last_loss_trade_id FROM guardrail_day_state
    WHERE user_id=? AND account_id=? AND last_loss_at<=? AND last_loss_at IS NOT NULL
    ORDER BY last_loss_at DESC LIMIT 1`).get(userId,accountId,new Date(nowMs).toISOString());
  const stops = row ? JSON.parse(row.stops_json) : {};
  if (!stops || typeof stops!=='object' || Array.isArray(stops)
      || Object.entries(stops).some(([key,b])=>!DAY_STOP_RULES.has(key) || b?.rule!==key)
      || (row && (!Number.isInteger(row.entries_count) || row.entries_count<0)))
    throw new Error('Stored mechanical rule state is invalid');
  return {entries_count:row?.entries_count || 0,stops,...loss};
}
async function retainState(store,userId,daily) {
  if (!daily.today || daily.status==='unknown') return;
  const scope = [userId,daily.account_id,daily.date];
  await store.prepare(`INSERT INTO guardrail_day_state
    (user_id,account_id,rule_date,entries_count,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id,account_id,rule_date) DO UPDATE SET
      entries_count=MAX(guardrail_day_state.entries_count,excluded.entries_count),updated_at=excluded.updated_at`)
    .run(...scope,daily.today.trades,daily.evaluated_at);
  for (const b of daily.breaches.filter(b=>DAY_STOP_RULES.has(b.rule))) {
    // Add individual keys atomically: overlapping polling cannot erase an
    // earlier stop or rewrite its original observation with later corrected P&L.
    const key = '$.'+b.rule;
    await store.prepare(`UPDATE guardrail_day_state SET stops_json=json_set(stops_json,?,json(?))
      WHERE user_id=? AND account_id=? AND rule_date=? AND json_type(stops_json,?) IS NULL`)
      .run(key,JSON.stringify({...b,latched_at:daily.evaluated_at}),...scope,key);
  }
  const at = msOf(daily.post_loss?.last_loss_at);
  if (Number.isFinite(at)) {
    const iso = new Date(at).toISOString();
    await store.prepare(`UPDATE guardrail_day_state SET last_loss_at=?,last_loss_trade_id=?
      WHERE user_id=? AND account_id=? AND rule_date=? AND (last_loss_at IS NULL OR last_loss_at<?)`)
      .run(iso,daily.post_loss.last_loss_trade_id,...scope,iso);
  }
}
async function retainAdmission(store,userId,daily,options,result) {
  // A saved/copied research plan is not an executed position. All entry paths,
  // including reopen, consume exactly one durable admission in this transaction.
  if (options.entityType!=='trade') return;
  const id = options.entityId || result?.id;
  if (!Number.isInteger(Number(id)) || Number(id)<=0) throw new Error('Missing admitted trade identity');
  const trade = await store.prepare('SELECT status,opened_at FROM trades WHERE id=? AND user_id=? AND account_id=?').get(id,userId,daily.account_id);
  if (trade?.status!=='open' || trade.opened_at!==daily.evaluated_at) throw new Error('Entry write did not create the admitted action');
  await store.prepare(`INSERT INTO guardrail_entry_admissions
    (user_id,account_id,rule_date,admitted_at,action,trade_id,admission_state,snapshot)
    VALUES (?,?,?,?,?,?,?,?)`).run(userId,daily.account_id,daily.date,daily.evaluated_at,
      options.action || 'entry',id,daily.admission.state,JSON.stringify(daily));
  // Commit the immutable first-entry routine observation with this actual entry,
  // never with blocked attempts/research plans/record-only historical imports.
  await require('../routine').observeAdmission(store,userId,daily,id);
  const changed = await store.prepare(`UPDATE guardrail_day_state SET entries_count=entries_count+1,updated_at=?
    WHERE user_id=? AND account_id=? AND rule_date=?`).run(daily.evaluated_at,userId,daily.account_id,daily.date);
  if (changed.changes!==1) throw new Error('Missing durable rule day');
}
function unavailable({ accountId = null, nowMs = Date.now(), message } = {}) {
  return { date: dayKey(nowMs), timezone: 'UTC', evaluated_at: new Date(nowMs).toISOString(), account_id: accountId,
    status: 'unknown', breaches: [], remaining_trades: null, guardrails: null, today: null,
    message: message || 'Personal guardrails could not be verified. No new entry permission; retry or repair the account/history.',
    permission: { allowed: false, can_override: false, state: 'unavailable' } };
}
const isBlocked = daily => !!daily && (daily.status === 'stop' || daily.status === 'unknown' || daily.permission?.allowed === false);
/** Pure, inspectable state. Percentage loss/profit limits are anchored to day-start
 * realised journal equity, not floating P&L or a shrinking intraday balance.
 * Opening a position counts as an attempt. P&L/streak use the CLOSE day, so
 * overnight positions do not disappear from a realised loss/profit stop.
 */
function evaluate({ account, guardrails, rows = [], nowMs = Date.now(), entryTf = null, forEntry = false, retained = {} }) {
  const date = dayKey(nowMs), start = Date.parse(date+'T00:00:00Z'), g = guardrails;
  if (!account?.id || account.archived || !g || !Number.isFinite(Number(g.max_trades_day))
      || !(Number(g.daily_loss_limit_pct) > 0) || !(Number(g.max_consecutive_losses) > 0)
      || !(Number(g.cooldown_min) >= 10)) return unavailable({accountId: account?.id, nowMs});
  let profitPct;
  try { profitPct=parseProfitLimit(g.daily_profit_limit_pct); }
  catch { return unavailable({accountId:account.id,nowMs,message:'The optional daily profit policy could not be verified.'}); }
  // The loader scopes SQL too; keep the pure boundary scoped for other callers.
  const scoped = rows.filter(t => Number(t.account_id) === Number(account.id) && Number(t.user_id) === Number(account.user_id));
  const openedToday = scoped.filter(t => msOf(t.opened_at) >= start && msOf(t.opened_at) <= nowMs);
  const entries = Math.max(openedToday.length,number(retained.entries_count));
  const closed = scoped.filter(t => t.status === 'closed');
  const timed = closed.filter(t => Number.isFinite(msOf(t.closed_at)) && msOf(t.closed_at) <= nowMs);
  const todayClosed = timed.filter(t => msOf(t.closed_at) >= start).sort((a,b) => msOf(b.closed_at)-msOf(a.closed_at) || number(b.id)-number(a.id));
  const ambiguous = closed.filter(t => !Number.isFinite(msOf(t.closed_at)) && msOf(t.opened_at) >= start && msOf(t.opened_at) <= nowMs);
  if (ambiguous.length) return unavailable({accountId: account.id, nowMs,
    message: 'A closed trade from today has no valid close timestamp. Record its actual close time before requesting new entry permission.'});
  // With the new optional policy ON, an undated close cannot safely be assumed
  // historical, including overnight entries; a missing net result isn't zero.
  // OFF preserves the legacy loss/date behavior rather than inventing a ceiling.
  const knownNet = t => t.net_pnl!==null && t.net_pnl!==undefined && t.net_pnl!=='' && Number.isFinite(Number(t.net_pnl));
  if (profitPct!==null && (closed.some(t=>!Number.isFinite(msOf(t.closed_at))) || timed.some(t=>!knownNet(t))))
    return unavailable({accountId:account.id,nowMs,message:'Complete the actual close timestamps and realised net P&L before requesting entry under a daily profit ceiling.'});
  const realisedExact = todayClosed.reduce((s,t)=>s+number(t.net_pnl),0);
  const realised = r2(realisedExact);
  const rSum = r2(todayClosed.reduce((s,t)=>s+number(t.r_multiple),0));
  const priorPnl = timed.filter(t=>msOf(t.closed_at)<start).reduce((s,t)=>s+number(t.net_pnl),0);
  const balance = r2(number(account.starting_balance)+priorPnl);
  const profitLimit = profitPct===null ? null : balance*profitPct/100;
  if (profitPct!==null && (!Number.isFinite(realisedExact) || !Number.isFinite(profitLimit) || !(profitLimit>0)))
    return unavailable({accountId:account.id,nowMs,message:'A positive finite daily profit amount and known realised P&L are required before new entry permission.'});
  if (!(balance > 0)) return unavailable({accountId: account.id, nowMs, message:'Day-start realised equity must be positive before new entry permission can be verified.'});
  let streak = 0;
  for (const t of todayClosed) { if (number(t.net_pnl) < 0) streak++; else break; }
  let lastLoss = timed.filter(t=>number(t.net_pnl)<0).sort((a,b)=>msOf(b.closed_at)-msOf(a.closed_at) || number(b.id)-number(a.id))[0] || null;
  const heldLossMs = msOf(retained.last_loss_at);
  if (Number.isFinite(heldLossMs) && heldLossMs<=nowMs && (!lastLoss || heldLossMs>msOf(lastLoss.closed_at)))
    lastLoss = {id:retained.last_loss_trade_id,closed_at:retained.last_loss_at};
  const lossMs = lastLoss ? msOf(lastLoss.closed_at) : null;
  const cooldownUntil = lastLoss ? lossMs + Number(g.cooldown_min)*60000 : null;
  const barMs = TF_MS[entryTf];
  // A loss at an exact bar boundary belongs to the bar that just closed.
  // Otherwise the next FULL bar is the forbidden next candle. This is a
  // deterministic time-boundary rule, not guessed OHLC or feed confirmation.
  const nextEnd = lastLoss && barMs ? Math.ceil(lossMs/barMs)*barMs+barMs : null;
  const tfRequired = !!lastLoss && !barMs && nowMs < lossMs+2*Math.max(...Object.values(TF_MS));
  if (forEntry && tfRequired) return unavailable({accountId: account.id, nowMs,
    message:'Record a supported entry timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d or 1wk) to verify the no-next-candle rule after a loss.'});
  const breaches = [];
  if (entries >= Number(g.max_trades_day)) breaches.push({rule:'max_trades_day',detail:`${entries} entries today — your preselected cap is ${g.max_trades_day}.`});
  if (streak >= Number(g.max_consecutive_losses)) breaches.push({rule:'consecutive_losses',detail:`${streak} consecutive closed losses today — stop for this rule day.`});
  const lossLimit = balance*Number(g.daily_loss_limit_pct)/100;
  if (realised <= -lossLimit) breaches.push({rule:'daily_loss_limit',detail:`Realised loss $${r2(-realised)} has reached the ${g.daily_loss_limit_pct}% day-start equity limit ($${r2(lossLimit)}).`});
  // Compare unrounded amounts: display rounding must not trip a ceiling early.
  if (profitLimit!==null && realisedExact>=profitLimit) breaches.push({rule:'daily_profit_limit',
    detail:`Realised profit $${realisedExact} has reached your optional ${profitPct}% day-start equity ceiling ($${profitLimit}) — stop for this rule day.`,
    realised_amount:realisedExact,limit_pct:profitPct,limit_amount:profitLimit});
  if (cooldownUntil !== null && nowMs < cooldownUntil) breaches.push({rule:'post_loss_cooldown',detail:`After a loss, no new entry until ${new Date(cooldownUntil).toISOString()} (${g.cooldown_min}-minute cooldown).`,until:new Date(cooldownUntil).toISOString()});
  if (nextEnd !== null && nowMs < nextEnd) breaches.push({rule:'no_next_candle',detail:`Do not enter the very next ${entryTf} candle after the loss; wait until ${new Date(nextEnd).toISOString()}.`,until:new Date(nextEnd).toISOString()});
  for (const b of Object.values(retained.stops || {})) if (!breaches.some(current=>current.rule===b.rule))
    breaches.push({...b,retained:true,detail:`Previously hit today: ${b.detail} The rule-day stop remains after journal correction; only a fresh reasoned action override can proceed.`});
  const status = breaches.length ? 'stop' : entries >= Number(g.max_trades_day)-1 ? 'caution' : 'clear';
  return {date,timezone:'UTC',evaluated_at:new Date(nowMs).toISOString(),account_id:account.id,guardrails:g,
    today:{trades:entries,closed:todayClosed.length,realised,r_sum:rSum,avg_r:todayClosed.length?r2(rSum/todayClosed.length):0,loss_streak:streak,balance,loss_limit:r2(lossLimit),balance_basis:'day-start realised journal equity'},
    profit_stop:{enabled:profitPct!==null,limit_pct:profitPct,limit_amount:profitLimit,realised_amount:realisedExact,selected_at:g.trade_cap_policy?.profit_selected_at || null,balance_basis:'day-start realised journal equity',timezone:'UTC'},
    persistence:{entry_count_basis:'monotonic observed journal entries plus server admissions, not inferred historical permission',journal_entries:openedToday.length,retained_stops:Object.keys(retained.stops || {})},
    breaches,status,remaining_trades:Math.max(0,Number(g.max_trades_day)-entries),
    post_loss:{last_loss_trade_id:lastLoss?.id || null,last_loss_at:lastLoss?.closed_at || null,entry_tf:entryTf,entry_tf_required:tfRequired,
      cooldown_until:cooldownUntil===null?null:new Date(cooldownUntil).toISOString(),next_candle_until:nextEnd===null?null:new Date(nextEnd).toISOString()},
    message:breaches.length ? 'Stand down: '+breaches.map(b=>b.detail).join(' ') : `No personal stop. ${Math.max(0,Number(g.max_trades_day)-entries)} entries remain under the preselected ${g.max_trades_day}-entry cap. This is not market/setup approval.`,
    permission:{allowed:!breaches.length,can_override:!!breaches.length,state:breaches.length?'stopped':'clear'}};
}
/** Preserve all market geometry and grades. The original market eligibility is
 * visible; the outer permission is what actionable consumers must obey.
 */
function applyToSetups(setups, daily) {
  if (!daily) return setups;
  const permission = { ...daily.permission, account_id:daily.account_id, evaluated_at:daily.evaluated_at, message:daily.message, breaches:daily.breaches };
  if (!isBlocked(daily)) return {...setups, execution_permission:permission};
  const candidates = (setups.candidates || []).map(c=>({...c,market_ok:c.market_ok === undefined ? c.ok : c.market_ok,ok:false,
    personal_blocked:true,market_action:c.market_action || c.action,action:'NO TRADE — '+daily.message,no_trade:[...(c.no_trade || []), 'Personal guardrail: '+daily.message]}));
  return {...setups,candidates,execution_permission:permission,verdict:{...setups.verdict,
    market_action:setups.verdict.market_action || setups.verdict.action,action:'NO TRADE',dir:0,personal_blocked:true,headline:daily.message}};
}
/** Persist only actually observed stops, deduplicated without the observation
 * clock so polling doesn't manufacture a new violation every second. */
async function observe(store,userId,daily) {
  if (daily.status !== 'stop') return;
  const crypto = require('crypto');
  const key = crypto.createHash('sha256').update(JSON.stringify([userId,daily.account_id,daily.date,daily.breaches,daily.today])).digest('hex');
  await logEvent(store,userId,daily,{kind:'breach',action:'state_observed',dedupeKey:key});
}
function snapshotFields(daily,state = 'admitted') {
  return {entry_permission:daily.admission?.state || state,override_reason:daily.admission?.override_reason || null,guardrail_snapshot:JSON.stringify({...daily,
    capture_basis:state==='record_only' ? 'recording-time state, not an inferred historic entry violation' : 'fresh server admission state, valid only for this recorded action'})};
}
async function logEvent(store,userId,daily,{kind,action,entityType=null,entityId=null,reason=null,dedupeKey=null}) {
  await store.prepare(`INSERT OR IGNORE INTO guardrail_events
    (user_id,account_id,rule_date,observed_at,kind,action,entity_type,entity_id,reason,snapshot,dedupe_key) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId,daily.account_id || null,daily.date,daily.evaluated_at,kind,action,entityType,entityId,reason,JSON.stringify(daily),dedupeKey);
}
async function eventsForDay(store,userId,date,accountId = null) {
  const rows = accountId == null
    ? await store.prepare('SELECT * FROM guardrail_events WHERE user_id=? AND rule_date=? ORDER BY id').all(userId,date)
    : await store.prepare('SELECT * FROM guardrail_events WHERE user_id=? AND rule_date=? AND account_id=? ORDER BY id').all(userId,date,accountId);
  return rows.map(r=>{let snapshot;try{snapshot=JSON.parse(r.snapshot);}catch{snapshot={status:'invalid_record',breaches:[],message:'Stored snapshot could not be decoded; not inferred.'};}return {...r,snapshot};});
}
/** Journal/import writes are not entry permission. A recording-time snapshot
 * may be unknown and is explicitly labelled rather than banning honest history. */
async function record(userId,options,operation) {
  const {db} = require('../db');
  return db.tx(async transaction => {
    const store = db.transactionStore(transaction);
    const scopes = options.accountIds?.length ? [...new Set(options.accountIds)] : [options.accountId];
    const snapshots = [];
    for (const accountId of scopes) {
      try { snapshots.push(await require('./correction').dailyState(userId,{...options,accountId,store,forEntry:false})); }
      catch { snapshots.push(unavailable({accountId})); }
    }
    const out = await operation(store,snapshots[0]);
    for (const daily of snapshots) if (daily.status==='stop' || daily.status==='unknown')
      await logEvent(store,userId,daily,{kind:'journal_record',action:options.action || 'record_only',entityType:options.entityType || null,entityId:options.entityId || out?.id || null});
    // Permission read failures do not ban honest recording. Write/audit failures
    // still roll back atomically: no silently unlogged record or false permit.
    for (const accountId of scopes) {
      try { await require('./correction').dailyState(userId,{...options,accountId,store,forEntry:false}); }
      catch { await logEvent(store,userId,unavailable({accountId}),{kind:'journal_record',action:'post_record_state_unavailable',entityType:options.entityType || null,entityId:options.entityId || out?.id || null}); }
    }
    return out;
  });
}

/** Only explicit, local input validation may escape the fail-closed boundary.
 * An arbitrary driver/provider Error carrying a 4xx status is NOT trusted. */
class AdmissionInputError extends Error {
  constructor(message) { super(message); this.status=400; this.code='guardrail_input_invalid'; }
}
function inputError(message) { return new AdmissionInputError(message); }
function overrideReason(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 2000) {
    const e = new Error('Override reason must be plain text, at most 2000 characters.');
    e.status=400;e.code='guardrail_reason_invalid';throw e;
  }
  return value.trim() || null;
}
function actionPermission(daily) {
  return {...(daily.admission || daily.permission),account_id:daily.account_id,evaluated_at:daily.evaluated_at,
    scope:'personal rules for this recorded action only, not broker execution or future permission'};
}

function admissionError(daily) {
  const e = new Error(daily.message); e.status = daily.status === 'unknown' ? 503 : 409;
  e.code = daily.status === 'unknown' ? 'guardrail_unavailable' : 'guardrail_stop'; e.daily = daily; return e;
}
/** Server recheck + insert share one libSQL WRITE transaction. A rendered read
 * or saved plan is never a reusable permit. No client breach/status is trusted.
 */
async function admit(userId, options, operation) {
  const {db} = require('../db');
  const reason = overrideReason(options.overrideReason);
  let out;
  try {
    out = await db.tx(async transaction => {
      const store = db.transactionStore(transaction);
      let daily;
      try { daily = await require('./correction').dailyState(userId,{...options,store,forEntry:true}); }
      catch { daily = unavailable({accountId:options.accountId}); }
      const overridden = daily.status==='stop' && daily.permission?.can_override===true && !!reason;
      if (isBlocked(daily) && !overridden) {
        if (daily.status==='stop') await logEvent(store,userId,daily,{kind:'blocked_attempt',action:options.action || 'entry',entityType:options.entityType || null,entityId:options.entityId || null});
        return {rejected:daily}; // commit the audit WITHOUT a trade/signal write
      }
      daily.admission = {allowed:true,can_override:false,state:overridden?'overridden':'admitted',
        override_reason:overridden?reason:null,action:options.action || 'entry'};
      const result = await operation(store,daily);
      if (result?.saved===0) return {result}; // no action: no false override/admission event
      await retainAdmission(store,userId,daily,options,result);
      if (overridden) {
        const ids = options.entityId ? [options.entityId] : result?.ids || (result?.id ? [result.id] : []);
        await logEvent(store,userId,{...daily,admission:{...daily.admission,entity_ids:ids}},
          {kind:'override',action:options.action || 'entry',entityType:options.entityType || null,entityId:ids[0] || null,reason});
      }
      await require('./correction').dailyState(userId,{...options,store,forEntry:false});
      return {result};
    });
  } catch (e) {
    if (e instanceof AdmissionInputError) throw e;
    throw admissionError(unavailable({accountId:options.accountId}));
  }
  if (out.rejected) throw admissionError(out.rejected);
  return out.result;
}
module.exports = { parseProfitLimit, inputError, retainedState, retainState, DEFAULT_CAP, parseCap, configuredCap, dailyCap, dayKey, TF_MS, msOf,
  evaluate, unavailable, isBlocked, applyToSetups, admissionError, admit, observe, snapshotFields, logEvent, eventsForDay, record, overrideReason, actionPermission };
