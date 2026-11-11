import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createRecognizerClient,RECOGNITION_UPSTREAM_TIMEOUT_MS} from '../../services/receipts/recognizer-client.mjs';
import {RECOGNITION_DEADLINE_MS,UPLOAD_SLOW_MS,READING_SLOW_MS,receiptStage,receiptStageText,watchSlow} from '../../apps/pwa/src/recognition-timing.ts';

// R077 timing chain: the agent recognizer gives up at 42 s, the command route waits for it up to 45 s and the
// PWA waits up to 60 s, so each layer answers before the one above it gives up.
const AGENT_RECOGNIZER_BOUND_MS=42000;

test('recognition limits chain agent 42 s < command route 45 s < PWA 60 s',()=>{
 assert.equal(RECOGNITION_UPSTREAM_TIMEOUT_MS,45000);
 assert.equal(RECOGNITION_DEADLINE_MS,60000);
 assert.ok(AGENT_RECOGNIZER_BOUND_MS<RECOGNITION_UPSTREAM_TIMEOUT_MS&&RECOGNITION_UPSTREAM_TIMEOUT_MS<RECOGNITION_DEADLINE_MS);
});

test('the command recognizer client defaults to the 45 s upstream limit',async()=>{
 const delays=[];const realTimeout=AbortSignal.timeout;
 AbortSignal.timeout=ms=>{delays.push(ms);return realTimeout.call(AbortSignal,ms)};
 try{
  const client=createRecognizerClient({url:'http://10.148.0.2:8790/v1/receipt-recognition',fetch:async()=>new Response('',{status:503}),mintToken:async()=>'a.b.c'});
  assert.equal((await client.recognize({bytes:Buffer.from('png'),mimeType:'image/png'})).reason,'recognizer_unavailable');
 }finally{AbortSignal.timeout=realTimeout}
 assert.deepEqual(delays,[45000]);
});

