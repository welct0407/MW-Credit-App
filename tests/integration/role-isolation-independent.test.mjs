import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {realpath,readFile} from 'node:fs/promises';
import {basename,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';

async function fixture(){
 const e=process.env;
 if(e.PHASE8_TEST_DISPOSABLE!=='1'||e.PHASE8_TEST_HOST!=='127.0.0.1'||e.PHASE8_TEST_DATABASE!=='loan_manager_dev')throw Error('Owned loopback fixture required');
 const d=await realpath(e.PHASE8_TEST_DATA_DIRECTORY);
 if(basename(d)!=='data'||!/^mw-phase8-[a-f0-9]{32}$/.test(basename(dirname(d))))throw Error('Owned marker required');
 assert.equal(Number((await readFile(d+'/postmaster.pid','utf8')).split(/\r?\n/)[3]),Number(e.PHASE8_TEST_PORT));
 return new pg.Pool({host:'127.0.0.1',port:Number(e.PHASE8_TEST_PORT),user:'postgres',database:'loan_manager_prod',max:3});
}
function migrate(){
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"& $env:PHASE8_TEST_FLYWAY_PATH '-outputType=json' '-target=87' '-group=true' '-mixed=false' '-executeInTransaction=true' migrate; exit $LASTEXITCODE"],{cwd:process.env.PHASE8_TEST_REPOSITORY,windowsHide:true,env:process.env});
 let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
 return new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,output}));});
}
async function fingerprint(p){return(await p.query(`SELECT jsonb_build_object(
 'history',(SELECT jsonb_agg(jsonb_build_array(version,script,checksum,success) ORDER BY installed_rank) FROM public.flyway_schema_history),
 'relations',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relowner,c.relacl::text) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','assessment_lab')),
 'functions',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,oidvectortypes(p.proargtypes),p.proowner,p.proacl::text,pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','assessment_lab') AND p.prokind='f')) AS value`)).rows[0].value;}

