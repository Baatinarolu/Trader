'use strict';
/** M86: retrospective HUMAN execution review, never a pre-entry checklist
 * grade/risk input. Unknown evidence is not a manufactured poor/good trade.
 * Outcome/excursions do not award points or prove stop violations. */
const crypto = require('crypto');
const VERSION = 'execution-v1';
const BASIS = 'self_reported_execution';
const SCORES = Object.freeze({1:20,2:40,3:60,4:75,5:95});
const number = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const stamp = v => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)) return null;
  const d = new Date(v), n = d.getTime();
  return Number.isFinite(n) && d.toISOString().replace('.000Z','Z') === v.replace('.000Z','Z') ? n : null;
};
// Binds HUMAN acknowledgement to relevant current record, never a persisted
// score. Truthful correction invalidates stale evidence without blocking CRUD.
const HASH_KEYS = ['id','user_id','account_id','symbol','direction','status','opened_at','closed_at','entry','exit','stop','target','size','fees','strategy_id','strategy_version','adherence','stop_moved','stop_honoured','stop_honoured_source','stop_honoured_recorded_at'];
function fingerprint(trade) { return crypto.createHash('sha256').update(JSON.stringify([VERSION,...HASH_KEYS.map(k=>[k,trade[k]??null])])).digest('hex'); }
function invalid(message,status=400) { const e=new Error(message);e.status=status;e.code='execution_review_invalid';return e; }
async function acknowledge(userId,id,body) {
  if(!Number.isSafeInteger(id)||id<=0)throw invalid('Trade not found',404);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['adherence','stop_honoured','record_revision'].includes(k))
    ||!Object.hasOwn(body,'adherence')||!Object.hasOwn(body,'stop_honoured'))throw invalid('Provide only adherence, stop_honoured and the displayed record_revision, including explicit unknown/null when appropriate.');
  if(typeof body.record_revision!=='string'||!/^[a-f0-9]{64}$/.test(body.record_revision))throw invalid('Read the saved record and supply its current displayed record_revision.');
  const a=body.adherence,flag=body.stop_honoured;
  if(a!==null && (!Number.isInteger(a)||a<1||a>5))throw invalid('Adherence must be a literal whole number1–5 or null.');
  if(flag!==null && typeof flag!=='boolean')throw invalid('Stop honour must be literal true/false/null.');
  const {db}=require('./db');
  return db.tx(async tx=>{const store=db.transactionStore(tx),row=await store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,userId);
    if(!row)throw invalid('Trade not found',404);
    if(body.record_revision!==fingerprint(row))throw invalid('The saved trade changed after display. Reopen its current record before reviewing execution.',409);
    const now=Date.now(),closed=stamp(row.closed_at);
    if(row.status!=='closed'||number(row.exit)===null||closed===null||closed>now)throw invalid('Record the actual close before this retrospective execution review.',409);
    if(flag!==null && (number(row.stop)===null||row.stop<=0))throw invalid('Record the actual planned stop before reporting whether it was honoured.');
    const at=new Date(now).toISOString(),fields={adherence:a,stop_honoured:flag===null?null:flag?1:0,stop_honoured_source:'self_reported',stop_honoured_recorded_at:at},hash=fingerprint({...row,...fields});
    await store.prepare("UPDATE trades SET adherence=?,stop_honoured=?,stop_honoured_source=?,stop_honoured_recorded_at=?,execution_review_hash=?,updated_at=datetime('now') WHERE id=? AND user_id=?")
      .run(a,fields.stop_honoured,fields.stop_honoured_source,at,hash,id,userId);
    return store.prepare('SELECT * FROM trades WHERE id=? AND user_id=?').get(id,userId);
  });
}
function outcome(trade) {
  const net = number(trade.net_pnl), r = number(trade.r_multiple);
  if (net === null || r !== null && Math.sign(net) !== Math.sign(r)) {
    return {state:'unknown',kind:null,net_pnl:net,r_multiple:r,basis:'unavailable_or_contradictory_realised_outcome'};
  }
  const v = net;
  return {state:'known',kind:v < 0 ? 'loss' : v > 0 ? 'win' : 'breakeven',net_pnl:net,r_multiple:r,basis:'recorded_realised_net_pnl'};
}
function review(trade, {nowMs=Date.now()}={}) {
  const reasons = ['Execution basis: self-reported journal evidence, not broker-verified adherence.'];
  const a = number(trade.adherence), validAdherence = Number.isInteger(a) && a >= 1 && a <= 5;
  const flag = trade.stop_honoured, validFlag = flag === 1 || flag === true || flag === 0 || flag === false;
  const recorded = stamp(trade.stop_honoured_recorded_at), close = stamp(trade.closed_at);
  const validClock = number(nowMs) !== null && close !== null && close <= nowMs;
  const stop = number(trade.stop);
  const completed = trade.status === 'closed' && number(trade.exit) !== null && validClock;
  // A partial CURRENT human acknowledgement can report an explicit violation,
  // but raw legacy/default/stale/corrupt ratings cannot manufacture that claim.
  const acknowledged = completed && (validAdherence || trade.adherence===null) && (validFlag || flag===null)
    && ['self_reported','imported_self_report'].includes(trade.stop_honoured_source)
    && recorded !== null && recorded <= nowMs && recorded >= close
    && typeof trade.execution_review_hash==='string' && trade.execution_review_hash===fingerprint(trade);
  const validStop = acknowledged && validFlag && stop !== null && stop > 0;
  const honoured = validStop ? flag === 1 || flag === true : null;
  const facts = completed ? outcome(trade) : {state:'unknown',kind:null,basis:'not_known_closed_outcome',net_pnl:null,r_multiple:null};
  reasons.push(validAdherence ? `Recorded rule adherence ${a}/5: ${acknowledged?'current acknowledged self-report':'not acknowledged for the current record; provisional only'}.` : 'Rule adherence unavailable/invalid: no rating is inferred from P&L.');
  reasons.push(validStop ? `Stop honour explicitly reported ${honoured ? 'yes' : 'no'} (${trade.stop_honoured_source}).`
    : 'Stop honour unreviewed/invalid: not inferred from movement, realised R, default zero or a legacy row.');
  const complete = completed && validAdherence && validStop;
  const violated = acknowledged && (validAdherence && a < 4 || validStop && !honoured);
  const quality = complete ? violated ? 'plan_violated' : 'plan_followed' : violated ? 'known_violation_in_incomplete_review' : 'unreviewed';
  let score = null, grade = 'Unreviewed', loss = 'unknown';
  if (complete) {
    score = honoured ? SCORES[a] : Math.min(SCORES[a],39);
    grade = score >= 80 ? 'A+' : score >= 68 ? 'A' : score >= 54 ? 'B' : score >= 40 ? 'C' : 'D';
    reasons.push(`Execution rubric ${VERSION}: adherence points ${SCORES[a]}${honoured ? '' : ', explicit stop violation caps score below C at39'}.`);
    if (facts.state === 'known') {
      loss = facts.kind === 'loss' ? violated ? 'bad_loss' : 'good_loss' : 'not_loss';
      if (loss === 'good_loss') reasons.push('Good loss by reported plan adherence and honoured stop — not by its size.');
      else if (loss === 'bad_loss') reasons.push('Bad loss by an explicit reported execution violation, not by red P&L alone.');
    }
  } else reasons.push('Execution grade withheld until an actual closed journal and complete valid self-review exist.');
  reasons.push('Realised P&L/R, planned R:R, session and MAE/MFE award no execution points; no sizing or permission effect.');
  return {state:complete ? 'reviewed' : 'unreviewed',grade,score,reasons,basis:BASIS,rubric_version:VERSION,
    execution_quality:quality,loss_quality:loss,outcome:facts,evidence:{adherence:acknowledged&&validAdherence?a:null,stop_honoured:honoured,
      stop_honoured_source:validStop?trade.stop_honoured_source:null,stop_honoured_recorded_at:validStop?trade.stop_honoured_recorded_at:null},
    retrospective:true,broker_verified:false,entry_setup_grade:trade.setup_grade || null,record_revision:fingerprint(trade)};
}
function distribution(trades) {
  const groups=new Map();
  for(const trade of trades) {
    const g=review(trade),key=g.grade;
    if(!groups.has(key))groups.set(key,{grade:key,trades:0,reviewed:0,known_outcomes:0,unavailable_outcomes:0,wins:0,net_sum:0,r_sum:0,r_count:0});
    const row=groups.get(key);row.trades++;if(g.state==='reviewed')row.reviewed++;
    if(g.outcome.state==='known') {row.known_outcomes++;if(g.outcome.kind==='win')row.wins++;row.net_sum+=g.outcome.net_pnl;
      if(g.outcome.r_multiple!==null){row.r_count++;row.r_sum+=g.outcome.r_multiple;}
    } else row.unavailable_outcomes++;
  }
  const round=v=>Math.round(v*100)/100,order=['A+','A','B','C','D','Unreviewed'];
  return [...groups.values()].map(r=>({grade:r.grade,trades:r.trades,reviewed:r.reviewed,unreviewed:r.trades-r.reviewed,known_outcomes:r.known_outcomes,unavailable_outcomes:r.unavailable_outcomes,
    win_rate:r.known_outcomes?round(r.wins/r.known_outcomes*100):null,net:r.known_outcomes?round(r.net_sum):null,expectancy_r:r.r_count?round(r.r_sum/r.r_count):null,
    basis:BASIS,rubric_version:VERSION,descriptive_only:true})).sort((a,b)=>order.indexOf(a.grade)-order.indexOf(b.grade));
}
/** M92 relative retrospective execution extremes; ties kept, unknown unranked.
 * Money-only extrema/day totals are explicitly independent. No P&L tiebreak. */
