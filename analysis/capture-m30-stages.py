#!/usr/bin/env python3
"""M30 stage capture: the four constructed stages, their frozen guards and the harness hashes.

    python3 analysis/capture-m30-stages.py              # verify the frozen guards
    python3 analysis/capture-m30-stages.py --capture     # (re)write the guards from the work tree
    python3 analysis/capture-m30-stages.py --controls    # parent + module-only control arms

M30 is a fix inside the app, not a new file: Ep 7's second zone method is a GEOMETRY that a read has to
choose and then NAME, so the stages isolate the choice, file by file:

  `module`   `src/bots/smc.js` alone — the vocabulary (`pivot`/`range`), the folding rule and the
             three-rule consolidation walk exist, and NOTHING consults them: the engine still plots one
             geometry and no surface can name it (the fault this milestone fixes, staged from the real
             parent's own files). This is the tree the control suite's `module` mode reads.
  `engine`   + `src/bots/setup.js`, `src/bots/momentum.js`, `src/bots/index.js` — a read can now be asked
             for the range geometry, the filter block carries the method and its source, and the analyse
             and chart payloads name the geometry they shipped zones for
  `routes`   + `src/routes/bots.js`, `src/routes/api.js` — the query wins, the stored choice is consulted
             and the settings route refuses a value outside the vocabulary by name (400) instead of
             quietly dropping a choice the trader made
  `screens`  + the two views and the three docs (the Settings picker, the bots note, the API rows, the
             honesty rows, the curriculum row)

Every stage tree is rebuilt from the pinned parent and must match its frozen `<stage>-source.json`
byte-for-byte in BOTH directions; the delivered tree is 164 files against the parent's 164 — every
one of them an existing file, so this milestone adds no file and no schema object.
"""
import argparse, hashlib, json, shutil, subprocess, tarfile, io, os, re
from pathlib import Path, PurePosixPath
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m30'
BASE_FULL = '27fbb2acbd8574a7278d880d3654bc9706e39e90'
BASE = '27fbb2a'   # the committed M56 alert-surface release, by the abbreviation that resolves to BASE_FULL
PARENT = Path('/tmp/m30-parent/app')
MODULE_STAGE = Path('/tmp/m30-module-stage/app')
STAGES = ['module', 'engine', 'routes', 'screens']
# The files each stage carries from the DELIVERED tree, cumulative. Everything not listed is the
# parent's own file, so each stage's exposure is exactly the fault being fixed at that point.
FILES = {
    'module': ['src/bots/smc.js'],
    'engine': ['src/bots/smc.js', 'src/bots/setup.js', 'src/bots/momentum.js', 'src/bots/index.js'],
    'routes': ['src/bots/smc.js', 'src/bots/setup.js', 'src/bots/momentum.js', 'src/bots/index.js',
               'src/routes/bots.js', 'src/routes/api.js'],
    'screens': ['src/bots/smc.js', 'src/bots/setup.js', 'src/bots/momentum.js', 'src/bots/index.js',
                'src/routes/bots.js', 'src/routes/api.js',
                'public/js/views/bots.js', 'public/js/views/settings.js',
                'docs/API.md', 'docs/PLAYLIST-CURRICULUM.md', 'docs/NOT-IMPLEMENTED.md'],
}
HARNESS = ['analysis/m30-test-support.js', 'analysis/probe-m30-pure.js', 'analysis/probe-m30-engine.js',
           'analysis/probe-m30-api.js', 'analysis/probe-m30-ui.js', 'analysis/probe-m30-migration.js',
           'analysis/probe-m30-control.js', 'analysis/run-m30-verification.py', 'analysis/capture-m30-stages.py',
           'analysis/M30-ZONE-METHODS.md']


def sha(b): return hashlib.sha256(b).hexdigest()


def run(args, cwd=ROOT): return subprocess.run(args, cwd=cwd, check=True, capture_output=True).stdout


def read(p): return json.loads(Path(p).read_text())


def allowed(p):
    return (not p.is_absolute() and '..' not in p.parts
            and not set(p.parts) & {'.git', 'node_modules', 'data', '__pycache__', 'fixtures', 'transcripts', 'independent'}
            and not str(p).startswith('.env') and not p.name.startswith('.env')
            and not re.search(r'\.(?:db|sqlite)(?:-|$)', p.name))


