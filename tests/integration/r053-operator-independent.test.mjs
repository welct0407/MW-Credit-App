import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {readFile,realpath} from 'node:fs/promises';import {basename,dirname,resolve} from 'node:path';import {promisify} from 'node:util';import {execFile} from 'node:child_process';import {createHash} from 'node:crypto';
import {provisionR053Roles,prepareR053Maintenance,restoreR053Maintenance,configureR053Capture,grantR053JobDependencies,grantR053AgentReceiptApi} from '../../scripts/database/r053-operator-tooling.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {reconcileApplicationRole,planApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {runDevelopmentPostMigrationHook} from '../../scripts/database/application-role-tooling.mjs';
const execute=promisify(execFile);

test('true nonsuperuser V87 to V88/V89 operator provisioning, capture and exact finally authority restoration',async()=>{
 const e=process.env;assert.equal(e.PHASE8_TEST_DISPOSABLE,'1');assert.equal(e.PHASE8_TEST_HOST,'127.0.0.1');assert.equal(e.PHASE8_TEST_DATABASE,'loan_manager_dev');const d=await realpath(e.PHASE8_TEST_DATA_DIRECTORY);assert.equal(basename(d),'data');assert.match(basename(dirname(d)),/^mw-phase8-[a-f0-9]{32}$/);assert.equal(Number((await readFile(d+'/postmaster.pid','utf8')).split(/\r?\n/)[3]),Number(e.PHASE8_TEST_PORT));
 const base={host:e.PHASE8_TEST_HOST,port:Number(e.PHASE8_TEST_PORT),database:e.PHASE8_TEST_DATABASE},admin=new pg.Pool({...base,user:'postgres'}),operatorPool=new pg.Pool({...base,user:'c_r053_operator'});let operator,state;
 const agent=e.PHASE8_AGENT_RECEIPTS==='1',target=agent?89:88,maintenanceOptions={includeAgentReceipts:agent};
 const config={database:'loan_manager_dev',creators:['c_r053_operator'],executionMode:'owned-loopback'};
 try{
  const parameterBefore=(await admin.query('SELECT parname,paracl::text FROM pg_parameter_acl ORDER BY parname')).rows;
  assert.equal((await admin.query('SELECT max(version::int) n FROM public.flyway_schema_history WHERE success')).rows[0].n,87);
  const initial=await admin.connect();try{assert.deepEqual((await reconcileApplicationRole(initial,{database:'loan_manager_dev',creators:['postgres']},{apply:true})).violations,[]);}finally{initial.release();}
  // Shared disposable prerequisites create inert roles for full-history CI.
  // This isolated V87 provisioning proof requires their original absence.
  for(const role of ['mw_notify_owner_dev','mw_notify_api_dev','mw_notify_dispatch_dev','mw_jobs_owner_dev','mw_jobs_dev'])await admin.query(`DROP ROLE IF EXISTS ${role}`);
  await admin.query('CREATE ROLE c_r053_operator LOGIN NOSUPERUSER CREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS; CREATE ROLE c_r053_schema_owner NOLOGIN; GRANT c_r053_schema_owner TO c_r053_operator WITH ADMIN FALSE, INHERIT TRUE, SET TRUE; ALTER SCHEMA public OWNER TO c_r053_schema_owner; GRANT CREATE ON DATABASE loan_manager_dev TO c_r053_operator');
  // Model the actual nonsuperuser migration owner, not broad bootstrap SET.
  for(const table of ['pwa_notification_events','pwa_notification_deliveries','pwa_push_subscriptions','pwa_notification_preferences','pwa_job_runs','flyway_schema_history'])await admin.query(`ALTER TABLE public.${table} OWNER TO c_r053_operator`);
  await admin.query('ALTER FUNCTION public.pwa_capture_notification_v1() OWNER TO c_r053_operator; ALTER FUNCTION public.pwa_claim_notifications_v1(integer,integer) OWNER TO c_r053_operator');
  // Cloud SQL postgres is nonsuperuser and owns the pre-existing ordinary
  // catalogue. Preserve mapped V87 definer owners while modeling that baseline.
  for(const row of (await admin.query("SELECT format('%I.%I',n.nspname,c.relname) name,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner='postgres'::regrole AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relkind='S'")).rows)await admin.query(`ALTER ${row.relkind==='S'?'SEQUENCE':row.relkind==='v'?'VIEW':row.relkind==='m'?'MATERIALIZED VIEW':'TABLE'} ${row.name} OWNER TO c_r053_operator`);
  for(const row of (await admin.query("SELECT p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proowner='postgres'::regrole AND p.proname<>'payment_reallocation_permitted'")).rows)await admin.query(`ALTER FUNCTION ${row.signature} OWNER TO c_r053_operator`);
  await admin.query('GRANT EXECUTE ON FUNCTION public.payment_reallocation_permitted(text,jsonb,jsonb) TO c_r053_operator WITH GRANT OPTION');
  operator=await operatorPool.connect();assert.deepEqual((await operator.query("SELECT rolsuper,rolbypassrls,pg_has_role(current_user,'postgres','SET') bootstrap_set FROM pg_roles WHERE rolname=current_user")).rows[0],{rolsuper:false,rolbypassrls:false,bootstrap_set:false});
  const wrongTargetMutations=[];const observedIdentity=[];
  const wrongTargetClient={async query(sql,args){if(/^(BEGIN|CREATE|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/i.test(sql))wrongTargetMutations.push(sql);const result=await operator.query(sql,args);if(sql.startsWith('SELECT current_database()'))observedIdentity.push(result.rows[0].database);return result;}};
  await assert.rejects(provisionR053Roles(wrongTargetClient,{...config,database:'loan_manager_prod'},{apply:true}),err=>err.message==='True nonsuperuser exact schema operator required');
  assert.deepEqual(observedIdentity,['loan_manager_dev']);assert.deepEqual(wrongTargetMutations,[],'wrong PROD target on the DEV connection refuses before transaction or mutation');
  const dry=await provisionR053Roles(operator,config);assert.equal(dry.mode,'roles-plan');assert.equal((await admin.query("SELECT count(*)::int n FROM pg_roles WHERE rolname LIKE 'mw_notify_%' OR rolname LIKE 'mw_jobs_%'")).rows[0].n,0);
  const created=await provisionR053Roles(operator,config,{apply:true});assert.equal(created.roles.length,5);assert.ok(created.roles.every(x=>!x.rolcanlogin&&!x.rolinherit&&!x.rolsuper&&!x.rolbypassrls));
  if(agent){await admin.query('GRANT mw_app_dev_journal_owner TO c_r053_operator WITH ADMIN TRUE,INHERIT FALSE,SET FALSE');await operator.query('GRANT mw_app_dev_journal_owner TO c_r053_operator WITH ADMIN FALSE,INHERIT FALSE,SET FALSE GRANTED BY c_r053_operator');await admin.query('CREATE ROLE "mw-credit-app-command-dev@clever-oasis-508610-n7.iam" LOGIN NOSUPERUSER NOBYPASSRLS;GRANT mw_app_dev TO "mw-credit-app-command-dev@clever-oasis-508610-n7.iam" WITH ADMIN FALSE,INHERIT TRUE,SET FALSE');}
  const plan=await prepareR053Maintenance(operator,config,maintenanceOptions);state=plan.restoreState;
  await assert.rejects(prepareR053Maintenance(operator,config,{...maintenanceOptions,apply:true,expectedRestoreState:{...state,version:99}}),/baseline changed/);
  await prepareR053Maintenance(operator,config,{...maintenanceOptions,apply:true,expectedRestoreState:state});
  try{
   const result=await execute('pwsh',['-NoProfile','-Command',"$mwCallerToolRoot=$env:MW_DB_TOOL_ROOT; . ./scripts/database/Common.ps1; if($env:MW_DB_TOOL_ROOT -cne $mwCallerToolRoot){throw 'Caller tool root changed'}; & (Get-FlywayPath) '-outputType=json' '-target="+target+"' '-group=true' '-mixed=false' '-executeInTransaction=true' migrate; if($LASTEXITCODE){exit $LASTEXITCODE}"],{cwd:resolve('.'),env:{...e,FLYWAY_URL:`jdbc:postgresql://127.0.0.1:${base.port}/loan_manager_dev`,FLYWAY_USER:'c_r053_operator',FLYWAY_CONFIG_FILES:resolve('database/flyway.conf')},timeout:60000,maxBuffer:1024*1024});assert.match(result.stdout,/success/);
   assert.equal((await operator.query('SELECT max(version::int) n FROM public.flyway_schema_history WHERE success')).rows[0].n,target);
   assert.deepEqual((await planApplicationRole(operator,{database:'loan_manager_dev',creators:['postgres','c_r053_operator']})).violations,[],'actual operator post-migrate plan');
   assert.deepEqual((await runDevelopmentPostMigrationHook(operator,{database:'loan_manager_dev',creators:['postgres','c_r053_operator']},{environment:'development',command:'migrate',apply:true})).violations,[],'maintained post-migrate policy runs before authority restoration');
   if(agent){const grantPlan=await grantR053AgentReceiptApi(operator,config);await assert.rejects(grantR053AgentReceiptApi(operator,config,{apply:true,expectedBefore:[]}),/baseline changed/);await grantR053AgentReceiptApi(operator,config,{apply:true,expectedBefore:grantPlan.before});}
   const before=await configureR053Capture(operator,config,{enabled:true});assert.ok(before.before.proconfig.includes('application_name=mw_pwa_capture_disabled_v1'));const enabled=await configureR053Capture(operator,config,{enabled:true,apply:true,expectedBefore:before.before});assert.ok(enabled.after.proconfig.includes('application_name=mw_pwa_capture_enabled_v1'));
   if(agent){
    // Replay only the forward block against the published V88 body while
    // capture is already enabled; retain the full grouped 87->89 proof above.
    const migration=await readFile('database/migrations/V89__agent_receipt_payment_command.sql','utf8');
    const forward=migration.match(/DO \$capture_forward\$[\s\S]*?END \$capture_forward\$;/)?.[0];assert.ok(forward);
    const nextBody=migration.match(/new_body text:=\$capture_body\$([\s\S]*?)\$capture_body\$;/)?.[1];assert.ok(nextBody);
    const oldBody=nextBody.replace(' ON CONFLICT(dedupe_key) DO NOTHING;\n'," ON CONFLICT(dedupe_key) DO NOTHING;\n IF FOUND THEN PERFORM pg_catalog.pg_notify('mw_pwa_notifications_v1',''); END IF;\n");
    const definition=(await operator.query("SELECT pg_get_functiondef('public.pwa_capture_notification_v1()'::regprocedure) definition,prosrc FROM pg_proc WHERE oid='public.pwa_capture_notification_v1()'::regprocedure")).rows[0];
    assert.equal(definition.prosrc,nextBody);await operator.query(definition.definition.replace(nextBody,oldBody));
    const metadata="SELECT oid,proowner,proacl::text,proconfig,prosecdef,provolatile,proparallel,proisstrict,proleakproof FROM pg_proc WHERE oid='public.pwa_capture_notification_v1()'::regprocedure";
    const captureBefore=(await operator.query(metadata)).rows[0];assert.ok(captureBefore.proconfig.includes('application_name=mw_pwa_capture_enabled_v1'));
    await operator.query(forward);assert.deepEqual((await operator.query(metadata)).rows[0],captureBefore,'forward replacement preserves enabled marker and all protected metadata');
    assert.equal((await operator.query("SELECT prosrc FROM pg_proc WHERE oid='public.pwa_capture_notification_v1()'::regprocedure")).rows[0].prosrc,nextBody);
    assert.equal(nextBody.includes('pg_notify'),false);
   }
   const manifest=JSON.parse(await readFile('project/outputs/r053-notifications-jobs/jobs-owner-reviewed-dependencies.json','utf8')),sha=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');await grantR053JobDependencies(operator,config,manifest,{reviewedManifestSha256:sha,apply:true});
  }finally{await restoreR053Maintenance(operator,config,state,{apply:true});}
  assert.equal((await restoreR053Maintenance(operator,config,state,{apply:true})).mode,'authority-already-restored');
  for(const role of ['mw_notify_owner_dev','mw_jobs_owner_dev',...(agent?['mw_app_dev_journal_owner']:[])])assert.deepEqual((await operator.query("SELECT pg_has_role(current_user,$1,'SET') owner_set,has_schema_privilege($1,'public','CREATE') schema_create",[role])).rows[0],{owner_set:false,schema_create:false});
  assert.deepEqual((await admin.query('SELECT parname,paracl::text FROM pg_parameter_acl ORDER BY parname')).rows,parameterBefore,'migration/toggle changes no parameter ACL');
  if(agent){const machine=new pg.Client({...base,user:'mw-credit-app-command-dev@clever-oasis-508610-n7.iam'});await machine.connect();try{assert.equal((await machine.query("SELECT public.pwa_agent_receipt_status_v1('00000000-0000-4000-8000-000000000000','https://accounts.google.com','737787224638') result")).rows[0].result.kind,'unresolved');for(const sig of ['public.pwa_submit_agent_receipt_v1(text)','public.pwa_agent_receipt_status_v1(uuid,text,text)'])assert.equal((await admin.query("SELECT has_function_privilege('mw_app_dev',$1,'EXECUTE') b",[sig])).rows[0].b,false);}finally{await machine.end();}}
  const payment=await seedPaymentFixture(admin,'C-R053-RESTORED');const ac=await admin.connect();try{assert.deepEqual((await reconcileApplicationRole(ac,{database:'loan_manager_dev',creators:['postgres','c_r053_operator']},{apply:true})).violations,[]);}finally{ac.release();}
  await admin.query('CREATE ROLE c_r053_restored_source LOGIN NOSUPERUSER NOBYPASSRLS; GRANT mw_app_dev TO c_r053_restored_source WITH INHERIT TRUE, SET FALSE, ADMIN FALSE');const runtime=new pg.Client({...base,user:'c_r053_restored_source'});await runtime.connect();
  const insert=`INSERT INTO public."Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Created By") VALUES($1,$2,'4A-LEND',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'4a-owner@example.invalid')`;
  try{await runtime.query("SET application_name='mw_pwa_capture_disabled_v1'");await runtime.query(insert,['C-R053-RESTORED-ENABLED',payment.borrowerId]);assert.equal((await admin.query("SELECT count(*)::int n FROM public.pwa_notification_events WHERE source_id='C-R053-RESTORED-ENABLED'")).rows[0].n,1,'runtime capture works after operator authority restored');
   await assert.rejects(runtime.query("ALTER FUNCTION public.pwa_capture_notification_v1() RESET application_name"),err=>err.code==='42501');
   for(const setting of ["RESET application_name","SET application_name='unknown-marker'","SET application_name='mw_pwa_capture_disabled_v1'"]){await admin.query('ALTER FUNCTION public.pwa_capture_notification_v1() '+setting);await runtime.query("SET application_name='mw_pwa_capture_enabled_v1'");await runtime.query('BEGIN');await runtime.query("SET LOCAL application_name='mw_pwa_capture_enabled_v1'");const id='C-R053-RESTORED-CLOSED-'+setting;await runtime.query(insert,[id,payment.borrowerId]);await runtime.query('COMMIT');assert.equal((await admin.query('SELECT count(*)::int n FROM public.pwa_notification_events WHERE source_id=$1',[id])).rows[0].n,0,'missing/unknown/disabled metadata ignores session/local spoof');}
  }finally{await runtime.end();}
  assert.deepEqual((await admin.query('SELECT parname,paracl::text FROM pg_parameter_acl ORDER BY parname')).rows,parameterBefore);
  const baseline=await prepareR053Maintenance(operator,config);await prepareR053Maintenance(operator,config,{apply:true});
  await admin.query('ALTER ROLE mw_notify_owner_dev LOGIN');await assert.rejects(restoreR053Maintenance(operator,config,baseline.restoreState,{apply:true}),/closed roles/);await admin.query('ALTER ROLE mw_notify_owner_dev NOLOGIN');
  const failure=new Error('synthetic migration failure');await assert.rejects((async()=>{try{throw failure;}finally{await restoreR053Maintenance(operator,config,baseline.restoreState,{apply:true});}})(),err=>err===failure);assert.equal((await restoreR053Maintenance(operator,config,baseline.restoreState)).mode,'authority-already-restored');
 }finally{if(operator){operator.release();}await operatorPool.end();await admin.end();}
});
