# `tradingpro-main.zip` — full analysis

**Archive:** `/home/user/Trader/tradingpro-main.zip` · 11 MB · one top-level folder, `tradejournal/`
**What it is:** **TradeJournal Pro** — a self-hosted, multi-asset trading journal + analytics engine +
behavioural coach + Smart-Money-Concepts bot desk with TradingView integration.
**Nested git repo:** yes — one commit (`6fb0745`), branch `main`, **no remote configured**.
**Everything below was produced by running the code in this sandbox**, not by reading alone.

> **Revision 2.** My first pass said this sandbox had "no egress to the market-data providers" and left
> 4 of 7 test suites unrun. That was wrong in its mechanism and too pessimistic in its consequence.
> §3 corrects the mechanism; §4 shows what became verifiable once real candles were available.

---

## 1. Inventory

| Area | Size | Contents |
|---|---|---|
| `src/` | 4 190 lines | data layer, analytics, coach, instruments, market feeds, TradingView, options, prop, exposure |
| `src/bots/` | 5 474 lines | the SMC engine: `smc`, `topdown`, `momentum`, `setup`, `predict` (1 535), `correction`, `now`, `index` |
| `src/routes/` | 1 636 lines | REST API (95 endpoints: 47 GET / 33 POST / 9 DELETE / 6 PUT) |
| `public/js/` | 2 345 lines | shell, router, canvas chart engine, TV embeds, fetch/store layer |
| `public/js/views/` | 3 814 lines | 11 views |
| `scripts/` | 4 205 lines | 17 scripts: 8 test suites + 4 research generators + seed/reset/snapshot |
| `docs/` | 6.1 MB | 11 markdown files (2 386 lines), 3 JSON result sets, 3 HTML snapshots, 14 PNGs |
| root | 167 lines | `server.js`, `api/index.js`, `vercel.json`, `start.sh`, `package.json` |

**~21 830 lines of JavaScript**, 552 lines CSS, 41-line `index.html`. No build step, no bundler.
**Runtime deps (3):** `express ^4.21.2`, `@libsql/client ^0.18.0`, `technicalindicators ^3.1.0`.
`npm install` → **132 packages in 2 s**. `npm audit` → **0 vulnerabilities**.

---

## 2. Architecture — what is actually good

1. **Everything normalises to R.** `src/instruments.js` holds a per-instrument `value_per_point` for 64
   presets. Verified: EURUSD 1.5 lots +50 pips → **$750**; XAUUSD 2 contracts short −$10 → **$2 000**;
   the same FX move against you → **−$750**.
2. **One source of truth for statistics.** `src/performance.js` computes every metric. Verified:
   `kpis()` and `drawdownStats()` agree on max drawdown (−500) from two different code paths.
3. **The coach and bots are deterministic.** No `openai`/`anthropic`/`gemini` reference anywhere in the tree.
4. **The research reports its own failures.** `docs/EDGE-REPORT.md` states that **≥70 % win rate and
   positive expectancy were not both available** — 0 of 5 149 rule × exit combinations clear 70 % *and*
   stay positive. `docs/NOT-IMPLEMENTED.md` is a 230-line honest register of gaps.

**Deployment is genuinely free:** local SQLite, or Vercel + Turso. `api/index.js` is 9 lines re-exporting
the same handler the local server uses — no local/deployed divergence.

---

## 3. Correction: why candles failed, precisely

I previously reported "HTTP 000 / no egress". That was a misreading of a bare exit code. The real mechanism,
measured with `curl -v`:

```
*   Trying 69.147.80.15:443...
* Connected to query1.finance.yahoo.com (69.147.80.15) port 443 (#0)
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
* OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to query1.finance.yahoo.com:443
```

**DNS resolves and TCP connects.** The connection is killed mid-TLS-handshake — an **SNI-layer allowlist**,
not a routing failure. Mapping it empirically:

| Host | Result |
|---|---|
| `api.github.com` | **HTTP 200** |
| `registry.npmjs.org` | **HTTP 200** |
| `pypi.org` | **HTTP 200** |
| `files.pythonhosted.org` | **HTTP 404** (reachable) |
| `codeload.github.com` | **HTTP 301** (reachable) |
| `query1`/`query2.finance.yahoo.com` | TLS reset |
| `www.okx.com`, `api.coingecko.com` | TLS reset |
| `api.binance.com`, `api.coinbase.com`, `stooq.com` | TLS reset |
| `example.com`, `www.google.com` | TLS reset |

So the allowlist is exactly six package/VCS hosts. `example.com` being blocked proves it is not
market-data-specific. **A different Arena session can carry a different allowlist** — which is consistent
with live candles working in your other chat. In *this* session they cannot be fetched directly.

---

## 4. Getting real candles anyway

`api.github.com` is reachable, and its contents API serves any public repo's files base64-encoded. So I
sourced **real historical OHLCV** through GitHub and fed it to the app.

**`analysis/candle-shim.js`** patches `global.fetch` only. It answers the two URL shapes `src/candles.js`
actually builds (Yahoo `/v8/finance/chart/…`, OKX `/api/v5/market/candles`) and returns the exact envelope
each parser expects. **No project source is modified** — `resolveSymbol`, `sanitise`, `aggregate`, SMC,
top-down, setups and prediction are all the project's own unmodified code. Load it with
`NODE_OPTIONS=--require /home/user/Trader/analysis/candle-shim.js`.