function summary(trades,{accountId=null,date=null,timezone='recorded_closed_cohort',nowMs=Date.now()}={}) {
  const closed=trades.filter(t=>t.status==='closed'),ranked=[];
  for(const t of closed) {const g=review(t,{nowMs});if(g.state==='reviewed')ranked.push({trade_id:t.id,symbol:t.symbol,grade:g.grade,score:g.score,adherence:g.evidence.adherence,
    stop_honoured:g.evidence.stop_honoured,loss_quality:g.loss_quality,outcome:g.outcome,entry_setup_grade:g.entry_setup_grade,basis:BASIS});}
  const pick=max=>{if(!ranked.length)return null;const score=(max?Math.max:Math.min)(...ranked.map(r=>r.score)),ties=ranked.filter(r=>r.score===score).sort((a,b)=>a.trade_id-b.trade_id);
    return {score,grade:ties[0].grade,trade_ids:ties.map(r=>r.trade_id),tie_count:ties.length,trades:ties};};
  const observed=t=>{const c=stamp(t.closed_at);return c!==null&&c<=nowMs&&number(t.exit)!==null;};
  const money=closed.filter(t=>observed(t)&&number(t.net_pnl)!==null),rs=closed.filter(t=>observed(t)&&outcome(t).state==='known'&&number(t.r_multiple)!==null);
  const pnl=money.map(t=>t.net_pnl),net=pnl.reduce((a,b)=>a+b,0),unavailable=closed.length-money.length;
  return {state:!closed.length?'empty':ranked.length?'ranked':'unreviewed',closed:closed.length,ranked:ranked.length,unranked:closed.length-ranked.length,best:pick(true),worst:pick(false),
    account_id:accountId,date,timezone,basis:BASIS,rubric_version:VERSION,descriptive_only:true,broker_verified:false,
    note:'Relative best/worst among reviewed closed journals by self-reported execution only. Ties kept, unreviewed evidence unranked. No P&L tie-break or strategy/risk/causal claim. Entry setup grade is separate.',
    pnl:{basis:'realised_money_not_execution',known:money.length,unavailable,best:pnl.length?Math.max(...pnl):null,worst:pnl.length?Math.min(...pnl):null,
      realised_total:unavailable?null:net,known_partial_sum:money.length?net:null,recorded_total_r:rs.length===closed.length?rs.reduce((n,t)=>n+t.r_multiple,0):null}};
}
module.exports = {review,outcome,distribution,summary,acknowledge,fingerprint,HASH_KEYS,VERSION,BASIS,SCORES};
