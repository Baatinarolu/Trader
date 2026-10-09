#!/usr/bin/env node
'use strict';
/**
 * Vercel-mode check — does the deployable entry point work the way the platform
 * will actually call it?
 *
 *   node scripts/vercel-check.js
 *
 * This does NOT deploy anything (that needs the trader's own Vercel account and
 * a Turso URL). It reproduces the two things that break serverless deploys and
 * that a local `node server.js` run never exercises:
 *
 *   1. the request path Vercel uses is `api/index.js` → `server.handler(req,res)`,
 *      a bare function call with no long-lived process behind it;
 *   2. a COLD database — the platform may hand the function an empty database,
 *      so the schema, the starter instruments and the workspace must be created
 *      by the first request, not by a boot script.
 *
 * It runs the handler behind a plain node http server (exactly how a serverless
 * host invokes it), with VERCEL=1 so the scheduler stays off, against a database
 * file in a temp directory that starts out empty.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-vercel-'));
const DB = path.join(TMP, 'cold-start.db');
process.env.VERCEL = '1';
process.env.TJ_SCHEDULER = '0';
process.env.TRADEJOURNAL_DB = `file:${DB}`;
delete process.env.TURSO_DATABASE_URL;
delete process.env.LIBSQL_URL;

let pass = 0, fail = 0;
const t0 = Date.now();
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(` ok   ${label}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(` FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

const BASE = 'http://127.0.0.1';
let PORT = 0;

async function call(pathname, opts = {}) {
  const res = await fetch(`${BASE}:${PORT}${pathname}`, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* html */ }
  return { status: res.status, json, text, headers: res.headers };
}

