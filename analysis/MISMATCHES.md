# MISMATCH LEDGER — what does not match the course, and what to change or add

Running list from the full-playlist pass. Every row cites the episode, the code, and the concrete change.
**Nothing here has been applied.** Status column is the recommendation, not an action taken.

## Severity

- **S1 — behaviour wrong**: the bot does something the course says not to, or omits a rule the course states as mechanical
- **S2 — behaviour weaker/advisory**: course states a hard rule, bot scores it instead of enforcing it
- **S3 — data or surface missing**: the course expects a field or view the app does not record
- **S4 — label/doc wrong**: code is fine, wording or documentation misstates it

---

## Open items

| # | Sev | From | What does not match | Change / add | Status |
|---|---|---|---|---|---|
| M1 | **S1** | **Ep 5** | **Swing points are fractals, not the course's BOS-relative extremes.** `smc.js:38 findSwings(strength=2)` marks any bar that is the strict local max/min of 2 bars either side. The course defines them directionally and relative to the break: swing high = *"the highest point that led to the pullback to start"*; swing low = *"the **lowest** point that created the break of structure"*, and explicitly rejects intermediate lows (*"Is this a swing low? No… it's not the lowest point that created the break of structure"*). `alternate()` (`:55`) dedupes geometrically but does not apply the BOS-relative rule. **Everything downstream inherits this** — `marketStructure()` (`:69-73`) labels HH/HL/LH/LL from these swings, driving trend, BOS, CHoCH, MSS and therefore bias. | Add a swing *validation* pass that, per leg, keeps only the extreme that produced the BOS, and compare the resulting swing count and trend label against the current fractal output over the fixture set. Measure before changing: if trend labels shift materially, this is a strategy change needing a backtest, not a patch. | **needs measurement first** |
| M2 | **S3** | **Ep 5** | **No "swing range" concept.** 0 hits for `swing_range`/`swingRange` in `src/bots/`. The course treats the span between the current swing high and swing low as *the* working area: *"this becomes my swing range and this is the area that I want to focus on. I don't care about what price is doing outside of this swing range."* | Add the current swing range to the structure output and use it to bound where zones are considered valid. Cheap to add; changes what the UI reports, so wire it as information first. | **add** |
| M3 | S4 | **Ep 5** | **Pullback trigger is keyed to the zone, not the BOS.** `setup.js:230/235` set `entryStatus='approaching'` ("waiting for the retrace into the zone") and `:329` warns *"Chasing here breaks the model's edge"*. The anti-chase intent is present, but the course keys the expected pullback to the **break of structure** event (*"after a break of structure… expect price to start retracing"*), not to distance from a zone. | Not a defect — record the difference. Optionally also flag "BOS just printed, expect retrace" as a distinct state. | **note only** |
| M4 | **S1** | Ep 30 | News label states the wrong window and wrong direction. `setup.js:168` reads *"No high-impact releases due in the next 60 minutes."* Actual filter (`index.js:54-77`) is **±45 minutes, symmetric**, and the only `newsWindowMin` in the tree is that 45 default. | One-string fix: state ±45 min. The symmetric half is the one catching his up-100-then-down-100 manipulation, so the wording currently hides the useful behaviour. | **fix (user-visible string)** |
| M5 | **S1** | Ep 11 DST | Killzone hours drift with DST. `SILVER_BULLETS` hardcodes fixed UTC hours; London is pinned to EDT and NY AM to EST, so neither is correct year-round. Worth up to 3.0 of 6 session points. | Patch `0002` ready, `git apply --check` clean. | **patch ready** |
| M6 | **S1** | audit | Latent crash: unguarded `SMC.analyse` on <30 candles (`setup.js:141`) → `TypeError` (floor at `smc.js:660`). | Patch `0001` ready. | **patch ready** |
| M7 | **S2** | Ep 25 | 2R minimum is advisory, not a veto. Below `minRR` the score is capped at 45 → grade C → `ok:true` (`setup.js:320`). Course: *"if the trade idea presents a risk to reward ratio of less than two… I'm going to be passing on the trade."* Reproduced `EURUSD grade=C score=45 rr_final=1.11 ok=true`. | Either make <2R a hard no-trade, or document that C means "paper/half risk". Product decision. | **decide** |
| M8 | **S2** | Ep 25 | Killzone failure applies **no cap at all** — purely advisory, though the course lists timing as one of five all-or-nothing triggers. | Add a cap, or document. | **decide** |
| M9 | **S1** | Ep 21/31 | **No 1% risk ceiling.** `routes/api.js:566` stores `risk_pct` unclamped; `:398`/`:711` accept it as a query param; `correction.js:400` upper bound is `Math.min(2,…)` — **twice** his stated maximum. Ep 21: *"The maximum is 1%."* Ep 31: *"should not even be more than 0.5%."* Ep 0's own origin story is a 0.5-lot-on-$500 blow-up. | Clamp to 1% (or 0.5%) at the API boundary. This is the highest-consequence unenforced rule found so far. | **decide — high priority** |
| M10 | **S1** | Ep 19 | Monday / Friday / December stand-down **absent**. Only day arithmetic is `smc.js:326-327` (Monday anchor for PDH/PDL, not a veto); sessions `:611-615` and killzones `:630-632` are hour-of-day only. Course criteria are calendar-based and need only timestamps the bot already has. | Implement as a **filter on marginal setups, not a blackout** — his A+ exception means A+ still trades a Monday. Suppress B and C on Mon/Fri/Dec. | **add** |
| M11 | **S1** | Ep 27+26 | Adaptive guardrails derive from **10 trades** (`correction.js:389`). Ep 27 floor is 30–50 minimum / 100 preferred; Ep 26 says no plan changes before a **quarterly** review. Two episodes, both far above 10. | Raise the gate, or make the first N trades observation-only. | **decide** |
| M12 | **S3** | Ep 26 | **Rule breaks computed but never persisted.** `correction.js:464-467` produces named breaches; `performance.js` has **zero** references. Ep 26 lists "rule breaks" among the metrics a weekly review tracks. | Aggregate breaches into the performance summary. | **add** |
| M13 | **S3** | Ep 26 | **No weekly or quarterly review period.** Only `monthly` exists (`performance.js:538`). Quarterly is the cadence at which he says plan changes become legitimate. | Add weekly/quarterly aggregations. | **add** |
| M14 | **S3** | Ep 23+24 | **No pre-market-routine completion flag.** Listed in both episodes' daily-stats; Ep 24: *"there's probably like a direct correlation between whether you conducted a pre-market routine and whether you actually make money on the day."* | Add a daily boolean. | **add** |
| M15 | **S3** | Ep 23+24 | **No journal-completeness indicator** (his "gray dot = missing, turns to complete"). | Derive from trades vs journalled count. | **add** |
| M16 | **S1** | Ep 15 (bonus) | Standalone-FVG fallback passes the hard POI gate (`setup.js:120-122`). Course: *"I want the fair value gap to be within the order block itself."* Measured 1145 OB / 28 standalone FVG, 19 tradeable = 2.4%. | Gate standalone FVGs behind an explicit flag, default off. | **decide** |
| M17 | **S4** | Ep 32 | `PLAYLIST-CURRICULUM.md:85` claims *"Journal streaks / checklist logging"*. Checklist logging is real (`db.js:228`, 67 hits). The only streak is **consecutive losses** (`correction.js:459`); no day-counting habit streak exists. | Reword the row, or add a habit streak. **Ep 32 still unread** — verify against its content. | **verify then reword** |
| M18 | **S4** | docs | `PLAYLIST-CURRICULUM.md` does not state which of the five A+ triggers are advisory vs gating (M7, M8). | Add a column. | **add** |
| M19 | S4 | audit | `docs/NOT-IMPLEMENTED.md` §2 row 8 claims `aria-*`/`role=` count 0; the tree has 3. | Correct the count. | **fix** |
| M20 | **S1** | audit | `zone_tf` dead config: `STACK['15m']` declares `zone:'1h'` but `topdown.js:105 zone_tf` is read nowhere, so the location layer ran on `entryTf` and the API reported `zone: tf=15m`. | Patch `0003` fixes **misreporting only** — measured 0/464 decision changes. Feeding the layer into decisions needs `topdown.js:633` + `setup.js:131` and **would** change trades → backtest first. | **patch ready (report-only)** |

---

## Not mismatches — verified faithful

Recorded so the ledger is not read as a list of defects only.

- **News filter is stricter than the course** (`index.js:54-77`): high-impact only, watchlist currencies, ±45 min symmetric vs his 15-min floor, plus a 6-hour look-ahead. Ep 30 recommends avoiding news entirely.
- **Stop placement is stricter** (`setup.js:179-181`): takes the *further* of zone edge and sweep extreme, + 0.18 ATR.
- **Order blocks use one method uniformly** (`smc.js:180-196`) — he advises *"just stick to one method."*
- **Process scored apart from outcome** (`correction.js:330` "a good loss (+6)", `:522` "the P&L is beside the point") — the strongest match in the audit.
- **BOS/CHoCH/MSS derived from labelled swings** (`smc.js:98-115`) — the event taxonomy matches Ep 5, even though the swing *inputs* diverge (M1).
- **Backtest register clears his sample floor**: 7580 samples → 7028 unique setups, against his 30–50 minimum.
- **Per-trade journal data exceeds his list**: `entry exit stop target size fees gross_pnl net_pnl risk_amount r_multiple planned_r mae_r mfe_r stop_moved exit_reason setup_grade session`.
