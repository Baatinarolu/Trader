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
  // The deploy is a BACKEND SERVER, not a static folder. Vercel detects express in
  // package.json, classifies the project accordingly, and looks for the entrypoint it
  // names in its own error message: app.js / index.js / server.js, or src/ variants.
  ok('the entrypoint Vercel searches for exists at the project root',
    fs.existsSync(path.join(__dirname, '..', 'server.js')), 'server.js');
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    ok('the entrypoint binds the port the platform injects, not a fixed one',
      /process\.env\.PORT/.test(src), 'process.env.PORT');
  }

  // vercel.json is validated against a schema by the platform: an unknown top-level
  // property fails the build outright. JSON has no comments, so the temptation to add
  // `_comment: "..."` is real and would break the deploy — assert it cannot happen.
  {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const KNOWN = ['$schema', 'framework', 'outputDirectory', 'functions', 'crons', 'rewrites',
      'headers', 'redirects', 'builds', 'routes', 'env', 'buildCommand', 'installCommand',
      'cleanUrls', 'trailingSlash', 'regions', 'images', 'git', 'github', 'public', 'dev',
      'errorPages', 'cache', 'memory', 'maxDuration', 'skipGitConnectDuringLink'];
    const unknown = Object.keys(v).filter((k) => !KNOWN.includes(k));
    ok('vercel.json has no property the platform would reject',
      unknown.length === 0, unknown.length ? `unknown: ${unknown.join(', ')}` : `${Object.keys(v).length} keys, all recognised`);
    // THE REGRESSION THAT BROKE THE FIRST DEPLOY: outputDirectory pointed at public/, a
    // static folder, so Vercel searched it for a server entrypoint and failed the build with
    // "No entrypoint found in output directory: public". If outputDirectory ever comes back it
    // must point somewhere that actually holds an entrypoint.
    ok('outputDirectory does not point a server build at a static folder',
      !('outputDirectory' in v)
        || ['app.js', 'index.js', 'server.js'].some((f) => fs.existsSync(path.join(__dirname, '..', v.outputDirectory, f))),
      'outputDirectory' in v ? String(v.outputDirectory) : 'absent — the platform finds server.js itself');
    // The real invariant is NOT "framework must not be null". It is that the shell must
    // never be served as a raw static file, because public/index.html is a TEMPLATE:
    // served unrendered it puts a literal {{V}} in all 20 asset URLs, drops the no-store
    // policy and 404s deep links. Two configs satisfy that — a backend server that renders
    // everything, or framework:null PLUS a catch-all rewrite so no path ever reaches the
    // static layer. Assert the invariant, so either shape is allowed and a third is not.
    const catchAll = (v.rewrites || []).some((r) => r.source === '/(.*)' || r.source === '/:path*');
    const rendersEverything = v.framework !== null || catchAll;
    ok('nothing can serve the shell as a raw static file',
      rendersEverything,
      v.framework !== null ? 'backend framework renders every route'
        : catchAll ? `framework=null but ${(v.rewrites || []).map((r) => r.source).join(', ')} routes every path to the function`
        : 'framework=null with NO catch-all rewrite — index.html would ship as an unrendered template');
    // The function reads public/index.html with fs.readFile(path.join(__dirname, ...)), a
    // dynamic path. Vercel's file tracer only bundles what it can statically see required,
    // so public/ has to be declared explicitly or the deployed function has no shell to
    // render — which is what made every request 500 with FUNCTION_INVOCATION_FAILED.
    const fnKeys = Object.keys(v.functions || {});
    const included = fnKeys.map((k) => (v.functions[k] || {}).includeFiles).filter(Boolean);
    ok('the function bundle explicitly includes public/',
      included.some((g) => /public/.test(String(g))),
      included.length ? `includeFiles: ${included.join(', ')}` : `no includeFiles on ${fnKeys.join(', ') || 'no functions'}`);
    ok('the catch-all rewrite points at a function that is actually declared',
      !catchAll || (v.rewrites || []).filter((r) => r.source === '/(.*)' || r.source === '/:path*')
        .every((r) => fnKeys.some((k) => k.replace(/\.js$/, '') === r.destination.replace(/^\//, ''))),
      (v.rewrites || []).map((r) => `${r.source} -> ${r.destination}`).join(', ') || 'none');
    ok('the cron path is a route the server actually serves',
      (v.crons || []).every((c) => c.path === '/api/cron/tick'), JSON.stringify((v.crons || []).map((c) => c.path)));
  }

  // What serving public/ statically would have broken, asserted as behaviour rather than
  // as a config shape: the shell is a template, and only the server can render it.
  {
    const idx = await call('/');
    const raw = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    ok('public/index.html really is a template (so static serving cannot work)',
      raw.includes('{{V}}'), `${(raw.match(/\{\{V\}\}/g) || []).length} placeholders on disk`);
    ok('the served shell has every placeholder rendered',
      idx.status === 200 && !idx.text.includes('{{V}}'),
      idx.status === 200 ? (idx.text.includes('{{V}}') ? 'STILL A TEMPLATE' : 'rendered') : `HTTP ${idx.status}`);
    ok('asset URLs carry the per-boot cache-busting id',
      /\/js\/[a-z.]+\.js\?v=[0-9a-zA-Z._-]+/.test(idx.text || ''),
      ((idx.text || '').match(/\/js\/util\.js\?v=[^"']+/) || ['none'])[0]);
    ok('the shell is served no-store, so a redeploy cannot leave a stale UI',
      /no-store/.test(String(idx.headers.get('cache-control'))), String(idx.headers.get('cache-control')));
    const deep = await call('/some/deep/link');
    ok('a deep link falls through to the shell instead of 404ing',
      deep.status === 200 && !deep.text.includes('{{V}}'), `HTTP ${deep.status}`);
  }

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
