'use strict';
/**
 * plan-gate.js — M56. The written plan as a gate.
 *
 * WHAT WAS MISSING: Ep 16 states the entry criteria as absolute — *"the non-negotiables that must be
 * true before I even think about pressing the buy and sell button. And if every or any of these
 * criteria is not met, I would just not trade… If even just one of these boxes are not being checked,
 * I would still not trade."* The app stored all of it (`strategies.market_conditions`, `timeframes`,
 * `entry_rules`, `exit_rules`, `checklist`, `risk_rules`, `target_r_multiple`) and no bot ever read
 * any of it: the plan was documentation, not a gate. Ep 27 then makes that the load-bearing gap
 * rather than a convenience, because editing the plan is the course's own mechanism for making a
 * change stick — *"bake it into your system because the system is what keeps you consistent"* — and a
 * changed rule that no signal ever consults makes the quarter-long experiment test nothing.
 *
 * WHAT THIS IS: a closed vocabulary of MACHINE-CHECKABLE plan requirements, evaluated against the
 * facts the engine already computes, one rule line at a time. A line the trader writes as
 *
 *     require min_rr >= 2
 *     require killzone
 *     require session london
 *
 * is a HARD requirement: when the fact is known and false, the candidate is refused with a sentence
 * that names the plan, its version and the trader's own rule text. A line that does not start with
 * `require ` is **prose** — it is reported as unverifiable and never blocks, because interpreting
 * free text is inventing an evaluator, and inventing one is how a "gate" starts refusing trades the
 * trader never asked it to refuse. A line that DOES start with `require ` but names a fact outside the
 * vocabulary is reported LOUDLY as an unrecognised requirement: the trader intended a gate, so the
 * engine must never let it pass silently as though it were checked.
 *
 * UNKNOWN IS NEVER A PASS. Every fact read carries its own state. A rule is refused only when the
 * fact is KNOWN and unmet; when the underlying read is unknown (the short-series session sentinel
 * that M8 refuses to read as "outside", an unreadable news calendar, no computed levels yet) the rule
 * is reported `unknown` and refuses nothing. A missing read is never silently upgraded to `met` — the
 * fact normaliser in `facts()` defaults anything it was not handed to `unknown`, so a caller who
 * forgets a fact gets a visible unknown rather than an accidental green.
 *
 * WHAT IT IS NOT: not a score. A refused plan rule vetoes the candidate as a boolean, exactly like
 * every other non-negotiable, and changes no grade, weight, cap or price — `limits` says so and the
 * probes measure it. Not a second opinion either: the facts are the setup model's OWN booleans, read
 * at the same point the other vetoes are assembled, so the plan gate can only ever refuse something
 * the engine already knows, never re-derive it.
 *
 * The plan is the trader's: the gate reads THEIR strategy (the name_id they pass, else their single
 * active plan), and it never picks one silently. No active plan is `no_plan` and blocks nothing — a
 * written plan is a discipline the course prescribes, not a precondition for using the app — while an
 * unreadable one is `unavailable` and refuses, so a broken read can never read as compliance. Two
 * active plans are `ambiguous` and are NOT secretly intersected (a London reversal plan and a NY
 * continuation plan are alternatives, not a conjunction): the payload names both and says how to
 * choose.
 *
 * STATED LIMITS, so this is not over-read: the gate enforces exactly the vocabulary below and nothing
 * else; free-text rules, `exit_rules`, `checklist` text and the `market_conditions` field are NOT
 * parsed for meaning (polarity cannot be read from prose — "no news trading" and "trade the news"
 * contain the same word); the facts are the engine's own reads, not broker or price verification; and
 * a plan is only as good as the trader who wrote it.
 */
const VERSION = 'plan-gate-v1';

/* Where a plan came from, in the payload's own tokens. `not_consulted` is research (no user), and it
 * blocks nothing because there is no trader whose plan could apply. */
const STATES = Object.freeze({
  NOT_CONSULTED: 'not_consulted',
  NO_PLAN: 'no_plan',
  AMBIGUOUS: 'ambiguous',
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
});

/* The grade ladder, high to low. `no-trade` sits below D: a plan that asks for `>= C` may not be
 * satisfied by a stood-down setup. */
