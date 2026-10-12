import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostCommitWake,loadDispatchConfig} from '../../services/notifications/postcommit.mjs';
const audience='https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app';
const env={NOTIFICATION_DISPATCH_ENABLED:'true',NOTIFICATION_DISPATCH_URL:audience+'/internal/dispatch',NOTIFICATION_DISPATCH_AUDIENCE:audience};
test('wake is default off and exact environment bound',async()=>{
 assert.equal(loadDispatchConfig({},'dev'),null);
 assert.throws(()=>loadDispatchConfig(env,'prod'));
 assert.throws(()=>loadDispatchConfig({...env,NOTIFICATION_DISPATCH_URL:'https://other.invalid'},'dev'));
 await createPostCommitWake(null,{fetch:()=>{throw Error('unexpected');}})();
});
test('postcommit wake uses OIDC, empty POST, absolute bounded deadline, and no redirects',async()=>{
 const calls=[];
 await createPostCommitWake(loadDispatchConfig(env,'dev'),{now:()=>1000000000000,fetch:async(url,options)=>{calls.push({url,options});return calls.length===1?{ok:true,text:async()=> 'a.b.c'}:{status:200};}})({deadline:1000000001000});
 assert.equal(calls.length,2);assert.match(calls[0].url,/identity\?audience=/);
 assert.equal(calls[1].url,env.NOTIFICATION_DISPATCH_URL);assert.equal(calls[1].options.method,'POST');assert.equal(calls[1].options.body,undefined);
 assert.equal(calls[1].options.headers['X-MW-Wake-Deadline'],'1000000001000');assert.equal(calls[1].options.redirect,'error');
});
test('auth, transport, rejected response, expired budget and throwing logger cannot escape',async()=>{
 for(const fetch of [async()=>{throw Error('unavailable')},async()=>({ok:false}),async()=>({ok:true,text:async()=> 'bad'}),async()=>({ok:true,text:async()=> 'a.b.c',status:503})])await createPostCommitWake(loadDispatchConfig(env,'dev'),{fetch,log:()=>{throw Error('logger');}})();
 let calls=0;await createPostCommitWake(loadDispatchConfig(env,'dev'),{fetch:async()=>{calls++;}})({deadline:0});assert.equal(calls,0);
});

import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
const principal={ok:true,subject:'synthetic-subject',email:'synthetic@example.invalid'};
const command={requestId:'12345678-1234-4234-8234-123456789abc',operation:'borrower.create',targetId:'12345678-1234-4234-8234-123456789abd',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{name:'Synthetic',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:null}};
test('wake follows acknowledged commit and release, never rollback or read-only; wake errors preserve success',async()=>{
 for(const commitFailure of [false,true]){
  const calls=[];let wakes=0;
  const pool={connect:async()=>({release:()=>calls.push('release'),query:async(sql)=>{calls.push(sql);if(sql==='COMMIT'&&commitFailure)throw Error('connection_lost');if(sql.includes('canonical_json'))return{rows:[]};if(sql.includes('pwa_submit_operation_v2')||sql.includes('pwa_operation_status_v2'))return{rows:[{result:{kind:'recorded',originalOutcome:{status:'applied'}}}]};return{rows:[]};}})};
  const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>({issuer:'https://issuer.invalid',subject:principal.subject,partnerId:'synthetic',loginEmail:principal.email}),actorIssuer:'https://issuer.invalid',afterCommit:async()=>{wakes++;assert.equal(calls.at(-1),'release');assert.ok(calls.includes('COMMIT'));throw Error('wake_failure');}});
  const result=await store.operation(principal,command);
  assert.equal(result.ok,!commitFailure);assert.equal(wakes,commitFailure?0:1);
  if(commitFailure)assert.equal(result.code,'operation_outcome_unknown');
  else{await store.operationStatus(principal,command.requestId);assert.equal(wakes,1);assert.equal(calls.includes('ROLLBACK'),false);}
 }
});
