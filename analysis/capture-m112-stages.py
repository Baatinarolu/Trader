#!/usr/bin/env python3
"""Capture the M112 stage trees, their source guards and the control runs.

M112 is delivered as one working tree, so the stages are *constructed* from the delivered files:
`policy` carries the rule itself (`src/trading-window.js`) and the four columns it lives in
(`src/db.js`) while the engine, the routes and the views are still the committed M111 files — so on
that tree a window can be stored and evaluated but NOTHING enforces it, which is the fault this
milestone fixes; `engine` adds the delivered merge and veto (`src/bots/correction.js`,
`src/bots/index.js`, `src/bots/setup.js`), `consumers` adds the delivered endpoints, the derivation
and the two views (`src/routes/bots.js`, `src/performance.js`, `public/js/views/*.js`), and
`documentation` adds the two docs. The pre-M112 files are taken from the parent tree's own content
rather than retyped, so the staged fault IS the committed behaviour of the release being fixed —
no hand-written approximation.

    python3 analysis/capture-m112-stages.py
    python3 analysis/capture-m112-stages.py --controls
"""
from pathlib import Path
import hashlib, json, os, runpy, shutil, subprocess, sys
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m112'
H = runpy.run_path(str(ROOT / 'analysis/build-m88-confluence-artifacts.py'), run_name='capture_helpers')
manifest = H['manifest']; write = H['write']
PARENT = Path('/tmp/m112-parent/app')
STAGES = [('policy', []), ('engine', []), ('consumers', []), ('documentation', [])]
FILES = {'policy': ['src/trading-window.js', 'src/db.js'],
         'engine': ['src/bots/correction.js', 'src/bots/index.js', 'src/bots/setup.js'],
         'consumers': ['src/routes/bots.js', 'src/performance.js', 'public/js/views/settings.js', 'public/js/views/bots.js'],
         'documentation': ['README.md', 'docs/API.md']}
# The files a pre-M112 stage takes from the parent's own tree: everything the LATER stages deliver.
FROM_PARENT = {'policy': ['src/bots/correction.js', 'src/bots/index.js', 'src/bots/setup.js', 'src/routes/bots.js', 'src/performance.js', 'public/js/views/settings.js', 'public/js/views/bots.js'],
               'engine': ['src/routes/bots.js', 'src/performance.js', 'public/js/views/settings.js', 'public/js/views/bots.js'],
               'consumers': [], 'documentation': []}


