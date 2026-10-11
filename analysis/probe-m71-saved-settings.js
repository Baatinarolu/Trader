#!/usr/bin/env node
'use strict';
/** Isolated saved-settings regression: actual auth/SQL/bot-route config reads
 * and actual Setup gates, with a declared ordinary SMC input at the analysis IO
 * boundary. Full analyse/chart/storage/browser consumers run in the other probe.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const APP = process.env.TJ_APP || path.join(__dirname, '../extracted/tradejournal');
for (const k of ['TURSO_DATABASE_URL', 'LIBSQL_URL', 'TURSO_AUTH_TOKEN']) process.env[k] = '';
const file = path.join(os.tmpdir(), `m71-settings-${process.pid}.db`); process.env.TRADEJOURNAL_DB = file;
const D = require(path.join(APP, 'src/db')), B = require(path.join(APP, 'src/bots')),
  SU = require(path.join(APP, 'src/bots/setup')), SMC = require(path.join(APP, 'src/bots/smc')),
  F = require('./helpers/primary-rr-fixture');
let pass = 0, fail = 0, server;
const ok = (label, v, d = '') => { console.log(` ${v ? 'ok  ' : 'FAIL'} ${label}${!v && d ? ' — ' + d : ''}`); v ? pass++ : fail++; };
(async () => { try {
  await D.ready;
  const user = await D.createUser({ email: `m71-settings-${process.pid}@test.local`, password: 'fixture-only', name: 'Settings' });
  const token = await D.createSession(user.userId);
  B.analyse = async (symbol, tf, opts) => {
    const f = F.ordinary(1, 1.5, opts.minRR, true); f.a.sessions = SMC.sessionState(new Date(F.CLOCK));
    return { received: { minRR: opts.minRR, sessionPref: opts.sessionPref },
      setups: SU.buildSetups(f.a, { ...f.ctx, symbol: 'EURUSD', sessionPref: opts.sessionPref }) };
  };
  const express = require(path.join(APP, 'node_modules/express')), app = express(); app.use(express.json());
  app.use('/api', require(path.join(APP, 'src/routes/api')));
  server = await new Promise(resolve => { const s = app.listen(0, '0.0.0.0', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/bots/analyse?symbol=EURUSD&tf=15m&prediction=0`;
  const save = settings => D.db.prepare('UPDATE users SET settings=? WHERE id=?').run(typeof settings === 'string' ? settings : JSON.stringify(settings), user.userId);
  async function read(label, query, floor, pref, allowed, tok = token) {
    const r = await fetch(base + query, { headers: { 'x-session': tok } }); const d = await r.json();
    const c = d.setups?.candidates.find(c => c.dir === 1);
    ok(label, r.status === 200 && d.received.minRR === floor && d.received.sessionPref === pref && c.ok === allowed,
      JSON.stringify({ status: r.status, received: d.received, ok: c?.ok, no_trade: c?.no_trade })); return d;
  }
  await save({}); await read('no settings: API default1R/no session restriction retained', '', 1, null, true);
  await save({ min_rr: 3 }); await read('persisted3R reaches the primary veto, not a caught ReferenceError/default1', '', 3, null, false);
  await read('positive query1R overrides persisted3R without rewriting it', '&min_rr=1', 1, null, true);
  await read('invalid query falls back to persisted3R', '&min_rr=bad', 3, null, false);
  await read('zero query falls back to persisted3R', '&min_rr=0', 3, null, false);
  await save({ min_rr: 20 }); await read('persisted floor is still clamped10R', '', 10, null, false);
  await save({ min_rr: .01 }); await read('persisted floor is still clamped0.1R', '', .1, null, true);
  await save({ min_rr: 1, session_pref: 'ny_am' });
  const ny = await read('M26 persisted NY window actually vetoes a London-only decision', '', 1, 'ny_am', false);
  ok('saved NY veto is explicitly the chosen-window gate, not an RR/grade artifact',
    ny.setups?.filters.session_pref?.key === 'ny_am' && ny.setups.filters.session_pref.blocked_now
      && ny.setups.candidates.find(c => c.dir === 1).no_trade.some(t => /window|killzone/i.test(t)));
  await read('explicit London query overrides saved NY preference and permits', '&session_pref=london', 1, 'london', true);
  await save({ min_rr: 1, session_pref: 'london' });
  await read('saved open London preference retains eligibility', '', 1, 'london', true);
  await read('explicit NY query overrides saved London and vetoes', '&session_pref=ny_am', 1, 'ny_am', false);
  const other = await D.createUser({ email: `m71-other-${process.pid}@test.local`, password: 'fixture-only', name: 'Other' });
  const otherToken = await D.createSession(other.userId);
  await save({ min_rr: 3, session_pref: 'ny_am' });
  await read('second authenticated user never inherits first user RR/window settings', '', 1, null, true, otherToken);
  await save('{broken json'); await read('malformed stored JSON follows documented1R/no-restriction fallback, not guessed settings', '', 1, null, true);
  const unauth = await fetch(base); ok('route still requires actual authentication', unauth.status === 401);
} catch(e) { fail++; console.error(e.stack); } finally {
  if (server) await new Promise(r => server.close(r)); try { await D.db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(file + suffix); } catch {} }
  if (process.env.M71_RESULT) fs.writeFileSync(process.env.M71_RESULT, JSON.stringify({ app: APP, pass, fail,
    scope: 'Isolated real auth/SQL/route configuration + real Setup gates at a declared analysis IO boundary.' }, null, 2) + '\n');
  console.log(`\nM71 saved settings: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
} })();
