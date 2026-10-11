# M76 / M75 — protected levels and course stop hierarchy

**2026-10-11 · parent 9f629c1 · branch `arena/762c0295-trader`.**

This milestone closes M76 and M75. **132 findings: 73 done / 2 partial / 57 todo / 0 no-action.** Partial rows remain M30/M103; M125 remains todo. No item was omitted.

## Scope correction from the actual transcript

Ep20 **16:42–19:35** defines a protected high/low as a high/low that **swept liquidity**, then specifies:

1. **Current protected boundary belonging to this execution: use it.**
2. Without that current boundary, compare the **older protected boundary and entry-zone edge**, choosing the **nearer valid** invalidation, with breathing room beyond it.

The original M75 shorthand proposed universally swapping Math.min/Math.max. That is too broad: it would replace a known current protected high with a nearer zone merely to improve RR. The actual hierarchy, not that shortcut, is implemented. Ep20 17:48–19:11 distinguishes the newly established protected high from the older high, and compares the older high/zone only in its absence. Bonus Sniper Entries explicitly requires swept liquidity for the entry candle to count as protected. Source: ignored `transcripts/ep20_stop-loss-take-profit.txt`, reproducible at `nedu-m/market-mechanics-bot`; full bonus quotations are retained in EPISODE-AUDIT.

The **0.18 entry-TF ATR buffer** is retained. “A few pips” is the course language, not a numerical 0.18 quotation. No RR/grade/session/risk threshold was optimized.

## M76 — report-only concept, measured first

New `src/bots/protected.js`, called by the actual SMC engine:

- A physical closed candle must sweep the appropriate liquidity side and **close back inside**; a breakout, arbitrary stamped extreme or strong/fractal label alone is not protection.
- Source liquidity must match the real detector's **closed prefix before the sweep**. A present/future pool catalogue cannot be relabelled as old evidence. Prefix lookup is cached within an analysis, never shared across changing windows.
- The **candidate sweep set itself** is built on the observed closed view. Forming/future bars cannot displace a past sweep in the ranked/capped detector catalogue.
- The swept physical extreme, honest source TF, pool provenance, close availability and status are emitted in `protected_levels`, sweeping-event annotations and swing/structure flags.
- A later wick through the boundary **takes** it. Closing back inside does not resurrect the old level. A new observed sweep may create a new one. Unobserved excursions cannot invalidate an observed level.
- Missing, mismatched or future protection snapshots remain **unknown**, not falsely “no protected level”. A flag `not_proven` is not proof that a swing could never have been protected outside this window.

The existing bounded **80-bar sweep lookback / top-10 catalogue** is inherited. No claim of unlimited historical detection is made; broader liquidity/window/forming-bar issues are not universally solved here. Legacy SMC fields, selectors and grades are unchanged by this annotation stage.

Named composition forwards the genuine **lower-TF** report. Compact protection facts survive entry evidence; no MTF/HTF protection is relabelled as a lower-TF fact. The new observation clock is distinct from the existing session-clock `now`; the harness supplies its actual decision close, and the loader supplies replay/live observation clocks.

## M75 — stop selection, measured separately

`src/bots/stops.js` centralizes stop decisions:

- A named model's actual causal sweep/fuel boundary defines its current protection when proven. Ordinary current protection requires the selected zone's real shift/displacement association, or a closed sweeping entry candle at the zone. Mere recency/strength is not that association.
- An intact current protected high/low has priority **even when a zone would offer better RR**. If that known causal boundary is taken or cannot define a valid adverse/published stop, refuse; do not substitute a farther invalidation to rescue the model.
- Otherwise compare valid **older intact protected levels and the entry-zone boundary** by distance. The zone wins an exact tie. Wrong-side, taken, future and wrong-TF points cannot win this comparison.
- Validate the buffered stop both before and after publication rounding. A current stop rounding onto entry is undefined risk, not a permission to borrow another boundary/ATR.
- If protection evidence is unknown, explicitly retain a valid **conservative zone/sweep boundary**, rather than infer a protected point or claim permission to tighten it. This M8-consistent uncertainty policy is documented judgment, not a claim that missing data proves absence.
- `ctx.stopPolicy='legacy'` is the explicit pre-M75 research arm. No live setting silently disables the new rule.

