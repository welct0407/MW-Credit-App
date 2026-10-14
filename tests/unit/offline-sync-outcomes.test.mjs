import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/offline-sync.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const id='11111111-1111-4111-8111-111111111111';
function fixture({invalid=false,reject=false,unknown=false,blocked=false,unrecorded=false}={}){
 const exports={},events=[],calls=[];
 let row={value:{command:invalid?{requestId:id}:{requestId:id,operation:'loan.update',targetId:'loan',inputs:{principal:'100'}}},sync:{state:blocked?'blocked':'queued',attempted:false,...(blocked?{code:'dependency_conflict'}:{})}};
 const repository={environment:'synthetic',scopeName:'owner',syncAuthorized:async()=>true,claimPending:async()=>row?.sync.state==='blocked'?null:row,pending:async()=>row,markPendingDispatched:async()=>true,settlePending:async(_id,_owner,sync)=>{row=sync?{...row,sync}:null}};
 const window=new EventTarget();window.addEventListener('mw-offline-sync-outcome',event=>events.push(event.detail));
 runInNewContext(source,{exports,require:()=>({commandOriginAllowed:()=>true}),navigator:{onLine:true},location:{origin:'https://synthetic.invalid'},window,crypto,URL,Response,Blob,AbortController,CustomEvent,setTimeout,clearTimeout,fetch:async(url,init)=>{calls.push({url,method:init.method??'GET',body:init.body});if(init.method==='POST'){if(unknown)throw Error('lost response');if(unrecorded)return new Response(JSON.stringify({code:'record_requires_reconciliation'}),{status:422});return new Response(JSON.stringify({kind:'recorded',originalOutcome:{status:reject?'rejected':'applied',code:reject?'dependency_conflict':undefined}}),{status:reject?422:200})}return new Response(JSON.stringify({kind:'unresolved'}))}});
 return {sync:()=>exports.syncSavedRequest({origin:'https://synthetic.invalid',offline:repository,token:async()=>'synthetic',authFailure:()=>{}},id),message:exports.savedRejectionMessage,events,calls,row:()=>row};
}
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
