# M30 — the two zone methods: one geometry hardcoded, now a chosen one that every read names

M30 is a **fix** with two halves, and the ledger's own wording is *"Offer both zone methods as a preset
choice (he advises testing both over 100 trades), and add a small strength term for `tests >= 2`."*

Ep 7 gives **two** ways to draw the zone, not one. The **pivot method** takes the single opposite candle
before the displacement leg. The **range method** takes the whole consolidation high-to-low — the same
consolidation the trader is already looking at when he marks the box by hand. He states the cost of
shipping only the first one himself: with it, *"you would have missed this entry … price did not mitigate
your zone"*. And he asks for the second one to be **measured**, not assumed: test both over the trader's
own 100 trades.

## 1. What was missing

* **One geometry, hardcoded.** `findOrderBlocks()` drew the pivot candle's body, on every read, with no
  value anywhere that named the geometry and no path by which the trader could ask for the other one.
* **So the second method could not even be compared.** His instruction is an experiment — run both, look
  at your own 100 trades — and an experiment with one arm is not an experiment (the same gap M56 closed
  for the written plan, one layer down).
* **A scoring defect on the same objects.** `strength` carried `tests === 0 ? 0.15 : 0`, so a zone that
  price had respected **once** scored nothing while a zone nobody had tested scored a bonus. Ep 7 says the
  opposite: *"price respected multiple times … this is a very strong supply zone"*. A fresh zone deserves
  its bonus — and so does a proven one, which is the *"small strength term for `tests >= 2`"* the finding
  names.

## 2. The geometry, and what it is allowed to claim

`consolidationBase()` walks **backwards from the same pivot candle** the pivot method anchors on, over
**closed** bars, and stops on three closed rules (each one reported, never silent):

| stop | rule |
|---|---|
| `displacement` | a bar that is a leg is not part of a base: `range >= 1.2 × ATR` and `body/range >= 0.55` |
| `price_left_the_base` | a bar that does not overlap the envelope built so far — price left, so the base is finished |
| `width_cap` | `3 × ATR`, **reported** as `capped: true` rather than truncating quietly |
| `start_of_history` | the walk reached the first bar the read was given |

A walk shorter than two bars is not a consolidation, and the zone then stays **pivot** with its reason
(`no_consolidation`, `no_pivot_candle`, `no_atr`). A successful walk returns
`{ok, from_i, from_t, to_i, bars, high, low, width, width_atr, capped, stopped, limits}`; the zone takes
`top = base.high` / `bottom = base.low` with its pivot body kept for reference, carries
`zone_method` + `base:{…,applied}`, and the count of zones that could **not** be walked is published as
`base_fallbacks` — a fallback is named, never silent.

**The vocabulary is closed, and so is the provenance of the choice:**

| token | meaning |
|---|---|
| `pivot` | the single candle — **the default, unchanged** |
| `range` | the whole consolidation high-to-low |

| `source` | where the method came from |
|---|---|
| `request` | this call's own `?zone_method=` |
| `settings` | the trader's saved choice in `users.settings.zone_method` |
| `unspecified` | a caller inside the app handed a method with no provenance — saying `default` there would be a claim the engine cannot make |
| `default` | nobody chose |

Only the exact value `range` switches geometry. Anything else runs pivot and the read **reports it**:
`setups.filters.zone_method.error` carries *"… is not a zone method this app can plot — the pivot method
was used. Expected one of: pivot, range."* On the way **in**, `PUT /settings {zone_method}` refuses a
value outside the vocabulary with `400 zone_method_invalid` — a choice that silently did not apply would
leave the Settings screen naming one geometry while every zone was drawn in the other, which is the class
of fault this audit exists for.

## 3. Delivery shape

| file | what it carries |
|---|---|
| `src/bots/smc.js` | `ZONE_METHODS` / `ZONE_METHOD_SOURCES` / `ZONE_METHOD_DEFAULT`, `zoneMethodOf()`, `consolidationBase()`, `BASE_MAX_BARS=12` / `BASE_MAX_ATR=3`; zones carry `zone_method` + `base`; the read reports `zone_method`, `_requested`, `_source`, `_applied`, `_fallback`; the `tests >= 2` strength term beside the fresh-zone one |
| `src/bots/setup.js` | the method rides the analysis into `buildSetups`, and the payload publishes `filters.zone_method` = `{method, requested, source, sources, vocabulary, read, applied_zones, base_fallbacks, error, note}` |
| `src/bots/momentum.js` | the method travels with the two `Momentum.series(…)` calls, so the momentum layer is read on the same geometry as the zones |
| `src/bots/index.js` | the method is resolved once per read and cut into `analyse()` and the scan; **the analyse and chart payloads both name the geometry they shipped zones for** |
| `src/routes/bots.js` | `zoneMethodFor()` / `zoneMethodOf()` — query wins, else the stored choice, else pivot — wired into all six read sites, and the TradingView alert verdict carries `zone_method` beside `plan_gate` |
| `src/routes/api.js` | `PUT /settings` validates `zone_method` against the module's own vocabulary (`zone_method_invalid`) and clears on empty |
| `public/js/views/settings.js` | the picker (`select#s-zone`, empty = the pivot default) with the trade-off in words and saved with the rest of the preferences |
| `public/js/views/bots.js` | the zone note beside the plan note: the method in use, where it came from, the walk's stop reason, and *"N could not be walked and stayed pivot"* |
| `docs/API.md` · `docs/NOT-IMPLEMENTED.md` · `docs/PLAYLIST-CURRICULUM.md` | the payload contract, the honesty row (not measured to be better), and Ep 7's row naming both methods |

