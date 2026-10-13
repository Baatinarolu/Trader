#!/usr/bin/env python3
"""M13/M65 — the review periods: their four probes, their frozen parent, and every cohort they sit on.

    python3 analysis/run-m13-verification.py --suite feature [--freeze-parents]
    python3 analysis/run-m13-verification.py --suite m112feature|m111feature|m110feature|m109feature|...
                                                       m108feature|m107feature|m106feature|m105feature
                                                       raw|declared|pure|reviews|...

`feature` runs the four M13/M65 probes against the actual 9c88e0a M12 release as the parent guard and
writes analysis/evidence/m13/feature-summary.json. Every other suite delegates to
analysis/run-m112-verification.py (or, for the inherited M99/M101 reviews cohort, to
analysis/run-m110-verification.py), so the inherited cohorts are measured by their own unchanged
runners and the marks below are read from their own evidence files rather than re-derived here.
"""
from pathlib import Path
import argparse, json, os, shutil, subprocess, tarfile, io, hashlib
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m13'
M13_BASE = '9c88e0acfee00462e6c6ba5e3cb0d3ae06444b2c'
# git is asked for the parent by its unambiguous abbreviation (asserted below to resolve to the
# full SHA): this sandbox is a partial clone whose lazy fetch is not always available, while the
# short form resolves from the local commit-graph. The identity stays pinned to the full SHA.
M13_BASE_SHORT = '9c88e0a'
PARENT = Path('/tmp/m13-parent/app')
M13_FEATURE = [('pure', 'probe-m13-pure.js', 39), ('api', 'probe-m13-api.js', 23), ('migration', 'probe-m13-migration.js', 13), ('ui', 'probe-m13-ui.js', 19)]
DELEGATED = ['m112feature', 'm111feature', 'm110feature', 'm109feature', 'm108feature', 'm107feature', 'm106feature', 'm105feature',
             'raw', 'declared', 'pure', 'offline', 'market', 'live-provider', 'reports', 'screenshots', 'confluences', 'emotions',
             'process', 'behavior', 'reviews', 'opportunities', 'changes', 'execution', 'routine']
SCOPE = ('REPORTED completed assertions; literal clocks, saved rows and DOM only. The review artifacts the app already saves, '
         'joined to the periods they belong to on ONE calendar ruler, plus the weekly and quarterly buckets that ruler defines: '
         'the ruler is measured day by day across 2025-2027, the buckets against the closes the committed 9c88e0a M12 release '
         'wrote on its own file, the record over HTTP on the endpoint the review reads, and the shipped card in a real DOM. No '
         'broker, provider, mental-state, pixel or production proof, and no causal claim joining a review to a result. RAW '
         'failures/early aborts, DECLARED assumptions and every frozen milestone-only schema negative remain SEPARATE. '
         'DECLARED NEGATIVE carried here by name: the inherited M99/M101 reviews cohort is STALE at this HEAD — 157/3 against its '
         'committed 159/1 (migration 12/3), because the schema grew after M101 (accounts 26->36 columns and 10 delivered-only '
         'tables), which the M108-era evidence did not contain. The three gaps are declared here, not repaired in the probe.')


def read(p): return json.loads(Path(p).read_text())


