# What each scoring check is actually worth

`node analysis/check-discrimination.js --seeds 40` · 771 tradeable setups · run after M21 + M25.

Purpose: the harness had shown the grade ladder to be inverted. This measures **each check
individually** — expectancy when the check passes versus when it fails — so a re-weighting can be
argued from measurement rather than from taste.

## The grade cut it is trying to explain

| grade | n | expectancy | win |
|---|---|---|---|
| A+ (≥86) | 87 | **−0.360R** | 27.6 % |
| A (72–85) | 578 | **−0.361R** | 25.8 % |
| B (58–71) | 44 | **−0.578R** | 18.2 % |
| C (44–57) | 62 | **−0.308R** | 33.9 % |

**A+ and A are identical to three decimal places.** The top of the ladder does not discriminate at
all. B is the worst cut and C the best. So the checklist's ordering is not merely inverted —
**at the top it is flat**, which means the checks that separate A+ from A contribute nothing
measurable.

## Per-check discrimination

| check | w | nPass | nFail | exp\|pass | exp\|fail | spread |
|---|---|---|---|---|---|---|
| **displacement** | 15 | 732 | 39 | −0.358 | −0.576 | **+0.218** |
| **range** | 10 | 634 | 137 | −0.388 | −0.282 | **−0.106** |
| **structure** | 12 | 357 | 414 | −0.412 | −0.333 | **−0.079** |
| **runway** | 14 | 709 | 62 | −0.375 | −0.308 | **−0.066** |
| management | **0** | 709 | 62 | −0.375 | −0.308 | −0.066 |
| htf | 10 | 298 | 473 | −0.334 | −0.391 | +0.058 |
| bias | 12 | **0** | 771 | n/a | −0.369 | n/a |
| nested | 8 | 20 | 0 | −0.390 | n/a | n/a |
| zone / sweep / session / news / volatility / entry | 16/18/8/10/6/8 | 771 | 0 | −0.369 | n/a | n/a |

**Reading it:**

- **`displacement` (w15) is the only strongly informative check.** +0.218R between passing and
  failing. It is also the highest-weighted behaviour check — the weighting is defensible here.
- **`range` (w10) and `structure` (w12) are backwards on this data** — setups that pass "price is in
  discount" and "internal structure agrees" do *worse* than those that fail. Together they carry 22
  points of weight in the wrong direction.
- **`management` is registered at weight 0** (M97) and its numbers are identical to `runway`'s
  because both test `rrFinal >= minRR`.

## Two limits that make most of this table unusable — stated before anyone acts on it

**1. Six checks are conditioned out by the sample, not uninformative.** `zone`, `sweep`, `session`,
`news`, `volatility` and `entry` show 771 passes and 0 failures because the harness only measures
candidates with `ok === true`, and `ok` already requires them. Their "zero spread" is a **selection
artifact**. Only checks that *vary inside the tradeable sample* can be judged: `displacement`,
`range`, `structure`, `runway`, `htf`.

**2. The `bias` check (w12) was never exercised at all — that was my harness, not the code.**
`setup.js:196` reads `const bias = Number(ctx.bias || 0)`. My harness does not pass `ctx.bias`, so
it is always 0 and the check always fails with "Indicators are mixed — no directional edge."
I nearly reported `bias: 0/771` as a defect. It is not one. **Verifying the input before reporting
the output is what caught it.** Properly exercising it needs `momentum.alignment(htf, mtf, ltf)`
with 4h and 5m series; the harness synthesises 15m and a 1h aggregate only, so it cannot be done
honestly without building those. **Any conclusion about `bias` from this run is void.**

## Decision: no re-weighting

The finding "range and structure are backwards" is real on this data, but **acting on it would be
overfitting**: the series are synthetic, the `structure` cell is split 357/414, and a sign flip on a
synthetic dataset says more about how that dataset was constructed than about markets. The honest
use of this table is as a **hypothesis to test on real data**, not a licence to re-tune.

What this run *does* justify:

- **M97 is downgraded S3 → S4.** The weight really is 0, but `setup.js:418`
  (`rr_final < minRR → score = min(score, 45)`) enforces the same condition as a cap, so a
  sub-minRR setup **is** penalised. The original claim "can never affect the grade" was false.
  What remains is cosmetic: a checklist row that reports pass/fail for a condition that cannot move
  the score.
- **The A+/A flatness is the sharper problem.** It is not that the ladder is inverted at the top —
  it is that the top two grades are indistinguishable. That points at M8 (grade thresholds never
  derived) and M70 (grade is not validated against realised outcomes), both already on the ledger.
