# Handoff prompt — paste this into a new Arena coding session

## Current M81/M82 continuation state — 2026-10-11

- Fixed branch **arena/762c0295-trader**; measured parent **7f1122dade0b9022b595aadc08bbb29badff51f6**.
  Read git for current commit/push. **132:82done/2partial/48todo/0no-action**;
  exact eight groups; M30/M103 partial, M125 TODO. User CONTINUE, no more clarifiers;
  keep floor30/deliberateM103n>=5, no70%/target shrinking or missing IDs.
- [M81/M82 report](M81-M82-PROFIT-RISK.md), evidence/m81 +m82, guarded manifests
  and eight incremental/combined/pristine patches in M81-M82-STAGES.json;
  reproducible build-m81-m82-artifacts.py. **282/0 new across10 probes**, inherited
  unchanged12-probe **302/0** rerun. Not distinct defects/market outcomes.
- M81 optional account daily_profit_limit_pct:NULL/OFF legacy/default, positive
  finite through100/app range, separate lifetime profit_target_pct. First scoped
  UTC profit check freezes ON/OFF/percentage; later edits future day. Legacy cap
  clock retained; NULL new selection marker filled once NOW, no backdated policy.
- Close-day known realised net only, overnight included/future excluded, denominator
  existing day-start equity (start+prior closed net), floating excluded. Unrounded
  comparison inclusive (104.9999display105 stays below105); existing REAL/JS numbers,
  not arbitrary precision. Enabled unknown close/net/policy/clock/amount underflow
  cannot waive; OFF preserves legacy older-undated policy. Truthful repair allowed.
- Profit rule joins durable day-stop whitelist. Observations survive P&L correction,
  deletion/settings OFF/restart until UTC rollover; truthful CRUD/import/research
  remain. Same owned/server-clock transaction/recheck/reason≤2000/plain-string
  single-action/M90 day-review/technical-veto/no-op policies preserved.6concurrent
  stopped entries all409/0writes; audit failure rollback, reopen needs new admission.
- Separate source-stage measures: policy59/0vs3/56; gate51/0vs15/36; consumers60/0vs
  24/36; validation16/0vs8/8; actual7f migration13/0; UI24/0vs7/17. Actual Settings/
  Dashboard/Corrections/modal/review, auth/SQL. Model/candle/cash/bootstrap/chart IO
  seams declared; not pixels, providers or broker execution.
- M82 streak loss×0.6/win×0.9 removed, descriptive reasons retained; real streak
  STOP/cooldown409 stays.29/0vs15/14. Separate after_two_losses25% sizing advice
  removed, detection/evidence fingerprint unchanged;5/0vs3/2. M9 shared clamp now
  covers advisory legacy reads:16/0vs5/11, no DB mutation/constant change. Actual
  new-account0.5 default and base/advisory/off-streak labels9/0vs4/5.
- **Scope correction:** Ep21 explicitly allows drawdown reduction/pause, so prior
  M82 blanket ban withdrawn; separate old drawdown/day-loss advice unchanged. Grade
  M98/M58 mapping A+/A×1,B×0.5,C×0.25 preserved; no automatic A+doubling. M9 .5default/
  locked,1manualmax,.25basefloor preserved. **M85 post-loss reflection/completeness,
  not adaptive size**. Misplaced M94 profit paragraph moved to M81; M94 routine open.
- Initial failures retained: validation11/5vs6/10 used omitted-status CLOSED recording
  not OPEN admission; UI stale-dialog class crash and11-check interactive-promise
  wait/timeout; advice1/4 inactive cyclical fixture; /health SPA parsed as JSON.
  Corrected probes, not production hacks. Shallow checkout lacks fdaa2bc object;
  reverse guarded M79/M80 patch from7f recovers110-file prior migration source with
  zero manifest differences (recorded), old migration9/0. No branch switch/fetch.
- Native current and parent **API121/0 both /bots205/1 both /20fills /0mismatches**.
  Existing>20sample failure kept, both nativeexit1. Earlier19fills/204/2 negatives
  stay historical; changed contemporary synthetic cohort is not improvement.
  Both scripts byte-identical; serial perDB/offline/scheduler0/blank credentials.
  Now50/0,Topdown77/0,Chart36/0,M33 67/0,M78 169/0,M77 41/0,M71 48/0/settings15/0.
  Smoke22/22,0style/console,8canvas limits. Fifteen guarded neutral files including
  ten core engine/model/price-policy, P&L, shared risk constants, lock/native scripts.
- Preview3000: current source,/tmp/m81-final-regressions.db,explicitly synthetic,
  scheduler0/blank remote credentials. Fresh process token tradejournal-synthetic-test-prev-1ed5a4dd;
  check liveness before citing. Old prior-preview token not found; not reused.
  Parent3001 test control stopped after validation. No live/broker/auth/Turso/Vercel/
  cron/pixel/edge claim. User no-key-rotation respected; no real credential commit/use.
- Final source112 files; deterministicZIP/hash companion evidence/m81/archive-sha256.json
  outsideZIP; eight incremental+combined+pristine forward/reverse0byte differences,
  no DB/deps/datasets/secrets. Documentation stage runtime unchanged.
- **NEXT M84 optional session-duration marker, then M85 required post-loss reflection
  /journal completeness**, then remaining risk/review mechanisms. M94/M111/M112/M116
  remain open, all48TODOs/2partials visible. Do not infer incomplete items caused losses
  or repeat the completed M71 twelve-run measurements. Existing M79 admitted-count
  and durable-loss-clock policies continue as documented below.

## Historical M79/M80 continuation state — 2026-10-11

- Fixed branch **arena/762c0295-trader**; parent **fdaa2bc5cd7922df094c53e3991627dc7c1c23ba**.
  Read git for exact current HEAD/push. **132:80 done/2 partial/50 todo/0 no-action**;
  exact eight-group partition; M30/M103 partial, M125 TODO. User CONTINUE; stop
  asking clarifiers, preserve course30 and deliberateM103n>=5, no70%/target shrinking.
- [Authoritative report](M79-M80-GUARDRAILS.md), evidence/m79, incremental guarded
  patches in M79-M80-STAGES.json and reproducible build-m79-m80-artifacts.py.
  M79/M80 plus independently measured M83/M113/M90 complete. Final302/0 feature
  assertions across12 probes (not distinct defects, market outcome or edge tests).
- Cap38/0vs2/36; admission48/0vs10/38; consumers44/0vs16/28; history22/0vs1/21;
  reason29/0vs10/19; actualUI26/0vs backend3/23; prices4/0vs2/2; account6/0vs3/3.
  Parent “detection correct” withdrawn: unawaited rules/account/count/closure-day
  defects. Original deletion acceptance3/1 retained; history was durable but
  permission not. Exact acceptance now4/0; extended durable48/0vs20/28.
- Separate guardrail_day_state and guardrail_entry_admissions; no journal trade
  FK, monotonic observed floor + transactionally counted successful live entries/
  reopens. Journal corrections/backdates/deletes remain legal and cannot reset
  observed day cap/loss/streak stop. Time gates retain observed loss timestamp
  but expire precisely; UTC rollover resets day stops, not a crossing loss clock.
  Existing legacy rows may seed observed current count, not fabricated admissions.
