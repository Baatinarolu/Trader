# Edge report — what win rate does the SMC model actually produce?

Generated **2026-10-06 11:57:05 UTC** by `node scripts/edge-report.js` — re-run it yourself to reproduce every number below.

* pooled trades: **11964** filled samples, **11411 unique setups** once overlapping samples are collapsed (the same zone is sampled on consecutive bars, so raw counts are correlated — `--dedupe 0` to see the raw pool)
* 24 market/timeframe combos, 4 entry policies (`entry`, `leg`, `ote`, `mtf`)
* `mtf` = the refined entry: the HTF zone decides the trade, the lower timeframe (5m for 15m, 15m for 1h, 1h for 4h) must sweep liquidity **and** print a displacement candle inside the zone before the entry fires; the fill is a market entry at that confirmation close, so its window is limited by how much lower-timeframe history the data source returns (3 000 bars ≈ 750 higher-timeframe bars).
* 11411 filled trades pooled · search set 7985 · untouched test set 3426 (split at 2026-09-05)
* candles: 2000 bars per market, signal every 6 bars; **costs are charged per instrument** — spread + slippage + commission per asset class, in basis points of price, turned into R by the trade's own stop distance (`--cost instrument`; mean 0.096R, median 0.049R per trade). Pass `--cost flat` to reproduce the older 0.05R figures.
* trades whose stop sat closer than 0.25 × ATR were dropped (0 of 11411): at that distance R is a meaningless unit
* median expectancy is reported next to the mean, because one 9R tail trade can carry an average
* **a win = net ≥ +0.5R.** A scratched runner or a +0.2R scalp counts as *not* a win here.

## 0. What each trade paid to get in

