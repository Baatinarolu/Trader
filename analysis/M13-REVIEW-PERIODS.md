# M13/M65 — the review periods: one ruler, two calendars, and the record of which periods were saved

M13 and M65 are two entries in the ledger and **one delivery**, because they are two halves of the same
missing thing: Ep 26 asks for a weekly and a quarterly review, Ep 17 says plan changes are legitimate at
the **quarterly** cadence, and the app could compute neither a week nor a quarter of performance while
keeping no record of which periods the trader had actually sat down and reviewed.

## 1. What was missing

* **M13.** `performance.js` bucketed closed trades by **day and month only**
  (`dailySeries`/`monthlySeries`). A monthly bucket whose window moves with the journal timezone is not
  a week and it is not a quarter, so "what did this week look like?" had no answer on the payload the
  review reads.
* **M65** (corrected 2026-10-07, narrower than first logged). The **quarter** was already there: `goals`
  accepted `period=month|quarter|year`, `routes/api.js` computed a quarter start, the journal UI offered
  the option, and M99/M101 shipped a `quarter` review **template** with a quarter review history. What
  did not exist was the **quarterly series** beside the monthly one, and any record joining a period to
  the artifact saved for it.
* The boundary arithmetic itself had been written out **twice** — once in `period-reviews.js` (weeks,
  months, quarters, years) and once in `rule-changes.js` (the M104 quarterly advisory). Two copies of a
  boundary rule is the shape of the M59 defect (two grade ladders, one score graded differently by
  each), so the fix is a single ruler rather than a third copy.

## 2. One ruler, two calendars

`src/periods.js` (`periods-v1`) is the app's only calendar-period implementation: **UTC days,
Monday-start weeks, calendar months, calendar quarters, calendar years**, half-open `[start,end)` with
`last_day`, canonical-start-only addressing, and `sequence()` (≤520, newest first). It has **no
requires, no database, no environment and no clock of its own** — every function is handed the day it
must answer about. The review artifacts, the M104 advisory and the new series all read it, and the
advisory/ruler agreement is asserted **day by day across 2025–2027** in the pure probe, not spot-checked
at a boundary or two.

The payload keeps **two rulers**, and says so on every bucket:

| series | ruler | key |
|---|---|---|
| `daily{}`, `monthly{}` (unchanged) | the **journal timezone** | `YYYY-MM-DD`, `YYYY-MM` |
| `weekly{}` (new) | the **review calendar** — UTC close-day, Monday-start week | the week's Monday |
| `quarterly{}` (new) | the **review calendar** — calendar quarter | `YYYY-Qn` |

Measured in both probes: a close at `2026-10-04T23:30:00.000Z` is week **`2026-09-28`** on the review
calendar and Lagos day **`2026-10-05`** on the journal clock. Nothing converts a trade from one ruler
into the other to make two numbers agree, and no bucket is dropped because it is empty: an empty series
is an empty object, never a zero-filled calendar of periods nothing happened in.

A bucket carries `{week|quarter, start, end, last_day, trades, wins, losses, breakeven, pnl, r,
win_rate, unknown_net, unknown_r, days, basis}`. **A missing amount is not a zero:** a close with no
recorded `net_pnl` is counted in `unknown_net` (likewise `unknown_r`) and the bucket reports `pnl:
null` when nothing was recorded — it is never read as a loss, and it is never dropped. A closed trade
with **no clock at all** cannot be placed on any calendar, so it is counted on the payload as
`undated_closes` rather than guessed into a week.

## 3. The record of which periods were reviewed

`period-reviews.js` gained `review-coverage-v1`. `coverageOf()` is **pure** — handed the saved rows, the
series and the day — and `coverage()` reads them inside a `db.tx` with a 5 000-row bound (a bounded
read answers `state:'unavailable'`, not a partial record). Each canonical period of the last 12 weeks
and 8 quarters is joined to the artifact saved **for that exact period** on the trader's **own**
account, by the latest saved version:

| state | meaning | never |
|---|---|---|
| `completed` | a saved artifact the trader wrote, status `completed` | a claim that the review was any good |
| `draft` | saved but not completed | counted as a review |
| `imported_unverified` | an imported copy / legacy row | counted as the trader's own review |
| `unavailable` | a saved row that cannot be read back | dropped, or assumed clean |
| `not_recorded` | **no artifact for that period** | "missed", or a clean record |

