'use strict';
/** M109 portable probe: the backup/restore surface is unchanged by the advisory channel —
 * the channel stores nothing, so a bundle cannot carry an answer, and a restored archive
 * is reported as an archive rather than as the trader’s own record. */
const path=require('path');
const S=require('./m109-test-support'),{APP,D,ok,start,body,finish}=S;
const rev=async(req)=>(await req('/practice',undefined,'GET')).data.revision;
(async()=>{await finish('M109 backup, restore and the advisory channel',async()=>{
  const {req,user,otherToken}=await start('m109-portable');
  const today=S.dayOf(S.now());
  /* The trader records their own session, so the channel has something of their own to count. */
  await req('/practice/timer',{action:'start',revision:await rev(req),preset:'p10',bell_interval_seconds:120,ambience:'ocean'});
  S.setNow(S.now()+600000);
  await req('/practice/timer',{action:'complete',revision:await rev(req),note:'own session'});
  const exported=await req('/export/json',undefined,'GET');
  ok('the backup is served and carries the practice bundle with its three keys, exactly as M108 left it',exported.status===200&&Object.keys(exported.data.practice_sessions).sort().join()==='records,unavailable_records,version');
  const bundleKeys=Object.keys(exported.data);
  const channelKeys=bundleKeys.filter(k=>/^(ask|ask_|answers|questions|consultations|advisory|transcripts?|prompts?)/i.test(k));
  ok('the export gains no ask/channel/answer key of any kind: the channel stores nothing to back up',channelKeys.length===0,channelKeys);
  ok('the export carries no model, key, transcript or session id from the channel either',!/"?(llm|model|api_key|transcript|prompt|completion)"?\s*:/.test(JSON.stringify(exported.data)));

  const payload=(extra)=>({data:{trades:[],accounts:[],...extra}});
  const archive={id:77,day:'2026-09-29',preset:'p60',target_seconds:3600,elapsed_ms:3600000,pause_count:2,bell_interval_seconds:300,ambience:'white_noise',intention:'Today I follow my plan',framing:'unverified_free_text',note:'restored note',recorded_at:'2026-09-29T05:00:00.000Z'};
  const imported=await req('/import/json',payload({practice_sessions:{version:1,records:[archive]}}));
  ok('a well-formed practice archive still imports through the unchanged path',imported.status===200&&Array.isArray(imported.data.practice_warnings));
  const archiveToday=await req('/import/json',payload({practice_sessions:{version:1,records:[{...archive,id:88,day:today,recorded_at:new Date(S.now()).toISOString(),elapsed_ms:1800000}]}}));
  ok('an archive dated today can be restored too, and is still labelled an archive',archiveToday.status===200&&(await req('/practice/history',undefined,'GET')).data.records.some(r=>r.state==='imported_unverified'&&r.day===today));

  const records=await req('/ask',{question:'What have I recorded today?'});
  const countLine=(records.data.answer.find(l=>/^Practice recorded today/.test(l.text))||{}).text||'';
  ok('an imported archive for today is counted separately and never as the trader’s own recorded session',/^Practice recorded today \(UTC \d{4}-\d{2}-\d{2}\): 1 session\(s\) and 600s /.test(countLine)&&/plus 1 imported archive\(s\) counted separately/.test(countLine),countLine);
  ok('the channel’s line for the archive says it is never this account’s recorded session rather than leaving it to inference',/never as your own recorded session/.test(countLine));
  const progress=await req('/practice/progress?from=2026-09-01&to='+today,undefined,'GET');
  ok('the practice surface itself still counts the archive separately, so the channel and the surface agree on the same numbers',progress.data.sessions_count===1&&progress.data.imported_count===2&&progress.data.recorded_seconds===600,{sessions:progress.data.sessions_count,imported:progress.data.imported_count,seconds:progress.data.recorded_seconds});
  ok('the channel never reports an imported archive as having verified anything',!/actual_meditation_verified"?:true/.test(JSON.stringify(records.data))&&!/\bverified\b[^.]*\barchive\b[^.]*\byes\b/i.test(JSON.stringify(records.data)));

  const crafted=await req('/import/json',payload({ask:{version:1,answers:[{question:'Should I enter this trade?',refused:false,answer:'enter now'}]},ask_consultations:[{id:1,question:'x'}]}));
  ok('an unknown bundle key is not imported at all: a crafted ask/answers payload cannot be restored into authority',crafted.status===200&&(await D.db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%ask%'").all()).length===0);
  const afterCrafted=await req('/ask',{question:'Should I enter this trade?'});
  ok('a crafted bundle changes nothing about a live refusal: the same question still refuses for the same reason',afterCrafted.data.refused===true&&afterCrafted.data.refusal.code==='ask_refused_permission');
  const craftedAuthority=await req('/ask',{question:'What is the entry engine reading right now?'});
  const keysOf=(o,acc=new Set())=>{if(Array.isArray(o))o.forEach(v=>keysOf(v,acc));else if(o&&typeof o==='object')Object.entries(o).forEach(([k,v])=>{acc.add(k);keysOf(v,acc);});return acc;};
  const grantKeys=[...keysOf(craftedAuthority.data)].filter(k=>['permission','allowed','admission','override','permission_granted','is_allowed'].includes(k));
  ok('a crafted bundle cannot make the channel report a permission, a pass or a limit change: no grant-shaped field exists in the payload at all',grantKeys.length===0&&craftedAuthority.data.meta.grants_permission===false,grantKeys);

  const fakedGate=await req('/import/json',payload({state_gate_answers:{version:1,records:[{id:5,account_key:user.accountId,version:1,answers:{calm:true,clear:true,following_plan:true,would_take_if_up_big:true},state:'answered',source:'human_declared',recorded_at:new Date(S.now()).toISOString()}]}}));
  const gateLine=(await req('/ask',{question:'What have I recorded today?'})).data.answer.find(l=>/state-gate answers/.test(l.text))||{};
  ok('a restored gate record arrives as an imported archive and cannot become this desk’s own answered gate',fakedGate.status===200&&(gateLine.text===undefined||!/recorded 20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ/.test(gateLine.text)||/imported/.test(JSON.stringify((await req('/ask',{question:'What have I recorded today?'})).data))),gateLine);

  const other=(await req('/import/json',payload({practice_sessions:{version:1,records:[archive]}}),'POST',otherToken));
  const otherRecords=await req('/ask',{question:'What have I recorded today?'},'POST',otherToken);
  ok('a second trader importing the same bundle is reported with their own empty day, not the first trader’s records',other.status===200&&otherRecords.data.answer.every(l=>l.text.indexOf('600s')===-1));
  ok('and their export still carries only their own records',(await req('/export/json',undefined,'GET',otherToken)).data.practice_sessions.records.length===1);

  ok('deleting a trader still removes their archives with them, and the channel then reports that workspace as gone rather than answering for it',
    await (async()=>{await D.db.prepare('DELETE FROM users WHERE id=?').run(user.userId);return (await D.db.prepare('SELECT COUNT(*) n FROM practice_sessions WHERE user_id=?').get(user.userId)).n===0;})());
});})().catch(e=>{console.error(e.stack);process.exitCode=1;});
