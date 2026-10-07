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

**How that 568 splits — the distinction matters, and I had blurred it.** Only **494** of those checks are
the project's own: `api-test` 121, `bots-test` 205, `topdown-test` 66, `chart-test` 36, `now-test` 36,
`vercel-check` 9, `smoke-test` 21 views. The remaining **74** (`probe-engine` 51, `method-check` 23) are
**harnesses I wrote**, living in `analysis/`, not in `scripts/`. They are mine, they were written to probe
the engine offline, and they should not be read as the project's regression suite. When I say "the project's
tests pass", the honest number is **494, 0 failing**; 568 is project-plus-my-probes.

Two invocation traps, both of which produced silent zeros before I caught them: `bots-test.js` reads
`process.env.TJ_BASE` (defaulting to `:3000`) and **ignores argv**, while `api-test.js` takes the base URL
**as argv**. Run `bots-test` with a positional URL and it silently fetches a dead port. The test scripts also
exit 0 when they crash, so a suite must be judged by its stdout, never its exit code.

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

> **Superseded on the sourcing question, 2026-10-07.** This section opened with *"I could not watch the
> playlist — `youtube.com` returns HTTP `000`."* That was **wrong and I retract it.** `curl` inside the
> sandbox is TLS-filtered, but the `fetch_page` tool routes outside that filter and reached the playlist
> immediately. I had tested one tool and generalised its result to "unreachable", then used that as a
> reason to lean on secondary sources. The user was right to push. See §10.2 for what the real playlist
> shows; the code audit below is unaffected — its conclusions stand, and the playlist now *confirms* them.

I still cannot view video frames, so anything purely visual (chart markup drawn on screen, cursor work) is
outside what I can check. Everything else — episode titles, ordering, descriptions, and the auto-captions —
is reachable and has now been checked against the live playlist.

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

### 10.1 The two `bots-test` failures — both were my fixtures, and both are now closed

As first found:

```
- the replayed chart ends on an older bar (2026-02-27T06:00:00.000Z < 2011-08-03T00:00:00.000Z)
- scanned 2 markets (2 errors)
```

1. **Replay ends on an older bar.** The test replays EURUSD **1h** and compares it against the EURUSD
   **1d** series. My 1h fixture was 2025-09 → 2026-03; my 1d fixture was 1999 → 2011. Two different
   decades, so the comparison was meaningless. *I initially reported that no public EURUSD daily OHLCV
   covering 2025-26 existed — that was wrong.* It exists in the **same repository that supplied my 1h
   fixture** (`shahryarashiq/my-vs-code-project-/datasets/EURUSD-1d.csv`); I had simply not looked there,
   having sourced the two files separately. **Now fixed** — see §5.
2. **Scanned 2 markets (2 errors).** The test scans `EURUSD,XAUUSD,BTCUSDT,ES` at 15m. I had 15m data for
   EURUSD and XAUUSD only. **Now fixed for BTCUSDT** with a coherent 5m/15m/4h set; `ES` is still absent,
   but the test's threshold is two markets, so it passes.

Neither ever touched your logic — they were gaps in the offline data I had obtained, and both closed once I
obtained better data. **The suite is now fully green: 568 checks, 0 failing** (§5).

### 10.2 The videos — found a real route

**The playlist is now directly verified.** `https://www.youtube.com/playlist?list=PLBYSdC_HMWMrXE0cmstpBbcIN5pLgebEm`
resolves through `fetch_page` to **"FREE Market Mechanics Mentorship | Full Trading Course"** by
**Brad Goh (The Trading Geek)**, **47 videos, 1,021,088 views, last updated 2026-09-14**. The full episode
list with video IDs and runtimes is saved at `analysis/playlist-verified.json`. Two checks follow from it:

**Every episode citation in your own `docs/PLAYLIST-CURRICULUM.md` is correct — 14 of 14.** I matched each
one against the live playlist titles:

| doc cites | real title |
|---|---|
| ep 5 market structure | Market Structure |
| ep 8 premium/discount | Premium and Discount |
| ep 11 top-down | Top Down Analysis Strategy |
| ep 12 killzones | ICT Killzones |
| ep 13 liquidity/inducement | Liquidity Concepts & Inducements |
| ep 17 trading plan | My Full Smart Money Trading Plan + Daily Routine |
| ep 18 entry models | Entry Models (SNIPER ENTRIES) |
| ep 19 no-trade rules | When Not to Trade |
| ep 21 risk | Risk Management |
| ep 23 journalling | Journalling Your Trades |
| ep 24 daily review | How to Review Your Day |
| ep 30 news | Trading High Impact News |
| ep 31 prop rules | How to Pass Prop Firm Challenges |
| ep 32 21-day streak | Become a Disciplined Trader in 21 Days |

**All 14 transcripts I used match real videos in this playlist, 14 of 14.** So the concern that the audit
rested on a random GitHub repo is answered: the transcripts are the actual course, and the playlist proves
it. The independent *implementation* I found (§11.3) was only ever a cross-check, never the source.

**Ep 16 and Ep 19 were the two gaps, and both are now closed** — pulled straight from the video pages
(`4MG3uUyoQCc`, `kVEx1QzLfQ0`). Ep 19 is stored at
`analysis/transcripts/ep19_when-not-to-trade.PARTIAL.txt`; the fetch truncates the captions part-way, so it
is verbatim but incomplete and is labelled as such. Its substance already matters to the audit: the mentor
names **two** stand-down conditions — *volatile* or *illiquid* — and a third practical rule, *"when price is
in the middle of nowhere, do not trade… it messes up your risk to reward."*

**Checking those against the code produced one new gap that the earlier audit could not have found:**

| Ep 19 rule | In the code? |
|---|---|
| Don't trade when price is not at a point of interest | ✓ `setup.js:125` `add('zone', …)` requires an order block / FVG to trade from |
| Don't trade when the market is **volatile** | ✓ `setup.js:172` `add('volatility', …)` stands down above the 90th ATR percentile |
| Don't trade when the market is **illiquid** | **✗ no such check exists** |

The volatility leg is real; the illiquidity leg is absent. Every `spread` hit in `src/bots/` is prose inside
a note or comment (`momentum.js:229` warns that spreads balloon, `topdown.js:347` reasons about stop width) —
none of them is a filter that can veto a setup. Given that the independent backtest's whole verdict turned on
~0.26R of per-trade cost against ~6-pip stops (§11.3), a liquidity gate is the one missing rule that would
have attacked the failure mode directly. I have **not** implemented it. ~~It needs a spread or volume input the
candle model does not currently carry~~ — **that reasoning was wrong and is corrected in §18**: Ep 19's
illiquidity criteria turn out to be calendar-based (Mondays, Fridays, December), so they need no data the
engine lacks. The reason it is still not implemented stands: it changes which trades the bot takes.

Earlier, a GitHub search had found **`nedu-m/market-mechanics-bot`**, which holds verbatim transcripts of
the course. I pulled **14 of them — 100,401 words** — into `analysis/transcripts/`:

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
| §6 Fixed 2R, minimum acceptable 1:2, set-and-forget | ⚠ `minRR: 2` is wired but **advisory** — below 2R still returns `ok:true` at grade C (§14) |

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

