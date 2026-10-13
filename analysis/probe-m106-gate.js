#!/usr/bin/env node
'use strict';
/** M106 decision-surface probe: the four-question refusal must reach analyse, Now,
 * chart and scan exactly like the killzone/personal veto, while an account that never
 * answered is reported and NOT blocked. Real bots engine, real guardrails, real SQL;
 * candle IO and the ordinary CRT report are the declared fixture seams used by the
 * other consumer probes. */
const path = require('path'), os = require('os');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
const RealDate = Date, NOW = Date.UTC(2026, 9, 13, 12);
global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } };
for (const k of ['TURSO_DATABASE_URL', 'LIBSQL_URL', 'TURSO_AUTH_TOKEN']) process.env[k] = '';
process.env.TRADEJOURNAL_DB = path.join(os.tmpdir(), `m106-gate-${process.pid}.db`);
const D = require(path.join(APP, 'src/db')), B = require(path.join(APP, 'src/bots')), Mom = B.momentum, TD = Mom.topdown, SU = B.setup, SMC = B.smc,
  P = require(path.join(APP, 'src/bots/protected')), G = require(path.join(APP, 'src/state-gate')), H = require('./m106-test-support');
const F = require('./helpers/entry-preference-fixture'), rawSetup = SU.buildSetups, rawTD = TD.build;
let pass = 0, fail = 0, current;
const results = [], ok = (label, v, detail) => { results.push({ label, passed: !!v, ...(!v ? { detail } : {}) }); console.log(`${v ? 'ok' : 'FAIL'} ${label}${!v ? ' ' + JSON.stringify(detail) : ''}`); v ? pass++ : fail++; };
function fresh(dir, model) { const f = F.named(P, dir, model, true); for (const s of [f.input.series, f.input.biasSeries, f.input.triggerSeries]) s.smc.sessions = SMC.sessionState(new Date(f.END)); const c = rawSetup(f.input.series.smc, { price: f.input.series.price, atr: 1, bias: f.htfDir, balance: 10000, riskPct: .5, entrySeries: f.input.series, observedAt: f.END, useBreakers: model === 'flip', topdown: rawTD(f.input) }).candidates.find((c) => c.dir === dir); const target = c.levels.entry + dir * Math.abs(c.levels.entry - c.levels.stop) * 1.5; f.input.triggerSeries.smc.order_blocks.push({ dir: -dir, bottom: dir > 0 ? target : target - .1, top: dir > 0 ? target + .1 : target, strength: 1, breached: false, mitigated: false, t: f.END - 300000 }); return f; }
const yes = { calm: true, clear: true, following_plan: true, would_take_if_up_big: true };
async function answer(accountId, answers, ageMinutes = 0) {
  const at = new Date(NOW - ageMinutes * 60000).toISOString();
  const next = ((await D.db.prepare('SELECT MAX(version) v FROM state_gate_answers WHERE account_id=?').get(accountId)).v || 0) + 1;
  await D.db.prepare('INSERT INTO state_gate_answers(user_id,account_id,account_key,version,answers_json,source,recorded_at,schema_version) SELECT user_id,id,id,?,?,?,?,? FROM accounts WHERE id=?')
    .run(next, answers === null ? null : JSON.stringify(answers), 'human_declared', at, G.VERSION, accountId);
}
const shape = (a, key) => JSON.stringify(a.now?.[key] ?? a.setups?.verdict?.[key] ?? null);

