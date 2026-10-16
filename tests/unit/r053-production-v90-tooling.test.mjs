import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {prepareR053Maintenance,restoreR053Maintenance,r053Environment} from '../../scripts/database/r053-operator-tooling.mjs';

const config={database:'loan_manager_prod',creators:['postgres'],executionMode:'cloudsql-prod',productionAuthorization:{approvalReference:'synthetic-reviewed-release',backupSha256:'a'.repeat(64),sourceCommit:'b'.repeat(40),baselineVersion:89,targetVersion:90}};
function fixture({version=89,failed=0}={}){
 const statements=[],role='mw_app_prod_journal_owner';let elevated=false,create=false;
 return {statements,async query(sql,args){statements.push(sql);
  if(sql.startsWith('SELECT current_database()'))return {rows:[{database:config.database,operator:'postgres',host:'136.85.127.134',port:5432,rolsuper:false,rolcreaterole:true,rolbypassrls:false,schemaGrantor:'schema_owner',schema_set:true,schema_create:true}]};
  if(sql.startsWith('SELECT rolname,'))return {rows:r053Environment(config.database).roles.map(rolname=>({rolname,rolcanlogin:false,rolinherit:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false}))};
  if(sql.includes('flyway_schema_history'))return {rows:[{version,failed}]};
  if(sql.startsWith('SELECT rolcanlogin'))return {rows:[{rolcanlogin:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false}]};
  if(sql.includes('FROM pg_auth_members'))return {rows:[{role,member:'postgres',grantor:'cloudsqladmin',admin_option:false,inherit_option:elevated,set_option:elevated}]};
  if(sql.includes('aclexplode'))return {rows:create?[{grantor:'schema_owner',grantee:role,grantable:false}]:[]};
  if(sql.startsWith('GRANT "'+role+'"'))elevated=sql.includes('INHERIT TRUE, SET TRUE');
  if(sql.startsWith('GRANT CREATE'))create=true;
  if(sql.startsWith('REVOKE CREATE'))create=false;
  return {rows:[]};
 }};
}
test('V90 prepares only journal authority and restores the exact closed tuple after migration',async()=>{
 const c=fixture(),plan=await prepareR053Maintenance(c,config,{conversationOnly:true});
 assert.equal(plan.restoreState.version,3);assert.equal(plan.restoreState.baseline.length,1);
 assert.equal(plan.restoreState.baseline[0].role,'mw_app_prod_journal_owner');
 assert(!c.statements.includes('BEGIN'));assert(!plan.statements.some(x=>/mw_notify|mw_jobs|ADMIN TRUE/.test(x)));
 const applied=await prepareR053Maintenance(c,config,{conversationOnly:true,apply:true,expectedRestoreState:plan.restoreState});
 const restored=await restoreR053Maintenance(c,config,applied.restoreState,{apply:true});
 assert.equal(restored.mode,'authority-restored');assert(restored.statements.some(x=>x.endsWith('RESTRICT')));
 assert.equal((await restoreR053Maintenance(c,config,applied.restoreState,{apply:true})).mode,'authority-already-restored');
 const bad=structuredClone(applied.restoreState);bad.baseline[0].membership.admin_option=true;
 await assert.rejects(restoreR053Maintenance(c,config,bad,{apply:true}),/Invalid R053/);
});
test('V90 refuses changed or failed history and broad maintenance before writes',async()=>{
 for(const options of [{version:87},{version:90},{failed:1}]){const c=fixture(options);await assert.rejects(prepareR053Maintenance(c,config,{conversationOnly:true,apply:true}),/Exact successful journal maintenance baseline required/);assert(!c.statements.includes('BEGIN'));}
 for(const options of [{},{includeAgentReceipts:true},{conversationOnly:true,includeAgentReceipts:true}]){const c=fixture();await assert.rejects(prepareR053Maintenance(c,config,{...options,apply:true}),/journal-only|exclusive/);assert(!c.statements.includes('BEGIN'));}
 const c=fixture();await assert.rejects(prepareR053Maintenance(c,{...config,productionAuthorization:{...config.productionAuthorization,targetVersion:91}},{conversationOnly:true}),/guarded PROD/);assert.equal(c.statements.length,0);
});
test('PROD CLI rejects unknown baseline and unrelated actions before credentials',()=>{
 for(const args of [['prepare-conversation'],['prepare-conversation','--baseline-version','88'],['roles','--baseline-version','89'],['restore','--baseline-version','89']]){
  const r=spawnSync(process.execPath,['scripts/database/r053-production-operator-cli.mjs',...args],{encoding:'utf8'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/baseline|restoration file|journal maintenance/);assert.doesNotMatch(r.stderr,/ENOENT|authentication failed/);
 }
});
