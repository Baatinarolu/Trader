# REST API reference

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
