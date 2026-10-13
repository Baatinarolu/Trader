#!/usr/bin/env python3
"""M110 asymmetric pre/post-news block actual tests, plus the separate unchanged M109 advisory
channel and every earlier frozen cohort (M108 practice, M107 intention, M106 gate, M105
identity, RAW, DECLARED, live-provider, offline). Results are never merged into a fake
integrated pass; negative artifacts stay preserved by suite.

M110 is the first news milestone with STORED settings: it adds two columns to `accounts`, so
its own cohort measures the two clocks on the module, over HTTP, through the engine and its
consumers, across a restart, through the settings dialog, and through an upgrade of the
committed M109 release (145 files) — which is this milestone's parent, rebuilt from BASE
c09574e and asserted against the frozen parent-source.json proof. Every older tree is
rebuilt by the M109 runner's saved reverse patches and asserted against its own frozen proof.

    python3 analysis/run-m110-verification.py --suite feature
    python3 analysis/run-m110-verification.py --suite m109feature   # alias -> run-m109-verification.py --suite feature
    python3 analysis/run-m110-verification.py --suite feature --freeze-parents
"""
from pathlib import Path
import argparse, concurrent.futures, json, os, runpy, subprocess
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m110'
PRIOR=runpy.run_path(str(ROOT/'analysis/run-m109-verification.py'),run_name='m110_prior_m109_helpers')
OLD=PRIOR['OLD'];M87=PRIOR['M87'];read=PRIOR['read'];digest=PRIOR['digest']
M109_FEATURE=PRIOR['M109_FEATURE']
# M110 is a stored-setting milestone, so its own migration probe is expected to reproduce
# EXACTLY against the committed M109 release: the two added columns, the inherited rows and the
# refused legacy knob are all part of this milestone, not a declared negative. Every frozen
# earlier probe keeps its own recorded negative (M109's is the one-schema-negative cohort).
M110_FEATURE=[('pure','probe-m110-pure.js',41),('api','probe-m110-api.js',40),('engine','probe-m110-engine.js',25),('consumers','probe-m110-consumers.js',22),('freshness','probe-m110-freshness.js',17),('hardening','probe-m110-hardening.js',40),('portable','probe-m110-portable.js',17),('migration','probe-m110-migration.js',33),('ui','probe-m110-ui.js',23)]
M110_PARENT=Path('/tmp/m110-parent/app')
M110_BASE='c09574e'
SUITES=['feature','m109feature','m108feature','m107feature','m106feature','m105feature','screenshots','confluences','emotions','process','behavior','reviews','opportunities','changes','execution','routine','raw','declared','pure','offline','market']
def freeze_m110_parent():
 OLD['freeze'](M110_BASE,str(M110_PARENT))
 E.mkdir(parents=True,exist_ok=True)
 guard=E/'parent-source.json';d=digest(M110_PARENT)
 if guard.exists():
  if d!=read(guard):open('/tmp/m110-parent-mismatch.json','w').write(json.dumps({'frozen':json.loads(guard.read_text()),'current':d},indent=2)+'\n');raise AssertionError('M110 parent tree changed: see /tmp/m110-parent-mismatch.json')
  print(f'M110 parent guard reproduced exactly ({len(d)} files)',flush=True)
 else:
  guard.write_text(json.dumps(d,indent=2,sort_keys=True)+'\n');print(f'created parent-source.json from the actual c09574e M109 release tree ({len(d)} files)',flush=True)
def freeze_parents():
 freeze_m110_parent();PRIOR['freeze_parents']()
 info={'method':'Actual c09574e M109 Git release as the M110 parent, the inherited M109 parent (the 14ac041 M108 release), the M107 parent (the 8a2cfd5 M107 release) and every older source by saved reverse patches asserted against the frozen parent-source.json proofs; no guessed schema/current module in any parent.','parents':{str(M110_PARENT):{'files':len(digest(M110_PARENT)),'byte_differences':0},**read('analysis/evidence/m109/regression-parents.json')['parents']}}
 (E/'regression-parents.json').write_text(json.dumps(info,indent=2)+'\n')