const GRADE_RANK = Object.freeze({ 'a+': 6, a: 5, b: 4, c: 3, d: 2, 'no-trade': 1 });

/*
 * THE VOCABULARY. Every fact here reads something the engine already computes and already shows the
 * trader somewhere else in the app; nothing above is invented for the gate.
 *
 *   boolean facts  — `require <fact>`
 *   enum facts     — `require <fact> <value>`
 *   compare facts  — `require <fact> >= <n>` (min_rr) / `require <fact> <= <n>` (risk)
 *
 * `label` is what the refusal says the rule is about; `unit` is appended to numbers; `values` is the
 * closed value set for enums, so a misspelling is an unrecognised request rather than a silent pass.
 */
const FACTS = Object.freeze({
  sweep: { form: 'boolean', label: 'a liquidity sweep in the trade\u2019s direction' },
  market_shift: { form: 'boolean', label: 'a market shift (a structural break) in the trade\u2019s direction' },
  zone: { form: 'boolean', label: 'an order block or imbalance to trade against' },
  killzone: { form: 'boolean', label: 'a killzone being open' },
  bias_aligned: { form: 'boolean', label: 'the held bias agreeing with the trade\u2019s direction' },
  no_news_blackout: { form: 'boolean', label: 'no news blackout on your window' },
  session: { form: 'enum', label: 'the open killzone', values: ['asia', 'london', 'ny_am', 'london_close'] },
  timeframe: { form: 'enum', label: 'the entry timeframe', values: ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] },
  trend: { form: 'enum', label: 'the structure trend', values: ['bullish', 'bearish', 'ranging'] },
  phase: { form: 'enum', label: 'the market phase', values: ['balance', 'expansion', 'pullback'] },
  grade: { form: 'compare', op: '>=', label: 'the setup grade', values: ['A+', 'A', 'B', 'C', 'D'] },
  min_rr: { form: 'compare', op: '>=', label: 'the first-target risk:reward', unit: 'R', sample: 2 },
  risk: { form: 'compare', op: '<=', label: 'the per-trade risk on your account', unit: '%', sample: 1 },
});

/* The trader-facing list of what CAN be enforced, for the plan editor's hint and the API payload. */
function vocabulary() {
  return Object.keys(FACTS).map((fact) => {
    const f = FACTS[fact];
    // `line` is a CONCRETE example that the engine really enforces (the first listed value for an
    // enum or a graded comparison, the sample number for a numeric one), so the documented line and
    // the parse can never disagree; `values` carries the full set for a client to render as choices.
    const line = f.form === 'boolean' ? `require ${fact}`
      : f.form === 'enum' ? `require ${fact} ${f.values[0]}`
      : `require ${fact} ${f.op} ${f.values ? f.values[0] : f.sample}`;
    return { fact, form: f.form, line, op: f.op || null, label: f.label, values: f.values || null, unit: f.unit || null };
  });
}

/** Refusals and unreadable reads carry the same shape the other gates use, so a route can hand the
 * object straight to the client without translation. */
function invalid(message, status = 400, code = 'plan_gate_invalid') {
  const e = new Error(message);
  e.status = status; e.code = code;
  return e;
}

function marked(state, note) { return { version: VERSION, state, note: note || null }; }

/** An unreadable plan: the gate could not be consulted, and it REFUSES rather than passing, because a
 * broken read must not be indistinguishable from compliance. */
function unavailable(reason) {
  return { ...marked(STATES.UNAVAILABLE, 'The plan gate could not be read, so no signal is confirmed against your written plan.'),
    reason: reason ? String(reason).slice(0, 200) : null };
}

/**
 * Normalise the fact reads into `{state, detail}`. `state` is `known` or `unknown`; the caller hands
 * whatever it has, and ANYTHING IT DOES NOT HAND IS `unknown` — never `met`. That default is the
 * whole anti-silent-pass rule, and it is why every read below is written as a possibly-undefined
 * value passed through `read(v, detail)` rather than a bare boolean.
 */
function read(v, detail) {
  if (v === undefined || v === null) return { state: 'unknown', value: null, detail: detail || null };
  if (typeof v === 'number' && !Number.isFinite(v)) return { state: 'unknown', value: null, detail: detail || null };
  return { state: 'known', value: v, detail: detail || null };
}