def main():
    E.mkdir(parents=True, exist_ok=True)
    assert manifest(PARENT) == json.loads((E / 'parent-source.json').read_text()), 'M112 parent tree changed'
    before = PARENT; guards = {}
    for name, _ in STAGES:
        tree = Path(f'/tmp/m112-{name}-stage/app'); shutil.rmtree(tree, ignore_errors=True)
        shutil.copytree(before, tree, symlinks=True, ignore=shutil.ignore_patterns('node_modules'))
        for rel in FILES[name]:
            write(tree, rel, (APP / rel).read_bytes())
        for rel in FROM_PARENT[name]:
            write(tree, rel, (PARENT / rel).read_bytes())
            assert (tree / rel).read_bytes() == (PARENT / rel).read_bytes()
            # The staged fault has to BE a difference: if the parent's file matched the delivered
            # one there would be nothing pre-M112 about this stage.
            assert (APP / rel).read_bytes() != (PARENT / rel).read_bytes(), (name, rel)
        guards[name] = manifest(tree); (E / f'{name}-source.json').write_text(json.dumps(guards[name], indent=2, sort_keys=True) + '\n')
        print(f'{name}: {len(guards[name])} files')
        before = tree
    (E / 'release-source.json').write_text(json.dumps(guards['documentation'], indent=2, sort_keys=True) + '\n')
    assert guards['documentation'] == manifest(APP), 'release stage must equal the delivered tree'
    # The pre-hardening control tree IS the policy stage: the rule and its columns exist and nothing
    # enforces them, so the measured control and the stage are asserted identical rather than copied
    # twice.
    pre = Path('/tmp/m112-pre-hardening/app'); shutil.rmtree(pre, ignore_errors=True)
    shutil.copytree(Path('/tmp/m112-policy-stage/app'), pre, symlinks=True, ignore=shutil.ignore_patterns('node_modules'))
    assert manifest(pre) == guards['policy'], 'the pre-hardening control tree must be the policy stage'
    (E / 'pre-hardening-source.json').write_text(json.dumps(manifest(pre), indent=2, sort_keys=True) + '\n')
    print('pre-hardening control tree (= policy stage):', len(manifest(pre)), 'files')
    harness = {}
    names = ('probe-m112-', 'm112-', 'run-m112-', 'build-m112-', 'capture-m112-')
    for p in sorted((ROOT / 'analysis').glob('*')):
        if p.is_file() and (p.name.startswith(names) or p.name in ('gen-progress.py', 'm110-test-support.js', 'm111-test-support.js', 'calendar-shim.js')):
            harness[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    scan = {}
    for p in sorted(ROOT.glob('analysis/patches/*m112*')): scan[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    for p in sorted(ROOT.glob('analysis/*[mM]112*.md')): scan[str(p.relative_to(ROOT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    (E / 'harness-source.json').write_text(json.dumps({**harness, **scan}, indent=2, sort_keys=True) + '\n')
    print('harness files:', len(harness) + len(scan))


# ------------------------------------------------------------------ control runs
# The unchanged M112 probes on the feature-absent parent runtime (the committed M111 release, which
# has no window module, no window columns and no window endpoint at all) and on the pre-hardening
# runtime where the rule and the columns exist but nothing enforces them.
CONTROLS = [('pure', PARENT), ('engine', PARENT), ('consumers', PARENT), ('api', PARENT), ('migration', PARENT), ('ui', PARENT)]
LOOSE = [('engine', Path('/tmp/m112-pre-hardening/app')), ('consumers', Path('/tmp/m112-pre-hardening/app')), ('api', Path('/tmp/m112-pre-hardening/app')), ('ui', Path('/tmp/m112-pre-hardening/app'))]


def ensure_modules(tree):
    link = Path(tree) / 'node_modules'
    if not link.exists(): link.symlink_to(APP / 'node_modules', target_is_directory=True)


def run_probe(name, tree, prefix):
    ensure_modules(tree); result = E / f'{prefix}-{name}-results.json'; text = E / f'{prefix}-{name}.txt'
    env = {**os.environ, 'TJ_APP': str(tree), 'TJ_PARENT': str(PARENT), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '', 'M112_RESULT': str(result), 'M111_RESULT': str(result)}
    if result.exists(): result.unlink()
    r = subprocess.run(['node', 'analysis/probe-m112-' + name + '.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
    text.write_bytes(r.stdout)
    if not result.exists(): raise AssertionError(f'{prefix}/{name} wrote no result file:\n{r.stdout.decode()[-2000:]}')
    d = json.loads(result.read_text())
    print(f'{prefix} {name} (on {Path(tree).parent.name}): {d["pass"]}/{d["fail"]}, exit={r.returncode}', flush=True)
    return {'pass': d['pass'], 'fail': d['fail'], 'exit_code': r.returncode}


def controls():
    parent = {}
    for name, tree in CONTROLS:
        counts = run_probe(name, tree, 'parent')
        parent[name] = {'tree': 'the delivered parent (the committed M111 release) where no window module, no window column and no window endpoint exists at all', 'script': 'analysis/probe-m112-' + name + '.js', **counts, 'output': f'parent-{name}.txt', 'scope': 'The unchanged M112 probe on the feature-absent parent runtime: the tree check fails, so every assertion that needs the rule or the columns is a measured negative there rather than a crash.'}
    (E / 'parent-controls.json').write_text(json.dumps(parent, indent=2) + '\n')
    print('parent controls:', {k: (v['pass'], v['fail']) for k, v in parent.items()}, flush=True)
    pre = {}
    for name, tree in LOOSE:
        counts = run_probe(name, tree, 'pre-hardening')
        pre[name] = {'tree': 'the delivered rule and the four columns with the engine, the endpoints and the views still the committed M111 files (the policy stage itself)', 'script': 'analysis/probe-m112-' + name + '.js', **counts, 'output': f'pre-hardening-{name}.txt', 'scope': 'The unchanged M112 probes on the pre-hardening runtime: a window can be stored and evaluated, but nothing enforces it — the veto, the filters key, the endpoints and the dialog are absent, so the assertions that need them measure the missing enforcement rather than a crash.'}
    (E / 'pre-hardening-controls.json').write_text(json.dumps(pre, indent=2) + '\n')
    print('pre-hardening controls:', {k: (v['pass'], v['fail']) for k, v in pre.items()}, flush=True)


if __name__ == '__main__':
    if '--controls' in sys.argv: controls()
    else: main()
