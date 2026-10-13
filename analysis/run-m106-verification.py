#!/usr/bin/env python3
"""M106 four-question state-gate actual tests + separate unchanged M105 feature and
prior execution, routine, RAW, DECLARED, live-provider and offline cohorts. Results
never merged into a fake integrated pass. Source/negative artifacts preserved by suite.

The M106 parent is the committed M105 release tree; every older parent is rebuilt from
it by the saved reverse patches and asserted against the frozen parent-source.json
proofs, so no historic Git object is required.
"""
from pathlib import Path
import argparse, concurrent.futures, hashlib, io, json, os, runpy, shutil, subprocess, tarfile
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m106'
PRIOR=runpy.run_path(str(ROOT/'analysis/run-m105-verification.py'),run_name='m106_prior_m105_helpers')
OLD=PRIOR['OLD'];M87=PRIOR['M87'];read=PRIOR['read'];digest=PRIOR['digest'];materialise=PRIOR['materialise'];KEEP=PRIOR['KEEP'] if 'KEEP' in PRIOR else {}
M88_FEATURE=PRIOR['M88_FEATURE'];M89_FEATURE=PRIOR['M89_FEATURE'];M91_FEATURE=PRIOR['M91_FEATURE'];M93_FEATURE=PRIOR['M93_FEATURE'];M99_FEATURE=PRIOR['M99_FEATURE'];M100_FEATURE=PRIOR['M100_FEATURE'];M104_FEATURE=PRIOR['M104_FEATURE'];M105_FEATURE=PRIOR['FEATURE']
M106_PARENT=Path('/tmp/m106-parent/app');M105_PARENT=Path('/tmp/m105-parent/app')
M105_FEATURE=[(n,sc,12 if n=='migration' else p,1 if n=='migration' else 0) for n,sc,p in M105_FEATURE]
M106_FEATURE=[('pure','probe-m106-pure.js',42),('api','probe-m106-api.js',24),('gate','probe-m106-gate.js',104),('entry','probe-m106-entry.js',24),('ui','probe-m106-ui.js',19),('freshness','probe-m106-freshness.js',22),('hardening','probe-m106-hardening.js',26),('portable','probe-m106-portable.js',23),('archive-ui','probe-m106-archive-ui.js',16),('migration','probe-m106-migration.js',18)]
SUITES=['feature','m105feature','screenshots','confluences','emotions','process','behavior','reviews','opportunities','changes','execution','routine','raw','declared','pure','offline','market']
def freeze_m106_parent():
 OLD['freeze']('6f0783c34f5f3c30f02efbf1043dbf3065d91339',str(M106_PARENT));assert digest(M106_PARENT)==read('analysis/evidence/m106/parent-source.json')
