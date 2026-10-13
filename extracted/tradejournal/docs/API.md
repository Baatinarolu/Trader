# REST API reference

## M87 optional owned visual evidence

- `GET /api/trades/:id/screenshots`: canonical positive integer owned ID; three
  slots/questions/revisions and same-snapshot saved financial context. Empty
  is known missing; storage outage503 is unknown, not empty. Legacy unassigned.
- `PUT /api/trades/:id/screenshots/:role`: role exactly `htf|mtf|ltf`; body
  `{revision,timeframe,image,note?}` only. Required displayed64-hex revision binds
  saved finance and current role attachment. No owner/source/client clock/score
  fields. Note plain text<=2000; timeframe explicit canonical `1..1440m`,
  `1..48h`, `1..365d`, `1..52w`, `1..12M` (M months), without padding/defaults.
  Static PNG/JPEG/WebP canonical base64 upload1,500,000 decoded bytes/24MP/16,000
  dimension, or HTTPS hostname without userinfo/IP/local targets/recognisable
  credential query names. Structural checks NOT full decode/chart verification;
  no backend link fetch/DNS/content/publicness verification. Identical current
  retry preserves original recording time.
- `DELETE /api/trades/:id/screenshots/:role`: body `{revision}` only; independently
  clear one role, never legacy/siblings/financial history. Trade deletion cascades
  its child rows. Browser `API.del(path,body?)` preserves old bodyless callers.
- Auth401; absent/foreign/noncanonical ID404; bad shape/role/frame/image400;
  changed saved record/role409; storage read/write failure503. Real transaction
  rollback, no partial new source/time/hash or financial-row update.

`recorded_at` is server attachment/import receiving time, NOT actual screenshot
capture. `matches_current_trade` concerns listed saved financial fields, NOT
broker/chart verification; null means original imported context unknown. Truth
correction preserves earlier image/time but flags prior context. Duplicate
resource refs (URI aliases canonicalised for fingerprint only), equivalent
frames (`60m==1h`, etc) and corrupt stored metadata explicitly labelled; no
3-independent-view or whole-course completeness proof.

JSON trade `screenshots={version:1,roles:{htf:{timeframe,image,note,
declared_recorded_at?,declared_context?},...},unavailable_roles:[...]}`. CSV adds
`screenshot_views_json` and
`screenshot_url` legacy. Safe known refs only; unsupported/corrupt roles marked
unavailable, unsafe legacy omitted without rewriting stored original. Context
excludes original owner/trade/account IDs; restore uses actual transaction
insert IDs and owned destination, never raw backup IDs. `source` always
`imported_upload|imported_external_link`; client source/revision/verified flags
ignored. Receiving time new, declared historical time/context unverified; invalid
future time dropped; unknown context not inferred from imported finance.
`media_imported`, `media_skipped`, bounded `media_warnings` returned alongside
financial inserted/skipped counts. Invalid optional media warns/skips without
vetoing finance; real storage failure503 rolls back request together. Existing
API25MB body budget unchanged (Settings files20MB); split larger backups. No
upsert/idempotent financial restore or broker/core/routine/permission replay.

Screenshot-aware JSON/CSV export failure returns safe JSON503, not an HTML SQL
stack. Visual endpoints/imports are independent of required writing, execution
grades, risk/caps/preparation and prospective admission. Protected core unchanged.

Base URL: `http://localhost:3000/api`
Auth: session cookie (`tj_session`) **or** an `x-session: <token>` header. There is **no sign-in wall**:
`POST /auth/local` hands the caller a workspace (reusing the database's existing one locally, minting a
private one per browser when hosted), so a script can be authenticated in a single request.
All request bodies are JSON. Errors return `{ "error": "message" }` with an appropriate status code.

---

## Auth

| Method | Path | Body / notes |
|---|---|---|
| POST | `/auth/register` | `{ email, password, name }` → creates user, default account and starter playbook; sets session |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/demo` | one-click demo user (seeds 235 trades on first call) |
| POST | `/auth/local` | the no-sign-in workspace: `?fresh=1` (or `{"fresh":true}`) mints a brand-new empty workspace, otherwise it attaches to the existing / private one |
| POST | `/auth/logout` | clears session |
| GET | `/auth/me` | `{ authenticated, user }` |
| GET | `/bootstrap` | everything the UI needs on load: user, accounts, strategies, instruments, stats |

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"demo@tradejournal.pro","password":"demo1234"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
curl -s -H "x-session: $TOKEN" localhost:3000/api/bootstrap | head -c 400
```

---

## Trades

| Method | Path | Notes |
|---|---|---|
| GET | `/trades` | Filters: `account_id,from,to,symbol,strategy_id,status,tag,q,limit,offset`. Returns decorated trades (`session_label`, `hour`, `weekday`, `hold_minutes`, `is_win`, `r_multiple`…) and `total` |
| GET | `/trades/:id` | single trade with computed fields |
| POST | `/trades` | create — see body below |
| PUT | `/trades/:id` | partial update (merged with the existing row, then recomputed) |
| POST | `/trades/:id/close` | `{ exit, fees, closed_at, exit_reason, lesson }` — closes an open trade and computes P&L/R. **Scale-out:** pass `legs: [{ pct, price, reason? }]` instead of a single `exit` and the trade is closed at the **pct-weighted** price (50/25/25 @ 20100/20200/20250 → 20162.5, +487.50, 1.625R on a 100-point stop, size 3, fees 0). The legs are stored as JSON on the trade, and a `trade_closed` notification fires to every saved channel |
| DELETE | `/trades/:id` | delete one |
| POST | `/trades/bulk-delete` | `{ ids: [1,2,3] }` |

**Trade body (POST/PUT)** — only `symbol` and `entry` are required:

```json
{
  "symbol": "EURUSD", "direction": "long", "status": "closed",
  "account_id": 1,
  "entry": 1.0850, "stop": 1.0820, "target": 1.0925, "exit": 1.0912,
  "size": 0.5, "fees": 3.5,
  "opened_at": "2026-10-06T08:15:00Z", "closed_at": "2026-10-06T11:40:00Z",
  "strategy_id": 1, "setup_grade": "A", "exit_reason": "Discretionary win",
  "planned_r": 2.5, "mae_r": -0.4, "mfe_r": 2.1,
  "emotion_before": "Calm", "emotion_after": "Satisfied", "confidence": 4, "adherence": 5,
  "mistakes": "Entered early", "tags": "Pullback, A+ setup",
  "thesis": "London pullback into EMA20 with HTF trend intact",
  "lesson": "Patience on the retest paid",
  "rule_checks": [{ "label": "HTF trend confirmed", "passed": true }]
}
```

The server computes `gross_pnl`, `net_pnl`, `risk_amount`, `r_multiple`, `session` and `exit_reason`
from the instrument specification — never send computed P&L unless you intend to override it.

**Granularity note:** `mae_price` / `mfe_price` may be sent instead of `mae_r` / `mfe_r`;
they are converted using the stop distance.

---

## Analytics, coach, briefing

| Method | Path | Notes |
|---|---|---|
| GET | `/analytics` | Full payload: `kpis`, `equity[]`, `daily{}`, `monthly{}`, `distribution[]`, `points[]` (per-trade R/MAE/MFE/risk), segment tables (`by_strategy`, `by_symbol`, `by_session`, `by_timing`, `by_emotion`, `by_mistake`, `by_tag`, `by_hold`, `by_adherence`, …), `time{}` grids. Accepts all trade filters. |
| GET | `/analytics/monte-carlo` | `?risk_pct=1&horizon=100&sims=2000&start_equity=10000&ruin=50` → `monte_carlo` percentiles + `optimal_risk` (Kelly / half / quarter) |
| GET | `/coach` | `{ insights:[{ id, severity, title, detail, impact, evidence[], action }], score:{score,grade}, summary }` |
| GET | `/briefing` | pre-session plan: market context, risk multiplier and reasoning, performance snapshot, open positions, focus items, checklist |

```bash
curl -s -H "x-session: $TOKEN" "localhost:3000/api/coach" | python3 -m json.tool | head -40
curl -s -H "x-session: $TOKEN" "localhost:3000/api/analytics/monte-carlo?risk_pct=1&horizon=250" | python3 -m json.tool
```

---

## Journal, goals, watchlist

| Method | Path | Body |
|---|---|---|
| GET | `/journal` | list entries |
| GET | `/journal/:date` | `{ entry, trades }` for one `YYYY-MM-DD` |
| POST | `/journal` | `{ entry_date, market_bias, mood, energy, focus, plan, review, lessons, tomorrow, screen_time_minutes }` (upsert) |
| DELETE | `/journal/:id` | |
| GET / POST / PUT / DELETE | `/goals` · `/goals/:id` | `{ title, metric, target, period, due_date, done }` — `metric` ∈ `net_pnl, expectancy_r, win_rate, profit_factor, adherence, trades`; progress is computed live |
| GET / POST / DELETE | `/watchlist` · `/watchlist/:id` | `{ symbol, asset_class, thesis, bias, key_level, catalyst }` (upsert on symbol) |

---

## Accounts, strategies, instruments

| Method | Path | Notes |
|---|---|---|
| GET | `/accounts` | includes per-account stats: net P&L, expectancy, drawdown vs limit, open risk, target progress |
| POST/PUT/DELETE | `/accounts` · `/accounts/:id` | `{ name, broker, account_type, currency, starting_balance, risk_per_trade_pct, daily_loss_limit_pct, max_drawdown_pct, profit_target_pct, prop_preset, prop_rules }` — `prop_preset` applies a named challenge shape (see `/prop/presets`), `prop_rules` overrides it with your own numbers |
| GET | `/accounts/:id/challenge` | `{ preset, status: { ok, passed, checks[4], progress_pct, drawdown_pct } }` — daily loss, max drawdown, profit target and consistency checked against the account's own trades |
| GET/POST/PUT/DELETE | `/strategies` · `/strategies/:id` | `{ name, description, market_conditions, timeframes, entry_rules[], exit_rules[], checklist[], risk_rules, target_r_multiple, colour, active }`; GET also returns per-strategy performance stats |
| GET/POST/DELETE | `/instruments` · `/instruments/:id` | instrument spec: `{ symbol, name, asset_class, exchange, currency, tick_size, pip_size, value_per_point, unit }` |

