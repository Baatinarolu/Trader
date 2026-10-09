# MTF report — does waiting for the lower-timeframe confirmation pay?

Generated **2026-10-06 11:58 UTC** by `node scripts/mtf-report.js` — re-run it to reproduce.

* 24 market/timeframe combos, identical candles and window for both entry rules, costs: **instrument**, signal every 4 bars
* **base** = first touch of the higher-timeframe zone (the model as built)
* **mtf** = same setup, but the fill only happens where the lower timeframe 
  3m→1m, 5m→1m, 15m→5m, 30m→15m, 1h→15m, 4h→1h, 1d→4h, 1w→1d sweeps liquidity **and** prints a displacement candle inside that zone; the entry is the confirmation bar close and the targets are re-ruled from that price
* **paired** = only the setups where *both* rules filled — a window or sample effect cannot hide in this column

## Pooled

| rule | filled trades | win % (video plan) | ≥ +0.5R | expectancy | first target hit |
|---|---|---|---|---|---|
| base (first touch) | 1902 | 35.1% | 30.8% | -0.01R | 34.0% |
| mtf (lower-timeframe confirmation) | 1696 | 47.4% | 18.5% | -0.21R | 50.3% |

Setups the model proposed but the lower timeframe never confirmed: **1601** (these are the trades the refined rule refuses to take).

## Paired — the same setups, both rules

| rule | setups | win % | ≥ +0.5R | expectancy | first target hit |
|---|---|---|---|---|---|
| base | 1503 | 35.5% | 30.6% | -0.02R | 34.9% |
| mtf | 1503 | 41.5% | 17.6% | -0.29R | 44.5% |
| **difference** | — | +6.0 pts | -13.0 pts | -0.268R | — |

## Per market

