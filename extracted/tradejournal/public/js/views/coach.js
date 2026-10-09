/* views/coach.js — behavioural insights, discipline score, weekly review */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  Views.coach = {
    title: 'Coach',
    async render(root) {
      const params = Store.queryParams();
      const [data, an] = await Promise.all([Store.fetch('/coach', params, 15000), Store.fetch('/analytics', params, 15000)]);
      root.innerHTML = '';
      const s = data.summary || {};

      const banner = U.h('div', { class: 'card pad-lg', style: 'background:linear-gradient(135deg,rgba(79,140,255,.09),rgba(17,24,39,.95))' });
      banner.innerHTML = `<div class="row" style="gap:20px;align-items:center;flex-wrap:wrap">
        ${U.gauge(data.score ? data.score.score : 0, { label: 'process score', size: 108 })}
        <div style="flex:1;min-width:260px">
          <div class="row" style="gap:8px;margin-bottom:6px">
            <span class="chip info">Process health</span>
            ${data.score ? `<span class="chip ${data.score.grade <= 'B' ? 'pos' : data.score.grade === 'C' ? 'warn' : 'neg'}">Grade ${U.esc(data.score.grade)}</span>` : ''}
            <span class="chip neg">${s.critical || 0} critical</span>
            <span class="chip warn">${s.warnings || 0} warnings</span>
          </div>
          <h2 style="margin:0 0 6px">${U.esc(s.headline || '')}</h2>
          <div class="row wrap" style="gap:14px">
            <span class="tiny muted">Expectancy <b class="${U.cls(s.expectancy_r)}">${U.signed(s.expectancy_r, 3)}R</b></span>
            <span class="tiny muted">Win rate <b>${U.pct(s.win_rate, 1)}</b></span>
            <span class="tiny muted">Profit factor <b>${U.num(s.profit_factor, 2)}</b></span>
            <span class="tiny muted">Net <b class="${U.cls(s.net_pnl)}">${U.moneySign(s.net_pnl)}</b></span>
            <span class="tiny muted">Max DD <b class="neg">${U.pct(s.max_dd_pct, 1)}</b></span>
          </div>
        </div>
        <div style="min-width:210px">
          <div class="k-label" style="margin-bottom:6px">This week's focus</div>
          ${(data.insights || []).filter((i) => i.severity === 'critical').slice(0, 2).map((i) => `<div class="small muted-2 bullet" style="margin-bottom:6px">${U.esc(i.action)}</div>`).join('') || '<div class="small muted-2">No critical leaks. Protect the process.</div>'}
        </div>
      </div>`;
      root.appendChild(banner);

      const split = U.h('div', { class: 'grid g-2-1', style: 'margin-top:14px' });
      const feed = U.h('div');
      const groups = [['critical', 'Fix these first'], ['warning', 'Watch these'], ['info', 'Worth knowing'], ['positive', 'Do more of this']];
      groups.forEach(([sev, title]) => {
        const items = (data.insights || []).filter((i) => i.severity === sev);
        if (!items.length) return;
        feed.appendChild(U.h('h3', { style: 'margin:16px 0 8px', text: title }));
        items.forEach((i) => {
          const el = U.h('div', { class: 'insight ' + sev });
          el.innerHTML = `
            <div class="row-between" style="align-items:flex-start;gap:10px">
              <h4>${U.esc(i.title)}</h4>
              <span class="chip ${i.impact >= 0 ? 'pos' : 'neg'}" style="flex:none">${i.impact >= 0 ? '+' : ''}${U.money(i.impact)} impact</span>
            </div>
            <div class="detail">${U.esc(i.detail)}</div>
            <div class="evidence">${(i.evidence || []).map((e) => `<span class="ev">${U.esc(e.label)}<b>${U.esc(e.value)}</b></span>`).join('')}</div>
            <div class="actions"><b>Do this:</b> ${U.esc(i.action)}</div>
            <div class="row" style="gap:6px;margin-top:10px">
              <button class="btn xs ghost" data-filter="${U.esc(i.category || '')}">Filter trades</button>
              <button class="btn xs ghost" data-dismiss="${U.esc(i.id)}">Got it</button>
            </div>`;
          feed.appendChild(el);
        });
      });
      split.appendChild(feed);

      /* right column: weekly review + checklist + rules */
      const side = U.h('div', { class: 'grid', style: 'align-content:start' });
      const weekly = U.h('div', { class: 'card' });
      const monthly = Object.entries(an.monthly).slice(-3);
      weekly.innerHTML = `<div class="card-head"><h3>Month by month</h3></div>
        ${monthly.length ? `<table><thead><tr><th>Month</th><th class="num">Trades</th><th class="num">Win %</th><th class="num">R</th><th class="num">Net</th></tr></thead><tbody>
        ${monthly.map(([m, v]) => `<tr><td class="mono">${U.esc(m)}</td><td class="num">${v.trades}</td><td class="num">${U.pct(v.win_rate, 0)}</td>
          <td class="num ${U.cls(v.r)}">${U.signed(v.r, 1)}</td><td class="num ${U.cls(v.pnl)}">${U.moneySign(v.pnl, 0)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">Not enough history.</div>'}
        <div class="sep"></div>
        <div class="k-label">Last 7 days</div>
        <div class="small muted-2" style="margin-top:6px">${lastWeekSummary(an)}</div>`;
      side.appendChild(weekly);

      const rules = U.h('div', { class: 'card' });
      rules.innerHTML = `<div class="card-head"><h3>Your standing rules</h3></div>
        <div class="small muted-2" style="margin-bottom:8px">These are the rules the coach is measuring you against.</div>
        <div id="rules-list">${(Store.user.default_checklist || []).map((r, i) => `<div class="rule"><span class="muted mono">${i + 1}.</span> <span>${U.esc(r)}</span></div>`).join('')}</div>
        <button class="btn sm block ghost" id="edit-rules" style="margin-top:10px">Edit my rules</button>`;
      side.appendChild(rules);

      const snap = U.h('div', { class: 'card' });
      snap.innerHTML = `<div class="card-head"><h3>Snapshot</h3></div>
        <div class="kv">
          <div class="k">Expectancy</div><div class="v ${U.cls(an.kpis.expectancy_r)}">${U.signed(an.kpis.expectancy_r, 3)}R</div>
          <div class="k">SQN</div><div class="v">${U.num(an.kpis.sqn, 2)}</div>
          <div class="k">Sharpe</div><div class="v">${U.num(an.kpis.sharpe, 2)}</div>
          <div class="k">Capture efficiency</div><div class="v">${an.kpis.capture_efficiency === null ? '—' : U.pct(an.kpis.capture_efficiency, 0)}</div>
          <div class="k">Risk consistency</div><div class="v">±${U.pct(an.kpis.risk_consistency, 0)}</div>
          <div class="k">Avg adherence</div><div class="v">${an.kpis.avg_adherence ? U.num(an.kpis.avg_adherence, 2) : '—'} / 5</div>
          <div class="k">Trades / day</div><div class="v">${U.num(an.kpis.avg_trades_per_day, 1)}</div>
          <div class="k">Fees drag</div><div class="v">${U.pct(an.kpis.fees_pct, 0)} of gross</div>
        </div>`;
      side.appendChild(snap);
      split.appendChild(side);
      root.appendChild(split);

      feed.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.dismiss) { b.closest('.insight').style.display = 'none'; return; }
      });
      U.$('#edit-rules', rules).addEventListener('click', () => global.App.editChecklist());
      return root;
    },
  };

  function lastWeekSummary(an) {
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const days = Object.values(an.daily).filter((d) => d.date >= cutoff);
    if (!days.length) return 'No trades in the last 7 days.';
    const pnl = days.reduce((s, d) => s + d.pnl, 0);
    const trades = days.reduce((s, d) => s + d.trades, 0);
    const green = days.filter((d) => d.pnl > 0).length;
    const best = days.reduce((a, b) => (a.pnl > b.pnl ? a : b));
    const worst = days.reduce((a, b) => (a.pnl < b.pnl ? a : b));
    return `${trades} trades over ${days.length} sessions · ${green} green days · net <b class="${U.cls(pnl)}">${U.moneySign(pnl)}</b><br>Best ${U.moneySign(best.pnl)} (${best.date}) · worst ${U.moneySign(worst.pnl)} (${worst.date}).`;
  }
})(window);
