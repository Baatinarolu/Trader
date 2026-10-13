#!/usr/bin/env python3
"""Capture the M13/M65 stage trees, their source guards and the control runs.

M13/M65 is delivered as one working tree, so the stages are *constructed* from the delivered files:
`ruler` carries the new calendar (`src/periods.js`) while `performance.js`, `period-reviews.js`, the
endpoint, the page and the analytics view are still the committed 9c88e0a M12 files, so on that tree
the ruler exists and NOTHING reads it; `series` adds the delivered `src/performance.js`, so closes are
bucketed by week and quarter on the wire and still nothing records which periods were reviewed;
`record` adds the delivered `src/period-reviews.js` and `src/routes/api.js`, so the record travels on
the payload and no page shows it; `card` adds the delivered `public/js/views/review-periods.js`,
`public/index.html` and `public/js/views/analytics.js`; `documentation` adds the two docs. The
pre-M13 files are taken from the parent tree's own content rather than retyped, so the staged fault IS
the committed behaviour of the release being fixed.

The parent tree (the actual 9c88e0a M12 release, byte-identical to its frozen guard) ALREADY ships
`tools/jsmin/**` and `src/rule-breaks.js`, so this milestone carries nothing forward: the delivered
files the parent does not have must be exactly M13's own two new files, and that is asserted rather
than assumed.

    python3 analysis/capture-m13-stages.py
    python3 analysis/capture-m13-stages.py --controls
"""
from pathlib import Path
import hashlib, json, os, runpy, shutil, subprocess, sys
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m13'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='capture_helpers')
manifest = H['manifest']; write = H['write']
PARENT = Path('/tmp/m13-parent/app')
STAGES = [('ruler', []), ('series', []), ('record', []), ('card', []), ('documentation', [])]
FILES = {'ruler': ['src/periods.js'],
         'series': ['src/performance.js'],
         'record': ['src/period-reviews.js', 'src/routes/api.js'],
         'card': ['public/js/views/review-periods.js', 'public/index.html', 'public/js/views/analytics.js'],
         'documentation': ['README.md', 'docs/API.md']}
# The files the PRE-M13 stages take from the parent's own tree: the payload, the record, the endpoint,
# the page and the view exactly as the committed M12 release ships them, i.e. with no period ruler, no
# weekly/quarterly buckets and no record of which periods were reviewed.
FROM_PARENT = {'ruler': ['src/performance.js', 'src/period-reviews.js', 'src/routes/api.js', 'public/index.html', 'public/js/views/analytics.js'],
               'series': ['src/period-reviews.js', 'src/routes/api.js', 'public/index.html', 'public/js/views/analytics.js'],
               'record': ['public/index.html', 'public/js/views/analytics.js'],
               'card': [], 'documentation': []}
OWN_NEW = ['src/periods.js', 'public/js/views/review-periods.js']