def freeze_parents():
 freeze_m106_parent()
 materialise(M106_PARENT,M105_PARENT,['m105-identity-theme-complete.patch'],'analysis/evidence/m105/parent-source.json')
 materialise(M105_PARENT,'/tmp/m104-parent/app',['m104-rule-changes-complete.patch'],'analysis/evidence/m104/parent-source.json')
 materialise(Path('/tmp/m104-parent/app'),'/tmp/m100-parent/app',['m100-opportunities-complete.patch'],'analysis/evidence/m100/parent-source.json')
 materialise(Path('/tmp/m100-parent/app'),'/tmp/m99-parent/app',['m99-m101-reviews-complete.patch'],'analysis/evidence/m99/parent-source.json')
 materialise(Path('/tmp/m99-parent/app'),'/tmp/m93-parent/app',['m93-daily-behavior-complete.patch'],'analysis/evidence/m93/parent-source.json')
 materialise(Path('/tmp/m93-parent/app'),'/tmp/m91-parent/app',['m91-process-outcomes-complete.patch'],'analysis/evidence/m91/parent-source.json')
 materialise(Path('/tmp/m91-parent/app'),'/tmp/m89-parent/app',['m89-emotions-complete.patch'],'analysis/evidence/m89/parent-source.json')
 materialise(Path('/tmp/m89-parent/app'),'/tmp/m88-parent/app',['m88-confluences-complete.patch'],'analysis/evidence/m88/parent-source.json')
 materialise(Path('/tmp/m88-parent/app'),'/tmp/m87-parent/app',['m87-screenshots-complete.patch'],'analysis/evidence/m87/parent-source.json')
 materialise(Path('/tmp/m87-parent/app'),'/tmp/m86-parent/app',['m86-m92-execution-complete.patch'],'analysis/evidence/m86/parent-source.json')
 materialise(Path('/tmp/m86-parent/app'),'/tmp/m64-parent/app',['m64-routine-complete.patch'],'analysis/evidence/m64/parent-source.json')
 materialise(Path('/tmp/m64-parent/app'),'/tmp/m84-parent/app',['m84-m85-complete.patch'],'analysis/evidence/m84/parent-source.json')
 materialise(Path('/tmp/m84-parent/app'),'/tmp/m81-parent/app',['m81-m82-complete.patch'],'analysis/evidence/m81/parent-source.json')
 OLD['freeze_legacy']()
 info={'method':'Actual 6f0783c M105 Git release as the M106 parent, every older source by saved reverse patches asserted against the frozen parent-source.json proofs (missing historic Git objects are never required); no guessed schema/current module in any parent.','parents':{str(p):{'files':len(digest(Path(p))),'byte_differences':0} for p in [str(M106_PARENT),str(M105_PARENT),'/tmp/m104-parent/app','/tmp/m100-parent/app','/tmp/m99-parent/app','/tmp/m93-parent/app','/tmp/m91-parent/app','/tmp/m89-parent/app','/tmp/m88-parent/app','/tmp/m87-parent/app','/tmp/m86-parent/app','/tmp/m64-parent/app','/tmp/m79-parent/extracted/tradejournal','/tmp/m84-parent/app','/tmp/m81-parent/app']}}
 (E/'regression-parents.json').write_text(json.dumps(info,indent=2)+'\n')
def feature(row,parent=M106_PARENT,prefix='feature'):
 n,s,p,*rest=row;expect_fail=rest[0] if rest else 0;result=E/(prefix+'-'+n+'-results.json');env={**os.environ,'TJ_APP':str(APP),'TJ_PARENT':str(parent),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M106_RESULT':str(result),'M105_RESULT':str(result)}
 run=subprocess.run(['node','analysis/'+s],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120);output=prefix+'-'+n+'.txt';(E/output).write_bytes(run.stdout);d=json.loads(result.read_text());out={'name':n,'script':'analysis/'+s,'pass':d['pass'],'fail':d['fail'],'expected_pass':p,'expected_fail':expect_fail,'exit_code':run.returncode,'status':'completed','output':output,'scope':d['scope']};print(f'{prefix}/{n}: {out["pass"]}/{out["fail"]}, exit={run.returncode}',flush=True);return out

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
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(feature,M106_FEATURE))
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
  updates={r['script']:r for r in outs};outs=[updates.get(r['script'],r) for r in read('analysis/evidence/m106/'+a.suite+'-runs.json')]
 total={'pass':sum(r['pass'] or 0 for r in outs),'fail':sum(r['fail'] or 0 for r in outs),'probes':len(outs),'completed_nonzero':sum(r['exit_code'] is not None and r['exit_code']!=0 for r in outs),'timeout_no_exit':sum(r['exit_code'] is None for r in outs),'summaryless':sum(r['pass'] is None or r['fail'] is None for r in outs),'scope':'REPORTED completed assertions; literal clocks/journals/DOM only. Feature/m105feature/execution/routine no prerequisite adapter; RAW failures/early aborts and DECLARED assumptions remain SEPARATE. No chart/broker/provider/pixel/meditation/edge/production proof.','runs':outs}
 (E/(a.suite+'-runs.json')).write_text(json.dumps(outs,indent=2)+'\n');(E/(a.suite+'-summary.json')).write_text(json.dumps(total,indent=2)+'\n');print(json.dumps({k:v for k,v in total.items() if k!='runs'},indent=2))
 if a.suite=='m105feature':
  # The frozen M105 migration probe asserts the M105-only schema delta, so M106's own
  # additive table is a declared, milestone-scoped negative — retained and reported,
  # never merged away. Every other M105 assertion must still reproduce exactly.
  assert all(r['pass']==r['expected_pass'] and r['fail']==r['expected_fail'] for r in outs)
 elif a.suite in ['feature','execution','routine']:assert all(r['pass']==r['expected_pass'] and r['fail']==0 and r['exit_code']==0 for r in outs)
if __name__=='__main__':main()