---

## Tools

| Method | Path | Body → result |
|---|---|---|
| POST | `/tools/size` | `{ symbol, balance, risk_pct, entry, stop, target }` → `{ size, unit, risk, reward, rr, breakeven_win_rate, pips_to_stop, percent_move_stop }` |
| POST | `/tools/expectancy` | `{ win_rate, avg_win_r, avg_loss_r }` → `{ expectancy_r, expectancy_per_100_trades, breakeven_win_rate, verdict }` |
| POST | `/options/greeks` | `{ spot, strike, iv, dte, type: call \| put, rate? }` → `{ price, delta, gamma, theta, vega, breakeven, moneyness, intrinsic, extrinsic }`. **`iv` is required** — the endpoint returns `{ ok: false, error }` instead of inventing a volatility; there is no options feed |
| POST | `/options/plan` | `{ spot, strike, iv, dte, type, contracts, stop_premium, target_premium, budget? }` → premium risk (`risk_total`, `max_loss`), R:R and theta bleed per day. If the target premium is not above the entry premium the response carries `warning` and `rr: null` instead of a fake ratio |
| POST | `/options/size` | `{ premium, multiplier?, budget, balance? }` → how many contracts the budget affords and what that risks |
| GET | `/risk/exposure` | `?account_id=` → `{ heat, clusters[{ key, symbols, direction, risk, risk_pct }], warnings[] }` — open positions grouped into correlation clusters (metals, USD, crypto, indices…) so long XAU + long XAG is visible as one bet |
| GET | `/prop/presets` | named challenge shapes (`eval_5_10`, `eval_6_6`, `instant_5`, …) with daily-loss / max-drawdown / profit-target / consistency numbers |
| GET/POST | `/notify/channels` | `GET` lists saved webhook channels (url masked); `POST { kind: webhook, url, label? }` saves one — **https only** |
| DELETE | `/notify/channels/:id` | removes a channel |
| POST | `/notify/test` | `{ id }` → sends a real payload and reports the truth: on failure the channel's `last_status` records the HTTP status/error instead of a green tick |
| GET | `/cron/tick` | scheduler entry point: resolves pending signals, refreshes what it can. Requires `x-cron-secret: $CRON_SECRET` (or `?secret=`); 401 without it. `vercel.json` calls it daily at 06:00 UTC |

---

## Market data (cached server-side, no API keys)

| Method | Path | Notes |
|---|---|---|
| GET | `/market/calendar` | `?impact=high` — Forex Factory weekly calendar, normalised and converted to your journal timezone |
| GET | `/market/news` | `?category=Forex\|Markets\|Stocks\|Crypto&limit=60` — ten RSS feeds, deduped, flagged `relevant` when a headline touches your focus symbols |
| GET | `/market/quotes` | `?symbols=EURUSD,BTCUSDT,AAPL` — CoinGecko for crypto, Yahoo chart API for everything else, ECB reference rates as FX fallback |
| GET | `/market/overview` | all of the above plus Fear & Greed in one call |
| GET | `/health` | liveness + schema version |

Every market endpoint degrades to `{ ok: false, error, …empty }` instead of failing when offline.

---

## Import / export / settings

| Method | Path | Notes |
|---|---|---|
| GET | `/export/csv` | respects all trade filters; streams a CSV download |
| GET | `/export/json` | full backup: accounts, strategies, instruments, trades, journal, goals, watchlist |
| POST | `/import/csv` | `{ csv, account_id }` → auto-detects columns; returns `{ inserted, skipped, detected }` |
| POST | `/import/json` | `{ data: <backup object> }` → restores (accounts matched by name) |
| PUT | `/settings` | `{ name, timezone, focus_symbols[], default_checklist[] }` |
| POST | `/demo/seed` | regenerates demo trades for the default account |

---

## Bots

The market-mechanics bots. All endpoints are user-scoped, accept the session cookie or
`x-session: <token>`, and return `{ ok: true, ... }` unless noted. See `docs/BOTS.md` for
the methodology, the weights and the honest limitations.

| Method | Path | Query / body | Returns |
|---|---|---|---|
| GET | `/bots/markets` | — | instruments (63), timeframes, killzone state, providers |
| GET | `/bots/candles` | `symbol`, `tf` (1m…1w), `limit` (50–1500), `force=1` | `{ candles:[{t,o,h,l,c,v}], meta:{provider,ticker,last_price,last_bar,cached,warnings} }` |
| GET | `/bots/analyse` | `symbol`, `tf`, `prediction=0/1`, `bars`, `step`, `min_rr`, `save=1` | `{ headline, method_verdict, topdown, momentum, smc, indicators, setups, prediction, news, daily, account, instrument }` |
| GET | `/bots/topdown` | `symbol`, `tf`, `bars` | the video's method on its own: `{ method, layers, steps, checks, score, grade, status, direction, headline, playbook, blocked, conflicts[], crt_plan, levels, verdict }` |
| GET | `/bots/chart` | `symbol`, `tf`, `bars` (80–1200), `min_rr`, `account_id` | everything the desk chart draws: `{ candles[], smc{structure,premium_discount,order_blocks,fvgs,sweeps,liquidity,crt}, plan, topdown, stack{bias,location,trigger}, setups, quote, meta{sources} }` |
| GET | `/bots/scan` | `symbols` (comma separated, ≤24), `tf` | `{ rows:[…ranked], errors:[…], actionable, killzone }` |
| GET | `/bots/predict` | `symbol`, `tf`, `bars`, `step`, `horizon` | `{ direction, setups, buy, sell, model, backtest, summary }` — `backtest` carries the measured tables below |
| GET | `/bots/backtest` | `symbol`, `tf`, `bars` (300–3000), `step` (1–6), `samples`, `entry`, `cost`, `force=1` | backtest detail + `trades[]` table + the measured blocks below |
| GET | `/bots/correction` | `days`, `account_id`, `backfill=1` | `{ overall, behavior_score, mistakes[], guardrails, daily, grades[] }` |
| POST | `/bots/correction/backfill` | — | `{ updated, distribution }` — auto-grades trades missing a grade |
| GET | `/bots/guardrails` | `account_id` | `{ guardrails, stats, evidence, daily }` |
| GET | `/bots/feedback/:tradeId` | — | `{ grade, score, reasons, notes, summary }` for one trade |
| GET | `/bots/signals` | `status`, `limit` | `{ signals[], stats }` |
| POST | `/bots/signals/save` | `{ symbol, timeframe, prediction }` | runs an analysis and stores the actionable plan(s) |
| POST | `/bots/signals/save-plan` | `{ symbol, timeframe, entry, stop, targets[], entry_mode, mtf_tf, risk_atr, grade, score, p_win, note }` | stores a plan **exactly as shown** (used by the MTF refined entry) → `{ ok, saved, ids[] }`; `entry` = `stop` is refused with `reason` |
| POST | `/bots/signals/resolve` | `{ limit }` | resolves pending alerts against real candles → `{ checked, results[], stats }` |
| GET | `/bots/signals/stats` | — | win rate / expectancy of tracked alerts, by grade |
| GET | `/bots/sessions` | — | session + killzone windows and the active one |
| GET | `/bots/news/:symbol` | `window` (minutes) | high-impact releases inside the window |

### Choosing what to measure on `/bots/backtest`

| Parameter | Values | What it changes |
|---|---|---|
| `entry` | `entry` (default), `mid`, `deep`, `leg`, `ote` | which price the replay buys at: the plan's entry, the zone midpoint, the far edge of the zone, or a *refined* entry. `leg` only takes setups that contain a real displacement leg; `ote` additionally requires the entry to sit inside the 50–79 % retrace band of that leg (the playlist's refinement). |
| `cost` | `instrument` (default), `flat` | `instrument` charges spread + slippage + commission per asset class (in basis points of price) converted to R by each trade's own stop distance — a 1h EURUSD trade with an 8-pip stop pays ≈ 0.22R, gold on 1h ≈ 0.03R. `flat` reproduces the older 0.05R figure, for A/B comparison only. |
| `mtf` | e.g. `5m` | with `entry=mtf`, the lower timeframe that must confirm (defaults per pair: 15m→5m, 1h→15m, 4h→1h). Needs extra candle history, so the window is shorter. |

Measured blocks in the response (all computed on the same replay, no separate endpoint):

| Field | Meaning |
|---|---|
| `meta.cost_model`, `meta.cost_bps`, `meta.cost_source`, `meta.cost_r_median` | which cost model ran, the instrument's round-trip cost in basis points, and the median cost in R across this market's trades |
| `meta.entry_mode`, `meta.mtf_tf`, `meta.ltf_bars`, `meta.ltf_provider` | which entry policy produced the sample, and the lower-timeframe data used |
| `meta.cost_bps`, `meta.cost_source`, `meta.cost_r_median` | the instrument's round-trip cost (spread + slippage + commission in basis points of price), where it came from, and what it worked out to in R on this market |
| `counts.skipped.min_risk` | setups refused because the stop sat inside a quarter ATR of entry — those are the trades that used to manufacture double-digit-R targets |
| `default_view` | which `frontier_views` key the UI opens first — `full` (the measured maximum-expectancy shape) when it has ≥ 10 samples, otherwise `all`. Forwarded by both `/bots/predict` and `/bots/backtest`, and recomputed on cached hits so an old cache entry cannot ship a missing field |
| `rule_frontier` (§0c of the report), `presets`, `measured_rules_at` | the filter × target cross-tabulation that answers the 70 % question, the three measured presets, and the date they were measured |
| `trades[].entry_mode`, `trades[].risk_atr`, `trades[].cost_r` | per-sample provenance in the sample table |

