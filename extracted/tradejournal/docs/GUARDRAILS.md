# Personal guardrails, recording and reasoned exceptions

## M87 visual journal scope (2026-10-11)

HTF/MTF/LTF optional human chart refs have owned separate saved-record APIs,
explicit frames and revisions. Images never grant entry, complete core writing
or routine, determine execution/setup grades or change risk sizing. No cap,
loss-writing/cooldown, streak, first-admission/on-time or technical-veto refunds
from image updates/deletion/import. Financial truth/close remains legal even if
the optional evidence store is missing; stored prior image/context/time survives
financial correction with a warning, not a fake fresh recording.

Attachment/import time NOT capture time, labels NOT verified chart/broker/live
emotion facts. Imported refs explicitly historical/unverified; source/capture
claims/owned revisions not replayed. Missing/corrupt stored metadata unavailable,
not assumed skipped or complete; reused images/equivalent frames flagged rather
than3 independent views. Unsafe legacy remains stored/unassigned but is not
rendered/copied into portable backups; server never fetches external image URLs.

Historical M87 delivery: M88/M89 were then TODO (now applied); M106/M111/M112 remain TODO, M108 PARTIAL. Historical132=90done/3partial/39TODO;
course floor30, deliberate M103 n>=5, B/C tradeability, checklist/entry weights,
stops/targets/geometry/RR/default risk/factors untouched. No70% edge, provider,
broker, actual meditation/human or production claims. See report in delivery ZIP.

These rules govern **this app's prospective trade/plan actions**. There is no broker
connection: an app admission is not a broker order, reusable permission or proof
that manually entered levels currently match the market.

## Select a cap before the rule day

In **Settings → Accounts**, choose `max_trades_day`. The default is **3**. The
course advises roughly **3 intraday / 5 scalping** (also a 2-entry example); those
are guidance, not a universal maximum. The app accepts integers **1–100**.

The first guardrail check/admission freezes that account's cap for the **UTC rule
day**. Editing the setting afterward selects the next day's cap, not more entries
for the current day. Historical profitable-day counts are suggestions only and
cannot raise the operative cap automatically. This is **not user-timezone rollover**.

## Optional realised daily profit stop (M81)

In **Settings → Accounts**, explicitly enable the daily profit stop and choose a
positive percentage (app range **greater than 0 through 100**). It is **Off / NULL
by default**, including existing accounts. Ep31 calls it completely optional; the
course gives several examples (1%, 2–3%, 5–10%), not one universal default.
The separate `profit_target_pct` remains the **lifetime / prop-firm objective**.

Like the trade cap, the profit choice freezes on its first scoped **UTC rule-day**
check, including an explicit OFF choice. Later enable/disable/percentage edits
apply on a future day's first check, not retroactively today. Dashboard/Corrections
show the operative frozen choice; Settings shows the saved choice. In an upgraded
legacy day, the old cap/clock are retained, but the NEW profit policy is selected
once on its first post-upgrade check. No past profit selection is fabricated.

The amount is **UTC day-start realised journal equity × chosen percentage / 100**.
Equity is starting balance plus net P&L closed before UTC midnight; today's gains
and floating/open P&L do not move that denominator. Only known closes at/before
the server clock count on their **close day**, including overnight positions.
Example: starting10,000 + prior closed500 =10,500; a1% ceiling is105.

The inclusive stop compares the **unrounded stored net-P&L sum** against the amount,
not the UI's rounded display:104.9999 displayed as105 does not reach105. These are
the app's existing libSQL REAL / JavaScript number representations, not a new
arbitrary-precision accounting engine. If enabled, missing close dates/net P&L,
invalid selection metadata or an unverifiable/underflowed amount fail closed;
a reason cannot repair unknown data. Truthful repairs/record-only history remain
possible. OFF preserves legacy older-undated handling rather than imposing a
new universal profit rule.

