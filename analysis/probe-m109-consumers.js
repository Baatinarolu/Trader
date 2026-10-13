'use strict';
/** M109 consumers: the channel reads the app’s existing findings and no engine reads the
 * channel — measured against the same endpoints the dashboard already uses. */
const fs=require('fs'),path=require('path');
const S=require('./m109-test-support'),{APP,D,ok,start,body,finish}=S;
const src=(f)=>fs.readFileSync(path.join(APP,f),'utf8');
const numOf=(text,re)=>{const m=String(text).match(re);return m?Number(m[1]):null;};
(async()=>{await finish('M109 consumers and separation',async()=>{
  const {user,token,req}=await start('consumers');
  await req('/trades',body(user,{symbol:'CONSUMER_ONE'}));
  await req('/trades',body(user,{symbol:'CONSUMER_TWO'}));
  const briefing=await req('/briefing?account_id='+user.accountId,undefined,'GET');
  const risk=await req('/ask',{question:'What are my risk limits today?'});
  const records=await req('/ask',{question:'What have I recorded today?'});
  const entry=await req('/ask',{question:'What is the entry engine reading right now?'});
  const patterns=await req('/ask',{question:'What do my logged trades show?'});
  ok('the briefing the dashboard already reads still answers with its own shape, unchanged by the new channel',briefing.status===200&&!!briefing.data.risk_plan&&!!briefing.data.performance&&Array.isArray(briefing.data.open_positions)&&!!briefing.data.daily&&briefing.data.practice!==undefined);
  const capLine=risk.data.answer.map(l=>l.text).find(t=>/^Max trades\/day:/.test(t))||'';
  ok('the cap the channel reports is the same number the briefing reports for today',numOf(capLine,/Max trades\/day: (\d+)/)===Number(briefing.data.risk_plan.max_trades_today),{ask:capLine,briefing:briefing.data.risk_plan.max_trades_today});
  const openLine=risk.data.answer.map(l=>l.text).find(t=>/^Open positions:/.test(t))||'';
  ok('the open-position count is the same count the briefing lists',numOf(openLine,/Open positions: (\d+)/)===(briefing.data.open_positions||[]).length,{ask:openLine,briefing:(briefing.data.open_positions||[]).length});
  const practiceLine=records.data.answer.map(l=>l.text).find(t=>/^Open timer state:/.test(t))||'';
  ok('the practice timer state the channel reports is the state the practice surface itself reports',/^Open timer state: (idle|running|paused)/.test(practiceLine)&&(!briefing.data.practice||practiceLine.includes(briefing.data.practice.timer.state)),{ask:practiceLine,briefing:briefing.data.practice&&briefing.data.practice.timer.state});
  ok('the gate answers and intention the channel reports are the briefing’s own M106/M107 records, quoted not re-derived',
    (!briefing.data.state_gate||/state-gate answers/.test(JSON.stringify(records.data))===/state-gate answers/.test(JSON.stringify(briefing.data)))&&(!briefing.data.intention||records.data.answer.some(l=>/intention/i.test(l.text))));
  const coach=await req('/coach?account_id='+user.accountId,undefined,'GET');
  const firstInsight=(coach.data.insights||[])[0];
  ok('the patterns surface narrates the coach’s own insights rather than a second analysis',!firstInsight||patterns.data.answer.some(l=>l.text.includes(firstInsight.title)));
  const battery=[['risk',risk],['records',records],['entry',entry],['patterns',patterns]];
  const badSource=battery.flatMap(([n,o])=>(o.data.answer||[]).filter(l=>l.kind!=='note'&&!/^(accounts|guardrail_day_caps|guardrail_day_state|routine_cycles|routine_checks|state_gate_answers|daily_intentions|practice_sessions|practice_timers|trades|coach|performance|strategy_rule_changes|users\.settings|market|ask)(:|$)/.test(l.source)).map(l=>({n,source:l.source})));
  ok('every fact line the channel produces names a surface the app already owns',
    battery.every(([,o])=>o.status===200&&Array.isArray(o.data.answer)&&o.data.answer.length>0)&&badSource.length===0,
    {statuses:battery.map(([n,o])=>[n,o.status,o.data&&o.data.topic]),badSource});

  /* ------------------------------------------------------- no authority */
  const engineFiles=['src/bots/index.js','src/bots/guardrails.js','src/bots/setup.js','src/bots/correction.js','src/routine.js','src/state-gate.js','src/intention.js','src/practice.js','src/journaling.js','src/prop.js'];
  const readers=engineFiles.filter(f=>/require\((['"])(\.\.?\/)*ask\1\)/.test(src(f)));
  ok('no engine, bot, guardrail, routine, gate, intention or practice module requires the advisory channel',readers.length===0,readers);
  const walk=(dir)=>fs.readdirSync(path.join(APP,dir),{withFileTypes:true}).flatMap((e)=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
  const requires=walk('src').filter(f=>f.endsWith('.js')&&/require\((['"])(\.\.?\/)*ask\1\)/.test(fs.readFileSync(path.join(APP,f),'utf8')));
  ok('the channel is required in exactly one place — the route that exposes it — so no engine can depend on it',JSON.stringify(requires)===JSON.stringify(['src/routes/api.js']),requires);
  const tables=await D.db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%ask%'").all();
  ok('asking adds no table, no index and no trigger: the channel is a read over what already exists',tables.length===0,tables.map(t=>t.name));
  ok('the route file wires the channel with the same auth guard every other owned surface uses',/router\.post\('\/ask',requireAuth,/.test(src('src/routes/api.js'))&&/router\.get\('\/ask\/topics',requireAuth,/.test(src('src/routes/api.js')));
  ok('the channel never appears in a banner, a permission message or a guardrail reason string',!/ask/i.test(src('src/routes/api.js').split('M109 the advisory channel')[0].slice(-4000)));

  /* ---------------------------------------------------------- the UI wiring */
  const html=src('public/index.html'), dashboard=src('public/js/views/dashboard.js'), view=src('public/js/views/ask.js');
  ok('the dashboard loads the surface list and renders the card, next to the surfaces it quotes',/js\/views\/ask\.js/.test(html)&&/API\.get\('\/ask\/topics'\)/.test(dashboard)&&/Views\.ask\.card\(/.test(dashboard));
  const viewKeys=[...view.matchAll(/^\s{4}(?:async\s+)?(\w+)\(/gm)].map(m=>m[1]);
  ok('the view exposes the card, the ask call and a line renderer that keeps the source with the text',viewKeys.includes('card')&&viewKeys.includes('ask')&&viewKeys.includes('lineNode')&&/askSource/.test(view)&&/dataset: \{ askKind/.test(view));
  ok('the view renders every answer as text nodes, never as markup, and shows the refusal code it received',/U\.h\('p', \{ class: 'small', dataset: \{ askText: 'true' \}, text: entry\.text \}\)/.test(view)&&/askRefusal/.test(view)&&!/innerHTML = .*entry\.text/.test(view));
  ok('the view states the limits and the no-authority line where the trader actually reads the answer',/What this channel will not do/.test(view)&&/Authority: none/.test(view)&&/no model, no API key, no network call/.test(view));
  ok('the card is honest about being deterministic rather than an assistant',/deterministic, read-only, no AI/.test(view)&&/no model, no API key, no network call, and no new data/.test(view));
  ok('the deep read surfaces the card advertises are the module’s own refusals, not a second copy that could drift',JSON.stringify((await req('/ask/topics',undefined,'GET')).data.refusal_codes)===JSON.stringify(require(path.join(APP,'src/ask')).REFUSALS.map(r=>r.code))&&/refusal_codes/.test(view));
});})().catch(e=>{console.error(e.stack);process.exitCode=1;});
