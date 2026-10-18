import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,lstat,realpath,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {environmentForMode,offlineNamespace,liveConfiguration} from '../../apps/pwa/src/environment.ts';
import {productionBuildEnvironment,buildProductionBusinessCandidate} from '../../scripts/production/build-business-candidate.mjs';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {openRelease} from '../../scripts/build-live-dev.mjs';
const config={schemaVersion:1,environment:'prod',canonicalOrigin:'https://lm.mw-credit.com',firebase:{projectId:'clever-oasis-508610-n7',authDomain:'clever-oasis-508610-n7.firebaseapp.com',apiKey:'AIza'+'a'.repeat(35),appId:'1:737787224638:web:abc123'},readerOrigin:'https://mw-credit-app-read-prod-737787224638.asia-southeast1.run.app',commandOrigin:'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app'};
test('same shared identity has three separate offline namespaces; wrong issuer/unknown mode reject',()=>{
 const identity={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'same-user'};
 const names=['synthetic','dev','prod'].map(e=>offlineNamespace(identity,e));assert.equal(new Set(names).size,3);assert.equal(names[1],'mw-credit-dev-owner:'+identity.issuer+':same-user');assert.notEqual(offlineNamespace({...identity,uid:'other-user'},'prod'),names[2]);assert.throws(()=>offlineNamespace({...identity,issuer:'wrong'},'prod'));assert.throws(()=>environmentForMode('production'));
});
test('production build contract rejects DEV/foreign endpoints, fixtures and config extras',()=>{
 const env=productionBuildEnvironment(config);assert.equal(liveConfiguration(env).environment,'prod');
 for(const change of [{readerOrigin:config.readerOrigin.replace('-prod-','-dev-')},{commandOrigin:config.commandOrigin+'/'},{canonicalOrigin:'https://dev-lm.mw-credit.com'},{ownerUid:'secret'},{reportingUrl:'https://www.appsheet.com/start/9f3422be-bc87-4a5a-a42a-67528ee80393'}])assert.throws(()=>productionBuildEnvironment({...config,...change}));
 assert.throws(()=>liveConfiguration({...env,VITE_COMMAND_FIXTURE_BORROWER_ID:'synthetic'}));assert.throws(()=>liveConfiguration({...env,VITE_FIREBASE_AUTH_TENANT_ID:'tenant'}));
});
test('production candidate uses separate marker, canonical worker and storage binding; local scratch cleaned',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mw-production-candidate-'));
 const ambientKeys=['VITE_API_ORIGIN','VITE_COMMAND_API_ORIGIN','VITE_COMMAND_FIXTURE_BORROWER_ID','VITE_FIREBASE_AUTH_TENANT_ID'];
 const prior=Object.fromEntries([...ambientKeys,'MW_RELEASE_NUMBER'].map(key=>[key,process.env[key]]));
 for(const key of ambientKeys)process.env[key]='forbidden-ambient-dev-sentinel';
 // R075: an ambient release number never reaches the bundle; the explicit input does, and the ambient value is restored.
 process.env.MW_RELEASE_NUMBER='R111';
 try{
  const legacyConfig=Object.freeze({...config,reportingUrl:'https://www.appsheet.com/start/e74dd368-654f-44d7-bccf-83cf361d1cdb'});
  assert.deepEqual(productionBuildEnvironment(legacyConfig),productionBuildEnvironment(config));
  for(const releaseNumber of [undefined,'','dev','R75','r075','R0750',' R075',75])await assert.rejects(buildProductionBusinessCandidate({publicConfig:legacyConfig,outDir:root,releaseNumber}),/Release number like R075 required/);
  assert.equal(process.env.MW_RELEASE_NUMBER,'R111');assert.deepEqual(await readdir(root),[]);
  const marker=await buildProductionBusinessCandidate({publicConfig:legacyConfig,outDir:root,releaseNumber:'R999'});assert.equal(marker.mode,'live-prod');assert.equal(marker.release,'R999');assert.equal(process.env.MW_RELEASE_NUMBER,'R111');assert.equal(marker.offlineNamespace,'mw-credit-prod-owner');assert.equal(legacyConfig.reportingUrl,'https://www.appsheet.com/start/e74dd368-654f-44d7-bccf-83cf361d1cdb');
  assert.equal(JSON.parse(await readFile(join(root,'build-mode.json'),'utf8')).mode,'live-prod');assert.match(await readFile(join(root,'sw.js'),'utf8'),/const PREFIX = 'mw-credit-prod-public-'/);assert.equal(JSON.parse(await readFile(join(root,'manifest.webmanifest'),'utf8')).name,'MW Credit');assert.match(await readFile(join(root,'index.html'),'utf8'),/<title>MW Credit<\/title>/);
  // PROD pink in the installed title bar, offline page and tab icon (owner request, R072).
  assert.equal(JSON.parse(await readFile(join(root,'manifest.webmanifest'),'utf8')).theme_color,'#d81b60');const offline=await readFile(join(root,'offline.html'),'utf8');assert.match(offline,/<meta name="theme-color" content="#d81b60">/);assert.match(offline,/header\{background:#d81b60;color:#fff;/);assert.doesNotMatch(offline,/#e8710a/);assert.match(offline,/<title>MW Credit · Offline<\/title>/);assert.match(offline,/<header>MW Credit<\/header>/);assert.doesNotMatch(offline,/DEV/);
  assert.match(await readFile(join(root,'index.html'),'utf8'),/<link rel="icon" type="image\/png" href="\/icons\/icon-192\.png">/);assert.deepEqual(await readFile(join(root,'icons/icon-192.png')),await readFile('apps/pwa/pwa/icons-prod/icon-192.png'));
  assert.deepEqual(JSON.parse(await readFile(join(root,'production-public-config.json'),'utf8')),config);
  // Inspect the actual emitted executable config, not its separate JSON sidecar.
  const sidecar=JSON.parse(await readFile(join(root,'build-version.json'),'utf8')),entry=sidecar.entry;
  assert.deepEqual(Object.keys(sidecar),['schemaVersion','version','entry','release']);assert.equal(sidecar.schemaVersion,1);assert.equal(sidecar.release,'R999');assert.match(sidecar.version,/^[a-f0-9]{24}$/);assert.equal(installedClientAccepts(sidecar),true,'installed clients accept the PROD marker');
  const javascript=await readFile(join(root,entry.slice(1)),'utf8');
  for(const value of [config.readerOrigin,config.commandOrigin,config.firebase.apiKey,config.firebase.appId])assert.ok(javascript.includes(value),`emitted JS missing ${value}`);
  // R072 About: the vite.config.ts commit define survives the candidate's own define (Vite merges both).
  let commit='unknown';try{commit=execFileSync('git',['rev-parse','--short=7','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()||'unknown'}catch{}
  assert.ok(javascript.includes("'R999'")||javascript.includes('"R999"'),'emitted JS carries the release number');assert.equal(javascript.includes('R111'),false);assert.equal(javascript.includes('__RELEASE_NUMBER__'),false);assert.ok(javascript.includes(JSON.stringify(commit))||javascript.includes("'"+commit+"'"),'emitted JS carries the source commit '+commit);
  assert.equal(javascript.includes('forbidden-ambient-dev-sentinel'),false);
  assert.equal(javascript.includes('www.appsheet.com'),false);
  assert.equal(javascript.includes('live-reporting-link'),false);
  assert.equal(/https:\/\/mw-credit-app-(?:read|command)-dev-[^"'\s]+/.test(javascript),false);
  const objects=[],functions=new Map(),constants=new Map();let configurationFunction;
  function visit(node){
   // Constant strings the configuration closes over (for example the shared Firebase project id).
   if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&(ts.isStringLiteral(node.initializer)||ts.isNoSubstitutionTemplateLiteral(node.initializer)||ts.isBinaryExpression(node.initializer)))constants.set(node.name.text,node.getText());
   if(ts.isFunctionDeclaration(node)&&node.name){functions.set(node.name.text,node);if(node.getText().includes('VITE_FIREBASE_API_KEY'))configurationFunction=node.name.text;}
   if(ts.isObjectLiteralExpression(node)){
    const value={};for(const p of node.properties){if(!ts.isPropertyAssignment(p))continue;const name=p.name.getText().replace(/^['"]|['"]$/g,'');if(ts.isStringLiteral(p.initializer))value[name]=p.initializer.text;}
    if(value.VITE_API_ORIGIN)objects.push(value);
   }
   ts.forEachChild(node,visit);
  }
  visit(ts.createSourceFile(entry,javascript,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS));
  assert.equal(objects.length,1,'exactly one emitted runtime environment must be configured');
  assert.ok(configurationFunction,'compiled live configuration function is present');
  // Rollup specializes MODE and removes unused object properties. Execute its
  // emitted function and emitted helper closure, rather than inventing MODE.
  const closure=new Map();
  function collect(name){if(closure.has(name))return;if(constants.has(name)){const text=constants.get(name);closure.set(name,'const '+text+';');const refs=n=>{if(ts.isIdentifier(n))collect(n.text);ts.forEachChild(n,refs);};refs(ts.createSourceFile('c.js','const '+text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS));return;}if(!functions.has(name))return;const fn=functions.get(name);closure.set(name,fn.getText());function calls(n){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression))collect(n.expression.text);else if(ts.isIdentifier(n)&&constants.has(n.text))collect(n.text);ts.forEachChild(n,calls);}calls(fn);}
  collect(configurationFunction);
  const emitted=objects[0],compiled=runInNewContext([...closure.values()].join('\n')+`;${configurationFunction}(input)`,{URL,input:emitted},{timeout:1000});
  assert.deepEqual(JSON.parse(JSON.stringify(compiled)),liveConfiguration(productionBuildEnvironment(config)));
  assert.equal(emitted.VITE_COMMAND_MODE,'production-business');assert.equal(emitted.VITE_COMMAND_API_ORIGIN,config.commandOrigin);
  for(const key of ['VITE_COMMAND_FIXTURE_BORROWER_ID','VITE_FIREBASE_AUTH_TENANT_ID'])assert.equal(emitted[key],undefined);
 }finally{
  for(const key of [...ambientKeys,'MW_RELEASE_NUMBER']){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
  // This exact newly created synthetic build tree owns no dependencies or private data.
  const actual=await realpath(root);assert.equal(dirname(actual),await realpath(tmpdir()));assert.match(actual,/mw-production-candidate-[^\\/]+$/);
  async function check(path){assert.equal((await lstat(path)).isSymbolicLink(),false);for(const child of await readdir(path,{withFileTypes:true})){assert.equal(child.isSymbolicLink(),false);if(child.isDirectory())await check(join(path,child.name));}}
  await check(actual);await rm(actual,{recursive:true});
 }
});

// R075: the release number is a build input (vite.config.ts, MW_RELEASE_NUMBER).
// Installed clients (R074 and earlier) run this update check on /build-version.json and stop at 'invalid_version' when
// it fails, which blocks reads and leaves the waiting worker inactive; the marker must keep passing it.
const r074Check="latest.schemaVersion!==1||!/^[a-f0-9]{24}$/.test(latest.version)||!/^\\/assets\\/[^/]+\\.js$/.test(latest.entry)";
const currentCheck=readFileSync(new URL('../../apps/pwa/src/usePwa.ts',import.meta.url),'utf8').match(/latest=await response\.json\(\);if\((.+?)\)throw Error\('invalid_version'\)/)?.[1];
function installedClientAccepts(latest){return [r074Check,currentCheck].every(check=>runInNewContext('!('+check+')',{latest}));}
test('the update check of installed clients accepts the marker with release and rejects a schema bump',()=>{
 assert.equal(currentCheck,r074Check,'usePwa still runs the R074 marker check');
 const marker={schemaVersion:1,version:'a'.repeat(24),entry:'/assets/index-abc.js',release:'R075'};
 assert.equal(installedClientAccepts(marker),true);assert.equal(installedClientAccepts({...marker,release:'dev'}),true);
 for(const bad of [{...marker,schemaVersion:2},{...marker,version:'x'},{...marker,entry:'/index.js'}])assert.equal(installedClientAccepts(bad),false);
});
async function withRelease(value,fn){const prior=process.env.MW_RELEASE_NUMBER;if(value===undefined)delete process.env.MW_RELEASE_NUMBER;else process.env.MW_RELEASE_NUMBER=value;try{return await fn()}finally{if(prior===undefined)delete process.env.MW_RELEASE_NUMBER;else process.env.MW_RELEASE_NUMBER=prior}}
async function viteBuild(t,mode){
 const out=await mkdtemp(join(tmpdir(),'mw-release-build-'));t.after(()=>rm(out,{recursive:true,force:true}));
 const {build}=await import('vite');
 await build({root:fileURLToPath(new URL('../..',import.meta.url)),configFile:fileURLToPath(new URL('../../vite.config.ts',import.meta.url)),mode,envFile:false,logLevel:'silent',build:{outDir:out,emptyOutDir:false}});
 return out;
}
test('a live-prod build without MW_RELEASE_NUMBER, and any build with a malformed one, fails before emitting anything',async t=>{
 const out=await mkdtemp(join(tmpdir(),'mw-release-refused-'));t.after(()=>rm(out,{recursive:true,force:true}));
 const {build}=await import('vite'),run=mode=>build({root:fileURLToPath(new URL('../..',import.meta.url)),configFile:fileURLToPath(new URL('../../vite.config.ts',import.meta.url)),mode,envFile:false,logLevel:'silent',build:{outDir:out,emptyOutDir:false}});
 await withRelease(undefined,()=>assert.rejects(run('live-prod'),/live-prod build requires MW_RELEASE_NUMBER/));
 for(const value of ['','dev','R75','R0750','r075'])for(const mode of ['live-prod','live-dev','synthetic'])await withRelease(value,()=>assert.rejects(run(mode),/MW_RELEASE_NUMBER must look like R075/));
 assert.deepEqual(await readdir(out),[]);
});
test('live-dev defaults to dev and carries a set release in the sidecar and bundle',async t=>{
 const sidecar=async out=>JSON.parse(await readFile(join(out,'build-version.json'),'utf8'));
 const dev=await withRelease(undefined,()=>viteBuild(t,'live-dev')),devMarker=await sidecar(dev);
 assert.deepEqual(Object.keys(devMarker),['schemaVersion','version','entry','release']);assert.equal(devMarker.schemaVersion,1);assert.equal(devMarker.release,'dev');assert.equal(installedClientAccepts(devMarker),true);
 const named=await withRelease('R998',()=>viteBuild(t,'live-dev')),marker=await sidecar(named),bundle=await readFile(join(named,marker.entry.slice(1)),'utf8');
 assert.equal(marker.release,'R998');assert.equal(installedClientAccepts(marker),true);assert.ok(bundle.includes('"R998"')||bundle.includes("'R998'"),'bundle carries the release');
});
test('the DEV build labels itself with the tracker\'s Open release',async()=>{
 const tracker=await readFile(new URL('../../project/Documents/Release_Tracker.md',import.meta.url),'utf8');
 assert.match(openRelease(tracker),/^R\d{3}$/);
 assert.equal(openRelease('| Item | Current value |\n| --- | --- |\n| New product work | **R081 — Open** |\r\n'),'R081');
 for(const text of ['','| New product work | **R081 — Frozen** |','| New product work | R081 — Open |'])assert.throws(()=>openRelease(text),/no Open release row/);
});
test('no release literal remains in the app source outside comments',async()=>{
 // Comments may still name the release that introduced a behaviour; only code literals count.
 const base=fileURLToPath(new URL('../../apps/pwa/src/',import.meta.url)),found=[];let files=0;
 async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=join(dir,entry.name);if(entry.isDirectory())await walk(full);else if(/\.(ts|tsx|mts)$/.test(entry.name)){
  const text=await readFile(full,'utf8'),kind=entry.name.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS;
  // Printing without comments keeps every string, template and JSX text.
  const code=ts.createPrinter({removeComments:true}).printFile(ts.createSourceFile(entry.name,text,ts.ScriptTarget.Latest,true,kind));
  files++;const rel=full.slice(base.length).split('\\').join('/');for(const match of code.matchAll(/\bR\d{3}\b/g))found.push(rel+': '+match[0]);
 }}}
 await walk(base);
 assert.ok(files>50,'scanned the app source');assert.deepEqual(found,[],'release literals in code: '+found.join(', '));
});
