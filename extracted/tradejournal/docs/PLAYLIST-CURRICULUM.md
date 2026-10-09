# Playlist curriculum → implementation map

> **Audit (2026-10-06, second pass).** The question was *"is it just the top-down
> analysis, or is the rest of the playlist not followed either?"* — answered honestly:
>
> * **One lesson had genuinely drifted** — episode 11 (top-down). It had been turned into a
>   3:2:1 indicator average instead of the taught hierarchy. That is fixed: `src/bots/topdown.js`
>   is now the five taught steps, and the higher timeframe decides direction (the average is
>   display-only and labelled as such).
> * **Everything else was already the playlist's model, not a substitute for it** — the SMC
>   primitives (no. 2, 5–10, 13–15, 20), the sniper entry model (18), the NO-TRADE rules (19),
>   risk (21), killzones (12), news windows (30) and the prop rules (31) were built from the
>   lessons in the first place.
> * **Four episodes are partial on purpose** (17, 23, 24, 32) — a journal can store and measure a
>   written plan, a daily review and a 21-day streak; it cannot do the review *for* you.
>   **Two have no honest code surface** (0, B1) — autobiography and mindset.
> * **Nothing else in the 47 uploads maps to behaviour that is missing from the code.** Where the
>   playlist is discretionary, the app is deliberately stricter — and it says NO TRADE more often
>   as a result (see §"What is *not* taken from the playlist").
>
> **Added in the same pass:** the *now* call (`src/bots/now.js`) — one dated action per market
> ("what do I do at this moment"), bar replay (`?trim=`/`?as_of=`) so any read can be re-created
> from the candles that existed then, and chart drawings stored server-side.
>
> **Method update (2026-10-06).** The top-down analysis is now implemented as the
> video teaches it, step by step, in `src/bots/topdown.js` and surfaced at
> `GET /api/bots/topdown` plus the "Top-down method" panel on the Bots view:
>
> 1. timeframe stack with one job per timeframe (bias / location / trigger)
> 2. the **right candle** — the higher-timeframe candle that reacted at a level that matters
> 3. mark that candle's **range**
> 4. wait for the **sweep** of one side that fails to hold
> 5. **confirm** on the lower timeframe, then enter (aggressive at confirmation, safer on the pullback),
>    stop beyond the sweeping candle, target the opposite side of the range
>
> Conflict handling follows the taught hierarchy rather than a weighted vote: the
> higher timeframe decides direction, lower timeframes only time it, and a genuine
> conflict means stand down and wait for the next right candle. The old 3:2:1
> indicator average still exists but is labelled display-only.

**Source:** *FREE Market Mechanics Mentorship | Full Trading Course* — Brad Goh (The Trading
Geek), YouTube playlist `PLBYSdC_HMWMrXE0cmstpBbcIN5pLgebEm` (47 videos, ~1 M views).

The bots in this app are not "AI flavoured". They implement the specific model this
playlist teaches — Smart-Money / ICT mechanics — as deterministic code, and every lesson
below is mapped either to a module or to the exact place in the UI where you use it.

Symbol legend: **✔** implemented · **◐** partially implemented (see the note) · **—** a
judgement/habit lesson with no code surface (the app supports it through journalling).

