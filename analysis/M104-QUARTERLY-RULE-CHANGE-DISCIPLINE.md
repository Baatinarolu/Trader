# M104 — named quarterly rule-edit discipline, not trading authority

2026-10-12. Actual parent `8372214715798c29259c8622ff6a025e645fa9a3` (M100,133 source files). The working checkout/remote already contained delivered M100; this pass follows its documented next item, **M104 only**.

**132 =98 done /3 partial /31 TODO /0 no-action**, eight groups. M30/M103/M108 stay partial; M105/M106/M111/M112 remain TODO. Next M105. No other finding closed; the separately measured inherited atomic-version repair is not another closure.

## Course basis and explicit APP counting policy

Saved Ep27 `IieXTRD15GU`, COMPLETE4/4, in `EPISODE-AUDIT.md`: “No more than **one to three changes per quarter**”; “I would advise you to change **one**… **three is the maximum**”; too many variables destroy attribution. M102 versions and M99 quarterly records now provide the prerequisites. No new fetch, invented timestamp or full-transcript claim.

The documented M104 change is **count/name deltas and warn above three**, not a new technical, entry, financial or capital veto. Existing lawful edits remain possible; the Playbook explicitly previews/acknowledges advice. It does not assert that a rule experiment improved results, enforce M105 identity, change the sample30 floor or create a30-trade gate on descriptive edit review.

**Deterministic APP edit units are not verified independent causal variables:**

- Entry/exit/checklist arrays and multiline description/risk text: compare normalised exact lines (NFC, trim/collapsed whitespace; case/meaning not guessed). Unit count is `max(removed,added)`; paired replacements are not charged twice. Pure reordering counts1. Duplicate-line additions count. Scalar market conditions/timeframe/target-R changes count1 each. All eight existing M102 rule-bearing fields inspected, not its legacy first-changed-field alone.
- Cosmetic name/colour/pause excluded. Formatting/numeric equivalence adds no APP units; M102's original raw version-bump semantics remain compatible, so a formatting edit may have a new version but0 counted units.
- Count **every saved edit/reversal** across all owned setups in a UTC calendar quarter. A different setup or deleting a setup does not refund newly captured units. Initial strategy creation/baseline is not an experimental change. Historical surviving versions are counted by the next-version write date, using the prior version as comparison even across a quarter boundary.
- One recommended/three maximum guidance. Missing/corrupt/future/gapped/duplicate history gives unknown full count with known lower bound, not zero/within-budget certification. Deleted pre-install versions cannot be recovered; absence of surviving records does not establish an untouched historical plan. No NLP assurance that a paragraph contains only one true variable.

## Implementation and protection boundaries