def manifest(tree):
    """The delivered tree from git (fixtures included, exactly as the other artifacts count them);
    a constructed tree by walking it, which is what the frozen stage guards record."""
    if tree == APP:
        paths = run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', 'extracted/tradejournal']).decode().split('\0')
        rels = sorted({p.removeprefix('extracted/tradejournal/') for p in paths if p})
        assert all(allowed(PurePosixPath(r)) or r.startswith('scripts/fixtures/') for r in rels), 'unexpected untracked path'
        return {r: sha((tree / r).read_bytes()) for r in rels}
    return {str(p.relative_to(tree)): sha(p.read_bytes()) for p in sorted(tree.rglob('*'))
            if p.is_file() and not set(p.parts) & {'node_modules', '.git'}}


def write(dest, rel, b):
    p = PurePosixPath(rel); assert not p.is_absolute() and '..' not in p.parts
    q = dest / str(p); q.parent.mkdir(parents=True, exist_ok=True); q.write_bytes(b)


def materialise_parent(dest):
    """The pinned parent tree from git, plus a node_modules symlink (the parent shares this tree's
    dependencies: this milestone adds none)."""
    if dest.exists(): shutil.rmtree(dest)
    dest.mkdir(parents=True)
    tar = run(['git', 'archive', '--format=tar', BASE, 'extracted/tradejournal'])
    with tarfile.open(fileobj=io.BytesIO(tar)) as t:
        for ent in t.getmembers():
            if ent.isfile():
                write(dest, str(PurePosixPath(ent.name).relative_to('extracted/tradejournal')), t.extractfile(ent).read())
    (dest / 'node_modules').symlink_to(APP / 'node_modules')
    assert (dest / 'src/bots/plan-gate.js').exists() and (dest / 'src/periods.js').exists(), 'the parent must be the 27fbb2a M56 release'
    assert 'ZONE_METHODS' not in (dest / 'src/bots/smc.js').read_text(), 'the parent must not already have two zone methods'
    return dest


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture', action='store_true'); ap.add_argument('--controls', action='store_true')
    a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    assert run(['git', 'rev-parse', BASE]).decode().strip() == BASE_FULL, 'the abbreviated parent must resolve to the pinned M56 commit'
    current = manifest(APP)
    if a.capture:
        parent = materialise_parent(Path('/tmp/m30-capture-parent/app'))
        assert len(manifest(parent)) == len(current), (len(manifest(parent)), len(current))
        (E / 'parent-source.json').write_text(json.dumps(manifest(parent), indent=2, sort_keys=True) + '\n')
        # Each stage guard is the parent's tree with (only) that stage's files replaced by the
        # delivered ones — rebuilt here, never hand-written.
        for stage in STAGES:
            tree = Path('/tmp/m30-capture-' + stage + '/app')
            if tree.exists(): shutil.rmtree(tree)
            shutil.copytree(parent, tree, symlinks=True)
            for rel in FILES[stage]: write(tree, rel, (APP / rel).read_bytes())
            (E / (stage + '-source.json')).write_text(json.dumps(manifest(tree), indent=2, sort_keys=True) + '\n')
            print(f'captured {stage}: {len(manifest(tree))} files', flush=True)
        (E / 'harness-source.json').write_text(json.dumps({p: sha((ROOT / p).read_bytes()) for p in HARNESS if (ROOT / p).exists()}, indent=2, sort_keys=True) + '\n')
        print(f'captured delivered tree: {len(current)} files; harness {len([p for p in HARNESS if (ROOT / p).exists()])} files', flush=True)
        return
    guards = {n: read(E / (n + '-source.json')) for n in ['parent'] + STAGES}
    assert len(guards['parent']) == 164 and len(current) == 164, (len(guards['parent']), len(current))
    assert [len(guards[s]) for s in STAGES] == [164, 164, 164, 164], {s: len(guards[s]) for s in STAGES}
    assert manifest(APP) == current, 'Unmeasured source edit'
    changed = {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)}
    assert changed == set(FILES['screens']), sorted(changed)
    # every stage's files are the delivered ones, and each stage carries what the previous stage had
    for stage in STAGES:
        for rel in FILES[stage]:
            assert guards[stage][rel] == current[rel], ('the stage must carry the delivered file', stage, rel)
    for rel in FILES['engine']:
        if rel not in FILES['module']:
            assert guards['module'][rel] == guards['parent'][rel] and guards['module'][rel] != current[rel], ('module must carry the parent', rel)
    assert guards['module']['src/bots/smc.js'] == current['src/bots/smc.js'], 'the module stage is the engine module and nothing else'
    for rel in ['src/routes/bots.js', 'src/routes/api.js'] + FILES['screens'][6:]:
        assert guards['engine'][rel] == guards['parent'][rel] and guards['engine'][rel] != current[rel], ('engine must not carry the routes, views or docs', rel)
    for rel in FILES['screens'][6:]:
        assert guards['routes'][rel] == guards['parent'][rel] and guards['routes'][rel] != current[rel], ('routes must not carry the views or the docs', rel)
    assert {p for p in set(current) | set(guards['routes']) if guards['routes'].get(p) != current.get(p)} == set(FILES['screens'][6:]), 'Docs and views changed runtime'
    harness = read(E / 'harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    print(f'M30 stages verified: parent {len(guards["parent"])}, module/engine/routes/screens {len(guards["screens"])}, delivered {len(current)}; harness {len(harness)} files frozen', flush=True)
    if not a.controls: return

    # The two control arms, measured by the UNCHANGED probes against trees built from the parent: the
    # released build (no vocabulary at all) and the module-only stage (the vocabulary exists and nothing
    # can consult it). The module stage is materialised at the path the control suite reads.
    parent = materialise_parent(PARENT)
    stage = materialise_parent(MODULE_STAGE)
    write(stage, 'src/bots/smc.js', (APP / 'src/bots/smc.js').read_bytes())
    assert 'ZONE_METHODS' in (stage / 'src/bots/smc.js').read_text(), 'the module stage carries the vocabulary'
    for rel in ['src/bots/index.js', 'src/bots/setup.js', 'src/routes/api.js', 'src/routes/bots.js']:
        assert sha((stage / rel).read_bytes()) == sha((parent / rel).read_bytes()), ('the module stage must NOT carry the wiring', rel)
    arms = {}
    shim = '--require=' + str(ROOT / 'analysis' / 'candle-shim.js')
    for arm, tree, mode in (('parent', parent, 'parent'), ('module-only', stage, 'module')):
        env = {**os.environ, 'TJ_APP': str(tree), 'TJ_PARENT': str(parent), 'NODE_OPTIONS': shim,
               'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': '', 'TJ_SHIM_QUIET': '1'}
        for name in ['pure', 'engine', 'api', 'ui', 'migration']:
            result = E / f'{arm}-{name}-results.json'
            r = subprocess.run(['node', 'analysis/probe-m30-' + name + '.js'], cwd=ROOT,
                               env={**env, 'M80_RESULT': str(result), 'M115_RESULT': str(result), 'M111_RESULT': str(result)},
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
            (E / f'{arm}-{name}.txt').write_bytes(r.stdout)
            d = read(result) if result.exists() else {'pass': None, 'fail': None}
            print(f'{arm}/{name}: {d.get("pass")}/{d.get("fail")}, exit={r.returncode}', flush=True)
            arms[f'{arm}/{name}'] = {'pass': d.get('pass'), 'fail': d.get('fail'), 'exit_code': r.returncode}
        cres = E / f'{arm}-control-results.json'
        r = subprocess.run(['node', 'analysis/probe-m30-control.js'], cwd=ROOT,
                           env={**env, 'M30_CONTROL_MODE': mode, 'M30_RESULT': str(cres), 'M115_RESULT': str(cres), 'M111_RESULT': str(cres)},
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
        (E / f'{arm}-control.txt').write_bytes(r.stdout)
        d = read(cres) if cres.exists() else {'pass': None, 'fail': None}
        print(f'{arm}/control: {d.get("pass")}/{d.get("fail")}, exit={r.returncode}', flush=True)
        arms[f'{arm}/control'] = {'pass': d.get('pass'), 'fail': d.get('fail'), 'exit_code': r.returncode}
    (E / 'controls.json').write_text(json.dumps(arms, indent=2, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
