# §8.2 — the re-verification sweep of the APPLIED rows

**Raised this pass.** The handoff's §7 records the reason: **M21 sat marked APPLIED while
silently dead.** `targetPools()` deliberately put the weak structural extreme first; `setup.js`
then ran `targets.sort((a,b) => a.rr - b.rr)`, undoing it, so the weak extreme led only when it
happened to be nearest — **77 of 1174** eligible candidates. It looked fine because the
three-rung ladder could surface it in *any* rung and the probe accepted
`targets.some(kind === 'weak_structure')`, which passed by coincidence.

§7 names the check that matters, and it is the one applied to every row below:

> not "is the value computed" but **"is the value actually consumed, and does it survive to the
> output"**.

## Verdict

**35 of the 36 APPLIED rows survive re-verification. One did not: M9.** The sweep also raised one
new row, **M120**, which does not change the product but invalidates the grade-conditional half of
every measurement in `harness/BASELINE.txt`.

| | |
|---|---|
| Rows swept | 36 (all marked APPLIED at session start) |
| Survive | 35 |
| Failed → fixed this pass | **M9** (S1) |
| New row raised | **M120** (S2) |
| Ledger after | 120 rows · 37 done · 1 partial · 81 todo · 1 no-action |
| New probe | `analysis/probe-reverify-applied.js` — **55/0** at three sample sizes |
| Cumulative patch | 11 files, **+955 / −103** (was +788 / −93) |

## Row by row

"Consumed" means a decision reads it. "Survives" means it reaches the emitted object — the half of
§7's test that a producer-side probe cannot see.

