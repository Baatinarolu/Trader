'use strict';
/**
 * TEST ONLY (M111): the same frozen-clock / synthetic-calendar harness the M110 probes use, with
 * its own counters, its own server handle and its own result file. `D`/`calendarSpec`/`snapshot`
 * come from m110-test-support so the two milestones measure the same app the same way; `start()`
 * is re-implemented here only so this file owns the listener it opens (the M110 support keeps its
 * own server private, and a probe must never leave one listening). Nothing here is shipped.
 *
 * M111 is a READ-SEMANTICS fix, so the harness's calendar shapes are the whole experiment:
 * `calendarSpec(null)` fails the feed (the outage path), `calendarSpec([])` is an empty feed and
 * `calendarSpec([...])` is a week with rows — and, as the probes measure, the first two are the
 * SAME shape once the app's own market layer has read them.
 */
const M110 = require('./m110-test-support');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, server = null; const results = [];
const ok = (label, v, detail) => { results.push({ label, passed: !!v, ...(!v ? { detail } : {}) }); console.log(`${v ? 'ok' : 'FAIL'} ${label}${!v ? ' ' + JSON.stringify(detail) : ''}`); v ? pass++ : fail++; };
/** The M111 feature gate: the module exists (M110) AND carries the state vocabulary (M111). */
const m111 = (N) => !!(N && N.STATES && N.STATES.UNKNOWN === 'unknown' && typeof N.stateOf === 'function' && typeof N.unknownNote === 'function');
const shipped = (N, what) => { ok(`this tree ships ${what} (the committed parent does not, and that absence is this probe's control)`, m111(N)); return m111(N); };
/** A signed-in workspace plus the app's own API surface, on a server this file can close. */
async function start(name) {
  await M110.D.ready;
  const user = await M110.D.createUser({ email: `${name}-${process.pid}@test.local`, name, password: 'test-only' });
  const other = await M110.D.createUser({ email: `other-${name}-${process.pid}@test.local`, name: 'Other', password: 'test-only' });
  const token = await M110.D.createSession(user.userId), otherToken = await M110.D.createSession(other.userId);
  const express = require(path.join(M110.APP, 'node_modules/express'));
  const app = express(); app.use(express.json({ limit: '25mb' })); app.use('/api', require(path.join(M110.APP, 'src/routes/api')));
  server = await new Promise((r) => { const s = app.listen(0, '0.0.0.0', () => r(s)); });
  const req = async (url, body, method = 'POST', auth = token) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api` + url, { method, headers: { 'content-type': 'application/json', ...(auth ? { 'x-session': auth } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data, headers: r.headers };
  };
  return { user, other, token, otherToken, req };
}
/** An account created through the API, so the two news settings go through the real parser. */
async function account(u, name = 'M111 desk', extra = {}) {
  const r = await u.req('/accounts', { name, starting_balance: 10000, ...extra });
  if (r.status !== 200) throw new Error('account create failed: ' + JSON.stringify(r.data));
  return u.req('/accounts', undefined, 'GET').then((d) => { const a = d.data.accounts.find((x) => x.name === name); a._res = r.data; return a; });
}
async function finish(name, fn) {
  try { await M110.D.ready; await fn(); }
  catch (e) { fail++; results.push({ label: 'uncaught', passed: false, detail: e.message }); console.error(e.stack); }
  finally {
    if (server) { await new Promise((r) => server.close(r)); server = null; }
    if (process.env.M111_RESULT) fs.writeFileSync(process.env.M111_RESULT, JSON.stringify({ app: M110.APP, pass, fail, results, scope: `${name}: actual runtime/auth/SQL/HTTP with a frozen UTC clock, a synthetic calendar fed through the app's own parser and a patched market module for the thrown-read path; M111 calendar-read states (blocked/clear/unknown), no provider/broker/pixel/human proof and no claim about what a release does to price` }, null, 2) + '\n');
    console.log(`${name}: ${pass} passed, ${fail} failed`);
    for (const x of ['', '-wal', '-shm']) try { fs.unlinkSync(process.env.TRADEJOURNAL_DB + x); } catch {}
    process.exitCode = fail ? 1 : 0;
  }
}
module.exports = {
  APP: M110.APP, D: M110.D, ok, shipped, m111, finish, start, account,
  snapshot: M110.snapshot, changed: M110.changed, now: M110.now, setNow: M110.setNow,
  calendarSpec: M110.calendarSpec, mod: M110.mod,
  /** The shipped module for one app path (used to patch a shipped reader for the throw path). */
  app: (rel) => require(path.join(M110.APP, rel)),
  /** The app's own `Setup.buildSetups` and a synthetic 15m series, shared by several probes. */
  setup: () => require(path.join(M110.APP, 'src/bots/setup')),
  smc: () => require(path.join(M110.APP, 'src/bots/smc')),
  bars: () => { let p = 1.1, t = Date.UTC(2026, 9, 13, 0, 0); const out = []; for (let i = 0; i < 320; i++) { const o = p, c = o + Math.sin(i / 7) * 0.0009 + ((i % 37 === 0) ? -0.0035 : 0.0004), h = Math.max(o, c) + 0.0004, l = Math.min(o, c) - 0.0004; out.push({ t: t + i * 900e3, o, h, l, c, v: 1000 + i }); p = c; } return out; },
};
