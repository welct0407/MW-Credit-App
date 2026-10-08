// DEV-only prerequisite operator CLI: dry plan by default; private before/after evidence.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import pg from 'pg';
import {prepareApplicationRoles,finalizeApplicationRoleProvisioning,cleanupTemporaryApplicationRoleAuthority,prepareExistingApplicationRoleMaintenance,restoreExistingApplicationRoleMaintenance} from './application-role-provisioning.mjs';
const repo=path.resolve(import.meta.dirname,'../..'),privateRoot=path.resolve('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway');
const args=process.argv.slice(2),flags=[],options={};
for(let i=0;i<args.length;i++){if(args[i]==='--recovery-file'&&args[i+1]&&!args[i+1].startsWith('--'))options.recoveryFile=args[++i];else if(['--prepare','--finalize','--cleanup','--maintenance','--restore-maintenance','--apply'].includes(args[i]))flags.push(args[i]);else throw Error('Unknown provisioning option');}
if(new Set(flags).size!==flags.length||flags.filter(x=>x!=='--apply').length>1)throw Error('One provisioning action required');
const external=p=>{const x=path.resolve(p);if(!x.startsWith(privateRoot+path.sep))throw Error('Private recovery file required');return x;};
if(['DATABASE_URL','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE'].some(k=>process.env[k]))throw Error('Remove ambient database overrides');
const all=JSON.parse(fs.readFileSync(path.join(repo,'database/environments.json'),'utf8').replace(/^\uFEFF/,'')),x=all.development;
if(x.instance!=='appsheet-pg-prod-20260914'||x.host!=='34.21.174.215'||x.port!==5432||x.database!=='loan_manager_dev'||x.user!=='postgres'||all.production.database===x.database)throw Error('Wrong DEV operator tuple');
const credential=path.resolve(x.passwordFile);if(!credential.startsWith(path.resolve('C:/Users/MWCredit/Documents/ChatGPT')+path.sep))throw Error('Private credential path required');
const config=JSON.parse(fs.readFileSync(path.join(repo,'database/application-role-creators.json'),'utf8'));if(config.database!==x.database)throw Error('Wrong registered creator database');
const c=new pg.Client({host:x.host,port:x.port,database:x.database,user:x.user,password:fs.readFileSync(credential,'utf8').trim(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,application_name:'mw-dev-role-prerequisites'});
async function snapshot(){return {capturedAt:new Date().toISOString(),database:x.database,roles:(await c.query('SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles ORDER BY oid')).rows,memberships:(await c.query('SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member')).rows,schemas:(await c.query("SELECT oid,nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname='public'")).rows,relations:(await c.query("SELECT oid,relname,relowner,relacl::text FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY oid")).rows,routines:(await c.query("SELECT oid,oid::regprocedure::text signature,proowner,prosecdef,proconfig,proacl::text FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY oid")).rows,columns:(await c.query("SELECT attrelid,attnum,attname,attacl::text FROM pg_attribute WHERE attrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND attnum>0 AND NOT attisdropped ORDER BY attrelid,attnum")).rows,defaults:(await c.query('SELECT oid,defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY oid')).rows};}
await c.connect();let file;
try{
 const actual=(await c.query('SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port')).rows[0];if(actual.db!==x.database||actual.host!==x.host||actual.port!==x.port)throw Error('Actual DEV tuple mismatch');
 await c.query('SELECT pg_advisory_lock(1052026,4)');
 const apply=flags.includes('--apply'),action=flags.includes('--maintenance')?'maintenance':flags.includes('--restore-maintenance')?'restore-maintenance':flags.includes('--cleanup')?'cleanup':flags.includes('--finalize')?'finalize':'prepare';
 let before,result;
 if(action==='restore-maintenance'){
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