`GET /bots/predict` adds, per live setup: `risk_atr`, `measured_gates.stop_ge_06atr`, `measured_gates.runway3`
and `playlist.mtf` — the lower-timeframe confirmation state (`live` / `recent` / `waiting` / `rejected`) plus
`plan` (refined entry, stop, risk in ATR, re-ruled targets) whenever a confirmation is actionable.
| `frontier[]` | all 19 exit plans with win rate, clean-win rate (≥ +0.5R net), expectancy and the break-even rate **computed from this market's own cost** |
| `profiles[]` | the management profiles (video plan, partial-at-R variants) resolved sample by sample |
| `filters[]` | named filters (`leg`, `playlist`, `playlist_ema`, `video`, `core`) with trades, share and the best exit inside each |
| `per_gate[]` | each checklist gate *and* the two measured gates (`stop_ge_06atr`, `runway3`) — expectancy with vs without |
| `quality_ladder[]` | outcomes as you stack the gates |
| `second_chance` | what taking the zone again after a failed first attempt actually paid on this market |
| `verdict` | the plain-words answer to "is this tradable here", including the 70 % check and the exit needed |
| `target_frontier[]` | win rate vs expectancy as a function of the exit target on **this market** — hit rate, net win rate, ≥ +0.5R rate, expectancy, break-even needed |
| `frontier_views{all,refined,strict,cost_floor,full}` | the same curve restricted to a filter view — `refined` = the playlist's own loop (OTE band or MACD agreement), `strict` = every refinement at once, `cost_floor` = displacement leg + stop ≥ 0.6 ATR, `full` = that plus a first target ≥ 3R. Lets you see whether filtering moves the two peaks together |
| `presets[]` | the three measured ways to run the model (playlist management / maximum win rate / maximum expectancy) with the numbers that justify each, loaded from `docs/MEASURED-RULES.json` |
| `measured_rules_at` | when that rule book was generated — every preset is dated |

The top-down method inside any analyse payload (abridged):
```jsonc
"method_verdict": {            // the method's own answer; this is what the UI and alerts use
  "action": "NO TRADE|BUY|SELL", "direction": -1|0|1,
  "status": "confirmed|sweeping|no-sweep|both-sides|waiting|blocked",
  "blocked": true, "headline": "…the sentence…",
  "conviction": { "tier": "A|B|watch|none", "why": "…", "size_hint": "…" },
  "pending_step": { "n": 4, "title": "Wait for the sweep", "text": "…" },
  "playbook": ["…what the method says to do next…"]
},
"topdown": {
  "method": { "name": "CRT top-down (Market Mechanics)", "stack": "4h bias → 15m location → 5m trigger", "steps": [5] },
  "layers": {
    "bias":    { "tf": "4h", "job": "bias + range", "state": "confirmed", "right_candle": {…}, "range": {…}, "plan": { "aggressive": {…}, "safer": {…}, "chase": false } },
    "zone":    { "tf": "15m", "job": "location", "premium_discount": {…}, "fresh_zone": {…}, "unfilled_fvg": {…} },
    "trigger": { "tf": "5m", "job": "trigger", "confirmation": { "ok": true, "displacement": {…}, "structure_shift": {…} } }
  },
  "checks": [5 items], "conflicts": [{ "kind", "sides", "rule", "resolution", "blocks_trade" }],
  "crt_plan": { "side": "long", "range": {…}, "sweep": {…}, "aggressive": {…}, "safer": {…}, "invalidation": "…" }
}
```

`/bots/analyse` payload shape (abridged):

```jsonc
{
  "headline": { "action": "BUY|SELL|NO TRADE", "grade": "A", "score": 77.4,
                "mechanics": 66.4, "killzone": "London killzone", "text": "…plain English…",
                "next_trigger": ["…"] },
  "momentum": { "direction": "bullish", "bias": 1, "alignment": { "rows": [] },
                "mechanics": { "score": 66.4, "grade": "B", "factors": [] },
                "narrative": [{ "title": "Bias", "dir": 1, "text": "…" }], "conflicts": [] },
  "smc": { "structure": { "trend": "bearish", "last_break": {} },
           "order_blocks": [], "fvgs": [], "breakers": [], "sweeps": [],
           "liquidity": { "pools": [] }, "premium_discount": {}, "crt": {}, "sessions": {} },
  "setups": { "candidates": [{ "dir": 1, "grade": "A", "score": 77.4, "checks": [],
                               "levels": { "entry": 0, "stop": 0, "targets": [],
                                           "rr_primary": 1.8, "rr_final": 3.4,
                                           "management": {} },
                               "risk": { "size": 0, "unit": "lots", "actual_risk": 99.7 },
                               "action": "…", "why": [], "why_not": [] }],
              "verdict": {}, "buy_score": 77.4, "sell_score": 61.2, "grade_scale": [] },
  "prediction": { "direction": { "p_up_pct": 47.9, "samples": 96, "buckets": [] },
                  "setups": [{ "side": "buy", "p_win": 61.6, "expected_r": 0.52 }],
                  "model": { "n": 154, "accuracy": 81.8, "base_rate": 39.0, "weights": {} },
                  "backtest": { "decided": 154, "expectancy_r": 0.37, "by_grade": [] },
                  "summary": ["…"] }
}
```

```bash
# full read on gold, saving the actionable plan as a tracked signal
curl -s -H "x-session: $TOKEN" \
  'localhost:3000/api/bots/analyse?symbol=XAUUSD&tf=15m&prediction=1&save=1' | head -c 600

# what are the odds on BTC 1h, and how has this model actually performed there?
curl -s -H "x-session: $TOKEN" 'localhost:3000/api/bots/predict?symbol=BTCUSDT&tf=1h&bars=1200'
```

---

## TradingView

The journal and the bots read the same candles, and TradingView is wired in both directions:
charts out, alerts in.

### Symbol mapping

Every instrument is served with a `tv_symbol` (`/bootstrap`, `/bots/markets`) —
`XAUUSD → OANDA:XAUUSD`, `ES → CME_MINI:ES1!`, `BTCUSDT → BINANCE:BTCUSDT`,
`NAS100 → NASDAQ:NDX`, `GER40 → XETR:DAX`, … Incoming alerts are mapped back to a journal
symbol just as forgivingly (`CME_MINI:ES1!` → `ES`, `GOLD` → `XAUUSD`, `BTCUSD` → `BTCUSDT`,
`US100`/`NDX` → `NAS100`).

| Method | Path | Query / body | Returns |
|---|---|---|---|
| GET | `/bots/tv/config` | `symbol`, `tf`, `studies` (≤5) | `{ tv_symbol, interval, links, advanced, mini, tape }` — ready-made widget configs + deep links |
| GET | `/bots/tv/links` | `symbol`, `tf` | `{ tv_symbol, timeframe, chart, chart_url, symbol_page, ideas }` (spread — the links are top-level) |

```bash
curl -s -H "x-session: $TOKEN" 'localhost:3000/api/bots/tv/config?symbol=ES&tf=4h' | python3 -m json.tool | head -20
```

### Alerts → journal (webhook)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/bots/webhook` | session | your webhook URL + token, options, counters and the last 8 alerts |
| POST | `/bots/webhook` | session | `{ analyse, autocreate, label }` — what to do with incoming alerts |
| POST | `/bots/webhook/rotate` | session | burns the token and returns a new URL |
| POST | `/bots/webhook/tradingview` | **token only** | the receiver — `?token=<token>` (also `x-webhook-token:`, or `token`/`secret` in the body) |
| GET | `/bots/alerts` | session | `?limit=&symbol=` alert history (raw body + bot result) |
| POST | `/bots/alerts/clear` | session | wipes the history |

Accepted bodies — JSON **or** plain text (`Content-Type: text/plain`):

```jsonc
{ "symbol": "XAUUSD", "action": "buy", "price": 4244.85, "tf": "15m", "time": "…" }
{ "message": "short NAS100 price 20450 5m" }
{ "data": { "ticker": "GOLD", "side": "buy", "close": 4240.5, "interval": "240" } }
BUY XAUUSD @ 4244.85 15m
```

Response:

```jsonc
{
  "ok": true,
  "alert_id": 12,
  "received": { "symbol": "XAUUSD", "action": "buy", "price": 4244.85, "timeframe": "15m", "tv_symbol": "OANDA:XAUUSD" },
  "plan": { "action": "SELL", "grade": "A", "score": 81.2, "mechanics": 66.4,
            "entry": 4192.5, "stop": 4210.0, "targets": [], "rr": 4.68,
            "agreement": "conflicts", "text": "…", "whynot": [], "generated_at": "…" },
  "signal_id": 41,
  "error": null
}
```

* `agreement` is the field to act on: `agrees` · `conflicts` · `bot says stand down` ·
  `position management` · `unknown`. A `conflicts` alert means TradingView fired while the
  bot reads the opposite side of the market — that is exactly when you want to look before clicking.
* Bad or missing token → `401`. No symbol found → `200` with `{ "ok": false, "error": … }` plus a `hint`;
  the raw body is still stored so you can inspect the alert in Settings → Integrations.
* Flood guard: 240 alerts/hour/token → `429`.
* `autocreate: true` files actionable plans as tracked signals, which `/bots/signals/resolve`
  then scores against real candles (win rate + expectancy by grade).
* TradingView sends alerts from **their** servers, so the URL must be publicly reachable —
  `localhost` never works. On the free Vercel deploy it does (see `docs/DEPLOY.md`).

```bash
URL=$(curl -s -H "x-session: $TOKEN" localhost:3000/api/bots/webhook | python3 -c 'import json,sys;print(json.load(sys.stdin)["url"])')
curl -s -X POST -H 'Content-Type: text/plain' --data 'BUY XAUUSD @ 4244.85 15m' "$URL"
```

### Replay parameters (analyse · chart · topdown)

| Parameter | Meaning |
|---|---|
| `trim=N` | rebuild the read from the candles that existed **N bars ago** (0–400, clamped). The payload returns `replay: {trim}`; every `now` block sets `evaluated_on.replay = true` and `freshness.state = 'replay'` |
| `as_of=ISO8601` | same thing by timestamp — the read is built from candles strictly before that instant |

### The `now` block (on `analyse` and `chart`)

