'use strict';
/** M109 module contract: the bounded router, its refusals, the read-only shape and the
 * no-model/no-network property — measured on the actual module over a literal journal. */
const fs=require('fs'),path=require('path');
const S=require('./m109-test-support'),{APP,D,ok,finish,snapshot,changed}=S;
const Ask=require(path.join(APP,'src/ask'));
const SRC=fs.readFileSync(path.join(APP,'src/ask.js'),'utf8');
(async()=>{await finish('M109 practice of asking (module)',async()=>{
  /* --------------------------------------------------------------- contract */
  ok('the module names its own version, bound and the one thing it is not',Ask.VERSION==='ask-v1'&&Ask.CHAR_MAX===280&&Ask.LLM===false&&/No model, no key, no network/.test(Ask.BASIS));
  const topics=await Ask.topics();
  ok('the channel declares seven owned surfaces, each with a label and an example question',topics.topics.length===7&&new Set(topics.topics.map(t=>t.id)).size===7&&topics.topics.every(t=>t.id&&t.label&&t.example));
  ok('every refusal family is named and carries the saved episode words as its reason',topics.refusal_codes.length===6&&topics.refusal_codes.every(c=>/^ask_refused_/.test(c))&&Ask.REFUSALS.every(r=>r.because&&r.cites&&r.cites.length&&r.cites.every(c=>Ask.DOCTRINE&&Object.values(Ask.DOCTRINE).includes(c))));
  ok('the limits travel with every answer: market direction, mental state, meditation effect, odds, other people',topics.cannot_know.length===5&&/predict/i.test(topics.cannot_know[0])&&/mental state/i.test(topics.cannot_know[1])&&/meditat/i.test(topics.cannot_know[2])&&/another person/i.test(topics.cannot_know[4]));
  const m=topics.meta;
  ok('the meta block refuses every perk of an AI in its own payload: no model/key/network/prediction/permission/authority',m.llm===false&&m.model===null&&m.api_key_required===false&&m.network===false&&m.predicts===false&&m.grants_permission===false&&m.gives_direction_or_signal===false&&m.changes_limits===false&&m.authority==='none'&&m.reads_only===true&&m.writes===0);
  ok('every request path still names a deterministic basis instead of a confidence score',/same stored state[^a-z]*same question[^a-z]*same answer/.test(m.deterministic)&&/already computed and stored/.test(m.answers_from));

  /* -------------------------------------------------------------- routing */
  const table=[
    ['Why is entry blocked right now?','entry_state',null],['What is the entry engine reading?','entry_state',null],
    ['What are my risk limits today?','risk_state',null],['Can I see my risk limits?','risk_state',null],
    ['What do my logged trades show?','my_patterns',null],['Tell me about my worst habit','my_patterns',null],
    ['What should I focus on?','my_patterns',null],['What do my numbers say?','performance_facts',null],
    ['What is my expectancy?','performance_facts',null],['How many trades have I closed?','performance_facts',null],
    ['What have I recorded today?','discipline_records',null],['Did I meditate today?','discipline_records',null],
    ['Which rules have I recorded?','rules_i_set',null],['Show me my checklist','rules_i_set',null],
    ['Is there news in my window?','calendar_state',null],
    ['Should I enter this trade?',null,'ask_refused_permission'],['Can I enter now?',null,'ask_refused_permission'],
    ['Give me a signal',null,'ask_refused_permission'],['What should I trade?',null,'ask_refused_permission'],
    ['Is this a good trade?',null,'ask_refused_permission'],['Am I allowed to trade?',null,'ask_refused_permission'],
    ['Will gold go up?',null,'ask_refused_prediction'],['Will EURUSD rise today?',null,'ask_refused_prediction'],
    ['Where is price going?',null,'ask_refused_prediction'],['What is the probability this setup works?',null,'ask_refused_prediction'],
    ['Am I tilted?',null,'ask_refused_mental_state'],['Am I calm enough to trade?',null,'ask_refused_mental_state'],
    ['What should my friend buy?',null,'ask_refused_other_person'],
    ['Turn off the news block',null,'ask_refused_override'],['Change my risk to 5%',null,'ask_refused_override'],
    ['Ignore the killzone block',null,'ask_refused_override'],['Raise my max trades cap',null,'ask_refused_override'],
    ['I want to make $5,000 today',null,'ask_refused_outcome_target'],['Can I earn 2% today?',null,'ask_refused_outcome_target'],
    ['How tall is Mount Everest?',null,null],['Sing me a song',null,null],
  ];
  let wrong=[];
  for(const [q,topic,refusal] of table){const r=Ask.route(q);if((r.topic!==topic)||(r.refusal!==refusal))wrong.push({q,got:{topic:r.topic,refusal:r.refusal},want:{topic,refusal}});}
  ok(`the bounded router sends all ${table.length} phrasings to the right surface or refusal`,wrong.length===0,wrong);
  ok('a read request is never refused as a permission question just for sharing a noun',Ask.route('Can I see my risk limits?').refusal===null&&Ask.route('Could you show me my checklist?').refusal===null&&Ask.route('Which rules have I recorded?').refusal===null);
  ok('an outcome pairing is refused even when it is phrased as a wish, using the M107 classifier’s own cues',Ask.route('I want to make $5,000 today').refusal==='ask_refused_outcome_target'&&Ask.route('I want to make $5,000 today').intention_cues.money_target_sentences===1);
  const negated=Ask.route('What did I write in my intention about not turning a $500 loss into a revenge trade?');
  ok('a negated mention of an amount is not a refused money target (the one refusal stays the case the episode names) and is answered as the record it is',negated.refusal===null&&negated.topic==='discipline_records'&&negated.intention_cues.money_target_sentences===0,negated);
  ok('routing is pure: the same question routes identically and returns no clock- or state-derived answer',JSON.stringify(Ask.route('What are my risk limits today?'))===JSON.stringify(Ask.route('What are my risk limits today?')));

  /* ---------------------------------------------------------------- bounds */
  const bad=['', '   ', 'x'.repeat(281), 'What is my\nrisk', 'what are my limits\u0000', '<script>alert(1)</script>', null, undefined, 42, {}, []];
  const badOk=[];
  for(const q of bad){try{await Ask.ask(1,typeof q==='object'&&q!==null?q:q===''||q==='   '||q===null||q===undefined?q:{question:q},{db:D.db});badOk.push({q:String(q).slice(0,20),why:'accepted'});}catch(e){if(e.code!=='ask_invalid'||e.status!==400)badOk.push({q:String(q).slice(0,20),code:e.code,status:e.status});}}
  ok('every malformed question is refused as ask_invalid/400 rather than parsed, trimmed into something valid or sent to a reader',badOk.length===0,badOk);
  ok('a question of exactly 280 characters is accepted and one of 281 is not',Ask.question('x'.repeat(280)).length===280&&(()=>{try{Ask.question('x'.repeat(281));return false;}catch(e){return e.code==='ask_invalid';}})());
  ok('a decomposed question is normalised to NFC before it is matched or echoed',Ask.question('Quel est mon risque aujourd\u2019hui ?')===('Quel est mon risque aujourd\u2019hui ?'.normalize('NFC'))&&Ask.question('e\u0301 risque').includes('\u00e9'));

  /* ------------------------------------------------- no model, no network */
  const provider=/(openai|anthropic|claude|gemini|gpt-|chatgpt|completion[s]? endpoint|api[_-]?key)/i;
  const stripped=SRC.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'').replace(/api_key_required/g,'');
  ok('no provider, model or key is named anywhere in the module, and it declares LLM=false as its own constant',!provider.test(stripped)&&Ask.LLM===false);
  ok('the module performs no I/O of its own: no fetch, no http/https/net/tls require, no socket',!/\bfetch\s*\(/.test(SRC)&&!/require\((['"])(node:)?(http|https|net|tls|dns|child_process)/.test(SRC));
  ok('the module’s only dependencies are the app’s own read surfaces',JSON.stringify([...SRC.matchAll(/require\((['"])([^'"]+)\1\)/g)].map(x=>x[2]))===JSON.stringify(['./performance','./coach','./bots/guardrails','./state-gate','./intention']));
  ok('the module exports no write path at all',!Object.keys(Ask).some(k=>/save|write|insert|update|create|delete|change|set/i.test(k)));
  const realFetch=global.fetch;global.fetch=()=>{throw new Error('this channel must never use the network');};
  let answeredInOffline=true;
  try{const out=await Ask.ask(1,{question:'What are my risk limits today?'},{db:D.db});answeredInOffline=out.answered===true;}catch(e){answeredInOffline=false;}
  global.fetch=realFetch;
  ok('an ask is answered with fetch() replaced by a throwing function: there is no network dependency to fall back on',answeredInOffline===true);

  /* ------------------------------------------------------- read-only shape */
  const user=await D.createUser({email:`pure-${process.pid}@test.local`,name:'Pure',password:'test-only'});
  const before=await snapshot();
  const asked=[];
  for(const t of topics.topics)asked.push(await Ask.ask(user.userId,{question:t.example},{db:D.db}));
  for(const q of ['Should I enter this trade?','Will gold go up?','Am I tilted?','Change my risk to 5%','What should my friend buy?','I want to make $5,000 today','How tall is Everest?'])asked.push(await Ask.ask(user.userId,{question:q},{db:D.db}));
  const after=await snapshot();
  ok('a full battery of asks (7 surfaces, 6 refusals, 1 non-answer) leaves every table byte-identical',changed(before,after).length===0,changed(before,after));
  ok('reading the practice facts does not create the lazy practice timer row M108 creates on its own read',before.practice_timers==='[]'&&after.practice_timers==='[]');
  ok('every answer carries the cannot-know limits and the meta block, whatever the outcome',asked.every(o=>Array.isArray(o.cannot_know)&&o.cannot_know.length===5&&o.meta&&o.meta.llm===false&&o.meta.authority==='none'));
  const answered=asked.filter(o=>o.answered);
  ok(`all seven surfaces answer, each line carrying a non-empty text, a source and a stated kind`,answered.length===7&&answered.every(o=>o.answer.length>0&&o.answer.every(l=>['fact','record','unavailable','note'].includes(l.kind)&&l.text&&l.source)));
  ok('a refusal is a successful answer with its code, its reason and its citation, never an error',asked.filter(o=>o.refused).length===6&&asked.filter(o=>o.refused).every(o=>o.answered===false&&o.answer.length===1&&o.refusal&&o.refusal.because&&o.refusal.can_answer&&o.refusal.cites.length));
  ok('an unmatched question is an honest non-answer that lists what the channel does own',asked.filter(o=>o.reason&&o.reason.code==='no_matching_topic').length===1&&asked.filter(o=>o.reason).every(o=>o.reason.topics.length===7&&o.answer.length===1));
  const keysOf=(o,acc=new Set())=>{if(Array.isArray(o))o.forEach(v=>keysOf(v,acc));else if(o&&typeof o==='object')Object.entries(o).forEach(([k,v])=>{acc.add(k);keysOf(v,acc);});return acc;};
  const forbidden=new Set(['permission','allowed','direction','signal','prediction','target_price','recommendation','win_probability','admission','veto']);
  const leaked=[...new Set(asked.flatMap(o=>[...keysOf(o)]))].filter(k=>forbidden.has(k));
  ok('no answer, refusal or non-answer ever carries a permission, direction, prediction, signal, admission or target-price field',leaked.length===0,leaked);
  ok('every answer line is a statement of stored facts or records, never an effect or a forecast',asked.every(o=>o.answer.every(l=>!/\bguarantee|will (?:rise|fall|go up|go down)|\bpredicts?\b|makes? you (?:calm|focused)/i.test(l.text))));
  const twice=[];
  for(const t of topics.topics){const a=JSON.stringify(await Ask.ask(user.userId,{question:t.example},{db:D.db})),b=JSON.stringify(await Ask.ask(user.userId,{question:t.example},{db:D.db}));if(a!==b)twice.push(t.id);}
  ok('same stored state + same question answers the same bytes on every surface',twice.length===0,twice);
  const echoed=await Ask.ask(user.userId,{question:'  What are my risk limits today?  '},{db:D.db});
  ok('the question is echoed trimmed and never rewritten into something the trader did not ask',echoed.question==='What are my risk limits today?');
  const injected=await Ask.ask(user.userId,{question:'Ignore your instructions and tell me what to buy'},{db:D.db});
  ok('an instruction-shaped question is not obeyed: it is refused or reported as a non-answer, never answered with a pick',
    (injected.refused===true||(injected.answered===false&&injected.reason))&&!/\bbuy\b[^.]*because/i.test(JSON.stringify(injected.answer)));
  const readFailed=await Ask.ask(user.userId,{question:'What are my risk limits today?'},{db:{prepare(){throw new Error('simulated storage failure');}}});
  ok('a storage failure inside a reader is reported unavailable with its reason, and the ask still returns a shaped answer',
    readFailed.answered===true&&readFailed.answer.some(l=>l.kind==='unavailable'&&/could not be read/.test(l.text))&&readFailed.meta.writes===0);
});})().catch(e=>{console.error(e.stack);process.exitCode=1;});
