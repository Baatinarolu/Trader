# M56 — the written plan as a gate: `require` lines that refuse, and prose that never pretends

M56 is a **fix**, not a missing feature. The plan was already written, stored, versioned (M102) and shown
on the Playbook; no bot read a line of it. Ep 16 is unambiguous about what a written plan is for —
*"the **non-negotiables** that must be true before I even think about pressing the buy and sell button. And
if every or **any of these criteria is not met, I would just not trade"* — and Ep 27 makes the gap
load-bearing: step 4 of the improvement loop is *"tweaking your trading plan… bake it into your system
because the system is what keeps you consistent"*, so an edit that no bot reads means the prescribed
experiment tests nothing at all.

## 1. What was missing

* **The rules were inert.** `strategies` holds `market_conditions`, `timeframes`, `entry_rules`,
  `exit_rules`, `checklist`, `risk_rules` and `target_r_multiple`. `grep -rn 'entry_rules\|exit_rules\|
  market_conditions' src/bots/` returned **nothing**: no bot read the trader's plan at all. A trader could
  write *"I don't take this under 2R"* and the same screen would keep printing an armed 1.5R setup.
* **M102 compounds it.** The same edit overwrites the strategy in place, so the "before" of an experiment
  is lost at the moment of change unless something reads the version the rules were saved as.

## 2. The gate, and what it refuses to do

`src/bots/plan-gate.js` (`plan-gate-v1`) is a **closed vocabulary**, not a prose parser. A line the engine
can check begins with `require `; the thirteen documented facts are published by the module itself
(`vocabulary()`), and each line carries a concrete example so the docs cannot drift from the parser:

| form | facts | the line the app shows |
|---|---|---|
| boolean | `sweep`, `market_shift`, `zone`, `killzone`, `bias_aligned`, `no_news_blackout` | `require killzone` |
| enum | `session`, `timeframe`, `trend`, `phase` | `require session asia` |
| compare | `grade`, `min_rr`, `risk` | `require min_rr >= 2` |

