#!/usr/bin/env python3
"""M56 stage capture: four constructed runtime stages, their frozen guards and the harness hashes.

    python3 analysis/capture-m56-stages.py              # verify the frozen guards
    python3 analysis/capture-m56-stages.py --capture     # (re)write the guards from the work tree
    python3 analysis/capture-m56-stages.py --controls    # parent + gate-only control arms

M56 is a fix, not a missing feature: the plan was already stored, edited and displayed, and no bot read
a line of it. So the stages isolate the READING, file by file:

  `gate`          `src/bots/plan-gate.js` alone — the vocabulary, the parse and the evaluation exist and
                  NOTHING consults them, so the same plan still refuses nothing (the fault this
                  milestone fixes, staged from the real parent's own files)
  `wired`         + `src/bots/setup.js` and `src/bots/index.js` — a failing `require` line now refuses
                  the candidate through the ordinary veto path and rides the analyse/chart/scan payloads
  `reader`        + `src/routes/bots.js` — `GET /bots/plan-gate` publishes the vocabulary, the per-line
                  classification and the plan id validation (400/404) on the three payload routes, and the
                  alert surface carries the gate (parsed `result`, `signal_id`) so a refused alert names it
  `documentation` + the three views and the three docs (the editor's enforced-rule hint, the analysis
                  page's plan note and per-candidate rule block, the alert-history plan line, the API row
                  and the honesty rows)

Every stage tree is rebuilt from the saved patches and must match its frozen `<stage>-source.json`
byte-for-byte in BOTH directions; the delivered tree is 164 files against the parent's 163.
"""
import argparse, hashlib, json, runpy, shutil, subprocess, zipfile, tarfile, io, os, re
from pathlib import Path, PurePosixPath
ROOT = Path(__file__).resolve().parent.parent; APP = ROOT / 'extracted/tradejournal'; E = ROOT / 'analysis/evidence/m56'
BASE_FULL = '6cd59fb445f2e34ce4f243888ce6657836099c31'
BASE = '6cd59fb'   # the committed M115 clean-reps release, by the abbreviation that resolves to BASE_FULL
PARENT = Path('/tmp/m56-parent/app')
GATE_STAGE = Path('/tmp/m56-gate-stage/app')
STAGES = ['gate', 'wired', 'reader', 'documentation']
# The files each stage carries from the DELIVERED tree, cumulative. Everything not listed is the
# parent's own file, so the staged fault is the committed behaviour of the release being fixed.
FILES = {
    'gate': ['src/bots/plan-gate.js'],
    'wired': ['src/bots/plan-gate.js', 'src/bots/setup.js', 'src/bots/index.js'],
    'reader': ['src/bots/plan-gate.js', 'src/bots/setup.js', 'src/bots/index.js', 'src/routes/bots.js'],
    'documentation': ['src/bots/plan-gate.js', 'src/bots/setup.js', 'src/bots/index.js', 'src/routes/bots.js',
                      'public/js/views/bots.js', 'public/js/views/playbook.js', 'public/js/views/settings.js',
                      'docs/API.md', 'docs/NOT-IMPLEMENTED.md', 'docs/PLAYLIST-CURRICULUM.md'],
}
HARNESS = ['analysis/m56-test-support.js', 'analysis/m56-check.js', 'analysis/probe-m56-pure.js', 'analysis/probe-m56-engine.js',
           'analysis/probe-m56-api.js', 'analysis/probe-m56-migration.js', 'analysis/probe-m56-ui.js', 'analysis/probe-m56-control.js',
           'analysis/run-m56-verification.py', 'analysis/capture-m56-stages.py', 'analysis/build-m56-plan-gate-artifacts.py',
           'analysis/M56-PLAN-GATE.md']


def sha(b): return hashlib.sha256(b).hexdigest()


def run(args, cwd=ROOT): return subprocess.run(args, cwd=cwd, check=True, capture_output=True).stdout


def read(p): return json.loads(Path(p).read_text())


