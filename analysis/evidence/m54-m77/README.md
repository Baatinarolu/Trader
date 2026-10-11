# M54/M77 durable evidence — 2026-10-11

Raw outputs copied from disposable measurement/control runs. `m54/` and `m77/`
include negative results, failed scaffolds, the mismatched-DB cleanup attempt,
and the missing-offline TD transport error; filenames containing `final` are
not interchangeable with later expanded suites. Read the chronology below.

Raw stdout is byte-preserved, including separator-line trailing spaces and final
blank lines. Source/docs whitespace checks exclude those `.txt` captures and
git-patch context; neither is silently trimmed to alter the evidence.

Authoritative interpretation: `analysis/M54-M77-TARGETS.md`.
Source reconstruction/core hashes: `analysis/patches/M54-M77-STAGES.json`.
Only local disposable SQLite and explicit synthetic provider data were used in
HTTP/UI tests. No log contains a committed production credential.

## Outcomes, separately measured

| Stage | Bare60 n/win/expectancy/PF | Real15 n/win/expectancy/PF | Native / real-native outcomes |
|---|---|---|---|
| c326651 | 24/29.2%/+0.7908R/2.33 | 10/40%/+0.7250R/2.45 | 0 / 0 |
| M54 addition-only | 21/23.8%/−0.2090R/0.69 | 7/42.9%/+0.7857R/2.38 | not separately run |
| Complete M54 | 30/23.3%/−0.1568R/0.78 | 8/25%/+0.2500R/1.40 | 0 / 0 |
| M77 alignment-only | same complete output | same complete output | 0 / 0 |
| M77 exact-RR | same complete output | same complete output | 0 / 0 |
| Final defensive/UI/test stage | same complete output | same complete output | 0 / 0 |

- `m54/parent-*.txt`, `add-only-*.txt`, `magnets-*.txt`: individual stages.
- `m77/alignment-*.txt`, `complete-*.txt`, `defensive-*.txt`: all four profiles.
- `m77/post-measurement-invariance.txt`: full-output comparison after stripping
  ONLY numeric runtime, `[0-9]+ms`; four identical comparisons.
- `m54/*sha256.txt`, `m77/stage-sha256.txt`: original measured core hashes.
- `final-source-sha256.txt`: actual final application files, including the last
  presentation-only single-target headline correction.
- `m77/summary-before.txt` → `m54-summary-final.txt`: expanded composition probe
  **52/2 → 54/0**; stale partial/runner headline fixed for single-target plans.
- `m77/summary-invariance.txt`: **200 actual SMC reads + 16 named contexts = 216**
  comparisons; 0 full candidate-array/0 non-headline result differences, 9 changed
  headlines. Reproducible with `node analysis/probe-m54-summary-invariance.js`.

The measured-complete UI overwrite was corrected by restoring the immutable
alignment version, not by labelling the edited directory an untouched original.
Durable defensive-measured and final patches distinguish the last headline fix.
Addition-only was measured on bare/real15; do not invent its unrun native outputs.

## Final feature suites and controls (passed / failed)

- M54 composition: `m77/m54-summary-final.txt` **54/0**;
  `m54/probe-expanded-parent.txt` **21/33**. Earlier suite was 52/0 vs21/31.
- Actual OHLC M54 discovery: `m77/detector-defensive-final.txt` **6/0** vs
  `m54/detector-parent.txt` **3/3**. 1152 SMC reads; 6727 OB/8986 FVG discoveries;
  73 OB/107 FVG primary selections; zero lifecycle/source/nearest errors.
- M77 core: `m77/core-defensive-final.txt` **87/0**, complete M54 **16/71**,
  c326651 **14/73**. Earlier 78-case suite/controls remain for chronology.
- M77 consumers: `m77/consumers-summary-final.txt` **41/0**, complete M54
  `consumers-ui-default-m54-control.txt` **4/37**. Earlier suites were32 then39.
- The early consumer scaffold incorrectly assumed a separate `/predict` fetch
  and omitted the frontier necessary to reach the live branch. Debug outputs
  remain; final fixtures inject stale/mixed prediction at the actual `/analyse`
  boundary and use the real tab labels. This is not a production-bypass claim.

## Regression / smoke chronology

- Matching current/control bots: `m77/bots.txt`, `bots-parent.txt` **204/2** each,
  19 fills/zero parity mismatches; unchanged minimum20 sample floors.
- Original smoke `smoke.txt` **19/21** vs `smoke-parent.txt` **21/21**. Current
  live-card-only assertions failed; do not call these inherited failures.
- `smoke-final.txt` **21/22**: after explicit withholding, still hardcoded full
  default assertion; corrected to the existing server n≥10 full/all policy.
- Final current `smoke-default-final.txt` **22/22**, full n7/all; parent with same
  revised script `smoke-default-parent.txt` **21/21**, full n12/full. Current alone
  exercises the optional measured-view switch. Both zero console/style failures.
  Informational Segments72-character line is printed on both, not counted.
- `api.txt` **120/1** was cleanup against the wrong disposable client DB;
  `api-correct-db.txt`, `api-defensive-final.txt` **121/0** with matching settings.
- `td-defensive-missing-offline.txt` is the transport failure from one command
  missing offline env; `td-defensive-final.txt` **77/0** after correction.
- Latest Now46/0, chart36/0; M33 67/0, M68 composition62/0, M70 30/0;
  M21 11/0, re-verification67/0. Other same-milestone checks are detailed in
  the report. M68 consumers46/0 did not run the optional migration control.

Reproduction requires installed app dependencies and recovered external inputs
for `--real`. Servers bind0.0.0.0, use `TJ_OFFLINE_CANDLES=1 TJ_SCHEDULER=0` and
matching disposable `TRADEJOURNAL_DB`; blank remote URL/token environment values
on BOTH client and server. Do not interpret local demo tests as production
Turso/Yahoo/Vercel/auth/401/cron validation. No sample thresholds were lowered.
