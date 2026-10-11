# M79/M80 — durable personal-rule admission and accountable overrides

**2026-10-11 · parent `fdaa2bc5cd7922df094c53e3991627dc7c1c23ba` · branch
`arena/762c0295-trader`.** Scope closes **M79, M80, M83, M90 and M113** only.
Authoritative ledger: **132 findings — 80 done / 2 partial / 50 todo / 0 no-action**.
M30/M103 remain partial; M125 remains open. The eight groups remain an exact
partition. No finding was removed or treated as implicitly fixed.

## 1. Transcript scope, including the correction to the original audit

- **Ep21, M79/M80:** the trade button becomes gray at a personal limit; a trader
  choosing to proceed must record a reason. This app has no broker connection,
  so its enforceable boundary is prospective app admission, not outside trading.
- **Ep22:** at least **10 minutes** after a loss and **no very next candle**. The
  existing 30-minute value complies and was retained. Clock expiry, rather than
  OHLC confirmation, is explicitly disclosed.
- **Ep24, M90:** the day review needs the broken rule and the reason; ephemeral
  response text and later recomputation cannot provide that historical evidence.
- **Ep31, M83/M113:** preselect the cap to fit style, generally 3 intraday / 5
  scalping (also a 2-entry example). Profitable high-frequency history must not
  automatically ratify a higher operative cap. Integers 1–100 are an application
  validation range, **not a transcript-specified universal maximum**.
- **Ep27/M11:** retain the 30-closed-trade adaptation minimum. The user's
  deliberate M103 `n >= 5` decision is unchanged. No 70% target was revived.

The original ledger said detection was correct and only enforcement missing.
**That assertion was disproved.** Actual parent admission checks were **10/38**
and consumer checks **16/28**: `dailyState` did not await the rule Promise,
account scope/counting/close-day loss boundaries were wrong, and errors could
fall open. The old descriptions remain as audit provenance, with that correction
made explicit; they are not current correctness claims.

## 2. Independently measured stages

All numbers below are **assertions passed/failed**, not distinct defects, broker
execution, pixels, market calibration or improved expectancy. Each source stage
has an immutable SHA-256 manifest in `evidence/m79/` and an attributable patch.

| Mechanism/probe | Earlier isolated control | Repaired stage/current |
|---|---:|---:|
| Persisted/frozen cap, M83/M113 | parent **2/36** | **38/0** |
| Numeric rule state and actual HTTP entry/reopen admission, M79 | parent **10/38**; cap-only **9/39** | **48/0** |
| Actual analyse/chart/scan/Now consumers, M79 | parent and cap-only **16/28** | **44/0** |
| Immutable historical capture and real review renderer, M90 | enforcement-only **1/21** | **22/0** |
| Server reasoned override and audit rollback, M80 | history-only **10/19** | **29/0** |
| Actual browser modal/form/bot actions, M80 | override-backend-only **3/23** | **26/0** |
| Exact clipboard prices | pre-format UI **2/2** | **4/0** |
| Selected account in topdown and Corrections tab | clipboard-only **3/3** | **6/0** |
| Original day-retention acceptance | pre-retention **3/1** | **4/0** |
| Extended durable CRUD/concurrency/restart/time state | compatibility-only **20/28** | **48/0** |
| Admission validation/no-op/error contracts | retention-only **13/11** | **24/0** |
| Real shipped-schema migration/idempotence/no backfill | actual parent DB → current twice | **9/0** |

**Final feature checks: 302/0 across these 12 probes**, excluding duplicate runs
and controls. The original 217 assertions were not sufficient to close M79:
see the retained substantive failure below. New acceptance and error-contract
probes are separate from those original measurements.

### Retained substantive negative: deletion really replenished the cap

`day-retention-results.json` and its log preserve **3/1**. Three authenticated
POSTs were admitted, the fourth returned409, an honest journal row was deleted,
and another entry returned200 without an override. M90's old audit still showed
the breach, proving **durable history was not durable enforcement**. M79 was kept
partial while this failed; the test expectation was not lowered or removed.

The repaired original test is **4/0**. New **48/0** measurements additionally cover
backdating, deleting every row, bulk deletion, corrected P&L/streaks, multiple
reopens of one id, six concurrent requests, midnight/time expiry, corrupt state,
transaction-trigger failures and recovery in a **fresh Node process**.

## 3. What the runtime now does

### Separate mechanical state from journal truth