(async () => {
  console.log(`vercel-mode check · empty database at ${DB}\n`);

  const { handler } = require('../server.js');
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  PORT = server.address().port;

  const health = await call('/api/health');
  ok('the first request boots the function and creates the schema', health.status === 200 && health.json && health.json.ok,
    `HTTP ${health.status} after ${Date.now() - t0} ms cold start`);
  ok('the database file was created by the request, not by a script', fs.existsSync(DB), `${(fs.statSync(DB).size / 1024).toFixed(0)} KB`);
  const { startScheduler } = require('../server.js');
  ok('no scheduler in serverless mode (the platform cron calls /api/cron/tick)',
    startScheduler() === null, 'startScheduler() returns null under VERCEL=1, so no timer is left behind');

  // a workspace must exist on a cold database: the app has no sign-in wall, so
  // the first caller gets its own workspace without any setup step
  const reg = await call('/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `vercel${Date.now()}@test.local`, password: 'testpass123', name: 'Vercel Check' }),
  });
  const token = reg.json && reg.json.token;
  ok('a fresh workspace can be created on a cold database', reg.status === 200 && !!token, `HTTP ${reg.status}`);
  const H = { 'x-session': token, 'content-type': 'application/json' };

  const markets = await call('/api/bots/markets', { headers: H });
  ok('/api/bots/markets answers through the function handler', markets.status === 200 && markets.json && markets.json.instruments.length > 30,
    `${markets.json && markets.json.instruments && markets.json.instruments.length} instruments`);

  const an = await call('/api/bots/analyse?symbol=EURUSD&tf=15m&prediction=0', { headers: H });
  ok('/api/bots/analyse answers (needs outbound market data)', an.status === 200 && an.json && an.json.ok,
    an.status === 200 ? `now=${an.json.now && an.json.now.action}` : `HTTP ${an.status}`);

  const cron = await call('/api/cron/tick');
  ok('the platform cron endpoint refuses unauthenticated calls', cron.status === 401 || cron.status === 403, `HTTP ${cron.status}`);

  // the static app is served by Vercel from public/, not by the function
  ok('vercel.json publishes public/ and routes /api/* to the function', (() => {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    return v.outputDirectory === 'public'
      && (v.rewrites || []).some((r) => /^\/api\//.test(r.source) && r.destination === '/api/index')
      && (v.functions || {})['api/index.js'];
  })(), 'outputDirectory + rewrite + function config present');

  ok('api/index.js exports the same request handler the check just used',
    require('../api/index.js') === handler, 'one handler, no divergence between local and deployed');

  // ── the two deploy hazards, MEASURED rather than documented ───────────────
  // A serverless host wipes /tmp, and db.js falls back to file:/tmp/journal.db when
  // VERCEL is set and no remote URL is given. The app then boots, looks healthy and
  // loses every trade — the worst failure mode for a journal, because nothing errors.
  // This check is itself running in exactly that configuration, so it can assert the
  // hazard is detected rather than only that the happy path works.
  const hp = await call('/api/health');
  ok('/api/health answers unauthenticated (the first thing you check after a deploy)',
    hp.status === 200 && !!hp.json && hp.json.ok === true, `HTTP ${hp.status}`);
  ok('it reports that this really is a serverless boot', !!hp.json && hp.json.serverless === true,
    hp.json ? `serverless=${hp.json.serverless}` : '');
  ok('it FLAGS the ephemeral database this very check is running on',
    !!hp.json && hp.json.database && hp.json.database.persistent === false
      && /EPHEMERAL/.test(hp.json.database.warning || ''),
    hp.json && hp.json.database ? `persistent=${hp.json.database.persistent}, warning=${(hp.json.database.warning || 'NONE').slice(0, 40)}` : '');
  ok('the in-process scheduler is off and the platform cron is named instead',
    !!hp.json && /cron/.test(hp.json.scheduler || ''), hp.json ? hp.json.scheduler : '');
  ok('demo data is reported OFF unless TJ_OFFLINE_CANDLES is set',
    !!hp.json && hp.json.demo_data === false, hp.json ? `demo_data=${hp.json.demo_data}` : '');
  ok('no database credential leaks through the health endpoint',
    !!hp.json && !/:[^/@]*@/.test(String(hp.json.database && hp.json.database.url)),
    hp.json && hp.json.database ? hp.json.database.url : '');

  // The other two configurations have to be checked in child processes: db.js
  // resolves its URL once at module load, so one process can only ever be one case.
  const cp = require('child_process');
  const healthIn = (env) => {
    const script = "const s=require('./server.js'),http=require('http');"
      + "http.createServer(s.handler).listen(0,'127.0.0.1',async()=>{});"
      + "setTimeout(async()=>{process.exit(1)},1);"
    // Simpler and more robust than racing a listen callback: boot the handler on an
    // ephemeral port, fetch /api/health, print it, exit.
    const full = "const s=require('./server.js'),http=require('http');"
      + "const srv=http.createServer(s.handler);"
      + "srv.listen(0,'127.0.0.1',async()=>{const p=srv.address().port;"
      + "try{const j=await (await fetch('http://127.0.0.1:'+p+'/api/health')).json();"
      + "console.log(JSON.stringify(j));}catch(e){console.log(JSON.stringify({err:String(e.message)}));}"
      + "srv.close();process.exit(0);});";
    const r = cp.spawnSync(process.execPath, ['-e', full], {
      cwd: path.join(__dirname, '..'),
      env: Object.assign({}, process.env, env),
      encoding: 'utf8', timeout: 45000,
    });
    const line = String(r.stdout || '').trim().split('\n').pop();
    try { return JSON.parse(line); } catch (e) { return { err: (r.stderr || line || 'no output').slice(0, 140) }; }
  };
  const remote = healthIn({ TURSO_DATABASE_URL: 'libsql://example-user.turso.io', TURSO_AUTH_TOKEN: 'fake' });
  ok('a remote Turso URL is reported as PERSISTENT, with no ephemeral warning',
    !!remote && remote.database && remote.database.persistent === true && !remote.database.warning,
    remote && remote.database ? `persistent=${remote.database.persistent}, remote=${remote.database.remote}` : `child failed: ${remote && remote.err}`);
  ok('the remote URL is redacted of credentials in the health output',
    !!remote && remote.database && !/:[^/@]*@/.test(String(remote.database.url)),
    remote && remote.database ? remote.database.url : '');
  const demo = healthIn({ TJ_OFFLINE_CANDLES: '1' });
  ok('TJ_OFFLINE_CANDLES is surfaced as demo_data, so synthetic bars cannot ship unnoticed',
    !!demo && demo.demo_data === true && /synthetic/.test(demo.demo_warning || ''),
    demo && demo.err ? `child failed: ${demo.err}` : `demo_data=${demo && demo.demo_data}`);

  console.log(`\n${pass} passed, ${fail} failed · cold start ${Date.now() - t0} ms`);
  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('VERCEL CHECK CRASH:', e); process.exit(2); });