Selected stop/base/kind/source TF, buffer TF/value, candidates/rejections and rule are recorded in `levels.stop_policy`. Invalidation wording names that selected boundary; actual position sizing uses the same published stop. An invalid stop produces no executable candidate/risk plan.

M68's causal entry/pullback/ATR requirements, M70's actual failed-reaction fuel, M33's original narrative/key/one HTF target/half ordinary risk, M54's nearest target and M77's physical target band remain. A sub-floor target is **still refused**: the current protected stop cannot be tightened or its target moved to manufacture 2R.

## Consumer authority and persistence

Analyse, actual Now orders, chart plans, scan, Copy and eligible Save carry the same selected stop. The browser shows its stop/invalidation policy instead of just a price; Copy names the actual stop TF/kind/rule. HTF CRT tables remain projections, not alternative executable stops.

Named `entry_evidence` stores the chosen protected boundary and stop snapshot. Existing signal notes store stop provenance before exit provenance, including unnamed signals; no new DB column or guessed historical backfill. Save-plan checks a bounded snapshot for displayed price/entry-TF consistency and rejects contradictory metadata. This is **client-supplied evidence consistency**, not a claimed server OHLC replay of a manually supplied plan. Existing model evidence validation/owner scope remain.

Legacy odds/refined geometry remain withheld under M68/M77. No stop-policy calibration, named outcome edge or 70%-win-rate claim is invented.

## Independent checks

| Probe (passed / failed) | Final | 9f629c1 control |
|---|---:|---:|
| M76 concept/actual detector/prefix/neutrality | **34 / 0** | 5 / 29 |
| M75 hierarchy/geometry/rounding/refusal | **41 / 0** | 4 / 37 |
| M75 actual functions/storage/authenticated HTTP/browser/Copy/Save | **57 / 0** | 41 / 16 |

M75's annotation-only control also scores **4/37**. **132 final feature checks, no failures** (this is a test count, distinct from the 132 ledger findings).

M76 actual OHLC census: **100 SMC reads, 58 protected highs / 67 protected lows; 52 intact / 73 taken**, zero source errors, zero old-field differences, zero old setup differences and zero observed-catalogue differences under forming/future perturbation. No stamped detector pools/zones/protected flags. Unit/composition cases separately declare liquidity/zone/structure seams and are not historical discovery.

M75 actual OHLC→SMC→Setup census: **100 reads**, rules **121 nearer fallback / 38 unknown-conservative / 1 current-protected / 1 current-protected-invalid** over priced candidates; **4 changed stops**, **1 undefined stop refused**, **0 wrong-side executable / 0 sub-floor executable**. Script: `probe-m75-detector-stops.js`.

The consumer fixture has a causally linked lower origin preceding the sweep, physically coherent overlapping child/parent buckets, and an explicitly declared prior pool. Market-shift stop changes **97.78→97.18 short / 102.22→102.82 long**, while entry/target remain unchanged. The genuine physical sweep validator, composer, auth/storage and actual JS consumers run; this is not claimed as native HTF/MTF OHLC-only discovery. Flip current protection and M33/ordinary contexts are exercised too.

The first stop probe's **35/6** was a direct-fixture kind mismatch (`zone` versus `order_block`), corrected without changing the selector. The tiny-rounding case was tightened to verify an intact boundary and the actual rounding-refusal branch, rather than accidentally passing on a taken boundary. Negative logs are retained.

## Separately measured outcomes — negative result retained

Commands (same harness/data/windows/gates as parent):

```sh
node analysis/harness/backtest.js --seeds 60 --bars 1500 --window 300
node analysis/harness/backtest.js --real --realtf 15m --window 300
node analysis/harness/backtest.js --topdown --seeds 10 --bars 1500 --window 300
node analysis/harness/backtest.js --topdown --real --realtf 5m --window 300
```

`TJ_APP` selects the isolated parent/annotation/complete stop snapshots.

