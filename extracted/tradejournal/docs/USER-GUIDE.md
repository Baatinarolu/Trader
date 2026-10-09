# TradeJournal Pro — user guide

> **How the interface behaves on purpose.** No sign-in wall, no chat box, no emoji icons: the app is a
> terminal, not an assistant. Status is written as words (`ok`, `no`, `pass`, `fail`) with colour as a
> second signal, every measured number shows the date and the script behind it, and where the model
> loses money the screen says so. Full rules: README → *Interface rules*. The sidebar footer prints the running build id — if it is not
there, the browser is showing a cached page; reload once and it will disappear for good, because the shell
and its assets are served uncached from here on.

A practical, screen-by-screen guide plus the review routine that turns the app into results.

> **No sign-in.** Opening the app connects you straight to a workspace: on your own machine it is the one in
> `data/journal.db`; hosted, every browser gets its own private workspace (there is no email, no password, no
> login screen). **Settings → About → Start a fresh workspace** gives you an empty one; **Settings → Data**
> reloads the sample journal. Everything is scoped to the workspace you are in.

---

## 1. The daily loop

**Before the session — Dashboard**
1. Read the **pre-session briefing**: today's plan, event risk from the economic calendar, and the *risk multiplier*.
2. The multiplier is computed from your own state, not vibes: drawdown from peak equity, losses in a row, whether you are already down today, and pending high-impact events. If it says `0.5×`, trade half your normal size.
3. Note the **suggested risk**, **max trades today** and **daily stop**. Those three numbers are your session's guardrails.

**During the session — Trade log**
4. Press `n` to log a trade *as you take it* (status = Open), then edit it when you close.
5. Fill in the thesis before you enter, and the exit reason + lesson after. The fields you skip are the analysis you lose.
6. Tick the **pre-trade checklist** inside the form — the journal stores pass/fail per rule, which is what makes "my rules work" a testable statement instead of a belief.

**After the session — Coach + Journal**
7. Open the **Calendar**, click today, and write the day review (mood, energy, what happened, lesson, tomorrow).
8. Skim the **Coach**. Fix one thing per week, not ten.

---

## 2. Where to look, and when

| Question | Where |
|---|---|
| "Am I allowed to trade right now?" | Dashboard → risk plan (multiplier, daily stop, max trades) |
| "What is costing me money?" | Coach → critical insights, sorted by dollar impact |
| "Is this setup actually profitable?" | Dashboard → playbook performance, or Playbook cards (grade A–D) |
| "Which direction is the market setting up, and is it armed yet?" | Bots → Top-down method panel (status = confirmed / waiting) |
| "Why does the chart look bullish when the higher timeframe is bearish?" | Bots → method panel → *Disagreements and how the method resolves them* |
| "When do I make money?" | Analytics → Timing & sessions (hour heatmap, weekday bars, hold buckets) |
| "Am I exiting too early?" | Analytics → Execution quality (MFE-vs-realised scatter, capture efficiency) |
| "Am I risking ruin?" | Risk tools → drawdown simulator (Monte Carlo, risk of ruin, Kelly) |
| "How big should this position be?" | Risk tools → position size calculator (understands lots, contracts, shares, coins) |
| "What's on the calendar today?" | Market → economic calendar, filtered to high impact |
| "What did I learn last month?" | Journal → daily reviews + month-by-month table in Coach |

---

## 3. Screen reference

### Dashboard
The daily cockpit. Briefing card (plan, risk plan, open risk, events ahead) → focus-market card (official
TradingView mini chart for your first focus instrument, plus one-click *analyse* per market) → six KPIs → equity curve with drawdown shading (toggle to cumulative R) → coach summary → R-distribution → edge-quality panel → session table → five-week calendar → playbook table → recent trades.

Reading the KPIs:
* **Expectancy (R)** is the headline. Anything above `+0.10R` after costs is a real edge.
* **SQN** tells you whether the edge is statistically trustworthy *at your sample size*.
* **Capture efficiency** under 65% means your exits are leaving money behind.
* **Max drawdown** vs **current drawdown** shows whether you are in recovery mode (the briefing will cut your size automatically).

### Bots — the desk chart and the top-down method
The Bots tab is the trading desk. It runs the video's method on the market you pick and shows you
*why*, not just *what*:

