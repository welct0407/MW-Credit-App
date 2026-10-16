// Prerequisite operator CLI: DEV application supported; PROD review plans only.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import pg from 'pg';
import {prepareApplicationRoles,finalizeApplicationRoleProvisioning,cleanupTemporaryApplicationRoleAuthority,prepareExistingApplicationRoleMaintenance,restoreExistingApplicationRoleMaintenance} from './application-role-provisioning.mjs';
import {prepareGroupedOwnerMaintenance,restoreGroupedOwnerMaintenance} from './grouped-owner-maintenance.mjs';
const repo=path.resolve(import.meta.dirname,'../..'),privateRoot=path.resolve('C:/Users/ideaadmin/Documents/ChatGPT/AppSheet-Loan-Project/flyway');
const args=process.argv.slice(2),flags=[],options={};
for(let i=0;i<args.length;i++){if(['--recovery-file','--environment','--creator-file'].includes(args[i])&&args[i+1]&&!args[i+1].startsWith('--')){const key=args[i];if(options[key])throw Error('Duplicate provisioning option');options[key]=args[++i];}else if(['--prepare','--finalize','--cleanup','--maintenance','--restore-maintenance','--grouped-maintenance','--restore-grouped-maintenance','--apply'].includes(args[i]))flags.push(args[i]);else throw Error('Unknown provisioning option');}
options.recoveryFile=options['--recovery-file'];
const environment=options['--environment']??'development';if(!['development','production'].includes(environment))throw Error('Explicit maintained environment required');
if(environment==='production'&&flags.includes('--apply'))throw Error('Production role changes are not authorized; review plan only');
if(environment==='production'&&!options['--creator-file'])throw Error('Separately reviewed private PROD creator/grantor registry required');
if(new Set(flags).size!==flags.length||flags.filter(x=>x!=='--apply').length>1)throw Error('One provisioning action required');
const external=p=>{const x=path.resolve(p);if(!x.startsWith(privateRoot+path.sep))throw Error('Private recovery file required');return x;};
if(['DATABASE_URL','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE'].some(k=>process.env[k]))throw Error('Remove ambient database overrides');
const all=JSON.parse(fs.readFileSync(path.join(repo,'database/environments.json'),'utf8').replace(/^\uFEFF/,'')),x=all[environment];
if(x.instance!=='mw-credit-pg-20261017'||x.host!=='TO_FILL_AFTER_CREATE_HOST'||x.port!==5432||x.database!==(environment==='production'?'loan_manager_prod':'loan_manager_dev')||x.user!=='postgres'||all.production.database===all.development.database)throw Error('Wrong environment operator tuple');
const credential=path.resolve(x.passwordFile);if(!credential.startsWith(path.resolve('C:/Users/ideaadmin/Documents/ChatGPT')+path.sep))throw Error('Private credential path required');
const config=JSON.parse(fs.readFileSync(options['--creator-file']?external(options['--creator-file']):path.join(repo,'database/application-role-creators.json'),'utf8'));if(config.database!==x.database)throw Error('Wrong registered creator database');
const c=new pg.Client({host:x.host,port:x.port,database:x.database,user:x.user,password:fs.readFileSync(credential,'utf8').trim(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,application_name:'mw-dev-role-prerequisites'});
async function snapshot(){return {capturedAt:new Date().toISOString(),database:x.database,roles:(await c.query('SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles ORDER BY oid')).rows,memberships:(await c.query('SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member')).rows,schemas:(await c.query("SELECT oid,nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname IN ('public','assessment_lab')")).rows,relations:(await c.query("SELECT oid,relname,relowner,relacl::text FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY oid")).rows,routines:(await c.query("SELECT oid,oid::regprocedure::text signature,proowner,prosecdef,proconfig,proacl::text FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY oid")).rows,columns:(await c.query("SELECT attrelid,attnum,attname,attacl::text FROM pg_attribute WHERE attrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND attnum>0 AND NOT attisdropped ORDER BY attrelid,attnum")).rows,defaults:(await c.query('SELECT oid,defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY oid')).rows};}
await c.connect();let file;
try{
 if(environment==='production')await c.query("SET default_transaction_read_only=on; SET statement_timeout='15s'; SET lock_timeout='5s'");
 const actual=(await c.query('SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port')).rows[0];if(actual.db!==x.database||actual.host!==x.host||actual.port!==x.port)throw Error('Actual DEV tuple mismatch');
 await c.query('SELECT pg_advisory_lock(1052026,4)');
 const apply=flags.includes('--apply'),action=flags.includes('--grouped-maintenance')?'grouped-maintenance':flags.includes('--restore-grouped-maintenance')?'restore-grouped-maintenance':flags.includes('--maintenance')?'maintenance':flags.includes('--restore-maintenance')?'restore-maintenance':flags.includes('--cleanup')?'cleanup':flags.includes('--finalize')?'finalize':'prepare';
 let before,result;
 if(action==='grouped-maintenance'||action==='restore-grouped-maintenance'){
  if(environment!=='production')throw Error('Grouped authority is exclusively a PROD preparation plan');
  if(action==='grouped-maintenance')result=await prepareGroupedOwnerMaintenance(c,config,{apply:false});
  else{if(!options.recoveryFile)throw Error('Exact grouped restoration state required');const saved=JSON.parse(fs.readFileSync(external(options.recoveryFile),'utf8'));result=await restoreGroupedOwnerMaintenance(c,config,saved.restoreState,{apply:false});}
 }else if(action==='restore-maintenance'){
  if(!options.recoveryFile)throw Error('Maintenance restoration file required');
  const saved=JSON.parse(fs.readFileSync(external(options.recoveryFile),'utf8'));
  if(saved.action!=='maintenance'||!saved.restoreState)throw Error('Exact maintenance recovery state missing');
  result=await restoreExistingApplicationRoleMaintenance(c,config,saved.restoreState,{apply});
  if(apply)fs.writeFileSync(external(options.recoveryFile),JSON.stringify({...saved,restoration:result,restoredSnapshot:await snapshot()},null,2));
 }else{
  const plan=action==='maintenance'?await prepareExistingApplicationRoleMaintenance(c,config,{apply:false}):null;
  if(apply){before=await snapshot();fs.mkdirSync(privateRoot,{recursive:true});file=options.recoveryFile?external(options.recoveryFile):path.join(privateRoot,'application-prerequisites-'+randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify({version:1,action,before,...(plan?{restoreState:plan.restoreState}:{})},null,2),{flag:'wx'});}
  if(action==='maintenance')result=apply?await prepareExistingApplicationRoleMaintenance(c,config,{apply:true,expectedRestoreState:plan.restoreState}):plan;
  else result=await (action==='prepare'?prepareApplicationRoles:action==='finalize'?finalizeApplicationRoleProvisioning:cleanupTemporaryApplicationRoleAuthority)(c,config,{apply});
  if(file)fs.writeFileSync(file,JSON.stringify({version:1,action,before,...(plan?{restoreState:plan.restoreState}:{}),after:await snapshot(),result},null,2));
 }
 console.log(JSON.stringify({...result,privateRecoverySnapshot:file??null}));
}finally{await c.query('SELECT pg_advisory_unlock(1052026,4)').catch(()=>{});await c.end();}