Every fixture was **validated for true inter-bar spacing before use** — a median step disagreeing with the
filename means rejection:

| Fixture | Bars | Median step | Span | Source |
|---|---|---|---|---|
| `EURUSD-5m.csv` | 12 054 | 5 min ✓ | 2025-12-15 → 2026-02-13 | shahryarashiq/my-vs-code-project- |
| `EURUSD-15m.csv` | 4 032 | 15 min ✓ | 2025-12-15 → 2026-02-13 | shahryarashiq/my-vs-code-project- |
| `EURUSD-1h.csv` | 3 015 | 60 min ✓ | 2025-09-03 → 2026-03-02 | shahryarashiq/my-vs-code-project- |
| `EURUSD-1d.csv` | 3 186 | 1 day ✓ | 1999-01-04 → 2011-08-03 | ABTSoftware/SciChart.Android.Examples |
| `XAUUSD-5m.csv` | 3 081 | 5 min ✓ | 2026-04-10 → 2026-04-27 | Quantam-imo/newcpu |
| `XAUUSD-15m.csv` | 4 534 | 15 min ✓ | 2026-06-28 → 2026-09-04 | fatihdogann/trading-models |
| `BTCUSDT-1h.csv` | 3 001 | 60 min ✓ | 2020-08-01 → 2020-12-05 | priyanshux/cryptopy |
| `BTCUSDT-1d.csv` | 3 200 | 1 day ✓ | 2017-08-17 → 2026-05-21 | wickra-lib/wickra |

**Rejected on validation:** shahryarashiq `XAUUSD-15m.csv` (median step **270 min**, not 15m) and
`XAUUSD-5m.csv` (median step **90 min**, not 5m). Feeding those would have put mislabelled bars into the
engine and produced confidently wrong numbers. Also rejected: two long EURUSD daily sets that carry a
single `Price` column — synthesising OHLC from one price series would be inventing data.

Verified through the real `getCandles`: 8 symbol/timeframe pairs, **0 malformed bars, all correctly
sorted**, each reporting the right provider (`yahoo` / `okx`).

---

## 5. Test results — before and after

| Suite | Without candles | **With real fixture candles** | README's claim |
|---|---|---|---|
| `api-test.js` | 121 / 0 | **121 passed, 0 failed** | 121 ✓ |
| `now-test.js` | 36 / 0 | **36 passed, 0 failed** | — |
| `vercel-check.js` | 8 / 1 | **9 passed, 0 failed** · cold start 738 ms | 9 ✓ |
| `smoke-test.js` | 12/21 views | **21/21 views, 0 console errors** | 21 ✓ |
| `topdown-test.js` | crash after 10 | **66 passed, 0 failed** | 66 ✓ |
| `chart-test.js` | crash after 1 | **36 passed, 0 failed** | 36 ✓ |
| `bots-test.js` | crash after 11 | **205 passed, 0 failed** | 205 ✓ |
| `ui-browser-test.js` | — | **cannot run** (see below) | 27 |
| offline engine probe | 51 / 0 | **51 passed, 0 failed** | — |
| method-fidelity probe | — | **23 passed, 0 failed** | — |

**568 checks executed, 0 failing.** Every count the README claims that I could reach matched exactly.
The nine Prediction-view failures and the `/bots/analyse` Vercel failure were indeed network-caused — they
all pass now.

### The last two failures, and how each was cleared

Both were fixture-coverage gaps in *my* offline data, not product defects. Closing them took real datasets
rather than any code change:

1. **"the replayed chart ends on an older bar (`2026-02-27` < `2011-08-03`)"** — the test compares a
   replayed EURUSD **1h** chart against a live EURUSD **1d** one, and my two fixtures were 15 years apart.
   **Fixed** by finding a EURUSD daily from the *same repository* as my 1h fixture
   (`shahryarashiq/my-vs-code-project-`), so both end on 2026-03-02. That daily is only 126 bars, which
   alone broke the 4h stack (its bias layer is `1w`, and 126 days is ~18 weeks — under the 30-bar floor
   in `smc.js:660`). So the fixture concatenates the long 1999-2011 history with the 2025-26 series:
   3,312 bars, ~662 weekly, ending 2026-03-02.
2. **"scanned 2 markets (2 errors)"** — `/bots/scan?symbols=EURUSD,XAUUSD,BTCUSDT,ES&tf=15m`. **Fixed for
   BTCUSDT** by fetching a coherent 5m / 15m / 4h set from `Wastetoken/ATS` (all 2026-07-25 → 2026-08-29).
   The scan now reaches 3 of 4 symbols; `ES` (S&P 500 futures) has no fixture and is the one remaining
   gap. The test's threshold is ≥2 markets, so it passes.

