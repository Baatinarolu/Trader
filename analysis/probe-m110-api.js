'use strict';
/** M110 API probe: the two settings over HTTP — validation, refusal codes, defaults, the
 * news endpoint's pair, and user scoping. Actual runtime/auth/SQL/HTTP, fixed UTC clock. */
const H = require('./m110-test-support'), { ok, start, account, finish } = H;
const N = H.mod('src/news-window');   // absent on the committed parent: a measured control

finish('M110 API: the two news settings, the settle floor, the refused single knob, per-account pair', async () => {
  if (!H.shipped(N, 'the M110 news-window module')) return;
  const u = await start('m110-api');
  const list = async (auth) => (await u.req('/accounts', undefined, 'GET', auth || u.token)).data.accounts;
  const before = (await list()).length;

  /* ------------------------------------------------------------ creation */
  const a = await account(u, 'Defaults desk');
  ok('a new account stores the episode defaults: 15 minutes before, 45 minutes after', a.news_block_before_min === 15 && a.news_settle_after_min === 45, { b: a.news_block_before_min, a: a.news_settle_after_min });
  ok('the creation response carries the pair and the honest note about it', a._res.news_note.before_min === 15 && a._res.news_note.after_min === 45 && a._res.news_note.range.settle_floor === 30, a._res.news_note && a._res.news_note.range);
  ok('the two fields are separate columns on the account row, not one knob', 'news_block_before_min' in a && 'news_settle_after_min' in a && !('news_window_min' in a) && !('window_min' in a), Object.keys(a).filter((k) => /news|window/.test(k)));
  const b = await account(u, 'Wide block desk', { news_block_before_min: 60, news_settle_after_min: 30 });
  ok('both settings are storable at their bounds (block 60, settle 30)', b.news_block_before_min === 60 && b.news_settle_after_min === 30, { b: b.news_block_before_min, a: b.news_settle_after_min });
  const c = await account(u, 'Aggressive desk', { news_block_before_min: 5 });
  ok('a 5-minute block is accepted (he demonstrates it) and the settle stays at its own default', c.news_block_before_min === 5 && c.news_settle_after_min === 45, { b: c.news_block_before_min, a: c.news_settle_after_min });
  ok('the creation response warns about the block, quoting his recommendation, without refusing it', c._res.news_note.warnings.some((w) => w.code === 'news_block_before_below_recommended'), c._res.news_note.warnings);

  /* -------------------------------------------------------------- refusals */
  const floor = await u.req('/accounts', { name: 'Floor desk', news_settle_after_min: 29 });
  ok('a settle below the 30-minute floor is refused 400 with its own code and nothing created', floor.status === 400 && floor.data.code === 'news_settle_below_floor' && (await list()).length === before + 3, { status: floor.status, code: floor.data && floor.data.code, n: (await list()).length });
  const legacy = await u.req('/accounts', { name: 'Legacy desk', window_min: 5 });
  ok('the old single knob is refused on creation rather than split for the caller', legacy.status === 400 && legacy.data.code === 'news_window_split_required', { status: legacy.status, code: legacy.data && legacy.data.code });
  for (const [label, body] of [['booleans', true], ['arrays', []], ['objects', {}], ['blanks', ' '], ['fractions', 1.5], ['zero', 0], ['above the maximum', 241], ['huge', 1e9]])
    ok(`a hostile settle (${label}) is refused as invalid, not coerced`, (await u.req('/accounts', { name: 'Hostile ' + label, news_settle_after_min: body })).status === 400, label);

  /* ------------------------------------------------------------- the update */
  const upd = await u.req('/accounts/' + a.id, { news_settle_after_min: 5 }, 'PUT');
  const after = (await list()).find((x) => x.id === a.id);
  ok('an update that tries to shorten the settle to 5 is refused 400 and the stored row is untouched', upd.status === 400 && upd.data.code === 'news_settle_below_floor' && after.news_settle_after_min === 45, { status: upd.status, stored: after.news_settle_after_min });
  const lowBlock = await u.req('/accounts/' + a.id, { news_block_before_min: 5 }, 'PUT');
  ok('an update that shortens only the block succeeds and warns', lowBlock.status === 200 && lowBlock.data.account.news_block_before_min === 5 && lowBlock.data.news_note.warnings.some((w) => w.code === 'news_block_before_below_recommended'), lowBlock.data.news_note && lowBlock.data.news_note.warnings);
  ok('that update did NOT touch the settle: the two settings move independently', lowBlock.data.account.news_settle_after_min === 45, lowBlock.data.account.news_settle_after_min);
  const rename = await u.req('/accounts/' + a.id, { name: 'Renamed desk' }, 'PUT');
  ok('an unrelated edit (a rename) leaves both news settings exactly as stored', rename.data.account.news_block_before_min === 5 && rename.data.account.news_settle_after_min === 45, { b: rename.data.account.news_block_before_min, a: rename.data.account.news_settle_after_min });
  const updLegacy = await u.req('/accounts/' + a.id, { newsWindowMin: 5 }, 'PUT');
  ok('the old single knob is refused on update too, with nothing written', updLegacy.status === 400 && updLegacy.data.code === 'news_window_split_required' && (await list()).find((x) => x.id === a.id).news_settle_after_min === 45, updLegacy.data);

  /* ---------------------------------------------------------- news endpoint */
  H.calendarSpec([{ offset_min: -40, currency: 'USD', title: 'NFP' }, { offset_min: 40, currency: 'USD', title: 'CPI' }]);
  const legacyQuery = await u.req('/bots/news/EURUSD?window=5', undefined, 'GET');
  ok('the news endpoint refuses the old ?window= parameter instead of choosing a side for the caller', legacyQuery.status === 400 && legacyQuery.data.code === 'news_window_split_required', { status: legacyQuery.status, code: legacyQuery.data && legacyQuery.data.code });
  for (const q of ['window', 'window_min', 'windowMin', 'newsWindowMin', 'news_window_min']) {
    const r = await u.req(`/bots/news/EURUSD?${q}=5`, undefined, 'GET');
    ok(`every legacy spelling of the single knob is refused on the query (${q}): a legacy caller is told the rule was split, not silently served its own pair`, r.status === 400 && r.data.code === 'news_window_split_required', { q, status: r.status, code: r.data && r.data.code });
  }
  const smuggled = await u.req('/accounts/' + a.id, { news_settle_after_min: 45, window_min: 5 }, 'PUT');
  ok('a legacy knob smuggled in beside a valid pair is refused rather than ignored, and the stored pair is untouched', smuggled.status === 400 && smuggled.data.code === 'news_window_split_required' && (await list()).find((x) => x.id === a.id).news_block_before_min === 5, smuggled.data);
  const stored = await u.req('/bots/news/EURUSD?account_id=' + a.id, undefined, 'GET');
  ok('with no query pair the endpoint uses that account’s stored pair (block 5 on this desk, settle 45)', stored.status === 200 && stored.data.windows.before_min === 5 && stored.data.windows.after_min === 45, stored.data.windows);
  const defaultDesk = await u.req('/bots/news/EURUSD', undefined, 'GET');
  ok('omitting account_id resolves the trader’s OWN default desk (15/45), never another account’s pair', defaultDesk.status === 200 && defaultDesk.data.windows.before_min === 15 && defaultDesk.data.windows.after_min === 45 && defaultDesk.data.windows.after_min !== 45 - 1, defaultDesk.data.windows);
  ok('and reports the release 40 minutes ago as blocked on the after side while the 40-minute-ahead one is clear', stored.data.events.length === 1 && stored.data.events[0].title === 'NFP' && stored.data.events[0].side === 'after' && stored.data.events[0].offset_min === 40, stored.data.events);
  ok('the settings note travels with the answer, names the same numbers, its sources and the models limit', stored.data.settings.before_min === 5 && stored.data.settings.after_min === 45 && /two separate clocks/.test(stored.data.settings.models) && stored.data.settings.broker_verified === false && stored.data.settings.sources.join(',').includes('news_settle_after_min'), stored.data.settings);
  const wide = await u.req('/bots/news/EURUSD?before=60&after=120', undefined, 'GET');
  ok('per-request research overrides are honoured, echoed, and their sources say they came from the request', wide.status === 200 && wide.data.windows.before_min === 60 && wide.data.windows.after_min === 120 && wide.data.settings.sources.join(',') === 'news_block_before_min:request,news_settle_after_min:request', wide.data.settings.sources);
  ok('the wider research pair now blocks the release due in 40 minutes, on the before side', wide.data.events.length === 2 && wide.data.events.some((e) => e.title === 'CPI' && e.side === 'before' && e.offset_min === 40), wide.data.events);
  const floorQuery = await u.req('/bots/news/EURUSD?after=5', undefined, 'GET');
  ok('the settle floor applies to research overrides too: ?after=5 is refused', floorQuery.status === 400 && floorQuery.data.code === 'news_settle_below_floor', floorQuery.data);
  const junkQuery = await u.req('/bots/news/EURUSD?before=abc&after=[]', undefined, 'GET');
  ok('hostile query values are refused rather than coerced', junkQuery.status === 400 && junkQuery.data.code === 'news_window_invalid', junkQuery.data);

  /* --------------------------------------------------------------- scoping */
  const otherList = await list(u.otherToken);
  ok('another trader sees only their own desk, and it carries the episode defaults rather than this one’s pair', otherList.length === 1 && otherList.every((x) => x.id !== a.id) && otherList[0].news_block_before_min === 15 && otherList[0].news_settle_after_min === 45, otherList.map((x) => [x.id, x.news_block_before_min, x.news_settle_after_min]));
  const otherNews = await u.req('/bots/news/EURUSD', undefined, 'GET', u.otherToken);
  ok('and their news endpoint reports the defaults 15/45, not the first desk’s 5/45', otherNews.status === 200 && otherNews.data.windows.before_min === 15 && otherNews.data.windows.after_min === 45, otherNews.data.windows);
  const otherAccount = await u.req('/accounts/' + a.id, { news_block_before_min: 240 }, 'PUT', u.otherToken);
  ok('another trader cannot edit this account’s news settings at all', otherAccount.status === 404 && (await list()).find((x) => x.id === a.id).news_block_before_min === 5, otherAccount.status);
});
