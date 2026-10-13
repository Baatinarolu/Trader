# M112 — the trading window: a hard block, not a penalty

**Ledger item:** M112 (`analysis/MISMATCHES.md`, S2, Ep 31 + `ixmTrvUB1Ks`).
**Parent:** the actual `4791809` M111 release tree (147 files), byte-identical to its frozen guard
(`analysis/evidence/m112/parent-source.json`). Nothing about the parent is asserted from memory: the
migration probe spawns its **own** code on the same database.
**Cohort:** **181/0 across 6 probes**. **Ledger after:** 132 / **107** done / 2 partial / 23 TODO.

## 1. What was missing

The episode names the guardrail and where it must come from:

> *"For a trading window, you only want to set your **best session window** … **on data, based on
> historical performance**, what is the time window that you tend to perform the best in?"*

and his own answer is a window on a named clock:

> *"**based on my data**, I figured out that my trades tend to work out really really well during the
> **London Q-Zone** … **7:00 a.m. UTC to around 10:00 a.m. UTC**."*

He uses it as an overtrading control (*"Edge Flow fixes that with max trades per day **and a shorter
trading window**. So, you're only trading your best hours."*), and `ixmTrvUB1Ks` settles the shape:

> *"you can select a **window** in which you want to be trading within … if you try to trade outside
> of this window, **the guardrail will prevent you from doing so**."*

with the rationale that closes the question of penalty versus prevention: *"just because the Forex
market is open 24 hours a day, doesn't mean you should be trading 24 hours a day. For most traders,
**less screen time equal better trades**"* — and he calls it *"a **cheat code** if you struggle with
impulse trades."*

The codebase had **no such setting**: `grep -rniE 'trading_window|session_window|window_start|window_end' src/`
returned 0 hits, and the only session-shaped rule that existed was a **weight-8 scored item** in
`setup.js` — trading outside the best session cost 5.2 points and still graded A+.

## 2. The rule, and the four states it refuses to collapse

`src/trading-window.js` (`trading-window-v1`) is a **leaf**, like `news-window.js`: no requires, no
environment, no filesystem, no database and no clock of its own (`nowMs` is passed in), so the rule
is the file and it answers identically when copied out of the tree. It owns four states:

| state | meaning | blocks? |
|---|---|---|
| `unset` | no window selected | **no** — explicitly nothing is blocked on one |
| `inside` | the trader's local time is within `[start, end)` | no — a boundary, not a permission |
| `outside` | it is not | **yes**, with the window, the zone, the local time and the minutes until it opens |
| `unavailable` | the stored window could not be read honestly | **yes**, with one repair sentence |

`unset` is **not** `outside` (collapsing them would invent a boundary the trader never chose) and
`unavailable` is **not** `inside` (collapsing them would open the gate they asked to close). The
boundaries are **half-open on purpose**: the start minute is inside, the end minute is outside, and a
start later than the end runs through midnight as one window (an Asia session that begins at 22:00).
The pair is **both sides or neither**, an equal pair is refused as degenerate rather than read as
"all day", the clock is strict `HH:MM` (`7:00`, `0700`, `24:00` and booleans are refusals, not
guesses), and the zone must be an explicit **IANA** name — offsets such as `+01:00` follow no
daylight-saving rule and would move a hard boundary twice a year, so they are refused.

**A hard boundary does not move when another setting does.** The window is authored in the account's
owned routine timezone. If that timezone is later changed, the window reports `unavailable` naming
**both** clocks and keeps blocking until the trader re-saves it — measured end to end: the same
`POST /trades` that would otherwise be admitted is refused with the window's rule after the zone
change.

## 3. The storage: four additive columns, and no window invented for anyone

`accounts` gains `window_start`, `window_end`, `window_timezone` and `window_source`, **NULL by
default**, declared with the schema's own CHECKs — the format (`GLOB '[0-2][0-9]:[0-5][0-9]'`), hour
≤ 23, `end<>start`, a zone required with the pair and only with the pair, and a source inside
`manual`/`from_session_history`. The migration declares the same text, so an upgraded desk and a
fresh desk carry the same constraint: measured column by column (`PRAGMA table_info`), constraint by
constraint (the balanced-paren CHECK text of each column), with the **position** difference recorded
rather than hidden (an inherited table appends the four last).

An upgrade of the actual M111 release adds **exactly** those four columns: every inherited fact
hash-identical (accounts, trades, users, guardrail state), the routine settings untouched, and all
four columns NULL on the existing desk — **no window is invented for a desk that never had one**, so
its state is `unset` and it blocks nothing. The parent's own code still reads the upgraded file
afterwards.

## 4. The derived default is a suggestion the trader accepts

`GET /api/bots/window` returns the trader's best recorded `by_session` bucket (the same read
`performance.js` already computed) and, inside it, the **circular middle 50 %** of their own recorded
entry **hours**, rounded outward to whole hours — circular because recorded hours live on a clock, so
23:00 and 01:00 are neighbours and a session around midnight is ONE band. It is:

* **labelled** `from_session_history` with a `basis` that says it describes recorded journal outcomes
  and is *not a prediction, not a market edge and not a permission*;
* **refused entirely below the course's own 30-trade review floor** (`below_review_floor`) — withheld
  rather than presented as a smaller window, and `PUT … accept_suggestion` is refused with that
  reason, so a below-floor band cannot become a boundary by one click;
* **refused when the entries are spread around the clock** (`no_single_band`) rather than stretched
  into a band the data does not support;
* **never applied by the server**: `applied:false` always. The route records `from_session_history`
  **only** when the submitted pair is exactly the candidate the account derives at that moment;
  anything else the trader types is `manual`, and an explicit clear writes **four NULLs**.

## 5. How it blocks

