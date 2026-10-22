import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {hashEntries,evidenceName,variantOf,loadStages} from '../../scripts/ci/reuse-evidence.mjs';
import {migrationHead} from '../migration-head.mjs';
import {executeBusinessHosting,appOnlyHostingPlan,verifyAppOnlyOperator,validateFrontendSource,validateFrontendCi,frontendOnlyHostingPlan,verifyFrontendOnlyLivePackage,validateSettingsSource,settingsHostingPlan,verifySettingsLivePackage,runtimeHostingPlan,validateRuntimeSource,validateRuntimeCi,verifyRuntimeLivePackage,waveHostingPlan,validateWaveSource,validateWaveCi,verifyWaveLivePackage,r065HostingPlan,validateR065Source,verifyR065LivePackage,hostingOnlyPlan,validateHostingOnlySource,verifyHostingOnlyLivePackage,r068HostingPlan,validateR068Source,verifyR068LivePackage,r069HostingPlan,validateR069Source,verifyR069LivePackage,validateR074Ci,r075HostingPlan,validateR075Source,validateR075Sql,verifyR075LivePackage,R075_RECOGNIZER_URL,r076HostingPlan,validateR076Source,verifyR076LivePackage,r077HostingPlan,validateR077Source,verifyR077LivePackage,R077_SERVICE_TIMEOUTS,r078HostingPlan,validateR078Source,validateR078Sql,verifyR078LivePackage,r079HostingPlan,validateR079Source,verifyR079LivePackage,r080HostingPlan,validateR080Source,validateR080Sql,verifyR080LivePackage,r081HostingPlan,validateR081Source,validateR081Sql,verifyR081LivePackage,validateR089Source,validateR089Sql,r089HostingPlan,verifyR089LivePackage} from '../../scripts/promotion/deploy-business-hosting.mjs';
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

test('R062 backup parser accepts only reviewed baselines without private access',async t=>{
 // The accepted range ends at the checkout's latest migration, so a new migration needs no edit here or in the script.
 const head=migrationHead(),extra=await mkdtemp(path.join(tmpdir(),'mw-backup-baselines-'));t.after(()=>rm(extra,{recursive:true,force:true}));
 await writeFile(path.join(extra,`V${head+1}__synthetic.sql`),'');
 const script=`import ast,argparse,contextlib,io,pathlib,sys
head=int(sys.argv[1]);source='scripts/database/Backup-ProductionPromotion.py'
tree=ast.parse(pathlib.Path(source).read_text(encoding='utf-8'))
def kept(n):
 if isinstance(n,ast.FunctionDef): return n.name=='supported_baselines'
 if isinstance(n,ast.Assign): return any(isinstance(t,ast.Name) and t.id in ('MIGRATIONS','REFUSED_BASELINES','parser') for t in n.targets)
 return isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and isinstance(n.value.func.value,ast.Name) and n.value.func.value.id=='parser' and n.value.func.attr=='add_argument'
ns={'argparse':argparse,'Path':pathlib.Path,'__file__':source};exec(compile(ast.Module(body=[n for n in tree.body if kept(n)],type_ignores=[]),'<synthetic parser>','exec'),ns)
accepted=[77,87]+[v for v in range(89,head+1) if v!=94]
for version in accepted:
 assert ns['parser'].parse_args(['--approval-reference','synthetic','--expected-version',str(version)]).expected_version==version
for version in [76,78,86,88,94,head+1]:
 try:
  with contextlib.redirect_stderr(io.StringIO()): ns['parser'].parse_args(['--approval-reference','synthetic','--expected-version',str(version)])
 except SystemExit as error: assert error.code==2
 else: raise AssertionError('Unsupported backup baseline accepted: '+str(version))
assert max(ns['supported_baselines'](pathlib.Path(sys.argv[2])))==head+1
print('Parser cases passed through V'+str(head)+'; no script imports, credentials or connection.')`;
 const r=spawnSync('python',['-c',script,String(head),extra],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,new RegExp(`Parser cases passed through V${head};`));
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
// Name lists are newline-separated; with -z (R074) the same names come back NUL-terminated, as git prints them.
const nulNames=(args,out)=>args.includes('-z')?out.split('\n').filter(Boolean).map(name=>name+'\0').join(''):out;
function waveGit({source,tool=source,changed={},delivery='',dirty='',untracked='',migration=waveMigration}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='diff'){
   if(args[2]===waveBaseline&&args[3]===source)return migration;
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return nulNames(args,delivery);
   if(args[3]===source)return nulNames(args,changed[args[2]]??'');
   return nulNames(args,dirty);
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

// R070: the same Hosting-only shape on the unchanged R069 runtime and V95; source descends from R069.
const r069Release='9c4a4cb753c7874206b6b1d1e9d28fa87d66002c';
test('R070 Hosting-only package descends from R069 and keeps the R069 runtime and V95',async t=>{
 const {m,source,tool}=await r065Package(t),git=waveGit({source,tool});
 Object.assign(m,{schemaVersion:11,release:'R070',sourceBaseline:r069Release,sql:{baselineVersion:95,targetVersion:95,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'95',allSuccessful:true,verifiedAt:'2026-10-17T12:00:00Z'}}});
 assert.equal((await hostingOnlyPlan(m,{git})).site,site);
 for(const [mutate,pattern] of [[x=>{x.sourceBaseline=r065Release},/exact R070 source\/baseline/],[x=>{x.schemaVersion=10},/wrong R070 package kind/],[x=>{x.sql.targetVersion=96},/R070 requires verified V95/],[x=>{x.sql.verified.latestVersion='93'},/V95/],[x=>{x.build={id:'b'}},/R070 package must not apply/],[x=>{x.runtime.services.jobs.revision='bad'},/R070 unchanged runtime pins/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(hostingOnlyPlan(candidate,{git}),pattern);}
 for(const file of ['services/business/borrowers.mjs','database/migrations/V96__x.sql','package.json'])await assert.rejects(hostingOnlyPlan(m,{git:waveGit({source,tool,changed:{[r069Release]:file}})}),/R070 must not change the R069 runtime/);
 // The R064 comparison no longer applies: R069 runtime changes since R064 are allowed.
 assert.equal((await hostingOnlyPlan(m,{git:waveGit({source,tool,changed:{[r064Release]:'services/business/borrowers.mjs'}})})).site,site);
 assert.throws(()=>validateHostingOnlySource(m,waveGit({source,tool,delivery:'apps/pwa/src/live-main.tsx'})),/R070 unverified delivery/);
 assert.doesNotThrow(()=>validateHostingOnlySource(m,waveGit({source,tool,delivery:'scripts/promotion/deploy-business-hosting.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md'})));
 assert.throws(()=>validateHostingOnlySource({...m,schemaVersion:8,release:'R066',sourceBaseline:r065Release,sql:{...m.sql,baselineVersion:93,targetVersion:93}},waveGit({source,tool,delivery:'scripts/promotion/README.md'})),/R066 unverified delivery/);
 const make=drift=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=m.runtime.services[role];return {ok:true,json:async()=>({latestReadyRevision:'x/'+pin.revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{containers:[{image:drift===role?pin.image.replace(/.$/,'0'):pin.image}]}})};};
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make('read'),readGithub,git}),/R070 live runtime differs/);
});

// R071: Hosting-only on the R069 runtime and V95; source descends from R070; package.json may change only in `scripts`.
const r070Release='038b5c9f9f7d1ed368f8197973a523bb0cf5eab2';
const runtimePackageJson={name:'mw-credit-app',private:true,type:'module',scripts:{check:'npm run lint'},dependencies:{pg:'8.13.0'},devDependencies:{vite:'6.0.0'}};
function r071Git({packageJson={},...options}){const base=waveGit(options);return (root,args)=>{if(args[0]!=='show')return base(root,args);const[commit,file]=args[1].split(':');assert.equal(file,'package.json');const value=packageJson[commit]??runtimePackageJson;return typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';};}
async function r071Package(t){
 const p=await r065Package(t);
 Object.assign(p.m,{schemaVersion:12,release:'R071',sourceBaseline:r070Release,sql:{baselineVersion:95,targetVersion:95,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'95',allSuccessful:true,verifiedAt:'2026-10-17T14:00:00Z'}}});
 return p;
}
test('R071 Hosting-only package descends from R070 and keeps the R069 runtime and V95',async t=>{
 const {m,source,tool,ci}=await r071Package(t),git=r071Git({source,tool});
 assert.equal((await hostingOnlyPlan(m,{git})).site,site);
 for(const [mutate,pattern] of [[x=>{x.sourceBaseline=r069Release},/exact R071 source\/baseline/],[x=>{x.schemaVersion=11},/wrong R071 package kind/],[x=>{x.sql.targetVersion=96},/R071 requires verified V95/],[x=>{x.build={id:'b'}},/R071 package must not apply/],[x=>{x.runtime.services.jobs.revision='bad'},/R071 unchanged runtime pins/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(hostingOnlyPlan(candidate,{git}),pattern);}
 for(const file of ['services/business/borrowers.mjs','database/migrations/V96__x.sql','package-lock.json','infrastructure/production/runtime.tf'])await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:file}})}),/R071 must not change the R069 runtime/);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[ci]:'apps/pwa/src/live-main.tsx'}})}),/R071 full CI is not input-equivalent/);
});
test('R071 accepts a package.json scripts-only change; dependencies and R070 stay strict',async t=>{
 const {m,source,tool}=await r071Package(t),scriptsOnly={...structuredClone(runtimePackageJson),scripts:{...runtimePackageJson.scripts,'check:docs':'node scripts/check-docs.mjs'}};
 // The name-only diff omits package.json for R071; both manifests are then compared without `scripts`.
 assert.equal((await hostingOnlyPlan(m,{git:r071Git({source,tool,packageJson:{[source]:scriptsOnly}})})).site,site);
 // A name-only diff that does report package.json is exempt for R071 when only `scripts` differs.
 assert.equal((await hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:'package.json'},packageJson:{[source]:scriptsOnly}})})).site,site);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:'package.json'},packageJson:{[source]:{...scriptsOnly,dependencies:{pg:'8.13.1'}}}})}),/\(package\.json outside scripts\)/);
 const reordered=Object.fromEntries(Object.entries(scriptsOnly).reverse());assert.doesNotThrow(()=>validateHostingOnlySource(m,r071Git({source,tool,packageJson:{[source]:reordered}})));
 for(const changed of [{...scriptsOnly,dependencies:{pg:'8.13.1'}},{...scriptsOnly,devDependencies:{}},{...scriptsOnly,overrides:{pg:'8.13.1'}},{...scriptsOnly,type:'commonjs'},'not json',[]])await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,packageJson:{[source]:changed}})}),/R071 must not change the R069 runtime, SQL or infrastructure \(package\.json outside scripts\)/);
 // Regression: R070 keeps the strict rule, so even a scripts-only package.json change is rejected.
 const r070={...structuredClone(m),schemaVersion:11,release:'R070',sourceBaseline:r069Release};
 await assert.rejects(hostingOnlyPlan(r070,{git:r071Git({source,tool,changed:{[r069Release]:'package.json'},packageJson:{[source]:scriptsOnly}})}),/R070 must not change the R069 runtime, SQL or infrastructure$/);
});
test('R071 accepts Markdown-only database documentation changes; SQL, runners and R070 stay strict',async t=>{
 const {m,source,tool}=await r071Package(t);
 // Wave 6 edits database/README.md and deletes database/OWNERSHIP.md (a deletion is listed by name too).
 for(const changed of ['database/README.md','database/OWNERSHIP.md','database/README.md\ndatabase/OWNERSHIP.md\npackage.json'])assert.equal((await hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:changed}})})).site,site);
 for(const changed of ['database/migrations/V96__x.sql','database/migrations/notes.md','database/runner.mjs','database/tests/check.sql','database/Invoke.ps1','database/build.py','database/manifest.json','database/README.md\ndatabase/runner.mjs','database/README.md.bak'])await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:changed}})}),/R071 must not change the R069 runtime, SQL or infrastructure$/);
 const r070={...structuredClone(m),schemaVersion:11,release:'R070',sourceBaseline:r069Release};
 await assert.rejects(hostingOnlyPlan(r070,{git:r071Git({source,tool,changed:{[r069Release]:'database/README.md'}})}),/R070 must not change the R069 runtime/);
});
test('R071 operator proof uses its own release audience; unknown releases are refused',async()=>{
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com',project='clever-oasis-508610-n7';
 const run=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await run('R071')).operator,email);
 await assert.rejects(run('R071','https://lm.mw-credit.com/promotion/r070'),/impersonation proof/);
 for(const release of ['R067','R082'])await assert.rejects(run(release),/unsupported operator release/);
});
test('R071 delivery commit may carry the runner, README and documents; live verification needs the pinned R069 services',async t=>{
 const {m,source,tool}=await r071Package(t),git=r071Git({source,tool});
 assert.doesNotThrow(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery:'scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md'})));
 assert.throws(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery:'scripts/promotion/README.md\napps/pwa/src/live-main.tsx'})),/R071 unverified delivery/);
 const make=drift=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=m.runtime.services[role];return {ok:true,json:async()=>({latestReadyRevision:'x/'+pin.revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{containers:[{image:drift===role?pin.image.replace(/.$/,'0'):pin.image}]}})};};
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make('command'),readGithub,git}),/R071 live runtime differs/);
});

// R072: R071's Hosting-only contract (R069 runtime, V95, scripts-only package.json, database Markdown) with the source descending from R071.
const r071Release='cb333f5c0024f51c197a2b5527d833605ba5fb03';
async function r072Package(t){const p=await r071Package(t);Object.assign(p.m,{schemaVersion:13,release:'R072',sourceBaseline:r071Release});return p;}
test('R072 Hosting-only package descends from R071 and keeps the R069 runtime and V95',async t=>{
 const {m,source,tool,ci}=await r072Package(t),git=r071Git({source,tool});
 assert.equal((await hostingOnlyPlan(m,{git})).site,site);
 const scriptsOnly={...structuredClone(runtimePackageJson),scripts:{...runtimePackageJson.scripts,'check:docs':'node scripts/check-docs.mjs'}};
 assert.equal((await hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:'database/README.md\ndatabase/OWNERSHIP.md\npackage.json'},packageJson:{[source]:scriptsOnly}})})).site,site);
 for(const [mutate,pattern] of [[x=>{x.sourceBaseline=r070Release},/exact R072 source\/baseline/],[x=>{x.schemaVersion=12},/wrong R072 package kind/],[x=>{x.sql.targetVersion=96},/R072 requires verified V95/],[x=>{x.build={id:'b'}},/R072 package must not apply/],[x=>{x.runtime.services.jobs.revision='bad'},/R072 unchanged runtime pins/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(hostingOnlyPlan(candidate,{git}),pattern);}
 // A source that does not descend from the R071 release is refused.
 const detached=(root,args)=>args[0]==='merge-base'&&args[1]===r071Release?'0'.repeat(40):git(root,args);
 await assert.rejects(hostingOnlyPlan(m,{git:detached}),/R072 source must descend from the previous release/);
 for(const file of ['services/business/borrowers.mjs','database/migrations/V96__x.sql','database/runner.mjs','package-lock.json','infrastructure/production/runtime.tf'])await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:file}})}),/R072 must not change the R069 runtime, SQL or infrastructure$/);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:'package.json'},packageJson:{[source]:{...scriptsOnly,dependencies:{pg:'8.13.1'}}}})}),/R072 must not change the R069 runtime, SQL or infrastructure \(package\.json outside scripts\)/);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[ci]:'apps/pwa/src/live-main.tsx'}})}),/R072 full CI is not input-equivalent/);
});
test('R072 operator audience, delivery corrections and live runtime check',async t=>{
 const {m,source,tool}=await r072Package(t),git=r071Git({source,tool});
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com',project='clever-oasis-508610-n7';
 const run=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await run('R072')).operator,email);await assert.rejects(run('R072','https://lm.mw-credit.com/promotion/r071'),/impersonation proof/);
 assert.doesNotThrow(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery:'scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md'})));
 assert.throws(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery:'scripts/promotion/README.md\napps/pwa/src/live-main.tsx'})),/R072 unverified delivery/);
 const make=drift=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=m.runtime.services[role];return {ok:true,json:async()=>({latestReadyRevision:'x/'+pin.revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{containers:[{image:drift===role?pin.image.replace(/.$/,'0'):pin.image}]}})};};
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make('read'),readGithub,git}),/R072 live runtime differs/);
});

// R073: R072's Hosting-only contract (R069 runtime, V95, scripts-only package.json, database Markdown) with the source descending from R072.
const r072Release='378c34825501534e9ada30a4b1e78dce0ed6c7a3';
async function r073Package(t){const p=await r072Package(t);Object.assign(p.m,{schemaVersion:14,release:'R073',sourceBaseline:r072Release});return p;}
test('R073 Hosting-only package descends from R072 and keeps the R069 runtime and V95',async t=>{
 const {m,source,tool,ci}=await r073Package(t),git=r071Git({source,tool});
 assert.equal((await hostingOnlyPlan(m,{git})).site,site);
 const scriptsOnly={...structuredClone(runtimePackageJson),scripts:{...runtimePackageJson.scripts,'check:docs':'node scripts/check-docs.mjs'}};
 assert.equal((await hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:'database/README.md\ndatabase/OWNERSHIP.md\npackage.json'},packageJson:{[source]:scriptsOnly}})})).site,site);
 for(const [mutate,pattern] of [[x=>{x.sourceBaseline=r071Release},/exact R073 source\/baseline/],[x=>{x.schemaVersion=13},/wrong R073 package kind/],[x=>{x.sql.targetVersion=96},/R073 requires verified V95/],[x=>{x.build={id:'b'}},/R073 package must not apply/],[x=>{x.runtime.services.jobs.revision='bad'},/R073 unchanged runtime pins/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(hostingOnlyPlan(candidate,{git}),pattern);}
 // A source that does not descend from the R072 release is refused.
 const detached=(root,args)=>args[0]==='merge-base'&&args[1]===r072Release?'0'.repeat(40):git(root,args);
 await assert.rejects(hostingOnlyPlan(m,{git:detached}),/R073 source must descend from the previous release/);
 for(const file of ['services/business/borrowers.mjs','database/migrations/V96__x.sql','database/runner.mjs','package-lock.json','infrastructure/production/runtime.tf'])await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:file}})}),/R073 must not change the R069 runtime, SQL or infrastructure$/);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:'package.json'},packageJson:{[source]:{...scriptsOnly,dependencies:{pg:'8.13.1'}}}})}),/R073 must not change the R069 runtime, SQL or infrastructure \(package\.json outside scripts\)/);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[ci]:'apps/pwa/src/live-main.tsx'}})}),/R073 full CI is not input-equivalent/);
});
test('R073 operator audience, delivery corrections and live runtime check',async t=>{
 const {m,source,tool}=await r073Package(t),git=r071Git({source,tool});
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com',project='clever-oasis-508610-n7';
 const run=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await run('R073')).operator,email);await assert.rejects(run('R073','https://lm.mw-credit.com/promotion/r072'),/impersonation proof/);
 assert.doesNotThrow(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery:'scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md'})));
 assert.throws(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery:'scripts/promotion/README.md\napps/pwa/src/live-main.tsx'})),/R073 unverified delivery/);
 const make=drift=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=m.runtime.services[role];return {ok:true,json:async()=>({latestReadyRevision:'x/'+pin.revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{containers:[{image:drift===role?pin.image.replace(/.$/,'0'):pin.image}]}})};};
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make('read'),readGithub,git}),/R073 live runtime differs/);
});