- Selected capdefault3/integer1–100/guidance3intraday5scalping; first UTC check/
  admission freezes it, later edits next day; history only suggestion. Same-account
  reopens count again. Signal/research plans are not executed trade-entry slots
  nor reusable permits. Prospective trade/reopen always rechecked server-side.
- Known stop + reason permits one action with fresh scoped snapshot/linked audit,
  atomic rollback on audit/admission failure. Unknown cannot waive; technical
  veto untouched. Empty/no-op plan grants no permission/event. Validation24/0vs
  retention13/11: only tagged local validation propagates400; arbitrary driver4xx
  remains generic503. Existing public-route{error}400 unchanged. Migration9/0
  actual prior-schema/localDB/idempotence/no backfill, not hosted deployment.
- Actual browser modal/preflight/race/account handling tested, not pixels. Honest
  record-only open/historical/import/research states never permission; captures
  recording-time/unknown, legacyNULL. Real day review escaped/immutable/scoped.
  Independent integer price fix100→1/110→11 and empty-prefix callback composition
  fixed; prior M33 66/1 and M77/M78 crashes retained, repaired67/0/41/0/169/0.
- Native final IO explicitly synthetic/localDB/scheduler0. Identical truthful
  historical/record-only/research fixtures, unchanged existing values/assertions/
  floors; API121/0both, bots204/2both (19fills/0mismatches below20/>20 floors).
  Original live-seed/bulkdelete-reset assumptions failed correctly; failures kept.
  Standalone sharedDB migrationSQLITE_BUSY kept; final suites serial perDB.
  Now50/0,Topdown77/0,Chart36/0,Smoke22views/0UIstyle+consoleerrors; prior consumer
  M33 67/0,M78 169/0,M77 41/0,M71 48/0/settings15/0. All ten engine/model/price-policy
  files byte-identical to parent; no new outcome runs or claim of improvement.
- Preview3000 current code, /tmp/m79-regressions.db, synthetic, scheduler0,
  blank remotecredentials. Host/origin200; control3001 stopped after measurements.
  No broker/liveYahoo/productionauth/Turso/Vercel/cron/pixel proof. User's
  no-key-rotation instruction remains; credentials remain uncommitted/ignored.
- **112 final application files** including guardrails guide; deterministic ZIP,
  archive hash companion evidence/m79/archive-sha256.json outside ZIP avoids
  self-hash. All stage/combined/pristine forward+reverse/byte checks0differences,
  package lock and older patches unchanged. Do not rerun old M71 twelve measurements.
- **NEXT M81 profit stop, then M82 resize / remaining risk mechanism order.**
  M85 post-loss reflection/completeness (old adaptive-size label was wrong),M111 news fail-closed,M112 time-window remain open. All50todos
  +2partials visible. Do not infer other closures or that unfinished items caused losses.


## Historical M71 continuation state — 2026-10-11

- Fixed branch **arena/762c0295-trader**. M71 complete; actual parent **184695d**.
  Read git for exact HEAD/push. **132:75 done/2 partial/55 todo/0 no-action**,
  exact eight-group partition. M30/M103 partial; M125 TODO. Do not ask more
  clarifiers, lower targets/floors for win rate or revive the70% objective.
- [M71 authoritative report](M71-PRIMARY-RR.md): first paid magnet qualifies RR,
  no optional runner rescue. Runway/check/cap/hard veto read rr_primary_exact;
  rr_floor records primary/floor/price/TF/precision. Existing conservative min
  of working/published geometry and1e-9R tolerance; display-rounded2.00 cannot pass
  actual sub-floor. Explicit pre-M77 research rounding remains honestly labelled.
- Default single-target path was already correct. No entry/stop/target/catalogue/
  physicalTF/causal evidence/risk coefficients move. Refused grade-C hypothetical
  size may drop through existing grade policy. Default/eligible sizing identical.
  Single-target instruction now set-and-forget (no algorithm change); Copy labels
  first floor/final not floor evidence; journal targetT1/planned_r now same endpoint.
  Optional ladder display/50%/50%/BE kept; bounded M33/CRT still one target.
- Saved route min_rr and M26 session_pref were silently ignored (undefined db).
  **Separately measured** D.db repairs: primary consumers45/3→floor-only48/0;
  isolated settings7/8→12/3→full15/0. Query wins, defaults/clamps preserved, saved
  NY/queryLondon and savedLondon/queryNY actual gates exercised. API/UIdefault1,
  direct Setup2; user0.1–10 floors retained. Scan existing fixed2 unchanged.
- Feature226/0+48/0+15/0+clipboard6/0=295; exhaustive default full-output path neutrality1/0.
  Parent132/94,12/36,7/8. Actual100 syntheticOHLC→SMC reads/400 candidates:zero
  changed geometry/configured-policy/evidence and default score/grade/permission;
  zero permitted sub-floor targets, but zero detected-candle positive runner rescues in
  this small census. Named composition fixtures explicitly declare narrative/IO.
- **Twelve fresh engine runs** (both arms) on frozen184695d/primary-M71, four
  defaults+two explicit ladder profiles. Every110 appfile/harness/dataset hash
  guarded. All four full default outputs equal except elapsed runtime:bare36/
  19.4%/−0.2944R/PF0.61;real15n9/22.2%/+0.2222R/PF1.40;native outcomes0.
  No improvement/edge. Optional ladder harness STILL valuesT1 only, not partial/
  BE/runner lifecycle:synthetic61/23.0%/−0.2070R/PF0.64→36/19.4%/−0.2944R/PF0.61
  (**deterioration−0.0874R**);real30/23.3%/−0.0263R/PF0.93→9/22.2%/+0.2222R/PF1.40.
  Cohorts differ/sequential scan, not paired causal estimates; realn9<30/dependent.
- Historical current M78core118/1/M76core33/1 are ENTIRE-object comparator failures
  after intentional M71 newfields/narration; raw failures retained, not weakened.
  Frozen pre-M71 tests119/0 and34/0; exhaustive current-vs184695d validates ONLY
  new RR evidence/narration differences and finds zero other changed paths.
  M78consumers169/0,M77core87/0/cons41/0,M75core41/0/cons57/0; rest in report.
- Four independent stage patches + combined M71 delta/cumulative pristineZIP
  patch guarded in M71-STAGES.json; builders clean apply/reverse/byte proofs;
  package lock untouched; root tradingpro-fixed.zip has110 final application files.
  Archive hash companion evidence/m71/archive-sha256.json deliberately excluded
  from ZIP to avoid circular self-hash. Older stage patches preserved.
- Current preview3000 offline synthetic/localDB /tmp/m71-regressions.db,
  scheduler0/blank remote credentials. Parent3001 stopped; correctly addressed
  API121/0 both, bots204/2 both with17 fills/0 mismatches, unchanged sample floors.
  Initial parent bots URL misinvocation203/3 retained, not valid parent evidence;
  explicit TJ_BASE reruns correct. Smoke22/22,0UIstyle/console errors. No live Yahoo/Turso/Vercel/auth/cron/pixel
  proof. Manual save/journal remains research input, not execution authorization
  or server OHLC validation. Production/chart historical issues stay visible.
- **NEXT M79/M80**, guardrail enforcement/accountable override and dependent
  gates independently scoped/measured; preserve course30 M11, deliberate M103
  n>=5 and all existing risk/grade/narrative/basic-pullback/current-stop policies.

