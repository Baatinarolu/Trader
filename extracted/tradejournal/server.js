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
