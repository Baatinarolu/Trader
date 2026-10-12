# M99 + M101 — saved periodic reviews and chosen-focus follow-up

2026-10-12. Actual parent `32fdfbd9bd95963b15b116953dc9ea8022cffd6f` (M93,129 source files). The workspace/remote already contained the completed M93 batch; this pass continues its recorded next item, not another M93 closure.

**132 =96 done /3 partial /33 TODO /0 no-action**, eight groups. M99 periodic artifacts and dependent M101 focus follow-up close together, measured separately. M100 is next. M30/M103/M108 remain partial; M104/M105/M106/M111/M112 stay open. No other finding closed.

## Saved course basis and scope corrections

Saved Ep26 `xoUlvwdBVJ4`, COMPLETE3/3, and Ep27 `IieXTRD15GU`, COMPLETE4/4, in `EPISODE-AUDIT.md`:

- Record daily → review weekly → reflect monthly → refine quarterly → reassess annually. Weekly/monthly/quarterly questions have different purposes; weekly evidence is not permission to re-tune a plan or annual goals.
- Weekly: what worked and why, mistake prevention, best/worst **process**, one focus. Monthly: strongest lesson, mental barrier/plan, proud process versus results, one focus. Quarterly: recorded patterns, 80/20 as a review question, best market/setup evidence, mistakes/process upgrades, documented refinement hypothesis/next90-day theme.
- Annual deep reassessment is described, but the saved excerpt does **not** supply a complete exact question list. Annual prompts are explicitly **APP-guided from that scope**, not invented quotations.
- “One periodic review means one focus, not10.” The next review must be able to ask whether that exact chosen commitment was acted on.
- Quarterly review becomes a source/baseline for the next90 days; existing owned strategy versions/rules are copied into the review. Course floor30 unchanged; a completed document or30+ records does not establish causality/edge.

**APP calendar policy:** UTC, Monday-start weeks, calendar months/quarters/years, end-exclusive intervals. Not a quoted course timezone or inferred trader/broker hours. Accounts remain separate. **Cadence structures/documentation are implemented, not a new global hard veto on lawful strategy corrections.** Review routes never apply strategy/risk/goal changes. M104's actual1–3-change discipline and M105 identity mechanism remain open; neither is silently claimed by a quarterly textarea.

## Implementation

