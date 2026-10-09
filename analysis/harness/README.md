# Independent backtest harness

Rebuilt this pass. `analysis/fixtures/` and `analysis/harness/` were lost in a workspace
reset; this is the replacement, and it is the gate for the whole entry-model batch — nothing in
Batches 2–4 can be measured without it.

```
analysis/harness/
  synth.js       seeded synthetic OHLC generator
  backtest.js    walk-forward engine driving the REAL smc.js + setup.js
  BASELINE.txt   the current numbers, for diffing against after a change
```

Run it:

```
node analysis/harness/backtest.js --seeds 20 --bars 1500 --window 300
node analysis/harness/backtest.js --all-status      # also take 'waiting'/'approaching'
```

Deterministic: two runs with the same flags produce identical output (verified by hashing the
summary line). `--seeds 20 --bars 1500` takes ~23 s.

## What it actually calls

It does **not** re-implement the strategy. It calls the same two functions the server calls:

```js
SMC.analyse(candles, { tf: '15m', htfCandles })   // src/bots/smc.js
Setup.buildSetups(analysis, ctx)                  // src/bots/setup.js
```

and then simulates the entry, stop and first target that the engine itself produced. So a change
to `setup.js` shows up here directly.

## ⚠ The data is synthetic

`synth.js` generates everything from a seeded PRNG. **No expectancy figure from this harness
establishes real-market edge.** What it measures is whether the entry/stop/target logic is
*internally consistent* — profitable on data that contains the structure the method claims to
exploit (regime switching, volatility clustering, deliberate liquidity sweeps, displacement legs).
A random walk would be useless for this because it has no liquidity to sweep and no zones to
mitigate, so the method would have nothing to detect.

## Methodology

- At bar `i` the engine sees only `candles[0..i]`. No lookahead.
- Signal acted on from bar `i+1`.
- **Only `entry_status === 'at-entry'`** signals are taken by default. The engine's own wording
  for the other two: `waiting` → *"Chasing here breaks the model's edge"* (`setup.js:346`),
  `approaching` → set an alert. Of 318 raw signals on one seed, 254 were `waiting`, 44
  `approaching`, 20 `at-entry`.
- **Two-phase limit-order simulation:** wait for price to actually reach the entry level
  (`--fillwindow`, default 12 bars), then manage stop/target (`--maxbars`, default 20).
- Single target = `targets[0]`. The code ships a 3-target ladder with a 50 % partial (M51,
  unresolved); T1 alone is the conservative single-target read.
- Same-bar ambiguity resolves to the **stop** — deliberately pessimistic.
- One position at a time, plus a `--cooldown` (12 bars) before re-entry.
- `R = (exit − entry) / (entry − stop)`, sign-corrected.

## The two bugs it took to get sane numbers

Both produced numbers that looked like findings. Neither was.

1. **No time limit.** Trades were allowed to run to the end of the series, so "price eventually
   reaches the target" scored as an edge. Result: **+12.8R expectancy, 92 % win rate.** Fixed by
   `--maxbars`. Ep 27 supplies the real guidance: trades should last 30–50 minutes, 100 preferred
   — 2–7 bars on 15m, so 20 is already generous.
2. **Assuming the limit order fills instantly.** The engine emits an entry *price* that can be far
   from market. One signal said sell at 1.0351 while price was 0.9577 — a limit 8 % away that will
   never fill — and the harness scored it as a win at 35R. Result: **avg declared RR 14.9R,
   expectancy +14.4R.** Fixed by the two-phase fill simulation and the `at-entry` gate.

The tell, both times, was the same: **realised R ≈ declared R with a ~90 % hit rate.** If the
declared and realised figures agree that closely, the simulation is not simulating anything.

## Baseline (current `src/`, with Batch 0 + M9 + M16 applied)

`--seeds 20 --bars 1500 --window 300`, 121 trades:

| Cut | n | win | expectancy | PF |
|---|---|---|---|---|
| all `ok===true` | 121 | 21.5 % | **−0.3113R** | 0.47 |
| grade A | 57 | 21.1 % | −0.2916R | 0.55 |
| grade B | 53 | 20.8 % | −0.3696R | 0.35 |
| grade C | 11 | 27.3 % | −0.1328R | 0.57 |
| A+ and A only | 57 | 21.1 % | −0.2916R | 0.55 |
| B and C only | 64 | 21.9 % | −0.3289R | 0.37 |

Outcomes: target 20 · stop 70 · expired 9. Avg declared RR 3.90R vs realised −0.311R.

### What this says

- **No edge, and the sign matches the earlier independent run** (−0.125R on the lost harness).
  Different magnitude, same conclusion. The magnitudes are not comparable across harnesses — this
  one is stricter (limit fills, bounded trade life, `at-entry` gate).
- **The M95 gate position barely matters here.** Dropping B and C changes expectancy by only
  **+0.0197R**. So the decision to keep B and C tradeable costs almost nothing *on this data* —
  which means the argument for M58 (grade → position size) is about risk control and consistency,
  not about expectancy.
- **The grade ladder is not monotonic** — C did best (−0.13R) and B worst (−0.37R). Weak evidence
  at n=11 for C, but it is the opposite of what a working grade ladder should produce, and it is
  worth re-checking after M21.
- **Declared RR 3.90R is not being achieved.** At 3.9R, break-even needs a 20.4 % hit rate; 20
  targets against 70 stops and 9 expiries is right at that line before costs. The gap between a
  3.9R plan and a −0.31R outcome is where M75 (stop at the further of two candidates, not the
  nearer) and M77 (target timeframe alignment) should show up.

### Honest limits

Synthetic data. `--seeds 20` gives 121 trades, which is enough to distinguish "clearly negative"
from "positive" but **not** enough to rank two changes that differ by less than ~0.1R. Raise
`--seeds` before believing a small delta. Costs (spread, commission, slippage) are **not**
modelled, so these figures are optimistic.
