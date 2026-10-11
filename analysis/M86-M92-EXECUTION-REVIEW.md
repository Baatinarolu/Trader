# M86 / M92 — execution self-review, not outcome grading

2026-10-11 · `arena/762c0295-trader` · measured parent
`c22d5b9f6db4eca17f5981f5b87230f5ec343b86` (117 application files).

## Scope and ledger

**M86 and M92 applied together, separately staged/measured.**
**132 findings: 89 done · 3 partial · 40 TODO · 0 no-action**, exact eight-group
partition. M30/M103/M108 remain partial. This is not a claim that every finding
is finished. Generated `PROGRESS.md` preserves all 132 IDs and their groups.

**Handoff correction:** M86 is execution-based good/bad-loss journal grading,
**not a loss-drill workflow**. Prior routine report/handoff incorrectly labelled
it a drill. No drill was invented. M92 is the related process-ranked best/worst
trade finding, not biggest P&L. Entry setup/checklist grades/risk multipliers,
price/RR/stop/target geometry and course sample thresholds are unchanged.

Sources are the authoritative saved excerpts in `EPISODE-AUDIT.md`, not new
web fetches or guessed transcript timestamps:

- Ep23 `Gx6KAhhWn10`, complete3/3: grade execution; profitable does not mean good;
  good loss follows the plan, bad loss neglects it. Adherence already existed;
  this fixes weighting/classification, not invented journal psychology.
- Ep24 `4sN-gnJKRtA`, complete4/4: examine winners for rule-breaking and losses
  for plan-following, not money alone.
- Ep26 **`xoUlvwdBVJ4`**, saved complete3/3 content chunks (site chrome checked):
  “Best trade doesn't mean it's the trade with the biggest profit. Worst trade
  doesn't mean the trade with the biggest loss.” Process, not outcome. The first
  scaffold had a mistaken ID, corrected from the saved heading before use;
  scope paraphrases are labelled **paraphrases**, not fabricated quotations.

Historical Ep23 probe (no session bonus) gave adherence1–5 **70,70,80,86,86**
and called every −.80R loss “good”. The new SAME-parent literal fixture includes
New York's old+4 bonus: **74,74,84,90,90**, still all “good”. Do not mix the
historical70s with the current74s; the additive fixture difference is explicit.

## Changes

### M86: current human execution, never capital grading

`src/execution-review.js` supplies pure current derivation used by actual
`correction.autograde`, trade APIs and consumers. Adherence1/2/3/4/5 maps to
**20/D,40/C,60/B,75/A,95/A+**; an explicit stop violation caps39/D. This is an
**app display rubric**, not a numeric course quotation, validated strategy or
changed pre-entry grade policy. P&L/R/planned RR/session/MAE/MFE earn no points.
A losing high-adherence/honoured-stop trade can grade well; a profitable
rule-breaker cannot earn A/A+ or outcome-only “repeat it” praise.

Good loss requires **adherence>=4 AND explicit honoured stop AND known consistent
realised loss**. A protective/allowed stop move is not automatically a violation.
Default `stop_moved=0` does not prove honour. More than1R can reflect
fees/gaps/slippage; its amount does not establish missed stop or late exit.
Unknown/contradictory realised outcome is not an invented breakeven/good loss.

Four additive nullable fields: `stop_honoured`, `stop_honoured_source`,
`stop_honoured_recorded_at`, `execution_review_hash`. Existing bounded
`adherence` remains a human field. A separate owned/authenticated
`POST /trades/:id/execution-review` accepts **two literal human fields plus the
current displayed `record_revision`**. No client clock/source/hash/grade spoofing.
The server acknowledges relevant saved fields atomically, after actual close.
Open/future/stale409, malformed400, foreign/missing404, write503/rollback.

The hash is **current-record consistency, not broker authentication**. A relevant
financial/plan/rating correction withholds old evidence until explicit re-review;
irrelevant note edits preserve it. The UI reads the actual saved record, not an
unsaved trade-form draft, guards account/workspace changes and late responses,
and refuses to attest an unseen concurrently edited record. Unknown/corrupt/
legacy/stale evidence has **Unreviewed/null score**, not fake poor/good execution.
A valid acknowledged partial self-report may identify a specific violation, but
cannot receive a full grade or good/bad-loss label. A stale/invalid raw low rating
is not a current violation. Corrupt numeric metrics are never coerced to0 facts.

**No execution score cache/persistent grade.** The old destructive
`backfillGrades` is now **read-only**: `updated:0`, evaluated/reviewed/unreviewed
counts. Explicit owned cohort selection, strict ID shape, foreign404. Its GET
compatibility path is read-only too. `setup_grade` is never overwritten. Existing
old manual/model/auto-backfill provenance cannot be recovered, so even a wrong
legacy A remains stored but is explicitly NOT an execution grade. Correction
shows separate execution vs stored-entry-grade tables, with provenance caveat.

