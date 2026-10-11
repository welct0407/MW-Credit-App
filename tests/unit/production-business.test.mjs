import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {loadProductionBusinessConfig} from '../../services/production/business-config.mjs';
import {parseBusinessPolicy,createBusinessMembership} from '../../services/production/business-policy.mjs';
import {createBusinessPrincipalVerifier} from '../../services/production/business-principal.mjs';
import {createProductionConnectionGuard} from '../../services/production/business-target.mjs';
import {createProductionBusinessRuntime} from '../../services/production/business-runtime.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {PROD_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
const member={partnerId:'partner-1',loginEmail:'member@example.invalid',partnerRole:'B',capabilities:['read','command']};
const policy={schemaVersion:1,environment:'prod',evidenceSha256:'a'.repeat(64),members:[member]};
const env={BUSINESS_ACTIVATION:'approved-candidate',APP_ENV:'prod',BUSINESS_MODE:'business-candidate',FOUNDATION_ROLE:'reader',APPLICATION_PROJECT_ID:'clever-oasis-508610-n7',APPLICATION_PROJECT_NUMBER:'737787224638',FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',AUTH_MODE:'firebase',DB_NAME:'loan_manager_prod',DATA_PROJECT_ID:'clever-oasis-508610-n7',INSTANCE_CONNECTION_NAME:'clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914',DB_USER:'mw-credit-app-read-prod@clever-oasis-508610-n7.iam',RUNTIME_SERVICE_ACCOUNT:'mw-credit-app-read-prod@clever-oasis-508610-n7.iam.gserviceaccount.com',HOSTING_SITE_ID:'mw-credit-prod-737787224638',ALLOWED_WEB_ORIGINS:'["https://lm.mw-credit.com"]',PROD_CAPABILITY_POLICY_JSON:JSON.stringify(policy),PROD_CAPABILITY_POLICY_SHA256:policy.evidenceSha256,PROD_CAPABILITY_POLICY_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-capability-policy/versions/1',PROD_SQL_APPLICATION_ROLE:'mw_app_prod',PROD_SQL_JOURNAL_OWNER_ROLE:'mw_app_prod_journal_owner',PROD_SQL_REGISTERED_CREATORS:'["synthetic_source_owner"]'};
const principal={ok:true,subject:'verified-shared-user',email:member.loginEmail};
function poolFixture(config){let rows=[{id:member.partnerId,role:member.partnerRole}],identity={database:config.database,principal:config.dbUser,session:config.dbUser,rolcanlogin:true,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,member:config.serviceRole==='command',owner_member:false,creator_member:false,dev_member:false};const calls=[];return{calls,setRows:v=>rows=v,identity,async connect(){return{async query(sql,args){calls.push({sql,args});if(sql.includes('pg_roles'))return{rows:[identity]};if(sql.startsWith('SELECT current_database'))return{rows:[identity]};if(sql.includes('FROM public."Partners"'))return{rows};if(sql.includes('pwa_submit_operation_v2'))return{rows:[{result:{kind:'recorded',originalOutcome:{status:'applied',result:{id:'synthetic'}}}}]};if(sql.includes('canonical_json'))return{rows:[]};return{rows:[]};},release(discard){calls.push({release:discard});}};},async end(){calls.push({end:true});}};}
test('business candidate rejects missing policy, wrong targets, DEV identities and ambient data credentials',()=>{
 assert.equal(loadProductionBusinessConfig({}),null);assert.equal(loadProductionBusinessConfig({BUSINESS_ACTIVATION:'disabled'}),null);
 for(const key of Object.keys(env).filter(k=>k!=='BUSINESS_ACTIVATION'))assert.throws(()=>loadProductionBusinessConfig({...env,[key]:undefined}),key);
 for(const change of [{HOSTING_SITE_ID:'other-production-site'},{DB_NAME:'loan_manager_dev'},{DB_USER:'postgres'},{DATABASE_URL:'private'},{FIREBASE_AUTH_TENANT_ID:'tenant'},{BUSINESS_ACTIVATION:'yes'},{PROD_SQL_APPLICATION_ROLE:'mw_app_dev'}])assert.throws(()=>loadProductionBusinessConfig({...env,...change}));
});
test('qualified DEV render and PROD binding enables only explicit bound production receipt candidate',()=>{
 const compatibility={...PROD_RECEIPT_MAPPING,status:'verified-dev-render-and-prod-binding',evidenceReference:'b'.repeat(64)};
 const receiptEnv={...env,FOUNDATION_ROLE:'command',DB_USER:env.DB_USER.replace('-read-','-command-'),RUNTIME_SERVICE_ACCOUNT:env.RUNTIME_SERVICE_ACCOUNT.replace('-read-','-command-'),PROD_RECEIPTS:'enabled',PROD_RECEIPT_CATALOG_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-native-receipt-catalog/versions/1',PROD_RECEIPT_SOURCE_EVIDENCE_SHA256:'c'.repeat(64),PROD_RECEIPT_NATIVE_CATALOG_JSON:JSON.stringify({schemaVersion:1,environment:'prod',database:'loan_manager_prod',bucket:PROD_RECEIPT_MAPPING.bucket,objectRoot:PROD_RECEIPT_MAPPING.objectPrefix.slice(0,-4),sourceEvidenceSha256:'c'.repeat(64),entries:[]}),PROD_RECEIPT_COMPATIBILITY_JSON:JSON.stringify(compatibility)};
 assert.equal(loadProductionBusinessConfig(receiptEnv).receiptCompatibility.status,compatibility.status);
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

