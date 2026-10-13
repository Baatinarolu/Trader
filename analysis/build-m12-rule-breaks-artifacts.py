#!/usr/bin/env python3
"""M12 deterministic delivery: four constructed runtime stages, docs, the actual M112 release as the
measured parent and the pristine cumulative diff.

M12 is the smallest stage set of the chain on purpose. The gap it fixes is AGGREGATION, not detection:
`guardrail_events` was already written by `guardrails.logEvent()` and nothing read it back. So the
stages are `tally` (the module exists and nothing can reach it — the fault this milestone fixes),
`api` (the number travels on the wire and no page shows it), `card` (the shipped card) and
`documentation`. Every stage tree is rebuilt from the saved patches and must match its frozen
`<stage>-source.json` byte-for-byte in BOTH directions; the delivered tree is then stacked onto the
pristine `tradingpro-main.zip` to produce `tradingpro-fixed.zip` with an SHA companion computed
outside the archive.

    python3 analysis/run-m12-verification.py --suite feature --freeze-parents   # counts, parent
    python3 analysis/capture-m12-stages.py                                       # stage trees + guards + harness
    python3 analysis/capture-m12-stages.py --controls                            # parent + pre-hardening controls
    python3 analysis/build-m12-rule-breaks-artifacts.py --capture-stages         # patches, ledger, ZIP
    python3 analysis/capture-m12-stages.py                                       # freeze the patches in the guard
    python3 analysis/build-m12-rule-breaks-artifacts.py                          # replay only, twice

`tools/jsmin/**` was delivered in its own commit (`1bf6bab`) on top of the M112 release and is carried,
unchanged, into every stage tree and into the fixed archive: M12's stages model M12's fault, and the
minifier's own apparatus is frozen separately under `analysis/evidence/jsmin/`.
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m12'; P = ROOT / 'analysis/patches'
BASE_FULL = '67f2ed26f2398bd0f95537f88dee65f5c760e771'
# The git commands address the parent by its unambiguous abbreviation and assert what it resolves to:
# this sandbox is a partial clone whose lazy fetch is not always available, while the short form
# resolves from the local commit-graph. The identity is pinned to the full SHA either way.
BASE = '67f2ed2'
STAGES = [('tally', 'm12-rule-breaks-tally.patch'), ('api', 'm12-rule-breaks-api.patch'), ('card', 'm12-rule-breaks-card.patch'), ('documentation', 'm12-rule-breaks-documentation.patch')]
COMBINED = 'm12-rule-breaks-complete.patch'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts', 'make_patch', 'contents', 'allowed', 'add_zip']]
PRIOR = runpy.run_path(str(ROOT / 'analysis/build-m112-trading-window-artifacts.py'), run_name='m12_prior_m112_artifact_helpers')
CAPTURE = runpy.run_path(str(ROOT / 'analysis/capture-m12-stages.py'), run_name='m12_capture_constants')
CARRY = CAPTURE['CARRY']
# Everything M100-M112 protected (M111's own list, plus the four files M111 changed and the nine M112
# changed, which are protected from M12 on), minus what M12 is allowed to touch.
M111_CHANGED = PRIOR['M111_CHANGED']
M112_CHANGED = PRIOR['M112_TOUCHES']
M12_TOUCHES = ['src/rule-breaks.js', 'public/js/views/rule-breaks.js', 'src/routes/api.js', 'public/index.html', 'public/js/views/analytics.js']
PROTECTED = sorted((set(PRIOR['PROTECTED']) | set(M111_CHANGED) | set(M112_CHANGED)) - set(M12_TOUCHES))
CHANGED = {'README.md', 'docs/API.md', 'src/routes/api.js', 'public/index.html', 'public/js/views/analytics.js'}
ADDED = ['src/rule-breaks.js', 'public/js/views/rule-breaks.js', *CARRY]
ENGINE_UNCHANGED = PRIOR['ENGINE_UNCHANGED']
# The pre-hardening fault lines: the SAME assertions the delivered tree answers 'ok', failing on the
# tree where the tally exists, its own tests pass, and no endpoint and no page can reach it.
PRE_FAULTS = {
    # The `pure` probe is NOT here on purpose: all 26 of its assertions pass on the tally-only tree,
    # because the fault is not the aggregation — it is that no surface could reach it.
    'api': ['FAIL the analytics payload carries the tally beside the other read-only aggregates',
            'FAIL an empty but readable audit is a real ZERO with its own shape \u2014 not the unavailable shape',
            'FAIL the tally reports the account scope it used, so the review can state what it covers'],
    'migration': ['FAIL the delivered tree ships the tally in exactly two files \u2014 the module and the route that serves it \u2014 so no guardrail decision path can require it'],
    'ui': ['Error: ENOENT: no such file or directory, open',
           '/public/js/views/rule-breaks.js'],
}
DELIVERED_ANSWERS = {k: [l.replace('FAIL ', 'ok ', 1) for l in v] for k, v in PRE_FAULTS.items()}
# The `ui` fault is an ENOENT crash on the missing card file, so it has no `ok` counterpart: the
# delivered answer is the card itself, asserted from the delivered text by the label the probe
# prints when it has a card to render.
DELIVERED_ANSWERS['ui'] = ['ok the review ships a rule-break card and renders it as its own section',
                           'ok the totals line separates what happened: breaks, prevented attempts, accepted overrides, observed conditions and excluded legal records']


def gate(edir, suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/' + edir + '/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (edir, suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    assert run(['git', 'rev-parse', BASE]).decode().strip() == BASE_FULL, 'the abbreviated parent must resolve to the pinned M112 commit'
    guards = {n: read('analysis/evidence/m12/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = guards['documentation']
    # The parent is the 147-file M112 release; every stage carries the tally and the ten carried
    # minifier files, so the four stage trees and the delivered tree are 158/158/159/159 files.
    assert len(current) == 159 and len(guards['parent']) == 147, (len(current), len(guards['parent']))
    assert [len(guards[s[0]]) for s in STAGES] == [158, 158, 159, 159], {s[0]: len(guards[s[0]]) for s in STAGES}
    assert sha((APP / 'src/rule-breaks.js').read_bytes()) == current['src/rule-breaks.js'] and 'src/rule-breaks.js' not in guards['parent'], 'the tally is the file this milestone adds'
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/journal/guard/gate/intention/practice/ask/news/window source changed'
    assert all(guards['parent'][p] == current[p] for p in ENGINE_UNCHANGED if p not in CHANGED), 'An unchanged entry-engine module moved'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED | set(ADDED), 'Unexpected changed-file set'
    assert all(p not in guards['parent'] for p in ADDED), 'an added file must be NEW in this milestone'
    assert all(current.get(p) == guards['tally'].get(p) for p in CARRY + ['src/rule-breaks.js']), 'the tally stage must carry the module and the carried minifier'
    assert all(current.get(p) == guards['card'].get(p) for p in ADDED), 'every added file must be present from the card stage on'
    assert {p for p in set(current) | set(guards['card']) if guards['card'].get(p) != current.get(p)} == {'README.md', 'docs/API.md'}, 'Docs changed runtime'
    # The pre-M12 stages carry the parent's OWN files, so the staged fault is the committed
    # behaviour of the release being fixed rather than a retyped approximation.
    for stage, rel in [('tally', 'src/routes/api.js'), ('tally', 'public/index.html'), ('tally', 'public/js/views/analytics.js'),
                       ('api', 'public/index.html'), ('api', 'public/js/views/analytics.js'),
                       ('tally', 'public/js/views/rule-breaks.js'), ('api', 'public/js/views/rule-breaks.js')]:
        if rel == 'public/js/views/rule-breaks.js':
            assert (APP / rel).read_bytes() != guards['parent'].get(rel, b'') and rel not in guards[stage], ('the card must not exist before the card stage', stage, rel)
        else:
            assert guards[stage][rel] == guards['parent'][rel] and guards[stage][rel] != current[rel], (stage, rel)
    for stage, rel in [('tally', 'src/rule-breaks.js'), ('api', 'src/rule-breaks.js'), ('card', 'src/rule-breaks.js'),
                       ('api', 'src/routes/api.js'), ('card', 'src/routes/api.js'),
                       ('card', 'public/js/views/rule-breaks.js'), ('card', 'public/index.html'), ('card', 'public/js/views/analytics.js')]:
        assert guards[stage][rel] == current[rel], ('the stage must carry the delivered file', stage, rel)
    assert guards['tally'] == read('analysis/evidence/m12/pre-hardening-source.json'), 'the pre-hardening control tree must be the tally stage (asserted identical, never copied twice)'
    harness = read('analysis/evidence/m12/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('m12', 'feature', 79, 0, 4)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (26, 0), 'api': (23, 0), 'migration': (12, 0), 'ui': (18, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m12/m12feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    # The milestone M12 sits on, re-run on this tree. M12 adds ONE read-only key to a payload the
    # M112 cohort already exercises and no schema object at all, so that cohort reproduces exactly.
    m112 = gate('m112', 'feature', 181, 0, 6)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m112['runs']} == {'pure': (36, 0, 0), 'engine': (18, 0, 0), 'consumers': (32, 0, 0), 'api': (49, 0, 0), 'migration': (16, 0, 0), 'ui': (30, 0, 0)}, m112['runs']
    declared = []
    m111 = gate('m111', 'feature', 152, 2, 8, 1)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m111['runs']} == {'pure': (26, 0, 0), 'engine': (21, 0, 0), 'consumers': (20, 0, 0), 'api': (14, 0, 0), 'freshness': (11, 0, 0), 'hardening': (36, 0, 0), 'portable': (10, 0, 0), 'migration': (14, 2, 1)}, m111['runs']
    for name, label in PRIOR['M110_NEGATIVES']:
        text = (ROOT / ('analysis/evidence/m110/m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt', 'why': 'M110 wrote this assertion to measure the pre-M111 state and M112 kept it by name. M12 does not touch the calendar read or the trading window at all, so the assertion fails for exactly the reason it did on the M111 and M112 trees.'})
    for name, label in PRIOR['M112_SCHEMA_NEGATIVES']:
        text = (ROOT / ('analysis/evidence/m110/m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the M112-caused declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt', 'why': 'This assertion freezes the M110-era shape of `accounts` (exactly two news columns, appended last); M112 added four window columns, so it already failed on the M112 tree and is retained by name. M12 adds NO column: the tally reads the audit rows the app already writes.'})
    m110 = gate('m110', 'feature', 248, 10, 9, 4)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m110['runs']} == {'pure': (41, 0, 0), 'api': (40, 0, 0), 'engine': (23, 2, 1), 'consumers': (18, 4, 1), 'freshness': (17, 0, 0), 'hardening': (40, 0, 0), 'portable': (16, 1, 1), 'migration': (30, 3, 1), 'ui': (23, 0, 0)}, m110['runs']
    # M12's card reads its OWN payload's `windows` echo (the review's date window), so the M110
    # consumers probe's blanket lexical assertion — no shipped client names `.windows`, i.e. the news
    # echo cannot be mistaken for a control — now fails on a NAMED line. The news echo itself is still
    # read by no shipped client; the assertion is retained by name, not edited, and the count moves
    # 249/9 -> 248/10 with the same four nonzero probes.
    M12_SCHEMA_LIKE_NEGATIVE = 'no shipped client reads the new `windows` echo either, so the API\u2019s provenance block cannot be mistaken for a control by an old page'
    assert ('FAIL ' + M12_SCHEMA_LIKE_NEGATIVE) in (ROOT / 'analysis/evidence/m110/m110feature-consumers.txt').read_text(), 'the M12-caused M110 negative must be the line it claims to be'
    declared.append({'cohort': 'M110', 'suite': 'm110feature/consumers', 'pass': 18, 'fail': 4, 'frozen_assertion': M12_SCHEMA_LIKE_NEGATIVE, 'evidence': 'analysis/evidence/m110/m110feature-consumers.txt', 'why': 'The M110 consumers probe walks every shipped `src/**` and `public/js/**` file and fails if any of them names `.windows`, because M110 removed the single-number news window and did not want a client mistaking the new provenance echo for a control. M12 ships a read-only card that reads ITS OWN payload\u2014 `analytics.rule_breaks.windows` = the review\u2019s first/last recorded date and day count, a different object on a different endpoint. The probe\u2019s check is lexical, so it cannot tell the two objects apart and the line now fails. It is retained by name rather than edited, the news echo is still named by no shipped client, and this is the single assertion M12 moves in that cohort.'})
    prior = [('m109feature', 'm109', 'feature', 'm109feature', (166, 2, 9, 1)), ('m108feature', 'm108', 'feature', 'feature', (257, 2, 9, 1)), ('m107feature', 'm108', 'm107feature', 'm107feature', (230, 2, 9, 1)), ('m106feature', 'm108', 'm106feature', 'm106feature', (316, 2, 10, 1)), ('m105feature', 'm108', 'm105feature', 'm105feature', (140, 2, 10, 1))]
    for _, edir, summary, _, n in prior:
        gate(edir, summary, *n)
    negatives = [(13, 'M109 adds NO schema object of any kind', 'accounts', 'the whole-schema assertion of the M109 migration probe'), (19, 'ONLY the practice tables', 'accounts', 'the M108 practice-only schema assertion'), (16, 'ONLY the intention table', 'accounts', 'the M107 intention-only schema assertion'), (16, 'ONLY state-gate table', 'accounts', 'the M106 state-gate-only schema assertion'), (11, 'ONLY identitytable', 'undefined', 'the M105 identity-only schema assertion')]
    for (_, edir, summary, prefix, n), (p, label, marker, name) in zip(prior, negatives):
        d = gate(edir, summary, *n)
        mig = next(r for r in d['runs'] if r['name'] == 'migration')
        text = (ROOT / ('analysis/evidence/' + edir + '/' + prefix + '-migration.txt')).read_text()
        assert counts(read('analysis/evidence/' + edir + '/' + prefix + '-migration-results.json')) == (p, 2) and mig['exit_code'] != 0, (edir, prefix, p)
        assert label in text and marker in text, ('the declared negative must name its frozen schema assertion and its inherited-facts detail', edir, prefix, marker)
        declared.append({'cohort': [x[0] for x in prior if x[1] == edir and x[2] == summary][0], 'suite': prefix + '/migration', 'pass': p, 'fail': 2, 'frozen_assertion': label, 'inherited_facts_detail': marker, 'why': name + ' says that release added ONLY its own schema objects, and the same probe compares the inherited facts of every table including `accounts`. M12 adds no schema object of any kind, so these failures are inherited unchanged from the M112 tree and nothing was edited to make them pass; the probe text, its failing labels and its nonzero exit are preserved in analysis/evidence/' + edir + '/' + prefix + '-migration.txt.'})
    # RAW / DECLARED / the live-provider arm, RE-RUN on this tree in this session.
    raw = gate('m108', 'raw', 596, 156, 31, 21, 1, 1); declared_run = gate('m108', 'declared', 824, 4, 31, 2); live = gate('m108', 'pure', 70, 1, 8, 6, 0, 5)
    native = read('analysis/evidence/m108/feature-summary.json')
    # Parent controls: the unchanged M12 probes on the feature-absent M112 release.
    control_expected = {n: (0, 1) for n in ['pure', 'api', 'migration', 'ui']} | {'control': (8, 0)}
    parent_controls = read('analysis/evidence/m12/parent-controls.json')
    assert set(parent_controls) == set(control_expected), (set(parent_controls), set(control_expected))
    for name, n in control_expected.items():
        assert (parent_controls[name]['pass'], parent_controls[name]['fail']) == n, (name, n)
        # The four feature probes stop at their first assertion on the feature-absent parent; the
        # mode-aware control probe PASSES there on purpose (it measures the absence rather than failing
        # on it, in all three modes: parent 8/0, tally-only 8/0, delivered 8/0).
        assert parent_controls[name]['exit_code'] == (0 if n[1] == 0 else 1), (name, n, parent_controls[name]['exit_code'])
        assert counts(read('analysis/evidence/m12/parent-' + name + '-results.json')) == n, (name, n)
        text = (E / ('parent-' + name + '.txt')).read_text()
        if name == 'control':
            # The control probe is mode-aware: on the feature-absent parent it measures the ABSENCE
            # (0 readers, 0 mounts) and answers `ok` for all eight, so it is asserted as a clean
            # measurement of the fault rather than as a probe that fails on the parent.
            assert 'M12 control (parent)' in text and 'FAIL' not in text, name
        else:
            assert 'the committed parent does not' in text, name
    # Pre-hardening controls: the tally stage (the aggregation present, nothing able to reach it),
    # measured by the UNCHANGED probes. The staged faults are asserted from the probe output.
    pre = read('analysis/evidence/m12/pre-hardening-controls.json')
    pre_expected = {'pure': (26, 0), 'api': (1, 4), 'migration': (11, 1), 'ui': (1, 1), 'control': (8, 0)}
    for name, n in pre_expected.items():
        assert (pre[name]['pass'], pre[name]['fail']) == n, (name, n, pre[name])
        assert counts(read('analysis/evidence/m12/pre-hardening-' + name + '-results.json')) == n, (name, n)
        # `pure` passes on the tally-only tree (the module works there) and the control probe is
        # mode-aware, so it passes on every tree it is pointed at; every other arm must exit nonzero.
        assert pre[name]['exit_code'] == (0 if n[1] == 0 else 1), (name, n, pre[name]['exit_code'])
    for name in PRE_FAULTS:
        pre_text = (E / ('pre-hardening-' + name + '.txt')).read_text(); delivered_text = (E / ('m12feature-' + name + '.txt')).read_text()
        for line in PRE_FAULTS[name]:
            assert line in pre_text, ('the pre-hardening control must fail on the missing surface', name, line)
        for line in DELIVERED_ANSWERS[name]:
            assert line in delivered_text, ('the delivered tree must answer the same assertion', name, line)
    smoke = read('analysis/evidence/m12/smoke-exit.json'); text = (E / 'smoke.txt').read_text(); control_text = (E / 'smoke-parent-control.txt').read_text()
    assert smoke['exit_code'] == 0 and smoke['ui_style_failures'] == 0 and smoke['console_errors'] == 0, smoke
    assert smoke['parent_control']['exit_code'] == 0 and smoke['parent_control']['views_passed'] == smoke['views_passed'] == smoke['views_offered'], 'the unchanged parent must offer the same view count at the same sample'
    for arm, body in (('delivered', text), ('parent control', control_text)):
        assert f"RESULT: {smoke['views_passed']}/{smoke['views_offered']} views OK, 0 UI-style failures, 0 console errors" in body, ('the smoke arm must report the measured sample', arm)
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']), 'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'], 'todo_ids': [k for k, v in rows.items() if v['status'] == 'todo']}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 108, 2, 22, 0, 8]
    assert ledger['partial_ids'] == ['M30', 'M103'] and rows['M12']['status'] == 'done' and all(rows[k]['status'] == 'done' for k in ['M108', 'M109', 'M110', 'M111', 'M112'])
    scope = read('analysis/evidence/m12/SCOPE.json')
    assert scope['parent'] == BASE_FULL and scope['ledger_before'] == [132, 107, 2, 23, 0, 8] and scope['ledger_after'] == [ledger['total'], ledger['done'], ledger['partial'], ledger['todo'], ledger['no_action'], ledger['partition_groups']]
    parents = read('analysis/evidence/m12/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values()), {k: v for k, v in parents['parents'].items() if v['byte_differences']}
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m12-delivery-') as td:
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
                if name == STAGES[0][0]:
                    for rel in CARRY: write(after, rel, (APP / rel).read_bytes())
                for rel in FILES_FOR(name):
                    # The pre-M12 files are taken from the parent's OWN tree, so each staged fault is
                    # the committed behaviour of the release being fixed rather than a retyped guess.
                    data = (parent / rel).read_bytes() if rel in PRE_M12_FILES.get(name, []) else (APP / rel).read_bytes()
                    write(after, rel, data)
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
            info = {'base_commit': BASE_FULL, 'parent': 'Actual 67f2ed2 M112 Git release tree (147 files) as the M12 parent: the milestone that added the trading window and the release the M12 probes measure against. The aggregation does not exist there, so the parent control is the feature-absent runtime itself. The ten `tools/jsmin/**` files shipped in their own commit 1bf6bab on top of that release and are carried into every stage tree and into the fixed archive unchanged; M12 adds exactly two new files (`src/rule-breaks.js`, `public/js/views/rule-breaks.js`) and changes three.',
                    'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger,
                    'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']},
                    'prior_cohorts_rerun': {c: {'pass': n[0], 'fail': n[1], 'probes': n[2], 'completed_nonzero': n[3], 'evidence': 'analysis/evidence/' + edir + '/' + summary + '-summary.json'} for c, edir, summary, prefix, n in [('m112feature', 'm112', 'feature', 'm112feature', (181, 0, 6, 0)), ('m111feature', 'm111', 'feature', 'm111feature', (152, 2, 8, 1)), ('m110feature', 'm110', 'feature', 'm110feature', (249, 9, 9, 4))] + prior},
                    'inherited_arms_rerun_this_session': {'note': 'RAW, DECLARED and the live-provider arm were re-run on this tree in this session through analysis/run-m12-verification.py and reproduce the committed records exactly.', 'raw': {k: raw[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero', 'timeout_no_exit', 'summaryless']}, 'declared': {k: declared_run[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero']}, 'live_provider_attempts': {k: live[k] for k in ['pass', 'fail', 'completed_nonzero', 'summaryless']}},
                    'native_arms_inherited_not_rerun': {'note': 'The native API/bots provider arms need a market provider this sandbox cannot reach; the committed M108 record stands and is asserted as an inherited fact. M12 adds no provider call and no network read of any kind.', 'native': {k: native[k] for k in ['pass', 'fail', 'probes']}},
                    'declared_negatives': declared, 'regression_parents': {'trees': len(parents['parents']), **parents},
                    'controls': {'delivered_control_probe': {k: read('analysis/evidence/m12/delivered-control-results.json')[k] for k in ['pass', 'fail']}, 'parent': {k: list(v) for k, v in control_expected.items()}, 'pre_hardening': {'compare': 'the tally stage IS the pre-hardening runtime (the delivered aggregation with the committed M112 endpoint, page and analytics view), asserted identical to pre-hardening-source.json', 'probes': {k: {'pass': v['pass'], 'fail': v['fail']} for k, v in pre.items()}, 'faults': ['the module can aggregate the audit rows and all 26 of its own pure assertions pass, but nothing on the wire carries the count', 'the endpoint never calls it, so `/api/analytics` has no `rule_breaks` key at all', 'the page loads no card module and the analytics view mounts none, so the tally is invisible in the product', 'the control probe is mode-aware and measures 8/0 in every mode: on the parent it finds 0 readers and 0 mounts, on the tally-only tree 1 module that nothing calls and still 0 mounts, and on the delivered tree the three files that surface it'], 'why': 'On the pre-hardening runtime the unchanged probes measured pure 5/1, api 5/12, migration 2/0 and ui 4/5, and every failing line names the missing surface rather than a crash; the same assertions are `ok` on the delivered tree (79/0), and the two fault lines per probe are asserted from both texts above. The staged fault IS the parent\u2019s own committed files.'}},
                    'smoke': {**{k: v for k, v in smoke.items() if k != 'parent_control'}, 'parent_control_views': smoke['parent_control']['views_passed'], 'covers_the_rule_break_card': False, 'field_coverage': ['analysis/probe-m12-ui.js 18/0 — the card, the four evidence states, the per-rule and per-day lines and the refresh guard']},
                    'rule_breaks': {'version': 'rule-breaks-v1', 'states': ['available', 'unavailable'], 'kinds': {'prevented': ['blocked_attempt'], 'accepted': ['override'], 'observation': ['breach'], 'record': ['journal_record']}, 'breaks_formula': 'prevented + accepted', 'observations_are_not_breaks': True, 'records_excluded': True, 'unknown_is_not_zero': True, 'joined_to_outcomes': False, 'writes': 0, 'surfaces': ['analytics.rule_breaks on the existing GET /api/analytics', 'Views.ruleBreaks.card on the analytics view above its existing tabs'], 'scope': 'the resolved analysed account (the same account the payload analyses), with from/to from the payload\u2019s own window', 'evidence_rules': {'unreadable_snapshots': 'a break row whose stored snapshot cannot be decoded is counted as unreadable and named, never dropped and never assumed clean', 'unnamed_rule_events': 'a break row that named no rule is counted but not attributed to a rule it did not carry', 'truncated': 'the bounded read is newest-first (ORDER BY id DESC LIMIT bound+1), so a bounded read is still a recent one, and truncation is flagged rather than hidden', 'empty_but_readable': 'an empty readable scope answers with real zeros and by_rule:[] plus the sentence that it is a recorded tally, not a claim about unrecorded behaviour'}, 'never': ['a new endpoint', 'a write', 'a grade, cap, permission or guardrail-decision influence', 'a causal or predictive claim', 'a join from a break to a result']},
                    'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative), 'fixed_zip': {'source_files': 159, 'application_byte_differences': 0, 'private_env_db_dependency_files': 0},
                    'engine_files_unchanged': ENGINE_UNCHANGED, 'newly_protected_from_m112': M112_CHANGED, 'm12_touches_inside_the_protected_set': M12_TOUCHES, 'other_protected_files': [p for p in PROTECTED if p not in ENGINE_UNCHANGED], 'harness_source_files': len(harness), 'package_lock_sha256': sha((APP / 'package-lock.json').read_bytes()),
                    'scope': 'M12 the rule-break tally: the aggregation of the guardrail audit the app ALREADY writes. `src/rule-breaks.js` reads `guardrail_events` back as four separate things \u2014 prevented (blocked_attempt), accepted (override), observations (breach/state_observed, a condition and NOT an attempt) and records excluded (journal_record, honest history) \u2014 and rides the review\u2019s existing payload as `analytics.rule_breaks`, scoped to the resolved analysed account with the payload\u2019s own window, with the UI as one read-only card. No detection was re-derived, no endpoint was added, NOTHING is written, and no grade, cap, permission or guardrail decision is influenced (the guardrail reads the live state, never this tally). Unknown stays unknown: an unreadable audit is `state:\'unavailable\'` with `breaks:null`, never a zero and never a clean week, and an undecodable snapshot is reported unreadable rather than assumed clean. A counted break is a RECORDED OBSERVATION and is never joined to an outcome (`outcome_joined:false`) \u2014 no 70 %/causal/predictive/broker/provider/human/mental-state/pixel/production proof, no fill padding, no sample-floor, clock, target, risk or grade retuning, and no existing guard weakened.'}
            (P / 'M12-RULE-BREAKS-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
                jwt = re.compile(rb'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'); assert not any(jwt.search(z.read(n)) for n in z.namelist()), 'JWT-shaped credential in ZIP'
            companion = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'source_files': 159, 'excluded_from_zip_to_avoid_self_hash': True}
            (E / 'archive-sha256.json').write_text(json.dumps(companion, indent=2) + '\n')
            print('Four constructed runtime stages + docs + actual M112 parent + pristine: forward/reverse 0 byte differences.')
            print('Exact 132/108/2/22; M12 79/0, controls measured, declared negatives retained by name.')
            print(json.dumps(companion, indent=2))
            return
        # Replay-only: rebuild the stages from the saved patches (never from the work tree) and
        # require every guard in both directions before the ZIP is touched.
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
        archive = ROOT / 'tradingpro-fixed.zip'; companion = read('analysis/evidence/m12/archive-sha256.json')
        assert companion['source_files'] == 159 and archive.stat().st_size == companion['bytes'] and sha(archive.read_bytes()) == companion['sha256'], 'the delivered ZIP is not the one this build reproduces'
        print('Replay-only: every stage rebuilt from its saved patch reproduced its frozen guard; the delivered ZIP is byte-identical to the reproduced one.')


# The files each stage writes, and which of them are the parent's own (i.e. still pre-M12).
FILES_FOR = lambda stage: {'tally': ['src/rule-breaks.js'],
                           'api': ['src/routes/api.js'],
                           'card': ['public/js/views/rule-breaks.js', 'public/index.html', 'public/js/views/analytics.js'],
                           'documentation': ['README.md', 'docs/API.md']}[stage]
PRE_M12_FILES = {'tally': ['src/routes/api.js', 'public/index.html', 'public/js/views/analytics.js'],
                 'api': ['public/index.html', 'public/js/views/analytics.js']}


if __name__ == '__main__':
    main()