| # | Episode | Taught | Where it lives |
|---|---|---|---|
| 0 | My story | Why he trades | — |
| 1 | Top 1 % mindset | Expectations, patience | Coach + Corrections (behaviour score) |
| 2 | How price actually moves | Orders, liquidity, stop runs | `smc.js` → sweeps, liquidity pools |
| 3 | Forex basics | Pairs, pips, lots | `instruments.js` (pips, value per point) |
| 4 | Mindset foundations | Process over outcome | Coach insights, journal prompts |
| 5 | Market structure | HH/HL/LH/LL, BOS, CHoCH | `smc.js` → `marketStructure()` ✔ |
| 6 | Candlesticks | Wicks, bodies, rejection | `indicators.js` → 30 patterns + wick logic in sweeps |
| 7 | Supply & demand zones | Where orders rest | `smc.js` → order blocks ✔ |
| 8 | Premium & discount | Buy cheap, sell expensive | `smc.js` → `premiumDiscount()` (0.62–0.79 OTE) ✔ |
| 9 | FVG / imbalance | The void displacement leaves | `smc.js` → `findFvgs()` (50 % = consequent encroachment) ✔ |
| 10 | Order blocks | Last opposing candle | `smc.js` → `findOrderBlocks()` (fresh/tests/breached) ✔ |
| 11 | Top-down analysis | HTF decides direction | **`topdown.js` — the five steps implemented literally** (right candle → range → sweep → lower-TF confirmation), one job per timeframe, conflicts resolved by hierarchy. `momentum.js` reports the layers; the 3:2:1 indicator average is now display-only ✔ |
| 12 | ICT killzones | When to trade | `smc.js` → `sessionState()` (London 06–09, NY 12–15/15–18 UTC) ✔ |
| 13 | Liquidity & inducement | Stops before the real move | `smc.js` → pools + `inducement` detector ✔ |
| 14 | Flip zones / breakers | Failed zones reverse role | `smc.js` → `findBreakers()` ✔ |
| 15 | Daily bias | The day's direction | Bots → Top-down method panel: `layers.bias` (daily/weekly read, CRT state, right candle, range) + headline ✔ |
| 16 | Trading plan | Written rules | Playbook view + guardrails from `correction.js` ✔ |
| 17 | Full SMC plan + routine | Daily routine | Journal + 21-day discipline tracking ◐ |
| 18 | **Entry models (sniper)** | Sweep → displacement → zone → retest | `setup.js` → `buildSetups()` ✔ (the core of the app), now **gated by the method**: aggressive (at confirmation) and safer (pullback to the mid / fresh FVG) entries from `topdown.js`, with conviction tiers A/B/watch |
| 19 | When NOT to trade | Standing down is a skill | Score caps + vetoes + **NO TRADE** verdicts ✔ · the *now* strip states the stand-down and what would change it, with the clock (`now.js`) ✔ |
| 20 | Stop & target placement | Place behind the reason | `setup.js` → stop beyond sweep/zone + 0.18 ATR, target ladder ✔ · CRT plans: **stop beyond the candle that made the sweep, target the opposite side of the range** (`topdown.js:readRange`) ✔ |
| 21 | Risk management | 1–2 % per trade, R-based | `setup.js` sizing + `correction.js` guardrails ✔ |
| 22 | Psychology | Discipline under pressure | Coach + emotion tags on trades ✔ |
| 23 | Journalling | Write it down | Journal view + thesis/lesson fields + detectors ◐ |
| 24 | Daily review | Review every session | Journal + daily review fields + Corrections ◐ |
| 25 | A+ setups | What perfect looks like | Grades A+/A/B/C with weighted checklist ✔ |
| 26 | Review like a pro | Excursions, not just P&L | MAE/MFE analysis in `correction.js` ✔ |
| 27 | Improve with data | Statistics over feelings | Analytics, expectancy, backtest replay ✔ · **bar replay on the live chart** (`?trim=N`): every read can be re-created from the candles that existed then, then compared with what happened next ✔ |
| 28 | Emotional regulation | Tilt control | Revenge-window detector + cooldown guardrail ✔ |
| 29 | Using AI | Assist, don't obey | The bots (this doc) — with sample sizes shown ✔ · one action per market, the other side named and unpriced ✔ |
| 30 | High-impact news | Blackout windows | `bots/index.js` → `newsCheck()` (±45 min, currency-aware) ✔ |
| 31 | Prop-firm challenges | Drawdown/target rules | Accounts (daily loss limit, max DD, target) + guardrails ✔ |
| 32 | 21-day discipline | Habit building | Journal streaks / checklist logging ◐ |
| 33 | Graduation | Where to go next | Docs + Playbook |
| B1 | Reality transurfing | Mindset | — |
| B2 | Live breakdown | Chart walk-throughs | Bots → narrative "read-aloud" mirrors this format |
| B3 | Liquidity + OB + FVG sniper entries | The pattern in full | `setup.js` + `smc.js` ✔ |
| B4 | Gold scalping | Short-timeframe execution | Works on 1m–15m (killzone + ATR filters apply) ✔ |
| B5 | Daily routine | Preparation | Bots scan + Market overview |
| B6 | 10 years in 60 minutes | Lessons | Docs |

## Coverage at a glance (measured against the table above)

| Bucket | Count | What it means |
|---|---|---|
| Direct code module (✔) | **25** | structure, zones, FVGs, breakers, sweeps, liquidity, premium/discount, CRT, killzones, top-down bias, the sniper entry model, NO-TRADE vetoes, stop/target placement, risk, news blackout, prop rules, MAE/MFE review, A+ grading, backtest replay, data-driven improvement, emotional guardrails, AI-assist discipline, journal detectors, playbook |
| Judge-and-coach surface (no symbol in the table) | **9** | mindset/expectations, how price actually moves (taught by the sweeps/liquidity module), forex basics (instrument specs), candlestick library (30 patterns), live chart walk-throughs, routine, graduation, "10 years in 60 minutes" — surfaced as the coach's behavioural rules, the read-aloud narrative and the docs |
| Partial (◐) | **4** | the written trading plan, journalling, daily review, 21-day discipline: the app stores and measures them, it does not (and cannot) *make* you do them |
| Mindset only (—) | **2** | the two autobiography/mindset uploads — no honest code surface |

That is **40 mapped episodes out of the 47 uploads** in the playlist (the rest are intros, re-uploads and
announcements of lessons already covered). Counted by behaviour rather than titles, the app implements
**11 correction detectors, 25 coach rules, 17 weighted entry checkpoints, 30 candlestick patterns and
14 SMC structure primitives** — every one of them traceable to a lesson above.

