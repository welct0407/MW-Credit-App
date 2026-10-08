// DEV-only prerequisite operator CLI: dry plan by default; private before/after evidence.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import pg from 'pg';
import {prepareApplicationRoles,finalizeApplicationRoleProvisioning,cleanupTemporaryApplicationRoleAuthority} from './application-role-provisioning.mjs';
const repo=path.resolve(import.meta.dirname,'../..'),privateRoot=path.resolve('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway');
const args=process.argv.slice(2);if(args.some(a=>!['--prepare','--finalize','--cleanup','--apply'].includes(a))||new Set(args).size!==args.length||args.filter(x=>['--prepare','--finalize','--cleanup'].includes(x)).length>1)throw Error('Use --prepare, --finalize or --cleanup and optional --apply');
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
 const apply=args.includes('--apply'),action=args.includes('--cleanup')?'cleanup':args.includes('--finalize')?'finalize':'prepare';
 let before;if(apply){before=await snapshot();fs.mkdirSync(privateRoot,{recursive:true});file=path.join(privateRoot,'application-prerequisites-'+randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify({version:1,action,before},null,2),{flag:'wx'});}
 const result=await (action==='prepare'?prepareApplicationRoles:action==='finalize'?finalizeApplicationRoleProvisioning:cleanupTemporaryApplicationRoleAuthority)(c,config,{apply});
 if(file)fs.writeFileSync(file,JSON.stringify({version:1,action,before,after:await snapshot()},null,2));
 console.log(JSON.stringify({...result,privateRecoverySnapshot:file??null}));
}finally{await c.query('SELECT pg_advisory_unlock(1052026,4)').catch(()=>{});await c.end();}

