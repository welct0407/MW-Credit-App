// Explicit operator entrypoint: temporary three-owner authority, fixed backup, finally restore.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {backupAuthorityCommands,runBackupWithAuthority} from './backup-r053-authority.mjs';
const opts={};const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){if(!['--environment','--approval-reference','--backup-proof','--source-commit'].includes(args[i])||opts[args[i]]||!args[i+1])throw Error('Fixed backup-only options required');opts[args[i]]=args[++i];}
const repo=path.resolve(import.meta.dirname,'../..'),root=path.resolve('C:/Users/ideaadmin/Documents/ChatGPT/AppSheet-Loan-Project/flyway');
const environment=opts['--environment'];if(!['development','production'].includes(environment))throw Error('Exact environment required');
function privatePath(value){if(!value)throw Error('Retained verified recovery required');const p=path.resolve(value),r=path.relative(root,p);if(!r||r.startsWith('..')||path.isAbsolute(r))throw Error('Private recovery root required');let current=path.parse(p).root;for(const part of p.slice(current.length).split(path.sep)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Recovery reparse path refused');}return p;}
const backupProof=privatePath(opts['--backup-proof']);
// PROD's maintained CLI verifies its retained V87 proof, cleanup and dump hash.
if(environment==='development'){
 const p=JSON.parse(fs.readFileSync(backupProof,'utf8')),dir=path.dirname(backupProof),cleanup=JSON.parse(fs.readFileSync(privatePath(path.join(dir,'cleanup.json')),'utf8'));
 if(p.environment!=='development'||p.database!=='loan_manager_dev'||p.instance!=='mw-credit-pg-20261017'||p.host!=='TO_FILL_AFTER_CREATE_HOST'||p.restore!=='passed'||p.archiveListing!=='passed'||cleanup.stopped!==true||cleanup.ownedRestoreRemoved!==true||!/^[a-f0-9]{64}$/.test(p.dumpSha256??''))throw Error('Verified retained DEV recovery required');
 const hash=createHash('sha256');for await(const chunk of fs.createReadStream(privatePath(path.join(dir,'loan_manager_dev.dump'))))hash.update(chunk);if(hash.digest('hex')!==p.dumpSha256)throw Error('Retained DEV dump changed');
}
const state=privatePath(path.join(root,'r053-backup-authority-'+randomUUID()+'.json'));
const commands=backupAuthorityCommands({environment,approvalReference:opts['--approval-reference'],backupProof,sourceCommit:opts['--source-commit'],state,node:process.execPath,python:'python',pwsh:'pwsh'});
const head=spawnSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}),dirty=spawnSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'});
if(head.status!==0||head.stdout.trim()!==opts['--source-commit']||dirty.status!==0||dirty.stdout.trim())throw Error('Clean pinned backup controller checkout required');
console.log(JSON.stringify({environment,privateAuthorityState:state}));
await runBackupWithAuthority(commands,{stateExists:()=>fs.existsSync(state),execute:async([file,...argv])=>{const r=spawnSync(file,argv,{cwd:repo,stdio:'inherit',windowsHide:true});if(r.error||r.status!==0)throw Error('Fixed backup controller child failed; retain private recovery state');}});