test('actual grouped77→87 failure rolls back and observer sees no intermediate grants',async()=>{
 const p=await fixture();const lock=await p.connect();let released=false;
 try{
  assert.equal((await p.query('SELECT max(version::int) AS v FROM flyway_schema_history')).rows[0].v,77);
  const before=await fingerprint(p);
  await p.query('ALTER ROLE mw_app_prod LOGIN');
  const failed=await migrate();assert.notEqual(failed.code,0);assert.match(failed.output,/Missing or unsafe application role/);
  await p.query('ALTER ROLE mw_app_prod NOLOGIN');
  assert.deepEqual(await fingerprint(p),before,'whole pending range and ACLs roll back to77');
  assert.equal((await p.query("SELECT to_regclass('public.pwa_notification_events') AS r")).rows[0].r,null);
  // Fixture-only latch: unchanged migration bytes stop after creating the V86 job table.
  await p.query(`CREATE FUNCTION public.c_group_latch() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN
   IF EXISTS(SELECT 1 FROM pg_event_trigger_ddl_commands() WHERE object_identity='public.pwa_job_runs') THEN PERFORM pg_advisory_xact_lock(871103); END IF;
  END $$; CREATE EVENT TRIGGER c_group_latch ON ddl_command_end WHEN TAG IN('CREATE TABLE') EXECUTE FUNCTION public.c_group_latch()`);
  await lock.query('SELECT pg_advisory_lock(871103)');
  const running=migrate();
  const deadline=Date.now()+30000;let waiting=false;
  while(Date.now()<deadline){waiting=(await p.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=871103 AND NOT granted) AS waiting")).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(waiting,true,'actual Flyway transaction reaches deterministic latch');
  assert.equal((await p.query('SELECT max(version::int) AS v FROM flyway_schema_history')).rows[0].v,77);
  assert.equal((await p.query("SELECT to_regclass('public.pwa_notification_events') AS r")).rows[0].r,null);
  assert.equal((await p.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname IN('pwa_command_status_v1','pwa_submit_operation_v2')")).rows[0].n,0);
  await lock.query('SELECT pg_advisory_unlock(871103)');released=true;
  const success=await running;assert.equal(success.code,0,success.output);
  assert.equal((await p.query('SELECT max(version::int) AS v FROM flyway_schema_history')).rows[0].v,87);
  await p.query('DROP EVENT TRIGGER c_group_latch; DROP FUNCTION public.c_group_latch()');
 }finally{if(!released)await lock.query('SELECT pg_advisory_unlock(871103)');lock.release();await p.end();}
});

test('mapped nonsuperuser sessions reject cross-environment and direct owner/journal bypass',async()=>{
 const p=await fixture();const peers=[];
 try{
  for(const database of ['loan_manager_dev','loan_manager_prod']){
   const c=new pg.Client({host:'127.0.0.1',port:Number(process.env.PHASE8_TEST_PORT),user:'postgres',database});await c.connect();
   try{assert.equal((await reconcileApplicationRole(c,{database,creators:['postgres']},{apply:true})).violations.length,0);}finally{await c.end();}
  }
  await p.query('CREATE ROLE c_dev_command LOGIN; CREATE ROLE c_prod_reader LOGIN; CREATE ROLE c_unrelated LOGIN; GRANT mw_app_dev TO c_dev_command WITH INHERIT TRUE, SET FALSE, ADMIN FALSE');
  const open=async(user,database)=>{const c=new pg.Client({host:'127.0.0.1',port:Number(process.env.PHASE8_TEST_PORT),user,database});await c.connect();peers.push(c);return c;};
  const denied=async(c,sql,params)=>assert.rejects(c.query(sql,params),e=>e.code==='42501');
  const command=await open('mw-credit-app-command-prod@clever-oasis-508610-n7.iam','loan_manager_prod');
  const dev=await open('c_dev_command','loan_manager_dev');
  const cross=await open('c_dev_command','loan_manager_prod');
  const reader=await open('c_prod_reader','loan_manager_prod');
  const other=await open('c_unrelated','loan_manager_prod');
  const status="SELECT public.pwa_command_status_v1('00000000-0000-4000-8000-000000000001','synthetic-issuer','synthetic-user') AS result";
  assert.deepEqual((await command.query(status)).rows[0].result,{kind:'unresolved'});
  assert.deepEqual((await dev.query(status)).rows[0].result,{kind:'unresolved'});
  for(const c of [cross,reader,other])await denied(c,status);
  await command.query("SET search_path=pg_temp,public; SET mw.environment='dev'; SET mw.actor_login_email='spoof@example.invalid'");
  await denied(command,'SET ROLE mw_app_prod_journal_owner');
  await denied(command,"SELECT public.pwa_apply_loan_create_v2('{}')");
  for(const sql of ['DELETE FROM public.pwa_payment_commands','TRUNCATE public.pwa_payment_commands','UPDATE public.pwa_payment_commands SET request_id=request_id','SELECT * FROM public.pwa_push_subscriptions','DELETE FROM public.pwa_notification_deliveries'])await denied(command,sql);
 }finally{for(const c of peers)await c.end();await p.end();}
});

test('CONNECT revoke blocks new DEV sessions but preserves and exposes existing sessions',async()=>{
 const p=await fixture();const options=user=>({host:'127.0.0.1',port:Number(process.env.PHASE8_TEST_PORT),user,database:'loan_manager_prod'});
 const existing=new pg.Client(options('c_dev_command'));let consumer;
 try{
  await existing.connect();const pid=(await existing.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  assert.equal((await p.query("SELECT has_database_privilege('c_dev_command','loan_manager_prod','CONNECT') AS yes")).rows[0].yes,true);
  await p.query('REVOKE CONNECT ON DATABASE loan_manager_prod FROM PUBLIC; GRANT CONNECT ON DATABASE loan_manager_prod TO c_prod_reader');
  assert.equal((await p.query("SELECT has_database_privilege('c_dev_command','loan_manager_prod','CONNECT') AS yes")).rows[0].yes,false);
  const blocked=new pg.Client(options('c_dev_command'));try{await assert.rejects(blocked.connect(),e=>e.code==='42501');}finally{await blocked.end();}
  assert.equal((await existing.query('SELECT 1 AS alive')).rows[0].alive,1);
  assert.equal((await p.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=$1 AND datname=\'loan_manager_prod\'',[pid])).rows[0].n,1,'old session requires explicit preflight containment');
  consumer=new pg.Client(options('c_prod_reader'));await consumer.connect();assert.equal((await consumer.query('SELECT 1 AS alive')).rows[0].alive,1);
 }finally{await existing.end();if(consumer)await consumer.end();await p.end();}
});

test('nonsuperuser ownership transfer requires exact SET and schema CREATE then restores temporary grants',async()=>{
 const p=await fixture();let operator;
 try{
  await p.query('CREATE ROLE c_transfer_operator LOGIN; GRANT CONNECT ON DATABASE loan_manager_prod TO c_transfer_operator; GRANT USAGE,CREATE ON SCHEMA public TO c_transfer_operator');
  const sentinel=(await p.query("SELECT member,roleid,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY member,roleid,grantor")).rows;
  operator=new pg.Client({host:'127.0.0.1',port:Number(process.env.PHASE8_TEST_PORT),user:'c_transfer_operator',database:'loan_manager_prod'});await operator.connect();
  assert.equal((await operator.query('SELECT rolsuper FROM pg_roles WHERE rolname=session_user')).rows[0].rolsuper,false);
  await operator.query('CREATE FUNCTION public.c_transfer_probe() RETURNS int LANGUAGE sql AS \'SELECT 1\'');
  await assert.rejects(operator.query('ALTER FUNCTION public.c_transfer_probe() OWNER TO mw_app_prod_journal_owner'),e=>e.code==='42501');
  await p.query('GRANT mw_app_prod_journal_owner TO c_transfer_operator WITH INHERIT FALSE, SET TRUE, ADMIN FALSE');
  await assert.rejects(operator.query('ALTER FUNCTION public.c_transfer_probe() OWNER TO mw_app_prod_journal_owner'),e=>e.code==='42501');
  await p.query('GRANT CREATE ON SCHEMA public TO mw_app_prod_journal_owner');
  await operator.query('ALTER FUNCTION public.c_transfer_probe() OWNER TO mw_app_prod_journal_owner');
  assert.equal((await p.query("SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='public.c_transfer_probe()'::regprocedure")).rows[0].owner,'mw_app_prod_journal_owner');
  await p.query('REVOKE CREATE ON SCHEMA public FROM mw_app_prod_journal_owner; REVOKE mw_app_prod_journal_owner FROM c_transfer_operator; DROP FUNCTION public.c_transfer_probe()');
  assert.deepEqual((await p.query('SELECT member,roleid,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY member,roleid,grantor')).rows,sentinel);
  assert.equal((await p.query("SELECT has_schema_privilege('mw_app_prod_journal_owner','public','CREATE') AS allowed")).rows[0].allowed,false);
 }finally{if(operator)await operator.end();await p.end();}
});