def feature(row,parent=M110_PARENT,prefix='m110feature'):
 n,s,p,*rest=row;expect_fail=rest[0] if rest else 0;result=E/(prefix+'-'+n+'-results.json');env={**os.environ,'TJ_APP':str(APP),'TJ_PARENT':str(parent),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M110_RESULT':str(result)}
 run=subprocess.run(['node','analysis/'+s],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=300);output=prefix+'-'+n+'.txt';(E/output).write_bytes(run.stdout)
 d=json.loads(result.read_text());out={'name':n,'script':'analysis/'+s,'pass':d['pass'],'fail':d['fail'],'expected_pass':p,'expected_fail':expect_fail,'exit_code':run.returncode,'status':'completed','output':output,'scope':d['scope']}
 print(f'{prefix}/{n}: {out["pass"]}/{out["fail"]}, exit={run.returncode}',flush=True);return out
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--suite',required=True,choices=SUITES);ap.add_argument('--freeze-parents',action='store_true');ap.add_argument('--only',help='Rerun one script substring and merge into the same-source suite');a=ap.parse_args();E.mkdir(parents=True,exist_ok=True)
 if a.freeze_parents:freeze_parents()
 if a.suite in ['screenshots','confluences','emotions','process','behavior','reviews','opportunities','changes','execution','routine','raw','declared','pure','offline','market','m109feature','m108feature','m107feature','m106feature','m105feature']:
  # Every non-M110 cohort is the frozen M109 runner, addressed so its artifacts stay with
  # the milestone that measured them; only the M110 cohort writes into evidence/m110. The
  # M109 milestone IS that runner's own `feature` suite, so the alias is resolved here
  # rather than passed through, and the artifact path is the resolved name's.
  child_suite={'m109feature':'feature'}.get(a.suite,a.suite)
  child=['python3','analysis/run-m109-verification.py','--suite',child_suite]+(['--only',a.only] if a.only else [])
  r=subprocess.run(child,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);print(r.stdout.decode()[-4000:],flush=True)
  print('M110 cohort artifacts:','analysis/evidence/m109/'+child_suite+'-summary.json',flush=True)
  # The M109 cohort's own migration probe asserts that M109 added NO schema object of any kind.
  # M110 adds two columns to `accounts`, so on this tree that whole-schema assertion and the
  # account-table half of its inherited-facts comparison are this milestone's DECLARED negative:
  # 166/2 with the M109 runner's own expectation assert tripping on it. The probe text and the
  # two failing labels are preserved in analysis/evidence/m109/m109feature-migration.txt; every
  # other M109 probe reproduces exactly (31/0, 17/0, 18/0, 11/0, 17/0, 16/0, 27/0, 16/0).
  if a.suite=='m109feature':
   d=read('analysis/evidence/m109/'+child_suite+'-summary.json')
   assert (d['pass'],d['fail'],d['probes'],d['completed_nonzero'])==(166,2,9,1),(d['pass'],d['fail'],d['probes'],d['completed_nonzero'])
   print('M109 cohort on this tree: 166/2 — the two failures are the declared M110 schema negative.',flush=True)
   raise SystemExit(0)
  raise SystemExit(r.returncode)
 if a.suite=='feature':
  rows=list(M110_FEATURE)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(feature,rows))
 total={'pass':sum(r['pass'] or 0 for r in outs),'fail':sum(r['fail'] or 0 for r in outs),'probes':len(outs),'completed_nonzero':sum(r['exit_code'] is not None and r['exit_code']!=0 for r in outs),'timeout_no_exit':sum(r['exit_code'] is None for r in outs),'summaryless':sum(r['pass'] is None or r['fail'] is None for r in outs),'scope':'REPORTED completed assertions; literal clocks/journals/DOM only. Two asymmetric news clocks over the app\u2019s own calendar parser, measured on the module, over HTTP, through the engine and its consumers, across a restart, through the settings dialog and through an upgrade of the committed M109 release. The sandbox has no market or calendar network, so the calendar is fed through the app\u2019s own fetch path by a shim and no live-feed, provider, broker, pixel or human proof is claimed. RAW failures/early aborts, DECLARED assumptions and every frozen milestone-only schema negative remain SEPARATE. No claim about what a release does to price.','runs':outs}
 (E/(a.suite+'-runs.json')).write_text(json.dumps(outs,indent=2)+'\n');(E/(a.suite+'-summary.json')).write_text(json.dumps(total,indent=2)+'\n');print(json.dumps({k:v for k,v in total.items() if k!='runs'},indent=2))
 assert all(r['pass']==r['expected_pass'] and r['fail']==r['expected_fail'] and r['exit_code']==0 for r in outs),[(r['name'],r['pass'],r['fail']) for r in outs if r['pass']!=r['expected_pass'] or r['fail']!=r['expected_fail'] or r['exit_code']!=0]
if __name__=='__main__':main()
