'use strict';
/** M111 hardening probe: every shape a failing calendar can take, and the promise that none of
 * them can be mistaken for a quiet week, crash the engine, or leak an unusable reason into the
 * trader's face. The market module is patched per case (test-only), so the shapes below are exact
 * rather than imagined. */
const path = require('path');
const H = require('./m111-test-support'), { ok } = H;
const N = H.mod('src/news-window');
const M = H.app('src/market');
const B = H.app('src/bots');
H.finish('M111 hardening: every failing shape is unknown, and none of them lies', async () => {
  if (!H.shipped(N, 'the M111 calendar-read state vocabulary')) return;
  const S = N.STATES;
  const pair = N.plan({ news_block_before_min: 15, news_settle_after_min: 45 });
  const real = M.getCalendar;
  const withReader = async (fn) => { M.getCalendar = fn; try { return await B.newsCheck('EURUSD', pair); } finally { M.getCalendar = real; } };

  /* ------------------------------------------------- every failure shape the layer can take */
  const shapes = [
    ['its own {ok:false} with a reason', async () => ({ ok: false, error: 'Economic calendar unavailable (empty calendar)', events: [] })],
    ['{ok:false} with NO reason at all', async () => ({ ok: false, events: [] })],
    ['{ok:false} with a null reason', async () => ({ ok: false, error: null, events: [] })],
    ['{ok:false} with an empty-string reason', async () => ({ ok: false, error: '   ', events: [] })],
    ['{ok:false} with an object reason', async () => ({ ok: false, error: { message: 'feed refused' }, events: [] })],
    ['a bare empty object', async () => ({})],
    ['a resolved non-object (the layer returning junk)', async () => []],
    ['a thrown Error', async () => { throw new Error('socket hang up'); }],
    ['a thrown string', async () => { throw 'feed reset'; }],
    ['a thrown null', async () => { throw null; }],
    ['a thrown object with no message', async () => { throw { code: 'EAI_AGAIN' }; }],
    ['a rejected promise (async throw)', async () => { throw new TypeError('fetch is not a function'); }],
  ];
  for (const [label, fn] of shapes) {
    const out = await withReader(fn);
    const reasonOk = typeof out.unavailable === 'string' && out.unavailable.trim().length > 0 && !/\[object Object\]/.test(out.unavailable) && !/^undefined|^null$/.test(out.unavailable);
    const noteOk = typeof out.unavailable_note === 'string' && /^News risk UNKNOWN/.test(out.unavailable_note) && /NOT an all-clear/.test(out.unavailable_note);
    ok(`a calendar failure shaped as ${label} is \`unknown\` with a usable reason and the honest sentence`, out.state === S.UNKNOWN && out.blackout === null && out.events.length === 0 && reasonOk && noteOk, { state: out.state, unavailable: out.unavailable, note: out.unavailable_note });
  }

  /* ---------------------------------------------------- shapes that must NOT be unknown */
  const okShapes = [
    ['a successful read with rows but nothing for this symbol', { ok: true, events: [{ title: 'BoJ', currency: 'JPY', impact: 'High', date: new Date(Date.now() + 3600e3).toISOString() }] }],
    ['a successful read whose rows are all low-impact', { ok: true, events: [{ title: 'Something', currency: 'USD', impact: 'Low', date: new Date(Date.now() + 60e3).toISOString() }] }],
    ['a successful read whose rows are all for another currency', { ok: true, events: [{ title: 'RBA', currency: 'AUD', impact: 'High', date: new Date(Date.now() - 60e3).toISOString() }] }],
  ];
  for (const [label, value] of okShapes) {
    const out = await withReader(async () => value);
    ok(`${label} stays \`clear\`, so the fix did not turn a readable calendar into a permanent unknown`, out.state === S.CLEAR && out.blackout === null && !('unavailable' in out), { state: out.state, keys: Object.keys(out) });
  }
  const noRows = await withReader(async () => ({ ok: true, events: [] }));
  ok('an `{ok:true}` read with ZERO rows is `clear` at this layer — it is the market layer, not the news check, that turns a truly empty feed into a failure, and this probe records both halves rather than assuming either', noRows.state === S.CLEAR && !('unavailable' in noRows), { state: noRows.state });

  /* --------------------------------------------- a failed read is never a fake release */
  const outage = await withReader(async () => ({ ok: false, error: 'down' }));
  ok('an outage produces no events, no upcoming list and no blackout string — the app never invents a release to stand down for', outage.events.length === 0 && outage.upcoming.length === 0 && outage.blackout === null, outage);
  ok('and the unknown sentence names no window number, so it cannot be misread as a window that was applied', !/\d+\s*(min|minute)/i.test(outage.unavailable_note), outage.unavailable_note);

  /* ------------------------------------------------- the setup model on every bad shape */
  const Setup = H.setup(), SMC = H.smc();
  const series = H.bars(), win = series.slice(-260);
  const smc = SMC.analyse(win, { tf: '15m', now: win[win.length - 1].t, swingMode: 'bos', nested: true });
  const base = { price: win[win.length - 1].c, atr: smc.atr, entrySeries: { smc, price: win[win.length - 1].c, atr: smc.atr, ind: smc.ind }, indicators: smc.ind, balance: 10000, riskPct: 0.5, maxRiskPct: 1, valuePerPoint: 100000, assetClass: 'forex', symbol: 'EURUSD', minRR: 1 };
  const rowOf = (r) => ((r.candidates || [])[0] || {}).checks.find((c) => c.key === 'news');
  const hostileStates = [undefined, null, '', 'unknown', 'UNKNOWN', 'unknown ', 0, false, {}, [], ['clear'], { state: 'unknown' }];
  const verdicts = hostileStates.map((v) => rowOf(Setup.buildSetups(smc, { ...base, newsState: v, newsNote: 'note' })).pass);
  ok('only an exact `unknown` fails the row: no truthiness accident can turn a real clear into a failure, and no lookalike can turn an outage into a pass', verdicts[0] === true && verdicts[1] === true && verdicts[2] === true && verdicts[3] === false && verdicts[4] === true && verdicts[5] === true && verdicts[6] === true && verdicts[7] === true && verdicts[8] === true && verdicts[9] === true && verdicts[10] === true && verdicts[11] === true, { hostile: hostileStates, verdicts });
  ok('the payload mirrors the caller\'s own token rather than a normalised invention, so what was passed is what is reported', ((Setup.buildSetups(smc, { ...base, newsState: 'UNKNOWN' }).filters) || {}).news_state === 'UNKNOWN', ((Setup.buildSetups(smc, { ...base, newsState: 'UNKNOWN' }).filters) || {}).news_state);
  const unknownRow = rowOf(Setup.buildSetups(smc, { ...base, newsState: 'unknown', newsNote: outage.unavailable_note }));
  ok('on an unknown read the row FAILS with the sentence the engine prepared, and the row keeps its weight so no grade scale moved', unknownRow.pass === false && unknownRow.detail === outage.unavailable_note && unknownRow.weight === 10, unknownRow);

  /* --------------------------------------------------------------- and over the wire */
  const u = await H.start('m111-hardening');
  const desk = await H.account(u, 'M111 hardening desk');
  await u.req('/accounts/' + desk.id, { news_block_before_min: 15, news_settle_after_min: 45 }, 'PUT');
  for (const [label, fn] of shapes) {
    M.getCalendar = fn;
    const r = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
    M.getCalendar = real;
    ok(`over HTTP, ${label} answers 200 with a body rather than a 500 or an empty envelope`, r.status === 200 && r.data && r.data.state === S.UNKNOWN && typeof r.data.unavailable === 'string' && r.data.unavailable.length > 0, { status: r.status, state: r.data && r.data.state, body: typeof r.data === 'string' ? r.data.slice(0, 80) : null });
  }
  const after = await u.req('/accounts', undefined, 'GET');
  ok('and after every hostile shape the account settings are exactly where they were — an outage cannot write', after.data.accounts.find((a) => a.id === desk.id).news_block_before_min === 15 && after.data.accounts.find((a) => a.id === desk.id).news_settle_after_min === 45, null);
  const gate = await u.req('/state-gate?account_id=' + desk.id, undefined, 'GET');
  const gatePut = await u.req('/state-gate?account_id=' + desk.id, { answers: { calm: true, clear: true, following_plan: true, would_take_if_up_big: true }, revision: gate.data.revision, news_state: 'clear' }, 'PUT');
  ok('M111 does not smuggle a news state into another mechanism: a state key in a gate answer is still refused by that surface', gatePut.status === 400, { status: gatePut.status, code: gatePut.data && gatePut.data.code });
});
