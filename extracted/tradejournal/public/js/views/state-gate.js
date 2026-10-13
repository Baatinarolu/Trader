/* views/state-gate.js — M106 fresh in-session four-question check.
 * Records the trader's own yes/no answers; never a readiness score, a mental-state
 * measurement or permission for anything outside the app's own surfaces. */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {}, U = global.U;
  let serial = 0;
  const ctx = () => ({ user: global.Store.user?.id, account: global.Store.accountId, token: global.API.getToken() });
  const same = (c) => c.user === global.Store.user?.id && c.account === global.Store.accountId && c.token === global.API.getToken();
  const LABEL = { not_adopted: 'Not adopted on this account', passed: 'Fresh answers: all yes', failed: 'Fresh answers: a no — no trade yet', unanswered: 'Not answered for this session', stale: 'Answers older than the APP window', unavailable: 'Answers unreadable — no pass claimed' };
  const QUESTION_TEXT = (id) => ({ calm: 'Am I calm?', clear: 'Am I clear?', following_plan: 'Am I following the trade plan?', would_take_if_up_big: 'Would I take this trade if I was already up big today?' }[id] || id);

  const P = Views.stateGate = {
    ctx, same,
    feedback(out) { if (!out?.state_gate_warnings?.length) return null; return U.h('section', { class: 'sticky-note warn' }, U.h('strong', { text: 'Optional state-gate answer history' }), ...out.state_gate_warnings.map((text) => U.h('p', { class: 'tiny', text }))); },
    async history(accountId) {
      const context = ctx(), number = ++serial;
      try {
        const out = await global.API.get('/state-gate/history', { account_id: accountId });
        if (!same(context) || number !== serial) return;
        const body = U.h('div');
        body.appendChild(U.h('h3', { text: 'Readonly state-gate answer history' }));
        body.appendChild(U.h('p', { class: 'field-note', text: 'Original keys, receipts and answers retained. Imported copies stay unverified and can never grant a pass; orphaned originals are never re-attached to another account.' }));
        for (const record of out.records || []) body.appendChild(U.h('pre', { class: 'tiny', text: JSON.stringify(record, null, 2) }));
        return global.App.modal({ title: 'Readonly state-gate history', body, wide: true, actions: [{ label: 'Close readonly history', ghost: true }] });
      } catch (e) { if (same(context) && number === serial) global.App.toast(e.message, 'err'); }
    },
    card(v) {
      const node = U.h('section', { class: 'card', style: 'margin-top:14px', dataset: { stateGateCard: 'true' } }), context = ctx();
      node.appendChild(U.h('h3', { text: 'Pre-entry state check — four questions' }));
      node.appendChild(U.h('p', { class: 'field-note', text: 'Saved rule: “If the answer to any of these questions is no, then you don’t trade yet.” The app records your own answers with a server receipt. It cannot read your mind, verify calmness or plan adherence, or stop a broker — and a missing or stale answer is never treated as a pass.' }));
      if (!v || v.state === 'unavailable' && v.account_id === null) { node.appendChild(U.h('p', { class: 'sticky-note warn', text: 'State-check context unavailable — not treated as answered, passed or blocked. Nothing is inferred from old notes, profit or adherence.' })); return node; }
      node.appendChild(U.h('p', { class: 'small', text: 'Current: ' + (LABEL[v.state] || v.state) + (v.receipt ? ' · server receipt ' + v.receipt + ' · expires ' + v.expires_at + ' (APP window ' + v.window_minutes + ' min)' : '') }));
      if (v.answers) {
        for (const q of v.questions || []) node.appendChild(U.h('p', { class: 'tiny', text: `· ${q.text} — ${v.answers[q.id] === true ? 'yes' : v.answers[q.id] === false ? 'no' : 'not answered'}` }));
      }
      if (v.state === 'failed') node.appendChild(U.h('p', { class: 'sticky-note warn', text: 'You answered no to: ' + (v.failed_questions || []).map(QUESTION_TEXT).join('; ') + '. Actionable signals and new live entries are refused in the app until you answer fresh — this refusal cannot reach a broker and does not change history.' }));
      else if (v.state === 'stale') node.appendChild(U.h('p', { class: 'sticky-note warn', text: 'Your last answers are outside the APP window, so they are not a pass for a new in-session entry. Answer again to act.' }));
      else if (v.state === 'unanswered') node.appendChild(U.h('p', { class: 'sticky-note warn', text: 'You have used this gate before but not for this session. New live entries and saved signals are refused until you answer.' }));
      else if (v.state === 'not_adopted') node.appendChild(U.h('p', { class: 'tiny muted', text: 'This account has never answered the four questions, so the app has no recorded refusal to honour and does not invent one. It also cannot claim a state check it never received — answered or not, this is not permission.' }));
      if (v.imported_archives) node.appendChild(U.h('p', { class: 'tiny muted', text: `${v.imported_archives} imported answer record(s) restored as unverified archives; they never count as a pass.` }));
      if (v.adopted && v.state !== 'passed') node.appendChild(U.h('p', { class: 'tiny muted', text: 'Adopted gate: while it is not fresh and all-yes, the app’s own entry/signal surfaces refuse, exactly as the killzone veto refuses a setup.' }));
      node.appendChild(U.h('p', { class: 'tiny muted', text: v.basis }));
      node.appendChild(U.h('button', { class: 'btn sm primary', type: 'button', dataset: { stateGateEdit: 'true' }, text: v.adopted ? 'Answer the four questions again' : 'Answer the four questions', onclick: () => { if (!same(context)) return global.App.toast('Workspace/account/session changed; reopen this account’s own check.', 'err'); return P.edit(); } }));
      node.appendChild(U.h('button', { class: 'btn sm ghost', type: 'button', dataset: { stateGateHistory: 'true' }, text: 'Review readonly answer history', onclick: () => { if (!same(context)) return; return P.history(); } }));
      return node;
    },
    async edit() {
      const context = ctx(), number = ++serial; let view;
      try { view = await global.API.get('/state-gate', { account_id: context.account }); }
      catch (e) { if (same(context) && number === serial) global.App.toast(e.message, 'err'); return; }
      if (!same(context) || number !== serial || view.account_id !== Number(context.account)) return;
      const body = U.h('div'); let alive = true, busy = false, stale = false;
      const valid = () => alive && same(context) && number === serial && body.isConnected;
      const picks = {};
      function draw() {
        body.replaceChildren();
        body.appendChild(U.h('p', { class: 'field-note', text: `Account #${view.account_id} · ${LABEL[view.state] || view.state}${view.receipt ? ' · receipt ' + view.receipt + ' (APP window ' + view.window_minutes + ' min)' : ''}. Answer honestly for right now; the app stores your words and clock, nothing else, and no answer here changes finance, grades, risk, the routine or the core.` }));
        for (const q of view.questions || []) {
          const row = U.h('label', { class: 'row gap-8' });
          row.appendChild(U.h('span', { text: q.text }));
          const group = U.h('span', { class: 'row gap-8' });
          for (const value of [true, false]) {
            const radio = U.h('input', { type: 'radio', name: 'sg-' + q.id, dataset: { stateGateAnswer: q.id }, value: value ? 'yes' : 'no' });
            if (view.answers && view.answers[q.id] === value) radio.checked = true;
            radio.addEventListener('change', () => { picks[q.id] = value; refresh(); });
            group.appendChild(U.h('span', { class: 'row gap-8' }, radio, U.h('span', { class: 'tiny', text: value ? 'yes' : 'no' })));
          }
          if (view.answers) picks[q.id] = view.answers[q.id];
          row.appendChild(group); body.appendChild(row);
        }
        const unknown = U.h('input', { type: 'checkbox', dataset: { stateGateUnknown: 'true' } });
        body.appendChild(U.h('label', { class: 'row gap-8' }, unknown, U.h('span', { text: 'Record that I have not answered the four questions now (explicit unknown — retains history, grants nothing)' })));
        body.appendChild(U.h('p', { class: 'tiny muted', text: 'There is no default, no “maybe”, and no preselected yes. A yes/no pair answered here is the app’s only source for this gate; the app does not infer your state from journal text or P&L.' }));
        const save = U.h('button', { class: 'btn sm primary', type: 'button', dataset: { stateGateSave: 'true' }, text: 'Record this check', onclick: async () => {
          if (!valid() || busy) return global.App.toast('Workspace/account/session/editor changed; reopen.', 'err');
          const answers = unknown.checked ? null : ((view.questions || []).every((q) => typeof picks[q.id] === 'boolean') ? Object.fromEntries((view.questions || []).map((q) => [q.id, picks[q.id]])) : null);
          if (!unknown.checked && answers === null) return global.App.toast('Answer all four questions yes/no, or tick explicit unknown.', 'err');
          busy = true; disable();
          try { const out = await global.API.put('/state-gate?account_id=' + context.account, { answers, revision: view.revision }); if (!valid()) return; view = out; stale = false; picks_clear(); draw(); global.Store.invalidate(); global.App.toast('Answers recorded; finance, grades, routine, core and permission outside this gate are unchanged.', 'ok'); }
          catch (e) { if (valid()) { stale = e.status === 409; global.App.toast(e.message, 'err'); } }
          finally { busy = false; if (valid()) disable(); }
        } });
        const reload = U.h('button', { class: 'btn sm ghost', type: 'button', dataset: { stateGateReload: 'true' }, text: 'Reload current answers (discard unsaved picks)', onclick: async () => {
          if (!valid() || busy) return; busy = true; disable();
          try { const out = await global.API.get('/state-gate', { account_id: context.account }); if (!valid()) return; view = out; stale = false; picks_clear(); draw(); }
          catch (e) { if (valid()) global.App.toast(e.message, 'err'); }
          finally { busy = false; if (valid()) disable(); }
        } });
        body.appendChild(save); body.appendChild(reload);
        const details = U.h('details'); details.appendChild(U.h('summary', { text: 'Retained answer history' }));
        for (const d of view.history || []) details.appendChild(U.h('pre', { class: 'tiny', text: JSON.stringify(d, null, 2) }));
        body.appendChild(details);
      }
      function picks_clear() { for (const k of Object.keys(picks)) delete picks[k]; }
      function disable() {
        body.querySelector('[data-state-gate-save]').disabled = busy || stale;
        body.querySelector('[data-state-gate-reload]').disabled = busy;
      }
      function refresh() { if (valid()) disable(); }
      draw();
      const modal = global.App.modal({ title: 'Pre-entry state check', body, wide: true, onClose: () => { alive = false; }, actions: [{ label: 'Close — no permission inferred', ghost: true }] });
      disable();
      return modal;
    },
  };
})(window);
