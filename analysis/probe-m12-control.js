'use strict';
/** M12 control: what the fault IS on the tree being measured, said in counts rather than adjectives.
 *
 * The milestone's claim is narrow: the guardrail audit is already written, and what no surface does
 * is answer "how many rule breaks were recorded, by rule". This probe measures exactly that, on
 * whichever tree it is pointed at via TJ_APP:
 *
 *   M12_CONTROL_MODE=parent      the committed 67f2ed2 M112 release — the release being fixed
 *   M12_CONTROL_MODE=tally-only  that release plus `src/rule-breaks.js` and nothing else: the
 *                                aggregation EXISTS and no surface can reach it
 *   M12_CONTROL_MODE=delivered   the delivered tree
 *
 * A tree that ships the module and does not serve it is the measured control, so the negative here
 * is a count (0 readers, 0 mounts) and never a crash. The audit's own reader modules are named, so
 * the "nothing reads these rows" story cannot be told loosely: three modules DO read them as process
 * evidence, and none of them tallies a break by rule. */
const fs = require('fs'), path = require('path');
const H = require('./m12-test-support'), { ok } = H;
const MODE = process.env.M12_CONTROL_MODE || 'delivered';
const SRC = path.join(H.APP, 'src'), PUB = path.join(H.APP, 'public');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p); } return out; };
const rel = (p) => path.relative(H.APP, p).split(path.sep).join('/');
const filesContaining = (dir, token) => walk(dir).filter((f) => fs.readFileSync(f, 'utf8').includes(token)).map(rel).sort();
const filesNamingCard = (dir) => [...new Set([...filesContaining(dir, 'rule-breaks'), ...filesContaining(dir, 'ruleBreaks')])].sort();
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';

H.finish(`M12 control (${MODE}): the fault the delivered tree closes`, async () => {
  const u = await H.start('M12 control ' + MODE);
  const desk = await H.account(u, 'M12 control desk');
  const events = H.audit(u.user.userId, desk.id, [{ date: '2026-10-07', kind: 'blocked_attempt', rule: 'trade_cap', reason: 'cap' }]);

  /* 1. Does the tree ship the aggregation at all? */
  let module = null; try { module = H.mod('src/rule-breaks'); } catch { }
  ok('the tree ships the rule-break tally module itself', H.m12(module) === (MODE !== 'parent') && (H.m12(module) ? module.VERSION === H.M12_VERSION : true), { mode: MODE, version: module && module.VERSION });

  /* 2. Can any surface reach it? The endpoint the review already reads either carries the tally or it
   * does not — measured from the wire, on the delivered tree with an audit row actually written. */
  const an = (await H.analytics(u, '?account_id=' + desk.id)).data || {};
  const carried = !!an.rule_breaks;
  ok('the analytics payload the review reads carries `rule_breaks` exactly when the tree serves it', carried === (MODE === 'delivered'), { mode: MODE, keys: Object.keys(an).filter((k) => /rule|break/i.test(k)) });
  ok('a carried tally is attached for the account actually being analysed, and it counted the written row', !carried || (Array.isArray(an.rule_breaks.account_ids) && an.rule_breaks.account_ids.includes(an.account && an.account.id) && an.rule_breaks.breaks === 1 && an.rule_breaks.by_rule.some((r) => r.rule === 'trade_cap')), carried ? { ids: an.rule_breaks.account_ids, account: an.account && an.account.id, breaks: an.rule_breaks.breaks } : null);

  /* 3. Can a trader see it? The card file, the page load and the mount are three separate facts. */
  const card = path.join(PUB, 'js/views/rule-breaks.js'), html = read(path.join(PUB, 'index.html')), view = read(path.join(PUB, 'js/views/analytics.js'));
  const shown = fs.existsSync(card) && /views\/rule-breaks\.js/.test(html) && /Views\.ruleBreaks\.card/.test(view);
  ok('the review can DISPLAY it: the card exists, the page loads it and the analytics view mounts it (three separate facts, all required)', shown === (MODE === 'delivered'), { file: fs.existsSync(card), loaded: /views\/rule-breaks\.js/.test(html), mounted: /Views\.ruleBreaks\.card/.test(view) });

  /* 4. The fault itself, in counts. `by_rule` is the vocabulary the tally introduces; on the release
   * being fixed NOTHING in the shipped app has it, and the audit's reader list names what does read
   * the rows (as process evidence, not as breaks). */
  const byRule = filesContaining(SRC, 'by_rule'), breaksShown = filesNamingCard(PUB);
  ok('the per-rule tally is a vocabulary this milestone introduces: no shipped source of the parent has `by_rule`, and the delivered tree has it in exactly the module', byRule.length === (MODE === 'parent' ? 0 : 1) && (MODE === 'parent' || byRule[0] === 'src/rule-breaks.js'), { mode: MODE, by_rule: byRule });
  ok('no served file names a rule-break tally on the parent, and the delivered tree names it in exactly the three files that surface it (card, mount, page load)', breaksShown.length === (MODE === 'delivered' ? 3 : 0), { mode: MODE, ruleBreaks: breaksShown });
  const readers = filesContaining(SRC, 'FROM guardrail_events');
  const inherited = readers.filter((r) => r !== 'src/rule-breaks.js');
  ok('the rows are already read as process evidence by named modules — the gap is the per-rule tally, not the storage', inherited.length >= 4 && inherited.includes('src/bots/guardrails.js') && inherited.includes('src/behavior-days.js') && inherited.includes('src/period-reviews.js') && inherited.includes('src/process-outcomes.js') && (MODE === 'parent' ? !readers.includes('src/rule-breaks.js') : readers.includes('src/rule-breaks.js')), { mode: MODE, readers });

  /* 5. The control's own honesty: nothing here writes, and the row this probe wrote is the only one. */
  const rows = await H.auditRows(u.user.userId, desk.id);
  ok('the control writes its own audit row through the app\u2019s own SQL shape and the tree reads it back unchanged', rows.length === events && rows[0].kind === 'blocked_attempt' && rows[0].dedupe_key.includes('blocked_attempt'), { seeded: events, rows: rows.map((r) => r.kind) });
});
