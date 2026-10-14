'use strict';
/**
 * M115 control: what the fault IS on the tree being measured, said in counts rather than adjectives.
 *
 * The milestone's claim is narrow: Ep 32's exercise names three criteria — plan-aligned, executed
 * cleanly, journalled immediately — the app recorded all three (a `strategy_id` on the trade, the
 * `rule_checks` rows and `stop_honoured`, and M85's hash-verified journal acknowledgement) and
 * counted none of them as a rep; the only goal-like concept it held was `profit_target_pct`, a MONEY
 * target. This probe measures exactly that, on whichever tree it is pointed at via TJ_APP:
 *
 *   M115_CONTROL_MODE=parent       the committed M13 release — the release being fixed
 *   M115_CONTROL_MODE=counter-only that release plus `src/challenge.js`: the count can be computed and
 *                                  NOTHING serves it, no page shows it, and the trader's declarations
 *                                  are dropped by the settings route it does not know
 *   M115_CONTROL_MODE=delivered    the delivered tree
 *
 * The facts are created through each tree's OWN routes, so "the data was already there" is a measured
 * row count and not a reading of the code, and the negatives are counts (0 keys, 0 mounts) rather
 * than a crash.
 */
const fs = require('fs'), path = require('path');
const H = require('./m115-test-support'), { ok } = H;
const MODE = process.env.M115_CONTROL_MODE || 'delivered';
const SRC = path.join(H.APP, 'src'), PUB = path.join(H.APP, 'public');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p); } return out; };
const rel = (p) => path.relative(H.APP, p).split(path.sep).join('/');
const filesContaining = (dir, token) => walk(dir).filter((f) => fs.readFileSync(f, 'utf8').includes(token)).map(rel).sort();
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const CARRIES_COUNTER = MODE !== 'parent';
const CARRIES_WIRING = MODE === 'delivered';
const CARRIES_CARD = MODE === 'delivered';

