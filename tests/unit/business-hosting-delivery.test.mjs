import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {executeBusinessHosting,appOnlyHostingPlan,verifyAppOnlyOperator,validateFrontendSource,validateFrontendCi,frontendOnlyHostingPlan,verifyFrontendOnlyLivePackage,validateSettingsSource,settingsHostingPlan,verifySettingsLivePackage,runtimeHostingPlan,validateRuntimeSource,validateRuntimeCi,verifyRuntimeLivePackage,waveHostingPlan,validateWaveSource,validateWaveCi,verifyWaveLivePackage,r065HostingPlan,validateR065Source,verifyR065LivePackage,hostingOnlyPlan,validateHostingOnlySource,verifyHostingOnlyLivePackage,r068HostingPlan,validateR068Source,verifyR068LivePackage} from '../../scripts/promotion/deploy-business-hosting.mjs';
const site='mw-credit-prod-737787224638',version=`sites/${site}/versions/abc123`,release=`sites/${site}/releases/xyz123`;
const plan=()=>({site,files:{'/index.html':'a'.repeat(64)},contents:new Map([['a'.repeat(64),Buffer.from('compressed')]]),headers:[],sourceCommit:'b'.repeat(40),publicVersion:'marker'});
function transport({target=version,hash='a'.repeat(64),upload='https://upload-firebasehosting.googleapis.com/upload/'+version+'/files',failFinalize=false}={}){const calls=[];return {calls,request:async(url,method,body)=>{calls.push({url,method,body});if(url.endsWith('/versions'))return {name:target};if(url.endsWith(':populateFiles'))return {uploadRequiredHashes:[hash],uploadUrl:upload};if(method==='PATCH'){if(failFinalize)throw Error('Finalize failed');return {name:version,status:'FINALIZED'};}if(url.includes('/releases?'))return {name:release,version:{name:version}};return {};}};}
test('owner approval and fixed site refuse before requests',async()=>{let calls=0;const request=async()=>{calls++;};await assert.rejects(executeBusinessHosting(plan(),{request}),/approval/);await assert.rejects(executeBusinessHosting({...plan(),site:'other'},{request,approvalReference:'owner'}),/site/);assert.equal(calls,0);});
test('verified version upload finalize release order produces exact delivery receipt',async()=>{const t=transport(),result=await executeBusinessHosting(plan(),{request:t.request,approvalReference:'owner'});assert.equal(result.version,version);assert.equal(result.release,release);assert.deepEqual(t.calls.map(x=>x.method),['POST','POST','POST','PATCH','POST']);assert.equal(t.calls[2].url,'https://upload-firebasehosting.googleapis.com/upload/'+version+'/files/'+'a'.repeat(64));});
test('wrong returned site, upload route and unplanned hash stop before release',async()=>{for(const options of [{target:'sites/other/versions/abc123'},{upload:'https://evil.example/upload'},{hash:'c'.repeat(64)}]){const t=transport(options);await assert.rejects(executeBusinessHosting(plan(),{request:t.request,approvalReference:'owner'}),/Unexpected/);assert.equal(t.calls.some(x=>x.url.includes('/releases?')),false);}});
test('failed finalization never releases partially uploaded version',async()=>{const t=transport({failFinalize:true});await assert.rejects(executeBusinessHosting(plan(),{request:t.request,approvalReference:'owner'}),/Finalize failed/);assert.equal(t.calls.some(x=>x.url.includes('/releases?')),false);});

test('current app-only package refuses legacy release, DEV and missing applied phase',async()=>{
 for(const m of [{},{schemaVersion:2,release:'R058',environment:'prod',scope:'app-only',status:'applied'},{schemaVersion:2,release:'R059',environment:'dev',scope:'app-only',status:'applied'}])await assert.rejects(appOnlyHostingPlan(m),/package kind/);
 await assert.rejects(appOnlyHostingPlan({schemaVersion:2,release:'R059',environment:'prod',scope:'app-only',status:'prepared'}),/apply\/readback/);
});
test('current keyless operator binds supplied token and signed impersonation to exact SA',async()=>{
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com',project='clever-oasis-508610-n7',aud='https://lm.mw-credit.com/promotion/r059';
 const fixtures=()=>[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];
 async function run(rows,proof={email,email_verified:true,sub:'123456',aud}){let calls=0;const result=await verifyAppOnlyOperator({token:'synthetic',request:async()=>({ok:true,json:async()=>rows[calls++]}),verifyIdToken:async(token,audience)=>{assert.equal(token,'signed');assert.equal(audience,aud);return proof}});return {result,calls};}
 assert.equal((await run(fixtures())).calls,5);
 const clientBound=fixtures();delete clientBound[0].email;clientBound[0].aud='123456';clientBound[0].azp='123456';clientBound[1].oauth2ClientId='123456';assert.equal((await run(clientBound)).calls,5);
 for(const field of ['aud','azp']){const wrong=structuredClone(clientBound);wrong[0][field]='wrong';await assert.rejects(run(wrong),/principal/);}
 const wrongEmail=structuredClone(clientBound);wrongEmail[0].email='other@example.invalid';await assert.rejects(run(wrongEmail),/principal/);
 for(const edit of [rows=>rows[0].email='other',rows=>rows[0].expires_in=0,rows=>rows[1].projectId='other',rows=>rows[4].name='other']){const rows=fixtures();edit(rows);await assert.rejects(run(rows));}
 for(const proof of [{email,email_verified:true,sub:'wrong',aud},{email,email_verified:false,sub:'123456',aud},{email,email_verified:true,sub:'123456',aud:'wrong'}])await assert.rejects(run(fixtures(),proof),/impersonation/);
 await assert.rejects(verifyAppOnlyOperator({}),/token required/);
});
test('changed live rollback stops before any Hosting mutation',async()=>{
 let calls=0;await assert.rejects(executeBusinessHosting({...plan(),rollback:{hostingVersion:version,hostingRelease:release}},{approvalReference:'owner',request:async(url,method)=>{calls++;assert.equal(method,'GET');return {releases:[{name:release,version:{name:version+'changed'}}]}}}),/baseline changed/);assert.equal(calls,1);
});

