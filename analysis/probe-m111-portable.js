'use strict';
/** M111 portable probe: the state vocabulary did not make the news module any less of a leaf, did
 * not add an importer, and did not put a test helper, a shim or a probe into shipped code. The
 * module is copied into a tmpdir and must answer identically there, because the rule is the file. */
const fs = require('fs'), path = require('path'), os = require('os');
const H = require('./m111-test-support'), { ok } = H;
const N = H.mod('src/news-window');
H.finish('M111 portability: the vocabulary is a leaf, and nothing shipped mentions the harness', async () => {
  if (!H.shipped(N, 'the M111 calendar-read state vocabulary')) return;
  const rel = 'src/news-window.js';
  const src = fs.readFileSync(path.join(H.APP, rel), 'utf8');

  /* ------------------------------------------------------------------- the leaf rules */
  ok('the module still requires nothing at all: no app module, no database, no fetcher, no helper', !/\brequire\s*\(/.test(src), 'require');
  ok('it still reads no environment, no filesystem and no path, so it cannot be configured from outside itself', !/process\.env|\breadFileSync\b|\bwriteFileSync\b|\b__dirname\b/.test(src), 'env');
  ok('it still calls no clock of its own and takes its instants as arguments', !/Date\.now\(/.test(src) && !/new Date\(\s*\)/.test(src), 'clock');
  ok('a copied module makes the same decisions as the shipped one, including the new state mapping', (() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm111-leaf-'));
    fs.copyFileSync(path.join(H.APP, rel), path.join(dir, 'news-window.js'));
    const leaf = require(path.join(dir, 'news-window.js'));
    const eq = JSON.stringify(leaf.STATES) === JSON.stringify(N.STATES)
      && leaf.stateOf({ blackout: 'x' }) === N.stateOf({ blackout: 'x' })
      && leaf.stateOf({ unavailable: 'y' }) === N.stateOf({ unavailable: 'y' })
      && leaf.unknownNote('why') === N.unknownNote('why')
      && JSON.stringify(leaf.policy()) === JSON.stringify(N.policy());
    fs.rmSync(dir, { recursive: true, force: true });
    return eq;
  })());

  /* ------------------------------------------------------- who may reach the rule, and how */
  const importers = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p); } else if (/\.js$/.test(e.name)) { if (/require\([^)]*news-window/.test(fs.readFileSync(p, 'utf8'))) importers.push(path.relative(H.APP, p)); } } };
  walk(H.APP);
  ok('exactly the three shipped files that already reached it still do — M111 added no importer, so the state cannot leak into a module that had no reason to know it', JSON.stringify(importers.sort()) === JSON.stringify(['src/bots/index.js', 'src/routes/api.js', 'src/routes/bots.js']), importers.sort());
  ok('and M111 added the vocabulary to the SAME file as the two clocks, so the module count did not grow', importers.length === 3 && fs.existsSync(path.join(H.APP, 'src/news-window.js')));

  /* ------------------------------------------------------- nothing shipped knows the harness */
  const harness = /M111_CALENDAR_SPEC|m111-test-support|m110-test-support|calendar-shim|probe-m111|run-m111/;
  const offenders = [];
  const scan = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(p)) scan(p); } else if (/\.(js|html|json|md)$/.test(e.name)) { if (harness.test(fs.readFileSync(p, 'utf8')) && !/^scripts\/fixtures/.test(path.relative(H.APP, p))) offenders.push(path.relative(H.APP, p)); } } };
  scan(H.APP);
  ok('no shipped file mentions a probe, the shim or the test support, so the fix is in the app and not in its harness', offenders.length === 0, offenders);
  ok('the market layer is NOT rewired to the harness: it still reads the real feed URLs, and its own failure path is what M111 classifies', /nfs\.faireconomy\.media/.test(fs.readFileSync(path.join(H.APP, 'src/market.js'), 'utf8')) && !/M111/.test(fs.readFileSync(path.join(H.APP, 'src/market.js'), 'utf8')));

  /* ------------------------------------------------------------- and the docs describe it */
  const api = fs.readFileSync(path.join(H.APP, 'docs/API.md'), 'utf8');
  ok('the API documentation names the three states and the fact that unknown is not a pass, so the contract is written down where a client reads it', /M111/.test(api) && /unknown/.test(api) && /blocked/.test(api) && /clear/.test(api), 'docs');
});
