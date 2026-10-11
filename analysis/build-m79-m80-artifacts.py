#!/usr/bin/env python3
"""Guarded M79/M80 independent stages, pristine forward/reverse byte proofs,
source-only deterministic ZIP. First build: --capture-stages consumes the frozen
measured /tmp trees once. Later builds reconstruct from durable patches alone.
Never reads credentials/DBs/dependencies or changes repository branches.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, io, json, shutil, subprocess, tarfile, tempfile, zipfile
ROOT=Path(__file__).resolve().parent.parent
APP=ROOT/'extracted/tradejournal'; E=ROOT/'analysis/evidence/m79'; P=ROOT/'analysis/patches'
BASE='fdaa2bc5cd7922df094c53e3991627dc7c1c23ba'
STAGES=[
 ('cap','m83-m113-cap-policy.patch','/tmp/m79-cap-stage/app'),
 ('enforcement','m79-enforcement.patch','/tmp/m79-enforcement-stage/app'),
 ('history','m90-rule-history.patch','/tmp/m79-history-stage/app'),
 ('override','m80-reason-overrides.patch','/tmp/m80-override-stage/app'),
 ('ui','m80-reason-ui.patch','/tmp/m80-ui-stage/app'),
 ('clipboard','m80-copy-price-compatibility.patch','/tmp/m80-clipboard-stage/app'),
 ('account','m79-account-forwarding.patch','/tmp/m79-account-stage/app'),
 ('compat','m80-copy-value-compatibility.patch','/tmp/m79-copy-compat-stage/app'),
 ('retention','m79-durable-day-state.patch','/tmp/m79-retention-stage/app'),
 ('validation','m79-validation-contracts.patch','/tmp/m79-validation-stage/app'),
 ('fixtures-initial','m79-native-fixture-initial.patch','/tmp/m79-fixtures-initial-stage/app'),
 ('fixtures','m79-native-fixture-research.patch','/tmp/m79-fixtures-final-stage/app'),
 ('full','m79-m80-documentation.patch',None),
]
CORE=['src/bots/'+n+'.js' for n in ['setup','topdown','smc','momentum','predict','entry-models','entry-preference','targets','stops','protected']]
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
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--capture-stages',action='store_true');args=parser.parse_args()
 guards={n:json.loads((E/(n+'-source.json')).read_text()) for n in ['parent']+[s[0] for s in STAGES]}
 current=guards['full'];assert len(current)==112
 assert all(sha((APP/p).read_bytes())==h for p,h in current.items()),'Final measured app changed'
 assert all(guards['parent'][p]==current[p] for p in CORE),'Engine/geometry source changed'
 for p,h in json.loads((E/'harness-source.json').read_text()).items():assert sha((ROOT/p).read_bytes())==h,p
 feature=json.loads((E/'feature-summary.json').read_text());assert feature['pass']==302 and feature['fail']==0 and len(feature['probes'])==12
 for row in feature['probes']:
  d=json.loads((E/(row['evidence']+'-results.json')).read_text());assert [d['pass'],d['fail']]==[row['pass'],0]
 assert json.loads((E/'day-retention-results.json').read_text())['fail']==1,'Lost original substantive negative'
 assert json.loads((E/'compat-durable-results.json').read_text())['fail']==28
 assert json.loads((E/'retention-validation-results.json').read_text())['fail']==11
 assert json.loads((E/'native-runs.json').read_text())==[json.loads((E/(n+'-exit.json')).read_text()) for n in ['api-full','bots-full','api-parent-identical-fixtures','bots-parent-identical-fixtures']]
 for n in ['api-full','api-parent-identical-fixtures']:assert '121 passed, 0 failed' in (E/(n+'.txt')).read_text()
 for n in ['bots-full','bots-parent-identical-fixtures']:
  text=(E/(n+'.txt')).read_text();assert '204 passed, 2 failed' in text and '19 trades' in text and '0 mismatches' in text
 assert '22/22 views OK, 0 UI-style failures, 0 console errors' in (E/'smoke.txt').read_text()
 for r in json.loads((E/'pure-regression-runs.json').read_text()):assert r['exit_code']==0,r
 run(['python3','analysis/gen-progress.py']);assert '**80 done · 2 partial · 50 todo · 0 deliberate no-action · 132 total**' in (ROOT/'analysis/PROGRESS.md').read_text()
 with tempfile.TemporaryDirectory(prefix='tj-m79-m80-') as td:
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
  final=before;combined=P/'m79-m80-complete.patch';make_patch(parent,final,combined);replay_check(parent,final,combined,work)
  pristine=work/'pristine';pristine.mkdir()
  with zipfile.ZipFile(ROOT/'tradingpro-main.zip') as z:
   for ent in z.infolist():
    if not ent.is_dir() and ent.filename.startswith('tradejournal/'):
     rel=PurePosixPath(ent.filename).relative_to('tradejournal')
     if allowed(rel) or str(rel).startswith('scripts/fixtures/'):write(pristine,str(rel),z.read(ent))
  fixed=work/'fixed';shutil.copytree(pristine,fixed)
  for p,b in contents(final).items():write(fixed,p,b)
  assert contents(fixed)==contents(final),'Pristine retains unknown/untracked extra source'
  assert (pristine/'package-lock.json').read_bytes()==(fixed/'package-lock.json').read_bytes()==(APP/'package-lock.json').read_bytes()
  cumulative=P/'applied-so-far.patch';make_patch(pristine,fixed,cumulative);replay_check(pristine,fixed,cumulative,work)
  result={'base_commit':BASE,'pristine_zip':{'file':'tradingpro-main.zip','sha256':sha((ROOT/'tradingpro-main.zip').read_bytes())},
   'ledger':{'total':132,'done':80,'partial':2,'todo':50,'no_action':0,'partition_groups':8},'feature_assertions':{'pass':302,'fail':0,'probes':12},
   'stages':stage_meta,'combined':patch_meta(combined),'pristine_cumulative':patch_meta(cumulative),
   'fixed_zip':{'source_files':112,'application_byte_differences':0,'credential_db_dependency_dataset_files':0},
   'engine_files_unchanged':CORE,'package_lock_sha256':sha((APP/'package-lock.json').read_bytes()),
   'scope':'Personal rule admission/reason/history and dependent cap; honest recording preserved; no broker, live-feed, hosted/pixel or market-edge validation. Native both arms204/2 (19fills/0mismatches), floors unchanged.'}
  (P/'M79-M80-STAGES.json').write_text(json.dumps(result,indent=2)+'\n')
  paths=run(['git','ls-files','--cached','--others','--exclude-standard','-z','analysis']).decode().split('\0')
  excluded='analysis/evidence/m79/archive-sha256.json'
  archive=ROOT/'tradingpro-fixed.zip'
  with zipfile.ZipFile(archive,'w') as z:
   for p,b in contents(fixed).items():add_zip(z,'tradingpro-fixed/tradejournal/'+p,b)
   for p in sorted({p for p in paths if p and p!=excluded}):
    src=ROOT/p
    if src.is_file() and allowed(PurePosixPath(p)):add_zip(z,'tradingpro-fixed/'+p,src.read_bytes())
  with zipfile.ZipFile(archive) as z:
   prefix='tradingpro-fixed/tradejournal/'
   actual={n.removeprefix(prefix):z.read(n) for n in z.namelist() if n.startswith(prefix)}
   assert actual==contents(fixed)
   assert len(z.namelist())==len(set(z.namelist()))
   assert not any('/.git/' in n or '/node_modules/' in n or '/.env' in n or '.db' in PurePosixPath(n).suffixes for n in z.namelist())
  companion={'file':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes()),'source_files':112,'excluded_from_zip_to_avoid_self_hash':True}
  (ROOT/excluded).write_text(json.dumps(companion,indent=2)+'\n')
  print(f'{len(stage_meta)} incremental stages + combined + pristine cumulative: all forward/reverse 0 byte differences.')
  print('Ten engine files/package lock unchanged. Exact ledger132/80/2/50;302/0 feature assertions, native bot2 negatives retained.')
  print(json.dumps(companion,indent=2))
if __name__=='__main__':main()