`guardrail_day_state` stores a monotonic observed entry floor, latched cap/loss/
streak day stops and observed loss timestamps. `guardrail_entry_admissions`
records successful prospective entries/reopens independently of journal rows;
there is **no trade-row foreign key** that would delete those admissions.

A known first observation of existing journal entries seeds an observed count,
**not fabricated historical admissions**. Subsequent server trade admissions
increment the count in the same WRITE transaction as the actual trade write.
Reopening the same id counts again. Saved/copied plans are not executed positions
and do not consume a trade-entry slot; their action-scoped check is never a later
trade permit. A missing/no-op trade write cannot mint an admission.

Truthful date/P&L/notes edits, actual closes and deletions remain allowed. Current
journal P&L/streaks reflect those corrections, while already observed day stops
remain until **UTC** rollover. Previously observed loss times keep driving the
cooldown/next-candle exclusion after deletion and across midnight. Time stops
still expire at their exact boundaries; they are not permanent day latches.

### Personal limits, not replacement market logic

- Opened-day attempts; close-day realised P&L/streak; inclusive loss threshold.
- Day-start realised equity = starting balance + earlier closed P&L. Floating
  P&L excluded; non-positive equity cannot produce a false all-clear.
- Six real concurrent HTTP admissions with one remaining slot yield **one200 /
  five409**, with matching journal and durable counts.
- Supported actual entry TF is required after a recent loss; unknown TF/state
  cannot be reason-waived. A closed-today invalid close timestamp fails closed.
  Future timestamps do not count as already occurred. Older undated closure
  policy and two-week missing-TF horizon are implementation judgment, not course
  durations.
- The full next-candle exclusion ends at
  `ceil(loss_time / bar_duration) * bar_duration + bar_duration`; exact-boundary
  loss belongs to the just-closed candle. This is **clock, not feed proof**.
- First guardrail check/admission freezes the selected cap for that account's
  UTC day. Midday changes apply next day. No user-timezone claim is made.

Known personal stops overlay actionable candidate/Now/chart/scan decisions while
preserving technical eligibility for a consciously reasoned exception. Unknown
state disables action. Grade, geometry, risk coefficients and technical vetoes
are not waived. Manual journal/save-plan inputs are not server OHLC validation.

### Accountable reason and immutable review

A nonblank plain-text reason, at most 2,000 submitted characters and trimmed by
the server, can admit **one** action at a known stop. Server-scoped fresh snapshot,
reason, action identity and override event commit together. Audit/admission write
failure rolls everything back. An unnecessary reason while clear is not called
an override; zero saved actions grant no permission and fabricate no override.

The actual browser supplies an explicit confirm/cancel dialog before its write or
clipboard action; blank reasons cannot confirm. Gray known-stop actions offer
that path, while unavailable actions are disabled. Account/TF preflight and the
server recheck protect stale/racing requests. Selected account forwarding was
measured independently, including the actual Corrections-tab handler.

Observed stops and blocked attempts are durably captured/deduplicated. Day review
finds recorded rule days without journal prose, displays the actual captured
rules/reasons and escapes arbitrary text. Settings changes/deletion/tomorrow do
not rewrite historical captures. Empty history does not prove compliance.

### Recordkeeping and legacy migration

Historical/closed writes, honest corrections/closes and explicit **record-only**
open writes remain possible, including permission-read outages; no prospective
permission is implied. Imports are record-only, with no inferred snapshot.
Research plans are research-only. Historical snapshots are **recording-time**
observations, not guessed entry-time violations. Legacy provenance stays NULL.

The migration probe creates a DB with the **actual shipped parent schema**, moves
it to current code, then boots again. Original trade fields are unchanged; cap3
is additive; no historical event/admission is backfilled. Local migration proof
is not hosted Turso/Vercel validation.

### Validation and compatibility are separately attributed

Only explicitly tagged local input-validation errors escape the admission
transaction as400. Arbitrary driver/provider4xx and unknown/audit failures stay
fail-closed/generic503, with no internal SQL/details exposed. Existing public
route `{error}`400 contracts remain unchanged; direct plan admission no longer
masks validated bad provenance as an outage.

The original formatter stripped significant trailing zeros (`100→1`, `110→11`).
The independent four clipboard cases preserve100/110,10/20,decimal trailing zeros
and six-decimal crypto, without altering engine geometry. A separate empty-prefix
composition repair preserves the existing formatter callback type; prior M33
**66/1**, M77/M78 callback crashes are retained, followed by67/0,41/0,169/0 without
editing those probes.