test('app-only exact package validates and repinned configuration, worker, CI, and recovery tampering rejects',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'mw-hosting-unit-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const git=args=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim()};git(['init']);git(['-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','synthetic']);const commit=git(['rev-parse','HEAD']);
 const artifact=path.join(root,'frontend');await mkdir(path.join(artifact,'assets'),{recursive:true});const project='clever-oasis-508610-n7',version='a'.repeat(24),entry='/assets/test.js';
 const config={schemaVersion:1,environment:'prod',canonicalOrigin:'https://lm.mw-credit.com',notificationsEnabled:true,firebase:{projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'AIza'+'x'.repeat(35),appId:'1:737787224638:web:abc123'},readerOrigin:'https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app',commandOrigin:'https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app'};
 const content={'index.html':`<script type="module" src="${entry}"></script>`,'production-public-config.json':JSON.stringify(config),'build-mode.json':JSON.stringify({schemaVersion:1,mode:'live-prod'}),'build-version.json':JSON.stringify({schemaVersion:1,version,entry}),'sw.js':`const VERSION = '${version}';\nconst PREFIX = 'mw-credit-prod-public-';\nconst APP_ASSETS = ["${entry}"];`,'manifest.webmanifest':'{}','assets/test.js':JSON.stringify(config)};
 const files=[];for(const [name,value]of Object.entries(content)){await writeFile(path.join(artifact,name),value);files.push({path:name,sha256:createHash('sha256').update(value).digest('hex')});}
 const image=`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api@sha256:`+'b'.repeat(64),services=Object.fromEntries(['read','command','notify','jobs'].map(role=>[role,{revision:`mw-credit-app-${role}-prod-00001-abc`,image}]));
 const m={schemaVersion:2,release:'R059',environment:'prod',scope:'app-only',status:'applied',sourceCommit:commit,artifactSourceCommit:commit,repoRoot:root,artifactRoot:artifact,target:{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'},sql:{baselineVersion:91,targetVersion:91,migrations:[]},applicationCi:{run:{repository:{full_name:'welct0407/MW-Credit-App'},path:'.github/workflows/ci.yml',head_sha:commit,event:'workflow_dispatch',status:'completed',conclusion:'success'},jobs:[{steps:['Run npm run check','Run npm run build:live-dev','Run npm audit --omit=dev --audit-level=moderate','Run npm run test:e2e'].map(name=>({name,conclusion:'success'}))}]},build:{sourceCommit:commit,status:'SUCCESS',image,id:'synthetic-build'},plan:{sha256:'c'.repeat(64),actions:['reader.image','command.image']},rollback:{hostingVersion:`sites/${site}/versions/prior`,hostingRelease:`sites/${site}/releases/123`,services},applied:{sourceCommit:commit,planSha256:'c'.repeat(64),database:'loan_manager_prod',sqlVersion:91,services:{...services,read:{...services.read,ready:true,trafficPercent:100},command:{...services.command,ready:true,trafficPercent:100}}},frontend:{publicVersion:version,entry,files}};
 assert.equal((await appOnlyHostingPlan(m)).site,site);
 for(const mutate of [x=>x.applicationCi.jobs[0].steps[3].conclusion='skipped',x=>x.target.database='loan_manager_dev',x=>x.applied.services.command.trafficPercent=99,x=>x.applied.services.jobs={...x.applied.services.jobs,image:image.replace(/b/g,'d')},x=>x.sql.targetVersion=92,x=>x.frontend.files[0].sha256='d'.repeat(64)]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(appOnlyHostingPlan(candidate));}
 await writeFile(path.join(artifact,'sw.js'),content['sw.js'].replace('mw-credit-prod-public-','mw-credit-dev-public-'));const altered=structuredClone(m);altered.frontend.files.find(x=>x.path==='sw.js').sha256=createHash('sha256').update(content['sw.js'].replace('mw-credit-prod-public-','mw-credit-dev-public-')).digest('hex');await assert.rejects(appOnlyHostingPlan(altered),/worker/);
});

const frontendSteps=['Run npm run check','Run npm run build:live-dev','Run npm audit --omit=dev --audit-level=moderate','Run terraform fmt -check -recursive infrastructure','Run terraform -chdir=infrastructure/dev init -backend=false','Run terraform -chdir=infrastructure/dev validate','Run terraform -chdir=infrastructure/dev-dns init -backend=false','Run terraform -chdir=infrastructure/dev-dns validate'];
function frontendReceipt(){return {run:{id:123,repository:{full_name:'welct0407/MW-Credit-App'},path:'.github/workflows/ci.yml',head_sha:'a'.repeat(40),event:'pull_request',status:'completed',conclusion:'success'},jobs:[{steps:[...frontendSteps.map(name=>({name,conclusion:'success'})),{name:'Run npm run test:e2e',conclusion:'skipped'}]}]};}
test('R061 frontend CI requires executed build, unit, audit and Terraform while reporting skipped browser truthfully',()=>{
 const receipt=frontendReceipt();assert.deepEqual(validateFrontendCi(receipt,'a'.repeat(40)),{runId:123,browser:'skipped'});
 for(const name of frontendSteps){const bad=structuredClone(receipt);bad.jobs[0].steps.find(step=>step.name===name).conclusion='skipped';assert.throws(()=>validateFrontendCi(bad,'a'.repeat(40)),/missing executed/)}
 for(const mutate of [r=>r.run.head_sha='b'.repeat(40),r=>r.run.conclusion='failure',r=>r.run.event='workflow_dispatch',r=>r.run.repository.full_name='other/repo',r=>r.jobs[0].steps.at(-1).conclusion='failure']){const bad=structuredClone(receipt);mutate(bad);assert.throws(()=>validateFrontendCi(bad,'a'.repeat(40)))}
});
test('R061 apply re-reads actual CI and rejects changed source or failed executed check',async()=>{
 const receipt=frontendReceipt(),calls=[],m={sourceCommit:'a'.repeat(40),applicationCi:receipt};
 const readGithub=async args=>{calls.push(args);return args[1].includes('/jobs?')?{jobs:receipt.jobs}:receipt.run};
 assert.equal((await verifyFrontendOnlyLivePackage(m,{readGithub})).browser,'skipped');assert.equal(calls.length,2);
 receipt.jobs[0].steps[0].conclusion='failure';await assert.rejects(verifyFrontendOnlyLivePackage(m,{readGithub}),/missing executed/);
});
test('R061 parity permits only frontend and tests; delivery-only correction cannot smuggle API, SQL or dirty inputs',()=>{
 const baseline='66af7a5bea4c69a108b0eee96d6386d6134cba47',source='a'.repeat(40),tool='b'.repeat(40);
 const m={sourceCommit:source,artifactSourceCommit:source,sourceBaseline:baseline,repoRoot:path.resolve('.'),artifactRoot:path.resolve('dist'),deliveryToolSource:tool,deliveryToolChecks:{command:'node --test tests/unit/business-hosting-delivery.test.mjs',exitCode:0}};
 const git=({changed='apps/pwa/src/LoanRecord.tsx\ntests/e2e/back-consumers-independent.spec.ts',delivery='scripts/promotion/deploy-business-hosting.mjs',dirty='',untracked=''}={})=>(_root,args)=>args[0]==='rev-parse'?(args[1]==='HEAD'?tool:source):args[0]==='merge-base'?baseline:args[0]==='ls-files'?untracked:args.includes('--')?dirty:args[2]===baseline?changed:delivery;
 assert.doesNotThrow(()=>validateFrontendSource(m,git()));
 for(const changed of ['services/production/business-server.mjs','database/migrations/V092.sql','package-lock.json','infrastructure/prod/main.tf','.github/workflows/ci.yml','scripts/production/build-business-candidate.mjs'])assert.throws(()=>validateFrontendSource(m,git({changed})),/non-frontend/);
 assert.throws(()=>validateFrontendSource(m,git({delivery:'apps/pwa/src/LoanRecord.tsx'})),/delivery-only/);
 assert.throws(()=>validateFrontendSource(m,git({dirty:'services/production/business-server.mjs'})),/working/);
 assert.throws(()=>validateFrontendSource(m,git({untracked:'services/new.mjs'})),/untracked/);
 assert.throws(()=>validateFrontendSource({...m,sourceBaseline:source},git()),/baseline/);
});
test('R061 contract rejects wrong scope and runtime apply fields without weakening R059',async()=>{
 await assert.rejects(frontendOnlyHostingPlan({schemaVersion:3,release:'R062',environment:'prod',scope:'frontend-only',status:'prepared'}),/package kind/);
 await assert.rejects(frontendOnlyHostingPlan({schemaVersion:3,release:'R061',environment:'prod',scope:'frontend-only',status:'prepared',sql:{}}),/must not apply/);
 await assert.rejects(appOnlyHostingPlan({schemaVersion:3,release:'R061',environment:'prod',scope:'frontend-only',status:'prepared'}),/package kind/);
});

async function settingsFixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'mw-hosting-unit-'));t.after(()=>rm(root,{recursive:true,force:true}));const hash=x=>createHash('sha256').update(x).digest('hex');
 const run=args=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim()};run(['init']);await mkdir(path.join(root,'Documents'));const record='Synthetic R062 focused browser record\n';await writeFile(path.join(root,'Documents/Development_Changes.md'),record);run(['add','Documents/Development_Changes.md']);run(['-c','user.name=Synthetic','-c','user.email=test@example.invalid','commit','-m','synthetic fixture']);const evidenceCommit=run(['rev-parse','HEAD']);
 const artifact=path.join(root,'frontend');await mkdir(path.join(artifact,'assets'),{recursive:true});const project='clever-oasis-508610-n7',publicVersion='a'.repeat(24),entry='/assets/test.js',config={schemaVersion:1,environment:'prod',canonicalOrigin:'https://lm.mw-credit.com',notificationsEnabled:true,firebase:{projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'AIza'+'x'.repeat(35),appId:'1:737787224638:web:abc123'},readerOrigin:'https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app',commandOrigin:'https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app'};
 const content={'index.html':`<script type="module" src="${entry}"></script>`,'production-public-config.json':JSON.stringify(config),'build-mode.json':JSON.stringify({schemaVersion:1,mode:'live-prod'}),'build-version.json':JSON.stringify({schemaVersion:1,version:publicVersion,entry}),'sw.js':`const VERSION = '${publicVersion}';\nconst PREFIX = 'mw-credit-prod-public-';\nconst APP_ASSETS = ["${entry}"];`,'manifest.webmanifest':'{}','assets/test.js':JSON.stringify(config)},files=[];
 for(const[name,value]of Object.entries(content)){await writeFile(path.join(artifact,name),value);files.push({path:name,sha256:hash(value)})}
 const source='a'.repeat(40),frontend='b'.repeat(40),command='c'.repeat(40),tool='d'.repeat(40),baseline='7bc94b1920f7a8f6033b5d8a641f254eb38b020a',migration='V92__editable_application_settings.sql',sqlFiles={'database/migrations/V1__first.sql':'-- synthetic original\n',['database/migrations/'+migration]:'-- synthetic V92 raw bytes\r\n'};
 const git=(_root,args)=>{if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];if(args[0]==='merge-base')return args[1];if(args[0]==='ls-files')return '';if(args[0]==='ls-tree')return Object.keys(sqlFiles).join('\n');if(args[0]==='show')return sqlFiles[args[1].split(':').slice(1).join(':')];if(args[0]==='diff'){if(args[2]===baseline)return 'database/migrations/'+migration;if(!args.includes('--'))return 'scripts/promotion/deploy-business-hosting.mjs';return ''}throw Error('Unexpected synthetic Git command '+args)};
 const proof=async(name,value)=>{const file=path.join(root,name),bytes=JSON.stringify(value);await writeFile(file,bytes);return{path:file,sha256:hash(bytes)}};
 const releaseManifest=await proof('release.json',{environment:'development',commit:source,validationReference:'Synthetic successful canonical CI',migrations:Object.entries(sqlFiles).map(([name,sql])=>({name:path.posix.basename(name),sha256:hash(sql)}))}),maintenanceRecord=await proof('maintenance.json',{result:{restoreState:{version:3,context:{database:'loan_manager_prod'}}},restoration:{mode:'authority-restored'},restoredAt:'2026-10-15T01:00:00Z'}),planPath=path.join(root,'plan.json');await writeFile(planPath,'synthetic reviewed command-only plan');
 const image=`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api@sha256:`+'e'.repeat(64),old=image.replace(/e{64}$/,'f'.repeat(64)),services=Object.fromEntries(['read','command','notify','jobs'].map(role=>[role,{revision:`mw-credit-app-${role}-prod-00001-abc`,image:old}])),ci=frontendReceipt();ci.run.head_sha=source;
 const m={schemaVersion:4,release:'R062',environment:'prod',scope:'command-sql-frontend',status:'applied',sourceBaseline:baseline,sourceCommit:source,artifactSourceCommit:frontend,deliveryToolSource:tool,deliveryToolChecks:{command:'node --test tests/unit/business-hosting-delivery.test.mjs tests/unit/r053-operator-tooling.test.mjs',exitCode:0},repoRoot:root,artifactRoot:artifact,target:{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'},applicationCi:ci,focusedBrowser:{sourceCommit:source,passed:8,failed:0,skipped:0,commands:['npx playwright test tests/e2e/phase5-final-ui-independent.spec.ts --grep R062'],evidence:{repository:root,path:'Documents/Development_Changes.md',commit:evidenceCommit,sha256:hash(record)}},build:{sourceCommit:command,status:'SUCCESS',image,id:'synthetic-build',storageSource:{bucket:'synthetic',object:'source.tgz',generation:'1'}},plan:{actions:['command.image'],path:planPath,sha256:hash('synthetic reviewed command-only plan')},rollback:{hostingVersion:`sites/${site}/versions/prior`,hostingRelease:`sites/${site}/releases/123`,services},sql:{baselineVersion:91,targetVersion:92,migrations:[{name:migration,sha256:hash(sqlFiles['database/migrations/'+migration])}],releaseManifest,checks:{sourceCommit:source,run:{...ci.run,id:124,path:'.github/workflows/database.yml'},jobs:[{steps:['Reject modifications to existing migrations','Verify transferred migration bytes','Rebuild and validate disposable database'].map(name=>({name,conclusion:'success'}))}]},applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',sourceCommit:source,baselineVersion:91,targetVersion:92,migrationSha256:hash(sqlFiles['database/migrations/'+migration]),validationSuccessful:true,migrationsExecuted:1,verifiedAt:'2026-10-15T01:00:00Z',maintenanceRecord,restorationMode:'authority-restored'}},applied:{sourceCommit:source,planSha256:hash('synthetic reviewed command-only plan'),database:'loan_manager_prod',sqlVersion:92,services:{...structuredClone(services),command:{revision:'mw-credit-app-command-prod-00002-def',image,ready:true,trafficPercent:100}}},frontend:{publicVersion,entry,files}};
 return{m,git,hash,content,sqlFiles,artifact};
}