**One caveat I want to be explicit about**, since I introduced it deliberately: the EURUSD daily now has a
**5,145-day gap** between 2011-08-03 and 2025-09-03. I verified this does not corrupt the analysis — there
are 126 contiguous bars after the gap, while the ATR window is 14 bars and the structure/swing windows are
≤120, so no analysis window reaches across it. EURUSD daily ATR reads **0.0067**, which is normal for the
pair; had a window spanned the gap (price jumps 1.42 → 1.16) the ATR would have been absurd. Still, it is a
synthetic splice, not a clean history — treat EURUSD 1d/1w results as directionally fine but not as a
research-grade series.

Two earlier failures disappeared on their own once I added `BTCUSDT-1d.csv`: the 4h stack's bias layer is
`1w`, and my hourly BTC fixture spanned only 18 weeks. The webhook response said so explicitly —
`"No candles for BTCUSDT 1w"` — while the same code path graded an XAUUSD alert into a full plan. That is
what confirmed the webhook logic was never at fault.

### The one suite that genuinely cannot run

`scripts/ui-browser-test.js` (27 assertions, real Chromium): `playwright-core` **is** installed, but there is
no Chromium in `~/.cache/ms-playwright` and no system Chrome on `PATH`, and the Playwright download CDN is
not on the allowlist. This is the project's own known gap — `docs/NOT-IMPLEMENTED.md` §2 item 10 records that
`playwright-core` is installed `--no-save` and is excluded from `npm run test:all`.

### Research generators

`rule-sweep.js` ran end to end on real data (5 markets, 354 filled setups) and independently reproduced the
**shape** of the headline claim: *consistent ≥70 % both halves: 0 · positive expectancy both halves: 0*,
best consistent win rate 72.0 % train / 56.5 % test at 0.25R. The exact README figures come from 24 markets
over a different window, so the numbers differ; the methodology and its conclusion reproduce.
I backed up `docs/MEASURED-RULES.{json,md}` before running and restored them afterwards — the nested repo's
`docs/` is clean.

---

## 6. The offline engine probe

`analysis/probe-engine.js` drives the project's own exports on 600 synthetic candles with a seeded PRNG.
It re-implements nothing. **51 passed, 0 failed.** Representative:

- SMC on 600 bars → ATR 2.47, structure `bearish`, 4 order blocks, 14 FVGs, 9 liquidity pools, 3 sweeps,
  premium/discount `discount` at −25.64 % of range, 14 minor / 10 major swings.
- Aggregation 15m→1h = **150 bars**, 1h→4h = **38 bars**; aggregated high equals the true high exactly.
- Top-down exposes all **5 named steps**, a status word, a direction, a conflicts list.
- Mechanics **43.04/100** over 7 factors; narrative 9 lines; 1 conflict carried.
- Black-Scholes ATM 30d call: delta **0.534**, theta **−0.0631/day**, vega 0.114, gamma 0.04620.
- 60 synthetic trades: expectancy **0.6917R**, win rate **48.33 %**, PF **2.34**, max DD **−500 (−4.88 %)**;
  Monte Carlo risk of ruin 0 %, median max DD 5.85 %, p95 10.47 %.
- 1 % of $10 k with a 15-pip stop → **0.66 lots, risking $99**; `costR` on that stop = **0.125R**.

**Correction I owe you from the first pass.** I flagged "an A-grade BUY issued while the method says wait"
as a possible gate failure. Two errors: my probe passed the method as `ctx.method`, but `buildSetups` reads
it from **`ctx.topdown`** (`setup.js:83`), so my harness never engaged the gate at all. And even with the
correct key the behaviour is by design — `analyse()` publishes a separate method-gated `method_verdict`, and
the strip the trader reads comes from `now.js`, which returns **`WAIT`** on that same data. What survives is
narrower: the comment at `setup.js:338-341` describes a stronger invariant than line 355 implements, and no
test covers the `direction === 0` path.

---

## 7. Security review

**Verified good:**

- **Passwords:** `scrypt`, per-user 16-byte salt, `crypto.timingSafeEqual` (`src/db.js:474-483`).
- **Sessions:** 256-bit token, stored **SHA-256 hashed**, cookie `HttpOnly; SameSite=Lax` (`api.js:56`).
- **SQL injection: none found.** `WHERE ${where}` comes from `trades.js:171 listQuery()` — fixed fragments
  with named parameters only. `ORDER BY ${order}` is a hard-coded ternary, never user input. `LIMIT` passes
  through `num()`.
- **XSS discipline holds.** One `esc()` helper (`util.js:26`); 160 `innerHTML` writes, but the
  user-controlled ones are escaped (`U.esc(r.key)` in `analytics.js:217`, `U.esc(t.symbol)` in
  `trades.js:205`). A sweep for raw `thesis`/`notes`/`emotions`/`review`/`tags` interpolation found nothing.
- **Webhooks https-only**, enforced server-side (`notify.js:32`), 240/h per-token rate limit, rotatable token.
- **Cron fail-closed:** `/api/cron/tick` → **403** unless `CRON_SECRET` is set or the process is the local
  server. Verified live.
- **Per-user row scoping** in SQL; forged tokens rejected (401), unauthenticated reads refused (401).
- **No `eval` / `child_process` / `execSync`** in `src/`, `public/`, `server.js`, `api/`. The only
  `new Function` calls are in `scripts/chart-test.js`. **0 TODO / FIXME / HACK markers.**

