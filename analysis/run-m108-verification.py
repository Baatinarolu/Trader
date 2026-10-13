#!/usr/bin/env python3
"""M108 practice-log actual tests + the separate unchanged M107 intention feature and
prior M106 execution/gate, routine, RAW, DECLARED, live-provider and offline cohorts.
Results are never merged into a fake integrated pass; negative artifacts stay preserved by
suite.

The M108 parent is the committed M107 release tree; the inherited M107 parent is the
committed M106 release tree and every older parent is rebuilt from it by the saved reverse
patches and asserted against the frozen parent-source.json proofs, so no historic Git
object is required.
"""
from pathlib import Path
import argparse, concurrent.futures, hashlib, io, json, os, runpy, shutil, subprocess, tarfile
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m108'
PRIOR=runpy.run_path(str(ROOT/'analysis/run-m107-verification.py'),run_name='m108_prior_m107_helpers')
OLD=PRIOR['OLD'];M87=PRIOR['M87'];read=PRIOR['read'];digest=PRIOR['digest'];materialise=PRIOR['materialise']
M88_FEATURE=PRIOR['M88_FEATURE'];M89_FEATURE=PRIOR['M89_FEATURE'];M91_FEATURE=PRIOR['M91_FEATURE'];M93_FEATURE=PRIOR['M93_FEATURE'];M99_FEATURE=PRIOR['M99_FEATURE'];M100_FEATURE=PRIOR['M100_FEATURE'];M104_FEATURE=PRIOR['M104_FEATURE'];M105_FEATURE=PRIOR['M105_FEATURE'];M106_FEATURE=PRIOR['M106_FEATURE']
M106_TREE_FEATURE=[(n,sc,p-1 if n=='migration' else p) for n,sc,p in M106_FEATURE]
M107_PARENT=PRIOR['M107_PARENT'];M106_PARENT=PRIOR['M106_PARENT'];M105_PARENT=PRIOR['M105_PARENT'];M108_PARENT=Path('/tmp/m108-parent/app')
# The frozen M106 migration probe asserts the M106-only schema delta, so M107's own additive
# table is exactly one declared, milestone-scoped negative there — retained, never merged.
M106_FEATURE_ON_TREE=[(n,sc,(p-1 if n=='migration' else p),(1 if n=='migration' else 0)) for n,sc,p in M106_FEATURE]
# The frozen M107 migration probe asserts the M107-only schema delta, so M108's own additive
# objects are a declared, milestone-scoped negative there — retained, never merged.
M107_FEATURE_ON_TREE=[(n,sc,(p-1 if n=='migration' else p),(1 if n=='migration' else 0)) for n,sc,p in PRIOR['M107_FEATURE']]
M108_FEATURE=[('pure','probe-m108-pure.js',71),('api','probe-m108-api.js',49),('consumers','probe-m108-consumers.js',15),('ui','probe-m108-ui.js',29),('freshness','probe-m108-freshness.js',15),('hardening','probe-m108-hardening.js',28),('portable','probe-m108-portable.js',16),('archive-ui','probe-m108-archive-ui.js',15),('migration','probe-m108-migration.js',21)]
SUITES=['feature','m107feature','m106feature','m105feature','screenshots','confluences','emotions','process','behavior','reviews','opportunities','changes','execution','routine','raw','declared','pure','offline','market']
def freeze_m108_parent():
 OLD['freeze']('8a2cfd5edd8330056eb1ebcee8687f96dd8628eb',str(M108_PARENT));E.mkdir(parents=True,exist_ok=True);guard=E/'parent-source.json';d=digest(M108_PARENT)
 if guard.exists():assert d==read('analysis/evidence/m108/parent-source.json'),'M108 parent tree changed'
 else:guard.write_text(json.dumps(d,indent=2,sort_keys=True)+'\n');print(f'created parent-source.json from the actual 8a2cfd5 release tree ({len(d)} files)',flush=True)
def freeze_parents():
 freeze_m108_parent();PRIOR['freeze_parents']()
 info={'method':'Actual 8a2cfd5 M107 Git release as the M108 parent, the inherited M107 parent (the 4d13078 M106 release), the M106 parent and every older source by saved reverse patches asserted against the frozen parent-source.json proofs (missing historic Git objects are never required); no guessed schema/current module in any parent.','parents':{str(M108_PARENT):{'files':len(digest(M108_PARENT)),'byte_differences':0},**read('analysis/evidence/m107/regression-parents.json')['parents']}}
 (E/'regression-parents.json').write_text(json.dumps(info,indent=2)+'\n')
