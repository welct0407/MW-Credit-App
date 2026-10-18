#!/usr/bin/env node
// R072: node scripts/troubleshooting/decrypt.mjs <file> --out <path> [--key-file <pem>] [--secret <name>] [--project <id>] [--force]
// The private key stays in memory (Secret Manager through gcloud, or --key-file); it is never written or printed.
// Exit: 0 written, 1 usage/read/decrypt failure, 2 key id mismatch, 3 output inside a Git checkout or through a symlink, 4 output exists without --force.
import {spawnSync} from 'node:child_process';
import {closeSync,constants,existsSync,fchmodSync,lstatSync,openSync,readFileSync,realpathSync,writeSync} from 'node:fs';
import {basename,dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decryptTroubleshooting,parseTroubleshootingFile,TroubleshootingError} from './envelope.mjs';
const fail=(message,code=1)=>{console.error(message);process.exit(code)};
const args=process.argv.slice(2),options={secret:'mw-credit-app-troubleshooting-private-key',project:'clever-oasis-508610-n7',force:false},positional=[];
for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--force')options.force=true;else if(['--out','--key-file','--secret','--project'].includes(arg)){if(!args[i+1])fail('Missing value for '+arg);options[arg.slice(2).replace('-file','File')]=args[++i]}else if(arg.startsWith('--'))fail('Unknown option '+arg);else positional.push(arg)}
if(positional.length!==1||!options.out)fail('Usage: node scripts/troubleshooting/decrypt.mjs <file> --out <path> [--key-file <pem>] [--secret <name>] [--project <id>] [--force]');
/** Decrypted borrower details must never land in a repository: refuse this checkout and any directory with a .git ancestor. */
const repository=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
// No symlink anywhere on the output path: the file lands exactly where it was named.
const lexists=path=>{try{return lstatSync(path)}catch{return null}};
for(let path=resolve(options.out);;path=dirname(path)){if(lexists(path)?.isSymbolicLink())fail('Refusing to write decrypted output through a symlink ('+path+')',3);if(dirname(path)===path)break}
let out;try{out=join(realpathSync(dirname(resolve(options.out))),basename(options.out))}catch{fail('The output directory does not exist')}
const inside=(child,parent)=>child===parent||child.startsWith(parent.endsWith(sep)?parent:parent+sep);
if(inside(out,repository))fail('Refusing to write decrypted output inside the repository',3);
for(let directory=dirname(out);;directory=dirname(directory)){if(existsSync(join(directory,'.git')))fail('Refusing to write decrypted output inside a Git checkout ('+directory+')',3);if(dirname(directory)===directory)break}
if(lexists(out)&&!options.force)fail('Output exists; pass --force to replace it',4);
let envelope;try{envelope=parseTroubleshootingFile(readFileSync(positional[0],'utf8'))}catch(error){fail(error instanceof TroubleshootingError?error.message:'Could not read the troubleshooting file')}
let privateKey;
if(options.keyFile)privateKey=readFileSync(options.keyFile,'utf8');
else{const result=spawnSync(process.env.GCLOUD_EXECUTABLE||'gcloud',['secrets','versions','access','latest','--secret',options.secret,'--project',options.project],{encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<20});
 if(result.status!==0||!result.stdout)fail('Could not read the private key from Secret Manager ('+options.secret+', exit '+(result.status??'none')+')');privateKey=result.stdout}
let payload;try{payload=decryptTroubleshooting(envelope,privateKey)}catch(error){fail(error instanceof TroubleshootingError?error.message:'The file could not be decrypted',error?.code==='key'?2:1)}finally{privateKey=undefined}
let descriptor;
try{descriptor=openSync(out,constants.O_WRONLY|constants.O_CREAT|constants.O_NOFOLLOW|(options.force?constants.O_TRUNC:constants.O_EXCL),0o600)}
catch(error){fail(error?.code==='EEXIST'?'Output exists; pass --force to replace it':error?.code==='ELOOP'?'Refusing to write decrypted output through a symlink':'Could not open the output file ('+(error?.code??'error')+')',error?.code==='EEXIST'?4:error?.code==='ELOOP'?3:1)}
try{fchmodSync(descriptor,0o600);writeSync(descriptor,JSON.stringify(payload,null,2)+'\n')}finally{closeSync(descriptor)}
const count=value=>Array.isArray(value)?value.length:0;
console.log(['Written '+out+' (0600)','Environment: '+envelope.environment,'Release: '+(payload.app?.release??'unknown')+' ('+(payload.app?.commit??'unknown')+')','Created: '+envelope.createdAt,'Events: '+count(payload.events),'Failed saves: '+count(payload.pending?.failed)+', queued: '+count(payload.pending?.queued)+(payload.signedOutStorage?' (signed out: '+count(payload.signedOutStorage.owners)+' owner store(s))':'')].join('\n'));