// R074: R073's Hosting-only contract with the source descending from R073 and CI gated per job: every required job
// cites its own run, whose head is the delivery-tool commit or an ancestor with no change relevant to that job's stage.
const r073Release='042359b585e132cb20e3f0785320c285addc7a1e';
const r074Groups={check:{id:21,kind:'ci',jobs:['check']},e2e:{id:22,kind:'ci',jobs:['e2e (shard 1 of 3)','e2e (shard 2 of 3)','e2e (shard 3 of 3)']},terraform:{id:24,kind:'ci',jobs:['terraform']},guards:{id:23,kind:'database',jobs:['guards']},rebuild:{id:25,kind:'database',jobs:['rebuild (migrations)','rebuild (receiving)','rebuild (phase5)','rebuild (phase8)']}};
function r074Ci(head,heads={}){
 const out={runs:{},ci:{jobs:{}},database:{jobs:{}}};
 for(const [group,{id,kind,jobs}] of Object.entries(r074Groups)){const h=heads[group]??head;out.runs[id]={run:{id,repository:{full_name:'welct0407/MW-Credit-App'},path:kind==='ci'?'.github/workflows/ci.yml':'.github/workflows/database.yml',head_sha:h,event:'pull_request',status:'completed',conclusion:'success'},jobs:[{name:'changes',conclusion:'success'},...jobs.map(name=>({name,conclusion:'success'}))]};for(const name of jobs)out[kind].jobs[name]={runId:id,headSha:h};}
 return out;
}
async function r074Package(t){const p=await r073Package(t);Object.assign(p.m,{schemaVersion:15,release:'R074',sourceBaseline:r073Release,applicationCi:r074Ci(p.ci)});return p;}
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const r074Readback=m=>{const calls=[];return {calls,readGithub:args=>{calls.push(args[1]);const id=args[1].split('/runs/')[1].split('/')[0],r=m.applicationCi.runs[id];return args[1].includes('/jobs')?{jobs:structuredClone(r.jobs)}:structuredClone(r.run);}};};
test('R074 Hosting-only package descends from R073, keeps the R069 runtime and V95 and gates CI per job',async t=>{
 const {m,source,tool,ci}=await r074Package(t),git=r071Git({source,tool});
 assert.equal((await hostingOnlyPlan(m,{git})).site,site);
 assert.deepEqual(validateR074Ci(m.applicationCi,m,git).ci.terraform,{runId:24,headSha:ci});
 const scriptsOnly={...structuredClone(runtimePackageJson),scripts:{...runtimePackageJson.scripts,'check:docs':'node scripts/check-docs.mjs'}};
 assert.equal((await hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:'database/README.md\ndatabase/OWNERSHIP.md\npackage.json'},packageJson:{[source]:scriptsOnly}})})).site,site);
 for(const [mutate,pattern] of [[x=>{x.sourceBaseline=r072Release},/exact R074 source\/baseline/],[x=>{x.schemaVersion=14},/wrong R074 package kind/],[x=>{x.sql.targetVersion=96},/R074 requires verified V95/],[x=>{x.sql.verified.latestVersion='94'},/R074 requires verified V95/],[x=>{x.build={id:'b'}},/R074 package must not apply/],[x=>{x.plan={}},/R074 package must not apply/],[x=>{x.applied={}},/R074 package must not apply/],[x=>{x.runtime.services.jobs.revision='bad'},/R074 unchanged runtime pins/],[x=>{delete x.runtime},/R074 unchanged runtime pins/],[x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R074 ci check: cited run receipt/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(hostingOnlyPlan(candidate,{git}),pattern);}
 const detached=(root,args)=>args[0]==='merge-base'&&args[1]===r073Release?'0'.repeat(40):git(root,args);
 await assert.rejects(hostingOnlyPlan(m,{git:detached}),/R074 source must descend from the previous release/);
 for(const file of ['services/business/borrowers.mjs','database/migrations/V96__x.sql','database/runner.mjs','package-lock.json','infrastructure/production/runtime.tf'])await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:file}})}),/R074 must not change the R069 runtime, SQL or infrastructure$/);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:'package.json'},packageJson:{[source]:{...scriptsOnly,dependencies:{pg:'8.13.1'}}}})}),/R074 must not change the R069 runtime, SQL or infrastructure \(package\.json outside scripts\)/);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[ci]:'apps/pwa/src/live-main.tsx'}})}),/R074 ci check: run is not input-equivalent/);
 // The kind-level receipts of R065 to R073 are not R074 evidence, and R073 keeps its kind-level gate.
 const kindLevel={...structuredClone(m),applicationCi:(await r073Package(t)).m.applicationCi};
 await assert.rejects(hostingOnlyPlan(kindLevel,{git}),/R074 ci CI jobs must be exactly/);
 await assert.rejects(hostingOnlyPlan({...structuredClone(m),schemaVersion:14,release:'R073',sourceBaseline:r072Release},{git}),/R073 successful full CI required/);
});
test('R074 accepts the real R073 per-job evidence split and rejects the runs that are not input-equivalent for check',()=>{
 // Actual GitHub receipts (job names and conclusions) of the R073 runs; database 39108361163 job receipts are synthetic.
 const R={'01025a3e1fff40b2322eeaa31f2490f865c87315':['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','project/Documents/Development_Changes.md','project/Documents/Release_Tracker.md'],c21884ae457ba478f41a2de15419424101d02f69:['Change Logs/CHANGE_NOTES_OFFLINE_DELTA_GAP_2026-10-18.md','apps/pwa/src/offline-dataset.ts','apps/pwa/src/release.ts','project/Documents/Development_Changes.md','project/Documents/Environment_Inventory.md','project/Documents/Release_Tracker.md','project/Documents/Rules/Release_Workflow.md','scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/e2e/about-independent.spec.ts','tests/e2e/offline-delta-independent.spec.ts','tests/unit/business-hosting-delivery.test.mjs'],d57fb7d58dc22f64ad9ca28995e968a744309e76:[]};
 const [e2eHead,terraformHead,checkHead]=Object.keys(R),repoRoot=path.resolve('synthetic-root');
 const git=(root,args)=>{assert.equal(root,repoRoot);if(args[0]==='merge-base'&&args[2]===r073Release&&Object.hasOwn(R,args[1]))return args[1];if(args[0]==='diff'&&args[1]==='--name-only'&&args[3]===r073Release&&Object.hasOwn(R,args[2])&&exact(args.slice(4),['--no-renames','-z']))return R[args[2]].map(name=>name+'\0').join('');throw Error('Unexpected synthetic Git command '+args);};
 const run=(id,head,file='ci',event='pull_request')=>({id,repository:{full_name:'welct0407/MW-Credit-App'},path:`.github/workflows/${file}.yml`,head_sha:head,event,status:'completed',conclusion:'success'});
 const jobs=list=>list.map(([name,conclusion])=>({name,conclusion}));
 const runs={39113397874:{run:run(39113397874,e2eHead),jobs:jobs([['changes','success'],['lint','success'],['check','success'],['e2e (shard 1 of 3)','success'],['e2e (shard 2 of 3)','success'],['e2e (shard 3 of 3)','success'],['terraform','skipped'],['Development checks result','success']])},
  39108363565:{run:run(39108363565,terraformHead),jobs:jobs([['changes','success'],['terraform','success'],['check','success'],['e2e (shard 1 of 3)','success'],['lint','success'],['e2e (shard 3 of 3)','success'],['e2e (shard 2 of 3)','success'],['Development checks result','success']])},
  39116268119:{run:run(39116268119,checkHead),jobs:jobs([['changes','success'],['check','success'],['lint','success'],['e2e (shard $'+'{{ matrix.shard }} of 3)','skipped'],['terraform','skipped'],['Development checks result','success']])},
  39108361163:{run:run(39108361163,terraformHead,'database'),jobs:jobs([['changes','success'],['guards','success'],['rebuild (migrations)','success'],['rebuild (receiving)','success'],['rebuild (phase5)','success'],['rebuild (phase8)','success']])}};
 const pin=(runId,headSha)=>({runId,headSha}),e2e=pin(39113397874,e2eHead);
 const receipts={runs,ci:{jobs:{check:pin(39116268119,checkHead),'e2e (shard 1 of 3)':e2e,'e2e (shard 2 of 3)':e2e,'e2e (shard 3 of 3)':e2e,terraform:pin(39108363565,terraformHead)}},database:{jobs:Object.fromEntries(['guards','rebuild (migrations)','rebuild (receiving)','rebuild (phase5)','rebuild (phase8)'].map(name=>[name,pin(39108361163,terraformHead)]))}};
 const m={sourceCommit:r073Release,deliveryToolSource:r073Release,repoRoot};
 const result=validateR074Ci(receipts,m,git);
 assert.deepEqual(result.ci.check,{runId:39116268119,headSha:checkHead});assert.equal(result.ci['e2e (shard 2 of 3)'].runId,39113397874);assert.equal(result.ci.terraform.runId,39108363565);assert.equal(result.database.guards.runId,39108361163);
 // check from either full run: the runner and its unit test changed since, and both are check-relevant.
 for(const [runId,headSha] of [[39113397874,e2eHead],[39108363565,terraformHead]]){const bad=structuredClone(receipts);bad.ci.jobs.check=pin(runId,headSha);assert.throws(()=>validateR074Ci(bad,m,git),/R074 ci check: run is not input-equivalent to the source/);}
 // terraform was skipped in the e2e run (the job is present but did not execute).
 const skipped=structuredClone(receipts);skipped.ci.jobs.terraform=e2e;assert.throws(()=>validateR074Ci(skipped,m,git),/R074 ci terraform: missing executed job/);
 // e2e was skipped in the check run under its unexpanded matrix name, so the named shard is absent there.
 const absent=structuredClone(receipts);absent.ci.jobs['e2e (shard 1 of 3)']=pin(39116268119,checkHead);assert.throws(()=>validateR074Ci(absent,m,git),/R074 ci e2e \(shard 1 of 3\): missing executed job/);
});
test('R074 per-job CI gate rejects each unproven job',async t=>{
 const {m,source,tool,ci}=await r074Package(t),heads={check:'a1'.repeat(20),e2e:'b2'.repeat(20),terraform:'c3'.repeat(20),guards:'d4'.repeat(20),rebuild:'e5'.repeat(20)},receipts=r074Ci(ci,heads);
 const gate=(mutate,git=waveGit({source,tool}))=>{const x=structuredClone(receipts);mutate?.(x);return validateR074Ci(x,m,git);};
 assert.deepEqual(Object.keys(gate().ci),['check','e2e (shard 1 of 3)','e2e (shard 2 of 3)','e2e (shard 3 of 3)','terraform']);
 const job=(x,id,name)=>x.runs[id].jobs.find(j=>j.name===name);
 for(const [mutate,pattern] of [[x=>{job(x,21,'check').conclusion='failure'},/R074 ci check: missing executed job/],[x=>{job(x,24,'terraform').conclusion='skipped'},/R074 ci terraform: missing executed job/],[x=>{x.runs[24].jobs=x.runs[24].jobs.filter(j=>j.name!=='terraform')},/R074 ci terraform: missing executed job/],[x=>{x.runs[22].jobs.push({name:'e2e (shard 2 of 3)',conclusion:'success'})},/R074 ci e2e \(shard 2 of 3\): missing executed job/],
  [x=>{x.runs[21].run.repository.full_name='other/MW-Credit-App'},/R074 ci check: successful \.github\/workflows\/ci\.yml run required/],[x=>{x.runs[23].run.path='.github/workflows/ci.yml'},/R074 database guards: successful \.github\/workflows\/database\.yml run required/],[x=>{x.runs[25].run.conclusion='failure'},/R074 database rebuild \(migrations\): successful/],[x=>{x.runs[22].run.status='in_progress'},/R074 ci e2e \(shard 1 of 3\): successful/],[x=>{x.runs[24].run.event='schedule'},/R074 ci terraform: successful/],
  [x=>{delete x.runs[24]},/R074 ci terraform: cited run receipt missing/],[x=>{x.runs[21].run.head_sha=heads.e2e},/R074 ci check: cited run receipt/],[x=>{x.runs[21].run.id=22},/R074 ci check: cited run receipt/],[x=>{x.ci.jobs.check.runId='21'},/R074 ci check: run id and head required/],[x=>{x.database.jobs.guards.headSha='bad'},/R074 database guards: run id and head required/],
  [x=>{x.ci.jobs.lint={runId:21,headSha:heads.check}},/R074 ci CI jobs must be exactly/],[x=>{delete x.database.jobs['rebuild (phase8)']},/R074 database CI jobs must be exactly/],[x=>{delete x.database},/R074 database CI jobs must be exactly/],[x=>{x.ci.jobs=[]},/R074 ci CI jobs must be exactly/]])assert.throws(()=>gate(mutate),pattern);
 // A head that is not an ancestor of the source.
 const base=waveGit({source,tool});assert.throws(()=>gate(null,(root,args)=>args[0]==='merge-base'&&args[1]===heads.check?'0'.repeat(40):base(root,args)),/R074 ci check: run is not input-equivalent/);
 // A change relevant to one stage rejects only the jobs of that stage; irrelevant changes are accepted.
 for(const [group,file,pattern] of [['e2e','apps/pwa/src/live-main.tsx',/R074 ci e2e \(shard 1 of 3\): run is not input-equivalent/],['terraform','infrastructure/production/runtime.tf',/R074 ci terraform: run is not input-equivalent/],['guards','scripts/database/r053-operator-tooling.mjs',/R074 database guards: run is not input-equivalent/],['rebuild','database/migrations/V96__x.sql',/R074 database rebuild \(migrations\): run is not input-equivalent/],['check','scripts/promotion/deploy-business-hosting.mjs',/R074 ci check: run is not input-equivalent/]])assert.throws(()=>gate(null,waveGit({source,tool,changed:{[heads[group]]:file}})),pattern);
 for(const [group,file] of [['e2e','scripts/promotion/deploy-business-hosting.mjs'],['terraform','apps/pwa/src/live-main.tsx'],['guards','apps/pwa/src/live-main.tsx'],['rebuild','database/README.md'],['check','project/Documents/Release_Tracker.md\nscripts/promotion/README.md']])assert.doesNotThrow(()=>gate(null,waveGit({source,tool,changed:{[heads[group]]:file}})));
 // Each head's ancestry and diff are read once, however many jobs cite it.
 const seen=[];gate(null,(root,args)=>{seen.push(args.join(' '));return base(root,args);});assert.equal(seen.length,new Set(seen).size);assert.equal(seen.filter(c=>c.startsWith('diff')).length,5);
});
test('R074 accepts runs on the delivery-tool commit only when that commit adds no relevant input',async t=>{
 const {m,source,tool}=await r074Package(t),atTool=r074Ci(tool),runner='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md';
 // Without the delivery alternative the runner change would be check-relevant.
 assert.equal(validateR074Ci(atTool,m,waveGit({source,tool,delivery:runner,changed:{[tool]:runner}})).ci.check.headSha,tool);
 assert.equal((await hostingOnlyPlan({...structuredClone(m),applicationCi:atTool},{git:r071Git({source,tool,delivery:runner,changed:{[tool]:runner}})})).site,site);
 assert.throws(()=>validateR074Ci(atTool,m,waveGit({source,tool,delivery:runner+'\napps/pwa/src/offline-sync.ts',changed:{[tool]:runner+'\napps/pwa/src/offline-sync.ts'}})),/R074 ci check: run is not input-equivalent/);
 await assert.rejects(hostingOnlyPlan({...structuredClone(m),applicationCi:atTool},{git:r071Git({source,tool,delivery:'apps/pwa/src/offline-sync.ts',changed:{[tool]:'apps/pwa/src/offline-sync.ts'}})}),/R074 unverified delivery/);
});
test('R074 lists renamed and quoted paths in full: a move or a non-ASCII name cannot hide a relevant path',async t=>{
 const {m,source,tool,ci}=await r074Package(t),heads={check:'a1'.repeat(20),e2e:'b2'.repeat(20)},receipts=r074Ci(ci,heads),calls=[];
 // Real git behaviour without the flags: a rename lists only its new path, and a non-ASCII name is quoted.
 const quote=name=>/[^\x20-\x7e]/.test(name)?'"'+[...Buffer.from(name)].map(b=>b>0x7e?'\\'+b.toString(8):String.fromCharCode(b)).join('')+'"':name;
 const emulate=({renames={},names={}})=>(root,args)=>{calls.push(args.join(' '));const base=r071Git({source,tool,...names})(root,args);if(args[0]!=='diff')return base;
  const key=args[2]+'..'+args[3],rename=renames[key],list=[...(args.includes('-z')?base.split('\0'):base.split('\n')).filter(Boolean),...(rename?(args.includes('--no-renames')?rename:rename.slice(1)):[])];
  return args.includes('-z')?list.map(name=>name+'\0').join(''):list.map(quote).join('\n');};
 // check: apps/pwa/src/a.ts moved to project/a.ts since the check head; only project/a.ts would be listed.
 assert.throws(()=>validateR074Ci(receipts,m,emulate({renames:{[heads.check+'..'+source]:['apps/pwa/src/a.ts','project/a.ts']}})),/R074 ci check: run is not input-equivalent/);
 assert.ok(calls.includes(`diff --name-only ${heads.check} ${source} --no-renames -z`));
 // e2e: a non-ASCII PWA file would otherwise appear as "apps/pwa/src/caf\303\251.ts" and miss ^apps/pwa/.
 assert.equal(quote('apps/pwa/src/café.ts'),'"apps/pwa/src/caf\\303\\251.ts"');
 assert.throws(()=>validateR074Ci(receipts,m,emulate({names:{changed:{[heads.e2e]:'apps/pwa/src/café.ts'}}})),/R074 ci e2e \(shard 1 of 3\): run is not input-equivalent/);
 // Delivery side: apps/pwa/src/a.ts moved to scripts/promotion/README.md in the delivery-tool commit.
 const moved={renames:{[source+'..'+tool]:['apps/pwa/src/a.ts','scripts/promotion/README.md'],[tool+'..'+source]:['apps/pwa/src/a.ts','scripts/promotion/README.md']}};
 assert.throws(()=>validateHostingOnlySource(m,emulate(moved)),/R074 unverified delivery/);
 assert.throws(()=>validateR074Ci(r074Ci(tool),m,emulate(moved)),/R074 ci check: run is not input-equivalent/);
 // Runtime side: a moved service file is listed at its old path.
 assert.throws(()=>validateHostingOnlySource(m,emulate({renames:{[r069Release+'..'+source]:['services/business/borrowers.mjs','docs/borrowers.mjs']}})),/R074 must not change the R069 runtime/);
 // Every R074 source diff uses the strict form; R073 keeps its original diff arguments byte for byte.
 calls.length=0;validateHostingOnlySource(m,emulate({}));const diffs=calls.filter(c=>c.startsWith('diff'));assert.equal(diffs.length,3);assert.ok(diffs.every(c=>c.includes(' --no-renames -z')));
 calls.length=0;validateHostingOnlySource({...structuredClone(m),schemaVersion:14,release:'R073',sourceBaseline:r072Release},emulate({}));assert.deepEqual(calls.filter(c=>c.startsWith('diff')).map(c=>c.split(' -- ')[0]+(c.includes(' -- ')?' -- …':'')),[`diff --name-only ${r069Release} ${source} -- …`,`diff --name-only ${source} ${tool}`,`diff --name-only ${tool} -- …`]);assert.ok(calls.every(c=>!c.includes('-z')&&!c.includes('--no-renames')));
});
test('R074 rejects a check run older than a rename into project/ with real git',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'mw-r074-rename-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const g=args=>{const r=spawnSync('git',['-C',root,'-c','user.name=Test','-c','user.email=test@example.invalid',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 g(['init','-q']);await mkdir(path.join(root,'apps/pwa/src'),{recursive:true});await writeFile(path.join(root,'apps/pwa/src/a.ts'),'export const a=1;\n');g(['add','.']);g(['commit','-qm','head']);const head=g(['rev-parse','HEAD']);
 await mkdir(path.join(root,'project'));g(['mv','apps/pwa/src/a.ts','project/a.ts']);g(['commit','-qm','source']);const source=g(['rev-parse','HEAD']);
 assert.equal(g(['diff','--name-only',head,source]),'project/a.ts');
 assert.throws(()=>validateR074Ci(r074Ci(head),{sourceCommit:source,repoRoot:root}),/R074 ci check: run is not input-equivalent/);
 // The same tree without the move is accepted, with the default real git reader.
 assert.equal(validateR074Ci(r074Ci(source),{sourceCommit:source,repoRoot:root}).ci.check.headSha,source);
});
test('R074 operator audience and live verification re-read each cited run once and the pinned R069 services',async t=>{
 const {m,source,tool,ci}=await r074Package(t),git=r071Git({source,tool});
 m.applicationCi=r074Ci(ci,{e2e:'b2'.repeat(20)});
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com',project='clever-oasis-508610-n7';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R074')).operator,email);await assert.rejects(operator('R074','https://lm.mw-credit.com/promotion/r073'),/impersonation proof/);
 const make=drift=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=m.runtime.services[role];return {ok:true,json:async()=>({latestReadyRevision:'x/'+pin.revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{containers:[{image:drift===role?pin.image.replace(/.$/,'0'):pin.image}]}})};};
 const live=r074Readback(m);await verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});
 assert.equal(live.calls.length,10);assert.equal(new Set(live.calls).size,10);for(const id of [21,22,23,24,25])assert.ok(live.calls.includes(`repos/welct0407/MW-Credit-App/actions/runs/${id}`)&&live.calls.includes(`repos/welct0407/MW-Credit-App/actions/runs/${id}/jobs?per_page=100`));
 // The package receipts are not trusted at apply: a live check job that was skipped rejects.
 const tampered=r074Readback(m);await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=tampered.readGithub(args);if(args[1].endsWith('/runs/21/jobs?per_page=100'))r.jobs.find(j=>j.name==='check').conclusion='skipped';return r;},git}),/R074 ci check: missing executed job/);
 const moved=r074Readback(m);await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=moved.readGithub(args);if(args[1].endsWith('/runs/24'))r.head_sha='0'.repeat(40);return r;},git}),/R074 ci terraform: cited run receipt/);
 await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make('notify'),readGithub:r074Readback(m).readGithub,git}),/R074 live runtime differs/);
 const badId=structuredClone(m);badId.applicationCi.ci.jobs.check.runId=-1;const none=r074Readback(m);await assert.rejects(verifyHostingOnlyLivePackage(badId,{token:'t',request:make(),readGithub:none.readGithub,git}),/actual CI run ids required/);assert.equal(none.calls.length,0);
});

