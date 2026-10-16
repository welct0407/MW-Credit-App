// Maintained DEV administrator CLI. Never accepts DSN, host, credentials or PROD.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { randomUUID } from 'node:crypto';import pg from 'pg';
import { captureApplicationRoleSnapshot, recoverApplicationRole, provisionApplicationRuntimeMembership, runDevelopmentPostMigrationHook } from './application-role-tooling.mjs';
import { reconcileApplicationRole } from './app-role-policy.mjs';
// Windows VM-01: direct TLS to the instance with the Documents/ChatGPT credential. Linux cloud session: the
// IAP tunnel (scripts/database/cloud-db-tunnel.sh) to the Debian host's Auth Proxy and the 0600 admin
// credential written by `Get-DbEnvironment development -Admin` (Common.ps1); the server-side identity
// check below (inet_server_addr) stays the same on both routes.
const windows=process.platform==='win32',repo=path.resolve(import.meta.dirname,'../..');
const privateBase=windows?path.resolve('C:/Users/ideaadmin/Documents/ChatGPT'):path.resolve(process.env.MW_PRIVATE_ROOT||path.join(os.homedir(),'.mw-private'));
const privateRoot=path.join(privateBase,'AppSheet-Loan-Project/flyway');
const argv=process.argv.slice(2),options={};for(let i=0;i<argv.length;i++){const key=argv[i];if(['--apply','--if-present'].includes(key))options[key]=true;else if(['--action','--runtime-user','--recovery-file'].includes(key)&&argv[i+1]&&!argv[i+1].startsWith('--'))options[key]=argv[++i];else throw Error('Unknown or incomplete administration option');}
const action=options['--action']??'plan';if(!['plan','reconcile','membership','recover','post-migrate'].includes(action)||action==='plan'&&options['--apply'])throw Error('Invalid administration action');
const external=p=>{const result=path.resolve(p);if(!result.startsWith(privateRoot+path.sep))throw Error('Recovery evidence must remain in maintained private root');return result;};
const cfg=JSON.parse(fs.readFileSync(path.join(repo,'database/environments.json'),'utf8').replace(/^\uFEFF/,''));const x=cfg.development;if(x?.instance!=='mw-credit-pg-20261017'||x.host!=='TO_FILL_AFTER_CREATE_HOST'||x.database!=='loan_manager_dev'||cfg.production?.database===x.database)throw Error('Wrong DEV environment tuple');
let credential,route;
if(windows){credential=path.resolve(x.passwordFile);if(!credential.startsWith(privateBase+path.sep))throw Error('Credentials must remain outside Git');route={host:x.host,port:x.port,ssl:{rejectUnauthorized:false}};}
else{credential=path.join(privateBase,'AppSheet-Loan-Project/credentials/postgres-password.txt');if(!fs.existsSync(credential)||fs.lstatSync(credential).isSymbolicLink()||(fs.statSync(credential).mode&0o077))throw Error('Admin credential file missing or not private: run Get-DbEnvironment development -Admin first');
 const port=Number(process.env.MW_DB_TUNNEL_PORT||15432);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid MW_DB_TUNNEL_PORT');route={host:'127.0.0.1',port,ssl:false};}
if(['DATABASE_URL','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE'].some(k=>process.env[k]))throw Error('Remove ambient PostgreSQL routing overrides');
const config=JSON.parse(fs.readFileSync(path.join(repo,'database/application-role-creators.json'),'utf8').replace(/^﻿/,''));if(config.database!==x.database)throw Error('Wrong registered creator target');
const client=new pg.Client({...route,database:x.database,user:x.user,password:fs.readFileSync(credential,'utf8').trim(),connectionTimeoutMillis:10000,application_name:'mw-dev-application-role-admin'});
await client.connect();let evidencePath;
try{
 // Owner-approved 17 October 2026: through the Debian host's Auth Proxy (Linux tunnel route) the server
 // address reads NULL; that route instead requires session_user postgres and the Cloud SQL service role.
 const actual=(await client.query("SELECT current_database() db,host(inet_server_addr()) host,session_user operator,EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cloudsqladmin') cloudsql")).rows[0];
 const tunnel=!windows&&actual.host===null&&actual.operator==='postgres'&&actual.cloudsql===true;
 if(actual.db!==x.database||(actual.host!==x.host&&!tunnel))throw Error('Live DEV target mismatch');
 if(options['--if-present']&&!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='mw_app_dev'")).rowCount){console.log(JSON.stringify({mode:'skipped',reason:'Capability package absent'}));}
 else{
  await client.query('SELECT pg_advisory_lock(1052026,4)');
  let before;if(options['--apply']){before=await captureApplicationRoleSnapshot(client,config);fs.mkdirSync(privateRoot,{recursive:true});evidencePath=external(path.join(privateRoot,'application-role-'+randomUUID()+'.json'));fs.writeFileSync(evidencePath,JSON.stringify({version:1,action,before},null,2),{flag:'wx',mode:0o600});}
  let result;
  if(action==='recover'){if(!options['--recovery-file'])throw Error('Recovery file required');const saved=JSON.parse(fs.readFileSync(external(options['--recovery-file']),'utf8'));if(!saved.before||!saved.after)throw Error('Recovery requires completed before/after pair');result=await recoverApplicationRole(client,saved,{apply:Boolean(options['--apply'])});}
  else if(action==='membership'){result=await provisionApplicationRuntimeMembership(client,{...config,runtimeUser:options['--runtime-user']},{apply:Boolean(options['--apply'])});}
  else if(action==='post-migrate'){result=await runDevelopmentPostMigrationHook(client,config,{environment:'development',command:'migrate',apply:Boolean(options['--apply'])});}
  else result=await reconcileApplicationRole(client,config,{apply:Boolean(options['--apply'])});
  if(evidencePath){const after=await captureApplicationRoleSnapshot(client,config);fs.writeFileSync(evidencePath,JSON.stringify({version:1,action,before,after},null,2));}
  console.log(JSON.stringify({...result,privateRecoverySnapshot:evidencePath??null}));
 }
}finally{await client.query('SELECT pg_advisory_unlock(1052026,4)').catch(()=>{});await client.end();}
