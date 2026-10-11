// Fixed R053 Hosting gate. R052 business/foundation contracts remain unchanged.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const SHA=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=m=>{throw Error('R053 candidate: '+m);};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))fail(m);};
async function bytes(file,max=1048576){if(!path.isAbsolute(file??''))fail('absolute evidence path required');const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)fail('unsafe evidence file');return readFile(file);}
async function proof(file,pin){if(!SHA.test(pin??''))fail('evidence hash required');const b=await bytes(file);eq(hash(b),pin,'changed evidence');return JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));}
const fixed={projectId:'clever-oasis-508610-n7',site:'mw-credit-prod-737787224638',database:'loan_manager_prod',host:'34.21.174.215',connectionName:'clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914',canonicalOrigin:'https://lm.mw-credit.com'};
export function validateR053ApplicationReceipt(receipt,artifactSource){
 const r=receipt.run;if(r?.repository?.full_name!=='welct0407/MW-Credit-App'||r.path!=='.github/workflows/ci.yml'||r.head_sha!==artifactSource||r.event!=='workflow_dispatch'||r.status!=='completed')fail('wrong actual application run');
 const steps=(receipt.jobs??[]).flatMap(j=>j.steps??[]);
 for(const name of ['Run npm run check','Run npm run build:live-dev','Run npm audit --omit=dev --audit-level=moderate','Run npm run test:e2e'])if(!steps.some(s=>s.name===name&&s.conclusion==='success'))fail('missing executed '+name);
 const failed=steps.filter(s=>s.conclusion==='failure');
 if(r.conclusion==='failure'){if(failed.length!==1||failed[0].name!=='Run terraform fmt -check -recursive infrastructure')fail('unrecovered application failure');}
 else if(r.conclusion!=='success'||failed.length)fail('application run not completed successfully');
 return {runId:r.id,originalConclusion:r.conclusion,browser:'success'};
}
const inputPaths=['apps','packages','contracts','services','public','index.html','package.json','package-lock.json','.dockerignore','Dockerfile','vite.config.ts','scripts/production/build-business-candidate.mjs','cloudbuild-command.yaml','cloudbuild-business.yaml','cloudbuild-foundation.yaml'];
function git(repo,args){const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:4*1024*1024});if(r.status!==0)fail('source verification failed');return r.stdout;}
export async function validateR053Candidate(m,o={}){
 if(m?.schemaVersion!==1||m.release!=='R053'||m.environment!=='prod'||!['prepared','applied'].includes(m.status)||!COMMIT.test(m.sourceCommit??'')||!COMMIT.test(m.artifactSourceCommit??''))fail('fixed release/source required');
 eq(m.target,fixed,'wrong production target');
 if(!path.isAbsolute(o.repoRoot??''))fail('explicit source repository required');
 git(o.repoRoot,['cat-file','-e',m.sourceCommit+'^{commit}']);git(o.repoRoot,['cat-file','-e',m.artifactSourceCommit+'^{commit}']);
 if(git(o.repoRoot,['diff','--name-only',m.artifactSourceCommit,m.sourceCommit,'--',...inputPaths]).trim())fail('runtime build inputs changed');
 const e=m.evidence??{},build=await proof(o.buildEvidenceFile,e.buildSha256),application=await proof(o.applicationCiFile,e.applicationCiSha256),tf=await proof(o.terraformRecoveryFile,e.terraformRecoverySha256),db=await proof(o.databaseCiFile,e.databaseCiSha256),backup=await proof(o.backupFile,e.backupSha256),baseline=await proof(o.baselineFile,e.baselineSha256);
 eq(build.sourceCommit,m.artifactSourceCommit,'artifact provenance');eq(build.prod?.status,'SUCCESS','production build failed');eq(m.images,{reader:build.prod.image,command:build.prod.image,workers:build.prod.image},'image pins');if(!/^asia-southeast1-docker\.pkg\.dev\/clever-oasis-508610-n7\/mw-credit-app-prod\/api@sha256:[a-f0-9]{64}$/.test(build.prod.image))fail('wrong PROD registry/digest');
 const ci=validateR053ApplicationReceipt(application,m.artifactSourceCommit);
 if(tf.checks?.some(c=>c.exitCode!==0)||tf.totalMockTestsPassed!==24)fail('missing Terraform recovery');
 for(const [name,pin]of Object.entries(tf.changes??{})){if(!SHA.test(pin)||hash(await bytes(path.join(o.repoRoot,name)))!==pin)fail('changed checked Terraform source');git(o.repoRoot,['diff','--exit-code',m.sourceCommit,'--',name]);}
 for(const command of ['terraform fmt -check -recursive infrastructure','terraform -chdir=infrastructure/dev validate -no-color','terraform -chdir=infrastructure/production validate -no-color'])if(!tf.checks.some(c=>c.command===command&&c.exitCode===0))fail('incomplete Terraform checks');
 if(db.run?.repository?.full_name!=='welct0407/MW-Credit-App'||db.run.path!=='.github/workflows/database.yml'||db.run.status!=='completed'||db.run.conclusion!=='success'||!COMMIT.test(db.run.head_sha??'')||!(db.jobs??[]).some(j=>j.steps?.some(s=>s.name==='Rebuild and validate disposable database'&&s.conclusion==='success')))fail('actual database checkpoint required');
 if(git(o.repoRoot,['diff','--name-only',db.run.head_sha,m.sourceCommit,'--','database/migrations']).trim())fail('SQL differs from database checkpoint');
 const sql=m.sql;if(sql?.baselineVersion!==87||sql.targetVersion!==89||sql.group!==true||sql.mixed!==false||sql.executeInTransaction!==true||JSON.stringify(sql.callbacks)!=='[]'||sql.migrations?.length!==2)fail('exact grouped87-to89 required');
 for(const [i,v]of [88,89].entries()){const f=sql.migrations[i];if(f.version!==v||!new RegExp('^V'+v+'__[A-Za-z0-9_]+\\.sql$').test(f.name)||!SHA.test(f.sha256)||hash(Buffer.from(git(o.repoRoot,['show',m.sourceCommit+':database/migrations/'+f.name])))!==f.sha256)fail('canonical migration hash changed');}
 if(backup.database!=='loan_manager_prod'||backup.baselineVersion!==87||backup.restore!=='passed'||backup.archiveListing!=='passed'||backup.restoredFingerprintsMatch!==true||!SHA.test(backup.dumpSha256??''))fail('PROD87 recovery missing');
 if(baseline.site!==fixed.site||m.rollback?.hostingVersion!==baseline.version||!/^sites\/mw-credit-prod-737787224638\/versions\/[A-Za-z0-9_-]+$/.test(baseline.version))fail('Hosting rollback mismatch');
 eq(m.frontend, {publicVersion:build.prod.frontend.build.version,entry:build.prod.frontend.build.entry,files:build.prod.frontend.files},'frontend provenance');
 if(!Array.isArray(m.frontend.files)||m.frontend.files.length<7||m.frontend.files.length>128)fail('bounded frontend required');
 const root=await realpath(o.artifactRoot),seen=new Set();let total=0;
 for(const f of m.frontend.files){if(! /\.(js|css|html|webmanifest|png|svg|ico|json)$/.test(f.path)||f.path.endsWith('.json')&&!['production-public-config.json','build-version.json','build-mode.json','firebase.json'].includes(f.path)||!SHA.test(f.sha256)||! /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(f.path)||f.path.includes('..')||seen.has(f.path))fail('unsafe artifact');seen.add(f.path);const file=await realpath(path.join(root,f.path));if(path.relative(root,file).startsWith('..'))fail('artifact escape');const b=await bytes(file,32*1024*1024);total+=b.length;if(total>32*1024*1024||hash(b)!==f.sha256)fail('artifact bytes changed');}
 for(const required of ['index.html','production-public-config.json','build-version.json','build-mode.json','sw.js','manifest.webmanifest',m.frontend.entry.slice(1)])if(!seen.has(required))fail('required published asset missing');
 const config=JSON.parse((await bytes(path.join(root,'production-public-config.json'))).toString('utf8'));if(config.environment!=='prod'||config.canonicalOrigin!==fixed.canonicalOrigin||config.notificationsEnabled!==true||config.firebase?.projectId!==fixed.projectId)fail('wrong production frontend binding');
 eq(config.readerOrigin,'https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app','wrong reader origin');eq(config.commandOrigin,'https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app','wrong command origin');
 const marker=JSON.parse((await bytes(path.join(root,'build-version.json'))).toString('utf8')),mode=JSON.parse((await bytes(path.join(root,'build-mode.json'))).toString('utf8'));
 eq(marker,{schemaVersion:1,version:m.frontend.publicVersion,entry:m.frontend.entry},'marker mismatch');eq(mode,{schemaVersion:1,mode:'live-prod'},'wrong build mode');
 if(!/^[a-f0-9]{24}$/.test(m.frontend.publicVersion)||!/^\/assets\/[A-Za-z0-9_-]+\.js$/.test(m.frontend.entry))fail('invalid marker/entry');
 const html=(await bytes(path.join(root,'index.html'))).toString('utf8').replace(/<!--[\s\S]*?-->/g,''),worker=(await bytes(path.join(root,'sw.js'))).toString('utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,'');
 const versions=[...worker.matchAll(/^const VERSION\s*=\s*(['"])([^'"]+)\1;\s*$/gm)],prefixes=[...worker.matchAll(/^const PREFIX\s*=\s*(['"])([^'"]+)\1;\s*$/gm)],assets=[...worker.matchAll(/^const APP_ASSETS\s*=\s*(\[[^\r\n]+\]);\s*$/gm)];
 if(versions.length!==1||prefixes.length!==1||assets.length!==1||versions[0][2]!==m.frontend.publicVersion||prefixes[0][2]!=='mw-credit-prod-public-'||!JSON.parse(assets[0][1]).includes(m.frontend.entry))fail('worker declarations/entry mismatch');
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1[^>]*>/gi)];if(!scripts.some(x=>x[2]===m.frontend.entry&&/\btype\s*=\s*(['"])module\1/i.test(x[0])))fail('active index entry mismatch');
 const entry=(await bytes(path.join(root,m.frontend.entry.slice(1)),32*1024*1024)).toString('utf8');for(const value of [config.readerOrigin,config.commandOrigin,config.firebase.apiKey,config.firebase.appId])if(!value||!entry.includes(value))fail('compiled config mismatch');
 if(m.status==='applied'){
  const a=await proof(o.appliedEvidenceFile,e.appliedSha256);if(a.sourceCommit!==m.sourceCommit||a.database!==fixed.database||a.sqlVersion!==89||a.authorityRestored!==true||a.runtimeSourceCommit!==m.artifactSourceCommit||a.notificationApiEnabled!==true||a.agentApiEnabled!==true||a.purgeEnabled!==false)fail('actual activation evidence missing');
  for(const name of ['mw-credit-app-read-prod','mw-credit-app-command-prod']){const r=a.services?.find(x=>x.service===name);if(!r?.revision||r.ready!==true||r.trafficPercent!==100||r.image!==build.prod.image)fail('actual ready service mismatch');}
 }
 return {schemaVersion:1,reviewReady:true,deployReady:m.status==='applied',releaseVerified:false,remainingReleaseGates:'owner device/provider acceptance, capture and scheduled ownership activation, agent cutover and final documentation',sourceCommit:m.sourceCommit,artifactSourceCommit:m.artifactSourceCommit,ci,execution:'read-only package verification'};
}
