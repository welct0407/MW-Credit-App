import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {realpath,readFile} from 'node:fs/promises';import {basename,dirname} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
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
  const unknownGrantor={...config,grantors:config.grantors.map((g,i)=>i?g:{...g,membershipGrantor:'unknown_fixture_grantor'})};
  await assert.rejects(prepareGroupedOwnerMaintenance(operator,unknownGrantor,{apply:true}),/Explicit grantor/);assert.deepEqual(await snapshot(),baseline);
  await operator.query('ALTER ROLE mw_app_dev_journal_owner LOGIN');
  try{await assert.rejects(prepareGroupedOwnerMaintenance(operator,config,{apply:true}),/reviewed flags/);}finally{await operator.query('ALTER ROLE mw_app_dev_journal_owner NOLOGIN');}
  assert.deepEqual(await snapshot(),baseline);
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
  await operator.query('CREATE ROLE mw_app_prod_migration_schema_create NOLOGIN');
  await assert.rejects(prepareGroupedOwnerMaintenance(operator,config,{apply:true}),/absent initially/);
  await operator.query('DROP ROLE mw_app_prod_migration_schema_create');
  const fenced=await prepareGroupedOwnerMaintenance(operator,config,{apply:true});
  await operator.query('GRANT mw_app_prod_migration_schema_create TO c_unrelated WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  const unexpected=await snapshot();await assert.rejects(restoreGroupedOwnerMaintenance(operator,config,fenced.restoreState,{apply:true}),/changed concurrently/);assert.deepEqual(await snapshot(),unexpected);
  await operator.query('REVOKE mw_app_prod_migration_schema_create FROM c_unrelated');
  await operator.query('ALTER ROLE mw_app_prod_migration_schema_create LOGIN');
  await assert.rejects(restoreGroupedOwnerMaintenance(operator,config,fenced.restoreState,{apply:true}),/changed concurrently/);
  await operator.query('ALTER ROLE mw_app_prod_migration_schema_create NOLOGIN');
  await restoreGroupedOwnerMaintenance(operator,config,fenced.restoreState,{apply:true});
  const dependent=await prepareGroupedOwnerMaintenance(operator,config,{apply:true});
  await admin.query('CREATE TABLE public.c_temporary_dependency(id integer); ALTER TABLE public.c_temporary_dependency OWNER TO mw_app_prod_migration_schema_create');
  const dependencyDrift=await snapshot();await assert.rejects(restoreGroupedOwnerMaintenance(operator,config,dependent.restoreState,{apply:true}),/changed concurrently/);assert.deepEqual(await snapshot(),dependencyDrift);
  assert.equal((await admin.query("SELECT to_regclass('public.c_temporary_dependency') r")).rows[0].r,'c_temporary_dependency');
  await admin.query('DROP TABLE public.c_temporary_dependency');
  await restoreGroupedOwnerMaintenance(operator,config,dependent.restoreState,{apply:true});
  assert.equal((await admin.query("SELECT count(*)::int n FROM pg_roles WHERE rolname='mw_app_prod_migration_schema_create'")).rows[0].n,0);
 }finally{if(operator)await operator.end();if(admin)await admin.end();await bootstrap.end();}
});