| Row | Claim | Evidence gathered this pass | Verdict |
|---|---|---|---|
| M1 | `bosSwings()` opt-in, 63 % of labels move | `probe-m1-swing-definition`: "63% of series change trend label … MATERIAL" | ✅ stands |
| M2 | `swing_range` emitted, not enforced | 1181/1181 carry `high`+`low`+`width`+`width_pct`; 167 distinct widths | ✅ survives |
| M4 | news string corrected (batch 0) | `probe-batch0` 10/10 | ✅ |
| M6 | `smc.analyse` sentinel guard hoisted | `probe-batch0` 10/10 | ✅ |
| M7 | sub-`minRR` is a veto | 319/319 sub-2R candidates refused | ✅ consumed |
| M8 | killzone is a veto | 1552 refusals attributed to the killzone | ✅ consumed |
| **M9** | **0.5 % default, 1 % hard ceiling** | **live server: default stored 1 %; `risk_per_trade_pct: 50` stored as 50; `/tools/size risk_pct=10` sized 9.95 % of equity** | ❌ **half-applied → FIXED** |
| M16 | an order block is required | `entry_kind` is only ever `order_block` across 22 950 candidates — consistent with the gate | ✅ |
| M20 | zone layer report-only, annotated dead | static; annotated rather than wired, as the status says | ✅ |
| M21 | the weak extreme is the target | **`weak_structure` LEADS the ladder 759/759** (the dead-wiring figure was 77/1174); 0 unexplained null labels; 0 with weak on the wrong side of strong; `primary_target` keeps `kind` through the spread | ✅ **the §7 defect is confirmed fixed** |
| M22 | nested range opt-in | `probe-m22-nested-range`: 56 % of minor swings outside the major range; 20 % of series change label | ✅ |
| M23 | MSS decided by the sweep test | `mss` true=111 / false=7314 (it can be false); every MSS is a CHoCH | ✅ consumed |
| M24 | CHoCH requires flip + strong level | 496/496 CHoCH have both; `type` BOS=6929 / CHoCH=496; `broke_strong` true=3462 / false=3963 | ✅ consumed |
| M25 | `phase` on every candidate | 22 950/22 950; three values — pullback 1850, balance 544, expansion 86 (not a constant classifier) | ✅ survives + discriminates |
| M27 | swap modelled, round-turn unchanged | `costBps({asset_class:'forex'},{hold_days:3})` → bps 2.45 / round 1.7 / swap 0.75; futures swap 0 (they roll); no `hold_days` → 1.7 unchanged | ✅ |
| M28 | three journal columns | `PRAGMA table_info(journal_entries)` → `proof_lived`, `rule_broke`, `broke_trigger` all PRESENT after migration on a **pre-existing** DB | ✅ |
| M29 | `mitigated` needs the 50 % level | `smc.js:305` sets `mitigated` on `b.l <= mid` ("reached the 50% level") with a separate `touched` for edge-only | ✅ |
| M31 | depth term in zone strength | 15 880/15 880 carry `depth_in_range`; 101 distinct values; mean strength **0.65** at depth ≤ 0.25 vs **0.91** at ≥ 0.75 | ✅ consumed |
| M32 | FVG prerequisite, opt-in | gate bites: 67 order blocks → 39, all with `has_fvg`; signature default `requireFvg = false` per the §5 decision | ✅ |
| M35 | `waiting` refused but still visible | 1630/1630 refused **and** all 1630 still emitted with a level | ✅ |
| M36 | `entries` leg table + weighted entry | `probe-m36-scale-in` 17/17, incl. the scale-OUT no-regression check | ✅ |
| M42 | swept liquidity weighted in strength | both values present (swept 1514 / unswept 14 366); mean strength **0.94** vs **0.72** | ✅ consumed |
| M43 | opt-in and inert | `probe-ep13-unswept-wall` runs clean; the ledger already corrected the premise (496 walls, all swept) | ✅ as recorded |
| M44 | negative result, recorded | recorded as a negative in `BASELINE.txt`; not shipped as a gate | ✅ as recorded |
| M47 | three zone kinds, opt-in | `entry_kind` inside the known set; `stop_reason` never names a different kind than the one used (1851/1851) | ✅ |
| M48 | three criteria recorded, gating not adopted | 2480/2480 breakers carry all three; `confirmed === failed_reaction && broke_structure`; `failed_reaction` shows both values | ✅ |
| M51 | one target by default | 1851 single-target candidates emit **no** `partial_at`/`break_even_after`; runner sized 100 %; multi-target does emit | ✅ |
| M58 | grade drives position size | multiplier matches `GRADE_RISK_MULT[grade]` on 1851/1851; `risk_pct === configured × multiplier`; B/C down-sized 5809/5809 | ✅ consumed |
| M61 | `vetoes` populated and decisive | no refused setup advertises itself as tradeable (2452/2452 worded consistently) | ✅ |
| M95 | gate stays `grade !== 'no-trade'` | `ok === (no vetoes && grade !== 'no-trade')` on **22 950/22 950** | ✅ |
| M96 | booleans decide, score ranks | same identity, plus 64 distinct scores (the score still varies independently) | ✅ |
| M97 | a weight-0 check cannot be a hidden gate | `check-discrimination` reports `management` at weight 0; the sweep confirms the caps do not decide | ✅ |
| M98 | resolved by M58 | multipliers observed are exactly 0 / 0.25 / 0.5 / 1 — the ×1/×1/×0.5/×0.25 ladder | ✅ |
| M114 | false citations removed | `probe-batch0` 10/10 | ✅ |
| M118 | `now` threaded through `analyse()` | `backtest.js:157` passes `now: candles[i].t`; `test:now` 36/0 incl. the killzone-window cases | ✅ |
| M119 | up/down CHoCH asymmetry fixed | `broke_strong` true=3462 / false=3963 (was up=0 across 40 series) | ✅ |

Sample at 25 seeds: 11 475 analyses · 22 950 candidates · 148 990 order blocks · 22 357 breakers ·
73 694 break events. Identical verdicts at 8/900 and 40/1200.

## M9 — the one failure, and what was wrong

The remedy cell says *"Clamp to 1% (or 0.5%) **at the API boundary**."* The status cell claimed
"0.5 % default, 1 % hard ceiling" but named only `correction.js:400` and the `db.js` schema default
— both genuinely done, and **neither is the boundary**. The ceiling existed on one review endpoint
while the boundary the finding itself named was open:

| request | before | after |
|---|---|---|
| `POST /accounts`, risk omitted | stored **1 %** | **0.5 %** |
| `POST /accounts`, `risk_per_trade_pct: 50` | stored **50** | **0.5** locked · **1** with `risk_unlocked` |
| `POST /tools/size`, `risk_pct: 10`, $10k | **1.99 lots, $995 = 9.95 % of equity** | **0.19 lots, $95 = 0.95 %** |
| `POST /tools/size`, `risk_pct: 0.75`, $100k ES | size 1, $612.50 | size 1, $612.50 (**unchanged**) |
| `PUT /accounts/:id` `{prop_preset}` on a 0.75 % row | — | risk **stays 0.75** |

