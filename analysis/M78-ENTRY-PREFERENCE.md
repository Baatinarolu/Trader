# M78 — internal-structure entry preference

**2026-10-11 · shipped-parent control `256299e` · branch `arena/762c0295-trader`.**

M78 is implemented. **132 findings: 74 done / 2 partial / 56 todo / 0 no-action.** Partials remain M30/M103; M125 remains todo. Every ID remains in the eight-group progress partition.

## Scope corrected against the recovered course

**Ep20 10:34–11:48:** internal structure on the execution's side → aggressive preference; opposed or uncertain → conservative. **03:41 and 09:01** identify the scalper's **1-minute internal order flow**, not the opposing higher-timeframe narrative. Use the actual execution timeframe in the generalized bot.

Two historical descriptions needed correction:

- The actual shipped legacy Now selector was **`confirmed ? sf : ag`**, with `confirmed` meaning **conviction tier A**. `fullRisk` was derived sizing/report wording, not that selector expression. Neither is the course's internal-structure criterion.
- The recovered Ep18 transcript does **not** establish the old ledger's literal “personality” quotation. That unsupported attribution has been removed. Ep20 independently supplies the rule.

**Ep18 10:43–12:18, 29:15 and 32:18** require the free basic models' pullback into the flip/causal lower zone. **38:25–39:08 and 44:17–44:39** explicitly describe a restricted, condition-dependent advanced aggressive shortcut, without fully specifying it. This change **does not invent that proprietary geometry**. “Aggressive preference” is not permission to skip a causal sweep, later closed shift or post-shift pullback.

Sources: ignored recovered `transcripts/ep20_stop-loss-take-profit.txt` and `transcripts/ep18_entry-models.txt`, reproducible from `nedu-m/market-mechanics-bot`. No new source quotation or proprietary specification is assumed.

## Implementation and execution authority

`src/bots/entry-preference.js` is a shared pure selector:

- Known bullish internal structure with a long, or bearish with a short → **aggressive**. Opposed or ranging → **conservative**. Missing/untrusted knowledge is explicitly **unknown/conservative**, not guessed agreement and not a new execution veto.
- It reads **`structure.trend` on the actual entry TF**, not HTF trend, conviction, risk percentage or `Setup.trendAligned`. M69 changed the latter into the mandatory **last-break event** gate; using it here would make every eligible shifted model trivially aggressive.
- The existing SMC algorithm emits `structure_source`: actual physical TF, window count/first/last timestamp, observation clock and whether its whole read was closed. Its structure algorithm, swing mode and thresholds are unchanged.
- Missing/mismatched/forming/future/truncated source snapshots cannot claim closed structural knowledge. The inherited 30-bar SMC minimum is respected, not introduced as a new course preference threshold. Later display candles appended to a genuinely closed labelled snapshot do not change it. A report **recomputed with future/forming candles** is unknown, not silently reconstructed with different defaults.
- The preference snapshot records variant, direction, TF, trend, agreement, clock, last source close, reason and **`advanced_shortcut:false`**.

Topdown's CRT table carries the structure-based preferred field (`aggressive` or legacy `safer` alias) and reason, **still projection-only**. The legacy unscoped research selector in Now/chart now follows the same rule instead of A/B sizing. A projection-only CRT cannot become an executable Now fallback when no eligible candidate exists.

For current execution, **the actual candidate remains the sole price authority**. Named `market_shift`/opt-in `flip` and unnamed entry-aligned candidates expose the same preference in Setup, Now, chart, scan, Copy, Save and the UI. Their model/mode is distinct from this preference. **Both structural preferences retain the basic causal entry geometry and all gates.** There is no second aggressive executable CRT price.

A consumer test caught Momentum's compact topdown projection dropping the new preference: scan consequently fell back to unknown on aligned examples. That forwarding is fixed; the same tests were retained.