1. **Pure diff/quarter reader.** New `src/rule-changes.js` handles named line/scalar deltas, valid UTC quarters, global/per-setup summaries, unavailable coverage, known/proposed totals and advisory wording. Rules/clock/user scope validated; no P&L/grade/outcome/size/emotion input. Legacy notes/assumed v1 are labelled, not original entry-rule proof.
2. **Retained fresh facts.** Additive `strategy_rule_changes`: original setup key/name, before/after definitions, from/to version, exact delta/rubric/hash, server clock/quarter/source. Owner FK cascade; setup FK SET NULL preserves history after deliberate deletion. Original UPDATE facts immutable except FK nullification. Actual event is authoritative for its tracked transition; surviving version fallback is not double-counted. Imported records ignored by active budget. No trade/signal columns/backfill or historical event minting.
3. **Atomic existing writes.** Strategy creation+v1 and current edit+new version+change fact share one real libSQL transaction. The existing M102 writer could commit current rules before a snapshot failure, or leave an unsnapshotted setup after failed creation. Real failing triggers measured that; atomic repair leaves no half experiment. If an existing current setup lacks versions, capture its **current pre-edit** baseline before changing it, not silently snapshot only the new rules. Note explicitly says not reconstructed original entry rules; existing trade attributions are not backfilled/refunded. New version receipt uses canonical server ISO time, legacy SQL clocks still read with explicit provenance.
4. **Strict optional displayed revision.** `GET /strategy-changes?quarter_start=` and owned canonical `GET /strategies/:id/change-discipline`; readonly `POST /strategies/:id/change-preview` only `{revision,changes}` and supported strategy fields, no caller clock/source/user/permission. Revision covers current owned rules, versions, global quarter history and quarter boundary. Unseen context409. Actual PUT UI supplies `strategy_revision`; stale409 refuses mutation. **Legacy direct PUT without it remains legal**, atomic and response-warned (`revision_checked:false`), not silently replaced with a new mandatory client contract.
5. **Actual responses.** PUT preserves old M102 `version/new_version/changed_field` and adds complete `changed_fields/rule_delta/quarter_rule_changes`. Above-three edits allowed with explicit advice, no target/risk clamp or trade blocking. Real version/change store failure503 atomically rolls back current rules/version/fact. Optional guidance read failure remains unavailable, never clean. No score, core writing, cap/routine/admission/loss queue, financial winner or first-response evidence mutation.
6. **Actual Playbook.** Global own-quarter guidance, fresh owned editor read, named readonly preview before saved comparison, acknowledgement dialog, visible post-save advice/history. Cosmetic edit preview0 separate from prior budget. No automatic hypothesis/plan/forecast. Current draft/preview hash checked, actor/account/token/closed/serial guards, stale409 keeps text/reload;503 cannot claim saved. Same-context late view/error cannot repaint a newer view. Historical/definition HTML treated as escaped text.
7. **Quarterly saved baseline.** New M99 quarterly snapshots include current owner-global guidance/revision and retain it alongside owned strategy definitions. Later edits change live preview but do not recalculate the completed artifact's original counters/definitions. Week/month/year don't pretend to be a quarterly apply mechanism. Saved old artifacts untouched. Review routes still never apply a strategy or grant entry.
8. **JSON declaration transport.** Full JSON backup field `strategy_rule_changes:{version:1,entries:[...]}` carries original before/after/count/source/clock. Restore forces destination owner/new readonly archive receipt, strategy_id:null/source imported_unverified, original IDs/clock/pair/count unverified in history. No association with a real owned setup, new native strategy, actual action or budget authority. Re-export/restore retains original declarations, not receiving-time replay. Imported archive visible separately from active count; Settings omissions/warnings visible without automatic refresh. Bad optional archive warns while finance imports; actual archive-store503 atomically rolls back that import; missing archive store still permits financial backup with explicit unavailable marker. No new trade-CSV authority transport.
9. **APP budgets/limits.** Diff<=500 lines/5000 chars per line/scalar; historical inspection<=10000 versions/events; portable<=500 declarations/256KB definition pair. Explicit unavailable/warning, no silent clipping. Existing20MB file/25MB body limits, repeats append historical declarations (not automatic dedupe). No sealed/database-admin tamper-proof vault, causal attribution, win-rate/edge improvement, broker/provider/mental/human/meditation/pixel/production or70% proof.

## Every separately measured source stage

Actual runtime/auth/HTTP/libSQL and shipped DOM. Literal rule definitions/journals/fixedUTC; controlled deferred results/unused shell/graphics are declared seams, not broker/human/pixel proof. No prerequisite adapter in feature tests.

| Change | Immediately prior/control | Implemented | Evidence in `evidence/m104/` |
|---|---:|---:|---|
| Pure all-field edit-unit/cosmetic contract | actual M1000/29 |29/0 | `parent-diff-results.json`, `diff-results.json` |
| Pure own-global quarter/history/proposal | diff0/22 |22/0 | `diff-only-quarter-results.json`, `quarter-results.json` |
| Actual strategy/current-version atomicity | quarter5/2 |7/0 | `quarter-only-atomic-results.json`, `atomic-results.json` |
| Owned fresh facts/revision/preview/warning API | atomic4/15 |19/0 | `atomic-only-api-results.json`, `api-results.json` |
| Actual Playbook editor/preview/advice/history | API3/13 |16/0 | `api-only-ui-results.json`, `ui-results.json` |
| Saved quarterly guidance baseline | UI2/4 |6/0 | `ui-only-period-results.json`, `period-results.json` |
| Concurrency/source/strict preview hardening | period14/3 |17/0 | `period-only-hardening-results.json`, `hardening-results.json` |
| Actor/same-context view/fault callback freshness | hardening4/2 |6/0 | `hardening-only-freshness-results.json`, `freshness-results.json` |
| Historical JSON archive/import/store/backup availability | freshness0/11 |11/0 | `freshness-only-portable-results.json`, `portable-results.json` |
| Actual imported history/Settings warning UI | portable1/5 |6/0 | `portable-only-archive-ui-results.json`, `archive-ui-results.json` |
| Actual133-file parent additive upgrade/restarts | parent10/4 |14/0 | `parent-migration-results.json`, `migration-results.json` |

