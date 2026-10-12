// Fixed PROD operator entrypoint. Explicit owner approval and restorable private backup required.
import fs from 'node:fs';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';import pg from 'pg';
import {provisionR053Roles,prepareR053Maintenance,restoreR053Maintenance,configureR053Capture,grantR053JobDependencies,bindR053Runtime,grantR053AgentReceiptApi} from './r053-operator-tooling.mjs';
const args=process.argv.slice(2),actions=['roles','prepare','prepare-agent','prepare-conversation','agent-api-grants','restore','capture-enable','capture-disable','jobs-dependencies','bind-api','bind-notify','bind-jobs'];
const action=args.shift();if(!actions.includes(action))throw Error('One fixed R053 PROD action required');
const opts={};for(let i=0;i<args.length;i++){if(args[i]==='--apply'){if(opts.apply)throw Error('Duplicate apply');opts.apply=true;}else if(['--state','--dependency-sha256','--approval-reference','--backup-proof','--source-commit','--baseline-version'].includes(args[i])&&args[i+1]&&!opts[args[i]]){opts[args[i]]=args[++i];}else throw Error('Unknown R053 operator option');}opts.state=opts['--state'];
const baselineVersion=Number(opts['--baseline-version']??'87');if(!['87','89'].includes(opts['--baseline-version']??'87'))throw Error('Exact reviewed PROD baseline required');
if(baselineVersion===89&&!['prepare-conversation','restore'].includes(action))throw Error('PROD89 permits only V90 journal maintenance and restoration');
if(action==='prepare-conversation'&&baselineVersion!==89)throw Error('Conversation maintenance requires explicit baseline89');
if(['DATABASE_URL','PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS'].some(k=>process.env[k]!==undefined))throw Error('Ambient SQL route refused');
const repo=path.resolve(import.meta.dirname,'../..'),privateRoot=path.resolve('C:/Users/ideaadmin/Documents/ChatGPT/AppSheet-Loan-Project/flyway');
function external(p){const x=path.resolve(p),r=path.relative(privateRoot,x);if(!r||r.startsWith('..')||path.isAbsolute(r))throw Error('Exact private recovery location required');let current=path.parse(x).root;for(const component of x.slice(current.length).split(path.sep)){current=path.join(current,component);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Recovery reparse path refused');}return x;}
if(action==='restore'&&!opts.state)throw Error('Exact prepared restoration file required');
if(!opts['--approval-reference']?.trim()||! /^[a-f0-9]{40}$/.test(opts['--source-commit']??'')||!opts['--backup-proof'])throw Error('Explicit production approval, source pin and private backup proof required');
const backupPath=external(opts['--backup-proof']),backup=JSON.parse(fs.readFileSync(backupPath,'utf8')),backupRoot=path.dirname(backupPath);
const cleanup=JSON.parse(fs.readFileSync(external(path.join(backupRoot,'cleanup.json')),'utf8'));
if(backup.database!=='loan_manager_prod'||backup.baselineVersion!==baselineVersion||backup.host!=='34.21.174.215'||backup.instance!=='appsheet-pg-prod-20260914'||backup.restore!=='passed'||backup.archiveListing!=='passed'||backup.restoredFingerprintsMatch!==true||cleanup.stopped!==true||cleanup.ownedRestoreRemoved!==true||! /^[a-f0-9]{64}$/.test(backup.dumpSha256??''))throw Error('Verified exact requested PROD baseline backup and isolated restore required');
const dump=external(path.join(backupRoot,'loan_manager_prod.dump'));
// Stream the retained dump; never export its contents or hold it in memory.
let dumpHash=createHash('sha256');for await(const chunk of fs.createReadStream(dump))dumpHash.update(chunk);
if(dumpHash.digest('hex')!==backup.dumpSha256)throw Error('Recovery dump changed');
const t=JSON.parse(fs.readFileSync(path.join(repo,'database/environments.json'),'utf8')).production;
if(t.instance!=='appsheet-pg-prod-20260914'||t.host!=='34.21.174.215'||t.port!==5432||t.database!=='loan_manager_prod'||t.user!=='postgres')throw Error('PROD configuration mismatch');
const credentials=path.resolve(t.passwordFile);if(!credentials.startsWith(path.resolve('C:/Users/ideaadmin/Documents/ChatGPT')+path.sep))throw Error('Private credential required');
const config={database:'loan_manager_prod',creators:['postgres'],executionMode:'cloudsql-prod',productionAuthorization:{approvalReference:opts['--approval-reference'],backupSha256:backup.dumpSha256,sourceCommit:opts['--source-commit'],baselineVersion,...(baselineVersion===89?{targetVersion:90}:{})}};
const c=new pg.Client({host:t.host,port:t.port,database:t.database,user:t.user,password:fs.readFileSync(credentials,'utf8').trim(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,application_name:'mw-r053-prod-operator'});
const file=opts.state?external(opts.state):external(path.join(privateRoot,'r053-prod-'+action+'-'+randomUUID()+'.json'));let result;
await c.connect();try{await c.query("SET statement_timeout='30s'; SET lock_timeout='5s'");await c.query('SELECT pg_advisory_lock(1052026,53)');
 if(action==='restore'){const saved=JSON.parse(fs.readFileSync(file,'utf8'));result=await restoreR053Maintenance(c,config,saved.result.restoreState,{apply:!!opts.apply});if(opts.apply)fs.writeFileSync(file,JSON.stringify({...saved,restoration:result,restoredAt:new Date().toISOString()},null,2));}
 else{
  let fn=action==='roles'?provisionR053Roles:action.startsWith('prepare')?prepareR053Maintenance:configureR053Capture;
  let extra=action.startsWith('capture-')?{enabled:action==='capture-enable'}:action==='prepare-agent'?{includeAgentReceipts:true}:action==='prepare-conversation'?{conversationOnly:true}:{};
  if(action==='agent-api-grants')fn=grantR053AgentReceiptApi;
  if(action.startsWith('bind-')){fn=bindR053Runtime;extra={kind:action.slice(5)};}
  if(action==='jobs-dependencies'){
   const bytes=fs.readFileSync(path.join(repo,'outputs/r053-notifications-jobs/jobs-owner-reviewed-dependencies-prod.json'));
   if(createHash('sha256').update(bytes).digest('hex')!==opts['--dependency-sha256'])throw Error('Pinned reviewed dependency bytes required');
   const manifest=JSON.parse(bytes);extra={reviewedManifestSha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')};fn=(client,cfg,options)=>grantR053JobDependencies(client,cfg,manifest,options);
  }
  const plan=await fn(c,config,{...extra,apply:false});
  if(opts.apply){fs.mkdirSync(privateRoot,{recursive:true});fs.writeFileSync(file,JSON.stringify({action,observedAt:new Date().toISOString(),plan},null,2),{flag:'wx'});
   result=await fn(c,config,{...extra,apply:true,...(action.startsWith('prepare')?{expectedRestoreState:plan.restoreState}:{}),...((action.startsWith('capture-')||action==='agent-api-grants')?{expectedBefore:plan.before}:{})});
   fs.writeFileSync(file,JSON.stringify({action,observedAt:new Date().toISOString(),plan,result},null,2));
  }else result=plan;
 }
 console.log(JSON.stringify({action,database:config.database,mode:result.mode,applied:!!opts.apply,privateRecoveryFile:opts.apply?file:null}));
}finally{await c.query('SELECT pg_advisory_unlock(1052026,53)').catch(()=>{});await c.end();}