// R074 stage-hash evidence: a stage job may cite the evidence artifact its run uploaded for the source's own stage key.
const r074Tree=(files={})=>Object.entries({'apps/pwa/src/App.tsx':'1','infrastructure/production/main.tf':'2','database/migrations/V95__x.sql':'3','services/business/borrowers.mjs':'4','project/Documents/Release_Tracker.md':'5','scripts/ci/stages.json':'6',...files}).map(([file,blob])=>`100644 blob ${blob.repeat(40).slice(0,40)}\t${file}\0`).join('');
const r074Name=(tree,kind,job)=>{const stages=loadStages(kind),[stage,rule]=Object.entries(stages).find(([,x])=>x.checks.includes(job));return evidenceName(kind,stage,hashEntries(kind,stage,rule,tree),variantOf(job));};
// Moves the given jobs' run to a head that is not an ancestor of the source and cites the matching evidence artifact.
function r074Evidence(receipts,jobs,head,tree,artifact=x=>x){
 const x=structuredClone(receipts);x.artifacts??={};
 for(const [kind,job] of jobs){const entry=x[kind].jobs[job],name=r074Name(tree,kind,job);x.runs[entry.runId].run.head_sha=head;entry.headSha=head;entry.evidence=name;x.artifacts[name]=[artifact({id:entry.runId*100,name,expired:false,created_at:'2026-10-18T00:00:00Z',workflow_run:{id:entry.runId,head_sha:head,repository_id:1,head_repository_id:1}})];}
 for(const [kind,job] of Object.entries({ci:Object.keys(x.ci.jobs),database:Object.keys(x.database.jobs)}).flatMap(([k,js])=>js.map(j=>[k,j])))if(x[kind].jobs[job].runId&&x.runs[x[kind].jobs[job].runId].run.head_sha===head)x[kind].jobs[job].headSha=head;
 return x;
}
const r074EvidenceGit=({source,tool,tree,outside})=>{const base=r071Git({source,tool});return (root,args)=>{if(args[0]==='ls-tree'){assert.deepEqual(args,['ls-tree','-r','-z','--full-tree',source]);return tree;}if(args[0]==='merge-base'&&args[1]===outside)return '0'.repeat(40);return base(root,args);};};
test('R074 accepts stage-hash evidence from a run whose head is not an ancestor of the source',async t=>{
 const {m,source,tool,ci}=await r074Package(t),tree=r074Tree(),outside='f6'.repeat(20),git=r074EvidenceGit({source,tool,tree,outside});
 const stageJobs=[['ci','check'],['ci','e2e (shard 1 of 3)'],['ci','e2e (shard 2 of 3)'],['ci','e2e (shard 3 of 3)'],['ci','terraform'],['database','rebuild (migrations)'],['database','rebuild (receiving)'],['database','rebuild (phase5)'],['database','rebuild (phase8)']];
 // Every stage job from runs at a non-ancestor head; guards keeps the input-equivalent ancestor rule from its own run.
 const receipts=r074Evidence(r074Ci(ci,{guards:ci}),stageJobs,outside,tree);
 const result=validateR074Ci(receipts,m,git);
 assert.equal(result.ci.check.evidence,r074Name(tree,'ci','check'));assert.match(result.ci['e2e (shard 2 of 3)'].evidence,/^evidence-ci-e2e-[a-f0-9]{64}-2$/);assert.match(result.database['rebuild (phase5)'].evidence,/^evidence-database-rebuild-[a-f0-9]{64}-phase5$/);assert.deepEqual(result.database.guards,{runId:23,headSha:ci});
 assert.equal((await hostingOnlyPlan({...structuredClone(m),applicationCi:receipts},{git})).site,site);
 // Without the evidence field the same run is an ordinary non-ancestor and rejects.
 const plain=structuredClone(receipts);delete plain.ci.jobs.check.evidence;assert.throws(()=>validateR074Ci(plain,m,git),/R074 ci check: run is not input-equivalent/);
 for(const [mutate,pattern,useGit=git] of [
  [x=>{x.artifacts[x.ci.jobs.check.evidence][0].expired=true},/R074 ci check: no unexpired same-repository evidence artifact/],
  [x=>{x.artifacts[x.ci.jobs.terraform.evidence][0].workflow_run.id=99},/R074 ci terraform: no unexpired/],
  [x=>{x.artifacts[x.ci.jobs.check.evidence][0].workflow_run.head_sha='0'.repeat(40)},/R074 ci check: no unexpired/],
  [x=>{x.artifacts[x.database.jobs['rebuild (phase8)'].evidence][0].workflow_run.head_repository_id=2},/R074 database rebuild \(phase8\): no unexpired/],
  [x=>{x.artifacts[x.ci.jobs.check.evidence][0].name+='x'},/R074 ci check: no unexpired/],
  [x=>{delete x.artifacts[x.ci.jobs.check.evidence]},/R074 ci check: no unexpired/],
  [x=>{x.runs[22].jobs.find(j=>j.name==='e2e (shard 1 of 3)').conclusion='skipped'},/R074 ci e2e \(shard 1 of 3\): missing executed job/],
  [x=>{x.runs[21].run.conclusion='failure'},/R074 ci check: successful/],
  [x=>{x.ci.jobs.check.evidence=r074Name(tree,'ci','e2e (shard 1 of 3)')},/R074 ci check: evidence name does not match/],
  [x=>{x.database.jobs.guards.evidence=x.database.jobs['rebuild (migrations)'].evidence},/R074 database guards: guards has no stage evidence/],
 ]){const x=structuredClone(receipts);mutate(x);assert.throws(()=>validateR074Ci(x,m,useGit),pattern);}
 // A relevant source change gives another key, so the cited artifact no longer names the source. Each case cites
 // evidence for the jobs of one run only (the other runs stay input-equivalent ancestors, where the fake diff is empty).
 const e2eJobs=[1,2,3].map(n=>['ci',`e2e (shard ${n} of 3)`]),rebuildJobs=['migrations','receiving','phase5','phase8'].map(g=>['database',`rebuild (${g})`]);
 for(const [jobs,file,pattern] of [[[['ci','check']],'services/business/borrowers.mjs',/R074 ci check: evidence name does not match the source stage hash/],[e2eJobs,'apps/pwa/src/App.tsx',/R074 ci e2e \(shard 1 of 3\): evidence name does not match/],[[['ci','terraform']],'infrastructure/production/main.tf',/R074 ci terraform: evidence name does not match/],[rebuildJobs,'database/migrations/V95__x.sql',/R074 database rebuild \(migrations\): evidence name does not match/]]){
  const one=r074Evidence(r074Ci(ci,{e2e:'b2'.repeat(20),rebuild:'e5'.repeat(20)}),jobs,outside,tree);
  assert.doesNotThrow(()=>validateR074Ci(one,m,git));
  assert.throws(()=>validateR074Ci(one,m,r074EvidenceGit({source,tool,outside,tree:r074Tree({[file]:'9'})})),pattern);
 }
 // An irrelevant source change keeps every key.
 assert.doesNotThrow(()=>validateR074Ci(receipts,m,r074EvidenceGit({source,tool,outside,tree:r074Tree({'project/Documents/Release_Tracker.md':'9'})})));
 // The key is the source commit's, not the delivery tool's or HEAD's (the fake asserts the ls-tree arguments).
 const calls=[];validateR074Ci(receipts,m,(root,args)=>{calls.push(args.join(' '));return git(root,args);});assert.deepEqual(calls.filter(c=>c.startsWith('ls-tree')),[`ls-tree -r -z --full-tree ${source}`]);
});
test('R074 live verification reads the evidence artifacts live, not from the package',async t=>{
 const {m,source,tool,ci}=await r074Package(t),tree=r074Tree(),outside='f6'.repeat(20),git=r074EvidenceGit({source,tool,tree,outside});
 m.applicationCi=r074Evidence(r074Ci(ci),[['ci','check'],['ci','e2e (shard 1 of 3)'],['ci','e2e (shard 2 of 3)'],['ci','e2e (shard 3 of 3)']],outside,tree);
 const live=structuredClone(m.applicationCi.artifacts);
 // The package's own lists are poisoned; only the live lists may decide.
 for(const list of Object.values(m.applicationCi.artifacts))list[0].expired=true;
 const make=()=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=m.runtime.services[role];return {ok:true,json:async()=>({latestReadyRevision:'x/'+pin.revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{containers:[{image:pin.image}]}})};};
 const reader=(tamper=()=>{})=>{const calls=[],runs=r074Readback(m);return {calls,readGithub:args=>{calls.push(args[1]);if(args[1].includes('/actions/artifacts?')){const name=decodeURIComponent(args[1].split('name=')[1].split('&')[0]),list=structuredClone(live[name]??[]);tamper(name,list);return {artifacts:list};}return runs.readGithub(args);}};};
 const ok=reader();await verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub:ok.readGithub,git});
 const artifactCalls=ok.calls.filter(c=>c.includes('/actions/artifacts?'));assert.equal(artifactCalls.length,4);for(const name of Object.keys(live))assert.ok(artifactCalls.includes(`repos/welct0407/MW-Credit-App/actions/artifacts?name=${name}&per_page=20`));
 await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub:reader((name,list)=>{if(name===m.applicationCi.ci.jobs.check.evidence)list[0].expired=true;}).readGithub,git}),/R074 ci check: no unexpired same-repository evidence artifact/);
 await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub:reader((_name,list)=>{list.length=0;}).readGithub,git}),/R074 ci check: no unexpired/);
 const bad=structuredClone(m);bad.applicationCi.ci.jobs.check.evidence='evidence-ci-check-../../x';const none=reader();await assert.rejects(verifyHostingOnlyLivePackage(bad,{token:'t',request:make(),readGithub:none.readGithub,git}),/evidence artifact names required/);assert.ok(!none.calls.some(c=>c.includes('/actions/artifacts?')));
});

// R075 helpers (tests at the end): the R074 release and the artifact release marker.
const r074Release='b88653d4b84860b7eab622d0edfb472d851c03ce';
const setArtifact=async(m,name,text)=>{await writeFile(path.join(m.artifactRoot,name),text);m.frontend.files.find(f=>f.path===name).sha256=createHash('sha256').update(text).digest('hex');};
const r075Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R075',...extra});

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
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/database/Backup-ProductionPromotion.py\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md';
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

