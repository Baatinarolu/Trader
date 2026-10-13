'use strict';
/** M110 freshness probe: the news window is measured at the moment of the check, from the pair the
 * account holds at that moment — it is not frozen for the day the way the guardrail caps are, and
 * it is not decided at the moment the calendar was fetched either.
 *
 * The calendar here is the app's own fetch path (the shim only answers the URL), so the 15-minute
 * cache, its TTL and the re-fetch are the product's own behaviour. Offline: no live feed, no
 * provider claim. */
const H = require('./m110-test-support'), { ok, start, account, finish } = H;
const path = require('path'), fs = require('fs');
const B = require(path.join(H.APP, 'src/bots'));
const N = H.mod('src/news-window');   // absent on the committed parent: a measured control
const shim = require('./calendar-shim');
const PAIR = N ? N.plan({ news_block_before_min: 15, news_settle_after_min: 45 }) : null;

finish('M110 freshness', async () => {
  if (!H.shipped(N, 'the M110 news-window module')) return;
  const u = await start('m110-freshness');
  const desk = await account(u, 'Freshness desk', { news_block_before_min: 15, news_settle_after_min: 45 });

  /* ONE absolute event, four frozen clocks — two of them beyond the app's own 15-minute cache TTL,
   * where the feed is re-read and the identical event comes back, so every verdict below is about
   * the same release and not about a date the shim moved. */
  H.setNow(H.now() + 16 * 60000);                    // past any cache left by another probe
  const t0 = H.now();
  const AT = t0 + 20 * 60000;
  shim.setSpec([{ at_ms: AT, currency: 'USD', title: 'Freshness NFP' }]);
  const atFetch = await B.newsCheck('EURUSD', PAIR);
  ok('a release 20 minutes ahead is not reached by the 15-minute block when the feed is fetched', atFetch.events.length === 0 && atFetch.upcoming.some((e) => e.title === 'Freshness NFP' && e.in_minutes === 20), atFetch.upcoming);

  H.setNow(t0 + 10 * 60000);                          // inside the app's own 15-minute TTL
  const plus10 = await B.newsCheck('EURUSD', PAIR);
  ok('ten minutes later the SAME cached feed blocks that same release on the before side, with the offset re-measured to 10', plus10.events.length === 1 && plus10.events[0].side === 'before' && plus10.events[0].offset_min === 10 && plus10.events[0].window_min === 15, plus10.events);
  ok('so the window is applied at the check, not frozen at fetch time: the release crossed the 15-minute boundary while nothing about the feed changed', atFetch.windows.before_min === plus10.windows.before_min && atFetch.windows.after_min === plus10.windows.after_min);

  H.setNow(t0 + 40 * 60000);                          // TTL expired: re-fetched, same absolute event
  const past20 = await B.newsCheck('EURUSD', PAIR);
  ok('twenty minutes after that same release printed, and after the app re-read the feed, it is STILL a blackout — now on the after side and judged by the 45-minute settle', past20.events.length === 1 && past20.events[0].side === 'after' && past20.events[0].offset_min === 20 && past20.events[0].window_min === 45, past20.events);
  ok('the blackout text says which side carried it and how long ago it printed', /printed 20 min ago/.test(past20.blackout) && /until the settle passes/.test(past20.blackout), past20.blackout);
  ok('a blackout is not “sticky”: the sentence is rebuilt from this check’s offsets rather than remembered', atFetch.blackout === null && plus10.blackout !== past20.blackout && /in 10 min/.test(plus10.blackout), { fetch: atFetch.blackout, later: past20.blackout });

  H.setNow(t0 + 70 * 60000);                          // 50 minutes after it printed: past the settle
  const settled = await B.newsCheck('EURUSD', PAIR);
  ok('fifty minutes after it printed the same release is clear at last, so the settle ends rather than accumulating', settled.events.length === 0 && settled.blackout === null && settled.windows.after_min === 45, settled);

  /* The pair is read from the account on every check — nothing about it is frozen for the day. */
  H.setNow(t0 + 70 * 60000);
  shim.setSpec([{ offset_min: -100, currency: 'USD', title: 'Long printed' }]); H.setNow(H.now() + 16 * 60000);
  const narrow = await B.newsCheck('EURUSD', N.plan(desk));
  ok('under 15/45 a release that printed 100 minutes ago is clear', narrow.events.length === 0 && narrow.windows.source.join(',') === 'news_block_before_min:stored,news_settle_after_min:stored', narrow.windows);
  const put = await u.req('/accounts/' + desk.id, { news_block_before_min: 60, news_settle_after_min: 240 }, 'PUT');
  const widened = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  ok('the very next check uses the new pair, with no cache bust and no “applies tomorrow” freeze: 60/240 catches the 100-minute-old release', put.status === 200 && widened.data.windows.before_min === 60 && widened.data.windows.after_min === 240 && widened.data.events.some((e) => e.title === 'Long printed' && e.side === 'after' && e.offset_min === 100 && e.window_min === 240), widened.data.events);
  ok('and the answer says where the numbers came from — `current` (the pair in force, read from the account) when the request overrides nothing, `request` when it does', widened.data.settings.sources.join(',') === 'news_block_before_min:current,news_settle_after_min:current' && (await u.req('/bots/news/EURUSD?account_id=' + desk.id + '&after=240', undefined, 'GET')).data.settings.sources.join(',') === 'news_block_before_min:current,news_settle_after_min:request', widened.data.settings.sources);
  await u.req('/accounts/' + desk.id, { news_block_before_min: 15, news_settle_after_min: 45 }, 'PUT');

  const src = fs.readFileSync(path.join(H.APP, 'src/news-window.js'), 'utf8');
  ok('nothing in the rule or its note claims a freeze, a next-day application or a per-day snapshot, because there is none', !/frozen|applies tomorrow|takes effect tomorrow|next day/i.test(src) && !/frozen|tomorrow/i.test(N.detail(N.plan({ news_block_before_min: 5, news_settle_after_min: 45 }))));
  const guardrailSrc = fs.readFileSync(path.join(H.APP, 'src/bots/guardrails.js'), 'utf8');
  const dbSrc = fs.readFileSync(path.join(H.APP, 'src/db.js'), 'utf8');
  const capsDdl = dbSrc.slice(dbSrc.indexOf('CREATE TABLE IF NOT EXISTS guardrail_day_caps'), dbSrc.indexOf('CREATE TABLE IF NOT EXISTS', dbSrc.indexOf('CREATE TABLE IF NOT EXISTS guardrail_day_caps') + 10));
  ok('the guardrail day snapshot has no news column and its module never mentions the pair, so a news pair can never be frozen by the mechanism that freezes the caps', !/news/i.test(guardrailSrc) && !/news/i.test(capsDdl) && /max_trades_day/.test(capsDdl));

  /* The rule is UTC-epoch arithmetic: a trader's display timezone cannot move it. */
  const beforeTz = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  const tzPut = await u.req('/settings', { timezone: 'Pacific/Kiritimati' }, 'PUT');
  const afterTz = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  ok('changing the trader’s display timezone changes nothing about the news verdict: same events, same offsets, same two numbers', tzPut.status === 200 && JSON.stringify(afterTz.data.events) === JSON.stringify(beforeTz.data.events) && JSON.stringify(afterTz.data.windows) === JSON.stringify(beforeTz.data.windows), { tz: tzPut.status, events: afterTz.data.events });
  ok('a UTC day boundary cannot move the window either: the rule takes a single instant plus an event instant and never a date', !/toISOString\(\)\.slice|getUTCDate|dayOf|startOfDay/.test(src) && /function hit\(eventMs, nowMs, pair\)/.test(src));

  const row = (await u.req('/accounts', undefined, 'GET')).data.accounts.find((x) => x.id === desk.id);
  const snapshot = JSON.stringify(row);
  N.plan(row); N.hit(Date.now() - 30 * 60000, Date.now(), N.plan(row));
  ok('planning and testing leave the account row exactly as it was: the read path cannot write back a “resolved” pair', JSON.stringify(row) === snapshot);
  ok('and every read of the same row yields the same pair twice in a row, with nothing cached inside the module', JSON.stringify(N.plan(row)) === JSON.stringify(N.plan(row)));
});
