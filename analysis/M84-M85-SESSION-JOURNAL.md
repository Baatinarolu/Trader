# M84 / M85 — manual session-time warning and required post-loss core writing

Date:2026-10-11. Measured parent:**446e705d1fb0ae03d6bbfcd0913145619bd395fe**.
Branch:`arena/762c0295-trader`. This batch closes **M84 and M85 only**.
Ledger:**132 findings /84 done /2 partial /46 TODO /0 no-action**, exact eight
groups. M30/M103 partial; all unresolved IDs remain visible.

**244/0 new assertions across nine probes without legacy prerequisite adapters.**
These are contract assertions, not244 defects or market outcomes. Unchanged native
scripts actually run against both HTTP versions:**API121/0, bots205/1**,20 synthetic
parity fills/0 mismatches. The unchanged `>20` sample assertion still fails.
No model/RR/target/grade/risk retuning or profitability/provider/broker/pixel claim.

## 1. Saved transcript scope, corrections and boundaries

Sources are the complete-transcript quotations previously preserved in
`EPISODE-AUDIT.md`, with decisions/limits in `evidence/m84/SCOPE.json`. No new
raw later-episode fetch or unavailable timestamp is invented.

- [Ep22](https://www.youtube.com/watch?v=JxiRzhjq2t8): choose a time/trade/profit
  ceiling **before** the market. "Trading for two hours" is an example. The ledger
  explicitly makes M84 optional/manual, because this app cannot observe broker
  screen time. After a loss, the pause **and** writing are required: "write down
  what happened, what rule did you break and what you would do differently".
- [Ep23](https://www.youtube.com/watch?v=Gx6KAhhWn10): journal right after exit;
  same-day fallback, grey marker for unjournaled trades, journaled/total count and
  completed day only when all trade journals are done. Emotional state is named
  before/after; trade P&L is not proof that its process was good.
- [Ep29](https://www.youtube.com/watch?v=iGORytFiDnU): **three-line post-loss review**.

**Important documentation correction:** M116 is already **APPLIED in the ledger**,
not TODO. The previous summaries/guide erroneously listed it open. This batch
corrects that statement, not its policy or status, and counts **no extra closure**.
Do not infer an unmeasured rolling100/provisional policy from that correction.

M85 is **input capture/reflection/completeness**, not adaptive sizing. Its grey
marker says **core journal**, explicitly scoped to this requirement; it does not
pretend that M87 screenshots/M88 confluence fields/M89 timing/M94 routine/M106
four-question state gate have been implemented. They stay open.

## 2. M84: optional server marker, independently measured

### Account configuration and durable marker

`accounts.max_session_minutes` is nullable/OFF by default, both fresh and migrated.
Valid scalar whole minutes1–1440 are an **app range**, not course precision;120
is only an example in an unselected UI input. Authenticated POST/PUT validate
selection and preserve it on unrelated edits. Invalid types, fractions, zero,
negative, hex/bad strings and >1440 return400 without a configuration write.

`session_time_markers` stores owned account/start UTC day, server `started_at`,
frozen `limit_minutes` and optional server `ended_at`. A partial unique index
permits one active marker per user/account. Start/end operations are database
WRITE transactions; duplicate starts/end retries do not rewrite the captured
clock/duration. Client-supplied clocks are ignored.

The selected duration freezes **at the manual start**, not a speculative broker
start or app-open time. Later OFF/larger settings do not extend an active marker;
same start-day end/restart does not replenish it. Active markers survive midnight,
with inclusive elapsed≥limit warning. After explicit end, a new UTC start day can
start a genuinely new marker. History remains. Unstarted/invalid is **unknown
elapsed**, never falsely0 chart minutes.

**No new time execution veto:** only an optional warning. It neither grants a
permit nor alters cap, loss/profit/streak, cooldown/candle rules or account risk.
Malformed/unavailable optional time data cannot secretly become a mandatory
entry veto. No broker/chart-screen telemetry or enforcement is claimed.

### Actual shared UI

Settings toggle/duration/validation/real PUT; Dashboard **including first-run empty
workspaces**; Corrections shared card. Start/end/recheck handlers use real HTTP/
auth/SQL. The card says manual/advisory/not broker time/not permission. Source
server state rechecks on the button, not an invented client-clock proof.

## 3. M85: truthful close, explicit core review, mandatory next-entry writing

### Core journal contract first

Reuses the actual `emotion_before`, `emotion_after`, `execution_notes`, `mistakes`,
`lesson` fields. Adds explicit `mistakes_none`, server `journal_reviewed_at` and
`journal_review_hash`. Legacy defaults are0/NULL, **no acknowledgement backfill**.
A completion hash covers relevant facts (including P&L/geometry/date/ownership)
and core reflection text. An unrelated note preserves matching acknowledgement;
a changed relevant fact/text is incomplete until explicitly re-acknowledged.
Neither winning, A+ grade nor a saved daily notebook implies trade completion.

Actual owned `POST /trades/:id/journal` validates three short lines/emotional states.
Each textual line is plain nonblank ≤2,000 submitted characters; emotional states
≤100. Mistakes OR explicit followed-plan/none, never both or blank. Unknown result,
not-yet-closed/open position and future close cannot be acknowledged. Generic
trade writes ignore client-forged completion timestamp/hash. Review writes no
money/geometry/admission/immutable guard-snapshot fields and does not re-grade.

`journal` status is in actual trade list/detail/close responses. UTC day/index
counters work even without a notebook entry and honor selected owned accounts.
Empty0/0 is `empty`, not vacuously complete. Unknown close dates remain labelled
unknown, never put into an invented date. **Core scope** is disclosed beside status.

### Required writing and durable captured obligations second

A prospective **new entry/reopen** requires explicit nonblank named emotional
input; genuine record-only/import/historical writes remain possible without it.
That does **not** mean M106's four-question mental gate is complete: named FOMO
still satisfies the input contract. No verified capture-time column/late-data
filter is invented; M89 stays open.

A verified loss closed on the current UTC rule day creates a captured writing
obligation in `guardrail_reflections`: server observation time, original minimal
loss facts, queue key, optional immutable completion/writing/source. **No trade
foreign key**. Migration itself creates no marker/obligation or fabricated historic
violation. First actual observation is captured **NOW**, even for a current-day
legacy loss with populated notes but no explicit review.

Writing is **resolvable**, not added to the permanent `DAY_STOP_RULES` whitelist.
Missing reflection independently produces known `post_loss_reflection` STOP after
the30-minute/full-next-candle pause has expired. All real analyse/chart/scan/Now/
signal consumers compose it with existing personal permission without changing
market geometry/score/grade/risk. An otherwise technical veto remains vetoed.

Truthful closes/corrections/deletions/imports are **never refused for blank writing**.
The pending observed obligation survives correction/deletion; a retained-loss
endpoint can resolve it after row deletion without recreating a trade, consuming/
refunding admission or altering original loss observation. Valid core review also
acknowledges that record's observed losses. Completion retry cannot overwrite its
first captured writing/time. A fresh process remembers both pending and resolved
states. Past-day pending remains inspectable but is not a new-day reflection
veto; existing crossing-midnight loss clocks still apply.

Known M80 exceptions remain **one freshly checked owned action with typed reason**,
not a completed reflection/day unlock. Unknown close result/queue/capture cannot
be reason-waived. Permission-read outages still allow honest record-only reality.
Review fields and queue completion share a WRITE transaction; failure to save the
captured writing rolls back the core acknowledgement too.

### Actual UI third

Live form labels/requires emotional input and rejects missing input **before POST**.
Actual close is saved, then **Post-loss reflection** opens immediately. Deferring
leaves journal incomplete/pending; next trade becomes grey/reason-required even
when timer has expired. Explicit three-line editor, no preselected "none", real
API acknowledgement; trade log grey dot/review action/journaled counter; notebook
index/day counters; Dashboard/Corrections retained-loss writing card even after
deletion. UI escapes saved markup as text. Day notebook text stays distinct from
trade-journal completion.

## 4. Separate measurements and retained failures

| Mechanism / boundary | Control | Final |
|---|---:|---:|
| M84 configuration/manual clocks/SQL/advisory | parent3/36 | **39/0** |
| Actual Settings/Dashboard/Corrections time UI | policy-only3/11 | **14/0** |
| M85 core journal/validation/ack/count/ownership | M84-only3/30 | **33/0** |
| Mandatory writing/entry input/retained CRUD/reason/rollback | core-only7/27 | **34/0** |
| Actual analyse/chart/scan/Now/signal composition/resolution | core-only24/40 | **64/0** |
| New future/metadata/identifier/untrusted-driver contracts | gate-only8/5 | **13/0** |
| Actual shipped446e705 schema upgrade + separate-process restart | actual parent | **17/0** |
| Actual close/prompt/grey reason/log/day/deleted-loss UI | contract-only10/15 | **25/0** |
| Independent old cap observation while writing unknown | UI-stage1/4 | **5/0** |
| **Nine new probes, final latest runtime rerun** | negatives retained | **244/0** |

Fixed-clock probes use2026-10-11T12:00Z (declared mutable UTC for boundary cases).
Consumer tests declare candle/ordinary CRT/exact-net and fixed-cash seams, not
natural OHLC discovery/equity compounding. UI probes declare bootstrap/news/quotes/
chart/unused-market IO and exercise actual handlers/HTTP/auth/SQL, not pixels.

### Negative/error records, not a green-only history

- Initial M84 parent probe used optional `started_at===undefined` then dereferenced
  `elapsed_minutes`:3/31 plus abort. Initial source/log remain; corrected nonvacuous
  control3/36. No production edit to force that control green.
- First M84 SQL init failed0/1: **a semicolon in my new SQL comment** violated the
  existing simple schema splitter (M117). Initial DB source/log are retained; comment
  punctuation corrected before passing39/0. This was an implementation error,
  not an original missing-feature count.
- New contract probe found five issues in the newly added layer: future-close
  acknowledgement, stored-none2 coercedfalse, bad IDs masked503. **8/5→13/0**, one
  separate stage; no input/cap/grade recalibration to conceal the failures.
- Code review found mandatory writing uncertainty could return early **before**
  retaining an independently known old cap. Real unknown-result → truthful deletion
  → next-entry control demonstrated it:**1/4**. Separate correction now5/0 retains
  original count/cap/loss-clock observations and captures known old stop before
  returning unknown new permission. Writing uncertainty cannot refund the cap.
- Original inherited probe runs are preserved:**465 passes/73 failures/11 nonzero
  exits**; some abort early, so538 measured assertions is not the full old584.
  Old fixtures supplied no live emotional state/writing and assumed a foreign
  account day read was empty200. The new mandatory requirements/owned404 are not
  silently waived in production.
- Explicit **legacy prerequisite isolation** runner holds writing fulfilled,
  supplies synthetic Neutral to old open-entry fixtures and holds the new prompt
  fulfilled in their old UI flows. It adapts the extra additive table assertion
  while still requiring every old table name, and owns404 vs historic empty200.
  **584/0** guard-rule assertions pass under that declared scope, **NOT full M85
  policy proof**. First isolated history21/1 and initial runner remain. Original
  probe files unchanged; no market/price/score/floor changes. Real new probes above
  run with **no adapter**, as do both native suites.

## 5. Native/pure/UI regression evidence and neutral source

**Fifteen byte-identical files to446e705:** ten model/entry/geometry modules, shared
risk constants, P&L/statistics, lock and the two actual native scripts.
`engine-neutrality.json` has exact hashes. `trades.js` adds only an explicit-none
field/column allowlist, not a P&L formula. No completed M71 twelve-run outcome study
is repeated; preserved core source does not support a new profitability claim.

| Suite | Parent/control | Current |
|---|---:|---:|
| API unchanged scripts, real policy/no adapter | **121/0** | **121/0** |
| Bot unchanged scripts, real policy/no adapter | **205/1** | **205/1** |
| Default parity sample/mismatches |20 /0 |20 /0 |
| Isolated inherited guard contracts | historical584/0 | **584/0 scoped** |
| Native Now /Topdown /Chart | — | **50/0 /77/0 /36/0** |
| M33 /M78 /M77 | — | **67/0 /169/0 /41/0** |
| M71 /saved settings | — | **48/0 /15/0** |
| jsdom smoke report | — | **21/21,0 style/console errors** |

One native bot `>20` sample failure remains in **both** arms; bothexit1. Floors and
scripts/assertions were not changed. No broker/production multi-worker claim;
native suites run serial perDB/scheduler0/offline synthetic. Native20 synthetic
fills remain conformance, not outcome/edge evidence.

Smoke's extra "switch to full view" check is conditional: full sample10 already
selects full, so it did not run here (earlier smoke22). Report21 accurately, not
22. Its printed empty Segments72chars/integration peekfalse are not claimed new
passes. Eight jsdom canvas limitations are recorded; no actual canvas/pixel claim.

## 6. Packaging, reproducibility and remaining mechanism order

`build-m84-m85-artifacts.py` verifies measured app/harness/evidence/ledger, emits
**eight incremental stages** (time policy→time UI→core journal→writing gate→data
contracts→journal UI→coexisting retention→docs), combined446e705→final and pristine
ZIP→final patches. Forward/reverse clean application and byte comparison are
**zero differences**. Normal reconstruction uses durable patches, not ephemeral
`/tmp` trees. Source ZIP has **114 application files** plus audit/proof materials;
no credentials, DBs, dependencies or downloaded datasets. Current hash companion
outside the ZIP:`evidence/m84/archive-sha256.json`. User guide:README and
`docs/GUARDRAILS.md`. Documentation stage changes no runtime bytes.

Fresh preview3000 uses current runtime, `/tmp/m84-final-regressions.db`, explicit
synthetic candles, scheduler0 and blank remote credentials. Preview-form Host/
Origin API-health/root return200; health admits demo data. Parent3001 control is
stopped after comparison. No live Yahoo/broker/hostedTurso/Vercel/auth/cron/pixel or
market-edge validation inferred; user's no-key-rotation instruction respected.

**Next risk item M94, paired with M64/M14's pre-market routine and M108 meditation
step** — scope the saved routine/window/reset quotations together; a boolean alone
would not implement the sequence. M89 verified emotion capture timing and M106
four-question mental gate remain separate. M30/M103 partial and all46TODOs stay
visible. No claim that unfinished findings caused the losses.