`bots/index.js:120`/`:300` read the stored row raw, so a 50 % account reached `buildSetups()` on the
**main signal path** — `|| 0.5` is a fallback for null/0, not a ceiling. The finding's last clause
was open too: `maxRiskPct` was one hit in `setup.js`, the ctx docstring, never read.

**Fixed** with one shared guardrail (`RISK_GUARDRAIL`, `clampRiskPct()`, `riskGuardrailNote()`) in
`instruments.js` — the module `routes/api.js` and `bots/setup.js` already both import, so the
boundary and the engine cannot drift. Clamped on **write** and on **read**; `risk_unlocked`
persisted via the existing `migrate()` idiom, because an unlock that is not stored would be
re-clamped on every read and the row would disagree with the sizing. Two deliberate design choices:

- A number typed into the calculator **is** the manual act, so `/tools/size` is honoured up to the
  1 % absolute maximum. Clamping it to 0.5 would have broken `api-test`'s legitimate 0.75 % case —
  breaking a passing test to satisfy a regex is not a fix.
- An unrelated `PUT` never moves a stored risk value. A pre-fix row above the guardrail is clamped
  on **read**, not mutated behind the trader's back.

`ctx.maxRiskPct` is honoured **only when supplied**, so the harness (which supplies none) is
untouched and **Baseline 6 reproduces byte-for-byte** — only the wall-clock line differs.

## M120 — the new row: the harness never passed `ctx.bias`

`setup.js:199` reads `Number(ctx.bias || 0)`; the 12-weight check at `:313` is
`bias !== 0 && Math.sign(bias) === dir`. The harness passed no bias, so that check **could never
pass** — `check-discrimination.js` had been reporting `bias` failing **233 of 233** all along. The
server supplies it (`index.js:155`). The trade population is bit-identical either way (bias scores,
it does not veto), so **no entry decision was distorted** — but every grade cut was:

| 120 seeds | bias off (recorded) | `--bias htf` (what the server supplies) |
|---|---|---|
| all signals | n=256, −0.1716R, PF 0.76 | **identical** |
| grade A+ | n=35, **−0.0684R**, PF 0.90 | n=**79**, **+0.2364R**, PF **1.36** |
| A+ and A only | −0.1609R | −0.1745R |
| sized by grade | $−4143 | $−4343 |

This does **not** make the system profitable — `A+ and A only` stays negative and the overall
expectancy is unchanged. And the corrected A+ cell is n=79, **still under this project's own
~100-trade noise threshold**, so the honest statement is that the A+ cut is unmeasured at a usable
sample size in *both* configurations. The sign flip is a reason to distrust the old figure, not a
reason to trust the new one. Full tables in `harness/BASELINE.txt`.

Shipped as an **opt-in** `--bias htf` flag; making it the default would renumber every baseline, so
that decision is left open.

## Three probe defects of my own, recorded because §10 says to

1. **A false failure on M21.** My first assertion was "trending ⇒ both labels", which failed 92 of
   1936. `strongWeak()` has a sanctioned third branch: on a trend label that contradicts the swing
   geometry it emits nulls **with `stale: true`** and attributes the contradiction to M50 rather
   than inventing a target on the wrong side. Measured directly: 1844 labelled + 92 stale + **0
   unexplained**, 0 contradictory. **The probe was wrong, not the code** — the check was rewritten
   and the false finding was *not* recorded.
2. **A static check that tested implementation shape.** The M9 ceiling check was a regex for an
   inline `Math.min(1, …risk_pct…)` in `routes/api.js`. It kept failing *because the fix was good*
   — the clamp had been correctly factored into `instruments.js`. Rewritten to test `clampRiskPct()`
   semantics plus the behavioural question that matters: does `setup.js` read `ctx.maxRiskPct`?
