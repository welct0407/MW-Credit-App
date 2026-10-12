import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {parseNativeDevCatalog,NATIVE_DEV_ROOT} from '../../services/receipts/native-catalog.mjs';
import {verifiedNativeDev} from '../../services/receipts/verified-native-dev.mjs';
import {sourceReceiptPath,createSourceReceiptReader,createSourceGcsReadTransport} from '../../services/receipts/source-receipts.mjs';
import {decodeSourceReceipt} from '../../services/receipts/decode-image.mjs';
import {DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {DEV_INSTANCE} from '../../services/api/dev-read-config.mjs';
import {reconcileCapturedNative,privatePath} from '../../scripts/receipts/reconcile-native.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const reference='manual-receipts/dev/synthetic original.png',key=NATIVE_DEV_ROOT+'synthetic-exact-unrelated-key.png';
const bytes=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
const entry={referenceSha256:hash(reference),key,keySha256:hash(key),generation:'789',mimeType:'image/png',sizeBytes:bytes.length,sha256:hash(bytes)};
const catalog=entries=>({schemaVersion:1,environment:'dev',bucket:DEV_RECEIPT_MAPPING.bucket,objectRoot:NATIVE_DEV_ROOT,entries});
const parse=entries=>parseNativeDevCatalog(JSON.stringify(catalog(entries)));
test('optional private catalog preserves old pins and resolves exact arbitrary key only for pinned reference',()=>{
  assert.equal(parseNativeDevCatalog(undefined),verifiedNativeDev);
  const descriptors=parse([entry]);assert.equal(descriptors.length,3);assert.equal(sourceReceiptPath(reference,'manual',descriptors).key,key);
  assert.throws(()=>sourceReceiptPath(reference+'changed','manual',descriptors));
  assert.throws(()=>sourceReceiptPath('https://example.invalid/private','manual',descriptors));
});
test('identical legacy pins bootstrap to exact private key; differing generation or content never shadows fallback',()=>{
  const {key:ignored,...legacy}=entry;
  const raw=JSON.stringify(catalog([entry]));
  const pins=parseNativeDevCatalog(raw,{legacy:[legacy]});assert.equal(pins.length,1);assert.equal(pins[0].key,key);
  for(const change of [{generation:'790'},{sha256:'a'.repeat(64)},{referenceSha256:'b'.repeat(64)}])assert.throws(()=>parseNativeDevCatalog(JSON.stringify(catalog([{...entry,...change}])),{legacy:[legacy]}));
});
test('malformed catalogs and duplicate or legacy-conflicting pins fail closed without private errors',()=>{
  const invalidEntries=[[entry,entry],[{...entry,referenceSha256:verifiedNativeDev[0].referenceSha256}],[{...entry,keySha256:verifiedNativeDev[0].keySha256}],
    [{...entry,extra:'private'}],[{...entry,generation:'0'}],[{...entry,sizeBytes:5242881}],[{...entry,mimeType:'text/html'}],[{...entry,sha256:'bad'}]];
  for(const k of [NATIVE_DEV_ROOT+'../escape.png',NATIVE_DEV_ROOT+'pwa/escape.png',NATIVE_DEV_ROOT+'bad\\name.png',NATIVE_DEV_ROOT+'bad\0name.png','receipts/prod/private.png'])invalidEntries.push([{...entry,key:k,keySha256:hash(k)}]);
  for(const entries of invalidEntries)assert.throws(()=>parse(entries),error=>error.message==='Invalid DEV native receipt catalog');
  for(const raw of ['',null,'x'.repeat(65537),JSON.stringify({...catalog([entry]),environment:'prod'}),JSON.stringify({...catalog([entry]),extra:1})])assert.throws(()=>parseNativeDevCatalog(raw));
});
test('private catalog transport pins generation and verifies metadata, bytes before decode',async()=>{
  const descriptors=parse([entry]);let mode='ok',downloads=0,decodes=0;
  const storage={bucket:bucket=>{assert.equal(bucket,DEV_RECEIPT_MAPPING.bucket);return {file:(k,options)=>{assert.equal(k,key);assert.equal(options.generation,'789');return {
    getMetadata:async()=>[{generation:mode==='generation'?'790':'789',size:mode==='size'?1:bytes.length,contentType:mode==='mime'?'image/jpeg':'image/png'}],
    download:async()=>{downloads++;return [mode==='hash'?Buffer.from(bytes).fill(0):bytes];}
  }}}}};
  const reader=createSourceReceiptReader({nativeDescriptors:descriptors,storage:createSourceGcsReadTransport(storage,{nativeDescriptors:descriptors}),decodeImage:async(...args)=>{decodes++;return decodeSourceReceipt(...args);}});
  await reader(reference,'manual');assert.equal(decodes,1);
  for(mode of ['generation','size','mime']){const before=downloads;await assert.rejects(reader(reference,'manual'));assert.equal(downloads,before);}
  mode='hash';await assert.rejects(reader(reference,'manual'));assert.equal(decodes,1);
});
const capture=()=>({schemaVersion:1,environment:'dev',entries:[{
  database:{database:'loan_manager_dev',instance:DEV_INSTANCE,host:'34.21.174.215',table:'Payments',column:'Uploaded Receipt',readOnly:true,capturedAt:'2026-10-11T00:00:00Z',rowId:'synthetic-payment',reference},
  appsheet:{appId:'500b27b6-884a-41e8-a9ec-df801b0110ad',method:'authenticated-appsheet-media',reference,rowId:'synthetic-payment',capturedAt:'2026-10-11T00:00:00Z',mediaPath:'synthetic-appsheet',mimeType:'image/png',sha256:hash(bytes)},
  gcs:{...entry,bucket:DEV_RECEIPT_MAPPING.bucket,capturedAt:'2026-10-11T00:00:00Z',mediaPath:'synthetic-gcs'}
}]});
test('reconciler requires independently captured matching AppSheet bytes, exact row/reference and DEV identities',async()=>{
  const result=await reconcileCapturedNative(capture(),{readMedia:async()=>bytes});assert.deepEqual(result.catalog,catalog([entry]));
  const evidence=JSON.stringify(result.evidence);for(const privateValue of [reference,key,'synthetic-payment','synthetic-appsheet'])assert.equal(evidence.includes(privateValue),false);
  for(const mutate of [c=>c.entries[0].database.database='loan_manager_prod',c=>c.entries[0].database.reference+='changed',c=>c.entries[0].appsheet.rowId='different',c=>c.entries[0].appsheet.method='filename-guess',c=>c.entries[0].gcs.generation='0',c=>c.entries.push(c.entries[0])]){
    const input=capture();mutate(input);await assert.rejects(reconcileCapturedNative(input,{readMedia:async()=>bytes}),e=>e.message==='Native receipt reconciliation rejected');
  }
  await assert.rejects(reconcileCapturedNative(capture(),{readMedia:async path=>path==='synthetic-appsheet'?Buffer.from(bytes).fill(0):bytes}));
});
test('CLI private paths reject repository inputs/outputs and require absolute paths',async()=>{
  await assert.rejects(privatePath('relative.json'));
  await assert.rejects(privatePath(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')));
  await assert.rejects(privatePath(process.cwd()+'/private-catalog.json',{output:true}));
});