```json
"now": {
  "action": "WAIT | BUY | SELL | NO TRADE | RE-CHECK",
  "side": -1, "headline": "…what to do, and why…", "armed": false,
  "order": { "side": "short", "type": "stop-limit at the confirmation", "entry": 1.1248, "stop": 1.1266,
             "target": 1.1162, "rr": 2.7, "mode": "aggressive", "size_note": "Half risk: …" },
  "watch": { "level": 1.1257, "condition": "sweep above … then close back inside", "text": "…" },
  "checkpoint": { "at": "2026-10-06T16:00:00.000Z", "label": "next 15m close · …" },
  "invalidate": "what makes this read wrong",
  "freshness": { "state": "fresh|aging|stale|market-closed|replay|unknown", "bar_age_min": 1, "note": "…" },
  "evaluated_on": { "last_closed_bar": "…", "last_close": 1.1252, "candles": 600, "replay": false, "trim": 0 },
  "other_side": { "dir": 1, "side": "long", "grade": "B", "score": 66, "text": "…not armed…" },
  "guards": [{ "level": "block", "text": "News blackout: …" }],
  "since": null
}
```

### Chart drawings

| Endpoint | Purpose |
|---|---|
| `GET /api/chart/drawings?symbol=EURUSD&tf=1h` | every drawing for that market + timeframe |
| `PUT /api/chart/drawings` | body `{ symbol, timeframe, drawings:[{kind, points:[{t,p}], style}] }` — **replaces the set** (always send the full list); kinds `trend · hline · ray · rect · fib · measure · text`, max 400 drawings, max 8 points each |
| `DELETE /api/chart/drawings?symbol=…&tf=…` | clears that market |


## Pre-market routine

All endpoints are authenticated and owned-account scoped. Account POST/PUT adds
`routine_window_start` (nullable explicit local HH:MM), `routine_timezone`
(nullable IANA, required with a window; numeric offsets are not IANA),
`routine_lead_minutes` (integer1–180, default60), `routine_order` (`ep17` default
or `meditation_first`). No account broker/session field infers a window. Active
cycle policy/steps freeze until saved expiry, then future settings are adopted.

| Method | Path | Body / response |
|---|---|---|
| GET | `/routine?account_id=…` | `routine`: setup-required/pending/complete; immutable cycle/reset/window/expiry, selected order/steps, timer/current next step. Storage/clock/provenance fault503, never a cached permit |
| POST | `/routine/step` | `{account_id,cycle_id,step,…}` literal human acknowledgments below. Actual current cycle/selected order required; stale/out-of-order409; cannot supply completed-at/complete/client timer proof |
| POST | `/routine/meditation` | `{account_id,cycle_id,action:"start"/"pause"/"resume"/"complete"}` only. Server running-time15m; too early409, clock/client elapsed/start fields400; pause gaps excluded. No actual mental/meditation claim |
| GET | `/routine/daily/:date?account_id=…` | Valid UTC YYYY-MM-DD, nullable daily `pre_market`: actual workflow `done`, separately labelled `self_report`, `workflow`, immutable `first_admission`, nullable `prepared`, `cohort_basis`. No historical backfill |
| GET | `/routine/report?account_id=…&from=…&to=…` | Descriptive UTC close-day realised daily P&L buckets completed/not-completed/unknown, known/unavailable P&L counts and daily evidence; NOT causation/strategy-sizing permission |
| POST | `/journal` | Existing note fields +owned `account_id`,`entry_date`; optionally `pre_market_done` must be literal true/false/null. Omit on unrelated note edits to preserve human flag/source/time. Retrospective human flag never satisfies workflow/admission. Future actual done/skipped400 |
| GET | `/journal` or `/journal/:date` | `pre_market_days` / `pre_market` workflow +daily evidence beside separate core closed-trade journal completeness |

Step payloads (with actual current owned account/cycle):

- `calendar`: `{reviewed:true,method:"manual_external",summary:"What I actually reviewed"}`.
  Human external-calendar review, not verified provider/no-news clearance.
- `plan`: `{reviewed:true,plan_id:123}` selects an **owned strategy/playbook**,
  snapshots current server fields/version at acknowledgment; or
  `{reviewed:true,plan_text:"My actual manual plan"}`. No foreign snapshot.
- `charts`: `{reviewed:true,daily_bias:"bullish"/"bearish"/"neutral",htf_range:"…",
  alert_status:"set"/"not_applicable",alert_note:"Location or why not applicable"}`.
  Human report, not OHLC/order authority. Unset/missing report cannot complete.
- `meditation`: only the timer endpoint completes this step, not `/routine/step`.
- `check_in`: `{calm:true/false,clear:true/false,following_plan:true/false,
  would_take_if_up_big:true/false}`. All four literal Booleans required; any false
  attempt is retained but unfinished. Once-per-routine morning human answers,
  **not** the separate fresh in-session/per-entry mental-state gate.

Known incomplete/setup-required preparation contributes `pre_market_routine`
with the existing personal409 `guardrail_stop` /fresh one-action typed reason.
Reasoned exception never completes steps or refunds other caps/clocks. Unknown/
corrupt/unavailable routine evidence contributes unwaivable503. All actual new
entry/reopen/save/copy consumers recheck server state; technical veto never revived.
Truthful close/correction/deletion/history/record-only/import remains legal.
First **executed trade** preparation commits atomically with the entry, not saved
research plans, and survives journal edits/deletion independently. Late completion
or a human flag cannot rewrite its original preparation basis. Current done and
on-time/before-first-entry prepared are different facts. Neither is broker activity,
a live emotional/feed clearance or proof of a profitable causal effect.


## Retrospective execution self-review (M86) and day extremes (M92)

`GET /trades/:id` (and trade lists/day rows) adds a **derived** `execution_review`:
`state`, `grade`, nullable `score`, `execution_quality`, `loss_quality`, separate
`outcome`, `evidence`, `basis:"self_reported_execution"`, `rubric_version`,
`broker_verified:false`, original `entry_setup_grade`, and opaque
`record_revision`. Missing/invalid/stale/future/open evidence is **Unreviewed**,
not an inferred0 or good/bad loss. A current acknowledged partial report can
identify a specific violation, but cannot receive a full grade/good/bad-loss label.

`POST /trades/:id/execution-review` is optional and owned/authenticated:

```json
{"adherence":5,"stop_honoured":true,"record_revision":"<copy current GET execution_review.record_revision>"}
```

- Only those three keys. Adherence is a literal whole number1–5 or null; stop
  honour is literal true/false/null. Read the **saved current** record first.
- Server records nullable `stop_honoured`, `stop_honoured_source`,
  `stop_honoured_recorded_at`, and versioned `execution_review_hash`, atomically
  with the bounded existing `adherence`. Hash binds relevant current trade fields,
  not a cached score or broker signature. No client clock/source/hash/grade spoofing.
- No actual close/open/future evidence or changed displayed revision:409. Bad
  input/unknown recorded stop for an honour claim:400. Foreign/missing ID:404.
  Storage uncertainty:503 without a partial write. Literal nullable answers may
  remain unreviewed; legacy populated notes/default0 movement do not prove honour.
- Core writing remains `/trades/:id/journal`; financial create/update/close/delete
  remains legal without an execution review. Financial CRUD does not mint review
  flags/source/clocks/hash. JSON/CSV record-only imports do not replay these
  server-owned acknowledgements or infer historic completion; re-review explicitly.
- App display rubric `execution-v1`: adherence1/2/3/4/5 →20/40/60/75/95; explicit
  stop violation caps39/D. Good loss requires >=4 **and** explicit honoured stop,
  with known consistent realised loss. P&L/R/RR/session/MAE/MFE earn no points.
  This mapping is an app display choice, **not a numeric course quotation** or
  entry sizing input. Current same-record evidence required even for partial flags.

`POST /bots/correction/backfill` is retained for compatibility but **READ-ONLY**:
optional literal positive integer `account_id`, otherwise all own closed journals.
Returns `updated:0`, `evaluated`, `reviewed`, `unreviewed`, `distribution`,
`read_only:true`, basis/version. Foreign account404, malformed ID400. No stored
`setup_grade` writes, cache, guessed legacy source or any capital-rule change.
`GET /bots/correction` exposes execution `grades` plus independent original
`setup_grades` with legacy provenance warning. Its `backfill=1` is read-only too.
Feedback uses current human execution versus separately descriptive outcome,
not outcome-only repeat-it praise or stop/entry-location blame from excursions.

`GET /journal/:date?account_id=…` adds `account_id` and `execution_summary` scoped
to one owned account and UTC close day. Omitted account resolves the actual
default (not mixed-account trades beside a default routine). Noncanonical/repeated
account query400; foreign404. Shared notebook text is still shared, not new
per-account duplicate notes. `best`/`worst` rank known current self-review scores;
`trade_ids`/`tie_count` retain ties, unknowns unranked, no P&L tie-break. `pnl` is
money-only known/unavailable extrema and nullable realised day total/recorded R;
open/future/unknown data never silently becomes realised0.

Performance retains every prior numeric metric including `best_trade`/`worst_trade`
as money fields. New `trade_extremes_basis` labels that compatibility basis, and
`execution_summary` is separate; finance is not renamed or used as execution.
All ranking/grade/outcome associations are descriptive, self-reported and
retrospective, not statistical edge, causation, live emotion/provider/broker proof,
fresh entry readiness, permission or risk advice.


## M88 — human entry-confluence declarations

Three nullable trade columns: `entry_confluences` (canonical JSON-array text,
NULL unknown), `entry_confluences_source` and `entry_confluences_recorded_at`.
`[]` explicit none,1 partial,2–5 selected. Never inferred from tags/mistakes,
emotion/model/checklist/images. Independent from unchanged financial normalizer,
core/execution/routine/permission and risk inputs. User-owned reusable vocabulary
retains past choices after deselection/deletion, user FK cascade.

- `GET /confluences` → own reusable `{labels:[strings]}` only.
- `GET /trades/:id/confluences` → canonical owned `trade_id`, `account_id`,
  same-snapshot `saved_record:{symbol,status,entry,stop,exit}` and `review`.
- `PUT /trades/:id/confluences` → **only** `{labels:null|[]|[strings],revision}`.
  Required displayed SHA covers all63 current trade fields, including original
  finance/notes/excursions/legs/reviews/clocks and confluence evidence. Malformed400,
  missing/foreign/noncanonical trade404, stale409, real storage503 atomic rollback.
  Valid label replacement updates ONLY these3 new columns. Identical valid retry
  does not invent a new clock. Existing financial PUT/close preserves reasons;
  use the dedicated editor, not an unacknowledged optional-body overwrite.
