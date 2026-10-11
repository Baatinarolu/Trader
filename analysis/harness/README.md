# Independent backtest harness

## Current M78 verification (2026-10-11)

Actual-entry-TF internal structure selects aggressive/conservative preference;
current basic causal execution geometry remains candidate-owned. **Eight fresh
runs** compare shipped256299e and M78: **all four entire outputs equal except
runtime**,real outputs byte-equal already. Bare36/19.4%/−0.2944R/PF0.61;
real15 n9/22.2%/+0.2222R/PF1.40;native named outcomes0. No improvement/edge.
Core119/0,consumers169/0;actual100read census discriminates81aggressive/
119conservative directional preferences with zero old facts/geometry changes.
`run-m78-measurements.py` runs the controls; `verify-m78-measurements.py` checks
whole-output equality and unchanged input-file hashes. Source guards, raw stdout
and negatives in `evidence/m78`. [Report](../M78-ENTRY-PREFERENCE.md), latest
BASELINE section and **74done/2partial/56todo** generated progress are current.
Next M71 floor invariant scope check; no manufactured/shrunken2Rtarget.

## Prior M76/M75 verification (2026-10-11)

M76 annotation alone leaves all4 profiles unchanged. M75 current-protected-first /
nearer-valid fallback with original buffer measures **bare36/19.4%/−0.2944R/PF0.61**,
**real15 n9/22.2%/+0.2222R/PF1.40** versus parent30/−0.1568R and8/+0.2500R.
Negative result retained; native outcomes0, no calibration/edge. Source clocks are
explicit for protection, distinct from session clock. `stopPolicy:'legacy'` isolates
the prior geometry. [Report](../M75-M76-PROTECTED-STOPS.md) and latest BASELINE section
are authoritative; older numbers below are historical. Next M78 entry selector.

## Prior verification state (2026-10-11)

The original baseline below is **historical**, not the current server or performance evidence.
M131 found HTF lookahead: the harness precomputed complete higher bars and exposed them at
FIRST child time. It now stores the actual last constituent (`last_t`) and requires it to be
observed. Prior contaminated return/grade figures must not be quoted as validated performance.

- Current M54/M77 bare regression: `--seeds 60 --bars 1500 --window 300` = **30 trades,
  23.3%, −0.1568R, PF0.78**. Parent c326651 was24/29.2%/+0.7908R/PF2.33. Negative
  result retained; synthetic, not an edge claim and blind to full named topdown.
  Real15 parent n10/+0.7250R→current n8/+0.2500R, dependent/thin. Separately measured
  addition-only n21/−0.2090R bare,n7/+0.7857R real; complete nearest-before-RR n30/n8.
  M77 alignment/exact-RR/defensive stage all four outputs identical to complete M54
  except numeric runtime; last headline-only correction has216 comparisons/0
  candidate/0 non-headline differences. Native known1006/ready0/outcomes0 and
  real-native known677/ready0/outcomes0: no named sample/calibration.
  See [staged report](../M54-M77-TARGETS.md) and [durable evidence](../evidence/m54-m77/README.md).
- `--bias held` exercises the actual immutable-anchor lifecycle after M130. Changes count
  **plan resets**, including same-direction reassessment after an invalidation, not just flips.
- `--topdown` exercises **4h narrative /15m POI /5m execution**. It generates native5m
  synthetic data and derives complete, calendar-aligned higher buckets with the actual TD
  aggregator. It uses TD.build, alignment, held-bias state and the final method-permitted
  setup, never merely candidate.ok on a side the method rejects.
- `--topdown --no-countertrend` is the isolated pre-M33 execution arm. At20 seeds x1500
  MTF bars both arms have0 fills: ON has657 counter contexts but every one misses current
  POI touch, OFF has0 contexts. **No executable sample and no performance inference.**
- Native real5m may be used with `--topdown --real --realtf 5m`. Higher native input is
  rejected: the harness never fabricates/interpolates a lower timeframe.
- The default M58 dollar table isolates grade only. The M33 method-mode table separately
  consumes emitted risk_pct (grade x range x counter reduction) rather than disguising a
  half-risk policy as a change in expectancy R.

- M70's geometric extreme-over-overlapping-flip policy is active only when flips
  are opted in; the bare default complete60-seed result remains identical except
  runtime. Separately measured --breakers parent n55/+0.0303R/PF1.06, preference-only
  n55/+0.0219R/PF1.04, complete preference+fuel n53/-0.0278R/PF0.95. **Negative
  synthetic result, not an edge or a model ranking.** Preference-only is a research
  preloader, never a production relaxation:
  `node --require ./analysis/helpers/m70-preference-only.js analysis/harness/backtest.js --breakers --seeds 60 --bars 1500 --window 300`.
  These are historical M70 numbers. M68 causal composition/persistence and
  M54/M77 target policy have since shipped; read the current state above.

M33's controlled regression fixtures validate actual order/chart/copy/storage consumers
and unchanged daily narrative; they are **explicit structural inputs**, not historical prices
or an OHLC-only discovery test. See `BASELINE.txt` for every separate measurement and negative.

---

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

## M68 causal named-entry arms

`--topdown` uses native smaller candles and complete parent buckets. Named-model
execution is enabled there by default; `--no-entry-models` isolates the prior research
arm. `--breakers` opts into flip-zone selection/composition in BOTH TD and Setup.
`TJ_APP=/absolute/path/to/app` selects a frozen implementation without rewriting the
harness. The report separates model-known/readiness states from counter context and
filled outcomes, and fills retain `entry_model` (NULL if unrecorded in older engines).

The bare/default arm has no TD/model context and cannot measure named-model efficacy.
M68's 10-seed default and opt-in native measurements had **zero ready named outcomes**.
An opt-in unnamed fallback existed in both ON/OFF arms; it must not be presented as
flip/market-shift performance. Independent provenance, execution and persistence
stage measurements and controlled/raw-lower-detector positive tests are recorded in
`analysis/M68-ENTRY-MODELS.md` and the chronological `BASELINE.txt` addition. Never
interpolate lower candles, relax causal gates to obtain fills, or attach legacy
geometry probabilities to named executions without separate calibration.
