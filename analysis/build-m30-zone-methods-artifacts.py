#!/usr/bin/env python3
"""M30 deterministic delivery: four constructed runtime stages, the three docs, the actual M56 release as
the measured parent and the pristine cumulative diff.

The fault this milestone fixes is a GEOMETRY that nothing could choose and nothing could name, so the
stages isolate the choice, file by file: `module` (`src/bots/smc.js` alone — the vocabulary, the folding
rule and the consolidation walk exist and NOTHING consults them), `engine` (+ `setup.js`, `momentum.js`,
`index.js` — a read can be asked for the range geometry and both payloads name the geometry they shipped
zones for), `routes` (+ the two route files — the query wins, the stored choice is consulted, the bad value
is refused by name) and `screens` (+ the two views and the three docs). Every stage tree is rebuilt from
the saved patches and must match its frozen `<stage>-source.json` byte-for-byte in BOTH directions; the
delivered tree is then stacked onto the pristine `tradingpro-main.zip` to produce `tradingpro-fixed.zip`
with an SHA companion computed outside the archive.

    python3 analysis/capture-m30-stages.py --capture                       # guards + harness hash
    python3 analysis/capture-m30-stages.py --controls                      # parent + module-only arms
    python3 analysis/build-m30-zone-methods-artifacts.py --capture-stages  # patches, ledger, ZIP
    python3 analysis/capture-m30-stages.py                                 # verify the frozen guards
    python3 analysis/build-m30-zone-methods-artifacts.py                   # replay only, twice
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m30'; P = ROOT / 'analysis/patches'
BASE_FULL = '27fbb2acbd8574a7278d880d3654bc9706e39e90'
# The git commands address the parent by its unambiguous abbreviation and assert what it resolves to:
# this sandbox is a partial clone whose lazy fetch is not always available, while the short form
# resolves from the local commit-graph. The identity is pinned to the full SHA either way.
BASE = '27fbb2a'
STAGES = [('module', 'm30-zone-methods-module.patch'), ('engine', 'm30-zone-methods-engine.patch'),
          ('routes', 'm30-zone-methods-routes.patch'), ('screens', 'm30-zone-methods-screens.patch')]
COMBINED = 'm30-zone-methods-complete.patch'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts',
                                                                                                                  'make_patch', 'contents', 'allowed', 'add_zip']]
PRIOR = runpy.run_path(str(ROOT / 'analysis/build-m112-trading-window-artifacts.py'), run_name='m30_prior_m112_artifact_helpers')
M115 = runpy.run_path(str(ROOT / 'analysis/build-m115-clean-reps-artifacts.py'), run_name='m30_prior_m115_artifact_helpers')
M56 = runpy.run_path(str(ROOT / 'analysis/build-m56-plan-gate-artifacts.py'), run_name='m30_prior_m56_artifact_helpers')
CAPTURE = runpy.run_path(str(ROOT / 'analysis/capture-m30-stages.py'), run_name='m30_capture_constants')
FILES_FOR = CAPTURE['FILES']
# Everything the earlier milestones protected (M111's own list plus the files M111, M112, M13/M65, M115 and
# M56 changed), minus what this milestone is allowed to touch.
M30_TOUCHES = list(FILES_FOR['screens'])
PROTECTED = sorted((set(PRIOR['PROTECTED']) | set(PRIOR['M111_CHANGED']) | set(PRIOR['M112_TOUCHES']) | set(M115['M13_CHANGED'])
                    | set(M115['M115_TOUCHES']) | set(M56['M56_TOUCHES'])) - set(M30_TOUCHES))
CHANGED = set(M30_TOUCHES)
ADDED = []   # no new file: the choice rides the settings JSON that already exists
DOCS = {'docs/API.md', 'docs/NOT-IMPLEMENTED.md', 'docs/PLAYLIST-CURRICULUM.md'}
ENGINE_UNCHANGED = [p for p in PRIOR['ENGINE_UNCHANGED'] if p not in CHANGED]
# The uniform opener every M30 probe shares (m30-test-support's `shipped`): the parent fails it by name,
# and the module-only stage PASSES it because the vocabulary and the walk really are there.
OPENER = "this tree ships the zone-method vocabulary and the consolidation walk (src/bots/smc.js) (the committed parent does not, and that absence is this probe's control)"
SHIPPED_M30 = 'ok ' + OPENER
PARENT_M30 = 'FAIL ' + OPENER
MODULE_ONLY_SHIPPED = SHIPPED_M30
# What the module-only arm fails on: the wiring, named assertion by assertion. The module probe itself
# passes there (the vocabulary is real and measured), and the control probe passes on all three trees by
# design because it MEASURES the fault instead of failing on it.
MODULE_ONLY_FAULTS = {
    'engine': ['FAIL the filter block names the method on every read, so the geometry is never anonymous'],
    'api': ['FAIL an analysis with no choice made runs the pivot method, and says nobody chose'],
    'migration': ['FAIL choosing the range method through the delivered route writes ONE key into the parent\u2019s row'],
}
DELIVERED_ANSWERS = {
    'pure': ['ok the vocabulary is closed and published: exactly two methods, named'],
    'engine': ['ok with no method chosen, every candidate the model builds is byte-identical to the committed parent\u2019s'],
    'api': ['ok reading the range geometry writes exactly what reading the pivot geometry writes \u2014 a method adds no row of its own'],
    'migration': ['ok the parent\u2019s own row is read un-migrated: the stored settings the delivered tree sees are the parent\u2019s bytes, with no `zone_method` added at open time'],
    'ui': ['ok and the stored choice is preselected on the next visit, so the screen never loses a decision the trader made'],
}


def gate(edir, suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/' + edir + '/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (edir, suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    assert run(['git', 'rev-parse', BASE]).decode().strip() == BASE_FULL, 'the abbreviated parent must resolve to the pinned M56 commit'
    guards = {n: read('analysis/evidence/m30/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = read('analysis/evidence/m30/screens-source.json')
    assert len(guards['parent']) == 164 and len(current) == 164, (len(guards['parent']), len(current))
    assert [len(guards[s[0]]) for s in STAGES] == [164, 164, 164, 164], {s[0]: len(guards[s[0]]) for s in STAGES}
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(p not in guards['parent'] for p in ADDED), 'an added file must be NEW in this milestone'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/journal/guard/gate/plan/intention/practice/ask/news/window/period source changed'
    assert all(guards['parent'][p] == current[p] for p in ENGINE_UNCHANGED), 'An unchanged entry-engine module moved'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED, 'Unexpected changed-file set'
    for stage, _ in STAGES:
        for rel in FILES_FOR[stage]:
            assert guards[stage][rel] == current[rel], ('the stage must carry the delivered file', stage, rel)
    assert {p for p in set(current) | set(guards['routes']) if guards['routes'].get(p) != current.get(p)} == DOCS | {'public/js/views/bots.js', 'public/js/views/settings.js'}, 'Views or docs changed runtime'
    harness = read('analysis/evidence/m30/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('m30', 'feature', 112, 0, 5)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (27, 0), 'engine': (14, 0), 'api': (29, 0), 'ui': (20, 0), 'migration': (22, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m30/m30feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    control = read('analysis/evidence/m30/control-results.json')
    assert {(r['mode'], r['pass'], r['fail'], r['exit_code']) for r in control['runs']} == {('delivered', 11, 0, 0), ('parent', 11, 0, 0), ('module', 11, 0, 0)}, control
    # The milestones this one sits on, re-run on this tree in this session through the delegated chain.
    m56 = gate('m56', 'feature', 160, 0, 5)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m56['runs']} == {'pure': (43, 0, 0), 'engine': (25, 0, 0), 'api': (43, 0, 0), 'migration': (21, 0, 0), 'ui': (28, 0, 0)}
    m115 = gate('m115', 'feature', 116, 0, 4)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m115['runs']} == {'pure': (41, 0, 0), 'api': (30, 0, 0), 'migration': (18, 0, 0), 'ui': (27, 0, 0)}
    m13 = gate('m13', 'feature', 94, 0, 4)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m13['runs']} == {'pure': (39, 0, 0), 'api': (23, 0, 0), 'migration': (13, 0, 0), 'ui': (19, 0, 0)}
    m112 = gate('m112', 'feature', 181, 0, 6)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m112['runs']} == {'pure': (36, 0, 0), 'engine': (18, 0, 0), 'consumers': (32, 0, 0), 'api': (49, 0, 0), 'migration': (16, 0, 0), 'ui': (30, 0, 0)}, \
        {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m112['runs']}
    declared = []
    # Inherited records, READ rather than re-run in this session: named by path and provenance so no
    # reader mistakes them for a measurement taken here.
    inherited = {}
    for name, suite, expected_counts in [('raw', 'raw', (596, 156, 31, 21, 1, 1)), ('declared', 'declared', (824, 4, 31, 2)), ('pure', 'pure', (70, 1, 8, 6, 0, 5))]:
        d = gate('m108', suite, *expected_counts)
        inherited[name] = {'pass': d['pass'], 'fail': d['fail'], 'probes': d['probes'], 'evidence': 'analysis/evidence/m108/' + suite + '-summary.json',
                           'why': 'Read from the committed evidence of the M108-era run rather than re-run in this session. This milestone changes no schema, no candle read and no entry-engine module (the zone module was already the one the engine resolved), and the suites it does touch (now/chart/bots/api/smoke) were re-run here with identical failure sets on both trees.'}
    for name, label in PRIOR['M110_NEGATIVES'] + PRIOR['M112_SCHEMA_NEGATIVES']:
        text = (ROOT / ('analysis/evidence/m110/m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt',
                         'why': 'Written against a schema that predates M111/M112/M115. A declaration mismatch in the probe, not a regression: named here, never edited.'})
    # The parent and module-only control arms, measured by the UNCHANGED probes on trees built from the
    # parent: the parent lacks the vocabulary entirely; the module-only stage HAS it and nothing consults it.
    controls = read('analysis/evidence/m30/controls.json')
    for name in ['pure', 'engine', 'api', 'ui', 'migration']:
        assert (controls[f'parent/{name}']['pass'], controls[f'parent/{name}']['fail']) == (0, 1) and controls[f'parent/{name}']['exit_code'] == 1, (name, controls[f'parent/{name}'])
        assert PARENT_M30 in (E / ('parent-' + name + '.txt')).read_text(), (name, PARENT_M30)
        assert counts(read('analysis/evidence/m30/parent-' + name + '-results.json')) == (0, 1)
    assert (controls['parent/control']['pass'], controls['parent/control']['fail'], controls['parent/control']['exit_code']) == (11, 0, 0)
    assert 'FAIL' not in (E / 'parent-control.txt').read_text(), 'the mode-aware control probe measures the absence rather than failing on it'
    assert (controls['module-only/pure']['pass'], controls['module-only/pure']['fail'], controls['module-only/pure']['exit_code']) == (27, 0, 0), controls['module-only/pure']
    assert (controls['module-only/control']['pass'], controls['module-only/control']['fail'], controls['module-only/control']['exit_code']) == (11, 0, 0), controls['module-only/control']
    assert (controls['module-only/engine']['fail'], controls['module-only/engine']['exit_code']) == (3, 1)
    assert (controls['module-only/api']['fail'], controls['module-only/api']['exit_code']) == (2, 1)
    assert (controls['module-only/ui']['fail'], controls['module-only/ui']['exit_code']) == (1, 1)
    assert (controls['module-only/migration']['fail'], controls['module-only/migration']['exit_code']) == (7, 1)
    for name in ['pure', 'engine', 'api', 'ui', 'migration']:
        assert MODULE_ONLY_SHIPPED in (E / ('module-only-' + name + '.txt')).read_text(), ('the module-only stage ships the vocabulary, so every probe gets past its opener', name)
    for name, lines in MODULE_ONLY_FAULTS.items():
        for line in lines:
            assert line in (E / ('module-only-' + name + '.txt')).read_text(), ('the module-only arm must fail on the missing wiring', name, line)
    for name, lines in DELIVERED_ANSWERS.items():
        for line in lines:
            assert line in (E / ('m30feature-' + name + '.txt')).read_text(), ('the delivered tree must answer the same fact', name, line)
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']),
              'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'],
              'applied_ids': sorted([k for k, v in rows.items() if k in ('M17', 'M18', 'M19', 'M30', 'M56')], key=lambda x: int(x[1:]))}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 115, 2, 15, 0, 8], ledger
    assert ledger['partial_ids'] == ['M103', 'M115'] and ledger['applied_ids'] == ['M17', 'M18', 'M19', 'M30', 'M56'], ledger
    assert rows['M30']['status'] == 'done' and all(rows[k]['status'] == 'done' for k in ['M13', 'M65', 'M112', 'M111', 'M110', 'M56'])
    parents = read('analysis/evidence/m13/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values()), {k: v for k, v in parents['parents'].items() if v['byte_differences']}
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m30-delivery-') as td:
        work = Path(td); parent = work / 'parent'; parent.mkdir()
        with tarfile.open(fileobj=io.BytesIO(run(['git', 'archive', BASE, 'extracted/tradejournal']))) as t:
            for ent in t:
                if ent.isfile():
                    rel = PurePosixPath(ent.name).relative_to('extracted/tradejournal'); assert allowed(rel) or str(rel).startswith('scripts/fixtures/'); write(parent, str(rel), t.extractfile(ent).read())
        assert manifest(parent) == guards['parent']
        if a.capture_stages:
            before = parent; stages = []
            for name, patch_name in STAGES:
                after = work / name; shutil.copytree(before, after)
                for rel in FILES_FOR[name]:
                    # Every file a stage LISTS carries the delivered bytes (checked against the frozen
                    # <stage>-source.json guards below); what is NOT listed stays the PARENT's, which is
                    # exactly how each fault is staged: `module` lists only src/bots/smc.js, so the
                    # vocabulary exists, is measured working, and nothing consults it.
                    write(after, rel, (APP / rel).read_bytes())
                assert manifest(after) == guards[name], (name, 'stage tree drifted from its guard')
                make_patch(before, after, P / patch_name)
                stages.append({'stage': name, 'source_manifest': name + '-source.json', 'source_files': len(guards[name]), 'patch': patch_name, **metadata(P / patch_name)})
                before = after
            final = before; combined = P / COMBINED; make_patch(parent, final, combined); replay(parent, final, combined, work)
            pristine = work / 'pristine'; pristine.mkdir()
            assert sha((ROOT / 'tradingpro-main.zip').read_bytes()) == '7a511cabec5e4989d8ad20acd0fdf499ed4f6c21891d2b751b7fd66066852340'
            with zipfile.ZipFile(ROOT / 'tradingpro-main.zip') as z:
                for ent in z.infolist():
                    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
                        rel = PurePosixPath(ent.filename).relative_to('tradejournal')
                        if allowed(rel) or str(rel).startswith('scripts/fixtures/'): write(pristine, str(rel), z.read(ent))
            fixed = work / 'fixed'; shutil.copytree(pristine, fixed)
            for p, b in contents(final).items(): write(fixed, p, b)
            assert contents(fixed) == contents(final)
            assert (pristine / 'package-lock.json').read_bytes() == (fixed / 'package-lock.json').read_bytes() == (APP / 'package-lock.json').read_bytes()
            cumulative = P / 'applied-so-far.patch'; make_patch(pristine, fixed, cumulative); replay(pristine, fixed, cumulative, work)
            info = {'base_commit': BASE_FULL,
                    'parent': 'Actual 27fbb2a M56 alert-surface Git release tree (164 files) as the M30 parent: the milestone that closed the written-plan gate and parsed the stored alert verdict. It already computes order blocks and stores the trader\u2019s settings; what it does not do is give the zone a second geometry, a way to choose it, or a name. This milestone adds no FILE and no schema object.',
                    'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger,
                    'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']},
                    'control': {'delivered': {'pass': 11, 'fail': 0}, 'parent': {'pass': 11, 'fail': 0}, 'module': {'pass': 11, 'fail': 0},
                                'note': 'The mode-aware control probe PASSES on all three trees on purpose: it measures the fault (no vocabulary at all; vocabulary present with nothing consulting it; the delivered wiring) rather than failing on it.'},
                    'prior_cohorts_rerun': {'m56': {'pass': 160, 'fail': 0, 'probes': 5, 'evidence': 'analysis/evidence/m56/feature-summary.json'},
                                            'm115': {'pass': 116, 'fail': 0, 'probes': 4, 'evidence': 'analysis/evidence/m115/feature-summary.json'},
                                            'm13': {'pass': 94, 'fail': 0, 'probes': 4, 'evidence': 'analysis/evidence/m13/feature-summary.json'},
                                            'm112': {'pass': 181, 'fail': 0, 'probes': 6, 'evidence': 'analysis/evidence/m112/feature-summary.json'}},
                    'inherited_records_read_not_rerun': inherited,
                    'environment_margins_rerun_this_session': {
                        'now-test': {'delivered': '50/0', 'parent': '50/0'}, 'chart-test': {'delivered': '36/0 (candle shim on)', 'parent': '36/0 (candle shim on)'},
                        'bots-test': {'delivered': '52 ok / 3 fail + crash at scripts/bots-test.js:180', 'parent': 'identical', 'why': 'the 3 failures are the missing EURUSD-1d fixture this sandbox refuses on TLS, on both trees'},
                        'api-test': {'delivered': 'crash at scripts/api-test.js:50 (409 guardrail_stop on a fresh workspace)', 'parent': 'identical'},
                        'smoke-test': {'delivered': '21/21 views, 0 UI-style failures, 0 console errors', 'parent': 'identical'},
                        'note': 'All five suites run against a real listening server on 3000 in this session, on both trees. The bots-test and api-test crashes are pre-existing at the parent and are not this milestone\u2019s.'},
                    'declared_negatives': declared,
                    'regression_parents': {'trees': len(parents['parents']), **parents},
                    'controls': {'parent_tree': 'the committed 27fbb2a M56 release: no zone-method vocabulary, the `?zone_method=` query ignored, the settings write silently dropped, no picker and no note \u2014 five probes 0/1 each, the mode-aware control 11/0',
                                 'module_only_tree': 'the parent plus `src/bots/smc.js` alone: the vocabulary, the folding rule and the three-rule consolidation walk exist and are measured working (pure 27/0, control 11/0) while the filter block, the routes, the settings key and both screens know nothing about them (engine 8/3, api 3/2, ui 1/1, migration 15/7)',
                                 'why': 'The staged fault is a geometry nothing can CHOOSE or NAME around a working zone engine: that is why the pure and control arms pass on the module-only tree while the engine, api, ui and migration arms fail on the absence the milestone closes.'},
                    'arms': controls,
                    'geometry': {'vocabulary': ['pivot', 'range'], 'default': 'pivot',
                                 'sources': ['request', 'settings', 'unspecified', 'default'],
                                 'walk': 'backwards from the SAME pivot candle the pivot method anchors on, over closed bars, stopping on a displacement bar (range >= 1.2 x ATR and body/range >= 0.55), a bar that does not overlap the envelope (price left the base), a REPORTED cap (3 x ATR / 12 bars, `capped:true`), or the start of history',
                                 'fallback': 'a walk shorter than two bars is `no_consolidation` and the zone stays PIVOT with its reason; the count is published as `base_fallbacks`',
                                 'no_influence': 'no grade, score, cap or price is moved by the choice itself (measured: with nothing chosen the candidates are byte-identical to the parent\u2019s); the wider zone IS a wider stop, stated as a trade-off on the payload and on both screens',
                                 'storage': 'read from the existing `users.settings` JSON; no table, no column, no index, no trigger, no backfill, and a read writes nothing it did not write before (the read-write set over two reads is identical to the parent\u2019s own set)'},
                    'strength_term': {'term': 'tests >= 2 ? 0.15 : 0', 'beside': 'the fresh-zone bonus (tests === 0 ? 0.15 : 0)', 'fires_on': '21% of order blocks in the measured windows (54 of 259)'},
                    'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative),
                    'fixed_zip': {'source_files': 164, 'application_byte_differences': 0, 'pristine_byte_differences': 0},
                    'engine_files_unchanged': ENGINE_UNCHANGED, 'newly_protected_from_m56': M56['M56_TOUCHES'],
                    'm30_touches_inside_the_protected_set': M30_TOUCHES, 'other_protected_files': [p for p in PROTECTED if p not in M30_TOUCHES][:40],
                    'doc_corrections': {'API': 'docs/API.md gains the `zone_method` query on analyse/chart/scan, the settings key on `PUT /settings`, and a section naming the two geometries, the closed source vocabulary, the reported caps and the trade-off',
                                        'PLAYLIST-CURRICULUM row 7': 'the Supply & demand row no longer reads as one hardcoded rectangle: it names both of his methods, the default, where the choice lives and that every read names the geometry it used',
                                        'NOT-IMPLEMENTED': 'a new row names what works AND what is NOT claimed (the consolidation is this app\u2019s definition with reported caps; neither method is measured to be better; the stop behind a wider zone is further away)'},
                    'scope': 'M30 the two zone methods: Ep 7\u2019s range geometry built as a closed three-rule walk over the consolidation (caps reported), the pivot method kept as the DEFAULT, the geometry a closed vocabulary with a named provenance (`request`/`settings`/`unspecified`/`default`), the choice stored in the settings JSON that already exists, and the strength term for `tests >= 2` restored beside the fresh-zone bonus. Explicitly NOT claimed: that either geometry is better, that the mechanical consolidation is his discretionary range, a performance or expectancy claim from the strength term, a pixel proof, or anything about a real account.'}
            (P / 'M30-ZONE-METHODS-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
            paths = run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', 'analysis']).decode().split('\0'); archive = ROOT / 'tradingpro-fixed.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                for p, b in contents(fixed).items(): add_zip(z, 'tradingpro-fixed/tradejournal/' + p, b)
                for p in sorted({p for p in paths if p and not p.endswith('/archive-sha256.json')}):
                    source = ROOT / p
                    if source.is_file() and allowed(PurePosixPath(p)): add_zip(z, 'tradingpro-fixed/' + p, source.read_bytes())
            with zipfile.ZipFile(archive) as z:
                prefix = 'tradingpro-fixed/tradejournal/'; actual = {n.removeprefix(prefix): z.read(n) for n in z.namelist() if n.startswith(prefix)}
                assert actual == contents(fixed) and len(z.namelist()) == len(set(z.namelist()))
                assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist())
                jwt = re.compile(rb'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'); assert not any(jwt.search(z.read(n)) for n in z.namelist()), 'JWT-shaped string in the archive'
            companion = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'source_files': 164, 'excluded_from_zip_to_avoid_self_hash': True}
            (E / 'archive-sha256.json').write_text(json.dumps(companion, indent=2) + '\n')
            print('Four constructed runtime stages + docs + actual M56 parent + pristine: forward/reverse 0 byte differences.')
            print('Exact 132/115/2/15; M30 112/0, controls measured (parent 0/1 x5 + 11/0, module-only 27/0 + 11/0 + 8/3 + 3/2 + 1/1 + 15/7).')
            print(json.dumps(companion, indent=2))
            return
        # Replay-only: rebuild the stages from the saved patches (never from the work tree) and require
        # every guard in both directions before the ZIP is touched.
        before = parent; stages = []
        for name, patch_name in STAGES:
            after = work / name; shutil.copytree(before, after)
            run(['git', 'apply', str(P / patch_name)], after)
            assert manifest(after) == guards[name], (name, 'replayed stage drifted from its guard')
            stages.append({'stage': name, 'source_manifest': name + '-source.json', 'source_files': len(guards[name]), 'patch': patch_name, **metadata(P / patch_name)})
            before = after
        final = before
        assert manifest(final) == current, 'the replayed stack is not the delivered tree'
        assert manifest(parent) == guards['parent']
        pristine = work / 'pristine'; pristine.mkdir()
        with zipfile.ZipFile(ROOT / 'tradingpro-main.zip') as z:
            for ent in z.infolist():
                if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
                    rel = PurePosixPath(ent.filename).relative_to('tradejournal')
                    if allowed(rel) or str(rel).startswith('scripts/fixtures/'): write(pristine, str(rel), z.read(ent))
        fixed = work / 'fixed'; shutil.copytree(pristine, fixed)
        for p, b in contents(final).items(): write(fixed, p, b)
        assert contents(fixed) == contents(final)
        replay(pristine, fixed, P / 'applied-so-far.patch', work)
        replay(parent, final, P / COMBINED, work)
        archive = ROOT / 'tradingpro-fixed.zip'; companion = read('analysis/evidence/m30/archive-sha256.json')
        assert companion['source_files'] == 164 and archive.stat().st_size == companion['bytes'] and sha(archive.read_bytes()) == companion['sha256'], 'the delivered ZIP is not the one this run reproduces'
        print('Replay-only: every stage rebuilt from its saved patch reproduced its frozen guard; the delivered ZIP is byte-identical to the reproduced one.')


if __name__ == '__main__':
    main()
