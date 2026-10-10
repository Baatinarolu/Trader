'use strict';
/**
 * TradeJournal Pro — server entry point.
 *   Express + libSQL (a local SQLite file by default, Turso when TURSO_DATABASE_URL is set).
 *   No build step, no bundler, zero client-side dependencies.
 */
/* ── local .env — dev convenience ONLY, never a deployment mechanism ─────────
 * Read when a .env file exists beside this file, which it never does in
 * production: .env is gitignored, so it is not uploaded, and Vercel injects
 * environment variables from its own store rather than from a repository file.
 * Existing process.env ALWAYS wins, so a platform-provided variable can never be
 * shadowed by a stray local file, and a malformed .env can never stop boot.
 * It exists because the user asked for credentials in .env and, without a loader,
 * that file would silently do nothing and read as a fix while changing nothing. */
(function loadDotEnv() {
  try {
    const fs = require('fs'), pth = require('path');
    const file = pth.join(__dirname, '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch (e) { /* never let a broken .env stop the server starting */ }
})();
/* It must run BEFORE the require() calls below: src/db.js computes its database URL
 * at require time, so a loader placed after the requires is read too late — which is
 * exactly how the first version silently did nothing and reported the file DB while
 * a .env full of Turso credentials sat beside it. */

const path = require('path');
const fs = require('fs');
const express = require('express');
const { db, ready, createUser, DB_URL, REMOTE } = require('./src/db');
const api = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * A journal must never lose data because of one bad request. Async route errors
 * are caught by wrap() in the API and turned into HTTP 500s; these two guards are
 * the last line of defence for anything that escapes (timers, background work).
 */
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason && reason.stack ? reason.stack.split('\n')[0] : reason));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err));

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// health check + tiny request log (useful when running as a local service)
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api') && res.statusCode >= 400) {
      console.log(`${res.statusCode} ${req.method} ${req.originalUrl} (${Date.now() - started}ms)`);
    }
  });
  next();
});

/* ─────────────────────────────────────────────────────────────── deploy health
 * Unauthenticated on purpose: the first thing anyone does after a deploy is check
 * it came up, and the two things that can be silently wrong on a serverless host
 * are exactly what this reports.
 *
 *   database.persistent  false means the DB is a file under /tmp, which a
 *                        serverless platform wipes on every cold start. db.js
 *                        falls back to file:/tmp/journal.db when VERCEL is set and
 *                        no TURSO_DATABASE_URL / LIBSQL_URL / TRADEJOURNAL_DB is
 *                        provided, so the app boots and looks healthy while losing
 *                        every trade. For a journal that is the worst possible
 *                        failure mode, so it is reported rather than left to the
 *                        boot log nobody reads.
 *   demo_data            true means TJ_OFFLINE_CANDLES is on and every bar the app
 *                        serves is synthetic. That flag exists so the product can be
 *                        exercised where no market-data host is reachable; shipping
 *                        it to production by accident would mean charts full of
 *                        invented prices, so it is visible here and in the boot log.
 * Neither value is a secret: the DB URL is redacted of credentials before it is
 * returned.
 */
/* ── /diagnostics — the deploy checks itself, in plain English ────────────────
 * Added because the user was, rightly, tired of being handed curl commands and
 * JSON to interpret. One unauthenticated page, opened on WHICHEVER deployment is
 * misbehaving, tests each layer from inside that deployment and prints the fix
 * for the layer that fails — including the two failure modes that look identical
 * from outside: Vercel Deployment Protection answering 401 before the function
 * runs, and the platform cron calling /api/cron/tick without CRON_SECRET.
 * It shows the hostname it was opened on, because half of "same error no matter
 * what I change" is a protected preview deployment being mistaken for production.
 * No secrets are printed: the DB URL arrives already redacted by /api/health. */
