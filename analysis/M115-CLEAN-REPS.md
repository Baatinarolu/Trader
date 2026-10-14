# M115 (+M17/M18/M19) — the clean-rep count: 21 trades, three criteria, and no money anywhere near it

M115 is the last row in group E's Ep 32 material and it is a **missing count**, not missing data. Ep 32
defines the exercise by a number — *"you're going to be taking **21 trades** that are fully in accordance
with the trade plan"* — and each of those trades has to meet three criteria: *"it must be **aligned with
your trade plan**. It must be **executed cleanly**, which means you have to follow your **risk management
rules**. And then you have to **journal immediately** after you close the position."* The app recorded
all three facts and counted none of them as a rep. M17, M18 and M19 are three documentation findings in
the same tree, so they are corrected here rather than in a separate pass.

## 1. What was missing

* **M115.** `strategy_id` on the trade (the plan link), the `rule_checks` rows and `stop_honoured` (the
  clean execution) and M85's hash-verified `journal_reviewed_at` (the journalling) were all being written
  and read by other surfaces. Nothing counted them together, and nothing could tell the trader how far
  through the exercise they were. The only goal-shaped concept in the app was `profit_target_pct` — a
  **money** target, i.e. the opposite of what the exercise measures: *"money is not the goal here… It's to
  build a habit of confident execution."*
* **The day trap.** The exercise explicitly permits skipping days — *"you're allowed to skip those
  days"*, because forcing it means *"you're going to end up **forcing trades**"* — so a counter that
  counted calendar days would create exactly the behaviour the exercise forbids. This is why the counter
  counts **trades**, and why days appear in it only as a labelled informational figure.
* **M17.** `PLAYLIST-CURRICULUM.md:85` credited Ep 32 with "Journal streaks / checklist logging". The
  checklist logging is real; the streak is not — the only streak in the tree is consecutive **losses**
  (`correction.js`), never consecutive days.
* **M18.** The same document never said which of Ep 25's five all-or-nothing triggers the app treats as
  **advisory** and which as **gating**.
* **M19.** `docs/NOT-IMPLEMENTED.md` §2 row 8 claimed an `aria-*`/`role=` count of **0**; the tree has 5
  in `index.html` + the views.

## 2. The count, and what it refuses to do

`src/challenge.js` (`clean-reps-v1`) is a **read-only** derivation. A rep is a **closed trade** meeting
all three criteria, each read as a recorded fact:

| criterion | the recorded fact | what it deliberately is NOT |
|---|---|---|
| `plan_linked` | the trade carries a `strategy_id`, re-checked against the trader's **own** saved plans | not proof the plan was followed — that is what the next criterion is for |
| `no_recorded_breach` | ≥1 `rule_checks` row, **zero** failed, and no recorded decision not to honour the stop (`stop_honoured === 0`) | a trade with **no** checklist FAILS: *no record is not a clean record* (reported as `unrecorded_checks`) |
| `journalled_same_close_day` | M85's own `journaling.info().complete` (explicit acknowledgement whose stored hash still matches) **and** the acknowledgement's UTC day equals the trade's UTC close day | the app cannot observe human immediacy, so the payload says the rule is a proxy and **reports the observed gap** (median and worst) beside it |

The count is cumulative, a failing trade never erases it, and only the reported `run` (consecutive reps
scanned newest-first) restarts — the card says so in as many words, so the punishment reading is closed
on the surface itself. `days_with_a_rep` exists and is labelled: *"Skipping days is permitted by the
exercise, so days are never counted."*

**Unknown is never zero.** With no start declared, the payload is `state:'not_started'`,
`progress.counted:null`, `not_counted.total:null` — and the card renders *"the count has not been
started, so this is not zero reps"* rather than a `0`. A failed read is `unavailable` with a reason and no
by-criterion block at all. A **started** count with no trades is a real zero, and the card keeps the two
apart.

**The two declarations are the trader's own settings**, and they are the milestone's only writes: two keys
(`challenge_start`, `challenge_target`) in the `users.settings` JSON through the **existing** `PUT /settings`
— **no table, no column, no index, no trigger, no new endpoint, no backfill, no migration**. The target is
1–999, default 21, and changing it changes neither the count, the run, nor a single trade's verdict. The
start is explicit and **locked** (409 `challenge_start_locked`, with the number of trades in the way) once
any closed trade sits at or after it: once the window has trades in it, progress is a record and not a dial.

## 3. Delivery shape