Named evidence persists the selection; existing signal notes persist source/variant for named and unnamed records. No new DB column, historical guess or backfill. Save validates bounded TF/direction/trend/variant/clock consistency, disallows advanced authorization, and rejects contradictory duplicated/nested evidence. Reordered JSON keys are accepted when the semantic snapshot is identical. This is **client-supplied evidence consistency**, not server OHLC replay of a manual plan.

Risk grade/multiplier, M33's original narrative/one HTF target/half-risk, M70's actual fuel, M75's current-protected priority/nearer-valid fallback/original 0.18 entry-TF ATR buffer, M54/M77 nearest-target/no-farther-RR-rescue, sessions, anti-chase, news and minimum RR are preserved. Calibration stays withheld; this selector is not calibrated odds.

## Independent checks

| Probe (passed / failed) | M78 | `256299e` control |
|---|---:|---:|
| Structure selector, risk independence, causal gates, actual OHLC census | **119 / 0** | **22 / 97** |
| Actual functions, scan/chart, auth/storage/API, browser Copy/Save | **169 / 0** | **122 / 47** |

**288 feature checks** (distinct from the 132 ledger findings).

The actual OHLC census is **100 SMC reads / 200 directional preferences**: **81 aggressive / 119 conservative**; trends **37 bearish / 44 bullish / 19 ranging**. **77 reads** have break-event direction and trend label disagreement, reinforcing that they are different axes. **Zero** source/TF/clock errors, old SMC differences, old Setup price/gate/grade/risk differences, appended-future preference differences or forming-built-source promotion errors. No stamped detector trends, pools or zones in this arm.

Unit and consumer composition cases separately **declare closed structural labels/window provenance, pools and HTF/CRT context**. They run real physical protected-sweep validation, causal entry composition, consumers, authenticated Save/storage and actual browser JS. They are not represented as full native HTF/MTF OHLC discovery. The actual 100-read census and native profiles are separate evidence.

Discriminatory checks include A **and** B with the same aligned/opposed/ranging/unknown structure; both directions and both named models; actual entry TF versus opposing HTF/trigger; known shift with opposed trend; missing pullback despite aggressive preference; metadata contradictions; and projection-only fallback refusal.

## Separately measured outcomes — no improvement claimed

All **eight runs are fresh**: four complete M78 profiles and four archived-parent controls. No prior native-control stdout was reused. Same harness, four unchanged real datasets, windows, fills/cooldowns/gates and course risk floors.

```sh
node analysis/harness/backtest.js --seeds 60 --bars 1500 --window 300
node analysis/harness/backtest.js --real --realtf 15m --window 300
node analysis/harness/backtest.js --topdown --seeds 10 --bars 1500 --window 300
node analysis/harness/backtest.js --topdown --real --realtf 5m --window 300
```

| Profile | Parent | M78 |
|---|---|---|
| Synthetic bare | 36 / 19.4% / **−0.2944R** / PF0.61 | **identical** |
| Real15 | 9 / 22.2% / **+0.2222R** / PF1.40 | **identical** |
| Native synthetic | 13,750 reads / known1,006 / ready0 / outcomes0 | **identical** |
| Native real5 | 4,761 reads / known677 / ready0 / outcomes0 | **identical** |

The **entire four profile outputs**, not just headline returns, are byte-equal after removing only the synthetic header's elapsed-ms runtime field. The two real outputs are already byte-equal without normalization. States, grade cuts, seed results and counter prerequisites are all retained. `verify-m78-measurements.py` also rechecks all four input-file hashes against the unchanged M54/M77 provenance.

No measured improvement. Synthetic ranges remain distorted; nine dependent real outcomes are below the course's 30-trade comparison floor. **Zero native named-model outcome sample** means no ranking, calibration or edge conclusion. The legacy CRT selector is directly tested; unchanged current basic geometry is expected, not evidence that an advanced shortcut was implemented.

## Regressions and negative results retained

