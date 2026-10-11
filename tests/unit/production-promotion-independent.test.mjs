import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fingerprint} from '../../scripts/promotion/manifest.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const cli=fileURLToPath(new URL('../../scripts/promotion/manifest.mjs',import.meta.url));
async function packageFixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'phase3-independent-cli-'));
 t.after(async()=>{assert.match(path.basename(root),/^phase3-independent-cli-/);assert.equal(path.dirname(root),tmpdir());await rm(root,{recursive:true,force:true});});
 const app='synthetic-cli-prod',site='synthetic-cli-site';
 const target={applicationProject:{id:app,number:'123456789014'},dataProject:{id:'clever-oasis-508610-n7',number:'737787224638'},region:'asia-southeast1',
  auth:{projectId:app,tenant:null,issuer:'https://securetoken.google.com/'+app,audience:app},database:{connectionName:'clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914',host:'34.21.174.215',name:'loan_manager_prod'},
  storage:{bucket:'mw-payment-receipts-prod-508610-n7',receiptPrefix:'synthetic/prod-receipts/',healthPrefix:'synthetic/prod-health/'},
  runtime:{reader:{service:'mw-credit-app-read-prod',serviceAccount:'mw-credit-app-read-prod@'+app+'.iam.gserviceaccount.com'},command:{service:'mw-credit-app-command-prod',serviceAccount:'mw-credit-app-command-prod@'+app+'.iam.gserviceaccount.com'}},
  hosting:{site,canonicalOrigin:'https://lm.mw-credit.com',fallbackOrigin:'https://'+site+'.web.app'},state:{projectId:app,bucket:'synthetic-cli-state',prefix:'production/foundation/',generation:12},artifactRepository:{projectId:app,region:'asia-southeast1',name:'mw-credit-app'},
  secretVersions:['google-auth','firebase-web','owner-identity','native-receipt-catalog'].map(name=>({name:'mw-credit-app-prod-'+name,projectId:app,version:7}))};
 const targetSha256=fingerprint(target);
 async function assets(name,version){const dir=path.join(root,name);await mkdir(path.join(dir,'assets'),{recursive:true});const entry='/assets/'+name+'.js';
  const files={'production-config.json':JSON.stringify({schemaVersion:1,environment:'prod',mode:'foundation',applicationProjectId:app,authIssuer:target.auth.issuer,authAudience:app,hostingSite:site,canonicalOrigin:target.hosting.canonicalOrigin,targetSha256}),
   'build-version.json':JSON.stringify({schemaVersion:1,version,entry}),'sw.js':'const name="mw-credit-prod-public-'+version+'";','index.html':'<script src="'+entry+'"></script>',[entry.slice(1)]:'const project="'+app+'",origin="'+target.hosting.canonicalOrigin+'";'};
  for(const[name,bytes]of Object.entries(files))await writeFile(path.join(dir,name),bytes);
  return{dir,artifact:{mode:'prod-foundation',targetSha256,configSha256:hash(files['production-config.json']),publicVersion:version,entry,workerSha256:hash(files['sw.js']),files:Object.entries(files).map(([path,bytes])=>({path,sha256:hash(bytes)}))}};
 }
 const current=await assets('current','a'.repeat(24)),prior=await assets('prior','b'.repeat(24));
 const image=digit=>({image:'asia-southeast1-docker.pkg.dev/'+app+'/mw-credit-app/api@sha256:'+digit.repeat(64),entrypoint:'services/production/server.mjs'});
 const manifest={schemaVersion:1,environment:'prod',mode:'foundation',status:'reviewable',sourceCommit:'a'.repeat(40),target,targetSha256,
  artifacts:{reader:image('a'),command:image('a'),frontend:current.artifact},rollback:{targetSha256,sourceCommit:'b'.repeat(40),readerRevision:'read-prod-prior',commandRevision:'command-prod-prior',hostingVersion:'hosting-prior',stateGeneration:11,secretVersions:structuredClone(target.secretVersions),artifacts:{reader:image('b'),command:image('b'),frontend:prior.artifact}},
  evidence:{sourceVerification:'synthetic source',artifactVerification:'synthetic bytes',targetReview:'synthetic target',containmentTests:'synthetic containment',rollbackTests:'synthetic rollback'},sql:{mode:'none'}};
 const file=path.join(root,'manifest.json');
 const run=async(change=()=>{},args=[])=>{const copy=structuredClone(manifest);change(copy);await writeFile(file,JSON.stringify(copy));return spawnSync(process.execPath,[cli,'--manifest',file,'--artifact-root',current.dir,'--rollback-root',prior.dir,...args],{encoding:'utf8',timeout:10000});};
 return{root,manifest,current,prior,run};
}
test('actual CLI deterministically prepares current and predecessor pins without authorization or execution',async t=>{
 const f=await packageFixture(t),first=await f.run(),second=await f.run();assert.equal(first.status,0,first.stderr);assert.equal(first.stdout,second.stdout);
 const report=JSON.parse(first.stdout);assert.equal(report.approvalRequired,true);assert.equal(report.deployReady,false);assert.equal(report.sqlAction,'none');assert.match(report.execution,/no cloud or SQL effects/);
 assert.equal(report.rollback.readerImage,f.manifest.rollback.artifacts.reader.image);assert.equal(report.rollback.commandImage,f.manifest.rollback.artifacts.command.image);
 assert.equal(report.rollback.frontendVersion,f.prior.artifact.publicVersion);assert.equal(report.rollback.configSha256,f.prior.artifact.configSha256);assert.equal(report.rollback.workerSha256,f.prior.artifact.workerSha256);
 assert.deepEqual(report.rollback.secretVersions,f.manifest.rollback.secretVersions);assert.equal(report.rollback.stateGeneration,11);
 const before=await readFile(path.join(f.current.dir,'index.html'),'utf8');
 const apply=await f.run(()=>{},['--apply']);assert.equal(apply.status,1);assert.equal(apply.stdout,'');assert.match(apply.stderr,/No actions executed/);
 assert.equal(await readFile(path.join(f.current.dir,'index.html'),'utf8'),before);
});
test('actual CLI rejects mismatched rollback, former nonexistent entrypoint, hostile extras and escaped bytes privately',async t=>{
 const f=await packageFixture(t);
 for(const change of [m=>m.artifacts.reader.entrypoint='services/foundation/server.mjs',m=>delete m.rollback,
  m=>m.rollback.artifacts.command.image=m.rollback.artifacts.command.image.replace(/@sha256:.*/,':latest'),m=>m.rollback.secretVersions[0].projectId='clever-oasis-508610-n7',
  m=>m.authorization={reference:'SYNTHETIC_PRIVATE_SENTINEL',scope:'wrong',targetSha256:m.targetSha256,sourceCommit:m.sourceCommit,privateToken:'SYNTHETIC_PRIVATE_SENTINEL'},
  m=>m.target.database.name='loan_manager_dev',m=>m.artifacts.frontend.files.push({path:'../SYNTHETIC_PRIVATE_SENTINEL.js',sha256:'a'.repeat(64)})]){
  const result=await f.run(change);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.doesNotMatch(result.stderr,/SYNTHETIC_PRIVATE_SENTINEL|loan_manager|\.mjs|phase3-independent-cli/);
 }
 const outside=path.join(f.root,'outside');await mkdir(outside);await writeFile(path.join(outside,'escape.js'),'synthetic outside');
 await symlink(outside,path.join(f.current.dir,'alias'),process.platform==='win32'?'junction':'dir');
 assert.equal((await f.run(m=>m.artifacts.frontend.files.push({path:'alias/escape.js',sha256:hash('synthetic outside')}))).status,1);
 await writeFile(path.join(f.prior.dir,'sw.js'),'changed predecessor');assert.equal((await f.run()).status,1);
});
