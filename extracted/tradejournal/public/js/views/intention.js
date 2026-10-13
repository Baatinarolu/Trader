/* views/intention.js — M107 the day's ONE process intention.
 * A same-day commitment the trader writes down: a saved process example or free text
 * kept explicitly unverified. Never a readiness gate, a score, permission for a trade,
 * and never proof the intention was followed. */
(function (global) {
  'use strict';
  const Views = global.Views = global.Views || {}, U = global.U;
  let serial = 0;
  const ctx = () => ({ user: global.Store.user?.id, account: global.Store.accountId, token: global.API.getToken() });
  const same = (c) => c.user === global.Store.user?.id && c.account === global.Store.accountId && c.token === global.API.getToken();
  const FRAMING = { process_template: 'Saved process example', unverified_free_text: 'Your own words — unverified free text', outcome_language: 'Reads as an outcome — recorded as unverified' };
  const TEMPLATE_LABEL = (id) => (Views.intention.templates().find((t) => t.id === id) || {}).label || id;

  const P = Views.intention = {
    ctx, same,
    /** The saved examples. Kept in the view so a stale server cannot blank the labels. */
    templates() { return P._templates || [{ id: 'follow_plan', text: 'Today I follow my plan', label: 'Follow my plan' }, { id: 'a_plus_only', text: 'Today I will take only A+ setups', label: 'A+ setups only' }, { id: 'journal_every_trade', text: 'Today I will journal every trade', label: 'Journal every trade' }, { id: 'no_revenge', text: 'Today I will not revenge trade', label: 'No revenge trade' }]; },
    feedback(out) { if (!out?.intention_warnings?.length) return null; return U.h('section', { class: 'sticky-note warn' }, U.h('strong', { text: 'Optional intention history' }), ...out.intention_warnings.map((text) => U.h('p', { class: 'tiny', text }))); },
    async history(accountId, date) {
      const context = ctx(), number = ++serial;
      try {
        const out = await global.API.get('/intention/history', { account_id: accountId, date: date || undefined });
        if (!same(context) || number !== serial) return;
        const body = U.h('div');
        body.appendChild(U.h('h3', { text: 'Readonly daily-intention history' }));
        body.appendChild(U.h('p', { class: 'field-note', text: 'Original days, words and receipts retained. Imported copies stay unverified archives and are never this account’s recorded intention for a day; orphaned originals are never re-attached to another account. Nothing here is a score or a judgement of whether you followed it.' }));
        for (const record of out.records || []) body.appendChild(U.h('pre', { class: 'tiny', text: JSON.stringify(record, null, 2) }));
        return global.App.modal({ title: 'Readonly intention history', body, wide: true, actions: [{ label: 'Close readonly history', ghost: true }] });
      } catch (e) { if (same(context) && number === serial) global.App.toast(e.message, 'err'); }
    },
    card(v) {
      const node = U.h('section', { class: 'card', style: 'margin-top:14px', dataset: { intentionCard: 'true' } }), context = ctx();
      node.appendChild(U.h('h3', { text: 'Today’s process intention — one rule for the day' }));
      node.appendChild(U.h('p', { class: 'field-note', text: 'Saved rule: make it one simple sentence, process-oriented, behavioral and within your control — “Today I’m going to make $5,000” is an outcome goal, and outcomes only arrive as a byproduct of the process. The app refuses a money target here and never labels free text as process-oriented; it cannot verify that you followed it.' }));
      if (!v || (v.state === 'unavailable' && v.account_id === null)) { node.appendChild(U.h('p', { class: 'sticky-note warn', text: 'Intention context unavailable — not treated as recorded, failed or carried over. Nothing is inferred from older days, profit or adherence.' })); return node; }
      const label = v.state === 'recorded' ? (v.framing === 'process_template' ? 'Recorded saved example: “' + v.text + '”' : 'Recorded: “' + v.text + '”') : v.state === 'unavailable' ? 'Recorded words unreadable — nothing claimed for that day' : v.same_day ? 'Not recorded yet today' : 'Nothing was recorded on that day';
      node.appendChild(U.h('p', { class: 'small', text: 'Current: ' + label + (v.receipt ? ' · server receipt ' + v.receipt : '') + ' · day ' + v.day + ' (UTC)' }));
      if (v.state === 'recorded') {
        node.appendChild(U.h('p', { class: 'tiny', text: 'Framing: ' + (FRAMING[v.framing] || v.framing) + (v.template ? ' · template ' + TEMPLATE_LABEL(v.template) : ' · your own words were stored exactly as written') }));
        for (const w of v.warnings || []) node.appendChild(U.h('p', { class: 'tiny muted', text: '· ' + w }));
      }
      if (v.state === 'unrecorded') node.appendChild(U.h('p', { class: 'tiny muted', text: v.same_day ? 'A day with no intention recorded is not a failure, and today’s words are never copied from an earlier day.' : v.message }));
      if (v.last_recorded) node.appendChild(U.h('p', { class: 'tiny muted', text: `Last recorded intention: ${v.last_recorded.day} — “${v.last_recorded.text}”. Shown as history only; it is NOT today’s intention and is never carried over.` }));
      if (v.imported_archives) node.appendChild(U.h('p', { class: 'tiny muted', text: `${v.imported_archives} imported intention record(s) restored as unverified archives; they never count as this account’s recorded day.` }));
      node.appendChild(U.h('p', { class: 'tiny muted', text: 'Authority: none. This intention does not admit, refuse or size a trade, does not change risk/grades/core and is never proof that it was followed.' }));
      if (v.state === 'recorded' && v.day === v.today) node.appendChild(U.h('button', { class: 'btn sm primary', type: 'button', dataset: { intentionEdit: 'true' }, text: 'Change today’s intention', onclick: () => { if (!same(context)) return global.App.toast('Workspace/account/session changed; reopen this account’s own intention.', 'err'); return P.edit(); } }));
      else if (v.day === v.today) node.appendChild(U.h('button', { class: 'btn sm primary', type: 'button', dataset: { intentionEdit: 'true' }, text: v.state === 'recorded' ? 'Change today’s intention' : 'Record today’s intention', onclick: () => { if (!same(context)) return global.App.toast('Workspace/account/session changed; reopen this account’s own intention.', 'err'); return P.edit(); } }));
      else node.appendChild(U.h('p', { class: 'tiny muted', text: 'A past day is readonly: an intention is a same-day commitment and cannot be written for yesterday or tomorrow.' }));
      node.appendChild(U.h('button', { class: 'btn sm ghost', type: 'button', dataset: { intentionHistory: 'true' }, text: 'Review readonly intention history', onclick: () => { if (!same(context)) return; return P.history(context.account, null); } }));
      return node;
    },
    async edit() {
      const context = ctx(), number = ++serial; let view;
      try { view = await global.API.get('/intention', { account_id: context.account }); }
      catch (e) { if (same(context) && number === serial) global.App.toast(e.message, 'err'); return; }
      if (!same(context) || number !== serial || view.account_id !== Number(context.account)) return;
      P._templates = view.templates || P.templates();
      const body = U.h('div'); let alive = true, busy = false, stale = false;
      const valid = () => alive && same(context) && number === serial && body.isConnected;
      let pick = view.state === 'recorded' && view.template ? view.template : '';
      function draw() {
        body.replaceChildren();
        body.appendChild(U.h('p', { class: 'field-note', text: `Account #${view.account_id} · day ${view.day} (UTC, server-pinned) · ${view.state === 'recorded' ? 'recorded' : 'not recorded yet'}. Today only: an intention cannot be pre-written for tomorrow or rewritten for an earlier day, and these words never change finance, risk, grades, routine or the core.` }));
        for (const t of P.templates()) {
          const radio = U.h('input', { type: 'radio', name: 'intention-pick', dataset: { intentionTemplate: t.id }, value: t.id });
          if (pick === t.id) radio.checked = true;
          radio.addEventListener('change', () => { pick = t.id; input.disabled = true; refresh(); });
          body.appendChild(U.h('label', { class: 'row gap-8' }, radio, U.h('span', { text: '“' + t.text + '” (saved example)' })));
        }
        const custom = U.h('input', { type: 'radio', name: 'intention-pick', dataset: { intentionCustom: 'true' } });
        if (pick === '') custom.checked = true;
        body.appendChild(U.h('label', { class: 'row gap-8' }, custom, U.h('span', { text: 'My own words (stored unverified — the app will not call them process-oriented)' })));
        const input = U.h('input', { type: 'text', maxlength: view.char_max || 120, dataset: { intentionText: 'true' }, value: pick === '' ? (view.text || '') : '', placeholder: 'One simple sentence, within your control' });
        custom.addEventListener('change', () => { if (custom.checked) { pick = ''; input.disabled = false; input.focus(); } });
        input.disabled = pick !== '';
        body.appendChild(U.h('label', { class: 'field' }, U.h('span', { text: 'One sentence for today' }), input));
        body.appendChild(U.h('p', { class: 'tiny muted', text: 'Refused here by design: an amount and an outcome in the same sentence (“make $5,000 today”, “win 5%”). Journal text is untouched — this is only the intention field. Everything else is stored as written, with the cues the app found, and never as a score.' }));
        const save = U.h('button', { class: 'btn sm primary', type: 'button', dataset: { intentionSave: 'true' }, text: 'Record today’s intention', onclick: async () => {
          if (!valid() || busy) return global.App.toast('Workspace/account/session/editor changed; reopen.', 'err');
          const payload = pick ? { template: pick, revision: view.revision } : { intention: input.value, revision: view.revision };
          busy = true; disable();
          try { const out = await global.API.put('/intention?account_id=' + context.account, payload); if (!valid()) return; view = out; stale = false; pick = out.template || ''; draw(); global.Store.invalidate(); global.App.toast('Intention recorded for today. No trade permission, risk or grade changed.', 'ok'); }
          catch (e) { if (valid()) { stale = e.status === 409; global.App.toast(e.message, 'err'); } }
          finally { busy = false; if (valid()) disable(); }
        } });
        const reload = U.h('button', { class: 'btn sm ghost', type: 'button', dataset: { intentionReload: 'true' }, text: 'Reload today’s record (discard unsaved pick)', onclick: async () => {
          if (!valid() || busy) return; busy = true; disable();
          try { const out = await global.API.get('/intention', { account_id: context.account }); if (!valid()) return; view = out; P._templates = out.templates || P._templates; pick = out.template || ''; stale = false; draw(); }
          catch (e) { if (valid()) global.App.toast(e.message, 'err'); }
          finally { busy = false; if (valid()) disable(); }
        } });
        body.appendChild(save); body.appendChild(reload);
        const details = U.h('details'); details.appendChild(U.h('summary', { text: 'Retained records for this day' }));
        for (const d of view.history || []) details.appendChild(U.h('pre', { class: 'tiny', text: JSON.stringify(d, null, 2) }));
        body.appendChild(details);
      }
      function disable() { body.querySelector('[data-intention-save]').disabled = busy || stale; body.querySelector('[data-intention-reload]').disabled = busy; }
      function refresh() { if (valid()) disable(); }
      draw();
      const modal = global.App.modal({ title: 'Today’s process intention', body, wide: true, onClose: () => { alive = false; }, actions: [{ label: 'Close — no permission inferred', ghost: true }] });
      disable();
      return modal;
    },
  };
})(window);
