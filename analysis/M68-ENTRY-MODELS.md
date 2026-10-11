# M68 — causal LTF entry models and persistent review

2026-10-11. Parent/control: **663659a** (shipped M70). All numbers below are synthetic or controlled tests, **not live-market edge**. M68 is a fidelity fix; no target was shortened to manufacture a win rate.

## What is now implemented

- The existing HTF CRT or M33 bounded counter-pullback supplies the execution direction. The HTF narrative and held defining invalidation are not reset by an entry model.
- The existing MTF selector supplies a real OB/opt-in flip POI, with its known formation/confirmation time. Actual observed **closed LTF** candles must mitigate its midpoint before a sweep and strictly later closed structural shift. A sweep completely away from that POI cannot borrow an old touch.
- **Market shift:** use the LTF OB that actually created that exact shift. The association includes origin/displacement/event timestamps and indices, direction, structural level and confirming close. Strongest-first OB dedup retains all valid creating associations. An unrelated OB or standalone FVG cannot supply this entry.
- **Flip (still opt-in):** use the failed-reaction flip whose actual confirming structural event matches the LTF shift. A legacy `retested=true` before confirmation is not a later midpoint pullback. The flip must overlap the MTF POI.
- Both models wait for a **strictly later** midpoint AND entry-price pullback. Current observed closed price must be within the lower zone; a post-confirmation close-through invalidates it. No pullback means no trade. A missing measured lower ATR cannot borrow a medium-timeframe stop buffer.
- Market-shift entries use the causal OB's body midpoint; flip entries use the flip midpoint. Stop inputs are the lower zone and physically observed lower sweep, keeping the existing 0.18 ATR buffer. If M70's actual later failed-reaction fuel sweep goes farther, it supplies the more conservative stop extreme.
- M70's extreme preference is retained through the lower pullback: a newly created causal OB was unmitigated at confirmation, even if its live detector flag becomes mitigated by the entry. Known unswept fuel vetoes; unknown remains unknown.
- Original CRT range-edge or M33 single nearest-opposing-HTF-zone targets are unchanged. Existing M3/M8/M26/news/RR/grade/range/counter-risk policies still apply. Sub-floor original targets refuse; no farther target is substituted.
- Actual production lower loading removes forming/future candles **before** ATR, indicators, structure and zone detection. Chart/analysis share an explicit observation clock. Model-known failures veto, missing distinct layers/unknown POI formation remain explicit unknown, and `entryModels:false` isolates legacy research.
- Candidate, Now, chart plan, scan and Copy carry model/timeframe/evidence. The named candidate—not a parallel CRT safer/aggressive scenario—owns the actionable prices. Step 5 cannot claim completion before its pullback.
- Legacy research probabilities/refined plans are not calibrated to this geometry. Live probabilities/buy/sell/current are withheld in the analysis payload; the UI distinguishes historical research and suppresses legacy live/refined plans when a named setup applies. `saveSignals` and named `savePlan` store `p_win=NULL` even if given a legacy 99% value.

## Persistence contract

`entry_model`, `entry_tf`, `entry_evidence` are nullable TEXT columns on **trades and signals**, in both DB-owned and Index-owned signal schema/migration paths. Valid model values: `flip`, `market_shift`, `none`. Unspecified historical/manual tags stay **NULL = unknown**, never guessed from a grade, OB or confluence. `none` is an explicit distinct observation.

Trade create/update/close, normalisation, batch imports, JSON/CSV exports and imports, actual bot Log-plan prefill and the browser modal preserve these fields. Enum/evidence validation is bounded, user-scoped, and rejects malformed inputs. Retagging or changing the recorded TF cannot retain contradictory automatic evidence. The evidence snapshot contains POI, observed sweep/stop sweep/shift, zone origin/formation/entry, mitigation time, ATR and preference, not an entire candle history.

Journal closed-trade and resolved-signal review exposes all four cohorts. Below **30** outcomes per model is marked descriptive/thin, not calibration or a performance conclusion. Existing strategy versioning and owner isolation are unchanged.

## Independently discriminating tests

| Probe | Current | Parent 663659a |
|---|---:|---:|
| `probe-m68-provenance.js` (with TJ_CONTROL) | **15 / 0** | **5 / 10** |
| `probe-m68-entry-models.js` | **62 / 0** | **12 / 50** |
| `probe-m68-detector-entries.js` | **16 / 0** | **0 / 16** |
| `probe-m68-consumers-storage.js` (with TJ_CONTROL) | **47 / 0** | **5 / 42** |

**140 current checks, no failures.** Parent failures are intentional discriminators, not an assertion that pre-M68 implemented these new contracts.

Provenance's actual SMC census: **96 reads, 277 causal associations, 129 confirmed flip references, 0 invalid associations, 0 legacy-field differences** after stripping ONLY the new annotations. This is detector evidence, not just hand-stamped taxonomy.

The entry composition fixture is explicitly structural input, NOT detector discovery. Its sweep close matches the actual origin OHLC; complete overlapping 5m→15m→4h buckets are aggregated coherently. The short market-shift entry is **96.55**, flip **96.6**, versus original medium entry **96.5**; both retain the original **92.5** bounded target and half ordinary same-grade counter-risk. The long cases are mirrored. Separate controls cover arbitrary/wrong-location/wrong-event zones, no pullback, forming/future data, same-bar ordering, pre-confirmation retouch, invalidation, unknown layers, absent ATR, M70 extreme/fuel/stop and a parallel CRT scenario.

