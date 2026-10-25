import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {provisionR053Roles,prepareR053Maintenance,restoreR053Maintenance,configureR053Capture,grantR053AgentReceiptApi,r053Environment,provisionClosedOwnerRole,prepareOwnerAuthority,restoreOwnerAuthority} from '../../scripts/database/r053-operator-tooling.mjs';
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

function settingsOperatorFixture({version=91,failed=0}={}){
 const binding=r053Environment('loan_manager_prod'),statements=[],members=[...binding.owners,binding.journalOwner].map(role=>({role,member:'postgres',grantor:'cloudsqladmin',admin_option:false,inherit_option:false,set_option:false}));let acl=[];
 return{statements,members,get acl(){return acl},async query(sql,_args){statements.push(sql);
  if(sql.startsWith('SELECT current_database()'))return{rows:[{database:'loan_manager_prod',operator:'postgres',host:'136.85.127.134',port:5432,rolsuper:false,rolcreaterole:true,rolbypassrls:false,schemaGrantor:'schema_owner',schema_set:true,schema_create:true}]};
  if(sql.includes('flyway_schema_history'))return{rows:[{version,failed}]};
  if(sql.startsWith('SELECT rolname'))return{rows:binding.roles.map(rolname=>({rolname,rolcanlogin:false,rolinherit:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false}))};
  if(sql.startsWith('SELECT rolcanlogin'))return{rows:[{rolcanlogin:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false}]};
  if(sql.startsWith('SELECT r.rolname role'))return{rows:structuredClone(members)};
  if(sql.includes('aclexplode'))return{rows:structuredClone(acl)};
  const member=/^GRANT "([^"]+)" TO "postgres" WITH INHERIT (TRUE|FALSE), SET (TRUE|FALSE)$/.exec(sql);if(member){const row=members.find(row=>row.role===member[1]);row.inherit_option=member[2]==='TRUE';row.set_option=member[3]==='TRUE'}
  const create=/^GRANT CREATE ON SCHEMA public TO "([^"]+)"$/.exec(sql);if(create)acl.push({grantor:'schema_owner',grantee:create[1],grantable:false});
  const remove=/^REVOKE CREATE ON SCHEMA public FROM "([^"]+)" RESTRICT$/.exec(sql);if(remove)acl=acl.filter(row=>row.grantee!==remove[1]);
  return{rows:[],rowCount:0};
 }};
}
const settingsOperatorConfig=(backup=false)=>({database:'loan_manager_prod',creators:['postgres'],executionMode:'cloudsql-prod',productionAuthorization:{approvalReference:'synthetic owner approval',sourceCommit:'a'.repeat(40),baselineVersion:91,targetVersion:92,...(backup?{purpose:'r062-backup-preparation'}:{backupSha256:'b'.repeat(64)})}});

test('R062 backed maintenance elevates only journal owner and restores exact pre-state',async()=>{
 const c=settingsOperatorFixture(),config=settingsOperatorConfig(),plan=await prepareR053Maintenance(c,config,{conversationOnly:true});assert.equal(plan.restoreState.version,3);assert.deepEqual(plan.restoreState.baseline.map(row=>row.role),['mw_app_prod_journal_owner']);assert.equal(c.statements.includes('BEGIN'),false);
 await prepareR053Maintenance(c,config,{conversationOnly:true,apply:true,expectedRestoreState:plan.restoreState});assert.deepEqual(c.members.filter(row=>row.inherit_option).map(row=>row.role),['mw_app_prod_journal_owner']);assert.equal((await restoreR053Maintenance(c,config,plan.restoreState,{apply:true})).mode,'authority-restored');assert(c.members.every(row=>!row.admin_option&&!row.inherit_option&&!row.set_option));assert.deepEqual(c.acl,[]);assert.equal((await restoreR053Maintenance(c,config,plan.restoreState,{apply:true})).mode,'authority-already-restored');
});

