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
// R090 (chatOrigin): the public config, the compiled entry bundle and the Hosting CSP connect-src name the chat origin.
async function validatedHostingArtifact(m,recovery,{release,chatOrigin}={}){
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
 if(chatOrigin){
  requireValue(config.chatOrigin===chatOrigin&&entry.includes(chatOrigin),release+' chat origin missing from the public config or the compiled bundle');
  const csp=headers.find(rule=>rule.glob==='**')?.headers?.['Content-Security-Policy']??'',connect=csp.split(';').map(x=>x.trim()).find(x=>x.startsWith('connect-src '))??'';
  requireValue(connect.split(/\s+/).includes(chatOrigin),release+' chat origin missing from the Hosting CSP connect-src');
 }
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
// Documents a delivery-tool commit may carry: project/Documents/**, root Change Logs/** and (R091) the integration agent's
// Markdown documents under integration-agent/docs/** and integration-agent/Change Logs/** (`*.md` only, never runtime inputs).
const agentDocument=/^integration-agent\/(?:docs|Change Logs)\/(?:[^/]+\/)*[^/]+\.md$/;
const runtimeDeliveryAllowed=file=>deliveryFiles.includes(file)||/^project\/Documents\//.test(file)||/^Change Logs\//.test(file)||agentDocument.test(file);
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
// R083: the same Hosting-only kind on the unchanged R081 runtime and V100 (R081's plan, SQL and runtime pins stay and are
// read back live). The source descends from the R081 release, which is also the runtime compared; CI is R074's per-job
// gate and the artifact carries the R083 release marker.
const r064Release='9420c8599ce593eeeaafc1e68a235ab3d1d08d8c',r069Release='9c4a4cb753c7874206b6b1d1e9d28fa87d66002c',r070Release='038b5c9f9f7d1ed368f8197973a523bb0cf5eab2',r071Release='cb333f5c0024f51c197a2b5527d833605ba5fb03',r072Release='378c34825501534e9ada30a4b1e78dce0ed6c7a3',r073Release='042359b585e132cb20e3f0785320c285addc7a1e',r074Release='b88653d4b84860b7eab622d0edfb472d851c03ce',r081Release='b36dce97224b803a364efba90bcbce1c68caeea7';
// R103: the Hosting-only kind on the unchanged R102 runtime (b216968, the R102 package) and V115: the PWA chat progress row
// only, no SQL, image or Terraform change. The chat service exists since R090, so the runtime pins and the live readback
// cover five services, each pinned exactly to its R102 PROD revision and image (read, command and chat on 599e19b6…,
// notify and jobs on their unchanged 50953149… revisions), and the R102 live chat check holds (four models, Claude Opus
// 5.5 default, relay URL, private-range VPC egress on chat only). The artifact carries the R103 marker and the R090 chat
// origin; CI is R074's per-job gate.
const r102Release='b216968ad45f2228d88a6f53ba9bc07f813636db';
const r102Image=digest=>`asia-southeast1-docker.pkg.dev/${project}/mw-credit-app-prod/api@sha256:${digest}`;
export const R103_RUNTIME=Object.freeze({
 read:{revision:'mw-credit-app-read-prod-00029-tzt',image:r102Image('599e19b64600b94720f6ef803fdc1f1f494b1d525c62e3430487abfd9717ff26')},
 command:{revision:'mw-credit-app-command-prod-00034-8m8',image:r102Image('599e19b64600b94720f6ef803fdc1f1f494b1d525c62e3430487abfd9717ff26')},
 notify:{revision:'mw-credit-app-notify-prod-00022-4lt',image:r102Image('5095314936dcbb0e41716bc97cda0e2a3dd09bdf11730d820c6b24bd62450468')},
 jobs:{revision:'mw-credit-app-jobs-prod-00022-42m',image:r102Image('5095314936dcbb0e41716bc97cda0e2a3dd09bdf11730d820c6b24bd62450468')},
 chat:{revision:'mw-credit-app-chat-prod-00012-7lz',image:r102Image('599e19b64600b94720f6ef803fdc1f1f494b1d525c62e3430487abfd9717ff26')}});
// R071 to R074: package.json may differ from the runtime in `scripts` alone (the image runs `npm ci --omit=dev`, no npm script),
// and database/ may change only in Markdown outside database/migrations.
const hostingOnlyReleases={R065:{schemaVersion:7,baseline:r064Release,runtime:r064Release,runtimeLabel:'R064',sqlVersion:93},R066:{schemaVersion:8,baseline:'74ad26b57dcfb9effea86d638b7d112cffe042c5',runtime:r064Release,runtimeLabel:'R064',sqlVersion:93},R070:{schemaVersion:11,baseline:r069Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95},R071:{schemaVersion:12,baseline:r070Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true},R072:{schemaVersion:13,baseline:r071Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true},R073:{schemaVersion:14,baseline:r072Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true},R074:{schemaVersion:15,baseline:r073Release,runtime:r069Release,runtimeLabel:'R069',sqlVersion:95,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true,perJobCi:true},R083:{schemaVersion:24,baseline:r081Release,runtime:r081Release,runtimeLabel:'R081',sqlVersion:100,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true,perJobCi:true,releaseInArtifact:true},R103:{schemaVersion:34,baseline:r102Release,runtime:r102Release,runtimeLabel:'R102',sqlVersion:115,scriptsOnlyPackageJson:true,docsOnlyDatabaseMarkdown:true,perJobCi:true,releaseInArtifact:true,chatRuntime:R103_RUNTIME}};
// From R070 the delivery-tool commit may also carry this runner's README (as for R069).
const hostingOnlyDeliveryAllowed=L=>['R070','R071','R072','R073','R074','R083','R103'].includes(L)?file=>runtimeDeliveryAllowed(file)||file==='scripts/promotion/README.md':runtimeDeliveryAllowed;
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
 const chat=hostingOnlyReleases[L].chatRuntime;
 for(const role of runtimeRoles)requireValue(imagePattern.test(m.runtime?.services?.[role]?.image??'')&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(m.runtime.services[role].revision??''),L+' unchanged runtime pins required');
 // R103: exactly the five R102 PROD services, each on its pinned revision and image.
 if(chat)requireValue(plainObject(m.runtime?.services)&&exact(Object.keys(m.runtime.services).sort(),Object.keys(chat).sort())&&Object.entries(chat).every(([role,pin])=>isDeepStrictEqual(m.runtime.services[role],pin)),L+' unchanged runtime pins required: the five '+hostingOnlyReleases[L].runtimeLabel+' services on their PROD revisions and images');
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 return validatedHostingArtifact(m,recovery,{release:hostingOnlyReleases[L].releaseInArtifact?L:undefined,...(chat?{chatOrigin:R090_CHAT_ORIGIN}:{})});
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
 // The live runtime must still be exactly the pinned services (R064 for R065/R066, R069 for R070 to R074, R081 for R083,
 // the five R102 services for R103).
 const chat=hostingOnlyReleases[L].chatRuntime,live={};
 for(const role of chat?[...runtimeRoles,'chat']:runtimeRoles){
  const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');
  const s=await r.json(),pin=chat?chat[role]:m.runtime.services[role];live[role]=s;
  requireValue(s.template?.containers?.[0]?.image===pin.image&&s.latestReadyRevision?.endsWith('/'+pin.revision)&&s.terminalCondition?.state==='CONDITION_SUCCEEDED',L+' live runtime differs from the pinned services');
  if(chat)requireValue(s.trafficStatuses?.length===1&&s.trafficStatuses[0].percent===100&&s.trafficStatuses[0].revision===pin.revision,L+' live '+role+' traffic must be 100% on its pinned revision');
 }
 if(chat){
  // R103: the R102 live chat check still holds (Claude Opus 5.5 default and the three Gemini models, relay URL, VPC egress).
  const env=Object.fromEntries((live.chat.template?.containers?.[0]?.env??[]).map(x=>[x.name,x.value]));let models;try{models=JSON.parse(env.CHAT_MODELS_JSON);}catch{models=null;}
  requireValue(live.chat.template?.serviceAccount===`mw-credit-app-chat-prod@${project}.iam.gserviceaccount.com`,L+' live chat identity drift');
  verifyR102LiveChat(live,env,models,L);
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
// artifact carries the release number (R075 marker). The delivery-tool commit may also carry this README, the
// reviewed PROD backup tool (as for R068) and the read-only CONNECT preflight collector with its unit test.
const r075Migrations=['V96__manual_payment_command_v7_bank_reference.sql'];
const r075DeliveryAllowed=file=>runtimeDeliveryAllowed(file)||['scripts/database/Backup-ProductionPromotion.py','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py','scripts/promotion/README.md'].includes(file);
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
 await verifyRecognizerWiringLive(m,{token,request},'R075');
}
/** Live: worker caller subjects and the receipt recognizer wiring, on the command service only (R075 and R076). */
async function verifyRecognizerWiringLive(m,{token,request},L){
 const named=(value,kind)=>value==='default'||(typeof value==='string'&&value.endsWith('/'+kind+'/default'));
 for(const role of runtimeRoles){
  const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');
  const s=await r.json(),env=Object.fromEntries((s.template?.containers?.[0]?.env??[]).map(x=>[x.name,x.value])),vpc=s.template?.vpcAccess;
  if(['notify','jobs'].includes(role)){let subjects;try{subjects=JSON.parse(env.WORKER_CALLER_SUBJECTS_JSON);}catch{subjects=null;}requireValue(subjects&&typeof subjects==='object'&&Object.keys(subjects).length>0&&Object.values(subjects).every(v=>/^[0-9]{10,30}$/.test(v)),'worker caller subjects required');}
  if(role==='command'){
   requireValue(env.PROD_RECEIPT_RECOGNITION===m.recognition.activation&&env.PROD_RECEIPT_RECOGNITION_URL===R075_RECOGNIZER_URL&&(m.recognition.activation==='disabled'||env.PROD_RECEIPTS==='enabled'),L+' live command recognizer setting drift');
   const nics=vpc?.networkInterfaces??[];requireValue(vpc?.egress==='PRIVATE_RANGES_ONLY'&&nics.length===1&&named(nics[0].network,'networks')&&named(nics[0].subnetwork,'subnetworks')&&!vpc.connector,L+' live command VPC egress drift');
  }else requireValue(!vpc&&!Object.keys(env).some(name=>name.startsWith('PROD_RECEIPT_RECOGNITION')),L+' recognizer wiring outside the command service');
 }
}

// R076 (production hotfix): one new image for reader/command/notify/jobs on the unchanged V96 (no migration). The PROD
// plan changes the four images only (0/4/0); the R075 receipt recognizer wiring stays enabled and unchanged and is read
// back live on the command service. Source descends from the R075 release and carries the R075 PROD SQL tooling commit;
// CI is R074's per-job gate; the artifact carries the R076 release marker. The delivery-tool commit may also carry this README.
// R077 is the same runtime + Hosting kind on V96 with the source descending from the R076 release and one more planned
// action, the command service request timeout (15 s to 55 s, receipt recognition), read back live with the other three
// services' timeouts unchanged (reader 15 s, workers 120 s). The integration agent is not covered by these contracts.
const r075Release='96b0a0b120be60fbe9a229d1004eabce35598a0d',r075SqlTooling='6b58f00a9500635251b569ce9824b4810d55e803';
const r076Release='fa67607e4571d1c01ed39f7919cc627fd5e27ee7';
// R079 (production hotfix, API receipt amount parsing): the R076/R077 kind on V98 (no migration). PROD is already at V98
// (98 history rows, applied by the R078 follow-up). The source descends from the R078 release and carries the V98 commit,
// and has no change under database/migrations since that commit; the plan is the four images only (0/4/0), the recognizer
// wiring stays enabled and the R077 timeouts stay, both read back live. The integration agent is not covered.
const r078Release='68ce6694f27960a3f018634052c4cde6fc9923f7',r079V98Commit='7ae8469a4da2e79ba774907041d0f21acf068887';
const v96DeliveryAllowed=file=>runtimeDeliveryAllowed(file)||file==='scripts/promotion/README.md';
const _r076DeliveryAllowed=v96DeliveryAllowed,_r077DeliveryAllowed=v96DeliveryAllowed;
const r077PlanActions=[...waveImageActions,'command.timeout'];
export const R077_SERVICE_TIMEOUTS=Object.freeze({read:'15s',command:'55s',notify:'120s',jobs:'120s'});
const v96Releases={
 R076:{schemaVersion:18,baseline:r075Release,baselineLabel:'R075',tooling:r075SqlTooling,actions:waveImageActions,planMessage:'R076 reviewed four-image plan required'},
 R077:{schemaVersion:19,baseline:r076Release,baselineLabel:'R076',actions:r077PlanActions,planMessage:'R077 reviewed four-image and command timeout plan required',timeouts:R077_SERVICE_TIMEOUTS},
 R079:{schemaVersion:21,baseline:r078Release,baselineLabel:'R078',sqlVersion:98,carries:r079V98Commit,actions:waveImageActions,planMessage:'R079 reviewed four-image plan required',timeouts:R077_SERVICE_TIMEOUTS},
};
function validateV96RuntimeSource(m,git,L){
 const rule=v96Releases[L];
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&m.sourceBaseline===rule.baseline,'exact '+L+' source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit&&git(m.repoRoot,['merge-base',rule.baseline,m.sourceCommit])===rule.baseline,L+' source must descend from the '+rule.baselineLabel+' release');
 if(rule.tooling)requireValue(git(m.repoRoot,['merge-base',rule.tooling,m.sourceCommit])===rule.tooling,L+' source must carry the R075 PROD SQL tooling');
 if(rule.carries)requireValue(git(m.repoRoot,['merge-base',rule.carries,m.sourceCommit])===rule.carries,L+' source must carry the V'+rule.sqlVersion+' commit');
 requireValue(strictNames(git,m.repoRoot,rule.carries??rule.baseline,m.sourceCommit,['database/migrations']).length===0,L+' carries no migration');
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,L+' delivery source mismatch');
 if(tool!==m.sourceCommit){requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit,L+' delivery source must descend from the pinned source');requireValue(strictNames(git,m.repoRoot,m.sourceCommit,tool).every(v96DeliveryAllowed)&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,L+' unverified delivery correction');}
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--no-renames','-z','--',...runtimeInputs,'scripts/promotion'])==='',L+' working input drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...runtimeInputs,'scripts/promotion'])==='',L+' untracked input');
}
async function v96RuntimeHostingPlan(m,{requireApplied,git},L){
 const rule=v96Releases[L],sqlVersion=rule.sqlVersion??96;
 requireValue(m?.schemaVersion===rule.schemaVersion&&m.release===L&&m.environment==='prod'&&m.scope==='runtime-workers-frontend'&&['prepared','applied'].includes(m.status),'wrong '+L+' package kind');
 requireValue(!requireApplied||m.status==='applied',L+' runtime apply/readback required');
 validateV96RuntimeSource(m,git,L);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 const v=m.sql?.verified;
 requireValue(m.sql?.baselineVersion===sqlVersion&&m.sql.targetVersion===sqlVersion&&exact(m.sql.migrations,[])&&v?.database==='loan_manager_prod'&&v.latestVersion===String(sqlVersion)&&v.historyRows===sqlVersion&&v.allSuccessful===true&&zulu(v.verifiedAt),L+' requires verified V'+sqlVersion+' with no migration');
 validateR074Ci(m.applicationCi,m,git,L,v96DeliveryAllowed);
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,L+' PROD image provenance required');
 requireValue(exact(m.recognition,{activation:'enabled',url:R075_RECOGNIZER_URL}),L+' unchanged enabled receipt recognition wiring required');
 requireValue(/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&path.isAbsolute(m.plan.path??'')&&exact(m.plan.counts,{add:0,change:4,destroy:0})&&exact(m.plan.actions,rule.actions),rule.planMessage);
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 for(const role of runtimeRoles)requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&recovery.services[role].image!==m.build.image&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(recovery.services[role].revision??''),'service recovery pin required');
 if(m.status==='applied'){
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===sqlVersion&&zulu(m.applied.appliedAt),L+' applied source/plan/database mismatch');
  for(const role of runtimeRoles){const s=m.applied.services?.[role];requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(s.revision??'')&&s.revision!==recovery.services[role].revision,L+' ready service readback required');}
 }
 return validatedHostingArtifact(m,recovery,{release:L});
}
async function verifyV96RuntimeLivePackage(m,{token,request=fetch,readGithub,git=sourceGit},L){
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'actual GitHub CI readback failed');return JSON.parse(r.stdout)});
 await verifyAppOnlyLivePackage(m,{token,request,readGithub,verifyCi:()=>verifyPerJobCiLive(m,gh,git,L,v96DeliveryAllowed)});
 await verifyRecognizerWiringLive(m,{token,request},L);
 const timeouts=v96Releases[L].timeouts;
 if(timeouts)for(const role of runtimeRoles){
  const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');
  requireValue((await r.json()).template?.timeout===timeouts[role],L+' live '+role+' request timeout must be '+timeouts[role]);
 }
}
export function validateR076Source(m,git=sourceGit){return validateV96RuntimeSource(m,git,'R076');}
export async function r076HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return v96RuntimeHostingPlan(m,{requireApplied,git},'R076');}
/** Live: per-job CI, Cloud Build, the four identities, worker subjects and the unchanged command-only recognizer wiring. */
export async function verifyR076LivePackage(m,options={}){return verifyV96RuntimeLivePackage(m,options,'R076');}
export function validateR079Source(m,git=sourceGit){return validateV96RuntimeSource(m,git,'R079');}
export async function r079HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return v96RuntimeHostingPlan(m,{requireApplied,git},'R079');}
/** Live: per-job CI, Cloud Build, the four identities, worker subjects, the unchanged recognizer wiring and the R077 timeouts (command 55 s, reader 15 s, workers 120 s). */
export async function verifyR079LivePackage(m,options={}){return verifyV96RuntimeLivePackage(m,options,'R079');}
export function validateR077Source(m,git=sourceGit){return validateV96RuntimeSource(m,git,'R077');}
export async function r077HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return v96RuntimeHostingPlan(m,{requireApplied,git},'R077');}
/** Live: as R076, plus the four services' request timeouts (command 55 s, reader 15 s, workers 120 s). */
export async function verifyR077LivePackage(m,options={}){return verifyV96RuntimeLivePackage(m,options,'R077');}

