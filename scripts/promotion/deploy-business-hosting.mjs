// Explicit owner-authorized business Hosting delivery. Foundation executor stays unchanged.
import {hostingHeaders} from '../hosting-headers.mjs';
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {OAuth2Client} from 'google-auth-library';
import {validateR053ApplicationReceipt} from './r053-candidate.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {validateR053Candidate} from './r053-candidate.mjs';
import {validateBusinessApplyReceipts} from './business-candidate.mjs';
import {verifyOperatorCredential} from '../production/deploy-foundation-hosting.mjs';
import {INSTANCE_NAMES,isSharedInstanceConnection} from '../../services/lib/identity.mjs';
import {loadStages,isRelevant,hashEntries,evidenceName,variantOf} from '../ci/reuse-evidence.mjs';

const project='clever-oasis-508610-n7',prodSite='mw-credit-prod-737787224638';
const admin=`mw-credit-unattended-admin@${project}.iam.gserviceaccount.com`;
const sha=value=>createHash('sha256').update(value).digest('hex');
const imagePattern=new RegExp(`^asia-southeast1-docker\\.pkg\\.dev/${project}/mw-credit-app-prod/api@sha256:[a-f0-9]{64}$`);
const requireValue=(ok,message)=>{if(!ok)throw Error('App-only promotion: '+message);};
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// The shared instance may be either allowlisted name (services/lib/identity.mjs); the manifest's own value is then the binding pin.
const sharedTarget=target=>isSharedInstanceConnection(target?.connectionName)?target.connectionName:'';
// NUL-separated (-z) output is returned untrimmed: a path may begin or end with whitespace.
function sourceGit(root,args){const r=spawnSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:4*1024*1024});requireValue(r.status===0,'source verification failed');return args[0]==='show'||args.includes('-z')?r.stdout:r.stdout.trim();}
// R074 name lists: --no-renames lists a moved path at both ends (a rename cannot hide the old path) and -z
// gives every path unquoted (git otherwise quotes non-ASCII, tab, quote and backslash names).
const strictNames=(git,root,from,to,pathspec)=>git(root,['diff','--name-only',from,to,'--no-renames','-z',...(pathspec?['--',...pathspec]:[])]).split('\0').filter(Boolean);

/** Separate current app-only contract; historical migration packages stay immutable. */
export async function appOnlyHostingPlan(m,{requireApplied=true}={}){
 requireValue(m?.schemaVersion===2&&m.release==='R059'&&m.environment==='prod'&&m.scope==='app-only'&&['prepared','applied'].includes(m.status),'wrong package kind');
 requireValue(!requireApplied||m.status==='applied','runtime apply/readback required');
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit,'exact immutable source required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(sourceGit(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit,'unknown source');
 requireValue(sourceGit(m.repoRoot,['diff','--name-only',m.sourceCommit,'--','apps','services','public','scripts/production','package.json','package-lock.json','vite.config.ts','Dockerfile'])==='','working runtime source drift');
 if(m.deliveryToolSource){requireValue(/^[a-f0-9]{40}$/.test(m.deliveryToolSource)&&sourceGit(m.repoRoot,['rev-parse','HEAD'])===m.deliveryToolSource,'delivery tool source mismatch');const changed=sourceGit(m.repoRoot,['diff','--name-only',m.sourceCommit,m.deliveryToolSource]).split('\n').filter(Boolean);requireValue(changed.every(p=>['scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs'].includes(p))&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,'unverified delivery-only correction');requireValue(sourceGit(m.repoRoot,['diff','--name-only',m.deliveryToolSource,'--','scripts/promotion'])==='','delivery tool working drift');}
 else requireValue(sourceGit(m.repoRoot,['diff','--name-only',m.sourceCommit,'--','scripts/promotion'])==='','delivery tool source drift');
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:sharedTarget(m.target),canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 requireValue(exact(m.sql,{baselineVersion:91,targetVersion:91,migrations:[]}),'app-only V91 requires no migration');
 validateR053ApplicationReceipt(m.applicationCi,m.sourceCommit);
 requireValue(m.applicationCi.run.conclusion==='success','successful full application CI required');
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,'PROD image provenance required');
 requireValue(/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&exact(m.plan.actions,['reader.image','command.image']),'reviewed two-image-only plan required');
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 for(const role of ['read','command','notify','jobs'])requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(recovery.services[role].revision??''),'service recovery pin required');
 if(m.status==='applied'){
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===91,'applied source/plan/database mismatch');
  for(const role of ['read','command']){const s=m.applied.services?.[role];requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(s.revision??''),'ready API readback required');}
  for(const role of ['notify','jobs'])requireValue(exact(m.applied.services?.[role],recovery.services[role]),'worker preservation required');
 }
 return validatedHostingArtifact(m,recovery);
}

// R075 (releaseInArtifact): build-version.json is the schemaVersion 1 marker plus `release` naming the package release
// (installed clients accept only schemaVersion 1 and ignore extra keys), and the entry bundle carries it.
async function validatedHostingArtifact(m,recovery,{release}={}){
 const root=await realpath(m.artifactRoot),contents=new Map(),files={},seen=new Set();let total=0;
 requireValue(Array.isArray(m.frontend?.files)&&m.frontend.files.length>=7&&m.frontend.files.length<=128,'bounded artifact manifest required');
 for(const f of m.frontend.files){
  requireValue(/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(f.path)&&!f.path.includes('..')&&/\.(js|css|html|webmanifest|png|svg|ico|json)$/.test(f.path)&&(!f.path.endsWith('.json')||['production-public-config.json','build-version.json','build-mode.json','firebase.json'].includes(f.path))&&!seen.has(f.path)&&/^[a-f0-9]{64}$/.test(f.sha256),'unsafe artifact');
  seen.add(f.path);const resolved=await realpath(path.join(root,f.path));requireValue(!path.relative(root,resolved).startsWith('..')&&!path.isAbsolute(path.relative(root,resolved)),'artifact escape');const stat=await lstat(resolved);requireValue(stat.isFile()&&stat.size<=32*1024*1024,'oversized artifact');const bytes=await readFile(resolved);total+=bytes.length;requireValue(total<=32*1024*1024&&sha(bytes)===f.sha256,'artifact bytes changed');const compressed=gzipSync(bytes),hash=sha(compressed);files['/'+f.path]=hash;contents.set(hash,compressed);
 }
 for(const f of ['index.html','production-public-config.json','build-version.json','build-mode.json','sw.js','manifest.webmanifest',m.frontend.entry?.slice(1)])requireValue(seen.has(f),'required asset missing');
 const read=async name=>readFile(path.join(root,name),'utf8');const config=JSON.parse(await read('production-public-config.json'));
 requireValue(config.environment==='prod'&&config.canonicalOrigin==='https://lm.mw-credit.com'&&config.notificationsEnabled===true&&config.firebase?.projectId===project&&config.readerOrigin==='https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app'&&config.commandOrigin==='https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app','wrong PROD public bindings');
 requireValue(config.firebase.authDomain===project+'.firebaseapp.com'&&/^AIza[A-Za-z0-9_-]{35}$/.test(config.firebase.apiKey??'')&&/^1:737787224638:web:[a-f0-9]+$/.test(config.firebase.appId??'')&&!Object.hasOwn(config.firebase,'tenantId'),'invalid shared PROD Firebase bindings');
 const marker=JSON.parse(await read('build-version.json'));
 requireValue(exact(JSON.parse(await read('build-mode.json')),{schemaVersion:1,mode:'live-prod'})&&(release||exact(marker,{schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry})),'marker/mode mismatch');
 if(release)requireValue(exact(marker,{schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry,release}),release+' artifact release mismatch');
 requireValue(/^[a-f0-9]{24}$/.test(m.frontend.publicVersion)&&/^\/assets\/[A-Za-z0-9_-]+\.js$/.test(m.frontend.entry),'invalid public marker');
 const worker=(await read('sw.js')).replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,''),html=(await read('index.html')).replace(/<!--[\s\S]*?-->/g,''),entry=await read(m.frontend.entry.slice(1));
 const versions=[...worker.matchAll(/^const VERSION\s*=\s*(['"])([^'"]+)\1;\s*$/gm)],prefixes=[...worker.matchAll(/^const PREFIX\s*=\s*(['"])([^'"]+)\1;\s*$/gm)],assets=[...worker.matchAll(/^const APP_ASSETS\s*=\s*(\[[^\r\n]+\]);\s*$/gm)];
 requireValue(versions.length===1&&versions[0][2]===m.frontend.publicVersion,'worker version mismatch');
 requireValue(prefixes.length===1&&prefixes[0][2]==='mw-credit-prod-public-'&&assets.length===1&&JSON.parse(assets[0][1]).includes(m.frontend.entry),'worker/index binding mismatch');
 requireValue([...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1[^>]*>/gi)].some(x=>x[2]===m.frontend.entry&&/\btype\s*=\s*(['"])module\1/i.test(x[0])),'active entry required');
 for(const value of [config.readerOrigin,config.commandOrigin,config.firebase.apiKey,config.firebase.appId])requireValue(typeof value==='string'&&value.length>0&&entry.includes(value),'compiled public config mismatch');
 if(release)requireValue(['"',"'",'`'].some(q=>entry.includes(q+release+q)),release+' artifact release mismatch');
 const headers=hostingHeaders('live-prod');
 return {site:prodSite,files,contents,headers,sourceCommit:m.sourceCommit,publicVersion:m.frontend.publicVersion,rollback:recovery};
}

const frontendBaseline='66af7a5bea4c69a108b0eee96d6386d6134cba47';
const deliveryFiles=['scripts/promotion/deploy-business-hosting.mjs','tests/unit/business-hosting-delivery.test.mjs'];
/** R061 is Hosting-only: its already-delivered API/SQL baseline may not change. */
export function validateFrontendSource(m,git=sourceGit){
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&m.sourceBaseline===frontendBaseline,'exact frontend source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit&&git(m.repoRoot,['merge-base',m.sourceBaseline,m.sourceCommit])===m.sourceBaseline,'frontend source must descend from deployed baseline');
 const changed=git(m.repoRoot,['diff','--name-only',m.sourceBaseline,m.sourceCommit]).split('\n').filter(Boolean);
 requireValue(changed.every(file=>/^(apps\/pwa\/|public\/|tests\/)/.test(file)||['index.html','vite.config.ts',...deliveryFiles].includes(file)),'frontend-only package changes API, SQL or other non-frontend inputs');
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,'delivery source mismatch');
 if(m.deliveryToolSource){const changes=git(m.repoRoot,['diff','--name-only',m.sourceCommit,tool]).split('\n').filter(Boolean);requireValue(changes.every(file=>deliveryFiles.includes(file))&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,'unverified delivery-only correction');}
 const inputs=['apps','packages','contracts','services','database','public','index.html','vite.config.ts','package.json','package-lock.json','.dockerignore','Dockerfile','.github','infrastructure','scripts','cloudbuild-command.yaml','cloudbuild-business.yaml','cloudbuild-foundation.yaml','tests'];
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--',...inputs])==='','working frontend/runtime/tool source drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...inputs])==='','untracked frontend/runtime/tool source');
}
export function validateFrontendCi(receipt,source){
 const r=receipt?.run;
 requireValue(r?.repository?.full_name==='welct0407/MW-Credit-App'&&r.path==='.github/workflows/ci.yml'&&r.head_sha===source&&r.event==='pull_request'&&r.status==='completed'&&r.conclusion==='success'&&Number.isSafeInteger(r.id)&&r.id>0,'successful exact-source PR CI required');
 const steps=(receipt.jobs??[]).flatMap(job=>job.steps??[]);
 for(const name of ['Run npm run check','Run npm run build:live-dev','Run npm audit --omit=dev --audit-level=moderate','Run terraform fmt -check -recursive infrastructure','Run terraform -chdir=infrastructure/dev init -backend=false','Run terraform -chdir=infrastructure/dev validate','Run terraform -chdir=infrastructure/dev-dns init -backend=false','Run terraform -chdir=infrastructure/dev-dns validate'])requireValue(steps.filter(step=>step.name===name).length===1&&steps.some(step=>step.name===name&&step.conclusion==='success'),'missing executed '+name);
 requireValue(steps.every(step=>!['failure','cancelled','timed_out','action_required'].includes(step.conclusion)),'unsuccessful CI step');
 const browser=steps.filter(step=>step.name==='Run npm run test:e2e');requireValue(browser.length===1&&['success','skipped'].includes(browser[0].conclusion),'actual browser step conclusion required');
 return {runId:r.id,browser:browser[0].conclusion};
}
export async function frontendOnlyHostingPlan(m){
 requireValue(m?.schemaVersion===3&&m.release==='R061'&&m.environment==='prod'&&m.scope==='frontend-only'&&m.status==='prepared','wrong frontend-only package kind');
 requireValue(!m.build&&!m.plan&&!m.sql&&!m.applied,'frontend-only package must not apply runtime or SQL changes');
 validateFrontendSource(m);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:sharedTarget(m.target),canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 validateFrontendCi(m.applicationCi,m.sourceCommit);
 const focused=m.focusedBrowser,e=focused?.evidence;
 requireValue(focused?.sourceCommit===m.sourceCommit&&focused.passed===12&&focused.failed===0&&focused.skipped===0&&Array.isArray(focused.commands)&&focused.commands.length===3&&focused.commands.every(command=>typeof command==='string'&&command.startsWith('npx playwright test tests/e2e/')),'explicit focused browser evidence required');
 requireValue(path.isAbsolute(e?.repository??'')&&e.path==='Documents/Development_Changes.md'&&/^[a-f0-9]{40}$/.test(e.commit??'')&&/^[a-f0-9]{64}$/.test(e.sha256??''),'immutable focused browser record required');
 const record=spawnSync('git',['-C',e.repository,'show',e.commit+':'+e.path],{maxBuffer:4*1024*1024});
 requireValue(record.status===0&&sha(record.stdout)===e.sha256&&record.stdout.toString('utf8').includes('R061'),'focused browser evidence changed');
 const recovery=m.rollbackHosting;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[A-Za-z0-9_-]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 return validatedHostingArtifact(m,recovery);
}
export async function verifyFrontendOnlyLivePackage(m,{readGithub}={}){
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'actual GitHub CI readback failed');return JSON.parse(r.stdout)});
 const id=m.applicationCi?.run?.id;requireValue(Number.isSafeInteger(id)&&id>0,'actual CI run id required');
 const run=await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}`]),jobs=await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}/jobs?per_page=100`]);
 return validateFrontendCi({run,jobs:jobs.jobs},m.sourceCommit);
}

