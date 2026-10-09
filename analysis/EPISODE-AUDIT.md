# Full-playlist episode audit — running ledger

**Method correction.** Earlier sections of `ANALYSIS.md` (§14–§23) were written from **1–2 of the 4–5 chunks**
each transcript returns — roughly the first quarter of each video. This ledger tracks a complete pass:
every episode, every chunk, in playlist order (Ep 0 → 33, then bonuses, then the EdgeFlo tool episodes).

Route: `https://youtubetotranscript.com/transcript?v=<ID>` — always the plain URL, with an explicit
`chunkIndex`. YouTube's own `watch?v=` page truncates at ~1 000 words and must not be used.

Legend: `—` not started · `◐` partially read · `✔` all chunks read · `n/a` no code surface

| Ep | ID | Len | Chunks | Read | Title | Code surface |
|---|---|---|---|---|---|---|
| 0 | IM9MYudJSxs | 20:51 | 3/3 | ✔ | How I Went From Broke to Millionaire Trader | philosophy only |
| 1 | xwvPmhArfEY | 30:46 | 4/5 | ✔ | How to Trade Like the Top 1% | endorsed-primitive list — all 7 present |
| 2 | wZyxxo0qkPo | 36:08 | 5/5 | ✔ | How Price Really Moves | 5 blank-chart questions — 4/5 answered, phase absent (M25) |
| 3 | vP9gmvxdFd8 | 46:37 | 6/6 | ✔ | How to Trade Forex For Beginners | three Ms; symbol universe matches majors-only |
| 4 | FXwJ26zT8Ds | 25:32 | 4/4 | ✔ | Reprogramming Your Mind | coach.js — all 4 belief behaviours covered; nightly protocol 1/3 (M28) |
| 5 | waLWuc6_HC0 | 50:32 | 7/7 | ✔ | **Market Structure** | **smc.js structure** — body-close rule faithful; M1/M21/M24 |
| 6 | Dc0Z1B6jckA | 30:29 | 3/3 | ✔ | Candlestick Patterns | informational only — verified faithful (all 6 rules) |
| 7 | 52aKS7HN_jI | 32:09 | 5/5 | ✔ | **Institutional Supply & Demand Zones** | **smc.js zones** — pivot method faithful; M29/M30 |
| 8 | xR1KUjv0PB8 | 25:33 | 4/4 | ✔ | **Premium and Discount** | **setup.js:130-133 direction rule exact**; M31 no depth term |
| 9 | 9P-u7MWosFo | 31:03 | 5/5 | ✔ | **Fair Value Gaps / Imbalance** | **smc.js:707 findFvgs — true 3-candle gap test**; M16 narrowed |
| 10 | kIBIM4by-Sc | 41:57 | 6/6 | ✔ | **Order Blocks** | **smc.js:180 OB** — pivot method faithful; **M32 no FVG prerequisite** |
| 11 | qtrATSo3-lQ | 49:07 | 8/8 | ✔ | **Top Down Analysis Strategy** | **topdown.js STACK** — TF stacks exact; **M33 MTF cannot originate a direction** |
| 12 | uLw-qdpV3uk | 26:32 | 4/4 | ✔ | **ICT Killzones** | **smc.js:610-623 sessions** — London window exact; **M37 two offsets, M38 no Asia, M39 no London close** |
| 13 | TthzSVTzWoE | 53:52 | 8/8 | ✔ | **Liquidity Concepts & Inducements** | **smc.js:352 liquidity / :440 sweeps** — V-shape sweep exact; **M42 no swept-liquidity zone term, M43 wall does not block** |
| 14 | mdR4xijBaKE | 31:16 | 5/5 | ✔ | **Flip Zones** | **smc.js:291 findBreakers** — concept present and correctly named; **M47 never consumed as a POI** |
| 15 | 8ZfPIVt4IBs | 38:11 | 6/6 | ✔ | **How To Find Daily Bias** | 5-step bias checklist; invalidation uses a **close** ✔; **M50 no hysteresis (64.2% flip w/o invalidation)** · **M51 3-target ladder vs one target** |
| 16 | 4MG3uUyoQCc | 27:50 | 5/5 | ✔ | **Building a Trading Plan** | `strategies` table maps to his 6 questions ✔; **M56 bots never read the plan** · **M57 compliance never computed (data exists, unread)** |
| 17 | gECKHjUnEjU | 44:44 | 7/7 | ✔ | **My Full SMC Trading Plan + Daily Routine** | his actual plan; **M61 `vetoes` is dead code, docstring false** · **M62 news ±45 vs his ±15** · **M63 "two things" not both required** · confirms M51 ("I don't do partial profits") |
| 18 | gi1h5Fvn7nY | 45:51 | 7/7 | ✔ | **Entry Models (SNIPER ENTRIES)** | flip + market-shift models; break detection **is** close-based ✔; **M68 models not distinguishable** · **M69 market shift is "the non-negotiable"** · settles M48 |
| 19 | kVEx1QzLfQ0 | 23:45 | 4/4 | ✔ | **When Not to Trade** | **EIGHT** criteria (my earlier note said four); 3 absent, 1 wrong window, 1 not gated; **A+ exception settles M10 as a grade filter**; **M74 month-end** |
| 20 | JRiiQWeooMc | 21:23 | 4/4 | ✔ | **Where to Place Your Stop Loss & Take Profit** | `setup.js:174`; **M75 stop takes the FURTHER of two candidates, his rule is the nearer (median +0.66 ATR risk, −3.83R)** · **M76 "protected high" not modelled** |
| 21 | 1s8ea5SH7ZA | 30:46 | 5/5 | ✔ | **Risk Management** | his numbers match `correction.js:386` ✔; **M9 ceiling is `Math.min(2,…)` = 2 %, double his 1 %** · **M79 guardrails return `status:"stop"` but nothing blocks** |
| 22 | JxiRzhjq2t8 | 50:09 | 7 | **COMPLETE** | Trading Psychology | M83-M85; annotates M79, M48, M75, M81, M82 |
| 23 | Gx6KAhhWn10 | 15:00 | 3 | **COMPLETE** | Journalling Your Trades | M86-M89; extends M85; annotates M51, M58, M59 |
| 24 | 4sN-gnJKRtA | 20:00 | 4 | **COMPLETE** | How to Review Your Day | M90-M94; deepens M79, M80, M86 |
| 25 | V4Unokfrqjw | 25:00 | 4 | **COMPLETE** | How I Find A+ Setups | M95-M98; annotates M7, M8, M58, M71, M81, M82 |
| 26 | xoUlvwdBVJ4 | 22:00 | 4 | **COMPLETE** | Review Your Trades Like a Pro | M99-M101; annotates M11, M57, M92 |
| 27 | IieXTRD15GU | 24:00 | 4 | **COMPLETE** | How to Improve Your Strategy With Data | M102-M105; annotates M11, M56, M99 |
| 28 | MKSwk0lEtZ0 | 20:00 | 4 | **COMPLETE** | Emotional Regulation | M106-M108; annotates M79, M82, M89 |
| 29 | iGORytFiDnU | 28:00 | 5 | **COMPLETE** | How to Use AI for Trading | M109; annotates M85, M95, M105 |
| 30 | jl9t6KMoiHg | 18:00 | 4 | **COMPLETE** | Trading High Impact News | M110-M111; **corrects M62**, M4; annotates M61 |
| 31 | kRYQFKysfis | 30:00 | 5 | **COMPLETE** | How to Pass Prop Firm Challenges | M112-M113; annotates M9, M82, M83, M94 |
| 32 | TIpUnwVftgU | 20:00 | 4 | **COMPLETE** | Become a Disciplined Trader in 21 Days | M114-M115; annotates M58, M82, M105; **refutes predict.js:445** |
| 33 | 3rtET_1E040 | 26:00 | 3 | **COMPLETE** | Graduation — Lessons I Wish I Knew Earlier | **no new items** — motivational; reinforces M102, M115; confirms Edge Flow scope |
| B1 | kJWmeSLfP64 | 1:31:45 | 0 | — | Reality transurfing / $1M at 24 | n/a |
| B2 | iKRW0G6yPmM | 56:15 | 0 | — | How I Personally Trade (LIVE) | live example |
| B3 | MypSrcfiqtM | 22:48 | 1/5 | ◐ | Sweeps + OB + FVGs for SNIPER Entries | entry model |
| B4 | en8RMFRqSME | 28:01 | 0 | — | BEST Gold Scalping Strategy | XAUUSD preset |
| B5 | CX8S22b1xqg | 39:16 | 0 | — | My Daily Trading Routine | routine |
| B6 | cFzxyGRtAis | 59:12 | 0 | — | 10 Years of Trading in 60 Minutes | survey |
| T1 | EsVHKs24qBI | 1:14 | 0 | — | Introducing EdgeFlo | tool |
| T2 | vU16QHmX3x4 | 11:28 | 0 | — | What is EdgeFlo? | tool |
| T3 | ixmTrvUB1Ks | 10:07 | 0 | — | How to Set Up Guardrails | guardrails |
| T4 | 3_QR4XFVbKE | 16:18 | 0 | — | Execute Trades Cleanly (Guardrails) | guardrails |
| T5 | AVS6QneKmAA | 9:49 | 0 | — | Review Metrics on Dashboard | performance.js |
| T6 | NsK2uYiqPlY | 14:48 | 0 | — | EdgeScore / Discipline | grading |
| T7 | umvflPxb0Es | 18:17 | 0 | — | Time Management (Notebook) | n/a |

**Progress: the 34 numbered episodes (Ep 0-33) are ALL complete. Of the 13 bonus/tool videos: 3 read in full, 3 read in part, 7 not read.**

**Rule adopted after the user's correction, and backed by the course itself** (Ep 1: *"watch in chronological
order… not episode 5 then 10 to 12 or whatever topic that you feel like watching"*): finish every chunk of
episode *n* before starting *n+1*. No skipping to whichever episode has the most obvious code surface.

---

## Ep 0 — How I Went From Broke to Millionaire Trader (3/3 chunks, ✔)

Biographical. No strategy content, no code surface — **correctly absent** from the bot.

But it states the thesis the whole product rests on, and it is worth recording verbatim because it is the
criterion everything else should be judged against:

> *"So I stopped looking for a better strategy and I started building something completely different. I built
> a mechanical system, not another strategy, a system. **Clear rules for when to enter, when to exit, and how
> much money to risk on each trade. Rules that didn't care how I was feeling on that day.**"*

> *"It happened because I stopped chasing setups and built a system that **forced me to execute properly
> whether I feel like it or not**."*

Three rules named: **when to enter, when to exit, how much to risk.** That is a compact audit checklist, and
§14–§19 already found the bot's answer to each:
- *when to enter* — weighted score, 3 of 5 rules gate, 2 advisory
- *when to exit* — 2R target, stop beyond zone/sweep + 0.18 ATR
- *how much to risk* — 1% default, floor 0.25%, **no ceiling**

His own origin failure is also directly relevant to the §16 finding:

> *"I was just opening **0.5 lots on a $500 account**, just overleveraging the out of my account."*

That is precisely what an unclamped `risk_pct` permits. The course's own founding story is an
over-leveraging blow-up, and §16 found `routes/api.js:566` stores `risk_pct` unclamped with a
`correction.js:400` upper bound of `Math.min(2, …)` — twice his stated 1% maximum.

Also: he describes the series as a **30-day** mentorship / boot camp, while the playlist carries episodes
numbered 0–33 (34 episodes). Not an audit finding, just a numbering note so "Ep 33" is not mistaken for
"day 33".

---

## Ep 5 — Market Structure (2/7 chunks read, ◐ — **incomplete, findings provisional**)

The foundational episode: *"every other concept is built on top of market structure."* Chunks 0–1 give the
theory and, importantly, **explicitly mechanical** definitions. Chunks 2–6 are unread and chunk 0 promised
*"later on I'm going to go through the concept of internal structure"* — which may qualify M1 below, so this
entry must not be treated as final.

### What the course states as mechanical rules

**Break of structure:** *"The break of structure happens when price take out the last structural high in a
uptrend and when it takes out the last structural low in a downtrend."*

**Swing points — stated as a rule, and the direction of the definition matters:**

> *"Your swing high is the highest point that led to the swing low… the highest point that price has reached
> before it starts pulling back. It's the peak of the mountain."*
>
> *"The swing low is the lowest point that creates the break of structure and lead to the swing high… **The
> keyword here is the lowest.** So that's a mechanical rule that you can actually use."*

And he explicitly rejects the intermediate lows a purely local test would accept:

> *"Is this a swing low? No. Is this a swing low? No. Is this a swing low? No. Why? Because it's not the
> lowest point that create the break of structure and led to the swing high."*

**Swing range:** *"This becomes my swing range and this is the area that I want to focus on. I don't care
about what price is doing outside of this swing range… I only care about what price is doing within the swing
high and the swing low itself."* It is re-derived on every new BOS.

**Confirmation timing:** *"I'm not able to identify my swing low until price starts pulling back… we cannot
identify the swing high until price breaks structure."*

**Pullback after BOS:** *"This is a rule I want you guys to remember… after a break of structure you want to
expect that price is going to start retracing or pulling back… a lot of beginners tend to enter right here
when the market has already made its move."*

### What the code does

`smc.js:38 findSwings(candles, strength = 2)` is a **fractal** test — *"a bar whose high is the highest of the
`strength` bars either side of it"*. Direction-agnostic, purely local geometry. `alternate()` (`:55`) then
keeps only alternating highs/lows, retaining the most extreme when two of a kind repeat.

That is **not** the course's rule. His swing low is the single lowest point that produced the BOS; a fractal
with `strength=2` marks every local trough. `alternate()` dedupes geometrically but never asks *"did this low
cause the break?"*

**Why this is the most consequential finding of the pass so far:** swings are the input to everything.
`marketStructure()` (`:69-73`) labels HH/HL/LH/LL from them, `:98-115` derives BOS/CHoCH/MSS, and the file
header (`:11`) states the chain: *"structure swing points -> HH/HL/LH/LL -> BOS / CHoCH / MSS."* If the swing
set differs from the course's, the trend label and every event derived from it can differ too.

Logged as **M1 (S1)** — but **flagged "needs measurement first"**, not "fix now", for two reasons: chunk 0
promised an *internal structure* discussion that may reconcile the two, and any change here alters which
trades the bot takes, so it needs an A/B over the fixture set before it is touched.

**M2 (S3):** no `swing_range` construct anywhere in `src/bots/` — 0 hits. The course treats it as the working
area that bounds everything else.

**M3 (S4):** the anti-chase intent *is* present (`setup.js:230/235` "waiting for the retrace into the zone",
`:329` *"Chasing here breaks the model's edge"*) but keyed to **distance from a zone** rather than to the
**BOS event**. Same intent, different trigger — recorded as a nuance, not a defect.

**Matches:** the BOS/CHoCH/MSS event taxonomy (`smc.js:98-115`) corresponds directly to what Ep 5 describes,
and HH/HL/LH/LL labelling exists as stated. The divergence is in the swing *inputs*, not the event logic.

**Still to read:** chunks 2–6 — internal structure, the live top-to-bottom mapping he promised, and whatever
qualifies the above.

### Ep 5 chunks 2–3 — two-tier structure, strong/weak, market shift

**Internal structure is defined relative to swing structure, not independently:**

> *"Internal structure is everything contained between your swing highs and your swing lows… **the only way you
> can identify your internal structure is if you have identified your swing structure and your swing range**…
> the first step is to always identify your swing range."*

Internal structure has its own highs/lows/BOS/range, and the sequencing rule is explicit:

> *"The internal structure has to shift first before the swing structure actually shifts… **That's what fractal
> means** — whatever happens on the higher time frame must first happen on the lower time frame."*

**Strong vs weak — a target-selection rule, not a description:**

> *"In a bullish market structure you want to trade from **strong** structure and target **weak** structure…
> longs at these strong lows and target these weak highs. The reason we call them weak is because **this is
> where the break of structure happen**. The reason we call them strong is because **this is where price is
> most likely going to hold** the next time price comes back."*

**Market shift (reversal):** *"when price actually went up there and take out the strong high, the strong lower
high. So breaking the cycle of the bearish downtrend… **it takes a lot a lot a lot of money for price to break
a strong structure**… Only institutions have the power to do that."*

**His five blank-chart questions:** trending up/down/sideways? · where are the obvious swing highs and lows? ·
HH/HL or LH/LL? · is this move a pullback or a reversal? · who is in control right now? First step is always
*"identify the most obvious break of structure."*

### Correction to my own M1 — I overstated it

I wrote M1 as "swing points are fractals, not the course's rule" and implied the two-tier model was absent.
**That was wrong in part.** `smc.js:697-700` builds exactly two tiers:

```js
const minorSwings = alternate(findSwings(candles, 2));
const majorSwings = alternate(findSwings(candles, 5));
const structure    = marketStructure(candles, minorSwings);
const htfStructure = majorSwings.length ? marketStructure(candles, majorSwings) : null;
```

and `:705` (liquidity) and `:707` (premium/discount) both **prefer `majorSwings`** — which is the right
instinct, since the course's swing structure is what bounds the working area. Both tiers are exposed at `:741`.

So a two-tier model **is** present. What genuinely diverges is narrower:

1. **Definition.** The tiers differ only by fractal window (2 vs 5 bars). The course's test is event-relative —
   which extreme *caused the BOS* — not how wide the local window is. Widening a window is not that test.
2. **Dependency inverted** (M22). He derives internal *from* swing; the code computes both in parallel.
3. **No `swing_range` output** (M2) — still stands, 0 hits.
4. **No strong/weak labels** (M21) — still stands, 0 hits for the structural sense.

M1 is therefore **reclassified and softened**: the architecture matches, the swing *definition* does not. It
remains "needs measurement first" — run both definitions over the fixtures and diff trend labels and BOS
events before concluding anything about behaviour.

**M23 (new, unverified):** `smc.js:138` sets `e.mss = e.type === 'CHoCH'` for every break, while the comment
above describes a sweep test *"checked in sweeps() and patched there"*; `:718` sets
`structure.last_break.mss = true`. I read the line but **not** the condition guarding `:718`, so whether a
plain BOS can be reported as an MSS is **open**, not asserted.

**Still to read:** Ep 5 chunks 4–6 (bar replay on live market conditions).

### Ep 5 chunks 4–5 — pullback vs reversal (5/7 read)

The discriminating rule, stated twice:

> *"How do we know? Well, **we don't — we don't know until price actually breaks structure**… A pullback is a
> temporary move against the swing structure… A reversal is when the market actually shifts direction. **And a
> reversal only happens when there is a market shift.**"*
>
> *"In order for the trend to shift from bullish to bearish, price needs to come down and **take out the strong
> low**, giving us the market shift."*

And the trap he names explicitly:

> *"A lot of beginners tend to get trapped because they think that **every pullback is a reversal**, when in
> reality it's just a pause in price before it can continue going up or down."*

Also confirmed: *"the internal structure shifted bearish **first** before the swing structure actually shifted
bearish"* — the sequencing rule restated with a worked example — and *"the internal low can be at the exact
same price point as a swing low."*

### How the code decides CHoCH — and why M21 has teeth

`smc.js:98-119`:

```js
const broke = dir === 'up' ? c.c > s.price : c.c < s.price;
const isChoch = !!lastEvent && (dir === 'up' ? lastEvent.dir === 'down' : lastEvent.dir === 'up');
events.push({ type: isChoch ? 'CHoCH' : 'BOS', ..., sweptBefore: false });
```

Two things follow.