// R069: one image on all four services on the unchanged V95 (no migration).
const r068Release='73a44200320135c2c135680b396f9ff8d64c9732';
function r069Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration=''}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='diff'){
   if(args[2]===r068Release&&args[3]===source)return migration;
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return delivery;
   if(args[3]===source)return changed[args[2]]??'';
   return dirty;
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function r069Package(t){
 const p=await wavePackage(t),m=p.m;
 Object.assign(m,{schemaVersion:10,release:'R069',sourceBaseline:r068Release,sql:{baselineVersion:95,targetVersion:95,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'95',historyRows:95,allSuccessful:true,verifiedAt:'2026-10-17T10:16:33Z'}}});
 m.applied.sqlVersion=95;m.applied.appliedAt='2026-10-17T10:18:21Z';
 return p;
}
test('R069 package validates and rejects SQL, plan, CI, readback and artifact tampering',async t=>{
 const {m,source,tool}=await r069Package(t),git=r069Git({source,tool});
 const plan=await r069HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [[x=>x.sql.targetVersion=96,/R069 requires verified V95/],[x=>x.sql.migrations=[{name:'V96__x.sql'}],/V95/],[x=>x.sql.verified.latestVersion='94',/V95/],[x=>x.sql.verified.historyRows=94,/V95/],[x=>x.sql.verified.allSuccessful=false,/V95/],[x=>delete x.sql.verified.verifiedAt,/V95/],[x=>x.applied.sqlVersion=94,/R069 applied source/],[x=>delete x.applied.appliedAt,/R069 applied source/],[x=>x.plan.actions.push('command.maxInstances'),/R069 reviewed four-image plan/],[x=>x.plan.counts.change=5,/four-image plan/],[x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R069 ready service/],[x=>x.applicationCi.full.jobs.splice(1,1),/R069 full CI missing executed e2e/],[x=>x.applicationCi.database.run.conclusion='failure',/R069 successful database CI/],[x=>x.build.sourceCommit='4'.repeat(40),/provenance/],[x=>x.target.connectionName='clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],[x=>x.release='R068',/package kind/],[x=>x.schemaVersion=9,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r069HostingPlan(candidate,{git}),pattern);}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r069HostingPlan(prepared,{git}),/apply\/readback/);assert.equal((await r069HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r068HostingPlan(m,{git}),/package kind/);
});
test('R069 source carries no migration from R068; the delivery commit may add this README',async t=>{
 const {m,source,tool}=await r069Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md';
 assert.doesNotThrow(()=>validateR069Source(m,r069Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/business/borrowers.mjs','scripts/database/Backup-ProductionPromotion.py'])assert.throws(()=>validateR069Source(m,r069Git({source,tool,delivery:file})),/R069 unverified delivery/);
 assert.throws(()=>validateR069Source(m,r069Git({source,tool,migration:'database/migrations/V96__x.sql'})),/R069 carries no migration/);
 assert.throws(()=>validateR069Source({...m,sourceBaseline:r067Release},r069Git({source,tool})),/R069 source\/baseline/);
 assert.throws(()=>validateR069Source(m,r069Git({source,tool,dirty:'apps/pwa/src/live-main.tsx'})),/R069 working input/);
 assert.throws(()=>validateR069Source(m,r069Git({source,tool,untracked:'services/new.mjs'})),/R069 untracked/);
 const atTool=structuredClone(m.applicationCi);for(const kind of ['full','check'])atTool[kind].run.head_sha=tool;m.applicationCi=atTool;
 assert.equal((await r069HostingPlan(m,{git:r069Git({source,tool,delivery:toolFiles})})).site,site);
 await assert.rejects(r069HostingPlan(m,{git:r069Git({source,tool,delivery:toolFiles+'\napps/pwa/src/live-main.tsx',changed:{[tool]:'apps/pwa/src/live-main.tsx'}})}),/R069 unverified delivery/);
});
test('R069 live verification re-reads CI, Cloud Build and the four services',async t=>{
 const {m,source,tool,image}=await r069Package(t),git=r069Git({source,tool});
 const project='clever-oasis-508610-n7';
 const service=role=>({name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,containers:[{image,env:[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`},...(role==='command'?[{name:'PWA_NOTIFICATIONS',value:'enabled'}]:[]),...(['notify','jobs'].includes(role)?[{name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})}]:[])]}]}});
 const make=(digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''))});
 const readGithub=args=>{const id=Number(args[1].split('/runs/')[1].split('/')[0]),kind={11:'full',12:'check',13:'database'}[id],r=m.applicationCi[kind];return args[1].includes('/jobs')?{jobs:r.jobs}:r.run;};
 await verifyR069LivePackage(m,{token:'t',request:make(),readGithub,git});
 await assert.rejects(verifyR069LivePackage(m,{token:'t',request:make('f'),readGithub,git}),/build digest/);
 await assert.rejects(verifyR069LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=readGithub(args);return args[1].includes('/jobs')?{jobs:r.jobs.filter(j=>j.name!=='terraform')}:r;},git}),/R069 full CI missing executed terraform/);
});

// R075: one new image on all four services after the separately applied V96 (PROD 95 to 96); the PROD plan also gives
// the command service Direct VPC egress and the receipt recognizer flag and URL. Source descends from R074, CI is gated
// per job (R074) and the artifact carries the R075 release marker.
const r075Migration='V96__manual_payment_command_v7_bank_reference.sql';
const r075Files={'V94__job_run_contract_and_shared_lock_key.sql':'-- v94','V95__agent_role_session_pair.sql':'-- v95',[r075Migration]:'-- v96'};
const r075Actions=['read.image','command.image','notify.image','jobs.image','command.vpcAccess','command.receiptRecognition','command.receiptRecognitionUrl'];
function r075Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration='database/migrations/'+r075Migration,releaseDatabase=''}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='ls-tree')return Object.keys(r075Files).map(name=>'database/migrations/'+name).join('\n');
  if(args[0]==='show')return r075Files[path.posix.basename(args[1].split(':')[1])];
  if(args[0]==='diff'){
   if(args[2]===r074Release&&args[3]===source)return nulNames(args,migration);
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return nulNames(args,delivery);
   if(args[2]===source&&args[3]===sqlRelease)return releaseDatabase;
   if(args[3]===source)return nulNames(args,changed[args[2]]??'');
   return nulNames(args,dirty);
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function r075Package(t){
 const p=await r068Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:95,targetVersion:96,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r075Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r075.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:17,release:'R075',sourceBaseline:r074Release,applicationCi:r074Ci(p.ci),recognition:{activation:'disabled',url:R075_RECOGNIZER_URL},
  sql:{baselineVersion:95,targetVersion:96,migrations:manifest.migrations.slice(-1),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:95,targetVersion:96,migrationsExecuted:1,startedAt:'2026-10-19T02:00:00Z',finishedAt:'2026-10-19T02:00:40Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'96',historyRows:96,allSuccessful:true,verifiedAt:'2026-10-19T02:05:00Z'}}});
 m.plan.actions=[...r075Actions];m.applied.sqlVersion=96;m.applied.appliedAt='2026-10-19T02:10:00Z';
 await setArtifact(m,'build-version.json',r075Marker(m));
 await setArtifact(m,'assets/test.js',(await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8'))+'\nconst release="R075";');
 return p;
}
test('R075 package validates and rejects SQL, plan, recognizer, CI, readback and artifact tampering',async t=>{
 const {m,source,tool,root}=await r075Package(t),git=r075Git({source,tool});
 const plan=await r075HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 assert.equal((await r075HostingPlan({...structuredClone(m),recognition:{activation:'enabled',url:R075_RECOGNIZER_URL}},{git})).site,site);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=97,/R075 exact V95 to V96/],[x=>x.sql.baselineVersion=94,/R075 exact V95 to V96/],[x=>x.sql.migrations.push({name:'V97__x.sql',sha256:'0'.repeat(64)}),/R075 exact V95 to V96/],[x=>x.sql.migrations=[],/R075 exact V95 to V96/],
  [x=>x.sql.migrations[0].sha256='0'.repeat(64),/R075 migration source hash/],[x=>x.sql.release.sha256='0'.repeat(64),/R075 SQL release changed/],[x=>x.sql.release.commit='7'.repeat(40),/R075 tested SQL release/],
  [x=>x.sql.applied.migrationsExecuted=2,/R075 actual SQL apply/],[x=>x.sql.applied.targetVersion=95,/R075 actual SQL apply/],[x=>x.sql.applied.backup.restorePassed=false,/R075 actual SQL apply/],[x=>delete x.sql.applied.backup.dumpSha256,/R075 actual SQL apply/],[x=>x.sql.applied.backup.reference='dev-activation-x',/R075 actual SQL apply/],[x=>x.sql.applied.database='loan_manager_dev',/R075 actual SQL apply/],[x=>x.sql.applied.finishedAt='2026-10-19T01:59:00Z',/R075 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='95',/R075 read-only V96 readback/],[x=>x.sql.verified.historyRows=95,/R075 read-only V96 readback/],[x=>x.sql.verified.allSuccessful=false,/R075 read-only V96 readback/],[x=>x.sql.verified.verifiedAt='2026-10-19T02:00:10Z',/R075 read-only V96 readback/],
  [x=>x.applied.sqlVersion=95,/R075 applied source/],[x=>x.applied.appliedAt='2026-10-19T01:00:00Z',/R075 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R075 applied source/],
  [x=>x.plan.actions=['read.image','command.image','notify.image','jobs.image'],/R075 reviewed four-service image and recognizer plan/],[x=>x.plan.actions.push('read.vpcAccess'),/R075 reviewed/],[x=>x.plan.actions.reverse(),/R075 reviewed/],[x=>x.plan.counts={add:1,change:4,destroy:0},/R075 reviewed/],[x=>x.plan.counts.change=5,/R075 reviewed/],
  [x=>x.recognition.activation='on',/R075 pinned receipt recognition/],[x=>x.recognition.url='http://10.148.0.3:8790/v1/receipt-recognition',/R075 pinned receipt recognition/],[x=>delete x.recognition,/R075 pinned receipt recognition/],[x=>x.recognition.extra=true,/R075 pinned receipt recognition/],
  [x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R075 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R075 ready service/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R075 ci check: cited run receipt/],[x=>{delete x.applicationCi.database.jobs['rebuild (phase5)']},/R075 database CI jobs must be exactly/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R075 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],
  [x=>x.release='R074',/package kind/],[x=>x.schemaVersion=16,/package kind/],[x=>x.scope='frontend-only',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r075HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r075HostingPlan(prepared,{git}),/R075 runtime apply\/readback/);assert.equal((await r075HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // Other contracts refuse the R075 package, and the former R075 Hosting-only kind is gone.
 await assert.rejects(r068HostingPlan(m,{git}),/package kind/);await assert.rejects(hostingOnlyPlan({...structuredClone(m),schemaVersion:16,scope:'frontend-only',status:'prepared'},{git}),/wrong R075 package kind/);
 const incomplete=JSON.parse(await readFile(m.sql.release.path,'utf8'));incomplete.migrations.pop();const shortPath=path.join(root,'short-r075.json'),shortBytes=JSON.stringify(incomplete);await writeFile(shortPath,shortBytes);
 await assert.rejects(r075HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:shortPath,sha256:createHash('sha256').update(shortBytes).digest('hex'),commit:sqlRelease}}},{git}),/R075 complete migration manifest/);
 const grouped=JSON.parse(await readFile(m.sql.release.path,'utf8'));grouped.productionTransaction.callbacks=['afterMigrate'];const groupedPath=path.join(root,'callbacks-r075.json'),groupedBytes=JSON.stringify(grouped);await writeFile(groupedPath,groupedBytes);
 await assert.rejects(r075HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:groupedPath,sha256:createHash('sha256').update(groupedBytes).digest('hex'),commit:sqlRelease}}},{git}),/R075 grouped V95 to V96 transaction/);
 await assert.rejects(r075HostingPlan(m,{git:r075Git({source,tool,releaseDatabase:'database/migrations/'+r075Migration})}),/R075 SQL release must be the pinned source migrations/);
 assert.equal((await validateR075Sql(m,git)),undefined);
});
test('R075 artifact must carry the R075 release in its marker and bundle',async t=>{
 const {m,source,tool}=await r075Package(t),git=r075Git({source,tool}),original=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r075Marker(m,{release:'R074'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry}),r075Marker(m,{extra:true})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r075HostingPlan(x,{git}),/R075 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r075Marker(m));
 for(const bundle of [original.replace('"R075"','"R074"'),original.replace('"R075"','R075')]){const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle);await assert.rejects(r075HostingPlan(x,{git}),/R075 artifact release mismatch/);}
});
test('R075 source carries only V96 from R074; the delivery commit may add this README and the backup tool',async t=>{
 const {m,source,tool,ci}=await r075Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/database/Backup-ProductionPromotion.py\nscripts/database/connect_preflight.py\nscripts/database/test_connect_preflight.py\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_RECEIPT_RECOGNITION_PWA_2026-10-18.md';
 assert.doesNotThrow(()=>validateR075Source(m,r075Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/business/borrowers.mjs','infrastructure/production/runtime.tf','integration-agent/service-catalogue.json','scripts/database/Invoke-CloudFlyway.py','scripts/database/other_tool.py'])assert.throws(()=>validateR075Source(m,r075Git({source,tool,delivery:file})),/R075 unverified delivery/);
 assert.throws(()=>validateR075Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r075Git({source,tool,delivery:toolFiles})),/R075 unverified delivery/);
 for(const migration of ['','database/migrations/V95__agent_role_session_pair.sql','database/migrations/'+r075Migration+'\ndatabase/migrations/V97__x.sql','database/migrations/V96__other.sql'])assert.throws(()=>validateR075Source(m,r075Git({source,tool,migration})),/R075 carries exactly the separately applied V96/);
 assert.throws(()=>validateR075Source({...m,sourceBaseline:r068Release},r075Git({source,tool})),/R075 source\/baseline/);
 const detached=(root,args)=>args[0]==='merge-base'&&args[1]===r074Release?'0'.repeat(40):r075Git({source,tool})(root,args);
 assert.throws(()=>validateR075Source(m,detached),/R075 source must descend from the R074 release/);
 assert.throws(()=>validateR075Source(m,r075Git({source,tool,dirty:'apps/pwa/src/live-main.tsx'})),/R075 working input/);
 assert.throws(()=>validateR075Source(m,r075Git({source,tool,untracked:'services/new.mjs'})),/R075 untracked/);
 // Per-job CI: a check run older than a services change is not input-equivalent; a run at the delivery commit is,
 // when that commit adds only allowed files.
 await assert.rejects(r075HostingPlan(m,{git:r075Git({source,tool,changed:{[ci]:'services/payment-command/store.mjs'}})}),/R075 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r075HostingPlan(m,{git:r075Git({source,tool,delivery:toolFiles})})).site,site);
 await assert.rejects(r075HostingPlan(m,{git:r075Git({source,tool,delivery:toolFiles+'\napps/pwa/src/live-main.tsx'})}),/R075 unverified delivery/);
});
test('R075 operator audience and live verification re-read per-job CI, Cloud Build, the four services and the command-only recognizer wiring',async t=>{
 const {m,source,tool,image}=await r075Package(t),git=r075Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R075')).operator,email);await assert.rejects(operator('R075','https://lm.mw-credit.com/promotion/r074'),/impersonation proof/);
 const service=(role,edit={})=>{const env=[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`}];
  if(role==='command')env.push({name:'PWA_NOTIFICATIONS',value:'enabled'},{name:'PROD_RECEIPTS',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION',value:edit.activation??m.recognition.activation},{name:'PROD_RECEIPT_RECOGNITION_URL',value:edit.url??R075_RECOGNIZER_URL});
  if(['notify','jobs'].includes(role))env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})});
  if(edit.strayEnv===role)env.push({name:'PROD_RECEIPT_RECOGNITION',value:'disabled'});
  const vpc=role==='command'?(edit.vpc===undefined?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:edit.vpc):edit.strayVpc===role?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:undefined;
  return {name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,...(vpc?{vpcAccess:vpc}:{}),containers:[{image,env}]}};};
 const make=(edit={},digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),edit)});
 const live=r074Readback(m);await verifyR075LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 await verifyR075LivePackage(m,{token:'t',request:make({vpc:{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:`projects/${project}/global/networks/default`,subnetwork:`projects/${project}/regions/asia-southeast1/subnetworks/default`}]}}),readGithub:r074Readback(m).readGithub,git});
 for(const [edit,pattern,digest='e'] of [[{},/build digest/,'f'],[{activation:'enabled'},/recognizer setting drift/],[{url:'http://10.148.0.3:8790/v1/receipt-recognition'},/recognizer setting drift/],[{vpc:null},/VPC egress drift/],[{vpc:{egress:'ALL_TRAFFIC',networkInterfaces:[{network:'default',subnetwork:'default'}]}},/VPC egress drift/],[{vpc:{egress:'PRIVATE_RANGES_ONLY',connector:'c',networkInterfaces:[{network:'default',subnetwork:'default'}]}},/VPC egress drift/],[{strayVpc:'read'},/outside the command service/],[{strayEnv:'jobs'},/outside the command service/]])
  await assert.rejects(verifyR075LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 // Enabled recognition also requires receipts on the command service.
 const enabled={...structuredClone(m),recognition:{activation:'enabled',url:R075_RECOGNIZER_URL}};
 await verifyR075LivePackage(enabled,{token:'t',request:make({activation:'enabled'}),readGithub:r074Readback(enabled).readGithub,git});
 const noReceipts=async url=>{const r=await make({activation:'enabled'})(url),body=await r.json();if(body.template?.containers)body.template.containers[0].env=body.template.containers[0].env.filter(x=>x.name!=='PROD_RECEIPTS');return {ok:true,json:async()=>body};};
 await assert.rejects(verifyR075LivePackage(enabled,{token:'t',request:noReceipts,readGithub:r074Readback(enabled).readGithub,git}),/recognizer setting drift/);
 const skipped=r074Readback(m);await assert.rejects(verifyR075LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=skipped.readGithub(args);if(args[1].endsWith('/runs/25/jobs?per_page=100'))r.jobs.find(j=>j.name==='rebuild (phase5)').conclusion='skipped';return r;},git}),/R075 database rebuild \(phase5\): missing executed job/);
});

