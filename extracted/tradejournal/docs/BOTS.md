| `src/bots/now.js` | **The current call** — one action per market (WAIT / BUY / SELL / NO TRADE / RE-CHECK), the single level to watch, the checkpoint clock, the data's freshness, and the other side named but never priced. `Now.build()` |
# The bots — market mechanics, prediction, correction

TradeJournal Pro ships five cooperating bots behind one route (`/api/bots/*`) and one
screen (sidebar → **Bots**). They implement the model taught in the *Market Mechanics
Mentorship* playlist (see `docs/PLAYLIST-CURRICULUM.md`) and they are built to be audited:
every number they print can be traced back to candles, to your own journal, or to a
backtest you can re-run yourself.

```
topdown.js    the video's top-down method, step by step  "which direction, and is it armed yet"
momentum.js   layer roles + mechanics score             "what is happening"
smc.js        structure, liquidity, sweeps, zones       "the mechanics"
setup.js      graded entry plans with sizing            "what to do"
predict.js    historical replay → probabilities          "how likely, on this market"
correction.js your journal → mistakes + guardrails       "what you keep doing"
index.js      orchestrator, news filter, signal tracking
```

**Direction comes from the method, not from a vote.** `topdown.js` implements the
procedure in the playlist, and `setup.js` refuses to arm a side the method has not
allowed: if the method is waiting, the verdict is `NO TRADE` whatever the setup model
scores (`verdict.source = 'topdown-gate'`).

---

## 1. The mechanics pipeline (what the bots look for, in order)

This is the sequence the curriculum drills, and the exact order the engine evaluates:

1. **Bias (top-down)** — the higher timeframe decides direction. The three layers have
   jobs, not weights: **bias** (decides the direction and holds the CRT range),
   **location** (premium/discount, zone, gap — the trading timeframe), **trigger**
   (confirmation on the lower timeframe). The old 3 : 2 : 1 indicator average is still
   printed, but as a display of the three indicator readings only
   (`alignment.display_note`); it never sets the direction.
2. **Structure** — swing points (fractal, strength 2 for internal / 5 for external) labelled
   `HH HL LH LL`; breaks typed as **BOS**, **CHoCH**, and **MSS** (a CHoCH that came right
   after a liquidity sweep — the highest-quality reversal signal).
3. **Liquidity** — equal highs/lows, previous day high/low, previous week high/low,
   today's extremes, un-swept swing extremes. Each pool carries a type (`BSL` above,
   `SSL` below price), strength, distance in % and ATR.
4. **Sweep (the trigger)** — a bar whose wick trades through a pool **and closes back inside it**.
   That is a stop run: the orders resting there are filled, which is the fuel for the
   reversal. Requires the level to be on the correct side of the previous close (a level
   already below price is ordinary support, not a stop run) and is de-duplicated so
   consecutive re-tests are one event.
5. **Displacement** — an expansion bar (≥ 1.2 ATR range, ≥ 55 % body) in the opposite
   direction; it is the footprint that leaves the zones behind.
6. **Zones** — the **order block** (last opposing candle before the displacement) and the
   **fair value gap** (3-candle imbalance ≥ 0.12 ATR). Both are tracked for freshness,
   number of tests, fill %, and whether a close through them turned them into a
   **breaker** (flip zone).
7. **Location** — the dealing range (auto-expanded until it spans ≥ 6 ATR) gives
   premium / equilibrium / discount, plus the 0.62–0.79 OTE band.
8. **Timing** — killzones in UTC: London 06–09, NY AM 12–15, NY PM 15–18; sessions
   Tokyo 00–07, London 07–12, NY 12–16, NY PM 16–21, Sydney 21–06.
9. **CRT / top-down method** — the five steps of the video, in order, as code:
   1. **stack** — bias TF → location TF → trigger TF, one job each (`topdown.js:layersFor`)
   2. **the right candle** — the newest higher-timeframe candle that traded into a level
      that matters (previous high/low, swing extreme, order block) and closed back away
      from it by at least 0.2 ATR (`findRange`/`bestLevelAt`). No right candle → no trade,
      and the payload says so rather than inventing one.
   3. **mark the range** — that candle's high and low. Ranges already consumed (price
      still outside by > 0.5 ATR and never reclaimed) are skipped in favour of the next
      right candle, and the skip is reported in `layers.bias.consumed_ranges`.
   4. **the sweep** — one side traded through and closed back inside → direction. Both
      sides taken is `both-sides` (chop: stand down). Still mid-sweep is `sweeping`
      (wait). A sweep that has already covered most of the range to the target is
      flagged `chase` and **blocks** — the method takes the sweep, not the tail end.
   5. **confirmation and entry** — the trigger timeframe must show displacement
      (≥ 0.8 ATR, ≤ 8 bars) or a structure shift in the reversal direction. Then two
      entries are printed: **aggressive** (at the confirmation, capped a quarter of the
      way into the range so it is never a chase) and **safer** (the pullback to the range
      mid / the fresh FVG). Stop beyond the candle that made the sweep; target the
      opposite side of the range.
   **Conflicts are resolved by the hierarchy, never by a vote** — each one comes back
   with `rule`, `resolution` and `blocks_trade`:
   | conflict | rule | outcome |
   |---|---|---|
   | `ltf-against-htf` — lower timeframe trend against the bias | the lower timeframe only times the entry, it never overrules the higher one | **does not block**: follow the higher timeframe, use the trigger TF for timing |
   | `counter-trend-crt` — a confirmed sweep against the higher-timeframe structure | a failed sweep may be traded against structure, at range size | **does not block**: range target only, half risk |
   | `no-trigger` / `no-right-candle` | with no decisive higher-timeframe read there is no trade | **blocks** |
   | `both-sides-taken` | a range with both sides taken is engineered for a bigger move | **blocks** |
   | `chase` | the sweep is the entry, not the tail of the move | **blocks** |
   **Conviction tiers** follow the video's "size to evidence": a confirmed sweep **plus**
   a trigger-timeframe confirmation is tier **A** (full plan risk), a confirmed sweep
   without the confirmation is tier **B** (half risk, range edge only), everything else
   is a watch with no position.
   `GET /api/bots/topdown` returns all of it: `method`, `layers`, `steps`, `checks`,
   `status`, `playbook`, `conflicts`, `conviction`.