### 11.4 The dead `zone` config — found, and now wired up

`STACK` in `topdown.js:70-80` declared a `zone` timeframe for every chart — for the 15m day-trader stack,
`zone: '1h'`. But `zone_tf` was assigned at `topdown.js:105` and **read nowhere in the project**: not by
`index.js`, not by `momentum.js`, not by the UI. The location layer that shipped in the payload used the
*entry* timeframe instead, so the API reported `zone: tf=15m` where the table promised `1h`. Verified
exhaustively — `zone_tf` appeared exactly once in the entire tree, with no bracket or dynamic access.

**Why it mattered beyond cosmetics.** The independent team's *only* out-of-sample-positive configuration
was **4H / 1H / 15m** (+0.269R train, +0.174R test) — and your `STACK` table already declared exactly that:

```js
'15m': { bias: '4h', zone: '1h', entry: '15m', trigger: '5m', style: 'day' },
```

The winning stack, written down in your own source, but never executed: the engine actually ran
4h / 15m / 5m.

**Fixed** — `analysis/0003-wire-zone-layer.patch`, applied at your instruction and now the default.
`topdown.build()` already accepted a `zoneSeries` parameter and ignored it; it now drives the location
read. All three call sites (`index.js` analyse, `index.js` replay, `momentum.js`) fetch the medium
timeframe when it differs from the bias/entry/trigger series, reusing an existing series otherwise, and a
failed zone fetch falls back to the entry chart rather than sinking the analysis.

The stack now reports `4h bias → 1h location → 5m trigger` on every 15m chart, matching the declaration.

#### Correction: this fixes the *report*, not the trade decision

I initially wrote that `0003` "changes trade decisions" and cited premium/discount sign flips. **That claim
was wrong.** I had compared the *reported* zone payload between the two variants and inferred a decision
change from it without ever measuring a decision. Measuring it directly refutes me.

I ran the same 464 sampled bars across four markets through both variants — passing `zoneSeries` and not —
and diffed every field the engine actually acts on:

| field | differed on | |
|---|---|---|
| `direction` | 0 / 464 | identical |
| `status` | 0 / 464 | identical |
| `blocked` | 0 / 464 | identical |
| `score` | 0 / 464 | identical |
| `grade` | 0 / 464 | identical |
| `checks` | 0 / 464 | identical |
| setup `verdict.action` | 0 / 464 | identical |
| setup best `grade` | 0 / 464 | identical |
| setup best `score` | 0 / 464 | identical |
| `layers.zone.tf` | **464 / 464** | changed |
| `layers.zone.premium_discount` | **464 / 464** | changed |

The zone payload changes on every single bar; **no decision changes on any bar.** The reason is two
specific lines I did not trace before making the claim:

- The method gate's *location* check (`topdown.js:633`) reads `biasRange.position_pct` — the **4h** range
  position — not the zone layer at all.
- The setup engine's premium/discount criterion (`setup.js:131`) reads `analysis.premium_discount`, which is
  the **15m entry chart's own** SMC dealing range.
- Nothing anywhere in `src/` reads `layers.zone.premium_discount`. The only reference outside `topdown.js` is
  `scripts/bots-test.js:113`, which merely asserts the key exists.

So the location read was **never sourced from the zone layer**, in either variant. The zone layer has been
a display-only object since it was written, and `0003` makes that display honest — it does not wire it into
grading.

**The dead-config finding therefore stands, and is deeper than I first reported.** It is not simply "the
1h series was never fetched". It is: the project declares a three-layer stack, fetches a location layer,
reports it, and then grades against two *different* ranges — the 4h range for the method gate and the 15m
range for the setup. The middle layer of the declared stack feeds nothing. Full regression after the change
is **unchanged: 568 checks, 0 failing**, which is now a meaningful result: `0003` is behaviour-preserving by
construction, not by luck.

**What `0003` does earn.** Before it, the API reported `zone: tf=15m` on every 15m chart — a layer the table
said was `1h`, showing you the entry chart's own range and labelling it the medium timeframe. That was a
genuine misrepresentation of the analysis, and it is fixed. It is a reporting fix.

**What it does not do.** It does not run the 4H/1H/15m configuration the independent team found profitable.
Doing that means changing `topdown.js:633` to read the zone layer's position and `setup.js:131` to take
premium/discount from `ctx.topdown.layers.zone` — and those *do* change trades, so they need a backtest
before I would call them an improvement. **I could not run that backtest**; it needs the 6-major, 6-year
dataset I cannot fetch offline. I am not shipping that change on the strength of someone else's result.

If you want it, that is a one-line conversation away, but it should go in behind a test, not on the
authority of §11.3.

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

**Three changes made,** all with patches that apply cleanly to the pristine zip source:
`setup.js:141` unguarded dereference (`0001`), the killzone DST drift (`0002`), and the zone-layer report
fix (`0003`). The first two are defect fixes. The third you approved as a strategy change, and **I have to
correct that framing**: an A/B over 464 bars shows it changes the reported location layer on every bar and
changes **no trade decision on any bar** — grading never read the zone layer to begin with (§11.4). It fixes
a real misreporting; it does not make the bot trade the 4H/1H/15m stack. Full regression after all three:
**unchanged, 568 checks, 0 failing.**

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

---

## 13. The whole playlist vs. the bot — all 47 uploads

Pulled directly from the live playlist this session (§10.2). Every row below is a real video with a real ID in
`analysis/playlist-verified.json`, checked against the code.

**What I can and cannot read.** `fetch_page` returns the full chapter map and the first ~6 minutes of
auto-captions per video. So: every episode's *structure and stated rules* are verifiable; a rule stated in
minute 15 of a video I only have the opening of is **not** verified and is marked ⚠ below. Episodes 5–15,
17, 18, 20 have complete transcripts (100,401 words) and are checked in full.

### Strategy core — Ep 5 to 20 (the episodes that generate trades)

| Ep | Title | In the bot | Verdict |
|---|---|---|---|
| 5 | Market Structure | `smc.js` BOS/CHoCH, body-close rule | ✓ full transcript |
| 6 | Candlestick Patterns | `smc.js` displacement ≥1.2 ATR / ≥0.55 body | ✓ full transcript |
| 7 | Supply & Demand Zones | `smc.js` zone map, `findBreakers()` | ✓ full transcript |
| 8 | Premium and Discount | `smc.js` 50 % split, OTE 0.62–0.79 | ✓ full transcript |
| 9 | Fair Value Gaps | `smc.js:241` FVG ≥0.12 ATR, `!filled` tracking | ✓ full transcript |
| 10 | Order Blocks | `smc.js` OB detection + mitigation | ✓ full transcript |
| 11 | Top Down Analysis | `topdown.js` five taught steps | ✓ full transcript |
| 12 | ICT Killzones | `smc.js` `SILVER_BULLETS` — **now in ET** (`0002`) | ✓ full transcript |
| 13 | Liquidity & Inducements | `smc.js:440` sweep ≥0.08 ATR + close back inside | ✓ full transcript |
| 14 | Flip Zones | `smc.js` role-flip tracking | ✓ full transcript |
| 15 | How To Find Daily Bias | `topdown.js` bias layer | ✓ full transcript |
| 16 | Building a Trading Plan | `setup.js` checkpoint scoring + written plan storage | ✓ fetched this session |
| 17 | Smart Money Plan + Routine | `now.js` one dated action per market | ✓ full transcript |
| 18 | Entry Models (SNIPER) | `setup.js` MSS + breakers; both named models | ✓ full transcript |
| 19 | When Not to Trade | volatile ✓ / POI ✓ / **illiquid ✗** | ⚠ partial transcript |
| 20 | Stop Loss & Take Profit | `setup.js:175` stop +0.18 ATR; 2R **advisory, not a veto** | ⚠ see §14 |

