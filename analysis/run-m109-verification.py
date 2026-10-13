#!/usr/bin/env python3
"""M109 advisory-channel actual tests, plus the separate unchanged M108 practice cohort and
every earlier frozen cohort (M107 intention, M106 gate, M105 identity, RAW, DECLARED,
live-provider, offline). Results are never merged into a fake integrated pass; negative
artifacts stay preserved by suite.

M109 adds no storage, so its own cohort is a read-only channel over facts the previous
milestones already record. The M109 parent is the committed M108 release tree (143 files)
and the inherited parent is the committed M107 release tree; every older tree is rebuilt
from the saved reverse patches and asserted against the frozen parent-source.json proofs.

    python3 analysis/run-m109-verification.py --suite feature
    python3 analysis/run-m109-verification.py --suite m108feature   # alias -> run-m108-verification.py --suite feature
    python3 analysis/run-m109-verification.py --suite feature --freeze-parents
"""
from pathlib import Path
import argparse, concurrent.futures, json, os, runpy, subprocess
ROOT=Path(__file__).resolve().parent.parent;APP=ROOT/'extracted/tradejournal';E=ROOT/'analysis/evidence/m109'
PRIOR=runpy.run_path(str(ROOT/'analysis/run-m108-verification.py'),run_name='m109_prior_m108_helpers')
OLD=PRIOR['OLD'];M87=PRIOR['M87'];read=PRIOR['read'];digest=PRIOR['digest']
M108_FEATURE=PRIOR['M108_FEATURE']
# The frozen M108 migration probe asserts the M108-only schema delta; M109 adds no schema at
# all, so that probe is expected to reproduce EXACTLY, with no declared negative. The M107/
# M106/M105 frozen migration probes keep their own single milestone-only negative.
M109_FEATURE=[('pure','probe-m109-pure.js',31),('api','probe-m109-api.js',17),('consumers','probe-m109-consumers.js',18),('freshness','probe-m109-freshness.js',11),('hardening','probe-m109-hardening.js',17),('portable','probe-m109-portable.js',16),('migration','probe-m109-migration.js',15),('ui','probe-m109-ui.js',27),('archive-ui','probe-m109-archive-ui.js',16)]
M109_PARENT=Path('/tmp/m109-parent/app')
SUITES=['feature','m108feature','m107feature','m106feature','m105feature','screenshots','confluences','emotions','process','behavior','reviews','opportunities','changes','execution','routine','raw','declared','pure','offline','market']
def freeze_m109_parent():
 OLD['freeze']('14ac041e4149948d6526acc8794c6430283e7643',str(M109_PARENT))
 E.mkdir(parents=True,exist_ok=True)
 guard=E/'parent-source.json';d=digest(M109_PARENT)
 if guard.exists():
  if d!=read(guard):open('/tmp/m109-parent-mismatch.json','w').write(json.dumps({'frozen':json.loads(guard.read_text()),'current':d},indent=2)+'\n');raise AssertionError('M109 parent tree changed: see /tmp/m109-parent-mismatch.json')
  print(f'M109 parent guard reproduced exactly ({len(d)} files)',flush=True)
 else:
  guard.write_text(json.dumps(d,indent=2,sort_keys=True)+'\n');print(f'created parent-source.json from the actual 14ac041 M108 release tree ({len(d)} files)',flush=True)
def freeze_parents():
 freeze_m109_parent();PRIOR['freeze_parents']()
 info={'method':'Actual 14ac041 M108 Git release as the M109 parent, the inherited M108 parent (the 8a2cfd5 M107 release), the M107 parent (the 4d13078 M106 release) and every older source by saved reverse patches asserted against the frozen parent-source.json proofs; no guessed schema/current module in any parent.','parents':{str(M109_PARENT):{'files':len(digest(M109_PARENT)),'byte_differences':0},**read('analysis/evidence/m108/regression-parents.json')['parents']}}
 (E/'regression-parents.json').write_text(json.dumps(info,indent=2)+'\n')
def feature(row,parent=M109_PARENT,prefix='m109feature'):
 n,s,p,*rest=row;expect_fail=rest[0] if rest else 0;result=E/(prefix+'-'+n+'-results.json');env={**os.environ,'TJ_APP':str(APP),'TJ_PARENT':str(parent),'NODE_OPTIONS':'','TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','M109_RESULT':str(result)}
 run=subprocess.run(['node','analysis/'+s],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=300);output=prefix+'-'+n+'.txt';(E/output).write_bytes(run.stdout)
 d=json.loads(result.read_text());out={'name':n,'script':'analysis/'+s,'pass':d['pass'],'fail':d['fail'],'expected_pass':p,'expected_fail':expect_fail,'exit_code':run.returncode,'status':'completed','output':output,'scope':d['scope']}
 print(f'{prefix}/{n}: {out["pass"]}/{out["fail"]}, exit={run.returncode}',flush=True);return out
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--suite',required=True,choices=SUITES);ap.add_argument('--freeze-parents',action='store_true');ap.add_argument('--only',help='Rerun one script substring and merge into the same-source suite');a=ap.parse_args();E.mkdir(parents=True,exist_ok=True)
 if a.freeze_parents:freeze_parents()
 if a.suite in ['screenshots','confluences','emotions','process','behavior','reviews','opportunities','changes','execution','routine','raw','declared','pure','offline','market','m108feature','m107feature','m106feature','m105feature']:
  # Every non-M109 cohort is the frozen M108 runner, addressed so its artifacts stay with
  # the milestone that measured them; only the M109 cohort writes into evidence/m109.
  # The M108 milestone IS that runner's own `feature` suite (the M108 feature cohort was
  # never given a `m108feature` choice there), so the alias is resolved here rather than
  # passed through, and the artifact path is reported under the resolved name.
  child_suite={'m108feature':'feature'}.get(a.suite,a.suite)
  child=['python3','analysis/run-m108-verification.py','--suite',child_suite]+(['--only',a.only] if a.only else [])
  r=subprocess.run(child,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);print(r.stdout.decode()[-4000:],flush=True)
  print('M109 cohort artifacts:','analysis/evidence/m108/'+child_suite+'-summary.json');raise SystemExit(r.returncode)
 if a.suite=='feature':
  rows=list(M109_FEATURE)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outs=list(pool.map(feature,rows))
 total={'pass':sum(r['pass'] or 0 for r in outs),'fail':sum(r['fail'] or 0 for r in outs),'probes':len(outs),'completed_nonzero':sum(r['exit_code'] is not None and r['exit_code']!=0 for r in outs),'timeout_no_exit':sum(r['exit_code'] is None for r in outs),'summaryless':sum(r['pass'] is None or r['fail'] is None for r in outs),'scope':'REPORTED completed assertions; literal clocks/journals/DOM only. The advisory channel is deterministic and read-only (no model, key or network); RAW failures/early aborts, DECLARED assumptions and the frozen milestone-only schema negatives remain SEPARATE. No chart/broker/provider/pixel/mental-state/prediction/edge/production proof.','runs':outs}
 (E/(a.suite+'-runs.json')).write_text(json.dumps(outs,indent=2)+'\n');(E/(a.suite+'-summary.json')).write_text(json.dumps(total,indent=2)+'\n');print(json.dumps({k:v for k,v in total.items() if k!='runs'},indent=2))
 assert all(r['pass']==r['expected_pass'] and r['fail']==r['expected_fail'] and r['exit_code']==0 for r in outs),[(r['name'],r['pass'],r['fail']) for r in outs if r['pass']!=r['expected_pass'] or r['fail']!=r['expected_fail'] or r['exit_code']!=0]
if __name__=='__main__':main()