def digest(tree):
    out = {}
    for p in sorted(tree.rglob('*')):
        if p.is_file() and not any(x in p.parts for x in ('node_modules', '.git')):
            out[str(p.relative_to(tree))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def freeze_parent():
    E.mkdir(parents=True, exist_ok=True)
    guard = E / 'parent-source.json'
    if PARENT.exists(): shutil.rmtree(PARENT)
    PARENT.mkdir(parents=True)
    assert subprocess.run(['git', 'rev-parse', M13_BASE_SHORT], cwd=ROOT, stdout=subprocess.PIPE, check=True).stdout.decode().strip() == M13_BASE, 'the abbreviated parent must resolve to the pinned M12 commit'
    with tarfile.open(fileobj=io.BytesIO(subprocess.run(['git', 'archive', M13_BASE_SHORT, 'extracted/tradejournal'], cwd=ROOT, stdout=subprocess.PIPE, check=True).stdout)) as t:
        for ent in t:
            if ent.isfile():
                rel = Path(ent.name).relative_to('extracted/tradejournal')
                dest = PARENT / rel; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(t.extractfile(ent).read())
    (PARENT / 'node_modules').symlink_to(APP / 'node_modules')
    assert not (PARENT / 'src/periods.js').exists(), 'the M13/M65 parent must not already ship the period ruler'
    assert (PARENT / 'src/period-reviews.js').exists() and (PARENT / 'src/rule-breaks.js').exists(), 'the M13/M65 parent is the 9c88e0a M12 release: it already has the review artifacts and the rule-break tally'
    d = digest(PARENT)
    if guard.exists():
        if d != read(guard):
            (Path('/tmp/m13-parent-mismatch.json')).write_text(json.dumps({'frozen': json.loads(guard.read_text()), 'current': d}, indent=2) + '\n')
            raise AssertionError('M13 parent tree changed: see /tmp/m13-parent-mismatch.json')
        print(f'M13 parent guard reproduced exactly ({len(d)} files)', flush=True)
    else:
        guard.write_text(json.dumps(d, indent=2, sort_keys=True) + '\n'); print(f'created parent-source.json from the actual {M13_BASE_SHORT} M12 release tree ({len(d)} files)', flush=True)


def freeze_parents():
    """The M13 parent plus the inherited parent trees the delegated cohorts measure against, recorded
    with their byte differences, so the builder reads a measured map rather than a claim."""
    freeze_parent()
    m112_parents = read('analysis/evidence/m112/regression-parents.json')['parents']
    assert str(Path('/tmp/m112-parent/app')) in m112_parents, 'run analysis/run-m112-verification.py --suite feature --freeze-parents first: the delegated M112 cohort and its controls need that tree'
    m110_parents = read('analysis/evidence/m110/regression-parents.json')['parents']
    assert any('m99-parent' in k for k in m110_parents), 'run analysis/run-m110-verification.py --suite reviews --freeze-parents first: the inherited reviews cohort needs its own trees'
    info = {'method': f'Actual {M13_BASE_SHORT} M12 Git release as the M13/M65 parent (the milestone these periods sit on), plus the M112 cohort\u2019s and the inherited reviews cohort\u2019s own measured parent maps, inherited unchanged \u2014 no parent is re-derived here and no schema or module is read out of an older runner.',
            'parents': {str(PARENT): {'files': len(digest(PARENT)), 'byte_differences': 0}, **m112_parents, **m110_parents}}
    (E / 'regression-parents.json').write_text(json.dumps(info, indent=2) + '\n')
    print(f'M13 regression parents: {len(info["parents"])} trees, byte differences 0', flush=True)


def feature(row):
    n, s, p = row
    result = E / ('m13feature-' + n + '-results.json')
    env = {**os.environ, 'TJ_APP': str(APP), 'TJ_PARENT': str(PARENT), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '', 'M13_RESULT': str(result), 'M111_RESULT': str(result)}
    run = subprocess.run(['node', 'analysis/' + s], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
    output = 'm13feature-' + n + '.txt'; (E / output).write_bytes(run.stdout)
    if not result.exists():
        print(f'm13feature/{n}: NO SUMMARY, exit={run.returncode}', flush=True)
        return {'name': n, 'script': 'analysis/' + s, 'pass': None, 'fail': None, 'expected_pass': p, 'expected_fail': 0, 'exit_code': run.returncode, 'status': 'completed', 'output': output}
    d = json.loads(result.read_text())
    print(f'm13feature/{n}: {d["pass"]}/{d["fail"]}, exit={run.returncode}', flush=True)
    return {'name': n, 'script': 'analysis/' + s, 'pass': d['pass'], 'fail': d['fail'], 'expected_pass': p, 'expected_fail': 0, 'exit_code': run.returncode, 'status': 'completed', 'output': output, 'scope': d['scope']}


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--suite', required=True)
    ap.add_argument('--freeze-parents', action='store_true'); a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    if a.freeze_parents: freeze_parents()
    if a.suite == 'feature':
        outs = [feature(r) for r in M13_FEATURE]
        info = {'app': str(APP), 'suite': 'feature', 'parent': str(PARENT), 'pass': sum(o['pass'] or 0 for o in outs), 'fail': sum(o['fail'] or 0 for o in outs),
                'probes': len(outs), 'completed_nonzero': sum(o['exit_code'] not in (0, None) for o in outs), 'timeout_no_exit': 0,
                'summaryless': sum(o['pass'] is None for o in outs), 'scope': SCOPE, 'runs': outs}
        (E / 'feature-summary.json').write_text(json.dumps(info, indent=2) + '\n')
        (E / 'feature-runs.json').write_text(json.dumps(outs, indent=2) + '\n')
        print(f'M13/M65 cohort: {info["pass"]}/{info["fail"]} across {info["probes"]} probes; nonzero exits {info["completed_nonzero"]}', flush=True)
        bad = [o['name'] for o in outs if o['pass'] != o['expected_pass'] or o['fail'] or o['exit_code'] != 0]
        assert not bad, f'M13/M65 cohort did not reproduce its own expected counts: {bad}'
        raise SystemExit(0)
    if a.suite == 'reviews':
        child = ['python3', 'analysis/run-m110-verification.py', '--suite', 'reviews']
        r = subprocess.run(child, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT); print(r.stdout.decode()[-3000:], flush=True)
        print('M13/M65 cohort artifacts: the delegated reviews runner wrote its own evidence under analysis/evidence/m110/', flush=True)
        raise SystemExit(r.returncode)
    child = ['python3', 'analysis/run-m112-verification.py', '--suite', {'m112feature': 'feature'}.get(a.suite, a.suite)]
    r = subprocess.run(child, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT); print(r.stdout.decode()[-3000:], flush=True)
    print('M13/M65 cohort artifacts: the delegated runner wrote its own evidence under analysis/evidence/', flush=True)
    raise SystemExit(r.returncode)


if __name__ == '__main__':
    main()
