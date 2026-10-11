// Local preparation only. This module has no cloud client, subprocess, or apply path.
import {readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const DATA_PROJECT = 'clever-oasis-508610-n7';
const DATA_NUMBER = '737787224638';
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const requiredTarget = ['applicationProject.id','applicationProject.number','dataProject.id','dataProject.number','region','auth.projectId','auth.tenant','auth.issuer','auth.audience','database.connectionName','database.host','database.name','storage.bucket','storage.receiptPrefix','storage.healthPrefix','runtime.reader.service','runtime.reader.serviceAccount','runtime.command.service','runtime.command.serviceAccount','hosting.site','hosting.canonicalOrigin','hosting.fallbackOrigin','state.projectId','state.bucket','state.prefix','state.generation','artifactRepository.projectId','artifactRepository.region','artifactRepository.name','secretVersions'];
const shape = {
  schemaVersion:true, environment:true, mode:true, status:true, sourceCommit:true, targetSha256:true,
  target:{applicationProject:{id:true,number:true},dataProject:{id:true,number:true},region:true,auth:{projectId:true,tenant:true,issuer:true,audience:true},database:{connectionName:true,host:true,name:true},storage:{bucket:true,receiptPrefix:true,healthPrefix:true},runtime:{reader:{service:true,serviceAccount:true},command:{service:true,serviceAccount:true}},hosting:{site:true,canonicalOrigin:true,fallbackOrigin:true},state:{projectId:true,bucket:true,prefix:true,generation:true},artifactRepository:{projectId:true,region:true,name:true},secretVersions:[{name:true,version:true,projectId:true}]},
  artifacts:{reader:{image:true,entrypoint:true},command:{image:true,entrypoint:true},frontend:{mode:true,targetSha256:true,configSha256:true,publicVersion:true,entry:true,workerSha256:true,files:[{path:true,sha256:true}]}},
  rollback:{targetSha256:true,sourceCommit:true,readerRevision:true,commandRevision:true,hostingVersion:true,stateGeneration:true,secretVersions:[{name:true,version:true,projectId:true}],artifacts:{reader:{image:true,entrypoint:true},command:{image:true,entrypoint:true},frontend:{mode:true,targetSha256:true,configSha256:true,publicVersion:true,entry:true,workerSha256:true,files:[{path:true,sha256:true}]}}},
  evidence:{sourceVerification:true,artifactVerification:true,targetReview:true,containmentTests:true,rollbackTests:true},
  sql:{mode:true}, authorization:{reference:true,scope:true,targetSha256:true,sourceCommit:true},
};
function fail(message) {throw new Error(message);}
function object(value) {return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;}
function inspect(value, expected, label='manifest') {
  if (expected === true) {
    if (typeof value === 'string' && (/-----BEGIN .*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_|AIza[0-9A-Za-z_-]{30,}/.test(value) || value.length > 1024)) fail('Unsafe metadata at '+label);
    if (value !== null && !['string','number','boolean'].includes(typeof value)) fail('Scalar metadata required at '+label);
    return;
  }
  if (Array.isArray(expected)) {if (!Array.isArray(value) || value.length > 128) fail('Bounded array required at '+label); for (const item of value) inspect(item,expected[0],label+'[]');return;}
  if (!object(value)) fail('Plain object required at '+label);
  for (const key of Object.keys(value)) {if (!Object.hasOwn(expected,key)) fail('Unknown field at '+label);inspect(value[key],expected[key],label+'.'+key);}
}
function canonical(value) {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (object(value)) return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function fingerprint(target) {inspect(target,shape.target,'target');return createHash('sha256').update(canonical(target)).digest('hex');}
function at(value,key) {return key.split('.').reduce((v,k)=>v == null ? undefined : v[k],value);}
function present(value) {return value !== undefined && value !== '' && value !== null;}
function text(value,label) {if (typeof value !== 'string' || !value.trim() || /(?:TBD|UNBOUND|PLACEHOLDER|<|>)/i.test(value)) fail('Unbound '+label);return value;}
function hash(value,label) {if (!SHA.test(value)) fail('Exact SHA256 required for '+label);}
function positive(value,label) {if (!Number.isSafeInteger(value) || value < 1) fail('Positive numeric '+label+' required');}
function equal(value,expected,label) {if(value!==expected) fail('Wrong '+label);}
function prefix(value,label) {text(value,label);if (!/^[A-Za-z0-9][A-Za-z0-9/_-]*\/$/.test(value) || /(^|\/)(?:dev|\.\.?)(\/|$)/i.test(value)) fail('Unsafe '+label);}
function secrets(values,app,label) {
  if (!Array.isArray(values) || values.length !== 4) fail('Four pinned secret references required for '+label);
  const wanted=new Set(['google-auth','firebase-web','owner-identity','native-receipt-catalog'].map(n=>'mw-credit-app-prod-'+n));
  for (const ref of values) {equal(ref.projectId,app,'secret project');positive(ref.version,'secret version');if(!wanted.delete(ref.name)) fail('Unexpected or duplicate secret reference');}
  if(wanted.size) fail('Missing secret reference');
}
function checkTarget(target,complete) {
  const missing=requiredTarget.filter(k=>k==='auth.tenant' ? at(target,k)===undefined : !present(at(target,k)));
  const app=at(target,'applicationProject.id');
  if(present(app) && (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(app) || app===DATA_PROJECT || /(?:^|-)dev(?:-|$)/.test(app))) fail('Wrong production application project');
  const number=at(target,'applicationProject.number');
  if(present(number) && (!/^[1-9][0-9]{5,19}$/.test(number) || number===DATA_NUMBER)) fail('Wrong application project number');
  const pins={'dataProject.id':DATA_PROJECT,'dataProject.number':DATA_NUMBER,region:'asia-southeast1','database.connectionName':DATA_PROJECT+':asia-southeast1:appsheet-pg-prod-20260914','database.host':'34.21.174.215','database.name':'loan_manager_prod','storage.bucket':'mw-payment-receipts-prod-508610-n7','hosting.canonicalOrigin':'https://lm.mw-credit.com','artifactRepository.region':'asia-southeast1','artifactRepository.name':'mw-credit-app'};
  for(const [key,value] of Object.entries(pins)) if(present(at(target,key))) equal(at(target,key),value,key);
  if(at(target,'auth.tenant')!==undefined && at(target,'auth.tenant')!==null) fail('Separate-project foundation requires no tenant');
  if(app) for(const [key,value] of Object.entries({'auth.projectId':app,'auth.issuer':'https://securetoken.google.com/'+app,'auth.audience':app,'artifactRepository.projectId':app,'state.projectId':app})) if(present(at(target,key))) equal(at(target,key),value,key);
  for(const role of ['reader','command']) {
    const stem=role==='reader'?'read':'command';
    if(present(at(target,'runtime.'+role+'.service'))) equal(at(target,'runtime.'+role+'.service'),'mw-credit-app-'+stem+'-prod','runtime service');
    if(app && present(at(target,'runtime.'+role+'.serviceAccount'))) equal(at(target,'runtime.'+role+'.serviceAccount'),'mw-credit-app-'+stem+'-prod@'+app+'.iam.gserviceaccount.com','runtime principal');
  }
  const site=at(target,'hosting.site');if(present(site) && (!/^[a-z0-9][a-z0-9-]{4,62}$/.test(site) || site==='mw-credit-app-dev-737787224638' || /(?:^|-)dev(?:-|$)/.test(site))) fail('Wrong Hosting site');
  if(site && present(at(target,'hosting.fallbackOrigin'))) equal(at(target,'hosting.fallbackOrigin'),'https://'+site+'.web.app','fallback origin');
  if(present(at(target,'state.bucket')) && (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(at(target,'state.bucket')) || at(target,'state.bucket').includes('dev') || at(target,'state.bucket')===at(target,'storage.bucket'))) fail('Wrong separate state bucket');
  for(const key of ['storage.receiptPrefix','storage.healthPrefix','state.prefix']) if(present(at(target,key))) prefix(at(target,key),key);
  if(present(at(target,'storage.receiptPrefix')) && present(at(target,'storage.healthPrefix')) && at(target,'storage.receiptPrefix')===at(target,'storage.healthPrefix')) fail('Separate health and receipt prefixes required');
  if(present(at(target,'state.generation'))) positive(at(target,'state.generation'),'state generation');
  if(target.secretVersions!==undefined && app) secrets(target.secretVersions,app,'target');
  if(complete && missing.length) fail('Missing target fields: '+missing.join(', '));
  return missing;
}
export function validateDraft(manifest) {
  inspect(manifest,shape);equal(manifest.schemaVersion,1,'schema version');equal(manifest.environment,'prod','environment');equal(manifest.mode,'foundation','mode');equal(manifest.status,'draft','draft status');
  const missing=checkTarget(manifest.target??{},false).map(p=>'target.'+p);
  for(const key of ['sourceCommit','targetSha256','artifacts','rollback','evidence','sql']) if(!present(manifest[key])) missing.push(key);
  if(manifest.sourceCommit!==undefined && !COMMIT.test(manifest.sourceCommit)) fail('Full source commit required');
  if(manifest.targetSha256!==undefined) hash(manifest.targetSha256,'target fingerprint');
  if(manifest.sql!==undefined) equal(manifest.sql.mode,'none','foundation SQL mode');
  return {schemaVersion:1,dryRun:true,deployReady:false,reviewReady:false,missing};
}
function image(ref,target) {
  const repository='asia-southeast1-docker.pkg.dev/'+target.applicationProject.id+'/mw-credit-app/';
  if(typeof ref?.image!=='string' || !ref.image.startsWith(repository) || !/\/[^/]+@sha256:[a-f0-9]{64}$/.test(ref.image)) fail('Immutable production image digest required');
  if(ref.entrypoint!=='services/production/server.mjs') fail('Contained foundation entrypoint required');
}
function safeRelative(name) {if(typeof name!=='string' || name.length>240 || name.includes('\\') || path.posix.isAbsolute(name) || !name.split('/').every(p=>/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(p) && !p.includes('..'))) fail('Unsafe artifact path');if(!['production-config.json','build-version.json'].includes(name) && !/\.(?:js|css|html|webmanifest|png|svg|ico)$/.test(name)) fail('Artifact path not allowlisted');return name;}
async function contents(root,files) {
  const base=await realpath(root);const result=new Map();let size=0;
  if(!Array.isArray(files) || files.length<4 || files.length>64) fail('Bounded frontend content manifest required');
  for(const file of files) {
    safeRelative(file.path);hash(file.sha256,'content');if(result.has(file.path)) fail('Duplicate artifact path');
    const resolved=await realpath(path.resolve(base,...file.path.split('/')));const relative=path.relative(base,resolved);
    if(path.isAbsolute(relative) || relative==='..' || relative.startsWith('..'+path.sep)) fail('Artifact escapes root');
    const bytes=await readFile(resolved);size+=bytes.length;if(size>32*1024*1024) fail('Frontend artifact exceeds bound');
    if(createHash('sha256').update(bytes).digest('hex')!==file.sha256) fail('Changed artifact bytes');result.set(file.path,bytes);
  }
  return result;
}
function json(bytes,label) {if(!bytes) fail('Missing '+label);try{return JSON.parse(bytes.toString('utf8'));}catch{fail('Invalid '+label);}}
async function frontend(artifact,target,targetSha,root) {
  if(!root) fail('Explicit local artifact root required');equal(artifact?.mode,'prod-foundation','frontend mode');equal(artifact.targetSha256,targetSha,'frontend target');hash(artifact.configSha256,'config');hash(artifact.workerSha256,'worker');
  if(!/^[a-f0-9]{24}$/.test(artifact.publicVersion) || !/^\/assets\/[A-Za-z0-9_-]+\.js$/.test(artifact.entry)) fail('Wrong frontend marker');
  const files=await contents(root,artifact.files);
  const config=json(files.get('production-config.json'),'production config');
  inspect(config,{schemaVersion:true,environment:true,mode:true,applicationProjectId:true,authIssuer:true,authAudience:true,hostingSite:true,canonicalOrigin:true,targetSha256:true},'production config');
  const expected={schemaVersion:1,environment:'prod',mode:'foundation',applicationProjectId:target.applicationProject.id,authIssuer:target.auth.issuer,authAudience:target.auth.audience,hostingSite:target.hosting.site,canonicalOrigin:target.hosting.canonicalOrigin,targetSha256:targetSha};
  if(canonical(config)!==canonical(expected)) fail('Wrong frontend configuration');
  if(createHash('sha256').update(files.get('production-config.json')).digest('hex')!==artifact.configSha256) fail('Config hash mismatch');
  const marker=json(files.get('build-version.json'),'build marker');inspect(marker,{schemaVersion:true,version:true,entry:true},'marker');
  if(marker.schemaVersion!==1 || marker.version!==artifact.publicVersion || marker.entry!==artifact.entry) fail('Worker/build marker mismatch');
  const worker=files.get('sw.js');if(!worker || createHash('sha256').update(worker).digest('hex')!==artifact.workerSha256 || !worker.toString().includes(artifact.publicVersion) || !worker.toString().includes('mw-credit-prod-public-')) fail('Wrong production worker');
  const entry=files.get(artifact.entry.slice(1));const html=files.get('index.html');
  if(!entry || !html?.toString().includes(artifact.entry) || !entry.toString().includes(target.applicationProject.id) || !entry.toString().includes(target.hosting.canonicalOrigin)) fail('Wrong configured frontend entry');
  for(const [name,bytes] of files) if(/\.(?:js|html|webmanifest)$/.test(name) && /clever-oasis-508610-n7\.firebaseapp\.com|mw-credit-app-(?:read|command)-dev|loan_manager_dev|mw-credit-dev-public-/.test(bytes.toString())) fail('DEV frontend fallback forbidden');
}
export async function validateCandidate(manifest,{artifactRoot,rollbackRoot}={}) {
  inspect(manifest,shape);equal(manifest.schemaVersion,1,'schema version');equal(manifest.environment,'prod','environment');equal(manifest.mode,'foundation','mode');equal(manifest.status,'reviewable','candidate status');checkTarget(manifest.target,true);
  if(!COMMIT.test(manifest.sourceCommit)) fail('Full source commit required');hash(manifest.targetSha256,'target');equal(manifest.targetSha256,fingerprint(manifest.target),'target fingerprint');equal(manifest.sql?.mode,'none','foundation SQL mode');
  for(const key of Object.keys(shape.evidence)) text(manifest.evidence?.[key],'evidence '+key);
  for(const role of ['reader','command']) image(manifest.artifacts?.[role],manifest.target);
  await frontend(manifest.artifacts?.frontend,manifest.target,manifest.targetSha256,artifactRoot);
  const previous=manifest.rollback;if(!previous || !COMMIT.test(previous.sourceCommit)) fail('Pinned predecessor required');equal(previous.targetSha256,manifest.targetSha256,'predecessor target');
  for(const key of ['readerRevision','commandRevision','hostingVersion']) {text(previous[key],'predecessor '+key);if(!/^[A-Za-z0-9_-]+$/.test(previous[key]) || /(?:^|-)dev(?:-|$)/.test(previous[key])) fail('Wrong predecessor pin');}
  positive(previous.stateGeneration,'predecessor state generation');secrets(previous.secretVersions,manifest.target.applicationProject.id,'predecessor');
  for(const role of ['reader','command']) image(previous.artifacts?.[role],manifest.target);
  await frontend(previous.artifacts?.frontend,manifest.target,manifest.targetSha256,rollbackRoot);
  return {schemaVersion:1,dryRun:true,reviewReady:true,deployReady:false,approvalRequired:true,sourceCommit:manifest.sourceCommit,targetSha256:manifest.targetSha256,actions:['Review contained reader and command immutable artifacts','Review matched production frontend/worker and numeric secret pins','Retain matched predecessor artifacts/configuration/state pins'],sqlAction:'none',rollback:{targetSha256:previous.targetSha256,sourceCommit:previous.sourceCommit,readerImage:previous.artifacts.reader.image,commandImage:previous.artifacts.command.image,readerRevision:previous.readerRevision,commandRevision:previous.commandRevision,hostingVersion:previous.hostingVersion,frontendVersion:previous.artifacts.frontend.publicVersion,configSha256:previous.artifacts.frontend.configSha256,workerSha256:previous.artifacts.frontend.workerSha256,stateGeneration:previous.stateGeneration,secretVersions:previous.secretVersions},execution:'Not implemented; no cloud or SQL effects'};
}
export const validateReviewable=validateCandidate;
export async function validateAuthorizedPackage(manifest,options) {
  const result=await validateCandidate(manifest,options);const ref=manifest.authorization;
  text(ref?.reference,'authorization reference');equal(ref.scope,'contained-production-foundation','authorization scope');equal(ref.targetSha256,manifest.targetSha256,'authorized target');equal(ref.sourceCommit,manifest.sourceCommit,'authorized source');
  return {...result,approvalRequired:false,authorizationRecorded:true,deployReady:false,execution:'Reference recorded only; a future executor must verify authority and live target. No apply implementation'};
}
export function parseArguments(args) {
  const allowed=new Set(['--manifest','--artifact-root','--rollback-root','--dry-run']);const opts={};
  for(let i=0;i<args.length;i++) {const key=args[i];if(!allowed.has(key) || Object.hasOwn(opts,key)) fail('Usage: --manifest PATH [--artifact-root PATH --rollback-root PATH] [--dry-run]; apply is unsupported');opts[key]=key==='--dry-run'?true:args[++i];if(!opts[key] || typeof opts[key]==='string' && opts[key].startsWith('--')) fail('Missing argument');}
  if(!opts['--manifest']) fail('Manifest required');return opts;
}
async function cli(args) {
  const opts=parseArguments(args);const raw=await readFile(opts['--manifest']);if(raw.length>256*1024) fail('Manifest exceeds bound');const manifest=json(raw,'manifest');
  const result=manifest.status==='draft'?validateDraft(manifest):await validateCandidate(manifest,{artifactRoot:opts['--artifact-root'],rollbackRoot:opts['--rollback-root']});
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) cli(process.argv.slice(2)).catch(()=>{process.stderr.write('Promotion preparation rejected; invalid, incomplete or mismatched metadata/artifacts. No actions executed.\n');process.exitCode=1;});