10. **News + guardrails** — a high-impact release within ±45 minutes of now for the
    symbol's currencies is a hard blackout, and your personal guardrails can veto the entry.

---

### The step-5 gate (repaired 2026-10-07)

Step 5 is the lower-timeframe confirmation, and it was **dead code for the whole life of the file**:
it read `disp.bars_ago` from displacement legs that carry `i`, and compared `Math.sign('down')`
(**NaN**) against a numeric direction — so confirmation could never pass and conviction **tier A was
unreachable**. Both bugs are fixed (`dirSign()`, `ageOf()`, and the *newest* same-direction leg rather
than the first), and 13 assertions in `node scripts/topdown-test.js` now fail on the old code.
Re-measured on the same 372-window grid (6 markets × {15m,1h} × 31 re-reads, 2026-10-07):
confirmation **141** (was **0**), ranges confirmed 14, conviction **A 5 / B 9**.

## 2. The entry model and its grades (`setup.js`)

Each direction gets an independent candidate. Confluence is scored with explicit weights
so the checklist **is** the score:

| Check | Weight | What earns it |
|---|---|---|
| Sweep of opposing liquidity | 18 | a sweep within 25 bars |
| Zone to trade from | 16 | a fresh order block (or FVG) in your direction |
| Displacement leg | 15 | expansion bar after the sweep |
| Liquidity runway | 14 | a final target ≥ 1:2 that price can actually travel to |
| Structure agreement | 12 | internal trend matches the trade |
| Multi-timeframe bias | 12 | the alignment layer agrees |
| Dealing range | 10 | long in discount / short in premium |
| Higher-timeframe trend | 10 | external structure agrees |
| News | 10 | no blackout |
| Momentum not extended | 8 | RSI/MACD not already stretched against you |
| Session | 8 | inside a killzone |
| Entry not chased | 8 | price at / approaching the zone |
| Zone + imbalance nested | 8 | order block containing an unfilled FVG |
| Volatility tradeable | 6 | ATR percentile ≤ 90 |

The score is then multiplied by the killzone quality (`0.82 + 0.18 × quality`) and
**capped** by disqualifiers: no trigger → ≤ 38, no zone → ≤ 34, final R:R under 2 → ≤ 45,
invalidated zone → ≤ 20, news blackout → ≤ 40, and — importantly — a *perfect but
not-yet-valid* idea ("price has not retraced yet") → ≤ 66.

Grades: **A+ ≥ 86**, **A ≥ 72**, **B ≥ 58**, **C ≥ 44**, otherwise **no-trade**.

Levels are mechanical: entry at the order block's 50 % (body mid) or the FVG's consequent
encroachment, stop beyond the sweep extreme (or the zone's far side) plus 0.18 ATR, then a
target ladder built from real pools outward. The plan always includes **management**:
take 50 % at T1, move the stop to break-even, run the remainder to the pool at ≥ 2R.
Position size comes from the journal's own instrument maths, so a plan is always expressed
in the units you actually trade.

If a plan is good, **Log this plan** opens the normal trade form pre-filled — the bot never
places anything, and the journal stays the single source of truth.

---

## 3. Prediction (`predict.js`) — measured, not asserted

Two separate studies run every time you ask for a prediction:

**A. Setup probability — walk-forward replay.**
The entry model is replayed bar-by-bar over the market's own history (default 1 200 bars,
step 2). Each decision only sees candles that existed at that time. Every setup it would
have taken is then resolved against what actually happened, with no hindsight:

* the fill bar itself is never used for stop/target decisions (a bar that touches both has
  an unknowable path);
* if a later bar touches the stop and the target, the **stop** is assumed first;
* an unfilled limit is recorded as `no_fill`, never as a win;
* the trade is managed exactly as the plan says (partial at T1, break-even stop, runner);
* a small cost per trade covers spread/slippage.

Those outcomes train a small L2-regularised logistic regression whose features are the
confluence checklist — so a live setup gets a calibrated `P(win)` **with its sample size**.
The model, its standardised weights, its in-sample accuracy, the base rate, an
**out-of-sample check** (train on the earlier 70 % of history, test on the last 30 %) and a
predicted-vs-actual calibration table are all returned to the UI. Where the sample is thin
the API says so instead of pretending.

**B. Direction probability — empirical buckets.**
Independently, history is bucketed by the same trend/momentum read the app displays, and
the app measures how often price closed higher N bars later (default 20). That is the
honest version of "buy or sell?": *P(up) with the number of historical cases behind it.*

