'use strict';
/** M106 archive/settings UI probe: the shipped card and the shipped import-warning
 * helpers rendered in jsdom against the real server. The app shell is stubbed (no
 * canvas, no TradingView), so this is structural/behavioural, not a browser proof. */
const H = require('./m106-test-support'), { ok, start, finish, D } = H, fs = require('fs'), path = require('path');
let dom;
const YES = { calm: true, clear: true, following_plan: true, would_take_if_up_big: true };
finish('M106 imported-archive disclosure and import-warning UI', async () => {
  try {
    const { user: u, other, req, token, otherToken } = await start('archive-ui');
    let v = (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data;
    await req('/state-gate?account_id=' + u.accountId, { answers: YES, revision: v.revision }, 'PUT');
    v = (await req('/state-gate?account_id=' + u.accountId, undefined, 'GET')).data;
    await req('/state-gate?account_id=' + u.accountId, { answers: { ...YES, clear: false }, revision: v.revision }, 'PUT');
    const backup = (await req('/export/json', undefined, 'GET')).data.state_gate_answers;
    const imported = await req('/import/json', { trades: [], state_gate_answers: backup }, 'POST', otherToken);
    ok('the real restore returned the archive count and no refusal for the receiving trader', imported.status === 200 && imported.data.state_gate_warnings.length === 0, imported.data.state_gate_warnings);
    const malformed = await req('/import/json', { trades: [], state_gate_answers: { version: 1, records: [{ account_id: other.accountId, answers: { calm: true }, version: 1 }] } }, 'POST', otherToken);
    const dest = (await req('/state-gate?account_id=' + other.accountId, undefined, 'GET', otherToken)).data;
    ok('the receiving account holds two unverified archives while its own state stays not_adopted', dest.imported_archives === 2 && dest.state === 'not_adopted' && dest.allowed === false, { archives: dest.imported_archives, state: dest.state });

    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, toasts = [], opened = [];
    w.fetch = (url, o) => fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o);
    const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
    for (const p of ['util.js', 'api.js', 'store.js', 'views/state-gate.js']) load(p);
    w.API.setToken(otherToken); await w.Store.load(true); w.Store.setAccount(other.accountId);
    w.App = { toast: (text, type) => toasts.push({ text, type }), modal: (o) => { opened.push(o); return { close() {} }; }, modalStack: [] };
    const P = w.Views.stateGate;
    const destView = await w.API.get('/state-gate', { account_id: other.accountId });
    const card = P.card(destView);
    ok('the shipped card states how many unverified archives exist and that they are never a pass', /2 imported answer record\(s\) restored as unverified archives; they never count as a pass/.test(card.textContent), card.textContent.slice(-260));
    ok('the card shows the receiving trader as not adopted rather than inheriting the imported no', /Not adopted on this account/.test(card.textContent) && !/Fresh answers/.test(card.textContent));
    ok('an imported archive can never render as markup or an image in the card', !card.querySelector('img,script') && !/onerror=/i.test(card.innerHTML));
    ok('the card still offers the trader their own answer path and the readonly history', !!card.querySelector('[data-state-gate-edit]') && !!card.querySelector('[data-state-gate-history]'));

    const feedback = P.feedback(malformed.data);
    ok('the shipped settings helper surfaces the real import warning', !!feedback && /Optional state-gate answer history|four saved questions|version 1/.test(feedback.textContent) && feedback.classList.contains('warn'), feedback?.textContent);
    ok('a clean restore shows no warning node at all', P.feedback({ state_gate_warnings: [] }) === null && P.feedback(imported.data) === null);
    ok('the warnings helper refuses to invent a warning from a missing field', P.feedback({}) === null && P.feedback(undefined) === null);
    await P.history(other.accountId);
    ok('the readonly archive reader opens a modal titled for the retained history only', opened.length === 1 && /Readonly state-gate history/.test(opened[0].title) && /never grant a pass/.test(opened[0].body.textContent), opened[0]?.title);
    const history = await w.API.get('/state-gate/history', { account_id: other.accountId });
    ok('the readonly history lists both archives with their original receipts intact', history.records.length === 2 && history.records.every((x) => x.source === 'imported_unverified' && x.broker_verified === false && x.historical.recorded_at === backup.records[x.version - 1].recorded_at), history.records.map((x) => x.historical.recorded_at));

    const settings = fs.readFileSync(path.join(H.APP, 'public/js/views/settings.js'), 'utf8');
    const okWiring = (settings.match(/Views\.stateGate\?\.feedback\(d\)/g) || []).length === 2 && (settings.match(/d\.state_gate_warnings\?\.length/g) || []).length === 3;
    ok('the shipped Settings import and restore both render the warnings and count them in the toast', okWiring, (settings.match(/Views\.stateGate\?\.feedback\(d\)/g) || []).length);
    const html = fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8');
    ok('the shipped HTML loads the gate view before the dashboard and journal readers', html.indexOf('/js/views/state-gate.js') > 0 && html.indexOf('/js/views/state-gate.js') < html.indexOf('/js/views/dashboard.js') && html.indexOf('/js/views/state-gate.js') < html.indexOf('/js/views/journal.js'));
    const dashboard = fs.readFileSync(path.join(H.APP, 'public/js/views/dashboard.js'), 'utf8');
    const journal = fs.readFileSync(path.join(H.APP, 'public/js/views/journal.js'), 'utf8');
    ok('the shipped dashboard fetches the gate for the current account and renders it above the other cards', /API\.get\('\/state-gate',\{account_id:Store\.accountId\}\)/.test(dashboard) && dashboard.indexOf('Views.stateGate.card(stateGateView)') < dashboard.indexOf('root.appendChild(Views.sessionTimeCard'), dashboard.indexOf('Views.stateGate.card(stateGateView)'));
    ok('the shipped owned-day view carries the same gate object as a card', /Views\.stateGate\.card\(day\.state_gate\)/.test(journal));
    ok('no toast or modal claimed a pass, a mind-reading or a broker effect during the render', toasts.length === 0 && !/broker[- ]verified|proves|verified you|proof of calm/i.test(card.textContent), { toasts, text: card.textContent.slice(0, 80) });
  } catch (e) { H.ok('uncaught ' + e.message, false); console.error(e.stack); }
  finally { if (dom) dom.window.close(); }
});