## Where the app is stricter than the video (deliberate, listed)

| The mentor does this | The code does this instead | Why |
|---|---|---|
| "I can see the level here" | a pool needs a price, an ATR distance and a fresh/swept flag | a level you cannot write down cannot be checked later |
| waits for "a sweep" | sweep = wick ≥ 0.08 ATR through the pool **and** a close back inside | mid-sweep entries were losing in the measured sample |
| takes "a confirmation" | displacement ≥ 1.2 ATR or a structure shift on the lower timeframe | "looks strong" is not testable |
| re-enters after a failed first attempt (ep. 32's "second chance") | flagged as a trap: the measured re-tap wins **13.5–15.2 %** of the time | the double tap is the model being broken, not the model working |
| can hold for the big runner | first target at the opposite side of the range, runner only after a structure shift | measured: the runner without the range target is where the expectancy went negative |

## The model, stated exactly as the bot implements it

```
HTF bias            → 1h/4h/1d trend decides direction
mark liquidity      → equal highs/lows, PDH/PDL, PWH/PWL, session extremes
sweep               → wick THROUGH a pool, CLOSE BACK INSIDE (stop run)
displacement        → ≥1.2 ATR expansion bar that breaks structure (BOS/CHoCH → MSS)
zones               → order block (last opposing candle) + FVG (enter at the 50 %)
retest entry        → limit at the zone; stop beyond the sweep wick; target opposing liquidity
minimum             → 1:2 R:R, 1–2 % risk, killzone-only, news blackout respected
management          → 50 % at T1, stop to break-even, runner to the ≥2R pool
CRT                 → HTF candle range → sweep one side → fail to hold → opposite side
never               → front-run the sweep, chase the entry, or trade out of boredom
```

## What is *not* taken from the playlist

The playlist is a discretionary method taught by a human reading charts. This app makes it
mechanical, so two things differ by design:

1. **Discretion is replaced by explicit rules.** Where the mentor "sees" a level, the bot
   requires a measurable definition (a pool with a price, a sweep with a wick ≥ 0.08 ATR
   that closes back inside, a zone with a size ≥ 0.12 ATR). That is stricter than the video
   and it will say NO TRADE far more often.
2. **Every claim is measurable.** The prediction layer replays the model over history and
   reports the expectancy, sample size, calibration and out-of-sample accuracy for the
   market you are looking at — including when the answer is "this has no edge here".

See `docs/BOTS.md` for the implemented pipeline, the weights, and the measured results.

## Measured refinements (2026-10-06)

The playlist's refinement rules were isolated and measured across 24 markets
(`node scripts/edge-report.js` → **docs/EDGE-REPORT.md**; `node scripts/rule-sweep.js` → **docs/MEASURED-RULES.md**).
All figures below are net of **per-instrument costs** (spread + slippage + commission in bp of price):

| Playlist rule | What it measured |
|---|---|
| *No displacement, no trade* (a real expansion leg must exist in the window) | one of the filters that pays: clean wins (≥ +0.5R net) at a 0.75R target rise 45.6 % → **46.1 %**, and the video-plan win rate 38.4 % → **40.0 %**, in exchange for ~30 % fewer setups. Its bigger contribution is enabling the *stop floor* rule: `leg + stop ≥ 0.6 × ATR` is in every configuration that stayed positive out of sample |
| *Second chance* — take the zone again after a failed first attempt (ep. 32) | price re-tapped the level 99 % of the time, but the re-entry won only 14 % of the time: **−0.34R per trade** across 4 239 stopped trades. The bots now flag it as a trap rather than a tactic |
| *Enter deeper into the zone* (far edge) | **worse**: 40.6 % clean wins vs 52 % at the time — a deeper entry usually means the zone is being broken |
| *Take the lower-timeframe confirmation before entering* (the "refined entry") | the **highest win rate of any entry rule**: 45.7 % video plan, 52.7 % clean at 0.75R — and still expectancy-negative (−0.10R). It changes *when* you enter, not the exit geometry |
| *Let the first target pay for the risk* (implied by every 1:2+ teaching) | the one rule that turns the model positive in both halves: **displacement-leg entry + stop ≥ 0.6 ATR, held to a 3R target → 261 setups +0.31R in sample / 109 setups +0.56R out of sample** (35–42 % wins), versus −0.08R when the same model is filtered for a 0.25R target |
| *50 EMA + MACD direction filter* | the strongest win-rate lever measured: `displacement leg + 50 EMA aligned + stop ≥ 1 ATR` at a 0.25R target wins **77.1 % train / 68.8 % test** — and still loses 0.10R per trade, because the target is smaller than the round-trip cost on the tight-stop markets |
| *Win rate as a goal in itself* | **the honest answer to "can this win 70 %?"** — measured 2026-10-06: a 70 %+ win rate and a positive expectancy were not both available from this entry model in any of 288 configurations. The app therefore offers both as presets, each labelled with its own measured number |