**BOS matches the course.** A break is a **close** beyond the last swing (`c.c > s.price`), which is a fair
reading of *"price take out the last structural high"`. Close-based rather than wick-based is an
interpretation choice, not a defect — he does not specify which in this episode.

**CHoCH does not implement his market shift.** His reversal requires taking out the **strong** low — the
specific level that produced the last BOS. The code's CHoCH is purely a direction flip against the previous
event, so *any* opposite-direction break of *any* swing qualifies. With no strong/weak labels (M21) the code
has no way to express "the strong one". **That is the mechanism by which the trap he warns about becomes
reachable in the bot** — a pullback that breaks an internal low can be emitted as a reversal signal.

Logged as **M24 (S1)**, sequenced after M21: strong/weak has to exist before CHoCH can be gated on it.

**M23 refined:** `sweptBefore` is hardcoded `false` at `:119`. The only assignments to `mss` found are `:138`
(`e.mss = e.type === 'CHoCH'`) and `:718` (`structure.last_break.mss = true`). Whether `sweeps()` ever writes
`sweptBefore` is **still unverified** — I have not read `sweeps()`.

**Remaining:** Ep 5 chunks 5–6 (bar replay). Theory is now fully covered; what is left is application.

---

## Ep 6 — Candlestick Patterns (1/5 chunks read, ◐ — provisional)

Skipped in the earlier ordering and picked up after the user asked. Chunk 0 is candlestick anatomy — open,
close, high, low, body, upper/lower wick, and the timeframe-aggregation point that four 1h candles form one
4h candle.

The load-bearing line for this audit is the caveat he attaches to reading them:

> *"**A bullish candle does not always mean buy. A bearish candle does not always mean sell.** It just tells
> you who had more control during that candle."*

and the episode's own stated thesis: *"why you shouldn't just be blindly memorizing candlestick patterns."*

### Where the 30-pattern library actually lives

The curriculum claims *"candlestick library (30 patterns)"* and *"30 candlestick patterns"*
(`docs/PLAYLIST-CURRICULUM.md:99`, `:105`). Tracing it:

- **Not** in `src/bots/` — 0 hits for `pattern` in `setup.js`, and no pattern words in any of the eight bot
  modules.
- **In `src/indicators.js:59-96`** — a weighted table: `['bullishengulfingpattern','Bullish engulfing', 2]`,
  `['bearishengulfingpattern','Bearish engulfing', -2]`, `['hammerpattern','Hammer', 2]`,
  `['hammerpatternunconfirmed','Hammer (unconfirmed)', 1]`, plus doji, harami, marubozu, tweezer,
  spinning-top, shooting-star, morning-star and evening-star variants.
- **Consumed only inside `indicators.js`** — `:307 detectPatterns(all)`, `:308 ind.patterns = patterns`,
  `:310 const strongest = patterns[0]`.
- **No caller outside that file.** `grep candlePatterns` across `src/` and `public/js/` returns nothing
  outside `indicators.js`; all eight `src/bots/*.js` score 0 for `candlePatterns`/`patterns(`.

### Verdict: a match, not a mismatch

The library is computed and surfaced (chart overlay, coach narrative) but **gates no trade decision**. That is
precisely his position — candlesticks tell you who controlled the period, they are not a buy/sell signal, and
the lesson argues against memorising patterns as triggers. Wiring 30 patterns into entry scoring would have
been the divergence; not wiring them is correct.

Recorded in the ledger's *verified faithful* section rather than as an M-item.

**Provisional:** chunks 1–4 unread. He promised to cover *when* and *how* to use them, so if a later chunk
assigns patterns a role in entry confirmation, this verdict needs revisiting.

---

## Ep 1 — How to Trade Like the Top 1% (4/5 chunks read ✔ content complete — chunk 4 is site chrome)

Read here because the pass had wrongly jumped from Ep 0 to Ep 5. Chunk 0 is the origin of Market Mechanics,
and it contains the most useful single passage in the series so far for this audit — an explicit list of what
he endorses and what he discards.

### The distillation thesis

> *"I realize that all of these different strategies — price action, smart money, ICT concepts — there is
> about like **30% of these concepts or lessons that are worth absorbing. And then the other 70% is just
> fluff.**"*

### His endorsed list — a direct audit checklist

> *"In ICT, **displacement and order blocks** work really, really well. In smart money concepts, **liquidity,
> imbalance** work really, really well. And then for price action, **break of structure, market structure**,
> looking at the **momentum and the pressure of the candlestick** work really, really well."*

Seven named primitives. Checking each against the code:

| # | Endorsed primitive | In the code | |
|---|---|---|---|
| 1 | Displacement | `smc.js:156-168` — `rangeAtr >= minAtr` and `bodyRatio >= minBody` | ✓ |
| 2 | Order blocks | `smc.js:180-196` | ✓ |
| 3 | Liquidity | `smc.js:440+` sweep, ≥0.08 ATR + close back | ✓ |
| 4 | Imbalance | `smc.js:241` FVG, ≥0.12 ATR | ✓ |
| 5 | Break of structure | `smc.js:98-115`, close beyond the last swing | ✓ |
| 6 | Market structure | `smc.js:73-96`, HH/HL/LH/LL labelling | ✓ |
| 7 | Momentum / candle pressure | `smc.js:165-168` `bodyRatio = body / range` gated on both body ratio **and** ATR; a whole `momentum.js` layer on top | ✓ |

**All seven present.** This matters because it is the first time the primitive set has been checked against
the **primary source** rather than the independent repo's transcripts. The earlier "method audit — faithful"
conclusion was built on a secondary source and I flagged it as possibly not surviving the real pass; on this
evidence the primitive *coverage* does survive. The Ep 5 findings stand separately — they concern the swing
*definitions* feeding those primitives (M1, M22), not whether the primitives exist.

### He rejects pattern-memorising here too

> *"They are taught these surface-level patterns. Oh, memorize this candlestick pattern… But not the real
> mechanics behind price. And that is exactly why I created what I call market mechanics."*

**This independently strengthens the Ep 6 verdict.** Two episodes now state that candlestick patterns are not
entry signals, so the pattern library sitting in `indicators.js` and gating nothing is correct rather than an
omission.

### Sample size stated a third time

> *"I wanted to see what actually worked. Not just in one trade, but across a large sample size, **across 100
> trades, across 500 trades**."*

Ep 1, Ep 26 and Ep 27 now all state a large-sample requirement. **M11 strengthens**: `correction.js:389`
adapts guardrails at 10 trades — one-tenth of his lowest stated figure, and Ep 1 frames the whole method as
laboratory work over hundreds of trades.

### Chunks 1–3 — the framework's stated components, and a house rule worth quoting

**What Market Mechanics comprises**, in his words:

> *"It is built on understanding **structural liquidity, imbalance, timing, institutional zones, execution,
> trading psychology**."*

Six components. Five map to engine code already verified above; **timing** maps to the killzone/session layer
— which is where **M5** (DST drift) sits, so this list makes M5 a defect against a named component rather than
an incidental bug. **Trading psychology** maps to the coach layer.

**The anti-chase principle, stated as identity rather than rule:**

> *"I'm not going to be chasing the market. **The market is going to be coming to a price point which I want
> to enter and then I enter.**"*

Supports **M3** — the bot does have anti-chase logic (`setup.js:329`), but keyed to zone distance rather than
to the BOS event.

**Sample size, a fourth time:** *"test it out… over a large sample size, 100 trades, 500 trades, and then
based on data, decide what to keep in your trading plan and what to discard."*

### The house rule — which is exactly the correction the user made

> *"I want you to watch every single lesson from start to finish… **watch in chronological order**. So watch
> from episode 1 to episode 2 to episode 3, **not episode 5 then 10 to 12 or whatever topic that you feel like
> watching. No. Watch from 0 all the way to 31.**"*

Recorded deliberately. This is not only the user's instruction about how to run the audit — it is the course's
own stated method, and the reason is that the concepts build cumulatively (Ep 5 says *"every other concept is
built on top of market structure"*). Skipping to whichever episode has obvious code surface breaks the
dependency chain, which is precisely the error made earlier in this pass.

Note also that he describes the series as **0 to 31** here and *"30-day"* in Ep 0, while the playlist carries
Ep 0–33. Consistent with the Ep 0 numbering note; the extra episodes are later additions.

**Ep 1 content complete.** The transcript ends at *"let's begin with the Market Mechanics Mentorship series…
you are just one trade away"* followed by `Back To Top`; chunk 4 is site chrome and AI-feature listings, not
episode content.

---

## Ep 2 — How Price Really Moves (2/5 chunks read, ◐)

The theory episode. Core claim: *"price does not move randomly. It moves because of an **imbalance between
buyers and sellers**… the market is always moving from imbalance to balance to imbalance to balance… the
market always seeks **fair value**."* Efficient = balanced, inefficient = imbalance.

### The four stages of price — a concrete, testable model

> *"At any given moment, the price is always in one of these four stages… **This is pretty much how order flow
> works.**"*

1. **Expansion** — *"a strong move in one particular direction"*
2. **Pullback** — *"gravity will pull price back to fair value"*
3. **Consolidation** — *"a state of equilibrium… compression in price… indecisiveness… a stalemate"*
4. **Continuation or reversal** — *"the market can either continue the existing trend, or it can cause this
   existing trend to reverse entirely"*

### Checking the four stages against `src/bots/`

| Stage | Term hits (smc / momentum / topdown / setup) | Status |
|---|---|---|
| Expansion | 2 / 2 / 2 / 2 | present, via displacement |
| Pullback | 0 / 2 / **8** / 1 | present |
| **Consolidation** | **0 / 0 / 0 / 0** | **absent** |
| Continuation / reversal | 1 / 0 / 0 / 0 and 1 / 1 / 5 / 0 | present, via BOS/CHoCH |

`phase` and `stage` score **0** everywhere, so nothing reports which stage the market is currently in.
`regime` exists (`momentum.js:191, 225, 228`) but is a **volatility** regime, not this order-flow phase.

Logged as **M25**. The important part is the connection it makes: **this is the same gap as the missing chop
detector noted in §18.** Ep 19's no-trade criterion *"slow/choppy, no clear bias"* is the consolidation stage,
and Ep 2 shows consolidation is a **named stage of the framework**, not an incidental filter. That upgrades
M10 from "add a calendar rule" to "the framework has a phase model the bot does not implement, and one of its
stages is the no-trade condition."

### Pattern-memorising rejected a third time

> *"Price doesn't move because there's a freaking candlestick pattern right there. Price doesn't move because
> Bollinger bands cross over. Price doesn't move because you see a double top. **It moves because it's
> actively seeking fair value.**"*

Ep 1, Ep 2 and Ep 6 all say the same thing. The Ep 6 verdict — pattern library computed but gating nothing —
now rests on three episodes.

### The sniper-entry rationale

> *"Your goal as a retail trader is to get in **before** this big move happens… right now you are entering
> after the market has already moved. **Your entry is way too late.**"*

This is the *why* behind Ep 18/Ep 25's entry model and behind the anti-chase logic in `setup.js:329`.

**Remaining:** Ep 2 chunks 2–4.

### Ep 2 chunk 2 — liquidity locations, the timing rule, and consolidation as a no-trade

**Where liquidity sits**, stated explicitly:

> *"Where to spot liquidity? It's going to be **above the swing highs, below the swing lows**, and above or
> below certain chart patterns or obvious zones or support and resistance levels."*

`smc.js:379-400+` builds a `pools` array covering all three, and more:

| His location | Code | |
|---|---|---|
| Above swing highs | `equal_highs` — clustered swing highs, `type: 'BSL'`, strength `0.4 + touches*0.2` | ✓ |
| Below swing lows | `equal_lows` — clustered swing lows, `type: 'SSL'`, same scaling | ✓ |
| Obvious zones / S-R | `PDH`/`PDL` (0.9), `TDH`/`TDL` (0.6), `PWH`/`PWL` (1.0) | ✓ + extra |

**A match, and richer than the source** — the previous-day/week and today's-high/low pools are time-based
levels Ep 2 does not mention. Buy-side/sell-side typing (`BSL`/`SSL`) is also present.

**One nuance worth recording, not a defect:** the code requires **2+ touches** (`clusterLevels(...).filter(c =>
c.touches >= 2)`) before a swing high/low counts as a pool. His phrasing — *"above the swing highs, below the
swing lows"* — is looser and would include single-touch swings. The bot is **stricter**, which is a defensible
reading of *"obvious"*, but it does mean single-touch swing liquidity is invisible to it.

### The timing rule — the clearest statement in the series so far

> *"When you understand this concept that the market moves from imbalance to balance, you will know that
> **your goal as a trader is to get in during the balance phase, so that you can capture the imbalance. Your
> goal is not to get in after the imbalance, but rather before the imbalance.**"*

and the failure mode he names:

> *"The reason why they fail is because they tend to **chase after price during an expansion**… It's because
> you are not trading price. You are just trading your ego."*

**This sharpens M3.** The course's anti-chase rule is **phase-based** — enter in balance, not in expansion.
The bot's is **zone-distance-based** (`setup.js:230/235` "waiting for the retrace into the zone", `:329`
*"Chasing here breaks the model's edge"*). Because the balance/expansion phase is never classified (M25), the
bot cannot express the rule as stated. The two are related but not equivalent: price can be far from a zone
*and* mid-expansion, or near a zone *and* mid-expansion.

### Consolidation as a no-trade — stated a second time

> *"As much as possible, if you're a beginner, you want to **stay away from trading consolidation** because
> it's very unpredictable and it's very difficult to trade."*

Ep 2 and Ep 19 both make consolidation a stand-down condition. **M25 and M10 strengthen** — this is not one
episode's aside, and the missing chop detector is a missing *stage*, not a missing filter.

**Remaining:** Ep 2 chunks 3–4.

### Ep 2 chunk 3 — the blank-chart questions, and three named retail mistakes

The practical framework, given as a checklist to run on every chart:

> *"From now moving forward whenever you open a chart… **Is price expanding, pulling back, or consolidating?**"*

followed by a live EUR/USD 1-hour walk-through in which he narrates the phase explicitly — *"price has just
gotten the expansion phase here"*, *"right now price is actually in the pullback phase"*, *"at this point of
time, we were in a consolidation right here, and then price broke to the downside."* **M25 is a missing
output the course asks for by name, on every chart.**

He also reads control at **two scopes at once**, which is the Ep 5 internal/swing distinction in practice:

> *"If we are looking at the overall structure, the buyers are in control… But if we are looking at right now,
> the most recent price action, the sellers might be in control… It might be shifting bullish in the short term
> **to facilitate the pullback**."*

### Three retail mistakes — each maps to a ledger item

| Mistake | His words | Ledger |
|---|---|---|
| 1. Chase during expansion | *"they tend to chase after price during an expansion"* | M3 |
| 2. Panic during pullback | exits early, then *"price continue going up… and later on price went up there and hit TP"* | — (execution discipline; the bot has no open-trade management to get wrong) |
| 3. **Enter too early on reversal** | *"Did you actually got your **confirmation** that the market is actually reversing to the upside? If the answer is no, then… you're trading your assumption of the market."* | **M24** |

**Mistake 3 is M24 confirmed from a second episode.** Ep 5 said a reversal requires taking out the *strong*
low; Ep 2 says a reversal entry without *confirmation* is trading an assumption. `smc.js:112` emits CHoCH on
any opposite-direction break with no confirmation qualifier, which is precisely the unconfirmed reversal he
describes.

### The required sequence, stated as one sentence

> *"Price often needs to rebalance. It needs to retrace. It needs to seek fair value. **It needs to grab
> liquidity first. It needs to cause the structure to shift first before it can get the next move.**"*

That is a four-step ordering: rebalance → grab liquidity → structure shift → next move. **The bot does
implement this ordering** — `setup.js` requires a liquidity sweep before entry (the R3 gate, *"no liquidity
shift, no entry"*) and a market shift, so the sequence is a **match** and belongs in the verified-faithful
section rather than the ledger.

### The framing worth keeping

> *"A lot of traders think that they are losing because of emotions. When in reality, **they are losing because
> they are misunderstanding the market movement**."*

This is the reason the phase classifier (M25) is not cosmetic. His claim is that the emotional errors are
*downstream* of not knowing which phase the market is in — so a bot that never classifies the phase cannot
implement the discipline the course attributes to knowing it.

**Remaining:** Ep 2 chunk 4.

### Ep 2 chunk 4 — the five key questions (episode complete, 5/5)

The episode closes with an explicit checklist:

> *"These are the **five key questions** that I want you guys to ask yourself moving forward when you pull up a
> blank chart. If you can answer these questions with confidence, you will be able to analyze the charts with a
> lot of clarity. You won't have brain fog, you won't have analysis paralysis."*

Checking each against what the engine actually reports:

| # | His question | In the code | |
|---|---|---|---|
| 1 | **Is price expanding, pulling back, or consolidating?** | `phase` scores **0** across `src/bots/` | **✗ M25** |
| 2 | Who is in control right now? | `htf_structure.trend` (`smc.js:743`), plus `marketStructure().trend` | ✓ |
| 3 | Where are the obvious highs and lows? | `last_swing_high` / `last_swing_low` (`smc.js:148-149`) | ✓ |
| 4 | Where might price be drawing to? | see note below | ✓ |
| 5 | Is the market continuing or preparing to shift? | `last_break` with `type: BOS`/`CHoCH` and `bars_ago` (`smc.js:146`); `:715` branches on CHoCH | ✓ |

**Note on Q4 — recorded carefully, because a keyword grep would have got this wrong.** Searching for
`draw|magnet|target_liquidity|seeking` returns nothing, and on that evidence alone I would have marked Q4
absent. That would have been the same error made earlier on Ep 23's "routine" grep. The *capability* is
present under different vocabulary: `liquidity()` returns `pools` with `BSL`/`SSL` typing and a `strength`
weight, and `momentum.js:301` narrates unfilled gaps directly — `(smc.fvgs || []).filter(g => !g.filled)`.
Those two together are exactly "where price might be drawing to". Q4 is answered in substance; only his
vocabulary is missing.

**So: four of five answered, and the one gap is question 1** — the first in his list, and the one that gates
the others. You cannot decide whether to enter without knowing the phase, which is why M25 sits behind both
M3 (enter in balance, not expansion) and M10 (stand down in consolidation) rather than being a display
omission.

**Ep 2 complete — 5/5 chunks.** The transcript ends at *"I look forward to speaking to you guys in episode
two… you're just one trade away"* followed by `Back To Top`; the remainder of chunk 4 is site chrome.

---

## Ep 3 — How to Trade Forex For Beginners (2/6 chunks read, ◐)

Beginner forex. Chunk 0 is fundamentals — currency pairs, base/quote convention (*"the base currency is on the
left… always equal to one"*), the 24/5 Monday-to-Friday market, participants.

### Chunk 1 — the three M's, and a concrete instrument list

> *"In order for you to develop an edge, you need to master these three M… **method**, which is having a
> profitable trading strategy that works in every market condition. **Money management**, which is the ability
> to take trades with high risk-to-reward ratio while keeping your risk consistent… and then **mindset**, the
> ability to execute trades based on mechanical rules on your trading system rather than emotions."*
>
> *"Just like a stool… if you take one leg away, the stool is going to fall."*

| Pillar | Where it lives in the app | |
|---|---|---|
| Method | the bot engine (`smc.js`, `topdown.js`, `setup.js`) | ✓ |
| Money management | `risk_pct`, `minRR`, guardrails in `correction.js` | ✓ but see **M9** (no 1% ceiling) |
| Mindset | `coach.js` behavioural rules and read-aloud narrative | ✓ |

He also frames the whole thing probabilistically, which is worth keeping because it is the justification for
grading rather than blocking: *"we cannot predict with 100% certainty… **trading is simply a probability game.
Which means that every trade outcome is random**… An edge is not a guarantee you will win a trade."*

### Instrument guidance — checked against the shipped symbol universe

His three categories and his advice:
- **Majors** (contain USD): *"stick to the major currency pairs… the most amount of liquidity, volatility, and
  trading opportunities"* — EURUSD, GBPUSD, AUDUSD, NZDUSD, USDJPY, USDCHF, USDCAD
- **Minors** (two majors, no USD): EURJPY, GBPJPY, AUDCAD, AUDCHF and similar — not prohibited
- **Exotics**: *"I would advise you to just **stay away** from exotic currency pairs… **never have I ever traded
  a single one** of these exotic currency pairs"*

What the app actually ships (15 symbols):

| Category | Symbols | Matches? |
|---|---|---|
| Majors | EURUSD, GBPUSD, AUDUSD, NZDUSD, USDJPY, USDCHF, USDCAD | **all 7 present** ✓ |
| Minors | EURAUD, EURGBP, EURJPY, GBPJPY, AUDJPY | allowed category ✓ |
| Exotics | **none** | ✓ matches "stay away" |
| Non-forex | XAUUSD, BTCUSD, ETHUSD | see note |

**A clean match.** Every major he names is present, the only crosses are minors (a category he permits), and
there are **zero exotics** — which is the one category he explicitly tells traders to avoid.

**Note on XAUUSD/BTCUSD/ETHUSD:** these are not forex pairs at all, so they are outside Ep 3's scope rather
than in conflict with it. Ep 2 settled the question directly — the mechanics apply to *"every single asset
class… stocks, indices, crypto, futures, options, commodities, forex, whatever asset that has a chart."* So
gold and crypto presets are consistent with the course, not a deviation from it.

**Recorded as an open question, not a finding:** he advises *"maximum three to four currency pairs on the
watch list"* and *"at any given moment, you should only focus on analyzing the charts of one currency pair."*
The app ships 15 symbols. I grepped `index.js` for `SYMBOLS`/`symbols =` and found nothing, so **I have not
established how many symbols a scan actually evaluates at once** — whether that is 15, or user-selected, or
one at a time. Unchecked, so no ledger item is raised on it.

**Remaining:** Ep 3 chunks 2–5 — pips/lot sizing (relevant to the risk model) and *"what's the best time to
trade"* (relevant to **M5**, the killzone DST defect).

### Ep 3 chunk 2 — pip and lot arithmetic, and the JPY exception

Concrete, testable definitions:

> *"A pip is the fourth number after the decimal point… **except for Japanese yen pairs**… Japanese yen pairs
> only go up to two decimal places. So one pip is the second number after the decimal point."*

| Lot | Units | Per pip |
|---|---|---|
| Standard 1.0 | 100,000 | **$10** |
| Mini 0.1 | 10,000 | $1 |
| Micro 0.01 | 1,000 | $0.10 |

and the P&L rule: *"your lot size, the amount of units, **times** the dollar per pip move."*

### The instrument table gets the JPY exception right

`src/instruments.js` builds forex specs through `fx(symbol, name, pip, contract, quote)`, which sets
`pip_size: pip` and `pip_value: pip * contract`. The JPY pairs are declared with **pip 0.01**, not 0.0001:

```
:122  fx('USDJPY', 'US Dollar / Japanese Yen', 0.01, 1e5, 'JPY')
:126  fx('EURJPY', 'Euro / Japanese Yen',      0.01, 1e5, 'JPY')
:127  fx('GBPJPY', 'British Pound / Japanese Yen', 0.01, 1e5, 'JPY')
:128  fx('AUDJPY', 'Australian Dollar / Japanese Yen', 0.01, 1e5, 'JPY')
```

That matches his rule exactly, and the comment at `:198` states the model he describes: *"For a USD-quoted
pair, 1 standard lot = 100,000 units ⇒ **$10 per pip** (1.00 per 0.0001)."* **A match, verified in source.**

### A divergence I have NOT confirmed — recorded as open, not as a bug

`src/bots/predict.js:745-748` contains a **separate** spec fallback:

```js
if (/USDT$|USDC$|PERP$/.test(sym)) return { ..., asset_class: 'crypto',  pip_size: 0.01   };
if (/^[A-Z]{6}$/.test(sym))        return { ..., asset_class: 'forex',   pip_size: 0.0001 };
if (/^(ES|NQ|YM|RTY|GC|SI|CL|NG|ZB|ZN|6E|6B|MES|MNQ|MGC)/.test(sym)) return { ..., pip_size: 0.25 };
return                                      { ..., asset_class: 'stocks', pip_size: 0.01   };
```

`/^[A-Z]{6}$/` matches **USDJPY, EURJPY, GBPJPY and AUDJPY** and would give them `pip_size: 0.0001` — 100×
smaller than the instruments table and than his stated rule. **If that branch is ever reached for a JPY pair,
pip-based figures for those four symbols would be wrong by two orders of magnitude.**

**Whether it is reached, I have not established.** `index.js:84` reads `spec.pip_size` from a spec lookup and
only falls through to a generic default at `:86`, so the instruments table appears to be the primary source;
but I have not traced whether `predict.js` calls its own fallback or the table.

**A note on method, since it matters here.** My first attempt to settle this ran a Node probe that iterated
the module's exported functions and took the first one returning an object with a `pip_size`. That returned
`genericSpec` for *every* symbol — including EURUSD, which the table plainly declares correctly — because
`genericSpec` **is** the fallback, not the lookup. The probe therefore proved nothing, and had I trusted it I
would have reported a false 100× bug affecting all forex pairs. The source reading above is the actual
evidence; the probe result is discarded.

**Open item, not a ledger entry:** confirm whether `predict.js:746` is reachable for JPY symbols. If it is,
this becomes an S1 defect; if the instruments table always wins, it is dead fallback code that should say so.

**Remaining:** Ep 3 chunks 3–5 — sessions and *"what's the best time to trade"*, which bears directly on
**M5**.

### Ep 3 chunk 3 — the three sessions, and a missing specialisation control

His session model and their characters:

| Session | His description |
|---|---|
| **Asia** (Sydney + Tokyo) | *"usually much more slower… lower volatility. Price can stay in consolidation for longer… **not really ideal for beginners who is looking for strong moves**"* |
| **London** | *"one of the most active session… much more cleaner move, much better trading opportunities… **I specialize in this session**"* |
| **New York** | *"also very active… strong volatility… a session where **a lot of high impact news** tends to happen"* |

and the timing rule: *"the best times to trade are usually when the **trading volume is the highest**… within
the London session or the New York session."*

### The session quality ranking matches

`smc.js:610-616`:

```js
{ key: 'sydney', name: 'Sydney',        start: 21, end: 6,  quality: 0.3  }
{ key: 'tokyo',  name: 'Tokyo / Asia',  start: 0,  end: 7,  quality: 0.5  }
{ key: 'london', name: 'London',        start: 7,  end: 12, quality: 0.85 }
{ key: 'ny_am',  name: 'New York AM',   start: 12, end: 16, quality: 1.0  }
{ key: 'ny_pm',  name: 'New York PM',   start: 16, end: 21, quality: 0.6  }
```

**A match on ranking.** Asia is lowest (0.3 / 0.5), London high (0.85), New York AM highest (1.0) — which is
exactly his *"London session or the New York session"* for the best volume, with Asia de-weighted as the slow
one. Splitting New York into AM (1.0) and PM (0.6) is a refinement he does not make but does not contradict.

### M5 confirmed structurally in source

`SILVER_BULLETS` (`:619-623`) stores plain hour constants — `startH: 6, endH: 9` for London,
`startH: 12, endH: 15` for NY AM — and `sessionState()` (`:625-627`) computes the current minute straight from
`date.getUTCHours()` with **no timezone or DST resolution anywhere in the function**. So those windows are
pinned to fixed UTC hours year-round while the real session opens move by an hour with DST. This is the
structural proof behind **M5**, which until now rested on the value of the constants alone.

### New: no single-window specialisation control

> *"A big mistake that a lot of beginners tend to make is that they try to trade all day… the hidden cost of
> doing that is also **overtrading**… you could enter and make money during the Asia session and then during
> the London session you continue trading and then you start getting loss… A much smarter trading approach is
> to **find one specific window and just focus on that window**… but just stick to one."*

Searching `src/` for `session_pref`, `preferred_session`, `only_session`, `session_filter` returns **0 hits**.
The bot scores every session and can be pointed at any symbol, but there is **no way to restrict it to one
trading window**. Logged as **M26**.

This compounds **M25**: with no phase classifier, the bot cannot distinguish *"Asia consolidation"* (his
expected, low-quality state) from *"London consolidation"* (a genuine stand-down). It only knows the hour, and
the hour alone is not what he keys the decision to.

### Also in chunk 3

Three analysis types (technical, fundamental, sentiment) — the app implements technical only, which is
consistent with a mechanical system and with his own *"the purpose of a mechanical trading system is to remove
all the discretion"* (Ep 16). Four trading styles by holding period (scalping, intraday, swing, position) map
onto the 64 presets rather than a single fixed style.

**Remaining:** Ep 3 chunks 4–5.

### Ep 3 chunk 4 — the hybrid entry model, and a cost model that is optimistic

**The hybrid approach, stated plainly** — this is the top-down model in his own words:

> *"You can only catch this if you are either very good at entering and exiting trades or you have a **hybrid
> approach**, which means **you use the entry time frames of a scalper but you use the higher time frames of an
> intraday trader**, so as a result you are able to enter, get all these tight stop loss and able to target a
> zone that is on the higher time frame."*

with the payoff quantified: *"catching ones to 10 R trades, ones to 8 R trades… making $8,000 when I'm only
risking $1,000. These are what we call **sniper entries**."*

**A match.** That is exactly the `topdown.js` split — a short `entryTf` for the trigger against higher
`bias`/`zone` timeframes for location — and the RR targets it implies are the same ones Ep 25 and Ep 37 set as
floors (`minRR: 2`, TP at 2R).

**Trading style selection** is by three criteria — schedule, goals, personality — and he recommends
experimenting before specialising. The 64 presets cover this by holding period rather than by personality,
which is the mechanisable part of the advice.

### Cost model — the course's own figures are 1.57× what the app assumes

His concrete numbers: *"the difference of this is **1.5 pips**… and that's the spread"* and *"a commission…
example, **$7 per lot** on each trade and round trip… you're essentially paying **$14** in commission."*

Computed against `COST_BPS.forex` at `instruments.js:41` (`spread 0.80, slippage 0.20, commission 0.35`),
for EURUSD at 1.0900 and one standard lot ($109,000 notional):

| Component | His figure | In bp | App models | Ratio |
|---|---|---|---|---|
| Spread | 1.5 pips | **1.38 bp** | 0.80 bp | app **1.7× lower** |
| Commission | $14 round trip | **1.28 bp** | 0.35 bp | app **3.7× lower** |
| Swap / carry | *"you got swap or carry or roll over fees"* | — | **not modelled** | — |
| **Round turn** | | **2.66 bp** | **1.70 bp** | **course is 1.57×** |

**Why this matters rather than being pedantry.** The independent backtest in `ANALYSIS.md` found the strategy
carries a small gross edge (+0.220R frictionless) that transaction cost destroys — roughly 0.26R per trade
against 5-minute stops of about 6 pips. If realistic cost is ~1.57× the modelled figure, that already-negative
expectancy is **worse than measured**, and the gap is on the commission line, which is the most
broker-dependent of the three.

**Swap is not modelled at all** — `swap|rollover|carry|overnight` returns nothing in `instruments.js` or any
file under `src/bots/`. For intraday presets that is negligible, but the preset list includes swing and
position styles, where overnight carry is a real term. Logged as **M27**.

**Caveat, stated plainly:** his 1.5 pips and $7/lot are illustrative examples from a specific broker, not a
specification. Tight-spread accounts can be cheaper than his figures; some are worse. The finding is that the
app's cost assumption sits **below the range the course itself describes**, so backtests and expectancy
estimates should be read as optimistic rather than as neutral.

**Remaining:** Ep 3 chunk 5.

### Ep 3 chunk 5 — swap mechanics (episode complete, 6/6)

He closes the cost section with the detail that confirms how M27 should be scoped:

> *"**Swap**, which is the fee that you have to pay if you hold your trades overnight. And this **only applies
> for swing traders or position traders** because these are the people who are holding the trade overnight…
> calculated by adjusting the closing level of your open position with the **interest rates of the currencies
> involved**. The rates can change daily… If you buy currency with higher interest rate, you **receive**
> interest. If you buy currency with lower interest rate, you **pay** interest. And this payment is known as
> the **carry**."*

His worked example: rolling one lot of EURUSD overnight, selling at 1.1378 and buying back at 1.13805, a
2.5-point difference × $10 per pip = **$25 swap fee**.

**That single figure reframes M27.** On one standard lot the *commission* is $14 round trip but *one night of
swap* is $25 — so for any hold beyond roughly half a day, **swap is the larger term, and the app models it as
zero.** The preset list includes swing and position styles, so those presets are the ones whose backtests are
most inflated. Intraday presets are unaffected, which is exactly the scoping he gives.

He also frames cost as unavoidable — *"these are fixed costs. It's like the cost of doing business. You can't
really avoid them"* — then adds: *"don't worry too much about the transaction cost… since you are going to be
making a lot more money than what you are paying to the broker."*

**That last claim is the one the audit's own numbers contradict.** It assumes an edge large enough to absorb
cost. The independent backtest measured a gross edge of +0.220R frictionless against roughly 0.26R of cost per
trade, i.e. cost exceeds edge. Noting it here because it is the episode's only quantitative claim that the
project's measured results do not support — and because it is the assumption a user would most plausibly
carry over from the video into their expectations of the bot.

**Ep 3 complete — 6/6 chunks.** Transcript ends at *"you're just one trade away"* followed by `Back To Top`;
the remainder is site chrome.

---

## Ep 4 — Reprogramming Your Mind (`FXwJ26zT8Ds`) — COMPLETE, 4/4 ✔

Pure psychology. Core claim:

> *"You do not trade the market. **You trade your belief about the market.**… if the belief is broken, the
> execution will always break."*

### The loop he wants broken

**belief → emotion → action → result → reinforces belief.** His worked example: believing *"I'm not a
consistent trader"* breeds doubt and urgency, which produces *"forcing trades, or breaking rules, or just not
trusting your trade plan"*, which produces a messy P&L, which reinforces the original belief.

The self-sabotage mechanism is stated precisely, and it is the one part of this episode that is directly
measurable:

> *"If you feel unworthy of the profits, then… you will start to **self-sabotage**… by taking trades that is
> not aligned with your trade plan, and **give back your profits back to the market**."*

### The five steps of reprogramming

1. **Spot the belief** — *"write down the top three sentences that show up when you stress"*
2. **Find the evidence trail** — *"when did I start believing this? Who taught me this?"*
3. **Identify the payoff** — *"what do I get to avoid if I keep this belief?"*
4. **Replace it** — identity-first, not action-first: *"it's very difficult to get rid of the old belief, but
   it's easier to replace it"*
5. **Install the new belief** — *"a belief isn't changed by logic… it needs **repetition, emotion, and
   proof**"*

### The belief-swap table (his four categories)

| Old belief | Category | New belief |
|---|---|---|
| *"I need to make money today"* | **Scarcity** | *"My job is execution, the money is a byproduct"* |
| *"If I miss this opportunity, I'm done. I'm cooked."* | **Urgency** | *"There will always be another setup. The next bus is coming in the next 5 minutes."* |
| *"I don't deserve to win"* | **Worthiness** | *"I deserve the outcome of my process"* |
| *"I must predict to win"* | **Control** | *"Trading is a game of probabilities, not a game of certainty… if I can manage my risk, I can play the odds, I will win in the end."* |

Note the worthiness replacement is deliberately **not** *"I deserve to win"* — *"the market doesn't owe you…
you deserve to be rewarded if you execute your process consistently."* That is the process-over-outcome
principle again, from the psychology side.

### The 7-day protocol — three nightly fields

> *"Every single night, you want to **write one proof that you have lived it today**. Write **one moment you
> have broke it** and what triggered it. And decide **the one adjustment for tomorrow**."*

with the stated purpose: *"The goal is not to punish you. It's just to make you more aware."*

### Checked against the code — and a correction to my own earlier citations

**First, a correction.** I have referred to the psychology layer as `coach.js` throughout this audit, and in
places implied it sat under `src/bots/`. It does not. The file is **`src/coach.js`**. `src/bots/` contains
exactly: `correction.js, index.js, momentum.js, now.js, predict.js, setup.js, smc.js, topdown.js` — no
`coach.js`. Earlier statements about what the coach layer *does* stand; the path was wrong and is corrected
here.

**The behavioural rule set is far richer than this audit had credited.** `src/coach.js` defines **25 rule-id
families**:

```
need_  neg_  hour_  dow_  revenge_  after_  overtrading_  early_  win_  gave_
tight_  size_  adherence_  emotion_  symbol_  side_  disposition_  dd_  fees_
no_  stop_  best_  fragile_  risk_  session_
```

**Mapping his four belief categories onto them:**

| His category | The belief | Detected? |
|---|---|---|
| Scarcity | *"I need to make money today"* | **`need_*`** — the rule id is literally that sentence |
| Urgency | *"If I miss this opportunity, I'm done"* | **`fomo`** (in `negWords`, `:300`) |
| Worthiness | *"I don't deserve to win"* → give back profits | **`gave_*`** — giving back profits |
| Control | *"I must predict to win"* | **`disposition_*`** + `adherence_*` |

**So the *behaviours* his beliefs produce are all covered, even though his belief taxonomy is not named.**
Searching `coach.js` for `scarcity`, `urgency`, `worthiness`, `control`, `deserve`, `self_sabotage` returns
nothing — but that is a vocabulary gap, not a capability gap, and the same trap that caught Q4 in Ep 2 and the
Ep 23 routine grep applies here. Recording it as vocabulary-only.

**The nightly protocol is 1 of 3 implemented.** `src/db.js:188` has a `tomorrow TEXT DEFAULT ''` column — his
*"one adjustment for tomorrow."* The other two fields (one proof you lived it; one moment you broke it and
what triggered it) have **no dedicated column**. Emotional state is captured separately via `emotion_before`,
consumed at `coach.js:300-306` to compare expectancy of negatively- versus positively-framed sessions — which
is a *stronger* instrument than his protocol, but it measures mood against outcome rather than belief against
behaviour. Extends **M14/M15**.

**The belief ladder** — *"if a new belief feels too big… break it down"* (60 minutes → one trade → one day) —
has no counterpart, and arguably should not: it is a human practice, not a mechanisable rule. Noted rather
than ledgered.

**Also in this episode:** the identity statements *"I am the type of person who **waits for A+ setups**"* and
*"I am the type of trader who **respects stops without negotiation**"* restate two rules that already have
ledger entries — **M9** (risk ceiling / stop discipline) and the Ep 31 A+-only criterion.


### Ep 5 chunks 5–6 — episode complete (7/7), and a correction to M25

**The body-close rule, stated as a mechanical rule** — and it is already a verified match:

> *"Does this count as a break of structure? You can see the candlestick wick clearly took out the last high.
> **No, this doesn't really count.** In order for a break of structure to happen, **the candlestick body must
> close above the high or below the previous low. Write this down somewhere.**… if you got a wick break, it does
> not constitute as a valid break of structure or a valid market shift."*

`smc.js:98-119 scanBreaks` breaks on **close** beyond the swing, not on wick. Confirmed a second time.

**Internal high/low, defined operationally** — the definition M1 turns on, restated:

> *"this becomes the new internal high… which is **the highest point that led to the internal break of
> structure**"* / *"internal low is **the lowest low that caused price to start pulling back**"*

Both are BOS-relative. The bot derives swings from `findSwings(candles, strength)` — a fractal window width.
**M1 stands**, now with the exact operational definition quoted.

**Strong/weak, and the sweep-vs-shift ambiguity** — both restate M21 and M24:

> *"this becomes a strong high right now because… we already got a market shift… and then this becomes the new
> **weak low**"*
>
> *"this could also be a **liquidity sweep**… If this is a liquidity sweep, then this could potentially still be
> price pulling back"*

### CORRECTION — M25 was overstated, and the correction matters

Ep 5 closes with a **three-state** model:

> *"If price is making higher highs and higher lows, the market is bullish… lower lows and lower highs…
> bearish. And **if price is moving sideways without clear direction, the market is ranging**."*

`smc.js:92` reads `let trend = 'ranging'`, overridden to bullish/bearish only on ≥3 HH/HL (or LH/LL) with both
present. **The third state exists.**

More importantly, **`ranging` is used as a bias veto, not merely a label** — which is what I had claimed was
missing:

| Site | Effect |
|---|---|
| `momentum.js:105-106` | `decisive: htfTrend !== 'ranging'` — *"no structural direction — there is no bias to follow from it"* |
| `momentum.js:142` | *"HTF ranging, so no bias — a MTF read is **not a reason to trade**"* |
| `momentum.js:149-150` | agreement requires `trend !== 'ranging'` |
| `topdown.js:550` | *"structure is ranging, so treat it as a **range rotation, not a trend trade**"* |
| `setup.js:137-138` | `trendAligned` is false when ranging |
| `indicators.js:160` | *"ADX below 18 — the market is ranging; **trend entries have low odds**"* |
| `db.js:224` | `market_conditions` column, commented *"trending / ranging / volatile / news"* |

**So Ep 19's chop stand-down and Ep 2's *"stay away from trading consolidation"* are both substantially
served.** M25 is downgraded **S2 → S3** and rewritten. What genuinely remains is narrower: the four-stage
*sequence* has no counterpart (`phase`/`stage` still score 0), and **expansion is not distinguished from
pullback** — which is what M3's timing rule actually keys on.

**The M10↔M25 linkage recorded earlier is withdrawn.** M10 stands purely as a missing *calendar* rule
(Mon/Fri, December), not as a missing framework stage.

**How this happened:** M25 was raised from a term count — `consolidation` scoring 0 across `src/bots/`. That
count was correct, and it was still the wrong evidence, because the concept was implemented under the name
`ranging`. This is the same failure mode as M1 (two-tier structure), the Ep 23 routine grep, and Ep 2's Q4.
**A term count of 0 is not evidence of absence when the concept may be named differently.**

### Ep 6 chunks 1–3 — episode complete (transcript ends in chunk 3)

The whole episode is an argument **against** pattern memorisation, which matters because the project ships a
30-pattern library.

> *"A lot of conventional advice will tell you to memorize every single one of these candlestick patterns… But
> it's not as simple as that. **The candlestick pattern is as important as the context in which it appears.**"*
>
> *"I just came up with my own method… to just observe the **momentum and the pressure** of the candlesticks by
> looking at the **anatomy** of the candlestick itself. That tells me so much about the price action **without
> needing me to memorize useless patterns**."*

**His six rules, and what the code does with each:**

| # | His rule | Implementation | |
|---|---|---|---|
| 1 | *"Candlesticks tell you who is in control"* — count bullish vs bearish, and body size ("BBC" = big bullish/bearish candle) | `marketStructure` labels + `bodyRatio` | ✓ |
| 2 | **Doji signals indecision, NOT reversal** — *"they assume that after a doji, price is just going to reverse. Let me just bust that myth."* | `indicators.js:75` → `['doji', 'Doji', **0**]` | ✓ **exact** |
| 3 | *"The larger the candlestick body, the more momentum"* | `smc.js:167` `rangeAtr >= 1.2` | ✓ |
| 4 | *"Candlesticks on the higher time frame matter more than the lower"* | the topdown bias/zone layers | ✓ |
| 5 | *"Do not rely on candlestick patterns without context… **you need multiple confluences**"* | the pattern library gates **no** trade (verified earlier: `detectPatterns` has no caller outside `indicators.js`) | ✓ |
| 6 | *"Compare the size of the body to the size of the wick"* — 90 % body / 10 % wick = strong; **20 % body / 80 % wick** = indecision | `smc.js:165` `const bodyRatio = body / range` | ✓ **exact** |

**Rule 6 is implemented with the same arithmetic he describes.** `smc.js:156-170`:

```js
const range = b.h - b.l;
const body  = Math.abs(b.c - b.o);
const bodyRatio = body / range;            // :165  ← his body-vs-wick comparison
if (bodyRatio >= minBody && rangeAtr >= minAtr) {   // :167  minBody 0.55, minAtr 1.2
```

A candle must be ≥55 % body to register as displacement. His strong example was 90 % body; his indecision
example 20 %. The threshold sits between them, so it accepts his strong candles and rejects his indecisive
ones. **Rules 3 and 6 are both encoded in that single condition.**

**Rule 2 is exact, and the surrounding weights are consistent with it.** `doji` scores **0** — literally
indecision, contributing nothing. But `morningdojistar` = **+2** and `eveningdojistar` = **−2**, which is
correct under his own rule: in those three-candle patterns the doji is the *middle* candle and the third
candle supplies the confirmation he asks for (*"focus on what happens **after** the doji"*). `dragonflydoji`
+1 and `gravestonedoji` −1 carry wick-rejection meaning, consistent with rule 6.

### The episode's limiting statement endorses the architecture

> *"Candlesticks… **They do not replace market structure. They do not replace liquidity concepts or timing.**
> You still have to understand all of these market mechanics concepts so that you can have the full picture.
> **This is just a piece of the puzzle itself.**"*

That is the justification for the 30-pattern library gating no trade. Recorded earlier as a verified-faithful
result on the evidence that `detectPatterns` has no caller outside `indicators.js`; this episode supplies the
*reason* it is correct rather than merely inert.

**Ep 6 complete — transcript ends at *"you're just one trade away"* followed by `Back To Top` in chunk 3;
chunk 4 is site chrome.**

---

## Ep 7 — Institutional Supply & Demand Zones (`52aKS7HN_jI`) — COMPLETE, 5/5 ✔

### The rules he states

**Origin rule** — a zone is only valid if it is the origin of an aggressive imbalance move:

> *"Not random support and resistance levels… I'm talking about the areas where **imbalance entered the market
> so aggressively that price had no choice but to move**."*
>
> *"Look for **big juicy candlesticks**… all you have to do after you find the imbalance is to find the **origin
> point** of the imbalance… and that becomes your supply and demand zone."*

**Two drawing methods:**
- **Range method** — *"mark up the **entire consolidation** that led to this imbalance move… the highest point
  and the lowest point of the consolidation"*
- **Pivot method** — *"mark up the **pivot candle** that led to the breakout… the candle that caused the entire
  reversal"*

with the tradeoff stated explicitly: *"**the more refined the zone is, the higher your risk to reward**… But the
downside is there's a **greater chance of you missing the trade entry**."* His advice: *"try both of these
methods over the span of **100 trades**"* — the sample-size rule again.

**Strength rule** — *"**the stronger the move away from the zone, the more important that zone usually is**."*

**Mitigation rule** — the most mechanical statement in the episode:

> *"It counts as a mitigation if price… has **pulled back very aggressively into the 50 % of this zone**… I
> like to count a valid mitigation as **price reaching the 50 %**."*
>
> *"If price actually just pulls back and **touches** this zone and then continues going down, I personally
> **do not like to count that as a valid mitigation**."*

Consequence: an **unmitigated** zone is still a target; a **mitigated** zone is spent — *"the next time price
comes down to this area, price is most likely going to **blast right through it**."* With one exception: *"there
are certain zones where price just **respected multiple times**… as a result it just continues holding"* —
**multiple touches make a zone stronger**.

**Confluence before trading a zone** (chunk 4): *"if price is bullish, **I do not want to sell at weak
highs**"* → **M21**; *"wait for the **liquidity to be swept**"* → the R3 gate; and two entry styles —
**aggressive** (*"enter the minute price mitigate this zone"*) versus **confirmation** (*"wait for the internal
structure [to] start shifting bearish first"*).

### Checked against the code

**Three exact matches.** `findOrderBlocks` (`smc.js:180-196`) is driven by displacement:

```js
for (const d of displacement) { … }                       // :183  zones exist ONLY at imbalance origins
const dir = d.dir > 0 ? 1 : -1;  // 1 = demand, -1 = supply // :194
```

That is his origin rule, and the supply/demand typing comes from the displacement direction. **Walking back to
the last opposite-colour candle within 6 bars and using `ob.h`/`ob.l` as the zone is precisely the pivot
method** — one candle, not a range.

The strength formula at `:211` encodes three more of his rules:

```js
0.4 + Math.min(d.rangeAtr / 3, 1) * 0.3   // ← "the stronger the move away, the more important the zone"
    + (brokeStructure ? 0.2 : 0)          // ← structure break adds
    + (tests === 0 ? 0.15 : 0)            // ← unmitigated bonus
    - (breached ? 0.5 : 0)                // ← "price will blast right through it"
```

### Two divergences

**M29 — mitigation is any touch, not 50 % depth.** `smc.js:206-207`:

```js
if (dir > 0 ? b.c < bottom : b.c > top) { breached = true; mitigated = true; }
else if (dir > 0 ? b.l <= top : b.h >= bottom) mitigated = true;   // ← a wick touch of the edge
```

The second branch marks a zone mitigated when a candle merely **touches** the zone edge. His rule explicitly
rejects exactly that case. The bot is therefore **more permissive**: it treats zones as spent after a shallow
probe, when the course would still count them fresh and tradable. Downstream this mis-scores zone strength via
the `tests === 0` bonus.

**M30 — the range method is absent, and multi-touch strength is inverted.** Only the pivot method exists; there
is no consolidation high-to-low zone. He flags the consequence himself: with the pivot method *"you would have
missed this entry… price did not mitigate your zone"*, whereas the range method would have caught it. Separately,
his *"respected multiple times → very strong zone"* rule has no counterpart: `:211` rewards `tests === 0` and is
**indifferent to multiple tests**, so repeated respect neither strengthens nor weakens a zone in the code.

---

## Ep 8 — Premium and Discount (`xR1KUjv0PB8`) — COMPLETE, 4/4 ✔

### The rule, stated as a TL;DR by him

> *"**Bullish** market structure, **wait for price to enter discount zone before buying**… mitigate a demand
> zone that is within the discount range, then look for longs.
> **Bearish** market structure, **wait for price to enter premium zone before selling**… mitigate a supply zone
> within the premium range, then look for shorts."*

Premium = above the 50 % **equilibrium** of the swing range; discount = below it. Three steps: identify
structure, identify the swing high/low pair, measure the range.

**And it is a disqualification, not a preference:**

> *"If you enter for longs [in premium], it's a little bit too premature… that **automatically disqualifies**
> this demand zone… we can expect that demand zone to **fail**."*

The four-way table he closes on:

| Zone | Location | His verdict |
|---|---|---|
| Demand | **discount** | strong buying area |
| Supply | **premium** | strong selling area |
| Demand | premium | *"low quality. Most likely going to **blast right through it**"* |
| Supply | discount | *"low quality. Price is most likely going to **blast through it**"* |

**The extreme-zone rule** — the part that is not implemented:

> *"**The more extreme the zone is within the range, the higher the probability.**… this zone… situated at the
> **extreme swing low**, is going to be much more high probability."*

with the structural justification: *"the previous low **has to hold** in order for price to remain bullish… so
the extreme zone is usually the most high probability."*

**Multi-timeframe caveat:** *"Don't use premium and discount on the daily time frame while you're entering the
trade on the 5-minute time frame… it just doesn't line up."*

### Checked against the code

**The direction rule is implemented, and correctly.** `setup.js:130-133`:

```js
/* 4. discount / premium */
const pd = (analysis && analysis.premium_discount) || null;
add('range', long ? 'Price is in discount of the dealing range'
                  : 'Price is in premium of the dealing range', …)