// R076 (production hotfix): one new image on all four services on the unchanged V96 (no migration); the PROD plan is the
// four images only and the R075 recognizer wiring stays enabled (read back live). Source descends from the R075 release
// and carries the R075 PROD SQL tooling; CI is gated per job (R074) and the artifact carries the R076 release marker.
const r075Release='96b0a0b120be60fbe9a229d1004eabce35598a0d',r075SqlTooling='6b58f00a9500635251b569ce9824b4810d55e803';
const r076Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R076',...extra});
function r076Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration='',ancestors={}}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return Object.hasOwn(ancestors,args[1])?ancestors[args[1]]:args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='diff'){
   if(args[2]===r075Release&&args[3]===source)return nulNames(args,migration);
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return nulNames(args,delivery);
   if(args[3]===source)return nulNames(args,changed[args[2]]??'');
   return nulNames(args,dirty);
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function r076Package(t){
 const p=await r068Package(t),m=p.m;
 Object.assign(m,{schemaVersion:18,release:'R076',sourceBaseline:r075Release,applicationCi:r074Ci(p.ci),recognition:{activation:'enabled',url:R075_RECOGNIZER_URL},
  sql:{baselineVersion:96,targetVersion:96,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'96',historyRows:96,allSuccessful:true,verifiedAt:'2026-10-19T03:00:00Z'}}});
 m.plan.actions=['read.image','command.image','notify.image','jobs.image'];m.applied.sqlVersion=96;m.applied.appliedAt='2026-10-19T03:10:00Z';
 await setArtifact(m,'build-version.json',r076Marker(m));
 await setArtifact(m,'assets/test.js',(await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8'))+'\nconst release="R076";');
 return p;
}
test('R076 package validates and rejects SQL, plan, recognizer, CI, readback and artifact tampering',async t=>{
 const {m,source,tool}=await r076Package(t),git=r076Git({source,tool});
 const plan=await r076HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=97,/R076 requires verified V96 with no migration/],[x=>x.sql.baselineVersion=95,/R076 requires verified V96/],[x=>x.sql.migrations=[{name:'V97__x.sql',sha256:'0'.repeat(64)}],/R076 requires verified V96/],[x=>delete x.sql.migrations,/R076 requires verified V96/],
  [x=>x.sql.verified.latestVersion='95',/R076 requires verified V96/],[x=>x.sql.verified.historyRows=95,/R076 requires verified V96/],[x=>x.sql.verified.allSuccessful=false,/R076 requires verified V96/],[x=>x.sql.verified.database='loan_manager_dev',/R076 requires verified V96/],[x=>x.sql.verified.verifiedAt='2026-10-19 03:00',/R076 requires verified V96/],[x=>delete x.sql.verified,/R076 requires verified V96/],
  [x=>x.applied.sqlVersion=95,/R076 applied source/],[x=>x.applied.appliedAt='yesterday',/R076 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R076 applied source/],[x=>x.applied.database='loan_manager_dev',/R076 applied source/],
  [x=>x.plan.actions.push('command.vpcAccess'),/R076 reviewed four-image plan/],[x=>x.plan.actions.push('command.receiptRecognition'),/R076 reviewed four-image plan/],[x=>x.plan.actions=['read.image','command.image','notify.image'],/R076 reviewed/],[x=>x.plan.actions.reverse(),/R076 reviewed/],[x=>x.plan.counts={add:1,change:4,destroy:0},/R076 reviewed/],[x=>x.plan.counts.change=5,/R076 reviewed/],[x=>x.plan.counts.destroy=1,/R076 reviewed/],
  [x=>x.recognition.activation='disabled',/R076 unchanged enabled receipt recognition/],[x=>x.recognition.url='http://10.148.0.3:8790/v1/receipt-recognition',/R076 unchanged enabled/],[x=>delete x.recognition,/R076 unchanged enabled/],[x=>x.recognition.extra=true,/R076 unchanged enabled/],
  [x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.rollback.services.command.revision='other',/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R076 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R076 ready service/],[x=>x.applied.services.jobs.trafficPercent=50,/R076 ready service/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R076 ci check: cited run receipt/],[x=>{delete x.applicationCi.database.jobs['rebuild (phase5)']},/R076 database CI jobs must be exactly/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R076 PROD image provenance/],[x=>x.build.status='FAILURE',/R076 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],
  [x=>x.release='R075',/package kind/],[x=>x.schemaVersion=17,/package kind/],[x=>x.scope='frontend-only',/package kind/],[x=>x.environment='dev',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r076HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r076HostingPlan(prepared,{git}),/R076 runtime apply\/readback/);assert.equal((await r076HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // Other contracts refuse the R076 package, and R076 refuses an R075 package.
 await assert.rejects(r075HostingPlan(m,{git}),/package kind/);await assert.rejects(r069HostingPlan(m,{git}),/package kind/);await assert.rejects(r076HostingPlan({...structuredClone(m),schemaVersion:17,release:'R075'},{git}),/wrong R076 package kind/);
});
test('R076 artifact must carry the R076 release in its marker and bundle',async t=>{
 const {m,source,tool}=await r076Package(t),git=r076Git({source,tool}),original=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r076Marker(m,{release:'R075'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry}),r076Marker(m,{extra:true})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r076HostingPlan(x,{git}),/R076 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r076Marker(m));
 for(const bundle of [original.replace('"R076"','"R075"'),original.replace('"R076"','R076')]){const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle);await assert.rejects(r076HostingPlan(x,{git}),/R076 artifact release mismatch/);}
});
test('R076 source descends from R075 with the SQL tooling, carries no migration; the delivery commit may add this README',async t=>{
 const {m,source,tool,ci}=await r076Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R076_SLIP_ACCOUNT_2026-10-18.md';
 assert.doesNotThrow(()=>validateR076Source(m,r076Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/receipts/recognizer-rules.mjs','apps/pwa/src/SelectedCharges.tsx','infrastructure/production/runtime.tf','integration-agent/service-catalogue.json','scripts/database/Backup-ProductionPromotion.py','scripts/database/connect_preflight.py'])assert.throws(()=>validateR076Source(m,r076Git({source,tool,delivery:file})),/R076 unverified delivery/);
 assert.throws(()=>validateR076Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r076Git({source,tool,delivery:toolFiles})),/R076 unverified delivery/);
 assert.throws(()=>validateR076Source({...m,deliveryToolChecks:{command:'node --test tests/unit/business-hosting-delivery.test.mjs',exitCode:1}},r076Git({source,tool,delivery:toolFiles})),/R076 unverified delivery/);
 for(const migration of ['database/migrations/V97__x.sql','database/migrations/V96__manual_payment_command_v7_bank_reference.sql'])assert.throws(()=>validateR076Source(m,r076Git({source,tool,migration})),/R076 carries no migration/);
 assert.throws(()=>validateR076Source({...m,sourceBaseline:r074Release},r076Git({source,tool})),/R076 source\/baseline/);
 assert.throws(()=>validateR076Source({...m,artifactSourceCommit:tool==='f'.repeat(40)?'e'.repeat(40):'f'.repeat(40)},r076Git({source,tool})),/R076 source\/baseline/);
 assert.throws(()=>validateR076Source(m,r076Git({source,tool,ancestors:{[r075Release]:'0'.repeat(40)}})),/R076 source must descend from the R075 release/);
 assert.throws(()=>validateR076Source(m,r076Git({source,tool,ancestors:{[r075SqlTooling]:r075Release}})),/R076 source must carry the R075 PROD SQL tooling/);
 assert.throws(()=>validateR076Source(m,r076Git({source,tool,dirty:'apps/pwa/src/live-main.tsx'})),/R076 working input/);
 assert.throws(()=>validateR076Source(m,r076Git({source,tool,untracked:'services/new.mjs'})),/R076 untracked/);
 // Per-job CI: a check run older than a PWA change is not input-equivalent; a run at the delivery commit is,
 // when that commit adds only allowed files.
 await assert.rejects(r076HostingPlan(m,{git:r076Git({source,tool,changed:{[ci]:'apps/pwa/src/SelectedCharges.tsx'}})}),/R076 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r076HostingPlan(m,{git:r076Git({source,tool,delivery:toolFiles})})).site,site);
 await assert.rejects(r076HostingPlan(m,{git:r076Git({source,tool,delivery:toolFiles+'\nservices/receipts/recognizer-rules.mjs'})}),/R076 unverified delivery/);
});
test('R076 operator audience and live verification re-read per-job CI, Cloud Build, the four services and the unchanged recognizer wiring',async t=>{
 const {m,source,tool,image}=await r076Package(t),git=r076Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R076')).operator,email);await assert.rejects(operator('R076','https://lm.mw-credit.com/promotion/r075'),/impersonation proof/);await assert.rejects(operator('R082'),/unsupported operator release/);
 const service=(role,edit={})=>{const env=[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`}];
  if(role==='command'){env.push({name:'PWA_NOTIFICATIONS',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION',value:edit.activation??'enabled'},{name:'PROD_RECEIPT_RECOGNITION_URL',value:edit.url??R075_RECOGNIZER_URL});if(!edit.noReceipts)env.push({name:'PROD_RECEIPTS',value:'enabled'});}
  if(['notify','jobs'].includes(role))env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})});
  if(edit.strayEnv===role)env.push({name:'PROD_RECEIPT_RECOGNITION',value:'enabled'});
  const vpc=role==='command'?(edit.vpc===undefined?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:edit.vpc):edit.strayVpc===role?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:undefined;
  return {name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,...(vpc?{vpcAccess:vpc}:{}),containers:[{image:edit.image??image,env}]}};};
 const make=(edit={},digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),edit)});
 const live=r074Readback(m);await verifyR076LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern,digest='e'] of [[{},/build digest/,'f'],[{activation:'disabled'},/R076 live command recognizer setting drift/],[{url:'http://10.148.0.3:8790/v1/receipt-recognition'},/R076 live command recognizer setting drift/],[{noReceipts:true},/R076 live command recognizer setting drift/],[{vpc:null},/R076 live command VPC egress drift/],[{vpc:{egress:'ALL_TRAFFIC',networkInterfaces:[{network:'default',subnetwork:'default'}]}},/R076 live command VPC egress drift/],[{strayVpc:'read'},/R076 recognizer wiring outside the command service/],[{strayEnv:'notify'},/R076 recognizer wiring outside the command service/]])
  await assert.rejects(verifyR076LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 const skipped=r074Readback(m);await assert.rejects(verifyR076LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=skipped.readGithub(args);if(args[1].endsWith('/runs/25/jobs?per_page=100'))r.jobs.find(j=>j.name==='rebuild (phase5)').conclusion='skipped';return r;},git}),/R076 database rebuild \(phase5\): missing executed job/);
});

// R077: the R076 kind on V96 with the source descending from the R076 release, the plan adding the command request
// timeout (15 s to 55 s) and the four live service timeouts read back (command 55 s, reader 15 s, workers 120 s).
const r076Release='fa67607e4571d1c01ed39f7919cc627fd5e27ee7';
const r077Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R077',...extra});
const r077Actions=['read.image','command.image','notify.image','jobs.image','command.timeout'];
function r077Git(options={}){
 const base=r076Git({...options,migration:''});
 return (root,args)=>args[0]==='diff'&&args[2]===r076Release&&args[3]===options.source?nulNames(args,options.migration??''):base(root,args);
}
async function r077Package(t){
 const p=await r076Package(t),m=p.m;
 Object.assign(m,{schemaVersion:19,release:'R077',sourceBaseline:r076Release});
 m.plan.actions=[...r077Actions];
 await setArtifact(m,'build-version.json',r077Marker(m));
 await setArtifact(m,'assets/test.js',(await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8')).replace('"R076"','"R077"'));
 return p;
}
test('R077 package validates and rejects SQL, plan, recognizer, CI, readback and artifact tampering',async t=>{
 const {m,source,tool}=await r077Package(t),git=r077Git({source,tool});
 const plan=await r077HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=97,/R077 requires verified V96 with no migration/],[x=>x.sql.migrations=[{name:'V97__x.sql',sha256:'0'.repeat(64)}],/R077 requires verified V96/],[x=>x.sql.verified.latestVersion='95',/R077 requires verified V96/],[x=>x.sql.verified.historyRows=97,/R077 requires verified V96/],[x=>x.sql.verified.allSuccessful=false,/R077 requires verified V96/],[x=>delete x.sql.verified,/R077 requires verified V96/],
  [x=>x.applied.sqlVersion=95,/R077 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R077 applied source/],[x=>x.applied.database='loan_manager_dev',/R077 applied source/],
  [x=>x.plan.actions=['read.image','command.image','notify.image','jobs.image'],/R077 reviewed four-image and command timeout plan/],[x=>x.plan.actions.push('read.timeout'),/R077 reviewed/],[x=>x.plan.actions.push('command.vpcAccess'),/R077 reviewed/],[x=>x.plan.actions.reverse(),/R077 reviewed/],[x=>x.plan.actions[4]='read.timeout',/R077 reviewed/],[x=>x.plan.counts={add:1,change:4,destroy:0},/R077 reviewed/],[x=>x.plan.counts.change=5,/R077 reviewed/],
  [x=>x.recognition.activation='disabled',/R077 unchanged enabled receipt recognition/],[x=>x.recognition.url='http://10.148.0.3:8790/v1/receipt-recognition',/R077 unchanged enabled/],[x=>delete x.recognition,/R077 unchanged enabled/],
  [x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R077 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R077 ready service/],[x=>x.applied.services.jobs.ready=false,/R077 ready service/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R077 ci check: cited run receipt/],[x=>{delete x.applicationCi.database.jobs.guards},/R077 database CI jobs must be exactly/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R077 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],
  [x=>x.release='R076',/package kind/],[x=>x.schemaVersion=18,/package kind/],[x=>x.scope='frontend-only',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r077HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r077HostingPlan(prepared,{git}),/R077 runtime apply\/readback/);assert.equal((await r077HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // R076 and R077 refuse each other's packages.
 await assert.rejects(r076HostingPlan(m,{git}),/wrong R076 package kind/);await assert.rejects(r077HostingPlan({...structuredClone(m),schemaVersion:18,release:'R076'},{git}),/wrong R077 package kind/);
});
test('R077 artifact must carry the R077 release in its marker and bundle',async t=>{
 const {m,source,tool}=await r077Package(t),git=r077Git({source,tool}),original=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r077Marker(m,{release:'R076'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry}),r077Marker(m,{extra:true})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r077HostingPlan(x,{git}),/R077 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r077Marker(m));
 for(const bundle of [original.replace('"R077"','"R076"'),original.replace('"R077"','R077')]){const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle);await assert.rejects(r077HostingPlan(x,{git}),/R077 artifact release mismatch/);}
});
test('R077 source descends from R076 and carries no migration; the delivery commit may add this README',async t=>{
 const {m,source,tool,ci}=await r077Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R077_RECOGNITION_TIMING_2026-10-19.md';
 assert.doesNotThrow(()=>validateR077Source(m,r077Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/receipts/recognizer-client.mjs','apps/pwa/src/recognition-timing.ts','infrastructure/production/runtime.tf','integration-agent/src/mw_integration_agent/receipt_image.py'])assert.throws(()=>validateR077Source(m,r077Git({source,tool,delivery:file})),/R077 unverified delivery/);
 assert.throws(()=>validateR077Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r077Git({source,tool,delivery:toolFiles})),/R077 unverified delivery/);
 for(const migration of ['database/migrations/V97__x.sql','database/migrations/V96__manual_payment_command_v7_bank_reference.sql'])assert.throws(()=>validateR077Source(m,r077Git({source,tool,migration})),/R077 carries no migration/);
 assert.throws(()=>validateR077Source({...m,sourceBaseline:r075Release},r077Git({source,tool})),/R077 source\/baseline/);
 assert.throws(()=>validateR077Source(m,r077Git({source,tool,ancestors:{[r076Release]:r075Release}})),/R077 source must descend from the R076 release/);
 assert.throws(()=>validateR077Source(m,r077Git({source,tool,dirty:'services/receipts/recognizer-client.mjs'})),/R077 working input/);
 assert.throws(()=>validateR077Source(m,r077Git({source,tool,untracked:'apps/pwa/src/new.ts'})),/R077 untracked/);
 await assert.rejects(r077HostingPlan(m,{git:r077Git({source,tool,changed:{[ci]:'services/receipts/recognizer-client.mjs'}})}),/R077 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r077HostingPlan(m,{git:r077Git({source,tool,delivery:toolFiles})})).site,site);
 await assert.rejects(r077HostingPlan(m,{git:r077Git({source,tool,delivery:toolFiles+'\napps/pwa/src/SelectedCharges.tsx'})}),/R077 unverified delivery/);
});
test('R077 operator audience and live verification re-read CI, Cloud Build, the recognizer wiring and the four service timeouts',async t=>{
 const {m,source,tool,image}=await r077Package(t),git=r077Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R077')).operator,email);await assert.rejects(operator('R077','https://lm.mw-credit.com/promotion/r076'),/impersonation proof/);await assert.rejects(operator('R082'),/unsupported operator release/);
 assert.deepEqual({...R077_SERVICE_TIMEOUTS},{read:'15s',command:'55s',notify:'120s',jobs:'120s'});
 const service=(role,edit={})=>{const env=[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`}];
  if(role==='command')env.push({name:'PWA_NOTIFICATIONS',value:'enabled'},{name:'PROD_RECEIPTS',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION',value:edit.activation??'enabled'},{name:'PROD_RECEIPT_RECOGNITION_URL',value:R075_RECOGNIZER_URL});
  if(['notify','jobs'].includes(role))env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})});
  const vpc=role==='command'?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:undefined;
  const timeout=Object.hasOwn(edit.timeouts??{},role)?edit.timeouts[role]:R077_SERVICE_TIMEOUTS[role];
  return {name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,...(timeout===undefined?{}:{timeout}),...(vpc?{vpcAccess:vpc}:{}),containers:[{image,env}]}};};
 const make=(edit={},digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),edit)});
 const live=r074Readback(m);await verifyR077LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern,digest='e'] of [[{},/build digest/,'f'],[{activation:'disabled'},/R077 live command recognizer setting drift/],
  [{timeouts:{command:'15s'}},/R077 live command request timeout must be 55s/],[{timeouts:{command:'60s'}},/R077 live command request timeout/],[{timeouts:{command:undefined}},/R077 live command request timeout/],
  [{timeouts:{read:'55s'}},/R077 live read request timeout must be 15s/],[{timeouts:{notify:'15s'}},/R077 live notify request timeout must be 120s/],[{timeouts:{jobs:'55s'}},/R077 live jobs request timeout must be 120s/]])
  await assert.rejects(verifyR077LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 const skipped=r074Readback(m);await assert.rejects(verifyR077LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=skipped.readGithub(args);if(args[1].endsWith('/runs/25/jobs?per_page=100'))r.jobs.find(j=>j.name==='rebuild (phase8)').conclusion='skipped';return r;},git}),/R077 database rebuild \(phase8\): missing executed job/);
});