test('R062 Hosting accepts exact split-source command/V92/frontend package and rejects changed evidence or preservation',async t=>{
 const f=await settingsFixture(t),{m,git}=f;assert.equal((await settingsHostingPlan(m,{git})).site,site);
 for(const mutate of[x=>x.scope='app-only',x=>x.target.database='loan_manager_dev',x=>x.sql.targetVersion=93,x=>x.sql.migrations.push(x.sql.migrations[0]),x=>x.sql.migrations[0].sha256='0'.repeat(64),x=>x.sql.releaseManifest.sha256='0'.repeat(64),x=>x.sql.checks.jobs[0].steps[0].conclusion='skipped',x=>x.sql.applied.validationSuccessful=false,x=>x.sql.applied.migrationsExecuted=2,x=>x.sql.applied.maintenanceRecord.sha256='0'.repeat(64),x=>x.sql.applied.restorationMode='authority-prepared',x=>x.plan.actions=['reader.image','command.image'],x=>x.plan.sha256='0'.repeat(64),x=>x.applied.services.read.image=x.build.image,x=>x.applied.services.jobs.revision+='changed',x=>x.applied.services.command.trafficPercent=99,x=>x.focusedBrowser.failed=1,x=>x.applicationCi.run.head_sha='0'.repeat(40),x=>x.frontend.files[0].sha256='0'.repeat(64)]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(settingsHostingPlan(candidate,{git}))}
 const prepared={...m,status:'prepared'};await assert.rejects(settingsHostingPlan(prepared,{git}),/apply readback/);assert.equal((await settingsHostingPlan(prepared,{git,requireApplied:false})).site,site);
 const release={environment:'development',commit:m.deliveryToolSource,validationReference:'Synthetic tool-only source parity',migrations:Object.entries(f.sqlFiles).map(([name,sql])=>({name:path.posix.basename(name),sha256:f.hash(sql)}))};await writeFile(m.sql.releaseManifest.path,JSON.stringify(release));m.sql.releaseManifest.sha256=f.hash(JSON.stringify(release));assert.equal((await settingsHostingPlan(m,{git})).site,site);release.commit='0'.repeat(40);await writeFile(m.sql.releaseManifest.path,JSON.stringify(release));m.sql.releaseManifest.sha256=f.hash(JSON.stringify(release));await assert.rejects(settingsHostingPlan(m,{git}),/tested SQL release/);
});

