#!/usr/bin/env python3
"""Capture the M109 stage trees, their source guards and the control runs.

M109 is delivered as one working tree, so the stages are *constructed* from the delivered
files: `policy` carries the advisory module, `api` adds the two routes, `hardening` carries
the final module, `ui` adds the card and its wiring, `documentation` adds the two docs. The
`policy` stage intentionally carries the PRE-hardening module — a read path that goes through
M108's own practice reader (which creates its lazy timer row), counts a row it cannot read
back as a recorded session, and swallows an unparseable retained-stop payload as "no stops" —
so the later hardening stage is a measured fix rather than a claim.

    python3 analysis/capture-m109-stages.py
    python3 analysis/capture-m109-stages.py --controls
"""
from pathlib import Path
import hashlib, json, os, runpy, shutil, subprocess, sys
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m109'
H=runpy.run_path(str(ROOT/'analysis/build-m88-confluence-artifacts.py'),run_name='capture_helpers')
manifest=H['manifest'];write=H['write'];sha=H['sha'];read=H['read']
PARENT=Path('/tmp/m109-parent/app')
STAGES=[('policy',[]),('api',[]),('hardening',[]),('ui',[]),('documentation',[])]
FILES={
 'policy':['src/ask.js'],
 'api':['src/routes/api.js'],
 'hardening':['src/ask.js'],
 'ui':['public/index.html','public/js/views/ask.js','public/js/views/dashboard.js'],
 'documentation':['README.md','docs/API.md'],
}
# The three pre-hardening faults, as exact substitutions in the delivered module. Each is
# asserted to occur exactly once, so the control tree cannot silently drift from the tree it
# is supposed to measure.
LOOSE_READ = """  const practiceSessions = await db.prepare('SELECT * FROM practice_sessions WHERE user_id=? AND day=? ORDER BY id').all(userId, day);
  const practiceTimer = await db.prepare('SELECT * FROM practice_timers WHERE user_id=?').get(userId) || null;"""
LOOSE_READ_NEW = """  const practice = await Practice.optional(userId, { nowMs });
  const practiceSessions = [].concat(practice.sessions || [], practice.archives || []);
  const practiceTimer = practice.timer && practice.timer.state && practice.timer.state !== 'idle' ? practice.timer : null;"""
LOOSE_COUNT = """  const unreadable = rows.filter((r) => !Number.isSafeInteger(r.elapsed_ms) || r.elapsed_ms < 0);
  const readable = rows.filter((r) => Number.isSafeInteger(r.elapsed_ms) && r.elapsed_ms >= 0);
  const recorded = readable.filter((r) => r.source !== 'imported_unverified');
  const archives = readable.filter((r) => r.source === 'imported_unverified');
  const seconds = recorded.reduce((n, r) => n + Math.floor(r.elapsed_ms / 1000), 0);"""
LOOSE_COUNT_NEW = """  const unreadable = [];
  const recorded = rows;
  const archives = [];
  const seconds = recorded.reduce((n, r) => n + Math.floor((Number(r.elapsed_ms) || 0) / 1000), 0);"""
LOOSE_STOPS = """  let stops = {};
  if (ctx.state) { try { stops = JSON.parse(ctx.state.stops_json) || {}; } catch { return lines.concat([unavailable('The stored retained-stop state could not be read, so today\\'s stops are unknown here — not "none".', 'guardrail_day_state:stops_json')]); } }"""
LOOSE_STOPS_NEW = """  let stops = {};
  if (ctx.state) { try { stops = JSON.parse(ctx.state.stops_json) || {}; } catch { stops = {}; } }"""
def loose_ask():
 s=(APP/'src/ask.js').read_text()
 assert s.count(LOOSE_READ)==1
 s=s.replace(LOOSE_READ,LOOSE_READ_NEW)
 assert s.count("const StateGate = require('./state-gate');")==1
 s=s.replace("const StateGate = require('./state-gate');","const StateGate = require('./state-gate');\nconst Practice = require('./practice');")
 assert s.count(LOOSE_COUNT)==1
 s=s.replace(LOOSE_COUNT,LOOSE_COUNT_NEW)
 assert s.count(LOOSE_STOPS)==1
 s=s.replace(LOOSE_STOPS,LOOSE_STOPS_NEW)
 return s
