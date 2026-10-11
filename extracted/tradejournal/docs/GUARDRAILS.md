# Personal guardrails, recording and reasoned exceptions

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

## Scope still open

M84's optional session-duration marker, M85's **post-loss reflection/completeness**,
M94's pre-market routine, M111's news fail-closed policy, M112's time restrictions
and M116's composite-score honesty remain open, along with every unresolved ID
in the audit ledger. M85 is not an adaptive-sizing finding. M81/M82 do not change
entry models, target/stop geometry, RR floors, grade policies, the course's
30-trade adaptation minimum or the deliberate M103 `n >= 5` gate. No new market
edge, win-rate improvement, live-provider or production-deployment claim is made.