- `POST /trades` accepts optional `entry_confluences` array (or explicit null),
  validated/canonicalised separately inside the actual insert/admission transaction.
  Invalid optional declaration warns/omits, financial truth not discarded. No
  default “none”; no new checklist/entry requirement or score/sizing authority.

`review` has state unknown/none/partial/selected/unavailable, nullable labels,
source `human_declared`/`imported`, server recorded/received time, displayed revision
and **entry_time_verified:false** always. Can be retrospective; never broker/live
capture proof or immutable confluence history. Corrupt/future metadata is
unavailable, not guessed. Corrections retain declarations until deliberate edit;
no automatic validation of whether a label really explained an original entry.

`GET /analytics` adds `by_confluence` and `confluence_coverage`, exactly closed
rows only, filter/owner scope preserved. A trade appears once per normalised label,
may appear in multiple labels; groups are not independent/disjoint. Coverage
separates unknown/none/partial/selected/unavailable. Rows expose n, known/unavailable
net counts, wins/losses/breakeven, known-outcome win denominator, nullable all-n
net/R/expectancy and labelled known-net subtotal/known-R count/mean, human/imported
counts. Missing net/R is never0 or∞; R needs finite positive risk and consistency.
`sample_floor:30`/`sample_ready` annotate recorded closed count only—not edge,
causation, valid outcome availability, permission or sizing. Existing legacy
analytics numerics unchanged. M103 n>=5 is not replaced.

JSON trade exports include the3 fields, and JSON top-level `confluence_labels`
backs up reusable strings even when unused. CSV `entry_confluences` is a JSON
array **inside the CSV cell**, escaped normally (commas/quotes in labels survive);
source/time informational. Blank CSV means unknown, `[]` explicit none. Restore
uses new actual owned trade IDs, forced imported source/new receiving time; raw
source/old-clock/owner IDs aren't replayed. Optional malformed labels/choices have
bounded `confluence_warnings` while truthful finance still imports. Real optional
storage failure rolls back finance/media/choices together. Unused vocabulary
restore budget5000 labels/request, explicit omission warning above—not clipping.
Trade labels themselves also populate choices. CSV does not carry unused choices;
JSON is the full vocabulary backup. Historical insertion is not upsert/deduping.
Existing20MB selected-file/25MB body limits unchanged. UI presents warnings without
auto-closing/refreshing a warning-bearing restore. M89 adds separate app-timed emotion evidence; M106/M111/M112 open.


## M89 — first APP emotion observations/responses

No broker connection: server app-record/response timing and human declaration
only, **broker_verified:false** always. Five-minute window is APP policy, not a
course quotation, mental-state verification, fresh M106 readiness or permission.
Additive child tables `trade_emotion_events` and `trade_emotion_responses`; no new
trade columns or historical/legacy backfill. One response/event, DB UPDATE facts
immutable, parent FK deletion cascades. Not a cryptographic/admin-tamper-proof vault.

- `GET /trades/:id/emotions` returns owned canonical trade/account IDs,
  `saved_record`, `entry`, `exit`, `history`, `legacy`. Required displayed revision
  includes all63 current trade fields and selected event/response facts.
- `POST /trades/:id/emotions/entry` or `/exit` accepts **only**
  `{event_id:displayed_id|null,emotion:nonblank_string|null,revision:displayed_sha}`.
  Named state1–100 single-line characters; null explicitly unknown. No client
  source/clock/owner/context/eligibility input. Auth required; missing/foreign/
  noncanonical ID404, malformed400, stale/different first-answer replacement409,
  premature exit409, real storage failure503. Same first answer/current revision
  idempotent. Named answer atomically auto-tags the corresponding compatibility
  field; null does not turn old text into a named captured answer.

Actual `POST /trades` prospective admission and guarded PUT reopen observe entry
AFTER financial commit. Actual open-to-closed PUT/close observes exit after commit.
Financially written row is captured inside its transaction; optional observer
re-checks current saved context/status. Return optional `emotion_prompt:{phase,
trade_id,account_id,event_id}`/`emotion_warnings`; failed/changed-context observation
warns, never undoes finance. Record-only/history/import/correction does not mint
fresh entry proof. Response-store503 rolls back answer/auto-tag, not the earlier
financial transition. Core/manual journal text may change later; first answer does not.

Each phase exposes state, nullable emotion/event_id, source, revision, server
app_observed_at/answered_at, nullable delay_ms, current_context, eligible,
window_ms300000, recorded_context and basis. Sources app_entry/app_close/
retrospective/imported; states timely/late/unknown/pending/retrospective/imported/
prior/unavailable. Freshness requires valid owned phase/source/context and
canonical non-future clocks, app observation within5min of saved financial clock,
first answer within5min of observation. Entry answered while still open only;
a valid earlier answer survives later close, after-close answer stays late.
Changed finance/reopen/account preserves original context/words as prior. Null,
missing/declined, bad clocks/context and late/imported history never become proof.
Manual event_id:null is explicitly retrospective, not a timing backfill.

`GET /analytics` primary `by_emotion` is closed-only eligible server-annotated
entry reports, plus `emotion_coverage`. Old text compatibility segmentation is
`by_emotion_unverified`, labelled timing-unverified, not automatically promoted.
Primary rows expose n, known/unavailable net counts, known wins/losses/breakeven,
known-outcome win denominator, nullable all-n net/mean-R and known consistent-R
count. Unknown/inconsistent outcomes not0 or infinity. sample_floor30/sample_ready
is review count only, not causality/edge/permission. Coach/briefing use the same
server child annotations; mutually exclusive descriptive regex groups, no causal
dollar loss or sizing veto; the actual card labels known subgroup dollars recorded
group net, not causal impact. Other analytics numerics/insights remain compatibility
output, not newly certified. No70% promise, floor or geometry change.

JSON trade field `emotion_events:{version:1,entries:[{phase,emotion,source,
app_observed_at,answered_at,recorded_context,historical?}],unavailable_events}`;
CSV dedicated `emotion_events_json` cell (proper CSV escaping). At most50 portable
entries/trade. First responses, including null unknown, survive; no-answer pending
observations aren't portable verified workflow. Import forces actual destination
IDs/owner/account, source imported/new server receipt, with `received_at` and
null verified app_observed_at/answered_at/delay_ms. Valid old source/clocks/context
are in `historical`, explicitly unverified; subsequent export/import retains
original declarations, never replaces them with receiving context. Original IDs
confer no ownership. Original context budget8KB, known primitive fields with
strings<=2048; invalid clocks/context omitted with warnings, never authority.

Invalid optional evidence produces bounded `emotion_warnings` without rejecting
truthful financial import. Real optional import-store failure atomically rolls
back financial/evidence mapping. Capture-table read outage allows JSON/CSV finance
backup with `emotion_events:{version:1,entries:[],unavailable:true,
unavailable_events:null}`; omitted corrupt events counted. Restore warns on these
markers rather than fabricating lost history. Actual CSV dialog/Settings JSON/CSV
show warning-bearing success without automatic dismissal/refresh.20MB selected
file/25MB request limits unchanged; repeat historical restore can duplicate trades.
Captures never complete core/post-loss writing, execution grade, admission, caps,
routine or risk; optional exit capture/decline is followed by required writing.


## M91 — current profit versus retained trade-exception account-days

`GET /process-outcomes?account_id=&from=&to=` is authenticated/read-only.
Optional canonical positive **OWNED** account ID; omitted means all owned accounts,
kept as separate account-days. Optional valid UTC `YYYY-MM-DD` dates/from<=to;
malformed400, invalid/foreign account404, process-read outage503. Empty parameters
aren't evidence. No client override snapshots, flags, eligibility or ownership
are accepted as report authority. No schema/column/persisted flag and no writes.

Response `{review:{state,timezone:'UTC',account_ids,from,to,days,coverage,basis,
metrics_policy,broker_verified:false}}`. Inspector reads accounts, raw closed
journal outcomes and M90 `guardrail_entry_admissions`/`guardrail_events` in one
transaction; never reruns past events against today's edited rule settings.
Owned clock/date/action/state/reason/rule metadata required. Normal/caution
admissions distinct from overridden. Admission+event same action linked once;
conflicts/corrupt/undatable facts unavailable. Valid older trade-event-only
exceptions can be read without fabricating an admission. Actual server reason
policy nonblank<=2000 plain text, including short/multiline, is preserved.

Each day exposes account_id,date,closed_trades,known_net_count,unknown_net_count,
known_net_sum,realised_net,unassigned_closed,admitted_entries,exception_entries,
exceptions,evidence_unavailable,context_counts,rewarded_breach,process_state,
outcome,broker_verified. Exceptions retain original trade/action ID, UTC rule day,
clock, rules/details/reason, sources/admission/event IDs. Current trade correction,
reopen/deletion does not rewrite that past action. It is app-record evidence,
not broker execution/misconduct or a sealed/database-owner-tamper-proof vault.

`rewarded_breach:true` means a known complete positive WHOLE account-day plus
actual retained traded exception. A merely reached stop (`breach`), blocked request,
research-plan override or record-only observation is not that case; contextual
counts distinguish them. Unknown history not clean. Finance is **current corrected
journal**, exactly closed finite net on UTC close day, no floating/open values.
Unknown constituent or invalid/missing/future close clock makes whole-day total
unavailable; no guessed opening day or unknown→0. Unassigned evidence and clocks
explicit in coverage. Overflowing sum unavailable, not Infinity/zero/profit.
Different accounts/days never combined into one case. Overnight entry-rule day
is not attributed to the eventual trade's profit day; association is calendar-level.

`/analytics`, `/coach`, `/briefing`, `/journal`, `/journal/:date` add `process_review`.
Day review selects its owned/default account and aligns M90 history to it. Date
bounds respected; symbolic/strategy/tag/model trade filters do NOT thin the full
account-day outcome for this annotation. Original financial statistics can still
show that selected subset: the different annotation basis is explicit. Optional
process-read fault returns `state:'unavailable',days:[],coverage:null`, rather than
vetoing finance or silently declaring clean history. Dedicated read endpoint uses503.

