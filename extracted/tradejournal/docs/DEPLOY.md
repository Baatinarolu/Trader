# Deploying TradeJournal Pro — free, in about 10 minutes

The app is a plain Node/Express server with **one** data layer (libSQL). It runs in two shapes:

| Shape | Database | Cost | Good for |
|---|---|---|---|
| **Local** (`npm start`) | `file:data/journal.db` on your machine | $0 | everyday journaling, full speed, nothing to configure |
| **Hosted** (Vercel + Turso) | Turso libSQL (free tier) | $0 | phone access, TradingView webhooks, sharing a read-only view |

Both paths are the same code: `src/db.js` picks the driver from the environment. Nothing needs
to be rebuilt or migrated when you move between them — a Turso database *is* a SQLite database.

---

## 1. Local (30 seconds)

```bash
npm install
npm start            # → http://localhost:3000
```

The first run creates the schema, seeds 57 instrument presets and a starter playbook, and leaves the
workspace **empty** — no trades, no journal entries, no goals. (Until 2026-10-06 the boot seeded a
235-trade sample automatically; that made the app look as though you had traded when you had not, so it
was removed. To see a populated walkthrough on purpose, use **Settings → Sample data → Load sample
workspace**, or `npm run seed` from the CLI. `POST /api/demo/clear` removes it again.) It then opens
straight into the app — **there is no sign-in wall**. Point `TRADEJOURNAL_DB=/some/path/journal.db` at
any other file to keep separate journals.

---

## 2. Hosted on Vercel (free) + Turso (free)

Vercel's filesystem is read-only apart from an ephemeral `/tmp`, so a hosted deploy needs a
database that lives somewhere else. Turso is hosted libSQL — the same SQLite dialect the app
already speaks, free for personal use.

### 2.1 Put the code on GitHub

```bash
cd tradejournal
git init && git add . && git commit -m "TradeJournal Pro"
git remote add origin git@github.com:<you>/tradejournal.git
git push -u origin main
```

`.gitignore` already excludes `data/*.db*`, so your journal never leaves your machine.

### 2.2 Create the Turso database

```bash
# CLI (macOS/Linux)
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup                 # or: turso auth login

turso db create tradejournal
turso db show tradejournal --url          # → libsql://tradejournal-<you>.turso.io
turso db tokens create tradejournal       # → the auth token (copy it once)
```

### 2.3 Import the project into Vercel

1. <https://vercel.com/new> → **Import Git Repository** → pick the repo.
2. Framework preset: **Other**. Build command: leave empty. Output directory: `public`
   (`vercel.json` already declares this, plus the `/api/*` rewrite and a 60 s function limit).
3. **Environment Variables** — add these two for Production *and* Preview:

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://tradejournal-<you>.turso.io` |
   | `TURSO_AUTH_TOKEN` | the token from `turso db tokens create` |

4. **Deploy**. The first request builds the schema (16 tables + indexes) and seeds the starter
   workspace; that cold start takes a couple of seconds, every later request is fast.

Open `https://<project>.vercel.app` — the UI loads from `public/`, every `/api/*` call is served
by `api/index.js`, and each browser gets its own private workspace (the id lives in
`localStorage`, so there is still no login screen). `?fresh=1` on `POST /api/auth/local` —
or the button in **Settings → About** — starts an empty workspace.

> **Without Turso** the deploy still boots (it falls back to `file:/tmp/journal.db`), but data
> disappears whenever the serverless instance is recycled. Fine for a demo link, useless as a
> journal. Add the two env vars before you trust it with real trades.

### 2.4 Connect TradingView

1. Open your deployed app → **Settings → Integrations**.
2. Copy the **Webhook URL** (it contains your personal token).
3. In TradingView: right-click the chart → **Add alert** → *Notifications* → tick **Webhook URL**
   → paste. In **Message** paste either template the panel offers:

   ```json
   {"symbol":"{{ticker}}","action":"{{strategy.order.action}}","price":"{{close}}","tf":"{{interval}}","time":"{{timenow}}"}
   ```

   or plain text: `BUY {{ticker}} @ {{close}} {{interval}}`.
4. Every trigger is parsed, stored under **Recent alerts**, and — with *run the bot on every alert*
   switched on — answered with a graded plan plus an `agreement` verdict
   (`agrees` / `conflicts` / `bot says stand down`).

TradingView posts from **their** servers, so the URL has to be public: a `localhost` webhook can
never work. Rotate the token any time (the old URL dies instantly — update the alerts).

---

## 3. Alternative hosts (also free)

Any host that keeps a process and a disk works with **zero** code changes:

| Host | What to do |
|---|---|
| **Render** (free web service) | Build `npm install`, start `npm start`, add a disk mounted at `/data`, set `TRADEJOURNAL_DB=/data/journal.db` |
| **Fly.io** | `fly launch` (Node), attach a volume at `/data`, same env var |
| **Railway / Koyeb / a VPS** | same pattern — a volume + `TRADEJOURNAL_DB` |
| **Anything Docker-ish** | `FROM node:20`, `npm ci`, `CMD ["npm","start"]`, mount `/data` |

With a persistent disk you do **not** need Turso: it is just SQLite on a volume you own.

---

## 4. Operating notes

* **Backups.** JSON backup + CSV export live in Settings → Import / export; on a hosted deploy
  also turn on Turso's point-in-time restore (`turso db show tradejournal`) or simply
  `turso db shell tradejournal .dump > backup.sql` on a schedule.
* **Free-plan limits.** Vercel Hobby: plenty of invocations for personal use; each function is
  capped at 60 s here (`vercel.json`). Heavy bot scans (24 symbols × 1500 bars) can bump that
  ceiling on a cold start — trim `symbols` or `bars` if you ever see a timeout.
* **Turso free tier.** 500 databases, 9 GB storage, 1 billion row reads/month — a personal
  journal uses a rounding error of that.
* **Secrets.** `TURSO_AUTH_TOKEN` and each workspace's webhook token are the only secrets.
  Rotate the Turso token with `turso db tokens invalidate --all`, the webhook token from the UI.
* **Schema upgrades.** `src/db.js` runs the full `CREATE TABLE IF NOT EXISTS` schema on every
  cold start, so new tables appear the first time the new code runs. Old databases simply gain
  the new tables; nothing is dropped.
* **Reset.** Locally `npm run reset` (add `--empty` for a clean workspace). Hosted: create a
  fresh Turso database or use **Settings → About → Start a fresh workspace** per browser.

---

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `500` on the very first request, then fine | Cold start still building the schema. Retry once; check Vercel logs for `SQLITE_` messages. |
| Data is gone after a while | `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` missing on that environment → the deploy is using `/tmp`. |
| Webhook replies `401` | Token rotated, or the alert still points at an old deployment URL. Re-copy from Settings → Integrations. |
| Webhook never arrives | The URL is `localhost`, or the alert's *Webhook URL* box is unticked, or the plan's alert quota is exhausted. Test it with the panel's **Send a test alert** button. |
| `/api/bots/scan` times out | Too many symbols/bars for the 60 s function limit. Lower them, or scan from the local install. |
| `SQLITE_BUSY` under load | Turso serialises writes; retry once. A single-user journal never hits this. |
