/* views/settings.js — accounts, instruments, data import/export, preferences */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};

  Views.settings = {
    title: 'Settings & data',
    async render(root) {
      const accounts = await API.get('/accounts');
      root.innerHTML = '';
      const tabs = U.h('div', { class: 'tabs' });
      const panes = U.h('div');
      const TABS = [['accounts', 'Accounts'], ['instruments', 'Instruments'], ['data', 'Import / export'], ['integrations', 'Integrations'], ['prefs', 'Preferences'], ['about', 'About']];
      let active = 'accounts';
      const draw = () => {
        U.$$('button', tabs).forEach((b, i) => b.classList.toggle('active', TABS[i][0] === active));
        U.clear(panes).appendChild(PANES[active]());
      };
      TABS.forEach(([id, label]) => tabs.appendChild(U.h('button', { text: label, onclick: () => { active = id; draw(); } })));
      root.appendChild(tabs); root.appendChild(panes);

      const PANES = {
        accounts() {
          const w = U.h('div');
          const grid = U.h('div', { class: 'grid g2' });
          accounts.accounts.forEach((a) => {
            const st = a.stats || {};
            const card = U.h('div', { class: 'card' });
            const ddUsed = Math.abs(st.dd_limit_used || 0);
            card.innerHTML = `
              <div class="row-between"><div><h3 style="margin:0">${U.esc(a.name)} ${a.account_type === 'prop' ? '<span class="chip purple">prop</span>' : a.account_type === 'demo' ? '<span class="chip">demo</span>' : ''}</h3>
                <div class="tiny muted">${U.esc(a.broker || 'No broker set')} · ${U.esc(a.currency)} · risk ${U.num(a.risk_per_trade_pct, 2)}%/trade</div></div>
                <span class="mono ${U.cls(st.net_pnl)}" style="font-size:1.05rem">${U.moneySign(st.net_pnl)}</span></div>
              <div class="sep"></div>
              <div class="stats grid g4" style="gap:8px">
                <div><div class="k-label">Equity</div><div class="mono">${U.money(st.equity)}</div></div>
                <div><div class="k-label">Trades</div><div class="mono">${st.trades}</div></div>
                <div><div class="k-label">Win %</div><div class="mono">${U.pct(st.win_rate, 0)}</div></div>
                <div><div class="k-label">Exp.</div><div class="mono ${U.cls(st.expectancy_r)}">${U.signed(st.expectancy_r, 2)}R</div></div>
              </div>
              <div style="margin-top:10px">
                <div class="row-between tiny muted"><span>Drawdown used vs limit (${U.num(a.max_drawdown_pct, 1)}%)</span><span>${U.pct(ddUsed, 0)}</span></div>
                <div class="bar-track" style="margin-top:4px"><i class="${ddUsed > 70 ? 'neg' : ''}" style="width:${Math.min(100, ddUsed)}%"></i></div>
              </div>
              ${st.open_trades ? `<div class="tiny warn" style="margin-top:8px">${st.open_trades} open position(s) risking ${U.money(st.open_risk)}</div>` : ''}
              <div class="row" style="gap:6px;margin-top:12px">
                <button class="btn xs ghost" data-aedit="${a.id}">Edit rules</button>
                <button class="btn xs ghost" data-adefault="${a.id}">Set default</button>
                <button class="btn xs ghost danger" data-adel="${a.id}" style="margin-left:auto">Delete</button>
              </div>`;
            grid.appendChild(card);
          });
          w.appendChild(grid);
          w.appendChild(U.h('button', { class: 'btn primary', style: 'margin-top:14px', text: '+ Add account', onclick: () => accountDialog(null) }));
          grid.addEventListener('click', async (e) => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.aedit) return accountDialog(accounts.accounts.find((a) => a.id === Number(b.dataset.aedit)));
            if (b.dataset.adel) {
              if (!confirm('Delete this account and all of its trades?')) return;
              await API.del('/accounts/' + b.dataset.adel); await Store.reloadAll(); global.App.refresh();
            }
            if (b.dataset.adefault) {
              await API.put('/accounts/' + b.dataset.adefault, {});
              Store.setAccount(Number(b.dataset.adefault)); global.App.refresh();
            }
          });
          return w;
        },

        instruments() {
          const w = U.h('div');
          const custom = Store.instruments.filter((i) => i.is_custom);
          w.innerHTML = `
            <div class="card"><div class="card-head"><h3>Instrument library</h3><span class="spacer"></span><span class="tiny muted">${Store.instruments.length} instruments · ${custom.length} custom</span></div>
              <p class="small muted-2">A multi-asset journal only works if it knows what "1 unit" means. Each instrument stores its tick size, pip size and the currency value of a 1.0 price move — that is how an ES contract, a EURUSD lot and a Bitcoin end up in the same expectancy calculation.</p>
              <div class="form-grid">
                <label class="field"><span>Symbol</span><input id="i-symbol" placeholder="GBPJPY" /></label>
                <label class="field"><span>Name</span><input id="i-name" placeholder="British Pound / Yen" /></label>
                <label class="field"><span>Asset class</span><select id="i-class">${Object.entries(Store.classLabels).map(([k, v]) => `<option value="${k}">${U.esc(v)}</option>`).join('')}</select></label>
                <label class="field"><span>Unit label</span><input id="i-unit" placeholder="lots / contracts / shares / coins" /></label>
                <label class="field"><span>Tick size</span><input id="i-tick" type="number" step="any" value="0.01" /></label>
                <label class="field"><span>Pip / point size</span><input id="i-pip" type="number" step="any" value="0.01" /></label>
                <label class="field"><span>Value per 1.0 move (per unit)</span><input id="i-vpp" type="number" step="any" value="1" /></label>
                <label class="field"><span>Currency</span><input id="i-ccy" value="USD" /></label>
              </div>
              <button class="btn primary sm" id="i-add">Add / update instrument</button>
            </div>
            <div class="card" style="margin-top:14px"><div class="card-head"><h3>Custom instruments</h3></div>
              ${custom.length ? `<table><thead><tr><th>Symbol</th><th>Name</th><th>Class</th><th class="num">Value / point</th><th class="num">Pip</th><th></th></tr></thead><tbody>
                ${custom.map((i) => `<tr><td><b>${U.esc(i.symbol)}</b></td><td class="tiny">${U.esc(i.name)}</td><td class="tiny">${U.esc(Store.classLabels[i.asset_class] || i.asset_class)}</td>
                  <td class="num">${U.price(i.value_per_point)}</td><td class="num">${i.pip_size}</td><td><button class="btn xs ghost danger" data-idel="${i.id}">Delete</button></td></tr>`).join('')}
              </tbody></table>` : '<div class="empty">No custom instruments yet.</div>'}
            </div>`;
          U.$('#i-add', w).addEventListener('click', async () => {
            const sym = U.$('#i-symbol', w).value.trim().toUpperCase();
            if (!sym) return global.App.toast('Symbol required', 'err');
            await API.post('/instruments', {
              symbol: sym, name: U.$('#i-name', w).value, asset_class: U.$('#i-class', w).value, unit: U.$('#i-unit', w).value,
              tick_size: U.$('#i-tick', w).value, pip_size: U.$('#i-pip', w).value, value_per_point: U.$('#i-vpp', w).value, currency: U.$('#i-ccy', w).value,
            });
            await Store.reloadAll(); global.App.toast('Instrument saved', 'ok'); global.App.refresh();
          });
          w.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-idel]'); if (!b) return;
            await API.del('/instruments/' + b.dataset.idel); await Store.reloadAll(); global.App.refresh();
          });
          return w;
        },

        data() {
          const w = U.h('div', { class: 'grid g2' });
          w.innerHTML = `
            <div class="card"><div class="card-head"><h3>Import trades</h3></div>
              <p class="small muted-2">Paste a CSV export from your broker or platform. Column names are auto-detected (symbol/ticker, side/type, size/qty/volume, entry/open price, exit/close price, stop, target, dates, fees, P&L).</p>
              <label class="field"><span>Import into account</span><select id="im-account">${Store.accounts.map((a) => `<option value="${a.id}">${U.esc(a.name)}</option>`).join('')}</select></label>
              <label class="field"><span>Paste CSV</span><textarea id="im-csv" style="min-height:150px" placeholder="symbol,direction,size,entry,exit,fees,opened_at,closed_at&#10;EURUSD,long,1.5,1.0850,1.0925,7,2026-09-01 09:15,2026-09-01 12:40"></textarea></label>
              <div class="row" style="gap:8px"><button class="btn primary sm" id="im-run">Import</button>
                <label class="btn sm ghost" style="cursor:pointer">Choose file…<input type="file" id="im-file" accept=".csv,.txt" hidden /></label></div>
              <div id="im-out" class="field-note"></div>
            </div>
            <div class="card"><div class="card-head"><h3>Export & backup</h3></div>
              <p class="small muted-2">Your data lives in a single SQLite file on this machine. Take a JSON backup before big changes, or export CSV for Excel / Google Sheets.</p>
              <div class="stack">
                <button class="btn block" id="ex-csv">Export trades to CSV</button>
                <button class="btn block" id="ex-json">Download full JSON backup (trades, journal, playbook, accounts)</button>
                <label class="btn block ghost" style="cursor:pointer">Restore from JSON backup…<input type="file" id="im-json" accept=".json" hidden /></label>
                <div class="sep"></div>
                <div class="k-label">Danger zone</div>
                <div class="card" style="margin-top:10px">
                  <div class="card-head"><h3>Sample data</h3></div>
                  <div class="small muted-2" style="margin-bottom:8px">The app invents nothing for you: a new workspace starts empty. These two buttons are the only things that create sample content.</div>
                  <div class="row" style="gap:8px;flex-wrap:wrap">
                    <button class="btn sm" id="reseed">Load 235 sample trades (demo walkthrough)</button>
                    <button class="btn sm danger ghost" id="democlear">Clear all my trades, journal, goals, watchlist &amp; signals</button>
                  </div>
                </div>
              </div>
              <div id="ex-out" class="field-note"></div>
            </div>`;
          U.$('#im-run', w).addEventListener('click', async () => {
            const csv = U.$('#im-csv', w).value;
            const out = U.$('#im-out', w);
            out.textContent = 'Importing…';
            try {
              const d = await API.post('/import/csv', { csv, account_id: U.$('#im-account', w).value });
              out.innerHTML = `Imported <b>${d.inserted}</b> trades${d.skipped ? `, skipped ${d.skipped}` : ''}. Detected columns: ${Object.entries(d.detected).filter(([, v]) => v).map(([k, v]) => `${k}→${v}`).join(', ') || 'none'}`;
              Store.invalidate(); global.App.toast('Import complete', 'ok');
            } catch (e) { out.innerHTML = `<span class="neg">${U.esc(e.message)}</span>`; }
          });
          const file = U.$('#im-file', w);
          file.addEventListener('change', () => {
            const f = file.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = () => { U.$('#im-csv', w).value = String(r.result).slice(0, 4e6); };
            r.readAsText(f);
          });
          U.$('#ex-csv', w).addEventListener('click', async () => { try { await API.download('/export/csv', 'trades.csv'); } catch { global.App.toast('Export failed', 'err'); } });
          U.$('#ex-json', w).addEventListener('click', async () => { try { await API.download('/export/json', 'tradejournal-backup.json'); } catch { global.App.toast('Export failed', 'err'); } });
          const jf = U.$('#im-json', w);
          jf.addEventListener('change', () => {
            const f = jf.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = async () => {
              try {
                const data = JSON.parse(String(r.result));
                const d = await API.post('/import/json', { data });
                U.$('#ex-out', w).innerHTML = `Restored <b>${d.inserted}</b> trades.`;
                await Store.reloadAll(); global.App.toast('Backup restored', 'ok'); global.App.refresh();
              } catch (e) { U.$('#ex-out', w).innerHTML = `<span class="neg">${U.esc(e.message)}</span>`; }
            };
            r.readAsText(f);
          });
          U.$('#reseed', w).addEventListener('click', async () => {
            if (!confirm('Load the 235-trade sample walkthrough? It replaces the trades in your default account with simulated history. Continue?')) return;
            await API.post('/demo/seed', {}); await Store.reloadAll(); global.App.refresh(); global.App.toast('Sample workspace loaded', 'ok');
          });
          U.$('#democlear', w).addEventListener('click', async () => {
            if (!confirm('Delete every trade, journal entry, goal, watchlist row and tracked signal for this workspace? Your account, instruments and playbook stay. This cannot be undone.')) return;
            const out = await API.post('/demo/clear', {});
            await Store.reloadAll(); global.App.refresh();
            const r = (out && out.removed) || {};
            global.App.toast(`Cleared: ${r.trades || 0} trades, ${r.journal_entries || 0} journal entries, ${r.goals || 0} goals, ${r.watchlist || 0} watchlist rows, ${r.bot_signals || 0} signals`, 'ok');
          });
          return w;
        },

        /* ---------------------------------------------------- integrations */
        integrations() {
          const w = U.h('div');
          w.innerHTML = '<div class="skeleton" style="height:260px"></div>';
          (async () => {
            let d;
            try { d = await API.get('/bots/webhook'); }
            catch (e) { U.clear(w).appendChild(U.h('div', { class: 'card', text: 'Could not load the integration settings: ' + e.message })); return; }
            U.clear(w);

            const urlBox = U.h('input', { readonly: 'readonly', value: d.url, style: 'font-family:var(--mono);font-size:11.5px' });
            const msgJson = U.h('textarea', { rows: 2, style: 'font-family:var(--mono);font-size:11.5px' });
            msgJson.value = d.sample_json;
            const msgText = U.h('textarea', { rows: 2, style: 'font-family:var(--mono);font-size:11.5px' });
            msgText.value = d.sample_text;

            const main = U.h('div', { class: 'card' });
            main.innerHTML = `<div class="card-head"><h3>TradingView alerts \u2192 this journal</h3><span class="spacer"></span>
                <span class="chip ${d.stats.total ? 'pos' : ''}">${d.stats.total} received</span></div>
              <div class="small muted-2">Point a TradingView alert at the URL below and every trigger is parsed, stored and <b>graded by the bot</b>: symbol, side, price and timeframe are read straight out of the alert message. No TradingView upgrade, no broker, no API key \u2014 it is an ordinary webhook.</div>
              <div class="field" style="margin-top:10px"><span>Webhook URL (paste into TradingView \u2192 Alert \u2192 Notifications \u2192 Webhook URL)</span></div>`;
            const urlRow = U.h('div', { class: 'row gap-8' });
            urlRow.appendChild(urlBox);
            const copyUrl = U.h('button', { class: 'btn sm', text: 'Copy' });
            const testBtn = U.h('button', { class: 'btn sm ghost', text: 'Send a test alert' });
            const rotateBtn = U.h('button', { class: 'btn sm ghost danger', text: 'Rotate token' });
            [copyUrl, testBtn, rotateBtn].forEach((b) => urlRow.appendChild(b));
            main.appendChild(urlRow);

            const toggles = U.h('div', { class: 'row wrap gap-16', style: 'margin-top:12px' });
            const aChk = U.h('input', { type: 'checkbox' });
            aChk.checked = !!d.analyse;
            const cChk = U.h('input', { type: 'checkbox' });
            cChk.checked = !!d.autocreate;
            toggles.appendChild(U.h('label', { class: 'row gap-6', style: 'align-items:center' }, aChk, document.createTextNode('run the bot on every alert')));
            toggles.appendChild(U.h('label', { class: 'row gap-6', style: 'align-items:center' }, cChk, document.createTextNode('log actionable ones as tracked signals')));
            main.appendChild(toggles);
            const save = async () => {
              try { await API.post('/bots/webhook', { analyse: aChk.checked, autocreate: cChk.checked }); global.App.toast('Saved', 'ok'); }
              catch (e) { global.App.toast(e.message, 'err'); }
            };
            aChk.addEventListener('change', save); cChk.addEventListener('change', save);

            const tmpl = U.h('div', { style: 'margin-top:14px' });
            tmpl.innerHTML = '<div class="field"><span>Alert message \u2014 JSON (recommended: keeps symbol, side, price and timeframe exact)</span></div>';
            tmpl.appendChild(msgJson);
            const jsonBtn = U.h('button', { class: 'btn xs', text: 'Copy JSON template' });
            const txtBtn = U.h('button', { class: 'btn xs ghost', text: 'Copy plain-text template' });
            jsonBtn.addEventListener('click', () => global.TV.copy(d.sample_json, 'Alert JSON'));
            txtBtn.addEventListener('click', () => global.TV.copy(d.sample_text, 'Alert text'));
            tmpl.appendChild(U.h('div', { class: 'row gap-8', style: 'margin-top:6px' }, jsonBtn, txtBtn));
            tmpl.appendChild(U.h('div', { class: 'field', style: 'margin-top:12px', html: '<span>or plain text</span>' }));
            tmpl.appendChild(msgText);
            main.appendChild(tmpl);
            w.appendChild(main);

            const out = U.h('div', { class: 'card' });
            out.innerHTML = `<div class="card-head"><strong>Test / received</strong><span class="spacer"></span><span class="tiny muted">analyse: ${d.analyse ? 'on' : 'off'} \u00b7 autocreate: ${d.autocreate ? 'on' : 'off'}</span></div>
              <div class="tiny muted-2" id="iv-out">Nothing sent yet. Press \u201cSend a test alert\u201d.</div>`;
            w.appendChild(out);

            const alertsCard = U.h('div', { class: 'card' });
            const paintAlerts = (list) => {
              alertsCard.innerHTML = `<div class="card-head"><h3>Recent alerts</h3><span class="spacer"></span><span class="tiny muted">${d.stats.ok} parsed \u00b7 ${d.stats.analysed} analysed</span></div>
                ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Alert</th><th>Price</th><th>TF</th><th>Bot verdict</th><th>Agreement</th></tr></thead><tbody>${list.map((a) => {
                  const r = a.result || {};
                  return `<tr><td class="muted-2 tiny">${U.esc(String(a.received_at).slice(5, 16))}</td>
                    <td><b>${U.esc(a.symbol || a.tv_symbol || '\u2014')}</b> <span class="chip ${a.action === 'buy' ? 'pos' : a.action === 'sell' ? 'neg' : ''}">${U.esc(a.action || '?')}</span></td>
                    <td class="mono">${a.price == null ? '\u2014' : U.price(a.price)}</td>
                    <td class="mono">${U.esc(a.timeframe || '\u2014')}</td>
                    <td>${r.action ? `<span class="chip ${r.action === 'BUY' ? 'pos' : r.action === 'SELL' ? 'neg' : ''}">${U.esc(r.action)}</span> ${r.grade ? U.esc(r.grade) + ' \u00b7 ' + r.score : ''}` : (a.error ? `<span class="neg tiny">${U.esc(a.error)}</span>` : '<span class="muted tiny">not analysed</span>')}</td>
                    <td class="tiny">${U.esc(r.agreement || '\u2014')}${r.rr ? ` \u00b7 ${r.rr}R` : ''}</td></tr>`;
                }).join('')}</tbody></table></div>` : '<div class="empty">No alerts yet.</div>'}`;
            };
            paintAlerts(d.alerts || []);
            w.appendChild(alertsCard);

            const clearBtn = U.h('button', { class: 'btn sm ghost danger', text: 'Clear alert history' });
            clearBtn.addEventListener('click', async () => {
              await API.post('/bots/alerts/clear', {});
              const fresh = await API.get('/bots/webhook');
              paintAlerts(fresh.alerts || []);
              global.App.toast('Alert history cleared', 'ok');
            });
            w.appendChild(U.h('div', { class: 'row', style: 'margin-top:10px' }, clearBtn));

            copyUrl.addEventListener('click', () => global.TV.copy(d.url, 'Webhook URL'));
            rotateBtn.addEventListener('click', async () => {
              if (!confirm('Rotate the token? The old URL stops working immediately \u2014 update your TradingView alerts.')) return;
              const r = await API.post('/bots/webhook/rotate', {});
              urlBox.value = r.url; global.TV.copy(r.url, 'New webhook URL'); global.App.toast('Token rotated', 'ok');
            });
            testBtn.addEventListener('click', async () => {
              const el = U.$('#iv-out', out);
              el.textContent = 'Sending\u2026';
              try {
                const r = await API.post('/bots/webhook/tradingview?token=' + encodeURIComponent(d.token), { symbol: 'XAUUSD', action: 'buy', price: 4244.8, tf: '15m' });
                el.innerHTML = r.plan
                  ? `Test alert accepted (id ${r.alert_id}). The bot says <b class="${r.plan.action === 'BUY' ? 'pos' : r.plan.action === 'SELL' ? 'neg' : ''}">${U.esc(r.plan.action)}</b> ${U.esc(r.plan.grade || '')} \u00b7 entry ${r.plan.entry == null ? '\u2014' : U.price(r.plan.entry)} \u00b7 stop ${r.plan.stop == null ? '\u2014' : U.price(r.plan.stop)} \u00b7 ${U.esc(r.plan.agreement || '')}`
                  : `Accepted (id ${r.alert_id}) but not analysed: ${U.esc(r.error || 'analysis off')}`;
                const fresh = await API.get('/bots/webhook'); paintAlerts(fresh.alerts || []);
              } catch (e) { el.innerHTML = `<span class="neg">${U.esc(e.message)}</span>`; }
            });
          })();
          return w;
        },


        prefs() {
          const s = Store.user.settings || {};
          const w = U.h('div', { class: 'grid g2' });
          w.innerHTML = `
            <div class="card"><div class="card-head"><h3>Profile & journal settings</h3></div>
              <div class="form-grid" style="grid-template-columns:1fr 1fr">
                <label class="field"><span>Display name</span><input id="s-name" value="${U.esc(Store.user.name || '')}" /></label>
                <label class="field"><span>Journal timezone</span>
                  <select id="s-tz">${['Africa/Lagos', 'UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'].map((t) => `<option value="${t}" ${s.timezone === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
                <label class="field span2"><span>Focus instruments (comma separated)</span><input id="s-focus" value="${U.esc((s.focus_symbols || []).join(', '))}" /></label>
                <label class="field"><span>Minimum reward : risk</span><input id="s-minrr" type="number" min="0.1" step="0.1" value="${Number(s.min_rr || 1)}" /></label>
              </div>
              <div class="field-note">The timezone drives hour-of-day and weekday analytics — set it to the market session you actually trade. The minimum reward:risk is the floor every plan is judged against: a plan below it can still be shown, but it is marked in red and never reads as an order.</div>
              <button class="btn primary sm" id="s-save" style="margin-top:12px">Save preferences</button>
            </div>
            <div class="card"><div class="card-head"><h3>Pre-trade checklist</h3><span class="spacer"></span><button class="btn xs ghost" id="s-add-rule">+ add rule</button></div>
              <div id="s-rules">${(s.default_checklist || []).map((r, i) => `<div class="rule"><input type="checkbox" checked disabled /><span>${U.esc(r)}</span><button class="btn xs ghost danger" data-rule="${i}" style="margin-left:auto">×</button></div>`).join('')}</div>
              <div class="field-note">This checklist appears on every new trade and in the briefing. Keep it short enough that you will actually use it.</div>
              <button class="btn primary sm" id="s-save-rules" style="margin-top:12px">Save checklist</button>
            </div>`;
          U.$('#s-save', w).addEventListener('click', async () => {
            await API.put('/settings', {
              name: U.$('#s-name', w).value, timezone: U.$('#s-tz', w).value,
              focus_symbols: U.$('#s-focus', w).value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean),
              min_rr: Number(U.$('#s-minrr', w).value) || 1,
              default_checklist: (Store.user.settings.default_checklist || []),
            });
            await Store.reloadAll(); global.App.toast('Preferences saved', 'ok');
          });
          U.$('#s-add-rule', w).addEventListener('click', () => {
            const inp = prompt('New checklist rule:'); if (!inp) return;
            Store.user.settings.default_checklist = [...(Store.user.settings.default_checklist || []), inp];
            global.App.refresh();
          });
          U.$('#s-save-rules', w).addEventListener('click', async () => {
            await API.put('/settings', { default_checklist: Store.user.settings.default_checklist || [] });
            await Store.reloadAll(); global.App.toast('Checklist saved', 'ok');
          });
          w.addEventListener('click', (e) => {
            const b = e.target.closest('[data-rule]'); if (!b) return;
            Store.user.settings.default_checklist.splice(Number(b.dataset.rule), 1);
            global.App.refresh();
          });
          return w;
        },

        about() {
          const w = U.h('div', { class: 'grid g2' });
          w.innerHTML = `
            <div class="card"><div class="card-head"><h3>What this app is</h3></div>
              <div class="small muted-2">
                <p><b>TradeJournal Pro</b> is a local-first trading journal, analytics engine and decision assistant. It runs on your machine, stores everything in a single SQLite file, and needs no subscription, account or broker connection.</p>
                <p><b>Multi-asset by design.</b> FX lots, futures contracts, shares, coins and CFDs all normalise into the same unit — R — so your expectancy is comparable across everything you trade.</p>
                <p><b>The coach is deterministic, not a black box.</b> Every insight is a statistical test on your own rows, ranked by dollar impact, with the evidence attached.</p>
              </div>
            </div>
            <div class="card"><div class="card-head"><h3>Data & privacy</h3></div>
              <div class="kv">
                <div class="k">Store</div><div class="v">libSQL — data/journal.db locally, Turso when hosted</div>
                <div class="k">Trade count</div><div class="v">${Store.stats ? Store.stats.trades : 0}</div>
                <div class="k">Open positions</div><div class="v">${Store.stats ? Store.stats.open : 0}</div>
                <div class="k">Accounts</div><div class="v">${Store.accounts.length}</div>
                <div class="k">Instruments</div><div class="v">${Store.instruments.length}</div>
                <div class="k">Market data</div><div class="v">public feeds, cached, no keys</div>
                <div class="k">TradingView</div><div class="v">charts embedded · alerts → <button class="btn xs ghost" id="ab-tv">webhook</button></div>
              </div>
              <div class="sep"></div>
              <div class="small muted-2">Nothing is sold, synced or shipped to a third party. Market context (calendar, headlines, quotes) is fetched server-side and cached; if you go offline the journal keeps working.</div>
              <div class="row" style="gap:8px;margin-top:12px">
                <button class="btn sm ghost" id="ab-fresh">Start a fresh, empty workspace</button>
                ${API.previousWorkspace() ? `<button class="btn sm ghost" id="ab-back">Back to ${U.esc(API.previousWorkspace().name)}</button>` : ''}
                <button class="btn sm ghost danger" id="ab-wipe">Delete all my trades</button>
              </div>
            </div>`;
          U.$('#ab-fresh', w).addEventListener('click', async () => {
            if (!confirm('Open a brand-new, empty workspace? This one stays in the database untouched and the button that appears here brings you straight back.')) return;
            await global.App.switchWorkspace('fresh');
          });
          const backBtn = U.$('#ab-back', w);
          if (backBtn) backBtn.addEventListener('click', () => global.App.switchWorkspace('back'));
          U.$('#ab-wipe', w).addEventListener('click', async () => {
            if (!confirm('Delete every trade, journal entry and goal for this user? This cannot be undone.')) return;
            const d = await API.get('/trades', { limit: 5000 });
            await API.post('/trades/bulk-delete', { ids: d.trades.map((t) => t.id) });
            await Store.reloadAll(); global.App.refresh(); global.App.toast('All trades deleted', 'ok');
          });
          return w;
        },
      };

      draw();

      function accountDialog(a) {
        const isNew = !a;
        const v = a || { name: '', broker: '', account_type: 'live', currency: 'USD', starting_balance: 10000, risk_per_trade_pct: 1, daily_loss_limit_pct: 3, max_drawdown_pct: 10, profit_target_pct: 8 };
        const body = U.h('div');
        body.innerHTML = `<div class="form-grid" style="grid-template-columns:1fr 1fr">
          <label class="field span2"><span>Account name</span><input id="a-name" value="${U.esc(v.name)}" placeholder="e.g. FTMO 100k Challenge" /></label>
          <label class="field"><span>Broker</span><input id="a-broker" value="${U.esc(v.broker)}" /></label>
          <label class="field"><span>Type</span><select id="a-type">${['live', 'demo', 'prop'].map((t) => `<option value="${t}" ${v.account_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="field"><span>Currency</span><input id="a-ccy" value="${U.esc(v.currency)}" /></label>
          <label class="field"><span>Starting balance</span><input id="a-bal" type="number" step="any" value="${v.starting_balance}" /></label>
          <label class="field"><span>Risk per trade (%)</span><input id="a-risk" type="number" step="0.05" value="${v.risk_per_trade_pct}" /></label>
          <label class="field"><span>Daily loss limit (%)</span><input id="a-daily" type="number" step="0.1" value="${v.daily_loss_limit_pct}" /></label>
          <label class="field"><span>Max drawdown (%)</span><input id="a-dd" type="number" step="0.1" value="${v.max_drawdown_pct}" /></label>
          <label class="field"><span>Profit target (%)</span><input id="a-target" type="number" step="0.1" value="${v.profit_target_pct}" /></label>
        </div>
        <div class="field-note">Prop-firm rules live here: the app tracks how much of your daily loss limit and max drawdown you have actually used.</div>`;
        global.App.modal({
          title: isNew ? 'New account' : 'Edit account', body, small: true,
          actions: [{ label: 'Cancel', ghost: true }, {
            label: 'Save', primary: true, onClick: async (close) => {
              const payload = {
                name: U.$('#a-name', body).value, broker: U.$('#a-broker', body).value, account_type: U.$('#a-type', body).value,
                currency: U.$('#a-ccy', body).value, starting_balance: U.$('#a-bal', body).value,
                risk_per_trade_pct: U.$('#a-risk', body).value, daily_loss_limit_pct: U.$('#a-daily', body).value,
                max_drawdown_pct: U.$('#a-dd', body).value, profit_target_pct: U.$('#a-target', body).value,
              };
              if (!payload.name) return global.App.toast('Account needs a name', 'err');
              if (isNew) await API.post('/accounts', payload); else await API.put('/accounts/' + a.id, payload);
              await Store.reloadAll(); close(); global.App.toast('Account saved', 'ok'); global.App.refresh();
            },
          }],
        });
      }
      return root;
    },
  };
})(window);
