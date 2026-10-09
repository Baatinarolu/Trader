/* views/calendar.js — monthly P&L calendar + day review drawer */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  Views.calendar = {
    title: 'Calendar',
    async render(root) {
      const params = Store.queryParams();
      const an = await Store.fetch('/analytics', params, 15000);
      const journal = await API.get('/journal').catch(() => ({ entries: [] }));
      const journalByDate = Object.fromEntries((journal.entries || []).map((e) => [e.entry_date, e]));

      root.innerHTML = '';
      let cursor = new Date();
      cursor.setDate(1);

      const head = U.h('div', { class: 'card', style: 'margin-bottom:14px' });
      head.innerHTML = `<div class="row-between wrap">
        <div class="row" style="gap:8px">
          <button class="btn sm ghost" id="cal-prev">‹</button>
          <h2 id="cal-title" style="margin:0;min-width:170px;text-align:center"></h2>
          <button class="btn sm ghost" id="cal-next">›</button>
          <button class="btn sm ghost" id="cal-today">Today</button>
        </div>
        <div class="row" style="gap:16px;flex-wrap:wrap">
          <div><div class="k-label">Month P&L</div><div class="mono" id="cal-month-pnl">—</div></div>
          <div><div class="k-label">Winning days</div><div class="mono" id="cal-winrate">—</div></div>
          <div><div class="k-label">Best day</div><div class="mono" id="cal-best">—</div></div>
          <div><div class="k-label">Worst day</div><div class="mono" id="cal-worst">—</div></div>
          <div><div class="k-label">Journal days</div><div class="mono" id="cal-journal">—</div></div>
        </div></div>`;
      root.appendChild(head);

      const grid = U.h('div', { class: 'cal-week' });
      root.appendChild(grid);

      const detail = U.h('div', { style: 'margin-top:14px' });
      root.appendChild(detail);

      function draw() {
        const y = cursor.getFullYear(), m = cursor.getMonth();
        U.$('#cal-title', head).textContent = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        const first = new Date(y, m, 1);
        const startOffset = (first.getDay() + 6) % 7;
        const days = new Date(y, m + 1, 0).getDate();
        const maxAbs = Math.max(1, ...Object.values(an.daily).map((d) => Math.abs(d.pnl)));
        let html = '<div class="cal-grid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
        for (let i = 0; i < startOffset; i++) html += '<div></div>';
        let monthPnl = 0, winDays = 0, tradeDays = 0, best = null, worst = null;
        const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
        for (let day = 1; day <= days; day++) {
          const iso = `${monthKey}-${String(day).padStart(2, '0')}`;
          const d = an.daily[iso];
          const isToday = iso === Store.isoToday();
          if (d) {
            monthPnl += d.pnl; tradeDays++;
            if (d.pnl > 0) winDays++;
            if (!best || d.pnl > best.pnl) best = { ...d, iso };
            if (!worst || d.pnl < worst.pnl) worst = { ...d, iso };
          }
          const intensity = d ? Math.min(0.5, Math.abs(d.pnl) / maxAbs * 0.5) : 0;
          const bg = d ? (d.pnl >= 0 ? `rgba(47,209,139,${(0.08 + intensity).toFixed(2)})` : `rgba(255,92,120,${(0.08 + intensity).toFixed(2)})`) : '';
          const j = journalByDate[iso];
          html += `<div class="cal-day ${isToday ? 'today' : ''}" data-date="${iso}" ${bg ? `style="background:${bg}"` : ''}>
            <div class="row-between"><span class="d">${day}</span>${j ? '<span class="entry-dot" title="journal entry"></span>' : ''}</div>
            ${d ? `<div class="p ${U.cls(d.pnl)}">${U.moneySign(d.pnl, 0)}</div>
                   <div class="t">${d.trades} trade${d.trades === 1 ? '' : 's'} · ${U.signed(d.r, 1)}R · ${d.wins}W/${d.losses}L</div>` : '<div class="t muted">—</div>'}
          </div>`;
        }
        html += '</div>';
        grid.innerHTML = html;
        U.$('#cal-month-pnl', head).innerHTML = `<span class="${U.cls(monthPnl)}">${U.moneySign(monthPnl)}</span>`;
        U.$('#cal-winrate', head).textContent = tradeDays ? `${winDays}/${tradeDays} (${Math.round((winDays / tradeDays) * 100)}%)` : '—';
        U.$('#cal-best', head).innerHTML = best ? `<span class="pos">${U.moneySign(best.pnl, 0)}</span> <span class="tiny muted">${best.iso.slice(5)}</span>` : '—';
        U.$('#cal-worst', head).innerHTML = worst ? `<span class="neg">${U.moneySign(worst.pnl, 0)}</span> <span class="tiny muted">${worst.iso.slice(5)}</span>` : '—';
        U.$('#cal-journal', head).textContent = `${Object.keys(journalByDate).filter((k) => k.startsWith(monthKey)).length} days`;
        U.$$('[data-date]', grid).forEach((c) => c.addEventListener('click', () => showDay(c.dataset.date)));
      }
      U.$('#cal-prev', head).addEventListener('click', () => { cursor.setMonth(cursor.getMonth() - 1); draw(); });
      U.$('#cal-next', head).addEventListener('click', () => { cursor.setMonth(cursor.getMonth() + 1); draw(); });
      U.$('#cal-today', head).addEventListener('click', () => { cursor = new Date(); cursor.setDate(1); draw(); });

      async function showDay(iso) {
        detail.innerHTML = '<div class="skeleton" style="height:180px"></div>';
        const [day, an2] = await Promise.all([API.get('/journal/' + iso), API.get('/trades', { ...params, from: iso, to: iso, limit: 200 })]);
        const trades = an2.trades || [];
        const pnl = trades.filter((t) => t.status !== 'open').reduce((s, t) => s + (t.net_pnl || 0), 0);
        const r = trades.filter((t) => t.status !== 'open').reduce((s, t) => s + (t.r_multiple || 0), 0);
        const e = day.entry || {};
        detail.innerHTML = `
          <div class="grid g-1-2">
            <div class="card">
              <div class="card-head"><h3>Day review — ${U.esc(iso)}</h3></div>
              <div class="stat-strip" style="margin-bottom:12px">
                <div><div class="l">P&L</div><div class="v ${U.cls(pnl)}">${U.moneySign(pnl)}</div></div>
                <div><div class="l">R</div><div class="v ${U.cls(r)}">${U.signed(r, 2)}R</div></div>
                <div><div class="l">Trades</div><div class="v">${trades.length}</div></div>
                <div><div class="l">Win rate</div><div class="v">${trades.length ? U.pct((trades.filter((t) => t.is_win).length / trades.length) * 100, 0) : '—'}</div></div>
              </div>
              <form id="jf">
                <div class="form-grid" style="grid-template-columns:1fr 1fr">
                  <label class="field"><span>Market bias</span><select name="market_bias">${['', 'Bullish', 'Bearish', 'Neutral', 'Choppy'].map((v) => `<option ${e.market_bias === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
                  <label class="field"><span>Screen time (min)</span><input name="screen_time_minutes" type="number" value="${e.screen_time_minutes ?? ''}" /></label>
                  <label class="field"><span>Mood (1–5)</span><input name="mood" type="number" min="1" max="5" value="${e.mood ?? ''}" /></label>
                  <label class="field"><span>Energy (1–5)</span><input name="energy" type="number" min="1" max="5" value="${e.energy ?? ''}" /></label>
                </div>
                <label class="field"><span>Focus for the day</span><input name="focus" value="${U.esc(e.focus)}" /></label>
                <label class="field"><span>Plan (pre-session)</span><textarea name="plan">${U.esc(e.plan)}</textarea></label>
                <label class="field"><span>Review (what actually happened)</span><textarea name="review">${U.esc(e.review)}</textarea></label>
                <label class="field"><span>Lessons</span><textarea name="lessons">${U.esc(e.lessons)}</textarea></label>
                <label class="field"><span>Tomorrow</span><textarea name="tomorrow">${U.esc(e.tomorrow)}</textarea></label>
                <button class="btn primary" type="submit">Save day review</button>
              </form>
            </div>
            <div class="card">
              <div class="card-head"><h3>${trades.length} trade${trades.length === 1 ? '' : 's'} on ${U.esc(iso)}</h3><span class="spacer"></span><button class="btn xs" id="day-add">+ add trade for this day</button></div>
              ${trades.length ? `<table><thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th class="num">R</th><th class="num">P&L</th><th>Setup</th><th>Mistakes</th></tr></thead><tbody>
                ${trades.map((t) => `<tr class="clickable" data-trade="${t.id}"><td class="mono tiny">${U.dt(t.opened_at, { day: undefined, month: undefined })}</td>
                  <td>${U.esc(t.symbol)}</td><td><span class="${Store.dirClass(t)}">${U.esc(String(t.direction).slice(0, 4))}</span></td>
                  <td class="num ${U.rClass(t.r_multiple)}">${U.R(t.r_multiple)}</td><td class="num ${U.cls(t.net_pnl)}">${U.moneySign(t.net_pnl)}</td>
                  <td class="tiny">${U.esc(t.strategy_name || '—')}</td><td class="tiny mistake-line">${U.esc(t.mistakes || '')}</td></tr>`).join('')}
              </tbody></table>` : '<div class="empty">No trades on this day. Rest days are part of the process too.</div>'}
            </div>
          </div>`;
        const form = U.$('#jf', detail);
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const fd = new FormData(form);
          const body = { entry_date: iso };
          for (const [k, v] of fd.entries()) body[k] = v === '' ? null : (['mood', 'energy', 'screen_time_minutes'].includes(k) ? Number(v) : v);
          try { await API.post('/journal', body); toast('Day review saved', 'ok'); journalByDate[iso] = body; draw(); }
          catch (err) { toast(err.message, 'err'); }
        });
        U.$('#day-add', detail).addEventListener('click', () => global.App.openTrade(null, { opened_at: iso + 'T09:00' }));
        U.$$('[data-trade]', detail).forEach((tr) => tr.addEventListener('click', () => global.App.openTrade(Number(tr.dataset.trade))));
      }
      draw();
      return root;
    },
  };
  function toast(m, k) { if (global.App.toast) global.App.toast(m, k); }
})(window);