The **16 detector-entry checks** have no injected lower structure, zones, associations, failures or sweeps: actual `SMC.analyse(OHLC)` discovers them. Their pre-existing MTF POI is explicit context and one final pullback candle is manufactured, then re-detected. Seed 1, lower windows ending 445/695 of 900 native-timestamped synthetic candles, plus mirrored prices, yield flip/market-shift respectively. This proves the LOWER detector→composer boundary can fire. It does **not** prove full HTF/MTF OHLC-only strategy discovery or an edge sample.

The consumer/storage probe uses real API authentication, isolated local SQLite, actual additive migrations from pre-M68 rows, actual Index fallback migration, actual JS form/Bots/TV Copy/Analytics/Signals scripts (charts have an explicit jsdom rendering seam). Providers/market context are controlled. Positive final prices and negative refusal propagation are both tested.

Final step-completion presentation was corrected separately: the pre-presentation execution snapshot scores **60 / 2** on the final 62-case entry probe, versus **62 / 0** now; full candidate arrays have **0 / 8** differences over both models/directions with/without pullbacks. Only pending/completion reporting changed there, not geometry/risk.

## Separately measured stages

Frozen snapshots were archived from 663659a rather than sharing a mutable app tree:

1. **Provenance only:** parent + SMC annotations. Parent and stage 1 full 60-seed default AND 10-seed native-three-role stdout are identical except runtime.
2. **Execution:** add causal composer, TD/Setup and consumer-prefix integration, retain the old Index persistence tail/schema. Measured separately from annotations and storage.
3. **Persistence/consumer review:** complete application including schema/trade/signal fields and review. Entire default, native-three-role and opt-in-flip outputs match stage 2 except runtime.

Commands: `node analysis/harness/backtest.js --seeds 60 --bars 1500 --window 300`; native runs add `--topdown --seeds 10`. Opt-in adds `--breakers`; isolated old-model research adds `--no-entry-models`. `TJ_APP` can point at an app snapshot. The native arm uses genuine smaller bars and complete calendar 15m/4h constituents, never interpolated LTF bars. The bare/default arm does not contain TD/model context and cannot measure M68 efficacy.

| Arm | Method reads | Named known | Named ready | Filled trades |
|---|---:|---:|---:|---:|
| Native default, provenance/control (10 seeds) | 13,750 | n/a | n/a | 0 |
| Native default, execution + persistence | 13,750 | 1,006 | **0** | **0** |
| Native opt-in flips, M68 ON | 13,718 | 912 | **0** | **1 unnamed fallback** |
| Native opt-in flips, M68 OFF | 13,718 | 0 | 0 | **same 1 unnamed fallback** |

Native default states: waiting_direction **12,744**, waiting_poi **997**, waiting_sweep **4**, waiting_zone **1**, waiting_shift **4**. Native opt-in states: waiting_direction **12,716**, waiting_poi **843**, waiting_sweep **7**, unknown **90**, waiting_shift **62**. No named flip or market-shift execution was ready in either native performance arm.

Both native default arms have **220** M33 contexts, **167** completed, **0** ready/permitted/fills; all 220 missed current POI and lower prerequisites, 14 missed phase (overlapping counts). Opt-in has 166 completed and the same 220/0 counter context/readiness, with no counter-method reduction on its one fallback fill.

Bare/default across every stage remains **n=24, win 29.2%, expectancy +0.7908R, PF 2.33**, complete output unchanged except runtime. A+ n11/−0.0326R/PF0.94; A n13/+1.4875R/PF3.40; every count remains below the course 30-trade comparison floor.

The single opt-in fallback expires at **+22.1135R** on synthetic seed 10, declared 24.97R. It also exists with M68 OFF, is not a named-model result, and is not a meaningful 100%-win-rate claim. **Native named outcome sample is ZERO: no edge, no model ranking, no relaxed gate or inflated performance assertion.**

## Regressions and limitations

Latest: TD **77/0**, Now **46/0**, chart **36/0**, API **121/0**, M33 **67/0**, M70 **30/0**, M26 **49/0**, M34 **12/0** (M33 AND M68 explicitly OFF for its unchanged 110-result neutrality control), M127 **19/0** (consumer regression without original-control comparison), M102 **30/0**, applied re-verification **67/0**. Smoke outputs **21/21**, 0 console/style failures; its one-shot command timed out waiting, but the process subsequently finished and its final result was read—never duplicated.

Bots **204 passed / 2 failed**: both unchanged sample floors (`>=20` / `>20`) with **14 filled/checked trades and 0 parity mismatches**. Parent 663659a at the same clock also yields **14/14/0**. Thresholds were not lowered. An initial topdown run and a client parity call lacked the offline flag and failed at blocked provider transport; the explicit labelled-offline runs above completed.

No production Turso/Yahoo/OKX/Vercel/session/401/cron behavior was validated by these local demo tests. No credentials were committed or rotated. M54/M77 ordinary target composition/alignment and the existing partial M30/M125 remain later, not silently counted as completed here. Cumulative pristine diff: **34 app files / 467,534 bytes**, clean apply to a second pristine unzip, **0 round-trip source differences**. The embedded zip `.git`, runtime data/dependencies and actual environment credentials were excluded. Artifact: `analysis/patches/applied-so-far.patch`.
