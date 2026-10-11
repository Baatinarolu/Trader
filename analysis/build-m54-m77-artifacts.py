#!/usr/bin/env python3
"""Verify M54/M77 stage patches, rebuild pristine diff and the fixed source ZIP.

First build only:
  python3 analysis/build-m54-m77-artifacts.py --measured-app /path/to/frozen/app
Subsequent builds use the durable measured-stage patch, not /tmp snapshots:
  python3 analysis/build-m54-m77-artifacts.py

Never modifies the repository's .git, live app, credentials, or databases. All
application/reconstruction scratch trees are fresh temporary directories. The
ZIP contains source and audit evidence, not dependencies or downloaded datasets.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import io
import json
import re
import shutil
import subprocess
import tarfile
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'extracted/tradejournal'
PATCHES = ROOT / 'analysis/patches'
BASE = 'c326651'
MEASURED_CORE = {
    'src/bots/setup.js': '4277b3b59d7a16e763ce706964d6e04bde531bc3ba81748c86f8883b96c9c9d8',
    'src/bots/targets.js': '5fa3d5cb24859bd04f2eb9fa9e66968d8ae4e5c896c9308b5e7cfaa99cad3598',
    'src/bots/topdown.js': 'db3ae2a3049187418c9fa91788a40f1245ea2bc97947549ef875eaac3857ed9d',
}
STAGES = ['m54-addition-only', 'm54-complete', 'm77-alignment-only',
          'm77-complete-measured', 'm77-defensive-measured', 'm77-final']


def run(args, cwd=ROOT):
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True).stdout


def sha(data):
    return hashlib.sha256(data).hexdigest()


def allowed(p):
    return (not p.is_absolute() and '..' not in p.parts
            and not set(p.parts) & {'.git', 'node_modules', 'data', '__pycache__',
                                   'fixtures', 'transcripts', 'independent'}
            and not p.name.startswith('.env')
            and not re.search(r'\.(?:db|sqlite)(?:-|$)', p.name))


def contents(tree):
    return {str(p.relative_to(tree)): p.read_bytes()
            for p in sorted(tree.rglob('*')) if p.is_file()}


def tree_sha(tree):
    h = hashlib.sha256()
    for p, data in contents(tree).items():
        h.update(p.encode() + b'\0' + bytes.fromhex(sha(data)))
    return h.hexdigest()


def write_entry(dest, rel, data):
    rel = PurePosixPath(rel)
    assert not rel.is_absolute() and '..' not in rel.parts, rel
    path = dest / str(rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def apply(tree, patch):
    run(['git', 'apply', '--check', str(patch)], tree)
    run(['git', 'apply', str(patch)], tree)


def make_patch(before, after, output):
    # Fresh trees also avoid git apply discovering the outer repository root.
    with tempfile.TemporaryDirectory(prefix='tj-patch-') as td:
        work = Path(td)
        shutil.copytree(before, work / 'a')
        shutil.copytree(after, work / 'b')
        r = subprocess.run(['git', 'diff', '--no-index', '--binary', '--', 'a', 'b'],
                           cwd=work, capture_output=True)
        assert r.returncode == 1, r.stderr.decode()
        text = r.stdout.decode()
        text = re.sub(r'diff --git a/[ab]/([^\n]+?) b/[ab]/([^\n]+)',
                      r'diff --git a/\1 b/\2', text)
        text = re.sub(r'(?m)^--- a/[ab]/', '--- a/', text)
        text = re.sub(r'(?m)^\+\+\+ b/[ab]/', '+++ b/', text)
        output.write_text(text)
        apply(work / 'a', output)
        assert contents(work / 'a') == contents(work / 'b'), output.name
        run(['git', 'apply', '-R', '--check', str(output)], work / 'a')
        run(['git', 'apply', '-R', str(output)], work / 'a')
        assert contents(work / 'a') == contents(before), output.name + ' reverse'
    return text.encode()


def patch_meta(patch, tree):
    data = patch.read_bytes()
    return {'files': data.count(b'diff --git '), 'bytes': len(data), 'sha256': sha(data),
            'roundtrip_differences': 0, 'app_tree_sha256': tree_sha(tree),
            'core_sha256': {p: sha((tree / p).read_bytes())
                            for p in MEASURED_CORE if (tree / p).is_file()}}


def add_zip(z, name, data):
    info = zipfile.ZipInfo(name, date_time=(2026, 10, 11, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    z.writestr(info, data)


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--measured-app', type=Path)
    opts = args.parse_args()
    tracked = run(['git', 'ls-files', '-z', 'extracted/tradejournal']).decode().split('\0')
    paths = sorted({str(PurePosixPath(p).relative_to('extracted/tradejournal'))
                    for p in tracked if p} | {'src/bots/targets.js'})
    # Fixture source code IS part of the standalone app, unlike downloaded OHLC.
    assert all(allowed(PurePosixPath(p)) or p.startswith('scripts/fixtures/')
               for p in paths)
    for line in (ROOT / 'analysis/evidence/m54-m77/final-source-sha256.txt').read_text().splitlines():
        digest, rel = line.split('  ', 1)
        assert sha((APP / rel).read_bytes()) == digest, 'Final measured source changed: ' + rel

    with tempfile.TemporaryDirectory(prefix='tj-m54-m77-') as td:
        work = Path(td)
        parent = work / 'parent'
        parent.mkdir()
        archive = run(['git', 'archive', BASE, 'extracted/tradejournal'])
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            for entry in tar:
                if entry.isfile():
                    rel = str(PurePosixPath(entry.name).relative_to('extracted/tradejournal'))
                    assert allowed(PurePosixPath(rel)) or rel.startswith('scripts/fixtures/'), rel
                    write_entry(parent, rel, tar.extractfile(entry).read())
        current = work / 'current'
        shutil.copytree(parent, current)
        for rel in paths:
            src = APP / rel
            if src.is_file():
                write_entry(current, rel, src.read_bytes())
            elif (current / rel).exists():
                (current / rel).unlink()

        measured_patch = PATCHES / 'm77-complete-measured.patch'
        if opts.measured_app:
            measured = work / 'measured-bootstrap'
            shutil.copytree(parent, measured)
            for rel in paths:
                src = opts.measured_app / rel
                if src.is_file():
                    write_entry(measured, rel, src.read_bytes())
            for rel, digest in MEASURED_CORE.items():
                assert sha((measured / rel).read_bytes()) == digest, rel
            # Presentation was restored from the immutable alignment snapshot;
            # only the exact-RR helper differed in the original measured core.
            alignment = work / 'alignment-bootstrap'
            shutil.copytree(parent, alignment)
            apply(alignment, PATCHES / 'm77-alignment-only.patch')
            assert (measured / 'public/js/views/bots.js').read_bytes() == (
                alignment / 'public/js/views/bots.js').read_bytes()
            make_patch(parent, measured, measured_patch)
        assert measured_patch.is_file(), 'First build needs --measured-app'
        make_patch(parent, current, PATCHES / 'm77-final.patch')

        manifest = {'base_commit': run(['git', 'rev-parse', BASE]).decode().strip(),
                    'pristine_zip': 'tradingpro-main.zip',
                    'pristine_zip_sha256': sha((ROOT / 'tradingpro-main.zip').read_bytes()),
                    'patches': {}}
        stage_trees = {}
        for name in STAGES:
            tree = work / name
            shutil.copytree(parent, tree)
            patch = PATCHES / (name + '.patch')
            apply(tree, patch)
            # Reverse application is another independent reconstruction check.
            reverse = work / (name + '-reverse')
            shutil.copytree(tree, reverse)
            run(['git', 'apply', '-R', '--check', str(patch)], reverse)
            run(['git', 'apply', '-R', str(patch)], reverse)
            assert contents(reverse) == contents(parent), name
            manifest['patches'][name] = patch_meta(patch, tree)
            stage_trees[name] = tree
        assert contents(stage_trees['m77-final']) == contents(current)
        for rel, digest in MEASURED_CORE.items():
            assert sha((stage_trees['m77-complete-measured'] / rel).read_bytes()) == digest
        post = PATCHES / 'm77-post-measurement.patch'
        make_patch(stage_trees['m77-complete-measured'], current, post)
        manifest['patches']['m77-post-measurement'] = {
            **patch_meta(post, current), 'base_stage': 'm77-complete-measured'}

        pristine = work / 'pristine'
        pristine.mkdir()
        with zipfile.ZipFile(ROOT / 'tradingpro-main.zip') as z:
            for entry in z.infolist():
                if not entry.is_dir() and entry.filename.startswith('tradejournal/'):
                    rel = PurePosixPath(entry.filename).relative_to('tradejournal')
                    if allowed(rel) or str(rel).startswith('scripts/fixtures/'):
                        write_entry(pristine, str(rel), z.read(entry))
        fixed = work / 'fixed'
        shutil.copytree(pristine, fixed)
        for rel in paths:
            src = APP / rel
            if src.is_file():
                write_entry(fixed, rel, src.read_bytes())
            elif (fixed / rel).exists():
                (fixed / rel).unlink()
        cumulative = PATCHES / 'applied-so-far.patch'
        make_patch(pristine, fixed, cumulative)
        manifest['patches']['pristine'] = patch_meta(cumulative, fixed)
        manifest['measurement_notes'] = [
            'Core hashes identify immutable measured stages; raw results live in analysis/evidence/m54-m77.',
            'Measured-complete UI restored from alignment snapshot after a presentation-only overwrite.',
            'Defensive measured core reran all four profiles: entire stdout identical except numeric runtime.',
            'Last headline-only correction has 216 comparisons, 0 candidate/non-headline differences; no extra outcome run claimed.',
            'm77-final is cumulative from c326651; post-measurement applies on the measured-complete stage.',
        ]
        manifest['fixed_zip'] = {'source_files': len(contents(fixed)),
                                 'roundtrip_differences': 0,
                                 'package_lock': 'unchanged from pristine ZIP',
                                 'excludes': ['.git', '.env*', 'databases', 'node_modules',
                                              'downloaded fixtures/transcripts']}
        (PATCHES / 'M54-M77-STAGES.json').write_text(json.dumps(manifest, indent=2) + '\n')

        final_zip = ROOT / 'tradingpro-fixed.zip'
        audit_paths = run(['git', 'ls-files', '--cached', '--others', '--exclude-standard',
                           '-z', 'analysis']).decode().split('\0')
        with zipfile.ZipFile(final_zip, 'w') as z:
            for rel, data in contents(fixed).items():
                add_zip(z, 'tradingpro-fixed/tradejournal/' + rel, data)
            for rel in sorted(set(p for p in audit_paths if p)):
                p = ROOT / rel
                if p.is_file() and allowed(PurePosixPath(rel)):
                    add_zip(z, 'tradingpro-fixed/' + rel, p.read_bytes())
        with zipfile.ZipFile(final_zip) as z:
            actual = {n.removeprefix('tradingpro-fixed/tradejournal/'): z.read(n)
                      for n in z.namelist() if n.startswith('tradingpro-fixed/tradejournal/')}
            assert actual == contents(fixed), 'ZIP source round trip differs'
            assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n
                           or re.search(r'\.(?:db|sqlite)(?:-|$)', n) for n in z.namelist())
        print(json.dumps({n: {k: v for k, v in m.items() if k in
                              ['files', 'bytes', 'sha256', 'roundtrip_differences']}
                          for n, m in manifest['patches'].items()}, indent=2))
        print('Fixed ZIP:', len(actual), 'source files; 0 round-trip differences;',
              final_zip.stat().st_size, 'bytes; sha256', sha(final_zip.read_bytes()))


if __name__ == '__main__':
    main()