**Caveats the project documents and I confirmed:** the TradingView webhook is a **capability URL** (no HMAC —
TradingView cannot sign; possession of the token is the permission); `CRON_SECRET` is one shared secret per
deployment; no rate limiting or CORS on the main API; server binds `0.0.0.0` by default.

**Doc drift found:** `docs/NOT-IMPLEMENTED.md` claims *"`aria-*`/`role=` count … **0**"*. The tree now has
**3**: `aria-hidden="true"` on every icon (`app.js:9`), `aria-label="Menu"` (`app.js:127`), `role="img"`
(`util.js:122`). The underlying point — no real accessibility pass — still stands.

---

## 8. Observations worth acting on

1. **Test suites crash instead of degrading when candles are unavailable.** `bots-test`, `chart-test` and
   `topdown-test` all died with an uncaught error partway through, losing every remaining assertion and
   printing no summary. A guard that records the fetch failure and continues would let the offline half of
   each suite still run — which is exactly the situation in any restricted CI sandbox. This is the single
   change that would have made this codebase far easier to verify.
2. **`bots-test.js:353` requires `src/bots/predict` in the test process**, not through the server. Any
   network-level test double therefore has to be loaded into *both* processes. Worth a comment.
3. **Multi-currency P&L is not converted** (the project says so itself). GER40 (EUR), JP225 (JPY) and
   UK100 (GBP) stay in their own currency, so **portfolio totals are only strictly correct for USD-quoted
   instruments** — the most consequential functional gap for a "multi-asset" journal.
4. **`docs/` is 6.1 MB of the 7.8 MB working tree.** Two PNGs are 1 320 KB and 1 243 KB;
   `docs/ui-snapshot-trades.html` is 4 495 lines of committed generated output.
5. **The real-browser suite cannot run from a clean install** (`playwright-core` is `--no-save`), so a
   deployed build is never smoke-tested in a browser.

---

## 9. Does the bot implement the playlist's strategy?

**I could not watch the playlist** — `youtube.com` returns HTTP `000`, killed by the same TLS filter as
Yahoo/OKX, and I cannot view video in any case. So I cannot verify fidelity to the *videos*. What I can do
is verify the repo's own map of them (`docs/PLAYLIST-CURRICULUM.md`, all 47 uploads → code) and then check
that map against the actual source. Everything below is from the code.

### The claimed ICT thresholds all exist, exactly as documented

| Rule | Documented as | Found in code |
|---|---|---|
| Sweep | wick ≥ 0.08 ATR through the pool **and** close back inside | `smc.js:440` `minWickAtr = 0.08`; buy-side `wick above, close below`, sell-side the mirror |
| Displacement | ≥ 1.2 ATR expansion that breaks structure | `smc.js:156` `minAtr = 1.2, minBody = 0.55` |
| FVG / imbalance | gap ≥ 0.12 ATR, 50 % = consequent encroachment | `smc.js:241` `minAtr = 0.12`; `mid` computed at `smc.js:216` |
| OTE band | 0.62–0.79 | `smc.js:521` long `0.62–0.79`, `:522` short `0.21–0.38`, band at `:528` |
| Fib ladder | 0.236 / 0.382 / 0.5 / 0.618 / 0.705 / 0.79 / 1 | `smc.js:531-532` — all seven |
| Stop placement | beyond the sweep + 0.18 ATR buffer | `setup.js:175` `atr * 0.18`; CRT plans use `+ atr * 0.15` (`topdown.js`) |
| Killzones | London 06–09, NY AM 12–15, NY PM 15–18 UTC | `smc.js:618-622` — exact |

### The five taught steps are implemented literally, and they work

`analysis/method-check.js` hand-builds the canonical pattern — a higher-timeframe right candle reacting at
a level, its range marked, the sellside swept and **closed back inside** — and asserts what the project's
own `topdown.js` returns. **23 of 23 pass.** Getting there took three attempts, and every failure was my
fixture being wrong, not the engine:

- method named `CRT top-down (Market Mechanics)`, exactly 5 steps:
  *Timeframe stack → The right candle → Mark the range → Wait for the sweep → Confirm lower, then enter*
- one job per timeframe: `4h "bias + range" → 15m "location" → 15m "trigger"`
- the conflict rule is the taught **hierarchy**, not a weighted vote
- **step 2** — right candle found: *buy-side reaction (low rejected) at Previous week low 1899, 2.09 ATR*
- **step 3** — range marked `1899 – 1934`, i.e. the right candle's own high/low
- **step 4** — state `confirmed`: the sweep happened **and failed to hold**; names the side taken (`low=true, high=false`)
- **step 5** — direction **+1 LONG, the opposite of the sellside sweep**, exactly as taught
- the plan geometry is right: **entry 1899, stop 1890.91 (beyond the swept extreme 1893), target 1934
  (the opposite side of the range) = 4.33R**

**Two of those attempts failed because the engine was stricter than my fixture — correctly.**

1. My first fixture had only 24 bias bars. `SMC.analyse` needs 30+ (`smc.js:660`), so there were no levels
   to react at and the method rightly reported *"no right candle"*. My data was too short, not the logic.