The state's own receipt rides beside it (`review_id`, `review_version`, `review_status`,
`review_source`, `review_recorded_at`, `review_focus`, `review_amendment`) so the card shows the
trader's committed focus rather than a summary the app invented. Each period carries **its own**
recorded closes (`trades`, `pnl`, `r`, `win_rate`, `unknown_net`, `unknown_r`, `days`) joined **by the
bucket's `start`** — a quarter's key is `YYYY-Qn`, so joining on the key would silently drop every
quarter (a bug this milestone's API probe caught and the pure probe now pins).

Per kind the record reports `periods_scanned`, `rows_scanned`, `artifacts_outside_scope`, `completed`,
`draft`, `imported_unverified`, `unavailable_rows`, `not_recorded`, `open_periods`. A period still
running is `open_periods`, **not** an unreviewed one; an artifact whose stored period start is not a
canonical period start is counted as **outside the window** rather than disappearing.

## 4. The honesty rules are in the payload, not only in the prose

* **Unknown is not clean.** An unreadable record is `state:'unavailable'` with `not_recorded:null` —
  never a period list full of "no artifact recorded" and never a clean record. A foreign or unowned
  account resolves to the same shape from the route's own scope (`coverageOptional` catches and answers
  `unavailable`, so the analytics payload never fails because the record could not be read).
* **`not_recorded` is not "missed".** The sentence travels with every kind —
  *"No artifact was saved for this finished period. That is not evidence that no review happened."* — a
  review done on paper, elsewhere or in another app leaves nothing here, which is why the record states
  the absence instead of grading it.
* **A completed artifact is not a good review.** The payload's `basis` says it is an acknowledgement
  that a review was **written and saved**, not proof that the period was **reviewed well**, that its
  numbers are complete, or that any rule changed.
* **No reviewed-vs-unreviewed comparison.** `outcome_compared:false` rides the payload with the reason:
  the amounts sit beside the state because both are facts about the same period, and comparing them
  would be a causal claim this journal has not measured.
* **Read-only, and it says so:** `limits = {read_only:true, writes:0, grades_influence:false,
  permission_influence:false, caps_influence:false, guardrail_decisions_influence:false,
  plan_change_permission:false, causal:false, broker_verified:false}`. Writing a review is still the
  trader's act — this record only says whether one was saved.

## 5. Delivery shape

| surface | where |
|---|---|
| ruler | `src/periods.js` (`periods-v1`) |
| series | `src/performance.js` — `periodSeries`, `weeklySeries`, `quarterlySeries`; payload keys `weekly`, `quarterly`, `undated_closes` |
| record | `src/period-reviews.js` — `review-coverage-v1`, `coverageOf`/`coverage`/`coverageOptional`/`coverageUnavailable` |
| wire | `analytics.weekly` / `analytics.quarterly` / `analytics.undated_closes` / `analytics.review_periods` on the **existing** `GET /api/analytics` — no new endpoint |
| UI | `public/js/views/review-periods.js` (`Views.reviewPeriods.card`), mounted in `public/js/views/analytics.js` above its existing tabs, loaded by `public/index.html` |

The card renders both cadences as their own blocks, the per-kind totals (completed / draft only /
imported copy (unverified) / unreadable / no artifact recorded, of N scanned, M still open), each
period's own line with its saved focus, the counts of artifacts outside the window, the two-ruler
sentence, the `not_recorded` meaning and the read-only basis. An unavailable record renders as
**UNKNOWN** with no period list at all — the card test asserts a missing payload takes the same path.
Its reload button refuses to re-navigate when the workspace/account/session changed under it, rather
than rendering another desk's record.

Nothing else moved: **no schema object of any kind** (the tickets, the buckets and the record are all
derived or already stored), no writes, no new route, and no influence on any grade, cap, permission,
guardrail decision or plan-change permission. The quarter arithmetic that used to live in
`routes/api.js` is now the ruler's.

## 6. What was measured

