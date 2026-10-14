#!/usr/bin/env python3
"""M56 deterministic delivery: four constructed runtime stages, the three docs, the actual M115 release as
the measured parent and the pristine cumulative diff.

The fault this milestone fixes is a missing READING, not missing data: the plan was stored, versioned and
displayed and no bot consulted a line of it. So the stages are `gate` (the module exists and nothing calls
it — the fault, staged from the parent's own files), `wired` (a failing `require` line refuses the candidate
through the ordinary veto path and rides the analyse/chart/scan payloads), `reader` (`GET /bots/plan-gate`
plus the plan id validation on the payload routes) and `documentation` (the two views and the three docs:
the editor's enforced-rule hint, the plan note and per-candidate rule rows, the API row, and the honesty
rows that name what the gate does NOT do). Every stage tree is rebuilt from the saved patches and must
match its frozen `<stage>-source.json` byte-for-byte in BOTH directions; the delivered tree is then stacked
onto the pristine `tradingpro-main.zip` to produce `tradingpro-fixed.zip` with an SHA companion computed
outside the archive.

    python3 analysis/capture-m56-stages.py --capture                       # guards + harness hash
    python3 analysis/capture-m56-stages.py --controls                      # parent + gate-only arms
    python3 analysis/build-m56-plan-gate-artifacts.py --capture-stages     # patches, ledger, ZIP
    python3 analysis/capture-m56-stages.py                                 # verify the frozen guards
    python3 analysis/build-m56-plan-gate-artifacts.py                      # replay only, twice
"""
from pathlib import Path, PurePosixPath
import argparse, io, re, runpy, shutil, tarfile, tempfile, zipfile, json
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m56'; P = ROOT / 'analysis/patches'
BASE_FULL = '6cd59fb445f2e34ce4f243888ce6657836099c31'
# The git commands address the parent by its unambiguous abbreviation and assert what it resolves to:
# this sandbox is a partial clone whose lazy fetch is not always available, while the short form
# resolves from the local commit-graph. The identity is pinned to the full SHA either way.
BASE = '6cd59fb'
STAGES = [('gate', 'm56-plan-gate-gate.patch'), ('wired', 'm56-plan-gate-wired.patch'),
          ('reader', 'm56-plan-gate-reader.patch'), ('documentation', 'm56-plan-gate-documentation.patch')]
COMBINED = 'm56-plan-gate-complete.patch'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='artifact_helpers')
sha, run, read, manifest, write, metadata, replay, counts, make_patch, contents, allowed, add_zip = [H[k] for k in ['sha', 'run', 'read', 'manifest', 'write', 'metadata', 'replay', 'counts',
                                                                                                                  'make_patch', 'contents', 'allowed', 'add_zip']]
PRIOR = runpy.run_path(str(ROOT / 'analysis/build-m112-trading-window-artifacts.py'), run_name='m56_prior_m112_artifact_helpers')
M115 = runpy.run_path(str(ROOT / 'analysis/build-m115-clean-reps-artifacts.py'), run_name='m56_prior_m115_artifact_helpers')
CAPTURE = runpy.run_path(str(ROOT / 'analysis/capture-m56-stages.py'), run_name='m56_capture_constants')
FILES_FOR = CAPTURE['FILES']
# Everything M100-M115 protected (M111's own list, plus the four files M111 changed, the nine M112 changed,
# the nine M13/M65 changed and the seven M115 touched), minus what this milestone is allowed to touch.
M111_CHANGED = PRIOR['M111_CHANGED']
M112_CHANGED = PRIOR['M112_TOUCHES']
M13_CHANGED = M115['M13_CHANGED']
M115_CHANGED = M115['M115_TOUCHES']
M56_TOUCHES = ['src/bots/setup.js', 'src/bots/index.js', 'src/routes/bots.js', 'public/js/views/bots.js', 'public/js/views/playbook.js',
               'public/js/views/settings.js', 'docs/API.md', 'docs/NOT-IMPLEMENTED.md', 'docs/PLAYLIST-CURRICULUM.md']
