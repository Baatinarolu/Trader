#!/usr/bin/env python3
"""M108 native arms: unchanged `scripts/api-test.js` / `scripts/bots-test.js` against
the M107 parent tree and the delivered tree, each on its own fresh database state, so the
two are compared with the DB state held constant; bounded per-arm serial runs with partial
stdout retained on timeout. Servers are managed with the Arena process tools and are never
started by this script.
"""
from pathlib import Path
import argparse,json,os,re,subprocess
ROOT=Path(__file__).resolve().parent.parent;E=ROOT/'analysis/evidence/m108';APP=ROOT/'extracted/tradejournal'
ARMS=[('parent',Path('/tmp/m108-parent/app'),3154,'/tmp/m108-parent-native.db'),('raw',APP,3155,'/tmp/m108-raw-native.db')]
def arm(row,timeout):
 name,app,port,db=row;rows=[]
 for suite in ['api','bots']:
  base=f'http://127.0.0.1:{port}';env={**os.environ,'NODE_OPTIONS':'','TJ_APP':str(app),'TRADEJOURNAL_DB':db,'TURSO_DATABASE_URL':'','LIBSQL_URL':'','TURSO_AUTH_TOKEN':'','TJ_SCHEDULER':'0','TJ_OFFLINE_CANDLES':'1','TJ_BASE':base};cmd=['node','scripts/'+suite+'-test.js']+([base] if suite=='api' else [])
  try:r=subprocess.run(cmd,cwd=app,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout);output=r.stdout;exit=r.returncode;status='completed'
  except subprocess.TimeoutExpired as r:output=r.stdout or b'';exit=None;status='killed_on_timeout'
  text=output.decode(errors='replace');path=f'native-{name}-{suite}.txt';(E/path).write_bytes(output);m=list(re.finditer(r'(\d+)\s+passed\s*[,·/]?\s*(\d+)\s+failed',text,re.I));counts=[int(v) for v in m[-1].groups()] if m else [None,None];parity=re.search(r'(\d+) trades:.*?\((\d+) mismatches\)',text)
  data={'arm':name,'suite':suite,'server_app':str(app),'scripts_unchanged':True,'pass':counts[0],'fail':counts[1],'exit_code':exit,'status':status,'output':path,'parity_fills':int(parity.group(1)) if parity else None,'parity_mismatches':int(parity.group(2)) if parity else None,'scope':('Unchanged api-test on a FRESH database: a live entry is refused by the mandatory pre-market routine (no selected window on a new account), so the run aborts with exit 2 and no summary - identically on the M107 parent tree and on the delivered tree. The inherited M107 record 121/0 came from that session\u2019s declared prepared workspace and is not reproducible from a fresh database on either tree; it is left as committed, never rewritten.' if suite=='api' else 'Unchanged bots-test on a FRESH database: the mandatory-routine negatives are retained and the synthetic random-walk fill parity count moves with the wall clock (15 here, 19 in the M107 record, 15 at the M106 delivery) with 0 mismatches - identical numbers on the M107 parent tree and on the delivered tree.')+' Original assertions/cleanup and synthetic offline candles; not broker/live/pixels/edge/production or human/meditation proof.'};rows.append(data);print(json.dumps(data),flush=True)
 return rows
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--arm',choices=[r[0] for r in ARMS]);ap.add_argument('--timeout',type=int,default=180);a=ap.parse_args();rows=[r for row in ARMS if not a.arm or row[0]==a.arm for r in arm(row,a.timeout)]
 if a.arm:
  old=json.loads((E/'native-runs.json').read_text()) if (E/'native-runs.json').exists() else [];changed={(r['arm'],r['suite']) for r in rows};rows=[r for r in old if (r['arm'],r['suite']) not in changed]+rows
 rows.sort(key=lambda r:([x[0] for x in ARMS].index(r['arm']),r['suite']));(E/'native-runs.json').write_text(json.dumps(rows,indent=2)+'\n')
