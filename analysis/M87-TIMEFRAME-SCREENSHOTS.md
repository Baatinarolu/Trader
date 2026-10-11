# M87 — HTF / MTF / LTF visual journal evidence

**2026-10-11 · actual parent `d5be22f2b86fc3c3a6d7455f1c9293d240b55e66` (119 source files)**

M87 only. **132 findings:90 done /3 partial /39 TODO /0 no-action**, exact eight groups. M88 confluences and M89 fresh emotion capture remain open. Partial IDs remain M30, M103 and M108. This batch neither promises a70% win rate nor changes exits/targets to manufacture one.

## Saved course basis

Ep23 [saved Ep23 video](https://www.youtube.com/watch?v=Gx6KAhhWn10), saved COMPLETE3/3 excerpt in `EPISODE-AUDIT.md`:

- **HTF:** “why this trend direction… what was the initial bias? what was the structure like? what was the key levels?”
- **MTF:** “why this location”… supply/demand or flip zone and “where was the available liquidity?”
- **LTF:** “your entry trigger”… “what was the entry confirmation.”
- Purpose: “revisit your thought process accurately instead of rewriting history”… memory is inaccurate.

No new transcript was fetched; no invented timestamps or claim to the unavailable remainder of the bonus episode. The app's former single `screenshot_url` could not preserve three explicitly labelled views.

## What actually changed

1. **Pure contracts:** explicit roles `htf/mtf/ltf`; user-selected canonical timeframe labels. No4h/15m/5m defaults or guesses from legacy image, filename, entry TF or money. PNG/JPEG/static WebP uploads have decoded1,500,000-byte,24MP and16,000-dimension **app** budgets; not course requirements. PNG bounds/CRC/header/palette/static checks; supported JPEG frame/scan structure; static WebP container/frame structure. These are **not full raster decoding, legibility or chart verification**.
2. **Additive owned storage:** `trade_screenshots` child table, one row per actual owned trade/role, cascade on trade deletion. Original financial row and `screenshot_url` stay unchanged. Legacy is visibly **unassigned**, never automatically credited to a role. Conservative optional media must not prevent recording a truthful financial close.
3. **Independent API:** authenticated canonical-ID per-role GET/PUT/DELETE. PUT/DELETE require the displayed revision bound to relevant saved financial context **and** the existing role attachment. Concurrent replacement/unseen financial correction409; actual storage failure503; old values retained atomically. Identical current-role retries do not invent a new recording time. Financial corrections keep earlier image/time/context, but flag it prior rather than falsely restamping it current. Irrelevant notebook edits do not invalidate financial context.
4. **Actual UI:** three named slots and their bias/location/trigger questions, explicit TF, upload/link, optional plain-text note, view, clear-unsaved selection and remove-saved-role. Reachable from trade rows, saved financial form, core-writing dialog and UTC day review. New unsaved trade says save truthful finance first. Whole saved-record editor shows the API's same-snapshot financial context, not unsaved form changes. Account/user/token changes, late responses, superseded/closed/cleared FileReader callbacks, stale revisions and storage failures guarded. Save/reload clears other unsaved selections with an explicit warning; save one role at a time.
5. **Portable JSON/CSV:** JSON `trade.screenshots={version:1,roles:{…}}`; CSV `screenshot_views_json` plus legacy `screenshot_url`. Actual transaction-generated insert IDs, owned destination account, never raw backup IDs. Imported source always `imported_upload` or `imported_external_link`; actual server receiving time separate from an unverified declared historical clock/context. Missing historical context remains unknown, not guessed from the imported finance. Valid declared prior context survives correction+roundtrip. Bad optional media yields bounded omission warnings while importing financial truth; real storage failure rolls back the request's financial/media mapping together. No execution/core/guard/routine/capture proof replay.
6. **Measured hardening:** reject animations/invalid supported raster structures and recognisable credential query parameters. HTTPS public-host references are **never fetched by the server**, automatically loaded in the editor, or said to verify DNS/publicness/content. Explicit browser viewing can contact the remote site; content may have changed. URI presentation aliases share a fingerprint; equivalent/reused frame labels and duplicate references flagged, not called three independent timeframe views. Corrupt/unknown/future stored metadata is unavailable and uncredited, omitted from portable export with an unavailable-role marker. Unsupported/unsafe old legacy references remain in the DB, not rendered or copied into portable backups. Screenshot-enabled export outage returns safe JSON503, not an HTML SQL stack. Actual Settings restore shows omissions, avoids auto-dismissal of warnings, rejects files over20MB explicitly and removes the silent4MB CSV clip. Original API25MB JSON-body limit remains; split large backups into smaller requests/account/date exports. No automatic batching/deduplication of historical restores is claimed.

**Provenance ceiling:** `recorded_at` is attachment/receiving time, **not original screenshot capture time**. A human-labelled frame/role is not inspected chart content. Stored-reference count is not broker verification, live-emotion capture, original intent proof, core/whole-course journal completion, trading permission or a validated edge. Context binds the saved financial fields listed in `src/screenshots.js`, not every free-text diary field or a broker snapshot.

## Separate measured stages and controls

All counters below are actual exported modules, auth/HTTP/SQL and shipped DOM; fixedUTC/literal journal inputs and tiny raster **protocol fixtures**, never real chart screenshots. JSDOM/controlled FileReader/unused graphics are declared; no preparation adapter in any M87 feature test.

| New probe | Final | Prior-stage/actual-parent control |
|---|---:|---:|
| Image/role/timeframe contracts |52/0|actual d5 parent0/52|
| Owned storage/API |33/0|pure-image-only8/25|
| Whole screenshot editor/log/form/core/day UI |32/0|storage-only3/29|
| Owned JSON/CSV portable evidence |28/0|UI-only5/23|
| Raster/credential/reuse/stored uncertainty |35/0|portable-only17/18|
| Backup storage outage |4/0|portable-only2/2 (actual500 HTML SQL stack, not an unhandled promise)|
| Additional UI freshness/edges/import warning timing |13/0|portable-only5/8|
| Whole Settings data/backup UI |15/0|portable-only3/12|
| Literal d5-schema upgrade/restart |14/0|actual parent8/6|
| **M87 total:9 probes** |**226/0**|controls not included in positive denominator|

Every final feature process exited0; no timeout/summaryless case. Durable output/result pairs and stage SHA manifests: `analysis/evidence/m87/`. `run-m87-verification.py --suite feature --freeze-parents` reconstructs literal measured parents, never an imitated schema.

### Errors/initial attempts retained

- Parent image-contract control initially printed0/52 and then `SQLITE_READONLY_DBMOVED`: test cleanup deleted the temporary DB before initialization finished. Fixed **test helper** to await readiness; corrected parent0/52/exit1. Both files retained.
- Initial extra-UI control6/7 did not wait long enough to measure the old700ms warning auto-close. Retained; add the actual800ms observation, portable-only5/8. No production timer/floor change to meet a fixture.
- Migration harness first0/1: direct `T.normalise` intentionally strips account ownership, so the fixture must set the actual created account ID before `T.insert`, as the real route does. Next13/1 incorrectly expected execution `state:'stale'`; actual M86 contract is `state:'unreviewed'`, score null. Both retained, narrowly corrected test; final14/0.
- Initial inherited suite found missing ephemeral **actual** M81/M84 parents: DECLARED798/2, RAW569/155. Rebuilt literal112-file parents by durable reverse patches, **all-source SHA equality0**; reran only the same two unchanged migration scripts. Original failures retained; final DECLARED828/0, RAW597/155. No schema invention or new fixture loaded into an old parent.

- Initial delivery builder stopped before assembly because a newly typed control filename used a dot rather than the saved hyphen. Error retained in `artifact-build-initial-error.json`; builder filename corrected only, no runtime/test changes.

## Coexisting and inherited results — explicitly separate

| Cohort on M87 | Actual result / limits |
|---|---|
| Unchanged prior M86/M92 actual feature probes |260/0 across9, all exit0, no prerequisite adapter|
| Actual M14/M64/M94 routine probes |321/0 across10, all exit0, no prerequisite adapter; older owned-strategy UI freshness remains **UNMEASURED**|
| Unchanged RAW inherited31 |597 reported passes /155 failures;21 nonzero exits, one90s timeout/summaryless; early aborts retained, **not all828 asserted**|
| DECLARED isolated inherited31 |828/0; held-fulfilled old preparation/capture/writing inputs are NOT integrated policy/human proof|
| Original live-provider pure attempts |70 reported passes/1 failure;6 nonzero,5 summaryless network/prerequisite aborts retained|
| Explicit built-in synthetic offline, no prerequisite adapter |178/0 across4|
| DECLARED old market consumers |325/0 across4; no new preparation proof|
| Unchanged native API, prepared actual d5 and current |121/0 each, exit0|
| Unchanged native Bots, prepared d5 and current |**205/1 each, exit1**. Both now20 synthetic parity fills/0 mismatches; inherited filled-sample assertion needs>20. Clock-sensitive COMMON parent/current failure retained; not padded and no target/model change. Previous M86's21-fill206/0 is historical, not today's result.|
| Unprepared native current |APIexit2/no summary; Bots201/5/exit1, including the same parity sample floor +four mandatory-preparation failures|
| Original whole-app smoke |**22/22 conditional DOM views**,0 style failures,0 console errors,8 JSDOM canvas limitations; **observed exit0**. Not pixels or actual human chart review. Earlier M86 smoke21/21/exitNULL stays historical.|

No live provider, broker, Turso, Vercel, cron, production, actual meditation, human thought-process verification, causation or70% win-rate evidence is claimed.

## Unchanged mechanism protections

All ten market engines, instruments/P&L math, package lock and original native API/Bots/smoke scripts have exact parent SHA equality. `src/trades.js`, journaling, execution review and routine modules are unchanged. Course floor30, deliberate M103 `n>=5`, B/C tradeability, entry-model/preference/checklist weights, stops/targets/geometry/RR, default risk and grade multipliers remain. Images do not complete mandatory writing, erase old observed loss obligations, refund caps/streak/cooldowns, rewrite first-admission/on-time facts, revive technical vetoes, or automatically backfill setup/execution grades.

## Delivery and remaining work

`analysis/build-m87-screenshot-artifacts.py` verifies six independently frozen stages, combined d5→current and cumulative pristine-ZIP patches: clean forward/reverse application and **byte equality**, with unchanged pristine/package-lock/core gates. `analysis/patches/M87-SCREENSHOT-STAGES.json` records exact patch hashes/file/byte counts; `analysis/evidence/m87/archive-sha256.json` records the exact121-source-file delivery ZIP and is excluded from it to avoid self-hashing. No env, credentials, DB, dependencies or generated large data in the ZIP/Git.

Partial: **M30,M103,M108**. Remaining **39 TODO**:
M125,M45,M46,M49,M53,M55,M67,M72,M73,M74,M112,M12,M13,M15,M56,M59,M60,M65,M66,**M88,M89**,M91,M93,M99,M100,M101,M104,M105,M106,M107,M115,M17,M18,M19,M62,M109,M110,M111,M117.

Next journal mechanism: **M88 entry confluences**, then M89 actual timely human emotion capture. M106 fresh-entry pause, M111/M112 news mechanisms and broader M108 remain explicitly open. Preview is unadapted synthetic offline mode, schedulerOFF/blank remote vars and a new local `/tmp/m87-preview.db` because the previous ephemeral preview DB was unavailable; never claimed preserved user/broker data.