/** Build the fact set from the caller's reads. Only the facts handed in are populated; the rest are
 * `unknown`. */
function facts(reads = {}) {
  const out = {};
  for (const fact of Object.keys(FACTS)) out[fact] = reads[fact] || read(undefined);
  return out;
}

/**
 * Parse ONE rule line. Three outcomes, and the difference between them is the point:
 *   - `machine`      — a `require ` line naming a vocabulary fact with a valid operator/value.
 *   - `unknown_fact` — a `require ` line the vocabulary does not recognise. The trader asked for a
 *                      gate; the engine must say it cannot enforce it rather than pretending.
 *   - `prose`        — anything else. Context for the human, never a rule for the engine.
 */
function parseRule(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { text: raw, kind: 'prose', reason: 'empty line' };
  const m = /^require\s+([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|==|=|>|<)?\s*(.*)$/.exec(raw);
  if (!m) return { text: raw, kind: 'prose', reason: 'does not start with `require `' };
  const fact = m[1].toLowerCase();
  const op = m[2] || null;
  const value = (m[3] || '').trim();
  const spec = FACTS[fact];
  if (!spec) return { text: raw, kind: 'unknown_fact', fact, reason: `\`${fact}\` is not a requirement this app can check` };
  if (spec.form === 'boolean') {
    if (op || value) return { text: raw, kind: 'unknown_fact', fact, reason: `\`${fact}\` takes no operator or value` };
    return { text: raw, kind: 'machine', fact, form: 'boolean' };
  }
  if (spec.form === 'enum') {
    const v = String(value || '').toLowerCase();
    if (op || !spec.values.includes(v)) {
      return { text: raw, kind: 'unknown_fact', fact, reason: `\`${fact}\` must be followed by one of ${spec.values.join(', ')}` };
    }
    return { text: raw, kind: 'machine', fact, form: 'enum', value: v };
  }
  // compare: the operator is the fact's own (a `require` line is a floor for min_rr and a ceiling for
  // risk, and letting the trader invert it would silently make the plan mean the opposite).
  if (op !== spec.op) {
    return { text: raw, kind: 'unknown_fact', fact, reason: `\`${fact}\` is written as \`require ${fact} ${spec.op} <value>\`` };
  }
  if (spec.values) {
    const v = String(value || '').trim();
    const hit = spec.values.find((x) => x.toLowerCase() === v.toLowerCase());
    if (!hit) return { text: raw, kind: 'unknown_fact', fact, reason: `\`${fact}\` must compare against one of ${spec.values.join(', ')}` };
    return { text: raw, kind: 'machine', fact, form: 'compare', op, value: hit };
  }
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) {
    return { text: raw, kind: 'unknown_fact', fact, reason: `\`${fact}\` must compare against a positive number` };
  }
  return { text: raw, kind: 'machine', fact, form: 'compare', op, value: n };
}

/** Parse a whole plan row (`strategies` row, `entry_rules` already JSON-parsed or still a string).
 *
 * The column is documented as a JSON array of strings, and that is the ONLY shape this engine treats
 * as a rule set. A value that is not an array (a double-encoded string, an object from an import that
 * went wrong, a number) yields no rules AND `malformed: true`, so the client can say "your rules could
 * not be read" instead of rendering the absence of a rule list as a plan with nothing to enforce.
 */
function parse(row) {
  const raw = row && row.entry_rules;
  let rules = [];
  let malformed = false;
  if (Array.isArray(raw)) rules = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try { rules = JSON.parse(raw); } catch (e) { rules = []; malformed = true; }
    if (!Array.isArray(rules)) { malformed = true; rules = []; }
  } else if (raw !== undefined && raw !== null && raw !== '') malformed = true;
  const parsed = (Array.isArray(rules) ? rules : []).map(parseRule).filter((r) => r.text);
  const counts = {
    machine: parsed.filter((r) => r.kind === 'machine').length,
    unknown_fact: parsed.filter((r) => r.kind === 'unknown_fact').length,
    prose: parsed.filter((r) => r.kind === 'prose').length,
  };
  return { rules: parsed, counts, malformed };
}