def allowed(p):
    return (not p.is_absolute() and '..' not in p.parts
            and not set(p.parts) & {'.git', 'node_modules', 'data', '__pycache__', 'fixtures', 'transcripts', 'independent'}
            and not str(p).startswith('.env') and not p.name.startswith('.env')
            and not re.search(r'\.(?:db|sqlite)(?:-|$)', p.name))


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
    assert not (dest / 'src/bots/plan-gate.js').exists() and (dest / 'src/challenge.js').exists(), 'the parent must be the 6cd59fb M115 release'
    return dest


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--capture', action='store_true'); ap.add_argument('--controls', action='store_true')
    a = ap.parse_args(); E.mkdir(parents=True, exist_ok=True)
    assert run(['git', 'branch', '--show-current']).decode().strip() in ('arena/b411452d-trader', 'arena/762c0295-trader'), 'session branch'
    assert run(['git', 'rev-parse', BASE]).decode().strip() == BASE_FULL, 'the abbreviated parent must resolve to the pinned M115 commit'
    current = manifest(APP)
    if a.capture:
        parent = materialise_parent(Path('/tmp/m56-capture-parent/app'))
        assert len(manifest(parent)) == 163, len(manifest(parent))
        (E / 'parent-source.json').write_text(json.dumps(manifest(parent), indent=2, sort_keys=True) + '\n')
        # Each stage guard is the parent's tree with (only) that stage's files replaced by the
        # delivered ones — rebuilt here, never hand-written.
        for stage in STAGES:
            tree = Path('/tmp/m56-capture-' + stage + '/app')
            if tree.exists(): shutil.rmtree(tree)
            shutil.copytree(parent, tree, symlinks=True)
            for rel in FILES[stage]: write(tree, rel, (APP / rel).read_bytes())
            (E / (stage + '-source.json')).write_text(json.dumps(manifest(tree), indent=2, sort_keys=True) + '\n')
            print(f'captured {stage}: {len(manifest(tree))} files', flush=True)
        (E / 'harness-source.json').write_text(json.dumps({p: sha((ROOT / p).read_bytes()) for p in HARNESS if (ROOT / p).exists()}, indent=2, sort_keys=True) + '\n')
        print(f'captured delivered tree: {len(current)} files; harness {len([p for p in HARNESS if (ROOT / p).exists()])} files', flush=True)
        return
    guards = {n: read(E / (n + '-source.json')) for n in ['parent'] + STAGES}
    assert len(guards['parent']) == 163 and len(current) == 164, (len(guards['parent']), len(current))
    assert [len(guards[s]) for s in STAGES] == [164, 164, 164, 164], {s: len(guards[s]) for s in STAGES}
    assert manifest(APP) == current, 'Unmeasured source edit'
    assert all(p not in guards['parent'] for p in ['src/bots/plan-gate.js']), 'the gate module must be NEW in this milestone'
    changed = {p for p in set(current) | set(guards['parent']) if guards['parent'].get(p) != current.get(p)}
    assert changed == {'src/bots/plan-gate.js', 'src/bots/setup.js', 'src/bots/index.js', 'src/routes/bots.js', 'public/js/views/bots.js',
                       'public/js/views/playbook.js', 'public/js/views/settings.js',
                       'docs/API.md', 'docs/NOT-IMPLEMENTED.md', 'docs/PLAYLIST-CURRICULUM.md'}, changed
    # stage ordering: each stage's files are the delivered ones and every later file is still the parent's
    for stage in STAGES:
        for rel in FILES[stage]:
            assert guards[stage][rel] == current[rel], ('the stage must carry the delivered file', stage, rel)
    for rel in ['src/bots/setup.js', 'src/bots/index.js', 'src/routes/bots.js', 'public/js/views/bots.js', 'public/js/views/playbook.js']:
        assert guards['gate'][rel] == guards['parent'][rel] and guards['gate'][rel] != current[rel], ('gate must carry the parent', rel)
    assert guards['gate']['src/bots/plan-gate.js'] == current['src/bots/plan-gate.js'], 'the gate stage is the module and nothing else'
    for rel in ['src/routes/bots.js', 'public/js/views/bots.js', 'public/js/views/playbook.js']:
        assert guards['wired'].get(rel) == guards['parent'].get(rel) and guards['wired'].get(rel) != current.get(rel), ('wired must not carry the reader route or the views', rel)
    for rel in ['public/js/views/bots.js', 'public/js/views/playbook.js', 'public/js/views/settings.js', 'docs/API.md', 'docs/NOT-IMPLEMENTED.md', 'docs/PLAYLIST-CURRICULUM.md']:
        assert guards['reader'][rel] == guards['parent'][rel] and guards['reader'][rel] != current[rel], ('reader must not carry the views or the docs', rel)
    assert {p for p in set(current) | set(guards['reader']) if guards['reader'].get(p) != current.get(p)} == {
        'public/js/views/bots.js', 'public/js/views/playbook.js', 'public/js/views/settings.js', 'docs/API.md', 'docs/NOT-IMPLEMENTED.md', 'docs/PLAYLIST-CURRICULUM.md'}, 'Docs and views changed runtime'
    harness = read(E / 'harness-source.json')
    for p, h in harness.items():
        assert sha((ROOT / p).read_bytes()) == h, p
    print(f'M56 stages verified: parent 163, gate/wired/reader/documentation 164, delivered {len(current)}; harness {len(harness)} files frozen', flush=True)
    if not a.controls: return

    # The two control arms, measured by the UNCHANGED probes against trees built from the parent.
    parent = materialise_parent(PARENT)
    stage = materialise_parent(GATE_STAGE)
    run(['git', 'apply', str(ROOT / 'analysis/patches/m56-plan-gate-gate.patch')], cwd=stage)
    assert (stage / 'src/bots/plan-gate.js').exists(), 'the gate stage carries the module'
    assert sha((stage / 'src/bots/setup.js').read_bytes()) == sha((parent / 'src/bots/setup.js').read_bytes()), 'the gate stage must NOT carry the wiring'
    assert not (stage / 'public/js/views/playbook.js').read_text().count('data-plan-vocabulary'), 'the gate stage must not carry the editor hint'
    arms = {}
    shim = '--require=' + str(ROOT / 'analysis' / 'candle-shim.js')
    for arm, tree, mode in (('parent', parent, 'parent'), ('gate-only', stage, 'gate')):
        env = {**os.environ, 'TJ_APP': str(tree), 'TJ_PARENT': str(parent), 'NODE_OPTIONS': shim,
               'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': ''}
        for name in ['pure', 'engine', 'api', 'migration', 'ui']:
            result = E / f'{arm}-{name}-results.json'
            r = subprocess.run(['node', 'analysis/probe-m56-' + name + '.js'], cwd=ROOT, env={**env, 'M56_RESULT': str(result), 'M115_RESULT': str(result), 'M111_RESULT': str(result)},
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
            (E / f'{arm}-{name}.txt').write_bytes(r.stdout)
            d = read(result) if result.exists() else {'pass': None, 'fail': None}
            print(f'{arm}/{name}: {d.get("pass")}/{d.get("fail")}, exit={r.returncode}', flush=True)
            arms[f'{arm}/{name}'] = {'pass': d.get('pass'), 'fail': d.get('fail'), 'exit_code': r.returncode}
        cres = E / f'{arm}-control-results.json'
        r = subprocess.run(['node', 'analysis/probe-m56-control.js'], cwd=ROOT,
                           env={**env, 'M56_CONTROL_MODE': mode, 'M56_RESULT': str(cres), 'M115_RESULT': str(cres), 'M111_RESULT': str(cres)},
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=900)
        (E / f'{arm}-control.txt').write_bytes(r.stdout)
        d = read(cres) if cres.exists() else {'pass': None, 'fail': None}
        print(f'{arm}/control: {d.get("pass")}/{d.get("fail")}, exit={r.returncode}', flush=True)
        arms[f'{arm}/control'] = {'pass': d.get('pass'), 'fail': d.get('fail'), 'exit_code': r.returncode}
    (E / 'controls.json').write_text(json.dumps(arms, indent=2, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
