# M110 — the asymmetric news stand-down: two clocks, one calendar

**Finding (M110, S3, Ep 30).** The episode states **two stand-down periods of different length**,
not one: a pre-release block — *"you don't open new positions during that window where the news
is coming out, like 15 minutes before and after news"* — and a **separate, longer post-release
settle** — *"after the news came out, you want to wait for the volatility to settle, maybe 30
minutes to 60 minutes after the high impact news comes out. Once the structure start becoming
much more clearer, this is where you can continue trading."* The code had **one** number,
applied **symmetrically** (`Math.abs(new Date(e.date).getTime() - now) <= windowMin * 60000`,
`src/bots/index.js:92`), so the two periods were forced to be equal: at the default of 45 that
happened to comply, but a value he sanctions for the block — *"the default state is probably like
15 minutes, right? But you can set it to 5 minutes, 10 minutes, 30 minutes, 60 minutes"* —
silently collapsed the settle to the same number, **6–12× below the 30–60 minutes he requires**,
with no warning. The M62 correction stands and is why the default was **not** lowered: 45 was
never the defect, the *single knob* was.

## Saved course basis and limits

The module carries the episode's own words in `DOCTRINE` (the block, the settle, the
recommendation — *"I would recommend you to at least put it at 15 minutes before and after"* — and
the option list) and states the app's boundary in `BASIS`: both numbers are **settings with
recommendations attached**, the **30-minute settle floor is the only refusal**, and there is **no
model, no prediction and no claim about what a release will do to price**. The split, the
defaults (15 / 45), the 1–240 and 30–240 bounds and the per-side warnings are **app policy built
from his words**, not quoted course law. **M111 stays open and is measured, not papered over**: a
calendar that cannot be fetched still reaches this rule as a **quiet** one — `blackout: null`, no
`unavailable` flag, no error on the payload — so an outage is still indistinguishable from a clean
week at this boundary. The pair *is* echoed on that path, a failure is not cached the way a
success is, and every probe says so in its own words.

## Implemented mechanisms

- **`src/news-window.js` (`news-window-v1`), the owner module and a leaf**: it requires
  **nothing**, reads no environment, no filesystem, no path and **not even the clock** (`now` is
  passed in), so it answers identically when copied out of the tree. `plan()` clamps on read and
  reports `source` (`stored`/`clamped`/`default`) and `clamped` per side; `parsePair()` reads
  request input and **refuses** rather than coerces; `hit(eventMs, nowMs, plan)` is the **one**
  asymmetric test — a non-negative offset is judged by the block, a printed release by the settle,
  boundaries inclusive, `NaN`/`undefined`/malformed pairs answer `null` rather than matching;
  `detail()` names the two configured numbers.
- **Two account columns, added additively**: `news_block_before_min INTEGER NOT NULL DEFAULT 15`
  and `news_settle_after_min INTEGER NOT NULL DEFAULT 45`, each with its own CHECK (bounds **and**
  an integer-cast test), plus two additive migrations. The stored `CREATE TABLE` text is the
  parent's own text with the two definitions inserted before the closing parenthesis; every
  pre-existing column keeps its position, type, nullability and default; every inherited fact
  outside `accounts` (and the auth sessions a probe itself creates) is **byte-identical**; and
  re-opening the upgraded database is a **no-op**. An account that predates the columns is read at
  **15 / 45** — not 45/45 (the old symmetric pair) and not 5/45 (his single value read as the
  block).
- **The engine resolves the pair from the account before the calendar check** (the account read
  moved above it) and returns `windows:{before_min, after_min, source, clamped}` with each blocked
  release carrying its own **`side`** and **`offset_min`**. The top-level single `window_min` is
  **gone, not deprecated**, and no shipped file or client reads it. The blackout sentence
  interpolates the account's own numbers and names the side that caught the release (`in X min` /
  `printed X min ago`) with the matching closing sentence, so a note cannot describe a window the
  app is not applying.
- **`setup.js`**'s news fallback now states the two windows in the trader's direction instead of
  the hardcoded, one-sided *"next 60 minutes"*, and the veto carries the blended blackout rather
  than a second generic sentence — the surviving **M62** half. The check keeps its recorded
  weight (10) and label: **this milestone split a window; it did not retune a grade.**
- **A single number is refused, never split.** Every legacy spelling — `window_min`, `windowMin`,
  `newsWindowMin`, `news_window_min` and `?window=` — is a **400 `news_window_split_required`**,
  and is checked **before** the split fields so one cannot be smuggled in beside a valid pair and
  quietly ignored. A settle below 30 is a **400 `news_settle_below_floor`** on create and on
  update; a block below the recommended 15 stores as set with `news_block_before_below_recommended`
  and never shortens the settle; a settle longer than the named 30–60 is stored and reported with
  `news_settle_outside_stated_range` rather than repaired. An **unrelated edit such as a rename
  cannot move either clock**: only the fields a request actually supplies are parsed.
- **The settings dialog** has two number fields carrying their own bounds (1–240 and 30–240), the
  floor stated in the field note *before* anything is typed, a fast client-side message for the two
  refusals, and both keys always sent together. The dialog is **not the guard** — the schema, the
  route and the module each enforce the same floor independently.
- **No other rule moved**: the state gate's own **60-minute** window (`window_minutes`) is
  untouched and still answers 60; the risk guardrail beside it still clamps a 5 % request; a news
  key smuggled into a gate answer is refused by that surface; the guardrail day snapshot has no
  news column, so a pair can never be frozen by the mechanism that freezes the caps.

