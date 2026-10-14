#!/usr/bin/env python3
"""M115 stage capture: four constructed runtime stages, their frozen guards and the harness hashes.

    python3 analysis/capture-m115-stages.py              # verify the frozen guards
    python3 analysis/capture-m115-stages.py --capture     # (re)write the guards from the work tree
    python3 analysis/capture-m115-stages.py --controls    # parent + counter-only control arms

The gap this milestone fixes is a missing COUNT, not missing data: the app already recorded all three
criteria Ep 32 names (the plan link on the trade, its own checklist rows and stop decision, and M85's
hash-verified journal acknowledgement) and counted none of them. So the stages are:

  `counter`       `src/challenge.js` alone — the count exists and can be computed, and NOTHING serves
                  it, no page shows it, and the settings route drops the trader's two declarations
                  (the fault this milestone fixes, staged from the real parent's own files)
  `wired`         + `src/routes/api.js` — the count rides the analytics payload and the two
                  declarations survive a settings save
  `card`          + the card view, the page's script tag and the dashboard mount — a trader can see
                  the count and set the target
  `documentation` + the three docs corrections (M17's reworded claim, M18's advisory/gating column,
                  M19's measured `aria-*` count)

Every stage tree is rebuilt from the saved patches and must match its frozen `<stage>-source.json`
byte-for-byte in BOTH directions; the delivered tree is 163 files against the parent's 161.
"""
import argparse, hashlib, json, runpy, shutil, subprocess, zipfile, tarfile, io
from pathlib import Path, PurePosixPath
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m115'
BASE_FULL = 'b87e85214e06509350d005506028a543ffc2468c'
BASE = 'b87e852'   # the committed M13/M65 release, by the abbreviation that resolves to BASE_FULL
PARENT = Path('/tmp/m115-parent/app')
COUNTER_STAGE = Path('/tmp/m115-counter-stage/app')
STAGES = ['counter', 'wired', 'card', 'documentation']
# The files each stage carries from the DELIVERED tree, cumulative. Everything not listed is the
# parent's own file, so the staged fault is the committed behaviour of the release being fixed.
FILES = {
    'counter': ['src/challenge.js'],
    'wired': ['src/challenge.js', 'src/routes/api.js'],
    'card': ['src/challenge.js', 'src/routes/api.js', 'public/js/views/challenge.js', 'public/index.html', 'public/js/views/dashboard.js'],
    'documentation': ['src/challenge.js', 'src/routes/api.js', 'public/js/views/challenge.js', 'public/index.html', 'public/js/views/dashboard.js',
                      'docs/PLAYLIST-CURRICULUM.md', 'docs/NOT-IMPLEMENTED.md'],
}
HARNESS = ['analysis/m115-test-support.js', 'analysis/probe-m115-pure.js', 'analysis/probe-m115-api.js', 'analysis/probe-m115-migration.js',
           'analysis/probe-m115-ui.js', 'analysis/probe-m115-control.js', 'analysis/run-m115-verification.py', 'analysis/capture-m115-stages.py',
           'analysis/build-m115-clean-reps-artifacts.py', 'analysis/M115-CLEAN-REPS.md']


def sha(b): return hashlib.sha256(b).hexdigest()


def run(args, cwd=ROOT): return subprocess.run(args, cwd=cwd, check=True, capture_output=True).stdout


def read(p): return json.loads(Path(p).read_text())


def allowed(p):
    return (not p.is_absolute() and '..' not in p.parts
            and not set(p.parts) & {'.git', 'node_modules', 'data', '__pycache__', 'fixtures', 'transcripts', 'independent'}
            and not str(p).startswith('.env') and not p.name.startswith('.env')
            and not __import__('re').search(r'\.(?:db|sqlite)(?:-|$)', p.name))


