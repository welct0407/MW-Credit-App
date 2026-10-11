import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {realpath,readFile,writeFile} from 'node:fs/promises';
import {basename,dirname} from 'node:path';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';

test('actual V87 canonical job dependency catalogue',async()=>{
 const e=process.env;if(e.PHASE8_TEST_DISPOSABLE!=='1'||e.PHASE8_TEST_HOST!=='127.0.0.1'||e.PHASE8_TEST_DATABASE!=='loan_manager_dev')throw Error('Owned named fixture required');
 const d=await realpath(e.PHASE8_TEST_DATA_DIRECTORY);assert.equal(basename(d),'data');assert.match(basename(dirname(d)),/^mw-phase8-[a-f0-9]{32}$/);assert.equal(Number((await readFile(d+'/postmaster.pid','utf8')).split(/\r?\n/)[3]),Number(e.PHASE8_TEST_PORT));
 const pool=new pg.Pool({host:e.PHASE8_TEST_HOST,port:Number(e.PHASE8_TEST_PORT),database:e.PHASE8_TEST_DATABASE,user:'postgres'});
 try{
  assert.equal((await pool.query('SELECT max(version::int) n FROM public.flyway_schema_history WHERE success')).rows[0].n,87);
  const functions=(await pool.query(`SELECT p.oid::regprocedure::text signature,n.nspname schema,p.proname name,p.prosecdef definer,pg_get_userbyid(p.proowner) owner,p.proconfig configuration,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','agent_audit') AND p.prokind='f' ORDER BY signature`)).rows;
  const triggers=(await pool.query(`SELECT c.relname relation,t.tgname name,t.tgenabled enabled,t.tgdeferrable deferrable,t.tginitdeferred initially_deferred,p.proname function_name,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
  const selected=new Set(['generate_due_charges','generate_loan_charge','refresh_daily_analytics','refresh_daily_analytics_scoped']),writes=new Set();
  let changed=true;while(changed){changed=false;for(const f of functions.filter(x=>selected.has(x.name))){for(const m of f.definition.matchAll(/public\.([a-z_][a-z_0-9]*)\s*\(/gi)){if(functions.some(x=>x.name===m[1])&&!selected.has(m[1])){selected.add(m[1]);changed=true;}}
   for(const m of f.definition.matchAll(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?(?:"([^"]+)"|([a-z_][a-z_0-9]*))/gi)){const name=m[1]??m[2];if(!writes.has(name)){writes.add(name);changed=true;}}
  }for(const t of triggers.filter(x=>writes.has(x.relation))){if(!selected.has(t.function_name)){selected.add(t.function_name);changed=true;}}}
  const relations=(await pool.query(`SELECT c.relname name,c.relkind kind,c.relrowsecurity rls,c.relforcerowsecurity forced_rls,CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m') ORDER BY c.relname`)).rows;
  const report={version:87,method:'Actual catalogue plus lexical overapproximation: branches, dynamic SQL and unqualified references require manual review; this is NOT a grant allowlist',roots:['generate_due_charges','refresh_daily_analytics'],writes:[...writes].filter(x=>relations.some(r=>r.name===x)).sort(),functions:functions.filter(x=>selected.has(x.name)),triggers:triggers.filter(x=>writes.has(x.relation)),relations};
  assert.ok(report.functions.some(x=>x.name==='generate_loan_charge'));assert.ok(report.triggers.some(x=>x.relation==='Charges'));assert.ok(report.functions.some(x=>x.name==='refresh_daily_analytics_scoped'));
  await writeFile('outputs/r053-notifications-jobs/v87-jobs-catalogue.json',JSON.stringify(report,null,2)+'\n');
  console.log('Job dependency functions:',report.functions.map(x=>x.name).join(', '));console.log('Writes and trigger expansion:',report.writes.join(', '));
 }finally{await pool.end();}
});

test('restricted jobs owner canonical charge and analytics dependency proof',async()=>{
 const e=process.env;assert.equal(e.PHASE8_TEST_DISPOSABLE,'1');assert.equal(e.PHASE8_TEST_HOST,'127.0.0.1');assert.equal(e.PHASE8_TEST_DATABASE,'loan_manager_dev');
 const options={host:e.PHASE8_TEST_HOST,port:Number(e.PHASE8_TEST_PORT),database:e.PHASE8_TEST_DATABASE},admin=new pg.Pool({...options,user:'postgres'}),runtime=new pg.Pool({...options,user:'c_jobs_runtime'});
 try{
  const fixture=await seedPaymentFixture(admin,'C-R053-JOBS');
  const date=(await admin.query("SELECT (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text d")).rows[0].d;
  await admin.query(`UPDATE public."Loans" SET "Auto Charge Enabled"=true,"Due Date"=$1::date,"Fixed Interest"=25::money WHERE "Row ID"=$2`,[date,fixture.loanIds[0]]);
  await admin.query(`CREATE ROLE c_jobs_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE c_jobs_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO c_jobs_owner,c_jobs_runtime`);
  const reads=['Borrowers','Loans','Charges','Repayments','Cash Pool Contributions','Partners','Business Expenses','Settlements','Cash Ledger','Cash Accounts','r008_cash_account_cutover','olap_repayments_analytics','Daily Analytics','Cash Account Daily Analytics'];
  for(const name of reads)await admin.query(`GRANT SELECT ON public."${name}" TO c_jobs_owner`);
  await admin.query(`GRANT UPDATE("Row ID") ON public."Borrowers",public."Loans",public."Charges" TO c_jobs_owner; GRANT INSERT("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") ON public."Charges" TO c_jobs_owner; GRANT INSERT,UPDATE ON public."Daily Analytics",public."Cash Account Daily Analytics" TO c_jobs_owner`);
  await admin.query(`CREATE FUNCTION public.c_jobs_dependency_probe(kind text,d date,loan text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$BEGIN IF kind='charges' THEN RETURN public.generate_due_charges(d,ARRAY[loan]); ELSIF kind='analytics' THEN RETURN public.refresh_daily_analytics(d-1,d); ELSE RAISE EXCEPTION 'invalid fixture operation'; END IF; END$$; ALTER FUNCTION public.c_jobs_dependency_probe(text,date,text) OWNER TO c_jobs_owner; REVOKE ALL ON FUNCTION public.c_jobs_dependency_probe(text,date,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.c_jobs_dependency_probe(text,date,text) TO c_jobs_runtime`);
  assert.equal((await admin.query("SELECT pg_has_role('c_jobs_runtime','c_jobs_owner','MEMBER') b")).rows[0].b,false);
  const snapshot=async(c)=>(await c.query(`SELECT 'portfolio' kind,to_jsonb(t)-'Generated At' value FROM public."Daily Analytics" t UNION ALL SELECT 'account',to_jsonb(t)-'Generated At' FROM public."Cash Account Daily Analytics" t ORDER BY kind,value`)).rows;
  const baseline=await admin.connect();let expectedCharges,expectedAnalytics;
  try{await baseline.query('BEGIN');await baseline.query('SELECT public.refresh_daily_analytics($1::date-1,$1::date)',[date]);await baseline.query('SELECT public.generate_due_charges($1::date,ARRAY[$2]::text[])',[date,fixture.loanIds[0]]);await baseline.query('SET CONSTRAINTS ALL IMMEDIATE');expectedCharges=(await baseline.query('SELECT to_jsonb(c) value FROM public."Charges" c WHERE "Ref Loans"=$1 ORDER BY "Row ID"',[fixture.loanIds[0]])).rows;expectedAnalytics=await snapshot(baseline);await baseline.query('ROLLBACK');}finally{baseline.release();}
  await runtime.query('SELECT public.c_jobs_dependency_probe($1,$2::date,$3)',['analytics',date,fixture.loanIds[0]]);
  assert.equal((await runtime.query('SELECT public.c_jobs_dependency_probe($1,$2::date,$3) n',['charges',date,fixture.loanIds[0]])).rows[0].n,1);
  assert.deepEqual((await admin.query('SELECT to_jsonb(c) value FROM public."Charges" c WHERE "Ref Loans"=$1 ORDER BY "Row ID"',[fixture.loanIds[0]])).rows,expectedCharges);
  assert.deepEqual(await snapshot(admin),expectedAnalytics);
  assert.equal((await runtime.query('SELECT public.c_jobs_dependency_probe($1,$2::date,$3) n',['charges',date,fixture.loanIds[0]])).rows[0].n,0);
  for(const sql of ['SELECT * FROM public."Charges"','UPDATE public."Loans" SET "Principal Amount"=0::money','TRUNCATE public.pwa_job_runs','SET ROLE c_jobs_owner'])await assert.rejects(runtime.query(sql),err=>err.code==='42501');
  await writeFile('outputs/r053-notifications-jobs/v87-jobs-restricted-grants.json',JSON.stringify({version:87,scope:'Measured fixed-date charge and yesterday/today analytics plus real statement/deferred commit triggers; V88 RPC/boundary/replay tests still pending',select:reads,lockUpdate:['Borrowers.Row ID','Loans.Row ID','Charges.Row ID'],chargeInsert:['Row ID','Ref Loans','Charge Date','Principal Due','Interest Due'],analyticsInsertUpdate:['Daily Analytics','Cash Account Daily Analytics'],runtime:'EXECUTE fixture-only fixed probe; no table grants/owner membership',result:'passed'},null,2)+'\n');
 }finally{await runtime.end();await admin.end();}
});
