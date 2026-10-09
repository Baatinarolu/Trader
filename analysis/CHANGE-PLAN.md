# Change plan — consolidated from Ep 0 through the current audit pass

Derived mechanically from `analysis/MISMATCHES.md` (**116 rows**: S1 13, S2 39, S3 58, S4 5,
plus 1 downgraded). Action verbs as recorded: **fix 52 · add 45 · decide 8 · patch-ready 3 ·
other 8**.

## ⚠ Two caveats that change the answer

1. **The audit is not finished.** 7 of the 47 videos are still unread
   (`iKRW0G6yPmM`, `cFzxyGRtAis`, `kJWmeSLfP64`, `EsVHKs24qBI`, `vU16QHmX3x4`,
   `3_QR4XFVbKE`, `AVS6QneKmAA`). Three of those — *Execute Trades*, *Review Metrics* and the
   LIVE breakdown — are likely to carry strategy rules. **This plan is complete for Ep 0–33 and
   the 6 videos read, and provisional until those 7 are read.**
2. **Nothing below is applied.** `src/` is byte-identical to the pristine zip
   (`diff -rq` exit 0). That is deliberate, per your instruction to finish the audit first.

And the reason batching matters rather than being pedantry: the independent backtest measured
**172 trades, 37.8 % win, expectancy −0.125R, PF 0.84 — no edge**. Applying one fix at a time
against a baseline with no edge tells you nothing; several of these fixes interact (M24 needs
M21, M49 needs M47, M40 compounds M38, M51/M71/M75 must ship together), so they have to be
re-measured as a batch.

---

## Batch 0 — correctness only, zero strategy impact. **APPLIED.**

**Status: shipped.** Diff preserved at **`analysis/patches/applied-so-far.patch`**
(now 8 files, +59/−21, including M9 and M16; `git apply --check` clean against a pristine tree, and the patched result
is byte-identical to the live tree — `extracted/` is gitignored and gets wiped by workspace
resets, so the patch *is* the durable record). Verified by **`analysis/probe-batch0.js`,
10/10**, which proves the M6 crash was real (the pre-fix expression throws
`Cannot read properties of undefined (reading 'last_break')` on the sentinel) and that the fix
stops it without regressing the happy path. `now-test` 36/0, `api-test` 121/0 against a freshly
restarted server.

**M5 and M37 were REMOVED from this batch.** On inspection they are one defect, not two: both
killzone tables are hardcoded in UTC (`now.js:44-48` and `smc.js:619-621`, which agree with each
other), for windows that are really anchored to Eastern time. The audit already measured the
consequence — London 06:00–09:00 UTC only matches 02:00–05:00 ET at **UTC−4**, while
NY AM 12:00–15:00 UTC only matches 07:00–10:00 ET at **UTC−5**, so the two are calibrated
to different seasons and NY AM is an hour late half the year. Fixing it converts ET→UTC with
DST handling, which **changes which hours are tradeable** — so it needs a backtest and belongs
with Batch 4, not here. Patch `0002` is that work, not applied.



These are bugs and false statements. None of them changes a trade decision, so none of them
needs a backtest.

| Item | Change |
|---|---|
| **M6** (S1) ✅ | Latent `TypeError` in the setup report string. **Verified mechanism:** `bots/smc.js:660` **is** guarded (returns a sentinel with no `structure` key, so `analyse` never throws) and `setup.js:137` **is** guarded — but `setup.js:141` dereferences `analysis.structure.last_break` **unconditionally in a template literal, one line below the guard**. Reaching it needs a short series, which the `trim` branch at `momentum.js:64` can produce (`Math.max(1, …)`) while the adjacent `asOf` branch refuses one. Fix: hoist the existing `:137` guard to a local. One line. |
| **M20** (S1) ✅ | `zone_tf` is dead config: `STACK['15m']` declares `zone:'1h'` but `topdown.js:105` reads it nowhere, so the location layer ran on `entryTf` while the API reported `zone: tf=15m`. Wire it up **or** delete it — but the API must stop reporting a timeframe it did not use. **Patch ready (report-only).** |
| **M61** ✅ | `vetoes` is dead code and the "hard vetoes" docstring is false. Delete the code or implement the vetoes. |
| **M114** ✅ | `predict.js:446` and `:602` cite Ep 24/32 for a rule neither contains. Remove both false citations. |
| **M4** ✅ | `setup.js:163` said *"next 60 minutes"* for a **symmetric ±** window test. Fix the string. |

## Decisions taken (user, this pass)

| Item | Decision | Consequence |
|---|---|---|
| **M95** | **Keep B and C tradeable** | A deliberate departure from the course. **This makes M58 the compensating control** — with refusal removed, position size is the only remaining protection against low-probability trades, and the `GRADES` labels already promise *"reduced size"* / *"half risk at most"* in words that no code enforces. M58 is promoted. |
| **M9** | **0.5 % default, 1 % manual unlock** | **APPLIED.** Ceiling `2 → 1` at `correction.js:403`; default `1.0 → 0.5` at `db.js:120`; **seven** fallback sites updated (`correction.js:71/403/404`, `index.js:120/300`, `coach.js:560`, `api.js:396/711`). The unlock already existed — `PUT /accounts/:id` accepts `risk_per_trade_pct`. |
| **M16** | **Require an order block** | **APPLIED.** The standalone-FVG branch is gone from the zone ternary at `setup.js`; a lone FVG now fails the POI gate and caps the score at 34 = no-trade. `bestFvg` is still computed for the reach calculation. |
| **M21** | **Add strong/weak labels** | Unblocks M24, M22, M1. **Blocked on rebuilding the backtest harness** — it changes target selection and must be measured against −0.125R. |

