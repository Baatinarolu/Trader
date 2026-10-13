'use strict';
/** M111 freshness probe: the state is a property of the READ, not of the moment. A successful read
 * is cached by the market layer for its own TTL; a FAILED read is not cached, so the next check
 * retries the feed; and a cached success cannot be served for ever once the feed starts failing.
 * Fetch calls are counted at the shim, so "retried" and "cached" are measured, not assumed. */
const path = require('path');
const H = require('./m111-test-support'), { ok } = H;
const N = H.mod('src/news-window');
const M = H.app('src/market');
const B = H.app('src/bots');
H.finish('M111 freshness: the state follows the last read', async () => {
  if (!H.shipped(N, 'the M111 calendar-read state vocabulary')) return;
  const S = N.STATES;
  const pair = N.plan({ news_block_before_min: 15, news_settle_after_min: 45 });
  /* Count the app's own calendar fetches by wrapping the fetch the shim installed. */
  let calls = 0; const inner = global.fetch;
  global.fetch = async (url, opts) => { if (String(url).includes('ff_calendar_')) calls++; return inner(url, opts); };
  const reset = () => { calls = 0; };

  /* -------------------------------------------------------------- a success is cached */
  H.calendarSpec([{ offset_min: 30, currency: 'JPY', title: 'BoJ' }]);
  reset();
  const first = await B.newsCheck('EURUSD', pair);
  const firstCalls = calls; reset();
  const second = await B.newsCheck('EURUSD', pair);
  ok('the first read of a quiet week is `clear` and it fetched the feed', first.state === S.CLEAR && firstCalls > 0, { state: first.state, calls: firstCalls });
  ok('a second check inside the TTL reuses the cached read instead of hitting the feed again', second.state === S.CLEAR && calls === 0, { state: second.state, calls });

  /* ---------------------------------------------------------- a failure is NOT cached */
  H.calendarSpec(null);   // this also advances the frozen clock past the app's 15-minute TTL
  reset();
  const outage = await B.newsCheck('EURUSD', pair);
  const outageCalls = calls; reset();
  const again = await B.newsCheck('EURUSD', pair);
  ok('once the feed fails, the check says `unknown` and it really did try the feed', outage.state === S.UNKNOWN && outageCalls > 0, { state: outage.state, calls: outageCalls });
  ok('the failure is NOT cached the way a success is: the next check retries the feed instead of freezing the outage', again.state === S.UNKNOWN && calls > 0, { state: again.state, calls });

  /* ----------------------------------------------- and the feed coming back is seen at once */
  H.calendarSpec([{ offset_min: 30, currency: 'JPY', title: 'BoJ' }]);
  reset();
  const recovered = await B.newsCheck('EURUSD', pair);
  ok('when the feed comes back the very next check reads it and returns to `clear` — no sticky unknown, and no manual reset', recovered.state === S.CLEAR && calls > 0 && !('unavailable' in recovered), { state: recovered.state, calls });

  /* ------------------------------------- a cached success cannot outlive a failing feed */
  reset();
  await B.newsCheck('EURUSD', pair);            // warm the cache with a success
  const cachedCalls = calls;
  const real = M.getCalendar;
  M.getCalendar = async () => { throw new Error('feed died mid-TTL'); };
  const duringTtl = await B.newsCheck('EURUSD', pair);
  M.getCalendar = real;
  ok('a failure INSIDE the cached window is still reported as `unknown`: the read is what is cached, not the verdict', duringTtl.state === S.UNKNOWN && /feed died mid-TTL/.test(duringTtl.unavailable), { state: duringTtl.state, unavailable: duringTtl.unavailable });
  H.calendarSpec([{ offset_min: 30, currency: 'JPY', title: 'BoJ' }]);
  reset();
  const afterTtl = await B.newsCheck('EURUSD', pair);
  ok('and after the TTL expires the feed is read again rather than a stale success being replayed for ever', afterTtl.state === S.CLEAR && calls > 0 && cachedCalls >= 0, { state: afterTtl.state, calls });

  /* ------------------------------------------------------------ the state is never stored */
  const before = await H.snapshot();
  H.calendarSpec(null); await B.newsCheck('EURUSD', pair); await B.newsCheck('EURUSD', pair);
  H.calendarSpec([{ offset_min: 5, currency: 'USD', title: 'CPI' }]); await B.newsCheck('EURUSD', pair);
  const after = await H.snapshot();
  const moved = H.changed(before, after);
  ok('no read — clear, unknown or blocked — writes any state anywhere: every table is byte-identical', moved.length === 0, moved);
  const cols = await H.D.db.prepare('PRAGMA table_info(accounts)').all();
  ok('and there is no column to store it in: the news state is derived on every check, never a stored fact', !cols.some((c) => /state|unknown|available/i.test(c.name)), cols.map((c) => c.name).filter((c) => /news|state/i.test(c)));
  const u = await H.start('m111-freshness');
  const settings = await u.req('/settings', undefined, 'GET');
  ok('nor does it leak into the user settings blob, so a state cannot survive as configuration', !Object.keys(settings.data.settings || {}).some((k) => /news_state|calendar_state|unavailable/i.test(k)), Object.keys(settings.data.settings || {}).filter((k) => /news|calendar|state/i.test(k)));
});
