#!/usr/bin/env python3
"""M110 deterministic delivery: six constructed runtime stages, docs, the actual M109 release as
the measured upgrade parent and the pristine cumulative diff.

Every stage tree is re-derived from the saved patches and must match its frozen
`<stage>-source.json` byte-for-byte in both directions; the delivered tree is then stacked onto
the pristine `tradingpro-main.zip` to produce `tradingpro-fixed.zip` with an SHA companion
computed outside the archive. Counts, control runs, declared negatives and the ledger are asserted
here so the delivery cannot drift from the evidence.

    python3 analysis/run-m110-verification.py --suite feature   # counts, controls, parents
    python3 analysis/capture-m110-stages.py --controls          # parent + pre-hardening controls
    python3 analysis/capture-m110-stages.py                     # stage trees + guards + harness
    python3 analysis/build-m110-news-window-artifacts.py --capture-stages
    python3 analysis/capture-m110-stages.py                     # freeze the patches in the guard
    python3 analysis/build-m110-news-window-artifacts.py        # replay only, twice
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m110'; P = ROOT / 'analysis/patches'
BASE = 'c09574eb247a5ef9ed06d308f0152f37263f831a'
STAGES = [('policy', 'm110-news-window-policy-and-schema.patch'), ('api', 'm110-news-window-api-routes.patch'), ('engine', 'm110-news-window-engine-and-veto.patch'), ('hardening', 'm110-news-window-legacy-refusal.patch'), ('ui', 'm110-news-window-settings-fields.patch'), ('documentation', 'm110-news-window-documentation.patch')]
COMBINED = 'm110-news-window-complete.patch'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts', 'make_patch', 'contents', 'allowed', 'add_zip']]
CORE = H['CORE']
# Everything M100-M109 protected, plus the M109 advisory channel itself: M110 touches neither, so
# `src/ask.js` and `public/js/views/ask.js` are now protected like the rest. The three files M110
# changes inside that set — `src/db.js` (two additive columns), `src/routes/api.js` (the accounts
# PUT pair) and `public/js/views/settings.js` (the two fields) — are named here explicitly rather
# than quietly dropped from the protection list.
NEWLY_PROTECTED = ['src/ask.js', 'public/js/views/ask.js']
M110_TOUCHES = ['src/db.js', 'src/routes/api.js', 'public/js/views/settings.js']
PROTECTED = [p for p in (CORE + ['src/instruments.js', 'src/trades.js', 'src/journaling.js', 'src/execution-review.js', 'src/routine.js', 'src/routine-records.js', 'src/confluences.js', 'src/screenshots.js', 'src/emotions.js', 'src/performance.js', 'src/coach.js', 'src/process-outcomes.js', 'src/behavior-days.js', 'src/opportunities.js', 'src/rule-changes.js', 'src/identity.js', 'src/period-reviews.js', 'src/candles.js', 'src/market.js', 'src/session-time.js', 'src/demo-data.js', 'src/bots/guardrails.js', 'src/bots/correction.js', 'src/bots/now.js', 'src/state-gate.js', 'src/intention.js', 'src/practice.js', 'src/db.js', 'server.js', 'public/js/app.js', 'public/js/util.js', 'public/js/store.js', 'public/js/api.js', 'public/js/chart.js', 'public/js/views/emotions.js', 'public/js/views/process-outcomes.js', 'public/js/views/behavior-days.js', 'public/js/views/opportunities.js', 'public/js/views/rule-changes.js', 'public/js/views/bots.js', 'public/js/views/coach.js', 'public/js/views/analytics.js', 'public/js/views/identity.js', 'public/js/views/state-gate.js', 'public/js/views/intention.js', 'public/js/views/practice.js', 'public/js/views/journal.js', 'public/js/views/settings.js', 'public/js/views/trades.js', 'public/js/views/playbook.js', 'public/js/views/routine.js', 'public/js/views/calendar.js', 'public/js/views/confluences.js', 'public/js/views/execution.js', 'public/js/views/market.js', 'public/js/views/period-reviews.js', 'public/js/views/risk.js', 'public/js/views/screenshots.js', 'package-lock.json', 'scripts/api-test.js', 'scripts/bots-test.js', 'scripts/smoke-test.js', 'scripts/test-cleanup.js'] + NEWLY_PROTECTED) if p not in M110_TOUCHES and p != 'src/bots/setup.js']
CHANGED = {'README.md', 'docs/API.md', 'src/news-window.js', 'src/db.js', 'src/routes/api.js', 'src/routes/bots.js', 'src/bots/index.js', 'src/bots/setup.js', 'public/js/views/settings.js'}
ENGINE_UNCHANGED = [p for p in CORE if p != 'src/bots/setup.js']


def gate(edir, suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/' + edir + '/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (edir, suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    guards = {n: read('analysis/evidence/m110/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = guards['documentation']
    assert len(current) == 146 and len(guards['parent']) == 145, (len(current), len(guards['parent']))
    assert all(len(guards[s[0]]) == 146 for s in STAGES), {s[0]: len(guards[s[0]]) for s in STAGES}
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/engine/journal/guard/gate/intention/practice/ask source changed'
    assert all(guards['parent'][p] == current[p] for p in ENGINE_UNCHANGED), 'An unchanged entry-engine module moved'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED, 'Unexpected changed-file set'
    assert {p for p in set(current) | set(guards['ui']) if guards['ui'].get(p) != current.get(p)} == {'README.md', 'docs/API.md'}, 'Docs changed runtime'
    assert guards['engine'] == read('analysis/evidence/m110/pre-hardening-source.json'), 'the pre-hardening control tree must be the engine stage (asserted identical, never copied twice)'
    harness = read('analysis/evidence/m110/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('m110', 'feature', 258, 0, 9)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (41, 0), 'api': (40, 0), 'engine': (25, 0), 'consumers': (22, 0), 'freshness': (17, 0), 'hardening': (40, 0), 'portable': (17, 0), 'migration': (33, 0), 'ui': (23, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m110/m110feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    # The cohorts of the milestones M110 sits on, re-run on this tree. Every one of them carries
    # the SAME declared negative: a frozen migration probe that asserts its milestone added ONLY
    # its own schema objects, and an inherited-facts comparison that covers `accounts` — which now
    # legitimately carries M110's two columns. Nothing was edited to make a frozen assert pass.
    # Each cohort key is (evidence dir, summary name, artifact prefix, counts): the runner that
    # owns the suite names both files, so the two are read from that runner's own convention rather
    # than assumed to match.
    prior = [('m109feature', 'm109', 'feature', 'm109feature', (166, 2, 9, 1)), ('m108feature', 'm108', 'feature', 'feature', (257, 2, 9, 1)), ('m107feature', 'm108', 'm107feature', 'm107feature', (230, 2, 9, 1)), ('m106feature', 'm108', 'm106feature', 'm106feature', (316, 2, 10, 1)), ('m105feature', 'm108', 'm105feature', 'm105feature', (140, 2, 10, 1))]
    for _, edir, summary, _, n in prior:
        gate(edir, summary, *n)
    # (passing assertions, the frozen schema-only label, the marker the SECOND failing line reports,
    # what that line is). The M105 probe reports `undefined` as the detail of its inherited-facts
    # failure — its own recorded output, left exactly as the committed record has it.
    negatives = [(13, 'M109 adds NO schema object of any kind', 'accounts', 'the whole-schema assertion of the M109 migration probe'), (19, 'ONLY the practice tables', 'accounts', 'the M108 practice-only schema assertion'), (16, 'ONLY the intention table', 'accounts', 'the M107 intention-only schema assertion'), (16, 'ONLY state-gate table', 'accounts', 'the M106 state-gate-only schema assertion'), (11, 'ONLY identitytable', 'undefined', 'the M105 identity-only schema assertion')]
    declared_negatives = []
    for (_, edir, summary, prefix, n), (p, label, marker, name) in zip(prior, negatives):
        d = gate(edir, summary, *n)
        mig = next(r for r in d['runs'] if r['name'] == 'migration')
        text = (ROOT / ('analysis/evidence/' + edir + '/' + prefix + '-migration.txt')).read_text()
        assert counts(read('analysis/evidence/' + edir + '/' + prefix + '-migration-results.json')) == (p, 2) and mig['exit_code'] != 0, (edir, prefix, p)
        assert label in text and marker in text, ('the declared negative must name its frozen schema assertion and its inherited-facts detail', edir, prefix, marker)
        declared_negatives.append({'cohort': [x[0] for x in prior if x[1] == edir and x[2] == summary][0], 'suite': prefix + '/migration', 'pass': p, 'fail': 2, 'frozen_assertion': label, 'inherited_facts_detail': marker, 'why': name + ' says that release added ONLY its own schema objects, and the same probe compares the inherited facts of every table including `accounts`. M110 adds two columns to `accounts`, so exactly two assertions fail: the whole-schema one and the inherited-facts one, which names `accounts` as the only differing table (the M105 probe prints `undefined` there — its own committed output, unchanged). The probe text, its failing labels and its nonzero exit are preserved in analysis/evidence/' + edir + '/' + prefix + '-migration.txt; its own runner assert trips on it, and nothing was edited to make it pass.'})
    # RAW / DECLARED / the live-provider arm, RE-RUN on this tree in this session: the recorded
    # numbers reproduce exactly, so the arms below are this session's runs, not an inherited claim.
    raw = gate('m108', 'raw', 596, 156, 31, 21, 1, 1); declared = gate('m108', 'declared', 824, 4, 31, 2); live = gate('m108', 'pure', 70, 1, 8, 6, 0, 5)
    # Parent controls: the unchanged M110 probes on the feature-absent M109 release. Every
    # assertion that needs the two clocks is a measured negative there; the migration probe, which
    # measures the parent by spawning the parent's own code, records what the upgrade finds.
    control_expected = {n: (0, 1) for n in ['pure', 'api', 'engine', 'consumers', 'freshness', 'hardening', 'portable', 'ui']}
    # On the parent the news-window migration probe reports 10 passing assertions — everything the
    # parent's own tree can still answer (its single knob, its history, its restart) — and 23
    # measured negatives, every one of them naming the absent module or the absent columns. The
    # count is pinned here so a probe change cannot silently soften the control.
    control_expected['migration'] = (10, 23)
    parent_controls = read('analysis/evidence/m110/parent-controls.json')
    assert set(parent_controls) == set(control_expected), (set(parent_controls), set(control_expected))
    for name, n in control_expected.items():
        assert (parent_controls[name]['pass'], parent_controls[name]['fail']) == n and parent_controls[name]['exit_code'] != 0, (name, n)
        assert counts(read('analysis/evidence/m110/parent-' + name + '-results.json')) == n, (name, n)
    parent_neg = (E / 'parent-migration.txt').read_text()
    assert 'FAIL M110 adds exactly TWO columns to `accounts`' in parent_neg and 'FAIL its news payload carries the resolved pair' in parent_neg and 'FAIL the change is additive in the strongest sense available here' in parent_neg, 'the parent migration control must name the absent columns and the missing payload'
    assert parent_neg.count('FAIL') == 23 and parent_neg.count('ok ') == 10, 'the parent migration control must keep its measured split'
    # Pre-hardening controls: the engine stage itself, measured by the UNCHANGED probes. The two
    # staged faults are asserted from the probe output, so the control cannot drift from what it
    # claims to measure.
    pre = read('analysis/evidence/m110/pre-hardening-controls.json')
    assert (pre['api']['pass'], pre['api']['fail']) == (31, 9) and (pre['hardening']['pass'], pre['hardening']['fail']) == (39, 1), pre
    assert (pre['api']['exit_code'], pre['hardening']['exit_code']) == (1, 1)
    pre_api = (E / 'pre-hardening-api.txt').read_text(); pre_hard = (E / 'pre-hardening-hardening.txt').read_text()
    assert 'FAIL the news endpoint refuses the old ?window= parameter instead of choosing a side for the caller' in pre_api, 'the pre-hardening control must be the passed-through legacy knob'
    assert 'FAIL the old single knob is refused on creation rather than split for the caller' in pre_api, 'the pre-hardening control must be the single-knob creation fault'
    assert 'FAIL no shipped file lost a guard it had: the settle floor is still enforced by the schema, the route and the module, in that order' in pre_hard, 'the pre-hardening control must be the missing floor on the route'
    delivered_api = (E / 'm110feature-api.txt').read_text(); delivered_hard = (E / 'm110feature-hardening.txt').read_text()
    assert 'ok the news endpoint refuses the old ?window= parameter instead of choosing a side for the caller' in delivered_api and 'ok the old single knob is refused on creation rather than split for the caller' in delivered_api, 'the delivered tree must refuse the legacy knob'
    assert 'ok no shipped file lost a guard it had: the settle floor is still enforced by the schema, the route and the module, in that order' in delivered_hard, 'the delivered tree must enforce the floor at every layer'
    parents = read('analysis/evidence/m110/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values())
    assert [v['files'] for v in parents['parents'].values()] == [145, 143, 141, 139, 137, 135, 133, 131, 129, 127, 125, 123, 121, 119, 117, 114, 110, 112, 112], [v['files'] for v in parents['parents'].values()]
    # The native API/bots arms are INHERITED from the committed M108 record and NOT re-run: they
    # drive providers this sandbox cannot reach, and the recorded values are asserted as inherited
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
    smoke = read('analysis/evidence/m110/smoke-exit.json'); text = (E / 'smoke.txt').read_text(); control_text = (E / 'smoke-parent-control.txt').read_text()
    assert smoke['exit_code'] == 0 and 'RESULT: 22/22 views OK, 0 UI-style failures, 0 console errors' in text, smoke
    assert smoke['parent_control']['views_passed'] == 22 and 'RESULT: 22/22 views OK, 0 UI-style failures, 0 console errors' in control_text, 'the unchanged parent must offer the same view count at the same sample'
    # The smoke harness does not open the account dialog at all, so the claim is asserted rather
    # than implied, and the two fields' coverage is the real-DOM settings probe.
    for probe_text, label in ((text, 'delivered'), (control_text, 'parent control')):
        assert not any('news' in l.lower() for l in probe_text.splitlines()), ('the smoke run must not be claimed as news-dialog coverage', label)
    assert smoke['news_dialog_coverage'].startswith('grep -ci \'news\' = 0')
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']), 'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'], 'todo_ids': [k for k, v in rows.items() if v['status'] == 'todo']}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 105, 2, 25, 0, 8]
    assert ledger['partial_ids'] == ['M30', 'M103'] and rows['M110']['status'] == 'done' and rows['M62']['status'] == 'done' and all(rows[k]['status'] == 'done' for k in ['M107', 'M108', 'M109']) and all(rows[k]['status'] == 'todo' for k in ['M111', 'M112'])
    scope = read('analysis/evidence/m110/SCOPE.json')
    assert scope['parent'] == BASE and scope['ledger_before'] == [132, 103, 2, 27, 0, 8] and scope['ledger_after'] == [ledger['total'], ledger['done'], ledger['partial'], ledger['todo'], ledger['no_action'], ledger['partition_groups']]
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m110-delivery-') as td:
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
                source = APP if name == 'documentation' else Path('/tmp/m110-' + name + '-stage/app')
                for p, h in guards[name].items():
                    b = (source / p).read_bytes(); assert sha(b) == h, (name, p); write(after, p, b)
                make_patch(before, after, P / patch_name)
            else:
                shutil.rmtree(after); shutil.copytree(before, after); run(['git', 'apply', '--check', str(P / patch_name)], after); run(['git', 'apply', str(P / patch_name)], after)
            assert manifest(after) == guards[name], name
            replay(before, after, P / patch_name, work)
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
        info = {'base_commit': BASE, 'parent': 'Actual M109 Git release tree (145 files) as the M110 parent; the inherited M109 parent (the 14ac041 M108 release), the M107 parent and every older parent rebuilt by saved reverse patches and asserted against the frozen proofs. M110 upgrades the parent database in place: exactly two columns are added to `accounts`, with the parent’s own schema text an unbroken prefix, and the parent’s single knob is refused rather than mapped.', 'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger, 'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']}, 'prior_cohorts_rerun': {c: {'pass': n[0], 'fail': n[1], 'probes': n[2], 'completed_nonzero': n[3], 'evidence': 'analysis/evidence/' + edir + '/' + summary + '-summary.json'} for c, edir, summary, prefix, n in prior}, 'inherited_arms_rerun_this_session': {'note': 'RAW, DECLARED and the live-provider arm were re-run on this tree in this session through analysis/run-m110-verification.py and reproduce the committed records exactly, so they are this session’s measurements rather than an inherited claim.', 'raw': {k: raw[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero', 'timeout_no_exit', 'summaryless']}, 'declared': {k: declared[k] for k in ['pass', 'fail', 'probes', 'completed_nonzero']}, 'live_provider_attempts': {k: live[k] for k in ['pass', 'fail', 'completed_nonzero', 'summaryless']}}, 'native_arms_inherited_not_rerun': {'note': 'The native API/bots provider arms need a market provider this sandbox cannot reach; the committed M108 record stands and is asserted as an inherited fact.', 'native': native}, 'declared_negatives': declared_negatives, 'regression_parents': parents, 'controls': {'parent': {k: (v[0], v[1]) for k, v in control_expected.items()}, 'pre_hardening': {'compare': 'the engine stage IS the pre-hardening runtime (loose module + pass-through route, no ui and no docs), asserted identical to pre-hardening-source.json', 'probes': {k: {'pass': v['pass'], 'fail': v['fail']} for k, v in pre.items()}, 'faults': ['one number still sets both sides of the release (the 6-12x settle collapse), so a legacy single knob is split for the caller instead of refused', 'the settle floor is not applied to the route, so a short settle is not a 400 there'],
            'parent_migration_split': 'On the parent the migration probe reports 10 passing assertions and 23 measured negatives, each named in analysis/evidence/m110/parent-migration.txt; the three assertions that still pass there are the ones the parent can answer about itself (its own history, its own single knob, its own restart), so they are not counted as feature coverage.', 'why': 'On the pre-hardening runtime the unchanged probes measured 31/9 (api) and 39/1 (hardening); the hardening stage made the legacy knob a refusal and put the floor on every layer, and the same probes are 40/0 and 40/0 on the delivered tree.'}}, 'smoke': {**{k: v for k, v in smoke.items() if k != 'parent_control'}, 'parent_control_views': 22, 'covers_the_news_fields': False, 'field_coverage': ['analysis/probe-m110-ui.js 23/0']}, 'upgrade_from_actual_parent': {'pass': 33, 'fail': 0, 'parent_control': [10, 23], 'columns_added': 2, 'inherited_fact_byte_differences': 0, 'other_schema_objects_changed': 0, 'parent_rows_rewritten_on_read': 0, 'why': 'The migration probe records the parent first (its own single `?window=` call echoed 5 and 45 on that very database), then compares sqlite_master object by object and table by table on the same file: the parent’s accounts text is an unbroken prefix of the upgraded text with the two documented definitions inserted, every other object and every inherited fact outside `accounts` is byte-identical, and the parent’s own code can still read the upgraded file.'}, 'news_window': {'version': 'news-window-v1', 'dependencies': 0, 'clock_of_its_own': False, 'before': {'column': 'news_block_before_min', 'default': 15, 'bounds': [1, 240], 'recommended_minimum': 15, 'warning_when_below': 'news_block_before_below_recommended'}, 'after': {'column': 'news_settle_after_min', 'default': 45, 'bounds': [30, 240], 'floor': 30, 'refusal_when_below': 'news_settle_below_floor', 'warning_when_above_stated_range': 'news_settle_outside_stated_range'}, 'one_number_never_sets_both': True, 'legacy_single_refused': ['window_min', 'windowMin', 'newsWindowMin', 'news_window_min', 'window'], 'legacy_refusal_code': 'news_window_split_required', 'code': ['news_window_invalid'], 'judged_by_signed_offset': 'a release that has not printed is judged by the block, one that has printed by the settle; boundaries inclusive', 'payload': ['blackout', 'currencies', 'events', 'upcoming', 'windows{before_min, after_min, source, clamped}'], 'event_fields': ['title', 'currency', 'time', 'side', 'offset_min', 'window_min'], 'removed': ['window_min'], 'writes': 0, 'settings_fields': ['#a-news-before (1-240)', '#a-news-after (30-240)'], 'required_in_files': 1, 'm111_open': 'A calendar that cannot be fetched still reaches this rule as a quiet one (null blackout, no `unavailable` flag, no error on the payload); the pair is still echoed and a failure is not cached. Measured, not papered over.'}, 'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative), 'fixed_zip': {'source_files': 146, 'application_byte_differences': 0, 'private_env_db_dependency_files': 0}, 'engine_files_unchanged': ENGINE_UNCHANGED, 'newly_protected_from_m109': NEWLY_PROTECTED, 'm110_touches_inside_the_protected_set': M110_TOUCHES, 'other_protected_files': [p for p in PROTECTED if p not in ENGINE_UNCHANGED], 'harness_source_files': len(harness), 'package_lock_sha256': sha((APP / 'package-lock.json').read_bytes()), 'scope': 'M110 the asymmetric news stand-down: two settings (pre-release block, post-release settle), applied by signed offset instead of one symmetric Math.abs window, with the settle floor enforced by the schema, the route and the module. It splits a window; it does not retune a grade — the news check keeps its weight and label, the state gate’s own 60-minute window is untouched, the risk guardrail still clamps beside it, and no fill padding, sample floor, clock, target, risk or grade moved. The one number he sanctions can no longer collapse the settle 6-12x below the 30-60 minutes he requires: a single knob is a refusal, not a split. M62’s surviving wording half is closed with it. M111 (the calendar fail-open) and M112 stay TODO. No 70%/causal/predictive/broker/provider/human/mental-state/pixel/production proof, and no predictor of any kind.'}
        (P / 'M110-NEWS-WINDOW-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
        print('Six constructed runtime stages + docs + actual M109 parent + pristine: forward/reverse 0 byte differences.')
        print('Exact132/105/2/25; M110 258/0, the five inherited cohorts carry the one declared schema negative each, RAW/DECLARED re-run identical.')
        print(json.dumps(companion, indent=2))


if __name__ == '__main__':
    main()
