import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fingerprint} from '../../scripts/promotion/manifest.mjs';
import {buildFoundationShell,buildMaintenanceShell} from '../../scripts/production/build-foundation-shell.mjs';
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

async function sharedPackage(t,phase='foundation'){
 const f=await packageFixture(t),m=f.manifest,app='clever-oasis-508610-n7';
 m.target.isolation='shared-project-default-auth';m.target.applicationProject={id:app,number:'737787224638'};
 m.target.auth={projectId:app,tenant:null,issuer:'https://securetoken.google.com/'+app,audience:app};
 m.target.artifactRepository={projectId:app,region:'asia-southeast1',name:'mw-credit-app-prod'};m.target.state.projectId=app;
 m.target.storage={bucket:'mw-payment-receipts-prod-508610-n7'};
 m.target.secretVersions=phase==='enrollment'?[]:[{name:'mw-credit-app-prod-owner-identity',projectId:app,version:7}];
 for(const role of ['reader','command']){const stem=role==='reader'?'read':'command';m.target.runtime[role]={service:'mw-credit-app-'+stem+'-prod',serviceAccount:'mw-credit-app-'+stem+'-prod@'+app+'.iam.gserviceaccount.com',origin:'https://mw-credit-app-'+stem+'-prod-737787224638.asia-southeast1.run.app'};}
 m.targetSha256=fingerprint(m.target);m.evidence.serverVerifier='synthetic shared default verifier';m.evidence.devDeliveryContainment='synthetic denied DEV/preview release';
 const config={schemaVersion:1,environment:'prod',authIsolation:'shared-default',phase,origin:'https://lm.mw-credit.com',firebase:{projectId:app,apiKey:'AIza'+'a'.repeat(35),appId:'1:737787224638:web:abc123',authDomain:app+'.firebaseapp.com'},endpoints:phase==='enrollment'?null:Object.fromEntries(['reader','command'].map(role=>[role,m.target.runtime[role].origin+'/api/session']))};
 async function pack(dir){const names=await readdir(dir);return{mode:'prod-foundation',phase:JSON.parse(await readFile(path.join(dir,'public-config.json'),'utf8')).phase,publicWorker:false,cachePolicy:'no-store',entry:'index.html',targetSha256:m.targetSha256,configSha256:hash(await readFile(path.join(dir,'public-config.json'))),files:await Promise.all(names.map(async name=>({path:name,sha256:hash(await readFile(path.join(dir,name)))})))};}
 f.current.dir=path.join(f.root,'shared-'+phase);f.prior.dir=path.join(f.root,'maintenance');
 await buildFoundationShell({config,outDir:f.current.dir});await buildMaintenanceShell({outDir:f.prior.dir});
 m.artifacts.frontend=await pack(f.current.dir);
 if(phase==='enrollment'){delete m.artifacts.reader;delete m.artifacts.command;}else for(const role of ['reader','command'])m.artifacts[role].image='asia-southeast1-docker.pkg.dev/'+app+'/mw-credit-app-prod/api@sha256:'+'a'.repeat(64);
 m.rollback={kind:'first-deployment',sourceCommit:'b'.repeat(40),targetSha256:m.targetSha256,
  baseline:{projectId:app,projectNumber:'737787224638',stateGeneration:11,stateLineage:'11111111-1111-1111-1111-111111111111',evidence:'synthetic measured absence',readerAbsent:true,commandAbsent:true,hostingVersionAbsent:true},
  dnsBefore:{name:'lm.mw-credit.com',observedAt:'2026-10-11T04:00:00Z',evidence:'synthetic DNS before',records:[]},containment:{traffic:'withhold-runtime-traffic',route:'withhold-domain-activation',retainResources:true},artifacts:{frontend:await pack(f.prior.dir)}};
 return{...f,config,pack};
}
test('actual CLI accepts actual workerless builders for enrollment/foundation and first-deployment maintenance only',async t=>{
 for(const phase of ['enrollment','foundation']){const f=await sharedPackage(t,phase),result=await f.run();assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);assert.equal(report.rollback.kind,'first-deployment');assert.equal(report.approvalRequired,true);assert.equal(report.deployReady,false);
  assert.deepEqual(report.rollback.baseline,f.manifest.rollback.baseline);assert.deepEqual(report.rollback.dnsBefore,f.manifest.rollback.dnsBefore);assert.deepEqual(report.rollback.containment,f.manifest.rollback.containment);
  assert.equal(report.rollback.maintenanceConfigSha256,f.manifest.rollback.artifacts.frontend.configSha256);assert.equal(Object.hasOwn(report.rollback,'readerImage'),false);
  assert.equal((await readdir(f.current.dir)).includes('sw.js'),false);assert.equal((await readdir(f.prior.dir)).includes('shell.js'),false);
 }
});
test('actual shared CLI rejects missing containment proof, invented predecessor, default/tenant aliases and enrollment runtime',async t=>{
 const f=await sharedPackage(t);
 for(const change of [m=>delete m.evidence.devDeliveryContainment,m=>delete m.evidence.serverVerifier,m=>delete m.target.isolation,
  m=>m.target.auth.tenant='tenant',m=>m.target.applicationProject.number='123456789014',m=>m.target.database.name='loan_manager_dev',
  m=>m.rollback.readerRevision='invented',m=>m.rollback.baseline.readerAbsent=false,m=>m.rollback.containment.retainResources=false,
  m=>m.target.secretVersions.push({name:'mw-credit-app-prod-google-auth',projectId:m.target.applicationProject.id,version:7}),
  m=>m.artifacts.frontend.publicWorker=true,m=>m.artifacts.frontend.cachePolicy='public,max-age=3600'])assert.equal((await f.run(change)).status,1);
 const enrollment=await sharedPackage(t,'enrollment');assert.equal((await enrollment.run(m=>m.artifacts.reader={image:'invented'})).status,1);
});
test('self-consistent wrong project-number Web App ID and changed maintenance bytes reject through actual CLI',async t=>{
 const f=await sharedPackage(t),wrong='1:123456789014:web:abc123';
 const bytes=JSON.stringify({...f.config,firebase:{...f.config.firebase,appId:wrong}});await writeFile(path.join(f.current.dir,'public-config.json'),bytes);
 const marker=JSON.parse(await readFile(path.join(f.current.dir,'foundation-shell.json'),'utf8'));marker.configSha256=hash(bytes);await writeFile(path.join(f.current.dir,'foundation-shell.json'),JSON.stringify(marker));
 const script=await readFile(path.join(f.current.dir,'shell.js'),'utf8');assert.ok(script.includes(f.config.firebase.appId));await writeFile(path.join(f.current.dir,'shell.js'),script.replaceAll(f.config.firebase.appId,wrong));
 const artifact=await f.pack(f.current.dir);const rejected=await f.run(m=>m.artifacts.frontend=artifact);assert.equal(rejected.status,1);assert.equal(rejected.stdout,'');assert.doesNotMatch(rejected.stderr,/123456789014|abc123|phase3-independent/);
 const fresh=await sharedPackage(t);await writeFile(path.join(fresh.prior.dir,'index.html'),'<script>fetch("/api/operations")</script>');assert.equal((await fresh.run()).status,1);
});
