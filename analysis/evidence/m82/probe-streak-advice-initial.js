#!/usr/bin/env node
'use strict';
/** An additional real Coach path: the after-two-losses insight must not offer
 * quarter-sizing as an alternative to the sanctioned stop. Same40 scripted
 * journal rows/threshold/evidence in both stages; no probability/edge claim. */
const fs=require('fs'),path=require('path');const APP=process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal');
const RealDate=Date,NOW=Date.UTC(2026,9,11,12);global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return NOW;}};
const P=require(path.join(APP,'src/performance')),C=require(path.join(APP,'src/coach'));let pass=0,fail=0;const results=[],ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
const values=Array.from({length:10},()=>[10,-1,-1,-10]).flat(),trades=values.map((net,i)=>P.decorate({id:i+1,user_id:1,account_id:1,symbol:'TEST',status:'closed',direction:'long',entry:100,exit:100+net/10,size:10,net_pnl:net,gross_pnl:net,risk_amount:10,r_multiple:net/10,stop:99,opened_at:new Date(NOW-7*864e5+i*3600000).toISOString(),closed_at:new Date(NOW-7*864e5+i*3600000+60000).toISOString(),adherence:5},'UTC'));
const analysis=C.analyse(trades,{startingBalance:10000}),insight=analysis.insights.find(x=>x.id==='after_two_losses');
ok('positive fixture still actually triggers after-two-losses insight',!!insight,analysis.insights.map(x=>x.id));
ok('sample/baseline/impact detection and evidence stay untouched',insight?.evidence?.find(x=>x.label==='Trades')?.value==='10' && insight.evidence.find(x=>x.label==='Expectancy')?.value==='-1R' && insight.impact===-95,insight);
ok('after-loss advice no longer offers25%/quarter risk or cutting size',!!insight && !/25%|quarter|cut size/i.test(insight.action),insight?.action);
ok('after-loss advice keeps stop and explicitly retains selected risk unit',!!insight && /stop/i.test(insight.action) && /same selected risk unit/i.test(insight.action),insight?.action);
ok('40-trade fixture leaves existing score sample floor eligible',analysis.score_sample_sufficient===true && analysis.score!==null);
if(process.env.M82_RESULT)fs.writeFileSync(process.env.M82_RESULT,JSON.stringify({app:APP,pass,fail,results,feature_fingerprint:insight?Object.fromEntries(Object.entries(insight).filter(([k])=>k!=='action')):null,scope:'Actual deterministic Coach40-row advice, not executed size, market/provider/broker/outcome or production validation'},null,2)+'\n');console.log(`M82 streak advice: ${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
