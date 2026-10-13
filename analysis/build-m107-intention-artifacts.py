#!/usr/bin/env python3
"""M107 deterministic delivery: four constructed runtime stages, docs, the actual M106
release as the measured parent and the pristine cumulative diff.

Every stage tree is re-derived from the saved patches and must match its frozen
`<stage>-source.json` byte-for-byte in both directions; the delivered tree is then
stacked onto the pristine `tradingpro-main.zip` to produce `tradingpro-fixed.zip` with an
SHA companion computed outside the archive. Counts, negative scopes and the ledger are
asserted here so the delivery cannot drift from the evidence.

    python3 analysis/capture-m107-stages.py           # stage trees + guards + controls
    python3 analysis/build-m107-intention-artifacts.py --capture-stages
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m107'; P = ROOT / 'analysis/patches'
BASE = '4d1307881ea4ac400047a58675f8ba4c52f82dd7'
STAGES = [('policy', 'm107-intention-policy-and-owned-schema.patch'), ('api', 'm107-intention-api-and-day-surfaces.patch'), ('hardening', 'm107-date-refusal-hardening.patch'), ('ui', 'm107-intention-card-editor-history-ui.patch'), ('documentation', 'm107-intention-documentation.patch')]
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts', 'make_patch', 'contents', 'allowed', 'add_zip']]
CORE = H['CORE']
PROTECTED = CORE + ['src/instruments.js', 'src/trades.js', 'src/journaling.js', 'src/execution-review.js', 'src/routine.js', 'src/routine-records.js', 'src/confluences.js', 'src/screenshots.js', 'src/emotions.js', 'src/performance.js', 'src/coach.js', 'src/process-outcomes.js', 'src/behavior-days.js', 'src/opportunities.js', 'src/rule-changes.js', 'src/identity.js', 'src/period-reviews.js', 'src/candles.js', 'src/market.js', 'src/session-time.js', 'src/demo-data.js', 'src/bots/guardrails.js', 'src/bots/correction.js', 'src/bots/now.js', 'src/state-gate.js', 'server.js', 'public/js/app.js', 'public/js/util.js', 'public/js/store.js', 'public/js/api.js', 'public/js/chart.js', 'public/js/views/emotions.js', 'public/js/views/process-outcomes.js', 'public/js/views/behavior-days.js', 'public/js/views/opportunities.js', 'public/js/views/rule-changes.js', 'public/js/views/bots.js', 'public/js/views/coach.js', 'public/js/views/analytics.js', 'public/js/views/identity.js', 'public/js/views/state-gate.js', 'public/js/views/trades.js', 'public/js/views/playbook.js', 'public/js/views/routine.js', 'public/js/views/calendar.js', 'public/js/views/confluences.js', 'public/js/views/execution.js', 'public/js/views/market.js', 'public/js/views/period-reviews.js', 'public/js/views/risk.js', 'public/js/views/screenshots.js', 'package-lock.json', 'scripts/api-test.js', 'scripts/bots-test.js', 'scripts/smoke-test.js', 'scripts/test-cleanup.js']
CHANGED = {'README.md', 'docs/API.md', 'src/db.js', 'src/routes/api.js', 'src/intention.js', 'public/index.html', 'public/js/views/intention.js', 'public/js/views/dashboard.js', 'public/js/views/journal.js', 'public/js/views/settings.js'}


def gate(suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/m107/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    guards = {n: read('analysis/evidence/m107/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = guards['documentation']
    assert len(current) == 141 and len(guards['parent']) == 139
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/engine/journal/guard/gate/native source changed'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED, 'Unexpected changed-file set'
    assert {p for p in set(current) | set(guards['ui']) if guards['ui'].get(p) != current.get(p)} == {'README.md', 'docs/API.md'}, 'Docs changed runtime'
    assert guards['api'] == read('analysis/evidence/m107/loose-date-source.json'), 'the pre-hardening control tree must be the api stage'
    harness = read('analysis/evidence/m107/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('feature', 232, 0, 9)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (46, 0), 'api': (31, 0), 'consumers': (16, 0), 'ui': (24, 0), 'freshness': (18, 0), 'hardening': (37, 0), 'portable': (25, 0), 'archive-ui': (17, 0), 'migration': (18, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m107/feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    prior = {'m106feature': (317, 1, 10), 'm105feature': (141, 1, 10), 'screenshots': (223, 3, 9), 'confluences': (160, 0, 8), 'emotions': (170, 0, 13), 'process': (106, 2, 6), 'behavior': (113, 2, 7), 'reviews': (159, 1, 9), 'opportunities': (144, 1, 10), 'changes': (152, 1, 11), 'execution': (260, 0, 9), 'routine': (321, 0, 10), 'offline': (178, 0, 4), 'market': (325, 0, 4)}
    for suite, (p, f, n) in prior.items():
        gate(suite, p, f, n, 1 if suite in ('screenshots', 'process', 'behavior', 'reviews', 'opportunities', 'changes', 'm106feature', 'm105feature') else 0)
    raw = gate('raw', 596, 156, 31, 21, 1, 1); declared = gate('declared', 824, 4, 31, 2); live = gate('pure', 70, 1, 8, 6, 0, 5)
    # Two declared, milestone-scoped negatives: the frozen M106 and M105 whole-schema
    # assertions each see M107's four additive intention objects. Kept, never rewritten.
    negative = next(r for r in read('analysis/evidence/m107/m106feature-runs.json') if r['name'] == 'migration')
    negative_detail = (E / 'm106feature-migration.txt').read_text()
    assert counts(read('analysis/evidence/m107/m106feature-migration-results.json')) == (17, 1) and negative['expected_fail'] == 1, negative
    assert 'ONLY state-gate table' in negative_detail and 'daily_intentions' in negative_detail, 'frozen M106 schema assertion is not the declared negative'
    negative105 = next(r for r in read('analysis/evidence/m107/m105feature-runs.json') if r['name'] == 'migration')
    assert counts(read('analysis/evidence/m107/m105feature-migration-results.json')) == (12, 1) and negative105['expected_fail'] == 1, negative105
    assert 'ONLY identitytable' in (E / 'm105feature-migration.txt').read_text(), 'frozen M105 schema assertion is not the declared negative'
    control_expected = {'pure': (0, 2), 'api': (2, 23), 'consumers': (0, 2), 'ui': (0, 2), 'hardening': (0, 2), 'portable': (0, 1), 'archive-ui': (1, 1), 'migration': (6, 2)}
    for name, n in control_expected.items():
        assert counts(read('analysis/evidence/m107/parent-' + name + '-results.json')) == n, (name, n)
    loose = read('analysis/evidence/m107/loose-date-controls.json')
    assert (loose['freshness']['pass'], loose['freshness']['fail']) == (15, 3), loose
    assert 'future' in (E / 'loose-date-freshness.txt').read_text() or 'not a past-or-today' in (E / 'loose-date-freshness.txt').read_text()
    parents = read('analysis/evidence/m107/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values())
    assert [v['files'] for v in parents['parents'].values()] == [139, 137, 135, 133, 131, 129, 127, 125, 123, 121, 119, 117, 114, 110, 112, 112], [v['files'] for v in parents['parents'].values()]
    native = read('analysis/evidence/m107/native-runs.json'); assert len(native) == 6
    for r in native:
        text = (E / r['output']).read_text(); expected_row = (None, None, 2) if r['arm'] == 'raw' and r['suite'] == 'api' else (200, 6, 1) if r['arm'] == 'raw' else (121, 0, 0) if r['suite'] == 'api' else (204, 2, 1)
        assert (r['pass'], r['fail'], r['exit_code']) == expected_row, (r, expected_row)
        if r['suite'] == 'bots':
            # parity_fills counts filled trades over the synthetic random-walk fixture and
            # moves with the wall clock (15 at the M106 delivery, 19 here); the invariant is
            # zero mismatches plus the retained original >20-sample failures.
            assert r['parity_mismatches'] == 0 and r['parity_fills'] == 19 and 'filled sample for parity:' in text, r
    smoke = read('analysis/evidence/m107/smoke-exit.json'); text = (E / 'smoke.txt').read_text()
    control_text = (E / 'smoke-parent-control.txt').read_text()
    assert smoke['exit_code'] == 0 and 'RESULT: 21/21 views OK, 0 UI-style failures, 0 console errors' in text and 'canvas limitation encountered 8' in text
    assert smoke['parent_control']['views_passed'] == 21 and 'RESULT: 21/21 views OK' in control_text, 'the unchanged parent must offer the same conditional view count at the same time'
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']), 'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'], 'todo_ids': [k for k, v in rows.items() if v['status'] == 'todo']}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 101, 3, 28, 0, 8]
    assert ledger['partial_ids'] == ['M30', 'M103', 'M108'] and rows['M107']['status'] == 'done' and all(rows[k]['status'] == 'todo' for k in ['M108', 'M111', 'M112'] if k != 'M108') and rows['M108']['status'] == 'partial'
    scope = read('analysis/evidence/m107/SCOPE.json')
    assert scope['parent'] == BASE and scope['ledger_before'] == [132, 100, 3, 29, 0, 8] and scope['ledger_after'][:5] == [ledger['total'], ledger['done'], ledger['partial'], ledger['todo'], ledger['no_action']]
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m107-delivery-') as td:
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
                source = APP if name == 'documentation' else Path('/tmp/m107-' + name + '-stage/app')
                for p, h in guards[name].items():
                    b = (source / p).read_bytes(); assert sha(b) == h, (name, p); write(after, p, b)
                make_patch(before, after, P / patch_name)
            else:
                shutil.rmtree(after); shutil.copytree(before, after); run(['git', 'apply', '--check', str(P / patch_name)], after); run(['git', 'apply', str(P / patch_name)], after)
            assert manifest(after) == guards[name], name
            replay(before, after, P / patch_name, work)
            stages.append({'stage': name, 'source_manifest': name + '-source.json', 'source_files': len(guards[name]), 'patch': patch_name, **metadata(P / patch_name)})
            before = after
        final = before; combined = P / 'm107-daily-intention-complete.patch'; make_patch(parent, final, combined); replay(parent, final, combined, work)
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
        info = {'base_commit': BASE, 'parent': 'Actual M106 Git release tree (139 files), every older parent rebuilt by saved reverse patches and asserted against the frozen proofs.', 'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger, 'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']}, 'prior_cohorts': {s: {'pass': p, 'fail': f, 'probes': n} for s, (p, f, n) in prior.items()}, 'raw': {k: raw[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero', 'timeout_no_exit', 'summaryless']}, 'declared': {k: declared[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero']}, 'live_provider_attempts': {k: live[k] for k in ['pass', 'fail', 'completed_nonzero', 'summaryless']}, 'declared_negatives': [{'suite': 'm106feature/migration', 'pass': 17, 'fail': 1, 'why': 'The frozen M106 migration probe asserts the M106-only schema delta (four state-gate objects); M107 adds four daily_intentions objects, so that single whole-schema assertion is a declared, milestone-scoped negative. The M107 migration probe is its successor assertion.'}, {'suite': 'm105feature/migration', 'pass': 12, 'fail': 1, 'why': 'The frozen M105 migration probe asserts the M105-only schema delta and also fails on the additive M106/M107 objects; retained unchanged at exactly one failing assertion, as it was on the M106 tree.'}], 'regression_parents': parents, 'controls': control_expected, 'loose_date_control': {'compare': 'the api stage IS the pre-date-hardening runtime (loose module + routes + schema), asserted identical to loose-date-source.json', 'probe': 'freshness', 'pass': loose['freshness']['pass'], 'fail': loose['freshness']['fail'], 'why': 'On the pre-hardening runtime a day that has not happened was read as "nothing recorded", a malformed day was not refused at the day surfaces, and the day surface did not name the refusal; the hardening stage made both measurable refusals and the same probe is 18/0 afterwards.'}, 'native': native, 'native_limits': 'Parent/current same synthetic fill parity 19 fills/0 mismatches (the fill count moves with the wall clock: 15 at the M106 delivery, 19 here); both original >20-sample conditions still fail, no padding/clock/floor/risk/targets retune. Raw api arm exits2 with no summary; raw bots 200/6 retained.', 'smoke': {**{k: v for k, v in smoke.items() if k != 'parent_control'}, 'conditional_views_passed': 21, 'style_failures': 0, 'console_errors': 0, 'canvas_environment_limits': 8, 'parent_control_views': 21}, 'actual_parent_additive_migration': {'pass': 18, 'fail': 0, 'parent_control': [6, 2], 'new_schema_objects': 4, 'original_trade_columns': 63, 'old_facts_byte_differences': 0}, 'intention_model': {'states': ['unrecorded', 'recorded', 'unavailable'], 'framings': ['process_template', 'unverified_free_text', 'outcome_language'], 'templates': ['follow_plan', 'a_plus_only', 'journal_every_trade', 'no_revenge'], 'refused': ['amount and outcome asserted in the same non-negated sentence (intention_outcome_target 400, nothing written)'], 'never_refused': ['other outcome/prediction wording', 'multi-sentence or long text (warned)', 'an amount inside a negation'], 'authority': 'none', 'gate': False}, 'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative), 'fixed_zip': {'source_files': 141, 'application_byte_differences': 0, 'private_env_db_dependency_files': 0}, 'engine_files_unchanged': CORE, 'other_protected_files': [p for p in PROTECTED if p not in CORE], 'harness_source_files': len(harness), 'package_lock_sha256': sha((APP / 'package-lock.json').read_bytes()), 'scope': 'M107 one same-day process intention only: the four saved Ep28 examples are the only thing labelled process-oriented, free text is stored exactly as written and explicitly unverified with the bounded classifier cues, and only an asserted money/outcome target is refused (the episode own anti-example). Not a score, tally, readiness, permission or gate over entries/signals/risk/cap/routine/core/grades/history; journal text is never rewritten. M108/M111/M112 TODO, M30/M103/M108 partial. No70%/causal/predictive/provider/human/mental-state/meditation/pixel/production proof.'}
        (P / 'M107-DAILY-INTENTION-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
        companion = {'file': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'source_files': 141, 'excluded_from_zip_to_avoid_self_hash': True}
        (E / 'archive-sha256.json').write_text(json.dumps(companion, indent=2) + '\n')
        print('Four constructed runtime stages + docs + actual M106 parent + pristine: forward/reverse 0 byte differences.')
        print('Exact132/101/3/28; M107 232/0, prior cohorts/controls/native/raw/provider negatives retained separately.')
        print(json.dumps(companion, indent=2))


if __name__ == '__main__':
    main()
