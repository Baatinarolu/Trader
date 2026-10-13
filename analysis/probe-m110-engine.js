'use strict';
/** M110 engine probe: the rule as the engine actually evaluates it — `Bots.newsCheck` over the
 * app's own calendar parser with the account's pair, and the two consumers that render it
 * (`setup.js`'s `news` check row and its no-trade veto list) driven with synthetic 15m bars.
 *
 * The `analyse()` end-to-end path is NOT driven here: this sandbox has no candle provider (the
 * analysis market fixtures are gitignored and re-fetched per session), and `bots.analyse('EURUSD')`
 * dies at the transport layer. So the inputs are measured at their real boundary — parsed calendar
 * events in, veto strings out — instead of pretending a short synthetic series is a market.
 */
const H = require('./m110-test-support'), { ok, start, account, finish } = H;
const path = require('path'), fs = require('fs');
const B = require(path.join(H.APP, 'src/bots'));
const N = H.mod('src/news-window');   // absent on the committed parent: a measured control
const SMC = require(path.join(H.APP, 'src/bots/smc'));
const Setup = require(path.join(H.APP, 'src/bots/setup'));

/** Synthetic 15m structure: enough nested swings for the setup model to produce candidates.
 *  Declared synthetic — the code path is the app's, the bars are not a market. */
function bars(n = 320) {
  const out = []; let p = 1.1000; const t0 = Date.UTC(2026, 9, 13, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const up = Math.sin(i / 18) > -0.2;
    const step = (up ? 1 : -1) * 0.0006 + Math.sin(i / 7) * 0.0002;
    p = Math.max(1.05, Math.min(1.2, p + step));
    const o = p - step / 2, c = p;
    out.push({ t: t0 + i * 900000, o, h: Math.max(o, c) + 0.0004, l: Math.min(o, c) - 0.0004, c, v: 1000 + i });
  }
  return out;
}