test('R062 backup parser accepts only reviewed baselines without private access',()=>{
 const script=`import ast,argparse,contextlib,io,pathlib
tree=ast.parse(pathlib.Path('scripts/database/Backup-ProductionPromotion.py').read_text(encoding='utf-8'))
nodes=[n for n in tree.body if (isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='parser' for t in n.targets)) or (isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and isinstance(n.value.func.value,ast.Name) and n.value.func.value.id=='parser' and n.value.func.attr=='add_argument')]
ns={'argparse':argparse};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<synthetic parser>','exec'),ns)
for version in [77,87,89,90,91,92,93]:
 assert ns['parser'].parse_args(['--approval-reference','synthetic','--expected-version',str(version)]).expected_version==version
for version in [76,88,94]:
 try:
  with contextlib.redirect_stderr(io.StringIO()): ns['parser'].parse_args(['--approval-reference','synthetic','--expected-version',str(version)])
 except SystemExit as error: assert error.code==2
 else: raise AssertionError('Unsupported backup baseline accepted')
print('Eight parser cases passed; no script imports, credentials or connection.')`;
 const r=spawnSync('python',['-c',script],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Eight parser cases passed/);
});

test('R062 keyless proof uses its own release audience and rejects older proof',async()=>{
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com',project='clever-oasis-508610-n7',aud='https://lm.mw-credit.com/promotion/r062';
 const run=async(proofAudience=aud)=>{const rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release:'R062',request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience}}})};await run();await assert.rejects(run('https://lm.mw-credit.com/promotion/r059'),/impersonation proof/);
});

test('R062 source parity rejects runtime drift, changed migration scope and tool smuggling',async t=>{
 const {m,git}=await settingsFixture(t);assert.doesNotThrow(()=>validateSettingsSource(m,git));
 for(const changed of['services/business/borrowers.mjs','package-lock.json'])assert.throws(()=>validateSettingsSource(m,(root,args)=>args[0]==='diff'&&args[2]===m.build.sourceCommit?changed:git(root,args)),/input parity/);
 assert.throws(()=>validateSettingsSource(m,(root,args)=>args[0]==='diff'&&args[2]===m.sourceBaseline?'database/migrations/V92__editable_application_settings.sql\ndatabase/migrations/V93__unapproved.sql':git(root,args)),/only immutable/);
 assert.throws(()=>validateSettingsSource(m,(root,args)=>args[0]==='diff'&&!args.includes('--')?'services/production/business-server.mjs':git(root,args)),/delivery correction/);
 assert.throws(()=>validateSettingsSource(m,(root,args)=>args[0]==='ls-files'?'services/new.mjs':git(root,args)),/working input drift/);
});