```

Longs are scored on being in **discount**, shorts on being in **premium** — exactly his TL;DR. `momentum.js:110`
also assigns premium/discount the explicit role `'location'` on the trading timeframe, matching his framing
that this is the *"location piece of the puzzle."*

**The dealing range is stricter than his spec, sensibly so.** `premiumDiscount` walks back through up to 8
swing pairs until the leg spans **≥ 6 ATR**, with the comment that this makes premium/discount *"actually mean
something on every timeframe."* He just says "the swing high and swing low"; the ATR floor prevents a trivial
range from producing meaningless halves. A refinement, not a divergence.

### One gap, and one thing I have not verified

**M31 — zone strength is not scaled by depth into the range.** His extreme-zone rule says the deepest zone in
the correct half is the highest-probability one, because it sits at the strong swing that *must* hold. The
zone strength formula established in Ep 7 (`smc.js:211`) is
`0.4 + rangeAtr/3*0.3 + brokeStructure*0.2 + (tests===0)*0.15 - breached*0.5` — **no depth-into-range term**.
So a zone at the extreme of the discount and one just inside the 50 % line score identically, when the course
ranks them very differently.

**Unverified, and flagged as such:** the premium/discount check is added via `add(...)`, i.e. the same
weighted-scoring mechanism as every other check. **M7/M8** established that under that mechanism nothing except
news actually vetoes a setup — so a zone on the wrong side of equilibrium very likely *reduces* the score
without disqualifying it, where his rule disqualifies outright. **I have not read the weight passed at
`setup.js:133` or measured a wrong-side setup end to end**, so this is stated as a probable consequence of M7,
not as a separately confirmed defect.

---

## Ep 9 — Fair Value Gaps / Imbalance (`9P-u7MWosFo`) — COMPLETE, 5/5 ✔

### The definition, precisely

A three-candle sequence, and **the gap is mandatory**:

> *"The first candlestick leave one side of the range, the second candle expand aggressively… and then the third
> candle leave a **gap between the wick of candlestick number one and the wick of candlestick number three**."*

Bullish FVG = gap between the **high of candle 1** and the **low of candle 3**; bearish is the mirror.

**He states the negative case three separate times**, which is why it matters:

> *"You want to make sure that you **don't just mark up a fair value gap if there is no gap whatsoever**… a lot
> of people see big candlesticks and immediately try to mark out a fair value gap as this range… **But that's
> not true, because there is no gap whatsoever**… since there's no gap, this is **not counted as a fair value
> gap**, which also means there is **no imbalance** here."*

**A big candle alone is not an FVG.** This is the rule the implementation has to get right.

### Uses, and the anti-standalone rule

Two uses: **entry** (*"the minute price mitigate this bearish fair value gap, you can look for shorts"*) and
**target** (*"target the next opposing fair value gap… that's where price is gravitating towards next"*). Stop
placement: *"place a stop loss **above the fair value gap** and just target like **3R or 2.5R**."*

Reaction depth is explicitly **not** fixed:

> *"Sometimes price will tap into the **edge**… sometimes… the **midpoint, which is the 50 %**… sometimes… the
> **extreme**… price might even **pierce past** the fair value gap and then go. **Do not expect the market to
> react the same way every time**… never, ever assume."*

**And the decisive statement for M16:**

> *"**You don't ever ever want to assume that a fair value gap is going to hold. This is the mistake that a lot
> of people make. They just trade fair value gaps alone**… without realizing that it's not going to hold
> because **the structure is against you, you are trading at the wrong location, you are trading a bullish fair
> value gap in a premium pricing**."*
>
> *"I will consider looking for longs **if I have multiple confluences**… **If not, then I would just be using
> this as a reference point** for me to know where price is moving towards next, and that's it. **I will not
> trade it.**"*

He also explains *why* one FVG held and another failed: *"this one is **more high up within the premium
range**"* — premium/discount applied to FVG selection, extending M31.

**The chronological-order house rule, restated a fourth time:** *"please just watch these lessons in
chronological order… **each lesson is built on top of the previous lesson**… you can only find an order block
when you have identified imbalance."*

### Checked against the code

**FVG detection is a true gap test, not a displacement proxy.** `smc.js:707` calls
`findFvgs(candles, atr)` as its own function, separate from `findDisplacement` at `:705`. So a large candle
without a wick gap does not produce an FVG — his negative case is handled. **A match.**

**M16 is confirmed at the gate.** `setup.js:120-122`:

```js
const zone = bestOB  ? { kind: 'order_block', …, overlap: bestOB.overlap }
  : bestFvg ? { kind: 'fvg', …, entry: bestFvg.mid, overlap: null }   // ← standalone FVG becomes THE zone
    : null;
add('zone', …, !!zone, 16, …)
```

When no order block exists, **a standalone FVG satisfies the POI check** with weight 16. Ep 9 names exactly
this as the mistake.

**The refinement that makes M16 narrower than first recorded:** the code *prefers* `bestOB` and reports
`'nested FVG'` when `zone.overlap` is set — which is Ep 37's *"I want the fair value gap to be **within the
order block itself**."* So the nested case is handled correctly; only the **fallback** to a standalone FVG
diverges. The measurement recorded earlier still applies: 1145 order blocks against 28 standalone FVGs, of
which 19 were tradeable — **2.4 % of setups** reach the divergent path.

**Also confirmed:** the chronological-order rule that this audit has been following was his instruction, stated
in Ep 1, Ep 2, Ep 5 and here.

---

## Ep 10 — Order Blocks (`kIBIM4by-Sc`) — COMPLETE, 6/6 ✔

### The definition and the three-step mechanical rule

> *"An order block is basically **the last candle before the strong impulsive move** that causes displacement
> and later on led to a break of structure."*

His identification steps, in his words:

1. *"The reversal candle or the pivot candle that happened before the imbalance move **must take out the
   previous candlestick low**"* (or high, for bearish)
2. *"Some form of **gap or imbalance** being created, because this signals institutional intent"*
3. *"A **sharp and substantial** upward movement. It cannot be slow… **Ideally we should have a V-shaped
   reaction**"*

And the prerequisite stated flatly, twice:

> *"**Fair value gap must be present in order for us to identify order block. No imbalance, no fair value
> gap.** As simple as that."*

**Why an OB differs from a supply/demand zone** — the distinction that matters:

> *"For supply and demand zone… **it doesn't matter whether there's imbalance or not**. As long as it's an
> aggressive move, you can draw a supply and demand zone there. But for order block, **one of the very strict
> criteria for it to be valid is that it needs to have an imbalance**."*

**OBs always use the pivot method:** *"order blocks is usually much more refined because **we are always using
the pivot method**."*

**A refinement he adds himself** — if the next candle blasts straight through, move the block: *"that's not
really an order block anymore since price is already blast right through it… I would **change the order block
location to the next candlestick**… I want it to be **unmitigated** as much as possible."*

### Checked against the code — and a correction to my Ep 9 attribution

**The pivot method is implemented, and correctly** — established in Ep 7: `smc.js:180-196` walks back to the
last opposite-colour candle within 6 bars and uses `ob.h`/`ob.l`. **A match.**

**But the FVG prerequisite is a bonus, not a requirement.** `findOrderBlocks(candles, atr, displacement,
breaks, …)` takes **displacement** and **breaks** — it is never passed `fvgs`, and its strength formula has no
FVG term. Displacement (`rangeAtr ≥ 1.2 && bodyRatio ≥ 0.55`) is a *large candle*; an FVG is a *three-candle
gap*. They are not the same test, and his prerequisite is specifically the FVG.

The nesting **is** detected — but downstream, and as a reward. `setup.js:110-116`:

```js
// prefer a fresh, strong OB with an unfilled FVG overlapping or nested
const overlap = fvgs.find((g) => g.bottom <= z.top && g.top >= z.bottom);   // :112
const score = z.strength + (z.fresh ? 0.35 : 0) + (overlap ? 0.3 : 0) + proximity * 0.5;  // :115
```

and at `:128`:

```js
if (zone && zone.overlap) add('nested', 'Zone + imbalance overlap (confluence)', true, 8,
  'The order block contains an unfilled FVG — two reasons for price to react at the same price.');
```

**So an OB containing an FVG earns +0.3 on zone score and a separate +8 check — but an OB *without* an FVG is
still a fully valid zone.** His rule makes that OB invalid outright. Logged as **M32**.

**Correction to what I wrote in Ep 9.** I said the code *"prefers `bestOB` and flags `'nested FVG'` when
`zone.overlap` is set"*, and implied the overlap came from the SMC layer. The substance was right — the
nesting is detected and preferred — but **`overlap` is computed in `setup.js:112`, not in `smc.js`**; a grep for
`overlap` in `smc.js` returns only unrelated killzone text. Recorded here so the citation is accurate.

**Not verified, stated plainly:** I attempted a runtime check that any OB carries an `overlap` field and it
**failed on a bad fixture path** (`../../analysis/fixtures/EURUSD_15m.csv` from the wrong CWD — `ENOENT`). So
the frequency of OB-with-FVG versus OB-without is **unmeasured**. The code reading above is the evidence; the
runtime figure is not available.

**Also not yet checked:** whether his step 1 — the pivot candle must take out the previous candle's low/high —
is enforced. The walk-back at `smc.js:185-191` tests only candle **colour**, not a prior-extreme break. Flagged
for the remaining chunks rather than asserted now.

### Ep 10 chunks 2–5 — episode complete (6/6)

**M32 confirmed with a worked example.** He walks a chart where there was a sharp move but no gap:

> *"There was no imbalance because… the low of the next candlestick was somewhere around here. So there was no
> gap whatsoever… **I cannot just blindly put this as my order block**… this is not an order block because
> there is no gap… **However, because there was aggressive buying pressure… we can still deem this as a demand
> zone.**"*

That is exactly the distinction M32 turns on: **no FVG ⇒ not an order block, but still a valid supply/demand
zone.** The code has one zone type (`kind: 'OB'`) built from displacement, so it cannot make that call.

### His four common mistakes, mapped

| His mistake | Status in the code |
|---|---|
| 1. **Ignoring displacement/imbalance** — *"if there's no imbalance it is **not an order block**, it is just an ordinary supply zone"* | **M32** |
| 2. **Ignoring structure** — *"in order for this order block to be strong, **it needs to break structure**… it requires a lot of money to take out a particular high"* | ✓ `brokeStructure ? 0.2` at `smc.js:211` |
| 3. **Wrong part of premium/discount** — *"if you are looking for longs you want to wait for the order block that is within the **discount** range"* | ✓ `setup.js:133` |
| 4. **Trading blindly without confirmation** — *"they mitigate the order block and immediately enter… then price just blasts right through… **you need multiple confluences**"* | **M7/M8** |

Two of four are implemented; the two that are not both already have ledger entries.

### The FVG → OB ordering

> *"Once price enters the fair value gap, you can look for your entry. And if you don't find your entry within
> the fair value gap itself, you can **wait for price to come down even lower to the order block**."*
>
> *"The **first place** where price is gravitating towards next is going to be the fair value gap, and **then
> after that** it could potentially move to the order block."*

with the reason it varies: *"it all depends on the **amount of liquidity the market has** when price is
approaching the zone… **whichever one actually gave us the entry confirmation**, that's the zone in which we
want to enter."* The code scores OB and FVG as alternative zones (`setup.js:121-122`, OB preferred, FVG as
fallback) but does not model the *sequence* — which zone price reaches first.

### M31 strengthened with explicit numbers

> *"This zone has like an **80 % chance of holding** while this zone only has like a **50 %** chance… purely
> because of the fact that this zone is **higher up within the premium pricing**."*

Same OB identification, different location, materially different probability. That is the extreme-zone rule
from Ep 8 restated with figures — and `smc.js:211` still has no depth term.

### Two nuances, recorded rather than ledgered

**Pivot-candle colour.** He says three times he does not care: *"I prefer to just draw it at the pivot candle
**which can be bearish, can be bullish. I don't care.**"* The code *requires* the opposite colour
(`smc.js:187` `const opposite = d.dir > 0 ? b.c < b.o : b.c > b.o`). That is the textbook rule he explicitly
sets aside — so the code is **stricter than his stated preference**, not contrary to the concept. Recorded as a
nuance; not a defect.

**Step 1 — "must take out the previous candlestick low".** Still unverified. The walk-back at `smc.js:185-191`
tests only colour, not a prior-extreme break, so on the face of the code this condition is **not enforced**.
Flagging it as a probable gap rather than a confirmed one, since the displacement requirement may make it
redundant in practice — measuring that needs a run I have not done.

### The episode's closing statement

> *"It can be the **strongest order block** that led to the most freaking imbalance move out there. But **if it
> doesn't have multiple evidence, multiple variables, multiple confluences backing it up, it's useless. It's
> good as nothing. Price will just blast right through it.**"*

with the factors he lists: *"liquidity, supply and demand zones near it, inducements, order flow, market
structure."* This is the clearest statement yet that **zone strength alone must not produce a trade** — which
is the same objection as M7/M8, from the zone side rather than the scoring side.

**Ep 10 complete — 6/6 chunks.**

---

## Ep 11 — Top Down Analysis Strategy (`qtrATSo3-lQ`) — COMPLETE, 8/8 ✔

49:07. The longest episode read so far, and the one the docs name as the source of the
five-step CRT. Chunk 7 is site chrome (`Back To Top` appears in chunk 6, after *"you're
just one trade away"*).

### What the episode actually teaches

**The thesis.** *"One of the biggest reasons traders stay confused is because they keep
switching time frames without actually knowing what each time frame is supposed to do."*
And: *"multiple time frames doesn't mean the market is doing different thing. It just
shows you the different layers of the market itself."*

**Three time frames, three jobs — all three are mandatory.** *"You need all three time
frames. You cannot just have one time frame."*

| Layer | Job, in his words | The questions he says to ask |
|---|---|---|
| **Higher** | *"build the narrative… identify the trend direction… who's in control of price, supply or demand, buyers or sellers"* | bullish / bearish / **ranging**? price relative to key S/D? premium or discount? what liquidity is nearby? approaching an OB, FVG or major zone? |
| **Medium** | *"determine your **immediate bias**, which is what price is doing right now"* **and** *"identify your **point of interest**"* | refine the dealing range, the exact zone to enter from, the internal structure, whether price is approaching the area properly |
| **Lower** | *"wait for price to enter into your area, and then… look for your entry confirmation, look for your entry model"* | refine the entry, tight stop loss, place the take profit |

His one-line summary: *"the higher time frame tell you **who** is in control of price.
Medium time frame tells you **where** to enter the trade. Lower time frame tells you
**when** to enter."*

**The time frame sets he puts on screen "for you to actually copy":**
- **Day trader** — HTF **4-hour**, MTF **15-minute**, LTF **5-minute** (stated verbatim).
- **Scalper** — HTF **1-hour**, MTF **5-minute**, LTF **1-minute** (stated verbatim).
- **Swing trader** — the set is on screen but he never says it aloud; the ASR carries no
  numbers. **Unverifiable from the transcript.**

His style definitions: swing = *"holding the trade for more than 24 hours, after a few
days, or even a few weeks"*; day trader = *"opening and closing a trade within 24 hours,
not trying to hold the trade overnight"*; scalper = *"getting in and out within a few
minutes, anywhere under less than an hour."*

**He personally uses four, not three.** As a day trader: 4h, then *"the 1-hour time frame
and the medium 15-minute time frame as my medium time frame… I personally like to use
both."* As a scalper: *"I personally like to use the 15-minute as the medium time frame.
And then the 5-minute and 1-minute as the lower time frame."* He is explicit that this is
**not** the recommendation: *"here only recommend you to use one… I just wanted to show
you three time frames for simplicity's sake."*

**Top-down is mandatory.** *"always start from your higher time frame… You don't want to
take a bottom-to-up approach."* Starting low = *"you're essentially building a bias from
noise"* and *"you're putting blinders on yourself."*

**The LTF gate — stated as a rule, not a preference.** *"you **only** go down to the lower
time frame **once price have touched your medium time frame point of interest**. This
prevents you from trading when price is in the middle of nowhere."* And: *"when price is
hovering around here in the middle of nowhere, **we do not go down to the lower time
frame**… I'm doing nothing until price touches either one of these zone… maybe I would
like to **set an alert right here at the edge of the zone**, and then I just wait."*
Reinforced: *"I never ever chase price. I wait for price to come to me."*

**HTF dominance.** *"the higher time frame trend will always have much more power and
control over the lower time frame trend."* *"The higher time frame is still king."*
*"when in doubt, just zoom out."*

**Counter-trend trades are explicitly sanctioned.** His worked EURUSD example: 4h bullish,
15m *"came all the way down here taking out the last higher low giving us a market
shift."* Then: *"maybe it's not the best time to look for longs. **Maybe it's a good time
to look for shorts.**"* and *"**So this is how we can go about if you want to trade counter
trend**… if you were to look for short, you are actually trading with the internal
structure, but you're **trading against the higher time frame swing structure**."* The
target for that short is the HTF demand zone: *"short it all the way till price comes down
to the discount range or comes down to this demand zone."*

**Scalper caveat on the daily.** *"I don't really need to care about what price is doing on
a daily time frame or the weekly time frame… **just don't put too much significance over
the daily time frame**."*

**The process statement.** *"The entry is the last thing you do. **The money is not made in
clicking the buy and sell button. The money is made in the preparation that comes before
that.**"*

**The live scalper trade** (his second channel, "Bread Trades"): entry after a bullish
confirmation at a 15m demand zone, **scaled in a second position** on the pullback, stop
moved *"below this new low… of my second position"*, target the next 15m order block, held
through *"down like 50k"* because *"if that low doesn't get taken out, then the bullish
market structure is still intact and my trade idea is still correct."*

**OB identification restated** (anticipating Ep 37): *"find the imbalance… find a strong
displacement, huge displacement… and then **this right here is the origin point, so this
becomes the order block**"*; and *"if you look at the next candlestick, there was
imbalance. So, this is the order block."* Reinforces **M32**.

**Premium/discount restated:** the supply zone that matters is *"located within the premium
range **above the 50 % equilibrium level** within the swing range."*

### Code audit

**The time frame stacks match exactly.** `topdown.js:60-70` `STACK`, surfaced through
`layersFor(tf)` (`:100-109`) as `bias_tf / entry_tf / trigger_tf`. Running it for every
supported timeframe:

```
tf    style     bias  zone_tf  entry  trigger
1m    scalp     15m   5m       1m     1m
3m    scalp     30m   15m      3m     1m
5m    scalp     1h    15m      5m     1m      <- his scalper set: 1h / 5m / 1m   EXACT
15m   day       4h    1h       15m    5m      <- his day set:     4h / 15m / 5m  EXACT
30m   day       4h    1h       30m    15m
1h    swing     1d    4h       1h     15m     <- his swing set never spoken; unverifiable
4h    swing     1w    1d       4h     1h
1d    position  1w    1d       1d     4h
1w    position  1w    1d       1w     1d
```

`bias` ↔ his higher, `entry` ↔ his medium, `trigger` ↔ his lower. **Both spoken sets are
reproduced exactly.** The scalper caveat is honoured too: `STACK['5m'].bias` is `1h`, so a
5m scalper never consults the daily.

**The MTF holds the POI — faithful.** `momentum.js:178` `const smc = mtf.smc;` — the
location factor reads the **medium** timeframe's order blocks, exactly as he specifies.

**"HTF is king" — faithful, and deliberately not a vote.** `momentum.js:163`
`hierarchy: 'higher timeframe decides direction · lower timeframes only time it'`, with
`display_note: 'Direction is taken from the top of the stack, never from this average.'`
Rows carry weights 3/2/1 but the score is explicitly labelled a display of indicator
readings only.

**The at-zone sequencing gate IS implemented — and measured.** `setup.js:220-238` derives
`levels.entry_status` in four states:

| state | condition (long side) | consequence |
|---|---|---|
| `invalid` | price below `zone.bottom − 0.2 ATR` | score capped **20** (`:282`), `ok:false` (`:315`) |
| `at-entry` | price inside the zone | *"the retest is happening now"* |
| `approaching` | within 1.5 ATR above | *"waiting for the retrace"* |
| `waiting` | beyond 1.5 ATR | score capped **66** (`:284`) → **max grade B**, and the note is *"do not chase; set an alert at …"* |

Measured with `analysis/probe-atzone-gate.js` (300 synthetic runs through the real
`SMC.analyse` → `Setup.buildSetups` path; 600 candidates, 428 with priced levels):

```
at-entry     46   grades: A+=1 A=31 B=3 C=2 no-trade=9
approaching  93   grades: A+=4 A=42 B=2 C=15 no-trade=30
waiting     289   grades: B=236 C=6 no-trade=47
'waiting' candidates scoring above 66 : 0     <- the cap holds, zero violations
```

Not one `waiting` candidate reached A or A+, so the cap at `:284` demonstrably fires. The
`waiting` playbook at `:324` is *"Wait for the retrace to … **Chasing here breaks the
model's edge**"*, and `:323` for `approaching` is *"**Set an alert at** …"* — his own
instruction almost word for word. **I had drafted this as a missing gate; reading
`setup.js:220-238` showed it exists. Withdrawn.**

### New findings

**M33 (S2) — the medium timeframe cannot originate a trade direction.** Proven by
execution, `analysis/probe-ep11-countertrend.js`. Reproducing his exact state (4h bullish,
15m bearish) and running the real `TD.build` → `Setup.buildSetups`:

```
4h structure : bullish      15m structure : bearish
td.direction : 0            td.blocked : true
conflict no-trigger       blocks_trade=true  "4h bullish vs 15m bearish"
   rule: "The trading timeframe disagreeing with it is not a signal to trade the
          other way — the method has no trade in it at all."