finish('M110 engine', async () => {
  if (!H.shipped(N, 'the M110 news-window module')) return;
  const u = await start('m110-engine');
  const desk = await account(u, 'Engine desk', { news_block_before_min: 15, news_settle_after_min: 45 });
  const pair = N.plan(desk);

  /* ------------------------------------------------- real check, real parser */
  H.calendarSpec([{ offset_min: -40, currency: 'USD', title: 'NFP' }, { offset_min: 40, currency: 'USD', title: 'CPI' }]);
  const first = await B.newsCheck('EURUSD', pair);
  ok('the app’s own calendar parser fed the rule: one synthetic release is in, one is out, and the parsed title/currency survive', first.events.length === 1 && first.events[0].title === 'NFP' && first.events[0].currency === 'USD', first.events);
  ok('a planned release 40 minutes in the FUTURE is not a blackout under a 15-minute block, even though a 45 would have caught it', !first.events.some((e) => e.title === 'CPI'), first.events.map((e) => e.title));
  ok('a release 40 minutes AGO is a blackout under the 45-minute settle, labelled with the side that caught it', first.events.some((e) => e.side === 'after' && e.offset_min === 40), first.events);
  ok('the blackout names the release, the elapsed time and the two configured numbers, and says the settle still has to pass', /NFP printed 40 min ago/.test(first.blackout) && /15 min before \/ 45 min after/.test(first.blackout) && /until the settle passes/.test(first.blackout), first.blackout);
  ok('the payload echoes the pair it actually applied, so a caller never has to guess the window', first.windows.before_min === 15 && first.windows.after_min === 45, first.windows);
  ok('the symbol’s currencies come from the app’s own mapping: a JPY release cannot block EURUSD', (await (async () => { H.calendarSpec([{ offset_min: -10, currency: 'JPY', title: 'BOJ' }]); return B.newsCheck('EURUSD', pair); })()).events.length === 0, 'JPY');

  /* --------------------------------------------------------- the old formula */
  // The recorded pre-M110 test, re-implemented here and run against the SAME parsed calendar, so
  // the difference between the two rules is measured on one calendar rather than asserted.
  const oldBlocked = (offsetMin, windowMin) => Math.abs(offsetMin) <= windowMin;
  H.calendarSpec([{ offset_min: -10, currency: 'USD', title: 'FOMC' }, { offset_min: 55, currency: 'USD', title: 'Retail sales' }]);
  const now10 = await B.newsCheck('EURUSD', pair);
  ok('the recorded trap is now impossible: a 5-minute setting that silently collapsed the settle cannot clear a release that printed 10 minutes ago', !oldBlocked(-10, 5) && now10.events.some((e) => e.title === 'FOMC' && e.side === 'after'), { old: oldBlocked(-10, 5), now: now10.events.map((e) => e.title) });
  ok('and the fix is not over-blocking: a release 55 minutes ahead is clear under the 15-minute block', now10.events.every((e) => e.title !== 'Retail sales'), now10.events.map((e) => e.title));
  const wider = await B.newsCheck('EURUSD', N.plan({ news_block_before_min: 60, news_settle_after_min: 45 }));
  ok('raising the BLOCK to 60 (his own option) catches the 55-minute-ahead release and leaves the settle at 45', wider.events.some((e) => e.title === 'Retail sales' && e.side === 'before' && e.window_min === 60) && wider.windows.after_min === 45, wider.events);

  /* ------------------------------------------------------------- consumers */
  const series = bars(); const win = series.slice(-260);
  const smc = SMC.analyse(win, { tf: '15m', now: win[win.length - 1].t, swingMode: 'bos', nested: true });
  const base = { price: win[win.length - 1].c, atr: smc.atr, entrySeries: { smc, price: win[win.length - 1].c, atr: smc.atr, ind: smc.ind }, indicators: smc.ind, balance: 10000, riskPct: 0.5, maxRiskPct: 1, valuePerPoint: 100000, assetClass: 'forex', symbol: 'EURUSD', minRR: 1 };
  const newsRow = (r) => ((r.candidates || [])[0] || {}).checks?.find((c) => c.key === 'news');
  const notes = (r) => ((r.candidates || [])[0] || {}).no_trade || [];

  const bare = Setup.buildSetups(smc, base);
  ok('with no note supplied the news row still describes how the test was shaped and names NO number', newsRow(bare).pass === true && /either side of the entry/.test(newsRow(bare).detail) && !/\d+\s*min/.test(newsRow(bare).detail), newsRow(bare).detail);
  const noted = Setup.buildSetups(smc, { ...base, newsNote: N.detail(pair) });
  ok('the account-sourced note replaces that fallback and names this account’s two numbers', /15 min before and 45 min after a release/.test(newsRow(noted).detail) && /from this account/.test(newsRow(noted).detail), newsRow(noted).detail);
  const dark = Setup.buildSetups(smc, { ...base, newsBlackout: first.blackout, newsNote: N.detail(pair) });
  ok('with a blackout the row fails and its detail IS the blackout text, not a second wording of it', newsRow(dark).pass === false && newsRow(dark).detail === first.blackout, newsRow(dark));
  ok('the blackout also lands in the no-trade veto list, and it is the engine’s own string', notes(dark).includes(first.blackout), notes(dark));
  ok('and it is a real veto: the blackout adds a blocking reason to the same bars that were clean a moment ago', notes(dark).length > notes(bare).length, { clean: notes(bare).length, dark: notes(dark).length });
  ok('the veto names both windows, so a NO TRADE can be audited against the settings that produced it', /15 min before \/ 45 min after/.test(notes(dark).join(' ')), notes(dark).join(' '));

  /* ------------------------------------------------------------- boundaries */
  H.calendarSpec([{ offset_min: 15, currency: 'USD', title: 'Exactly 15 ahead' }, { offset_min: -45, currency: 'USD', title: 'Exactly 45 ago' }]);
  const edge = await B.newsCheck('EURUSD', pair);
  ok('the boundaries are inclusive in the engine too: exactly 15 ahead and exactly 45 ago are each blocked on their own side', edge.events.length === 2 && edge.events.some((e) => e.side === 'before' && e.window_min === 15) && edge.events.some((e) => e.side === 'after' && e.window_min === 45), edge.events);
  H.calendarSpec([{ offset_min: 16, currency: 'USD', title: 'Just outside' }, { offset_min: -46, currency: 'USD', title: 'Just settled' }]);
  const outside = await B.newsCheck('EURUSD', pair);
  ok('one minute outside either boundary is clear, so the window is never wider than it says', outside.events.length === 0 && outside.blackout === null, outside.events);

  /* -------------------------------------------------------- read-only claim */
  H.calendarSpec([{ offset_min: -20, currency: 'USD', title: 'No-write check' }]);
  const snap = await H.snapshot();
  const again = await B.newsCheck('EURUSD', pair);
  const changed = H.changed(snap, await H.snapshot());
  ok('a news check is a read: every table is byte-identical afterwards', changed.length === 0 && again.events.length === 1, changed);
  const stored = (await u.req('/accounts', undefined, 'GET')).data.accounts.find((x) => x.id === desk.id);
  ok('and it does not rewrite the account it read the pair from', stored.news_block_before_min === 15 && stored.news_settle_after_min === 45, { before: stored.news_block_before_min, after: stored.news_settle_after_min });

  /* --------------------------------------------------- the still-open M111 */
  const M = require(path.join(H.APP, 'src/market'));
  H.calendarSpec(null);
  const cal = await M.getCalendar();
  ok('M111’s feed really does fail here (the shim is refusing the URL, not serving an empty week)', cal.ok === false && /calendar/i.test(cal.error || '') && cal.events.length === 0, { ok: cal.ok, error: cal.error });
  const dead = await B.newsCheck('EURUSD', pair);
  ok('M110 does not claim to fix M111: a failed calendar still reaches this rule as a QUIET one — blackout null and no unavailable flag', dead.blackout === null && dead.windows.unavailable === undefined, { blackout: dead.blackout, windows: dead.windows });
  ok('a failure is not cached the way a success is, so the next check retries the feed instead of freezing the outage', (await M.getCalendar()).ok === false, 'retry');
  ok('and the pair is still echoed on that path, so the outage can never be read as “45 minutes was applied and nothing was found”', dead.windows.before_min === 15 && dead.windows.after_min === 45, dead.windows);
  ok('the engine source keeps the M111 marker at that exact branch, so closing M111 later cannot be mistaken for a regression', /M111 is open and NOT solved here/.test(fs.readFileSync(path.join(H.APP, 'src/bots/index.js'), 'utf8')), 'marker');
});