def main():
    E.mkdir(parents=True, exist_ok=True)
    assert manifest(PARENT) == json.loads((E / 'parent-source.json').read_text()), 'M13 parent tree changed'
    # Derived, not typed in twice: this milestone carries nothing forward, because the parent release
    # already ships the minifier and the rule-break tally.
    new_files = sorted(set(manifest(APP)) - set(manifest(PARENT)))
    assert new_files == sorted(OWN_NEW), ('the delivered tree adds something other than this milestone\u2019s own two files', new_files)
    assert 'src/periods.js' not in manifest(PARENT) and 'public/js/views/review-periods.js' not in manifest(PARENT), 'an own-new file already exists in the parent'
    before = PARENT; guards = {}
    for name, _ in STAGES:
        tree = Path(f'/tmp/m13-{name}-stage/app'); shutil.rmtree(tree, ignore_errors=True)
        shutil.copytree(before, tree, symlinks=True, ignore=shutil.ignore_patterns('node_modules'))
        for rel in FILES[name]:
            write(tree, rel, (APP / rel).read_bytes())
        for rel in FROM_PARENT[name]:
            write(tree, rel, (PARENT / rel).read_bytes())
            assert (tree / rel).read_bytes() == (PARENT / rel).read_bytes()
            # The staged fault has to BE a difference: if the parent's file matched the delivered
            # one there would be nothing pre-M13 about this stage.
            assert (APP / rel).read_bytes() != (PARENT / rel).read_bytes(), (name, rel)
        guards[name] = manifest(tree); (E / f'{name}-source.json').write_text(json.dumps(guards[name], indent=2, sort_keys=True) + '\n')
        print(f'{name}: {len(guards[name])} files')
        before = tree
    (E / 'release-source.json').write_text(json.dumps(guards['documentation'], indent=2, sort_keys=True) + '\n')
    assert guards['documentation'] == manifest(APP), 'release stage must equal the delivered tree'
    # The pre-hardening control tree IS the series stage: the ruler exists and the buckets ride the
    # payload while nothing records which periods were reviewed and no page shows any of it, so the
    # measured control and the stage are asserted identical rather than copied twice.
    pre = Path('/tmp/m13-pre-hardening/app'); shutil.rmtree(pre, ignore_errors=True)
    shutil.copytree(Path('/tmp/m13-series-stage/app'), pre, symlinks=True, ignore=shutil.ignore_patterns('node_modules'))
    assert manifest(pre) == guards['series'], 'the pre-hardening control tree must be the series stage'
    (E / 'pre-hardening-source.json').write_text(json.dumps(manifest(pre), indent=2, sort_keys=True) + '\n')
    print('pre-hardening control tree (= series stage):', len(manifest(pre)), 'files')
    harness = {}
    names = ('probe-m13-', 'm13-', 'run-m13-', 'build-m13-', 'capture-m13-')
    for p in sorted((ROOT / 'analysis').glob('*')):
        if p.is_file() and (p.name.startswith(names) or p.name in ('gen-progress.py', 'm111-test-support.js', 'm112-test-support.js', 'm12-test-support.js')):
            harness[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    scan = {}
    for p in sorted(ROOT.glob('analysis/patches/*m13*')): scan[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    for p in sorted(ROOT.glob('analysis/*[mM]13*.md')): scan[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    (E / 'harness-source.json').write_text(json.dumps({**harness, **scan}, indent=2, sort_keys=True) + '\n')
    print('harness files:', len(harness) + len(scan))


# ------------------------------------------------------------------ control runs
# The unchanged M13 probes on the feature-absent parent runtime (the committed M12 release, where there
# is no ruler, no weekly/quarterly bucket and no record at all) and on the pre-hardening runtime where
# the ruler and the buckets exist and nothing records or shows which periods were reviewed.
PROBES = ['pure', 'api', 'migration', 'ui']
CONTROLS = [(n, PARENT) for n in PROBES] + [('control', PARENT)]
LOOSE = [(n, Path('/tmp/m13-pre-hardening/app')) for n in PROBES] + [('control', Path('/tmp/m13-pre-hardening/app'))]
MODES = {'parent': 'parent', 'pre-hardening': 'series-only'}


def ensure_modules(tree):
    link = Path(tree) / 'node_modules'
    if not link.exists(): link.symlink_to(APP / 'node_modules', target_is_directory=True)


def run_probe(name, tree, prefix):
    ensure_modules(tree); result = E / f'{prefix}-{name}-results.json'; text = E / f'{prefix}-{name}.txt'
    env = {**os.environ, 'TJ_APP': str(tree), 'TJ_PARENT': str(PARENT), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '',
           'M13_RESULT': str(result), 'M111_RESULT': str(result)}
    if name == 'control': env['M13_CONTROL_MODE'] = MODES[prefix]
    if result.exists(): result.unlink()
    r = subprocess.run(['node', 'analysis/probe-m13-' + name + '.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
    text.write_bytes(r.stdout)
    if not result.exists(): raise AssertionError(f'{prefix}/{name} wrote no result file:\n{r.stdout.decode()[-2000:]}')
    d = json.loads(result.read_text())
    print(f'{prefix} {name} (on {Path(tree).parent.name}): {d["pass"]}/{d["fail"]}, exit={r.returncode}', flush=True)
    return {'pass': d['pass'], 'fail': d['fail'], 'exit_code': r.returncode}


def controls():
    parent = {}
    for name, tree in CONTROLS:
        counts = run_probe(name, tree, 'parent')
        parent[name] = {'tree': 'the delivered parent (the committed 9c88e0a M12 release) where no ruler, no weekly/quarterly bucket and no record exists, so no payload carries a period and no page names one', 'script': 'analysis/probe-m13-' + name + '.js', **counts, 'output': f'parent-{name}.txt'}
    (E / 'parent-controls.json').write_text(json.dumps(parent, indent=2) + '\n')
    print('parent controls:', {k: (v['pass'], v['fail']) for k, v in parent.items()}, flush=True)
    pre = {}
    for name, tree in LOOSE:
        counts = run_probe(name, tree, 'pre-hardening')
        pre[name] = {'tree': 'the delivered runtime with the ruler and the weekly/quarterly buckets present and the record, the endpoint, the page and the analytics view still the committed M12 files (the series stage itself)', 'script': 'analysis/probe-m13-' + name + '.js', **counts, 'output': f'pre-hardening-{name}.txt'}
    (E / 'pre-hardening-controls.json').write_text(json.dumps(pre, indent=2) + '\n')
    print('pre-hardening controls:', {k: (v['pass'], v['fail']) for k, v in pre.items()}, flush=True)


if __name__ == '__main__':
    if '--controls' in sys.argv: controls()
    else: main()