/** The comparison for one machine rule against one direction's facts. */
function check(rule, f) {
  const r = f[rule.fact] || read(undefined);
  const unknown = { state: 'unknown', detail: r.detail };
  if (rule.form === 'boolean') {
    if (r.state !== 'known') return unknown;
    return { state: r.value === true ? 'met' : 'refused', detail: r.detail };
  }
  if (rule.form === 'enum') {
    if (r.state !== 'known') return unknown;
    return { state: String(r.value).toLowerCase() === rule.value ? 'met' : 'refused', detail: r.detail };
  }
  if (rule.fact === 'grade') {
    if (r.state !== 'known') return unknown;
    const have = GRADE_RANK[String(r.value).toLowerCase()];
    const want = GRADE_RANK[String(rule.value).toLowerCase()];
    return { state: have >= want ? 'met' : 'refused', detail: r.detail };
  }
  if (r.state !== 'known' || !Number.isFinite(Number(r.value))) return unknown;
  const have = Number(r.value);
  return { state: rule.op === '<=' ? (have <= rule.value ? 'met' : 'refused') : (have >= rule.value ? 'met' : 'refused'), detail: r.detail };
}

/** The refusal sentence. It names the plan, its version, the trader's own rule text and the fact,
 * then quotes the episode, because the reason a plan rule binds is that they wrote it. */
function sentence(parsed, rule, result) {
  const name = parsed.plan && parsed.plan.name ? `\u201c${parsed.plan.name}\u201d` : 'your written plan';
  const v = parsed.plan && parsed.plan.version ? ` (v${parsed.plan.version})` : '';
  const detail = result.detail ? ` ${result.detail}` : '';
  // The rule is quoted without its `require ` keyword: the trader reads it as the requirement it is,
  // and still finds the exact line in their editor (the full text travels in the payload).
  const quoted = rule.text.replace(/^require\s+/i, '');
  return `Your plan ${name}${v} requires \u201c${quoted}\u201d \u2014 ${FACTS[rule.fact].label} is not met.${detail}`
    + ` \u201cIf even just one of these boxes are not being checked, I would still not trade.\u201d`;
}

/**
 * Evaluate the parsed plan for ONE direction. `f` is that direction's fact set. Returns the per-rule
 * results (machine rules only — prose and unrecognised lines are reported at plan level, not per
 * direction) plus the veto sentences, ready to be appended to the candidate's `no_trade` list.
 */
function evaluate(parsed, f, dir) {
  const results = [];
  const vetoes = [];
  for (const rule of parsed.rules) {
    if (rule.kind !== 'machine') continue;
    const result = check(rule, f);
    results.push({ text: rule.text, fact: rule.fact, state: result.state, detail: result.detail || null });
    if (result.state === 'refused') vetoes.push(sentence(parsed, rule, result));
  }
  return { dir, results, vetoes,
    refused: results.filter((r) => r.state === 'refused').length,
    unknown: results.filter((r) => r.state === 'unknown').length };
}

/** The plan-level block that rides `setups.filters`, built from the parse (direction-independent) and
 * the per-direction evaluations. */
function view(loaded, perDirection) {
  if (!loaded) {
    // No gate was handed to this path at all (the pure method/research callers, which have no
    // trader). That is `not_consulted`, and it is NOT the same token as a plan that failed to read:
    // research must never look like a broken plan, and a broken plan must never look like research.
    return { version: VERSION, state: STATES.NOT_CONSULTED, plan: null,
      note: 'No written plan was consulted on this path.', candidates: null, reason: null,
      enforced: 0, machine: 0, prose: 0, unknown_fact: 0, refused_now: false,
      enforced_lines: [], unverifiable_lines: [], unrecognised_lines: [] };
  }
  if (loaded.state !== STATES.READY) {
    return { version: VERSION, state: loaded.state || STATES.UNAVAILABLE, plan: (loaded && loaded.plan) || null,
      note: (loaded && loaded.note) || null, candidates: (loaded && loaded.candidates) || null,
      reason: (loaded && loaded.reason) || null,
      enforced: 0, machine: 0, prose: 0, unknown_fact: 0, refused_now: false, enforced_lines: [], unverifiable_lines: [], unrecognised_lines: [] };
  }
  const evals = perDirection || [];
  return {
    version: VERSION, state: STATES.READY, plan: loaded.plan, note: loaded.note || null, malformed: !!loaded.malformed,
    machine: loaded.counts.machine, prose: loaded.counts.prose, unknown_fact: loaded.counts.unknown_fact,
    enforced: loaded.counts.machine,
    enforced_lines: loaded.rules.filter((r) => r.kind === 'machine').map((r) => r.text),
    unverifiable_lines: loaded.rules.filter((r) => r.kind === 'prose').map((r) => r.text),
    unrecognised_lines: loaded.rules.filter((r) => r.kind === 'unknown_fact').map((r) => ({ text: r.text, reason: r.reason })),
    refused_now: evals.some((e) => e.refused > 0),
    unknown_now: evals.some((e) => e.unknown > 0),
    candidates: evals.map((e) => ({ dir: e.dir, refused: e.refused, unknown: e.unknown, rules: e.results })),
    limits: {
      enforced_vocabulary: vocabulary().map((v) => v.line),
      prose_is_not_parsed: true, market_conditions_field_is_not_parsed: true, exit_rules_are_not_parsed: true,
      grade_influence: false, score_influence: false, cap_influence: false, price_influence: false,
      unknown_is_never_met: true, broker_verified: false,
    },
  };
}

