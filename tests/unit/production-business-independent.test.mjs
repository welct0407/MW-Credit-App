import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {generateKeyPairSync,sign} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {createProductionBusinessRuntime} from '../../services/production/business-runtime.mjs';
import {createBusinessPrincipalVerifier} from '../../services/production/business-principal.mjs';

const project='clever-oasis-508610-n7';
const member={partnerId:'independent-member',loginEmail:'member@example.invalid',partnerRole:'B',capabilities:['read']};
const policy={schemaVersion:1,environment:'prod',evidenceSha256:'b'.repeat(64),members:[member]};
const env={BUSINESS_ACTIVATION:'approved-candidate',APP_ENV:'prod',BUSINESS_MODE:'business-candidate',FOUNDATION_ROLE:'reader',APPLICATION_PROJECT_ID:project,APPLICATION_PROJECT_NUMBER:'737787224638',FIREBASE_PROJECT_ID:project,AUTH_MODE:'firebase',DB_NAME:'loan_manager_prod',DATA_PROJECT_ID:project,INSTANCE_CONNECTION_NAME:project+':asia-southeast1:appsheet-pg-prod-20260914',DB_USER:`mw-credit-app-read-prod@${project}.iam`,RUNTIME_SERVICE_ACCOUNT:`mw-credit-app-read-prod@${project}.iam.gserviceaccount.com`,HOSTING_SITE_ID:'mw-credit-prod-737787224638',ALLOWED_WEB_ORIGINS:'["https://lm.mw-credit.com"]',PROD_CAPABILITY_POLICY_JSON:JSON.stringify(policy),PROD_CAPABILITY_POLICY_SHA256:policy.evidenceSha256,PROD_CAPABILITY_POLICY_SECRET_VERSION:`projects/${project}/secrets/mw-credit-app-prod-capability-policy/versions/1`,PROD_SQL_APPLICATION_ROLE:'mw_app_prod',PROD_SQL_JOURNAL_OWNER_ROLE:'mw_app_prod_journal_owner',PROD_SQL_REGISTERED_CREATORS:'["synthetic_creator"]'};
const now=Math.floor(Date.now()/1000);
const claims={aud:project,iss:`https://securetoken.google.com/${project}`,sub:'synthetic-signed-member',email:member.loginEmail,email_verified:true,iat:now-10,exp:now+600,auth_time:now-20,firebase:{sign_in_provider:'google.com'}};
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
function token(value=claims,key=keys.privateKey){const data=[{alg:'RS256',kid:'independent-key',typ:'JWT'},value].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return data+'.'+sign('RSA-SHA256',Buffer.from(data),key).toString('base64url');}
async function sdkFixture(){
 const app=initializeApp({projectId:project,credential:{getAccessToken:async()=>{throw Error('External credential transport forbidden in synthetic fixture');}}},'independent-sdk-'+crypto.randomUUID()),auth=getAuth(app);
 let user={localId:claims.sub,email:claims.email,emailVerified:true,disabled:false,validSince:String(now-100)},keyReads=0,userReads=0;
 // Substitute only the two external transports. SDK JWT/content/signature and
 // UserRecord/revocation/disabled algorithms remain real, with no emulator/ADC.
 auth.idTokenVerifier.signatureVerifier.keyFetcher.fetchPublicKeys=async()=>{keyReads++;return{'independent-key':keys.publicKey.export({type:'spki',format:'pem'})};};
 auth.authRequestHandler.getAccountInfoByUid=async uid=>{assert.equal(uid,claims.sub);userReads++;return{users:[user]};};
 return{auth,setUser:v=>{user={...user,...v};},counts:()=>({keyReads,userReads}),close:()=>deleteApp(app)};
}

