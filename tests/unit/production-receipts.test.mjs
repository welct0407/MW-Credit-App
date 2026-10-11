import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {parseNativeProductionCatalog,createProductionNativeReceiptReader} from '../../services/receipts/production-native-catalog.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const binding={environment:'prod',database:'loan_manager_prod',bucket:'mw-payment-receipts-prod-508610-n7',objectRoot:'appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/',sourceEvidenceSha256:'a'.repeat(64)};
const bytes=Buffer.from('synthetic bytes'),reference='manual-receipts/prod/exact original.png',key=binding.objectRoot+'arbitrary-exact-key.png';const entry={referenceSha256:hash(reference),key,keySha256:hash(key),generation:'12345',mimeType:'image/png',sizeBytes:bytes.length,sha256:hash(bytes)};
const raw=JSON.stringify({...binding,schemaVersion:1,entries:[entry]});
test('PROD native catalog binds independent production evidence and rejects DEV, conflicts and traversal',()=>{
 assert.equal(parseNativeProductionCatalog(raw,binding).entries[0].key,key);
 for(const change of [{environment:'dev'},{database:'loan_manager_dev'},{sourceEvidenceSha256:'b'.repeat(64)},{objectRoot:'appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/'},{entries:[entry,entry]},{entries:[{...entry,key:binding.objectRoot+'../other'}]}])assert.throws(()=>parseNativeProductionCatalog(JSON.stringify({...JSON.parse(raw),...change}),binding));
});
test('authorized stored reference selects exactgeneration; metadata/hash fail beforedecode and unknownrefs zero storage',async()=>{
 const catalog=parseNativeProductionCatalog(raw,binding);let calls=0,decoded=0,meta={generation:entry.generation,size:String(bytes.length),contentType:entry.mimeType};
 const storage={bucket(bucket){assert.equal(bucket,binding.bucket);calls++;return{file(k,options){assert.equal(k,key);assert.deepEqual(options,{generation:entry.generation});return{getMetadata:async()=>[meta],download:async()=>[bytes]}}}}};
 const read=createProductionNativeReceiptReader({catalog,storage,decodeImage:async()=>{decoded++}});await assert.rejects(read('manual-receipts/dev/exact original.png','manual'));assert.equal(calls,0);assert.deepEqual((await read(reference,'manual')).bytes,bytes);assert.equal(decoded,1);meta={...meta,generation:'999'};await assert.rejects(read(reference,'manual'));assert.equal(decoded,1);
});
import {createProductionCommandReceipts} from '../../services/receipts/command-receipts.mjs';
import {PROD_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {createDevReceiptAdapter,createProductionReceiptAdapter,DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';

test('qualified compatibility is PROD-only, requires hash and exact binding; adapters remain default-off',async()=>{
 const storage={create:async()=>{throw Error('enabled-marker')},read:async()=>{}},decodeImage=async()=>{};
 const input={requestId:'12345678-1234-4234-8234-123456789abc',receiptId:'12345678-1234-4234-8234-123456789abd',actor:{issuer:'https://securetoken.google.com/clever-oasis-508610-n7',subject:'shared-user',partnerId:'synthetic-partner',loginEmail:'synthetic@example.invalid'},bytes:Buffer.from('synthetic-image'),mimeType:'image/png'};
 const compatibility={...PROD_RECEIPT_MAPPING,status:'verified-dev-render-and-prod-binding',evidenceReference:'a'.repeat(64)};
 await assert.rejects(createProductionReceiptAdapter({storage,decodeImage,compatibility}).upload(input),/enabled-marker/);
 for(const c of [undefined,{...compatibility,evidenceReference:'invalid'},{...compatibility,bucket:'wrong'},{...compatibility,objectPrefix:DEV_RECEIPT_MAPPING.objectPrefix}])await assert.rejects(createProductionReceiptAdapter({storage,decodeImage,compatibility:c}).upload(input),/receipt_unsupported/);
 await assert.rejects(createDevReceiptAdapter({storage,decodeImage,compatibility:{...compatibility,...DEV_RECEIPT_MAPPING}}).upload(input),/receipt_unsupported/);
});
test('production generated receipt uses distinct paths and actor/environment metadata; collision cannot change ownership',async()=>{
 const objects=new Map();const storage={async create(input){assert.equal(input.ifGenerationMatch,0);assert.ok(input.key.startsWith(PROD_RECEIPT_MAPPING.objectPrefix));if(objects.has(input.key))throw Error('exists');objects.set(input.key,{bytes:Buffer.from(input.bytes),generation:'1',mimeType:input.mimeType,metadata:input.metadata});return{generation:'1'};},async read(input){const object=objects.get(input.key);if(!object)throw Object.assign(Error('missing'),{code:'OBJECT_NOT_FOUND'});return object;}};
 const adapter=createProductionCommandReceipts({storage,decodeImage:async()=>{},compatibility:{status:'synthetic-transport-test',evidenceReference:'synthetic',...PROD_RECEIPT_MAPPING}});
 const input={requestId:'12345678-1234-4234-8234-123456789abc',receiptId:'12345678-1234-4234-8234-123456789abd',actor:{issuer:'https://securetoken.google.com/clever-oasis-508610-n7',subject:'shared-user',partnerId:'synthetic-partner',loginEmail:'synthetic@example.invalid'},bytes:Buffer.from('synthetic-image'),mimeType:'image/png'};
 assert.equal((await adapter.upload(input)).receipt.sizeBytes,input.bytes.length);assert.equal([...objects.values()][0].metadata.environment,'prod');
 assert.ok((await adapter.resolveReceipt(input)).descriptor.storageReference.startsWith('manual-receipts/prod/pwa/'));
 await assert.rejects(adapter.retrieve({...input,actor:{...input.actor,subject:'other-user'}}));assert.equal(objects.size,1);
});