Coach adds one descriptive `rewarded_breach` warning only when known cases exist,
with money_basis `recorded_flagged_account_day_net`. Compatibility `impact` is
actual summed known flagged-day net, not causal cost; overflow null with
recorded_net_available:false. UI labels it recorded flagged-day net/Unavailable,
never fabricated+$0 impact. Unrelated insights/score/summary remain unchanged.
No per-trade category filter for a day association; review actual account-day links.

This feature **annotates**, never excludes financial wins or changes win-rate/
expectancy denominators, execution/behaviour grades, sizing/risk/permission/caps,
routine/admission/loss-writing clocks. No causal psychological reinforcement,
prediction/edge/probability/70% claim. Existing plain financial/history imports
remain legal; root/trade snapshots can't replay retained server proof. No new
verified guard-history portability in this pass. M93 adds a separate daily APP tally without rewriting this M91/window/financial
annotation; M106/M111/M112 still open, M108 partial.


## M93 — current reported-process daily APP index

`GET /behavior-days?account_id=&from=&to=` authenticated, read-only: optional
canonical positive OWNED account (omitted means separate own account series),
valid UTC `YYYY-MM-DD` range, malformed400/foreign404/read fault503. No client
scores/admissions/ownership accepted. Inspector reads actual accounts/trades/M90
admissions/events in one transaction; zero new schema/table/column/persisted score.

Returns `{report:{state,timezone:'UTC',date_basis,account_ids,from,to,rubric_version,
minimum_closed_for_score:1,minimum_for_tier:30,app_weights,days,trend,coverage,
window_pattern,broker_verified:false,basis,scope}}`. Version `daily-process-v1`.
Dates are current recorded UTC ENTRY days + retained original rule days; not
financial close day/local broker sessions. Fully retrospective current close
reviews can update earlier dates. Exact captured current cycle required; orphaned/
prior/deleted/reopened/clock-changed captures cannot become full current coverage.

Each day exposes current/closed/open/reviewed trades, admission_known,
execution_known,core_known,unknown_trades,orphaned_actions,evidence_unavailable,
unassigned_trades,chronology_unknown,ambiguous_cycles,known_penalty_points,score,
tier/tier_basis,state,incidents/context_counts/basis. Incidents carry action key,
trade ID, original time, points, sources/details. Current M86 and M85 hash/clock/
review contracts reused; execution and core acknowledgements must cover the current
owned row, chronology valid and close known. Missing/stale/legacy/future/pre-close/
ambiguous/undatable data =>score null, never100/0 by absence. Known explicit issues
remain visible under incomplete evidence. Imported reviews without actual entry
capture do not create score authority. No broker/mental truth implied.

APP rubric: one action's MAX of stop exception12, explicit stop-not-honoured12,
current adherence1–2→12/3→6/4→3/5→0, current declared core mistake6. Do NOT sum
duplicate sources/issue categories for the same action. Explicit review weight,
not course formula or automatic verdict of broker misconduct. Score=max(0,100−
known penalties) ONLY for complete current day coverage with at least1 closed
action; empty/unknown stays null, and a valid scored0 is different. No trade quota
or inducement to hit5/30. Tier labels withheld below30, even at raw100;30+ still
not adaptive/statistical edge or permission. No profit/R/size/model/entry quality/
emotion/excursion/stop-movement point inputs. Equal acknowledged process can
produce equal day score on green/red/flat outcomes. Finance edits may stale hashes;
that is review freshness, not a profit-based penalty.

Trend is per-account/date nullable points; missing scores leave gaps, no zero
coercion/interpolation or cross-account average. `window_pattern` is a separately
labelled compatibility tally using the ORIGINAL recurring detector/12-6-3 weights,
notice gate5/tier30; original M103 gate deliberately unchanged. It includes old
outcome-based detector severities and is not daily execution truth or the average
of new scores. Original `/bots/correction` fields/sample/overall/behavior_score/
behavior_grade/mistakes/guardrails/daily/backfill remain unchanged; `behavior_days`
is appended. Its existing legacy gauge now says window pattern, not daily certainty.

Optional `behavior_days` on Analytics/Coach/briefing/journal/index/day/correction
returns unavailable/null coverage on fault without vetoing existing financial
reporting or certifying process. Date bounds apply to ENTRY/rule days; symbol/tag/
strategy/model filters do not remove a day's actions just to improve its score.
Existing finance/close-day metrics keep their own original filters. Actual shared
UI on all readers shows basis/points/minima/coverage/known evidence and own-account
day links, with escaped text/token/account/late/superseded correction cache guards.

No core writing/execution/setup grade/backfill update, broker order, cap/loss/
routine/admission refund, new permission or risk/sizing/geometry/RR adjustment.
No score-bearing portability/proof replay; historical imports stay legal/unknown.
No market prediction/causal-dollar/psychological certainty/70% proof. M99 next;
M103/M108 partial, M106/M111/M112 still open.


## M99/M101 — owned periodic review artifacts

Additive `period_reviews` immutable revision series per user/original account key/
kind/start; no trade columns or old completion backfill. Sources human_review or
imported_unverified, statuses draft/completed/imported, versioned template/answers/
focus/follow-up/metrics/context/server receipt/amendment. User deletion cascades;
account deletion SET NULL retains historical original key/snapshot, never another
account's authority. DB UPDATE trigger preserves facts except that FK nullification.
No cryptographic/database-administrator tamper-proof claim.

- `GET /reviews?account_id=` lists stored series, latest revision +history count.
  Omit account to list own series, including orphaned historical copies.
- `GET /reviews/template?account_id=&kind=&date=` resolves a date within the
  chosen period to its canonical start and returns the saved/current view.
- `GET /reviews/:kind/:start?account_id=` requires canonical owned positive
  account ID +start. `week/month/quarter/year`, UTC Monday/calendar buckets, end
  exclusive, adjacent previous start. APP policy, not course timezone/broker hours.
  A future not-started period is not an observed review window.
- `GET /reviews/by-id/:id` owned immutable readonly historical revision, including
  orphaned original account; missing/foreign/noncanonical404.
- `POST /reviews/:kind/:start?account_id=` saves draft.
- `POST /reviews/:kind/:start/complete?account_id=` completes answer artifact.
- `POST /reviews/:kind/:start/amend?account_id=` deliberately appends completed
  correction, required amendment reason. Draft cannot overwrite a completion.

POST only `{revision,answers,focus,follow_up?,amend_reason?}`. Displayed revision
includes latest stored revision, full current owned account financial/rule/check/
strategy context and exact adjacent prior completed commitment. No caller metrics,
clocks/source/user/permission/ownership authority. Unknown answer keys/types reject;
completed template answers nonblank, one nonblank single-line chosen focus. Explicit
unknown/not enough evidence is legitimate text; no NLP singularity guarantee.
Missing current focus isn't automaticnone. Strict400/404, stale/context409 requires
reload, actual store503 artifact-only rollback. Identical retry idempotent preserves
receipt; amendment creates new immutable receipt/history, not update-in-place.

Reply `{account_id,period,template,latest,history,preview,context_matches,revision,
previous_focus,previous_focus_changed_since_saved}`. Stored `metrics` remain frozen;
preview is CURRENT server data. Original and amended receipts/rules/focus survive
financial correction. `period_finished:false` means early in-progress review;
completed means answered record, not elapsed full period or strategy validation.

Template question basis explicitly saved Ep26/27 or annual APP-guided scope.
Weekly/monthly contain reflection, not strategy-apply; quarterly document hypothesis/
next90-day baseline, yearly document reassessment. Review never writes strategy,
version, goal, financial metric/denominator/grade/core/routine/permission/caps/risk.
Existing lawful versioned strategy corrections remain possible; M104/M105 not closed.

M101: adjacent prior completed immutable revision displayed with focus, source,
ID/version/receipt. When present, complete/amend must include
`follow_up:{previous_review_id,acted_on_focus:true|false|null,reflection:string}`.
No missing/coerced answer→yes/false. Exact prior ID required409 on mismatch; saved
answer retains original focus/text/clock/version and present self-report receipt.
A later prior amendment cannot rewrite it; changed-reference warning shown.
Imported prior commitments explicitly unverified. No broker/action fulfilment proof.

Snapshot finance: full owned account exactly-closed UTC CLOSE-day interval,
known-net win denominator, unknown/unassigned/future-clock coverage, nullable whole
net/expectancy/R/drawdown, known subtotal. No unknown→0/infinity or floating money.
Current reported execution ranks/ties separate from entry grade/money extrema;
checkbox compliance coverage labelled self-report. M91/M93 reports labelled ENTRY/
rule-day rather than attributing overnight P&L to entry. Owned saved strategy-version
copies/notes retained; missing versions retain current unversioned definitions,
not invented original-entry v1. Floor30 count annotation, never edge or capital
permission. M100 missed/verified-impulse metrics unavailable, not guessed signals.

Full `/export/json` field `period_reviews:{version:1,records:[...]}`; standalone
periods aren't trade-row CSV. `/import/json` optional history validated/append-only
under destination-owned account mapping and new IDs/revisions, forced status imported,
source imported_unverified/new receiving time. Original source/status/clock/snapshot/
focus/follow-up declarations in historical, no replayed completion/acted/strategy
ownership proof. Invalid/future original clock omitted with warning. Subsequent
export/restore retains original declaration rather than calling receipt old capture.
Bad optional history warns/omits while truthful finance imports. Real history-store
failure atomically rolls back the financial/artifact request. Missing history store
permits financial backup with unavailable marker; restore warns, not knownempty.
Warnings remain visible in Settings without refresh/dismissal on warning-bearing
success. Repeat restore appends declarations, not automatic upsert/dedupe.

APP budgets (not course rules):4000chars/question,300single-line focus,1000amendment,
2000focus reflection,10000account rows per snapshot,500portable revisions/1MBdeclared
snapshot.20MBselected-file/25MBbody limits unchanged, no silent clipping. Review
artifacts never complete required trade/loss writing, grade/resize risk or prove
human/mental/meditation/broker/provider/pixels/production/causal edge/70% wins.


## M100 — owned recorded opportunities, explicit decisions and journal association