## Historical M78 continuation state — 2026-10-11

- Fixed branch **arena/762c0295-trader**. M78 complete; parent/control **256299e**.
  Read git for exact commit/push status. Ledger **132:74 done/2 partial/56 todo/
  0 no-action**, asserted eight-group partition. M30/M103 partial; M125 TODO.
  User CONTINUE; do not repeat clarifying questions or resurrect70% goal.
- Ep20 10:34–11:48 structural agreement selector; actual entry-TF internal flow
  per03:41/09:01,notHTF/conviction/risk. Historical selector was confirmed(tier A)
  ?sf:ag,notfullRisk. Recovered Ep18 does not establish old personality quotation.
  Free Ep18 causal pullback10:43–12:18 remains; advanced38:25–39:08/44:17–44:39
  restricted/unspecified, NOT invented. Preference vs named basic execution distinct.
- entry-preference.js pure rule: known bullish+long/bearish+short aggressive;
  opposed/ranging/unknown conservative. SMC structure_source stamps actual
  closed window/TF/clock; no structure algorithm change. Missing/mismatched/
  future/forming/truncated metadata cannot be guessed closed knowledge. Appended
  unobserved display candles don't change an already-closed labelled read.
- Candidate/Now/chart/scan/Copy/Save/UI/evidence/notes carry same actual TF/variant.
  Momentum compact projection had dropped new field, caught/fixed by consumer
  tests. CRT preferred field remains projection only; no fallback live order
  from projection. Actual candidates own entry/stop/target/RR/risk. Basic post-shift
  zone pullback/M70 fuel/M75 hierarchy+originalbuffer/M33 narrative+half-risk/
  M54/M77 nearest target/noRRrescue and all existing gates preserved.
- Bounded saved preference validates direction/TF/label/variant/clock and no
  advanced permission; nested/duplicate mismatch refused; key reorder accepted.
  Client consistency, NOT server OHLC replay. No DB column/guessed backfill.
  Old live calibration withheld, no new probability or advanced model claim.
- Feature tests **119/0 vs22/97**,consumers **169/0 vs122/47**;288 assertions is
  not132 ledger findings. Actual100 SMC reads/200 preferences **81 aggressive/
  119 conservative**, trends37 bearish/44 bullish/19 ranging;77 last-break/label
  disagreements. Zero source/oldSMC/oldSetup/future read errors. Composition
  fixtures explicitly declare closed structural labels/pools/CRT context; real
  validator/composer/auth/DB/browser run, not full HTF/MTF OHLC-only discovery.
- **ALL EIGHT profile runs freshly executed**, same unchanged4 real datasets.
  Whole four stdout equal parent except runtime (real outputs byte-equal already):
  bare **36/19.4%/−0.2944R/PF0.61**,real15 **9/22.2%/+0.2222R/PF1.40**;
  native13750/known1006/ready0/outcomes0;real4761/known677/ready0/outcomes0.
  No improvement. Real dependent/n9<30; synthetic distorted; native outcomes0
  precludes calibration/ranking. M75 negative result remains, not tuned away.
- Regressions:M33 67/0,M68 62/0,detector16/0,M70 30/0,M54 54/0,M77 87/0,
  M77consumers41/0,M75stops41/0,consumers57/0,M76 34/0,M21 11/0,M26 49/0,
  reverify67/0,TD77/0,Now50/0,chart36/0,API121/0. Botscurrent/parent204/2,
  current12 vsparent17 fills, both0parity mismatches, same≥20/>20 sample floors.
  Wall-clock/cache dependent API cohorts NOT pinned paired outcomes.
- Initialconsumer164/5 exposed scan missing forwarding; final169/0, noassert
  weakened. Initialparent probe dereferenced absent metadata; fixed test input
  to same declared client snapshot, final122/47. M70initial29/1 unknown observation
  timestamp drift; fixture clock pinned, FULL object equality retained30/0.
  Nowoldpremise44/2→explicitstructure+extra cases50/0. Provider failures before
  offlineenv are retained; offline results do not establish production transport.
  Smoke load21/22→serialized SAME code22/22,zero style/console; both retained,
  canvas seam is not pixel/zoom/pan proof. Historical chart issue remains.
- Current preview3000: offline synthetic/localSQLite **/tmp/m78-regressions.db**,
  scheduler0/blank remote credentials. Parent3001 temporary API control is
  **stopped** after verification. ProductionYahoo/Turso/Vercel/auth/cron unvalidated;
  no credentials modified/rotated/stored. Source guards/results evidence/m78,
  complete report **M78-ENTRY-PREFERENCE.md**;110 guarded app files.
- Durable m78-entry-preference.patch applies on256299e; M78-STAGES.json,
  cumulative pristine patch and tradingpro-fixed.zip rebuilt with clean apply+
  reverse/byte comparison, original lock unchanged. Delta12files/45754bytes/
  SHA935fd68f…67cb73e; pristine39files/541853bytes/SHA4c1b5cc3…7b8133a.
  ZIP110appfiles/byte0. Historical builders are
  source-locked; use latest builder, never run old main() on changed source.
- **NEXT M71**: primary/final RR invariant after existing single-target fixes;
  re-check Ep18 simple2R exercise against Ep20 actual-nearest exits, preserve
  user floors and do NOT manufacture/shrink a2Rtarget. M72 optional/gated,
  M73/M46 inducement open; all56todo+2partial remain. Course30 comparison floor
  and M103 deliberately≥5 detector gate unchanged.

Everything below is historical; current state above supersedes earlier counts,
selectors, branch instructions and next-work prescriptions.

## Prior M76/M75 continuation state — historical — 2026-10-11

- Fixed branch **arena/762c0295-trader**; parent/control **9f629c1**. M76/M75
  complete in this milestone; read git for exact commit/push status.
  Ledger **132:73 done/2 partial/57 todo/0 no-action**, exact eight-group partition.
  Partial rows M30/M103; M125 remains todo. User CONTINUE, no repeated questions.
- **Scope correction from original Ep20 17:48–19:35:** CURRENT protected high/low
  first. Without one, nearer valid older protected boundary/entry-zone edge.
  NOT a universal Math.max/min flip to tighten stops. Same0.18 entry-TF ATR buffer.
- M76 closed physical sweep/reclaim + own observed BEFORE-sweep detector pool,
  actual TF/close availability/lifecycle. Current/future pool may not masquerade
  as old liquidity. Candidate sweep catalogue also uses closed observed view.
  Later wick TAKES old boundary; unobserved future cannot invalidate. Strong/fractal
  alone isn't protected. Unknown stays unknown. Inherited80-bar/top10 detection
  bounds disclosed, no unlimited history or global M30/window fix claimed.
- M75 shared stops.js validates adverse raw+published stop. Named causal sweep/fuel
  or actual ordinary zone/shift association/closed sweeping entry candle owns
  current protection; known invalid/taken causal boundary refuses, no farther
  invalidation rescue. Else nearer valid old protection/zone, zone exact tie.
  Unknown evidence explicitly keeps valid conservative old zone/sweep geometry.
  stopPolicy:'legacy' isolates parent arm; no threshold/RR/target shrinking.
