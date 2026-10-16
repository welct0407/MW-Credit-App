// Fixed V90 protected backup preparation. Never accepts SQL or a child command.
import fs from 'node:fs';import path from 'node:path';import {spawnSync,execFileSync} from 'node:child_process';import pg from 'pg';
import {prepareR053Maintenance,restoreR053Maintenance} from './r053-operator-tooling.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){const key=args[i];if(key==='--restore-only'){options[key]=true;}else if(['--approval-reference','--source-commit','--state'].includes(key)&&args[i+1]&&!options[key])options[key]=args[++i];else throw Error('Unknown fixed backup option');}
if(!options['--approval-reference']?.trim()||!/^[a-f0-9]{40}$/.test(options['--source-commit']??'')||!options['--state'])throw Error('Explicit approval, exact source and private restoration state required');
if(['DATABASE_URL','PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS'].some(k=>process.env[k]))throw Error('Ambient database routing refused');
const repo=path.resolve(import.meta.dirname,'../..'),privateRoot=path.resolve('C:/Users/ideaadmin/Documents/ChatGPT/AppSheet-Loan-Project/flyway');
const stateFile=path.resolve(options['--state']),relative=path.relative(privateRoot,stateFile);
if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Private restoration state required');
let component=path.parse(stateFile).root;for(const piece of stateFile.slice(component.length).split(path.sep)){component=path.join(component,piece);if(fs.existsSync(component)&&fs.lstatSync(component).isSymbolicLink())throw Error('Private reparse path refused');}
if(execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==options['--source-commit'])throw Error('Source checkout differs from approved pin');
const target=JSON.parse(fs.readFileSync(path.join(repo,'database/environments.json'),'utf8')).production;
if(target.instance!=='mw-credit-pg-20261017'||target.host!=='136.85.127.134'||target.port!==5432||target.database!=='loan_manager_prod'||target.user!=='postgres')throw Error('Wrong production target');
const credential=path.resolve(target.passwordFile);if(!credential.startsWith(path.resolve('C:/Users/ideaadmin/Documents/ChatGPT')+path.sep))throw Error('Private credential required');
const config={database:'loan_manager_prod',creators:['postgres'],executionMode:'cloudsql-prod',productionAuthorization:{purpose:'r056-backup-preparation',approvalReference:options['--approval-reference'],sourceCommit:options['--source-commit'],baselineVersion:90,targetVersion:91}};
const client=new pg.Client({host:target.host,port:target.port,database:target.database,user:target.user,password:fs.readFileSync(credential,'utf8').trim(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,application_name:'mw-r056-backup-maintenance'});
let saved;
await client.connect();
try{
 await client.query("SET statement_timeout='30s';SET lock_timeout='5s'");await client.query('SELECT pg_advisory_lock(1052026,53)');
 if(options['--restore-only']){
  saved=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  if(saved.sourceCommit!==options['--source-commit']||saved.purpose!=='r056-backup-preparation')throw Error('Wrong saved backup context');
  const restored=await restoreR053Maintenance(client,config,saved.restoreState,{apply:true});
  fs.writeFileSync(stateFile,JSON.stringify({...saved,restoration:restored,restoredAt:new Date().toISOString()},null,2));
 }else{
  const plan=await prepareR053Maintenance(client,config);
  saved={purpose:'r056-backup-preparation',sourceCommit:options['--source-commit'],restoreState:plan.restoreState};
  fs.writeFileSync(stateFile,JSON.stringify(saved,null,2),{flag:'wx'});
  try{
   await prepareR053Maintenance(client,config,{apply:true,expectedRestoreState:plan.restoreState});
   const log=fs.openSync(stateFile+'.backup.log','wx');let result;
   try{result=spawnSync('C:/Users/ideaadmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[path.join(repo,'scripts/database/Backup-ProductionPromotion.py'),'--database','loan_manager_prod','--expected-version','90','--approval-reference',options['--approval-reference']],{cwd:repo,windowsHide:true,timeout:900000,stdio:['ignore',log,log]});}finally{fs.closeSync(log);}
   if(result.error||result.status!==0)throw Error('Protected backup failed; inspect private backup log');
  }finally{
   const restored=await restoreR053Maintenance(client,config,saved.restoreState,{apply:true});
   fs.writeFileSync(stateFile,JSON.stringify({...saved,restoration:restored,restoredAt:new Date().toISOString()},null,2));
  }
 }
 console.log(JSON.stringify({mode:options['--restore-only']?'restored':'backup-complete-authority-restored',privateState:stateFile,privateBackupLog:stateFile+'.backup.log'}));
}finally{await client.query('SELECT pg_advisory_unlock(1052026,53)').catch(()=>{});await client.end();}
