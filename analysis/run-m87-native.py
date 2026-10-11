#!/usr/bin/env python3
"""Native unchanged scripts, same-server DB cleanup, original d5/current raw /
DECLARED actual synthetic preparation. Processes are managed by Arena tools.
No broker/live price/meditation/current screenshot assertion proof from fixture.
"""
from pathlib import Path
import concurrent.futures,json,runpy
ROOT=Path(__file__).resolve().parent.parent;E=ROOT/'analysis/evidence/m87';APP=ROOT/'extracted/tradejournal'
OLD=runpy.run_path(str(ROOT/'analysis/run-m86-native.py'),run_name='native_helpers');OLD['arm'].__globals__['E']=E
ARMS=[('parent',Path('/tmp/m87-parent/app'),3107,'/tmp/m87-parent-native.db'),('raw',APP,3108,'/tmp/m87-raw-native.db'),('fixture',APP,3109,'/tmp/m87-fixture-native.db')]
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:groups=list(pool.map(OLD['arm'],ARMS))
 rows=[r for g in groups for r in g];(E/'native-runs.json').write_text(json.dumps(rows,indent=2)+'\n')