**New item found while applying these: M117 (S4).** `db.js:83` splits the schema on bare `;`,
so a semicolon inside a SQL comment breaks the whole database at boot. Discovered by breaking it:
a comment reading `0.5%; 1%` made the server fail with `SQLITE_ERROR: incomplete input`. It fails
loudly and never silently, hence S4 — but the error does not name the offending line.

## Batch 1 — the one decision that matters most: **what counts as tradeable**

This is the single highest-leverage change, because it is one line and it currently inverts the
course's central rule.

**M95 (S1):** `setup.js:315` reads `ok: g.grade !== 'no-trade'`, which is **true for B and C**.
The RR miss caps the score at 45 = C (the C floor is 44 — a veto missed by one point); chasing
caps at 66 = B. He forbids B and C categorically.

**Fix: `ok: grade === 'A+' || grade === 'A'`.** The cap block at `setup.js:276-284` already does exactly this for **four of the six** caps — sweep → 38, zone → 34, invalid → 20, news blackout → 40 — all of which land below the C floor of 44 (`:34`) and therefore act as real vetoes. Only **two** caps land above it: RR miss → **45 = C** (one point above the floor) and chasing → **66 = B**. Both return `ok: true`.

M95 is one decision with **M7** (2R minimum is advisory, not a veto), **M8** (killzone failure
applies no cap at all, though timing is one of his five all-or-nothing triggers), **M58**
(A+/A is not a capital-deployment gate) and **M96** (risk-reward is a weight other confluences
can outvote, against an explicit statement that it cannot). All five describe the same defect
from five angles: **the course's hard rules are implemented as soft weights.**

## Batch 2 — structure layer. Blocked on one question (M21).

**M21 (S1, decide):** no strong/weak structure labels. The course derives targets from weak
highs/lows and entries from strong ones. Ep-bonus `en8RMFRqSME` uses the vocabulary directly —
*"this is the one hour **strong low** and this is the one hour **weak low**."*

**M24 (S1) depends on M21:** the pullback/reversal discriminator is missing *because* it is
defined in terms of strong/weak. **M22** (the two swing tiers are computed independently, where
he makes one derive from the other) and **M1** (swing tiers are fractal-strength variants, not
BOS-relative extremes) are the same layer.

⚠ This batch **changes target selection**, so it must be backtested, not just applied.

## Batch 3 — risk and guardrails. Largest batch by count, and the one your own product mirrors.

| Item | Change |
|---|---|
| **M9** (S1, decide) | No 1 % ceiling. Clamp is `Math.max(0.25, Math.min(2,…))` at `correction.js:400`; schema default 1.0. His guardrail is **0.5 %** → the gap is **4×**. |
| **M79** | Guardrails advise but never block. Ep 31/32 settle it: **keep the streak STOP, remove the streak RESCALE** (`coach.js:549` ×0.6). Grade-keyed risk is sanctioned; streak-keyed is forbidden. |
| **M112** | No trading-window guardrail. `ixmTrvUB1Ks`: *"if you try to trade outside of this window, **the guardrail will prevent you from doing so**"* → **hard block**, not a scored penalty. Data already exists (`performance.js:542`). |
| **M83** | The daily trade cap is derived from the trader's own history, so it ratifies the habit it is supposed to cap. Also **not user-settable** (0 hits in `db.js`). His defaults: 5 / 3 / 2. |
| **M11** (S1, decide) | Adaptive guardrails derive from **10** trades (`correction.js:389`). |
| **M103** + **M116** | Sample-size gates. Use his exact thresholds — hide <30, provisional 30–99, real at 100 (*"the rule of 100"*). **M116** is the composite `behaviourScore`; **M103** is the detectors. **Fix together** or the dashboard shows a hidden detector set behind a visible grade. |
| **M90** | Guardrail breaches are computed live for today and never persisted → the cross-day pattern his review depends on is unmeasurable. Needs a table. |
| **M91** | The "rewarded for bad behaviour" case is not detected — *"I have made $2.5 million but it shows that I'm **at risk**"*. Depends on M90. |
| **M80** | Override = grey out → **required reason** → write to the journal keyed to the day → surface per day. Ship with M79. |
| **M94** | No max-daily-profit guardrail (his default 5 %, optionally 3 %; Ep 31 said 1 % — the course is internally inconsistent here). |

## Batch 4 — entry model.