- Candidate/Now/chart/scan/Copy/Save/sizing share chosen stop; source TF/kind/rule,
  base/buffer, institution/pool snapshot and invalidation survive. Named evidence
  and existing signal note persist provenance, no new column/backfill. Save-plan
  bounded metadata/price/entryTF consistency checked, NOT claimed server OHLC replay.
  Browser renders stop policy. Legacy live odds remain withheld. M68 causality,
  M70 actual fuel, M33 narrative/key/one HTF target/half-risk and M54/M77 targets
  plus all gates preserved. No named model borrows MTF ATR/protection.
- Separate measurements: parent9f n30/23.3%/−0.1568R/PF0.78 bare,real15 n8/25%/
  +0.2500R/PF1.40. M76 annotation-only ENTIRE four-profile stdout identical except
  runtime. M75 complete n36/19.4%/−0.2944R/PF0.61 bare;real15 n9/22.2%/+0.2222R/PF1.40.
  Deltas **−0.1376R bare/−0.0278R real**; negative retained, no optimization/edge.
  Real dependent/n9<30,synthetic distorted, grade cuts thin. Fresh parent bare/real
  rerun; prior validated parent native stdout reused (NOT new parent native run).
  M75 native outputs equal M76 IN FULL except runtime:13750 reads/known1006/ready0/
  outcomes0;real4761/known677/ready0/outcomes0. No model ranking/calibration.
- Checks:M76 **34/0 vs5/29**,M75 **41/0 vs4/37** (same annotation-only control4/37),
  consumers **57/0 vs41/16**.132 feature checks is separate from132 ledger findings.
  Raw M76 census100 reads/58 high/67 low/52 intact/73 taken/0 source/legacy/prefix
  errors. Raw M75census100 reads/121 nearer/38 unknown-conservative/1 current/
  1 current-invalid,4 changed stops,1 undefined refused,0 executable wrong-side/
  subfloor. No injected detector facts. Other unit/consumer fixtures explicitly
  declare liquidity/zone/structure seams, physically coherent child/parent bars,
  actual lower sweep validator/composer/auth/DB/JS; not full HTF market discovery.
- M75 first35/6 was direct-fixture kind mismatch, fixed without selector change;
  tiny rounding test strengthened to prove intact/rounding branch. Negatives kept.
  Latest:M33 67/0,M68entry62/0,M70 30/0,M54 54/0,M77core87/0,consumers41/0,
  M68detector16/0,M21 11/0,M26 49/0,reverify67/0,TD77/0,Now46/0,chart36/0,API121/0.
  Matching botscurrent/parent204/2,**12 fills/0 mismatches**,same minimum20 floors.
  Do not use older19-fill counts as current or lower floors.
- Concurrent smoke19/22 (3 incomplete route renders)→serialized SAME script/source
  22/22,0 style/console. No asserts changed. Both logs retained; Segments72-char
  informational line/canvas seam remain. No chart pixel/pan/zoom proof.
