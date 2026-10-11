import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadProductionFoundationConfig } from '../../services/production/config.mjs';
import { createProductionPrincipalVerifier } from '../../services/production/principal.mjs';
import { createProductionFoundationHandler } from '../../services/production/handler.mjs';
import { createProductionFoundationRuntime } from '../../services/production/runtime.mjs';
import { createFirebasePrincipalVerifier } from '../../services/api/firebase-principal.mjs';
const env = { APP_ENV:'prod', FOUNDATION_MODE:'foundation', FOUNDATION_ROLE:'reader', AUTH_MODE:'firebase',
  APPLICATION_PROJECT_ID:'clever-oasis-508610-n7', APPLICATION_PROJECT_NUMBER:'737787224638', FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',
  RUNTIME_SERVICE_ACCOUNT:'mw-credit-app-read-prod@clever-oasis-508610-n7.iam.gserviceaccount.com',
  DATA_PROJECT_ID:'clever-oasis-508610-n7', DB_NAME:'loan_manager_prod', INSTANCE_CONNECTION_NAME:'clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914',
  OWNER_IDENTITY_MODE:'uid-pinned', PROD_OWNER_FIREBASE_UID:'synthetic-owner',
  OWNER_IDENTITY_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-owner-identity/versions/1',
  HOSTING_SITE_ID:'synthetic-prod-site', ALLOWED_WEB_ORIGINS:'["https://lm.mw-credit.com"]' };
const config = loadProductionFoundationConfig(env), now = 2000000000;
const claims = { aud:config.projectId, iss:config.issuer, sub:config.ownerUid, email:'welct0407@mw-credit.com', email_verified:true,
  exp:now+3600, iat:now-10, auth_time:now-100, firebase:{sign_in_provider:'google.com'} };
