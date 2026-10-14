import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {loadProductionBusinessConfig} from '../../services/production/business-config.mjs';
import {parseBusinessPolicy,createBusinessMembership} from '../../services/production/business-policy.mjs';
import {createBusinessPrincipalVerifier} from '../../services/production/business-principal.mjs';
import {createProductionConnectionGuard} from '../../services/production/business-target.mjs';
import {createProductionBusinessRuntime} from '../../services/production/business-runtime.mjs';
import {deltaValueHash} from '../../services/api/offline-dataset-delta.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {PROD_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {loadDispatchConfig} from '../../services/notifications/postcommit.mjs';
import {loadAgentReceiptPolicy} from '../../services/agent-receipts/runtime.mjs';
const member={partnerId:'partner-1',loginEmail:'member@example.invalid',partnerRole:'B',capabilities:['read','command']};
const policy={schemaVersion:1,environment:'prod',evidenceSha256:'a'.repeat(64),members:[member]};
const env={BUSINESS_ACTIVATION:'approved-candidate',APP_ENV:'prod',BUSINESS_MODE:'business-candidate',FOUNDATION_ROLE:'reader',APPLICATION_PROJECT_ID:'clever-oasis-508610-n7',APPLICATION_PROJECT_NUMBER:'737787224638',FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',AUTH_MODE:'firebase',DB_NAME:'loan_manager_prod',DATA_PROJECT_ID:'clever-oasis-508610-n7',INSTANCE_CONNECTION_NAME:'clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914',DB_USER:'mw-credit-app-read-prod@clever-oasis-508610-n7.iam',RUNTIME_SERVICE_ACCOUNT:'mw-credit-app-read-prod@clever-oasis-508610-n7.iam.gserviceaccount.com',HOSTING_SITE_ID:'mw-credit-prod-737787224638',ALLOWED_WEB_ORIGINS:'["https://lm.mw-credit.com"]',PROD_CAPABILITY_POLICY_JSON:JSON.stringify(policy),PROD_CAPABILITY_POLICY_SHA256:policy.evidenceSha256,PROD_CAPABILITY_POLICY_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-capability-policy/versions/1',PROD_SQL_APPLICATION_ROLE:'mw_app_prod',PROD_SQL_JOURNAL_OWNER_ROLE:'mw_app_prod_journal_owner',PROD_SQL_REGISTERED_CREATORS:'["synthetic_source_owner"]'};
const principal={ok:true,subject:'verified-shared-user',email:member.loginEmail};
test('PROD notification and machine receipt activation remains explicit and environment bound',()=>{
 const commandEnv={...env,FOUNDATION_ROLE:'command',DB_USER:env.DB_USER.replace('-read-','-command-'),RUNTIME_SERVICE_ACCOUNT:env.RUNTIME_SERVICE_ACCOUNT.replace('-read-','-command-')};
 assert.equal(loadProductionBusinessConfig(commandEnv).notificationsEnabled,false);
 assert.equal(loadDispatchConfig(commandEnv,'prod'),null);
 assert.equal(loadAgentReceiptPolicy(commandEnv,'prod'),null);
 assert.equal(loadProductionBusinessConfig({...commandEnv,PWA_NOTIFICATIONS:'enabled',WEB_PUSH_PUBLIC_KEY:'a'.repeat(87)}).notificationsEnabled,true);
 for(const patch of [{WEB_PUSH_PUBLIC_KEY:undefined},{WEB_PUSH_VAPID_JSON:'private'},{WEB_PUSH_PRIVATE_KEY:'private'}])assert.throws(()=>loadProductionBusinessConfig({...commandEnv,PWA_NOTIFICATIONS:'enabled',WEB_PUSH_PUBLIC_KEY:'a'.repeat(87),...patch}));
 assert.throws(()=>loadProductionBusinessConfig({...env,PWA_NOTIFICATIONS:'enabled',WEB_PUSH_PUBLIC_KEY:'a'.repeat(87)}));
 const audience='https://mw-credit-app-notify-prod-737787224638.asia-southeast1.run.app';
 const dispatch={NOTIFICATION_DISPATCH_ENABLED:'true',NOTIFICATION_DISPATCH_AUDIENCE:audience,NOTIFICATION_DISPATCH_URL:audience+'/internal/dispatch'};
 assert.equal(loadDispatchConfig(dispatch,'prod').audience,audience);
 assert.throws(()=>loadDispatchConfig({...dispatch,NOTIFICATION_DISPATCH_AUDIENCE:audience.replace('-prod-','-dev-')},'prod'));
 const machine={environment:'prod',audience:'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app',callerEmail:'mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com',callerSubject:'123456789',automaticPartnerId:'synthetic-auto',reviewerPartnerIds:['synthetic-reviewer'],evidenceSha256:'b'.repeat(64)};
 const machineEnv={AGENT_RECEIPT_API_ENABLED:'true',AGENT_RECEIPT_POLICY_JSON:JSON.stringify(machine),AGENT_RECEIPT_POLICY_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-agent-receipt-policy/versions/1'};
 assert.equal(loadAgentReceiptPolicy(machineEnv,'prod').callerEmail,machine.callerEmail);
 for(const patch of [{AGENT_RECEIPT_POLICY_SECRET_VERSION:machineEnv.AGENT_RECEIPT_POLICY_SECRET_VERSION.replace('/1','/latest')},{AGENT_RECEIPT_POLICY_JSON:JSON.stringify({...machine,environment:'dev'})},{AGENT_RECEIPT_POLICY_JSON:JSON.stringify({...machine,audience:machine.audience.replace('-prod-','-dev-')})}])assert.throws(()=>loadAgentReceiptPolicy({...machineEnv,...patch},'prod'));
});
function poolFixture(config){let rows=[{id:member.partnerId,role:member.partnerRole}],identity={database:config.database,principal:config.dbUser,session:config.dbUser,rolcanlogin:true,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,member:config.serviceRole==='command',owner_member:false,creator_member:false,dev_member:false};const calls=[];return{calls,setRows:v=>rows=v,identity,async connect(){return{async query(sql,args){calls.push({sql,args});if(sql.includes('AS fingerprint'))return{rows:[]};if(sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP'))return{rows:[{asOf:'2026-10-15T00:00:00.000Z',businessDate:'2026-10-15'}]};if(sql.includes('pg_roles'))return{rows:[identity]};if(sql.startsWith('SELECT current_database'))return{rows:[identity]};if(sql.includes('FROM public."Partners"'))return{rows};if(sql.includes('pwa_submit_operation_v2'))return{rows:[{result:{kind:'recorded',originalOutcome:{status:'applied',result:{id:'synthetic'}}}}]};if(sql.includes('canonical_json'))return{rows:[]};return{rows:[]};},release(discard){calls.push({release:discard});}};},async end(){calls.push({end:true});}};}
test('business candidate rejects missing policy, wrong targets, DEV identities and ambient data credentials',()=>{
 assert.equal(loadProductionBusinessConfig({}),null);assert.equal(loadProductionBusinessConfig({BUSINESS_ACTIVATION:'disabled'}),null);
 for(const key of Object.keys(env).filter(k=>k!=='BUSINESS_ACTIVATION'))assert.throws(()=>loadProductionBusinessConfig({...env,[key]:undefined}),key);
 for(const change of [{HOSTING_SITE_ID:'other-production-site'},{DB_NAME:'loan_manager_dev'},{DB_USER:'postgres'},{DATABASE_URL:'private'},{FIREBASE_AUTH_TENANT_ID:'tenant'},{BUSINESS_ACTIVATION:'yes'},{PROD_SQL_APPLICATION_ROLE:'mw_app_dev'}])assert.throws(()=>loadProductionBusinessConfig({...env,...change}));
});
test('qualified DEV render and PROD binding enables only explicit bound production receipt candidate',()=>{
 const compatibility={...PROD_RECEIPT_MAPPING,status:'verified-dev-render-and-prod-binding',evidenceReference:'b'.repeat(64)};
 const receiptEnv={...env,FOUNDATION_ROLE:'command',DB_USER:env.DB_USER.replace('-read-','-command-'),RUNTIME_SERVICE_ACCOUNT:env.RUNTIME_SERVICE_ACCOUNT.replace('-read-','-command-'),PROD_RECEIPTS:'enabled',PROD_RECEIPT_CATALOG_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-native-receipt-catalog/versions/1',PROD_RECEIPT_SOURCE_EVIDENCE_SHA256:'c'.repeat(64),PROD_RECEIPT_NATIVE_CATALOG_JSON:JSON.stringify({schemaVersion:1,environment:'prod',database:'loan_manager_prod',bucket:PROD_RECEIPT_MAPPING.bucket,objectRoot:PROD_RECEIPT_MAPPING.objectPrefix.slice(0,-4),sourceEvidenceSha256:'c'.repeat(64),entries:[]}),PROD_RECEIPT_COMPATIBILITY_JSON:JSON.stringify(compatibility)};
 assert.equal(loadProductionBusinessConfig(receiptEnv).receiptCompatibility.status,compatibility.status);
 assert.equal(loadProductionBusinessConfig({...receiptEnv,PROD_RECEIPT_COMPATIBILITY_JSON:JSON.stringify({...compatibility,status:'verified-native-render'})}).receiptCompatibility.status,'verified-native-render');
 assert.equal(loadProductionBusinessConfig({...receiptEnv,PROD_RECEIPTS:undefined}).receiptCompatibility,null);
 for(const change of [{bucket:'wrong'},{sqlPrefix:'manual-receipts/dev/pwa/'},{objectPrefix:'wrong'},{evidenceReference:'unhashed'},{status:'synthetic-transport-test'}])assert.throws(()=>loadProductionBusinessConfig({...receiptEnv,PROD_RECEIPT_COMPATIBILITY_JSON:JSON.stringify({...compatibility,...change})}));
 assert.equal(loadProductionBusinessConfig({...receiptEnv,PROD_RECEIPT_COMPATIBILITY_JSON:JSON.stringify({...compatibility,status:'verified-appsheet-render'})}).receiptCompatibility.status,'verified-appsheet-render');
});
test('policy never infers accounting role authority and invalid duplicate/conflicting members deny',async()=>{
 for(const p of [{...policy,members:[]},{...policy,members:[member,member]},{...policy,members:[{...member,capabilities:['admin']}]},{...policy,environment:'dev'}])assert.throws(()=>parseBusinessPolicy(JSON.stringify(p)));
 const c=loadProductionBusinessConfig(env),m=createBusinessMembership(c),pool=poolFixture(c),client=await pool.connect();
 assert.equal((await m.resolveActor(client,principal,'command')).partnerId,member.partnerId);
 for(const rows of [[],[{id:'new-partner',role:'B'}],[{id:member.partnerId,role:'A'}],[{id:member.partnerId,role:'B'},{id:'duplicate',role:'B'}]]){pool.setRows(rows);assert.equal(await m.resolveActor(client,principal,'command'),null);}
 assert.equal(m.principalAllowed({...principal,email:'delivery@example.invalid'}),false);
});
test('exact SQL role/session/database guard denies elevated or wrong identities and reader app membership',async()=>{
 const c=loadProductionBusinessConfig(env),pool=poolFixture(c),guard=createProductionConnectionGuard(c),client=await pool.connect();await guard(client);
 for(const [key,value]of Object.entries({database:'loan_manager_dev',principal:'postgres',session:'other',rolcanlogin:false,rolsuper:true,rolcreatedb:true,rolcreaterole:true,rolreplication:true,rolbypassrls:true,member:true,owner_member:true,creator_member:true,dev_member:true})){const prior=pool.identity[key];pool.identity[key]=value;await assert.rejects(guard(client));pool.identity[key]=prior;}
});
test('command pipeline derives actor freshly and dispatches canonical immutable operation only after membership',async()=>{
 const c=loadProductionBusinessConfig({...env,FOUNDATION_ROLE:'command',DB_USER:env.DB_USER.replace('-read-','-command-'),RUNTIME_SERVICE_ACCOUNT:env.RUNTIME_SERVICE_ACCOUNT.replace('-read-','-command-')}),m=createBusinessMembership(c),pool=poolFixture(c);
 const store=createEnvironmentCommandStore({pool,guardConnection:createProductionConnectionGuard(c),principalAllowed:m.principalAllowed,resolveActor:m.resolveActor,actorIssuer:c.issuer});
 const command={requestId:'12345678-1234-4234-8234-123456789abc',operation:'borrower.create',targetId:'12345678-1234-4234-8234-123456789abd',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{name:'Synthetic',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:null}};
 assert.equal((await store.operation(principal,command)).ok,true);const submitted=pool.calls.find(c=>c.sql?.includes('pwa_submit_operation_v2'));assert.deepEqual(JSON.parse(submitted.args[0]).actor,{issuer:c.issuer,subject:principal.subject,partnerId:member.partnerId,loginEmail:member.loginEmail});
 pool.setRows([]);const count=pool.calls.filter(c=>c.sql?.includes('pwa_submit_operation_v2')).length;assert.equal((await store.operation(principal,command)).status,403);assert.equal(pool.calls.filter(c=>c.sql?.includes('pwa_submit_operation_v2')).length,count);
});
test('nonowner verified shared identities authenticate, tenant/revoked/wrong issuer deny',async()=>{
 const now=Math.floor(Date.now()/1000),claims={aud:env.FIREBASE_PROJECT_ID,iss:'https://securetoken.google.com/'+env.FIREBASE_PROJECT_ID,sub:principal.subject,email:principal.email,email_verified:true,exp:now+3600,iat:now,auth_time:now,firebase:{sign_in_provider:'google.com'}};let revoked;
 assert.deepEqual(await createBusinessPrincipalVerifier(async(t,r)=>{revoked=r;return claims;})('Bearer token'),principal);assert.equal(revoked,true);
 for(const c of [{...claims,iss:'wrong'},{...claims,firebase:{...claims.firebase,tenant:'other'}}])assert.equal((await createBusinessPrincipalVerifier(async()=>c)('Bearer token')).ok,false);
 assert.equal((await createBusinessPrincipalVerifier(async()=>{throw Error('revoked');})('Bearer token')).ok,false);
});
test('disabled candidate creates no pool; active reader HTTP uses fresh authorized mapping and prod envelope',async()=>{
 let created=0;const now=Math.floor(Date.now()/1000),claims={aud:env.FIREBASE_PROJECT_ID,iss:'https://securetoken.google.com/'+env.FIREBASE_PROJECT_ID,sub:principal.subject,email:principal.email,email_verified:true,exp:now+3600,iat:now,auth_time:now,firebase:{sign_in_provider:'google.com'}};
 const config=loadProductionBusinessConfig(env),pool=poolFixture(config),sdk={initializeApp:()=>({}),applicationDefault:()=>({}),getAuth:()=>({verifyIdToken:async()=>claims}),createPool:async()=>{created++;return pool;}};
 const disabled={...env,BUSINESS_ACTIVATION:'disabled',DB_USER:undefined,FOUNDATION_MODE:'foundation',OWNER_IDENTITY_MODE:'uid-pinned',PROD_OWNER_FIREBASE_UID:'foundation-owner',OWNER_IDENTITY_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-owner-identity/versions/1'};
 const inert=await createProductionBusinessRuntime(disabled,sdk);assert.equal(inert.enabled,false);assert.equal(created,0);
 const runtime=await createProductionBusinessRuntime(env,sdk);assert.equal(created,1);const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${server.address().port}/api/session`;let response=await fetch(url,{headers:{Authorization:'Bearer token'}});assert.equal(response.status,200);assert.equal((await response.json()).source,'prod');pool.setRows([{id:member.partnerId,role:'changed'}]);response=await fetch(url,{headers:{Authorization:'Bearer token'}});assert.equal(response.status,403);}
 finally{await new Promise(r=>server.close(r));await runtime.close();}
});

test('PROD command composition serves enabled notifications and isolated machine routes',async()=>{
 const commandEnv={...env,FOUNDATION_ROLE:'command',DB_USER:env.DB_USER.replace('-read-','-command-'),RUNTIME_SERVICE_ACCOUNT:env.RUNTIME_SERVICE_ACCOUNT.replace('-read-','-command-'),PWA_NOTIFICATIONS:'enabled',WEB_PUSH_PUBLIC_KEY:'a'.repeat(87),AGENT_RECEIPT_API_ENABLED:'true',AGENT_RECEIPT_POLICY_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-agent-receipt-policy/versions/1',AGENT_RECEIPT_POLICY_JSON:JSON.stringify({environment:'prod',audience:'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app',callerEmail:'mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com',callerSubject:'123456789',automaticPartnerId:'synthetic-auto',reviewerPartnerIds:[],evidenceSha256:'b'.repeat(64)})};
 const now=Math.floor(Date.now()/1000),claims={aud:env.FIREBASE_PROJECT_ID,iss:'https://securetoken.google.com/'+env.FIREBASE_PROJECT_ID,sub:principal.subject,email:principal.email,email_verified:true,exp:now+3600,iat:now,auth_time:now,firebase:{sign_in_provider:'google.com'}};
 let humanCalls=0;const pool=poolFixture(loadProductionBusinessConfig(commandEnv));
 const runtime=await createProductionBusinessRuntime(commandEnv,{initializeApp:()=>({}),applicationDefault:()=>({}),getAuth:()=>({verifyIdToken:async()=>{humanCalls++;return claims;}}),createPool:async()=>pool,verifyOidc:async()=>{throw Error('invalid workload');}});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  const response=await fetch(origin+'/api/notifications',{headers:{Authorization:'Bearer human',Origin:'https://lm.mw-credit.com'}});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{items:[],nextCursor:null});
  assert.ok(pool.calls.some(c=>c.sql?.includes('pwa_notify_history_v1')));
  const before=humanCalls;const denied=await fetch(origin+'/internal/agent/receipt-payments',{method:'POST',headers:{Authorization:'Bearer machine'}});
  assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{error:'unauthorized'});assert.equal(humanCalls,before);
 }finally{await new Promise(r=>server.close(r));await runtime.close();}
});



test('PROD factory permits authorized offline traversal and delta while retaining membership and target guards',async()=>{
 const config=loadProductionBusinessConfig({...env,FOUNDATION_ROLE:'command',DB_USER:env.DB_USER.replace('-read-','-command-'),RUNTIME_SERVICE_ACCOUNT:env.RUNTIME_SERVICE_ACCOUNT.replace('-read-','-command-')}),membership=createBusinessMembership(config),pool=poolFixture(config);
 const store=createEnvironmentCommandStore({pool,guardConnection:createProductionConnectionGuard(config),principalAllowed:membership.principalAllowed,resolveActor:membership.resolveActor,actorIssuer:config.issuer});
 const chunk=await store.offlineDataset(principal,'records',undefined,{protocol:2});
 assert.equal(chunk.status,200,JSON.stringify(chunk));assert.equal(chunk.schemaVersion,2);assert.equal(chunk.domain,'records');assert.ok(chunk.patches.length);assert.equal(typeof chunk.nextCursor,'string');
 for(const domain of ['records','collection','cash','management']){
  const sourceVersion=deltaValueHash(['business-offline-v3',config.issuer,principal.subject,member.partnerId,domain,'2026-10-15',[]]);
  const delta=await store.offlineDataset(principal,domain,undefined,{protocol:3,input:{cursor:null,need:[],sourceVersion}});
  assert.equal(delta.status,200,domain+JSON.stringify(delta));assert.equal(delta.schemaVersion,3);assert.equal(delta.unchanged,true);assert.equal(delta.sourceVersion,sourceVersion);
  assert.deepEqual(delta.values,{});assert.deepEqual(delta.patches,[]);
 }
 assert.ok(pool.calls.some(call=>call.sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert.ok(pool.calls.some(call=>call.sql==='COMMIT'));
 const before=pool.calls.length;assert.equal((await store.offlineDataset({...principal,email:'outsider@example.invalid'},'records',undefined,{protocol:2})).status,403);assert.equal(pool.calls.length,before);
 pool.setRows([]);assert.equal((await store.offlineDataset(principal,'records',undefined,{protocol:2})).status,403);pool.setRows([{id:member.partnerId,role:member.partnerRole}]);
 pool.identity.database='loan_manager_dev';assert.equal((await store.offlineDataset(principal,'records',undefined,{protocol:2})).ok,false);
});