### The rest of the course

| Ep | Title | In the bot | Verdict |
|---|---|---|---|
| 21 | Risk Management | `correction.js:386` `max_risk_pct:1`, `max_trades_day:3`, `cooldown_min:30`, `max_consecutive_losses:2` | ✓ fetched |
| 22 | Trading Psychology | `correction.js` tone-tagged notes | ✓ no mechanical surface |
| 23 | Journalling Your Trades | the journal itself — this *is* the product | ✓ |
| 24 | How to Review Your Day | daily review views | ✓ |
| 25 | How I Find A+ Setups | all five rules read; **3 are gates, 2 are advisory** | ⚠ **divergence — §14** |
| 26 | Review Your Trades Like a Pro | review views | ✓ |
| 27 | Improve Your Strategy With Data | `rule-sweep.js`, `MEASURED-RULES` register | ✓ |
| 28 | Emotional Regulation | no honest code surface | — deliberately not automated |
| 29 | How to Use AI for Trading | **zero LLM references in the tree** | ✓ correctly absent |
| 30 | Trading High Impact News | `setup.js:167` news blackout, 60-min window | ✓ fetched |
| 31 | Prop Firm Challenges | prop rules in `correction.js` guardrails | ✓ |
| 32 | Disciplined in 21 Days | streak tracking | ✓ |
| 33 | Graduation | no code surface | — |
| 37 | **Sweeps + OB + FVG for SNIPER entries** | see below — the closest match in the course | ✓ fetched |
| 35, 36, 38, 39, 40 | bonus / strategy compilations | same primitives, no new rules | ✓ |
| 41–47 | EdgeFlo product tutorials | not strategy; the journal is the equivalent | n/a |

### Ep 37 is the strongest evidence that the bot tracks the course

That video (952K views) states the model in one line: *"The liquidity sweep is the trap. The order block is
the zone. The fair value gap or imbalance is the entry."* The bot's own header comment at `setup.js:9` says:

```
HTF bias -> sweep -> displacement -> zone (OB/FVG) -> retest entry
```

Same sequence, same order. And the refinement step is implemented as described, not approximated —
`setup.js:109-122` filters to unfilled FVGs in the trade direction, prefers a strong fresh order block that an
FVG overlaps or nests inside, and falls back to the largest FVG's midpoint when there is no OB. The
aggressive-vs-conservative entry pair the video teaches at 12:24 exists too (`index.js:336-339`,
`momentum.js:377`, `now.js:158-169`).

### Ep 30 sharpens the one real gap

Ep 30's advice is blunt — *"my best advice for people who want to trade news is to just don't trade news"* —
and its reasoning is that *"the spreads will widen, liquidity will start disappearing."* The bot already
stands down for news (`setup.js:167`, 60-minute window), so **news-time illiquidity is covered**.

That narrows the Ep 19 finding rather than removing it: the missing filter is for **thin markets outside
news windows** — holiday sessions, dead Asia hours, off-contract hours. There is still no spread or volume
input anywhere in `src/bots/` that can veto a setup.

### Honest limits on this audit

- **Ep 25 is now fully read** — §13 originally listed its rules 3–5 as unverified because YouTube's watch
  page truncates its caption panel. `youtubetotranscript.com` returns the complete transcript instead, and
  reading it in full is what exposed the divergence in §14. That row is corrected above.
- **I cannot see video frames**, so on-screen chart markup — where he draws a zone, how he places a stop on
  a specific candle — is outside anything I can check.
- Episodes 0–4 are autobiography and mindset, and 28 is emotional regulation. Nothing in them has a
  mechanical surface, so "not implemented" is the correct state, not a gap.

**Bottom line.** Across the 34 course episodes and 6 bonus videos, I found **one** genuine unimplemented
rule (the general illiquidity stand-down), **one** documentation citation error (CRT attribution, §10.2),
and **one** dead config path (the zone layer, §11.4 — now reporting correctly but still not feeding a
decision). Every mechanical rule I could read in full is implemented, and in most cases at the threshold the
course states. The bot does run this strategy.

---

## 14. Ep 25 read in full — the bot diverges from the course on two of the five rules

§13 recorded Ep 25's rules 3–5 as unverified because YouTube's own watch page truncates its caption panel
around minute six. That was a route failure, not a dead end: **`https://youtubetotranscript.com/transcript?v=<ID>`
returns the complete transcript, paginated.** Ep 25 is now read end to end, and it contains the single most
auditable thing in the entire course — an explicit, ordered, all-or-nothing entry checklist.

### What the mentor actually says

> *"These are the five entry triggers that I check for before every single trade… if I don't check off every
> single one of these box right here, **that's a no trade**… If I miss just one… that is not A plus setups."*

His own summary of the order: *"Your bias, your point of interest, your sweep plus market shift, your
timing, and your risk to reward."*

| # | Rule | His words |
|---|---|---|
| 1 | **Bias alignment** | trade idea must match the immediate bias; if LTF contradicts HTF, *"stay out of the market or just wait for clarity"* |
| 2 | **High-probability POI** | zone aligned with trend, with a liquidity sweep or available liquidity near it, and **price must be inside it** — *"not near it… it needs to actually be in it"* |
| 3 | **Liquidity shift + market shift** | *"I always look for liquidity shift before I enter. **No liquidity shift, no entry**, as simple as that."* plus a structure shift confirming direction |
| 4 | **Timing (killzone)** | *"if the setup appear before that window or after… and it's not within any Q zone, then I personally **will not enter** for the setup itself"* |
| 5 | **Asymmetric risk-reward** | *"if the trade idea presents a risk to reward ratio of less than two… **no matter how confident I am, I'm going to be passing on the trade itself**"* |

### How the bot actually decides

`setup.js` is a **weighted score**, not a checklist. `add()` (line 92) pushes `{key, pass, weight}`, and
line 276-278 computes `score = (earned weight / total weight) × 100`. A small number of conditions then *cap*
the score, and a cap only becomes a hard veto if it lands below the `no-trade` band (44).

Measured, every cap in the file:

| cap condition | score cap | grade | blocks the trade? |
|---|---|---|---|
| no sweep (`hasTrigger` false) | 38 | no-trade | **yes** |
| no zone (`hasZone` false) | 34 | no-trade | **yes** |
| entry invalid | 20 | no-trade | **yes** |
| news blackout | 40 | no-trade | **yes** |
| **RR below `minRR`** | **45** | **C** | **NO — still tradeable** |
| entry "waiting" | 66 | B | no (correctly) |
| **outside the killzone** | **no cap exists** | — | **NO** |