**Worked example — measured 2026-10-06, and reproducible:**

```bash
curl -s -H "x-session: $TOKEN" 'localhost:3000/api/bots/predict?symbol=BTCUSDT&tf=1h&bars=2000&step=6'
```

| Market (1h, 2 000 bars, step 6) | Resolved | Base win % | Managed expectancy | A-grade subset |
|---|---|---|---|---|
| BTCUSDT | 124 | 29.8 % | +0.05 R | 40 · 22.5 % · −0.46 R |
| ETHUSDT | 165 | 53.3 % | **+0.43 R** | 44 · 61.4 % · **+0.49 R** |
| XAUUSD | 249 | 32.9 % | −0.10 R | 72 · 47.2 % · **+0.37 R** |
| XAGUSD | 249 | 37.4 % | **+0.35 R** | 72 · 38.9 % · +0.16 R |
| USOIL | 216 | 20.8 % | −0.54 R | 66 · 31.8 % · −0.24 R |
| EURUSD | 186 | 38.7 % | **+0.28 R** | 54 · 29.6 % · −0.11 R |
| USDJPY | 205 | 48.8 % | **+0.33 R** | 59 · 50.9 % · +0.35 R |
| AUDUSD | 211 | 18.0 % | −0.62 R | 60 · 15.0 % · −0.61 R |
| NAS100 | 264 | 38.3 % | +0.04 R | 62 · 22.6 % · −0.38 R |
| SPX500 | 265 | 35.5 % | −0.05 R | 77 · 36.4 % · −0.10 R |
| ES | 246 | 41.9 % | +0.07 R | 95 · 43.2 % · +0.01 R |
| TSLA | 230 | 47.0 % | **+0.55 R** | 44 · 29.6 % · −0.20 R |

**Breadth across 20 markets, 1h, same window:** positive managed expectancy in **11 of 20**
(55 %), median **+0.05 R**, best +0.55 R, worst −0.62 R; **9 of 20** A-grade subsets positive.
Every run also prints an out-of-sample line (train on the earlier 70 %, test on the last 30 %) and a
predicted-vs-actual calibration table.

**Read that honestly.** The model is *not* a money printer:

* half the markets are negative over this window — that is the tool working, not failing: it tells
  you *where* the model does not work instead of selling you a win rate;
* a 30–45 % base win rate is normal for a 1:2+ R:R model and only pays if the expectancy line is
  positive after costs;
* these figures are **window-dependent** (one ~83-day sample, one regime). Re-run the command on
  your own market and timeframe, look at the out-of-sample row and the `decided` count, and treat
  small samples as noise;
* numbers in earlier versions of this document (+0.67 R on BTCUSDT 1h) came from a different,
  now-stale window — which is exactly why every figure here carries a date and a command.

### 3b. The 70 % question — measured answer (2026-10-06)

The honest version of "raise the win rate above 70 %".

