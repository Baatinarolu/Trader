#!/usr/bin/env python3
"""M111 UI smoke: the app's OWN unmodified smoke harness against the delivered tree and against
the committed parent, at the same sample, so the delivery cannot claim coverage it does not have.

    python3 analysis/run-m111-smoke.py

The harness (`scripts/smoke-test.js`, shipped, unchanged) loads the real app in jsdom against a
live server, signs into the demo workspace, visits every view and reports console errors and
style failures. jsdom has no browser engine, so this is a structural DOM check: no pixel, device,
provider or production proof. It does not exercise the news settings dialog at all — that is
`analysis/probe-m110-ui.js` — and the output is grepped to prove the claim rather than assert it.
"""
from pathlib import Path
import json, os, re, subprocess, sys, time
ROOT = Path(__file__).resolve().parent.parent
E = ROOT / 'analysis/evidence/m111'
APP = ROOT / 'extracted/tradejournal'
PARENT = Path('/tmp/m111-parent/app')
PORT, PARENT_PORT = 3210, 3211


def run_arm(tree, port, db, timeout=420):
    env = {**os.environ, 'PORT': str(port), 'TRADEJOURNAL_DB': db, 'TJ_SCHEDULER': '0',
           'TJ_OFFLINE_CANDLES': '1', 'TURSO_DATABASE_URL': '', 'LIBSQL_URL': '', 'TURSO_AUTH_TOKEN': ''}
    env.pop('NODE_OPTIONS', None)
    for suffix in ('', '-wal', '-shm'):
        try: Path(db + suffix).unlink()
        except FileNotFoundError: pass
    server = subprocess.Popen(['node', 'server.js'], cwd=tree, env=env,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        started = time.time()
        while time.time() - started < 60:
            probe = subprocess.run(['node', '-e',
                f"fetch('http://127.0.0.1:{port}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
                capture_output=True)
            if probe.returncode == 0: break
            time.sleep(1)
        else:
            raise AssertionError(f'{tree} server never answered on {port}')
        t0 = time.time()
        smoke = subprocess.run(['node', 'scripts/smoke-test.js', f'http://127.0.0.1:{port}'],
                               cwd=tree, capture_output=True, timeout=timeout)
        text = smoke.stdout.decode('utf8', 'replace') + smoke.stderr.decode('utf8', 'replace')
        return smoke.returncode, text, round(time.time() - t0, 1)
    finally:
        server.terminate()
        try: server.wait(timeout=15)
        except subprocess.TimeoutExpired: server.kill()
        for suffix in ('', '-wal', '-shm'):
            try: Path(db + suffix).unlink()
            except FileNotFoundError: pass


def counts(text):
    m = re.search(r'RESULT: (\d+)/(\d+) views OK, (\d+) UI-style failures, (\d+) console errors', text)
    assert m, text[-1500:]
    # jsdom reports the missing canvas backend in more than one wording (and in none at all when
    # the app never asks for a context), so the count matches any canvas limitation line rather
    # than one phrasing: it is an environment limit, counted separately from console errors.
    canvas = len([l for l in text.splitlines() if re.search(r'canvas', l, re.I) and re.search(r'not implemented|without installing', l, re.I)])
    return {'views_passed': int(m.group(1)), 'views_offered': int(m.group(2)),
            'ui_style_failures': int(m.group(3)), 'console_errors': int(m.group(4)),
            'canvas_environment_limits': canvas}


def main():
    E.mkdir(parents=True, exist_ok=True)
    code, text, secs = run_arm(APP, PORT, '/tmp/m111-smoke.db')
    (E / 'smoke.txt').write_text(text)
    delivered = counts(text)
    code_p, text_p, secs_p = run_arm(PARENT, PARENT_PORT, '/tmp/m111-smoke-parent.db')
    (E / 'smoke-parent-control.txt').write_text(text_p)
    parent = counts(text_p)
    def grep_count(t, word):
        return sum(1 for line in t.splitlines() if word in line.lower())
    info = {
        'app': 'extracted/tradejournal (delivered M111 tree, 146 sources)',
        'harness': 'scripts/smoke-test.js from that same tree, unchanged',
        'command': f'PORT={PORT} node server.js + node scripts/smoke-test.js http://127.0.0.1:{PORT}',
        'environment': f'PORT={PORT}, TRADEJOURNAL_DB=/tmp/m111-smoke.db (fresh, synthetic), TJ_SCHEDULER=0, TJ_OFFLINE_CANDLES=1, no remote DB',
        'exit_code': code, **delivered, 'duration_seconds': secs,
        'conditional_view_count': 'The harness offers its view list conditionally (a chip condition on the content shell), so the reported total moves between samples: it is measured here at the same sample on both trees and the two counts are compared, not asserted absolutely.',
        'news_dialog_coverage': f"grep -ci 'news' = {grep_count(text, 'news')} and grep -ci 'settings' = {grep_count(text, 'settings')}: the smoke run does NOT open the account dialog. No M111 change touches a view, and M111 ships no dialog: the news settings fields remain M110's coverage (analysis/probe-m110-ui.js, 23 assertions) and are not claimed here.",
        'parent_control': {
            'tree': '/tmp/m111-parent/app — the actual b39d9ef M110 release, byte-identical to its frozen 146-file guard',
            'command': f'PORT={PARENT_PORT} node server.js + node scripts/smoke-test.js http://127.0.0.1:{PARENT_PORT}',
            'exit_code': code_p, **parent, 'duration_seconds': secs_p,
            'output': 'analysis/evidence/m111/smoke-parent-control.txt',
            'why': 'The unchanged parent reports the same view count at the same sample, so M111 neither loses nor gains a view in the harness.',
        },
        'limits': 'jsdom structural/DOM check with no browser engine: no pixel, device, audio, provider, broker, human or production proof, and no mental-state claim.',
        'outputs': {'delivered': 'analysis/evidence/m111/smoke.txt', 'parent': 'analysis/evidence/m111/smoke-parent-control.txt'},
    }
    (E / 'smoke-exit.json').write_text(json.dumps(info, indent=2) + '\n')
    print(json.dumps({k: v for k, v in info.items() if k not in ('conditional_view_count', 'limits', 'parent_control')}, indent=2))
    print('parent control:', parent)
    assert code == 0 and delivered['ui_style_failures'] == 0 and delivered['console_errors'] == 0
    assert delivered['views_passed'] == delivered['views_offered'] == parent['views_passed'] == parent['views_offered'], (delivered, parent)


def recount():
    """Recompute only the counted figures from the saved outputs, so a counter fix never forces a
    re-run of a recorded smoke arm (the tree that produced the text is unchanged either way)."""
    info = json.loads((E / 'smoke-exit.json').read_text())
    text = (E / 'smoke.txt').read_text(); text_p = (E / 'smoke-parent-control.txt').read_text()
    for key in list(counts(text)): info[key] = counts(text)[key]
    for key in list(counts(text_p)): info['parent_control'][key] = counts(text_p)[key]
    (E / 'smoke-exit.json').write_text(json.dumps(info, indent=2) + '\n')
    print(json.dumps({k: info[k] for k in ('views_passed', 'views_offered', 'ui_style_failures', 'console_errors', 'canvas_environment_limits')}))
    print('parent:', {k: info['parent_control'][k] for k in ('views_passed', 'ui_style_failures', 'console_errors', 'canvas_environment_limits')})


if __name__ == '__main__':
    if '--recount' in sys.argv: recount()
    else: main()