test('same default-project owner token can authenticate both environments; business authority stays separate', async () => {
  const sdk=async()=>claims;
  const prod=createProductionPrincipalVerifier(sdk,config,()=>now*1000);
  const dev=createFirebasePrincipalVerifier(sdk,{ownerUid:config.ownerUid,identityMode:'uid-pinned',now:()=>now*1000});
  assert.equal((await prod('Bearer shared-token')).ok,true);
  assert.equal((await dev('Bearer shared-token')).ok,true);
});
test('production configuration requires shared default project and rejects wrong targets, mutable pins and ambient data clients', () => {
  for (const key of Object.keys(env)) assert.throws(() => loadProductionFoundationConfig({...env,[key]:undefined}), key);
  for (const [key,value] of Object.entries({ APP_ENV:'dev', FOUNDATION_MODE:'business', FOUNDATION_ROLE:'admin', AUTH_MODE:'none',
    APPLICATION_PROJECT_ID:'other-project', APPLICATION_PROJECT_NUMBER:'123456789012', FIREBASE_PROJECT_ID:'other-project',
    RUNTIME_SERVICE_ACCOUNT:'mw-credit-app-read-dev@clever-oasis-508610-n7.iam.gserviceaccount.com', DB_NAME:'loan_manager_dev', DATA_PROJECT_ID:'other',
    INSTANCE_CONNECTION_NAME:'other:region:instance', OWNER_IDENTITY_MODE:'email-bootstrap', PROD_OWNER_FIREBASE_UID:' bad ',
    OWNER_IDENTITY_SECRET_VERSION:'projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-owner-identity/versions/latest',
    HOSTING_SITE_ID:'mw-credit-app-dev-737787224638', ALLOWED_WEB_ORIGINS:'["https://dev-lm.mw-credit.com"]',
    FIREBASE_AUTH_EMULATOR_HOST:'', FIREBASE_AUTH_TENANT_ID:'', OWNER_FIREBASE_UID:'dev-owner', DATABASE_URL:'private',
    DB_USER:'any', RECEIPT_NATIVE_CATALOG_JSON:'{}', READINESS_ENABLED:'true', COMMAND_MODE:'dev-owner-testing' }))
    assert.throws(() => loadProductionFoundationConfig({...env,[key]:value}), key);
  for (const origins of [['*'],['http://localhost'],['https://lm.mw-credit.com/'],['https://lm.mw-credit.com','https://foreign.web.app'],['https://lm.mw-credit.com','https://lm.mw-credit.com']])
    assert.throws(() => loadProductionFoundationConfig({...env,ALLOWED_WEB_ORIGINS:JSON.stringify(origins)}));
  assert.throws(() => loadProductionFoundationConfig({...env,OWNER_IDENTITY_SECRET_VERSION:'projects/other-project/secrets/mw-credit-app-prod-owner-identity/versions/1'}));
  assert.equal(loadProductionFoundationConfig({...env,FOUNDATION_ROLE:'command',RUNTIME_SERVICE_ACCOUNT:'mw-credit-app-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com'}).serviceRole,'command');
  assert.equal(config.readinessEnabled,false);
});
test('production verifier pins issuer plus owner and always checks revocation without returning identity', async () => {
  let call;
  const verify = value => createProductionPrincipalVerifier(async (...args) => { call=args; return value; },config,()=>now*1000);
  assert.deepEqual(await verify(claims)('Bearer synthetic-token'),{ok:true});
  assert.deepEqual(call,['synthetic-token',true]);
  const variants = [{aud:'other-project'}, {iss:'https://securetoken.google.com/other-project'}, {sub:'other'}, {email:'other@example.invalid'},
    {email_verified:false},{exp:now},{iat:now+1},{auth_time:now+1},{sub:''},{firebase:{sign_in_provider:'password'}},{firebase:{sign_in_provider:'google.com',tenant:'tenant'}},
    {iat:NaN},{exp:Infinity},{auth_time:-1}];
  for (const change of variants) assert.equal((await verify({...claims,...change})('Bearer synthetic-token')).ok,false,JSON.stringify(change));
  for (const header of [undefined,'synthetic-token','Bearer a b','Bearer ','Bearer '+ 'x'.repeat(16384)]) assert.equal((await verify(claims)(header)).status,401);
  assert.deepEqual(await createProductionPrincipalVerifier(async()=>{throw Error('private token');},config)('Bearer token'),{ok:false,status:401,code:'session_invalid'});
});
test('runtime selects exact Admin project/default auth and rejects configuration before SDK initialization', () => {
  let options, name, app;
  const sdk={applicationDefault:()=>({fixture:true}),initializeApp:(o,n)=>{options=o;name=n;return app={};},getAuth:a=>{assert.equal(a,app);return{verifyIdToken:async()=>claims};}};
  assert.equal(typeof createProductionFoundationRuntime(env,sdk),'function');
  assert.equal(options.projectId,env.APPLICATION_PROJECT_ID);assert.equal(name,'production-foundation-reader');
  assert.throws(()=>createProductionFoundationRuntime({...env,FOUNDATION_MODE:'business'},{initializeApp:()=>assert.fail('SDK touched')}));
});
test('HTTP foundation has no data or readiness paths, restrictive CORS and sanitized sessions/logs', async () => {
  let verifies=0, effects=0; const logs=[];
  const forbidden=new Proxy({}, {get(){effects++;throw Error('data access');}});
  const server=http.createServer(createProductionFoundationHandler({config,verifyPrincipal:async header=>{verifies++;return header==='Bearer owner'?{ok:true}:{ok:false,status:401,code:'sign_in_required'};},completionLogger:r=>logs.push(r),store:forbidden,storage:forbidden}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request=(path,method='GET',headers={})=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers});
  try {
    assert.deepEqual(await (await request('/health')).json(),{status:'ok',mode:'foundation'});
    assert.equal((await request('/api/session')).status,401);
    const session=await request('/api/session','GET',{Authorization:'Bearer owner'});
    assert.deepEqual(await session.json(),{ok:true,authenticated:true,mode:'foundation',capabilities:[],businessAccess:false,membershipVerified:false});
    const before=verifies;
    for(const path of ['/ready','/readiness','/api/borrowers','/api/operations','/api/operations/private-id','/api/payment-records','/api/receipts/private','/api/upload','/health?q=private','/api/session?bootstrap=true','/api/%73ession'])
      for(const method of ['GET','POST','PUT','DELETE','OPTIONS']) assert.equal((await request(path,method,{Authorization:'Bearer owner'})).status,403,path+method);
    assert.equal(verifies,before);assert.equal(effects,0);
    assert.equal((await request('/health','POST')).status,405);
    assert.equal((await request('/api/session','GET',{Origin:'https://dev-lm.mw-credit.com'})).status,403);
    const preflight=await request('/api/session','OPTIONS',{Origin:'https://lm.mw-credit.com','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization'});
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://lm.mw-credit.com');
    assert.equal((await request('/api/session','OPTIONS',{Origin:'https://lm.mw-credit.com','Access-Control-Request-Method':'POST'})).status,403);
    assert.doesNotMatch(JSON.stringify(logs),/owner|private|welct|synthetic-prod|Bearer|token|loan_manager/);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
