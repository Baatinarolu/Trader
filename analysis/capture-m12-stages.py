#!/usr/bin/env python3
"""Capture the M12 stage trees, their source guards and the control runs.

M12 is delivered as one working tree, so the stages are *constructed* from the delivered files:
`tally` carries the new aggregation (`src/rule-breaks.js`) while the endpoint, the page and the
analytics view are still the committed M112 files, so on that tree the tally can read the audit and
NOTHING can reach it — the fault this milestone fixes; `api` adds the delivered `src/routes/api.js`,
so the number travels on the wire and no page shows it; `card` adds the delivered
`public/js/views/rule-breaks.js`, `public/index.html` and `public/js/views/analytics.js`, and
`documentation` adds the two docs. The pre-M12 files are taken from the parent tree's own content
rather than retyped, so the staged fault IS the committed behaviour of the release being fixed.

`tools/jsmin/**` (ten files, delivered in its own commit 1bf6bab on top of the M112 release) is NOT
part of M12's staging: it is CARRIED into every stage tree from the delivered tree, by name, so a
stage measures M12's own fault and not the absence of an unrelated tool, and its own apparatus stays
frozen under `analysis/evidence/jsmin/`. The carried list is derived and pinned rather than typed in
twice: every delivered file the parent does not have, minus M12's own two new files, must equal it.

    python3 analysis/capture-m12-stages.py
    python3 analysis/capture-m12-stages.py --controls
"""
from pathlib import Path
import hashlib, json, os, runpy, shutil, subprocess, sys
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m12'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='capture_helpers')
manifest = H['manifest']; write = H['write']
PARENT = Path('/tmp/m12-parent/app')
STAGES = [('tally', []), ('api', []), ('card', []), ('documentation', [])]
FILES = {'tally': ['src/rule-breaks.js'],
         'api': ['src/routes/api.js'],
         'card': ['public/js/views/rule-breaks.js', 'public/index.html', 'public/js/views/analytics.js'],
         'documentation': ['README.md', 'docs/API.md']}
# The files the PRE-M12 stages take from the parent's own tree: the endpoint, the page and the view
# exactly as the committed M112 release ships them, i.e. with no way to reach the tally.
FROM_PARENT = {'tally': ['src/routes/api.js', 'public/index.html', 'public/js/views/analytics.js'],
               'api': ['public/index.html', 'public/js/views/analytics.js'],
               'card': [], 'documentation': []}
# Delivered in its own commit (1bf6bab) and carried, unchanged, into every stage tree.
CARRY = ['tools/jsmin/README.md', 'tools/jsmin/ast.js', 'tools/jsmin/cli.js', 'tools/jsmin/compress.js',
         'tools/jsmin/emit.js', 'tools/jsmin/index.js', 'tools/jsmin/lexer.js', 'tools/jsmin/parse.js',
         'tools/jsmin/scope.js', 'tools/jsmin/sourcemap.js']
OWN_NEW = ['src/rule-breaks.js', 'public/js/views/rule-breaks.js']