| Item | Change |
|---|---|
| **M16** (S1, decide) | Standalone-FVG fallback passes the hard POI gate (`setup.js:120-122`). |
| **M75** | Stop is placed at the **further** of two candidates; his rule is the **nearer**. **Ships with M51 and M71.** |
| **M51** | Ships a three-target ladder with a 50 % partial; he requires **exactly one target** at 2R. |
| **M77** | Take-profit timeframe-alignment rule not enforced. |
| **M76** | Add the **protected high**: stop above the *entry* candle **only when** that high swept liquidity — *"**this is the price point which invalidates the trade idea**."* The ingredient (a prior sweep) is already detected in `bots/smc.js`. |
| **M47** → **M49** | Flip zones are computed but display-only; M49 is blocked until they become a POI. |
| **M38** → **M40** | The Asia killzone does not exist; M40 compounds it. |
| **M42** / **M43** | Zone strength has no swept-liquidity term; un-swept liquidity between entry and target does not block entry (priced in as a partial instead). M42 extends M31. |
| **M32** | An order block does not require an FVG. *Note: the FVG-in-OB confluence **is** implemented (`setup.js:128`, weight 8) — the issue is that a zone qualifies without it.* |
| **M33** | The medium timeframe cannot originate a direction, so the counter-trend trade he demonstrates is impossible. |
| **M50** | No bias hysteresis — derived bias changes without invalidation **64.2 %** of the time. |
| **M63** / **M69** / **M70** | His "two things" entry criteria are weighted so neither is individually required; market shift is a weighted check where he calls it non-negotiable; the extreme-zone-over-flip-zone rule is absent. |
| **M68** | The two entry models (conservative vs aggressive) are not distinguishable in output. |
| **M29** | Zone mitigation counts any touch, not 50 % depth. |

## Batch 5 — journal, review and the mirror.

**M56** (the written plan has no effect on what the bots signal) · **M57** (compliance never
computed, though the data is in the DB) · **M86** (good/bad loss graded by P&L instead of
execution — a plan-violating loss is currently labelled "a good loss" and graded **A**) ·
**M88** (no entry-confluences field) · **M99** (no five-R cadence) · **M100** (missed value
setups unmeasured, though `bot_signals` already stores the data) · **M101** (`top_fix` not
period-scoped) · **M106** (no pre-trade state gate, though `coach.js:311` already states the
rule) · **M107** (no daily intention) · **M64** (no enforced pre-market routine) · **M113**
(`max_trades_day` not settable).

## Batch 6 — schema. Do this before Batch 5, because Batch 5 writes to it.

**M102 (S1, highest structural priority):** strategy edits are **in-place overwrites**
(`api.js:496`); `strategies` has no version / effective_from / updated_at, and
`trades.strategy_id` FKs a **mutable** row. This destroys the pre/post evidence Ep 27's entire
method consumes and silently rewrites history. Also **M90** (breach table) and **M88**
(confluences field) live here.

---

## The 8 items I need a decision from you on

These are marked **decide** because either reading is defensible and the choice changes trade
selection:

| | Question |
|---|---|
| **M9** | Risk ceiling: his 0.5 % guardrail, or your 1.0 % manual default? Affects position sizing 2×. |
| **M21** | Add strong/weak labels? Unlocks M24, M22, M1. Changes target selection. |
| **M16** | Should a standalone FVG (no order block) pass the POI gate? |
| **M11** | 10-trade adaptive guardrails, or his fixed thresholds? |
| **M7 / M8** | Hard veto, or keep as weights? (Resolved by M95 if you accept that fix.) |
| **M22** | Derive one swing tier from the other, or keep them independent? |
| **M24** | Blocked on M21. |
| **M94** | Max daily profit 5 %, 3 %, or 1 %? His own course says different things in different episodes. |

## What I am deliberately NOT changing

- **M108 (Sanctuary / meditation)** — `no action`. A product feature, not a bot rule. Though
  `CX8S22b1xqg` raised its standing: the 15-minute meditation is **step 1 of an enforced
  pre-market routine**, not optional garnish.
- **M109** — do **NOT** add a predictor. Ep 29: Flow AI v1 cannot read trade data, and the AI
  must not replace plan / journal / review / risk.
- **M62** — **downgraded S2→S3 and the "set default to 15" fix withdrawn.** Ep 30 sanctions
  5/10/30/60 and *"at least 15"* is a **floor, not a ceiling**. My original finding was wrong.
- **The `src/bots/smc.js` order-block method** — it already uses one method consistently, which
  is precisely what he instructs. Leave it.
- **Realized-only daily P&L** — already matches EdgeFlo exactly. Leave it.

## Verification plan (when you say go)

1. Batch 0 first, then `npm run test:now` + `api-test.js` — these must stay 36/0 and 121/0.
2. Every batch that changes a trade decision gets re-run through the independent backtest, and
   the **expectancy delta is reported** — not just "tests pass". The baseline is −0.125R / PF
   0.84, so "did not get worse" is the bar, not "did not crash".
3. Schema changes (Batch 6) get a migration and a round-trip test.
4. `diff -rq` against the pristine zip after each batch, so every change is attributable.

**Known blocker:** `analysis/fixtures/` and `analysis/independent/` were lost in a workspace
reset and are **not restored**. The backtest harness has to be rebuilt before step 2 can run.
