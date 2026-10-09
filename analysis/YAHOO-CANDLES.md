# The Yahoo Finance candle path — what was wrong, what changed, what to check

**Ledger row: M121.** File: `extracted/tradejournal/src/candles.js`.
Raised by you ("there is an issue with the candle calling on yahoo finance"), not by the
course audit. Status: **applied and measured offline; the live path is not verified and
cannot be from this sandbox** — see §5 before concluding anything about your machine.

---

## 1. The one genuine correctness bug

**A crypto `4h` request returned 1h bars labelled `4h`** — `aggregation: null`, no
warning, no error. Same for `3m`.

`getCandles` has four steps: OKX (crypto only) → Yahoo → Yahoo with a fallback ticker →
CoinGecko. Step 2b was:

```js
if (!got && res.fallback) { … interval = info.yahoo || '1h'; got = … }
```

Setting `got` there made step 3 — the branch that fetches a *base* interval and calls
`aggregate()` to build the real timeframe — unreachable. And `res.fallback` is set for
**every** crypto symbol (`CRYPTO_YAHOO[sym] || base + '-USD'`), so the branch was live
whenever OKX was down. `info.yahoo` is `null` for `4h` and `3m`, so `|| '1h'` silently
downgraded the request to hourly and returned those bars as if they were what you asked for.

Proven with a stubbed `global.fetch` (OKX forced to fail, Yahoo answering honestly):

```
BEFORE:  4h  -> median step 1h, expected 4h, MISLABELLED, aggregation=null
         3m  -> median step 1h, expected 3m, MISLABELLED
         URL requested: interval=1h&range=1mo   ← then returned those bars raw

AFTER:   4h  -> median step 4h, expected 4h, OK, aggregation=4×1h
         3m  -> refused: "3m is not served by Yahoo and BTCUSDT has no 3m base
                interval — refusing to analyse the wrong timeframe"
         URL requested: interval=1h&range=6mo   ← sized for 200×4+20 bars, then aggregated
```

**Why this matters more than a charting glitch.** `4h` is the higher-timeframe layer that
sets directional bias — `bots/momentum.js:58`. `getCandles` also feeds `routes/bots.js:71`,
`bots/index.js:617` and `bots/predict.js:906,913,1311,1358,1367`. So while OKX was
unavailable, the top-down process was deciding direction on hourly bars while every label,
log and UI readout said four-hour. `15m`, `1h`, `1d` and `1w` were unaffected, and
non-crypto `4h` went through step 3 correctly — the bug needed the crypto fallback branch.

`3m` is now an **error** rather than a series. That is deliberate: there is no Yahoo
interval for it and no aggregatable base, so any answer would have been invented.

## 2. Six diagnosability / robustness defects on the same path

None of these produce wrong numbers; all of them made a failure unreadable, which is why
the symptom arrived as "an issue with the candle calling" rather than as a cause.

| # | Before | After |
|---|---|---|
| 2 | `fetchJson` threw a bare `HTTP 401` and discarded the body | parses `finance.error` and `chart.error`; `HTTP 401 — Unauthorized: Invalid Crumb` |
| 3 | UA was `Mozilla/5.0 (compatible; TradeJournalPro/2.0)` — the RFC-6570 **bot** format Yahoo's throttle targets | a real Chrome UA |
| 4 | no retry: two hosts, one attempt each, so a transient 429 was a hard failure | retries 429/5xx only, 3 attempts with backoff. **Network errors are still not retried**, so a 14 s timeout stays 14 s and does not become 42 s per symbol |
| 5 | HTTP-200 body carrying `chart.error` collapsed to `no result` | surfaced verbatim, e.g. `No data found, symbol may be delisted` |
| 6 | `lastErr` kept only the last host — a `query1` auth failure hid behind a `query2` network failure | both hosts reported: `query2: … \| query1: …` |
| 7 | `limit` never reached Yahoo: a 15 m call pulled the 60 d maximum (~4 680 bars) to serve a 400-bar default | `rangeFor()` picks the tightest range covering `limit`, never exceeding the interval max → `range=1mo`. ~12× less payload, correspondingly less throttle exposure |