**Final153/0 across11 probes**, all observed exits0. Runtime stage manifests:134 pure/quarter/atomic/API,135 UI onward. Ten measured runtime patches (atomic implementation kept separate from warnings), docs final135 source files. The failed first atomic implementation's immutable source map/log is retained separately; it is not a successful stage or counted as final.

## Original cohorts and limits kept separate

- M100 **144/1 across10**, M99/M101 **159/1 across9**, original additive migration shape assumptions remain. M93 **113/2**, M91 **106/2**, M87 **223/3**: their unchanged zero-schema/whole-table shape expectations still fail legitimately on additive objects. Not edited to force green. Distinct actual133-parent migration14/0 proves only4 new rule-change schema objects, original63 trade columns and ALL original rows/versions/clocks/grades/evidence/routine/admissions exact.
- M89 emotion **170/0**, reasons **160/0**, independent execution **260/0**, actual routine **321/0**. Older owned-strategy routine UI freshness remains UNMEASURED.
- RAW legacy **596 reported/156 failed/31**,21 completed nonzero +one90s timeout/null exit/summaryless. DECLARED held-fulfilled **824/4/31**, two nonzero; inherited date/missing-getToken mock negatives kept, not weakened token checks or integrated routine proof.
- Offline **178/0**, DECLARED market **325/0**. Live-provider attempts **70 reported/1 failed**,6 nonzero/5 summaryless, not provider availability.
- Prepared native actual parent/current **API121/0 each, Bots206/0 each**,24 synthetic parity fills/0 mismatches. RAW APIexit2/no summary, Bots**202/4/exit1**,24 fills/0 mismatches. Actual declared preparation/15m control clock, synthetic offline IO; not market or human/meditation improvement. Test processes stopped.
- Original conditional served-source smoke **21/21**,0 style/console,8 canvas limits,observed exit0,95.0s. Exact conditional outputs/canvas limits recorded in manifest and `smoke.txt`/`smoke-exit.json`, not pixels/production and not included in153.

## Initial errors and controls retained

- Dependencies restored by npmci/ignore-scripts,0 vulnerabilities/lock unchanged, log retained; no missing-library assertion measurement invented.
- First atomic implementation used13 placeholders for12 strategy columns; actual baseline failed, initial3/4 including uncaught error kept with its **atomic-source.json**. Corrected single placeholder, separately frozen **atomic-fixed**7/0. Real parent trigger failures5/2 retained; no fake pass from the failed constructor.
- First new migration fixture had an extra closing parenthesis, abort before assertion counters. Both syntax logs kept; corrected parent10/4 vs actual additive upgrade14/0. No copied parent schema or ignored original tables.
- Workspace M100 was already committed and remote-exact before this pass. Original M100/M99/M93/M91 schema-shape negatives not rewritten or counted as no-action closures.

## Delivery / unchanged policies / continuation

`build-m104-rule-change-artifacts.py`: ten frozen runtime stages +docs, actual837 combined diff, cumulative pristine `tradingpro-main.zip` diff, each forward/reverse **zero byte differences**. Exact file counts/hashes in `patches/M104-RULE-CHANGE-STAGES.json`, archive SHA companion excluded to avoid self-hash.135 source, no private env/DB/dependencies/cache/credentials.

Financial normalizer/performance, entry models/checklists/weights/grade/risk/factors/geometry/stops/targets/RR, execution/core/routine/guard/daily/window scores, captured emotion/opportunity authority, original native scripts/lock byte-guarded. Course30/M103n>=5/B-C tradeability unchanged. M102 version storage API/clock made atomic only to keep actual comparisons/counters honest; no original trade-grade/attribution rewrite or extra finding closure.

Next M105; M106/M111/M112 still open, M30/M103/M108 partial. Preview3000 temporary synthetic/offline `/tmp/m104-preview.db`, schedulerOFF/blank remotes; no preserved real-user/broker claim. `/tmp`, packages/processes not snapshot-guaranteed. Preserve all132 IDs/eight groups, individual controls/pristine diffs and negative results.
