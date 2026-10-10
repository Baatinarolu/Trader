/* views/analytics.js — deep statistics: distribution, timing, executions, risk */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  Views.analytics = {
    title: 'Analytics',
    async render(root) {
      const params = Store.queryParams();
      const an = await Store.fetch('/analytics', params, 15000);
      const k = an.kpis;
      root.innerHTML = '';

      const tabs = U.h('div', { class: 'tabs' });
      const panes = U.h('div');
      const TABS = [['core', 'Core statistics'], ['timing', 'Timing & sessions'], ['execution', 'Execution quality'], ['risk', 'Risk & drawdown'], ['segments', 'Segments']];
      let active = 'core';
      TABS.forEach(([id, label]) => tabs.appendChild(U.h('button', { class: active === id ? 'active' : '', text: label, onclick: () => { active = id; U.$$('button', tabs).forEach((b, i) => b.classList.toggle('active', TABS[i][0] === id)); U.clear(panes); panes.appendChild(PANES[id]()); } })));
      root.appendChild(tabs); root.appendChild(panes);

      const PANES = {
        core() {
          const w = U.h('div', { class: 'grid' });
          const cards = [
            ['Profitability', [['Net P&L', U.moneySign(k.net_pnl), U.cls(k.net_pnl)], ['Gross profit', U.money(k.gross_profit), 'pos'], ['Gross loss', U.money(-k.gross_loss), 'neg'], ['Fees & costs', U.money(-k.fees), 'neg'], ['Expectancy / trade', U.moneySign(k.expectancy), U.cls(k.expectancy)], ['Expectancy (R)', U.signed(k.expectancy_r, 3) + 'R', U.cls(k.expectancy_r)], ['Profit factor', k.profit_factor === null ? '∞' : U.num(k.profit_factor, 2), ''], ['Payoff ratio', U.num(k.payoff, 2), ''], ['Kelly optimum', U.pct(k.kelly, 1), '']]],
            ['Discipline', [['Compliance (per trade)', k.compliance === null ? '—' : U.pct(k.compliance, 1), ''], ['Compliance (pooled steps)', k.compliance_pooled === null ? '—' : U.pct(k.compliance_pooled, 1), ''], ['Trades with a checklist', k.compliance_trades === undefined ? '—' : k.compliance_trades, ''], ['Checklist steps followed', (k.compliance_checks ? k.compliance_passed + ' / ' + k.compliance_checks : '—'), '']]],
            ['Trade outcomes', [['Total trades', k.trades, ''], ['Winners', `${k.wins} (${U.pct(k.win_rate, 1)})`, 'pos'], ['Losers', `${k.losses} (${U.pct(k.loss_rate, 1)})`, 'neg'], ['Break-even', k.breakevens, ''], ['Avg win', U.money(k.avg_win), 'pos'], ['Avg loss', U.money(-k.avg_loss), 'neg'], ['Largest win', U.money(k.best_trade), 'pos'], ['Largest loss', U.money(k.worst_trade), 'neg'], ['Best / worst R', `${U.signed(k.best_r, 1)}R / ${U.signed(k.worst_r, 1)}R`, '']]],
            ['Risk-adjusted', [['Sharpe (ann.)', U.num(k.sharpe, 2), k.sharpe > 1 ? 'pos' : ''], ['Sortino (ann.)', U.num(k.sortino, 2), k.sortino > 1 ? 'pos' : ''], ['SQN', U.num(k.sqn, 2), ''], ['Calmar', U.num(k.calmar, 2), ''], ['Recovery factor', U.num(k.recovery_factor, 2), ''], ['Std dev of R', U.num(k.std_r, 2), ''], ['Median R', U.signed(k.median_r, 2) + 'R', ''], ['Total R', U.signed(k.total_r, 1) + 'R', U.cls(k.total_r)], ['Profit concentration', U.pct(k.profit_concentration, 0), '']]],
            ['Discipline', [['Avg adherence', k.avg_adherence ? U.num(k.avg_adherence, 2) + ' / 5' : '—', ''], ['Risk consistency', '±' + U.pct(k.risk_consistency, 0), k.risk_consistency < 35 ? 'pos' : 'warn'], ['Avg risk / trade', U.money(k.avg_risk), ''], ['Avg risk % of balance', U.pct(k.avg_risk_pct_of_balance, 2), ''], ['Trades without stop', k.stops_overshot ? `${an.by_symbol.length ? '' : ''}${k.stops_overshot} over -1R` : '0', ''], ['Current streak', k.streaks.current === 0 ? '—' : (k.streaks.current_type === 'win' ? k.streaks.current + ' wins' : Math.abs(k.streaks.current) + ' losses'), k.streaks.current_type === 'loss' ? 'neg' : 'pos'], ['Longest win streak', k.streaks.longest_win, ''], ['Longest loss streak', k.streaks.longest_loss, 'neg'], ['Trading days', `${k.trading_days} (${U.num(k.avg_trades_per_day, 1)}/day)`, '']]],
          ];
          const grid = U.h('div', { class: 'grid g4' });
          cards.forEach(([title, rows]) => {
            const c = U.h('div', { class: 'card' });
            c.innerHTML = `<div class="card-head"><h3>${title}</h3></div><div class="kv">${rows.map(([l, v, cl]) => `<div class="k">${l}</div><div class="v ${cl || ''}">${v}</div>`).join('')}</div>`;
            grid.appendChild(c);
          });
          w.appendChild(grid);

          const eq = U.h('div', { class: 'card', style: 'margin-top:14px' });
          eq.innerHTML = '<div class="card-head"><h3>Equity & drawdown</h3></div><div id="a-eq"></div>';
          w.appendChild(eq);

          const dist = U.h('div', { class: 'grid g2', style: 'margin-top:14px' });
          const d1 = U.h('div', { class: 'card', html: '<div class="card-head"><h3>R-multiple distribution</h3></div><div id="a-dist"></div>' });
          const d2 = U.h('div', { class: 'card', html: '<div class="card-head"><h3>P&L by trade (waterfall)</h3></div><div id="a-water"></div>' });
          dist.appendChild(d1); dist.appendChild(d2);
          w.appendChild(dist);

          requestAnimationFrame(() => {
            U.lineChart(U.$('#a-eq', w), { height: 300, ddShade: true, series: [{ color: 'var(--accent)', fill: true, points: an.equity.map((p) => ({ x: p.i, y: p.equity })) }], yFormat: (v) => U.compact(v), xFormat: (v) => '#' + Math.round(v) });
            U.histogram(U.$('#a-dist', w), an.distribution, { height: 220 });
            const pnls = an.equity.slice(1).map((p, i) => ({ label: '#' + (i + 1), short: '', value: 0 }));
            U.barChart(U.$('#a-water', w), { height: 220, data: pnls.map((_, i) => ({ label: '', short: '', value: 0 })), yFormat: () => '' });
            // real waterfall: cumulative P&L contributions of last 60 trades
            const last = an.equity.slice(-61);
            const bars = [];
            for (let i = 1; i < last.length; i++) bars.push({ label: '#' + last[i].i, short: '', value: last[i].equity - last[i - 1].equity });
            U.barChart(U.$('#a-water', w), { height: 220, data: bars, yFormat: (v) => U.compact(v), labelEvery: 10 });
          });
          return w;
        },

        timing() {
          const w = U.h('div', { class: 'grid' });
          const mn = Math.floor(k.avg_hold_minutes);
          const strip = U.h('div', { class: 'grid g4' });
          [['Session split', an.by_session.slice(0, 4).map((s) => `${s.key}: ${U.signed(s.expectancy_r, 2)}R (${s.trades})`).join(' · ')],
           ['Hour curve', 'Your expectancy by hour of entry — green bars are hours where your edge lives.'],
           ['Day of week', 'Expectancy and volume by weekday.'],
           ['Hold time', `Average hold ${U.dur(mn)} · winners ${U.dur(k.avg_win_hold)} vs losers ${U.dur(k.avg_loss_hold)}`]]
            .forEach(([t, s]) => strip.appendChild(U.h('div', { class: 'card' }, U.h('div', { class: 'k-label', text: t }), U.h('div', { class: 'small muted-2', style: 'margin-top:6px', text: s }))));
          w.appendChild(strip);

          const hourCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
          hourCard.innerHTML = '<div class="card-head"><h3>Expectancy by hour of day (journal timezone)</h3><span class="tiny muted">hover a cell for detail</span></div><div id="a-hours"></div>';
          w.appendChild(hourCard);

          const dowCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
          dowCard.innerHTML = '<div class="card-head"><h3>Performance by weekday</h3></div><div id="a-dow"></div>';
          w.appendChild(dowCard);

          const holdCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
          holdCard.innerHTML = `<div class="card-head"><h3>Hold time buckets — are you cutting winners too early?</h3></div>
            ${an.by_hold.length ? `<table><thead><tr><th>Hold time</th><th class="num">Trades</th><th class="num">Win %</th><th class="num">Expectancy</th><th class="num">Net</th><th class="num">PF</th></tr></thead><tbody>
            ${an.by_hold.sort((a, b) => a.avg_hold - b.avg_hold).map((h) => `<tr><td>${U.esc(h.key)}</td><td class="num">${h.trades}</td><td class="num">${U.pct(h.win_rate, 0)}</td>
              <td class="num ${U.cls(h.expectancy_r)}">${U.signed(h.expectancy_r, 2)}R</td><td class="num ${U.cls(h.net_pnl)}">${U.moneySign(h.net_pnl, 0)}</td><td class="num">${h.profit_factor === null ? '∞' : U.num(h.profit_factor, 2)}</td></tr>`).join('')}
            </tbody></table>` : '<div class="empty">No data.</div>'}`;
          w.appendChild(holdCard);

          requestAnimationFrame(() => {
            const hEl = U.$('#a-hours', w);
            const hours = an.time.hours;
            const max = Math.max(1, ...hours.map((h) => Math.abs(h.expectancy_r)));
            hEl.innerHTML = `<div class="hm">${hours.map((h) => `<div class="hm-cell" style="background:${h.trades ? U.heatColor(h.expectancy_r, max) : 'var(--panel-3)'}" title="${h.label} — ${h.trades} trades, ${U.signed(h.expectancy_r, 2)}R, ${U.moneySign(h.net_pnl, 0)}"></div>`).join('')}</div>
              <div class="hm-labels">${hours.map((h) => `<span>${h.key % 3 === 0 ? String(h.key).padStart(2, '0') : ''}</span>`).join('')}</div>
              <div class="tiny muted" style="margin-top:8px">Cells with no trades stay grey. Intensity scales with expectancy per trade.</div>`;
            const dowEl = U.$('#a-dow', w);
            U.barChart(dowEl, { height: 190, data: an.time.dow.map((d) => ({ label: d.key, short: d.key, value: d.expectancy_r })), yFormat: (v) => v.toFixed(2) + 'R' });
          });
          return w;
        },

        execution() {
          const w = U.h('div', { class: 'grid' });
          const top = U.h('div', { class: 'grid g4' });
          const eff = k.capture_efficiency;
          [['Capture efficiency', eff === null ? '—' : U.pct(eff, 0), eff > 70 ? 'pos' : eff > 55 ? '' : 'neg', 'How much of the favourable move you actually bank'],
           ['Avg MAE', k.avg_mae_r === null ? '—' : U.num(k.avg_mae_r, 2) + 'R', k.avg_mae_r < -0.7 ? 'warn' : '', 'How far trades go against you before working'],
           ['Avg MFE', k.avg_mfe_r === null ? '—' : U.signed(k.avg_mfe_r, 2) + 'R', '', 'Best unrealised level reached on average'],
           ['Stop overshoots', k.stops_overshot, k.stops_overshot > 3 ? 'neg' : '', 'Trades that realised worse than -1R']]
            .forEach(([l, v, cl, s]) => top.appendChild(U.h('div', { class: 'card' }, U.h('div', { class: 'k-label', text: l }), U.h('div', { class: 'k-value ' + cl, text: v }), U.h('div', { class: 'k-sub', text: s }))));
          w.appendChild(top);

          const sc = U.h('div', { class: 'card', style: 'margin-top:14px' });
          sc.innerHTML = `<div class="card-head"><h3>Exit efficiency — realised vs available (last 60 trades)</h3><span class="tiny muted">dots near the diagonal = you captured what the market offered</span></div><div id="a-scatter"></div>`;
          w.appendChild(sc);

          const ex = U.h('div', { class: 'card', style: 'margin-top:14px' });
          const reasons = Object.entries(k.exit_reasons || {}).sort((a, b) => b[1] - a[1]);
          ex.innerHTML = `<div class="card-head"><h3>How your trades end</h3></div>
            ${reasons.length ? `<div class="win-bar" style="margin-bottom:12px">${reasons.map(([r, n], i) => {
              const cols = ['var(--green)', 'var(--red)', 'var(--accent)', 'var(--amber)', 'var(--purple)', 'var(--cyan)'];
              const p = (n / k.trades) * 100;
              return `<i style="width:${p}%;background:${cols[i % cols.length]}" title="${U.esc(r)}: ${n}"></i>`;
            }).join('')}</div>
            <table><thead><tr><th>Exit reason</th><th class="num">Count</th><th class="num">Share</th></tr></thead><tbody>
            ${reasons.map(([r, n]) => `<tr><td>${U.esc(r)}</td><td class="num">${n}</td><td class="num">${U.pct((n / k.trades) * 100, 1)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No exits recorded.</div>'}`;
          w.appendChild(ex);

          const mt = U.h('div', { class: 'card', style: 'margin-top:14px' });
          mt.innerHTML = `<div class="card-head"><h3>Cost of each mistake tag</h3><span class="tiny muted">what a habit actually costs you, in dollars and R</span></div>
            ${an.by_mistake.length ? `<table><thead><tr><th>Mistake</th><th class="num">Trades</th><th class="num">Win %</th><th class="num">Expectancy</th><th class="num">Net</th><th style="width:120px">Impact</th></tr></thead><tbody>
            ${an.by_mistake.sort((a, b) => a.net_pnl - b.net_pnl).map((m) => `<tr><td>${U.esc(m.key)}</td><td class="num">${m.trades}</td><td class="num">${U.pct(m.win_rate, 0)}</td>
              <td class="num ${U.cls(m.expectancy_r)}">${U.signed(m.expectancy_r, 2)}R</td><td class="num ${U.cls(m.net_pnl)}">${U.moneySign(m.net_pnl, 0)}</td>
              <td>${U.bar(m.net_pnl, Math.max(1, ...an.by_mistake.map((x) => Math.abs(x.net_pnl))), m.net_pnl >= 0 ? 'pos' : 'neg')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Tag mistakes when you log trades and this table becomes your most valuable page.</div>'}`;
          w.appendChild(mt);

          requestAnimationFrame(() => {
            const el = U.$('#a-scatter', w);
            drawScatter(el, an.points || [], an.kpis);
          });
          return w;
        },

        risk() {
          const w = U.h('div', { class: 'grid' });
          const dd = U.h('div', { class: 'grid g3' });
          [['Max drawdown', U.pct(k.max_drawdown_pct, 1), U.money(k.max_drawdown), 'neg'],
           ['Current drawdown', U.pct(k.current_drawdown_pct, 1), U.money(k.current_drawdown), k.current_drawdown_pct < -5 ? 'neg' : ''],
           ['Recovery factor', U.num(k.recovery_factor, 2), 'net profit ÷ max DD', k.recovery_factor > 2 ? 'pos' : '']]
            .forEach(([l, v, s, cl]) => dd.appendChild(U.h('div', { class: 'card' }, U.h('div', { class: 'k-label', text: l }), U.h('div', { class: 'k-value ' + cl, text: v }), U.h('div', { class: 'k-sub', text: s }))));
          w.appendChild(dd);

          const ddCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
          ddCard.innerHTML = '<div class="card-head"><h3>Drawdown profile</h3><span class="tiny muted">underwater curve — how deep and how long</span></div><div id="a-dd"></div>';
          w.appendChild(ddCard);

          const rmCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
          rmCard.innerHTML = `<div class="card-head"><h3>Risk per trade distribution</h3><span class="tiny muted">consistency matters more than size</span></div><div id="a-riskmix"></div>`;
          w.appendChild(rmCard);

          const mcCard = U.h('div', { class: 'card', style: 'margin-top:14px' });
          mcCard.innerHTML = `<div class="card-head"><h3>Monte Carlo — next 100 trades at your current behaviour</h3></div>
            <div class="filters" style="margin-bottom:12px">
              <label class="tiny muted">Risk % <input id="mc-risk" type="number" step="0.1" value="${(Store.account() || {}).risk_per_trade_pct || 1}" style="width:80px" /></label>
              <label class="tiny muted">Trades <input id="mc-horizon" type="number" value="100" style="width:80px" /></label>
              <label class="tiny muted">Start equity <input id="mc-eq" type="number" value="${(Store.account() || {}).starting_balance || 10000}" style="width:110px" /></label>
              <button class="btn sm primary" id="mc-run">Run 5,000 simulations</button>
            </div>
            <div id="mc-out"><div class="muted tiny">Simulation draws randomly from your own R-multiple distribution — it answers "if I keep trading exactly like this, what happens?"</div></div>`;
          w.appendChild(mcCard);

          requestAnimationFrame(() => {
            const under = an.equity.map((p) => ({ x: p.i, y: Math.min(0, p.dd_pct) }));
            U.lineChart(U.$('#a-dd', w), { height: 220, zeroLine: true, series: [{ color: 'var(--red)', fill: true, points: under.slice(1) }], yFormat: (v) => v.toFixed(1) + '%', xFormat: (v) => '#' + Math.round(v) });
            drawRiskMix(U.$('#a-riskmix', w), an);
            const run = U.$('#mc-run', w);
            run.addEventListener('click', async () => {
              const out = U.$('#mc-out', w);
              out.innerHTML = '<div class="skeleton" style="height:120px"></div>';
              try {
                const d = await API.get('/analytics/monte-carlo', { ...Store.queryParams(), risk_pct: U.$('#mc-risk', w).value, horizon: U.$('#mc-horizon', w).value, start_equity: U.$('#mc-eq', w).value, sims: 5000 });
                const mc = d.monte_carlo, op = d.optimal_risk;
                if (!mc) { out.innerHTML = '<div class="empty">Need at least one closed trade.</div>'; return; }
                out.innerHTML = `<div class="grid g4">
                  ${[['Median outcome', U.money(mc.median_end), U.signed(mc.median_return_pct, 1) + '%', U.cls(mc.median_end - mc.start_equity)],
                     ['5th percentile', U.money(mc.p5_end), U.signed(mc.p5_return_pct, 1) + '%', 'neg'],
                     ['95th percentile', U.money(mc.p95_end), U.signed(mc.p95_return_pct, 1) + '%', 'pos'],
                     ['Probability of profit', U.pct(mc.prob_profit, 1), `${mc.sims} sims × ${mc.horizon} trades`, mc.prob_profit > 55 ? 'pos' : 'neg']]
                    .map(([l, v, s, cl]) => `<div class="kpi"><div class="k-label">${l}</div><div class="k-value ${cl}" style="font-size:1.05rem">${v}</div><div class="k-sub">${s}</div></div>`).join('')}
                </div>
                <div class="kv" style="margin-top:14px">
                  <div class="k">Median max drawdown</div><div class="v neg">${U.pct(mc.median_max_dd_pct, 1)}</div>
                  <div class="k">95th percentile drawdown</div><div class="v neg">${U.pct(mc.p95_max_dd_pct, 1)}</div>
                  <div class="k">Worst simulated drawdown</div><div class="v neg">${U.pct(mc.worst_max_dd_pct, 1)}</div>
                  <div class="k">Risk of ruin (‑50%)</div><div class="v ${mc.risk_of_ruin > 1 ? 'neg' : 'pos'}">${U.pct(mc.risk_of_ruin, 2)}</div>
                  <div class="k">Longest losing streak</div><div class="v">${mc.longest_losing_streak}</div>
                  <div class="k">Optimal risk (full / half / quarter Kelly)</div><div class="v">${U.pct(op.kelly || 0, 2)} / ${U.pct(op.half || 0, 2)} / ${U.pct(op.quarter || 0, 2)}</div>
                </div>
                <div class="sticky-note" style="margin-top:12px">Survive the 5th percentile. If the median drawdown would breach your limit, the risk per trade is too high for this distribution — not the strategy.</div>`;
              } catch (e) { out.innerHTML = `<div class="empty">${U.esc(e.message)}</div>`; }
            });
          });
          return w;
        },

        segments() {
          const w = U.h('div', { class: 'grid' });
          const defs = [
            ['Playbook / setup', an.by_strategy], ['Instrument', an.by_symbol], ['Session', an.by_session],
            ['Direction', an.by_direction], ['Setup grade', an.by_grade], ['Asset class', an.by_asset],
            ['Emotion before entry', an.by_emotion], ['Tags', an.by_tag], ['Confidence', an.by_confidence], ['Adherence', an.by_adherence],
          ];
          defs.forEach(([title, rows]) => {
            if (!rows || !rows.length) return;
            const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.net_pnl)));
            const c = U.h('div', { class: 'card' });
            c.innerHTML = `<div class="card-head"><h3>${title}</h3><span class="spacer"></span><span class="tiny muted">${rows.length} groups</span></div>
              <div class="table-wrap" style="max-height:300px"><table><thead><tr><th>Group</th><th class="num">n</th><th class="num">Win %</th><th class="num">Exp.</th><th class="num">PF</th><th class="num">Total R</th><th class="num">Net</th><th style="width:100px"></th></tr></thead>
              <tbody>${rows.sort((a, b) => b.net_pnl - a.net_pnl).map((r) => `<tr><td>${U.esc(r.key)}</td><td class="num">${r.trades}</td><td class="num">${U.pct(r.win_rate, 0)}</td>
                <td class="num ${U.cls(r.expectancy_r)}">${U.signed(r.expectancy_r, 2)}R</td><td class="num">${r.profit_factor === null ? '∞' : U.num(r.profit_factor, 2)}</td>
                <td class="num ${U.cls(r.total_r)}">${U.signed(r.total_r, 1)}</td><td class="num ${U.cls(r.net_pnl)}">${U.moneySign(r.net_pnl, 0)}</td>
                <td>${U.bar(r.net_pnl, maxAbs, r.net_pnl >= 0 ? 'pos' : 'neg')}</td></tr>`).join('')}</tbody></table></div>`;
            w.appendChild(c);
          });
          return w;
        },
      };

      panes.appendChild(PANES.core());
      return root;
    },
  };

  function drawScatter(el, points, k) {
    const rows = points.filter((p) => p.mfe !== null).slice(-80);
    if (!rows.length) {
      el.innerHTML = '<div class="empty">Record MAE / MFE on your trades (worst and best excursion in R) and this becomes the clearest picture of your execution — dots far below the diagonal are profit you left on the table.</div>';
      return;
    }
    const w2 = Math.max(340, el.clientWidth || 660), hh = 300, pad = 50;
    const maxX = Math.max(3, ...rows.map((p) => p.mfe + 0.3));
    const minY = Math.min(-1.5, ...rows.map((p) => p.r - 0.3));
    const maxY = Math.max(2, ...rows.map((p) => p.r + 0.3));
    const sx = (v) => pad + (v / maxX) * (w2 - pad - 18);
    const sy = (v) => hh - 40 - ((v - minY) / (maxY - minY)) * (hh - 60);
    let svg = `<svg class="chart" viewBox="0 0 ${w2} ${hh}">`;
    for (let g = 0; g <= Math.floor(maxX); g++) {
      svg += `<line class="grid-line" x1="${sx(g)}" y1="16" x2="${sx(g)}" y2="${hh - 40}"/>`;
      svg += `<text x="${sx(g)}" y="${hh - 24}" text-anchor="middle">${g}R</text>`;
    }
    for (let g = Math.ceil(minY); g <= Math.floor(maxY); g++) {
      svg += `<line class="grid-line" x1="${pad}" y1="${sy(g)}" x2="${w2 - 18}" y2="${sy(g)}"/>`;
      svg += `<text x="${pad - 8}" y="${sy(g) + 3}" text-anchor="end">${g}R</text>`;
    }
    svg += `<line class="axis" x1="${pad}" y1="${sy(0)}" x2="${w2 - 18}" y2="${sy(0)}"/>`;
    const diagMax = Math.min(maxX, maxY);
    svg += `<line stroke="rgba(79,140,255,.55)" stroke-dasharray="6 4" x1="${sx(0)}" y1="${sy(0)}" x2="${sx(diagMax)}" y2="${sy(diagMax)}"/>`;
    svg += `<text x="${sx(diagMax) - 4}" y="${sy(diagMax) - 6}" text-anchor="end" fill="#6ea2ff" font-size="9">perfect capture</text>`;
    rows.forEach((p) => {
      const col = p.r >= 0 ? 'var(--green)' : 'var(--red)';
      const gap = p.mfe - p.r;
      svg += `<circle cx="${sx(p.mfe).toFixed(1)}" cy="${sy(p.r).toFixed(1)}" r="${4 + Math.min(3, Math.abs(p.r))}" fill="${col}" opacity=".62" stroke="rgba(255,255,255,.14)"><title>${U.esc(p.symbol)} · ${U.esc(p.setup || 'untagged')} — exited ${U.signed(p.r, 2)}R of ${U.signed(p.mfe, 2)}R available (${U.moneySign(p.pnl)})</title></circle>`;
      if (gap > 1.2 && p.r > 0) svg += `<line x1="${sx(p.mfe)}" y1="${sy(p.mfe)}" x2="${sx(p.mfe)}" y2="${sy(p.r)}" stroke="rgba(247,185,85,.35)" stroke-width="1"/>`;
    });
    svg += `<text x="${w2 / 2}" y="${hh - 6}" text-anchor="middle" fill="#7d8ba3" font-size="10">MFE — the furthest the trade ever went in your favour</text>`;
    svg += `<text x="14" y="${hh / 2}" text-anchor="middle" fill="#7d8ba3" font-size="10" transform="rotate(-90 14 ${hh / 2})">where you actually exited (R)</text>`;
    svg += '</svg>';
    el.innerHTML = svg + `<div class="tiny muted" style="margin-top:8px">${rows.length} most recent trades with recorded excursions. Vertical gap under the blue diagonal = profit handed back; dots in the red half were trades that never really worked.</div>`;
  }

  function drawRiskMix(el, an) {
    const pts = (an.points || []).filter((p) => p.risk > 0);
    if (!pts.length) { el.innerHTML = '<div class="empty">No risk data recorded yet.</div>'; return; }
    const risks = pts.map((p) => p.risk);
    const avg = risks.reduce((s, v) => s + v, 0) / risks.length;
    const sd = Math.sqrt(risks.reduce((s, v) => s + (v - avg) ** 2, 0) / Math.max(1, risks.length - 1));
    const min = Math.min(...risks), max = Math.max(...risks);
    const buckets = 14;
    const width = (max - min) / buckets || 1;
    const bins = Array.from({ length: buckets }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
    risks.forEach((r) => { const i = Math.min(buckets - 1, Math.floor((r - min) / width)); bins[i].count++; });
    el.innerHTML = `<div class="row" style="gap:20px;flex-wrap:wrap;margin-bottom:10px">
        <div><div class="k-label">Average risk</div><div class="mono">${U.money(avg)}</div></div>
        <div><div class="k-label">Std deviation</div><div class="mono">${U.money(sd)}</div></div>
        <div><div class="k-label">Range</div><div class="mono">${U.money(min)} – ${U.money(max)}</div></div>
        <div><div class="k-label">Variation</div><div class="mono ${avg && sd / avg < 0.25 ? 'pos' : 'warn'}">±${U.pct(avg ? (sd / avg) * 100 : 0, 0)}</div></div>
      </div>
      <div id="riskhist"></div>
      <div class="tiny muted" style="margin-top:8px">Every bar is a set of trades sized at that dollar risk. A tight, single-peaked distribution is what professional results look like — wide variation means your position sizing is driven by mood instead of a rule.</div>`;
    requestAnimationFrame(() => U.barChart(el.querySelector('#riskhist'), {
      height: 200, labelEvery: 2,
      data: bins.map((b) => ({ label: U.money(b.from, 0), short: U.money(b.from, 0), value: b.count, color: 'var(--accent)' })),
      yFormat: (v) => String(Math.round(v)),
    }));
  }
})(window);