1. **The chart** (full width, 560 px by default, ~1328 px wide on a 1600 px screen, drawn in code — not an embedded widget). Scroll to zoom, drag to pan,
   double-click to reset, hover for a crosshair with the OHLCV readout of that bar. The toolbar toggles
   plan / zones / FVG / liquidity / sweeps / structure / sessions / volume, and *Expand* makes it taller.
   Everything drawn is computed from the candles on screen: killzones shaded, the dealing range with its
   50 % and OTE band, order blocks, fair value gaps, resting liquidity, sweep arrows, `BOS`/`MSS` marks
   and — when the method has armed a trade — the plan as a red risk box and a green reward box with the
   entry, stop and each target priced. If the method has *not* armed a trade, no plan box is drawn: the
   chart shows levels, not a trade.
2. **Top-down method** panel: the five steps with `done`/`waiting` on each, the three layers and the job
   each timeframe does, what the method is waiting for, the playbook of what to do next, and every
   disagreement with the rule that settles it (`blocks` = stand down).
3. **Timeframe stack**: three mini charts (bias / location / trigger) so the higher-timeframe context is
   visible next to the entry timeframe instead of hidden in a number.
4. Below that, the mechanics score, the narrative read-aloud, structure and liquidity tables, the graded
   setups with their checklists, and the prediction tab with its measured gates.

Read it top-down: method status first (`CONFIRMED` / `WAITING`), then the step that is outstanding, then the
plan. If the method says waiting, the setups below are a watch list, not instructions — the verdict will be
`NO TRADE` and it will say which step is missing (`verdict.source = topdown-gate`).

### Coach
Every insight carries four things: the claim, the evidence (sample size, expectancy, win rate, net), the dollar impact, and **one action**. Categories the engine tests:

negative-expectancy setups · worst hour of day · worst weekday · revenge entries after a loss (30/45/60-minute windows) · trading after two consecutive losses · overtrading days · early exits · stops inside the noise (MAE) · size creep after wins · rule-adherence vs results · emotional-state drag · instrument leaks · long/short bias · holding losers longer than winners · single-day drawdown concentration · fee drag · missing stops · stops that overshoot · your best setup · profit fragility · risk-size inconsistency · session quality.

The **process score** (0–100) blends expectancy, risk consistency, self-graded adherence, stop discipline, journal completeness and the number of critical findings. It measures *process*, not luck.

### Trade log
Presets (7D/30D/90D/YTD/All), date range, status, setup, free-text search, sortable columns, bulk delete, CSV export. Click any row to edit. The filtered totals at the top update with your filter — that is how you answer "what do Monday mornings actually pay me?".

### Trade entry form
Four blocks: execution (symbol, side, status, account, prices, size, fees, timestamps) → classification (setup, grade, exit reason, planned R, MAE/MFE, timeframe) → psychology (emotions before/after, confidence, adherence, mistakes, tags) → narrative (thesis, execution notes, lesson, screenshot).

Live helpers as you type: risk in dollars and % of balance, R:R, the break-even win rate you need, and a suggested position size for your account's risk setting (one click to apply).

### Calendar
Monthly grid with per-day P&L, trade count, R and W/L, plus a journal marker. Click a day for the full day review form and that day's trades side by side. Header shows month P&L, winning days, best/worst day, journal coverage.

### Analytics
* **Core statistics** — four panels (profitability, outcomes, risk-adjusted, discipline) plus equity/drawdown, R-distribution and a per-trade waterfall of the last 60 trades.
* **Timing & sessions** — hour-of-day expectancy heatmap, weekday bars, hold-time buckets.
* **Execution quality** — capture efficiency, average MAE/MFE, the MFE-vs-realised scatter (dots under the diagonal are profit handed back), how trades end, and the cost of every mistake tag.
* **Risk & drawdown** — underwater curve, risk-per-trade distribution, Monte Carlo (median/5th/95th percentile outcome, drawdown percentiles, risk of ruin, optimal risk).
* **Segments** — ten tables you can sort by: setup, instrument, session, direction, grade, asset class, emotion, tags, confidence, adherence.

### Playbook
One card per setup with rules, checklist, risk rules and — the important part — the market's verdict: trade count, win rate, expectancy, net P&L and an A–D grade. "Run checklist" is the pre-trade gate; "Log a trade" pre-fills the setup.

### Journal
Chronological day reviews with mood/energy/screen-time, plus review prompts and your live goals.