3. **A wrong function signature read as a defect.** `costBps({asset_class:'forex', hold_days:3})`
   returned `swap_bps: 0`, which looked like M27 shipping dead. The signature is
   `costBps(instrument, opts)` — I had put `hold_days` in the *instrument*. Called correctly it
   returns 2.45 / 1.7 / 0.75 exactly as claimed. **M27 is not a defect.** §6, three times in one
   session: *check the input before reporting the output.*

Also recorded: **occurrence-counting is a lead generator, never a verdict.** 16 new field names
appear exactly once in `src/`. Most are the *report* of a local that IS consumed — `depth_in_range`
and `swept_liquidity` are emitted fields while `depth * 0.15` and `sweptLiquidity ? 0.2 : 0` sit in
the strength formula; M58's `grade_risk_multiplier` reports a consumed `effectiveRiskPct`. Each had
to be checked at its consumer.

And: **`analysis/zone-ab.js` is vacuous in this sandbox.** It reports "decision-level
disagreements: 0 / nothing to compare" because it fetched **no candles** — live fetching fails here
per §4 (TLS resets under the per-session SNI allowlist). That 0 is §6's broken-probe case, **not a
null result**, and must not be quoted. It is not a code defect. The other 20 scripts all produce
real output; the nine report-style probes were checked for vacuity markers and have none.

## Full verification after the change

| | |
|---|---|
| `probe-reverify-applied` | **55 / 0** at 8/900, 25/1500, 40/1200 |
| `probe-engine` | 51 / 0 |
| `method-check` | 23 / 0 |
| `probe-m58-grade-sizing` | 20 / 0 |
| `probe-groupa-vetoes` | 18 / 18 |
| `probe-m36-scale-in` | 17 / 17 |
| `probe-batch0` · `probe-m21-strongweak` · `probe-groupb-structure` | 10 / 10 each |
| `npm run test:now` | **36 / 0** |
| `scripts/api-test.js` | **121 / 0** |
| backtest, 60 seeds | **Baseline 6 byte-for-byte** (only the timing line differs) |
| migration | `risk_unlocked` PRESENT on a pre-existing database |
| cumulative patch | applies cleanly to pristine; reproduces the tree byte-for-byte |
| `gen-progress.py` | 120 rows, partition asserted across 7 groups; guard verified to **refuse** on a corrupted copy |

**214 assertions green.** All 21 probe/check scripts exit 0 with no `MODULE_NOT_FOUND`.

## What is still open

1. **M120's default decision** — should the harness pass a bias? It would renumber every baseline.
2. **The 81 todo rows**, next in §8's mechanism order: **M52** (mid-range risk reduction —
   `riskPct` is never scaled by range position) then **M50** (bias hysteresis — `align.bias` is
   re-derived from scratch every call; M21's `stale` branch already points at it, 4.8 % of trending
   candidates).
3. `zone-ab` cannot run here at all, so the zone A/B it was written for remains unmeasured.

---

## Addendum — this sweep's probe has since grown (M52, M50)

The figures above are the record of the sweep **as performed**, and are left as written.
Two of them have since moved, so they are not quoted stale:

- `probe-reverify-applied.js` was **55/0** when this sweep ran and is now **64/0**. The nine
  added assertions are an M52 block (mid-range risk reduction): the depth curve recomputed
  independently of the code under test, the `equilibrium` label agreeing with the 45–55 band,
  the label being reachable at all, the multiplier discriminating, `no-trade` deploying nothing,
  monotonicity within a grade, and strict separation floor-vs-full.
- Two M58 assertions in that probe were **restated**, not weakened, because M52 put a second
  multiplier in the same pipeline: the arithmetic identity is now
  `risk_pct = configured × grade × range` (keeping the old two-factor form would make the probe
  assert that mid-range sizing does *not* happen), and `risk_adjustment_note` is now
  *present iff risk actually moved* rather than *present iff grade below A*. The M58 claims
  themselves — `grade_risk_multiplier` equals `GRADE_RISK_MULT[grade]`, it discriminates, and
  B/C are down-sized — are unchanged and still pass.

Assertion total across the whole `analysis/` suite is now **321 passed / 0 failed** over the
12 scripts that print a tally (276 in the `N passed, M failed` format plus groupa 18/18,
groupb 10/10, m36 17/17); the other 12 are report probes and all 24 exit 0.
