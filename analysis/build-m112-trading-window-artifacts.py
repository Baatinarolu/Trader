#!/usr/bin/env python3
"""M112 deterministic delivery: four constructed runtime stages, docs, the actual M111 release as the
measured upgrade parent and the pristine cumulative diff.

Every stage tree is re-derived from the saved patches and must match its frozen `<stage>-source.json`
byte-for-byte in both directions; the delivered tree is then stacked onto the pristine
`tradingpro-main.zip` to produce `tradingpro-fixed.zip` with an SHA companion computed outside the
archive. Counts, control runs, declared negatives and the ledger are asserted here so the delivery
cannot drift from the evidence.

    python3 analysis/run-m112-verification.py --suite feature --freeze-parents   # counts, parents
    python3 analysis/capture-m112-stages.py --controls                           # parent + pre-hardening controls
    python3 analysis/capture-m112-stages.py                                      # stage trees + guards + harness
    python3 analysis/build-m112-trading-window-artifacts.py --capture-stages
    python3 analysis/capture-m112-stages.py                                      # freeze the patches in the guard
    python3 analysis/build-m112-trading-window-artifacts.py                       # replay only, twice
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m112'; P = ROOT / 'analysis/patches'
BASE = '4791809b2cc757a8bfbd19a389207677dbbf7aff'
STAGES = [('policy', 'm112-trading-window-policy.patch'), ('engine', 'm112-trading-window-engine.patch'), ('consumers', 'm112-trading-window-consumers.patch'), ('documentation', 'm112-trading-window-documentation.patch')]
COMBINED = 'm112-trading-window-complete.patch'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts', 'make_patch', 'contents', 'allowed', 'add_zip']]
PRIOR = runpy.run_path(str(ROOT / 'analysis/build-m111-calendar-unknown-artifacts.py'), run_name='m112_prior_m111_artifact_helpers')
# Everything M100-M111 protected (M110's own list of 75, plus the four files M110 changed and the
# four M111 changed, which are protected from M112 on), minus what M112 is allowed to touch.
M110_CHANGED = PRIOR['M110_CHANGED']
M111_CHANGED = PRIOR['M111_TOUCHES']
M112_TOUCHES = ['src/trading-window.js', 'src/db.js', 'src/performance.js', 'src/bots/correction.js', 'src/bots/index.js', 'src/bots/setup.js', 'src/routes/bots.js', 'public/js/views/settings.js', 'public/js/views/bots.js']
PROTECTED = sorted((set(PRIOR['PROTECTED']) | set(M110_CHANGED) | set(M111_CHANGED)) - set(M112_TOUCHES))
CHANGED = {'README.md', 'docs/API.md', *M112_TOUCHES}
ENGINE_UNCHANGED = PRIOR['ENGINE_UNCHANGED']
# The five assertions in the M110 cohort that measure the PRE-M111 state on purpose, as exact
# substrings of the probe output: M112 changes none of them and is not allowed to soften them.
M110_NEGATIVES = PRIOR['M110_NEGATIVES']
# The assertions in the M110 cohort that freeze the exact M110-era shape of `accounts`: they fail on
# the M112 tree for the same reason the two M111 ones do (four additive window columns), and are
# retained by name rather than edited to accept a shape they were written to exclude.
M112_SCHEMA_NEGATIVES = [('portable', 'a backup carries the pair out, so a trader can see which window their own archive was taken under \u2014 as two columns, with no single knob beside them'),
                         ('migration', 'every pre-existing account column keeps its name, declared type, nullability and default, and the two new columns are appended LAST'),
                         ('migration', 'the ONLY difference in the inherited `accounts` rows is the two new columns \u2014 id, name, balance and policy fields are untouched'),
                         ('migration', 'and the position difference is recorded instead of hidden: the inherited columns are appended LAST, the fresh DDL places them before the drawdown fields')]
# The pre-hardening fault lines: the SAME assertions the delivered tree answers 'ok', failing on the
# tree where the rule and the columns exist and nothing enforces them.
PRE_FAULTS = {
    'engine': ['FAIL with no window selected the engine vetoes nothing and says so',
               'FAIL outside the window the candidate carries the refusal in its no-trade list \u2014 a veto, not a lower score',
               'FAIL the filter states the window beside the killzone so a client renders it without parsing the veto'],
    'consumers': ['FAIL a window that cannot contain the trader\u2019s local time produces the SAME kind of stop the personal guardrails produce',
                  'FAIL the entry-admission path REFUSES it: 409, the guardrail code, and the operation never runs (no trade is written)',
                  'FAIL the desk playlist publishes the window\u2019s own stop rather than a second opinion about it'],
    'api': ['FAIL a desk with no window reports `unset` and says nothing is blocked on one \u2014 not an empty pass and not a guessed boundary',
            'FAIL with the routine complete and the window outside, the entry is REFUSED by the window: 409, the guardrail code, and the window\u2019s own rule',
            'FAIL the SAME entry is admitted as soon as the clock is inside the window'],
    'ui': ['FAIL the dialog exists as a labelled action per account, addressed by that account\u2019s own id',
           'FAIL the bots view carries the window line beside the killzone restriction rather than only inside a veto string',
           'FAIL with 34 recorded London closes the dialog offers the band it derived, in the trader\u2019s own clock, as a BUTTON'],
}
DELIVERED_ANSWERS = {k: [l.replace('FAIL ', 'ok ', 1) for l in v] for k, v in PRE_FAULTS.items()}


def gate(edir, suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/' + edir + '/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (edir, suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    guards = {n: read('analysis/evidence/m112/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = guards['documentation']
    # The parent is the 146-file M111 release; every stage carries the new module, so the four stage
    # trees and the delivered tree are 147 files.
    assert len(current) == 147 and len(guards['parent']) == 146, (len(current), len(guards['parent']))
    assert all(len(guards[s[0]]) == 147 for s in STAGES), {s[0]: len(guards[s[0]]) for s in STAGES}
    assert sha((APP / 'src/trading-window.js').read_bytes()) == current['src/trading-window.js'] and 'src/trading-window.js' not in guards['parent'], 'the rule is the file this milestone adds'
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/engine/journal/guard/gate/intention/practice/ask/news-policy source changed'
    assert all(guards['parent'][p] == current[p] for p in ENGINE_UNCHANGED if p not in CHANGED), 'An unchanged entry-engine module moved'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED, 'Unexpected changed-file set'
    assert {p for p in set(current) | set(guards['consumers']) if guards['consumers'].get(p) != current.get(p)} == {'README.md', 'docs/API.md'}, 'Docs changed runtime'
    # The pre-M112 stages carry the parent's OWN files, so the staged fault is the committed
    # behaviour of the release being fixed rather than a retyped approximation.
    for stage, rel in [('policy', 'src/bots/correction.js'), ('policy', 'src/bots/index.js'), ('policy', 'src/bots/setup.js'), ('policy', 'src/routes/bots.js'), ('policy', 'src/performance.js'), ('policy', 'public/js/views/settings.js'), ('policy', 'public/js/views/bots.js'),
                       ('engine', 'src/routes/bots.js'), ('engine', 'src/performance.js'), ('engine', 'public/js/views/settings.js'), ('engine', 'public/js/views/bots.js')]:
        assert guards[stage][rel] == guards['parent'][rel] and guards[stage][rel] != current[rel], (stage, rel)
    for stage, rel in [('policy', 'src/trading-window.js'), ('policy', 'src/db.js'), ('engine', 'src/bots/correction.js'), ('engine', 'src/bots/setup.js'), ('consumers', 'src/routes/bots.js'), ('consumers', 'src/performance.js'), ('consumers', 'public/js/views/settings.js')]:
        assert guards[stage][rel] == current[rel], ('the stage must carry the delivered file', stage, rel)
    assert guards['policy'] == read('analysis/evidence/m112/pre-hardening-source.json'), 'the pre-hardening control tree must be the policy stage (asserted identical, never copied twice)'
    harness = read('analysis/evidence/m112/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('m112', 'feature', 181, 0, 6)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (36, 0), 'engine': (18, 0), 'consumers': (32, 0), 'api': (49, 0), 'migration': (16, 0), 'ui': (30, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m112/m112feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    # The milestone M112 sits on, re-run on this tree: the trading window is additive to the
    # calendar-read states, so the M111 cohort reproduces exactly.
    declared = []
    m111 = gate('m111', 'feature', 152, 2, 8, 1)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m111['runs']} == {'pure': (26, 0, 0), 'engine': (21, 0, 0), 'consumers': (20, 0, 0), 'api': (14, 0, 0), 'freshness': (11, 0, 0), 'hardening': (36, 0, 0), 'portable': (10, 0, 0), 'migration': (14, 2, 1)}, m111['runs']
    M111_NEGATIVE_LABELS = ["M111 adds NO schema object of any kind and changes none: every table, index and trigger is byte-identical to the parent's",
                            'every inherited fact is byte-identical after the upgrade: a state that is derived on every read has nothing to store']
    m111_text = (ROOT / 'analysis/evidence/m111/m111feature-migration.txt').read_text()
    for label in M111_NEGATIVE_LABELS:
        assert ('FAIL ' + label) in m111_text, ('the M111 negative must be the frozen assertion it claims to be', label)
        declared.append({'cohort': 'M111', 'suite': 'm111feature/migration', 'frozen_assertion': label, 'evidence': 'analysis/evidence/m111/m111feature-migration.txt', 'why': 'M111 wrote this assertion to prove that IT added no schema object of any kind. M112 adds four additive `accounts` columns on purpose, so the assertion now fails and is retained by name rather than edited away; the probe text, its failing labels and its nonzero exit are preserved in analysis/evidence/m111/m111feature-migration.txt.'})
    # The M110 cohort, whose five failures are the declared M111-closure negatives; the payload it
    # dumps also gained `trading_window` under M112, which those probes record without asserting on it.
    m110 = gate('m110', 'feature', 249, 9, 9, 4)
    assert {r['name']: (r['pass'], r['fail'], r['exit_code']) for r in m110['runs']} == {'pure': (41, 0, 0), 'api': (40, 0, 0), 'engine': (23, 2, 1), 'consumers': (19, 3, 1), 'freshness': (17, 0, 0), 'hardening': (40, 0, 0), 'portable': (16, 1, 1), 'migration': (30, 3, 1), 'ui': (23, 0, 0)}, m110['runs']
    M110_E = ROOT / 'analysis/evidence/m110'
    for name, label in M110_NEGATIVES:
        text = (M110_E / ('m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt', 'why': 'M110 wrote this assertion to measure the pre-M111 state. M111 changed that measurement on purpose; M112 does not touch the calendar read at all, so the assertion fails for the same reason it did on the M111 tree and is retained by name rather than deleted.'})
    for name, label in M112_SCHEMA_NEGATIVES:
        text = (M110_E / ('m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the M112-caused declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt', 'why': 'This assertion freezes the M110-era shape of `accounts` (exactly two news columns, appended last). M112 adds four additive `accounts` columns for the trading window, so the frozen shape assertion now fails and is retained by name; the probe text and its failing label are preserved.'})
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
        declared.append({'cohort': [x[0] for x in prior if x[1] == edir and x[2] == summary][0], 'suite': prefix + '/migration', 'pass': p, 'fail': 2, 'frozen_assertion': label, 'inherited_facts_detail': marker, 'why': name + ' says that release added ONLY its own schema objects, and the same probe compares the inherited facts of every table including `accounts`. The `accounts` table has carried M110\u2019s two news columns since b39d9ef and now carries M112\u2019s four window columns as well, so exactly two assertions fail; nothing was edited to make them pass, and the probe text, its failing labels and its nonzero exit are preserved in analysis/evidence/' + edir + '/' + prefix + '-migration.txt.'})
    # RAW / DECLARED / the live-provider arm, RE-RUN on this tree in this session.
    raw = gate('m108', 'raw', 596, 156, 31, 21, 1, 1); declared_run = gate('m108', 'declared', 824, 4, 31, 2); live = gate('m108', 'pure', 70, 1, 8, 6, 0, 5)
    native = read('analysis/evidence/m108/feature-summary.json')
    # Parent controls: the unchanged M112 probes on the feature-absent M111 release.
    control_expected = {n: (0, 1) for n in ['pure', 'engine', 'consumers', 'api', 'migration', 'ui']}
    parent_controls = read('analysis/evidence/m112/parent-controls.json')
    assert set(parent_controls) == set(control_expected), (set(parent_controls), set(control_expected))
    for name, n in control_expected.items():
        assert (parent_controls[name]['pass'], parent_controls[name]['fail']) == n and parent_controls[name]['exit_code'] != 0, (name, n)
        assert counts(read('analysis/evidence/m112/parent-' + name + '-results.json')) == n, (name, n)
        assert 'the committed parent does not' in (E / ('parent-' + name + '.txt')).read_text(), name
    # Pre-hardening controls: the policy stage (the rule and the columns present, nothing enforcing
    # them), measured by the UNCHANGED probes. The staged faults are asserted from the probe output.
    pre = read('analysis/evidence/m112/pre-hardening-controls.json')
    pre_expected = {'engine': (4, 14), 'consumers': (7, 25), 'api': (7, 42), 'ui': (3, 27)}
    for name, n in pre_expected.items():
        assert (pre[name]['pass'], pre[name]['fail']) == n and pre[name]['exit_code'] != 0, (name, n, pre[name])
        assert counts(read('analysis/evidence/m112/pre-hardening-' + name + '-results.json')) == n, (name, n)
    for name in pre_expected:
        pre_text = (E / ('pre-hardening-' + name + '.txt')).read_text(); delivered_text = (E / ('m112feature-' + name + '.txt')).read_text()
        for line in PRE_FAULTS[name]:
            assert line in pre_text, ('the pre-hardening control must fail on the missing enforcement', name, line)
        for line in DELIVERED_ANSWERS[name]:
            assert line in delivered_text, ('the delivered tree must answer the same assertion', name, line)
    smoke = read('analysis/evidence/m112/smoke-exit.json'); text = (E / 'smoke.txt').read_text(); control_text = (E / 'smoke-parent-control.txt').read_text()
    # The harness offers its view list conditionally, so the count is COMPARED at the same sample on
    # both trees rather than asserted as a constant (the same measurement M110 and M111 recorded).
    assert smoke['exit_code'] == 0 and smoke['ui_style_failures'] == 0 and smoke['console_errors'] == 0, smoke
    assert smoke['parent_control']['exit_code'] == 0 and smoke['parent_control']['views_passed'] == smoke['views_passed'] and smoke['views_passed'] == smoke['views_offered'] and smoke['parent_control']['console_errors'] == 0, 'the unchanged parent must offer the same view count at the same sample'
    for arm, body in (('delivered', text), ('parent control', control_text)):
        assert f"RESULT: {smoke['views_passed']}/{smoke['views_offered']} views OK, 0 UI-style failures, 0 console errors" in body, ('the smoke arm must report the measured sample', arm)
    assert smoke['window_dialog_coverage'].startswith("grep -ci 'trading window' = 0"), 'the smoke run must not be claimed as dialog coverage'
    assert 'probe-m112-ui.js (30 assertions)' in smoke['window_dialog_coverage'], 'the dialog coverage must be named where the smoke run is described'
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']), 'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'], 'todo_ids': [k for k, v in rows.items() if v['status'] == 'todo']}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 107, 2, 23, 0, 8]
    assert ledger['partial_ids'] == ['M30', 'M103'] and rows['M112']['status'] == 'done' and all(rows[k]['status'] == 'done' for k in ['M108', 'M109', 'M110', 'M111'])
    scope = read('analysis/evidence/m112/SCOPE.json')
    assert scope['parent'] == BASE and scope['ledger_before'] == [132, 106, 2, 24, 0, 8] and scope['ledger_after'] == [ledger['total'], ledger['done'], ledger['partial'], ledger['todo'], ledger['no_action'], ledger['partition_groups']]
    parents = read('analysis/evidence/m112/regression-parents.json')
    assert len(parents['parents']) == 20 and str(parents['parents'][str(Path('/tmp/m112-parent/app'))]['byte_differences']) == '0' and all(v['byte_differences'] == 0 for v in parents['parents'].values()), {k: v for k, v in parents['parents'].items() if v['byte_differences']}
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m112-delivery-') as td:
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
                for rel in FILES_FOR(name):
                    # The pre-M112 files are taken from the parent's OWN tree, so each staged fault is
                    # the committed behaviour of the release being fixed rather than a retyped guess.
                    data = (parent / rel).read_bytes() if rel in PRE_M112_FILES.get(name, []) else (APP / rel).read_bytes()
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
            info = {'base_commit': BASE, 'parent': 'Actual 4791809 M111 Git release tree (147 files) as the M112 parent; the inherited M111 parent (the actual b39d9ef M110 release), the M110 parent and every older parent rebuilt by saved reverse patches and asserted against the frozen proofs. M112 upgrades the parent database in place by ADDING four columns to `accounts` and changing nothing else about any table; the same entry the parent admits outside any boundary is refused here with the window\u2019s own rule.', 'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger, 'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']},
                    'prior_cohorts_rerun': {c: {'pass': n[0], 'fail': n[1], 'probes': n[2], 'completed_nonzero': n[3], 'evidence': 'analysis/evidence/' + edir + '/' + summary + '-summary.json'} for c, edir, summary, prefix, n in [('m111feature', 'm111', 'feature', 'm111feature', (152, 2, 8, 1)), ('m110feature', 'm110', 'feature', 'm110feature', (249, 9, 9, 4))] + prior},
                    'inherited_arms_rerun_this_session': {'note': 'RAW, DECLARED and the live-provider arm were re-run on this tree in this session through analysis/run-m112-verification.py and reproduce the committed records exactly.', 'raw': {k: raw[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero', 'timeout_no_exit', 'summaryless']}, 'declared': {k: declared_run[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero']}, 'live_provider_attempts': {k: live[k] for k in ['pass', 'fail', 'completed_nonzero', 'summaryless']}},
                    'native_arms_inherited_not_rerun': {'note': 'The native API/bots provider arms need a market provider this sandbox cannot reach; the committed M108 record stands and is asserted as an inherited fact. M112 adds no provider call.', 'native': {k: native[k] for k in ['pass', 'fail', 'probes']}},
                    'declared_negatives': declared, 'regression_parents': {'trees': len(parents['parents']), **parents},
                    'controls': {'parent': {k: list(v) for k, v in control_expected.items()}, 'pre_hardening': {'compare': 'the policy stage IS the pre-hardening runtime (the delivered rule and the four columns with the committed M111 engine, endpoints and views), asserted identical to pre-hardening-source.json', 'probes': {k: {'pass': v['pass'], 'fail': v['fail']} for k, v in pre.items()}, 'faults': ['the module can evaluate a window and the columns can store one, but nothing consults either: setup.js has no veto and no `filters.trading_window`', 'the engine never merges the state, so the entry-admission path admits what the trader forbade', 'there is no window endpoint at all: `/api/bots/window` is a 404 and no suggestion can be read or accepted', 'the settings dialog has no window fields and the bots view has no window line'], 'why': 'On the pre-hardening runtime the unchanged probes measured engine 4/14, consumers 7/25, api 7/42 and ui 3/27, and every failing line names the missing enforcement rather than a crash; the same assertions are `ok` on the delivered tree (181/0), and the three fault lines per probe are asserted from both texts above. The staged fault IS the parent\u2019s own committed file.', 'parent_measured_inside_the_delivered_probes': 'The migration probe spawns the parent\u2019s OWN code on the same database: its accounts table has none of the four columns, its own row reads back with the routine settings intact, and the delivered tree afterwards shows exactly the four new NULL columns.'}},
                    'smoke': {**{k: v for k, v in smoke.items() if k != 'parent_control'}, 'parent_control_views': 21, 'covers_the_window_dialog': False, 'field_coverage': ['analysis/probe-m112-ui.js 30/0 — the window dialog, the labelled suggestion and the clear action']},
                    'trading_window': {'version': 'trading-window-v1', 'states': ['unset', 'inside', 'outside', 'unavailable'], 'unset_blocks_nothing': True, 'unavailable_blocks': True, 'boundary': 'half-open [start, end) on the trader\u2019s own IANA clock; a start later than the end wraps midnight on purpose; both sides or neither; an equal pair is refused', 'zone_rule': 'the account\u2019s owned routine timezone; a window authored in another zone is `unavailable` naming both clocks rather than being reinterpreted', 'columns': ['window_start', 'window_end', 'window_timezone', 'window_source'], 'column_constraints': {'format': "GLOB '[0-2][0-9]:[0-5][0-9]'", 'hour': 'CAST(substr(...,1,2) AS INTEGER) BETWEEN 0 AND 23', 'pairing': 'both sides or neither; end<>start', 'zone': 'required with the pair, 1\u2013100 chars', 'source': "IN ('manual','from_session_history')"}, 'suggestion': {'source': 'from_session_history, labelled with `basis` and `applied:false` always', 'floor': 30, 'band': 'circular middle 50 % of the trader\u2019s own recorded entry hours, rounded outward', 'refusals': ['below_review_floor', 'no_recorded_session', 'zone_required', 'no_single_band'], 'recorded_as_history_only_when': 'the submitted pair is exactly the candidate derived at that moment'}, 'enforcement': {'shape': 'the state gate\u2019s own merge: breach + status stop + permission {allowed:false, can_override:false, state:\u2019trading_window\u2019}', 'surfaces': ['Guards.applyToSetups', 'the entry-admission path (POST /trades)', 'the Now playlist and every scan row', 'setups.filters.trading_window'], 'never': ['a scored penalty', 'a grade change', 'an override', 'a hidden existing stop']}, 'limits': {'read_only_reads': True, 'grants_permission': False, 'predicts': False, 'infers_a_window': False, 'retunes_nothing': True}},
                    'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative), 'fixed_zip': {'source_files': 147, 'application_byte_differences': 0, 'private_env_db_dependency_files': 0}, 'engine_files_unchanged': ENGINE_UNCHANGED, 'newly_protected_from_m111': M111_CHANGED, 'm112_touches_inside_the_protected_set': M112_TOUCHES, 'other_protected_files': [p for p in PROTECTED if p not in ENGINE_UNCHANGED], 'harness_source_files': len(harness), 'package_lock_sha256': sha((APP / 'package-lock.json').read_bytes()),
                    'scope': 'M112 the trading window: a hard block, not a penalty. `src/trading-window.js` owns unset/inside/outside/unavailable with a half-open `[start, end)` on the trader\u2019s own IANA clock, four additive `accounts` columns with the schema\u2019s own CHECKs, a labelled from_session_history suggestion refused below the 30-trade review floor and never applied by the server, and the merge into the desk\u2019s personal state so the entry-admission path, every scan row and `POST /trades` refuse a signal outside it as a veto with `can_override:false` beside the existing non-negotiables. Nothing else moved: no weight, grade, cap, clock, floor, target or risk setting; the weight-8 session/killzone row is untouched; unknown/legacy/imported inputs stay explicitly separate (unset/unavailable/not_consulted) rather than being defaulted into a window. No 70 %/causal/predictive/broker/provider/human/mental-state/pixel/production proof, and no claim that an hour will be profitable.'}
            (P / 'M112-TRADING-WINDOW-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
            companion = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'source_files': 147, 'excluded_from_zip_to_avoid_self_hash': True}
            (E / 'archive-sha256.json').write_text(json.dumps(companion, indent=2) + '\n')
            print('Four constructed runtime stages + docs + actual M111 parent + pristine: forward/reverse 0 byte differences.')
            print('Exact 132/107/2/23; M112 181/0, controls measured, declared negatives retained by name.')
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
        archive = ROOT / 'tradingpro-fixed.zip'; companion = read('analysis/evidence/m112/archive-sha256.json')
        assert companion['source_files'] == 147 and archive.stat().st_size == companion['bytes'] and sha(archive.read_bytes()) == companion['sha256'], 'the delivered ZIP is not the one this build reproduces'
        print('Replay-only: every stage rebuilt from its saved patch reproduced its frozen guard; the delivered ZIP is byte-identical to the reproduced one.')


# The files each stage writes, and which of them are the parent's own (i.e. still pre-M112).
FILES_FOR = lambda stage: {'policy': ['src/trading-window.js', 'src/db.js', 'src/bots/correction.js', 'src/bots/index.js', 'src/bots/setup.js', 'src/routes/bots.js', 'src/performance.js', 'public/js/views/settings.js', 'public/js/views/bots.js'],
                           'engine': ['src/bots/correction.js', 'src/bots/index.js', 'src/bots/setup.js', 'src/routes/bots.js', 'src/performance.js', 'public/js/views/settings.js', 'public/js/views/bots.js'],
                           'consumers': ['src/routes/bots.js', 'src/performance.js', 'public/js/views/settings.js', 'public/js/views/bots.js'],
                           'documentation': ['README.md', 'docs/API.md']}[stage]
PRE_M112_FILES = {'policy': ['src/bots/correction.js', 'src/bots/index.js', 'src/bots/setup.js', 'src/routes/bots.js', 'src/performance.js', 'public/js/views/settings.js', 'public/js/views/bots.js'],
                  'engine': ['src/routes/bots.js', 'src/performance.js', 'public/js/views/settings.js', 'public/js/views/bots.js']}


if __name__ == '__main__':
    main()
