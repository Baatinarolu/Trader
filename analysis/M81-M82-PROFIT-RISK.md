# M81 / M82 — optional realised profit ceiling and streak-independent risk

Date:2026-10-11. Measured parent:**7f1122dade0b9022b595aadc08bbb29badff51f6**.
Fixed working branch:`arena/762c0295-trader`. This batch closes **M81 and M82 only**.
Current ledger:**132 findings /82 done /2 partial /48 TODO /0 no-action**, exact
**eight-group partition**; M30/M103 remain partial. All unfinished IDs stay visible.

**282/0 new mechanism/compatibility assertions across ten probes; all302/0 inherited
M79/M80 assertions rerun unchanged. Assertions are not distinct defects or market
outcomes. No profitability,70% objective, provider/broker or production claim.**

## 1. Transcript scope and corrections before implementation

The full-transcript quotes previously saved in `EPISODE-AUDIT.md` are the scope
source. `evidence/m81/SCOPE.json` records the URLs and decisions. Raw later-episode
transcripts are not presently in the workspace; the recovery repository only had
Ep05–20, not21/22/31/32. No new raw fetch or invented timestamp is asserted.

- [Ep21](https://www.youtube.com/watch?v=1s8ea5SH7ZA): daily profit example5–10%;
  "keep your risk consistent"; also **5–10% max drawdown before reducing size or
  pausing**. That last line matters to the M82 correction below.
- [Ep22](https://www.youtube.com/watch?v=JxiRzhjq2t8):2–3% "or whatever ceiling
  that you set for yourself". These inconsistent examples demand configuration.
- [Ep31](https://www.youtube.com/watch?v=kRYQFKysfis): maximum daily profit is
  **"completely optional"**, recommends1% (also3/5). Base risk0.5%; a deliberate
  manual A+ variation is not an automatic response to wins or losses.
- [Ep32](https://www.youtube.com/watch?v=TIpUnwVftgU): during a losing streak,
  **"Stay at the same risk, keep your risk consistent"**. A sanctioned streak
  **STOP** is not a streak-based **RESCALE**.
- [Guardrails video](https://www.youtube.com/watch?v=ixmTrvUB1Ks): daily loss/profit
  use **realised P&L, not floating P&L**; known exceptions require a journaled reason.

### Explicit audit corrections, not silent scope expansion

1. The M82 remedy's blanket assertion that **drawdown** is a forbidden sizing
   input was overbroad: Ep21 explicitly allows reduction/pause at a drawdown limit.
   This batch removes **streak** factors; separate existing drawdown/day-loss advice
   remains. Their−3/−6/2% thresholds and0.75/0.5 coefficients are app policy, not
   exact course prescriptions. No new drawdown calibration is claimed.
2. Grade sizing already shipped through M58/M98:**A+/A×1,B×0.5,C×0.25**. This batch
   does **not** add automatic A+×2 or reopen those user decisions.
3. **M85 is post-loss reflection/completeness, not adaptive sizing.** It stays open.
   The misplaced Ep31 profit paragraph under **M94** belongs to M81; M94's
   pre-market routine does not close by association. M84/M111/M112/M116 remain open.

## 2. M81 policy, gate and UI measured independently

### Configuration / first-check freeze

`accounts.daily_profit_limit_pct` is nullable, separate from lifetime/prop
`profit_target_pct`. Existing/new accounts default **OFF /NULL**, not an invented
universal1%. Authenticated POST/PUT validate finite positive scalar percentages
through100 (app range, not course precision); null/blank means OFF; booleans,
arrays/objects, bad strings, zero/negative/out-of-range and hex strings are rejected.
Unrelated edits retain the setting; another user cannot edit it.

`guardrail_day_caps` additionally stores the profit percentage and
`profit_selected_at`. The first UTC-day profit check freezes **ON or OFF**; later
edits choose a future day. In an existing cap row, NULL selection clock means the
new policy had never been selectable. It is captured once **now**, retaining the
old cap/clock, never backdated by migration. Eight concurrent first checks agree.

### Realised threshold / durable admission

The denominator is the **existing loss gate's UTC day-start realised equity**:
starting balance + known P&L closed before UTC midnight. Floating/open results and
today's gains are excluded. Today is the **close day**, including overnight trades;
future closes are not counted before the server clock.

Comparison is inclusive and uses the **unrounded stored net-P&L sum**. At10,000 +
prior500,1% is105:104.9999 can display105 without tripping; exactly105 trips. This
uses existing libSQL REAL /JavaScript numbers, not arbitrary-precision accounting.
With profit ON, unknown net/close-day history, invalid policy/selection state,
nonpositive equity or amount underflow is unavailable and **cannot be overridden**.
OFF preserves existing older-undated handling rather than forcing a new policy.

`daily_profit_limit` joins the existing durable day-stop whitelist. Once observed,
it remains until UTC rollover after truthful P&L corrections, deletion, a settings
change and a fresh process. Journal truth is still editable. A known stop can use
M80's **one fresh, owned, server-rechecked action with a typed reason**, atomically
linked to audit/admission; it is not a day unlock or broker order. Six simultaneous
entry requests at a profit stop all409, with no new trades/admissions. An audit
failure rolls back the exception. Reopens also require a fresh admission.

Actual analyse/chart/scan/Now consumers, saved signals and stale-clear admissions
all obey the same stop. The four direction/model controls preserve original
geometry/grade/score/risk as market context. These tests deliberately hold cash
fixed with a raw exact-net journal seed; they are not evidence about broker equity
compounding. A personal exception never revives a technically vetoed candidate;
a technical no-op creates no override event.

### Actual UI

Settings has an explicit unchecked-by-default toggle, disabled percentage input,
validation, roundtrip and first-check/UTC/realised notes. The lifetime target is
labelled separately. Default/create/edit/disable handlers use real auth/HTTP/SQL.
The inherited actual trade modal becomes grey/reason-required for profit, records
the reason and displays it with the violated rule in day review.

Dashboard/Corrections show **the operative frozen choice**, not a newly saved future
setting. Dashboard separates profit stop, UTC realised result, personal state and
advisory risk/loss amounts. Neither a briefing nor a saved/copied plan grants
reusable permission. jsdom exercises handlers/DOM, not pixel rendering.

## 3. M82 sub-mechanisms measured independently

1. **Briefing factors removed:** loss streak≥3 no longer×0.6; win streak≥4 no
   longer×0.9. Reasons explicitly say no streak-based risk change. Paired sequences
   hold bank/drawdown/today P&L fixed and obtain equal risk dollars/percent/advisory
   loss budget regardless of streak count. Other drawdown/day-loss factors remain.
   Real HTTP briefing preserves0.5% through three losses, while actual next-entry
   POST still409 on the consecutive-loss STOP.
2. **Additional advice path:** inspection found `after_two_losses` still offered
   "cut size to25%". Its action now keeps the selected stop and same selected risk
   unit when permission returns. Its complete non-action insight fingerprint,
   detection threshold,8-row evidence,−1R segment and−123.6 impact are unchanged.
3. **M9 advisory-read compatibility:** briefing now uses unchanged
   `instruments.clampRiskPct` before advisory adjustments, including legacy/invalid
   values. Default/locked0.5%, manual absolute maximum1%, existing base floor0.25%
   unchanged. A read does not mutate the stored legacy value. No engine coefficients
   are changed. Metadata discloses base risk and streak sizing OFF.
4. **UI compatibility:** the new-account dialog now displays0.5%, rather than
   silently emitting1% and relying on the old server clamp. Actual form POST and
   persisted locked/OFF account are checked separately. Dashboard calls the
   remaining multiplier **advisory adjustment**, displaying base risk and
   **"Streak sizing: off"** separately from live personal permission.

## 4. Attributable measures and retained negatives

| Probe / boundary | Control | Final |
|---|---:|---:|
| Optional policy / SQL / auth / UTC freeze | shipped parent3/56 | **59/0** |
| Realised stop / admissions / CRUD / restart | policy-only15/36 | **51/0** |
| Analyse/chart/scan/Now/signal consumers | policy-only24/36 | **60/0** |
| New data contracts / corruption | policy-only8/8 | **16/0** |
| Actual previously shipped schema migration/idempotence | actual7f1122d schema | **13/0** |
| Settings/Dashboard/trade reason/review/Corrections DOM | gate-only7/17 | **24/0** |
| Briefing streak factors + actual streak STOP | M81-only15/14 | **29/0** |
| After-two-losses advice | factor-only3/2 | **5/0** |
| Existing M9 advisory read/metadata | advice-only5/11 | **16/0** |
| Actual0.5 default/advisory labels | read-compatible4/5 | **9/0** |
| **Ten probes total** | failures retained | **282/0** |

Evidence lives in `evidence/m81` and `evidence/m82`. Fixed-clock probes explicitly
use2026-10-11T12:00Z; native HTTP suites use contemporaneous synthetic IO. Controls
are frozen per-stage112-file manifests, not changing current-tree guesses.

### Failed probe assumptions also retained

- Initial profit-validation fixture omitted `status: open`; the unchanged API
  defaults CLOSED, so it correctly recorded historical reality instead of rejecting
  prospective admission. **11/5 vs6/10** and the initial source remain. Explicit OPEN
  corrected the contract to16/0 vs8/8; no production workaround was applied.
- Initial UI cleanup used a nonexistent `.modal-backdrop` class, leaving stale
  settings dialogs/IDs; initial crash stdout/source remains. Actual modalStack
  close callbacks and tracked Settings-save promises corrected the harness. A
  second all-modal promise tracker waited for the future user reason decision and
  timed out after11 passing checks; its source/partial log remains. The own stopped
  test process was terminated, not duplicated. Tracker is limited to Settings saves.
- Initial cyclical40-row advice fixture counted each following win in the afterTwo
  segment, so it **did not activate the branch**:1/4 is retained. The corrected
  positive control activates it (3/2→5/0); neither cohort is market-edge evidence.
- Initial preview probe parsed SPA `/health` HTML as JSON; corrected endpoint is
  `/api/health`. That failed assumption is recorded, not a server repair.
- This shallow checkout lacks historical object `fdaa2bc`. Its M79 migration parent
  was recovered by reversing the durable guarded M79/M80 combined patch from7f1122d:
  **110 files, zero differences** against the saved old parent manifest. Recovery
  method and failed object lookup are recorded; old migration rerun9/0.

## 5. Unchanged core and non-green native evidence

**Fifteen files byte-identical to7f1122d**: ten core model/geometry files, shared
risk constants, Performance/P&L, package lock and both native test scripts.
`engine-neutrality.json` names/hashes every file. No price/entry/stop/target/RR/
grade retuning, no automatic A+ doubling, no M11 floor reduction or change to
M103's deliberate `n>=5`.

| Existing suite | Parent | Current |
|---|---:|---:|
| API, identical shipped scripts/values/assertions | **121/0** | **121/0** |
| Bot API, identical shipped scripts/values/assertions | **205/1** | **205/1** |
| Filled/parity sample |20 /0 mismatches |20 /0 mismatches |
| Inherited M79/M80 probes, unchanged scripts | historical302/0 | **302/0** |
| Now /Topdown /Chart | — | **50/0 /77/0 /36/0** |
| M33 /M78 /M77 | — | **67/0 /169/0 /41/0** |
| M71 /saved settings | — | **48/0 /15/0** |
| jsdom smoke | — | **22/22 views,0 style/console errors** |

Both bot arms retain **one failed `>20` filled-sample assertion** at20 fills. The
prior M79 batch had19 fills/204/2; those negatives remain historical evidence.
The contemporaneous synthetic cohort changed with time in **both arms**, not due
to this feature. **20 rather than19 is not improvement or edge evidence.** No
floor/assertion was changed or suppressed; native suites stay exit1. They run
serial per DB; no production multi-worker lock/concurrency claim. Smoke records
eight canvas limitations, not eight real canvas passes.

## 6. Artifacts and remaining scope

`build-m81-m82-artifacts.py` guards measured source/harness/evidence/ledger, constructs
**eight incremental stages**, combined parent→final and pristine-ZIP→final patches,
and checks **forward and reverse application plus zero byte differences**. Its
normal run reconstructs from durable patches, not ephemeral `/tmp` stage trees.
`patches/M81-M82-STAGES.json` contains hashes/scopes. The source-only
`tradingpro-fixed.zip` has112 application files plus audit/proof material; no real
credentials, databases, dependencies or downloaded datasets. The current archive
hash companion is outside the ZIP at `evidence/m81/archive-sha256.json`. README and
`docs/GUARDRAILS.md` are the user guide; documentation stage changes no runtime bytes.

Preview3000 uses current code, `/tmp/m81-final-regressions.db`, explicit synthetic
candles, scheduler0 and blank remote credential variables. Preview-form Host/Origin
GETs return200; health declares synthetic data. Prior preview is not reused.
No live Yahoo/broker, deployed Turso/Vercel/auth/cron, pixel, arbitrary-decimal or
market-outcome validation is inferred.

**Next in risk mechanism order: M84 optional session-duration marker, then M85
required post-loss reflection/completeness**, followed by remaining open risk/review
mechanisms. M94 routine, M111 news, M112 time restrictions and M116 composite-score
honesty do not close here. M30/M103 partial and all48 TODOs remain visible; no claim
that unfinished findings caused the measured losses.
