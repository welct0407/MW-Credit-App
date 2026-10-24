import test from 'node:test';import assert from 'node:assert/strict';
import {loadBusinessConfig,loadProductionBusinessConfig} from '../../services/production/business-config.mjs';
import {createConnectionGuard} from '../../services/lib/connection-guard.mjs';
import {createEnvironmentCommandHandler} from '../../services/payment-command/handler.mjs';
import {DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {businessEnv,syntheticPolicy} from './business-env-fixture.mjs';
// ALL-ARCH-01: DEV reader and command services run the business runtime with a DEV profile.
test('DEV profile resolves DEV database, IAM user, roles, site and capability policy',()=>{
 const c=loadBusinessConfig(businessEnv('dev','command'));
 assert.deepEqual({environment:c.environment,database:c.database,dbUser:c.dbUser,applicationRole:c.applicationRole,journalOwnerRole:c.journalOwnerRole,hostingSite:c.hostingSite,canonicalOrigin:c.canonicalOrigin},
  {environment:'dev',database:'loan_manager_dev',dbUser:'mw-credit-app-command-dev@clever-oasis-508610-n7.iam',applicationRole:'mw_app_dev',journalOwnerRole:'mw_app_dev_journal_owner',hostingSite:'mw-credit-app-dev-737787224638',canonicalOrigin:'https://dev-lm.mw-credit.com'});
 assert.equal(loadBusinessConfig(businessEnv('dev','reader')).dbUser,'mw-credit-app-read-dev@clever-oasis-508610-n7.iam');
 assert.equal(loadProductionBusinessConfig,loadBusinessConfig);
 assert.equal(loadBusinessConfig(businessEnv('prod','reader')).environment,'prod');
});
test('DEV and PROD profiles never cross: database, users, roles, site, policy and variable prefixes',()=>{
 const dev=businessEnv('dev','command'),prod=businessEnv('prod','command');
 for(const patch of [{DB_NAME:'loan_manager_prod'},{APP_ENV:'prod'},{DB_USER:prod.DB_USER,RUNTIME_SERVICE_ACCOUNT:prod.RUNTIME_SERVICE_ACCOUNT},{HOSTING_SITE_ID:prod.HOSTING_SITE_ID},{ALLOWED_WEB_ORIGINS:prod.ALLOWED_WEB_ORIGINS},
  {DEV_SQL_APPLICATION_ROLE:'mw_app_prod'},{DEV_CAPABILITY_POLICY_JSON:JSON.stringify(syntheticPolicy('prod'))},{DEV_CAPABILITY_POLICY_SECRET_VERSION:prod.PROD_CAPABILITY_POLICY_SECRET_VERSION},{PROD_RECEIPTS:'disabled'},{PROD_SQL_APPLICATION_ROLE:'mw_app_prod'},
  {COMMAND_MODE:'dev-owner-testing'},{COMMAND_FIXTURE_JSON:'{}'},{OWNER_FIREBASE_UID:'synthetic-owner'},{ALLOWED_WEB_ORIGIN:'https://dev-lm.mw-credit.com'}])
  assert.throws(()=>loadBusinessConfig({...dev,...patch}),/Invalid (DEV|production) business candidate configuration|Invalid production capability policy/,JSON.stringify(patch));
 for(const patch of [{DB_NAME:'loan_manager_dev'},{APP_ENV:'dev'},{DEV_RECEIPTS:'disabled'},{DEV_CAPABILITY_POLICY_JSON:prod.PROD_CAPABILITY_POLICY_JSON},{PROD_CAPABILITY_POLICY_JSON:JSON.stringify(syntheticPolicy('dev'))},{RECEIPT_NATIVE_CATALOG_JSON:'{}'}])
  assert.throws(()=>loadBusinessConfig({...prod,...patch}),undefined,JSON.stringify(patch));
});
test('DEV receipts keep the verified DEV mapping and are command-only',()=>{
 const receipts={DEV_RECEIPTS:'enabled',RECEIPT_BUCKET:DEV_RECEIPT_MAPPING.bucket,RECEIPT_SQL_PREFIX:DEV_RECEIPT_MAPPING.sqlPrefix,RECEIPT_OBJECT_PREFIX:DEV_RECEIPT_MAPPING.objectPrefix,RECEIPT_COMPATIBILITY_EVIDENCE:'synthetic-evidence'};
 const c=loadBusinessConfig({...businessEnv('dev','command'),...receipts});
 assert.equal(c.receiptCompatibility.sqlPrefix,'manual-receipts/dev/pwa/');assert.ok(Array.isArray(c.nativeReceiptDescriptors));
 assert.equal(loadBusinessConfig(businessEnv('dev','command')).nativeReceiptDescriptors,null);
 assert.throws(()=>loadBusinessConfig({...businessEnv('dev','reader'),...receipts}));
 assert.throws(()=>loadBusinessConfig({...businessEnv('dev','command'),...receipts,RECEIPT_SQL_PREFIX:'manual-receipts/prod/pwa/'}));
 assert.throws(()=>loadBusinessConfig({...businessEnv('dev','command'),RECEIPT_BUCKET:DEV_RECEIPT_MAPPING.bucket}));
});
const identityRow=(config,patch={})=>({database:config.database,principal:config.dbUser,session:config.dbUser,rolcanlogin:true,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,member:config.serviceRole==='command',owner_member:false,creator_member:false,foreign_member:false,...patch});
const client=row=>({calls:[],async query(sql,args){this.calls.push({sql,args});return{rows:[row]};}});
test('connection guard binds each environment and refuses the other environment\'s roles',async()=>{
 for(const environment of ['dev','prod'])for(const role of ['reader','command']){
  const config=loadBusinessConfig(businessEnv(environment,role)),guard=createConnectionGuard(config),ok=client(identityRow(config));
  await guard(ok);assert.deepEqual(ok.calls[0].args.at(-1),environment==='dev'?['mw_app_prod','mw_app_prod_journal_owner']:['mw_app_dev','mw_app_dev_journal_owner']);
  for(const patch of [{foreign_member:true},{foreign_member:null},{database:environment==='dev'?'loan_manager_prod':'loan_manager_dev'},{owner_member:true},{creator_member:true},{member:role!=='command'},{rolsuper:true}])
   await assert.rejects(guard(client(identityRow(config,patch))),/Database identity unavailable/,JSON.stringify(patch));
 }
 assert.throws(()=>createConnectionGuard({...loadBusinessConfig(businessEnv('dev','reader')),environment:'staging'}));
});
test('environment command handler accepts only its own canonical and fallback origins',()=>{
 const dev=loadBusinessConfig(businessEnv('dev','command')),options={verifyPrincipal:async()=>({ok:false}),store:{}};
 assert.equal(typeof createEnvironmentCommandHandler({config:dev,...options}),'function');
 assert.throws(()=>createEnvironmentCommandHandler({config:{...dev,origins:['https://lm.mw-credit.com']},...options}));
 assert.throws(()=>createEnvironmentCommandHandler({config:{...dev,origins:[]},...options}));
});
test('R091: the retired agent conversation API variables are refused on every role and environment',()=>{
 for(const environment of ['dev','prod'])for(const role of ['reader','command']){
  const env=businessEnv(environment,role);assert.ok(loadBusinessConfig(env));
  for(const patch of [{AGENT_CONVERSATION_API_ENABLED:'false'},{AGENT_CONVERSATION_API_ENABLED:'true'},{AGENT_CONVERSATION_POLICY_SECRET_VERSION:'projects/x/secrets/y/versions/1'},{AGENT_CONVERSATION_POLICY_JSON:'{}'}])
   assert.throws(()=>loadBusinessConfig({...env,...patch}),/Invalid (DEV|production) business candidate configuration/,environment+' '+role+' '+JSON.stringify(patch));
 }
});
