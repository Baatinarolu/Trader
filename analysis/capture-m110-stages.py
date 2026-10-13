#!/usr/bin/env python3
"""Capture the M110 stage trees, their source guards and the control runs.

M110 is delivered as one working tree, so the stages are *constructed* from the delivered files:
`policy` carries the two-clock module and the two account columns, `api` carries the two routes,
`engine` wires the asymmetric judgement into `analyse` and the veto, `hardening` closes the legacy
single knob in the module and the route, `ui` adds the two settings fields, `documentation` adds
the two docs. The `policy` and `api` stages intentionally carry the PRE-hardening behaviour — one
number still sets both sides, with the settle floor not applied to it, which is the recorded 6–12×
collapse — so the hardening stage is a measured fix rather than a claim.

    python3 analysis/capture-m110-stages.py
    python3 analysis/capture-m110-stages.py --controls
"""
from pathlib import Path
import hashlib, json, os, runpy, shutil, subprocess, sys
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m110'
H=runpy.run_path(str(ROOT/'analysis/build-m88-confluence-artifacts.py'),run_name='capture_helpers')
manifest=H['manifest'];write=H['write'];sha=H['sha'];read=H['read']
PARENT=Path('/tmp/m110-parent/app')
STAGES=[('policy',[]),('api',[]),('engine',[]),('hardening',[]),('ui',[]),('documentation',[])]
FILES={
 'policy':['src/news-window.js','src/db.js'],
 'api':['src/routes/bots.js','src/routes/api.js'],
 'engine':['src/bots/index.js','src/bots/setup.js'],
 'hardening':['src/news-window.js','src/routes/bots.js'],
 'ui':['public/js/views/settings.js'],
 'documentation':['README.md','docs/API.md'],
}
# The staged pre-hardening fault, as exact substitutions in the delivered files. Each is asserted
# to occur exactly once, so the control tree cannot silently drift from the tree it measures.
LOOSE_MODULE = """  // The old single knob, refused rather than reinterpreted — and refused FIRST, so it cannot be
  // smuggled in beside a valid pair and quietly ignored. Silently choosing a side for the caller
  // is precisely how a 5-minute setting shortened a 30–60 minute settle.
  if (LEGACY_SINGLE.some((k) => input[k] !== undefined)) {
    throw invalid('One number can no longer set both sides of the news rule. Set news_block_before_min (pre-release block) and news_settle_after_min (post-release settle, floor 30) separately.', 'news_window_split_required');
  }"""
LOOSE_MODULE_NEW = """  // PRE-HARDENING (staged fault): the old single knob still sets BOTH sides and the settle floor
  // is not applied to it, which is the recorded 6–12x collapse this milestone exists to remove.
  if (LEGACY_SINGLE.some((k) => input[k] !== undefined)) {
    const one = Number(input.window_min ?? input.windowMin ?? input.newsWindowMin ?? input.news_window_min ?? input.window);
    if (!Number.isInteger(one)) throw invalid('The news window needs whole minutes.', 'news_window_invalid');
    return {
      before_min: Math.min(Math.max(one, BEFORE.min), BEFORE.max),
      after_min: Math.max(1, Math.min(AFTER.max, one)),
      warnings: [], source: ['legacy_window:request', 'legacy_window:request'], clamped: [],
    };
  }"""
LOOSE_ROUTE = """    // Every spelling of the old single knob is refused here, not just `?window=`: a legacy client
    // that still sends one number must be told the rule was split, not silently served the stored
    // pair (which would make a 5-minute caller believe 5 minutes was applied).
    if (NewsWindow.LEGACY_SINGLE.some((k) => req.query[k] !== undefined)) {
      return res.status(400).json({
        error: 'One number no longer sets both sides of the news rule. Use ?before= for the pre-release block and ?after= for the post-release settle (floor 30 minutes), or leave both out to use the account settings.',
        code: 'news_window_split_required',
      });
    }"""
LOOSE_ROUTE_NEW = """    // PRE-HARDENING (staged fault): the legacy query is passed straight through to the module,
    // which still lets one number set both sides.
    const legacyWindow = ['window', 'window_min', 'windowMin', 'newsWindowMin', 'news_window_min']
      .reduce((v, k) => (v === undefined ? req.query[k] : v), undefined);"""
LOOSE_CALL = """      pair = NewsWindow.parsePair(
        { news_block_before_min: req.query.before, news_settle_after_min: req.query.after },
        NewsWindow.plan(account),
      );"""
LOOSE_CALL_NEW = """      pair = NewsWindow.parsePair(
        { news_block_before_min: req.query.before, news_settle_after_min: req.query.after, window: legacyWindow },
        NewsWindow.plan(account),
      );"""
def loose_module():
 s=(APP/'src/news-window.js').read_text()
 assert s.count(LOOSE_MODULE)==1
 return s.replace(LOOSE_MODULE,LOOSE_MODULE_NEW)
def loose_route():
 s=(APP/'src/routes/bots.js').read_text()
 assert s.count(LOOSE_ROUTE)==1
 s=s.replace(LOOSE_ROUTE,LOOSE_ROUTE_NEW)
 assert s.count(LOOSE_CALL)==1
 return s.replace(LOOSE_CALL,LOOSE_CALL_NEW)
