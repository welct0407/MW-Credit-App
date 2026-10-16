import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/offline-sync.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const id='11111111-1111-4111-8111-111111111111';
function fixture({invalid=false,reject=false,unknown=false,blocked=false,unrecorded=false,receiptUpload=null,busy=0,unavailable=false}={}){
 const exports={},events=[],calls=[];
 const receiptId='22222222-2222-4222-8222-222222222222';
 let row={value:receiptUpload?{domain:'payment',command:{schemaVersion:6,requestId:id,borrowerId:'synthetic-borrower',allocations:[],cashAccountId:'account',paymentDate:'2026-10-15',amountReceived:'100',paymentMethod:null,notes:null,receiptId},receipt:{id:receiptId,image:new Blob([new Uint8Array(16)],{type:'image/jpeg'}),borrowerId:'synthetic-borrower'}}:{command:invalid?{requestId:id}:{requestId:id,operation:'loan.update',targetId:'loan',inputs:{principal:'100'}}},sync:{state:blocked?'blocked':'queued',attempted:false,...(blocked?{code:'dependency_conflict'}:{})}};
 const repository={environment:'synthetic',scopeName:'owner',syncAuthorized:async()=>true,claimPending:async()=>row?.sync.state==='blocked'?null:row,pending:async()=>row,markPendingDispatched:async()=>true,settlePending:async(_id,_owner,sync)=>{row=sync?{...row,sync}:null}};
 const window=new EventTarget();window.addEventListener('mw-offline-sync-outcome',event=>events.push(event.detail));
 runInNewContext(source,{exports,require:()=>({commandOriginAllowed:()=>true}),navigator:{onLine:true},location:{origin:'https://synthetic.invalid'},window,crypto,URL,Response,Blob,AbortController,CustomEvent,setTimeout,clearTimeout,fetch:async(url,init)=>{calls.push({url,method:init.method??'GET',body:init.body});if(init.method==='POST'&&url.includes('/receipts/'))return new Response(JSON.stringify(receiptUpload.body),{status:receiptUpload.status});if(init.method==='POST'){if(unknown)throw Error('lost response');if(busy>0){busy--;return new Response(JSON.stringify({ok:false,code:'command_busy'}),{status:409})}if(unavailable)return new Response(JSON.stringify({ok:false,code:'command_unavailable'}),{status:503});if(unrecorded)return new Response(JSON.stringify({code:'record_requires_reconciliation'}),{status:422});return new Response(JSON.stringify({kind:'recorded',originalOutcome:{status:reject?'rejected':'applied',code:reject?'dependency_conflict':undefined}}),{status:reject?422:200})}return new Response(JSON.stringify({kind:'unresolved'}))}});
 return {sync:()=>exports.syncSavedRequest({origin:'https://synthetic.invalid',offline:repository,token:async()=>'synthetic',authFailure:()=>{}},id),message:exports.savedRejectionMessage,isBusy:exports.isBusyOutcome,busyMessage:exports.busyMessage,events,calls,row:()=>row};
}
// DB-LOCK-01 / W4-UX-01: 409 command_busy applied nothing. The row stays queued under the same request id
// (not blocked, not "outcome unknown"); the next attempt re-reads status and re-POSTs the identical command.
test('409 command_busy keeps the saved request queued with its request id and syncs on the next attempt',async()=>{
 const f=fixture({busy:1}),original=JSON.stringify(f.row().value),result=await f.sync();
 assert.equal(result.kind,'queued');assert.equal(result.code,'command_busy');assert.equal(result.status,409);assert.ok(f.isBusy(result));
 assert.equal(f.row().sync.state,'queued');assert.equal(f.row().sync.code,'command_busy');assert.equal(f.row().sync.attempted,true);assert.equal(JSON.stringify(f.row().value),original);assert.equal(f.events.length,0);
 const again=await f.sync();assert.equal(again.kind,'synced');assert.equal(f.row(),null);assert.equal(f.events[0].kind,'synced');
 assert.deepEqual(f.calls.map(call=>call.method),['GET','POST','GET','POST']);assert.equal(f.calls[1].body,f.calls[3].body);
});
test('503 command_unavailable is a queued known non-outcome, distinct from outcome_unknown',async()=>{
 const f=fixture({unavailable:true}),result=await f.sync();assert.equal(result.kind,'queued');assert.equal(result.code,'command_unavailable');assert.equal(f.row().sync.state,'queued');assert.equal(f.isBusy(result),false);
});
test('busy copy exists in English and Thai and is not a rejection or unknown-outcome message',()=>{
 const f=fixture();assert.match(f.busyMessage(false),/^Busy — not saved yet/);assert.match(f.busyMessage(true),/^ระบบกำลังยุ่ง — ยังไม่ได้บันทึก/);
 for(const thai of [false,true])assert.doesNotMatch(f.busyMessage(thai),/Could not apply|unknown|ไม่สำเร็จ|ไม่ทราบผล/);
 assert.equal(f.isBusy({kind:'blocked',code:'command_busy'}),false);assert.equal(f.isBusy({kind:'queued',code:'connection_unavailable'}),false);assert.ok(f.isBusy({kind:'queued',data:{code:'command_busy'}}));
});
test('recorded rejection retains reason, immutable payload and blocked state without a second POST',async()=>{
 const f=fixture({reject:true}),original=JSON.stringify(f.row().value),result=await f.sync();
 assert.equal(result.kind,'blocked');assert.equal(result.code,'dependency_conflict');assert.equal(f.events[0].code,result.code);assert.equal(f.row().sync.code,result.code);assert.equal(JSON.stringify(f.row().value),original);
 await f.sync();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.match(f.message(result,false),/Related records/);
});
test('local validation failure returns and broadcasts its reason without sending a request',async()=>{
 const f=fixture({invalid:true}),result=await f.sync();assert.equal(result.kind,'blocked');assert.equal(result.code,'unsupported_saved_request');assert.equal(f.events[0].code,result.code);assert.equal(f.calls.length,0);assert.equal(f.row().sync.attempted,false);
});
test('retained blocked backlog returns its original reason without transport',async()=>{
 const f=fixture({blocked:true}),result=await f.sync();assert.equal(result.code,'dependency_conflict');assert.equal(result.kind,'blocked');assert.equal(f.calls.length,0);assert.ok(f.row());
});
test('unknown outcome remains durable and reconcilable, never shown as rejection',async()=>{
 const f=fixture({unknown:true}),original=JSON.stringify(f.row().value),result=await f.sync();assert.equal(result.kind,'queued');assert.equal(result.code,'connection_unavailable');assert.equal(f.row().sync.attempted,true);assert.equal(f.row().sync.state,'queued');assert.equal(JSON.stringify(f.row().value),original);assert.equal(f.events.length,0);
});
test('successful synchronization removes pending storage and publishes the applied outcome',async()=>{
 const f=fixture(),result=await f.sync();assert.equal(result.kind,'synced');assert.equal(f.row(),null);assert.equal(f.events[0].kind,'synced');assert.deepEqual(f.calls.map(call=>call.method),['GET','POST']);
});
test('reason messages support Thai, preserve unknown safe codes and exclude arbitrary server text',()=>{
 const f=fixture();assert.match(f.message({code:'record_requires_reconciliation'},true),/กระทบยอด/);assert.match(f.message({data:{originalOutcome:{code:'new_server_reason'}}},false),/new_server_reason/);assert.doesNotMatch(f.message({data:{code:'<script>private payload',message:'private payload'}},false),/private|script/);assert.doesNotMatch(f.message({code:'dependency_conflict'},false),/review|confirm|retry/i);
});

