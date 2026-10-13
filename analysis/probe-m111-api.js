'use strict';
/** M111 API probe: the same three states over the app's own HTTP surface. `/bots/news/:symbol`
 * is the route a client or an alert reads, so an outage has to be legible THERE — as a state and a
 * sentence — and the account settings that produced the pair must be untouched by a read. */
const path = require('path');
const H = require('./m111-test-support'), { ok } = H;
const N = H.mod('src/news-window');
H.finish('M111 API: the outage is legible over HTTP', async () => {
  if (!H.shipped(N, 'the M111 calendar-read state vocabulary')) return;
  const S = N.STATES;
  const u = await H.start('m111-api');
  const desk = await H.account(u, 'M111 api desk', { news_block_before_min: 20, news_settle_after_min: 60 });

  /* ------------------------------------------------------------------ a quiet read */
  H.calendarSpec([{ offset_min: 30, currency: 'JPY', title: 'BoJ' }]);
  const quiet = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  ok('a calendar that was read and holds nothing for this symbol answers 200 `clear` with the account\'s own two windows', quiet.status === 200 && quiet.data.ok === true && quiet.data.state === S.CLEAR && quiet.data.windows.before_min === 20 && quiet.data.windows.after_min === 60, { status: quiet.status, state: quiet.data.state, windows: quiet.data.windows });

  /* --------------------------------------------------------------------- the outage */
  H.calendarSpec(null);
  const before = await u.req('/accounts', undefined, 'GET');
  const outage = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  const after = await u.req('/accounts', undefined, 'GET');
  ok('an unreadable calendar answers 200 with an `unknown` state — not a 500, not an empty 200 that reads like a quiet week', outage.status === 200 && outage.data.ok === true && outage.data.state === S.UNKNOWN, { status: outage.status, state: outage.data.state });
  ok('the response carries the reason and the sentence, so a client can render the failure rather than inventing one', typeof outage.data.unavailable === 'string' && outage.data.error === outage.data.unavailable && outage.data.unavailable_note === N.unknownNote(outage.data.unavailable), { unavailable: outage.data.unavailable, note: outage.data.unavailable_note });
  ok('the sentence never claims an all-clear, which is the whole defect being closed', !/all-clear/.test(outage.data.unavailable_note.replace('NOT an all-clear', '')) && /NOT an all-clear/.test(outage.data.unavailable_note), outage.data.unavailable_note);
  ok('and the two windows are still reported, so the client can say WHICH windows were not checked', outage.data.windows.before_min === 20 && outage.data.windows.after_min === 60 && outage.data.windows.unavailable === true, outage.data.windows);
  ok('a news read is a read: the account row is byte-identical across the outage', JSON.stringify(before.data.accounts) === JSON.stringify(after.data.accounts), { before: before.data.accounts.length, after: after.data.accounts.length });

  /* ------------------------------------------------------------ a real block, unchanged */
  H.calendarSpec([{ offset_min: 5, currency: 'USD', title: 'CPI' }]);
  const blocked = await u.req('/bots/news/EURUSD?account_id=' + desk.id, undefined, 'GET');
  ok('a known release inside the account\'s own block still answers `blocked` with the M110 sentence and the per-event side', blocked.data.state === S.BLOCKED && /CPI in 5 min/.test(blocked.data.blackout) && /20 min before \/ 60 min after/.test(blocked.data.blackout) && blocked.data.events[0].side === 'before' && blocked.data.events[0].window_min === 20, { state: blocked.data.state, blackout: blocked.data.blackout });

  /* ------------------------------------------------- the M110 rules survive M111 over HTTP */
  H.calendarSpec([{ offset_min: 5, currency: 'USD', title: 'CPI' }]);
  const legacy = await u.req('/bots/news/EURUSD?window=5', undefined, 'GET');
  const legacyMin = await u.req('/bots/news/EURUSD?window_min=5', undefined, 'GET');
  const smuggled = await u.req('/bots/news/EURUSD?before=60&after=120&window=5', undefined, 'GET');
  ok('the single-knob refusals still hold on the wire while a calendar is failing and while it is fine', legacy.status === 400 && legacy.data.code === 'news_window_split_required' && legacyMin.status === 400 && legacyMin.data.code === 'news_window_split_required' && smuggled.status === 400 && smuggled.data.code === 'news_window_split_required', { legacy: legacy.data.code, smuggled: smuggled.data.code });
  const floor = await u.req('/bots/news/EURUSD?after=20', undefined, 'GET');
  ok('and the settle floor is still a 400 rather than a clamped answer', floor.status === 400 && floor.data.code === 'news_settle_below_floor', floor.data.code);
  H.calendarSpec(null);
  const outageWithPair = await u.req('/bots/news/EURUSD?account_id=' + desk.id + '&before=60&after=120', undefined, 'GET');
  ok('a research pair is honoured on the outage path too, so the windows reported as unchecked are the ones the caller asked about', outageWithPair.data.windows.before_min === 60 && outageWithPair.data.windows.after_min === 120 && outageWithPair.data.state === S.UNKNOWN, outageWithPair.data.windows);
  const storeUntouched = await u.req('/accounts', undefined, 'GET');
  ok('and that research pair is not stored: an outage cannot move the trader\'s settings', storeUntouched.data.accounts.find((a) => a.id === desk.id).news_block_before_min === 20 && storeUntouched.data.accounts.find((a) => a.id === desk.id).news_settle_after_min === 60, null);

  /* ----------------------------------------------------------- the other desks are unaffected */
  const theirs = await u.req('/bots/news/EURUSD', undefined, 'GET', u.token);
  ok('the endpoint still answers for the caller\'s own default desk with the same state vocabulary', theirs.status === 200 && theirs.data.state === S.UNKNOWN);

  /* ------------------------------------------------------ and the settings route is unchanged */
  const putFloor = await u.req('/accounts/' + desk.id, { news_settle_after_min: 20 }, 'PUT');
  ok('an account update still refuses a settle below the floor while the calendar is unreadable — the two failures are independent', putFloor.status === 400 && putFloor.data.code === 'news_settle_below_floor', { status: putFloor.status, code: putFloor.data.code });
});
