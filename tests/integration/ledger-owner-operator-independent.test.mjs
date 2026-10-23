// V93 ledger-owner operator path (A-design §9.4) on the Cloud SQL shape: `postgres` is a non-superuser
// CREATEROLE login that owns the catalogue at V92; the bootstrap superuser only prepares the fixture.
import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {readFile,realpath} from 'node:fs/promises';import {basename,dirname,resolve} from 'node:path';import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {provisionClosedOwnerRole,prepareOwnerAuthority,restoreOwnerAuthority} from '../../scripts/database/r053-operator-tooling.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {runDevelopmentPostMigrationHook} from '../../scripts/database/application-role-tooling.mjs';
import {migrationHead} from '../migration-head.mjs';
const execute=promisify(execFile);
const LEDGER='mw_ledger_owner_dev',HEAD=migrationHead();

test('nonsuperuser postgres: closed ledger owner, V93 refused closed, applied with temporary authority, exact restoration, app-role ledger sync',async()=>{
 const e=process.env;assert.equal(e.PHASE8_TEST_DISPOSABLE,'1');assert.equal(e.PHASE8_TEST_HOST,'127.0.0.1');assert.equal(e.PHASE8_TEST_DATABASE,'loan_manager_dev');assert.equal(e.PHASE8_LEDGER_OWNER,'1');const d=await realpath(e.PHASE8_TEST_DATA_DIRECTORY);assert.equal(basename(d),'data');assert.match(basename(dirname(d)),/^mw-phase8-[a-f0-9]{32}$/);assert.equal(Number((await readFile(d+'/postmaster.pid','utf8')).split(/\r?\n/)[3]),Number(e.PHASE8_TEST_PORT));
 const bootstrap=e.PHASE8_TEST_USER;assert.notEqual(bootstrap,'postgres');
 const base={host:e.PHASE8_TEST_HOST,port:Number(e.PHASE8_TEST_PORT),database:e.PHASE8_TEST_DATABASE},admin=new pg.Pool({...base,user:bootstrap}),operatorPool=new pg.Pool({...base,user:'postgres'});let operator;
 const config={database:'loan_manager_dev',creators:['postgres'],executionMode:'owned-loopback'};
 const flyway=(command,extra=[])=>execute('pwsh',['-NoProfile','-Command',"$mwCallerToolRoot=$env:MW_DB_TOOL_ROOT; . ./scripts/database/Common.ps1; if($env:MW_DB_TOOL_ROOT -cne $mwCallerToolRoot){throw 'Caller tool root changed'}; & (Get-FlywayPath) '-outputType=json' "+extra.map(x=>"'"+x+"'").join(' ')+" "+command+"; if($LASTEXITCODE){exit $LASTEXITCODE}"],{cwd:resolve('.'),env:{...e,FLYWAY_URL:`jdbc:postgresql://127.0.0.1:${base.port}/loan_manager_dev`,FLYWAY_USER:'postgres',FLYWAY_CONFIG_FILES:resolve('database/flyway.conf')},timeout:120000,maxBuffer:4*1024*1024});
 const history=async c=>(await c.query("SELECT max(version::integer) FILTER(WHERE success) AS version,count(*) FILTER(WHERE NOT success)::integer AS failed FROM public.flyway_schema_history")).rows[0];
 const ledgerShape=async c=>(await c.query("SELECT pg_has_role('postgres',$1,'SET') runner_can_set,pg_has_role('postgres',$1,'USAGE') runner_inherits,has_schema_privilege($1,'public','CREATE') owner_schema_create",[LEDGER])).rows[0];
 try{
  assert.deepEqual(await history(admin),{version:92,failed:0});
  // Cloud SQL shape: the runner migrated V1-V92 and owns the ordinary catalogue, the history table and the
  // database (public stays owned by pg_database_owner, which the database owner can SET to), is a member of
  // mw_business_audit_owner (V33; prerequisite script) and is no superuser.
  // One-time journal-routine provisioning (live DEV holds it since V82/V85); the migration hook only audits it.
  const initial=await admin.connect();try{assert.deepEqual((await reconcileApplicationRole(initial,{database:'loan_manager_dev',creators:['postgres']},{apply:true})).violations,[]);}finally{initial.release();}
  await admin.query('ALTER ROLE postgres NOSUPERUSER CREATEROLE NOBYPASSRLS');
  assert.equal((await admin.query("SELECT pg_get_userbyid(nspowner) owner FROM pg_namespace WHERE nspname='public'")).rows[0].owner,'pg_database_owner');
  assert.equal((await admin.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') AND c.relowner<>'postgres'::regrole AND pg_get_userbyid(c.relowner) NOT LIKE 'mw_%'")).rows[0].n,0,'ordinary catalogue owned by the runner');
  // The shared prerequisite script creates the ledger owner for full-history CI; this proof provisions it.
  await admin.query('DROP ROLE IF EXISTS '+LEDGER);
  operator=await operatorPool.connect();assert.deepEqual((await operator.query("SELECT rolsuper,rolcreaterole,rolbypassrls,pg_has_role(current_user,$1,'SET') bootstrap_set,pg_has_role(current_user,'mw_business_audit_owner','USAGE') audit_member FROM pg_roles WHERE rolname=current_user",[bootstrap])).rows[0],{rolsuper:false,rolcreaterole:true,rolbypassrls:false,bootstrap_set:false,audit_member:true});
  // R053 owner creator tuples as provisionR053Roles leaves them (closed; the prerequisite script created the
  // roles as a superuser, so no automatic tuple exists). The DEV post-migrate hook REVOKEs/GRANTs on the
  // notify/jobs-owned tables (V88) and the journal-owned V89 functions, so the migrate window must hold the
  // same three owners as R053's prepare-agent in addition to the ledger owner (R053_OPERATOR.md steps 3-4).
  // V97 (R078) adds the change-log owner to the same window: its two definers are re-owned by the migration.
  // V104 (R090) adds the chat owner: its four tables and thirteen routines are re-owned by the migration.
  const R053_OWNERS=['mw_notify_owner_dev','mw_jobs_owner_dev','mw_app_dev_journal_owner','mw_changes_owner_dev','mw_chat_owner_dev'];
  for(const owner of R053_OWNERS){await admin.query(`GRANT ${owner} TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`);await operator.query(`GRANT ${owner} TO postgres WITH ADMIN FALSE, INHERIT FALSE, SET FALSE GRANTED BY postgres`);}
  const WINDOW=[LEDGER,...R053_OWNERS];

  // 1. Closed owner role: plan creates nothing; apply leaves a NOLOGIN NOINHERIT role whose only member is the runner, closed.
  for(const role of ['mw_ledger_owner_prod','mw_app_prod_journal_owner'])await assert.rejects(provisionClosedOwnerRole(operator,config,{role,apply:true}),/another environment/);
  const rolePlan=await provisionClosedOwnerRole(operator,config,{role:LEDGER});assert.equal(rolePlan.mode,'role-plan');assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[LEDGER])).rowCount,0);
  const role=await provisionClosedOwnerRole(operator,config,{role:LEDGER,apply:true});assert.equal(role.mode,'role-provisioned');assert.ok(role.roles[0].rolcanlogin===false&&role.roles[0].rolinherit===false);
  assert.ok(role.memberships.every(x=>x.member==='postgres'&&!x.inherit_option&&!x.set_option));
  await assert.rejects(provisionClosedOwnerRole(operator,config,{role:LEDGER,apply:true}),/already exists/);
  assert.deepEqual(await ledgerShape(admin),{runner_can_set:false,runner_inherits:false,owner_schema_create:false});

  // 2. Closed authority: V93 is refused by its preflight and nothing is recorded (transactional rollback).
  const refused=await flyway('migrate').then(()=>null,err=>err);assert.ok(refused,'V93 must not apply under the closed tuple');
  assert.match(refused.stdout+refused.stderr,/cannot SET ROLE mw_ledger_owner_dev|must be able to SET ROLE/);
  assert.deepEqual(await history(admin),{version:92,failed:0});
  assert.equal((await admin.query("SELECT pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid=to_regprocedure('public.sync_cash_ledger(text,text)')")).rows[0].owner,'postgres');

  // 3. Temporary authority: INHERIT/SET on the runner's tuple plus CREATE on public for the owner; tampered expectation refuses.
  const plan=await prepareOwnerAuthority(operator,config,{owners:WINDOW});assert.equal(plan.mode,'authority-plan');assert.equal(plan.restoreState.version,4);assert.deepEqual(plan.restoreState.owners,WINDOW);
  assert.equal(plan.statements.filter(x=>x.startsWith('GRANT CREATE ON SCHEMA public')).length,WINDOW.length);
  await assert.rejects(prepareOwnerAuthority(operator,config,{owners:WINDOW,apply:true,expectedRestoreState:{...plan.restoreState,version:99}}),/baseline changed/);
  assert.deepEqual(await ledgerShape(admin),{runner_can_set:false,runner_inherits:false,owner_schema_create:false});
  const prepared=await prepareOwnerAuthority(operator,config,{owners:WINDOW,apply:true,expectedRestoreState:plan.restoreState});assert.equal(prepared.mode,'authority-prepared');
  assert.deepEqual(await ledgerShape(admin),{runner_can_set:true,runner_inherits:true,owner_schema_create:true});
  await assert.rejects(prepareOwnerAuthority(operator,config,{owners:[LEDGER],apply:true}),/Closed owner authority baseline required/);
  const state=plan.restoreState;
  try{
   // 4. Migrate + validate as the non-superuser runner.
   const migrated=await flyway('migrate');assert.match(migrated.stdout,/"success"\s*:\s*true/);assert.deepEqual(await history(operator),{version:HEAD,failed:0});
   const validated=await flyway('validate');assert.match(validated.stdout,/"validationSuccessful"\s*:\s*true/);
   const fn=(await operator.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig FROM pg_proc WHERE oid=to_regprocedure('public.sync_cash_ledger(text,text)')")).rows[0];
   assert.equal(fn.owner,LEDGER);assert.equal(fn.prosecdef,true);assert.ok(fn.proconfig.includes('search_path=pg_catalog, public'));
   // V99 (R080): the content facts RPC is re-owned by the notify owner through the same temporary window.
   const content=(await operator.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig FROM pg_proc WHERE oid=to_regprocedure('public.pwa_notify_content_v1(uuid,bigint)')")).rows[0];
   assert.equal(content.owner,'mw_notify_owner_dev');assert.equal(content.prosecdef,true);assert.ok(content.proconfig.includes('search_path=pg_catalog, public'));
   // V100 (R081): replaced in place by the non-superuser runner (English name), owner and ACL kept; the owner reads "Description" by column grant.
   assert.match((await operator.query("SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.pwa_notify_content_v1(uuid,bigint)')")).rows[0].prosrc,/b\."Description"/);
   assert.deepEqual((await operator.query(`SELECT has_column_privilege('mw_notify_owner_dev','public."Borrowers"','Description','SELECT') c,has_table_privilege('mw_notify_owner_dev','public."Borrowers"','SELECT') t,has_function_privilege('mw_notify_dispatch_dev','public.pwa_notify_content_v1(uuid,bigint)','EXECUTE') d`)).rows[0],{c:true,t:false,d:true});
   // pg_stat_statements: the non-superuser runner cannot create the untrusted extension; V93 reports a NOTICE and continues.
   if((await admin.query("SELECT 1 FROM pg_available_extensions WHERE name='pg_stat_statements'")).rowCount)assert.equal((await admin.query("SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements'")).rowCount,0,'extension creation skipped under the nonsuperuser operator');
   // 5. Post-migrate reconciliation while authority is still open (the Invoke-Flyway hook order): zero violations, SELECT-only ledger.
   assert.deepEqual((await planApplicationRole(operator,{database:'loan_manager_dev',creators:['postgres']})).violations,[]);
   const hook=await runDevelopmentPostMigrationHook(operator,{database:'loan_manager_dev',creators:['postgres']},{environment:'development',command:'migrate',apply:true});assert.equal(hook.mode,'applied');assert.deepEqual(hook.violations,[]);
  }finally{const restored=await restoreOwnerAuthority(operator,config,state,{apply:true});assert.equal(restored.mode,'authority-restored');}
  // 6. Closed again; repeat is a no-op.
  assert.equal((await restoreOwnerAuthority(operator,config,state,{apply:true})).mode,'authority-already-restored');
  assert.deepEqual(await ledgerShape(admin),{runner_can_set:false,runner_inherits:false,owner_schema_create:false});
  for(const owner of WINDOW)assert.deepEqual((await operator.query("SELECT pg_has_role(current_user,$1,'SET') owner_set,pg_has_role(current_user,$1,'USAGE') owner_inherit,has_schema_privilege($1,'public','CREATE') schema_create",[owner])).rows[0],{owner_set:false,owner_inherit:false,schema_create:false});
  // Under the closed tuple the hook itself is refused (notify-owned tables), which is why the migrate window holds all three owners.
  await assert.rejects(runDevelopmentPostMigrationHook(operator,{database:'loan_manager_dev',creators:['postgres']},{environment:'development',command:'migrate',apply:true}),err=>err.code==='42501');
  assert.deepEqual((await admin.query("SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege('mw_app_dev','public.\"Cash Ledger\"',p)")).rows.map(x=>x.p),['SELECT'],'capability holds SELECT only on the ledger after the hook');
  assert.equal((await admin.query("SELECT has_function_privilege('mw_app_dev','public.sync_cash_ledger(text,text)','EXECUTE') b")).rows[0].b,true);
  assert.equal((await admin.query("SELECT has_function_privilege('mw_ledger_owner_dev','public.sync_cash_ledger(text,text)','EXECUTE') b")).rows[0].b,true);
  assert.deepEqual((await admin.query("SELECT p FROM unnest(ARRAY['INSERT','UPDATE','DELETE']) p WHERE has_table_privilege('mw_app_dev_journal_owner','public.\"Cash Ledger\"',p)")).rows.map(x=>x.p),['INSERT','UPDATE','DELETE']);

  // 7. Failure path: the authority is restored even when the guarded step throws.
  const again=await prepareOwnerAuthority(operator,config,{owners:[LEDGER]});await prepareOwnerAuthority(operator,config,{owners:[LEDGER],apply:true,expectedRestoreState:again.restoreState});
  await admin.query('ALTER ROLE '+LEDGER+' LOGIN');await assert.rejects(restoreOwnerAuthority(operator,config,again.restoreState,{apply:true}),/Closed owner roles/);await admin.query('ALTER ROLE '+LEDGER+' NOLOGIN');
  const failure=new Error('synthetic migration failure');await assert.rejects((async()=>{try{throw failure;}finally{await restoreOwnerAuthority(operator,config,again.restoreState,{apply:true});}})(),err=>err===failure);
  assert.equal((await restoreOwnerAuthority(operator,config,again.restoreState)).mode,'authority-already-restored');assert.deepEqual(await ledgerShape(admin),{runner_can_set:false,runner_inherits:false,owner_schema_create:false});
  // A no-op migrate at the head (the routine DEV runner call) needs no authority; nothing is re-applied.
  const rerun=await flyway('migrate');assert.match(rerun.stdout,/"success"\s*:\s*true/);assert.deepEqual(await history(operator),{version:HEAD,failed:0});

  // 8. Application-role write proof: every cash source syncs the ledger through the definer; direct writes stay denied.
  await admin.query((await readFile('scripts/database/Test-CashAccountFixtures.sql','utf8')).replace(/^\\set.*$/m,''));
  await admin.query(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('W4-B','Synthetic W4'); INSERT INTO "Partners"("Row ID","Partner Role") VALUES('W4-A','A'),('W4-PB','B');
   INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('W4-CA','W4-A',current_date-30,'Contribution',10000::money),('W4-CB','W4-PB',current_date-30,'Contribution',10000::money)`);
  await admin.query('CREATE ROLE c_w4_app_login LOGIN NOSUPERUSER NOBYPASSRLS; GRANT mw_app_dev TO c_w4_app_login WITH INHERIT TRUE, SET FALSE, ADMIN FALSE');
  const app=new pg.Client({...base,user:'c_w4_app_login'});await app.connect();
  try{
   await app.query(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES('CI-LISA','W4-L','W4-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false)`);
   await app.query(`UPDATE "Loans" SET "Principal Amount"=1200::money WHERE "Row ID"='W4-L'`);
   await app.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('W4-C','W4-L',current_date-2,100::money,10::money)`);
   await app.query(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES('CI-DAD','W4-P','Processing','W4-B',50::money,current_date,'Lump Sum')`);
   await app.query(`INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder") VALUES('W4-E',current_date-1,'Other',20::money,'CI-LISA','ch:lisa')`);
   await app.query(`INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder","Notes") VALUES('W4-I',current_date-2,'Other',(-200)::money,'CI-LISA','ch:lisa','synthetic income for settlement headroom')`);
   await app.query(`INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Ref Paid From Cash Account") VALUES('W4-S','W4-A',10::money,'Pending',current_date,'CI-LISA')`);
   await app.query(`UPDATE "Settlements" SET "Status"='Completed',"Transfer Date"=current_date WHERE "Row ID"='W4-S'`);
   assert.equal((await app.query(`SELECT "Status" FROM "Payments" WHERE "Row ID"='W4-P'`)).rows[0].Status,'Posted');
   assert.deepEqual((await app.query(`SELECT "Row ID" id,"Amount"::numeric::integer amount FROM "Cash Ledger" WHERE "Row ID" LIKE 'cash:%W4-%' ORDER BY 1`)).rows,[
    {id:'cash:EXPENSE:W4-E',amount:20},{id:'cash:EXPENSE:W4-I',amount:200},{id:'cash:LOAN:W4-L',amount:1200},{id:'cash:PAYMENT:W4-P',amount:50},{id:'cash:SETTLEMENT:W4-S',amount:10}]);
   for(const sql of [`INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder") VALUES('x',current_date,'Cash Handover',1,'ch:dad','ch:lisa')`,`UPDATE "Cash Ledger" SET "Amount"=1`,`DELETE FROM "Cash Ledger"`])await assert.rejects(app.query(sql),err=>err.code==='42501');
   await assert.rejects(app.query("SELECT public.sync_cash_ledger('Loan','W4-L')"),/requires a source trigger/);
   // V97: the same writes reach the change log through mw_changes_owner_dev's definer; the capability reads it only.
   const changes=(await app.query(`SELECT table_name,row_key FROM public.pwa_row_changes WHERE row_key IN ('W4-L','W4-C','W4-P','W4-E','W4-I','W4-S','cash:LOAN:W4-L') GROUP BY 1,2 ORDER BY 1,2`)).rows.map(x=>x.table_name+':'+x.row_key);
   for(const key of ['Business Expenses:W4-E','Business Expenses:W4-I','Cash Ledger:cash:LOAN:W4-L','Charges:W4-C','Loans:W4-L','Payments:W4-P','Settlements:W4-S'])assert.ok(changes.includes(key),key+' in '+changes.join(','));
   // Cash Statement Context (keyed by "Ref Partner", seeded by the Partners trigger) and Loan Assessment SQL Lab are tracked too.
   assert.equal((await app.query(`SELECT count(*)::int n FROM public.pwa_row_changes WHERE table_name='Cash Statement Context' AND row_key='W4-A'`)).rows[0].n>0,true);
   assert.deepEqual((await admin.query(`SELECT tgname,tgenabled,count(*)::int n FROM pg_trigger WHERE tgname IN ('zzzzzzz_pwa_row_change','zzzzzzz_pwa_row_truncate') GROUP BY 1,2 ORDER BY 1`)).rows,
    [{tgname:'zzzzzzz_pwa_row_change',tgenabled:'A',n:19},{tgname:'zzzzzzz_pwa_row_truncate',tgenabled:'A',n:19}],'19 ALWAYS row triggers and 19 ALWAYS truncate markers');
   for(const sql of [`INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES('Loans','x')`,`UPDATE public.pwa_row_changes SET row_key='x'`,`DELETE FROM public.pwa_row_changes`,`SELECT public.pwa_row_changes_prune_v1()`])await assert.rejects(app.query(sql),err=>err.code==='42501',sql);
  }finally{await app.end();}
 }finally{if(operator)operator.release();await operatorPool.end();await admin.end();}
});