// R078: one new image on all four services after the separately applied V97 (PROD 96 to 97, PWA row-change log). The
// SQL evidence is R075's kind, the plan is the four images only, the recognizer wiring and the R077 timeouts stay and
// are read back live; source descends from R077 and adds exactly V97; the artifact carries the R078 release marker.
const r077Release='683cfceed724778151e1e305adaea50b9ab20c94';
const r078Migration='V97__pwa_row_changes.sql';
const r078Files={'V95__agent_role_session_pair.sql':'-- v95','V96__manual_payment_command_v7_bank_reference.sql':'-- v96',[r078Migration]:'-- v97'};
const r078Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R078',...extra});
function r078Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration='database/migrations/'+r078Migration,releaseDatabase='',ancestors={}}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return Object.hasOwn(ancestors,args[1])?ancestors[args[1]]:args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='ls-tree')return Object.keys(r078Files).map(name=>'database/migrations/'+name).join('\n');
  if(args[0]==='show')return r078Files[path.posix.basename(args[1].split(':')[1])];
  if(args[0]==='diff'){
   if(args[2]===r077Release&&args[3]===source)return nulNames(args,migration);
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return nulNames(args,delivery);
   if(args[2]===source&&args[3]===sqlRelease)return releaseDatabase;
   if(args[3]===source)return nulNames(args,changed[args[2]]??'');
   return nulNames(args,dirty);
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function r078Package(t){
 const p=await r068Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:96,targetVersion:97,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r078Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r078.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:20,release:'R078',sourceBaseline:r077Release,applicationCi:r074Ci(p.ci),recognition:{activation:'enabled',url:R075_RECOGNIZER_URL},
  sql:{baselineVersion:96,targetVersion:97,migrations:manifest.migrations.slice(-1),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:96,targetVersion:97,migrationsExecuted:1,startedAt:'2026-10-19T18:00:00Z',finishedAt:'2026-10-19T18:00:10Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'97',historyRows:97,allSuccessful:true,verifiedAt:'2026-10-19T18:02:00Z'}}});
 m.plan.actions=['read.image','command.image','notify.image','jobs.image'];m.applied.sqlVersion=97;m.applied.appliedAt='2026-10-19T18:10:00Z';
 await setArtifact(m,'build-version.json',r078Marker(m));
 await setArtifact(m,'assets/test.js',(await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8'))+'\nconst release="R078";');
 return p;
}
test('R078 package validates and rejects SQL, plan, recognizer, CI, readback and artifact tampering',async t=>{
 const {m,source,tool,root}=await r078Package(t),git=r078Git({source,tool});
 const plan=await r078HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=98,/R078 exact V96 to V97/],[x=>x.sql.baselineVersion=95,/R078 exact V96 to V97/],[x=>x.sql.migrations.push({name:'V98__x.sql',sha256:'0'.repeat(64)}),/R078 exact V96 to V97/],[x=>x.sql.migrations=[],/R078 exact V96 to V97/],
  [x=>x.sql.migrations[0].sha256='0'.repeat(64),/R078 migration source hash/],[x=>x.sql.release.sha256='0'.repeat(64),/R078 SQL release changed/],[x=>x.sql.release.commit='7'.repeat(40),/R078 tested SQL release/],
  [x=>x.sql.applied.migrationsExecuted=2,/R078 actual SQL apply/],[x=>x.sql.applied.targetVersion=96,/R078 actual SQL apply/],[x=>x.sql.applied.backup.restorePassed=false,/R078 actual SQL apply/],[x=>delete x.sql.applied.backup.dumpSha256,/R078 actual SQL apply/],[x=>x.sql.applied.backup.reference='dev-v97-'+'c'.repeat(32),/R078 actual SQL apply/],[x=>x.sql.applied.database='loan_manager_dev',/R078 actual SQL apply/],[x=>x.sql.applied.finishedAt='2026-10-19T17:59:00Z',/R078 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='96',/R078 read-only V97 readback/],[x=>x.sql.verified.historyRows=96,/R078 read-only V97 readback/],[x=>x.sql.verified.allSuccessful=false,/R078 read-only V97 readback/],[x=>x.sql.verified.verifiedAt='2026-10-19T18:00:05Z',/R078 read-only V97 readback/],[x=>delete x.sql.verified,/R078 read-only V97 readback/],
  [x=>x.applied.sqlVersion=96,/R078 applied source/],[x=>x.applied.appliedAt='2026-10-19T17:00:00Z',/R078 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R078 applied source/],[x=>x.applied.database='loan_manager_dev',/R078 applied source/],
  [x=>x.plan.actions.push('command.timeout'),/R078 reviewed four-image plan/],[x=>x.plan.actions.push('command.vpcAccess'),/R078 reviewed/],[x=>x.plan.actions.reverse(),/R078 reviewed/],[x=>x.plan.counts={add:1,change:4,destroy:0},/R078 reviewed/],[x=>x.plan.counts.change=5,/R078 reviewed/],
  [x=>x.recognition.activation='disabled',/R078 unchanged enabled receipt recognition/],[x=>x.recognition.url='http://10.148.0.3:8790/v1/receipt-recognition',/R078 unchanged enabled/],[x=>delete x.recognition,/R078 unchanged enabled/],
  [x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R078 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R078 ready service/],[x=>x.applied.services.jobs.ready=false,/R078 ready service/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R078 ci check: cited run receipt/],[x=>{delete x.applicationCi.database.jobs.guards},/R078 database CI jobs must be exactly/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R078 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],
  [x=>x.release='R077',/package kind/],[x=>x.schemaVersion=19,/package kind/],[x=>x.scope='frontend-only',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r078HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r078HostingPlan(prepared,{git}),/R078 runtime apply\/readback/);assert.equal((await r078HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // R077 and R078 refuse each other's packages.
 await assert.rejects(r077HostingPlan(m,{git}),/wrong R077 package kind/);await assert.rejects(r078HostingPlan({...structuredClone(m),schemaVersion:19,release:'R077'},{git}),/wrong R078 package kind/);
 const grouped=JSON.parse(await readFile(m.sql.release.path,'utf8'));grouped.productionTransaction.targetVersion=96;const groupedPath=path.join(root,'target-r078.json'),groupedBytes=JSON.stringify(grouped);await writeFile(groupedPath,groupedBytes);
 await assert.rejects(r078HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:groupedPath,sha256:createHash('sha256').update(groupedBytes).digest('hex'),commit:sqlRelease}}},{git}),/R078 grouped V96 to V97 transaction/);
 await assert.rejects(r078HostingPlan(m,{git:r078Git({source,tool,releaseDatabase:'database/migrations/'+r078Migration})}),/R078 SQL release must be the pinned source migrations/);
 assert.equal((await validateR078Sql(m,git)),undefined);
});
test('R078 artifact must carry the R078 release in its marker and bundle',async t=>{
 const {m,source,tool}=await r078Package(t),git=r078Git({source,tool}),original=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r078Marker(m,{release:'R077'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry}),r078Marker(m,{extra:true})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r078HostingPlan(x,{git}),/R078 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r078Marker(m));
 for(const bundle of [original.replace('"R078"','"R077"'),original.replace('"R078"','R078')]){const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle);await assert.rejects(r078HostingPlan(x,{git}),/R078 artifact release mismatch/);}
});
test('R078 source descends from R077 and adds exactly V97; the delivery commit may add this README and the backup tool',async t=>{
 const {m,source,tool,ci}=await r078Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/database/Backup-ProductionPromotion.py\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R078_DELTA_SYNC_EFFICIENCY_2026-10-19.md';
 assert.doesNotThrow(()=>validateR078Source(m,r078Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/business/offline-dataset-delta.mjs','apps/pwa/src/offline-dataset.ts','database/migrations/V98__x.sql','infrastructure/production/runtime.tf','scripts/database/connect_preflight.py','integration-agent/src/mw_integration_agent/receipt_image.py'])assert.throws(()=>validateR078Source(m,r078Git({source,tool,delivery:file})),/R078 unverified delivery/);
 assert.throws(()=>validateR078Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r078Git({source,tool,delivery:toolFiles})),/R078 unverified delivery/);
 for(const migration of ['','database/migrations/V98__x.sql','database/migrations/'+r078Migration+'\0database/migrations/V98__x.sql'])assert.throws(()=>validateR078Source(m,r078Git({source,tool,migration})),/R078 carries exactly the separately applied V97/);
 assert.throws(()=>validateR078Source({...m,sourceBaseline:r076Release},r078Git({source,tool})),/R078 source\/baseline/);
 assert.throws(()=>validateR078Source(m,r078Git({source,tool,ancestors:{[r077Release]:r076Release}})),/R078 source must descend from the R077 release/);
 assert.throws(()=>validateR078Source(m,r078Git({source,tool,dirty:'services/lib/pool.mjs'})),/R078 working input/);
 assert.throws(()=>validateR078Source(m,r078Git({source,tool,untracked:'apps/pwa/src/new.ts'})),/R078 untracked/);
 await assert.rejects(r078HostingPlan(m,{git:r078Git({source,tool,changed:{[ci]:'services/lib/pool.mjs'}})}),/R078 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r078HostingPlan(m,{git:r078Git({source,tool,delivery:toolFiles})})).site,site);
 await assert.rejects(r078HostingPlan(m,{git:r078Git({source,tool,delivery:toolFiles+'\nservices/lib/firebase-claims.mjs'})}),/R078 unverified delivery/);
});
test('R078 operator audience and live verification re-read CI, Cloud Build, the recognizer wiring and the four service timeouts',async t=>{
 const {m,source,tool,image}=await r078Package(t),git=r078Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R078')).operator,email);await assert.rejects(operator('R078','https://lm.mw-credit.com/promotion/r077'),/impersonation proof/);await assert.rejects(operator('R082'),/unsupported operator release/);
 const service=(role,edit={})=>{const env=[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`}];
  if(role==='command')env.push({name:'PWA_NOTIFICATIONS',value:'enabled'},{name:'PROD_RECEIPTS',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION',value:edit.activation??'enabled'},{name:'PROD_RECEIPT_RECOGNITION_URL',value:R075_RECOGNIZER_URL});
  if(['notify','jobs'].includes(role))env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})});
  const vpc=role==='command'?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:undefined;
  const timeout=Object.hasOwn(edit.timeouts??{},role)?edit.timeouts[role]:R077_SERVICE_TIMEOUTS[role];
  return {name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,...(timeout===undefined?{}:{timeout}),...(vpc?{vpcAccess:vpc}:{}),containers:[{image,env}]}};};
 const make=(edit={},digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),edit)});
 const live=r074Readback(m);await verifyR078LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern,digest='e'] of [[{},/build digest/,'f'],[{activation:'disabled'},/R078 live command recognizer setting drift/],
  [{timeouts:{command:'15s'}},/R078 live command request timeout must be 55s/],[{timeouts:{command:undefined}},/R078 live command request timeout/],
  [{timeouts:{read:'55s'}},/R078 live read request timeout must be 15s/],[{timeouts:{notify:'15s'}},/R078 live notify request timeout must be 120s/],[{timeouts:{jobs:'55s'}},/R078 live jobs request timeout must be 120s/]])
  await assert.rejects(verifyR078LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 const skipped=r074Readback(m);await assert.rejects(verifyR078LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=skipped.readGithub(args);if(args[1].endsWith('/runs/25/jobs?per_page=100'))r.jobs.find(j=>j.name==='rebuild (migrations)').conclusion='skipped';return r;},git}),/R078 database rebuild \(migrations\): missing executed job/);
});

// R079 (production hotfix, API receipt amount parsing): the R076/R077 kind on V98 (no migration; PROD already holds 98
// history rows). Source descends from the R078 release and carries the V98 commit with no migration change since it; the
// plan is the four images only; the recognizer wiring and the R077 timeouts stay and are read back live.
const r078Release='68ce6694f27960a3f018634052c4cde6fc9923f7',v98Commit='7ae8469a4da2e79ba774907041d0f21acf068887';
const r079Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R079',...extra});
function r079Git(options={}){
 const base=r076Git({...options,migration:''});
 return (root,args)=>args[0]==='diff'&&args[2]===v98Commit&&args[3]===options.source?nulNames(args,options.migration??''):base(root,args);
}
async function r079Package(t){
 const p=await r076Package(t),m=p.m;
 Object.assign(m,{schemaVersion:21,release:'R079',sourceBaseline:r078Release,
  sql:{baselineVersion:98,targetVersion:98,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'98',historyRows:98,allSuccessful:true,verifiedAt:'2026-10-20T03:00:00Z'}}});
 m.applied.sqlVersion=98;m.applied.appliedAt='2026-10-20T03:10:00Z';
 await setArtifact(m,'build-version.json',r079Marker(m));
 await setArtifact(m,'assets/test.js',(await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8')).replace('"R076"','"R079"'));
 return p;
}
test('R079 package validates and rejects SQL, plan, recognizer, CI, readback and artifact tampering',async t=>{
 const {m,source,tool}=await r079Package(t),git=r079Git({source,tool});
 const plan=await r079HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=99,/R079 requires verified V98 with no migration/],[x=>x.sql.baselineVersion=97,/R079 requires verified V98/],[x=>x.sql.targetVersion=96,/R079 requires verified V98/],[x=>x.sql.migrations=[{name:'V99__x.sql',sha256:'0'.repeat(64)}],/R079 requires verified V98/],[x=>delete x.sql.migrations,/R079 requires verified V98/],
  [x=>x.sql.verified.latestVersion='97',/R079 requires verified V98/],[x=>x.sql.verified.latestVersion='96',/R079 requires verified V98/],[x=>x.sql.verified.historyRows=97,/R079 requires verified V98/],[x=>x.sql.verified.historyRows=99,/R079 requires verified V98/],[x=>x.sql.verified.allSuccessful=false,/R079 requires verified V98/],[x=>x.sql.verified.database='loan_manager_dev',/R079 requires verified V98/],[x=>x.sql.verified.verifiedAt='2026-10-20 03:00',/R079 requires verified V98/],[x=>delete x.sql.verified,/R079 requires verified V98/],
  [x=>x.applied.sqlVersion=97,/R079 applied source/],[x=>x.applied.appliedAt='today',/R079 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R079 applied source/],[x=>x.applied.database='loan_manager_dev',/R079 applied source/],
  [x=>x.plan.actions=['read.image','command.image','notify.image','jobs.image','command.timeout'],/R079 reviewed four-image plan/],[x=>x.plan.actions.push('command.vpcAccess'),/R079 reviewed four-image plan/],[x=>x.plan.actions=['read.image','command.image','notify.image'],/R079 reviewed/],[x=>x.plan.actions.reverse(),/R079 reviewed/],[x=>x.plan.counts={add:1,change:4,destroy:0},/R079 reviewed/],[x=>x.plan.counts.change=5,/R079 reviewed/],[x=>x.plan.counts.destroy=1,/R079 reviewed/],
  [x=>x.recognition.activation='disabled',/R079 unchanged enabled receipt recognition/],[x=>x.recognition.url='http://10.148.0.3:8790/v1/receipt-recognition',/R079 unchanged enabled/],[x=>delete x.recognition,/R079 unchanged enabled/],[x=>x.recognition.extra=true,/R079 unchanged enabled/],
  [x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R079 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R079 ready service/],[x=>x.applied.services.jobs.ready=false,/R079 ready service/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R079 ci check: cited run receipt/],[x=>{delete x.applicationCi.database.jobs.guards},/R079 database CI jobs must be exactly/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R079 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],
  [x=>x.release='R078',/package kind/],[x=>x.schemaVersion=20,/package kind/],[x=>x.scope='frontend-only',/package kind/],[x=>x.environment='dev',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r079HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r079HostingPlan(prepared,{git}),/R079 runtime apply\/readback/);assert.equal((await r079HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // R077, R078 and R079 refuse each other's packages.
 await assert.rejects(r077HostingPlan(m,{git}),/wrong R077 package kind/);await assert.rejects(r078HostingPlan(m,{git}),/wrong R078 package kind/);await assert.rejects(r079HostingPlan({...structuredClone(m),schemaVersion:19,release:'R077'},{git}),/wrong R079 package kind/);await assert.rejects(r079HostingPlan({...structuredClone(m),schemaVersion:20,release:'R078'},{git}),/wrong R079 package kind/);
});
test('R079 artifact must carry the R079 release in its marker and bundle',async t=>{
 const {m,source,tool}=await r079Package(t),git=r079Git({source,tool}),original=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r079Marker(m,{release:'R078'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry}),r079Marker(m,{extra:true})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r079HostingPlan(x,{git}),/R079 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r079Marker(m));
 for(const bundle of [original.replace('"R079"','"R078"'),original.replace('"R079"','R079')]){const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle);await assert.rejects(r079HostingPlan(x,{git}),/R079 artifact release mismatch/);}
});
test('R079 source descends from R078 and carries V98 with no later migration; the delivery commit may add this README',async t=>{
 const {m,source,tool,ci}=await r079Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R079_RECEIPT_AMOUNT_COMMA_2026-10-20.md';
 assert.doesNotThrow(()=>validateR079Source(m,r079Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/receipts/recognizer-rules.mjs','apps/pwa/src/SelectedCharges.tsx','infrastructure/production/runtime.tf','integration-agent/src/mw_integration_agent/receipt_image.py','scripts/database/Backup-ProductionPromotion.py'])assert.throws(()=>validateR079Source(m,r079Git({source,tool,delivery:file})),/R079 unverified delivery/);
 assert.throws(()=>validateR079Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r079Git({source,tool,delivery:toolFiles})),/R079 unverified delivery/);
 for(const migration of ['database/migrations/V99__x.sql','database/migrations/V98__pwa_row_changes_app_read.sql'])assert.throws(()=>validateR079Source(m,r079Git({source,tool,migration})),/R079 carries no migration/);
 assert.throws(()=>validateR079Source({...m,sourceBaseline:r077Release},r079Git({source,tool})),/R079 source\/baseline/);
 assert.throws(()=>validateR079Source({...m,artifactSourceCommit:tool==='f'.repeat(40)?'e'.repeat(40):'f'.repeat(40)},r079Git({source,tool})),/R079 source\/baseline/);
 assert.throws(()=>validateR079Source(m,r079Git({source,tool,ancestors:{[r078Release]:r077Release}})),/R079 source must descend from the R078 release/);
 assert.throws(()=>validateR079Source(m,r079Git({source,tool,ancestors:{[v98Commit]:r078Release}})),/R079 source must carry the V98 commit/);
 assert.throws(()=>validateR079Source(m,r079Git({source,tool,dirty:'services/receipts/recognizer-rules.mjs'})),/R079 working input/);
 assert.throws(()=>validateR079Source(m,r079Git({source,tool,untracked:'apps/pwa/src/new.ts'})),/R079 untracked/);
 await assert.rejects(r079HostingPlan(m,{git:r079Git({source,tool,changed:{[ci]:'services/receipts/recognizer-rules.mjs'}})}),/R079 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r079HostingPlan(m,{git:r079Git({source,tool,delivery:toolFiles})})).site,site);
 await assert.rejects(r079HostingPlan(m,{git:r079Git({source,tool,delivery:toolFiles+'\nservices/receipts/recognizer-rules.mjs'})}),/R079 unverified delivery/);
});
test('R079 operator audience and live verification re-read CI, Cloud Build, the recognizer wiring and the four service timeouts',async t=>{
 const {m,source,tool,image}=await r079Package(t),git=r079Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R079')).operator,email);await assert.rejects(operator('R079','https://lm.mw-credit.com/promotion/r078'),/impersonation proof/);await assert.rejects(operator('R082'),/unsupported operator release/);
 const service=(role,edit={})=>{const env=[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`}];
  if(role==='command')env.push({name:'PWA_NOTIFICATIONS',value:'enabled'},{name:'PROD_RECEIPTS',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION',value:edit.activation??'enabled'},{name:'PROD_RECEIPT_RECOGNITION_URL',value:edit.url??R075_RECOGNIZER_URL});
  if(['notify','jobs'].includes(role))env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})});
  const vpc=role==='command'?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:undefined;
  const timeout=Object.hasOwn(edit.timeouts??{},role)?edit.timeouts[role]:R077_SERVICE_TIMEOUTS[role];
  return {name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,...(timeout===undefined?{}:{timeout}),...(vpc?{vpcAccess:vpc}:{}),containers:[{image,env}]}};};
 const make=(edit={},digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),edit)});
 const live=r074Readback(m);await verifyR079LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern,digest='e'] of [[{},/build digest/,'f'],[{activation:'disabled'},/R079 live command recognizer setting drift/],[{url:'http://10.148.0.3:8790/v1/receipt-recognition'},/R079 live command recognizer setting drift/],
  [{timeouts:{command:'15s'}},/R079 live command request timeout must be 55s/],[{timeouts:{command:'60s'}},/R079 live command request timeout/],[{timeouts:{command:undefined}},/R079 live command request timeout/],
  [{timeouts:{read:'55s'}},/R079 live read request timeout must be 15s/],[{timeouts:{notify:'15s'}},/R079 live notify request timeout must be 120s/],[{timeouts:{jobs:'55s'}},/R079 live jobs request timeout must be 120s/]])
  await assert.rejects(verifyR079LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 const skipped=r074Readback(m);await assert.rejects(verifyR079LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=skipped.readGithub(args);if(args[1].endsWith('/runs/25/jobs?per_page=100'))r.jobs.find(j=>j.name==='rebuild (migrations)').conclusion='skipped';return r;},git}),/R079 database rebuild \(migrations\): missing executed job/);
});