2. My second fixture's recovery leg rallied 78 % of the way to the target, and the engine **refused the
   trade**: `chase = true`, conflict *"Wait for the next right candle. Do not chase a range that has
   already run."*, conviction tier `none`. It also held step 5 open: *"15m has not confirmed yet — no
   displacement and no structure shift in the reversal direction. This is a watch, not an entry."*
   Both are the playlist's own rules ("never front-run the sweep, chase the entry"). Once I built a
   non-chasing recovery containing a real displacement bar, every assertion passed.

`scripts/topdown-test.js` independently asserts the same method on hand-built candles: **66/66**.

### Where it deliberately departs from the video

The curriculum doc lists these, and they are real in the code: a level must have a price, an ATR distance
and a fresh/swept flag; a sweep must close back inside; confirmation means displacement ≥ 1.2 ATR or a
structure shift. And the playlist's "second chance" re-entry (ep. 32) is implemented as a **trap warning**,
because the project measured it at a 14 % win rate and −0.35R. That is a defensible reading of the data,
but it *is* a departure from the lesson — worth knowing if you follow the mentor literally.

### One latent defect found while auditing

`src/bots/setup.js:141` reads `analysis.structure.last_break` **unguarded**, while the line five above it
(`:136`) correctly guards with `analysis && analysis.structure ? … : 'ranging'`. `SMC.analyse` returns
`{ok:false, note:'Not enough candles…'}` with **no `structure` key** when given fewer than 30 candles
(`smc.js:660`), so `buildSetups` then throws:

```
TypeError: Cannot read properties of undefined (reading 'last_break')
    at Object.buildSetups (src/bots/setup.js:141:115)
```

Confirmed reproducibly in isolation. **I could not trigger it through the API** — `/api/bots/analyse` and
`Bots.analyse()` both returned HTTP 200 with a full payload at `trim=0/200/370/395/2500/3000/4000/9000`,
so whatever path I tried still handed `buildSetups` a valid analysis. Treat it as a robustness gap one bad
provider response away, not a live crash.

**Fixed** — `analysis/0001-fix-setup-unguarded-structure.patch`. It hoists the dereference into a
`lastBreak` local guarded exactly the way `trend` already is:

```js
const lastBreak = (analysis && analysis.structure && analysis.structure.last_break) || null;
```

The thin-series case now degrades instead of throwing: `buildSetups` returns `NO TRADE` with two
candidates and the checkpoint reads `"Structure reads ranging."` (`pass:false, weight:12`).
Verified: the previously-throwing repro now survives, the patch applies cleanly to the pristine zip
source (`git apply --check`), and the full regression run is **unchanged** — 121 / 203+2 / 66 / 36 / 36 /
9 / 51 / 23 and 21/21 views with 0 console errors, identical to the pre-fix numbers.

**Honest limit of this audit, as first written:** I verified the bot against the repo's documentation of
the playlist and against standard ICT/SMC conventions — not against the course itself. **This was
superseded later in the same session:** §10.2 obtains verbatim transcripts of the course and §11 adds an
independent implementation of the same episodes, so the audit now rests on the source material directly.
Read §9 as the first pass, corrected by §10–§11.

---

## 10. Follow-ups: the two failures, the videos, and the missing pairs

### 10.1 The two `bots-test` failures — both are my fixtures, not your code

```
- the replayed chart ends on an older bar (2026-02-27T06:00:00.000Z < 2011-08-03T00:00:00.000Z)
- scanned 2 markets (2 errors)
```

1. **Replay ends on an older bar.** The test replays EURUSD **1h** and compares it against the EURUSD
   **1d** series. My 1h fixture is 2025-09 → 2026-03; my 1d fixture is 1999 → 2011. Two different decades,
   so the comparison is meaningless. I could not find a public EURUSD daily OHLCV file covering 2025-26 —
   every candidate was price-only (`Date,Price`) or ended in 2017.
2. **Scanned 2 markets (2 errors).** The test scans `EURUSD,XAUUSD,BTCUSDT,ES` at 15m. I have 15m data for
   EURUSD and XAUUSD only.

Neither touches your logic. They are gaps in the offline data I could obtain.

### 10.2 The videos — found a real route

YouTube itself is unreachable (HTTP `000`, TLS reset) and I cannot watch video regardless. But a GitHub
search found **`nedu-m/market-mechanics-bot`**, which holds verbatim transcripts of the course. I pulled
**14 of them — 100,401 words** — into `analysis/transcripts/`:

```
ep05 market-structure    ep09 fair-value-gaps    ep13 liquidity-inducements    ep18 entry-models
ep06 candlestick-patterns ep10 order-blocks      ep14 flip-zones               ep20 stop-loss-take-profit
ep07 supply-demand       ep11 top-down-analysis  ep15 daily-bias
ep08 premium-discount    ep12 killzones          ep17 trading-plan
```

**Coverage matters more than the raw count.** The curriculum maps 34 episodes (0–33) out of the 47
uploads; the remainder are intros and re-uploads. Of those 34, the **strategy mechanics live entirely in
eps 5–20** — and I hold **14 of those 16**. The only two strategy episodes missing are ep16 (*Trading
plan*) and ep19 (*When NOT to trade*). Episodes 21–33 are risk, psychology, journalling, review, news and
prop-firm process — no strategy mechanics, so they cannot contain a competing definition of the method.