| Stage | Synthetic n / win / expectancy / PF | Real15 n / win / expectancy / PF |
|---|---|---|
| Parent 9f629c1 | 30 / 23.3% / **−0.1568R** / 0.78 | 8 / 25.0% / **+0.2500R** / 1.40 |
| M76 annotation only | **entire output unchanged except runtime** | **entire output unchanged except runtime** |
| M75 complete stop/consumer stage | 36 / 19.4% / **−0.2944R** / 0.61 | 9 / 22.2% / **+0.2222R** / 1.40 |

M75-parent delta **−0.1376R synthetic / −0.0278R real fixture**. Different selected cohorts/cooldown interactions, not a paired causal estimator. Synthetic travel/ranges are structurally unlike markets; nine dependent real outcomes are below the course's 30-trade floor. Synthetic A+ n13/−0.5130R and A n23/−0.1709R are thin too. No target was shrunk or parameter chosen to improve these numbers.

Fresh parent bare/real15 runs matched the prior recorded output. Native parent controls reuse prior validated parent geometry's stdout; M76 all four profiles were independently rerun and matched it, and M75 both native outputs match M76 **in full except runtime**. No new native parent run is claimed.

Native synthetic **13,750 method reads / 1,006 named known / 0 ready / 0 outcomes**; real-native **4,761 / 677 / 0 / 0**. State/counter counts unchanged. **No named outcome sample, calibration or edge ranking.** Bare runs do not exercise full named top-down execution.

Recovered four real datasets are unchanged from M54/M77; exact source paths/hashes are in `evidence/m54-m77/INPUTS.json`. CSVs/transcripts remain ignored and unbundled.

## Regressions / retained failures

Latest: M33 **67/0**, M68 entry composition **62/0**, M70 **30/0**, M54 **54/0**, M77 core **87/0**, M77 consumers **41/0**, M68 raw lower detector **16/0**, M21 **11/0**, M26 **49/0**, applied re-verification **67/0**; top-down **77/0**, Now **46/0**, chart **36/0**, API **121/0**.

Matching current/parent bots: **204 passed / 2 failed each**, **12 fills / zero parity mismatches**. Both unchanged minimum20 sample floors; never reduced to turn insufficient data green. This clock's 12 fills supersede earlier milestone counts, not their historical evidence.

Concurrent smoke initially **19/22**, zero console/style errors: Dashboard/Trade log/Calendar were incomplete during the route sweep. Serialized repeat with the **same script/source/assertions**: **22/22**, zero console/style errors. Both raw logs retained; do not hide the initial negative or weaken assertions. Analytics Segments' 72-character informational line and JSDOM canvas limitations remain disclosed; these are not chart pan/zoom/pixel tests.

All API/UI runs use explicitly labelled **offline synthetic candles / disposable local SQLite / scheduler disabled**, with matching DB settings and blank remote credentials. No production Turso/Yahoo/Vercel/session/401/cron validation, no key rotation or committed credential.

## Artifacts and next mechanism

- `analysis/patches/m76-protected.patch`: annotation stage on **9f629c1**.
- `m75-stop-policy.patch`: stop/consumer delta **on M76**.
- `m75-m76-complete.patch`: complete milestone **on 9f629c1**.
- `M75-M76-STAGES.json`: byte/SHA/round-trip metadata. Fresh scratch trees; clean apply and reverse, zero byte differences.
- Cumulative pristine patch: **38 app files / 521,991 bytes**, SHA256 **d2bba2c2137e75f352fe102d9bc8ded3dac27f879ecae89dfaf91a10fc028e5c**.
- Rebuilt `tradingpro-fixed.zip`: **109 app source files**, byte verified, audit included; no embedded .git, actual environment, DB/dependency/downloaded dataset/transcript files.

Rebuild: `python3 analysis/build-m75-m76-artifacts.py`. Durable logs/core hashes: `analysis/evidence/m75-m76/`. Annotation and complete snapshots were isolated during measurement; no mutable shared source arm.

Next **M78**: aggressive/conservative **entry selection on internal structure**, not a stop-buffer finding. Preserve causal named entries, current-protected priority, nearer-valid fallback, original buffer, nearest targets, bounded M33/half-risk and all vetoes. M30/M103 partials and M125/57 todo findings remain visible.
