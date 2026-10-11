import test from 'node:test';import assert from 'node:assert/strict';
import {loadWorkerConfig} from '../../services/workers/config.mjs';
import {createWorkerRuntime,scheduledBoundary} from '../../services/workers/runtime.mjs';
import {parseNotificationPolicy} from '../../services/notifications/policy.mjs';
const project='clever-oasis-508610-n7';
const env={APP_ENV:'dev',WORKER_ROLE:'jobs',WORKER_ACTIVATION:'enabled',APPLICATION_PROJECT_ID:project,INSTANCE_CONNECTION_NAME:`${project}:asia-southeast1:appsheet-pg-prod-20260914`,DB_NAME:'loan_manager_dev',DB_USER:`mw-credit-app-jobs-dev@${project}.iam`,RUNTIME_SERVICE_ACCOUNT:`mw-credit-app-jobs-dev@${project}.iam.gserviceaccount.com`,WORKER_AUDIENCE:'https://mw-credit-app-jobs-dev-737787224638.asia-southeast1.run.app',SCHEDULER_SERVICE_ACCOUNT:`mw-credit-app-scheduler-dev@${project}.iam.gserviceaccount.com`,SQL_REGISTERED_CREATORS_JSON:'["postgres"]'};
test('DEV API enrollment requires the owner tuple while dispatch additionally requires the enrolled device pin',()=>{
 const policy={schemaVersion:1,environment:'dev',evidenceSha256:'a'.repeat(64),members:[{partnerId:'owner-partner',loginEmail:'welct0407@mw-credit.com',partnerRole:'A',capabilities:['read']}],owner:{subject:'owner-subject',partnerId:'owner-partner',loginEmail:'welct0407@mw-credit.com',endpointSha256:null}};
 assert.equal(parseNotificationPolicy(JSON.stringify(policy),'dev',{requireEndpoint:false}).owner.endpointSha256,null);
 assert.throws(()=>parseNotificationPolicy(JSON.stringify(policy),'dev'));
 policy.owner.endpointSha256='b'.repeat(64);assert.equal(parseNotificationPolicy(JSON.stringify(policy),'dev').owner.subject,'owner-subject');
 policy.owner.partnerId='other';assert.throws(()=>parseNotificationPolicy(JSON.stringify(policy),'dev',{requireEndpoint:false}));
});
test('worker exact environment identities and separation fail closed',()=>{
 assert.equal(loadWorkerConfig({}),null);assert.equal(loadWorkerConfig(env).capability,'mw_jobs_dev');
 for(const patch of [{DB_NAME:'loan_manager_prod'},{WORKER_AUDIENCE:'https://attacker.invalid'},{DB_USER:'postgres'},{WEB_PUSH_VAPID_JSON:'{}'},{NOTIFICATION_POLICY_JSON:'{}'},{PGHOST:'localhost'},{WORKER_ACTIVATION:'true'}])assert.throws(()=>loadWorkerConfig({...env,...patch}));
});
test('disabled worker creates no pool, credentials or effect',async()=>{
 const runtime=await createWorkerRuntime({},new Proxy({},{get(){throw Error('dependency touched');}}));let code,body;
 runtime.handler({}, {writeHead(c){code=c;},end(b){body=JSON.parse(b);}});assert.equal(code,503);assert.equal(body.error,'worker_disabled');await runtime.close();
 runtime.handler({method:'GET',url:'/health'}, {writeHead(c,headers){code=c;assert.equal(headers['Cache-Control'],'no-store');},end(b){body=JSON.parse(b);}});assert.equal(code,200);assert.deepEqual(body,{status:'ok',enabled:false});
});
test('scheduler boundary preserves original Bangkok date/hour and rejects malformed calendar values',()=>{
 assert.deepEqual(scheduledBoundary('2026-10-11T17:05:00Z'),{day:'2026-10-12',hour:'00'});
 for(const value of [undefined,'2026-02-30T00:00:00Z','today','2026-10-11'])assert.throws(()=>scheduledBoundary(value));
});
test('delayed previous-day and previous-hour invocations never become current work',async()=>{
 let effects=0;const logs=[];
 const client={release(){},query:async sql=>{if(sql.includes('FROM pg_roles'))return{rows:[{database:env.DB_NAME,principal:env.DB_USER,session:env.DB_USER,rolcanlogin:true,capability:true,other_membership:false}]};if(sql.includes('clock_timestamp'))return{rows:[{day:'2026-10-12',hour:'01'}]};effects++;throw Error('unexpected effect');}};
 const runtime=await createWorkerRuntime(env,{createPool:async()=>({connect:async()=>client,end:async()=>{}}),verifyOidc:async()=>({aud:env.WORKER_AUDIENCE,iss:'https://accounts.google.com',email:env.SCHEDULER_SERVICE_ACCOUNT,email_verified:true}),log:r=>logs.push(r)});
 for(const [job,time]of [['daily-charges','2026-10-10T17:05:00Z'],['recent-analytics','2026-10-11T17:00:00Z']]){let code;await runtime.handler({method:'POST',url:'/internal/jobs/'+job,headers:{authorization:'Bearer token','x-cloudscheduler-scheduletime':time}},{writeHead(c){code=c;},end(){}});assert.equal(code,409);}
 assert.equal(effects,0);assert.equal(logs.length,2);assert.equal(logs[0].requestId,'daily-charges|2026-10-11|daily');await runtime.close();
});
test('private jobs route rejects wrong scheduler and body-selected execution before SQL',async()=>{
 let verified=true,effects=0;
 const client={release(){},query:async sql=>{if(sql.includes('FROM pg_roles'))return{rows:[{database:env.DB_NAME,principal:env.DB_USER,session:env.DB_USER,rolcanlogin:true,capability:true,other_membership:false}]};effects++;throw Error('unexpected effect');}};
 const runtime=await createWorkerRuntime(env,{createPool:async()=>({connect:async()=>client,end:async()=>{}}),verifyOidc:async()=>({aud:env.WORKER_AUDIENCE,iss:'https://accounts.google.com',email:verified?env.SCHEDULER_SERVICE_ACCOUNT:'other@example.invalid',email_verified:true})});
 const invoke=async(req)=>{let code;await runtime.handler(req,{writeHead(c){code=c;},end(){}});return code;};
 assert.equal(await invoke({method:'GET',url:'/health',headers:{}}),200);assert.equal(effects,0);
 verified=false;assert.equal(await invoke({method:'POST',url:'/internal/jobs/daily-charges',headers:{authorization:'Bearer token'}}),403);
 verified=true;assert.equal(await invoke({method:'POST',url:'/internal/jobs/daily-charges',headers:{authorization:'Bearer token','content-length':'2'}}),400);
 assert.equal(await invoke({method:'POST',url:'/internal/jobs/arbitrary',headers:{authorization:'Bearer token'}}),404);assert.equal(effects,0);await runtime.close();
});
test('jobs permit a bounded original schedule retry and reject future or over-age same-boundary attempts',async()=>{
 let effects=0,now=Date.parse('2026-10-11T17:06:00Z');
 const client={release(){},query:async(sql,args)=>{if(sql.includes('FROM pg_roles'))return{rows:[{database:env.DB_NAME,principal:env.DB_USER,session:env.DB_USER,rolcanlogin:true,capability:true,other_membership:false}]};if(sql.includes('clock_timestamp'))return{rows:[{day:'2026-10-12',hour:'00',milliseconds:String(now)}]};assert.match(sql,/pwa_job_run_v1/);assert.deepEqual(args,['daily-charges','2026-10-12','daily']);effects++;return{rows:[{result:{enabled:true,state:'completed',replayed:false,resultCount:3}}]};}};
 const runtime=await createWorkerRuntime(env,{createPool:async()=>({connect:async()=>client,end:async()=>{}}),verifyOidc:async()=>({aud:env.WORKER_AUDIENCE,iss:'https://accounts.google.com',email:env.SCHEDULER_SERVICE_ACCOUNT,email_verified:true})});
 const invoke=async(job,time)=>{let code;await runtime.handler({method:'POST',url:'/internal/jobs/'+job,headers:{authorization:'Bearer token','x-cloudscheduler-scheduletime':time}},{writeHead(c){code=c;},end(){}});return code;};
 assert.equal(await invoke('daily-charges','2026-10-11T17:05:00Z'),200);assert.equal(effects,1);
 assert.equal(await invoke('daily-charges','2026-10-11T17:07:00Z'),409);
 now=Date.parse('2026-10-11T17:15:00Z');assert.equal(await invoke('recent-analytics','2026-10-11T17:00:00Z'),409);
 now=Date.parse('2026-10-11T18:06:00Z');assert.equal(await invoke('daily-charges','2026-10-11T17:05:00Z'),409);assert.equal(effects,1);await runtime.close();
});