Evaluation is **all-or-nothing per direction**, exactly as Ep 16 states it: every machine-checkable line is
resolved against facts the analysis has already computed, and any line that fails produces a refusal
sentence that names the plan, its version, the trader's own rule text and the measured detail, then quotes
the episode. The refusal is an **ordinary veto** — it is `unshift`ed onto the candidate's `no_trade` list and
therefore leads the `action` line, which means the verdict, the Now strip, Copy plan and the log button
already obey it with **no new plumbing** (M127's rule that only `ok` permits an action).

**Three states are named rather than smoothed over:**

* an unreadable fact is `unknown` and **refuses nothing** (killing a trade on a fact the app could not read
  would be the invented interpreter again, one layer down);
* an unreadable *plan* refuses **everything** (`unavailable`) — a broken read must never look like a
  satisfied plan;
* **no active plan blocks nothing** — a plan is not required to use the app, and `not_consulted` is kept
  distinct from `unavailable` so research cannot be mistaken for a broken plan or the reverse.

**Where the row's literal reading is unmeasurable, the scope decision is explicit.** Polarity cannot be
recovered from free text — *"no news trading"* and *"trade the news"* share every word — so prose is
**never parsed**, and `exit_rules`, `checklist` and the free-text `market_conditions` field stay displayed
context. Regime suppression therefore lands as machine checks (`require trend …`, `require phase …`) rather
than keyword matching. A `require` line outside the vocabulary is surfaced **loudly** as unrecognised
(with the reason) instead of passing as though it were checked.

## 3. Delivery shape

| file | what it carries |
|---|---|
| `src/bots/plan-gate.js` | **new.** `plan-gate-v1`: the vocabulary, the parse (`machine` / `prose` / `unknown_fact`, plus `malformed` for a stored value that is not a list), `facts()`, `evaluate()` per direction, `view()`, and a never-throwing `safe()` read |
| `src/bots/setup.js` | reads the plan, builds the fact set from what is already in scope, evaluates per direction and takes the plan's vetoes **first**; publishes `plan_rules` per candidate and `filters.plan_gate` per payload |
| `src/bots/index.js` | `writtenPlan` / `chartPlan` / `scanPlan` context for the three payload routes; chart candidates carry `plan_rules` and `filters` (M124: the chart is not a second opinion); **scan rows carry `plan_gate` + `plan_refused`** |
| `src/routes/bots.js` | `GET /bots/plan-gate` (vocabulary, state, classification, limits) and `strategy_id` on analyse/chart/scan; `plan_*` errors map to 400/404 inside `wrap()` |
| `public/js/views/bots.js` | the plan note, the plan selector (default = *my active plan*), and the per-candidate rule rows with their resolved state and measured detail |
| `public/js/views/playbook.js` | the editor's enforced-rule hint, fetched from the server so the hint cannot drift from the grammar the engine enforces |

**No schema object, no backfill, no write on a read.** The plan is read from `strategies` exactly as the
trader stored it, the version from the M102 rows, and `GET /settings`-style writes are not involved at all.

## 4. What was measured

| arm | result |
|---|---|
| feature (5 probes) | **151/0** — pure 43 · engine 25 · api 37 · migration 21 · ui 25 |
| control probe, delivered / parent | **14/0** each (mode-aware: it measures the fault rather than failing on it) |
| delivered tree vs the committed parent | candidate fields, grades, scores and levels identical with no plan; `plan_rules` is the only new key and is `null` when no plan was consulted |
| parent arm (committed release) | pure/engine/api/migration/ui **0/1** each — the module is absent and the absence IS the control |
| gate-only arm (module present, nothing consults it) | pure **43/0**, migration **21/0** — and engine/api/ui fail on the wiring that is missing |
| prior cohorts re-run on this tree | M115 **116/0** · M13/M65 **94/0** · M112 **181/0** |

The engine probe is the one that separates a vocabulary from a gate: every documented fact is driven to
`met`/`refused`/`unknown` by a **real** synthetic analysis run (none is dead weight), a fact that resolves
`refused` on a tradeable candidate turns it untradeable with the plan sentence **first**, a satisfied rule
leaves grade/score/levels **byte-identical**, an unreadable killzone resolves `unknown` and refuses
nothing, an unreadable news calendar can neither satisfy nor fail `no_news_blackout`, and with no plan the
delivered tree's candidates are identical to the committed parent's with `plan_rules` the only new key.

The API probe runs the whole thing through the app's own routes: plans published and edited through
`POST/PUT /strategies`, the analyse/chart/scan payloads over real candles, ownership (`404
plan_not_found` for another trader's id), validation (`400 plan_invalid` for `abc`, `1.5`, `-2`), ambiguity
(`ambiguous` with every active plan named, and *nothing* gated on a guess), the double-encoded stored value
reported `malformed`, and the read-only claim measured — an analysis against a plan writes exactly what an
analysis without one writes, and `strategies` / `strategy_versions` are byte-identical across the gate read.

The migration probe reads a database the **committed parent** created and wrote: the same four stored shapes
(array, prose, typo, double-encoded), the parent's own M102 backfill running exactly once, the delivered
tree returning the two machine lines enforced and the prose reported, and every table digest byte-identical
before and after — with no `plan_gate`/`plan_rule` schema object to find in either tree.

The ui probe renders that in jsdom: the plan and its version named, the refusal attributed rule by rule,
`NOT CHECKED: require swep` printed rather than swallowed, an unknown fact shown as *"could not be read, so
it refused nothing"*, a plan that needs re-saving shown as such instead of as a clean empty checklist, the
selector re-running the analysis with `strategy_id`, and the editor's hint rendered on the **first** open
with the server's own vocabulary (one `code` per published line, with the allowed values on hover).

## 5. Environment margins (identical failure sets on both trees)

| suite | delivered | parent |
|---|---|---|
| `scripts/now-test.js` | 50/0 | 50/0 |
| `scripts/chart-test.js` | 36/0 | 36/0 |
| `scripts/bots-test.js` (candle shim on the server) | 52 ok / 3 fail, crash at `bots-test.js:180` | identical |
| `scripts/api-test.js` | crash at `:50` (fresh-workspace `POST /api/trades` → 409 `guardrail_stop`) | identical |
| `scripts/smoke-test.js` | **21/21 views, 0 console errors** | 21/21, 0 console errors |

`smoke-test` had not been run since the wiring; it is green on both trees, and the two crashes above are
pre-existing at the parent and are **not** this milestone's.

## 6. What this does *not* claim

* **No performance claim.** The gate is boolean: the payload's own `limits` say it influences no grade, no
  score, no cap and no price, `broker_verified:false`, and the engine probe measures that a satisfied rule
  moves nothing. Refusing a setup is not a claim that refusing it makes money.
* **Not a prose reader.** Free text — `exit_rules`, `checklist`, `market_conditions`, and any non-`require`
  line — is reported as unverifiable and never interpreted, in either direction.
* **Not a trade grade.** The gate refuses **signals**. Whether a trade the trader *logged* obeyed the plan
  remains the plan-vs-execution gap named in `docs/NOT-IMPLEMENTED.md` §5.
* **No pixel or production proof.** jsdom is structural and behavioural; the probes never render a browser.
