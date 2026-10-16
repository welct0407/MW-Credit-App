// Closed-owner provisioning and temporary owner authority around a migration (A-design §9.3).
// DEV by default; PROD only with explicit approval, source pin and verified private backup proof.
// Linux sessions reach Cloud SQL through scripts/database/cloud-db-tunnel.sh and the admin credential
// file written by `Get-DbEnvironment <env> -Admin` (Common.ps1); Windows VM-01 uses the direct TLS route.
// No ambient credentials, no DSN, no secret value in output or records.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';import pg from 'pg';
import {provisionClosedOwnerRole,prepareOwnerAuthority,restoreOwnerAuthority} from './r053-operator-tooling.mjs';
const args=process.argv.slice(2),actions=['role','prepare','restore'];
const action=args.shift();if(!actions.includes(action))throw Error('One owner authority action required: role | prepare | restore (plan unless --apply)');
const opts={owners:[]};for(let i=0;i<args.length;i++){
 if(args[i]==='--apply'){if(opts.apply)throw Error('Duplicate apply');opts.apply=true;}
 else if(args[i]==='--owner'&&args[i+1]&&!args[i+1].startsWith('--'))opts.owners.push(args[++i]);
 else if(['--environment','--state','--approval-reference','--source-commit','--backup-proof','--baseline-version'].includes(args[i])&&args[i+1]&&!opts[args[i]])opts[args[i]]=args[++i];
 else throw Error('Unknown owner authority option');}
