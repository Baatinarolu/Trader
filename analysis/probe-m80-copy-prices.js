#!/usr/bin/env node
'use strict';
/** Independent compatibility repair in the actual manual form Copy handler.
 * The source already converted to Number; stripping string trailing zeroes then
 * corrupted integer stock/CFD prices. No stop/target engine change is involved.
 */
const fs=require('fs'),path=require('path');const APP=process.env.TJ_APP || path.join(__dirname,'../extracted/tradejournal');
const {JSDOM}=require(path.join(APP,'node_modules/jsdom'));const dom=new JSDOM('<!doctype html><body></body>',{url:'https://fixture.example',runScripts:'outside-only'}),w=dom.window;
let copied,pass=0,fail=0;const results=[];
w.eval(fs.readFileSync(path.join(APP,'public/js/util.js'),'utf8'));w.eval(fs.readFileSync(path.join(APP,'public/js/store.js'),'utf8'));
w.Store.user={settings:{},default_checklist:[]};w.Store.accounts=[];w.Store.strategies=[];w.Store.instruments=[];
w.TV={link:()=> '#',copy:text=>{copied=text;}};w.API={get:async()=>({})};w.App={toast(){},go(){}};
w.eval(fs.readFileSync(path.join(APP,'public/js/views/trades.js'),'utf8'));
for(const [label,entry,stop,target,expected] of [
 ['integer100/110',100,99,110,'entry 100 · stop 99 · target 110'],
 ['integer10/20',10,9,20,'entry 10 · stop 9 · target 20'],
 ['decimal trailing0',1.085,1.08,1.09,'entry 1.085 · stop 1.08 · target 1.09'],
 ['six decimal crypto',.01234,.011,.0135,'entry 0.01234 · stop 0.011 · target 0.0135'],
]){
 copied=null;const form=w.Views.tradeForm({symbol:'TEST',direction:'long',status:'closed',record_only:true,entry,stop,target,size:1});w.document.body.replaceChildren(form.node);
 [...form.node.querySelectorAll('button')].find(b=>b.textContent==='Copy plan (alert text)').click();const passed=copied?.includes(expected);passed?pass++:fail++;results.push({label,passed,copied});console.log(`${passed?'ok':'FAIL'} ${label}: ${copied}`);
}
dom.window.close();console.log(`M80 copy prices: ${pass} passed, ${fail} failed`);if(process.env.M79_RESULT)fs.writeFileSync(process.env.M79_RESULT,JSON.stringify({app:APP,pass,fail,results,scope:'Actual formatter/event compatibility; no geometry/market outcome change'},null,2)+'\n');process.exitCode=fail?1:0;
