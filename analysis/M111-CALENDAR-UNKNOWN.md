# M111 — an unreadable calendar is UNKNOWN, not clear

**Finding (S3, Ep 30).** `newsCheck` **failed open**. The market layer reports a calendar it could
not read as `{ok:false, error, events:[]}` rather than throwing, and the engine's only test was
`blackout === null` — which a failed read also produces. So an outage reached `setup.js` as *"No
high-impact news in the window"* and was **scored as satisfied**, indistinguishable from a
genuinely quiet week. Ep 30 frames this block as a **safety** mechanism — *"it prevent you from
getting wiped out… it prevent you from getting trapped in unpredictable move… it's simply a
mechanism for Edge Flow to protect you from impulse"*, *"it's trying to keep you alive and
disciplined so your edge can actually play out."* A safety gate that says **clear** when it cannot
see is the wrong default, and the fairness note in the ledger is honoured rather than repeated:
`error` was already on the payload, the whole gate is advisory until **M79** is real, and this
milestone changes only what the *read* means — not the windows, not the weights, not the gate's
authority.

## Saved course basis and limits

Ep 30, S3. Two things he says about this rule bound the design. First, the block is protection, not
preference (quoted above). Second, the app must not **invent** a reason to stand down: the recorded
pair is a setting with a recommended floor, and the honest sentence for an unreadable calendar
names the windows that were **not** checked instead of implying a release was found. The core
episodes' boundaries stand unchanged: no 70 % win-rate claim, no causal or predictive edge, no
broker, provider, human, mental-state, pixel or production proof, and **no claim anywhere about
what a release will do to price**. M79 (making the entry gate real) is untouched and still open;
M111 removes the silent clearance that would have made M79's enforcement unsafe.

## Implemented mechanisms

- **`src/news-window.js` owns the vocabulary.** `STATES = {BLOCKED:'blocked', CLEAR:'clear',
  UNKNOWN:'unknown'}`, `stateOf({blackout, unavailable})` is the **one** mapping, `unknownNote()`
  the **one** sentence, `reasonOf()` the **one** normaliser. The precedence is explicit: a **known
  blackout wins even when a read also failed** (if a release is inside its clock the trader stands
  down regardless of what else went wrong — that is the safe order); otherwise a **non-empty
  `unavailable`** is `unknown`; otherwise `clear`. The test is on **values, not key presence**, so
  `{unavailable: ''}` is not an outage and `{blackout: null}` is not a block. `policy()` publishes
  the states and `unknown_is_not_clear: true`.
- **`unknownNote()` carries no window numbers.** It says *"News risk UNKNOWN — the economic
  calendar could not be read (…). Nothing was checked against your stand-down windows, so this is
  NOT an all-clear."* The configured pair is echoed **separately** in `windows`, so the sentence
  cannot be skimmed as *"checked and quiet"* and cannot be mistaken for a blocked read's own wording.
- **The engine's read rule is positive-signal, and that is the fix.** `newsCheck` now requires
  `read.ok === true` **and** `Array.isArray(read.events)`; anything else — `{ok:false}` with or
  without a reason, a bare object, an array, `null`, a thrown `Error`, a thrown string, a circular
  error object — is `unknown` with a reason from `reasonOf()`. The **success** payload is
  `{blackout, events, upcoming, currencies, state:'blocked'|'clear', windows}`; the **unknown**
  payload is `{blackout:null, events:[], upcoming:[], currencies, state:'unknown', unavailable,
  unavailable_note, windows:{…, unavailable:true}, error}` — the old `error` key is **kept** beside
  the new one, so a consumer written against the previous shape is not blinded, and `analyse()`
  passes `newsState`/`newsNote` through, prefixes the headline `NEWS UNKNOWN: …` and reports
  `checks.news === false`.
