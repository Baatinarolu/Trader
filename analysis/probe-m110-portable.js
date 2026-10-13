'use strict';
/** M110 portable probe: the backup/restore surface and the self-containment of the news rule.
 *
 * Two claims are measured. First, the pair travels OUT in a bundle as a record of settings, but a
 * bundle can never move the pair of the desk that imports it — not by exporting a looser one, not
 * by arriving from the parent release with no news keys at all, and not by declaring the keys at
 * the bundle root. Second, `src/news-window.js` is a leaf: it requires nothing, reads no clock of
 * its own outside `Date.now()` and works when copied out of the tree, so the rule has no hidden
 * dependency on this repository or on the probes that measure it. */
const H = require('./m110-test-support'), { ok, start, account, finish } = H;
const path = require('path'), fs = require('fs'), os = require('os');
const N = H.mod('src/news-window');   // absent on the committed parent: a measured control

finish('M110 portability', async () => {
  if (!H.shipped(N, 'the M110 news-window module')) return;
  const u = await start('m110-portable');
  const desk = await account(u, 'Portable desk', { news_block_before_min: 5, news_settle_after_min: 60 });
  const pairOf = async () => { const a = (await u.req('/accounts', undefined, 'GET')).data.accounts; return a.map((x) => [x.name, x.news_block_before_min, x.news_settle_after_min]); };
  const mine = async () => (await pairOf()).find((r) => r[0] === 'Portable desk');
  const count = async () => (await u.req('/accounts', undefined, 'GET')).data.accounts.length;

  /* ---------------------------------------------------- the module is a leaf */
  const src = fs.readFileSync(path.join(H.APP, 'src/news-window.js'), 'utf8');
  ok('the rule is a leaf module: it requires nothing at all, so it cannot pull in the app, a database or a test helper', !/\brequire\s*\(/.test(src) && !/\bimport\s+/.test(src));
  ok('and it reads no environment, no filesystem, no absolute path and not even the clock: `now` is passed in, so its decision is reproducible from its arguments alone', !/process\.env|require\(|readFileSync|\/tmp\/|__dirname|analysis\//.test(src) && !/Date\.now\(/.test(src));
  ok('every shipped importer reaches it by a relative path inside the tree, so a copy of the tree needs nothing outside it', ["src/bots/index.js", "src/routes/api.js", "src/routes/bots.js"].every((r) => /require\('\.\.\/news-window'\)/.test(fs.readFileSync(path.join(H.APP, r), 'utf8'))) && !/news-window/.test(fs.readFileSync(path.join(H.APP, 'src/state-gate.js'), 'utf8')));
  const files = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === 'node_modules') continue; const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.(js|html)$/.test(f)) files.push(f); } };
  walk(path.join(H.APP, 'src')); walk(path.join(H.APP, 'public'));
  const leaks = files.filter((f) => /M110_CALENDAR_SPEC|calendar-shim|m110-test-support|probe-m110|m110-test-support/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(H.APP, f));
  ok('no shipped file mentions this milestone’s harness, its shim or its probes: the tests measure the product, the product does not know about the tests', leaks.length === 0, leaks);

  const copy = path.join(os.tmpdir(), `m110-leaf-${process.pid}`);
  fs.mkdirSync(copy, { recursive: true });
  fs.copyFileSync(path.join(H.APP, 'src/news-window.js'), path.join(copy, 'news-window.js'));
  const leaf = require(path.join(copy, 'news-window.js'));
  const deskRow = (await u.req('/accounts', undefined, 'GET')).data.accounts.find((x) => x.id === desk.id);
  ok('copied out of the repository, the module produces byte-identical decisions — the rule is the file, not the checkout', JSON.stringify(leaf.plan(deskRow)) === JSON.stringify(N.plan(deskRow)) && JSON.stringify(leaf.hit(Date.now() - 30 * 60000, Date.now(), N.plan(deskRow))) === JSON.stringify(N.hit(Date.now() - 30 * 60000, Date.now(), N.plan(deskRow))));

  /* ------------------------------------------------- the pair travels out */
  const bundle = (await u.req('/export/json', undefined, 'GET')).data;
  const exported = (bundle.accounts || []).find((a) => a.id === desk.id);
  ok('a backup carries the pair out, so a trader can see which window their own archive was taken under — as two columns, with no single knob beside them', !!exported && exported.news_block_before_min === 5 && exported.news_settle_after_min === 60 && !('window_min' in exported) && !Object.keys(exported).some((k) => /window/i.test(k) && k !== 'routine_window_start'), exported && Object.keys(exported).filter((k) => /news|window/.test(k)));

  /* -------------------------------------------- a foreign bundle cannot loosen it */
  const before = await mine();
  const foreign = {
    trades: [{ account_id: 99, symbol: 'EURUSD', direction: 'long', status: 'closed', opened_at: '2026-10-12T10:00:00.000Z', closed_at: '2026-10-12T11:00:00.000Z', entry: 1.1, exit: 1.101, stop: 1.099, target: 1.102, size: 1, setup_grade: 'B' }],
    accounts: [{ id: 99, name: 'Portable desk', starting_balance: 10000, news_block_before_min: 1, news_settle_after_min: 240, window_min: 5 }],
  };
  const imp = await u.req('/import/json', { data: foreign });
  ok('a foreign bundle imports (so the next result is a real import, not a refused request)', imp.status === 200 && imp.data.ok === true && imp.data.inserted === 1, imp.data);
  ok('and it CANNOT move the importing desk’s pair: a looser 1/240 in an archive does not become this trader’s window', JSON.stringify(await mine()) === JSON.stringify(before), { before, after: await mine() });
  ok('it also does not create an account from the bundle: an archive restores trades, never desks or their settings', (await count()) === 2, await count());
  ok('the imported trade was mapped onto the named desk, which is what makes the untouched pair a result rather than a no-op', (await u.req('/trades?account_id=' + desk.id, undefined, 'GET')).data.trades.some((t) => t.symbol === 'EURUSD'));

  /* ------------------------------------------- a parent-era bundle and a root-level claim */
  const parental = await u.req('/import/json', { data: { trades: [], accounts: [{ id: 1, name: 'Portable desk', starting_balance: 5000 }] } });
  ok('a bundle from the previous release (accounts with no news keys at all) imports without inventing one', parental.status === 200 && JSON.stringify(await mine()) === JSON.stringify(before), parental.data);
  const rooty = await u.req('/import/json', { data: { trades: [], window_min: 5, news_settle_after_min: 5, news_block_before_min: 1, accounts: [] } });
  ok('keys declared at the ROOT of a bundle are ignored rather than applied: the import surface has no news authority', rooty.status === 200 && JSON.stringify(await mine()) === JSON.stringify(before), rooty.data);
  ok('and the pair is nowhere in the bundle’s own vocabulary: no import code path writes the news columns', !/news_block_before_min|news_settle_after_min/.test(fs.readFileSync(path.join(H.APP, 'src/routes/api.js'), 'utf8').split("router.post('/import/json'")[1].split("router.put('/settings'")[0]));

  /* --------------------------------------------------------------- csv path */
  const csv = await u.req('/import/csv', { csv: 'symbol,direction,status,opened_at,entry,exit,stop,target,size,setup_grade\nEURUSD,long,closed,2026-10-12T12:00:00.000Z,1.1,1.101,1.099,1.102,1,B' });
  ok('a CSV import carries no settings of any kind and leaves the pair alone', csv.status === 200 && JSON.stringify(await mine()) === JSON.stringify(before), csv.data);

  /* ------------------------------------------------- a legacy row is reported, not defaulted */
  const legacy = N.plan({ name: 'Legacy desk' });
  ok('a desk with no stored pair is reported as `default` on both sides, so an unanswered setting is visible instead of passing as a stored one', legacy.before_min === 15 && legacy.after_min === 45 && legacy.source.join(',') === 'news_block_before_min:default,news_settle_after_min:default', legacy.source);
  await u.req('/bots/news/EURUSD?account_id=' + desk.id + '&before=60&after=120', undefined, 'GET');
  ok('research overrides are per request and never written back: after a widened research call the stored pair is still the trader’s own', JSON.stringify(await mine()) === JSON.stringify(before), { before, after: await mine() });
});
