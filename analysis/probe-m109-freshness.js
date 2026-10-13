'use strict';
/** M109 day policy: the channel answers on the server’s own UTC day, never on a caller’s
 * date, and asking cannot refresh, extend or roll forward anything it reports. */
const path=require('path');
const S=require('./m109-test-support'),{APP,D,ok,start,finish,snapshot}=S;
const Practice=require(path.join(APP,'src/practice')),StateGate=require(path.join(APP,'src/state-gate')),Intention=require(path.join(APP,'src/intention')),Routine=require(path.join(APP,'src/routine'));
const DAY=86400000;
(async()=>{await finish('M109 day policy and UTC boundaries',async()=>{
  const {user,token,req}=await start('freshness');
  const now=S.now(),today=S.dayOf(now),yesterday=S.dayOf(now-DAY);
  /* A practice session recorded YESTERDAY by the app’s own write path, then read today. */
  S.setNow(now-DAY);
  const idle=await Practice.read(user.userId);
  await Practice.save(user.userId,{action:'start',revision:idle.revision,preset:'p5',bell_interval_seconds:0,ambience:'none',intention:''});
  const running=await Practice.read(user.userId);
  S.setNow(now-DAY+120000);
  await Practice.save(user.userId,{action:'complete',revision:running.revision,note:'recorded yesterday'});
  S.setNow(now);
  const todayOut=await req('/ask',{question:'What have I recorded today?'});
  ok('a session recorded yesterday is not counted, quoted or carried into today',todayOut.status===200&&todayOut.data.answer.some(l=>/0 session\(s\)/.test(l.text))&&!/recorded yesterday/.test(JSON.stringify(todayOut.data))&&todayOut.data.answer.every(l=>l.text.indexOf('120s')===-1));
  ok('the payload names the server’s own UTC day and never the caller’s',todayOut.data.answer.some(l=>l.text.includes('UTC '+today))&&todayOut.data.question==='What have I recorded today?');
  const scoped=await req('/ask',{question:'What have I recorded today?',date:yesterday,from:yesterday,to:today,timezone:'Pacific/Kiritimati'});
  ok('a caller cannot scope, re-date or re-timezone the answer: extras in the body change nothing',JSON.stringify(scoped.data)===JSON.stringify((await req('/ask',{question:'What have I recorded today?'})).data));

  ok('the record itself is untouched: the practice surface still counts it on the day it was made',
    (await Practice.progress(user.userId,{from:yesterday,to:today})).sessions_count===1);

  /* The records that are same-day by design stop being today’s when the day turns. */
  const gate=await req('/state-gate?account_id='+user.accountId,undefined,'GET');
  await req('/state-gate?account_id='+user.accountId,{answers:S.answers(),revision:gate.data.revision},'PUT');
  const intention=await req('/intention?account_id='+user.accountId,undefined,'GET');
  await req('/intention?account_id='+user.accountId,{template:'follow_plan',revision:intention.data.revision},'PUT');
  await D.db.prepare("UPDATE accounts SET routine_window_start='08:00',routine_timezone='UTC' WHERE id=?").run(user.accountId);
  await Routine.current(user.userId,{accountId:user.accountId});
  const cyclesBefore=(await D.db.prepare('SELECT COUNT(*) AS n FROM routine_cycles WHERE user_id=?').get(user.userId)).n;
  const onDay=await req('/ask',{question:'What have I recorded today?'});
  ok('the gate answers, the intention and the routine cycle are all reported as records, each with its own recorded timestamp',
    onDay.data.answer.some(l=>/state-gate answers \(recorded 2026-10-13T12:00:00.000Z/.test(l.text))&&onDay.data.answer.some(l=>/Intention recorded for /.test(l.text))&&onDay.data.answer.some(l=>/Routine cycle /.test(l.text)));

  S.setNow(now+DAY*2);
  const later=await req('/ask',{question:'What have I recorded today?'});
  const gateLine=(later.data.answer.find(l=>/state-gate answers/.test(l.text))||{}).text||'';
  ok('two days later the same question reports no session and no same-day intention, and quotes the gate record with its own age instead of claiming it is today’s',
    later.data.answer.some(l=>/0 session\(s\)/.test(l.text))&&later.data.answer.every(l=>!/Intention recorded for/.test(l.text))&&/recorded 2026-10-13T12:00:00.000Z/.test(gateLine)&&/\d+ minute\(s\) old/.test(gateLine),gateLine);
  const cycleLine=(later.data.answer.find(l=>/Routine cycle/.test(l.text))||{}).text||'';
  ok('the routine cycle is still reported as the stored cycle it is, carrying its own date, instead of being refreshed into today',
    new RegExp('Routine cycle '+S.dayOf(now)).test(cycleLine)&&cycleLine.includes('(UTC'),cycleLine);
  const cyclesAfter=(await D.db.prepare('SELECT COUNT(*) AS n FROM routine_cycles WHERE user_id=?').get(user.userId)).n;
  ok('asking across a day boundary creates no cycle, no reset and no new row of any kind',cyclesAfter===cyclesBefore&&cyclesBefore===1,{before:cyclesBefore,after:cyclesAfter});
  const news=await req('/ask',{question:'Is there news in my window?'});
  ok('the calendar surface refuses to translate unknown into a pass on every day',news.data.answer[0].kind==='unavailable'&&/unknown is not a pass/i.test(news.data.answer[0].text));
  const recordText=JSON.stringify(later.data.answer.filter(l=>l.kind!=='note').map(l=>l.text));
  ok('the records surface never turns counts into a streak, a target or a score',!/\bstreak|\btarget\b|\bgoal\b|\bscore/i.test(recordText),recordText.slice(0,160));
  const before=await snapshot();
  for(const q of ['What have I recorded today?','What is the entry engine reading right now?','Is there news in my window?','What are my risk limits today?'])await req('/ask',{question:q});
  S.setNow(now);
  for(const q of ['What have I recorded today?','What is the entry engine reading right now?'])await req('/ask',{question:q});
  const after=await snapshot();
  ok('reading the same surfaces on two different days still writes nothing at all',JSON.stringify(before)===JSON.stringify(after));
});})().catch(e=>{console.error(e.stack);process.exitCode=1;});