test('true nonsuperuser full77→87 uses v2 capability with grouped failure, observer and finally restoration',async()=>{
 const connection=await fixture(),admin=new pg.Client({...connection,user:'postgres',database:'loan_manager_prod'}),operator=new pg.Client({...connection,user:'c_group_operator',database:'loan_manager_prod'}),observer=new pg.Client({...connection,user:'postgres',database:'loan_manager_prod'});
 await admin.connect();await operator.connect();await observer.connect();let held=false;
 const config={database:'loan_manager_prod',creators:['c_group_operator'],grantors:owners.map(ownerRole=>({ownerRole,membershipGrantor:'c_group_operator',schemaGrantor:'c_schema_owner',membershipMode:'explicit'}))};
 const migrate=target=>new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`& $env:PHASE8_TEST_FLYWAY_PATH '-outputType=json' '-target=${target}' '-group=true' '-mixed=false' '-executeInTransaction=true' migrate; exit $LASTEXITCODE`],{cwd:process.env.PHASE8_TEST_REPOSITORY,windowsHide:true,env:{...process.env,FLYWAY_URL:`jdbc:postgresql://127.0.0.1:${connection.port}/loan_manager_prod`,FLYWAY_USER:'c_group_operator',FLYWAY_CONFIG_FILES:process.env.PHASE8_TEST_REPOSITORY+'/database/flyway.conf'}});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);child.on('error',reject);child.on('close',code=>resolve({code,output}));
 });
 const authority=async()=>({memberships:(await admin.query('SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor')).rows,create:(await admin.query("SELECT pg_get_userbyid(a.grantee) grantee,a.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname='public' AND a.privilege_type='CREATE' ORDER BY a.grantee")).rows});
 const fingerprint=async()=>(await admin.query(`SELECT jsonb_build_object('history',(SELECT jsonb_agg(jsonb_build_array(version,checksum,success) ORDER BY installed_rank) FROM public.flyway_schema_history),'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid,proowner,proacl::text,pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','assessment_lab') AND p.prokind='f'),'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,relowner,relacl::text) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','assessment_lab'))) value`)).rows[0].value;
 try{
  await admin.query('GRANT CREATE ON DATABASE loan_manager_prod TO c_group_operator');
  await operator.query(await readFile(process.env.PHASE8_TEST_REPOSITORY+'/scripts/database/Test-AgentAuditPrerequisites.sql','utf8'));
  await operator.query('CREATE ROLE mw_app_dev NOLOGIN; CREATE ROLE mw_app_prod NOLOGIN; GRANT mw_app_dev TO mw_app_dev_journal_owner WITH ADMIN FALSE, INHERIT TRUE, SET FALSE; GRANT mw_app_prod TO mw_app_prod_journal_owner WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
  const initial=await migrate(77);assert.equal(initial.code,0,initial.output);
  await operator.query("CREATE TABLE public.c_rls_preserved(id integer PRIMARY KEY); INSERT INTO public.c_rls_preserved VALUES(1); ALTER TABLE public.c_rls_preserved ENABLE ROW LEVEL SECURITY; ALTER TABLE public.c_rls_preserved FORCE ROW LEVEL SECURITY; CREATE POLICY c_rls_policy ON public.c_rls_preserved USING(id=2)");
  const protection=async()=>({catalog:(await admin.query("SELECT c.relrowsecurity,c.relforcerowsecurity,pg_get_expr(p.polqual,p.polrelid) expression FROM pg_class c JOIN pg_policy p ON p.polrelid=c.oid WHERE c.oid='public.c_rls_preserved'::regclass")).rows,visible:(await operator.query('SELECT count(*)::int n FROM public.c_rls_preserved')).rows[0].n,retained:(await admin.query('SELECT count(*)::int n FROM public.c_rls_preserved')).rows[0].n});
  const protectedBefore=await protection();assert.equal(protectedBefore.visible,0);assert.equal(protectedBefore.retained,1);assert.equal(protectedBefore.catalog[0].relrowsecurity,true);assert.equal(protectedBefore.catalog[0].relforcerowsecurity,true);
  const original=await fingerprint(),before=await authority();
  let state=await prepareGroupedOwnerMaintenance(operator,config,{apply:true});assert.equal(state.restoreState.version,2);assert.ok(state.restoreState.temporary.memberships.some(m=>m.member==='c_group_operator'&&m.grantor==='postgres'&&m.admin_option));
  assert.equal((await admin.query("SELECT count(*)::int n FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname='public' AND a.grantee='mw_app_dev_journal_owner'::regrole AND a.privilege_type='CREATE'")).rows[0].n,0);
  try{
   await admin.query('ALTER ROLE mw_app_prod LOGIN');const failed=await migrate(87);assert.notEqual(failed.code,0);assert.match(failed.output,/Missing or unsafe application role/);
  }finally{await admin.query('ALTER ROLE mw_app_prod NOLOGIN');await restoreGroupedOwnerMaintenance(operator,config,state.restoreState,{apply:true});}
  assert.deepEqual(await fingerprint(),original);assert.deepEqual(await authority(),before);assert.deepEqual(await protection(),protectedBefore);
  await admin.query(`CREATE FUNCTION public.b_group_latch() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM pg_event_trigger_ddl_commands() WHERE object_identity='public.pwa_job_runs') THEN PERFORM pg_advisory_xact_lock(871112);END IF;END $$;CREATE EVENT TRIGGER b_group_latch ON ddl_command_end WHEN TAG IN('CREATE TABLE') EXECUTE FUNCTION public.b_group_latch()`);
  state=await prepareGroupedOwnerMaintenance(operator,config,{apply:true});
  try{
   await observer.query('SELECT pg_advisory_lock(871112)');held=true;const running=migrate(87);let waiting=false;const deadline=Date.now()+60000;
   while(Date.now()<deadline){waiting=(await observer.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=871112 AND NOT granted) waiting")).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,100));}
   if(!waiting){await observer.query('SELECT pg_advisory_unlock(871112)');held=false;const failed=await running;assert.fail('Did not reach latch: '+failed.output);}
   assert.equal((await observer.query('SELECT max(version::int) v FROM public.flyway_schema_history')).rows[0].v,77);
   assert.equal((await observer.query("SELECT to_regclass('public.pwa_notification_events') r")).rows[0].r,null);
   await observer.query('SELECT pg_advisory_unlock(871112)');held=false;const result=await running;assert.equal(result.code,0,result.output);
  }finally{if(held){await observer.query('SELECT pg_advisory_unlock(871112)');held=false;}await restoreGroupedOwnerMaintenance(operator,config,state.restoreState,{apply:true});}
  await admin.query('DROP EVENT TRIGGER b_group_latch;DROP FUNCTION public.b_group_latch()');
  assert.equal((await admin.query('SELECT max(version::int) v FROM public.flyway_schema_history')).rows[0].v,87);assert.deepEqual(await authority(),before);
  assert.deepEqual(await protection(),protectedBefore,'grouped success preserves forced RLS/policy and protected row visibility');
  assert.equal((await admin.query("SELECT count(*)::int n FROM pg_roles WHERE rolname='mw_app_prod_migration_schema_create'")).rows[0].n,0);
  const defs=(await admin.query("SELECT pg_get_userbyid(proowner) owner FROM pg_proc WHERE proname IN('pwa_command_status_v1','pwa_submit_selected_charges_v1','pwa_operation_status_v2','pwa_submit_operation_v2')")).rows;
  assert.equal(defs.length,4);assert.ok(defs.every(r=>r.owner==='mw_app_prod_journal_owner'));
  assert.equal((await admin.query("SELECT count(*)::int n FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee IN('mw_app_dev'::regrole,'mw_app_dev_journal_owner'::regrole)")).rows[0].n,0);
 }finally{if(held)await observer.query('SELECT pg_advisory_unlock(871112)');await observer.end();await operator.end();await admin.end();}
});

test('production CLI apply refuses before any filesystem credential/config lookup',()=>{
 for(const action of ['--prepare','--maintenance','--grouped-maintenance','--restore-grouped-maintenance','--cleanup']){
  const script=`import fs from 'node:fs';const read=fs.readFileSync;fs.readFileSync=(p,...args)=>{if(/database[\\\\/]environments\\.json|Documents[\\\\/]ChatGPT/i.test(String(p)))throw Error('CREDENTIAL_READ_TRAP');return read(p,...args)};process.argv=['node','cli','--environment','production','--apply',${JSON.stringify(action)}];await import('./scripts/database/application-role-provision-cli.mjs');`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:process.env.PHASE8_TEST_REPOSITORY,encoding:'utf8',windowsHide:true});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Production role changes are not authorized; review plan only/);assert.doesNotMatch(result.stderr,/CREDENTIAL_READ_TRAP/);
 }
});