def main():
    E.mkdir(parents=True, exist_ok=True)
    assert manifest(PARENT) == json.loads((E / 'parent-source.json').read_text()), 'M12 parent tree changed'
    # The carried list is DERIVED: every delivered file the parent does not have, minus M12's own two
    # new files. If a later milestone adds a file, this capture refuses rather than silently carrying it.
    new_files = sorted(set(manifest(APP)) - set(manifest(PARENT)))
    assert sorted(set(new_files) - set(OWN_NEW)) == CARRY, ('the carried set drifted', new_files)
    assert all(not (PARENT / r).exists() and (APP / r).is_file() for r in CARRY), 'a carried file is missing'
    before = PARENT; guards = {}
    for name, _ in STAGES:
        tree = Path(f'/tmp/m12-{name}-stage/app'); shutil.rmtree(tree, ignore_errors=True)
        shutil.copytree(before, tree, symlinks=True, ignore=shutil.ignore_patterns('node_modules'))
        for rel in CARRY if name == STAGES[0][0] else []:
            write(tree, rel, (APP / rel).read_bytes())
            assert (tree / rel).read_bytes() == (APP / rel).read_bytes()
        for rel in FILES[name]:
            write(tree, rel, (APP / rel).read_bytes())
        for rel in FROM_PARENT[name]:
            write(tree, rel, (PARENT / rel).read_bytes())
            assert (tree / rel).read_bytes() == (PARENT / rel).read_bytes()
            # The staged fault has to BE a difference: if the parent's file matched the delivered
            # one there would be nothing pre-M12 about this stage.
            assert (APP / rel).read_bytes() != (PARENT / rel).read_bytes(), (name, rel)
        guards[name] = manifest(tree); (E / f'{name}-source.json').write_text(json.dumps(guards[name], indent=2, sort_keys=True) + '\n')
        print(f'{name}: {len(guards[name])} files')
        before = tree
    (E / 'release-source.json').write_text(json.dumps(guards['documentation'], indent=2, sort_keys=True) + '\n')
    assert guards['documentation'] == manifest(APP), 'release stage must equal the delivered tree'
    for rel in CARRY:
        for stage, _ in STAGES:
            assert guards[stage][rel] == guards['documentation'][rel], ('a carried file must be identical in every stage', rel)
    # The pre-hardening control tree IS the tally stage: the aggregation exists and its own tests
    # pass while no surface can reach it, so the measured control and the stage are asserted
    # identical rather than copied twice.
    pre = Path('/tmp/m12-pre-hardening/app'); shutil.rmtree(pre, ignore_errors=True)
    shutil.copytree(Path('/tmp/m12-tally-stage/app'), pre, symlinks=True, ignore=shutil.ignore_patterns('node_modules'))
    assert manifest(pre) == guards['tally'], 'the pre-hardening control tree must be the tally stage'
    (E / 'pre-hardening-source.json').write_text(json.dumps(manifest(pre), indent=2, sort_keys=True) + '\n')
    print('pre-hardening control tree (= tally stage):', len(manifest(pre)), 'files')
    harness = {}
    names = ('probe-m12-', 'm12-', 'run-m12-', 'build-m12-', 'capture-m12-', 'probe-jsmin-', 'run-jsmin-')
    for p in sorted((ROOT / 'analysis').glob('*')):
        if p.is_file() and (p.name.startswith(names) or p.name in ('gen-progress.py', 'm111-test-support.js', 'm112-test-support.js')):
            harness[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    scan = {}
    for p in sorted(ROOT.glob('analysis/patches/*m12*')): scan[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    for p in sorted(ROOT.glob('analysis/*[mM]12*.md')): scan[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    (E / 'harness-source.json').write_text(json.dumps({**harness, **scan}, indent=2, sort_keys=True) + '\n')
    print('harness files:', len(harness) + len(scan))


# ------------------------------------------------------------------ control runs
# The unchanged M12 probes on the feature-absent parent runtime (the committed M112 release, where the
# aggregation does not exist at all) and on the pre-hardening runtime where the tally exists, its own
# tests pass, and no endpoint and no page can reach it.
PROBES = ['pure', 'api', 'migration', 'ui']
CONTROLS = [(n, PARENT) for n in PROBES] + [('control', PARENT)]
LOOSE = [(n, Path('/tmp/m12-pre-hardening/app')) for n in PROBES] + [('control', Path('/tmp/m12-pre-hardening/app'))]
MODES = {'parent': 'parent', 'pre-hardening': 'tally-only'}


def ensure_modules(tree):
    link = Path(tree) / 'node_modules'
    if not link.exists(): link.symlink_to(APP / 'node_modules', target_is_directory=True)


def run_probe(name, tree, prefix):
    ensure_modules(tree); result = E / f'{prefix}-{name}-results.json'; text = E / f'{prefix}-{name}.txt'
    env = {**os.environ, 'TJ_APP': str(tree), 'TJ_PARENT': str(PARENT), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '',
           'M12_RESULT': str(result), 'M111_RESULT': str(result)}
    if name == 'control': env['M12_CONTROL_MODE'] = MODES[prefix]
    if result.exists(): result.unlink()
    r = subprocess.run(['node', 'analysis/probe-m12-' + name + '.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
    text.write_bytes(r.stdout)
    if not result.exists(): raise AssertionError(f'{prefix}/{name} wrote no result file:\n{r.stdout.decode()[-2000:]}')
    d = json.loads(result.read_text())
    print(f'{prefix} {name} (on {Path(tree).parent.name}): {d["pass"]}/{d["fail"]}, exit={r.returncode}', flush=True)
    return {'pass': d['pass'], 'fail': d['fail'], 'exit_code': r.returncode}


def controls():
    parent = {}
    for name, tree in CONTROLS:
        counts = run_probe(name, tree, 'parent')
        parent[name] = {'tree': 'the delivered parent (the committed M112 release) where the aggregation does not exist, so no payload carries it and no page names it', 'script': 'analysis/probe-m12-' + name + '.js', **counts, 'output': f'parent-{name}.txt'}
    (E / 'parent-controls.json').write_text(json.dumps(parent, indent=2) + '\n')
    print('parent controls:', {k: (v['pass'], v['fail']) for k, v in parent.items()}, flush=True)
    pre = {}
    for name, tree in LOOSE:
        counts = run_probe(name, tree, 'pre-hardening')
        pre[name] = {'tree': 'the delivered runtime with the tally present and the endpoint, the page and the analytics view still the committed M112 files (the tally stage itself)', 'script': 'analysis/probe-m12-' + name + '.js', **counts, 'output': f'pre-hardening-{name}.txt'}
    (E / 'pre-hardening-controls.json').write_text(json.dumps(pre, indent=2) + '\n')
    print('pre-hardening controls:', {k: (v['pass'], v['fail']) for k, v in pre.items()}, flush=True)


if __name__ == '__main__':
    if '--controls' in sys.argv: controls()
    else: main()
