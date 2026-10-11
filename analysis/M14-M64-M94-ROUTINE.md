# M14 / M64 / M94 — pre-market routine and daily evidence

Date: **2026-10-11**. Measured parent: **75172759d134e63ed57a20c5e2941eb6c28e9855**.
Fixed branch: `arena/762c0295-trader`. Read git for actual final commit/push.

## Exact scope and status

**132 findings: 87 done · 3 partial · 42 TODO · 0 no-action**, exact eight-group
partition checked by `analysis/gen-progress.py`. M14/M64/M94 complete **together**,
not a checkbox presented as a routine. M108 becomes **PARTIAL** for the mandatory
routine 15-minute timer only. M30/M103 remain partial. No additional closure for
M116: it was already APPLIED. Project **not finished**.

Saved source quotations in `EPISODE-AUDIT.md` / `evidence/m64/SCOPE.json`:

- Ep17, complete7/7: [gECKHjUnEjU](https://www.youtube.com/watch?v=gECKHjUnEjU).
  Banner persists until all steps; recommend reset one hour before the selected
  window. **Calendar → plan → charts/bias/alert → about15m meditation/breathwork**.
  The quotation names **FOUR**, not three, morning questions; erroneous heading
  corrected without changing the quotation.
- Ep23: [Gx6KAhhWn10](https://www.youtube.com/watch?v=Gx6KAhhWn10), routine completion
  beside process/journaled-count daily stats.
- Ep24: [4sN-gnJKRtA](https://www.youtube.com/watch?v=4sN-gnJKRtA), **hypothesised**
  routine/day-P&L association, not demonstrated causation.
- Daily-routine bonus: [CX8S22b1xqg](https://www.youtube.com/watch?v=CX8S22b1xqg),
  only1/6 captured: banner30–45m before window, meditation **first**,15m non-negotiable.
  Remaining bonus sequence unknown. Explicit meditation-first variant retains
  the other known Ep17 steps, not an invented full bonus transcript.
- Ep28: [MKSwk0lEtZ0](https://www.youtube.com/watch?v=MKSwk0lEtZ0), broader Sanctuary
  presets/audio/intention/toolkit/session-log/progress and separate in-session
  four-question check. That broader feature is **not closed** by this routine timer.

No new raw later transcript fetch or invented timestamps. No inferred broker/trader
window from venue, journal timezone, session labels or user's location. No requested
70% win-rate objective, exit shrinking, adaptive risk or claimed profitability.

## Implemented mechanism

1. **Daily records:** strict nullable Boolean `pre_market_done`, source/server capture
   on notes; independent owner/account/UTC-day records avoid existing shared
   `UNIQUE(user_id,entry_date)` collision. Unrelated note edits preserve the human
   flag/time. Unknown history is not fabricated skipped/done. Owned dates/accounts,
   future actual flags rejected. Notebook text/journal completeness are separate.
2. **Schedule:** explicit nullable local HH:MM +IANA timezone, lead1–180 whole minutes
   (default60), `ep17` / `meditation_first`. Active cycle snapshots policy, local and
   UTC window-day, reset/window/expiry, selection and steps. Edits apply after the
   old saved expiry, never reset other guards. Includes midnight and DST: earlier
   fold occurrence / shift missing clock forward by gap. Numeric offset alone is
   not IANA. Invalid/future stored boundaries cannot silently mint fresh known cycles.
3. **Workflow:** server-selected order, actual human external-calendar text/review,
   owned plan snapshot (or explicit manual plan), human chart/range/bias/alert report,
   meditation running-time15min, **four literal Boolean morning questions**. False
   attempts retained but unfinished. Completed snapshots immutable. Foreign, stale,
   out-of-order and client-completion/time spoofing rejected. Actual human/provider
   truth cannot be verified: source labels say exactly what is self-attested.
4. **Timer:** start/resume server clock, explicit pause accumulates running time,
   paused gap excluded; inclusive15m completion. Running/paused/completed state
   survives separate process. A running marker continues with closed page/restart:
   this measures the running timer, **not actual meditation, focus or mental state**.
5. **Gate:** incomplete/setup-needed preparation is a known personal STOP with the
   existing **fresh one-action typed reason**, not a new permanent day latch.
   Unknown storage/clock/source/order/data unwaivable. Actual analyse/chart/scan/Now/
   save/copy/entry/reopen recheck current owned server state. Technical veto never
   revived; no price/grade/RR/risk tuning. All truthful closes/corrections/deletion/
   history/import/record-only legal. Old cap/count/loss clocks retained even on the
   **first** check encountering new routine uncertainty. Routine completion clears
   only its own stop, not old caps/profit/loss/streak stops or cooldown/full candle.
6. **Provenance:** automatic workflow `done` distinct from on-time/before-first-entry
   `prepared`. Independent first **executed trade admission** snapshot, no trade FK,
   atomic with real entry. Saved research plans, blocked attempts and record-only
   imports do not invent first execution. Later completion/manual flags/settings/
   truthful correction or deletion never rewrite the original first-entry cohort.
   Capture failure rolls back actual entry/admission. Corrupt facts stay unknown,
   not a fallback self-report pass; current-day corruption unwaivable for execution.
7. **Comparison:** descriptive UTC **close-day daily** realised P&L, sum closed trades
   per day then mean across known days. Completed/not-completed/unknown groups;
   independent first-entry evidence first, otherwise window deadline, otherwise
   labelled human record/unknown. Before unfinished deadline/no entry, preparation
   unknown. Missing net result unavailable, not zero; floating/other account/future
   closes excluded. No per-trade overnight attribution, causation or resizing claim.
8. **UI:** shell-owned persistent banner outside replaced route content, actual
   schedule/settings/step/timer/four-answer events, owned diary/day/report. Server
   polling reappears at reset; account switch/stale async response cannot reuse old
   completion. Human source vs automatic workflow vs prepared basis visible.
   No dismiss/skip action; closing an unfinished modal leaves banner and stop.

### Independent remaining boundaries

Morning checks are once-per-routine human preparation, **not M106's fresh in-session/
per-entry four-question gate**. M89 entry/exit emotional capture-time provenance,
M111 fail-closed live news, M112 allowed hours remain open. Manual external-calendar
review is not verified provider/no-news clearance; chart bias/alert not OHLC/broker
orders. M108 full presets5/10/15/30/60/custom, bells/ambient, intention, toolkit/library,
independent session log/progress and broader regulation remain unfinished.

## Each mechanism measured separately

All final rows below execute current production code with **no legacy/native
prerequisite adapter**. Declared synthetic clocks, scripted P&L and candle/CRT/DOM
IO where applicable are recorded in probes; assertions are not real meditation,
provider, broker, pixel or causal outcome proof. `evidence/m64/feature-summary.json`
is the guarded final rerun: **321 passed /0 failed across10 probes**.

| Boundary | Corrected control | Final | Probe |
|---|---:|---:|---|
| Nullable daily records / daily totals | actual751parent1/26 | **27/0** | `probe-m94-routine-records.js` |
| Local schedule, freeze, DST, midnight | records-only2/28 | **30/0** | `probe-m64-routine-schedule.js` |
| Ordered steps, own snapshot, active15m, four answers | schedule-only4/39 | **43/0** | `probe-m64-routine-workflow.js` |
| Real gate / CRUD / concurrent entries / old guards | workflow-only6/21 | **27/0** | `probe-m64-routine-gate.js` |
| Corrupt latest cycle / clocks / rollback | gate-only15/4 | **19/0** | `probe-m64-routine-contracts.js` |
| Automatic/on-time/first-entry/frozen comparison | contracts-only3/20 | **23/0** | `probe-m94-routine-provenance.js` |
| Actual shell/settings/step/timer/diary/report events | provenance-only1/38 | **39/0** | `probe-m64-routine-ui.js` |
| Four direction/model consumer +signal paths | workflow-only28/48 | **76/0** | `probe-m64-routine-consumers.js` |
| Actual751schema / separate-process restarts | actual751parent, not synthetic schema | **24/0** | `probe-m64-routine-migration.js` |
| Strict ID/IANA shapes; first-unknown old observation | UI-only8/5 | **13/0** | `probe-m64-routine-hardening.js` |

### Retained errors and negative results

- Records initial parent1/20+abort: FLOAT fixture omitted NOT NULL `entry`; original
  source/log/JSON retained. Fixture-only entry100 correction yields meaningful1/26.
- Schedule initial0/19+abort: both old/new undefined IDs compared equal then unsafe
  dereference; original harness/log retained. Nonvacuous guard gives2/28 control.
- Workflow initial0/1 (`db.init` is not this app API), then0/1 (missing endpoint
 404HTML parsed as JSON); both sources/logs retained. Real DB ready/session/plan
  tables +JSON fallback corrected in harness, not product behavior;4/39 control.
- Gate initial22/2+abort: wrong daily flag POST path and array passed to actual
  `applyToSetups` object contract. Initial6/21 control and22/2 current retained;
  correct real journal POST/setup object yields27/0.
- **Actual new-layer defect:** corrupt saved reset excluded by active-range query
  caused fresh known cycle; rollback could also create previous cycle. Stored
  invalid timezone surfaced request400 instead of data503. Initial15/4 retained;
  separately validate latest immutable anchor even if inactive, stored errors503:
  **19/0**. No suppressed negative or ghost completion.
- Consumer control initial4/11+abort from new-table query on workflow-only stage;
  initial source/log retained. Nonvacuous optional count for old missing table and
  actual fixture cycle lookup give complete28/48 control; final76/0.
- **Actual strict-shape defects:** offset accepted as IANA, array account/cycle
  coercion, stored invalid future config400. UI-only8/5 retained; independently
  fixed to13/0. Same probe proves known old cap/count/loss-clock preservation on
  FIRST unknown read, honest deletion/repair/reflection cannot refund them.
- Isolation initial786/2: preload diagnostic on **stdout** broke old subprocess
  JSON contracts. Both logs/source retained; diagnostic moved to stderr, no app/
  test oracle change; final828/0. Not a routine proof.
- Native initial harness: `bots-test.js` takes **TJ_BASE**, ignores CLI base; cleanup
  DB unset meant different DB. Initial logs/labels explicitly corrected and retained.
  Correct runs have per-arm native source, exact server DB, TJ_BASE and scheduler0.
- Initial preview command used wrong `BOT_SCHEDULER` variable; both empty synthetic
  servers stopped/restarted with actual `TJ_SCHEDULER=0` before corrected native
  tests. Test fixture require did not listen (`require.main` different), fixed only
  test helper to listen after bootPromise. Product server unchanged.
- First artifact builder used unfiltered shared `contents(APP)`, so ignored local
  artifacts were not the guarded117 source set: stopped before packaging. Initial
  builder/source/error retained; only Git-enumerated nonignored allowed sources
  are now read/hashed, with no private contents/hashes persisted or published.
  Application source unchanged; corrected and durable replay builds round-trip0.
- Ledger generator initially classified86done/4partial because the done M64 status
  contained the word “partial” about source coverage. Wording now says one-of-six
  excerpt, preserving the limitation; strict partition now87/3/42, no fake closure.

## Inherited and native checks — read the scope, not only green totals

**31 original inherited invocations:**30 completed summaries **597/155**,
**21 nonzero completed exits**, plus **one original M85 UI timeout90s with no summary**.
Old UI awaited a now-stopped initial live entry/reason interaction. First batch's
stdout was not persisted for that timeout; no invented zero/assertion count. All
29 preceding logs, last retention result and timeout detail retained. Some original
probes abort early: measured752 assertions is **not** expected full828.

**31 DECLARED isolation runs:828/0** (legacy22:584/0; M84/M85nine:244/0).
`m64-legacy-prerequisite.js` holds new routine fulfilled and disables only its new
first-entry capture; legacy22 additionally use the already documented writing/
emotion/prompt seam. Original test sources untouched. This verifies **older**
contracts given fulfilled new prerequisites, **not integrated current M64 policy**.
New321 and raw current-native use neither seam. The actual UI probe exercises a
manual plan; **owned-strategy UI preview freshness is unmeasured**. Server-owned
plan snapshot/version enforcement is tested separately in workflow/contracts,
not falsely counted as that browser preview proof. No pixel/layout proof.

- Unchanged Now50/0, Topdown77/0, Chart36/0 and settings15/0: actual/no adapter.
- Four old market-consumer raw runs now abort on unsupplied routine; retained in
  `pure-regression-runs.json` (not misleadingly all pure green). M64-only declared
  isolation: M3367/0, M78169/0, M7741/0, M7148/0, total325/0. New76 consumer probe
  proves actual routine composition for both directions /both models separately.
- Corrected actual **parent751 native**: API121/0, bots206/0, **23 synthetic parity
  fills/0 mismatches**, unchanged floors/assertions/scripts.
- Actual **current native raw**: API aborts first prospective open on unscheduled
  routine (exit2, **no summary**); bots202/4 (exit1), stopped saved-plan expectations
  plus downstream metadata/degenerate-entry expectation. This is not silently green.
- **DECLARED native fixture**: original scripts/actual HTTP/auth/SQL, new synthetic
  human preparation and controlled15m through actual routine modules **only in a
  test server**, API121/0 /bots206/0,23parityfills/0mismatches. It supplies older tests'
  new prerequisite, **not actual human/timer proof**. No price/RR/floor/script adapter.
  Changed prior20→23 synthetic cohort is not an improved market edge; thresholds
  never lowered. Initial erroneous arm logs retained separately.
- Actual unchanged smoke **22/22**,0style/console,8jsdom canvas limits. This cohort
  exercised the conditional measured-view switch (prior21 did not). Tool stopped
  waiting at90s; later completed result/no remaining smoke process verified, but
  **exit status was not captured**. No claimed observed exit0/pixel/canvas proof.

## Byte proofs and packaging

`analysis/build-m64-routine-artifacts.py` guards all117 application files,10 probe
sources/evidence, neutral15 files and exact ledger. Nine ordered incremental
patches: records → schedule → workflow → gate → contracts → provenance → UI →
strict-shape hardening → documentation. Consumer/migration/retention observations
are independent tests, not fictitious extra code stages.

`analysis/patches/M64-ROUTINE-STAGES.json` records per-stage SHA/bytes/files and
clean **forward/reverse byte-difference0** against actual751parent. Combined patch
and **pristine `tradingpro-main.zip` → current** cumulative patch also round-trip
byte-equal. `tradingpro-main.zip` untouched. `tradingpro-fixed.zip` contains exact117
app files plus audit/proofs; no env/DB/dependencies/raw datasets or credentials.
Current ZIP bytes/SHA are the outside-archive companion `evidence/m64/archive-sha256.json`;
not self-embedded. Build supports durable reconstruction without `/tmp` trees.

Neutral15: ten model/geometry engine files +lock/instruments/performance/native
API/bots scripts. No target shrinking, RR/grade/risk coefficient/default retune,
30-trade adaptation floor or deliberate M103 `n>=5` change. No repeated completed
M71 twelve-run outcome study or live provider/broker/auth/cron/production claim.

## Nothing omitted: all remaining IDs

**Partials:** M30, M103, M108.

**42 TODOs (mechanism group order):** M125; M45, M46, M49, M53, M55, M67, M72,
M73, M74, M112; M12, M13, M15, M56, M59, M60, M65, M66, M86, M87, M88, M89,
M91, M92, M93, M99, M100, M101, M104, M105, M106, M107, M115; M17, M18, M19,
M62, M109, M110, M111, M117. Exact placement/status of **all132** remains in
`PROGRESS.md` and `MISMATCHES.md`, eight groups, no duplicates/missing IDs.

Next: **M86 loss-drill workflow**, then M87/M88 screenshots/confluences and M89
capture-time provenance; M106 fresh state gate, M108 remaining regulation,
M111/M112 news/hours remain explicit. User CONTINUE, no new clarifiers. Separate
measurement/control/error/proof for every mechanism. Not a promised win-rate fix.