| surface | where |
|---|---|
| count | `src/challenge.js` (`clean-reps-v1`) — `repOf` (one trade), `evaluate` (the window), `inspect`/`inspectOptional` (the read), `startGuard` (the start lock) |
| wire | `analytics.challenge` on the **existing** `GET /api/analytics`, for the same resolved account the payload analyses — no new endpoint |
| declarations | `PUT /settings`: `challenge_start` (validated day) and `challenge_target` (validated 1–999); both are keyed only when the caller sends them, so a partial settings save from another screen cannot wipe them |
| UI | `public/js/views/challenge.js` (`Views.challenge.card`), loaded by `public/index.html` and mounted on the dashboard beside the day's process cards |

The card shows the count / target, the remaining figure, the run, the bar, the not-counted breakdown by
criterion, the excluded-before-start and undatable closes, the journalling proxy with its observed gap,
the newest trades with their own reasons, and the two controls (start the count, save the target). It
carries a workspace/account/session guard and **refuses to write** when the card is stale rather than
saving a declaration into another desk's journal. Its assertions include that no amount appears anywhere,
that the words "grade"/"score" appear only in the sentences denying them, and that an unusable stored
target renders as **target unusable** rather than being silently replaced by the default 21.

## 4. Where the count sits beside the money target

`profit_target_pct` is untouched: the rep count is a habit instrument **beside** the money goals, not a
redefinition of them. `outcome_joined:false` with the sentence saying why (*"this exercise counts a
habit, and saying a rep made or saved money would be a causal claim this journal has not measured"*), and
`limits` states `grades_influence:false`, `caps_influence:false`, `permission_influence:false`,
`guardrail_decisions_influence:false`, `plan_change_permission:false`, `broker_verified:false`.

The stop-honour input is worth naming precisely: it is the trader's own **self-reported** execution
review (`POST /trades/:id/execution-review`, hash-stamped, `stop_honoured_source:'self_reported'`), not
broker truth. The criterion is literally `no_recorded_breach` — a stop whose honour was never recorded is
not a recorded breach — and the payload says `broker_verified:false` rather than implying otherwise.

## 5. What was measured

| arm | result |
|---|---|
| delivered tree, 4 probes | **116/0** — pure 41, api 30, migration 18, ui 27 |
| the mode-aware control probe | **13/0 in BOTH modes** — on the parent it counts the absence (no module, no payload key, no card, both declarations dropped by its settings route); on the delivered tree it counts the presence of each |
| the actual `b87e852` M13/M65 parent | **0/1 on all four** feature probes — each stops at its own first assertion (*"the committed parent does not…"*); that absence IS the control |
| counter-only runtime (the count exists and is measured working; nothing serves it, no page shows it, the settings route drops both declarations) | pure **41/0** and migration **18/0** (the counter itself is measured working on the parent's own file), api **1 fail by name** (the payload carries no count — the probe records the absence and stops rather than crashing on it), ui **1 fail** (no card file), control probe **13/0** |
| M13/M65 cohort re-run on this tree | **94/0 across 4 probes** — the milestone this one sits on reproduces its record exactly |
| M112 / M111 / M110 cohorts | **181/0 · 152/2 · 248/10** — each reproduces its committed record; the M110 family negatives are the same frozen assertions M13 declared, named again below |
| M109 / M108 / M107 / M106 / M105 cohorts | **166/2 · 257/2 · 232/0 · 318/0 · 142/0** — each reproduces its committed record |
| RAW / DECLARED / live-provider arms | **596/156 · 824/4 · 70/1** — re-run this session through the delegated chain, each reproducing its committed record |
| ledger | **113 done · 3 partial · 16 todo · 0 no-action · 132 total**, partition asserted across 8 groups; `partial_ids == ['M30', 'M103', 'M115']` |
| artifact | 4 stages + docs, forward **and** reverse replay 0 byte differences; `tradingpro-fixed.zip` rebuilt from the saved patches byte-identically, with its size and SHA recorded in `analysis/evidence/m115/archive-sha256.json` (the companion sits **outside** the archive: this report is one of the archive's own files, so quoting it here could never be a fixed point) |

The parent control is a **measured** absence rather than a claim: each of the four probes stops at its own
opener ('the committed parent does not'), and the arms are asserted against the probe's own wording.

## 6. Declared negatives, carried by name

* **The inherited M99/M101 reviews cohort is STALE at this HEAD**: 157/3 against its committed 159/1
  (migration 12/3: `idx_daily_intentions_owner`-class indexes, table/index/trigger rebuilds, and the
  original finance/owner/clocks/provenance/permissions/routine facts). Cause: the schema grew after M101
  (`accounts` 26→36 columns and ten delivered-only tables), which that evidence predates. **M115 changes no
  schema at all**, so this gap is inherited, not caused here.
* **The M110 family negatives** (M110's own two plus the M112-caused one) are the same frozen assertions
  M13 recorded, asserted by their literal labels and never edited.
* **The delegation chain's own exit codes**: `run-m108` exits 1 on the m105/m106/m107/m108 cohorts, the
  m111 runner exits 1 on its migration probe (14/2), and the reviews runner exits 1 on the inherited gaps —
  because each of those runners asserts its own committed expectations in its own terms. The counts above
  are read from the summaries those runs **wrote**, and every nonzero exit is named here rather than
  smoothed over.
* **The `m105feature`/`m106feature`/`m107feature` summaries under `analysis/evidence/m108/`** are written
  by the delegation chain rather than by the cohorts' own runners; re-measured this session they reproduce
  the committed counts (140/2 · 316/2 · 230/2) and are named by path and provenance.

## 7. What this does *not* claim

* **No money.** No amount, no P&L, no goal figure on the payload or the card; `outcome_joined:false`.
* **No causation.** Reaching 21 reps is not said to improve results anywhere — the exercise counts a habit.
* **No grade, cap, permission, guardrail decision or plan-change influence** — all five are `false` in
  `limits` and asserted in three probes.
* **No broker verification.** The stop-honour input is the trader's own self-reported review.
* **No human immediacy.** "Journalled immediately" is operationalised as the same UTC close day, labelled
  as a proxy, with the observed gap reported.
* **No pass/fail ceremony.** The exercise has a target, not a graduation event: reaching it raises no
  event and gates nothing.
* **No Ep 32 transcript.** The episode's own content is **not verifiable from this workspace** — only
  playlist metadata is (`analysis/playlist-verified.json` carries `verified_at`, `route`, `url`, `title`,
  `channel`, `video_count`, `views`, `last_updated` and nothing else) — so the count implements the finding
  row `M115` and says so in the document itself.

## 8. The three documentation corrections in the same tree

* **M17.** Row 32 now states checklist logging per trade, the clean-rep count of the three criteria over
  closed **trades**, and that **no day-counting habit streak exists** (the only streak in the tree is
  consecutive *losses* in `correction.js`), with the transcript limitation stated in the row itself. Row 17
  carried the same claim and was corrected with it so the table cannot contradict itself.
* **M18.** A new table — *"The five all-or-nothing triggers: which are advisory, which are gating"* — names
  each of Ep 25's five triggers with the deciding line in `src/bots/setup.js` and an explicit column. At
  this release **all five gate** (they are entries in `vetoes`, so `ok:false`): timing
  (`sess.in_killzone === false`), the sweep (`!hasTrigger`), the market shift (M69), the zone (`!hasZone`)
  and the 2R floor (M7/M95). The remaining score caps (38/34/45/20/40/66) and `killzone_quality` are
  **advisory**, which the table states — including the measured reason timing stopped being advisory (the
  same candles graded A+ 40 / A 157 at 08:30Z and A+ 0 / A 40 / B 162 at 22:30Z while `quality` multiplied
  the score).
* **M19.** §2 row 8 carries the measured count **and the command that reproduces it**: 5 occurrences in
  `public/index.html` + `public/js/views/*.js` (0 in `index.html` itself), 8 across all of `public/js`,
  plus what the attributes actually are — so the number cannot be mistaken for an accessibility pass.
  Re-measured after this milestone's own card was added: unchanged.

## 9. Delivery

Parent: the actual `b87e852` M13/M65 release (161 files). Stages: **counter → wired → card →
documentation**, each rebuilt from its saved patch and required to match its frozen guard in both
directions; the delivered tree is 163 files, the ZIP 163 sources, with `analysis/evidence/m115/`
holding every arm, both parent/control trees, `controls.json`, `archive-sha256.json` and the stage
ledger. The counter-only arm is staged from the **parent's own** `src/routes/api.js`, so nothing serves
the count it computes; the `wired` stage carries the delivered `src/routes/api.js` and still no card. Artifacts: `analysis/patches/m115-clean-reps-*.patch`, `analysis/patches/applied-so-far.patch`
and `tradingpro-fixed.zip` (SHA companion outside the archive).