(async () => {
  try {
    await D.ready;
    const u = await D.createUser({ email: `m106-gate-${process.pid}@test.local`, name: 'Gate', password: 'test-only' });
    const other = await D.createUser({ email: `m106-gate-other-${process.pid}@test.local`, name: 'Other', password: 'test-only' });
    await H.prepare(u, 20); await H.prepare(other, 20);
    require(path.join(APP, 'src/market')).getCalendar = async () => ({ events: [] });
    const load = async (s, tf) => ({ '4h': current.input.biasSeries, '15m': current.input.series, '5m': current.input.triggerSeries }[tf]);
    const rawAnalyse = Mom.analyse; TD.build = (a) => F.asOrdinaryCRT(rawTD({ ...a, opts: { ...a.opts, observedAt: current.END } }), current);
    Mom.analyse = (s, tf, o) => rawAnalyse(s, tf, { ...o, nowMs: current.END, seriesLoader: load }); Mom.series = load; require(path.join(APP, 'src/candles')).getCandles = load;

    for (const model of ['market_shift', 'flip']) for (const dir of [-1, 1]) {
      current = fresh(dir, model); current.dir = dir; await D.clearBiasState('TEST', '15m');
      const account = await D.db.prepare("SELECT id FROM accounts WHERE user_id=? ORDER BY id LIMIT 1").get(u.userId);
      const accountId = account.id;
      await D.db.prepare('DELETE FROM state_gate_answers WHERE account_id=?').run(accountId);
      const opts = { userId: u.userId, accountId, minRR: 1, useBreakers: model === 'flip', nowMs: current.END, includePrediction: false };
      const cdir = (a) => a.setups.candidates.find((c) => c.dir === dir);
      const clean = await B.analyse('TEST', '15m', opts), cc = cdir(clean);
      ok(`${dir}/${model}: positive control — a clear personal state arms the plan`, cc.ok && clean.now.armed && !!clean.now.order, { ok: cc.ok, action: clean.now.action });
      ok(`${dir}/${model}: control reports the gate as not adopted, never as a pass`, clean.daily.state_gate.state === 'not_adopted' && clean.daily.state_gate.allowed === false, clean.daily.state_gate.state);

      await answer(accountId, yes);
      const passed = await B.analyse('TEST', '15m', opts), pc = cdir(passed);
      ok(`${dir}/${model}: fresh all-yes answers keep the plan armed and are labelled self-reported`, pc.ok && passed.now.armed && passed.daily.state_gate.state === 'passed' && passed.daily.state_gate.allowed && passed.daily.state_gate.broker_verified === false, passed.daily.state_gate.state);
      ok(`${dir}/${model}: a pass does not change one byte of geometry, grade, score, risk or action`, JSON.stringify(pc.levels) === JSON.stringify(cc.levels) && pc.grade === cc.grade && pc.score === cc.score && JSON.stringify(pc.risk) === JSON.stringify(cc.risk) && passed.now.action === clean.now.action, { action: passed.now.action });

      await answer(accountId, { ...yes, calm: false });
      const failed = await B.analyse('TEST', '15m', opts), fc = cdir(failed);
      ok(`${dir}/${model}: a recorded no refuses the signal like the killzone veto`, !fc.ok && fc.no_trade.some((t) => /State gate/i.test(t)), fc.no_trade);
      ok(`${dir}/${model}: Now unarms the order and carries a blocking guard`, failed.now.action === 'NO TRADE' && !failed.now.armed && !failed.now.order && failed.now.guards.some((g) => g.level === 'block'), failed.now.action);
      ok(`${dir}/${model}: the method/headline verdict also refuses`, failed.setups.verdict.action === 'NO TRADE' && failed.headline.action === 'NO TRADE', failed.headline.action);
      ok(`${dir}/${model}: technical eligibility is retained and the refusal is explicit`, fc.market_ok === true && fc.personal_blocked === true);
      ok(`${dir}/${model}: the failed gate names the trader's own no and never claims mental-state knowledge`, failed.daily.state_gate.failed_questions.join(',') === 'calm' && /you do not trade yet/i.test(failed.daily.message) && /not verified calmness/.test(G.BASIS));
      ok(`${dir}/${model}: the refusal does not rewrite market geometry`, JSON.stringify(fc.levels) === JSON.stringify(cc.levels) && fc.score === cc.score && fc.grade === cc.grade);
      const chart = await B.chart('TEST', '15m', { ...opts, bars: 200 }), scan = await B.scan(['TEST'], '15m', opts);
      ok(`${dir}/${model}: chart drops the actionable plan at a failed gate`, !chart.now.armed && !chart.plan && !chart.order, chart.now.action);
      ok(`${dir}/${model}: scan reports NO TRADE with the gate permission denied`, scan.rows[0]?.action === 'NO TRADE' && scan.rows[0]?.execution_permission?.allowed === false, scan.rows[0]?.action);
      let refusal = null; try { await B.saveSignals(u.userId, failed, { accountId }); } catch (e) { refusal = e; }
      ok(`${dir}/${model}: saving a signal is refused with the gate's own code and nothing personal-overridable`, refusal && refusal.code === 'state_gate_failed' && refusal.status === 409 && refusal.state_gate?.state === 'failed', refusal && { code: refusal.code, state: refusal.state_gate?.state });
      let planRefusal = null; try { await B.savePlan(u.userId, { symbol: 'TEST', timeframe: '15m', entry: 1, stop: .9, targets: [1.5], account_id: accountId }); } catch (e) { planRefusal = e; }
      ok(`${dir}/${model}: saving a plan is refused for the same recorded no`, planRefusal && planRefusal.code === 'state_gate_failed', planRefusal && planRefusal.code);
      ok(`${dir}/${model}: a failed gate writes no signal row`, Number((await D.db.prepare('SELECT COUNT(*) n FROM bot_signals WHERE user_id=?').get(u.userId)).n) === 0);
      let implicit = null; try { await B.saveSignals(u.userId, failed); } catch (e) { implicit = e; }
      ok(`${dir}/${model}: omitting account_id is not a way to skip the adopted gate`, implicit && implicit.code === 'state_gate_failed', implicit && implicit.code);
      let implicitPlan = null; try { await B.savePlan(u.userId, { symbol: 'TEST', timeframe: '15m', entry: 1, stop: .9, targets: [1.5] }); } catch (e) { implicitPlan = e; }
      ok(`${dir}/${model}: the plan path resolves the trader’s own desk and refuses the same no`, implicitPlan && implicitPlan.code === 'state_gate_failed', implicitPlan && implicitPlan.code);
      ok(`${dir}/${model}: the two implicit refusals still wrote no signal row`, Number((await D.db.prepare('SELECT COUNT(*) n FROM bot_signals WHERE user_id=?').get(u.userId)).n) === 0);

      const researchSave = await B.saveSignals(u.userId, { ...failed, daily: null }, { accountId, research_only: true });
      ok(`${dir}/${model}: an explicit research-only save stays a labelled research artifact, not a state-gate bypass claim`, researchSave.permission?.state === 'research_only' && researchSave.permission?.allowed === false && Number((await D.db.prepare("SELECT COUNT(*) n FROM bot_signals WHERE user_id=? AND entry_permission='research_only'").get(u.userId)).n) === 1, researchSave.permission);
      await D.db.prepare('DELETE FROM bot_signals WHERE user_id=?').run(u.userId);
      const deterministic = await B.analyse('TEST', '15m', opts);
      ok(`${dir}/${model}: equal answers yield the identical decision payload`, JSON.stringify({ v: deterministic.setups.verdict, g: deterministic.now.guards, s: deterministic.daily.state_gate }) === JSON.stringify({ v: failed.setups.verdict, g: failed.now.guards, s: failed.daily.state_gate }));

      const second = await D.db.prepare("INSERT INTO accounts(user_id,name,starting_balance,current_balance,risk_per_trade_pct,max_trades_day) VALUES (?,'Second owned account',10000,10000,.5,20)").run(u.userId);
      await H.prepare({ ...u, accountId: second.lastInsertRowid }, 20);
      const independent = await B.analyse('TEST', '15m', { ...opts, accountId: second.lastInsertRowid });
      ok(`${dir}/${model}: an account with no answers is not blocked by another account's recorded no`, cdir(independent).ok && independent.daily.state_gate.state === 'not_adopted', independent.daily.state_gate.state);

      await answer(accountId, { ...yes, clear: false }, 180);
      const stale = await B.analyse('TEST', '15m', opts);
      ok(`${dir}/${model}: answers outside the APP window refuse rather than pass`, stale.daily.state_gate.state === 'stale' && !cdir(stale).ok && stale.now.action === 'NO TRADE' && /not currently passed \(stale\)/.test(stale.daily.message), stale.daily.state_gate.state);
      await answer(accountId, null);
      const unknown = await B.analyse('TEST', '15m', opts);
      ok(`${dir}/${model}: an adopted account with no check refuses without pretending a failure`, unknown.daily.state_gate.state === 'unanswered' && !cdir(unknown).ok && unknown.daily.state_gate.adopted === true, unknown.daily.state_gate.state);
      ok(`${dir}/${model}: the unavailable/stale/unknown refusals are never presented as permission`, !unknown.now.armed && unknown.now.execution_permission.allowed === false && unknown.now.execution_permission.state === 'state_gate', unknown.now.execution_permission?.state);

      const research = await B.analyse('TEST', '15m', { ...opts, userId: null, accountId: null, balance: 10000, riskPct: .5 });
      ok(`${dir}/${model}: unsized research keeps market context and carries no personal gate claim`, cdir(research).ok && !research.daily && !research.now.execution_permission, research.now.action);
      const unrelated = await B.analyse('TEST', '15m', { ...opts, userId: other.userId, accountId: other.accountId });
      ok(`${dir}/${model}: another owner's account is unaffected by this account's state`, cdir(unrelated).ok && unrelated.daily.state_gate.state === 'not_adopted', unrelated.daily.state_gate?.state);
    }
  } catch (e) { fail++; results.push({ label: 'uncaught', passed: false, detail: e.message }); console.error(e.stack); }
  finally {
    if (process.env.M106_RESULT) require('fs').writeFileSync(process.env.M106_RESULT, JSON.stringify({ app: APP, pass, fail, results, scope: 'M106 actual bots decision surface on the declared candle/fixture seam; not broker/live-market/pixel proof and not a claim about the trader\'s mind' }, null, 2) + '\n');
    console.log(`M106 four-question gate in the bots decision surface: ${pass} passed, ${fail} failed`);
    for (const x of ['', '-wal', '-shm']) try { require('fs').unlinkSync(process.env.TRADEJOURNAL_DB + x); } catch {}
    process.exitCode = fail ? 1 : 0;
  }
})();