app.get('/diagnostics', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TradeJournal Pro — deployment diagnostics</title>
<style>body{font:14px/1.6 ui-monospace,Menlo,Consolas,monospace;background:#0d1117;color:#d7dde5;margin:0;padding:28px}
h1{font-size:16px;letter-spacing:.08em}li{margin:10px 0;list-style:none;padding:10px 12px;border:1px solid #263041;border-radius:4px;background:#11161f}
.ok{border-color:#1f6f3f}.bad{border-color:#8a3033}.warn{border-color:#8a6d1f}
b{display:block;margin-bottom:4px}.fix{color:#9fb0c3;font-size:12.5px;margin-top:6px}code{color:#7ee0a0}</style>
<h1>DEPLOYMENT DIAGNOSTICS</h1>
<div id="host" class="fix"></div><ul id="out"><li class="warn"><b>running checks…</b></li></ul>
<script>
var out=document.getElementById('out'), host=document.getElementById('host');
host.textContent='opened on: '+location.hostname+'  (if this is a *-git-* or *-<hash>-*.vercel.app name, it is a PREVIEW deployment, not production)';
function row(cls,title,fix){var li=document.createElement('li');li.className=cls;var b=document.createElement('b');b.textContent=title;li.appendChild(b);if(fix){var f=document.createElement('div');f.className='fix';f.textContent=fix;li.appendChild(f);}out.appendChild(li);return li;}
function clear(){out.innerHTML='';}
function j(url,opts){return fetch(url,opts).then(function(r){return r.json().then(function(d){return {status:r.status,body:d};},function(){return {status:r.status,body:null};});},function(e){return {status:0,body:null,err:String(e)};});}
(async function(){
  clear();
  var h=await j('/api/health');
  if(h.status===401||h.status===403){row('bad','BLOCKED BEFORE THE APP: this deployment answered '+h.status+' to an unauthenticated health check.','That is Vercel Deployment Protection, not the application and not the database. Open the PRODUCTION domain, or Settings - Deployment Protection - disable it for this environment. Nothing about Turso or Supabase changes this.');return;}
  if(h.status!==200||!h.body){row('bad','The app did not answer /api/health (status '+h.status+').','The serverless function crashed at boot. In Vercel - Deployments - Functions read the log: "Startup failed: fetch failed" with a libsql URL means wrong TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.');return;}
  var db=(h.body.database||{});
  row('ok','App is running. serverless='+h.body.serverless+'  demo_data='+h.body.demo_data);
  if(h.body.demo_data)row('bad','TJ_OFFLINE_CANDLES is ON: every bar served here is synthetic, not market data.','Remove TJ_OFFLINE_CANDLES from this environment and redeploy.');
  if(db.persistent)row('ok','Database is PERSISTENT: '+db.url);
  else row('bad','Database is EPHEMERAL (/tmp): '+db.url,'The environment variables did not reach this function. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on THIS environment (Production, not Preview) and REDEPLOY - env changes do not apply to an existing deployment.');
  var me=await j('/api/auth/me');
  if(me.status!==200){row('bad','/api/auth/me failed with '+me.status,'Unexpected; read the function log.');}
  else row(me.body&&me.body.authenticated?'ok':'warn','Session: '+(me.body&&me.body.authenticated?'authenticated':'none yet (normal for a first visit)'));
  var loc=await j('/api/auth/local',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(loc.status===200&&loc.body&&loc.body.token){row('ok','Workspace bootstrap works: /auth/local issued a session ('+(loc.body.workspace||'?')+').');
    var t=loc.body.token; var tr=await j('/api/trades',{headers:{'x-session':t}});
    if(tr.status===200)row('ok','An authenticated read succeeded: /api/trades returned '+tr.status+'. This deployment is fully functional - sign in or just use it.');
    else row('bad','Session issued but an authenticated read returned '+tr.status,'Read the function log for this request.');
  } else {
    row('bad','Workspace bootstrap FAILED: /auth/local returned '+loc.status,'If the log shows a libsql/Turso 401 the token value was pasted with surrounding quotation marks or whitespace - re-enter both values bare. If it shows a write error the database is read-only.');
  }
  row('warn','If the "server returned HTTP status 401" you saw appears in Vercel - Cron rather than in the browser, it is the scheduled tick calling /api/cron/tick without CRON_SECRET.','Set CRON_SECRET to any long random string in this environment and redeploy, or remove the cron from vercel.json. It does not affect browsing the app.');
})();
</script>`);
});

app.get('/api/health', (req, res) => {
  const serverless = !!process.env.VERCEL;
  const persistent = REMOTE || !serverless;
  const demo = /^(1|true|yes|on)$/i.test(String(process.env.TJ_OFFLINE_CANDLES || '').trim());
  res.json({
    ok: true,
    uptime_s: Math.round(process.uptime()),
    serverless,
    database: {
      url: REMOTE ? DB_URL.replace(/\/\/.*@/, '//') : DB_URL,
      remote: REMOTE,
      persistent,
      ...(persistent ? {} : {
        warning: 'EPHEMERAL DATABASE — writes live in /tmp and are lost on every cold start. '
          + 'Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) to keep data.',
      }),
    },
    demo_data: demo,
    ...(demo ? { demo_warning: 'TJ_OFFLINE_CANDLES is on: every bar served is synthetic, not market data.' } : {}),
    scheduler: serverless ? 'platform cron (/api/cron/tick)' : (process.env.TJ_SCHEDULER === '0' ? 'disabled' : 'in-process'),
    node: process.version,
    checked_at: new Date().toISOString(),
  });
});

app.use('/api', api);

/**
 * Cache policy. The shell, its scripts and its stylesheet are stamped with a
 * per-boot id (`?v=`) and served `no-store`, so a restart can never leave a
 * browser (or a proxy in front of it) showing a previous interface.
 */
const BOOT_ID = (process.env.TJ_BUILD || Date.now().toString(36)).replace(/[^0-9a-zA-Z._-]/g, '');
const INDEX_FILE = path.join(__dirname, 'public', 'index.html');
app.get(['/', '/index.html'], (req, res, next) => {
  fs.readFile(INDEX_FILE, 'utf8', (err, html) => {
    if (err) return next(err);
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('X-UI-Build', BOOT_ID);
    res.type('html').send(html.split('{{V}}').join(BOOT_ID));
  });
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-store, must-revalidate');
  },
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  fs.readFile(INDEX_FILE, 'utf8', (err, html) => {
    if (err) return next(err);
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('X-UI-Build', BOOT_ID);
    res.type('html').send(html.split('{{V}}').join(BOOT_ID));
  });
});
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

/* ------------------------------------------------------------------ boot */
/**
 * The data layer is async (libSQL): make sure the schema and the instrument
 * presets exist, and put a starter workspace in place on a brand-new database,
 * before accepting traffic. `bootPromise` is awaited by every request path, so a
 * serverless cold start can never serve a request against a half-built schema.
 */
async function start() {
  await ready;
  const userCount = (await db.prepare('SELECT COUNT(*) n FROM users').get()).n;
  if (userCount === 0) {
    try {
      // Starter workspace: an account, the instrument library and the playbook
      // template. NO trades, NO journal entries, NO goals — inventing activity
      // the trader never did is worse than an empty screen. Sample data is an
      // explicit action (Settings → About → "Load sample trades", or `npm run seed`).
      await createUser({ email: 'demo@tradejournal.pro', name: 'Trader', password: 'demo1234' });
      console.log('  Starter workspace created (empty): instruments + playbook, 0 trades.');
    } catch (e) { console.error('Starter workspace failed:', e.message); }
  }
}

let booted = false;
const bootPromise = (async () => {
  await start();
  if (!booted) {
    booted = true;
    if (!REMOTE && !process.env.VERCEL) console.log(`  Database: ${DB_URL}`);
    else console.log(`  Database: ${REMOTE ? DB_URL.replace(/\/\/.*@/, '//') : DB_URL}`);
    // Two hazards that are invisible in the running app and catastrophic or
    // embarrassing in a deployed one. Said at boot AND exposed on /api/health.
    if (process.env.VERCEL && !REMOTE) {
      console.log('');
      console.log('  !! EPHEMERAL DATABASE !!');
      console.log('     No TURSO_DATABASE_URL / LIBSQL_URL / TRADEJOURNAL_DB is set, so the');
      console.log('     database is a file under /tmp, which this platform wipes on every');
      console.log('     cold start. The app will boot and look healthy while losing every');
      console.log('     trade, note and setting written to it. Set TURSO_DATABASE_URL (and');
      console.log('     TURSO_AUTH_TOKEN) before relying on a deployment. GET /api/health');
      console.log('     reports this as database.persistent=false.');
    }
    if (/^(1|true|yes|on)$/i.test(String(process.env.TJ_OFFLINE_CANDLES || '').trim())) {
      console.log('');
      console.log('  !! DEMO DATA !!  TJ_OFFLINE_CANDLES is set: every bar served is a');
      console.log('     synthetic random walk, NOT market data. Unset it in production.');
    }
  }
})();

/**
 * Request handler for hosts that call a function instead of keeping a process
 * alive (Vercel, Netlify, Cloudflare-ish runtimes). Express itself is a valid
 * (req, res) handler, we just have to wait for the database first.
 */
async function handler(req, res) {
  try { await bootPromise; } catch (e) { console.error('Boot failed:', e.message); }
  return app(req, res);
}

/**
 * The scheduler.  A serverless deploy calls /api/cron/tick from the platform's
 * cron; a long-lived server runs the same job itself, so tracked signals get
 * resolved (and notifications sent) without anyone opening the app.
 *   TJ_SCHEDULER=0        disable
 *   TJ_SCHEDULER_MIN=15   minutes between runs
 */
function startScheduler() {
  if (process.env.VERCEL || process.env.TJ_SCHEDULER === '0') return null;
  const every = Math.max(5, Number(process.env.TJ_SCHEDULER_MIN || 15)) * 60 * 1000;
  const run = async () => {
    try {
      const out = await require('./src/bots').resolveAllUsers({ limit: 40 });
      if (out.resolved) console.log(`[scheduler] resolved ${out.resolved} signal(s) for ${out.users} workspace(s)`);
    } catch (e) { console.error('[scheduler] tick failed:', e.message); }
  };
  const t = setInterval(run, every);
  if (t.unref) t.unref();
  const boot = setTimeout(run, 8000);      // first pass shortly after boot
  if (boot.unref) boot.unref();
  console.log(`  Scheduler:   every ${every / 60000} min (set TJ_SCHEDULER=0 to disable)`);
  return t;
}

if (require.main === module) {
  bootPromise.then(() => {
    app.set('tj-internal', true);            // marks the local cron endpoint as trusted
    app.listen(PORT, HOST, () => {
      console.log(`\n  TradeJournal Pro  →  http://localhost:${PORT}`);
      console.log(`  Workspace:   connects automatically — no sign-in wall`);
      startScheduler();
      console.log('');
    });
  }).catch((e) => {
    console.error('Startup failed:', e.message);
    // On a serverless host, exiting the process IS the failure: the platform reports
    // FUNCTION_INVOCATION_FAILED for whatever request was in flight, and the real cause
    // (usually an unreachable database URL) is buried. handler() already awaits
    // bootPromise inside a try/catch and answers 500 with the message, which is both
    // survivable and diagnosable, so only a long-lived local process should exit.
    if (!process.env.VERCEL) process.exit(1);
  });
}

module.exports = { app, handler, bootPromise, start, startScheduler };
