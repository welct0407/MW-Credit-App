import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
// R129 (Chase): an online-only operation (rebate-settlement.*) is never stored in the offline queue. sendOnlineOnly sends it
// directly; an unknown outcome is reconciled by the status read under the same request id (sent again only when the server
// never recorded it); busy and rejections are told apart; OperationConfirm takes this path and never savePending()s it.
const root=new URL('../../apps/pwa/src/',import.meta.url);
const source=ts.transpileModule(readFileSync(new URL('offline-sync.ts',root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const command={requestId:'b1111111-1111-4111-8111-111111111111',operation:'rebate-settlement.create',targetId:'c1111111-1111-4111-8111-111111111111',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{referrerId:'R'}};
const recorded=(status,code=null)=>({kind:'recorded',originalOutcome:{status,code,result:status==='applied'?{targetId:command.targetId}:null,recordedAt:'2026-11-05T00:00:00.000Z'}});
function fixture(answers,{online=true}={}){
 const exports={},calls=[],queue=[...answers];
 const repository={environment:'synthetic',scopeName:'owner',savePending:async()=>{throw Error('an online-only operation reached the offline queue')}};
 runInNewContext(source,{exports,require:()=>({commandOriginAllowed:()=>true}),navigator:{onLine:online},location:{origin:'https://synthetic.invalid'},window:new EventTarget(),crypto,URL,Response,Blob,AbortController,CustomEvent,setTimeout,clearTimeout,
  fetch:async(url,init)=>{calls.push({path:new URL(url).pathname,method:init.method??'GET',body:init.body});const next=queue.shift();if(!next||next==='lost')throw Error('lost response');return new Response(JSON.stringify(next.body),{status:next.status});}});
 const access={origin:'https://synthetic.invalid',offline:repository,offlineOnly:false,token:async()=>'synthetic',authFailure:()=>{}};
 return {send:(options)=>exports.sendOnlineOnly(access,command,options),onlineOnly:exports.onlineOnlyOperation,calls};
}
test('classification: rebate settlements are online only; other operations are not',()=>{
 const f=fixture([]);for(const op of ['rebate-settlement.create','rebate-settlement.delete'])assert.equal(f.onlineOnly(op),true);
 for(const op of ['expense.create','loan.close','payment.delete',null])assert.equal(f.onlineOnly(op),false);
});
test('applied, rejected and busy answers; offline sends nothing',async()=>{
 assert.equal((await fixture([{status:200,body:recorded('applied')}]).send()).kind,'synced');
 const rejected=await fixture([{status:200,body:recorded('rejected','record_requires_reconciliation')}]).send();assert.deepEqual([rejected.kind,rejected.code],['blocked','record_requires_reconciliation']);
 const busy=await fixture([{status:409,body:{ok:false,code:'command_busy'}}]).send();assert.deepEqual([busy.kind,busy.code],['busy','command_busy']);
 const conflict=await fixture([{status:200,body:{kind:'conflict'}}]).send();assert.equal(conflict.kind,'blocked');
 const offline=fixture([],{online:false});assert.equal((await offline.send()).kind,'offline');assert.equal(offline.calls.length,0);
});
test('a lost answer is unknown; Check again reads the status under the same request id first',async()=>{
 // Lost, then the status shows it applied: no second POST.
 const applied=fixture(['lost',{status:200,body:recorded('applied')}]);
 assert.equal((await applied.send()).kind,'unknown');assert.equal((await applied.send({check:true})).kind,'synced');
 assert.deepEqual(applied.calls.map(c=>c.method+' '+c.path),['POST /api/operations','GET /api/operations/'+command.requestId]);
 // Lost, then the server never recorded it: the identical command (same request id) is sent again.
 const unresolved=fixture(['lost',{status:200,body:{kind:'unresolved'}},{status:200,body:recorded('applied')}]);
 await unresolved.send();assert.equal((await unresolved.send({check:true})).kind,'synced');
 const posts=unresolved.calls.filter(c=>c.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].body,posts[1].body);assert.equal(JSON.parse(posts[1].body).requestId,command.requestId);
 // A 5xx or an unreadable status stays unknown and sends nothing more.
 const down=fixture([{status:503,body:{ok:false,code:'command_unavailable'}},{status:503,body:{ok:false}}]);
 assert.equal((await down.send()).kind,'unknown');assert.equal((await down.send({check:true})).kind,'unknown');assert.equal(down.calls.filter(c=>c.method==='POST').length,1);
});
test('OperationConfirm sends an online-only operation directly and saves only other operations',()=>{
 const text=readFileSync(new URL('OperationConfirm.tsx',root),'utf8');
 assert.match(text,/if\(onlineOnly&&!saved\)\{await send\(\);return;\}/,'an online-only Confirm returns before savePending');
 assert.match(text,/sendOnlineOnly\(access,payload\.current,\{check:attempted\.current\}\)/,'Check again reads the status first');
 assert.ok(text.indexOf('if(onlineOnly&&!saved)')<text.indexOf('savePending('),'the online-only branch comes before the queue');
});