Round-trip cost in R, per market, measured on the pooled trades (spread + slippage + commission from `src/instruments.js`, converted to R by each trade's stop distance). A 15m FX entry with a 5-pip stop pays a very different bill from a 1h gold entry with a $35 stop — that difference is real money and it is why win rates below are read against the break-even column.

| market | trades | median cost | mean cost | worst trade |
|---|---|---|---|---|
| BTCUSDT:1h | 290 | 0.227R | 0.313R | 1.718R |
| SOLUSDT:1h | 362 | 0.214R | 0.267R | 0.986R |
| ETHUSDT:1h | 381 | 0.213R | 0.239R | 0.797R |
| GBPUSD:1h | 342 | 0.209R | 0.253R | 1.148R |
| EURUSD:1h | 291 | 0.196R | 0.273R | 0.993R |
| AUDUSD:1h | 347 | 0.170R | 0.202R | 0.610R |
| USDJPY:1h | 472 | 0.164R | 0.195R | 0.647R |
| BTCUSDT:4h | 472 | 0.128R | 0.142R | 0.510R |
| XRPUSDT:1h | 340 | 0.124R | 0.156R | 1.161R |
| ETHUSDT:4h | 364 | 0.084R | 0.104R | 0.345R |
| USOIL:1h | 532 | 0.072R | 0.087R | 0.335R |
| ES:1h | 572 | 0.069R | 0.083R | 0.320R |
| NQ:1h | 527 | 0.049R | 0.055R | 0.189R |
| XAUUSD:15m | 623 | 0.042R | 0.044R | 0.193R |
| AAPL:1h | 564 | 0.032R | 0.036R | 0.105R |
| SPX500:1h | 619 | 0.032R | 0.040R | 0.178R |
| SPY:1h | 617 | 0.032R | 0.043R | 0.184R |
| GER40:1h | 582 | 0.031R | 0.036R | 0.105R |
| XAGUSD:1h | 608 | 0.031R | 0.035R | 0.119R |
| US30:1h | 579 | 0.030R | 0.035R | 0.131R |
| XAUUSD:1h | 578 | 0.025R | 0.026R | 0.058R |
| NAS100:1h | 576 | 0.021R | 0.026R | 0.091R |
| TSLA:1h | 522 | 0.021R | 0.024R | 0.059R |
| XAUUSD:4h | 251 | 0.008R | 0.010R | 0.034R |

## 0b. Win rate is a dial you set with the target — the measured curve

Each row is a plain flat exit: take the whole position off at `x`R, no partials, no break-even. Two different numbers are easy to confuse, so both are shown:

* **target touched** — how often price reached `x`R before the stop. This is the *mechanical* hit rate of the exit.
* **net win** — how often the trade actually finished in profit **after costs**. For small targets these diverge, because the round-trip cost is subtracted from the `x`R you banked: if the cost exceeds the target, a "winning" exit still loses money.

| target | trades | target touched | net win | net ≥ +0.5R | expectancy | break-even needed | margin |
|---|---|---|---|---|---|---|---|
| 0.15R | 11411 | 61.90% | 51.37% | 0.00% | -0.38R | 95.29% | -43.9 pts |
| 0.25R | 11411 | 60.13% | 55.16% | 0.00% | -0.34R | 87.67% | -32.5 pts |
| 0.35R | 11411 | 58.18% | 55.81% | 0.00% | -0.31R | 81.17% | -25.4 pts |
| 0.40R | 11411 | 57.07% | 55.60% | 0.00% | -0.30R | 78.27% | -22.7 pts |
| 0.50R | 11411 | 55.09% | 54.41% | 0.00% | -0.27R | 73.05% | -18.6 pts |
| 0.60R | 11411 | 52.91% | 52.71% | 38.20% | -0.25R | 68.49% | -15.8 pts |
| 0.75R | 11411 | 49.69% | 49.72% | 45.03% | -0.22R | 62.62% | -12.9 pts |
| 1.00R | 11411 | 45.52% | 45.78% | 44.87% | -0.18R | 54.79% | -9.0 pts |
| 1.25R | 11411 | 41.57% | 42.04% | 41.57% | -0.15R | 48.70% | -6.7 pts |
| 1.50R | 11411 | 38.48% | 39.07% | 38.70% | -0.12R | 43.83% | -4.8 pts |
| 2.00R | 11411 | 34.00% | 34.84% | 34.40% | -0.06R | 36.53% | -1.7 pts |
| 2.50R | 11411 | 29.94% | 31.03% | 30.51% | -0.03R | 31.31% | -0.3 pts |
| 3.00R | 11411 | 25.71% | 27.07% | 26.51% | -0.04R | 27.40% | -0.3 pts |

**No target distance reached a 70 % mechanical hit rate on this pool.**
**No target distance reached a 70 % net win rate on this pool** — the net win rate peaks at 55.81% and falls away on both sides of the peak.
**No target distance earned a positive expectancy on this pool.**

### Can any filter reach 70 % and still earn? (0 of 252 single/pair filters reach 70 % win at some target on the test window; 0 of them keep a positive expectancy there)

**No single or paired filter reaches a 70 % win rate at any target distance while keeping a positive expectancy on the test window.** The closest win-rate outcomes and the most profitable filters are listed below so the trade-off is visible rather than hidden.

Highest win rate at any target (test window):

| filter | test trades | best target | win % | expectancy there | its best expectancy (any target) |
|---|---|---|---|---|---|
| `ema50+dist_ema>=1atr` | 176 | 0.25R | 67.05% | -0.22R | -0.20R @ 0.40R |
| `range+bias` | 408 | 0.50R | 64.46% | -0.14R | 0.11R @ 2.50R |
| `range+macd` | 393 | 0.60R | 64.38% | -0.10R | 0.17R @ 2.50R |
| `entry+ema50` | 422 | 0.25R | 62.32% | -0.29R | -0.22R @ 0.75R |
| `range+ote` | 255 | 0.35R | 61.96% | -0.24R | 0.05R @ 2.50R |
| `ema50+sweep<=5bar` | 404 | 0.25R | 61.63% | -0.30R | -0.22R @ 0.75R |
| `structure+ema50` | 383 | 0.25R | 61.36% | -0.30R | -0.25R @ 0.75R |
| `ote+dist_ema>=1atr` | 271 | 0.25R | 61.25% | -0.28R | 0.06R @ 3.00R |
| `grade>=A+sweep<=5bar` | 682 | 0.35R | 60.85% | -0.27R | -0.11R @ 2.50R |
| `ema50+order_block` | 471 | 0.25R | 60.08% | -0.32R | -0.24R @ 0.75R |

Most profitable filters (test window):

| filter | test trades | best target | expectancy | win % there | needs to break even |
|---|---|---|---|---|---|
| `rr>=2+ote` | 120 | 2.50R | 0.19R | 38.33% | 31.31% |
| `range+rr>=2` | 632 | 2.50R | 0.19R | 38.77% | 31.31% |
| `range+macd` | 393 | 2.50R | 0.17R | 38.17% | 31.31% |
| `grade>=A+ote` | 174 | 2.50R | 0.14R | 37.36% | 31.31% |
| `score>=75+ote` | 153 | 2.50R | 0.12R | 37.25% | 31.31% |
| `range+bias` | 408 | 2.50R | 0.11R | 36.27% | 31.31% |
| `range+dist_ema>=1atr` | 1608 | 3.00R | 0.10R | 31.34% | 27.40% |
| `range+htf` | 683 | 3.00R | 0.10R | 30.89% | 27.40% |
| `rr>=2+dist_ema>=1atr` | 850 | 2.50R | 0.09R | 36.12% | 31.31% |
| `range+runway` | 1819 | 2.50R | 0.07R | 34.91% | 31.31% |

## 1. Entry policy, untouched test window

| entry policy | filled trades | video plan (50 % at T1 → BE → runner) | best clean-win exit |
|---|---|---|---|
| entry | 4792 (test 1279) | 36.83% wins · -0.02R avg | flat_1 → 42.46% clean · -0.24R |
| leg | 2622 (test 681) | 37.44% wins · -0.07R avg | flat_0.75 → 43.91% clean · -0.21R |
| ote | 2618 (test 681) | 37.30% wins · -0.07R avg | flat_0.75 → 43.91% clean · -0.21R |
| mtf | 1379 (test 785) | 46.88% wins · -0.27R avg | flat_0.75 → 51.85% clean · -0.11R |

## 1b. Does the hit rate clear the break-even bar anywhere?

For each entry policy, the best and worst exit on the untouched test window (n ≥ 50), with the gap between the clean-win rate actually achieved and the rate that exit needs just to survive. A real edge shows up as a **positive gap on a meaningful sample**.

| entry policy | best exit | expectancy | clean % | needed % | gap | worst exit | gap |
|---|---|---|---|---|---|---|---|
| entry | flat_2.5 (n=1279) | -0.01R | 32.06% | 31.31% | +0.7 pts | flat_0.15 | -95.3 pts |
| leg | flat_3 (n=681) | -0.07R | 26.43% | 27.40% | -1.0 pts | flat_0.15 | -95.3 pts |
| ote | flat_3 (n=681) | -0.07R | 26.43% | 27.40% | -1.0 pts | flat_0.15 | -95.3 pts |
| mtf | flat_2.5 (n=785) | 0.05R | 32.36% | 31.31% | +1.0 pts | flat_0.15 | -95.3 pts |

## 2. Exit frontier on the untouched test window (no filter)

| exit plan | trades | win % | ≥ +0.5R % | expectancy | 5 %-trimmed expectancy | median | break-even win % needed |
|---|---|---|---|---|---|---|---|
| flat_0.15 | 3426 | 48.07% | 0.00% | -0.39R | -0.36R | -0.02R | 95.29% |
| flat_0.25 | 3426 | 54.14% | 0.00% | -0.35R | -0.32R | 0.07R | 87.67% |
| flat_0.35 | 3426 | 55.90% | 0.00% | -0.31R | -0.29R | 0.13R | 81.17% |
| flat_0.4 | 3426 | 56.36% | 0.00% | -0.30R | -0.27R | 0.16R | 78.27% |
| flat_0.5 | 3426 | 56.16% | 0.00% | -0.26R | -0.23R | 0.25R | 73.05% |
| flat_0.6 | 3426 | 55.40% | 35.20% | -0.23R | -0.20R | 0.30R | 68.49% |
| flat_0.75 | 3426 | 52.01% | 44.31% | -0.21R | -0.19R | 0.28R | 62.62% |
| flat_1 | 3426 | 46.47% | 44.48% | -0.19R | -0.19R | -1.01R | 54.79% |
| flat_1.25 | 3426 | 42.91% | 41.80% | -0.16R | -0.17R | -1.02R | 48.70% |
| flat_1.5 | 3426 | 39.84% | 38.76% | -0.14R | -0.15R | -1.02R | 43.83% |
| flat_2 | 3426 | 35.76% | 34.62% | -0.07R | -0.11R | -1.03R | 36.53% |
| flat_2.5 | 3426 | 32.60% | 31.20% | -0.03R | -0.08R | -1.03R | 31.31% |
| flat_3 | 3426 | 28.40% | 26.97% | -0.05R | -0.13R | -1.04R | 27.40% |
| half_05_run1 | 3426 | 36.98% | 24.78% | -0.20R | -0.37R | -0.44R | 62.62% |
| half_05_run15 | 3426 | 36.84% | 25.48% | -0.16R | -0.34R | -0.44R | 54.79% |
| half_05_run2 | 3426 | 36.60% | 24.28% | -0.14R | -0.31R | -0.45R | 48.70% |
| half_06_run15 | 3426 | 36.98% | 25.92% | -0.15R | -0.33R | -0.47R | 53.45% |
| half_075_run2 | 3426 | 36.25% | 24.28% | -0.12R | -0.29R | -0.69R | 46.14% |
| half_1_run2 | 3426 | 36.22% | 25.54% | -0.12R | -0.30R | -1.02R | 43.83% |

## 2b. Second-chance re-entry (take the zone again after a failed first attempt)

| entry policy | stopped before target | re-tapped | fake-out rate | 2nd attempt win % | 2nd attempt expectancy | net effect per trade |
|---|---|---|---|---|---|---|
| entry | 3036 | 3007 | 99.04% | 14.20% | -0.56R | -0.35R |
| leg | 1643 | 1627 | 99.03% | 13.89% | -0.59R | -0.37R |
| ote | 1649 | 1633 | 99.03% | 13.66% | -0.60R | -0.37R |
| mtf | 667 | 664 | 99.55% | 15.21% | -0.67R | -0.32R |

The net-effect column is the honest one: the second attempt adds that much R to **every** trade in the pool, which is what happens to your equity if you systematically re-enter.

## 3. Best filter combinations chosen on the search set

| rule | exit | search: n / clean % / exp | test: n / clean % / exp |
|---|---|---|---|
| range+ema50 | flat_0.75 | 72 · 58.33% · 0.05R | 23 · 52.17% · -0.14R |
| grade>=A+fvg | flat_0.75 | 64 · 56.25% · -0.07R | 12 · 25.00% · -0.30R |
| grade>=A+fvg | flat_1 | 64 · 56.25% · 0.07R | 12 · 41.67% · -0.17R |
| ema50+dist_ema>=1atr | flat_0.6 | 671 · 55.14% · -0.11R | 176 · 41.48% · -0.26R |
| score>=75+fvg | flat_0.75 | 51 · 54.90% · -0.09R | 9 · 22.22% · -0.57R |
| score>=75+fvg | flat_1 | 51 · 54.90% · 0.05R | 9 · 22.22% · -0.48R |
| structure+fvg | flat_0.75 | 53 · 54.72% · -0.11R | 7 · 28.57% · -0.68R |
| range+ema50 | flat_0.6 | 72 · 54.17% · -0.04R | 23 · 30.43% · -0.23R |
| structure+fvg | flat_1 | 53 · 52.83% · -0.01R | 7 · 28.57% · -0.61R |
| ema50+dist_ema>=1atr | flat_0.75 | 671 · 52.46% · -0.12R | 176 · 46.59% · -0.24R |
| htf+fvg | flat_0.75 | 44 · 52.27% · -0.14R | 9 · 22.22% · -0.44R |
| bias+ote | flat_0.75 | 531 · 52.17% · -0.07R | 220 · 34.09% · -0.31R |

## 4. Out of sample survivors (positive expectancy **and** ≥ 50 % clean in both halves)

**None.** No filter × exit combination held a positive expectancy and a ≥ 50 % clean win rate in both halves of the data.

## 5. The 70 % question

* Combinations evaluated: **5149** (300 filter rules × 19 exit plans).
* Rules crossing a **70 % clean win rate** on the test window: **0** (survivor rows additionally require n ≥ 40 in the test window, so thin samples cannot be published as findings).
* 0 of 5149 rule×exit combinations cross 70 % clean win rate on the test window — those are post-hoc picks, and the same table shows how many looked good on the training window and failed.
* Best clean win rate that also has a positive expectancy in *both* halves: none.

### How to read this

A 55 % win rate at a 1:2 target and a 70 % win rate at a 0.5R target are not the same trade — the second one needs a 66 % win rate just to break even. Every table above prints the break-even win rate next to the achieved one so the two can never be confused.

## 6. Per market (video plan, latest replay)

| market | filled | video plan win % | video plan expectancy | 70 % clean met? |
|---|---|---|---|---|
| BTCUSDT:1h | 130 | 30.00% | -0.23R | no |
| ETHUSDT:1h | 172 | 43.60% | 0.00R | no |
| SOLUSDT:1h | 166 | 36.75% | -0.37R | no |
| XRPUSDT:1h | 153 | 39.22% | 0.00R | no |
| XAUUSD:1h | 236 | 31.36% | -0.09R | no |
| XAUUSD:15m | 240 | 31.54% | -0.08R | no |
| XAGUSD:1h | 238 | 34.85% | 0.29R | no |
| EURUSD:1h | 188 | 37.44% | -0.07R | no |
| USDJPY:1h | 198 | 52.02% | 0.15R | no |
| GBPUSD:1h | 211 | 36.79% | -0.20R | no |
| AUDUSD:1h | 207 | 20.19% | -0.75R | no |
| NAS100:1h | 259 | 38.26% | 0.07R | no |
| SPX500:1h | 265 | 35.47% | -0.04R | no |
| US30:1h | 266 | 30.83% | -0.06R | no |
| GER40:1h | 256 | 31.40% | -0.09R | no |
| AAPL:1h | 241 | 31.40% | -0.15R | no |
| TSLA:1h | 226 | 46.96% | 0.56R | no |
| USOIL:1h | 221 | 21.97% | -0.56R | no |
| ES:1h | 248 | 44.35% | 0.09R | no |
| NQ:1h | 232 | 36.21% | 0.11R | no |
| SPY:1h | 262 | 41.22% | 0.08R | no |
| BTCUSDT:4h | 210 | 45.71% | 0.13R | no |
| ETHUSDT:4h | 153 | 43.14% | -0.08R | no |
| XAUUSD:4h | 77 | 27.50% | 0.01R | no |

> These are walk-forward replays of the bot's own entry model on ~2 months of recent candles per market. One regime, one model, no live fills — read them as *what this model did*, never as a promise of what it will do.