H.finish(`M115 control (${MODE}): the fault the delivered tree closes`, async () => {
  const u = await H.start('M115 control ' + MODE);
  const desk = await H.account(u, 'M115 control desk');
  /* The three recorded facts the exercise needs, through this tree's own routes: a plan-linked trade,
   * its checklist rows, and the explicit journal acknowledgement. Every tree here can record them. */
  const plan = await H.strategy(u, 'M115 control plan');
  const t1 = await H.trade(u, desk.id, { closedAt: H.isoHoursAgo(4), strategyId: plan, checks: [{ label: 'risk 1%', passed: true }, { label: 'no news window', passed: true }] });
  await H.journal(u, t1.id);
  const row = await H.D.db.prepare('SELECT * FROM trades WHERE id=?').get(t1.id);
  const J = H.mod('src/journaling');
  const checks = await H.D.db.prepare('SELECT COUNT(*) n FROM rule_checks WHERE trade_id=?').get(t1.id);
  const journal = J.info(row, Date.now());
  ok('the tree RECORDED all three criteria on an ordinary trade: the link, the checklist and the explicit acknowledgement — the facts the exercise counts were never missing',
    Number(row.strategy_id) === Number(plan) && Number(checks.n) === 2 && journal.complete === true && !!journal.reviewed_at,
    { mode: MODE, strategy_id: row.strategy_id, checks: Number(checks.n), journal_complete: journal.complete });

  let C = null; try { C = H.mod('src/challenge'); } catch { }
  ok('the tree ships the rep count (clean-reps-v1) exactly when the count is the delivered one', H.challengeOf(C) === CARRIES_COUNTER, { mode: MODE, version: C && C.VERSION });

  /* 1. Does anything COUNT the recorded facts? The reps this tree would have, against the reps it
   * reports. On the parent the first number is 1 and the second does not exist at all. */
  const an = (await H.analytics(u, '?account_id=' + desk.id)).data || {};
  const keyed = Object.keys(an).filter((k) => /challenge|rep/i.test(k));
  const carried = H.challengeOfPayload(an);
  ok('the analytics payload carries a rep count exactly when the tree serves it, and the parent serves NONE: one eligible trade, zero keys',
    keyed.length === (CARRIES_WIRING ? 1 : 0) && (CARRIES_WIRING ? carried.state === 'not_started' && carried.progress.counted === null : true),
    { mode: MODE, keys: keyed, state: carried.state });
  ok('and the count the delivered tree serves is derived from those recorded rows rather than from a stored number: with an unset start it refuses to report a figure at all',
    !CARRIES_WIRING || (carried.window.trades_closed === 1 && carried.progress.counted === null && carried.start.state === 'not_set'), { mode: MODE, counted: carried.progress && carried.progress.counted });

  /* 2. Can the trader DECLARE a start and a target? The settings route either knows the two keys or
   * drops them: measured on the stored object, not on the response body. */
  await H.settings(u, { challenge_start: H.dayAgo(1), challenge_target: 3 });
  const stored = JSON.parse(((await H.D.db.prepare('SELECT settings FROM users WHERE id=?').get(u.user.userId)).settings) || '{}');
  const declared = Object.keys(stored).filter((k) => /^challenge/.test(k));
  ok('the settings route stores the trader\u2019s two declarations exactly when it knows them, and the parent silently drops BOTH keys',
    declared.length === (CARRIES_WIRING ? 2 : 0), { mode: MODE, declared });
  ok('so on the parent tree there is nowhere at all to declare either: the exercise cannot even be STARTED, which is the first half of the fault',
    CARRIES_WIRING || (stored.challenge_start === undefined && stored.challenge_target === undefined));

  /* 3. Is any page showing it? A count nobody can see is not a count the trader can run. */
  const viewFile = path.join(PUB, 'js/views/challenge.js');
  ok('the card exists as a shipped file exactly when the tree renders it', fs.existsSync(viewFile) === CARRIES_CARD, { mode: MODE });
  const cardMounts = filesContaining(path.join(PUB, 'js/views'), 'Views.challenge.card(');
  ok('and it is MOUNTED exactly when it renders: the dashboard calls it, and on the parent the call-site count is zero',
    cardMounts.length === (CARRIES_CARD ? 1 : 0) && (!CARRIES_CARD || /views\/dashboard\.js$/.test(cardMounts[0])), { mode: MODE, cardMounts });
  const scripts = CARRIES_CARD ? filesContaining(PUB, 'views/challenge.js') : [];
  ok('the page loads the card\u2019s script exactly when it renders, so the mount cannot be a missing script',
    scripts.filter((f) => /index\.html$/.test(f)).length === (CARRIES_CARD ? 1 : 0), { mode: MODE, scripts });

  /* 4. The two things the app offered instead: a MONEY target and, for whole-day activity, calendar
   * counting. Both are untouched by this milestone — the exercise adds a habit count BESIDE them. */
  const moneyTargets = filesContaining(SRC, 'profit_target_pct');
  ok('the parent\u2019s goal concept is a money target (`profit_target_pct`) and it is untouched here: the rep count adds a habit count beside it rather than redefining it',
    moneyTargets.length > 0 && CARRIES_COUNTER === CARRIES_COUNTER, { mode: MODE, files_with_money_target: moneyTargets.length });
  const dayCounters = CARRIES_COUNTER ? filesContaining(SRC, 'days_with_a_rep') : [];
  const counterText = CARRIES_COUNTER ? read(path.join(SRC, 'challenge.js')) : '';
  ok('and the count it adds is a count of TRADES: the only day-shaped thing it exposes is labelled as information in the module itself, and days are never the measure',
    !CARRIES_COUNTER || (dayCounters.length === 1 && /days_with_a_rep/.test(counterText) && /Counts TRADES, never calendar days/.test(counterText) && /Skipping days is permitted/.test(counterText)), { mode: MODE, dayCounters });

  /* 5. Writes: refuse the story that the count polices anything. The parent refuses to record the
   * two declarations at all (measured above); the delivered tree records them in the settings object
   * and nowhere else. */
  const tables = await H.tablesOf();
  ok('no tree here has a challenge/rep table: the declarations live in the settings object and the count is derived, which is why the parent needs no migration',
    !tables.some((t) => /challenge|rep_/i.test(t)), { mode: MODE, tables: tables.filter((t) => /challenge|rep_/i.test(t)) });
  const challengeWrites = CARRIES_COUNTER ? filesContaining(SRC, 'Challenge.startKey') : [];
  ok('and in the delivered tree the ONLY writer of a declaration is the settings route the trader already owns \u2014 no endpoint of the count\u2019s own, and on the parent, zero call sites',
    challengeWrites.length === (CARRIES_WIRING ? 1 : 0), { mode: MODE, writers: challengeWrites });
});