test('the receiving form times recognition with the shared 60 s deadline, not call()\'s 15 s abort',async()=>{
 const source=await readFile(new URL('../../apps/pwa/src/SelectedCharges.tsx',import.meta.url),'utf8');
 assert.match(source,/import \{RECOGNITION_DEADLINE_MS(,[A-Za-z]+)*\} from '\.\/recognition-timing';/);
 assert.doesNotMatch(source,/RECOGNITION_DEADLINE_MS\s*=/);
 const recognize=source.slice(source.indexOf('async function recognize('),source.indexOf('function applyRecognition('));
 assert.match(recognize,/setTimeout\(\(\)=>controller\.abort\(\),RECOGNITION_DEADLINE_MS\)/);
 assert.doesNotMatch(recognize,/await call\(/);
});

// R142-UX-05..10: the receipt status line (Echo's accepted design).
const pwa=name=>readFile(new URL('../../apps/pwa/src/'+name,import.meta.url),'utf8');

test('R142 stage order: Preparing clears the line, then Uploading, then Reading, then the form\'s result',()=>{
 const flow=[{preparing:true},{uploading:true},{reading:true},{}].map(state=>receiptStage(state));
 assert.deepEqual(flow,['preparing','uploading','reading',null]);
 assert.deepEqual(flow.map(stage=>receiptStageText(stage,false,false)),['','Uploading receipt…','Reading slip…',null]);
 assert.deepEqual(flow.map(stage=>receiptStageText(stage,false,true)),['','กำลังอัปโหลดหลักฐาน…','กำลังอ่านสลิป…',null]);
 // An earlier stage wins while it lasts: a new pick (preparing) or upload replaces the reading text, never stacks.
 assert.equal(receiptStage({preparing:true,uploading:true,reading:true,offline:true}),'preparing');
 assert.equal(receiptStage({uploading:true,reading:true}),'uploading');
 assert.equal(receiptStage({reading:true,offline:true}),'reading');
});

test('R142 slow thresholds: upload after 8 s, reading after 10 s (fake timers), each once and cancellable',()=>{
 assert.equal(UPLOAD_SLOW_MS,8000);assert.equal(READING_SLOW_MS,10000);
 assert.ok(READING_SLOW_MS<RECOGNITION_DEADLINE_MS,'the "still reading" text comes before the 60 s give-up');
 mock.timers.enable({apis:['setTimeout']});
 try{
  const seen=[];
  watchSlow('uploading',()=>seen.push('upload'));watchSlow('reading',()=>seen.push('read'));
  mock.timers.tick(7999);assert.deepEqual(seen,[]);
  mock.timers.tick(1);assert.deepEqual(seen,['upload']);
  mock.timers.tick(1999);assert.deepEqual(seen,['upload']);
  mock.timers.tick(1);assert.deepEqual(seen,['upload','read']);
  mock.timers.tick(60000);assert.deepEqual(seen,['upload','read'],'once');
  const cancel=watchSlow('uploading',()=>seen.push('late'));mock.timers.tick(5000);cancel();mock.timers.tick(10000);
  assert.deepEqual(seen,['upload','read'],'a finished upload never turns slow');
  for(const stage of ['preparing','offline',null]){watchSlow(stage,()=>seen.push(stage))();}
  mock.timers.tick(60000);assert.equal(seen.length,2,'no slow text for other stages');
 }finally{mock.timers.reset()}
 assert.equal(receiptStageText('uploading',true,false),'Still uploading — the connection may be slow.');
 assert.equal(receiptStageText('uploading',true,true),'ยังอัปโหลดอยู่ — การเชื่อมต่ออาจช้า');
 assert.equal(receiptStageText('reading',true,false),'Still reading slip…');
 assert.equal(receiptStageText('reading',true,true),'ยังอ่านสลิปอยู่…');
});

test('R142 offline: the receipt is kept on the device, sent later and not read',()=>{
 assert.equal(receiptStage({offline:true}),'offline');
 assert.equal(receiptStageText('offline',false,false),"Receipt saved on this device. It will be sent when you're online; the slip won't be read.");
 assert.equal(receiptStageText('offline',true,true),'บันทึกหลักฐานไว้ในอุปกรณ์แล้ว จะส่งเมื่อเชื่อมต่อ และจะไม่อ่านสลิป');
});

test('R142 one status element per form, reused in place, focus never moved, picker aria-busy kept',async()=>{
 const receive=await pwa('SelectedCharges.tsx'),close=await pwa('LoanClose.tsx'),correction=await pwa('PaymentCorrectionForm.tsx'),manual=await pwa('PaymentResult.tsx'),picker=await pwa('ReceiptPicker.tsx');
 // Receive payment: the reading/failed/unconfirmed/result lines are one always-rendered element whose text changes.
 const line=receive.match(/ <p className=\{'field-help'\+\(!stage&&recognized\?' recognition-note':''\)\} role="status"[^\n]*/)?.[0];
 assert.ok(line,'the receiving form keeps one status element');
 assert.doesNotMatch(receive,/recognition\?\.phase==='(reading|failed|unconfirmed)'&&<p/);
 assert.doesNotMatch(receive,/\{recognized&&<p className="field-help recognition-note" role="status">/);
 assert.match(line,/\{stage\?stageText:/);assert.doesNotMatch(line,/focus/);
 assert.match(receive,/offline:queueEnabled&&\(!!access\.offlineOnly\|\|!online\)&&!!localImage&&!receipt/);
 // Close Loan: the status and summary lines are one element.
 assert.match(close,/<p className=\{'field-help'\+\(!stage&&slipNotes\.summary\?' recognition-note':''\)\} role="status" style=\{statusText\?undefined:\{margin:0\}\}>\{statusText\}<\/p>/);
 assert.doesNotMatch(close,/\{slipNotes\.(status|summary)&&<p/);
 // Correction and manual receipt: Uploading and the slow-upload message only, directly above the picker.
 for(const [name,source,flag] of [['correction',correction,'uploading'],['manual receipt',manual,'uploading:uploadingReceipt']]){
  assert.ok(source.includes('receiptStage({'+flag+'})'),name);
  assert.match(source,/<p className="field-help" role="status" style=\{uploadText\?undefined:\{margin:0\}\}>\{uploadText\}<\/p><ReceiptPicker /,name);
  assert.doesNotMatch(source,/reading:|offline:/,name);
 }
 // Focus: none of these forms moves focus for a status change (the receiving form keeps its two existing, unrelated calls).
 assert.deepEqual([receive,close,correction,manual].map(source=>source.split('.focus(').length-1),[2,0,0,0]);
 assert.match(picker,/aria-busy=\{busy\|\|preparing\}/);
 // No progress bar (R142-UX-07), no banner or toast (R142-UX-09).
 for(const source of [receive,close,correction,manual])assert.doesNotMatch(source,/<progress|role="progressbar"/);
});

// useSlowStage under a minimal hook runner (no DOM in the unit suite): useState, useEffect with deps and cleanups.
function hookRunner(hook){
 const states=[],effects=[];let cursor=0,effect=0,queue=[];
 const react={useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}]},
  useEffect(run,deps){const index=effect++,old=effects[index];if(!old||deps.some((dep,at)=>!Object.is(dep,old.deps[at])))queue.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:run()}})}};
 return {react,render(...args){cursor=effect=0;queue=[];globalThis.__receiptReact=react;hook(...args);for(const run of queue)run();cursor=effect=0;return hook(...args)}};
}