| arm | result |
|---|---|
| delivered tree, 4 probes | **94/0** — pure 39, api 23, migration 13, ui 19 |
| the mode-aware control probe | **11/0 in EVERY mode** — on the parent it counts the absence (0 ruler, 0 buckets, 0 record, 0 mounts), on the pre-hardening tree 1 ruler, 1 bucket producer, 0 record, 0 mounts, and on the delivered tree the ruler, the one bucketing call site, the one carrier, the two files that serve the record and the three surfacing facts |
| the actual `9c88e0a` M12 parent | **0/1 on all four** feature probes — each stops at its first assertion (`the committed parent does not…`); that absence IS the control |
| pre-hardening runtime (the ruler and the buckets exist, nothing records or shows them) | pure **24/1** (the ruler and the series assertions PASS — the calendar is measured working — and the probe then stops at `R.coverageOf is not a function`), api **0/1** (no `review_periods` key), migration **6/1** (`Q.coverage is not a function`), ui **0/1** (ENOENT on the missing card), control **11/0** |
| M112 cohort re-run on this tree | **181/0 across 6 probes** — the four new read-only keys do not disturb it |
| M111 / M110 / M109 / M108 cohorts | **152/2 · 248/10 · 166/2 · 257/2** — each reproduces its committed record exactly, its own frozen negatives retained by name |
| older cohorts | m107 **232/0** · m106 **318/0** · m105 **142/0** — identical to their committed records |
| inherited arms re-run | RAW **596/156** · DECLARED **824/4** · live-provider **70/1** — identical |
| smoke (`scripts/smoke-test.js`, shipped, unchanged) | **22/22 views, 0 style failures, 0 console errors** on the delivered tree AND on the parent, at the same sample; the smoke output never names the card, so the run is not claimed as card coverage |
| live end-to-end sanity (real server, real payload, real card) | `state:"available"` with `weekly,quarterly,undated_closes,review_periods` on the wire; the two review weeks (`2026-09-28`, `2026-10-05`) and `2026-Q4` bucketed from closes posted through `POST /api/trades` (the app computes its own `net_pnl` from the fills), `undated_closes: 0`, weekly totals **0 completed / 11 no artifact / 1 open**, and the card rendering both weeks, the quarter, the two rulers and the `not_recorded` meaning — raw output in `analysis/evidence/m13/e2e-live.txt`; NOT claimed as card-state coverage, which is the UI probe's 19 assertions |
| delivery | five stage patches replayed forward and reverse with 0 byte differences, **161 sources**, ZIP rebuilt from the saved patches byte-identical |
| ledger | 132 / **110** done / 2 partial / 20 TODO / 0 no-action / 8 groups (M13 **and** M65 flip) |

The pre-hardening control is the real fault, named: the calendar and the buckets are measured working,
and there is **nothing** to join a period to — no `review_periods` key, no record module, no card file.
Every one of those failing lines is the same assertion that answers `ok` on the delivered tree, and the
mode-aware control probe counts the fault rather than crashing on it in all three modes.

## 7. Declared negative, carried by name

The inherited **M99/M101 reviews cohort is stale at this HEAD: 157/3 against its committed 159/1**
(migration 12/3, all three in `analysis/evidence/m108/reviews/migration*`). All three gaps trace to
schema growth **after** M101 that the M108-era evidence predates: the `accounts` DDL grew from 26 to 36
columns (`news_block_before_min`, `news_settle_after_min`, `window_start`, `window_end`,
`window_timezone`, `window_source`, …) and ten tables have been delivered since (`daily_intentions`,
`identity_declarations`, `opportunity_decisions`, `opportunity_trade_links`, `period_reviews`,
`practice_sessions`, `practice_timers`, `signal_opportunities`, `state_gate_answers`,
`strategy_rule_changes`). One of the three was already failing at the M108 baseline; two flipped
relative to that baseline. They are declared here and in the builder's `declared_negatives`, **not**
repaired by editing a frozen probe — the isolation path, if challenged, is to `git stash` the
`period-reviews.js` delegation and re-run `analysis/probe-m99-migration.js`.

## 8. What this does not claim

No 70 % win-rate, causal, predictive, broker, provider, human, mental-state, pixel or production claim.
Nothing is graded: a period is never called good, missed, or a failure, and a completed artifact is not
proof that the review was well done or that any money was made. No fill padding, sample-floor, clock,
target, risk or grade retuning, and no existing guard weakened. The sandbox has no market or broker
network, so the probes seed their own closes and artifacts through the app's own SQL shapes (`close()`
and the `save()`-mirroring `review()`), and the UI probe is a jsdom structural check, not a pixel proof.

## 9. Delivery

`analysis/build-m13-review-periods-artifacts.py` re-derives the five stage trees and asserts every
frozen guard in both directions, stacks the delivered tree onto the pristine `tradingpro-main.zip` (pin
`7a511cab…`) and writes `tradingpro-fixed.zip` with its SHA companion in
`analysis/evidence/m13/archive-sha256.json`. Stages: **ruler** (the calendar exists and NOTHING reads
it — the fault) → **series** (the buckets ride the payload) → **record** (the record rides the payload)
→ **card** (the shipped card) → **documentation**, each with its own patch
(`analysis/patches/m13-review-periods-*.patch`) and source guard, plus the pristine cumulative
`applied-so-far.patch`. Running the builder twice in replay-only mode rebuilds every stage from the
saved patches and reproduces the delivered ZIP byte-for-byte.

**Carried, not owned: nothing.** The parent (the actual `9c88e0a` M12 release) already ships
`tools/jsmin/**` and `src/rule-breaks.js`, so the delivered files the parent does not have are exactly
this milestone's own two new files — derived and asserted in `analysis/capture-m13-stages.py` rather
than assumed, so a stage measures M13/M65's own fault rather than the absence of an unrelated tool.
