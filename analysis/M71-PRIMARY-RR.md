# M71 — the minimum RR binds the first paid target, not a farther runner

**2026-10-11 · completed · parent `184695db783c869b0e4e330cc68c0386914c8581`**  
Branch: `arena/762c0295-trader`. Current ledger after closure: **132 findings / 75 done / 2 partial / 55 todo / 0 no-action**. M30/M103 remain partial; M125 remains TODO. All 132 IDs remain in the asserted eight-group partition.

## 1. Scope correction from the course

The original row said “his target is a flat 2R.” That overstates the source:

- **Ep18 30:01**: “for take profit, **to keep it simple and mechanical in this lesson**, we're just going to set it at 2R.” **32:40** repeats the exercise. This is a simplified entry-model lesson, not permission to manufacture a 2R price instead of a real opposing magnet.
- **Ep15 20:15–22:57** selects the next actual target/zone/unfilled imbalance and one target. **Ep20 12:13–16:15** locates the actual next exit and uses the entry TF or one above; its 1m example uses 1m/5m. M54/M77's real nearest-target-before-RR rule is retained.
- **Ep25**, recorded in `EPISODE-AUDIT.md` §“How I Find A+ Setups”: “if the trade idea presents a risk to reward ratio of less than two … no matter how many confluences I have … I'm going to be passing on the trade.” RR is a binding qualification, not something extra confluences or a runner can rescue.
- The user's existing configurable floors remain authoritative. **Direct Setup defaults to 2R; API/UI default to 1R; route overrides/saved values remain clamped 0.1–10R.** No global 2R floor was silently imposed, no floor was lowered for performance and no 70% win-rate objective was revived.

Recovered Ep18/Ep20 transcript files remain ignored local source material; the durable quotes, timestamps and corrections are here and in the ledger. Ep25 is an existing full-episode audit quotation, not a newly fetched transcript.

## 2. Executed remaining defect, not a claim that all defaults were broken

M51/M54/M77 already ship a **single real nearest target** by default. Primary and final RR therefore already coincide on that path.

The optional `ctx.ladderTargets` path still chose a farther qualifying runner for runway and final RR for the score cap/veto. A shipped-control composition reproduced:

| Same long geometry | Default single | Shipped optional ladder | Fixed optional ladder |
|---|---:|---:|---:|
| entry / stop | 100 / 99.12 | 100 / 99.12 | 100 / 99.12 |
| first real target | 100.4 (0.45R) | 100.4 (0.45R) | 100.4 (0.45R) |
| farther displayed targets | none | 108 (9.09R), 110 (11.36R) | unchanged |
| floor | 2R | 2R | 2R |
| eligibility / grade | refused / C | **tradeable / A+** | **refused / C** |

These are declared structural composition facts, not a naturally discovered live trade. The identical frozen-control probe proves both directions, exact/rounded boundaries and custom floors. Eight of its 40 single/ladder boundary cases change permission; all eight are optional sub-floor runner rescues.

## 3. Independently attributed stages

### A — primary RR invariant

`src/bots/setup.js` now uses **first-target RR** for:

1. runway, even with optional partial/runner display;
2. the zero-weight explanatory management check;
3. the existing grade cap;
4. the binding `no_trade` veto.

`rr_primary_exact` uses the existing geometry helper: the conservative minimum of the working and published entry/stop geometry, with the existing `1e-9R` numerical tolerance. **A display-rounded 2.00R is not permission when exact geometry is below 2R.** The explicit pre-M77 research arm retains and labels its historical display rounding; it is not described as exact live evidence.

`levels.rr_floor` names `primary_target`, configured minimum, actual qualifying RR, permission, precision and the actual first target's price/physical TF. `rr_final` / `rr_final_exact` remain final-rung payout evidence, not floor evidence.

- Copy text labels first-target/floor and, when applicable, the final rung as **not floor evidence**.
- The real browser shows primary-floor refusal.
- “Log this plan” already journals T1's price; `planned_r` now uses **T1's RR**, rather than a different final-runner payout.
- The single-target instruction now states **set and forget**, without the old unimplemented “trail after 1R” recommendation. No trailing algorithm was added or removed.
- Optional ladder prices, catalogues, 50%/50% sizes and BE instruction remain available as the existing explicit trader/research view. M33/bounded CRT still force a single prescribed target.

**No entry, stop, buffer, target price, source TF, causal entry evidence, narrative or risk-policy coefficient was changed.** A newly refused idea drops to grade C and its *hypothetical displayed* size can decrease through the already-existing grade multiplier. This is not stop tightening or a new sizing formula. Eligible/default sizing remains identical; the probes check the existing grade/range formula, not a false blanket claim that every rejected candidate's size is unchanged.

### B — saved RR floor actually reaches the gate

Consumer tests uncovered a second defect: `floorOf()` referenced an **undefined `db`** despite importing `D`. Its catch silently returned the API default1R, ignoring valid saved `min_rr`.

