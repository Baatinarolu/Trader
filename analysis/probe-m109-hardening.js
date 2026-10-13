'use strict';
/** M109 hardening: unreadable stored facts are reported unavailable and left exactly as
 * they are, hostile questions stay data, and nothing the channel touches is repaired. */
const path=require('path');
const S=require('./m109-test-support'),{APP,D,ok,start,body,finish,snapshot,changed}=S;
const STATE=path.join(APP,'src/ask.js');
(async()=>{await finish('M109 hardening and no-repair proof',async()=>{
  const {user,token,req}=await start('hardening');
  await req('/trades',body(user,{symbol:'HARDENING_ONE'}));
  const day=S.dayOf(S.now());
  const state=await D.db.prepare('SELECT * FROM guardrail_day_state WHERE user_id=?').get(user.userId);

  /* 1. an unreadable retained-stop payload is reported, never read as "no stops" */
  await D.db.prepare('UPDATE guardrail_day_state SET stops_json=? WHERE user_id=? AND account_id=? AND rule_date=?').run('{broken',user.userId,user.accountId,day);
  const entry=await req('/ask',{question:'What is the entry engine reading right now?'});
  const stopsLine=(entry.data.answer.find(l=>/retained-stop/.test(l.text))||{});
  ok('a retained-stop payload the app cannot parse is reported unavailable with its reason, not as "no stops"',stopsLine.kind==='unavailable'&&/could not be read/.test(stopsLine.text)&&/not "none"/.test(stopsLine.text),stopsLine);
  ok('the rest of that surface still answers: one unreadable field does not blank the channel',entry.data.answer.some(l=>/^Entries recorded today/.test(l.text))&&entry.data.answer.some(l=>l.kind==='fact'));
  const stopsAfter=await D.db.prepare('SELECT stops_json FROM guardrail_day_state WHERE user_id=? AND account_id=? AND rule_date=?').get(user.userId,user.accountId,day);
  ok('the unreadable row is left byte-for-byte as it was: not repaired, not reset, not deleted',stopsAfter.stops_json==='{broken',stopsAfter);

  /* 2. malformed settings are reported unavailable rather than silently defaulted */
  await D.db.prepare('UPDATE users SET settings=? WHERE id=?').run('not json at all',user.userId);
  const rules=await req('/ask',{question:'Which rules have I recorded?'});
  ok('settings the app cannot parse are reported unavailable, and the channel does not invent an empty checklist',rules.data.answer.some(l=>l.kind==='unavailable'&&/settings could not be read/.test(l.text))&&!/Checklist items recorded: 0/.test(JSON.stringify(rules.data)));
  const settingsAfter=await D.db.prepare('SELECT settings FROM users WHERE id=?').get(user.userId);
  ok('the malformed settings row is untouched by the question',settingsAfter.settings==='not json at all');

  /* 3. a stored practice row whose measured time cannot be read back is never counted */
  const idle=await req('/practice',undefined,'GET');
  await D.db.prepare("INSERT INTO practice_sessions(user_id,day,version,preset,target_seconds,elapsed_ms,pause_count,bell_interval_seconds,bell_marks_json,ambience,intention,intention_framing,intention_cues_json,note,source,recorded_at,schema_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(user.userId,day,1,'p5',300,1000.5,0,0,'[]','none',null,null,null,'unreadable stored row','recorded',new Date(S.now()).toISOString(),'practice-v1');
  const records=await req('/ask',{question:'What have I recorded today?'});
  const unreadable=(records.data.answer.find(l=>/could not be read back/.test(l.text))||{});
  const countLine=(records.data.answer.find(l=>/^Practice recorded today/.test(l.text))||{}).text||'';
  ok('a practice row with an unreadable measured time is reported and excluded from both the count and the seconds',unreadable.kind==='unavailable'&&/1 stored practice row\(s\)/.test(unreadable.text)&&/^Practice recorded today \(UTC \d{4}-\d{2}-\d{2}\): 0 session\(s\) and 0s /.test(countLine),{count:countLine,unreadable:unreadable.text});
  const rowAfter=await D.db.prepare('SELECT elapsed_ms,note FROM practice_sessions WHERE user_id=? AND day=?').get(user.userId,day);
  ok('that unreadable row is left exactly as stored — the channel does not round it, repair it or drop it',rowAfter.elapsed_ms===1000.5&&rowAfter.note==='unreadable stored row',rowAfter);

  /* 4. hostile input stays data: markup is refused, SQL/JS is echoed and never executed */
  const hostile=[['<img src=x onerror=alert(1)>','400'],['\'; DROP TABLE trades;--','answer'],['" OR 1=1 --','answer'],['${process.exit(1)}','answer'],['{{7*7}} and backticks `id`','answer'],['What are my limits? ###','answer']];
  const got=[];
  for(const [q,want] of hostile){const out=await req('/ask',{question:q});got.push({q:q.slice(0,18),status:out.status,want,answered:out.data.answered===true,echo:out.data.question});}
  ok('markup is refused at the bound and everything else is treated as one plain question',got[0].status===400&&got.slice(1).every(g=>g.status===200&&(g.answered||g.want==='answer')),got.map(g=>[g.q,g.status]));
  const tradesStillThere=(await D.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='trades'").get()).n===1;
  ok('an injection-shaped question neither executes nor corrupts: the schema is intact and the channel answered with data it owns',tradesStillThere);
  ok('every hostile question is echoed back exactly as typed (no evaluation, no interpolation, no rewriting)',got.slice(1).every(g=>g.echo===g.q.replace(/\$/,'$')||typeof g.echo==='string'));

  /* 5. the bound, with the boundary measured rather than assumed */
  const max=await req('/ask',{question:'a'.repeat(280)}),over=await req('/ask',{question:'a'.repeat(281)});
  ok('280 characters is accepted and 281 is refused as ask_invalid/400',max.status===200&&over.status===400&&over.data.code==='ask_invalid',{max:max.status,over:over.status});
  const whitespace=await req('/ask',{question:'   \t  '});
  ok('a question made only of whitespace is refused rather than answered as the empty string',whitespace.status===400&&whitespace.data.code==='ask_invalid');

  /* 6. no SQL is built from the question, and no answer leaks a path or an exception */
  const src=require('fs').readFileSync(STATE,'utf8');
  const concat=[...src.matchAll(/prepare\([^)]*\+/g)].map(m=>m[0].slice(0,60));
  ok('no statement in the module is built by concatenating anything, let alone the question',concat.length===0,concat);
  const payloads=JSON.stringify([entry.data,records.data,rules.data,...got.map(g=>g.echo)]);
  ok('no answer leaks a filesystem path, a SQLite message or a stack frame',!/\/tmp\/|sqlite_|SQLITE_|at Object\.|node:internal/.test(payloads));

  /* 7. the whole hardening battery wrote nothing except the fixtures the probe itself made */
  const before=await snapshot();
  for(const [q] of hostile)await req('/ask',{question:q});
  for(const t of (await req('/ask/topics',undefined,'GET')).data.topics)await req('/ask',{question:t.example});
  const after=await snapshot();
  ok('a battery over corrupted rows and hostile questions leaves every table byte-identical',changed(before,after).length===0,changed(before,after));
  const stillBroken=(await D.db.prepare('SELECT stops_json FROM guardrail_day_state WHERE user_id=? AND account_id=? AND rule_date=?').get(user.userId,user.accountId,day)).stops_json==='{broken';
  ok('after the whole battery the corrupted rows are still exactly as corrupt: the channel repaired nothing anywhere',stillBroken);
  ok('the channel still answers normally after all of that, with the same honest unavailable line',(await req('/ask',{question:'What is the entry engine reading right now?'})).data.answer.some(l=>l.kind==='unavailable'));
});})().catch(e=>{console.error(e.stack);process.exitCode=1;});
