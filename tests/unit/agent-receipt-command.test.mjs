import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {agentIdentity,canonicalAgentCommand,receiptRequestId} from '../../services/agent-receipts/contract.mjs';
import {createAgentReceiptHandler,loadAgentReceiptPolicy} from '../../services/agent-receipts/runtime.mjs';
import {canonicalCommand} from '../../services/contracts/payment-command.mjs';
const reviewId='synthetic-review-1',requestId=receiptRequestId('dev',reviewId);
const command={schemaVersion:7,requestId,environment:'dev',reviewId,mode:'reviewed',borrowerId:'borrower',cashAccountId:'account',amountReceived:'100',paymentDate:'2026-10-12',transferTime:'12:34',bankReference:' bank-REF 1 ',proposalSha256:'c'.repeat(64),archiveEvidence:{receiptId:'a'.repeat(64),objectKey:`receipts/dev/2026/10/12/${'a'.repeat(64)}/${'b'.repeat(64)}.jpg`,generation:'1234',rawSha256:'b'.repeat(64),mimeType:'image/jpeg',sizeBytes:123,capturedAt:'1791766800'}};
const actor={issuer:'https://accounts.google.com',subject:'123456789',partnerId:'reviewer',loginEmail:'reviewer@example.invalid'};
test('receipt identity is deterministic, environment bound, native schema7 and rejects altered archive or browser use',()=>{
 assert.equal(requestId,'1da49312-d7f1-4948-85a6-b3bf3e61035c');assert.equal(receiptRequestId('prod',reviewId),'b8ffcf33-e1ea-439b-aba5-24b6c914918b');
 const canonical=canonicalAgentCommand(command);assert.equal(canonical.bankReference,' bank-REF 1 ');assert.equal(canonical.requestId,requestId);assert.notEqual(receiptRequestId('prod',reviewId),requestId);
 assert.equal(JSON.parse(agentIdentity(command,actor).canonicalJson).receipt,null);assert.throws(()=>canonicalCommand(command));
 for(const patch of [{requestId:receiptRequestId('dev','other')},{amountReceived:'100.5'},{transferTime:'24:00'},{paymentDate:'2026-02-30'},{extra:true},{archiveEvidence:{...command.archiveEvidence,objectKey:command.archiveEvidence.objectKey.replace('/dev/','/prod/')}},{archiveEvidence:{...command.archiveEvidence,generation:1234}}])assert.throws(()=>canonicalAgentCommand({...command,...patch}));
});
test('R095 schemaVersion 8 adds payerLines {before,after} after bankReference; 7 stays accepted and refuses it',()=>{
 const change={after:'นาย สมชาย ใจดี\nน.ส. สมฤดี เ',before:'นาย สมชาย ใจดี'};
 const v8={...command,schemaVersion:8,payerLines:change};
 const canonical=canonicalAgentCommand(v8);
 assert.deepEqual(Object.keys(canonical),['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','payerLines','proposalSha256','archiveEvidence']);
 assert.deepEqual(Object.keys(canonical.payerLines),['before','after'],'canonical key order');
 assert.match(agentIdentity(v8,actor).canonicalJson,/"payerLines":\{"before":"นาย สมชาย ใจดี","after":"นาย สมชาย ใจดี\\nน.ส. สมฤดี เ"\},"proposalSha256"/);
 assert.equal(canonicalAgentCommand({...v8,payerLines:null}).payerLines,null);
 assert.equal(canonicalAgentCommand({...v8,payerLines:{before:null,after:'MR. SOMCHAI J***'}}).payerLines.before,null);
 assert.notEqual(agentIdentity(v8,actor).payloadSha256,agentIdentity({...v8,payerLines:{...change,after:'Other Name'}},actor).payloadSha256);
 assert.equal('payerLines' in canonicalAgentCommand(command),false);
 assert.throws(()=>canonicalAgentCommand({...command,payerLines:null}));
 for(const payerLines of ['x',{after:'a b c'},{before:null,after:''},{before:'a b c',after:'a b c'},{before:null,after:'a\n\nb'},{before:null,after:' padded'},{before:null,after:Array(6).fill('ก กกก').join('\n')},undefined])
  assert.throws(()=>canonicalAgentCommand({...v8,payerLines}),JSON.stringify(payerLines));
 const {payerLines:_,...missing}=v8;assert.throws(()=>canonicalAgentCommand(missing));
 assert.throws(()=>canonicalAgentCommand({...v8,schemaVersion:9}));
});
test('machine receipt policy stays off by default and pins environment/audience/private numeric version',()=>{
 assert.equal(loadAgentReceiptPolicy({},'dev'),null);
 assert.throws(()=>loadAgentReceiptPolicy({AGENT_RECEIPT_API_ENABLED:'true'},'dev'));
});
test('route-local workload auth never bypasses human routes; committed result survives wake failure after release',async()=>{
 const policy={environment:'dev',audience:'https://command.invalid',callerEmail:'agent@example.invalid',callerSubject:actor.subject,automaticPartnerId:'auto',reviewerPartnerIds:['reviewer']};
 const calls=[];let valid=true,wakes=0;
 const pool={connect:async()=>({query:async(sql)=>{calls.push(sql);if(sql.includes('FROM public."Partners"'))return{rows:[{id:'reviewer',email:actor.loginEmail,reviewer:true,enabled:true,matches:'1'}]};if(sql.includes('pwa_submit_agent'))return{rows:[{value:{kind:'recorded',reviewId,financialMatch:true,originalOutcome:{status:'posted',paymentId:'pwa:'+requestId}}}]};return{rows:[]};},release(){calls.push('release');}})};
 const handler=createAgentReceiptHandler({next:(req,res)=>{res.writeHead(401);res.end('human gate');},policy,pool,guardConnection:async()=>{},afterCommit:async()=>{wakes++;assert.equal(calls.at(-1),'release');throw Error('wake');},verifyOidc:async()=>({aud:policy.audience,iss:'https://accounts.google.com',email:valid?policy.callerEmail:'other',sub:actor.subject,email_verified:true,exp:Date.now()/1000+60,iat:Date.now()/1000})});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const call=()=>fetch(origin+'/internal/agent/receipt-payments',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({command,actorPartnerId:'reviewer'})});
  valid=false;assert.equal((await call()).status,401);assert.equal(calls.length,0);valid=true;
  const response=await call();assert.equal(response.status,200);assert.equal((await response.json()).originalOutcome.paymentId,'pwa:'+requestId);assert.equal(wakes,1);assert.equal(calls.includes('ROLLBACK'),false);
  assert.equal((await fetch(origin+'/api/operations',{headers:{Authorization:'Bearer test'}})).status,401);
 }finally{await new Promise(r=>server.close(r));}
});