An observed profit ceiling **latches until UTC rollover**, even after winners are
corrected/deleted or the future setting is disabled. The existing one-action,
reasoned exception and day-review history apply; they do not create a reusable
permit or a broker order. The server rechecks each prospective action.

## What stops a prospective action

- The preselected daily entry cap, including open positions and reopen attempts.
- The optional daily realised profit ceiling, if explicitly selected.
- The existing consecutive-loss/day-realised-loss limits. Percentage loss uses
  starting balance plus P&L closed before the day, not floating P&L.
- The existing **30-minute** post-loss cooldown (the course says at least 10).
- The next **full entry-timeframe candle** after a loss. Its exclusion ends at
  `ceil(loss_time / bar_duration) * bar_duration + bar_duration`. A loss exactly
  on a boundary belongs to the candle that just closed. This is a server-clock
  boundary, **not confirmation from a live market feed**.
- An unavailable account/history/rule state: it grants no permission and cannot
  be reason-waived. A supported entry TF is required after a recent loss.

Supported TFs: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1wk`. The two-week
missing-TF lookback and treatment of older undated closures are implementation
policies, not durations quoted from the course. A closed-today record with an
invalid close timestamp, or non-positive day-start equity, makes permission
unavailable until repaired.

## Honest corrections do not replenish admissions

Successful new entries/reopens and their counter update share one database WRITE
transaction. Admission records have **no journal-trade foreign key**. The observed
entry count is a monotonic floor; observed day cap/loss/profit/streak stops last until UTC
rollover. Previously observed loss timestamps still drive cooldown/candle expiry,
including across midnight.

You can correct dates/P&L, close, or delete journal rows. The corrected journal
truth remains visible, but it does not erase a stop that the app already observed
or refund a server admission. A stopped entry can proceed only as the separately
recorded, fresh reasoned exception below. Time stops still expire at their actual
boundaries; they are not permanent day locks.

Saved/copied plans are not executed positions and do **not** consume a trade-entry
slot. Their current personal-rule check is action-scoped and cannot be reused as a
later trade permit. Every prospective trade/reopen is checked again server-side.

## Reasoned exceptions

A **known** stop gives an explicitly gray, reason-required action. Its dialog shows
the violated rules; blank/whitespace reasons cannot confirm, and Cancel writes
nothing. An **unknown** state disables prospective actions instead.

The server accepts plain text up to **2,000 submitted characters**, trims it, and
records the reason with the fresh stopped snapshot and linked action in one
transaction. Failure to persist the audit rolls back the action. The exception
applies to that one action only, cannot waive a technical candidate veto, and
cannot unlock the rest of the day. An unnecessary reason submitted while clear
is not falsely labelled an override; an invalid/no-op plan grants no permission.

## Recordkeeping is not permission

Use **Record only** for an already-executed open position. Historical closed
entries, closes, corrections and imports remain recordable, including during a
permission-read outage. A record-only write has no prospective permission. JSON/
CSV imports carry no invented historical admission or violation snapshot.

Use **research-only** for a retrospective plan. Legacy rows keep NULL admission
provenance: migration does not guess whether old trades broke rules. Where a
historical write captures a rule snapshot, it is explicitly **recording-time state**,
not an inferred entry-time violation.

Day review displays immutable observed rule details, blocked attempts and override
reasons, scoped to user/account/UTC day. Deleting trades or changing settings does
not rewrite those captures. An empty history does not prove past compliance.

## Streaks do not rescale the risk unit (M82)

Coach briefing no longer multiplies risk by0.6 after three losses or0.9 after four
wins. The after-two-losses insight no longer offers25% sizing as an alternative
to the stop. Streaks remain visible, and the **consecutive-loss STOP/cooldown and
fresh admission check remain enforced**. Recent results are not next-trade odds.

The existing M9 base-unit clamp also governs advisory reads:0.5% default/locked,
manual maximum1%, existing base floor0.25%. The new-account form displays0.5%,
not a1% value silently clamped by the server. Reading a legacy risk value does not
rewrite it. Existing engine/checklist grade sizing is unchanged (A+/A×1, B×0.5,
C×0.25); **no automatic A+ doubling** is added by a streak fix.

Ep21 explicitly permits drawdown reduction/pause, so the old claim that all
"drawdown sizing is forbidden" was overbroad. Separate legacy Coach drawdown/day-loss
adjustments stay unchanged (−3%→0.75, −6%→0.5, down>2% today→0.5; compounded).
Those coefficients/thresholds are existing **app advice**, not exact course
prescriptions and not the engine's grade sizing. Dashboard labels the base unit,
advisory adjustment/loss budget and live personal state separately. Advice is
**not entry permission** and cannot clear a stopped day.

## Optional manual session-duration warning (M84)

In **Settings → Accounts**, choose whole `max_session_minutes` from1–1440, or leave
it OFF/NULL. That range is app validation. Ep22's "two hours" is an example, not
an imposed default. Dashboard and Corrections expose **Start manual marker**,
**End manual marker** and **Recheck session time**. This measures only server-clock
elapsed time since your own start click, **not actual broker/chart screen time**.

Starting freezes the selected duration. Repeated starts, a larger saved duration,
OFF edits and same-UTC-start-day end/restart do not replenish the old marker. An
ongoing marker survives midnight and warns inclusively at its chosen minute.
Explicit end preserves the start/duration/end history; a later UTC start day can
start a genuinely new marker after ending the old one. An unstarted/invalid marker
is unknown elapsed time, not zero. Recheck updates the displayed server state.

This is an **optional advisory warning**, not an extra execution veto. It neither
waives nor resets admission counts, profit/loss/streak stops or cooldowns. You are
responsible for the selected session ceiling outside the app; no broker is connected.

## Mandatory post-loss writing and core journal completeness (M85)

A prospective new entry/reopen requires an explicit nonblank named emotional state.
It is input capture, **not the four-question calm/clear state gate** (M106) or verified
M89 app-record/first-response timing (not broker-time emotion verification). Already-executed/open/historical truth can be
recorded even when the state was never captured; do not invent an emotion afterward.

Closing a position is **never refused because reflection is missing**. The actual
trade form saves the close and immediately prompts for core journal writing:

1. **What happened?** (`execution_notes`)
2. **Which rule/mistake?** (`mistakes`), OR explicitly **"followed plan, nothing to
   note"** (`mistakes_none`). Blank is not a clean record; both choices conflict.
3. **What would you do differently/repeat?** (`lesson`)

Name the entry/exit emotional states too. If entry state was not recorded, say so
honestly; the review does not pretend a reconstructed state was captured live.
Each line is plain nonblank text up to2,000 submitted characters; emotional state
up to100. Arbitrary types, contradictory none/mistakes and future/unknown actual
close results cannot be completed. No automatic grade/adherence/P&L rewrite occurs.

An explicit **Complete core journal** action records server acknowledgement and a
fingerprint of the current relevant facts/text. Changed review facts require a new
acknowledgement; an unrelated note does not. Legacy populated notes get **no invented
review timestamp**, and winning/P&L/A+ grade or a saved daily notebook is not a
completed trade journal. A grey **Journal missing** marker and **journaled / closed**
count are visible in the log and UTC day review, including days without notebook
entries. Empty0/0 is "empty", not "complete".

Known losses closed on the current UTC rule day require this writing before normal
next-entry permission, **in addition to** the existing30-minute/full-next-candle
pause. The observed loss is stored independently of the editable trade: truthful
correction/deletion cannot silently erase its pending reflection. Dashboard/
Corrections/day review retain a **Write reflection** action even after the trade was
deleted. Resolving that captured writing does not recreate a trade, consume/refund
an admission, or clear another cap/loss/streak stop. Writing resolution survives a
fresh process. Past-day pending writing stays inspectable, but is not a new-day
reflection veto; a midnight-crossing loss cooldown still follows its original clock.

Known exceptions continue under the existing **one-action typed reason** rule. An
exception does not mark writing complete or unlock subsequent actions. Unknown/
corrupt writing/result state cannot be reason-waived; truthful record-only writes
and repairs remain possible. Independently known legacy cap/loss-clock observations
are retained even while the new writing state is unavailable.

**"Core complete" is deliberately scoped to the fields above.** It does not claim
all course screenshots/confluences/timing/routine/state checks are implemented.
M87/M88/M89 are separately implemented evidence scopes; M106 and all other unresolved findings stay visible. M94 is now separately implemented with the actual M64 workflow; core trade writing alone does not satisfy it.

## Pre-market routine and daily preparation evidence (M14/M64/M94)

The **Routine** header button and account rules choose an explicit local HH:MM
window, IANA timezone, lead1–180 minutes (default60) and `ep17` or
`meditation_first` order. Default account/legacy hour and timezone are NULL:
setup-required is a **known preparation stop**, not an invented broker session.
An active cycle freezes its local/UTC date, policy, reset/window/next-reset,
server selection and steps until its saved expiry. Changes apply after that;
a midnight UTC rollover is not necessarily the local reset. DST folds select
the earlier occurrence; a missing civil clock shifts forward by the gap.
Invalid/future/contradictory stored metadata cannot silently create a replacement
known cycle. Broker hours and allowed-hours enforcement are separate/open.

Ep17 default: **calendar → own plan → charts/bias/alert → meditation → morning
check-in**. Calendar is actual human external-review acknowledgment with text,
never machine/live-feed no-news clearance. Plan snapshots the owner's selected
playbook at server acknowledgment, or their explicit manual plan text. Charts/
range, daily bias and set/not-applicable alert explanation are human reports,
not OHLC or broker-order authority. A checkbox cannot complete the whole routine.

The meditation step requires15 minutes of server **running time**. Start/resume
set the server clock; pause freezes accumulated active time; paused gaps do not
count. Completion rechecks actual duration transactionally, not a client clock/
elapsed flag. A running timer survives process/page closure; it does not verify
actual meditation, breathing, focus or mental state. Out-of-order and stale-cycle
submissions are refused. The explicit meditation-first variant keeps the other
known Ep17 steps: only1/6 bonus was captured, so its remaining sequence is not
claimed. Every workflow ends with FOUR literal human morning answers: calm,
clear, following my plan, would take it if already up big. “No” attempts persist
but do not finish; these are not M106's fresh in-session/per-entry questions.

The shell-owned banner persists across pages until all current steps are
acknowledged. It polls server state, reappears at the saved reset and cannot reuse
an older account's async response/completion. Unknown read/clock/step data stays
visible and **unwaivable**. Setup/incomplete is a known personal stop, with the
existing **fresh one-action typed reason**. A reason neither completes steps nor
unlocks the next action/technical veto. Routine completion resolves only its own
stop; it never refunds independent trade/profit/loss/streak latches or loss clocks.
Even the first check that finds routine uncertainty retains known old observations.
Truthful closes/corrections/deletion/record-only/import/history remain legal.

### Daily facts and descriptive comparison

The existing shared one-note-per-user/day notebook has nullable `pre_market_done`
with source/capture time. Independent user/account/UTC-date self-report rows avoid
colliding account flags. Automatic workflow facts are separate: Journal shows
current completion, deadline/on-time status and a frozen **first actual executed
trade admission** observation. Saved research plans/blocked attempts/record-only
imports do not create such execution facts. This observation has no trade foreign
key, so honest trade deletion/correction cannot erase or reclassify it. It commits
with the actual entry; capture failure rolls back the trade/admission together.
Later completion—even before the window—and manual true cannot rewrite an earlier
not-prepared entry. Current workflow-done can therefore be true while prepared is
false. Unrecorded/unknown is never automatically skipped, done or backfilled.

The Journal comparison groups **UTC close-day realised daily P&L**, not trade-
weighted means or floating P&L. First-executed-admission evidence takes precedence,
otherwise selected-window deadline workflow, otherwise labelled self-report or
unknown. Before an unfinished deadline with no entry, preparation is unknown.
Missing net P&L makes that day unavailable, not zero; known/unavailable counts and
per-day evidence basis are shown. Overnight entries can close on a different day:
this does **not** attribute each trade to its own entry routine. Small/selected
samples, human/retrospective reports and close-day association do not establish
causation or justify risk sizing, strategy changes or a win-rate promise.

## Optional execution self-review is not capital, writing or permission

M86 replaces outcome-weighted journal grading with **retrospective human
execution**. Adherence1–5 plus explicit nullable stop-honour answers are captured
for an actual closed current saved record. Its source/server time/versioned hash
and displayed-record revision are owned; relevant edits withhold stale evidence.
Missing/corrupt/future/legacy data stays Unreviewed with null score. Current valid
partial answers may identify a specific reported violation, never a full grade.
Stop movement may be protective; default0, loss size, fees/gaps/slippage and
MAE/MFE do not establish compliance/violation. Self-report is never broker proof.

`execution-v1` maps1/2/3/4/5 to20/40/60/75/95; explicit stop violation caps39.
Good-loss classification requires >=4 and explicit honour, not the amount lost.
There are **no** points for P&L/R/planned RR/session/excursions. This is an app
display rubric, not a newly quoted course coefficient or a pre-entry setup score.
M92 ranks a day's known current execution reviews, not biggest profit/loss.
Unknowns unranked; ties explicit; separately labelled money-only extremes and
unknown realised-day totals are not converted to zero/floating profit.

No execution score is persisted. The old grade-backfill endpoint now reports
read-only `updated:0` and evaluated/reviewed/unreviewed counts. Original stored
`setup_grade` values remain untouched; unknown old manual/model/auto provenance
cannot be recovered. Entry checklist grades and **A+/A×1, B×.5, C×.25** factors
are unchanged. Neither grade, explicit stop answer nor a process rank completes
core loss writing, fresh emotional gate, routine/timer or any first-admission fact,
waives unknown state or refunds cap/loss/streak/cooldown observations. Truthful
financial close/correction/deletion/import and record-only entries remain legal.

## Scope still open

M108's full Sanctuary presets/ambient/intention/toolkit/independent session log
and progress remain partial beyond this routine timer. M89 adds app-timed human
self-report provenance, not broker/mental-state verification. M111's news fail-closed
policy, M112's time restrictions, M106's four-question state gate and all other unresolved findings
stay open. **Correction:** M116 is already classified APPLIED in the ledger; the
prior guide/summaries incorrectly listed it open. No new closure/retuning is counted.
M84/M85 complete their scoped input-capture/manual-marker gaps, not adaptive sizing.
These changes do not change
entry models, target/stop geometry, RR floors, entry setup-grade policies, the course's
30-trade adaptation minimum or the deliberate M103 `n >= 5` gate. No new market
edge, win-rate improvement, live-provider or production-deployment claim is made.


## M88 — optional entry reasons, NEVER authority to trade

Dedicated human market/setup reasons remain independent from general tags,
mistakes, emotion, core writing, entry model/checklist, execution review and
HTF/MTF/LTF screenshots. NULL unknown != [] explicit none;1 honest partial is
legal,2–5 course guidance/max5 avoids invented reasons. No historical copying,
automatic confluence capture, label weighting or grade/risk/permission change.

Separate owned saved-record revision edits only the3 nullable confluence fields;
all original trade clocks/review hashes/financial values remain unchanged.
Stale409 needs explicit reload, invalid editor400, actual storage503 rollback.
New/portable optional malformed evidence warns rather than vetoing a truthful
financial record. Close/correction/deletion/import/record-only remain legal;
confluences never complete required loss writing or refund a cap/loss/timer/routine
obligation. Account/user/token changes and late/closed/replaced callbacks guarded.

Human/imported declarations and server declaration/receiving time are **not
verified original entry-time or broker capture**, may be retrospective and are
not append-only histories. Imports can't replay human timing/ownership/workflow
proof. Reusable vocabulary is user-owned and survives deselection/deleting trades;
JSON backs up unused choices, CSV only trade-row reasons. Bad optional import
warnings remain visible. Storage failure rolls back the request rather than
claiming complete success. Original20MB file/25MB body limits unchanged; optional
unused vocabulary restore budget5000 with explicit omission warning, never silent
clipping. Repeat historical restore can duplicate trades.

Closed-only confluence cohorts overlap; each trade counts once per normalised
label, not one independent sample per label. Known denominators/unknown outcomes
and import mix explicit. Missing/contradictory net/R isn't0 or∞. Course30 is a
record-count review annotation, not proof of edge/known-outcome completeness or
permission. Retrospective associations don't establish causality/prediction and
must not resize risk. Deliberate M103 n>=5/B-C tradeability, existing weights,
grades, factors, default risk, stops/targets/RR/geometry all unchanged.
M89 adds separate app-timed emotion provenance, not confluence capture proof. M106/M111/M112 remain TODO; M108 remains partial.


## M89 — capture is evidence, NEVER authority or required-writing completion

After saved admitted entry/reopen, the app offers a blank first-state prompt;
after truthful close, it offers an exit-state prompt, then the still-required
core/post-loss review on answer/decline. Server clocks/current finance protect
first app facts, not real execution/mental state. Five-minute APP budget is not
a course quotation or a calmness gate. Before-entry required self-report remains
separate; M106 fresh questions still TODO. Missing/declined is not none; explicit
unknown remains unknown. No emotion/mistake/tag/model/outcome backfill.

Financial transition commits first. Optional observation failure warns, never
rolls back finance, refunds a cap or lets a closed trade pretend it never lost.
Answer503 rolls back only response/compatibility auto-tag; actual import-store
failure rolls back that import atomically. First response immutable via strict
owned revision/API and DB UPDATE triggers. Ordinary manual/core edits remain
retrospective and cannot rewrite first facts. Deliberate deletion cascades; no
sealed/admin-tamper-proof vault claim. Corrected/reopened/moved-account prior
history survives but cannot be credited to a new current position. Premature
exit409; entry first answered after close remains late, even within5minutes.

Capture-only primary Analytics/Coach uses server-owned child evidence and closed
trades. Late, unknown, pending, retrospective, imported, prior and unavailable
excluded with coverage; legacy text labelled separate/unverified. Known net/R
availability explicit, no unknown-to0. Descriptive self-report comparisons have
no causal dollar counterfactual, prediction, sizing veto or70% claim.30-trade
review floor and deliberate M103 n>=5 unchanged;30+ is not edge proof.

Backups preserve first responses/original context as declarations; receiving IDs,
owner/account/source/time forced new/imported, no original clock/delay/workflow
replay. Old IDs aren't ownership proof. Invalid optional imports warn while finance
persists; missing capture store permits financial backup with explicit unavailable
markers. CSV/Settings warnings stay visible. App budgets100-character single-line
state,50 portable entries/trade,8KB declared original context/2048-character
primitive strings are not course rules. Existing20MB file/25MB body limits and
repeat historical insertion semantics remain. No automatic batching/deduping.

All setup/execution grades, checklist/entry-model weights, default risk/factors,
geometry/stops/targets/RR, admissions/caps/routine/loss-writing clocks unchanged.
Current ledger132=92 done/3 partial/37TODO; M30/M103/M108 partial, M106/M111/M112
open. No broker/provider/pixel/actual-human/meditation/production/edge proof.