Plus a **spacing guard** after `sanitise`: the median bar gap is compared to
`tfInfo(tf).ms` at 10 % tolerance and the call throws rather than returning mislabelled
bars. Tolerance is calibrated — daily bars with weekend gaps pass, a 4× error is caught.
This is what makes the class of bug in §1 impossible to reintroduce silently, including
from a provider I have not anticipated.

## 3. Verification

`analysis/probe-candles-yahoo.js`, stubbed `fetch`, no network:

| | patched tree | pristine copy of the same file |
|---|---|---|
| passed | **39** | 16 |
| failed | **0** | **13** |
| exit code | 0 | 1 |

The negative control is the point: every one of the 13 pristine failures corresponds to a
row above, so the probe detects the defects it claims instead of passing on both arms.
Reproduce both arms with:

```bash
# the pristine arm — build an unpatched tree from the reference zip
rm -rf /tmp/negctl && mkdir -p /tmp/negctl && cd /tmp && rm -rf pz && mkdir pz && cd pz \
  && unzip -q /home/user/Trader/tradingpro-main.zip \
  && cp -r tradejournal /tmp/negctl/tradejournal \
  && ln -s /home/user/Trader/extracted/tradejournal/node_modules /tmp/negctl/tradejournal/node_modules
cd /home/user/Trader
TJ_ROOT=/tmp/negctl/tradejournal node analysis/probe-candles-yahoo.js   # → 16 passed, 13 failed, exit 1
node analysis/probe-candles-yahoo.js                                   # → 39 passed,  0 failed, exit 0
```

`TJ_ROOT` exists only so this A/B can be run at all; the probe's measurement helpers
(median step, spacing tolerance, formatter) are defined **inside the probe** rather than
taken from the module under test, so both arms are measured identically. The three unit
tests of helpers M121 added are guarded by an export check and skip on a pristine tree,
which is why that arm totals 29 assertions rather than 39.

No regression, and no baseline moves — the harness generates candles from `synth.js` and
never calls `candles.js`:

- `scripts/api-test.js` **121 / 0** (unchanged, after a server restart)
- `npm run test:now` **36 / 0** (unchanged)
- all 21 pre-existing analysis scripts still exit 0; `probe-reverify-applied` 55 / 0
- Baseline 6 reproduces **byte-for-byte**: `n=122 win 18.9% exp −0.0011R PF 1.00`, the only
  differing line being the wall clock

Full measurement record, including the negative-control transcript: `analysis/harness/BASELINE.txt` (M121 section).

## 4. Checked and cleared — recorded so it is not re-investigated

- **Ticker encoding is correct.** `encodeURIComponent` yields `GC%3DF`, `%5EDJI`,
  `%5EGSPC`, `EURUSD%3DX`, `BTC-USDT`; all parse as legal URLs. No mangling bug.
- **The crumb-free design is correct — do not "fix" it by adding a crumb.** The v8 chart
  endpoint needs no cookie and no crumb, and sending one there is a documented cause of
  *persistent 429 price outages*. `401 Invalid Crumb` belongs to `quoteSummary` / v7 quote,
  a different endpoint. If you see that string on a chart call, the cause is elsewhere.
- **No symbol-level fallback from `GC=F` to spot `XAUUSD=X`, deliberately.** `market.js`'s
  `PROXY_NOTE` documents COMEX gold futures as the intended proxy for XAUUSD. Substituting
  spot mid-series would silently change the instrument the method is applied to and mix two
  price levels in one candle array — a worse defect than the outage it would hide.

## 5. What I could not verify, and how to read the error on your machine

**Nothing here contacted Yahoo.** This sandbox completes DNS and TCP to
`query1/query2.finance.yahoo.com` and then resets the TLS handshake at the SNI layer (a
six-host package/VCS allowlist, `ANALYSIS.md` §3). A live call throws `ECONNRESET`, which
is not an HTTP status — so no conclusion about real 401/403/429 behaviour could be drawn
from it, in either direction. The stubbed probe proves request-building, fallback order,
aggregation, the guard and the error reporting. It cannot prove Yahoo *accepts* the
request. **Re-run the probe where the network is open before concluding the live path is
healthy.**

The symptom your server actually logged, before the fix:

```
GET /api/bots/analyse?symbol=XAUUSD&tf=15m&prediction=1&bars=1200 →
  No candles for XAUUSD 4h (aggregate: No candles for XAUUSD 1h (Yahoo: Yahoo GC=F: fetch failed))
GET /api/bots/chart?symbol=XAUUSD&tf=15m&bars=600 →
  No candles for XAUUSD 15m (Yahoo: Yahoo GC=F: fetch failed)
```

Note what that costs you: `fetch failed` names no host, no interval, no range and no
reason, and a `4h` failure was reported as an `1h` failure because the aggregation wrapper
re-wrapped the inner message. The same call now reads:

```
No candles for XAUUSD 15m (Yahoo: Yahoo GC=F [15m/1mo]: query2: fetch failed | query1: fetch failed)
```

**So: reproduce it once on your machine and read the message.** The tail now identifies the
cause directly:

| the error says | it means |
|---|---|
| `fetch failed` / `ECONNRESET` / `ETIMEDOUT` on both hosts | network, DNS, proxy or firewall between you and Yahoo — not the code. Check `curl -sv 'https://query2.finance.yahoo.com/v8/finance/chart/GC%3DF?range=1mo&interval=15m'` |
| `HTTP 401 — Unauthorized: Invalid Crumb` | something on the path is adding auth to a chart call. The code does not |
| `HTTP 403` | Yahoo is blocking the client — usually IP reputation or a datacenter range |
| `HTTP 429 (rate limited)` after 3 attempts | genuinely throttled. Back off; the range sizing already cut payload ~12× |
| `HTTP 404` / `No data found, symbol may be delisted` | the ticker itself. For XAUUSD that is `GC=F`, COMEX front-month — it has session hours and a daily halt, and no data at all over weekends |
| `no usable bars in N timestamps (all OHLC null)` | Yahoo knows the symbol but returned no quotes — outside session hours, or a holiday |
| `returned bars spaced X apart, not Y — refusing to analyse the wrong timeframe` | the new guard firing. This is the §1 bug class, now caught loudly instead of silently |

Two things about XAUUSD specifically that are **design, not defects**, and are worth
knowing when you read its chart: `GC=F` is futures, so its levels carry a basis against
spot gold and it does not trade continuously — a liquidity sweep visible on spot may not
appear on the futures proxy. And the `4h` line in that first error is the HTF bias layer
failing, which is why a 15 m chart request can fail on a 4 h fetch.

### 5.1 Added after your `XAUUSD 1w` report (M122) — reading the two failure families apart

You reported:

```
Analysis failed: No candles for XAUUSD 1w (Yahoo: Yahoo GC=F [1wk/5y]: query2: fetch failed | query1: fetch failed)
```

That message was already the *improved* M121 format — it names the host, the proxy ticker,
the interval and the range, and reports both Yahoo hosts rather than only the last. What it
still did not tell you is **which family** of failure it was, and that is the part that
decides what to do next. `fetch failed` is undici's bare message for *every* transport
failure; the real evidence sits in `e.cause.code`, which was being thrown away. A DNS
failure, a refused connection and a TLS reset all printed identically — and none of them
could be distinguished from a symbol Yahoo does not serve.

Two changes, both in `src/candles.js`:

1. **The cause code is now surfaced.** `fetch failed` becomes `fetch failed (ECONNRESET)`.
2. **A classification is appended when — and only when — every provider failed at the
   transport layer.** `netHint()` returns a hint only if *all* entries in the error list
   match a transport marker, so it can never claim "unreachable" while some host was in
   fact answering with a 404 or a 429.

The same request now reads:

```
No candles for XAUUSD 1w (Yahoo: Yahoo GC=F [1wk/5y]: query2: fetch failed (ECONNRESET) |
query1: fetch failed (ECONNRESET)) [network: every provider failed at the transport layer,
so the data hosts were unreachable from this machine. That is a connectivity problem, not a
bad symbol, an unsupported interval, or an empty dataset — no data source replied at all.]
```

**How to read it:**