/**
 * Read the trader's plan. Explicit id first (and it must be THEIRS — anything else is a 404, never a
 * silent fallback to another plan), else their single active plan. Multiple active plans are
 * `ambiguous` and block nothing: the payload names them and says how to choose, because guessing which
 * of two plans applies is exactly the kind of silent assumption this gate exists to remove.
 */
async function load(userId, strategyId) {
  if (!userId) return marked(STATES.NOT_CONSULTED, 'Unsized research carries no plan claim, so no written plan is consulted.');
  const { db } = require('../db');
  let row = null;
  if (strategyId !== undefined && strategyId !== null && strategyId !== '') {
    const id = Number(strategyId);
    if (!Number.isSafeInteger(id) || id <= 0) throw invalid('strategy_id must be a positive integer.', 400, 'plan_invalid');
    row = await db.prepare('SELECT * FROM strategies WHERE id=? AND user_id=?').get(id, userId);
    if (!row) throw invalid('No such plan in your playbook.', 404, 'plan_not_found');
  } else {
    const rows = await db.prepare('SELECT * FROM strategies WHERE user_id=? AND active=1 ORDER BY id').all(userId);
    if (!rows || !rows.length) return marked(STATES.NO_PLAN, 'No active written plan, so no signal is confirmed against one. Publish a plan in the Playbook to gate your entries with it.');
    if (rows.length > 1) {
      return { ...marked(STATES.AMBIGUOUS, 'More than one active plan — name the one this signal is confirmed against, or pause the others. Nothing is blocked until then.'),
        candidates: rows.map((r) => ({ id: r.id, name: r.name })) };
    }
    row = rows[0];
  }
  const { currentStrategyVersion } = require('../db');
  let version = null;
  try { version = await currentStrategyVersion(row.id); } catch (e) { version = null; }
  const parsed = parse(row);
  return { version: VERSION, state: STATES.READY, plan: { id: row.id, name: row.name, active: !!row.active, version, source: 'strategies' },
    counts: parsed.counts, rules: parsed.rules, malformed: parsed.malformed,
    note: parsed.malformed ? 'Your plan’s rules could not be read as a list of lines, so nothing in it can gate a signal — re-save the plan.'
      : parsed.counts.machine
        ? `Checked against ${parsed.counts.machine} machine-checkable requirement${parsed.counts.machine === 1 ? '' : 's'} in your plan.`
        : 'Your plan has no machine-checkable requirements yet, so nothing in it can gate a signal.' };
}

/** Never throws: an unreadable plan is `unavailable` (which refuses), so a broken read can never look
 * like a satisfied plan. Ownership errors still surface — they are the caller's mistake, not a state. */
async function safe(userId, strategyId) {
  try { return await load(userId, strategyId); }
  catch (e) {
    if (e && e.code === 'plan_not_found') throw e;
    if (e && e.code === 'plan_invalid') throw e;
    return unavailable(e && e.message);
  }
}

module.exports = { VERSION, STATES, FACTS, GRADE_RANK, vocabulary, invalid, marked, unavailable, read, facts,
  parseRule, parse, check, evaluate, sentence, view, load, safe };
