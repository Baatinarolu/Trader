#!/usr/bin/env python3
"""M109 deterministic delivery: four constructed runtime stages, docs, the actual M108
release as the measured parent and the pristine cumulative diff.

Every stage tree is re-derived from the saved patches and must match its frozen
`<stage>-source.json` byte-for-byte in both directions; the delivered tree is then
stacked onto the pristine `tradingpro-main.zip` to produce `tradingpro-fixed.zip` with an
SHA companion computed outside the archive. Counts, negative scopes and the ledger are
asserted here so the delivery cannot drift from the evidence.

    python3 analysis/capture-m109-stages.py           # stage trees + guards + controls
    python3 analysis/build-m109-ask-artifacts.py --capture-stages
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m109'; P = ROOT / 'analysis/patches'
BASE = '14ac041e4149948d6526acc8794c6430283e7643'
STAGES = [('policy', 'm109-ask-policy-and-owned-module.patch'), ('api', 'm109-ask-api-routes.patch'), ('hardening', 'm109-ask-read-hardening.patch'), ('ui', 'm109-ask-card-and-wiring.patch'), ('documentation', 'm109-ask-documentation.patch')]
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts', 'make_patch', 'contents', 'allowed', 'add_zip']]
CORE = H['CORE']
# Everything M100-M108 protected, plus the M108 practice layer itself: M109 touches neither,
# so `src/practice.js` and `public/js/views/practice.js` are now protected like the rest.
PROTECTED = CORE + ['src/instruments.js', 'src/trades.js', 'src/journaling.js', 'src/execution-review.js', 'src/routine.js', 'src/routine-records.js', 'src/confluences.js', 'src/screenshots.js', 'src/emotions.js', 'src/performance.js', 'src/coach.js', 'src/process-outcomes.js', 'src/behavior-days.js', 'src/opportunities.js', 'src/rule-changes.js', 'src/identity.js', 'src/period-reviews.js', 'src/candles.js', 'src/market.js', 'src/session-time.js', 'src/demo-data.js', 'src/bots/guardrails.js', 'src/bots/correction.js', 'src/bots/now.js', 'src/state-gate.js', 'src/intention.js', 'src/practice.js', 'src/db.js', 'server.js', 'public/js/app.js', 'public/js/util.js', 'public/js/store.js', 'public/js/api.js', 'public/js/chart.js', 'public/js/views/emotions.js', 'public/js/views/process-outcomes.js', 'public/js/views/behavior-days.js', 'public/js/views/opportunities.js', 'public/js/views/rule-changes.js', 'public/js/views/bots.js', 'public/js/views/coach.js', 'public/js/views/analytics.js', 'public/js/views/identity.js', 'public/js/views/state-gate.js', 'public/js/views/intention.js', 'public/js/views/practice.js', 'public/js/views/journal.js', 'public/js/views/settings.js', 'public/js/views/trades.js', 'public/js/views/playbook.js', 'public/js/views/routine.js', 'public/js/views/calendar.js', 'public/js/views/confluences.js', 'public/js/views/execution.js', 'public/js/views/market.js', 'public/js/views/period-reviews.js', 'public/js/views/risk.js', 'public/js/views/screenshots.js', 'package-lock.json', 'scripts/api-test.js', 'scripts/bots-test.js', 'scripts/smoke-test.js', 'scripts/test-cleanup.js']
CHANGED = {'README.md', 'docs/API.md', 'src/ask.js', 'src/routes/api.js', 'public/index.html', 'public/js/views/ask.js', 'public/js/views/dashboard.js'}


def gate(edir, suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/' + edir + '/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (edir, suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    guards = {n: read('analysis/evidence/m109/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = guards['documentation']
    assert len(current) == 145 and len(guards['parent']) == 143
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/engine/journal/guard/gate/intention/practice source changed'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED, 'Unexpected changed-file set'
    assert {p for p in set(current) | set(guards['ui']) if guards['ui'].get(p) != current.get(p)} == {'README.md', 'docs/API.md'}, 'Docs changed runtime'
    assert guards['api'] == read('analysis/evidence/m109/pre-hardening-source.json'), 'the pre-hardening control tree must be the api stage (asserted identical, never copied twice)'
    harness = read('analysis/evidence/m109/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('m109', 'feature', 168, 0, 9)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (31, 0), 'api': (17, 0), 'consumers': (18, 0), 'freshness': (11, 0), 'hardening': (17, 0), 'portable': (16, 0), 'migration': (15, 0), 'ui': (27, 0), 'archive-ui': (16, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m109/m109feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    # The four cohorts re-run unchanged on this tree. The M108 cohort is the M108 runner's own
    # `feature` suite (evidence/m108/feature-*), which is the alias `--suite m108feature`
    # resolves to in run-m109-verification.py.
    prior = {'feature': (259, 0, 9, 0), 'm107feature': (231, 1, 9, 1), 'm106feature': (317, 1, 10, 1), 'm105feature': (141, 1, 10, 1)}
    for suite, (p, f, n, nz) in prior.items():
        gate('m108', suite, p, f, n, nz)
    raw = gate('m108', 'raw', 596, 156, 31, 21, 1, 1); declared = gate('m108', 'declared', 824, 4, 31, 2); live = gate('m108', 'pure', 70, 1, 8, 6, 0, 5)
    # Three declared, milestone-scoped negatives, each inherited EXACTLY as the M108 record left
    # it: every frozen whole-schema migration assertion sees the additive objects of the
    # milestones that followed it. M109 adds no schema object at all, so these three are
    # identical to the M108 record and the M109 migration probe is their successor assertion.
    negative = next(r for r in read('analysis/evidence/m108/m107feature-runs.json') if r['name'] == 'migration')
    negative_detail = (ROOT / 'analysis/evidence/m108/m107feature-migration.txt').read_text()
    assert counts(read('analysis/evidence/m108/m107feature-migration-results.json')) == (17, 1) and negative['expected_fail'] == 1, negative
    assert 'ONLY the intention table' in negative_detail and 'practice_sessions' in negative_detail, 'frozen M107 schema assertion is not the declared negative'
    negative106 = next(r for r in read('analysis/evidence/m108/m106feature-runs.json') if r['name'] == 'migration')
    negative106_detail = (ROOT / 'analysis/evidence/m108/m106feature-migration.txt').read_text()
    assert counts(read('analysis/evidence/m108/m106feature-migration-results.json')) == (17, 1) and negative106['expected_fail'] == 1, negative106
    assert 'ONLY state-gate table' in negative106_detail and 'practice_sessions' in negative106_detail, 'frozen M106 schema assertion is not the declared negative'
    negative105 = next(r for r in read('analysis/evidence/m108/m105feature-runs.json') if r['name'] == 'migration')
    assert counts(read('analysis/evidence/m108/m105feature-migration-results.json')) == (12, 1) and negative105['expected_fail'] == 1, negative105
    assert 'ONLY identitytable' in (ROOT / 'analysis/evidence/m108/m105feature-migration.txt').read_text(), 'frozen M105 schema assertion is not the declared negative'
    # Parent controls: the unchanged M109 probes on the feature-absent M108 release. Every
    # assertion that needs the channel is a measured negative there.
    control_expected = {'api': (1, 3), 'consumers': (1, 1), 'freshness': (0, 2), 'portable': (5, 1), 'migration': (6, 2), 'ui': (0, 1), 'archive-ui': (0, 1)}
    parent_controls = read('analysis/evidence/m109/parent-controls.json')
    assert set(parent_controls) == set(control_expected), (set(parent_controls), set(control_expected))
    for name, n in control_expected.items():
        assert (parent_controls[name]['pass'], parent_controls[name]['fail']) == n and parent_controls[name]['exit_code'] != 0, (name, n)
        assert counts(read('analysis/evidence/m109/parent-' + name + '-results.json')) == n, (name, n)
    # Pre-hardening controls: the api stage itself, measured by the UNCHANGED probes. The three
    # staged faults are asserted from the probe output, so the control cannot drift from what it
    # claims to measure.
    pre = read('analysis/evidence/m109/pre-hardening-controls.json')
    assert (pre['hardening']['pass'], pre['hardening']['fail']) == (14, 3) and (pre['pure']['pass'], pre['pure']['fail']) == (28, 3), pre
    assert (pre['hardening']['exit_code'], pre['pure']['exit_code']) == (1, 1)
    hardening_text = (E / 'pre-hardening-hardening.txt').read_text()
    pure_text = (E / 'pre-hardening-pure.txt').read_text()
    assert 'a retained-stop payload the app cannot parse is reported unavailable with its reason, not as "no stops"' in hardening_text, 'the pre-hardening control must be the unparseable retained-stop fault'
    assert 'a practice row with an unreadable measured time is reported and excluded from both the count and the seconds' in hardening_text, 'the pre-hardening control must be the unreadable-practice-row fault'
    assert 'leaves every table byte-identical' in pure_text and 'practice_timers' in pure_text, 'the pre-hardening control must be the lazy timer write'
    delivered_pure = (E / 'm109feature-pure.txt').read_text(); delivered_hardening = (E / 'm109feature-hardening.txt').read_text()
    assert 'ok a full battery of asks' in delivered_pure and 'does not create the lazy practice timer row' in delivered_pure and 'practice_timers' not in delivered_pure, 'the delivered tree must not create the lazy timer row'
    assert 'not as "no stops"' in delivered_hardening and 'unreadable measured time' in delivered_hardening, 'the delivered tree must report both unreadable facts'
    parents = read('analysis/evidence/m109/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values())
    assert [v['files'] for v in parents['parents'].values()] == [143, 141, 139, 137, 135, 133, 131, 129, 127, 125, 123, 121, 119, 117, 114, 110, 112, 112], [v['files'] for v in parents['parents'].values()]
    # The native API/bots arms are INHERITED from the M108 record and not re-run: M109 adds no
    # route they touch and no schema object. The recorded values are asserted as inherited
    # facts, never re-measured here and never presented as this session's run.
    native = read('analysis/evidence/m108/native-runs.json'); assert len(native) == 4
    for r in native:
        text = (ROOT / 'analysis/evidence/m108' / r['output']).read_text(); expected_row = (None, None, 2) if r['suite'] == 'api' else (198, 8, 1)
        assert (r['pass'], r['fail'], r['exit_code']) == expected_row, (r, expected_row)
        if r['suite'] == 'bots':
            assert r['parity_mismatches'] == 0 and r['parity_fills'] == 15 and 'filled sample for parity:' in text, r
    parent_api = next(r for r in native if r['arm'] == 'parent' and r['suite'] == 'api'); raw_api = next(r for r in native if r['arm'] == 'raw' and r['suite'] == 'api')
    parent_bots = next(r for r in native if r['arm'] == 'parent' and r['suite'] == 'bots'); raw_bots = next(r for r in native if r['arm'] == 'raw' and r['suite'] == 'bots')
    assert (parent_api['exit_code'], raw_api['exit_code']) == (2, 2) and (parent_bots['pass'], parent_bots['fail']) == (raw_bots['pass'], raw_bots['fail']), 'the parent and the delivered tree must answer identically'
    smoke = read('analysis/evidence/m109/smoke-exit.json'); text = (E / 'smoke.txt').read_text()
    control_text = (E / 'smoke-parent-control.txt').read_text()
    assert smoke['exit_code'] == 0 and 'RESULT: 21/21 views OK, 0 UI-style failures, 0 console errors' in text and 'canvas limitation encountered 8' in text
    assert smoke['parent_control']['views_passed'] == 21 and 'RESULT: 21/21 views OK' in control_text, 'the unchanged parent must offer the same conditional view count at the same sample'
    # The smoke harness offers its view list conditionally, so the total moves between samples
    # (21 here and at this parent, 22 in the M108 record); both trees are measured at the same
    # sample. It does not exercise the advisory card at all, so the claim is asserted rather
    # than implied, and the card's coverage is the two real-DOM probes.
    for probe_text, label in ((text, 'delivered'), (control_text, 'parent control')):
        lines = probe_text.splitlines()
        assert not any('ask' in l.lower() for l in lines) and not any('practice' in l.lower() for l in lines), ('the smoke run must not be claimed as advisory-card coverage', label)
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']), 'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'], 'todo_ids': [k for k, v in rows.items() if v['status'] == 'todo']}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 103, 2, 27, 0, 8]
    assert ledger['partial_ids'] == ['M30', 'M103'] and rows['M109']['status'] == 'done' and rows['M108']['status'] == 'done' and rows['M107']['status'] == 'done' and all(rows[k]['status'] == 'todo' for k in ['M110', 'M111', 'M112'])
    scope = read('analysis/evidence/m109/SCOPE.json')
    assert scope['parent'] == BASE and scope['ledger_before'] == [132, 102, 2, 28, 0, 8] and scope['ledger_after'] == [ledger['total'], ledger['done'], ledger['partial'], ledger['todo'], ledger['no_action'], ledger['partition_groups']]
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m109-delivery-') as td:
        work = Path(td); parent = work / 'parent'; parent.mkdir()
        with tarfile.open(fileobj=io.BytesIO(run(['git', 'archive', BASE, 'extracted/tradejournal']))) as t:
            for ent in t:
                if ent.isfile():
                    rel = PurePosixPath(ent.name).relative_to('extracted/tradejournal'); assert allowed(rel) or str(rel).startswith('scripts/fixtures/'); write(parent, str(rel), t.extractfile(ent).read())
        assert manifest(parent) == guards['parent']
        before = parent; stages = []
        for name, patch_name in STAGES:
            after = work / name; after.mkdir()
            if a.capture_stages or name == 'documentation':
                source = APP if name == 'documentation' else Path('/tmp/m109-' + name + '-stage/app')
                for p, h in guards[name].items():
                    b = (source / p).read_bytes(); assert sha(b) == h, (name, p); write(after, p, b)
                make_patch(before, after, P / patch_name)
            else:
                shutil.rmtree(after); shutil.copytree(before, after); run(['git', 'apply', '--check', str(P / patch_name)], after); run(['git', 'apply', str(P / patch_name)], after)
            assert manifest(after) == guards[name], name
            replay(before, after, P / patch_name, work)
            stages.append({'stage': name, 'source_manifest': name + '-source.json', 'source_files': len(guards[name]), 'patch': patch_name, **metadata(P / patch_name)})
            before = after
        final = before; combined = P / 'm109-ask-complete.patch'; make_patch(parent, final, combined); replay(parent, final, combined, work)
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
        info = {'base_commit': BASE, 'parent': 'Actual M108 Git release tree (143 files) as the M109 parent; the inherited M108 parent (the 8a2cfd5 M107 release tree), the M107 parent, the M106 parent and every older parent rebuilt by saved reverse patches and asserted against the frozen proofs. M109 adds no schema object of any kind, so the parent and the delivered tree answer identically on the same database.', 'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger, 'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']}, 'prior_cohorts_rerun': {s: {'pass': p, 'fail': f, 'probes': n, 'completed_nonzero': z} for s, (p, f, n, z) in prior.items()}, 'inherited_arms_not_rerun': {'note': 'RAW, DECLARED, the live-provider arm and the native API/bots arms are inherited from the committed M108 record and were NOT re-run for M109: M109 adds no route they touch and no schema object, and the record stands as committed.', 'raw': {k: raw[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero', 'timeout_no_exit', 'summaryless']}, 'declared': {k: declared[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero']}, 'live_provider_attempts': {k: live[k] for k in ['pass', 'fail', 'completed_nonzero', 'summaryless']}, 'native': native}, 'declared_negatives': [{'suite': 'm107feature/migration', 'pass': 17, 'fail': 1, 'why': 'The frozen M107 migration probe asserts the M107-only schema delta (four daily_intentions objects); the later milestones add their own objects, so that single whole-schema assertion is a declared, milestone-scoped negative. M109 adds nothing, so it is exactly the M108-recorded one, retained unchanged.'}, {'suite': 'm106feature/migration', 'pass': 17, 'fail': 1, 'why': 'The frozen M106 migration probe asserts the M106-only schema delta and sees the additive M107/M108 objects; retained at exactly one failing assertion, exactly as the M108 record left it.'}, {'suite': 'm105feature/migration', 'pass': 12, 'fail': 1, 'why': 'The frozen M105 migration probe asserts the M105-only schema delta and also fails on the additive M106/M107/M108 objects; retained at exactly one failing assertion, exactly as the M108 record left it.'}], 'regression_parents': parents, 'controls': {'parent': control_expected, 'pre_hardening': {'compare': 'the api stage IS the pre-hardening runtime (loose policy + schema + routes, no view), asserted identical to pre-hardening-source.json', 'probes': {k: {'pass': v['pass'], 'fail': v['fail']} for k, v in pre.items()}, 'faults': ['the module read the practice facts through M108\'s own reader, which creates its lazy practice_timers row', 'a stored practice row whose measured time could not be read back was counted as a recorded session', 'an unparseable retained-stop payload was reported as "no stops"'], 'why': 'On the pre-hardening runtime the unchanged probes measured 14/3 (hardening) and 28/3 (pure); the hardening stage made all three honest and the same probes are 17/0 and 31/0 on the delivered tree.'}}, 'smoke': {**{k: v for k, v in smoke.items() if k != 'parent_control'}, 'parent_control_views': 21, 'covers_the_advisory_card': False, 'card_coverage': ['analysis/probe-m109-ui.js 27/0', 'analysis/probe-m109-archive-ui.js 16/0']}, 'actual_parent_no_schema_delta': {'pass': 15, 'fail': 0, 'parent_control': [6, 2], 'new_schema_objects': 0, 'inherited_facts_byte_differences': 0, 'why': 'The migration probe compares the parent\'s own sqlite_master objects with the upgraded tree\'s, table by table and index/trigger by index/trigger, on the same database the parent wrote; every inherited fact is compared byte-for-byte and any ask is checked not to add the lazy practice_timers row.'}, 'advisory_channel': {'version': 'ask-v1', 'llm': False, 'model': None, 'network': False, 'api_key_required': False, 'deterministic': 'same stored state + same question -> same answer', 'reads_only': True, 'writes': 0, 'new_data': False, 'authority': 'none', 'topics': ['entry_state', 'risk_state', 'my_patterns', 'performance_facts', 'discipline_records', 'rules_i_set', 'calendar_state'], 'refusal_codes': ['ask_refused_permission', 'ask_refused_prediction', 'ask_refused_outcome_target', 'ask_refused_mental_state', 'ask_refused_other_person', 'ask_refused_override'], 'non_answer_code': 'no_matching_topic', 'max_question_chars': 280, 'calendar_surface': 'answers unavailable on every day: no fetch, no cache, and "I could not look" is never turned into "no high-impact news"', 'required_in_files': 1, 'answer_fields': ['kind', 'source'], 'kinds': ['fact', 'record', 'unavailable', 'note']}, 'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative), 'fixed_zip': {'source_files': 145, 'application_byte_differences': 0, 'private_env_db_dependency_files': 0}, 'engine_files_unchanged': CORE, 'other_protected_files': [p for p in PROTECTED if p not in CORE], 'harness_source_files': len(harness), 'package_lock_sha256': sha((APP / 'package-lock.json').read_bytes()), 'scope': 'M109 the advisory channel: a deterministic, read-only question channel over findings the app already computed (coach insights, the guardrail/cap state, the trader own records). No model, no key, no network call, no new data, no prediction, no permission, no override, no transcript; refusals are successful answers and unknown stays unknown. It is required in exactly one file (its route), it writes nothing at all (a full battery leaves every table byte-identical and does not create M108 lazy practice_timers row), it adds no schema object and no backup key, and it cannot permit, block, size, grade or change anything. M64/M106/M107/M108 stay separate mechanisms. M30/M103 partial; M110/M111/M112 TODO. No70%/causal/predictive/profiler/broker/provider/human/mental-state/pixel/production proof, and no predictor of any kind.'}
        (P / 'M109-ASK-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
        companion = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'source_files': 145, 'excluded_from_zip_to_avoid_self_hash': True}
        (E / 'archive-sha256.json').write_text(json.dumps(companion, indent=2) + '\n')
        print('Four constructed runtime stages + docs + actual M108 parent + pristine: forward/reverse 0 byte differences.')
        print('Exact132/103/2/27; M109 168/0, prior cohorts re-run unchanged, inherited arms and negatives retained separately.')
        print(json.dumps(companion, indent=2))


if __name__ == '__main__':
    main()
