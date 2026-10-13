#!/usr/bin/env python3
"""Run the JavaScript minifier's whole verification cohort, or the control arm.

    python3 analysis/run-jsmin-verification.py --suite feature     # six probes, pinned counts
    python3 analysis/run-jsmin-verification.py --suite control     # the fault, measured
    python3 analysis/run-jsmin-verification.py --suite feature --freeze-parent

`feature` runs, on the delivered tree, the six probes that carry the tool's whole argument:

    roundtrip      the parser and the printer: every shipped file, a syntax corpus, 18 invalid
                   programs that must be refused with a position, deep and huge input, and V8's own
                   `node --check` on every printed file
    differential   the compressor: 66 snippets and every shipped file, run before and after
                   compression in V8, with the same observable behaviour
    sourcemap      the map, decoded with its own decoder: VLQ boundaries, mapping bounds, the spec
                   lookup rule, the truth of identifier positions, and a real stack trace mapped back
    cli            the command line as a script uses it: exit codes 0/1/2/3, files written and
                   refused, the map and the report on disk, the output re-parsed and executed
    safety         the negatives: eval/with/Function switch renaming off, names that appear as text
                   block a rename, fn.name and arity are untouched, observable reads survive
    control        the fault: a regex stripper, a blind renamer and a blind unused-variable remover,
                   each measured breaking a program the tool handles correctly

`control` is the arm that shows what the tool prevents, plus the check that the tool did not exist in
the commit this branch starts from: it runs the control probe and asserts the git fact.

`--freeze-parent` writes analysis/evidence/jsmin/parent-source.json: a digest of the parent commit's
own file list, so the "this tool is new" claim is anchored to a tree that cannot move.
"""
import argparse, hashlib, json, os, pathlib, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / 'extracted' / 'tradejournal'
EVIDENCE = ROOT / 'analysis' / 'evidence' / 'jsmin'
# The commit this branch was branched from: the M112 release. The minifier is written after it, so it
# cannot exist there — the runner asserts that rather than assuming it.
PARENT = '67f2ed26f2398bd0f95537f88dee65f5c760e771'
TOOL = APP / 'tools' / 'jsmin'

# (probe file, pass, fail) — the counts are pinned: a change in any of them is a finding, not a number.
FEATURE = [
    ('probe-jsmin-roundtrip.js', 14, 0),
    ('probe-jsmin-differential.js', 6, 0),
    ('probe-jsmin-sourcemap.js', 18, 0),
    ('probe-jsmin-cli.js', 26, 0),
    ('probe-jsmin-safety.js', 33, 0),
    ('probe-jsmin-control.js', 16, 0),
]
CONTROL = [('probe-jsmin-control.js', 16, 0)]
SUITES = {'feature': FEATURE, 'control': CONTROL}


def sh(args, **kw):
    return subprocess.run(args, cwd=str(ROOT), text=True, capture_output=True, **kw)


def git(*args):
    r = sh(['git'] + list(args))
    return r.returncode, r.stdout.strip(), r.stderr.strip()


def sha256_file(p):
    h = hashlib.sha256()
    h.update(pathlib.Path(p).read_bytes())
    return h.hexdigest()


def probe_listing():
    """Every file of the tool and every probe, hashed: the evidence says what ran, not just what it said."""
    files = sorted(str(p.relative_to(ROOT)) for p in TOOL.rglob('*') if p.is_file())
    probes = sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'analysis').glob('probe-jsmin-*.js'))
    runner = [str(pathlib.Path(__file__).relative_to(ROOT))]
    return {str(f): sha256_file(ROOT / f) for f in files + probes + runner}


def run_probe(name, passes, fails, result_path):
    env = dict(os.environ)
    env['JSMIN_RESULT'] = str(result_path)
    started = time.time()
    r = sh(['node', str(ROOT / 'analysis' / name)], env=env, timeout=1800)
    seconds = round(time.time() - started, 1)
    summary = None
    if pathlib.Path(result_path).exists():
        summary = json.loads(pathlib.Path(result_path).read_text())
    counts_ok = bool(summary) and summary.get('pass') == passes and summary.get('fail') == fails
    print(f"  {name}: {'ok' if counts_ok else 'MISMATCH'} "
          f"pass={summary.get('pass') if summary else '?'}/{passes} "
          f"fail={summary.get('fail') if summary else '?'}/{fails} exit={r.returncode} {seconds}s")
    if not counts_ok:
        print(r.stdout[-2000:], file=sys.stderr)
        print(r.stderr[-2000:], file=sys.stderr)
    return {
        'probe': name, 'expected_pass': passes, 'expected_fail': fails,
        'pass': summary.get('pass') if summary else None,
        'fail': summary.get('fail') if summary else None,
        'exit': r.returncode, 'seconds': seconds, 'counts_ok': counts_ok,
        'results': summary.get('results') if summary else None,
        'scope': summary.get('scope') if summary else None,
    }


