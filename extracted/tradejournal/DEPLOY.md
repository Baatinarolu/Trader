# Deploying TradeJournal Pro to Vercel

**It deploys as a backend server, not as a static site.** Vercel detects `express` in
`package.json`, classifies the project as a backend framework project, and runs `server.js`
as the entrypoint on the port it injects (`process.env.PORT`, bound to `0.0.0.0`). That is
the same code path you run locally, so the deployed app behaves identically — which matters,
because `public/index.html` is a **template**: the server substitutes a per-boot id into
`{{V}}` on 20 asset URLs, sets `no-store`, and falls through to the shell for deep links.
Serving `public/` as static output would ship all 20 placeholders literally, break
cache-busting and 404 every deep link. See §6 for the build failure that this caused.

The database client is `@libsql/client` (pure JS — no native module to compile on Vercel's
builders), and the in-process scheduler disables itself under `VERCEL=1` so the platform
cron owns that job instead. `api/index.js` is kept as a second, equivalent entrypoint
exporting the same handler; `scripts/vercel-check.js` asserts the two cannot diverge.

`npm run test:vercel` verifies all of it. It should report **27 passed, 1 failed**, the one
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

`.vercelignore` keeps `scripts/`, `docs/` and `data/` out of the upload. It is deliberately
narrow: Vercel applies those patterns to the whole clone rather than just the Root Directory,
so an earlier version listing `analysis/` and `*.md` reached outside the app and removed 96
files from the audit repository's own `analysis/` folder.

### Option B — Git import

Push this directory to a repository and import it in the Vercel dashboard:

| setting | value |
|---|---|
| Root Directory | `extracted/tradejournal` (if importing the audit repo as-is) |
| Framework preset | leave it alone — Vercel detects Express |
| Build command | **leave empty**, there is no build step |
| Output directory | **leave empty** — see §6, setting this broke the first deploy |
| Install command | default (`npm install`) |

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

---

## 6. If the build fails with "No entrypoint found in output directory"

This happened on the first deploy attempt, and the log is worth keeping because the fix is
counter-intuitive:

```
WARNING! Internal rewrites in backend framework projects now route requests using the
         rewritten destination path…
Error: No entrypoint found in output directory: "public". Searched for:
- app.{js,cjs,mjs,ts,cts,mts}
- index.{js,cjs,mjs,ts,cts,mts}
- server.{js,cjs,mjs,ts,cts,mts}
- src/app.js  - src/index.js  - src/server.js
```

**Cause.** Vercel detected `express` and classified the project as a *backend framework
project*. For those, it expects the **output directory** to contain the server entrypoint.
`vercel.json` set `"outputDirectory": "public"`, and `public/` holds only `index.html`,
`css/` and `js/` — so Vercel looked for `server.js` inside a static folder, found nothing,
and failed the build. The deployment then 404s on every path, because there is no output.

**Fix.** Delete `outputDirectory` from `vercel.json`. Vercel then searches the project root,
finds `server.js`, and runs it on the injected port. The `functions` block and the
`/api/(.*)` rewrite went with it — both were there to support the static-plus-function split,
and `server.js` already routes `/api/*` itself.

**Do not "fix" it the other way round.** Adding `"framework": null` also clears the error,
by making Vercel treat `public/` as static output — and that silently ships a broken app
instead of a failed build:

- `public/index.html` is a template with **20 `{{V}}` placeholders**; served raw, every asset
  URL becomes `/js/util.js?v={{V}}`. The files still load (a query string does not affect
  static matching), so it *looks* fine while per-boot cache-busting is dead — a redeploy can
  leave browsers on the previous UI.
- the `no-store` policy the server sets on the shell, JS and CSS is lost;
- the `app.get('*')` fall-through is lost, so any deep link 404s.

A failed build is better than that. `scripts/vercel-check.js` asserts all four behaviours —
placeholder count on disk, no `{{V}}` in the served shell, a rendered `?v=` id, `no-store`,
and a deep link returning 200 — so this cannot regress unnoticed.

### Also check the dashboard, which overrides `vercel.json`

Anything typed into Vercel → Project → Settings → General wins over the file. So if the
build still fails the same way after pulling the fix, look at **Output Directory**: if it
says `public`, clear it. Same for **Root Directory**, which must be `extracted/tradejournal`
when importing the audit repository — the first build log shows it was already correct
(Vercel found this directory's `.vercelignore` and installed its 132 packages).

### Plan B, if backend-framework mode still will not build

Route *every* request through the Express handler as a serverless function. This keeps the
template rendering, the `no-store` policy and the deep-link fall-through, because the same
`server.js` code answers everything — it just is not run as a long-lived server:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "functions": { "api/index.js": { "maxDuration": 60, "memory": 1024 } },
  "crons": [ { "path": "/api/cron/tick", "schedule": "0 6 * * *" } ],
  "rewrites": [ { "source": "/(.*)", "destination": "/api/index" } ],
  "headers": [ { "source": "/api/(.*)", "headers": [{ "key": "Cache-Control", "value": "no-store" }] } ]
}
```

The catch-all `/(.*)` is what makes this safe where `framework: null` alone is not: with no
`outputDirectory` and every path rewritten to the function, nothing is ever served as a raw
static file, so `{{V}}` is always rendered. `framework: null` here only stops Vercel from
trying to run `server.js` as a backend server.

Whichever way it deploys, `npm run test:vercel` must still report the shell guarantees —
no `{{V}}` in the served HTML, a rendered `?v=` id, `no-store`, deep links returning 200.
Those four are what distinguish a working deploy from one that merely builds.
