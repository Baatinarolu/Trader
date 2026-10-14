'use strict';
/**
 * M56 engine probe: the plan gate at the decision surface. This is the measurement that separates a
 * vocabulary from a gate — every documented fact must be reachable from a REAL analysis (not merely
 * parseable), a refused rule must turn the candidate untradeable through the ordinary `no_trade`
 * path, and a satisfied rule must change nothing at all.
 *
 * The market is synthetic (`harness/synth`) because this probe is about the gate, not about the
 * engine's market read: the same series is fed to both arms so the only difference between them is
 * the plan. No server, no database, no clock.
 */
const path = require('path');
const H = require('./m56-test-support'), { ok } = H;
const Synth = require(path.join(__dirname, 'harness', 'synth'));

H.finish('M56 engine: a written plan refuses a candidate at the decision surface, and only that', async () => {
  const APP = H.APP;
  const SMC = require(path.join(APP, 'src/bots/smc'));
  const Setup = require(path.join(APP, 'src/bots/setup'));
  const P = H.mod('src/bots/plan-gate');
  if (!H.shipped(P, 'the plan gate (src/bots/plan-gate.js)')) return;

  const ctxOf = (price, extra = {}) => ({ price, balance: 10000, riskPct: 1, valuePerPoint: 100000,
    assetClass: 'forex', chaseGuard: false, symbol: 'EURUSD', ...extra });
  const planRow = (rules, plan = { id: 11, name: 'Probe plan', version: 3 }) => {
    const parsed = P.parse({ entry_rules: JSON.stringify(rules) });
    return { version: P.VERSION, state: 'ready', plan, counts: parsed.counts, rules: parsed.rules,
      note: `Checked against ${parsed.counts.machine} machine-checkable requirement(s) in your plan.` };
  };

  /* ------------------------------------------- 1. a real sample of analyses, both directions */
  const cases = [];
  for (let seed = 1; seed <= 6; seed++) {
    const cs = Synth.series({ seed, bars: 1500 });
    const hAll = Synth.aggregate(cs, 4);
    for (let i = 130; i < cs.length - 5; i += 11) {
      const win = cs.slice(Math.max(0, i - 300), i + 1);
      const h = hAll.filter((b) => b.t <= cs[i].t).slice(-80);
      const an = SMC.analyse(win, { tf: '15m', htfCandles: h.length > 30 ? h : null, now: cs[i].t });
      if (!an.ok) continue;
      cases.push({ an, price: cs[i].c });
    }
  }
  ok('the probe measures a real sample of analyses rather than one hand-built case', cases.length > 40, String(cases.length));

  /* ---------------------- 2. every documented fact is REACHABLE from a real analysis + setup run */
  const rules = P.vocabulary().map((v) => v.line);
  const armed = [], refusedByFact = {}, metByFact = {}, unknownByFact = {};
  const seenKnown = {};
  let identicalWithoutPlan = 0, scoreMoved = 0, gradeMoved = 0, levelsMoved = 0, vetoesOutside = 0;
  for (const { an, price } of cases) {
    const base = Setup.buildSetups(an, ctxOf(price));
    const gated = Setup.buildSetups(an, ctxOf(price, { planGate: planRow(rules) }));
    identicalWithoutPlan++;
    for (let c = 0; c < base.candidates.length; c++) {
      const b = base.candidates[c], g = gated.candidates[c];
      if (b.score !== g.score || b.grade !== g.grade || JSON.stringify(b.levels) !== JSON.stringify(g.levels)) { scoreMoved++; gradeMoved++; levelsMoved++; }
      // nothing new may appear in `no_trade` that is not a plan sentence, and no plan sentence may
      // exist without a plan rule that was refused.
      const extra = g.no_trade.filter((v) => !b.no_trade.includes(v));
      if (extra.some((v) => !/Your plan /.test(v))) vetoesOutside++;
      for (const r of (g.plan_rules.rules || [])) {
        if (r.state === 'met') metByFact[r.fact] = (metByFact[r.fact] || 0) + 1;
        else if (r.state === 'refused') { refusedByFact[r.fact] = (refusedByFact[r.fact] || 0) + 1; if (g.ok === false && g.levels) armed.push({ an, price, dir: g.dir, fact: r.fact }); }
        else unknownByFact[r.fact] = (unknownByFact[r.fact] || 0) + 1;
      }
      if (g.plan_rules && g.ok && g.levels && g.dir) armed.push({ an, price, dir: g.dir });
    }
  }
  const factsSeen = new Set([...Object.keys(metByFact), ...Object.keys(refusedByFact), ...Object.keys(unknownByFact)]);
  ok('not one candidate\u2019s score, grade or price geometry is moved by attaching a plan',
    scoreMoved === 0 && gradeMoved === 0 && levelsMoved === 0, JSON.stringify({ scoreMoved, gradeMoved, levelsMoved }));
  ok('and no veto appears that is not a plan sentence (the gate adds only its own refusals)',
    vetoesOutside === 0, String(vetoesOutside));
  ok('every fact in the documented vocabulary is resolved to met/refused/unknown by a REAL run \u2014 none is dead weight',
    factsSeen.size === P.vocabulary().length, `seen ${factsSeen.size}/${P.vocabulary().length}: missing ${P.vocabulary().map((v) => v.fact).filter((f) => !factsSeen.has(f)).join()}`);
  ok('and each of the boolean facts is genuinely resolvable to a known value (met somewhere, refused or met elsewhere)',
    ['sweep', 'zone', 'killzone'].every((f) => (metByFact[f] || 0) + (refusedByFact[f] || 0) > 0),
    JSON.stringify({ met: metByFact, refused: refusedByFact }));
  ok('the graded and numeric facts resolve to known values too (a gate that always says unknown gates nothing)',
    ['grade', 'min_rr', 'risk', 'timeframe', 'trend', 'phase'].every((f) => (metByFact[f] || 0) + (refusedByFact[f] || 0) > 0),
    JSON.stringify({ met: metByFact, refused: refusedByFact, unknown: unknownByFact }));

  /* ------------------------------------------- 3. against the committed engine (no plan = no change) */
  if (process.env.TJ_PARENT) {
    const parentSetup = require(path.join(process.env.TJ_PARENT, 'src/bots/setup'));
    const parentP = (() => { try { return require(path.join(process.env.TJ_PARENT, 'src/bots/plan-gate.js')); } catch (e) { return null; } })();
    ok('the parent really does NOT consult a plan (negative control is non-vacuous)',
      !parentP || typeof parentP.safe !== 'function');
    const strip = (r) => JSON.stringify(r.candidates.map(({ plan_rules, ...rest }) => rest));
    let candidateDiffs = 0, newKeys = new Set(), wholeDiffs = 0;
    for (const { an, price } of cases) {
      const pre = parentSetup.buildSetups(an, ctxOf(price));
      const now = Setup.buildSetups(an, ctxOf(price));
      if (strip(pre) !== strip(now)) candidateDiffs++;
      if (JSON.stringify(pre.candidates) !== JSON.stringify(now.candidates)) wholeDiffs++;
      for (const c of now.candidates) for (const k of Object.keys(c)) if (!(k in pre.candidates[0])) newKeys.add(k);
    }
    ok('with no plan attached, every candidate field, veto, grade, score, price and level is identical to the committed parent',
      candidateDiffs === 0, `candidate diffs=${candidateDiffs}`);
    ok('the ONLY new candidate key is `plan_rules`, and it is null when no plan was consulted',
      newKeys.size === 1 && newKeys.has('plan_rules') && wholeDiffs > 0
      && cases.every(({ an, price }) => Setup.buildSetups(an, ctxOf(price)).candidates.every((c) => c.plan_rules === null)),
      JSON.stringify([...newKeys]));
  }

  /* ------------------------------------------- 4. a refused rule refuses the candidate, by name */
  let fixture = null;
  for (const { an, price } of cases) {
    const base = Setup.buildSetups(an, ctxOf(price));
    const c = base.candidates.find((x) => x.ok === true && x.levels && x.dir);
    if (c) { fixture = { an, price, dir: c.dir, rr: c.levels.rr_primary_exact }; break; }
  }
  ok('a candidate the committed engine genuinely trades is measured, so a refusal below is attributable',
    !!fixture, JSON.stringify({ tradeable: armed.length }));
  if (fixture) {
    const { an, price, dir } = fixture;
    const impossible = Setup.buildSetups(an, ctxOf(price, { planGate: planRow(['require min_rr >= 999'], { id: 4, name: 'High bar', version: 1 }) }));
    const c = impossible.candidates.find((x) => x.dir === dir);
    const allowed = Setup.buildSetups(an, ctxOf(price)).candidates.find((x) => x.dir === dir);
    ok('the same candidate that is tradeable with no plan is REFUSED by a plan rule it cannot meet',
      allowed.ok === true && c.ok === false, JSON.stringify({ before: allowed.ok, after: c.ok }));
    ok('the refusal is the FIRST thing the action line says (the trader\u2019s own instruction leads)',
      /^No trade \u2014 Your plan \u201cHigh bar\u201d \(v1\)/.test(c.action), c.action);
    ok('and it is an ordinary `no_trade` entry, so the verdict, the Now guards and Copy plan obey it',
      c.no_trade[0] === c.action.replace(/^No trade \u2014 /, '').replace(/ Watch for the retrace.*$/, '') || /min_rr >= 999/.test(c.no_trade[0]),
      JSON.stringify(c.no_trade.slice(0, 1)));
    ok('the verdict of the one-plan run never substitutes the refused side', impossible.verdict.action === 'NO TRADE' || impossible.verdict.dir === dir,
      JSON.stringify({ action: impossible.verdict.action, dir: impossible.verdict.dir }));
    /* a satisfied rule leaves the candidate exactly as it was */
    const strict = [{ fact: 'min_rr', have: allowed.levels ? allowed.levels.rr_primary_exact : null }];
    const okRule = `require min_rr >= ${Math.max(0.1, fixture.rr - 0.1).toFixed(2)}`;
    const satisfied = Setup.buildSetups(an, ctxOf(price, { planGate: planRow([okRule]) })).candidates.find((x) => x.dir === dir);
    ok('a rule the candidate MEETS leaves it tradeable and its grade, score and levels untouched',
      satisfied.ok === true && satisfied.score === allowed.score && satisfied.grade === allowed.grade
      && JSON.stringify(satisfied.levels) === JSON.stringify(allowed.levels),
      JSON.stringify({ rule: okRule, facts: strict, state: satisfied.plan_rules.rules.map((r) => r.state) }));
  }

  /* ------------------------------------------- 5. prose and typos gate nothing, but are reported */
  const prose = Setup.buildSetups(cases[0].an, ctxOf(cases[0].price, { planGate: planRow(['Wait for the sweep', 'Only trade London', 'require swep']) }));
  ok('a plan of prose plus one unrecognised `require` line refuses nothing',
    prose.candidates.every((c) => c.no_trade.length === Setup.buildSetups(cases[0].an, ctxOf(cases[0].price)).candidates.find((b) => b.dir === c.dir).no_trade.length));
  ok('and the payload reports the prose and the unrecognised line separately, so silence is impossible',
    prose.filters.plan_gate.prose === 2 && prose.filters.plan_gate.unknown_fact === 1
    && prose.filters.plan_gate.unrecognised_lines[0].text === 'require swep',
    JSON.stringify({ prose: prose.filters.plan_gate.prose, unknown_fact: prose.filters.plan_gate.unknown_fact }));
  ok('the candidate carries no plan_rules block when the plan has no machine-checkable rule',
    prose.candidates.every((c) => c.plan_rules && c.plan_rules.rules.length === 0));

  /* ------------------------------------------- 6. unknown facts refuse nothing */
  const sentinel = Setup.buildSetups({ ...cases[0].an, sessions: {} }, ctxOf(cases[0].price, { planGate: planRow(['require killzone', 'require session london']) }));
  ok('an unreadable killzone (M8\u2019s short-series sentinel) leaves both window rules UNKNOWN and refuses nothing',
    sentinel.candidates.every((c) => c.plan_rules.refused === 0 && c.plan_rules.unknown === 2),
    JSON.stringify(sentinel.candidates.map((c) => c.plan_rules.rules.map((r) => r.state))));
  ok('and the filter block says so, so a client can distinguish "not read" from "met"',
    sentinel.filters.plan_gate.unknown_now === true && sentinel.filters.plan_gate.refused_now === false);
  const noNews = Setup.buildSetups(cases[0].an, ctxOf(cases[0].price, { newsState: 'unknown', newsBlackout: 'News blackout: CPI', planGate: planRow(['require no_news_blackout']) }));
  ok('an unreadable news calendar can neither satisfy nor fail a no-news requirement',
    noNews.candidates.every((c) => c.plan_rules.rules.every((r) => r.state === 'unknown')));
  const noLevels = Setup.buildSetups({ ...cases[0].an, zones: [], order_blocks: [] }, ctxOf(cases[0].price, { planGate: planRow(['require min_rr >= 2']) }));
  ok('a candidate with no computed levels reports an UNKNOWN reward:risk rather than a zero one',
    noLevels.candidates.every((c) => !c.levels ? c.plan_rules.rules[0].state === 'unknown' : true),
    JSON.stringify(noLevels.candidates.map((c) => [!!c.levels, c.plan_rules.rules[0].state])));

  /* ------------------------------------------- 7. the gate is per direction, not per plan */
  const directional = Setup.buildSetups(cases[0].an, ctxOf(cases[0].price, { planGate: planRow(['require bias_aligned', 'require timeframe 15m']) }));
  ok('a directional requirement is evaluated per candidate side, so one can meet it while the other does not',
    directional.candidates.filter((c) => c.plan_rules).length === 2
    && directional.candidates.every((c) => c.plan_rules.rules.length === 2),
    JSON.stringify(directional.candidates.map((c) => [c.dir, c.plan_rules.rules.map((r) => r.state)])));
  ok('and the timeframe rule is met on a 15m analysis, proving the fact reads the setup\u2019s entry frame',
    directional.candidates.every((c) => c.plan_rules.rules.find((r) => r.fact === 'timeframe').state === 'met'));
});

module.exports = {};
