import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {hashEntries,evidenceName,variantOf,loadStages} from '../../scripts/ci/reuse-evidence.mjs';
import {migrationHead} from '../migration-head.mjs';
import {executeBusinessHosting,appOnlyHostingPlan,verifyAppOnlyOperator,validateFrontendSource,validateFrontendCi,frontendOnlyHostingPlan,verifyFrontendOnlyLivePackage,validateSettingsSource,settingsHostingPlan,verifySettingsLivePackage,runtimeHostingPlan,validateRuntimeSource,validateRuntimeCi,verifyRuntimeLivePackage,waveHostingPlan,validateWaveSource,validateWaveCi,verifyWaveLivePackage,r065HostingPlan,validateR065Source,verifyR065LivePackage,hostingOnlyPlan,validateHostingOnlySource,verifyHostingOnlyLivePackage,r068HostingPlan,validateR068Source,verifyR068LivePackage,r069HostingPlan,validateR069Source,verifyR069LivePackage,validateR074Ci,r075HostingPlan,validateR075Source,validateR075Sql,verifyR075LivePackage,R075_RECOGNIZER_URL,r076HostingPlan,validateR076Source,verifyR076LivePackage,r077HostingPlan,validateR077Source,verifyR077LivePackage,R077_SERVICE_TIMEOUTS,r078HostingPlan,validateR078Source,validateR078Sql,verifyR078LivePackage,r079HostingPlan,validateR079Source,verifyR079LivePackage,r080HostingPlan,validateR080Source,validateR080Sql,verifyR080LivePackage,r081HostingPlan,validateR081Source,validateR081Sql,verifyR081LivePackage,validateR089Source,validateR089Sql,r089HostingPlan,verifyR089LivePackage,validateR090Source,validateR090Sql,r090HostingPlan,verifyR090LivePackage,R090_CHAT_ORIGIN,R090_PLAN_ACTIONS,R090_DISPATCH,validateR091Source,validateR091Sql,r091HostingPlan,verifyR091LivePackage,R091_PLAN_ACTIONS,validateR095Source,validateR095Sql,r095HostingPlan,verifyR095LivePackage,R095_PLAN_ACTIONS,validateR096Source,validateR096Sql,r096HostingPlan,verifyR096LivePackage,R096_PLAN_ACTIONS,validateR097Source,validateR097Sql,validateR100Source,validateR100Sql,r100HostingPlan,verifyR100LivePackage,R100_PLAN_ACTIONS,validateR101Source,validateR101Sql,r101HostingPlan,verifyR101LivePackage,R101_PLAN_ACTIONS,r102HostingPlan,validateR102Source,validateR102Sql,verifyR102LivePackage,R102_PLAN_ACTIONS,R102_CHAT_RELAY_URL,R103_RUNTIME,r097HostingPlan,verifyR097LivePackage,R097_PLAN_ACTIONS,R104_PLAN_ACTIONS,validateR104Source,validateR104Sql,r104HostingPlan,verifyR104LivePackage,R106_PLAN_ACTIONS,R106_CHAT_COMMAND_URL,validateR106Source,validateR106Sql,r106HostingPlan,verifyR106LivePackage,R107_PLAN_ACTIONS,validateR107Source,validateR107Sql,r107HostingPlan,verifyR107LivePackage,R108_PLAN_ACTIONS,R108_CHAT_MODEL_IDS,validateR108Source,validateR108Sql,r108HostingPlan,verifyR108LivePackage,HOSTING_KINDS,hostingKind,GENERIC_ROLES,GENERIC_ROLE_ENTRIES,genericRoleClosures,genericChangedRoles,genericKindMatches,deriveGenericRelease,genericHostingPlan,verifyGenericLivePackage} from '../../scripts/promotion/deploy-business-hosting.mjs';
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
 let calls=0;await assert.rejects(executeBusinessHosting({...plan(),rollback:{hostingVersion:version,hostingRelease:release}},{approvalReference:'owner',request:async(_url,method)=>{calls++;assert.equal(method,'GET');return {releases:[{name:release,version:{name:version+'changed'}}]}}}),/baseline changed/);assert.equal(calls,1);
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