verdict: NO TRADE via topdown-gate — "Do not take the 15m trade on its own."
```

Sweeping 400 seeds for the airtight case, three came back where the gate is the **only**
blocker:

```
seed 1  setup model alone -> SELL (grade B, score 66)   bot -> NO TRADE (topdown-gate)
seed 2  setup model alone -> SELL (grade B, score 66)   bot -> NO TRADE (topdown-gate)
seed 5  setup model alone -> SELL (grade B, score 66)   bot -> NO TRADE (topdown-gate)
```

He sanctions exactly this trade: *"Maybe it's a good time to look for shorts. **So this is
how we can go about if you want to trade counter trend.**"* The code permits counter-trend
**only when the HTF's own CRT fires** (`topdown.js:563-570`, `blocks_trade:false`, *"The
method allows it — the failed sweep is the evidence"*), never from an MTF structure read.
`alignment()` (`momentum.js:127-141`) can only take direction from `td.direction` (the HTF
CRT) or `htfTrend`; the branch where the MTF has a read and the HTF does not sets
`bias = 0`.

**M34 (S3) — `STACK.zone` is dead config.** `layersFor()` returns `zone_tf` at
`topdown.js:105`; `grep -rn zone_tf src/ views/ scripts/` returns **exactly one hit — that
assignment**. It is never read. Consequence: the code operates on three layers
(bias/entry/trigger) and his *personal* four-timeframe method (4h / 1h+15m / 5m) is not
expressible. No behavioural cost for the recommended sets, which are reproduced exactly —
but the fourth column is misleading to a reader of `STACK`. *I nearly reported the opposite
error here — that the code inserts an extra medium layer his lesson does not have. It does
not: the column is inert.*

**M35 (S3) — `waiting` caps the grade but does not stand down.** From the same measurement:
`ok:true WHILE entry_status==='waiting' : 242` of 289. A grade-B setup with price far from
its zone still returns `ok:true`, and `setup.js:33` labels B *"Tradeable — reduced size or
wait for the retest."* His rule is a stand-down (*"we do not go down to the lower time
frame… I'm doing nothing"*), not a size reduction. Mitigating: the entry is a **limit at
the zone**, so nothing chases — which is arguably his "set an alert at the edge and wait."
Recorded at S3, not S2, for that reason.

**M36 (S3) — no scale-in anywhere.** Nine vocabulary terms
(`scale_in scaleIn pyramid "add to" add_to "second entry" partial_entry top_up
increase_position`) return **0 hits** across `src/`; there is no legs/entries sub-table
(15 `CREATE TABLE` statements in `db.js`, none for trade legs); `trades.entry` is a single
`REAL NOT NULL` with one `size` and one `opened_at`. He scaled into a second position and
moved the stop to the second position's internal low. `trades.stop_moved INTEGER` captures
the stop move but not the added size.

**Ep 11 complete — 8/8 chunks.**

---

## Ep 12 — ICT Killzones (`uLw-qdpV3uk`) — COMPLETE, 4/4 ✔

26:32. `hasMore:false` at chunk 3; `Back To Top` follows *"you're just one trade away."*
ASR renders "kill zones" as *"Q zones"* throughout.

### What the episode teaches

**Definition.** *"Q zones are specific times of the trading day when high probability
setups are more likely to appear because volume and participation increases."* And the
thesis: *"even if your entry model is good, even if you got a perfect setup, **timing still
matters**. It's like half of the battle."*

**His stated time reference.** *"The following times right here are in **UTC-4**, right?
Which is the Eastern Standard Time."* — he means US Eastern **local** time, and the offset
he quotes is EDT. That matters: his reference frame shifts with DST, which is exactly what
**M6 / patch `0002`** is about.

**The four killzones he names** (Eastern as spoken, converted below):

| Killzone | Eastern (his words) | UTC @ −4 | UTC @ −5 | Pairs he assigns |
|---|---|---|---|---|
| **Asia** | 8:00 p.m. – 12:00 a.m. | 00:00–04:00 | 01:00–05:00 | **AUD, NZD, JPY** |
| **London** | 2:00 a.m. – 5:00 a.m. | **06:00–09:00** | 07:00–10:00 | **EUR, GBP** (EURUSD, GBPUSD, GBPAUD, GBPJPY) |
| **New York** | 7:00 a.m. – 10:00 a.m. | **11:00–14:00** | 12:00–15:00 | **anything with USD** |
| **London close** | 10:00 a.m. – 12:00 *(p.m. implied)* | **14:00–16:00** | 15:00–17:00 | **USD pairs** |

**Which offset he means is settled by his own cross-check:** *"if you want to trade during
the London Q zone, which for me is going to be the **2:00 p.m. to 5:00 p.m. Singapore
time**."* Singapore is UTC+8, so 14:00–17:00 SGT = **06:00–09:00 UTC** = 02:00–05:00 at
**UTC−4**. So UTC−4 (EDT) is the intended frame, and the London column above is the right one.

**Session personalities.** Asia *"a lot slower… quite consolidatory"*, range-bound,
*"not where you can expect… the big explosive move on the USD pairs."* London *"where you
see like the market expand heavily"* — his favourite, *"90 %"* of his trades. New York
*"where high impact news are usually released"*; price *"can retrace back to the range that
was established in the London session, and then either continue or cause the entire trend to
reverse."* London close *"a little bit lower trading volume… price tends to retrace back to
the daily range"*, good for *"small retracement base opportunities."*

**Match the pair to the session.** *"if you are trading EURUSD, you cannot expect to get the
same volatility in Asia session as you do in London session."* And: *"**Don't try to trade
every pair in every session.**"*

**Asia sweep strategy.** *"If the daily structure is bullish, what tends to happen is that
price will sweep the Asia high, creates the high of the day, and then goes down… if price is
actually bearish, then… price can come up there, sweep the Asia low… and then reverse and go
back up."* Qualified twice: *"not always"*; and he refers it to a separate video outside this
playlist.

**The systematic framework.** (1) pick **one** session by lifestyle/sustainability; (2) pick
that session's pairs; (3) inside the window run the Ep 11 top-down — HTF bias → MTF POI →
LTF confirmation; (4) *"If it doesn't appear during your Q zone, **do nothing**. Do not force
a trade."*; (5) repeat *"all the way from Monday to Friday."*

**Overtrading.** *"the cost of overtrading is you give back your profits back to the market,
and the **hidden cost of overtrading is that you start to feel analysis paralysis**… you
can't establish a trend direction, you are lost and confused in the market because your mind
is just so worn out."*

**The hard block — his own product feature.** *"one of the biggest mistake that traders tend
to make is **trading outside of their edge**. That is exactly why inside **Edge Flow**… we
have actually built a feature that allows you to **define your own trading window**… if right
now it's not 2:00 p.m., **this trade button will be blocked… grayed out, and I will not be
able to open a trade**… You **physically can't press the trade button**."* With the reason:
*"you're **not relying on discipline**. You are just **implementing that discipline into your
trading system itself**."*

**Killzones replace nothing.** *"Q zones does **not** replace your entry confirmation. It does
not replace your entry model. It does not replace your higher timeframe bias, your immediate
bias. **It just help you improve the timing of your entry model.**"*

**His anti-indicator stance, restated.** *"I personally hate indicators… I hate them, I don't
use them at all, but… this is something that can really help you out **if you are new to
trading**."* And on the theory itself: *"use this as a reference… don't just use it as a
crutch… Don't try to anticipate the market… **observe the market. React to what the market
does.**"*

### Code audit

`smc.js:610-623` defines two lists — `SESSIONS` (five, with `quality`) and
`SILVER_BULLETS` (three killzones). **`in_killzone` is driven only by `SILVER_BULLETS`**
(`:642` `in_killzone: !!activeBullet`), and `sessionState` reads `getUTCHours()` (`:627`) —
fixed UTC, no DST, which is **M6**.

Running the real `SMC.sessionState()` at timestamps inside each of his windows:

| timestamp | his window | `in_killzone` | reported |
|---|---|---|---|
| 02:00 UTC (22:00 ET) | **Asia** | **false** | *(none active)*, quality 0.5 |
| 07:30 UTC (03:30 ET) | London | true | London killzone ✔ |
| 11:00 UTC (07:00 ET) | **New York, first hour** | **false** | *(none active)* |
| 12:00 UTC (08:00 ET) | New York | true | NY AM killzone |
| 14:30 UTC (10:30 ET) | **London close** | true | **"NY AM killzone", quality 1.0** |

**M37 (S2) — the two killzone constants use two different Eastern offsets.** Verified
numerically, not by eye:

```
London killzone 06:00-09:00 UTC  matches his London   02:00-05:00 ET  ONLY at UTC-4
NY AM killzone  12:00-15:00 UTC  matches his New York 07:00-10:00 ET  ONLY at UTC-5
```

They cannot both be right. His Singapore cross-check settles it at **UTC−4**, so the London
constant is correct and **`NY AM killzone` is one hour late** — it should be 11:00–14:00 UTC.
Measured consequence: at 11:00 UTC, the first hour of his New York killzone, `in_killzone`
is **false**.

**M38 (S2) — the Asia killzone does not exist.** He names four killzones; `SILVER_BULLETS`
has three, none of them Asia. Measured: at 02:00 UTC — inside his 20:00–00:00 Asia window —
`in_killzone: false`, so an AUD/NZD/JPY trader fails the weight-8 session check in the one
window he says those pairs belong to. (`SESSIONS` does carry Tokyo/Asia at quality 0.5, so
`momentum.js`'s 6-point session factor partly compensates; `setup.js:158`'s 8-point check
does not.)

**M39 (S3) — London close is missing and its hours are over-rated.** His fourth window
(14:00–16:00 UTC) has no counterpart. Measured at 14:30 UTC the code reports **"NY AM
killzone", quality 1.0**, with the note *"highest-probability window for the entry models"*
— where he says it is *"a little bit lower trading volume"* for *"small retracement base
opportunities."* The `NY PM killzone` 15:00–18:00 UTC at quality 0.7 is a window he never
names; it overlaps his London close by one hour and runs two hours past it.

**M26 reinforced.** His hard block is now on the record as a shipped feature fixing *"one of
the biggest mistake that traders tend to make."* Re-verified: 10 vocabulary terms
(`session_pref preferred_session only_session session_filter trading_window trade_window
allowed_hours blocked_outside killzone_only enforce_window`) return **0 hits** across
`src/` and `views/`. `in_killzone` appears in exactly **two** places — a weight-8 score
check (`setup.js:158`) and a hint string (`:420`). It is never a veto.

**M40 (S3) — no pair-per-session mapping.** 5 terms, 0 hits. The same session quality is
applied to every symbol, so EURUSD and AUDNZD score identically inside the Asia window where
he says only the latter belongs.

**M41 (S3) — the Asia sweep strategy is absent.** 7 terms
(`asia_high asia_low asiaHigh asiaLow asia_range asiaRange asia_sweep`), 0 hits. Caveat
recorded honestly: he qualifies it *"not always"* and points to a video outside this
playlist, so it may be out of scope — but the Asia high/low themselves are not even marked,
and `smc.js` has no Asia-session range at all.

**Ep 12 complete — 4/4 chunks.**

---

## Ep 13 — Liquidity Concepts & Inducements (`TthzSVTzWoE`) — COMPLETE, 8/8 ✔

53:52 — the longest episode in the playlist so far. `Back To Top` in chunk 6; chunk 7 is
site chrome. He calls this *"the missing piece of the puzzle"* and *"the biggest game
changer in my trading."*

### What the episode teaches

**Liquidity.** *"Liquidity is **where orders are resting** in the market itself. It includes
**stop losses, breakout entries and pending orders**… it's basically the **fuel** for price
movement."*

**The six places he says it sits:**
1. above a swing high / below a swing low
2. above a **strong** high / below a **strong** low — *"always assume that there is resting
   liquidity behind **any** high or low that price has not yet traded"*
3. **equal highs / equal lows** (double top / double bottom) — both stop losses **and** stop
   orders from breakout traders
4. **trend lines** — *"a lot of retail traders placing their stop losses or stop orders below
   the trend line… that is untapped liquidity"*
5. **support and resistance levels**
6. and the meta-rule: *"**The more obvious a level looks like to the public, the more likely
   liquidity is resting there.**"*

**Buyside / sellside.** *"Buyside liquidity is basically the orders that is sitting **above**
the highs… sellside liquidity is the opposite… the order sitting **below** the lows."* He then
dismisses the labels: *"I honestly don't even bother to remember it. I just name it as
liquidity… **Liquidity is just liquidity.**"*

**The directional rule.** *"If I'm looking for a short position I just want to see price
[sweep] the liquidity **above the swing highs**. Which means if price comes down [and sweeps]
the liquidity below those swing lows **I don't care** because this could just be the fuel that
price need to pull back."*

**The sweep's shape.** *"It usually comes in a form of like a **V-shaped reaction** which means
that price must move down very aggressively and then move back up very aggressively."*

**Sweep ≠ reversal — his explicit caveat.** *"just because it's a liquidity sweep does not
automatically means that the market is going to reverse… Price still have to take out your
structural highs… in order for the market to shift bullish, it needs to take out this last
lower high."*

**Liquidity zone — a zone upgrade.** *"liquidity zone is simply **a point of interest that
swept liquidity**… an area where price first takes an obvious high or low, triggers the resting
orders right there and then reacts from that point **making the point of interest much more
stronger**."*

**The zone-one / zone-two comparison** — his clearest statement that confluences rank zones:
zone one is a supply zone **within premium pricing** + **swept liquidity** + **led to a break
of structure**; zone two is a supply zone **within discount pricing** with **un-swept liquidity
above it**. *"zone one has a higher chance of working out compared to zone two… **It's just
math**… because zone one has much more confluences."*

**The fuel chain.** *"if this liquidity is enough… price will just come up there, sweep the
liquidity, creating a **sharp V-shaped reaction**, and price will just go down… But that did
not happen. So even though smart money swept liquidity right here, there was still **not enough
fuel**. And if there's not enough fuel, then price need to grab more fuel. And where is it
going to grab more fuel? This zone right here."* — sweep → no reaction → next POI → still not
enough → next liquidity pool.

**The entry rule that follows.** *"They see price comes up to this supply zone and they
immediately enter for a sell the minute price mitigate the supply zone… **we are not going to
be entering for a sell right here.** We acknowledge that okay, swing highs are formed right
there. There is available liquidity being built up right there and **I'm not going to enter for
sell until those get swept.**"*

**Inducement.** *"inducement is basically **a move or a structure the market creates to tempt
traders into entering too early**. Placing stops in obvious places or believing the move is
already confirmed."* Its location: *"inducements tend to happen **near a significant point of
interest** near a order block or near a supply and demand zone or near a liquidity sweep
zone."*

**The closing chain.** *"smart money lay out **inducement** → build up **available liquidity**
above or below the inducement → price **sweeps the liquidity** → and then price **moves**."*
And: *"**liquidity is the target. Inducement is the bait.**"*

**Patience.** *"Just wait for liquidity to be swept, then you enter for the position itself."*

### Code audit

**The sweep definition is exactly his V-shape.** `smc.js:436-438`: *"A sweep = a bar that
trades through a liquidity level and **CLOSES BACK INSIDE**… A bar that closes through the
level is a **breakout, not a sweep**."* `findSweeps` enforces `b.h > p.price && b.c < p.price`
(or the mirror), with a `minWickAtr` floor and a `rejected_by` measure. That is his *"move down
very aggressively and then move back up very aggressively."*

**Buyside/sellside is defined as he defines it.** `smc.js:415` `side: p.price > price ?
'above' : 'below'` — purely position relative to price, above = BSL, below = SSL.

**Equal highs/lows scale with obviousness.** `smc.js:386-387` strength `0.4 + touches*0.2`
from clusters with `touches >= 2` — matching *"the more obvious a level looks… the more likely
liquidity is resting there."*

**The directional rule is enforced.** `setup.js:95-96` filters `sweeps` to `s.dir === dir`, so
a short requires a sweep of the highs and ignores a sweep of the lows — precisely his *"I don't
care."*

**Sweep ≠ reversal is respected.** `sweeps` and `structure.last_break` are separate outputs,
with an `mss` flag at `smc.js:685-687` for the sweep-then-shift case.

**Inducement exists.** `smc.js:689-700`, surfaced at `index.js:204` and narrated at
`momentum.js:314-315`.

### New findings

**M42 (S2) — zone strength has no swept-liquidity term.** `smc.js:210-212`:
`0.4 + min(rangeAtr/3,1)*0.3 + (brokeStructure ? 0.2 : 0) + (tests===0 ? 0.15 : 0) − (breached ? 0.5 : 0)`.
Of his four zone-one confluences, **two** are implemented (`brokeStructure` here; premium/
discount at `setup.js:133`) and **swept-liquidity is absent** — the very upgrade that makes a
POI a *"liquidity zone… much more stronger."* Extends **M31**, which found the depth term
missing; the formula is missing two of his ranking factors, not one.

**M43 (S2) — un-swept adjacent liquidity does not block the entry.** Measured with
`analysis/probe-ep13-unswept-wall.js` (300 synthetic runs, real `SMC.analyse` →
`Setup.buildSetups`):

```
candidates returned                          : 600
candidates the model calls ok:true           : 347
candidates with an unswept pool < 1.3R ahead :  72   (the model's own "wall")
  ...of which still ok:true                  :  62
unswept liquidity pools per chart: mean 8.4, max 15
```

The code *knows* about the wall — `setup.js:198-201` comments *"The FIRST pool is a wall, not a
nuisance: price usually reacts there"* — but its response is to **bank a partial** on it and
run the rest. His response is to **not enter**: *"I'm not going to enter for sell until those
get swept."* 62 of 72 wall cases (86 %) still return `ok:true`.

**M44 (S3) — only the last four swings become liquidity.** `smc.js:403-404`
`highs.slice(-4)` / `lows.slice(-4)`, capped again by `maxPools: 16`. His rule is
unbounded: *"any high or low that price has not yet traded."* An un-swept swing from six
moves back is invisible to the model.

**M45 (S3) — trend lines are not a liquidity source.** 5 terms
(`trendline trend_line "support and resistance" s_and_r support_resistance`), 0 hits. He names
them as one of his locations. **Fairness note:** support/resistance is substantially covered
another way — PDH/PDL (0.9), PWH/PWL (1.0), TDH/TDL (0.6) and equal highs/lows are exactly the
*"obvious"* levels he means — so **trend lines are the only genuinely missing location**, not
S/R.

**M46 (S3) — inducement is anchored to a liquidity pool, not to a point of interest.**
`smc.js:689-700` pairs a **minor pool** (strength < 0.8) with a **major pool** (strength ≥ 0.8)
on the same side when the minor one is closer to price: *"Retail stops sit at the {minor} —
expect a poke there before the run to the {major}."* His anchor is different: *"inducements
tend to happen **near a significant point of interest** near a order block or near a supply and
demand zone."* Pool-before-pool versus bait-at-the-POI. The concept is present and surfaced;
the anchor diverges, and no code path links `inducement` to `order_blocks` or zones.

**Ep 13 complete — 8/8 chunks.**

---

## Ep 14 — Flip Zones (`mdR4xijBaKE`) — COMPLETE, 5/5 ✔

31:16. `hasMore:false` at chunk 4; `Back To Top` follows *"you're just one trade away."*

### What the episode teaches

**Definition.** *"Flip zones are pretty much **the supply and demand zones that cause the
opposing zone to fail**. They signal a shift in order flow."* And the distinction he insists
on: *"a flip zone is **not just a zone that has failed**. It's a **failed zone that reveals a
change in control**."*

**Two types.** *"**supply flip zone** is formed when a **demand zone fails** to do its job and
create a higher high in an uptrend"*; *"**demand flip zone** is formed when a **supply zone
fails** to do its job and create a lower low in a downtrend."*

**The failed reaction.** *"this is what we call a **failed reaction** which is when price
actually wanted to go up but there was insufficient liquidity, insufficient fuel, insufficient
demand."*

**How to draw it.** *"you can draw the flip zone… **from the bottom to the top of the failed
reaction**… You just identify the range that was created after the zone has failed and that is
your flip zone."*

**THE THREE CRITERIA — stated as a closed list.** *"A flip zone is only confirmed when there is
a **failed reaction**, when price **breaks structure** and price actually **close above the or
below the reaction point**. So those are the **three criteria** of a flip zone."* Reinforced
twice more: *"if this flip zone did not break structure it is **not counted as a flip zone**"*
and *"flip zones are **not just failed reactions**. They are about **failed zones that led to a
structural shift**."*

Note the reference level: the **reaction point** is the extreme of the failed reaction (the last
lower high / last higher low), which sits **outside** the zone — *"it needs to have a nice
candlestick closure **above that last high**."*

**The negative test.** *"let's look at this supply zone right here. **Is this a flip zone? Well,
it's not a flip zone.** The reason why it's not a flip zone is because **it did not cause any
demand zone to fail**… was there any demand zone that price reacted from? **No, there
wasn't.**"* And: *"**a zone reacting is not enough to call it a flip zone.**"*

**And structure outranks the reaction.** *"as long as price is still respecting this last higher
low, we are technically still bullish… The market is still bullish which means this right here
is **not a valid flip zone because it did not lead to a break of structure**."*

**The left-look test.** *"when you're asking yourself whether there's a flip zone, you just want
to **look towards the left** to see whether it actually cause any opposing zones to fail."*

**How to trade it.** *"you just wait for price to mitigate the flip zone. And then this where you
can look for shorts"* (supply flip) / *"wait for price to pull back to the flip zone and we look
for our long position"* (demand flip). Mitigation depth: *"price did mitigate this flip zone…
**50% of it** and then continue pushing to the upside."*

**Flip zones can fail, by the same fuel logic as Ep 13.** *"Why did price freaking flip the flip
zone? Well, it's because there was **not enough fuel** within this flip zone. So, as a result, it
need to grab more fuel above this swing high."*

**Multi-timeframe ranking of flip zones.** *"if I see a flip zone on the **15-minute** time
frame… price action is going to **outweigh** any flip zone that was formed on the **five
minute**… this 15-minute flip zone will outweigh this five minute flip zone."*

**They stack:** *"both of these are flip zone… Supply flip zone one, supply flip zone two."*

**His framing of the whole method.** *"I want to make it **as mechanical as humanly possible** so
that there's no room for guess work or doubt whatsoever."*

**Closing.** *"please make sure you combine this with all the other concepts… This is **just
another confluence** that you can add into your trading plan."*

### Code audit

**Flip zones exist, and are named correctly.** `smc.js:287-290`:

> *"Breaker blocks / **flip zones**: a zone that failed in its own direction and now acts the
> other way. A demand OB that closes below becomes resistance (bearish breaker)."*

`findBreakers` (`:291-317`) emits `kind: 'breaker'`, `dir: -z.dir`, `side: z.dir > 0 ? 'supply'
: 'demand'`, with the origin zone preserved and a `retested` flag.

### New findings

**M47 (S2) — flip zones are computed but never used as a point of interest.**
`grep -rn breakers src/` returns **exactly four hits**: the docstring (`:656`), the computation
(`:671`), the output (`:714`), and the API payload (`index.js:202`). **No bot module consumes
them.** Worse, `setup.js:108` builds its zone from `analysis.order_blocks` filtered on
`!z.breached` — *excluding* precisely the population that becomes breakers — and `:109` from
`fvgs`. So a flip zone can never be an entry location, where his entire trade plan is *"wait for
price to mitigate the flip zone. And then this where you can look for shorts."* It is
display-only.

**M48 (S3) — two of his three criteria are untested, and one is unmeasurable.**

| his criterion | code | verdict |
|---|---|---|
| 1. failed reaction | not represented at all | **unmeasurable** from the outputs |
| 2. close beyond the **reaction point** | closes beyond the **zone edge** (`c.c < z.bottom` / `c.c > z.top`) | **wrong reference level** — fires earlier |
| 3. break of structure | `findBreakers(orderBlocks, candles, atr)` is never passed `structure.breaks` | **structurally impossible to test** |

Criterion 3 is the same defect shape as **M32**: the line above at `:669` calls
`findOrderBlocks(candles, atr, displacement, structure.breaks)` — it *does* get the breaks —
while `:671` does not. Measured with `analysis/probe-ep14-flipzones.js` (300 synthetic runs,
real `SMC.analyse`):

```
breakers the code emits                      : 1044
  ...with a break of structure AFTER the flip: 1013  (97.0%)
  criterion 1 (failed reaction)              : UNMEASURABLE from these outputs
  criterion 2 (close beyond reaction point)  : NOT TESTED -- closes beyond the ZONE EDGE
breakers per chart: mean 3.48, max 6
```

**Reported honestly: the practical impact of the missing criterion-3 test is small** — 97 % of
emitted breakers satisfy it incidentally on this data. Criterion 1 is *unmeasurable*, not merely
untested: `findBreakers` sets `dir: -z.dir` and `side` by construction, so any direction check
against them is a tautology, and it records no reaction high/low and no "did its job then failed"
state (0 hits for `failed_reaction` / `failedReaction` / `reaction_point` in `src/`). I removed a
criterion-1 column from the probe that was returning a meaningless 100 % for exactly that reason.

**M49 (S3) — no multi-timeframe flip-zone hierarchy.** His 15m-outweighs-5m rule has no
counterpart; breakers are computed per-series with no cross-TF comparison. **Moot while M47
stands** — nothing consumes them — so it only becomes live once flip zones are wired into the
setup model.

**Ep 14 complete — 5/5 chunks.**

---

## Ep 15 — How To Find Daily Bias (`8ZfPIVt4IBs`) — COMPLETE, 6/6 ✔

38:11. `hasMore:false` at chunk 5; content ends *"and it can do more of what works and less of what"* before `Back To Top`.

### What the episode teaches

**Definition.** *"Daily bias is basically **where you think price is most likely to move in the
next 24 hours and why**."* Note *"most likely"* — *"amateur traders… think that the only way to
make money in this market is to be 100 % certain… **That's false**."*

**The load-bearing line.** *"**Bias isn't a prediction. Bias is a plan plus an invalidation.**"*
And: *"if you don't have invalidation, which is something that can falsify your trade idea,
**you don't have a bias, you have hope**."*

### The five steps

**Step 1 — mark the HTF trend and the swing range.** On the 4h, find the most recent BOS; the
range is *"the lowest point that led to this break of structure"* up to *"the highest point that
led to price starts pulling back."* Then premium/discount with the Fib: *"when price is in the
premium pricing, I don't want to enter for a buy… When price is below the equilibrium, which is
the **50 % level**… I'm looking for longs."* And *"in the middle, **reduce risk**, or just
**don't trade** until price reaches an extreme zone."* *"you're not guessing direction. You are
**trading location**."*

**Step 2 — mark liquidity, but only two pools.** *"the **prior day high and prior day low**…
literally just yesterday's high and low"*, and **equal highs / equal lows** (*"that's not
resistance level… That's a **stop-loss pool**"*). Then the question: *"**Which side has the most
obvious liquidity to run first?**"* With the caveat: *"when you have a liquidity sweep it
doesn't mean that price is going to reverse massively straight away. **Liquidity just means
target.**"*

**Step 3 — build the narrative.** *"figure out the story… determine whether we are in a
**continuation phase or a reversal phase**… at any given moment price is only going to be doing
one of two things."* Two trend types: **pro higher time frame** and **counter higher time
frame**. The rule: *"if you are counter higher time frame, we are in a pullback. So you want to
trade in a pullback direction **until it completes**. If you are in a pro higher time frame
trend… you want to trade with the trend."* Beginner warning: *"I don't recommend you trading
counter higher time frame trend **and** counter lower time frame trend."*

**Step 4 — pick ONE target.** *"Take profit, just pick **one target**… they mark 10 different
targets… **That's not how you do it**… you're going to panic and you're going to manage the
trade different ways at different price points."* Three magnets, in his order: **(1)** prior day
high/low, **(2)** *"what is the **opposing zone**… I'm going to be taking profit at the **next
demand zone**"*, **(3)** *"an **unfilled imbalance**."*

**Step 5 — define invalidation.** *"My bias is wrong if X happens."* *"if my bias is bullish,
then my bias is invalid if price **breaks and hold below** my key level. Not just a wick, but a
**real break and acceptance**… **cannot be a candlestick wick break. It must be a reclaim and
acceptance.**"* Discipline rule: *"**If my bias is invalidated, I reset my bias**… I accept the
fact that I am wrong and I reread the market."*

**Confirmation rule of thumb.** *"if my bias is bullish, I only want to look for longs **after
price have a liquidity sweep and there's a market shift or a break of structure on the lower
time frame**."*

### The five mistakes

1. *"they try to find their daily bias on a **five-minute** time frame… always go from the
   **higher time frame first**. You only use the lower time frame like the five minute for
   **entries, for execution**."*
2. *"you have a **feeling**… **Feelings aren't a framework.**"* *"**If you cannot say your bias
   in one sentence, you don't have one.**"*
3. *"trading **mid-range chop**… the most profitable trades are only taken at the extreme… If
   it's mid-range, if it's consolidating, if it's sideways, it's either you **stay out of the
   market completely**… Or if you do want to trade this, **reduce your risk**, use like a
   **smaller position size**."*
4. *"**changing bias after every single candlestick**… your bias **only change when your
   invalidation is hit**."*
5. *"not trusting your bias… **conviction comes from confidence. Confidence comes from
   competence and competence comes from consistency.**"*

Closing challenge: *"commit to one bias checklist… for the next **30 days**… track the outcome
of every single trade."*

### Code audit

**Invalidation is implemented, and it uses a close — a strong match.**
- `setup.js:262-264` → *"A 15m **close** below {X} invalidates the idea."* / *"A 15m **close**
  above {X} invalidates the idea."*
- `topdown.js:380` → *"a **close back above** {X} voids the short"*
- `now.js:181` → *"If price **closes back through** {X} the read is wrong — take the loss, do
  not average."*

All three require a **close**, exactly his *"not a wick… a reclaim and acceptance."*

**Bias is stated in one sentence.** `alignment()` returns `reason` (`momentum.js:148-156`),
surfaced as `headline` at `index.js:436`.

**The HTF-decides hierarchy is explicit.** `momentum.js:102-118`: htf weight 3 *"decides
direction"*, mtf weight 2 *"**This layer cannot choose the direction**"*, ltf weight 1 *"**It
can never choose the direction**."*

**Sweep is the trigger** (`setup.js:94-99`, weight 18, `bars_ago <= 25`), structure agreement
weight 12 — his confirmation pair.

### New findings

**M50 (S2) — no bias hysteresis: the bias changes without invalidation 64.2 % of the time.**
His rule is *"your bias **only change when your invalidation is hit**"* and *"If my bias is
invalidated, **I reset my bias**."* Both require **state**. `grep -rn bias src/bots/index.js |
grep -i 'prev|last|store|persist|history|cache'` returns **nothing** — bias is re-derived from
scratch on every call, so the invalidation level exists but is never fed back as the gate.
Measured with `analysis/probe-ep15-bias-flips.js` (12 regime-switching synthetic runs, 5 400×5m
candles each, 3 600-candle windows resampled to 1h/15m/5m, real `Momentum.alignment()` at every
step):

```
alignment() calls                        : 3612
sign flips of align.bias candle-to-candle: 413   (11.4% of steps; 1 step = 6 x 5m = 30 min)
  flips WITH an invalidating close       : 148   (35.8%)
  flips WITHOUT one                      : 265   (64.2%)   <- his mistake #4
```

**Two probe bugs found and fixed before this number was trusted.** Version 1 used a constant
drift per run, so the 1h trend never changed sign — 0 flips while measuring nothing. Version 2
fixed the drift but still returned 0: the window resampled to only **25** 1h candles, too few for
`findSwings(candles, 5)`, so `align.bias` was **permanently 0** (`bias distribution {"0":121}`).
Only after widening the base window to 3 600×5m did the probe measure anything.

**M51 (S2) — the code ships a three-target ladder with a 50 % partial; he requires exactly one
target.** `setup.js:210` *"target ladder: **T1** (wall, partial), **T2** (runner), **T3**
(extension if one exists)"*, with `:252` `partial_at: { …, size: '50%' }` and `:256`
`runner_target: { …, size: '50%' }`. Its own rule string reads *"Bank 50 % at T1… **The runner is
free**."* His step 4 is the opposite instruction, with the reason attached: *"you're going to
**panic** and you're going to **manage the trade different ways at different price points**."*
Same machinery as **M43** — that finding proposed suppressing the partial when the first pool is
un-swept; this one says the ladder itself is the divergence.

**M52 (S3) — no mid-range risk reduction.** *"Or if you do want to trade this, **reduce your
risk**, use like a **smaller position size**."* `setup.js:293` reads
`const riskPct = Number(ctx.riskPct || 1);` — a constant from the request context, never scaled
by where price sits in the range. `grep -rni 'mid_range\|midrange' src/` = **0 hits**.
**Fairness note:** the *scoring* dead band does exist — `setup.js:131`
`inGoodHalf = long ? pd.position_pct < 55 : pd.position_pct > 45` at weight 10 — so mid-range
entries lose 10 points. What is missing is the **size** response, not the awareness. Separately,
the `zone` label is degenerate: `smc.js:520` is `inDiscount = pos < 0.5, inPremium = pos > 0.5`,
so `'equilibrium'` at `:526` can only ever fire at exactly `pos === 0.5`. The label is cosmetic;
the 45–55 band is the real mechanism.

**M53 (S3) — no continuation/pullback phase state.** `grep -rni
'pullback_phase\|continuation_phase' src/` = **0 hits**. His step 3 asks for a phase
classification with a completion condition (*"trade in a pullback direction **until it
completes**"*). **Fairness note:** the *direction* logic is faithful — `alignment()` emits
*"Location timeframe reads {mtfTrend}, so entries are taken **on the pullback** rather than at
market"* (`momentum.js:153`) and tracks `ltf_against_htf` explicitly as timing, not override.
What is missing is the phase as a **state** with a defined end, so nothing can tell the trader
the pullback is over.

**M54 (S3) — two of his three target magnets are never target candidates.** `targetPools`
(`setup.js:44-58`) filters **only** `analysis.liquidity.pools` at `strength >= 0.5`; the only
non-pool target added is the dealing-range extreme (`:187-195`).

| his magnet | code | verdict |
|---|---|---|
| 1. prior day high / low | PDH/PDL are liquidity pools (`smc.js:392-400`) | ✔ covered |
| 2. the **opposing zone** | never a target — zones are entry candidates only (`setup.js:108-109`) | ✗ missing |
| 3. an **unfilled imbalance** | never a target — FVGs are entry candidates only (`setup.js:109`) | ✗ missing |

His instruction is explicit on both: *"I'm going to be taking profit at the **next demand
zone**"* and *"the third place where you can place your takeprofit is an **unfilled
imbalance**."*

**M55 (S3) — longs are allowed 5 points past his equilibrium.** His rule is strictly the 50 %
level: *"when price comes down to the discount, **below the equilibrium level, which is the 50 %
level**… I'm looking for longs."* `setup.js:131` accepts `position_pct < 55` for longs (and
`> 45` for shorts), so an entry at 54 % of the range — above equilibrium — still passes the
weight-10 range check. Deliberate tolerance, but it is a numeric divergence from a level he
names exactly.

**Ep 15 complete — 6/6 chunks.**

---

## Ep 16 — Building a Trading Plan (`4MG3uUyoQCc`) — COMPLETE, 5/5 ✔

27:50. `hasMore:false` at chunk 4; transcript content ends at chunk 3 (*"your trading results
compound as"* → `Back To Top`); chunks 3–4 are site chrome.

### What the episode teaches

**Definition.** *"A trading plan is simply **a set of rules that tells you what kind of market to
trade, what conditions needs to be present, where you enter, where you exit, how you manage
risk, and what trades are not worth taking**."*

**Simplicity is a requirement, not a preference.** *"the **more complicated it is, the harder it
is to follow it under pressure**."* *"If you cannot explain a trade plan simply, you cannot
execute it consistently."* *"simplicity is the highest form of intellect."*

**The six questions a plan must answer.** *"if your trading plan cannot answer these simple
questions… **it is not strong enough**."*
1. *"**What market conditions do I want to be trading?**"* — bullish/bearish, *"continuation
   phase or a pullback phase"*
2. *"**What makes a setup valid?**"* — bias, *"must I need to ensure that the **lower time frame
   trade ideal is aligned with the higher time frame** trade bias? Must it be located at a
   specific supply and demand zone or order block?"*
3. *"**What makes it invalid?**"* — *"if price actually comes down and break past this zone, then
   I'm not going to be looking for longs anymore"*
4. *"**How do I manage the trade?**"* — *"Where to place a stop loss, where to place your take
   profit"*
5. *"**when should I stay out completely?**… maybe on **Mondays**… maybe doing **high impact
   news**… maybe during **holiday seasons**"*
6. **Setup grading** — *"what define an **A+ setup**, what define a **B setup**, and a **C
   setup**. And **you only want to make sure that you're deploying your capital on the A+
   setups**."*

**Entry criteria are all-or-nothing.** *"the confirmation, the **non-negotiables** that must be
true before I even think about pressing the buy and sell button. And if every or **any of these
criteria is not met, I would just not trade**… **If even just one of these boxes are not being
checked, I would still not trade.**"*

**Exits.** *"There's only **two** sort of exit criteria… where do you want to exit if the trade
idea **does not** go as planned… and where would I get out if my trade **play out** in the way I
envision."* *"amateurs focus on entries. **Professionals obsess over exits.**"*

**Plan first, trade second.** *"They **decide in advance** what they are willing to do and then
they just **wait for the market to meet those conditions**."*

**Saved plans are read-only.** *"once you save the trading plan, it becomes **read only**… I can
no longer edit the trade plan."* Because *"You're **not negotiating with yourself**… You already
know where you are entering for the trade."*

**Compliance is a derived metric.** *"you can select whether you did or did not follow your trade
plan or not… what is your **compliance** which is did you actually follow your trading plan or
not… this is simply the **percentage of trades where your required checklist steps were
followed**."* Purpose: *"this allows you to make **data-driven decisions** instead of decisions
based on **vibe**."*

**But the plan still evolves.** *"treat your trading plan as a **living breathing organism**
rather than a **scripture**… if you follow the same plan for 50 years without changing anything
then **you are not trading the plan, the plan is trading you**."*

### Code audit — the plan schema is a close match

`db.js:219-234` `strategies` table:

| his question | column |
|---|---|
| market conditions | `market_conditions` — *"trending / ranging / volatile / news"* |
| timeframes | `timeframes` |
| entry criteria | `entry_rules` (JSON array) |
| exit criteria | `exit_rules` (JSON array) |
| the pre-trade checklist | `checklist` (JSON array, *"pre-trade"*) |
| risk | `risk_rules`, `target_r_multiple` |
| the active/pinned plan | `active` |

`db.js:436-445` `DEFAULT_CHECKLIST` — 8 items, a strong match for his non-negotiables:
*"Bias and higher timeframe alignment checked"* · *"Setup matches a written playbook entry"* ·
*"Entry, stop and target defined **BEFORE** entry"* (his *plan first, trade second*) · *"Position
size calculated from stop distance"* · *"Risk ≤ account limit for this trade"* · *"No high-impact
news inside the trade window"* · *"Not revenge trading / not after a red day"* · *"Daily loss
limit not hit"*.

### New findings

**M56 (S2) — the written trade plan has no effect on what the bots signal.**
`grep -rn "entry_rules\|exit_rules\|market_conditions" src/bots/` returns **nothing**. Those
columns are stored (`db.js:219-234`), parsed for display (`api.js:176`) and written
(`api.js:484-506`) — but **no bot ever reads them**. The user's plan is documentation, not a
gate, which is the exact failure he describes: *"most traders they have an edge **in their head
or in a PDF** but it doesn't translate into consistent actions."*

**M57 (S2) — compliance is never computed, though the data is already in the database.**
`rule_checks(trade_id, label, passed)` (`db.js:207-212`) is written at `api.js:299-301` and
`:316-319` and rendered by the UI (`public/js/views/trades.js:389`), but **no `SELECT` on
`rule_checks` exists anywhere in `src/`** — the only other reference is a `DELETE`. The
per-strategy stats block (`api.js:476-477`) returns `trades, net_pnl, win_rate, expectancy_r,
profit_factor, avg_r, total_r` — **no compliance**. **Fairness note:** `adherence`
(`db.js:269`, *"1-5 rule-adherence self score"*) partly serves the purpose and `coach.js:272-292`
analyses it well — but it is **subjective**, where his is **derived from the checklist**. That
difference is the point: *"this **requires you to be brutally honest**"* — a derived metric
removes the choice. **This one is nearly free to fix: the raw data already exists, unread.**

**M58 (S2) — A+/A is not a capital-deployment gate.** *"you only want to make sure that you're
deploying your capital on the **A+ setups**."* The only A+/A test in `src/` is
`correction.js:519` — a **coach summary string**. Nothing stops a C or D grade from being sized
and taken. **Reinforces M7/M8** (weighted score; RR<2 → grade C → still `ok:true`) and
anticipates **Ep 31** (*"A and A+ setups only"*).

**M59 (S3) — two conflicting grade ladders.**

| source | A+ | A | B | C |
|---|---|---|---|---|
| `correction.js:359` | ≥80 | ≥68 | **≥54** | **≥40** |
| `momentum.js:232` | ≥80 | ≥68 | **≥55** | **≥42** |

A score of **54** is a **B** to one and a **C** to the other; **41** is a **C** to one and a
**D** to the other. **Scoped precisely so this is not over-read:** `backfillGrades` only touches
trades where `setup_grade IS NULL OR setup_grade=''` (`correction.js:365`), so **no single trade
ever carries both grades**. The divergence is in **reporting comparability** — live signals and
backfilled journal grades use different ladders, so aggregating them mixes two scales.

**M60 (S3) — saved plans stay editable.** `PUT /strategies/:id` (`api.js:495+`) permits a full
edit. His: *"once you save the trading plan, it becomes **read only**."* **Fairness note:** he
*also* calls the plan *"a living breathing organism rather than a scripture"*, so the
immutability he wants is **per active session**, not permanent. The right fix is to lock the
*active* plan, not the record.

**Ep 16 complete — 5/5 chunks.**

---

## Ep 17 — My Full Smart Money Trading Plan + Daily Routine (`gECKHjUnEjU`) — COMPLETE, 7/7 ✔

44:44. `hasMore:false` at chunk 6; content ends *"remember you're just one trade"* → `Back To Top`.

**This is the load-bearing episode** — it contains his actual written plan and his personal
method, not just theory.

### The pre-market routine (an enforced gate)

*"this banner **persists until all of the steps are actually completed**… this once again
**forces** you to complete the steps."* Customisable, resets at a chosen time — *"we highly
recommend you to set it to **1 hour before your trading window**."* His own: starts trading at
3 p.m., banner at 2 p.m.

1. **Economic calendar** — filter by watchlist pairs, find high-impact news: *"these are the
   times that I **won't trade**."* Then: *"I can choose to block it **15 minute before and
   after** high impact news release."*
2. **Review the trade plan** — charting process, entry criteria, management rules, exit
   criteria. *"to get **crystal clear** on your process **before volatility starts hitting**."*
3. **Analyse the charts with the plan beside you** — mark the HTF range, then *"end off the
   section by **stating my daily bias**"* and **set an alert** at the zone edge.
4. **Meditation / breathwork** — ~15 min, *"to shift from analysis mode to execution mode."*

**Three self-check questions:** *"Am I calm? Am I clear? Am I following my trade plan? **Would I
still take this trade if I was up big today?**"*

*"the hard part about trading isn't spotting A+ setups, it's **ignoring everything else**."*
*"the most profitable position in the market is **waiting**."*

### The plan

**Step 1 — 4h trend + swing range.** Most recent BOS → *"the **highest point that led to** the
most recent break of structure"* and *"the **lowest point that led to the pullback**."*

**Step 2 — premium/discount.** Fib settings **0 / 0.5 / 1**. *"above this 50 % which is what we
call **equilibrium**… below the 50 % this is where price is within discount territory."* Sell at
4h premium, buy at 4h discount.

**Step 3 — institutional zones.** *"supply and demand zones, **order blocks, flip zones, flip
plus zones, liquidity zones**."* (Note: **"flip plus zones"** is a term not defined in Ep 14.)

**Zones A/B/C/D.** Extreme = A, most recent = D. *"**the more extreme the zone is, the higher
the chance of it getting respected**."* C and D are eliminated because they sit near
equilibrium/discount — *"not where we want to sell from."*

**He refuses to rank A against B.** *"**I have absolutely no clue** whether price is going to
respect A or B. I'm not a fortune teller… **you don't need to predict** what's going to happen
next in order to make money from this market. All you need to do is to find the point of
interest in which you get your **entry confirmation** from and when it appears you take the
trade without hesitation."*

**The LTF gate.** *"You **don't jump down to the lower time frame until price mitigated a point
of interest**… a lot of you guys keep on going down to the lower time frame. Look for your
sniper entries even though price is not an optimal location."*

**Entry criteria = exactly two things.** *"There are mainly **two things** that I look out for
before I actually enter for the trade… **Two things, liquidity sweep and market shift.**"*

- **Market shift** — *"The market shift happens when price take out a structural high or
  structural low. And in a **bullish uptrend, you want to see it take out a structural low**."*
  *"You **don't want to enter for a sell when the internal structure is still bullish**."*
- **Liquidity sweep** — *"You want price to take out the **most recent** liquidity"*, ideally
  **both** the pullback-phase and the continuation-phase pools: *"Ideally, I want to see price
  take out **both** of these liquidity."* V-shaped reaction restated.

**Two entry models.** **Aggressive:** *"the minute price take out this higher… you enter
**straight away**."* **Conservative:** *"requires you to **wait for price to pull back to a
point of interest**… the supply zone that was formed at the liquidity sweep or created the
market shift."*

**Exits.** Stop *"a few pips **above the supply zone**"*; TP *"at the **opposing demand
zone**."* Aggressive entries get a nearer target: *"I'm **not going to assume** that this low is
going to get taken out because **price has not taken out that low yet**."* *"we don't trade the
market for what we are… we trade the market for **what it is**."*

**His personal management method.** *"my personal trade management method is that I just choose
**set and forget**… **I don't do partial profits. I don't throw my stop-loss.** I just take
profit all the way through."*

### The post-market routine

Journal in *"less than 5 seconds"*: followed-the-plan flag, result, win rate, avg R, trade
count, **guardrail violations** (*"this day right here, I **traded outside my allowed trading
window**"*), **pre-market routine completion**, HTF/MTF/LTF screenshots, confluences,
management method, mistakes, entry emotion, exit emotion, notes/voice reflection.

Dashboard: *"win rate, average R multiple, profit factor, even your **edge score**."*
Reviews: *"**monthly review, quarterly review, annually review**"* with templates — *"do a huge
**process audit**."* Then meditation *"so that I don't carry my losses to the next trading
day."*

*"trading success comes from **process, not predictions**."* *"most traders do not need more
information. **They need more structure.**"*

### New findings

**M61 (S2) — `vetoes` is dead code, and the "hard vetoes" docstring is false.**
`setup.js:86` declares `const vetoes = [];` and **nothing ever pushes to it or reads it** — the
only two references to the identifier in the whole repo are the docstring at `:18` and the
declaration. The docstring claims *"**hard vetoes** (news blackout, chaos volatility, chase
risk, no trigger yet)"*, but all four are weighted `add()` checks: news **10** (`:162`),
volatility **6** (`:167`), entry-not-chased **8** (`:238`), sweep **18** (`:98`). **None can
block a setup on its own.** Real blocking does exist — `methodBlocked` at `:355` from
`td.blocked` — so the model is not ungated; what is wrong is the **documentation** and the
**unused variable**. Same family as **M20** (`zone_tf`) and **M34** (`STACK.zone`).

**M62 (S2) — the news window is ±45 min; his is ±15 min.** `index.js:54`
`newsCheck(symbol, windowMin = 45)`, applied symmetrically at `:65`
(`Math.abs(...) <= windowMin * 60000`). His setting: *"block it **15 minute before and after**
high impact news release."* The code is **3× wider** — conservative in the safe direction, but a
divergence from the number he states. **Refines M4:** the blackout string at `index.js:72`
correctly says *"inside ±{windowMin} min"*, but `setup.js:163`'s fallback reads *"No
high-impact releases due in the **next 60 minutes**"* — wrong twice: one-sided "next" for a
**symmetric** test, and a hardcoded **60** that ignores `windowMin`.

**M63 (S2) — his "two things" are weighted, not both required.** `setup.js:98` sweep at weight
**18**, `:141` structure at weight **12**. A setup with a sweep but **no** market shift loses
only 12 points and can still pass. His framing is a pair of necessary conditions, not a score.
**Direction detail also diverges:** his market shift is a *specific break* — *"in a bullish
uptrend, you want to see it take out a structural **low**"* — whereas `trendAligned` at `:137`
only tests that the structure **label** matches the trade direction, not that a break in the
required direction has actually occurred.

**M64 (S3) — no pre-market routine.** `grep -rni "pre_market\|premarket\|pre-market\|routine"
src/` returns **one** hit — `coach.js:240`, the word *"routinely"* inside a message string. No
routine entity, no per-step completion state, no reset time. **Fairness note:** this is a
missing **feature** of the app, not a wrong **rule** in the bot — hence S3.

**M65 (S3) — no quarterly review period.** `performance.js:305` `monthlySeries`, `:332`/`:337`
annualised Sharpe/Sortino. **No quarterly bucket.** His: *"monthly review, **quarterly review**,
annually review."* Anticipates **Ep 26** (five R, quarterly included).

**M66 (S3) — no edge score.** `grep -rni "edge_score\|edgeScore" src/` = **0 hits**. His
dashboard lists it alongside win rate, avg R and profit factor. **Fairness note:** those three
all exist (`performance.js` kpis) and `coach.js` produces a qualitative edge narrative, so this
is a missing **named metric**, not missing analysis.

**M67 (S3) — the code ranks zones where he explicitly refuses to.** *"**I have absolutely no
clue** whether price is going to respect A or B… **you don't need to predict**… All you need to
do is to find the point of interest in which you get your **entry confirmation** from."*
`setup.js:108-119` scores candidate zones and selects a `bestOB` / `bestFvg`. **Fairness note:**
selecting a zone is not itself wrong — but it substitutes a **prediction** (which zone will
hold) for his **confirmation-driven** rule (enter at whichever produces the trigger). And the
one factor he *does* rank by — *"the **more extreme** the zone is, the higher the chance of it
getting respected"* — is absent from the strength formula (**M31**).

**Ep 17 complete — 7/7 chunks.**

---

## Ep 18 — Entry Models (SNIPER ENTRIES) (`gi1h5Fvn7nY`) — COMPLETE, 7/7 ✔

45:51. `hasMore:false` at chunk 6; content ends *"remember, you're just one trade"* → `Back To Top`.

Covers **two** of the *"10 different entry models"* he referenced in Ep 17.

### Definition and the context rule

*"An entry model is a **repeatable sequence of price action you wait for** before entering for a
trade."* It must answer *"what needs to happen first, what confirms the setup, where the entry
comes in and **where the invalidation is**."*

*"These entry models only make sense when they appear in the **right context**… the right higher
time frame bias… the right **point of interest**… the right **session** with the right
**liquidity conditions**."* And the line that governs the whole episode: *"**A clean-looking
entry model means nothing if it's forming in the wrong location**… **A good model in a bad
context is still a bad trade.**"*

Purpose: *"both of these entry models are designed to **stop you from entering too early** and
to help you **wait for the market to reveal more information** before you commit."*

### The non-negotiable

*"we need to have some form of market shift. **That's the prerequisite. That's the
non-negotiable for each one of these entry models.**"*

And when asked why a failed reaction alone isn't an entry: *"You got a failed reaction. **Why
not enter for a long position right here? Because you haven't gotten a confirmation that the
structure is indeed shifting bullish. You haven't gotten the market shift.**"*

**A market shift is a close:** *"The minute price come up there and create a candlestick just
like this where it **closed above the last lower high**."*

### The two models

**1. Flip entry model.** MTF POI mitigated → jump to LTF → liquidity swept → **market shift +
flip zone formed** → *"we wait for price to **pull back to the flip zone**… The minute price
mitigate the flip zone"* → enter.

**2. Market shift entry model** — *"my **bread and butter** entry model."* MTF POI mitigated →
liquidity swept → market shift → *"identify the **lower time frame demand zone that created
this market shift**"* → *"we **don't want to enter** for the position yet. We want to **wait for
price to pull back**"* → enter. Tip: *"wait for price to sweep **as much liquidity as humanly
possible**."*

**A mechanical rule of his own.** *"here's a **mechanical rule** that I have in my system… **I
always enter on the extreme zone rather than the flip zone**. Why? Because… if a flip zone is
being formed right here, chances are there's going to be **available liquidity being built up
below this failed reaction**… I want to see that get **swept**."* Restated later: *"if I have
**extreme zone and a flip zone at the same area**, ideally I **only want to enter**… at the
**extreme zone** itself."*

**No pullback, no trade.** *"There was **no pullback whatsoever**. So in this case what do you
do? Well **you don't do anything**… if you want to be very strict, very mechanical with your
trading system, you have to be okay with **letting these trades go**."*

**Execution.** *"you can either execute a **manual buy order** or you can place like a **limit
or stop order** at this price point."*

**Stop.** *"below this lower time frame demand zone if you're **conservative**, or if you're
**aggressive**… below this **candlestick** that you actually enter the trade from."*

**Target.** *"for take profit, to keep it simple and mechanical in this lesson, we're just going
to set it at **2 R**."*

### Advanced material (flagged as such by him)

**Sniper entries:** *"If you place it above the candlestick, you are getting like **two pip stop
loss**. Place it above the zone, this is like **four pip stop loss**."* **Scale-in:** *"advanced
students will try to **scale in for another position**… Now they have **two positions** running
to TP"* — 1:8R then 1:10R, *"a total of **18R**."* **Fractal market shift** on the 1-minute —
*"I don't believe I'm teaching this concept inside this series."* His own caveat: *"I **don't
recommend** you guys to actually learn this if you're still in your first year of trading."*

**Inducement, refined:** *"There's another very subtle demand right here… But because this is
such a **small little demand, I wouldn't even consider it**. What I will instead do is that I'll
mark up this as like a **inducement**… There's **available liquidity sitting below this low**."*

*"Your goal is **not to predict first**. Your goal is to **react correctly once the model is
clear**."*

### New findings

**M68 (S2) — the two entry models are not distinguishable in the output.**
`grep -rni "entry_model\|entryModel\|market_shift_entry\|flip_entry" src/` = **0 hits**. His
models have distinct prerequisites **and distinct entry locations** — one enters at the *flip
zone*, the other at the *LTF zone that created the shift*. The code emits one undifferentiated
signal from a weighted checklist. **Consequence:** the journal's *confluences* field cannot
record which model fired, so his per-model performance review cannot be extended to models.
**Fairness note:** the ingredients all exist (sweep, close-based break, zone); what is missing is
the named composition and its distinct entry level.

**M69 (S2) — market shift is a weighted check; he calls it the non-negotiable for both models.**
`setup.js:141` scores it at weight **12**. **This settles an open question from Ep 14:** M48
logged that the flip-zone break-of-structure criterion is untested but measured **97 %**
incidentally satisfied, and left the impact ambiguous. Ep 18 shows the market shift is *the*
gate for the **flip entry model as well**, so M48 and M63 (and this item) share **one root cause
and one fix** — not three.

**M70 (S2) — the extreme-zone-over-flip-zone rule is absent.** The only `extreme` hit in
`src/bots/` is `smc.js:54`, about **swing alternation** — unrelated to zone preference.
**Moot while M47 stands**, but it must be implemented **together with** M47 or the flip-zone
wiring will encode the wrong preference.

**M71 (S3) — his target is a flat 2R; the code's 2R test applies to the runner, not the trade.**
`setup.js:77` `const minRR = Number(ctx.minRR || 2);` — **the default matches his 2R exactly**,
a genuine match. But `:204` tests `runner.rr >= minRR` and `:281` caps on `rr_final`, so a trade
whose **primary** target is under 2R still passes provided the runner clears it. **Interacts
with M51:** collapsing the ladder to one target makes the 2R test land on the right number
automatically.

**M72 (S3) — no scale-in, and the tight-stop warning runs opposite to his sniper method.**
Confirms **M36**: `grep -rni "scale_in\|scaleIn" src/bots/` = **0 hits**, against his *"two
positions running to TP"* at 18R combined. Separately `setup.js:261` warns *"Stop is tighter
than 0.35 ATR — **normal noise can take you out**"* where his sniper entries deliberately use
*"two pip"* / *"four pip"* stops. **Fairness note:** he restricts sniper entries himself (*"I
**don't recommend** you guys to actually learn this if you're still in your first year"*) and
the code's warning matches his **beginner** guidance. The divergence is that the app offers no
way to express the advanced variant at all — not that the default is wrong.

**M73 (S3) — inducement is a small untradeable zone with liquidity beyond it, not a pool pair.**
Refines **M46**, and this is now the **second episode** pointing at the same anchor mismatch,
which raises its priority. His inducement **is a zone** — one *"such a small little demand, I
wouldn't even consider it"* — whose significance is *"available liquidity sitting **below this
low**."* The code pairs a minor pool with a major pool (`smc.js:689-700`) and never involves
zones.

**Ep 18 complete — 7/7 chunks.**

---

## Ep 19 — When Not to Trade (`kVEx1QzLfQ0`) — COMPLETE, 4/4 ✔

23:45. `hasMore:false` at chunk 3; content ends *"remember, you're just one trade away"* → `Back To Top`.

**Correction to my own earlier note:** a partial read had recorded this episode as *"four
no-trade criteria."* The complete transcript contains **eight**. The ledger row also said 2/5
chunks; the transcript paginates as **4**.

### Framing

*"**knowing when not to trade is as important as knowing when to trade**."* *"**99 % of the
volatility you see every single day is just a trap** waiting for the unsuspecting trader."*
*"the best traders are not the ones who trade the most. They are simply the ones who know
exactly **when it is worth doing nothing**."*

He frames it as two families — *"**Volatile** market conditions, or the markets are
**illiquid**"* — then enumerates eight.

### The eight no-trade conditions

| # | condition | his words |
|---|---|---|
| 1 | **price in the middle of nowhere** | *"when price is not at a point of interest… you shouldn't be taking a trade… it messes up your **risk to reward**… like a **one is to one** risk to reward, or even worse"* · *"If price mitigate a point of interest, and you **don't see your entry model**, same thing. **You do not take that trade whatsoever.**"* |
| 2 | **slow and choppy, no clear bias** | *"price is just oscillating… going sideways. **There is no clear bias whatsoever**… honestly a **waste of time** to trade this"* |
| 3 | **Mondays and Fridays** | Mon: *"lower trading volume"* after the 48 h break, *"a lot of **traps**"*, gap risk, *"the market is still trying to figure out where to go."* Fri: *"**lower liquidity**… institutions are closing their books"*, plus *"**rollover fees**"* over the weekend |
| 4 | **December** | *"the whole month of December, you'll most likely see slow and choppy price action"* — evidenced: *"EUR/USD… chop around for just **250 pips**"* in Dec 2022 vs *"almost **800 pips**"* in Nov and *"**500 plus**"* in Oct → *"**four times more volatile** in November than in December"* · *"from **December 1st** onwards, just go and take a break"* |
| 5 | **immediately before/after high-impact news** | *"I have this rule called the **30-minute rule** or rather the **15-minute rule**… wait **15 minutes or even 30 minutes after** the news come out, then you actually begin trading again"* · *"there is **no edge in trading the news**"* |
| 6 | **not in the right mental state** | *"trading is **80 % mindset and 20 % strategy**… you need to ensure that you are **100 % focused without any distractions**"* |
| 7 | **losing streaks** | *"you have lost the past **10 trades in a row**… it's time to steer clear the markets… don't look at the charts for like at least **1 week**"* |
| 8 | **last trading day of the month** | *"it could be the **31st or 30th**… usually this is the day where **institutions close their books**… low trading volume… the markets are illiquid"* |

### The A+ exception — stated as a rule of his plan

*"If I see like a **top-notch A+ extreme high probability setup** on a Monday, then yes, of
course I'm going to take it because **my trading plan states that if a setup meets my criteria,
I will take the trade regardless of the day**. But… if it's just like a **mediocre setup**…
Monday I just try not to trade."*

And an existing-position exception: *"if I'm swing trading, I'm already holding the trade from
last week, then yeah, I'm just going to **continue holding**… I'm not going to close the trade
just because it's Monday."*

**This settles how M10 must be fixed: a grade filter on B/C, not a blackout.**

### Code audit — 3 of 8 absent, 1 wrong window, 1 not gated

| # | condition | code | verdict |
|---|---|---|---|
| 1 | middle of nowhere | `setup.js:238` weight 8; `:204` runway check | **partial** — `waiting` still `ok:true` (**M35**) |
| 2 | slow/choppy, no bias | `momentum.js:106,142` → `bias = 0` when the HTF is ranging | **present** (**M25** correction holds) |
| 3 | Mon/Fri | only `getUTCDay()` use is `smc.js:325-327`, the **weekly key** for PWH/PWL | **absent** (**M10**) |
| 4 | December | only `getMonth()` uses are goal periods at `api.js:613-614` | **absent** (**M10**) |
| 5 | news | `newsCheck(windowMin = 45)`, symmetric | **present, wrong window** (**M62**) |
| 6 | mental state | `emotion_before` appears only in the update whitelist (`api.js:785`) | **recorded, never gated** |
| 7 | losing streaks | `coach.js:136` (2 consecutive), `:549` (3-loss streak → `riskMultiplier *= 0.6`) | **present, tighter, different response** |
| 8 | last trading day of month | 0 hits | **absent** (**M74**, new) |

**Criterion 7 in detail, because the code is arguably *stricter* than he is:** `coach.js:151`
recommends *"Hard rule: **stop for the session after 2 consecutive losses**, or cut size to 25 %
for the rest of the day"*, and `:549` cuts risk to **60 %** at a 3-loss streak (and to 90 % at a
4-win streak, `:550`). His threshold is **5–10 losses → stop for ~1 week**. So the code reacts
**sooner** but with a **size cut** where he wants a **full stand-down**. The divergence is in
the response, not the detection — recorded as verified faithful with that caveat rather than as
a defect.

### New findings

**M74 (S3) — the last trading day of the month is not modelled.** `grep -rni
"month_end\|monthEnd\|last_day\|lastDay\|getDate()" src/` returns **nothing**. This criterion is
**not** covered by **M10**, which addresses Monday/Friday and December; it needs its own
calendar rule. His reason is the same illiquidity logic as Friday (*"institutions close their
books"*), so the fix belongs in the same filter.

**Ep 19 generated one new item, not several — recorded honestly.** Criteria 1, 2, 5 and 7 are
already in the ledger (**M35**, **M25**, **M62**, and `coach.js` respectively); 3 and 4 are
**M10**; 6 is folded into **M64** (the pre-market routine is where his mental-state check
lives). Manufacturing additional items here would have double-counted.

**Ep 19 complete — 4/4 chunks.**

---

## Ep 20 — Where to Place Your Stop Loss & Take Profit (`JRiiQWeooMc`) — COMPLETE, 4/4 ✔

21:23. `hasMore:false` at chunk 3; content ends *"remember you're just one trade"* → `Back To
Top` at the end of chunk 2; chunk 3 is pure site chrome.

*"amateur traders obsess over entries and **professional traders obsess over exits**."*

Worked through a real counter-trend scalp (short, against a bullish HTF), which is *pro* the
1-minute internal order flow: *"if I'm scalping right here, this is actually **pro-internal
order flow** for me."* Beginner warning restated: *"I would not advise you to trade **against
the internal orderflow and also against the higher time frame order flow**."*

### The take-profit rule

*"place your takeprofit at the **next opposing supply and demand zone** or the **next structural
low or high** that is either on the **same time frame that you make your entry on** or just **one
time frame above** your entry time frame."*

And the explicit prohibition: *"I **won't try to target the next 1 hour** supply or demand zone.
There's a **time frame misalignment**… you cannot try to target where you would target as a
swing trader if you're entering as a scalper."* Caveat for the rare case: sniper entries *"to
**1:50R** trade whatever which is **incredibly incredibly rare**."*

Exit philosophy: *"you basically just want to exit at the price point in which **based on your
research** price is **most likely going to get to**… Not where you **think** it will head
towards next."*

### The stop-loss rule

*"what is the price point that if price gets to, **prove that your trade idea is wrong**?"*
*"It needs to be at some form of **protected high**… a high that **swept liquidity** because
that's the **institutional level** where price is most likely going to respect."*

**The stated rule, verbatim:** *"if there is a **protected high**, place it right there. If
there is **no protected high**, place it at either the nearest protected high that was formed in
the past **or a few pips above a supply zone** if you're selling or a few pips below a demand
zone if you're buying. **Whichever one that is nearer**… **whichever one that offers you a
better risk-to-reward ratio**."*

Why he prefers the zone: *"if I place it a few pips above this supply zone, this will give me a
**much better risk-to-reward ratio** compared to placing it above this protected high. **So that
is where I will go.**"*

And the buffer: *"I **wouldn't place it right above** it because there's a chance for price to
make a pullback and when it does, **you're going to get wicked out**."*

### Other rules stated here

- *"**Never ever chase price.** Whatever you chase runs away."*
- *"**no liquidity no entry, no liquidity sweep no entry**"*
- **Aggressive vs conservative, with a criterion** (Ep 18 had left it to personality): *"I'm
  looking for the **aggressive entry**… Why? Because **internal structure is on my side**… If
  the internal structure is **not** on my side, then I'm looking for the **conservative
  entry**."*
- **Grading in practice:** *"I wouldn't call this a **A+ setup**, but I'll call this as a **A
  setup**."*
- *"your stop loss should **never be random**… Same thing as a takeprofit. It should **never be
  based on hope**."*

### New findings

**M75 (S2) — the code places the stop at the FURTHER of the two candidates; his rule is the
nearer.** `setup.js:174`:

```js
const stopBase = long ? Math.min(zone.bottom, recentSweep ? recentSweep.extreme : zone.bottom)
                      : Math.max(zone.top,    recentSweep ? recentSweep.extreme : zone.top);
```

`Math.min` for longs and `Math.max` for shorts selects the **further** level — the wider stop and
the worse R:R — where he says *"**whichever one that is nearer**."* Measured with
`analysis/probe-ep20-stop-distance.js` (40 synthetic runs through the real `SMC.analyse` →
`Setup.buildSetups`):

```
candidates built                     : 80
  with a zone                        : 77
  with a zone AND a recent sweep     : 54
  where the two stop bases DIFFER    : 14   (25.9%)
  excluded (stop base on the wrong side of entry): 40

extra risk the code carries vs the nearer option:
  mean 1.543 ATR   median 0.657 ATR   max 6.357 ATR
R:R given up by using the further stop:
  mean +10.49R     median +3.83R
```

**Read the medians, not the means** — the mean is skewed by a single 6.357 ATR outlier. The
sample of genuinely-differing valid cases is **14**, which is small and stated as such.

**Two probe bugs found and fixed before trusting any of this.** Version 1 assumed `side` was
`'demand'/'supply'`; the real values are `'buy'/'sell'`, so every candidate was scored as a short
and the result inverted (mean −6.03 ATR, mean −∞ R). Version 2 also filtered sweeps on the
opposite `dir` from `setup.js:95`, and let sweep extremes on the wrong side of entry through,
giving a mixed-sign mean of −2.94 ATR with a +6.36 ATR max. Only after matching the code's own
conventions and guarding the side did the numbers become coherent.

**Fairness note, so this is not over-read:** the code's choice is the **conservative** one — a
wider stop is less likely to be wicked out, which he warns about too. But he resolves that
tension with a **buffer** (*"a few pips above"*), and the code **already applies one**
(`atr * 0.18` at `:175`). So the wider base stacks a second, unintended conservatism on top of
the first.

**M76 (S3) — "protected high/low" is not a modelled concept.** `grep -rni "protected
high\|protected low\|protectedHigh\|protected_high" src/` = **0 hits**. His definition is
specific — *"a high that **swept liquidity**"* — and `recentSweep.extreme` is the nearest
analogue and *is* used, so the **level** is reachable. What is missing is the **label and the
preference order**, which is exactly why the stop rule cannot express *"protected high first,
otherwise the zone."*

**M77 (S2) — the take-profit timeframe-alignment rule is absent.** `targetPools`
(`setup.js:44-58`) draws from the single `analysis` object it is handed, so targets are
*implicitly* from the entry timeframe. **Fairness note:** because `buildSetups` receives one
timeframe's analysis, the misalignment he warns about **largely cannot occur today** — the gap
is that the rule is **unenforced**, so it would break the moment multi-TF targets are added, and
(per **M54**) the candidates are liquidity **pools** rather than the **zones** he names.

**M78 (S3) — the aggressive/conservative selection criterion is not implemented.** Ep 18 left
the choice to *"your personality"*; Ep 20 gives a rule — **internal structure on your side →
aggressive; not → conservative**. The code's `aggressive`/`safer` pair (`topdown.js:329`, `:364`)
belongs to the **CRT** plan and is selected at `now.js:169` on `fullRisk`, not on structure
agreement. The axis exists; the signal driving it is different.

**Ep 20 complete — 4/4 chunks.**

---

## Ep 21 — Risk Management (`1s8ea5SH7ZA`) — COMPLETE, 5/5 ✔

30:46. `hasMore:false` at chunk 4; content ends *"remember you're just one trade Away"* →
`Back To Top`.

**Five principles ("golden rules"):** (1) protect capital first; (2) *"**define your risk before
every single trade**… If you do not define the risk before the trade, **emotion will define it
during the trade**"*; (3) *"**keep your risk consistent**. Do not change your risk based on
feelings… The last thing you should be doing is **sizing up because you just got a winning
streak** or sizing up just because you lost a trade"*; (4) *"Set **hard rules** for max daily
loss, max daily profit, and total trades per day"*; (5) *"think in **probabilities, not
certainty**."*

### The framework, with his numbers

| rule | his number |
|---|---|
| fixed % per trade | *"the rule of thumb is to risk like **1 %**… **the maximum is 1 %**. Anywhere below 1 % that's great. **The lower the better**."* Options 1 % / 0.5 % / 0.25 %. *"The **larger the account**… the **lower your risk per trade** should be."* |
| max daily loss | *"usually **2 % to 3 % max, then stop for the day**"* |
| max drawdown | *"**5 % to 10 % max** before **reducing size or pausing**"* |
| max trades per day | *"once you take **three trades** for today you're done… **even if you win those three trades**… **three is three**"* |
| only quality setups | *"Protect capital by being **selective**, not just by **sizing smaller**… that is the **A+ setups**"* |
| max daily profit | *"I usually like to set it at around like **5 % to 10 %**. Once I hit 5 % or 10 % on any given day, **I'm done for the day**."* |

### The guardrails are a HARD BLOCK in his app

*"once I actually lose more than 30K or near 30K, this is where **edge flow will automatically
block me from trading. I will not be able to continue trading** because my max loss has been
triggered."*

*"once you hit the max trades per day, this **trade button get grayed out. You are not allowed
to trade.** You **can override it, but it will require you to input a reason**."*

*"instead of relying on discipline in the moment, you literally **build discipline into your
environment**."*

### Code audit — the numbers match; the enforcement does not

**His defaults are present almost exactly.** `correction.js:386`:
`{ max_risk_pct: 1, max_trades_day: 3, cooldown_min: 30, max_consecutive_losses: 2,
daily_loss_limit_pct: 3 }` — 1 % risk, 3 trades/day, 3 % daily loss: **all his numbers**.
`api.js:548` seeds `max_drawdown_pct` at 10, the top of his 5–10 % range.

**But the derived risk ceiling is 2 %, not 1 %.** `correction.js:400-402`:

```js
const maxRiskPct = accountBalance > 0
  ? Math.max(0.25, Math.min(2, r2(ownCapPct > 0 ? Math.min(...) : ...)))
  : Number(account.risk_per_trade_pct) || 1;
```

`Math.min(2, …)` caps at **2 %** — **double his stated maximum**. The floor `Math.max(0.25, …)`
does match his 0.25 % minimum.

**And the derived guardrail never reaches position sizing.** `grep -n maxRiskPct
src/bots/setup.js` returns **one** hit — the ctx docstring at `:66`. It is documented as an
input and **never read**. Meanwhile `api.js:566` stores `risk_per_trade_pct` with **no clamp at
all**, so an account can be configured at any percentage.

**And nothing blocks a trade.** `correction.js:474` returns
`status: breaches.length ? 'stop' : … 'caution' : 'clear'` — a **string**. Its consumers are
`index.js:233` (pushed into a narrative sentence), `:246` (reported as a field),
`bots.js:222-226` (served over the API) and `public/js/views/bots.js:1011` (rendered). **No
consumer gates anything.**

### New findings

**M79 (S2) — the guardrails advise but never block.** His app *"**automatically block[s] me
from trading**"* and greys out the trade button. The code computes the same rules and returns
`status: 'stop'`, which nothing acts on. **Same shape as M26** (killzone never a veto) and
**M61** (`vetoes` declared, never populated) — this is now the **third** instance of a
computed-but-unenforced rule, which suggests a systemic pattern rather than three isolated
omissions.

**M80 (S3) — no override-with-reason audit trail.** *"You **can** override it, but it will
**require you to input a reason**."* `grep -rni reason src/db.js` returns only `exit_reason`;
there is no override column. **Fairness note:** this only becomes meaningful once M79's block
exists, so the two should ship together rather than separately.

**M81 (S3) — no max daily profit stop.** `db.js:123` `profit_target_pct REAL DEFAULT 8.0` is an
**account-lifetime** target (used at `api.js:534` to compute `target_progress` against
`starting_balance`), not a **daily** ceiling. His *"Once I hit 5 % or 10 % on any given day,
**I'm done for the day**"* has no counterpart, and neither does the reasoning behind it — *"the
hard part is **winning**… you start feeling overconfident… you end up **giving back the
profits**."*

**M82 (S3) — risk varies with streaks where he requires it to be constant.** *"**keep your risk
consistent**… The last thing you should be doing is **sizing up because you just got a winning
streak**."* `coach.js:549-550` multiplies `riskMultiplier` by **0.6** at a 3-loss streak and by
**0.9** at a 4-win streak. **Fairness note, stated so this is not over-read:** the code only
ever **cuts** size and never sizes up, so it does not do the specific thing he warns against,
and its variation is **rule-based** rather than emotional. The tension is with *"consistent
risk"* read literally — and his own rationale (*"the only way for your profits to be consistent
is if you have your risk consistent"*) argues against any variation.

**Ep 21 complete — 5/5 chunks.**

---

## Ep 22 — Trading Psychology (`JxiRzhjq2t8`) — COMPLETE, 6/6 content chunks ✔

50:09 — the longest lecture in the course to date. Seven `chunkIndex` values; content ends at
chunk 5 with `Back To Top`, chunk 6 is site chrome. No market-mechanics content in this one —
it is entirely execution psychology. **But it contains the course's single clearest statement
of what a trading system is FOR**, and that statement lands directly on M79.

### The thesis (this is the load-bearing quote of the whole episode)

> *"a trading system just doesn't just tell you when to enter and when to exit. It should tell
> you what to do when you're afraid, when you are greedy, when you're out for blood. **It
> should completely remove you from the equation at the exact moments when you're the most
> dangerous to yourself.**"*

and

> *"Professional traders have rules and systems that **neutralize the emotion before it
> hijacks the decision**… which means that if you don't have a system, you are going to give
> into your emotions. **100% guaranteed.**"*

and

> *"A **mechanical system** that makes the right decision **automatic** before the wrong one
> even have a chance to surface."*

### Frame: paradigm, not strategy

- *"95% of traders do not fail because of a bad strategy. They fail because of a **flawed
  paradigm**."*
- *"**We don't see the market for what it is. We see it for who we are.**"*
- ~95% of daily actions run on subconscious programming; *"your brain will always default to
  what feels familiar."*
- Chain: **paradigm → thoughts → decisions → actions → results.** So *"your paradigm is the
  root cause of your results."*
- *"Most traders try to fix their trading by changing their strategy… but nothing really
  changes. The real shift only happens when your **nervous system** changes first."*
- Jung (ASR renders it "Kao Jang"): *"until you make the unconscious conscious, you will direct
  your life and you will call it fate."*
- Every emotion is *"your brain trying to avoid a specific type of pain"* — the four named:
  **fear of losing money, fear of being wrong, fear of missing out, fear of looking stupid.**
- The universal cycle, applied to each emotion in turn: **emotion → pain avoided → behaviour →
  outcome.** *"The cycle never changes. What changes is which emotion triggers it."*
- *"Every single one of those emotions has a **rule-based fix**. That, my friend, is how you
  build a real trading system."*

### The six emotions, with the exact fix for each

| Emotion | Pain avoided | Behaviour | Outcome | **His fix (an actionable rule)** |
|---|---|---|---|---|
| **Fear** | being wrong | skip the trade | miss setups → inconsistent → doubt the system → less data → more fear | **Write the entry criterion before the open as an IF-THEN.** *"if price tests the supply zone and there's a liquidity sweep, I entered. If not, no trade."* → *"Binary yes and no decision."* Then ask *"**did my rules actually trigger?**"* not *"do I feel like this is a good trade."* |
| **Greed** | missing opportunity | oversizing, overtrading, ignoring the plan | *"whatever money you made so far gets donated back to the market"* | **Set your ceiling before the market opens** — *"it could be time based, it could be trade based, it could be profit based… I'm only going to be trading for two hours. I'm only going to take three trades maximum. And once I made 2% or 3%… **I'm done.**"* Decide it *"**before the market opens**. Not when the volatility starts kicking in… not when you are in the middle of a winning streak."* |
| **FOMO** | missing opportunity | *"you enter way too late"* | *"your stop loss is usually way too wide"* → trapped at the worst price | **Abundance mentality.** *"**if you weren't prepared for a trade, it was never your trade to begin with.**"* *"There will always be another setup. **Opportunities don't run out. They just rotate.**"* |
| **Hope** | admitting you are wrong | move the stop wider and pray | *"small loss becomes a big loss… one account becomes five accounts"* | **The stop is set at the invalidation point BEFORE entry and never moved.** *"place your stop loss at a price point which **invalidate your trade idea** before you enter… Not during, not after, but **before**. And **you never move it further away**. Once price hit your stop loss, you're out. **No negotiating, no waiting for one more candle, no hoping.**"* |
| **Revenge** | admitting defeat | retaliation trades, oversizing, re-entering immediately | *"one bad trade becomes five. One red day becomes a blown week."* | **The 10-minute rule + the no-trade rule.** *"After any loss… **step away from the screen for 10 minutes minimum**"* and *"**I will never enter the very next candle after a loss.**"* Use the 10 minutes to *"**write down what happened, what rule did you break and what you would do differently.**"* *"This 10 minutes isn't negotiable. It's a **law**."* |
| **Doubt** | being wrong | freeze, or exit a good trade early | *"you miss an entry… you start getting inconsistent… doubt just breeds more doubt"* | **Evidence, not motivation.** *"Conviction comes from confidence. Confidence comes from competence. Competence comes from consistency."* Built through *"reps, back testing, following your trade plan, journaling, executing, reviewing."* |

### Quotes that bear directly on existing ledger items

- **On M48 / M63 / M69 (market shift weighted, not required):** *"if price tests the supply
  zone and there's a liquidity sweep, I entered. **If not, no trade.** That's it… **Binary yes
  and no decision.**"* and *"you stop asking 'do I feel like this is a good trade' and you start
  asking '**did my rules actually trigger?**'"* — a scored 0-100 confluence total is the
  opposite of a binary IF-THEN.
- **On M79 (guardrails never block):** the three thesis quotes above. Also *"that rule exists
  for one reason, to **take the decision out of your hands** at the exact moment when you are
  the most dangerous to yourself."*
- **On M75 (stop on the wrong side / wider than his rule):** *"when you enter way too late…
  **your stop loss is usually way too wide**."* He names a wide stop as the mechanical symptom
  of an undisciplined entry — the code's `Math.min/max` base makes the stop systematically
  wider than *"whichever one that is nearer."*
- **On M81 (no daily profit stop):** note he gives **two different numbers** for the same rule
  — Ep 21 says *"5 % to 10 %"*, Ep 22 says *"once I made **2% or 3%**… I'm done."* His own
  course is inconsistent, so the fix must be user-configurable rather than a hardcoded number.
- **On M10 (Monday/Friday/December):** *"There will always be another setup. **Opportunities
  don't run out. They just rotate.** Missing one trade doesn't mean losing. It just means the
  next one hasn't shown up yet."* This reinforces the Ep 19 A+ exception reading — skip on a
  weak setup, never hard-blackout.
- **On M82 (streak-varying risk):** `coach.js:549` cuts to 0.9x on a 4-win streak with the
  reason string *"resist size creep, **keep the same unit**"* — which is *anti*-greed, i.e. it
  implements Ep 22's fix rather than the behaviour he warns about.

### What this episode proves the code gets RIGHT (this is a strong episode for the codebase)

Ep 22 is unusually well served by the existing journal layer — arguably the best-covered
episode in the course so far:

1. **The revenge-trading detector is real, and it measures exactly his cycle.**
   `correction.js:165-178`:
   ```js
   if ((prev.net_pnl || 0) >= 0 || !prev.closed_at || !t.opened_at) continue;
   const gapMin = (new Date(t.opened_at) - new Date(prev.closed_at)) / 60000;
   if (gapMin >= 0 && gapMin <= 30) revenge.push({ t, prev, gapMin: r2(gapMin),
     bigger: (t.risk_amount || 0) > (prev.risk_amount || 0) * 1.2 });
   ```
   It keys on a **losing** previous trade, measures the real gap in minutes to the next entry,
   flags anything within 30 minutes, **and** separately records whether the re-entry was **bigger**
   than the losing trade — his *"each one with a bigger size and less thought through than the
   last one."* Severity escalates to `high` above 15% of trades or with 3+ bigger re-entries, and
   the impact is reported in dollars (*"$ lost in these re-entries"*).
2. **Stop-widening is a first-class, quantified mistake.** `db.js:258 stop_moved`;
   `correction.js:99-109` computes the count, the average R of widened trades and the **R drag
   beyond the 1R the plan allowed**; `:114` deliberately separates *"moved the stop"* from *"the
   stop was too tight"* (`r < -1.15 && !stop_moved`); `:334` docks **18 points** in autograde;
   `:494` writes a per-trade note naming the exact R damage. Maps onto *"you never move it
   further away."*
3. **Emotion is instrumented end to end.** `db.js:266-267 emotion_before / emotion_after`;
   written at `trades.js:45-46`, editable at `api.js:340`; aggregated at `performance.js:545
   by_emotion`; and `coach.js:301-309` compares negative-state trades against calm/focused
   trades and reports **the dollar difference** — *"Same trader, different state, ${money}
   difference."* That is Ep 22's whole argument, measured.
4. **The emotion vocabulary matches his.** `correction.js:240` filters
   `/impulse|fomo|revenge|tilt|angry|greed|bored/i` over `tags`+`mistakes` — four of his six
   named emotions by name (fomo, revenge, angry/tilt, greed), plus impulse and boredom.
   `:249` even carries a behavioural tripwire: *"**Two of those in a session = close the
   platform.**"*
5. **Overtrading is proven empirically, not asserted.** `correction.js:180-200` buckets trades
   by day, takes the 80th-percentile busiest days, and compares their average P&L against the
   lighter days — *"**Your busiest days are your worst days**."* That is his greed cycle
   demonstrated from the user's own data.
6. **Mistakes are structured, scored and surfaced.** `db.js:270 mistakes` (CSV), split at
   `performance.js:86`, segmented at `:546 by_mistake`, and they drive the grade penalties at
   `correction.js:551` and the `top_fix` at `:566`. This is the machinery his *"write down what
   rule did you break"* step needs.

### New items logged from this episode

- **M83 (S2)** — the coach's daily trade cap is **derived from the trader's own history**
  (`coach.js:586 max_trades_today: Math.max(2, Math.round(k.avg_trades_per_day || 3))`), so a
  chronic overtrader is handed a cap equal to their overtrading. Floor 2, **no ceiling**.
- **M84 (S3)** — of his **three** ceilings (time / trade / profit) only the trade one exists,
  and the profit one is lifetime not daily (M81). The **time-based** ceiling is absent entirely.
- **M85 (S3)** — the post-loss journal step is never required. The columns exist but every one
  is optional (`raw.emotion_before || ''`, no `NOT NULL`, no validation), and nothing prompts
  for one after a loss.

### A false positive deliberately NOT logged

The cooldown number is **not** a mismatch. `correction.js:386` and `:435` set
`cooldown_min: 30` where he says 10 — but his wording is *"step away from the screen for
**10 minutes minimum**"*, and 30 satisfies a minimum. As a **detection** window, 30 minutes is
strictly more inclusive than 10, so it flags more revenge re-entries, not fewer. Logging
"30 vs 10" would have been the same class of error as M65 and M25. The genuine gap is that the
cooldown has **no preventive gate** at all — `cooldown_min` is read exactly once, at
`correction.js:477`, to build a sentence. That is M79's shape, and it is recorded there.

---

## Ep 23 — Journalling Your Trades (`Gx6KAhhWn10`) — COMPLETE, 3/3 ✔

Short episode (~15 min, 3 chunks, `Back To Top` at chunk 2) but it is a **screen-by-screen
specification of the journal**, and it states the course's grading philosophy more bluntly than
any other episode.

### The philosophy (load-bearing quotes)

> *"**The definition of gambling is trading without journaling.** It's repeating the same
> mistakes with more confidence."*

> *"You don't journal for today. You journal for your future version of yourself… **capture
> truth while it's fresh, not after you rationalize it.**"*

> *"journaling is just how you **separate luck from skill**. Because a green trade, a winning
> trade can be **bad execution**… and similarly, a red trade, a losing trade could be a **good
> trade** because you executed your trade plan flawlessly… **if you do not journal your trades,
> you will never ever know the difference.**"*

> *"**a good trade is not necessarily a profitable one.** A good trade is one in which you
> **executed according to your trading plan**. Especially when you didn't feel like it. So just
> because you make money doesn't mean it's good. Just because you lost money doesn't mean it's
> bad. **Execution is what we are grading here. We don't define our performance, our self-worth
> by our P&L.**"*

Discipline framing: *"you can do all of that by increasing reps until you adapt **or you can
just reduce friction**. And that's what edge flow does — it lowers the resistance to the boring
repetitive tasks that actually make you profitable."*

### The workflow he demonstrates

- **Timing is non-negotiable:** *"my non-negotiable is **I journal right after I exit a
  trade**."* Fallback: end of session/day — *"but you must get it done **no matter what within
  the same day**… because this is where your emotions are still fresh."*
- Trades **auto-import immediately after exit**; manual entry supported.
- **Daily stats panel** shows: P&L, trade count, win rate, *"**Did you follow your trading
  plan? Did you violate any guardrails?**… **Did you complete your pre-market routine?** And
  **how many trades you have already journaled** so far."*
- **A gray dot beside each trade means the journal is missing**; the day flips to "complete"
  when every trade is journaled.
- **Scan left to right:** left = auto-imported broker data (instrument, direction, lot size,
  date, session, duration, entry/TP/SL, R multiple, fees); right = the introspection space.
- **Three chart screenshots, one per timeframe**, each answering a different question:
  - **HTF** — *"why this trend direction… what was the initial bias? what was the structure
    like? what was the key levels?"*
  - **MTF** — *"**why this location**, why did I enter at this supply and demand zone or flip
    zone… where was the available liquidity?"*
  - **LTF** — *"your **entry trigger**… what was the entry confirmation"*
  - Rationale: *"so you can revisit your thought process **accurately instead of rewriting
    history**, right? Because we all know how inaccurate memory is."*
- **Focus mode** hides everything except the chart screenshots and the journal.
- **Did you follow a trading plan? Yes/No** — then tag **which** plan (defaults to the active
  edge).
- **Entry confluences** — free-text tags that persist as a dropdown: *"just pick the **two to
  five** confluences that actually cause you to take the trade… **You don't have to pick 10
  things because you're just going to be lying to yourself.**"*
- **Trade management** — held to TP? partial profits, and where? moved the stop, and how?
- **Mistakes** — *"Whether that's a win or a loss, **there will always be some form of
  mistakes**."* Tag them; *"you just want to make sure that you are **brutally honest**."*
- **Emotion is captured live, twice:** a pop-up **at entry** (*"what emotion drove this entry"*)
  and another **at exit**, both auto-tagged into the journal.
- **Reflection by voice** is transcribed to text.
- **Two reflection scripts.** When **green**: *"did I actually follow my trade plan **or did I
  get lucky**?… which part of the process was clean?… did I leave money on the table or did I
  manage the position well?… **how can I repeat this win again next time?**"* When **red**:
  *"**was it a good loss or a bad loss?**… a good loss is one in which I follow my plan and I
  still lose. That's just variance… but if it's a **bad loss**, that's **alarming** because a
  bad loss is a loss that I incurred as a result of **neglecting my trading plan**"* → then
  *"**What guardrail can prevent this exact mistake? What rule change do I need to do** to
  combat this mistake in the future?"*
- **Autosave** (no save button); previous/next-trade navigation without leaving the page.
- **Share a trade** for coach/community accountability — *"only share it **after** you have
  journaled it."*
- *"Every trade you journal becomes feedback. Every mistake you take becomes a pattern. And
  every pattern you fix becomes profit over time."*

### Measured: the good/bad-loss split is graded by P&L, not by execution

This is the episode's central claim, and the code contradicts it. `correction.js:330`:

```js
else if (r >= -1.05) { score += 6; reasons.push(`Loss of ${r2(r)}R — within the 1R limit, that is a good loss (+6)`); }
```

The branch keys on the **size of the loss**, never on `adherence`. `analysis/probe-ep23-goodloss.js`
calls the **real exported `autograde()`** on one losing trade (planned 2.0R, closed −0.80R, stop
honoured, MAE −0.70R) and varies only the trader's own adherence rating:

```
 adherence | score | emits "good loss"? | adherence reason
-----------+-------+--------------------+----------------------------
    1/5    |   70  |        YES         | Rule adherence only 1/5 (-10)
    2/5    |   70  |        YES         | Rule adherence only 2/5 (-10)
    3/5    |   80  |        YES         | (none)
    4/5    |   86  |        YES         | Rule adherence 4/5 (+6)
    5/5    |   86  |        YES         | Rule adherence 5/5 (+6)
```

At **adherence 1/5** — the trader's own statement that they neglected the plan — the grade is
**70/100 = A**, and the reasons list reads *"Loss of −0.8R — within the 1R limit, **that is a
good loss** (+6)"*. By his definition that is *"**alarming**… a bad loss"*. Worse, **adherence
3/5 scores 80, which the ladder at `correction.js:359` grades A+** — the top grade, awarded to a
money-losing trade with self-reported rule violations.

Total adherence swing across the whole 1→5 range is **16 points**, against +14 for planned R and
+16 for the R outcome. So the grade is still predominantly P&L-driven, which is precisely what
*"We don't define our performance… by our P&L"* rules out.

**Why this matters beyond a label:** `backfillGrades` (`correction.js:365-372`) persists this
score into `setup_grade` permanently, and **M58**'s fix would gate capital on A+/A. Shipping M58
without fixing this would route capital into trades the trader themselves flagged as
plan-violating — so the two must be sequenced.

### New items logged from this episode

- **M86 (S2, escalates to S1 with M58)** — the good/bad-loss split and the whole autograde are
  P&L-weighted where he requires execution-weighted; a 1/5-adherence loss is labelled "a good
  loss" and graded A, and 3/5 earns A+.
- **M87 (S3)** — one `screenshot_url` slot where his method requires **three timeframe-tagged**
  screenshots answering three different questions.
- **M88 (S2)** — no entry-confluences field. `tags` exists but conflates confluences with
  mistakes, and `correction.js:240` literally ORs them in one regex.
- **M89 (S3)** — `emotion_before` is written retrospectively at review, not captured at entry.
- **M85 extended** — the journal-completeness indicator (his gray dot / "complete" day state)
  is absent; `grep -rni 'journaled\|unjournaled\|journal_complete' src/` returns nothing.
- Recorded as **out of scope rather than defects**: voice-to-text reflection (0 hits) and
  share-a-trade — verified: the only 5 `share` matches repo-wide are `share_of_*_pct` ratio fields in `exposure.js:63-64` and `predict.js:1041/1098/1118`, none of them a sharing route or column. The app has **3 runtime dependencies and no build step**, and adding
  ASR or a public sharing surface is a product decision, not a strategy-fidelity fix.

### What this episode proves the code gets RIGHT

- **Partial exits are fully modelled.** `trades.js:59-72` parses `legs`, validates `pct`, and
  computes a **pct-weighted exit price** used for P&L — directly answering *"did I take partial
  profit? If so, **where**?"* `db.js:371` migrates the column in. **Clarification vs M51:** M51
  is about the **bot generating** a 3-target ladder he says not to use; the journal **recording**
  partials the trader actually took is correct and necessary, and the two must not be conflated.
- **The adherence rubric is genuinely his.** `db.js:269 adherence INTEGER -- 1-5 rule-adherence
  self score`; segmented at `performance.js:550 by_adherence`; flagged at `correction.js:227-235`
  (*"**Low-adherence trades are your losses**"*); and `coach.js:272-292` compares 4-5★ against
  1-2★ and states *"**That difference is your whole edge, quantified.**"* `demo-data.js:310` even
  seeds the goal *"Average 4★+ rule adherence"*. That is Ep 23's philosophy implemented — the
  defect is its **weight** (M86), not its absence.
- **Excursion discipline maps onto his green-reflection questions.** `correction.js:337-342` uses
  MAE and MFE to detect *"Entry was not run over"*, *"Entry was immediately underwater"*, *"Exited
  near the peak excursion"* and *"**Left X R on the table**"* — which is *"did I leave money on
  the table… did I cut the profits early because I was scared?"* measured rather than asked.
- **The autograde's five-section shape is his rubric**: planned pay-off, execution vs plan, risk
  discipline (stop moved −18 / stop not honoured −6 / stop left +6), excursion discipline, and
  adherence. Only the balance is wrong.
- **`execution_notes`** (`db.js:274`) is the trade-management field his *"how you manage the open
  position"* step needs, and `correction.js:501` carries his own warning verbatim in spirit:
  *"You rated your own adherence {n}/5. **Trades you cannot grade highly should not be taken.**"*
- **Broker data can be imported**, partially answering auto-import: `api.js:815` CSV import with
  broker column auto-detection (`findCol` at `:826` handles `size|quantity|qty|volume|lots|
  shares|contracts|units`). Not live sync — but the manual-entry path he describes exists.

---

## Ep 24 — How to Review Your Day (`4sN-gnJKRtA`) — COMPLETE, 4/4 ✔

`Back To Top` at chunk 3, `hasMore:false`. This is the **end-of-day review** episode and it
supplies the retrospective half of Ep 23.

### The thesis

> *"**Professionals don't improve from taking more trades. They improve from getting battle
> feedback.** You can trade a lot, you can back test a lot, you can even journal a lot. But if
> you don't reflect… you will not grow."*

> *"**reflection is the highest leverage skill**… it's also the most underrated skill in
> trading. It's not about doing more. It's about reviewing more."*

> *"trading is the easy part… **reflecting, that's the hard part that most people avoid** and
> that is also why most people stay stuck."*

### The process, step by step

1. **Open today in the journal, 10-second scan.** Outcome metrics: net P&L, win rate,
   **average R multiple**, total trades, won/lost.
2. **Then the process metrics** — *"there is your **outcome oriented metrics** and then there
   is your **process-oriented metrics**. When you focus on the process oriented metrics, the
   outcome oriented metrics will take care of themselves."* The panel shows: **Did I follow my
   plan? (yes/no)** · **which guardrail I violated** · **whether I completed my pre-market
   routine** · **how many trades I have journaled**.
   - On the routine he makes a testable claim: *"there's probably like a **direct correlation**
     between whether you conducted a pre-market routine and whether you actually make money on
     the day."*
3. **Four questions to answer in your head** while scanning: *Did I follow my trading plan, or
   did I give into emotions/guesswork/gut feeling? Did I break any rules or violate any
   guardrails? Was today's execution clean or messy? Did I do the boring work (pre-market
   routine, journaling) or did I skip it?*
