import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createProductionFoundationRuntime} from '../../services/production/runtime.mjs';
import {createFirebasePrincipalVerifier} from '../../services/api/firebase-principal.mjs';

const base={APP_ENV:'prod',FOUNDATION_MODE:'foundation',FOUNDATION_ROLE:'reader',AUTH_MODE:'firebase',
 APPLICATION_PROJECT_ID:'clever-oasis-508610-n7',APPLICATION_PROJECT_NUMBER:'737787224638',FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',
 RUNTIME_SERVICE_ACCOUNT:'mw-credit-app-read-prod@clever-oasis-508610-n7.iam.gserviceaccount.com',
 DATA_PROJECT_ID:'clever-oasis-508610-n7',DB_NAME:'loan_manager_prod',INSTANCE_CONNECTION_NAME:'clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914',
 OWNER_IDENTITY_MODE:'uid-pinned',PROD_OWNER_FIREBASE_UID:'same-uid-across-projects',
 OWNER_IDENTITY_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-owner-identity/versions/2',
 HOSTING_SITE_ID:'synthetic-independent-prod',ALLOWED_WEB_ORIGINS:'["https://lm.mw-credit.com","https://synthetic-independent-prod.web.app"]'};
const claim=()=>{const now=Math.floor(Date.now()/1000);return{aud:base.FIREBASE_PROJECT_ID,iss:'https://securetoken.google.com/'+base.FIREBASE_PROJECT_ID,
 sub:base.PROD_OWNER_FIREBASE_UID,email:'welct0407@mw-credit.com',email_verified:true,iat:now-20,exp:now+1800,auth_time:now-30,firebase:{sign_in_provider:'google.com'}}};