def manifest(tree):
    """The delivered tree from git (fixtures included, exactly as the M13/M65 artifact counts them);
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
    assert not (dest / 'src/challenge.js').exists() and (dest / 'src/periods.js').exists()
    return dest


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture', action='store_true'); ap.add_argument('--controls', action='store_true')
    a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    assert run(['git', 'rev-parse', BASE]).decode().strip() == BASE_FULL, 'the abbreviated parent must resolve to the pinned M13/M65 commit'
    current = manifest(APP)
    if a.capture:
        parent = materialise_parent(Path('/tmp/m115-capture-parent/app'))
        assert len(manifest(parent)) == 161, len(manifest(parent))
        (E / 'parent-source.json').write_text(json.dumps(manifest(parent), indent=2, sort_keys=True) + '\n')
        # Each stage guard is the parent's tree with (only) that stage's files replaced by the
        # delivered ones — rebuilt here, never hand-written.
        for stage in STAGES:
            tree = Path('/tmp/m115-capture-' + stage + '/app')
            if tree.exists(): shutil.rmtree(tree)
            shutil.copytree(parent, tree, symlinks=True)
            for rel in FILES[stage]: write(tree, rel, (APP / rel).read_bytes())
            (E / (stage + '-source.json')).write_text(json.dumps(manifest(tree), indent=2, sort_keys=True) + '\n')
            print(f'captured {stage}: {len(manifest(tree))} files', flush=True)
        (E / 'harness-source.json').write_text(json.dumps({p: sha((ROOT / p).read_bytes()) for p in HARNESS if (ROOT / p).exists()}, indent=2, sort_keys=True) + '\n')
        print(f'captured delivered tree: {len(current)} files; harness {len([p for p in HARNESS if (ROOT / p).exists()])} files', flush=True)
        return
    guards = {n: read(E / (n + '-source.json')) for n in ['parent'] + STAGES}
    assert len(guards['parent']) == 161 and len(current) == 163, (len(guards['parent']), len(current))
    assert [len(guards[s]) for s in STAGES] == [162, 162, 163, 163], {s: len(guards[s]) for s in STAGES}
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(p not in guards['parent'] for p in ['src/challenge.js', 'public/js/views/challenge.js']), 'the two added files must be NEW in this milestone'
    assert {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)} == {
        'src/challenge.js', 'public/js/views/challenge.js', 'src/routes/api.js', 'public/index.html', 'public/js/views/dashboard.js',
        'docs/PLAYLIST-CURRICULUM.md', 'docs/NOT-IMPLEMENTED.md'}, 'Unexpected changed-file set'
    # stage ordering: each stage's files are the delivered ones and every later file is still the parent's
    for i, stage in enumerate(STAGES):
        for rel in FILES[stage]:
            assert guards[stage][rel] == current[rel], ('the stage must carry the delivered file', stage, rel)
    for rel in ['src/routes/api.js', 'public/index.html', 'public/js/views/dashboard.js']:
        assert guards['counter'][rel] == guards['parent'][rel] and guards['counter'][rel] != current[rel], ('counter must carry the parent', rel)
    assert 'public/js/views/challenge.js' not in guards['counter'] and 'public/js/views/challenge.js' not in guards['parent'], 'the card view must not exist before the card stage'
    for rel in ['public/js/views/challenge.js', 'public/index.html', 'public/js/views/dashboard.js']:
        assert guards['wired'].get(rel) == guards['parent'].get(rel) and guards['wired'].get(rel) != current.get(rel), ('wired must not carry the card', rel)
    for rel in ['docs/PLAYLIST-CURRICULUM.md', 'docs/NOT-IMPLEMENTED.md']:
        assert guards['card'][rel] == guards['parent'][rel] and guards['card'][rel] != current[rel], ('card must not carry the docs correction', rel)
    assert {p for p in set(current) | set(guards['card']) if guards['card'].get(p) != current.get(p)} == {'docs/PLAYLIST-CURRICULUM.md', 'docs/NOT-IMPLEMENTED.md'}, 'Docs changed runtime'
    harness = read(E / 'harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    print(f'M115 stages verified: parent 161, counter/wired 162, card/documentation 163, delivered {len(current)}; harness {len(harness)} files frozen', flush=True)
    if not a.controls: return

    # The two control arms, measured by the UNCHANGED probes against trees built from the parent.
    parent = materialise_parent(PARENT)
    stage = materialise_parent(COUNTER_STAGE)
    run(['git', 'apply', str(ROOT / 'analysis/patches/m115-clean-reps-counter.patch')], cwd=stage)
    assert (stage / 'src/challenge.js').exists() and not (stage / 'public/js/views/challenge.js').exists(), 'the counter stage carries the count and nothing else'
    assert sha((stage / 'src/routes/api.js').read_bytes()) == sha((parent / 'src/routes/api.js').read_bytes()), 'the counter stage must NOT carry the wiring'
    arms = {}
    for arm, tree in (('parent', parent), ('counter-only', stage)):
        env = {**dict(__import__('os').environ), 'TJ_APP': str(tree), 'TJ_PARENT': str(parent), 'NODE_OPTIONS': '', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': ''}
        for name in ['pure', 'api', 'migration', 'ui']:
            result = E / f'{arm}-{name}-results.json'
            r = subprocess.run(['node', 'analysis/probe-m115-' + name + '.js'], cwd=ROOT, env={**env, 'M115_RESULT': str(result), 'M111_RESULT': str(result)}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
            (E / f'{arm}-{name}.txt').write_bytes(r.stdout)
            d = read(result) if result.exists() else {'pass': None, 'fail': None}
            print(f'{arm}/{name}: {d.get("pass")}/{d.get("fail")}, exit={r.returncode}', flush=True)
            arms[f'{arm}/{name}'] = {'pass': d.get('pass'), 'fail': d.get('fail'), 'exit_code': r.returncode}
        cres = E / f'{arm}-control-results.json'
        r = subprocess.run(['node', 'analysis/probe-m115-control.js'], cwd=ROOT,
                           env={**env, 'M115_CONTROL_MODE': 'parent' if arm == 'parent' else 'counter-only', 'M115_RESULT': str(cres), 'M111_RESULT': str(cres)},
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
        (E / f'{arm}-control.txt').write_bytes(r.stdout)
        d = read(cres) if cres.exists() else {'pass': None, 'fail': None}
        print(f'{arm}/control: {d.get("pass")}/{d.get("fail")}, exit={r.returncode}', flush=True)
        arms[f'{arm}/control'] = {'pass': d.get('pass'), 'fail': d.get('fail'), 'exit_code': r.returncode}
    (E / 'controls.json').write_text(json.dumps(arms, indent=2, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
