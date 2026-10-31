import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createPostCommitWake,loadDispatchConfig,wakeContext,WAKE_MS,HANDOFF_MS} from '../../services/notifications/postcommit.mjs';
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
// R107: command and chat run with request-based CPU, so callers await the wake before replying. A hung notify holds the
// caller only HANDOFF_MS; the request is left running (never aborted: notify cancels its pass on caller close) until its
// own 30 s deadline, and the deadline header never exceeds WAKE_MS.
test('a hung notify hands the wake off at HANDOFF_MS without aborting the request before its 30 s deadline',async()=>{
 const start=1000000000000;mock.timers.enable({apis:['setTimeout','Date'],now:start});
 const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
 try{
  assert.equal(HANDOFF_MS,2000);
  const logs=[],dispatched=[];
  const wake=createPostCommitWake(loadDispatchConfig(env,'dev'),{log:r=>logs.push(r),fetch:async(url,options)=>{
   if(/identity/.test(url))return{ok:true,text:async()=> 'a.b.c'};
   dispatched.push(options);
   return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
  }});
  let handed=false;const pending=wake({deadline:start+60000}).then(()=>{handed=true;});
  await flush();
  assert.equal(dispatched.length,1);assert.equal(dispatched[0].headers['X-MW-Wake-Deadline'],String(start+WAKE_MS),'deadline header is capped at WAKE_MS');
  mock.timers.tick(HANDOFF_MS-1);await flush();assert.equal(handed,false);
  mock.timers.tick(1);await flush();assert.equal(handed,true,'the caller is released at HANDOFF_MS');
  assert.equal(dispatched[0].signal.aborted,false);assert.deepEqual(logs,[]);
  mock.timers.tick(WAKE_MS-HANDOFF_MS-1);await flush();assert.equal(dispatched[0].signal.aborted,false,'the request is not aborted before its 30 s timer');
  mock.timers.tick(1);await flush();assert.equal(dispatched[0].signal.aborted,true);
  assert.deepEqual(logs,[{component:'notification-wake',event:'deferred_to_recovery'}]);await pending;
 }finally{mock.timers.reset();}
});
test('an uncapped wake (handoffMs null or Infinity, the jobs worker) waits for the full answer past HANDOFF_MS',async()=>{
 const start=1000000000000;mock.timers.enable({apis:['setTimeout','Date'],now:start});
 const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
 try{
  for(const handoffMs of [null,Infinity]){
   const logs=[];let answer;
   const wake=createPostCommitWake(loadDispatchConfig(env,'dev'),{handoffMs,log:r=>logs.push(r),fetch:async url=>/identity/.test(url)?{ok:true,text:async()=> 'a.b.c'}:new Promise(resolve=>{answer=resolve;})});
   let done=false;const pending=wake().then(()=>{done=true;});
   await flush();assert.equal(typeof answer,'function');
   mock.timers.tick(HANDOFF_MS*5);await flush();assert.equal(done,false,'no handoff: the caller still waits');
   answer({status:202});await flush();assert.equal(done,true);assert.deepEqual(logs,[]);await pending;
  }
 }finally{mock.timers.reset();}
});
test('a prompt wake resolves with its delivery, before HANDOFF_MS',async()=>{
 mock.timers.enable({apis:['setTimeout']});
 try{
  for(const status of [200,202,503]){
   let done=false;await Promise.race([createPostCommitWake(loadDispatchConfig(env,'dev'),{fetch:async url=>/identity/.test(url)?{ok:true,text:async()=> 'a.b.c'}:{status}})().then(()=>{done=true;}),new Promise(resolve=>setImmediate(resolve)).then(()=>new Promise(resolve=>setImmediate(resolve)))]);
   assert.equal(done,true,'no fake-timer tick was needed');
  }
 }finally{mock.timers.reset();}
});