4. **Journal every trade**, then identify the **best trade and the worst trade**.
5. **Best trade — three questions:** *What created the win?* (trigger, the sniper entry, how it
   was managed) · *What did I do right that was **repeatable**?* · ***How do I repeat this exact
   execution tomorrow?***
6. **Worst trade — three questions:** *What caused it?* — *"you want to be **very specific**.
   **Which rule** is it? **Which moment**? **Which trigger**?"* · ***Was it a good loss or a bad
   loss?*** (recap of Ep 23) · ***What is the ONE fix for tomorrow?***
7. **Review the guardrail violations.** This is where the episode's sharpest idea lives:
   > *"Usually when you violate any of the guard rails or violate any of the trading rules, you
   > will realize that you tend to lose money. **It's a pattern.** But on those days where you
   > violated guard rails and **you still make money, those are the days that you want to be
   > careful**… because what happens is that **you just got rewarded for bad behavior**. And we
   > all tend to repeat the behavior in which we got rewarded for in the past."*
   >
   > *"if you make money on a day where you violated your guard rails… **you shouldn't be
   > celebrating**… maybe **I don't count it as a win**."*
8. **The override reason, confirmed again, and with its review half:** *"after the trade button
   is gray… you can continue trading but **we require you to actually input a reason** and when
   you input a reason **the reason will show up over here**. So this is where you can review the
   rule that was violated and just reflect on **why** it happened."* (This is **M80** — capture
   *and* review.)
