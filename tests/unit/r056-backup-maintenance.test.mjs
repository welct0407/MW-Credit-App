import test from 'node:test';import assert from 'node:assert/strict';
import {prepareR053Maintenance,restoreR053Maintenance,provisionR053Roles,r053Environment} from '../../scripts/database/r053-operator-tooling.mjs';
const config={database:'loan_manager_prod',creators:['postgres'],executionMode:'cloudsql-prod',productionAuthorization:{purpose:'r056-backup-preparation',approvalReference:'synthetic approval',sourceCommit:'b'.repeat(40),baselineVersion:90,targetVersion:91}};
function fixture({version=90,failed=0}={}){
 const statements=[],owners=['mw_notify_owner_prod','mw_jobs_owner_prod'],elevated=new Set(),create=new Set();
 return {statements,async query(sql){statements.push(sql);
  if(sql.startsWith('SELECT current_database()'))return{rows:[{database:'loan_manager_prod',operator:'postgres',host:'136.85.127.134',port:5432,rolsuper:false,rolcreaterole:true,rolbypassrls:false,schemaGrantor:'schema_owner',schema_set:true,schema_create:true}]};
  if(sql.startsWith('SELECT rolname,'))return{rows:r053Environment(config.database).roles.map(rolname=>({rolname,rolcanlogin:false,rolinherit:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false}))};
  if(sql.includes('flyway_schema_history'))return{rows:[{version,failed}]};
  if(sql.includes('FROM pg_auth_members'))return{rows:owners.map(role=>({role,member:'postgres',grantor:'cloudsqladmin',admin_option:false,inherit_option:elevated.has(role),set_option:elevated.has(role)}))};
  if(sql.includes('aclexplode'))return{rows:[...create].map(grantee=>({grantor:'schema_owner',grantee,grantable:false}))};
  for(const role of owners){if(sql.startsWith(`GRANT "${role}"`)){if(sql.includes('INHERIT TRUE, SET TRUE'))elevated.add(role);else elevated.delete(role);}if(sql.startsWith('GRANT CREATE')&&sql.includes(`"${role}"`))create.add(role);if(sql.startsWith('REVOKE CREATE')&&sql.includes(`"${role}"`))create.delete(role);}
  return{rows:[]};
 }};
}
test('R056 backup temporarily uses only existing two owners and restores exact authority even after child failure',async()=>{
 const c=fixture(),plan=await prepareR053Maintenance(c,config);
 assert.deepEqual(plan.restoreState.baseline.map(x=>x.role),['mw_notify_owner_prod','mw_jobs_owner_prod']);
 assert(!plan.statements.some(x=>/GRANT SELECT|CREATE ROLE|ADMIN TRUE|journal/.test(x)));
 await assert.rejects((async()=>{try{await prepareR053Maintenance(c,config,{apply:true,expectedRestoreState:plan.restoreState});throw Error('synthetic backup failure');}finally{assert.equal((await restoreR053Maintenance(c,config,plan.restoreState,{apply:true})).mode,'authority-restored');}})(),/synthetic backup failure/);
 assert.equal((await restoreR053Maintenance(c,config,plan.restoreState,{apply:true})).mode,'authority-already-restored');
});
test('R056 backup context cannot create roles or bypass version, approval, source or owner scope',async()=>{
 const c=fixture();await assert.rejects(provisionR053Roles(c,config),/guarded PROD/);assert.equal(c.statements.length,0);
 for(const patch of [{approvalReference:''},{sourceCommit:'bad'},{targetVersion:92},{baselineVersion:89},{purpose:'generic-migration'},{backupSha256:'a'.repeat(64)}])await assert.rejects(prepareR053Maintenance(fixture(),{...config,productionAuthorization:{...config.productionAuthorization,...patch}}),/guarded PROD/);
 for(const state of [{version:89},{version:91},{failed:1}])await assert.rejects(prepareR053Maintenance(fixture(state),config),/V90 maintenance baseline/);
 for(const mode of [{includeAgentReceipts:true},{conversationOnly:true}])await assert.rejects(prepareR053Maintenance(fixture(),config,mode),/notification\/jobs maintenance/);
});
test('R056 ordinary migration maintenance still requires real backup digest',async()=>{
 const auth={...config.productionAuthorization};delete auth.purpose;
 await assert.rejects(prepareR053Maintenance(fixture(),{...config,productionAuthorization:auth}),/guarded PROD/);
 const c=fixture();const plan=await prepareR053Maintenance(c,{...config,productionAuthorization:{...auth,backupSha256:'a'.repeat(64)}});
 assert.equal(plan.restoreState.version,1);
});