// R089: the same SQL kind after V103 (PROD 102 to 103, notification history text). The source descends from the PR #123
// merge that carries the separately applied V102 and adds exactly V103; plan, recognizer wiring and R077 timeouts as R081;
// the artifact carries the R089 marker.
const r089Baseline='0a93c0abc32c9ae120ce727ea39181c0ab06d649',r087Release='bf11e408a9786963faa616fb839e890b016523f2';
const r089Migration='V103__notification_history_content.sql',r089Prior='database/migrations/V102__monitoring_ops_health.sql';
const r089Files={'V101__loan_close_counts_unlinked_repayments.sql':'-- v101','V102__monitoring_ops_health.sql':'-- v102',[r089Migration]:'-- v103'};
const r089Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R089',...extra});
function r089Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration='database/migrations/'+r089Migration,releaseDatabase='',ancestors={}}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return Object.hasOwn(ancestors,args[1])?ancestors[args[1]]:args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='ls-tree')return Object.keys(r089Files).map(name=>'database/migrations/'+name).join('\n');
  if(args[0]==='show')return r089Files[path.posix.basename(args[1].split(':')[1])];
  if(args[0]==='diff'){
   if(args[2]===r089Baseline&&args[3]===source)return nulNames(args,migration);
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
 Object.assign(m,{schemaVersion:25,release:'R089',sourceBaseline:r089Baseline,
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
test('R089 source descends from the V102 merge and adds exactly V103; the delivery commit may add this README, the backup tool and the operator note',async t=>{
 const {m,source,tool,ci}=await r089Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/database/Backup-ProductionPromotion.py\nscripts/database/R053_OPERATOR.md\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R089_NOTIFICATION_HISTORY_TEXT_2026-10-22.md';
 assert.doesNotThrow(()=>validateR089Source(m,r089Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/notifications/store.mjs','apps/pwa/src/Notifications.tsx','database/migrations/V104__x.sql','database/migrations/'+r089Migration,r089Prior,'infrastructure/production/runtime.tf','scripts/database/Test-NotifyContent.sql','scripts/database/connect_preflight.py','integration-agent/src/mw_integration_agent/receipt_image.py'])assert.throws(()=>validateR089Source(m,r089Git({source,tool,delivery:file})),/R089 unverified delivery/);
 assert.throws(()=>validateR089Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r089Git({source,tool,delivery:toolFiles})),/R089 unverified delivery/);
 for(const migration of ['',r089Prior,r089Prior+'\ndatabase/migrations/'+r089Migration,'database/migrations/V103__x.sql','database/migrations/'+r089Migration+'\ndatabase/migrations/V104__x.sql'])assert.throws(()=>validateR089Source(m,r089Git({source,tool,migration})),/R089 carries exactly the separately applied V103/);
 for(const sourceBaseline of ['b36dce97224b803a364efba90bcbce1c68caeea7',r087Release])assert.throws(()=>validateR089Source({...m,sourceBaseline},r089Git({source,tool})),/R089 source\/baseline/);
 assert.throws(()=>validateR089Source(m,r089Git({source,tool,ancestors:{[r089Baseline]:r087Release}})),/R089 source must descend from the V102 \(PR #123\) release/);
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

// R090 (in-app chat): the SQL kind after V104 to V106 (PROD 103 to 106) with the new chat service. The source descends
// from the R089 release and adds exactly V104, V105 and V106 at their reviewed bytes (the real repository files); the
// plan adds the chat identity, service and notify invokers (10) and changes the four services (4); the artifact carries
// the R090 marker and the chat origin; the live readback covers five services.
const r089Release='99758c71b62d904018900438d4082b1a923e53fa';
const r090Migrations=['V104__pwa_chat.sql','V105__chat_reply_notification_and_job_status.sql','V106__chat_turn_presence.sql'];
const r090Files={'V102__monitoring_ops_health.sql':'-- v102','V103__notification_history_content.sql':'-- v103',
 ...Object.fromEntries(await Promise.all(r090Migrations.map(async name=>[name,await readFile(new URL('../../database/migrations/'+name,import.meta.url),'utf8')])))};
const r090Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R090',...extra});
const r090Added=r090Migrations.map(name=>'database/migrations/'+name).join('\n');
function r090Git({source,tool=source,changed={},delivery='',dirty='',untracked='',migration=r090Added,releaseDatabase='',ancestors={},files=r090Files,baseline=r089Release}={}){
 return (_root,args)=>{
  if(args[0]==='rev-parse')return args[1]==='HEAD'?tool:args[1];
  if(args[0]==='merge-base')return Object.hasOwn(ancestors,args[1])?ancestors[args[1]]:args[1];
  if(args[0]==='ls-files')return untracked;
  if(args[0]==='ls-tree')return Object.keys(files).map(name=>'database/migrations/'+name).join('\n');
  if(args[0]==='show')return files[path.posix.basename(args[1].split(':')[1])];
  if(args[0]==='diff'){
   if(args[2]===baseline&&args[3]===source)return nulNames(args,migration);
   if(args[2]===source&&args[3]===tool&&!args.includes('--'))return nulNames(args,delivery);
   if(args[2]===source&&args[3]===sqlRelease)return releaseDatabase;
   if(args[3]===source)return nulNames(args,changed[args[2]]??'');
   return nulNames(args,dirty);
  }
  throw Error('Unexpected synthetic Git command '+args);
 };
}
async function r090Package(t){
 const p=await r078Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:103,targetVersion:106,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r090Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r090.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:26,release:'R090',sourceBaseline:r089Release,
  sql:{baselineVersion:103,targetVersion:106,migrations:manifest.migrations.slice(-3),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:103,targetVersion:106,migrationsExecuted:3,startedAt:'2026-10-23T12:00:00Z',finishedAt:'2026-10-23T12:00:20Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'106',historyRows:106,allSuccessful:true,verifiedAt:'2026-10-23T12:02:00Z'}}});
 m.plan.counts={add:10,change:4,destroy:0};m.plan.actions=[...R090_PLAN_ACTIONS];
 m.applied.sqlVersion=106;m.applied.appliedAt='2026-10-23T12:10:00Z';m.applied.services.chat={revision:'mw-credit-app-chat-prod-00001-abc',image:m.build.image,ready:true,trafficPercent:100};
 const config={...JSON.parse(await readFile(path.join(m.artifactRoot,'production-public-config.json'),'utf8')),chatOrigin:R090_CHAT_ORIGIN};
 await setArtifact(m,'production-public-config.json',JSON.stringify(config));
 await setArtifact(m,'build-version.json',r090Marker(m));
 await setArtifact(m,'assets/test.js',JSON.stringify(config)+'\nconst release="R090";');
 return p;
}
test('R090 package validates and rejects SQL, pinned bytes, plan, five-service readback, kind and artifact tampering',async t=>{
 const {m,source,tool,root}=await r090Package(t),git=r090Git({source,tool});
 const plan=await r090HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.hostingVersion,m.rollback.hostingVersion);
 assert.equal(R090_PLAN_ACTIONS.length,17);assert.equal(R090_PLAN_ACTIONS.filter(x=>!/\.(image|cpuIdle|callerSubjects|dispatchWake)$/.test(x)).length,10);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=105,/R090 exact V103 to V106/],[x=>x.sql.baselineVersion=104,/R090 exact V103 to V106/],[x=>x.sql.migrations.pop(),/R090 exact V103 to V106/],[x=>x.sql.migrations.reverse(),/R090 exact V103 to V106/],[x=>x.sql.migrations.push({name:'V107__x.sql',sha256:'0'.repeat(64)}),/R090 exact V103 to V106/],
  [x=>x.sql.migrations[2].sha256='0'.repeat(64),/R090 migration source hash/],[x=>x.sql.release.sha256='0'.repeat(64),/R090 SQL release changed/],[x=>x.sql.release.commit='7'.repeat(40),/R090 tested SQL release/],
  [x=>x.sql.applied.migrationsExecuted=1,/R090 actual SQL apply/],[x=>x.sql.applied.targetVersion=105,/R090 actual SQL apply/],[x=>x.sql.applied.baselineVersion=102,/R090 actual SQL apply/],[x=>x.sql.applied.backup.restorePassed=false,/R090 actual SQL apply/],[x=>x.sql.applied.database='loan_manager_dev',/R090 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='105',/R090 read-only V106 readback/],[x=>x.sql.verified.historyRows=105,/R090 read-only V106 readback/],[x=>delete x.sql.verified,/R090 read-only V106 readback/],
  [x=>x.applied.sqlVersion=105,/R090 applied source/],[x=>x.applied.appliedAt='2026-10-23T11:00:00Z',/R090 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R090 applied source/],
  [x=>x.plan.counts={add:0,change:4,destroy:0},/R090 reviewed chat and four-service plan/],[x=>x.plan.counts.add=11,/R090 reviewed/],[x=>x.plan.counts.destroy=1,/R090 reviewed/],[x=>x.plan.actions=['read.image','command.image','notify.image','jobs.image'],/R090 reviewed/],
  [x=>x.plan.actions.pop(),/R090 reviewed/],[x=>x.plan.actions.push('command.timeout'),/R090 reviewed/],[x=>x.plan.actions.reverse(),/R090 reviewed/],
  [x=>x.recognition.activation='disabled',/R090 unchanged enabled receipt recognition/],
  [x=>x.rollback.services.read.image=x.build.image,/recovery pin/],[x=>x.rollback.services.chat={revision:'mw-credit-app-chat-prod-00001-abc',image:x.rollback.services.read.image},/R090 recovery pins exactly the four/],
  [x=>delete x.applied.services.chat,/R090 applied readback must name the five services/],[x=>x.applied.services.chat.ready=false,/R090 ready service/],[x=>x.applied.services.chat.image=x.rollback.services.read.image,/R090 ready service/],[x=>x.applied.services.chat.revision='mw-credit-app-read-prod-00001-abc',/R090 ready service/],[x=>x.applied.services.chat.trafficPercent=50,/R090 ready service/],
  [x=>x.applied.services.notify.revision=x.rollback.services.notify.revision,/R090 ready service/],[x=>x.applied.services.jobs.ready=false,/R090 ready service/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R090 ci check: cited run receipt/],[x=>{delete x.applicationCi.database.jobs.guards},/R090 database CI jobs must be exactly/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R090 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],[x=>x.frontend.files[0].sha256='d'.repeat(64),/artifact/],
  [x=>x.release='R089',/package kind/],[x=>x.schemaVersion=25,/package kind/],[x=>x.scope='frontend-only',/package kind/],[x=>x.environment='dev',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r090HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r090HostingPlan(prepared,{git}),/R090 runtime apply\/readback/);assert.equal((await r090HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // R090 refuses the other kinds' packages, and they refuse R090's.
 await assert.rejects(r089HostingPlan(m,{git}),/wrong R089 package kind/);await assert.rejects(r081HostingPlan(m,{git}),/wrong R081 package kind/);await assert.rejects(hostingOnlyPlan(m,{git}),/wrong R090 package kind/);
 await assert.rejects(r090HostingPlan({...structuredClone(m),schemaVersion:25,release:'R089'},{git}),/wrong R090 package kind/);await assert.rejects(r090HostingPlan({...structuredClone(m),schemaVersion:26,release:'R089'},{git}),/wrong R090 package kind/);await assert.rejects(r089HostingPlan({...structuredClone(m),release:'R089'},{git}),/wrong R089 package kind/);
 // Bytes that differ from the reviewed V106 are refused even when the package hashes them consistently.
 const altered={...r090Files,'V106__chat_turn_presence.sql':r090Files['V106__chat_turn_presence.sql']+'\n-- edited'},hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest=JSON.parse(await readFile(m.sql.release.path,'utf8'));manifest.migrations=Object.entries(altered).map(([name,value])=>({name,sha256:hash(value)}));const alteredPath=path.join(root,'altered-r090.json'),alteredBytes=JSON.stringify(manifest);await writeFile(alteredPath,alteredBytes);
 await assert.rejects(r090HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),migrations:manifest.migrations.slice(-3),release:{path:alteredPath,sha256:hash(alteredBytes),commit:sqlRelease}}},{git:r090Git({source,tool,files:altered})}),/R090 migration is not the reviewed V106__chat_turn_presence.sql/);
 const grouped=JSON.parse(await readFile(m.sql.release.path,'utf8'));grouped.productionTransaction.baselineVersion=104;const groupedPath=path.join(root,'target-r090.json'),groupedBytes=JSON.stringify(grouped);await writeFile(groupedPath,groupedBytes);
 await assert.rejects(r090HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:groupedPath,sha256:hash(groupedBytes),commit:sqlRelease}}},{git}),/R090 grouped V103 to V106 transaction/);
 await assert.rejects(r090HostingPlan(m,{git:r090Git({source,tool,releaseDatabase:'database/migrations/V106__chat_turn_presence.sql'})}),/R090 SQL release must be the pinned source migrations/);
 assert.equal((await validateR090Sql(m,git)),undefined);
});
test('R090 artifact must carry the R090 release and the PROD chat origin in its config, bundle and CSP',async t=>{
 const {m,source,tool}=await r090Package(t),git=r090Git({source,tool});
 const config=JSON.parse(await readFile(path.join(m.artifactRoot,'production-public-config.json'),'utf8')),bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r090Marker(m,{release:'R089'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r090HostingPlan(x,{git}),/R090 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r090Marker(m));
 {const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle.replace('"R090"','"R089"'));await assert.rejects(r090HostingPlan(x,{git}),/R090 artifact release mismatch/);}
 await setArtifact(m,'assets/test.js',bundle);
 const other='https://mw-credit-app-chat-dev-pvrgvyg3oq-as.a.run.app';
 for(const edit of [c=>{delete c.chatOrigin},c=>{c.chatOrigin=other}]){const x=structuredClone(m),c=structuredClone(config);edit(c);await setArtifact(x,'production-public-config.json',JSON.stringify(c));await assert.rejects(r090HostingPlan(x,{git}),/R090 chat origin missing from the public config or the compiled bundle/);}
 await setArtifact(m,'production-public-config.json',JSON.stringify(config));
 {const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle.replaceAll(R090_CHAT_ORIGIN,other));await assert.rejects(r090HostingPlan(x,{git}),/R090 chat origin missing from the public config or the compiled bundle/);}
 await setArtifact(m,'assets/test.js',bundle);
 assert.equal((await r090HostingPlan(m,{git})).headers[0].headers['Content-Security-Policy'].includes(R090_CHAT_ORIGIN),true);
});
test('R090 source descends from the R089 release and adds exactly V104 to V106; the delivery commit may add the README, SQL tooling and connect preflight',async t=>{
 const {m,source,tool,ci}=await r090Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/database/Backup-ProductionPromotion.py\nscripts/database/R053_OPERATOR.md\nscripts/database/connect_preflight.py\nscripts/database/test_connect_preflight.py\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R090_PWA_CHATBOT_2026-10-23.md';
 assert.doesNotThrow(()=>validateR090Source(m,r090Git({source,tool,delivery:toolFiles})));
 for(const file of ['services/chat/handler.mjs','apps/pwa/src/chat/ChatWorkspace.tsx','database/migrations/V107__x.sql','database/migrations/V106__chat_turn_presence.sql','infrastructure/production/chat-service.tf','scripts/hosting-headers.mjs','scripts/database/Test-Chat.sql'])assert.throws(()=>validateR090Source(m,r090Git({source,tool,delivery:file})),/R090 unverified delivery/);
 assert.throws(()=>validateR090Source({...m,deliveryToolChecks:{command:'npm test',exitCode:0}},r090Git({source,tool,delivery:toolFiles})),/R090 unverified delivery/);
 const [v104,v105,v106]=r090Migrations.map(name=>'database/migrations/'+name);
 for(const migration of ['',v104+'\n'+v105,v105+'\n'+v106,'database/migrations/V103__notification_history_content.sql\n'+r090Added,r090Added+'\ndatabase/migrations/V107__x.sql'])assert.throws(()=>validateR090Source(m,r090Git({source,tool,migration})),/R090 carries exactly the separately applied V106/);
 for(const sourceBaseline of ['0a93c0abc32c9ae120ce727ea39181c0ab06d649','b36dce97224b803a364efba90bcbce1c68caeea7'])assert.throws(()=>validateR090Source({...m,sourceBaseline},r090Git({source,tool})),/R090 source\/baseline/);
 assert.throws(()=>validateR090Source(m,r090Git({source,tool,ancestors:{[r089Release]:'0a93c0abc32c9ae120ce727ea39181c0ab06d649'}})),/R090 source must descend from the R089 release/);
 assert.throws(()=>validateR090Source(m,r090Git({source,tool,dirty:'services/chat/store.mjs'})),/R090 working input/);
 assert.throws(()=>validateR090Source(m,r090Git({source,tool,untracked:'services/chat/new.mjs'})),/R090 untracked/);
 assert.throws(()=>validateR089Source({...m,sourceBaseline:'0a93c0abc32c9ae120ce727ea39181c0ab06d649'},r090Git({source,tool})),/R089/);
 await assert.rejects(r090HostingPlan(m,{git:r090Git({source,tool,changed:{[ci]:'services/chat/handler.mjs'}})}),/R090 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r090HostingPlan(m,{git:r090Git({source,tool,delivery:toolFiles})})).site,site);
});
// The live Cloud Run and Cloud Build readback for the chat-era kinds (R090 onwards): five services; `edit.env[role]`
// appends env entries to one service.
function chatLive(m,image){
 const project='clever-oasis-508610-n7';
 const models={version:1,location:'global',default:'gemini-4-argon',thinkingLevel:'MEDIUM',maxRounds:16,models:[{id:'gemini-4-argon',label:'A',available:true},{id:'gemini-3.8-flash',label:'B',available:true},{id:'gemini-3.5-flash',label:'C',available:true}]};
 const dispatch=Object.entries(R090_DISPATCH).map(([name,value])=>({name,value}));
 const service=(role,edit={})=>{const env=[{name:'DB_NAME',value:'loan_manager_prod'},{name:'INSTANCE_CONNECTION_NAME',value:m.target.connectionName},{name:'DB_USER',value:`mw-credit-app-${role}-prod@${project}.iam`}];
  if(role==='command')env.push({name:'PWA_NOTIFICATIONS',value:'enabled'},{name:'PROD_RECEIPTS',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION',value:'enabled'},{name:'PROD_RECEIPT_RECOGNITION_URL',value:R075_RECOGNIZER_URL});
  if(role==='notify')env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify(edit.subjects??{[`mw-credit-app-chat-prod@${project}.iam.gserviceaccount.com`]:'114454898477847610024',[`mw-credit-app-jobs-prod@${project}.iam.gserviceaccount.com`]:'114454898477847610025','mw-credit-app-command-prod@x':'114454898477847610026'})});
  if(role==='jobs')env.push({name:'WORKER_CALLER_SUBJECTS_JSON',value:JSON.stringify({'a@b':'114454898477847610024'})},...(edit.jobsDispatch??dispatch));
  if(role==='chat')env.push(...(edit.chatDispatch??dispatch),{name:'CHAT_MODELS_JSON',value:JSON.stringify(edit.models??models)});
  // R102: edit.vpc overrides a role's vpcAccess (undefined removes it); otherwise only command carries private-range egress.
  const vpc=edit.vpc&&Object.hasOwn(edit.vpc,role)?edit.vpc[role]:role==='command'?{egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]}:undefined;
  const timeout=role==='chat'?edit.chatTimeout??'300s':R077_SERVICE_TIMEOUTS[role];
  // The live v2 API omits false booleans: command and chat carry no cpuIdle key unless an edit sets one ('absent' by default).
  const cpuIdle=role==='command'?edit.commandCpuIdle??'absent':role==='chat'?edit.chatCpuIdle??'absent':true;
  env.push(...(edit.env?.[role]??[]));
  const revision=edit.revision?.[role]??m.applied.services[role].revision;
  return {name:`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,latestReadyRevision:'x/'+revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision}],template:{serviceAccount:edit.account?.[role]??`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,timeout,...(vpc?{vpcAccess:vpc}:{}),containers:[{image:edit.image?.[role]??image,env,resources:{limits:{cpu:'1'},...(cpuIdle==='absent'?{}:{cpuIdle}),startupCpuBoost:true}}]}};};
 const make=(edit={},digest='e')=>async url=>({ok:true,json:async()=>url.includes('cloudbuild')?{status:'SUCCESS',results:{images:[{name:`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:build-1`,digest:'sha256:'+digest.repeat(64)}]},source:{storageSource:m.build.storageSource}}:service(url.split('/services/mw-credit-app-')[1].replace('-prod',''),edit)});
 return {models,dispatch,make};
}
test('R090 operator audience and live verification re-read CI, Cloud Build, the four services and the chat service',async t=>{
 const {m,source,tool,image}=await r090Package(t),git=r090Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R090')).operator,email);await assert.rejects(operator('R090','https://lm.mw-credit.com/promotion/r089'),/impersonation proof/);await assert.rejects(operator('R092'),/unsupported operator release/);
 const {models,dispatch,make}=chatLive(m,image);
 const live=r074Readback(m);await verifyR090LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 // cpuIdle absent (as the live API returns it) and an explicit false both pass; an explicit true is refused below.
 await verifyR090LivePackage(m,{token:'t',request:make({commandCpuIdle:false,chatCpuIdle:false}),readGithub:r074Readback(m).readGithub,git});
 const strip=name=>dispatch.filter(x=>x.name!==name);
 for(const [edit,pattern,digest='e'] of [[{},/build digest/,'f'],[{commandCpuIdle:true},/R090 live command cpu_idle must be false/],[{jobsDispatch:strip('NOTIFICATION_DISPATCH_URL')},/R090 live jobs dispatch wake drift/],
  [{subjects:{'mw-credit-app-jobs-prod@clever-oasis-508610-n7.iam.gserviceaccount.com':'114454898477847610025'}},/R090 live notify callers must include chat and jobs/],
  [{account:{chat:'mw-credit-app-read-prod@clever-oasis-508610-n7.iam.gserviceaccount.com'}},/R090 live chat revision\/identity drift/],[{image:{chat:'other'}},/R090 live chat revision\/identity drift/],[{revision:{chat:'mw-credit-app-chat-prod-00002-def'}},/R090 live chat revision\/identity drift/],
  [{chatTimeout:'120s'},/R090 live chat timeout 300s and cpu_idle false/],[{chatCpuIdle:true},/R090 live chat timeout 300s and cpu_idle false/],[{chatDispatch:strip('NOTIFICATION_DISPATCH_ENABLED')},/R090 live chat dispatch wake drift/],
  [{models:{...models,maxRounds:12}},/R090 live chat models must be three Gemini models with maxRounds 16/],[{models:{...models,models:models.models.slice(0,2)}},/R090 live chat models/],[{models:{...models,models:[...models.models.slice(0,2),{id:'claude-x',label:'X',available:true}]}},/R090 live chat models/],
  [{chatTimeout:undefined,image:{read:'other'}},/live service revision\/identity drift/]])
  await assert.rejects(verifyR090LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});

// R091 (Instagram conversation decommission): the SQL kind with V107 (PROD 106 to 107) and one new image on the five
// services. The source descends from the R090 package and adds exactly V107 at its reviewed bytes (the real repository
// file); the plan changes five services (command also loses its AGENT_CONVERSATION_* env); recovery pins all five
// services; the images roll out on 106 before V107; the artifact carries the R091 marker and the R090 chat origin.
const r090Release='297b76494f344e54dfb708becf5ea2fd63ca684e',r091Migration='V107__drop_agent_native_operation.sql';
const r091Files={...r090Files,[r091Migration]:await readFile(new URL('../../database/migrations/'+r091Migration,import.meta.url),'utf8')};
const r091Added='database/migrations/'+r091Migration;
const r091Git=(options={})=>r090Git({migration:r091Added,files:r091Files,baseline:r090Release,...options});
const r091Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R091',...extra});
async function r091Package(t){
 const p=await r090Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:106,targetVersion:107,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r091Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r091.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:27,release:'R091',sourceBaseline:r090Release,
  sql:{baselineVersion:106,targetVersion:107,migrations:manifest.migrations.slice(-1),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:106,targetVersion:107,migrationsExecuted:1,startedAt:'2026-10-24T05:10:00Z',finishedAt:'2026-10-24T05:10:05Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'107',historyRows:107,allSuccessful:true,verifiedAt:'2026-10-24T05:11:00Z'}}});
 m.plan.counts={add:0,change:5,destroy:0};m.plan.actions=[...R091_PLAN_ACTIONS];
 m.rollback.services.chat={revision:'mw-credit-app-chat-prod-00001-abc',image:m.rollback.services.read.image};
 m.applied.sqlVersion=106;m.applied.appliedAt='2026-10-24T05:00:00Z';m.applied.services.chat={revision:'mw-credit-app-chat-prod-00002-def',image:m.build.image,ready:true,trafficPercent:100};
 await setArtifact(m,'build-version.json',r091Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R090"','"R091"'));
 return p;
}
test('R091 package validates and rejects SQL, pinned V107 bytes, plan shape, five-service recovery and readback, ordering and kind',async t=>{
 const {m,source,tool,root}=await r091Package(t),git=r091Git({source,tool});
 const plan=await r091HostingPlan(m,{git});assert.equal(plan.site,site);assert.equal(plan.rollback.services.chat.revision,'mw-credit-app-chat-prod-00001-abc');
 assert.deepEqual([...R091_PLAN_ACTIONS],['read.image','command.image','command.conversationEnvRemoved','notify.image','jobs.image','chat.image']);
 for(const [mutate,pattern] of [
  [x=>x.sql.targetVersion=106,/R091 exact V106 to V107/],[x=>x.sql.baselineVersion=105,/R091 exact V106 to V107/],[x=>x.sql.migrations.pop(),/R091 exact V106 to V107/],[x=>x.sql.migrations.push({name:'V108__x.sql',sha256:'0'.repeat(64)}),/R091 exact V106 to V107/],[x=>x.sql.migrations.unshift({name:'V106__chat_turn_presence.sql',sha256:'92fd4c5dd228852588da1ba861793753ef4090bb2f968517bfdd25ceded62a6d'}),/R091 exact V106 to V107/],
  [x=>x.sql.migrations[0].sha256='0'.repeat(64),/R091 migration source hash/],[x=>x.sql.release.sha256='0'.repeat(64),/R091 SQL release changed/],[x=>x.sql.release.commit='7'.repeat(40),/R091 tested SQL release/],
  [x=>x.sql.applied.migrationsExecuted=2,/R091 actual SQL apply/],[x=>x.sql.applied.baselineVersion=103,/R091 actual SQL apply/],[x=>x.sql.applied.targetVersion=106,/R091 actual SQL apply/],[x=>x.sql.applied.backup.reference='dev-v107-'+'c'.repeat(32),/R091 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='106',/R091 read-only V107 readback/],[x=>x.sql.verified.historyRows=106,/R091 read-only V107 readback/],
  // The images roll out on 106 before V107 (V107 drops the function the R090 command image calls).
  [x=>x.applied.sqlVersion=107,/R091 applied source/],[x=>x.applied.appliedAt='2026-10-24T05:10:01Z',/R091 applied source/],[x=>x.applied.planSha256='0'.repeat(64),/R091 applied source/],
  [x=>x.plan.counts={add:10,change:4,destroy:0},/R091 reviewed five-service plan/],[x=>x.plan.counts={add:0,change:4,destroy:0},/R091 reviewed five-service plan/],[x=>x.plan.counts.destroy=1,/R091 reviewed/],
  [x=>x.plan.actions=[...R090_PLAN_ACTIONS],/R091 reviewed/],[x=>x.plan.actions=['read.image','command.image','notify.image','jobs.image','chat.image'],/R091 reviewed/],[x=>x.plan.actions.reverse(),/R091 reviewed/],[x=>x.plan.actions.push('chat.env'),/R091 reviewed/],
  [x=>x.recognition.activation='disabled',/R091 unchanged enabled receipt recognition/],
  [x=>delete x.rollback.services.chat,/R091 recovery pins exactly the five services/],[x=>x.rollback.services.chat.image=x.build.image,/recovery pin/],[x=>x.rollback.services.chat.revision='mw-credit-app-read-prod-00001-abc',/recovery pin/],
  [x=>delete x.applied.services.chat,/R091 applied readback must name the five services/],[x=>x.applied.services.chat.revision=x.rollback.services.chat.revision,/R091 ready service/],[x=>x.applied.services.chat.image=x.rollback.services.chat.image,/R091 ready service/],[x=>x.applied.services.command.trafficPercent=50,/R091 ready service/],
  [x=>x.build.sourceCommit='4'.repeat(40),/R091 PROD image provenance/],[x=>x.target.database='loan_manager_dev',/target/],
  [x=>x.release='R090',/package kind/],[x=>x.schemaVersion=26,/package kind/],[x=>x.scope='frontend-only',/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r091HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r091HostingPlan(prepared,{git}),/R091 runtime apply\/readback/);assert.equal((await r091HostingPlan(prepared,{git,requireApplied:false})).site,site);
 // R091 refuses the other kinds' packages, and they refuse R091's.
 await assert.rejects(r090HostingPlan(m,{git}),/wrong R090 package kind/);await assert.rejects(r089HostingPlan(m,{git}),/wrong R089 package kind/);await assert.rejects(r091HostingPlan({...structuredClone(m),schemaVersion:26,release:'R090'},{git}),/wrong R091 package kind/);
 {const r090=await r090Package(t);await assert.rejects(r091HostingPlan(r090.m,{git:r090Git({source:r090.source,tool:r090.tool})}),/wrong R091 package kind/);}
 // V107 bytes that differ from the reviewed file are refused even when the package hashes them consistently.
 const altered={...r091Files,[r091Migration]:r091Files[r091Migration]+'\n-- edited'},hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest=JSON.parse(await readFile(m.sql.release.path,'utf8'));manifest.migrations=Object.entries(altered).map(([name,value])=>({name,sha256:hash(value)}));const alteredPath=path.join(root,'altered-r091.json'),alteredBytes=JSON.stringify(manifest);await writeFile(alteredPath,alteredBytes);
 await assert.rejects(r091HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),migrations:manifest.migrations.slice(-1),release:{path:alteredPath,sha256:hash(alteredBytes),commit:sqlRelease}}},{git:r091Git({source,tool,files:altered})}),/R091 migration is not the reviewed V107__drop_agent_native_operation.sql/);
 const grouped=JSON.parse(await readFile(m.sql.release.path,'utf8'));grouped.productionTransaction.group=false;const groupedPath=path.join(root,'ungrouped-r091.json'),groupedBytes=JSON.stringify(grouped);await writeFile(groupedPath,groupedBytes);
 await assert.rejects(r091HostingPlan({...structuredClone(m),sql:{...structuredClone(m.sql),release:{path:groupedPath,sha256:hash(groupedBytes),commit:sqlRelease}}},{git}),/R091 grouped V106 to V107 transaction/);
 assert.equal((await validateR091Sql(m,git)),undefined);
});
test('R091 artifact must carry the R091 release (not R090) and the R090 PROD chat origin',async t=>{
 const {m,source,tool}=await r091Package(t),git=r091Git({source,tool});
 const config=JSON.parse(await readFile(path.join(m.artifactRoot,'production-public-config.json'),'utf8')),bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');
 for(const marker of [r091Marker(m,{release:'R090'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(r091HostingPlan(x,{git}),/R091 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r091Marker(m));
 {const x=structuredClone(m);await setArtifact(x,'assets/test.js',bundle.replace('"R091"','"R090"'));await assert.rejects(r091HostingPlan(x,{git}),/R091 artifact release mismatch/);}
 await setArtifact(m,'assets/test.js',bundle);
 {const x=structuredClone(m),c=structuredClone(config);delete c.chatOrigin;await setArtifact(x,'production-public-config.json',JSON.stringify(c));await assert.rejects(r091HostingPlan(x,{git}),/R091 chat origin missing from the public config or the compiled bundle/);}
 await setArtifact(m,'production-public-config.json',JSON.stringify(config));
 assert.equal((await r091HostingPlan(m,{git})).headers[0].headers['Content-Security-Policy'].includes(R090_CHAT_ORIGIN),true);
});
test('R091 source descends from the R090 package and adds exactly V107; the delivery commit may add the README, SQL tooling and connect preflight',async t=>{
 const {m,source,tool,ci}=await r091Package(t);
 const toolFiles='scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nscripts/database/Backup-ProductionPromotion.py\nscripts/database/R053_OPERATOR.md\nscripts/database/connect_preflight.py\nscripts/database/test_connect_preflight.py\nproject/Documents/Release_Tracker.md\nChange Logs/CHANGE_NOTES_R091_IG_CONVERSATION_DECOMMISSION_2026-10-23.md';
 assert.doesNotThrow(()=>validateR091Source(m,r091Git({source,tool,delivery:toolFiles})));
 // The R091 step-1 correction: the connect preflight and its test alone are an accepted delivery commit.
 for(const file of ['scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py','scripts/database/connect_preflight.py\nscripts/database/test_connect_preflight.py'])assert.doesNotThrow(()=>validateR091Source(m,r091Git({source,tool,delivery:file})),file);
 for(const file of ['services/payment-command/store.mjs','database/migrations/V108__x.sql','database/migrations/V107__drop_agent_native_operation.sql','database/README.md','infrastructure/production/main.tf','infrastructure/grafana/owned-services.tf.json','scripts/database/Test-ConnectContainment.sql',
  // Only the agent's Markdown documents are accepted: its code, configuration, SQL and any other path stay refused.
  'integration-agent/docs/operations.py','integration-agent/docs/settings.json','integration-agent/Change Logs/V12.sql','integration-agent/Change Logs/notes.md.txt','integration-agent/README.md','integration-agent/AGENTS.md',
  'integration-agent/service-catalogue.json','integration-agent/src/mw_integration_agent/docs/notes.md','integration-agent/migrations/V12__x.sql','integration-agent/docs.md','other/integration-agent/docs/x.md'])assert.throws(()=>validateR091Source(m,r091Git({source,tool,delivery:file})),/R091 unverified delivery/,file);
 // An unrelated main commit between source and tool that edits only agent Markdown documents (ALL-ARCH-03, 2026-10-24).
 for(const file of ['integration-agent/Change Logs/CHANGE_NOTES_W3_AGENT_2026-10-16.md','integration-agent/docs/POSTGRESQL_OPERATIONS.md','integration-agent/docs/runbooks/restore.md','integration-agent/Change Logs/CHANGE_NOTES_R091_IG_CONVERSATION_DECOMMISSION_2026-10-23.md'])assert.doesNotThrow(()=>validateR091Source(m,r091Git({source,tool,delivery:toolFiles+'\n'+file})),file);
 for(const migration of ['','database/migrations/V106__chat_turn_presence.sql',r090Added+'\n'+r091Added,'database/migrations/V106__chat_turn_presence.sql\n'+r091Added,r091Added+'\ndatabase/migrations/V108__x.sql'])assert.throws(()=>validateR091Source(m,r091Git({source,tool,migration})),/R091 carries exactly the separately applied V107/);
 for(const sourceBaseline of [r089Release,'1d673a90'+'0'.repeat(32)])assert.throws(()=>validateR091Source({...m,sourceBaseline},r091Git({source,tool})),/R091 source\/baseline/);
 assert.throws(()=>validateR091Source(m,r091Git({source,tool,ancestors:{[r090Release]:r089Release}})),/R091 source must descend from the R090 release/);
 assert.throws(()=>validateR091Source(m,r091Git({source,tool,dirty:'services/payment-command/store.mjs'})),/R091 working input/);
 assert.throws(()=>validateR091Source(m,r091Git({source,tool,untracked:'services/agent-conversations/new.mjs'})),/R091 untracked/);
 assert.throws(()=>validateR090Source({...m,sourceBaseline:r089Release},r091Git({source,tool})),/R090/);
 await assert.rejects(r091HostingPlan(m,{git:r091Git({source,tool,changed:{[ci]:'services/payment-command/store.mjs'}})}),/R091 ci check: run is not input-equivalent/);
 m.applicationCi=r074Ci(tool);assert.equal((await r091HostingPlan(m,{git:r091Git({source,tool,delivery:toolFiles})})).site,site);
});
test('R091 operator audience and live verification keep the R090 checks and refuse AGENT_CONVERSATION_* env on the five services',async t=>{
 const {m,source,tool,image}=await r091Package(t),git=r091Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R091')).operator,email);await assert.rejects(operator('R091','https://lm.mw-credit.com/promotion/r090'),/impersonation proof/);await assert.rejects(operator('R092'),/unsupported operator release/);
 const {models,dispatch,make}=chatLive(m,image);
 const live=r074Readback(m);await verifyR091LivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 // An unrelated env name that merely contains the prefix later in the name is not refused.
 await verifyR091LivePackage(m,{token:'t',request:make({env:{command:[{name:'X_AGENT_CONVERSATION_NOTE',value:'1'}]}}),readGithub:r074Readback(m).readGithub,git});
 const leftovers=['read','command','notify','jobs','chat'].map(role=>[{env:{[role]:[{name:'AGENT_CONVERSATION_API_ENABLED',value:'false'}]}},new RegExp('R091 live '+role+' must carry no AGENT_CONVERSATION_\\* env')]);
 for(const [edit,pattern,digest='e'] of [...leftovers,[{env:{command:[{name:'AGENT_CONVERSATION_POLICY_SECRET',value:'projects/x/secrets/y'}]}},/R091 live command must carry no AGENT_CONVERSATION_/],
  [{},/build digest/,'f'],[{commandCpuIdle:true},/R091 live command cpu_idle must be false/],[{jobsDispatch:dispatch.filter(x=>x.name!=='NOTIFICATION_DISPATCH_URL')},/R091 live jobs dispatch wake drift/],
  [{subjects:{'mw-credit-app-chat-prod@clever-oasis-508610-n7.iam.gserviceaccount.com':'114454898477847610024'}},/R091 live notify callers must include chat and jobs/],
  [{revision:{chat:'mw-credit-app-chat-prod-00001-abc'}},/R091 live chat revision\/identity drift/],[{chatTimeout:'120s'},/R091 live chat timeout 300s/],[{models:{...models,maxRounds:12}},/R091 live chat models/],
  [{image:{read:'other'}},/live service revision\/identity drift/]])
  await assert.rejects(verifyR091LivePackage(m,{token:'t',request:make(edit,digest),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});

// R095 (payer name matching): V111 only (PROD 110 to 111; V110 applied separately, carried by the e3d5bc2 baseline), SQL
// first, then new command and chat images; read, notify and jobs read back on their pinned revisions.
const r095Baseline='e3d5bc2a0c013f6a2c73eb66a1b90ea64a34a41d',r095Migration='V111__payer_name.sql';
const r095Files={...r091Files,[r095Migration]:await readFile(new URL('../../database/migrations/'+r095Migration,import.meta.url),'utf8')};
const r095Added='database/migrations/'+r095Migration;
const r095Git=(options={})=>r090Git({migration:r095Added,files:r095Files,baseline:r095Baseline,...options});
const r095Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R095',...extra});
async function r095Package(t){
 const p=await r091Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:110,targetVersion:111,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r095Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r095.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:28,release:'R095',sourceBaseline:r095Baseline,
  sql:{baselineVersion:110,targetVersion:111,migrations:manifest.migrations.slice(-1),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:110,targetVersion:111,migrationsExecuted:1,startedAt:'2026-10-25T03:00:00Z',finishedAt:'2026-10-25T03:00:05Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'111',historyRows:111,allSuccessful:true,verifiedAt:'2026-10-25T03:01:00Z'}}});
 m.plan.counts={add:0,change:2,destroy:0};m.plan.actions=[...R095_PLAN_ACTIONS];
 m.applied.sqlVersion=111;m.applied.appliedAt='2026-10-25T03:20:00Z';
 for(const role of ['read','notify','jobs'])m.applied.services[role]={...structuredClone(m.rollback.services[role]),ready:true,trafficPercent:100};
 m.applied.services.command.revision='mw-credit-app-command-prod-00009-new';m.applied.services.chat.revision='mw-credit-app-chat-prod-00003-new';
 await setArtifact(m,'build-version.json',r095Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R091"','"R095"'));
 return p;
}
test('R095 package validates and rejects SQL, pinned V111 bytes, the two-image plan, unchanged-service readback, ordering and kind',async t=>{
 const {m,source,tool}=await r095Package(t),git=r095Git({source,tool});
 const plan=await r095HostingPlan(m,{git});assert.equal(plan.site,site);
 assert.deepEqual([...R095_PLAN_ACTIONS],['command.image','chat.image']);
 assert.equal(createHash('sha256').update(r095Files[r095Migration]).digest('hex'),'657d4660771d1636f227a3353504a1674ace738770be172960fc03d57484c03a','V111 bytes are the reviewed ones');
 for(const [mutate,pattern] of [
  [x=>x.sql.baselineVersion=109,/R095 exact V110 to V111/],[x=>x.sql.targetVersion=110,/R095 exact V110 to V111/],[x=>x.sql.migrations.push({name:'V112__x.sql',sha256:'0'.repeat(64)}),/R095 exact V110 to V111/],
  [x=>x.sql.migrations[0].sha256='0'.repeat(64),/R095 migration source hash/],[x=>x.sql.applied.baselineVersion=109,/R095 actual SQL apply/],[x=>x.sql.applied.migrationsExecuted=2,/R095 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='110',/R095 read-only V111 readback/],
  [x=>x.applied.sqlVersion=110,/R095 applied source/],[x=>x.applied.appliedAt='2026-10-25T03:00:01Z',/R095 applied source/],
  [x=>x.plan.counts={add:0,change:5,destroy:0},/R095 reviewed command and chat image plan/],[x=>x.plan.actions=[...R091_PLAN_ACTIONS],/R095 reviewed/],[x=>x.plan.actions.reverse(),/R095 reviewed/],
  [x=>delete x.rollback.services.read,/R095 recovery pins exactly the five services/],[x=>x.rollback.services.command.image=x.build.image,/recovery pin/],
  [x=>x.applied.services.read.image=x.build.image,/R095 unchanged read must read back on its pinned image and revision/],
  [x=>x.applied.services.notify.revision='mw-credit-app-notify-prod-00099-new',/R095 unchanged notify/],[x=>x.applied.services.jobs.ready=false,/R095 unchanged jobs/],
  [x=>x.applied.services.command.revision=x.rollback.services.command.revision,/R095 ready service/],[x=>x.applied.services.chat.image=x.rollback.services.chat.image,/R095 ready service/],
  [x=>delete x.applied.services.jobs,/R095 applied readback must name the five services/],
  [x=>x.release='R091',/package kind/],[x=>x.schemaVersion=27,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r095HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r095HostingPlan(prepared,{git}),/R095 runtime apply\/readback/);assert.equal((await r095HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r091HostingPlan(m,{git}),/wrong R091 package kind/);
 {const r091=await r091Package(t);await assert.rejects(r095HostingPlan(r091.m,{git:r091Git({source:r091.source,tool:r091.tool})}),/wrong R095 package kind/);}
 assert.equal(await validateR095Sql(m,git),undefined);
 // The marker must name R095.
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r095Marker(m,{release:'R091'}));await assert.rejects(r095HostingPlan(x,{git}),/R095 artifact release mismatch/);}
});
test('R095 source descends from the V110 baseline and adds exactly V111; the delivery commit may add the backfill tooling',async t=>{
 const {m,source,tool}=await r095Package(t);
 assert.doesNotThrow(()=>validateR095Source(m,r095Git({source,tool})));
 for(const file of ['scripts/database/Backfill-PayerNames.py','scripts/database/test_backfill_payer_names.py','scripts/promotion/README.md','scripts/database/connect_preflight.py'])assert.doesNotThrow(()=>validateR095Source(m,r095Git({source,tool,delivery:file})),file);
 for(const file of ['services/payment-command/store.mjs','database/migrations/V111__payer_name.sql','scripts/database/Test-PayerName.sql'])assert.throws(()=>validateR095Source(m,r095Git({source,tool,delivery:file})),/R095 unverified delivery/,file);
 for(const migration of ['','database/migrations/V110__revoke_agent_default_select.sql\n'+r095Added,r095Added+'\ndatabase/migrations/V112__x.sql'])assert.throws(()=>validateR095Source(m,r095Git({source,tool,migration})),/R095 carries exactly the separately applied V111/);
 assert.throws(()=>validateR095Source({...m,sourceBaseline:'2032bc3db9e40a5fb8d0ccf347c8dfb04c2c4b74'},r095Git({source,tool})),/R095 source\/baseline/);
 assert.throws(()=>validateR095Source(m,r095Git({source,tool,ancestors:{[r095Baseline]:r090Release}})),/R095 source must descend from the V110 \(PR #146\) release/);
});
test('R095 operator audience and live verification keep the chat-era checks with three services on their pinned revisions',async t=>{
 const {m,source,tool,image}=await r095Package(t),git=r095Git({source,tool});
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['read','notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const live=r074Readback(m);await verifyR095LivePackage(m,{token:'t',request:make({image:pinned}),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern] of [[{image:{...pinned,read:image}},/live service revision\/identity drift/],[{image:pinned,revision:{chat:'mw-credit-app-chat-prod-00001-abc'}},/R095 live chat revision\/identity drift/],[{image:pinned,chatTimeout:'120s'},/R095 live chat timeout 300s/]])
  await assert.rejects(verifyR095LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});

// R096 (Collection includes every charge dated today): no migration (PROD stays 111, read-only readback), then new read,
// command and chat images; notify and jobs read back on their pinned revisions.
const r096Baseline='14c4a40399060c45adfbdaf9b93004eba43b95eb';
const r096Git=(options={})=>r090Git({migration:'',files:r095Files,baseline:r096Baseline,...options});
const r096Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R096',...extra});
async function r096Package(t){
 const p=await r095Package(t),m=p.m;
 Object.assign(m,{schemaVersion:29,release:'R096',sourceBaseline:r096Baseline,
  sql:{baselineVersion:111,targetVersion:111,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'111',historyRows:111,allSuccessful:true,verifiedAt:'2026-10-25T03:01:00Z'}}});
 m.plan.counts={add:0,change:3,destroy:0};m.plan.actions=[...R096_PLAN_ACTIONS];
 m.applied.sqlVersion=111;m.applied.appliedAt='2026-10-25T03:20:00Z';
 m.applied.services.read={...structuredClone(m.applied.services.command),revision:'mw-credit-app-read-prod-00009-new'};
 await setArtifact(m,'build-version.json',r096Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R095"','"R096"'));
 return p;
}
test('R096 package validates with no migration and rejects SQL, the three-image plan, unchanged-service readback, ordering and kind',async t=>{
 const {m,source,tool}=await r096Package(t),git=r096Git({source,tool});
 const plan=await r096HostingPlan(m,{git});assert.equal(plan.site,site);
 assert.deepEqual([...R096_PLAN_ACTIONS],['read.image','command.image','chat.image']);
 for(const [mutate,pattern] of [
  [x=>x.sql.baselineVersion=110,/R096 requires a read-only V111 readback with no migration/],[x=>x.sql.targetVersion=112,/R096 requires a read-only V111/],
  [x=>x.sql.migrations.push({name:'V112__x.sql',sha256:'0'.repeat(64)}),/R096 requires a read-only V111/],[x=>x.sql.applied={},/R096 requires a read-only V111/],
  [x=>x.sql.verified.latestVersion='110',/R096 requires a read-only V111/],[x=>x.sql.verified.historyRows=110,/R096 requires a read-only V111/],[x=>x.sql.verified.verifiedAt='2026-10-25',/R096 requires a read-only V111/],
  [x=>x.applied.sqlVersion=110,/R096 applied source/],[x=>x.applied.appliedAt='2026-10-25T03:00:59Z',/R096 applied source/],
  [x=>x.plan.counts={add:0,change:2,destroy:0},/R096 reviewed read, command and chat image plan/],[x=>x.plan.actions=[...R095_PLAN_ACTIONS],/R096 reviewed/],[x=>x.plan.actions.reverse(),/R096 reviewed/],
  [x=>delete x.rollback.services.notify,/R096 recovery pins exactly the five services/],[x=>x.rollback.services.read.image=x.build.image,/recovery pin/],
  [x=>x.applied.services.notify.image=x.build.image,/R096 unchanged notify must read back on its pinned image and revision/],[x=>x.applied.services.jobs.ready=false,/R096 unchanged jobs/],
  [x=>x.applied.services.read.revision=x.rollback.services.read.revision,/R096 ready service/],[x=>x.applied.services.read.image=x.rollback.services.read.image,/R096 ready service/],
  [x=>x.applied.services.command.image=x.rollback.services.command.image,/R096 ready service/],[x=>x.applied.services.chat.ready=false,/R096 ready service/],
  [x=>delete x.applied.services.read,/R096 applied readback must name the five services/],
  [x=>x.release='R095',/package kind/],[x=>x.schemaVersion=28,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r096HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r096HostingPlan(prepared,{git}),/R096 runtime apply\/readback/);assert.equal((await r096HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r095HostingPlan(m,{git}),/wrong R095 package kind/);
 {const r095=await r095Package(t);await assert.rejects(r096HostingPlan(r095.m,{git:r095Git({source:r095.source,tool:r095.tool})}),/wrong R096 package kind/);}
 assert.equal(await validateR096Sql(m,git),undefined);
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r096Marker(m,{release:'R095'}));await assert.rejects(r096HostingPlan(x,{git}),/R096 artifact release mismatch/);}
});
test('R096 source descends from the R095 package and adds no migration; the delivery commit may add only the runner, its test, this README and documents',async t=>{
 const {m,source,tool}=await r096Package(t);
 assert.doesNotThrow(()=>validateR096Source(m,r096Git({source,tool})));
 for(const file of ['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','project/Documents/Release_Tracker.md'])assert.doesNotThrow(()=>validateR096Source(m,r096Git({source,tool,delivery:file})),file);
 for(const file of ['services/api/collection-read-contract.mjs','scripts/database/Backfill-PayerNames.py','database/migrations/V112__x.sql'])assert.throws(()=>validateR096Source(m,r096Git({source,tool,delivery:file})),/R096 unverified delivery/,file);
 for(const migration of ['database/migrations/V112__x.sql',r095Added])assert.throws(()=>validateR096Source(m,r096Git({source,tool,migration})),/R096 carries no migration/);
 assert.throws(()=>validateR096Source({...m,sourceBaseline:r095Baseline},r096Git({source,tool})),/R096 source\/baseline/);
 assert.throws(()=>validateR096Source(m,r096Git({source,tool,ancestors:{[r096Baseline]:r095Baseline}})),/R096 source must descend from the R095 release/);
});
test('R096 operator audience and live verification keep the chat-era checks with notify and jobs on their pinned revisions',async t=>{
 const {m,source,tool,image}=await r096Package(t),git=r096Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R096')).operator,email);await assert.rejects(operator('R096','https://lm.mw-credit.com/promotion/r095'),/impersonation proof/);await assert.rejects(operator('R098'),/unsupported operator release/);
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const live=r074Readback(m);await verifyR096LivePackage(m,{token:'t',request:make({image:pinned}),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern] of [[{image:{...pinned,read:m.rollback.services.read.image}},/live service revision\/identity drift/],[{image:pinned,revision:{chat:'mw-credit-app-chat-prod-00001-abc'}},/R096 live chat revision\/identity drift/],[{image:pinned,chatTimeout:'120s'},/R096 live chat timeout 300s/]])
  await assert.rejects(verifyR096LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});

// R097 (Collection board row prepaid amount and status line): as R096, no migration (PROD stays 111, read-only readback), then new read,
// command and chat images; notify and jobs read back on their pinned revisions.
const r097Baseline='3cbbcea1e3944156b6dee3c812d7ad8895c0f1ca';
const r097Git=(options={})=>r090Git({migration:'',files:r095Files,baseline:r097Baseline,...options});
const r097Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R097',...extra});
async function r097Package(t){
 const p=await r096Package(t),m=p.m;
 Object.assign(m,{schemaVersion:30,release:'R097',sourceBaseline:r097Baseline,
  sql:{baselineVersion:111,targetVersion:111,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'111',historyRows:111,allSuccessful:true,verifiedAt:'2026-10-25T03:01:00Z'}}});
 m.plan.counts={add:0,change:3,destroy:0};m.plan.actions=[...R097_PLAN_ACTIONS];
 m.applied.sqlVersion=111;m.applied.appliedAt='2026-10-25T03:20:00Z';
  await setArtifact(m,'build-version.json',r097Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R096"','"R097"'));
 return p;
}
test('R097 package validates with no migration and rejects SQL, the three-image plan, unchanged-service readback, ordering and kind',async t=>{
 const {m,source,tool}=await r097Package(t),git=r097Git({source,tool});
 const plan=await r097HostingPlan(m,{git});assert.equal(plan.site,site);
 assert.deepEqual([...R097_PLAN_ACTIONS],['read.image','command.image','chat.image']);
 for(const [mutate,pattern] of [
  [x=>x.sql.baselineVersion=110,/R097 requires a read-only V111 readback with no migration/],[x=>x.sql.targetVersion=112,/R097 requires a read-only V111/],
  [x=>x.sql.migrations.push({name:'V112__x.sql',sha256:'0'.repeat(64)}),/R097 requires a read-only V111/],[x=>x.sql.applied={},/R097 requires a read-only V111/],
  [x=>x.sql.verified.latestVersion='110',/R097 requires a read-only V111/],[x=>x.sql.verified.historyRows=110,/R097 requires a read-only V111/],[x=>x.sql.verified.verifiedAt='2026-10-25',/R097 requires a read-only V111/],
  [x=>x.applied.sqlVersion=110,/R097 applied source/],[x=>x.applied.appliedAt='2026-10-25T03:00:59Z',/R097 applied source/],
  [x=>x.plan.counts={add:0,change:2,destroy:0},/R097 reviewed read, command and chat image plan/],[x=>x.plan.actions=['command.image','chat.image'],/R097 reviewed/],[x=>x.plan.actions.reverse(),/R097 reviewed/],
  [x=>delete x.rollback.services.notify,/R097 recovery pins exactly the five services/],[x=>x.rollback.services.read.image=x.build.image,/recovery pin/],
  [x=>x.applied.services.notify.image=x.build.image,/R097 unchanged notify must read back on its pinned image and revision/],[x=>x.applied.services.jobs.ready=false,/R097 unchanged jobs/],
  [x=>x.applied.services.read.revision=x.rollback.services.read.revision,/R097 ready service/],[x=>x.applied.services.read.image=x.rollback.services.read.image,/R097 ready service/],
  [x=>x.applied.services.command.image=x.rollback.services.command.image,/R097 ready service/],[x=>x.applied.services.chat.ready=false,/R097 ready service/],
  [x=>delete x.applied.services.read,/R097 applied readback must name the five services/],
  [x=>x.release='R096',/package kind/],[x=>x.schemaVersion=29,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r097HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r097HostingPlan(prepared,{git}),/R097 runtime apply\/readback/);assert.equal((await r097HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r096HostingPlan(m,{git}),/wrong R096 package kind/);
 {const r096=await r096Package(t);await assert.rejects(r097HostingPlan(r096.m,{git:r096Git({source:r096.source,tool:r096.tool})}),/wrong R097 package kind/);}
 assert.equal(await validateR097Sql(m,git),undefined);
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r097Marker(m,{release:'R096'}));await assert.rejects(r097HostingPlan(x,{git}),/R097 artifact release mismatch/);}
});
test('R097 source descends from the R096 package and adds no migration; the delivery commit may add only the runner, its test, this README and documents',async t=>{
 const {m,source,tool}=await r097Package(t);
 assert.doesNotThrow(()=>validateR097Source(m,r097Git({source,tool})));
 for(const file of ['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','project/Documents/Release_Tracker.md'])assert.doesNotThrow(()=>validateR097Source(m,r097Git({source,tool,delivery:file})),file);
 for(const file of ['services/api/collection-read-contract.mjs','scripts/database/Backfill-PayerNames.py','database/migrations/V112__x.sql'])assert.throws(()=>validateR097Source(m,r097Git({source,tool,delivery:file})),/R097 unverified delivery/,file);
 for(const migration of ['database/migrations/V112__x.sql',r095Added])assert.throws(()=>validateR097Source(m,r097Git({source,tool,migration})),/R097 carries no migration/);
 assert.throws(()=>validateR097Source({...m,sourceBaseline:r096Baseline},r097Git({source,tool})),/R097 source\/baseline/);
 assert.throws(()=>validateR097Source(m,r097Git({source,tool,ancestors:{[r097Baseline]:r096Baseline}})),/R097 source must descend from the R096 release/);
});
test('R097 operator audience and live verification keep the chat-era checks with notify and jobs on their pinned revisions',async t=>{
 const {m,source,tool,image}=await r097Package(t),git=r097Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R097')).operator,email);await assert.rejects(operator('R097','https://lm.mw-credit.com/promotion/r096'),/impersonation proof/);await assert.rejects(operator('R098'),/unsupported operator release/);
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const live=r074Readback(m);await verifyR097LivePackage(m,{token:'t',request:make({image:pinned}),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern] of [[{image:{...pinned,read:m.rollback.services.read.image}},/live service revision\/identity drift/],[{image:pinned,revision:{chat:'mw-credit-app-chat-prod-00001-abc'}},/R097 live chat revision\/identity drift/],[{image:pinned,chatTimeout:'120s'},/R097 live chat timeout 300s/]])
  await assert.rejects(verifyR097LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});
// R100 (CI tune-up lint batches): as R097, no migration (PROD stays 111, read-only readback), then new read, command and
// chat images; notify and jobs read back on their pinned revisions.
const r100Baseline='e04037313b09d824988453ab2b6c014ae6fd81c4';
const r100Git=(options={})=>r090Git({migration:'',files:r095Files,baseline:r100Baseline,...options});
const r100Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R100',...extra});
async function r100Package(t){
 const p=await r097Package(t),m=p.m;
 Object.assign(m,{schemaVersion:31,release:'R100',sourceBaseline:r100Baseline,
  sql:{baselineVersion:111,targetVersion:111,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'111',historyRows:111,allSuccessful:true,verifiedAt:'2026-10-25T03:01:00Z'}}});
 m.plan.counts={add:0,change:3,destroy:0};m.plan.actions=[...R100_PLAN_ACTIONS];
 m.applied.sqlVersion=111;m.applied.appliedAt='2026-10-25T03:20:00Z';
  await setArtifact(m,'build-version.json',r100Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R097"','"R100"'));
 return p;
}
test('R100 package validates with no migration and rejects SQL, the three-image plan, unchanged-service readback, ordering and kind',async t=>{
 const {m,source,tool}=await r100Package(t),git=r100Git({source,tool});
 const plan=await r100HostingPlan(m,{git});assert.equal(plan.site,site);
 assert.deepEqual([...R100_PLAN_ACTIONS],['read.image','command.image','chat.image']);
 for(const [mutate,pattern] of [
  [x=>x.sql.baselineVersion=110,/R100 requires a read-only V111 readback with no migration/],[x=>x.sql.targetVersion=112,/R100 requires a read-only V111/],
  [x=>x.sql.migrations.push({name:'V112__x.sql',sha256:'0'.repeat(64)}),/R100 requires a read-only V111/],[x=>x.sql.applied={},/R100 requires a read-only V111/],
  [x=>x.sql.verified.latestVersion='110',/R100 requires a read-only V111/],[x=>x.sql.verified.historyRows=110,/R100 requires a read-only V111/],[x=>x.sql.verified.verifiedAt='2026-10-25',/R100 requires a read-only V111/],
  [x=>x.applied.sqlVersion=110,/R100 applied source/],[x=>x.applied.appliedAt='2026-10-25T03:00:59Z',/R100 applied source/],
  [x=>x.plan.counts={add:0,change:2,destroy:0},/R100 reviewed read, command and chat image plan/],[x=>x.plan.actions=['command.image','chat.image'],/R100 reviewed/],[x=>x.plan.actions.reverse(),/R100 reviewed/],
  [x=>delete x.rollback.services.notify,/R100 recovery pins exactly the five services/],[x=>x.rollback.services.read.image=x.build.image,/recovery pin/],
  [x=>x.applied.services.notify.image=x.build.image,/R100 unchanged notify must read back on its pinned image and revision/],[x=>x.applied.services.jobs.ready=false,/R100 unchanged jobs/],
  [x=>x.applied.services.read.revision=x.rollback.services.read.revision,/R100 ready service/],[x=>x.applied.services.read.image=x.rollback.services.read.image,/R100 ready service/],
  [x=>x.applied.services.command.image=x.rollback.services.command.image,/R100 ready service/],[x=>x.applied.services.chat.ready=false,/R100 ready service/],
  [x=>delete x.applied.services.read,/R100 applied readback must name the five services/],
  [x=>x.release='R097',/package kind/],[x=>x.schemaVersion=30,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r100HostingPlan(candidate,{git}),pattern,String(mutate));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r100HostingPlan(prepared,{git}),/R100 runtime apply\/readback/);assert.equal((await r100HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r097HostingPlan(m,{git}),/wrong R097 package kind/);
 {const r097=await r097Package(t);await assert.rejects(r100HostingPlan(r097.m,{git:r097Git({source:r097.source,tool:r097.tool})}),/wrong R100 package kind/);}
 assert.equal(await validateR100Sql(m,git),undefined);
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r100Marker(m,{release:'R097'}));await assert.rejects(r100HostingPlan(x,{git}),/R100 artifact release mismatch/);}
});
test('R100 source descends from the R097 package and adds no migration; the delivery commit may add only the runner, its test, this README and documents',async t=>{
 const {m,source,tool}=await r100Package(t);
 assert.doesNotThrow(()=>validateR100Source(m,r100Git({source,tool})));
 for(const file of ['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','project/Documents/Release_Tracker.md'])assert.doesNotThrow(()=>validateR100Source(m,r100Git({source,tool,delivery:file})),file);
 for(const file of ['services/api/collection-read-contract.mjs','scripts/database/Backfill-PayerNames.py','database/migrations/V112__x.sql'])assert.throws(()=>validateR100Source(m,r100Git({source,tool,delivery:file})),/R100 unverified delivery/,file);
 for(const migration of ['database/migrations/V112__x.sql',r095Added])assert.throws(()=>validateR100Source(m,r100Git({source,tool,migration})),/R100 carries no migration/);
 assert.throws(()=>validateR100Source({...m,sourceBaseline:r097Baseline},r100Git({source,tool})),/R100 source\/baseline/);
 assert.throws(()=>validateR100Source(m,r100Git({source,tool,ancestors:{[r100Baseline]:r097Baseline}})),/R100 source must descend from the R097 release/);
});
test('R100 operator audience and live verification keep the chat-era checks with notify and jobs on their pinned revisions',async t=>{
 const {m,source,tool,image}=await r100Package(t),git=r100Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R100')).operator,email);await assert.rejects(operator('R100','https://lm.mw-credit.com/promotion/r097'),/impersonation proof/);await assert.rejects(operator('R098'),/unsupported operator release/);
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const live=r074Readback(m);await verifyR100LivePackage(m,{token:'t',request:make({image:pinned}),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern] of [[{image:{...pinned,read:m.rollback.services.read.image}},/live service revision\/identity drift/],[{image:pinned,revision:{chat:'mw-credit-app-chat-prod-00001-abc'}},/R100 live chat revision\/identity drift/],[{image:pinned,chatTimeout:'120s'},/R100 live chat timeout 300s/]])
  await assert.rejects(verifyR100LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});

// R101 (pay the next charge early; Loan Close ignores unpaid interest on future-dated charges): V112 and V113 (PROD 111 to
// 113, one grouped transaction), SQL first, then new read, command and chat images; notify and jobs read back on their
// pinned revisions.
const r101Baseline='c7ea78d15d65fd082d592fd459f1e315cb2770ca',r101Migrations=['V112__pay_next_projected_charge.sql','V113__loan_close_future_interest.sql'];
const r101Files={...r095Files,...Object.fromEntries(await Promise.all(r101Migrations.map(async name=>[name,await readFile(new URL('../../database/migrations/'+name,import.meta.url),'utf8')])))};
const r101Added=r101Migrations.map(name=>'database/migrations/'+name).join('\n');
const r101Git=(options={})=>r090Git({migration:r101Added,files:r101Files,baseline:r101Baseline,...options});
const r101Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R101',...extra});
async function r101Package(t){
 const p=await r100Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:111,targetVersion:113,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r101Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r101.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:32,release:'R101',sourceBaseline:r101Baseline,
  sql:{baselineVersion:111,targetVersion:113,migrations:manifest.migrations.slice(-2),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:111,targetVersion:113,migrationsExecuted:2,startedAt:'2026-10-25T03:00:00Z',finishedAt:'2026-10-25T03:00:40Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'113',historyRows:113,allSuccessful:true,verifiedAt:'2026-10-25T03:01:00Z'}}});
 m.plan.counts={add:0,change:3,destroy:0};m.plan.actions=[...R101_PLAN_ACTIONS];
 m.applied.sqlVersion=113;m.applied.appliedAt='2026-10-25T03:20:00Z';
 await setArtifact(m,'build-version.json',r101Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R100"','"R101"'));
 return p;
}
test('R101 package validates and rejects SQL, pinned V112 and V113 bytes, the three-image plan, unchanged-service readback, ordering and kind',async t=>{
 const {m,source,tool}=await r101Package(t),git=r101Git({source,tool});
 const plan=await r101HostingPlan(m,{git});assert.equal(plan.site,site);
 assert.deepEqual([...R101_PLAN_ACTIONS],['read.image','command.image','chat.image']);
 assert.deepEqual(r101Migrations.map(name=>createHash('sha256').update(r101Files[name]).digest('hex')),['a9910bb3f10140b5a055416170f2d6f6141e56d6505a338248a6f857f9a10366','c7ea965763125d48b6df5767c6ccf2900e928d58f942d592d355587eab5039e8'],'V112 and V113 bytes are the reviewed (DEV-applied) ones');
 for(const [mutate,pattern] of [
  [x=>x.sql.baselineVersion=112,/R101 exact V111 to V113/],[x=>x.sql.targetVersion=112,/R101 exact V111 to V113/],[x=>x.sql.migrations.pop(),/R101 exact V111 to V113/],
  [x=>x.sql.migrations.reverse(),/R101 exact V111 to V113/],[x=>x.sql.migrations.push({name:'V114__x.sql',sha256:'0'.repeat(64)}),/R101 exact V111 to V113/],
  [x=>x.sql.migrations[1].sha256='0'.repeat(64),/R101 migration source hash/],[x=>x.sql.applied.baselineVersion=112,/R101 actual SQL apply/],[x=>x.sql.applied.migrationsExecuted=1,/R101 actual SQL apply/],
  [x=>x.sql.applied.backup.restorePassed=false,/R101 actual SQL apply/],[x=>x.sql.applied.backup.reference='dev-refresh-'+'c'.repeat(32),/R101 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='112',/R101 read-only V113 readback/],[x=>x.sql.verified.historyRows=112,/R101 read-only V113 readback/],[x=>x.sql.verified.verifiedAt='2026-10-25T03:00:39Z',/R101 read-only V113 readback/],
  [x=>x.applied.sqlVersion=111,/R101 applied source/],[x=>x.applied.appliedAt='2026-10-25T03:00:39Z',/R101 applied source/],
  [x=>x.plan.counts={add:0,change:2,destroy:0},/R101 reviewed read, command and chat image plan/],[x=>x.plan.actions=[...R095_PLAN_ACTIONS],/R101 reviewed/],[x=>x.plan.actions.reverse(),/R101 reviewed/],
  [x=>delete x.rollback.services.jobs,/R101 recovery pins exactly the five services/],[x=>x.rollback.services.chat.image=x.build.image,/recovery pin/],
  [x=>x.applied.services.notify.image=x.build.image,/R101 unchanged notify must read back on its pinned image and revision/],[x=>x.applied.services.jobs.revision='mw-credit-app-jobs-prod-00099-new',/R101 unchanged jobs/],
  [x=>x.applied.services.read.revision=x.rollback.services.read.revision,/R101 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R101 ready service/],[x=>x.applied.services.chat.ready=false,/R101 ready service/],
  [x=>delete x.applied.services.chat,/R101 applied readback must name the five services/],
  [x=>x.release='R100',/package kind/],[x=>x.schemaVersion=31,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r101HostingPlan(candidate,{git}),pattern,String(mutate));}
 // The reviewed bytes are pinned: a manifest and source carrying other V113 bytes is refused even when self-consistent.
 {const hash=value=>createHash('sha256').update(value).digest('hex'),files={...r101Files,'V113__loan_close_future_interest.sql':r101Files['V113__loan_close_future_interest.sql']+'\n-- edited'},x=structuredClone(m);
  const manifest={...JSON.parse(await readFile(m.sql.release.path,'utf8')),migrations:Object.entries(files).map(([name,value])=>({name,sha256:hash(value)}))},bytes=JSON.stringify(manifest),releasePath=m.sql.release.path.replace('.json','-edited.json');
  await writeFile(releasePath,bytes);x.sql.release={...x.sql.release,path:releasePath,sha256:hash(bytes)};x.sql.migrations=manifest.migrations.slice(-2);
  await assert.rejects(validateR101Sql(x,r101Git({source,tool,files})),/R101 migration is not the reviewed V113__loan_close_future_interest.sql/);}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r101HostingPlan(prepared,{git}),/R101 runtime apply\/readback/);assert.equal((await r101HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r100HostingPlan(m,{git}),/wrong R100 package kind/);
 {const r100=await r100Package(t);await assert.rejects(r101HostingPlan(r100.m,{git:r100Git({source:r100.source,tool:r100.tool})}),/wrong R101 package kind/);}
 assert.equal(await validateR101Sql(m,git),undefined);
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r101Marker(m,{release:'R100'}));await assert.rejects(r101HostingPlan(x,{git}),/R101 artifact release mismatch/);}
});
test('R101 source descends from the R100 package and adds exactly V112 and V113; the delivery commit may add only the runner, its test, the READMEs and documents',async t=>{
 const {m,source,tool}=await r101Package(t);
 assert.doesNotThrow(()=>validateR101Source(m,r101Git({source,tool})));
 for(const file of ['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','scripts/database/R053_OPERATOR.md','project/Documents/Release_Tracker.md'])assert.doesNotThrow(()=>validateR101Source(m,r101Git({source,tool,delivery:file})),file);
 for(const file of ['services/payment-command/store.mjs','database/migrations/V113__loan_close_future_interest.sql','scripts/database/Test-AtomicLoanClose.sql','scripts/database/Backfill-PayerNames.py'])assert.throws(()=>validateR101Source(m,r101Git({source,tool,delivery:file})),/R101 unverified delivery/,file);
 for(const migration of ['','database/migrations/V112__pay_next_projected_charge.sql',r101Added+'\ndatabase/migrations/V114__x.sql',r095Added+'\n'+r101Added])assert.throws(()=>validateR101Source(m,r101Git({source,tool,migration})),/R101 carries exactly the separately applied V113/,migration);
 assert.throws(()=>validateR101Source({...m,sourceBaseline:r100Baseline},r101Git({source,tool})),/R101 source\/baseline/);
 assert.throws(()=>validateR101Source(m,r101Git({source,tool,ancestors:{[r101Baseline]:r100Baseline}})),/R101 source must descend from the R100 release/);
});
test('R101 operator audience and live verification keep the chat-era checks with notify and jobs on their pinned revisions',async t=>{
 const {m,source,tool,image}=await r101Package(t),git=r101Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R101')).operator,email);await assert.rejects(operator('R101','https://lm.mw-credit.com/promotion/r100'),/impersonation proof/);await assert.rejects(operator('R098'),/unsupported operator release/);
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const live=r074Readback(m);await verifyR101LivePackage(m,{token:'t',request:make({image:pinned}),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern] of [[{image:{...pinned,read:m.rollback.services.read.image}},/live service revision\/identity drift/],[{image:pinned,revision:{chat:'mw-credit-app-chat-prod-00001-abc'}},/R101 live chat revision\/identity drift/],[{image:pinned,chatTimeout:'120s'},/R101 live chat timeout 300s/]])
  await assert.rejects(verifyR101LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});

// R102 (Long overdue; Claude Opus 5.5 chat through the keyless VM relay): V114 and V115 (PROD 113 to 115, one grouped
// transaction), SQL first, then new read, command and chat images; the chat change also carries CHAT_MODELS_JSON,
// CHAT_RELAY_URL and Direct VPC egress; notify and jobs read back on their pinned revisions.
const r102Baseline='10d543d16cd83e6baeaf480edd03719160b8588d',r102Migrations=['V114__long_overdue_collection_status.sql','V115__chat_claude_model_ids.sql'];
const r102Files={...r101Files,...Object.fromEntries(await Promise.all(r102Migrations.map(async name=>[name,await readFile(new URL('../../database/migrations/'+name,import.meta.url),'utf8')])))};
const r102Added=r102Migrations.map(name=>'database/migrations/'+name).join('\n');
const r102Git=(options={})=>r090Git({migration:r102Added,files:r102Files,baseline:r102Baseline,...options});
const r102Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R102',...extra});
const r102Models={version:1,location:'global',default:'claude-opus-5-5',thinkingLevel:'MEDIUM',maxRounds:16,requestTimeoutSeconds:120,turnTimeoutSeconds:240,historyTokenLimit:150000,seedChars:40000,maxOutputTokens:16384,
 models:[{id:'claude-opus-5-5',label:'Claude Opus 5.5',available:true},{id:'gemini-4-argon',label:'Gemini 4 Argon',available:true},{id:'gemini-3.8-flash',label:'Gemini 3.8 Flash',available:true},{id:'gemini-3.5-flash',label:'Gemini 3.5 Flash',available:true}]};
// R108: the chat menu is Claude Opus 5.5 only (the R102 settings otherwise unchanged).
const r108Models={...r102Models,models:r102Models.models.slice(0,1)};
const r102ChatVpc={egress:'PRIVATE_RANGES_ONLY',networkInterfaces:[{network:'default',subnetwork:'default'}]};
async function r102Package(t){
 const p=await r101Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:113,targetVersion:115,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r102Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r102.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:33,release:'R102',sourceBaseline:r102Baseline,
  sql:{baselineVersion:113,targetVersion:115,migrations:manifest.migrations.slice(-2),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:113,targetVersion:115,migrationsExecuted:2,startedAt:'2026-10-28T03:00:00Z',finishedAt:'2026-10-28T03:00:40Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'115',historyRows:115,allSuccessful:true,verifiedAt:'2026-10-28T03:01:00Z'}}});
 m.plan.counts={add:0,change:3,destroy:0};m.plan.actions=[...R102_PLAN_ACTIONS];
 m.applied.sqlVersion=115;m.applied.appliedAt='2026-10-28T03:20:00Z';
 await setArtifact(m,'build-version.json',r102Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R101"','"R102"'));
 return p;
}
test('R102 package validates and rejects SQL, pinned V114 and V115 bytes, the six-action plan, unchanged-service readback, ordering and kind',async t=>{
 const {m,source,tool}=await r102Package(t),git=r102Git({source,tool});
 const plan=await r102HostingPlan(m,{git});assert.equal(plan.site,site);
 assert.deepEqual([...R102_PLAN_ACTIONS],['read.image','command.image','chat.image','chat.modelsJson','chat.relayUrl','chat.vpcAccess']);
 assert.deepEqual(r102Migrations.map(name=>createHash('sha256').update(r102Files[name]).digest('hex')),['af10766eea0bec9b40c737de86312b189789212e6a786f21586ff98636284af9','669d9b3154399c13e02d03ec7d110951e5b44782144b3165330df6966c17252e'],'V114 and V115 bytes are the reviewed (DEV-applied) ones');
 for(const [mutate,pattern] of [
  [x=>x.sql.baselineVersion=114,/R102 exact V113 to V115/],[x=>x.sql.targetVersion=114,/R102 exact V113 to V115/],[x=>x.sql.migrations.pop(),/R102 exact V113 to V115/],
  [x=>x.sql.migrations.reverse(),/R102 exact V113 to V115/],[x=>x.sql.migrations.push({name:'V116__x.sql',sha256:'0'.repeat(64)}),/R102 exact V113 to V115/],
  [x=>x.sql.migrations[1].sha256='0'.repeat(64),/R102 migration source hash/],[x=>x.sql.applied.baselineVersion=114,/R102 actual SQL apply/],[x=>x.sql.applied.migrationsExecuted=1,/R102 actual SQL apply/],
  [x=>x.sql.applied.backup.restorePassed=false,/R102 actual SQL apply/],[x=>x.sql.applied.backup.reference='dev-refresh-'+'c'.repeat(32),/R102 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='114',/R102 read-only V115 readback/],[x=>x.sql.verified.historyRows=114,/R102 read-only V115 readback/],[x=>x.sql.verified.verifiedAt='2026-10-28T03:00:39Z',/R102 read-only V115 readback/],
  [x=>x.applied.sqlVersion=113,/R102 applied source/],[x=>x.applied.appliedAt='2026-10-28T03:00:39Z',/R102 applied source/],
  [x=>x.plan.counts={add:0,change:4,destroy:0},/R102 reviewed read and command image, chat image, models, relay and VPC plan/],[x=>x.plan.actions=[...R101_PLAN_ACTIONS],/R102 reviewed/],
  [x=>x.plan.actions.reverse(),/R102 reviewed/],[x=>x.plan.actions.pop(),/R102 reviewed/],[x=>x.plan.actions.push('notify.image'),/R102 reviewed/],
  [x=>delete x.rollback.services.jobs,/R102 recovery pins exactly the five services/],[x=>x.rollback.services.chat.image=x.build.image,/recovery pin/],
  [x=>x.applied.services.notify.image=x.build.image,/R102 unchanged notify must read back on its pinned image and revision/],[x=>x.applied.services.jobs.revision='mw-credit-app-jobs-prod-00099-new',/R102 unchanged jobs/],
  [x=>x.applied.services.read.revision=x.rollback.services.read.revision,/R102 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R102 ready service/],[x=>x.applied.services.chat.ready=false,/R102 ready service/],
  [x=>delete x.applied.services.chat,/R102 applied readback must name the five services/],
  [x=>x.release='R101',/package kind/],[x=>x.schemaVersion=32,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r102HostingPlan(candidate,{git}),pattern,String(mutate));}
 {const hash=value=>createHash('sha256').update(value).digest('hex'),files={...r102Files,'V115__chat_claude_model_ids.sql':r102Files['V115__chat_claude_model_ids.sql']+'\n-- edited'},x=structuredClone(m);
  const manifest={...JSON.parse(await readFile(m.sql.release.path,'utf8')),migrations:Object.entries(files).map(([name,value])=>({name,sha256:hash(value)}))},bytes=JSON.stringify(manifest),releasePath=m.sql.release.path.replace('.json','-edited.json');
  await writeFile(releasePath,bytes);x.sql.release={...x.sql.release,path:releasePath,sha256:hash(bytes)};x.sql.migrations=manifest.migrations.slice(-2);
  await assert.rejects(validateR102Sql(x,r102Git({source,tool,files})),/R102 migration is not the reviewed V115__chat_claude_model_ids.sql/);}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r102HostingPlan(prepared,{git}),/R102 runtime apply\/readback/);assert.equal((await r102HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r101HostingPlan(m,{git}),/wrong R101 package kind/);
 {const r101=await r101Package(t);await assert.rejects(r102HostingPlan(r101.m,{git:r101Git({source:r101.source,tool:r101.tool})}),/wrong R102 package kind/);}
 assert.equal(await validateR102Sql(m,git),undefined);
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r102Marker(m,{release:'R101'}));await assert.rejects(r102HostingPlan(x,{git}),/R102 artifact release mismatch/);}
});
test('R102 source descends from the R101 package and adds exactly V114 and V115; the delivery commit may add only the runner, its test, the READMEs and documents',async t=>{
 const {m,source,tool}=await r102Package(t);
 assert.doesNotThrow(()=>validateR102Source(m,r102Git({source,tool})));
 for(const file of ['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','scripts/database/R053_OPERATOR.md','project/Documents/Release_Tracker.md'])assert.doesNotThrow(()=>validateR102Source(m,r102Git({source,tool,delivery:file})),file);
 for(const file of ['services/chat/claude.mjs','database/migrations/V115__chat_claude_model_ids.sql','scripts/database/Test-LongOverdue.sql','infrastructure/production/chat-service.tf'])assert.throws(()=>validateR102Source(m,r102Git({source,tool,delivery:file})),/R102 unverified delivery/,file);
 for(const migration of ['','database/migrations/V114__long_overdue_collection_status.sql',r102Added+'\ndatabase/migrations/V116__x.sql',r101Added+'\n'+r102Added])assert.throws(()=>validateR102Source(m,r102Git({source,tool,migration})),/R102 carries exactly the separately applied V115/,migration);
 assert.throws(()=>validateR102Source({...m,sourceBaseline:r101Baseline},r102Git({source,tool})),/R102 source\/baseline/);
 assert.throws(()=>validateR102Source(m,r102Git({source,tool,ancestors:{[r102Baseline]:r101Baseline}})),/R102 source must descend from the R101 release/);
});
test('R102 operator audience and live verification: chat-era checks plus Claude Opus 5.5 default, the relay URL and private-range VPC egress on chat only',async t=>{
 const {m,source,tool,image}=await r102Package(t),git=r102Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R102')).operator,email);await assert.rejects(operator('R102','https://lm.mw-credit.com/promotion/r101'),/impersonation proof/);await assert.rejects(operator('R098'),/unsupported operator release/);
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const relay=[{name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL}],good={image:pinned,models:r102Models,env:{chat:relay},vpc:{chat:r102ChatVpc}};
 assert.equal(R102_CHAT_RELAY_URL,'http://10.148.0.2:8791/v1/chat/messages');
 const live=r074Readback(m);await verifyR102LivePackage(m,{token:'t',request:make(good),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 const threeGemini={...r102Models,default:'gemini-4-argon',models:r102Models.models.slice(1)};
 for(const [edit,pattern] of [
  [{...good,image:{...pinned,read:m.rollback.services.read.image}},/live service revision\/identity drift/],[{...good,revision:{chat:'mw-credit-app-chat-prod-00001-abc'}},/R102 live chat revision\/identity drift/],[{...good,chatTimeout:'120s'},/R102 live chat timeout 300s/],
  [{...good,models:threeGemini},/R102 live chat models must be Claude Opus 5.5 \(default\)/],[{...good,models:{...r102Models,default:'gemini-4-argon'}},/R102 live chat models/],
  [{...good,models:{...r102Models,models:[r102Models.models[1],r102Models.models[0],...r102Models.models.slice(2)]}},/R102 live chat models/],
  [{...good,models:{...r102Models,models:r102Models.models.map((x,i)=>i?x:{...x,available:false,reason:'down'})}},/R102 live chat models/],
  [{...good,models:{...r102Models,maxRounds:8}},/R102 live chat models/],
  [{...good,env:{}},/R102 live chat relay URL drift/],[{...good,env:{chat:[{name:'CHAT_RELAY_URL',value:'http://10.148.0.2:8790/v1/chat/messages'}]}},/R102 live chat relay URL drift/],
  [{...good,vpc:{}},/R102 live chat private-range VPC egress required/],[{...good,vpc:{chat:{...r102ChatVpc,egress:'ALL_TRAFFIC'}}},/R102 live chat private-range VPC egress required/],
  [{...good,vpc:{chat:{...r102ChatVpc,networkInterfaces:[{network:'default',subnetwork:'other'}]}}},/R102 live chat private-range VPC egress required/],
  [{...good,env:{chat:relay,read:relay}},/R102 live read must carry no chat relay or VPC egress/],[{...good,vpc:{chat:r102ChatVpc,notify:r102ChatVpc}},/R102 recognizer wiring outside the command service/],[{...good,env:{chat:relay,notify:relay}},/R102 live notify must carry no chat relay or VPC egress/]])
  await assert.rejects(verifyR102LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 // The older chat-era kinds keep their three-Gemini rule: an R101 readback with the R102 models is still refused.
 {const r101=await r101Package(t);await assert.rejects(verifyR101LivePackage(r101.m,{token:'t',request:chatLive(r101.m,r101.image).make({image:Object.fromEntries(['notify','jobs'].map(role=>[role,r101.m.rollback.services[role].image])),models:r102Models}),readGithub:r074Readback(r101.m).readGithub,git:r101Git({source:r101.source,tool:r101.tool})}),/R101 live chat models must be three Gemini models/);}
});
test('live build readback: regional first, global only on a regional 404, with build id, project, digest and source still exact',async t=>{
 const {m,source,tool,image}=await r102Package(t),git=r102Git({source,tool}),project='clever-oasis-508610-n7';
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const good={image:pinned,models:r102Models,env:{chat:[{name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL}]},vpc:{chat:r102ChatVpc}};
 const regional=`/v1/projects/${project}/locations/asia-southeast1/builds/`,global=`/v1/projects/${project}/locations/global/builds/`;
 // where: 'regional' answers regionally; 'global' 404s regionally and answers globally; 'none' 404s in both. edit alters the global build.
 const located=(where,{digest='e',status=404,edit=x=>x}={})=>{const base=make(good,digest),urls=[];const request=async(url,options)=>{
  if(!url.includes('cloudbuild'))return base(url,options);urls.push(url);
  if(url.includes(regional))return where==='regional'?base(url,options):{ok:false,status,json:async()=>({})};
  assert.ok(url.includes(global),url);if(where!=='global')return{ok:false,status:404,json:async()=>({})};
  const r=await base(url,options),build=await r.json();return{ok:true,json:async()=>edit({...build,id:m.build.id,projectId:project})};};return{request,urls};};
 const run=located=>verifyR102LivePackage(m,{token:'t',request:located.request,readGithub:r074Readback(m).readGithub,git});
 {const x=located('regional');await run(x);assert.equal(x.urls.length,1);assert.ok(x.urls[0].includes(regional));}
 {const x=located('global');await run(x);assert.deepEqual(x.urls.map(url=>url.includes(global)),[false,true]);}
 await assert.rejects(run(located('none')),/live package readback failed/);
 for(const status of [403,500])await assert.rejects(run(located('global',{status})),/live package readback failed/,String(status));
 await assert.rejects(run(located('global',{digest:'f'})),/live build digest mismatch/);
 await assert.rejects(run(located('global',{edit:b=>({...b,status:'FAILURE'})})),/live build digest mismatch/);
 await assert.rejects(run(located('global',{edit:b=>({...b,source:{storageSource:{...b.source.storageSource,generation:'other'}}})})),/exact CloudBuild source object required/);
 await assert.rejects(run(located('global',{edit:b=>({...b,id:'other-build'})})),/live global build identity mismatch/);
 await assert.rejects(run(located('global',{edit:b=>({...b,projectId:'other-project'})})),/live global build identity mismatch/);
});

// R103: the Hosting-only kind on the unchanged R102 runtime (b216968) and V115. Five services pinned to their exact R102
// PROD revisions and images; the R102 live chat check holds; the artifact carries the R103 marker and the R090 chat origin.
const r102Release='b216968ad45f2228d88a6f53ba9bc07f813636db';
const r103Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R103',...extra});
async function r103Package(t){
 const p=await r083Package(t),m=p.m;
 Object.assign(m,{schemaVersion:34,release:'R103',sourceBaseline:r102Release,sql:{baselineVersion:115,targetVersion:115,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'115',historyRows:115,allSuccessful:true,verifiedAt:'2026-10-28T15:00:00Z'}},
  runtime:{services:structuredClone(R103_RUNTIME)}});
 const config={...JSON.parse(await readFile(path.join(m.artifactRoot,'production-public-config.json'),'utf8')),chatOrigin:R090_CHAT_ORIGIN};
 await setArtifact(m,'production-public-config.json',JSON.stringify(config));
 await setArtifact(m,'build-version.json',r103Marker(m));
 await setArtifact(m,'assets/test.js',JSON.stringify(config)+'\nconst release="R103";');
 return {...p,config};
}
test('R103 Hosting-only package descends from R102, keeps the five R102 services and V115, carries the chat origin',async t=>{
 const {m,source,tool,ci,config}=await r103Package(t),git=r071Git({source,tool});
 const plan=await hostingOnlyPlan(m,{git});assert.equal(plan.site,site);assert.ok(plan.headers[0].headers['Content-Security-Policy'].includes(R090_CHAT_ORIGIN));
 assert.equal(R103_RUNTIME.chat.revision,'mw-credit-app-chat-prod-00012-7lz');assert.ok(R103_RUNTIME.read.image.endsWith('@sha256:599e19b64600b94720f6ef803fdc1f1f494b1d525c62e3430487abfd9717ff26'));
 for(const [mutate,pattern] of [[x=>{x.sourceBaseline=r081Release},/exact R103 source\/baseline/],[x=>{x.schemaVersion=33},/wrong R103 package kind/],[x=>{x.scope='runtime-workers-frontend'},/wrong R103 package kind/],
  [x=>{x.sql.targetVersion=116},/R103 requires verified V115/],[x=>{x.sql.verified.latestVersion='114'},/R103 requires verified V115/],[x=>{x.sql.migrations=[{name:'V116__x.sql'}]},/R103 requires verified V115/],
  [x=>{x.build={id:'b'}},/R103 package must not apply/],[x=>{x.plan={actions:['chat.image']}},/R103 package must not apply/],[x=>{x.applied={}},/R103 package must not apply/],
  [x=>{x.runtime.services.chat.revision='mw-credit-app-chat-prod-00013-new'},/R103 unchanged runtime pins required: the five R102 services/],[x=>{x.runtime.services.notify.image=R103_RUNTIME.read.image},/R103 unchanged runtime pins required: the five/],
  [x=>{delete x.runtime.services.chat},/R103 unchanged runtime pins required: the five/],[x=>{x.runtime.services.extra={...R103_RUNTIME.read}},/R103 unchanged runtime pins required: the five/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R103 ci check: cited run receipt/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(hostingOnlyPlan(candidate,{git}),pattern);}
 const detached=(root,args)=>args[0]==='merge-base'&&args[1]===r102Release?'0'.repeat(40):git(root,args);
 await assert.rejects(hostingOnlyPlan(m,{git:detached}),/R103 source must descend from the previous release/);
 for(const file of ['services/chat/claude.mjs','database/migrations/V116__x.sql','package-lock.json','infrastructure/production/chat-service.tf','Dockerfile'])await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r102Release]:file}})}),/R103 must not change the R102 runtime, SQL or infrastructure$/,file);
 assert.equal((await hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[r081Release]:'services/chat/claude.mjs',[r102Release]:'database/README.md'}})})).site,site);
 await assert.rejects(hostingOnlyPlan(m,{git:r071Git({source,tool,changed:{[ci]:'apps/pwa/src/chat/chat-text.ts'}})}),/R103 ci check: run is not input-equivalent/);
 for(const marker of [r103Marker(m,{release:'R102'}),JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry})]){const x=structuredClone(m);await setArtifact(x,'build-version.json',marker);await assert.rejects(hostingOnlyPlan(x,{git}),/R103 artifact release mismatch|marker\/mode mismatch/);}
 await setArtifact(m,'build-version.json',r103Marker(m));  // the clones share the artifact directory
 {const x=structuredClone(m),c=structuredClone(config);delete c.chatOrigin;await setArtifact(x,'production-public-config.json',JSON.stringify(c));await assert.rejects(hostingOnlyPlan(x,{git}),/R103 chat origin missing from the public config or the compiled bundle/);}
 // The older Hosting-only kinds are unchanged: an R083 package needs no chat pins or chat origin.
 {const r083=await r083Package(t);assert.equal((await hostingOnlyPlan(r083.m,{git:r071Git({source:r083.source,tool:r083.tool})})).site,site);}
});
test('R103 operator audience, delivery corrections and live readback of the five R102 services with the R102 chat check',async t=>{
 const {m,source,tool}=await r103Package(t),git=r071Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R103')).operator,email);await assert.rejects(operator('R103','https://lm.mw-credit.com/promotion/r102'),/impersonation proof/);await assert.rejects(operator('R098'),/unsupported operator release/);
 assert.doesNotThrow(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery:'scripts/promotion/deploy-business-hosting.mjs\ntests/unit/business-hosting-delivery.test.mjs\nscripts/promotion/README.md\nproject/Documents/Release_Tracker.md'})));
 for(const delivery of ['scripts/promotion/README.md\napps/pwa/src/chat/chat-text.ts','services/chat/claude.mjs'])assert.throws(()=>validateHostingOnlySource(m,r071Git({source,tool,delivery})),/R103 unverified delivery/);
 const relay=[{name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL}];
 const make=(edit={})=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=R103_RUNTIME[role],revision=edit.revision?.[role]??pin.revision;
  const env=role==='chat'?[{name:'CHAT_MODELS_JSON',value:JSON.stringify(edit.models??r102Models)},...(edit.relay??relay)]:(edit.env?.[role]??[]);
  const vpc=edit.vpc&&Object.hasOwn(edit.vpc,role)?edit.vpc[role]:role==='chat'?r102ChatVpc:role==='command'?r102ChatVpc:undefined;
  return {ok:true,json:async()=>({latestReadyRevision:'x/'+revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:edit.percent?.[role]??100,revision}],
   template:{serviceAccount:edit.account?.[role]??`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,containers:[{image:edit.image?.[role]??pin.image,env}],...(vpc?{vpcAccess:vpc}:{})}})};};
 const live=r074Readback(m);await verifyHostingOnlyLivePackage(m,{token:'t',request:make(),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 for(const [edit,pattern] of [[{image:{read:R103_RUNTIME.notify.image}},/R103 live runtime differs/],[{revision:{chat:'mw-credit-app-chat-prod-00013-new'}},/R103 live runtime differs/],[{image:{jobs:R103_RUNTIME.read.image}},/R103 live runtime differs/],
  [{percent:{command:90}},/R103 live command traffic must be 100%/],[{account:{chat:'other@x'}},/R103 live chat identity drift/],
  [{models:{...r102Models,default:'gemini-4-argon'}},/R103 live chat models must be Claude Opus 5.5 \(default\)/],[{relay:[]},/R103 live chat relay URL drift/],
  [{vpc:{chat:undefined}},/R103 live chat private-range VPC egress required/],[{env:{read:relay}},/R103 live read must carry no chat relay or VPC egress/]])
  await assert.rejects(verifyHostingOnlyLivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});

// R104 (record future charges from Upcoming Charges in schedule order): V116 and V117 (PROD 115 to 117, one grouped
// transaction, owner window mw_app_prod_journal_owner), SQL first, then new read, command and chat images; the chat
// configuration stays R102's (live readback with the R102 chat check); notify and jobs read back on their pinned revisions.
const r104Baseline='f5766653139155c2bf53372bd408e51e85732cfa',r104Migrations=['V116__book_projected_charge.sql','V117__sequential_projected_charge_booking.sql'];
const r104Files={...r102Files,...Object.fromEntries(await Promise.all(r104Migrations.map(async name=>[name,await readFile(new URL('../../database/migrations/'+name,import.meta.url),'utf8')])))};
const r104Added=r104Migrations.map(name=>'database/migrations/'+name).join('\n');
const r104Git=(options={})=>r090Git({migration:r104Added,files:r104Files,baseline:r104Baseline,...options});
const r104Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R104',...extra});
async function r104Package(t){
 const p=await r102Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:115,targetVersion:117,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r104Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r104.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:35,release:'R104',sourceBaseline:r104Baseline,
  sql:{baselineVersion:115,targetVersion:117,migrations:manifest.migrations.slice(-2),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:115,targetVersion:117,migrationsExecuted:2,startedAt:'2026-10-28T03:00:00Z',finishedAt:'2026-10-28T03:00:40Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'117',historyRows:117,allSuccessful:true,verifiedAt:'2026-10-28T03:01:00Z'}}});
 m.plan.counts={add:0,change:3,destroy:0};m.plan.actions=[...R104_PLAN_ACTIONS];
 m.applied.sqlVersion=117;m.applied.appliedAt='2026-10-28T03:20:00Z';
 await setArtifact(m,'build-version.json',r104Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R102"','"R104"'));
 return p;
}
test('R104 package validates and rejects SQL, pinned V116 and V117 bytes, the three-image plan, unchanged-service readback, ordering and kind',async t=>{
 const {m,source,tool}=await r104Package(t),git=r104Git({source,tool});
 const plan=await r104HostingPlan(m,{git});assert.equal(plan.site,site);
 assert.deepEqual([...R104_PLAN_ACTIONS],['read.image','command.image','chat.image']);
 assert.deepEqual(r104Migrations.map(name=>createHash('sha256').update(r104Files[name]).digest('hex')),['6da3abfe4533817e975a8924fc33542a9a45cebac0167f5845a7e3c6ecda7f18','778bbfe83ffe052c4432757ad97f7998b7cf470c1dd0849f38d966b6545f297f'],'V116 and V117 bytes are the reviewed (DEV-applied, 4e5ba9d) ones');
 for(const [mutate,pattern] of [
  [x=>x.sql.baselineVersion=116,/R104 exact V115 to V117/],[x=>x.sql.targetVersion=116,/R104 exact V115 to V117/],[x=>x.sql.migrations.pop(),/R104 exact V115 to V117/],
  [x=>x.sql.migrations.reverse(),/R104 exact V115 to V117/],[x=>x.sql.migrations.push({name:'V118__x.sql',sha256:'0'.repeat(64)}),/R104 exact V115 to V117/],
  [x=>x.sql.migrations[1].sha256='0'.repeat(64),/R104 migration source hash/],[x=>x.sql.applied.baselineVersion=116,/R104 actual SQL apply/],[x=>x.sql.applied.migrationsExecuted=1,/R104 actual SQL apply/],
  [x=>x.sql.applied.backup.restorePassed=false,/R104 actual SQL apply/],[x=>x.sql.applied.backup.reference='dev-refresh-'+'c'.repeat(32),/R104 actual SQL apply/],
  [x=>x.sql.verified.latestVersion='116',/R104 read-only V117 readback/],[x=>x.sql.verified.historyRows=116,/R104 read-only V117 readback/],[x=>x.sql.verified.verifiedAt='2026-10-28T03:00:39Z',/R104 read-only V117 readback/],
  [x=>x.applied.sqlVersion=115,/R104 applied source/],[x=>x.applied.appliedAt='2026-10-28T03:00:39Z',/R104 applied source/],
  [x=>x.plan.counts={add:0,change:4,destroy:0},/R104 reviewed read, command and chat image plan/],[x=>x.plan.actions=[...R102_PLAN_ACTIONS],/R104 reviewed/],
  [x=>x.plan.actions.reverse(),/R104 reviewed/],[x=>x.plan.actions.pop(),/R104 reviewed/],[x=>x.plan.actions.push('notify.image'),/R104 reviewed/],
  [x=>delete x.rollback.services.jobs,/R104 recovery pins exactly the five services/],[x=>x.rollback.services.chat.image=x.build.image,/recovery pin/],
  [x=>x.applied.services.notify.image=x.build.image,/R104 unchanged notify must read back on its pinned image and revision/],[x=>x.applied.services.jobs.revision='mw-credit-app-jobs-prod-00099-new',/R104 unchanged jobs/],
  [x=>x.applied.services.read.revision=x.rollback.services.read.revision,/R104 ready service/],[x=>x.applied.services.command.image=x.rollback.services.command.image,/R104 ready service/],[x=>x.applied.services.chat.ready=false,/R104 ready service/],
  [x=>delete x.applied.services.chat,/R104 applied readback must name the five services/],
  [x=>x.release='R102',/package kind/],[x=>x.schemaVersion=33,/package kind/],[x=>x.schemaVersion=34,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r104HostingPlan(candidate,{git}),pattern,String(mutate));}
 {const hash=value=>createHash('sha256').update(value).digest('hex'),files={...r104Files,'V117__sequential_projected_charge_booking.sql':r104Files['V117__sequential_projected_charge_booking.sql']+'\n-- edited'},x=structuredClone(m);
  const manifest={...JSON.parse(await readFile(m.sql.release.path,'utf8')),migrations:Object.entries(files).map(([name,value])=>({name,sha256:hash(value)}))},bytes=JSON.stringify(manifest),releasePath=m.sql.release.path.replace('.json','-edited.json');
  await writeFile(releasePath,bytes);x.sql.release={...x.sql.release,path:releasePath,sha256:hash(bytes)};x.sql.migrations=manifest.migrations.slice(-2);
  await assert.rejects(validateR104Sql(x,r104Git({source,tool,files})),/R104 migration is not the reviewed V117__sequential_projected_charge_booking.sql/);}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r104HostingPlan(prepared,{git}),/R104 runtime apply\/readback/);assert.equal((await r104HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r102HostingPlan(m,{git}),/wrong R102 package kind/);
 {const r102=await r102Package(t);await assert.rejects(r104HostingPlan(r102.m,{git:r102Git({source:r102.source,tool:r102.tool})}),/wrong R104 package kind/);}
 assert.equal(await validateR104Sql(m,git),undefined);
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r104Marker(m,{release:'R102'}));await assert.rejects(r104HostingPlan(x,{git}),/R104 artifact release mismatch/);}
});
test('R104 source descends from the R103 package and adds exactly V116 and V117; the delivery commit may add only the runner, its test, the READMEs and documents',async t=>{
 const {m,source,tool}=await r104Package(t);
 assert.doesNotThrow(()=>validateR104Source(m,r104Git({source,tool})));
 for(const file of ['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','scripts/database/R053_OPERATOR.md','project/Documents/Release_Tracker.md'])assert.doesNotThrow(()=>validateR104Source(m,r104Git({source,tool,delivery:file})),file);
 for(const file of ['apps/pwa/src/UpcomingCharges.tsx','services/payment-command/draft.mjs','database/migrations/V117__sequential_projected_charge_booking.sql','scripts/database/Test-AccessMatrix.sql'])assert.throws(()=>validateR104Source(m,r104Git({source,tool,delivery:file})),/R104 unverified delivery/,file);
 for(const migration of ['','database/migrations/V116__book_projected_charge.sql',r104Added+'\ndatabase/migrations/V118__x.sql',r102Added+'\n'+r104Added])assert.throws(()=>validateR104Source(m,r104Git({source,tool,migration})),/R104 carries exactly the separately applied V117/,migration);
 assert.throws(()=>validateR104Source({...m,sourceBaseline:r102Baseline},r104Git({source,tool})),/R104 source\/baseline/);
 assert.throws(()=>validateR104Source(m,r104Git({source,tool,ancestors:{[r104Baseline]:r102Baseline}})),/R104 source must descend from the R103 release/);
});
test('R104 operator audience and live verification: as R102, with the R102 chat models, relay URL and private-range VPC egress unchanged',async t=>{
 const {m,source,tool,image}=await r104Package(t),git=r104Git({source,tool}),project='clever-oasis-508610-n7';
 const email='mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com';
 const operator=async(release,proofAudience)=>{const aud='https://lm.mw-credit.com/promotion/'+release.toLowerCase(),rows=[{email,expires_in:1200},{email,projectId:project,uniqueId:'123456'},{token:'synthetic-signed'},...['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638'].map(site=>({name:`projects/${project}/sites/${site}`}))];let calls=0;return verifyAppOnlyOperator({token:'synthetic',release,request:async(_url,options)=>{if(options.method==='POST')assert.equal(JSON.parse(options.body).audience,aud);return{ok:true,json:async()=>rows[calls++]}},verifyIdToken:async(_token,audience)=>{assert.equal(audience,aud);return{email,email_verified:true,sub:'123456',aud:proofAudience??aud}}})};
 assert.equal((await operator('R104')).operator,email);await assert.rejects(operator('R104','https://lm.mw-credit.com/promotion/r103'),/impersonation proof/);await assert.rejects(operator('R098'),/unsupported operator release/);
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const relay=[{name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL}],good={image:pinned,models:r102Models,env:{chat:relay},vpc:{chat:r102ChatVpc}};
 const live=r074Readback(m);await verifyR104LivePackage(m,{token:'t',request:make(good),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 const threeGemini={...r102Models,default:'gemini-4-argon',models:r102Models.models.slice(1)};
 for(const [edit,pattern] of [
  [{...good,image:{...pinned,read:m.rollback.services.read.image}},/live service revision\/identity drift/],[{...good,revision:{chat:'mw-credit-app-chat-prod-00001-abc'}},/R104 live chat revision\/identity drift/],[{...good,chatTimeout:'120s'},/R104 live chat timeout 300s/],
  [{...good,models:threeGemini},/R104 live chat models must be Claude Opus 5.5 \(default\)/],[{...good,models:{...r102Models,default:'gemini-4-argon'}},/R104 live chat models/],
  [{...good,env:{}},/R104 live chat relay URL drift/],[{...good,vpc:{}},/R104 live chat private-range VPC egress required/],
  [{...good,env:{chat:relay,read:relay}},/R104 live read must carry no chat relay or VPC egress/]])
  await assert.rejects(verifyR104LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
});

// The --check and --apply paths dispatch through HOSTING_KINDS only (the R104 PROD apply was refused because the old
// if-chain had no R104 live branch and fell through to the R059 verifier). Each kind reaches its own plan, operator
// audience and live verifier, and R104's apply-path live verifier is its own.
test('every package kind dispatches to its own plan, operator release and live verifier; R104 reaches verifyR104LivePackage',async t=>{
 const kinds=HOSTING_KINDS.map(row=>row.kind);
 assert.equal(new Set(kinds).size,kinds.length);
 for(const row of HOSTING_KINDS.filter(row=>/^R[0-9]+$/.test(row.kind)&&!['R059','R061','R062','R063','R064'].includes(row.kind))){
  const n=row.kind.slice(1);
  assert.match(String(row.plan),new RegExp('\\br'+n+'HostingPlan\\('),row.kind+' plan');assert.match(String(row.live),new RegExp('\\bverifyR'+n+'LivePackage\\('),row.kind+' live');
  assert.equal(row.operatorRelease({release:row.kind}),row.kind,row.kind+' operator audience');
 }
 const named={R064:['waveHostingPlan','verifyWaveLivePackage','R064'],R063:['runtimeHostingPlan','verifyRuntimeLivePackage','R063'],R062:['settingsHostingPlan','verifySettingsLivePackage','R062'],R061:['frontendOnlyHostingPlan','verifyFrontendOnlyLivePackage',undefined],R059:['appOnlyHostingPlan','verifyAppOnlyLivePackage',undefined],'hosting-only':['hostingOnlyPlan','verifyHostingOnlyLivePackage','R103']};
 for(const [kind,[plan,live,release]] of Object.entries(named)){const row=HOSTING_KINDS.find(x=>x.kind===kind);assert.match(String(row.plan),new RegExp('\\b'+plan+'\\('),kind);assert.match(String(row.live),new RegExp('\\b'+live+'\\('),kind);assert.equal(row.operatorRelease({release:'R103'}),release,kind);}
 // Every exported live verifier of a release kind is reachable from exactly one row (R065's is the Hosting-only wrapper).
 const source=await readFile(new URL('../../scripts/promotion/deploy-business-hosting.mjs',import.meta.url),'utf8');
 for(const name of new Set(source.match(/export async function (verifyR[0-9]+LivePackage)/g).map(x=>x.split(' ').pop())))assert.equal(HOSTING_KINDS.filter(row=>String(row.live).includes(name+'(')).length,name==='verifyR065LivePackage'?0:1,name);
 assert.match(source,/export async function verifyR065LivePackage\(m,options=\{\}\)\{return verifyHostingOnlyLivePackage\(m,\{\.\.\.options,release:'R065'\}\);\}/);
 // Matching: schemaVersion and release together; first match wins; unknown packages are the legacy business package.
 assert.equal(hostingKind({schemaVersion:35,release:'R104'})?.kind,'R104');assert.equal(hostingKind({schemaVersion:33,release:'R102'})?.kind,'R102');
 assert.equal(hostingKind({schemaVersion:34,release:'R103'})?.kind,'hosting-only');assert.equal(hostingKind({schemaVersion:2,release:'R059'})?.kind,'R059');
 for(const inputs of [{schemaVersion:33,release:'R104'},{schemaVersion:35,release:'R102'},{schemaVersion:36,release:'R105'},{}])assert.equal(hostingKind(inputs),null,JSON.stringify(inputs));
 // R104 through the table: the live verifier is R104's own (R102 chat check, R104 messages), not the R059 one.
 const {m,source:src,tool,image}=await r104Package(t),git=r104Git({source:src,tool}),row=hostingKind(m);
 assert.equal(row.kind,'R104');assert.equal(row.operatorRelease(m),'R104');assert.equal((await row.plan(m,{requireApplied:true,git})).site,site);
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const good={image:pinned,models:r102Models,env:{chat:[{name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL}]},vpc:{chat:r102ChatVpc}};
 const live=r074Readback(m);await row.live(m,{token:'t',request:make(good),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 await assert.rejects(row.live(m,{token:'t',request:make({...good,models:{...r102Models,default:'gemini-4-argon'}}),readGithub:r074Readback(m).readGithub,git}),/R104 live chat models must be Claude Opus 5.5/);
});

// Generic release kind (R105 onwards): no per-release code. A synthetic Git repository (with a bare origin carrying the
// release tags) gives the runner real facts to derive: the baseline tag, the SQL range and its new migrations, and the
// services whose entry points reach the changed files.
// A fixed identity, so commits and annotated tags work on a CI runner with no git user configured.
const gitIdentity={GIT_AUTHOR_NAME:'Test',GIT_AUTHOR_EMAIL:'test@example.invalid',GIT_COMMITTER_NAME:'Test',GIT_COMMITTER_EMAIL:'test@example.invalid'};
const gitIn=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8',env:{...process.env,...gitIdentity}});if(r.status!==0)throw Error('git '+args.join(' ')+': '+r.stderr);return r.stdout.trim();};
// Synthetic entry points with the shape of the real ones: read and command run production/business-server.mjs, which reaches
// payment-command and chat through business-runtime.mjs; chat's server reaches the same runtime; the workers reach jobs and lib.
const syntheticServices={
 'services/production/business-server.mjs':"import {run} from './business-runtime.mjs';\n",'services/production/server.mjs':"import {x} from '../lib/x.mjs';\n",
 'services/production/business-runtime.mjs':"import {a} from '../api/read.mjs';\nimport {b} from '../payment-command/store.mjs';\nimport {c} from '../chat/service.mjs';\n",
 'services/api/read.mjs':"import {x} from '../lib/x.mjs';\nexport const a=1;\n",'services/payment-command/store.mjs':"import {a} from '../api/read.mjs';\nexport const b=1;\n",
 'services/chat/server.mjs':"import {run} from '../production/business-runtime.mjs';\n",'services/chat/service.mjs':"const rules=new URL('./assets/rules.md',import.meta.url);\nexport const c=1;\n",'services/chat/assets/rules.md':'rules\n',
 'services/workers/server.mjs':"import {j} from '../jobs/runner.mjs';\nimport {x} from '../lib/x.mjs';\n",'services/jobs/runner.mjs':'export const j=1;\n','services/lib/x.mjs':'export const x=1;\n','services/lib/x.d.mts':'export const x:number;\n'};
async function genericRepo(t,{r105={},r106={},tagR105=false}={}){
 const root=await mkdtemp(path.join(tmpdir(),'mw-generic-repo-')),origin=await mkdtemp(path.join(tmpdir(),'mw-generic-origin-'));t.after(()=>Promise.all([rm(root,{recursive:true,force:true}),rm(origin,{recursive:true,force:true})]));
 const write=async files=>{for(const [name,value] of Object.entries(files)){if(value===null){await rm(path.join(root,name));continue;}await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),value);}};
 const commit=async(files,message)=>{await write(files);gitIn(root,'add','-A');gitIn(root,'-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','-c','commit.gpgsign=false','commit','-q','-m',message);return gitIn(root,'rev-parse','HEAD');};
 gitIn(origin,'init','-q','--bare');gitIn(root,'init','-q','-b','main');gitIn(root,'remote','add','origin',origin);
 const initial=await commit({'README.md':'synthetic\n','package.json':JSON.stringify({name:'x',scripts:{test:'a'},dependencies:{pg:'1'}}),...syntheticServices},'initial');
 const r104=await commit({'database/migrations/V116__a.sql':'-- v116\n','database/migrations/V117__b.sql':'-- v117\n','apps/pwa/src/App.tsx':'export {};\n'},'R104');
 gitIn(root,'tag','R104',r104);gitIn(root,'push','-q','origin','R104');
 // R105 changes payment-command and a chat asset (R104's shape: draft.mjs and services/chat/assets).
 const r105Source=await commit({'database/migrations/V118__c.sql':'-- v118\n','services/payment-command/store.mjs':"import {a} from '../api/read.mjs';\nexport const b=2;\n",'services/chat/assets/rules.md':'rules 2\n','apps/pwa/src/App.tsx':'export const v=105;\n',...r105},'R105');
 if(tagR105){gitIn(root,'tag','-a','-m','R105','R105',r105Source);gitIn(root,'push','-q','origin','R105');}
 const r106Source=await commit({'apps/pwa/src/App.tsx':'export const v=106;\n','package.json':JSON.stringify({name:'x',scripts:{test:'b'},dependencies:{pg:'1'}}),...r106},'R106');
 return {root,origin,initial,r104,r105Source,r106Source,checkout:sha=>gitIn(root,'checkout','-q','--detach',sha)};
}
const genericMarker=(m,release)=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release});
async function genericBase(t,release){
 const p=await r104Package(t),m=p.m;
 delete m.deliveryToolSource;delete m.deliveryToolChecks;
 await setArtifact(m,'build-version.json',genericMarker(m,release));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R104"','"'+release+'"'));
 return p;
}
// A `terraform show -json` export: an image-only update for each named role (edit adds other changes).
const planJson=(roles,edit=json=>json)=>edit({format_version:'1.2',resource_changes:[
 {address:'data.google_project.current',type:'google_project',change:{actions:['read'],before:null,after:{}}},
 ...['read','command','notify','jobs','chat'].map(role=>{const name=`mw-credit-app-${role}-prod`,template=image=>[{containers:[{image,env:[{name:'DB_NAME',value:'loan_manager_prod'}]}],timeout:'60s'}];
  return roles.includes(role)?{address:`google_cloud_run_v2_service.runtime["${role}"]`,type:'google_cloud_run_v2_service',change:{actions:['update'],before:{name,etag:'1',template:template('old')},after:{name,etag:null,template:template('new')},after_unknown:{etag:true}}}
   :{address:`google_cloud_run_v2_service.runtime["${role}"]`,type:'google_cloud_run_v2_service',change:{actions:['no-op'],before:{name},after:{name}}};})]});
async function writePlanJson(m,root,json,name='plan.json'){const bytes=JSON.stringify(json),file=path.join(root,name);await writeFile(file,bytes);m.plan.jsonPath=file;m.plan.jsonSha256=createHash('sha256').update(bytes).digest('hex');}
async function genericRuntimePackage(t,repoOptions={}){
 const repo=await genericRepo(t,repoOptions),p=await genericBase(t,'R105'),m=p.m,source=repo.r105Source,hash=value=>createHash('sha256').update(value).digest('hex');
 repo.checkout(source);
 const files=gitIn(repo.root,'ls-tree','-r','--name-only',source,'--','database/migrations').split('\n');
 const manifest={environment:'development',commit:source,validationReference:'synthetic DEV apply',productionTransaction:{baselineVersion:117,targetVersion:118,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:files.map(file=>({name:path.posix.basename(file),sha256:hash(gitIn(repo.root,'show',source+':'+file)+'\n')}))};
 const releasePath=path.join(p.root,'release-r105.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:36,kindRule:'generic-v1',release:'R105',repoRoot:repo.root,sourceCommit:source,artifactSourceCommit:source,sourceBaseline:repo.r104,applicationCi:r074Ci(source),ownerWindows:['mw_app_prod_journal_owner'],
  sql:{baselineVersion:117,targetVersion:118,migrations:manifest.migrations.slice(-1),release:{path:releasePath,sha256:hash(bytes),commit:source},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:source,baselineVersion:117,targetVersion:118,migrationsExecuted:1,startedAt:'2026-10-30T03:00:00Z',finishedAt:'2026-10-30T03:00:20Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'118',historyRows:118,allSuccessful:true,verifiedAt:'2026-10-30T03:01:00Z'}}});
 m.build.sourceCommit=source;m.applied.sourceCommit=source;m.applied.sqlVersion=118;m.applied.appliedAt='2026-10-30T03:20:00Z';
 // payment-command and a chat asset changed: read, command and chat reach them, so all three get the new image.
 m.plan.counts={add:0,change:3,destroy:0};m.plan.actions=['read.image','command.image','chat.image'];await writePlanJson(m,p.root,planJson(['read','command','chat']));
 for(const role of ['notify','jobs'])m.applied.services[role]={...m.rollback.services[role],ready:true,trafficPercent:100};
 return {...p,repo,source};
}
test('generic roles come from the entry points\' imports: R104\'s file set changes read, command and chat; unknown files all five',async()=>{
 assert.deepEqual([...GENERIC_ROLES],['read','command','notify','jobs','chat']);
 assert.deepEqual(Object.keys(GENERIC_ROLE_ENTRIES),['read','command','notify','jobs','chat']);
 // The real services tree of this checkout.
 const {readdirSync,readFileSync}=await import('node:fs');
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(dir+'/'+x.name):[dir+'/'+x.name]);
 const files=new Set(walk('services')),closures=genericRoleClosures(files,file=>readFileSync(file,'utf8'));
 assert.deepEqual(genericChangedRoles(['services/payment-command/draft.mjs','services/chat/assets/schema-digest.json','services/chat/assets/conversation-business-rules.md','apps/pwa/src/UpcomingCharges.tsx','database/migrations/V116__book_projected_charge.sql'],{closures}),['read','command','chat'],'R104 shipped read, command and chat');
 assert.deepEqual(genericChangedRoles(['services/workers/runtime.mjs'],{closures}),['notify','jobs']);
 assert.deepEqual(genericChangedRoles(['services/chat/service.mjs'],{closures}),['read','command','chat'],'business-runtime imports the chat service');
 assert.deepEqual(genericChangedRoles(['services/lib/log.mjs'],{closures}),[...GENERIC_ROLES]);
 for(const file of ['services/never-imported.mjs','Dockerfile','package-lock.json','package.json','cloudbuild-business.yaml'])assert.deepEqual(genericChangedRoles([file],{closures}),[...GENERIC_ROLES],file);
 assert.deepEqual(genericChangedRoles(['package.json','services/lib/offline-dataset-digest.d.mts','apps/pwa/src/App.tsx','infrastructure/production/runtime.tf','scripts/promotion/README.md'],{closures,packageScriptsOnly:true}),[]);
 assert.throws(()=>genericRoleClosures(new Set(['services/production/business-server.mjs']),()=>''),/generic role entry missing for notify/);
});
test('generic R105 runtime package: derived from origin\'s R104 tag, V118 pinned, read, command and chat images from the plan JSON; refusals',async t=>{
 const {m,repo,source,root}=await genericRuntimePackage(t);
 const facts=deriveGenericRelease(m);
 assert.deepEqual({tag:facts.tag,baseline:facts.baseline,sqlBaseline:facts.sqlBaseline,sqlTarget:facts.sqlTarget,migrations:facts.migrations,changedRoles:facts.changedRoles},{tag:'R104',baseline:repo.r104,sqlBaseline:117,sqlTarget:118,migrations:['V118__c.sql'],changedRoles:['read','command','chat']});
 assert.equal(hostingKind(m)?.kind,'generic');assert.equal(hostingKind(m).operatorRelease(m),'R105');
 assert.equal((await genericHostingPlan(m)).site,site);
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(genericHostingPlan(prepared),/R105 runtime apply\/readback/);assert.equal((await genericHostingPlan(prepared,{requireApplied:false})).site,site);
 for(const [mutate,pattern] of [
  [x=>{x.sourceBaseline=repo.initial},/R105 source baseline must be the previous release tag R104/],
  [x=>{x.sql.migrations=[]},/R105 exact V117 to V118/],[x=>{x.sql.migrations.push({name:'V119__x.sql',sha256:'0'.repeat(64)})},/R105 exact V117 to V118/],
  [x=>{x.sql.migrations[0].sha256='0'.repeat(64)},/R105 migration source hash mismatch/],
  [x=>{x.plan.actions=['read.image','command.image','chat.image','chat.modelsJson'];x.plan.counts.change=4},/R105 generic plan may change images only/],
  [x=>{x.plan.actions=['read.image','command.image'];x.plan.counts.change=2},/R105 reviewed plan must change exactly the images of read, command, chat/],
  [x=>{x.plan.counts={add:1,change:3,destroy:0}},/R105 reviewed plan must change exactly/],
  [x=>{x.plan.jsonSha256='0'.repeat(64)},/R105 plan JSON export changed/],[x=>{x.plan.sha256='0'.repeat(64)},/R105 saved plan changed/],[x=>{delete x.plan.jsonPath},/R105 reviewed plan and its JSON export required/],
  [x=>{x.ownerWindows=['mw_app_dev_journal_owner']},/R105 declared PROD owner windows/],[x=>{delete x.ownerWindows},/R105 declared PROD owner windows/],
  [x=>{x.applied.appliedAt='2026-10-30T03:00:10Z'},/R105 applied source\/plan\/database mismatch \(SQL first/],[x=>{x.applied.sqlVersion=117},/R105 applied source/],
  [x=>{x.applied.services.notify={...x.applied.services.command}},/R105 unchanged notify must read back on its pinned image/],[x=>{x.applied.services.read={...x.rollback.services.read,ready:true,trafficPercent:100}},/R105 ready service readback/],
  [x=>{x.rollback.services.chat.image=x.build.image},/service recovery pin/],[x=>{delete x.rollback.services.notify},/R105 recovery pins exactly the five/],
  [x=>{x.kindRule='generic-v2'},/wrong generic package kind/],[x=>{x.schemaVersion=35},/wrong generic package kind/],
  [x=>{x.applicationCi.ci.jobs.check.headSha='0'.repeat(40)},/R105 ci check: cited run receipt/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(genericHostingPlan(candidate),pattern,String(mutate));}
 // The plan JSON, not the manifest list, decides: a plan missing chat.image, a non-image change or an extra resource is refused.
 for(const [json,pattern] of [[planJson(['read','command']),/R105 reviewed plan must change exactly the images of read, command, chat \(the plan JSON changes read.image, command.image\)/],
  [planJson(['read','command','chat'],j=>{j.resource_changes.find(x=>x.address.includes('chat')).change.after.template[0].containers[0].env.push({name:'CHAT_MODELS_JSON',value:'{}'});return j;}),/R105 generic plan may change images only: google_cloud_run_v2_service.runtime\["chat"\] changes template.0.containers.0.image, template.0.containers.0.env/],
  [planJson(['read','command','chat'],j=>{j.resource_changes.push({address:'google_cloud_run_v2_service_iam_member.x',type:'google_cloud_run_v2_service_iam_member',change:{actions:['create'],before:null,after:{}}});return j;}),/R105 generic plan may change images only: google_cloud_run_v2_service_iam_member.x/],
  [planJson(['read','command','chat'],j=>{j.resource_changes.find(x=>x.address.includes('read')).change.after.template[0].timeout='300s';return j;}),/R105 generic plan may change images only/]]){
  const x=structuredClone(m);await writePlanJson(x,root,json,'plan-'+createHash('sha256').update(JSON.stringify(json)).digest('hex').slice(0,8)+'.json');await assert.rejects(genericHostingPlan(x),pattern);}
 // A release with a hand-written kind is not generic, and R104's own manifest still routes to its own row.
 assert.equal(genericKindMatches({...m,release:'R104'}),false);assert.equal(hostingKind({...m,release:'R104'}),null);await assert.rejects(genericHostingPlan({...structuredClone(m),release:'R104'}),/wrong generic package kind/);
 {const r104=await r104Package(t);assert.equal(hostingKind(r104.m)?.kind,'R104');}
 // Working-tree drift is refused.
 await writeFile(path.join(repo.root,'services/chat/service.mjs'),'export const c=3;\n');await assert.rejects(genericHostingPlan(m),/R105 working input drift/);gitIn(repo.root,'checkout','--','services/chat/service.mjs');
 assert.equal((await genericHostingPlan(m)).sourceCommit,source);
});
test('generic tags come from origin: an existing release tag, a local tag that differs and a missing local tag',async t=>{
 const {m,repo}=await genericRuntimePackage(t);
 // The release itself already tagged (on origin) is refused.
 gitIn(repo.root,'tag','R105',repo.r105Source);gitIn(repo.root,'push','-q','origin','R105');await assert.rejects(genericHostingPlan(m),/R105 release tag already exists/);
 gitIn(repo.root,'push','-q','origin',':refs/tags/R105');gitIn(repo.root,'tag','-d','R105');
 // Only a local tag for the release is refused too (it is not on origin).
 gitIn(repo.root,'tag','R105',repo.r105Source);await assert.rejects(genericHostingPlan(m),/R105 local release tag R105 differs from origin/);gitIn(repo.root,'tag','-d','R105');
 // A local R104 that differs from origin's is refused; a missing local R104 still takes origin's.
 gitIn(repo.root,'tag','-f','R104',repo.initial);await assert.rejects(genericHostingPlan(m),/R105 local release tag R104 differs from origin/);
 gitIn(repo.root,'tag','-d','R104');assert.equal(deriveGenericRelease(m).baseline,repo.r104);assert.equal((await genericHostingPlan(m)).site,site);
});
test('generic R105 refuses non-contiguous or edited migrations and infrastructure changes',async t=>{
 {const {m}=await genericRuntimePackage(t,{r105:{'database/migrations/V120__d.sql':'-- v120\n'}});await assert.rejects(genericHostingPlan(m),/R105 migrations must be exactly V118 to V120, each once/);}
 {const {m}=await genericRuntimePackage(t,{r105:{'database/migrations/V117__b.sql':'-- edited\n'}});await assert.rejects(genericHostingPlan(m),/R105 may only add new versioned migrations/);}
 {const {m}=await genericRuntimePackage(t,{r105:{'infrastructure/production/runtime.tf':'# x\n'}});await assert.rejects(genericHostingPlan(m),/R105 generic kind cannot carry infrastructure changes: infrastructure\/production\/runtime.tf/);}
});
test('generic R105 live readback: chat-era checks with the current chat rule (R108 Claude-only menu) and request-based CPU (R107); unchanged services on their pins',async t=>{
 const {m,image}=await genericRuntimePackage(t);
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const relay=[{name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL}],good={image:pinned,models:r108Models,env:{chat:relay},vpc:{chat:r102ChatVpc},commandCpuIdle:true,chatCpuIdle:true};
 const live=r074Readback(m);await hostingKind(m).live(m,{token:'t',request:make(good),readGithub:live.readGithub});assert.equal(live.calls.length,10);
 for(const [edit,pattern] of [[{...good,image:{...pinned,notify:image}},/live service revision\/identity drift/],[{...good,models:{...r108Models,default:'gemini-4-argon'}},/R105 live chat models must be Claude Opus 5.5/],
  // R108: the Gemini models left the chat menu; the R102 four-model list is refused from then on.
  [{...good,models:r102Models},/R105 live chat models must be Claude Opus 5.5 only \(default\)/],[{...good,env:{}},/R105 live chat relay URL drift/],
  // R107 moved command and chat to request-based CPU: cpuIdle must be exactly true (absent reads as false).
  [{...good,commandCpuIdle:undefined},/R105 live command cpu_idle must be true/],[{...good,commandCpuIdle:false},/R105 live command cpu_idle must be true/],
  [{...good,chatCpuIdle:undefined},/R105 live chat timeout 300s and cpu_idle true required/],[{...good,chatCpuIdle:false},/R105 live chat timeout 300s and cpu_idle true required/]])
  await assert.rejects(verifyGenericLivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub}),pattern,JSON.stringify(edit));
});
// R106 to R108 have hand-written kinds, so the synthetic third release here is R109 (the repository's third commit).
test('generic R109 frontend-only on origin\'s R105 tag: no runtime or SQL change, five pins read back live',async t=>{
 const repo=await genericRepo(t,{tagR105:true}),p=await genericBase(t,'R109'),m=p.m,source=repo.r106Source;repo.checkout(source);
 for(const key of ['build','plan','applied','activation','recognition'])delete m[key];
 const pins=Object.fromEntries(GENERIC_ROLES.map(role=>[role,{...m.rollback.services[role]}]));
 Object.assign(m,{schemaVersion:36,kindRule:'generic-v1',release:'R109',scope:'frontend-only',status:'prepared',repoRoot:repo.root,sourceCommit:source,artifactSourceCommit:source,sourceBaseline:repo.r105Source,applicationCi:r074Ci(source),ownerWindows:[],runtime:{services:pins},
  sql:{baselineVersion:118,targetVersion:118,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'118',historyRows:118,allSuccessful:true,verifiedAt:'2026-10-31T03:00:00Z'}}});
 assert.equal(deriveGenericRelease(m).tag,'R105','the annotated tag is peeled to its commit');assert.deepEqual(deriveGenericRelease(m).changedRoles,[],'a scripts-only package.json change changes no image');
 assert.equal(hostingKind(m)?.kind,'generic');assert.equal((await genericHostingPlan(m)).site,site);
 for(const [mutate,pattern] of [[x=>{x.sourceBaseline=repo.r104},/R109 source baseline must be the previous release tag R105/],[x=>{x.sql.targetVersion=117},/R109 read-only V118 readback/],
  [x=>{x.ownerWindows=['mw_chat_owner_prod']},/R109 declared PROD owner windows/],[x=>{x.plan={actions:['read.image']}},/R109 frontend-only package must not apply/],
  [x=>{delete x.runtime.services.chat},/R109 unchanged runtime pins required/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(genericHostingPlan(candidate),pattern,String(mutate));}
 {const other=await genericRepo(t,{tagR105:true,r106:{'services/api/read.mjs':"import {x} from '../lib/x.mjs';\nexport const a=2;\n"}});other.checkout(other.r106Source);const x={...structuredClone(m),repoRoot:other.root,sourceCommit:other.r106Source,artifactSourceCommit:other.r106Source,sourceBaseline:other.r105Source,applicationCi:r074Ci(other.r106Source)};await assert.rejects(genericHostingPlan(x),/R109 frontend-only must not change runtime inputs or SQL: services\/api\/read.mjs/);}
 const project='clever-oasis-508610-n7',relay=[{name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL}];
 const make=(edit={})=>async url=>{const role=url.split('/services/mw-credit-app-')[1].replace('-prod',''),pin=pins[role],revision=edit.revision?.[role]??pin.revision;
  const env=role==='chat'?[{name:'CHAT_MODELS_JSON',value:JSON.stringify(r108Models)},...relay]:[];const vpc=role==='chat'||role==='command'?r102ChatVpc:undefined;
  return {ok:true,json:async()=>({latestReadyRevision:'x/'+revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{percent:100,revision}],template:{serviceAccount:`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`,containers:[{image:edit.image?.[role]??pin.image,env}],...(vpc?{vpcAccess:vpc}:{})}})};};
 await verifyGenericLivePackage(m,{token:'t',request:make(),readGithub:r074Readback(m).readGithub});
 await assert.rejects(verifyGenericLivePackage(m,{token:'t',request:make({revision:{notify:'mw-credit-app-notify-prod-00099-new'}}),readGithub:r074Readback(m).readGithub}),/R109 live notify differs from its pinned image and revision/);
});

// R106 (chat writes): V118 and V119 (PROD 117 to 119, one grouped transaction, owner window mw_chat_owner_prod), SQL first,
// then new read, command and chat images and CHAT_COMMAND_URL added on chat; the release carries exactly four
// infrastructure/production files. The plan JSON export is read back; the live readback is R102's plus the command URL on
// chat only. Kept at the end of the file: it uses the generic kind's plan JSON helpers.
const r106Baseline='cf0160229829ec3caf02bbbfd307d226c4b5d1b3',r106Migrations=['V118__chat_proposals.sql','V119__chat_proposal_groups.sql'];
const r106Infra=['infrastructure/production/chat-service.tf','infrastructure/production/tests/chat-service.tftest.hcl','infrastructure/production/README.md','infrastructure/production/READINESS_INVENTORY.md'];
const r106Files={...r104Files,...Object.fromEntries(await Promise.all(r106Migrations.map(async name=>[name,await readFile(new URL('../../database/migrations/'+name,import.meta.url),'utf8')])))};
const r106Added=r106Migrations.map(name=>'database/migrations/'+name).join('\n');
// r090Git answers a baseline-to-source diff with one list; here the list is filtered by the pathspec, so the migration and
// infrastructure checks each see their own files (`infra` adds files outside database/migrations).
function r106Git({infra=r106Infra.join('\n'),...options}={}){
 const base=r090Git({migration:r106Added,files:r106Files,baseline:r106Baseline,...options}),migration=options.migration??r106Added;
 return (root,args)=>{
  if(args[0]==='diff'&&args[2]===r106Baseline&&args[3]===options.source){
   const at=args.indexOf('--'),spec=at<0?null:args.slice(at+1);
   return nulNames(args,[...migration.split('\n'),...infra.split('\n')].filter(Boolean).filter(name=>!spec||spec.some(prefix=>name===prefix||name.startsWith(prefix+'/'))).join('\n'));
  }
  return base(root,args);
 };
}
const r106Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R106',...extra});
// The reviewed plan's JSON export: read, command and chat change their image; chat also adds CHAT_COMMAND_URL.
const r106PlanJson=(edit=json=>json)=>edit({format_version:'1.2',resource_changes:[
 {address:'data.google_project.current',type:'google_project',change:{actions:['read'],before:null,after:{}}},
 ...['read','command','notify','jobs','chat'].map(role=>{
  const name=`mw-credit-app-${role}-prod`,env=[{name:'DB_NAME',value:'loan_manager_prod',value_source:[]},...(role==='chat'?[{name:'CHAT_MODELS_JSON',value:'{"version":1}',value_source:[]}]:[])];
  const template=(image,list)=>[{containers:[{image,env:list}],timeout:'60s'}];
  const address=role==='chat'?'google_cloud_run_v2_service.chat':`google_cloud_run_v2_service.runtime["${role}"]`;
  if(!['read','command','chat'].includes(role))return {address,type:'google_cloud_run_v2_service',change:{actions:['no-op'],before:{name},after:{name}}};
  const after=role==='chat'?[...env,{name:'CHAT_COMMAND_URL',value:R106_CHAT_COMMAND_URL,value_source:[]}]:structuredClone(env);
  return {address,type:'google_cloud_run_v2_service',change:{actions:['update'],before:{name,etag:'1',template:template('old',env)},after:{name,etag:null,template:template('new',after)},after_unknown:{etag:true,template:[{containers:[{env:after.map(()=>({value_source:[]}))}]}]}}};
 })]});
const r106Change=(json,role)=>json.resource_changes.find(x=>x.change.after?.name===`mw-credit-app-${role}-prod`).change;
async function r106Package(t){
 const p=await r104Package(t),m=p.m,hash=value=>createHash('sha256').update(value).digest('hex');
 const manifest={environment:'development',commit:sqlRelease,validationReference:'synthetic',productionTransaction:{baselineVersion:117,targetVersion:119,group:true,mixed:false,executeInTransaction:true,callbacks:[]},migrations:Object.entries(r106Files).map(([name,value])=>({name,sha256:hash(value)}))};
 const releasePath=path.join(p.root,'release-r106.json'),bytes=JSON.stringify(manifest);await writeFile(releasePath,bytes);
 Object.assign(m,{schemaVersion:37,release:'R106',sourceBaseline:r106Baseline,
  sql:{baselineVersion:117,targetVersion:119,migrations:manifest.migrations.slice(-2),release:{path:releasePath,sha256:hash(bytes),commit:sqlRelease},
   applied:{environment:'production',database:'loan_manager_prod',instance:'mw-credit-pg-20261017',releaseCommit:sqlRelease,baselineVersion:117,targetVersion:119,migrationsExecuted:2,startedAt:'2026-10-31T03:00:00Z',finishedAt:'2026-10-31T03:00:40Z',backup:{dumpSha256:'a'.repeat(64),restorePassed:true,reference:'prod-promotion-'+'c'.repeat(32)}},
   verified:{database:'loan_manager_prod',latestVersion:'119',historyRows:119,allSuccessful:true,verifiedAt:'2026-10-31T03:01:00Z'}}});
 m.plan.counts={add:0,change:3,destroy:0};m.plan.actions=[...R106_PLAN_ACTIONS];await writePlanJson(m,p.root,r106PlanJson(),'r106-plan.json');
 m.applied.sqlVersion=119;m.applied.appliedAt='2026-10-31T03:20:00Z';
 await setArtifact(m,'build-version.json',r106Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R104"','"R106"'));
 return p;
}
test('R106 package validates: pinned V118 and V119 bytes, the three-image plan with CHAT_COMMAND_URL on chat read back from the plan JSON, ordering and kind',async t=>{
 const {m,source,tool,root}=await r106Package(t),git=r106Git({source,tool});
 assert.equal((await r106HostingPlan(m,{git})).site,site);
 assert.deepEqual([...R106_PLAN_ACTIONS],['read.image','command.image','chat.image','chat.commandUrl']);
 assert.equal(R106_CHAT_COMMAND_URL,'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app');
 assert.deepEqual(r106Migrations.map(name=>createHash('sha256').update(r106Files[name]).digest('hex')),['07d0ba6c5bd243789fac278bf15b0b1e50b5139282a30945af1dbe62a8497f49','a55e4fc948ebc726b6e75d67f646af7a0766559aaa77c459047f0c31256ac25c'],'V118 and V119 bytes are the reviewed ones (e57e77d, DEV-applied)');
 for(const [mutate,pattern] of [
  [x=>x.sql.baselineVersion=118,/R106 exact V117 to V119/],[x=>x.sql.migrations.pop(),/R106 exact V117 to V119/],[x=>x.sql.migrations[1].sha256='0'.repeat(64),/R106 migration source hash/],
  [x=>x.sql.verified.latestVersion='118',/R106 read-only V119 readback/],[x=>x.applied.sqlVersion=117,/R106 applied source/],[x=>x.applied.appliedAt='2026-10-31T03:00:39Z',/R106 applied source/],
  [x=>x.plan.counts={add:1,change:3,destroy:0},/R106 reviewed read, command and chat image plan with CHAT_COMMAND_URL/],[x=>x.plan.actions=[...R104_PLAN_ACTIONS],/R106 reviewed/],[x=>x.plan.actions.reverse(),/R106 reviewed/],
  [x=>x.plan.actions.push('chat.relayUrl'),/R106 reviewed/],[x=>x.plan.jsonSha256='0'.repeat(64),/R106 plan JSON export changed/],[x=>{delete x.plan.jsonPath},/R106 reviewed plan and its JSON export required/],
  [x=>x.applied.services.notify.image=x.build.image,/R106 unchanged notify must read back/],[x=>x.applied.services.chat.ready=false,/R106 ready service/],
  [x=>x.release='R104',/package kind/],[x=>x.schemaVersion=35,/package kind/],[x=>x.schemaVersion=36,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r106HostingPlan(candidate,{git}),pattern,String(mutate));}
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r106Marker(m,{release:'R104'}));await assert.rejects(r106HostingPlan(x,{git}),/R106 artifact release mismatch/);await setArtifact(m,'build-version.json',r106Marker(m));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r106HostingPlan(prepared,{git}),/R106 runtime apply\/readback/);assert.equal((await r106HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r104HostingPlan(m,{git}),/wrong R104 package kind/);assert.equal(await validateR106Sql(m,git),undefined);
 // Kind: R106 dispatches to its own row; the generic kind refuses an R106 package.
 assert.equal(hostingKind(m)?.kind,'R106');assert.equal(hostingKind({schemaVersion:36,kindRule:'generic-v1',release:'R106',scope:'runtime-workers-frontend'}),null);
 assert.equal(genericKindMatches({schemaVersion:36,kindRule:'generic-v1',release:'R106',scope:'runtime-workers-frontend'}),false);
 // Anything in the plan JSON beyond the three images and CHAT_COMMAND_URL on chat is refused.
 for(const [edit,pattern] of [
  [j=>{r106Change(j,'chat').after.template[0].containers[0].env.push({name:'CHAT_FEATURE',value:'on',value_source:[]});return j;},/R106 plan may add only CHAT_COMMAND_URL on chat: chat env adds CHAT_COMMAND_URL, CHAT_FEATURE/],
  [j=>{r106Change(j,'command').after.template[0].containers[0].env.push({name:'CHAT_COMMAND_URL',value:R106_CHAT_COMMAND_URL,value_source:[]});return j;},/R106 plan may add only CHAT_COMMAND_URL on chat: command env adds CHAT_COMMAND_URL/],
  [j=>{r106Change(j,'read').after.template[0].containers[0].env[0].value='loan_manager_dev';return j;},/R106 plan may add only CHAT_COMMAND_URL on chat: read env adds nothing, removes nothing, changes DB_NAME/],
  [j=>{r106Change(j,'chat').after.template[0].containers[0].env.splice(1,1);return j;},/chat env adds CHAT_COMMAND_URL, removes CHAT_MODELS_JSON/],
  [j=>{r106Change(j,'chat').after.template[0].containers[0].env.pop();return j;},/chat env adds nothing/],
  [j=>{r106Change(j,'chat').after.template[0].containers[0].env.at(-1).value='https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app';return j;},/R106 plan CHAT_COMMAND_URL must be exactly/],
  [j=>{r106Change(j,'chat').after.template[0].containers[0].env.at(-1).value_source=[{secret_key_ref:[{secret:'x',version:'1'}]}];return j;},/R106 plan CHAT_COMMAND_URL must be exactly/],
  [j=>{r106Change(j,'chat').after_unknown.template[0].containers[0].env[0].value=true;return j;},/R106 plan env unreadable on chat/],
  [j=>{r106Change(j,'read').after.template[0].timeout='300s';return j;},/R106 plan may change only the image \(and CHAT_COMMAND_URL on chat\): google_cloud_run_v2_service.runtime\["read"\] changes template.0.containers.0.image, template.0.timeout/],
  [j=>{const c=r106Change(j,'command');c.after.template[0].containers[0].image='old';return j;},/R106 plan may change only the image .*changes no image/],
  [j=>{const c=r106Change(j,'notify');Object.assign(c,{actions:['update'],before:{name:c.before.name,template:[{containers:[{image:'old',env:[]}]}]},after:{name:c.after.name,template:[{containers:[{image:'new',env:[]}]}]}});return j;},/R106 plan may update only the read, command and chat services, once each: google_cloud_run_v2_service.runtime\["notify"\]/],
  [j=>{j.resource_changes.push({address:'google_cloud_run_v2_service_iam_member.chat_command',type:'google_cloud_run_v2_service_iam_member',change:{actions:['create'],before:null,after:{}}});return j;},/R106 plan may update only the read, command and chat services, once each: google_cloud_run_v2_service_iam_member.chat_command/],
  [j=>{j.resource_changes=j.resource_changes.filter(x=>x.change.after?.name!=='mw-credit-app-command-prod');return j;},/R106 plan JSON must change read, command and chat \(it changes read, chat\)/]]){
  const x=structuredClone(m);await writePlanJson(x,root,r106PlanJson(edit),'r106-edited.json');await assert.rejects(r106HostingPlan(x,{git}),pattern,String(edit));}
});
test('R106 source descends from the R105 release with exactly V118, V119 and the four infrastructure/production files; the delivery commit may add only the runner, its test, the READMEs and documents',async t=>{
 const {m,source,tool}=await r106Package(t);
 assert.doesNotThrow(()=>validateR106Source(m,r106Git({source,tool})));
 // DEV infrastructure changes are not PROD inputs.
 assert.doesNotThrow(()=>validateR106Source(m,r106Git({source,tool,infra:[...r106Infra,'infrastructure/dev/chat-service.tf'].join('\n')})));
 for(const infra of [[...r106Infra,'infrastructure/production/runtime.tf'],[...r106Infra,'infrastructure/modules/cloud-run/main.tf'],r106Infra.slice(1),[]])
  assert.throws(()=>validateR106Source(m,r106Git({source,tool,infra:infra.join('\n')})),/R106 infrastructure changes must be exactly/,infra.join(','));
 for(const file of ['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','project/Documents/Release_Tracker.md','Change Logs/CHANGE_NOTES_R106_CHAT_WRITES_2026-10-30.md','database/README.md'])assert.doesNotThrow(()=>validateR106Source(m,r106Git({source,tool,delivery:file})),file);
 for(const file of ['infrastructure/production/chat-service.tf','services/chat/handler.mjs','database/migrations/V119__chat_proposal_groups.sql','database/current/public-functions.sql','apps/pwa/src/chat/ChatProposalCard.tsx'])assert.throws(()=>validateR106Source(m,r106Git({source,tool,delivery:file})),/R106 unverified delivery/,file);
 for(const migration of ['','database/migrations/V118__chat_proposals.sql',r106Added+'\ndatabase/migrations/V120__x.sql'])assert.throws(()=>validateR106Source(m,r106Git({source,tool,migration})),/R106 carries exactly the separately applied V119/,migration);
 assert.throws(()=>validateR106Source({...m,sourceBaseline:r104Baseline},r106Git({source,tool})),/R106 source\/baseline/);
 assert.throws(()=>validateR106Source(m,r106Git({source,tool,ancestors:{[r106Baseline]:r104Baseline}})),/R106 source must descend from the R105 release/);
});
test('R106 live readback: the R102 chat check unchanged plus CHAT_COMMAND_URL on chat only',async t=>{
 const {m,source,tool,image}=await r106Package(t),git=r106Git({source,tool});
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const relay={name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL},url={name:'CHAT_COMMAND_URL',value:R106_CHAT_COMMAND_URL};
 const good={image:pinned,models:r102Models,env:{chat:[relay,url]},vpc:{chat:r102ChatVpc}};
 const live=r074Readback(m);await verifyR106LivePackage(m,{token:'t',request:make(good),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 const row=hostingKind(m);assert.equal(row.operatorRelease(m),'R106');await row.live(m,{token:'t',request:make(good),readGithub:r074Readback(m).readGithub,git});
 for(const [edit,pattern] of [
  [{...good,env:{chat:[relay]}},/R106 live chat CHAT_COMMAND_URL must be/],[{...good,env:{chat:[relay,{...url,value:'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app'}]}},/R106 live chat CHAT_COMMAND_URL must be/],
  [{...good,env:{chat:[relay,url],command:[url]}},/R106 live command must carry no CHAT_COMMAND_URL/],[{...good,env:{chat:[relay,url],read:[url]}},/R106 live read must carry no CHAT_COMMAND_URL/],
  [{...good,env:{chat:[relay,url],jobs:[url]}},/R106 live jobs must carry no CHAT_COMMAND_URL/],
  [{...good,models:{...r102Models,default:'gemini-4-argon'}},/R106 live chat models must be Claude Opus 5.5/],[{...good,env:{chat:[url]}},/R106 live chat relay URL drift/],[{...good,vpc:{}},/R106 live chat private-range VPC egress required/]])
  await assert.rejects(verifyR106LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 // The R104 check is unchanged: an R104 package does not need (or look at) CHAT_COMMAND_URL.
 const r104=await r104Package(t),r104Pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,r104.m.rollback.services[role].image]));
 await verifyR104LivePackage(r104.m,{token:'t',request:chatLive(r104.m,r104.image).make({image:r104Pinned,models:r102Models,env:{chat:[relay]},vpc:{chat:r102ChatVpc}}),readGithub:r074Readback(r104.m).readGithub,git:r104Git({source:r104.source,tool:r104.tool})});
});

// R107 (request-based CPU): no migration (a read-only V119 readback), then new read, command and chat images; command and
// chat move cpu_idle from false to true; notify and jobs stay on their pins. The release carries exactly four
// infrastructure/production files. The plan JSON export is read back; the live readback is R106's with command and chat
// cpuIdle exactly true.
const r107Baseline='e57e77d764cdd3c4a9e21dd71d342e7628adb423';
const r107Infra=['infrastructure/production/runtime.tf','infrastructure/production/chat-service.tf','infrastructure/production/tests/inert.tftest.hcl','infrastructure/production/tests/chat-service.tftest.hcl'];
function r107Git({infra=r107Infra.join('\n'),migration='',...options}={}){
 const base=r090Git({migration,files:r106Files,baseline:r107Baseline,...options});
 return (root,args)=>{
  if(args[0]==='diff'&&args[2]===r107Baseline&&args[3]===options.source){
   const at=args.indexOf('--'),spec=at<0?null:args.slice(at+1);
   return nulNames(args,[...migration.split('\n'),...infra.split('\n')].filter(Boolean).filter(name=>!spec||spec.some(prefix=>name===prefix||name.startsWith(prefix+'/'))).join('\n'));
  }
  return base(root,args);
 };
}
const r107Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R107',...extra});
// The reviewed plan's JSON export: read, command and chat change their image; command and chat also set cpu_idle true.
const r107PlanJson=(edit=json=>json)=>edit({format_version:'1.2',resource_changes:[
 {address:'data.google_project.current',type:'google_project',change:{actions:['read'],before:null,after:{}}},
 ...['read','command','notify','jobs','chat'].map(role=>{
  const name=`mw-credit-app-${role}-prod`,env=[{name:'DB_NAME',value:'loan_manager_prod',value_source:[]}];
  const template=(image,cpuIdle)=>[{containers:[{image,env:structuredClone(env),resources:[{cpu_idle:cpuIdle,limits:{cpu:'1',memory:'512Mi'},startup_cpu_boost:true}]}],timeout:'60s'}];
  const address=role==='chat'?'google_cloud_run_v2_service.chat[0]':['notify','jobs'].includes(role)?`module.workers.google_cloud_run_v2_service.worker["${role}"]`:`google_cloud_run_v2_service.foundation["${role}"]`;
  if(!['read','command','chat'].includes(role))return {address,type:'google_cloud_run_v2_service',change:{actions:['no-op'],before:{name},after:{name}}};
  const was=role==='read';
  return {address,type:'google_cloud_run_v2_service',change:{actions:['update'],before:{name,etag:'1',template:template('old',was)},after:{name,etag:null,template:template('new',true)},after_unknown:{etag:true}}};
 })]});
const r107Change=(json,role)=>json.resource_changes.find(x=>x.change.after?.name===`mw-credit-app-${role}-prod`).change;
async function r107Package(t){
 const p=await r106Package(t),m=p.m;
 Object.assign(m,{schemaVersion:38,release:'R107',sourceBaseline:r107Baseline,
  sql:{baselineVersion:119,targetVersion:119,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'119',historyRows:119,allSuccessful:true,verifiedAt:'2026-11-01T03:01:00Z'}}});
 m.plan.counts={add:0,change:3,destroy:0};m.plan.actions=[...R107_PLAN_ACTIONS];await writePlanJson(m,p.root,r107PlanJson(),'r107-plan.json');
 m.applied.sqlVersion=119;m.applied.appliedAt='2026-11-01T03:20:00Z';
 await setArtifact(m,'build-version.json',r107Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R106"','"R107"'));
 return p;
}
test('R107 package validates: no migration, the three-image plan with cpu_idle false to true on command and chat read back from the plan JSON, ordering and kind',async t=>{
 const {m,source,tool,root}=await r107Package(t),git=r107Git({source,tool});
 assert.equal((await r107HostingPlan(m,{git})).site,site);
 assert.deepEqual([...R107_PLAN_ACTIONS],['read.image','command.image','command.cpuIdle','chat.image','chat.cpuIdle']);
 for(const [mutate,pattern] of [
  [x=>x.sql.verified.latestVersion='118',/R107 requires a read-only V119 readback/],[x=>x.sql.migrations.push({name:'V120__x.sql',sha256:'0'.repeat(64)}),/R107 requires a read-only V119/],[x=>x.sql.applied={},/R107 requires a read-only V119/],
  [x=>x.applied.sqlVersion=118,/R107 applied source/],[x=>x.applied.appliedAt='2026-11-01T03:00:59Z',/R107 applied source/],
  [x=>x.plan.counts={add:0,change:5,destroy:0},/R107 reviewed read, command and chat image plan with request-based CPU/],[x=>x.plan.actions=[...R106_PLAN_ACTIONS],/R107 reviewed/],[x=>x.plan.actions.reverse(),/R107 reviewed/],
  [x=>x.plan.actions.push('notify.image'),/R107 reviewed/],[x=>x.plan.jsonSha256='0'.repeat(64),/R107 plan JSON export changed/],[x=>{delete x.plan.jsonPath},/R107 reviewed plan and its JSON export required/],
  [x=>x.applied.services.notify.image=x.build.image,/R107 unchanged notify must read back/],[x=>x.applied.services.jobs.revision='mw-credit-app-jobs-prod-00099-new',/R107 unchanged jobs must read back/],[x=>x.applied.services.chat.ready=false,/R107 ready service/],
  [x=>x.release='R106',/package kind/],[x=>x.schemaVersion=37,/package kind/],[x=>x.schemaVersion=36,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r107HostingPlan(candidate,{git}),pattern,String(mutate));}
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r107Marker(m,{release:'R106'}));await assert.rejects(r107HostingPlan(x,{git}),/R107 artifact release mismatch/);await setArtifact(m,'build-version.json',r107Marker(m));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r107HostingPlan(prepared,{git}),/R107 runtime apply\/readback/);assert.equal((await r107HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r106HostingPlan(m,{git}),/wrong R106 package kind/);assert.equal(await validateR107Sql(m,git),undefined);
 // Kind: R107 dispatches to its own row; the generic kind refuses an R107 package.
 assert.equal(hostingKind(m)?.kind,'R107');assert.equal(hostingKind({schemaVersion:36,kindRule:'generic-v1',release:'R107',scope:'runtime-workers-frontend'}),null);
 assert.equal(genericKindMatches({schemaVersion:36,kindRule:'generic-v1',release:'R107',scope:'runtime-workers-frontend'}),false);
 // Anything in the plan JSON beyond the three images and cpu_idle false to true on command and chat is refused.
 const container=(j,role)=>r107Change(j,role).after.template[0].containers[0];
 for(const [edit,pattern] of [
  [j=>{container(j,'read').resources[0].cpu_idle=false;return j;},/R107 plan may change only the image \(and cpu_idle on command and chat\): google_cloud_run_v2_service.foundation\["read"\] changes template.0.containers.0.image, template.0.containers.0.resources.0.cpu_idle/],
  [j=>{container(j,'command').resources[0].cpu_idle=false;return j;},/R107 plan may change only the image .*foundation\["command"\] changes template.0.containers.0.image$/],
  [j=>{r107Change(j,'chat').before.template[0].containers[0].resources[0].cpu_idle=null;return j;},/R107 plan must move chat cpu_idle from false to true/],
  [j=>{container(j,'command').resources[0].limits.memory='1Gi';return j;},/R107 plan may change only the image .*command"\] changes .*resources.0.limits.memory/],
  [j=>{container(j,'chat').env.push({name:'CHAT_FEATURE',value:'on',value_source:[]});return j;},/R107 plan may change only the image .*chat\[0\] changes .*env/],
  [j=>{r107Change(j,'read').after.template[0].timeout='300s';return j;},/R107 plan may change only the image .*read"\] changes .*template.0.timeout/],
  [j=>{container(j,'read').image='old';return j;},/R107 plan may change only the image .*read"\] changes nothing/],
  // An unknown env or resources subtree would hide its changes from the diff: refused, as R106 refuses an unknown env.
  [j=>{const c=r107Change(j,'command');container(j,'command').env[0].value='other';c.after_unknown.template=[{containers:[{env:[{value:true}]}]}];return j;},/R107 plan env or resources unknown on command/],
  [j=>{r107Change(j,'chat').after_unknown.template=[{containers:[{resources:true}]}];return j;},/R107 plan env or resources unknown on chat/],
  [j=>{r107Change(j,'read').after_unknown.template=[{containers:[true]}];return j;},/R107 plan env or resources unknown on read/],
  [j=>{const c=r107Change(j,'notify');Object.assign(c,{actions:['update'],before:{name:c.before.name,template:[{containers:[{image:'old',env:[]}]}]},after:{name:c.after.name,template:[{containers:[{image:'new',env:[]}]}]}});return j;},/R107 plan may update only the read, command and chat services, once each: module.workers.google_cloud_run_v2_service.worker\["notify"\]/],
  [j=>{j.resource_changes.push({address:'google_cloud_run_v2_service_iam_member.x',type:'google_cloud_run_v2_service_iam_member',change:{actions:['create'],before:null,after:{}}});return j;},/R107 plan may update only the read, command and chat services, once each: google_cloud_run_v2_service_iam_member.x/],
  [j=>{j.resource_changes=j.resource_changes.filter(x=>x.change.after?.name!=='mw-credit-app-chat-prod');return j;},/R107 plan JSON must change read, command and chat \(it changes read, command\)/]]){
  const x=structuredClone(m);await writePlanJson(x,root,r107PlanJson(edit),'r107-edited.json');await assert.rejects(r107HostingPlan(x,{git}),pattern,String(edit));}
});
test('R107 source descends from the R106 release with no migration and exactly the four infrastructure/production files; the delivery commit may add only the runner, its test, the READMEs and documents',async t=>{
 const {m,source,tool}=await r107Package(t);
 assert.doesNotThrow(()=>validateR107Source(m,r107Git({source,tool})));
 assert.doesNotThrow(()=>validateR107Source(m,r107Git({source,tool,infra:[...r107Infra,'infrastructure/dev/chat-service.tf','infrastructure/dev/command-service.tf'].join('\n')})));
 for(const infra of [[...r107Infra,'infrastructure/production/README.md'],[...r107Infra,'infrastructure/modules/workers/main.tf'],r107Infra.slice(1),[]])
  assert.throws(()=>validateR107Source(m,r107Git({source,tool,infra:infra.join('\n')})),/R107 infrastructure changes must be exactly/,infra.join(','));
 for(const file of ['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','project/Documents/Release_Tracker.md','Change Logs/CHANGE_NOTES_R107_CLOUD_RUN_COST_2026-10-31.md'])assert.doesNotThrow(()=>validateR107Source(m,r107Git({source,tool,delivery:file})),file);
 for(const file of ['infrastructure/production/runtime.tf','services/notifications/postcommit.mjs','database/migrations/V120__x.sql','package-lock.json'])assert.throws(()=>validateR107Source(m,r107Git({source,tool,delivery:file})),/R107 unverified delivery/,file);
 assert.throws(()=>validateR107Source(m,r107Git({source,tool,migration:'database/migrations/V120__x.sql'})),/R107 carries no migration/);
 assert.throws(()=>validateR107Source({...m,sourceBaseline:r106Baseline},r107Git({source,tool})),/R107 source\/baseline/);
 assert.throws(()=>validateR107Source(m,r107Git({source,tool,ancestors:{[r107Baseline]:r106Baseline}})),/R107 source must descend from the R106 release/);
});
test('R107 live readback: R106\'s checks with command and chat cpuIdle exactly true; older kinds keep cpu_idle false',async t=>{
 const {m,source,tool,image}=await r107Package(t),git=r107Git({source,tool});
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const relay={name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL},url={name:'CHAT_COMMAND_URL',value:R106_CHAT_COMMAND_URL};
 const good={image:pinned,models:r102Models,env:{chat:[relay,url]},vpc:{chat:r102ChatVpc},commandCpuIdle:true,chatCpuIdle:true};
 const live=r074Readback(m);await verifyR107LivePackage(m,{token:'t',request:make(good),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 const row=hostingKind(m);assert.equal(row.operatorRelease(m),'R107');await row.live(m,{token:'t',request:make(good),readGithub:r074Readback(m).readGithub,git});
 for(const [edit,pattern] of [
  [{...good,commandCpuIdle:undefined},/R107 live command cpu_idle must be true/],[{...good,commandCpuIdle:false},/R107 live command cpu_idle must be true/],
  [{...good,chatCpuIdle:undefined},/R107 live chat timeout 300s and cpu_idle true required/],[{...good,chatCpuIdle:false},/R107 live chat timeout 300s and cpu_idle true required/],
  [{...good,env:{chat:[relay]}},/R107 live chat CHAT_COMMAND_URL must be/],[{...good,models:{...r102Models,default:'gemini-4-argon'}},/R107 live chat models must be Claude Opus 5.5/],
  [{...good,image:{...pinned,jobs:image}},/live service revision\/identity drift/]])
  await assert.rejects(verifyR107LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 // R106 described its own release: command and chat on instance-based CPU; an explicit true is still refused there.
 const r106=await r106Package(t),r106Good={image:Object.fromEntries(['notify','jobs'].map(role=>[role,r106.m.rollback.services[role].image])),models:r102Models,env:{chat:[relay,url]},vpc:{chat:r102ChatVpc}};
 const r106Options=edit=>({token:'t',request:chatLive(r106.m,r106.image).make(edit),readGithub:r074Readback(r106.m).readGithub,git:r106Git({source:r106.source,tool:r106.tool})});
 await verifyR106LivePackage(r106.m,r106Options(r106Good));
 await assert.rejects(verifyR106LivePackage(r106.m,r106Options({...r106Good,commandCpuIdle:true})),/R106 live command cpu_idle must be false/);
});

// R108 (Claude-only chat menu): no migration (a read-only V119 readback), then a new chat image with CHAT_MODELS_JSON
// listing exactly Claude Opus 5.5 (default); read, command, notify and jobs stay on their pins. The release carries exactly
// two infrastructure/production files. The plan JSON export is read back; the live readback is R107's with the
// Claude-only menu.
const r108Baseline='1befbb87fa4604262d799b13529a954c004c3ff3';
const r108Infra=['infrastructure/production/chat-service.tf','infrastructure/production/tests/chat-service.tftest.hcl'];
function r108Git({infra=r108Infra.join('\n'),migration='',...options}={}){
 const base=r090Git({migration,files:r106Files,baseline:r108Baseline,...options});
 return (root,args)=>{
  if(args[0]==='diff'&&args[2]===r108Baseline&&args[3]===options.source){
   const at=args.indexOf('--'),spec=at<0?null:args.slice(at+1);
   return nulNames(args,[...migration.split('\n'),...infra.split('\n')].filter(Boolean).filter(name=>!spec||spec.some(prefix=>name===prefix||name.startsWith(prefix+'/'))).join('\n'));
  }
  return base(root,args);
 };
}
const r108Marker=(m,extra={})=>JSON.stringify({schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release:'R108',...extra});
// The reviewed plan's JSON export: chat changes its image and its CHAT_MODELS_JSON value (the R102 list to Claude only).
const r108PlanJson=(edit=json=>json)=>edit({format_version:'1.2',resource_changes:[
 {address:'data.google_project.current',type:'google_project',change:{actions:['read'],before:null,after:{}}},
 ...['read','command','notify','jobs','chat'].map(role=>{
  const name=`mw-credit-app-${role}-prod`,address=role==='chat'?'google_cloud_run_v2_service.chat[0]':['notify','jobs'].includes(role)?`module.workers.google_cloud_run_v2_service.worker["${role}"]`:`google_cloud_run_v2_service.foundation["${role}"]`;
  if(role!=='chat')return {address,type:'google_cloud_run_v2_service',change:{actions:['no-op'],before:{name},after:{name}}};
  const env=models=>[{name:'DB_NAME',value:'loan_manager_prod',value_source:[]},{name:'CHAT_MODELS_JSON',value:JSON.stringify(models),value_source:[]},{name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL,value_source:[]}];
  const template=(image,models)=>[{containers:[{image,env:env(models),resources:[{cpu_idle:true,limits:{cpu:'1',memory:'512Mi'},startup_cpu_boost:true}]}],timeout:'300s'}];
  return {address,type:'google_cloud_run_v2_service',change:{actions:['update'],before:{name,etag:'1',template:template('old',r102Models)},after:{name,etag:null,template:template('new',r108Models)},after_unknown:{etag:true}}};
 })]});
const r108Chat=json=>json.resource_changes.find(x=>x.change.after?.name==='mw-credit-app-chat-prod').change;
async function r108Package(t){
 const p=await r107Package(t),m=p.m;
 Object.assign(m,{schemaVersion:39,release:'R108',sourceBaseline:r108Baseline,
  sql:{baselineVersion:119,targetVersion:119,migrations:[],verified:{database:'loan_manager_prod',latestVersion:'119',historyRows:119,allSuccessful:true,verifiedAt:'2026-11-02T03:01:00Z'}}});
 m.plan.counts={add:0,change:1,destroy:0};m.plan.actions=[...R108_PLAN_ACTIONS];await writePlanJson(m,p.root,r108PlanJson(),'r108-plan.json');
 // Only chat changes: the other four read back on their pinned image and revision.
 for(const role of ['read','command'])m.applied.services[role]={...m.applied.services[role],image:m.rollback.services[role].image,revision:m.rollback.services[role].revision};
 m.applied.sqlVersion=119;m.applied.appliedAt='2026-11-02T03:20:00Z';
 await setArtifact(m,'build-version.json',r108Marker(m));
 const bundle=await readFile(path.join(m.artifactRoot,'assets/test.js'),'utf8');await setArtifact(m,'assets/test.js',bundle.replace('"R107"','"R108"'));
 return p;
}
test('R108 package validates: no migration, the chat image and Claude-only CHAT_MODELS_JSON read back from the plan JSON, ordering and kind',async t=>{
 const {m,source,tool,root}=await r108Package(t),git=r108Git({source,tool});
 assert.equal((await r108HostingPlan(m,{git})).site,site);
 assert.deepEqual([...R108_PLAN_ACTIONS],['chat.image','chat.modelsJson']);assert.deepEqual([...R108_CHAT_MODEL_IDS],['claude-opus-5-5']);
 for(const [mutate,pattern] of [
  [x=>x.sql.verified.latestVersion='118',/R108 requires a read-only V119 readback/],[x=>x.sql.migrations.push({name:'V120__x.sql',sha256:'0'.repeat(64)}),/R108 requires a read-only V119/],
  [x=>x.applied.sqlVersion=118,/R108 applied source/],[x=>x.applied.appliedAt='2026-11-02T03:00:59Z',/R108 applied source/],
  [x=>x.plan.counts={add:0,change:3,destroy:0},/R108 reviewed chat image and Claude-only CHAT_MODELS_JSON plan/],[x=>x.plan.actions=['chat.image'],/R108 reviewed/],[x=>x.plan.actions.reverse(),/R108 reviewed/],
  [x=>x.plan.jsonSha256='0'.repeat(64),/R108 plan JSON export changed/],[x=>{delete x.plan.jsonPath},/R108 reviewed plan and its JSON export required/],
  [x=>x.applied.services.read.image=x.build.image,/R108 unchanged read must read back/],[x=>x.applied.services.command.revision='mw-credit-app-command-prod-00099-new',/R108 unchanged command must read back/],
  [x=>x.applied.services.chat.image=x.rollback.services.chat.image,/R108 ready service/],
  [x=>x.release='R107',/package kind/],[x=>x.schemaVersion=38,/package kind/],[x=>x.schemaVersion=36,/package kind/]]){const candidate=structuredClone(m);mutate(candidate);await assert.rejects(r108HostingPlan(candidate,{git}),pattern,String(mutate));}
 {const x=structuredClone(m);await setArtifact(x,'build-version.json',r108Marker(m,{release:'R107'}));await assert.rejects(r108HostingPlan(x,{git}),/R108 artifact release mismatch/);await setArtifact(m,'build-version.json',r108Marker(m));}
 const prepared={...structuredClone(m),status:'prepared'};await assert.rejects(r108HostingPlan(prepared,{git}),/R108 runtime apply\/readback/);assert.equal((await r108HostingPlan(prepared,{git,requireApplied:false})).site,site);
 await assert.rejects(r107HostingPlan(m,{git}),/wrong R107 package kind/);assert.equal(await validateR108Sql(m,git),undefined);
 assert.equal(hostingKind(m)?.kind,'R108');assert.equal(genericKindMatches({schemaVersion:36,kindRule:'generic-v1',release:'R108',scope:'runtime-workers-frontend'}),false);
 // Anything in the plan JSON beyond the chat image and a Claude-only CHAT_MODELS_JSON is refused.
 const env=(j,name)=>r108Chat(j).after.template[0].containers[0].env.find(x=>x.name===name);
 for(const [edit,pattern] of [
  [j=>{env(j,'CHAT_MODELS_JSON').value=JSON.stringify(r102Models);return j;},/R108 plan may change only CHAT_MODELS_JSON in the chat env: adds nothing, removes nothing, changes nothing/],
  [j=>{env(j,'CHAT_MODELS_JSON').value=JSON.stringify({...r108Models,models:[...r108Models.models,{id:'gemini-4-argon',label:'Gemini 4 Argon',available:true}]});return j;},/R108 plan CHAT_MODELS_JSON must list exactly Claude Opus 5.5/],
  [j=>{env(j,'CHAT_MODELS_JSON').value=JSON.stringify({...r108Models,maxRounds:12});return j;},/R108 plan CHAT_MODELS_JSON must list exactly Claude Opus 5.5/],
  // Only models and default may change: any other field differing from the value before is refused.
  [j=>{env(j,'CHAT_MODELS_JSON').value=JSON.stringify({...r108Models,historyTokenLimit:200000});return j;},/R108 plan CHAT_MODELS_JSON may change only models and default/],
  [j=>{env(j,'CHAT_MODELS_JSON').value=JSON.stringify({...r108Models,requestTimeoutSeconds:90});return j;},/R108 plan CHAT_MODELS_JSON may change only models and default/],
  [j=>{const c=r108Chat(j),before=c.before.template[0].containers[0].env.find(x=>x.name==='CHAT_MODELS_JSON');before.value=JSON.stringify({...r102Models,seedChars:20000});return j;},/R108 plan CHAT_MODELS_JSON may change only models and default/],
  [j=>{r108Chat(j).before.template[0].containers[0].env.find(x=>x.name==='CHAT_MODELS_JSON').value='not json';return j;},/R108 plan CHAT_MODELS_JSON may change only models and default/],
  [j=>{env(j,'CHAT_MODELS_JSON').value_source=[{secret_key_ref:[{secret:'x',version:'1'}]}];return j;},/R108 plan CHAT_MODELS_JSON must list exactly/],
  [j=>{env(j,'CHAT_RELAY_URL').value='http://10.148.0.9:8791/v1/chat/messages';return j;},/R108 plan may change only CHAT_MODELS_JSON in the chat env: adds nothing, removes nothing, changes CHAT_MODELS_JSON, CHAT_RELAY_URL/],
  [j=>{r108Chat(j).after.template[0].containers[0].env.push({name:'CHAT_FEATURE',value:'on',value_source:[]});return j;},/R108 plan may change only CHAT_MODELS_JSON in the chat env: adds CHAT_FEATURE/],
  [j=>{r108Chat(j).after.template[0].containers[0].resources[0].cpu_idle=false;return j;},/R108 plan may change only the chat image and CHAT_MODELS_JSON: .*resources.0.cpu_idle/],
  [j=>{r108Chat(j).after.template[0].containers[0].image='old';return j;},/R108 plan may change only the chat image .*changes no image/],
  [j=>{r108Chat(j).after_unknown.template=[{containers:[{env:[{},{value:true}]}]}];return j;},/R108 plan env or resources unknown on chat/],
  [j=>{const c=j.resource_changes.find(x=>x.change.after?.name==='mw-credit-app-read-prod').change;Object.assign(c,{actions:['update'],before:{name:c.before.name,template:[{containers:[{image:'old',env:[]}]}]},after:{name:c.after.name,template:[{containers:[{image:'new',env:[]}]}]}});return j;},/R108 plan may update only the chat service, once: google_cloud_run_v2_service.foundation\["read"\]/],
  [j=>{j.resource_changes=j.resource_changes.filter(x=>x.change.after?.name!=='mw-credit-app-chat-prod');return j;},/R108 plan JSON must change the chat service/]]){
  const x=structuredClone(m);await writePlanJson(x,root,r108PlanJson(edit),'r108-edited.json');await assert.rejects(r108HostingPlan(x,{git}),pattern,String(edit));}
});
test('R108 source descends from the R107 release with no migration and exactly the two infrastructure/production files',async t=>{
 const {m,source,tool}=await r108Package(t);
 assert.doesNotThrow(()=>validateR108Source(m,r108Git({source,tool})));
 assert.doesNotThrow(()=>validateR108Source(m,r108Git({source,tool,infra:[...r108Infra,'infrastructure/dev/chat-service.tf','infrastructure/dev/tests/chat-service.tftest.hcl'].join('\n')})));
 for(const infra of [[...r108Infra,'infrastructure/production/runtime.tf'],r108Infra.slice(1),[]])
  assert.throws(()=>validateR108Source(m,r108Git({source,tool,infra:infra.join('\n')})),/R108 infrastructure changes must be exactly/,infra.join(','));
 for(const file of ['scripts/promotion/README.md','scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs','project/Documents/Release_Tracker.md'])assert.doesNotThrow(()=>validateR108Source(m,r108Git({source,tool,delivery:file})),file);
 for(const file of ['infrastructure/production/chat-service.tf','services/chat/config.mjs','apps/pwa/src/chat/ChatWorkspace.tsx'])assert.throws(()=>validateR108Source(m,r108Git({source,tool,delivery:file})),/R108 unverified delivery/,file);
 assert.throws(()=>validateR108Source(m,r108Git({source,tool,migration:'database/migrations/V120__x.sql'})),/R108 carries no migration/);
 assert.throws(()=>validateR108Source(m,r108Git({source,tool,ancestors:{[r108Baseline]:r107Baseline}})),/R108 source must descend from the R107 release/);
});
test('R108 live readback: R107\'s checks with the chat menu exactly Claude Opus 5.5; R107 keeps its four-model rule',async t=>{
 const {m,source,tool,image}=await r108Package(t),git=r108Git({source,tool});
 const {make}=chatLive(m,image),pinned=Object.fromEntries(['read','command','notify','jobs'].map(role=>[role,m.rollback.services[role].image]));
 const relay={name:'CHAT_RELAY_URL',value:R102_CHAT_RELAY_URL},url={name:'CHAT_COMMAND_URL',value:R106_CHAT_COMMAND_URL};
 const good={image:pinned,models:r108Models,env:{chat:[relay,url]},vpc:{chat:r102ChatVpc},commandCpuIdle:true,chatCpuIdle:true};
 const live=r074Readback(m);await verifyR108LivePackage(m,{token:'t',request:make(good),readGithub:live.readGithub,git});assert.equal(live.calls.length,10);
 const row=hostingKind(m);assert.equal(row.operatorRelease(m),'R108');await row.live(m,{token:'t',request:make(good),readGithub:r074Readback(m).readGithub,git});
 for(const [edit,pattern] of [
  [{...good,models:r102Models},/R108 live chat models must be Claude Opus 5.5 only \(default\), available, with maxRounds 16/],
  [{...good,models:{...r108Models,models:[{...r108Models.models[0],available:false}]}},/R108 live chat models must be Claude Opus 5.5 only/],
  [{...good,env:{chat:[relay]}},/R108 live chat CHAT_COMMAND_URL must be/],[{...good,env:{chat:[url]}},/R108 live chat relay URL drift/],
  [{...good,chatCpuIdle:undefined},/R108 live chat timeout 300s and cpu_idle true required/],[{...good,image:{...pinned,read:image}},/live service revision\/identity drift/]])
  await assert.rejects(verifyR108LivePackage(m,{token:'t',request:make(edit),readGithub:r074Readback(m).readGithub,git}),pattern,JSON.stringify(edit));
 // R107 described its own release: the R102 four-model menu; the Claude-only menu is refused there.
 const r107=await r107Package(t),r107Good={image:Object.fromEntries(['notify','jobs'].map(role=>[role,r107.m.rollback.services[role].image])),models:r102Models,env:{chat:[relay,url]},vpc:{chat:r102ChatVpc},commandCpuIdle:true,chatCpuIdle:true};
 const r107Options=edit=>({token:'t',request:chatLive(r107.m,r107.image).make(edit),readGithub:r074Readback(r107.m).readGithub,git:r107Git({source:r107.source,tool:r107.tool})});
 await verifyR107LivePackage(r107.m,r107Options(r107Good));
 await assert.rejects(verifyR107LivePackage(r107.m,r107Options({...r107Good,models:r108Models})),/R107 live chat models must be Claude Opus 5.5 \(default\) and the three Gemini models/);
});
