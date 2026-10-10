# Handoff prompt — paste this into a new Arena coding session

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
