#!/usr/bin/env python3
"""M93 daily-behavior-specific actual tests + separate unchanged prior execution,
routine, RAW, DECLARED, live-provider and offline cohorts. Results never merged
into a fake integrated pass. Source/negative artifacts preserved by suite.
"""
from pathlib import Path
import argparse, concurrent.futures, hashlib, io, json, os, runpy, shutil, subprocess, tarfile
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m93'
OLD=runpy.run_path(str(ROOT/'analysis/run-m86-verification.py'),run_name='legacy_helpers')
M88_FEATURE=[('codec','probe-m88-confluence-codec.js',26),('contracts','probe-m88-confluence-contracts.js',33),('analysis','probe-m88-confluence-analysis.js',23),('ui','probe-m88-confluence-ui.js',32),('hardening','probe-m88-confluence-hardening.js',19),('freshness','probe-m88-confluence-freshness.js',8),('settings','probe-m88-settings-confluence-ui.js',7),('migration','probe-m88-actual-parent-migration.js',12)]
M89_FEATURE=[('timing','probe-m89-timing.js',28),('storage','probe-m89-storage.js',28),('analysis','probe-m89-analysis.js',16),('ui','probe-m89-ui.js',20),('portable','probe-m89-portable-hardening.js',15),('freshness','probe-m89-freshness-ui.js',12),('lifecycle','probe-m89-lifecycle.js',12),('migration','probe-m89-actual-parent-migration.js',14),('receipt','probe-m89-import-receipt.js',6),('portable-context','probe-m89-portable-context.js',8),('context-ui','probe-m89-context-ui.js',3),('settings','probe-m89-settings-ui.js',5),('coach-ui','probe-m89-coach-ui.js',3)]
M91_FEATURE=[('pure','probe-m91-pure.js',37),('api','probe-m91-api.js',21),('ui','probe-m91-ui.js',15),('hardening','probe-m91-hardening.js',16),('freshness','probe-m91-ui-freshness.js',8),('migration','probe-m91-migration.js',11)]
FEATURE=[('pure','probe-m93-pure.js',41),('api','probe-m93-api.js',20),('hardening','probe-m93-hardening.js',14),('ui','probe-m93-ui.js',16),('freshness','probe-m93-freshness.js',6),('migration','probe-m93-migration.js',11),('small-day','probe-m93-small-day.js',7)]
M87=runpy.run_path(str(ROOT/'analysis/run-m87-verification.py'),run_name='prior_screenshot_helpers')
def read(p):return json.loads((ROOT/p).read_text())
def digest(tree):return {str(p.relative_to(tree)):hashlib.sha256(p.read_bytes()).hexdigest() for p in tree.rglob('*') if p.is_file() and 'node_modules' not in p.relative_to(tree).parts}
def materialise(src,dest,reverse,guard):
 dest=Path(dest);assert str(dest).startswith('/tmp/m');shutil.rmtree(dest,ignore_errors=True);dest.mkdir(parents=True)
 for rel in digest(src):
  out=dest/rel;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes((src/rel).read_bytes())
 for name in reverse:subprocess.run(['git','apply','-R','--check',str(ROOT/'analysis/patches'/name)],cwd=dest,check=True);subprocess.run(['git','apply','-R',str(ROOT/'analysis/patches'/name)],cwd=dest,check=True)
 assert digest(dest)==read(guard),str(dest)+' source must be literal measured parent';(dest/'node_modules').symlink_to(APP/'node_modules',target_is_directory=True)
def freeze_parents():
 OLD['freeze']('797e5d1524fa9806de7eff8d8e0903efd995a716','/tmp/m93-parent/app');assert digest(Path('/tmp/m93-parent/app'))==read('analysis/evidence/m93/parent-source.json')
 OLD['freeze']('5a37105bc2bbf11849494e92d586147f4a398a46','/tmp/m91-parent/app');assert digest(Path('/tmp/m91-parent/app'))==read('analysis/evidence/m91/parent-source.json')
 OLD['freeze']('63d8969a23066e9bd70b592d8b0ecd12585579ec','/tmp/m89-parent/app');assert digest(Path('/tmp/m89-parent/app'))==read('analysis/evidence/m89/parent-source.json')
 materialise(Path('/tmp/m89-parent/app'),'/tmp/m88-parent/app',['m88-confluences-complete.patch'],'analysis/evidence/m88/parent-source.json')
 materialise(Path('/tmp/m88-parent/app'),'/tmp/m87-parent/app',['m87-screenshots-complete.patch'],'analysis/evidence/m87/parent-source.json')
 materialise(Path('/tmp/m87-parent/app'),'/tmp/m86-parent/app',['m86-m92-execution-complete.patch'],'analysis/evidence/m86/parent-source.json')
 materialise(Path('/tmp/m86-parent/app'),'/tmp/m64-parent/app',['m64-routine-complete.patch'],'analysis/evidence/m64/parent-source.json')
 materialise(Path('/tmp/m64-parent/app'),'/tmp/m84-parent/app',['m84-m85-complete.patch'],'analysis/evidence/m84/parent-source.json')
 materialise(Path('/tmp/m84-parent/app'),'/tmp/m81-parent/app',['m81-m82-complete.patch'],'analysis/evidence/m81/parent-source.json')
 OLD['freeze_legacy']()
 info={'method':'Actual797 M91 +5a M89 +63d M88 Git archives; missing historic d5/b0c/c22/7517 restored by durable reverse patches and ALL-source SHA guards; fdaa via four old reverse patches. No guessed schema/current module in older parent.','parents':{str(p):{'files':len(digest(Path(p))),'byte_differences':0} for p in ['/tmp/m93-parent/app','/tmp/m91-parent/app','/tmp/m89-parent/app','/tmp/m88-parent/app','/tmp/m87-parent/app','/tmp/m86-parent/app','/tmp/m64-parent/app','/tmp/m79-parent/extracted/tradejournal','/tmp/m84-parent/app','/tmp/m81-parent/app']}}
 (E/'regression-parents.json').write_text(json.dumps(info,indent=2)+'\n')
