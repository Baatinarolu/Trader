# M105 — independent re-verification in a second sandbox

2026-10-13. Branch `arena/b411452d-trader`, parent `6f0783c` (the M105 release commit).
**No product source was modified by this pass.** Every number below was produced by running the
committed code in *this* sandbox, with all outputs written to `/tmp/verify/`; the frozen evidence
under `analysis/evidence/m105/` was left byte-untouched (`git status` clean).

**Question asked:** the M105 record (`M105-IDENTITY-QUARTER-THEME.md`) says *142/0 across 10 probes*
and *132 · 99 done / 3 partial / 30 TODO / 0 no-action*. Those numbers were measured in the session
that produced them. A closure claim that cannot be re-measured somewhere else is a claim about a
sandbox, not about the code. This pass re-measures it from nothing but the committed tree.

**Verdict: every M105 cohort reproduces exactly. No new finding. No count changed. M105 stands.**

---

## 1. Method

| Step | What was done | Why it is not a re-assertion |
|---|---|---|
| 1 | `npm ci --ignore-scripts` in `extracted/tradejournal` → 111 packages, lock file unchanged | fresh dependency install, not a cached tree |
| 2 | The whole 13-parent regression chain rebuilt **from the committed tree** by reverse-applying the saved patches (`analysis/patches/*-complete.patch`) and asserting byte-equality with each frozen `parent-source.json` | proves the patch series is reversible and that the frozen parent hashes describe *this* tree — the original pass built parents with `git archive <historic commit>`, which is impossible here (see §5) |
| 3 | Third-party OHLCV re-downloaded with `analysis/fetch-fixtures.js` → **7 accepted / 1 rejected** (`EURUSD-1d.csv`, upstream TLS failure in this sandbox; the validator's median-step check rejected nothing) | the market/offline cohorts are measured against re-fetched real bars, not a stale fixture directory |
| 4 | All 16 cohorts re-run with the original runner semantics (`TJ_APP`, `TJ_PARENT`, `TJ_OFFLINE_CANDLES=1`, the DECLARED M64 prerequisite `--require=analysis/m64-legacy-prerequisite.js`, `legacy-guard-fixture-runner.js` for the legacy group) | same harness, same prerequisites, different machine |
| 5 | Ledger regenerated (`python3 analysis/gen-progress.py`) and diffed | the partition assertion is re-executed, not trusted |

## 2. Cohort-by-cohort reproduction

`expected` = the frozen value in `analysis/evidence/m105/*-summary.json`; `reproduced` = this pass.

| Cohort | Probes | Expected | Reproduced | Verdict |
|---|---:|---:|---:|---|
| **feature (M105 itself)** | 10 | **142 / 0** | **142 / 0** | exact |
| changes (M104) | 11 | 152 / 1 | 152 / 1 | exact, negative kept |
| opportunities (M100) | 10 | 144 / 1 | 144 / 1 | exact, negative kept |
| reviews (M99/M101) | 9 | 159 / 1 | 159 / 1 | exact, negative kept |
| behavior (M93) | 7 | 113 / 2 | 113 / 2 | exact, negatives kept |
| process (M91) | 6 | 106 / 2 | 106 / 2 | exact, negatives kept |
| screenshots (M87) | 9 | 223 / 3 | 223 / 3 | exact, negatives kept |
| emotions (M89) | 13 | 170 / 0 | 170 / 0 | exact |
| confluences (M88) | 8 | 160 / 0 | 160 / 0 | exact |
| execution (M86/M92) | 9 | 260 / 0 | 260 / 0 | exact |
| routine (M14/M64/M94) | 10 | 321 / 0 | 321 / 0 | exact |
| offline (synthetic candles) | 4 | 178 / 0 | 178 / 0 | exact |
| DECLARED market | 4 | 325 / 0 | 325 / 0 | exact |
| RAW inherited | 31 | 596 / 156 | 596 / 156 | exact — failures and early aborts preserved |
| DECLARED held-fulfilled | 31 | 824 / 4 | 824 / 4 | exact — two nonzero retained |
| live-provider attempts (`pure`) | 8 | 70 / 1 | 70 / 1 | exact — 6 nonzero / 5 summary-less, same abort pattern |
| served-source smoke (jsdom) | 1 | 22 / 22, exit 0, 0 style, 0 console, 8 canvas limits | **21 / 21** with the same exit 0 / 0 / 0 / 8 | see §3 |

The three RAW and three DECLARED “actual-parent migration” probes need an older parent tree; with
step 2's rebuilt parents they reproduce to the frozen value and were re-run individually to confirm
(`m79-migration` raw 7/2 vs declared 9/0, `m81-profit-migration` raw 12/1 vs declared 13/0,
`m84-m85-migration` raw 16/1 vs declared 17/0 — the deliberate difference between “no prerequisite”
and “prerequisite held fulfilled” survives).

## 3. The one difference, and why it is not a regression

The frozen smoke log contains two extra `✓` lines inside one conditional block
(`measured view switch title` + `switching to the measured view changes the dial's label and data`),
which is what makes it 22/22. In this sandbox that block did not fire against a fresh empty synthetic
workspace, so the run reports **21/21**. Everything else matches: `0 UI-style failures`,
`0 console errors`, `8×` jsdom canvas limitation, exit 0. The M105 report already labels this switch
**conditional**, so this is the documented behaviour, not a discrepancy — recorded here rather than
smoothed over, because “22/22” would otherwise read as a stable count.

## 4. Delivery-artifact and ledger consistency

| Claim in the M105 record | Independently checked | Result |
|---|---|---|
| `tradingpro-fixed.zip` is the M105 delivery | `sha256` vs `evidence/m105/archive-sha256.json` | `6aa6eafd…1e355` — **matches**; 4 940 entries; contains `src/identity.js` |
| change surface = 13 files | `git apply --numstat` of `m105-identity-theme-complete.patch` | 13 files, **+266 / −15**; exactly the set asserted by the build script |
| 137 source files, 135-file parent | file counts of `release-source.json` / `parent-source.json` | 137 / 135 |
| docs-only files touch no runtime | hash diff parent→release | the three docs are the only extra paths beyond the 13 |
| ledger 132 = 99 / 3 / 30 / 0 in 8 groups | `gen-progress.py` re-run | **PROGRESS.md regenerated byte-identically**; partition assertion passes across 8 groups |
| M105 row is closed and M106 is next | `MISMATCHES.md` + generated ledger | `M105 done`; `M106/M107/M111/M112 todo`; partials `M30/M103/M108` |

## 5. Environment notes for whoever builds the next milestone here

1. **The delivery script refuses this session’s branch.** `analysis/build-m105-identity-artifacts.py`
   asserts `git branch --show-current == arena/762c0295-trader`. This session is fixed to
   `arena/b411452d-trader`, so that assertion must be widened (or the script parameterised) before any
   milestone artifact is regenerated — otherwise the guard stops the build, which is the correct
   failure mode but not a useful one.
2. **This clone has a single-commit history.** `git archive 903c156…` (the M105 base) fails, so
   `freeze()`/`--freeze-parents` cannot run. The reverse-patch reconstruction in §1 step 2 is the
   substitute, and it is a *stronger* check: it proves the shipped tree plus the saved patches
   reproduce every frozen parent exactly.
3. **`analysis/fixtures/` is gitignored and arrives empty.** Without step 3, the market and offline
   cohorts abort (`MODULE_NOT_FOUND`-style early exits are *not* pass results) and the smoke log is
   the only place the difference would show up.
4. **Running the probes leaves `extracted/tradejournal/data/journal.db`** (gitignored). It is created
   by the app's default DB path during probe runs; it must be excluded from any tree-digest comparison
   (this pass hit exactly that, and the first chain comparison failed on nothing else).
5. Native API/Bots suites, the real-browser (`playwright-core`) UI test and the ZIP rebuild were **not**
   re-run in this pass: the first needs the native runner plus a parent tree, the second needs a
   chromium download that does not belong in a verification pass, and the third is blocked by note 1.

## 6. Scope — what this pass does not claim

This is a **re-measurement of measurements**: it shows the committed code, the saved patches, the frozen
hashes and the written counts are mutually consistent and reproducible on a second, independent machine.
It adds no new product evidence. Specifically it does **not** create, and must not be cited as, any
claim about: real broker fill/human action, meditation or mental state, live provider readiness,
chart pixels, causal identity→P&L psychology, a 70 % win rate or any predictive edge, or production
use. The M105 record's own boundaries (declared words are not verified psychology; the reported-plan
tally is a self-report denominator with unknowns kept separate; the quarter is an APP ~90-day calendar
policy) are unchanged and remain the governing ones.

**No finding was raised or closed by this pass. `M105` stays `done`; the next milestone is `M106`
(fresh in-session four-question state gate). `M107` (daily intention) and `M111`/`M112` remain TODO;
`M30`, `M103`, `M108` remain partial.**
