# M91 — profitable account-days do not certify process adherence

2026-10-12. Actual parent `5a37105bc2bbf11849494e92d586147f4a398a46` (M89,125 source files). **M91 only**: read-only cross-review of retained M90 trade-exception facts and current complete financial account-days. Not M93 daily behaviour grading, M106 state readiness, actual broker/rule violation or causal reinforcement proof.

**132 =93 done /3 partial /36 TODO /0 no-action**, eight groups. M30/M103/M108 remain partial. M106/M111/M112 remain TODO. Next M93; all132 original findings/IDs retained.

## Saved authoritative course basis and two audit corrections

Saved Ep24 `4sN-gnJKRtA`, COMPLETE4/4, in `EPISODE-AUDIT.md`: days where a trader violates guardrails but still makes money are the ones to watch—“you just got rewarded for bad behavior”; “you shouldn't be celebrating… maybe I don't count it as a win.” The same saved passage reviews the **typed reason after a gray-button exception**. Saved EdgeScore `NsK2uYiqPlY`,2/3 available: positive money can coexist with “at risk” because guardrails were not followed. No new fetch, invented timestamp, unavailable remainder or claim about the trader's actual psychological reinforcement.

1. **A reached stop is not necessarily a rule violation.** Existing M90 `kind:'breach'` means the server observed a personal stop, including correctly reaching a preselected cap/profit ceiling. `blocked_attempt` has no executed trade; research-plan exceptions and record-only/history observations are not actual traded exceptions. The audit's naive `breaches.length>0 && realised>0` would falsely accuse these cases. M91 requires a valid actual saved-trade admission/event under a personal stop; labels it a **recorded guardrail exception**, not a verified bad broker trade or automatic misconduct verdict.
2. **Equal behaviour scores for equal process but different P&L are correct.** Outcome-independent execution/behaviour scores must NOT gain an extra punishment merely because a rule-exception day made money. The original finding's scoring criticism was over-read. M91 adds a distinct review annotation/insight. It **annotates**, rather than excluding/redefining, financial wins, win-rate denominators, expectancy, net and grades. M93's daily score remains separate TODO.

## Implementation and boundaries