| market | LTF | LTF bars | window | dates | base fills / win / exp | mtf fills / win / exp | paired n | paired Δwin | paired Δexp |
|---|---|---|---|---|---|---|---|---|---|
| XAUUSD:15m | 5m | 2760 | 900 bars | 2026-09-22 → 2026-10-06 | 133 / 21.1% / -0.34R | 131 / 36.6% / -0.50R | 114 | +6.1 | -0.333R |
| XAUUSD:1h | 15m | 3000 | 745 bars | 2026-08-20 → 2026-10-06 | 120 / 30.8% / -0.04R | 131 / 45.0% / -0.13R | 113 | +6.2 | -0.197R |
| XAUUSD:4h | 1h | 3000 | 745 bars | 2026-03-31 → 2026-10-06 | 130 / 30.0% / 0.06R | 116 / 49.1% / -0.13R | 105 | +21.0 | +0.152R |
| EURUSD:1h | 15m | 3000 | 745 bars | 2026-08-24 → 2026-10-06 | 72 / 43.1% / 0.20R | 73 / 65.8% / 0.33R | 55 | +1.8 | -0.261R |
| GBPUSD:1h | 15m | 3000 | 745 bars | 2026-08-24 → 2026-10-06 | 125 / 36.8% / -0.09R | 123 / 43.9% / -0.24R | 111 | -2.7 | -0.372R |
| AUDUSD:1h | 15m | 3000 | 745 bars | 2026-08-24 → 2026-10-06 | 101 / 21.8% / -0.70R | 94 / 24.5% / -0.75R | 93 | +1.1 | -0.064R |
| USDJPY:1h | 15m | 3000 | 745 bars | 2026-08-24 → 2026-10-06 | 83 / 42.2% / 0.09R | 79 / 48.1% / -0.14R | 63 | -9.5 | -0.575R |
| BTCUSDT:1h | 15m | 1440 | 355 bars | 2026-09-21 → 2026-10-06 | 44 / 61.4% / 0.78R | 41 / 58.5% / 0.09R | 34 | 0.0 | -0.405R |
| BTCUSDT:4h | 1h | 1440 | 355 bars | 2026-08-08 → 2026-10-06 | 42 / 50.0% / 0.01R | 34 / 23.5% / -0.62R | 34 | -23.5 | -0.463R |
| ETHUSDT:1h | 15m | 1440 | 355 bars | 2026-09-21 → 2026-10-06 | 41 / 43.9% / 0.09R | 23 / 43.5% / -0.35R | 23 | -4.3 | -0.537R |
| ETHUSDT:4h | 1h | 1440 | 355 bars | 2026-08-08 → 2026-10-06 | 30 / 53.3% / 0.13R | 27 / 70.4% / 0.17R | 20 | -5.0 | -0.548R |
| SOLUSDT:1h | 15m | 1440 | 355 bars | 2026-09-21 → 2026-10-06 | 37 / 40.5% / -0.09R | 34 / 50.0% / -0.31R | 32 | +12.5 | -0.127R |
| XRPUSDT:1h | 15m | 1440 | 355 bars | 2026-09-21 → 2026-10-06 | 48 / 58.3% / 0.63R | 55 / 70.9% / 0.16R | 42 | +7.1 | -0.591R |
| AAPL:1h | 15m | 1561 | 385 bars | 2026-07-20 → 2026-10-05 | 67 / 40.3% / 0.18R | 40 / 52.5% / -0.01R | 40 | +7.5 | -0.604R |
| TSLA:1h | 15m | 1561 | 385 bars | 2026-07-20 → 2026-10-05 | 63 / 54.0% / 1.06R | 43 / 62.8% / -0.02R | 43 | +9.3 | -1.164R |
| SPY:1h | 15m | 1561 | 385 bars | 2026-07-20 → 2026-10-05 | 56 / 48.2% / 0.30R | 47 / 55.3% / 0.24R | 41 | +2.4 | +0.192R |
| ES:1h | 15m | 3000 | 745 bars | 2026-08-20 → 2026-10-06 | 134 / 37.3% / 0.01R | 113 / 51.3% / -0.17R | 101 | +1.0 | -0.553R |
| NQ:1h | 15m | 3000 | 745 bars | 2026-08-19 → 2026-10-06 | 123 / 26.0% / -0.26R | 123 / 50.4% / -0.28R | 97 | +9.3 | -0.252R |
| US30:1h | 15m | 1561 | 385 bars | 2026-07-20 → 2026-10-05 | 43 / 23.3% / -0.09R | 30 / 33.3% / -0.42R | 29 | +17.2 | +0.186R |
| NAS100:1h | 15m | 1561 | 385 bars | 2026-07-20 → 2026-10-05 | 41 / 56.1% / 0.91R | 24 / 83.3% / 0.13R | 16 | +12.5 | -0.991R |
| SPX500:1h | 15m | 1561 | 385 bars | 2026-07-20 → 2026-10-05 | 57 / 31.6% / -0.16R | 46 / 37.0% / -0.44R | 42 | +9.5 | +0.099R |
| GER40:1h | 15m | 2026 | 501 bars | 2026-07-21 → 2026-10-06 | 78 / 38.5% / 0.22R | 65 / 47.7% / -0.18R | 64 | +7.8 | -0.389R |
| XAGUSD:1h | 15m | 3000 | 745 bars | 2026-08-20 → 2026-10-06 | 113 / 26.5% / -0.19R | 108 / 46.3% / -0.25R | 103 | +21.4 | +0.079R |
| USOIL:1h | 15m | 3000 | 745 bars | 2026-08-19 → 2026-10-06 | 121 / 19.8% / -0.58R | 96 / 39.6% / -0.45R | 88 | +9.1 | -0.098R |

**Verdict.** Waiting for the lower timeframe **raised** the win rate on identical setups. Expectancy got worse. It helped on **18 of 24** markets by win rate and on **5 of 24** by expectancy — so the pooled line is a balance of two different market behaviours, not a uniform effect. Both rules are still judged against the break-even each exit needs — see docs/EDGE-REPORT.md §0b for that arithmetic.

**What the refusals cost and saved.** Of the 1601 setups the lower timeframe never confirmed, **321** were filled and graded by the base rule anyway. Refusing a trade is only right if those trades were bad — the base rule's score on exactly that refused subset is the test.

*Reproducibility note:* the candle window ends at run time, so a re-run later in the day differs in the last bars — two runs on 2026-10-06 moved the pooled MTF win rate by **0.4 points** and the paired count by 5 setups. Treat the per-market rows as ±1 point and re-run the script yourself before quoting a figure.
*Provider note:* the lower timeframe caps the window (see the LTF bars column). A 1h zone needs 15m data, and the free feeds return ~1 400–3 000 bars of it, which is 360–750 hours of higher-timeframe history — so this test runs on far less history than the main edge report, and thin per-market rows are thin for that reason, not because the rule is unstable.

