# M12 — the rule breaks the app already recorded, tallied for the review that reads them

**Delivered:** `src/rule-breaks.js` (`rule-breaks-v1`), `analytics.rule_breaks` on the existing
`GET /api/analytics`, `Views.ruleBreaks.card` on the analytics view, and the two docs.
**Measured:** 79/0 across four probes, the same assertions failing on the tree where the tally exists
and nothing can reach it, and the whole delivery replayed from four saved patches with 0 byte
differences.

## 1. What was missing

Ep 26 lists **rule breaks** among the metrics a weekly review tracks. Both halves of the evidence
already existed, and neither reached the review:

* `correction.dailyState()` derived **named breaches** — which rule, how many, on what day.
* `guardrails.logEvent()` (M64) had been writing every observation and every attempt into
  `guardrail_events`: `blocked_attempt`, `override`, `breach`/`state_observed`, `journal_record`.

What did not exist was a reader. `performance.js` contained **zero** references to a rule break, so
the review could show P&L, session, grade, mistake and hold segments and still not answer *"how many
times did my own rules stop me this week, and which rule was it?"* Four modules already read those
rows as **process evidence** (`behavior-days.js`, `period-reviews.js`, `process-outcomes.js`,
`bots/guardrails.js`), and none of them tallied a break by rule. So the gap was **aggregation**, not
detection — and the delivery is deliberately only aggregation.

## 2. The tally, and the four things it refuses to collapse

`src/rule-breaks.js` is a pure `evaluate()` over already-read rows plus an `inspect()` that reads
this trader's own accounts. It splits the audit by what actually happened, because one number would
overstate it:

| recorded kind | what it is | in the tally |
| --- | --- | --- |
| `blocked_attempt` | an entry attempted while a personal stop was live, refused by the guardrail (**prevented**) | a break |
| `override` | an overridable stop crossed with a **stated reason** (**accepted**) | a break |
| `breach` / `state_observed` | the daily state observed with a live stop — a **condition**, not an attempt | **separate**, never added to the count |
| `journal_record` | legal records and closes during a stop | **excluded**: honest history is not misconduct |

`breaks = prevented + accepted`. Both break kinds are attributed **by the rule the audit itself named**
in the stored day snapshot (`rulesOf()`), so the review says *which* rule fired, per rule and per day,
newest first — and a row that named **no** rule is counted as `unnamed_rule_events` rather than
attributed to a rule it did not carry. A row whose snapshot cannot be decoded is
`unreadable_snapshots`: named, never dropped and never assumed clean.

## 3. The honesty rules are in the payload, not only in the prose

* **Unknown is not clean.** A read failure is `state:'unavailable'` with `breaks:null` — not zero. The
  card renders *"Guardrail audit evidence unavailable. This is unknown, not a clean week and not zero
  rule breaks."* A reversed `from`/`to` range answers `unavailable` rather than being silently widened.
* **A prevented attempt is not an outcome.** It is a refusal the app issued. It is reported as
  *prevented*, beside *accepted*, and never summed with P&L.
* **An observed condition is not an attempt.** `observations` is its own figure.
* **A break is never joined to a result.** `outcome_joined:false` rides the payload with the sentence:
  *"a counted break is a recorded observation, and saying what it cost would be a causal claim this
  journal has not measured."* No P&L sits beside the count, and nothing here influences a grade, a cap,
  a permission or a guardrail decision — the guardrail reads the live state, never this tally.
* **Empty-but-readable is real zeros.** `by_rule: []` with a sentence saying it is a recorded tally,
  not a claim about unrecorded behaviour.
* **A bounded read is flagged, not hidden.** The read is `ORDER BY id DESC LIMIT bound+1`, so it is
  newest-first and `truncated` is reported when the bound was hit.
* **The scope is what was asked for.** `account_ids` names the account(s) the tally covered, even at
  zero breaks, so an empty audit cannot read as no scope at all.

## 4. Delivery shape

The tally rides the **existing** `GET /api/analytics` payload as `analytics.rule_breaks`, scoped to
the **resolved analysed account** (not every desk the trader owns) with `from`/`to` from the payload's
own window. **No new endpoint, no writes.** The UI is one read-only card, `Views.ruleBreaks.card`,
mounted in the analytics view above its existing tabs and loaded by `public/index.html` after
`behavior-days.js`; it renders the total, the per-rule and per-day lines, the two warning lines and the
module's own `basis`/`scope` sentences, and its refresh button refuses to re-navigate when the
workspace, account or session changed under it.

