/* views/dashboard.js — the daily cockpit */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  Views.dashboard = {
    title: 'Dashboard',
    async render(root) {
      const params = Store.queryParams();
      const [an, coach, briefing, tradesRes] = await Promise.all([
        Store.fetch('/analytics', params, 15000),
        Store.fetch('/coach', params, 15000),
        API.get('/briefing', params).catch(() => null),
        API.get('/trades', { ...params, limit: 12 }),
      ]);
      const k = an.kpis;
      const acc = an.account || Store.account() || {};
      root.innerHTML = '';

      /* ------------------------------------------------- first-run empty state */
      if (!k.trades) {
        const first = U.h('div', { class: 'card pad-lg' });
        first.innerHTML = `
          <div class="card-head"><h3>Start here</h3><span class="spacer"></span><span class="chip">0 trades in this workspace</span></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
            <div>
              <div class="small" style="margin-bottom:6px"><b>1. Log a trade</b></div>
              <div class="small muted-2">Everything in this app is built on your own rows: expectancy, the coach, the correctional bot. Two minutes per trade is enough.</div>
              <div class="row" style="gap:8px;margin-top:9px"><button class="btn primary sm" id="first-trade">+ Log a trade</button>
              <button class="btn sm ghost" id="first-import">Import CSV</button></div>
            </div>
            <div>
              <div class="small" style="margin-bottom:6px"><b>2. Or study the walkthrough</b></div>
              <div class="small muted-2">The bot desk, the charts and the measured edge reports work with no data at all. If you want to see the analytics populated before you have history, load the 235-trade sample workspace — clearly labelled, removable in one click.</div>
              <div class="row" style="gap:8px;margin-top:9px"><button class="btn sm" id="first-demo">Load sample workspace</button>
              <button class="btn sm ghost" id="first-bots">Open the bot desk</button></div>
            </div>
          </div>`;
        root.appendChild(first);
        const go = (id, fn) => { const el = U.$('#' + id, first); if (el) el.addEventListener('click', fn); };
        go('first-trade', () => global.App.openTrade(null));
        go('first-import', () => global.App.go('settings'));
        go('first-demo', async () => {
          if (!confirm('Load the 235-trade sample walkthrough into this workspace?')) return;
          await API.post('/demo/seed', {});
          await Store.reloadAll();
          global.App.refresh();
          global.App.toast('Sample workspace loaded', 'ok');
        });
        go('first-bots', () => global.App.go('bots'));
      }

      /* ---------------------------------------------------- briefing strip */
      if (briefing) {
        const rp = briefing.risk_plan || {};
        const pf = briefing.performance || {};
        const card = U.h('div', { class: 'card pad-lg', style: 'background:linear-gradient(135deg,rgba(79,140,255,.10),rgba(17,24,39,.9))' });
        card.innerHTML = `
          <div class="row-between" style="align-items:flex-start;flex-wrap:wrap">
            <div style="flex:1;min-width:280px">
              <div class="row" style="gap:8px"><span class="chip info">Pre-session briefing</span><span class="chip">${U.esc(briefing.weekday || '')} ${U.esc(briefing.date || '')}</span>
              ${briefing.calendar_ok ? '<span class="chip pos">Calendar live</span>' : '<span class="chip warn">Calendar offline</span>'}</div>
              <h2 style="margin:10px 0 6px">${U.esc(briefing.greeting)}, ${U.esc((Store.user.name || 'trader').split(' ')[0])} — here is your plan.</h2>
              <div class="stack" style="gap:5px;margin-bottom:10px">
                ${(briefing.plan_of_the_day || []).map((l) => `<div class="small muted-2 bullet">${U.esc(l)}</div>`).join('')}
              </div>
              <div class="row wrap" style="gap:8px">
                <span class="chip">Suggested risk <b class="mono" style="margin-left:4px;color:var(--text)">${U.money(rp.suggested_risk)}</b></span>
                <span class="chip ${rp.multiplier < 1 ? 'warn' : 'pos'}">Size multiplier ${U.num(rp.multiplier, 2)}×</span>
                <span class="chip">Max trades today <b class="mono" style="margin-left:4px;color:var(--text)">${rp.max_trades_today}</b></span>
                <span class="chip">Daily stop <b class="mono" style="margin-left:4px;color:var(--red)">${U.money(rp.max_loss_today)}</b></span>
              </div>
              <div class="tiny muted" style="margin-top:8px">${(rp.reasons || []).map((r) => U.esc(r)).join(' · ')}</div>
            </div>
            <div style="min-width:250px;background:var(--bg-2);border:1px solid var(--border);border-radius:12px;padding:14px">
              <div class="k-label">Today</div>
              <div class="mono ${U.cls(pf.today_pnl)}" style="font-size:1.5rem;font-weight:680">${U.moneySign(pf.today_pnl)}</div>
              <div class="tiny muted">${pf.today_trades || 0} closed · week ${U.moneySign(pf.week_pnl)}</div>
              <div class="sep"></div>
              <div class="k-label">Open risk</div>
              <div class="mono" style="font-size:1.05rem">${U.money((briefing.open_positions || []).reduce((s, p) => s + (p.risk_amount || 0), 0))}</div>
              <div class="tiny muted">${(briefing.open_positions || []).length} open position(s)</div>
              <div class="sep"></div>
              <div class="k-label">Events ahead</div>
              <div class="tiny muted-2" style="margin-top:3px">${(briefing.market_context.events_next || []).slice(0, 3).map((e) => `${U.esc(e.time_label)} ${U.esc(e.title)} (${U.esc(e.currency)})`).join('<br>') || 'No high-impact events scheduled.'}</div>
            </div>
          </div>`;
        root.appendChild(card);
      }

      /* ------------------------------------------- focus market (TradingView) */
      const focus = ((Store.user && Store.user.settings && Store.user.settings.focus_symbols) || []).slice(0, 6);
      if (global.TV && focus.length) {
        const fRow = U.h('div', { class: 'grid g-3-2', style: 'margin-top:14px' });
        const fCard = U.h('div', { class: 'card' });
        fCard.innerHTML = `<div class="card-head"><h3>${U.esc(focus[0])} — focus market</h3><span class="spacer"></span>
            <span class="tiny muted">TradingView widget · the bots read the same candles</span></div>
          <div class="tv-host" id="dash-tv" style="height:232px"></div>`;
        fRow.appendChild(fCard);

        const linkCard = U.h('div', { class: 'card' });
        linkCard.innerHTML = `<div class="card-head"><h3>Open a chart</h3><span class="spacer"></span><button class="btn xs ghost" id="dash-go-market">Market view →</button></div>
          <div class="stack" style="gap:6px">
            ${focus.map((s) => `<div class="row-between" style="border-top:1px solid var(--border);padding-top:6px">
              <a class="small" href="${U.esc(global.TV.link(s, '15m'))}" target="_blank" rel="noopener">${U.esc(global.TV.label(s, '15m'))} (chart)</a>
              <button class="btn xs ghost" data-analyse="${U.esc(s)}">analyse</button></div>`).join('')}
          </div>
          <div class="field-note">Every link opens that exact symbol + interval on TradingView in a new tab. “analyse” hands the market to the bot engine (structure, zones, graded plan).</div>`;
        fRow.appendChild(linkCard);
        root.appendChild(fRow);

        requestAnimationFrame(() => global.TV.widget(U.$('#dash-tv', root), { kind: 'mini', symbol: focus[0], height: 232 }));
        U.$$('[data-analyse]', linkCard).forEach((b) => b.addEventListener('click', () => { global.__botRequest = { symbol: b.dataset.analyse, tf: '15m' }; App.go('bots'); }));
        const gm = U.$('#dash-go-market', linkCard);
        if (gm) gm.addEventListener('click', () => App.go('market'));
      }

      /* ------------------------------------------------------------- KPIs */
      const kpiRow = U.h('div', { class: 'grid g6', style: 'margin-top:14px' });
      const dd = acc.max_drawdown_pct ? Math.min(100, Math.abs(k.current_drawdown_pct) / acc.max_drawdown_pct * 100) : 0;
      const grid = [
        { l: 'Net P&L', v: U.moneySign(k.net_pnl), s: `${k.trades} closed trades · equity ${U.money(acc.starting_balance + k.net_pnl)}`, c: U.cls(k.net_pnl) },
        { l: 'Expectancy', v: `${U.signed(k.expectancy_r, 3)}R`, s: `${U.moneySign(k.expectancy)} per trade`, c: U.cls(k.expectancy_r) },
        { l: 'Win rate', v: U.pct(k.win_rate, 1), s: `${k.wins}W / ${k.losses}L / ${k.breakevens}BE`, c: '' },
        { l: 'Profit factor', v: k.profit_factor === null ? '∞' : U.num(k.profit_factor, 2), s: `payoff ${U.num(k.payoff, 2)} : 1`, c: k.profit_factor >= 1 ? 'pos' : 'neg' },
        { l: 'Max drawdown', v: U.pct(k.max_drawdown_pct, 1), s: `now ${U.pct(k.current_drawdown_pct, 1)} · limit used ${dd.toFixed(0)}%`, c: 'neg' },
        { l: 'SQN', v: U.num(k.sqn, 2), s: `${k.trades >= 100 ? 'excellent' : k.sqn > 2 ? 'good' : k.sqn > 1 ? 'average' : 'poor'} · Sharpe ${U.num(k.sharpe, 2)}`, c: k.sqn > 2 ? 'pos' : k.sqn > 1 ? '' : 'neg' },
      ];
      grid.forEach((g) => kpiRow.appendChild(U.h('div', { class: 'kpi ' + (g.c === 'pos' ? 'pos' : g.c === 'neg' ? 'neg' : '') }, U.h('div', { class: 'k-label', text: g.l }), U.h('div', { class: 'k-value ' + g.c, text: g.v }), U.h('div', { class: 'k-sub', text: g.s }))));
      root.appendChild(kpiRow);

      /* ------------------------------------------------- equity + insights */
      const row3 = U.h('div', { class: 'grid g-3-2', style: 'margin-top:14px' });
      const eqCard = U.h('div', { class: 'card' });
      eqCard.innerHTML = `<div class="card-head"><h3>Equity curve</h3><span class="spacer"></span>
        <div class="legend"><span><i style="background:var(--accent)"></i>Account equity</span><span><i style="background:rgba(255,92,120,.5)"></i>Drawdown</span></div>
        <div class="row" style="gap:4px"><button class="btn xs" data-toggle="eq">Equity</button><button class="btn xs ghost" data-toggle="r">Cumulative R</button></div></div>
        <div id="eq-chart"></div>
        <div class="stat-strip" style="margin-top:12px">
          <div><div class="l">Peak</div><div class="v">${U.money(Math.max(...an.equity.map((p) => p.equity)))}</div></div>
          <div><div class="l">Recovery factor</div><div class="v">${U.num(k.recovery_factor, 2)}</div></div>
          <div><div class="l">Streak</div><div class="v ${k.streaks.current_type === 'loss' ? 'neg' : 'pos'}">${k.streaks.current === 0 ? '—' : (k.streaks.current_type === 'win' ? k.streaks.current + 'W' : Math.abs(k.streaks.current) + 'L')}</div></div>
          <div><div class="l">Best / worst</div><div class="v">${U.money(k.best_trade)} / ${U.money(k.worst_trade)}</div></div>
          <div><div class="l">Avg hold</div><div class="v">${U.dur(k.avg_hold_minutes)}</div></div>
        </div>`;
      row3.appendChild(eqCard);

      const insCard = U.h('div', { class: 'card' });
      const topIns = (coach.insights || []).slice(0, 4);
      insCard.innerHTML = `<div class="card-head"><h3>What your data says</h3><span class="spacer"></span>
          <button class="btn xs ghost" data-nav="coach">All insights →</button></div>
        <div class="row" style="gap:14px;align-items:flex-start;margin-bottom:12px">
          ${U.gauge(coach.score ? coach.score.score : 0, { label: 'process', size: 84 })}
          <div><div class="small muted-2">${U.esc(coach.summary ? coach.summary.headline : '')}</div>
          <div class="row" style="gap:6px;margin-top:8px">
            <span class="chip neg">${coach.summary ? coach.summary.critical : 0} critical</span>
            <span class="chip warn">${coach.summary ? coach.summary.warnings : 0} warnings</span>
            ${coach.score ? `<span class="chip ${coach.score.grade <= 'B' ? 'pos' : 'warn'}">Grade ${U.esc(coach.score.grade)}</span>` : ''}
          </div></div>
        </div>
        ${topIns.map((i) => `<div class="row" style="gap:9px;padding:7px 0;border-top:1px solid var(--border)">
            <span class="chip ${i.severity === 'critical' ? 'neg' : i.severity === 'warning' ? 'warn' : i.severity === 'positive' ? 'pos' : 'info'}" style="flex:none">${i.severity}</span>
            <div style="min-width:0"><div class="small" style="font-weight:600">${U.esc(i.title)}</div>
            <div class="tiny muted">impact ${U.moneySign(i.impact)}</div></div></div>`).join('') || '<div class="empty">Log a few trades to unlock coaching.</div>'}`;
      row3.appendChild(insCard);
      root.appendChild(row3);

      /* ------------------------------------------- distribution + segments */
      const row4 = U.h('div', { class: 'grid g-3-2', style: 'margin-top:14px' });
      const distCard = U.h('div', { class: 'card' });
      distCard.innerHTML = `<div class="card-head"><h3>R-multiple distribution</h3><span class="spacer"></span><span class="tiny muted">expectancy ${U.signed(k.expectancy_r, 3)}R · total ${U.signed(k.total_r, 1)}R</span></div><div id="dist-chart"></div>`;
      row4.appendChild(distCard);

      const edgeCard = U.h('div', { class: 'card' });
      edgeCard.innerHTML = `<div class="card-head"><h3>Edge quality</h3></div>
        <div class="kv">
          <div class="k">Avg winner</div><div class="v pos">${U.money(k.avg_win)} (${U.signed(k.avg_r, 2)}R avg)</div>
          <div class="k">Avg loser</div><div class="v neg">${U.money(-k.avg_loss)}</div>
          <div class="k">MAE / MFE</div><div class="v">${U.num(k.avg_mae_r, 2)}R / ${U.signed(k.avg_mfe_r, 2)}R</div>
          <div class="k">Capture efficiency</div><div class="v ${k.capture_efficiency > 65 ? 'pos' : 'warn'}">${k.capture_efficiency === null ? '—' : U.pct(k.capture_efficiency, 0)}</div>
          <div class="k">Kelly fraction</div><div class="v">${U.pct(k.kelly, 1)} <span class="tiny muted">(¼ = ${U.pct((k.kelly || 0) / 4, 1)})</span></div>
          <div class="k">Risk consistency</div><div class="v ${k.risk_consistency < 35 ? 'pos' : 'warn'}">±${U.pct(k.risk_consistency, 0)}</div>
          <div class="k">Fees paid</div><div class="v">${U.money(k.fees)} <span class="tiny muted">(${U.pct(k.fees_pct, 0)} of gross)</span></div>
          <div class="k">Avg trades / day</div><div class="v">${U.num(k.avg_trades_per_day, 1)}</div>
          <div class="k">Profit concentration</div><div class="v">top 5 = ${U.pct(k.profit_concentration, 0)}</div>
        </div>`;
      row4.appendChild(edgeCard);
      root.appendChild(row4);

      /* --------------------------------------------- sessions + month cal */
      const row5 = U.h('div', { class: 'grid g2', style: 'margin-top:14px' });
      const sessCard = U.h('div', { class: 'card' });
      const maxAbs = Math.max(1, ...an.by_session.map((s) => Math.abs(s.net_pnl)));
      sessCard.innerHTML = `<div class="card-head"><h3>Performance by session</h3></div>
        ${an.by_session.length ? `<table><thead><tr><th>Session</th><th class="num">Trades</th><th class="num">Win %</th><th class="num">Exp.</th><th class="num">Net</th><th style="width:90px"></th></tr></thead><tbody>
        ${an.by_session.map((s) => `<tr><td>${U.esc(s.key)}</td><td class="num">${s.trades}</td><td class="num">${U.pct(s.win_rate, 0)}</td>
          <td class="num ${U.cls(s.expectancy_r)}">${U.signed(s.expectancy_r, 2)}R</td><td class="num ${U.cls(s.net_pnl)}">${U.moneySign(s.net_pnl, 0)}</td>
          <td>${U.bar(s.net_pnl, maxAbs, s.net_pnl >= 0 ? 'pos' : 'neg')}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">No closed trades in this filter.</div>'}`;
      row5.appendChild(sessCard);

      const calCard = U.h('div', { class: 'card' });
      calCard.innerHTML = `<div class="card-head"><h3>Daily P&L — last 5 weeks</h3><span class="spacer"></span><button class="btn xs ghost" data-nav="calendar">Full calendar →</button></div><div id="mini-cal"></div>`;
      row5.appendChild(calCard);
      root.appendChild(row5);

      /* -------------------------------------------------- strategy + recent */
      const row6 = U.h('div', { class: 'grid g-3-2', style: 'margin-top:14px' });
      const stCard = U.h('div', { class: 'card' });
      const maxSt = Math.max(1, ...an.by_strategy.map((s) => Math.abs(s.net_pnl)));
      stCard.innerHTML = `<div class="card-head"><h3>Playbook performance</h3><span class="spacer"></span><button class="btn xs ghost" data-nav="playbook">Playbook →</button></div>
        ${an.by_strategy.length ? `<table><thead><tr><th>Setup</th><th class="num">n</th><th class="num">Win %</th><th class="num">Exp.</th><th class="num">PF</th><th class="num">Net</th><th class="num">Grade</th><th style="width:70px"></th></tr></thead><tbody>
        ${an.by_strategy.map((s) => `<tr><td class="nowrap">${U.esc(s.key)}</td><td class="num">${s.trades}</td><td class="num">${U.pct(s.win_rate, 0)}</td>
          <td class="num ${U.cls(s.expectancy_r)}">${U.signed(s.expectancy_r, 2)}R</td><td class="num">${s.profit_factor === null ? '∞' : U.num(s.profit_factor, 2)}</td>
          <td class="num ${U.cls(s.net_pnl)}">${U.moneySign(s.net_pnl, 0)}</td>
          <td class="num">${s.expectancy_r > 0.2 ? 'A' : s.expectancy_r > 0.05 ? 'B' : s.expectancy_r > -0.1 ? 'C' : 'D'}</td>
          <td>${U.bar(s.net_pnl, maxSt, s.net_pnl >= 0 ? 'pos' : 'neg')}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">No trades yet.</div>'}`;
      row6.appendChild(stCard);

      const rCard = U.h('div', { class: 'card' });
      rCard.innerHTML = `<div class="card-head"><h3>Recent trades</h3><span class="spacer"></span><button class="btn xs ghost" data-nav="trades">All trades →</button></div><div id="recent-trades"></div>`;
      row6.appendChild(rCard);
      root.appendChild(row6);

      /* -------------------------------------------------------- render data */
      requestAnimationFrame(() => {
        let mode = 'eq';
        const drawEq = () => {
          const el = U.$('#eq-chart', root);
          if (!el || !an.equity.length) { if (el) el.innerHTML = '<div class="empty">No closed trades yet</div>'; return; }
          if (mode === 'eq') {
            U.lineChart(el, {
              height: 250, ddShade: true, series: [{ color: 'var(--accent)', fill: true, points: an.equity.map((p) => ({ x: p.i, y: p.equity })) }],
              yFormat: (v) => U.compact(v), xFormat: () => '',
            });
          } else {
            U.lineChart(el, {
              height: 250, zeroLine: true, series: [{ color: 'var(--purple)', fill: true, points: an.equity.map((p) => ({ x: p.i, y: p.r_cum })) }],
              yFormat: (v) => v.toFixed(0) + 'R', xFormat: () => '',
            });
          }
        };
        drawEq();
        U.$$('[data-toggle]', eqCard).forEach((b) => b.addEventListener('click', () => {
          mode = b.dataset.toggle;
          U.$$('[data-toggle]', eqCard).forEach((x) => x.classList.toggle('ghost', x !== b));
          drawEq();
        }));

        const distEl = U.$('#dist-chart', root);
        if (distEl) U.histogram(distEl, an.distribution, { height: 230 });

        const calEl = U.$('#mini-cal', root);
        if (calEl) renderMiniCalendar(calEl, an.daily);

        const rt = U.$('#recent-trades', root);
        if (rt) {
          rt.innerHTML = tradesRes.trades.length ? `<table><thead><tr><th>Date</th><th>Symbol</th><th>Side</th><th class="num">R</th><th class="num">P&L</th></tr></thead><tbody>
            ${tradesRes.trades.map((t) => `<tr class="clickable" data-trade="${t.id}"><td class="mono tiny">${U.dt(t.closed_at || t.opened_at, { year: undefined })}</td>
            <td>${U.esc(t.symbol)}</td><td><span class="${Store.dirClass(t)}">${U.esc(t.direction)}</span></td>
            <td class="num ${U.rClass(t.r_multiple)}">${U.R(t.r_multiple)}</td><td class="num ${U.cls(t.net_pnl)}">${U.moneySign(t.net_pnl)}</td></tr>`).join('')}
            </tbody></table>` : '<div class="empty">No trades yet — add your first one.</div>';
          rt.addEventListener('click', (e) => {
            const row = e.target.closest('[data-trade]');
            if (row) global.App.openTrade(Number(row.dataset.trade));
          });
        }
      });
      return root;
    },
  };

  function renderMiniCalendar(el, daily) {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 34);
    // align to Monday
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const weeks = [];
    let cur = new Date(start);
    const max = Math.max(1, ...Object.values(daily).map((d) => Math.abs(d.pnl)));
    let html = '<div class="cal-grid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
    for (let w = 0; w < 5; w++) {
      for (let d = 0; d < 7; d++) {
        const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        const day = daily[iso];
        const bg = day ? (day.pnl >= 0 ? `rgba(47,209,139,${0.1 + Math.abs(day.pnl) / max * 0.45})` : `rgba(255,92,120,${0.1 + Math.abs(day.pnl) / max * 0.45})`) : '';
        html += `<div class="cal-day" style="min-height:52px;padding:5px;${bg ? 'background:' + bg : 'opacity:.55'}" data-date="${iso}">
          <div class="d">${cur.getDate()}</div>
          ${day ? `<div class="p ${U.cls(day.pnl)}" style="font-size:.74rem">${U.moneySign(day.pnl, 0)}</div><div class="t" style="font-size:.62rem">${day.trades}t</div>` : ''}
        </div>`;
        cur.setDate(cur.getDate() + 1);
      }
    }
    html += '</div>';
    el.innerHTML = html;
    el.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-date]');
      if (cell) { Store.filters.from = cell.dataset.date; Store.filters.to = cell.dataset.date; global.App.go('trades'); }
    });
  }
})(window);