const settingsBaseline='7bc94b1920f7a8f6033b5d8a641f254eb38b020a';
const settingsMigration='V92__editable_application_settings.sql';
const settingsDeliveryFiles=[...deliveryFiles,'scripts/database/r053-production-operator-cli.mjs','scripts/database/r053-operator-tooling.mjs','tests/unit/r053-operator-tooling.test.mjs','scripts/database/Backup-ProductionPromotion.py','scripts/database/Production-Transaction.ps1','scripts/database/Test-ProductionTransactionGuards.ps1','tests/unit/production-transaction-independent.ps1','tests/unit/r056-backup-maintenance.test.mjs','tests/unit/r053-backup-authority.test.mjs'];
const settingsRuntimeInputs=['apps','packages','contracts','services','database/migrations','public','index.html','vite.config.ts','package.json','package-lock.json','.dockerignore','Dockerfile','cloudbuild-command.yaml','cloudbuild-business.yaml','cloudbuild-foundation.yaml'];
/** R062 promotes a command image and V92; reader and workers retain their prior pins. */
export function validateSettingsSource(m,git=sourceGit){
 requireValue(m.sourceBaseline===settingsBaseline&&path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'R062 source roots/baseline required');
 for(const commit of [m.sourceCommit,m.artifactSourceCommit,m.build?.sourceCommit,m.deliveryToolSource??m.sourceCommit])requireValue(/^[a-f0-9]{40}$/.test(commit??'')&&git(m.repoRoot,['rev-parse',commit])===commit,'exact known R062 source required');
 requireValue(git(m.repoRoot,['merge-base',settingsBaseline,m.sourceCommit])===settingsBaseline,'R062 source ancestry required');
 for(const [commit,inputs]of [[m.artifactSourceCommit,['apps','packages','contracts','public','index.html','vite.config.ts','package.json','package-lock.json','scripts/production/build-business-candidate.mjs']],[m.build.sourceCommit,['services','Dockerfile','.dockerignore','package.json','package-lock.json','cloudbuild-business.yaml']]]){
  requireValue(git(m.repoRoot,['merge-base',commit,m.sourceCommit])===commit&&git(m.repoRoot,['diff','--name-only',commit,m.sourceCommit,'--',...inputs])==='','R062 artifact input parity required');
 }
 requireValue(git(m.repoRoot,['diff','--name-only',settingsBaseline,m.sourceCommit,'--','database/migrations'])==='database/migrations/'+settingsMigration,'R062 requires only immutable V92 migration');
 const tool=m.deliveryToolSource??m.sourceCommit;requireValue(git(m.repoRoot,['rev-parse','HEAD'])===tool,'R062 delivery source mismatch');
 if(tool!==m.sourceCommit){const changes=git(m.repoRoot,['diff','--name-only',m.sourceCommit,tool]).split('\n').filter(Boolean);requireValue(changes.every(file=>settingsDeliveryFiles.includes(file))&&m.deliveryToolChecks?.exitCode===0&&m.deliveryToolChecks.command==='node --test tests/unit/business-hosting-delivery.test.mjs tests/unit/r053-operator-tooling.test.mjs','R062 unverified delivery correction');}
 const inputs=[...settingsRuntimeInputs,'scripts','tests','.github','infrastructure'];
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--',...inputs])===''&&git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...inputs])==='','R062 working input drift');
}
async function settingsProof(ref){
 requireValue(path.isAbsolute(ref?.path??'')&&/^[a-f0-9]{64}$/.test(ref.sha256??''),'R062 absolute pinned evidence required');
 const stat=await lstat(ref.path);requireValue(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=4*1024*1024,'R062 unsafe evidence file');
 const bytes=await readFile(ref.path);requireValue(sha(bytes)===ref.sha256,'R062 evidence changed');return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
}
export function validateSettingsDatabaseCi(receipt,source){
 const r=receipt?.run,steps=(receipt?.jobs??[]).flatMap(job=>job.steps??[]);
 requireValue(receipt?.sourceCommit===source&&r?.repository?.full_name==='welct0407/MW-Credit-App'&&r.path==='.github/workflows/database.yml'&&r.head_sha===source&&['push','pull_request','workflow_dispatch'].includes(r.event)&&r.status==='completed'&&r.conclusion==='success'&&Number.isSafeInteger(r.id)&&r.id>0,'R062 successful exact-source database CI required');
 for(const name of ['Reject modifications to existing migrations','Verify transferred migration bytes','Rebuild and validate disposable database'])requireValue(steps.filter(step=>step.name===name).length===1&&steps.some(step=>step.name===name&&step.conclusion==='success'),'R062 missing executed '+name);
 requireValue(steps.every(step=>!['failure','cancelled','timed_out','action_required'].includes(step.conclusion)),'R062 failed database CI step');
 return {runId:r.id,conclusion:r.conclusion};
}
export async function settingsHostingPlan(m,{requireApplied=true,git=sourceGit}={}){
 requireValue(m?.schemaVersion===4&&m.release==='R062'&&m.environment==='prod'&&m.scope==='command-sql-frontend'&&['prepared','applied'].includes(m.status),'wrong R062 package kind');
 requireValue(!requireApplied||m.status==='applied','R062 runtime/SQL apply readback required');validateSettingsSource(m,git);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:sharedTarget(m.target),canonicalOrigin:'https://lm.mw-credit.com'}),'wrong R062 production target');
 validateFrontendCi(m.applicationCi,m.sourceCommit);
 const focused=m.focusedBrowser,e=focused?.evidence;
 requireValue(focused?.sourceCommit===m.sourceCommit&&Number.isSafeInteger(focused.passed)&&focused.passed>0&&focused.failed===0&&focused.skipped===0&&Array.isArray(focused.commands)&&focused.commands.length>0&&focused.commands.every(c=>typeof c==='string'&&c.startsWith('npx playwright test tests/e2e/')),'R062 executed focused browser evidence required');
 requireValue(path.isAbsolute(e?.repository??'')&&e.path==='Documents/Development_Changes.md'&&/^[a-f0-9]{40}$/.test(e.commit??'')&&/^[a-f0-9]{64}$/.test(e.sha256??''),'R062 immutable focused record required');
 const record=spawnSync('git',['-C',e.repository,'show',e.commit+':'+e.path],{maxBuffer:4*1024*1024});requireValue(record.status===0&&sha(record.stdout)===e.sha256&&record.stdout.toString('utf8').includes('R062'),'R062 focused record changed');
 requireValue(m.build?.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,'R062 PROD command provenance required');
 requireValue(exact(m.plan?.actions,['command.image'])&&/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&path.isAbsolute(m.plan.path??'')&&sha(await readFile(m.plan.path))===m.plan.sha256,'R062 reviewed command-only plan required');
 const sql=m.sql;requireValue(sql?.baselineVersion===91&&sql.targetVersion===92&&sql.migrations?.length===1&&sql.migrations[0].name===settingsMigration&&/^[a-f0-9]{64}$/.test(sql.migrations[0].sha256??''),'R062 exact V91 to V92 required');
 validateSettingsDatabaseCi(sql.checks,m.sourceCommit);
 const release=await settingsProof(sql.releaseManifest);
 requireValue(release.environment==='development'&&[m.sourceCommit,m.deliveryToolSource??m.sourceCommit].includes(release.commit)&&typeof release.validationReference==='string'&&release.validationReference.trim(),'R062 tested SQL release required');
 const migrationFiles=git(m.repoRoot,['ls-tree','-r','--name-only',m.sourceCommit,'--','database/migrations']).split('\n').filter(p=>p.endsWith('.sql')).sort();
 requireValue(Array.isArray(release.migrations)&&release.migrations.length===migrationFiles.length,'R062 complete migration manifest required');
 for(const file of migrationFiles){const pin=release.migrations.find(x=>x.name===path.posix.basename(file));requireValue(pin&&pin.sha256===sha(Buffer.from(git(m.repoRoot,['show',m.sourceCommit+':'+file]))),'R062 migration source hash mismatch');}
 requireValue(release.migrations.find(x=>x.name===settingsMigration)?.sha256===sql.migrations[0].sha256,'R062 V92 pin mismatch');
 const recovery=m.rollback;requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[A-Za-z0-9_-]+$/.test(recovery?.hostingRelease??''),'R062 Hosting recovery pins required');
 for(const role of ['read','command','notify','jobs'])requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(recovery.services[role].revision??''),'R062 service recovery pins required');
 if(m.status==='applied'){
  const a=sql.applied;requireValue(a?.environment==='production'&&a.database==='loan_manager_prod'&&INSTANCE_NAMES.includes(a.instance)&&a.sourceCommit===m.sourceCommit&&a.baselineVersion===91&&a.targetVersion===92&&a.migrationSha256===sql.migrations[0].sha256&&a.validationSuccessful===true&&a.migrationsExecuted===1&&typeof a.verifiedAt==='string'&&a.verifiedAt.endsWith('Z')&&Number.isFinite(Date.parse(a.verifiedAt)),'R062 actual SQL apply/validation required');
  const maintenance=await settingsProof(a.maintenanceRecord);
  requireValue(['authority-restored','authority-already-restored'].includes(a.restorationMode)&&maintenance.restoration?.mode===a.restorationMode&&maintenance.restoredAt&&maintenance.result?.restoreState?.context?.database==='loan_manager_prod'&&maintenance.result.restoreState.version===3,'R062 actual journal authority restoration required');
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===92,'R062 applied source/plan mismatch');
  const command=m.applied.services?.command;requireValue(command?.image===m.build.image&&command.ready===true&&command.trafficPercent===100&&/^mw-credit-app-command-prod-[0-9]+-[a-z0-9]+$/.test(command.revision??''),'R062 ready command readback required');
  for(const role of ['read','notify','jobs'])requireValue(exact(m.applied.services?.[role],recovery.services[role]),'R062 reader/worker preservation required');
 }
 return validatedHostingArtifact(m,recovery);
}
export async function verifySettingsLivePackage(m,{token,request=fetch,readGithub}={}){
 // Existing verifier rechecks the saved plan, Cloud Build digest/source and all four live identities.
 await verifyAppOnlyLivePackage(m,{token,request,readGithub,settings:true});
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'R062 database CI readback failed');return JSON.parse(r.stdout)});
 const id=m.sql.checks.run.id,run=await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}`]),jobs=await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}/jobs?per_page=100`]);
 validateSettingsDatabaseCi({sourceCommit:m.sourceCommit,run,jobs:jobs.jobs},m.sourceCommit);
}