9. **"If a violation happen, then tomorrow's plan must change in some way."** *"nothing changes
   if nothing changes."* Suggested adjustments: tighten or loosen a guardrail, *"reduce the
   amount of trades that you're taking per day **from five to three**"*, or shorten the trading
   window.
10. **Three-point check:** daily data · individual trade data · the qualitative reflection.
11. **Sanctuary** — a 10-minute silent meditation to close the day: *"your past outcome does not
    determine your future results… **every single trade outcome is random**."* Alternatives in
    the mental toolkit: **box breathing, 60-second reboot, reset**; plus a **Rewire/Recovery**
    video library keyed to state (after a win / after a loss / after revenge trading / before
    sleep).
12. **Flow AI** (plus/pro tier) — a trading companion *"trained to be pretty much me"*. **v1
    does not see trading data**: *"it doesn't automatically see your trading data yet… you need
    to provide it with a quick summary."* His template: *"Today I made $500 on X. The biggest
    mistake I made today was… **What should I focus on tomorrow? Give me one fix.**"* Its answer
    in the demo lands on the same insight: *"that might be **a win that you are not proud of**…
    because you actually bend your rules."*
13. **Final step: write ONE key takeaway as your focus for tomorrow, in one simple sentence.**
    *"Tomorrow I'm going to be following my trade plan…"*

Also: *"for every hour you spend on chart work, you should spend an additional hour on the inner
work"*, and *"**Your P&L is simply a reflection of your character made visible in numbers.**"*

### The structural finding: breaches exist only for today and are never written down

`correction.js:450-453`:

```js
async function dailyState(userId, { accountId = null } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  ...
  const rows = (...).filter((t) => dayKey(t.opened_at) === today);
```

`dailyState` hardcodes **today**, evaluates three breach rules (`max_trades_day`,
`consecutive_losses`, `daily_loss_limit`), and returns them with `date: today`. **Nothing
persists the result** — `grep -rniE 'breach|guardrail' src/db.js` returns **0 hits** across all
**16** tables. Tomorrow the function recomputes from scratch for the new day and yesterday's
breaches are gone.

His review is explicitly retrospective and pattern-based — *"It's a **pattern**"* — and a pattern
cannot be detected from a single-day snapshot that is recomputed daily and stored nowhere. This
**deepens M79**: breaches do not merely fail to block, they are not recorded, so they cannot be
reviewed either.

### New items logged from this episode

- **M90 (S2)** — guardrail breaches are computed live for today and never persisted; the
  cross-day pattern is unmeasurable and the review panel has nothing to read.
- **M91 (S2)** — the *"rewarded for bad behavior"* case (breach **and** profit) is not detected
  anywhere.
- **M92 (S3)** — `best_trade`/`worst_trade` are **P&L** extremes, so his worst trade can never
  be a rule-breaking winner. Same conflation as M86, at day level.
- **M93 (S3)** — `behavior_score` is aggregate over the whole sample window, not per-day.
- **M94 (S3)** — no pre-market routine, so the correlation he hypothesises is untestable.
- **Out of scope, recorded as such:** Sanctuary/meditation, the mental toolkit (box breathing,
  60-second reboot, reset), the Rewire/Recovery video library, and **Flow AI** — `grep -rniE
  '\b(openai|anthropic|llm|gpt|claude|gemini|chatbot|ai_coach)\w*' src/` returns **0 hits**,
  confirming zero LLM references repo-wide. Flow AI is a paid-tier product feature and his own
  v1 does not read trading data, so a rule-based coach is comparable in spirit; a meditation
  timer is not a strategy-fidelity item.

### What this episode proves the code gets RIGHT

- **`journal_entries` is his daily-review table, field for field.** `db.js:176-192`:
  `market_bias, mood INTEGER (1-5), energy INTEGER (1-5), focus, plan, review, lessons,
  **tomorrow**, screen_time_minutes`, with `UNIQUE(user_id, entry_date)` — exactly one per day.
  **`tomorrow TEXT`** is his final step verbatim: *"have a final one key takeaway and just write
  it as your **focus for tomorrow**… in one simple sentence."* Written at `api.js:449`.
- **`dailyState` returns precisely his daily panel.** `correction.js:471`:
  `{ trades, closed, realised, r_sum, avg_r, loss_streak, balance }` plus `breaches`, `status`,
  `message`, `remaining_trades` — matching net P&L, average R multiple, total trades, won/lost
  and the guardrail list.
- **The process/outcome split exists in the report shape.** `correction.js:560-563` returns
  `behavior_score` and `behavior_grade` (`Disciplined / Solid / Leaking / Undisciplined /
  Critical`) **beside** `overall` — which is his *"focus on the process oriented metrics"*
  made structural. The defect is granularity (M93), not the concept.
- **His "one fix" instinct is implemented.** `correction.js:566` returns a single
  `top_fix: { title, fix, impact, impact_unit }` — the highest-impact item only, matching *"what
  is the **one fix** for tomorrow?"* and *"Give me **one** fix."* Per trade, `:501` does the
  same.
- **Outcome metrics are complete**: `performance.js:209-214` gives `total_r, avg_r, median_r,
  std_r, sqn, kelly, best_trade, worst_trade, best_r, worst_r`.
- **`best_r`/`worst_r` already exist alongside the P&L versions** (`:213-214`), so M92's fix is a
  matter of *which* pair the review surfaces, not of computing anything new.

---

## Ep 25 — How I Find A+ Setups (`V4Unokfrqjw`) — COMPLETE, 4/4 ✔

`Back To Top` at chunk 3, `hasMore:false`. **This is the keystone episode of the whole audit.**
It is the only one that enumerates the entry model as a closed list, states the all-or-nothing
rule explicitly, and defines what each grade letter means for tradeability.

### The frame

> *"**The edge isn't in spotting A+ setups. It's in ignoring everything else.**"*

> *"Most traders do not blow their trading accounts because they don't know how to enter a
> trade… they blow their accounts because **they cannot filter trades**. They take B setups when
> they are bored. They take C setups when they want action… **in trading, boring pays.**"*

> *"the hardest part about trading isn't spotting A+ setups, but rather **saying no to the B
> setups that the past me would have called A+**."*

### The five golden rules — *"if I miss just one, that is not A+ setups"*

> *"These are the five entry triggers that I check for before every single trade… **if I don't
> check off every single one of these boxes, that's a no trade**… If I miss just one… that is
> just an A setup."*

| # | Rule | What he requires |
|---|---|---|
| **1** | **Bias alignment** | Trade idea must match the immediate bias. *"if you find that the **lower time frame disagrees with the higher time frame, it's probably not the right trade**."* For beginners: *"either **stay out of the market** or just **wait for clarity**."* Style-dependent: a short-term trader reads the LTF as the signal, a swing trader waits for a POI to rejoin the HTF. |
| **2** | **High-probability point of interest** | *"**not all supply and demand zones are created equal.**"* Three sub-criteria: (a) **aligned with the trend** — a demand zone in a downtrend, *"price is most likely going to **blast right through it**"*; (b) **has liquidity or available liquidity near it** — a zone that **swept liquidity** is *"much more high probability… than this ordinary supply zone"*; (c) **price must be IN it** — *"not near it… not almost reaching it. **It needs to actually be in it**."* Otherwise *"**you are trading in the middle of nowhere**… it's incredibly low probability because price can go both ways."* |
| **3** | **Sweep + market shift** | *"**I always look for liquidity shift before I enter. No liquidity shift, no entry, as simple as that.**"* Then the market shift: *"price comes down, **take out the last higher low**, breaking structure, giving me a market shift… **If not, we cannot enter for a sell.**"* |
| **4** | **Timing** | *"I only want to enter for a trade when it's within my **Q zone** [kill zone] window."* His is London, 3-6 pm Singapore. *"If the setup appear before that window or after that window… **I personally will not enter for the setup.**"* Rationale: *"**liquidity is the fuel**… But fuel requires **ignition**… and **timing is that fire**."* Outside it: *"lower chance of it playing out… higher chance for price to **take longer** to go down to your take profit… **more randomness… more unpredictability**."* He calls it *"your **when filter**."* |
| **5** | **Asymmetric risk-reward** | *"**I do not care how good the setup is. I do not care how many entry confluences the setup has** if it does not have an asymmetric risk reward ratio."* 1:1 is *"not worth it."* Beginners: *"just stick to a **fixed** risk to reward… **target 2R**."* And the rule M7 came from: *"if the trade idea presents a risk to reward ratio of **less than two**… **no matter how many confluences I have, no matter how confident I am, I'm going to be passing on the trade.**"* |

Order matters: *"it's in this particular order itself. Your bias, your point of interest, your
sweep plus market shift, your timing, and your risk to reward."*

**The closing statement of the rule:**
> *"If any box fails… if you fail to find **any one** of these entry criteria, **you do
> nothing. You stay out the market.** That's it. Remember, **the most profitable position in the
> market is waiting.**"*

And: *"**Success = location + timing**… the right trade idea at the right place at the right
time."* *"you don't want to be hunting trades, you don't want to be chasing trade, **you want to
wait for price to come to you**… whatever you chase runs away… **You don't chase money, you
attract money.**"*

### The five no-trade conditions (inversion)

Charlie Munger: *"The only thing I want to know is where I'm going to die, so I never go there."*
> *"instead of asking 'How do I succeed at trading?' you should be asking '**What guarantees I
> fail?**'… **You don't need to find some magical trick to win more trade. You just need to stop
> doing the dumb stuff that guarantee losses.**"*

1. **bias not aligned**
2. **price not at a POI** — *"in the middle of nowhere"*
3. **no sweep or no market shift** — *"no confirmation, no entry trigger"*
4. **outside your kill zone**
5. **RR not asymmetric, OR you cannot determine where the stop or TP goes** — *"**if you don't
   know exactly where to get out, then you probably shouldn't enter**"*

> *"If **any one** of these is present in the market, I'm not going to be trading. **No matter
> how confluent, how confident I am, no matter how much I want to make money in the market.**"*

### The grade definitions — this settles M58 and sharpens M7

- **A+** = *"a setup where **all five** of these triggers are checked."*
- **A** = *"the trade idea which meets the entry criteria **within my active trade plan**, but
  it **may not hit all five** A+ triggers."*
- **He trades A as well as A+:** *"sometimes I look at my trade plan and I see everything is
  checked off… **I don't need to have the five A+ triggers to actually enter for the trade**,
  because if I'm always looking for A+ setups only, **I'm going to be under trading very
  often**. So I actually allow A setup as well."*
- **And the hard line:** *"for **B's and C setups, no trade whatsoever**. If a setup is low
  probability, I don't want to be wasting my money on it. As simple as that."*

