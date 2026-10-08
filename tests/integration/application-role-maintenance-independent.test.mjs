import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {writeFile,readFile} from 'node:fs/promises';
import {prepareExistingApplicationRoleMaintenance,restoreExistingApplicationRoleMaintenance} from '../../scripts/database/application-role-provisioning.mjs';
import {reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
assert.equal(process.env.OPERATOR_PROOF_DISPOSABLE,'1');const port=Number(process.env.OPERATOR_PROOF_PORT);assert.ok(port>1024&&port<65536);const config={database:'payment_rehearsal',creators:['postgres']};
const client=new pg.Client({host:'127.0.0.1',port,database:config.database,user:'postgres'});await client.connect();
async function fingerprint(){return (await client.query(`SELECT (SELECT jsonb_agg(to_jsonb(x) ORDER BY roleid,member,grantor) FROM (SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members)x) memberships,(SELECT nspacl::text FROM pg_namespace WHERE nspname='public') schema_acl,(SELECT jsonb_agg(to_jsonb(x) ORDER BY oid) FROM (SELECT oid,proowner,proacl FROM pg_proc WHERE oid IN (to_regprocedure('public.pwa_submit_selected_charges_v1(text)'),to_regprocedure('public.pwa_command_status_v1(uuid,text,text)')))x) definers`)).rows[0]}
try{await test('existing package exact temporary maintenance restoration on true nonsuper LOGIN',async()=>{
 assert.equal((await client.query('SELECT rolsuper FROM pg_roles WHERE rolname=session_user')).rows[0].rolsuper,false);
 const phase=process.env.OPERATOR_MAINTENANCE_PHASE,path=process.env.OPERATOR_MAINTENANCE_STATE;
 if(phase==='prepare'||phase==='failure'){
  const bootstrap=new pg.Client({host:'127.0.0.1',port,database:config.database,user:'mw_fixture_bootstrap'});await bootstrap.connect();try{await bootstrap.query('CREATE ROLE mw_maintenance_other_role NOLOGIN; GRANT mw_maintenance_other_role TO postgres WITH ADMIN FALSE, INHERIT FALSE, SET FALSE GRANTED BY mw_fixture_bootstrap')}finally{await bootstrap.end()}
  await client.query('CREATE ROLE mw_maintenance_schema_sentinel NOLOGIN');await client.query('GRANT USAGE ON SCHEMA public TO mw_maintenance_schema_sentinel');
  const before=await fingerprint(),dry=await prepareExistingApplicationRoleMaintenance(client,config);
  if(phase==='failure'){
   let injected=false;const wrapped={query:async(...args)=>{const result=await client.query(...args);if(typeof args[0]==='string'&&args[0].startsWith('GRANT "mw_app_dev_journal_owner" TO')&&!injected){injected=true;await client.query('GRANT CREATE ON SCHEMA public TO mw_maintenance_schema_sentinel')}return result}};
   await assert.rejects(prepareExistingApplicationRoleMaintenance(wrapped,config,{apply:true}),/Unrelated maintenance privilege drift/);assert.equal(injected,true);assert.deepEqual(await fingerprint(),before);
  }
  await writeFile(path,JSON.stringify({before,state:dry.restoreState}),{encoding:'utf8',flag:'wx'});
  const prepared=await prepareExistingApplicationRoleMaintenance(client,config,{apply:true});assert.deepEqual(prepared.restoreState,dry.restoreState);
  assert.equal((await client.query("SELECT pg_has_role(session_user,'mw_app_dev_journal_owner','USAGE') u,pg_has_role(session_user,'mw_app_dev_journal_owner','SET') s")).rows[0].u,true);
  if(phase==='failure'){try{await assert.rejects(client.query('SELECT 1/0'),e=>e.code==='22012')}finally{await restoreExistingApplicationRoleMaintenance(client,config,dry.restoreState,{apply:true})}assert.deepEqual(await fingerprint(),before);}
 }else{
  const retained=JSON.parse(await readFile(path,'utf8'));
  try{
   assert.deepEqual((await reconcileApplicationRole(client,config,{apply:true})).violations,[]);
   const elevated=await fingerprint();let injected=false;const wrapped={query:async(...args)=>{const result=await client.query(...args);if(typeof args[0]==='string'&&args[0].startsWith('REVOKE CREATE ON SCHEMA public FROM "mw_app_dev_journal_owner"')&&!injected){injected=true;await client.query('GRANT CREATE ON SCHEMA public TO mw_maintenance_schema_sentinel')}return result}};
   await assert.rejects(restoreExistingApplicationRoleMaintenance(wrapped,config,retained.state,{apply:true}),/Unrelated maintenance privilege drift/);assert.equal(injected,true);assert.deepEqual(await fingerprint(),elevated);
  }finally{await restoreExistingApplicationRoleMaintenance(client,config,retained.state,{apply:true})}
  assert.deepEqual(await fingerprint(),retained.before);assert.equal((await restoreExistingApplicationRoleMaintenance(client,config,retained.state,{apply:true})).mode,'maintenance-already-restored');
  await assert.rejects(client.query('SET ROLE mw_app_dev_journal_owner'),e=>e.code==='42501');
  const head=Number((await client.query('SELECT max(version::integer) AS head FROM flyway_schema_history WHERE success')).rows[0].head);const expectedHead=Number(process.env.OPERATOR_MAINTENANCE_TARGET||80);assert.ok([80,83].includes(expectedHead));assert.equal(head,expectedHead);
  if(expectedHead===83){const routines=(await client.query("SELECT p.proname,p.prosecdef,r.rolname owner FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid IN (to_regprocedure('public.pwa_submit_operation_v2(text)'),to_regprocedure('public.pwa_operation_status_v2(uuid,text,text)')) ORDER BY p.proname")).rows;assert.equal(routines.length,2);for(const routine of routines){assert.equal(routine.prosecdef,true);assert.equal(routine.owner,'mw_app_dev_journal_owner')}assert.deepEqual((await reconcileApplicationRole(client,config)).violations,[]);}
 }
})}finally{await client.end()}





