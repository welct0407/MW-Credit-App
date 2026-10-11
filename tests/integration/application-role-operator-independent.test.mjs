import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { prepareApplicationRoles, finalizeApplicationRoleProvisioning, cleanupTemporaryApplicationRoleAuthority } from '../../scripts/database/application-role-provisioning.mjs';
import { reconcileApplicationRole } from '../../scripts/database/app-role-policy.mjs';
import { provisionApplicationRuntimeMembership, runDevelopmentPostMigrationHook } from '../../scripts/database/application-role-tooling.mjs';
assert.equal(process.env.OPERATOR_PROOF_DISPOSABLE,'1');
const port=Number(process.env.OPERATOR_PROOF_PORT);
assert.ok(Number.isInteger(port)&&port>1024);
const config={database:'payment_rehearsal',creators:['postgres']};
const client=new pg.Client({host:'127.0.0.1',port,database:config.database,user:'postgres'});
await client.connect();
try {
 await test('True LOGIN nonsuperuser operator owns database and schema',async()=>{
  const {rows:[r]}=await client.query("SELECT session_user,current_user,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,has_schema_privilege(session_user,'public','CREATE') schema_create FROM pg_roles WHERE rolname=session_user");
  assert.equal(r.session_user,'postgres');assert.equal(r.current_user,'postgres');
  assert.equal(r.rolsuper,false);assert.equal(r.rolbypassrls,false);
  assert.equal(r.rolcreaterole,true);assert.equal(r.rolcreatedb,true);assert.equal(r.schema_create,true);
 });
 if(['prepare','failure'].includes(process.env.OPERATOR_PROOF_PHASE)){
  await test('Actual operator creates absent NOLOGIN roles and temporary transfer authority',async()=>{
   await prepareApplicationRoles(client,config,{apply:true});
   const {rows:[r]}=await client.query("SELECT bool_or(m.admin_option) admin_option,bool_or(m.inherit_option) inherit_option,bool_or(m.set_option) set_option,has_schema_privilege('mw_app_dev_journal_owner','public','CREATE') schema_create FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE r.rolname='mw_app_dev_journal_owner' AND u.rolname='postgres'");
   assert.deepEqual(r,{admin_option:true,inherit_option:true,set_option:true,schema_create:true});
   await assert.rejects(prepareApplicationRoles(client,config,{apply:true}),/already exists/);
  });

  if(process.env.OPERATOR_PROOF_PHASE==='failure')await test('Failed migration cleanup removes all temporary owner authority without deleting roles',async()=>{
   await assert.rejects(finalizeApplicationRoleProvisioning(client,config,{apply:true}),/V79/);
   await cleanupTemporaryApplicationRoleAuthority(client,config,{apply:true});
   const {rows:[r]}=await client.query("SELECT pg_has_role(session_user,'mw_app_dev_journal_owner','USAGE') inherited,pg_has_role(session_user,'mw_app_dev_journal_owner','SET') can_set,has_schema_privilege('mw_app_dev_journal_owner','public','CREATE') schema_create");
   assert.deepEqual(r,{inherited:false,can_set:false,schema_create:false});
  });
 }else{
  await test('V79 exact owner transfer permits finalization and operator reconciliation',async()=>{
   const p=await reconcileApplicationRole(client,config,{apply:true});
   await finalizeApplicationRoleProvisioning(client,config,{apply:true});
   assert.deepEqual(p.violations,[]);
   const {rows:[r]}=await client.query("SELECT bool_or(m.admin_option) admin_option,bool_or(m.inherit_option) inherit_option,bool_or(m.set_option) set_option,has_schema_privilege('mw_app_dev_journal_owner','public','CREATE') schema_create FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE r.rolname='mw_app_dev_journal_owner' AND u.rolname='postgres'");
   assert.deepEqual(r,{admin_option:true,inherit_option:false,set_option:false,schema_create:false});
   await assert.rejects(client.query('SET ROLE mw_app_dev_journal_owner'),e=>e.code==='42501');
  });

  await test('Finalized future hook provisions ordinary objects without owner ACL statements and fails closed on definer drift',async()=>{
   await client.query('CREATE TABLE public.operator_future_fixture(id integer)');
   const plan=await reconcileApplicationRole(client,config);
   assert.equal(plan.statements.some(sql=>sql.includes('pwa_command_status_v1')||sql.includes('pwa_submit_selected_charges_v1')),false);
   await runDevelopmentPostMigrationHook(client,config,{environment:'development',command:'migrate',apply:true});
   assert.equal((await client.query("SELECT has_table_privilege('mw_app_dev','public.operator_future_fixture','INSERT') allowed")).rows[0].allowed,true);
   const bootstrap=new pg.Client({host:'127.0.0.1',port,database:config.database,user:'mw_fixture_bootstrap'});await bootstrap.connect();
   try{
    await bootstrap.query('REVOKE EXECUTE ON FUNCTION public.pwa_command_status_v1(uuid,text,text) FROM mw_app_dev');
    await assert.rejects(runDevelopmentPostMigrationHook(client,config,{environment:'development',command:'migrate',apply:true}),/readiness/i);
    assert.equal((await client.query("SELECT pg_has_role(session_user,'mw_app_dev_journal_owner','USAGE') inherited,pg_has_role(session_user,'mw_app_dev_journal_owner','SET') can_set")).rows[0].inherited,false);
    assert.equal((await client.query("SELECT pg_has_role(session_user,'mw_app_dev_journal_owner','SET') can_set")).rows[0].can_set,false);
   }finally{await bootstrap.query('GRANT EXECUTE ON FUNCTION public.pwa_command_status_v1(uuid,text,text) TO mw_app_dev');await bootstrap.end();}
  });
  await test('Fresh runtime LOGIN inherits application rights without owner or creator membership',async()=>{
   await client.query('CREATE ROLE mw_operator_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
   await provisionApplicationRuntimeMembership(client,{...config,runtimeUser:'mw_operator_runtime'},{apply:true});
   const runtime=new pg.Client({host:'127.0.0.1',port,database:config.database,user:'mw_operator_runtime'});
   await runtime.connect();
   try{
    const {rows:[r]}=await runtime.query("SELECT session_user,current_user,pg_has_role(session_user,'mw_app_dev','USAGE') app,pg_has_role(session_user,'mw_app_dev_journal_owner','MEMBER') owner,pg_has_role(session_user,'postgres','MEMBER') creator,has_table_privilege(session_user,'public.pwa_payment_commands','INSERT') journal_write");
    assert.equal(r.session_user,'mw_operator_runtime');assert.equal(r.current_user,'mw_operator_runtime');
    assert.equal(r.app,true);assert.equal(r.owner,false);assert.equal(r.creator,false);assert.equal(r.journal_write,false);
    await assert.rejects(runtime.query('SET ROLE mw_app_dev_journal_owner'),e=>e.code==='42501');
    await assert.rejects(runtime.query('SET ROLE postgres'),e=>e.code==='42501');
   }finally{await runtime.end();}
  });
 }
}finally{await client.end();}







