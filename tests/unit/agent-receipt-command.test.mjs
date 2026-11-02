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
test('R112 schemaVersion 9 adds purpose and the plan lists (v10 shapes) after payerLines; reviewed only; one request id per slip',()=>{
 const purpose={forward:true,principal:[{loanId:'L-1',amount:'60'}],loans:null};
 const plan={allocations:[{chargeId:'L-1-today',principal:'60',interest:'10',expectedPrincipalRemaining:'60',expectedInterestRemaining:'10',chargeDate:'2026-10-12'},{chargeId:'cg8:3:L-1:2026-10-13',principal:'0',interest:'30',expectedPrincipalRemaining:'0',expectedInterestRemaining:'30',chargeDate:'2026-10-13'}],
  materialize:[{loanId:'L-1',chargeId:'cg8:3:L-1:2026-10-13',chargeDate:'2026-10-13',principalDue:'0',interestDue:'30'}],
  principal:[{loanId:'L-1',kind:'raise',chargeId:'L-1-today',chargeDate:'2026-10-12',amount:'60',accruedInterest:'0',principalDue:'60'}]};
 const v9={...command,schemaVersion:9,payerLines:null,purpose,...plan};
 const canonical=canonicalAgentCommand(v9);
 assert.deepEqual(Object.keys(canonical),['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','payerLines','purpose','allocations','materialize','principal','proposalSha256','archiveEvidence']);
 assert.equal(canonical.requestId,requestId,'the slip keeps its request id');
 const json=agentIdentity({...v9,purpose:{loans:null,principal:[{amount:'60',loanId:'L-1'}],forward:true},allocations:plan.allocations.map(l=>({chargeDate:l.chargeDate,...l}))},actor).canonicalJson;
 assert.match(json,/"payerLines":null,"purpose":\{"forward":true,"principal":\[\{"loanId":"L-1","amount":"60"\}\],"loans":null\},"allocations":\[\{"chargeId":"L-1-today","principal":"60","interest":"10","expectedPrincipalRemaining":"60","expectedInterestRemaining":"10","chargeDate":"2026-10-12"\}/);
 assert.match(json,/"materialize":\[\{"loanId":"L-1","chargeId":"cg8:3:L-1:2026-10-13","chargeDate":"2026-10-13","principalDue":"0","interestDue":"30"\}\],"principal":\[\{"loanId":"L-1","kind":"raise","chargeId":"L-1-today","chargeDate":"2026-10-12","amount":"60","accruedInterest":"0","principalDue":"60"\}\],"proposalSha256"/);
 assert.notEqual(agentIdentity(v9,actor).payloadSha256,agentIdentity({...v9,purpose:{...purpose,forward:false},allocations:[plan.allocations[0]],amountReceived:'70',materialize:[]},actor).payloadSha256,'another purpose is another payload under the same id');
 assert.equal(canonicalAgentCommand({...v9,purpose:{forward:true,principal:[],loans:null},principal:[]}).principal.length,0);
 for(const patch of [{mode:'automatic'},{purpose:{forward:false,principal:[],loans:null}},{purpose:{...purpose,loans:['L-1']}},{purpose:{...purpose,principal:[{loanId:'L-1',amount:'0'}]}},
  {purpose:{...purpose,principal:[{loanId:'L-2',amount:'1'},{loanId:'L-1',amount:'1'}]}},{allocations:[]},{allocations:[...plan.allocations].reverse()},{amountReceived:'99'},
  {allocations:[{...plan.allocations[0],interest:'11'},plan.allocations[1]]},{materialize:[{...plan.materialize[0],chargeId:'cg8:3:L-1:2026-10-14'}]},
  {principal:[{...plan.principal[0],kind:'move'}]},{principal:[{...plan.principal[0],extra:1}]},{payerLines:undefined},{purpose:undefined}])
  assert.throws(()=>canonicalAgentCommand({...v9,...patch}),JSON.stringify(patch));
 const {materialize:_,...missing}=v9;assert.throws(()=>canonicalAgentCommand(missing));
 assert.throws(()=>canonicalAgentCommand({...command,schemaVersion:8,payerLines:null,purpose}),'v8 refuses purpose');
});
test('machine receipt policy stays off by default and pins environment/audience/private numeric version',()=>{
 assert.equal(loadAgentReceiptPolicy({},'dev'),null);
 assert.throws(()=>loadAgentReceiptPolicy({AGENT_RECEIPT_API_ENABLED:'true'},'dev'));
});
test('route-local workload auth never bypasses human routes; committed result survives wake failure after release; the wake gets no close signal',async()=>{
 const policy={environment:'dev',audience:'https://command.invalid',callerEmail:'agent@example.invalid',callerSubject:actor.subject,automaticPartnerId:'auto',reviewerPartnerIds:['reviewer']};
 const calls=[];let valid=true,wakes=0,woken=null;
 const pool={connect:async()=>({query:async(sql)=>{calls.push(sql);if(sql.includes('FROM public."Partners"'))return{rows:[{id:'reviewer',email:actor.loginEmail,reviewer:true,enabled:true,matches:'1'}]};if(sql.includes('pwa_submit_agent'))return{rows:[{value:{kind:'recorded',reviewId,financialMatch:true,originalOutcome:{status:'posted',paymentId:'pwa:'+requestId}}}]};return{rows:[]};},release(){calls.push('release');}})};
 const handler=createAgentReceiptHandler({next:(_req,res)=>{res.writeHead(401);res.end('human gate');},policy,pool,guardConnection:async()=>{},afterCommit:async context=>{wakes++;woken={context,after:calls.at(-1)};throw Error('wake');},verifyOidc:async()=>({aud:policy.audience,iss:'https://accounts.google.com',email:valid?policy.callerEmail:'other',sub:actor.subject,email_verified:true,exp:Date.now()/1000+60,iat:Date.now()/1000})});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const call=()=>fetch(origin+'/internal/agent/receipt-payments',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({command,actorPartnerId:'reviewer'})});
  valid=false;assert.equal((await call()).status,401);assert.equal(calls.length,0);valid=true;
  const response=await call();assert.equal(response.status,200);assert.equal((await response.json()).originalOutcome.paymentId,'pwa:'+requestId);assert.equal(wakes,1);assert.equal(calls.includes('ROLLBACK'),false);
  // Asserted outside the hook: the handler swallows wake errors. R107: no response-close signal reaches the wake.
  assert.equal(woken.after,'release');assert.deepEqual(Object.keys(woken.context),['deadline']);assert.ok(woken.context.deadline<=Date.now()+14000);
  assert.equal((await fetch(origin+'/api/operations',{headers:{Authorization:'Bearer test'}})).status,401);
 }finally{await new Promise(r=>server.close(r));}
});