import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
const principal={ok:true,subject:'synthetic-subject',email:'synthetic@example.invalid'};
const command={requestId:'12345678-1234-4234-8234-123456789abc',operation:'borrower.create',targetId:'12345678-1234-4234-8234-123456789abd',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{name:'Synthetic',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:null}};
test('R107: the wake runs after the acknowledged commit and release, before the result is returned; never on rollback or read-only; wake errors preserve success',async()=>{
 for(const commitFailure of [false,true]){
  const calls=[];let wakes=0,received=null,after=null;
  const pool={connect:async()=>({release:()=>calls.push('release'),query:async(sql)=>{calls.push(sql);if(sql==='COMMIT'&&commitFailure)throw Error('connection_lost');if(sql.includes('canonical_json'))return{rows:[]};if(sql.includes('pwa_submit_operation_v2')||sql.includes('pwa_operation_status_v2'))return{rows:[{result:{kind:'recorded',originalOutcome:{status:'applied'}}}]};return{rows:[]};}})};
  const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>({issuer:'https://issuer.invalid',subject:principal.subject,partnerId:'synthetic',loginEmail:principal.email}),actorIssuer:'https://issuer.invalid',afterCommit:async context=>{wakes++;received=context;after=calls.slice();throw Error('wake_failure');}});
  const before=Date.now(),result=await store.operation({...principal,[wakeContext]:{deadline:before+14000,signal:new AbortController().signal}},command);
  // The wake is handed off before the reply (request-based CPU); its failure never alters the committed result.
  assert.equal(result.ok,!commitFailure);assert.equal(wakes,commitFailure?0:1);
  if(commitFailure)assert.equal(result.code,'operation_outcome_unknown');
  else{assert.equal(after.at(-1),'release');assert.ok(after.includes('COMMIT'));assert.equal(result.status,200);assert.ok(received.deadline>=before+WAKE_MS&&received.deadline<=Date.now()+WAKE_MS,'wake budget is the 30 s post-commit default, not the browser deadline');assert.equal(received.signal,undefined);await store.operationStatus(principal,command.requestId);assert.equal(wakes,1);assert.equal(calls.includes('ROLLBACK'),false);}
 }
});
// R090 batch 2: the browser's request deadline does not bound the wake (R107: it is now awaited before the reply).
test('the post-commit wake ignores a short browser deadline and keeps the post-commit budget',async()=>{
 let received=null;
 const pool={connect:async()=>({release(){},query:async(sql)=>sql.includes('canonical_json')?{rows:[]}:sql.includes('pwa_submit_operation_v2')?{rows:[{result:{kind:'recorded',originalOutcome:{status:'applied'}}}]}:{rows:[]}})};
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>({issuer:'https://issuer.invalid',subject:principal.subject,partnerId:'synthetic',loginEmail:principal.email}),actorIssuer:'https://issuer.invalid',afterCommit:async context=>{received=context}});
 const deadline=Date.now()+200;assert.equal((await store.operation({...principal,[wakeContext]:{deadline}},command)).ok,true);assert.ok(received.deadline>=Date.now()+29000);
});

// R090 batch 2 (B1/B3): the chat service is a second post-commit caller: a detached turn's reply event commits with the
// turn, then the same wake runs (OIDC POST with the deadline); a rejected wake never fails the committed turn.
import {createChatStore} from '../../services/chat/store.mjs';
test('chat completion (a stream whose device left, V106) wakes dispatch after COMMIT only when it recorded a reply event; wake failure keeps the result',async()=>{
 for(const wakeStatus of [200,503]){
  const sql=[],calls=[];
  const client={async query(text){sql.push(text);if(String(text).includes('pwa_notify_chat_reply_v1'))return {rows:[{value:true}]};return {rows:[{value:{id:'r',detached:true}}]};},release(){}};
  const afterCommit=createPostCommitWake(loadDispatchConfig(env,'dev'),{fetch:async(url,options)=>{calls.push({url,options,after:sql.at(-1)});return calls.length===1?{ok:true,text:async()=> 'a.b.c'}:{status:wakeStatus};}});
  const store=createChatStore({pool:{connect:async()=>client},guardConnection:async()=>{},issuer:'iss',resolveActor:async()=>({issuer:'iss'}),afterCommit});
  assert.deepEqual(await store.complete({},'m',{status:'ok'},null,[],{thread:'t'}),{message:{id:'r'},detached:true});
  assert.equal(calls.length,2);assert.equal(calls[0].after,'COMMIT');assert.equal(calls[1].url,env.NOTIFICATION_DISPATCH_URL);assert.match(calls[1].options.headers['X-MW-Wake-Deadline'],/^\d{13}$/);
 }
});

test('a 202 (wake queued by a busy worker) is a delivered wake, not a deferral',async()=>{
 const logs=[];
 await createPostCommitWake(loadDispatchConfig(env,'dev'),{log:r=>logs.push(r),fetch:async url=>/identity/.test(url)?{ok:true,text:async()=> 'a.b.c'}:{status:202}})();
 assert.deepEqual(logs,[]);
 await createPostCommitWake(loadDispatchConfig(env,'dev'),{log:r=>logs.push(r),fetch:async url=>/identity/.test(url)?{ok:true,text:async()=> 'a.b.c'}:{status:409}})();
 assert.deepEqual(logs,[{component:'notification-wake',event:'deferred_to_recovery'}]);
});