test('unrecorded HTTP rejection preserves its reason without claiming a recorded outcome',async()=>{
 const f=fixture({unrecorded:true}),result=await f.sync();assert.equal(result.kind,'blocked');assert.equal(result.code,'record_requires_reconciliation');assert.equal(result.data.originalOutcome,undefined);assert.equal(f.row().sync.code,result.code);assert.ok(f.row().value.command);assert.doesNotMatch(f.message(result,false),/recorded|confirm|review/i);
});

// APP-PAY-01 regression guard: a retryable receipt upload failure keeps the payment queued; a 400 still blocks it.
test('receipt upload 503 body_timeout keeps the saved payment queued for retry',async()=>{
 const f=fixture({receiptUpload:{status:503,body:{ok:false,code:'body_timeout'}}}),result=await f.sync();
 assert.equal(result.kind,'queued');assert.equal(result.code,'receipt_unavailable');assert.equal(f.row().sync.state,'queued');assert.equal(f.row().sync.attempted,true);
 assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.ok(f.calls.at(-1).url.includes('/receipts/'));assert.equal(f.events.length,0);
});
test('receipt upload 400 blocks the saved payment',async()=>{
 const f=fixture({receiptUpload:{status:400,body:{ok:false,code:'invalid_request'}}}),result=await f.sync();
 assert.equal(result.kind,'blocked');assert.equal(result.code,'invalid_request');assert.equal(f.row().sync.state,'blocked');
});