test('R062 live verification checks actual command build, all service identities and truthful CI readback',async t=>{
 const {m}=await settingsFixture(t);const responses=()=>[{status:'SUCCESS',source:{storageSource:m.build.storageSource},results:{images:[{name:'asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api:synthetic',digest:'sha256:'+'e'.repeat(64)}]}},...['read','command','notify','jobs'].map(role=>({name:`projects/clever-oasis-508610-n7/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,template:{serviceAccount:`mw-credit-app-${role}-prod@clever-oasis-508610-n7.iam.gserviceaccount.com`,containers:[{image:m.applied.services[role].image,env:Object.entries({DB_NAME:'loan_manager_prod',INSTANCE_CONNECTION_NAME:m.target.connectionName,DB_USER:`mw-credit-app-${role}-prod@clever-oasis-508610-n7.iam`,PWA_NOTIFICATIONS:'enabled'}).map(([name,value])=>({name,value}))}]},latestReadyRevision:'revisions/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{revision:m.applied.services[role].revision,percent:100}]}))];
 const run=async(rows,ci=m.applicationCi)=>{let calls=0;await verifySettingsLivePackage(m,{token:'synthetic',request:async()=>({ok:true,json:async()=>rows[calls++]}),readGithub:async args=>{const receipt=args[1].includes('/124')?m.sql.checks:ci;return args[1].includes('/jobs?')?{jobs:receipt.jobs}:receipt.run}});assert.equal(calls,5)};await run(responses());
 for(const mutate of[rows=>rows[0].source.storageSource={...m.build.storageSource,generation:'other'},rows=>rows[2].template.serviceAccount='other',rows=>rows[1].template.containers[0].env[0].value='loan_manager_dev',rows=>rows[3].trafficStatuses[0].percent=99]){const rows=structuredClone(responses());mutate(rows);await assert.rejects(run(rows))}
 const bad=structuredClone(m.applicationCi);bad.jobs[0].steps[0].conclusion='skipped';await assert.rejects(run(responses(),bad),/missing executed/);
});

// R063: one image on all four services, V92 unchanged, reused input-equivalent CI.
const runtimeBaseline='2f63e3d1f907549cf1ccbd6cd4feb5f73310b6e1';
function runtimeGit({source,tool=source,changed={},delivery='',dirty='',untracked='',migration=''}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='diff'){
   if(args[2]===runtimeBaseline&&args[3]===source)return migration;
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return delivery;
   if(args[3]===source)return changed[args[2]]??'';
   return dirty;
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
function runtimeReceipt(kind,head){
 const jobs={full:['check','e2e (shard 1 of 3)','e2e (shard 2 of 3)','e2e (shard 3 of 3)','terraform','lint'],check:['check','lint'],database:['guards','rebuild (migrations)','rebuild (phase5)','rebuild (phase8)','rebuild (receiving)']}[kind];
 return {run:{id:{full:11,check:12,database:13}[kind],repository:{full_name:'welct0407/MW-Credit-App'},path:kind==='database'?'.github/workflows/database.yml':'.github/workflows/ci.yml',head_sha:head,event:'push',status:'completed',conclusion:'success'},jobs:jobs.map(name=>({name,conclusion:name==='lint'?'failure':'success'}))};
}
async function runtimePackage(t){
 const root=await mkdtemp(path.join(tmpdir(),'mw-r063-unit-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const artifact=path.join(root,'frontend');await mkdir(path.join(artifact,'assets'),{recursive:true});const project='clever-oasis-508610-n7',version='c'.repeat(24),entry='/assets/test.js';
 const config={schemaVersion:1,environment:'prod',canonicalOrigin:'https://lm.mw-credit.com',notificationsEnabled:true,firebase:{projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'AIza'+'x'.repeat(35),appId:'1:737787224638:web:abc123'},readerOrigin:'https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app',commandOrigin:'https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app'};
 const content={'index.html':`<script type="module" src="${entry}"></script>`,'production-public-config.json':JSON.stringify(config),'build-mode.json':JSON.stringify({schemaVersion:1,mode:'live-prod'}),'build-version.json':JSON.stringify({schemaVersion:1,version,entry}),'sw.js':`const VERSION = '${version}';\nconst PREFIX = 'mw-credit-prod-public-';\nconst APP_ASSETS = ["${entry}"];`,'manifest.webmanifest':'{}','assets/test.js':JSON.stringify(config)};
 const files=[];for(const [name,value]of Object.entries(content)){await writeFile(path.join(artifact,name),value);files.push({path:name,sha256:createHash('sha256').update(value).digest('hex')});}
 const planPath=path.join(root,'production.tfplan');await writeFile(planPath,'plan');
 const old=role=>`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api@sha256:`+role[0].repeat(64).replace(/[^a-f0-9]/g,'d');
 const image=`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api@sha256:`+'e'.repeat(64),source='1'.repeat(40),tool='2'.repeat(40),ci='3'.repeat(40);
 const roles=['read','command','notify','jobs'];
 return {root,image,source,tool,ci,m:{schemaVersion:5,release:'R063',environment:'prod',scope:'runtime-workers-frontend',status:'applied',sourceCommit:source,artifactSourceCommit:source,sourceBaseline:runtimeBaseline,deliveryToolSource:tool,deliveryToolChecks:{command:'node --test tests/unit/business-hosting-delivery.test.mjs',exitCode:0},repoRoot:root,artifactRoot:artifact,
  target:{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'},
  sql:{baselineVersion:92,targetVersion:92,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'92',allSuccessful:true}},
  applicationCi:{full:runtimeReceipt('full',ci),check:runtimeReceipt('check',ci),database:runtimeReceipt('database',ci)},
  build:{id:'build-1',sourceCommit:source,status:'SUCCESS',image,storageSource:{bucket:'b',object:'o',generation:'1'}},
  plan:{sha256:createHash('sha256').update('plan').digest('hex'),path:planPath,counts:{add:0,change:4,destroy:0},actions:['read.image','command.image','notify.image','jobs.image','notify.callerSubjects','jobs.callerSubjects']},
  rollback:{hostingVersion:`sites/${site}/versions/old123`,hostingRelease:`sites/${site}/releases/1792033365993000`,services:Object.fromEntries(roles.map(role=>[role,{image:old(role),revision:`mw-credit-app-${role}-prod-00001-old`}]))},
  applied:{sourceCommit:source,planSha256:createHash('sha256').update('plan').digest('hex'),database:'loan_manager_prod',sqlVersion:92,services:Object.fromEntries(roles.map(role=>[role,{image,revision:`mw-credit-app-${role}-prod-00002-new`,ready:true,trafficPercent:100}]))},
  frontend:{publicVersion:version,entry,files}}};
}
test('R063 runtime package validates and rejects plan, SQL, CI, readback and artifact tampering',async t=>{
 const {m,source,tool}=await runtimePackage(t),git=runtimeGit({source,tool});
 const plan=await runtimeHostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingRelease,m.rollback.hostingRelease);
 assert.ok(plan.headers.some(rule=>rule.glob==='**'&&/frame-ancestors 'none'/.test(rule.headers['Content-Security-Policy'])&&rule.headers['X-Frame-Options']==='DENY'));
 for(const [mutate,pattern] of [[x=>x.plan.counts.destroy=1,/four-service plan/],[x=>x.plan.actions.pop(),/four-service plan/],[x=>x.sql.targetVersion=93,/V92/],[x=>x.sql.verified.allSuccessful=false,/V92/],[x=>x.applicationCi.full.jobs.splice(1,1),/missing executed e2e/],[x=>x.applicationCi.database.run.conclusion='failure',/database CI/],[x=>x.applicationCi.check.run.path='.github/workflows/database.yml',/check CI/],[x=>x.applied.services.jobs.revision=x.rollback.services.jobs.revision,/readback/],[x=>x.applied.services.notify.image=x.rollback.services.notify.image,/readback/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],[x=>x.release='R062',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(runtimeHostingPlan(candidate,{git}),pattern);}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(runtimeHostingPlan(prepared,{git}),/apply\/readback/);assert.equal((await runtimeHostingPlan(prepared,{git,requireApplied:false})).site,site);
});
test('R063 source and reused CI must be input-equivalent; delivery correction cannot smuggle runtime',async t=>{
 const {m,source,tool,ci}=await runtimePackage(t);
 assert.doesNotThrow(()=>validateRuntimeSource(m,runtimeGit({source,tool,delivery:'scripts/promotion/deploy-business-hosting.mjs\nproject/Documents/Release_Tracker.md'})));
 assert.throws(()=>validateRuntimeSource(m,runtimeGit({source,tool,delivery:'services/production/business-server.mjs'})),/delivery correction/);
 assert.throws(()=>validateRuntimeSource(m,runtimeGit({source,tool,migration:'database/migrations/V93__x.sql'})),/no migration/);
 assert.throws(()=>validateRuntimeSource(m,runtimeGit({source,tool,dirty:'services/production/business-server.mjs'})),/working input/);
 assert.throws(()=>validateRuntimeSource(m,runtimeGit({source,tool,untracked:'services/new.mjs'})),/untracked/);
 assert.throws(()=>validateRuntimeSource({...m,sourceBaseline:source},runtimeGit({source,tool})),/baseline/);
 assert.deepEqual(Object.keys(validateRuntimeCi(m.applicationCi,m,runtimeGit({source,tool}))),['full','check','database']);
 assert.throws(()=>validateRuntimeCi(m.applicationCi,m,runtimeGit({source,tool,changed:{[ci]:'apps/pwa/src/live-main.tsx'}})),/not input-equivalent/);
});
test('R063 live verification re-reads CI and requires caller subjects on both workers',async t=>{
 const {m,source,tool,image}=await runtimePackage(t),git=runtimeGit({source,tool});
 const project='clever-oasis-508610-n7';
 const service=(role,subjects=true)=>({name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,containers:[{image,env:[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`},...(role==='command'?[{name:'PWA_NOTIFICATIONS',value:'enabled'}]:[]),...(subjects&&['notify','jobs'].includes(role)?[{name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})}]:[])]}]}});
 const make=(subjects=true)=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+'e'.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),subjects)});
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyRuntimeLivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyRuntimeLivePackage(m,{token:'t',request:make(false),readGithub,git}),/caller subjects/);
 await assert.rejects(verifyRuntimeLivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=readGithub(args);return args[1].includes('/jobs')?{jobs:r.jobs.filter(j=>j.name!=='terraform')}:r;},git}),/terraform/);
});