// R078: one new image for reader/command/notify/jobs after the separately applied and verified V97 (PROD 96 to 97,
// PWA row-change log). The source descends from the R077 release and adds exactly V97 under database/migrations; the
// SQL evidence is R075's (exact migration bytes, tested grouped 96-to-97 manifest, actual apply with a verified backup
// and a read-only 97-row readback). The PROD plan changes the four images only (0/4/0); the R075 receipt recognizer
// wiring stays enabled and the R077 request timeouts stay (command 55 s, reader 15 s, workers 120 s), both read back
// live. CI is R074's per-job gate; the artifact carries the R078 release marker. The delivery-tool commit may also
// carry this README and the PROD backup tool (baseline 96 accepted).
// R080: the same kind after the separately applied and verified V99 (PROD 98 to 99, push notification content facts,
// owner window mw_notify_owner_prod). The source descends from the R079 release and adds exactly V99; plan, recognizer
// wiring and R077 timeouts as R078; the artifact carries the R080 release marker. The delivery-tool commit may also
// carry this README, the PROD backup tool (baseline 98 accepted) and the operator note.
// R081: the same kind after V100 (PROD 99 to 100, English-name push body: pwa_notify_content_v1 replaced in place, notify
// owner window mw_notify_owner_prod). The source descends from the R080 release and adds exactly V100.
// R089: the same kind after V103 (PROD 102 to 103, notification history text: new pwa_notify_history_content_v1, notify
// owner window mw_notify_owner_prod). V102 (monitoring_ops_health, the R089 Grafana work) was applied to DEV and PROD
// separately before this package, so the SQL step is V103 only. The source descends from 0a93c0a, the PR #123 merge that
// carries V102 (and the R087 runtime source bf11e40, V101 and the R083 runner contract), and adds exactly V103. Plan,
// recognizer wiring and R077 timeouts as R081 (R087 changed images only).
const r077Release='683cfceed724778151e1e305adaea50b9ab20c94',r079Release='823e9e593afde879fdb0ba94e198ea0351975aea',r080Release='4a7e199bd258f7f71fac7aad240b2beced3235fd',r089Baseline='0a93c0abc32c9ae120ce727ea39181c0ab06d649';
// The R089 release (tag R089, the PR #121 merge on main, frozen 2026-10-22T18:14Z), the live PROD runtime source before R090.
const r089Release='99758c71b62d904018900438d4082b1a923e53fa';
// The R090 package source (frozen 2026-10-23), the live PROD runtime source before R091.
const r090Release='297b76494f344e54dfb708becf5ea2fd63ca684e';
// R095 baseline: e3d5bc2, the PR #146 merge on main that carries V110 (applied to DEV and PROD separately on
// 24 October 2026, after the R094 release 2032bc3), so the R095 SQL step is V111 only.
const r095Baseline='e3d5bc2a0c013f6a2c73eb66a1b90ea64a34a41d';
// R096 baseline: 14c4a40, the R095 package (frozen at promotion start, PR #148); R096 carries no migration (PROD stays 111).
const r096Baseline='14c4a40399060c45adfbdaf9b93004eba43b95eb';
// R097 baseline: 3cbbcea, the R096 package (frozen at promotion start, PR #151); R097 carries no migration (PROD stays 111).
const r097Baseline='3cbbcea1e3944156b6dee3c812d7ad8895c0f1ca';
// R100 baseline: e040373, the R097 package (frozen at promotion start, PR #155; the source PROD runs); R100 carries no migration (PROD stays 111).
const r100Baseline='e04037313b09d824988453ab2b6c014ae6fd81c4';
// R101 baseline: c7ea78d, the R100 package (PR #166; the source PROD runs at 111); R101 adds V112 and V113 (PROD 111 to 113).
const r101Baseline='c7ea78d15d65fd082d592fd459f1e315cb2770ca';
// R102 baseline: 10d543d, the R101 package (tag R101; the source PROD runs at 113); R102 adds V114 and V115 (PROD 113 to 115).
const r102Baseline='10d543d16cd83e6baeaf480edd03719160b8588d';
// R104 baseline: f576665, the R103 package (PR #180; the source PROD runs at 115); R104 adds V116 and V117 (PROD 115 to 117).
const r104Baseline='f5766653139155c2bf53372bd408e51e85732cfa';
// R106 baseline: cf01602, the R105 release (tag R105; the source PROD runs at 117); R106 adds V118 and V119 (PROD 117 to 119).
const r106Baseline='cf0160229829ec3caf02bbbfd307d226c4b5d1b3';
// R107 baseline: e57e77d, the R106 release (tag R106, peeled; the source PROD runs at 119); R107 adds no migration.
const r107Baseline='e57e77d764cdd3c4a9e21dd71d342e7628adb423';
// R108 baseline: 1befbb8, the R107 release (tag R107, peeled; the source PROD runs at 119); R108 adds no migration.
const r108Baseline='1befbb87fa4604262d799b13529a954c004c3ff3';
const sqlRuntimeReleases={
 R078:{schemaVersion:20,baseline:r077Release,baselineLabel:'R077',migrations:['V97__pwa_row_changes.sql'],sqlBaseline:96,sqlTarget:97,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py']},
 R080:{schemaVersion:22,baseline:r079Release,baselineLabel:'R079',migrations:['V99__notification_content_facts.sql'],sqlBaseline:98,sqlTarget:99,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md']},
 R081:{schemaVersion:23,baseline:r080Release,baselineLabel:'R080',migrations:['V100__notification_english_name.sql'],sqlBaseline:99,sqlTarget:100,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md']},
 R089:{schemaVersion:25,baseline:r089Baseline,baselineLabel:'V102 (PR #123)',migrations:['V103__notification_history_content.sql'],sqlBaseline:102,sqlTarget:103,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md']},
 R090:{schemaVersion:26,baseline:r089Release,baselineLabel:'R089',migrations:['V104__pwa_chat.sql','V105__chat_reply_notification_and_job_status.sql','V106__chat_turn_presence.sql'],sqlBaseline:103,sqlTarget:106,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py'],
  hashes:{'V104__pwa_chat.sql':'bb0ec215f8ec8bb127d0a3c94855753d95dd0bb27fd5178e592bab2b72f64e40','V105__chat_reply_notification_and_job_status.sql':'795515c66d902152838b0aba53194e4239c701f50a1646c34626c45b94bbe32d','V106__chat_turn_presence.sql':'92fd4c5dd228852588da1ba861793753ef4090bb2f968517bfdd25ceded62a6d'}},
 R091:{schemaVersion:27,baseline:r090Release,baselineLabel:'R090',migrations:['V107__drop_agent_native_operation.sql'],sqlBaseline:106,sqlTarget:107,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py'],
  hashes:{'V107__drop_agent_native_operation.sql':'06aae62b3273662b6de6bd63bbbd5816ca58ea08e04f05184c67038b6e54aec8'}},
 R095:{schemaVersion:28,baseline:r095Baseline,baselineLabel:'V110 (PR #146)',migrations:['V111__payer_name.sql'],sqlBaseline:110,sqlTarget:111,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py','scripts/database/Backfill-PayerNames.py','scripts/database/test_backfill_payer_names.py'],
  hashes:{'V111__payer_name.sql':'657d4660771d1636f227a3353504a1674ace738770be172960fc03d57484c03a'}},
 R096:{schemaVersion:29,baseline:r096Baseline,baselineLabel:'R095',migrations:[],sqlBaseline:111,sqlTarget:111,
  delivery:['scripts/promotion/README.md']},
 R097:{schemaVersion:30,baseline:r097Baseline,baselineLabel:'R096',migrations:[],sqlBaseline:111,sqlTarget:111,
  delivery:['scripts/promotion/README.md']},
 R100:{schemaVersion:31,baseline:r100Baseline,baselineLabel:'R097',migrations:[],sqlBaseline:111,sqlTarget:111,
  delivery:['scripts/promotion/README.md']},
 R101:{schemaVersion:32,baseline:r101Baseline,baselineLabel:'R100',migrations:['V112__pay_next_projected_charge.sql','V113__loan_close_future_interest.sql'],sqlBaseline:111,sqlTarget:113,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py'],
  hashes:{'V112__pay_next_projected_charge.sql':'a9910bb3f10140b5a055416170f2d6f6141e56d6505a338248a6f857f9a10366','V113__loan_close_future_interest.sql':'c7ea965763125d48b6df5767c6ccf2900e928d58f942d592d355587eab5039e8'}},
 R102:{schemaVersion:33,baseline:r102Baseline,baselineLabel:'R101',migrations:['V114__long_overdue_collection_status.sql','V115__chat_claude_model_ids.sql'],sqlBaseline:113,sqlTarget:115,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py'],
  hashes:{'V114__long_overdue_collection_status.sql':'af10766eea0bec9b40c737de86312b189789212e6a786f21586ff98636284af9','V115__chat_claude_model_ids.sql':'669d9b3154399c13e02d03ec7d110951e5b44782144b3165330df6966c17252e'}},
 R104:{schemaVersion:35,baseline:r104Baseline,baselineLabel:'R103',migrations:['V116__book_projected_charge.sql','V117__sequential_projected_charge_booking.sql'],sqlBaseline:115,sqlTarget:117,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py'],
  hashes:{'V116__book_projected_charge.sql':'6da3abfe4533817e975a8924fc33542a9a45cebac0167f5845a7e3c6ecda7f18','V117__sequential_projected_charge_booking.sql':'778bbfe83ffe052c4432757ad97f7998b7cf470c1dd0849f38d966b6545f297f'}},
 // R106 is the first hand-written kind that carries infrastructure files: exactly these, under infrastructure/production
 // and infrastructure/modules, between the baseline and the source (`infrastructure`).
 // Its delivery commits may also carry database/README.md (the V118/V119 record of 4b946bd; documentation, no image input).
 R106:{schemaVersion:37,baseline:r106Baseline,baselineLabel:'R105',migrations:['V118__chat_proposals.sql','V119__chat_proposal_groups.sql'],sqlBaseline:117,sqlTarget:119,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py','database/README.md'],
  hashes:{'V118__chat_proposals.sql':'07d0ba6c5bd243789fac278bf15b0b1e50b5139282a30945af1dbe62a8497f49','V119__chat_proposal_groups.sql':'a55e4fc948ebc726b6e75d67f646af7a0766559aaa77c459047f0c31256ac25c'},
  infrastructure:['infrastructure/production/READINESS_INVENTORY.md','infrastructure/production/README.md','infrastructure/production/chat-service.tf','infrastructure/production/tests/chat-service.tftest.hcl']},
 // R107 (request-based CPU for command and chat): no migration (a read-only V119 readback) and exactly these
 // infrastructure/production files (cpu_idle true on command in runtime.tf and on chat in chat-service.tf, with their tests).
 R107:{schemaVersion:38,baseline:r107Baseline,baselineLabel:'R106',migrations:[],sqlBaseline:119,sqlTarget:119,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py'],
  infrastructure:['infrastructure/production/chat-service.tf','infrastructure/production/runtime.tf','infrastructure/production/tests/chat-service.tftest.hcl','infrastructure/production/tests/inert.tftest.hcl']},
 // R108 (Claude-only chat menu): no migration (a read-only V119 readback) and exactly these infrastructure/production
 // files (the chat_models default in chat-service.tf and its test).
 R108:{schemaVersion:39,baseline:r108Baseline,baselineLabel:'R107',migrations:[],sqlBaseline:119,sqlTarget:119,
  delivery:['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py'],
  infrastructure:['infrastructure/production/chat-service.tf','infrastructure/production/tests/chat-service.tftest.hcl']},
};
const sqlRuntimeDeliveryAllowed=L=>file=>runtimeDeliveryAllowed(file)||sqlRuntimeReleases[L].delivery.includes(file);
function validateSqlRuntimeSource(m,git,L){
 const rule=sqlRuntimeReleases[L],allowed=sqlRuntimeDeliveryAllowed(L);
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&m.sourceBaseline===rule.baseline,'exact '+L+' source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse',m.sourceCommit])===m.sourceCommit&&git(m.repoRoot,['merge-base',rule.baseline,m.sourceCommit])===rule.baseline,L+' source must descend from the '+rule.baselineLabel+' release');
 requireValue(exact(strictNames(git,m.repoRoot,rule.baseline,m.sourceCommit,['database/migrations']),rule.migrations.map(name=>'database/migrations/'+name)),L+(rule.migrations.length?' carries exactly the separately applied V'+rule.sqlTarget:' carries no migration'));
 // R106: the PROD infrastructure files the release carries, exactly (the older kinds rely on their plan labels only).
 if(rule.infrastructure){const infra=strictNames(git,m.repoRoot,rule.baseline,m.sourceCommit,['infrastructure/production','infrastructure/modules']).sort();requireValue(exact(infra,[...rule.infrastructure].sort()),L+' infrastructure changes must be exactly '+rule.infrastructure.join(', ')+' (the source changes '+(infra.join(', ')||'none')+')');}
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,L+' delivery source mismatch');
 if(tool!==m.sourceCommit){requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit,L+' delivery source must descend from the pinned source');requireValue(strictNames(git,m.repoRoot,m.sourceCommit,tool).every(allowed)&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,L+' unverified delivery correction');}
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--no-renames','-z','--',...runtimeInputs,'scripts/promotion'])==='',L+' working input drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...runtimeInputs,'scripts/promotion'])==='',L+' untracked input');
}
async function validateSqlRuntimeSql(m,git,L){
 const rule=sqlRuntimeReleases[L];
 // R096, R097 and R100: no migration; only a read-only readback of the unchanged PROD version (no release, apply or backup).
 if(!rule.migrations.length){const v=m.sql?.verified,V=rule.sqlTarget;requireValue(plainObject(m.sql)&&exact(Object.keys(m.sql).sort(),['baselineVersion','migrations','targetVersion','verified'])&&m.sql.baselineVersion===V&&m.sql.targetVersion===V&&exact(m.sql.migrations,[])&&v?.database==='loan_manager_prod'&&v.latestVersion===String(V)&&v.historyRows===V&&v.allSuccessful===true&&zulu(v.verifiedAt),L+' requires a read-only V'+V+' readback with no migration');return;}
 await validatePromotionSql(m,git,{label:L,baseline:rule.sqlBaseline,target:rule.sqlTarget,migrations:rule.migrations});
 // R090, R091, R095, R101, R102, R104 and R106 also pin each migration's reviewed bytes (DEV-applied V104 to V106; V107; V111; V112 and V113; V114 and V115; V116 and V117; V118 and V119).
 if(rule.hashes)for(const pin of m.sql.migrations)requireValue(pin.sha256===rule.hashes[pin.name],L+' migration is not the reviewed '+pin.name);
}
async function sqlRuntimeHostingPlan(m,{requireApplied,git},L){
 const rule=sqlRuntimeReleases[L];
 requireValue(m?.schemaVersion===rule.schemaVersion&&m.release===L&&m.environment==='prod'&&m.scope==='runtime-workers-frontend'&&['prepared','applied'].includes(m.status),'wrong '+L+' package kind');
 requireValue(!requireApplied||m.status==='applied',L+' runtime apply/readback required');
 validateSqlRuntimeSource(m,git,L);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 await validateSqlRuntimeSql(m,git,L);
 validateR074Ci(m.applicationCi,m,git,L,sqlRuntimeDeliveryAllowed(L));
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,L+' PROD image provenance required');
 requireValue(exact(m.recognition,{activation:'enabled',url:R075_RECOGNIZER_URL}),L+' unchanged enabled receipt recognition wiring required');
 requireValue(/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&path.isAbsolute(m.plan.path??'')&&exact(m.plan.counts,{add:0,change:4,destroy:0})&&exact(m.plan.actions,waveImageActions),L+' reviewed four-image plan required');
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 for(const role of runtimeRoles)requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&recovery.services[role].image!==m.build.image&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(recovery.services[role].revision??''),'service recovery pin required');
 if(m.status==='applied'){
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===rule.sqlTarget&&zulu(m.applied.appliedAt)&&Date.parse(m.applied.appliedAt)>=Date.parse(m.sql.applied.finishedAt),L+' applied source/plan/database mismatch');
  for(const role of runtimeRoles){const s=m.applied.services?.[role];requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$').test(s.revision??'')&&s.revision!==recovery.services[role].revision,L+' ready service readback required');}
 }
 return validatedHostingArtifact(m,recovery,{release:L});
}
// `allowed` (the generic kind) replaces the hand-written kind's delivery allow-list.
async function verifySqlRuntimeLivePackage(m,{token,request=fetch,readGithub,git=sourceGit},L,allowed=sqlRuntimeDeliveryAllowed(L)){
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'actual GitHub CI readback failed');return JSON.parse(r.stdout)});
 await verifyAppOnlyLivePackage(m,{token,request,readGithub,verifyCi:()=>verifyPerJobCiLive(m,gh,git,L,allowed)});
 await verifyRecognizerWiringLive(m,{token,request},L);
 for(const role of runtimeRoles){
  const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');
  requireValue((await r.json()).template?.timeout===R077_SERVICE_TIMEOUTS[role],L+' live '+role+' request timeout must be '+R077_SERVICE_TIMEOUTS[role]);
 }
}
export function validateR078Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R078');}
export async function validateR078Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R078');}
export async function r078HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return sqlRuntimeHostingPlan(m,{requireApplied,git},'R078');}
/** Live: per-job CI, Cloud Build, the four identities, worker subjects, the unchanged recognizer wiring and the R077 timeouts. */
export async function verifyR078LivePackage(m,options={}){return verifySqlRuntimeLivePackage(m,options,'R078');}
export function validateR081Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R081');}
export async function validateR081Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R081');}
export async function r081HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return sqlRuntimeHostingPlan(m,{requireApplied,git},'R081');}
/** Live: as R078 and R080. */
export async function verifyR081LivePackage(m,options={}){return verifySqlRuntimeLivePackage(m,options,'R081');}
export function validateR089Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R089');}
export async function validateR089Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R089');}
export async function r089HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return sqlRuntimeHostingPlan(m,{requireApplied,git},'R089');}
/** Live: as R081. */
export async function verifyR089LivePackage(m,options={}){return verifySqlRuntimeLivePackage(m,options,'R089');}
export function validateR080Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R080');}
export async function validateR080Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R080');}
export async function r080HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return sqlRuntimeHostingPlan(m,{requireApplied,git},'R080');}
/** Live: as R078 (per-job CI, Cloud Build, identities, worker subjects, recognizer wiring, R077 timeouts). */
export async function verifyR080LivePackage(m,options={}){return verifySqlRuntimeLivePackage(m,options,'R080');}