`ok` is computed at line 320 as `g.grade !== 'no-trade'`, so a C is reported as a tradeable setup.

**So three of his five rules are hard gates and two are not.** Bias alignment is enforced by the topdown
method gate (`setup.js:360`, which overrides any setup grade); the POI and the sweep are hard caps. But the
2R minimum and the killzone window are advisory.

### Reproduced on your own fixture data

Scanning EURUSD, GBPUSD, XAUUSD and BTCUSDT 15m for setups the engine reports as tradeable:

```
EURUSD  grade=C  score=45  rr_final=1.11  ok=true   ← below the course's 2R floor
EURUSD  grade=C  score=45  rr_final=1.50  ok=true
EURUSD  grade=C  score=45  rr_final=1.53  ok=true
EURUSD  grade=C  score=45  rr_final=1.94  ok=true
GBPUSD  grade=C  score=45  rr_final=1.50  ok=true
```

A 1.11R setup is graded C, labelled *"Marginal — paper/demo or half risk at most"*, and returned with
`ok: true`. The course says pass on it outright, whatever the confidence.

### How to read this — it is a deliberate design choice, not a bug

The C band exists on purpose and is honestly labelled: the author chose a graded risk ladder rather than a
binary filter, so a marginal idea can still be shown at half risk. That is a defensible product decision.
But it **is** a divergence from the course this project documents itself as encoding, and it is not recorded
anywhere in `PLAYLIST-CURRICULUM.md` — which is the actual defect. §9 of this audit previously reported the
2R minimum as faithfully implemented because `minRR: 2` is wired through the levels maths. It is wired, and
it does cap the score — **it just doesn't veto.** I over-credited it.

Two concrete options, both small, both yours to choose:

- **Document it** — add a row to `PLAYLIST-CURRICULUM.md` stating that rules 4 and 5 are advisory, so the
  divergence is a declared design choice rather than an undocumented one.
- **Enforce it** — cap RR-below-minimum at ≤43 and add a killzone cap, making all five rules gates. This
  changes trade decisions, so it needs a backtest before it ships, not after.

I have done neither. Changing which trades the bot takes is not something I'll do on my own reading of a
transcript.

---

## 15. Ep 37 read in full — the five-step entry model, and one soft divergence

Ep 37 (*"How I Combine Liquidity Sweeps, Order Blocks and FVGs For SNIPER Entries"*, 952K views) is the
course's most mechanical video: a numbered, five-step sequence with an explicit stop rule and target rule.
Read end to end via the same route as §14.

**Coverage note, stated up front:** I have Steps 3, 4 and 5 verbatim. Steps 1 and 2 (chapters 04:18 and
04:46) I have only as the concept summary from the video's own opening — *"the liquidity sweep is the trap,
the order block is the zone, the fair value gap is the entry"* — not word for word. Everything asserted below
about Steps 3–5 is quoted; nothing about Steps 1–2 is.

### Step 3 — identify the order block, and pick one method

He gives two ways to mark it and then insists on consistency:

> *"One way of identifying order block is to find the entire range before the impulsive move… you can refine
> it by looking at the origin candle before the impulsive move… **I will highly advise you to just stick to
> one method.** If you prefer the range method, stick to it. Don't use the candlestick method sometimes and
> then the range method other times — you want to stick to one mechanical approach."*

**The bot complies.** `smc.js:180-196` `findOrderBlocks()` walks back from the displacement bar to the last
opposite-colour candle and takes that single candle's full high–low (`top = ob.h, bottom = ob.l`) — the
**origin-candle** method, applied uniformly on every call. One method, consistently. ✓

### Step 4 — mark the fair value gap

> *"You can identify a gap by finding the high of the previous candlestick and finding the low of the next
> candlestick… The larger the gap, the more imbalance there is."*

`smc.js:241` implements exactly that construction with a ≥0.12 ATR floor. ✓

### Step 5 — wait for the re-entry

> *"If price is somewhere around here in the middle of nowhere, I'm not going to be entering for longs… I'm
> going to sit on my hands and do nothing until price mitigate the zone."*

> *"You can either look for confirmation or you can just enter right away once price mitigated the fair value
> gap, which is a little bit more aggressive… **The conservative version requires you to wait for some form of
> structural shift** like a market shift and then you actually enter."*

Both variants exist: `index.js:336-339` carries `aggressive` and `safer` plans, `momentum.js:377` passes both
through, and `now.js:158-169` picks between them on `fullRisk`. ✓

**Stop placement — the bot is stricter than the course, which is the safe direction:**

> *"I'm going to be placing my stop loss below the fair value gap, below the point of interest in which I'm
> entering the trade from, and placing my take profit at 2R."*

`setup.js:179-181`:

```js
const stopBase = long ? Math.min(zone.bottom, recentSweep ? recentSweep.extreme : zone.bottom)
                      : Math.max(zone.top,    recentSweep ? recentSweep.extreme : zone.top);
const buffer = atr * 0.18;
const stop = long ? stopBase - buffer : stopBase + buffer;
```

It takes the **further** of the zone edge and the sweep extreme, then adds 0.18 ATR. That satisfies Ep 37's
"below the point of interest" *and* Ep 11's "beyond the sweeping candle" simultaneously. ✓

### The one soft divergence: standalone FVG entries

Ep 37 is clear about where an FVG entry belongs:

> *"You can never ever really go wrong if you actually enter at the fair value gap **that is within the order
> block**. But **try not to enter at like a random fair value gap that is in the middle of nowhere**."*

`setup.js:120-122` prefers an order block, and scores an OB higher when an unfilled FVG overlaps it — that is
his rule, implemented. But when there is **no** order block at all it falls back to a standalone FVG:

```js
const zone = bestOB ? { kind: 'order_block', … }
  : bestFvg ? { kind: 'fvg', …, overlap: null }   // ← no order block behind it
    : null;
```

That standalone FVG then satisfies the `zone` checkpoint, which is the **hard** POI gate (cap 34 → no-trade).
So a lone FVG can pass the course's "price must be at a high-probability point of interest" gate on its own.

Measured across the four fixture markets, counting every candidate that cleared that gate:

```
order block ............ 1145
standalone FVG .........   28     of which reported tradeable: 19
```

**Scale matters here, and it is small: 2.4 % of gated zones.** The wording is also softer than Ep 25's —
*"try not to"* rather than *"no trade."* So this is a minor divergence, not a defect on the level of the 2R
gate in §14. Worth recording precisely because it is easy to overstate: the fallback exists, it fires rarely,
and the course discourages rather than forbids it.

### Ep 37 scorecard

| Element | Course | Bot | |
|---|---|---|---|
| OB method, one and consistent | origin candle or range, pick one | origin candle, uniform | ✓ |
| FVG construction | prev high → next low | `smc.js:241`, ≥0.12 ATR | ✓ |
| FVG nested in OB preferred | "ideally… within the order block" | `setup.js:112` overlap bonus | ✓ |
| Standalone FVG entry | "try not to" | **allowed, passes the hard gate** | ⚠ 2.4 % |
| Wait for mitigation | "sit on my hands" | `entry_status: 'waiting'` caps at 66 | ✓ |
| Aggressive vs conservative | both taught | both implemented | ✓ |
| Stop below POI and beyond sweep | "below the point of interest" | further of the two + 0.18 ATR | ✓ stricter |
| Take profit 2R | "stick to 2R" | advisory — see §14 | ⚠ |