test('R062 backup preparation permits only three closed owners and its matching restoration',async()=>{
 const c=settingsOperatorFixture(),config=settingsOperatorConfig(true),plan=await prepareR053Maintenance(c,config,{includeAgentReceipts:true});assert.equal(plan.restoreState.version,2);assert.deepEqual(plan.restoreState.baseline.map(row=>row.role),['mw_notify_owner_prod','mw_jobs_owner_prod','mw_app_prod_journal_owner']);await prepareR053Maintenance(c,config,{includeAgentReceipts:true,apply:true});await assert.rejects(restoreR053Maintenance(c,settingsOperatorConfig(),plan.restoreState,{apply:true}),/matching scoped/);assert.equal((await restoreR053Maintenance(c,config,plan.restoreState,{apply:true})).mode,'authority-restored');assert.deepEqual(c.acl,[]);
});

test('R062 invalid scope, history and restoration cannot mutate authority',async()=>{
 for(const config of[settingsOperatorConfig(),settingsOperatorConfig(true)]){const c=settingsOperatorFixture();await assert.rejects(prepareR053Maintenance(c,config,{apply:true}),/scoped backup owners|journal-only/);assert(!c.statements.includes('BEGIN'))}
 for(const options of[{version:90},{version:92},{failed:1}]){const c=settingsOperatorFixture(options);await assert.rejects(prepareR053Maintenance(c,settingsOperatorConfig(),{conversationOnly:true,apply:true}),/successful V91/);assert(!c.statements.includes('BEGIN'))}
 for(const mutate of[a=>delete a.approvalReference,a=>a.targetVersion=93,a=>a.backupSha256='invalid',a=>a.purpose='r056-backup-preparation']){const config=settingsOperatorConfig();mutate(config.productionAuthorization);await assert.rejects(prepareR053Maintenance(trap,config,{conversationOnly:true,apply:true}),/guarded PROD/)}
 await assert.rejects(provisionR053Roles(trap,settingsOperatorConfig(),{apply:true}),/guarded PROD/);await assert.rejects(grantR053AgentReceiptApi(trap,settingsOperatorConfig(),{apply:true}),/guarded PROD/);
 const c=settingsOperatorFixture(),plan=await prepareR053Maintenance(c,settingsOperatorConfig(),{conversationOnly:true});const bad=structuredClone(plan.restoreState);bad.baseline[0].membership.admin_option=true;await assert.rejects(restoreR053Maintenance(c,settingsOperatorConfig(),bad,{apply:true}),/restoration snapshot/);assert(!c.statements.includes('BEGIN'));
});

test('R062 production CLI limits baseline91 to prepare-conversation and restore before private access',()=>{
 for(const action of['roles','prepare','prepare-agent','agent-api-grants','capture-enable','capture-disable','jobs-dependencies','bind-api','bind-notify','bind-jobs']){const r=spawnSync(process.execPath,['scripts/database/r053-production-operator-cli.mjs',action,'--baseline-version','91'],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/PROD91 permits only/);assert.doesNotMatch(r.stderr,/ENOENT|authentication failed/)}
 const r=spawnSync(process.execPath,['scripts/database/r053-production-operator-cli.mjs','prepare-conversation','--baseline-version','91'],{encoding:'utf8'});assert.match(r.stderr,/Explicit production approval/);assert.doesNotMatch(r.stderr,/Exact reviewed PROD baseline/);
});
test('V89 grants only fixed command login and refuses PUBLIC/app/wrong ownership before mutation',async()=>{
 for(const options of [{publicAcl:true},{appExecute:true},{owner:'postgres'}]){const c=agentFixture(options);await assert.rejects(grantR053AgentReceiptApi(c,loopback,{apply:true}),/machine/);assert(!c.statements.includes('BEGIN'));}
 const c=agentFixture();const plan=await grantR053AgentReceiptApi(c,loopback);assert.equal(plan.statements.filter(x=>x.startsWith('GRANT')).length,2);assert(!c.statements.includes('BEGIN'));
 const result=await grantR053AgentReceiptApi(c,loopback,{apply:true});assert(result.after.every(x=>x.command_execute));assert.equal(result.user,'mw-credit-app-command-dev@clever-oasis-508610-n7.iam');assert(!result.statements.some(x=>/TO mw_app_dev|PUBLIC|CREATE ROLE/.test(x)));
});