// R090 (in-app chat): one new image for reader/command/notify/jobs and the new chat service mw-credit-app-chat-prod, after
// the separately applied and verified V104 to V106 (PROD 103 to 106; owner windows mw_chat_owner_prod and
// mw_notify_owner_prod for V105). The source descends from the R089 release and adds exactly V104, V105 and V106, each
// pinned to its reviewed SHA-256. The PROD plan is {add:10, change:4, destroy:0}: the chat identity and its grants, the
// chat service and the chat and jobs invokers on notify are added; command (cpu_idle false), jobs (dispatch wake),
// notify (caller subjects) and the reader change with their new image. The recognizer wiring and the R077 timeouts stay;
// the live readback covers the five services. The artifact carries the R090 marker and the PROD chat origin in its
// public config, its entry bundle and the Hosting CSP.
export const R090_CHAT_ORIGIN='https://mw-credit-app-chat-prod-pvrgvyg3oq-as.a.run.app';
export const R090_PLAN_ACTIONS=Object.freeze([
 'chat.serviceAccount','chat.projectRole.cloudsqlClient','chat.projectRole.cloudsqlInstanceUser','chat.projectRole.aiplatformUser','chat.authStatusRole',
 'chat.databaseUser','chat.capabilityPolicyAccessor','chat.service','notify.chatInvoker','notify.jobsInvoker',
 'read.image','command.image','command.cpuIdle','notify.image','notify.callerSubjects','jobs.image','jobs.dispatchWake']);
