# Deploying TradeJournal Pro to Vercel

The app is already shaped for it: `api/index.js` exports the same Express handler that
`server.js` runs locally, `vercel.json` publishes `public/` and rewrites every `/api/*`
request to that one function, the database client is `@libsql/client` (pure JS — no native
module to compile on Vercel's builders), and the in-process scheduler disables itself under
`VERCEL=1` so the platform cron owns that job instead.

`npm run test:vercel` verifies all of it. It should report **17 passed, 1 failed**, the one
failure being `/api/bots/analyse`, which needs outbound market data and cannot reach Yahoo
from a sandboxed CI host. On Vercel it passes, because Vercel functions have unrestricted
egress.

---

## 1. The one setting that actually matters

**Set `TURSO_DATABASE_URL`, or your journal will silently lose every trade.**

When `VERCEL` is set and no remote database URL is given, `src/db.js` falls back to
`file:/tmp/journal.db` so the app still boots. Vercel wipes `/tmp` on every cold start and
does not share it between concurrent instances. The result is a deployment that returns
HTTP 200, creates a workspace, accepts your trades — and forgets all of them minutes later.
Nothing errors, which is what makes it dangerous.

This is deliberately not fatal (a demo deploy should still come up), but it is loud:

- the boot log prints a `!! EPHEMERAL DATABASE !!` block;
- `GET /api/health` returns `database.persistent: false` with a warning string.

**Check `/api/health` immediately after your first deploy.** That is what it is for.

Create a free Turso database, then set two variables in Vercel → Project → Settings →
Environment Variables:

| variable | required | notes |
|---|---|---|
| `TURSO_DATABASE_URL` | **yes** | e.g. `libsql://your-db-user.turso.io`. Without it the DB is ephemeral |
| `TURSO_AUTH_TOKEN` | **yes** with the above | Turso read/write token |
| `CRON_SECRET` | recommended | without it `/api/cron/tick` returns 403 and the daily cron does nothing |
| `LIBSQL_URL` | alternative | honoured instead of `TURSO_DATABASE_URL` |
| `TRADEJOURNAL_DB` | alternative | any `libsql:`/`https:`/`file:` URL |
| `TJ_OFFLINE_CANDLES` | **leave unset** | serves synthetic demo bars instead of market data. See §4 |

`LIBSQL_URL` and `TURSO_DATABASE_URL` are interchangeable; `TRADEJOURNAL_DB` is the escape
hatch for anything else. Precedence is Turso → libSQL → `TRADEJOURNAL_DB` → the `/tmp`
fallback.

---

## 2. Deploying

### Option A — Vercel CLI (fastest, no Git host needed)

```bash
cd <this directory>
npm install
npx vercel            # first run: link or create the project
npx vercel --prod
```

`.vercelignore` keeps `scripts/`, `docs/`, `data/` and `analysis/` out of the upload.

### Option B — Git import

Push this directory to a repository and import it in the Vercel dashboard. Framework preset
**Other**, build command **leave empty** (there is no build step — `public/` is plain static
files), output directory is already `public` via `vercel.json`.

If you import the *audit* repository this directory was developed in, set
**Root Directory** to `extracted/tradejournal`. If you would rather not carry the ~17 MB of
reference zips and the `analysis/` folder into a deploy, copy this directory into a fresh
repository of its own and import that — nothing outside it is needed at runtime.

Node 18 or newer (`engines` in `package.json`).

---

## 3. After deploying — verify in this order

```bash
curl https://your-app.vercel.app/api/health
```

You want to see:

```json
{ "ok": true, "serverless": true,
  "database": { "remote": true, "persistent": true },
  "demo_data": false,
  "scheduler": "platform cron (/api/cron/tick)" }
```

`database.persistent: false` → you forgot `TURSO_DATABASE_URL`. Fix it before entering
anything you care about.
`demo_data: true` → `TJ_OFFLINE_CANDLES` is set in the environment. Unset it.

Then check the app itself: `/api/bots/markets` should list ~70 instruments, and an analysis
request should return candles rather than a provider error:

```bash
curl 'https://your-app.vercel.app/api/bots/candles?symbol=EURUSD&tf=15m&limit=200'
```

If that returns an error, read the tail of the message — it names the host, the interval and
the reason, and a trailing `[network: …]` block means the hosts were unreachable at the
transport layer rather than the symbol being wrong. See `analysis/YAHOO-CANDLES.md` §5 for
the full table of what each tail means.

### The cron

`vercel.json` schedules `/api/cron/tick` daily at 06:00 UTC. It resolves tracked signals the
way the local scheduler would. Set `CRON_SECRET` to the same value Vercel uses; the endpoint
accepts either `Authorization: Bearer <secret>` (what Vercel sends) or `x-cron-secret`, and
returns 403 when no secret is configured. Hobby plans allow one cron job, which is what this
is. Change the schedule in `vercel.json` if you want it more often.

---

## 4. `TJ_OFFLINE_CANDLES` — do not set this in production

It exists so the product can be exercised where no market-data host is reachable (a sandbox,
an offline demo, a CI run). With it set, every bar the app serves is a deterministic
synthetic random walk, labelled `meta.provider: "offline-synthetic"` and `meta.demo: true`
with a warning string, and `/api/health` reports `demo_data: true`.

It is **off by default** and never a silent fallback: unset it and the app requires a live
feed again. The labels are at the API boundary — the browser UI does not currently render a
banner, so `/api/health` is the reliable check. That gap is recorded as a limitation of
ledger row **M123** in `analysis/MISMATCHES.md`.

---

## 5. Known limitations, stated rather than discovered later

- **`maxDuration: 60`** is set for `api/index.js` in `vercel.json`. A full top-down analysis
  fetches several timeframes and can take a few seconds; if your plan caps function duration
  lower than 60 s, reduce that number instead of leaving it above your limit.
- **Cold starts** pay the schema migration and starter-workspace creation on the first
  request. Measured locally at ~270–360 ms with an empty database; a remote Turso database
  adds network latency to that first request.
- **`/api/bots/*` is unauthenticated for market data** in the current build; the workspace
  endpoints use an `x-session` token from `/api/auth/register`. If this is going anywhere
  public, put authentication in front of it.
- **Analysis depends on Yahoo Finance's public chart endpoint**, which needs no API key and
  no crumb, but is unauthenticated and can be rate-limited. The client retries with backoff
  on 429/5xx and reports both hosts when it fails. It is a free endpoint used as if it were a
  data vendor; for anything load-bearing, put a real vendor behind `src/candles.js`.
- **M124**: `/api/bots/chart` and `/api/bots/analyse` can disagree about the same bar. It is
  a pre-existing defect, recorded and not yet fixed, so do not treat a mismatch between the
  chart panel and the analysis strip as a deployment problem.
