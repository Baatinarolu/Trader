#!/usr/bin/env python3
"""M111 deterministic delivery: four constructed runtime stages, docs, the actual M110 release as the
measured upgrade parent and the pristine cumulative diff.

Every stage tree is re-derived from the saved patches and must match its frozen `<stage>-source.json`
byte-for-byte in both directions; the delivered tree is then stacked onto the pristine
`tradingpro-main.zip` to produce `tradingpro-fixed.zip` with an SHA companion computed outside the
archive. Counts, control runs, declared negatives and the ledger are asserted here so the delivery
cannot drift from the evidence.

    python3 analysis/run-m111-verification.py --suite feature --freeze-parents   # counts, controls, parents
    python3 analysis/capture-m111-stages.py --controls                           # parent + pre-hardening controls
    python3 analysis/capture-m111-stages.py                                      # stage trees + guards + harness
    python3 analysis/build-m111-calendar-unknown-artifacts.py --capture-stages
    python3 analysis/capture-m111-stages.py                                      # freeze the patches in the guard
    python3 analysis/build-m111-calendar-unknown-artifacts.py                    # replay only, twice
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m111'; P = ROOT / 'analysis/patches'
BASE = 'b39d9ef5ffd526550ad58dc1b5c5385754a32aad'
STAGES = [('policy', 'm111-calendar-unknown-policy.patch'), ('engine', 'm111-calendar-unknown-engine.patch'), ('consumers', 'm111-calendar-unknown-consumers.patch'), ('documentation', 'm111-calendar-unknown-documentation.patch')]
COMBINED = 'm111-calendar-unknown-complete.patch'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts', 'make_patch', 'contents', 'allowed', 'add_zip']]
CORE = H['CORE']
PRIOR = runpy.run_path(str(ROOT / 'analysis/build-m110-news-window-artifacts.py'), run_name='m111_prior_m110_artifact_helpers')
# Everything M100-M110 protected, plus the files M110 changed itself: M111 leaves `src/db.js`, both
# routes and the settings view exactly as M110 shipped them, so they are now protected like the rest
# and are named here rather than quietly dropped from the protection list.
M110_CHANGED = ['src/db.js', 'src/routes/api.js', 'src/routes/bots.js', 'public/js/views/settings.js']
M111_TOUCHES = ['src/news-window.js', 'src/bots/index.js', 'src/bots/setup.js', 'src/bots/now.js']
PROTECTED = [p for p in PRIOR['PROTECTED'] + M110_CHANGED if p not in M111_TOUCHES]
CHANGED = {'README.md', 'docs/API.md', *M111_TOUCHES}
ENGINE_UNCHANGED = PRIOR['ENGINE_UNCHANGED']
# The five assertions in the M110 cohort that measure the PRE-M111 state on purpose, as exact
# substrings of the probe output. They are the declared negatives of this milestone: each was written
# by M110 to make the fail-open visible (one of them says so in words), and none was edited here.
M110_NEGATIVES = [('engine', 'M110 does not claim to fix M111: a failed calendar still reaches this rule as a QUIET one'), ('engine', 'the engine source keeps the M111 marker at that exact branch, so closing M111 later cannot be mistaken for a regression'), ('consumers', 'the served payload has no top-level `window_min` any more'), ('consumers', 'a genuinely empty week yields a clear payload that is distinguishable from a blocked one but not from an outage'), ('consumers', 'an M111 outage reaches this consumer as silence')]


def gate(edir, suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/' + edir + '/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (edir, suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    guards = {n: read('analysis/evidence/m111/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = guards['documentation']
    assert len(current) == 146 and len(guards['parent']) == 146, (len(current), len(guards['parent']))
    assert all(len(guards[s[0]]) == 146 for s in STAGES), {s[0]: len(guards[s[0]]) for s in STAGES}
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/engine/journal/guard/gate/intention/practice/ask/news-policy source changed'
    assert all(guards['parent'][p] == current[p] for p in ENGINE_UNCHANGED), 'An unchanged entry-engine module moved'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED, 'Unexpected changed-file set'
    assert {p for p in set(current) | set(guards['consumers']) if guards['consumers'].get(p) != current.get(p)} == {'README.md', 'docs/API.md'}, 'Docs changed runtime'
    # The pre-M111 stages carry the parent's OWN files, so the staged fault is the committed
    # behaviour of the release being fixed rather than a retyped approximation.
    for stage, rel in [('policy', 'src/bots/index.js'), ('policy', 'src/bots/setup.js'), ('policy', 'src/bots/now.js'), ('engine', 'src/bots/setup.js'), ('engine', 'src/bots/now.js')]:
        assert guards[stage][rel] == guards['parent'][rel] and guards[stage][rel] != current[rel], (stage, rel)
    assert guards['policy']['src/news-window.js'] == current['src/news-window.js'], 'the policy stage must carry the delivered vocabulary'
    assert guards['engine']['src/bots/index.js'] == current['src/bots/index.js'], 'the engine stage must carry the delivered read rule'
    assert guards['policy'] == read('analysis/evidence/m111/pre-hardening-source.json'), 'the pre-hardening control tree must be the policy stage (asserted identical, never copied twice)'
    harness = read('analysis/evidence/m111/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('m111', 'feature', 154, 0, 8)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (26, 0), 'engine': (21, 0), 'consumers': (20, 0), 'api': (14, 0), 'freshness': (11, 0), 'hardening': (36, 0), 'portable': (10, 0), 'migration': (16, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m111/m111feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    # The cohort of the milestone M111 sits on, re-run on this tree. Five assertions in it measure the
    # PRE-M111 state deliberately — including one whose own words are "M111 is open and NOT solved
    # here", which exists so that closing M111 cannot be mistaken for a regression — and two of the
    # five are frozen key-set assertions whose set grew by the new `state`. Nothing was edited to make
    # a frozen assert pass; every failing line is kept in the probe text.
    m110 = gate('m110', 'feature', 253, 5, 9, 2)
    assert {r['name']: (r['expected_pass'], r['fail']) for r in m110['runs']} == {'pure': (41, 0), 'api': (40, 0), 'engine': (25, 2), 'consumers': (22, 3), 'freshness': (17, 0), 'hardening': (40, 0), 'portable': (17, 0), 'migration': (33, 0), 'ui': (23, 0)}, m110['runs']
    declared = []
    M110_E = ROOT / 'analysis/evidence/m110'
    for name, label in M110_NEGATIVES:
        text = (M110_E / ('m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt', 'why': 'M110 wrote this assertion to measure the pre-M111 state (the fail-open read, its silent all-clear on an outage and the marker that said so). M111 changes that measurement on purpose, so the assertion now fails and is retained by name rather than deleted: it is the record of the gap this milestone closed.'})
    # The cohorts of the milestones M110 sits on, re-run on this tree. Each carries the SAME declared
    # negative: a frozen migration probe that asserts its milestone added ONLY its own schema objects,
    # plus an inherited-facts comparison that covers `accounts`, which has legitimately carried M110's
    # two columns since b39d9ef.
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
        declared.append({'cohort': [x[0] for x in prior if x[1] == edir and x[2] == summary][0], 'suite': prefix + '/migration', 'pass': p, 'fail': 2, 'frozen_assertion': label, 'inherited_facts_detail': marker, 'why': name + ' says that release added ONLY its own schema objects, and the same probe compares the inherited facts of every table including `accounts`. M110 added two columns to `accounts` (and M111 adds none), so exactly two assertions fail: the whole-schema one and the inherited-facts one, which names `accounts` as the only differing table (the M105 probe prints `undefined` there — its own committed output, unchanged). The probe text, its failing labels and its nonzero exit are preserved in analysis/evidence/' + edir + '/' + prefix + '-migration.txt; its own runner assert trips on it, and nothing was edited to make it pass.'})
    # RAW / DECLARED / the live-provider arm, RE-RUN on this tree in this session: the recorded
    # numbers reproduce exactly, so the arms below are this session's runs, not an inherited claim.
    raw = gate('m108', 'raw', 596, 156, 31, 21, 1, 1); declared_run = gate('m108', 'declared', 824, 4, 31, 2); live = gate('m108', 'pure', 70, 1, 8, 6, 0, 5)
    # Parent controls: the unchanged M111 probes on the feature-absent M110 release. The vocabulary
    # itself is absent there, so every probe stops at its own tree check and reports that one measured
    # negative; the richer parent comparison is inside the migration probe, which spawns the parent's
    # own code on the same database and the same failing read.
    control_expected = {n: (0, 1) for n in ['pure', 'engine', 'consumers', 'api', 'freshness', 'hardening', 'portable', 'migration']}
    parent_controls = read('analysis/evidence/m111/parent-controls.json')
    assert set(parent_controls) == set(control_expected), (set(parent_controls), set(control_expected))
    for name, n in control_expected.items():
        assert (parent_controls[name]['pass'], parent_controls[name]['fail']) == n and parent_controls[name]['exit_code'] != 0, (name, n)
        assert counts(read('analysis/evidence/m111/parent-' + name + '-results.json')) == n, (name, n)
        assert 'the committed parent does not' in (E / ('parent-' + name + '.txt')).read_text(), name
    # Pre-hardening controls: the policy stage (vocabulary present, the committed M110 engine and its
    # two consumers still failing open), measured by the UNCHANGED probes. The staged faults are
    # asserted from the probe output, so the control cannot drift from what it claims to measure.
    pre = read('analysis/evidence/m111/pre-hardening-controls.json')
    pre_expected = {'engine': (8, 13), 'consumers': (5, 9), 'api': (1, 4), 'hardening': (1, 10)}
    for name, n in pre_expected.items():
        assert (pre[name]['pass'], pre[name]['fail']) == n and pre[name]['exit_code'] != 0, (name, n, pre[name])
        assert counts(read('analysis/evidence/m111/pre-hardening-' + name + '-results.json')) == n, (name, n)
    pre_engine = (E / 'pre-hardening-engine.txt').read_text(); pre_cons = (E / 'pre-hardening-consumers.txt').read_text(); pre_api = (E / 'pre-hardening-api.txt').read_text(); pre_hard = (E / 'pre-hardening-hardening.txt').read_text()
    assert 'FAIL the outage reaches the news check as `unknown` — NOT as a quiet calendar' in pre_engine, 'the pre-hardening control must be the fail-open read'
    assert 'FAIL and the reason travels with it, so a caller never has to say "unknown" without saying why' in pre_engine and 'FAIL the payload carries the module\'s own sentence rather than a second wording invented here' in pre_engine
    assert 'FAIL the news row FAILS on an unread calendar — the absence of evidence is not scored as evidence of absence' in pre_cons, 'the pre-hardening control must be the row that passes an outage'
    assert 'FAIL the desk playlist SAYS the calendar could not be read, in the engine\'s own sentence, instead of staying silent' in pre_cons
    assert 'FAIL an unreadable calendar answers 200 with an `unknown` state — not a 500, not an empty 200 that reads like a quiet week' in pre_api
    assert 'FAIL a calendar failure shaped as a bare empty object is `unknown` with a usable reason and the honest sentence' in pre_hard and 'FAIL a calendar failure shaped as a thrown string is `unknown` with a usable reason and the honest sentence' in pre_hard
    delivered_engine = (E / 'm111feature-engine.txt').read_text(); delivered_cons = (E / 'm111feature-consumers.txt').read_text(); delivered_api = (E / 'm111feature-api.txt').read_text(); delivered_hard = (E / 'm111feature-hardening.txt').read_text()
    assert 'ok the outage reaches the news check as `unknown` — NOT as a quiet calendar' in delivered_engine and 'ok the payload carries the module\'s own sentence rather than a second wording invented here' in delivered_engine, 'the delivered tree must make the outage unknown and say so'
    assert 'ok the news row FAILS on an unread calendar — the absence of evidence is not scored as evidence of absence' in delivered_cons and 'ok the desk playlist SAYS the calendar could not be read, in the engine\'s own sentence, instead of staying silent' in delivered_cons
    assert 'ok an unreadable calendar answers 200 with an `unknown` state — not a 500, not an empty 200 that reads like a quiet week' in delivered_api
    assert 'ok a calendar failure shaped as a bare empty object is `unknown` with a usable reason and the honest sentence' in delivered_hard
    parents = read('analysis/evidence/m111/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values())
    assert [v['files'] for v in parents['parents'].values()] == [146, 145, 143, 141, 139, 137, 135, 133, 131, 129, 127, 125, 123, 121, 119, 117, 114, 110, 112, 112], [v['files'] for v in parents['parents'].values()]
    # The native API/bots arms are INHERITED from the committed M108 record and NOT re-run: they drive
    # providers this sandbox cannot reach, and the recorded values are asserted as inherited facts,
    # never re-measured here and never presented as this session's run.
    native = read('analysis/evidence/m108/native-runs.json'); assert len(native) == 4
    for r in native:
        text = (ROOT / 'analysis/evidence/m108' / r['output']).read_text(); expected_row = (None, None, 2) if r['suite'] == 'api' else (198, 8, 1)
        assert (r['pass'], r['fail'], r['exit_code']) == expected_row, (r, expected_row)
        if r['suite'] == 'bots':
            assert r['parity_mismatches'] == 0 and r['parity_fills'] == 15 and 'filled sample for parity:' in text, r
    parent_api = next(r for r in native if r['arm'] == 'parent' and r['suite'] == 'api'); raw_api = next(r for r in native if r['arm'] == 'raw' and r['suite'] == 'api')
    parent_bots = next(r for r in native if r['arm'] == 'parent' and r['suite'] == 'bots'); raw_bots = next(r for r in native if r['arm'] == 'raw' and r['suite'] == 'bots')
    assert (parent_api['exit_code'], raw_api['exit_code']) == (2, 2) and (parent_bots['pass'], parent_bots['fail']) == (raw_bots['pass'], raw_bots['fail']), 'the parent and the delivered tree must answer identically'
    smoke = read('analysis/evidence/m111/smoke-exit.json'); text = (E / 'smoke.txt').read_text(); control_text = (E / 'smoke-parent-control.txt').read_text()
    assert smoke['exit_code'] == 0 and 'RESULT: 22/22 views OK, 0 UI-style failures, 0 console errors' in text, smoke
    assert smoke['parent_control']['views_passed'] == 22 and 'RESULT: 22/22 views OK, 0 UI-style failures, 0 console errors' in control_text, 'the unchanged parent must offer the same view count at the same sample'
    # The smoke harness does not open the account dialog at all, so the claim is asserted rather than
    # implied, and M111 ships no dialog of its own: it changes no view at all.
    for probe_text, label in ((text, 'delivered'), (control_text, 'parent control')):
        assert not any('news' in l.lower() for l in probe_text.splitlines()), ('the smoke run must not be claimed as news-dialog coverage', label)
    assert smoke['news_dialog_coverage'].startswith("grep -ci 'news' = 0")
    assert not any(p.startswith('public/') for p in CHANGED), 'M111 changes no view, so the smoke evidence holds both arms'
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']), 'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'], 'todo_ids': [k for k, v in rows.items() if v['status'] == 'todo']}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 106, 2, 24, 0, 8]
    assert ledger['partial_ids'] == ['M30', 'M103'] and rows['M111']['status'] == 'done' and all(rows[k]['status'] == 'done' for k in ['M107', 'M108', 'M109', 'M110']) and rows['M112']['status'] == 'todo'
    scope = read('analysis/evidence/m111/SCOPE.json')
    assert scope['parent'] == BASE and scope['ledger_before'] == [132, 105, 2, 25, 0, 8] and scope['ledger_after'] == [ledger['total'], ledger['done'], ledger['partial'], ledger['todo'], ledger['no_action'], ledger['partition_groups']]
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m111-delivery-') as td:
        work = Path(td); parent = work / 'parent'; parent.mkdir()
        with tarfile.open(fileobj=io.BytesIO(run(['git', 'archive', BASE, 'extracted/tradejournal']))) as t:
            for ent in t:
                if ent.isfile():
                    rel = PurePosixPath(ent.name).relative_to('extracted/tradejournal'); assert allowed(rel) or str(rel).startswith('scripts/fixtures/'); write(parent, str(rel), t.extractfile(ent).read())
        assert manifest(parent) == guards['parent']
        before = parent; stages = []
        for name, patch_name in STAGES:
            after = work / name; shutil.copytree(before, after)
            for rel in FILES_FOR(name):
                # The pre-M111 files are taken from the parent's OWN tree, so each staged fault is the
                # committed behaviour of the release being fixed rather than a retyped approximation.
                data = (parent / rel).read_bytes() if rel in PRE_M111_FILES.get(name, []) else (APP / rel).read_bytes()
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
        info = {'base_commit': BASE, 'parent': 'Actual M110 Git release tree (146 files) as the M111 parent; the inherited M110 parent (the actual c09574e M109 release), the M109 parent and every older parent rebuilt by saved reverse patches and asserted against the frozen proofs. M111 upgrades the parent database in place WITHOUT adding or changing a single schema object: the same failing read answers `unknown` on the delivered tree where the parent answered with a quiet payload that had no state at all.', 'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger, 'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']}, 'prior_cohorts_rerun': {c: {'pass': n[0], 'fail': n[1], 'probes': n[2], 'completed_nonzero': n[3], 'evidence': 'analysis/evidence/' + edir + '/' + summary + '-summary.json'} for c, edir, summary, prefix, n in [('m110feature', 'm110', 'feature', 'm110feature', (253, 5, 9, 2))] + prior}, 'inherited_arms_rerun_this_session': {'note': 'RAW, DECLARED and the live-provider arm were re-run on this tree in this session through analysis/run-m111-verification.py and reproduce the committed records exactly, so they are this session\u2019s measurements rather than an inherited claim.', 'raw': {k: raw[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero', 'timeout_no_exit', 'summaryless']}, 'declared': {k: declared_run[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero']}, 'live_provider_attempts': {k: live[k] for k in ['pass', 'fail', 'completed_nonzero', 'summaryless']}}, 'native_arms_inherited_not_rerun': {'note': 'The native API/bots provider arms need a market provider this sandbox cannot reach; the committed M108 record stands and is asserted as an inherited fact. M111 changes no provider call, no route shape and no schema.', 'native': native}, 'declared_negatives': declared, 'regression_parents': parents, 'controls': {'parent': {k: (v[0], v[1]) for k, v in control_expected.items()}, 'pre_hardening': {'compare': 'the policy stage IS the pre-hardening runtime (the delivered vocabulary with the committed M110 engine and its two consumers, no docs), asserted identical to pre-hardening-source.json', 'probes': {k: {'pass': v['pass'], 'fail': v['fail']} for k, v in pre.items()}, 'faults': ['the read rule is the M110 test, so a failed calendar still reaches the rule as a quiet one: null blackout, an empty event list and no `state`/`unavailable` anywhere', 'setup.js therefore still scores `No high-impact news in the window` as SATISFIED during an outage, and the desk playlist stays silent', 'the route therefore answers an unreadable calendar with the same 200 an empty week produces', 'the ten hostile failure shapes are not classified at all because there is nothing to classify them into'], 'why': 'On the pre-hardening runtime the unchanged probes measured engine 8/13, consumers 5/9, api 1/4 and hardening 1/10, and every failing line names the fail-open rather than a crash; the engine stage makes them 21/0, the consumer stage 20/0 and the delivered tree 14/0 and 36/0. The staged fault IS the parent\u2019s own committed file, so the control measures the release being fixed rather than an approximation of it.', 'parent_migration_measured_inside_the_delivered_probe': 'The migration probe spawns the parent\u2019s OWN code on the same database and the same failing read: the parent answers with a quiet payload (blackout null, empty events, no state, no unavailable, no note, no error) while the delivered tree answers `unknown` with the reason and the sentence. Nothing about the parent\u2019s behaviour is asserted from memory.'}}, 'smoke': {**{k: v for k, v in smoke.items() if k != 'parent_control'}, 'parent_control_views': 22, 'covers_a_dialog': False, 'field_coverage': ['analysis/probe-m110-ui.js 23/0 (M111 changes no view)']}, 'calendar_unknown': {'version': 'news-window-v1 (M111 adds the state vocabulary to it)', 'states': ['blocked', 'clear', 'unknown'], 'unknown_is_not_clear': True, 'clear_requires': ['read.ok === true', 'Array.isArray(read.events)'], 'precedence': 'a known blackout wins even when a read also failed; otherwise a non-empty `unavailable` is `unknown`; otherwise `clear` (values, not key presence)', 'payload_added': ['state', 'unavailable', 'unavailable_note', 'windows.unavailable'], 'payload_kept': ['error (so a pre-M111 consumer is not blinded)'], 'note_contains_window_numbers': False, 'stored': False, 'writes': 0, 'new_columns': 0, 'new_tables': 0, 'caller_tokens': ['blocked', 'clear', 'unknown', 'not_consulted'], 'consumers': {'setup.js': 'the news row fails on `unknown` (same weight and label, no veto) and exposes filters.news_state', 'now.js': 'a warn guard carrying the module sentence', 'index.js': 'the read rule, the headline prefix and checks.news === false'}, 'accepted_property': 'getCalendar() does not cache failures, so consecutive checks during an outage re-fetch and an `unknown` verdict may flap back to `clear` when the feed returns; measured in analysis/probe-m111-freshness.js rather than hidden.'}, 'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative), 'fixed_zip': {'source_files': 146, 'application_byte_differences': 0, 'private_env_db_dependency_files': 0}, 'engine_files_unchanged': ENGINE_UNCHANGED, 'newly_protected_from_m110': M110_CHANGED, 'm111_touches_inside_the_protected_set': M111_TOUCHES, 'other_protected_files': [p for p in PROTECTED if p not in ENGINE_UNCHANGED], 'harness_source_files': len(harness), 'package_lock_sha256': sha((APP / 'package-lock.json').read_bytes()), 'scope': 'M111 the calendar fail-open: an unreadable calendar is UNKNOWN, not clear. Three states owned by `src/news-window.js` (blocked/clear/unknown) with `clear` earned by a positive signal only, the engine\u2019s read rule requiring `ok:true` and an events list, the setup row failing on `unknown` with the module\u2019s own sentence at the SAME weight and label and with NO veto, a warn guard on the desk playlist, `NEWS UNKNOWN: …` in the headline, `filters.news_state` beside `filters.news_blackout`, and `not_consulted` kept explicitly separate for callers that read no calendar. Nothing else moved: no window number, no weight, no grade, no clock, no sample floor, no fill padding, no target and no risk setting; no column, table, key or write was added and every table is byte-identical across a clear, an unknown and a blocked read. M112 (a trading window derived from by_session history) stays TODO. No 70%/causal/predictive/broker/provider/human/mental-state/pixel/production proof, and no claim about what a release does to price.'}
        (P / 'M111-CALENDAR-UNKNOWN-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
        companion = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'source_files': 146, 'excluded_from_zip_to_avoid_self_hash': True}
        (E / 'archive-sha256.json').write_text(json.dumps(companion, indent=2) + '\n')
        print('Four constructed runtime stages + docs + actual M110 parent + pristine: forward/reverse 0 byte differences.')
        print('Exact132/106/2/24; M111 154/0, the M110 cohort carries this milestone\u2019s five declared negatives, RAW/DECLARED re-run identical.')
        print(json.dumps(companion, indent=2))


# The files each stage writes, and which of them are the parent's own (i.e. still pre-M111).
FILES_FOR = lambda stage: {'policy': ['src/news-window.js', 'src/bots/index.js', 'src/bots/setup.js', 'src/bots/now.js'], 'engine': ['src/bots/index.js', 'src/bots/setup.js', 'src/bots/now.js'], 'consumers': ['src/bots/setup.js', 'src/bots/now.js'], 'documentation': ['README.md', 'docs/API.md']}[stage]
PRE_M111_FILES = {'policy': ['src/bots/index.js', 'src/bots/setup.js', 'src/bots/now.js'], 'engine': ['src/bots/setup.js', 'src/bots/now.js']}


if __name__ == '__main__':
    main()