// R080: R078's SQL kind after the separately applied V99 (PROD 98 to 99, push notification content facts). Source
// descends from the R079 release and adds exactly V99; plan, recognizer wiring and R077 timeouts as R078; the artifact
// carries the R080 release marker; the delivery commit may add this README, the backup tool and the operator note.
const r079Release='823e9e593afde879fdb0ba94e198ea0351975aea';
const r080Migration='V99__notification_content_facts.sql';
const r080Files={'V97__pwa_row_changes.sql':'-- v97','V98__pwa_row_changes_app_read.sql':'-- v98',[r080Migration]:'-- v99'};
const r080Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R080',...extra});
function r080Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration='database/migrations/'+r080Migration,releaseDatabase='',ancestors={}}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return Object.hasOwn(ancestors,args[1])?ancestors[args[1]]:args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='ls-tree')return Object.keys(r080Files).map(name=>'database/migrations/'+name).join('\n');
  if(args[0]==='show')return r080Files[path.posix.basename(args[1].split(':')[1])];
  if(args[0]==='diff'){
   if(args[2]===r079Release&&args[3]===source)return nulNames(args,migration);
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return nulNames(args,delivery);
   if(args[2]===source&&args[3]===sqlRelease)return releaseDatabase;
   if(args[3]===source)return nulNames(args,changed[args[2]]??'');
   return nulNames(args,dirty);
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function r080Package(t){
 const p=await r078Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:98,targetVersion:99,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r080Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r080.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:22,release:'R080',sourceBaseline:r079Release,
  sql:{baselineVersion:98,targetVersion:99,migrations:manifest.migrations.slice(-1),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:98,targetVersion:99,migrationsExecuted:1,startedAt:'2026-10-21T03:00:00Z',finishedAt:'2026-10-21T03:00:10Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'99',historyRows:99,allSuccessful:true,verifiedAt:'2026-10-21T03:02:00Z'}}});
 m.applied.sqlVersion=99;m.applied.appliedAt='2026-10-21T03:10:00Z';
 await setArtifact(m,'build-version.json',r080Marker(m));
 await setArtifact(m,'assets/test.js',(await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8')).replace('const release="R078";','const release="R080";'));
 return p;
}
test('R080 package validates and rejects SQL, plan, recognizer, CI, readback and artifact tampering',async t=>{
 const {m,source,tool,root}=await r080Package(t),git=r080Git({source,tool});
 const plan=await r080HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=100,/R080 exact V98 to V99/],[x=>x.sql.baselineVersion=97,/R080 exact V98 to V99/],[x=>x.sql.migrations.push({name:'V100__x.sql',sha256:'0'.repeat(64)}),/R080 exact V98 to V99/],[x=>x.sql.migrations=[],/R080 exact V98 to V99/],[x=>x.sql.migrations[0].name='V98__pwa_row_changes_app_read.sql',/R080 exact V98 to V99/],
  [x=>x.sql.migrations[0].sha256='0'.repeat(64),/R080 migration source hash/],[x=>x.sql.release.sha256='0'.repeat(64),/R080 SQL release changed/],[x=>x.sql.release.commit='7'.repeat(40),/R080 tested SQL release/],
  [x=>x.sql.applied.migrationsExecuted=2,/R080 actual SQL apply/],[x=>x.sql.applied.targetVersion=98,/R080 actual SQL apply/],[x=>x.sql.applied.baselineVersion=97,/R080 actual SQL apply/],[x=>x.sql.applied.backup.restorePassed=false,/R080 actual SQL apply/],[x=>delete x.sql.applied.backup.dumpSha256,/R080 actual SQL apply/],[x=>x.sql.applied.backup.reference='dev-v99-'+'c'.repeat(32),/R080 actual SQL apply/],[x=>x.sql.applied.database='loan_manager_dev',/R080 actual SQL apply/],[x=>x.sql.applied.finishedAt='2026-10-21T02:59:00Z',/R080 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='98',/R080 read-only V99 readback/],[x=>x.sql.verified.historyRows=98,/R080 read-only V99 readback/],[x=>x.sql.verified.allSuccessful=false,/R080 read-only V99 readback/],[x=>x.sql.verified.verifiedAt='2026-10-21T03:00:05Z',/R080 read-only V99 readback/],[x=>x.sql.verified.database='loan_manager_dev',/R080 read-only V99 readback/],[x=>delete x.sql.verified,/R080 read-only V99 readback/],
  [x=>x.applied.sqlVersion=98,/R080 applied source/],[x=>x.applied.appliedAt='2026-10-21T02:00:00Z',/R080 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R080 applied source/],[x=>x.applied.database='loan_manager_dev',/R080 applied source/],
  [x=>x.plan.actions.push('command.timeout'),/R080 reviewed four-image plan/],[x=>x.plan.actions.push('command.vpcAccess'),/R080 reviewed/],[x=>x.plan.actions.reverse(),/R080 reviewed/],[x=>x.plan.counts={add:1,change:4,destroy:0},/R080 reviewed/],[x=>x.plan.counts.change=5,/R080 reviewed/],[x=>x.plan.counts.destroy=1,/R080 reviewed/],
  [x=>x.recognition.activation='disabled',/R080 unchanged enabled receipt recognition/],[x=>x.recognition.url='http://10.148.0.3:8790/v1/receipt-recognition',/R080 unchanged enabled/],[x=>delete x.recognition,/R080 unchanged enabled/],[x=>x.recognition.extra=true,/R080 unchanged enabled/],
  [x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R080 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R080 ready service/],[x=>x.applied.services.jobs.ready=false,/R080 ready service/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R080 ci check: cited run receipt/],[x=>{delete x.applicationCi.database.jobs.guards},/R080 database CI jobs must be exactly/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R080 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],
  [x=>x.release='R079',/package kind/],[x=>x.schemaVersion=21,/package kind/],[x=>x.schemaVersion=20,/package kind/],[x=>x.scope='frontend-only',/package kind/],[x=>x.environment='dev',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r080HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r080HostingPlan(prepared,{git}),/R080 runtime apply\/readback/);assert.equal((await r080HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // R078, R079 and R080 refuse each other's packages.
 await assert.rejects(r078HostingPlan(m,{git}),/wrong R078 package kind/);await assert.rejects(r079HostingPlan(m,{git}),/wrong R079 package kind/);
 await assert.rejects(r080HostingPlan({...structuredClone(m),schemaVersion:20,release:'R078'},{git}),/wrong R080 package kind/);await assert.rejects(r080HostingPlan({...structuredClone(m),schemaVersion:21,release:'R079'},{git}),/wrong R080 package kind/);
 await assert.rejects(r080HostingPlan({...structuredClone(m),schemaVersion:22,release:'R079'},{git}),/wrong R080 package kind/);await assert.rejects(r079HostingPlan({...structuredClone(m),schemaVersion:22},{git}),/wrong R079 package kind/);
 const grouped=JSON.parse(await readFile(m.sql.release.path,'utf8'));grouped.productionTransaction.targetVersion=98;const groupedPath=path.join(root,'target-r080.json'),groupedBytes=JSON.stringify(grouped);await writeFile(groupedPath,groupedBytes);
 await assert.rejects(r080HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:groupedPath,sha256:createHash('sha256').update(groupedBytes).digest('hex'),commit:sqlRelease}}},{git}),/R080 grouped V98 to V99 transaction/);
 const partial=JSON.parse(await readFile(m.sql.release.path,'utf8'));partial.migrations.pop();const partialPath=path.join(root,'partial-r080.json'),partialBytes=JSON.stringify(partial);await writeFile(partialPath,partialBytes);
 await assert.rejects(r080HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:partialPath,sha256:createHash('sha256').update(partialBytes).digest('hex'),commit:sqlRelease}}},{git}),/R080 complete migration manifest/);
 await assert.rejects(r080HostingPlan(m,{git:r080Git({source,tool,releaseDatabase:'database/migrations/'+r080Migration})}),/R080 SQL release must be the pinned source migrations/);
 assert.equal((await validateR080Sql(m,git)),undefined);
});
test('R080 artifact must carry the R080 release in its marker and bundle',async t=>{
 const {m,source,tool}=await r080Package(t),git=r080Git({source,tool}),original=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r080Marker(m,{release:'R079'}),r080Marker(m,{release:'R078'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry}),r080Marker(m,{extra:true})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r080HostingPlan(x,{git}),/R080 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r080Marker(m));
 for(const bundle of [original.replace('"R080"','"R079"'),original.replace('"R080"','R080')]){const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle);await assert.rejects(r080HostingPlan(x,{git}),/R080 artifact release mismatch/);}
});
test('R080 source descends from R079 and adds exactly V99; the delivery commit may add this README, the backup tool and the operator note',async t=>{
 const {m,source,tool,ci}=await r080Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/database/Backup-ProductionPromotion.py\nscripts/database/R053_OPERATOR.md\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R080_PUSH_NOTIFICATION_CONTENT_2026-10-21.md';
 assert.doesNotThrow(()=>validateR080Source(m,r080Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/notifications/content.mjs','apps/pwa/pwa/sw.js','database/migrations/V100__x.sql','database/migrations/'+r080Migration,'infrastructure/production/runtime.tf','scripts/database/Test-NotifyContent.sql','scripts/database/connect_preflight.py','integration-agent/src/mw_integration_agent/receipt_image.py'])assert.throws(()=>validateR080Source(m,r080Git({source,tool,delivery:file})),/R080 unverified delivery/);
 assert.throws(()=>validateR080Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r080Git({source,tool,delivery:toolFiles})),/R080 unverified delivery/);
 assert.throws(()=>validateR080Source({...m,deliveryToolChecks:{command:'node --test tests/unit/business-hosting-delivery.test.mjs',exitCode:1}},r080Git({source,tool,delivery:toolFiles})),/R080 unverified delivery/);
 for(const migration of ['','database/migrations/V100__x.sql','database/migrations/V98__pwa_row_changes_app_read.sql','database/migrations/'+r080Migration+'\0database/migrations/V100__x.sql','database/migrations/V97__pwa_row_changes.sql\0database/migrations/'+r080Migration])assert.throws(()=>validateR080Source(m,r080Git({source,tool,migration})),/R080 carries exactly the separately applied V99/);
 assert.throws(()=>validateR080Source({...m,sourceBaseline:r078Release},r080Git({source,tool})),/R080 source\/baseline/);
 assert.throws(()=>validateR080Source({...m,artifactSourceCommit:tool==='f'.repeat(40)?'e'.repeat(40):'f'.repeat(40)},r080Git({source,tool})),/R080 source\/baseline/);
 assert.throws(()=>validateR080Source(m,r080Git({source,tool,ancestors:{[r079Release]:r078Release}})),/R080 source must descend from the R079 release/);
 assert.throws(()=>validateR080Source(m,r080Git({source,tool,dirty:'services/notifications/dispatcher.mjs'})),/R080 working input/);
 assert.throws(()=>validateR080Source(m,r080Git({source,tool,untracked:'apps/pwa/src/new.ts'})),/R080 untracked/);
 // A V99 source rule must not admit R078's V97-only shape, nor R078 R080's.
 assert.throws(()=>validateR078Source({...m,sourceBaseline:r077Release},r080Git({source,tool})),/R078 carries exactly the separately applied V97/);
 await assert.rejects(r080HostingPlan(m,{git:r080Git({source,tool,changed:{[ci]:'services/notifications/dispatcher.mjs'}})}),/R080 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r080HostingPlan(m,{git:r080Git({source,tool,delivery:toolFiles})})).site,site);
 await assert.rejects(r080HostingPlan(m,{git:r080Git({source,tool,delivery:toolFiles+'\nservices/notifications/web-push.mjs'})}),/R080 unverified delivery/);
});
test('R080 operator audience and live verification re-read CI, Cloud Build, the recognizer wiring and the four service timeouts',async t=>{
 const {m,source,tool,image}=await r080Package(t),git=r080Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R080')).operator,email);await assert.rejects(operator('R080','https://lm.mw-credit.com/promotion/r079'),/impersonation proof/);await assert.rejects(operator('R082'),/unsupported operator release/);
 const service=(role,edit={})=>{const env=[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`}];
  if(role==='command')env.push({name:'PWA_NOTIFICATIONS',value:'enabled'},{name:'PROD_RECEIPTS',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION',value:edit.activation??'enabled'},{name:'PROD_RECEIPT_RECOGNITION_URL',value:edit.url??R075_RECOGNIZER_URL});
  if(['notify','jobs'].includes(role))env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})});
  const vpc=role==='command'?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:undefined;
  const timeout=Object.hasOwn(edit.timeouts??{},role)?edit.timeouts[role]:R077_SERVICE_TIMEOUTS[role];
  return {name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,...(timeout===undefined?{}:{timeout}),...(vpc?{vpcAccess:vpc}:{}),containers:[{image,env}]}};};
 const make=(edit={},digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),edit)});
 const live=r074Readback(m);await verifyR080LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern,digest='e'] of [[{},/build digest/,'f'],[{activation:'disabled'},/R080 live command recognizer setting drift/],[{url:'http://10.148.0.3:8790/v1/receipt-recognition'},/R080 live command recognizer setting drift/],
  [{timeouts:{command:'15s'}},/R080 live command request timeout must be 55s/],[{timeouts:{command:'60s'}},/R080 live command request timeout/],[{timeouts:{command:undefined}},/R080 live command request timeout/],
  [{timeouts:{read:'55s'}},/R080 live read request timeout must be 15s/],[{timeouts:{notify:'15s'}},/R080 live notify request timeout must be 120s/],[{timeouts:{jobs:'55s'}},/R080 live jobs request timeout must be 120s/]])
  await assert.rejects(verifyR080LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 const skipped=r074Readback(m);await assert.rejects(verifyR080LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=skipped.readGithub(args);if(args[1].endsWith('/runs/25/jobs?per_page=100'))r.jobs.find(j=>j.name==='rebuild (phase8)').conclusion='skipped';return r;},git}),/R080 database rebuild \(phase8\): missing executed job/);
});

// R081: the same SQL kind after V100 (PROD 99 to 100, English-name push body). Source descends from the R080 release
// and adds exactly V100; plan, recognizer wiring and R077 timeouts as R078 and R080; the artifact carries the R081 marker.
const r080Release='4a7e199bd258f7f71fac7aad240b2beced3235fd';
const r081Migration='V100__notification_english_name.sql';
const r081Files={'V98__pwa_row_changes_app_read.sql':'-- v98','V99__notification_content_facts.sql':'-- v99',[r081Migration]:'-- v100'};
const r081Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R081',...extra});
function r081Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration='database/migrations/'+r081Migration,releaseDatabase='',ancestors={}}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return Object.hasOwn(ancestors,args[1])?ancestors[args[1]]:args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='ls-tree')return Object.keys(r081Files).map(name=>'database/migrations/'+name).join('\n');
  if(args[0]==='show')return r081Files[path.posix.basename(args[1].split(':')[1])];
  if(args[0]==='diff'){
   if(args[2]===r080Release&&args[3]===source)return nulNames(args,migration);
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return nulNames(args,delivery);
   if(args[2]===source&&args[3]===sqlRelease)return releaseDatabase;
   if(args[3]===source)return nulNames(args,changed[args[2]]??'');
   return nulNames(args,dirty);
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function r081Package(t){
 const p=await r078Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:99,targetVersion:100,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r081Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r081.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:23,release:'R081',sourceBaseline:r080Release,
  sql:{baselineVersion:99,targetVersion:100,migrations:manifest.migrations.slice(-1),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:99,targetVersion:100,migrationsExecuted:1,startedAt:'2026-10-21T03:00:00Z',finishedAt:'2026-10-21T03:00:10Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'100',historyRows:100,allSuccessful:true,verifiedAt:'2026-10-21T03:02:00Z'}}});
 m.applied.sqlVersion=100;m.applied.appliedAt='2026-10-21T03:10:00Z';
 await setArtifact(m,'build-version.json',r081Marker(m));
 await setArtifact(m,'assets/test.js',(await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8')).replace('const release="R078";','const release="R081";'));
 return p;
}
test('R081 package validates and rejects SQL, plan, recognizer, CI, readback and artifact tampering',async t=>{
 const {m,source,tool,root}=await r081Package(t),git=r081Git({source,tool});
 const plan=await r081HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=101,/R081 exact V99 to V100/],[x=>x.sql.baselineVersion=98,/R081 exact V99 to V100/],[x=>x.sql.migrations.push({name:'V101__x.sql',sha256:'0'.repeat(64)}),/R081 exact V99 to V100/],[x=>x.sql.migrations=[],/R081 exact V99 to V100/],[x=>x.sql.migrations[0].name='V99__notification_content_facts.sql',/R081 exact V99 to V100/],
  [x=>x.sql.migrations[0].sha256='0'.repeat(64),/R081 migration source hash/],[x=>x.sql.release.sha256='0'.repeat(64),/R081 SQL release changed/],[x=>x.sql.release.commit='7'.repeat(40),/R081 tested SQL release/],
  [x=>x.sql.applied.migrationsExecuted=2,/R081 actual SQL apply/],[x=>x.sql.applied.targetVersion=99,/R081 actual SQL apply/],[x=>x.sql.applied.baselineVersion=98,/R081 actual SQL apply/],[x=>x.sql.applied.backup.restorePassed=false,/R081 actual SQL apply/],[x=>delete x.sql.applied.backup.dumpSha256,/R081 actual SQL apply/],[x=>x.sql.applied.backup.reference='dev-v100-'+'c'.repeat(32),/R081 actual SQL apply/],[x=>x.sql.applied.database='loan_manager_dev',/R081 actual SQL apply/],[x=>x.sql.applied.finishedAt='2026-10-21T02:59:00Z',/R081 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='99',/R081 read-only V100 readback/],[x=>x.sql.verified.historyRows=99,/R081 read-only V100 readback/],[x=>x.sql.verified.allSuccessful=false,/R081 read-only V100 readback/],[x=>x.sql.verified.verifiedAt='2026-10-21T03:00:05Z',/R081 read-only V100 readback/],[x=>x.sql.verified.database='loan_manager_dev',/R081 read-only V100 readback/],[x=>delete x.sql.verified,/R081 read-only V100 readback/],
  [x=>x.applied.sqlVersion=99,/R081 applied source/],[x=>x.applied.appliedAt='2026-10-21T02:00:00Z',/R081 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R081 applied source/],[x=>x.applied.database='loan_manager_dev',/R081 applied source/],
  [x=>x.plan.actions.push('command.timeout'),/R081 reviewed four-image plan/],[x=>x.plan.actions.push('command.vpcAccess'),/R081 reviewed/],[x=>x.plan.actions.reverse(),/R081 reviewed/],[x=>x.plan.counts={add:1,change:4,destroy:0},/R081 reviewed/],[x=>x.plan.counts.change=5,/R081 reviewed/],[x=>x.plan.counts.destroy=1,/R081 reviewed/],
  [x=>x.recognition.activation='disabled',/R081 unchanged enabled receipt recognition/],[x=>x.recognition.url='http://10.148.0.3:8790/v1/receipt-recognition',/R081 unchanged enabled/],[x=>delete x.recognition,/R081 unchanged enabled/],[x=>x.recognition.extra=true,/R081 unchanged enabled/],
  [x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R081 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R081 ready service/],[x=>x.applied.services.jobs.ready=false,/R081 ready service/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R081 ci check: cited run receipt/],[x=>{delete x.applicationCi.database.jobs.guards},/R081 database CI jobs must be exactly/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R081 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],
  [x=>x.release='R080',/package kind/],[x=>x.schemaVersion=22,/package kind/],[x=>x.schemaVersion=21,/package kind/],[x=>x.scope='frontend-only',/package kind/],[x=>x.environment='dev',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r081HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r081HostingPlan(prepared,{git}),/R081 runtime apply\/readback/);assert.equal((await r081HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // R079, R080 and R081 refuse each other's packages.
 await assert.rejects(r079HostingPlan(m,{git}),/wrong R079 package kind/);await assert.rejects(r080HostingPlan(m,{git}),/wrong R080 package kind/);
 await assert.rejects(r081HostingPlan({...structuredClone(m),schemaVersion:22,release:'R080'},{git}),/wrong R081 package kind/);await assert.rejects(r081HostingPlan({...structuredClone(m),schemaVersion:21,release:'R079'},{git}),/wrong R081 package kind/);
 await assert.rejects(r081HostingPlan({...structuredClone(m),schemaVersion:23,release:'R080'},{git}),/wrong R081 package kind/);await assert.rejects(r080HostingPlan({...structuredClone(m),schemaVersion:23},{git}),/wrong R080 package kind/);
 const grouped=JSON.parse(await readFile(m.sql.release.path,'utf8'));grouped.productionTransaction.targetVersion=99;const groupedPath=path.join(root,'target-r081.json'),groupedBytes=JSON.stringify(grouped);await writeFile(groupedPath,groupedBytes);
 await assert.rejects(r081HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:groupedPath,sha256:createHash('sha256').update(groupedBytes).digest('hex'),commit:sqlRelease}}},{git}),/R081 grouped V99 to V100 transaction/);
 const partial=JSON.parse(await readFile(m.sql.release.path,'utf8'));partial.migrations.pop();const partialPath=path.join(root,'partial-r081.json'),partialBytes=JSON.stringify(partial);await writeFile(partialPath,partialBytes);
 await assert.rejects(r081HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:partialPath,sha256:createHash('sha256').update(partialBytes).digest('hex'),commit:sqlRelease}}},{git}),/R081 complete migration manifest/);
 await assert.rejects(r081HostingPlan(m,{git:r081Git({source,tool,releaseDatabase:'database/migrations/'+r081Migration})}),/R081 SQL release must be the pinned source migrations/);
 assert.equal((await validateR081Sql(m,git)),undefined);
});
test('R081 artifact must carry the R081 release in its marker and bundle',async t=>{
 const {m,source,tool}=await r081Package(t),git=r081Git({source,tool}),original=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r081Marker(m,{release:'R080'}),r081Marker(m,{release:'R079'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry}),r081Marker(m,{extra:true})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r081HostingPlan(x,{git}),/R081 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r081Marker(m));
 for(const bundle of [original.replace('"R081"','"R080"'),original.replace('"R081"','R081')]){const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle);await assert.rejects(r081HostingPlan(x,{git}),/R081 artifact release mismatch/);}
});
test('R081 source descends from R080 and adds exactly V100; the delivery commit may add this README, the backup tool and the operator note',async t=>{
 const {m,source,tool,ci}=await r081Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/database/Backup-ProductionPromotion.py\nscripts/database/R053_OPERATOR.md\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R081_BORROWER_ENGLISH_NAME_2026-10-21.md';
 assert.doesNotThrow(()=>validateR081Source(m,r081Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/notifications/content.mjs','apps/pwa/pwa/sw.js','database/migrations/V101__x.sql','database/migrations/'+r081Migration,'infrastructure/production/runtime.tf','scripts/database/Test-NotifyContent.sql','database/migrations/V99__notification_content_facts.sql','scripts/database/connect_preflight.py','integration-agent/src/mw_integration_agent/receipt_image.py'])assert.throws(()=>validateR081Source(m,r081Git({source,tool,delivery:file})),/R081 unverified delivery/);
 assert.throws(()=>validateR081Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r081Git({source,tool,delivery:toolFiles})),/R081 unverified delivery/);
 assert.throws(()=>validateR081Source({...m,deliveryToolChecks:{command:'node --test tests/unit/business-hosting-delivery.test.mjs',exitCode:1}},r081Git({source,tool,delivery:toolFiles})),/R081 unverified delivery/);
 for(const migration of ['','database/migrations/V100__x.sql','database/migrations/V98__pwa_row_changes_app_read.sql','database/migrations/'+r081Migration+'\0database/migrations/V100__x.sql','database/migrations/V99__notification_content_facts.sql\0database/migrations/'+r081Migration])assert.throws(()=>validateR081Source(m,r081Git({source,tool,migration})),/R081 carries exactly the separately applied V100/);
 assert.throws(()=>validateR081Source({...m,sourceBaseline:r079Release},r081Git({source,tool})),/R081 source\/baseline/);
 assert.throws(()=>validateR081Source({...m,artifactSourceCommit:tool==='f'.repeat(40)?'e'.repeat(40):'f'.repeat(40)},r081Git({source,tool})),/R081 source\/baseline/);
 assert.throws(()=>validateR081Source(m,r081Git({source,tool,ancestors:{[r080Release]:r079Release}})),/R081 source must descend from the R080 release/);
 assert.throws(()=>validateR081Source(m,r081Git({source,tool,dirty:'services/notifications/dispatcher.mjs'})),/R081 working input/);
 assert.throws(()=>validateR081Source(m,r081Git({source,tool,untracked:'apps/pwa/src/new.ts'})),/R081 untracked/);
 // R080's V99 rule does not admit the R081 source (V100 added after the R080 release).
 assert.throws(()=>validateR080Source({...m,sourceBaseline:r079Release},r081Git({source,tool})),/R080 carries exactly the separately applied V99/);
 await assert.rejects(r081HostingPlan(m,{git:r081Git({source,tool,changed:{[ci]:'services/notifications/dispatcher.mjs'}})}),/R081 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r081HostingPlan(m,{git:r081Git({source,tool,delivery:toolFiles})})).site,site);
 await assert.rejects(r081HostingPlan(m,{git:r081Git({source,tool,delivery:toolFiles+'\nservices/notifications/web-push.mjs'})}),/R081 unverified delivery/);
});
test('R081 operator audience and live verification re-read CI, Cloud Build, the recognizer wiring and the four service timeouts',async t=>{
 const {m,source,tool,image}=await r081Package(t),git=r081Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R081')).operator,email);await assert.rejects(operator('R081','https://lm.mw-credit.com/promotion/r080'),/impersonation proof/);await assert.rejects(operator('R082'),/unsupported operator release/);
 const service=(role,edit={})=>{const env=[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`}];
  if(role==='command')env.push({name:'PWA_NOTIFICATIONS',value:'enabled'},{name:'PROD_RECEIPTS',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION',value:edit.activation??'enabled'},{name:'PROD_RECEIPT_RECOGNITION_URL',value:edit.url??R075_RECOGNIZER_URL});
  if(['notify','jobs'].includes(role))env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})});
  const vpc=role==='command'?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:undefined;
  const timeout=Object.hasOwn(edit.timeouts??{},role)?edit.timeouts[role]:R077_SERVICE_TIMEOUTS[role];
  return {name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,...(timeout===undefined?{}:{timeout}),...(vpc?{vpcAccess:vpc}:{}),containers:[{image,env}]}};};
 const make=(edit={},digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),edit)});
 const live=r074Readback(m);await verifyR081LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern,digest='e'] of [[{},/build digest/,'f'],[{activation:'disabled'},/R081 live command recognizer setting drift/],[{url:'http://10.148.0.3:8790/v1/receipt-recognition'},/R081 live command recognizer setting drift/],
  [{timeouts:{command:'15s'}},/R081 live command request timeout must be 55s/],[{timeouts:{command:'60s'}},/R081 live command request timeout/],[{timeouts:{command:undefined}},/R081 live command request timeout/],
  [{timeouts:{read:'55s'}},/R081 live read request timeout must be 15s/],[{timeouts:{notify:'15s'}},/R081 live notify request timeout must be 120s/],[{timeouts:{jobs:'55s'}},/R081 live jobs request timeout must be 120s/]])
  await assert.rejects(verifyR081LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 const skipped=r074Readback(m);await assert.rejects(verifyR081LivePackage(m,{token:'t',request:make(),readGithub:args=>{const r=skipped.readGithub(args);if(args[1].endsWith('/runs/25/jobs?per_page=100'))r.jobs.find(j=>j.name==='rebuild (phase8)').conclusion='skipped';return r;},git}),/R081 database rebuild \(phase8\): missing executed job/);
});