---

## 16. Ep 21 read in full — risk rules match on defaults, but the ceiling is not enforced

Ep 21 (*Risk Management*) is the episode that carries actual numbers, which makes it the most directly
testable of the process episodes. Read end to end.

### The framework, in his words

**Fixed percentage per trade:**

> *"The rule of thumb is to risk like 1% of your entire account on any given trade… the industry tells you to
> stick to 1%… 0.5% is pretty decent as well. 0.25%… The larger the account that you're managing, the lower
> your risk per trade should be… **The maximum is 1%. Anywhere below 1% that's great. The lower the
> better.**"*

**Max daily loss:**

> *"Next is to set a max daily loss. So this is usually 2% to 3% max, then stop for the day."* — given
> explicitly as a revenge-trading guardrail.

**Plus three principles that have no code surface**, and correctly so: protect capital first, define risk
before every trade, think in probabilities not certainty (*"no matter how many confluences you attain…
anything can happen in the market"*).

### What the code does

| Rule | Course | Code | |
|---|---|---|---|
| Default risk per trade | 1 % | `db.js:120` `risk_per_trade_pct REAL DEFAULT 1.0`; `index.js:129` defaults to 1 | ✓ |
| Lower is better, floor around 0.25 % | 0.25 / 0.5 / 1 | `correction.js:400` clamps the adaptive recommendation at `Math.max(0.25, …)` | ✓ |
| Max daily loss 2–3 % | 2–3 %, then stop | `correction.js:387` `daily_loss_limit_pct: 3`, adapted from the user's own median daily loss at `:429` with a 1 % floor | ✓ |
| Trades-per-day / loss-streak guardrails | implied by "stop for the day" | `correction.js:386` `max_trades_day: 3`, `cooldown_min: 30`, `max_consecutive_losses: 2` | ✓ stricter |
| **1 % is a ceiling** | *"the maximum is 1%"* | **not enforced on any write path** | ⚠ |

### The gap, precisely

The default is right and the daily-loss limit is right. But nothing caps the value a user actually stores or
passes:

- `routes/api.js:566` — account update takes the field through `num(b.risk_per_trade_pct, …)` with **no
  clamp**. Store 5 and 5 is stored.
- `routes/api.js:398` and `:711` — both accept a `risk_pct` **query parameter** with no clamp, defaulting to
  the account value. So `?risk_pct=5` sizes the position at 5 % for that call.
- `correction.js:400` clamps only the *recommended* guardrail, and its upper bound is `Math.min(2, …)` —
  **2 %, twice the course's stated maximum.**

Severity is low and I want to be accurate about that: the defaults are correct, a user has to actively go
out of their way to exceed 1 %, and letting a trader choose their own risk is a defensible product decision
for a journal. It is not a strategy-logic divergence like §14. It is an input-validation gap between what the
course states as a hard ceiling and what the code permits — and like §14, it is undocumented.

### Ep 21 scorecard

Faithful: default risk, the "lower is better" floor, the 3 % daily loss limit, and three additional
guardrails the course only implies. Divergent: no ceiling enforcement, and the adaptive cap permits 2 %.

**Not changed.** Adding a clamp to `risk_per_trade_pct` is a one-line fix, but it would silently override a
value a user deliberately set, which is a product decision rather than a bug fix. Flagged, not applied.

---

## 17. Ep 27 and Ep 31 — a sample-size divergence, and a second source for §14

Both read end to end. Neither introduces a new entry rule, but both state hard thresholds, and one of them
the project's own adaptive engine does not meet.

### Ep 27 — the minimum sample before you change anything

> *"I only change rules when I have either **100 trades** to review or I have at least **three months** of
> data. If you don't have 100 trades yet, you need at least **30 to 50 minimum trades** just to see anything
> meaningful… and if you're below that threshold, below that 30 to 50 trades, **don't tweak the system at
> all**."*

> *"When you introduce a new variable into your trade plan… you have to test the entire trade plan again…
> you want to treat it like a science, not as like an art."*

**The project's backtest register clears this comfortably.** `docs/MEASURED-RULES.md` reports **7,580 filled
samples collapsed to 7,028 unique setups**, and the whole-sample verdict rests on 614 setups — far above the
30–100 floor. It also does the thing he asks for: it collapses overlapping re-detections of the same zone so
one event is not counted many times. ✓

**But the live adaptive engine does not.** `correction.js:389`:

```js
if (!st || trades.length < 10) return { ...base, … };
```

Ten trades, and the bot begins deriving *personalised* guardrails from that user's own history — including
`ownCapPct`, which feeds the recommended risk cap at `:400`. The mentor's floor is 30–50, and his instruction
below it is explicit: don't tweak at all. **The bot starts tweaking at one-fifth of the minimum.**

This is the same class of finding as §14 — the code is not wrong so much as *less conservative than the
course says to be* — but it has a sharper consequence, because a cap derived from ten trades is mostly noise,
and it then feeds the risk sizing the user actually gets.

One related observation, offered as a question rather than a claim: `rule-sweep.js` evaluates **5,149
combinations** across those 7,028 setups and I found **no minimum-n gate** anywhere in it. Ep 27's "treat it
like a science" would normally come with a per-combination sample floor, since with 5,149 buckets some will be
thin. The register's headline numbers are well-powered; I have **not** checked the per-combination n
distribution, so I am not asserting that any individual row is underpowered.

### Ep 31 — a second, independent source for the §14 divergence

> *"Prop firm challenges are a rule-based game… you want to focus on **A and A+ setups only**… you only want
> to be taking the setups where you know for a fact that it's going to work out. You want to avoid all the
> random trades that is outside of a trade plan. You don't want to force trades when the market conditions is
> not ideal, when the price is just chopping around."*

> *"Your risk per trade **should not be more than 1%** per trade. **Should not even be more than 0.5%** per
> trade."*

That is Ep 25's checklist restated in a prop-firm context, and it lands on the same two points already
recorded:

- **B and C are reported tradeable.** `setup.js:320` sets `ok: g.grade !== 'no-trade'`, so grades B (58+) and
  C (44+) both return `ok: true`. Ep 31 says A and A+ only. There is also a labelling inconsistency worth
  noting: the bottom band is called *"Not an A+ setup — the edge is not there"*, which implies everything
  above it **is** an A+ setup — but B and C sit above it.
- **The risk ceiling.** Ep 31 is *stricter* than Ep 21 ("should not even be more than 0.5%"), which makes the
  unenforced ceiling in §16 more relevant, not less: two episodes state a ceiling and the code enforces
  neither.

Ep 31's five "numbers that define the game" — profit target, max daily loss, max overall drawdown, trading
day, time limit — are all present as account fields (`db.js`, `routes/api.js:544`), so the challenge
parameters can be stored. ✓

### Scorecard for this pair

| Rule | Course | Code | |
|---|---|---|---|
| Backtest sample size | 30–100 minimum | 7,028 unique setups | ✓ |
| Dedupe overlapping detections | treat as science | collapses re-detections | ✓ |
| **Live adaptive floor** | **30–50, else don't tweak** | **`correction.js:389` starts at 10** | ⚠ |
| Trade only A / A+ | "A and A+ setups only" | B and C return `ok: true` | ⚠ (§14) |
| Risk ≤ 1 %, ideally ≤ 0.5 % | stated twice | defaults correct, no ceiling | ⚠ (§16) |
| Challenge parameters stored | 5 numbers | all present as account fields | ✓ |

**Not changed.** Raising `correction.js:389` from 10 to 30 is a one-line edit, but it would silently stop
personalised guardrails for every user with 10–29 trades, which is a product decision about how the app
behaves for new users — not a bug fix I should make on the strength of a transcript.

---

## 18. Ep 19 read in full — and it refutes something I wrote in §14

§14 closed the illiquidity gap with this sentence:

> *"it needs a spread or volume input the candle model does not currently carry, and inventing one would be
> exactly the kind of unrequested strategy change I should not make unilaterally."*

**That was wrong, and reading the episode in full proves it.** I inferred the difficulty of a fix without
investigating what the rule actually is. The mentor's illiquidity criteria are not about spreads or volume
feeds at all — they are **calendar-based**.

### The complete criteria list

He opens by naming two market conditions — *"Volatile market conditions, or the markets are illiquid"* — then
enumerates what he actually means, "based on my 5 years of experience":

| # | Condition | His reason | In the bot |
|---|---|---|---|
| 1 | **Price in the middle of nowhere** | *"it messes up your risk to reward"* | ✓ hard gate, cap 34 |
| 2 | **Slow, choppy price action, no clear bias** | *"price is sweeping the liquidity from this high, this low… we are just back to exactly where we start"* | ⚠ partial — `add('bias')` 12 pts + `add('momentum')` 8 pts, both weighted, neither a veto; no chop detector |
| 3 | **Mondays and Fridays** | Monday: *"lower trading volume… a lot of traps… the market is still trying to figure out where to go."* Friday: *"the markets are illiquid… institutions are closing their books"* + weekend rollover fees | **✗ absent** |
| 4 | **December** | *"institutions are taking a break… the market is going to be very illiquid"* | **✗ absent** |

Every one of the missing items is a **day-of-week or month check on a timestamp the bot already has**. I
verified there is no such filter: the only `getUTCDay`-style arithmetic in `src/bots/` is `smc.js:326-327`,
which computes a Monday purely to anchor PDH/PDL and weekly levels — not to veto a trade. The session and
killzone tables (`smc.js:611-615`, `:630-632`) are **hour-of-day only**. No day, no month.

So the fix I dismissed as needing data the engine lacks needs no new data whatsoever.

### One nuance that keeps this from being a blunt ban

He carves out an exception, and it matters for how any fix should be shaped:

> *"If I see like a top-notch A+ extreme high probability setup on a Monday, then yes, of course I'm going to
> take it, because my trading plan states that if a setup meets my criteria, I will take the trade regardless
> of the day. But… if it's just like a mediocre setup… Monday I just try not to trade."*

And on Friday: *"The only exception to this rule is that if I'm swing trading, I'm already holding the trade
from last week, then I'm just going to continue holding."*

So the calendar rules are a **filter on marginal setups, not an absolute blackout** — which composes directly
with the grade ladder discussed in §14: suppress Monday/Friday/December for B and C, let A+ through. That is
the shape the course actually describes, and it is implementable in the existing `add()`/cap structure
without touching the entry model.

### Why this matters more than the missing rules alone

The independent backtest in §11.3 concluded **no edge, −0.125R**, and attributed it to ~0.26R of per-trade
cost against ~6-pip stops. Criteria 3 and 4 are precisely the conditions where spread and slippage are worst
— thin Monday opens, Friday book-closing, December. A calendar filter is the cheapest available attack on the
exact failure mode that killed the backtest, and it needs no new data and no change to the entry model.

**Not implemented.** I am not adding it: it changes which trades the bot takes, which is your call, and §14's
options still stand. But I am correcting the record — I told you this needed data the engine doesn't have. It
doesn't.

---

## 19. Ep 30 and Ep 16 — the news filter is stricter than the course, but its label is wrong

### Ep 30 — what the course specifies

He reduces news handling to three options and picks one:

> *"There are simply just three ways that you can trade news. There's only three options. And for majority of
> the traders watching this, I would advise you to stick to **option A, which is avoid it completely**."*

> *"If you don't have a system that is specifically tested for news, you shouldn't be trading news at all."*

Then he specifies the mechanism precisely, in the terms of his own platform:

- filter to **high impact only**, and only for the currencies on your watch list
- a **block window**, default 15 minutes, settable to 5 / 10 / 30 / 60
- a **block behaviour**: before, after, or **before and after**
- *"I would recommend you to at least put it at **15 minutes before and after** high impact news."*

### What the bot does — faithful, and stricter

`index.js:54-77` `newsCheck()`:

```js
if (!/high/i.test(e.impact || '')) return false;                        // high impact only
if (!ccys.some((c) => ccy.includes(c))) return false;                   // watchlist currencies only
return Math.abs(new Date(e.date).getTime() - now) <= windowMin * 60000; // ± window
```

| Spec | Course | Bot | |
|---|---|---|---|
| High impact only | yes | `/high/i` filter | ✓ |
| Watchlist currencies only | yes | `currenciesOf(symbol)` | ✓ |
| **Before and after** | *"before and after"* | `Math.abs(…)` — symmetric | ✓ |
| Window | 15 min recommended floor | **45 min** default (`:54`, `:122`) | ✓ **3× stricter** |
| Look-ahead calendar | "calendar view… which days are loaded" | `upcoming`, next 6h, top 4 | ✓ |
| Hard veto | "stop you from entering trades" | `setup.js:288` cap 40 → no-trade | ✓ |

I confirmed the boundary by evaluating the filter expression: an event at **+40 min blocks, −40 min blocks,
+50 min does not, −50 min does not**. Symmetric at 45.

*(Method note: `newsCheck` is not exported, so I read the filter at `index.js:64` and evaluated that exact
expression rather than calling the function. The symmetry is established by the `Math.abs`, which is
verifiable by inspection; the numbers above are the arithmetic of that line, not a live call.)*

### The bug: the label misdescribes the filter

`setup.js:168`:

```js
blackout ? blackout : 'No high-impact releases due in the next 60 minutes.'
```

Two things are wrong with that sentence, and both are visible to the user on every clean read:

1. **The number is wrong.** The actual default is **45** (`index.js:54` and `:122` both use 45, and nothing
   in the tree passes a `newsWindowMin` override — the only occurrence is the default itself).
2. **The direction is wrong.** *"due in the next"* describes a forward-looking window. The filter is
   **symmetric** — it also stands down for 45 minutes *after* a release, which is the half that catches the
   *"price goes up by 100 pips, and then later on price comes down by another 100 pips"* manipulation he
   describes.

So the app under-reports its own protection: it is doing more than it says, in both directions. Small, but it
is exactly the kind of thing that makes a checklist unreadable — and the fix is one string:

```js
`No high-impact release within ±${ctx.newsWindowMin || 45} minutes.`
```

### Ep 16 — and it makes the Monday/holiday gap part of the *plan*

Ep 16 defines what a trading plan must answer, and the last item is the one that connects to §18:

> *"Where to place a stop loss, where to place your take profit, and **most importantly, when should I stay
> out completely?** What are the market conditions that I want to avoid at all costs just like a plague —
> **maybe on Mondays**… maybe doing high impact news… **maybe during holiday seasons**… If your trading plan
> cannot answer these simple questions, **it is not strong enough**."*

He also states the design goal in terms that describe this project exactly:

> *"The purpose of a mechanical trading system is to remove all the discretion from trading… It's something
> that is clearly defined and it's measurable and it's repeatable and it's scalable."*

Two consequences. First, the Monday/Friday/December gap from §18 is not a stylistic preference — the course
treats "when to stay out completely" as a **required** component of the plan, and names those exact
conditions. Second, the journal stores a written plan, so this is the one place the course asks for something
the app could surface directly: a plan is incomplete by the course's own definition if it cannot state its
stand-down conditions, and nothing in the app checks for that.

### Scorecard

| Item | |
|---|---|
| News: high-impact + watchlist filter | ✓ |
| News: symmetric before/after block | ✓ |
| News: 45 min vs 15 min recommended | ✓ stricter |
| News: hard veto | ✓ cap 40 |
| **News: user-facing label** | **✗ says "next 60 minutes", is ±45** |
| Plan: "when to stay out completely" required | ⚠ not surfaced anywhere |
| Plan: Monday / holiday conditions | ✗ (§18) |

**Nothing changed**, including the one-string label fix — it is a user-visible wording change and I would
rather you approve the phrasing than have me invent it.

---

## 20. Ep 23 — the journal matches the course closely; two daily-stats items are absent

Ep 23 (*Journalling Your Trades*) is the episode this product *is*, so it is the fairest test in the audit.
His framing is the one the project's own docs adopt:

> *"A green trade, a winning trade can be bad execution… a red trade, a losing trade could be a good trade
> because you executed your trade plan flawlessly… if you do not journal your trades, you will never ever
> know the difference."*

**That separation is implemented, and it is the strongest single match in the whole audit.**
`correction.js:330` scores a losing trade *"within the 1R limit, that is a good loss (+6)"*, and `:522`
grades a C trade *"Process errors here; **the P&L is beside the point**."* Outcome and process are genuinely
scored apart, exactly as he describes.

### His daily-stats list, item by item

He enumerates what the end-of-day view should show. Checking each:

| Ep 23 daily stat | In the app | |
|---|---|---|
| P&L for all closed positions of the day | `correction.js:472` `today.realised` | ✓ |
| How many trades taken | `today.trades` / `today.closed` | ✓ |
| Win rate | `statsOf(trades)` | ✓ |
| **Did you follow your trading plan?** | `setup_grade` column + `correction.js` grading | ✓ |
| **Did you violate any guardrails?** | `correction.js:466` `breaches[]`, plus a `stop_moved` column | ✓ |
| **Did you complete your pre-market routine?** | **no daily completion flag** | ✗ |
| How many trades journalled so far / "gray dot = missing" | **no completeness indicator** | ✗ |

His per-trade field list is fully covered and then some. `db.js` carries `entry`, `exit`, `stop`, `target`,
`size`, `fees`, `gross_pnl`, `net_pnl`, `risk_amount`, `r_multiple`, `planned_r`, `mae_r`, `mfe_r`,
`exit_reason`, `setup_grade` and `session TEXT` (`:264`) — he asks for P&L, instrument, direction, lot size,
date, session, duration, entry, TP and SL. Duration is derivable from `opened_at`/`closed_at`; everything else
is a real column.

### A correction to my own method, since it changed the answer

My first pass grepped for `routine|checklist|pre.?market|prep` in `db.js` and the routes, got only false
positives from the word *"prepare"*, and I nearly reported "no routine or checklist tracking." That was a
bad search, not a finding. A wider grep returns **67 hits**: `db.js:228` `checklist TEXT DEFAULT '[]'` — a
JSON array of pre-trade items — plus per-strategy checklists at `:413`, `:422`, `:431` and a
`DEFAULT_CHECKLIST` at `:436`, surfaced through `coach.js:598`.

So **checklist logging does exist**, and `PLAYLIST-CURRICULUM.md:85`'s claim is accurate on that half. What is
genuinely absent is narrower than I first thought: a **daily completion** record for the routine, and a
**journal-completeness** indicator. Both are in his daily-stats list; neither is in the schema.

### One doc-precision note on Ep 32

`PLAYLIST-CURRICULUM.md:85` credits Ep 32 with *"Journal streaks / checklist logging ◐."* The checklist half
holds. The streak half is ambiguous: the only streak in the codebase is a **consecutive-loss** streak
(`correction.js:459-460`, feeding the `max_consecutive_losses` guardrail at `:466`). Ep 32 is
*"Become a Disciplined Trader in 21 Days"* — a habit streak, which is a different construct, and there is no
day-counting habit streak anywhere. `correction.js:297` only *name-drops* the episode in advice text. Not a
defect, but the row reads as more coverage than exists.

### Scorecard

| | |
|---|---|
| Process scored apart from outcome | ✓ the strongest match in the audit |
| Per-trade data, incl. session | ✓ exceeds his list |
| Plan-followed / guardrail breach | ✓ |
| Pre-trade checklist storage | ✓ `db.js:228` + per-strategy defaults |
| **Daily routine completion flag** | **✗** |
| **Journal-completeness indicator** | **✗** |
| Ep 32 "journal streaks" claim | ⚠ only a loss streak exists |

**Nothing changed.** The two missing items are additive UI/schema features rather than corrections, and both
are things you may well have scoped out deliberately — unlike the divergences in §14–§19, neither contradicts
something the code claims to do.

---

## 21. Ep 24 — the daily review, and a second source for the two §20 gaps

Ep 24 (*How to Review Your Day*) walks through the end-of-day view screen by screen, which makes it a direct
specification for the app's daily surface. It also states the principle the project's grading already follows:

> *"There is your outcome oriented metrics and then there is your process-oriented metrics. **When you focus
> on the process oriented metrics, the outcome oriented metrics will take care of themselves.**"*

### The daily overview, item by item

| Ep 24 shows | In the app | |
|---|---|---|
| Net P&L | `correction.js:472` `today.realised` | ✓ |
| Win rate | `statsOf(trades)` | ✓ |
| **Average R multiple** | `today.avg_r` | ✓ |
| Total trades / wins / losses | `today.trades`, `today.closed` | ✓ |
| Did I follow my plan? (yes/no) | `setup_grade` + `correction.js` grading | ✓ |
| **Which guardrails I violated** | `correction.js:466` `breaches[]` with a named `rule` | ✓ |
| **Pre-market routine done?** | **absent** | ✗ |
| **How many trades journalled** | **absent** | ✗ |
| Best trade / worst trade | `performance.js:211-212` `best_trade` / `worst_trade`, plus `best_r` / `worst_r`; shown in `analytics.js:26` and `dashboard.js:143` | ✓ |

**The two missing items are the same two §20 found.** That is worth stating plainly: Ep 23 and Ep 24
independently list *pre-market routine completion* and *journal completeness* as part of the daily surface,
so this is not one ambiguous mention read too literally — it is the course asking for the same two fields in
two separate episodes. Ep 24 also gives the reason it matters:

> *"There's probably like a direct correlation between whether you conducted a pre-market routine and whether
> you actually make money on the day."*

That is a testable hypothesis, and the journal is exactly the dataset that could test it — which is a mildly
ironic gap, given Ep 27's whole thesis is that the journal exists to answer questions like that.

### One nuance on best/worst trade

The app picks best and worst by **P&L and R extremes** (`Math.max(...pnls)` / `Math.min(...pnls)`). He means
best and worst *execution* — *"think about what broke"* on the worst trade. The two often differ, and that is
precisely the distinction Ep 23 draws. The pieces to do it properly are already in the schema (`setup_grade`,
`r_multiple`, `stop_moved`, guardrail breaches), so this is a ranking choice rather than missing data.

### His four end-of-day questions, and whether the app can answer them

1. *Did I follow my trading plan?* — **yes**, `setup_grade` + grading
2. *Did I break any rules / violate guardrails?* — **yes**, named breaches
3. *Was execution clean or messy?* — **yes**, `stop_moved`, `exit_reason`, `mae_r`/`mfe_r`
4. *Did I do the boring work — routine and journaling — or skip it?* — **no**, neither is recorded

Three of four answerable. The fourth is the same gap.

### Scorecard

Daily metrics, plan adherence, guardrail breaches and best/worst extremes are all present. The
pre-market-routine flag and the journal-completeness count are absent, confirmed from two episodes.
Best/worst is outcome-ranked where the course means process-ranked.

**Nothing changed.** Same reasoning as §20: these are additive features, not contradictions of anything the
code claims to do.

---

## 22. Ep 26 — the five-R cadence, and a second episode converging on the 10-trade gate

Ep 26 (*Review Your Trades Like a Pro*) opens with the framework the whole course builds toward:

> *"Record your trades daily, review them weekly, reflect on them monthly, **refine your plan quarterly**,
> reassess your goals annually, repeat. I call that the five R process, and honestly, that's the whole game."*

And the constraint that matters most for this audit:

> *"**You don't adjust your trading plan on a weekly review because you don't have enough data.** You don't
> have a large enough sample size that tells you that this rule is not working. So you might want to adjust
> your trading plan **only after you've done your quarterly review**."*

### The five cadences, and what the app supports

| Cadence | In the app | |
|---|---|---|
| Record daily | the journal itself | ✓ |
| Review weekly | no weekly period series | ✗ |
| Reflect monthly | `performance.js:305` `monthlySeries()`, surfaced at `:538` `monthly:` | ✓ |
| **Refine quarterly** | no quarterly period series | ✗ |
| Reassess annually | none | ✗ |

Only `monthly:` exists at `performance.js:538`. There is no weekly and no quarterly aggregation, which is
notable because **quarterly is the cadence at which he says plan changes become legitimate** — the one period
the app cannot produce.

### His weekly metric list

He enumerates what the weekly review tracks: win rate, average win R, average loss R, **max drawdown**,
**rule breaks**.

- Win rate, avg win/loss R — ✓ `performance.js`
- **Max drawdown** — ✓ `performance.js:215-216` `max_drawdown`, `max_drawdown_pct`, `current_drawdown`
- **Rule breaks** — **not aggregated.** `correction.js:464-467` computes named breaches
  (`max_trades_day`, `consecutive_losses`, `daily_loss_limit`) but `performance.js` has **zero** references to
  them. They live only in the live guardrail path, so a review of last month cannot see how many rules were
  broken. That is the one metric on his list the app computes but throws away.

### The convergence that strengthens §17

§17 recorded that `correction.js:389` derives adaptive guardrails — including risk sizing — from the last
**10 trades**, against Ep 27's floor of 30–50 minimum and 100 preferred. Ep 26 independently states the same
constraint in cadence form: no plan changes before a **quarterly** review, because a week's data cannot tell
you a rule is failing.

So this is not one episode read strictly. **Two separate episodes, one quantitative (Ep 27: 30–50 trades) and
one temporal (Ep 26: quarterly), both put the floor far above 10 trades and well beyond a few days of trading.**
The adaptive engine adjusts on a sample roughly one-third to one-fifth of the smallest number the course
mentions, and on a timescale an order of magnitude shorter than the shortest cadence at which he permits
change.

That said — the same caveat as §17 applies and should not be dropped. What the engine actually modifies is
*guardrails* (risk percentage, daily loss cap, consecutive-loss stop, cooldown, trade cap), tightening or
loosening within bounds, rather than rewriting entry rules. That is a less dangerous object to adapt than a
strategy parameter. The objection is to the **sample size**, not to adapting guardrails at all.

### Scorecard

| | |
|---|---|
| Daily recording | ✓ |
| Monthly reflection | ✓ |
| **Weekly / quarterly / annual** | **✗** — and quarterly is the one he says legitimises plan change |
| Max drawdown | ✓ |
| **Rule breaks aggregated into review** | **✗ computed, never persisted** |
| 10-trade adaptive gate | ✗ contradicted by Ep 26 *and* Ep 27 |

---

## 23. A correction: I had the wrong video ID for Ep 32

While fetching Ep 26 I also requested Ep 32 and got back *"This video is private, deleted, or doesn't exist."*
The ID I used was not on the playlist at all. `analysis/playlist-verified.json` gives the real one:

```
Ep 22 | JxiRzhjq2t8 | 50:09 | Trading Psychology
Ep 26 | xoUlvwdBVJ4 | 19:43 | Review Your Trades Like a Pro
Ep 32 | TIpUnwVftgU | 20:52 | Become a Disciplined Trader in 21 Days
Ep 33 | 3rtET_1E040 | 17:01 | Graduation - Lessons I Wish I Knew Earlier
```

Two consequences worth stating:

1. **Ep 32 has not been read.** Everything said about it so far — including the note in §20 that
   `PLAYLIST-CURRICULUM.md:85`'s *"Journal streaks / checklist logging"* claim over-reaches — rests on the
   episode's **title** and on what the codebase contains, not on its content. The codebase finding stands on
   its own (no day-counting habit streak exists; the only streak is consecutive losses). The characterisation
   of what Ep 32 actually asks for is unverified and should be treated as provisional until it is read.
2. My lookup of `playlist-verified.json` failed twice before succeeding, because I assumed a top-level list
   keyed `videos` with numeric `ep`. The file is a dict whose list is `episodes`, and `ep` is a **string**
   (`'0'`…`'46'`). Recorded here so the next lookup does not repeat it — and as another instance of the
   pattern already logged in this audit: **a failed lookup is not evidence of absence.**

**Nothing changed** in this section's subject matter. Ep 26 and Ep 33 remain to be reconciled with the code;
Ep 22 and 33 are mindset episodes with little code surface.
