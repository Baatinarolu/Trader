'use strict';
/** M110 UI probe: the shipped account dialog rendered in jsdom against the real server. It is the
 * surface where the trader sets the two clocks, so this checks what the dialog SHOWS, what it
 * refuses, and what it actually sends — the server's own enforcement is measured separately in
 * probe-m110-api.js. jsdom has no browser engine: structural/behavioural, not a pixel proof. */
const H = require('./m110-test-support'), { ok, start, finish } = H, fs = require('fs'), path = require('path');
const N = H.mod('src/news-window');   // absent on the committed parent: a measured control
let dom;
finish('M110 real DOM', async () => {
  if (!H.shipped(N, 'the M110 news-window module')) return;
  try {
    const u = await start('m110-ui');
    const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
    dom = new JSDOM('<body><div id="root"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, pending = [], errors = [], toasts = [], calls = [];
    w.Date = Date; w.addEventListener('error', (e) => errors.push(e.message));
    w.fetch = (url, o) => { calls.push({ url: String(url).replace(/^https?:\/\/[^/]+/, ''), method: (o && o.method) || 'GET', body: o && o.body }); return fetch(new URL(url, 'http://127.0.0.1:' + H.port()), o); };
    const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
    for (const p of ['util.js', 'api.js', 'store.js', 'views/settings.js']) load(p);
    w.API.setToken(u.token); await w.Store.load(true);
    const listener = w.addEventListener.bind(w);
    w.addEventListener = (t, ...a) => t === 'DOMContentLoaded' ? undefined : listener(t, ...a);
    Object.defineProperty(w.document, 'readyState', { value: 'loading', configurable: true }); load('app.js'); delete w.document.readyState; w.addEventListener = listener;
    w.App.boot = async () => {}; w.App.refresh = () => {}; w.App.toast = (text, type) => toasts.push({ text, type });
    const h = w.U.h;
    w.U.h = (tag, p, ...kids) => { if (p && p.onclick) { const fn = p.onclick; p = { ...p, onclick: (...a) => { const out = fn(...a); if (out && out.then) pending.push(out.catch((e) => errors.push(e.message))); return out; } }; } return h(tag, p, ...kids); };
    const settle = async () => { for (let n = 0; n < 8; n++) { await Promise.all(pending); await new Promise((r) => setImmediate(r)); } };
    const click = (node) => node.dispatchEvent(new w.Event('click', { bubbles: true }));
    const type = (node, text) => { node.value = text; node.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const src = fs.readFileSync(path.join(H.APP, 'public/js/views/settings.js'), 'utf8');
    const modal = () => w.document.body.querySelector('.modal');
    const saveBtn = () => [...modal().querySelectorAll('.modal-foot button')].find((b) => b.textContent === 'Save');
    const lastToast = () => toasts[toasts.length - 1];

    ok('the shipped dialog has two separate news inputs, before and after, and no single “news window” control', (src.match(/id="a-news-before"/g) || []).length === 1 && (src.match(/id="a-news-after"/g) || []).length === 1 && !/id="a-news-window"/.test(src));
    ok('the view source carries no `windowMin` and no bare `window_min` in the news payload: it sends the two keys and nothing else', !/windowMin|window_min\b/.test(src) && /news_block_before_min: U\.\$\('#a-news-before', body\)\.value/.test(src) && /news_settle_after_min: U\.\$\('#a-news-after', body\)\.value/.test(src));
    ok('the dialog text tells the trader the settle floor is 30 and that the two are separate clocks, before anything is typed', /30 is the floor/.test(src) && /separate clock from the block above/.test(src) && /never used to shorten the settle below/.test(src));

    const root = w.U.$('#root');
    await w.Views.settings.render(root); await settle();
    const add = [...root.querySelectorAll('button')].find((b) => b.textContent === '+ Add account');
    ok('the accounts pane renders an Add-account action that opens the dialog (so the fields are reachable, not dead markup)', !!add);
    click(add); await settle();
    ok('the dialog opens as “New account” and shows the two news fields', modal().textContent.includes('New account') && !!w.U.$('#a-news-before', modal()) && !!w.U.$('#a-news-after', modal()));
    ok('a new account is offered the shipped defaults 15 / 45, not one number and not an empty box', w.U.$('#a-news-before', modal()).value === '15' && w.U.$('#a-news-after', modal()).value === '45');
    ok('the inputs’ own bounds match the server’s: the block 1–240, the settle 30–240 (the floor is the same in both places)', w.U.$('#a-news-before', modal()).getAttribute('min') === '1' && w.U.$('#a-news-before', modal()).getAttribute('max') === '240' && w.U.$('#a-news-after', modal()).getAttribute('min') === '30' && w.U.$('#a-news-after', modal()).getAttribute('max') === '240');
    ok('the two labels name the SIDE each number governs, so they cannot be read as one symmetric window', /minutes BEFORE a release/.test(src) && /minutes AFTER a release/.test(src));

    const posts = () => calls.filter((c) => c.url === '/api/accounts' && c.method === 'POST');
    type(w.U.$('#a-name', modal()), 'M110 UI desk');
    type(w.U.$('#a-news-after', modal()), '20');
    click(saveBtn()); await settle();
    ok('a settle below the floor is refused in the dialog with the floor named, and nothing is sent to the server', posts().length === 0 && /30 to 240/.test(lastToast().text) && lastToast().type === 'err' && modal().textContent.includes('New account'), lastToast());
    type(w.U.$('#a-news-after', modal()), '45'); type(w.U.$('#a-news-before', modal()), '0');
    click(saveBtn()); await settle();
    ok('a block under 1 minute is refused too, and still nothing is sent', posts().length === 0 && /1 to 240/.test(lastToast().text) && lastToast().type === 'err');
    type(w.U.$('#a-news-before', modal()), '5');
    click(saveBtn()); await settle();
    ok('a value he actually sanctions (5) is accepted by the dialog and sent as 5, never rewritten to 15 and never spread onto the settle', posts().length === 1 && JSON.parse(posts()[0].body).news_block_before_min === '5' && JSON.parse(posts()[0].body).news_settle_after_min === '45', posts());
    const sent = Object.keys(JSON.parse(posts()[0].body));
    ok('and the payload has both keys and no third news key, so the single-knob shape cannot come back through the UI', sent.filter((k) => /news/.test(k)).length === 2 && sent.includes('news_block_before_min') && sent.includes('news_settle_after_min'));
    ok('saving closes the dialog and reports success once', !modal() && /Account saved/.test(lastToast().text) && lastToast().type === 'ok');
    const stored = (await w.API.get('/accounts')).accounts.find((a) => a.name === 'M110 UI desk');
    ok('the server stored that pair for this account, so the dialog and the engine read the same two numbers', stored.news_block_before_min === 5 && stored.news_settle_after_min === 45, stored);

    await w.Views.settings.render(root); await settle();
    const editBtn = root.querySelector(`button[data-aedit="${stored.id}"]`);
    ok('the pane offers an edit action per account, addressed by the account’s own id', !!editBtn && root.querySelectorAll('button[data-aedit]').length >= 2, !!editBtn);
    click(editBtn); await settle();
    ok('editing that account reopens the dialog with the STORED pair (5 / 45), not the schema defaults — a saved value is not silently reset on the next open', w.U.$('#a-news-before', modal()).value === '5' && w.U.$('#a-news-after', modal()).value === '45', { before: w.U.$('#a-news-before', modal()).value, after: w.U.$('#a-news-after', modal()).value });
    ok('the edit dialog is titled as an edit, so the pair above is not read as a new-account default', modal().textContent.includes('Edit account'));

    const puts = () => calls.filter((c) => /^\/api\/accounts\/\d+$/.test(c.url) && c.method === 'PUT');
    type(w.U.$('#a-news-after', modal()), '60');
    click(saveBtn()); await settle();
    const put = JSON.parse(puts()[puts().length - 1].body);
    ok('raising only the settle sends the untouched block (5) alongside it — the two clocks travel together and neither is inferred', puts().length === 1 && put.news_settle_after_min === '60' && put.news_block_before_min === '5', put);
    const after60 = (await w.API.get('/accounts')).accounts.find((a) => a.id === stored.id);
    ok('the raised settle is what the account now carries, and the block did not move', after60.news_settle_after_min === 60 && after60.news_block_before_min === 5, after60);

    await w.Views.settings.render(root); await settle();
    click(root.querySelector(`button[data-aedit="${stored.id}"]`)); await settle();
    ok('the edit dialog for that account still shows 5 / 60 after a re-render, so a reload does not re-derive the pair', w.U.$('#a-news-before', modal()).value === '5' && w.U.$('#a-news-after', modal()).value === '60', { before: w.U.$('#a-news-before', modal()).value, after: w.U.$('#a-news-after', modal()).value });
    type(w.U.$('#a-name', modal()), 'M110 UI desk renamed');
    click(saveBtn()); await settle();
    const renamed = (await w.API.get('/accounts')).accounts.find((a) => a.id === stored.id);
    ok('renaming the account through the same dialog leaves both clocks exactly where they were', renamed.name === 'M110 UI desk renamed' && renamed.news_block_before_min === 5 && renamed.news_settle_after_min === 60, renamed);
    ok('no uncaught error was raised by any interaction, and nothing was rendered through innerHTML', errors.length === 0, errors);
  } finally { if (dom) dom.window.close(); }
});
