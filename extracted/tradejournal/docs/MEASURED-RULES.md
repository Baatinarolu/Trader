# Measured rules — where the win rate ceiling actually is

Generated **2026-10-06 11:59 UTC** by `node scripts/rule-sweep.js` — re-run it to reproduce.

* 24 market/timeframe combos, 2000 candles each, signal every 4 bars, costs: **instrument**
* 7580 filled samples → **7028 unique setups** (overlapping re-detections of the same zone collapsed)
* 70 / 30 time split at 2026-09-01 — every rule below is quoted on **both halves**
* 312 (filter × minimum stop distance × minimum first-target R × exit target) combinations evaluated

## The two ceilings

**Highest win rate that holds in both halves — 75.9 % train / 75.3 % test:**

* filter: `ema50+leg` (Displacement leg + 50 EMA alignment)
* minimum stop distance: **1 × ATR**
* exit: flat target at **0.25R**
* whole-sample: 74.6 % net wins over 614 setups, expectancy **-0.09R**

It wins most of the time and still loses money: the target is smaller than the cost of getting in on the tight-stop markets, and the occasional full stop wipes out many small wins.

**Highest expectancy that holds in both halves:**

* `leg` · stop ≥ 0.6 ATR · first target ≥ 3R · exit at **3R** → train 0.31R (34.9 % wins, n=261) / test 0.56R (42.2 % wins, n=109)
* `all` · stop ≥ 0.6 ATR · first target ≥ 3R · exit at **3R** → train 0.30R (34.6 % wins, n=263) / test 0.56R (42.2 % wins, n=109)
* `leg` · stop ≥ 0.5 ATR · first target ≥ 3R · exit at **3R** → train 0.24R (33.2 % wins, n=389) / test 0.35R (38.0 % wins, n=179)
* `all` · stop ≥ 0.5 ATR · first target ≥ 3R · exit at **3R** → train 0.23R (32.9 % wins, n=392) / test 0.35R (38.0 % wins, n=179)
* `leg` · stop ≥ 0.6 ATR · first target ≥ 3R · exit at **2R** → train 0.16R (41.4 % wins, n=261) / test 0.44R (52.3 % wins, n=109)

Every configuration that makes money in both halves earns it from the **tail**: a low win rate with a target several times the stop.

## What this means for the "70 % win rate" goal

* The model can be *given* a 70 %+ win rate — 3 of the 312 configurations cleared it in both halves, the best reaching 75.9 % / 75.3 % — by taking profits very early (0.25R targets).
* Those configurations **lose money** (expectancy -0.09R). 16 configurations make money in both halves, and none of them wins 70 % of the time.
* With the playlist's own management (50 % at the first structural target, stop to break-even, runner) the pooled win rate is in the high 30s / low 40s and expectancy is around zero.
* Honest conclusion: **a 70 % win rate and a positive expectancy are not both available from this entry model** — the app therefore lets you pick which one you want and shows the measured cost of the other.

---

## The top-down method's own gates (added 2026-10-07)

These are not from the rule sweep above (which replays the *entry model*); they were placed by
measuring live plans across 70 instruments × 5 timeframes on 2026-10-07 and looking for the gap
between coherent and incoherent geometry. The method itself is not yet replayed as a strategy —
see `docs/NOT-IMPLEMENTED.md` §4.5 and §4.10.

| Gate | Threshold | Evidence |
|---|---|---|
| Stop clears the noise | entry-to-stop ≥ **0.25 ATR** | XRPUSDT 5m produced a **10.46R** "plan" off a 0.08-ATR stop — about one spread. Refused |
| The range and the sweep are the same event | risk / range width ≤ **2** | Properly paired plans measured **0.31–1.52**; broken pairings **2.6–22.7** (MSFT 1d 22.7, NVDA 1d 11.6, JP225 1d 13.0, each having printed 0.04–0.10R "plans") |
| The sweep was real | wick ≥ 0.25 ATR | **Informational only** — the method wants price outside and back, so a thin wick does not block a plan |
| The trade is not already gone | remaining travel ≥ **0.5 ×** range | `room_left` is directional since 2026-10-07 (it used `Math.abs`, so a price that had blown *through* the target still read as "room left") |

Live board after all four, 350 symbol × timeframe combos: **6 armed** (BTCUSDT 5m 1.58R, BTCUSD 5m
1.47R, UKOIL 5m 1.11R, USDCAD 5m 1.01R, NZDUSD 1h 0.68R, EURUSD 15m 0.49R), 136 WAIT, 168 NO TRADE,
40 provider misses. Three of the six are below the default 1R floor and are shown flagged.

The step-5 confirmation gate was repaired the same day: it had been permanently false (a `bars_ago`
field that does not exist, and `Math.sign('down')` = NaN), which made conviction tier A unreachable.
Re-measured over 372 windows: confirmation **141** (was **0**), tier A/B **5 / 9** (A was impossible).
