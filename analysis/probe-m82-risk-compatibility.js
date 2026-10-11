#!/usr/bin/env node
'use strict';
/** Existing M9 clamp on advisory reads: no new floor/ceiling, grade change,
 * automatic A+ uplift or streak policy. Pure legacy/invalid-value contracts. */
const path=require('path'),fs=require('fs');const APP=process.env.TJ_APP||path.join(__dirname,'../extracted/tradejournal'),C=require(path.join(APP,'src/coach')),I=require(path.join(APP,'src/instruments'));
let pass=0,fail=0;const results=[],ok=(label,v,detail)=>{results.push({label,passed:!!v,...(!v?{detail}:{})});console.log(`${v?'ok':'FAIL'} ${label}${!v?' '+JSON.stringify(detail):''}`);v?pass++:fail++;};
for(const [label,value,unlocked,expected] of [['missing',undefined,false,.5],['NULL',null,false,.5],['invalid','bad',false,.5],['zero',0,false,.5],['negative',-1,false,.5],['below existing floor',.1,false,.25],['quarter',.25,false,.25],['locked default',.5,false,.5],['locked over guardrail',.75,false,.5],['locked1',1,false,.5],['manual unlocked1',1,true,1],['legacy locked2',2,false,.5],['legacy unlocked2',2,true,1]]){
 const account={name:'Legacy read',starting_balance:10000,risk_per_trade_pct:value,risk_unlocked:unlocked?1:0,daily_loss_limit_pct:3,max_trades_day:3};const b=C.briefing({trades:[],account});ok(label+' advisory read matches unchanged shared M9 clamp',b.risk_plan.suggested_risk_pct===expected && b.risk_plan.suggested_risk===10000*expected/100,{pct:b.risk_plan.suggested_risk_pct,dollars:b.risk_plan.suggested_risk});
}
const noAccount=C.briefing({trades:[]});ok('no-account pure briefing still defaults0.5%',noAccount.risk_plan.suggested_risk_pct===.5);
const normal=C.briefing({trades:[],account:{starting_balance:10000,risk_per_trade_pct:.5,max_trades_day:3}});ok('advisory metadata discloses base unit and that streak sizing is OFF',normal.risk_plan.base_risk_pct===.5 && normal.risk_plan.streak_sizing===false && /drawdown|day-loss/i.test(normal.risk_plan.adjustment_basis||''),normal.risk_plan);
ok('existing M9 constants stay0.5default/locked,1manual maximum,.25floor',I.RISK_GUARDRAIL.default_pct===.5 && I.RISK_GUARDRAIL.guardrail_pct===.5 && I.RISK_GUARDRAIL.max_pct===1 && I.RISK_GUARDRAIL.floor_pct===.25);
if(process.env.M82_RESULT)fs.writeFileSync(process.env.M82_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Legacy advisory M9 read/metadata compatibility, no new sizing coefficients or performance/broker/production proof'},null,2)+'\n');console.log(`M82 risk compatibility: ${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
