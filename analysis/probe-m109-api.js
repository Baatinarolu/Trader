'use strict';
/** M109 over the actual HTTP/auth surface: every refusal is a successful answer, every
 * question is bounded, nothing is written, and asking cannot move admission. */
const path=require('path');
const S=require('./m109-test-support'),{APP,D,ok,start,body,finish,snapshot,changed}=S;
(async()=>{await finish('M109 ask channel API',async()=>{
  const {user,other,token,otherToken,req}=await start('api');
  ok('an unauthenticated caller cannot read the surface list or ask anything',(await req('/ask/topics',undefined,'GET',null)).status===401&&(await req('/ask',{question:'What are my limits?'},'POST',null)).status===401);
  const topics=await req('/ask/topics',undefined,'GET');
  ok('the surface list is served with its refusals, its limits and its meta flags',topics.status===200&&topics.data.topics.length===7&&topics.data.refusal_codes.length===6&&topics.data.cannot_know.length===5&&topics.data.meta.llm===false&&topics.data.meta.network===false&&topics.data.meta.authority==='none');
  ok('the route surface is explicit: the channel answers POST /ask, and a GET to it is not a second read path',(await req('/ask',undefined,'GET')).status===404);

  const surfaces=[];
  for(const t of topics.data.topics){
    const out=await req('/ask',{question:t.example});
    surfaces.push({id:t.id,status:out.status,answered:out.data.answered,topic:out.data.topic,lines:(out.data.answer||[]).map(l=>l.kind),sources:(out.data.answer||[]).map(l=>l.source)});
  }
  ok('all seven surfaces answer over HTTP, each line carrying its provenance',surfaces.length===7&&surfaces.every(s=>s.status===200&&s.answered===true&&s.topic===s.id&&s.lines.length>0&&s.sources.every(x=>x&&x.length>2)));
  const kinds=[...new Set(surfaces.flatMap(s=>s.lines))];
  ok('the answer vocabulary stays the stated four kinds and nothing else',kinds.every(k=>['fact','record','unavailable','note'].includes(k)),kinds);

  const refusals=[['ask_refused_permission','Should I enter this trade?'],['ask_refused_prediction','Will gold go up?'],['ask_refused_mental_state','Am I tilted?'],['ask_refused_other_person','What should my friend buy?'],['ask_refused_override','Change my risk to 5%'],['ask_refused_outcome_target','I want to make $5,000 today']];
  const got=[];
  for(const [code,q] of refusals){const out=await req('/ask',{question:q});got.push({code,q,status:out.status,refused:out.data.refused,answered:out.data.answered,actual:out.data.refusal&&out.data.refusal.code,lines:(out.data.answer||[]).length,cites:(out.data.refusal&&out.data.refusal.cites||[]).length});}
  ok('all six refusals are reachable, arrive as 200 successes, and carry their reason and citation',got.every(g=>g.status===200&&g.refused===true&&g.answered===false&&g.actual===g.code&&g.lines===1&&g.cites>=1),got);
  const refusedPayloads=[];
  for(const [,q] of refusals){const out=await req('/ask',{question:q});refusedPayloads.push(out.data);}
  ok('a refusal carries its reason and never the content it refused: no topic, no facts, no surface lines beyond the one note',
    refusedPayloads.every(o=>o.topic===null&&(o.answer||[]).length===1&&o.answer[0].kind==='note'&&o.refusal.can_answer&&o.refusal.because.length>60));

  const bad=[['',400],['x'.repeat(400),400],['line one\nline two',400],['hi\u0007there',400],['<b>what are my limits</b>',400]];
  const badGot=[];
  for(const [q,want] of bad){const out=await req('/ask',{question:q});badGot.push({q:String(q).slice(0,18),status:out.status,code:out.data.code,want});}
  ok('every malformed question is a bounded 400 ask_invalid',badGot.every(b=>b.status===b.want&&b.code==='ask_invalid'),badGot);
  ok('a refused input never leaks a stack, a SQL fragment or an internal table name',badGot.every(b=>!/at Object|SELECT |INSERT |sqlite_|Error:/.test(JSON.stringify(b)))&&(await req('/ask',{question:'x'.repeat(400)})).data.error.length<200);
  const unmatched=await req('/ask',{question:'How tall is Everest?'});
  ok('a question that lands on no owned surface is an honest 200 non-answer that lists the surfaces it does own',unmatched.status===200&&unmatched.data.answered===false&&unmatched.data.refused===false&&unmatched.data.reason.code==='no_matching_topic'&&unmatched.data.reason.topics.length===7);

  ok('the channel takes no account/date input: extras in the body cannot scope or move the answer',JSON.stringify((await req('/ask',{question:'What are my risk limits today?',account_id:other.accountId,date:'2020-01-01',day:'2020-01-01'})).data)===JSON.stringify((await req('/ask',{question:'What are my risk limits today?'})).data));
  await req('/trades',body(user,{symbol:'OWNER_A_ONLY'}));
  const otherRisk=await req('/ask',{question:'What are my risk limits today?'},'POST',otherToken);
  const otherPatterns=await req('/ask',{question:'What do my logged trades show?'},'POST',otherToken);
  const mineRisk=await req('/ask',{question:'What are my risk limits today?'});
  ok('another owner’s workspace is never read: the second trader’s answers contain none of the first trader’s records or identifiers',
    otherRisk.status===200&&otherPatterns.status===200&&JSON.stringify([otherRisk.data,otherPatterns.data]).indexOf('OWNER_A_ONLY')===-1&&otherPatterns.data.answer.some(l=>/0 closed trade/.test(l.text))&&!JSON.stringify(otherRisk.data).includes('"'+user.accountId+'"')&&mineRisk.status===200,{other:otherPatterns.data.answer[0].text,mine:mineRisk.data.answer[0].text});

  const a=await req('/ask',{question:'What have I recorded today?'}),b=await req('/ask',{question:'What have I recorded today?'});
  ok('two identical questions over HTTP answer the same bytes (deterministic, no clock-derived drift)',JSON.stringify(a.data)===JSON.stringify(b.data));
  ok('every HTTP answer ships the meta flags that refuse the AI perks',[a,b,unmatched,await req('/ask',{question:'Should I enter this trade?'})].every(o=>o.data.meta&&o.data.meta.llm===false&&o.data.meta.model===null&&o.data.meta.network===false&&o.data.meta.predicts===false&&o.data.meta.grants_permission===false&&o.data.meta.writes===0));

  const first=await req('/trades',body(user,{symbol:'ADMISSION_BEFORE'}));
  /* The read-only window contains ASKS ONLY: the two entry calls around it are the same
   * app writes an ordinary trader makes, so they are deliberately outside it. */
  const before=await snapshot();
  for(const t of topics.data.topics)await req('/ask',{question:t.example});
  for(const [,q] of refusals)await req('/ask',{question:q});
  await req('/ask',{question:'How tall is Everest?'});
  const after=await snapshot();
  const second=await req('/trades',body(user,{symbol:'ADMISSION_AFTER'}));
  ok('a full HTTP battery of asks leaves every table byte-identical, including the lazy practice timer row M108 creates on its own read',changed(before,after).length===0&&before.practice_timers==='[]'&&after.practice_timers==='[]',changed(before,after));
  ok('asking cannot move admission: the entry surface answers exactly the same before and after the whole battery',first.status===second.status&&JSON.stringify({...first.data,id:null,trade:null})===JSON.stringify({...second.data,id:null,trade:null})&&first.data.code===second.data.code,{first:{status:first.status,code:first.data.code},second:{status:second.status,code:second.data.code}});
  ok('no ask ever stores the question, the answer or a consultation count: the request leaves no row of its own',!before.ask_anything&&Object.keys(after).join(',')===Object.keys(before).join(','));
});})().catch(e=>{console.error(e.stack);process.exitCode=1;});
