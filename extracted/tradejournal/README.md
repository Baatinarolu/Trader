# TradeJournal Pro

A **multi-asset trading journal, analytics engine, behavioural coach, SMC bot desk and TradingView-integrated
pre-trade assistant**. No subscription, no broker login, no sign-in wall — a Node server, one libSQL database
(a local file by default), and the whole thing deployable free to Vercel + Turso.

```
TradeJournal Pro  →  http://localhost:3000
Opens straight into a workspace (no sign-in).  Fresh start: Settings → About → Start a fresh workspace.
```

---

## What it does

| Area | What you get |
|---|---|
| **Journal** | 40+ fields per trade — thesis, execution notes, emotions, confidence, rule-adherence score, mistake tags, screenshots, MAE/MFE, planned R, **scale-out legs** (closes at the pct-weighted price). Works for FX, futures, stocks, ETFs, crypto, index CFDs and options. |
| **Analytics** | Expectancy ($ and R), win rate, profit factor, payoff, SQN, Sharpe, Sortino, Calmar, recovery factor, Kelly, max drawdown, streaks, R-distribution, MAE/MFE capture efficiency, time-of-day and weekday grids, hold-time buckets, 10+ segment tables. |
| **Coach** | 20+ deterministic behavioural tests on your own rows — losing setups, bad hours, revenge entries, post-loss trading, overtrading days, size creep, early exits, tight stops, cost of each mistake tag — each with the numbers, the dollar impact and one concrete action. |
| **Assistant** | Pre-session briefing with a risk multiplier derived from your drawdown/streak state, live economic calendar, headlines, quotes, watchlist, position-size calculator with true instrument specs, break-even win-rate maths, and a Monte Carlo drawdown / risk-of-ruin simulator. |
| **Daily habit** | Calendar heatmap of P&L, day-review notebook (bias, mood, energy, plan, review, lessons), goals with live progress, pre-trade checklist builder. |
| **Data** | CSV import with automatic column detection, CSV export, full JSON backup & restore, multi-account (including prop-firm drawdown rules), instrument library. |
| **Options** | Black-Scholes calculator (price, delta/gamma/theta/vega, break-even, ITM/OTM), premium-based position sizing, and a plan that warns instead of printing a fake R:R when your target premium is below the entry. 7 option presets (100× multiplier). *IV is yours to type — there is no options feed.* |
| **Prop challenge** | Named challenge shapes (5 %/10 %, 6 %/6 %, instant…) applied to an account, then a live tracker over 4 checks — daily loss, max drawdown, profit target, consistency — with progress %. |
| **Exposure & heat** | Open positions grouped into correlation clusters (metals, USD, crypto, indices…) so long XAU + long XAG is counted as **one** bet, with total heat and warnings. |
| **Alerts & automation** | Webhook channels (Slack/Discord/Telegram/Zapier — https only) with a test button that reports the real HTTP status, a `trade_closed` event, and a scheduler (`/api/cron/tick`, `CRON_SECRET`-guarded, daily on Vercel's free plan) that resolves signals without the tab open. |
| **TradingView** | Official chart widgets on Market/Dashboard/trade form, correct symbol+interval deep links for all 57 instruments, and a **webhook that turns TradingView alerts into graded plans** (with an *agrees / conflicts* verdict against the bot's own read). |

---

## Interface rules (standing, enforced by the test suite)

The app is built to read like a trading terminal, not like an AI product. These are constraints, not
preferences, and `npm run test:ui` asserts four of them on every run:

* **No sign-in anything.** No login screen, no password field, no "create account", no auth-styled card.
  The browser is attached to a workspace automatically (`POST /api/auth/local`); the only card-shaped
  screen is a monospace *server unreachable* diagnostic with a Retry button.
* **No AI-style chrome.** No chat bubbles, no sparkle icons, no assistant mascot, no "powered by AI"
  badge, no emoji in the interface, no neon or purple gradient palette. Coaching arrives as findings
  with numbers, dates and a command to reproduce them — not as conversational text.
* **Icons are inline SVG drawn in code** (11 navigation icons, no icon font, no CDN). Text glyphs and
  emoji render differently on every platform and make a trading tool look like a toy, so they are not
  used: status reads as words — `ok` / `no`, `pass` / `fail`, `asc` / `desc` — with colour as a second
  signal, never as the only one.
* **Every number carries its provenance on screen** — the date, the sample and the script that produced
  it (`docs/MEASURED-RULES.md`, `docs/EDGE-REPORT.md`). Where a measurement says the model does not
  work, the interface says that too.

* **Terminal design language, not dashboard-template design.** Graphite neutrals (`#0b0d11` → `#1b1f27`),
  1px hairlines instead of drop shadows, 2–4px corners instead of 12–18px, dense 5px row padding, uppercase
  micro-labels on card headers and table heads, and **every number in monospace with tabular figures** so
  columns line up. Colour is reserved for state — P&L, pass/fail, risk — never for decoration. No gradients
  in the chrome, no glows, no purple anywhere in the palette.
* **Charts are real charts.** The desk chart is drawn in code (`public/js/chart.js`, canvas, no CDN, no
  iframe): candles with wicks, a volume pane, nice-number price ticks, clock-anchored time ticks, killzone
  shading, the dealing range with premium/discount, order blocks, fair value gaps, liquidity pools, sweep
  and structure markers, a crosshair with an OHLCV readout, wheel-zoom and drag-pan. Captions are placed by
  a collision-aware labeller, so levels stay readable instead of printing text over text. Every level drawn
  is a level the engine actually computed — nothing is decorative.
* **The build tells you what it is.** Every boot stamps a build id into the shell (`X-UI-Build` header,
  `data-build` attribute, and a `build …` line in the sidebar footer), and the shell + scripts + stylesheet
  are served `Cache-Control: no-store` with `?v=<build>` on every asset URL — so a restart can never leave
  a browser or a proxy showing the previous interface.

Current state, measured by the suite (2026-10-06): **11 inline SVG nav icons for 11 items, 0 emoji or
decorative glyph characters in rendered text, 0 in tooltips and labels, no auth UI present, build stamp
rendered in the sidebar, and — in a real Chromium — a 1328 × 560 desk chart whose canvas carries 39–41 %
ink across runs (43 572 of 106 240 sampled pixels on EURUSD 15m, 38.9 % in the final pass), a five-step method panel and three mini stack charts, 0 console errors from the app.**

---

## Quick start

```bash
cd tradejournal
npm install          # express + @libsql/client + technicalindicators (jsdom only for the test suite)
npm start            # → http://localhost:3000
```

The first run creates the schema, seeds the instrument library and a starter playbook, and **leaves your
workspace empty** — no trades, no journal, no goals, nothing you did not enter. No account, no password,
no wall. The dashboard then offers three explicit choices: log a trade, import a CSV, or load the
235-trade sample walkthrough (**Bots → Settings → Sample data**, clearly labelled and removable in one
click with `POST /api/demo/clear`).

Other commands:

```bash
npm test              # 121 API assertions against a running server (each run purges its own workspace afterwards)
npm run test:bots     # 205 bot-engine assertions (SMC, top-down gate, prediction, exit simulator, entry policies, corrections, webhook, refined plans)
npm run test:ui       # 21 view checks in jsdom + console-error report
npm run test:topdown  # 66 assertions on the video's method itself, on hand-built candles (incl. the step-5 gate and the plan's quality filters)
npm run test:chart    # 36 assertions that the chart draws candles, ranges, zones, pools and the plan box
npm run test:browser  # real Chromium: layout size, painted pixels, the method panel, overlay anchoring, wheel behaviour, screenshots (needs playwright-core)
npm run test:vercel   # 9 checks of the deployable entry point (handler + cold start), no deploy, no account needed
npm run test:all      # api + bots + ui + topdown + chart (~2.5 min)
npm run seed          # load the 235-trade sample workspace on purpose
npm run reset         # delete data/journal.db and rebuild (rebuilds empty)
```

Useful environment variables: `PORT` (default 3000), `HOST` (default 0.0.0.0),
`TRADEJOURNAL_DB` (path to the local SQLite file), `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
(hosted libSQL — see **[docs/DEPLOY.md](docs/DEPLOY.md)**).

---

## Deploy it free

| | |
|---|---|
| **Local** | `npm install && npm start` — a SQLite file in `data/`, nothing else to do |
| **Vercel + Turso** | push to GitHub, import to Vercel, add `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`, deploy. `api/index.js` serves every `/api/*` request, `public/` is the front end, and the free Turso tier keeps the data. |

Full walk-through (Turso CLI, env vars, TradingView webhook, backups, troubleshooting):
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

---

## Does it actually win? — the measured answer

Every claim in this app comes from a replay you can re-run yourself:

```bash
node scripts/edge-report.js --bars 2000 --step 6 --modes entry,leg,ote,mtf   # → docs/EDGE-REPORT.md
node scripts/rule-sweep.js                                                   # → docs/MEASURED-RULES.md
node scripts/mtf-report.js                                                   # → docs/MTF-REPORT.md
node scripts/stability-report.js --bars 4000 --step 6 --modes entry,leg      # → docs/STABILITY-REPORT.md
```

Headline reported by the run of **2026-10-06 11:57:05 UTC** (24 markets, 11 964 filled samples →
**11 411 unique setups**, 7 985 search / **3 426 untouched test**, **per-instrument costs** — spread +
slippage + commission per asset class, turned into R by each trade's own stop distance, mean 0.096R,
median 0.049R; stops closer than 0.25 × ATR are refused, 0 dropped in this pool):

* **≥ 70 % win rate and positive expectancy were not both available — measured, not asserted.** The win
  rate is a dial you turn with the target: 0.25R → **55.2 % net wins / −0.34R**; 0.35R → **55.8 % / −0.31R**
  (the peak); 1R → 45.8 % / −0.18R; 2.5R → 31.0 % / **−0.03R** (least bad); 3R → 27.1 % / −0.04R.
  **No target distance reached a 70 % net win rate.** Across **252 single/pair filters × 14 target
  distances** on the test window: **0 filters** reach 70 % net wins, and **0 of the 5 149 rule × exit
  combinations** cross 70 % *and* stay positive.
* **What does earn money** (positive in both halves): **`displacement leg` + stop ≥ 0.6 × ATR + first
  target ≥ 3R** → **+0.31R train / +0.56R test** (n 261 / 109) at a 35–42 % win rate — the tail pays for
  the misses (`node scripts/rule-sweep.js`, 2026-10-06 11:59 UTC, 7 028 unique setups). The most profitable single/pair filters on the untouched window: `rr>=2+ote` **+0.19R** at
  2.5R (39 % wins, n 120) and `range+rr>=2` +0.19R (n 632). The app now defaults to the measured shape
  (`full ★` in the Prediction view) and prints the reason under the chips.
* **The 70 % version exists and loses money.** Same sweep, 70/30 split: `ema50 agreement` + displacement
  leg, **stop ≥ 1 × ATR**, first target at **0.25R** wins **74.8 % train / 74.0 % test** (n 468 / 146) and
  returns **−0.084R / −0.116R per trade** — **0 %** of those trades bank ≥ +0.5R, because the target is
  smaller than the cost of getting in. Three configurations clear 70 % on both halves; none is profitable.
* **Second-chance re-entries lose money.** After a stop-out that never reached the first target, price
  re-tapped the level in **99.0 %** of cases and the re-entry won **14.2 %** of the time — **−0.35R per
  trade** pooled (net effect on *every* trade you take: −0.35R). The bots say that instead of teaching it.
* **Lower-timeframe confirmation (`?entry=mtf`)** has the highest win rate of any entry rule —
  **47.4 % pooled vs 35.1 % base** — and **still costs money**: on the 1 503 setups both rules filled,
  MTF is **+6.0 points of win rate and −0.268R of expectancy**, and the 321 setups it refuses but the base
  rule took averaged **+0.157R**. Market-by-market table + refusal counterfactual:
  [docs/MTF-REPORT.md](docs/MTF-REPORT.md).
* **Costs decide more than filters.** A 1h EURUSD entry with an 8-pip stop pays a median **0.216R** round
  trip; gold on 1h pays 0.025R. Every table in the app is net of those costs, per instrument.
* **Regime check** (4 000 bars, 8 markets, `stability-report.js`): only the flat-3R shape kept its sign in
  both halves (+0.11R → +0.05R); the video-plan-plus-gates combination **flipped +0.18R → −0.55R**
  (n 43/35), which is why the gate set is labelled regime-dependent rather than an edge.
  See [docs/STABILITY-REPORT.md](docs/STABILITY-REPORT.md).

Caveats that come with those numbers — one regime per market (~2 months of 1h candles), correlated
samples (the same zone is re-detected on consecutive bars), bar-based (not tick) MAE/MFE, class-default
costs rather than *your* broker's, and a pool that drifts a few setups between runs because the window
ends at run time. The date, the command and the sample live in each report; quote them together.

Read the whole thing, including the tables that fail: **[docs/EDGE-REPORT.md](docs/EDGE-REPORT.md)**.

---

## Architecture

```
server.js                 Express bootstrap, static hosting, crash guards, serverless handler
api/index.js              Vercel entry point (vercel.json rewrites /api/* here)
vercel.json               Static output + function limits for the free deploy
src/
  db.js                   libSQL data layer: schema, users/sessions, seeds, atomic batches
  routes/async-router.js  Express router that awaits handlers and forwards errors
  tradingview.js          TradingView symbol mapping, alert parsing, widget configs, deep links
  instruments.js          Instrument spec library + multi-asset P&L, R and position-size maths
  trades.js               Normalises client input into a fully-computed trade row
  performance.js          The analytics engine: KPIs, equity, drawdown, segments, Monte Carlo, Kelly
  coach.js                Behavioural rules + discipline score + pre-session briefing
  market.js               Economic calendar, RSS news, quotes, sentiment (cached, key-free)
  demo-data.js            Simulated trade history with deliberate behavioural leaks
  routes/api.js           REST API (auth, trades, analytics, coach, journal, market, import/export)
public/
  index.html, css/app.css
  js/util.js              Formatters + a small dependency-free SVG chart engine
  js/api.js, store.js     Fetch layer, app state, filters
  js/views/*.js           dashboard, trades, calendar, analytics, playbook, journal, coach, risk, market, settings
  js/app.js               Shell, hash router, modals, toasts, keyboard shortcuts
scripts/                  seed-demo.js, smoke-test.js
docs/                     user guide, metrics guide, API reference
```

**Design decisions worth knowing**

* **Everything normalises to R.** A 1.5-lot EURUSD trade and 2 ES contracts are only comparable if the journal knows the value of a 1.0 price move for each. `src/instruments.js` stores that per instrument, so expectancy, risk % and drawdown are truly multi-asset.
* **One source of truth for statistics.** The UI never computes a metric itself — `src/performance.js` does, so the dashboard, exports, coach and API can never disagree.
* **The coach is deterministic.** No LLM guessing: every insight is a statistical comparison with the sample size and dollar impact attached. You can audit the claim and reproduce it with a filter.
* **Local-first.** Market context is the only thing that talks to the internet, it is cached server-side, and every view degrades gracefully when you are offline.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `n` | Log a new trade |
| `/` | Jump to the trade log search |
| `g` then `d/c/t/j/a/m/p/r/k/s` | Dashboard, Coach, Trades, Journal, Analytics, Market, Playbook, Risk, Calendar, Settings |
| `Esc` | Close the open modal |

---

## Security & privacy notes

* **No sign-in wall.** The app attaches to the workspace in your database; hosted, each browser gets a private
  workspace whose id lives in `localStorage`. Email/password endpoints still exist if you *want* them
  (`POST /api/auth/register`), but nothing in the UI requires them. Per-user rows are always scoped in SQL.
* Passwords (if used) are `scrypt` hashes with a per-user salt; sessions are random 256-bit tokens stored
  hashed, in an `HttpOnly; SameSite=Lax` cookie. Scripts can use `x-session: <token>` instead.
* The TradingView webhook is a **capability URL**: possession of the token equals permission to push an alert
  into your journal. It can only create alerts/signals, never read your journal, and it can be rotated in one
  click. Rotate it if you ever paste the URL somewhere public.
* The server binds to `0.0.0.0` so the in-browser preview works; if you only want it on your own machine, start
  with `HOST=127.0.0.1 npm start`.
* Your trades live in `data/journal.db` (or your Turso database). Copy that file — or the JSON backup — and you
  have everything.

---

## The bots

Sidebar → **Bots** opens five cooperating assistants built on one deterministic
Smart-Money-Concepts engine (the model taught in the *Market Mechanics Mentorship* playlist):

| Tab | What it does |
|---|---|
| **Market mechanics** | Top-down bias, structure (BOS/CHoCH/MSS), liquidity map, sweeps, order blocks, FVGs, breakers, premium/discount, CRT, killzones — scored 0–100 and drawn on a candlestick chart, with a plain-English read-aloud |
| **Prediction** | Replays the entry model over the market's own history (walk-forward, no hindsight, managed exits) and returns calibrated `P(win)`, expectancy, a per-grade table, an out-of-sample check and a buy/sell probability study |
| **Scan** | Ranks up to 24 markets by mechanics + setup quality — "where should I look right now?" |
| **Corrections** | Reads your journal, finds the mistakes costing you money **with numbers**, and derives personal guardrails (risk cap, daily trade cap, cooldown, loss-limit stop) from your own winning behaviour |
| **Signals** | Saves alerts and grades the bot's own record against live candles (win rate + expectancy by grade) |

Every plan carries entry, stop, target ladder, R:R per leg, position size in your
instrument's units, invalidation and a management rule (50 % at T1 → break-even → runner).
**Log this plan** pre-fills the trade form. The bots never place orders, and they say
**NO TRADE** far more often than not — by design.

**TradingView integration** — every panel carries a *TradingView ↗* link for the exact symbol and interval,
the Market view and Dashboard embed the official chart widgets, and **Settings → Integrations** hands you a
webhook URL: point a TradingView alert at it and each trigger is parsed, graded by the bot and stored with an
`agreement` verdict (does the bot read the same side of the market as your alert?). See
[docs/API.md](docs/API.md#tradingview) for the payloads.

Guides: [docs/BOTS.md](docs/BOTS.md) · [docs/PLAYLIST-CURRICULUM.md](docs/PLAYLIST-CURRICULUM.md)

## Docs

* [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md) — how to actually use it, screen by screen, and the daily/weekly/monthly review routine.
* [`docs/METRICS-GUIDE.md`](docs/METRICS-GUIDE.md) — what every metric means, how it is calculated, typical benchmarks and the research behind it.
* [`docs/API.md`](docs/API.md) — the REST API if you want to build on top of it (or import from a script), including the TradingView webhook contract.
* [`docs/EDGE-REPORT.md`](docs/EDGE-REPORT.md) — the measured win-rate/exit frontier across 24 markets, with per-instrument costs: what the model does, what it can't do, and the exact command to reproduce it.
* [`docs/MEASURED-RULES.md`](docs/MEASURED-RULES.md) — the rule sweep: the highest win rate that survives out-of-sample, the configurations that actually earn, and why you cannot have both.
* [`docs/DEPLOY.md`](docs/DEPLOY.md) — free hosting on Vercel + Turso, alternative hosts, backups, troubleshooting.

### One answer per market, and it is dated

The Bots view now opens with a **now** strip: a single action (`WAIT / BUY / SELL / NO TRADE`), the
sentence behind it, the one level being watched, the next checkpoint on the clock, and the bar the
read came from with its age and how far price has moved since. The opposite side is named,
collapsed and **never priced** — a plan the higher timeframe does not permit is a scenario, not an
order. Any read can be re-created with **bar replay** (`?trim=N`), which rebuilds it from the
candles that existed then, so the rules cannot see the bars they are judged on. The desk chart adds
drawing tools (line, ray, price line, box, fib, measure, magnet), overlay studies (EMA 50/200,
VWAP) and size presets, and the drawings are stored in the database per market + timeframe. The
TradingView panel is now full width with its own toolbar, indicators and Full screen.
