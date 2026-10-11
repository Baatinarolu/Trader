#!/usr/bin/env python3
"""Guard measured M81/M82 source/evidence; reconstruct eight independent stages,
pristine forward/reverse byte proofs and deterministic source-only ZIP.
First run --capture-stages reads the frozen measured trees. Normal runs use
only durable patches, never ephemeral /tmp baselines/dependencies/databases.
Does not switch branches, read credentials or mutate the application source.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, io, json, shutil, subprocess, tarfile, tempfile, zipfile
ROOT=Path(__file__).resolve().parent.parent
APP=ROOT/'extracted/tradejournal'; E=ROOT/'analysis/evidence/m81'; P=ROOT/'analysis/patches'
BASE='7f1122dade0b9022b595aadc08bbb29badff51f6'
STAGES=[
 ('policy','m81-optional-profit-policy.patch','/tmp/m81-policy-stage/app'),
 ('gate','m81-durable-profit-stop.patch','/tmp/m81-gate-stage/app'),
 ('ui','m81-profit-ui.patch','/tmp/m81-ui-stage/app'),
 ('risk','m82-streak-multipliers.patch','/tmp/m82-risk-stage/app'),
 ('advice','m82-post-loss-advice.patch','/tmp/m82-advice-stage/app'),
 ('compat','m82-m9-advisory-read.patch','/tmp/m82-compat-stage/app'),
 ('risk-ui','m82-risk-ui.patch','/tmp/m82-ui-stage/app'),
 ('full','m81-m82-documentation.patch',None),
]
CORE=['src/bots/'+n+'.js' for n in ['setup','topdown','smc','momentum','predict','entry-models','entry-preference','targets','stops','protected']]
NEUTRAL=CORE+['package-lock.json','src/instruments.js','src/performance.js','scripts/api-test.js','scripts/bots-test.js']
ns={'__file__':str(ROOT/'analysis/build-m54-m77-artifacts.py'),'__name__':'artifact_helpers'}
exec(compile(Path(ns['__file__']).read_text(),ns['__file__'],'exec'),ns)
make_patch,contents,allowed,add_zip=[ns[k] for k in ['make_patch','contents','allowed','add_zip']]
def run(args,cwd=ROOT):return subprocess.run(args,cwd=cwd,check=True,capture_output=True).stdout
def sha(b):return hashlib.sha256(b).hexdigest()
def manifest(tree):return {p:sha(b) for p,b in contents(tree).items()}
def write(dest,rel,b):
 p=PurePosixPath(rel);assert not p.is_absolute() and '..' not in p.parts
 t=dest/str(p);t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(b)
def patch_meta(p):
 b=p.read_bytes();return {'files':b.count(b'diff --git '),'bytes':len(b),'sha256':sha(b),'forward_byte_differences':0,'reverse_byte_differences':0}
def replay_check(before,after,patch,work):
 tree=work/('roundtrip-'+patch.stem);shutil.copytree(before,tree)
 run(['git','apply','--check',str(patch)],tree);run(['git','apply',str(patch)],tree)
 assert contents(tree)==contents(after),patch.name+' forward'
 run(['git','apply','-R','--check',str(patch)],tree);run(['git','apply','-R',str(patch)],tree)
 assert contents(tree)==contents(before),patch.name+' reverse'
def evidence(rel):return json.loads((ROOT/rel).read_text())
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--capture-stages',action='store_true');args=parser.parse_args()
 guards={n:json.loads((E/(n+'-source.json')).read_text()) for n in ['parent']+[s[0] for s in STAGES]}
 current=guards['full'];assert len(current)==112
 assert all(sha((APP/p).read_bytes())==h for p,h in current.items()),'Measured app changed'
 assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Neutral math/engine/scripts/lock changed'
 assert {p for p in current if current[p]!=guards['risk-ui'][p]}=={'README.md','docs/GUARDRAILS.md'},'Documentation changed runtime'
 for p,h in json.loads((E/'harness-source.json').read_text()).items():assert sha((ROOT/p).read_bytes())==h,p
 feature=json.loads((E/'feature-summary.json').read_text());assert feature['pass']==282 and feature['fail']==0 and len(feature['probes'])==10
 for row in feature['probes']:
  d=json.loads((E/(row['evidence']+'-results.json')).read_text());assert [d['pass'],d['fail']]==[row['pass'],0] and row['exit_code']==0
 inherited=json.loads((E/'m79-regression-runs.json').read_text());assert len(inherited)==12 and sum(r['pass'] for r in inherited)==302 and all(r['fail']==0 and r['exit_code']==0 for r in inherited)
 # Both substantive missing-mechanism controls AND mistaken-fixture negatives
 # remain discoverable. Never rewrite negative counts to make the batch green.
 negatives={
  'analysis/evidence/m81/parent-policy-results.json':(3,56),
  'analysis/evidence/m81/policy-only-stop-results.json':(15,36),
  'analysis/evidence/m81/policy-only-consumers-results.json':(24,36),
  'analysis/evidence/m81/policy-only-validation-results.json':(8,8),
  'analysis/evidence/m81/validation-initial-results.json':(11,5),
  'analysis/evidence/m81/policy-only-validation-initial-results.json':(6,10),
  'analysis/evidence/m81/gate-only-ui-expanded-results.json':(7,17),
  'analysis/evidence/m82/m81-streak-risk-results.json':(15,14),
  'analysis/evidence/m82/risk-only-streak-advice-initial-results.json':(1,4),
  'analysis/evidence/m82/risk-only-streak-advice-results.json':(3,2),
  'analysis/evidence/m82/advice-only-risk-compatibility-results.json':(5,11),
  'analysis/evidence/m82/compat-only-risk-ui-results.json':(4,5),
 }
 for rel,n in negatives.items():
  d=evidence(rel);assert (d['pass'],d['fail'])==n,rel
 assert 'TypeError' in (E/'ui-initial-crash.txt').read_text()
 assert len((E/'ui-modal-wait.txt').read_text().splitlines())==11
 assert evidence('analysis/evidence/m82/risk-only-streak-advice-results.json')['feature_fingerprint']==evidence('analysis/evidence/m82/streak-advice-results.json')['feature_fingerprint']
 natives=json.loads((E/'native-runs.json').read_text());assert len(natives)==4
 for row in natives:
  text=(E/row['output']).read_text()
  if row['suite']=='api':assert '121 passed, 0 failed' in text and row['exit_code']==0
  else:assert '205 passed, 1 failed' in text and '20 trades' in text and '0 mismatches' in text and row['exit_code']==1
 assert '22/22 views OK, 0 UI-style failures, 0 console errors' in (E/'smoke.txt').read_text()
 pure=json.loads((E/'pure-regression-runs.json').read_text());assert len(pure)==8 and all(r['exit_code']==0 for r in pure)
 scope=json.loads((E/'SCOPE.json').read_text());assert scope['current_ledger']['done']==82 and scope['current_ledger']['todo']==48
 run(['python3','analysis/gen-progress.py']);assert '**82 done · 2 partial · 48 todo · 0 deliberate no-action · 132 total**' in (ROOT/'analysis/PROGRESS.md').read_text()
 P.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m81-m82-') as td:
  work=Path(td);parent=work/'parent';parent.mkdir()
  with tarfile.open(fileobj=io.BytesIO(run(['git','archive',BASE,'extracted/tradejournal']))) as t:
   for ent in t:
    if ent.isfile():
     rel=PurePosixPath(ent.name).relative_to('extracted/tradejournal');assert allowed(rel) or str(rel).startswith('scripts/fixtures/'),rel
     write(parent,str(rel),t.extractfile(ent).read())
  assert manifest(parent)==guards['parent']
  before=parent;stage_meta=[]
  for name,patch_name,frozen in STAGES:
   after=work/name;after.mkdir()
   if args.capture_stages or name=='full':
    source=APP if name=='full' else Path(frozen)
    for p,h in guards[name].items():
     b=(source/p).read_bytes();assert sha(b)==h,(name,p);write(after,p,b)
    make_patch(before,after,P/patch_name)
   else:
    shutil.rmtree(after);shutil.copytree(before,after)
    run(['git','apply','--check',str(P/patch_name)],after);run(['git','apply',str(P/patch_name)],after)
   assert manifest(after)==guards[name],name
   replay_check(before,after,P/patch_name,work)
   stage_meta.append({'stage':name,'source_manifest':name+'-source.json','source_files':len(guards[name]),'patch':patch_name,**patch_meta(P/patch_name)})
   before=after
  final=before;combined=P/'m81-m82-complete.patch';make_patch(parent,final,combined);replay_check(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir()
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final),'Pristine retains unknown/untracked source'
  assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes()
  cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay_check(pristine,fixed,cumulative,work)
  result={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},
   'ledger':scope['current_ledger'],'feature_assertions':{'pass':282,'fail':0,'probes':10,'inherited_pass':302,'inherited_fail':0,'inherited_probes':12},
   'stages':stage_meta,'combined':patch_meta(combined),'pristine_cumulative':patch_meta(cumulative),
   'fixed_zip':{'source_files':112,'application_byte_differences':0,'credential_db_dependency_dataset_files':0},
   'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],
   'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),
   'scope':'Optional realised profit stop and streak-independent advisory risk; existing grade/drawdown policies unchanged. Native both205/1,20 synthetic fills/0 mismatches, unchanged>20 failure. No broker/provider/pixel/production/edge claim.'}
  (P/'M81-M82-STAGES.json').write_text(json.dumps(result,indent=2)+'\n')
  # Include audit/proof source, not ignored raw datasets/transcripts/dependencies.
  # Exclude current and earlier archive hash companions to avoid self-reference
  # or implying the historical M79 ZIP hash identifies this newer deliverable.
  excluded={'analysis/evidence/m81/archive-sha256.json','analysis/evidence/m79/archive-sha256.json'}
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0')
  archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and p not in excluded}):
    src=ROOT/p
    if src.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,src.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/'
   actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)}
   assert actual==contents(fixed)
   assert len(z.namelist())==len(set(z.namelist()))
   assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist())
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':112,'excluded_from_zip_to_avoid_self_hash':True}
  (E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n')
  print(f'{len(stage_meta)} incremental stages + combined + pristine cumulative: all forward/reverse0 byte differences.')
  print('Fifteen neutral files, exact ledger132/82/2/48, new282/0 + inherited302/0; native205/1 negatives retained.')
  print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