### Risk tools
1. **Position size calculator** — enter instrument, balance, risk %, entry and stop; get size in the native unit, dollar risk, stop distance in pips/points, break-even win rate and R:R. It understands that 1 ES contract ≠ 1 share ≠ 1 BTC.
2. **Break-even & expectancy maths** — win rate, average win/loss in R, trades per month → expectancy, required win rate, monthly return estimate.
3. **Drawdown simulator** — 5,000 Monte Carlo paths sampled from *your* R distribution: median and 5th/95th percentile equity, drawdown percentiles, risk of ruin, longest losing streak, and the log-growth optimal risk (full/half/quarter Kelly).
4. **Trade planner** — write the thesis and levels, save to the watchlist.

### Market
The **TradingView chart panel** sits at the top: type any symbol (datalist covers all 57 instruments), switch
interval (5m…1d), *Open on TradingView ↗* for the full site, *Copy link*, and *Analyse with the bot* to hand the
exact symbol + interval to the bot desk. Below it: six live quote tiles, fear & greed gauge with history,
economic calendar (impact-filtered, in your journal timezone), headlines from ten feeds (filter by category or
"only my instruments"), watchlist with theses and one-click logging, and a source-health panel.

> The widget loads from TradingView's servers, so in a preview sandbox (or offline) it degrades into a card with
> the deep link instead of an empty box — the journal, the bots and every number keep working.

### Settings & data
Accounts (including prop-firm daily-loss and max-drawdown rules with usage bars), instrument library with custom
instruments, CSV import with column auto-detection, CSV/JSON export, JSON restore, sample-journal reseed,
timezone/focus symbols, checklist editor, **Integrations** (the TradingView webhook — see below), and the account
wipe tools.

---

## 3b. TradingView alerts → your journal

This is the fastest feedback loop in the app: a level you care about fires on TradingView, and by the time you
look at your phone the bot has already graded it.

**Set it up once**

1. **Settings → Integrations** → copy the **Webhook URL** (it contains your personal token).
2. In TradingView: right-click the chart → *Add alert* → *Conditions* as usual → *Notifications* → tick
   **Webhook URL** → paste. In **Message**, paste either template from the panel:

   * JSON — `{"symbol":"{{ticker}}","action":"{{strategy.order.action}}","price":"{{close}}","tf":"{{interval}}","time":"{{timenow}}"}`
   * plain text — `BUY {{ticker}} @ {{close}} {{interval}}`

3. Keep **run the bot on every alert** on. Turn on **log actionable ones as tracked signals** if you want the
   plan stored under *Bots → Signals* where it gets scored against real candles later.

**What you get**

| Field | Meaning |
|---|---|
| `received` | what the webhook understood: symbol, side, price, timeframe, TradingView ticker |
| `plan.action` | the bot's own verdict — `BUY`, `SELL` or `NO TRADE`, with a grade and 0–100 mechanics score |
| `plan.entry / stop / targets / rr` | the levels the bot would use, ready to compare with your alert |
| `plan.agreement` | **`agrees`** (you and the bot read the same market) · **`conflicts`** (opposite sides — look before you click) · **`bot says stand down`** · **`position management`** |

Everything that arrives is listed under **Recent alerts** (last 8 in the panel, full history via
`GET /api/bots/alerts`), including alerts that could not be parsed — the raw body is kept, so a template typo
is easy to spot. **Rotate token** invalidates the old URL immediately; do that if the URL ever leaks.

**In the app**

* Market / Dashboard — embedded charts, no TradingView account needed to *look*.
* Bots — *TradingView ↗* opens the market you just analysed, *Copy levels* puts the plan on your clipboard in a
  line you can paste into a TradingView alert or a trade ticket.
* Trade form — *Open chart ↗* to sanity-check a level before logging it, *Copy plan (alert text)* for a one-line
  `BUY XAUUSD · entry … · stop … · target …`.

---

## 4. The review routine

**Daily (5 minutes)** — the app's Calendar → day review: mood, energy, what happened, one lesson, tomorrow's plan.

**Weekly (30 minutes)** — Coach is your agenda:
1. Any **critical** insight that is time-based (hour, weekday, session) becomes a rule for next week.
2. Compare **expectancy by setup**. Pause anything below zero over 10+ trades.
3. Check **capture efficiency** and the MFE scatter. If winners are exiting far below MFE, move to partial + trail.
4. Check **risk consistency**. If it is above ±35%, your sizing is emotional — fix that before touching entries.