def feature(row):
 n,s,p=row;result=E/('feature-'+n+'-results.json');env={**os.environ,'TJ_APP':str(APP),'TJ_PARENT':'/tmp/m93-parent/app','NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M93_RESULT':str(result)}
 run=subprocess.run(['node','analysis/'+s],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=90);output='feature-'+n+'.txt';(E/output).write_bytes(run.stdout);d=json.loads(result.read_text());out={'name':n,'script':'analysis/'+s,'pass':d['pass'],'fail':d['fail'],'expected_pass':p,'exit_code':run.returncode,'status':'completed','output':output,'scope':d['scope']};print(f'feature/{n}: {out["pass"]}/{out["fail"]}, exit={run.returncode}',flush=True);return out

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--suite',required=True,choices=['feature','screenshots','confluences','emotions','process','execution','routine','raw','declared','pure','offline','market']);ap.add_argument('--freeze-parents',action='store_true');ap.add_argument('--only',help='Rerun one script substring and merge same-source existing suite; old negatives retained separately');a=ap.parse_args();E.mkdir(parents=True,exist_ok=True)
 if a.freeze_parents:
  freeze_parents()
 if a.suite=='screenshots':
  feature_fn=M87['feature'];feature_fn.__globals__['E']=E/'screenshots';(E/'screenshots').mkdir(exist_ok=True)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(feature_fn,M87['FEATURE']))
  for row in outs:row['output']='screenshots/'+row['output']
 elif a.suite=='confluences':
  prior=runpy.run_path(str(ROOT/'analysis/run-m88-verification.py'),run_name='prior_confluence_helpers');fn=prior['feature'];fn.__globals__['E']=E/'confluences';(E/'confluences').mkdir(exist_ok=True)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(fn,M88_FEATURE))
  for row in outs:row['output']='confluences/'+row['output']
 elif a.suite=='emotions':
  prior=runpy.run_path(str(ROOT/'analysis/run-m89-verification.py'),run_name='prior_emotion_helpers');fn=prior['feature'];fn.__globals__['E']=E/'emotions';(E/'emotions').mkdir(exist_ok=True)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(fn,M89_FEATURE))
  for row in outs:row['output']='emotions/'+row['output']
 elif a.suite=='process':
  prior=runpy.run_path(str(ROOT/'analysis/run-m91-verification.py'),run_name='prior_process_helpers');fn=prior['feature'];fn.__globals__['E']=E/'process';(E/'process').mkdir(exist_ok=True)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(fn,M91_FEATURE))
  for row in outs:row['output']='process/'+row['output']
 elif a.suite=='feature':
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(feature,FEATURE))
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
  updates={r['script']:r for r in outs};outs=[updates.get(r['script'],r) for r in read('analysis/evidence/m93/'+a.suite+'-runs.json')]
 total={'pass':sum(r['pass'] or 0 for r in outs),'fail':sum(r['fail'] or 0 for r in outs),'probes':len(outs),'completed_nonzero':sum(r['exit_code'] is not None and r['exit_code']!=0 for r in outs),'timeout_no_exit':sum(r['exit_code'] is None for r in outs),'summaryless':sum(r['pass'] is None or r['fail'] is None for r in outs),'scope':'REPORTED completed assertions; literal clocks/journals/DOM only. Feature/execution/routine no prerequisite adapter; RAW failures/early aborts and DECLARED assumptions remain SEPARATE. No chart/broker/provider/pixel/meditation/edge/production proof.','runs':outs}
 (E/(a.suite+'-runs.json')).write_text(json.dumps(outs,indent=2)+'\n');(E/(a.suite+'-summary.json')).write_text(json.dumps(total,indent=2)+'\n');print(json.dumps({k:v for k,v in total.items() if k!='runs'},indent=2))
 if a.suite in ['feature','execution','routine']:assert all(r['pass']==r['expected_pass'] and r['fail']==0 and r['exit_code']==0 for r in outs)
if __name__=='__main__':main()
