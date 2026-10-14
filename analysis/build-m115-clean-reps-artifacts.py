#!/usr/bin/env python3
"""M115 deterministic delivery: four constructed runtime stages, docs, the actual M13/M65 release as the
measured parent and the pristine cumulative diff.

The gap this milestone fixes is a missing COUNT, not missing data: the app already recorded all three
criteria Ep 32 names and counted none of them as a rep. So the stages are `counter` (the count exists
and nothing serves it, no page shows it and the settings route drops the trader's two declarations — the
fault this milestone fixes, staged from the parent's own files), `wired` (the count rides the analytics
payload and the two declarations survive a settings save), `card` (a trader can see the count and set the
target), `documentation` (M17's reworded claim, M18's advisory/gating column, M19's measured count).
Every stage tree is rebuilt from the saved patches and must match its frozen `<stage>-source.json`
byte-for-byte in BOTH directions; the delivered tree is then stacked onto the pristine
`tradingpro-main.zip` to produce `tradingpro-fixed.zip` with an SHA companion computed outside the
archive.

    python3 analysis/capture-m115-stages.py --capture                       # guards + harness hash
    python3 analysis/build-m115-clean-reps-artifacts.py --capture-stages     # patches, ledger, ZIP
    python3 analysis/capture-m115-stages.py                                 # freeze the patches in the guard
    python3 analysis/build-m115-clean-reps-artifacts.py                     # replay only, twice
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m115'; P = ROOT / 'analysis/patches'
BASE_FULL = 'b87e85214e06509350d005506028a543ffc2468c'
# The git commands address the parent by its unambiguous abbreviation and assert what it resolves to:
# this sandbox is a partial clone whose lazy fetch is not always available, while the short form
# resolves from the local commit-graph. The identity is pinned to the full SHA either way.
BASE = 'b87e852'
STAGES = [('counter', 'm115-clean-reps-counter.patch'), ('wired', 'm115-clean-reps-wired.patch'),
          ('card', 'm115-clean-reps-card.patch'), ('documentation', 'm115-clean-reps-documentation.patch')]
COMBINED = 'm115-clean-reps-complete.patch'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts',
                                                                                                                  'make_patch', 'contents', 'allowed', 'add_zip']]
PRIOR = runpy.run_path(str(ROOT / 'analysis/build-m112-trading-window-artifacts.py'), run_name='m115_prior_m112_artifact_helpers')
CAPTURE = runpy.run_path(str(ROOT / 'analysis/capture-m115-stages.py'), run_name='m115_capture_constants')
FILES_FOR = CAPTURE['FILES']
# Everything M100-M112 protected (M111's own list, plus the four files M111 changed and the nine M112
# changed), plus the nine M12 and seven M13/M65 files, minus what this milestone is allowed to touch.
M111_CHANGED = PRIOR['M111_CHANGED']
M112_CHANGED = PRIOR['M112_TOUCHES']
M13_CHANGED = ['src/periods.js', 'src/performance.js', 'src/period-reviews.js', 'src/routes/api.js', 'public/js/views/review-periods.js', 'public/index.html',
               'public/js/views/analytics.js', 'README.md', 'docs/API.md']
M115_TOUCHES = ['src/challenge.js', 'src/routes/api.js', 'public/index.html', 'public/js/views/challenge.js', 'public/js/views/dashboard.js',
                'docs/PLAYLIST-CURRICULUM.md', 'docs/NOT-IMPLEMENTED.md']
PROTECTED = sorted((set(PRIOR['PROTECTED']) | set(M111_CHANGED) | set(M112_CHANGED) | set(M13_CHANGED)) - set(M115_TOUCHES))
CHANGED = {'src/routes/api.js', 'public/index.html', 'public/js/views/dashboard.js', 'docs/PLAYLIST-CURRICULUM.md', 'docs/NOT-IMPLEMENTED.md'}
ADDED = ['src/challenge.js', 'public/js/views/challenge.js']
DOCS = {'docs/PLAYLIST-CURRICULUM.md', 'docs/NOT-IMPLEMENTED.md'}
ENGINE_UNCHANGED = PRIOR['ENGINE_UNCHANGED']
# The delivered line each probe's opener prints when the module is present, and the line it prints when
# it is absent: the absence IS the control, so each arm is asserted against the probe's own wording.
SHIPPED_GATES = {
    'pure': 'ok this tree ships the clean-rep count (src/challenge.js) (the committed parent does not',
    'api': 'ok this tree ships the clean-rep count (src/challenge.js) (the committed parent does not',
    'migration': 'ok this tree ships the clean-rep count (src/challenge.js) (the committed parent does not',
    'ui': 'ok this tree ships the clean-rep count (src/challenge.js) (the committed parent does not',
}
PARENT_GATES = {
    'pure': 'FAIL this tree ships the clean-rep count (src/challenge.js)',
    'api': 'FAIL this tree ships the clean-rep count (src/challenge.js)',
    'migration': 'FAIL this tree ships the clean-rep count (src/challenge.js)',
    'ui': 'FAIL this tree ships the clean-rep count (src/challenge.js)',
}
# The pre-hardening arm is the `counter` stage: the count exists and is measured working (41 pure
# assertions), and nothing serves it, no page shows it and the settings route drops both declarations.
PRE_FAULTS = {
    'pure': [],   # the module itself is the milestone's core: it passes on the counter stage
    'api': ['FAIL the analytics payload carries the clean-rep count for the account it analyses'],
    'migration': [],
    'ui': ['Error: ENOENT: no such file or directory, open'],   # the card module the ui probe mounts does not exist yet
}
DELIVERED_ANSWERS = {
    'pure': ['ok a trade that is plan-linked, checklist-clean and journalled on its own close day is a rep'],
    'api': ['ok a trade closed on the current UTC day, linked to the trader\u2019s own plan, checklist-clean and journalled through the app is COUNTED, and the count is a count of trades'],
    'migration': ['ok the delivered tree reads the PARENT\u2019s own file and counts exactly one rep: the clean, linked, acknowledged trade on the current UTC day'],
    'ui': ['ok a live count renders the count and the target as the trader\u2019s own numbers, and the remaining figure as arithmetic on them'],
}


def gate(edir, suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/' + edir + '/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (edir, suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    assert run(['git', 'rev-parse', BASE]).decode().strip() == BASE_FULL, 'the abbreviated parent must resolve to the pinned M13/M65 commit'
    guards = {n: read('analysis/evidence/m115/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = read('analysis/evidence/m115/documentation-source.json')
    assert len(guards['parent']) == 161 and len(current) == 163, (len(guards['parent']), len(current))
    assert [len(guards[s[0]]) for s in STAGES] == [162, 162, 163, 163], {s[0]: len(guards[s[0]]) for s in STAGES}
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(p not in guards['parent'] for p in ADDED), 'an added file must be NEW in this milestone'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/journal/guard/gate/intention/practice/ask/news/window/period source changed'
    assert all(guards['parent'][p] == current[p] for p in ENGINE_UNCHANGED if p not in CHANGED), 'An unchanged entry-engine module moved'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED | set(ADDED), 'Unexpected changed-file set'
    for i, (stage, _) in enumerate(STAGES):
        for rel in FILES_FOR[stage]:
            assert guards[stage][rel] == current[rel], ('the stage must carry the delivered file', stage, rel)
    assert {p for p in set(current) | set(guards['card']) if guards['card'].get(p) != current.get(p)} == DOCS, 'Docs changed runtime'
    harness = read('analysis/evidence/m115/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('m115', 'feature', 116, 0, 4)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (41, 0), 'api': (30, 0), 'migration': (18, 0), 'ui': (27, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m115/m115feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    control = read('analysis/evidence/m115/control-results.json')
    assert {(r['mode'], r['pass'], r['fail'], r['exit_code']) for r in control['runs']} == {('delivered', 13, 0, 0), ('parent', 13, 0, 0)}, control
    # The milestone this one sits on, re-run on this tree in this session: M115 adds no schema object and
    # touches neither the ruler nor the review record, so the M13/M65 cohort reproduces its committed 94/0.
    m13 = gate('m13', 'feature', 94, 0, 4)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m13['runs']} == {'pure': (39, 0, 0), 'api': (23, 0, 0), 'migration': (13, 0, 0), 'ui': (19, 0, 0)}
    # The cohorts that sit under the milestone, re-run on this tree through the delegated chain.
    m112 = gate('m112', 'feature', 181, 0, 6)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m112['runs']} == {'pure': (36, 0, 0), 'engine': (18, 0, 0), 'consumers': (32, 0, 0), 'api': (49, 0, 0), 'migration': (16, 0, 0), 'ui': (30, 0, 0)}, \
        {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m112['runs']}
    declared = []
    m111 = gate('m111', 'feature', 152, 2, 8, 1)
    for name, label in PRIOR['M110_NEGATIVES']:
        text = (ROOT / ('analysis/evidence/m110/m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt',
                         'why': 'M110 wrote this assertion against a schema that predates M111/M112/M115. It is a declaration mismatch in the probe, not a regression: named here, never edited.'})
    for name, label in PRIOR['M112_SCHEMA_NEGATIVES']:
        text = (ROOT / ('analysis/evidence/m110/m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the M112-caused declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt',
                         'why': 'This assertion was written before the M112 schema growth; it fails on the larger schema by construction and stays failing, by name.'})
    m110 = gate('m110', 'feature', 248, 10, 9, 4)
    m109 = gate('m109', 'feature', 166, 2, 9, 1)
    m108 = gate('m108', 'feature', 257, 2, 9, 1)
    m107 = gate('m107', 'feature', 232, 0, 9, 0)
    m106 = gate('m106', 'feature', 318, 0, 10, 0)
    m105 = gate('m105', 'feature', 142, 0, 10, 0)
    for edir, d in [('m109', m109), ('m108', m108), ('m107', m107), ('m106', m106), ('m105', m105)]:
        mig = next(r for r in d['runs'] if r['name'] == 'migration')
        declared.append({'cohort': edir.upper(), 'suite': edir + '/feature-' + mig['name'], 'pass': mig['pass'], 'fail': mig['fail'], 'exit_code': mig['exit_code'],
                         'evidence': 'analysis/evidence/' + edir + '/' + edir + 'feature-' + mig['name'] + '.txt',
                         'why': 'Re-measured on this tree in this session: this cohort measured exactly what its committed record says, so its migration result is its own frozen record and not an assumption.'})
    family = {}
    for name, n in [('m105feature', (140, 2, 10, 1)), ('m106feature', (316, 2, 10, 1)), ('m107feature', (230, 2, 9, 1))]:
        d = gate('m108', name, *n)
        mig = next((r for r in d['runs'] if r['name'] == 'migration'), d['runs'][-1])
        family[name] = {'pass': d['pass'], 'fail': d['fail'], 'probes': d['probes'], 'completed_nonzero': d['completed_nonzero'],
                        'evidence': 'analysis/evidence/m108/' + name + '-summary.json', 'migration_probe': {'pass': mig['pass'], 'fail': mig['fail'], 'exit_code': mig['exit_code']}}
        declared.append({'cohort': name.replace('feature', '').upper(), 'suite': 'm108/' + name + '-migration', 'pass': mig['pass'], 'fail': mig['fail'], 'exit_code': mig['exit_code'],
                         'evidence': 'analysis/evidence/m108/' + name + '-summary.json',
                         'why': 'This summary is written by the DELEGATION CHAIN rather than by the cohort\u2019s own runner, so it is named here by its path and provenance. Re-measured on this tree in this session: the same counts as the committed copies (140/2 \u00b7 316/2 \u00b7 230/2), which is what makes them a record rather than a stale file.'})
    raw = gate('m108', 'raw', 596, 156, 31, 21, 1, 1); declared_run = gate('m108', 'declared', 824, 4, 31, 2); live = gate('m108', 'pure', 70, 1, 8, 6, 0, 5)
    reviews = gate('m108', 'reviews', 157, 3, 9, 1)
    reviews_text = (ROOT / 'analysis/evidence/m108/reviews/feature-migration.txt').read_text()
    assert 'M99/M101 actual-parent additive review migration: 12 passed, 3 failed' in reviews_text, 'the stale reviews cohort must be the record it claims to be'
    for line in ['FAIL schema additions ONLY review table/index/uniqueindex/immutabletrigger',
                 'FAIL all old table/index/trigger definitions exact, no tradecolumn rebuild/addition',
                 'FAIL ALL original table finance/owner/clocks/provenance/permissions/routine/core facts retained']:
        assert line in reviews_text, ('the stale reviews negative must name its frozen assertion', line)
    declared.append({'cohort': 'M99/M101 (reviews)', 'suite': 'reviews/migration', 'pass': 12, 'fail': 3, 'committed_record': {'pass': 14, 'fail': 1},
                     'evidence': 'analysis/evidence/m108/reviews/feature-migration.txt',
                     'why': 'STALE at this HEAD and declared by name: the inherited M99/M101 cohort is 157/3 against its committed 159/1 because the schema grew after M101 (accounts 26->36 columns and ten delivered-only tables). This milestone changed no schema, so the gap is inherited, not caused here.'})
    # The parent and pre-hardening control arms, measured by the UNCHANGED probes on trees built from the
    # parent: the parent lacks the count entirely; the counter stage HAS it and nothing serves or shows it.
    controls = read('analysis/evidence/m115/controls.json')
    for name in ['pure', 'api', 'migration', 'ui']:
        assert (controls[f'parent/{name}']['pass'], controls[f'parent/{name}']['fail']) == (0, 1) and controls[f'parent/{name}']['exit_code'] == 1, (name, controls[f'parent/{name}'])
        assert PARENT_GATES[name] in (E / ('parent-' + name + '.txt')).read_text(), (name, PARENT_GATES[name])
        assert counts(read('analysis/evidence/m115/parent-' + name + '-results.json')) == (0, 1)
    assert (controls['parent/control']['pass'], controls['parent/control']['fail'], controls['parent/control']['exit_code']) == (13, 0, 0)
    assert 'FAIL' not in (E / 'parent-control.txt').read_text(), 'the mode-aware control probe measures the absence rather than failing on it'
    assert (controls['counter-only/pure']['pass'], controls['counter-only/pure']['fail']) == (41, 0), controls['counter-only/pure']
    assert (controls['counter-only/api']['fail'], controls['counter-only/api']['exit_code']) == (1, 1)
    assert (controls['counter-only/ui']['fail'], controls['counter-only/ui']['exit_code']) == (1, 1)
    assert (controls['counter-only/migration']['pass'], controls['counter-only/migration']['fail']) == (18, 0), controls['counter-only/migration']
    assert (controls['counter-only/control']['pass'], controls['counter-only/control']['fail'], controls['counter-only/control']['exit_code']) == (13, 0, 0)
    for name, lines in PRE_FAULTS.items():
        pre_text = (E / ('counter-only-' + name + '.txt')).read_text(); delivered_text = (E / ('m115feature-' + name + '.txt')).read_text()
        for line in lines:
            assert line in pre_text, ('the counter-only arm must fail on the missing surface', name, line)
        for line in DELIVERED_ANSWERS[name]:
            assert line in delivered_text, ('the delivered tree must answer the same fact', name, line)
    assert SHIPPED_GATES['api'] in (E / 'counter-only-api.txt').read_text(), 'the counter stage ships the module, so the api probe gets past its opener and fails on the payload'
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']),
              'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'],
              'applied_ids': sorted([k for k, v in rows.items() if k in ('M17', 'M18', 'M19')], key=lambda x: int(x[1:]))}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 113, 3, 16, 0, 8], ledger
    assert ledger['partial_ids'] == ['M30', 'M103', 'M115'] and ledger['applied_ids'] == ['M17', 'M18', 'M19'], ledger
    assert rows['M115']['status'] == 'partial' and all(rows[k]['status'] == 'done' for k in ['M13', 'M65', 'M112', 'M111', 'M110'])
    parents = read('analysis/evidence/m115/regression-parents.json') if (E / 'regression-parents.json').exists() else read('analysis/evidence/m13/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values()), {k: v for k, v in parents['parents'].items() if v['byte_differences']}
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m115-delivery-') as td:
        work = Path(td); parent = work / 'parent'; parent.mkdir()
        with tarfile.open(fileobj=io.BytesIO(run(['git', 'archive', BASE, 'extracted/tradejournal']))) as t:
            for ent in t:
                if ent.isfile():
                    rel = PurePosixPath(ent.name).relative_to('extracted/tradejournal'); assert allowed(rel) or str(rel).startswith('scripts/fixtures/'); write(parent, str(rel), t.extractfile(ent).read())
        assert manifest(parent) == guards['parent']
        if a.capture_stages:
            before = parent; stages = []
            for name, patch_name in STAGES:
                after = work / name; shutil.copytree(before, after, symlinks=True)
                for rel in FILES_FOR[name]:
                    # Every file a stage LISTS carries the delivered bytes (checked against the frozen
                    # <stage>-source.json guards below); what is NOT listed stays the PARENT's, which is
                    # exactly how each fault is staged: `counter` lists only src/challenge.js, so the
                    # count exists and the parent's own settings route and analytics payload know nothing
                    # about it.
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
                    'parent': 'Actual b87e852 M13/M65 Git release tree (161 files) as the M115 parent: the milestone that added the shared review-period ruler and the record of which periods were saved. It already ships the plan link on the trade, the checklist rows, the stop decision, M85\u2019s journal acknowledgement and the settings object the two declarations live in, so this milestone adds exactly two FILES and no schema object.',
                    'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger,
                    'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']},
                    'control': {'delivered': {'pass': 13, 'fail': 0}, 'parent': {'pass': 13, 'fail': 0},
                                'note': 'The mode-aware control probe PASSES on both trees on purpose: it measures the fault (module present or absent, payload key present or absent, card mounted or not, declarations stored or dropped) rather than failing on it.'},
                    'prior_cohorts_rerun': {'m13': {'pass': 94, 'fail': 0, 'probes': 4, 'evidence': 'analysis/evidence/m13/feature-summary.json'},
                                            'm112': {'pass': 181, 'fail': 0, 'probes': 6, 'evidence': 'analysis/evidence/m112/feature-summary.json'},
                                            'm111': {'pass': 152, 'fail': 2, 'probes': 8, 'evidence': 'analysis/evidence/m111/feature-summary.json'},
                                            'm110': {'pass': 248, 'fail': 10, 'probes': 9, 'evidence': 'analysis/evidence/m110/feature-summary.json'},
                                            'm109': {'pass': 166, 'fail': 2, 'probes': 9, 'evidence': 'analysis/evidence/m109/feature-summary.json'},
                                            'm108': {'pass': 257, 'fail': 2, 'probes': 9, 'evidence': 'analysis/evidence/m108/feature-summary.json'},
                                            'm107': {'pass': 232, 'fail': 0, 'probes': 9, 'evidence': 'analysis/evidence/m107/feature-summary.json'},
                                            'm106': {'pass': 318, 'fail': 0, 'probes': 10, 'evidence': 'analysis/evidence/m106/feature-summary.json'},
                                            'm105': {'pass': 142, 'fail': 0, 'probes': 8, 'evidence': 'analysis/evidence/m105/feature-summary.json'}},
                    'family_named_cohort_copies': family,
                    'delegated_runner_exit_codes': {'note': 'The delegated runners ASSERT their own committed expectations in their own terms, so several exit 1 on this tree even though every cohort reproduces the counts its own evidence records: run-m108 exits 1 on m105feature/m106feature/m107feature/m108feature (its expected counts predate the schema growth), run-m111 exits 1 on its migration probe (14/2 against its committed expected), and the reviews runner exits 1 on the inherited M99/M101 migration gaps. The counts in this report are read from the summaries those runs WROTE, not from their exit codes; every nonzero exit is named here rather than smoothed over.'},
                    'inherited_arms_rerun_this_session': {'raw': {'pass': 596, 'fail': 156}, 'declared': {'pass': 824, 'fail': 4}, 'live_provider': {'pass': 70, 'fail': 1},
                                                          'note': 'RAW, DECLARED and the live-provider arm were re-run on this tree in this session through the delegated chain; each reproduces its committed record exactly.'},
                    'declared_negatives': declared,
                    'regression_parents': {'trees': len(parents['parents']), **parents},
                    'controls': {'parent_tree': 'the committed b87e852 release: no module, no payload key, no card, both declarations dropped by its settings route (0 keys stored) \u2014 four probes 0/1 each, the mode-aware control 13/0',
                                 'counter_only_tree': 'the parent plus `src/challenge.js` alone: the count can be computed and is measured working (pure 41/0, migration 18/0) while the payload carries no count (api 1 fail), no page shows it (ui 1 fail) and the settings route still drops both declarations',
                                 'why': 'The staged fault is a missing SURFACE around a working counter, not a missing rule: that is why the pure and migration arms pass on the counter-only tree while the api and ui arms fail on the absence the milestone closes.'},
                    'arms': controls,
                    'counter': {'version': 'clean-reps-v1', 'criteria': ['plan_linked', 'no_recorded_breach', 'journalled_same_close_day'],
                                'storage': 'TWO keys in the existing `users.settings` JSON (`challenge_start`, `challenge_target`) through the existing `PUT /settings`; no table, no column, no index, no trigger, no new endpoint, no backfill',
                                'start': 'the trader\u2019s own declaration, never defaulted onto history; locked (409 `challenge_start_locked`) once any closed trade sits at or after it, because progress is a record and not a dial',
                                'target': '1\u2013999, default 21; changing it never changes the count, the run or a single trade\u2019s verdict',
                                'unknown_never_zero': 'unstarted \u2192 `counted:null`; unreadable \u2192 `unavailable` with `counted:null`, `not_counted.total:null` and no by-criterion block',
                                'no_money': 'no amount, no P&L, no goal figure anywhere on the payload or the card; `outcome_joined:false` with the sentence saying why, and `broker_verified:false`',
                                'days': 'TRADES are counted, never calendar days; `days_with_a_rep` is informational and the payload says skipping days is permitted (so nobody is pushed into a forced trade)',
                                'immediately': 'operationalised as the trade\u2019s own UTC close day, because the app cannot observe human immediacy; the observed gap (median/worst) is reported beside it and the proxy is labelled'},
                    'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative),
                    'fixed_zip': {'source_files': 163, 'application_byte_differences': 0, 'pristine_byte_differences': 0},
                    'engine_files_unchanged': ENGINE_UNCHANGED, 'newly_protected_from_m112': M112_CHANGED, 'newly_protected_from_m13': M13_CHANGED,
                    'm115_touches_inside_the_protected_set': M115_TOUCHES, 'other_protected_files': [p for p in PROTECTED if p not in M115_TOUCHES][:40],
                    'doc_corrections': {'M17': 'PLAYLIST-CURRICULUM.md row 32 reworded: no day-counting habit streak is claimed (the only streak in the tree is consecutive LOSSES in correction.js), the clean-rep count is named as the Ep 32 surface, and the row states that the upload\u2019s own content is not verifiable from this workspace (playlist metadata only)',
                                        'M18': 'PLAYLIST-CURRICULUM.md gains "The five all-or-nothing triggers: which are advisory, which are gating" \u2014 each of Ep 25\u2019s five triggers with the deciding line in src/bots/setup.js and an explicit advisory/gating column; all five gate at this release and the remaining caps are advisory',
                                        'M19': 'NOT-IMPLEMENTED.md \u00a72 row 8 corrected from "count 0" to the measured 5 in index.html + views (0 in index.html itself, 8 across public/js) WITH the reproducing grep, and states what the attributes actually are'},
                    'scope': 'M115 the clean-rep count of Ep 32\u2019s exercise: one read-only module (`src/challenge.js`, clean-reps-v1), one read key on the existing analytics payload, one card, and the trader\u2019s own start/target in the settings they already own. Counts RECORDED facts \u2014 the plan link, the checklist and stop decision, and M85\u2019s hash-verified acknowledgement on the close day \u2014 over closed TRADES, and reports a not-started or unreadable count as unknown rather than zero. Explicitly NOT claimed: money, grades, permissions, caps, guardrail decisions, causality, broker verification, or human immediacy.'}
            (P / 'M115-CLEAN-REPS-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
            companion = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'source_files': 163, 'excluded_from_zip_to_avoid_self_hash': True}
            (E / 'archive-sha256.json').write_text(json.dumps(companion, indent=2) + '\n')
            print('Four constructed runtime stages + docs + actual M13/M65 parent + pristine: forward/reverse 0 byte differences.')
            print('Exact 132/113/3/16; M115 116/0, controls measured (parent 0/1 x4 + 13/0, counter-only 41/0 + 1 fail + 1 fail + 18/0 + 13/0).')
            print(json.dumps(companion, indent=2))
            return
        # Replay-only: rebuild the stages from the saved patches (never from the work tree) and require
        # every guard in both directions before the ZIP is touched.
        before = parent; stages = []
        for name, patch_name in STAGES:
            after = work / name; shutil.copytree(before, after, symlinks=True)
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
        archive = ROOT / 'tradingpro-fixed.zip'; companion = read('analysis/evidence/m115/archive-sha256.json')
        assert companion['source_files'] == 163 and archive.stat().st_size == companion['bytes'] and sha(archive.read_bytes()) == companion['sha256'], 'the delivered ZIP is not the one this run reproduces'
        print('Replay-only: every stage rebuilt from its saved patch reproduced its frozen guard; the delivered ZIP is byte-identical to the reproduced one.')


if __name__ == '__main__':
    main()