Feedback separates valid current human execution from descriptive money. It no
longer calls a big winner repeatable solely because it hit a target, treats stop
movement as widening, or infers entry/exit error from MAE/MFE or loss size. Other
unchanged historical detectors are not thereby broker/motive verification.

Truthful financial create/close/correction/deletion/import/record-only entries
remain legal without optional grading. JSON/CSV import does not replay server
acknowledgements or invent legacy completion; explicitly re-review. Execution
review does not complete core writing, waive unknown state or change retained
caps/loss/streak/cooldown/routine/admission facts.

### M92: independent day execution extremes

Actual daily review ranks current known closed self-reviews by **execution score**,
not stored setup grade, dollars or R. Unknowns unranked, all score ties retained,
no money tie-break. Relative best/worst does not imply every “worst” was bad or
an unknown large loss was poor execution. This can correctly make a losing
C-entry-quality trade best and a profitable A+-entry-quality rule-breaker worst.

The day API is one owned account/UTC close day, resolves the default rather than
mixing accounts beside a default routine, retains shared notebook text, excludes
other owners/accounts. Open floating data is not realised. Money-only extrema
and nullable realised day P&L/R values remain separate; NULL net does not become0.
Every prior numeric performance metric is preserved bit-for-bit; numeric
`best_trade`/`worst_trade` remain explicitly labelled legacy MONEY compatibility
fields, plus separate derived `execution_summary`. Dashboard/Analytics money
labels no longer call those values execution “best/worst”.

## Measured source boundaries and controls

Eight runtime stages plus a documentation-only stage; frozen file-SHA manifests
and durable incremental patches. Early incremental probes establish only their
narrow stage, not that an unfinished intermediate app was ready to ship.

| Measurement | Declared preceding control | Actual final, no prerequisite adapter |
|---|---:|---:|
| Pure execution rubric | parent4/56 (original56-case control4/52) | **60/0** |
| Strict review/auth/storage contracts | rubric-only6/36 | **42/0** |
| Read-only refresh / feedback | outcome-only3/20 | **23/0** |
| Displayed-record freshness | feedback-only3/11 | **14/0** |
| M92 day process/money compatibility | freshness-only3/21 | **24/0** |
| Actual shared/log/form/core/day/whole Bot UI | day-only2/31 | **33/0** |
| Market/risk noninterference,4 model/direction cases | parent26/8 | **34/0** |
| Actual shipped schema → current separate-process migration/restart | actual parent lacked4 fields | **15/0** |
| Current evidence uncertainty | UI-only2/13 | **15/0** |
| **New feature total** | controls preserved, not summed as proof | **260/0 across9 probes; all exit0** |

`feature-summary.json` is the authoritative final9-run aggregation. Pure rubric
initially56/0; metadata integrity expanded the cases. NULL-net/defaultR0
hardening was **59/1 before fix →60/0**. Current-ack/strict-metric hardening
initially **2/12**, final same15-case control2/13; extra movement descriptor
check **14/1 →15/0**. These negatives are preserved, not erased.

Actual four model/direction consumer tests cover analyse/chart/scan/Now/saved
research signals with32 literal closed journals and real human preparation module
operations. A profitable journal D cannot resize/regrade/reprice the actual future
candidate; before/after geometry, checklist, score, grade, SL/TP/RR, risk and order
bytes match. Exact29/30 personal-guard floor demonstrated independently. Synthetic
candle/CRT IO and artificial history are declared: **not live feed or market edge**.

Migration really starts with c22's original schema/module in another process,
including actual old backfill's wrongA from a1/5 loss plus a manualB. Every original
trade field and independent routine/cap/writing/admission table survives. All4 new
fields start NULL; legacy grades stay intact and execution unreviewed. New explicit
acknowledgement survives restart, running timer remains running, financial
correction invalidates stale review without retrospective entry/admission refunds.

### Coexisting and inherited verification (separate denominators)

- **Prior actual routine feature321/0 across10 probes**, rerun on this implementation,
  no legacy/native prerequisite adapter. Manual-plan UI39/0 remains scoped; owned
  strategy-selection UI freshness from that older feature remains **UNMEASURED**.
- **Original unchanged legacy31:597 reported passes/155 failures**,21 completed
  nonzero, one90s timeout/no summary. Many fixtures omit mandatory preparation;
  some abort early. This is NOT the expected828 denominator or a raw all-green suite.
