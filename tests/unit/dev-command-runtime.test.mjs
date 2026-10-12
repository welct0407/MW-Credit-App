import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {loadDevCommandConfig} from '../../services/payment-command/dev-config.mjs';
import {DEV_INSTANCE,DEV_PROJECT} from '../../services/api/dev-read-config.mjs';
import {COMMAND_DB_USER} from '../../services/payment-command/dev-target.mjs';
import {DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {decodeCommandReceipt} from '../../services/receipts/decode-image.mjs';
import {createCommandReceipts} from '../../services/receipts/command-receipts.mjs';
import {randomUUID} from 'node:crypto';
const env={APP_ENV:'dev',AUTH_MODE:'firebase',FIREBASE_PROJECT_ID:DEV_PROJECT,DB_NAME:'loan_manager_dev',INSTANCE_CONNECTION_NAME:DEV_INSTANCE,DB_USER:COMMAND_DB_USER,OWNER_IDENTITY_MODE:'uid-pinned',OWNER_FIREBASE_UID:'synthetic-owner',ALLOWED_WEB_ORIGINS:'["https://mw-credit-app-dev-737787224638.web.app"]',COMMAND_MODE:'synthetic-only',COMMAND_FIXTURE_JSON:JSON.stringify({borrowerId:'fixture',chargeIds:['charge'],cashAccountIds:['account']}),RECEIPT_BUCKET:DEV_RECEIPT_MAPPING.bucket,RECEIPT_SQL_PREFIX:DEV_RECEIPT_MAPPING.sqlPrefix,RECEIPT_OBJECT_PREFIX:DEV_RECEIPT_MAPPING.objectPrefix,RECEIPT_COMPATIBILITY_EVIDENCE:'synthetic-config-test'};
test('DEV command config rejects alternate database, identity, broad mode and ambient connection',()=>{
 assert.equal(loadDevCommandConfig(env).fixture.borrowerId,'fixture');
 for(const patch of [{DB_NAME:'loan_manager_prod'},{DB_USER:'postgres'},{COMMAND_MODE:'all'},{OWNER_IDENTITY_MODE:'email-bootstrap'},{DATABASE_URL:'postgres://example'},{STORAGE_EMULATOR_HOST:'localhost'},{COMMAND_FIXTURE_JSON:'{}'}])assert.throws(()=>loadDevCommandConfig({...env,...patch}));
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