def main():
 E.mkdir(parents=True,exist_ok=True)
 assert manifest(PARENT)==read('analysis/evidence/m109/parent-source.json'),'M109 parent tree changed'
 before=PARENT;guards={}
 for name,_ in STAGES:
  tree=Path(f'/tmp/m109-{name}-stage/app');shutil.rmtree(tree,ignore_errors=True);shutil.copytree(before,tree,symlinks=True,ignore=shutil.ignore_patterns('node_modules'))
  for rel in FILES[name]:
   data=(APP/rel).read_bytes()
   if name=='policy' and rel=='src/ask.js':data=loose_ask().encode()
   write(tree,rel,data)
  guards[name]=manifest(tree);(E/f'{name}-source.json').write_text(json.dumps(guards[name],indent=2,sort_keys=True)+'\n')
  print(f'{name}: {len(guards[name])} files')
  before=tree
 (E/'release-source.json').write_text(json.dumps(guards['documentation'],indent=2,sort_keys=True)+'\n')
 assert guards['documentation']==manifest(APP),'release stage must equal the delivered tree'
 assert guards['api']==read('analysis/evidence/m109/api-source.json'),'api stage must equal the released route wiring'
 # The pre-hardening control tree IS the api stage (loose module + routes, no view), so the
 # measured control tree and the stage are asserted identical rather than copied twice.
 pre=Path('/tmp/m109-pre-hardening/app');shutil.rmtree(pre,ignore_errors=True);shutil.copytree(Path('/tmp/m109-api-stage/app'),pre,symlinks=True,ignore=shutil.ignore_patterns('node_modules'))
 assert manifest(pre)==guards['api'],'the pre-hardening control tree must be the api stage'
 (E/'pre-hardening-source.json').write_text(json.dumps(manifest(pre),indent=2,sort_keys=True)+'\n')
 print('pre-hardening control tree (= api stage):',len(manifest(pre)),'files')
 harness={}
 for p in sorted((ROOT/'analysis').glob('*')):
  if p.is_file() and (p.name.startswith(('probe-m109-','m109-','run-m109-','build-m109-','capture-m109-')) or p.name in ('gen-progress.py','m108-test-support.js')):
   harness[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 scan={}
 for p in sorted(ROOT.glob('analysis/patches/*m109*')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 for p in sorted(ROOT.glob('analysis/*[mM]109*.md')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 (E/'harness-source.json').write_text(json.dumps({**harness,**scan},indent=2,sort_keys=True)+'\n')
 print('harness files:',len(harness)+len(scan))

# ------------------------------------------------------------------ control runs
# The unchanged M109 probes on the feature-absent parent runtime, and on the pre-hardening
# runtime where the module itself has the three staged faults.
CONTROLS=[('api',PARENT),('consumers',PARENT),('freshness',PARENT),('portable',PARENT),('migration',PARENT),('ui',PARENT),('archive-ui',PARENT)]
LOOSE=[('hardening',Path('/tmp/m109-pre-hardening/app')),('pure',Path('/tmp/m109-pre-hardening/app'))]
def ensure_modules(tree):
 link=Path(tree)/'node_modules'
 if not link.exists():link.symlink_to(APP/'node_modules',target_is_directory=True)
def run_probe(name,tree,prefix):
 ensure_modules(tree);result=E/f'{prefix}-{name}-results.json';text=E/f'{prefix}-{name}.txt'
 env={**os.environ,'TJ_APP':str(tree),'TJ_PARENT':str(PARENT),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M109_RESULT':str(result)}
 r=subprocess.run(['node','analysis/probe-m109-'+name+'.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=300)
 text.write_bytes(r.stdout)
 if not result.exists():raise AssertionError(f'{prefix}/{name} wrote no result file:\n{r.stdout.decode()[-2000:]}')
 d=json.loads(result.read_text())
 print(f'{prefix} {name} (on {Path(tree).parent.name}): {d["pass"]}/{d["fail"]}, exit={r.returncode}',flush=True)
 return {'pass':d['pass'],'fail':d['fail'],'exit_code':r.returncode}
def controls():
 parent={}
 for name,tree in CONTROLS:
  counts=run_probe(name,tree,'parent');parent[name]={'tree':'the delivered parent (M108 release) with no advisory module and no /ask surface','script':'analysis/probe-m109-'+name+'.js',**counts,'output':f'parent-{name}.txt','scope':'The unchanged M109 probe on the feature-absent parent runtime: no advisory module, no /ask route and no card. Every assertion that needs the channel is a measured negative.'}
 (E/'parent-controls.json').write_text(json.dumps(parent,indent=2)+'\n')
 print('parent controls:',{k:(v['pass'],v['fail']) for k,v in parent.items()},flush=True)
 pre={}
 for name,tree in LOOSE:
  counts=run_probe(name,tree,'pre-hardening');pre[name]={'tree':'the delivered runtime with the pre-hardening advisory module (the api stage itself)','script':'analysis/probe-m109-'+name+'.js',**counts,'output':f'pre-hardening-{name}.txt','scope':'The unchanged M109 probes on the pre-hardening runtime: the module reads practice through M108 own reader (creating its lazy timer row), counts a row it cannot read back as a recorded session, and reports an unparseable retained-stop payload as no stops. The hardening stage made all three honest and both probes are green on the delivered tree.'}
 (E/'pre-hardening-controls.json').write_text(json.dumps(pre,indent=2)+'\n')
 print('pre-hardening controls:',{k:(v['pass'],v['fail']) for k,v in pre.items()},flush=True)
if __name__=='__main__':
 if '--controls' in sys.argv:controls()
 else:main()
