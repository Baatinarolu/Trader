#!/usr/bin/env python3
"""Guard measured M84/M85 source/evidence; reconstruct eight independent stages,
pristine forward/reverse byte proofs and deterministic source-only ZIP.
First run --capture-stages reads the frozen measured trees. Normal runs use
only durable patches, never ephemeral /tmp baselines/dependencies/databases.
Does not switch branches, read credentials or mutate the application source.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, io, json, shutil, subprocess, tarfile, tempfile, zipfile
ROOT=Path(__file__).resolve().parent.parent
APP=ROOT/'extracted/tradejournal'; E=ROOT/'analysis/evidence/m84'; P=ROOT/'analysis/patches'
BASE='446e705d1fb0ae03d6bbfcd0913145619bd395fe'
STAGES=[
 ('policy','m84-manual-time-policy.patch','/tmp/m84-policy-stage/app'),
 ('ui','m84-manual-time-ui.patch','/tmp/m84-ui-stage/app'),
 ('core','m85-core-journal.patch','/tmp/m85-core-stage/app'),
 ('gate','m85-writing-admission.patch','/tmp/m85-gate-stage/app'),
 ('contract','m85-data-contracts.patch','/tmp/m85-contract-stage/app'),
 ('journal-ui','m85-journal-ui.patch','/tmp/m85-ui-stage/app'),
 ('retention','m85-coexisting-retention.patch','/tmp/m85-retention-stage/app'),
 ('full','m84-m85-documentation.patch',None),
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
 current=guards['full'];assert len(current)==114
 assert all(sha((APP/p).read_bytes())==h for p,h in current.items()),'Measured app changed'
 assert all(guards['parent'][p]==current[p] for p in NEUTRAL),'Neutral math/engine/scripts/lock changed'
 assert {p for p in current if current[p]!=guards['retention'][p]}=={'README.md','docs/GUARDRAILS.md'},'Documentation changed runtime'
 for p,h in json.loads((E/'harness-source.json').read_text()).items():assert sha((ROOT/p).read_bytes())==h,p
 feature=json.loads((E/'feature-summary.json').read_text());assert feature['pass']==244 and feature['fail']==0 and len(feature['probes'])==9
 for row in feature['probes']:
  d=json.loads((E/(row['evidence']+'-results.json')).read_text());assert [d['pass'],d['fail']]==[row['pass'],0] and row['exit_code']==0
 inherited=json.loads((E/'isolated-regression-runs.json').read_text());assert len(inherited)==22 and sum(r['pass'] for r in inherited)==584 and all(r['fail']==0 and r['exit_code']==0 for r in inherited)
 final_isolated=json.loads((E/'final-isolated-regression-runs.json').read_text());assert len(final_isolated)==22 and sum(r['pass'] for r in final_isolated)==584 and all(r['fail']==0 and r['exit_code']==0 for r in final_isolated)
 original=json.loads((E/'original-regression-runs.json').read_text());assert sum(r['pass'] for r in original)==465 and sum(r['fail'] for r in original)==73 and sum(r['exit_code']!=0 for r in original)==11
 # Negative controls and implementation/harness errors remain discoverable.
 negatives={
  'analysis/evidence/m84/parent-time-results.json':(3,36),
  'analysis/evidence/m84/parent-time-initial-results.json':(3,31),
  'analysis/evidence/m84/time-initial-results.json':(0,1),
  'analysis/evidence/m84/policy-only-ui-results.json':(3,11),
  'analysis/evidence/m85/m84-only-core-results.json':(3,30),
  'analysis/evidence/m85/core-only-reflection-results.json':(7,27),
  'analysis/evidence/m85/core-only-consumers-results.json':(24,40),
  'analysis/evidence/m85/gate-only-contracts-results.json':(8,5),
  'analysis/evidence/m85/contract-only-ui-results.json':(10,15),
  'analysis/evidence/m85/ui-only-retention-results.json':(1,4),
  'analysis/evidence/m84/isolated-history-initial-results.json':(21,1),
 }
 for rel,n in negatives.items():
  d=evidence(rel);assert (d['pass'],d['fail'])==n,rel
 assert 'LibsqlBatchError' in (E/'time-initial.txt').read_text()
 natives=json.loads((E/'native-runs.json').read_text());assert len(natives)==4
 for row in natives:
  text=(E/row['output']).read_text()
  if row['suite']=='api':assert '121 passed, 0 failed' in text and row['exit_code']==0
  else:assert '205 passed, 1 failed' in text and '20 trades' in text and '0 mismatches' in text and row['exit_code']==1
 assert '21/21 views OK, 0 UI-style failures, 0 console errors' in (E/'smoke.txt').read_text()
 pure=json.loads((E/'pure-regression-runs.json').read_text());assert len(pure)==8 and all(r['exit_code']==0 for r in pure)
 scope=json.loads((E/'SCOPE.json').read_text());assert scope['ledger']['done']==84 and scope['ledger']['todo']==46
 run(['python3','analysis/gen-progress.py']);assert '**84 done · 2 partial · 46 todo · 0 deliberate no-action · 132 total**' in (ROOT/'analysis/PROGRESS.md').read_text()
 P.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tj-m84-m85-') as td:
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
  final=before;combined=P/'m84-m85-complete.patch';make_patch(parent,final,combined);replay_check(parent,final,combined,work)
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
   'ledger':scope['ledger'],'feature_assertions':{'pass':244,'fail':0,'probes':9,'isolated_inherited_pass':584,'isolated_inherited_fail':0,'isolated_probes':22,'original_inherited_pass':465,'original_inherited_fail':73,'original_nonzero_exits':11,'isolation':'New M85 writing/prompt prerequisites held fulfilled and syntheticNeutral; NOT full current-policy claim. Actual new/native tests no adapter.'},
   'stages':stage_meta,'combined':patch_meta(combined),'pristine_cumulative':patch_meta(cumulative),
   'fixed_zip':{'source_files':114,'application_byte_differences':0,'credential_db_dependency_dataset_files':0},
   'engine_files_unchanged':CORE,'other_neutral_files':NEUTRAL[len(CORE):],
   'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),
   'scope':'Optional manual-time warning and mandatory post-loss/core journaling; truthful recording and old observations preserved; legacy584 isolated, actual new/native no adapter. Native both205/1,20 synthetic fills/0 mismatches, unchanged>20 failure. No broker/provider/pixel/production/edge claim.'}
  (P/'M84-M85-STAGES.json').write_text(json.dumps(result,indent=2)+'\n')
  # Include audit/proof source, not ignored raw datasets/transcripts/dependencies.
  # Exclude current and earlier archive hash companions to avoid self-reference
  # or implying the historical M79 ZIP hash identifies this newer deliverable.
  excluded={'analysis/evidence/m84/archive-sha256.json','analysis/evidence/m81/archive-sha256.json','analysis/evidence/m79/archive-sha256.json'}
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
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':114,'excluded_from_zip_to_avoid_self_hash':True}
  (E/'archive-sha256.json').write_text(json.dumps(companion,indent=2)+'\n')
  print(f'{len(stage_meta)} incremental stages + combined + pristine cumulative: all forward/reverse0 byte differences.')
  print('Fifteen neutral files, exact ledger132/84/2/46, actual new244/0 + declared-isolated584/0; native205/1 negatives retained.')
  print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