// R064: one image on all four services after the separately applied V93; image-only plan.
const waveBaseline='37f62121e9b04a163ebfa014e3240841b46d9a96',waveMigration='database/migrations/V93__review_wave4_hygiene.sql';
function waveGit({source,tool=source,changed={},delivery='',dirty='',untracked='',migration=waveMigration}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='diff'){
   if(args[2]===waveBaseline&&args[3]===source)return migration;
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return delivery;
   if(args[3]===source)return changed[args[2]]??'';
   return dirty;
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function wavePackage(t){
 const p=await runtimePackage(t),m=p.m;
 Object.assign(m,{schemaVersion:6,release:'R064',sourceBaseline:waveBaseline,sql:{baselineVersion:93,targetVersion:93,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'93',allSuccessful:true,verifiedAt:'2026-10-16T15:40:00Z'}}});
 m.plan.actions=['read.image','command.image','notify.image','jobs.image'];m.applied.sqlVersion=93;
 return p;
}
test('R064 package validates and rejects plan, SQL, CI, readback and artifact tampering',async t=>{
 const {m,source,tool}=await wavePackage(t),git=waveGit({source,tool});
 const plan=await waveHostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingRelease,m.rollback.hostingRelease);
 assert.ok(plan.headers.some(rule=>rule.glob==='**'&&/frame-ancestors 'none'/.test(rule.headers['Content-Security-Policy'])&&rule.headers['X-Frame-Options']==='DENY'));
 for(const [mutate,pattern] of [[x=>x.plan.counts.change=5,/four-image plan/],[x=>x.plan.actions.push('notify.callerSubjects'),/four-image plan/],[x=>x.sql.targetVersion=94,/V93/],[x=>x.sql.migrations=[{name:'V94__x.sql'}],/V93/],[x=>x.sql.verified.latestVersion='92',/V93/],[x=>x.sql.verified.allSuccessful=false,/V93/],[x=>delete x.sql.verified.verifiedAt,/V93/],[x=>x.applied.sqlVersion=92,/applied source/],[x=>x.applicationCi.full.jobs.splice(1,1),/missing executed e2e/],[x=>x.applicationCi.database.run.conclusion='failure',/database CI/],[x=>x.applied.services.read.revision=x.rollback.services.read.revision,/readback/],[x=>x.applied.services.jobs.image=x.rollback.services.jobs.image,/readback/],[x=>x.build.sourceCommit='4'.repeat(40),/provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],[x=>x.release='R063',/package kind/],[x=>x.schemaVersion=5,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(waveHostingPlan(candidate,{git}),pattern);}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(waveHostingPlan(prepared,{git}),/apply\/readback/);assert.equal((await waveHostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(runtimeHostingPlan(m,{git}),/package kind/);
});
test('R064 sync correction plan adds only command scaling and read/command startup boost',async t=>{
 const {m,source,tool}=await wavePackage(t),git=waveGit({source,tool});
 m.plan.actions=['read.image','command.image','notify.image','jobs.image','command.maxInstances','read.startupCpuBoost','command.startupCpuBoost'];
 assert.equal((await waveHostingPlan(m,{git})).site,site);
 for(const mutate of [x=>x.plan.actions.push('notify.startupCpuBoost'),x=>x.plan.actions.splice(4,1),x=>x.plan.actions.reverse(),x=>{x.plan.counts.change=5}]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(waveHostingPlan(candidate,{git}),/four-image plan/);}
});
test('R064 source carries only V93; CI must be an equivalent ancestor or the delivery-only tool commit',async t=>{
 const {m,source,tool,ci}=await wavePackage(t);
 assert.doesNotThrow(()=>validateWaveSource(m,waveGit({source,tool,delivery:'scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs'})));
 assert.throws(()=>validateWaveSource(m,waveGit({source,tool,delivery:'apps/pwa/src/offline-sync.ts'})),/delivery correction/);
 for(const migration of ['','database/migrations/V93__review_wave4_hygiene.sql\ndatabase/migrations/V94__x.sql','database/migrations/V94__x.sql'])assert.throws(()=>validateWaveSource(m,waveGit({source,tool,migration})),/V93/);
 assert.throws(()=>validateWaveSource(m,waveGit({source,tool,dirty:'services/business/borrowers.mjs'})),/working input/);
 assert.throws(()=>validateWaveSource(m,waveGit({source,tool,untracked:'services/new.mjs'})),/untracked/);
 assert.throws(()=>validateWaveSource({...m,sourceBaseline:runtimeBaseline},waveGit({source,tool})),/baseline/);
 assert.deepEqual(Object.keys(validateWaveCi(m.applicationCi,m,waveGit({source,tool}))),['full','check','database']);
 assert.throws(()=>validateWaveCi(m.applicationCi,m,waveGit({source,tool,changed:{[ci]:'services/payment-command/store.mjs'}})),/not input-equivalent/);
 const atTool=structuredClone(m.applicationCi);for(const kind of ['full','check'])atTool[kind].run.head_sha=tool;
 assert.deepEqual(validateWaveCi(atTool,m,waveGit({source,tool,delivery:'scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs',changed:{[tool]:'scripts/promotion/deploy-business-hosting.mjs'}})).full.headSha,tool);
 assert.throws(()=>validateWaveCi(atTool,m,waveGit({source,tool,delivery:'apps/pwa/src/offline-sync.ts',changed:{[tool]:'apps/pwa/src/offline-sync.ts'}})),/not input-equivalent/);
 const later=structuredClone(m.applicationCi);later.check.run.head_sha='5'.repeat(40);
 assert.throws(()=>validateWaveCi(later,m,waveGit({source,tool,changed:{['5'.repeat(40)]:'apps/pwa/src/live-main.tsx'}})),/not input-equivalent/);
});
test('R064 live verification re-reads CI and keeps the worker caller subjects',async t=>{
 const {m,source,tool,image}=await wavePackage(t),git=waveGit({source,tool});
 const project='clever-oasis-508610-n7';
 const service=(role,subjects=true)=>({name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,containers:[{image,env:[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`},...(role==='command'?[{name:'PWA_NOTIFICATIONS',value:'enabled'}]:[]),...(subjects&&['notify','jobs'].includes(role)?[{name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})}]:[])]}]}});
 const make=(subjects=true,digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),subjects)});
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyWaveLivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyWaveLivePackage(m,{token:'t',request:make(false),readGithub,git}),/caller subjects/);
 await assert.rejects(verifyWaveLivePackage(m,{token:'t',request:make(true,'f'),readGithub,git}),/build digest/);
 await assert.rejects(verifyWaveLivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=readGithub(args);return args[1].includes('/jobs')?{jobs:r.jobs.filter(j=>j.name!=='terraform')}:r;},git}),/terraform/);
});

// R065: Hosting-only on the unchanged R064 runtime; source descends from the R064 release.
const r064Release='9420c8599ce593eeeaafc1e68a235ab3d1d08d8c';
async function r065Package(t){
 const p=await wavePackage(t),m=p.m;
 m.runtime={services:Object.fromEntries(Object.entries(m.applied.services).map(([role,s])=>[role,{image:s.image,revision:s.revision}]))};
 Object.assign(m,{schemaVersion:7,release:'R065',scope:'frontend-only',status:'prepared',sourceBaseline:r064Release,rollback:{hostingVersion:m.rollback.hostingVersion,hostingRelease:m.rollback.hostingRelease}});
 delete m.build;delete m.plan;delete m.applied;
 return p;
}
test('R065 Hosting-only package validates and rejects runtime, SQL, baseline and CI changes',async t=>{
 const {m,source,tool,ci}=await r065Package(t),git=waveGit({source,tool});
 const plan=await r065HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [[x=>{x.build={id:'b'}},/must not apply/],[x=>{x.plan={}},/must not apply/],[x=>{x.status='applied'},/package kind/],[x=>{x.schemaVersion=6},/package kind/],[x=>{x.sourceBaseline='37f62121e9b04a163ebfa014e3240841b46d9a96'},/baseline/],[x=>{x.sql.targetVersion=94},/V93/],[x=>{x.sql.migrations=[{name:'V94__x.sql'}]},/V93/],[x=>{x.runtime.services.command.revision='bad'},/runtime pins/],[x=>{delete x.runtime},/runtime pins/],[x=>{x.applicationCi.full.jobs.splice(1,1)},/R065 full CI missing executed e2e/],[x=>{x.target.database='loan_manager_dev'},/target/],[x=>{x.frontend.files[0].sha256='d'.repeat(64)},/artifact/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r065HostingPlan(candidate,{git}),pattern);}
 for(const file of ['services/business/offline-dataset-chunks.mjs','database/migrations/V94__x.sql','infrastructure/production/runtime.tf','Dockerfile','package-lock.json'])await assert.rejects(r065HostingPlan(m,{git:waveGit({source,tool,changed:{[r064Release]:file}})}),/must not change the R064 runtime/);
 assert.doesNotThrow(()=>validateR065Source(m,waveGit({source,tool,changed:{[r064Release]:''},delivery:'scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nproject/Documents/Release_Tracker.md'})));
 assert.throws(()=>validateR065Source(m,waveGit({source,tool,delivery:'apps/pwa/src/live-main.tsx'})),/delivery correction/);
 assert.throws(()=>validateR065Source(m,waveGit({source,tool,dirty:'apps/pwa/src/live-main.tsx'})),/working input/);
 await assert.rejects(r065HostingPlan(m,{git:waveGit({source,tool,changed:{[ci]:'apps/pwa/src/live-main.tsx'}})}),/R065 full CI is not input-equivalent/);
});
test('R065 live verification re-reads CI and requires the pinned R064 runtime',async t=>{
 const {m,source,tool}=await r065Package(t),git=waveGit({source,tool});
 const make=(drift)=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=m.runtime.services[role];return {ok:true,json:async()=>({latestReadyRevision:'x/'+pin.revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{containers:[{image:drift===role?pin.image.replace(/.$/,'0'):pin.image}]}})};};
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyR065LivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyR065LivePackage(m,{token:'t',request:make('jobs'),readGithub,git}),/live runtime differs/);
 await assert.rejects(verifyR065LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=readGithub(args);return args[1].includes('/jobs')?{jobs:r.jobs.filter(j=>j.name!=='terraform')}:r;},git}),/terraform/);
});

// R066: the same Hosting-only shape; source descends from R065, runtime still compared with R064.
const r065Release='74ad26b57dcfb9effea86d638b7d112cffe042c5';
test('R066 Hosting-only package descends from R065 and keeps the R064 runtime',async t=>{
 const {m,source,tool}=await r065Package(t),git=waveGit({source,tool});
 Object.assign(m,{schemaVersion:8,release:'R066',sourceBaseline:r065Release});
 assert.equal((await hostingOnlyPlan(m,{git})).site,site);
 for(const [mutate,pattern] of [[x=>{x.sourceBaseline=r064Release},/exact R066 source\/baseline/],[x=>{x.schemaVersion=7},/wrong R066 package kind/],[x=>{x.release='R067'},/package kind/],[x=>{x.activation={}},/R066 package must not apply/],[x=>{x.runtime.services.read.image='bad'},/R066 unchanged runtime pins/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(hostingOnlyPlan(candidate,{git}),pattern);}
 await assert.rejects(hostingOnlyPlan(m,{git:waveGit({source,tool,changed:{[r064Release]:'services/business/offline-dataset-chunks.mjs'}})}),/R066 must not change the R064 runtime/);
 assert.throws(()=>validateHostingOnlySource(m,waveGit({source,tool,delivery:'apps/pwa/src/live-main.tsx'})),/R066 unverified delivery/);
 await assert.rejects(r065HostingPlan(m,{git}),/wrong R065 package kind/);
 const make=drift=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=m.runtime.services[role];return {ok:true,json:async()=>({latestReadyRevision:'x/'+(drift===role?'other':pin.revision),terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{containers:[{image:pin.image}]}})};};
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make('command'),readGithub,git}),/R066 live runtime differs/);
});

// R068: one image on all four services after the separately applied V94 and V95 (PROD 93 to 95).
const r067Release='7f8ef5332be6b50988abca8efcf74a8657cd35a0',sqlRelease='6'.repeat(40);
const r068Files={'V93__review_wave4_hygiene.sql':'-- v93','V94__job_run_contract_and_shared_lock_key.sql':'-- v94','V95__agent_role_session_pair.sql':'-- v95'};
function r068Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration='database/migrations/V94__job_run_contract_and_shared_lock_key.sql\ndatabase/migrations/V95__agent_role_session_pair.sql',releaseDatabase=''}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='ls-tree')return Object.keys(r068Files).map(name=>'database/migrations/'+name).join('\n');
  if(args[0]==='show')return r068Files[path.posix.basename(args[1].split(':')[1])];
  if(args[0]==='diff'){
   if(args[2]===r067Release&&args[3]===source)return migration;
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return delivery;
   if(args[2]===source&&args[3]===sqlRelease)return releaseDatabase;
   if(args[3]===source)return changed[args[2]]??'';
   return dirty;
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function r068Package(t){
 const p=await wavePackage(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:93,targetVersion:95,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r068Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:9,release:'R068',sourceBaseline:r067Release,sql:{baselineVersion:93,targetVersion:95,migrations:manifest.migrations.slice(1),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
  applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:93,targetVersion:95,migrationsExecuted:2,startedAt:'2026-10-17T04:08:33Z',finishedAt:'2026-10-17T04:09:10Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'b'.repeat(32)}},
  verified:{database:'loan_manager_prod',latestVersion:'95',historyRows:95,allSuccessful:true,verifiedAt:'2026-10-17T04:14:12Z'}}});
 m.applied.sqlVersion=95;m.applied.appliedAt='2026-10-17T04:10:52Z';
 return p;
}
test('R068 package validates and rejects SQL, plan, CI, readback and artifact tampering',async t=>{
 const {m,source,tool,root}=await r068Package(t),git=r068Git({source,tool});
 const plan=await r068HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [[x=>x.sql.targetVersion=94,/R068 exact V93 to V95/],[x=>x.sql.migrations.reverse(),/R068 exact V93 to V95/],[x=>x.sql.migrations.pop(),/R068 exact V93 to V95/],[x=>x.sql.migrations[0].sha256='0'.repeat(64),/migration source hash/],[x=>x.sql.release.sha256='0'.repeat(64),/SQL release changed/],[x=>x.sql.release.commit='7'.repeat(40),/tested SQL release/],[x=>x.sql.applied.migrationsExecuted=1,/actual SQL apply/],[x=>x.sql.applied.backup.restorePassed=false,/actual SQL apply/],[x=>x.sql.applied.instance='appsheet-pg-prod-20260914',/actual SQL apply/],[x=>x.sql.applied.finishedAt='2026-10-17T04:08:00Z',/actual SQL apply/],[x=>x.sql.verified.latestVersion='94',/V95 readback/],[x=>x.sql.verified.verifiedAt='2026-10-17T04:09:00Z',/V95 readback/],[x=>x.applied.sqlVersion=93,/R068 applied source/],[x=>x.applied.appliedAt='2026-10-17T04:00:00Z',/R068 applied source/],[x=>x.plan.actions.push('command.maxInstances'),/R068 reviewed four-image plan/],[x=>x.plan.counts.change=5,/four-image plan/],[x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R068 ready service/],[x=>x.applicationCi.full.jobs.splice(1,1),/R068 full CI missing executed e2e/],[x=>x.build.sourceCommit='4'.repeat(40),/provenance/],[x=>x.target.connectionName='clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],[x=>x.release='R064',/package kind/],[x=>x.schemaVersion=8,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r068HostingPlan(candidate,{git}),pattern);}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r068HostingPlan(prepared,{git}),/apply\/readback/);assert.equal((await r068HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(waveHostingPlan(m,{git}),/package kind/);
 const incomplete=JSON.parse(await readFile(m.sql.release.path,'utf8'));incomplete.migrations.shift();const shortPath=path.join(root,'short.json'),shortBytes=JSON.stringify(incomplete);await writeFile(shortPath,shortBytes);
 await assert.rejects(r068HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:shortPath,sha256:createHash('sha256').update(shortBytes).digest('hex'),commit:sqlRelease}}},{git}),/complete migration manifest/);
 await assert.rejects(r068HostingPlan(m,{git:r068Git({source,tool,releaseDatabase:'database/migrations/V95__agent_role_session_pair.sql'})}),/pinned source migrations/);
});
test('R068 source carries only V94 and V95 from R067; the delivery commit may add the backup tool',async t=>{
 const {m,source,tool}=await r068Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/database/Backup-ProductionPromotion.py\nproject/Documents/Release_Tracker.md';
 assert.doesNotThrow(()=>validateR068Source(m,r068Git({source,tool,delivery:toolFiles})));
 assert.throws(()=>validateR068Source(m,r068Git({source,tool,delivery:'services/business/borrowers.mjs'})),/R068 unverified delivery/);
 for(const migration of ['','database/migrations/V94__job_run_contract_and_shared_lock_key.sql','database/migrations/V94__job_run_contract_and_shared_lock_key.sql\ndatabase/migrations/V95__agent_role_session_pair.sql\ndatabase/migrations/V96__x.sql'])assert.throws(()=>validateR068Source(m,r068Git({source,tool,migration})),/V94 and V95/);
 assert.throws(()=>validateR068Source({...m,sourceBaseline:r064Release},r068Git({source,tool})),/R068 source\/baseline/);
 assert.throws(()=>validateR068Source(m,r068Git({source,tool,dirty:'apps/pwa/src/live-main.tsx'})),/R068 working input/);
 assert.throws(()=>validateR068Source(m,r068Git({source,tool,untracked:'services/new.mjs'})),/R068 untracked/);
 const atTool=structuredClone(m.applicationCi);for(const kind of ['full','check'])atTool[kind].run.head_sha=tool;m.applicationCi=atTool;
 assert.equal((await r068HostingPlan(m,{git:r068Git({source,tool,delivery:toolFiles})})).site,site);
 await assert.rejects(r068HostingPlan(m,{git:r068Git({source,tool,delivery:toolFiles+'\napps/pwa/src/live-main.tsx',changed:{[tool]:'apps/pwa/src/live-main.tsx'}})}),/R068 unverified delivery/);
});
test('R068 live verification re-reads CI, Cloud Build and the four services',async t=>{
 const {m,source,tool,image}=await r068Package(t),git=r068Git({source,tool});
 const project='clever-oasis-508610-n7';
 const service=role=>({name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,containers:[{image,env:[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`},...(role==='command'?[{name:'PWA_NOTIFICATIONS',value:'enabled'}]:[]),...(['notify','jobs'].includes(role)?[{name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})}]:[])]}]}});
 const make=(digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''))});
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyR068LivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyR068LivePackage(m,{token:'t',request:make('f'),readGithub,git}),/build digest/);
 await assert.rejects(verifyR068LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=readGithub(args);return args[1].includes('/jobs')?{jobs:r.jobs.filter(j=>j.name!=='terraform')}:r;},git}),/R068 full CI missing executed terraform/);
});