1. **Owned additive revision table.** `period_reviews`, one append-only series per user/original account key/kind/canonical start, unique version. Draft, completed answer-record, or imported historical declaration; template version, answers, chosen focus, follow-up, frozen metrics/context, source/receipt/amendment. No trade columns or historic backfill. Owner FK cascades, account FK SET NULL preserves orphaned original review snapshots; account key is historical metadata, not authority to attach another account. Original fact UPDATE prohibited by SQL trigger, allowing only FK account-nullification after deliberate deletion. Not sealed against a database administrator.
2. **Distinct templates.** Weekly/monthly reflection; quarterly documented hypothesis/baseline; annual APP-guided reassessment. One single-line focus, no default recommendation or NLP claim of semantic singularity. Required completed answers allow an honest “unknown/not enough evidence”; no invented filled questions. Draft can remain incomplete. Current-period review may be acknowledged early but **period_finished:false** is shown—answered record, not elapsed-calendar or market validation.
3. **Owned strict API/CAS.** Authenticated list, saved/by-id and template previews; canonical positive owned account and kind/start, template date-in-period normalisation. Save draft, complete, explicit reasoned amendment. POST only revision/answers/focus/follow_up/amend_reason, no caller metrics/source/clock/owner/permission. Current financial/rule/checklist/strategy context and exact prior commitment enter revision. Unseen edit409 needs deliberate reload; malformed400, foreign404, actual store503 rolls back artifact only, not earlier finance. Identical retry preserves receipt/version. Completed artifacts are not overwritten by draft; amendment appends old/new versions.
4. **Honest server snapshots.** Whole selected OWNED UTC **close-day** period financial cohort, no open/foreign/out-of-range rows. Known-net win denominator, unknown counts/subtotal, nullable whole-net/expectancy/R/drawdown. Missing/unassigned/future close clocks don't get guessed opening dates; unknown/contradictory R not0/∞. Original execution best/worst ties and unreviewed counts separate from entry setup grades; checklist self-report coverage separate. M91 and M93 entry/rule-day reports labelled independently from close-day finance. Raw saved metrics don't recalculate after correction. Live preview/context difference is explicit.
5. **Quarterly strategy baseline.** Copies owned immutable version definitions/notes and period cohort counts. Fresh default strategies without a version are retained as **current_unversioned_not_original_entry_rules**, not empty or invented v1/entry proof. Existing M102 legacy assumption notes survive. No strategy, version, risk, cap, grade, routine, admission, core review or target/RR write occurs. Sample30 annotation only.
6. **M101 exact commitment.** Adjacent prior completed revision shown with its chosen focus, ID/version/source/receipt. Current user explicitly selects yes/no/null unknown; no default acted claim. Answer is a present self-report, not verified broker/action fulfilment. Saved follow-up captures that original text/clock/version. Later amendment of the prior focus does not rewrite the older response; changed prior version triggers409 and visible changed-reference warning. Missing adjacent history is not “failed” or “yes”. Imported prior commitments remain labelled unverified.
7. **Actual Journal UI.** Existing daily notebook/core stays intact; added cadence manager with4 selections, saved period discovery, canonical preview, distinct questions, frozen/live metrics and strategy baselines, draft/complete/amend, retained history. Previous focus and explicit tri-state answer; saved textarea values retained on reload/amend, HTML-like words escaped. User/account/token/serial/closed responses guarded; actual409 retains draft and disables writes until reload,503 does not claim completion. Editor never issues strategy/grade/permission writes.
8. **JSON history, not workflow replay.** Full backup `period_reviews:{version:1,records:[...]}`; finance CSV does not carry standalone period artifacts—use JSON. Restore forces actual destination user/account/new IDs/revisions, source **imported_unverified**, new receiving receipt, status imported. Original source/status/clock/focus/answers/snapshot/follow-up declarations retained as unverified history; foreign IDs establish no ownership. Re-export/restore retains original declared clock rather than replacing it with receiving time. Imports append history, do not overwrite a human record. Invalid optional data warns without vetoing otherwise valid finance; real artifact-import-store failure atomically rolls back that request's finance/artifact mapping. Missing review store still permits financial backup with explicit unavailable marker. Actual Settings warnings remain visible and don't auto-refresh away.
9. **Budgets and known gaps.** Answer4000 chars/question, one single-line focus<=300, amendment<=1000, focus reflection<=2000; snapshot scope<=10000 account records, portable<=500 records and1MB declared snapshot each. These are APP input budgets, not course quotations; no silent clipping. Existing20MB file/25MB API body limits unchanged. M100 missed-value reconciliation and verified impulse counts remain **unavailable**, not inferred from unused signals/legacy emotion or given hypothetical R. No causal dollar allocation from mistakes or80/20 prompt. Review completion is not required trade/core writing.

## Independently measured changes

Actual runtime/auth/HTTP/libSQL and shipped DOM. Literal journals/fixedUTC, tiny image protocol fixtures, controlled deferred replies/unused graphics explicit; not broker/mental/human/meditation/pixel/production or edge proof. No prerequisite adapter in these feature probes.

| Source stage/probe | Immediately prior control | Implemented | Evidence in `evidence/m99/` |
|---|---:|---:|---|
| Calendar/template/body contract | actual M93 parent0/30 |30/0 | `parent-periods-results.json`, `periods-results.json` |
| Honest financial snapshot arithmetic | periods0/20 |20/0 | `periods-only-metrics-results.json`, `metrics-results.json` |
| Revisioned owned storage/API/source/context | metrics5/22 |27/0 | `metrics-only-storage-results.json`, `storage-results.json` |
| M101 commitment/follow-up reference | storage4/12 |16/0 | `storage-only-focus-results.json`, `focus-results.json` |
| Actual manager/templates/editor/follow-up UI | focus2/16 |18/0 | `focus-only-ui-results.json`, `ui-results.json` |
| Historical JSON backup/restore/outage | UI1/13 |14/0 | `ui-only-portable-results.json`, `portable-results.json` |
| Stored clock/snapshot/unversioned plans/textarea/warnings | portable5/7 |12/0 | `portable-only-hardening-results.json`, `hardening-results.json` |
| Actual409/reload/superseded/imported editor | no fabricated control |8/0 | `freshness-results.json` |
| Actual129-file parent additive upgrade/restarts | parent11/4 |15/0 | `parent-migration-results.json`, `migration-results.json` |