No original trade/signal columns or status/price/probability/grade/score backfill.
Three owned additive tables: signal_opportunities (immutable origin/snapshot/hash/
account/capture source/clock), opportunity_decisions (immutable human revisions),
opportunity_trade_links (immutable link/retract/original-entry cycle facts).
Owner deletion cascades; signal/account/trade deletion NULLs FKs while original keys
and snapshots persist. Not a sealed/database-admin-tamper-proof vault.

Authenticated saved analysis/refined-plan/GET-analyse-save/webhook-save routes
optionally observe their actual returned signal IDs AFTER commit, source app_analysis
or app_declared_plan, original server account/permission and plan snapshot. Observation
fault warns, never undoes saved signal or manufactures original eligibility. Legacy/
direct unobserved background saves remain unattributed, no backfill. A original
personal-stop exception isn't an APP-confirmed should-have-taken plan. Manual/caller
refined plan is not a server technical-gate certificate; B/C/engine rules unchanged.

- `GET /opportunities?account_id=&from=&to=` owned report, UTC server opportunity
  record day, not execution/close day. Optional canonical account/UTC range.
- `GET /opportunities/signals/:id?account_id=` canonical owned signal/original
  account context and displayed revision; no automatic legacy capture write.
- `POST /opportunities/signals/:id?account_id=` only `{revision,decision,
  value_setup:true|false|null,reason_code:null|fear|hesitation|distraction|other,note}`.
  Decisions unknown/not_taken/not_value/missed_value. Missed requires your true
  own-plan value judgment, reason and note. Missing review not none/acted/missed.
  Legacy first declaration gets retrospective source/new receipt, not past appgate.
- `GET /opportunities/:id` owns actual capture/archive, including imported/orphan
  source; no foreign signal/trade lookup authority from old IDs.
- `POST /opportunities/:id/links` only `{revision,trade_id:positive_integer,note}`;
  actual owned same-account/market/direction journal, source human_link. No fuzzy
  symbol/time reconciliation or broker execution assertion.
- `POST /opportunities/:id/links/:link/retract` only `{revision,note}` corrects an
  own active association, appends history; no trade deletion/cap refund.

400 invalid body/value/reason,404 missing/foreign/noncanonical,409 unseen record/
review/link change or contradictory missed+active-link,503 actual optional evidence
failure. Identical current decision/link retry no duplicate. Original capture facts
and decision/link versions SQL UPDATE immutable except true FK nullification.
Active same journal entry cycle can't be credited across two different opportunities.
Prior missed words remain in history after later linkage or correction.

Actual prospective trade POST/guarded reopen accepts optional literal positive
source_signal_id. Actual saved written row/admission/clock and exact saved entry/
stop/first target/model/TF required for automatic app_trade_link AFTER finance commit.
Record-only/history not automatically acted. Wrong/foreign/stale/material mismatch/
observer outage returns opportunity_warnings but keeps financial truth. Optional
M100 never grants admission, replaces routine/emotion/core/post-loss review or
changes grade/size/risk/geometry/targets/stops/RR/floors/window/daily scores.

APP-confirmed original context vs declared/legacy/unverified value report displayed.
Current plan correction =>prior, bad owner/source/hash/chronology=>unavailable. Future
origin or observation before creation unavailable. App-entry/declaration link validates
original owner/account/cycle/hash/clock; actual deleted/corrected journal remains an
original association, not newly missed. No actual broker order proof.

Report summary distinguishes reported_missed_value,app_eligible_missed,
unverified_value_missed,acted_app,acted_declared,unknown/unreviewed/not_value/
not_taken/prior/unavailable/imported/value_unknown,legacy/unassigned evidence.
complete_missed_total NULL for incomplete coverage, no zero universe certificate.
Original planned first-target RR, and valid already resolved stored MODEL R, are
side annotations—not realised money, lost profit, causal counterfactual or prediction.
Pending/no_fill/expired/future/contradictory/missing model outcome NULL, not0. Existing
resolver/native signal metrics remain compatibility output, no new fill/path/cost
assumptions. No financial win-rate/expectancy/sizing or70% claim from this cohort.

Analytics/Saved Signals/M99 new live/frozen preview adds opportunity_review under
full own account/date scope. Old completed snapshots remain unchanged; new decision
changes stale live review revision, not old financial baseline. ENTRY/close/record-day
bases distinct. Actual Saved Signals whole cache/owner/token/serial/failure guards,
review/form/link/retract/archive UI and actual409draft/reload/503retention.

JSON backup opportunity_history `{version:1,records:[{capture,decisions,links}]}`;
standalone history isn't trade CSV. Import appends new destination-owned capture IDs/
keys/receiving receipt, source imported, no live native signal pointer/signal creation/
trade link/action/eligibility replay. Original declarations in historical metadata,
clocks unverified/invalid omitted with warnings, preserved across re-export/restore.
Imported decisions excluded current primary action/miss proof. Bad optional data
warns while truthful finance imports; actual store outage rolls back whole request.
Missing table permits financial backup explicit unavailable marker; restore warning,
not invented empty history. Settings warning-bearing success remains visible.

APP budgets:notecap2000,500portable captures/50decisions-links each/250KBrecord;
20MBselected-file/25MBbody unchanged, no silent clipping/automaticdedupe. Independently
bounded inherited M99 `/demo/seed` response repaired to `{ok,inserted}` after actual
sample seeding; no sample data/grade/risk policy change or extra audit closure.


## M104 — readonly quarter guidance and tracked rule edits

`GET /strategy-changes?quarter_start=` own global quarter report/current revision
+imported readonly archives. Omit quarter_start for server current UTC calendar
quarter; supplied start must be canonical. `GET /strategies/:id/change-discipline`
adds own CURRENT setup/version; canonical owned positive ID404 otherwise. All owned
setups counted globally, per-setup details not separate limits. Actual snapshot
read, not model/broker/causal independent-variable proof.

`POST /strategies/:id/change-preview` only `{revision,changes}`. Supported changes:
name/description/market_conditions/timeframes/entry_rules/exit_rules/checklist/
risk_rules/target_r_multiple/colour/active. No user/clock/source/permission authority.
Readonly; fresh displayed SHA includes current own setups/version history/change
facts/quarter. Missing/invalid400, stale409, missing/foreign404, read outage503.
Reply current discipline view +preview named diff/proposed/current/total_if_saved/
known_minimum_if_saved/above_three/warning; unknown fullcountNULL, not zero/clean.

Existing `PUT /strategies/:id` accepts optional `strategy_revision`; actual UI always
supplies it. When present, malformed400 or unseen own-global context409, no write.
Legacy direct PUT remains legal (`revision_checked:false`) and returns quarteradvice.
Original M102 `version/new_version/changed_field` contract retained; added
changed_fields (all), rule_delta, quarter_rule_changes. No three-unit hard veto,
capital/technical gate or risk/target clamp. Creation+v1 and update+newversion+
change fact atomic; actual failure503 rolls back all three, not earlier finance.
Current unversioned pre-edit baseline saved before change, not restored historical
entry rules or attribution backfill. Fresh version created_at canonical server ISO;
legacy SQL clocks still understood with explicit coverage.

APP rubric rule-edit-v1: normalised exact lines (NFC/trim/collapsed whitespace, no
semantic/case aliases), list/multiline max(removed,added), pure reorder1, scalar1.
All eight original rule-bearing fields checked. Cosmetic name/colour/pause excluded.
Formatting/numeric-equivalent unit0 may still bump raw M102 version. Every saved
edit/reversal counts globally across own setups in UTC next-version write quarter,
not one unit per entire array or firstchangedfield. One recommended/three maximum
course guidance, counting policy APP not true independent causal-variable proof.

Additive strategy_rule_changes retains original key/name, before/after definitions,
from/to versions, delta/rubric/hash, actual server clock/quarter/source. Owner FK
cascade; setup FK SET NULL retains past fact on deletion, so deletion doesn't refund
new recorded units. UPDATE facts immutable except FK nullification. No original
trade/signal columns or backfill; imported/legacy DTO proof not accepted. Not a
cryptographically sealed/database-admin-proof ledger. Existing old surviving
version deltas compared once, prior baseline can be olderquarter; fresh event pair
not double-counted. Missing/gapped/corrupt/future/duplicate source unavailable,
known recorded lower bound separate. Deleted pre-install versions unavailable,
absence not untouched-plan certificate or quarter-compliance proof.

M99 quarterly new metrics snapshots include quarter_rule_changes and revision;
saved old baseline/receipts immutable, live preview may differ. Nonquarter artifacts
have null. Review completion never applies rule/risk/goal or grants entry.

Full JSON backup strategy_rule_changes:{version:1,entries:[...]}. Restore readonly
own imported_unverified archive, no live setup association/strategy/action/budget
credit; receiving time new, original version/key/definitions/units/source/clock
unverified in history. No native strategy/actual edit minted by archive replay.
Re-export/restore keeps original declared clock/source, not receiving-capture replay.
Optional bad/future/budget history warns with rule_change_warnings while truthful
finance remains legal. Actual optional store failure atomically rolls back that
import; missing store export finance still available with unavailable marker.
Actual Playbook archive/Settings escaped warning-bearing success stays visible;
no auto-refresh/dismissal hiding omission. Repeated restore appends declarations,
not automatic dedupe. No authoritative rule budget in trade CSV.

APP input budgets500lines/5000chars each,10000versions/events,500portable records/
256KBdefinition pair; existing20MBfile/25MBrequest limits, no silent clipping. No
score/core/routine/cap/loss/admission/financial-winner/trade-grade/weights/risk/factor/
geometry/stop/target/RR mutation. Floor30/M103n>=5/B-C unchanged. No causal/predictive
edge/70%/broker/provider/human/mental/meditation/pixel/production proof. M105 next.


## M105 — optional declared identity / separate quarter theme

Additive `identity_declarations` immutable account/kind/quarter revision history,
not account/trade defaults. `identity` persistent emptyperiod key; `theme` canonical
UTC APP calendar quarter (~90, not exactly90days/broker hours). Owner deletion
cascades; account deletion SET NULL retains original readonly own history, never
foreign reattachment. UPDATE facts immutable except FK nullification. Not sealed
against database-admin tampering. No notes/focus/adherence/profit history backfill.