// R063: one image for reader/command/notify/jobs, V92 unchanged, frontend with CSP headers.
const runtimeBaseline='2f63e3d1f907549cf1ccbd6cd4feb5f73310b6e1';
const runtimeRoles=['read','command','notify','jobs'];
const runtimeDeliveryAllowed=file=>deliveryFiles.includes(file)||/^project\/Documents\//.test(file)||/^Change Logs\//.test(file);
const runtimeInputs=['apps','packages','contracts','services','database','public','index.html','vite.config.ts','package.json','package-lock.json','.dockerignore','.gcloudignore','Dockerfile','cloudbuild-command.yaml','cloudbuild-business.yaml','scripts/hosting-headers.mjs','scripts/production','infrastructure/production','infrastructure/modules'];
// Each reused CI run must be input-equivalent to the pinned source for what it proves.
const runtimeCiKinds={
 full:{path:'.github/workflows/ci.yml',jobs:['check','e2e (shard 1 of 3)','e2e (shard 2 of 3)','e2e (shard 3 of 3)','terraform'],inputs:['apps','public','index.html','vite.config.ts','playwright.config.ts','tests/e2e','package.json','package-lock.json','infrastructure','scripts/hosting-headers.mjs']},
 check:{path:'.github/workflows/ci.yml',jobs:['check'],inputs:['apps','packages','contracts','services','public','index.html','vite.config.ts','package.json','package-lock.json','tsconfig.json','tsconfig.services.json','tsconfig.e2e.json','tests/unit','scripts']},
 database:{path:'.github/workflows/database.yml',jobs:['guards','rebuild (migrations)','rebuild (phase5)','rebuild (phase8)','rebuild (receiving)'],inputs:['database','services','tests/integration','scripts/database']},
};
export function validateRuntimeSource(m,git=sourceGit){
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&m.sourceBaseline===runtimeBaseline,'exact R063 source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit&&git(m.repoRoot,['merge-base',runtimeBaseline,m.sourceCommit])===runtimeBaseline,'R063 source must descend from the R062 release');
 requireValue(git(m.repoRoot,['diff','--name-only',runtimeBaseline,m.sourceCommit,'--','database/migrations'])==='','R063 carries no migration');
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,'R063 delivery source mismatch');
 if(tool!==m.sourceCommit){requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit,'R063 delivery source must descend from the pinned source');const changes=git(m.repoRoot,['diff','--name-only',m.sourceCommit,tool]).split('\n').filter(Boolean);requireValue(changes.every(runtimeDeliveryAllowed)&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,'R063 unverified delivery correction');}
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--',...runtimeInputs,'scripts/promotion'])==='','R063 working input drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...runtimeInputs,'scripts/promotion'])==='','R063 untracked input');
}
export function validateRuntimeCi(receipts,m,git=sourceGit){
 const result={};
 for(const [kind,rule] of Object.entries(runtimeCiKinds)){
  const r=receipts?.[kind]?.run,jobs=receipts?.[kind]?.jobs??[];
  requireValue(r?.repository?.full_name==='welct0407/MW-Credit-App'&&r.path===rule.path&&['push','pull_request','workflow_dispatch'].includes(r.event)&&r.status==='completed'&&r.conclusion==='success'&&Number.isSafeInteger(r.id)&&r.id>0&&/^[a-f0-9]{40}$/.test(r.head_sha??''),'R063 successful '+kind+' CI required');
  requireValue(git(m.repoRoot,['merge-base',r.head_sha,m.sourceCommit])===r.head_sha&&git(m.repoRoot,['diff','--name-only',r.head_sha,m.sourceCommit,'--',...rule.inputs])==='','R063 '+kind+' CI is not input-equivalent to the source');
  for(const name of rule.jobs)requireValue(jobs.filter(job=>job.name===name).length===1&&jobs.some(job=>job.name===name&&job.conclusion==='success'),'R063 '+kind+' CI missing executed '+name);
  result[kind]={runId:r.id,headSha:r.head_sha};
 }
 return result;
}
export async function runtimeHostingPlan(m,{requireApplied=true,git=sourceGit}={}){
 requireValue(m?.schemaVersion===5&&m.release==='R063'&&m.environment==='prod'&&m.scope==='runtime-workers-frontend'&&['prepared','applied'].includes(m.status),'wrong R063 package kind');
 requireValue(!requireApplied||m.status==='applied','R063 runtime apply/readback required');
 validateRuntimeSource(m,git);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:sharedTarget(m.target),canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 requireValue(m.sql?.baselineVersion===92&&m.sql.targetVersion===92&&exact(m.sql.migrations,[])&&m.sql.verified?.database==='loan_manager_prod'&&m.sql.verified.latestVersion==='92'&&m.sql.verified.allSuccessful===true,'R063 requires verified V92 with no migration');
 validateRuntimeCi(m.applicationCi,m,git);
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,'R063 PROD image provenance required');
 requireValue(/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&path.isAbsolute(m.plan.path??'')&&exact(m.plan.counts,{add:0,change:4,destroy:0})&&exact(m.plan.actions,['read.image','command.image','notify.image','jobs.image','notify.callerSubjects','jobs.callerSubjects']),'R063 reviewed four-service plan required');
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 for(const role of runtimeRoles)requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(recovery.services[role].revision??''),'service recovery pin required');
 if(m.status==='applied'){
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===92,'R063 applied source/plan/database mismatch');
  for(const role of runtimeRoles){const s=m.applied.services?.[role];requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(s.revision??'')&&s.revision!==recovery.services[role].revision,'R063 ready service readback required');}
 }
 return validatedHostingArtifact(m,recovery);
}
export async function verifyRuntimeLivePackage(m,{token,request=fetch,readGithub,git=sourceGit}={}){
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'actual GitHub CI readback failed');return JSON.parse(r.stdout)});
 // Plan file, Cloud Build digest/source, four live identities and database bindings.
 await verifyAppOnlyLivePackage(m,{token,request,readGithub,verifyCi:async()=>{
  const live={};for(const kind of Object.keys(runtimeCiKinds)){const id=m.applicationCi?.[kind]?.run?.id;requireValue(Number.isSafeInteger(id)&&id>0,'actual CI run id required');live[kind]={run:await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}`]),jobs:(await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}/jobs?per_page=100`])).jobs};}
  validateRuntimeCi(live,m,git);}});
 for(const role of ['notify','jobs']){
  const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');
  const env=Object.fromEntries(((await r.json()).template?.containers?.[0]?.env??[]).map(x=>[x.name,x.value]));let subjects;try{subjects=JSON.parse(env.WORKER_CALLER_SUBJECTS_JSON);}catch{subjects=null;}
  requireValue(subjects&&typeof subjects==='object'&&Object.keys(subjects).length>0&&Object.values(subjects).every(v=>/^[0-9]{10,30}$/.test(v)),'worker caller subjects required');
 }
}

