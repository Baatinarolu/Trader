# Metrics guide — what every number means, and the research behind it

This is the "why" document. Every metric below is computed in `src/performance.js` from raw trade rows, and every coaching rule lives in `src/coach.js` — so you can always trace a number back to your own data.

---

## 1. Why journal at all?

The commercial trading-journal market has converged on a consistent set of claims: journals matter because they replace recall with records, and because the metrics that change behaviour are *per-decision* statistics (expectancy, MAE/MFE, time-of-day performance) rather than a P&L total. Practitioner write-ups of what serious journals track consistently list expectancy per setup, MAE/MFE analysis, time-of-day heatmaps, holding-period distributions and behavioural insights derived directly from trade history; the same literature reports that traders who journal consistently for 6+ months see per-trade expectancy improvements, and that removing a single behavioural leak often adds more to annual returns than a new indicator. ([Programming Insider — best trading journal 2025](https://programminginsider.com/best-trading-journal-2025-why-tradebb-dominates/), [Trademetria](https://trademetria.com/))

Sample size is the part most people skip: you need roughly **30–50 trades of the same setup** before an average R and win rate reflect an edge rather than luck. ([OneTradeJournal](https://onetradejournal.com/learn/day-trading-journal))

That is the design brief this app follows: record everything, normalise everything to R, then run statistical tests on *your* rows and rank the findings by dollars.

---

## 2. The metrics

### R-multiple (the unit everything is measured in)
`R = net P&L ÷ risk taken` where risk = |entry − stop| × size × value-per-point.

A trade that risked $200 and made $500 is `+2.5R` regardless of whether it was 2 ES contracts, 0.5 lots of gold or 40 shares of AAPL. This is the only way to compare across markets, and it is why the journal stores an instrument specification (tick size, pip size, currency value of a 1.0 move) for every symbol.

*Benchmarks:* a positive expectancy of **+0.10R to +0.30R** per trade is a solid retail edge; a median trade of `+0.5R` with the occasional `+3R` runner is a healthy distribution shape.

### Expectancy
`Expectancy = (WinRate × AvgWin) − (LossRate × AvgLoss)`, shown in dollars and in R.
"Per 100 trades" is just expectancy × 100 — the number that predicts your month once trade count is stable.

*Rule of thumb:* below `+0.05R` after costs, the edge is too thin to survive slippage and a bad run.

### Profit factor
`Gross profit ÷ gross loss`. `1.0` is break-even, `1.3–1.8` is respectable, `>2.0` over a large sample is strong. It punishes fragile distributions — one outlier winner can push it above 2, which is why the app also reports **profit concentration** (share of gross profit from your top 5 winners).

### Payoff ratio and break-even win rate
`AvgWin ÷ AvgLoss`. The companion number the app calculates everywhere is the **break-even win rate**: at 2:1 you only need 33.3% of trades to win; at 1:1 you need 50%. Knowing this stops the classic mistake of abandoning a good system because the win rate "feels" low.

### MAE and MFE (maximum adverse / favourable excursion)
* **MAE** — the furthest the trade went against you before you closed it (worst "heat").
* **MFE** — the furthest it went in your favour before you closed it.

How to read them ([OneTradeJournal](https://onetradejournal.com/learn/day-trading-journal), [SuperTrader](https://supertrader.me/professional-trading-journal/)):
* Average MAE persistently close to −1R → your stops sit inside normal noise; widen them and cut size to keep the same dollar risk.
* Average MFE much larger than your average realised win → you are **exiting winners early**.
* **Capture efficiency** = `realised R ÷ MFE` on winners. Below ~65% there is systematic profit being handed back; the fix is a partial at target + a trail on the remainder.

### SQN — System Quality Number
`SQN = √N × (mean R ÷ standard deviation of R)`, the Van Tharp measure of how *reliable* the edge is at your sample size. Typical reading: **1.6–1.9 average, 2.0–2.4 good, 2.5–2.9 excellent, 3.0+ superb**, and under 1.0 means noise dominates.

### Sharpe / Sortino / Calmar
Computed from **daily** account returns (`√252` annualised) and therefore sensitive to trading frequency:
* **Sharpe** — return per unit of total volatility.
* **Sortino** — same but only penalises downside volatility (better for skew-positive systems).
* **Calmar** — annualised return ÷ max drawdown. Answers "how much do I earn per unit of pain?"

### Maximum drawdown, recovery factor, risk of ruin
* **Max drawdown** — deepest peak-to-trough equity decline, in $ and %.
* **Current drawdown** — how far below the peak you are *now*; this drives the risk multiplier in the daily briefing.
* **Recovery factor** — net profit ÷ max drawdown. `>2` means the account pays you back for the pain it caused.
* **Risk of ruin** (Monte Carlo) — probability of losing a set fraction (default 50%) of the account over N future trades, sampled from your own R distribution. This is the metric that decides your risk per trade, not your conviction.

### Kelly fraction
The log-growth-optimal fraction of equity to risk per trade, solved numerically over your empirical R distribution. The app always shows **full, half and quarter Kelly** — professionals use half or less, because the estimate is noisy and full Kelly assumes you know your edge exactly.

### Risk consistency
Standard deviation of your per-trade risk as a percentage of the average. A tight band (`±25%` or less) means every trade gets the same chance; anything wider means *which mood sized which trade* is part of your results. Inconsistent sizing makes every other statistic noisier and makes big single losses more likely.

### Time-based analytics
Hour-of-day expectancy, weekday expectancy, session splits (Sydney / Tokyo / London / New York / London-NY overlap) and hold-time buckets. Patterns here are usually the highest-value findings in a journal because they translate directly into "don't trade this window" — a rule you can obey tomorrow.

### Streaks
Longest win/loss streaks and the current one. Gambler's-fallacy aside, the purpose is operational: knowing that 6 losses in a row is *statistically normal* for a 45%-win-rate system stops you from changing a working method during a routine drawdown.

---

## 3. Behavioural rules the coach tests

The academic and practitioner literature on trader behaviour identifies a small number of repeatable, expensive failures. This app tests for each of them with a statistical comparison against your own baseline expectancy:

| Behaviour | What the coach measures |
|---|---|
| **Revenge trading / tilt** | Expectancy of trades opened within 30/45/60 minutes of a loss, versus baseline. Edgewonk's "Tiltmeter" popularised emotional-state tracking for exactly this reason ([Traders Second Brain](https://traderssecondbrain.com/guides/best-trading-journal-app)). |
| **Overtrading** | Expectancy on days with more trades than your median, versus ordinary days. |
| **Disposition effect** | Average hold time of losers vs winners — holding losers longer than winners is the classic sign of hope managing a position. |
| **Size creep after wins** | Average dollar risk after a win vs after a loss. |
| **Rule-adherence gap** | Expectancy of high-adherence trades vs low-adherence ones, using your own 1–5 rating. |
| **Emotional-state drag** | Expectancy when the emotion tag is negative (FOMO/revenge/anxious) vs calm/focused. |
| **Drawdown concentration** | Share of total losses coming from your single worst day. |
| **Cost drag** | Fees and commissions as a share of gross profit. |
| **Instrument / direction leaks** | Negative-expectancy symbols and long/short asymmetry. |

Each finding is ranked by dollar impact and bundled with one action. The philosophy is deliberate: **one change per week** beats a dashboard of twenty problems, which is also how the "review your journal weekly, in groups" advice in the literature works ([OneTradeJournal](https://onetradejournal.com/learn/day-trading-journal)).

---

## 4. Statistical honesty

Things this app deliberately does *not* do:

* **It does not hide small samples.** Segments with fewer than the minimum trade count are down-weighted or excluded from findings (8+ trades for coaching rules, 6+ for segment tables), and the sample size is printed on every insight.
* **It does not invent causality.** "Your 13:00 trades lose money" is a statement about your records, not proof about the market. The action attached is always a short experiment ("blackout the window for two weeks"), never a permanent verdict.
* **It does not confuse luck with skill.** SQN, profit concentration and drawdown concentration all exist to flag results that rest on one or two outliers.
* **It does not forecast.** Monte Carlo describes the *range* of outcomes your current behaviour implies; it is not a prediction, and it is capped at 20,000 paths for speed.

---

### 4b. "Win rate" is meaningless without the reward next to it

The bots report two win rates for every exit plan, and both are printed with **the win rate that plan
needs just to break even**:

| Term | Definition | Why it exists |
|---|---|---|
| **Win rate (`r > 0`)** | the trade finished above zero after costs | the classic number, kept because it is what every broker statement shows |
| **Clean win (`r ≥ +0.5R`)** | the trade banked **at least half a risk unit net** | a scratched runner (+0.1R) or a tiny scalp is not a repeatable business; this bar refuses to count them |
| **Break-even win rate** | `(1 + cost) / (1 + reward)` — e.g. 68.5 % at a 0.6R target, 54.8 % at 1R, 36.5 % at 2R | a 58 % win rate sounds great until you see the target needs 68.5 % |

Both rates come from the same walk-forward replay, so they can be compared directly. Two generators
back this section, and both are re-runnable:

```bash
node scripts/edge-report.js   # 19 exits × 252 filters × 4 entry policies, per-instrument costs (2026-10-06 11:57 UTC)
node scripts/rule-sweep.js    # 288 filter × stop-floor × runway × target rules, 70/30 split (2026-10-06 11:59 UTC)
node scripts/stability-report.js --bars 4000 --step 6 --modes entry,leg   # two-regime check
```

Headline findings (2026-10-06, per-instrument costs):

* **Costs are charged per instrument** — spread + slippage + commission per asset class in basis points
  of price, converted to R by the trade's own stop distance. Median round trip across the pooled sample:
  **0.049R**, mean 0.096R (11 411 unique setups); a 1h EURUSD entry with an 8-pip stop pays **0.216R**,
  gold on 1h pays 0.025R.
  Every break-even number in the app uses the pool's own measured cost, not a hard-coded 0.05R.
* **The net win rate is a function of the target you choose**, and the two peak in different rows:
  0.25R → 55.2 % net wins / −0.34R; 0.35R → 55.8 % / −0.31R; 1R → 45.8 % / −0.18R; 2.5R → 31.0 % / −0.03R.
  Below ~0.6R the cost exceeds the target, so a target that *is* touched can still lose money — which is
  why `win_rate` and `win_rate_0_5r` are reported side by side.
* **A ≥ 70 % win rate exists; a profitable one does not.** `ema50` + displacement leg + stop ≥ 1 × ATR,
  whole position out at 0.25R → **74.8 % net wins train / 74.0 % test** (n=468 / 146) at **−0.084R /
  −0.116R** per trade, with **0 %** of trades banking ≥ +0.5R. Three configurations clear 70 % on both
  halves; all three lose money.
* **Zero of 252 single/pair filters reach 70 % net wins at any of the 14 target distances on the
  untouched test window**, and none produce ≥ 70 % clean wins. The best win rate at any target is 67.1 %
  (`ema50 + dist_ema ≥ 1 ATR`, 0.25R, n=176) at −0.22R; the best expectancy is **+0.31R train / +0.56R
  test** at a 3R target with a 35–42 % win rate. The app reports both, with provenance.
  Full tables: **[docs/EDGE-REPORT.md](EDGE-REPORT.md)** and **[docs/MEASURED-RULES.md](MEASURED-RULES.md)**.

---

## 5. How pro journals do it, and what we picked up from them

The paid market (TradeZella, TraderSync, Edgewonk, Tradervue, Trademetria, TradesViz) competes on broker auto-sync, replay, AI summaries and psychology tooling ([TradeZella comparison](https://www.tradezella.com/blog/best-trading-journal-software), [JournalX](https://www.journalx.io/blog/best-trading-journals), [TradingJournal.com](https://tradingjournal.com/blog/best-trading-journals)). Takeaways that shaped this build:

* **Auto-import is king when you take 5+ trades a day** — so this app ships a CSV importer with column auto-detection instead of pretending to have 500 broker integrations. Paste a file, columns are matched (symbol, side, size, entry, exit, stop, dates, fees, P&L), done.
* **Prop-firm and drawdown rules are a first-class need** — daily loss limits, trailing/static max drawdown, target progress per account. They live on the account, and usage is shown as a bar.
* **Psychology tracking differentiates the best tools** — emotion tags, adherence scores, tilt state and mistake tags are structured fields here, not a free-text box, because they have to be analysable.
* **Multi-asset normalisation is the hard, unglamorous core** — instrument specs, contract multipliers and per-unit value are stored per instrument so stocks, futures, FX, crypto and CFDs land in the same statistics.
* **Data ownership matters** — every export is available (CSV, JSON, one SQLite file), which is precisely what users of the big tools complain they cannot get.

---

## 6. Sources & further reading

**Journaling & metrics**
* Programming Insider — *Best Trading Journal 2025* — multi-asset normalisation, expectancy by segment, MAE/MFE, behavioural insights: <https://programminginsider.com/best-trading-journal-2025-why-tradebb-dominates/>
* SuperTrader — *Professional trading journal metrics* (expectancy, Sharpe, Sortino, MAE/MFE, Calmar): <https://supertrader.me/professional-trading-journal/>
* OneTradeJournal — *Day trading journal: MAE/MFE in plain terms + sample-size guidance*: <https://onetradejournal.com/learn/day-trading-journal>
* Trademetria — *Metrics that matter* (profit factor, expectancy, R-multiples, 20+ metrics): <https://trademetria.com/>

**Tool comparisons & feature landscape**
* JournalX — *The 7 best trading journals* (analytics depth as the deciding factor): <https://www.journalx.io/blog/best-trading-journals>
* TradeZella — *Best trading journal software 2026* (feature matrix across journals): <https://www.tradezella.com/blog/best-trading-journal-software>
* TradingJournal.com — *Best trading journal software* (AI agents, replay, prop-firm support): <https://tradingjournal.com/blog/best-trading-journals>
* Traders Second Brain — *Best trading journal app 2026* (psychology-first comparison, Tiltmeter): <https://traderssecondbrain.com/guides/best-trading-journal-app>
* TradeTrakR — *Best trading journals for futures traders* (tick/point normalisation, rule adherence): <https://tradetrakr.com/blog/posts/best-trading-journals-for-futures-traders.html>
* DayTradingZ — *10 best trading journals* (replay, auto-sync coverage): <https://daytradingz.com/best-trading-journal/>

**Market data feeds used in the app**
* Forex Factory weekly economic calendar (public JSON): <https://nfs.faireconomy.media/ff_calendar_thisweek.json>
* CoinGecko public API (crypto quotes): <https://www.coingecko.com/en/api>
* Yahoo Finance chart endpoint (stocks, ETFs, futures, indices): `https://query2.finance.yahoo.com/v8/finance/chart/{ticker}`
* Frankfurter / ECB reference rates (FX fallback): <https://frankfurter.dev/>
* Alternative.me Crypto Fear & Greed index: <https://api.alternative.me/fng/>
* Headlines: ForexLive, Investing.com, Bloomberg Markets, CNBC, MarketWatch, WSJ Markets, Seeking Alpha, Cointelegraph, The Block, Decrypt (RSS)

---

## 7. Glossary

| Term | Meaning |
|---|---|
| **R** | One unit of risk — the distance from entry to stop, expressed in account currency. |
| **MAE / MFE** | Maximum adverse / favourable excursion: how deep and how far the trade went before you closed it. |
| **MQE** | Maximum quote excursion — same as MFE, sometimes named that way. |
| **SQN** | System Quality Number (Van Tharp): edge reliability adjusted for sample size. |
| **Kelly** | The mathematically optimal risk fraction for log-growth; use half or less in practice. |
| **Slippage** | Difference between expected and filled price — shows up here as a realised R below −1. |
| **Prop firm rules** | Daily loss limit, max drawdown and profit target governing an evaluation account. |
| **Adherence score** | Your own 1–5 rating of how strictly you followed your plan on that trade. |
| **Disposition effect** | The tendency to sell winners early and hold losers too long. |