- Durable results/source guards **analysis/evidence/m75-m76/**; unchanged4 real
  datasets provenance from previous INPUTS.json. Downloads/transcripts ignored.
  Stage patches **M75-M76-STAGES.json**:M76 on9f,M75 delta onM76,complete on9f.
  Cumulative pristine patch38 app files/521991 bytes,clean apply+reverse+byte0.
  FixedZIP109 app source files/byte0, excludes actualenv/keys/.git/DBs/deps/data.
  Rebuild with build-m75-m76-artifacts.py (historical M54 builder's guard is not
  intended to rebuild changed current source). Geometry snapshots isolated.
- Main preview3000 labelled offline synthetic/local SQLite/scheduler0, current DB
  /tmp/m75-regressions.db. Matching clients blank remote credentials. Production
  Turso/Yahoo/Vercel/auth/401/cron remain unvalidated; no credentials rotated/stored.
- **NEXT M78: internal-structure aggressive/conservative ENTRY selection**, not
  stop-buffer. Preserve current-protected priority/nearer-valid fallback/original
  buffer, causal models/M70 fuel, M33 half-risk/target and nearest/no-RR-rescue.
  Course30 comparison floor/M103 deliberately≥5 detector gate unchanged. Keep
  every57 todo+2 partial visible; no invented70% goal.

Everything below is historical; do not let old counts/scopes/branch instructions
supersede the current state above. Do all work on the fixed session branch.

## Prior M54/M77 continuation state — historical — 2026-10-11

- Fixed branch **arena/762c0295-trader**, `/home/user/Trader`. M54/M77 complete in
  this milestone; read git for exact commit/push state. Control/base **c326651**.
  Ledger **132:71 done/2 partial/59 todo/0 no-action**. Only gen-progress.py writes
  PROGRESS; all132 IDs partition into eight groups. Partial rows are **M30/M103**;
  M125 is TODO (older continuation prose calling it partial was wrong).
- Actual opposing unmitigated/unbreached OB + remaining unfilled-FVG edges join
  liquidity/structure. Nearest BEFORE RR; sub0.9R walls stay visible; subfloor
  refuses, no farther weak/measured rescue. Weak label/exact-price tie preserved.
  Default single target, no fictional two-stage verdict; optional old ladder remains.
- Physical source TF differs from PDH/PWL period TF. Named actual entry TF else
  analysis.tf; ordinary same/one-above legal band rejects missing/mismatched/outside
  source. **1m→5m course-explicit**;3m→5m,5m→15m,15m/30m→1h,1h→4h,4h→1d,1d→1w,
  1w same-only are documented engineering adjacency. Real sources only; no extra
  loader or guessed lower catalogue. Availability/window/forming-bar concerns are
  not universally solved here.
- Ordinary CRT range may compete ONLY in a legal physical band; all HTF tables/
  Momentum crtView are projection-only. **M33 alone** bounded_counter_htf /
  m33_internal_pullback: ONE prescribed HTF zone, unchanged narrative/key and half
  ordinary same-grade/range risk. Missing prescribed target refuses without crash
  or fallback. M68 actual causal entry/stop, M70 extreme/fuel policies stay intact.
- Now/chart/scan/Copy/eligible Save use candidate authority, not projected safer/
  aggressive prices. Honest target TF/kind; stored provenance in existing note,
  not a new target column. New geometry's live/refined legacy odds withheld,
  supplied99% cannot enter a revised signal/Save plan. Browser also guards stale/
  mixed payloads, Mechanics teaser, empty frontier and prediction-disabled reads.
  Browser gets prediction from /analyse, NOT a separate /predict fetch; earlier
  investigation assumption was corrected. Standalone predictor research isn't
  new-strategy calibration.
- RR floor uses min(working,published exact geometry), tolerance1e−9R. True1.999R
  displaying2.00R refuses. Broad M125 outlier-tail finding remains open.
- Separately measured control→M54 additions→complete: bare n24/29.2%/+0.7908R/PF2.33
  →n21/23.8%/−0.2090R/PF0.69→n30/23.3%/−0.1568R/PF0.78. Real15 n10/40%/+0.7250R/PF2.45
  →n7/42.9%/+0.7857R/PF2.38→n8/25%/+0.2500R/PF1.40. Complete-parent **−0.9476R bare/
  −0.4750R real**. Negative retained; differing cohorts/cooldown, no optimization.
- M77 alignment/exact-RR/final defensive stage: entire printed outputs identical
  to complete M54 for all4 profiles except numeric runtime. Native13,750 reads/
  known1006/ready0/outcomes0; real-native4761/known677/ready0/outcomes0. ZERO model
  outcome/calibration sample. Addition-only native profiles were NOT run.
- Final feature checks **M54 54/0 vs21/33**, actual OHLC targets **6/0 vs3/3**;
  M77core **87/0** vs M54 16/71/parent14/73; consumers **41/0 vs4/37**. **188/0**.
  Detector1152 reads/6727 OB/8986 FVG candidates,73/107 respective selections,
  0 lifecycle/source/nearest errors. No injected detector facts. Other fixtures
  explicitly supply structure/CRT REPORT, not native HTF discovery or market edge.
- Final safety corrections independently tested: core82/5→87/0; consumers36/3→39/0
  then41/0. Final headline correction52/2→54/0 with216 comparisons (200 actual SMC
  reads+16 named contexts),0 full-candidate/0 non-headline differences,9 headlines.
  `probe-m54-summary-invariance.js` reconstructs the immutable before source.
- Latest geometry/consumer regressions: Now46/0,TD77/0,chart36/0,API121/0,M33 67/0,
  M68entry62/0,M70 30/0,M21 11/0,reverify67/0 (17198 single/0 multi). Other same-pass
  checks:M68storage46/0 WITHOUT optional migration,detector16/0,M26 49/0,M34 11/0/
  110 neutral isolated builds,M12719/0. Do not inflate counts to older runs.
- Matching current/parent bots **204/2**,19 fills/0 parity mismatches, same minimum20
  sample floor failures. Thresholds untouched. Original smokecurrent19/21 vsparent
  21/21 had current-only live-card failures. Explicit withholding requires marker+
  text+ZERO live cards; retain nonempty assertions. Nextcurrent21/22 revealed a
  hardcoded full-default test: existing n≥10 policy falls back to all on thin full.
  Final current **22/22 (full n7→all)** vs parent with SAME revised test **21/21
  (full n12→full)**; current optional view-switch adds one check. Both0 console/
  style errors. Segments72-char is informational on BOTH, not counted. Negative
  logs/scaffold errors/DB cleanup mismatch/missing-offline error preserved.
- Durable logs/data provenance/hashes: **analysis/evidence/m54-m77/**. Downloaded
  4 native datasets/transcripts remain ignored; re-fetch using existing scripts.
  Stage patches+core/tree hashes **analysis/patches/M54-M77-STAGES.json**. Complete
  measured UI briefly overwritten AFTER its measurement, then restored from
  immutable alignment snapshot; measured core unchanged. Defensive-measured and
  final patches distinguish last headline-only correction. Rebuild generator uses
  fresh scratch trees/durable patches, not already-patched `/tmp` controls.
- Cumulative pristine source patch/fixed ZIP clean-apply/byte-roundtrip0, no actual
  env/credentials/.git/dependencies/data included. See current manifest/report for
  exact byte/SHA counts. Live preview3000 is labelled OFFLINE synthetic/local SQLite/
  scheduler disabled; parent control3001 stopped. Production401/providers/Turso/
  Vercel/auth/cron and chart pan/zoom pixels remain unvalidated. No secrets rotated.
- **NEXT M76/M75**: protected levels THEN nearer valid stop/invalidation geometry;
  separate annotation and stop measurements. Preserve causal named entry, buffer,
  actual sweep/fuel, M33 half-risk, nearest targets/no-RR-rescue and all vetoes.
  **M78 is internal-structure entry aggression, NOT stop buffer.** Keep all59 todo
  plus2 partial visible. Course30 sample floor/M103 deliberate≥5 gate unchanged;
  do not pursue70% through small targets. User skipped clarifications: proceed on
  documented judgment, report exact counts.

Everything below is historical. Older counts, scopes and branch/push instructions
must not override the current state above. Do all work on the fixed session branch.

## Prior M68 continuation state — historical (superseded below/above) — 2026-10-11

- Fixed branch `arena/762c0295-trader`, `/home/user/Trader`. M68 complete; read git for
  commit/push state. Parent/control **663659a**. Ledger **132:69 done/2 partial/61 todo/0 no-action**.
  Only gen-progress.py writes PROGRESS; all 132 IDs still partition into eight groups.
- **M68 is actual causal LTF entry geometry, not just naming.** Same formed/touched MTF
  POI → physical closed LTF sweep → later closed exact shift → causal lower OB or opted-in
  confirmed failed-reaction flip → strictly later midpoint AND entry-price pullback.
  Zone must overlap MTF POI; sweep cannot borrow an old distant touch. Later close-through
  invalidates. Missing ATR cannot borrow a MTF stop. Known failures veto; missing distinct
  layers/unknown formation stay unknown. entryModels:false is research isolation.
- Actual lower loader filters forming/future data BEFORE ATR/SMC. analyse/chart share
  explicit clocks. Named candidate owns entry/stop/target in Now/chart/Copy. Step5 remains
  incomplete until actual model pullback. HTF narrative, defining key, single original
  CRT/M33 target, half counter-risk and M3/M8/M26/news/RR/grade/range guards remain.
- M70 causal extreme preference survives live mitigation; actual later fuel excursion
  widens the stop if farther. Flip stays opt-in. BOS/CHoCH/MSS names are report-only.
- Nullable entry_model/entry_tf/entry_evidence in BOTH signal schema owners/migrations,
  trades normaliser/whitelist/CRUD/close, CSV/JSON round trips, actual bot prefill/modal,
  closed journal/resolved signal model review. Historical NULL/unknown is NOT none.
  No guessed tags/backfill; retagging clears contradictory evidence; below30 descriptive.
  Enum/evidence validation includes actual HTTP cases and two-owner isolation.
- Named live probabilities, legacy refined plans and stored p_win are WITHHELD; no named
  calibration exists. Historical research is labelled as other geometry, not model odds.
- New probes against663659a: provenance **15/0 vs5/10**, composition **62/0 vs12/50**,
  detector entries **16/0 vs0/16**, consumers/storage **47/0 vs5/42**. **140 current checks**.
  SMC discovery census96 reads/277 causal associations/129 flip refs/0 invalid/0 legacy diffs.
  Composition fixtures are explicit structural inputs with coherent complete overlapping
  buckets. Raw lower detector positives inject NO structure/zones/sweeps: MTF context is
  explicit and one final pullback is manufactured. NOT full-method historical discovery.
- Frozen provenance, execution (old persistence tail), complete storage snapshots measured
  separately. Bare60-seed stdout identical except runtime at every stage: n24/29.2%/
  +0.7908R/PF2.33, **blind to named entry context**. Native10-seed default13750 reads/
  known1006/ready0/fills0. Opt-in13718/known912/ready0/same ONE unnamed fallback with M68
  ON/OFF, +22.1135R expiry on synthetic seed10. **Named outcome sample ZERO; no edge/ranking**.
  Persistence-stage default/native/opt-in stdout matches execution except runtime.
  Final-step presentation corrected separately60/2→62/0; candidate differences0/8.
- Latest regressions: TD77/0, Now46/0, chart36/0, API121/0, M33 67/0, M70 30/0,
  M26 49/0, M34 12/0/full110 neutral (explicitly M33 AND M68 OFF), M12719/0 consumer-only,
  M10230/0, reverify67/0. Smoke21/21,0 console/style failures; timed-out command subsequently
  completed, final log read, NOT rerun. Bots204/2: both existing sample floors with14 fills/
  checks,0 parity mismatches. Parent663659a also14/14/0 at same 1h bar clock. No lower floor.
- Authoritative record `analysis/M68-ENTRY-MODELS.md`, BASELINE addition and cumulative
  pristine patch: **34 app files /467534 bytes, clean apply,0 round-trip differences**. Rebuild/check artifact excludes .git, node_modules, data and actual env
  secrets. Never touch the real repo .git or commit credentials/databases/generated data.
- Current live preview is **labelled offline synthetic/local SQLite**, not production data.
  HTTP tests do not validate Vercel/Turso/Yahoo/OKX/auth/cron or the production401.
- Next mechanism: **M54/M77** ordinary target composition/TF alignment, preserving M33's
  sanctioned opposing-HTF-zone exception. Also partial M30/M125; remaining61 todo not omitted.
  Keep every row; measure each fix separately; record negatives. Do not pursue 70% by shrinking
  targets. User skipped questions repeatedly: proceed on documented judgment.

Everything below is historical provenance. In particular old M68-open counts and old
branch/switch/push instructions must NOT override the current state above.

## Prior M70 continuation state — historical (superseded by M68 above)

- Repository `/home/user/Trader`; fixed session branch **arena/762c0295-trader**. Never
  execute old branch/switch/push instructions below. Latest milestone closes **M70** (M68 prerequisite), following **M33** and
  dependency findings **M130/M131/M132**. Parent control is **5b942cf**. Tree/commit state must be read from git.
- Ledger: **132 rows;68 done/2 partial/62 todo/0 no-action**. PROGRESS.md is generated
  only by `gen-progress.py`, whose groups remain an exact anti-omission partition.
- M33: a confirmed MTF internal break may originate a bounded counter-HTF execution,
  but HTF narrative/held daily bias do not flip. Actual MTF OB touch now, LTF sweep THEN
  shift, nearest HTF opposing-zone target, half ordinary same-grade/range risk. One target
  even with ladder requested; reached target completes it, no farther replacement. Old
  zones proven obsolete BEFORE this leg are ignored, not mistaken for its target.
  Legacy HTF-CRT priority and M3/M8/M26/RR vetoes remain. M68’s lower-entry-zone work
  remains OPEN: this change deliberately inherits the existing MTF entry-level selection.
- New half-risk helper also fixes the existing counter-CRT promise when conviction=A;
  its confirmed safer entry remains unchanged. Tiny0.005% is not rounded up to0.01%.
  Counter metadata+conflicts survive Momentum’s explicit-field map. analyse/chart/scan
  preserve narrative and original anchor; Now/chart/Copy/saved target prices match.
  Legacy p_win is withheld for the new model, not invented as calibration.
- M130 fixes M50’s actual moving-key bug (confirmed0/4 old anchors retained;0/4 breaches
  released ->4/4 each). Shared nextBiasInvalidation lifecycle; check breach before
  agreement. Same-direction reset is reported; original anchor frozen until reset.
  Existing corrupted historical keys cannot be reconstructed. Server and --bias held
  harness now share this policy; the old harness even selected the key from FRESH sign
  while holding the opposite one.
- M131 fixes higher-feature lookahead in independent harness. actual last_t/causal
  selector, prefix oracle+future perturbation test19/0 (old5/14,9/12 leaking decisions).
  **Prior contaminated backtest figures must not be performance evidence.** Default
 60-seed output stays n24/29.2%/+0.7908R/PF2.33; below30 and blind to topdown. Neither
  invariance proves no leak nor this number proves market edge.
- New --topdown harness: native5m ->complete calendar15m/4h, observed complete higher
  buckets, actual TD/alignment/held bias/Setup, final method-permitted entries only.
  --no-countertrend isolated old arm. At20 seeds x1500:27500 reads; ON657 counter
  contexts,562 complete,0 ready/fills; OFF0 contexts/fills. All657 missed current POI,
  32 phase waits,648 lower waits (overlap). **No sample, no ranking, no gate loosening.**
  Native REAL inputs supported ONLY at5m; do not interpolate lower bars from15m.
- M132 fixes unused clearWorkspace helper: indirect rule/strategy ownership joins,
  schema-discovered directly user-scoped tables, one atomic batch. Tested two users
  with FK ON/OFF24/0 versus old2/22; global presets/market bias preserved. No new route,
  no actual workspace was erased. Discovered by the isolated M33 cleanup fixture.
- New probes: **M33 67/0** (pre-M33 snapshot21/30), **M13042/0** (cefa4db8/25),
  **M13119/0** (M130-only snapshot5/14), **M13224/0** (old2/22). Fixture now lives in
  app scripts/fixtures so standalone restored app tests do not depend on analysis/;
  analysis/helpers just re-exports it. Rebuilt Ep11 diagnostic uses explicit confirmed
  structural inputs; old slope-only walk was ranging/ranging and its old grade-based
  sole-blocker examples were invalid.
- M70: shared Setup.selectZone selects the unmitigated geometric extreme over an
  overlapping opt-in flip, even when a stronger third non-extreme OB ranks first.
  Known failed-reaction fuel must be swept after flip formation with a close-back;
  unknown remains unknown (M8). Rule/fuel price/type/sweep time survive in levels.
  M47 stays opt-in. M48's historical annotation-only/rejected gating decision is
  unchanged by THIS selector: M68 must qualify causal named flip entries honestly.
  Probe30/0 vs parent16/14.60-seed bare default entire output identical except runtime.
  Separate --breakers arms: parent n55/+0.0303R/PF1.06 -> preference-only
  n55/+0.0219R/PF1.04 -> complete preference+fuel n53/-0.0278R/PF0.95.
  **Both changes worsen synthetic expectancy; fidelity, not market edge.** Early
  incomplete draft54/+0.0493R must NOT be quoted as complete fix (missed third-OB case).
  Tracked measurement-only preloader: analysis/helpers/m70-preference-only.js.
- Verified latest suites: API121/0,chart36/0,Now46/0,topdown77/0,bots204/2;
  smoke21/21,0 style/console errors. BOTH bots failures are filled sample11 against
  unchanged >=20 / >20 floors;0 parity mismatches. Parent5b942cf also fills/checks11
  at same clock,0 mismatches. Do not lower sample floor or call this an M70 regression.
  Prior milestone’s20-filled result is clock-dependent history, not current numbers.
- Old topdown test76/1 on SAME parent/current: ordinary-only text regex rejects M33's
  equally explicit non-averaging counter note when synthetic bars activate that branch.
  Branch-specific exact-contract assertion restores77/0 on current AND parent.
  Production notes/direction unchanged; no assertion just removed or loosened.
- Run DB-writing suites API/bots/smoke serially; latest source server restarted, labelled
  synthetic candles, local SQLite. This does not validate production401 or live feeds.
- Latest narrowed fleet green, reverify67/0; prior milestone’s full fleet is historical. M41 cost gate CPU-sensitive:233ms idle (<250 unchanged).
  M34 turns ONLY M33 off to isolate dead-layer neutrality (110 results unchanged).
  M127 uses its original29fa456 negative control; normalizes ONLY M69’s known neutral
  prose rewrite in full candidate comparison (0/920 remaining changes). M69 tests its
  new accurate label/event wording. BOS/CHoCH/MSS taxonomy stays report-only (groupB).
- Controls: M12729fa456; docs/clock probesb7ec114; M130cefa4db; pre-M33/M132=cefa4db
  plus separately measured M130/M131. Temp controls/node_modules may vanish on reset.
  Run candles-yahoo WITHOUT TJ_OFFLINE_CANDLES (fetch is stubbed); API-backed probes
  need the flag and a restarted server. Preview uses labelled synthetic candles only.
- M68 researched only, no causal composition/persistence edits shipped. Ep18:
  MTF POI mitigation -> LTF sweep -> confirmed shift -> wait for the causally linked
  LTF OB mitigation (market_shift) or confirmed flip-zone mitigation (flip).
  No pullback = no trade. Explicit OB->break identity absent; strongest-first OB
  dedup may discard displacement associations. Flip detector doesn't expose its
  matching break identity and generic retested may precede confirmation. Add causal
  provenance/tests, then actual distinct levels/consumer forwarding and journal
  entry_model column, CRUD/import/export/modal/model-review. Missing historical tags
  stay unknown, not retrospectively guessed. Existing M33 fixture has empty LTF OBs;
  extend it coherently, never treat old MTF entries as proven LTF model executions.
- Next: remaining **62 todo**, in mechanism order. High-related work **M68** (named
  entry models and actual LTF entry zones), **M54/M77** (ordinary target composition/
  explicit TF constraint, preserving M33’s sanctioned counter-HTF exception); also the
  two partial rows M30 and M125. Keep every row, measure separately, record negatives.
- Cumulative source patch: **31 files**, clean apply, **0 round-trip differences**.
- Rebuild cumulative source patch from pristine zip + app overlay, excluding .env,
  data,node_modules,.git; explicit scratch git identity; second-pristine clean apply
  and ZERO round-trip differences. The pristine zip contains an old .git: exclude it
  from SCRATCH unzips before git init (otherwise an embedded gitlink yields an empty
  diff). Never touch the real repository .git. Preserve credentials/database/fixtures untracked.

The original handoff is retained below as provenance, not as the current branch/state.

---

> Copy everything below the line into the new chat as the first message.
> It is written to be self-contained: it assumes the new session has read nothing else.

---

You are continuing a long-running audit and repair of the repository `Baatinarolu/Trader`,
checked out at `/home/user/Trader`. Read this whole message before doing anything.

## 1. What the task is

The original request was: **"Analyze the whole zip file"** (`/home/user/Trader/tradingpro-main.zip`,
11,428,946 bytes, root folder `tradejournal/`). That produced `ANALYSIS.md`.

It then grew into two things that are still live:

1. **Audit whether the bots faithfully implement the course they claim to encode** — the *free
   Market Mechanics Mentorship* playlist by Brad Goh / The Trading Geek: the 5-step CRT top-down
   process, SMC primitives, the sniper entry, the no-trade rules, killzones, risk. Every mismatch
   found is recorded as a numbered finding.
2. **Fix those findings.** All 119 are to be covered, nothing omitted. The user explicitly
   authorised working in whatever order suits, provided nothing is skipped.

## 2. Exact current state (verified, not remembered)

- Branch: **`arena/0f969311-trader`**. HEAD: **`33eb20d`** "Restore the full audit…". Base: `96ef0ee`.
  Working tree **clean**. One commit ahead of base.
- **`origin` push is not available from the previous session** (it was closed). The very first job
  in the new session is to `git push origin arena/0f969311-trader` — everything is committed locally
  and nothing is on the remote yet.
- Ledger: **119 rows (M1–M119), strict 1..N, 0 malformed, 0 NUL.**
  Status: **36 done · 1 partial (M30) · 81 todo · 1 no-action (M3)**.
- Source patch: **11 files, +788 / −93** (`analysis/patches/applied-so-far.patch`), verified to apply
  cleanly to the pristine archive and to reproduce the working tree byte-for-byte.
- Current measurement baseline ("**Baseline 6**"):
  `60 seeds: n=122, win 18.9%, exp −0.0011R, PF 1.00, A+ n=15 +0.1355R`
  `120 seeds: n=256, win 19.1%, exp −0.1716R, PF 0.76, A+ n=35 −0.0684R`

## 3. The files that matter

| Path | Role |
|---|---|
| `analysis/MISMATCHES.md` | **The primary artifact.** 119 findings. Each row has exactly **7 cells**: `#` · Sev · From · What does not match · Change/add · Status (indices 1–6 after `split('\|')`). |
| `analysis/PROGRESS.md` | Generated **only** by `python3 analysis/gen-progress.py`. Never hand-edit. It exits non-zero and writes nothing unless groups A–G partition the ledger. |
| `analysis/EPISODE-AUDIT.md` | Verbatim course quotes for episodes 0–33. Consult this instead of re-fetching transcripts. |
| `analysis/patches/applied-so-far.patch` | Cumulative source patch. Regenerate by diffing `/tmp/pristine/tradejournal/src` against `extracted/tradejournal/src`. |
| `analysis/harness/backtest.js` | Backtest. Flags: `--seeds --bars --window --swingmode local\|bos --no-nested --ob-fvg --all-swings --breakers --stand-down-wall --ladder`. |
| `analysis/harness/BASELINE.txt` | Every measurement, **including the negative ones**. Baseline 6 is current. |
| `analysis/probe-*.js` | Verification probes (see §6 for which need which CWD). |
| `analysis/playlist-verified.json` | Playlist order. Note `ep` is a **string**. |

## 4. Environment quirks — these have all bitten already

- **`extracted/` is gitignored and gets wiped between sessions.** Always
  `ls extracted/tradejournal/src` first. Rebuild with:
  ```
  cd /home/user/Trader && mkdir -p extracted && cd extracted
  unzip -q -o ../tradingpro-main.zip
  cd tradejournal && npm install --no-audit --no-fund
  git apply ../../analysis/patches/applied-so-far.patch
  ```
  Also rebuild `/tmp/pristine/tradejournal/src` from the clean extraction **before** applying the
  patch — it is the reference for patch regeneration and verification.
- **The real file is `src/bots/setup.js`, not `src/setup.js`**, and `src/bots/smc.js`, not `src/smc.js`.
- **Tests live in `scripts/`, not `test/`.** Run `npm run test:now` and
  `node scripts/api-test.js http://127.0.0.1:3000` (URL passed as argv).
- **Restart the server after any `src/` edit before running `api-test`** — a long-running server
  keeps stale code. Use the process tools, not `nohup … &` (that times out at 120 s).
- **Probes are CWD-sensitive.** The four `setup.js` probes must run from `extracted/tradejournal`;
  the newer ones from the repo root.
- **Test scripts can exit 0 while printing `MODULE_NOT_FOUND`.** Parse stdout, never trust the exit code.
- `bc` is not installed. `sed -i` breaks on unescaped parens — use `python3`. Chain with `;` not `&&`
  (later greps otherwise run from the wrong directory).
- **Live candle fetching fails in the sandbox** (per-session SNI allowlist: DNS and TCP succeed, TLS
  resets). This is *not* a blanket no-network condition, and it is *not* a code defect — the same code
  path worked in the session where the user originally built the project. Never claim the code is broken
  because of it.

## 5. Decisions the user has already made — do not re-ask

| Item | Decision |
|---|---|
| **M95** | Keep grades **B and C tradeable**. |
| **M21** | **Add** strong/weak structure. |
| **M9** | **0.5 %** default risk, **1 %** behind a manual unlock. |
| **M16** | **Require an order block.** A standalone FVG no longer passes the POI gate — but entering on OB mitigation *with no FVG* stays allowed. |
| **M1 + M22** | **Adopted as engine defaults** (`swingMode:'bos'`, `nested:true`). |
| **M32** | **Stays opt-in.** It cuts trades 190 → 18. |
| **M47** | **Ship the bug fix, keep the wiring opt-in.** |

## 6. Rules earned the hard way — obey these

- **`node --check` verifies nothing about execution.** After any edit, run the real entry point once
  before measuring. A `ReferenceError` on first call has already happened twice.
- **A classifier returning one value across the whole sample is broken**, however plausible the logic.
  Always print the split at the sample size you intend to report. Print distinct-value counts to prove
  a new term discriminates.
- **A probe that reports zero on *both* arms is a broken probe, not a null result.** Twice now a probe
  silently measured nothing — once because it ran outside a killzone, once because it compared against
  the candle close instead of the entry price (841 false violations).
- **Check the input before reporting the output.**
- **Never report a grade cut from a small sample.** A "+0.1164R at n=16" became "−0.4907R at n=52".
  Anything under ~100 trades is noise. Verify across at least three sample sizes.
- **When you change a decision, re-read every string and field that describes it.** This has caused
  four separate defects: a refused setup that advertised itself as tradeable, `kind:'order_block'`
  hardcoded over a flip zone, an `entry` taken from a field the object does not have, and a
  `partial_at` emitted for a single-target trade.
- **Grep every `.map(` that reconstructs an object** — new fields get dropped there.
- **Ledger edits are fragile.** Parse cell 1 and assert the row was found (IDs are *not* uniformly
  bolded). Count cells (`== 8` after split) before writing — the `Change/add` column has twice been
  split into two. Restore the `\x00` sentinel across the whole rejoined line and assert NUL count 0
  after every write.
- **A backtick inside a SQL comment breaks the schema** (`db.js` splits on bare `;` inside a template literal).
- **Never trust a remembered line number** — verify with `sed -n 'Np'` / `grep -n`. Roughly ten cited
  line numbers were wrong.
- **A feature can sit marked "APPLIED" while its code path is dead.** See §7.

## 7. The single most important lesson from the last session

**M21 was marked "applied" and was silently dead.** `targetPools()` deliberately puts the weak
structural extreme first ("target weak structure"), but `setup.js` then ran
`targets.sort((a,b) => a.rr - b.rr)`, which undid it. The weak extreme only led when it happened to
be nearest — **77 of 1174** eligible candidates. It looked fine because the old three-rung ladder
could surface it in *any* rung and the probe accepted `targets.some(kind === 'weak_structure')`.

**So: re-verify the other rows marked APPLIED before adding new work.** Several were verified only by
a probe written in the same pass that wrote the code. The check that matters is not "is the value
computed" but **"is the value actually consumed, and does it survive to the output"**.

## 8. What to do next, in order

1. **Push.** `git push origin arena/0f969311-trader`. Nothing is on the remote.
2. **Re-verification sweep** of the 36 APPLIED rows (§7). Highest value item outstanding.
3. **M52** — mid-range risk reduction. Course: *"if it's mid-range… reduce your risk, use a smaller
   position size."* `riskPct` is a constant from the request context, never scaled by range position.
4. **M50** — bias hysteresis. *"Your bias only changes when your invalidation is hit."* Needs a state
   store; `align.bias` is re-derived from scratch every call.
5. Then the remaining ~81 todo rows, in mechanism order.

## 9. Verification before you call anything done

```
cd /home/user/Trader/extracted/tradejournal
for t in probe-batch0 probe-m58-grade-sizing probe-m21-strongweak probe-groupa-vetoes \
         probe-groupb-structure probe-m36-scale-in probe-m57-compliance \
         probe-m69-market-shift probe-m38-m40-affinity probe-m37-killzone-offsets; do
  printf "%-26s " "$t"; node ../../analysis/$t.js 2>&1 | grep -E "passed" | tail -1; done
npm run test:now
# restart the server, then:
node scripts/api-test.js http://127.0.0.1:3000
cd /home/user/Trader && node analysis/harness/backtest.js --seeds 60 --bars 1500 --window 300
```

Expected green, **re-measured 2026-10-10** after M37/M38/M40/M57: batch0 **11/0**, m58 **23/0**,
m21 **10/0**, groupa **18/18**, groupb **10/10**, m36 **17/17**, m57 **6/0**, m69 **16/0**,
m38-m40 **49/0**, m37 **20/0**, now-test **36/0**, api-test **121/0**, bots-test **204/2** (the two
sample-size gates), chart-test **36/0**.

The old figures in this list were stale in two places and are worth naming so the next reader does
not chase them: batch0 was **10/10** and m58 **20/20**. batch0 went red at M69 (`5a08ba6`), which
rewrote the structure checkpoint's detail string from *"Structure reads bullish after a BOS up 4
bars ago"* to the market-shift wording; the probe kept asserting the old text and nobody re-ran it.
It is re-pointed now (and gained one assertion, so 11 not 10). m58 grew to 23 as its own row was
extended.

The backtest line below was also stale. `--seeds 60 --bars 1500 --window 300` currently reproduces
**n=27 / win 25.9% / +0.5918R / PF 1.93**, not **n=122 / −0.0011R / PF 1.00**. n=27 is below the
course's own 30-trade floor, so this arm is a REGRESSION GATE (does the number move when it should
not?) and not a performance claim. For a sample above the floor use `--seeds 200`, which after M69
gave **n=101 / win 24.8% / +0.0357R / PF 1.06**.

## 10. Standing instructions from the user

- Keep a running list of what does not match and what needs changing or adding.
- Derive scope from the transcripts, never from your own sense of clean layering.
- **Measure every change separately so it can be attributed.**
- Do not leave anything out.
- Cite the pristine-zip diff when defending what was and was not changed — never assertion.
- **Record negative results.** Four items (M44, M48, M32, M43) measured no better as enforced gates
  and were recorded rather than quietly dropped or quietly shipped. The course's rules are
  consistently right about *what to look at* and consistently not better as hard filters on synthetic
  data. Say so plainly rather than dressing it up.

## 11. Loose ends worth knowing

- **Seven bonus/tool videos were never read:** `iKRW0G6yPmM` (LIVE), `cFzxyGRtAis`, `kJWmeSLfP64`,
  `EsVHKs24qBI`, `vU16QHmX3x4`, `3_QR4XFVbKE`, `AVS6QneKmAA`.
- The course is **internally inconsistent** on max daily profit (5 % in one episode, 1 % in Ep 31) —
  that annotates M94, it is not a new finding.
- `predict.js` has `/^[A-Z]{6}$/` → `pip_size: 0.0001`, which is 100× wrong for JPY pairs.
  **Reachability unverified.**
- `rr_final` is frequently degenerate — median 15R, max 346R on single targets, worse on the ladder
  (median 45R). Pre-existing, not yet a ledger row. It undermines all "declared R" reporting.
