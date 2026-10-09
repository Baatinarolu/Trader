/* views/journal.js — daily review notebook + goals */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  Views.journal = {
    title: 'Journal',
    async render(root) {
      const [entries, goals] = await Promise.all([API.get('/journal'), API.get('/goals')]);
      root.innerHTML = '';
      const layout = U.h('div', { class: 'grid g-2-1' });
      root.appendChild(layout);

      const listCol = U.h('div');
      const head = U.h('div', { class: 'card', style: 'margin-bottom:14px' });
      head.innerHTML = `<div class="row-between">
          <div><h2 style="margin:0">Daily reviews</h2><div class="muted small">${entries.entries.length} entries — the habit that turns a log into a system.</div></div>
          <button class="btn primary" id="j-new">+ Today's review</button></div>`;
      listCol.appendChild(head);
      const list = U.h('div', { class: 'card' });
      if (!entries.entries.length) {
        list.innerHTML = '<div class="empty">No reviews yet. Write one at the end of every session — three sentences is enough to start.</div>';
      } else {
        list.innerHTML = entries.entries.map((e) => `
          <div class="news-item">
            <div class="row-between">
              <div>
                <b class="mono">${U.esc(e.entry_date)}</b>
                ${e.market_bias ? `<span class="chip" style="margin-left:6px">${U.esc(e.market_bias)}</span>` : ''}
                ${e.mood ? `<span class="chip" style="margin-left:4px">mood ${e.mood}/5</span>` : ''}
                ${e.energy ? `<span class="chip" style="margin-left:4px">energy ${e.energy}/5</span>` : ''}
                ${e.screen_time_minutes ? `<span class="chip" style="margin-left:4px">${e.screen_time_minutes}m screen</span>` : ''}
              </div>
              <div class="row" style="gap:6px">
                <button class="btn xs ghost" data-open="${U.esc(e.entry_date)}">Open</button>
                <button class="btn xs ghost danger" data-del="${e.id}">Delete</button>
              </div>
            </div>
            ${e.focus ? `<div class="small" style="margin-top:6px"><span class="muted">Focus:</span> ${U.esc(e.focus)}</div>` : ''}
            ${e.review ? `<div class="small muted-2" style="margin-top:4px">${U.esc(e.review).slice(0, 260)}</div>` : ''}
            ${e.lessons ? `<div class="small" style="margin-top:6px;color:#ffd99b">Lesson: ${U.esc(e.lessons).slice(0, 220)}</div>` : ''}
          </div>`).join('');
      }
      listCol.appendChild(list);
      layout.appendChild(listCol);

      /* goals column */
      const goalsCol = U.h('div', { class: 'grid', style: 'align-content:start' });
      const gc = U.h('div', { class: 'card' });
      gc.innerHTML = `<div class="card-head"><h3>Targets in progress</h3></div>
        ${goals.goals.length ? goals.goals.map((g) => {
          const bar = Math.min(100, g.progress);
          const good = g.metric === 'net_pnl' ? g.actual >= 0 : true;
          return `<div style="margin-bottom:14px">
            <div class="row-between"><div class="small">${U.esc(g.title)}</div><div class="tiny mono ${good ? 'pos' : 'neg'}">${g.metric === 'net_pnl' ? U.moneySign(g.actual) : U.num(g.actual, 2)} / ${g.metric === 'net_pnl' ? U.money(g.target) : U.num(g.target, 2)}</div></div>
            <div class="bar-track" style="margin-top:6px"><i class="${g.progress >= 100 ? 'pos' : ''}" style="width:${bar}%"></i></div>
            <div class="tiny muted" style="margin-top:3px">${U.pct(g.progress, 0)} of target · ${U.esc(g.period)} · ${U.esc(g.metric)}</div>
          </div>`;
        }).join('') : '<div class="empty">No targets set. Discipline needs a scoreboard.</div>'}
        <button class="btn sm block ghost" id="g-new">+ Add a target</button>`;
      goalsCol.appendChild(gc);

      const prompt = U.h('div', { class: 'card' });
      prompt.innerHTML = `<div class="card-head"><h3>Review prompts</h3></div>
        <div class="small muted-2">
          <p><b>1.</b> Did I trade my plan, or did I trade my mood?</p>
          <p><b>2.</b> Which single decision cost me the most money today?</p>
          <p><b>3.</b> What did the market teach me that I will write down for tomorrow?</p>
          <p><b>4.</b> Am I still within my risk rules — risk per trade, daily loss, trade count?</p>
          <p><b>5.</b> If today repeated for a month, would I still be profitable?</p>
        </div>`;
      goalsCol.appendChild(prompt);
      layout.appendChild(goalsCol);

      list.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.open) return openEditor(b.dataset.open, root);
        if (b.dataset.del) {
          if (!confirm('Delete this journal entry?')) return;
          await API.del('/journal/' + b.dataset.del); global.App.refresh();
        }
      });
      U.$('#j-new', head).addEventListener('click', () => openEditor(Store.isoToday(), root));
      U.$('#g-new', gc).addEventListener('click', () => goalDialog(root));
      return root;
    },
  };

  function goalDialog(root) {
    const body = U.h('div');
    body.innerHTML = `<div class="form-grid" style="grid-template-columns:1fr 1fr">
      <label class="field span2"><span>Target name</span><input id="g-title" placeholder="e.g. Finish the quarter green" /></label>
      <label class="field"><span>Metric</span><select id="g-metric">
        <option value="net_pnl">Net P&L ($)</option><option value="expectancy_r">Expectancy (R)</option>
        <option value="win_rate">Win rate (%)</option><option value="profit_factor">Profit factor</option>
        <option value="adherence">Rule adherence (1–5)</option><option value="trades">Number of trades</option></select></label>
      <label class="field"><span>Target value</span><input id="g-target" type="number" step="any" /></label>
      <label class="field"><span>Period</span><select id="g-period"><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option></select></label>
    </div>`;
    global.App.modal({
      title: 'Add a target', body,
      actions: [{ label: 'Cancel', ghost: true }, {
        label: 'Save target', primary: true, onClick: async (close) => {
          await API.post('/goals', {
            title: U.$('#g-title', body).value || 'Target', metric: U.$('#g-metric', body).value,
            target: U.$('#g-target', body).value, period: U.$('#g-period', body).value,
          });
          close(); global.App.refresh(); global.App.toast('Target saved', 'ok');
        },
      }],
    });
  }

  async function openEditor(dateISO, root) {
    const day = await API.get('/journal/' + dateISO);
    const e = day.entry || {};
    const trades = day.trades || [];
    const pnl = trades.filter((t) => t.status !== 'open').reduce((s, t) => s + (t.net_pnl || 0), 0);
    const body = U.h('div');
    body.innerHTML = `
      <div class="grid g4" style="margin-bottom:14px">
        <div class="kpi"><div class="k-label">Date</div><div class="k-value" style="font-size:1rem">${U.esc(dateISO)}</div></div>
        <div class="kpi ${pnl >= 0 ? 'pos' : 'neg'}"><div class="k-label">Day P&L</div><div class="k-value ${U.cls(pnl)}">${U.moneySign(pnl)}</div></div>
        <div class="kpi"><div class="k-label">Trades</div><div class="k-value">${trades.length}</div></div>
        <div class="kpi"><div class="k-label">Total R</div><div class="k-value">${U.signed(trades.reduce((s, t) => s + (t.r_multiple || 0), 0), 2)}R</div></div>
      </div>
      <div class="form-grid" style="grid-template-columns:repeat(3,1fr)">
        <label class="field"><span>Market bias</span><select id="j-bias">${['', 'Bullish', 'Bearish', 'Neutral', 'Choppy'].map((v) => `<option ${e.market_bias === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Mood (1–5)</span><input id="j-mood" type="number" min="1" max="5" value="${e.mood ?? ''}" /></label>
        <label class="field"><span>Energy (1–5)</span><input id="j-energy" type="number" min="1" max="5" value="${e.energy ?? ''}" /></label>
      </div>
      <label class="field"><span>Focus for the session</span><input id="j-focus" value="${U.esc(e.focus)}" /></label>
      <label class="field"><span>Plan (written before the session)</span><textarea id="j-plan">${U.esc(e.plan)}</textarea></label>
      <label class="field"><span>Review (what actually happened)</span><textarea id="j-review">${U.esc(e.review)}</textarea></label>
      <label class="field"><span>Lessons</span><textarea id="j-lessons">${U.esc(e.lessons)}</textarea></label>
      <label class="field"><span>Tomorrow</span><textarea id="j-tomorrow">${U.esc(e.tomorrow)}</textarea></label>
      <label class="field"><span>Screen time (minutes)</span><input id="j-screen" type="number" value="${e.screen_time_minutes ?? ''}" /></label>
      ${trades.length ? `<div class="sep"></div><h3>Trades this day</h3><table><thead><tr><th>Time</th><th>Symbol</th><th>R</th><th>P&L</th><th>Note</th></tr></thead><tbody>
        ${trades.map((t) => `<tr><td class="mono tiny">${U.dt(t.opened_at, { day: undefined, month: undefined })}</td><td>${U.esc(t.symbol)}</td>
        <td class="num ${U.rClass(t.r_multiple)}">${U.R(t.r_multiple)}</td><td class="num ${U.cls(t.net_pnl)}">${U.moneySign(t.net_pnl)}</td>
        <td class="tiny muted">${U.esc((t.lesson || t.notes || '').slice(0, 80))}</td></tr>`).join('')}</tbody></table>` : ''}`;
    global.App.modal({
      title: 'Day review — ' + dateISO, body, wide: true,
      actions: [{ label: 'Cancel', ghost: true }, {
        label: 'Save review', primary: true, onClick: async (close) => {
          const payload = {
            entry_date: dateISO,
            market_bias: U.$('#j-bias', body).value, mood: U.$('#j-mood', body).value || null, energy: U.$('#j-energy', body).value || null,
            focus: U.$('#j-focus', body).value, plan: U.$('#j-plan', body).value, review: U.$('#j-review', body).value,
            lessons: U.$('#j-lessons', body).value, tomorrow: U.$('#j-tomorrow', body).value,
            screen_time_minutes: U.$('#j-screen', body).value || null,
          };
          try { await API.post('/journal', payload); close(); global.App.toast('Review saved', 'ok'); global.App.refresh(); }
          catch (err) { global.App.toast(err.message, 'err'); }
        },
      }],
    });
  }
})(window);
