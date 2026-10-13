#!/usr/bin/env python3
"""M106 deterministic delivery: six constructed runtime stages, docs, actual M105
release as the measured parent and the pristine cumulative diff.

Every stage tree is re-derived from the saved patches and must match its frozen
`<stage>-source.json` byte-for-byte in both directions; the delivered tree is then
stacked onto the pristine `tradingpro-main.zip` to produce `tradingpro-fixed.zip`
with an SHA companion computed outside the archive. Counts, negative scopes and the
ledger are asserted here so the delivery cannot drift from the evidence.

    python3 analysis/capture-m106-stages.py          # stage trees + guards + controls
    python3 analysis/build-m106-state-gate-artifacts.py --capture-stages
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m106'; P = ROOT / 'analysis/patches'
BASE = '6f0783c34f5f3c30f02efbf1043dbf3065d91339'
STAGES = [('policy', 'm106-answer-policy-and-owned-schema.patch'), ('api', 'm106-owned-answer-api-and-live-entry-gate.patch'), ('strict', 'm106-refusal-codes-and-signal-admission.patch'), ('desk', 'm106-desk-resolution-and-research-isolation.patch'), ('ui', 'm106-four-question-card-editor-day-surfaces.patch'), ('documentation', 'm106-state-gate-documentation.patch')]
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts', 'make_patch', 'contents', 'allowed', 'add_zip']]
CORE = H['CORE']
PROTECTED = CORE + ['src/instruments.js', 'src/trades.js', 'src/journaling.js', 'src/execution-review.js', 'src/routine.js', 'src/routine-records.js', 'src/confluences.js', 'src/screenshots.js', 'src/emotions.js', 'src/performance.js', 'src/coach.js', 'src/process-outcomes.js', 'src/behavior-days.js', 'src/opportunities.js', 'src/rule-changes.js', 'src/identity.js', 'src/period-reviews.js', 'src/candles.js', 'src/market.js', 'src/session-time.js', 'src/demo-data.js', 'src/bots/guardrails.js', 'src/bots/correction.js', 'src/bots/now.js', 'server.js', 'public/js/app.js', 'public/js/util.js', 'public/js/store.js', 'public/js/api.js', 'public/js/chart.js', 'public/js/views/emotions.js', 'public/js/views/process-outcomes.js', 'public/js/views/behavior-days.js', 'public/js/views/opportunities.js', 'public/js/views/rule-changes.js', 'public/js/views/bots.js', 'public/js/views/coach.js', 'public/js/views/analytics.js', 'public/js/views/identity.js', 'public/js/views/trades.js', 'public/js/views/playbook.js', 'public/js/views/routine.js', 'public/js/views/calendar.js', 'public/js/views/confluences.js', 'public/js/views/execution.js', 'public/js/views/market.js', 'public/js/views/period-reviews.js', 'public/js/views/risk.js', 'public/js/views/screenshots.js', 'package-lock.json', 'scripts/api-test.js', 'scripts/bots-test.js', 'scripts/smoke-test.js', 'scripts/test-cleanup.js']
CHANGED = {'README.md', 'docs/API.md', 'docs/GUARDRAILS.md', 'src/db.js', 'src/routes/api.js', 'src/routes/bots.js', 'src/bots/index.js', 'public/index.html', 'public/js/views/dashboard.js', 'public/js/views/journal.js', 'public/js/views/settings.js', 'src/state-gate.js', 'public/js/views/state-gate.js'}


def gate(suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/m106/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    guards = {n: read('analysis/evidence/m106/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = guards['documentation']
    assert len(current) == 139 and len(guards['parent']) == 137
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/engine/journal/guard/native source changed'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED, 'Unexpected changed-file set'
    assert {p for p in set(current) | set(guards['ui']) if guards['ui'].get(p) != current.get(p)} == {'README.md', 'docs/API.md', 'docs/GUARDRAILS.md'}, 'Docs changed runtime'
    harness = read('analysis/evidence/m106/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('feature', 318, 0, 10)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m106/feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    prior = {'m105feature': (141, 1, 10), 'screenshots': (223, 3, 9), 'confluences': (160, 0, 8), 'emotions': (170, 0, 13), 'process': (106, 2, 6), 'behavior': (113, 2, 7), 'reviews': (159, 1, 9), 'opportunities': (144, 1, 10), 'changes': (152, 1, 11), 'execution': (260, 0, 9), 'routine': (321, 0, 10), 'offline': (178, 0, 4), 'market': (325, 0, 4)}
    for suite, (p, f, n) in prior.items():
        gate(suite, p, f, n, 1 if suite in ('screenshots', 'process', 'behavior', 'reviews', 'opportunities', 'changes', 'm105feature') else 0)
    raw = gate('raw', 596, 156, 31, 21, 1, 1); declared = gate('declared', 824, 4, 31, 2); live = gate('pure', 70, 1, 8, 6, 0, 5)
    negative = next(r for r in read('analysis/evidence/m106/m105feature-runs.json') if r['name'] == 'migration')
    negative_detail = (E / 'm105feature-migration.txt').read_text()
    assert counts(read('analysis/evidence/m106/m105feature-migration-results.json')) == (12, 1) and negative['expected_fail'] == 1, negative
    assert 'ONLY identitytable/index/uniqueindex/immutabletrigger' in negative_detail and 'state_gate_answers' in negative_detail, 'frozen M105 schema assertion is not the declared negative'
    control_expected = {'pure': (0, 5), 'api': (0, 8), 'entry': (8, 16), 'gate': (1, 1), 'ui': (0, 2), 'freshness': (0, 2), 'hardening': (0, 2), 'portable': (0, 2), 'archive-ui': (0, 1), 'migration': (7, 2)}
    for name, n in control_expected.items():
        assert counts(read('analysis/evidence/m106/parent-' + name + '-results.json')) == n, (name, n)
    strict_control = read('analysis/evidence/m106/strict-stage-market-control.json')
    assert (strict_control['pass'], strict_control['fail']) == (5, 1) and 'strict' in strict_control['arm']
    parents = read('analysis/evidence/m106/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values())
    assert [v['files'] for v in parents['parents'].values()] == [137, 135, 133, 131, 129, 127, 125, 123, 121, 119, 117, 114, 110, 112, 112], [v['files'] for v in parents['parents'].values()]
    native = read('analysis/evidence/m106/native-runs.json'); assert len(native) == 6
    for r in native:
        text = (E / r['output']).read_text(); expected_row = (None, None, 2) if r['arm'] == 'raw' and r['suite'] == 'api' else (200, 6, 1) if r['arm'] == 'raw' else (121, 0, 0) if r['suite'] == 'api' else (204, 2, 1)
        assert (r['pass'], r['fail'], r['exit_code']) == expected_row, (r, expected_row)
        if r['suite'] == 'bots':
            assert (r['parity_fills'], r['parity_mismatches']) == (15, 0) and 'filled sample for parity: 15 trades' in text
    smoke = read('analysis/evidence/m106/smoke-exit.json'); text = (E / 'smoke.txt').read_text()
    assert smoke['exit_code'] == 0 and 'RESULT: 22/22 views OK, 0 UI-style failures, 0 console errors' in text and 'canvas limitation encountered 8' in text
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']), 'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'], 'todo_ids': [k for k, v in rows.items() if v['status'] == 'todo']}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 100, 3, 29, 0, 8]
    assert ledger['partial_ids'] == ['M30', 'M103', 'M108'] and rows['M106']['status'] == 'done' and all(rows[k]['status'] == 'todo' for k in ['M107', 'M111', 'M112'])
    scope = read('analysis/evidence/m106/SCOPE.json')
    assert scope['parent'] == BASE and scope['ledger_before'] == [132, 99, 3, 30, 0, 8] and scope['ledger_after'][:5] == [ledger['total'], ledger['done'], ledger['partial'], ledger['todo'], ledger['no_action']]
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m106-delivery-') as td:
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
                source = APP if name == 'documentation' else Path('/tmp/m106-' + name + '-stage/app')
                for p, h in guards[name].items():
                    b = (source / p).read_bytes(); assert sha(b) == h, (name, p); write(after, p, b)
                make_patch(before, after, P / patch_name)
            else:
                shutil.rmtree(after); shutil.copytree(before, after); run(['git', 'apply', '--check', str(P / patch_name)], after); run(['git', 'apply', str(P / patch_name)], after)
            assert manifest(after) == guards[name], name
            replay(before, after, P / patch_name, work)
            stages.append({'stage': name, 'source_manifest': name + '-source.json', 'source_files': len(guards[name]), 'patch': patch_name, **metadata(P / patch_name)})
            before = after
        final = before; combined = P / 'm106-state-gate-complete.patch'; make_patch(parent, final, combined); replay(parent, final, combined, work)
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
        info = {'base_commit': BASE, 'parent':'Actual M105 Git release tree (137 files), every older parent rebuilt by saved reverse patches and asserted against the frozen proofs.', 'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger, 'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']}, 'prior_cohorts': {s: {'pass': p, 'fail': f, 'probes': n} for s, (p, f, n) in prior.items()}, 'raw': {k: raw[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero', 'timeout_no_exit', 'summaryless']}, 'declared': {k: declared[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero']}, 'live_provider_attempts': {k: live[k] for k in ['pass', 'fail', 'completed_nonzero', 'summaryless']}, 'm105_declared_negative': {'suite': 'm105feature/migration', 'pass': 12, 'fail': 1, 'why': 'The frozen M105 migration probe asserts the M105-only schema delta (four identity objects); M106 adds four state-gate objects, so that single whole-schema assertion is a declared, milestone-scoped negative. The M106 migration probe is its successor assertion.', 'assertion_seen_in_output': 'ONLY identitytable'}, 'regression_parents': parents, 'controls': control_expected, 'strict_stage_regression': {'script': strict_control['script'], 'pass': strict_control['pass'], 'fail': strict_control['fail'], 'why': 'The pre-hardening stage let an absent/foreign account id escape as 404 instead of consulting nothing; the unchanged market cohort measured 5/1 there and 325/0 after the desk-resolution stage.'}, 'native': native, 'native_limits': 'Parent/current same15 synthetic fill parity/0 mismatches; both original >20-sample conditions fail, no padding/clock/floor/risk/targets retune. Raw api arm exits2 with no summary; raw bots 200/6 retained.', 'smoke': {**smoke, 'conditional_views_passed': 22, 'style_failures': 0, 'console_errors': 0, 'canvas_environment_limits': 8}, 'actual_parent_additive_migration': {'pass': 18, 'fail': 0, 'parent_control': [7, 2], 'new_schema_objects': 4, 'original_trade_columns': 63, 'old_facts_byte_differences': 0}, 'answer_model': {'states': ['not_adopted', 'passed', 'failed', 'unanswered', 'stale', 'unavailable'], 'refusing_states': ['failed', 'unanswered', 'stale', 'unavailable'], 'non_refusing': ['not_adopted'], 'window_minutes': 60, 'same_utc_day': True, 'imported_state': 'imported_unverified'}, 'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative), 'fixed_zip': {'source_files': 139, 'application_byte_differences': 0, 'private_env_db_dependency_files': 0}, 'engine_files_unchanged': CORE, 'other_protected_files': [p for p in PROTECTED if p not in CORE], 'harness_source_files': len(harness), 'package_lock_sha256': sha((APP / 'package-lock.json').read_bytes()), 'scope': 'M106 fresh in-session four-question state gate only: recorded self-report yes/no answers with a server receipt refusing the app own actionable surface exactly like the killzone/personal stop; not verified calmness/clarity/plan adherence/broker/mental state, not a readiness or discipline score, and no authority over risk/admission/cap/routine/core/grade/history. M107/M111/M112 TODO, M30/M103/M108 partial. No70%/causal/predictive/provider/human/meditation/pixel/production proof.'}
        (P / 'M106-STATE-GATE-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
        companion = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'source_files': 139, 'excluded_from_zip_to_avoid_self_hash': True}
        (E / 'archive-sha256.json').write_text(json.dumps(companion, indent=2) + '\n')
        print('Six constructed stages + docs + actual M105 parent + pristine: forward/reverse 0 byte differences.')
        print('Exact132/100/3/29; M106 318/0, prior cohorts/controls/native/raw/provider negatives retained separately.')
        print(json.dumps(companion, indent=2))


if __name__ == '__main__':
    main()
