import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {provisionR053Roles,prepareR053Maintenance,configureR053Capture,grantR053AgentReceiptApi} from '../../scripts/database/r053-operator-tooling.mjs';
const trap={query(){throw Error('Unexpected SQL access');}};
test('R053 operator refuses PROD before querying and requires explicit capture boolean',async()=>{
 for(const fn of [provisionR053Roles,prepareR053Maintenance,grantR053AgentReceiptApi])await assert.rejects(fn(trap,{database:'loan_manager_prod',creators:['postgres'],executionMode:'cloudsql-dev'}),/DEV operator/);
 await assert.rejects(configureR053Capture(trap,{database:'loan_manager_dev'},{}),/capture boolean/);
});
test('R053 CLI rejects target overrides and ambient routes before credentials',()=>{
 for(const args of [['roles','--environment','production'],['roles','--apply','--apply'],['restore']]){const r=spawnSync(process.execPath,['scripts/database/r053-operator-cli.mjs',...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.doesNotMatch(r.stderr,/ENOENT|password|authentication failed/);}
 const r=spawnSync(process.execPath,['scripts/database/r053-operator-cli.mjs','roles'],{encoding:'utf8',env:{...process.env,PGHOSTADDR:'127.0.0.9'}});assert.notEqual(r.status,0);assert.match(r.stderr,/Ambient SQL route refused/);
});

function agentFixture({publicAcl=false,appExecute=false,owner='mw_app_dev_journal_owner'}={}){
 const statements=[];let granted=false;
 return{statements,async query(sql,args){statements.push(sql);
  if(sql.startsWith('SELECT current_database()'))return{rows:[{database:'loan_manager_dev',operator:'test_operator',host:'127.0.0.1',port:5432,rolsuper:false,rolcreaterole:true,rolbypassrls:false,schemaGrantor:'schema_owner',schema_set:true,schema_create:true}]};
  if(sql.includes('flyway_schema_history'))return{rowCount:1,rows:[]};
  if(sql.startsWith('SELECT rolcanlogin'))return{rows:[{rolcanlogin:true,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false}]};
  if(sql.startsWith('SELECT p.oid::text'))return{rows:[{oid:args[0].includes('submit')?'100':'101',owner,definer:true,acl:'fixture',command_execute:granted,app_execute:appExecute}]};
  if(sql.includes('aclexplode'))return{rows:[{grantee:publicAcl?'PUBLIC':owner,grantor:owner,privilege:'EXECUTE',grantable:false},...(granted?[{grantee:'mw-credit-app-command-dev@clever-oasis-508610-n7.iam',grantor:owner,privilege:'EXECUTE',grantable:false}]:[])]};
  if(sql.startsWith('GRANT EXECUTE'))granted=true;
  return{rows:[],rowCount:0};
 }};
}
const loopback={database:'loan_manager_dev',creators:['test_operator'],executionMode:'owned-loopback'};
test('V89 grants only fixed command login and refuses PUBLIC/app/wrong ownership before mutation',async()=>{
 for(const options of [{publicAcl:true},{appExecute:true},{owner:'postgres'}]){const c=agentFixture(options);await assert.rejects(grantR053AgentReceiptApi(c,loopback,{apply:true}),/machine/);assert(!c.statements.includes('BEGIN'));}
 const c=agentFixture();const plan=await grantR053AgentReceiptApi(c,loopback);assert.equal(plan.statements.filter(x=>x.startsWith('GRANT')).length,2);assert(!c.statements.includes('BEGIN'));
 const result=await grantR053AgentReceiptApi(c,loopback,{apply:true});assert(result.after.every(x=>x.command_execute));assert.equal(result.user,'mw-credit-app-command-dev@clever-oasis-508610-n7.iam');assert(!result.statements.some(x=>/TO mw_app_dev|PUBLIC|CREATE ROLE/.test(x)));
});