test('R142 regression: a later upload in the same form starts not slow after an earlier slow one',async()=>{
 const source=ts.transpileModule((await pwa('recognition-timing.ts')).replace("import {useEffect,useState} from 'react';",'const {useEffect,useState}={useEffect:(...a)=>globalThis.__receiptReact.useEffect(...a),useState:(...a)=>globalThis.__receiptReact.useState(...a)};'),
  {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 const {useSlowStage}=await import('data:text/javascript,'+encodeURIComponent(source));
 const runner=hookRunner(useSlowStage);
 mock.timers.enable({apis:['setTimeout']});
 try{
  assert.equal(runner.render('uploading',null),false);
  mock.timers.tick(UPLOAD_SLOW_MS);assert.equal(runner.render('uploading',null),true,'first upload turns slow');
  assert.equal(runner.render('reading','r1'),false,'the next stage never inherits the slow flag');
  assert.equal(runner.render(null,null),false);
  assert.equal(runner.render('uploading',null),false,'a later upload starts with "Uploading receipt…"');
  mock.timers.tick(UPLOAD_SLOW_MS-1);assert.equal(runner.render('uploading',null),false);
  mock.timers.tick(1);assert.equal(runner.render('uploading',null),true);
  assert.equal(runner.render(null,null),false);assert.equal(runner.render('reading','r2'),false);
  mock.timers.tick(READING_SLOW_MS);assert.equal(runner.render('reading','r2'),true);
 }finally{mock.timers.reset()}
});

test('R142 Close Loan: the offline message follows the reactive online state, not a one-off navigator.onLine read',async()=>{
 const close=await pwa('LoanClose.tsx');
 assert.match(close,/import \{useOnline\} from '\.\/online-status';/);
 assert.match(close,/offline:queueEnabled&&\(!!access\.offlineOnly\|\|!online\)&&!!receiptImage/);
});

test('R142 regression: the default slow timers are called as plain functions (browsers throw "Illegal invocation" otherwise)',()=>{
 const realSet=globalThis.setTimeout,realClear=globalThis.clearTimeout,calls=[];
 // Browser-like timers: called with any receiver other than the global object (or none), they throw.
 globalThis.setTimeout=function(_run,ms){if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');calls.push(ms);return 7};
 globalThis.clearTimeout=function(id){if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');calls.push('clear '+id)};
 try{watchSlow('uploading',()=>{})();watchSlow('reading',()=>{})()}finally{globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear}
 assert.deepEqual(calls,[UPLOAD_SLOW_MS,'clear 7',READING_SLOW_MS,'clear 7']);
});
