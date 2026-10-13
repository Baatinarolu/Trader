# Handoff prompt — paste this into a new Arena coding session

## Current M111 — an unreadable calendar is UNKNOWN, not clear — 2026-10-13

**132:106 done /2 partial /24 TODO /0 no-action**, exact eight groups. `newsCheck` **failed open**:
the market layer reports a calendar it could not read as `{ok:false, error, events:[]}` rather than
throwing, the engine's only test was `blackout === null`, and `setup.js` therefore scored *"No
high-impact news in the window"* as **SATISFIED** during an outage — indistinguishable from a
genuinely quiet week. Ep30 frames this rule as protection, not preference — *"it prevent you from
getting wiped out… It prevent you from getting trapped in unpredictable move… it's simply a
mechanism for Edge Flow to protect you from impulse"*, *"it's trying to keep you alive and
disciplined so your edge can actually play out."* A safety gate that answers **clear** when it
cannot see is the wrong default.

`src/news-window.js` now owns the vocabulary. **Three states, mutually exclusive**: `blocked` (a
known release is inside its clock), `clear` (the calendar **was read** and nothing is inside its
clock) and `unknown` (the calendar could not be read — **not clear, and not a pass**). `stateOf()`
is the one mapping, `unknownNote()` the one sentence, `reasonOf()` the one normaliser
(whitespace-only → null; object → `.message`, else JSON, circular-safe; null → null), and the
precedence is safe-ordered: **a known blackout wins even when a read also failed**; otherwise a
non-empty `unavailable` is `unknown`; otherwise `clear` — decided on **values, not key presence**.
**`clear` has to be earned by a positive signal**: the read must be a calendar with `ok:true` and
an events list, so a `{ok:false}` reply, a bare object, an array, a `null`, a thrown `Error`, a
thrown **string**, a circular error object — all ten hostile shapes are measured — land on
`unknown` with a readable reason instead of a silent all-clear. `unknownNote()` deliberately
carries **no window numbers** (*"Nothing was checked against your stand-down windows, so this is
NOT an all-clear."*), and the configured pair is echoed **separately** in `windows` with
`windows.unavailable: true`, so the sentence cannot be skimmed as "checked and quiet". The old
`error` key is **kept** beside the new `unavailable`, so a consumer written against the previous
shape is not blinded.

**Consumers treat `unknown` as not-passing, without inventing a veto.** `setup.js`'s news row
**FAILS** on `unknown` with the engine's own sentence, at the **same recorded weight and label**
(10 pts, *"No high-impact news in the window"*) and with **no veto** — an outage is not evidence of
a release, so it must not stand a trader down; the row still passes on `clear` and on
`not_consulted` (the prior fallback wording for a caller that consulted no calendar at all), and
`filters.news_state` mirrors the caller's own token **verbatim** beside `filters.news_blackout`.
`now.js` adds a **`warn`** guard carrying the module's sentence (visible, still not a stand-down),
`analyse()` prefixes the headline **`NEWS UNKNOWN: …`** and reports `checks.news === false`. The
chart and scan callers stay `not_consulted`: **"did not read" is never defaulted onto `clear` or
`unknown`**. **Nothing is stored**: no column, no table, no settings key, no cache, no write —
every table is byte-identical across a clear, an unknown and a blocked read — and `getCalendar()`
does not cache failures, so an outage is retried (an `unknown` may flap back to `clear` on the next
check: a measured, accepted property, asserted in the freshness probe rather than papered over).

**Measured.** M111 **154/0 across 8 probes** (module 26, engine 21, consumers 20, API 14,
freshness 11, hardening 36, portable 10, migration **16/0**). The migration probe spawns the
**parent's own code** (`b39d9ef`, 146 files) on the same database with the same failing read: the
parent answers with a **quiet payload** — `blackout:null`, `events:[]`, **no `state`, no
`unavailable`, no note, no `error`** — while the delivered tree answers `unknown` with the reason
and the sentence; the two payloads differ **only** by the state and the failure it names, **no
schema object is added or changed**, every inherited fact is **byte-identical**, and the parent's
own code still opens the file the delivered tree wrote. Four constructed runtime stages
(**policy → engine → consumers → documentation**), each replayed forward **and** reversed with
**0 byte differences** against its frozen guard; the pre-M111 files in the staged trees are the
**parent's own content**, so the staged fault *is* the committed behaviour being fixed. **Parent
control** = the committed M110 release: eight probes **0/1**, each naming the absent vocabulary.
**Pre-hardening control** = the policy stage (vocabulary present, the M110 engine and its two
consumers still failing open): **engine 8/13, consumers 5/9, api 1/4, hardening 1/10**, with the
failing lines naming the fault (*"the outage reaches the news check as `unknown` — NOT as a quiet
calendar"*, *"the news row FAILS on an unread calendar — the absence of evidence is not scored as
evidence of absence"*) before the engine/consumer stages made them **21/0, 20/0, 14/0, 36/0**.

Cohorts re-run on this tree: **M110 253/5**, **M109 166/2, M108 257/2, M107 230/2, M106 316/2,
M105 140/2**. The M110 five are this milestone's **declared negatives** and each one measures the
pre-M111 state on purpose: *"M110 does not claim to fix M111: a failed calendar still reaches this
rule as a QUIET one"*, its own marker *"M111 is open and NOT solved here"*, and the two frozen
key-set assertions whose set grew by `state` (plus the empty-week arm that names the gap). Nothing
was edited to make a frozen assertion pass. RAW **596/156**, DECLARED **824/4** and the
live-provider arm **70/1** were re-run this session and reproduce exactly; the native API/bots arms
stay **inherited, asserted as inherited**. Smoke exit 0, **22/22 views on both trees**, 0 style /
0 console — M111 changes **no view**, and `grep -ci news` = 0 in both smoke outputs, so no dialog
coverage is claimed (the news fields remain `analysis/probe-m110-ui.js` 23/0). Ledger
**132 = 106 done / 2 partial / 24 TODO**. Deterministic **146-source** ZIP:
`build-m111-calendar-unknown-artifacts.py`, `patches/M111-CALENDAR-UNKNOWN-STAGES.json`, excluded
archive SHA companion. [Full report](M111-CALENDAR-UNKNOWN.md). Arm servers stopped; `/tmp` DBs
synthetic/offline, scheduler OFF, not preserved real data.

**Workspace note for the next session (this session ran from a restored snapshot).** `/tmp` and
`node_modules` are snapshot-excluded: the parent trees were **rebuilt from git**
(`freeze('b39d9ef', '/tmp/m111-parent/app')`, digest re-asserted against the frozen
`analysis/evidence/m111/parent-source.json`), `node_modules` re-symlinked/`npm ci`'d, and every
stage tree rebuilt by `capture-m111-stages.py` (which asserts the pre-hardening tree **is** the
policy stage). **M111 probes must be run under `timeout`**: the harness keeps its own express
listener open and closes it in `finish()` (a run whose output looks complete would otherwise hang).
`--capture-stages` hashes the harness files listed in `analysis/evidence/m111/harness-source.json`,
so **re-run `capture-m111-stages.py` after editing the builder and before building**, or its own
hash assert fires.

**Next M112 — a trading window guardrail from the existing `by_session` history.** `performance.js`
already computes `by_session`; M112 adds `window_start`/`window_end` (+ timezone) to `accounts`,
defaulting from the top `by_session` bucket, and treats a signal outside the window as a **hard
block** (not a scored penalty) — the `ixmTrvUB1Ks` segment settles hard-block. Then the older
backlog (groups A/B/C/E/G). All 132 IDs / eight groups retained; session fixed to
**arena/b411452d-trader**, older counts/branches/next-steps below are historical.

### Current remaining IDs — no omissions

Partials **M30,M103**. TODO24: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M65,M66,M67,M72,M73,M74,M112,M115,M117,M125**.
PROGRESS asserts exact132/eight-group partition. Earlier lists are historical milestones,
not the current remaining work.

## Historical M110 — the news stand-down is two clocks, not one — 2026-10-13

**132:105 done /2 partial /25 TODO /0 no-action**, exact eight groups. Saved Ep30 states **two**
news stand-downs of different length, not one: a **pre-release block** — *"you don't open new
positions during that window where the news is coming out, like 15 minutes before and after
news"* — and a **separate, longer post-release settle** — *"after the news came out, you want to
wait for the volatility to settle, maybe 30 minutes to 60 minutes after the high impact news comes
out. Once the structure start becoming much more clearer, this is where you can continue
trading."* The engine had **one** number applied **symmetrically** (`Math.abs(event − now) ≤
windowMin × 60000`, `src/bots/index.js:92`), so the two periods were forced to be equal, and a
block value he sanctions (*"you can set it to 5 minutes, 10 minutes, 30 minutes, 60 minutes"*)
silently collapsed the settle to the same number — **6–12× below the 30–60 minutes he
requires** — with no warning. The **M62 correction stands**: 45 was never the defect, the single
knob was, and the default is **not** lowered.

`src/news-window.js` (`news-window-v1`) owns **both** clocks and is a **leaf**: no requires, no
env, no filesystem, no path and **no clock of its own** (`now` is passed in), so it answers
identically when copied out of the tree. `news_block_before_min` (**default 15**, bounds 1–240) and
`news_settle_after_min` (**default 45, floor 30**, bounds 30–240) are two `accounts` columns with
their own CHECKs (bounds **and** an integer-cast test) plus two additive migrations; an inherited
account reads **15/45**, never the parent's 45 constant as a block and never a 45/45 pair.
`hit(eventMs, nowMs, plan)` is the only rule and it is **asymmetric by signed offset**: a release
that has **not printed** is judged by the block, one that **has printed** by the settle, boundaries
inclusive, and `NaN`/`undefined`/malformed pairs match **nothing** rather than everything. `plan()`
clamps on read and reports `source`/`clamped` per side; a block below the recommended 15 stores as
set with `news_block_before_below_recommended` and **never shortens the settle**; a settle under 30
is refused outright — **400 `news_settle_below_floor`** on create and on update; a settle beyond
the named 30–60 range is stored and reported with `news_settle_outside_stated_range` rather than
repaired. **A single number is refused, never split**: `window_min`, `windowMin`, `newsWindowMin`,
`news_window_min` and `?window=` are all **400 `news_window_split_required`**, checked **before**
the split fields so a knob cannot ride along beside a valid pair. The top-level `window_min` is
**gone rather than deprecated**, every blocked event carries its own `side`/`offset_min`/
`window_min`, the blackout sentence interpolates the account's own two numbers, and `setup.js`'s
fallback states the two windows in his direction instead of the hardcoded one-sided *"next 60
minutes"* (the surviving M62 half, closed here). **It split a window; it did not retune a grade**:
the news check keeps its weight and label, the state gate's own **60-minute** `window_minutes` is
untouched, the risk guardrail still clamps beside it, and no fill padding, sample floor, clock,
target, risk or grade moved.

**Measured.** M110 **258/0 across 9 probes** (pure 41, api 40, engine 25, consumers 22, freshness
17, hardening 40, portable 17, migration **33/0**, real-DOM ui 23). The migration probe records the
**actual c09574e 145-file M109 release** first (its own `?window=5` and default call echoing one
number on that very database), then upgrades it in place: **exactly two columns added**, the
parent's schema text an **unbroken prefix** of the upgraded text with the two definitions inserted,
every other schema object and every inherited fact outside `accounts` **byte-identical**, a
**second open a no-op**, the parent's single knob now a 400, hostile direct SQL (0/1.5/29/241/30.5)
refused by the columns themselves, null/blank refused rather than coerced, the four column
boundaries writing and reading back exactly, a per-request research pair answered but never stored,
a **parent-era bundle** and a **hostile bundle** (news numbers in the account row *and* at the
root) each importing their trades without moving the pair, the export carrying both columns and
**no old spelling**, and the **parent's own code still opening the upgraded file**. Six
constructed runtime stages (policy → api → engine → hardening → ui → documentation), each replayed
forward **and** reversed with **0 byte differences** against its frozen guard. **Parent control** =
the committed M109 release: eight probes **0/1**, migration **10/23** (the ten passes are what the
parent can still answer about itself), every exit 1. **Pre-hardening control** = the engine stage
(loose module + pass-through route, asserted identical, never copied twice): **api 31/9**,
**hardening 39/1**. Cohorts re-run on this tree: **M109 166/2, M108 257/2, M107 230/2, M106 316/2,
M105 140/2** — every extra failure is the **same declared negative**: a frozen migration probe
asserting *its* milestone added ONLY its own schema objects, plus an inherited-facts comparison
covering `accounts`, which now legitimately carries M110's two columns; nothing was edited to make
a frozen assert pass, and each failing label is preserved in `analysis/evidence/*/…-migration.txt`.
RAW **596/156**, DECLARED **824/4** and the live-provider arm **70/1** were **re-run on this tree
this session** and reproduce the committed records exactly (all three need no market provider);
the native API/bots arms need one this sandbox cannot reach and stay **inherited, asserted as
inherited**. Smoke exit 0, **22/22 conditional DOM views**, 0 style / 0 console, with the
**same-sample M109 parent control also 22/22**; `grep -ci news` = 0 in both smoke outputs, so the
two settings fields' coverage is `analysis/probe-m110-ui.js` (23/0), not the smoke. Ledger
**132 = 105 done / 2 partial / 25 TODO** (M110 applied, M62's surviving wording half closed with
it). Six runtime stages + docs, actual c09574e/pristine forward/reverse byte proofs, deterministic
**146-source** ZIP: `build-m110-news-window-artifacts.py`, `patches/M110-NEWS-WINDOW-STAGES.json`,
excluded archive SHA companion. [Full report](M110-NEWS-WINDOW.md). Arm servers stopped; `/tmp` DBs
synthetic/offline, scheduler OFF, not preserved real data.

**Workspace note for the next session (this session ran from a restored snapshot).** The local git
checkout arrived at the session's branch point, so the first action was `git fetch origin` +
`git reset --mixed origin/arena/b411452d-trader` (**c09574e**) — the working tree already held the
M110 work, and after the reset the diff against c09574e is exactly the 9-file changed set plus
`src/news-window.js`. `node_modules` is snapshot-excluded and was **reinstalled with `npm ci`**
(package-lock unchanged, so the copy is valid), and every `/tmp` tree was **rebuilt from git**
(`/tmp/m110-parent/app` from **c09574e**, digest re-asserted against the frozen
`analysis/evidence/m110/parent-source.json`; stage trees rebuilt by `capture-m110-stages.py`, which
asserts the pre-hardening tree **is** the engine stage). The M110 migration probe was re-derived in
this session against that rebuilt parent and is now **33/0**.

**Next at the time: M111 (the calendar fail-open), then M112 — M111 is now delivered (see the
current section above).** M110 was NOT a fix for M111 and said so on every probe: a calendar that cannot be fetched still reaches this rule as a **quiet** one — `blackout:
null`, no `unavailable` flag, no error on the payload — so an outage is still indistinguishable
from a clean week at this boundary; the pair *is* echoed on that path and a failure is **not**
cached, but the fail-open itself is M111's to fix. All 132 IDs / eight groups retained; session
fixed to **arena/b411452d-trader**, older counts/branches/next-steps below historical.

### Remaining IDs as M110 left them — historical

Partials **M30,M103**. TODO25 (then): the same 24 IDs plus **M111**, which M111 has since closed.

## Historical M109 — the advisory channel: ask the journal, deterministically — 2026-10-13

**132:103 done /2 partial /27 TODO /0 no-action**, exact eight groups. Saved Ep29 (Flow AI):
*"the real edge of AI is speed. It helps you close the gap faster between confusion and
clarity, emotion and logic, mistake and lesson, impulse and discipline"*, and the moment is
mid-session tilted — *"come to Flow AI. Flow AI will ground you."* The audit recorded that the
substance already existed (coach insights, the guardrail state, the trader's own records) with
**no route by which a user can ask the system anything** and no LLM integration point. The
episode's own limits are the delivery's limits: *"AI should not replace your trade plan… your
journaling… your review process… your risk management… your personal responsibility"*, *"if
you start using AI as a shortcut for certainty, you are using it wrong"*, *"AI is not the most
powerful when it tries to predict the market for you"*.

`src/ask.js` (`ask-v1`, deterministic, **read-only**, required in exactly one file — the route)
routes a bounded question to seven owned surfaces: the entry-gate/routine **record**, today's
risk facts (account policy + today's selected cap + open positions + realised net), the coach's
**own insights narrated not recomputed** (M11 30-trade score floor quoted when withheld), my
numbers as history not a forecast, the records I stored today (M106 gate + M107 intention +
M108 practice + the routine cycle, each with its **own timestamp** and the owning module's
freshness word), the rules/checklist I recorded, and news/calendar — which answers **unknown**,
because the channel performs no fetch and will not turn "I could not look" into "no news".
**Six refusals are successful 200 answers** carrying reason + episode citation + `can_answer`:
`ask_refused_permission`, `ask_refused_prediction`, `ask_refused_outcome_target` (an amount plus
an outcome verb in the same non-negated question — M107's classifier reused, its cues travel
with the refusal; a negated amount stays answerable), `ask_refused_mental_state`,
`ask_refused_other_person`, `ask_refused_override`; a question on no surface is an honest
`no_matching_topic` listing what it owns. Every line carries `kind` (fact/record/unavailable/
note) and `source`. **No model, no key, no network, no cache, no transcript, no new data**:
`LLM=false` in the module and `llm:false, model:null, api_key_required:false, network:false,
predicts:false, grants_permission:false, gives_direction_or_signal:false, changes_limits:false,
reads_only:true, writes:0, authority:'none'` in every payload; same stored state + same question
→ same bytes. **Read-only by construction**: no write helper, no concatenated SQL, **no engine/
bot/guardrail/routine/gate/intention/practice module requires it**, a full battery leaves every
table byte-identical (twice over on a tree with corrupted rows, including `sqlite_sequence`) and
does **not** create M108's lazy `practice_timers` row, adds **no table/index/trigger**, and
cannot move admission. `POST /api/ask` takes `{question}` only (≤280 chars, plain single line,
no markup/control chars; extras such as account/date/timezone **ignored**; malformed 400
`ask_invalid`; storage failure 503 `ask_unavailable`); `GET /api/ask/topics` serves the
surfaces/refusal codes/limits/meta; another trader's workspace is never read. Dashboard card
with chips, its **own** answer box (two cards never cross-fill) and a "what this channel will not
do" list; a stale card refuses with a toast rather than asking as a new workspace.

**Final168/0 across9 probes** — pure31 (router table, bounds, no-model/no-network, byte-identical
battery), api17, consumers18 (agrees with `/briefing` and `/coach`), freshness11 (server's own
UTC day, no caller scoping, no cycle created), hardening17 (unreadable retained-stop/settings/
practice rows reported and left unrepaired; hostile input stays data), portable16 (no channel key
in the backup, archives counted separately, crafted bundles inert), real-DOM ui27 + archive-ui16,
and the actual143-parent migration **15/0 proving ZERO schema objects added** with every inherited
fact byte-identical. Pre-hardening control tree = the api stage (asserted identical to
`pre-hardening-source.json`): the module reading practice through M108's reader, counting a row it
cannot read back as a recorded session and reporting an unparseable retained-stop payload as "no
stops" was measured by the **unchanged** probes at **14/3 + 28/3** and is **17/0 + 31/0** after the
hardening stage; parent controls 1/3, 1/1, 0/2, 5/1, 6/2, 0/1, 0/1. Previous cohorts re-run
unchanged: M108 259/0, M107 231/1, M106 317/1, M105 141/1 (**three declared milestone-only schema
negatives kept**; M109 adds no schema, so the M107/M106/M105 negatives are exactly the M108 ones).
RAW/DECLARED/live-provider/native arms **inherited unchanged and not re-run** (no route or schema
they touch changed — the M108 record stands). Smoke exit0 **21/21 conditional DOM**,0style/0console,
8canvas limits,96.6s, with the **same-sample M108 parent control also 21/21**; `grep -ci ask` = 0 in
both smoke outputs, so the advisory card's coverage is the two real-DOM probes, not the smoke.
Four runtime stages+docs, actual14ac041/pristine forward/reverse byte proofs, deterministic
**145-source** ZIP: `build-m109-ask-artifacts.py`, `patches/M109-ASK-STAGES.json`, excluded archive
SHA companion. [Full report](M109-ADVISORY-CHANNEL.md). Arm servers stopped; `/tmp` DBs synthetic/
offline, scheduler OFF, not preserved real data.

**Next M110/M111 (the news pair), then M112.** M110/M111/M112 and the older TODO rows still open;
M30/M103 partial. All
132 IDs/eight groups retained; session fixed to **arena/b411452d-trader**, older
counts/branches/next-steps below historical.

### Remaining IDs as recorded at M109

Partials **M30,M103**. TODO27: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M110,M111,M112,M115,M117,M125**.
PROGRESS asserts exact132/eight-group partition. Earlier lists are historical milestones,
not the current remaining work.

## Historical M108 — the regulation layer: a personal practice log — 2026-10-13

**132:102 done /2 partial /28 TODO /0 no-action**, exact eight groups. Saved Ep28 sanctuary
half: *"The guardrails in Edge Flow stop you mechanically. It's the hard wall… But
sanctuary fixes the emotional cause."* Sanctuary itself is an Edge Flow product feature
(meditation timer + ambient sound + video library); `grep -rniE 'sanctuary|meditat|
breathing|mindfulness' src/` returned 0 hits before this milestone, and the delivery is
scoped to what the app can honestly own and prove. **A timer proves elapsed running time
only.**

Additive owned `practice_timers` (one row per user: idle/running/paused, accumulated_ms,
pause_count, version) + append-only `practice_sessions` (human_declared receipts +
imported_unverified archives, UPDATE facts immutable, owner cascade,
UNIQUE(user_id,day,version)) + owner index + immutability trigger. **No `/practice` route
accepts an account_id**: the log is personal, can never be attributed to a desk, and cannot
bind M64/M107. Presets 300/600/900/1800/3600s or your own h/m/s (60–7200s, ≤2h); bell
markers 0/60/120/300/600 with a locally generated tone (no audio asset, nothing fetched);
ambience recorded as your own declaration with `ambience_played_by_this_app:false`; toolkit
reboot/rewire/recovery with per-item attribution and the unverifiable effects disclaimed;
note ≤2000; optional one-line intention ≤120 reusing M107's classifier (free text
unverified, asserted money target 400 `practice_outcome_target`, blank line = no intention).

Elapsed = **server running time only**, pause gaps excluded; >24h open cannot be completed
(409 cancel-instead); every action compare-and-sets the displayed 64-hex revision inside one
transaction (stale/unknown/malformed/wrong-state 409, nothing written) with an explicit
reload. Completing writes ONE immutable receipt recorded as it happened — a short or
early-completed session is not a failure. Day/history/progress count **readable
state:'recorded' rows only**: an unreadable row is `unavailable`, never counted, never
repaired, never invented. Progress is records not results (`counts_are_records_only:true`,
`target:null`, `score:null`, no streak language, only "consecutive days with a recorded
session"). **No authority at all**: no score/percentage/adherence/gate/permission and no
change to admission/risk/caps/routine/core/grades/history; briefing + owned journal day
carry the same object, a foreign trader sees nothing, and M64's routine timer / M106's four
questions / M107's intention stay separate.

Actual Dashboard + owned Journal day day-card + Settings archive warning; timer modal
(presets/custom, bells, ambience, toolkit, intention), start/pause/resume/complete/cancel/
reload, readonly history and the progress view. Typed state lives in module-level draft
state so a preset redraw cannot discard a typed intention or a chosen bell/ambience; the
draft clears when a session is recorded. Backup/restore transports `practice_sessions` as
imported_unverified archives keeping the original day/clock/elapsed/id as history.

**Final259/0 across9 probes**, actual141-parent additive/restart21/0 (parent control6/2).
Every prior cohort reproduces exactly — **17 suites/162 scripts, 0 per-script differences**:
m107feature231/1, m106feature317/1, m105feature141/1, screenshots223/3, changes152/1,
opportunities144/1, reviews159/1, behavior113/2, process106/2, emotions170/0,
confluences160/0, execution260/0, routine321/0, offline178/0, market325/0, RAW596/156,
DECLARED824/4, live-provider70/1. **Three declared milestone-scoped negatives kept**: frozen
M107 migration17/1, frozen M106 migration17/1, frozen M105 migration12/1. Pre-hardening api
stage = the pre-fix runtime (asserted identical to `pre-hardening-source.json`), measured
**hardening27/1 + pure70/1** by the unchanged probes (an unreadable receipt counted as a
recorded session; a blank optional intention refused as an error) and **28/0 + 71/0** after
the hardening stage.

Native two arms on fresh DBs: parent/current **API exit2 no summary** and **Bots198/8 exit1**
in both, 15 synthetic parity fills/0 mismatches (the count moves with the wall clock; 19 in
the M107 record) — identical trees, so no M108 regression; the inherited M107 parent/fixture
API121/0 came from that session's prepared workspace and is not reproducible from a fresh DB
on either tree, so it is left as committed. Smoke exit0 **22/22 conditional DOM**,0style/
0console,8canvas limits,99.4s, with the **same-sample unchanged M107 parent control also
22/22**. Four runtime stages+docs, actual8a2cfd5/pristine forward/reverse byte proofs,
deterministic **143-source** ZIP: `build-m108-practice-artifacts.py`,
`patches/M108-PRACTICE-STAGES.json`, excluded archive SHA companion.
[Full report](M108-SANCTUARY-PRACTICE.md). Preview/arm servers stopped; `/tmp` DBs synthetic/
offline, scheduler OFF, not preserved real data.

**Next M111/M112.** M109/M110 and the older TODO rows still open; M30/M103 partial. All
132 IDs/eight groups retained; session fixed to **arena/b411452d-trader**, older
counts/branches/next-steps below historical.

### Current remaining IDs — no omissions

Partials **M30,M103**. TODO28: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M109,M110,M111,M112,M115,M117,M125**.
PROGRESS asserts exact132/eight-group partition. Earlier lists are historical milestones,
not the current remaining work.

## Historical M107 — one process intention for the day — 2026-10-13

**132:101 done /3 partial /28 TODO /0 no-action**, exact eight groups. Saved Ep28 rule:
one clear rule for the day, one simple sentence, process-oriented, behavioral, within your
control — *"Today I'm going to make $5,000 from the market"* is an outcome goal outside
your control. `grep -rni intention src/` returned 0 hits and `journal_entries.tomorrow`
(`db.js:188`) is a next-day focus, not a same-day commitment. Additive append-only
`daily_intentions` (`human_declared` + `imported_unverified`, UPDATE facts immutable,
owner cascade, account SET NULL retained readonly), same-day-only writes pinned to the
server's own UTC day, revisioned CAS409/503rollback, no caller clock/day/source/owner/
authority, nothing backfilled/defaulted/carried over. The four curated Ep28 examples are
the **only** thing labelled process_template; free text is stored **exactly as written**
and explicitly unverified with the bounded classifier's own cues
(sentences/amounts/outcome/prediction/control/chars) and named warnings.

Only the episode's own anti-example is refused: an amount and an outcome **asserted in the
same non-negated sentence** -> `intention_outcome_target`400, nothing written, process
alternative named. Everything else records: "have a green day" is stored and flagged as
reading like an outcome; "I will not turn a $500 loss into a revenge trade" is stored with
no refusal (the app does not run sentiment analysis). States are
unrecorded/recorded/unavailable — never "failed", never a borrowed word; `last_recorded`
is history only. **No authority by design**: no score, percentage, adherence tally,
readiness, gate or permission over entries/signals/risk/cap/routine/core/grades/history,
journal text never rewritten, `journal_entries.tomorrow` keeps its meaning, and M64/M89/
M105/M106 stay separate mechanisms.

Actual Dashboard + owned Journal day + Settings share one card/editor/readonly-history;
today-only editor (saved example vs your own words, no preselected default), reload
discards an unsaved pick, 409 keeps the draft, past days readonly, escaped text, no
score/percentage/gate rendering. Backup/restore transports `daily_intentions` as
`imported_unverified` archives with the original day/clock/version/id as history that can
never become the receiver's recorded day; malformed optional history warns while finance
stays legal.

**Final232/0 across9 probes**, actual139-parent additive/restart18/0 (parent control6/2).
Every prior cohort reproduces M106 exactly — 16 suites identical, **0 per-script
differences across162 scripts**: m105feature141/1, screenshots223/3, changes152/1,
opportunities144/1, reviews159/1, behavior113/2, process106/2, emotions170/0,
confluences160/0, execution260/0, routine321/0, offline178/0, market325/0, RAW596/156,
DECLARED824/4, pure70/1. Two **declared milestone-scoped negatives kept**: frozen M106
migration17/1 and frozen M105 migration12/1 (each whole-schema assertion meeting M107's
four new objects). Pre-hardening api stage = the loose-dated runtime, measured
**15/3** by the unchanged freshness probe (a future day read as "nothing recorded", a
malformed day not refused) and **18/0** after the hardening stage; `loose-date-source.json`
asserts the control tree is that stage.

Native three arms: parent(prepared fixture)**API121/0/Bots204/2**, current same, RAW
**APIexit2/no summary/Bots200/6**, all 19syntheticfills/0mismatch (the fill count moves
with the wall clock; 15 at the M106 delivery); both original>20 sample conditions still
fail, no fillpadding/floor/clock/targetretune. Smoke exit0 21/21conditional DOM,0style/
0console,8canvaslimits,95.0s — with the **same-time unchanged M106 parent control also
21/21** (harness condition: the measured "full" chip is not a `.chip` at this sample).
Four runtime stages+docs, actual4d13078/pristine forward/reverse byteproofs, deterministic
**141-source** ZIP: `build-m107-intention-artifacts.py`,
`patches/M107-DAILY-INTENTION-STAGES.json`, excluded archive SHA companion.
[Full report](M107-DAILY-INTENTION.md). Preview/arm servers stopped; `/tmp` DBs synthetic/
offline, schedulerOFF, not preserved realdata.

**Next M108 (partial — meditation).** M109/M110/M111/M112 and the older TODO rows still
open; M30/M103/M108 partial. All132IDs/eightgroups retained; session fixed to
**arena/b411452d-trader**, older counts/branches/nextsteps below historical.

### Current remaining IDs — no omissions

Partials **M30,M103,M108**. TODO28: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M109,M110,M111,M112,M115,M117,M125**.
PROGRESS asserts exact132/eightgroup partition. Earlier lists are historical milestones,
not the current remaining work.

## Historical M106 — fresh in-session four-question state gate — 2026-10-13

**132:100 done /3 partial /29 TODO /0 no-action**, exact eight groups. Saved Ep28 rule
after an emotional spike: calm / clear / following the trade plan / would take it if
already up big — any no means **don't trade yet**. The code already carried it verbatim
as coach advice and nothing enforced it. Additive append-only `state_gate_answers`
(`human_declared` + `imported_unverified`, UPDATE facts immutable, owner cascade, account
SET NULL retained), answers exactly the four booleans or explicit null (partial/extra/
coerced invalid), revisioned CAS409/503rollback, no caller clock/source/owner/score/text,
nothing backfilled or defaulted. Freshness is APP policy: same UTC day and <=60min, states
not_adopted(allowed, no invented rule)/passed/failed/unanswered/stale/unavailable.
A recorded no is the same kind of personal stop as the killzone veto: signals/plan/Now
refuse, live `POST /trades` and reopen409 with no financial row, while closing/editing/
`record_only` history are never gated. Inherited M89 emotion-required 400 kept and asserted
before the gate is consulted; imported archives can never pass/fail/block.

Actual Dashboard/day/settings four-question card/editor text-only (no score/percentage/
readiness/dial), escaped, no provider fetch. Desk resolution `not_consulted` for no user/
unowned desk/foreign id; research and existing guardrails stay the authority. Separate from
M64 morning `check_in`, M89 emotion capture and M107 intention; no risk/cap/grade/routine/
core/history authority or write.

**Final318/0 across10 probes**, actual137-parent additive/restart18/0 (parent control7/2).
Original M105 141/1 = the frozen identity-only whole-schema assertion meeting the four new
objects: **declared milestone-scoped negative**, kept; M104152/1, M100144/1, M99/M101159/1,
M93113/2, M91106/2, M87223/3 unchanged shape negatives kept; emotions170/0, reasons160/0,
execution260/0, routine321/0. Raw596/156+90stimeout vsDECLARED824/4; offline178/0; declared
market325/0; live70/1 with6nonzero/5summaryless. Pre-hardening strict stage market5/1
(absent/foreign account escaped404) fixed by the desk stage → 325/0, both retained.

Native three arms: parent(prepared fixture)**API121/0/Bots204/2**, current same, RAW
**APIexit2/no summary/Bots200/6**, all same15syntheticfills/0mismatch; both original>20
sample conditions still fail, no fillpadding/floor/clock/targetretune. Smoke22/22conditional
DOM,0style/console,8canvaslimits,exit0,99.0s. Five runtime stages+docs, actual6f0783c/
pristine forward/reverse byteproofs, deterministic **139-source** ZIP:
`build-m106-state-gate-artifacts.py`, `patches/M106-STATE-GATE-STAGES.json`, excluded
archive SHA companion. [Full report](M106-STATE-GATE.md). Preview/arm servers stopped;
`/tmp` DBs synthetic/offline, schedulerOFF, blank remotes, not preserved realdata.

**Next M107 — daily intention.** M111/M112 stillTODO; M30/M103/M108 partial. All132IDs/
eightgroups retained; session fixed to **arena/b411452d-trader**, older counts/branches/
nextsteps below historical.

### Current remaining IDs — no omissions

Partials **M30,M103,M108**. TODO29: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M107,M109,M110,M111,M112,M115,M117,M125**.
PROGRESS asserts exact132/eightgroup partition. Earlier lists are historical milestones,
not the current remaining work.

## Historical M105 — declared identity, separate quarter theme — 2026-10-13

**132:99 done /3 partial /30 TODO /0 no-action**, exact eight groups. Optional
owned persistent self-description +distinct calendar-quarter theme, append-only
receipts/history/reference, explicitnullreset/no default/profit/note/actionfocus copy.
~90-day UTC APP quarters not precisely90days/brokerhours. Historical requested daily
view bounded to actual declaration receipts, not borrowing later words as oldstate.
Current acknowledged self_reported plan-followed/violated tally with known denominator;
legacy/stale/open/imported/unassigned/partial/chronology unknown separate, ratioNULL
notclean100. No P&L/grade/self-worth/identity score, psychological/causal/broker proof.

Actual Dashboard/day/quarter sharedcard/editor/history, escaped text, owner/account/
token/serial/closed/stale/fault guards. Separate M101 actionfocus/M107 intention/
M106 readiness; no admission/risk/core/routine changes. New quarter review snapshot
preserves received statement/theme/ref versions, unseen changes409/reload; old metrics
never rewritten. JSON restore forced ownreceiving/imported-inactive archive, original
words/clock/reference unverified, no humancommitment/acted/tally authority replay;
invalidoptionalwarning/financelegal/realimportfailure atomic/missingstorebackup marker.
Ownreadonly imported/orphan histories and Settings omissions visible, noautorefresh.

**Final142/0 across10 probes**, actual135-parent additive/restarts13/0. Original
M104152/1, M100144/1, M99/M101159/1, M93113/2, M91106/2, M87223/3 unchanged
shape negatives kept; only4new identityobjects, old63cols/alloriginalfacts exact.
Emotion170/0, reasons160/0, execution260/0, routine321/0. RAW596/156+90stimeout
vsDECLARED824/4 inherited mock/date failures. Offline178/0, declared market325/0,
live70/1 with6nonzero/5summaryless. Prepared actual-parent/current API121/0 each;
Bots204/2each, same15syntheticfills/0mismatch, both original>20sample conditions
fail. No fillpadding/floor/clock/targetretune. RawAPIexit2/no summary/Bots200/6.
Smoke22/22conditionalDOM,0style/console,8canvaslimits,observedexit0; measured-view
switch conditional. Exact original served-source smoke/exits/canvaslimits in
`evidence/m105/smoke-exit.json`, not pixels/broker/human/production proof.

Nine successful measured runtime stages+docs, actual903/pristine forward/reverse
byteproofs, deterministic **137-source** ZIP: `build-m105-identity-artifacts.py`,
`patches/M105-IDENTITY-STAGES.json`, excluded archive SHA companion.
[Full report](M105-IDENTITY-QUARTER-THEME.md). Preview3000 temporary synthetic
`/tmp/m105-preview.db`, offline/schedulerOFF/blank remotes, not preserved realdata.

## Historical M104 — recorded quarterly rule-change discipline — 2026-10-12

**132:98 done /3 partial /31 TODO /0 no-action**, exact eight groups. Full named
APP edit-unit delta across all8 M102fields: paired rule-line add/remove replacements,
reorder1/scalar1, cosmetic names/colour/pause excluded; not verified independent
causal variables. Own-global UTC quarter acrosssetups, each savededit/reversion,
one recommended/three maximum GUIDANCE/warnabove3, no technical/capital/grade/risk
veto. Unknown history/clock/defs/gaps explicit, never0/withinbudget certificate.

Actual strategy/current-version/fresh-change fact atomicwrites; inherited partial
UPDATE/unsnapshottedcreation on snapshotfailure measured5/2→7/0 and repaired without
extra finding closure. Before/after/source/rubric/serverclock captured, independent
of deletion/refund; legacy surviving-version fallback linkedonce, priorbaseline kept.
Strict own GET/preview/CAS, stale409, actual503rollback; legacy directPUT remains
legal andadvice-returning. Actual Playbook fresh editor/readonlycomparison/acknowledged
warning/history, wholeactor/account/token/serial/context/faultguards. New quarterly
review snapshotfreezes counters/baselines, old artifacts not recalculated. JSON own
receiving/imported-unverified archive, no strategy/action/budget proof replay; warnings
visible/financelegal, real importfailure atomic, missinghistory financialbackup marker.

**Final153/0 across11 probes**, actual133-parent additive/restarts14/0. M100144/1,
M99/M101159/1, M93113/2, M91106/2, M87223/3 unchanged shape negatives retained;
only4new ruleobjects and old63tradecols/alloriginalfacts exact. Emotion170/0,
reasons160/0, execution260/0, routine321/0. RAW596/156+90s timeout vsDECLARED824/4;
inherited mock/date failures kept. Offline178/0, declared market325/0, live70/1
with6nonzero/5summaryless. Prepared actual-parent/current API121/0/Bots206/0 each,
24syntheticfills/0mismatch. RawAPIexit2/no summary/Bots202/4. Smoke21/21conditional
DOM,0style/console,8canvaslimits,observedexit0. Exact conditional served-source smoke/exits/canvaslimits in `evidence/m104/smoke-exit.json`, not pixels.

Ten measured runtime stages+docs, actual837/pristine forward/reverse byteproofs,
deterministic **135-source** ZIP: `build-m104-rule-change-artifacts.py`,
`patches/M104-RULE-CHANGE-STAGES.json`, excluded archive SHA companion.
[Full report](M104-QUARTERLY-RULE-CHANGE-DISCIPLINE.md). Preview3000 temporary
synthetic `/tmp/m104-preview.db`, offline/schedulerOFF/blank remotes, not realdata.

**Next M105 — identity statement/quarter theme**, separate scope. M106/M111/M112
stillTODO; M30/M103/M108 partial; all132 IDs/eightgroups retained. Session fixed to
**arena/762c0295-trader**. Earlier counts/branches/nextsteps below are historical.

### Current remaining IDs — no omissions

Partials **M30,M103,M108**. TODO31: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M105,M106,M107,M109,M110,M111,M112,M115,M117,M125**.
PROGRESS asserts exact132/eightgroup partition. Earlier lists below are historical,
not current remaining work.

## Historical M100 — explicit missed-value opportunity review — 2026-10-12

**132:97 done /3 partial /32 TODO /0 no-action**, exact eight groups. Additive
owned saved-signal capture, revisioned decisions and explicit journal link/retract
history. Unused/pending/no-fill/expired/model win/loss NOT missed or actualentry.
Owner must explicitly declare value/inaction/reason; APP-confirmed original context
split from manual/legacy/stop/unverified judgments, no A-only/B-C or risk retune.
Actual saved-signal APIs observe aftercommit; truthful signal/finance survives optional
outage/mismatch warnings. Actual new/reopen source_signal_id links only admitted
exact saved plan; manual association self-report, no symbol/time guessing or duplicate
entry-cycle credit. Old words/association survive correction/deletion; no core/cap refund.

Planned first-target RR and existing resolver MODEL R are separately labelled,
not realised lost profit/causalcounterfactual/probability/permission. Unknown R/value/
unreviewed/legacy/unassigned coverage never certified0. Actual Saved Signals/editor/
form/Analytics/M99 period snapshot, wholeactor/token/account/serial/cache/error guards,
escaped history; old period financial baselines never rewritten. JSON restores forced
own receiving/imported history, no signal/action/eligibility proof replay, preserved
original declared clocks, invalidoptional warnings and real atomic import failure.
Settings warnings/readonly imported-orphan archives visible. Also independently fixed
inherited M99 demo RESPONSE error (seeded correctly then undefined import vars500),
response-only4/0vs3/1, no extra finding closure or seeding/grade/risk policy change.

**Final145/0 across10 probes**, actual131-parent additive/restart13/0. Original
M99/M101159/1, M93113/2, M91106/2, M87223/3 schema-shape negatives retained;
only new objects, old facts/columns exact. M89emotion170/0, reasons160/0, execution
260/0, routine321/0. RAW596/156+90s timeout vsDECLARED824/4; inherited mock/date
negatives not erased. Offline178/0, declared market325/0, live70/1 with6nonzero/
5summaryless. Prepared parent/current API121/0/Bots206/0 each,24syntheticfills/
0mismatch. RawAPIexit2/no summary/Bots200/6. Smoke21/21conditionalDOM,0style/
console,8canvaslimits,observedexit0. Exact conditional served-DOM smoke/
exits/canvas limits in `evidence/m100/smoke-exit.json`, not pixel/broker proof.

Ten measured runtime stages+docs, actualee977/pristine forward/reverse byteproofs,
deterministic **133-source** ZIP: `build-m100-opportunity-artifacts.py`,
`patches/M100-OPPORTUNITY-STAGES.json`, excluded archive SHA companion.
[Full report](M100-MISSED-VALUE-OPPORTUNITIES.md). Preview3000 temporary synthetic
`/tmp/m100-preview.db`, offline/schedulerOFF/blank remotes, not real data preservation.

**Next M104 — controlled quarterly rule-change discipline.** M105/M106/M111/M112
stillTODO, M30/M103/M108 partial; all132 IDs/eightgroups retained. Session fixed to
**arena/762c0295-trader**; older branches/counts/next steps below are historical.

### Current remaining IDs — no omissions

Partials **M30,M103,M108**. TODO32: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M104,M105,M106,M107,M109,M110,M111,M112,M115,M117,M125**.
PROGRESS asserts exact132/eightgroup partition. Old ID lists below are historical,
not current remaining work.

## Historical M99/M101 — periodic artifacts and chosen-focus follow-up — 2026-10-12

**132:96 done /3 partial /33 TODO /0 no-action**, exact eight groups. Distinct
weekly review/monthly reflection/quarterly documented refinement/annual reassessment,
owned account/calendar period artifacts with immutable draft/completed/amended
revisions, frozen server financial/process/strategy baselines and original receipts.
Annual exact prompts APP-guided, not invented quotation; UTC/Monday buckets APP
policy, not broker hours. Unknown denominators/clocks/net/R not0, original execution
best/worst separate from setup grade/money. Floor30 unchanged, no plan/goal/permission
apply from a review; current-period completion is early answered record, not elapsedperiod.

**M101 separately measured:** chosen one focus + exact adjacent completed commitment
ID/version/text/receipt, explicit yes/no/null self-report. No automatic acted/failure
from missing history. Prior amendment triggers409 and preserves the original answered
commitment; no moving goalposts. Actual Journal cadence manager/templates/editor,
readonly saved snapshot/history, deliberate amendments, actor/account/token/serial/
stale/fault guards. JSON historical restore forced own destination/new receiving
receipt/imported-unverified status, no replayed completion/acted/strategy proof;
optional bad history warns while finance persists, real store failure atomicrollback.
Settings warnings visible/no auto-refresh; missing history store doesn't deny financebackup.

**Final160/0 across9 probes**, actual129-parent additive migration15/0. Original
M93 113/2 and M91 106/2: two unchanged zero-schema/all-table migration assumptions
each now fail on legitimate review objects; retained. Other M93/M91 probes104/0/
97/0; actual129-parent proves all original columns/facts unchanged. M89 emotion170/0,
M88 reasons160/0, execution260/0, routine321/0; M87 screenshots223/3 old negatives.
RAW596/156+90s timeout vsDECLARED824/4; old missing-getToken/browser-day negatives
kept. Offline178/0, declared market325/0, live70/1 with6nonzero/5summaryless.
Prepared actual-parent/current native API121/0/Bots206/0 each,24 syntheticfills/0
mismatches; rawAPIexit2/no summary/Bots202/4. Smoke21/21 conditional DOM,0style/
console,8canvaslimits,observedexit0. Exact original conditional DOM smoke and
actual exits/canvas limits in `evidence/m99/smoke-exit.json`, not pixel/broker proof.

Seven measured runtime stages+docs, actual32f/pristine forward/reverse byteproofs,
deterministic **131-source** ZIP: `build-m99-review-artifacts.py`,
`patches/M99-REVIEW-STAGES.json`, excluded archive SHA companion.
[Full report](M99-M101-PERIODIC-REVIEWS.md). Preview3000: temporary synthetic
`/tmp/m99-preview.db`, offline/schedulerOFF/blank remotes, no real-user preservation.

**Next M100 — missed-value setup evidence**, not inferred unused signals/hypotheticaledge.
M104/M105/M106/M111/M112 remainTODO, M30/M103/M108 partial. All132IDs/eightgroups
retained. Session remains **arena/762c0295-trader**; older branches/counts/next steps
below are historical, never instructions to switch/push elsewhere.

### Current remaining IDs — no omissions

Partials **M30,M103,M108**. TODO33: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M100,M104,M105,M106,M107,M109,M110,M111,M112,M115,M117,M125**.
PROGRESS asserts exact132/eight-group partition. Earlier ID lists below are milestone
snapshots, not current remaining work.

## Historical M93 — daily reported-process review — 2026-10-12

**132:94 done /3 partial /35 TODO /0 no-action**, exact eight groups. Read-only
per-owned-account UTC ENTRY/rule-day APP tally, current valid core/execution review
and exact captured entry-cycle coverage. Missing/stale/open/prior/deleted/ambiguous/
unassigned evidence =>NULL, known issues still visible, never clean100/zero.
Per-action MAX12/6/3 (self-report/known stop exception), not duplicated per source;
no P&L/R/model/grade/size/emotion/excursion input, no authority/core completion.

**Scope correction:** direct fully known1–4 trade day can be reviewed; no quota to
force more trades. APP raw tally from1, tier below30 withheld. Original recurring
pattern detector **5**/window tier30/legacy score unchanged. Initial extra daily
minimum5 measured then corrected separately. Daily trend separate from labelled
legacy window pattern tally, gap NULL not zero interpolation or daily average.
Actual day/index/Analytics/Coach/whole Bots Corrections UI, escaped evidence and
owner/token/account/superseded/cache/error guards; zero schema/persisted scores.

**Final M93 115/0 across7 probes**, actual127-parent zero-schema/restarts11/0.
Original M91 process108/0, M89 emotion170/0, M88 reasons160/0, execution260/0,
routine321/0; M87 screenshots223/3 old migration-shape negatives retained.
RAW596/156 +90s timeout; DECLARED824/4. One extra original account-forwarding UI
fixture lacks real API.getToken; keep negative, don't weaken token guards/rewrite
old assertions. Offline178/0, declared market325/0, live70/1 with6 nonzero/5 summaryless.
Prepared native parent/current API121/0/Bots206/0 each,24 synthetic fills/0 mismatch;
RAW APIexit2/Bots202/4. Original smoke21/21,0 style/console,8 canvas limits,exit0;
exact exits/fills in manifest, not broker/pixels/human/production/market improvement.

Six separately frozen runtime stages+docs, actual797/pristine forward/reverse byte
proofs, deterministic **129-source** ZIP: `build-m93-behavior-artifacts.py`,
`patches/M93-BEHAVIOR-STAGES.json`, excluded archive SHA companion.
[Full report](M93-DAILY-BEHAVIOR-REVIEW.md). Main preview3000 temporary synthetic
`/tmp/m93-preview.db`, offline/schedulerOFF/blank remotes, not preserved real data.

**Next M99 — periodic review cadence.** M106/M111/M112 stillTODO; M30/M103/M108
partial. All132 IDs/eight groups retained. Session remains **arena/762c0295-trader**;
older branches/counts/next steps below are historical, never current instructions.

### Current remaining IDs — no omissions

Partials **M30,M103,M108**. TODO35: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M99,M100,M101,M104,M105,M106,M107,M109,M110,M111,M112,M115,M117,M125**.
PROGRESS is the exact132/eight-group partition. Older ID lists below are milestone
snapshots, not current remaining work.

## Historical M91 — profitable days with recorded guardrail exceptions — 2026-10-12

**132:93 done /3 partial /36 TODO /0 no-action**, exact eight groups. Read-only
M90 actual traded-exception + whole owned UTC account-day outcome review. A reached
stop/blocked request/research exception/record-only observation is NOT a traded
violation. Valid retained admission/event, reason/action/original rule day/clock,
current complete finite close-day net; unknown/corrupt/undatable/unavailable separate.
Profitable recorded-exception case => distinct **rewarded_breach** annotation,
not actual broker misconduct, psychological reinforcement or causal-dollar proof.

**Audit correction:** same behaviour scoring across profit/loss is correct.
M91 annotates, NEVER removes financial wins, changes win-rate/expectancy/grades,
creates a sizing veto or punishes profit. Full account-day outcome independent of
winning-symbol/strategy filters; overnight rule-entry vs close-day not conflated.
Zero schema/columns/writes; deletion/correction/reopen retains process history,
while current financial association can honestly change. Imports can't replay
server proof. Actual day/notebook/Analytics/Coach UI, escaped reasons, owner/token/
account/late/superseded/error guards, known flagged-day NET label, not causal impact.

**Final M91 108/0 across6 probes**, actual125-parent zero-schema/restart11/0.
Original M89 emotion170/0, M88 reasons160/0, execution260/0, routine321/0;
M87 screenshot223/3 old schema-shape negatives retained. RAW597/155 +90s timeout;
DECLARED825/3 same old M85 browser-day fixture. Offline178/0, declared market325/0,
live70/1 with6 nonzero/5 summaryless. Prepared actual-parent/current native
API121/0/Bots206/0 each,24 synthetic fills/0 mismatches. Raw APIexit2/no summary,
Bots200/6. Original smoke21/21 conditional DOM,0 style/console,8 canvas limits,
observed exit0. Exact served-asset conditional smoke/exits/canvas limits are in
`evidence/m91/smoke-exit.json`, not broker/pixel/human/production proof.

Six separately frozen runtime stages+docs, actual5a/pristine forward/reverse byte
proofs, deterministic **127-source** ZIP: `build-m91-process-artifacts.py`,
`patches/M91-PROCESS-STAGES.json`, excluded archive SHA companion.
[Full report](M91-PROFITABLE-GUARDRAIL-EXCEPTIONS.md). Main preview3000 is temporary
synthetic `/tmp/m91-preview.db`, offline/schedulerOFF/blank remotes, not real data.

**Next M93 — per-day behaviour score**, separate scope. M106/M111/M112 stillTODO;
M30/M103/M108 partial. All132 IDs/eight groups retained. This session remains
**arena/762c0295-trader**; older branches/counts/next steps below are historical.

### Current remaining IDs — no omissions

Partials **M30,M103,M108**. TODO36: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M93,M99,M100,M101,M104,M105,M106,M107,M109,M110,M111,M112,M115,M117,M125**.
PROGRESS is the exact132/eight-group partition. Older ID lists below are milestone
snapshots, not the current remaining work.

## Historical M89 — timely APP emotion prompts/provenance — 2026-10-12

**132:92 done /3 partial /37 TODO /0 no-action**, exact eight groups. Actual
owned after-entry/after-close popups, retained first answers/server clocks/context,
compatibility auto-tags and saved history; unknown/late/retrospective/imported/prior/
unavailable separate. **Five-minute APP policy, NOT a course quotation or broker/
mental-state proof**. Entry answered after close excluded; no legacy backfill.
Optional post-commit outage warns without undoing finance; strict displayed
revision/owner/token/account guards, one answer per event, immutable DB UPDATE.
Exit capture/decline still leads to required core/post-loss writing; no score,
permission/admission/cap/routine/risk refund or M106 calmness gate.

Closed-only primary Analytics/Coach use server child annotations, known outcome
counts and explicit coverage; old text is separately timing-unverified. No causal
dollar cost, prediction, sizing signal or70% claim. JSON/CSV retain original first
response/context as unverified declarations, forced imported/new destination IDs
and receiving clock, no original answer delay/proof replay. Invalid optional import
warns; real import-store failure rolls back. Capture-read outage cannot deny a
financial backup; omission markers and actual CSV/Settings warnings stay visible.

**M89 final170/0 across13 probes**, actual-parent migration14/0; unchanged
M88 confluence160/0, execution260/0, routine321/0. Original M87 **223/3** migration
shape negatives retained. RAW597/155 plus90s timeout; DECLARED825/3, same old
M85 browser-day fixture22/3 on actual parent (fixed server11th vs browser12th).
Offline178/0, DECLARED market325/0, live70/1 with6 nonzero/5 summaryless.
Final serial native prepared parent/current API121/0 each/Bots206/0 each,
24 synthetic fills/0 mismatches; initial205/1 each quarter-ATR0.19 negative kept,
not a clock/engine/risk patch or improvement. Raw APIexit2/no summary/Bots200/6.
Smoke**21/21 conditional DOM**,0 style/console,16 canvas limits,observed exit0.
Concurrent fetch/SQL_BUSY/native-timeout/4of21-smoke and fresh-preview20of21
Coach-deadline negatives retained, not erased. Focused served Coach rendered1716
chars/0 non-canvas errors; unchanged final smoke21/21/16canvas/exit0.

Twelve frozen runtime stages+docs, actual63d/pristine forward/reverse byte proofs,
deterministic **125-source** ZIP/private exclusions: `build-m89-emotion-artifacts.py`,
`patches/M89-EMOTION-STAGES.json`, excluded `evidence/m89/archive-sha256.json`.
[Full report](M89-TIMELY-EMOTION-CAPTURE.md). Main preview3000: temporary synthetic
`/tmp/m89-preview.db`, offline/schedulerOFF/blank remotes, no preserved real data.

**Next M91.** M106/M111/M112 remain TODO; M30/M103/M108 partial. All132 IDs/eight
groups preserved. This session stays on **arena/762c0295-trader**; older branch/
next-step/counts below are historical, never instructions to switch or push elsewhere.

### Current remaining IDs — no omissions

Partials **M30,M103,M108**. TODO37: **M12,M13,M15,M17,M18,M19,M45,M46,M49,M53,M55,M56,M59,M60,M62,M65,M66,M67,M72,M73,M74,M91,M93,M99,M100,M101,M104,M105,M106,M107,M109,M110,M111,M112,M115,M117,M125**.
Generated PROGRESS asserts exact132/eight groups. All older remaining-ID lists
below are milestone snapshots, NOT the current partition.

## Historical M88 — explicit entry confluences — 2026-10-12

**132:91 done /3 partial /38 TODO /0 no-action**, exact eight groups. Dedicated
nullable human reasons, **unknown != explicit none**, honest1 partial and2–5
recommended/max5; no tags/mistakes/emotion/model/image backfill. Reusable owned
dropdown, actual new/saved trade UI/API and JSON/CSV portability with declared
human/imported source/server receiving time, **not verified original entry time**.
Saved revision/concurrent/token/account/outage guards; optional invalid imports
warn without vetoing financial truth. Closed-only overlapping **by_confluence**
and coverage visible in Analytics; known denominators/unknown outcomes explicit,
course30 only a review annotation, no causal/predictive/70% or sizing claim.

**M88 actual160/0 across8 probes**, execution260/0/routine321/0 unchanged.
Original M87 **223/3**: three old migration shape assertions assume no added trade
columns; retained, not silently rewritten. New actual b0c migration12/0 proves
only3 nullable additions and prior finance/core/grades/images/caps/routine exact.
RAW597/155/one90s timeout vs DECLARED isolated828/0; offline178/0,
DECLARED market325/0, live70/1 with6 nonzero/5 summaryless. Native prepared
b0c/current API121/0 each/Bots205/1 each: identical20 synthetic fills/0 mismatches
and inherited>20-floor negative. Raw APIexit2/no summary/Bots201/5 retained.
Smoke22/22 conditional DOM/0 style-console/**16 canvas limits/observed exit0**;
initial90s tool timeout printed22/22/8canvas but exit unobserved, retained.

Seven runtime stages+docs, actual b0c/pristine forward/reverse byte proofs,
deterministic **123-source** ZIP/private exclusions guarded by
`build-m88-confluence-artifacts.py`; exact artifact metadata in
`patches/M88-CONFLUENCE-STAGES.json`, excluded archive SHA companion in
`evidence/m88/archive-sha256.json`. [Full report](M88-ENTRY-CONFLUENCES.md).

**Next M89 — timely emotion prompts/provenance.** M106/M111/M112 still TODO;
M30/M103/M108 partial. All132 IDs/eight groups preserved. M87/M86 results below
are historical milestones, not current all-green claims.

## Historical M87 — three-timeframe visual evidence — 2026-10-11

**132:90 done /3 partial /39 TODO /0 no-action**, exact eight groups. M87 is
optional human-labelled HTF bias /MTF location-liquidity /LTF trigger evidence,
explicit user-chosen frames, additive owned child storage and actual saved-record
three-slot UI. Legacy image preserved **unassigned**. Required displayed revision,
server recording time (NOT capture time), prior-context retention after financial
correction; images never complete core writing, grade execution or grant entry.
Owned JSON/CSV roundtrip uses actual new IDs and **imported/unverified** provenance,
not replayed workflow/capture proof. Bad optional media warns without vetoing
financial truth; unsafe credentials/active media rejected, corrupt metadata
unavailable, repeated references/equivalent frames flagged rather than pretending
three independent views. Settings no silent4MB clip; explicit20MB file selection
and unchanged25MB API body limits. Server never fetches remote image links.

**226/0 across9 M87 actual/no-prerequisite-adapter probes**, plus unchanged
execution260/0 and actual routine321/0. RAW597/155/one90s timeout retained;
DECLARED isolated828/0 is not integrated preparation proof. Offline178/0,
DECLARED market325/0; live-provider70/1 and6 nonzero/5 summaryless retained.
Prepared original d5/current native API121/0 each, Bots**205/1 each**: same20
synthetic parity fills/0 mismatches but inherited sample floor requires>20.
No padding/target/model change. Raw native APIexit2/no summary,Bots201/5.
Original smoke**22/22** conditional DOM views/0 style-console/8 canvas limits,
**observed exit0**, not pixels. Earlier M86 counts stay historical.

Six independent stages, combined d5 and pristine-ZIP forward/reverse byte equality
are guarded by `build-m87-screenshot-artifacts.py`; source121 files and no private
env/DB/dependencies. Exact hashes/counts in `patches/M87-SCREENSHOT-STAGES.json`
and excluded `evidence/m87/archive-sha256.json`. [Full report](M87-TIMEFRAME-SCREENSHOTS.md).

**Next M88, then M89.** Partials M30/M103/M108; M106/M111/M112 remain open.
Course floor30, deliberate M103 n>=5, B/C tradeability, all entry/checklist weights,
geometry/stops/targets/RR/default risk/factors unchanged. No70% win-rate, broker,
provider, actual human/meditation, causal, production or pixel proof. Older
owned-strategy routine UI freshness remains **UNMEASURED**. Current preview3000
uses new temporary `/tmp/m87-preview.db`, unadapted synthetic offline/blank remote
vars/schedulerOFF; old ephemeral preview DB unavailable, not preserved-user proof.

## Previous M86/M92 execution follow-through — 2026-10-11

**132:89 done /3 partial /40 todo /0 no-action**, exact eight groups. M86 is
execution-based journal grading, **NOT loss drill**; M92 is separately staged
process-ranked day best/worst. Pure current human adherence/explicit stop honour,
nullable source/server clock/versioned record SHA and required displayed revision.
Unknown/legacy/stale/corrupt evidence unreviewed, no score or false current
violation; valid current partial human answers not full grades. No outcome/RR/
session/excursion points, no setup_grade backfill or persistent score cache.
Original entry/setup grades and A+/A×1,B×.5,C×.25 risk factors/geometry unchanged.
Day ties kept, unknowns unranked; P&L/extrema compatibility explicitly money-only.
Optional execution review does not complete core writing/preparation, revive a
technical veto or refund any cap/loss/streak/cooldown/first-admission observation.

**260/0 across9 new actual/no-prerequisite-adapter probes**, coexisting actual
routine321/0 across10. Original raw legacy597/155 plus one90s timeout/early aborts;
DECLARED isolated828/0 is not raw/integrated preparation proof. Explicit synthetic
offline pure178/0, DECLARED market325/0. Original native prepared parent/current
API121/0,Bots206/0; currentraw APIexit2/no summary,Bots202/4exit1 retained. Current
smoke later21/21 conditional rows/0style-console,8canvas,exitNULL/unobserved; no
pixel/provider/broker/production/human meditation/70% edge claim.

Nine incremental stages +combined+pristine clean forward/reverse byte proofs,
secret-free deterministic ZIP and source/evidence guards:
[execution report](M86-M92-EXECUTION-REVIEW.md),
`evidence/m86/feature-summary.json`, `patches/M86-EXECUTION-STAGES.json`,
`evidence/m86/archive-sha256.json`. Parent **c22d5b9**; actual source119 files.
Partials M30/M103/M108; all40TODOs retained. **Next M87 screenshots, then M88/M89**.
Morning checks ≠M106 fresh entry gate; broader M108 partial, M111/M112 open,
M116 alreadyAPPLIED. Older routine owned-strategy UI freshness remains UNMEASURED.
No new source fetch/full missing bonus transcript; no credential storage/rotation.

## Historical M14/M64/M94 routine delivery — 2026-10-11

**132:87 done /3 partial /42 todo /0 no-action**, exact eight groups. M14/M64/M94
complete together; M108 **PARTIAL** for the mandatory routine15-minute timer only,
not the broader Sanctuary/toolkit. **321/0 across10 new probes**, no inherited
prerequisite adapters. Explicit own HH:MM/IANA schedule, frozen cycle/reset inclDST,
calendar→own plan→human charts/alert→server-running-time15m→FOUR morning checks;
selectable meditation-first variant uses only the known partial bonus +Ep17 steps.
Actual persistent shell banner, owned workflow/diary/report UI, nullable human
self-report distinct from automatic workflow and on-time/first-entry preparation.
Late completion/typed exceptions/edits/deletion do not rewrite first admissions or
refund old guards. Descriptive UTC close-day daily realised P&L, unknown distinct,
no missing-net zero/causation/risk tuning. [Report](M14-M64-M94-ROUTINE.md).
Original inherited597/155/21completed-nonzero plus1UI timeout/aborts retained;
**828/0** only under DECLARED new-prerequisite isolation (NOT integrated routine
proof). Native raw current API aborts on missing preparation; bots202/4. Parent and
DECLARED actual-module synthetic preparation fixture API121/0,bots206/0,23synthetic
parity fills/0mismatches, unchanged thresholds. Changed cohort is not edge. Smoke
22/22,0style/console,8canvas limits; completed log after tool timeout, exit unobserved.
M89/M106/M111/M112 stay open; morning confirmations are not the separate fresh
in-session gate, calendar review not feed clearance, clock not actual meditation.
M30/M103/M108 partial; all42TODOs retained. At that delivery next was M86 execution grading (not loss drill), paired M92; now applied; next M87–M89
capture/provenance in mechanism order. No70%/target shrink or production/broker claim.

### Current working/artifact pointers

- Fixed branch `arena/762c0295-trader`; measured parent75172759d134e63ed57a20c5e2941eb6c28e9855. Read git for actual current commit/push.
- App117 files; source manifests +9 stage patches, `analysis/build-m64-routine-artifacts.py`, `analysis/patches/M64-ROUTINE-STAGES.json`. Normal rebuild uses durable patches, not `/tmp` stages. `tradingpro-main.zip` untouched.
- `src/routine.js`: own local schedule/cycles, validated immutable metadata, human ordered steps/four morning checks, server start/pause/resume/complete15min; corrupt latest-cycle/rollback cannot mint fresh known state.
- `src/routine-records.js`: independent per-account UTC nullable self-reports, actual workflow, independent no-trade-FK first-executed-admission facts; current done vs on-time/before-first-entry distinct. Stored corruption stays nullable/unwaivable, never self-report pass.
- Gate in correction/guardrails, never permanent new routine day latch. Known setup/pending stop +fresh reason, unknown no waiver; old cap/count/loss clocks retained even on FIRST unknown routine read. All honest close/correction/record-only/import/history remains legal.
- `public/js/views/routine.js` +App shell owns banner outside view, periodic server recheck inclaccount/stale-response/reset/fault; actual Settings/day/report surfaces. `docs/GUARDRAILS.md`, README, API docs contain contracts.
- UI39/0 exercises manual plan; owned-strategy UI preview freshness remains UNMEASURED. Server workflow/contract snapshot tests are not that browser preview proof. No pixel/layout/actual-meditation proof.
- Evidence `analysis/evidence/m64` +m94:321/0 new actual/no adapters, per-stage controls/errors, actual751upgrade/restarts24/0. Old raw597/155 plusUI timeout; isolation828/0 explicitly NOT full current-policy proof. Old market consumer raw aborts retained; M64-only isolation325/0. Pure Now50/Topdown77/Chart36/settings15 unchanged/no adapter.
- Native raw currentAPI aborted, bots202/4 on unsupplied mandatory routine. Correct parent and DECLARED real-module synthetic15m/human fixture both API121/0,bots206/0,23 parityfills/0mismatches. Initial wrong TJ_BASE/cleanupDB/scheduler-variable/JSON-preload errors retained. Do not claim raw native green or fixture as real human timer proof.
- Smoke22/22 completed after90s tool wait timeout,0style/console,8canvas limits; exitstatus not observed, conditional view switch actually ran this cohort.
- Current preview process/DB at preparation `tradejournal-synthetic-test-prev-7d0ddfcd`,port3000, `/tmp/m64-final-regressions.db`, unadapted synthetic/TJ_SCHEDULER0/blankremotecredentials. Recheck actual liveness; parent3001 and fixture3002 stopped.

### Every remaining ID (no omissions)

Partials: **M30,M103,M108**. TODO40: **M125,M45,M46,M49,M53,M55,M67,M72,M73,M74,M112,M12,M13,M15,M56,M59,M60,M65,M66,M87,M88,M89,M91,M93,M99,M100,M101,M104,M105,M106,M107,M115,M17,M18,M19,M62,M109,M110,M111,M117**. Generated PROGRESS asserts exact132/eightgroups. Historical counts below are not current89/3/40.

## Historical M84/M85 continuation state — 2026-10-11

- Fixed branch **arena/762c0295-trader**; measured parent **446e705d1fb0ae03d6bbfcd0913145619bd395fe**.
  Read git for current commit/push. **132:84done/2partial/46todo/0no-action**, exact8groups.
  M30/M103 partial, M125 TODO. User CONTINUE; no more clarifiers, keep floor30/
  deliberateM103n>=5, no70%/target shrinking/missing findings or invented edge.
- [Authoritative M84/M85 report](M84-M85-SESSION-JOURNAL.md), evidence/m84 +m85,
  guarded114-file final app/112parent/eight stages in M84-M85-STAGES.json and
  build-m84-m85-artifacts.py. **244/0 across9 new probes**, actual policies/no legacy
  adapters. Initial probes/our new-layer defects retained; see report.
- M84 nullable max_session_minutes1–1440 integer/app range, legacy/new defaultOFF;
  two-hour example not universal. Owned explicit server manual start/end/recheck,
  frozen limit/idempotence, one perUTCstartday/active unique; active survives midnight,
  end retains history, future startday afterend can startnew. Always ADVISORY, not a
  broker/chart screen-time fact/new entry veto or permission/refund. Unknown time
  remains unknown elapsed, never0; corruption cannot secretly veto entry.
  Backend39/0vs3/36, actual Settings/Dashboard(first-run too)/Corrections UI14/0vs3/11.
- M85 reuses before/after emotion, execution_notes/what, mistakes-or-explicit-none,
  lesson/different. New mistakes_none0, journal_reviewed_at/hashNULL, no legacy
  completed-at backfill. Owned review validates plain text<=2000/emotion<=100,
  conflict/empty mistakes+none, actual closed/known result/notfuture. Fingerprint
  covers relevant facts/text; generic write cannot forge serverack; unrelated note
  preserves, relevant edits incomplete. P&L/A+/notebook is not completion. Core33/0vs3/30.
- Live new/reopen requires explicit nonblank emotion, genuine record-only/history
  still accepted blank. This is INPUT capture only: namedFOMO allowed, M106 four
  questions TODO; M89 real entry/exit capture-time provenance/exclusion TODO.
- guardrail_reflections has independent original observed loss snapshot/key/time,
  NO tradeFK, current UTC known losses. Migration creates no capture automatically;
  first observed current legacy loss capturedNOW, not backdated historic violation.
  Pending writing STOP is RESOLVABLE, NOT added to DAY_STOP_RULES. Survives truth
  correction/deletion and restart; core ack or retained-loss endpoint can resolve
  without recreating/refunding/admitting. Captured completion idempotent/immutable;
  newday priorpending notnewveto, oldloss clock still crossesmidnight. All other
  stops/timed rules remain, known one-action reason doesn't complete/unlock writing,
  unknown cannotwaive. Actual close always recordable. Gate34/0vs7/27, four actual
  model/direction analyse/chart/scan/Now/signal cases64/0vs24/40 (declared candle/CRT/
  exact-net/fixed-cash seams, not OHLC discovery/equity compounding).
- Independently measured new-layer fixes: gate-only8/5→contracts13/0 (futurecomplete,
  storednone2, invalidID local404 vsdriver503). UI-stage1/4→retention5/0: newwriting
  unknown previously returned before retaining known old cap. Now preserve known
  cap/count/loss-clock and observed original breach before returning unavailable;
  actual truthful bulk delete cannot replenish cap. No silent grade/policy retune.
- Actual UI25/0vs10/15: entry before-POST validation; close saves then prompts3lines;
  deferring leavesgrey reason dialog; explicit editor/none, escapedmarkup, grey log
  marker/owned UTCcounter/day without notebook,0/0empty. Dashboard/Corrections/day
  retained-loss writing evenafterdelete; no recreatedtrade. Core complete scope
  explicit (NOT allcourse screenshots/confluences/timing/state/routine).
- Actual prior446e705 schema/multiple fresh-process migration/restart17/0: all
  original account/trade/cap/state/event/admission bytes preserved; optionalOff/
  completionNULL/no speculative captures, active marker/pending/completion persists.
- Original inherited old probes retained **465/73 /11nonzero exits**, earlyaborts
  make538measured not584total. Lack of new live emotion/writing +owned404 changed
  contracts. DECLARED legacy-guard-fixture-runner.js holds writing/newprompt fulfilled,
  supplies syntheticNeutral to oldfixtures and adapts additive table/owned404
  assertions. **584/0 scoped guard isolation**, NOT full current-policy proof.
  Initial isolatedhistory21/1 and runner remain; original probe files unchanged.
  Actual new244checks and native suites have NO adapter. Do not conceal negatives.
- Native actual unchanged scripts/IO explicitly synthetic, serialperDB/scheduler0:
  API121/0both, bots205/1both,20parityfills/0mismatches, existing>20samplefail/exit1.
  15neutral files:10models/geometry+shared risk/P&L/lock/native scripts. Native
  Now50/0,Topdown77/0,Chart36/0,M33 67/0,M78 169/0,M77 41/0,M71 48/0/settings15/0.
  Smoke**21/21**,0style/console,8canvaslimits; full-default sample10 skips conditional
  "switch tofull" check (oldsmoke22). EmptySegments/integrationpeekfalse not passes.
- Preview3000 currentruntime,/tmp/m84-final-regressions.db,explicitly synthetic,
  scheduler0/blank remotecredentials. Process tradejournal-synthetic-test-prev-f5a685f1;
  verify liveness nextturn. Previous446 preview stopped/replaced. Parent3001 control
  stopped aftermeasurement. Host/originhealth/root200, not publicauth/feed/cron/Turso/
  Vercel/pixel/broker/edge proof. User no-keyrotation respected; no credential commit/use.
- Final114appfiles/eightstage+combined+pristine forward/reverse0byte proofs/sourceZIP;
  archivehash companion evidence/m84/archive-sha256.json outsideZIP; no env/DB/deps/
  datasets. Documentation stage runtime-neutral. Source/tmp/deps notpersistassumed.
- **Scope bookkeeping correction:** M116 already APPLIED in ledger/PROGRESS, not
  open. Previous summaries incorrectly listed it TODO; corrected docs, no extra
  closure/retuning or inferred rolling100/provisional implementation.
- **NEXT M94 paired with M64/M14 routine and M108 meditation step.** Saved Ep17/bonus
  timing/step sequence must be scoped together withdaily tracking/reset; boolean
  alone insufficient. M89/M106 stayseparate, all46TODOs/2partials visible. No claim
  incompleteitems causedlosses; do not repeat completed M71 twelve-run study.

## Historical M81/M82 continuation state — 2026-10-11

- Fixed branch **arena/762c0295-trader**; measured parent **7f1122dade0b9022b595aadc08bbb29badff51f6**.
  Read git for current commit/push. **132:82done/2partial/48todo/0no-action**;
  exact eight groups; M30/M103 partial, M125 TODO. User CONTINUE, no more clarifiers;
  keep floor30/deliberateM103n>=5, no70%/target shrinking or missing IDs.
- [M81/M82 report](M81-M82-PROFIT-RISK.md), evidence/m81 +m82, guarded manifests
  and eight incremental/combined/pristine patches in M81-M82-STAGES.json;
  reproducible build-m81-m82-artifacts.py. **282/0 new across10 probes**, inherited
  unchanged12-probe **302/0** rerun. Not distinct defects/market outcomes.
- M81 optional account daily_profit_limit_pct:NULL/OFF legacy/default, positive
  finite through100/app range, separate lifetime profit_target_pct. First scoped
  UTC profit check freezes ON/OFF/percentage; later edits future day. Legacy cap
  clock retained; NULL new selection marker filled once NOW, no backdated policy.
- Close-day known realised net only, overnight included/future excluded, denominator
  existing day-start equity (start+prior closed net), floating excluded. Unrounded
  comparison inclusive (104.9999display105 stays below105); existing REAL/JS numbers,
  not arbitrary precision. Enabled unknown close/net/policy/clock/amount underflow
  cannot waive; OFF preserves legacy older-undated policy. Truthful repair allowed.
- Profit rule joins durable day-stop whitelist. Observations survive P&L correction,
  deletion/settings OFF/restart until UTC rollover; truthful CRUD/import/research
  remain. Same owned/server-clock transaction/recheck/reason≤2000/plain-string
  single-action/M90 day-review/technical-veto/no-op policies preserved.6concurrent
  stopped entries all409/0writes; audit failure rollback, reopen needs new admission.
- Separate source-stage measures: policy59/0vs3/56; gate51/0vs15/36; consumers60/0vs
  24/36; validation16/0vs8/8; actual7f migration13/0; UI24/0vs7/17. Actual Settings/
  Dashboard/Corrections/modal/review, auth/SQL. Model/candle/cash/bootstrap/chart IO
  seams declared; not pixels, providers or broker execution.
- M82 streak loss×0.6/win×0.9 removed, descriptive reasons retained; real streak
  STOP/cooldown409 stays.29/0vs15/14. Separate after_two_losses25% sizing advice
  removed, detection/evidence fingerprint unchanged;5/0vs3/2. M9 shared clamp now
  covers advisory legacy reads:16/0vs5/11, no DB mutation/constant change. Actual
  new-account0.5 default and base/advisory/off-streak labels9/0vs4/5.
- **Scope correction:** Ep21 explicitly allows drawdown reduction/pause, so prior
  M82 blanket ban withdrawn; separate old drawdown/day-loss advice unchanged. Grade
  M98/M58 mapping A+/A×1,B×0.5,C×0.25 preserved; no automatic A+doubling. M9 .5default/
  locked,1manualmax,.25basefloor preserved. **M85 post-loss reflection/completeness,
  not adaptive size**. Misplaced M94 profit paragraph moved to M81; M94 routine open.
- Initial failures retained: validation11/5vs6/10 used omitted-status CLOSED recording
  not OPEN admission; UI stale-dialog class crash and11-check interactive-promise
  wait/timeout; advice1/4 inactive cyclical fixture; /health SPA parsed as JSON.
  Corrected probes, not production hacks. Shallow checkout lacks fdaa2bc object;
  reverse guarded M79/M80 patch from7f recovers110-file prior migration source with
  zero manifest differences (recorded), old migration9/0. No branch switch/fetch.
- Native current and parent **API121/0 both /bots205/1 both /20fills /0mismatches**.
  Existing>20sample failure kept, both nativeexit1. Earlier19fills/204/2 negatives
  stay historical; changed contemporary synthetic cohort is not improvement.
  Both scripts byte-identical; serial perDB/offline/scheduler0/blank credentials.
  Now50/0,Topdown77/0,Chart36/0,M33 67/0,M78 169/0,M77 41/0,M71 48/0/settings15/0.
  Smoke22/22,0style/console,8canvas limits. Fifteen guarded neutral files including
  ten core engine/model/price-policy, P&L, shared risk constants, lock/native scripts.
- Preview3000: current source,/tmp/m81-final-regressions.db,explicitly synthetic,
  scheduler0/blank remote credentials. Fresh process token tradejournal-synthetic-test-prev-1ed5a4dd;
  check liveness before citing. Old prior-preview token not found; not reused.
  Parent3001 test control stopped after validation. No live/broker/auth/Turso/Vercel/
  cron/pixel/edge claim. User no-key-rotation respected; no real credential commit/use.
- Final source112 files; deterministicZIP/hash companion evidence/m81/archive-sha256.json
  outsideZIP; eight incremental+combined+pristine forward/reverse0byte differences,
  no DB/deps/datasets/secrets. Documentation stage runtime unchanged.
- **NEXT M84 optional session-duration marker, then M85 required post-loss reflection
  /journal completeness**, then remaining risk/review mechanisms. M94/M111/M112 (M116 was already APPLIED; earlier open-label corrected)
  remain open, all48TODOs/2partials visible. Do not infer incomplete items caused losses
  or repeat the completed M71 twelve-run measurements. Existing M79 admitted-count
  and durable-loss-clock policies continue as documented below.

## Historical M79/M80 continuation state — 2026-10-11

- Fixed branch **arena/762c0295-trader**; parent **fdaa2bc5cd7922df094c53e3991627dc7c1c23ba**.
  Read git for exact current HEAD/push. **132:80 done/2 partial/50 todo/0 no-action**;
  exact eight-group partition; M30/M103 partial, M125 TODO. User CONTINUE; stop
  asking clarifiers, preserve course30 and deliberateM103n>=5, no70%/target shrinking.
- [Authoritative report](M79-M80-GUARDRAILS.md), evidence/m79, incremental guarded
  patches in M79-M80-STAGES.json and reproducible build-m79-m80-artifacts.py.
  M79/M80 plus independently measured M83/M113/M90 complete. Final302/0 feature
  assertions across12 probes (not distinct defects, market outcome or edge tests).
- Cap38/0vs2/36; admission48/0vs10/38; consumers44/0vs16/28; history22/0vs1/21;
  reason29/0vs10/19; actualUI26/0vs backend3/23; prices4/0vs2/2; account6/0vs3/3.
  Parent “detection correct” withdrawn: unawaited rules/account/count/closure-day
  defects. Original deletion acceptance3/1 retained; history was durable but
  permission not. Exact acceptance now4/0; extended durable48/0vs20/28.
- Separate guardrail_day_state and guardrail_entry_admissions; no journal trade
  FK, monotonic observed floor + transactionally counted successful live entries/
  reopens. Journal corrections/backdates/deletes remain legal and cannot reset
  observed day cap/loss/streak stop. Time gates retain observed loss timestamp
  but expire precisely; UTC rollover resets day stops, not a crossing loss clock.
  Existing legacy rows may seed observed current count, not fabricated admissions.
- Selected capdefault3/integer1–100/guidance3intraday5scalping; first UTC check/
  admission freezes it, later edits next day; history only suggestion. Same-account
  reopens count again. Signal/research plans are not executed trade-entry slots
  nor reusable permits. Prospective trade/reopen always rechecked server-side.
- Known stop + reason permits one action with fresh scoped snapshot/linked audit,
  atomic rollback on audit/admission failure. Unknown cannot waive; technical
  veto untouched. Empty/no-op plan grants no permission/event. Validation24/0vs
  retention13/11: only tagged local validation propagates400; arbitrary driver4xx
  remains generic503. Existing public-route{error}400 unchanged. Migration9/0
  actual prior-schema/localDB/idempotence/no backfill, not hosted deployment.
- Actual browser modal/preflight/race/account handling tested, not pixels. Honest
  record-only open/historical/import/research states never permission; captures
  recording-time/unknown, legacyNULL. Real day review escaped/immutable/scoped.
  Independent integer price fix100→1/110→11 and empty-prefix callback composition
  fixed; prior M33 66/1 and M77/M78 crashes retained, repaired67/0/41/0/169/0.
- Native final IO explicitly synthetic/localDB/scheduler0. Identical truthful
  historical/record-only/research fixtures, unchanged existing values/assertions/
  floors; API121/0both, bots204/2both (19fills/0mismatches below20/>20 floors).
  Original live-seed/bulkdelete-reset assumptions failed correctly; failures kept.
  Standalone sharedDB migrationSQLITE_BUSY kept; final suites serial perDB.
  Now50/0,Topdown77/0,Chart36/0,Smoke22views/0UIstyle+consoleerrors; prior consumer
  M33 67/0,M78 169/0,M77 41/0,M71 48/0/settings15/0. All ten engine/model/price-policy
  files byte-identical to parent; no new outcome runs or claim of improvement.
- Preview3000 current code, /tmp/m79-regressions.db, synthetic, scheduler0,
  blank remotecredentials. Host/origin200; control3001 stopped after measurements.
  No broker/liveYahoo/productionauth/Turso/Vercel/cron/pixel proof. User's
  no-key-rotation instruction remains; credentials remain uncommitted/ignored.
- **112 final application files** including guardrails guide; deterministic ZIP,
  archive hash companion evidence/m79/archive-sha256.json outside ZIP avoids
  self-hash. All stage/combined/pristine forward+reverse/byte checks0differences,
  package lock and older patches unchanged. Do not rerun old M71 twelve measurements.
- **NEXT M81 profit stop, then M82 resize / remaining risk mechanism order.**
  M85 post-loss reflection/completeness (old adaptive-size label was wrong),M111 news fail-closed,M112 time-window remain open. All50todos
  +2partials visible. Do not infer other closures or that unfinished items caused losses.


## Historical M71 continuation state — 2026-10-11

- Fixed branch **arena/762c0295-trader**. M71 complete; actual parent **184695d**.
  Read git for exact HEAD/push. **132:75 done/2 partial/55 todo/0 no-action**,
  exact eight-group partition. M30/M103 partial; M125 TODO. Do not ask more
  clarifiers, lower targets/floors for win rate or revive the70% objective.
- [M71 authoritative report](M71-PRIMARY-RR.md): first paid magnet qualifies RR,
  no optional runner rescue. Runway/check/cap/hard veto read rr_primary_exact;
  rr_floor records primary/floor/price/TF/precision. Existing conservative min
  of working/published geometry and1e-9R tolerance; display-rounded2.00 cannot pass
  actual sub-floor. Explicit pre-M77 research rounding remains honestly labelled.
- Default single-target path was already correct. No entry/stop/target/catalogue/
  physicalTF/causal evidence/risk coefficients move. Refused grade-C hypothetical
  size may drop through existing grade policy. Default/eligible sizing identical.
  Single-target instruction now set-and-forget (no algorithm change); Copy labels
  first floor/final not floor evidence; journal targetT1/planned_r now same endpoint.
  Optional ladder display/50%/50%/BE kept; bounded M33/CRT still one target.
- Saved route min_rr and M26 session_pref were silently ignored (undefined db).
  **Separately measured** D.db repairs: primary consumers45/3→floor-only48/0;
  isolated settings7/8→12/3→full15/0. Query wins, defaults/clamps preserved, saved
  NY/queryLondon and savedLondon/queryNY actual gates exercised. API/UIdefault1,
  direct Setup2; user0.1–10 floors retained. Scan existing fixed2 unchanged.
- Feature226/0+48/0+15/0+clipboard6/0=295; exhaustive default full-output path neutrality1/0.
  Parent132/94,12/36,7/8. Actual100 syntheticOHLC→SMC reads/400 candidates:zero
  changed geometry/configured-policy/evidence and default score/grade/permission;
  zero permitted sub-floor targets, but zero detected-candle positive runner rescues in
  this small census. Named composition fixtures explicitly declare narrative/IO.
- **Twelve fresh engine runs** (both arms) on frozen184695d/primary-M71, four
  defaults+two explicit ladder profiles. Every110 appfile/harness/dataset hash
  guarded. All four full default outputs equal except elapsed runtime:bare36/
  19.4%/−0.2944R/PF0.61;real15n9/22.2%/+0.2222R/PF1.40;native outcomes0.
  No improvement/edge. Optional ladder harness STILL valuesT1 only, not partial/
  BE/runner lifecycle:synthetic61/23.0%/−0.2070R/PF0.64→36/19.4%/−0.2944R/PF0.61
  (**deterioration−0.0874R**);real30/23.3%/−0.0263R/PF0.93→9/22.2%/+0.2222R/PF1.40.
  Cohorts differ/sequential scan, not paired causal estimates; realn9<30/dependent.
- Historical current M78core118/1/M76core33/1 are ENTIRE-object comparator failures
  after intentional M71 newfields/narration; raw failures retained, not weakened.
  Frozen pre-M71 tests119/0 and34/0; exhaustive current-vs184695d validates ONLY
  new RR evidence/narration differences and finds zero other changed paths.
  M78consumers169/0,M77core87/0/cons41/0,M75core41/0/cons57/0; rest in report.
- Four independent stage patches + combined M71 delta/cumulative pristineZIP
  patch guarded in M71-STAGES.json; builders clean apply/reverse/byte proofs;
  package lock untouched; root tradingpro-fixed.zip has110 final application files.
  Archive hash companion evidence/m71/archive-sha256.json deliberately excluded
  from ZIP to avoid circular self-hash. Older stage patches preserved.
- Current preview3000 offline synthetic/localDB /tmp/m71-regressions.db,
  scheduler0/blank remote credentials. Parent3001 stopped; correctly addressed
  API121/0 both, bots204/2 both with17 fills/0 mismatches, unchanged sample floors.
  Initial parent bots URL misinvocation203/3 retained, not valid parent evidence;
  explicit TJ_BASE reruns correct. Smoke22/22,0UIstyle/console errors. No live Yahoo/Turso/Vercel/auth/cron/pixel
  proof. Manual save/journal remains research input, not execution authorization
  or server OHLC validation. Production/chart historical issues stay visible.
- **NEXT M79/M80**, guardrail enforcement/accountable override and dependent
  gates independently scoped/measured; preserve course30 M11, deliberate M103
  n>=5 and all existing risk/grade/narrative/basic-pullback/current-stop policies.

## Historical M78 continuation state — 2026-10-11

- Fixed branch **arena/762c0295-trader**. M78 complete; parent/control **256299e**.
  Read git for exact commit/push status. Ledger **132:74 done/2 partial/56 todo/
  0 no-action**, asserted eight-group partition. M30/M103 partial; M125 TODO.
  User CONTINUE; do not repeat clarifying questions or resurrect70% goal.
- Ep20 10:34–11:48 structural agreement selector; actual entry-TF internal flow
  per03:41/09:01,notHTF/conviction/risk. Historical selector was confirmed(tier A)
  ?sf:ag,notfullRisk. Recovered Ep18 does not establish old personality quotation.
  Free Ep18 causal pullback10:43–12:18 remains; advanced38:25–39:08/44:17–44:39
  restricted/unspecified, NOT invented. Preference vs named basic execution distinct.
- entry-preference.js pure rule: known bullish+long/bearish+short aggressive;
  opposed/ranging/unknown conservative. SMC structure_source stamps actual
  closed window/TF/clock; no structure algorithm change. Missing/mismatched/
  future/forming/truncated metadata cannot be guessed closed knowledge. Appended
  unobserved display candles don't change an already-closed labelled read.
- Candidate/Now/chart/scan/Copy/Save/UI/evidence/notes carry same actual TF/variant.
  Momentum compact projection had dropped new field, caught/fixed by consumer
  tests. CRT preferred field remains projection only; no fallback live order
  from projection. Actual candidates own entry/stop/target/RR/risk. Basic post-shift
  zone pullback/M70 fuel/M75 hierarchy+originalbuffer/M33 narrative+half-risk/
  M54/M77 nearest target/noRRrescue and all existing gates preserved.
- Bounded saved preference validates direction/TF/label/variant/clock and no
  advanced permission; nested/duplicate mismatch refused; key reorder accepted.
  Client consistency, NOT server OHLC replay. No DB column/guessed backfill.
  Old live calibration withheld, no new probability or advanced model claim.
- Feature tests **119/0 vs22/97**,consumers **169/0 vs122/47**;288 assertions is
  not132 ledger findings. Actual100 SMC reads/200 preferences **81 aggressive/
  119 conservative**, trends37 bearish/44 bullish/19 ranging;77 last-break/label
  disagreements. Zero source/oldSMC/oldSetup/future read errors. Composition
  fixtures explicitly declare closed structural labels/pools/CRT context; real
  validator/composer/auth/DB/browser run, not full HTF/MTF OHLC-only discovery.
- **ALL EIGHT profile runs freshly executed**, same unchanged4 real datasets.
  Whole four stdout equal parent except runtime (real outputs byte-equal already):
  bare **36/19.4%/−0.2944R/PF0.61**,real15 **9/22.2%/+0.2222R/PF1.40**;
  native13750/known1006/ready0/outcomes0;real4761/known677/ready0/outcomes0.
  No improvement. Real dependent/n9<30; synthetic distorted; native outcomes0
  precludes calibration/ranking. M75 negative result remains, not tuned away.
- Regressions:M33 67/0,M68 62/0,detector16/0,M70 30/0,M54 54/0,M77 87/0,
  M77consumers41/0,M75stops41/0,consumers57/0,M76 34/0,M21 11/0,M26 49/0,
  reverify67/0,TD77/0,Now50/0,chart36/0,API121/0. Botscurrent/parent204/2,
  current12 vsparent17 fills, both0parity mismatches, same≥20/>20 sample floors.
  Wall-clock/cache dependent API cohorts NOT pinned paired outcomes.
- Initialconsumer164/5 exposed scan missing forwarding; final169/0, noassert
  weakened. Initialparent probe dereferenced absent metadata; fixed test input
  to same declared client snapshot, final122/47. M70initial29/1 unknown observation
  timestamp drift; fixture clock pinned, FULL object equality retained30/0.
  Nowoldpremise44/2→explicitstructure+extra cases50/0. Provider failures before
  offlineenv are retained; offline results do not establish production transport.
  Smoke load21/22→serialized SAME code22/22,zero style/console; both retained,
  canvas seam is not pixel/zoom/pan proof. Historical chart issue remains.
- Current preview3000: offline synthetic/localSQLite **/tmp/m78-regressions.db**,
  scheduler0/blank remote credentials. Parent3001 temporary API control is
  **stopped** after verification. ProductionYahoo/Turso/Vercel/auth/cron unvalidated;
  no credentials modified/rotated/stored. Source guards/results evidence/m78,
  complete report **M78-ENTRY-PREFERENCE.md**;110 guarded app files.
- Durable m78-entry-preference.patch applies on256299e; M78-STAGES.json,
  cumulative pristine patch and tradingpro-fixed.zip rebuilt with clean apply+
  reverse/byte comparison, original lock unchanged. Delta12files/45754bytes/
  SHA935fd68f…67cb73e; pristine39files/541853bytes/SHA4c1b5cc3…7b8133a.
  ZIP110appfiles/byte0. Historical builders are
  source-locked; use latest builder, never run old main() on changed source.
- **NEXT M71**: primary/final RR invariant after existing single-target fixes;
  re-check Ep18 simple2R exercise against Ep20 actual-nearest exits, preserve
  user floors and do NOT manufacture/shrink a2Rtarget. M72 optional/gated,
  M73/M46 inducement open; all56todo+2partial remain. Course30 comparison floor
  and M103 deliberately≥5 detector gate unchanged.

Everything below is historical; current state above supersedes earlier counts,
selectors, branch instructions and next-work prescriptions.

## Prior M76/M75 continuation state — historical — 2026-10-11

- Fixed branch **arena/762c0295-trader**; parent/control **9f629c1**. M76/M75
  complete in this milestone; read git for exact commit/push status.
  Ledger **132:73 done/2 partial/57 todo/0 no-action**, exact eight-group partition.
  Partial rows M30/M103; M125 remains todo. User CONTINUE, no repeated questions.
- **Scope correction from original Ep20 17:48–19:35:** CURRENT protected high/low
  first. Without one, nearer valid older protected boundary/entry-zone edge.
  NOT a universal Math.max/min flip to tighten stops. Same0.18 entry-TF ATR buffer.
- M76 closed physical sweep/reclaim + own observed BEFORE-sweep detector pool,
  actual TF/close availability/lifecycle. Current/future pool may not masquerade
  as old liquidity. Candidate sweep catalogue also uses closed observed view.
  Later wick TAKES old boundary; unobserved future cannot invalidate. Strong/fractal
  alone isn't protected. Unknown stays unknown. Inherited80-bar/top10 detection
  bounds disclosed, no unlimited history or global M30/window fix claimed.
- M75 shared stops.js validates adverse raw+published stop. Named causal sweep/fuel
  or actual ordinary zone/shift association/closed sweeping entry candle owns
  current protection; known invalid/taken causal boundary refuses, no farther
  invalidation rescue. Else nearer valid old protection/zone, zone exact tie.
  Unknown evidence explicitly keeps valid conservative old zone/sweep geometry.
  stopPolicy:'legacy' isolates parent arm; no threshold/RR/target shrinking.
- Candidate/Now/chart/scan/Copy/Save/sizing share chosen stop; source TF/kind/rule,
  base/buffer, institution/pool snapshot and invalidation survive. Named evidence
  and existing signal note persist provenance, no new column/backfill. Save-plan
  bounded metadata/price/entryTF consistency checked, NOT claimed server OHLC replay.
  Browser renders stop policy. Legacy live odds remain withheld. M68 causality,
  M70 actual fuel, M33 narrative/key/one HTF target/half-risk and M54/M77 targets
  plus all gates preserved. No named model borrows MTF ATR/protection.
- Separate measurements: parent9f n30/23.3%/−0.1568R/PF0.78 bare,real15 n8/25%/
  +0.2500R/PF1.40. M76 annotation-only ENTIRE four-profile stdout identical except
  runtime. M75 complete n36/19.4%/−0.2944R/PF0.61 bare;real15 n9/22.2%/+0.2222R/PF1.40.
  Deltas **−0.1376R bare/−0.0278R real**; negative retained, no optimization/edge.
  Real dependent/n9<30,synthetic distorted, grade cuts thin. Fresh parent bare/real
  rerun; prior validated parent native stdout reused (NOT new parent native run).
  M75 native outputs equal M76 IN FULL except runtime:13750 reads/known1006/ready0/
  outcomes0;real4761/known677/ready0/outcomes0. No model ranking/calibration.
- Checks:M76 **34/0 vs5/29**,M75 **41/0 vs4/37** (same annotation-only control4/37),
  consumers **57/0 vs41/16**.132 feature checks is separate from132 ledger findings.
  Raw M76 census100 reads/58 high/67 low/52 intact/73 taken/0 source/legacy/prefix
  errors. Raw M75census100 reads/121 nearer/38 unknown-conservative/1 current/
  1 current-invalid,4 changed stops,1 undefined refused,0 executable wrong-side/
  subfloor. No injected detector facts. Other unit/consumer fixtures explicitly
  declare liquidity/zone/structure seams, physically coherent child/parent bars,
  actual lower sweep validator/composer/auth/DB/JS; not full HTF market discovery.
- M75 first35/6 was direct-fixture kind mismatch, fixed without selector change;
  tiny rounding test strengthened to prove intact/rounding branch. Negatives kept.
  Latest:M33 67/0,M68entry62/0,M70 30/0,M54 54/0,M77core87/0,consumers41/0,
  M68detector16/0,M21 11/0,M26 49/0,reverify67/0,TD77/0,Now46/0,chart36/0,API121/0.
  Matching botscurrent/parent204/2,**12 fills/0 mismatches**,same minimum20 floors.
  Do not use older19-fill counts as current or lower floors.
- Concurrent smoke19/22 (3 incomplete route renders)→serialized SAME script/source
  22/22,0 style/console. No asserts changed. Both logs retained; Segments72-char
  informational line/canvas seam remain. No chart pixel/pan/zoom proof.
- Durable results/source guards **analysis/evidence/m75-m76/**; unchanged4 real
  datasets provenance from previous INPUTS.json. Downloads/transcripts ignored.
  Stage patches **M75-M76-STAGES.json**:M76 on9f,M75 delta onM76,complete on9f.
  Cumulative pristine patch38 app files/521991 bytes,clean apply+reverse+byte0.
  FixedZIP109 app source files/byte0, excludes actualenv/keys/.git/DBs/deps/data.
  Rebuild with build-m75-m76-artifacts.py (historical M54 builder's guard is not
  intended to rebuild changed current source). Geometry snapshots isolated.
- Main preview3000 labelled offline synthetic/local SQLite/scheduler0, current DB
  /tmp/m75-regressions.db. Matching clients blank remote credentials. Production
  Turso/Yahoo/Vercel/auth/401/cron remain unvalidated; no credentials rotated/stored.
- **NEXT M78: internal-structure aggressive/conservative ENTRY selection**, not
  stop-buffer. Preserve current-protected priority/nearer-valid fallback/original
  buffer, causal models/M70 fuel, M33 half-risk/target and nearest/no-RR-rescue.
  Course30 comparison floor/M103 deliberately≥5 detector gate unchanged. Keep
  every57 todo+2 partial visible; no invented70% goal.

Everything below is historical; do not let old counts/scopes/branch instructions
supersede the current state above. Do all work on the fixed session branch.

## Prior M54/M77 continuation state — historical — 2026-10-11

- Fixed branch **arena/762c0295-trader**, `/home/user/Trader`. M54/M77 complete in
  this milestone; read git for exact commit/push state. Control/base **c326651**.
  Ledger **132:71 done/2 partial/59 todo/0 no-action**. Only gen-progress.py writes
  PROGRESS; all132 IDs partition into eight groups. Partial rows are **M30/M103**;
  M125 is TODO (older continuation prose calling it partial was wrong).
- Actual opposing unmitigated/unbreached OB + remaining unfilled-FVG edges join
  liquidity/structure. Nearest BEFORE RR; sub0.9R walls stay visible; subfloor
  refuses, no farther weak/measured rescue. Weak label/exact-price tie preserved.
  Default single target, no fictional two-stage verdict; optional old ladder remains.
- Physical source TF differs from PDH/PWL period TF. Named actual entry TF else
  analysis.tf; ordinary same/one-above legal band rejects missing/mismatched/outside
  source. **1m→5m course-explicit**;3m→5m,5m→15m,15m/30m→1h,1h→4h,4h→1d,1d→1w,
  1w same-only are documented engineering adjacency. Real sources only; no extra
  loader or guessed lower catalogue. Availability/window/forming-bar concerns are
  not universally solved here.
- Ordinary CRT range may compete ONLY in a legal physical band; all HTF tables/
  Momentum crtView are projection-only. **M33 alone** bounded_counter_htf /
  m33_internal_pullback: ONE prescribed HTF zone, unchanged narrative/key and half
  ordinary same-grade/range risk. Missing prescribed target refuses without crash
  or fallback. M68 actual causal entry/stop, M70 extreme/fuel policies stay intact.
- Now/chart/scan/Copy/eligible Save use candidate authority, not projected safer/
  aggressive prices. Honest target TF/kind; stored provenance in existing note,
  not a new target column. New geometry's live/refined legacy odds withheld,
  supplied99% cannot enter a revised signal/Save plan. Browser also guards stale/
  mixed payloads, Mechanics teaser, empty frontier and prediction-disabled reads.
  Browser gets prediction from /analyse, NOT a separate /predict fetch; earlier
  investigation assumption was corrected. Standalone predictor research isn't
  new-strategy calibration.
- RR floor uses min(working,published exact geometry), tolerance1e−9R. True1.999R
  displaying2.00R refuses. Broad M125 outlier-tail finding remains open.
- Separately measured control→M54 additions→complete: bare n24/29.2%/+0.7908R/PF2.33
  →n21/23.8%/−0.2090R/PF0.69→n30/23.3%/−0.1568R/PF0.78. Real15 n10/40%/+0.7250R/PF2.45
  →n7/42.9%/+0.7857R/PF2.38→n8/25%/+0.2500R/PF1.40. Complete-parent **−0.9476R bare/
  −0.4750R real**. Negative retained; differing cohorts/cooldown, no optimization.
- M77 alignment/exact-RR/final defensive stage: entire printed outputs identical
  to complete M54 for all4 profiles except numeric runtime. Native13,750 reads/
  known1006/ready0/outcomes0; real-native4761/known677/ready0/outcomes0. ZERO model
  outcome/calibration sample. Addition-only native profiles were NOT run.
- Final feature checks **M54 54/0 vs21/33**, actual OHLC targets **6/0 vs3/3**;
  M77core **87/0** vs M54 16/71/parent14/73; consumers **41/0 vs4/37**. **188/0**.
  Detector1152 reads/6727 OB/8986 FVG candidates,73/107 respective selections,
  0 lifecycle/source/nearest errors. No injected detector facts. Other fixtures
  explicitly supply structure/CRT REPORT, not native HTF discovery or market edge.
- Final safety corrections independently tested: core82/5→87/0; consumers36/3→39/0
  then41/0. Final headline correction52/2→54/0 with216 comparisons (200 actual SMC
  reads+16 named contexts),0 full-candidate/0 non-headline differences,9 headlines.
  `probe-m54-summary-invariance.js` reconstructs the immutable before source.
- Latest geometry/consumer regressions: Now46/0,TD77/0,chart36/0,API121/0,M33 67/0,
  M68entry62/0,M70 30/0,M21 11/0,reverify67/0 (17198 single/0 multi). Other same-pass
  checks:M68storage46/0 WITHOUT optional migration,detector16/0,M26 49/0,M34 11/0/
  110 neutral isolated builds,M12719/0. Do not inflate counts to older runs.
- Matching current/parent bots **204/2**,19 fills/0 parity mismatches, same minimum20
  sample floor failures. Thresholds untouched. Original smokecurrent19/21 vsparent
  21/21 had current-only live-card failures. Explicit withholding requires marker+
  text+ZERO live cards; retain nonempty assertions. Nextcurrent21/22 revealed a
  hardcoded full-default test: existing n≥10 policy falls back to all on thin full.
  Final current **22/22 (full n7→all)** vs parent with SAME revised test **21/21
  (full n12→full)**; current optional view-switch adds one check. Both0 console/
  style errors. Segments72-char is informational on BOTH, not counted. Negative
  logs/scaffold errors/DB cleanup mismatch/missing-offline error preserved.
- Durable logs/data provenance/hashes: **analysis/evidence/m54-m77/**. Downloaded
  4 native datasets/transcripts remain ignored; re-fetch using existing scripts.
  Stage patches+core/tree hashes **analysis/patches/M54-M77-STAGES.json**. Complete
  measured UI briefly overwritten AFTER its measurement, then restored from
  immutable alignment snapshot; measured core unchanged. Defensive-measured and
  final patches distinguish last headline-only correction. Rebuild generator uses
  fresh scratch trees/durable patches, not already-patched `/tmp` controls.
- Cumulative pristine source patch/fixed ZIP clean-apply/byte-roundtrip0, no actual
  env/credentials/.git/dependencies/data included. See current manifest/report for
  exact byte/SHA counts. Live preview3000 is labelled OFFLINE synthetic/local SQLite/
  scheduler disabled; parent control3001 stopped. Production401/providers/Turso/
  Vercel/auth/cron and chart pan/zoom pixels remain unvalidated. No secrets rotated.
- **NEXT M76/M75**: protected levels THEN nearer valid stop/invalidation geometry;
  separate annotation and stop measurements. Preserve causal named entry, buffer,
  actual sweep/fuel, M33 half-risk, nearest targets/no-RR-rescue and all vetoes.
  **M78 is internal-structure entry aggression, NOT stop buffer.** Keep all59 todo
  plus2 partial visible. Course30 sample floor/M103 deliberate≥5 gate unchanged;
  do not pursue70% through small targets. User skipped clarifications: proceed on
  documented judgment, report exact counts.

Everything below is historical. Older counts, scopes and branch/push instructions
must not override the current state above. Do all work on the fixed session branch.

## Prior M68 continuation state — historical (superseded below/above) — 2026-10-11

- Fixed branch `arena/762c0295-trader`, `/home/user/Trader`. M68 complete; read git for
  commit/push state. Parent/control **663659a**. Ledger **132:69 done/2 partial/61 todo/0 no-action**.
  Only gen-progress.py writes PROGRESS; all 132 IDs still partition into eight groups.
- **M68 is actual causal LTF entry geometry, not just naming.** Same formed/touched MTF
  POI → physical closed LTF sweep → later closed exact shift → causal lower OB or opted-in
  confirmed failed-reaction flip → strictly later midpoint AND entry-price pullback.
  Zone must overlap MTF POI; sweep cannot borrow an old distant touch. Later close-through
  invalidates. Missing ATR cannot borrow a MTF stop. Known failures veto; missing distinct
  layers/unknown formation stay unknown. entryModels:false is research isolation.
- Actual lower loader filters forming/future data BEFORE ATR/SMC. analyse/chart share
  explicit clocks. Named candidate owns entry/stop/target in Now/chart/Copy. Step5 remains
  incomplete until actual model pullback. HTF narrative, defining key, single original
  CRT/M33 target, half counter-risk and M3/M8/M26/news/RR/grade/range guards remain.
- M70 causal extreme preference survives live mitigation; actual later fuel excursion
  widens the stop if farther. Flip stays opt-in. BOS/CHoCH/MSS names are report-only.
- Nullable entry_model/entry_tf/entry_evidence in BOTH signal schema owners/migrations,
  trades normaliser/whitelist/CRUD/close, CSV/JSON round trips, actual bot prefill/modal,
  closed journal/resolved signal model review. Historical NULL/unknown is NOT none.
  No guessed tags/backfill; retagging clears contradictory evidence; below30 descriptive.
  Enum/evidence validation includes actual HTTP cases and two-owner isolation.
- Named live probabilities, legacy refined plans and stored p_win are WITHHELD; no named
  calibration exists. Historical research is labelled as other geometry, not model odds.
- New probes against663659a: provenance **15/0 vs5/10**, composition **62/0 vs12/50**,
  detector entries **16/0 vs0/16**, consumers/storage **47/0 vs5/42**. **140 current checks**.
  SMC discovery census96 reads/277 causal associations/129 flip refs/0 invalid/0 legacy diffs.
  Composition fixtures are explicit structural inputs with coherent complete overlapping
  buckets. Raw lower detector positives inject NO structure/zones/sweeps: MTF context is
  explicit and one final pullback is manufactured. NOT full-method historical discovery.
- Frozen provenance, execution (old persistence tail), complete storage snapshots measured
  separately. Bare60-seed stdout identical except runtime at every stage: n24/29.2%/
  +0.7908R/PF2.33, **blind to named entry context**. Native10-seed default13750 reads/
  known1006/ready0/fills0. Opt-in13718/known912/ready0/same ONE unnamed fallback with M68
  ON/OFF, +22.1135R expiry on synthetic seed10. **Named outcome sample ZERO; no edge/ranking**.
  Persistence-stage default/native/opt-in stdout matches execution except runtime.
  Final-step presentation corrected separately60/2→62/0; candidate differences0/8.
- Latest regressions: TD77/0, Now46/0, chart36/0, API121/0, M33 67/0, M70 30/0,
  M26 49/0, M34 12/0/full110 neutral (explicitly M33 AND M68 OFF), M12719/0 consumer-only,
  M10230/0, reverify67/0. Smoke21/21,0 console/style failures; timed-out command subsequently
  completed, final log read, NOT rerun. Bots204/2: both existing sample floors with14 fills/
  checks,0 parity mismatches. Parent663659a also14/14/0 at same 1h bar clock. No lower floor.
- Authoritative record `analysis/M68-ENTRY-MODELS.md`, BASELINE addition and cumulative
  pristine patch: **34 app files /467534 bytes, clean apply,0 round-trip differences**. Rebuild/check artifact excludes .git, node_modules, data and actual env
  secrets. Never touch the real repo .git or commit credentials/databases/generated data.
- Current live preview is **labelled offline synthetic/local SQLite**, not production data.
  HTTP tests do not validate Vercel/Turso/Yahoo/OKX/auth/cron or the production401.
- Next mechanism: **M54/M77** ordinary target composition/TF alignment, preserving M33's
  sanctioned opposing-HTF-zone exception. Also partial M30/M125; remaining61 todo not omitted.
  Keep every row; measure each fix separately; record negatives. Do not pursue 70% by shrinking
  targets. User skipped questions repeatedly: proceed on documented judgment.

Everything below is historical provenance. In particular old M68-open counts and old
branch/switch/push instructions must NOT override the current state above.

## Prior M70 continuation state — historical (superseded by M68 above)

- Repository `/home/user/Trader`; fixed session branch **arena/762c0295-trader**. Never
  execute old branch/switch/push instructions below. Latest milestone closes **M70** (M68 prerequisite), following **M33** and
  dependency findings **M130/M131/M132**. Parent control is **5b942cf**. Tree/commit state must be read from git.
- Ledger: **132 rows;68 done/2 partial/62 todo/0 no-action**. PROGRESS.md is generated
  only by `gen-progress.py`, whose groups remain an exact anti-omission partition.
- M33: a confirmed MTF internal break may originate a bounded counter-HTF execution,
  but HTF narrative/held daily bias do not flip. Actual MTF OB touch now, LTF sweep THEN
  shift, nearest HTF opposing-zone target, half ordinary same-grade/range risk. One target
  even with ladder requested; reached target completes it, no farther replacement. Old
  zones proven obsolete BEFORE this leg are ignored, not mistaken for its target.
  Legacy HTF-CRT priority and M3/M8/M26/RR vetoes remain. M68’s lower-entry-zone work
  remains OPEN: this change deliberately inherits the existing MTF entry-level selection.
- New half-risk helper also fixes the existing counter-CRT promise when conviction=A;
  its confirmed safer entry remains unchanged. Tiny0.005% is not rounded up to0.01%.
  Counter metadata+conflicts survive Momentum’s explicit-field map. analyse/chart/scan
  preserve narrative and original anchor; Now/chart/Copy/saved target prices match.
  Legacy p_win is withheld for the new model, not invented as calibration.
- M130 fixes M50’s actual moving-key bug (confirmed0/4 old anchors retained;0/4 breaches
  released ->4/4 each). Shared nextBiasInvalidation lifecycle; check breach before
  agreement. Same-direction reset is reported; original anchor frozen until reset.
  Existing corrupted historical keys cannot be reconstructed. Server and --bias held
  harness now share this policy; the old harness even selected the key from FRESH sign
  while holding the opposite one.
- M131 fixes higher-feature lookahead in independent harness. actual last_t/causal
  selector, prefix oracle+future perturbation test19/0 (old5/14,9/12 leaking decisions).
  **Prior contaminated backtest figures must not be performance evidence.** Default
 60-seed output stays n24/29.2%/+0.7908R/PF2.33; below30 and blind to topdown. Neither
  invariance proves no leak nor this number proves market edge.
- New --topdown harness: native5m ->complete calendar15m/4h, observed complete higher
  buckets, actual TD/alignment/held bias/Setup, final method-permitted entries only.
  --no-countertrend isolated old arm. At20 seeds x1500:27500 reads; ON657 counter
  contexts,562 complete,0 ready/fills; OFF0 contexts/fills. All657 missed current POI,
  32 phase waits,648 lower waits (overlap). **No sample, no ranking, no gate loosening.**
  Native REAL inputs supported ONLY at5m; do not interpolate lower bars from15m.
- M132 fixes unused clearWorkspace helper: indirect rule/strategy ownership joins,
  schema-discovered directly user-scoped tables, one atomic batch. Tested two users
  with FK ON/OFF24/0 versus old2/22; global presets/market bias preserved. No new route,
  no actual workspace was erased. Discovered by the isolated M33 cleanup fixture.
- New probes: **M33 67/0** (pre-M33 snapshot21/30), **M13042/0** (cefa4db8/25),
  **M13119/0** (M130-only snapshot5/14), **M13224/0** (old2/22). Fixture now lives in
  app scripts/fixtures so standalone restored app tests do not depend on analysis/;
  analysis/helpers just re-exports it. Rebuilt Ep11 diagnostic uses explicit confirmed
  structural inputs; old slope-only walk was ranging/ranging and its old grade-based
  sole-blocker examples were invalid.
- M70: shared Setup.selectZone selects the unmitigated geometric extreme over an
  overlapping opt-in flip, even when a stronger third non-extreme OB ranks first.
  Known failed-reaction fuel must be swept after flip formation with a close-back;
  unknown remains unknown (M8). Rule/fuel price/type/sweep time survive in levels.
  M47 stays opt-in. M48's historical annotation-only/rejected gating decision is
  unchanged by THIS selector: M68 must qualify causal named flip entries honestly.
  Probe30/0 vs parent16/14.60-seed bare default entire output identical except runtime.
  Separate --breakers arms: parent n55/+0.0303R/PF1.06 -> preference-only
  n55/+0.0219R/PF1.04 -> complete preference+fuel n53/-0.0278R/PF0.95.
  **Both changes worsen synthetic expectancy; fidelity, not market edge.** Early
  incomplete draft54/+0.0493R must NOT be quoted as complete fix (missed third-OB case).
  Tracked measurement-only preloader: analysis/helpers/m70-preference-only.js.
- Verified latest suites: API121/0,chart36/0,Now46/0,topdown77/0,bots204/2;
  smoke21/21,0 style/console errors. BOTH bots failures are filled sample11 against
  unchanged >=20 / >20 floors;0 parity mismatches. Parent5b942cf also fills/checks11
  at same clock,0 mismatches. Do not lower sample floor or call this an M70 regression.
  Prior milestone’s20-filled result is clock-dependent history, not current numbers.
- Old topdown test76/1 on SAME parent/current: ordinary-only text regex rejects M33's
  equally explicit non-averaging counter note when synthetic bars activate that branch.
  Branch-specific exact-contract assertion restores77/0 on current AND parent.
  Production notes/direction unchanged; no assertion just removed or loosened.
- Run DB-writing suites API/bots/smoke serially; latest source server restarted, labelled
  synthetic candles, local SQLite. This does not validate production401 or live feeds.
- Latest narrowed fleet green, reverify67/0; prior milestone’s full fleet is historical. M41 cost gate CPU-sensitive:233ms idle (<250 unchanged).
  M34 turns ONLY M33 off to isolate dead-layer neutrality (110 results unchanged).
  M127 uses its original29fa456 negative control; normalizes ONLY M69’s known neutral
  prose rewrite in full candidate comparison (0/920 remaining changes). M69 tests its
  new accurate label/event wording. BOS/CHoCH/MSS taxonomy stays report-only (groupB).
- Controls: M12729fa456; docs/clock probesb7ec114; M130cefa4db; pre-M33/M132=cefa4db
  plus separately measured M130/M131. Temp controls/node_modules may vanish on reset.
  Run candles-yahoo WITHOUT TJ_OFFLINE_CANDLES (fetch is stubbed); API-backed probes
  need the flag and a restarted server. Preview uses labelled synthetic candles only.
- M68 researched only, no causal composition/persistence edits shipped. Ep18:
  MTF POI mitigation -> LTF sweep -> confirmed shift -> wait for the causally linked
  LTF OB mitigation (market_shift) or confirmed flip-zone mitigation (flip).
  No pullback = no trade. Explicit OB->break identity absent; strongest-first OB
  dedup may discard displacement associations. Flip detector doesn't expose its
  matching break identity and generic retested may precede confirmation. Add causal
  provenance/tests, then actual distinct levels/consumer forwarding and journal
  entry_model column, CRUD/import/export/modal/model-review. Missing historical tags
  stay unknown, not retrospectively guessed. Existing M33 fixture has empty LTF OBs;
  extend it coherently, never treat old MTF entries as proven LTF model executions.
- Next: remaining **62 todo**, in mechanism order. High-related work **M68** (named
  entry models and actual LTF entry zones), **M54/M77** (ordinary target composition/
  explicit TF constraint, preserving M33’s sanctioned counter-HTF exception); also the
  two partial rows M30 and M125. Keep every row, measure separately, record negatives.
- Cumulative source patch: **31 files**, clean apply, **0 round-trip differences**.
- Rebuild cumulative source patch from pristine zip + app overlay, excluding .env,
  data,node_modules,.git; explicit scratch git identity; second-pristine clean apply
  and ZERO round-trip differences. The pristine zip contains an old .git: exclude it
  from SCRATCH unzips before git init (otherwise an embedded gitlink yields an empty
  diff). Never touch the real repository .git. Preserve credentials/database/fixtures untracked.

The original handoff is retained below as provenance, not as the current branch/state.

---

> Copy everything below the line into the new chat as the first message.
> It is written to be self-contained: it assumes the new session has read nothing else.

---

You are continuing a long-running audit and repair of the repository `Baatinarolu/Trader`,
checked out at `/home/user/Trader`. Read this whole message before doing anything.

## 1. What the task is

The original request was: **"Analyze the whole zip file"** (`/home/user/Trader/tradingpro-main.zip`,
11,428,946 bytes, root folder `tradejournal/`). That produced `ANALYSIS.md`.

It then grew into two things that are still live:

1. **Audit whether the bots faithfully implement the course they claim to encode** — the *free
   Market Mechanics Mentorship* playlist by Brad Goh / The Trading Geek: the 5-step CRT top-down
   process, SMC primitives, the sniper entry, the no-trade rules, killzones, risk. Every mismatch
   found is recorded as a numbered finding.
2. **Fix those findings.** All 119 are to be covered, nothing omitted. The user explicitly
   authorised working in whatever order suits, provided nothing is skipped.

## 2. Exact current state (verified, not remembered)

- Branch: **`arena/0f969311-trader`**. HEAD: **`33eb20d`** "Restore the full audit…". Base: `96ef0ee`.
  Working tree **clean**. One commit ahead of base.
- **`origin` push is not available from the previous session** (it was closed). The very first job
  in the new session is to `git push origin arena/0f969311-trader` — everything is committed locally
  and nothing is on the remote yet.
- Ledger: **119 rows (M1–M119), strict 1..N, 0 malformed, 0 NUL.**
  Status: **36 done · 1 partial (M30) · 81 todo · 1 no-action (M3)**.
- Source patch: **11 files, +788 / −93** (`analysis/patches/applied-so-far.patch`), verified to apply
  cleanly to the pristine archive and to reproduce the working tree byte-for-byte.
- Current measurement baseline ("**Baseline 6**"):
  `60 seeds: n=122, win 18.9%, exp −0.0011R, PF 1.00, A+ n=15 +0.1355R`
  `120 seeds: n=256, win 19.1%, exp −0.1716R, PF 0.76, A+ n=35 −0.0684R`

## 3. The files that matter

| Path | Role |
|---|---|
| `analysis/MISMATCHES.md` | **The primary artifact.** 119 findings. Each row has exactly **7 cells**: `#` · Sev · From · What does not match · Change/add · Status (indices 1–6 after `split('\|')`). |
| `analysis/PROGRESS.md` | Generated **only** by `python3 analysis/gen-progress.py`. Never hand-edit. It exits non-zero and writes nothing unless groups A–G partition the ledger. |
| `analysis/EPISODE-AUDIT.md` | Verbatim course quotes for episodes 0–33. Consult this instead of re-fetching transcripts. |
| `analysis/patches/applied-so-far.patch` | Cumulative source patch. Regenerate by diffing `/tmp/pristine/tradejournal/src` against `extracted/tradejournal/src`. |
| `analysis/harness/backtest.js` | Backtest. Flags: `--seeds --bars --window --swingmode local\|bos --no-nested --ob-fvg --all-swings --breakers --stand-down-wall --ladder`. |
| `analysis/harness/BASELINE.txt` | Every measurement, **including the negative ones**. Baseline 6 is current. |
| `analysis/probe-*.js` | Verification probes (see §6 for which need which CWD). |
| `analysis/playlist-verified.json` | Playlist order. Note `ep` is a **string**. |

## 4. Environment quirks — these have all bitten already

- **`extracted/` is gitignored and gets wiped between sessions.** Always
  `ls extracted/tradejournal/src` first. Rebuild with:
  ```
  cd /home/user/Trader && mkdir -p extracted && cd extracted
  unzip -q -o ../tradingpro-main.zip
  cd tradejournal && npm install --no-audit --no-fund
  git apply ../../analysis/patches/applied-so-far.patch
  ```
  Also rebuild `/tmp/pristine/tradejournal/src` from the clean extraction **before** applying the
  patch — it is the reference for patch regeneration and verification.
- **The real file is `src/bots/setup.js`, not `src/setup.js`**, and `src/bots/smc.js`, not `src/smc.js`.
- **Tests live in `scripts/`, not `test/`.** Run `npm run test:now` and
  `node scripts/api-test.js http://127.0.0.1:3000` (URL passed as argv).
- **Restart the server after any `src/` edit before running `api-test`** — a long-running server
  keeps stale code. Use the process tools, not `nohup … &` (that times out at 120 s).
- **Probes are CWD-sensitive.** The four `setup.js` probes must run from `extracted/tradejournal`;
  the newer ones from the repo root.
- **Test scripts can exit 0 while printing `MODULE_NOT_FOUND`.** Parse stdout, never trust the exit code.
- `bc` is not installed. `sed -i` breaks on unescaped parens — use `python3`. Chain with `;` not `&&`
  (later greps otherwise run from the wrong directory).
- **Live candle fetching fails in the sandbox** (per-session SNI allowlist: DNS and TCP succeed, TLS
  resets). This is *not* a blanket no-network condition, and it is *not* a code defect — the same code
  path worked in the session where the user originally built the project. Never claim the code is broken
  because of it.

## 5. Decisions the user has already made — do not re-ask

| Item | Decision |
|---|---|
| **M95** | Keep grades **B and C tradeable**. |
| **M21** | **Add** strong/weak structure. |
| **M9** | **0.5 %** default risk, **1 %** behind a manual unlock. |
| **M16** | **Require an order block.** A standalone FVG no longer passes the POI gate — but entering on OB mitigation *with no FVG* stays allowed. |
| **M1 + M22** | **Adopted as engine defaults** (`swingMode:'bos'`, `nested:true`). |
| **M32** | **Stays opt-in.** It cuts trades 190 → 18. |
| **M47** | **Ship the bug fix, keep the wiring opt-in.** |

## 6. Rules earned the hard way — obey these

- **`node --check` verifies nothing about execution.** After any edit, run the real entry point once
  before measuring. A `ReferenceError` on first call has already happened twice.
- **A classifier returning one value across the whole sample is broken**, however plausible the logic.
  Always print the split at the sample size you intend to report. Print distinct-value counts to prove
  a new term discriminates.
- **A probe that reports zero on *both* arms is a broken probe, not a null result.** Twice now a probe
  silently measured nothing — once because it ran outside a killzone, once because it compared against
  the candle close instead of the entry price (841 false violations).
- **Check the input before reporting the output.**
- **Never report a grade cut from a small sample.** A "+0.1164R at n=16" became "−0.4907R at n=52".
  Anything under ~100 trades is noise. Verify across at least three sample sizes.
- **When you change a decision, re-read every string and field that describes it.** This has caused
  four separate defects: a refused setup that advertised itself as tradeable, `kind:'order_block'`
  hardcoded over a flip zone, an `entry` taken from a field the object does not have, and a
  `partial_at` emitted for a single-target trade.
- **Grep every `.map(` that reconstructs an object** — new fields get dropped there.
- **Ledger edits are fragile.** Parse cell 1 and assert the row was found (IDs are *not* uniformly
  bolded). Count cells (`== 8` after split) before writing — the `Change/add` column has twice been
  split into two. Restore the `\x00` sentinel across the whole rejoined line and assert NUL count 0
  after every write.
- **A backtick inside a SQL comment breaks the schema** (`db.js` splits on bare `;` inside a template literal).
- **Never trust a remembered line number** — verify with `sed -n 'Np'` / `grep -n`. Roughly ten cited
  line numbers were wrong.
- **A feature can sit marked "APPLIED" while its code path is dead.** See §7.

## 7. The single most important lesson from the last session

**M21 was marked "applied" and was silently dead.** `targetPools()` deliberately puts the weak
structural extreme first ("target weak structure"), but `setup.js` then ran
`targets.sort((a,b) => a.rr - b.rr)`, which undid it. The weak extreme only led when it happened to
be nearest — **77 of 1174** eligible candidates. It looked fine because the old three-rung ladder
could surface it in *any* rung and the probe accepted `targets.some(kind === 'weak_structure')`.

**So: re-verify the other rows marked APPLIED before adding new work.** Several were verified only by
a probe written in the same pass that wrote the code. The check that matters is not "is the value
computed" but **"is the value actually consumed, and does it survive to the output"**.

## 8. Historical next steps (superseded by current M89 section)

1. **Obsolete historical push instruction.** This session is fixed to `arena/762c0295-trader`; never push another branch. Current source/delivery state is in the leading M89 section.
2. **Re-verification sweep** of the 36 APPLIED rows (§7). Highest value item outstanding.
3. **M52** — mid-range risk reduction. Course: *"if it's mid-range… reduce your risk, use a smaller
   position size."* `riskPct` is a constant from the request context, never scaled by range position.
4. **M50** — bias hysteresis. *"Your bias only changes when your invalidation is hit."* Needs a state
   store; `align.bias` is re-derived from scratch every call.
5. Then the remaining ~81 todo rows, in mechanism order.

## 9. Verification before you call anything done

```
cd /home/user/Trader/extracted/tradejournal
for t in probe-batch0 probe-m58-grade-sizing probe-m21-strongweak probe-groupa-vetoes \
         probe-groupb-structure probe-m36-scale-in probe-m57-compliance \
         probe-m69-market-shift probe-m38-m40-affinity probe-m37-killzone-offsets; do
  printf "%-26s " "$t"; node ../../analysis/$t.js 2>&1 | grep -E "passed" | tail -1; done
npm run test:now
# restart the server, then:
node scripts/api-test.js http://127.0.0.1:3000
cd /home/user/Trader && node analysis/harness/backtest.js --seeds 60 --bars 1500 --window 300
```

Expected green, **re-measured 2026-10-10** after M37/M38/M40/M57: batch0 **11/0**, m58 **23/0**,
m21 **10/0**, groupa **18/18**, groupb **10/10**, m36 **17/17**, m57 **6/0**, m69 **16/0**,
m38-m40 **49/0**, m37 **20/0**, now-test **36/0**, api-test **121/0**, bots-test **204/2** (the two
sample-size gates), chart-test **36/0**.

The old figures in this list were stale in two places and are worth naming so the next reader does
not chase them: batch0 was **10/10** and m58 **20/20**. batch0 went red at M69 (`5a08ba6`), which
rewrote the structure checkpoint's detail string from *"Structure reads bullish after a BOS up 4
bars ago"* to the market-shift wording; the probe kept asserting the old text and nobody re-ran it.
It is re-pointed now (and gained one assertion, so 11 not 10). m58 grew to 23 as its own row was
extended.

The backtest line below was also stale. `--seeds 60 --bars 1500 --window 300` currently reproduces
**n=27 / win 25.9% / +0.5918R / PF 1.93**, not **n=122 / −0.0011R / PF 1.00**. n=27 is below the
course's own 30-trade floor, so this arm is a REGRESSION GATE (does the number move when it should
not?) and not a performance claim. For a sample above the floor use `--seeds 200`, which after M69
gave **n=101 / win 24.8% / +0.0357R / PF 1.06**.

## 10. Standing instructions from the user

- Keep a running list of what does not match and what needs changing or adding.
- Derive scope from the transcripts, never from your own sense of clean layering.
- **Measure every change separately so it can be attributed.**
- Do not leave anything out.
- Cite the pristine-zip diff when defending what was and was not changed — never assertion.
- **Record negative results.** Four items (M44, M48, M32, M43) measured no better as enforced gates
  and were recorded rather than quietly dropped or quietly shipped. The course's rules are
  consistently right about *what to look at* and consistently not better as hard filters on synthetic
  data. Say so plainly rather than dressing it up.

## 11. Loose ends worth knowing

- **Seven bonus/tool videos were never read:** `iKRW0G6yPmM` (LIVE), `cFzxyGRtAis`, `kJWmeSLfP64`,
  `EsVHKs24qBI`, `vU16QHmX3x4`, `3_QR4XFVbKE`, `AVS6QneKmAA`.
- The course is **internally inconsistent** on max daily profit (5 % in one episode, 1 % in Ep 31) —
  that annotates M94, it is not a new finding.
- `predict.js` has `/^[A-Z]{6}$/` → `pip_size: 0.0001`, which is 100× wrong for JPY pairs.
  **Reachability unverified.**
- `rr_final` is frequently degenerate — median 15R, max 346R on single targets, worse on the ladder
  (median 45R). Pre-existing, not yet a ledger row. It undermines all "declared R" reporting.
