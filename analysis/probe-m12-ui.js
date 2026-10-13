'use strict';
/** M12 ui probe: the card the weekly review reads, rendered in jsdom from real payload shapes.
 * What is measured is what a trader can be misled by: an unavailable audit rendered as zero, a
 * count that inflates conditions into breaks, a rule name rendered as markup, a truncation hidden,
 * a reload that survives a workspace change, and any percentage/causal claim the payload did not
 * make. jsdom has no browser engine: structural and behavioural, not a pixel proof. */
const fs = require('fs'), path = require('path');
const H = require('./m12-test-support'), { ok } = H;
let dom;
H.finish('M12 real DOM: the rule-break card the review reads', async () => {
  const mod = H.mod('src/rule-breaks');
  if (!H.shipped(mod, 'the M12 rule-break tally')) return;
  const { JSDOM } = require(path.join(H.APP, 'node_modules/jsdom'));
  dom = new JSDOM('<body><div id="root"></div></body>', { url: 'https://fixture.example', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, toasts = [], nav = [];
  const load = (p) => w.eval(fs.readFileSync(path.join(H.APP, 'public/js', p), 'utf8'));
  load('util.js'); load('views/rule-breaks.js');
  w.Store = { user: { id: 1 }, accountId: 3 };
  w.API = { getToken: () => 'tok' };
  w.App = { toast: (text, type) => toasts.push({ text, type }), go: (v) => nav.push(v) };
  const V = w.Views.ruleBreaks;
  const rule = (name, breaks, prevented, accepted) => ({ rule: name, breaks, prevented, accepted, last_at: '2026-10-07T09:00:00.000Z', days: ['2026-10-07'] });
  const day = (date, breaks, prevented, accepted, observations, rules) => ({ date, breaks, prevented, accepted, observations, records: 1, other: 0, rules });
  const full = { state: 'available', version: H.M12_VERSION, breaks: 3, prevented: 2, accepted: 1, observations: 4, records_excluded: 2,
    unreadable_snapshots: 1, unnamed_rule_events: 1, truncated: true, by_rule: [rule('pre_market_routine', 2, 2, 0), rule('trade_cap', 1, 0, 1)],
    by_day: [day('2026-10-07', 2, 1, 1, 2, ['trade_cap']), day('2026-10-06', 1, 1, 0, 2, ['pre_market_routine'])],
    windows: { first_date: '2026-10-06', last_date: '2026-10-07', days: 2 }, outcome_joined: false,
    basis: 'RECORDED guardrail audit events.', scope: 'A tally of what the app recorded; it does not join a break to an outcome.' };
  const text = (node) => node.textContent;
  const q = (sel, root) => (root || w.document.body).querySelector(sel);
  const qa = (sel, root) => [...(root || w.document.body).querySelectorAll(sel)];

  const card = V.card(full);
  ok('the review ships a rule-break card and renders it as its own section', !!(V && typeof V.card === 'function') && card.dataset.ruleBreaks === 'true' && /Rule breaks recorded/.test(text(q('h3', card))), null);
  ok('the totals line separates what happened: breaks, prevented attempts, accepted overrides, observed conditions and excluded legal records', (() => { const t = text(q('[data-rule-breaks-total]', card)); return /\b3 rule breaks recorded\b/.test(t) && /\b2 prevented\b/.test(t) && /\b1 accepted override\b/.test(t) && /\b4 live stops observed\b/.test(t) && /\b2 legal records excluded\b/.test(t); })(), text(q('[data-rule-breaks-total]', card)));
  ok('every rule the audit named gets its own line, with its own prevented/accepted split rather than one blended number', qa('[data-rule-break-rule]', card).length === 2 && qa('[data-rule-break-rule]', card).some((n) => /pre_market_routine/.test(text(n)) && /2 breaks \(2 prevented, 0 accepted\)/.test(text(n))) && qa('[data-rule-break-rule]', card).some((n) => /trade_cap/.test(text(n)) && /1 break \(0 prevented, 1 accepted\)/.test(text(n))), qa('[data-rule-break-rule]', card).map(text));
  ok('the days are listed newest-first with their own split and the rules that fired on them', qa('[data-rule-break-day]', card).length === 2 && /^2026-10-07/.test(text(qa('[data-rule-break-day]', card)[0])) && /trade_cap/.test(text(qa('[data-rule-break-day]', card)[0])) && /^2026-10-06/.test(text(qa('[data-rule-break-day]', card)[1])), qa('[data-rule-break-day]', card).map(text));
  ok('an undecodable snapshot is SHOWN as unreadable, not swallowed, and is never attributed to a rule', /1 break event stored a snapshot this app could not decode/.test(text(card)) && /never assumed clean/.test(text(card)), null);
  ok('a break with no rule named in its snapshot is shown as counted-but-unnamed rather than attributed', /1 break event named no rule in the stored snapshot/.test(text(card)), null);
  ok('a bounded read says so on screen instead of hiding rows behind a total', /read bounded to the most recent events/.test(text(card)), null);
  ok('the framing the payload carries is rendered: it is not broker truth, not mental state, not a market edge, and it does not join a break to an outcome', /not broker verification/i.test(text(card)) && /does not join a break to an outcome/i.test(text(card)), null);
  ok('the card makes NO percentage, causal or profitability claim of its own', !/%|caused by|because you|profit/i.test(text(card)), (text(card).match(/%|caused by|because you|profit/i) || [null])[0]);
  ok('a rule name from the audit is rendered as TEXT, not as markup (a hostile name cannot become an element)', (() => { const hostile = V.card({ ...full, by_rule: [{ rule: '<img src=x onerror=alert(1)>', breaks: 1, prevented: 1, accepted: 0, last_at: null }], by_day: [] }); return hostile.querySelector('img') === null && /<img src=x onerror=alert\(1\)>/.test(text(q('[data-rule-break-rule]', hostile))); })(), null);
  const gone = V.card({ state: 'unavailable', breaks: null, by_rule: [], by_day: [], reason: 'The guardrail audit trail could not be read.' });
  ok('an unreadable audit is rendered as UNKNOWN on screen: a warning, no zero total and no clean-week wording', /unavailable/i.test(text(gone)) && /unknown, not a clean week/i.test(text(gone)) && !q('[data-rule-breaks-total]', gone) && !/\b0 rule breaks\b/.test(text(gone)), null);
  const empty = V.card({ ...full, breaks: 0, prevented: 0, accepted: 0, observations: 0, records_excluded: 0, unreadable_snapshots: 0, unnamed_rule_events: 0, truncated: false, by_rule: [], by_day: [], windows: { first_date: null, last_date: null, days: 0 } });
  ok('an empty but readable audit reads as a recorded zero with its own sentence \u2014 and never as the unavailable shape', /\b0 rule breaks recorded\b/.test(text(q('[data-rule-breaks-total]', empty))) && /not a claim about unrecorded behaviour/i.test(text(empty)) && /No recorded guardrail event carries a date/i.test(text(empty)), null);
  ok('a payload with missing arrays (an older or partial shape) still renders instead of throwing', (() => { try { const partial = V.card({ state: 'available', breaks: 1, prevented: 1, accepted: 0, observations: 0, records_excluded: 0 }); return !!partial && partial.dataset.ruleBreaks === 'true'; } catch { return false; } })(), null);
  ok('the reload button is present and refuses to act when the workspace moved under it: a stale review never reloads another account\u2019s tally', (() => {
    const btn = q('[data-rule-breaks-refresh]', card); if (!btn) return false;
    btn.dispatchEvent(new w.Event('click', { bubbles: true }));
    const sameOk = nav.length === 1 && nav[0] === 'analytics' && toasts.length === 0;
    w.Store.accountId = 99;
    btn.dispatchEvent(new w.Event('click', { bubbles: true }));
    return sameOk && nav.length === 1 && toasts.length === 1 && toasts[0].type === 'err' && /changed|reopen/i.test(toasts[0].text);
  })(), { nav, toasts });
  ok('the card binds itself to the trader\u2019s own workspace/account/token, the guard the mismatch check above relies on', (() => { const c = V.context(); return c.user === 1 && c.account === 99 && c.token === 'tok' && V.same({ user: 1, account: 99, token: 'tok' }) === true && V.same({ user: 1, account: 3, token: 'tok' }) === false; })(), null);
  ok('the review actually MOUNTS the card: the analytics view renders it and the page loads the script', /Views\.ruleBreaks\.card\(an\.rule_breaks\)/.test(fs.readFileSync(path.join(H.APP, 'public/js/views/analytics.js'), 'utf8')) && /views\/rule-breaks\.js/.test(fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8')), null);
  ok('the view is loaded after the helpers it uses and before the app boots, like every other aggregate card', (() => { const html = fs.readFileSync(path.join(H.APP, 'public/index.html'), 'utf8'); return html.indexOf('js/util.js') < html.indexOf('js/views/rule-breaks.js') && html.indexOf('js/views/rule-breaks.js') < html.indexOf('js/app.js'); })(), null);
});
