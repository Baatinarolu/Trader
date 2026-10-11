#!/usr/bin/env python3
"""Run separate M86/M92 feature, actual routine, raw legacy and DECLARED isolated
regression cohorts; retain stdout, nonzero exits and timeout/null summaries.
No production patch or market/risk adaptation; adapters only in explicitly named
DECLARED groups. --freeze-parents reconstructs actual Git versions in /tmp.
"""
from pathlib import Path
import argparse, concurrent.futures, hashlib, io, json, os, re, shutil, subprocess, tarfile
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m86'
FEATURE=[('rubric','probe-m86-execution-rubric.js',60),('contracts','probe-m86-review-contracts.js',42),('feedback','probe-m86-derived-feedback.js',23),('freshness','probe-m86-review-freshness.js',14),('day','probe-m92-execution-day.js',24),('ui','probe-m86-execution-ui.js',33),('noninterference','probe-m86-grading-noninterference.js',34),('migration','probe-m86-review-migration.js',15),('hardening','probe-m86-evidence-hardening.js',15)]
def read(p):return json.loads((ROOT/p).read_text())
def freeze(ref,dest):
 dest=Path(dest);dest.mkdir(parents=True,exist_ok=True)
 archive=subprocess.check_output(['git','archive',ref,'extracted/tradejournal'],cwd=ROOT)
 with tarfile.open(fileobj=io.BytesIO(archive)) as t:
  for member in t:
   if member.isfile():
    rel=Path(member.name).relative_to('extracted/tradejournal');assert '..' not in rel.parts;p=dest/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(t.extractfile(member).read())
 link=dest/'node_modules'
 if not link.exists():link.symlink_to(APP/'node_modules',target_is_directory=True)
def freeze_legacy():
 # Some old Git objects lie beyond this checkout's shallow history. Rebuild the
 # ACTUAL measured source, no fixture schema invention, from durable byte proofs.
 dest=Path('/tmp/m79-parent/extracted/tradejournal')
 if dest.exists():shutil.rmtree(dest)
 dest.mkdir(parents=True);guard=read('analysis/evidence/m86/parent-source.json')
 for p,h in guard.items():
  b=(Path('/tmp/m86-parent/app')/p).read_bytes();assert hashlib.sha256(b).hexdigest()==h;t=dest/p;t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(b)
 for name in ['m64-routine-complete.patch','m84-m85-complete.patch','m81-m82-complete.patch','m79-m80-complete.patch']:
  patch=str(ROOT/'analysis/patches'/name);subprocess.run(['git','apply','-R','--check',patch],cwd=dest,check=True);subprocess.run(['git','apply','-R',patch],cwd=dest,check=True)
 actual={str(p.relative_to(dest)):hashlib.sha256(p.read_bytes()).hexdigest() for p in dest.rglob('*') if p.is_file()}
 assert actual==read('analysis/evidence/m79/parent-source.json')
 (dest/'node_modules').symlink_to(APP/'node_modules',target_is_directory=True)
def stats(text):
 m=list(re.finditer(r'(\d+)\s+(?:passed|pass)\s*[,·/]?\s*(\d+)\s+(?:failed|fail)',text,re.I))
 if m:return tuple(map(int,m[-1].groups()))
 return None,None
