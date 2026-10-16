import test from 'node:test';import assert from 'node:assert/strict';
import {loadWorkerConfig} from '../../services/workers/config.mjs';
import {createWorkerRuntime} from '../../services/workers/runtime.mjs';
import {PROJECT_ID as project,INSTANCE_CONNECTION_NAME} from '../../services/lib/identity.mjs';
// APP-AUTH-06: worker callers are pinned by email and by service-account unique id (OIDC sub).
const scheduler=`mw-credit-app-scheduler-dev@${project}.iam.gserviceaccount.com`,command=`mw-credit-app-command-dev@${project}.iam.gserviceaccount.com`;
const env={APP_ENV:'dev',WORKER_ROLE:'jobs',WORKER_ACTIVATION:'enabled',APPLICATION_PROJECT_ID:project,INSTANCE_CONNECTION_NAME,DB_NAME:'loan_manager_dev',DB_USER:`mw-credit-app-jobs-dev@${project}.iam`,RUNTIME_SERVICE_ACCOUNT:`mw-credit-app-jobs-dev@${project}.iam.gserviceaccount.com`,WORKER_AUDIENCE:'https://mw-credit-app-jobs-dev-737787224638.asia-southeast1.run.app',SCHEDULER_SERVICE_ACCOUNT:scheduler,SQL_REGISTERED_CREATORS_JSON:'["postgres"]',WORKER_CALLER_SUBJECTS_JSON:JSON.stringify({[scheduler]:'1001'})};
test('worker configuration fails closed without exact numeric caller subjects',()=>{
 assert.deepEqual(loadWorkerConfig(env).callerSubjects,{[scheduler]:'1001'});
 for(const value of [undefined,'','not-json','[]','null','{}',JSON.stringify({[scheduler]:1001}),JSON.stringify({[scheduler]:'12a'}),JSON.stringify({[scheduler]:'1'.repeat(31)}),JSON.stringify({[scheduler]:'1001',[command]:'1002'}),JSON.stringify({[command]:'1002'}),JSON.stringify({[scheduler]:'1001','other@example.invalid':'1003'})])
  assert.throws(()=>loadWorkerConfig({...env,WORKER_CALLER_SUBJECTS_JSON:value}),/invalid_worker_configuration/,String(value));
});
test('a verified caller email with a different sub is refused before any SQL',async()=>{
 let sub='2002',effects=0;
 const client={release(){},query:async sql=>{if(sql.includes('FROM pg_roles'))return{rows:[{database:env.DB_NAME,principal:env.DB_USER,session:env.DB_USER,rolcanlogin:true,capability:true,other_membership:false}]};effects++;return{rows:[]};}};
 const runtime=await createWorkerRuntime(env,{createPool:async()=>({connect:async()=>client,end:async()=>{}}),verifyOidc:async()=>({aud:env.WORKER_AUDIENCE,iss:'https://accounts.google.com',email:scheduler,sub,email_verified:true})});
 let status;await runtime.handler({method:'POST',url:'/internal/jobs/daily-charges',headers:{authorization:'Bearer synthetic'}},{writeHead(code){status=code;},end(){}});
 assert.equal(status,403);assert.equal(effects,0);
 sub='1001';await runtime.handler({method:'POST',url:'/internal/jobs/daily-charges',headers:{authorization:'Bearer synthetic'}},{writeHead(code){status=code;},end(){}});
 assert.equal(status,400,'the pinned subject passes authentication and reaches the schedule-time check');
 await runtime.close();
});