// R064 (Wave 4): one image for reader/command/notify/jobs after the separately applied and
// verified V93; image-only plan (the R063 caller subjects stay as they are). The R064 sync
// correction adds only the reviewed command scaling and read/command startup CPU boost.
const waveBaseline='37f62121e9b04a163ebfa014e3240841b46d9a96';
const waveImageActions=['read.image','command.image','notify.image','jobs.image'];
const waveSyncActions=[...waveImageActions,'command.maxInstances','read.startupCpuBoost','command.startupCpuBoost'];
const waveMigration='database/migrations/V93__review_wave4_hygiene.sql';
export function validateWaveSource(m,git=sourceGit){
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&m.sourceBaseline===waveBaseline,'exact R064 source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit&&git(m.repoRoot,['merge-base',waveBaseline,m.sourceCommit])===waveBaseline,'R064 source must descend from the R063 release');
 requireValue(git(m.repoRoot,['diff','--name-only',waveBaseline,m.sourceCommit,'--','database/migrations'])===waveMigration,'R064 carries exactly the separately applied V93');
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,'R064 delivery source mismatch');
 if(tool!==m.sourceCommit){requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit,'R064 delivery source must descend from the pinned source');const changes=git(m.repoRoot,['diff','--name-only',m.sourceCommit,tool]).split('\n').filter(Boolean);requireValue(changes.every(runtimeDeliveryAllowed)&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,'R064 unverified delivery correction');}
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--',...runtimeInputs,'scripts/promotion'])==='','R064 working input drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...runtimeInputs,'scripts/promotion'])==='','R064 untracked input');
}
export function validateWaveCi(receipts,m,git=sourceGit,label='R064',allowed=runtimeDeliveryAllowed){
 const tool=m.deliveryToolSource??m.sourceCommit,result={};
 for(const [kind,rule] of Object.entries(runtimeCiKinds)){
  const r=receipts?.[kind]?.run,jobs=receipts?.[kind]?.jobs??[];
  requireValue(r?.repository?.full_name==='welct0407/MW-Credit-App'&&r.path===rule.path&&['push','pull_request','workflow_dispatch'].includes(r.event)&&r.status==='completed'&&r.conclusion==='success'&&Number.isSafeInteger(r.id)&&r.id>0&&/^[a-f0-9]{40}$/.test(r.head_sha??''),label+' successful '+kind+' CI required');
  // Either an ancestor with no covered input change, or the delivery-tool commit itself
  // (the pinned source plus only the runner, its unit test and documents).
  const delivery=r.head_sha===tool&&(tool===m.sourceCommit||git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit&&git(m.repoRoot,['diff','--name-only',m.sourceCommit,tool]).split('\n').filter(Boolean).every(allowed));
  requireValue(delivery||git(m.repoRoot,['merge-base',r.head_sha,m.sourceCommit])===r.head_sha&&git(m.repoRoot,['diff','--name-only',r.head_sha,m.sourceCommit,'--',...rule.inputs])==='',label+' '+kind+' CI is not input-equivalent to the source');
  for(const name of rule.jobs)requireValue(jobs.filter(job=>job.name===name).length===1&&jobs.some(job=>job.name===name&&job.conclusion==='success'),label+' '+kind+' CI missing executed '+name);
  result[kind]={runId:r.id,headSha:r.head_sha};
 }
 return result;
}
export async function waveHostingPlan(m,{requireApplied=true,git=sourceGit}={}){
 requireValue(m?.schemaVersion===6&&m.release==='R064'&&m.environment==='prod'&&m.scope==='runtime-workers-frontend'&&['prepared','applied'].includes(m.status),'wrong R064 package kind');
 requireValue(!requireApplied||m.status==='applied','R064 runtime apply/readback required');
 validateWaveSource(m,git);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 const v=m.sql?.verified;
 requireValue(m.sql?.baselineVersion===93&&m.sql.targetVersion===93&&exact(m.sql.migrations,[])&&v?.database==='loan_manager_prod'&&v.latestVersion==='93'&&v.allSuccessful===true&&typeof v.verifiedAt==='string'&&v.verifiedAt.endsWith('Z')&&Number.isFinite(Date.parse(v.verifiedAt)),'R064 requires verified V93 with no further migration');
 validateWaveCi(m.applicationCi,m,git);
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,'R064 PROD image provenance required');
 requireValue(/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&path.isAbsolute(m.plan.path??'')&&exact(m.plan.counts,{add:0,change:4,destroy:0})&&(exact(m.plan.actions,waveImageActions)||exact(m.plan.actions,waveSyncActions)),'R064 reviewed four-image plan required');
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 for(const role of runtimeRoles)requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(recovery.services[role].revision??''),'service recovery pin required');
 if(m.status==='applied'){
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===93,'R064 applied source/plan/database mismatch');
  for(const role of runtimeRoles){const s=m.applied.services?.[role];requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(s.revision??'')&&s.revision!==recovery.services[role].revision,'R064 ready service readback required');}
 }
 return validatedHostingArtifact(m,recovery);
}
export async function verifyWaveLivePackage(m,{token,request=fetch,readGithub,git=sourceGit,label='R064',allowed=runtimeDeliveryAllowed}={}){
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'actual GitHub CI readback failed');return JSON.parse(r.stdout)});
 await verifyAppOnlyLivePackage(m,{token,request,readGithub,verifyCi:async()=>{
  const live={};for(const kind of Object.keys(runtimeCiKinds)){const id=m.applicationCi?.[kind]?.run?.id;requireValue(Number.isSafeInteger(id)&&id>0,'actual CI run id required');live[kind]={run:await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}`]),jobs:(await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}/jobs?per_page=100`])).jobs};}
  validateWaveCi(live,m,git,label,allowed);}});
 for(const role of ['notify','jobs']){
  const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');
  const env=Object.fromEntries(((await r.json()).template?.containers?.[0]?.env??[]).map(x=>[x.name,x.value]));let subjects;try{subjects=JSON.parse(env.WORKER_CALLER_SUBJECTS_JSON);}catch{subjects=null;}
  requireValue(subjects&&typeof subjects==='object'&&Object.keys(subjects).length>0&&Object.values(subjects).every(v=>/^[0-9]{10,30}$/.test(v)),'worker caller subjects required');
 }
}