- **DECLARED isolated legacy31:828/0**; old preparation/capture held fulfilled,
  legacy22 also old writing/emotion/prompt fixture. NOT integrated current-policy
  proof. Initial819/1 was missing old `/tmp/m79-parent`, not an app fix: shallow
  checkout rejects its old Git object. Replayed four durable reverse patches from
  actual c22, **all110 saved parent file hashes match**, then reran just that
  unchanged probe:9/0. Raw counterpart7/2, originals0/1/missing-path preserved.
- Original provider-IO pure/read-settings attempts retain unreachable-network/
  prerequisite aborts:70 reported passes/1 failure,6 completed nonzero,5 no full
  summary. Explicit built-in **synthetic offline** candle mode, no prerequisite
  adapter: Now50/0 +Topdown77/0 +Chart36/0 +settings15/0 =**178/0**. No live-data proof.
- Four DECLARED held-preparation market regressors **325/0**, originals retained.
- Native ORIGINAL API/Bots scripts, matching cleanup DB/source: prepared c22
  control **121/0,206/0**, prepared current **121/0,206/0**. Current RAW/no preparation:
  API **exit2, no completed summary**, Bots **202/4,exit1**. Native synthetic
  preparation uses actual module calls/server15m clock, not human/meditation proof.
  Both prepared native bot arms report **21** synthetic parity fills/**0 mismatches** in this run. Prior23 belonged to the earlier routine run; clock-dependent synthetic samples are not mixed.
- Original smoke on raw current server later reported **21/21 conditional view rows**,
 0 UI-style/console errors, **8 canvas environment limitations**. Tool90s wait
 timed out; exit **NULL/unobserved**, not inferred0 from stdout. Prior22/22 exitNULL
 evidence remains historical. JSDOM is not pixel/rendered-browser/provider proof.

### Errors retained

Initial derived-feedback harness queried nonexistent `guardrail_admissions`:
2/21/early abort; corrected to actual `guardrail_entry_admissions`, control3/20.
Initial whole-Bot UI unknown-score assertion accidentally matched the unrelated
behaviour running tally's `100/100`:32/1; narrowed only its real feedback card,
then33/0, same-source control2/31. Initial noninterference harness wrongly assumed
above-floor `sample_sufficient`/minimum fields and a `bot_signals.account_id`
column:6/2/early abort. Correct actual schema/conditional output, independent29/30
floor tests, real signal IDs:34/0. No production schema/risk tuning for these errors.
Initial missing old parent/raw-declared stats and unreachable-provider logs remain.
Initial artifact guard assumed the earlier23 native parity fills; actual logs
show21 in BOTH parent/current arms with0 mismatches. Stopped before packaging,
corrected the report/guard to measured21, not a model/target retune.

## Byte proofs, privacy and deliverable

`build-m86-execution-artifacts.py` guards measured source/probes, controls/errors,
exact132/eight groups and all verification cohorts. Nine independent incremental
patches, combined parent patch and pristine `applied-so-far.patch` each undergo
clean forward and reverse **byte equality**. `M86-EXECUTION-STAGES.json` and
`archive-sha256.json` give observed file counts/bytes/hashes; the SHA companion is
excluded to avoid self-hash recursion. Normal rebuilding uses durable patches,
not ephemeral stage folders. Original `tradingpro-main.zip` is untouched.

10 core market modules, instruments, dependency lock, original native API/Bots/
smoke scripts are byte-unchanged. Performance has additive execution fields only;
all prior financial metric projection equality is measured. No secret/env/DB/
dependency/generated dataset inclusion. No credentials were stored/rotated by
this batch. Output: `tradingpro-fixed.zip`, source + complete audit/evidence/patches.

No 70% win-rate pursuit, smaller exits, statistical causation, broker/provider/
production/real-human emotion/actual meditation/pixel proof is claimed.

## Remaining scope — nothing dropped

Partials **M30,M103,M108**. TODO40 in the original mechanism-group order:
**M125,M45,M46,M49,M53,M55,M67,M72,M73,M74,M112,M12,M13,M15,M56,M59,M60,M65,
M66,M87,M88,M89,M91,M93,M99,M100,M101,M104,M105,M106,M107,M115,M17,M18,M19,
M62,M109,M110,M111,M117**.

Next: **M87 HTF/MTF/LTF screenshot capture**, then M88 confluences/mistakes
separation and M89 actual entry/exit emotional capture provenance. Their absence
is not hidden by this execution grade. Fresh per-entry questions M106 remain
independent of morning routine checks; M108 broader Sanctuary partial, live news
M111 and time restrictions M112 open. M116 was already APPLIED, not counted anew.
