import {createECDH} from 'node:crypto';
import {parseNotificationPolicy} from '../notifications/policy.mjs';
import {loadDispatchConfig} from '../notifications/postcommit.mjs';
import {PROJECT_ID as project,PROJECT_NUMBER as number,REGION as region,isSharedInstanceConnection} from '../lib/identity.mjs';
const fail=()=>{throw Error('invalid_worker_configuration');};
export function loadWorkerConfig(env){
 if(env.WORKER_ACTIVATION===undefined||env.WORKER_ACTIVATION==='disabled')return null;
 const environment=env.APP_ENV,role=env.WORKER_ROLE;
 if(env.WORKER_ACTIVATION!=='enabled'||!['dev','prod'].includes(environment)||!['notify','jobs'].includes(role)||env.APPLICATION_PROJECT_ID!==project)fail();
 const service=`mw-credit-app-${role}-${environment}`,dbUser=`${service}@${project}.iam`,audience=`https://${service}-${number}.${region}.run.app`,scheduler=`mw-credit-app-scheduler-${environment}@${project}.iam.gserviceaccount.com`;
 if(env.DB_NAME!==`loan_manager_${environment}`||!isSharedInstanceConnection(env.INSTANCE_CONNECTION_NAME)||env.DB_USER!==dbUser||env.RUNTIME_SERVICE_ACCOUNT!==dbUser+'.gserviceaccount.com'||env.WORKER_AUDIENCE!==audience||env.SCHEDULER_SERVICE_ACCOUNT!==scheduler)fail();
 if(['DATABASE_URL','PGHOST','PGHOSTADDR','PGDATABASE','PGPORT','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_AUTH_TENANT_ID','WEB_PUSH_PRIVATE_KEY'].some(k=>env[k]!==undefined))fail();
 let registeredCreators;try{registeredCreators=JSON.parse(env.SQL_REGISTERED_CREATORS_JSON);}catch{fail();}
 if(!Array.isArray(registeredCreators)||!registeredCreators.length||registeredCreators.some(v=>typeof v!=='string'||!v||v.length>63)||new Set(registeredCreators).size!==registeredCreators.length)fail();
 const caller=service=>`mw-credit-app-${service}-${environment}@${project}.iam.gserviceaccount.com`;
 if(env.NOTIFICATION_AGENT_CALLER_EMAIL!==undefined)fail();
 // R090 batch 2: every notification-event producer wakes dispatch after its commit: the command service (business
 // commands, agent receipts and agent conversation commands), the chat service (reply events) and the jobs worker
 // (the daily charges can post a first-day net-off payment). Each still needs its pinned subject below.
 const allowedCallers=role==='notify'?[scheduler,caller('command'),caller('chat'),caller('jobs')]:[scheduler];
 // The jobs worker wakes dispatch after a daily-charges run (same three keys as the command service); notify never wakes itself.
 let dispatch=null;
 if(role==='jobs'){try{dispatch=loadDispatchConfig(env,environment);}catch{fail();}}
 else if(['NOTIFICATION_DISPATCH_ENABLED','NOTIFICATION_DISPATCH_URL','NOTIFICATION_DISPATCH_AUDIENCE'].some(k=>env[k]!==undefined))fail();
 // Callers are pinned by email and by service-account unique id (OIDC sub), like the agent policies.
 // The scheduler is required; a caller without a pinned subject is not accepted (fail closed).
 let subjects;try{subjects=JSON.parse(env.WORKER_CALLER_SUBJECTS_JSON);}catch{fail();}
 if(!subjects||typeof subjects!=='object'||Array.isArray(subjects)||!Object.hasOwn(subjects,scheduler)||Object.entries(subjects).some(([email,sub])=>!allowedCallers.includes(email)||typeof sub!=='string'||!/^\d{1,30}$/.test(sub)))fail();
 const callers=allowedCallers.filter(email=>Object.hasOwn(subjects,email));
 let policy=null,vapid=null;
 if(role==='notify'){
  policy=parseNotificationPolicy(env.NOTIFICATION_POLICY_JSON,environment);
  let pair;try{pair=JSON.parse(env.WEB_PUSH_VAPID_JSON);const curve=createECDH('prime256v1');curve.setPrivateKey(Buffer.from(pair.privateKey,'base64url'));if(curve.getPublicKey().toString('base64url')!==pair.publicKey)fail();}catch{fail();}
  if(!/^[A-Za-z0-9_-]{87}$/.test(pair.publicKey??'')||!/^[A-Za-z0-9_-]{43}$/.test(pair.privateKey??'')||!/^mailto:[^\s@]+@[^\s@]+$/.test(env.WEB_PUSH_SUBJECT??''))fail();
  vapid={publicKey:pair.publicKey,privateKey:pair.privateKey,subject:env.WEB_PUSH_SUBJECT};
 }else if(['NOTIFICATION_POLICY_JSON','WEB_PUSH_VAPID_JSON','WEB_PUSH_PUBLIC_KEY','WEB_PUSH_SUBJECT'].some(k=>env[k]!==undefined))fail();
 return Object.freeze({environment,role,projectId:project,database:env.DB_NAME,instance:env.INSTANCE_CONNECTION_NAME,dbUser,audience,scheduler,callers:Object.freeze(callers),dispatch,callerSubjects:Object.freeze({...subjects}),registeredCreators,policy,vapid,capability:role==='notify'?`mw_notify_dispatch_${environment}`:`mw_jobs_${environment}`});
}