- **No schema or persisted flag.** New pure/read-only `src/process-outcomes.js`; M90 `guardrail_entry_admissions` and `guardrail_events` are authority, never client DTOs or copied trade `guardrail_snapshot`. Normal admitted/caution entries remain distinguishable from override admissions. Source ownership, account, original UTC rule date, canonical non-future clock, actual action/trade identity, stop/waiver state, typed reason and nonempty rules are validated. Existing valid short/multiline/<=2000-character reason policy is preserved, not replaced by a new gate. Same actual admission/event is linked once; conflicting metadata is unavailable, not two confirmations. Valid older M90 trade-event-only evidence can still be reviewed without inventing a new admission.
- **Financial scope is full account-days.** Exactly closed rows, actual UTC close day, finite net only, current corrected journal. Ignore floating/open P&L. Never turn unknown amounts into0/breakeven or a profitable flag; unknown constituent or unassigned/future/invalid close clock makes the whole account-day net unavailable. Known subtotal/denominators and unassigned clocks remain explicit. Very large finite totals and overflowing sums are handled without Infinity→profit/zero. Different accounts, owners and UTC dates never pooled into one case. A previous-entry-day overnight exception is not silently attributed to its later profit close day.
- **The case.** A known complete positive account-day with at least one actual retained traded exception sets `rewarded_breach:true`, `process_state:'recorded_exception'`. This is **same-account/day association**, not proof the exception caused the profit or every winning trade broke a rule. Reasons/rules/action clocks survive financial correction/deletion/reopen; current corrected financial totals may change/remove the positive association without erasing captured process history. No immutable historical money backfill or per-trade causal allocation.
- **Honest absence/coverage.** Unknown/unavailable/undatable evidence is explicit, not clean. Mere stop, blocked attempt, research exception and recording observation have separate contextual counts. Valid normal/caution admissions are `captured_admission_only`, not a whole-day compliance certificate. Missing history is unknown, not inferred from emotion, adherence, grades, imported provenance or the absence of losses.
- **Owned read API.** `GET /process-outcomes?account_id=&from=&to=` authenticated, canonical positive owned account or all OWNED accounts when omitted; valid UTC dates/order required, invalid400/404, actual read outage503. An all-account report keeps each account-day separate. Inspector reads accounts/trades/admissions/events inside a same-snapshot transaction; no writes. Optional integration in Analytics/Coach/briefing/journal returns `state:'unavailable',coverage:null` on process-store/input fault, while existing financial reporting remains intact. Day review uses selected/default own account; its M90 history query is aligned to that account, not mixed with another account's events.
- **Actual readers.** `/analytics`, `/coach`, `/briefing`, `/journal` and `/journal/:date` get `process_review`. Trade/symbol/strategy/tag/model filters still drive original financial metrics; process review deliberately uses **full account-day totals** over the date window, so a losing whole account cannot look like a profitable exception day merely by filtering to winners. Dedicated case/reason links in actual notebook/day/Analytics/Coach UI show this basis, scope, coverage and unchanged-win policy. Days are discoverable even with no saved daily note. Coach adds only `rewarded_breach`; unrelated insights/score/summary stay unchanged. Known associated dollars are labelled **recorded flagged-day net**, NOT causal “impact”; unavailable total displayed unavailable. No misleading per-trade category filter for this day-level case.
- **UI context.** Account/user/token, superseded/late reads and fault callbacks guarded. Current failure visible/retryable; obsolete failure does not replace a fresh editor or become an unhandled rejection. Typed reason/rules are escaped text, not active HTML. Optional review cannot complete core/post-loss writing or change grades/caps/routine/admissions/risk. Default selectors never automatically switch the account based on a historical row.
- **Import/proof ceiling.** M91 annotations are computed, not new portable verified workflow. Existing finance/history imports stay legal but cannot replay a server guardrail exception through trade/root DTOs. This pass does not add a guard-history backup transport or infer missing history after restore. Database-owner tampering is not prevented by this reader; not a sealed audit vault. App admission is not actual broker execution, personal exceptions need review rather than an automatic “bad trade” verdict. No causal cost, win-rate improvement, probability, new sizing/permission or70% claim.

## Separately measured source stages

Actual modules/auth/HTTP/libSQL and shipped DOM, fixedUTC/literal journal/human-review fixtures. Real prospective tests prepare the actual owned routine via its real steps with a declared15m control clock: technical path proof, **not human meditation/mental/news proof**. No prerequisite adapter in M91 features; graphical/boot/controlled deferred DOM IO seams declared.

| Change | Immediately prior/control | Implemented stage | Evidence in `evidence/m91/` |
|---|---:|---:|---|
| Pure day/source/outcome contract | actual M89 parent0/37 |37/0 | `parent-pure-results.json`, `pure-results.json` |
| Actual owned admissions/reader/API/unchanged money | pure-only11/10 |21/0 | `pure-only-api-results.json`, `api-results.json` |
| Actual day/notebook/Analytics/Coach annotation UI | API-only3/12 |15/0 | `api-only-ui-corrected-results.json`, `ui-results.json` |
| Source/caution/unknown-clock/reason/overflow hardening | UI-only5/11 |16/0 | `ui-only-hardening-results.json`, `hardening-results.json` |
| Current/obsolete failure and unknown dollar UI | hardening3/4 |7/0 | `hardening-only-freshness-results.json`, `freshness-results.json` |
| Honest day-association action, no per-trade filter | freshness7/1 |8/0 | `freshness-only-presentation-results.json`, `presentation-results.json` |
| Actual125-file parent upgrade/restarts/read neutrality | parent9/2 |11/0 | `parent-migration-results.json`, `migration-results.json` |

**Final108/0 across6 probes**, every exit0. No summing intermediate37/21/etc twice. Six frozen runtime stages plus docs, final127 source files. Source guards and forward/reverse patches recreate stages without relying on `/tmp`.

## Prior cohorts and negative results kept separate