Only that read was first changed to `D.db`. The same 48 consumer assertions changed **45/3 → 48/0**. A saved3R floor now refuses a 1.5R first magnet; a positive query1R still overrides it without rewriting the saved setting. Query/saved clamps, defaults, invalid-query fallback, malformed-JSON fallback and per-user isolation remain tested.

### C — same already-applied M26 saved-window regression

The neighbouring `prefOf()` had the same undefined variable, silently ignoring saved trading windows. This residual of the already-applied M26 could not be left represented as working. It was fixed **separately**, after the floor-only stage.

Isolated real auth/SQL/route + actual Setup measurements:

| Stage | Saved-settings assertions |
|---|---:|
| shipped parent / primary-only stage | 7 passed / 8 failed |
| saved-RR-floor stage | 12 passed / 3 failed |
| saved-window stage / complete | **15 passed / 0 failed** |

At a fixed London observation, saved NY refuses; explicit London overrides; saved London permits; explicit NY overrides and refuses. This neither creates a new ledger finding nor closes any remaining guardrails TODO. The M26 row records this regression correction.

### D — preserve legacy clipboard payout display

A final formatter review caught a compatibility regression in stageA: old chart
plans with only `rr_final` lost their R display. The compatibility correction is
an independently frozen/tested browser-only stage (**4/2 → 6/0**). Such payloads
retain “final …R (legacy payout; not floor evidence)”; no absent primary/floor
snapshot is guessed. The engine stage measured in all12 runs is unchanged.

## 4. Measurements — twelve fresh runs, negative results retained

`run-m71-measurements.py` executed **both arms freshly** on four default profiles plus two explicit ladder profiles. Controls are the actual `184695d` source, not the older M78 parent. Every application file and harness input is source/hash-guarded before/after; all four recovered ignored datasets match their retained M54/M77 provenance hashes.

### Default single-target path

`verify-m71-measurements.py` compares **every output byte**, removing only the elapsed-ms field:

| Profile | Before | After | Complete-output comparison |
|---|---|---|---|
| synthetic 60 × 1500 / window300 | n36 · win19.4% · −0.2944R · PF0.61 | identical | equal except runtime |
| real15 / window300 | n9 · win22.2% · +0.2222R · PF1.40 | identical | already byte-equal |
| native synthetic 10 × 1500 | n0 | n0 | equal except runtime |
| native real5 | n0 | n0 | already byte-equal |

Native synthetic: 13,750 reads / 1,006 known named reads / 0 ready / 0 outcomes; 220 counter reads / 167 completed. Native real: 4,761 reads / 677 known / 0 ready / 0 outcomes; 81 counter reads / 27 completed. **No native model edge/ranking/calibration and no default outcome improvement.**

### Opt-in ladder path — T1-only diagnostic, NOT managed ladder expectancy

The unchanged harness values **T1 only**, even under `--ladder`; it does **not** simulate the advertised partial/BE/runner lifecycle. The old stale header claiming M51 was unresolved was corrected, without changing the simulator. These numbers measure the eligibility correction and first-target outcomes only:

| T1-valued profile | Shipped runner-floor path | Fixed primary-floor path | Descriptive change |
|---|---|---|---|
| synthetic ladder | n61 · win23.0% · −0.2070R · PF0.64 | n36 · win19.4% · −0.2944R · PF0.61 | **−0.0874R deterioration** |
| real15 ladder | n30 · win23.3% · −0.0263R · PF0.93 | n9 · win22.2% · +0.2222R · PF1.40 | +0.2485R descriptive difference |

Both fixed ladder outputs are identical to their fixed default T1 outputs except synthetic runtime. Removing earlier signals changes the one-position-at-a-time scan path, so these are **not a paired fixed trade cohort**, and the difference is not a causal expectancy estimator. The real n9 arm is dependent and below the course's30 threshold; a parent n30 does not validate an n9 post-change result. The synthetic generator's known range distortion remains. **The synthetic deterioration is retained, not tuned away; no target shrinking, performance guarantee or managed-ladder improvement is claimed.**

## 5. Verification and retained failures

New feature checks: **226/0 primary**, **48/0 full consumers**, **15/0 saved settings**, **6/0 clipboard compatibility** = **295 feature assertions**, not 295 ledger findings. An additional **1/0 exhaustive default full-object neutrality** check brings this milestone's new checks to296.