- **`src/bots/setup.js` fails the row and says why.** The news row (10 pts, label *"No high-impact
  news in the window"*, unchanged) passes on `clear` **or** when no calendar was consulted at all
  (`not_consulted`, the prior fallback wording, row still passes); on `unknown` it **fails** with
  the engine's own sentence and adds **no veto** — an outage is not evidence of a release, so it
  must not stand a trader down. `filters.news_state` mirrors the caller's own token verbatim beside
  the existing `news_blackout`; the chart and scan callers report `not_consulted`, so *"did not
  read"* stays explicitly separate from both `clear` and `unknown` rather than being defaulted onto
  either.
- **`src/bots/now.js` warns instead of staying silent.** An unreadable calendar adds a
  `{level:'warn'}` guard carrying the module's sentence — visible on the desk playlist, and still
  not a stand-down.
- **Nothing is stored.** The state is derived on every check: no column, no settings key, no cache,
  no write. Every table is byte-identical across a `clear`, an `unknown` and a `blocked` read, and
  `getCalendar()` does not cache failures, so an outage is retried rather than frozen (an `unknown`
  may therefore flap back to `clear` on the next check — a measured, accepted property, asserted in
  the freshness probe rather than papered over).

## Separately measured stages

Four constructed runtime stages (**policy → engine → consumers → documentation**), each patch
re-derived and replayed forward **and** reverse with **0 byte differences** against its frozen
`m111-*-source.json`, then stacked onto the pristine `tradingpro-main.zip` for a deterministic
`tradingpro-fixed.zip` (**146 application sources**). The pre-M111 files in the staged trees are the
**parent's own committed content** (`git` from `b39d9ef`), not a retyped approximation: the `policy`
stage is the vocabulary with **the M110 engine and its two consumers**, i.e. the recorded fail-open
with a name for it.

- **Pre-hardening control tree = the policy stage** (asserted identical, never copied twice). The
  **unchanged** probes measured it at **engine 8/13**, **consumers 5/9**, **api 1/4** and
  **hardening 1/10**, and the failing lines name the fault rather than a crash:
  *"the outage reaches the news check as `unknown` — NOT as a quiet calendar"*, *"the news row FAILS
  on an unread calendar — the absence of evidence is not scored as evidence of absence"*,
  *"a calendar failure shaped as a bare empty object is `unknown` …"* (ten hostile shapes),
  *"an unreadable calendar answers 200 with an `unknown` state — not a 500, not an empty 200 that
  reads like a quiet week"*. The engine, consumer and API stages make those same probes **21/0,
  20/0, 14/0 and 36/0** on the delivered tree.
- **Parent control = the committed `b39d9ef` M110 release** (146 files, two clocks, **no state
  vocabulary at all**). Eight of the eight probes stop at the tree check and report their one
  measured negative each (0/1 ×8, each naming the absent vocabulary as the control) — and the
  richer comparison is inside the delivered **migration probe**, which spawns the **parent's own
  code** on the same database and the same failing read: the parent answers with a quiet payload
  (`blackout:null`, `events:[]`, **no `state`, no `unavailable`, no note, no `error`**) and the
  delivered tree answers `unknown` with the reason and the sentence. Nothing in the probe invented
  the parent's behaviour; it was executed.

## Cohorts and retained negative scopes

**M111 154/0 across 8 probes** — module/pure **26**, engine **21**, consumers **20**, API **14**,
freshness **11**, hardening **36**, portable **10**, migration **16/0** against the actual M110
release. Coverage highlights: a `clear` verdict requires both `ok:true` and an events list; a
genuinely **empty feed** is the market layer's own `{ok:false, '…(empty calendar)'}` and is
therefore `unknown` too (measured, not assumed — see below); a thrown read, including a non-Error
throw and a circular error object, is the same unknown state with the thrown message quoted; **ten
hostile failure shapes** all land on `unknown` with a usable reason; **ten hostile `newsState`
values** — only an exact `'unknown'` fails the row; the outage and the block both leave every table
byte-identical (no write, no settings key, no column); the research pair is honoured on the outage
path and never stored; the legacy single knob, the settle floor and the state-gate key refusals all
still hold **during** an outage; and the API answers 200 with `unknown` plus the reason (never a
500, never an empty all-clear) both for a failing feed and for a thrown reader.

Cohorts re-run on this tree: **M110 253/5**, **M109 166/2**, **M108 257/2**, **M107 230/2**,
**M106 316/2**, **M105 140/2**. The M110 five are this milestone's **declared negatives**, and each
one is a measurement of the pre-M111 state that probe was written to make:
*"M110 does not claim to fix M111: a failed calendar still reaches this rule as a QUIET one"*,
*"the engine source keeps the M111 marker at that exact branch, so closing M111 later cannot be
mistaken for a regression"* (its marker text was *"M111 is open and NOT solved here"*),
*"the served payload … has no top-level `window_min` any more"* (the exact key set now also carries
`state`), *"a genuinely empty week yields a clear payload that is distinguishable from a blocked
one but not from an outage (that gap is M111, and this probe names it as such)"* and *"an M111
outage reaches this consumer as silence"*. Every failing line is in
`analysis/evidence/m110/m110feature-{engine,consumers}.txt`; **nothing was edited to make a frozen
assertion pass**, and the older cohorts keep their own declared milestone-only schema negatives.
RAW **596/156**, DECLARED **824/4** and the live-provider arm **70/1** reproduce exactly; the native
provider arms stay **inherited and not re-run**. Smoke **22/22 views on both trees, 0 style
failures, 0 console errors** — and the smoke run does not open the news settings dialog at all, so
it is asserted as a structural check and **not** claimed as news coverage (that dialog is M110's
`probe-m110-ui.js`).

## Initial errors kept, not erased by closure

- **The first engine probe assumed an empty week reads as `clear`, and the app disagreed.** The feed
  path returns `{ok:false, '…(empty calendar)'}` for an empty week, so the honest verdict is
  `unknown`. The probe was corrected to measure **both** facts — that the market layer shapes it
  that way, and that the news check then reports `unknown` — rather than the code being bent to make
  a wrong expectation pass.
- **A non-`Error` throw lost its message.** The inline catch used `(e && e.message) || …`, so
  `throw 'feed refused'` produced the generic sentence. The fix routes the catch through
  `NewsWindow.reasonOf(e)`, and the probe now asserts the thrown string is quoted verbatim.
- **The first read rule graded a bare `{}` and a resolved `[]` as `clear`.** Six hardening arms
  failed on it: a silent all-clear, and `[]` could also reach `cal.events` and put a TypeError-shaped
  500 on the route. The read rule became the positive-signal test above; the same probe is 36/0.
- **`tradeable` does not exist on setup candidates** — `setup.js` computes it locally and emits
  `ok`. A consumer arm was rewritten to read `ok === false` instead of inventing a field.
- **The M111 probes kept the process alive** (the express listener stayed open after a run whose
  output already looked complete). `analysis/m111-test-support.js` now starts its own listener and
  closes it in `finish()`; every M111 run is wrapped in `timeout` and exits in about a second.
- **The parent-migration baseline moved on the parent's own restart.** The parent lazily creates its
  M102 default strategy snapshot (and `sqlite_sequence` moves with it) the first time it is opened
  again. That is inherited behaviour of the tree being upgraded, so the probe takes a **baseline**
  restart and asserts the isolated delta by name, instead of attributing it to M111.
- A straight quote inside a probe label (written inside a single-quoted JS string) broke the file's
  syntax; labels use `\u2019` now.

## Delivery and continuation

Changed-file set exactly `{README.md, docs/API.md, src/news-window.js, src/bots/index.js,
src/bots/setup.js, src/bots/now.js}`; the protected engine/guardrail/core/journal/grade/history set
is re-asserted byte-for-byte, and the four files M110 changed inside it (`src/db.js`,
`src/routes/api.js`, `src/routes/bots.js`, `public/js/views/settings.js`) are now protected too.
Ledger **132 = 106 done / 2 partial / 24 TODO**. **No 70 % win-rate claim, no causal or predictive
edge, no broker/provider/human/mental-state/pixel/production claim, and no predictor of any kind.**
Next: **M112** — a trading window derived from the existing `by_session` history, applied as a
**hard block** rather than a scored penalty.