| Cohort | Current result | Limits |
|---|---:|---|
| Original M89 emotion |170/0,13 probes | All actual first-response/owner/API/DOM/import protections retained. |
| Original M88 reasons |160/0,8 | All original contracts/choice/UI/migration unchanged. |
| Original M86/M92 execution |260/0,9 | Outcome-independent scores/grades/money separation retained. |
| Original actual M64 routine |321/0,10 | Older owned-strategy UI freshness remains UNMEASURED. |
| Original M87 screenshots |223/3,9 | Same inherited M88 exact-schema/whole-row migration assumptions; not rewritten. M91 actual-parent zero-schema migration11/0 proves old facts retained. |
| RAW legacy |597 reported/155 failed,31 |21 completed nonzero; one90s timeout/null exit/summaryless. |
| DECLARED held-fulfilled legacy |825/3,31 | Same M85 server fixed11th/browser actual12th negatives as M89. Not integrated preparation proof. |
| Offline / DECLARED market |178/0 /325/0 | Synthetic/literal IO, not provider proof. |
| Live-provider attempts |70 reported/1 failed,8 |6 nonzero/5 summaryless or early aborts, not current provider availability. |
| Prepared actual parent/current native |API121/0 each; Bots206/0 each |24 synthetic parity fills/0 mismatches, declared preparation/15m control clock; not improvement/market/broker/human proof. |
| RAW native |APIexit2/no summary; Bots200/6,exit1 | Same24 fills/0 mismatches; mandatory routine negatives retained. |
| Original conditional DOM smoke |21/21,0 style/console,8 canvas limits,observed exit0 |93.734s, actual served latest backend/assets; JSDOM/TradingView blocked, not pixels. |

Original conditional served-asset smoke and its actual exits/canvas limits are recorded in `smoke.txt`/`smoke-exit.json` and delivery manifest. JSDOM/TradingView blocked is not real-browser pixel or human proof; don't merge it into the feature counter.

## Initial negatives and corrected harness assumptions

- Parent pure fixture initially aborted0/29 on an absent-module dereference. Retained; null-safe corrected complete control0/37, not0/29 as a measured full denominator.
- UI initial14/1 used a too-specific wording assertion (“not every winning trade” vs the equally clear “not a label on every winning trade”). Corrected fixture only; same shipped source15/0; initial result retained.
- Backend hardening first3/10 control incorrectly expected multiline reasons to be invalid. Actual guardrail reasons accept existing nonblank<=2000 plain text. Corrected expectations/additional short/1500/multiline controls5/11; final16/0. No admission policy retuning.
- Freshness first0/1 on both stages: fixture `const fetch` shadowed global fetch before initialization. Preserved; renamed test-local cached fetch variable only, corrected control3/4 vs7/0.
- Migration initial9/1: first boot after creating default strategies lazily writes existing M102 v1 rows on next startup. Diagnostic identified **only strategy_versions/sqlite_sequence**, not M91 writes. An actual-parent restart reproduces/isolates those old lazy defaults BEFORE comparing upgrade; canonical parent control9/2 and M91 upgrade11/0. No copied schema, no ignored financial/evidence/permission tables and no M102 closure claimed.
- Copied verification runner first failed old emotion/reason suite NameError because substring renaming hit the wrong FEATURE constant. Initial logs retained; fixed harness variables, original probes170/0 and160/0.

## Delivery / protections / next

`build-m91-process-artifacts.py`: six frozen runtime patches + docs, literal actual5a combined diff and cumulative pristine `tradingpro-main.zip` diff, each forward/reverse **zero byte differences**. Exact counts/hashes in `patches/M91-PROCESS-STAGES.json` and excluded archive self-hash companion.127 source files; no private env/DB/dependencies/cache/credentials.

Financial normalizer/performance, execution/core/routine/guardrail/strategy engines, native tests, lock, weights/grades/risk/factors/geometry/stops/targets/RR, floor30, deliberate M103 n>=5 and B/C tradeability byte-guarded. No profitable-score punishment, financial-win exclusion, broker/provider/mental/human/meditation/pixel/production/edge or70% claim.

Continue M93 per-day behaviour score separately. M106/M111/M112 remain open, M108 partial. Preserve all132 IDs/eight groups, full controls and negative results. Main preview is synthetic/offline, schedulerOFF, blank remote variables in temporary `/tmp/m91-preview.db`; dependencies/processes/temp files are not snapshot-guaranteed, no real-user preservation claim.