// R083: the Hosting-only kind on the unchanged R081 runtime and V100. The source descends from the R081 release, which is
// also the runtime compared; CI is R074's per-job gate; the artifact carries the R083 marker; the R081 services are read back live.
const r081Release='b36dce97224b803a364efba90bcbce1c68caeea7';
const r083Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R083',...extra});
async function r083Package(t){
 const p=await r074Package(t),m=p.m;
 Object.assign(m,{schemaVersion:24,release:'R083',sourceBaseline:r081Release,sql:{baselineVersion:100,targetVersion:100,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'100',historyRows:100,allSuccessful:true,verifiedAt:'2026-10-20T12:00:00Z'}}});
 await setArtifact(m,'build-version.json',r083Marker(m));
 await setArtifact(m,'assets/test.js',(await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8'))+'\nconst release="R083";');
 return p;
}
test('R083 Hosting-only package descends from R081, keeps the R081 runtime and V100 and gates CI per job',async t=>{
 const {m,source,tool,ci}=await r083Package(t),git=r071Git({source,tool});
 const plan=await hostingOnlyPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [[x=>{x.sourceBaseline=r074Release},/exact R083 source\/baseline/],[x=>{x.schemaVersion=23},/wrong R083 package kind/],[x=>{x.scope='runtime-workers-frontend'},/wrong R083 package kind/],[x=>{x.sql.targetVersion=101},/R083 requires verified V100/],[x=>{x.sql.verified.latestVersion='99'},/R083 requires verified V100/],[x=>{x.sql.migrations=[{name:'V101__x.sql'}]},/R083 requires verified V100/],[x=>{x.build={id:'b'}},/R083 package must not apply/],[x=>{x.plan={}},/R083 package must not apply/],[x=>{x.applied={}},/R083 package must not apply/],[x=>{x.runtime.services.command.revision='bad'},/R083 unchanged runtime pins/],[x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R083 ci check: cited run receipt/],[x=>{x.target.database='loan_manager_dev'},/wrong production target/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(hostingOnlyPlan(candidate,{git}),pattern);}
 const detached=(root,args)=>args[0]==='merge-base'&&args[1]===r081Release?'0'.repeat(40):git(root,args);
 await assert.rejects(hostingOnlyPlan(m,{git:detached}),/R083 source must descend from the previous release/);
 for(const file of ['services/business/borrowers.mjs','database/migrations/V101__x.sql','database/runner.mjs','package-lock.json','infrastructure/production/runtime.tf','Dockerfile'])await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r081Release]:file}})}),/R083 must not change the R081 runtime, SQL or infrastructure$/);
 // The R069 comparison no longer applies: runtime changes up to R081 are allowed; database Markdown stays exempt.
 assert.equal((await hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r069Release]:'services/business/borrowers.mjs',[r081Release]:'database/README.md'}})})).site,site);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[ci]:'apps/pwa/src/live-main.tsx'}})}),/R083 ci check: run is not input-equivalent/);
});
test('R083 artifact must carry the R083 release in its marker and bundle',async t=>{
 const {m,source,tool}=await r083Package(t),git=r071Git({source,tool}),original=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r083Marker(m,{release:'R081'}),r083Marker(m,{release:'R082'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry}),r083Marker(m,{extra:true})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(hostingOnlyPlan(x,{git}),/R083 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r083Marker(m));
 for(const bundle of [original.replace('"R083"','"R081"'),original.replace('"R083"','R083')]){const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle);await assert.rejects(hostingOnlyPlan(x,{git}),/R083 artifact release mismatch/);}
});
test('R083 operator audience, delivery corrections and live R081 runtime check',async t=>{
 const {m,source,tool}=await r083Package(t),git=r071Git({source,tool});
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com',project='clever-oasis-508610-n7';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R083')).operator,email);await assert.rejects(operator('R083','https://lm.mw-credit.com/promotion/r081'),/impersonation proof/);await assert.rejects(operator('R082'),/unsupported operator release/);
 assert.doesNotThrow(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery:'scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R083_FAST_STARTUP_2026-10-20.md'})));
 for(const delivery of ['scripts/promotion/README.md\napps/pwa/src/live-main.tsx','scripts/database/Backup-ProductionPromotion.py'])assert.throws(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery})),/R083 unverified delivery/);
 const make=drift=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=m.runtime.services[role];return {ok:true,json:async()=>({latestReadyRevision:'x/'+pin.revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{containers:[{image:drift===role?pin.image.replace(/.$/,'0'):pin.image}]}})};};
 const live=r074Readback(m);await verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const role of ['read','command','notify','jobs'])await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make(role),readGithub:r074Readback(m).readGithub,git}),/R083 live runtime differs/);
});

// R089: the same SQL kind after V103 (PROD 102 to 103, notification history text). Until the separately applied V102
// (Grafana ops health) is pinned, the source descends from the R087 release and adds exactly that V102 and V103; plan,
// recognizer wiring and R077 timeouts as R081; the artifact carries the R089 marker.
const r087Release='bf11e408a9786963faa616fb839e890b016523f2';
const r089Migration='V103__notification_history_content.sql',r089Prior='database/migrations/V102__monitoring_ops_health.sql';
const r089Files={'V101__loan_close_counts_unlinked_repayments.sql':'-- v101','V102__monitoring_ops_health.sql':'-- v102',[r089Migration]:'-- v103'};
const r089Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R089',...extra});
function r089Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration=r089Prior+'\ndatabase/migrations/'+r089Migration,releaseDatabase='',ancestors={}}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return Object.hasOwn(ancestors,args[1])?ancestors[args[1]]:args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='ls-tree')return Object.keys(r089Files).map(name=>'database/migrations/'+name).join('\n');
  if(args[0]==='show')return r089Files[path.posix.basename(args[1].split(':')[1])];
  if(args[0]==='diff'){
   if(args[2]===r087Release&&args[3]===source)return nulNames(args,migration);
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return nulNames(args,delivery);
   if(args[2]===source&&args[3]===sqlRelease)return releaseDatabase;
   if(args[3]===source)return nulNames(args,changed[args[2]]??'');
   return nulNames(args,dirty);
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function r089Package(t){
 const p=await r078Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:102,targetVersion:103,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r089Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r089.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:25,release:'R089',sourceBaseline:r087Release,
  sql:{baselineVersion:102,targetVersion:103,migrations:manifest.migrations.slice(-1),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:102,targetVersion:103,migrationsExecuted:1,startedAt:'2026-10-22T03:00:00Z',finishedAt:'2026-10-22T03:00:10Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'103',historyRows:103,allSuccessful:true,verifiedAt:'2026-10-22T03:02:00Z'}}});
 m.applied.sqlVersion=103;m.applied.appliedAt='2026-10-22T03:10:00Z';
 await setArtifact(m,'build-version.json',r089Marker(m));
 await setArtifact(m,'assets/test.js',(await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8')).replace('const release="R078";','const release="R089";'));
 return p;
}
test('R089 package validates and rejects SQL, plan, recognizer, CI, readback, kind and artifact tampering',async t=>{
 const {m,source,tool,root}=await r089Package(t),git=r089Git({source,tool});
 const plan=await r089HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=104,/R089 exact V102 to V103/],[x=>x.sql.baselineVersion=101,/R089 exact V102 to V103/],[x=>x.sql.migrations.push({name:'V104__x.sql',sha256:'0'.repeat(64)}),/R089 exact V102 to V103/],[x=>x.sql.migrations=[],/R089 exact V102 to V103/],[x=>x.sql.migrations[0].name='V102__monitoring_ops_health.sql',/R089 exact V102 to V103/],
  [x=>x.sql.migrations[0].sha256='0'.repeat(64),/R089 migration source hash/],[x=>x.sql.release.sha256='0'.repeat(64),/R089 SQL release changed/],[x=>x.sql.release.commit='7'.repeat(40),/R089 tested SQL release/],
  [x=>x.sql.applied.migrationsExecuted=2,/R089 actual SQL apply/],[x=>x.sql.applied.targetVersion=102,/R089 actual SQL apply/],[x=>x.sql.applied.baselineVersion=101,/R089 actual SQL apply/],[x=>x.sql.applied.backup.restorePassed=false,/R089 actual SQL apply/],[x=>x.sql.applied.backup.reference='dev-v103-'+'c'.repeat(32),/R089 actual SQL apply/],[x=>x.sql.applied.database='loan_manager_dev',/R089 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='102',/R089 read-only V103 readback/],[x=>x.sql.verified.historyRows=102,/R089 read-only V103 readback/],[x=>x.sql.verified.allSuccessful=false,/R089 read-only V103 readback/],[x=>x.sql.verified.verifiedAt='2026-10-22T03:00:05Z',/R089 read-only V103 readback/],[x=>delete x.sql.verified,/R089 read-only V103 readback/],
  [x=>x.applied.sqlVersion=102,/R089 applied source/],[x=>x.applied.appliedAt='2026-10-22T02:00:00Z',/R089 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R089 applied source/],
  [x=>x.plan.actions.push('command.timeout'),/R089 reviewed four-image plan/],[x=>x.plan.actions.reverse(),/R089 reviewed/],[x=>x.plan.counts={add:1,change:4,destroy:0},/R089 reviewed/],[x=>x.plan.counts.destroy=1,/R089 reviewed/],
  [x=>x.recognition.activation='disabled',/R089 unchanged enabled receipt recognition/],[x=>x.recognition.url='http://10.148.0.3:8790/v1/receipt-recognition',/R089 unchanged enabled/],
  [x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R089 ready service/],[x=>x.applied.services.jobs.ready=false,/R089 ready service/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R089 ci check: cited run receipt/],[x=>{delete x.applicationCi.database.jobs.guards},/R089 database CI jobs must be exactly/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R089 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],
  [x=>x.release='R081',/package kind/],[x=>x.schemaVersion=23,/package kind/],[x=>x.schemaVersion=24,/package kind/],[x=>x.scope='frontend-only',/package kind/],[x=>x.environment='dev',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r089HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r089HostingPlan(prepared,{git}),/R089 runtime apply\/readback/);assert.equal((await r089HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // R089 refuses the other kinds' packages, and they refuse R089's.
 await assert.rejects(r081HostingPlan(m,{git}),/wrong R081 package kind/);await assert.rejects(r080HostingPlan(m,{git}),/wrong R080 package kind/);await assert.rejects(hostingOnlyPlan(m,{git}),/wrong R089 package kind/);await assert.rejects(hostingOnlyPlan(m,{git,release:'R083'}),/wrong R083 package kind/);
 await assert.rejects(r089HostingPlan({...structuredClone(m),schemaVersion:23,release:'R081'},{git}),/wrong R089 package kind/);await assert.rejects(r089HostingPlan({...structuredClone(m),schemaVersion:24,release:'R083'},{git}),/wrong R089 package kind/);
 await assert.rejects(r089HostingPlan({...structuredClone(m),schemaVersion:25,release:'R081'},{git}),/wrong R089 package kind/);await assert.rejects(r081HostingPlan({...structuredClone(m),release:'R081'},{git}),/wrong R081 package kind/);
 const grouped=JSON.parse(await readFile(m.sql.release.path,'utf8'));grouped.productionTransaction.targetVersion=102;const groupedPath=path.join(root,'target-r089.json'),groupedBytes=JSON.stringify(grouped);await writeFile(groupedPath,groupedBytes);
 await assert.rejects(r089HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:groupedPath,sha256:createHash('sha256').update(groupedBytes).digest('hex'),commit:sqlRelease}}},{git}),/R089 grouped V102 to V103 transaction/);
 const partial=JSON.parse(await readFile(m.sql.release.path,'utf8'));partial.migrations.pop();const partialPath=path.join(root,'partial-r089.json'),partialBytes=JSON.stringify(partial);await writeFile(partialPath,partialBytes);
 await assert.rejects(r089HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:partialPath,sha256:createHash('sha256').update(partialBytes).digest('hex'),commit:sqlRelease}}},{git}),/R089 complete migration manifest/);
 await assert.rejects(r089HostingPlan(m,{git:r089Git({source,tool,releaseDatabase:'database/migrations/'+r089Migration})}),/R089 SQL release must be the pinned source migrations/);
 assert.equal((await validateR089Sql(m,git)),undefined);
});
test('R089 artifact must carry the R089 release in its marker and bundle',async t=>{
 const {m,source,tool}=await r089Package(t),git=r089Git({source,tool}),original=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r089Marker(m,{release:'R081'}),r089Marker(m,{release:'R083'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry}),r089Marker(m,{extra:true})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r089HostingPlan(x,{git}),/R089 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r089Marker(m));
 for(const bundle of [original.replace('"R089"','"R081"'),original.replace('"R089"','R089')]){const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle);await assert.rejects(r089HostingPlan(x,{git}),/R089 artifact release mismatch/);}
});
test('R089 source descends from R087 and adds exactly the applied V102 and V103; the delivery commit may add this README, the backup tool and the operator note',async t=>{
 const {m,source,tool,ci}=await r089Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/database/Backup-ProductionPromotion.py\nscripts/database/R053_OPERATOR.md\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R089_NOTIFICATION_HISTORY_TEXT_2026-10-22.md';
 assert.doesNotThrow(()=>validateR089Source(m,r089Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/notifications/store.mjs','apps/pwa/src/Notifications.tsx','database/migrations/V104__x.sql','database/migrations/'+r089Migration,r089Prior,'infrastructure/production/runtime.tf','scripts/database/Test-NotifyContent.sql','scripts/database/connect_preflight.py','integration-agent/src/mw_integration_agent/receipt_image.py'])assert.throws(()=>validateR089Source(m,r089Git({source,tool,delivery:file})),/R089 unverified delivery/);
 assert.throws(()=>validateR089Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r089Git({source,tool,delivery:toolFiles})),/R089 unverified delivery/);
 for(const migration of ['','database/migrations/'+r089Migration,r089Prior,'database/migrations/V102__x.sql\ndatabase/migrations/'+r089Migration,'database/migrations/V101__loan_close_counts_unlinked_repayments.sql\n'+r089Prior+'\ndatabase/migrations/'+r089Migration,r089Prior+'\ndatabase/migrations/'+r089Migration+'\ndatabase/migrations/V104__x.sql'])assert.throws(()=>validateR089Source(m,r089Git({source,tool,migration})),/R089 carries exactly the separately applied V103/);
 assert.throws(()=>validateR089Source({...m,sourceBaseline:'b36dce97224b803a364efba90bcbce1c68caeea7'},r089Git({source,tool})),/R089 source\/baseline/);
 assert.throws(()=>validateR089Source(m,r089Git({source,tool,ancestors:{[r087Release]:'b36dce97224b803a364efba90bcbce1c68caeea7'}})),/R089 source must descend from the R087 release/);
 assert.throws(()=>validateR089Source(m,r089Git({source,tool,dirty:'services/notifications/store.mjs'})),/R089 working input/);
 assert.throws(()=>validateR089Source(m,r089Git({source,tool,untracked:'apps/pwa/src/new.ts'})),/R089 untracked/);
 // R081's V100 rule does not admit the R089 source.
 assert.throws(()=>validateR081Source({...m,sourceBaseline:r080Release},r089Git({source,tool})),/R081 carries exactly the separately applied V100/);
 await assert.rejects(r089HostingPlan(m,{git:r089Git({source,tool,changed:{[ci]:'services/notifications/store.mjs'}})}),/R089 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r089HostingPlan(m,{git:r089Git({source,tool,delivery:toolFiles})})).site,site);
});
test('R089 operator audience and live verification re-read CI, Cloud Build, the recognizer wiring and the four service timeouts',async t=>{
 const {m,source,tool,image}=await r089Package(t),git=r089Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R089')).operator,email);await assert.rejects(operator('R089','https://lm.mw-credit.com/promotion/r081'),/impersonation proof/);await assert.rejects(operator('R088'),/unsupported operator release/);
 const service=(role,edit={})=>{const env=[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`}];
  if(role==='command')env.push({name:'PWA_NOTIFICATIONS',value:'enabled'},{name:'PROD_RECEIPTS',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION',value:edit.activation??'enabled'},{name:'PROD_RECEIPT_RECOGNITION_URL',value:edit.url??R075_RECOGNIZER_URL});
  if(['notify','jobs'].includes(role))env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})});
  const vpc=role==='command'?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:undefined;
  const timeout=Object.hasOwn(edit.timeouts??{},role)?edit.timeouts[role]:R077_SERVICE_TIMEOUTS[role];
  return {name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+m.applied.services[role].revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision:m.applied.services[role].revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,...(timeout===undefined?{}:{timeout}),...(vpc?{vpcAccess:vpc}:{}),containers:[{image,env}]}};};
 const make=(edit={},digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),edit)});
 const live=r074Readback(m);await verifyR089LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern,digest='e'] of [[{},/build digest/,'f'],[{activation:'disabled'},/R089 live command recognizer setting drift/],[{url:'http://10.148.0.3:8790/v1/receipt-recognition'},/R089 live command recognizer setting drift/],
  [{timeouts:{command:'15s'}},/R089 live command request timeout must be 55s/],[{timeouts:{read:'55s'}},/R089 live read request timeout must be 15s/],[{timeouts:{notify:'15s'}},/R089 live notify request timeout must be 120s/],[{timeouts:{jobs:'55s'}},/R089 live jobs request timeout must be 120s/]])
  await assert.rejects(verifyR089LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});