// R065, R066: Hosting-only releases on the unchanged R064 runtime (image, Terraform and V93 stay).
// R070 to R074: the same on the unchanged R069 runtime and V95. Each source descends from the previous
// release; runtime inputs are compared with the release whose runtime stays (runtime). R074 gates CI per job (perJobCi).
// R075 is a runtime + SQL release (below); it keeps R074's per-job CI gate and adds the release number built into the
// artifact (releaseInArtifact).
const r064Release='9420c8599ce593eeeaafc1e68a235ab3d1d08d8c',r069Release='9c4a4cb753c7874206b6b1d1e9d28fa87d66002c',r070Release='038b5c9f9f7d1ed368f8197973a523bb0cf5eab2',r071Release='cb333f5c0024f51c197a2b5527d833605ba5fb03',r072Release='378c34825501534e9ada30a4b1e78dce0ed6c7a3',r073Release='042359b585e132cb20e3f0785320c285addc7a1e',r074Release='b88653d4b84860b7eab622d0edfb472d851c03ce';
// R071 to R074: package.json may differ from the runtime in `scripts` alone (the image runs `npm ci --omit=dev`, no npm script),
// and database/ may change only in Markdown outside database/migrations.
const hostingOnlyReleases={R065:{schemaVersion:7,baseline:r064Release,runtime:r064Release,runtimeLabel:'R064',sqlVersion:93},R066:{schemaVersion:8,baseline:'74ad26b57dcfb9effea86d638b7d112cffe042c5',runtime:r064Release,runtimeLabel:'R064',sqlVersion:93},R070:{schemaVersion:11,baseline:r069Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95},R071:{schemaVersion:12,baseline:r070Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true},R072:{schemaVersion:13,baseline:r071Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true},R073:{schemaVersion:14,baseline:r072Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true},R074:{schemaVersion:15,baseline:r073Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true,perJobCi:true}};
// From R070 the delivery-tool commit may also carry this runner's README (as for R069).
const hostingOnlyDeliveryAllowed=L=>['R070','R071','R072','R073','R074'].includes(L)?file=>runtimeDeliveryAllowed(file)||file==='scripts/promotion/README.md':runtimeDeliveryAllowed;
const r065RuntimeInputs=['services','database','Dockerfile','.dockerignore','.gcloudignore','cloudbuild-command.yaml','cloudbuild-business.yaml','package.json','package-lock.json','infrastructure/production','infrastructure/modules'];
const withoutScripts=(git,root,commit)=>{let p;try{p=JSON.parse(git(root,['show',commit+':package.json']));}catch{p=null;}if(!p||typeof p!=='object'||Array.isArray(p))return null;const {scripts:_scripts,...rest}=p;return rest;};
// R074: per-job CI evidence. Each required job cites its own run; that run's head is the delivery-tool commit
// (as for validateWaveCi) or an ancestor of the source whose diff to the source touches no file relevant to the
// job's stage in scripts/ci/stages.json, the rule CI itself uses to reuse a job. `guards` is gated as database rebuild.
// Alternatively a stage job's entry names its stage-hash evidence artifact (scripts/ci/reuse-evidence.mjs): the name
// must be the source commit's own stage key and an unexpired same-repository artifact of that run at that head must
// carry it. Content equality is then the proof, so the head need not be an ancestor (a pull request run tested the
// synthetic merge; a squash or cherry-pick has another head). `guards` is no stage and has no evidence artifact.
const evidencePattern=/^evidence-[a-z0-9-]+-[a-f0-9]{64}(?:-[A-Za-z0-9]+)?$/;
const r074CiJobs={ci:{path:'.github/workflows/ci.yml',jobs:['check','e2e (shard 1 of 3)','e2e (shard 2 of 3)','e2e (shard 3 of 3)','terraform']},database:{path:'.github/workflows/database.yml',jobs:['guards','rebuild (migrations)','rebuild (receiving)','rebuild (phase5)','rebuild (phase8)']}};
const plainObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function validateR074Ci(receipts,m,git=sourceGit,label='R074',allowed=hostingOnlyDeliveryAllowed('R074')){
 const tool=m.deliveryToolSource??m.sourceCommit,runs=plainObject(receipts?.runs)?receipts.runs:{},memo=new Map(),result={};
 const once=(key,fn)=>{if(!memo.has(key))memo.set(key,fn());return memo.get(key);};
 const delivery=head=>head===tool&&once('tool',()=>tool===m.sourceCommit||git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit&&strictNames(git,m.repoRoot,m.sourceCommit,tool).every(allowed));
 // Files that differ from the source, or null when the head is not an ancestor of the source.
 const changed=head=>once('head:'+head,()=>git(m.repoRoot,['merge-base',head,m.sourceCommit])===head?strictNames(git,m.repoRoot,head,m.sourceCommit):null);
 // The source commit's tree (not HEAD or the delivery tool), untrimmed NUL-separated output.
 const tree=()=>once('tree',()=>git(m.repoRoot,['ls-tree','-r','-z','--full-tree',m.sourceCommit]));
 const artifacts=plainObject(receipts?.artifacts)?receipts.artifacts:{};
 for(const [kind,rule] of Object.entries(r074CiJobs)){
  const stages=loadStages(kind),map=receipts?.[kind]?.jobs;result[kind]={};
  requireValue(plainObject(map)&&exact(Object.keys(map).sort(),[...rule.jobs].sort()),label+' '+kind+' CI jobs must be exactly '+rule.jobs.join(', '));
  for(const name of rule.jobs){
   const at=label+' '+kind+' '+name+': ',{runId,headSha,evidence}=plainObject(map[name])?map[name]:{};
   const [stageName,stage]=name==='guards'?['rebuild',stages.rebuild]:Object.entries(stages).find(([,s])=>s.checks.includes(name))??[];requireValue(stage,at+'no CI stage covers this job');
   requireValue(Number.isSafeInteger(runId)&&runId>0&&/^[a-f0-9]{40}$/.test(headSha??''),at+'run id and head required');
   const receipt=Object.hasOwn(runs,String(runId))?runs[String(runId)]:undefined,r=receipt?.run,jobs=Array.isArray(receipt?.jobs)?receipt.jobs:[];
   requireValue(r?.id===runId&&r.head_sha===headSha,at+'cited run receipt missing or for another run or head');
   requireValue(r.repository?.full_name==='welct0407/MW-Credit-App'&&r.path===rule.path&&['push','pull_request','workflow_dispatch'].includes(r.event)&&r.status==='completed'&&r.conclusion==='success',at+'successful '+rule.path+' run required');
   if(evidence!==undefined){
    requireValue(name!=='guards',at+'guards has no stage evidence; cite an input-equivalent run');
    const expected=once(kind+'/'+name,()=>evidenceName(kind,stageName,hashEntries(kind,stageName,stage,tree()),variantOf(name)));
    requireValue(evidence===expected,at+'evidence name does not match the source stage hash');
    const list=Object.hasOwn(artifacts,expected)&&Array.isArray(artifacts[expected])?artifacts[expected]:[];
    requireValue(list.some(a=>a?.name===expected&&a.expired===false&&a.workflow_run?.id===runId&&a.workflow_run.head_sha===headSha&&Number.isSafeInteger(a.workflow_run.repository_id)&&a.workflow_run.head_repository_id===a.workflow_run.repository_id),at+'no unexpired same-repository evidence artifact of that run and head');
   }else{
    const files=delivery(headSha)?[]:changed(headSha);
    requireValue(files&&!files.some(file=>isRelevant(stage,file)),at+'run is not input-equivalent to the source');
   }
   requireValue(jobs.filter(job=>job?.name===name).length===1&&jobs.find(job=>job?.name===name).conclusion==='success',at+'missing executed job');
   result[kind][name]=evidence===undefined?{runId,headSha}:{runId,headSha,evidence};
  }
 }
 return result;
}
export function validateR065Source(m,git=sourceGit){return validateHostingOnlySource(m,git,'R065');}
export function validateHostingOnlySource(m,git=sourceGit,release=m?.release){
 const L=release,base=hostingOnlyReleases[L]?.baseline;requireValue(base,'unsupported Hosting-only release');
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&m.sourceBaseline===base,'exact '+L+' source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit&&git(m.repoRoot,['merge-base',base,m.sourceCommit])===base,L+' source must descend from the previous release');
 const {runtime,runtimeLabel,scriptsOnlyPackageJson,docsOnlyDatabaseMarkdown,perJobCi}=hostingOnlyReleases[L],unchanged=L+' must not change the '+runtimeLabel+' runtime, SQL or infrastructure';
 // R074 lists names with strictNames; R065 to R073 keep their original name-only diffs.
 const names=(from,to,pathspec)=>perJobCi?strictNames(git,m.repoRoot,from,to,pathspec):git(m.repoRoot,['diff','--name-only',from,to,...(pathspec?['--',...pathspec]:[])]).split('\n').filter(Boolean);
 const drift=pathspec=>perJobCi?git(m.repoRoot,['diff','--name-only',tool,'--no-renames','-z','--',...pathspec]):git(m.repoRoot,['diff','--name-only',tool,'--',...pathspec]);
 // R071 to R074: package.json is compared below; Markdown outside database/migrations is not a runtime input.
 const exempt=file=>(scriptsOnlyPackageJson&&file==='package.json')||(docsOnlyDatabaseMarkdown&&/^database\/(?!migrations\/).+\.md$/.test(file));
 requireValue(names(runtime,m.sourceCommit,r065RuntimeInputs).every(exempt),unchanged);
 if(scriptsOnlyPackageJson){const before=withoutScripts(git,m.repoRoot,runtime),after=withoutScripts(git,m.repoRoot,m.sourceCommit);requireValue(before&&after&&isDeepStrictEqual(before,after),unchanged+' (package.json outside scripts)');}
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,L+' delivery source mismatch');
 if(tool!==m.sourceCommit){requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit,L+' delivery source must descend from the pinned source');const changes=names(m.sourceCommit,tool);requireValue(changes.every(hostingOnlyDeliveryAllowed(L))&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,L+' unverified delivery correction');}
 requireValue(drift([...runtimeInputs,'scripts/promotion'])==='',L+' working input drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...runtimeInputs,'scripts/promotion'])==='',L+' untracked input');
}
export async function r065HostingPlan(m,{git=sourceGit}={}){return hostingOnlyPlan(m,{git,release:'R065'});}
export async function hostingOnlyPlan(m,{git=sourceGit,release=m?.release}={}){
 const L=release;
 requireValue(hostingOnlyReleases[L]&&m?.schemaVersion===hostingOnlyReleases[L].schemaVersion&&m.release===L&&m.environment==='prod'&&m.scope==='frontend-only'&&m.status==='prepared','wrong '+L+' package kind');
 requireValue(!m.build&&!m.plan&&!m.applied&&!m.activation,L+' package must not apply runtime or infrastructure changes');
 validateHostingOnlySource(m,git,L);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 const v=m.sql?.verified,V=hostingOnlyReleases[L].sqlVersion;
 requireValue(m.sql?.baselineVersion===V&&m.sql.targetVersion===V&&exact(m.sql.migrations,[])&&v?.database==='loan_manager_prod'&&v.latestVersion===String(V)&&v.allSuccessful===true&&typeof v.verifiedAt==='string'&&v.verifiedAt.endsWith('Z')&&Number.isFinite(Date.parse(v.verifiedAt)),L+' requires verified V'+V+' with no migration');
 if(hostingOnlyReleases[L].perJobCi)validateR074Ci(m.applicationCi,m,git,L,hostingOnlyDeliveryAllowed(L));else validateWaveCi(m.applicationCi,m,git,L,hostingOnlyDeliveryAllowed(L));
 for(const role of runtimeRoles)requireValue(imagePattern.test(m.runtime?.services?.[role]?.image??'')&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(m.runtime.services[role].revision??''),L+' unchanged runtime pins required');
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 return validatedHostingArtifact(m,recovery,{release:hostingOnlyReleases[L].releaseInArtifact?L:undefined});
}
export async function verifyR065LivePackage(m,options={}){return verifyHostingOnlyLivePackage(m,{...options,release:'R065'});}
// R074 per-job CI at apply: each distinct cited run is read once (run and jobs) and the package's job map is validated
// against the live receipts. Evidence artifacts are read live too; the package's artifact lists are not used here.
async function verifyPerJobCiLive(m,gh,git,label,allowed){
 const a=m.applicationCi,ids=[...new Set(Object.keys(r074CiJobs).flatMap(kind=>Object.values(plainObject(a?.[kind]?.jobs)?a[kind].jobs:{}).map(job=>job?.runId)))],runs={};
 requireValue(ids.length>0&&ids.every(id=>Number.isSafeInteger(id)&&id>0),'actual CI run ids required');
 for(const id of ids)runs[String(id)]={run:await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}`]),jobs:(await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}/jobs?per_page=100`])).jobs};
 const names=[...new Set(Object.keys(r074CiJobs).flatMap(kind=>Object.values(plainObject(a?.[kind]?.jobs)?a[kind].jobs:{}).map(job=>job?.evidence)).filter(x=>x!==undefined))],artifacts={};
 requireValue(names.every(x=>typeof x==='string'&&evidencePattern.test(x)),'evidence artifact names required');
 for(const x of names)artifacts[x]=(await gh(['api',`repos/welct0407/MW-Credit-App/actions/artifacts?name=${encodeURIComponent(x)}&per_page=20`])).artifacts;
 return validateR074Ci({runs,artifacts,ci:a.ci,database:a.database},m,git,label,allowed);
}
export async function verifyHostingOnlyLivePackage(m,{token,request=fetch,readGithub,git=sourceGit,release=m?.release}={}){
 const L=release;requireValue(hostingOnlyReleases[L],'unsupported Hosting-only release');
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'actual GitHub CI readback failed');return JSON.parse(r.stdout)});
 if(hostingOnlyReleases[L].perJobCi){
  await verifyPerJobCiLive(m,gh,git,L,hostingOnlyDeliveryAllowed(L));
 }else{
  const live={};for(const kind of Object.keys(runtimeCiKinds)){const id=m.applicationCi?.[kind]?.run?.id;requireValue(Number.isSafeInteger(id)&&id>0,'actual CI run id required');live[kind]={run:await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}`]),jobs:(await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}/jobs?per_page=100`])).jobs};}
  validateWaveCi(live,m,git,L,hostingOnlyDeliveryAllowed(L));
 }
 // The live runtime must still be exactly the pinned services (R064 for R065/R066, R069 for R070 to R074).
 for(const role of runtimeRoles){
  const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');
  const s=await r.json(),pin=m.runtime.services[role];
  requireValue(s.template?.containers?.[0]?.image===pin.image&&s.latestReadyRevision?.endsWith('/'+pin.revision)&&s.terminalCondition?.state==='CONDITION_SUCCEEDED',L+' live runtime differs from the pinned services');
 }
}

