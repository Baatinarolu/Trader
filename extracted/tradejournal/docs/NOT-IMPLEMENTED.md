# Not implemented — the honest register

**Updated 2026-10-07.** Every item is checked against the running tree (`grep`/`node`
evidence, quoted inline). Nothing here is a promise: when an item moves, it moves into
[BOTS.md](BOTS.md) / [EDGE-REPORT.md](EDGE-REPORT.md) / [MTF-REPORT.md](MTF-REPORT.md) with a dated measurement.

**What changed since the first version of this file**

| Moved | Evidence produced this tick |
|---|---|
| **Options** (§2 #1) — shipped | `src/options.js` + `POST /api/options/{greeks,plan,size}`: Black-Scholes price, delta/gamma/theta/vega, break-even, ITM/OTM, premium risk sizing, and a warning when the target premium is not above the entry (rather than a fake R:R). 7 option presets (100× multiplier, 0.01 tick) in `src/instruments.js`; cost model **250 bp of premium** (spread 180 + slippage 50 + commission 20), not basis points of the underlying. Verified: ATM 1-year call at 20 % IV → **9.925** (S·N(d1) − K·e^(−rT)·N(d2)), delta **0.618**; `/options/greeks` without an IV returns an error instead of inventing one. **IV and premium are yours to type — there is no options feed** |
| **Prop-firm rule packs** (§2 #14) — shipped | `src/prop.js` publishes presets, `GET /api/prop/presets`, `PUT /api/accounts/:id {prop_preset}`, `GET /api/accounts/:id/challenge` → 4 checks (daily loss, max drawdown, profit target, consistency) with progress %. Verified in `npm run test:api` (120 pass) and by hand: an account that fails the target passes after a +487.50 day (110.8 % progress, 0 % drawdown). Presets are *shapes* (5 %/10 % etc.), not any one firm's current contract |
| **Portfolio exposure & heat** (§2 #15, partially) — shipped | `src/exposure.js` + `GET /api/risk/exposure`: positions grouped into correlation clusters (verified collapsing long XAUUSD + long XAGUSD into one `metals` cluster with a warning and 70 % heat). **Still missing: an explicit max-concurrent-exposure rule and a live correlation matrix** — the clusters are named groupings, not a covariance estimate |
| **Outbound notifications** (§2 #5) — shipped | `src/notify.js` + `GET|POST /api/notify/channels`, `DELETE /api/notify/channels/:id`, `POST /api/notify/test`; `trade_closed` fires fire-and-forget on the close route. https-only URLs. Verified: a test send to a bogus Discord webhook returned **404 "Unknown Webhook"** and the app **recorded the failure in `last_status` instead of pretending it worked**. Email/push are not built (webhooks cover Slack/Discord/Telegram/Zapier) |
| **Scheduled jobs** (§2 #7) — shipped | `startScheduler()` in `server.js` (skipped on Vercel or with `TJ_SCHEDULER=0`, `TJ_SCHEDULER_MIN` default 15) plus `GET /api/cron/tick` guarded by `CRON_SECRET` (401 without, 200 with). `vercel.json` schedules **`0 6 * * *`** → `/api/cron/tick`; Vercel's free plan runs cron once a day, which is why the deployed cadence is daily rather than 15-minute |
| **Journal scale-out legs** (§3) — shipped | `POST /api/trades/:id/close` accepts `legs:[{pct,price,reason}]`; the trade stores them as JSON and exits at the **pct-weighted price**. Verified twice: unit check (50/25/25 @ 20100/20200/20250 → weighted exit **20162.5**, net **+487.50**, **1.625R**, `legs_n` 3) and `npm run test:api` |
| **Live MTF confirmation observed end to end** (register #6) | On 2026-10-06 12:0x UTC the live server returned `status: 'recent'` with an actionable refined plan for **EURUSD 1h** (LTF 15m); saving it through `POST /api/bots/signals/save-plan` stored **id 68** with `entry_mode='mtf'`, `mtf_tf='15m'`, `risk_atr=1.66`, `rr_primary=1.36` — afterwards the scheduler resolved it to `no_fill` on its own, so the cron path is observed working too. `legs_n` / `weighted_exit` are now part of every decorated trade (previously the legs only showed up inside `legs` JSON): verified by assertion in `npm run test:api` (120 pass) |
| **The measured default, and a floor that matches** | `default_view` is now computed in `src/bots/predict.js`, forwarded by `/api/bots/predict` **and** `/api/bots/backtest`, marked `full ★` in the UI with the reason on screen (rule-sweep: leg entry + stop ≥ 0.6 ATR + first target ≥ 3R). Backtest floor and live floor are the same number now: **0.25 × ATR** (`--min-risk-atr`, `MIN_RISK_ATR`); the harness prints how many stops it dropped |
| **Multi-timeframe entry execution** — from §2 "not built" to shipped | Live lower-timeframe fetch + confirmation, refined plan (entry/stop/risk-in-ATR/targets) on every candidate, `POST /api/bots/signals/save-plan`, schema v3 (`entry_mode`, `mtf_tf`, `risk_atr`), graded by `POST /api/bots/signals/resolve`. `npm run test:bots` (139 pass / 0 fail) and `npm run test:api` (119 pass / 0 fail, including the save → read-back of a refined plan). Measurement: [MTF-REPORT.md](MTF-REPORT.md) |
| **Minimum-risk floor in the model itself** | `MIN_RISK_ATR = 0.25` in `src/bots/predict.js`; setups whose stop sits inside a quarter ATR of entry are refused and counted (`counts.skipped.min_risk`), because they manufactured double-digit-R targets out of noise (an 11.8R "win" off a 0.24-ATR stop was in the old sample table) |
| **Per-instrument costs inside every model table** | `sweep.cost_r` per trade from `src/instruments.js` (class default + 9 symbol overrides); the pooled mean round trip is **0.096R**, median 0.049R, EURUSD 1h **0.216R** (fresh run: `node scripts/edge-report.js --bars 2000 --step 6 --modes entry,leg,ote,mtf`, 2026-10-06 11:57:05 UTC, 11 964 → 11 411 unique setups) |
| **The 70 % question answered by cross-tabulation, not prose** | `docs/EDGE-REPORT.md` §0c: 252 filters × 14 target distances on the untouched test window — **zero** reach 70 % net wins, **zero** keep a positive expectancy there. `scripts/rule-sweep.js` separately confirms the ≥ 70 % win configuration exists at a 0.25R target (74.8 % train / 74.0 % test, stop ≥ 1 ATR) and loses 0.08–0.12R per trade |
| **The video's top-down method, implemented as the method** (§3 "the model" / user's complaint 2026-10-06) — shipped | New `src/bots/topdown.js` implements the playlist's procedure literally: five steps (stack → **right candle** → **mark the range** → **wait for the sweep** → **lower-timeframe confirmation and entry**), each returned with `done`/`waiting` and the sentence a mentor would say. The **right candle** is the newest higher-timeframe candle that traded into a real level (previous high/low, swing extreme, order block) and closed back away from it by ≥ 0.2 ATR; **consumed ranges** (price still > 0.5 ATR outside and never reclaimed) are skipped in favour of the next one and the skip is reported; the **sweep** must close back inside; a sweep that has already covered most of the range to the target is flagged **chase** and blocks. Two entries are always printed — aggressive (at confirmation, capped a quarter of the way into the range) and safer (the pullback to the range mid / fresh FVG) — stop beyond the sweeping candle, target the opposite side of the range. Verified by `node scripts/topdown-test.js` (**42 assertions, 0 failures**, 2026-10-06 14:2x UTC: hand-built candles for a sweep-and-reclaim → long to the range high, a range with no sweep → no plan, both sides swept → chop, a runaway → skipped, a late entry → chase) |
| **Conflict resolution by hierarchy, not by weighting** (same complaint) — shipped | `momentum.js` no longer decides direction from the 3 : 2 : 1 indicator average; the higher timeframe decides and the weighted score is labelled `display_note` as a display of the three readings only. Every disagreement now comes back as `{kind, sides, rule, resolution, blocks_trade}`: `ltf-against-htf` (lower timeframe trend against the bias) and `counter-trend-crt` **do not block** — the taught rule is that a lower timeframe only times the entry ("the small chart looks bearish because that is how the liquidity is taken"); `no-trigger`, `no-right-candle`, `both-sides-taken` and `chase` **do block**. Verified: `ltf-against-htf` fires on a live EURUSD 15m read with `blocks_trade: false` and the rule text attached, and the blocking `no-trigger` case makes the verdict `NO TRADE / source: topdown-gate` |
| **The method gates the entry model** (same complaint) — shipped | `setup.js` takes the method as a gate: when it blocks, the verdict is `NO TRADE` whatever the setup scored (`verdict.source = 'topdown-gate'`, with the outstanding step named), and when the method carries a direction only that side can be armed. Signals are stamped `method_state` / `method_dir` / `method_blocked` (schema migration, idempotent) so the tracked-signal ledger can later be split into "the method approved this" vs "the setup model liked it anyway". Verified in the live payload: `verdict: NO TRADE, setup_action: SELL, source: topdown-gate` while the method's step 4 was outstanding |
| **One answer per market, dated** (user: *"I'm seeing both buy and sell … what to do currently at the moment"* 2026-10-06) — shipped | `src/bots/now.js` + the `now` strip: one action from a closed set, the sentence, the single level to watch, the next checkpoint (bar close or killzone), the bar the read came from with its age and the price drift since, guards (news window, personal rules), and the opposite side named-but-unpriced in a collapsed block. Header of the recommended candidate is `THE CALL` only when the method permits that side, otherwise `NOT ARMED … the entry model only`. Verified by `scripts/now-test.js` (36 assertions on hand-built inputs), `scripts/bots-test.js` (now/replay/drawings sections), and `scripts/ui-browser-test.js` (11 assertions in a real browser) |
| **Bar replay** — read the chart as of an earlier close | `?trim=N` (0–400, clamped) or `?as_of=ISO` on `/api/bots/analyse|chart|topdown`; `momentum.series()` trims and rewrites `meta` (bars / last_bar / last_price) so captions cannot quote the live bar during a replay; the payload states `replay{trim}` and `now.evaluated_on.replay`; `now.since` reports what the market did in those N bars. UI: − 5 / + 5 / Live / slider on the Bots view; the chart is stamped `REPLAY · N bars back`. Measured: two identical replays return the same last candle (determinism asserted in `bots-test.js`) |
| **Drawings + studies on the desk chart** (user: *"can't that chart have those trading view stuffs and features"*) | Tools: cursor / line / horizontal ray / price line / box / fib retracement / measure, magnet snap, undo, delete, clear · studies: EMA 50, EMA 200, session VWAP (computed client-side, offline-safe) · size presets M/L/XL/Full remembered in `localStorage` · drawings stored **server-side** in `chart_drawings` (schema v5) via `GET|PUT|DELETE /api/chart/drawings`, per symbol **and** timeframe, in (time, price) so they survive zoom, pan and a timeframe change. Verified end to end in Chromium: a two-click trend line is counted on screen, stored in the workspace (1 row), and removed again by Undo (0 rows) |
| **A bigger TradingView panel** (user: *"the trading view chart is too small"*) | Market view: full-width embed, default height **640 px** (measured 1330 × 640 in Chromium at 1600 px), presets M/L/XL/**Full screen** (Esc leaves), interval 1m–1W, eight chart styles, **TradingView's own side rail of drawing tools left enabled**, and an indicator row that re-embeds the widget with the chosen studies (Volume, EMA, VWAP, Bollinger, Ichimoku, Supertrend, Pivots, RSI, MACD, Stoch RSI, ATR, session volume). `TV in app` on the Bots view opens the same market in that panel |
| **Playlist audit** (user: *"is it just the top down analysis or … all you didn't follow"*) 2026-10-06 | `docs/PLAYLIST-CURRICULUM.md` now answers this line by line: **one lesson had drifted** (ep. 11, top-down → now the five taught steps with the hierarchy deciding direction), everything else was already the taught model, **4 episodes are partial on purpose** (written plan, journalling, daily review, 21-day discipline — the app stores and measures them, it cannot *do* them), **2 have no honest code surface** (the two autobiography/mindset uploads). A new table lists the six places the code is deliberately **stricter** than the video, and why each one is stricter |
| **A real desk chart** (user: *"the chart is bad, small, not detailed, fake"* 2026-10-06) — shipped | New `public/js/chart.js` (dependency-free canvas renderer, no CDN, no iframe) replaces the 340 px one-line-tooltip sketch: **1328 × 560 css px at a 1600 px viewport, 39–41 % of sampled canvas pixels painted across runs (43 572 of 106 240 on EURUSD 15m)** (Chromium 129, measured 2026-10-06 14:2x UTC, `node scripts/ui-browser-test.js`), candles with wicks, a volume pane, nice-number price ticks, clock-anchored time ticks, killzone shading with captions, the dealing range (premium/discount, EQ, OTE band), order blocks, fair value gaps, liquidity pools, sweep arrows, structure labels and `BOS`/`MSS` marks, the plan drawn as a red risk box + green reward box with every leg priced, crosshair with an OHLCV readout, wheel zoom, drag pan, double-click reset, overlay toggles and an expand button. Captions go through a **collision-aware labeller** (plan and range win the space; zones/structure/pools yield) so text never prints over text. Screenshots: `docs/ui-snapshot-2026-10-06-chart.png`, `-bots.png`, `-dashboard.png` |
| **Real-browser UI test** (register §2 #10) — shipped | `scripts/ui-browser-test.js` (playwright-core + Chromium, dev-only) boots the app in a real engine and asserts: the chart is ≥ 1200 × 520 css px, the canvas buffer is device-pixel scaled, the canvas has painted ink, the toolbar carries ≥ 8 toggles, the method panel shows the five steps with their states, the three layers and the checklist, the stack draws three mini charts, and all 11 views render — **27 assertions, 0 failures, 0 console errors from this app** (the TradingView widget's own blocked request is named and excluded). It writes the dated screenshots above |
| **Suites no longer write into your workspace** (consequence of the empty-by-default fix) — shipped | Both API suites register a throwaway workspace, seed *their* data into it, and delete it at the end via `scripts/test-cleanup.js`. Verified: `node scripts/test-cleanup.js` removed 27 orphan workspaces left by earlier runs, and after a full run the database contains exactly one user (`demo@tradejournal.pro`) with **0 trades, 0 signals, 0 journal entries** |
| **Stale numbers re-pointed in-app** | `correction.js` and `coach.js` (two places) claimed "+0.70R test" and "69–77 %"; the sweep's actual out-of-sample number is **+0.56R on 109 setups** with 42 % wins, and the high-win-rate filter is **69–75 % / −0.08R**. The in-app copy now quotes those, names the sample (7 028 unique setups, 24 market/timeframe series, 2026-10-06) and points at `docs/MEASURED-RULES.md` |
| **The step-5 gate was dead** (user: *"something feels off"* 2026-10-06, diagnosed by measurement, repaired 2026-10-07) — **fixed** | `topdown.js:confirmation()` read `disp.bars_ago` (displacement legs carry `i`, not `bars_ago` — measured `'bars_ago' in d === false`) and compared `Math.sign('down')` (**NaN**) against a numeric direction. Both comparisons werepermanently false, so `ok = dispOk \|\| shiftOk` never became true: over 372 windows (6 markets × {15m,1h} × 31 re-reads, `probe-trigger.js`) confirmation passed **0 times** and conviction tier A was unreachable. Repaired: `dirSign()` accepts `'up'/'down'` and ±1, `ageOf()` derives the age from `i` or `bars_ago`, and the **newest** same-direction leg is used (not `[0]`). Re-measured on the same 372-window grid: confirmation **141** (was 0), ranges confirmed 14, conviction **A 5 / B 9** (was A: impossible). 13 new assertions in `scripts/topdown-test.js` fail on the old code, so it cannot come back |
| **Two entries that were one entry** — fixed | The CRT plan's "aggressive" and "safer" fills were identical in **60/60** live plans (measured `probe3.js`): the safer entry was a midpoint clamped into the aggressive slot, and the aggressive entry was pushed a quarter of the range away from the swept edge. The plan now teaches what the video teaches — aggressive = the confirmation price, safer = **the retest of the swept edge** (same stop beyond the sweep, same opposite-edge target) — and the two differ wherever a retest exists (measured: BTCUSDT 5m 1.61R at the confirmation vs **1.91R** on the retest; NZDUSD 1h 0.57R vs **0.97R**). Where price already sits at the edge the fills coincide, and the table shows that instead of hiding it. A test assertion that demanded the old (wrong) geometry was replaced, with the reason in the file |
| **`room_left` was an absolute value** — fixed | `Math.abs(opposite − price)/span` reported "room left" even when price had already blown **through** the target, so the entry clamped onto the target and the plan printed a 0R reward. Now directional (`<0` = the move is done, plan blocked as *chase*). Measured effect on the same grid: plans formed 243 → 14, and every surviving plan has a real, positive R:R |
| **Discretionary quality filters, with their thresholds measured** (2026-10-07) | Three guards decide whether a formed range is a trade at all, and each threshold sits in a measured gap rather than at a taste boundary: **noise floor** — the stop must clear **0.25 ATR** from the entry (XRPUSDT 5m printed a **10.46R** "plan" off a 0.08-ATR stop, i.e. about one spread); **risk / range ≤ 2** — measured across 70 instruments × 5 timeframes, properly paired range+sweep plans sat at **0.31–1.52** and the broken ones (a range and a sweep from different moves) at **2.6–22.7** (MSFT 1d 22.7, NVDA 1d 11.6, JP225 1d 13.0 — all of which had printed 0.04–0.10R "plans"); **thin sweep** (< 0.25 ATR wick) is now *informational only* — the method wants price to trade outside and come back, so a shallow wick is not a defect by itself. Live effect on 350 combos: **6 armed** (BTCUSDT 5m 1.58R, BTCUSD 5m 1.47R, UKOIL 5m 1.11R, USDCAD 5m 1.01R, NZDUSD 1h 0.68R, EURUSD 15m 0.49R), 136 WAIT, 168 NO TRADE, 40 provider misses |
| **A minimum R:R that is yours, not a constant** (user's choice, confirmed 2026-10-07: arm but warn; default stays **1R**) | The floor lives in your settings (`min_rr`, **default 1R**, editable on the Settings screen, clamped 0.1–10) and is readable per request with `?min_rr=`. A plan below it is still shown — armed, with its entry/stop/target — but carries a red **"below your minimum"** block in the strip and in the plan table, and the plan itself carries `below_min_rr` + `rr_note`. Measured: at the default 1R floor, USDCAD 4h (1.63R) reads clean and 0.08–0.26R plans read flagged; with the floor set to 2R the same 1.63R plan becomes flagged; with the trader's saved 1.5R, 1.63R is clean again. The setup engine's own 1:2 runway model is untouched by a *lower* floor and tightens with a higher one (`runRR = max(2, floor)`) |
| **Overlays were stuck to the screen** (user: *"the ob, FVG … is sticked to the screen not the candles"*, broadened to *"ALSO SUPPLY AND DEMAND ZONE LIQUIDITY SWEEP ALL THO[SE]"*) — fixed | Every time-based overlay now takes its origin from the data (`i`, then `bars_ago`, then `t`) and is drawn from that bar rightwards: order blocks, fair value gaps, liquidity pools (rays from the bar that formed them), the dealing range (from the older of the two defining swings), the OTE band, the plan box (from the sweep that provoked it) and the structure labels. Origins left of the viewport are **clipped to the plot's left edge, never collapsed to a sliver**. Measured in Chromium through the renderer's own per-frame geometry (`chart.__tjDraw`) and via a pixel scan restricted to the plot and to the composited tint: at 170, 136 and 109 bars on screen and after a drag-pan, a zone with origin bar 507 reports **507.03 / 507.03 / 507.04**, and 581 reports **581.03 / 581.01 / 580.97** — the same bar every time, where before the band was `x0=10 x1=1215` at every zoom. Reproduce: `node scripts/probe-overlays.js` |
| **The wheel belongs to the page** (user's choice: *"wheel scrolls the page"*) — fixed | A bare wheel over the candles scrolls the page (**measured scrollY 596 → 836, bars unchanged 170 → 170**); **Ctrl/⌘ + wheel** zooms (**170 → 136**); the wheel over the **price axis** zooms (**136 → 109**); drag pans into history; double-click returns to the default width (**109 → 170**). Before: the wheel zoomed over the whole canvas and the page did not move at all while the pointer was on the chart |
| **The Market view could sit on a bare skeleton** — fixed | It waited for `/market/overview` (an outbound quote service) before painting **anything**, and when the provider was slow the view measured **0 cards / 0 chars for 30 s**. The TradingView panel and the watchlist now paint first, with a "Loading quotes, calendar and news…" placeholder that the data replaces (or an honest offline card if the service never answers) — measured again: 6 cards / 8 803 chars in the first frame |
| **A stale read was shown as "now"** — fixed | Leaving the Bots view and coming back re-displayed the payload from whenever it was last fetched — and a hash-only navigation never re-ran the loader at all. The view now re-runs its analysis when the payload is older than **one bar** of the selected timeframe, keeping the old read on screen (with its age) until the new one lands. Verified in Chromium with a **faked clock**: a read younger than a bar is reused (**1** request on load, still **1** after leaving and returning), and after 20 simulated minutes away the read re-runs itself (**1 → 2** requests). Both halves are assertions in `npm run test:browser` |
| **Vercel-mode check** (user is about to deploy) | `npm run test:vercel` — `scripts/vercel-check.js` runs the deployable entry point the way the platform calls it (`api/index.js` → `server.handler(req,res)`, behind a bare node http server, `VERCEL=1`) against an **empty temporary database**: **9/9** — the first request creates the schema and the starter workspace (cold start **243 ms**), a workspace can be registered on a cold database, `/api/bots/markets` returns 70 instruments, `/api/bots/analyse` answers, `/api/cron/tick` refuses unauthenticated calls (403), `startScheduler()` returns null so no timer is left behind, vercel.json publishes `public/` + routes `/api/*` to the function, and `api/index.js` exports the *same* handler object this check used |
| **Refined plans are graded, not just stored** | `savePlan()` writes exactly what the trader was shown; `resolveSignals()` grades it against real candles like any other tracked signal |

---

**UI-style audit (2026-10-06).** Four assertions now guard the chrome in `npm run test:ui`, so it cannot
drift back: no auth UI anywhere; every navigation item drawn as an inline SVG; zero emoji/glyph
characters in rendered text; zero in `title`/`aria-label` attributes. The pass that produced them
removed the glyph-character nav icons (`◧ ⟡ ✦ ◎ ▤ ✎ ▦ ◔ ❑ ⚖ ⚙`), the `★`/`☆` adherence stars (now
`4/5`), the `✓ ✗ ⚠` status marks in the bots view (now `ok`/`no`, `Conflict:`, `Risk:`, `Fix:`), the
`☰ ✕` toolbar glyphs, the `📝` calendar emoji, and the `↗ ▲ ▼ ▸` arrows — all replaced by SVG, CSS
shapes or words. Also renamed the unreachable-server screen off the `.auth-*` classes so no screen in
the app is auth-shaped. `src/bots/predict.js`'s measured rule book is `require()`-first for the same
kind of reason: a deploy should not silently lose a file.

## 1. Excluded on purpose — your constraints, and what they cost

| Not built | Why it is absent | What you give up |
|---|---|---|
| Sign-in, accounts, teams, sharing | You required an app with **no login wall**. The server auto-provisions a workspace (`POST /api/auth/local`) | No identity, no per-person permissions, no sync across devices unless you point it at Turso, no shared views |
| Broker order execution, copy-trading, order routing | Never requested; needs paid broker APIs and a real money-risk surface | The app advises; it never places, modifies or closes an order |
| Broker auto-sync (MT4/MT5/Tradovate/IBKR/Bybit) | No broker SDK in `package.json` (`@libsql/client`, `express`, `technicalindicators`) | You import by CSV/JSON; trades are not pulled automatically |
| Paid market-data feeds (tick data, L2) | Kept free by design | No tick-level MAE/MFE, no true real-time prices |
| AI-product styling — chat interface, sparkle/emoji icons, neon gradients, "ask the assistant" box | You required a UI that does **not** look AI-generated. Audit 2026-10-06: 0 emoji/glyph characters in rendered text, 0 in tooltips, navigation is 11 inline SVG line icons, palette is dark terminal (no purple/neon), the advice panel is a findings list with numbers | No conversational front end: coaching reads as `metric → evidence → fix`, and a question like "why did I lose this week?" is answered by the report rather than by a chat reply |

## 2. Not built at all

| # | Missing | Evidence | What it would change |
|---|---|---|---|
| 1 | Futures rollover / contract months | Presets carry multiplier maths only; no expiry or roll date | A held ES contract's history is a continuous-contract approximation |
| 2 | Multi-currency P&L conversion | No exchange-rate helper in `src/` | GER40 (EUR), JP225 (JPY), UK100 (GBP) P&L is in its own currency; portfolio totals are only strictly right for USD-quoted instruments |
| 3 | Screenshot / chart-image attachments on trades | No multipart endpoint, no file storage | Can't attach "why I took it" images to a trade |
| 4 | PWA / offline / installable | `public/` = `css`, `index.html`, `js` — no manifest, no service worker | No offline journal, no home-screen install |
| 5 | Real-time streaming (WebSocket/SSE) | No `socket.io`/`EventSource` in the tree | Prices and confirmations update on poll, not on tick |
| 6 | LLM/AI summaries | No `openai`/`anthropic`/`gemini` reference; every coaching line is deterministic | No natural-language narrative generation (this is also what keeps it free and offline) |
| 7 | PDF / tax reports | Exports are CSV + JSON only | No printable statement or tax-year pack |
| 8 | Accessibility pass | `aria-*`/`role=` count in `index.html` and the views: **0** | Screen-reader and keyboard-only use is untested |
| 9 | i18n | English strings inline in views | One language |
| 10 | ~~Browser E2E tests~~ — **built 2026-10-06** | `scripts/ui-browser-test.js` + `npm run test:browser` (playwright-core, Chromium). 27 assertions incl. chart size, painted pixels, the method panel, the stack, all 11 views, console cleanliness. Still **dev-only**: `playwright-core` is installed with `--no-save` and the system libs (`libnss3`, `libatk*`, …) must be present, so it is not part of `npm run test:all` | Screenshots in `docs/` are only as fresh as the last run — a deployed build is not smoke-tested by this |
| 11 | Image → trade import (screenshot OCR) | — | Manual entry or CSV |

## 3. Shipped but incomplete

| Feature | What works | What is missing |
|---|---|---|
| **MTF entry execution** (new) | Live LTF fetch, confirmation status (`live`/`recent`/`waiting`/`rejected`), refined plan with targets re-ruled from the confirmation, one-click save to signals, grading on resolution. Measured 2026-10-06 11:58 UTC: highest win rate of any entry rule (47.4 % pooled vs 35.1 % base, 1 902 / 1 696 fills) but −0.268R of expectancy against the base rule on the same 1 503 setups, and the 321 setups it refused averaged +0.157R under the base rule — so the entry is executable, and the evidence says it is not the better trade | The confirmation itself is now watched by the scheduler (cron + notifications shipped) and a saved refined plan is graded on resolve; what is *not* solved is that a 50 %-at-T1 plan is graded as one blended number (scale-*in* is still missing, §3 journal row) |
| **TradingView** | Charts in Market/Bots, webhook alerts with token rotation, alert history, bot verdict per alert, "save refined plan" from an alert | No position/order sync; an incoming alert is stored + analysed but does **not** create a journal trade automatically |
| **Playlist coverage** | 40 episodes mapped: **27 ✔ fully implemented, 6 ◐ partial** ([PLAYLIST-CURRICULUM.md](PLAYLIST-CURRICULUM.md)) | The 6 partials are listed at the bottom of that document |
| **Prediction model** | Logistic regression trained in-process, calibrated buckets, `out_of_sample` block, measured gates (`stop_ge_06atr`, `runway3`) on every live setup | Per-market training sets are 60–250 resolved setups; no gradient boosting or alternative model families |
| **Tracked signals** | Save → resolve → self-grade with win rate/expectancy by grade, including refined MTF plans | Resolution is still triggered by a request: the daily `/api/cron/tick` resolves what it can, but there is no push, so a signal can sit unresolved until someone opens the app |
| **Journal** | CRUD, tags, mistakes, grades, adherence, MFE/MAE, calendar, analytics, import/export, **scale-out legs** (pct-weighted exit stored as JSON on the trade) | No **scale-in** (adding to a position), and the legs are for the journal side only — a bot plan is still saved as one row, so its 50 %-at-T1 result is graded as one blended number |
| **Instrument cost model** | Per asset class + 9 symbol overrides, per-trade cost in R, used by every bot table | Not editable in the UI (you can't enter *your* broker's spread/commission) and not wired to the journal's own `fees` column |
| **Risk tools** | Position sizing, guardrails, bootstrap Monte Carlo risk-of-ruin, **exposure clusters + heat**, **options calculator**, **prop-challenge tracker** | Clusters are hand-written groupings (a covariance matrix is not built), exposure is a snapshot of open rows rather than a live delta-weighted book, and options pricing needs you to supply IV |
| **Webhook security** | Per-token rate limit (240/h), rotation, rejection of unknown tokens | No HMAC signature (TradingView cannot sign), so the URL token is the only secret. `/api/cron/tick` is guarded by a shared `CRON_SECRET` compared in constant time-ish — one shared secret for the whole deployment, not per-user |
| **Backtest realism** | Walk-forward replay, per-instrument cost, break-even-first on ties, timeout exits, sub-noise stops refused | Fills assumed exactly at the limit price, stops exactly at the stop (no slippage/gap-through), no partial fills, no intrabar path resolution |

## 4. What the measurements cannot prove yet

1. **One regime.** The edge report replays ~2 000 bars per market (≈ 20–85 days depending on timeframe and
   provider caps). Crypto can be pushed further; FX/indices cannot. A 4 000-bar crypto re-run is next.
2. **MTF runs on a shorter window than everything else** — the lower timeframe caps it at 355–900 HTF bars
   per market ([MTF-REPORT.md](MTF-REPORT.md)), so its per-market rows are thin (16–131 paired setups) and
   only the pooled numbers are worth quoting. It also cannot be compared to the main edge report.
3. **Correlated samples.** The same zone is re-detected on consecutive bars; `--dedupe` collapses them, but
   the printed `n` is still "setups seen by this model", not independent market events.
4. **Bar-based MAE/MFE.** No tick data, so "how far it went against you" is a bar approximation.
5. **The top-down method has no forward test yet.** All 42 assertions are structural (hand-built
   candles + live payload shape). What the *method* earns — as opposed to what the entry model earns — is
   not measured: the harness replays the entry model, not "confirmed CRT ranges". Tracked signals now carry
   `method_state` so the ledger can be split later; until there are enough resolved signals the honest answer
   is that the method is implemented, not that it is profitable.
6. **The right candle is a heuristic.** "Reacted at a level" = traded into a mapped level and closed back
   away by ≥ 0.2 ATR. That tolerance is a choice, not a measurement; a stricter or looser one changes which
   candle gets marked. The level map is the app's own liquidity map, not a hand-drawn chart.
7. **Costs are class defaults, not your broker's.** Per instrument now (EURUSD 1h pays 0.216R round trip,
   gold 1h 0.025R), but a broker with wider spreads or a commission-free CFD account will differ — and
   `fees` typed into the journal is not yet reconciled against them.
6. **Two different bars, stated separately.** "Net win" (finished > 0 after costs) and "clean win"
   (finished ≥ +0.5R after costs) answer different questions, and the 70 % question only has a defined
   answer if you say which one. Measured 2026-10-06 11:59 UTC: 74.8 % train / 74.0 % test **net** wins at a
   0.25R target (−0.084R / −0.116R per trade, **0 %** clean); zero configurations ≥ 70 % **clean**; the
   profitable configurations win 35–42 %.
7. **The 70 % answer is scoped.** "A 70 % win rate and a positive expectancy were not both available" is a
   statement about **this entry model, on this data, under these costs** — not about SMC or the playlist
   in general.
8. **The pool drifts between runs.** Candle windows are anchored at "now", so each re-run of the harness
   sees a slightly different sample (11 411 unique setups at 11:57 UTC and 11 422 at 12:20 earlier the same
   day, same command and parameters). Read the number and the timestamp that live in the same file; do not compare
   a figure from one report against another report's date.
9. **`npm test` writes to the same database file** — it registers a throwaway `*@test.local` user per run
   and its rows live under that user, invisible to your workspace. 23 accumulated test users were removed
   on 2026-10-06 with their accounts/strategies/trades/signals; the suite does not clean up after itself yet.
10. **The two discretionary thresholds have not been swept.** `0.25 ATR` (noise floor) and
   `risk/range ≤ 2` were placed in measured gaps, not optimised — no walk-forward run says 2.0 beats 1.5
   or 3.0. Doing that properly needs the top-down method replayed as a strategy (see §4.5), which is the
   next measurement I owe.
11. **No live record yet.** `/api/bots/signals/stats` starts empty; every number in the app is historical
   replay until you save and resolve signals yourself.

## 5. Next, in the order I will take it

Everything register #5 asked for now exists in the tree, so this list is what is left, not what is half-done.

1. ~~MTF entry execution~~ — **shipped**, measured in [MTF-REPORT.md](MTF-REPORT.md).
2. ~~Measured gates in live scoring~~ — **shipped**, and now the default view (`full ★`) with the measurement
   printed under the chips (2026-10-06).
3. ~~4 000-bar stability run~~ — **shipped** 2026-10-06: eight markets, two halves, per-half numbers in
   [STABILITY-REPORT.md](STABILITY-REPORT.md). Verdict: only the flat-3R shape keeps its sign in both
   halves; the video-plan + gate combination flips **+0.18R → −0.55R** (n 43/35), so the gate set is
   regime-dependent and is labelled that way in the app.
4. ~~Options presets~~, ~~prop-firm packs~~, ~~exposure/heat~~, ~~notifications~~, ~~scale-out legs~~,
   ~~cron~~ — **shipped** this tick (see the table at the top for each verification line and each caveat).
5. ~~Correctional-bot adherence grading~~ — the bot has graded trades automatically since the first
   version (`autograde()` → score/grade/reasons, exposed at `GET /api/bots/correction`, `POST
   /api/bots/correction/backfill`, per-trade at `GET /api/bots/feedback/:tradeId`). **What is still missing:** a *plan-vs-execution* grade — whether the trade you actually logged obeyed the gates of the plan the app showed you (same direction, stop where the plan put it, target ≥ 3R, no re-entry after the failure). `POST /api/bots/signals/resolve` already grades the plan itself against real candles (seen live: signal 68 resolved to `no_fill` via the scheduler), but that needs the scale-in path in §3 before a scaled entry can be compared to a one-shot plan.
6. **Replay the top-down method as a strategy** — the one measurement this app still owes. `tests` cover
   the method structurally and every live read is honest, but "confirmed CRT ranges, entered at the
   confirmation / on the retest, stop beyond the sweep, target the opposite edge" has never been replayed
   bar-by-bar over thousands of setups the way the entry model was. That replay also settles §4.10 (the
   0.25 ATR floor and the risk/range ≤ 2 cut) on evidence instead of judgement. It is the next thing I
   will build.
7. ~~The TradingView renderer question~~ — **decided 2026-10-07: keep our own chart** ("keep this
   one"). No renderer swap. The desk chart stays the dependency-free canvas renderer over the market
   data, with the fixes in the table above (anchored overlays, the wheel released to the page, the
   drawing-tool suite); the full TradingView embed stays available in Market for anyone who wants
   TradingView's own toolbar. What that decision leaves on me is the maintenance of the overlays — a
   TradingView primitive would have done some of that work — and §4.5/§4.10 (the *method* still has no
   forward test) applies to this renderer's claims as much as any other.
8. **The honest next features, in the order I would build them**: the method replay above, then options
   data (a real chain — needs a paid source, so it may stay user-supplied), futures rollover (§2 #1),
   multi-currency P&L (§2 #2), a correlation matrix rather than named clusters (§3 risk tools),
   accessibility pass (§2 #8), PWA/offline (§2 #4), then screenshots (§2 #3) and OCR (§2 #11).

### 5b. Caveats added with the 2026-10-07 repairs

5b.1 **The bot now arms very few plans, and that is the honest reading.** With the repaired gate, the
   directional room check and the two quality filters, a live sweep of **350 symbol × timeframe combos
   (70 instruments, 5m–1d, 2026-10-07)** left **6 armed** — and three of those are below the default 1R
   floor and therefore flagged. The old board showed 16 armed of 110 with ten of them sub-1R, several of
   which were geometrically impossible (a 0.08R target 52 points above a stop 187.71 on a 4-point range).
   A quiet board is not a broken board: 136 reads are WAIT with a stated level to watch, 168 are NO TRADE.
   The discretionary thresholds (0.25 ATR noise floor, risk/range ≤ 2) are choices, and §4.11 says what
   would move them.
5b.2 **The R:R distribution of this method is unflattering right now.** Of the six armed plans, three pay
   **1.0–1.6R** and three pay **0.49–0.68R**. That is a property of CRT rotations on the instruments that
   currently qualify, not a modelling accident: the stop sits beyond the sweep and the target is the
   opposite edge, so the reward is the range minus the entry's distance from the edge. When the trader
   wants a 2R-or-better board, `min_rr=2` will show them the same plans marked in red rather than hiding
   them — which is the behaviour they chose.
5b.3 **The two fills coincide when price is already at the retest.** The plan prints the confirmation fill
   and the retest fill; if price is sitting on the swept edge, both rows carry the same number (UKOIL 5m
   was exactly that). This is information, not a bug, but a trader skimming the table may read it as a
   duplicate — the caption under the table says so.
5b.4 **The sweep used for the stop is the extreme of the window after the marked candle.** When the
   provider's history starts mid-move, or when the marked candle is very recent, that window is short and
   the extreme can be the current bar's own wick. The `risk/range ≤ 2` filter is what catches the cases
   where this pairing is nonsense; it does not make the pairing *correct*, only no-longer-absurd.
5b.5 **The same warning used to print twice.** The sub-floor notice was rendered as the order's own
   red block *and* repeated in the guard list below it (seen in the browser, 2026-10-07). It now appears
   once, directly under the order. The guard list keeps the news blackout and the personal rules.
5b.6 **Two test assertions were themselves wrong and were corrected, not bent.** (a) A top-down assertion
   demanded the "safer" entry sit between the confirmation and the target — the old defect laid out as a
   requirement; it now demands the taught geometry (better price, smaller risk, same target). (b) The
   bots suite compared an analysis fetched *now* against a chart fetched a whole section earlier and
   called the difference a bug; it now fetches both at the same moment (a live market read is not stable
   across twenty seconds).

### 5. Caveats added with the 2026-10-06 "now" call, replay and drawings

5.1 **The *now* call is a rule engine, not a price oracle.** It states one action and the level that
   would change it; it does not know whether price will get there. Every "armed" case names the stop
   that invalidates it. Nothing in the strip is a recommendation to risk money — the risk calculator
   and your own rules still decide size.
5.2 **Bar replay is bounded.** `trim` is clamped to 400 bars and requires at least 60 bars to remain,
   so a very old instant cannot be re-created from a single fetch; the level window is pinned to a
   fixed trailing slice (120 bias bars) so a replay is deterministic. On the 1h and shorter
   timeframes the provider re-stamps the forming bar on every fetch, which is why the
   analyse↔chart equality assertions are made on a daily bar.
5.3 **Drawings are per symbol and timeframe.** A trend line drawn on EURUSD 1h does not appear on
   EURUSD 15m (that is deliberate — different price scales), and they are stored in (time, price),
   so a timeframe change re-projects them rather than re-anchoring them to bars.
5.4 **The TradingView studies/indicator hook depends on TradingView.** The panel wires their embed
   API; if TradingView changes a study id, that chip stops loading in their widget. Our own chart
   and studies never depend on it.
5.5 **The method still has no forward test** (see §4.5) — the *now* call and bar replay are the
   instruments that make one possible: every read is dated, reproducible and auditable after the
   fact. As of 2026-10-06 it has not been run.
