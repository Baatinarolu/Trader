'use strict';
/** M110 hardening: hostile input to every entry point of the news rule, and proof that this
 * milestone did not weaken the guards it sits beside. Nothing is repaired, nothing is coerced
 * silently, no other surface can set the pair, and the state gate's own 60-minute window is
 * exactly where it was. */
const H = require('./m110-test-support'), { ok, start, account, finish, snapshot, changed } = H;
const path = require('path'), fs = require('fs');
const B = require(path.join(H.APP, 'src/bots'));
const N = H.mod('src/news-window');   // absent on the committed parent: a measured control

finish('M110 hardening', async () => {
  if (!H.shipped(N, 'the M110 news-window module')) return;
  const u = await start('m110-hardening');
  const desk = await account(u, 'Hardening desk', { news_block_before_min: 15, news_settle_after_min: 45 });
  const row = async () => (await u.req('/accounts', undefined, 'GET')).data.accounts.find((x) => x.id === desk.id);
  const before = JSON.stringify(await row());
  const snap = await snapshot();
  const CODES = new Set(['news_window_invalid', 'news_settle_below_floor', 'news_window_split_required']);
  const seen = [];

  /* ------------------------------------------------- hostile query values */
  const refuse = async (qs) => {
    const r = await u.req('/bots/news/EURUSD?' + qs, undefined, 'GET');
    if (r.data && r.data.code) seen.push(r.data.code);
    return r;
  };
  const battery = [
    ['before=abc', 'a word'], ['after=[]', 'an array'], ['before=', 'an empty value'], ['after=%20%20', 'whitespace'],
    ['before=0', 'zero, below the 1-minute minimum'], ['after=29', 'one minute under the floor'], ['after=241', 'one minute over the maximum'],
    ['before=-5', 'a negative block'], ['after=1.5', 'a fraction'], ['before=true', 'a boolean'], ['after={}', 'an object'],
  ];
  const statuses = [];
  for (const [qs, what] of battery) {
    const r = await refuse(qs);
    statuses.push(r.status);
    ok(`a hostile value (${what}) is refused 400 with a documented code, never a 500 and never silently accepted`, r.status === 400 && CODES.has(r.data.code), { qs, status: r.status, code: r.data && r.data.code });
  }
  const echoed = await refuse('before=0x10&after=1e2');
  ok('an exotic numeric spelling is not silently reinterpreted differently from how it is reported: whatever it was read as is what the answer echoes', echoed.status === 200 ? echoed.data.windows.before_min === 16 && echoed.data.windows.after_min === 100 : echoed.data.code === 'news_window_invalid', { status: echoed.status, windows: echoed.data && echoed.data.windows });
  ok('and every response to the battery was 400 or 200 — no unhandled path, no 500, no stack', statuses.every((s) => s === 400 || s === 200) && !statuses.includes(500), statuses);
  ok('the codes actually used are exactly the three documented ones, so a client can switch on them', [...new Set(seen)].every((c) => CODES.has(c)) && [...new Set(seen)].length >= 2, [...new Set(seen)]);

  /* ------------------------------------------------- hostile account bodies */
  const bodies = [['a fraction', 30.5], ['a boolean', true], ['an array', [30]], ['an object', { min: 30 }], ['a blank', ' '], ['words', 'thirty'], ['null', null]];
  const countBefore = (await u.req('/accounts', undefined, 'GET')).data.accounts.length;
  for (const [what, v] of bodies) {
    const r = await u.req('/accounts', { name: 'Hostile ' + what, news_settle_after_min: v });
    if (r.data && r.data.code) seen.push(r.data.code);
    ok(`a hostile settle in the account body (${what}) is refused on creation`, r.status === 400, { what, status: r.status, code: r.data && r.data.code });
  }
  const upd = await u.req('/accounts/' + desk.id, { news_settle_after_min: [] }, 'PUT');
  ok('and on an update: a hostile settle does not overwrite the stored pair', upd.status === 400 && JSON.stringify(await row()) === before, upd.data);

  /* ---------------------------------------------------- no repair, no clamp written back */
  const wide = await u.req('/accounts/' + desk.id, { news_settle_after_min: 120 }, 'PUT');
  const readWide = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  ok('a stored settle longer than the 30–60 he names is read AS STORED, with a warning, and never repaired to 45 behind the trader’s back', wide.status === 200 && readWide.data.windows.after_min === 120 && (await row()).news_settle_after_min === 120, { window: readWide.data.windows.after_min, stored: (await row()).news_settle_after_min });
  await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  ok('and repeated reads do not drift it: the value is stable across reads, so a warning cannot turn into a rewrite', (await row()).news_settle_after_min === 120);
  const planWide = N.plan(await row());
  ok('the engine still reports where that number came from (stored, with the outside-range warning) instead of passing it off as the default', planWide.after_min === 120 && planWide.source[1] === 'news_settle_after_min:stored' && planWide.warnings.some((w) => w.code === 'news_settle_outside_stated_range'), planWide.warnings.map((w) => w.code));

  /* ---------------------------------------------------- module-level hostility */
  const absurd = N.plan({ news_block_before_min: 9999, news_settle_after_min: -100 });
  ok('a hand-built row outside the bounds is clamped on read to the shipped limits, with both clamps named — not crashed on and not accepted', absurd.before_min === 240 && absurd.after_min === 30 && absurd.clamped.length === 2, absurd);
  const bareNumber = await B.newsCheck('EURUSD', 45).then(() => null, (e) => e);
  ok('a bare number is refused in-process too (as a rejection carrying the code), so no caller can reintroduce the symmetric knob without an error', !!bareNumber && bareNumber.code === 'news_window_split_required' && bareNumber.status === 400, bareNumber && bareNumber.code);
  ok('a missing event instant or a missing clock yields no verdict rather than a verdict at zero offset', N.hit(NaN, Date.now(), N.plan(await row())) === null && N.hit(Date.now(), NaN, N.plan(await row())) === null && N.hit(undefined, Date.now(), N.plan(await row())) === null);
  ok('a malformed pair yields no verdict at all rather than matching everything', N.hit(Date.now(), Date.now(), {}) === null && N.hit(Date.now(), Date.now(), { before_min: 'x', after_min: 'y' }) === null);

  /* --------------------------------------------- other surfaces cannot set the pair */
  const gate = await u.req('/state-gate?account_id=' + desk.id, undefined, 'GET');
  ok('the state gate’s own 60-minute window is exactly where M102 left it: untouched by the news split', gate.status === 200 && gate.data.window_minutes === 60, gate.data && gate.data.window_minutes);
  const ANSWERS = { calm: true, clear: true, following_plan: true, would_take_if_up_big: true };
  const smuggle = await u.req('/state-gate?account_id=' + desk.id, { answers: ANSWERS, revision: gate.data.revision, news_settle_after_min: 5, news_block_before_min: 1 }, 'PUT');
  ok('a news key smuggled into a gate answer is REFUSED — that surface accepts answers and a revision and nothing else — and the pair is untouched', smuggle.status === 400 && (await row()).news_settle_after_min === 120 && (await row()).news_block_before_min === 15, { status: smuggle.status, code: smuggle.data && smuggle.data.code });
  const gateOk = await u.req('/state-gate?account_id=' + desk.id, { answers: ANSWERS, revision: gate.data.revision }, 'PUT');
  ok('and the gate’s own accepted path cannot carry a news setting either: answering it leaves both clocks exactly where they were', gateOk.status === 200 && (await row()).news_settle_after_min === 120 && (await row()).news_block_before_min === 15, { status: gateOk.status, state: gateOk.data && gateOk.data.state });
  const riskPut = await u.req('/accounts/' + desk.id, { risk_per_trade_pct: 5 }, 'PUT');
  ok('the risk guardrail beside it still holds: a 5% request is clamped to the course maximum rather than stored, so M110 did not knock out an existing guard', riskPut.status === 200 && riskPut.data.account.risk_per_trade_pct <= 1 && !!riskPut.data.risk_note, { stored: riskPut.data.account.risk_per_trade_pct, note: riskPut.data.risk_note });

  /* --------------------------------------------------------- symbols, writes */
  const weird = await u.req('/bots/news/%25%25%25', undefined, 'GET');
  ok('a nonsense symbol is answered without a crash rather than 500', weird.status === 200 && Array.isArray(weird.data.currencies), { status: weird.status, currencies: weird.data && weird.data.currencies });
  H.calendarSpec([{ at_ms: Date.now() - 10 * 60000, currency: 'USD', title: 'Case check' }]);
  const lower = await u.req('/bots/news/eurusd?account_id=' + desk.id, undefined, 'GET');
  const upper = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  ok('the symbol is case-insensitive, and both spellings see the same release', lower.data.events.length === 1 && JSON.stringify(lower.data.events) === JSON.stringify(upper.data.events));
  const after = await snapshot();
  const noise = ['sqlite_sequence', 'sessions', 'strategy_versions', 'state_gate_answers'];  // a session, a lazy snapshot and the gate answer this probe itself records
  const rowBefore = JSON.parse(before), rowAfter = await row();
  const movedKeys = Object.keys(rowAfter).filter((k) => JSON.stringify(rowAfter[k]) !== JSON.stringify(rowBefore[k]));
  const moved = changed(snap, after).filter((t) => !noise.includes(t) && t !== 'accounts');
  ok('after the whole battery — refusals, hostile bodies, clamps and reads — not one row of the trader’s data moved anywhere in the database', moved.length === 0, moved);
  ok('and inside the account, the only field that moved is the one this probe deliberately set — the widened settle — with the risk request resolved to the guardrail instead of stored', movedKeys.every((k) => ['news_settle_after_min', 'risk_per_trade_pct', 'risk_unlocked'].includes(k)) && movedKeys.includes('news_settle_after_min') && rowAfter.risk_per_trade_pct === rowBefore.risk_per_trade_pct, movedKeys);
  ok('the block side was never touched by any of it, which is the point of two separate clocks', rowAfter.news_block_before_min === 15 && rowAfter.news_settle_after_min === 120 && rowAfter.risk_per_trade_pct <= 1, { block: rowAfter.news_block_before_min, settle: rowAfter.news_settle_after_min, risk: rowAfter.risk_per_trade_pct });
  ok('no shipped file lost a guard it had: the settle floor is still enforced by the schema, the route and the module, in that order', (() => {
    const db = fs.readFileSync(path.join(H.APP, 'src/db.js'), 'utf8'), route = fs.readFileSync(path.join(H.APP, 'src/routes/bots.js'), 'utf8'), mod = fs.readFileSync(path.join(H.APP, 'src/news-window.js'), 'utf8');
    return /CHECK\(news_settle_after_min BETWEEN 30 AND 240/.test(db) && /LEGACY_SINGLE/.test(route) && /news_settle_below_floor/.test(mod);
  })());
});