## 5. What was measured

| arm | result |
|---|---|
| delivered tree, 4 probes | **79/0** — pure 26, api 23, migration 12, ui 18 |
| the mode-aware control probe on the delivered tree | **8/0** — the module ships, the payload carries the tally for the analysed account, the three surfacing files exist, and the audit's four existing readers are named |
| the actual `67f2ed2` M112 parent | **0/1 on all four** feature probes — each stops at its first assertion (`the committed parent does not…`); that absence IS the control. The control probe measures **8/0** there (it counts the absence rather than failing on it) |
| pre-hardening runtime (the tally exists, nothing can reach it) | pure **26/0** (the aggregation itself is not the fault), api **1/4**, migration **11/1**, ui **1/1**, control **8/0** — every failing line names the missing surface |
| M112 cohort re-run on this tree | **181/0 across 6 probes** — the one read-only key M12 adds does not disturb it |
| M111 cohort | **152/2** — its own frozen schema negatives, retained by name |
| M110 cohort | **248/10** — the nine inherited declared negatives plus **one new one**: that cohort's consumers probe fails if ANY shipped client names `.windows` (M110's lexical guard for the news provenance echo), and M12's card reads its own payload's `windows` (first/last recorded date, day count). The news echo is still named by no client; the assertion is retained by name, never edited |
| older cohorts | m109 **166/2** · m108 **257/2** · m107 **230/2** · m106 **316/2** · m105 **140/2** |
| inherited arms re-run | RAW **596/156** · DECLARED **824/4** · live-provider **70/1** — identical |
| smoke (`scripts/smoke-test.js`, shipped, unchanged) | **22/22 views, 0 style failures, 0 console errors** on the delivered tree AND on the parent, at the same sample; the smoke output never names the card, so the run is not claimed as card coverage |
| delivery | four stage patches replayed forward and reverse with 0 byte differences, **159 sources**, ZIP rebuilt from the saved patches byte-identical |
| ledger | 132 / **108** done / 2 partial / 22 TODO / 0 no-action / 8 groups |

The pre-hardening control is the real fault, named: the analytics payload carries no `rule_breaks` at
all, an empty-but-readable audit cannot be told apart from an unavailable one, the scope is unreported,
the migration probe finds the tally in two files where the delivered tree serves it, and the UI probe
cannot open `public/js/views/rule-breaks.js` because the card does not exist. Every one of those
failing lines is the same assertion that answers `ok` on the delivered tree.

## 6. What this does not claim

No detection was re-derived and no breach rule was added, changed or retuned. No 70 % win-rate, causal,
predictive, broker, provider, human, mental-state or production claim; no claim that a break cost
money; no fill padding, sample-floor, clock, target, risk or grade retuning; no existing guard
weakened. A counted break is a **recorded observation**: an event the app never recorded is invisible
to this tally, and the payload says so. The sandbox has no market or broker network, so the API probe
seeds its own audits through the app's own SQL shape and the UI probe is a jsdom structural check, not
a pixel proof.

## 7. Delivery

`analysis/build-m12-rule-breaks-artifacts.py` re-derives the four stage trees and asserts every frozen
guard in both directions, stacks the delivered tree onto the pristine `tradingpro-main.zip` (pin
`7a511cab…`) and writes `tradingpro-fixed.zip` (**159 sources**) with its SHA companion in
`analysis/evidence/m12/archive-sha256.json`. Stages: **tally** (the module and nothing able to reach
it — the fault) → **api** (the number travels on the wire) → **card** (the shipped card) →
**documentation**, each with its own patch (`analysis/patches/m12-rule-breaks-*.patch`) and source
guard, plus the pristine cumulative `applied-so-far.patch`. Running the builder twice in replay-only
mode rebuilds every stage from the saved patches and reproduces the delivered ZIP byte-for-byte.

**Carried, not owned:** `tools/jsmin/**` (ten files) was delivered in its own commit `1bf6bab` on top
of the M112 release, before this milestone. It is carried unchanged into every stage tree and into the
fixed archive — derived and pinned by name in `analysis/capture-m12-stages.py` — so a stage measures
M12's own fault rather than the absence of an unrelated tool, and its own apparatus stays frozen under
`analysis/evidence/jsmin/` (113/0 across six probes, `python3 analysis/run-jsmin-verification.py
--suite feature`).
