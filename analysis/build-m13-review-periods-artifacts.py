#!/usr/bin/env python3
"""M13/M65 deterministic delivery: five constructed runtime stages, docs, the actual M12 release as the
measured parent and the pristine cumulative diff.

The gap this milestone fixes is a missing SURFACE, not a missing rule: the review system has spoken in
weeks/quarters since M99/M101 and the rule-change advisory in quarters since M104, and the payload the
review reads had only day and month buckets and no record joining a period to the artifact the trader
saved for it. So the stages are `ruler` (the shared calendar exists and nothing can read it — the fault
this milestone fixes), `series` (closes are bucketed by week and quarter on the wire), `record` (the
record of which periods were reviewed rides the payload), `card` (the shipped card) and
`documentation`. Every stage tree is rebuilt from the saved patches and must match its frozen
`<stage>-source.json` byte-for-byte in BOTH directions; the delivered tree is then stacked onto the
pristine `tradingpro-main.zip` to produce `tradingpro-fixed.zip` with an SHA companion computed
outside the archive.

    python3 analysis/run-m13-verification.py --suite feature --freeze-parents   # counts, parent
    python3 analysis/capture-m13-stages.py                                       # stage trees + guards + harness
    python3 analysis/capture-m13-stages.py --controls                            # parent + pre-hardening controls
    python3 analysis/build-m13-review-periods-artifacts.py --capture-stages      # patches, ledger, ZIP
    python3 analysis/capture-m13-stages.py                                       # freeze the patches in the guard
    python3 analysis/build-m13-review-periods-artifacts.py                       # replay only, twice

This milestone carries nothing forward: the parent (the actual 9c88e0a M12 release) already ships
`tools/jsmin/**` and `src/rule-breaks.js`, so the delivered files the parent does not have are exactly
M13/M65's own two new files, derived and asserted in `analysis/capture-m13-stages.py` rather than
assumed.
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m13'; P = ROOT / 'analysis/patches'
BASE_FULL = '9c88e0acfee00462e6c6ba5e3cb0d3ae06444b2c'
# The git commands address the parent by its unambiguous abbreviation and assert what it resolves to:
# this sandbox is a partial clone whose lazy fetch is not always available, while the short form
# resolves from the local commit-graph. The identity is pinned to the full SHA either way.
BASE = '9c88e0a'
STAGES = [('ruler', 'm13-review-periods-ruler.patch'), ('series', 'm13-review-periods-series.patch'), ('record', 'm13-review-periods-record.patch'), ('card', 'm13-review-periods-card.patch'), ('documentation', 'm13-review-periods-documentation.patch')]
COMBINED = 'm13-review-periods-complete.patch'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts', 'make_patch', 'contents', 'allowed', 'add_zip']]
PRIOR = runpy.run_path(str(ROOT / 'analysis/build-m112-trading-window-artifacts.py'), run_name='m13_prior_m112_artifact_helpers')
CAPTURE = runpy.run_path(str(ROOT / 'analysis/capture-m13-stages.py'), run_name='m13_capture_constants')
FILES_FOR = CAPTURE['FILES']
PRE_M13_FILES = CAPTURE['FROM_PARENT']
OWN_NEW = CAPTURE['OWN_NEW']
# Everything M100-M112 protected (M111's own list, plus the four files M111 changed and the nine M112
# changed, which are protected from M12 on), minus what this milestone is allowed to touch.
M111_CHANGED = PRIOR['M111_CHANGED']
M112_CHANGED = PRIOR['M112_TOUCHES']
M13_TOUCHES = ['src/periods.js', 'src/performance.js', 'src/period-reviews.js', 'src/routes/api.js', 'public/js/views/review-periods.js', 'public/index.html', 'public/js/views/analytics.js']
PROTECTED = sorted((set(PRIOR['PROTECTED']) | set(M111_CHANGED) | set(M112_CHANGED)) - set(M13_TOUCHES))
CHANGED = {'README.md', 'docs/API.md', 'src/performance.js', 'src/period-reviews.js', 'src/routes/api.js', 'public/index.html', 'public/js/views/analytics.js'}
ADDED = list(OWN_NEW)
ENGINE_UNCHANGED = PRIOR['ENGINE_UNCHANGED']
# The pre-hardening fault lines: the SAME facts the delivered tree answers 'ok', failing on the tree
# where the ruler and the buckets exist and nothing records or shows which periods were reviewed.
PRE_FAULTS = {
    # `pure` gets further here than on any earlier milestone's pre-hardening tree: the ruler and the
    # series assertions all PASS (the calendar is measured working), and the probe then stops at the
    # record that does not exist yet.
    'pure': ['TypeError: R.coverageOf is not a function'],
    'api': ["FAIL this tree ships the review-period coverage (the committed parent does not, and that absence is this probe's control)"],
    'migration': ['TypeError: Q.coverage is not a function'],
    'ui': ['Error: ENOENT: no such file or directory, open', 'public/js/views/review-periods.js'],
}
DELIVERED_ANSWERS = {
    'pure': ['ok a saved artifact is joined by its canonical period start and reported as `completed` with its own receipt'],
    'api': ['ok the record is scoped to the RESOLVED analysed account, the same account the payload analyses'],
    'migration': ['ok the artifact the parent\u2019s own module wrote is joined to that period as `completed`, with its id and focus intact'],
    'ui': ['ok the card is its own section with a title that names both cadences'],
}


# The literal line each probe prints when it is pointed at the committed parent: the absence of the
# feature IS the control, so the arm is asserted against the probe's own wording rather than one
# sentence typed here.
PARENT_GATES = {
    'pure': 'FAIL this tree ships the M13/M65 calendar ruler (src/periods.js)',
    'api': 'FAIL this tree ships the M13/M65 calendar ruler (the committed parent does not',
    'migration': 'FAIL this tree ships the M13/M65 calendar ruler (the committed parent does not',
    'ui': 'FAIL this tree ships the M13/M65 calendar ruler and its record',
}


def gate(edir, suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/' + edir + '/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (edir, suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    assert run(['git', 'rev-parse', BASE]).decode().strip() == BASE_FULL, 'the abbreviated parent must resolve to the pinned M12 commit'
    guards = {n: read('analysis/evidence/m13/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = guards['documentation']
    # The parent is the 159-file M12 release; every stage carries the ruler, so the five stage trees are
    # 160/160/160/161/161 files and the delivered tree is 161.
    assert len(current) == 161 and len(guards['parent']) == 159, (len(current), len(guards['parent']))
    assert [len(guards[s[0]]) for s in STAGES] == [160, 160, 160, 161, 161], {s[0]: len(guards[s[0]]) for s in STAGES}
    assert sha((APP / 'src/periods.js').read_bytes()) == current['src/periods.js'] and 'src/periods.js' not in guards['parent'], 'the ruler is the file this milestone adds'
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/journal/guard/gate/intention/practice/ask/news/window source changed'
    assert all(guards['parent'][p] == current[p] for p in ENGINE_UNCHANGED if p not in CHANGED), 'An unchanged entry-engine module moved'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED | set(ADDED), 'Unexpected changed-file set'
    assert all(p not in guards['parent'] for p in ADDED), 'an added file must be NEW in this milestone'
    assert all(current.get(p) == guards['ruler'].get(p) for p in ['src/periods.js']), 'the ruler stage must carry the ruler'
    assert all(current.get(p) == guards['card'].get(p) for p in ADDED), 'every added file must be present from the card stage on'
    assert {p for p in set(current) | set(guards['card']) if guards['card'].get(p) != current.get(p)} == {'README.md', 'docs/API.md'}, 'Docs changed runtime'
    # The pre-M13 stages carry the parent's OWN files, so the staged fault is the committed behaviour of
    # the release being fixed rather than a retyped approximation.
    for stage, rel in [('ruler', 'src/performance.js'), ('ruler', 'src/period-reviews.js'), ('ruler', 'src/routes/api.js'), ('ruler', 'public/index.html'), ('ruler', 'public/js/views/analytics.js'),
                       ('series', 'src/period-reviews.js'), ('series', 'src/routes/api.js'), ('series', 'public/index.html'), ('series', 'public/js/views/analytics.js'),
                       ('record', 'public/index.html'), ('record', 'public/js/views/analytics.js')]:
        assert guards[stage][rel] == guards['parent'][rel] and guards[stage][rel] != current[rel], (stage, rel)
    for stage, rel in [('ruler', 'src/periods.js'), ('series', 'src/periods.js'), ('series', 'src/performance.js'), ('record', 'src/periods.js'), ('record', 'src/performance.js'), ('record', 'src/period-reviews.js'),
                       ('record', 'src/routes/api.js'), ('card', 'src/periods.js'), ('card', 'src/performance.js'), ('card', 'src/period-reviews.js'), ('card', 'src/routes/api.js'),
                       ('card', 'public/js/views/review-periods.js'), ('card', 'public/index.html'), ('card', 'public/js/views/analytics.js')]:
        assert guards[stage][rel] == current[rel], ('the stage must carry the delivered file', stage, rel)
    assert guards['series'] == read('analysis/evidence/m13/pre-hardening-source.json'), 'the pre-hardening control tree must be the series stage (asserted identical, never copied twice)'
    harness = read('analysis/evidence/m13/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('m13', 'feature', 94, 0, 4)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (39, 0), 'api': (23, 0), 'migration': (13, 0), 'ui': (19, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m13/m13feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    # The milestone this one sits on, re-run on this tree in this session. M13/M65 adds four read-only
    # keys to the payload the M112 cohort already exercises and no schema object at all, so that cohort
    # reproduces its committed record exactly.
    m112 = gate('m112', 'feature', 181, 0, 6)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m112['runs']} == {'pure': (36, 0, 0), 'engine': (18, 0, 0), 'consumers': (32, 0, 0), 'api': (49, 0, 0), 'migration': (16, 0, 0), 'ui': (30, 0, 0)}, m112
    declared = []
    m111 = gate('m111', 'feature', 152, 2, 8, 1)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m111['runs']} == {'pure': (26, 0, 0), 'engine': (21, 0, 0), 'consumers': (20, 0, 0), 'api': (14, 0, 0), 'freshness': (11, 0, 0), 'hardening': (36, 0, 0), 'portable': (10, 0, 0), 'migration': (14, 2, 1)}, m111
    for name, label in PRIOR['M110_NEGATIVES']:
        text = (ROOT / ('analysis/evidence/m110/m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt', 'why': 'M110 wrote this assertion to measure the pre-M111 world it shipped beside; it is frozen where it was measured and retained by name rather than edited.'})
    for name, label in PRIOR['M112_SCHEMA_NEGATIVES']:
        text = (ROOT / ('analysis/evidence/m110/m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the M112-caused declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt', 'why': 'This assertion freezes the M110-era shape of the inherited `accounts` row; M112 appended the two news columns so the legacy column order no longer matches the fresh DDL, which is a recorded position difference and not a data change.'})
    m110 = gate('m110', 'feature', 248, 10, 9, 4)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m110['runs']} == {'pure': (41, 0, 0), 'api': (40, 0, 0), 'engine': (23, 2, 1), 'consumers': (18, 4, 1), 'freshness': (17, 0, 0), 'hardening': (40, 0, 0), 'portable': (16, 1, 1), 'migration': (30, 3, 1), 'ui': (23, 0, 0)}, m110
    # M12's card reads its OWN payload's `windows` echo (the review's date window), so the M110
    # consumers probe's blanket lexical assertion — no shipped client names `.windows`, i.e. the news
    # echo cannot be mistaken for a control — fails on a NAMED line and stays failing here. The M13/M65
    # card reads none of it: `weekly`/`quarterly`/`review_periods` are different names entirely.
    M12_SCHEMA_LIKE_NEGATIVE = 'no shipped client reads the new `windows` echo either, so the API\u2019s provenance block cannot be mistaken for a control by an old page'
    assert ('FAIL ' + M12_SCHEMA_LIKE_NEGATIVE) in (ROOT / 'analysis/evidence/m110/m110feature-consumers.txt').read_text(), 'the M12-caused M110 negative must be the line it claims to be'
    declared.append({'cohort': 'M110', 'suite': 'm110feature/consumers', 'pass': 18, 'fail': 4, 'frozen_assertion': M12_SCHEMA_LIKE_NEGATIVE, 'evidence': 'analysis/evidence/m110/m110feature-consumers.txt', 'why': 'The M12 rule-break card renders the payload\u2019s `windows` echo, which M110\u2019s lexical guard reads as a client "using" it; the guard is retained by name rather than edited.'})
    # The four delegated cohorts whose OWN summaries were re-measured on this tree in this session and
    # reproduce their committed bytes exactly.
    for edir, suite, n in [('m109', 'feature', (166, 2, 9, 1)), ('m108', 'feature', (257, 2, 9, 1)), ('m107', 'feature', (232, 0, 9, 0)), ('m106', 'feature', (318, 0, 10, 0)), ('m105', 'feature', (142, 0, 10, 0))]:
        d = gate(edir, suite, *n)
        mig = next(r for r in d['runs'] if r['name'] == 'migration')
        declared.append({'cohort': edir.upper(), 'suite': edir + '/feature-' + mig['name'], 'pass': mig['pass'], 'fail': mig['fail'], 'exit_code': mig['exit_code'], 'evidence': 'analysis/evidence/' + edir + '/feature-summary.json',
                         'why': 'Re-measured on this tree in this session: this cohort measured exactly what its committed record says, so its migration result is its own frozen record and not a delta of this milestone.'})
    # The stale nested copies the M110-era chain left behind, declared rather than silently re-read: they
    # measure the same cohorts against a smaller schema and are NOT this tree's result.
    stale = {}
    for name, p in [('m105feature', 'analysis/evidence/m108/m105feature-summary.json'), ('m106feature', 'analysis/evidence/m108/m106feature-summary.json'), ('m107feature', 'analysis/evidence/m108/m107feature-summary.json')]:
        d = read(p); stale[name] = {'pass': d['pass'], 'fail': d['fail'], 'probes': d['probes'], 'completed_nonzero': d['completed_nonzero'], 'path': p}
    assert stale == {'m105feature': {'pass': 140, 'fail': 2, 'probes': 10, 'completed_nonzero': 1, 'path': 'analysis/evidence/m108/m105feature-summary.json'},
                     'm106feature': {'pass': 316, 'fail': 2, 'probes': 10, 'completed_nonzero': 1, 'path': 'analysis/evidence/m108/m106feature-summary.json'},
                     'm107feature': {'pass': 230, 'fail': 2, 'probes': 9, 'completed_nonzero': 1, 'path': 'analysis/evidence/m108/m107feature-summary.json'}}, stale
    # The inherited M99/M101 reviews cohort is STALE at this HEAD, declared by name: 157/3 against its
    # committed 159/1, all three gaps in its migration probe, all three caused by schema growth after
    # M101 (accounts 26->36 columns and ten delivered-only tables) that the M108-era evidence predates.
    reviews = gate('m108', 'reviews', 157, 3, 9, 1)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in reviews['runs']} == {'periods': (30, 0, 0), 'metrics': (20, 0, 0), 'storage': (27, 0, 0), 'focus': (16, 0, 0), 'ui': (18, 0, 0), 'portable': (14, 0, 0), 'hardening': (12, 0, 0), 'freshness': (8, 0, 0), 'migration': (12, 3, 1)}, reviews
    reviews_text = (E.parent / 'm108/reviews/feature-migration.txt').read_text()
    assert 'M99/M101 actual-parent additive review migration: 12 passed, 3 failed' in reviews_text, 'the stale reviews cohort must be the record it claims to be'
    for line in ['FAIL schema additions ONLY review table/index/uniqueindex/immutabletrigger',
                 'FAIL all old table/index/trigger definitions exact, no tradecolumn rebuild/addition',
                 'FAIL ALL original table finance/owner/clocks/provenance/permissions/routine/core facts retained']:
        assert line in reviews_text, ('the stale reviews negative must name its frozen assertion', line)
    declared.append({'cohort': 'M99/M101 (reviews)', 'suite': 'reviews/migration', 'pass': 12, 'fail': 3, 'committed_record': {'pass': 14, 'fail': 1}, 'evidence': 'analysis/evidence/m108/reviews-summary.json', 'why': 'STALE NEGATIVE, DECLARED BY NAME: the cohort was measured at M108 and the schema has grown since (accounts 26->36 columns; ten delivered-only tables: daily_intentions, identity_declarations, opportunity_decisions, opportunity_trade_links, period_reviews, practice_sessions, practice_timers, signal_opportunities, state_gate_answers, strategy_rule_changes). One of the three already failed at the M108 baseline; two flipped relative to it. Not repaired by editing the frozen probe; the isolation path is to stash the period-reviews.js delegation and re-run analysis/probe-m99-migration.js.'})
    # RAW / DECLARED / the live-provider arm, RE-RUN on this tree in this session through the delegated
    # chain; each reproduces its committed record exactly.
    raw = gate('m108', 'raw', 596, 156, 31, 21, 1, 1); declared_run = gate('m108', 'declared', 824, 4, 31, 2); live = gate('m108', 'pure', 70, 1, 8, 6, 0, 5)
    # Parent controls: the unchanged M13/M65 probes on the feature-absent M12 release.
    control_expected = {n: (0, 1) for n in ['pure', 'api', 'migration', 'ui']} | {'control': (11, 0)}
    parent_controls = read('analysis/evidence/m13/parent-controls.json')
    assert set(parent_controls) == set(control_expected), (set(parent_controls), set(control_expected))
    for name, n in control_expected.items():
        assert (parent_controls[name]['pass'], parent_controls[name]['fail']) == n, (name, n)
        # The four feature probes stop at their first assertion on the feature-absent parent; the
        # mode-aware control probe PASSES there on purpose (it measures the absence rather than failing
        # on it, in all three modes: parent 11/0, series-only 11/0, delivered 11/0).
        assert parent_controls[name]['exit_code'] == (0 if n[1] == 0 else 1), (name, n, parent_controls[name]['exit_code'])
        assert counts(read('analysis/evidence/m13/parent-' + name + '-results.json')) == n, (name, n)
        text = (E / ('parent-' + name + '.txt')).read_text()
        if name == 'control':
            assert 'M13/M65 control (parent)' in text and 'FAIL' not in text, name
        else:
            # Each probe stops at its own gate on the feature-absent parent, and the label is that
            # probe's own wording rather than one shared sentence.
            assert PARENT_GATES[name] in text, (name, PARENT_GATES[name])
    # Pre-hardening controls: the series stage (the ruler and the buckets present, nothing recording or
    # showing which periods were reviewed), measured by the UNCHANGED probes.
    pre = read('analysis/evidence/m13/pre-hardening-controls.json')
    pre_expected = {'pure': (24, 1), 'api': (0, 1), 'migration': (6, 1), 'ui': (0, 1), 'control': (11, 0)}
    for name, n in pre_expected.items():
        assert (pre[name]['pass'], pre[name]['fail']) == n, (name, n, pre[name])
        assert counts(read('analysis/evidence/m13/pre-hardening-' + name + '-results.json')) == n, (name, n)
        assert pre[name]['exit_code'] == (0 if n[1] == 0 else 1), (name, n, pre[name]['exit_code'])
    for name, lines in PRE_FAULTS.items():
        pre_text = (E / ('pre-hardening-' + name + '.txt')).read_text(); delivered_text = (E / ('m13feature-' + name + '.txt')).read_text()
        for line in lines:
            assert line in pre_text, ('the pre-hardening control must fail on the missing surface', name, line)
        for line in DELIVERED_ANSWERS[name]:
            assert line in delivered_text, ('the delivered tree must answer the same fact', name, line)
    smoke = read('analysis/evidence/m13/smoke-exit.json'); text = (E / 'smoke.txt').read_text(); control_text = (E / 'smoke-parent-control.txt').read_text()
    assert smoke['exit_code'] == 0 and smoke['ui_style_failures'] == 0 and smoke['console_errors'] == 0, smoke
    assert smoke['parent_control']['exit_code'] == 0 and smoke['parent_control']['views_passed'] == smoke['views_passed'] == smoke['views_offered'], 'the unchanged parent must offer the same view count at the same sample'
    for arm, body in (('delivered', text), ('parent control', control_text)):
        assert f"RESULT: {smoke['views_passed']}/{smoke['views_offered']} views OK, 0 UI-style failures, 0 console errors" in body, ('the smoke arm must report the measured sample', arm)
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']), 'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial']}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 110, 2, 20, 0, 8]
    assert ledger['partial_ids'] == ['M30', 'M103'] and rows['M13']['status'] == 'done' and rows['M65']['status'] == 'done' and all(rows[k]['status'] == 'done' for k in ['M108', 'M109', 'M110', 'M111', 'M112', 'M12'])
    scope = read('analysis/evidence/m13/SCOPE.json')
    assert scope['parent'] == BASE_FULL and scope['ledger_before'] == [132, 108, 2, 22, 0, 8] and scope['ledger_after'] == [ledger['total'], ledger['done'], ledger['partial'], ledger['todo'], ledger['no_action'], ledger['partition_groups']], scope['ledger_before']
    parents = read('analysis/evidence/m13/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values()), {k: v for k, v in parents['parents'].items() if v['byte_differences']}
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m13-delivery-') as td:
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
                    # The pre-M13 files are taken from the parent's OWN tree, so each staged fault is
                    # the committed behaviour of the release being fixed rather than a retyped guess.
                    data = (parent / rel).read_bytes() if rel in PRE_M13_FILES.get(name, []) else (APP / rel).read_bytes()
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
            info = {'base_commit': BASE_FULL, 'parent': 'Actual 9c88e0a M12 Git release tree (159 files) as the M13/M65 parent: the milestone that added the rule-break tally and the release these probes measure against. The ruler, the weekly/quarterly buckets and the record are what this milestone adds; nothing at all is added to the schema.',
                    'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger,
                    'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']},
                    'prior_cohorts_rerun': {c: {'pass': n[0], 'fail': n[1], 'probes': n[2], 'completed_nonzero': n[3], 'evidence': 'analysis/evidence/' + edir + '/' + summary + '-summary.json'} for c, edir, summary, n in [('M112', 'm112', 'feature', (181, 0, 6, 0)), ('M111', 'm111', 'feature', (152, 2, 8, 1)), ('M110', 'm110', 'feature', (248, 10, 9, 4)), ('M109', 'm109', 'feature', (166, 2, 9, 1)), ('M108', 'm108', 'feature', (257, 2, 9, 1)), ('M107', 'm107', 'feature', (232, 0, 9, 0)), ('M106', 'm106', 'feature', (318, 0, 10, 0)), ('M105', 'm105', 'feature', (142, 0, 10, 0))]},
                    'inherited_arms_rerun_this_session': {'note': 'RAW, DECLARED, the live-provider arm and the inherited M99/M101 reviews cohort were re-run on this tree in this session through analysis/run-m13-verification.py and reproduce their own records; the reviews cohort reproduces 157/3 where its committed record says 159/1, and that delta is declared by name below rather than repaired.', 'raw': {k: raw[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero', 'timeout_no_exit', 'summaryless']}, 'declared': {k: declared_run[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero']}, 'live_provider': {k: live[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero', 'summaryless']}, 'reviews_M99_M101': {k: reviews[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero']}, 'reviews_committed_record': {'pass': 159, 'fail': 1}},
                    'stale_nested_cohort_copies_declared_not_reread': {'note': 'These three files were written by the M110-era delegation chain and are NOT this tree\u2019s result: they measure the same cohorts against a smaller schema. They are named here so a later reader cannot mistake a committed older copy for a re-run.', 'copies': stale},
                    'native_arms_inherited_not_rerun': {'note': 'The native API/bots provider arms need a market provider this sandbox cannot reach; the committed M108 record stands and is asserted as an inherited fact. M13/M65 adds no provider, broker or network path of any kind.'},
                    'declared_negatives': declared, 'regression_parents': {'trees': len(parents['parents']), **parents},
                    'controls': {'delivered_control_probe': {k: read('analysis/evidence/m13/delivered-control-results.json')[k] for k in ['pass', 'fail']} if (E / 'delivered-control-results.json').exists() else None, 'parent': {k: list(v) for k, v in control_expected.items()}, 'pre_hardening': {k: list(v) for k, v in pre_expected.items()},
                                 'pre_hardening_tree': 'the series stage: the ruler and the weekly/quarterly buckets are measured working (24 pure assertions pass) and nothing records or shows which periods were reviewed',
                                 'why': 'On the pre-hardening runtime the unchanged probes measured pure 24/1 (the probe stops at `R.coverageOf is not a function` AFTER the ruler and series assertions all pass), api 0/1 (no `review_periods` key), migration 6/1 (`Q.coverage is not a function`) and ui 0/1 (ENOENT on the card), while the mode-aware control probe measures 11/0 in every mode. The same facts answer `ok` on the delivered tree (94/0), and each fault line is asserted from both texts above. The staged fault IS the parent\u2019s own committed files.'},
                    'smoke': {**{k: v for k, v in smoke.items() if k != 'parent_control'}, 'parent_control_views': smoke['parent_control']['views_passed'], 'covers_the_review_period_card': False, 'field_coverage': ['analysis/probe-m13-ui.js 19/0 — the card, both cadences, the five artifact states, the open period, the no-amount rule, the outside-window count, the two rulers, the read-only basis and the refresh guard']},
                    'periods': {'version': 'periods-v1', 'kinds': ['week', 'month', 'quarter', 'year'], 'calendar': 'UTC days, Monday-start weeks, calendar months/quarters/years, half-open [start,end) with last_day', 'bucket_keys': {'week': 'the Monday', 'month': 'YYYY-MM', 'quarter': 'YYYY-Qn', 'year': 'YYYY'}, 'sequence_max': 520, 'readers': ['src/period-reviews.js (the review artifacts)', 'src/rule-changes.js (the M104 quarterly advisory)', 'src/performance.js (the new series)'], 'asserted': 'the advisory/ruler agreement is asserted day by day across 2025-2027 in analysis/probe-m13-pure.js', 'leaf': 'no requires, no database, no environment, no filesystem and no clock of its own'},
                    'series': {'basis': 'the review calendar (UTC close-day, Monday-start week, calendar quarter) — distinct from the journal timezone the daily/monthly buckets keep', 'keys': ['weekly', 'quarterly', 'undated_closes'], 'bucket_fields': ['week|quarter', 'start', 'end', 'last_day', 'trades', 'wins', 'losses', 'breakeven', 'pnl', 'r', 'win_rate', 'unknown_net', 'unknown_r', 'days', 'basis'], 'missing_amount_is_not_zero': True, 'undated_close_is_counted_not_guessed': True, 'two_rulers_measured': 'a close at 2026-10-04T23:30:00.000Z is week 2026-09-28 on the review calendar and Lagos day 2026-10-05 on the journal clock'},
                    'review_coverage': {'version': 'review-coverage-v1', 'states': ['completed', 'draft', 'imported_unverified', 'unavailable', 'not_recorded'], 'surfaces': ['analytics.review_periods on the existing GET /api/analytics', 'Views.reviewPeriods.card on the analytics view above its existing tabs'], 'scope': 'the resolved analysed account, the trader\u2019s own artifacts only, latest saved version per canonical period start', 'window': {'weeks': 12, 'quarters': 8}, 'not_recorded_is_not_missed': True, 'unknown_is_not_clean': True, 'outcome_compared': False, 'writes': 0, 'never': ['a new endpoint', 'a write', 'a grade, cap, permission, guardrail-decision or plan-change influence', 'a causal or predictive claim', 'a reviewed-vs-unreviewed comparison']},
                    'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative), 'fixed_zip': {'source_files': 161, 'application_byte_differences': 0, 'private_env_db_dependency_files': 0},
                    'engine_files_unchanged': ENGINE_UNCHANGED, 'newly_protected_from_m112': M112_CHANGED, 'm13_touches_inside_the_protected_set': M13_TOUCHES, 'other_protected_files': [p for p in PROTECTED if p not in ENGINE_UNCHANGED], 'harness_source_files': len(harness), 'package_lock_sha256': sha((APP / 'package-lock.json').read_bytes()),
                    'scope': 'M13/M65 the review periods: ONE shared calendar ruler (`src/periods.js`, periods-v1), the weekly and quarterly buckets it defines on the existing analytics payload, and the read-only record joining each canonical period to the artifact the trader saved for it (`review-coverage-v1`). No schema object of any kind, no new endpoint, NOTHING written, and no grade, cap, permission, guardrail decision or plan-change permission influenced. The two rulers are labelled and never converted: `daily`/`monthly` keep the journal timezone while `weekly`/`quarterly` bucket on the review calendar, and a close near midnight sits in a different period in each. Unknown stays unknown (an unreadable record is `state:\'unavailable\'` with `not_recorded:null`, never a period list of "no review") and a missing amount is not a zero (`pnl:null` with the close counted in `unknown_net`). A period with no artifact is `not_recorded` — explicitly not "missed" and not a clean record — a draft is a draft, an imported copy is unverified, and a period still running is `open` rather than unreviewed. No reviewed-vs-unreviewed comparison (`outcome_compared:false`): no 70 %/causal/predictive/broker/provider/human/mental-state/pixel/production proof, no fill padding, no sample-floor, clock, target, risk or grade retuning, and no existing guard weakened. DECLARED NEGATIVE carried by name: the inherited M99/M101 reviews cohort is stale at this HEAD — 157/3 against its committed 159/1 — because the schema grew after M101 (accounts 26->36 columns; ten delivered-only tables); declared, never repaired by editing the frozen probe.'}
            (P / 'M13-REVIEW-PERIODS-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
            companion = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'source_files': 161, 'excluded_from_zip_to_avoid_self_hash': True}
            (E / 'archive-sha256.json').write_text(json.dumps(companion, indent=2) + '\n')
            print('Five constructed runtime stages + docs + actual M12 parent + pristine: forward/reverse 0 byte differences.')
            print('Exact 132/110/2/20; M13+M65 94/0, controls measured, declared negatives retained by name.')
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
        archive = ROOT / 'tradingpro-fixed.zip'; companion = read('analysis/evidence/m13/archive-sha256.json')
        assert companion['source_files'] == 161 and archive.stat().st_size == companion['bytes'] and sha(archive.read_bytes()) == companion['sha256'], 'the delivered ZIP is not the one this build reproduces'
        print('Replay-only: every stage rebuilt from its saved patch reproduced its frozen guard; the delivered ZIP is byte-identical to the reproduced one.')


if __name__ == '__main__':
    main()