**Monthly (90 minutes)** — Analytics:
1. Re-run the **Monte Carlo** at your current risk. If the 95th-percentile drawdown breaches your account rules, cut the risk unit.
2. Review **segments** for anything you added last month (new instrument, new session, new setup) and keep/drop it on the numbers.
3. Re-read the month's journal entries. The same lesson appearing twice means a rule is missing, not that you need more discipline.

---

## 5. Practical tips

* **Log the losers with more detail than the winners.** That is where the money is.
* **Grade adherence honestly.** A 5★ self-rating on a trade that broke two rules makes the whole adherence analysis lie to you.
* **Record MAE/MFE when you can** (the worst and best point of the trade in R). It unlocks the two most valuable charts in the app.
* **Tag mistakes consistently** — five tags used consistently beat twenty used randomly.
* **One variable at a time.** Change a rule, run 20–30 trades, then judge it on expectancy, not on the last three trades.
* **If your sample is under 30 trades for a setup, treat the number as a rumour**, not a result.

## The Bots view, top to bottom (what changed on 2026-10-06)

1. **The "now" strip — one answer.** The first thing on the page is the only thing you can act on:
   one action (`WAIT / BUY / SELL / NO TRADE / RE-CHECK`), the sentence that explains it, and four
   facts — **The order** (or "nothing armed"), **Watch** (the single level and the condition that
   changes the answer), **Until** (the next bar close or the next killzone, so "wait" has a clock)
   and **Read from** (which bar the read came from, how old it is, and how far price has moved
   since). If the live price has moved more than half an ATR since that close, the strip warns you
   that the entry may already be gone.
2. **Bar replay.** Drag the replay slider to re-read the market as of an earlier close. The whole
   panel — chart, steps, plan — is rebuilt from the candles that existed then, the chart is stamped
   `REPLAY`, and the strip tells you what happened in the bars afterwards. Nothing can see the
   future, which is exactly why it is worth trusting.
3. **The chart** — now drawn with drawing tools: pick **Line / Ray / H-line / Box / Fib / Measure**
   and click twice; **Magnet** snaps to the nearest open/high/low/close; **Undo / Delete / Clear**
   manage them. Drawings are saved to your workspace per market *and* timeframe, so they are there
   on your next device. **EMA 50 / EMA 200 / VWAP** overlays are one click each. Size presets
   **M / L / XL / Full** are remembered.
4. **One call, not two.** The entry model grades both directions — that is its job — but the method
   permits one. The permitted side is labelled **THE CALL**; anything else says **NOT ARMED … the
   entry model only**, carries no order, and is folded away with the reason.

## The desk chart: the wheel, the overlays, the sizes (2026-10-07)

* **A plain wheel scrolls the page** — the chart no longer traps it. **Ctrl/⌘ + wheel** zooms, and
  the wheel **over the price axis** zooms too (the axis is a control, not a page).
* **Drag** pans into history; **double-click** returns to the default width; the **M / L / XL / Full**
  buttons resize it and the size is remembered.
* **Every overlay is anchored to its bar**: order blocks, fair-value gaps, liquidity pools, the dealing
  range (premium/discount, EQ, OTE), the plan box and the structure labels all start on the candle
  they came from and run right, so they move and zoom with the candles. An overlay whose origin is
  older than the visible window starts at the left edge of the plot instead of vanishing.
* The chart publishes its own view window as `data-tj-*` attributes and the last frame's overlay
  geometry as `__tjDraw` on the chart element — anyone (including `scripts/probe-overlays.js`) can
  check what is on screen without guessing from pixels.

## Your minimum reward:risk (Settings)

Settings → **Minimum reward : risk** (default **1R**) is the floor every plan is judged against. A plan
below it is not hidden: it is shown, it keeps its entry/stop/target, and it carries a red
*"below your minimum"* warning in the now-strip and in the plan table. Raise it to 2R or 3R and the
same plans stay visible but read flagged; lower it and they read clean. The trading engine's own
1:2 runway rule never loosens below its model — a higher floor tightens it, a lower one does not.

## TradingView in the app

The Market view embeds the official TradingView chart with its own toolbar (interval 1m–1W, chart
style, TradingView's side rail of drawing tools) plus an indicator row — Volume, EMA, VWAP,
Bollinger, Ichimoku, Supertrend, Pivots, RSI, MACD, Stoch RSI, ATR, session volume. Size presets
M / L / XL / **Full screen** (Esc leaves it). On the Bots view, **TV in app** opens the same market
in that panel, and **TradingView chart** opens tradingview.com in a new tab.
