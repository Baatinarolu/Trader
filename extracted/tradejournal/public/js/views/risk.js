/* views/risk.js — position sizing, R:R planner, expectancy + risk of ruin tools */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  Views.risk = {
    title: 'Risk tools',
    async render(root) {
      const acc = Store.account() || { starting_balance: 10000, risk_per_trade_pct: 1 };
      root.innerHTML = '';

      /* ---------------------------------------------- position size calculator */
      const sizeCard = U.h('div', { class: 'card pad-lg' });
      sizeCard.innerHTML = `
        <div class="card-head"><h3>Position size calculator</h3><span class="spacer"></span><span class="tiny muted">works for FX lots, futures contracts, shares, coins and CFDs</span></div>
        <div class="grid g-1-2" style="align-items:start">
          <div class="form-grid" style="grid-template-columns:1fr 1fr">
            <label class="field span2"><span>Instrument</span><input id="r-symbol" list="r-symbols" value="EURUSD" />
              <datalist id="r-symbols">${Store.instruments.map((i) => `<option value="${i.symbol}">${U.esc(i.name || '')}</option>`).join('')}</datalist>
              <div class="field-note" id="r-spec"></div></label>
            <label class="field"><span>Account balance</span><input id="r-balance" type="number" step="any" value="${acc.starting_balance}" /></label>
            <label class="field"><span>Risk per trade (%)</span><input id="r-riskpct" type="number" step="0.05" value="${acc.risk_per_trade_pct || 1}" /></label>
            <label class="field"><span>Entry</span><input id="r-entry" type="number" step="any" placeholder="1.0850" /></label>
            <label class="field"><span>Stop loss</span><input id="r-stop" type="number" step="any" placeholder="1.0820" /></label>
            <label class="field"><span>Take profit</span><input id="r-target" type="number" step="any" placeholder="1.0925" /></label>
            <label class="field"><span>Direction</span><select id="r-direction"><option value="long">Long</option><option value="short">Short</option></select></label>
          </div>
          <div class="calc-out" id="r-out"><div class="muted small">Enter entry and stop to size the trade.</div></div>
        </div>`;
      root.appendChild(sizeCard);

      /* ------------------------------------------------ R:R / expectancy tools */
      const row = U.h('div', { class: 'grid g2', style: 'margin-top:14px' });
      const rrCard = U.h('div', { class: 'card' });
      rrCard.innerHTML = `<div class="card-head"><h3>Break-even & expectancy maths</h3></div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr">
          <label class="field"><span>Win rate (%)</span><input id="e-wr" type="number" step="0.5" value="45" /></label>
          <label class="field"><span>Average win (R)</span><input id="e-aw" type="number" step="0.05" value="2" /></label>
          <label class="field"><span>Average loss (R)</span><input id="e-al" type="number" step="0.05" value="1" /></label>
          <label class="field"><span>Trades per month</span><input id="e-n" type="number" step="1" value="40" /></label>
        </div>
        <div id="e-out" class="calc-out"></div>`;
      row.appendChild(rrCard);

      const mcCard = U.h('div', { class: 'card' });
      mcCard.innerHTML = `<div class="card-head"><h3>Drawdown simulator</h3><span class="tiny muted">from your own trades</span></div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr">
          <label class="field"><span>Risk per trade (%)</span><input id="m-risk" type="number" step="0.05" value="${acc.risk_per_trade_pct || 1}" /></label>
          <label class="field"><span>Start equity</span><input id="m-eq" type="number" value="${acc.starting_balance}" /></label>
          <label class="field"><span>Trades ahead</span><input id="m-hor" type="number" value="250" /></label>
          <label class="field"><span>Ruin threshold (% left)</span><input id="m-ruin" type="number" value="50" /></label>
        </div>
        <div class="row" style="gap:8px;margin-bottom:10px"><button class="btn primary sm" id="m-run">Simulate 5,000 paths</button></div>
        <div id="m-out" class="calc-out"><div class="muted small">Uses the R-multiple distribution of every closed trade in the current filter.</div></div>`;
      row.appendChild(mcCard);
      root.appendChild(row);

      /* ------------------------------------------------------- trade planner */
      const planCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
      planCard.innerHTML = `<div class="card-head"><h3>Trade planner — write it before you risk it</h3></div>
        <div class="form-grid">
          <label class="field"><span>Instrument</span><input id="p-symbol" list="r-symbols" value="EURUSD" /></label>
          <label class="field"><span>Bias</span><select id="p-bias"><option>Bullish</option><option>Bearish</option><option>Neutral</option></select></label>
          <label class="field"><span>Setup</span><select id="p-strategy"><option value="">—</option>${Store.strategies.map((s) => `<option value="${s.id}">${U.esc(s.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Trigger / level</span><input id="p-level" placeholder="e.g. reclaim of 1.0860 with volume" /></label>
        </div>
        <label class="field"><span>Why this trade (thesis)</span><textarea id="p-thesis" placeholder="Context, catalyst, invalidation level…"></textarea></label>
        <div class="row" style="gap:8px"><button class="btn primary sm" id="p-save">Save to watchlist</button><span class="tiny muted">Plans you never write down are not plans.</span></div>`;
      root.appendChild(planCard);

      /* ------------------------------------------------------------ wiring */
      const g = (id) => U.$('#' + id, root);
      const hook = (ids, fn) => ids.forEach((id) => { const el = g(id); if (el) el.addEventListener('input', fn); });
      const runSize = () => {
        const spec = Store.instrumentBy(g('r-symbol').value);
        const out = g('r-out');
        g('r-spec').textContent = spec ? `${spec.name} · ${Store.classLabels[spec.asset_class]} · 1 ${Store.unitLabels[spec.asset_class]} = ${U.price(spec.value_per_point)}/point` : 'custom instrument';
        const balance = Number(g('r-balance').value) || 0;
        const riskPct = Number(g('r-riskpct').value) || 0;
        const entry = Number(g('r-entry').value), stop = Number(g('r-stop').value), target = Number(g('r-target').value);
        const vpp = spec ? spec.value_per_point : 1;
        const unit = (spec && Store.unitLabels[spec.asset_class]) || 'units';
        if (!entry || !stop) { out.innerHTML = '<div class="muted small">Enter entry and stop to size the trade.</div>'; return; }
        const riskMoney = balance * riskPct / 100;
        const perUnit = Math.abs(entry - stop) * vpp;
        let size = perUnit > 0 ? riskMoney / perUnit : 0;
        if (spec && ['forex', 'commodity', 'cfd_index'].includes(spec.asset_class)) size = Math.floor(size * 100) / 100;
        else if (spec && spec.asset_class === 'crypto') size = Math.floor(size * 1e6) / 1e6;
        else size = Math.floor(size);
        const actualRisk = size * perUnit;
        const reward = target ? Math.abs(target - entry) * size * vpp : null;
        const rr = target ? Math.abs(target - entry) / Math.abs(entry - stop) : null;
        const be = rr ? 100 / (1 + rr) : null;
        const stopPct = (Math.abs(entry - stop) / entry) * 100;
        const pips = spec && spec.pip_size ? Math.abs(entry - stop) / spec.pip_size : null;
        out.innerHTML = `
          <div class="row-between" style="align-items:flex-end">
            <div><div class="k-label">Position size</div><div class="big">${U.nf(size, size < 10 ? 4 : 2)} <span class="tiny muted">${unit}</span></div></div>
            <div class="right"><div class="k-label">Risk</div><div class="mono neg">${U.money(actualRisk)}</div><div class="tiny muted">${riskPct}% of ${U.money(balance)}</div></div>
          </div>
          <div class="sep"></div>
          <div class="kv">
            <div class="k">Stop distance</div><div class="v">${U.price(Math.abs(entry - stop))} (${U.pct(stopPct, 2)})${pips ? ` · ${U.num(pips, pips > 20 ? 0 : 1)} pips` : ''}</div>
            <div class="k">1.0 price move per 1 ${unit.replace(/s$/, '')}</div><div class="v">${U.money(vpp)}</div>
            <div class="k">Risk per 1 ${unit.replace(/s$/, '')} at this stop</div><div class="v">${U.money(perUnit)}</div>
            ${reward !== null ? `<div class="k">Reward if target hit</div><div class="v pos">${U.money(reward)}</div>` : ''}
            ${rr ? `<div class="k">Reward : risk</div><div class="v">${U.num(rr, 2)} : 1</div>` : ''}
            ${be ? `<div class="k">Break-even win rate needed</div><div class="v ${be > 50 ? 'warn' : ''}">${U.pct(be, 1)}</div>` : ''}
            <div class="k">Loss in R terms</div><div class="v">-1.00R</div>
            ${reward ? `<div class="k">Win in R terms</div><div class="v pos">+${U.num(reward / actualRisk, 2)}R</div>` : ''}
          </div>
          <button class="btn sm block primary" id="r-log" style="margin-top:12px">Log this trade now</button>`;
        const log = U.$('#r-log', out);
        if (log) log.addEventListener('click', () => global.App.openTrade(null, {
          symbol: g('r-symbol').value.toUpperCase(), direction: g('r-direction').value,
          entry: entry, stop: stop, target: target || null, size: size, status: 'open',
        }));
      };
      hook(['r-symbol', 'r-balance', 'r-riskpct', 'r-entry', 'r-stop', 'r-target'], runSize);
      g('r-direction').addEventListener('change', runSize);
      runSize();

      const runExp = () => {
        const wr = Number(g('e-wr').value) / 100, aw = Number(g('e-aw').value), al = Math.abs(Number(g('e-al').value));
        const n = Number(g('e-n').value) || 0;
        const exp = wr * aw - (1 - wr) * al;
        const be = (al / (al + aw)) * 100;
        const monthly = exp * n;
        const acc2 = Store.account() || { starting_balance: 10000 };
        const riskPctPer = acc2.risk_per_trade_pct || 1;
        const pctMonthly = monthly * riskPctPer;                 // 1R ≈ risk% of equity, so monthly R × risk% = % gain
        const pctYearly = pctMonthly * 12;
        g('e-out').innerHTML = `
          <div class="row-between"><div><div class="k-label">Expectancy</div><div class="big ${U.cls(exp)}">${U.signed(exp, 3)}R</div></div>
            <div class="right"><div class="k-label">Per 100 trades</div><div class="mono ${U.cls(exp * 100)}">${U.signed(exp * 100, 1)}R</div></div></div>
          <div class="sep"></div>
          <div class="kv">
            <div class="k">Break-even win rate at this R:R</div><div class="v">${U.pct(be, 1)} <span class="tiny muted">(you are at ${U.pct(wr * 100, 1)})</span></div>
            <div class="k">Monthly expectancy</div><div class="v ${U.cls(monthly)}">${U.signed(monthly, 1)}R</div>
            <div class="k">≈ Return at ${U.num(riskPctPer, 2)}% risk/trade</div><div class="v ${U.cls(pctMonthly)}">${U.signed(pctMonthly, 1)}% / month · ${U.signed(pctYearly, 0)}% / year <span class="tiny muted">(before compounding)</span></div>
            <div class="k">Verdict</div><div class="v">${exp > 0.2 ? '<span class="pos">Strong edge</span>' : exp > 0.05 ? '<span class="pos">Real but thin edge</span>' : exp > 0 ? '<span class="warn">Marginal — costs may erase it</span>' : '<span class="neg">Negative expectancy</span>'}</div>
          </div>
          <div class="tiny muted" style="margin-top:8px">Sanity check: with ${U.num(aw, 1)}R average winners you need a ${U.pct(be, 1)} win rate just to break even. Anything above that is your edge.</div>`;
      };
      hook(['e-wr', 'e-aw', 'e-al', 'e-n'], runExp); runExp();

      g('m-run').addEventListener('click', async () => {
        const out = g('m-out');
        out.innerHTML = '<div class="skeleton" style="height:90px"></div>';
        try {
          const d = await API.get('/analytics/monte-carlo', {
            ...Store.queryParams(), risk_pct: g('m-risk').value, start_equity: g('m-eq').value,
            horizon: g('m-hor').value, ruin: g('m-ruin').value, sims: 5000,
          });
          const mc = d.monte_carlo, op = d.optimal_risk;
          if (!mc) { out.innerHTML = '<div class="empty">Log some closed trades first.</div>'; return; }
          const fan = [];
          out.innerHTML = `<div class="grid g4">
              ${[['Median end equity', U.money(mc.median_end), U.signed(mc.median_return_pct, 1) + '%', U.cls(mc.median_end - mc.start_equity)],
                 ['5th percentile', U.money(mc.p5_end), 'the bad-luck path', 'neg'],
                 ['95th percentile', U.money(mc.p95_end), 'the good path', 'pos'],
                 ['Risk of ruin', U.pct(mc.risk_of_ruin, 2), `drop below ${g('m-ruin').value}% of start`, mc.risk_of_ruin > 1 ? 'neg' : 'pos']]
                .map(([l, v, s, cl]) => `<div class="kpi"><div class="k-label">${l}</div><div class="k-value ${cl}" style="font-size:1.02rem">${v}</div><div class="k-sub">${s}</div></div>`).join('')}
            </div>
            <div class="kv" style="margin-top:12px">
              <div class="k">Median max drawdown</div><div class="v neg">${U.pct(mc.median_max_dd_pct, 1)}</div>
              <div class="k">95th pct max drawdown</div><div class="v neg">${U.pct(mc.p95_max_dd_pct, 1)}</div>
              <div class="k">Probability of profit</div><div class="v">${U.pct(mc.prob_profit, 1)}</div>
              <div class="k">Longest losing streak seen</div><div class="v">${mc.longest_losing_streak}</div>
              <div class="k">Log-growth optimal risk</div><div class="v">${U.pct(op.kelly || 0, 2)} (half ${U.pct(op.half || 0, 2)}, quarter ${U.pct(op.quarter || 0, 2)})</div>
            </div>
            <div class="sticky-note" style="margin-top:12px">If the 95th-percentile drawdown would breach your account rules, the fix is a smaller risk unit — not a better strategy.</div>`;
        } catch (e) { out.innerHTML = `<div class="empty">${U.esc(e.message)}</div>`; }
      });

      g('p-save').addEventListener('click', async () => {
        try {
          const s = Store.strategyById(g('p-strategy').value);
          await API.post('/watchlist', {
            symbol: g('p-symbol').value.toUpperCase(), asset_class: (Store.instrumentBy(g('p-symbol').value) || {}).asset_class,
            thesis: `${s ? s.name + ' — ' : ''}${g('p-thesis').value}`, bias: g('p-bias').value.toLowerCase(),
            key_level: g('p-level').value, catalyst: '',
          });
          global.App.toast('Plan saved to watchlist', 'ok');
        } catch (e) { global.App.toast(e.message, 'err'); }
      });

      /* -------------------------------------------------- options calculator */
      const optCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
      optCard.innerHTML = `
        <div class="card-head"><h3>Options calculator</h3><span class="spacer"></span><span class="tiny muted">Black-Scholes solved locally — no options feed, IV is yours to supply</span></div>
        <div class="form-grid" style="grid-template-columns:repeat(3,1fr)">
          <label class="field"><span>Underlying price</span><input id="o-spot" type="number" step="any" value="580" /></label>
          <label class="field"><span>Strike</span><input id="o-strike" type="number" step="any" value="585" /></label>
          <label class="field"><span>IV (%)</span><input id="o-iv" type="number" step="1" value="22" /></label>
          <label class="field"><span>Days to expiry</span><input id="o-dte" type="number" step="1" value="30" /></label>
          <label class="field"><span>Type</span><select id="o-type"><option value="call">Call</option><option value="put">Put</option></select></label>
          <label class="field"><span>Contracts</span><input id="o-contracts" type="number" step="1" value="1" /></label>
          <label class="field"><span>Your entry premium</span><input id="o-entryp" type="number" step="any" placeholder="blank = fair value" /></label>
          <label class="field"><span>Stop premium</span><input id="o-stopp" type="number" step="any" placeholder="blank = whole debit" /></label>
          <label class="field"><span>Target premium</span><input id="o-targetp" type="number" step="any" placeholder="optional" /></label>
        </div>
        <div class="calc-out" id="o-out" style="margin-top:10px"><div class="muted small">Fill the inputs — price, greeks, max loss and breakeven appear here.</div></div>`;
      root.appendChild(optCard);

      /* ------------------------------------------------- challenge tracker */
      const chCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
      chCard.innerHTML = `<div class="card-head"><h3>Challenge rules</h3><span class="spacer"></span><span class="tiny muted">presets are common challenge shapes, not any firm's current contract — the app polices the numbers you set</span></div>
        <div class="row-inline" style="gap:8px;align-items:end;flex-wrap:wrap">
          <label class="field" style="min-width:280px"><span>Preset</span><select id="c-preset"></select></label>
          <button class="btn" id="c-save">Apply to this account</button>
        </div>
        <div id="c-out" style="margin-top:10px"><div class="muted small">Loading…</div></div>`;
      root.appendChild(chCard);

      /* ------------------------------------------------------- exposure */
      const exCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
      exCard.innerHTML = `<div class="card-head"><h3>Portfolio exposure &amp; heat</h3><span class="spacer"></span><span class="tiny muted">what per-trade risk cannot see: clusters, heat, hedges</span></div>
        <div id="x-out"><div class="muted small">Loading…</div></div>`;
      root.appendChild(exCard);

      const ob = (id) => { const el = document.getElementById(id); return el && el.value !== '' ? Number(el.value) : undefined; };
      const greeks = async () => {
        const out = document.getElementById('o-out');
        if (!out) return;
        const body = {
          spot: ob('o-spot'), strike: ob('o-strike'), iv: (ob('o-iv') || 0) / 100, dte: ob('o-dte'),
          type: (document.getElementById('o-type') || {}).value,
          contracts: ob('o-contracts') || 1, entry_premium: ob('o-entryp'), stop_premium: ob('o-stopp'), target_premium: ob('o-targetp'),
        };
        if (!body.spot || !body.strike || !body.iv || !body.dte) { out.innerHTML = '<div class="muted small">Spot, strike, IV and days are required.</div>'; return; }
        try {
          const r = await global.API.post('/options/plan', body);
          if (!r.ok) { out.innerHTML = `<div class="warn small">${U.esc(r.error || 'could not price that')}</div>`; return; }
          const g = r.greeks;
          out.innerHTML = `<div class="stat-strip" style="margin-bottom:8px">
              <div><div class="l">Fair value</div><div class="v">${r.entry_premium}</div></div>
              <div><div class="l">Cost (${r.contracts} × ${r.multiplier})</div><div class="v">${r.cost}</div></div>
              <div><div class="l">Max loss</div><div class="v">${r.max_loss}</div></div>
              <div><div class="l">Risk to stop premium</div><div class="v">${r.risk_total}</div></div>
              <div><div class="l">R:R</div><div class="v">${r.rr == null ? '—' : r.rr}</div></div>
              <div><div class="l">Breakeven at expiry</div><div class="v">${r.breakeven_at_expiry}</div></div>
            </div>
            <div class="bot-detail">delta ${g.delta} · gamma ${g.gamma} · theta ${g.theta}/day · vega ${g.vega}/vol pt · rho ${g.rho} · ${U.esc(String(g.moneyness).toUpperCase())} · extrinsic ${g.extrinsic}${r.warning ? ` · <span class="warn">${U.esc(r.warning)}</span>` : ''}</div>
            <div class="tiny muted">${U.esc(r.note)} ${U.esc(g.note)}</div>`;
        } catch (e) { out.innerHTML = `<div class="warn small">${U.esc(e.message)}</div>`; }
      };
      ['o-spot', 'o-strike', 'o-iv', 'o-dte', 'o-type', 'o-contracts', 'o-entryp', 'o-stopp', 'o-targetp'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.addEventListener('input', greeks); el.addEventListener('change', greeks); }
      });
      greeks();

      const accountId = (Store.account() || {}).id;
      (async () => {
        const sel = document.getElementById('c-preset');
        const out = document.getElementById('c-out');
        const bar = (c) => {
          const p2 = c.limit > 0 ? Math.min(100, (c.used / Math.max(c.limit, 1)) * 100) : 0;
          const cls = c.breached ? 'neg' : p2 > 80 ? 'warn' : 'pos';
          return `<div class="bot-detail"><b>${U.esc(c.label)}</b> — used ${Math.round(c.used * 100) / 100} of ${Math.round(c.limit * 100) / 100}${c.unit === 'days' ? ' days' : ''} (${c.pct_of_limit == null ? '—' : c.pct_of_limit + '%'}) ${c.done ? 'target met' : ''}
            <div class="bot-prob-bar"><i class="${cls}" style="width:${p2}%"></i></div></div>`;
        };
        const paint = (data) => {
          if (!out) return;
          const st = data && data.status;
          if (!st || !st.ok) { out.innerHTML = `<div class="muted small">${U.esc((st && st.error) || 'no challenge data')}</div>`; return; }
          out.innerHTML = `<div class="chip-row">
              <span class="chip ${st.breached.length ? 'warn' : 'ok'}">${st.breached.length ? 'BREACHED: ' + st.breached.join(', ') : 'within all rules'}</span>
              <span class="chip ${st.passed ? 'ok' : ''}">${st.passed ? 'challenge passed' : 'in progress'}</span>
              <span class="chip">balance ${st.balance} · floor ${st.dd_floor} · target ${st.target_balance}</span></div>
            ${st.checks.map(bar).join('')}
            <div class="tiny muted">${U.esc(st.note)}</div>`;
        };
        try {
          const p = await global.API.get('/prop/presets');
          if (sel) sel.innerHTML = (p.presets || []).map((x) => `<option value="${x.key}">${U.esc(x.name)}</option>`).join('');
          const load = async () => { const d = await global.API.get('/accounts/' + accountId + '/challenge'); paint(d); if (sel && d && d.preset) sel.value = d.preset; };
          await load();
          const btn = document.getElementById('c-save');
          if (btn) btn.addEventListener('click', async () => {
            try { await global.API.put('/accounts/' + accountId, { prop_preset: sel.value }); global.App.toast('Challenge preset applied', 'ok'); await load(); }
            catch (e) { global.App.toast(e.message, 'err'); }
          });
        } catch (e) { if (out) out.innerHTML = `<div class="warn small">${U.esc(e.message)}</div>`; }
      })();

      (async () => {
        const out = document.getElementById('x-out');
        try {
          const d = await global.API.get('/risk/exposure' + (accountId ? '?account_id=' + accountId : ''));
          if (!out) return;
          out.innerHTML = `<div class="chip-row">
              <span class="chip ${d.warnings && d.warnings.length ? 'warn' : 'ok'}">${d.open_positions} open · heat ${d.heat}${d.heat_pct == null ? '' : ` (${d.heat_pct}% of balance)`}</span>
              <span class="chip">cap ${d.max_heat_pct}%</span></div>
            ${(d.warnings || []).map((w) => `<div class="bot-warn">${U.esc(w)}</div>`).join('')}
            ${(d.clusters || []).length ? `<table class="data-table"><thead><tr><th>Cluster</th><th class="num">Positions</th><th class="num">Risk</th><th class="num">Share of heat</th><th>Flags</th></tr></thead><tbody>
              ${d.clusters.map((c) => `<tr><td>${U.esc(c.label)}<div class="tiny muted">${U.esc(c.why)}</div></td><td class="num">${c.trades.length}</td>
                <td class="num">${c.risk}</td><td class="num">${c.share_of_heat_pct == null ? '—' : c.share_of_heat_pct + '%'}</td>
                <td>${c.breaches.length ? c.breaches.map((b) => `<span class="chip warn">${U.esc(b)}</span>`).join(' ') : '<span class="chip ok">clean</span>'}</td></tr>`).join('')}
            </tbody></table>` : '<div class="muted small">No open positions right now.</div>'}
            <div class="tiny muted">${U.esc(d.note || '')}</div>`;
        } catch (e) { if (out) out.innerHTML = `<div class="warn small">${U.esc(e.message)}</div>`; }
      })();

      return root;
    },
  };
})(window);