function request(server,target,method='GET',headers={}){
 return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:target,method,headers},res=>{
 let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});
}
async function fixture(role){
 const logs=[],calls=[],initialized=[];let value=claim(),failure;
 const config={...base,FOUNDATION_ROLE:role,RUNTIME_SERVICE_ACCOUNT:`mw-credit-app-${role==='reader'?'read':'command'}-prod@${base.APPLICATION_PROJECT_ID}.iam.gserviceaccount.com`};
 const handler=createProductionFoundationRuntime(config,{applicationDefault:()=>({synthetic:true}),initializeApp:(options,name)=>{initialized.push({options,name});return options;},
 getAuth:app=>{assert.equal(app.projectId,base.APPLICATION_PROJECT_ID);return{verifyIdToken:async(token,revoked)=>{calls.push({token,revoked});if(failure)throw failure;return value;}};},completionLogger:record=>logs.push(record)});
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{server,logs,calls,initialized,set:(next,error)=>{value=next;failure=error;},close:()=>new Promise(resolve=>server.close(resolve))};
}
test('real HTTP runtime shares valid default owner with DEV while rejecting foreign issuer, tenant and revoked users',async()=>{
 for(const role of ['reader','command']){const f=await fixture(role);try{
  assert.equal(f.initialized[0].name,'production-foundation-'+role);
  const good=await request(f.server,'/api/session','GET',{Authorization:'Bearer SYNTHETIC_PRIVATE_TOKEN'});
  assert.equal(good.status,200);assert.deepEqual(JSON.parse(good.body),{ok:true,authenticated:true,mode:'foundation',capabilities:[],businessAccess:false,membershipVerified:false});
  const dev=createFirebasePrincipalVerifier(async(token,revoked)=>{assert.equal(token,'SYNTHETIC_PRIVATE_TOKEN');assert.equal(revoked,true);return claim();},{ownerUid:base.PROD_OWNER_FIREBASE_UID,identityMode:'uid-pinned'});
  assert.equal((await dev('Bearer SYNTHETIC_PRIVATE_TOKEN')).ok,true);
  const changes=[{aud:'foreign-synthetic-project',iss:'https://securetoken.google.com/foreign-synthetic-project'},
   {aud:base.FIREBASE_PROJECT_ID,iss:'https://securetoken.google.com/foreign-synthetic-project'},
   {firebase:{sign_in_provider:'google.com',tenant:null}},{firebase:{sign_in_provider:'google.com',tenant:'synthetic-prod-tenant'}},
   {sub:'unapproved-owner'},{email:'unapproved@example.invalid'},{email_verified:false},{firebase:{sign_in_provider:'custom'}},
   {exp:Math.floor(Date.now()/1000)-1},{auth_time:Math.floor(Date.now()/1000)+60}];
  for(const delta of changes){f.set({...claim(),...delta});const denied=await request(f.server,'/api/session','GET',{Authorization:'Bearer SYNTHETIC_PRIVATE_TOKEN'});assert.equal(denied.status,delta.sub||delta.email?403:401);}
  f.set(claim(),Error('SYNTHETIC_PRIVATE_REVOKED_TOKEN uid='+base.PROD_OWNER_FIREBASE_UID));
  assert.equal((await request(f.server,'/api/session','GET',{Authorization:'Bearer SYNTHETIC_PRIVATE_TOKEN'})).status,401);
  assert.ok(f.calls.every(call=>call.revoked===true));
  assert.doesNotMatch(JSON.stringify(f.logs),/SYNTHETIC_PRIVATE|same-uid|welct|unapproved|tenant|securetoken|synthetic-independent-prod/);
 }finally{await f.close();}}
});
test('raw target and method adversaries never invoke auth or gain readiness/business/storage capabilities',async()=>{
 const f=await fixture('command');try{
  const targets=['/ready','/readiness','/api/operations','/api/operations/private-ref','/api/receipts','/api/payment-uploads',
   '/api/session?bootstrap=1','/health?ready=true','/api/%73ession','/api/session/','//api/session','/api/../api/session','https://lm.mw-credit.com/api/session'];
  for(const target of targets)for(const method of ['GET','POST','HEAD','OPTIONS']){
   const r=await request(f.server,target,method,{Authorization:'Bearer SYNTHETIC_PRIVATE_TOKEN',Origin:'https://lm.mw-credit.com'});
   assert.equal(r.status,403,target+' '+method);assert.equal(r.headers['cache-control'],'no-store');
  }
  assert.equal(f.calls.length,0);
  assert.equal((await request(f.server,'/api/session','POST',{Authorization:'Bearer SYNTHETIC_PRIVATE_TOKEN'})).status,405);
  assert.equal((await request(f.server,'/api/session','GET',{Origin:'https://lm.mw-credit.com.attacker.invalid'})).status,403);
  assert.equal((await request(f.server,'/api/session','OPTIONS',{Origin:'https://lm.mw-credit.com','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization,X-Private'})).status,403);
  assert.equal(f.calls.length,0);
  const health=await request(f.server,'/health');assert.deepEqual(JSON.parse(health.body),{status:'ok',mode:'foundation'});
  const ids=f.logs.map(log=>log.requestId);assert.equal(new Set(ids).size,ids.length);
  assert.equal(f.logs.at(-1).requestId,health.headers['x-request-id']);
  for(const log of f.logs)assert.deepEqual(Object.keys(log).sort(),['code','event','operation','requestId','serviceRole','status']);
  assert.doesNotMatch(JSON.stringify(f.logs),/private-ref|bootstrap|ready=true|attacker|SYNTHETIC_PRIVATE/);
 }finally{await f.close();}
});
test('ambient data and readiness configuration fails before credential or Admin initialization',()=>{
 let effects=0;const forbidden=()=>{effects++;throw Error('SYNTHETIC_PRIVATE_CREDENTIAL');};
 for(const key of ['DATABASE_URL','PGHOST','PGUSER','PGPASSWORD','DB_USER','RECEIPT_BUCKET','READINESS_ENABLED','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_AUTH_TENANT_ID'])
  assert.throws(()=>createProductionFoundationRuntime({...base,[key]:''},{applicationDefault:forbidden,initializeApp:forbidden,getAuth:forbidden}),/^Error: Invalid production foundation configuration$/);
 assert.equal(effects,0);
});
test('disabled-probe production dependency graph has no data driver, storage client or business dispatcher',async()=>{
 for(const file of ['config','principal','handler','runtime','server']){
  const source=await readFile(new URL('../../services/production/'+file+'.mjs',import.meta.url),'utf8');
  const imports=[...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(match=>match[1]);
  assert.ok(imports.every(name=>name.startsWith('node:')||name.startsWith('firebase-admin/')||/^\.\/(config|principal|handler|runtime)\.mjs$/.test(name)),file+' '+imports);
  assert.doesNotMatch(source,/\bimport\s*\(|createPool|new Pool|Storage\(|SELECT\s|saveReceipt|sendNotification/);
 }
});
