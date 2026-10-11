// Explicit owner-authorized business Hosting delivery. Foundation executor stays unchanged.
import {readFile,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {validateBusinessApplyReceipts} from './business-candidate.mjs';
import {verifyOperatorCredential} from '../production/deploy-foundation-hosting.mjs';

export async function businessHostingPlan(prepared,applied,receipts,options){
 await validateBusinessApplyReceipts(prepared,applied,receipts,options);
 const site=applied.target.hosting.site;
 if(site!=='mw-credit-prod-737787224638')throw Error('Wrong fixed production Hosting site');
 const contents=new Map(),files={};
 for(const file of applied.artifacts.frontend.files){
  const bytes=await readFile(path.join(options.appliedOptions.artifactRoot,file.path));
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Artifact changed after validation');
  const compressed=gzipSync(bytes),hash=createHash('sha256').update(compressed).digest('hex');
  files['/'+file.path]=hash;contents.set(hash,compressed);
 }
 const headers=[{glob:'**',headers:{'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-store'}}];
 for(const [glob,type]of [['/build-version.json','application/json; charset=utf-8'],['/sw.js','application/javascript; charset=utf-8'],['/manifest.webmanifest','application/manifest+json; charset=utf-8'],['/offline.html','text/html; charset=utf-8']])headers.push({glob,headers:{'Content-Type':type,'Cache-Control':'no-store'}});
 return {site,files,contents,headers,sourceCommit:applied.sourceCommit,publicVersion:applied.artifacts.frontend.publicVersion};
}

export async function executeBusinessHosting(plan,{request,approvalReference}){
 if(!approvalReference?.trim())throw Error('Explicit owner promotion approval required');
 if(plan.site!=='mw-credit-prod-737787224638')throw Error('Wrong fixed production Hosting site');
 const api='https://firebasehosting.googleapis.com/v1beta1/';
 const version=await request(api+'sites/'+plan.site+'/versions','POST',{config:{headers:plan.headers,rewrites:[{glob:'**',path:'/index.html'}]}});
 if(!new RegExp('^sites/'+plan.site+'/versions/[A-Za-z0-9_-]+$').test(version.name))throw Error('Unexpected Hosting version target');
 const populate=await request(api+version.name+':populateFiles','POST',{files:plan.files});
 const required=populate.uploadRequiredHashes??[];
 if(!Array.isArray(required))throw Error('Unexpected Hosting file response');
 if(required.length&&populate.uploadUrl!=='https://upload-firebasehosting.googleapis.com/upload/'+version.name+'/files')throw Error('Unexpected Hosting upload target');
 for(const hash of required){if(!plan.contents.has(hash))throw Error('Unexpected upload hash');await request(populate.uploadUrl+'/'+hash,'POST',plan.contents.get(hash),true);}
 const finalized=await request(api+version.name+'?updateMask=status','PATCH',{status:'FINALIZED'});
 if(finalized.name!==version.name||finalized.status!=='FINALIZED')throw Error('Unexpected Hosting finalization');
 const release=await request(api+'sites/'+plan.site+'/releases?versionName='+encodeURIComponent(version.name),'POST',{});
 if(!new RegExp('^sites/'+plan.site+'/releases/[A-Za-z0-9_-]+$').test(release.name)||release.version?.name!==version.name)throw Error('Unexpected Hosting release target');
 return {schemaVersion:1,sourceCommit:plan.sourceCommit,site:plan.site,version:version.name,release:release.name,publicVersion:plan.publicVersion,fileCount:Object.keys(plan.files).length,cacheControl:'no-store',approvalReference};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i++){if(['--apply','--check'].includes(args[i]))options[args[i]]=true;else if(['--inputs','--approval-reference','--output'].includes(args[i])&&args[i+1])options[args[i]]=args[++i];else throw Error('Unknown or incomplete Hosting option');}
 if(Boolean(options['--apply'])===Boolean(options['--check'])||!options['--inputs']||!path.isAbsolute(options['--inputs']))throw Error('Choose --check or --apply with absolute private --inputs');
 const read=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
 const inputs=await read(options['--inputs']);
 const plan=await businessHostingPlan(await read(inputs.preparedManifestFile),await read(inputs.appliedManifestFile),await read(inputs.receiptsFile),{preparedOptions:inputs.preparedOptions,appliedOptions:inputs.appliedOptions});
 if(options['--check'])console.log(JSON.stringify({dryRun:true,site:plan.site,fileCount:Object.keys(plan.files).length,sourceCommit:plan.sourceCommit,publicVersion:plan.publicVersion}));
 else{
  if(!options['--approval-reference']||!options['--output']||!path.isAbsolute(options['--output']))throw Error('Owner approval and absolute private output required');
  const privateRoot=path.resolve('C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App');
  const output=path.resolve(options['--output']),relative=path.relative(privateRoot,output);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Hosting receipt must remain in the private project root');
  for(let cursor=path.dirname(output);;cursor=path.dirname(cursor)){const state=await lstat(cursor);if(state.isSymbolicLink())throw Error('Private output reparse boundary rejected');if(cursor===privateRoot)break;}
  try{await lstat(output);throw Error('Hosting receipt already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  const token=process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  await verifyOperatorCredential({token});
  const request=async(url,method,body,raw=false)=>{if(!['firebasehosting.googleapis.com','upload-firebasehosting.googleapis.com'].includes(new URL(url).hostname))throw Error('Unexpected Hosting API host');const response=await fetch(url,{method,redirect:'error',headers:{Authorization:'Bearer '+token,'x-goog-user-project':'clever-oasis-508610-n7','Content-Type':raw?'application/octet-stream':'application/json'},body:raw?body:JSON.stringify(body)});if(!response.ok)throw Error('Hosting API failed with status '+response.status);const text=await response.text();return text?JSON.parse(text):{};};
  const result=await executeBusinessHosting(plan,{request,approvalReference:options['--approval-reference']});
  console.log(JSON.stringify(result)); // Retain actual release identity even if local receipt persistence fails.
  try{await writeFile(options['--output'],JSON.stringify(result,null,2),{flag:'wx'});}catch{throw Error('Hosting release applied; private receipt write failed. Preserve the emitted release identity and inspect live state before retrying.');}
 }
}