// R068 (Wave 5): one image for reader/command/notify/jobs after the separately applied and
// verified V94 and V95 (PROD 93 to 95); image-only plan. Source descends from the R067 release.
// The delivery-tool commit may also carry the reviewed PROD backup tool used for that SQL apply
// and this runner's README.
const r067Release='7f8ef5332be6b50988abca8efcf74a8657cd35a0';
const r068Migrations=['V94__job_run_contract_and_shared_lock_key.sql','V95__agent_role_session_pair.sql'];
const r068DeliveryAllowed=file=>runtimeDeliveryAllowed(file)||['scripts/database/Backup-ProductionPromotion.py','scripts/promotion/README.md'].includes(file);
const zulu=value=>typeof value==='string'&&value.endsWith('Z')&&Number.isFinite(Date.parse(value));
export function validateR068Source(m,git=sourceGit){
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&m.sourceBaseline===r067Release,'exact R068 source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit&&git(m.repoRoot,['merge-base',r067Release,m.sourceCommit])===r067Release,'R068 source must descend from the R067 release');
 requireValue(git(m.repoRoot,['diff','--name-only',r067Release,m.sourceCommit,'--','database/migrations'])===r068Migrations.map(name=>'database/migrations/'+name).join('\n'),'R068 carries exactly the separately applied V94 and V95');
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,'R068 delivery source mismatch');
 if(tool!==m.sourceCommit){requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit,'R068 delivery source must descend from the pinned source');const changes=git(m.repoRoot,['diff','--name-only',m.sourceCommit,tool]).split('\n').filter(Boolean);requireValue(changes.every(r068DeliveryAllowed)&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,'R068 unverified delivery correction');}
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--',...runtimeInputs,'scripts/promotion'])==='','R068 working input drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...runtimeInputs,'scripts/promotion'])==='','R068 untracked input');
}
async function sqlReleaseEvidence(ref,L){
 requireValue(path.isAbsolute(ref?.path??'')&&/^[a-f0-9]{64}$/.test(ref.sha256??''),L+' absolute pinned SQL release required');
 const stat=await lstat(ref.path);requireValue(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=4*1024*1024,L+' unsafe SQL release file');
 const bytes=await readFile(ref.path);requireValue(sha(bytes)===ref.sha256,L+' SQL release changed');return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
}
/** Separately applied PROD SQL: exact source migration bytes, the tested grouped release and the applied readback. */
async function validatePromotionSql(m,git,{label:L,baseline,target,migrations}){
 const sql=m.sql,range='V'+baseline+' to V'+target;
 requireValue(sql?.baselineVersion===baseline&&sql.targetVersion===target&&Array.isArray(sql.migrations)&&exact(sql.migrations.map(x=>x?.name),migrations),L+' exact '+range+' required');
 for(const pin of sql.migrations)requireValue(/^[a-f0-9]{64}$/.test(pin.sha256??'')&&pin.sha256===sha(Buffer.from(git(m.repoRoot,['show',m.sourceCommit+':database/migrations/'+pin.name]))),L+' migration source hash mismatch');
 const release=await sqlReleaseEvidence(sql.release,L),commit=sql.release.commit;
 requireValue(release.environment==='development'&&release.commit===commit&&/^[a-f0-9]{40}$/.test(commit??'')&&typeof release.validationReference==='string'&&release.validationReference.trim(),L+' tested SQL release required');
 requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,commit])===m.sourceCommit&&git(m.repoRoot,['diff','--name-only',m.sourceCommit,commit,'--','database'])==='',L+' SQL release must be the pinned source migrations');
 const t=release.productionTransaction;requireValue(t?.baselineVersion===baseline&&t.targetVersion===target&&t.group===true&&t.mixed===false&&t.executeInTransaction===true&&exact(t.callbacks,[]),L+' grouped '+range+' transaction required');
 const migrationFiles=git(m.repoRoot,['ls-tree','-r','--name-only',m.sourceCommit,'--','database/migrations']).split('\n').filter(p=>p.endsWith('.sql')).sort();
 requireValue(Array.isArray(release.migrations)&&release.migrations.length===migrationFiles.length,L+' complete migration manifest required');
 for(const file of migrationFiles){const pin=release.migrations.find(x=>x.name===path.posix.basename(file));requireValue(pin&&pin.sha256===sha(Buffer.from(git(m.repoRoot,['show',m.sourceCommit+':'+file]))),L+' migration manifest hash mismatch');}
 const a=sql.applied,v=sql.verified;
 requireValue(a?.environment==='production'&&a.database==='loan_manager_prod'&&m.target.connectionName.endsWith(':'+a.instance)&&a.releaseCommit===commit&&a.baselineVersion===baseline&&a.targetVersion===target&&a.migrationsExecuted===migrations.length&&zulu(a.startedAt)&&zulu(a.finishedAt)&&Date.parse(a.startedAt)<=Date.parse(a.finishedAt)&&/^[a-f0-9]{64}$/.test(a.backup?.dumpSha256??'')&&a.backup.restorePassed===true&&/^prod-promotion-[a-f0-9]{32}$/.test(a.backup.reference??''),L+' actual SQL apply and verified backup required');
 requireValue(v?.database==='loan_manager_prod'&&v.latestVersion===String(target)&&v.historyRows===target&&v.allSuccessful===true&&zulu(v.verifiedAt)&&Date.parse(v.verifiedAt)>=Date.parse(a.finishedAt),L+' read-only V'+target+' readback after the apply required');
}
/** V93 to V95: exact source migration bytes, the tested grouped release and the applied readback. */
export async function validateR068Sql(m,git=sourceGit){return validatePromotionSql(m,git,{label:'R068',baseline:93,target:95,migrations:r068Migrations});}
export async function r068HostingPlan(m,{requireApplied=true,git=sourceGit}={}){
 requireValue(m?.schemaVersion===9&&m.release==='R068'&&m.environment==='prod'&&m.scope==='runtime-workers-frontend'&&['prepared','applied'].includes(m.status),'wrong R068 package kind');
 requireValue(!requireApplied||m.status==='applied','R068 runtime apply/readback required');
 validateR068Source(m,git);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 await validateR068Sql(m,git);
 validateWaveCi(m.applicationCi,m,git,'R068',r068DeliveryAllowed);
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,'R068 PROD image provenance required');
 requireValue(/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&path.isAbsolute(m.plan.path??'')&&exact(m.plan.counts,{add:0,change:4,destroy:0})&&exact(m.plan.actions,waveImageActions),'R068 reviewed four-image plan required');
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 for(const role of runtimeRoles)requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&recovery.services[role].image!==m.build.image&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(recovery.services[role].revision??''),'service recovery pin required');
 if(m.status==='applied'){
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===95&&zulu(m.applied.appliedAt)&&Date.parse(m.applied.appliedAt)>=Date.parse(m.sql.applied.finishedAt),'R068 applied source/plan/database mismatch');
  for(const role of runtimeRoles){const s=m.applied.services?.[role];requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(s.revision??'')&&s.revision!==recovery.services[role].revision,'R068 ready service readback required');}
 }
 return validatedHostingArtifact(m,recovery);
}
export async function verifyR068LivePackage(m,options={}){return verifyWaveLivePackage(m,{...options,label:'R068',allowed:r068DeliveryAllowed});}

