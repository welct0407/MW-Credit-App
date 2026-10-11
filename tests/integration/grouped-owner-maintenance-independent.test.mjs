import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {realpath,readFile} from 'node:fs/promises';import {basename,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareGroupedOwnerMaintenance,restoreGroupedOwnerMaintenance} from '../../scripts/database/grouped-owner-maintenance.mjs';
const owners=['mw_app_dev_journal_owner','mw_app_prod_journal_owner'];
async function fixture(){const e=process.env;if(e.PHASE8_TEST_DISPOSABLE!=='1'||e.PHASE8_TEST_HOST!=='127.0.0.1')throw Error('Owned loopback required');const d=await realpath(e.PHASE8_TEST_DATA_DIRECTORY);assert.equal(basename(d),'data');assert.match(basename(dirname(d)),/^mw-phase8-[a-f0-9]{32}$/);assert.equal(Number((await readFile(d+'/postmaster.pid','utf8')).split(/\r?\n/)[3]),Number(e.PHASE8_TEST_PORT));return {host:'127.0.0.1',port:Number(e.PHASE8_TEST_PORT)};}
test('actual nonsuperuser dual-owner prepare, finally restore and concurrent tuple fencing',async()=>{
 const connection=await fixture(),bootstrap=new pg.Client({...connection,user:'postgres',database:'postgres'});let operator,admin;
 await bootstrap.connect();
 try{
  await bootstrap.query('CREATE ROLE c_group_operator LOGIN CREATEROLE; CREATE ROLE c_schema_owner NOLOGIN; GRANT c_schema_owner TO c_group_operator WITH ADMIN FALSE, INHERIT TRUE, SET TRUE');
  await bootstrap.query('CREATE DATABASE loan_manager_prod');
  admin=new pg.Client({...connection,user:'postgres',database:'loan_manager_prod'});await admin.connect();
  await admin.query('ALTER SCHEMA public OWNER TO c_schema_owner; GRANT USAGE,CREATE ON SCHEMA public TO c_group_operator');
  operator=new pg.Client({...connection,user:'c_group_operator',database:'loan_manager_prod'});await operator.connect();
  for(const owner of owners)await operator.query('CREATE ROLE '+owner+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
  await operator.query('CREATE ROLE c_unrelated NOLOGIN; CREATE ROLE c_restore_sentinel NOLOGIN; GRANT USAGE ON SCHEMA public TO c_unrelated');
  const config={database:'loan_manager_prod',creators:['c_group_operator'],grantors:owners.map(ownerRole=>({ownerRole,membershipGrantor:'c_group_operator',schemaGrantor:'c_schema_owner',membershipMode:'explicit'}))};
  const snapshot=async()=>({memberships:(await admin.query('SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor')).rows,acl:(await admin.query("SELECT nspacl::text FROM pg_namespace WHERE nspname='public'")).rows});
  const baseline=await snapshot();
  const actualOwnerMemberships=(await admin.query("SELECT r.rolname role,m.rolname member,g.rolname grantor FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor WHERE r.rolname=ANY($1)",[owners])).rows;
  assert.ok(actualOwnerMemberships.every(m=>m.grantor==='postgres'),JSON.stringify(actualOwnerMemberships));
  const plan=await prepareGroupedOwnerMaintenance(operator,config);assert.deepEqual(await snapshot(),baseline);
  await assert.rejects(prepareGroupedOwnerMaintenance(operator,{...config,database:'loan_manager_dev'},{apply:true}),/Explicit PROD/);
  await assert.rejects(prepareGroupedOwnerMaintenance(operator,config,{apply:true,expectedRestoreState:{version:999}}),/baseline changed/);assert.deepEqual(await snapshot(),baseline);
  assert.equal((await operator.query('SELECT rolsuper,rolcreaterole FROM pg_roles WHERE rolname=session_user')).rows[0].rolsuper,false);
  let injected=false;const wrapped={query:async(...args)=>{const r=await operator.query(...args);if(!injected&&typeof args[0]==='string'&&args[0].startsWith('GRANT "mw_app_dev_journal_owner"')){injected=true;await operator.query('GRANT CREATE ON SCHEMA public TO c_unrelated');}return r;}};
  await assert.rejects(prepareGroupedOwnerMaintenance(wrapped,config,{apply:true}),/unexpected tuples/);assert.equal(injected,true);assert.deepEqual(await snapshot(),baseline,'failed prepare rolls back whole transaction');
  const prepared=await prepareGroupedOwnerMaintenance(operator,config,{apply:true,expectedRestoreState:plan.restoreState});
  for(const owner of owners){const r=(await operator.query("SELECT pg_has_role(session_user,$1,'USAGE') u,pg_has_role(session_user,$1,'SET') s,has_schema_privilege($1,'public','CREATE') c",[owner])).rows[0];assert.deepEqual(r,{u:true,s:true,c:true});}
  // A permanent migration-owned ACL is added after preparation; restoration must preserve it.
  await operator.query('GRANT CREATE ON SCHEMA public TO c_unrelated');
  const elevated=await snapshot();let restoreInjected=false;
  const restoreWrapped={query:async(...args)=>{const r=await operator.query(...args);if(!restoreInjected&&typeof args[0]==='string'&&args[0].startsWith('REVOKE CREATE ON SCHEMA public FROM')){restoreInjected=true;await operator.query('GRANT CREATE ON SCHEMA public TO c_restore_sentinel');}return r;}};
  await assert.rejects(restoreGroupedOwnerMaintenance(restoreWrapped,config,prepared.restoreState,{apply:true}),/unrelated post-migration tuples changed/);assert.equal(restoreInjected,true);assert.deepEqual(await snapshot(),elevated,'failed restoration rolls back selected and unrelated changes');
  try{await assert.rejects(operator.query('SELECT 1/0'),e=>e.code==='22012');}finally{await restoreGroupedOwnerMaintenance(operator,config,prepared.restoreState,{apply:true});}
  assert.equal((await admin.query("SELECT has_schema_privilege('c_unrelated','public','CREATE') c")).rows[0].c,true);
  assert.deepEqual((await snapshot()).memberships,baseline.memberships);
  for(const owner of owners){assert.equal((await admin.query("SELECT has_schema_privilege($1,'public','CREATE') c",[owner])).rows[0].c,false);await assert.rejects(operator.query('SET ROLE '+owner),e=>e.code==='42501');}
  assert.equal((await restoreGroupedOwnerMaintenance(operator,config,prepared.restoreState,{apply:true})).mode,'grouped-authority-already-restored');
  const next=await prepareGroupedOwnerMaintenance(operator,config,{apply:true});
  await operator.query('GRANT mw_app_dev_journal_owner TO c_group_operator WITH INHERIT FALSE, SET TRUE GRANTED BY c_group_operator');
  const drift=await snapshot();await assert.rejects(restoreGroupedOwnerMaintenance(operator,config,next.restoreState,{apply:true}),/changed concurrently/);assert.deepEqual(await snapshot(),drift);
  await operator.query('GRANT mw_app_dev_journal_owner TO c_group_operator WITH INHERIT TRUE, SET TRUE GRANTED BY c_group_operator');
  await restoreGroupedOwnerMaintenance(operator,config,next.restoreState,{apply:true});
 }finally{if(operator)await operator.end();if(admin)await admin.end();await bootstrap.end();}
});

test('production CLI apply refuses before any filesystem credential/config lookup',()=>{
 for(const action of ['--prepare','--maintenance','--grouped-maintenance','--restore-grouped-maintenance','--cleanup']){
  const script=`import fs from 'node:fs';const read=fs.readFileSync;fs.readFileSync=(p,...args)=>{if(/database[\\\\/]environments\\.json|Documents[\\\\/]ChatGPT/i.test(String(p)))throw Error('CREDENTIAL_READ_TRAP');return read(p,...args)};process.argv=['node','cli','--environment','production','--apply',${JSON.stringify(action)}];await import('./scripts/database/application-role-provision-cli.mjs');`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:process.env.PHASE8_TEST_REPOSITORY,encoding:'utf8',windowsHide:true});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Production role changes are not authorized; review plan only/);assert.doesNotMatch(result.stderr,/CREDENTIAL_READ_TRAP/);
 }
});