def main():
 E.mkdir(parents=True,exist_ok=True)
 assert manifest(PARENT)==read('analysis/evidence/m110/parent-source.json'),'M110 parent tree changed'
 before=PARENT;guards={}
 for name,_ in STAGES:
  tree=Path(f'/tmp/m110-{name}-stage/app');shutil.rmtree(tree,ignore_errors=True);shutil.copytree(before,tree,symlinks=True,ignore=shutil.ignore_patterns('node_modules'))
  for rel in FILES[name]:
   data=(APP/rel).read_bytes()
   if rel=='src/news-window.js' and name in ('policy','api'):data=loose_module().encode()
   if rel=='src/routes/bots.js' and name=='api':data=loose_route().encode()
   write(tree,rel,data)
  guards[name]=manifest(tree);(E/f'{name}-source.json').write_text(json.dumps(guards[name],indent=2,sort_keys=True)+'\n')
  print(f'{name}: {len(guards[name])} files')
  before=tree
 (E/'release-source.json').write_text(json.dumps(guards['documentation'],indent=2,sort_keys=True)+'\n')
 assert guards['documentation']==manifest(APP),'release stage must equal the delivered tree'
 assert guards['ui']==guards['hardening'] or len(guards['ui'])>=len(guards['hardening'])
 # The pre-hardening control tree IS the engine stage (loose module + loose route, engine wired,
 # no view and no docs), so the measured control tree and the stage are asserted identical.
 pre=Path('/tmp/m110-pre-hardening/app');shutil.rmtree(pre,ignore_errors=True);shutil.copytree(Path('/tmp/m110-engine-stage/app'),pre,symlinks=True,ignore=shutil.ignore_patterns('node_modules'))
 assert manifest(pre)==guards['engine'],'the pre-hardening control tree must be the engine stage'
 (E/'pre-hardening-source.json').write_text(json.dumps(manifest(pre),indent=2,sort_keys=True)+'\n')
 print('pre-hardening control tree (= engine stage):',len(manifest(pre)),'files')
 harness={}
 for p in sorted((ROOT/'analysis').glob('*')):
  if p.is_file() and (p.name.startswith(('probe-m110-','m110-','run-m110-','build-m110-','capture-m110-')) or p.name in ('gen-progress.py','m109-test-support.js','calendar-shim.js')):
   harness[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 scan={}
 for p in sorted(ROOT.glob('analysis/patches/*m110*')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 for p in sorted(ROOT.glob('analysis/*[mM]110*.md')):scan[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
 (E/'harness-source.json').write_text(json.dumps({**harness,**scan},indent=2,sort_keys=True)+'\n')
 print('harness files:',len(harness)+len(scan))

# ------------------------------------------------------------------ control runs
# The unchanged M110 probes on the feature-absent parent runtime (the committed M109 release, which
# has the single symmetric knob and no news settings at all), and on the pre-hardening runtime where
# the module and the route still let one number set both sides.
CONTROLS=[('pure',PARENT),('api',PARENT),('engine',PARENT),('consumers',PARENT),('freshness',PARENT),('hardening',PARENT),('portable',PARENT),('migration',PARENT),('ui',PARENT)]
LOOSE=[('api',Path('/tmp/m110-pre-hardening/app')),('hardening',Path('/tmp/m110-pre-hardening/app'))]
def ensure_modules(tree):
 link=Path(tree)/'node_modules'
 if not link.exists():link.symlink_to(APP/'node_modules',target_is_directory=True)
def run_probe(name,tree,prefix):
 ensure_modules(tree);result=E/f'{prefix}-{name}-results.json';text=E/f'{prefix}-{name}.txt'
 env={**os.environ,'TJ_APP':str(tree),'TJ_PARENT':str(PARENT),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M110_RESULT':str(result)}
 if result.exists():result.unlink()
 r=subprocess.run(['node','analysis/probe-m110-'+name+'.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=300)
 text.write_bytes(r.stdout)
 if not result.exists():raise AssertionError(f'{prefix}/{name} wrote no result file:\n{r.stdout.decode()[-2000:]}')
 d=json.loads(result.read_text())
 print(f'{prefix} {name} (on {Path(tree).parent.name}): {d["pass"]}/{d["fail"]}, exit={r.returncode}',flush=True)
 return {'pass':d['pass'],'fail':d['fail'],'exit_code':r.returncode}
def controls():
 parent={}
 for name,tree in CONTROLS:
  counts=run_probe(name,tree,'parent');parent[name]={'tree':'the delivered parent (the committed M109 release) with the single symmetric knob, no news module and no news settings','script':'analysis/probe-m110-'+name+'.js',**counts,'output':f'parent-{name}.txt','scope':'The unchanged M110 probe on the feature-absent parent runtime: one hardcoded 45-minute number tested with Math.abs on both sides, no account setting, no module and no column. Every assertion that needs the two clocks is a measured negative.'}
 (E/'parent-controls.json').write_text(json.dumps(parent,indent=2)+'\n')
 print('parent controls:',{k:(v['pass'],v['fail']) for k,v in parent.items()},flush=True)
 pre={}
 for name,tree in LOOSE:
  counts=run_probe(name,tree,'pre-hardening');pre[name]={'tree':'the delivered runtime with the pre-hardening module and route (the engine stage itself)','script':'analysis/probe-m110-'+name+'.js',**counts,'output':f'pre-hardening-{name}.txt','scope':'The unchanged M110 probes on the pre-hardening runtime: one number still sets both sides with the settle floor not applied to it, and the legacy query is passed through instead of refused. The hardening stage closed both and the same probes are green on the delivered tree.'}
 (E/'pre-hardening-controls.json').write_text(json.dumps(pre,indent=2)+'\n')
 print('pre-hardening controls:',{k:(v['pass'],v['fail']) for k,v in pre.items()},flush=True)
if __name__=='__main__':
 if '--controls' in sys.argv:controls()
 else:main()
