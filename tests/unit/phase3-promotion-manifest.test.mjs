import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fingerprint,validateDraft,validateCandidate,validateAuthorizedPackage,parseArguments} from '../../scripts/promotion/manifest.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
function target() {
  const id='synthetic-foundation-prod',number='123456789012';
  return {applicationProject:{id,number},dataProject:{id:'clever-oasis-508610-n7',number:'737787224638'},region:'asia-southeast1',auth:{projectId:id,tenant:null,issuer:'https://securetoken.google.com/'+id,audience:id},database:{connectionName:'clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914',host:'34.21.174.215',name:'loan_manager_prod'},storage:{bucket:'mw-payment-receipts-prod-508610-n7',receiptPrefix:'synthetic/receipts/',healthPrefix:'synthetic/health/'},runtime:{reader:{service:'mw-credit-app-read-prod',serviceAccount:'mw-credit-app-read-prod@'+id+'.iam.gserviceaccount.com'},command:{service:'mw-credit-app-command-prod',serviceAccount:'mw-credit-app-command-prod@'+id+'.iam.gserviceaccount.com'}},hosting:{site:'synthetic-foundation-site',canonicalOrigin:'https://lm.mw-credit.com',fallbackOrigin:'https://synthetic-foundation-site.web.app'},state:{projectId:id,bucket:'synthetic-foundation-state',prefix:'production/foundation/',generation:1},artifactRepository:{projectId:id,region:'asia-southeast1',name:'mw-credit-app'},secretVersions:['google-auth','firebase-web','owner-identity','native-receipt-catalog'].map(name=>({name:'mw-credit-app-prod-'+name,version:1,projectId:id}))};
}
async function fixture(t) {
  const base=await mkdtemp(path.join(os.tmpdir(),'phase3-promotion-fixture-'));
  t.after(async()=>{const relative=path.relative(os.tmpdir(),base);assert.ok(!path.isAbsolute(relative)&&relative.startsWith('phase3-promotion-fixture-')&&!relative.includes(path.sep));await rm(base,{recursive:true,force:true});});
  const current=path.join(base,'current'),previous=path.join(base,'previous');await mkdir(current);await mkdir(previous);
  const configuration=target(),targetSha256=fingerprint(configuration);
  async function assets(root,version) {
    const entry='/assets/entry-'+version.slice(0,6)+'.js';
    const config={schemaVersion:1,environment:'prod',mode:'foundation',applicationProjectId:configuration.applicationProject.id,authIssuer:configuration.auth.issuer,authAudience:configuration.auth.audience,hostingSite:configuration.hosting.site,canonicalOrigin:configuration.hosting.canonicalOrigin,targetSha256};
    const files={'production-config.json':JSON.stringify(config),'build-version.json':JSON.stringify({schemaVersion:1,version,entry}),'index.html':'<script src="'+entry+'"></script>','sw.js':'const cache="mw-credit-prod-public-'+version+'";', [entry.slice(1)]:'const fixture='+JSON.stringify({project:configuration.applicationProject.id,origin:configuration.hosting.canonicalOrigin})+';'};
    for(const [name,bytes] of Object.entries(files)){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),bytes);}
    return {mode:'prod-foundation',targetSha256,configSha256:sha(files['production-config.json']),publicVersion:version,entry,workerSha256:sha(files['sw.js']),files:Object.entries(files).map(([name,bytes])=>({path:name,sha256:sha(bytes)}))};
  }
  const now=await assets(current,'1'.repeat(24)),old=await assets(previous,'2'.repeat(24));
  const image=digest=>({image:'asia-southeast1-docker.pkg.dev/'+configuration.applicationProject.id+'/mw-credit-app/api@sha256:'+digest.repeat(64),entrypoint:'services/production/server.mjs'});
  const manifest={schemaVersion:1,environment:'prod',mode:'foundation',status:'reviewable',sourceCommit:'a'.repeat(40),target:configuration,targetSha256,artifacts:{reader:image('a'),command:image('a'),frontend:now},rollback:{targetSha256,sourceCommit:'b'.repeat(40),readerRevision:'mw-credit-app-read-prod-00001-fixture',commandRevision:'mw-credit-app-command-prod-00001-fixture',hostingVersion:'synthetic-prior-hosting',stateGeneration:1,secretVersions:clone(configuration.secretVersions),artifacts:{reader:image('b'),command:image('b'),frontend:old}},evidence:{sourceVerification:'synthetic source proof',artifactVerification:'synthetic artifact proof',targetReview:'synthetic target review',containmentTests:'synthetic containment proof',rollbackTests:'synthetic rollback proof'},sql:{mode:'none'}};
  return {manifest,options:{artifactRoot:current,rollbackRoot:previous},base};
}
test('draft lists unbound fields, never supplies DEV fallback and CLI has no apply mode',()=>{
  const result=validateDraft({schemaVersion:1,environment:'prod',mode:'foundation',status:'draft'});
  assert.equal(result.deployReady,false);assert.equal(result.reviewReady,false);assert.ok(result.missing.includes('target.applicationProject.id'));assert.ok(result.missing.includes('target.auth.tenant'));
  assert.deepEqual(parseArguments(['--manifest','fixture.json']),{'--manifest':'fixture.json'});
  for(const args of [['--apply'],['--manifest','fixture.json','--apply'],['--manifest','--dry-run'],['--manifest','a','--manifest','b']])assert.throws(()=>parseArguments(args));
});
test('target fingerprint is deterministic across key order and changes with a numeric secret pin',()=>{
  const original=target(),ordered=Object.fromEntries(Object.entries(original).reverse());assert.equal(fingerprint(original),fingerprint(ordered));
  const changed=clone(original);changed.secretVersions[0].version=2;assert.notEqual(fingerprint(original),fingerprint(changed));
});
test('reviewable fixture needs no mutation approval, produces matched rollback pins and no execution',async t=>{
  const {manifest,options}=await fixture(t);const result=await validateCandidate(manifest,options);
  assert.equal(result.reviewReady,true);assert.equal(result.approvalRequired,true);assert.equal(result.deployReady,false);assert.equal(result.dryRun,true);assert.equal(result.sqlAction,'none');
  assert.equal(result.rollback.readerImage,manifest.rollback.artifacts.reader.image);assert.equal(result.rollback.frontendVersion,manifest.rollback.artifacts.frontend.publicVersion);assert.equal(result.rollback.workerSha256,manifest.rollback.artifacts.frontend.workerSha256);assert.deepEqual(result.rollback.secretVersions,manifest.rollback.secretVersions);
  await assert.rejects(validateAuthorizedPackage(manifest,options));
  manifest.authorization={reference:'synthetic scoped owner approval',scope:'contained-production-foundation',targetSha256:manifest.targetSha256,sourceCommit:manifest.sourceCommit};
  const authorized=await validateAuthorizedPackage(manifest,options);assert.equal(authorized.authorizationRecorded,true);assert.equal(authorized.deployReady,false);
  manifest.authorization.targetSha256='c'.repeat(64);await assert.rejects(validateAuthorizedPackage(manifest,options));
});
test('wrong DEV target, issuer/site/state/secret scope and missing bindings reject',async t=>{
  const {manifest,options}=await fixture(t);
  const mutations=[m=>m.target.applicationProject.id='clever-oasis-508610-n7',m=>m.target.applicationProject.number='737787224638',m=>m.target.auth.projectId='clever-oasis-508610-n7',m=>m.target.auth.issuer='https://securetoken.google.com/clever-oasis-508610-n7',m=>m.target.auth.audience='wrong',m=>m.target.auth.tenant='unexpected',m=>m.target.database.name='loan_manager_dev',m=>m.target.database.host='127.0.0.1',m=>m.target.hosting.site='mw-credit-app-dev-737787224638',m=>m.target.hosting.canonicalOrigin='http://localhost',m=>m.target.hosting.fallbackOrigin='https://preview.example',m=>m.target.state.projectId='clever-oasis-508610-n7',m=>m.target.state.bucket='mw-payment-receipts-prod-508610-n7',m=>m.target.secretVersions[0].version='latest',m=>m.target.secretVersions[0].version=0,m=>m.target.secretVersions[0].projectId='clever-oasis-508610-n7',m=>m.target.runtime.reader.serviceAccount=m.target.runtime.command.serviceAccount,m=>delete m.target.state.prefix];
  for(const change of mutations){const copy=clone(manifest);change(copy);await assert.rejects(validateCandidate(copy,options));}
  const draft={schemaVersion:1,environment:'prod',mode:'foundation',status:'draft',target:{applicationProject:{id:'clever-oasis-508610-n7'}}};assert.throws(()=>validateDraft(draft));
});
test('mutable image, DEV entrypoint, SQL implications and missing evidence/predecessor reject',async t=>{
  const {manifest,options}=await fixture(t);
  const mutations=[m=>m.artifacts.reader.image=m.artifacts.reader.image.replace(/@sha256:.*/,':latest'),m=>m.artifacts.command.image=m.artifacts.command.image.replace('synthetic-foundation-prod','clever-oasis-508610-n7'),m=>m.artifacts.reader.entrypoint='services/api/dev-read-server.mjs',m=>m.sql.mode='migrate',m=>m.sql.backupReference='invented',m=>delete m.evidence.containmentTests,m=>delete m.rollback,m=>m.rollback.targetSha256='c'.repeat(64),m=>m.rollback.secretVersions[0].version='latest',m=>m.rollback.artifacts.frontend.publicVersion='f'.repeat(24),m=>m.artifacts.frontend.mode='live-dev'];
  for(const change of mutations){const copy=clone(manifest);change(copy);await assert.rejects(validateCandidate(copy,options));}
});
test('changed frontend bytes and independently wrong marker/worker/config are rejected',async t=>{
  const {manifest,options}=await fixture(t);
  const entry=path.join(options.artifactRoot,manifest.artifacts.frontend.entry.slice(1));await writeFile(entry,'changed');await assert.rejects(validateCandidate(manifest,options),/Changed artifact/);
});
test('wrong configuration site or issuer rejects even when new byte hashes are self-consistent',async t=>{
  const {manifest,options}=await fixture(t);const file=path.join(options.artifactRoot,'production-config.json');const original=JSON.parse(await readFile(file,'utf8'));
  for(const update of [{hostingSite:'wrong-site'},{authIssuer:'https://securetoken.google.com/clever-oasis-508610-n7'}]){
    const copy=clone(manifest),bytes=JSON.stringify({...original,...update});await writeFile(file,bytes);copy.artifacts.frontend.configSha256=sha(bytes);copy.artifacts.frontend.files.find(f=>f.path==='production-config.json').sha256=sha(bytes);await assert.rejects(validateCandidate(copy,options),/Wrong frontend configuration/);
  }
});
test('wrong worker/build version rejects even with adjusted content hash',async t=>{
  const {manifest,options}=await fixture(t);const marker=JSON.stringify({schemaVersion:1,version:'f'.repeat(24),entry:manifest.artifacts.frontend.entry});await writeFile(path.join(options.artifactRoot,'build-version.json'),marker);manifest.artifacts.frontend.files.find(f=>f.path==='build-version.json').sha256=sha(marker);await assert.rejects(validateCandidate(manifest,options),/marker mismatch/);
});
test('DEV worker namespace rejects even with correctly supplied worker hash',async t=>{
  const {manifest,options}=await fixture(t);const worker='const cache="mw-credit-dev-public-'+manifest.artifacts.frontend.publicVersion+'"';await writeFile(path.join(options.artifactRoot,'sw.js'),worker);manifest.artifacts.frontend.workerSha256=sha(worker);manifest.artifacts.frontend.files.find(f=>f.path==='sw.js').sha256=sha(worker);await assert.rejects(validateCandidate(manifest,options),/production worker/);
});
test('paths, unallowlisted private JSON/payload and unknown secret fields cannot be read or emitted',async t=>{
  const {manifest,options}=await fixture(t);
  for(const name of ['../outside.js','C:/private.js','assets/..private.js','assets/.private.js','credentials.json','assets\\private.js']){const copy=clone(manifest);copy.artifacts.frontend.files[0].path=name;await assert.rejects(validateCandidate(copy,options));}
  const copy=clone(manifest);copy.target.secretVersions[0].payload='private catalog';await assert.rejects(validateCandidate(copy,options),/Unknown field/);
  const copy2=clone(manifest);copy2.evidence.password='secret';await assert.rejects(validateCandidate(copy2,options),/Unknown field/);
  const file=path.join(options.artifactRoot,'production-config.json'),bytes=JSON.stringify({password:'private'});await writeFile(file,bytes);manifest.artifacts.frontend.files[0].sha256=sha(bytes);manifest.artifacts.frontend.configSha256=sha(bytes);await assert.rejects(validateCandidate(manifest,options),/Unknown field/);
});
test('canonical artifact path rejects directory symlink/junction escape',async t=>{
  const {manifest,options,base}=await fixture(t);const outside=path.join(base,'outside');await mkdir(outside);const bytes='synthetic';await writeFile(path.join(outside,'escape.js'),bytes);await symlink(outside,path.join(options.artifactRoot,'linked'),process.platform==='win32'?'junction':'dir');manifest.artifacts.frontend.files.push({path:'linked/escape.js',sha256:sha(bytes)});await assert.rejects(validateCandidate(manifest,options),/escapes root/);
});
test('tool source has no subprocess, network, cloud imports or apply implementation',async()=>{
  const source=await readFile(new URL('../../scripts/promotion/manifest.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/from ['"](?:node:child_process|node:https?|@google-cloud|google-auth-library)|\bfetch\s*\(|\bspawn\s*\(|\bexecFile\s*\(/);
});
