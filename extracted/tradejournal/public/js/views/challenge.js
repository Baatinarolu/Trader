/* views/challenge.js — M115. The clean-rep count of Ep 32's 21-trade exercise.
 *
 * What this card must never do, because the exercise itself says so: it must not read as a money
 * scoreboard (money is not the goal), it must not grade the trader (a rep that did not count is a
 * recorded fact with its own reasons, not a punishment), it must not count days (skipping days is
 * permitted, so days are absent from every figure that matters), and it must never render an
 * unstarted or unreadable count as "0 reps".
 */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {};
  let challengeRenderEpoch = 0;

  Views.challenge = {
    /* The guard every card carries: the workspace/account/session it was rendered under, so a stale
     * card can refuse rather than write a declaration into somebody else's workspace. */
    context: () => ({ user: (global.Store && Store.user && Store.user.id) || null, account: (global.Store && Store.accountId) || null, token: (global.API && API.getToken && API.getToken()) || null }),
    same(c) { const n = this.context(); return !!c && c.user === n.user && c.account === n.account && c.token === n.token; },

    card(report) {
      const r = report && typeof report === 'object' ? report : {};
      const ctx = this.context();
      const node = U.h('div', { class: 'card', style: 'margin-top:14px', 'data-challenge': 'true' });
      const state = String(r.state || 'unavailable');

      if (state === 'unavailable') {
        node.innerHTML = `<div class="card-head"><h3>Clean reps \u2014 the 21-trade exercise</h3><span class="chip warn">unknown</span></div>
          <div class="small warn">${U.esc(r.reason || 'The rep count could not be read.')}</div>
          <div class="tiny muted" style="margin-top:6px">This is UNKNOWN, not zero reps and not a clean count. Nothing here is a grade, and nothing here is money.</div>`;
        return node;
      }

      const startState = (r.start || {}).state || 'not_set';
      const target = (r.target || {}).value;
      const targetState = (r.target || {}).state || 'default';
      const p = r.progress || {}, w = r.window || {}, n = r.not_counted || {}, j = r.journaling || {};

      if (state === 'not_started') {
        node.innerHTML = `<div class="card-head"><h3>Clean reps \u2014 the 21-trade exercise</h3><span class="chip muted">not started</span></div>
          <div class="small muted-2">A rep is one closed trade that is <b>linked to one of your own written plans</b>, <b>executed cleanly</b> (its checklist recorded and every recorded check passed, and no recorded decision not to honour its stop) and <b>journalled on its own UTC close day</b>.</div>
          <div class="small" style="margin-top:8px"><b>${U.esc(String(p.counted === null ? 'Nothing is counted yet' : p.counted))}</b> \u2014 the count has not been started, so this is not zero reps.</div>
          <div class="tiny muted" style="margin-top:4px">Starting it is your own act: trades taken before the start day are never counted, and the exercise counts trades, never days \u2014 skipping days is allowed.</div>
          <div class="row" style="gap:8px;margin-top:10px;align-items:center">
            <button class="btn sm" data-challenge-start>Start the ${U.num(p.target === null || p.target === undefined ? target || 21 : p.target, 0)}-rep count</button>
            <label class="small muted" style="display:flex;gap:6px;align-items:center">Target <input class="input" style="width:78px" type="number" min="1" max="999" value="${U.esc(String(target === null ? 21 : target))}" data-challenge-target></label>
            <button class="btn sm ghost" data-challenge-save-target>Save target</button>
          </div>
          <div class="tiny muted" style="margin-top:8px">${U.esc(r.basis || '')}</div>`;
        this.bind(node, ctx);
        return node;
      }

      /* state === 'available' */
      const counted = Number.isFinite(p.counted) ? p.counted : null;
      const pct = counted !== null && target ? Math.min(100, Math.round((counted / target) * 100)) : 0;
      const stateLabel = targetState === 'unusable' ? 'target unusable' : targetState === 'default' ? `default target ${U.num(target, 0)}` : `${U.num(target, 0)} reps`;
      const byCriterion = n.by_criterion || {};
      const failLine = [
        ['not linked to your own written plan', byCriterion.plan_linked],
        ['a recorded rule breach or no recorded checklist', byCriterion.no_recorded_breach],
        ['not journalled on its close day', byCriterion.journalled_same_close_day],
      ].filter(([, v]) => Number(v) > 0).map(([label, v]) => `${U.num(v, 0)} ${label}`).join(' \u00b7 ');

      node.innerHTML = `<div class="card-head"><h3>Clean reps \u2014 the 21-trade exercise</h3><span class="chip info">${U.esc(stateLabel)}</span></div>
        <div class="row-between" style="align-items:flex-end;flex-wrap:wrap;gap:8px">
          <div><div class="mono" style="font-size:22px" data-challenge-progress>${counted === null ? '\u2014' : U.num(counted, 0)}${target === null ? '' : ' / ' + U.num(target, 0)}<span class="small muted"> reps</span></div>
            <div class="tiny muted" style="margin-top:2px">${counted === null ? 'Unknown, not zero.' : target === null ? 'The stored target is not usable, so no remaining figure is shown.' : (p.remaining > 0 ? `${U.num(p.remaining, 0)} to go` : `target reached${p.beyond_target > 0 ? ` \u00b7 ${U.num(p.beyond_target, 0)} beyond it` : ''}`)}</div></div>
          <div class="tiny muted" style="text-align:right">clean run <b data-challenge-run>${p.run === null || p.run === undefined ? '\u2014' : U.num(p.run, 0)}</b> \u00b7 start day <b>${U.esc((r.start || {}).value || '\u2014')}</b><br>a failed trade never erases a counted rep; only the run restarts</div>
        </div>
        <div class="bar-track" style="margin-top:10px"><i class="${counted !== null && target && counted >= target ? 'pos' : ''}" style="width:${pct}%" data-challenge-bar></i></div>
        <div class="tiny muted" style="margin-top:6px">${U.esc((r.notes || {}).money || '')} ${U.esc((r.notes || {}).days || '')}</div>
        <div class="small" style="margin-top:8px" data-challenge-totals>
          <b>${U.num(w.trades_closed === null ? 0 : w.trades_closed, 0)}</b> closed trade${w.trades_closed === 1 ? '' : 's'} in the window \u00b7 <b>${U.num(n.total === null ? 0 : n.total, 0)}</b> did not count${failLine ? ` \u2014 ${U.esc(failLine)}` : ''}
          ${w.before_start ? `<div class="tiny muted" style="margin-top:4px">${U.num(w.before_start, 0)} closed before the start day (excluded, never counted and never failures)${w.undated_closes ? ` \u00b7 ${U.num(w.undated_closes, 0)} with no usable close clock, so they cannot be placed on any day` : ''}${w.truncated ? ' \u00b7 the read hit its bound, so older trades are not in this window' : ''}</div>` : ''}
          ${n.unrecorded_checks ? `<div class="tiny warn" style="margin-top:4px">${U.num(n.unrecorded_checks, 0)} of them carry no recorded checklist at all: no record is not a clean record, so they are not counted.</div>` : ''}
        </div>
        <div class="small" style="margin-top:8px" data-challenge-journal>
          <span class="muted">Journalled on the close day:</span> <b>${U.num(j.same_close_day === null ? 0 : j.same_close_day, 0)}</b> of <b>${U.num(j.reviewed_in_window === null ? 0 : j.reviewed_in_window, 0)}</b> reviewed${j.waiting_on_acknowledgement ? ` \u00b7 <b>${U.num(j.waiting_on_acknowledgement, 0)}</b> still waiting on the explicit acknowledgement` : ''}
          <div class="tiny muted" style="margin-top:3px">${U.esc(j.basis || '')}${j.median_gap_minutes === null || j.median_gap_minutes === undefined ? '' : ` Median observed gap: ${U.num(j.median_gap_minutes, 0)} min (max ${U.num(j.max_gap_minutes, 0)}).`}</div>
        </div>
        <div data-challenge-recent style="margin-top:10px">${(r.recent || []).slice(0, 8).map((t) => `
          <div class="row-between" style="padding:6px 0;border-top:1px solid rgba(255,255,255,.06)">
            <span class="small ${t.counted ? 'pos' : ''}">${t.counted ? 'rep' : 'not counted'} \u00b7 ${U.esc(t.symbol || '')} \u00b7 ${U.esc(String(t.closed_at || '').slice(0, 10))}${t.counted ? '' : ` \u00b7 ${U.esc((t.failed || []).map((f) => f === 'plan_linked' ? 'no plan link' : f === 'no_recorded_breach' ? 'recorded breach/no checklist' : 'not journalled that day').join(', '))}`}</span>
            <span class="tiny muted">${t.counted ? '' : U.esc(String((t.journal || {}).reviewed_at || 'no explicit acknowledgement').slice(0, 16))}</span>
          </div>`).join('') || '<div class="tiny muted">No closed trades in this window yet.</div>'}</div>
        <div class="row" style="gap:8px;margin-top:10px;align-items:center">
          <label class="small muted" style="display:flex;gap:6px;align-items:center">Target <input class="input" style="width:78px" type="number" min="1" max="999" value="${U.esc(String(target === null ? 21 : target))}" data-challenge-target></label>
          <button class="btn sm ghost" data-challenge-save-target>Save target</button>
          <span class="tiny muted">the target is yours to set; changing it never changes the count</span>
        </div>
        <div class="tiny muted" style="margin-top:8px">${U.esc(r.basis || '')}<br>${U.esc(r.scope || '')}<br>${U.esc(r.outcome_note || '')} ${U.esc((r.notes || {}).setting || '')}</div>`;
      this.bind(node, ctx);
      return node;
    },

    /** The declaration writes: start the count, set the target. Both go through the settings route
     *  the trader already owns — no new endpoint — and both refuse if the workspace moved. */
    bind(node, ctx) {
      const guard = (fn) => async (e) => {
        if (!Views.challenge.same(ctx)) { global.App.toast('This card belongs to another workspace or account; reopen it before changing the rep count.', 'err'); return; }
        const buttons = node.querySelectorAll('button'); buttons.forEach((b) => { b.disabled = true; });
        try { await fn(e); } catch (err) { global.App.toast(err.message || 'The rep count could not be updated', 'err'); }
        finally { buttons.forEach((b) => { b.disabled = false; }); }
      };
      const startBtn = node.querySelector('[data-challenge-start]');
      if (startBtn) startBtn.addEventListener('click', guard(async () => {
        await API.put('/settings', { challenge_start: Store.isoToday() });
        await Store.reloadAll(); global.App.toast('The rep count starts today', 'ok'); global.App.refresh();
      }));
      const saveBtn = node.querySelector('[data-challenge-save-target]');
      if (saveBtn) saveBtn.addEventListener('click', guard(async () => {
        const input = node.querySelector('[data-challenge-target]');
        await API.put('/settings', { challenge_target: Number(input && input.value) });
        await Store.reloadAll(); global.App.toast('Rep target saved', 'ok'); global.App.refresh();
      }));
    },
  };
})(window);
