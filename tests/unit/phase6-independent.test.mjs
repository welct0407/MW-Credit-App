import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm,mkdir,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {createBorrowerReadStore} from '../../services/api/borrower-read-store.mjs';
import {createDevReadHandler} from '../../services/api/dev-read-handler.mjs';
import {parseNativeDevCatalog,NATIVE_DEV_ROOT} from '../../services/receipts/native-catalog.mjs';
import {createSourceReceiptReader,createSourceGcsReadTransport} from '../../services/receipts/source-receipts.mjs';
import {decodeSourceReceipt} from '../../services/receipts/decode-image.mjs';
import {DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {DEV_INSTANCE,DEV_PROJECT,OWNER_EMAIL} from '../../services/api/dev-read-config.mjs';
import {createDevCommandStore} from '../../services/payment-command/store.mjs';
import {COMMAND_DB_USER} from '../../services/payment-command/dev-target.mjs';
import {loadDevCommandConfig} from '../../services/payment-command/dev-config.mjs';
import {privatePath,reconcileCapturedNative} from '../../scripts/receipts/reconcile-native.mjs';
const config={ownerEmail:'synthetic@example.invalid',database:'synthetic',dbUser:'synthetic',origins:[]};
const sha=x=>createHash('sha256').update(x).digest('hex');
test('C configured malformed private catalog aborts command startup; absent optional config preserves legacy',()=>{
 const env={APP_ENV:'dev',AUTH_MODE:'firebase',FIREBASE_PROJECT_ID:DEV_PROJECT,DB_NAME:'loan_manager_dev',INSTANCE_CONNECTION_NAME:DEV_INSTANCE,DB_USER:COMMAND_DB_USER,OWNER_IDENTITY_MODE:'uid-pinned',OWNER_FIREBASE_UID:'synthetic-owner',ALLOWED_WEB_ORIGINS:'["https://mw-credit-app-dev-737787224638.web.app"]',COMMAND_MODE:'dev-owner-testing',RECEIPT_BUCKET:DEV_RECEIPT_MAPPING.bucket,RECEIPT_SQL_PREFIX:DEV_RECEIPT_MAPPING.sqlPrefix,RECEIPT_OBJECT_PREFIX:DEV_RECEIPT_MAPPING.objectPrefix,RECEIPT_COMPATIBILITY_EVIDENCE:'synthetic-test'};
 assert.equal(loadDevCommandConfig(env).nativeReceiptDescriptors.length,2);
 for(const raw of ['',null,'PRIVATE broken',JSON.stringify({schemaVersion:1,environment:'prod'}),'x'.repeat(65537)])assert.throws(()=>loadDevCommandConfig({...env,RECEIPT_NATIVE_CATALOG_JSON:raw}),error=>error.message==='Invalid DEV native receipt catalog');
});
test('C real HTTP completion correlates exact code-less timeout categories; private causes and query absent',async()=>{
 for(const [message,category] of [['timeout exceeded when trying to connect','pool_checkout_timeout'],['Connection terminated due to connection timeout','connection_timeout'],['PRIVATE token account SQL timeout exceeded when trying to connect','unclassified']]){
  let checkouts=0;const logs=[];
  const store=createBorrowerReadStore({config,pool:{async connect(){checkouts++;throw Object.assign(Error(message),{cause:Error('PRIVATE cause')});}}});
  const server=createServer(createDevReadHandler({config,store,verifyPrincipal:async auth=>auth==='Bearer synthetic'?{ok:true,email:config.ownerEmail}:{ok:false,status:401,code:'session_invalid'},completionLogger:v=>logs.push(v)}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {const base=`http://127.0.0.1:${server.address().port}`;const response=await fetch(base+'/api/borrowers?q=PRIVATE-search',{headers:{authorization:'Bearer synthetic'}});
   assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,code:'read_unavailable'});
   assert.equal(logs.length,1);assert.equal(logs[0].requestId,response.headers.get('x-request-id'));assert.equal(logs[0].stage,'connect');assert.equal(logs[0].category,category);
   assert.deepEqual(Object.keys(logs[0]).sort(),['category','code','durationMs','event','method','operation','requestId','stage','status']);assert.equal(JSON.stringify(logs).includes('PRIVATE'),false);
   const denied=await fetch(base+'/api/borrowers');assert.equal(denied.status,401);assert.equal(checkouts,1);assert.equal(logs.length,2);
  } finally {server.closeAllConnections();await new Promise(done=>server.close(done));}
 }
});
test('C startup transport failure releases exactly once with disposal; successful next check reuses fresh client',async()=>{
 let allocated=0;const releases=[];let idle;
 const pool={async connect(){if(idle)return idle;const id=++allocated;const client={async query(){if(id===1)throw Object.assign(Error('PRIVATE transport'),{code:'ECONNRESET'});return {rows:[{database:config.database,principal:config.dbUser}]};},release(discard){releases.push({id,discard});idle=discard?null:client;}};return client;}};
 const store=createBorrowerReadStore({config,pool});assert.deepEqual(await store.checkIdentity(),{ok:false});assert.deepEqual(await store.checkIdentity(),{ok:true});assert.deepEqual(await store.checkIdentity(),{ok:true});assert.equal(allocated,2);assert.deepEqual(releases,[{id:1,discard:true},{id:2,discard:false},{id:2,discard:false}]);
});
test('C colliding normalized basenames resolve distinct exact keys and generation pins; denial has zero storage',async()=>{
 const bytes=await sharp({create:{width:2,height:3,channels:3,background:'blue'}}).png().toBuffer();
 const refs=['manual-receipts/dev/PRIVATE a-b.png','manual-receipts/dev/PRIVATE a b.png'];
 const entries=refs.map((reference,i)=>({referenceSha256:sha(reference),key:NATIVE_DEV_ROOT+`PRIVATE/exact ${i}.png`,keySha256:sha(NATIVE_DEV_ROOT+`PRIVATE/exact ${i}.png`),generation:String(910+i),mimeType:'image/png',sizeBytes:bytes.length,sha256:sha(bytes)}));
 const catalog={schemaVersion:1,environment:'dev',bucket:DEV_RECEIPT_MAPPING.bucket,objectRoot:NATIVE_DEV_ROOT,entries};const descriptors=parseNativeDevCatalog(JSON.stringify(catalog));let calls=0;const seen=[];
 const storage={bucket:bucket=>({file:(key,pin)=>{calls++;seen.push({key,pin});const entry=entries.find(x=>x.key===key);assert.ok(entry);return {getMetadata:async()=>[{generation:entry.generation,size:bytes.length,contentType:'image/png'}],download:async()=>[bytes]};}})};
 const reader=createSourceReceiptReader({storage:createSourceGcsReadTransport(storage,{nativeDescriptors:descriptors}),nativeDescriptors:descriptors,decodeImage:decodeSourceReceipt});
 for(const ref of refs)assert.deepEqual((await reader(ref,'manual')).bytes,bytes);
 assert.deepEqual(seen.map(x=>x.pin.generation),['910','910','911','911']);assert.notEqual(seen[0].key,seen[2].key);
 const commandConfig={projectId:DEV_PROJECT,instance:DEV_INSTANCE,database:'loan_manager_dev',dbUser:COMMAND_DB_USER,registeredCreators:['postgres'],mode:'dev-owner-testing'};
 const deniedStore=createDevCommandStore({config:commandConfig,pool:{async connect(){throw Error('Unexpected SQL');}},receiptAdapter:{resolveReceipt(){}},sourceReceiptReader:reader});
 const before=calls;assert.equal((await deniedStore.paymentImage({ok:true,email:'other@example.invalid',subject:'synthetic'},'synthetic')).status,403);assert.equal(calls,before);
 const identity={database:'loan_manager_dev',principal:COMMAND_DB_USER,session:COMMAND_DB_USER,rolcanlogin:true,member:true};
 const unmapped=createDevCommandStore({config:commandConfig,pool:{async connect(){return {async query(sql){return {rows:sql.includes('current_database')?[identity]:[]};},release(){}};}},receiptAdapter:{resolveReceipt(){}},sourceReceiptReader:reader});
 assert.equal((await unmapped.paymentImage({ok:true,email:OWNER_EMAIL,subject:'synthetic'},'synthetic')).status,403);assert.equal(calls,before);
 for(const mutated of [[entries[0],{...entries[1],key:entries[0].key,keySha256:entries[0].keySha256}],Array(257).fill(entries[0])])assert.throws(()=>parseNativeDevCatalog(JSON.stringify({...catalog,entries:mutated})),/Invalid DEV native receipt catalog/);
});
test('C actual reconciliation CLI is deterministic, rejects repository inputs and cannot establish input provenance',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mw-phase6-independent-'));const cli=resolve('scripts/receipts/reconcile-native.mjs');
 const run=(input,output,evidence)=>spawnSync(process.execPath,[cli,'--input',input,'--output',output,'--evidence',evidence],{encoding:'utf8'});
 try {const bytes=await sharp({create:{width:3,height:2,channels:3,background:'green'}}).png().toBuffer();const media=join(dir,'PRIVATE-media.png');await writeFile(media,bytes);
  const rows=['z','a'].map(name=>{const reference=`manual-receipts/dev/PRIVATE-${name}.png`,key=NATIVE_DEV_ROOT+`PRIVATE-exact-${name}.png`,capturedAt='2026-10-11T00:00:00Z';return {database:{database:'loan_manager_dev',instance:DEV_INSTANCE,host:'34.21.174.215',table:'Payments',column:'Uploaded Receipt',readOnly:true,capturedAt,rowId:`PRIVATE-row-${name}`,reference},appsheet:{appId:'500b27b6-884a-41e8-a9ec-df801b0110ad',method:'authenticated-appsheet-media',reference,rowId:`PRIVATE-row-${name}`,capturedAt,mediaPath:media,mimeType:'image/png',sha256:sha(bytes)},gcs:{bucket:DEV_RECEIPT_MAPPING.bucket,key,generation:'999',mimeType:'image/png',sizeBytes:bytes.length,sha256:sha(bytes),capturedAt,mediaPath:media}};});
  const input=join(dir,'PRIVATE-input.json');await writeFile(input,JSON.stringify({schemaVersion:1,environment:'dev',entries:rows}));
  await privatePath(input);await privatePath(join(dir,'catalog1'),{output:true});await reconcileCapturedNative({schemaVersion:1,environment:'dev',entries:rows},{readMedia:readFile});
  for(const i of [1,2]){if(i===2)await writeFile(input,JSON.stringify({schemaVersion:1,environment:'dev',entries:rows.toReversed()}));const result=run(input,join(dir,`catalog${i}`),join(dir,`evidence${i}`));assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.includes('PRIVATE'),false);}
  assert.equal(await readFile(join(dir,'catalog1'),'utf8'),await readFile(join(dir,'catalog2'),'utf8'));const report=await readFile(join(dir,'evidence1'),'utf8');assert.equal(report,await readFile(join(dir,'evidence2'),'utf8'));assert.equal(report.includes('PRIVATE'),false);assert.match(report,/does not authenticate capture provenance/);
  for(const [source,dest] of [[resolve('package.json'),join(dir,'invalid')],[input,resolve('outputs/PRIVATE-catalog.json')]]){const result=run(source,dest,join(dir,'invalid-evidence'));assert.equal(result.status,1);assert.equal(result.stderr.includes('PRIVATE'),false);}
  const malformed=join(dir,'PRIVATE-invalid.json');await writeFile(malformed,'PRIVATE malformed');assert.equal(run(malformed,join(dir,'bad'),join(dir,'bad-evidence')).status,1);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('C private-path guards support absent sibling roots while existing and aliased protected trees stay excluded',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mw-private-root-'));
 try {
  const repo=join(dir,'protected'),alias=join(dir,'alias'),outside=join(dir,'protected-extra');
  await mkdir(repo);await mkdir(outside);await symlink(repo,alias,process.platform==='win32'?'junction':'dir');
  const privateFile=join(outside,'capture.json'),protectedFile=join(repo,'capture.json');
  await writeFile(privateFile,'synthetic');await writeFile(protectedFile,'synthetic');
  const absent=join(dir,'optional','sibling');
  assert.equal(await privatePath(privateFile,{roots:[repo,absent]}),await realpath(privateFile));
  assert.equal(await privatePath(join(outside,'catalog.json'),{output:true,roots:[repo,absent]}),join(await realpath(outside),'catalog.json'));
  for(const roots of [[repo,absent],[alias,absent]]){
   for(const input of [protectedFile,join(alias,'capture.json')])await assert.rejects(privatePath(input,{roots}),/Native receipt reconciliation rejected/);
   for(const output of [join(repo,'catalog.json'),join(alias,'catalog.json')])await assert.rejects(privatePath(output,{output:true,roots}),/Native receipt reconciliation rejected/);
   await assert.rejects(privatePath(join(repo,'..private.json'),{output:true,roots}),/Native receipt reconciliation rejected/);
  }
  const dotPrefixed=join(repo,'..private.json');await writeFile(dotPrefixed,'synthetic');await assert.rejects(privatePath(dotPrefixed,{roots:[repo,absent]}),/Native receipt reconciliation rejected/);
  // Resolve the nearest existing alias even when several trailing root components do not exist.
  assert.equal(await privatePath(privateFile,{roots:[join(alias,'missing','nested')]}),await realpath(privateFile));
  await mkdir(join(repo,'missing','nested'),{recursive:true});const reserved=join(repo,'missing','nested','capture.json');await writeFile(reserved,'synthetic');
  await assert.rejects(privatePath(reserved,{roots:[join(alias,'missing','nested')]}),/Native receipt reconciliation rejected/);
  // Relative input remains forbidden even when a protected checkout is absent.
  await assert.rejects(privatePath('relative-capture.json',{roots:[absent]}),/Native receipt reconciliation rejected/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