## 4. Existing regressions, including failures rather than a green-only story

**Declared IO:** `TJ_OFFLINE_CANDLES=1`, local DBs, scheduler0, no remote credentials;
bot requests serial. The same final fixture scripts run against both HTTP arms.
All floors, prices, quantities and existing assertions remain unchanged.

| Suite | Parent/control | Final current |
|---|---:|---:|
| API, identical fixtures | **121/0** | **121/0** |
| Bot API, identical fixtures | **204/2** | **204/2** |
| Native Now | — | **50/0** |
| Native Topdown | — | **77/0** |
| Chart/canvas contracts | — | **36/0** |
| jsdom smoke | — | **22/22 views; 0 UI-style/console errors** |
| Prior M33 / M78 / M77 consumer probes | — | **67/0 / 169/0 / 41/0** |
| Prior M71 consumers / saved settings | — | **48/0 / 15/0** |

The two bot negatives are retained **in both arms**: **19 fills** do not meet the
existing ≥20 / >20 sample assertions; there are **0 parity mismatches**. Thresholds
were not weakened. Earlier shipped M71's17 fills and twelve completed engine
measurements remain historical evidence, not new M79 edge/calibration runs.
No new market outcome study was needed or claimed: **all ten engine/model/price-
policy source files are byte-identical to the shipped parent**, recorded in
`engine-neutrality.json`.

### Invalid runs and fixture corrections retained

- Native chart/topdown first ran against blocked live provider IO. The recorded
  transport failures are not passes. Reruns explicitly use synthetic IO.
- Old API fixtures assumed deleting the journal made the account/day clear;
  old bot fixtures tried120 live admissions/closed them *today* to seed history.
  Durable guards correctly refused them: the old API crash and bot196/10 (vs
  parent204/2) are retained. Pure maths/research fixtures now explicitly record
  reality/research; bot histories get matching historical open/close times within
  the180d window. Prospective permission is tested by the separate real admission
  probes, not silently claimed by a research fixture.
- Initial partial fixture repair gave API115/6 because its remaining plan-maths
  cases still requested live permission; these are retained before the final
  explicit research fixture. Two standalone native processes sharing a SQLite
  DB also produced a retained migration `SQLITE_BUSY`; final native suites run
  serial per DB instead of suppressing that error.
- Boundary-probe resets explicitly isolate unrelated fixtures; they are not
  production deletion pathways. History/override clear controls now use a truly
  separate owned account, rather than deleting a stopped account's records. The
  original acceptance/extended durable probes do **not** clear mechanical state.
- The first new validation fixture incorrectly required an added error code on
  unchanged public `{error}`400 responses. Logs are retained; the corrected probe
  preserves that contract and additionally exercises the actual direct-admission
  masking defect. Bootstrap-only jsdom fixture failure and cap-only unhandled
  rejection from earlier stages are retained too.

These tests do **not** establish live provider, broker, pixel, production auth,
cron, hosted DB or Vercel correctness, nor profitability. The refreshed preview
on3000 is explicitly **synthetic**, with `/tmp/m79-regressions.db`, scheduler0 and
blank remote credentials. Host/origin preview checks returned200. The control
server is stopped after measurement.

## 5. Attributable byte proofs and next work

`analysis/patches/M79-M80-STAGES.json` maps each incremental source stage to its
SHA manifest and patch, including cap → enforcement → history → override → UI →
clipboard → account forwarding → callback compatibility → durable state → error
contracts → native fixture stages → documentation. The builder verifies each
increment by clean forward application **and reverse restoration**, plus the
combined parent delta and cumulative **pristine `tradingpro-main.zip` diff** at
`analysis/patches/applied-so-far.patch`: **0 byte differences**. Package lock and
older stage patches stay unchanged. The deterministic fixed ZIP contains112
application files, no credentials/DB/dependencies/downloaded datasets. Its hash
companion is `evidence/m79/archive-sha256.json`, excluded from the ZIP to avoid a
circular self-hash. Rebuild with `python3 analysis/build-m79-m80-artifacts.py`.

**Next mechanism: M81 profit stop, then M82 behavioural resizing and the remaining
risk items in `PROGRESS.md`.** M85 adaptive size, M111 news fail-closed and M112
time-window restrictions remain open and are not closed by this gate. All **50
todos + 2 partials** remain visible. M11's floor30, deliberate M103 `n >= 5`, entry
models, current protected stops, real nearest targets, RR floors and grade policy
remain intact; unfinished items are not evidence that they caused losses.
