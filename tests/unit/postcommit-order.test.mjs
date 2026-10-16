import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPaymentCommandHandler} from '../../services/payment-command/handler.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
// APP-PAY-02: the HTTP response finishes before the notification wake runs; a slow or cold notify service cannot delay the committed reply.
const command={requestId:'12345678-1234-4234-8234-123456789abc',operation:'borrower.create',targetId:'12345678-1234-4234-8234-123456789abd',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{name:'Synthetic',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:null}};
test('response finish precedes the post-commit wake and a hung wake never delays the reply',async()=>{
 const order=[];let release;
 const pool={connect:async()=>({release(){},query:async(sql)=>sql.includes('canonical_json')?{rows:[]}:sql.includes('pwa_submit_operation_v2')?{rows:[{result:{kind:'recorded',originalOutcome:{status:'applied'}}}]}:{rows:[]}})};
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>({issuer:'https://issuer.invalid',subject:'synthetic',partnerId:'synthetic',loginEmail:'synthetic@example.invalid'}),actorIssuer:'https://issuer.invalid',afterCommit:async()=>{order.push('wake');await new Promise(resolve=>{release=resolve})}});
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],verifyPrincipal:async()=>({ok:true,subject:'synthetic',email:'synthetic@example.invalid'}),store,completionLogger:()=>order.push('finish')});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const started=Date.now();
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/operations',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json','X-MW-Wake-Deadline':String(Date.now()+15000)},body:JSON.stringify(command)});
  assert.equal(response.status,200);assert.equal((await response.json()).kind,'recorded');
  assert.ok(Date.now()-started<2000,'reply does not wait for the wake');
  for(let i=0;i<5&&order.length<2;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(order,['finish','wake']);
 }finally{release?.();await new Promise(resolve=>server.close(resolve))}
});