**So the gate is at the A/B boundary, not the A+/A boundary.** This reconciles Ep 16 (*"deploy
capital on A+ only"*) and Ep 21 (*"only A+ setups"*) with Ep 25's explicit permission to trade A:
A+ is preferred and may be sized up, A is tradeable, **B and C are categorically forbidden.**

### Grade-based sizing — and the distinction that resolves M82

Offered as a bonus tip, explicitly optional: *"you could take **0.5 % risk on A setup**, and you
could also take **1 % risk on A+ setup**"* — but *"this is **not for everybody**. If you don't
have sufficient data… **stick to a consistent fixed risk per trade**."*

The non-negotiables then draw the line that M82 turns on:
> *"**never size up to make back losses, never size up because you feel good**… You **only size
> up when your checklist quantifies it**… if it's an A+ setup, then you can consider ramping up
> your lots a little bit."*

**So variable risk is not forbidden per se — what is forbidden is sizing on *feelings or
streaks*.** Sizing on the **checklist** is sanctioned; sizing on a **winning streak** is not.
`coach.js:549-550` varies risk on streaks and drawdown, i.e. on the wrong input.

Also confirmed as a real Edge Flow guardrail: *"sticking to the max daily loss, the **max daily
profit**, the max streak rule"* (M81).

### Measured against the code: the all-or-nothing pattern already exists — for 2 of 5 rules

`setup.js:271-284` is a weighted percentage **plus five hard caps**:

```js
const totalW = checks.reduce((s, c) => s + c.weight, 0) || 1;
const got   = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
let score = (got / totalW) * 100;
...
// a missing trigger or zone is disqualifying regardless of the rest
const hasTrigger = checks.find((c) => c.key === 'sweep').pass;
const hasZone    = checks.find((c) => c.key === 'zone').pass;
if (!hasTrigger) score = Math.min(score, 38);
if (!hasZone)    score = Math.min(score, 34);
if (levels && levels.rr_final > 0 && levels.rr_final < minRR) score = Math.min(score, 45);
if (levels && levels.entry_status === 'invalid')              score = Math.min(score, 20);
if (blackout)                                                 score = Math.min(score, 40);
if (levels && levels.entry_status === 'waiting')              score = Math.min(score, 66);
```

The comment at `:276` — *"a missing trigger or zone is **disqualifying regardless of the rest**"*
— **is his all-or-nothing rule, verbatim in intent.** Against the ladder at `:31-35`
(A+ ≥ 86, A ≥ 72, B ≥ 58, C ≥ 44, no-trade below):

| cap | score | grade | tradeable? | his verdict |
|---|---|---|---|---|
| no sweep | 38 | no-trade | **no** | ✅ correct — rule 3 |
| no zone | 34 | no-trade | **no** | ✅ correct — rule 2 |
| zone invalidated | 20 | no-trade | **no** | ✅ correct |
| news blackout | 40 | no-trade | **no** | ✅ correct |
| **rr_final < 2R** | **45** | **C** | **YES** | ❌ *"no trade whatsoever"* |
| **entry 'waiting' (chasing)** | **66** | **B** | **YES** | ❌ *"no trade whatsoever"* |

**Two of his five hard no-trade conditions land on grades the code still marks tradeable**, via
`setup.js:315`: `ok: g.grade !== 'no-trade'`. The RR cap misses being a true veto by **one
point** — 45 against C's floor of 44.

And **the killzone has no cap at all** (`add('session', …, 8, …)` at `:158`, weight 8 only),
which is what **M8** records; note the contrast with news, which *does* cap at 40.

### New items logged from this episode

- **M95 (S1)** — the tradeability gate sits at the C/no-trade boundary where his sits at the
  A/B boundary; B and C are `ok:true` though he says *"no trade whatsoever."*
- **M96 (S2)** — RR is a weight (14) that other confluences can outvote, against his verbatim
  *"I do not care how many entry confluences the setup has."*
- **M97 (S3)** — the `management` check is registered with **weight 0**, so `rrFinal >= minRR`
  can never affect the grade.
- **M98 (S3)** — no grade-based sizing (0.5 % A / 1 % A+). Recorded at low priority because he
  calls it optional and the code's fixed-risk default **is** what he recommends for most traders.

### What this episode proves the code gets RIGHT

- **The disqualification pattern is genuinely implemented for two of the five rules**, with the
  intent stated in the source comment. Extending it to RR, killzone and HTF/LTF conflict is
  repeating an existing idiom, not inventing one — which is why M95/M96 are cheap.
- **Every criterion already carries a boolean.** `setup.js:92` registers
  `{ key, label, pass, weight, detail }`, and `:317-318` reports `passed` and `total_checks`.
  The five-gate check needs no new analysis — only `passed === total_checks` semantics on the
  five relevant keys.
- **The grade vocabulary matches his exactly**, including the `no-trade` letter
  (*"Not an A+ setup — the edge is not there"*) — his *"the most profitable position in the
  market is waiting"* as a first-class output state.
- **`blocks_trade` exists as a concept** in `topdown.js:568-617` — four conflicts block, two
  warn — so the method gate already distinguishes veto from advisory. The counter-trend case at
  `:568` is `false`, correctly, per Ep 11.
- **Rule 2(c), price must be *in* the zone, is enforced**: `add('entry', 'Entry not chased (price
  at/near the zone)', entryStatus !== 'waiting' || zoneReach <= 2.5, 8, …)` at `:238`, plus the
  `waiting` cap at `:284` and the `action` string *"Chasing here breaks the model's edge."*
- **Fixed 2R targeting for beginners is the default** — `minRR` defaults to 2, matching *"just
  stick to a fixed risk to reward… target 2R."*
- **The code's fixed risk per trade is his recommended default**, not a defect: *"stick to a
  consistent fixed risk per trade. Whether it's A setup or A+ setup, you just stick to 0.5 % or
  1 %."* (M98 is therefore an optional enhancement, not a divergence.)

---

## Ep 26 — Review Your Trades Like a Pro (`xoUlvwdBVJ4`) — COMPLETE, 3/3 content chunks ✔

`Back To Top` at chunk 2; chunk 3 verified as site chrome (Content Creation / Specialized menus,
disclaimer, API promo), `hasMore:false`.

### The five R process — *"that's the whole game"*

> *"**Record** your trades daily, **review** them weekly, **reflect** on them monthly, **refine**
> your plan quarterly, **reassess** your goals annually, repeat. I call that the **five R
> process**, and honestly, **that's the whole game**."*

> *"your edge doesn't come from finding a new strategy. It comes from **extracting better
> feedback from the trades that you already took**."*

> *"traders severely **overestimate their competence** and they **underestimate how much feedback
> they can extract** just by reviewing their own trades properly… **The best information about
> your trading is your trading.** It's not found in books, it's not found in mentors, it's not
> found in YouTube videos."*

### The three layers

| Layer | Purpose (his words) |
|---|---|
| **Dashboard** | *"just see the numbers at a high level"* |
| **Journal** | *"this is where you will be able to find the **context** of the trade"* |
| **Notebook** | *"this is where you **turn both into decisions**"* — qualitative + quantitative feedback → decisions to improve the plan |

### The four templates, each with a *different structure*

Held in the notebook's **performance review** category. The structures differ deliberately:
*"you don't adjust your trading plan on a **weekly** review because you **don't have enough
data**… you might want to adjust your trading plan only after you've done your **quarterly**
review"* and *"you don't reassess your annual goals on the monthly review."*

**Weekly** — wins / losses / break-evens, then metrics: **win rate, net, average win R, average
loss R, max drawdown, rule breaks**. Then process: **compliance rate**, how many **A setups**
taken, how many **impulse/emotional** trades, and how many **missed value setups** *"that you
should have taken but you didn't because you were hesitating, you were scared."* Then best and
worst trade. Then reflection: what went well *and what specifically made it work*; what mistakes
or weak points showed up *and what's the **prevention plan***; what pattern appears in best and
worst; **what's the single focus going into next week**.

**Monthly** — same metrics, longer horizon, different reflection: *"What's the **one trading
lesson that hit the hardest** this month? **What mental barrier showed up most**, and what's your
plan to fix it? What are you most proud of — **process or results**? What's the single focus
going into next month?"*

**Quarterly** — *"we spend a little bit more time in the performance breakdown because… **now you
actually got data that you can trust**."* Adds: the **80/20 question** (*"what is the **20 % of
the actions that resulted in 80 % of the profits**?"*), **best market**, **best setup name and
why**, **top mistakes that cost the most R**, and a **process audit** (biggest execution upgrade,
biggest discipline upgrade, which guardrails actually helped, biggest mistake pattern to
eliminate).

**Annual** — the deepest reflection; his own example: *"in the midway through January, I took the
time out to review **every single trade I've taken in 2025**… And then **the next day I caught my
biggest trade. I literally made 300k**… because I did the audit, I know exactly what I need to
spot… **there's a recurring pattern.**"*

### Two definitions that settle existing ledger items

**Compliance rate — the exact formula M57 needs:**
> *"If you are supposed to follow your trade plan **10 times**, but you only follow it **8
> times**, then your compliance rate is probably around **80 %**."*

**Best/worst trade — verbatim confirmation of M92:**
> *"the good trade and the worst trade **doesn't need to be the trade with the biggest P&L or the
> biggest loss**… **Best trade doesn't mean it's the trade with the biggest profit. Worst trade
> doesn't mean the trade with the biggest loss.** No. It's the trade in which you feel like you
> performed the worst in and you feel like you performed the best in. **It needs to be tied to
> the process… Not tied into the trade outcome.**"*

**On sample size (relevant to M11):**
> *"weekly review is **not enough** for you to know whether a strategy is profitable or not. You
> need to do it over a **larger sample size** of trades — over a month, over a quarter, **over
> 100 trades, over 500 trades**."*

**One focus per period:**
> *"**one periodic review means one focus, not 10**… what's the **one needle mover** that allows
> me to really just 10x my trading results next month."*

Also: *"**knowledge itself isn't power. Application of the knowledge is power.**"* · *"these
templates aren't here to make you feel **productive**. They're here to make you
**profitable**."* · *"I define the gut feeling, your trader's intuition, as simply a
**well-trained subconscious pattern recognition skill**."* · *"**History doesn't repeat itself,
but it sure as hell rhymes.**"*

### New items logged from this episode

- **M99 (S2)** — no periodic review layer. The five R cadence has no implementation beyond the
  daily journal; only `month` and `quarter` exist anywhere, and only as **goal** periods.
- **M100 (S2)** — **missed value setups are not measured, although the data to compute them is
  already in the database** (`bot_signals` stores every generated signal with a `status` column
  and an index on `(user_id, status)`).
- **M101 (S3)** — `top_fix` has the right *shape* (one item) but is not **period-scoped**, so
  there is no record of what last period's focus was and no way to check whether it was acted on.

### What this episode proves the code gets RIGHT

- **His 80/20 question is computed.** `performance.js:231`:
  `profit_concentration: gp > 0 ? r2((top5 / gp) * 100) : null` — top-5 wins as a percentage of
  gross profit. That is *"what is the 20 % of the actions that resulted in 80 % of the profits?"*
  answered numerically.
- **`avg_win_r` and `avg_loss_r` exist**, matching his weekly metric list exactly —
  `correction.js:60-61` — and are used downstream for expectancy at `api.js:730`.
- **"Best market" and "best setup name" are both segmented**: `performance.js:540 by_strategy`
  and `:541 by_symbol`, via the same `segment()` helper that produces `by_emotion`, `by_mistake`
  and `by_adherence`.
- **Any period is queryable.** `api.js:240` accepts arbitrary `from` / `to`, so a weekly or
  annual window can be requested even though no preset exists.
- **The process-metric set is richer than his template.** Alongside his list the code computes
  `capture_efficiency`, `mae_coverage`, `stops_overshot`, `avg_adherence`, `streaks`,
  `trading_days` (`performance.js:226-234`) — more of the "process over outcome" data he asks
  for, not less.
- **`top_fix` is genuinely one item**, matching *"what's the one needle mover"*:
  `correction.js:566` returns a single `{ title, fix, impact, impact_unit }`. The gap is
  persistence (M101), not shape.
- **The week primitive already exists.** `smc.js:323 weekKey(t)` is exported at `:732` and used
  for weekly ranges at `:361` and `:372` — so bucketing a review by week needs no new date logic,
  only wiring.

---

## Ep 27 — How to Improve Your Strategy With Data (`IieXTRD15GU`) — COMPLETE, 4/4 ✔

`Back To Top` at chunk 3, `hasMore:false`. This is the episode that specifies **how the plan is
allowed to change**, and it exposes the most serious structural defect found so far.

### The sample-size rule

> *"**I only change rules when I have either 100 trades to review or I have at least three months
> of data.** If you don't have 100 trades yet, you need **at least 30 to 50 minimum trades** just
> to see anything meaningful… And if you're below that threshold, below that **30 to 50 trades,
> don't tweak the system at all**… anything less than 30 to 100 trades, it's just not meaningful
> enough."*

> *"Most traders change strategy as often as they change the underwear… every single time they
> do that, they're self-sabotaging because they **reset their competence level back to zero**."*

> *"when they hit a losing streak, they instantly assume their strategy is no longer working.
> When it could just be **normal variance**… a random distribution between wins and losses. That
> is why **I don't adjust my trade plan based on emotions. I adjust it based on data.**"*

### The re-test requirement — and why it is the load-bearing rule

> *"when you introduce a **new variable** into your trade plan… **you have to test the entire
> trade plan again** just to prove the hypothesis… you want to treat it like a **science, not as
> an art**… you have a hypothesis, then you test the hypothesis, and then based on data you can
> find out whether the hypothesis is actually proven to be right or proven to be wrong."*

> *"**if you don't, you will never ever truly know what worked and what didn't work.**"*

> *"**No more than one to three changes per quarter.** If you change too many variables at once,
> you're going to create chaos and **you will never ever know what actually cause improvement**…
> I would advise you to change **one**, but if you want to change more, **three is the
> maximum**."*

> *"identify the rules that stop the **biggest leak**… find out what are the biggest three
> patterns that cause you to lose the most amount of money."* · *"**think like a scientist, not
> react like a gambler.**"*

### The five-step process

1. **Review and fill up the quarterly template** — *"I literally **block out one entire day**"*;
   review every trade of the past 90 days. *"this entire quarterly review document… becomes your
   **source of truth for the next 90 days**."*
2. **Identify the repeating patterns**, using a seven-category cheat sheet: **technical**
   (*"this should be the **first priority**"* — HTF mapping, POI, entry criteria, whether the
   liquidity-shift model works in this condition), **timing** (which session is profitable —
   *"15 of those 20 trades… you tend to win those trades when you take them in London"*),
   **emotional** (*"trace the problem all the way down to the **root cause**… the root cause is
   your emotion"*), **risk** (sizing up after wins or after losses), **trade management**,
   **execution quality**, and **environment/context** (workspace, stress, market conditions).
3. **Convert each pattern into an IF-THEN rule** — *"**if the problem occurs then I'm going to
   implement the solution**."* His four worked examples:
   - *profitable but inconsistent* → **tighten discipline**: fewer trades, shorter window, hard
     stop after max loss, don't continue after a losing streak
   - *win rate high but average R low* → **stop cutting winners**: reduce early exits, delay
     partials, let winners run
   - *win rate low but average R strong* → **improve selectivity**: focus on A+ setups only
   - *risk deviation high, consistency low* → **fix sizing**
4. **Implement it in Edge Flow** — tweak the plan or adjust the guardrails. *"you want to **lock
   them in your system** so you're not relying on willpower or discipline… **the last thing you
   want to do is to be relying on memory**… when emotions hit, you're going to be forgetting
   about all of this stuff. So, **bake it into your system because the system is what keeps you
   consistent**."*
5. **Run it for the next quarter**, then repeat.

Then: *"**lock in one theme for the next 90 days**… not five or 10 different goals, just **one
focus**"*, ideally as an **identity statement** — *"I'm the type of trader who **shuts down after
a max loss**"* — because *"we always act in accordance with our belief and identity."*

**The recap, in his words:** *"You don't strategy hop. You don't panic after a losing streak. You
don't make random tweaks just because you feel like something is off. You review a **real sample
size**… You find the recurring patterns. You convert them into **one to three rule changes**… You
**bake them into edge flow**… And you **run the experiment for the next 90 days**."*

He also explicitly endorses using an LLM for step 3 when stuck — *"thank god for AI… send it to
Flow AI… whether that's ChatGPT or Google Gemini or Claude"* — as a **fallback**, not the core
mechanism.

### The structural finding: editing a strategy destroys the evidence the method needs

`api.js:496-498` updates a strategy **in place**:

```sql
UPDATE strategies SET name=@name, description=@description, market_conditions=@market_conditions,
  timeframes=@timeframes, entry_rules=@entry_rules, exit_rules=@exit_rules, checklist=@checklist,
  risk_rules=@risk_rules, target_r_multiple=@target_r_multiple, colour=@colour, active=@active
  WHERE id=@id AND user_id=@user_id
```

The `strategies` table (`db.js:219-234`) has **no `version`, no `effective_from`, not even an
`updated_at`** — only `created_at`. There is **no history or revision table anywhere**: the six
`version|effective_|revision|archived` hits in `db.js` are `archived` on *accounts* (`:125`),
`SCHEMA_VERSION` for the database schema (`:351`, `:402`, `:565`), a migration comment (`:363`),
and the seed strategy named *"Mean Re**version** (range fade)"* (`:426`) — none of them strategy
versioning. A repo-wide search for strategy versioning in any form returns nothing.

Meanwhile `db.js:261` makes the link **a foreign key to that mutable row**:
`strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL`. A trade snapshots
`strategy_name` (`:262`) — the *label* — but **not** `entry_rules`, `exit_rules`, `checklist` or
`target_r_multiple`.

**Consequence.** The moment a user edits a plan, every historical trade still points at the same
`strategy_id`, which now holds the **new** definition. So:

- `performance.js:540 by_strategy` aggregates trades taken under the **old** rules together with
  trades taken under the **new** rules under one label;
- the pre/post comparison that step 5 depends on — *"at the end of the next quarter… you can came
  to a conclusion on whether the three variables that you have changed… make your trading results
  better or not"* — **cannot be performed**, because the two cohorts are indistinguishable;
- and the historical record is **silently rewritten**: a trade taken under the old rules now
  reports as having been taken under the new ones.

The app does not merely fail to support his method — **it destroys the evidence the method
consumes.** That is the difference between a missing feature and a corrupting one.

### The second finding: the code states his threshold, then ignores it

`coach.js:40-49` gates on `n < 5` and, below it, says his number verbatim:

> *"You have {n} closed trades logged. Consistent logging matters more than any single result —
> **patterns become statistically meaningful around 30–50 trades per setup**."*

**That is Ep 27's threshold, quoted correctly.** But it is only emitted **below five trades**.
From 5 to 49 the coach produces a full analysis with a numeric `score`, and `detectMistakes`
(`correction.js:95`) likewise fires from `n >= 5`, reporting *"Low-adherence trades are your
losses"*, *"Your busiest days are your worst days"* and similar pattern claims with **no
insufficient-sample caveat anywhere**.

### New items logged from this episode

- **M102 (S1)** — strategy edits are in-place overwrites with no versioning, so the pre/post test
  his whole method requires is impossible and history is silently rewritten.
- **M103 (S2)** — the 30–50 threshold is stated in a string at `coach.js:45` and then ignored
  everywhere; pattern detectors and the coach score both fire from **5** trades.
- **M104 (S3)** — no cap on changes per period (*"one to three… three is the maximum"*).
- **M105 (S3)** — no identity-statement or one-theme field for the 90-day focus.

### What this episode proves the code gets RIGHT

- **The IF-THEN diagnostic mapping is genuinely implemented.** `detectMistakes` returns
  `{ key, title, severity, count, impact, impact_unit, evidence[], fix, metric }` per pattern and
  `correction.js:566` surfaces the single highest-`impact` one as `top_fix` — that is his
  *pattern → solution → one fix* chain, and *"find the rules that stop the **biggest leak**"* is
  literally the `impact` sort.
- **His "win rate high but average R low" branch is implemented with the arithmetic.**
  `coach.js:203`: *"You average {avg_win} on winners and {avg_loss} on losers, a payoff of
  {payoff}:1. **That ratio breaks even at a {need}% win rate** and you are running {win_rate}% —
  a margin of {margin} points."* That is the exact diagnosis, quantified rather than asserted.
- **His own threshold is in the codebase**, quoted correctly at `coach.js:45`. The fix for M103
  is to act on a string the authors already wrote.
- **Five of his seven pattern categories have detectors**: timing (`session bleed`), emotional
  (`emotional`, `:240`), risk (`revenge`, `overtrading`), trade management (`stop_widened`,
  gave-back-profit at `coach.js:225`), execution quality (`adherence`). Only **technical** and
  **environment/context** are unrepresented — and environment is not capturable from trade rows.
- **Sample provenance is disclosed even where it is not enforced**: `correction.js:439`
  *"Derived from your last {n} closed trades ({days} trading days, {consecutive} losers in the
  sample)"* and `:557` returns `sample: { trades, from, to }`. The user can see n; the code just
  does not gate on it.
- **The "bake it into your system" instinct is the guardrails mechanism** — which is precisely
  what **M79** records as computed-but-unenforced. Ep 27 is the fourth episode to require
  enforcement rather than advice.

---

## Ep 28 — Emotional Regulation (`MKSwk0lEtZ0`) — COMPLETE, 4/4 ✔

`Back To Top` at chunk 3, `hasMore:false`. Opens on Jung — *"**Until you make the unconscious
conscious, it will direct your life and you will call it fate.**"*

### The core doctrine

> *"emotional mastery doesn't mean eliminating of emotions. It means accepting the fact that
> **you cannot always control the initial reaction, but you certainly always can control your
> response**. **It's not what happens first that matters. It's what you do next.**"*

> *"**It's not the situation that hurts. It's your interpretation of the situation that hurts.
> It's not the wrong trade that destroys you. It's refusing to cut it before it becomes a big
> loss that does.**"*

### Sanctuary — the regulation layer

A safe place to reset: a **meditation timer** (5/10/15/30/60-min presets, custom h/m/s, interval
bells, ambient sound — gentle rain, ocean wave, forest, fireplace, white noise, or none), a
**post-session check-in** (how you felt + notes, saved to a session log), a **daily intention**,
a **streak/progress tracker**, and a **mental toolkit** grouped **reboot / rewire / recovery**.

**The daily intention must be process-oriented:**
> *"one clear rule for the day… keep it as **one simple sentence**, and you want to make it
> **process-oriented**. You want to make it **behavioral**. You want to make it so that it's
> **within your control**. You can't say stupid stuff like *'Today, I'm going to make $5,000 from
> the market.'* No, **that's outside of your control**… that's an **outcome-focused goal**, which
> only happens as a **byproduct** of you following the process."*

**His three-part process (before / during / after):**

**BEFORE** — a **"switch on routine"**: reset the body (box breathing, a 60-second reboot, or 5–10
min meditation; **breathe out longer than in — 4 in, 6 out** — to settle the parasympathetic
system); then **name the emotion**:
> *"what emotion am I feeling right now? What am I walking into the market as?… **if you don't
> name the state, the state will control the trade.**"*

then declare **execution mode** — *"I'm not in analysis mode anymore… my job is to just wait for
the setup to appear, execute my trade, manage risk, that's it"* — optionally with a **mental
rehearsal** of the process and of both the win and the loss.

**DURING** — on any spike of emotion, run a reboot, then answer **four questions**:
> *"**Am I calm? Am I clear? Am I following the trade plan? Would I take this trade if I was
> already up big today?** **If the answer to any of these questions is no, then you don't trade
> yet**, because if the answer is no, that means you are still emotional and you need to give
> yourself more time… for your internal state to get back into equilibrium."*

**AFTER** — rewire/recovery to detach. The **randomness doctrine**:
> *"every single trade that you take is **not attached to the past trade outcome**… just because
> you lost the last trade or just because you won the last trade, **it doesn't increase or
> decrease the odds that you're going to win or lose the next trade. It's all random.**"*

### The framing that settles M79

> *"**The guardrails in Edge Flow stop you mechanically. It's the hard wall, right? It blocks you
> from doing dumb things when you're emotional. But sanctuary fixes the emotional cause.**
> Because if you're tilted, if you're anxious, if you're greedy, if you're angry, if you are
> fearful, **you are always going to find a way to break your trading rules. You are going to
> OVERRIDE YOUR GUARDRAILS**, and you are going to make stupid mistakes… Not because you're weak,
> not because you are a human, but because **your nervous system is hijacked**."*

> *"**discipline isn't about motivation. It's regulation plus putting in the systems that will
> allow you to make the right decisions.**"*

He frames guardrails and regulation as **two halves of one system**: guardrails say *"I can't
trust myself right now"*, Sanctuary asks *"why am I even in this emotional state in the first
place?"* For a self-hosted journal the meditation layer is optional; **the mechanical half is
not** — and this is the fifth episode (after 12, 21, 22 and 27) to require enforcement rather
than advice.

### The finding: the code already prescribes the rule, as text, and does not enforce it

`coach.js:311` contains, verbatim, the rule from the four questions:

> `action: 'Add a 10-second state check before every entry. **If the honest answer is not
> calm/neutral, the trade does not happen.**'`

So the codebase **knows** the gate and even states its consequence. But nothing implements it:
`emotion_before` is an optional column with no validation, no requirement and no gate anywhere
(`grep` for a required/validate/block check on `emotion_before` returns **0 hits**), and the
four in-session questions appear nowhere (`0 hits`). The insight is emitted at
`severity: 'critical'` — and, like every other insight, is only displayed.

### New items logged from this episode

- **M106 (S2)** — no pre-trade state gate, although `coach.js:311` prescribes the exact rule and
  `emotion_before` is already captured and analysed.
- **M107 (S3)** — no daily intention field, and nothing distinguishes a **process** intention
  from an **outcome** one.
- **M108 (S3)** — the regulation layer (Sanctuary) is absent. Logged at low priority: it is an
  Edge Flow product feature, and its absence is not a strategy defect — but it is recorded
  because his framing makes the *guardrail* half non-optional.

### What this episode proves the code gets RIGHT

- **Both halves of his check-in exist as columns** — `emotion_before` (`db.js:266`) and
  `emotion_after`, written at `trades.js:45-46`. Not one, both.
- **`coach.js:300-312` is a genuinely rigorous pre-trade-state analysis**, not a keyword count.
  It defines 11 negative states (`revenge, fomo, anxious, angry, frustrated, greedy, impatient,
  tilted, bored, tired, fear`) and 6 positive ones (`calm|confident|focused|patient|neutral|
  disciplined`); it requires **both** cohorts to be large enough (`neg.length >= 6 &&
  pos.length >= 5`); it requires a **material effect size** (`sn.exp_r < sp.exp_r - 0.15`, i.e.
  0.15R) so it does not fire on noise; and it computes a **counterfactual impact**
  (`sn.net - sn.n * sp.exp_r` — what those trades would have earned at the calm cohort's rate).
  That is a defensible causal argument, not a vibe.
- **`coach.js:551` states his risk rule as the default**: *"No drawdown or streak flags. **Trade
  your standard risk unit.**"*
- **The risk model only ever shrinks.** Every multiplier is below 1 — `0.5` at −6 % drawdown,
  `0.75` at −3 %, `0.5` when down more than 2 % on the day, `0.6` at a 3-loss streak, `0.9` at a
  4-win streak — and the win-streak branch's reason string is *"**resist size creep, keep the
  same unit**."* Nothing in the model can size **up**, which is the specific thing Ep 21 forbids
  and Ep 28's randomness doctrine also rules out.
- **`correction.js:459-466` counts consecutive losses and breaches at
  `max_consecutive_losses`**, matching his losing-streak guardrail from Ep 19/21.

---

## Ep 29 — How to Use AI for Trading (`iGORytFiDnU`) — COMPLETE, 5/5 ✔

`Back To Top` at chunk 4, `hasMore:false`. This episode inverts the expected finding: the
codebase has **zero** LLM integration, yet Ep 29 argues that most of what an LLM would add is
either forbidden or already present in deterministic form.

### What he says AI is NOT for

> *"A lot of traders are asking, can AI give me signals? Can AI tell me when to buy, when to
> sell? **No, buddy. That's not the real opportunity.** … the real opportunity is **using AI to
> think better**."*

> *"**AI is not the most powerful when it tries to predict the market for you. Trust me, I've
> tried it**… it's just not that good yet… **I don't think they understand market mechanics as
> well as I do**."*

> *"**AI should not replace your trade plan. It should not replace your journaling. It should not
> replace your review process. It should not replace your risk management. It should not replace
> your personal responsibility.** Because if you start using AI as a **shortcut for certainty**,
> you are using it wrong."*

### What he says AI IS for

> *"AI is very useful for **organizing your thinking, challenging emotional decisions, and
> turning mistakes into lessons, asking better questions, and speeding up feedback loops**."*

> *"I believe that the real edge of AI is **speed**. It helps you close the gap faster between
> **confusion and clarity, emotion and logic, mistake and lesson, impulse and discipline**."*

> *"**trading is still a probability game. It does not remove uncertainty.** What it can help you
> do is to **navigate that uncertainty with better structure**."*

### The decisive fact: Flow AI v1 cannot see your trades

> *"quick expectation check before we start. **Flow AI version one is not some magic AI that can
> read your trading account, read your trading data**, and just automatically know how you have
> been trading. **It only works as well as what you tell it**, right? It's kind of like ChatGPT.
> **In the future**, Flow AI will be able to give you **personalized feedback based on your
> actual trades** and your patterns inside Edge Flow. But for now, this is the first version."*

Confirmed again at the end: *"now it's actually integrating into your trading data **in the
future**."* Flow AI is also a **paid plus/pro feature**.

**So on the one axis that matters most — personalised feedback derived from the user's own trade
data — the codebase already does what Flow AI v1 explicitly cannot.** `coach.js` reads the trade
database directly and produces **26 insights**; `correction.js` produces **15 `fix:` strings**
from `detectMistakes`.

### What Flow AI actually outputs — and the code already computes all of it

His in-session demo shows Flow AI running a **structured sanity check**, not free-form advice:
*"What is your **bias on the higher time frame**? … **what is the location in which price is
at**? Is it at the supply and demand zone? Is it at the flip zone? Is it at the order block? …
once you got price mitigation, **do you have your confirmation**? … are you following your **risk
parameters**?"* — that is the 5-step CRT checklist, which `setup.js` evaluates deterministically.

His pre-market prompt returns **three discipline reminders plus one no-trade warning**, and the
example content is course content: *"Structure first, **only trade from your point of
interest**"*, *"your risk stays mechanical, **stick to 0.5 % to 1 % risk per trade**"*, and the
no-trade warning *"if EUR/USD runs without breaking your point of interest and you feel **fear of
missing out, do not trade**… Pass and wait for the clear return to the point of interest and
confirmation."* His pre-click check: *"Is the higher time frame still bullish? **Do we take
liquidity and get displacement?** Do we have the confirmation?"*

His post-session prompt asks for **one pattern, one lesson, one rule for tomorrow** — exactly
`correction.js:566 top_fix`, one item.

His five example prompts map onto existing code paths:

| His prompt | The code's equivalent |
|---|---|
| *"help me get into execution mode… give me three reminders"* | `coach.js` 26 insights, ranked by `impact` |
| *"I'm feeling emotional… talk me out of a stupid decision"* | `coach.js:300-312` pre-trade-state analysis + `correction.js:477` cooldown |
| *"**make this decision binary**: should I take this setup or skip it?"* | `setup.js:315` `ok:` — the tradeability gate (see **M95**) |
| *"**find the pattern, not the story**"* | `detectMistakes` — 15 pattern→`fix` pairs |
| *"here's my mistake → **give me one if-then rule** to prevent it tomorrow"* | `correction.js:566 top_fix` (Ep 27's IF-THEN framework) |

### The identity framing, restated

> *"**every single trade you take is not wasted. Every single trade you take is a VOTE for the
> person that you want to become.** … if you're taking a trade that is in accordance with your
> trade plan, you're literally **voting** for yourself to be a disciplined trader… And every
> single trade that you take that is **outside of your trade plan**, you're voting for yourself
> to be an **undisciplined trader**, which means you're going to get **inconsistent results**."*

> *"**Trade like the person you want to become. Patient, selective, rule-based.**"*

His in-session reset ends on an **identity check**, and prescribes a **three-line post-loss
review** — which is Ep 23/Ep 22's requirement again.

### The finding, stated carefully

The genuine gap is **not** "there is no LLM". It is that **the advice the codebase already
generates has no interactive channel**: there is no route to ask the system anything
(`grep` for `ask|question|chat|advice|ai` routes returns **0 hits**), no `*_API_KEY` for any LLM
provider (only `CRON_SECRET` and `TURSO_AUTH_TOKEN`), and the 26 insights can only be consumed by
opening a report. The moment Ep 28 identifies as most dangerous — mid-session, tilted, about to
click — is precisely the moment with no way to consult the system at all. That is **M109**,
recorded at **S3**, because the substance is present and only the channel is missing.

### New items logged from this episode

- **M109 (S3)** — no advisory channel; the deterministic advice exists but cannot be consulted
  interactively, and there is no integration point to add one.

### What this episode proves the code gets RIGHT

- **All three things he says AI is genuinely good for are implemented deterministically.**
  *Organizing thinking* → `coach.js`'s 26 ranked insights; *challenging emotional decisions* →
  `coach.js:300-312`; *turning mistakes into lessons* → `detectMistakes`' 15 `fix:` strings.
  *Speeding up feedback loops* is the one item with no equivalent, since there is no interactive
  channel (**M109**).
- **The codebase is ahead of Flow AI v1 on the axis he names as its limitation.** Flow AI v1
  *"cannot read your trading data"*; `coach.js` and `correction.js` read the trade database
  directly and compute counterfactual impact from it.
- **His own warnings argue against the naive fix.** Adding an LLM that answers *"should I take
  this trade?"* would be exactly the *"shortcut for certainty"* he forbids, and would replace the
  plan, journal, review and risk management he says must never be outsourced. The defensible
  integration is a channel over the **existing deterministic findings**, not a predictor.
- **`setup.js:315` is literally his "make this decision binary" question**:
  `ok: g.grade !== 'no-trade' && (!levels || levels.entry_status !== 'invalid')`. The binary
  decision exists; **M95** is that it is set one grade too permissively.
- **The no-trade warning he demos is implemented** — `topdown.js` carries **7** `blocks_trade`
  flags, and *"only trade from your point of interest"* is the weight-16 zone check.
- **`0.5 % to 1 % risk per trade`** is restated here, reconfirming Ep 25's sizing band and
  strengthening **M9** (the code's ceiling is `Math.min(2, …)` = 2 %).

---

## Ep 30 — Trading High Impact News (`jl9t6KMoiHg`) — COMPLETE, 3/3 content chunks ✔

`Back To Top` at chunk 2; chunk 3 verified as site chrome, `hasMore:false`.

### The headline rule

> *"my best advice for people who want to trade news is to **just don't trade news**. All right,
> that's it. **Just don't.**"*

> *"**please, for the love of God, do not try to trade news because it is honestly just a
> gamble.**"*

**The reinforcement trap — the same "rewarded for bad behaviour" mechanism as Ep 24:**
> *"if you do make money from trading news, **it's a bad thing** because you pretty much just
> **reinforce the behavior** of trading news. And then you tend to **repeat what you got rewarded
> for in the past**… you now you're **addicted** to trading news. And next time your luck runs
> out, market manipulation takes place, and you lose a lot of money."*

**The mechanics he describes:** price consolidates in a tight range before the release; on the
print *"the **spreads will widen, liquidity will start disappearing**, and price can spike **both
ways**. The market might **sweep both sides** — sell-side liquidity and buy-side liquidity — and
then later price will actually move in a particular direction."* He explicitly rejects the
straddle: *"place a buy stop order here and a sell stop order here… **at end of day, trading the
news is just gamble.**"*

### The reframe

> *"**Technicals show you HOW price move. News tells you WHY price move.**"*

> *"You don't need to be some macro expert… **Your job is simply to know what the news are and
> WHERE THE LANDMINES ARE.**"*

> *"if you ignore fundamentals… you might get caught in a move that **makes no sense through the
> lens of a setup alone**."*

His worked example: clean bullish structure, market shift, higher highs and lows, you are long
with a stop below the lows — then NFP prints and *"the trend direction of the market just reverse
180… you would have been stopped out and you would have **no idea why**."*

### The exact numbers — and why they correct M62

> *"this is where you can set a block window. **The default state is probably like 15 minutes**,
> right? But you can set it to **5 minutes, 10 minutes, 30 minutes, 60 minutes**."*

> *"you can also set the block **behavior**… block trading **before** the high impact news or
> **after**, or block **before and after**."*

> *"**I would recommend you to at least put it at 15 minutes before and after** high impact
> news."*

And a **separate, longer** post-news period:
> *"after the news came out, you want to **wait for the volatility to settle, maybe 30 minutes to
> 60 minutes** after the high impact news comes out. Once the structure start becoming much more
> clearer, this is where you can continue trading."*

**So 15 is a *default*, not a rule, and 5/10/30/60 are all values he sanctions.** The
recommendation is a **floor** — *"at least 15"*. This directly contradicts the conclusion M62
drew from Ep 17 and Ep 19, which is corrected in the ledger below.

### The three options

| Option | What it is | Who it is for |
|---|---|---|
| **A** | **Avoid completely** — no new positions 15 min before/after, then wait 30–60 min for volatility to settle | *"**majority of the traders**… Doesn't matter whether you are beginner, intermediate, or advanced"* |
| **B** | **Only if already in position** — reduce risk, close a portion, or move stop to break even; *"**don't widen stops emotionally**"* | Anyone caught holding through a release |
| **C** | **Trade post-news only** — let the spike happen, then wait for *"a liquidity sweep, structure reclaiming itself, a structure shift, or price returning to a point of interest"* | *"more of an advanced trader… with some experience under the belt"* |

### The what-not-to-do checklist

> *"You shouldn't be placing a random market order because it feels bullish. You shouldn't be
> **sizing up to make it worth it**. You shouldn't **move your stop loss wider because the spread
> is crazy**. And most importantly, you shouldn't **revenge trade if you get wicked out**."*

### Closing lines

> *"**you want to trade the reaction, not the headline.**"* · *"**Professionals don't need to
> trade every day**… They wake up thinking, '**How do I protect capital and wait for clean market
> conditions?**'"* · *"**Longevity is the name of the game.**"* · *"**news isn't your edge. Your
> rules are.**"* · *"we **remove temptation by baking our rules into the trading system** so you
> are not relying on willpower when volatility spikes."*

### Correction to my own ledger: M62 is wrong on the number

M62 concluded *"his window is ±15 to ±30 min — so the code's ±45 is wider than either bound he
names"* and prescribed *"Set the default to 15."* **Ep 30 falsifies that conclusion.** He shows
15 as a **default**, offers **5, 10, 30 and 60** as settings, and recommends *"**at least** 15
minutes before and after."* The code's `newsCheck(symbol, windowMin = 45)` (`index.js:54`) is
configurable via `opts.newsWindowMin` (`:113`) and `?window=` up to 240 (`routes/bots.js:470`),
so **45 sits inside his sanctioned range and satisfies his floor.** Treating "at least 15" as a
ceiling was my error. M62 is rewritten in the ledger: the number is **not** a mismatch; the two
defects that survive are the wording bug (**M4**) and the single-knob collapse (**M110**).

### New items logged from this episode

- **M110 (S3)** — one knob controls two rules of different required length: his pre-news block
  (≥15) and his post-news settle (30–60) are collapsed into a single symmetric `windowMin`.
- **M111 (S3)** — `newsCheck` **fails open**: on a calendar-fetch error it returns
  `blackout: null` (`index.js:76`), silently permitting entry through a news window.

### What this episode proves the code gets RIGHT

- **The news filter is exactly his filter.** `index.js:59-62` restricts to the **traded symbol's
  currencies** via `currenciesOf(symbol)` — *"filter it by like the currencies that's on your
  watch list… **Anything outside of those are just noise**"* — and to **high impact only** via
  `/high/i.test(e.impact)`, matching *"you just want to focus on the **high impact news**."*
- **The window is more configurable than his.** His UI offers 5/10/15/30/60; the code accepts any
  value to 240 through `opts.newsWindowMin` (`index.js:113`) and `?window=` (`routes/bots.js:470`,
  clamped by `Math.min(..., 240)`).
- **The default of 45 satisfies his stated floor** of *"at least 15 minutes before and after."*
- **The landmine map exists.** `index.js:67-70` returns `upcoming` — the next **6 hours** of
  high-impact events for those currencies, top 4, each with `in_minutes` — which is his
  *"daily landmine map"* and the forward half of his calendar view.
- **The blackout message is unambiguous:** *"— high-impact release inside ±{windowMin} min.
  **Stand down until it prints.**"* (`index.js:72`).
- **News is checked at all**, as weight 10 of 155 (`setup.js:162`) with the reason surfaced to
  the user, and `news_blackout` is returned in the payload (`setup.js:403`).

---

## Ep 31 — How to Pass Prop Firm Challenges (`kRYQFKysfis`) — COMPLETE, 4/4 content chunks ✔

`Back To Top` at chunk 3; chunk 4 verified as site chrome, `hasMore:false`.

### The reframe

> *"a lot of traders think prop firm challenges are a test of strategy. **They are not.** A prop
> firm challenge is a **rule-based game**… if you win the game, that doesn't mean that you're a
> good trader. It just means that you really understand the rules of that game."*

> *"They fail because they **break the rules before their edge has enough time to play out**."*

> *"**Prop firm challenges reward the boring traders, not the emotional one.**"*

> *"**the faster you try to win, the more likely you are to break the rules.** So, ironically, the
> longer it takes for you to actually get funded."*

> *"**If you do not build your strategy around these numbers, then you are not really trading the
> challenge. You are just trading your emotions inside someone else's rule book.**"*

> *"**The goal is not to get funded. The goal is to get paid.**"*

### The three stays, and the two numbers that matter most

> *"**Stay small, stay consistent, stay alive.** … Your risk per trade **should not be more than
> 1 % per trade. Should not even be more than 0.5 % per trade.** And you want to **focus on A and
> A+ setups only**."*

This is the **fourth** episode to state the A/A+-only rule (after 17, 25 and 29) and the
**second** to put 0.5 % on the table (after 25).

### The FTMO $200k example — the rules that define the game

| Rule | Value | His words |
|---|---|---|
| **Profit target** | Phase 1 **10 %**, Phase 2 **5 %** | *"not trying to get there in one day… **without breaking the loss rules**"* |
| **Max daily loss** | **5 %** | *"**the one rule that most traders breach**"* — *"the **death line**"* |
| **Max overall loss** | **10 %** | *"Once you cross this line, boom, you're gone."* |
| **Minimum trading days** | **4** | *"even if you hit the target early… you still have to trade three more days"* |
| **Trading period** | unlimited | some firms impose 30/60 days |
| **Profit split** | up to **90 %** | |

His worked failure: lose 2 %, lose 2 % (down 4 %), then *"the urge to make back the money"* →
another 2 % → **max daily loss breached → challenge failed.**

### The guardrail settings he actually recommends

| Setting | His value | Notes |
|---|---|---|
| **Max trades/day** | **3–5** | *"if you're a scalper, you can set it to five… if you're more of an intraday trader, you can just set it to three"* |
| **Max daily loss** | **2 %** (his choice) or 4 % | FTMO's rule is 5 %; **set it below, with a buffer** |
| **Max daily profit** | **1 %** (or 3 %, or 5 %) | *"**completely optional**… But I still recommend you to do it"* |
| **Risk per trade** | **0.5 %** | the guardrail stays at 0.5 %; A+ is a **manual** bump |
| **Trading window** | **your best session, from your own data** | *"based on data, **based on historical performance**"* |
| **News block** | **15 min before and after** | reconfirms Ep 30 |

### The variable-risk mechanism, stated precisely

> *"I like to use a **variable risk method**… I like to risk **0.5 % on a A setup**. But if I see
> a **A+ setup**… I could put it at 1 %."*

> *"But **you don't want to set it over here** [in guardrails]… You can **manually bump it up to
> 1 % for that one trade**."* There is an **unlock button** on the trading panel: *"my **lot size
> literally just doubled**."*

> *"**in your guardrails, just stick to 0.5 %. Your default for risk per trade, it should be
> boring. It should be consistent.**"*

> *"**A+ setups are really those setups where they check off every single box**… when they do
> appear, **they kind of earn the right** to slightly use a little bit more risk. Just 1 %."*

**So the sanctioned variation is grade-keyed, deliberate, per-trade and manual — not streak-keyed
or automatic.** This settles **M82** and confirms the fix it already proposed.

> *"**Remember, consistency beats aggression.** If you start sizing your trades randomly…
> **Sometimes you risk 0.5 % sometimes you risk 2 % sometimes you risk 5 %. Now, your equity
> curve will also become random**… there's like a **direct correlation with your actions being
> random and the results being random**."*

### The five behavioural failure modes and the fix he names for each

| Failure | The Edge Flow fix he names |
|---|---|
| **Revenge trading** — *"the fastest way to blow a challenge"* | max daily loss **hard stop** + Sanctuary |
| **Overtrading** — *"they prioritize **activity** over making money"* | max trades/day + shorter trading window |
| **Holding into high-impact news** | news blocking + economic calendar |
| **Risk spikes after a win** — *"a **silent killer**"* | **fixed risk tiers** + *"we also **track your consistency**"* |
| **Giving back profits** | **profit target stop** + closing the session at the daily goal |

> *"**Most people fail because they rely on willpower, and willpower disappears the moment
> emotions hit.**"* · *"**this is how you cheat at a prop firm challenge, by having guardrails
> that other traders do not have**"* — *"Not by breaking the rules, **the opposite, but by
> ENFORCING them**."*

### New items logged from this episode

- **M112 (S2)** — no trading-window guardrail, although `by_session` already identifies the best
  session, so the input exists and only the enforcement is missing.
- **M113 (S3)** — `max_trades_day` is not user-settable; it is hardcoded at 3 and then overridden
  by a value derived from the user's own overtrading (**M83**).

### What this episode proves the code gets RIGHT

- **"We also track your consistency" is implemented, and as a proper statistic.**
  `performance.js:221` returns `risk_consistency: r2(riskStdPct)`, computed at `:170` as
  `(stdev(risks) / avgRisk) * 100` — the coefficient of variation of risk per trade, which is
  exactly the right measure of *"consistency beats aggression."*
- **The risk floor matches his minimum.** `correction.js:400` clamps with `Math.max(0.25, …)`,
  and he says risk should never go below a quarter percent in practice.
- **Three of his six guardrail numbers already match his stated ranges as schema defaults:**
  `daily_loss_limit_pct DEFAULT 3.0` (Ep 21: *"2–3 %"*), `max_drawdown_pct DEFAULT 10.0`
  (Ep 21: *"5–10 %"*; FTMO: 10 %), and `profit_target_pct DEFAULT 8.0` — a **profit target
  exists**, which is the prop-firm-specific concept a plain journal would not have.
- **`correction.js:386` defaults `max_trades_day: 3`** — precisely his intraday recommendation
  (*"if you're more of an intraday trader, you can just set it to three"*).
- **The guardrail status ladder exists:** `correction.js:474`
  `status: breaches.length ? 'stop' : closed.length >= g.max_trades_day - 1 ? 'caution' : 'clear'`
  — a two-stage warning before the hard stop, which is the right shape (enforcement is **M79**).
- **`by_session` is already computed** (`performance.js:542`), via `sessionOf()` (`:31`) and
  `session_label` (`:74`) — so M112 needs a comparison against a stored window, not new analysis.
- **All five of his behavioural failure modes have detectors:** revenge (`correction.js:165`),
  overtrading (`:180` / the `max_trades_day` breach at `:465`), news (`setup.js:162`), risk
  spikes after wins (`coach.js:550`), and giving back profits (`coach.js:225`).

---

## Ep 32 — Become a Disciplined Trader in 21 Days (`TIpUnwVftgU`) — COMPLETE, 3/3 content chunks ✔

`Back To Top` at chunk 2; chunk 3 verified as site chrome, `hasMore:false`. This was the one
episode never read, and `predict.js:445-446` cites it — so it is read here with that in mind.

### The 21-day challenge

> *"confidence… isn't something that you're born with. **It's a skill**… something that you can
> **earn through reps**. And that's what this 21-day discipline challenge is designed to do. It's
> to force consistent reps under a trading plan with journaling **until execution becomes
> automatic**."*

> *"the reason why I picked 21 days is because **science has shown that it takes around 21 days to
> build a habit**."*

> *"**money is not the goal here**… The goal here is to build the **execution confidence**."*

**The rules:** take **21 trades** fully in accordance with the plan, on demo or (preferably) live.
**Three criteria for every trade:**

1. **aligned with your trade plan**
2. **executed cleanly** — *"you have to follow your risk management rules"*
3. **journal immediately after you close the position**

**Skipping days is explicitly allowed, and forcing trades is the failure mode:**
> *"if you do that, you're going to end up **forcing trades**… On some days, there is **no setup
> that fits your plan**. So, **you're allowed to skip those days**."*

> *"it doesn't have to happen within the 21 days. If it takes you 30 days, 60 days, 50 days,
> that's completely fine."*

**The daily loop:** *"You start your trading session, you **only take A+ setups**, and you execute
with your trade guide and your risk panel, and you **journal immediately** using the instant
journal flow, and you close your session, and you do your **end-of-day review**."* — the
**fifth** episode to state the A+-only rule.

### Mark Douglas's five fundamental truths

1. **Anything can happen** — *"if you don't trade with a stop loss, you're going to lose a lot of
   money when something unexpected actually happens."*
2. **You don't need to know what happens next to make money** — *"A lot of beginners think that
   they have to **predict what price will do next** in order to profit from this market. When in
   reality, **that's not true**… All you need to have is an **edge**. And then over the long term,
   over a **large sample size of trades**, you will end up being profitable."*
3. **Wins and losses are randomly distributed** — *"just because you lost the previous trade
   **does not increase or decrease the likelihood** that you're going to win or lose the next
   trade. **It's all 50/50.**"*
4. **An edge is nothing more than an indication of a higher probability of one thing happening
   over another** — *"it does **not guarantee** that you will win a trade… Just a little bit.
   **Not too much.**"*
5. **Every moment in the market is unique** — *"**History doesn't repeat itself, but it sure as
   hell rhymes**"* — patterns rhyme at different degrees and durations (2008 vs 2020).

### The discipline doctrine — and the line that contradicts the code

> *"**just because there's a random distribution, doesn't mean there's random results. Because
> your discipline is what shapes the equity curve. Discipline turns randomness into a pattern
> over time.**"*

> *"**Randomness of the market, out of your control. Whether you are disciplined… that's within
> your control.**"*

> *"most outcomes **cluster in the middle**, but sooner or later you will get a big win or a big
> loss. **You avoid a big loss by keeping your risk consistent. You capture the big win by
> letting your edge play out.**"*

And the instruction for a losing streak, stated as a three-item list:
> *"your job during a losing streak is simple. **Stay at the same risk, keep your risk
> consistent**, 1 %, 2 %, whatever it is, **stay within your rules**, and keep journaling."*

**`coach.js:549` does the opposite:** at a 3-loss streak it applies `riskMultiplier *= 0.6` with
the reason *"{n} losses in a row → **cut size until a clean win**."* That is a 40 % reduction
during a losing streak, against an explicit *"stay at the same risk."* This upgrades **M82** from
a judgement call to a direct contradiction — and the distinction that makes it precise is that
**stopping** after a streak is sanctioned (Ep 19/21) while **resizing** during one is not.

### Closing

> *"this challenge really isn't about making money in 21 days. It's about **becoming the type of
> trader who makes money for the next 21 years**."*

> *"**Start changing your identity.** You are no longer the unprofitable trader… From today
> onwards… **you are a professional trader. So, think, act, and feel like one.**"*

> *"you will stop being at war with your emotions. **You will finally start trading like a
> system.**"*

### The finding: the code cites this episode for a rule this episode does not contain

`predict.js:444-450` opens its entry-depth section with:

> *"The playlist's refinement loop (**ep. 24/32**) says: **don't take the first touch of the zone
> — wait for price to retrace deeper into it**, so the same structural stop sits closer and a
> 0.5–0.75R win becomes a smaller move."*

**Neither cited episode contains that rule.** Ep 32, read in full above, is entirely the 21-day
challenge and Douglas's five truths — it contains no discussion of entry depth, retracement, zone
midpoints or first touches. Ep 24 is the end-of-day review episode, and a search of its audited
transcript for `deeper`, `retrace`, `first touch`, `midpoint`, `far edge` and `entry depth`
returns **no hits**. The refinement may well be sound, and Ep 18/20 (extreme zone, sniper entry)
are plausible sources — but the citation as written is **false**, and it is the code's own claim
to be implementing the course. That is **M114**.

### New items logged from this episode

- **M114 (S2)** — `predict.js:445` attributes the entry-depth refinement to "ep. 24/32", and
  neither episode contains it.
- **M115 (S3)** — no rep or challenge tracking; the codebase has the three criteria but no
  concept of counting clean reps toward a goal.

### What this episode proves the code gets RIGHT

- **All three of the challenge's criteria are captured.** Plan alignment → the `adherence` column
  on `trades`; clean execution → `rule_checks(trade_id, label, passed)`; journal immediately →
  `journal_entries` with `UNIQUE(user_id, entry_date)`. The challenge could be scored from data
  the schema already holds — only the counting is missing (**M115**).
- **`predict.js` measures an edge rather than claiming to foresee the future, which is exactly
  truth #4 and not a violation of truth #2.** Its own docstring is careful: *"Two honest
  predictions, both **measured rather than asserted**"* — the entry model is replayed
  **walk-forward** (*"each decision only sees candles before it"*) and outcomes train *"a small
  logistic model whose features are exactly the confluence checklist."* That is an **estimate of
  the higher probability** Douglas describes, not a claim to know what happens next. Read
  uncharitably a prediction bot looks like the beginner's error; read against truth #4 it is the
  quantification of an edge, and the code labels it honestly.
- **The sanctioned half of the losing-streak rule is implemented.** `correction.js:466` breaches
  at `max_consecutive_losses` and `:477` prescribes the cooldown — a **stop**, which Ep 19/21
  require and Ep 32 does not forbid. Only the **resize** at `coach.js:549` is the contradiction.
- **`risk_consistency` is the metric for his central claim.** *"Discipline turns randomness into
  a pattern over time"* is measurable as the dispersion of risk per trade, and
  `performance.js:221` returns exactly that (`(stdev / avg) × 100`).

---

## Ep 33 — Graduation: Lessons I Wish I Knew Earlier (`3rtET_1E040`) — COMPLETE, 3/3 ✔

`Back To Top` at chunk 2, `hasMore:false`. **This episode contains no new strategy rules.** It is
a graduation/motivation episode plus the pitch for 1% Club and Edge Flow. **No new ledger items
are logged**, and none should be inferred from it — recording that explicitly is the point, so
that a later reader does not mistake the absence of findings for an episode that was skipped.

### What it says

> *"the market does not pay you for what you know. **It pays you for what you can execute
> consistently.**"*

> *"**your growth is going to come less from learning, more theory, and instead is going to come
> from you applying what you already know.**"*

> *"**The edge is not in endlessly collecting information. The edge is in executing simple things
> well over and over again.**"*

> Bruce Lee, quoted: *"I don't fear the man who knows a thousand kicks. I fear the man who have
> practiced a kick a thousand times."*

> *"**confidence comes from evidence**… how you build evidence is by being **competent**. And
> the only way to become competent is to put in the **reps**."*

> *"I don't want you guys to be **jumping to a new strategy** next week. I don't want you guys to
> be **chasing another ICT concept because you got bored**. I don't want you guys to continue to
> **consume endless amount of content without practicing**."*

> *"**do not rush the process**… the more you try to rush the process, the longer it's going to
> take."* · *"do the **boring tasks** for a extended period of time"* · *"**if you show up
> every single day, you will never ever miss a lucky day.**"*

> *"**the market will always reward discipline, patience, and consistency.**"* · *"**The market
> is simply a reflection of you. It's a mirror.** So, if you do not like your results, chances are
> you need to change the person in the mirror."*

> *"**how long it's going to take for you to succeed… that is outside of your control. What is
> within your control is how you show up every single day.**"*

### What it reinforces, mapped to existing ledger items

| Ep 33 statement | Existing item |
|---|---|
| *"put in the **reps**"*, *"confidence comes from **evidence**"* | **M115** (rep counting), **M103** (30–50-trade evidence threshold) |
| *"don't **jump to a new strategy** next week"* | **M102** (strategy edits destroy the pre/post evidence), Ep 27's re-test rule |
| *"do the **boring tasks**"* | Ep 25's *"**boring pays**"*, **M95** (the A/B gate) |
| *"the market is a **mirror**"* | Ep 28, **M105** (identity statement) |
| *"within your control is **how you show up**"* | **M57** (compliance rate), Ep 23's execution grading |

### The one genuinely useful thing: an independent confirmation of Edge Flow's scope

His closing feature list is a **product-scope cross-check** on features this codebase lacks:

> *"you can trade with my **guardrails**, which is pretty much the stuff that **prevents you from
> blowing up**. You can **journal** your trade. You can **analyze your data, your metrics** on
> your trading performance. You can actually have **Flow AI**… You can also do your
> **meditation** on there… You can have your own **notebook**. You can analyze **economic
> news** on there."*

Every one of those maps to a ledger item already raised on strategy grounds — guardrails
(**M79**), Flow AI (**M109**), meditation/Sanctuary (**M108**), notebook (**M99**), economic news
(**M62**/**M110**/**M111**) — and journal plus metrics are implemented. **This matters for the
fairness notes attached to those items:** several were logged at low severity on the grounds that
they might be Edge Flow product features outside the scope of a self-hosted journal. His own list
confirms they are parts of the same intended system, which does not raise their severity (a
journal is still not obliged to ship a meditation timer) but does remove the argument that they
are unrelated to the method.

### Verdict

**No mismatches, no changes required.** Ep 33 adds motivation, restates the reps-and-consistency
doctrine already captured from Ep 25/27/32, and supplies the scope confirmation above.

---

# BONUS AND TOOL VIDEOS — status and findings

The 47-item playlist is **34 numbered episodes (Ep 0–33, all complete)** plus **6 bonus** and
**7 EdgeFlo tool** videos. Depth achieved this pass is recorded honestly per video below; the 7
unread ones are listed with IDs so nothing is silently dropped.

| Video | ID | Depth | Relevance |
|---|---|---|---|
| Combine Liquidity Sweeps, OBs & FVGs for Sniper Entries | `MypSrcfiqtM` | **3/3 content chunks** | **High** — settles the OB method and the FVG-in-OB rule |
| How to Set Up Your Guardrails in EdgeFlo | `ixmTrvUB1Ks` | **2/2** | **High** — the definitive guardrail spec |
| How to Use EdgeScore | `NsK2uYiqPlY` | 2/3 | **High** — the sample-size gate, verbatim |
| Time Management (Notebook Tutorial) | `umvflPxb0Es` | 1/3 | Medium — confirms the notebook's scope |
| BEST Gold Scalping Strategy | `en8RMFRqSME` | 1/5 | Medium — gold-specific handling |
| My Daily Trading Routine | `CX8S22b1xqg` | 1/6 | Medium — confirms pre-market enforcement |
| **NOT READ** — How I Personally Trade (LIVE) | `iKRW0G6yPmM` | 0 | unknown |
| **NOT READ** — 10 Years of Trading Knowledge in 60 Min | `cFzxyGRtAis` | 0 | likely recap |
| **NOT READ** — reality transurfing / $1M at 24 | `kJWmeSLfP64` | 0 | likely psychology |
| **NOT READ** — Introducing EdgeFlo | `EsVHKs24qBI` | 0 | product intro |
| **NOT READ** — What is EdgeFlo? | `vU16QHmX3x4` | 0 | product intro |
| **NOT READ** — How To Execute Trades Cleanly | `3_QR4XFVbKE` | 0 | likely relevant |
| **NOT READ** — Review Your Trading Metrics | `AVS6QneKmAA` | 0 | likely relevant |

## Sniper Entries (`MypSrcfiqtM`) — the single most useful video for this audit

**The three concepts as one model:**
> *"**The liquidity sweep is the trap. The order block is the zone. The fair value gap or
> imbalance is the entry.** That's how I stop looking at them as three separate concepts and
> start using them as **one complete entry model**."*

**The five steps:** (1) identify liquidity — equal highs/lows, swing highs/lows, resting
liquidity; (2) **wait** for the sweep — *"you don't want to be doing anything until you see
price clearly run through a certain level and then **rejects it or displaces from it**"*;
(3) mark the order block; (4) mark the FVG; (5) wait for the re-entry.

**THE OB METHOD — and the rule that settles the open question.** He gives **two** methods:
the **range** method (*"the entire range before the impulsive move"*, high of the origin candle
to its low) and the refined **origin-candle** method (*"the candle that resulted in this
reversal… this becomes the **true origin of the displacement**"*). Then:
> *"**I will highly advise you to just stick to one method.** If you prefer the range method,
> stick to it. **Don't use the candlestick method sometimes and then the range method other
> times — you want to stick to one mechanical approach.**"*

**THE FVG-IN-OB RULE:**
> *"**ideally, I want the fair value gap to be WITHIN the order block itself**… you can never
> ever really go wrong if you actually enter at the fair value gap that is within the order
> block. But **try not to enter at like a random fair value gap that is in the middle of
> nowhere.**"*

**THE FVG-ABSENT FALLBACK:**
> *"Ideally, we want to enter upon the mitigation of a fair value gap that is **within or near
> the order block**. But **if there's no fair value gap that's present, then you can just enter
> upon the mitigation of the order block itself.**"*

**THE PROTECTED HIGH — defined explicitly (this is M76):**
> *"instead of placing a stop loss above the order block itself… place your stop loss **above
> the candlestick in which you enter the trade on**… **why**? It's because price has
> essentially **swept liquidity above these equal highs** on the left hand side, giving us a
> **PROTECTED HIGH**. And this is where we know for a fact that **this is the price point which
> invalidates the trade idea**."*
> *"ensure that when you're doing that **it must be some form of high that have swept liquidity
> because that is a protected high**"*

**THE QUALITY FILTER:**
> *"**Not every liquidity sweep is worth trading. Not every order block is valid and not every
> fair value gap should be used as an entry.**"* · *"I want the order block to be the **true
> origin** of the move, **not just some random candlestick in the middle of a messy
> consolidation**."* · *"**trading is not about spotting more patterns. It's about
> filtering.** The goal is not to find the most setups. The goal is to find the **cleanest
> ones**. **Quality over quantity.**"*

**Stop and target:** stop below the FVG/POI (or above the entry candle at a protected high),
**TP at 2R**. Confirmed cross-asset — *"whether you trade **futures, stocks, indices or
crypto**, the logic is exactly the same"* — demonstrated on EUR/USD and **NASDAQ futures**.

**Code verdict — strongly faithful, and it closes an open question:**
- `bots/smc.js:187-195` implements the **origin-candle** method: it walks back from the displacement
  bar (up to 6 bars) for the **last opposite-colour candle**, then takes `top = ob.h,
  bottom = ob.l` — **high to low of that single candle**. That is his refined method exactly,
  and the code uses **one method consistently**, which is precisely what he instructs.
- **The FVG-in-OB rule is implemented:** `setup.js:110` *"prefer a fresh, strong OB with an
  unfilled FVG overlapping or nested"*, surfaced at `:126` as *", nested FVG"*, and scored at
  `:128` as `add('nested', 'Zone + imbalance overlap (confluence)', true, 8, 'The order block
  contains an unfilled FVG — two reasons for price to react at the same price.')`.
- **The FVG-absent fallback is supported:** `setup.js:126` accepts a zone of `kind ===
  'order_block'` **or** `'FVG'`, so entering on OB mitigation alone is allowed.
- **Nuance, not a mismatch:** his origin candle is the *reversal* candle (he points at a doji
  after consolidation); the code takes the last opposite-colour bar within 6. Close, mechanical,
  and defensible — but not identical.
- **"Protected high" remains absent** — `grep -rni protected src/` returns **one** hit,
  `coach.js:231`, and it means *"the runners are protected"* (a runner held at break-even), **not**
  the swept-liquidity invalidation level. **M76 stands**, now with his exact definition.

## Guardrails (`ixmTrvUB1Ks`) — the definitive spec

| Guardrail | His recommendation | Notes |
|---|---|---|
| Max trades/day | **5** default; **3** if newer/impulsive; he uses **2** | *"enough attempts to take A+ setups but low enough to block revenge spirals"* |
| Max daily loss | **2 %** (3 % if aggressive) | *"**the most important guardrail in the entire app**"*; entered as a **monetary amount** |
| Max daily profit | **5 %** (or 3 %) | optional |
| Fixed risk per trade | **1 %** | *"the **discipline engine**"*; lot size auto-adjusts; unlockable to size up |
| Time-based restriction | optional | *"a **cheat code** if you struggle with impulse trades"* |

**REALIZED P&L ONLY — a precise mechanical rule:**
> *"both the max daily loss and the max daily profit is using your **realized P&L**… **It's
> not based on floating P&L.** If I set my max daily loss at $20, and I open a trade, and I go
> to a drawdown of −40, **the guardrail will not get triggered**. The guardrail will only get
> triggered **after I close the losing position**."*

**The code matches this exactly:** `correction.js` `dailyState` filters `t.status === 'closed'`
and sums `net_pnl` over closed trades only. **Faithful.**

**THE OVERRIDE MECHANISM — settles M80:**
> *"we literally block you from trading by **graying out the trade button**… if you click on
> it, you have the ability to **override** your guardrails. But, **we will require you to type in
> the reason**, and then whatever reason you type in, **it'll be documented into your trading
> journal**."*
> *"when you go into your trading journal and click on the day, you will be able to see the
> **guardrail violations**. **Everything will be documented in here.**"*
> *"we believe in **free will**… we cannot just block you from trading completely, because
> that kind of **goes against regulations**."* · *"**just increasing the friction**"*

**THE TIME WINDOW — confirms M112 exactly:**
> *"you can select a **window** in which you want to be trading within… if you try to trade
> outside of this window, **the guardrail will prevent you from doing so**."* · *"just because
> the Forex market is open 24 hours a day, doesn't mean you should be trading 24 hours a day.
> For most traders, **less screen time equal better trades**."*

## EdgeScore (`NsK2uYiqPlY`) — the sample-size gate, verbatim

> *"it's calculated using your **latest 100 closed positions**… I call this the **rule of
> 100**."* · *"Once you pass your 100th trade, your **oldest trades start dropping off**…
> your score will always reflect **who you are right now**, not who you were months ago."*

**The three-tier gate, stated exactly:**
> *"**From 0 to 29 trades**… you will **not be able to see your edge score**. This thing will
> be **hidden from you**, because we don't have enough data."*
> *"**30 to 99 trades**… there's a **provisional score**… it's not an accurate score."*
> *"Once you reach **100 trades**… you unlock your **real** edge score."*

**Three criteria:** **Performance** (*"is your edge mathematically profitable"* — expectancy,
profit factor, sample-size confidence) · **Discipline** (*"we track your **guardrail
violations**… **if you break any one of those rules, you just lose points**"*) ·
**Consistency** (**average risk deviation** from baseline + **extreme risk events**, including
sizing up *"**after a losing streak**"*).

**The headline case — M91 verbatim:** *"I have made **$2.5 million** but it shows that I'm
**at risk**… it's probably because I **didn't follow the guardrails**."*

**Tiers:** at risk → developing → consistent → elite (*"progress markers… **not
labels**"*). **On 100:** *"don't obsess over hitting 100, just focus on **moving up one tier at
a time by fixing your biggest leak**."* **The precise sizing rule:** *"**If I size up above my
baseline risk per trade, then it must be a A+ setup.**"* And: *"**a good strategy with random
risk will still produce random results.**"*

**Code verdict:** `correction.js:552` computes `behaviourScore = max(0, min(100, 100 - penalties))`
with a **five-tier** `behavior_grade` at `:560` (Disciplined ≥ 85, Solid ≥ 70, Leaking
≥ 55, Undisciplined ≥ 40, Critical). The **shape matches** — a penalty-based composite
with named tiers. **What is missing is the sample gate:** penalties come from `detectMistakes`,
which fires at `n ≥ 5`, so a grade is published from five trades with no hidden/provisional
state and no caveat. That is **M103** at the composite level, and EdgeScore supplies the exact
thresholds and UX to fix it.

## Notebook (`umvflPxb0Es`) and Daily Routine (`CX8S22b1xqg`) — partial

**The notebook has eight templates in two categories:** four **performance review** (Ep 26) and
four **productivity** — **goal tracker, daily planner, daily routine checklist, habit
tracker**. The goal tracker decomposes **yearly → quarterly → monthly**, each with *why it
matters*, a **deadline** (*"a goal without a deadline is simply a dream"*) and a status.

**Code verdict — the goal hierarchy is implemented correctly.** `db.js` `goals` carries
`period TEXT DEFAULT 'month'  -- month | quarter | year`, and `api.js:613-615` handles all
three: `month` → first of month, `quarter` → first of quarter, and the `else` branch →
`new Date(now.getFullYear(), 0, 1)`, i.e. **1 January**. **I checked this before claiming a bug
and there is none.** No `week` period exists, which the daily planner/habit tracker would use.

**The pre-market routine is enforced, with a specific mechanism:**
> *"in Edge Flow there's this cool feature which literally **enforces your pre-market
> routine**… **if you don't do your pre-market routine we will advise you not to trade**."*
> *"it will show you this banner… **'Ready to trade today? Complete your pre-market routine
> before execution'**… this thing **pops up 30 minutes to 45 minutes before** I start
> trading… **it always pops up at the same time**."*

> *"**the money is not made in clicking the buy and sell button. It's made in the preparation
> and the reflection.**"* · *"**A fragmented trader is an unprofitable trader.**"*

Step 1 is **meditation, 15 minutes, "a non-negotiable"** — which raises the standing of
**M108**: the meditation is not optional garnish but the first enforced step of the routine.

## Gold scalping (`en8RMFRqSME`) — partial

> *"**Gold is not like every other market. Gold moves super duper fast**… a lot of traders
> struggle with gold. **They treat it just like a normal Forex pair** and then they enter way too
> late or hold a trade for way too long or **use stop losses that are way too tight**."*
> *"**Gold respects liquidity very well.**"* · *"**Get in fast, get out faster.**"*

**Step 1 requires 1h and 15m to be ALIGNED:** *"if the 1 hour time frame is bullish but the 15
minute is bearish, now we got a **misalignment**… which will give you **low probability
setups**."* He also uses the vocabulary **strong low / weak low** — which is **M21**.

## New item logged from this pass

- **M116 (S2)** — the composite behaviour score has no sample-size gate, where EdgeScore
  hides below 30 trades, marks 30–99 provisional, and unlocks at 100.
