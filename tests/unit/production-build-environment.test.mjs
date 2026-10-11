import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,lstat,realpath,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {environmentForMode,offlineNamespace,liveConfiguration} from '../../apps/pwa/src/environment.ts';
import {productionBuildEnvironment,buildProductionBusinessCandidate} from '../../scripts/production/build-business-candidate.mjs';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';
const config={schemaVersion:1,environment:'prod',canonicalOrigin:'https://lm.mw-credit.com',firebase:{projectId:'clever-oasis-508610-n7',authDomain:'clever-oasis-508610-n7.firebaseapp.com',apiKey:'AIza'+'a'.repeat(35),appId:'1:737787224638:web:abc123'},readerOrigin:'https://mw-credit-app-read-prod-737787224638.asia-southeast1.run.app',commandOrigin:'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app',reportingUrl:'https://www.appsheet.com/start/e74dd368-654f-44d7-bccf-83cf361d1cdb'};
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
 const prior=Object.fromEntries(ambientKeys.map(key=>[key,process.env[key]]));
 for(const key of ambientKeys)process.env[key]='forbidden-ambient-dev-sentinel';
 try{
  const marker=await buildProductionBusinessCandidate({publicConfig:config,outDir:root});assert.equal(marker.mode,'live-prod');assert.equal(marker.offlineNamespace,'mw-credit-prod-owner');
  assert.equal(JSON.parse(await readFile(join(root,'build-mode.json'),'utf8')).mode,'live-prod');assert.match(await readFile(join(root,'sw.js'),'utf8'),/const PREFIX = 'mw-credit-prod-public-'/);assert.equal(JSON.parse(await readFile(join(root,'manifest.webmanifest'),'utf8')).name,'MW Credit');assert.match(await readFile(join(root,'index.html'),'utf8'),/<title>MW Credit<\/title>/);
  assert.deepEqual(JSON.parse(await readFile(join(root,'production-public-config.json'),'utf8')),config);
  // Inspect the actual emitted executable config, not its separate JSON sidecar.
  const entry=JSON.parse(await readFile(join(root,'build-version.json'),'utf8')).entry;
  const javascript=await readFile(join(root,entry.slice(1)),'utf8');
  for(const value of [config.readerOrigin,config.commandOrigin,config.firebase.apiKey,config.firebase.appId,config.reportingUrl])assert.ok(javascript.includes(value),`emitted JS missing ${value}`);
  assert.equal(javascript.includes('forbidden-ambient-dev-sentinel'),false);
  assert.equal(/https:\/\/mw-credit-app-(?:read|command)-dev-[^"'\s]+/.test(javascript),false);
  const objects=[],functions=new Map();let configurationFunction;
  function visit(node){
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
  function collect(name){if(closure.has(name)||!functions.has(name))return;const fn=functions.get(name);closure.set(name,fn.getText());function calls(n){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression))collect(n.expression.text);ts.forEachChild(n,calls);}calls(fn);}
  collect(configurationFunction);
  const emitted=objects[0],compiled=runInNewContext([...closure.values()].join('\n')+`;${configurationFunction}(input)`,{URL,input:emitted},{timeout:1000});
  assert.deepEqual(JSON.parse(JSON.stringify(compiled)),liveConfiguration(productionBuildEnvironment(config)));
  assert.equal(emitted.VITE_COMMAND_MODE,'production-business');assert.equal(emitted.VITE_COMMAND_API_ORIGIN,config.commandOrigin);
  for(const key of ['VITE_COMMAND_FIXTURE_BORROWER_ID','VITE_FIREBASE_AUTH_TENANT_ID'])assert.equal(emitted[key],undefined);
 }finally{
  for(const key of ambientKeys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
  // This exact newly created synthetic build tree owns no dependencies or private data.
  const actual=await realpath(root);assert.equal(dirname(actual),await realpath(tmpdir()));assert.match(actual,/mw-production-candidate-[^\\/]+$/);
  async function check(path){assert.equal((await lstat(path)).isSymbolicLink(),false);for(const child of await readdir(path,{withFileTypes:true})){assert.equal(child.isSymbolicLink(),false);if(child.isDirectory())await check(join(path,child.name));}}
  await check(actual);await rm(actual,{recursive:true});
 }
});