- Shipped controls: primary132/94; consumers12/36; saved settings7/8.
- 100 actual synthetic OHLC→SMC observations / 400 single/ladder candidates: zero moved geometry/configured-risk-policy/evidence, zero default score/grade/permission differences, zero permitted sub-floor targets. This small geometry census contained zero previously rescued detected-candle candidates in that census; it is not falsely presented as a positive native named execution census.
- Named market-shift/flip in both directions run the real composer with explicitly declared HTF/MTF/target context; refused basic pullbacks cannot arm Now/chart or be automatically stored. Prescribed M33 target/half-risk, causal pullback, projection-only CRT and calibration withholding remain.
- M33 67/0; M21 11/0; M26 49/0; reverify67/0; M54 54/0; M77 87/0 + consumers41/0; M75 41/0 + consumers57/0; M78 consumers169/0; M70 30/0; M68 detector16/0; Now50/0; topdown77/0; chart36/0.
- HTTP API **121/0 in both actual source versions**. Serialized smoke **22/22**, zero UI-style/console errors, offline/local only. Canvas fallback/recording tests are not pixel/pan/zoom proof.
- Historical M78/M76 full-object aggregate checks on current source return **118/1 and33/1** respectively. They compare every Setup field against their old source while stripping only their own older annotations; M71 legitimately adds RR evidence and changes narration. Raw failures are retained, not weakened. Running those unchanged historical probes on frozen pre-M71 `184695d` yields119/0 and34/0. The new exhaustive default comparison validates each permitted RR metadata/narration difference and finds **zero other changed output paths**; the four whole profile comparisons separately prove unchanged default results.
- Initial core169/17 was an overbroad fixture assertion that hypothetical C-grade sizing must stay equal plus a nonexistent `candidate.countertrend` property. The correction checks unchanged geometry/risk coefficients and the real `levels.execution_kind`, and explicitly verifies grade-based size. Initial consumer41/7 used the market-shift entry for flip geometry and discovered the actual saved-floor bug; a fixture-clock instrumentation error is also retained. None of those raw negatives were erased.

Correctly addressed serialized bot API runs return **204 passed / 2 failed in both
versions**, 17 filled trades each and0 parity mismatches. Both failures retain the
unchanged `checked>=20` / `filled3.length>20` sample floors; **not fully passed**.
These wall-clock/cache-backed runs are not a paired fixed-cohort outcome control.
The initial “parent” run passed a CLI URL that `bots-test.js` ignores (it uses
`TJ_BASE`), so it actually hit3000 and tried cleanup in3001:203/3, including0-row
cleanup. That invalid-control output is preserved as `bots-parent-invalid-base.txt`,
not counted as parent evidence. Explicit `TJ_BASE` reruns verify3000/3001 headers,
correct cleanup and the same two sample failures. No app logic/test threshold was
changed to fix the runner's incorrect test invocation.

## 6. Durable artifacts and what was not changed

`build-m71-artifacts.py` reconstructs the exact parent from Git, validates all110 frozen complete source files and independent intermediate manifests, rebuilds each intermediate stage, and produces:

- `patches/m71-primary-rr.patch` — target-floor and browser consumer stage;
- `patches/m71-saved-floor.patch` — only saved RR database read;
- `patches/m26-saved-window-regression.patch` — only saved session database read;
- `patches/m71-copy-compatibility.patch` — only legacy clipboard payout fallback;
- `patches/m71-complete.patch` — combined delta on184695d;
- `patches/applied-so-far.patch` — cumulative diff against **`tradingpro-main.zip`**;
- `patches/M71-STAGES.json` — stage hashes/file counts and clean apply/reverse byte proofs;
- root `tradingpro-fixed.zip` — verified final110-file application source plus audit/evidence.

Every patch is independently clean-applied/reversed and byte-compared. ZIP application bytes match the guarded source; `package-lock.json` stays unchanged. Patch file counts/hashes are in `M71-STAGES.json`; final archive SHA/size are in **`evidence/m71/archive-sha256.json`**, deliberately excluded from the ZIP to avoid a circular self-hash. Historical milestone patches are preserved. No `.env`, credentials, local DB, dependency tree, downloaded datasets or raw transcripts enter these artifacts.

The four changed application files are `setup.js`, `public/js/tv.js`, `public/js/views/bots.js`, and the two configuration reads in `src/routes/bots.js`. No SMC detector, target catalogue algorithm, stop chooser/buffer, named entry composer, predictor simulation, schema, production provider/auth/cron/database deployment or undocumented advanced shortcut is changed.

Manual Save-plan/journal input remains a research/journaling path, **not an execution authorization or server-side OHLC validation**. The current scan's existing fixed2R configuration is not silently changed into a per-user setting in this finding. Remaining guardrail enforcement and chart issues are still visible, not declared fixed by an offline demo.

## 7. Continuation

Next mechanism: **M79/M80 guardrail enforcement and accountable override**, with their dependencies scoped/measured separately. Keep all55 TODOs and two partials visible. Preserve the deliberate M103 `n>=5` detector gate, course30 for M11, the user's risk/grade choices, independent risk authority and the refusal to pursue70% by shrinking exits.

## 8. Final artifact and preview record

Combined delta: **4 application files**, clean forward/reverse/byte proofs0;
cumulative pristine-ZIP patch: **39 application files**, proofs0; source ZIP:
**110 application files**, application byte differences0, unchanged lockfile.
Independent-stage patch hashes and byte counts are in `M71-STAGES.json`.
The archive companion gives the final deterministic hash without self-reference.

Current3000 is the newly restarted offline synthetic/local SQLite demo at
`/tmp/m71-regressions.db`, scheduler disabled/remote credentials blank. Parent3001
was stopped after the correctly addressed API/bot control runs. Measurement and
bot-regression jobs finished. This is not production/provider/deployment proof.