def run(row,suite):
 env={**os.environ,'TJ_APP':str(APP),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':''};name=row.get('name',Path(row['script']).stem);output=f'{suite}-{name}.txt';result=E/f'{suite}-{name}-results.json';timeout=90;cmd=['node',row['script']]
 if suite=='feature':env['M86_RESULT']=str(result);env['TJ_PARENT']='/tmp/m86-parent/app'
 if suite=='offline':env['TJ_OFFLINE_CANDLES']='1'
 if suite=='routine':env['M64_RESULT']=str(result);env['M94_RESULT']=str(result);env['TJ_PARENT']='/tmp/m64-parent/app'
 if suite in ['declared','market']:
  env['NODE_OPTIONS']='--require='+str(ROOT/'analysis/m64-legacy-prerequisite.js')
  if suite=='declared' and row.get('group')=='legacy':cmd=['node','analysis/legacy-guard-fixture-runner.js',row['script']]
 cwd=ROOT
 if row['script'].startswith('scripts/'):
  cwd=APP;env['NODE_PATH']=str(APP/'node_modules')
 status='completed'
 try:
  proc=subprocess.run(cmd,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout);text=proc.stdout.decode(errors='replace');exit_code=proc.returncode
 except subprocess.TimeoutExpired as e:
  text=(e.stdout or b'').decode(errors='replace');exit_code=None;status='killed_on_timeout'
 (E/output).write_text(text)
 p,f=stats(text)
 if result.exists():
  d=json.loads(result.read_text());p=d.get('pass',d.get('passed',p));f=d.get('fail',d.get('failed',f))
 scope={'feature':'Actual new M86/M92 runtime, NO legacy/native prerequisite adapter; declared fixed clocks/literal journals/market or DOM IO only','routine':'Actual complete prior M14/M64/M94 feature, NO prerequisite adapter, against new grading implementation','raw':'Original UNCHANGED inherited source, NO prerequisite adapter. Failures/early aborts preserved, not expected-all assertions completed','declared':'DECLARED old preparation/capture held-fulfilled; legacy22 additionally old M85 writing/emotion/prompt fixture. NOT integrated preparation/policy/human/broker proof; raw negatives retained','pure':'Original source/no adapter and live provider IO, network/prerequisite aborts preserved','offline':'Original source, NO prerequisite adapter; EXPLICIT built-in labelled synthetic offline candles, not live feed/broker/pixel proof','market':'DECLARED M64 held-fulfilled preparation/capture only. Real old market/risk rules; NOT integrated current preparation proof'}[suite]
 out={**row,'pass':p,'fail':f,'exit_code':exit_code,'status':status,'output':output,'scope':scope}
 print(f'{suite}/{name}: {p}/{f}, exit={exit_code}, {status}',flush=True);return out

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--suite',choices=['feature','routine','raw','declared','pure','market','offline'],required=True);ap.add_argument('--freeze-parents',action='store_true');ap.add_argument('--only',help='One script/name substring, merged into previously measured same-source suite');args=ap.parse_args();E.mkdir(parents=True,exist_ok=True)
 if args.freeze_parents:
  freeze('c22d5b9f6db4eca17f5981f5b87230f5ec343b86','/tmp/m86-parent/app');freeze('75172759d134e63ed57a20c5e2941eb6c28e9855','/tmp/m64-parent/app');freeze_legacy()
 if args.suite=='feature':rows=[{'name':n,'script':'analysis/'+s,'expected_pass':p} for n,s,p in FEATURE]
 elif args.suite=='routine':rows=read('analysis/evidence/m64/feature-summary.json')['probes'];rows=[{'name':r['name'],'script':r['script'],'expected_pass':r['pass']} for r in rows]
 elif args.suite in ['raw','declared']:rows=read('analysis/evidence/m64/'+('original' if args.suite=='raw' else 'isolated')+'-regression-runs.json');rows=[{k:r[k] for k in ['script','group'] if k in r} for r in rows]
 elif args.suite=='offline':rows=[{'script':p} for p in ['scripts/now-test.js','scripts/topdown-test.js','scripts/chart-test.js','analysis/probe-m71-saved-settings.js']]
 else:rows=[{'script':r['script']} for r in read('analysis/evidence/m64/'+('pure' if args.suite=='pure' else 'isolated-market')+'-regression-runs.json')]
 original_rows=rows
 if args.only:rows=[r for r in rows if args.only in r['script'] or args.only in r.get('name','')];assert len(rows)==1
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:outs=list(pool.map(lambda r:run(r,args.suite),rows))
 if args.only:
  old=read('analysis/evidence/m86/'+args.suite+'-runs.json');updates={r['script']:r for r in outs};outs=[updates.get(r['script'],r) for r in old]
 (E/(args.suite+'-runs.json')).write_text(json.dumps(outs,indent=2)+'\n');total={'pass':sum(r['pass'] or 0 for r in outs),'fail':sum(r['fail'] or 0 for r in outs),'probes':len(outs),'completed_nonzero':sum(r['exit_code'] is not None and r['exit_code']!=0 for r in outs),'timeout_no_exit':sum(r['exit_code'] is None for r in outs),'summaryless':sum(r['pass'] is None or r['fail'] is None for r in outs),'scope':'Sum of REPORTED completed counters only, no invented denominator or null exit0','runs':outs};(E/(args.suite+'-summary.json')).write_text(json.dumps(total,indent=2)+'\n');print(json.dumps({k:v for k,v in total.items() if k!='runs'},indent=2))
 if args.suite in ['feature','routine']:assert all(r['pass']==r['expected_pass'] and r['fail']==0 and r['exit_code']==0 for r in outs),outs
if __name__=='__main__':main()