**What was measured.** Every filled setup the entry model produced across 24 market/timeframe
combinations was replayed through 19 different exit plans, then filtered by 300 rule combinations
(the checklist gates, the playlist's own refinements, grade, score and structural R:R). The pool was
split **by time**: the first 70 % of the bars was the only place rules were chosen, the last 30 %
was untouched until reporting. A **win** is defined as *net ≥ +0.5R after costs* — not "closed
green", because a scratched runner that returns +0.2R is not a trade you can build a business on.

**How to reproduce it (one command, no arguments):**

```bash
node scripts/edge-report.js          # writes docs/EDGE-REPORT.md + docs/edge-report.json
```

**Result — the exit frontier (3 426 pooled trades on the untouched test window, all entry policies,
re-run 2026-10-06 11:57 UTC with per-instrument costs, 0 stops dropped by the 0.25 × ATR floor).**
`node scripts/edge-report.js --bars 2000 --step 6 --modes entry,leg,ote,mtf` → `docs/EDGE-REPORT.md` §2.
The previous version of this table was measured with a flat 0.05R cost; per-instrument costs
(spread + slippage + commission, converted to R by each trade's own stop) are what every row now uses,
and they lower every small-target row — which is the point.

| Exit plan (whole position off at one level) | Win % | Clean wins (≥ +0.5R) | Expectancy | 5 %-trimmed | Median | Break-even needs |
|---|---|---|---|---|---|---|
| 0.15R | 48.1 % | 0 % | −0.39 R | −0.36 R | −0.02 R | 95.3 % |
| 0.25R | 54.1 % | 0 % | −0.35 R | −0.32 R | +0.07 R | 87.7 % |
| 0.5R | 56.2 % | 0 % | −0.26 R | −0.23 R | +0.25 R | 73.1 % |
| 0.6R | 55.4 % | 35.2 % | −0.23 R | −0.20 R | +0.30 R | 68.5 % |
| 1R | 46.5 % | 44.5 % | −0.19 R | −0.19 R | −1.01 R | 54.8 % |
| 1.5R | 39.8 % | 38.8 % | −0.14 R | −0.15 R | −1.02 R | 43.8 % |
| 2.5R | 32.6 % | 31.2 % | **−0.03 R** | −0.08 R | −1.03 R | 31.3 % |
| 3R | 28.4 % | 27.0 % | −0.05 R | −0.13 R | −1.04 R | 27.4 % |
| 50 % at 0.5R → break-even → runner 1R | 37.0 % | 24.8 % | −0.20 R | −0.37 R | −0.44 R | 62.6 % |

Small targets are the trap: a 0.25R target is *touched* 60 % of the time but only finishes green 54 % —
the round-trip cost is larger than the target — and **nothing under 0.6R can ever book a ≥ +0.5R win**,
which is why the "clean win" column is 0 % down there. The least-bad expectancy sits at 2.5R (−0.03R),
and the median is negative at every target ≥ 1R: one tail trade carries the average.

Read the 2R row against the 35 % it needs: that is the model sitting exactly on its own break-even line —
and the reason every recommendation in the app points at *holding for the structural target* rather than
banking early.


**Result — filtering and entry policy (pooled, untouched test window, re-measured 2026-10-06 with per-instrument costs).**
Every row below comes from the same pooled pool (24 markets; 11 411 unique setups, 3 426 of them in the
untouched test window) so the rows are comparable. `leg-only` means "only take setups where a real
displacement leg exists in the window" — the playlist's own precondition, isolated from any change to the
entry price. `ote` adds the 50–79 % retrace band, `mtf` adds the lower-timeframe sweep + displacement
confirmation. Costs are charged **per instrument** (spread + slippage + commission in basis points of
price, converted to R by each trade's own stop distance), which is why these numbers are lower than the
flat-0.05R figures published earlier the same day.

| Entry policy | Filled trades (test) | Video-plan win % (test) | Expectancy | Best clean exit (≥ +0.5R net) | Expectancy of that exit |
|---|---|---|---|---|---|
| plan entry (as built) | 4 792 (1 279) | 36.8 % | −0.02 R | flat_1 → 42.5 % | −0.24 R |
| **require a displacement leg** | 2 622 (681) | **37.4 %** | −0.07 R | flat_0.75 → 43.9 % | −0.21 R |
| **leg + enter inside the OTE band** | 2 618 (681) | **37.3 %** | −0.07 R | flat_0.75 → 43.9 % | −0.21 R |
| **+ lower-timeframe confirmation (`mtf`)** | 1 379 (785) | **46.9 %** | −0.27 R | flat_0.75 → 51.9 % | −0.11 R |

`mtf` has the highest win rate of any entry rule (46.9 % video plan in the edge report; 47.4 % pooled in
its own report, 2026-10-06 11:58 UTC) and it is still expectancy-negative: **on 1 503 setups filled by both
rules, waiting for the lower timeframe bought +6.0 points of win rate and cost 0.268R of expectancy** — the confirmation moves
the entry closer to the stop, so R shrinks and cost-per-R grows. **The trades it refuses were the good ones:** of the 1 601 setups the lower
timeframe never confirmed, 321 were filled and graded by the base rule anyway, and those averaged **+0.157R**
(36.8 % wins) against −0.01R for the base rule's whole pool — the confirmation filter is anti-selective,
not protective. Full base-vs-MTF table and the refusal counterfactual: [MTF-REPORT.md](MTF-REPORT.md).

**The dial: a 70 % win rate is a choice of target, not a skill badge.** Same pool, whole position off at
one target, both questions asked separately (`node scripts/edge-report.js`, §0b):

| Target | Price reached it before the stop | Finished net positive | Expectancy | Break-even needs |
|---|---|---|---|---|
| 0.25R | 60.1 % | 55.2 % | −0.34 R | 87.7 % |
| 0.35R | 58.2 % | **55.8 %** | −0.31 R | 81.2 % |
| 0.5R | 55.1 % | 54.4 % | −0.27 R | 73.1 % |
| 1R | 45.5 % | 45.8 % | −0.18 R | 54.8 % |
| 2R | 34.0 % | 34.8 % | −0.06 R | 36.5 % |
| 2.5R | 29.9 % | 31.0 % | −0.03 R | 31.3 % |
| 3R | 25.7 % | 27.1 % | −0.04 R | 27.4 % |

Notice the divergence at small targets: below ~0.6R the round-trip cost is larger than the target, so a
target that *is touched* still books a loss. The net win rate peaks at **55.8 %** (0.35R) and falls away
on both sides; expectancy rises towards the tail (least-negative at 2.5R). **No target on the ladder
reached 70 %** — and neither did any of the 252 single/pair filters at any of the **14** distances
(`docs/EDGE-REPORT.md` §0c, best 67.1 % at a 0.25R target with a −0.22R expectancy, n = 176).
The app shows this table per market in the Prediction tab, for five filter views.

**Where the ceiling actually is — `docs/MEASURED-RULES.md`** (`node scripts/rule-sweep.js`, 2026-10-06
11:59 UTC, 288 filter × stop-floor × runway × target combinations, **7 028 unique setups**, 70/30 time split):

* **A ≥ 70 % *net* win rate does exist and it holds out of sample** — filter `displacement leg + 50 EMA
  aligned`, stop at least **1 × ATR** away, whole position out at **0.25R**: **74.8 % net wins train /
  74.0 % test** (n = 468 / 146). **Expectancy −0.084R / −0.116R**, and **zero** of those trades bank
  ≥ +0.5R. Three configurations clear 70 % on both halves (the stop floor at 1, 0.8 and 0.6 ATR); every
  one of them buys the win rate by making the target smaller than the round-trip cost.
* Highest expectancy that survives both halves: **`leg` + stop ≥ 0.6 × ATR + first target ≥ 3R, held to
  3R → +0.31R train (34.9 % wins, n = 261) / +0.56R test (42.2 % wins, n = 109)**. 16 configurations were
  positive in both halves; **none of them wins 70 % of the time.**
* Both gates that survived the sweep are now scored alongside the playlist checklist:
  `stop_ge_06atr` (a stop inside the noise band is hit by noise, and its costs eat the trade) and
  `runway3` (the first target has to pay for the risk).

**The verdict, stated plainly:**

* **A 70 % win rate and a positive expectancy are not both available from this entry model.** Measured
  2026-10-06 across 288 ruled configurations and 5 149 filter × exit evaluations: the configurations that
  win 70 %+ hold it only at a 0.25R target and lose about **0.08–0.12R per trade**, and every configuration
  that earns money in both halves wins 34–42 % of the time.
* The honest best cases are: **74.8 % / 74.0 % net wins at −0.08R / −0.12R** (train / test, 0.25R target,
  `ema50 + leg`, stop ≥ 1 ATR) or **+0.31R / +0.56R per trade at 35–42 % wins** (train / test, `leg`,
  stop ≥ 0.6 ATR, 3R target). The app offers both — as presets, with their provenance on screen — and says which is
  which.
* Per-instrument costs matter more than any filter: a 15m/1h FX entry with an 8-pip stop pays a median
  **0.216R** round trip (EURUSD 1h); gold on 1h pays 0.025R. That difference alone decides whether a
  0.5R target is worth taking.
* Rules that *do* print ≥ 70 % appear only when you pick them after seeing the test window, or on
  samples of 40–60 trades — noise, not edge.
  The gate-recording fix removed even those three: the re-run reports **zero** rows ≥ 70 % on the
  test window, and a survivor now also has to clear n ≥ 40 in the test window before it is listed.
* Waiting for a *deeper* entry (the zone's far edge) makes results clearly worse, so "wait for the
  retrace" only helps when the retrace is measured against the **displacement leg** (the OTE band), not
  when you simply demand a better price than the zone midpoint.
* **"Second chance" re-entries are a measured loser** (−0.31R to −0.38R per trade across the four entry
  policies, 99 % re-tap rate):
  the market returning to your level is not confirmation, it is just the same failing structure.
* Requiring a displacement leg, a minimum stop distance and a real first target are the refinements that
  pay — the bots expose them as `?entry=leg`, the `playlist` filter row and the two measured gates, and
  the live setups flag each one.

**What the bots do with that.** Every bot surface now reports this instead of implying an edge:

* `/api/bots/backtest` returns `frontier` (all 16 exits with break-even bars), `filters`
  (including `playlist` and `playlist_ema`), and a `verdict` object whose `meets_target` flag is
  false on every market measured so far;
* the Prediction tab renders the frontier table, the filter table, and the verdict sentence;
* the correctional bot flags *runs handed back* (trades that reached +1R and closed ≤ +0.2R) as a
  management mistake, and the coach explains that exits — not entries — are where this model earns.

**Also measured (2026-10-06 11:57 UTC, `docs/EDGE-REPORT.md`)** — 11 411 unique setups pooled, search 7 985 /
test 3 426, per-instrument cost table, entry-policy table, target dial, exit frontier with 5 %-trimmed
expectancy and medians, the **rule × target cross-tabulation** (252 filters × 14 distances: how many
reach 70 % net wins — none — and how many keep a positive expectancy there — none), the survivor list
(**empty**, requiring n ≥ 40 in the test window) and the per-market table.

**MTF entry execution, end to end (2026-10-06).** The lower-timeframe rule is no longer replay-only:

* `src/bots/predict.js` fetches the paired lower timeframe live (`MTF_ENTRY_PAIRS`, 900 bars), runs the
  same `mtfTrigger` used in the replay, and returns an actionable **refined plan** — entry = confirmation
  close, stop = HTF stop, risk in ATR, targets re-ruled from the new entry — on every candidate
  (`setups[].playlist.mtf.plan`);
* a confirmation that leaves less than **0.25 × ATR** of risk is refused with the reason shown
  (`status: 'rejected'`), because that is the floor that kills fake 10R targets;
* the Prediction tab renders the plan with a **“Save refined plan to signals”** button
  (`POST /api/bots/signals/save-plan`), which stores it with `entry_mode='mtf'`, the confirming timeframe
  and the ATR risk (schema v3, auto-migrated), so `POST /api/bots/signals/resolve` grades the *refined*
  entry — not the HTF plan — against real candles. 13 assertions cover it in `npm run test:bots`.

---

### 3c. What shipped after the studies — and how each piece was checked (2026-10-06)

The measurements above produced features. Each one was verified by hand against a scratch database
(`TRADEJOURNAL_DB=/tmp/fintest.db PORT=3210 CRON_SECRET=sek TJ_SCHEDULER=0`), then locked into the
suites (`npm run test:api` → 119 assertions, `npm run test:bots` → 139, `npm run test:ui` → 21 views,
0 console errors).

| Shipped | What it does | Evidence it works | Honest limit |
|---|---|---|---|
| **Options** (`src/options.js`) | `POST /api/options/{greeks,plan,size}`: Black-Scholes price + delta/gamma/theta/vega, break-even, ITM/OTM, premium risk sizing | ATM 1-year call at 20 % IV → **9.925** = S·N(d1) − K·e^(−rT)·N(d2); delta 0.618 ≈ N(d1); no IV → an error, never an invented number; target premium below entry → `warning` + `rr: null` | IV/premium are typed by you. There is no options feed, and the 250 bp-of-premium cost model is a stated assumption, not your broker's fill |
| **Prop challenge packs** (`src/prop.js`) | `GET /api/prop/presets`, `PUT /api/accounts/:id {prop_preset}`, `GET /api/accounts/:id/challenge` — 4 checks with progress % | 4 checks returned for a real account; a failing target flipped to `passed` after a +487.50 day (110.8 % progress, 0 % drawdown) | Presets are shapes (5 %/10 % …), not any single firm's live contract |
| **Exposure & heat** (`src/exposure.js`) | `GET /api/risk/exposure` groups open risk into clusters | Long XAUUSD + long XAGUSD collapsed into one `metals` cluster with a warning at 70 % heat | Named groups, not a covariance matrix; snapshot of open rows, not delta-weighted |
| **Notifications** (`src/notify.js`) | Webhook channels + `trade_closed` event; `POST /api/notify/test` | A test send to a bogus Discord webhook returned **404 "Unknown Webhook"** and the app **stored the failure in `last_status`** instead of showing success | https webhooks only (Slack/Discord/Telegram/Zapier). No email, no push |
| **Scheduler** (`server.js`, `vercel.json`) | `startScheduler()` (skipped on Vercel / `TJ_SCHEDULER=0`, `TJ_SCHEDULER_MIN` default 15 min) + `GET /api/cron/tick` behind `CRON_SECRET` | 401 without the secret, 200 with it; `vercel.json` schedules `0 6 * * *` | Vercel's free plan runs cron **once a day**, so the deployed cadence is daily |
| **Scale-out legs** (`src/trades.js`) | `POST /api/trades/:id/close { legs: [{pct, price, reason}] }` closes at the **pct-weighted** price | 50/25/25 @ 20100/20200/20250 → exit 20162.5, **+487.50**, **1.625R**, `legs_n` 3 (unit check + suite) | Journal-side only: a bot plan is still saved as one row |
| **Measured default view** (`predict.js` + Prediction tab) | `default_view` chooses the gate combination that measured the highest expectancy; the chip is marked `full ★` with the reason printed underneath | `/api/bots/predict` **and** `/api/bots/backtest` both carry it; jsdom smoke test asserts the star and the note | It is a measurement of the past, and the stability run below says gate sets are regime-dependent |

**The regime check that came out of this** (`node scripts/stability-report.js --bars 4000 --step 6 --modes
entry,leg`, 2026-10-06, 8 markets × 4 000 bars, 20 s → [STABILITY-REPORT.md](STABILITY-REPORT.md)):
only the **flat-3R** shape kept its sign in both halves (+0.11R → +0.05R, n 993/1 007). The
video-plan-plus-gates combination **flipped +0.18R → −0.55R** (n 43/35). Read that as: *the gate set is a
filter that happened to fit one regime*, not as an edge — which is exactly why the app labels it with its
provenance instead of a number alone.

## 4. Correctional bot (`correction.js`)

Reads your closed trades and produces, in this order: **evidence → one fix → guardrails**.

Detectors (each returns severity, the metric, the sample trades and a single corrective
action): moving stops away from entry · holding losers past 1R · cutting winners early
(MFE minus realised R) · inconsistent/oversized risk · revenge re-entry within 30 minutes
of a loss · overtrading (your heaviest days vs your lighter ones) · sub-2R planned targets ·
trades with no plan · low self-rated adherence · impulse/FOMO/revenge tagged trades ·
session bleed · instrument bleed · journalling discipline.

**Auto-grading.** Every trade is graded from its own data (planned R:R, outcome vs plan,
stop discipline, MAE/MFE, adherence, session quality) into A+/A/B/C/D with the reasons
listed. This is what fills the Analytics *Segments → grade* table, and it is why the
`Auto-grade the trades that have no grade` button exists — no manual grading required.

**Guardrails derived from your own behaviour** (not generic advice): risk per trade from
the 90th percentile your *winning* trades actually survived, a daily trade cap from what
your profitable days look like, a 30-minute cooldown, a stop after 2 consecutive losses,
and a daily loss limit from the median losing day. The live panel shows today's trades,
streak, realised result and whether the guardrails are `clear`, `caution` or **`stop`** —
and the analysis headline repeats the guardrail verdict so the risk rule travels with the
signal.

**Per-trade feedback.** `GET /api/bots/feedback/:id` reviews one trade the way a mentor
would, numerically: *"Price reached 2.10R but you closed at 0.40R — 1.70R left on the
table"*, *"This entry came 12 minutes after a loss — that is the revenge window."*

---

## 5. Signals — the bots grade themselves

`Save as signal` stores the actionable plan (side, grade, score, modelled probability,
entry, stop, T1/T2, R:R) in `bot_signals`. `Resolve signals` walks pending alerts against
real candles and writes the outcome (`win` / `loss` / `no_fill` / `expired`) plus the
managed R. The Signals tab shows tracked / pending / resolved, win rate, expectancy, and a
breakdown by grade — so the bot's public record builds itself from its own alerts instead
of from selected screenshots.

---

## 6. Using the screen

* **Market mechanics** — verdict, mechanics score with factor breakdown, the read-aloud
  narrative, candlestick chart with order blocks, FVGs, liquidity pools, sweeps and the
  trade plan drawn on it; then the two candidates with their full checklists and risk plans.
* **Prediction** — the expectancy table, live setup probabilities, the buy/sell bucket
  study, the model card, calibration, and the last N resolved trades.
* **Scan** — rank up to 24 symbols by mechanics + setup quality (fast: no prediction cost).
  Click any row to analyse that market.
* **Corrections** — behaviour score, guardrails, daily state, every mistake with its
  evidence and fix, the grade table, and the single-trade reviewer.
* **Signals** — the tracked alerts and their record.

Timeframes 1m → 1w, all asset classes. Data: **OKX** (crypto, deep intraday history),
**Yahoo Finance** (FX, indices, futures, stocks, ETFs), **CoinGecko** as a crypto
fallback — free, key-less, and cached per symbol/timeframe.

---

## 7. Limitations — read this once

* **This is not financial advice and nothing here is a promise of profit.** The tools
  measure, grade and organise; you still accept the risk of every trade.
* Probabilities come from *recent* history on *that* market and timeframe. Regimes change;
  the calibration table and out-of-sample line exist so you can see when the model is
  stale.
* Yahoo intraday history is limited (≈60 days at 5–30m) which caps backtest depth on FX,
  indices and futures at those timeframes; crypto (OKX) goes much deeper.
* Volume-dependent indicators are unavailable on some FX/index feeds — the engine marks
  this (`ind.volume_available`) instead of inventing numbers.
* Free data feeds are occasionally delayed or rate-limited; the API returns the warnings
  from the provider rather than silently substituting a different market.
* The bots deliberately say **NO TRADE** most of the time. That is a feature.

---

## 8. Bot API quick reference

| Method | Path | Notes |
|---|---|---|
| GET | `/api/bots/markets` | instruments, timeframes, killzone state, providers |
| GET | `/api/bots/candles?symbol=&tf=&limit=` | OHLCV + provider metadata (cached) |
| GET | `/api/bots/analyse?symbol=&tf=&prediction=0/1&bars=&min_rr=` | the full five-bot payload |
| GET | `/api/bots/scan?symbols=A,B,C&tf=` | ranked watchlist |
| GET | `/api/bots/predict?symbol=&tf=&bars=&step=` | probabilities + backtest summary |
| GET | `/api/bots/backtest?symbol=&tf=&samples=` | backtest detail + trade-by-trade table |
| GET | `/api/bots/correction?backfill=0/1` | mistakes, guardrails, grades |
| POST | `/api/bots/correction/backfill` | auto-grade trades with no grade |
| GET | `/api/bots/guardrails` | derived limits + today's live state |
| GET | `/api/bots/feedback/:tradeId` | per-trade behavioural review |
| GET/POST | `/api/bots/signals`, `/signals/save`, `/signals/resolve`, `/signals/stats` | tracking + self-grading |
| POST | `/api/bots/signals/save-plan` | saves a **refined (MTF) plan** exactly as shown — `entry_mode`, the confirming timeframe and the ATR risk are stored and graded on resolve |
| GET/POST | `/api/options/greeks` · `/options/plan` · `/options/size` | options maths (IV is required input) |
| GET | `/api/prop/presets`, `/api/accounts/:id/challenge` | challenge shapes + live progress |
| GET | `/api/risk/exposure` | open-risk clusters + heat |
| GET/POST/DELETE | `/api/notify/channels`, `/api/notify/test` | alert channels and an honest test send |
| GET | `/api/cron/tick` | scheduler entry point (needs `CRON_SECRET`) |
| GET | `/api/bots/sessions`, `/api/bots/news/:symbol` | killzone state, news blackout check |

Full request/response documentation: `docs/API.md` → *Bots*.

### Signals *in* — the TradingView webhook

The bots also read alerts instead of you opening the screen: **Settings → Integrations** gives you a
webhook URL (`/api/bots/webhook/tradingview?token=…`). A TradingView alert fires → the alert's symbol,
side, price and timeframe are parsed (ticker prefixes, `1!`/`.P` suffixes and aliases like `GOLD`,
`US100`, `BTCUSD` are all normalised) → the full mechanics pipeline runs on that market → the reply
carries the bot's own verdict, grade, entry/stop/targets and an **agreement** field
(`agrees` / `conflicts` / `bot says stand down` / `position management`).

With `autocreate` on, actionable plans become tracked signals, so the alert the market gave you is scored
against real candles later exactly like a hand-saved one. Alerts that cannot be parsed are still stored
with the raw body, so a broken template is easy to find. Rotate the token any time; there is a 240/hour
flood guard. TradingView posts from their servers, so the URL has to be publicly reachable — the free
Vercel deploy satisfies that (`docs/DEPLOY.md`).

Verification: `npm run test:bots` (89 assertions across every endpoint — including the webhook: token auth,
plain-text and JSON payloads, exchange-qualified tickers, interval codes, the agreement invariant and a bad
token → 401) plus the UI sweep (`npm run test:ui`), which runs a live analysis and walks all five bot tabs.

## The *now* call — one answer, dated (added 2026-10-06)

Everything else in this document describes *what the market is doing*. `src/bots/now.js`
answers the only question a trader acts on, and it answers exactly one thing:

```
action      WAIT | BUY | SELL | NO TRADE | RE-CHECK        (closed set, one per market)
headline    the instruction in a sentence, with the reason
order       only when armed: side, entry, stop, target, R:R, mode (aggressive | safer)
watch       the one level and the one condition that changes the answer
checkpoint  "the next 15m close at 14:15 UTC", "NY PM killzone opens 15:00 UTC" — wait has a clock
freshness   which bar the read came from, how old it is, how far price has moved since (ATR)
other_side  the opposite plan, named, with the reason it is not armed — never priced
since       in a replay: what the market did in the bars that followed, and what the read says now
```

Rules it enforces:

* **never two sides.** Two candidates on screen is a coin toss, not a decision. The candidate on
  the permitted side is headed `THE CALL`; any other candidate is headed `NOT ARMED … the entry
  model only`, carries no order, and sits inside a collapsed element with the reason.
* **never an undated read.** The strip prints the bar the read was made on, its age, and (when the
  live price has moved more than half an ATR since that close) a warning that the entry may
  already be gone. Freshness states: `fresh · aging · stale · market-closed · replay · unknown`.
* **conviction, priced honestly.** Tier A (range confirmed *and* lower-timeframe confirmation) takes
  the safer fill at full risk; tier B takes the deeper (aggressive) fill at half size. A chased
  range is downgraded to WAIT and the order is dropped, not shrunk.
* **guards travel with the call** — news blackout, personal guardrails, out-of-killzone notes.
* **the minimum R:R is yours.** The floor comes from Settings (`min_rr`, default **1R**, clamped
  0.1–10) or from `?min_rr=` on a single request. A plan below it is **still shown** — the trader
  chose "arm but warn" on 2026-10-06 — but it carries a red *"below your minimum"* block under the
  order and in the plan table, and the plan payload carries `below_min_rr` + `rr_note`, so it can
  never be mistaken for an unqualified instruction. Plans at or above the floor read clean.

### The two fills, and the three quality gates (2026-10-07)

> **Decisions taken 2026-10-07** (asked, answered): the desk chart stays **this app's own canvas
> renderer** — no TradingView Lightweight Charts swap — and the minimum R:R default stays **1R**
> (editable, 0.1–10).

The CRT plan prints **two** entries, and they are the two the method teaches:

| Row | Entry | Risk | When it applies |
|---|---|---|---|
| **aggressive** | the confirmation price — where price is now, back inside the range | stop beyond the candle that made the sweep | tier B (range confirmed, lower timeframe not yet), **half size** |
| **safer** | the **retest of the swept edge** — sell the high again / buy the low again | same stop, smaller risk, same opposite-edge target | tier A (range confirmed *and* the lower timeframe confirmed), **full size** |

Before 2026-10-07 these two rows were the *same number* in 60/60 live plans (the safer midpoint was
clamped into the aggressive slot). Where price is already sitting on the retest the two rows coincide
again — legitimately, and the caption says so.

Three gates decide whether a formed range is a trade at all:

* **noise floor** — the stop must clear **0.25 ATR** from the entry. (XRPUSDT 5m printed a 10.46R
  "plan" off a 0.08-ATR stop, roughly one spread wide.)
* **risk / range ≤ 2** — the stop may not sit more than twice the range's width away from the entry.
  Measured across 70 instruments × 5 timeframes on 2026-10-07: properly paired plans sat at
  **0.31–1.52**, broken ones at **2.6–22.7** (MSFT 1d 22.7, NVDA 1d 11.6, JP225 1d 13.0 — all of
  which had printed 0.04–0.10R "plans").
* **thin sweep** (< 0.25 ATR wick) is **informational only** — the method wants price to trade
  outside and come back, so a shallow wick is not a defect by itself.

Live effect on a 350-combo sweep (2026-10-07): **6 armed**, 136 WAIT, 168 NO TRADE, 40 provider
misses. See `docs/NOT-IMPLEMENTED.md` §5b for the caveats that come with those numbers.

### Bar replay — "what did the bot say then?"

`GET /api/bots/analyse?symbol=…&tf=…&trim=N` (or `as_of=ISO`) rebuilds the entire read from the
candles that existed N bars ago: same code, same rules, no look-ahead (the level window is pinned
to a fixed trailing slice, so more history cannot change the verdict either). The Bots view exposes
it as a slider (− 5 / + 5 / Live / drag). In a replay:

* the payload says `replay: { trim }`, every `now` block says `evaluated_on.replay = true`;
* the chart is stamped `REPLAY · N bars back` and the read-from line quotes the replayed bar;
* `now.since` reports the price move and the verdict change across exactly those N bars.

Window: 0–400 bars (`trim` is clamped server-side). This is the honest way to judge the method —
it cannot see the bars it is being judged on.

### Drawings — the trader's own work, stored like the journal

`GET|PUT|DELETE /api/chart/drawings?symbol=&tf=` keep trend lines, rays, price lines, boxes, fib
retracements and measurements per market *and* timeframe in the database (table
`chart_drawings`), not in one browser's `localStorage`. Tools: cursor (select + Delete),
line, horizontal ray, price line, box, fib, measure, magnet snap, undo, clear. Drawings are stored
in (time, price), so they survive zoom, pan and a timeframe change.