def feature(row,parent=M108_PARENT,prefix='feature'):
 n,s,p,*rest=row;expect_fail=rest[0] if rest else 0;result=E/(prefix+'-'+n+'-results.json');env={**os.environ,'TJ_APP':str(APP),'TJ_PARENT':str(parent),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M108_RESULT':str(result),'M107_RESULT':str(result),'M106_RESULT':str(result),'M105_RESULT':str(result)}
 run=subprocess.run(['node','analysis/'+s],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180);output=prefix+'-'+n+'.txt';(E/output).write_bytes(run.stdout);d=json.loads(result.read_text());out={'name':n,'script':'analysis/'+s,'pass':d['pass'],'fail':d['fail'],'expected_pass':p,'expected_fail':expect_fail,'exit_code':run.returncode,'status':'completed','output':output,'scope':d['scope']};print(f'{prefix}/{n}: {out["pass"]}/{out["fail"]}, exit={run.returncode}',flush=True);return out

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--suite',required=True,choices=SUITES);ap.add_argument('--freeze-parents',action='store_true');ap.add_argument('--only',help='Rerun one script substring and merge same-source existing suite; old negatives retained separately');a=ap.parse_args();E.mkdir(parents=True,exist_ok=True)
 if a.freeze_parents:freeze_parents()
 if a.suite=='screenshots':
  feature_fn=M87['feature'];feature_fn.__globals__['E']=E/'screenshots';(E/'screenshots').mkdir(exist_ok=True)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(feature_fn,M87['FEATURE']))
  for row in outs:row['output']='screenshots/'+row['output']
 elif a.suite in ['confluences','emotions','process','behavior','reviews','opportunities','changes']:
  prior_name,feats,name={'confluences':('run-m88-verification.py',M88_FEATURE,'prior_confluence_helpers'),'emotions':('run-m89-verification.py',M89_FEATURE,'prior_emotion_helpers'),'process':('run-m91-verification.py',M91_FEATURE,'prior_process_helpers'),'behavior':('run-m93-verification.py',M93_FEATURE,'prior_behavior_helpers'),'reviews':('run-m99-verification.py',M99_FEATURE,'prior_review_helpers'),'opportunities':('run-m100-verification.py',M100_FEATURE,'prior_opportunity_helpers'),'changes':('run-m104-verification.py',M104_FEATURE,'prior_change_helpers')}[a.suite]
  prior=runpy.run_path(str(ROOT/'analysis'/prior_name),run_name=name);fn=prior['feature'];fn.__globals__['E']=E/a.suite;(E/a.suite).mkdir(exist_ok=True)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(fn,feats))
  for row in outs:row['output']=a.suite+'/'+row['output']
 elif a.suite=='feature':
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(feature,M108_FEATURE))
 elif a.suite=='m107feature':
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(lambda r:feature(r,M107_PARENT,'m107feature'),M107_FEATURE_ON_TREE))
 elif a.suite=='m106feature':
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(lambda r:feature(r,M106_PARENT,'m106feature'),M106_FEATURE_ON_TREE))
 elif a.suite=='m105feature':
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(lambda r:feature(r,M105_PARENT,'m105feature'),M105_FEATURE))
 else:
  suite='feature' if a.suite=='execution' else a.suite
  if a.suite=='execution':rows=[{'name':n,'script':'analysis/'+s,'expected_pass':p} for n,s,p in OLD['FEATURE']];folder=E/'execution';folder.mkdir(exist_ok=True)
  elif a.suite=='routine':rows=[{'name':r['name'],'script':r['script'],'expected_pass':r['pass']} for r in read('analysis/evidence/m64/feature-summary.json')['probes']];folder=E
  elif a.suite in ['raw','declared']:rows=[{k:r[k] for k in ['script','group'] if k in r} for r in read('analysis/evidence/m64/'+('original' if a.suite=='raw' else 'isolated')+'-regression-runs.json')];folder=E
  elif a.suite=='offline':rows=[{'script':p} for p in ['scripts/now-test.js','scripts/topdown-test.js','scripts/chart-test.js','analysis/probe-m71-saved-settings.js']];folder=E
  else:rows=[{'script':r['script']} for r in read('analysis/evidence/m64/'+('pure' if a.suite=='pure' else 'isolated-market')+'-regression-runs.json')];folder=E
  if a.only:rows=[r for r in rows if a.only in r['script']];assert len(rows)==1
  OLD['run'].__globals__['E']=folder
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(lambda r:OLD['run'](r,suite),rows))
  if a.suite=='execution':
   for row in outs:row['output']='execution/'+row['output'];row['scope']='Unchanged prior M86/M92 actual tests on M93, no prerequisite adapter; declared literal/clock/DOM only'
 if a.only:
  updates={r['script']:r for r in outs};outs=[updates.get(r['script'],r) for r in read('analysis/evidence/m108/'+a.suite+'-runs.json')]
 total={'pass':sum(r['pass'] or 0 for r in outs),'fail':sum(r['fail'] or 0 for r in outs),'probes':len(outs),'completed_nonzero':sum(r['exit_code'] is not None and r['exit_code']!=0 for r in outs),'timeout_no_exit':sum(r['exit_code'] is None for r in outs),'summaryless':sum(r['pass'] is None or r['fail'] is None for r in outs),'scope':'REPORTED completed assertions; literal clocks/journals/DOM only. Feature/m106feature/execution/routine no prerequisite adapter; RAW failures/early aborts and DECLARED assumptions remain SEPARATE. No chart/broker/provider/pixel/meditation/edge/production proof.','runs':outs}
 (E/(a.suite+'-runs.json')).write_text(json.dumps(outs,indent=2)+'\n');(E/(a.suite+'-summary.json')).write_text(json.dumps(total,indent=2)+'\n');print(json.dumps({k:v for k,v in total.items() if k!='runs'},indent=2))
 if a.suite in ['m105feature','m106feature','m107feature']:
  # A frozen migration probe asserts its own milestone's schema delta, so each later
  # milestone's additive objects are one declared, milestone-scoped negative — retained
  # and reported, never merged away. Every other assertion must still reproduce exactly.
  assert all(r['pass']==r['expected_pass'] and r['fail']==r['expected_fail'] for r in outs)
 elif a.suite in ['feature','execution','routine']:assert all(r['pass']==r['expected_pass'] and r['fail']==0 and r['exit_code']==0 for r in outs)
if __name__=='__main__':main()