PROTECTED = sorted((set(PRIOR['PROTECTED']) | set(M111_CHANGED) | set(M112_CHANGED) | set(M13_CHANGED) | set(M115_CHANGED)) - set(M56_TOUCHES))
CHANGED = set(M56_TOUCHES)
ADDED = ['src/bots/plan-gate.js']
DOCS = {'docs/API.md', 'docs/NOT-IMPLEMENTED.md', 'docs/PLAYLIST-CURRICULUM.md'}
ENGINE_UNCHANGED = [p for p in PRIOR['ENGINE_UNCHANGED'] if p not in CHANGED]
SHIPPED_GATE = 'ok this tree ships the plan gate (src/bots/plan-gate.js) (the committed parent does not, and that absence is this probe\'s control)'
PARENT_GATE = 'FAIL this tree ships the plan gate (src/bots/plan-gate.js) (the committed parent does not, and that absence is this probe\'s control)'
# The pre-hardening arm is the `gate` stage: the vocabulary, the parse and the evaluation exist and are
# measured working (43 pure assertions, 21 migration assertions), and nothing consults them — the engine
# runs to the point where the wiring should be, the API gets a payload with no gate block at all, and the
# ui probe cannot render a state the server never sends.
PRE_FAULTS = {
    'pure': [],   # the module itself is the milestone's core: it passes on the gate stage
    'engine': ["TypeError: Cannot read properties of undefined (reading 'rules')"],
    'api': ['FAIL with several active plans the gate reports `ambiguous` and names every candidate, and it NEVER picks one silently'],
    'migration': [],
    'ui': ["TypeError: Cannot read properties of null (reading 'state')"],
}
DELIVERED_ANSWERS = {
    'pure': ['ok the vocabulary is a closed list of named facts, each with a documented line'],
    'engine': ['ok the same candidate that is tradeable with no plan is REFUSED by a plan rule it cannot meet'],
    'api': ['ok a requirement the candidate cannot meet REFUSES it, with the refusal as the first reason',
            'ok an alert analysed while a plan is active is confirmed against that plan, and the alert carries the gate back with it'],
    'migration': ['ok the delivered tree reads the PARENT\u2019s own plan: two machine lines enforced, one line of prose reported and never interpreted'],
    'ui': ['ok a plan refusal is attributed on the card even when the trader\u2019s own guardrail owns the action line: both reasons are visible, and the plan is not swallowed by the guardrail message',
           'ok the Settings alert history names the plan that gated an incoming alert, with the version and how many rules were enforced, and says it REFUSED this alert'],
}