// R069: one image for reader/command/notify/jobs on the unchanged V95 (no migration); image-only
// plan. Source descends from the R068 release; the delivery-tool commit may also carry this README.
const r068Release='73a44200320135c2c135680b396f9ff8d64c9732';
const r069DeliveryAllowed=file=>runtimeDeliveryAllowed(file)||file==='scripts/promotion/README.md';
export function validateR069Source(m,git=sourceGit){
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&m.sourceBaseline===r068Release,'exact R069 source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit&&git(m.repoRoot,['merge-base',r068Release,m.sourceCommit])===r068Release,'R069 source must descend from the R068 release');
 requireValue(git(m.repoRoot,['diff','--name-only',r068Release,m.sourceCommit,'--','database/migrations'])==='','R069 carries no migration');
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,'R069 delivery source mismatch');
 if(tool!==m.sourceCommit){requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit,'R069 delivery source must descend from the pinned source');const changes=git(m.repoRoot,['diff','--name-only',m.sourceCommit,tool]).split('\n').filter(Boolean);requireValue(changes.every(r069DeliveryAllowed)&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,'R069 unverified delivery correction');}
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--',...runtimeInputs,'scripts/promotion'])==='','R069 working input drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...runtimeInputs,'scripts/promotion'])==='','R069 untracked input');
}
export async function r069HostingPlan(m,{requireApplied=true,git=sourceGit}={}){
 requireValue(m?.schemaVersion===10&&m.release==='R069'&&m.environment==='prod'&&m.scope==='runtime-workers-frontend'&&['prepared','applied'].includes(m.status),'wrong R069 package kind');
 requireValue(!requireApplied||m.status==='applied','R069 runtime apply/readback required');
 validateR069Source(m,git);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 const v=m.sql?.verified;
 requireValue(m.sql?.baselineVersion===95&&m.sql.targetVersion===95&&exact(m.sql.migrations,[])&&v?.database==='loan_manager_prod'&&v.latestVersion==='95'&&v.historyRows===95&&v.allSuccessful===true&&zulu(v.verifiedAt),'R069 requires verified V95 with no migration');
 validateWaveCi(m.applicationCi,m,git,'R069',r069DeliveryAllowed);
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,'R069 PROD image provenance required');
 requireValue(/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&path.isAbsolute(m.plan.path??'')&&exact(m.plan.counts,{add:0,change:4,destroy:0})&&exact(m.plan.actions,waveImageActions),'R069 reviewed four-image plan required');
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 for(const role of runtimeRoles)requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&recovery.services[role].image!==m.build.image&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(recovery.services[role].revision??''),'service recovery pin required');
 if(m.status==='applied'){
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===95&&zulu(m.applied.appliedAt),'R069 applied source/plan/database mismatch');
  for(const role of runtimeRoles){const s=m.applied.services?.[role];requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(s.revision??'')&&s.revision!==recovery.services[role].revision,'R069 ready service readback required');}
 }
 return validatedHostingArtifact(m,recovery);
}
export async function verifyR069LivePackage(m,options={}){return verifyWaveLivePackage(m,{...options,label:'R069',allowed:r069DeliveryAllowed});}

// R075: one new image for reader/command/notify/jobs after the separately applied and verified V96 (PROD 95 to 96,
// manual payment command v7). The PROD plan changes the four services in place: the four images, and on the command
// service only, Direct VPC egress (private ranges, default network/subnet) plus PROD_RECEIPT_RECOGNITION and
// PROD_RECEIPT_RECOGNITION_URL (infrastructure/production/receipt-recognizer.tf and runtime.tf). The activation value
// is pinned by the package and read back live. Source descends from the R074 release; CI is R074's per-job gate; the
// artifact carries the release number (R075 marker). The delivery-tool commit may also carry this README and the
// reviewed PROD backup tool, as for R068.
const r075Migrations=['V96__manual_payment_command_v7_bank_reference.sql'];
const r075DeliveryAllowed=file=>runtimeDeliveryAllowed(file)||['scripts/database/Backup-ProductionPromotion.py','scripts/promotion/README.md'].includes(file);
const r075PlanActions=[...waveImageActions,'command.vpcAccess','command.receiptRecognition','command.receiptRecognitionUrl'];
export const R075_RECOGNIZER_URL='http://10.148.0.2:8790/v1/receipt-recognition';
export function validateR075Source(m,git=sourceGit){
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&m.sourceBaseline===r074Release,'exact R075 source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit&&git(m.repoRoot,['merge-base',r074Release,m.sourceCommit])===r074Release,'R075 source must descend from the R074 release');
 requireValue(exact(strictNames(git,m.repoRoot,r074Release,m.sourceCommit,['database/migrations']),r075Migrations.map(name=>'database/migrations/'+name)),'R075 carries exactly the separately applied V96');
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,'R075 delivery source mismatch');
 if(tool!==m.sourceCommit){requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit,'R075 delivery source must descend from the pinned source');requireValue(strictNames(git,m.repoRoot,m.sourceCommit,tool).every(r075DeliveryAllowed)&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,'R075 unverified delivery correction');}
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--no-renames','-z','--',...runtimeInputs,'scripts/promotion'])==='','R075 working input drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...runtimeInputs,'scripts/promotion'])==='','R075 untracked input');
}
export async function validateR075Sql(m,git=sourceGit){return validatePromotionSql(m,git,{label:'R075',baseline:95,target:96,migrations:r075Migrations});}
export async function r075HostingPlan(m,{requireApplied=true,git=sourceGit}={}){
 requireValue(m?.schemaVersion===17&&m.release==='R075'&&m.environment==='prod'&&m.scope==='runtime-workers-frontend'&&['prepared','applied'].includes(m.status),'wrong R075 package kind');
 requireValue(!requireApplied||m.status==='applied','R075 runtime apply/readback required');
 validateR075Source(m,git);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 await validateR075Sql(m,git);
 validateR074Ci(m.applicationCi,m,git,'R075',r075DeliveryAllowed);
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,'R075 PROD image provenance required');
 requireValue(exact(m.recognition,{activation:m.recognition?.activation,url:R075_RECOGNIZER_URL})&&['disabled','enabled'].includes(m.recognition.activation),'R075 pinned receipt recognition wiring required');
 requireValue(/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&path.isAbsolute(m.plan.path??'')&&exact(m.plan.counts,{add:0,change:4,destroy:0})&&exact(m.plan.actions,r075PlanActions),'R075 reviewed four-service image and recognizer plan required');
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 for(const role of runtimeRoles)requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&recovery.services[role].image!==m.build.image&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(recovery.services[role].revision??''),'service recovery pin required');
 if(m.status==='applied'){
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===96&&zulu(m.applied.appliedAt)&&Date.parse(m.applied.appliedAt)>=Date.parse(m.sql.applied.finishedAt),'R075 applied source/plan/database mismatch');
  for(const role of runtimeRoles){const s=m.applied.services?.[role];requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(s.revision??'')&&s.revision!==recovery.services[role].revision,'R075 ready service readback required');}
 }
 return validatedHostingArtifact(m,recovery,{release:'R075'});
}
/** Live: per-job CI, Cloud Build, the four identities, worker subjects and the command-only recognizer wiring. */
export async function verifyR075LivePackage(m,{token,request=fetch,readGithub,git=sourceGit}={}){
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'actual GitHub CI readback failed');return JSON.parse(r.stdout)});
 await verifyAppOnlyLivePackage(m,{token,request,readGithub,verifyCi:()=>verifyPerJobCiLive(m,gh,git,'R075',r075DeliveryAllowed)});
 const named=(value,kind)=>value==='default'||(typeof value==='string'&&value.endsWith('/'+kind+'/default'));
 for(const role of runtimeRoles){
  const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');
  const s=await r.json(),env=Object.fromEntries((s.template?.containers?.[0]?.env??[]).map(x=>[x.name,x.value])),vpc=s.template?.vpcAccess;
  if(['notify','jobs'].includes(role)){let subjects;try{subjects=JSON.parse(env.WORKER_CALLER_SUBJECTS_JSON);}catch{subjects=null;}requireValue(subjects&&typeof subjects==='object'&&Object.keys(subjects).length>0&&Object.values(subjects).every(v=>/^[0-9]{10,30}$/.test(v)),'worker caller subjects required');}
  if(role==='command'){
   requireValue(env.PROD_RECEIPT_RECOGNITION===m.recognition.activation&&env.PROD_RECEIPT_RECOGNITION_URL===R075_RECOGNIZER_URL&&(m.recognition.activation==='disabled'||env.PROD_RECEIPTS==='enabled'),'R075 live command recognizer setting drift');
   const nics=vpc?.networkInterfaces??[];requireValue(vpc?.egress==='PRIVATE_RANGES_ONLY'&&nics.length===1&&named(nics[0].network,'networks')&&named(nics[0].subnetwork,'subnetworks')&&!vpc.connector,'R075 live command VPC egress drift');
  }else requireValue(!vpc&&!Object.keys(env).some(name=>name.startsWith('PROD_RECEIPT_RECOGNITION')),'R075 recognizer wiring outside the command service');
 }
}

/** Verify the supplied token itself and a signed, audience-bound impersonation proof. */
export async function verifyAppOnlyOperator({token,impersonationToken=token,release='R059',request=fetch,verifyIdToken=async(idToken,audience)=>(await new OAuth2Client().verifyIdToken({idToken,audience})).getPayload()}){
 requireValue(typeof token==='string'&&token.length>0,'operator token required');
 const call=async(url,body)=>{const r=await request(url,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+(body?impersonationToken:token),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});requireValue(r.ok,'operator verification failed');return r.json();};
 const identity=await call('https://oauth2.googleapis.com/tokeninfo?access_token='+encodeURIComponent(token));requireValue(Number(identity.expires_in)>0,'expired access token');
 const service=await call(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${admin}`);requireValue(service.email===admin&&service.projectId===project&&/^\d+$/.test(service.uniqueId??''),'wrong impersonated service account');
 requireValue(identity.email===admin||(!identity.email&&identity.aud===service.oauth2ClientId&&identity.azp===service.oauth2ClientId&&service.oauth2ClientId===service.uniqueId),'wrong access-token principal');
 requireValue(['R059','R061','R062','R063','R064','R065','R066','R068','R069','R070','R071','R072','R073','R074','R075'].includes(release),'unsupported operator release');const audience='https://lm.mw-credit.com/promotion/'+release.toLowerCase();const signed=await call(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${admin}:generateIdToken`,{audience,includeEmail:true});const proof=await verifyIdToken(signed.token,audience);requireValue(proof?.email===admin&&proof.email_verified===true&&proof.sub===service.uniqueId&&proof.aud===audience,'wrong signed impersonation proof');
 for(const site of [prodSite,'mw-credit-app-dev-737787224638'])requireValue((await call(`https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites/${site}`)).name===`projects/${project}/sites/${site}`,'wrong live Hosting target');
 return {operator:admin,verification:'token principal and signed impersonation proof'};
}