| the message ends with | it means | what to do |
|---|---|---|
| `[network: every provider failed at the transport layer …]` | nothing replied. DNS, TCP, TLS, proxy or firewall | stop debugging the symbol — it was never reached. Test with the `curl -sv` one-liner in §5 |
| no such marker, but an `HTTP 4xx/5xx` in the list | at least one host **answered** | read the status; the symbol, the crumb, the throttle or the dataset is the problem, per the §5 table |

The distinction is deliberately asymmetric and the asymmetry is tested: a classifier that
labels everything "unreachable" is worse than no classifier, because it sends you to fix
your network when the actual problem is a ticker. `probe-candles-yahoo.js` asserts both
directions — a mixed list (one transport failure *and* one 404) must yield **no** hint, and
a 404 end-to-end must withhold it. That probe went 39/0 → 51/0.

**In this specific instance the classification is correct and the cause is environmental.**
Measured from the sandbox that was serving you: DNS resolves (`query2` → 74.6.160.107,
`query1` → 69.147.80.15), TCP 443 connects, and the TLS handshake is then reset
(`ECONNRESET`, *"Client network socket disconnected before secure TLS connection was
established"*) — while `api.github.com` and `registry.npmjs.org` return 200 from the same
process at the same moment. That is a per-host allowlist on the sandbox, not a Yahoo outage
and not a defect in this code. **No change to this repository can make the preview fetch
live candles**; run the app on your own machine for that. What the fix buys you is that the
message now says so, instead of leaving you to guess.

## 6. Running the app when no market-data host is reachable (M123)

§5 explains why the live path cannot work from some hosts. This is what to do about it.

**Real candles — run it on your own machine.** The patched source is not committed; it
lives in `analysis/patches/applied-so-far.patch`. From a clone of this repository:

```bash
bash analysis/restore-workspace.sh        # skeleton + pristine src + the patch, then npm install
cd extracted/tradejournal && node server.js
```

Note that `restore-workspace.sh` is not "unzip the fixed zip": `tradingpro-fixed.zip`
already contains the previous session's fixes, so the patch — a diff from *pristine* —
fails 11 hunks on top of it. The script rebuilds `src` as pristine + patch and then proves
the result by content, one sentinel per changed file.

**Demo candles — set `TJ_OFFLINE_CANDLES=1`.** This makes every symbol and timeframe
answer with a deterministic synthetic walk, so the UI, the engine and the tests can be
exercised with no network at all:

```bash
TJ_OFFLINE_CANDLES=1 node server.js
```

It is **off by default** and it is not a fallback: nothing is silently substituted. When
it is on, every response is labelled in three places — `meta.provider` = `offline-synthetic`,
`meta.demo` = `true`, and `meta.warning` carrying the sentence *"OFFLINE DEMO DATA — these
bars were generated on this machine because no market-data host was reachable. They are
synthetic, not prices, and must not be used for a trading decision."* A caller can refuse to
render it by checking one field. The bars are seeded from symbol + timeframe, so the same
request always returns the same series and a UI regression is reproducible, and all five
timeframes of one symbol agree on the current price.

**Caveat, checked rather than assumed.** The warning reaches the API — `OFFLINE DEMO DATA…` and
`provider: offline-synthetic` are present in the `/analyse`, `/chart` and `/candles` responses — but
`demo: true` survives only on `/candles` (the other two rebuild their own meta and drop the boolean),
and `public/` contains no reference to `warnings`, `demo` or `offline-synthetic`. **So the browser UI
shows none of it.** The labelling is at the API boundary, not on screen, and until a visible banner is
added the only cue is whatever labels the process. Treat that as an open item, not as done.

**Do not read anything into the analysis it produces.** The walk is a random series with a
slow regime drift so the structure engines have something to find; it carries no information
about any real market. It is for exercising the product, nothing more.

What it unlocked in this sandbox, measured with the flag on: `topdown-test` 66/0 and
`chart-test` 36/0, which previously crashed inside `getCandles`; `bots-test` 203 passed / 2
failed, where it previously crashed at line 71 and reached none of its assertions;
`api-test` 121/0 and `now-test` 36/0 unchanged. Those two `bots-test` failures are tracked
as **M124** — `chart()` and `analyse()` disagreeing about the same bar — which was proved
pre-existing on a pristine tree, and had simply never been reached before.
