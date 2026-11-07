import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {headerActivity,activityLabel,activityLabelParts,settleActivity,ACTIVITY_SETTLE_IDLE}=await load('header-activity.ts');

// R133 SYNC-ACT-UX-1: the header names what the spinning refresh icon waits for; it is derived from the spinner's own inputs.
const base={awaitingSession:false,status:'ready',requestKind:null,headerState:'loading'};
test('no activity unless the header is loading, whatever else runs',()=>{
 for(const headerState of ['success','idle','error'])assert.equal(headerActivity({...base,headerState,awaitingSession:true,status:'signing_in',requestKind:'save'}),null,headerState);
});
test('priority: connecting, signing in or out, saving, reading a receipt, then loading',()=>{
 assert.equal(headerActivity({...base,awaitingSession:true,status:'signing_in',requestKind:'save'}),'connecting');
 assert.equal(headerActivity({...base,status:'signing_in',requestKind:'save'}),'signing-in');
 assert.equal(headerActivity({...base,status:'signing_out',requestKind:'receipt'}),'signing-out');
 assert.equal(headerActivity({...base,requestKind:'save'}),'saving');
 assert.equal(headerActivity({...base,requestKind:'receipt'}),'receipt');
 assert.equal(headerActivity({...base,requestKind:'read'}),'loading');
 for(const status of ['loading','initializing','ready'])assert.equal(headerActivity({...base,status}),'loading',status);
});
test('labels in English and Thai',()=>{
 const expected={connecting:['Connecting…','กำลังเชื่อมต่อ…'],'signing-in':['Signing in…','กำลังเข้าสู่ระบบ…'],'signing-out':['Signing out…','กำลังออกจากระบบ…'],saving:['Saving…','กำลังบันทึก…'],receipt:['Reading receipt…','กำลังอ่านใบเสร็จ…'],loading:['Loading…','กำลังโหลด…']};
 for(const [activity,[en,th]] of Object.entries(expected)){assert.equal(activityLabel(activity,false),en);assert.equal(activityLabel(activity,true),th)}
 assert.equal(activityLabel(null,false),'Loading…');
});
test('SYNC-ACT-UX-16: the Thai object word is split off to stay on one line; the parts always join to the label',()=>{
 assert.deepEqual(activityLabelParts('receipt',true),['กำลังอ่าน','ใบเสร็จ…']);
 assert.deepEqual(activityLabelParts('signing-in',true),['กำลังเข้าสู่','ระบบ…']);
 assert.deepEqual(activityLabelParts('signing-out',true),['กำลังออกจาก','ระบบ…']);
 for(const activity of ['connecting','saving','loading'])assert.deepEqual(activityLabelParts(activity,true),[activityLabel(activity,true),'']);
 for(const activity of ['connecting','signing-in','signing-out','saving','receipt','loading',null])for(const thai of [false,true]){
  const [lead,object]=activityLabelParts(activity,thai);assert.equal(lead+object,activityLabel(activity,thai));if(!thai)assert.equal(object,'')}
});
/** Runs the reducer over [time, input] steps; returns what is shown after each step and the last wake time. */
function run(steps){let state=ACTIVITY_SETTLE_IDLE,wakeAt=null;const shown=[];for(const [now,next] of steps){({state,wakeAt}=settleActivity(state,next,now));shown.push(state.shown)}return {shown,wakeAt,state}}
test('a spin shorter than 200 ms never shows a label; the time stays',()=>{
 const {shown}=run([[0,'loading'],[150,'loading'],[199,null],[400,null]]);
 assert.deepEqual(shown,[null,null,null,null]);
 assert.equal(settleActivity(ACTIVITY_SETTLE_IDLE,'loading',0).wakeAt,200,'wakes when the delay ends');
});
test('the label appears at 200 ms and is held 600 ms after it appeared, then the time returns at once',()=>{
 const {shown}=run([[0,'saving'],[200,'saving'],[250,null],[799,null],[800,null]]);
 assert.deepEqual(shown,[null,'saving','saving','saving',null]);
 const held=settleActivity({shown:'saving',startedAt:0,shownAt:200},null,250);assert.equal(held.wakeAt,800);assert.equal(held.state.shown,'saving');
 assert.deepEqual(settleActivity({shown:'saving',startedAt:0,shownAt:200},null,800),{state:ACTIVITY_SETTLE_IDLE,wakeAt:null});
});
test('a kind change while shown (also during the hold) swaps the text without a new delay',()=>{
 const {shown}=run([[0,'loading'],[200,'loading'],[300,'saving'],[350,null],[400,'receipt'],[2000,'receipt'],[2001,null]]);
 assert.deepEqual(shown,[null,'loading','saving','saving','receipt','receipt',null],'after the hold an ended spin returns to the time');
});
test('a new spin after the label ended waits the delay again',()=>{
 const {shown}=run([[0,'loading'],[200,'loading'],[900,null],[1000,'saving'],[1100,'saving'],[1200,'saving']]);
 assert.deepEqual(shown,[null,'loading',null,null,null,'saving']);
});
test('custom delay and hold',()=>{
 assert.equal(settleActivity(ACTIVITY_SETTLE_IDLE,'loading',0,{delay:0}).state.shown,'loading');
 assert.equal(settleActivity({shown:'loading',startedAt:0,shownAt:0},null,100,{hold:50}).state.shown,null);
});