test('real Admin SDK cryptography and revocation pipeline rejects signed invalid identities and altered signatures',async()=>{
 const s=await sdkFixture(),verify=createBusinessPrincipalVerifier((t,r)=>s.auth.verifyIdToken(t,r));
 try{
  assert.deepEqual(await verify('Bearer '+token()),{ok:true,subject:claims.sub,email:claims.email});
  assert.equal(s.counts().userReads,1);
  const otherKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
  for(const bad of [token(claims,otherKey),token({...claims,aud:'foreign-project'}),token({...claims,iss:'https://securetoken.google.com/foreign-project'}),token({...claims,exp:now-1}),token({...claims,firebase:{...claims.firebase,tenant:'foreign-tenant'}}),token({...claims,email_verified:false}),token({...claims,firebase:{sign_in_provider:'password'}})])assert.equal((await verify('Bearer '+bad)).ok,false);
  s.setUser({disabled:true});assert.equal((await verify('Bearer '+token())).ok,false);
  s.setUser({disabled:false,validSince:String(now)});assert.equal((await verify('Bearer '+token())).ok,false);
  assert.ok(s.counts().keyReads>0);assert.ok(s.counts().userReads>=3);
 }finally{await s.close();}
});

test('invalid active configuration stops before SDK, pool or storage construction',async()=>{
 let constructed=0;const dependencies=new Proxy({},{get(){constructed++;throw Error('Unexpected dependency construction');}});
 for(const delta of [{DB_NAME:'loan_manager_dev'},{DB_USER:'postgres'},{RUNTIME_SERVICE_ACCOUNT:'dev@example.invalid'},{FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'},{PROD_CAPABILITY_POLICY_JSON:JSON.stringify({...policy,members:[]})},{ALLOWED_WEB_ORIGINS:'["https://dev-lm.mw-credit.com"]'},{PROD_CAPABILITY_POLICY_SECRET_VERSION:`projects/${project}/secrets/mw-credit-app-prod-capability-policy/versions/latest`}])await assert.rejects(createProductionBusinessRuntime({...env,...delta},dependencies));
 assert.equal(constructed,0);
});

test('real SDK plus HTTP session rechecks current member, denies CORS/token errors before data and keeps logs private',async()=>{
 const s=await sdkFixture();let rows=[{id:member.partnerId,role:member.partnerRole}],queries=0,ended=0;const logs=[];
 const pool={async connect(){return{async query(sql){queries++;if(sql.includes('pg_roles')||sql.startsWith('SELECT current_database'))return{rows:[{database:env.DB_NAME,principal:env.DB_USER,session:env.DB_USER,rolcanlogin:true,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,member:false,dev_member:false,owner_member:false,creator_member:false}]};if(sql.includes('FROM public."Partners"'))return{rows};return{rows:[]};},release(){}};},async end(){ended++;}};
 const runtime=await createProductionBusinessRuntime(env,{initializeApp:()=>({}),applicationDefault:()=>({}),getAuth:()=>s.auth,createPool:async()=>pool,completionLogger:v=>logs.push(v)});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const auth={Authorization:'Bearer '+token(),Origin:'https://lm.mw-credit.com'};
  let r=await fetch(base+'/api/session',{headers:auth});assert.equal(r.status,200);assert.equal((await r.json()).source,'prod');
  for(const next of [[],[{id:'remapped',role:member.partnerRole}],[{id:member.partnerId,role:'A'}],[{id:member.partnerId,role:member.partnerRole},{id:'duplicate',role:member.partnerRole}]]){rows=next;r=await fetch(base+'/api/session',{headers:auth});assert.equal(r.status,403);}
  const before=queries;for(const headers of [{Origin:'https://dev-lm.mw-credit.com',Authorization:auth.Authorization},{Authorization:'Bearer malformed'},{Authorization:'bearer wrong'},{}])assert.ok([401,403].includes((await fetch(base+'/api/session',{headers})).status));assert.equal(queries,before);
  assert.doesNotMatch(JSON.stringify(logs),/member@example|synthetic-signed|Bearer|independent-member|RS256/);
 }finally{await new Promise(r=>server.close(r));await runtime.close();await s.close();}assert.equal(ended,1);
});