export async function verifyAppOnlyLivePackage(m,{token,request=fetch,readGithub,settings=false,verifyCi}){
 requireValue(path.isAbsolute(m.plan.path??'')&&sha(await readFile(m.plan.path))===m.plan.sha256,'saved plan changed');
 const get=async url=>{const r=await request(url,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');return r.json();};
 const build=await get(`https://cloudbuild.googleapis.com/v1/projects/${project}/locations/asia-southeast1/builds/${encodeURIComponent(m.build.id)}`);
 requireValue(build.status==='SUCCESS'&&build.results?.images?.some(image=>image.name.startsWith(`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api:`)&&m.build.image.endsWith('@'+image.digest)),'live build digest mismatch');
 requireValue(exact(build.source?.storageSource,m.build.storageSource)&&typeof m.build.storageSource?.generation==='string'&&typeof m.build.storageSource?.bucket==='string'&&typeof m.build.storageSource?.object==='string','exact CloudBuild source object required');
 for(const role of ['read','command','notify','jobs']){
  const s=await get(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`),expected=m.applied.services[role];
  const env=Object.fromEntries((s.template?.containers?.[0]?.env??[]).map(x=>[x.name,x.value]));
  requireValue(s.name===`projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`&&s.template?.serviceAccount===`mw-credit-app-${role}-prod@${project}.iam.gserviceaccount.com`&&s.template.containers[0].image===expected.image&&s.latestReadyRevision?.endsWith('/'+expected.revision)&&s.terminalCondition?.state==='CONDITION_SUCCEEDED'&&s.trafficStatuses?.length===1&&s.trafficStatuses[0].percent===100&&s.trafficStatuses[0].revision===expected.revision,'live service revision/identity drift');
  requireValue(env.DB_NAME==='loan_manager_prod'&&env.INSTANCE_CONNECTION_NAME===m.target.connectionName&&env.DB_USER===`mw-credit-app-${role}-prod@${project}.iam`,'live database binding drift');
  if(role==='command')requireValue(env.PWA_NOTIFICATIONS==='enabled','notification setting drift');
 }
 if(verifyCi)return verifyCi();
 const id=m.applicationCi.run.id;requireValue(Number.isSafeInteger(id)&&id>0,'actual CI run id required');
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'actual GitHub CI readback failed');return JSON.parse(r.stdout);});
 const run=await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}`]),jobs=await gh(['api',`repos/welct0407/MW-Credit-App/actions/runs/${id}/jobs?per_page=100`]);
 if(settings)validateFrontendCi({run,jobs:jobs.jobs},m.sourceCommit);else validateR053ApplicationReceipt({run,jobs:jobs.jobs},m.sourceCommit);requireValue(run.conclusion==='success','actual CI success required');
}

export async function businessHostingPlan(prepared,applied,receipts,options){
 if(prepared.release==='R053'||applied.release==='R053'){
  if(prepared.release!=='R053'||applied.release!=='R053'||prepared.status!=='prepared'||applied.status!=='applied')throw Error('Coherent R053 prepared/applied package required');
  await validateR053Candidate(prepared,options.preparedOptions);await validateR053Candidate(applied,options.appliedOptions);
  const strip=m=>({...m,status:undefined,evidence:{...m.evidence,appliedSha256:undefined}});
  if(JSON.stringify(strip(prepared))!==JSON.stringify(strip(applied)))throw Error('R053 prepared package drift');
 }else await validateBusinessApplyReceipts(prepared,applied,receipts,options);
 const r053=applied.release==='R053',site=r053?applied.target.site:applied.target.hosting.site;
 if(site!=='mw-credit-prod-737787224638')throw Error('Wrong fixed production Hosting site');
 const contents=new Map(),files={};
 for(const file of (r053?applied.frontend.files:applied.artifacts.frontend.files)){
  const bytes=await readFile(path.join(options.appliedOptions.artifactRoot,file.path));
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Artifact changed after validation');
  const compressed=gzipSync(bytes),hash=createHash('sha256').update(compressed).digest('hex');
  files['/'+file.path]=hash;contents.set(hash,compressed);
 }
 const headers=hostingHeaders('live-prod');
 return {site,files,contents,headers,sourceCommit:applied.sourceCommit,publicVersion:r053?applied.frontend.publicVersion:applied.artifacts.frontend.publicVersion};
}

export async function executeBusinessHosting(plan,{request,approvalReference}){
 if(!approvalReference?.trim())throw Error('Explicit owner promotion approval required');
 if(plan.site!=='mw-credit-prod-737787224638')throw Error('Wrong fixed production Hosting site');
 const api='https://firebasehosting.googleapis.com/v1beta1/';
 if(plan.rollback){const current=await request(api+'sites/'+plan.site+'/releases?pageSize=1','GET');requireValue(current.releases?.[0]?.version?.name===plan.rollback.hostingVersion&&current.releases[0].name===plan.rollback.hostingRelease,'live Hosting baseline changed');}
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
 const settings=inputs.schemaVersion===4&&inputs.release==='R062';
 const frontend=inputs.schemaVersion===3&&inputs.release==='R061';
 const runtime=inputs.schemaVersion===5&&inputs.release==='R063';
 const wave=inputs.schemaVersion===6&&inputs.release==='R064';
 const hostingOnly=Object.hasOwn(hostingOnlyReleases,inputs.release??'')&&inputs.schemaVersion===hostingOnlyReleases[inputs.release].schemaVersion;
 const r068=inputs.schemaVersion===9&&inputs.release==='R068';
 const r069=inputs.schemaVersion===10&&inputs.release==='R069';
 const r075=inputs.schemaVersion===17&&inputs.release==='R075';
 const current=r075||r069||r068||hostingOnly||wave||runtime||settings||frontend||(inputs.schemaVersion===2&&inputs.release==='R059');
 const plan=r075?await r075HostingPlan(inputs,{requireApplied:!!options['--apply']}):r069?await r069HostingPlan(inputs,{requireApplied:!!options['--apply']}):r068?await r068HostingPlan(inputs,{requireApplied:!!options['--apply']}):hostingOnly?await hostingOnlyPlan(inputs):wave?await waveHostingPlan(inputs,{requireApplied:!!options['--apply']}):runtime?await runtimeHostingPlan(inputs,{requireApplied:!!options['--apply']}):settings?await settingsHostingPlan(inputs,{requireApplied:!!options['--apply']}):frontend?await frontendOnlyHostingPlan(inputs):current?await appOnlyHostingPlan(inputs,{requireApplied:!!options['--apply']}):await businessHostingPlan(await read(inputs.preparedManifestFile),await read(inputs.appliedManifestFile),await read(inputs.receiptsFile),{preparedOptions:inputs.preparedOptions,appliedOptions:inputs.appliedOptions});
 if(options['--check'])console.log(JSON.stringify({dryRun:true,site:plan.site,fileCount:Object.keys(plan.files).length,sourceCommit:plan.sourceCommit,publicVersion:plan.publicVersion}));
 else{
  if(!options['--approval-reference']||!options['--output']||!path.isAbsolute(options['--output']))throw Error('Owner approval and absolute private output required');
  // VM-01 keeps its established private root; Linux cloud sessions use MW_PRIVATE_ROOT
  // (default ~/.mw-private) and also copy each receipt to the operator private bucket,
  // because the session filesystem is ephemeral.
  const windows=process.platform==='win32';
  const privateRoot=windows?path.resolve('C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App'):path.resolve(process.env.MW_PRIVATE_ROOT||path.join(process.env.HOME??'/root','.mw-private'),'MW-Credit-App');
  const persistReceipt=()=>{if(windows)return;const r=spawnSync('gcloud',['storage','cp',output,'gs://mw-credit-operator-private-737787224638/promotion-receipts/'+path.basename(output),'--quiet'],{stdio:['ignore','ignore','pipe']});if(r.status!==0)throw Error('Private receipt bucket copy failed; keep the local receipt and retry the copy');};
  const output=path.resolve(options['--output']),relative=path.relative(privateRoot,output);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Hosting receipt must remain in the private project root');
  for(let cursor=path.dirname(output);;cursor=path.dirname(cursor)){const state=await lstat(cursor);if(state.isSymbolicLink())throw Error('Private output reparse boundary rejected');if(cursor===privateRoot)break;}
  try{await lstat(output);throw Error('Hosting receipt already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  const token=process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if(current){const impersonationToken=process.env.GOOGLE_IMPERSONATION_SOURCE_TOKEN;delete process.env.GOOGLE_IMPERSONATION_SOURCE_TOKEN;await verifyAppOnlyOperator({token,impersonationToken,...(r075?{release:'R075'}:r069?{release:'R069'}:r068?{release:'R068'}:hostingOnly?{release:inputs.release}:wave?{release:'R064'}:runtime?{release:'R063'}:settings?{release:'R062'}:{})});if(r075)await verifyR075LivePackage(inputs,{token});else if(r069)await verifyR069LivePackage(inputs,{token});else if(r068)await verifyR068LivePackage(inputs,{token});else if(hostingOnly)await verifyHostingOnlyLivePackage(inputs,{token});else if(wave)await verifyWaveLivePackage(inputs,{token});else if(runtime)await verifyRuntimeLivePackage(inputs,{token});else if(settings)await verifySettingsLivePackage(inputs,{token});else if(frontend)await verifyFrontendOnlyLivePackage(inputs);else await verifyAppOnlyLivePackage(inputs,{token});}else await verifyOperatorCredential({token});
  const request=async(url,method,body,raw=false)=>{if(!['firebasehosting.googleapis.com','upload-firebasehosting.googleapis.com'].includes(new URL(url).hostname))throw Error('Unexpected Hosting API host');const response=await fetch(url,{method,redirect:'error',headers:{Authorization:'Bearer '+token,'x-goog-user-project':'clever-oasis-508610-n7','Content-Type':raw?'application/octet-stream':'application/json'},...(method==='GET'?{}:{body:raw?body:JSON.stringify(body)})});if(!response.ok)throw Error('Hosting API failed with status '+response.status);const text=await response.text();return text?JSON.parse(text):{};};
  const packageSha256=current?sha(await readFile(options['--inputs'])):undefined;
  if(current){await writeFile(output,JSON.stringify({schemaVersion:1,status:'pending-reconciliation',sourceCommit:plan.sourceCommit,packageSha256,site:plan.site,approvalReference:options['--approval-reference'],instruction:'Do not retry. Reconcile the live Hosting release before recovery.'},null,2),{flag:'wx'});persistReceipt();}
  const result=await executeBusinessHosting(plan,{request,approvalReference:options['--approval-reference']});
  if(current){result.packageSha256=packageSha256;result.status='applied';}
  console.log(JSON.stringify(result)); // Retain actual release identity even if local receipt persistence fails.
  try{await writeFile(options['--output'],JSON.stringify(result,null,2),{flag:current?'w':'wx'});persistReceipt();}catch{throw Error('Hosting release applied; private receipt write failed. Preserve the emitted release identity and inspect live state before retrying.');}
 }
}