- `GET /identity?account_id=&quarter_start=` live editor view: account,quarter,
  identity,theme,original theme identity_reference/change warning,history,archives,
  displayed revision,basis,broker_verified:false. Human/source declaration only;
  imported records not activated. Optional canonical quarter_start selects theme;
  persistent current self-description remains separate lifetime.
- `GET /identity/daily/:date?account_id=` declarations with actual receipt <=selected
  historical UTC day end/now, plus same-date current reported ENTRY-day plan tally.
  Later words not borrowed as old state. Future selected days not observed. A
  retrospective declaration is not original mental-state/action proof.
- `GET /identity/tally?account_id=&from=&to=` owned current acknowledged plan count.
- `GET /identity/history?account_id=` readonly original declarations. Omitted account
  means all own accounts/orphaned/imported copies, not another user's words.
- `PUT /identity/statement?account_id=` only `{statement,revision}`.
- `PUT /identity/theme/:start?account_id=` only `{statement,revision}`.

Canonical positive owned account; foreign/missing/alias404, invalid date/quarter400,
auth401. Nonblank single-line string<=500chars or explicit null unknown reset;
blank/array/bool/control-character coercions reject400. NFC/outer trim. No caller
user/source/clock/reference/eligibility input. Revision covers selected-quarter
current declaration history. Stale409 explicit reload, identicalretry receipt
preserved, actualstore503 rollback new words only—not earlier finance/core/entry.
Theme saves original identity ID/version/text/source/receipt snapshot; later identity
change visible, not silent rebind. Null/reset history retained independently.

Primary tally: current complete acknowledged M86 execution-quality source
self_reported, valid owner/date/hash/stop/adherence/chronology/clocks. Equal green/
red process same counts; no P&L/entrygrade/score/identity-worth/psychological input.
Plan followed vs violated definition is M86's, not an invented adherence5-only gate.
Unknown/stale/default/legacy/open/unassigned records unreviewed, imported current
reports separately unverified. Known violation in incomplete review separately
visible, not denominator double-counted. Ratio followed/known_reports only;NULL
with no known evidence. ENTRY-day basis, not profit CLOSE-day attribution. Counts
not broker/action/mental-state fulfilment or proof the words caused behaviour.

Actual Dashboard/day/quarter card/editor/readonlyhistory, escaped words and
account/user/token/serial/closed/stale/current-versus-obsolete fault guards.
Actual409 keeps draft/disables save untilreload;503 cannotclaim recorded.
M99 quarter new snapshot `identity_context` keeps exact received declarations;
current change invalidates displayed context revision but original snapshot and
M101 actionfocus immutable. Nonquarter null. Editing theme independently doesn't
complete/save the review or silently discard local text; deliberate reload needed.

JSON backup `identity_declarations:{version:1,records:[...]}`; imports destination
owner/account/new revision/ID/source imported_unverified/new receipt. Original
kind/statement/clock/reference/source in historical unverified metadata; imported
inactive readonly archives, no human commitment/action/plan-vote replay. Re-export/
restore retains original declaration clock; invalid/future omitted with warning.
Explicit later human adoption is a NEW declaration, not origin proof. Optional
badhistory `identity_warnings` while finance legal; realstore failure rollsback
finance/declarations import atomically. Missingstore backup financelegal with
unavailable marker; restore warns, no loststatement inferred. Settings warnings
stay visible/no auto-refresh, readonly own archive/orphan records accessible.
Trade CSV does not transport standalone declared words. Repeat import appends,
not automatic upsert/dedupe.500records/8KBunverified reference and unchanged
20MBfile/25MBbody APP budgets, not course laws; no silent clipping.

No identity score/tier/self-worth judgement, NLP process/money intention judge,
M106 freshstate gate or M107 daily intention. No grade/risk/cap/routine/loss/core/
admission/model/weights/factors/geometry/stops/targets/RR change. Course30/M103n>=5/
B-C unchanged. No70%/causal/predictive/mental/broker/provider/human/meditation/pixel/
production proof. M106 next; M111/M112 open, M30/M103/M108 partial.

## M106 — fresh in-session four-question state gate

Additive `state_gate_answers` append-only answer history: `human_declared` first-party
rows and `imported_unverified` archives. UPDATE facts immutable (FK nullification only
exception); owner deletion cascades, account deletion SET NULL retains the row for the
owner's own readonly history and never re-attaches it to a foreign account. Not sealed
against database-admin tampering. Nothing is backfilled from notes, profit, adherence
or legacy journal text, and no answer is ever defaulted.

- `GET /state-gate?account_id=` live view: account, current state
  (`not_adopted`|`passed`|`failed`|`unanswered`|`stale`|`unavailable`), the four saved
  questions, recorded answers, server receipt, `age_minutes`, `expires_at`, APP
  `window_minutes`, `failed_questions`, `imported_archives`, history, displayed
  `revision`, `basis`, `broker_verified:false`. `allowed` is true only for a fresh
  all-yes pass; `not_adopted` is reported as adoption, never as a pass.
- `GET /state-gate/history?account_id=` readonly own rows including detached orphans
  and imported archives. Omitted account means all own accounts, never another user's.
- `PUT /state-gate?account_id=` only `{answers, revision}` where `answers` is exactly
  `{calm,clear,following_plan,would_take_if_up_big}` booleans or explicit `null`
  ("not answered now"). No caller clock, source, owner, score or text is accepted.
  Stale displayed revision409 with nothing written; a store failure503 claims no
  receipt and rolls the new row back only.

The four questions are the saved rule (“if the answer to any of these questions is no,
then you don't trade yet”): am I calm, am I clear, am I following the trade plan, would
I take this trade if I was already up big today. A recorded no publishes
`state_gate_failed`; an adopted account whose check is missing/stale/unreadable
publishes `state_gate_unanswered|stale|unavailable`. Both refuse `POST /trades` live
entries and `PUT /trades/:id` reopen with 409 + `state_gate` payload, fold into the
guardrail snapshot, and become the same kind of personal stop the killzone/personal
guardrails use — `Guards.applyToSetups` / Now refuse the signal, `saveSignals` and
`savePlan` throw the gate's own 409 code. `record_only` journal history, closing,
editing and importing are never gated: an in-session check cannot hold a trader's
history hostage.

Freshness is the APP's own policy: same UTC day and `<=window_minutes` since the
server receipt (default 60). The window edge is inclusive; a corrupt/future receipt is
`unavailable` and cannot pass. `not_adopted` accounts are not blocked — the app does
not invent a check the trader never gave — and imported copies never grant permission
on the receiving account. Answers are the trader's own words: this is not verified
calmness, clarity, plan adherence, broker state, an edge, a readiness/mental-state
score or any authority over risk, admission, cap, routine, core or grades.

Full JSON backup carries `state_gate_answers`; restore labels every copy
`imported_unverified` with the original clock as history and can never pass, fail or
block the receiving trader. Invalid optional history warns while the financial import
stays legal; a real import-store failure rolls that request back atomically; a missing
answer store leaves the financial backup legal with an unavailable marker. Settings
surfaces the warnings instead of hiding omissions.

## M107 — one process intention for the day

Additive `daily_intentions` append-only revision series: `human_declared` first-party
rows and `imported_unverified` archives. UPDATE facts immutable (FK nullification the
only exception); owner deletion cascades, account deletion SET NULL retains the row for
the owner's own readonly history and never re-attaches it to another account. Not sealed
against database-admin tampering. Nothing is backfilled from notes, profit, adherence,
`journal_entries.tomorrow` or legacy journal text, and no intention is ever defaulted or
carried over to another day.

- `GET /intention?account_id=&date=` live view: account, day (`YYYY-MM-DD`, server UTC),
  `today`, `same_day`, state (`unrecorded`|`recorded`|`unavailable`), `template`, words,
  framing (`process_template`|`unverified_free_text`|`outcome_language`), the bounded
  classifier's own cues, warnings, server `receipt`, `version`, displayed `revision`, the
  four saved process examples, `char_max`, `imported_archives`, `last_recorded` (history
  only — never today's intention), `authority:'none'`, `broker_verified:false`, `basis`.
- `GET /intention/history?account_id=&date=` readonly own rows including detached orphans
  and imported archives. Omitted account means all own accounts, never another user's.
- `PUT /intention?account_id=` writes **today only**: `{template}` (one of the four saved
  examples) or `{intention}` free text, plus the displayed `revision`. No caller
  clock/day/source/owner/authority is accepted. An identical repeat is a no-op, a stale
  revision409s with nothing written, and a store failure503s without claiming a receipt.
  Yesterday and tomorrow cannot be written or rewritten (`dayKey` refuses malformed and
  future days). Reads embedded in other surfaces (`GET /journal/:date`,
  `GET /briefing`) carry the same object but answer `unavailable` for a day that cannot
  be read instead of failing the host surface.

The classifier is bounded and explainable, not an NLP judge: an amount and an outcome
asserted in the same non-negated sentence (`make $5,000 today`, `make 5%`, `win $1,000`)
is refused `intention_outcome_target` with **nothing stored** — the episode's own
anti-example. Other outcome/prediction wording, more than one sentence, over-length text
and unknown phrasing are stored **exactly as written** with the cues the app found and
are never labelled process-oriented. The four saved examples
(`follow_plan`,`a_plus_only`,`journal_every_trade`,`no_revenge`) are the only thing
labelled `process_template`. An amount inside a negation ("I will not turn a $500 loss
into a revenge trade") is stored, not refused: the app does not run sentiment analysis.

This is a same-day commitment, not a permission: the module holds no score, percentage,
adherence tally, readiness or gate over entries/signals/risk/cap/routine/core/grades/
history, and it never rewrites journal text. M28's `journal_entries.tomorrow` stays the
next-day reflection field; M64's morning check-in, M89 emotion capture, M105's
self-description and M106's fresh in-session gate stay separate mechanisms.

Full JSON backup carries `daily_intentions`; restore labels every copy
`imported_unverified` with the original day/clock/version/id retained as history, so
restored words never become the receiving account's recorded intention for a day and can
never displace it. Invalid optional history warns while the financial import stays legal;
a backup with no intention field is no warning at all; a
`{version:1,records:[],unavailable:true}` marker warns instead of inventing days. Settings
surfaces the warnings; the Journal day and the Dashboard briefing render the same object
the editor writes.