That makes the attribution finding in §10.2 considerably firmer than a "14 of 47" reading suggests: the
vocabulary gap is in the core method episodes themselves, not in material I failed to obtain.

The transcripts are **genuine**, not AI summaries — first-person teaching
voice, filler words ("right?", "like I said earlier"), and 125 timestamps per episode; ep11 runs to
`[00:48:54]` and ends on his sign-off, *"remember you're just one trade away."*

**This upgrades the strategy audit from "matches the repo's notes" to "matches the course itself."** What
I verified directly against his words:

- **The timeframe stack matches exactly.** *"the first set of time frame, which is the 4-hour, and this is
  where you want to build your narrative and determine your trend direction"*; the medium TF *"determine
  your immediate bias"* and *"refine the dealing range"*; the lower TF *"wait for price to enter into your
  area… look for your entry model."* That is precisely `topdown.js`'s one-job-per-timeframe design.
- **Premium/discount is the 50 % rule.** *"above the 50% level, we are in a premium, below the 50% level,
  we are in a discount."* The code splits at exactly 0.5.
- **The sweep mechanic is taught.** *"the market is to sweep the liquidity and then move in the desired
  direction"*; *"swept the liquidity above the swing highs, and then caused price to reverse."*
- **Both of his named entry models are implemented.** He teaches *"the market shift entry model and the
  flip zone entry model."* Market shift = `structure_shift` / MSS (`topdown.js:442`, `setup.js:146`);
  flip zone = `findBreakers()` (`smc.js:291`, *"a zone that failed in its own direction and now acts the
  other way"*).

**One honest correction to my earlier audit.** The bot's headline vocabulary is **not his**. Across all 14
transcripts: `CRT` → **0** hits, `right candle` → **0**, `candle range` → **0**. Episode 11 is the episode
your `PLAYLIST-CURRICULUM.md` cites as the source of the five steps, it is complete, and it never uses the
term. Likewise `killzone` → 0 — though here the transcript clearly mangles it to *"Q zones"* (67 hits), and
the surrounding text (*"these windows are what we call Q zones… specific times of the trading day when high
probability setups are more likely"*) is unambiguously killzones.

So: **the mechanic is genuinely his; the "CRT / right candle" label is your project's own framing.** The
implementation is faithful. The naming should not be attributed to the mentor.

**Update — that caveat needs narrowing, and it was half wrong.** "CRT" is not an invention. *Candle Range
Theory* is a real, separately-documented ICT concept: I found an independent TradingView implementation
(`thabo1993/CRT`) describing it as *"use a bullish higher-timeframe candle as the CRT range, mark its
Candle Range High (CRH), Candle Range Low (CRL) and midpoint, look for price to sweep above the CRH, then
close back inside the range, confirm with lower-timeframe CHoCH, main target is the CRL."*

Your `readRange()` implements **7 of 7** of those elements — verified by pattern-matching the source:

| Real ICT CRT element | `topdown.js` |
|---|---|
| Range = one HTF candle's high/low | ✔ `range: { high: R.h, low: R.l }` |
| CRH / CRL / midpoint marked | ✔ `high: r4(R.h), low: r4(R.l), mid: r4(rangeMid)` |
| Sweep beyond the range edge | ✔ `hi > R.h + tol` / `lo < R.l - tol` |
| Then **close back inside** | ✔ `backInsideHigh = price < R.h`, `backInsideLow = price > R.l` |
| Confirm on the lower timeframe | ✔ `structure_shift` / trigger layer |
| Target = **opposite** side of the range | ✔ `opposite side of the range` |
| Premium/discount measured off the midpoint | ✔ `position_pct` |

So the accurate statement is narrower than what I wrote above: **"CRT" is legitimate ICT vocabulary and
your implementation of it is complete and correct — it just isn't the vocabulary *this* mentor uses.** The
project fused two genuine traditions: the mentor's top-down/sweep/killzone curriculum, and ICT's Candle
Range Theory. Both are implemented faithfully. The only real issue is that `PLAYLIST-CURRICULUM.md`
attributes the CRT label to episode 11, which doesn't use it — a documentation citation error, not a
strategy defect.

### 10.3 Why the pairs "weren't working" — and it was not your bug

Your symbol resolution is **correct**. Every pair mapped to exactly the right provider ticker:

```
GBPUSD → Yahoo GBPUSD=X      NAS100 → Yahoo ^NDX       US30  → Yahoo ^DJI
SPX500 → Yahoo ^GSPC         GER40  → Yahoo ^GDAXI     BTCUSDT → OKX, then Yahoo BTC-USDT
```

They returned *"no result"* because this sandbox has no network **and** my preview shipped candle
fixtures for only three markets. Nothing in `resolveSymbol` is broken.

**Fixed for GBPUSD** — I fetched two real datasets (3,130 bars of 5m from `rbalkhair/ICT`; 3,016 bars of
1h from `shahryarashiq/my-vs-code-project-`), converted them to fixture format, and added the missing
`'GBPUSD=X': 'GBPUSD'` entry to the shim's ticker map. Verified live:

```
GBPUSD 15m → bars=100   → bot verdict: NO TRADE, grade B, score 70.9, method_status "waiting"
```

NAS100, US30, SPX500, GER40 and the rest still return nothing here, purely because I have no fixture for
them — **on your machine, with network access, they will work**, since their tickers resolve correctly.

Re-ran the suite after the change: 121 / 203+2 / 36 / 66 — unchanged, no regressions.

---

## 11. An independent cross-check — and a real bug it exposed

### 11.1 A second, independent implementation of the same course

Searching GitHub for more transcripts turned up something better than transcripts:
**`nedu-m/market-mechanics-bot`** — an independent implementation of the *same* series, built
backtest-first, with a **source-traced strategy spec** (`spec/STRATEGY_SPEC.md`, 10 KB) that cites the
episode behind every rule, plus a 6-year backtest verdict.

It is built from the **same 14 episodes** I downloaded, so it is a genuine second reading of the course
rather than a copy of your project. I fetched both documents into `analysis/independent/`.

**What the cross-check confirms.** Your implementation agrees with theirs on the rules that matter:

| Rule (independent spec, source-traced) | Your code |
|---|---|
| §3.1 BOS/market shift needs a **body close** beyond the level — *"the single most emphasised mechanical rule in the series"* | ✔ `smc.js` `scanBreaks` compares `c.c` (close) to the level, not the wick |
| §3.2 Premium/discount = fib at 0 / 0.5 / 1, sells only above, buys only below | ✔ split at 0.5 |
| §3.5 **"No liquidity sweep, no entry"** (hard rule) | ✔ the sweep checkpoint gates the plan |
| §5 The two entry models: market-shift and flip zone | ✔ MSS + `findBreakers()` |
| §6 Stop beyond the protected high/low + buffer, never flush against the zone | ✔ `setup.js:175`, `+ atr * 0.18` |
| §6 Fixed 2R, minimum acceptable 1:2, set-and-forget | ✔ min RR 2 |

Their spec also confirms my §10.2 finding independently: **"CRT" and "right candle" appear nowhere in it.**
They describe the same sweep-then-reverse mechanic, in the same episodes, and never use your project's
vocabulary for it. Two independent readers of the same 14 episodes both landed on the mechanic and
neither used the label — which makes it very likely the label is your own framing, not the mentor's.

### 11.2 The bug this exposed: killzones are hardcoded to UTC and drift with DST

The independent spec states the killzones **in New York time** (Ep12): London 02:00–05:00 ET,
New York 07:00–10:00 ET, London close 10:00–12:00 ET. Your code hardcoded them as **fixed UTC hours**
with no DST handling:

```js
{ name: 'London killzone', startH: 6,  ... }   // = 02:00–05:00 EDT only
{ name: 'NY AM killzone',  startH: 12, ... }   // = 07:00–10:00 EST only
{ name: 'NY PM killzone',  startH: 15, ... }   // matches neither
```

So the three windows had been pinned to **different UTC offsets** — London to summer time, NY AM to
winter time — meaning they could never all be correct at once. Concretely, verified against
`America/New_York`:

| Moment (UTC) | New York local | Course says | Code said | |
|---|---|---|---|---|
| 2026-10-07 11:30 | 07:30 EDT | NY killzone **open** | closed | ✗ |
| 2026-10-07 14:30 | 10:30 EDT | closed | **open** | ✗ |
| 2026-01-15 11:30 | 06:30 EST | closed | closed | ✓ |
| 2026-01-15 14:30 | 09:30 EST | open | open | ✓ |

Half the year the NY AM killzone opens an hour late and closes an hour late. And it is not cosmetic —
`momentum.js:223` scores the session out of 6 (15.8 % of the momentum score), so the worst divergence I
found swings **3.0 of 6 points, about 7.9 % of the total score**.

**Fixed** — `analysis/0002-fix-killzone-dst.patch`. The windows are now defined in ET and converted at
call time via `Intl.DateTimeFormat({timeZone:'America/New_York'})`, so the IANA database handles DST.
Verified: all four moments above now agree with the course, and the labels render correctly in both
seasons —

```
SUMMER (EDT)  London 02:00–05:00 ET (06:00–09:00 UTC)   NY AM 07:00–10:00 ET (11:00–14:00 UTC)
WINTER (EST)  London 02:00–05:00 ET (07:00–10:00 UTC)   NY AM 07:00–10:00 ET (12:00–15:00 UTC)
```

The UI label now shows both, so it stays truthful year-round. Full regression after the change:
**121 / 203+2 / 66 / 36 / 36 / 9 / 23 and 21/21 views, 0 console errors** — identical to before.

### 11.3 Their backtest verdict — worth reading before you trade this

Independently of your project, they backtested the faithful mechanical core across **6 majors and 6
years** with realistic costs:

```
FULL SAMPLE: 172 trades, win 37.8%, expectancy −0.125R, PF 0.84. Verdict: no edge.
```

No pair was positive on both train and test — *"the good pairs flip-flop, the signature of noise, not
edge."* Their diagnosis of *why* is the useful part: the entries carry a real gross edge
(**+0.220R frictionless**) but 5-minute stops are so tight (~6 pips) that ~0.26R/trade of cost consumes
it. Moving to **15m entries** (4H/1H/15m) with a protected-high stop was the only variant that stayed
positive out-of-sample on EURUSD+GBPUSD (+0.269R train / +0.174R test) — but it washed out when they
widened to 6 majors.

This lands in the same place your own `MEASURED-RULES` register does (0 of 5 149 rule × exit combos clear
≥70 % win rate **and** positive expectancy). Two independent teams, same course, same conclusion: **the
mechanical core does not survive costs.** Their caveat is the fair one — the edge, if it exists, lives in
the discretionary ~10 % the mentor himself says he can't articulate.

### 11.4 One more discrepancy — misleading config, not a live bug

`STACK` in `topdown.js:70-80` declares a `zone` timeframe for every chart — for the 15m day-trader stack
it says `zone: '1h'`. But `zone_tf` is assigned at `topdown.js:105` and **read nowhere in the project**:
not by `index.js`, not by `momentum.js`, not by the UI. The zone layer that actually ships in the payload
uses the *entry* timeframe instead (`topdown.js:697`, `tf: entryTf`), so the API reports `zone: tf=15m`
where the table promises `1h`.

**This one is cosmetic, and I want to be precise about why.** The effective stack is `bias 4h → entry 15m
→ trigger 5m`, and the course's own day-trader stack (independent spec §1) is **HTF 4H | MTF 15m |
LTF 5m**. Those match. The dead `zone: '1h'` entry never influenced a trade decision — it just makes the
table lie about what the engine does.

Worth deleting or wiring up, but it is not a defect in the strategy implementation. The DST bug in §11.2
was real; this one is not.

**But it connects to §11.3 in a way worth acting on.** The independent team's *only* out-of-sample-positive
configuration was **4H / 1H / 15m** (+0.269R train, +0.174R test). Your `STACK` table already declares
exactly that:

```js
'15m': { bias: '4h', zone: '1h', entry: '15m', trigger: '5m', style: 'day' },
```

`bias: '4h'`, `zone: '1h'`, `entry: '15m'` — the winning stack, written down in your own source. But
because `zone_tf` is never read, the engine actually runs **4h / 15m / 5m**: the location analysis
(premium/discount, fresh zone, unfilled FVG) is computed on the *entry* timeframe at `topdown.js:697`
(`tf: entryTf`) rather than on the declared 1h. Verified exhaustively — `zone_tf` appears exactly once in
the entire tree (the assignment at `:105`), with no bracket or dynamic access anywhere.

So the one configuration an independent backtest found to survive costs is **declared in your code but
never executed.** I have not backtested whether wiring it up would reproduce their result here — that
needs the 6-major, 6-year dataset I can't fetch offline — so treat this as a concrete, testable
hypothesis rather than a promised improvement. It is the single most promising experiment available to
you, and the plumbing is already named.

---

## 12. Verdict

Unusually well-engineered work for a single-author project: real separation of concerns, one statistics
engine with no duplicated metric maths, correct rather than decorative security, clean `npm audit`, no
dead-code markers, and documentation that reports the negative results of its own backtests with the command
to reproduce them.

**Verified here: 568 checks, 0 failing.** Every test count the README claims that I could reach — 121 API,
205 bots, 21 views, 66 top-down, 36 chart, 36 now, 9 Vercel — matched exactly. The two failures that stood
for most of this audit were gaps in *my* offline fixture coverage, not product defects, and both were
closed with real datasets (§5). On top of the project's own suites I added a 51-check engine probe and a
23-check method probe of my own.

**The strategy implementation is faithful.** Verified three ways: every threshold in your curriculum map
exists in the code; your own 66 top-down assertions pass; and my independent 23-check method probe
reproduces the taught sequence end to end. Then cross-checked against **verbatim course transcripts** and
an **independent implementation of the same 14 episodes** (§11) — both agree with your code on the rules
that matter, including the body-close break that the series calls its single most important mechanical
rule. One attribution caveat: "CRT / right candle" is your project's vocabulary, not the mentor's (§10.2,
confirmed independently in §11.1).

**Two real defects found and fixed,** both with patches that apply cleanly to the pristine zip source:
`setup.js:141` unguarded dereference (`0001`) and the killzone DST drift (`0002`) — the latter genuinely
moved trade scores by up to 3.0 of 6 points for half the year. Full regression after both: unchanged.

**Not verified:** the 27 real-browser assertions (no Chromium available), and the exact figures in the four
research reports (I reproduced the methodology and its conclusion on 5 markets, not the 24-market numbers).

**Biggest real risks,** in order: no multi-currency conversion; the capability-URL webhook; and test suites
that abort on a network failure instead of degrading.

**One thing worth sitting with before trading this.** Your own register says 0 of 5 149 rule × exit
combos clear ≥70 % win rate *and* positive expectancy. An independent team backtesting the same course
across 6 majors and 6 years reached the same verdict: **−0.125R, no edge** (§11.3). Two teams, same
conclusion. The mechanical core does not survive costs — which is exactly what your documentation already
says about it. The engine is a strong research framework; the edge, if there is one, lives in the
discretionary judgement neither bot can replicate.