The window is merged into the desk's personal state in the same shape `state-gate.js` uses, so the
refusal travels through code that was already measured: `Guards.applyToSetups`, the **entry-admission
path** (`POST /trades`), the Now playlist and every scan row. It **adds** a stop and never removes
one: an existing `pre_market_routine` stop survives with the window's breach appended, and the window
is the stricter rule — a routine stop that could be overridden with a stated reason becomes
non-overridable (`can_override:false`) once the boundary is crossed. `setup.js` carries the refusal
as a **veto** beside the other non-negotiables (`no_trade`), with `setups.filters.trading_window`
(states and tokens, `not_consulted` for a caller that read no window) beside the killzone filter, and
the engine's test rows, weights, grades and candidates are **byte-identical** with and without the
window — measured, not asserted: the weight-8 session row, the risk guardrail, every cap, clock,
target, sample floor and grade scale is untouched by this milestone.

**The playlist needed no new line, and that is measured rather than assumed.** M111 had to add a
guard to `src/bots/now.js` because the news state was *not* part of the object the playlist reads.
This milestone's merge lands on `daily`, which the playlist already receives, so it publishes the
window's own stop (`execution_permission.state = 'trading_window'`, `allowed:false`,
`can_override:false`), pushes exactly one block-level guard carrying the module's sentence, and
withholds `full_risk` — asserted on the same input with the clock inside versus outside, plus the
`unset` case where the playlist is measurably what it was. `src/bots/now.js` itself is unchanged and
stays inside the protected set.

## 6. What was measured

| arm | result |
|---|---|
| delivered tree, 6 probes | **181/0** — pure 36, engine 18, consumers 32, api 49, migration 16, ui 30 |
| the actual `4791809` parent | **0/1 on all six** — the module, the columns and the endpoint do not exist there; that absence IS the control |
| pre-hardening runtime (rule + columns, nothing enforcing) | engine **4/14** · consumers **7/25** · api **7/42** · ui **3/27**, every failing line naming the missing enforcement rather than a crash |
| M111 cohort re-run | **152/2** — the two failures are the M111 migration probe's own frozen "M111 adds no schema object" assertions, retained by name |
| M110 cohort re-run | **249/9** — the five declared M111-closure negatives plus the four assertions that freeze the M110-era `accounts` shape (two columns appended last) |
| older cohorts | m109 **166/2** · m108 **257/2** · m107 **230/2** · m106 **316/2** · m105 **140/2**, each keeping its own declared schema negatives |
| inherited arms re-run | RAW **596/156** · DECLARED **824/4** · live-provider **70/1** — identical |
| smoke (`scripts/smoke-test.js`, shipped) | **21/21 views, 0 style failures, 0 console errors** on the delivered tree AND on the parent, at the same sample |
| delivery | four stage patches replayed forward and reverse with 0 byte differences, 147 sources, ZIP rebuilt from the saved patches byte-identical |
| ledger | 132 / **107** done / 2 partial / 23 TODO / 0 no-action / 8 groups |

The hard block is measured where it matters: with a **completed pre-market routine** (through the
app's own endpoints) and the window outside, `POST /trades` answers `409 guardrail_stop` with
`trading_window_outside` in the breach list, `permission {allowed:false, can_override:false}`, **no
trade row written** and a `blocked_attempt` audit event whose snapshot carries the window; the
*identical* entry is admitted the moment the clock is inside the window, and again after an explicit
clear. `/bots/guardrails` stays a **200** with the stop in it — a blocked desk is a readable state,
not a broken service. An unreadable stored window (a zone the runtime cannot resolve) also blocks and
is **never repaired behind the trader's back**: the stored row is exactly what was stored, and the
repair is the one the sentence names. Both controls are run with the **unchanged** probes, and every
fault line is asserted from both texts: the assertion that fails on the pre-hardening tree is the
same assertion that answers `ok` here.

## 7. What this does not claim

No 70 % win-rate, causal, predictive, broker, human, mental-state, provider or production claim; no
claim that an hour will be profitable; nothing retuned (no weight, cap, clock, floor, target, grade
or risk setting); no fill padding; no sample-floor softening; unknown/legacy/imported inputs stay
explicitly separate (`unset`, `unavailable`, `not_consulted`) rather than being defaulted into a
window. The sandbox has no market or broker network: the engine and consumer probes use their own
synthetic series, the routine is completed through the app's own endpoints, and the UI probe is a
jsdom structural check, not a pixel proof.

## 8. Delivery

`analysis/build-m112-trading-window-artifacts.py` re-derives the four stage trees and asserts every
frozen guard in both directions, stacks the delivered tree onto the pristine `tradingpro-main.zip`
(pin `7a511cab…`) and writes `tradingpro-fixed.zip` (**147 sources**) with its SHA companion in
`analysis/evidence/m112/archive-sha256.json` — the companion is the record of the exact bytes, and
the replay build above is what proves those bytes are reproducible from the saved patches. Stages:
**policy** (the rule + the four columns) → **engine** (the merge, the veto, the ctx) → **consumers**
(the endpoints, the derivation, the two views) → **documentation**, each with its own patch
(`analysis/patches/m112-trading-window-*.patch`) and source guard, plus the pristine cumulative
`applied-so-far.patch`. Running the builder twice in replay-only mode rebuilds every stage from the
saved patches and reproduces the delivered ZIP byte-for-byte.

**One correction carried in with this milestone:** M111's README reported its own cohort as
`158/0` with `portable 15`; the measured M111 cohort was **154/0** with **portable 10** (the numbers
in `analysis/evidence/m111/feature-summary.json`). The wrong line shipped inside the M111 archive and
is corrected here, with the M111 release's own measurement attributed to the M111 tree so the text
cannot be read as a claim about this one.