const environment=opts['--environment']??'development';if(!['development','production'].includes(environment))throw Error('Environment must be development or production');
const suffix=environment==='production'?'prod':'dev',database='loan_manager_'+suffix;
if(action==='role'&&opts.owners.length>1)throw Error('One owner role per provisioning');
if(action==='restore'&&(!opts['--state']||opts.owners.length))throw Error('Exact prepared restoration file required (owners come from the record)');
const owners=opts.owners.length?opts.owners:['mw_ledger_owner_'+suffix];
if(['DATABASE_URL','PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS'].some(k=>process.env[k]!==undefined))throw Error('Ambient SQL route refused');
const windows=process.platform==='win32',repo=path.resolve(import.meta.dirname,'../..');
const privateBase=windows?path.resolve('C:/Users/ideaadmin/Documents/ChatGPT'):path.resolve(process.env.MW_PRIVATE_ROOT||path.join(os.homedir(),'.mw-private'));
const privateRoot=path.join(privateBase,'AppSheet-Loan-Project/flyway');
function external(p){const x=path.resolve(p),r=path.relative(privateRoot,x);if(!r||r.startsWith('..')||path.isAbsolute(r))throw Error('Exact private recovery location required');let current=path.parse(x).root;for(const component of x.slice(current.length).split(path.sep)){current=path.join(current,component);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Recovery reparse path refused');}return x;}
// PROD gate (unchanged from r053-production-operator-cli.mjs): owner approval, source pin, verified private backup of the exact baseline.
let productionAuthorization;
if(environment==='production'){
 const baselineVersion=Number(opts['--baseline-version']??'92');if(!Number.isInteger(baselineVersion)||baselineVersion<92)throw Error('Exact reviewed PROD baseline required');
 if(!opts['--approval-reference']?.trim()||! /^[a-f0-9]{40}$/.test(opts['--source-commit']??'')||!opts['--backup-proof'])throw Error('Explicit production approval, source pin and private backup proof required');
 const backupPath=external(opts['--backup-proof']),backup=JSON.parse(fs.readFileSync(backupPath,'utf8')),backupRoot=path.dirname(backupPath);
 const cleanup=JSON.parse(fs.readFileSync(external(path.join(backupRoot,'cleanup.json')),'utf8'));
 if(backup.database!==database||backup.baselineVersion!==baselineVersion||backup.host!=='34.21.174.215'||backup.instance!=='appsheet-pg-prod-20260914'||backup.restore!=='passed'||backup.archiveListing!=='passed'||backup.restoredFingerprintsMatch!==true||cleanup.stopped!==true||cleanup.ownedRestoreRemoved!==true||! /^[a-f0-9]{64}$/.test(backup.dumpSha256??''))throw Error('Verified exact requested PROD baseline backup and isolated restore required');
 const dumpHash=createHash('sha256');for await(const chunk of fs.createReadStream(external(path.join(backupRoot,'loan_manager_prod.dump'))))dumpHash.update(chunk);
 if(dumpHash.digest('hex')!==backup.dumpSha256)throw Error('Recovery dump changed');
 productionAuthorization={approvalReference:opts['--approval-reference'],sourceCommit:opts['--source-commit'],backupSha256:backup.dumpSha256,baselineVersion};
}else if(opts['--approval-reference']||opts['--source-commit']||opts['--backup-proof']||opts['--baseline-version'])throw Error('Production arguments require --environment production');
const t=JSON.parse(fs.readFileSync(path.join(repo,'database/environments.json'),'utf8').replace(/^\uFEFF/,''))[environment];
if(t?.instance!=='appsheet-pg-prod-20260914'||t.host!=='34.21.174.215'||t.port!==5432||t.database!==database||t.user!=='postgres')throw Error(environment+' configuration mismatch');
// Client tuple: direct TLS on VM-01; the IAP tunnel to the Debian host's Auth Proxy on Linux. The tooling
// still requires the server-side identity (instance address/port, database, session_user postgres).
let client,credentials,executionMode;
if(windows){credentials=path.resolve(t.passwordFile);if(!credentials.startsWith(privateBase+path.sep))throw Error('Private credential required');executionMode='cloudsql-'+suffix;client={host:t.host,port:t.port,ssl:{rejectUnauthorized:false}};}
else{
 credentials=path.join(privateBase,'AppSheet-Loan-Project/credentials/postgres-password.txt');
 if(!fs.existsSync(credentials)||fs.lstatSync(credentials).isSymbolicLink()||(fs.statSync(credentials).mode&0o077))throw Error('Admin credential file missing or not private: run `pwsh -c ". scripts/database/Common.ps1; Get-DbEnvironment '+environment+' -Admin"` first (opens the tunnel, writes the 0600 file)');
 const port=Number(process.env.MW_DB_TUNNEL_PORT||15432);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid MW_DB_TUNNEL_PORT');
 executionMode='cloudsql-'+suffix+'-tunnel';client={host:'127.0.0.1',port,ssl:false};
}
const config={database,creators:['postgres'],executionMode,...(productionAuthorization?{productionAuthorization}:{})};
const c=new pg.Client({...client,database:t.database,user:t.user,password:fs.readFileSync(credentials,'utf8').trim(),connectionTimeoutMillis:10000,application_name:'mw-owner-authority-'+suffix});
const file=opts['--state']?external(opts['--state']):external(path.join(privateRoot,'owner-authority-'+suffix+'-'+action+'-'+randomUUID()+'.json'));let result;
const write=(data,flags)=>fs.writeFileSync(file,JSON.stringify(data,null,2),{...flags,mode:0o600});
await c.connect();try{await c.query("SET statement_timeout='30s'; SET lock_timeout='5s'");await c.query('SELECT pg_advisory_lock(1052026,53)');
 if(action==='restore'){const saved=JSON.parse(fs.readFileSync(file,'utf8'));result=await restoreOwnerAuthority(c,config,saved.result?.restoreState??saved.plan?.restoreState,{apply:!!opts.apply});if(opts.apply)write({...saved,restoration:result,restoredAt:new Date().toISOString()},{});}
 else{
  const fn=action==='role'?(client,cfg,options)=>provisionClosedOwnerRole(client,cfg,{role:owners[0],...options}):(client,cfg,options)=>prepareOwnerAuthority(client,cfg,{owners,...options});
  const plan=await fn(c,config,{apply:false});
  if(opts.apply){fs.mkdirSync(privateRoot,{recursive:true,mode:0o700});write({action,environment,observedAt:new Date().toISOString(),plan},{flag:'wx'});
   result=await fn(c,config,{apply:true,...(action==='prepare'?{expectedRestoreState:plan.restoreState}:{})});
   write({action,environment,observedAt:new Date().toISOString(),plan,result},{});
  }else result=plan;
 }
 console.log(JSON.stringify({action,environment,database,executionMode,owners:action==='restore'?undefined:owners,mode:result.mode,statements:result.statements,applied:!!opts.apply,privateRecoveryFile:opts.apply?file:null}));
}finally{await c.query('SELECT pg_advisory_unlock(1052026,53)').catch(()=>{});await c.end();}