**Final160/0 across9 probes**, every observed exit0. Seven frozen runtime stages plus docs; final131 source files. Intermediate totals are not summed twice. Source maps/harness hashes and durable stage patches preserve measured bytes.

## Original cohorts and negatives, not one fake integrated green suite

- Original M93 **113/2 across7**, M91 **106/2 across6**: exactly two each from their unchanged **zero-schema/all-table** migration assumptions. Legitimate new review table/index/trigger violates those old whole-schema expectations; they are retained, not edited. Other M93 six probes104/0 and M91 five probes97/0. Independent actual129-parent migration15/0 proves only4 review schema objects, no trade columns, all ORIGINAL rows/clocks/core/grades/decisions/first response facts exact.
- M89 emotion **170/0**, M88 reasons **160/0**, execution **260/0**, actual routine **321/0**. Older owned-strategy UI freshness remains UNMEASURED. M87 screenshot **223/3** inherited migration shape negatives retained.
- RAW legacy **596 reported/156 failed/31**,21 completed nonzero plus one90s timeout/null exit/summaryless. DECLARED held-fulfilled **824/4/31**, two nonzero: old M85 fixed-server11th vs browser12th and old account-forwarding mock missing real API.getToken. Do not weaken token guards/rewrite old assertions.
- Offline **178/0**, DECLARED market **325/0**; live-provider attempts **70 reported/1 failed**,6 nonzero/5 summaryless, not provider availability.
- Prepared native actual-parent/current **API121/0 each, Bots206/0 each**,24 synthetic fills/0 mismatches. RAW APIexit2/no summary, Bots**202/4/exit1**,24 fills/0 mismatches. Synthetic offline IO + declared actual preparation/15m clock, not market improvement, broker or human/meditation proof. Test servers stopped.
- Original conditional served-source smoke **21/21**,0 style/console,8 canvas limits,observed exit0,94.982s; exact outputs/canvas limits recorded in `smoke.txt`/`smoke-exit.json` and stage manifest; JSDOM/TradingView blocked, not real pixels. Not included in160 feature assertions.

## Initial harness errors kept

- First freeze used app cwd rather than repository root and failed before source measurement; corrected actual129-file Git parent has all hashes equal M93 release manifest. Missing dependencies restored with npmci/ignore-scripts,0 vulnerabilities, unchanged lock; log retained.
- Storage initial2/11 aborted on absent-module history dereference; corrected complete negative5/22. Focus initial1/5 similarly aborted; corrected4/12. Portability initial0/2 similarly absent destination dereference; corrected1/13. None treated as full assertion denominator.
- UI initial3/1 fixture called `last.textContent` instead of `last().textContent`. Later token fixture deferred the authenticated transport itself until after token replacement, causing401/unhandled rejection rather than a controlled old response. Initial logs kept; actual old authenticated response fetched first, only resolution deferred. Quarter wording assertion made case-insensitive; shipped text/source unchanged. Final18/0.
- Copied runner initially omitted `behavior` from CLI choices (exit2 before assertions); kept, corrected harness choice only. Old M93 and M91 schema negatives not erased.

## Delivery and continuation

`build-m99-review-artifacts.py` replays seven measured runtime patches/docs, combined actual32f diff, and cumulative pristine `tradingpro-main.zip` diff. All forward/reverse applications require **zero byte differences**. Exact hashes/counts in `patches/M99-REVIEW-STAGES.json`; archive companion excluded to avoid self-hash.131 source, no private env/DB/dependencies/cache/credentials. Financial normalizer/performance/execution/core/routine/guard/entry engines, first response, daily/window score, weights/grades/default risk/factors/geometry/stops/targets/RR/native tests/lock byte-guarded. Floor30, M103n>=5 and B/C tradeability unchanged.

Main preview temporary `/tmp/m99-preview.db`: synthetic/offline, schedulerOFF, blank remotes, not preserved real data. `/tmp`, packages/processes not snapshot-guaranteed. Continue M100; M104/M105/M106/M111/M112 stay open, M30/M103/M108 partial. No70% win rate, causal/predictive edge, verified human/broker/provider/meditation/production/pixel claim.