def gate(edir, suite, p, f, n, nonzero=0, timeout=0, summaryless=0):
    d = read('analysis/evidence/' + edir + '/' + suite + '-summary.json')
    assert (d['pass'], d['fail'], d['probes'], d['completed_nonzero'], d['timeout_no_exit'], d['summaryless']) == (p, f, n, nonzero, timeout, summaryless), (edir, suite, d)
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture-stages', action='store_true'); a = ap.parse_args()
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    assert run(['git', 'rev-parse', BASE]).decode().strip() == BASE_FULL, 'the abbreviated parent must resolve to the pinned M115 commit'
    guards = {n: read('analysis/evidence/m56/' + n + '-source.json') for n in ['parent'] + [x[0] for x in STAGES]}
    current = read('analysis/evidence/m56/documentation-source.json')
    assert len(guards['parent']) == 163 and len(current) == 164, (len(guards['parent']), len(current))
    assert [len(guards[s[0]]) for s in STAGES] == [164, 164, 164, 164], {s[0]: len(guards[s[0]]) for s in STAGES}
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(p not in guards['parent'] for p in ADDED), 'an added file must be NEW in this milestone'
    assert all(guards['parent'][p] == current[p] for p in PROTECTED), 'Protected financial/core/journal/guard/gate/intention/practice/ask/news/window/period source changed'
    assert all(guards['parent'][p] == current[p] for p in ENGINE_UNCHANGED), 'An unchanged entry-engine module moved'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == CHANGED | set(ADDED), 'Unexpected changed-file set'
    for stage, _ in STAGES:
        for rel in FILES_FOR[stage]:
            assert guards[stage][rel] == current[rel], ('the stage must carry the delivered file', stage, rel)
    assert {p for p in set(current) | set(guards['reader']) if guards['reader'].get(p) != current.get(p)} == DOCS | {'public/js/views/bots.js', 'public/js/views/playbook.js', 'public/js/views/settings.js'}, 'Views or docs changed runtime'
    harness = read('analysis/evidence/m56/harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    feature = gate('m56', 'feature', 160, 0, 5)
    expected = {r['name']: (r['expected_pass'], 0) for r in feature['runs']}
    assert expected == {'pure': (43, 0), 'engine': (25, 0), 'api': (43, 0), 'migration': (21, 0), 'ui': (28, 0)}, expected
    for r in feature['runs']:
        assert counts(read('analysis/evidence/m56/m56feature-' + r['name'] + '-results.json')) == expected[r['name']] and r['exit_code'] == 0, r
    control = read('analysis/evidence/m56/control-results.json')
    assert {(r['mode'], r['pass'], r['fail'], r['exit_code']) for r in control['runs']} == {('delivered', 17, 0, 0), ('parent', 17, 0, 0)}, control
    # The milestones this one sits on, re-run on this tree in this session through the delegated chain.
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
                           'why': 'Read from the committed evidence of the M108-era run rather than re-run in this session. This milestone changes no schema, no candle read and no entry-engine module, and the three suites it does touch (now/chart/bots/smoke) were re-run here with identical failure sets on both trees.'}
    reviews = gate('m108', 'reviews', 157, 3, 9, 1)
    reviews_text = (ROOT / 'analysis/evidence/m108/reviews/feature-migration.txt').read_text()
    assert 'M99/M101 actual-parent additive review migration: 12 passed, 3 failed' in reviews_text, 'the stale reviews cohort must be the record it claims to be'
    for line in ['FAIL schema additions ONLY review table/index/uniqueindex/immutabletrigger',
                 'FAIL all old table/index/trigger definitions exact, no tradecolumn rebuild/addition',
                 'FAIL ALL original table finance/owner/clocks/provenance/permissions/routine/core facts retained']:
        assert line in reviews_text, ('the stale reviews negative must name its frozen assertion', line)
    declared.append({'cohort': 'M99/M101 (reviews)', 'suite': 'reviews/migration', 'pass': 12, 'fail': 3, 'committed_record': {'pass': 14, 'fail': 1},
                     'evidence': 'analysis/evidence/m108/reviews/feature-migration.txt',
                     'why': 'STALE at this HEAD and declared by name: the inherited M99/M101 cohort is 157/3 against its committed 159/1 because the schema grew after M101. This milestone changed no schema, so the gap is inherited, not caused here.'})
    for name, label in PRIOR['M110_NEGATIVES'] + PRIOR['M112_SCHEMA_NEGATIVES']:
        text = (ROOT / ('analysis/evidence/m110/m110feature-' + name + '.txt')).read_text()
        assert ('FAIL ' + label) in text, ('the declared negative must be the frozen assertion it claims to be', name, label)
        declared.append({'cohort': 'M110', 'suite': 'm110feature/' + name, 'frozen_assertion': label, 'evidence': 'analysis/evidence/m110/m110feature-' + name + '.txt',
                         'why': 'Written against a schema that predates M111/M112/M115. A declaration mismatch in the probe, not a regression: named here, never edited.'})
    # The parent and pre-hardening control arms, measured by the UNCHANGED probes on trees built from the
    # parent: the parent lacks the gate entirely; the gate stage HAS it and nothing consults it.
    controls = read('analysis/evidence/m56/controls.json')
    for name in ['pure', 'engine', 'api', 'migration', 'ui']:
        assert (controls[f'parent/{name}']['pass'], controls[f'parent/{name}']['fail']) == (0, 1) and controls[f'parent/{name}']['exit_code'] == 1, (name, controls[f'parent/{name}'])
        assert PARENT_GATE in (E / ('parent-' + name + '.txt')).read_text(), (name, PARENT_GATE)
        assert counts(read('analysis/evidence/m56/parent-' + name + '-results.json')) == (0, 1)
    assert (controls['parent/control']['pass'], controls['parent/control']['fail'], controls['parent/control']['exit_code']) == (17, 0, 0)
    assert 'FAIL' not in (E / 'parent-control.txt').read_text(), 'the mode-aware control probe measures the absence rather than failing on it'
    assert (controls['gate-only/pure']['pass'], controls['gate-only/pure']['fail']) == (43, 0), controls['gate-only/pure']
    assert (controls['gate-only/migration']['pass'], controls['gate-only/migration']['fail']) == (21, 0), controls['gate-only/migration']
    assert (controls['gate-only/engine']['fail'], controls['gate-only/engine']['exit_code']) == (1, 1)
    assert (controls['gate-only/api']['fail'], controls['gate-only/api']['exit_code']) == (2, 1)
    assert (controls['gate-only/ui']['fail'], controls['gate-only/ui']['exit_code']) == (1, 1)
    assert (controls['gate-only/control']['pass'], controls['gate-only/control']['fail'], controls['gate-only/control']['exit_code']) == (16, 1, 1)
    assert 'FAIL an incoming alert carries the plan gate back exactly when the tree has one' in (E / 'gate-only-control.txt').read_text(), 'the gate-only arm must fail on the unwired alert surface'
    # The gate-only api arm stops at the first missing surface (the payload has no gate at all), so the
    # alert assertion is never reached there — asserted as a PRESENCE check rather than assumed.
    assert DELIVERED_ANSWERS['api'][1] not in (E / 'gate-only-api.txt').read_text(), 'the gate-only api arm must stop before the alert section: there is no gate block to measure'
    for name, lines in PRE_FAULTS.items():
        pre_text = (E / ('gate-only-' + name + '.txt')).read_text(); delivered_text = (E / ('m56feature-' + name + '.txt')).read_text()
        for line in lines:
            assert line in pre_text, ('the gate-only arm must fail on the missing surface', name, line)
        for line in DELIVERED_ANSWERS[name]:
            assert line in delivered_text, ('the delivered tree must answer the same fact', name, line)
    for name in ['pure', 'migration']:
        assert SHIPPED_GATE in (E / ('gate-only-' + name + '.txt')).read_text(), ('the gate stage ships the module, so the probe gets past its opener', name)
    g = runpy.run_path(str(ROOT / 'analysis/gen-progress.py'), run_name='progress_gate'); rows = g['rows']
    ledger = {'total': len(rows), 'done': g['done'], 'partial': g['part'], 'todo': g['todo'], 'no_action': g['noact'], 'partition_groups': len(g['GROUPS']),
              'partial_ids': [k for k, v in rows.items() if v['status'] == 'partial'],
              'applied_ids': sorted([k for k, v in rows.items() if k in ('M17', 'M18', 'M19', 'M56')], key=lambda x: int(x[1:]))}
    assert [ledger[k] for k in ['total', 'done', 'partial', 'todo', 'no_action', 'partition_groups']] == [132, 114, 3, 15, 0, 8], ledger
    assert ledger['partial_ids'] == ['M30', 'M103', 'M115'] and ledger['applied_ids'] == ['M17', 'M18', 'M19', 'M56'], ledger
    assert rows['M56']['status'] == 'done' and rows['M115']['status'] == 'partial' and all(rows[k]['status'] == 'done' for k in ['M13', 'M65', 'M112', 'M111', 'M110'])
    parents = read('analysis/evidence/m13/regression-parents.json')
    assert all(v['byte_differences'] == 0 for v in parents['parents'].values()), {k: v for k, v in parents['parents'].items() if v['byte_differences']}
    P.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tj-m56-delivery-') as td:
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
                    # exactly how each fault is staged: `gate` lists only src/bots/plan-gate.js, so the
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
                    'parent': 'Actual 6cd59fb M115 clean-reps Git release tree (163 files) as the M56 parent: the milestone that added the rep count and the three docs corrections. It already stores the trader\u2019s plan (M102 versions included) and displays it; what it does not do is read it on the decision path, which is exactly the row. This milestone adds one FILE and no schema object.',
                    'pristine_zip': {'file': 'tradingpro-main.zip', 'sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes())}, 'ledger': ledger,
                    'feature': {k: feature[k] for k in ['pass', 'fail', 'probes', 'scope']},
                    'control': {'delivered': {'pass': 17, 'fail': 0}, 'parent': {'pass': 17, 'fail': 0},
                                'note': 'The mode-aware control probe PASSES on all three trees on purpose: it measures the fault (module present or absent, payload gate present or absent, reader route present or absent, plans unchanged by a read) rather than failing on it.'},
                    'prior_cohorts_rerun': {'m115': {'pass': 116, 'fail': 0, 'probes': 4, 'evidence': 'analysis/evidence/m115/feature-summary.json'},
                                            'm13': {'pass': 94, 'fail': 0, 'probes': 4, 'evidence': 'analysis/evidence/m13/feature-summary.json'},
                                            'm112': {'pass': 181, 'fail': 0, 'probes': 6, 'evidence': 'analysis/evidence/m112/feature-summary.json'}},
                    'inherited_records_read_not_rerun': inherited,
                    'environment_margins_rerun_this_session': {
                        'now-test': {'delivered': '50/0', 'parent': '50/0'}, 'chart-test': {'delivered': '36/0', 'parent': '36/0'},
                        'bots-test': {'delivered': '52 ok / 3 fail + crash at scripts/bots-test.js:180', 'parent': 'identical'},
                        'api-test': {'delivered': 'crash at scripts/api-test.js:50 (409 guardrail_stop on a fresh workspace)', 'parent': 'identical'},
                        'smoke-test': {'delivered': '21/21 views, 0 UI-style failures, 0 console errors', 'parent': 'identical'},
                        'note': 'smoke-test had not been run since the wiring; it is green on both trees. The bots-test and api-test crashes are pre-existing at the parent and are not this milestone\u2019s.'},
                    'declared_negatives': declared,
                    'regression_parents': {'trees': len(parents['parents']), **parents},
                    'controls': {'parent_tree': 'the committed 6cd59fb M115 release: no module, no payload gate, no reader route, and the three views/docs untouched \u2014 five probes 0/1 each, the mode-aware control 17/0',
                                 'gate_only_tree': 'the parent plus `src/bots/plan-gate.js` alone: the vocabulary, the parse and the per-direction evaluation can be computed and are measured working (pure 43/0, migration 21/0) while the engine, the API payload, the screen and the alert surface know nothing about them (engine 2/1, api 2/2, ui 1/1, control 16/1 on the alert row)',
                                 'why': 'The staged fault is a missing READING around a working module, not a missing rule: that is why the pure and migration arms pass on the gate-only tree while the engine, api and ui arms fail on the absence the milestone closes.'},
                    'arms': controls,
                    'gate': {'version': 'plan-gate-v1', 'vocabulary': 13,
                             'states': ['not_consulted', 'no_plan', 'ambiguous', 'ready', 'unavailable'],
                             'all_or_nothing': 'every machine-checkable `require` line is evaluated per direction and any failing line refuses the candidate through the ordinary no_trade/veto path, unshifted so the plan sentence leads `action`, the verdict, the Now strip, Copy plan and the log button',
                             'prose_never_parsed': 'non-`require` lines are reported as unverifiable and `exit_rules` / `checklist` / `market_conditions` stay displayed context: polarity cannot be read from free text',
                             'unknown_refuses_nothing': 'a fact the app could not read is `unknown`; an unreadable PLAN is `unavailable` and refuses everything; no active plan blocks nothing',
                             'unrecognised_is_loud': 'a `require` line outside the vocabulary is surfaced with its reason in the payload and on the screen, never passed silently',
                             'no_influence': 'boolean gate only: no grade, score, cap or price is moved (measured), `broker_verified:false`, and the payload publishes the limits',
                             'storage': 'read from the existing `strategies` rows and the M102 version rows; no table, no column, no index, no trigger, no backfill, and a read writes nothing'},
                    'stages': stages, 'combined': metadata(combined), 'pristine_cumulative': metadata(cumulative),
                    'fixed_zip': {'source_files': 164, 'application_byte_differences': 0, 'pristine_byte_differences': 0},
                    'engine_files_unchanged': ENGINE_UNCHANGED, 'newly_protected_from_m115': M115_CHANGED,
                    'm56_touches_inside_the_protected_set': M56_TOUCHES, 'other_protected_files': [p for p in PROTECTED if p not in M56_TOUCHES][:40],
                    'doc_corrections': {'API': 'docs/API.md gains the `GET /bots/plan-gate` row (states, per-line classification, limits) and `strategy_id` on analyse/chart/scan, with the scan row noting `plan_gate` + `plan_refused`',
                                        'PLAYLIST-CURRICULUM row 16': 'the Trading-plan row no longer reads as "Playbook view + guardrails": it now names the gate, the module, the all-or-nothing reading, the refusal shape, and the limits stated in the editor (only the listed lines are enforced; prose is never interpreted; an unrecognised `require` line is reported loudly)',
                                        'NOT-IMPLEMENTED': 'a new "written plan as a gate" row in §3 names what works AND what is missing (prose is never parsed, `exit_rules`/`checklist`/`market_conditions` are not enforced, and the gate refuses SIGNALS rather than grading a logged trade), and §5 item 5 now says so in the sentence that claims a plan-vs-execution grade is still missing'},
                    'scope': 'M56 the written plan as a gate: one read-only module (`src/bots/plan-gate.js`, plan-gate-v1), the three payload routes reading the trader\u2019s own plan (analyse, chart, scan), a reader route that publishes the vocabulary and the classification, and two views that make the refusal and the enforced lines visible. Explicitly NOT claimed: prose understanding, a performance or expectancy claim, a grade/score/cap/price influence, broker verification, a plan-vs-execution grade, a pixel proof, or anything about a real account.'}
            (P / 'M56-PLAN-GATE-STAGES.json').write_text(json.dumps(info, indent=2) + '\n')
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
            print('Four constructed runtime stages + docs + actual M115 parent + pristine: forward/reverse 0 byte differences.')
            print('Exact 132/114/3/15; M56 160/0, controls measured (parent 0/1 x5 + 17/0, gate-only 43/0 + 21/0 + 2/1 + 2/2 + 1/1 + 16/1).')
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
        archive = ROOT / 'tradingpro-fixed.zip'; companion = read('analysis/evidence/m56/archive-sha256.json')
        assert companion['source_files'] == 164 and archive.stat().st_size == companion['bytes'] and sha(archive.read_bytes()) == companion['sha256'], 'the delivered ZIP is not the one this run reproduces'
        print('Replay-only: every stage rebuilt from its saved patch reproduced its frozen guard; the delivered ZIP is byte-identical to the reproduced one.')


if __name__ == '__main__':
    main()