- M33 **67/0**, M68 entry **62/0**, actual detector entry **16/0**, M70 **30/0**, M54 **54/0**, M77 **87/0**, M77 consumers **41/0**, M75 stop **41/0**, M75 consumers **57/0**, M75 actual stop census unchanged, M76 **34/0**, M21 **11/0**, M26 **49/0**, re-verification **67/0**.
- Topdown **77/0**, Now **50/0**, chart **36/0**, API **121/0**. Now's former B→aggressive/A→safer assertions lacked structural input: initial unchanged old suite **44/2** is retained, then replaced by explicitly closed/declared structure inputs and **additional** selector/projection tests, not weakened price assertions.
- Bots current and control **204/2**. Current **12** fills and parent **17** fills, both **zero simulator parity mismatches** and below the **unchanged ≥20 / >20** sample assertions. These API demo runs were wall-clock/cache-dependent and not a pinned paired return estimator. Do not report them as passed or as identical cohorts; the four independent pinned harness comparisons are the causal-neutrality measurement.
- Smoke initially **21/22** during measurement/control load (Trade log incomplete), then serialized **same script/source 22/22**, zero UI-style/console failures. Both logs retained; no threshold/assertion changed. jsdom's no-canvas fallback is not a pixel/pan/zoom proof.
- First consumer **164/5** exposed dropped scan preference and the missing CRT preference note. Fixed production forwarding; unchanged assertions then **169/0**.
- First parent consumer instrumentation dereferenced a field the parent lacks; corrected to submit the same declared valid client snapshot to both implementations. Final full negative control **122/47**, not a skipped test.
- M70 initially **29/1** because full-object equality compared newly added wall-clock snapshots across successive calls. Pinned the fixture's declared `observedAt`; **the full-object equality remains**, final **30/0**. No production selector change for this fixture correction.
- Initial Topdown/chart provider calls without offline transport failed in the restricted sandbox. Raw failures retained; properly labelled offline runs pass. No production provider verification is inferred.

Evidence/source guards: `analysis/evidence/m78/`. Live preview is the current **offline synthetic / local SQLite / scheduler-disabled** app at port3000 (`/tmp/m78-regressions.db`). Production Yahoo/Turso/Vercel/auth/cron and the historical chart zoom/pan defect remain unverified. No real workspace or credential was modified/rotated.

## Durable artifacts and continuation

`build-m78-artifacts.py` preserves historical stages, builds **`patches/m78-entry-preference.patch` on `256299e`**, rebuilds **`patches/applied-so-far.patch` against `tradingpro-main.zip`**, and regenerates **`tradingpro-fixed.zip`**. `M78-STAGES.json` carries patch hashes/counts. Fresh clean forward/reverse application and ZIP byte equality are mandatory; original lockfile unchanged. Source guards cover **110 app files**. Dependencies, actual `.env`, DBs, downloaded bars and recovered transcripts are excluded.

- Milestone delta: **12 app files / 45,754 bytes**, SHA256 `935fd68f0f1d14b9aab756f1417a25e9ec5d4437ef34bd8f6415dd19067cb73e`.
- Cumulative pristine delta: **39 app files / 541,853 bytes**, SHA256 `4c1b5cc3ffdaf23638af0f04fb253ed87f03bb42128921585ebe415837b8133a`.
- Fixed source ZIP: **110 app files**, clean forward/reverse and application-byte roundtrips **0 differences**.
- Temporary parent API port3001 is stopped; main port3000 remains current and explicitly offline.

Next mechanism: **M71**, re-checking its primary/final-RR invariant against the already-shipped single target/nearest-magnet policy and the actual Ep18 simple-2R exercise versus Ep20 exits. **Do not manufacture a fixed 2R target or shrink targets to chase win rate.** M72 remains optional/gated; M73/M46 inducement remains open. All other 56 todos and both partials remain visible in the generated progress file.
