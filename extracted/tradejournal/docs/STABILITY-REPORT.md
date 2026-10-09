# Stability report — does the shape hold in both halves of the window?

Generated **2026-10-06 11:40:06 UTC** by `node scripts/stability-report.js --markets "BTCUSDT:1h,BTCUSDT:4h,BTCUSDT:1d,ETHUSDT:1h,ETHUSDT:4h,SOLUSDT:1h,XRPUSDT:1h,ETHUSDT:1d" --bars 4000 --step 6 --modes entry,leg --split 0.5` — re-run it to reproduce.

* 8 markets × entry/leg entry policies, 4000 candles requested, signal every 6 bars, every trade charged its own instrument's cost.
* Each market is split **in half by time** (not 70/30): early 993 vs late 1007 filled setups pooled. A shape whose expectancy changes sign between halves is a regime artefact, not an edge.

## Pooled, both halves

| shape | early n | early win | early exp | late n | late win | late exp | sign agrees |
|---|---|---|---|---|---|---|---|
| Video plan (50 % at T1 → BE → runner) | 993 | 42.4% | -0.01R | 1007 | 41.3% | -0.02R | yes |
| Video plan + measured shape (leg + stop ≥ 0.6 ATR + target ≥ 3R) | 43 | 23.3% | 0.18R | 35 | 11.4% | -0.55R | **no** |
| Whole position at 1R | 993 | 48.2% | -0.20R | 1007 | 52.0% | -0.13R | yes |
| Whole position at 1R + cost floor (leg + stop ≥ 0.6 ATR) | 711 | 48.7% | -0.15R | 749 | 50.7% | -0.11R | yes |
| Whole position at 3R | 993 | 32.5% | 0.11R | 1007 | 31.6% | 0.05R | yes |
| Whole position at 3R + measured shape (leg + stop ≥ 0.6 ATR + target ≥ 3R) | 43 | 23.3% | -0.22R | 35 | 14.3% | -0.57R | yes |

Shapes whose expectancy keeps its sign in both halves (n ≥ 40): Video plan (50 % at T1 → BE → runner) (-0.01R → -0.02R); Whole position at 1R (-0.20R → -0.13R); Whole position at 1R + cost floor (leg + stop ≥ 0.6 ATR) (-0.15R → -0.11R); Whole position at 3R (0.11R → 0.05R); Whole position at 3R + measured shape (leg + stop ≥ 0.6 ATR + target ≥ 3R) (-0.22R → -0.57R).

## Per market — the measured maximum-expectancy shape (leg + stop ≥ 0.6 ATR + 3R target, whole position at 3R)

| market | bars | early → late | early n / exp | late n / exp | sign agrees | gate pass (stop ≥0.6 ATR / target ≥3R) |
|---|---|---|---|---|---|---|
| BTCUSDT:1h | 1440 | 2026-08-07 → 2026-10-06 | 6 / -0.55R | 7 / -0.12R | yes | 71.5% / 18.1% |
| BTCUSDT:4h | 1440 | 2026-02-08 → 2026-10-06 | 2 / -1.09R | 2 / -1.13R | yes | 81.4% / 5.0% |
| BTCUSDT:1d | 1440 | 2022-10-27 → 2026-10-05 | 2 / -1.01R | 2 / -1.03R | yes | 69.5% / 13.0% |
| ETHUSDT:1h | 1440 | 2026-08-07 → 2026-10-06 | 16 / -0.22R | 1 / 2.50R | **no** | 79.4% / 12.2% |
| ETHUSDT:4h | 1440 | 2026-02-08 → 2026-10-06 | 3 / 2.88R | 6 / -1.12R | **no** | 79.4% / 8.6% |
| SOLUSDT:1h | 1440 | 2026-08-07 → 2026-10-06 | 3 / -1.05R | 3 / 1.42R | **no** | 63.9% / 14.1% |
| XRPUSDT:1h | 1440 | 2026-08-07 → 2026-10-06 | 6 / -1.13R | 5 / -1.09R | yes | 78.7% / 13.2% |
| ETHUSDT:1d | 1440 | 2022-10-27 → 2026-10-05 | 5 / 0.54R | 9 / -1.04R | **no** | 57.5% / 21.9% |

## Every shape, pooled (all / early / late)

| shape | all n | all win | all exp | all ≥ +0.5R |
|---|---|---|---|---|
| Video plan (50 % at T1 → BE → runner) | 2000 | 41.9% | -0.02R | 31.6% |
| Video plan + measured shape (leg + stop ≥ 0.6 ATR + target ≥ 3R) | 78 | 17.9% | -0.15R | 17.9% |
| Whole position at 1R | 2000 | 50.1% | -0.16R | 47.9% |
| Whole position at 1R + cost floor (leg + stop ≥ 0.6 ATR) | 1460 | 49.7% | -0.13R | 48.8% |
| Whole position at 3R | 2000 | 32.0% | 0.08R | 31.1% |
| Whole position at 3R + measured shape (leg + stop ≥ 0.6 ATR + target ≥ 3R) | 78 | 19.2% | -0.38R | 19.2% |

*Note:* per-market rows are small by construction — a 4 000-bar window on a 1h timeframe is ~5 months of candles, and the measured shape passes its gates on a minority of setups. Read the pooled rows as the result and the per-market rows as a consistency check.