## Separately measured stages

Six constructed runtime stages (**policy → api → engine → hardening → ui → documentation**), each
patch re-derived and replayed forward **and** reverse with **0 byte differences** against its
frozen `m110-*-source.json`, then stacked onto the pristine `tradingpro-main.zip` for a
deterministic `tradingpro-fixed.zip` (**146 application sources**). The `policy` and `api` stages
deliberately carry the **pre-hardening** behaviour — the loose module and route still let one
number set both sides, with the floor not applied to it — and the **unchanged** probes measured
that runtime at **api 31/9** and **hardening 39/1** before the hardening stage made them
**40/0** and **40/0**. The pre-hardening control tree **is** the engine stage, asserted identical,
never copied twice. The **parent control** is the committed **c09574e M109 release** (145 files,
the single symmetric knob, no module and no column): eight of the nine probes cannot load the
module there and report their one measured negative each, and the **migration probe**, which
measures the parent by spawning the parent's own code, records **10/23** — the ten passing
assertions are the ones the parent can still answer about *itself* (its own history, its own
single knob, its own restart), and the twenty-three failures are each named in
`analysis/evidence/m110/parent-migration.txt`: absent columns, absent pair in the payload, the
legacy knob still served, no floor, and the backup/import boundary unprotected.

## Original cohorts and retained negative scopes

**M110 258/0 across 9 probes** (pure 41, api 40, engine 25, consumers 22, freshness 17, hardening
40, portable 17, migration 33, real-DOM ui 23). The migration probe was re-derived against the
rebuilt parent in this session and now also measures the **boundaries the pair has to survive**:
an export taken on the upgraded tree carries both columns and **no key spelling the old single
number**; a **parent-era bundle** (no news keys at all) and a **hostile bundle** carrying its own
news numbers in the account row *and* at the root of the file each import their trades and **cannot
move the pair**; a null or blank value is a refusal rather than a coercion; the four column
boundaries (1/240 on the block, 30/240 on the settle) write and read back exactly; a per-request
research pair is answered but never stored; recording a trade leaves every account fact untouched;
and the **parent's own code still opens the upgraded file**, which is what "additive" has to mean
here. The calendar in every probe is fed through the
**app's own fetch path and parser** — the shim only answers the two URLs — and **no market
provider is reachable from this sandbox**, so the engine probe drives `Setup.buildSetups` with
**declared synthetic 15m structure** and no live-market claim is made anywhere. Cohorts re-run on
this tree: **M109 166/2**, **M108 257/2**, **M107 230/2**, **M106 316/2**, **M105 140/2** — every
one of those extra failures is the **same declared negative**: a frozen migration probe that
asserts its milestone added *only* its own schema objects, and an inherited-facts comparison that
covers `accounts`, now legitimately carries M110's two columns. The M109-cohort negative is
quoted in `analysis/evidence/m109/m109feature-migration.txt` (*"M109 adds NO schema object of any
kind"* and *"every inherited fact is byte-identical … accounts"*), and the older ones in their own
`*-migration.txt`. Nothing was edited to make a frozen assertion pass.

## Initial errors kept, not erased by closure

- A `;` inside the `accounts` **schema comment** truncated the `CREATE TABLE` at the app's own
  `exec()` splitter (`SQLITE_ERROR: incomplete input`). The comment was rewritten and a split
  check now proves every statement parses; the probes still assert the two columns exist with their
  CHECKs.
- The calendar shim first answered **both** feed URLs with the same rows, so every event (and the
  whole blackout sentence) appeared twice. The app merges this-week and next-week; the shim now
  answers one week and an empty second week, and the probes assert a single event rather than
  deduplicating for the app.
- I assumed `Cor.accountOf(userId, null)` returned the trader's newest desk; it returns the
  **default** desk ("Main Account"), and every user has exactly one. The probe was rewritten to
  address desks by `account_id`, and the default-desk resolution is now asserted rather than
  assumed.
- The migration probe found that `?window_min=5` was **still accepted and ignored** by the news
  route; the refusal list was widened to every legacy spelling, and the body-level refusal was
  moved **before** the split fields so a knob cannot ride along with a valid pair.
- The migration probe's own first draft compared the upgraded `CREATE TABLE` line by line, and
  SQLite appends `ALTER TABLE ADD COLUMN` definitions *inside* the parent's last line — so the
  line diff reported a change that the byte proof does not support. The check is now the honest
  one: the parent's schema text must be an **unbroken prefix** with exactly two definitions
  inserted, and the fresh DDL is compared against the upgraded one column-by-column instead of
  assumed identical. The **position** difference (appended last on an upgrade, declared inline on a
  fresh database) is asserted and recorded rather than hidden.

## Delivery and continuation

Changed-file set exactly `{README.md, docs/API.md, src/news-window.js, src/db.js,
src/routes/api.js, src/routes/bots.js, src/bots/index.js, src/bots/setup.js,
public/js/views/settings.js}`; the protected engine/guardrail/core/journal/grade/history set is
re-asserted byte-for-byte. Ledger **132 = 105 done / 2 partial / 25 TODO** (M110 applied, and M62's
surviving wording half closed with it). **No 70 % win-rate claim, no causal or predictive edge, no
broker/provider/human/mental-state/pixel/production claim, and no predictor of any kind.** Next:
**M111** (the calendar fail-open: a distinct `unknown` instead of a quiet week) and then **M112**
(a trading window derived from `by_session` history).