const R090_NOTIFY='https://mw-credit-app-notify-prod-737787224638.asia-southeast1.run.app';
export const R090_DISPATCH=Object.freeze({NOTIFICATION_DISPATCH_ENABLED:'true',NOTIFICATION_DISPATCH_URL:R090_NOTIFY+'/internal/dispatch',NOTIFICATION_DISPATCH_AUDIENCE:R090_NOTIFY});
const revisionOf=role=>new RegExp('^mw-credit-app-'+role+'-prod-[0-9]+-[a-z0-9]+$');
export function validateR090Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R090');}
export async function validateR090Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R090');}
// The chat-era plan (R090 onwards): R089's SQL kind with the chat service among the readback, a release-specific plan
// shape and recovery pins (`recoveryRoles`; a service in `newRoles` has no recovery revision to differ from). The order:
// R090 applies the SQL first and the images on the target version; R091 (`imageFirst`) rolls out the images on the
// baseline version first and applies V107 after them, since V107 drops the function the R090 command image still calls.
// R095 changes two images only (`changedRoles`: command and chat); recovery pins all five services and the other three
// must read back exactly on their pinned image and revision. R096, R097 and R100 (`noSql`) change read, command and chat with no
// migration: the images roll out on the unchanged version, after its read-only readback. R101 changes read, command and chat
// after its SQL (V112 and V113), as R095 does after V111. R102 changes the same three after V114 and V115; its chat change
// also carries CHAT_MODELS_JSON (Claude Opus 5.5 default), CHAT_RELAY_URL and Direct VPC egress (`liveChat: 'r102'`).
// R104 changes the three images only after V116 and V117; the chat configuration stays R102's and is read back with the R102 check.
// R106 changes the same three images after V118 and V119 and adds CHAT_COMMAND_URL on chat; its plan JSON is read back
// (`readPlan`) and its live readback is R102's plus the command URL on chat only (`liveChat: 'r106'`).
// R107 changes the read, command and chat images with no migration (`noSql`; notify and jobs stay on their pins) and moves
// command and chat to request-based CPU (cpu_idle true); its plan JSON is read back (`readPlan`) and its live readback is
// R106's with command and chat cpuIdle exactly true (`requestCpu`).
// R108 changes the chat image and its CHAT_MODELS_JSON (Claude Opus 5.5 only) with no migration; the other four stay on
// their pins. Its plan JSON is read back (`readPlan`) and its live readback is R107's with the Claude-only menu (`liveChat: 'r108'`).
const chatRuntimeKinds={
 R090:{counts:{add:10,change:4,destroy:0},actions:()=>R090_PLAN_ACTIONS,planLabel:'reviewed chat and four-service plan required',recoveryRoles:runtimeRoles,recoveryLabel:'recovery pins exactly the four existing services',newRoles:['chat'],imageFirst:false},
 R091:{counts:{add:0,change:5,destroy:0},actions:()=>R091_PLAN_ACTIONS,planLabel:'reviewed five-service plan required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],imageFirst:true},
 R095:{counts:{add:0,change:2,destroy:0},actions:()=>R095_PLAN_ACTIONS,planLabel:'reviewed command and chat image plan required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['command','chat'],imageFirst:false},
 R096:{counts:{add:0,change:3,destroy:0},actions:()=>R096_PLAN_ACTIONS,planLabel:'reviewed read, command and chat image plan required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['read','command','chat'],imageFirst:false,noSql:true},
 R097:{counts:{add:0,change:3,destroy:0},actions:()=>R097_PLAN_ACTIONS,planLabel:'reviewed read, command and chat image plan required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['read','command','chat'],imageFirst:false,noSql:true},
 R100:{counts:{add:0,change:3,destroy:0},actions:()=>R100_PLAN_ACTIONS,planLabel:'reviewed read, command and chat image plan required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['read','command','chat'],imageFirst:false,noSql:true},
 R101:{counts:{add:0,change:3,destroy:0},actions:()=>R101_PLAN_ACTIONS,planLabel:'reviewed read, command and chat image plan required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['read','command','chat'],imageFirst:false},
 R102:{counts:{add:0,change:3,destroy:0},actions:()=>R102_PLAN_ACTIONS,planLabel:'reviewed read and command image, chat image, models, relay and VPC plan required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['read','command','chat'],imageFirst:false,liveChat:'r102'},
 R104:{counts:{add:0,change:3,destroy:0},actions:()=>R104_PLAN_ACTIONS,planLabel:'reviewed read, command and chat image plan required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['read','command','chat'],imageFirst:false,liveChat:'r102'},
 R106:{counts:{add:0,change:3,destroy:0},actions:()=>R106_PLAN_ACTIONS,planLabel:'reviewed read, command and chat image plan with CHAT_COMMAND_URL on chat required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['read','command','chat'],imageFirst:false,liveChat:'r106',readPlan:(m,L)=>readR106Plan(m,L)},
 R107:{counts:{add:0,change:3,destroy:0},actions:()=>R107_PLAN_ACTIONS,planLabel:'reviewed read, command and chat image plan with request-based CPU on command and chat required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['read','command','chat'],imageFirst:false,noSql:true,liveChat:'r106',requestCpu:true,readPlan:(m,L)=>readR107Plan(m,L)},
 R108:{counts:{add:0,change:1,destroy:0},actions:()=>R108_PLAN_ACTIONS,planLabel:'reviewed chat image and Claude-only CHAT_MODELS_JSON plan required',recoveryRoles:[...runtimeRoles,'chat'],recoveryLabel:'recovery pins exactly the five services',newRoles:[],changedRoles:['chat'],imageFirst:false,noSql:true,liveChat:'r108',requestCpu:true,readPlan:(m,L)=>readR108Plan(m,L)},
};
async function chatRuntimeHostingPlan(m,{requireApplied,git},L){
 const rule=sqlRuntimeReleases[L],kind=chatRuntimeKinds[L],roles=[...runtimeRoles,'chat'];
 requireValue(m?.schemaVersion===rule.schemaVersion&&m.release===L&&m.environment==='prod'&&m.scope==='runtime-workers-frontend'&&['prepared','applied'].includes(m.status),'wrong '+L+' package kind');
 requireValue(!requireApplied||m.status==='applied',L+' runtime apply/readback required');
 validateSqlRuntimeSource(m,git,L);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 await validateSqlRuntimeSql(m,git,L);
 validateR074Ci(m.applicationCi,m,git,L,sqlRuntimeDeliveryAllowed(L));
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,L+' PROD image provenance required');
 requireValue(exact(m.recognition,{activation:'enabled',url:R075_RECOGNIZER_URL}),L+' unchanged enabled receipt recognition wiring required');
 requireValue(/^[a-f0-9]{64}$/.test(m.plan?.sha256??'')&&path.isAbsolute(m.plan.path??'')&&exact(m.plan.counts,kind.counts)&&exact(m.plan.actions,kind.actions()),L+' '+kind.planLabel);
 if(kind.readPlan)await kind.readPlan(m,L);
 const recovery=m.rollback;
 requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
 requireValue(plainObject(recovery?.services)&&exact(Object.keys(recovery.services).sort(),[...kind.recoveryRoles].sort()),L+' '+kind.recoveryLabel);
 for(const role of kind.recoveryRoles)requireValue(imagePattern.test(recovery?.services?.[role]?.image??'')&&recovery.services[role].image!==m.build.image&&revisionOf(role).test(recovery.services[role].revision??''),'service recovery pin required');
 if(m.status==='applied'){
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&zulu(m.applied.appliedAt)&&(kind.noSql?m.applied.sqlVersion===rule.sqlTarget&&Date.parse(m.applied.appliedAt)>=Date.parse(m.sql.verified.verifiedAt):kind.imageFirst?m.applied.sqlVersion===rule.sqlBaseline&&Date.parse(m.applied.appliedAt)<=Date.parse(m.sql.applied.startedAt):m.applied.sqlVersion===rule.sqlTarget&&Date.parse(m.applied.appliedAt)>=Date.parse(m.sql.applied.finishedAt)),L+' applied source/plan/database mismatch');
  requireValue(plainObject(m.applied.services)&&exact(Object.keys(m.applied.services).sort(),[...roles].sort()),L+' applied readback must name the five services');
  for(const role of roles){
   const s=m.applied.services[role];
   if(kind.changedRoles&&!kind.changedRoles.includes(role)){requireValue(s?.image===recovery.services[role].image&&s.revision===recovery.services[role].revision&&s.ready===true&&s.trafficPercent===100,L+' unchanged '+role+' must read back on its pinned image and revision');continue;}
   requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&revisionOf(role).test(s.revision??'')&&(kind.newRoles.includes(role)||s.revision!==recovery.services[role].revision),L+' ready service readback required');
  }
 }
 return validatedHostingArtifact(m,recovery,{release:L,chatOrigin:R090_CHAT_ORIGIN});
}
export async function r090HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R090');}
// Live readback of the chat-era runtime: as R089 for the four services, plus command cpu_idle false (absent or false; the
// API omits false), the jobs dispatch wake, the chat and jobs callers on notify, and the chat service (identity, image,
// revision, 300 s timeout, cpu_idle false, dispatch wake, three Gemini models with maxRounds 16). Returns the five live
// service documents for release-specific checks.
// The generic kind passes its delivery allow-list and the current chat rule (R102, with the R108 Claude-only menu).
// `requestCpu` (R107 onwards: the R107 kind and the generic kind): command and chat run with request-based CPU, so their
// cpuIdle must be exactly true; an absent (false) or explicit false value is refused.
async function verifyChatRuntimeLive(m,options,L,{allowed,liveChat=chatRuntimeKinds[L]?.liveChat,requestCpu=chatRuntimeKinds[L]?.requestCpu===true}={}){
 const {token,request=fetch}=options;
 await verifySqlRuntimeLivePackage(m,options,L,...(allowed?[allowed]:[]));
 const get=async role=>{const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');return r.json();};
 const live={};for(const role of [...runtimeRoles,'chat'])live[role]=await get(role);
 const envOf=s=>Object.fromEntries((s.template?.containers?.[0]?.env??[]).map(x=>[x.name,x.value]));
 const dispatch=env=>Object.entries(R090_DISPATCH).every(([name,value])=>env[name]===value);
 // The v2 API omits a false boolean (proto3 JSON): an absent cpuIdle is false. Before R107 only an explicit true is refused.
 const cpuIdle=s=>s.template?.containers?.[0]?.resources?.cpuIdle===true;
 requireValue(cpuIdle(live.command)===requestCpu,L+' live command cpu_idle must be '+requestCpu);
 requireValue(dispatch(envOf(live.jobs)),L+' live jobs dispatch wake drift');
 let subjects;try{subjects=JSON.parse(envOf(live.notify).WORKER_CALLER_SUBJECTS_JSON);}catch{subjects=null;}
 requireValue(plainObject(subjects)&&[`mw-credit-app-chat-prod@${project}.iam.gserviceaccount.com`,`mw-credit-app-jobs-prod@${project}.iam.gserviceaccount.com`].every(email=>/^[0-9]{10,30}$/.test(subjects[email]??'')),L+' live notify callers must include chat and jobs');
 const s=live.chat,env=envOf(s),expected=m.applied.services.chat;
 requireValue(s.name===`projects/${project}/locations/asia-southeast1/services/mw-credit-app-chat-prod`&&s.template?.serviceAccount===`mw-credit-app-chat-prod@${project}.iam.gserviceaccount.com`&&s.template.containers?.[0]?.image===expected.image&&s.latestReadyRevision?.endsWith('/'+expected.revision)&&s.terminalCondition?.state==='CONDITION_SUCCEEDED'&&s.trafficStatuses?.length===1&&s.trafficStatuses[0].percent===100&&s.trafficStatuses[0].revision===expected.revision,L+' live chat revision/identity drift');
 requireValue(env.DB_NAME==='loan_manager_prod'&&env.INSTANCE_CONNECTION_NAME===m.target.connectionName&&env.DB_USER===`mw-credit-app-chat-prod@${project}.iam`,L+' live chat database binding drift');
 requireValue(s.template.timeout==='300s'&&cpuIdle(s)===requestCpu,L+' live chat timeout 300s and cpu_idle '+requestCpu+' required');
 requireValue(dispatch(env),L+' live chat dispatch wake drift');
 let models;try{models=JSON.parse(env.CHAT_MODELS_JSON);}catch{models=null;}
 // R108 onwards ('r108', and 'current' for the generic kind): the chat menu is Claude Opus 5.5 only.
 if(['r102','r106','r108','current'].includes(liveChat)){verifyR102LiveChat(live,env,models,L,['r108','current'].includes(liveChat)?R108_CHAT_MODEL_IDS:R102_CHAT_MODEL_IDS);if(liveChat==='r106'||liveChat==='r108')verifyR106LiveCommandUrl(live,env,L);return live;}
 requireValue(plainObject(models)&&models.maxRounds===16&&Array.isArray(models.models)&&models.models.length===3&&models.models.every(x=>/^gemini-[0-9]+(?:\.[0-9]+)?-[a-z0-9-]+$/.test(x?.id??'')),L+' live chat models must be three Gemini models with maxRounds 16');
 return live;
}
/** Live: as R089 for the four services, plus the chat-era checks (verifyChatRuntimeLive). */
export async function verifyR090LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R090');}

// R091 (Instagram conversation decommission): one new image for the five services (read, command, notify, jobs, chat)
// then the separately applied and verified V107 (PROD 106 to 107; V107 drops the agent-native operation the R090
// command image calls, so the images go first; owner window mw_app_prod_journal_owner). The source descends from the R090 package 297b764 and adds exactly V107, pinned to its reviewed
// SHA-256. The PROD plan is {add:0, change:5, destroy:0}: five images, and command loses its AGENT_CONVERSATION_* env.
// Recovery pins Hosting and all five services (the chat service exists since R090) on the R090 image. The live readback
// keeps R090's checks and refuses any AGENT_CONVERSATION_* env on the five services. The artifact carries the R091 marker
// and the R090 chat origin.
export const R091_PLAN_ACTIONS=Object.freeze(['read.image','command.image','command.conversationEnvRemoved','notify.image','jobs.image','chat.image']);
export function validateR091Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R091');}
export async function validateR091Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R091');}
export async function r091HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R091');}
/** Live: as R090, plus no AGENT_CONVERSATION_* env on any of the five services. */
export async function verifyR091LivePackage(m,options={}){
 const L='R091',live=await verifyChatRuntimeLive(m,options,L);
 for(const [role,s] of Object.entries(live))requireValue((s.template?.containers??[]).every(c=>(c.env??[]).every(x=>!String(x?.name??'').startsWith('AGENT_CONVERSATION_'))),L+' live '+role+' must carry no AGENT_CONVERSATION_* env');
}

// R095 (payer name matching): V111 (PROD 110 to 111, payer lines in "Communication Name", commands schema 8; V110 was
// applied separately) and the one-time payer backfill, then new command and chat images only (reader, notify and jobs stay
// on their pinned R094-era revisions). The source descends from e3d5bc2 (PR #146, V110) and adds exactly V111, pinned to
// its reviewed SHA-256. Plan {add:0, change:2, destroy:0}; SQL first, images after (applied.sqlVersion 111). Live
// readback as R090 (chat-era checks). The artifact carries the R095 marker and the R090 chat origin.
export const R095_PLAN_ACTIONS=Object.freeze(['command.image','chat.image']);
export function validateR095Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R095');}
export async function validateR095Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R095');}
export async function r095HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R095');}
/** Live: as R090 (the five services read back against the applied pins, chat-era checks). */
export async function verifyR095LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R095');}

// R096 (Collection includes every charge dated today, also one paid on an earlier day, with a "Paid in advance" caption):
// no migration (PROD stays 111, read back read-only), then new read, command and chat images (the Collection read
// contract runs in the business runtime of read and command, the chat virtual "Collection Today" in chat; notify and jobs
// stay on their pinned R095-era revisions). The source descends from the R095 package 14c4a40 and adds no file under
// database/migrations. Plan {add:0, change:3, destroy:0}; applied.sqlVersion 111, no earlier than the readback. Live
// readback as R090 (chat-era checks). The artifact carries the R096 marker and the R090 chat origin.
export const R096_PLAN_ACTIONS=Object.freeze(['read.image','command.image','chat.image']);
export function validateR096Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R096');}
export async function validateR096Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R096');}
export async function r096HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R096');}
/** Live: as R095. */
export async function verifyR096LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R096');}

// R097 (Collection board row: the right amount adds what was paid on earlier days toward today's charges, and the status
// line reads "Paid in advance" when every charge dated today was paid earlier; offline tag business-offline-v5): R096's
// kind. No migration (PROD stays 111, read back read-only), then new read, command and chat images; notify and jobs stay
// on their pinned revisions. The source descends from the R096 package 3cbbcea and adds no file under
// database/migrations. Plan {add:0, change:3, destroy:0}. The artifact carries the R097 marker and the R090 chat origin.
export const R097_PLAN_ACTIONS=Object.freeze(['read.image','command.image','chat.image']);
export function validateR097Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R097');}
export async function validateR097Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R097');}
export async function r097HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R097');}
/** Live: as R096. */
export async function verifyR097LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R097');}

// R100 (CI tune-up lint batches: unused code removed, explicit button types, label/control associations and the
// sync-outcome listener reading the latest result and language): R097's kind. No migration (PROD stays 111, read back
// read-only), then new read, command and chat images; notify and jobs stay on their pinned revisions. The source descends
// from the R097 package e040373 and adds no file under database/migrations. Plan {add:0, change:3, destroy:0}. The
// artifact carries the R100 marker and the R090 chat origin.
export const R100_PLAN_ACTIONS=Object.freeze(['read.image','command.image','chat.image']);
export function validateR100Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R100');}
export async function validateR100Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R100');}
export async function r100HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R100');}
/** Live: as R096. */
export async function verifyR100LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R100');}

// R101 (pay the next charge early; Loan Close ignores unpaid interest on future-dated charges): V112 and V113 (PROD 111 to
// 113, one grouped transaction; owner window mw_app_prod_journal_owner for pwa_submit_selected_charges_v1, the other
// replaced and new functions are owned by postgres), then new read, command and chat images; notify and jobs stay on their
// pinned revisions. The source descends from the R100 package c7ea78d and adds exactly V112 and V113, each pinned to its
// reviewed SHA-256 (the bytes applied to DEV at 293c64d). Plan {add:0, change:3, destroy:0}; SQL first, images after
// (applied.sqlVersion 113). Live readback as R090 (chat-era checks). The artifact carries the R101 marker and the R090 chat
// origin.
export const R101_PLAN_ACTIONS=Object.freeze(['read.image','command.image','chat.image']);
export function validateR101Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R101');}
export async function validateR101Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R101');}
export async function r101HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R101');}
/** Live: as R095 (the five services against the applied pins, chat-era checks). */
export async function verifyR101LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R101');}

// R102 (Long overdue collection status; Claude Opus 5.5 chat through the keyless VM relay): V114 and V115 (PROD 113 to 115,
// one grouped transaction; owner window mw_chat_owner_prod for V115, V114 replaces two postgres-owned views), then new read,
// command and chat images; notify and jobs stay on their pinned revisions. The source descends from the R101 package 10d543d
// and adds exactly V114 and V115, each pinned to its reviewed SHA-256 (the bytes applied to DEV). Plan {add:0, change:3,
// destroy:0}: read and command images; on chat the image, CHAT_MODELS_JSON, the added CHAT_RELAY_URL and the added Direct VPC
// egress. SQL first, images after (applied.sqlVersion 115). Live readback as R101 except the chat models: exactly Claude Opus
// 5.5 (default) and the three Gemini models, the relay URL and private-range VPC egress on chat only. The artifact carries the
// R102 marker and the R090 chat origin.
// The plan labels are Forge's reading of the reviewed saved PROD plan, confirmed before any apply; edit them here only.
export const R102_PLAN_ACTIONS=Object.freeze(['read.image','command.image','chat.image','chat.modelsJson','chat.relayUrl','chat.vpcAccess']);
export const R102_CHAT_MODEL_IDS=Object.freeze(['claude-opus-5-5','gemini-4-argon','gemini-3.8-flash','gemini-3.5-flash']);
export const R102_CHAT_RELAY_URL='http://10.148.0.2:8791/v1/chat/messages';
/** The chat models of an era: version 1, global, MEDIUM, maxRounds 16, Claude Opus 5.5 default, exactly `expected`, all available. */
function chatModelsAre(models,expected){
 const ids=Array.isArray(models?.models)?models.models.map(x=>x?.id):[];
 return plainObject(models)&&models.version===1&&models.location==='global'&&models.thinkingLevel==='MEDIUM'&&models.maxRounds===16&&models.default==='claude-opus-5-5'
  &&exact(ids,[...expected])&&models.models.every(x=>x.available===true&&(/^claude-[a-z]+-[0-9]+(?:-[0-9]+)?$/.test(x.id)||/^gemini-[0-9]+(?:\.[0-9]+)?-[a-z0-9-]+$/.test(x.id)));
}
// `ids`: R102 to R107 list Claude Opus 5.5 and the three Gemini models; R108 onwards Claude Opus 5.5 only.
function verifyR102LiveChat(live,env,models,L,ids=R102_CHAT_MODEL_IDS){
 requireValue(chatModelsAre(models,ids),L+' live chat models must be Claude Opus 5.5 '+(ids===R108_CHAT_MODEL_IDS?'only (default), available,':'(default) and the three Gemini models, all available,')+' with maxRounds 16');
 requireValue(env.CHAT_RELAY_URL===R102_CHAT_RELAY_URL,L+' live chat relay URL drift');
 const vpc=live.chat.template?.vpcAccess;
 requireValue(vpc?.egress==='PRIVATE_RANGES_ONLY'&&Array.isArray(vpc.networkInterfaces)&&vpc.networkInterfaces.length===1&&vpc.networkInterfaces[0]?.network==='default'&&vpc.networkInterfaces[0]?.subnetwork==='default',L+' live chat private-range VPC egress required');
 const envOf=s=>Object.fromEntries((s.template?.containers?.[0]?.env??[]).map(x=>[x.name,x.value]));
 for(const role of ['read','notify'])requireValue(envOf(live[role]).CHAT_RELAY_URL===undefined&&live[role].template?.vpcAccess===undefined,L+' live '+role+' must carry no chat relay or VPC egress');
}
export function validateR102Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R102');}
export async function validateR102Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R102');}
export async function r102HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R102');}
/** Live: as R101 plus the R102 chat models, relay URL and VPC egress. */
export async function verifyR102LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R102');}

// R104 (record a loan's future charges from Upcoming Charges, in schedule order): V116 and V117 (PROD 115 to 117, one
// grouped transaction; owner window mw_app_prod_journal_owner only, for pwa_submit_operation_v2; the other replaced and new
// functions are owned by postgres), then new read, command and chat images; notify and jobs stay on their pinned revisions.
// The source descends from the R103 package f576665 and adds exactly V116 and V117, each pinned to its reviewed SHA-256 (the
// bytes applied to DEV, merged as 4e5ba9d). Plan {add:0, change:3, destroy:0}: the three images, no chat configuration
// change. SQL first, images after (applied.sqlVersion 117). Live readback as R102, chat checks unchanged (Claude Opus 5.5
// default and the three Gemini models, relay URL, private-range VPC egress on chat only). The artifact carries the R104
// marker and the R090 chat origin.
export const R104_PLAN_ACTIONS=Object.freeze(['read.image','command.image','chat.image']);
export function validateR104Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R104');}
export async function validateR104Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R104');}
export async function r104HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R104');}
/** Live: as R102 (the five services against the applied pins; the R102 chat models, relay URL and VPC egress). */
export async function verifyR104LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R104');}

// R106 (chat writes: confirm-card financial changes from the in-app chat, one card for several changes): V118 and V119
// (PROD 117 to 119, one grouped transaction; owner window mw_chat_owner_prod only: V118 adds pwa_chat_proposals and its
// RPCs, V119 replaces two chat functions in place), then new read, command and chat images; notify and jobs stay on their
// pinned revisions. The source descends from the R105 release cf01602 and adds exactly V118 and V119, each pinned to its
// reviewed SHA-256 (the bytes at e57e77d, applied to DEV), and exactly four infrastructure/production files
// (chat-service.tf, its test, README.md, READINESS_INVENTORY.md). Plan {add:0, change:3, destroy:0}: the three images and,
// on chat only, the added CHAT_COMMAND_URL (the PROD command service URL); the saved plan's JSON export is read back and
// anything else is refused. SQL first, images after (applied.sqlVersion 119). Live readback as R102 (chat models, relay
// URL, private-range VPC egress on chat only) plus CHAT_COMMAND_URL on chat only. The artifact carries the R106 marker and
// the R090 chat origin.
// The plan labels are Forge's reading of the reviewed saved PROD plan; edit them here only.
export const R106_PLAN_ACTIONS=Object.freeze(['read.image','command.image','chat.image','chat.commandUrl']);
export const R106_CHAT_COMMAND_URL='https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app';
const R106_ROLES=['read','command','chat'];
const anyTrue=value=>value===true||(Array.isArray(value)?value.some(anyTrue):plainObject(value)&&Object.values(value).some(anyTrue));
const withoutEnv=value=>{if(!plainObject(value))return value;const copy=structuredClone(value),container=copy.template?.[0]?.containers?.[0];if(plainObject(container))delete container.env;return copy;};
const envList=value=>value?.template?.[0]?.containers?.[0]?.env??[];
const envByName=list=>Array.isArray(list)&&list.every(x=>plainObject(x)&&typeof x.name==='string')&&new Set(list.map(x=>x.name)).size===list.length?new Map(list.map(x=>[x.name,x])):null;
/** The R106 plan, read back from its JSON export: read, command and chat updated in place, each changing its image only;
 * the env of read and command unchanged; on chat exactly one added env entry, CHAT_COMMAND_URL with the PROD command URL. */
async function readR106Plan(m,L){
 const json=await readPlanExport(m,L),seen=new Set();
 for(const rc of json.resource_changes){
  const actions=rc?.change?.actions;
  if(exact(actions,['no-op'])||exact(actions,['read']))continue;
  const role=/^mw-credit-app-(read|command|notify|jobs|chat)-prod$/.exec(rc?.change?.after?.name??'')?.[1];
  requireValue(rc.type==='google_cloud_run_v2_service'&&exact(actions,['update'])&&R106_ROLES.includes(role)&&rc.change.before?.name===rc.change.after.name&&!seen.has(role),L+' plan may update only the read, command and chat services, once each: '+(rc?.address??'unknown resource'));
  seen.add(role);
  const {before,after,after_unknown:unknown}=rc.change,diffs=planDiffs(withoutEnv(before),withoutEnv(after),withoutEnv(unknown));
  requireValue(exact(diffs,['template.0.containers.0.image']),L+' plan may change only the image (and CHAT_COMMAND_URL on chat): '+rc.address+' changes '+(diffs.join(', ')||'no image'));
  const was=envByName(envList(before)),now=envByName(envList(after));
  requireValue(was&&now&&!anyTrue(unknown?.template?.[0]?.containers?.[0]?.env),L+' plan env unreadable on '+role);
  const added=[...now.keys()].filter(name=>!was.has(name)),removed=[...was.keys()].filter(name=>!now.has(name)),edited=[...now.keys()].filter(name=>was.has(name)&&!isDeepStrictEqual(now.get(name),was.get(name)));
  requireValue(exact(added,role==='chat'?['CHAT_COMMAND_URL']:[])&&removed.length===0&&edited.length===0,L+' plan may add only CHAT_COMMAND_URL on chat: '+role+' env adds '+(added.join(', ')||'nothing')+', removes '+(removed.join(', ')||'nothing')+', changes '+(edited.join(', ')||'nothing'));
  if(role==='chat'){const entry=now.get('CHAT_COMMAND_URL');requireValue(entry.value===R106_CHAT_COMMAND_URL&&(entry.value_source==null||(Array.isArray(entry.value_source)&&entry.value_source.length===0)),L+' plan CHAT_COMMAND_URL must be exactly '+R106_CHAT_COMMAND_URL);}
 }
 requireValue(R106_ROLES.every(role=>seen.has(role)),L+' plan JSON must change read, command and chat (it changes '+([...seen].join(', ')||'nothing')+')');
}
/** R106 live: CHAT_COMMAND_URL on chat only, exactly the PROD command URL. */
function verifyR106LiveCommandUrl(live,env,L){
 requireValue(env.CHAT_COMMAND_URL===R106_CHAT_COMMAND_URL,L+' live chat CHAT_COMMAND_URL must be '+R106_CHAT_COMMAND_URL);
 for(const role of runtimeRoles)requireValue((live[role].template?.containers??[]).every(c=>(c.env??[]).every(x=>x?.name!=='CHAT_COMMAND_URL')),L+' live '+role+' must carry no CHAT_COMMAND_URL');
}
export function validateR106Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R106');}
export async function validateR106Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R106');}
export async function r106HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R106');}
/** Live: as R104 (the R102 chat check) plus CHAT_COMMAND_URL on chat only. */
export async function verifyR106LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R106');}

// R107 (request-based CPU for the command and chat services; the post-commit notification wake is handed off before the
// reply, at most 2 s): no migration (a read-only V119 readback), then new read, command and chat images
// (runtime_image_overrides); notify and jobs stay on their pinned image and revision (business_image unchanged; the jobs
// wake keeps its full in-request wait, as the R106 image already does). The source descends from the R106 release
// e57e77d and carries no migration and exactly four infrastructure/production files (runtime.tf and chat-service.tf with
// their tests). Plan {add:0, change:3, destroy:0}: the three images and, on command and chat, cpu_idle false to true; the
// saved plan's JSON export is read back and anything else is refused. Live readback as R106 (the R102 chat check and
// CHAT_COMMAND_URL on chat only) with command and chat cpuIdle exactly true. The artifact carries the R107 marker and the
// R090 chat origin.
// The plan labels are Forge's reading of the reviewed saved PROD plan; edit them here only.
export const R107_PLAN_ACTIONS=Object.freeze(['read.image','command.image','command.cpuIdle','chat.image','chat.cpuIdle']);
const R107_ROLES=['read','command','chat'],R107_CPU_ROLES=['command','chat'],R107_IMAGE='template.0.containers.0.image',R107_CPU_IDLE='template.0.containers.0.resources.0.cpu_idle';
/** The R107 plan, read back from its JSON export: read, command and chat updated in place, once each; each changes its
 * image only, and command and chat also change cpu_idle from false to true. */
async function readR107Plan(m,L){
 const json=await readPlanExport(m,L),seen=new Set();
 for(const rc of json.resource_changes){
  const actions=rc?.change?.actions;
  if(exact(actions,['no-op'])||exact(actions,['read']))continue;
  const role=/^mw-credit-app-(read|command|notify|jobs|chat)-prod$/.exec(rc?.change?.after?.name??'')?.[1];
  requireValue(rc.type==='google_cloud_run_v2_service'&&exact(actions,['update'])&&R107_ROLES.includes(role)&&rc.change.before?.name===rc.change.after.name&&!seen.has(role),L+' plan may update only the read, command and chat services, once each: '+(rc?.address??'unknown resource'));
  seen.add(role);
  const {before,after,after_unknown:unknown}=rc.change,diffs=planDiffs(before,after,unknown).sort(),cpu=R107_CPU_ROLES.includes(role);
  // planDiffs skips a subtree Terraform marks unknown, so the container (its env and resources, any part) must be known.
  const t=unknown?.template,c=t?.[0]?.containers?.[0];
  requireValue(![t,t?.[0],t?.[0]?.containers,c].includes(true)&&!anyTrue(c?.env)&&!anyTrue(c?.resources),L+' plan env or resources unknown on '+role);
  requireValue(exact(diffs,cpu?[R107_IMAGE,R107_CPU_IDLE].sort():[R107_IMAGE]),L+' plan may change only the image (and cpu_idle on command and chat): '+rc.address+' changes '+(diffs.join(', ')||'nothing'));
  if(cpu){const resources=x=>x?.template?.[0]?.containers?.[0]?.resources?.[0];requireValue(resources(before)?.cpu_idle===false&&resources(after)?.cpu_idle===true,L+' plan must move '+role+' cpu_idle from false to true');}
 }
 requireValue(R107_ROLES.every(role=>seen.has(role)),L+' plan JSON must change read, command and chat (it changes '+([...seen].join(', ')||'nothing')+')');
}
export function validateR107Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R107');}
export async function validateR107Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R107');}
export async function r107HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R107');}
/** Live: as R106 (the R102 chat check and CHAT_COMMAND_URL on chat only) with command and chat cpuIdle exactly true. */
export async function verifyR107LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R107');}

// R108 (the chat model menu is Claude only; Gemini stays only for receipt OCR on the VM): no migration (a read-only V119
// readback), then a new chat image (runtime_image_overrides, rebuilt from the R108 source) with CHAT_MODELS_JSON listing
// exactly Claude Opus 5.5 (default); read, command, notify and jobs stay on their pinned image and revision. The source
// descends from the R107 release 1befbb8 and carries no migration and exactly two infrastructure/production files
// (chat-service.tf and its test). Plan {add:0, change:1, destroy:0}: on chat the image and the CHAT_MODELS_JSON value; the
// saved plan's JSON export is read back and anything else is refused. Live readback as R107 with the Claude-only menu. The
// PWA falls back to the default model for a thread still on a Gemini model. The artifact carries the R108 marker and the
// R090 chat origin.
// The plan labels are Forge's reading of the reviewed saved PROD plan; edit them here only.
export const R108_PLAN_ACTIONS=Object.freeze(['chat.image','chat.modelsJson']);
export const R108_CHAT_MODEL_IDS=Object.freeze(['claude-opus-5-5']);
/** The R108 plan, read back from its JSON export: chat updated in place once, changing its image and, in its env, only the
 * CHAT_MODELS_JSON value, which must list exactly Claude Opus 5.5 (default); the container must be fully known. */
async function readR108Plan(m,L){
 const json=await readPlanExport(m,L);let chat=false;
 for(const rc of json.resource_changes){
  const actions=rc?.change?.actions;
  if(exact(actions,['no-op'])||exact(actions,['read']))continue;
  requireValue(rc.type==='google_cloud_run_v2_service'&&exact(actions,['update'])&&rc.change.after?.name==='mw-credit-app-chat-prod'&&rc.change.before?.name===rc.change.after.name&&!chat,L+' plan may update only the chat service, once: '+(rc?.address??'unknown resource'));
  chat=true;
  const {before,after,after_unknown:unknown}=rc.change,t=unknown?.template,c=t?.[0]?.containers?.[0];
  requireValue(![t,t?.[0],t?.[0]?.containers,c].includes(true)&&!anyTrue(c?.env)&&!anyTrue(c?.resources),L+' plan env or resources unknown on chat');
  const diffs=planDiffs(withoutEnv(before),withoutEnv(after),withoutEnv(unknown));
  requireValue(exact(diffs,['template.0.containers.0.image']),L+' plan may change only the chat image and CHAT_MODELS_JSON: '+rc.address+' changes '+(diffs.join(', ')||'no image'));
  const was=envByName(envList(before)),now=envByName(envList(after));
  requireValue(was&&now,L+' plan env unreadable on chat');
  const added=[...now.keys()].filter(name=>!was.has(name)),removed=[...was.keys()].filter(name=>!now.has(name)),edited=[...now.keys()].filter(name=>was.has(name)&&!isDeepStrictEqual(now.get(name),was.get(name)));
  requireValue(added.length===0&&removed.length===0&&exact(edited,['CHAT_MODELS_JSON']),L+' plan may change only CHAT_MODELS_JSON in the chat env: adds '+(added.join(', ')||'nothing')+', removes '+(removed.join(', ')||'nothing')+', changes '+(edited.join(', ')||'nothing'));
  const entry=now.get('CHAT_MODELS_JSON'),json=value=>{try{return JSON.parse(value);}catch{return null;}},models=json(entry.value),previous=json(was.get('CHAT_MODELS_JSON').value);
  requireValue((entry.value_source==null||(Array.isArray(entry.value_source)&&entry.value_source.length===0))&&chatModelsAre(models,R108_CHAT_MODEL_IDS),L+' plan CHAT_MODELS_JSON must list exactly Claude Opus 5.5 (default)');
  // Only the model list and the default change: every other CHAT_MODELS_JSON field (timeouts, history and seed limits,
  // output tokens, rounds, thinking level, location, version) must equal the value before.
  const rest=value=>{if(!plainObject(value))return null;const {models:_m,default:_d,...other}=value;return other;},kept=rest(previous);
  requireValue(kept!==null&&isDeepStrictEqual(rest(models),kept),L+' plan CHAT_MODELS_JSON may change only models and default (other fields must equal the previous value)');
 }
 requireValue(chat,L+' plan JSON must change the chat service');
}
export function validateR108Source(m,git=sourceGit){return validateSqlRuntimeSource(m,git,'R108');}
export async function validateR108Sql(m,git=sourceGit){return validateSqlRuntimeSql(m,git,'R108');}
export async function r108HostingPlan(m,{requireApplied=true,git=sourceGit}={}){return chatRuntimeHostingPlan(m,{requireApplied,git},'R108');}
/** Live: as R107 (request-based CPU, CHAT_COMMAND_URL on chat only) with the chat menu exactly Claude Opus 5.5. */
export async function verifyR108LivePackage(m,options={}){await verifyChatRuntimeLive(m,options,'R108');}

/** Verify the supplied token itself and a signed, audience-bound impersonation proof. */
export async function verifyAppOnlyOperator({token,impersonationToken=token,release='R059',request=fetch,verifyIdToken=async(idToken,audience)=>(await new OAuth2Client().verifyIdToken({idToken,audience})).getPayload()}){
 requireValue(typeof token==='string'&&token.length>0,'operator token required');
 const call=async(url,body)=>{const r=await request(url,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+(body?impersonationToken:token),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});requireValue(r.ok,'operator verification failed');return r.json();};
 const identity=await call('https://oauth2.googleapis.com/tokeninfo?access_token='+encodeURIComponent(token));requireValue(Number(identity.expires_in)>0,'expired access token');
 const service=await call(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${admin}`);requireValue(service.email===admin&&service.projectId===project&&/^\d+$/.test(service.uniqueId??''),'wrong impersonated service account');
 requireValue(identity.email===admin||(!identity.email&&identity.aud===service.oauth2ClientId&&identity.azp===service.oauth2ClientId&&service.oauth2ClientId===service.uniqueId),'wrong access-token principal');
 requireValue(['R059','R061','R062','R063','R064','R065','R066','R068','R069','R070','R071','R072','R073','R074','R075','R076','R077','R078','R079','R080','R081','R083','R089','R090','R091','R095','R096','R097','R100','R101','R102','R103','R104','R106','R107','R108'].includes(release)||genericRelease(release),'unsupported operator release');const audience='https://lm.mw-credit.com/promotion/'+release.toLowerCase();const signed=await call(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${admin}:generateIdToken`,{audience,includeEmail:true});const proof=await verifyIdToken(signed.token,audience);requireValue(proof?.email===admin&&proof.email_verified===true&&proof.sub===service.uniqueId&&proof.aud===audience,'wrong signed impersonation proof');
 for(const site of [prodSite,'mw-credit-app-dev-737787224638'])requireValue((await call(`https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites/${site}`)).name===`projects/${project}/sites/${site}`,'wrong live Hosting target');
 return {operator:admin,verification:'token principal and signed impersonation proof'};
}

export async function verifyAppOnlyLivePackage(m,{token,request=fetch,readGithub,settings=false,verifyCi}){
 requireValue(path.isAbsolute(m.plan.path??'')&&sha(await readFile(m.plan.path))===m.plan.sha256,'saved plan changed');
 const get=async url=>{const r=await request(url,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');return r.json();};
 // The image build is read regionally; only a regional 404 falls back to the global location (R102's PROD build was
 // submitted globally). A global build must name the recorded build id and the project; every check below stays exact.
 const buildUrl=location=>`https://cloudbuild.googleapis.com/v1/projects/${project}/locations/${location}/builds/${encodeURIComponent(m.build.id)}`;
 let build;{const regional=await request(buildUrl('asia-southeast1'),{redirect:'error',headers:{Authorization:'Bearer '+token}});
  if(regional.ok)build=await regional.json();
  else{requireValue(regional.status===404,'live package readback failed');build=await get(buildUrl('global'));requireValue(build?.id===m.build.id&&build.projectId===project,'live global build identity mismatch');}}
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

// Generic release kind (R105 onwards; schemaVersion 36, kindRule 'generic-v1'): no per-release code. The operator supplies
// the manifest (release, scope, source and baseline commits, target, build, reviewed plan, rollback pins, applied readback,
// the DEV SQL release evidence with the PROD apply and readback, the declared owner windows, the delivery tool and the CI
// receipts); the runner derives from the repository and checks against it:
// - baseline: the highest RNNN release tag below the release; it must equal sourceBaseline and be an ancestor of the source;
// - SQL: the highest migration version at the baseline and at the source; the migrations are the files added between them,
//   exactly V(baseline+1) to V(target), each hashed from the source commit and equal to the DEV release manifest;
// - roles: the services whose image changes: the services whose entry points reach a changed file (GENERIC_ROLE_ENTRIES);
// - plan: read back from the saved plan and its JSON export: image-only updates of exactly the changed services;
// - tags: from origin; the release itself must not be tagged yet.
// Order: SQL first, then the images. The live readback is the chat-era one with the current chat check (R102's, with
// the R108 Claude-only menu); unchanged services must read back on their pinned image and revision. Anything the derivation cannot express (a new service, a
// non-image Terraform action, infrastructure changes, recognizer wiring, images before SQL, a new scope) still needs a
// hand-written kind.
const GENERIC_SCHEMA=36,GENERIC_RULE='generic-v1',GENERIC_FIRST=105;
const genericRelease=release=>typeof release==='string'&&/^R[0-9]{3}$/.test(release)&&Number(release.slice(1))>=GENERIC_FIRST;
export const GENERIC_ROLES=Object.freeze(['read','command','notify','jobs','chat']);
// Each service's entry point in the image (Dockerfile copies services/; infrastructure/production/runtime.tf runs read and
// command on services/production/business-server.mjs, or services/production/server.mjs before the business runtime;
// the workers module runs notify and jobs on services/workers/server.mjs; chat-service.tf runs services/chat/server.mjs).
export const GENERIC_ROLE_ENTRIES=Object.freeze({
 read:Object.freeze(['services/production/business-server.mjs','services/production/server.mjs']),
 command:Object.freeze(['services/production/business-server.mjs','services/production/server.mjs']),
 notify:Object.freeze(['services/workers/server.mjs']),
 jobs:Object.freeze(['services/workers/server.mjs']),
 chat:Object.freeze(['services/chat/server.mjs'])});
const genericImageInputs=['services','Dockerfile','.dockerignore','.gcloudignore','package.json','package-lock.json','cloudbuild-command.yaml','cloudbuild-business.yaml'];
const genericInfrastructure=['infrastructure/production','infrastructure/modules'];
const underAny=(file,prefixes)=>prefixes.some(prefix=>file===prefix||file.startsWith(prefix+'/'));
// Relative references a module makes: static and side-effect imports, re-exports, literal dynamic imports (also JSDoc
// import() types, an over-approximation) and `new URL('./file', import.meta.url)` files read at run time.
const referencePatterns=[/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g,/\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g,/\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,/\bnew\s+URL\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g];
/** Per service, every file under services/ its entry points reach through relative references (`read` returns a file's text). */
export function genericRoleClosures(files,read){
 const closures={};
 for(const [role,entries] of Object.entries(GENERIC_ROLE_ENTRIES)){
  requireValue(entries.some(entry=>files.has(entry)),'generic role entry missing for '+role);
  const seen=new Set(),stack=entries.filter(entry=>files.has(entry));
  while(stack.length){
   const file=stack.pop();if(seen.has(file))continue;seen.add(file);
   if(!/\.(?:mjs|js|cjs)$/.test(file))continue;
   const text=read(file);
   for(const pattern of referencePatterns)for(const match of text.matchAll(pattern)){const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));if(files.has(target)&&!seen.has(target))stack.push(target);}
  }
  closures[role]=seen;
 }
 return closures;
}
/** The services whose image the changed files change, in canonical order. A services/ file changes the services whose
 * entry points reach it; one no entry reaches, and every other image input, changes all five. Type declarations and a
 * scripts-only package.json change none. */
export function genericChangedRoles(files,{closures,packageScriptsOnly=false}){
 const roles=new Set();
 for(const file of files){
  if((file==='package.json'&&packageScriptsOnly)||!underAny(file,genericImageInputs)||/^services\/.+\.d\.[cm]?ts$/.test(file))continue;
  const reached=file.startsWith('services/')?GENERIC_ROLES.filter(role=>closures[role].has(file)):[];
  for(const role of reached.length?reached:GENERIC_ROLES)roles.add(role);
 }
 return GENERIC_ROLES.filter(role=>roles.has(role));
}
const genericDeliveryAllowed=file=>runtimeDeliveryAllowed(file)||['scripts/promotion/README.md','scripts/database/Backup-ProductionPromotion.py','scripts/database/R053_OPERATOR.md','scripts/database/connect_preflight.py','scripts/database/test_connect_preflight.py'].includes(file);
const migrationVersion=file=>{const match=/^database\/migrations\/V([1-9][0-9]*)__[^/]+\.sql$/.exec(file);return match?Number(match[1]):null;};
const migrationFilesAt=(git,root,commit)=>git(root,['ls-tree','-r','--name-only',commit,'--','database/migrations']).split('\n').filter(Boolean);
const highestVersion=files=>Math.max(0,...files.map(migrationVersion).filter(version=>version!==null));
const handWrittenReleases=()=>new Set([...HOSTING_KINDS.map(row=>row.kind),...Object.keys(hostingOnlyReleases),...Object.keys(sqlRuntimeReleases)].filter(x=>/^R[0-9]{3}$/.test(x)));
export function genericKindMatches(m){return m?.schemaVersion===GENERIC_SCHEMA&&m.kindRule===GENERIC_RULE&&genericRelease(m.release)&&!handWrittenReleases().has(m.release)&&['runtime-workers-frontend','frontend-only'].includes(m.scope);}
/** Repository facts of a generic package: the previous release tag, the SQL range and its new migrations, the changed roles. */
export function deriveGenericRelease(m,git=sourceGit){
 const L=m.release,number=Number(L.slice(1));
 requireValue(/^[a-f0-9]{40}$/.test(m.sourceCommit??'')&&m.artifactSourceCommit===m.sourceCommit&&/^[a-f0-9]{40}$/.test(m.sourceBaseline??''),'exact '+L+' source/baseline required');
 requireValue(path.isAbsolute(m.repoRoot??'')&&path.isAbsolute(m.artifactRoot??''),'absolute source/artifact roots required');
 requireValue(git(m.repoRoot,['rev-parse','--verify',m.sourceCommit+'^{commit}'])===m.sourceCommit,L+' unknown source commit');
 // Release tags come from origin (peeled), so a missing or stale local tag cannot choose the baseline; every local release
 // tag must exist on origin at the same commit, and the release itself must not be tagged yet.
 const remote=new Map();
 for(const line of git(m.repoRoot,['ls-remote','--tags','origin']).split('\n').filter(Boolean)){const [commit,ref]=line.split('\t'),match=/^refs\/tags\/(R[0-9]{3})(\^\{\})?$/.exec(ref??'');if(match&&/^[a-f0-9]{40}$/.test(commit)&&(match[2]||!remote.has(match[1])))remote.set(match[1],commit);}
 const local=git(m.repoRoot,['tag','--list','R[0-9][0-9][0-9]']).split('\n').map(x=>x.trim()).filter(x=>/^R[0-9]{3}$/.test(x));
 for(const tag of local)requireValue(remote.get(tag)===git(m.repoRoot,['rev-parse','--verify','refs/tags/'+tag+'^{commit}']),L+' local release tag '+tag+' differs from origin');
 requireValue(!remote.has(L)&&!local.includes(L),L+' release tag already exists');
 const tags=[...remote.keys()].filter(x=>Number(x.slice(1))<number).sort();
 requireValue(tags.length>0,L+' no previous release tag on origin');
 const tag=tags.at(-1),baseline=remote.get(tag);
 requireValue(m.sourceBaseline===baseline,L+' source baseline must be the previous release tag '+tag);
 requireValue(git(m.repoRoot,['merge-base',baseline,m.sourceCommit])===baseline,L+' source must descend from the '+tag+' release');
 const before=migrationFilesAt(git,m.repoRoot,baseline),after=migrationFilesAt(git,m.repoRoot,m.sourceCommit),known=new Set(before);
 const sqlBaseline=highestVersion(before),sqlTarget=highestVersion(after);
 const added=strictNames(git,m.repoRoot,baseline,m.sourceCommit,['database/migrations']);
 requireValue(added.every(file=>migrationVersion(file)!==null&&!known.has(file)&&after.includes(file)),L+' may only add new versioned migrations');
 const versions=added.map(migrationVersion).sort((a,b)=>a-b);
 requireValue(sqlTarget>=sqlBaseline&&exact(versions,Array.from({length:sqlTarget-sqlBaseline},(_,i)=>sqlBaseline+1+i)),L+' migrations must be exactly V'+(sqlBaseline+1)+' to V'+sqlTarget+', each once');
 const migrations=[...added].sort((a,b)=>migrationVersion(a)-migrationVersion(b)).map(file=>path.posix.basename(file));
 const changed=strictNames(git,m.repoRoot,baseline,m.sourceCommit);
 const packageScriptsOnly=changed.includes('package.json')&&(()=>{const b=withoutScripts(git,m.repoRoot,baseline),a=withoutScripts(git,m.repoRoot,m.sourceCommit);return !!(a&&b&&isDeepStrictEqual(a,b));})();
 const tree=new Set(git(m.repoRoot,['ls-tree','-r','--name-only',m.sourceCommit,'--','services']).split('\n').filter(Boolean));
 const closures=genericRoleClosures(tree,file=>git(m.repoRoot,['show',m.sourceCommit+':'+file]));
 return {tag,baseline,sqlBaseline,sqlTarget,migrations,changed,packageScriptsOnly,changedRoles:genericChangedRoles(changed,{closures,packageScriptsOnly}),infrastructure:changed.filter(file=>underAny(file,genericInfrastructure))};
}
function validateGenericSource(m,git,L){
 const tool=m.deliveryToolSource??m.sourceCommit;
 requireValue(/^[a-f0-9]{40}$/.test(tool)&&git(m.repoRoot,['rev-parse','HEAD'])===tool,L+' delivery source mismatch');
 if(tool!==m.sourceCommit){requireValue(git(m.repoRoot,['merge-base',m.sourceCommit,tool])===m.sourceCommit,L+' delivery source must descend from the pinned source');requireValue(strictNames(git,m.repoRoot,m.sourceCommit,tool).every(genericDeliveryAllowed)&&m.deliveryToolChecks?.command==='node --test tests/unit/business-hosting-delivery.test.mjs'&&m.deliveryToolChecks.exitCode===0,L+' unverified delivery correction');}
 requireValue(git(m.repoRoot,['diff','--name-only',tool,'--no-renames','-z','--',...runtimeInputs,'scripts/promotion'])==='',L+' working input drift');
 requireValue(git(m.repoRoot,['ls-files','--others','--exclude-standard','--',...runtimeInputs,'scripts/promotion'])==='',L+' untracked input');
}
const ownerWindowPattern=/^mw_[a-z][a-z0-9_]*_owner(?:_prod)?$/;
function validateGenericSql(m,facts,L){
 const windows=m.ownerWindows;
 requireValue(Array.isArray(windows)&&new Set(windows).size===windows.length&&windows.every(x=>typeof x==='string'&&ownerWindowPattern.test(x)&&!/(?:^|_)dev(?:_|$)/.test(x))&&(facts.migrations.length>0||windows.length===0),L+' declared PROD owner windows required (none without a migration)');
 if(facts.migrations.length)return false;
 const v=m.sql?.verified,V=facts.sqlTarget;
 requireValue(plainObject(m.sql)&&exact(Object.keys(m.sql).sort(),['baselineVersion','migrations','targetVersion','verified'])&&m.sql.baselineVersion===V&&m.sql.targetVersion===V&&exact(m.sql.migrations,[])&&v?.database==='loan_manager_prod'&&v.latestVersion===String(V)&&v.historyRows===V&&v.allSuccessful===true&&zulu(v.verifiedAt),L+' read-only V'+V+' readback with no migration required');
 return true;
}
const recoveryHosting=(recovery)=>requireValue(/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(recovery?.hostingVersion??'')&&/^sites\/mw-credit-prod-737787224638\/releases\/[0-9]+$/.test(recovery?.hostingRelease??''),'Hosting recovery pins required');
// The reviewed plan is read back, not taken from the manifest: the saved binary plan (`plan.path`, `plan.sha256`) and its
// `terraform show -json` export (`plan.jsonPath`, `plan.jsonSha256`). Every resource change other than a no-op or a data
// read must be an in-place update of a mw-credit-app-<role>-prod Cloud Run service whose only configured difference is the
// container image (attributes Terraform marks unknown after apply are computed and ignored).
function planDiffs(before,after,unknown,at=''){
 if(unknown===true||isDeepStrictEqual(before,after))return [];
 const arrays=Array.isArray(before)&&Array.isArray(after)&&before.length===after.length;
 if(!arrays&&!(plainObject(before)&&plainObject(after)))return [at||'(resource)'];
 const keys=arrays?before.map((_,i)=>String(i)):[...new Set([...Object.keys(before),...Object.keys(after)])];
 return keys.flatMap(key=>planDiffs(before[key],after[key],plainObject(unknown)||Array.isArray(unknown)?unknown[key]:undefined,at?at+'.'+key:key));
}
/** The saved plan and its `terraform show -json` export, both checked against their pinned hashes (generic kind, R106). */
async function readPlanExport(m,L){
 const p=m.plan;
 requireValue(/^[a-f0-9]{64}$/.test(p?.sha256??'')&&path.isAbsolute(p.path??'')&&/^[a-f0-9]{64}$/.test(p.jsonSha256??'')&&path.isAbsolute(p.jsonPath??''),L+' reviewed plan and its JSON export required');
 requireValue(sha(await readFile(p.path))===p.sha256,L+' saved plan changed');
 const bytes=await readFile(p.jsonPath);requireValue(sha(bytes)===p.jsonSha256,L+' plan JSON export changed');
 let json;try{json=JSON.parse(bytes.toString('utf8'));}catch{json=null;}
 requireValue(plainObject(json)&&Array.isArray(json.resource_changes),L+' plan JSON export unreadable');
 return json;
}
async function readGenericPlan(m,L){
 const json=await readPlanExport(m,L);
 const changed=[];
 for(const rc of json.resource_changes){
  const actions=rc?.change?.actions;
  if(exact(actions,['no-op'])||exact(actions,['read']))continue;
  const role=/^mw-credit-app-(read|command|notify|jobs|chat)-prod$/.exec(rc?.change?.after?.name??'')?.[1];
  requireValue(rc.type==='google_cloud_run_v2_service'&&exact(actions,['update'])&&role&&rc.change.before?.name===rc.change.after.name,L+' generic plan may change images only: '+(rc?.address??'unknown resource'));
  const diffs=planDiffs(rc.change.before,rc.change.after,rc.change.after_unknown);
  requireValue(diffs.length>0&&diffs.every(d=>d==='template.0.containers.0.image'),L+' generic plan may change images only: '+rc.address+' changes '+diffs.join(', '));
  requireValue(!changed.includes(role+'.image'),L+' generic plan changes '+role+' twice');changed.push(role+'.image');
 }
 return GENERIC_ROLES.map(role=>role+'.image').filter(action=>changed.includes(action));
}
export async function genericHostingPlan(m,{requireApplied=true,git=sourceGit}={}){
 requireValue(genericKindMatches(m)&&m.environment==='prod','wrong generic package kind');
 const L=m.release,facts=deriveGenericRelease(m,git);
 validateGenericSource(m,git,L);
 requireValue(exact(m.target,{projectId:project,projectNumber:'737787224638',region:'asia-southeast1',site:prodSite,database:'loan_manager_prod',connectionName:project+':asia-southeast1:mw-credit-pg-20261017',canonicalOrigin:'https://lm.mw-credit.com'}),'wrong production target');
 requireValue(facts.infrastructure.length===0,L+' generic kind cannot carry infrastructure changes: '+facts.infrastructure.join(', '));
 validateR074Ci(m.applicationCi,m,git,L,genericDeliveryAllowed);
 const recovery=m.rollback;recoveryHosting(recovery);
 if(m.scope==='frontend-only'){
  requireValue(m.status==='prepared'&&!m.build&&!m.plan&&!m.applied&&!m.activation,L+' frontend-only package must not apply runtime or infrastructure changes');
  const runtime=facts.changed.filter(file=>underAny(file,r065RuntimeInputs)&&!(file==='package.json'&&facts.packageScriptsOnly)&&!/^database\/(?!migrations\/).+\.md$/.test(file));
  requireValue(facts.migrations.length===0&&runtime.length===0,L+' frontend-only must not change runtime inputs or SQL: '+[...facts.migrations,...runtime].join(', '));
  validateGenericSql(m,facts,L);
  const pins=m.runtime?.services;
  requireValue(plainObject(pins)&&exact(Object.keys(pins).sort(),[...GENERIC_ROLES].sort())&&GENERIC_ROLES.every(role=>imagePattern.test(pins[role]?.image??'')&&revisionOf(role).test(pins[role]?.revision??'')),L+' unchanged runtime pins required: the five services on their PROD revisions and images');
  return validatedHostingArtifact(m,recovery,{release:L,chatOrigin:R090_CHAT_ORIGIN});
 }
 requireValue(['prepared','applied'].includes(m.status),'wrong generic package kind');
 requireValue(!requireApplied||m.status==='applied',L+' runtime apply/readback required');
 const roles=facts.changedRoles;requireValue(roles.length>0,L+' changes no service image; use scope frontend-only');
 const readbackOnly=validateGenericSql(m,facts,L);
 if(!readbackOnly)await validatePromotionSql(m,git,{label:L,baseline:facts.sqlBaseline,target:facts.sqlTarget,migrations:facts.migrations});
 requireValue(m.build?.sourceCommit===m.sourceCommit&&m.build.status==='SUCCESS'&&imagePattern.test(m.build.image??'')&&typeof m.build.id==='string'&&m.build.id.length>0,L+' PROD image provenance required');
 requireValue(exact(m.recognition,{activation:'enabled',url:R075_RECOGNIZER_URL}),L+' unchanged enabled receipt recognition wiring required');
 const actions=m.plan?.actions;
 requireValue(Array.isArray(actions)&&actions.every(action=>typeof action==='string'&&GENERIC_ROLES.some(role=>action===role+'.image')),L+' generic plan may change images only');
 const planned=await readGenericPlan(m,L);
 requireValue(exact(planned,roles.map(role=>role+'.image'))&&exact(actions,planned)&&exact(m.plan.counts,{add:0,change:roles.length,destroy:0}),L+' reviewed plan must change exactly the images of '+roles.join(', ')+' (the plan JSON changes '+(planned.join(', ')||'nothing')+')');
 requireValue(plainObject(recovery?.services)&&exact(Object.keys(recovery.services).sort(),[...GENERIC_ROLES].sort()),L+' recovery pins exactly the five services');
 for(const role of GENERIC_ROLES)requireValue(imagePattern.test(recovery.services[role]?.image??'')&&revisionOf(role).test(recovery.services[role]?.revision??'')&&(!roles.includes(role)||recovery.services[role].image!==m.build.image),'service recovery pin required');
 if(m.status==='applied'){
  const after=readbackOnly?m.sql.verified.verifiedAt:m.sql.applied.finishedAt;
  requireValue(m.applied?.sourceCommit===m.sourceCommit&&m.applied.planSha256===m.plan.sha256&&m.applied.database==='loan_manager_prod'&&m.applied.sqlVersion===facts.sqlTarget&&zulu(m.applied.appliedAt)&&Date.parse(m.applied.appliedAt)>=Date.parse(after),L+' applied source/plan/database mismatch (SQL first, then the images)');
  requireValue(plainObject(m.applied.services)&&exact(Object.keys(m.applied.services).sort(),[...GENERIC_ROLES].sort()),L+' applied readback must name the five services');
  for(const role of GENERIC_ROLES){
   const s=m.applied.services[role];
   if(!roles.includes(role)){requireValue(s?.image===recovery.services[role].image&&s.revision===recovery.services[role].revision&&s.ready===true&&s.trafficPercent===100,L+' unchanged '+role+' must read back on its pinned image and revision');continue;}
   requireValue(s?.image===m.build.image&&s.ready===true&&s.trafficPercent===100&&revisionOf(role).test(s.revision??'')&&s.revision!==recovery.services[role].revision,L+' ready service readback required');
  }
 }
 return validatedHostingArtifact(m,recovery,{release:L,chatOrigin:R090_CHAT_ORIGIN});
}
/** Live: the chat-era readback with the current chat check (R108 menu); a frontend-only package re-reads CI and the five pins. */
export async function verifyGenericLivePackage(m,options={}){
 const L=m.release;
 // R107 moved command and chat to request-based CPU; the generic kind cannot change that (no infrastructure changes).
 if(m.scope!=='frontend-only'){await verifyChatRuntimeLive(m,options,L,{allowed:genericDeliveryAllowed,liveChat:'current',requestCpu:true});return;}
 const {token,request=fetch,readGithub,git=sourceGit}=options;
 const gh=readGithub??(args=>{const r=spawnSync('gh',args,{encoding:'utf8',maxBuffer:8*1024*1024});requireValue(r.status===0,'actual GitHub CI readback failed');return JSON.parse(r.stdout)});
 await verifyPerJobCiLive(m,gh,git,L,genericDeliveryAllowed);
 const live={};
 for(const role of GENERIC_ROLES){
  const r=await request(`https://run.googleapis.com/v2/projects/${project}/locations/asia-southeast1/services/mw-credit-app-${role}-prod`,{redirect:'error',headers:{Authorization:'Bearer '+token}});requireValue(r.ok,'live package readback failed');
  const s=await r.json(),pin=m.runtime.services[role];live[role]=s;
  requireValue(s.template?.containers?.[0]?.image===pin.image&&s.latestReadyRevision?.endsWith('/'+pin.revision)&&s.terminalCondition?.state==='CONDITION_SUCCEEDED'&&s.trafficStatuses?.length===1&&s.trafficStatuses[0].percent===100&&s.trafficStatuses[0].revision===pin.revision,L+' live '+role+' differs from its pinned image and revision');
 }
 const env=Object.fromEntries((live.chat.template?.containers?.[0]?.env??[]).map(x=>[x.name,x.value]));let models;try{models=JSON.parse(env.CHAT_MODELS_JSON);}catch{models=null;}
 requireValue(live.chat.template?.serviceAccount===`mw-credit-app-chat-prod@${project}.iam.gserviceaccount.com`,L+' live chat identity drift');
 verifyR102LiveChat(live,env,models,L,R108_CHAT_MODEL_IDS);
}

// Every current package kind in one row: its matcher (first match wins, in this order), its plan, its operator audience
// release and its live verifier. The --check and --apply paths read only this table, so a kind cannot reach another kind's
// verifier (the R104 apply was refused because the old if-chain had no R104 live branch). R061 and R059 keep the default
// operator audience (R059); a package no row matches is the legacy business package.
export const HOSTING_KINDS=Object.freeze([
 {kind:'R108',match:i=>i.schemaVersion===39&&i.release==='R108',plan:(i,o)=>r108HostingPlan(i,o),operatorRelease:()=>'R108',live:(i,o)=>verifyR108LivePackage(i,o)},
 {kind:'R107',match:i=>i.schemaVersion===38&&i.release==='R107',plan:(i,o)=>r107HostingPlan(i,o),operatorRelease:()=>'R107',live:(i,o)=>verifyR107LivePackage(i,o)},
 {kind:'R106',match:i=>i.schemaVersion===37&&i.release==='R106',plan:(i,o)=>r106HostingPlan(i,o),operatorRelease:()=>'R106',live:(i,o)=>verifyR106LivePackage(i,o)},
 {kind:'R104',match:i=>i.schemaVersion===35&&i.release==='R104',plan:(i,o)=>r104HostingPlan(i,o),operatorRelease:()=>'R104',live:(i,o)=>verifyR104LivePackage(i,o)},
 {kind:'R102',match:i=>i.schemaVersion===33&&i.release==='R102',plan:(i,o)=>r102HostingPlan(i,o),operatorRelease:()=>'R102',live:(i,o)=>verifyR102LivePackage(i,o)},
 {kind:'R101',match:i=>i.schemaVersion===32&&i.release==='R101',plan:(i,o)=>r101HostingPlan(i,o),operatorRelease:()=>'R101',live:(i,o)=>verifyR101LivePackage(i,o)},
 {kind:'R100',match:i=>i.schemaVersion===31&&i.release==='R100',plan:(i,o)=>r100HostingPlan(i,o),operatorRelease:()=>'R100',live:(i,o)=>verifyR100LivePackage(i,o)},
 {kind:'R097',match:i=>i.schemaVersion===30&&i.release==='R097',plan:(i,o)=>r097HostingPlan(i,o),operatorRelease:()=>'R097',live:(i,o)=>verifyR097LivePackage(i,o)},
 {kind:'R096',match:i=>i.schemaVersion===29&&i.release==='R096',plan:(i,o)=>r096HostingPlan(i,o),operatorRelease:()=>'R096',live:(i,o)=>verifyR096LivePackage(i,o)},
 {kind:'R095',match:i=>i.schemaVersion===28&&i.release==='R095',plan:(i,o)=>r095HostingPlan(i,o),operatorRelease:()=>'R095',live:(i,o)=>verifyR095LivePackage(i,o)},
 {kind:'R091',match:i=>i.schemaVersion===27&&i.release==='R091',plan:(i,o)=>r091HostingPlan(i,o),operatorRelease:()=>'R091',live:(i,o)=>verifyR091LivePackage(i,o)},
 {kind:'R090',match:i=>i.schemaVersion===26&&i.release==='R090',plan:(i,o)=>r090HostingPlan(i,o),operatorRelease:()=>'R090',live:(i,o)=>verifyR090LivePackage(i,o)},
 {kind:'R089',match:i=>i.schemaVersion===25&&i.release==='R089',plan:(i,o)=>r089HostingPlan(i,o),operatorRelease:()=>'R089',live:(i,o)=>verifyR089LivePackage(i,o)},
 {kind:'R081',match:i=>i.schemaVersion===23&&i.release==='R081',plan:(i,o)=>r081HostingPlan(i,o),operatorRelease:()=>'R081',live:(i,o)=>verifyR081LivePackage(i,o)},
 {kind:'R080',match:i=>i.schemaVersion===22&&i.release==='R080',plan:(i,o)=>r080HostingPlan(i,o),operatorRelease:()=>'R080',live:(i,o)=>verifyR080LivePackage(i,o)},
 {kind:'R079',match:i=>i.schemaVersion===21&&i.release==='R079',plan:(i,o)=>r079HostingPlan(i,o),operatorRelease:()=>'R079',live:(i,o)=>verifyR079LivePackage(i,o)},
 {kind:'R078',match:i=>i.schemaVersion===20&&i.release==='R078',plan:(i,o)=>r078HostingPlan(i,o),operatorRelease:()=>'R078',live:(i,o)=>verifyR078LivePackage(i,o)},
 {kind:'R077',match:i=>i.schemaVersion===19&&i.release==='R077',plan:(i,o)=>r077HostingPlan(i,o),operatorRelease:()=>'R077',live:(i,o)=>verifyR077LivePackage(i,o)},
 {kind:'R076',match:i=>i.schemaVersion===18&&i.release==='R076',plan:(i,o)=>r076HostingPlan(i,o),operatorRelease:()=>'R076',live:(i,o)=>verifyR076LivePackage(i,o)},
 {kind:'R075',match:i=>i.schemaVersion===17&&i.release==='R075',plan:(i,o)=>r075HostingPlan(i,o),operatorRelease:()=>'R075',live:(i,o)=>verifyR075LivePackage(i,o)},
 {kind:'R069',match:i=>i.schemaVersion===10&&i.release==='R069',plan:(i,o)=>r069HostingPlan(i,o),operatorRelease:()=>'R069',live:(i,o)=>verifyR069LivePackage(i,o)},
 {kind:'R068',match:i=>i.schemaVersion===9&&i.release==='R068',plan:(i,o)=>r068HostingPlan(i,o),operatorRelease:()=>'R068',live:(i,o)=>verifyR068LivePackage(i,o)},
 {kind:'hosting-only',match:i=>Object.hasOwn(hostingOnlyReleases,i.release??'')&&i.schemaVersion===hostingOnlyReleases[i.release].schemaVersion,plan:i=>hostingOnlyPlan(i),operatorRelease:i=>i.release,live:(i,o)=>verifyHostingOnlyLivePackage(i,o)},
 {kind:'R064',match:i=>i.schemaVersion===6&&i.release==='R064',plan:(i,o)=>waveHostingPlan(i,o),operatorRelease:()=>'R064',live:(i,o)=>verifyWaveLivePackage(i,o)},
 {kind:'R063',match:i=>i.schemaVersion===5&&i.release==='R063',plan:(i,o)=>runtimeHostingPlan(i,o),operatorRelease:()=>'R063',live:(i,o)=>verifyRuntimeLivePackage(i,o)},
 {kind:'R062',match:i=>i.schemaVersion===4&&i.release==='R062',plan:(i,o)=>settingsHostingPlan(i,o),operatorRelease:()=>'R062',live:(i,o)=>verifySettingsLivePackage(i,o)},
 {kind:'R061',match:i=>i.schemaVersion===3&&i.release==='R061',plan:i=>frontendOnlyHostingPlan(i),operatorRelease:()=>undefined,live:i=>verifyFrontendOnlyLivePackage(i)},
 {kind:'R059',match:i=>i.schemaVersion===2&&i.release==='R059',plan:(i,o)=>appOnlyHostingPlan(i,o),operatorRelease:()=>undefined,live:(i,o)=>verifyAppOnlyLivePackage(i,o)},
 // After every hand-written kind: a release with none of its own (R105 onwards) as the generic kind.
 {kind:'generic',match:i=>genericKindMatches(i),plan:(i,o)=>genericHostingPlan(i,o),operatorRelease:i=>i.release,live:(i,o)=>verifyGenericLivePackage(i,o)},
].map(row=>Object.freeze(row)));
export function hostingKind(inputs){return HOSTING_KINDS.find(row=>row.match(inputs))??null;}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i++){if(['--apply','--check'].includes(args[i]))options[args[i]]=true;else if(['--inputs','--approval-reference','--output'].includes(args[i])&&args[i+1])options[args[i]]=args[++i];else throw Error('Unknown or incomplete Hosting option');}
 if(Boolean(options['--apply'])===Boolean(options['--check'])||!options['--inputs']||!path.isAbsolute(options['--inputs']))throw Error('Choose --check or --apply with absolute private --inputs');
 const read=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
 const inputs=await read(options['--inputs']);
 const kind=hostingKind(inputs),current=kind!==null;
 const plan=kind?await kind.plan(inputs,{requireApplied:!!options['--apply']}):await businessHostingPlan(await read(inputs.preparedManifestFile),await read(inputs.appliedManifestFile),await read(inputs.receiptsFile),{preparedOptions:inputs.preparedOptions,appliedOptions:inputs.appliedOptions});
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
  if(current){const impersonationToken=process.env.GOOGLE_IMPERSONATION_SOURCE_TOKEN;delete process.env.GOOGLE_IMPERSONATION_SOURCE_TOKEN;const release=kind.operatorRelease(inputs);await verifyAppOnlyOperator({token,impersonationToken,...(release?{release}:{})});await kind.live(inputs,{token});}else await verifyOperatorCredential({token});
  const request=async(url,method,body,raw=false)=>{if(!['firebasehosting.googleapis.com','upload-firebasehosting.googleapis.com'].includes(new URL(url).hostname))throw Error('Unexpected Hosting API host');const response=await fetch(url,{method,redirect:'error',headers:{Authorization:'Bearer '+token,'x-goog-user-project':'clever-oasis-508610-n7','Content-Type':raw?'application/octet-stream':'application/json'},...(method==='GET'?{}:{body:raw?body:JSON.stringify(body)})});if(!response.ok)throw Error('Hosting API failed with status '+response.status);const text=await response.text();return text?JSON.parse(text):{};};
  const packageSha256=current?sha(await readFile(options['--inputs'])):undefined;
  if(current){await writeFile(output,JSON.stringify({schemaVersion:1,status:'pending-reconciliation',sourceCommit:plan.sourceCommit,packageSha256,site:plan.site,approvalReference:options['--approval-reference'],instruction:'Do not retry. Reconcile the live Hosting release before recovery.'},null,2),{flag:'wx'});persistReceipt();}
  const result=await executeBusinessHosting(plan,{request,approvalReference:options['--approval-reference']});
  if(current){result.packageSha256=packageSha256;result.status='applied';}
  console.log(JSON.stringify(result)); // Retain actual release identity even if local receipt persistence fails.
  try{await writeFile(options['--output'],JSON.stringify(result,null,2),{flag:current?'w':'wx'});persistReceipt();}catch{throw Error('Hosting release applied; private receipt write failed. Preserve the emitted release identity and inspect live state before retrying.');}
 }
}