test('PROD mapping is closed and live CLI refuses missing approval/backup before credentials',()=>{
 const x=r053Environment('loan_manager_prod');
 assert.deepEqual(x.roles,['mw_notify_owner_prod','mw_notify_api_prod','mw_notify_dispatch_prod','mw_jobs_owner_prod','mw_jobs_prod']);
 assert.equal(x.journalOwner,'mw_app_prod_journal_owner');assert.equal(x.commandUser,'mw-credit-app-command-prod@clever-oasis-508610-n7.iam');
 assert.throws(()=>r053Environment('postgres'));
 const r=spawnSync(process.execPath,['scripts/database/r053-production-operator-cli.mjs','roles'],{encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/Explicit production approval/);assert.doesNotMatch(r.stderr,/ENOENT|authentication failed/);
});

// Generic owner authority (A-design §9.3): tunnel route, closed provisioning, explicit owner list, exact restoration.
function ownerFixture({host='136.85.127.134',operator='postgres',grantor='cloudsqladmin',database='loan_manager_dev',owners=['mw_ledger_owner_dev'],exists=true}={}){
 const statements=[];const members=exists?owners.map(role=>({role,member:operator,grantor,admin_option:false,inherit_option:false,set_option:false})):[];let acl=[];
 return{statements,members,get acl(){return acl},async query(sql,args){statements.push(sql);
  if(sql.startsWith('SELECT current_database()'))return{rows:[{database,operator,host,port:5432,rolsuper:false,rolcreaterole:true,rolbypassrls:false,schemaGrantor:'pg_database_owner',schema_set:true,schema_create:true}]};
  if(sql.startsWith('SELECT rolname'))return{rows:members.length||!exists&&statements.some(x=>x.startsWith('CREATE ROLE'))?args[0].map(rolname=>({rolname,rolcanlogin:false,rolinherit:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false})):[]};
  if(sql.startsWith('SELECT r.rolname role'))return{rows:structuredClone(members)};
  if(sql.includes('aclexplode'))return{rows:structuredClone(acl)};
  if(sql.startsWith('CREATE ROLE'))return{rows:[]};
  const closed=/^GRANT "([^"]+)" TO "postgres" WITH INHERIT FALSE, SET FALSE$/.exec(sql);if(closed&&!members.some(row=>row.role===closed[1]))members.push({role:closed[1],member:'postgres',grantor:'cloudsqladmin',admin_option:false,inherit_option:false,set_option:false});
  const member=/^GRANT "([^"]+)" TO "postgres" WITH INHERIT (TRUE|FALSE), SET (TRUE|FALSE)$/.exec(sql);if(member){const row=members.find(row=>row.role===member[1]);if(row){row.inherit_option=member[2]==='TRUE';row.set_option=member[3]==='TRUE';}}
  const create=/^GRANT CREATE ON SCHEMA public TO "([^"]+)"$/.exec(sql);if(create)acl.push({grantor:'pg_database_owner',grantee:create[1],grantable:false});
  const remove=/^REVOKE CREATE ON SCHEMA public FROM "([^"]+)" RESTRICT$/.exec(sql);if(remove)acl=acl.filter(row=>row.grantee!==remove[1]);
  return{rows:[],rowCount:0};
 }};
}
const tunnel={database:'loan_manager_dev',creators:['postgres'],executionMode:'cloudsql-dev-tunnel'};
test('owner authority accepts the DEV tunnel route only with the Cloud SQL server identity and provisions a closed role',async()=>{
 const c=ownerFixture({exists:false});const plan=await provisionClosedOwnerRole(c,tunnel,{role:'mw_ledger_owner_dev'});assert.equal(plan.mode,'role-plan');assert.equal(plan.context.mode,'implicit-cloudsql');assert.equal(plan.context.grantor,'cloudsqladmin');assert(!c.statements.includes('BEGIN'));
 const done=await provisionClosedOwnerRole(c,tunnel,{role:'mw_ledger_owner_dev',apply:true});assert.equal(done.mode,'role-provisioned');assert.deepEqual(c.statements.filter(x=>/^(CREATE ROLE|GRANT)/.test(x)),['CREATE ROLE "mw_ledger_owner_dev" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS','GRANT "mw_ledger_owner_dev" TO "postgres" WITH INHERIT FALSE, SET FALSE']);
 await assert.rejects(provisionClosedOwnerRole(ownerFixture({host:'127.0.0.1'}),tunnel,{role:'mw_ledger_owner_dev'}),/Unreviewed DEV operator route/);
 await assert.rejects(provisionClosedOwnerRole(ownerFixture(),{...tunnel,executionMode:'cloudsql-prod-tunnel'},{role:'mw_ledger_owner_dev'}),/Unreviewed DEV operator route/);
 for(const role of ['mw_ledger_owner_prod','mw_app_prod_journal_owner','postgres','x; DROP ROLE y'])await assert.rejects(provisionClosedOwnerRole(trap,tunnel,{role}),/another environment|owner role list/);
 await assert.rejects(provisionClosedOwnerRole(ownerFixture(),tunnel,{role:'mw_ledger_owner_dev'}),/already exists/);
});
test('owner authority elevates exactly the listed owners and restores the exact closed state once',async()=>{
 const owners=['mw_ledger_owner_dev','mw_notify_owner_dev','mw_jobs_owner_dev','mw_app_dev_journal_owner'],c=ownerFixture({owners});
 const plan=await prepareOwnerAuthority(c,tunnel,{owners});assert.equal(plan.restoreState.version,4);assert.deepEqual(plan.restoreState.owners,owners);assert.equal(plan.statements.filter(x=>x.startsWith('GRANT CREATE')).length,4);assert(!c.statements.includes('BEGIN'));
 await assert.rejects(prepareOwnerAuthority(c,tunnel,{owners,apply:true,expectedRestoreState:{...plan.restoreState,version:3}}),/baseline changed/);
 await prepareOwnerAuthority(c,tunnel,{owners,apply:true,expectedRestoreState:plan.restoreState});assert(c.members.every(row=>row.inherit_option&&row.set_option));assert.deepEqual(c.acl.map(row=>row.grantee),owners);
 await assert.rejects(restoreOwnerAuthority(c,tunnel,{...plan.restoreState,owners:owners.slice(0,1)},{apply:true}),/restoration snapshot/);
 await assert.rejects(restoreOwnerAuthority(c,tunnel,{...plan.restoreState,version:3},{apply:true}),/context mismatch/);
 assert.equal((await restoreOwnerAuthority(c,tunnel,plan.restoreState,{apply:true})).mode,'authority-restored');assert(c.members.every(row=>!row.inherit_option&&!row.set_option));assert.deepEqual(c.acl,[]);
 assert.equal((await restoreOwnerAuthority(c,tunnel,plan.restoreState,{apply:true})).mode,'authority-already-restored');
 await assert.rejects(prepareOwnerAuthority(trap,tunnel,{owners:[]}),/owner role list/);
 await assert.rejects(prepareOwnerAuthority(trap,{...tunnel,database:'loan_manager_prod',executionMode:'cloudsql-prod-tunnel'},{owners:['mw_ledger_owner_prod']}),/guarded PROD/);
 await assert.rejects(prepareOwnerAuthority(trap,{...tunnel,database:'loan_manager_prod',executionMode:'cloudsql-prod-tunnel',productionAuthorization:{approvalReference:'x',sourceCommit:'a'.repeat(40)}},{owners:['mw_ledger_owner_prod']}),/guarded PROD/);
});
test('owner authority CLI refuses PROD without approval/backup, unknown options and ambient routes before credentials',()=>{
 const run=(args,env={})=>spawnSync(process.execPath,['scripts/database/owner-authority-cli.mjs',...args],{encoding:'utf8',env:{...process.env,...env}});
 for(const [args,pattern] of [[['prepare','--environment','production'],/Explicit production approval/],[['role','--environment','production','--approval-reference','x'],/Explicit production approval/],[['prepare','--approval-reference','x'],/require --environment production/],[['restore'],/prepared restoration file/],[['role','--owner','a','--owner','b'],/One owner role/],[['prepare','--apply','--apply'],/Duplicate apply/],[['nothing'],/owner authority action/],[['prepare','--environment','staging'],/development or production/]]){const r=run(args);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);assert.doesNotMatch(r.stderr,/ENOENT|password|authentication failed/);}
 const r=run(['prepare'],{PGHOSTADDR:'127.0.0.9'});assert.notEqual(r.status,0);assert.match(r.stderr,/Ambient SQL route refused/);
});
