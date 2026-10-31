import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPaymentCommandHandler} from '../../services/payment-command/handler.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {createPostCommitWake,loadDispatchConfig,HANDOFF_MS} from '../../services/notifications/postcommit.mjs';
// APP-PAY-02 (R107): the command service runs with request-based CPU, so the notification wake starts after the commit
// and before the HTTP response finishes; a slow or cold notify service delays the committed reply at most HANDOFF_MS and
// a failed wake never changes it.
const command={requestId:'12345678-1234-4234-8234-123456789abc',operation:'borrower.create',targetId:'12345678-1234-4234-8234-123456789abd',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{name:'Synthetic',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:null}};
const audience='https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app';
const dispatch=loadDispatchConfig({NOTIFICATION_DISPATCH_ENABLED:'true',NOTIFICATION_DISPATCH_URL:audience+'/internal/dispatch',NOTIFICATION_DISPATCH_AUDIENCE:audience},'dev');
const pool={connect:async()=>({release(){},query:async(sql)=>sql.includes('canonical_json')?{rows:[]}:sql.includes('pwa_submit_operation_v2')?{rows:[{result:{kind:'recorded',originalOutcome:{status:'applied'}}}]}:{rows:[]}})};
async function serve(afterCommit,order){
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>({issuer:'https://issuer.invalid',subject:'synthetic',partnerId:'synthetic',loginEmail:'synthetic@example.invalid'}),actorIssuer:'https://issuer.invalid',afterCommit});
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],verifyPrincipal:async()=>({ok:true,subject:'synthetic',email:'synthetic@example.invalid'}),store,completionLogger:()=>order.push('finish')});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const post=()=>fetch('http://127.0.0.1:'+server.address().port+'/api/operations',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json','X-MW-Wake-Deadline':String(Date.now()+15000)},body:JSON.stringify(command)});
 return {post,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('the post-commit wake starts before the response finishes',async()=>{
 const order=[];const app=await serve(async()=>{order.push('wake');},order);
 try{
  const response=await app.post();assert.equal(response.status,200);assert.equal((await response.json()).kind,'recorded');
  for(let i=0;i<5&&order.length<2;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(order,['wake','finish']);
 }finally{await app.close();}
});
test('a hung notify delays the committed 200 reply only until HANDOFF_MS and is not aborted',async()=>{
 const order=[];let signal;
 const afterCommit=createPostCommitWake(dispatch,{fetch:async(url,options)=>{
  if(/identity/.test(url))return{ok:true,text:async()=> 'a.b.c'};
  order.push('wake');signal=options.signal;return new Promise(()=>{});
 }});
 const app=await serve(afterCommit,order);
 // Only setTimeout is faked: the handoff (and the wake's own 30 s timer) advance on tick; the HTTP server and client do not use it.
 mock.timers.enable({apis:['setTimeout']});
 try{
  const started=Date.now();let replied=false;
  const reply=app.post().then(response=>{replied=true;return response;});
  for(let i=0;i<200&&!order.includes('wake');i++)await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(order,['wake']);
  mock.timers.tick(HANDOFF_MS-1);for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(replied,false,'the reply waits for the handoff');
  mock.timers.tick(1);
  const response=await reply;assert.equal(response.status,200);assert.equal((await response.json()).kind,'recorded');
  assert.ok(Date.now()-started<2500,'reply arrives within ~2.5 s');
  assert.deepEqual(order,['wake','finish']);assert.equal(signal.aborted,false,'the pending wake is left running');
 }finally{mock.timers.reset();await app.close();}
});
test('a rejecting wake still replies 200 with the committed result',async()=>{
 const order=[];const app=await serve(async()=>{order.push('wake');throw Error('wake_failure');},order);
 try{
  const response=await app.post();assert.equal(response.status,200);assert.equal((await response.json()).kind,'recorded');
  for(let i=0;i<5&&order.length<2;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(order,['wake','finish']);
 }finally{await app.close();}
});
