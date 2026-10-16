import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {businessEnv} from './business-env-fixture.mjs';
import {DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {decodeCommandReceipt} from '../../services/receipts/decode-image.mjs';
import {createCommandReceipts} from '../../services/receipts/command-receipts.mjs';
import {randomUUID} from 'node:crypto';
// The DEV command service runs the business runtime with the DEV profile and its verified receipt mapping.
const env={...businessEnv('dev','command'),DEV_RECEIPTS:'enabled',RECEIPT_BUCKET:DEV_RECEIPT_MAPPING.bucket,RECEIPT_SQL_PREFIX:DEV_RECEIPT_MAPPING.sqlPrefix,RECEIPT_OBJECT_PREFIX:DEV_RECEIPT_MAPPING.objectPrefix,RECEIPT_COMPATIBILITY_EVIDENCE:'synthetic-config-test'};
test('DEV command config rejects alternate database, identity, retired modes and ambient connection',()=>{
 assert.equal(loadBusinessConfig(env).receiptCompatibility.evidenceReference,'synthetic-config-test');
 for(const patch of [{DB_NAME:'loan_manager_prod'},{DB_USER:'postgres'},{COMMAND_MODE:'synthetic-only'},{COMMAND_FIXTURE_JSON:'{}'},{OWNER_FIREBASE_UID:'synthetic-owner'},{DATABASE_URL:'postgres://example'},{STORAGE_EMULATOR_HOST:'localhost'},{RECEIPT_BUCKET:'other-bucket'},{RECEIPT_COMPATIBILITY_EVIDENCE:' '}])assert.throws(()=>loadBusinessConfig({...env,...patch}),JSON.stringify(patch));
});
test('real Sharp decoder accepts PNG/JPEG and rejects corrupt or mismatched data',async()=>{
 const image=sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}});
 const png=await image.png().toBuffer(),jpg=await image.jpeg().toBuffer();
 await decodeCommandReceipt(png,'image/png');await decodeCommandReceipt(jpg,'image/jpeg');
 await assert.rejects(decodeCommandReceipt(png,'image/jpeg'));await assert.rejects(decodeCommandReceipt(png.subarray(0,20),'image/png'));await assert.rejects(decodeCommandReceipt(Buffer.alloc(5242881),'image/png'));
});
test('create acknowledgement loss reconciles exact immutable bytes; changed receipt conflicts',async()=>{
 const objects=new Map();let writes=0;
 const storage={async create(value){assert.equal(value.ifGenerationMatch,0);if(objects.has(value.key))throw Error('already exists');writes++;objects.set(value.key,{bytes:Buffer.from(value.bytes),mimeType:value.mimeType,metadata:{...value.metadata},generation:'1'});throw Error('acknowledgement lost')},async read({key}){if(!objects.has(key))throw Object.assign(Error(),{code:'OBJECT_NOT_FOUND'});return objects.get(key)}};
 const adapter=createCommandReceipts({storage,decodeImage:decodeCommandReceipt,compatibility:{...DEV_RECEIPT_MAPPING,status:'synthetic-transport-test',evidenceReference:'unit'}});
 const bytes=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();
 const input={requestId:randomUUID(),receiptId:randomUUID(),actor:{issuer:'issuer',subject:'subject',partnerId:'partner',loginEmail:'fixture@example.invalid'},mimeType:'image/png',bytes};
 await adapter.upload(input);await adapter.upload(input);assert.equal(writes,1);assert.deepEqual((await adapter.retrieve(input)).bytes,bytes);
 const other=await sharp({create:{width:2,height:2,channels:3,background:'#000000'}}).png().toBuffer();
 await assert.rejects(adapter.upload({...input,bytes:other}),/receipt_conflict/);
 await assert.rejects(adapter.retrieve({...input,actor:{...input.actor,subject:'other'}}));
});