**No new file, no new schema object, no write on a read.** The choice lives in the settings JSON that
already exists; the delivered tree is 164 files against the parent's 164.

## 4. What was measured

| arm | result |
|---|---|
| feature (5 probes) | **112/0** — pure 27 · engine 14 · api 29 · ui 20 · migration 22 |
| control probe, delivered / parent / module-only | **11/0** in each of the three modes |
| delivered tree with **no** choice made | candidates byte-identical to the committed parent's, no candidate key added, no zone moved |
| parent arm (committed 27fbb2a) | pure 0/1 · engine 0/1 · api 0/1 · ui 0/1 · migration 0/1 — the module is absent and the absence IS the control (the opener fails by name, never by crash) |
| module-only arm (the vocabulary and the walk exist, nothing consults them) | pure **27/0**, control **11/0** — and engine 8/3, api 3/2, migration 15/7, ui 1/1, which is the wiring that is missing, named assertion by assertion |
| prior cohorts re-run on this tree | M56 **160/0** + control 34/0 · M115 **116/0** · M13/M65 **94/0** · M112 **181/0** |

The engine probe is the one that separates a vocabulary from a choice. On **real** synthetic series and
real setups it measures: with nothing chosen the delivered candidates are **byte-identical to the parent's**
(so shipping this cannot move a trader who changes nothing); the range box is a **superset** of the pivot
box for every paired origin, keyed by the bar the zone came from rather than by array position; the wider
zone never moves the stop **closer** to entry; a bad method runs pivot and carries the sentence; a sentinel
read reports `read:false, applied_zones:0` instead of attributing zones to a read that never reached the
zone stage; and `verdict`/`filters` keep their shape across both methods.

The api probe drives the whole thing through the app's own routes: `?zone_method=range` on analyse, chart,
scan and save; a stored choice consulted as `source:'settings'`; the bad value refused `400
zone_method_invalid`; the chart's `smc` slice naming the geometry; and the read-only proof — neither read
writes a row.

**The pullback the pivot method misses is measured, not quoted.** On synthetic windows the control probe
walks seed × window until price returns into the range box of a paired origin **without touching that
origin's pivot box** — the entry Ep 7 says the pivot method misses — and stops at the first one. It is not
claimed on a fixture window, because a single market window may genuinely contain no such return (the first
attempt at this claim failed on exactly that, 10/1, and the claim was moved to where it can be observed).

The migration probe reads a database the **committed parent created and wrote**, including a settings row
written by the parent's own `/api/settings` route with `zone_method` in the body: the parent answers 200 and
stores the row **without** the key — the shape every existing trader is in. The delivered tree opens that
same file and reports `pivot` / `requested:null` / `source:'default'`, so the row is read exactly as the
parent read it; choosing the range method then adds **exactly one key** (`zone_method`) and drops nothing;
a value that reached the JSON by another route is **reported** by the read rather than silently defaulted;
and the read-write set of the delivered tree over two reads is **identical to the released build's own
set** — the day-state rows a read has always touched, and never `users`, `strategies` or
`strategy_versions`. The parent opening the file afterwards round-trips the key it has never heard of
(it spreads what it found) and reads none of it: no `zone_method` on any zone, no range zone, its own
`zoneMethod` option ignored. Nothing to migrate, measured in both directions.

## 5. The strength term

`strength` now carries `tests >= 2 ? 0.15 : 0` beside the fresh-zone bonus, because fresh is genuinely
valuable and so is proven respect. It fires on **21% of order blocks in the measured windows (54 of 259)** —
a term that is real, not dead weight — and the scoring change is measured on the same objects the rest of
the probe measures: a zone's `strength` moves only when its own test count does.

## 6. What this does *not* claim

* **No performance claim for either method.** Neither geometry is measured to be better here, and the app
  never says so: the wider zone catches the pullback the single candle misses **and** puts the stop further
  away. That trade-off is stated on the payload (`note`) and on both screens; the default is unchanged.
* **Not his discretionary range.** The consolidation is this app's **definition** — overlapping closed bars,
  walked back from the pivot candle — with its caps (3 ATR / 12 bars) **reported** as caps. It is a
  mechanical reading of "the consolidation", not a human marking a box.
* **No performance claim from the strength term either.** It changes a score component; the probe measures
  which zones it moves and by how much, and makes no claim about returns.
* **No pixel or production proof.** jsdom is structural and behavioural; the probes never render a browser.