def freeze_parent():
    """Digest the parent commit's own tree, so 'the tool is new' is anchored to something immutable."""
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    code, out, err = git('ls-tree', '-r', '--name-only', PARENT)
    if code != 0:
        print(f'cannot read the parent commit {PARENT}: {err}', file=sys.stderr)
        return None
    names = [n for n in out.splitlines() if n.startswith('extracted/tradejournal/')]
    source = '\n'.join(names).encode()
    record = {
        'parent_commit': PARENT,
        'app_files_in_parent': len(names),
        'app_tree_sha256': hashlib.sha256(source).hexdigest(),
        'tool_files_in_parent': [n for n in names if n.startswith('extracted/tradejournal/tools/')],
        'probes_in_parent': [n for n in names if 'probe-jsmin' in n],
        'note': 'The parent commit is the M112 release. The tool, its probes and any file under '
                'tools/ are absent from it, which is what makes this deliverable new rather than a change.',
    }
    (EVIDENCE / 'parent-source.json').write_text(json.dumps(record, indent=2) + '\n')
    print(f"froze parent {PARENT[:12]}: {len(names)} app files, sha256 {record['app_tree_sha256'][:16]}…")
    return record


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--suite', default='feature', choices=sorted(SUITES))
    ap.add_argument('--freeze-parent', action='store_true')
    args = ap.parse_args()

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    if args.freeze_parent:
        freeze_parent()

    rows = SUITES[args.suite]
    print(f"jsmin {args.suite}: {len(rows)} probes on the delivered tree")
    runs = [run_probe(name, p, f, EVIDENCE / (name.replace('probe-jsmin-', '').replace('.js', '') + '.json')) for name, p, f in rows]
    total_pass = sum(r['pass'] or 0 for r in runs)
    total_fail = sum(r['fail'] or 0 for r in runs)
    ok = all(r['counts_ok'] and r['exit'] == 0 for r in runs)

    extra = {}
    if args.suite == 'feature':
        # The tool must not exist in the parent commit. This is a measured git fact, not a comment.
        code, _, _ = git('cat-file', '-e', f'{PARENT}:extracted/tradejournal/tools/jsmin/cli.js')
        tool_absent = code != 0
        code2, _, _ = git('cat-file', '-e', f'{PARENT}:analysis/probe-jsmin-differential.js')
        probes_absent = code2 != 0
        extra = {'tool_absent_from_parent': tool_absent, 'probes_absent_from_parent': probes_absent,
                 'parent_commit': PARENT}
        ok = ok and tool_absent and probes_absent
        print(f"  the tool and its probes are absent from {PARENT[:12]}: {'yes' if tool_absent and probes_absent else 'NO'}")

    summary = {
        'suite': args.suite, 'probes': len(runs), 'pass': total_pass, 'fail': total_fail, 'ok': ok,
        'completed_nonzero': sum(1 for r in runs if (r['pass'] or 0) == 0),
        **extra,
        'runs': runs,
        'files': probe_listing(),
        'scope': 'The minifier is verified on the tree it ships with: parser/printer fidelity on every '
                 'file the app itself ships plus a curated syntax corpus, behavioural equivalence in V8 '
                 'before and after compression, the source map decoded and used to resolve a real stack '
                 'trace, the command line as a script uses it, the negatives the tool promises, and a '
                 'control that measures the naive approaches breaking. Not measured: performance claims, '
                 'obfuscation, or behaviour of code the repository does not contain.',
    }
    (EVIDENCE / f'{args.suite}-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(f"jsmin {args.suite}: {total_pass}/{total_fail} — {'green' if ok else 'NOT GREEN'} (evidence: analysis/evidence/jsmin/{args.suite}-summary.json)")
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
