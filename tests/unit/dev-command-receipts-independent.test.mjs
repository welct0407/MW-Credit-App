import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {randomUUID,createHash} from 'node:crypto';
import {decodeCommandReceipt} from '../../services/receipts/decode-image.mjs';
import {createCommandReceipts} from '../../services/receipts/command-receipts.mjs';
import {DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
const actor={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',subject:'synthetic-owner',partnerId:'synthetic-partner',loginEmail:'synthetic@example.invalid'};
test('G05 actual pinned Sharp decodes PNG/JPEG and rejects truncated, mismatched and excessive images',async()=>{
 const png=await sharp({create:{width:3,height:2,channels:3,background:'#ff7700'}}).png().toBuffer();
 const jpeg=await sharp(png).jpeg().toBuffer();
 await decodeCommandReceipt(png,'image/png');await decodeCommandReceipt(jpeg,'image/jpeg');
 await assert.rejects(decodeCommandReceipt(png.subarray(0,30),'image/png'),/invalid_receipt/);
 await assert.rejects(decodeCommandReceipt(png,'image/jpeg'),/invalid_receipt/);
 await assert.rejects(decodeCommandReceipt(Buffer.alloc(5242881),'image/png'),/invalid_receipt/);
 const huge=await sharp({create:{width:5000,height:4001,channels:3,background:'#ffffff'}}).png().toBuffer();
 await assert.rejects(decodeCommandReceipt(huge,'image/png'),/invalid_receipt/);
});
test('G05 exact create-zero and generation read preserve original bytes; identical lost ack reconciles without overwrite',async()=>{
 const bytes=await sharp({create:{width:2,height:2,channels:3,background:'#448800'}}).png().toBuffer();
 const objects=new Map(),calls=[];let loseAck=true;
 const storage={async create(input){calls.push(['create',input]);assert.equal(input.ifGenerationMatch,0);if(objects.has(input.key))throw Error('collision');objects.set(input.key,{...input,generation:'17',bytes:Buffer.from(input.bytes)});if(loseAck)throw Error('lost ack');return {generation:'17'}},async read(input){calls.push(['read',input]);const o=objects.get(input.key);if(!o)throw Object.assign(Error('missing'),{code:'OBJECT_NOT_FOUND'});if(input.generation)assert.equal(input.generation,o.generation);return {...o,bytes:Buffer.from(o.bytes)}}};
 const receipts=createCommandReceipts({storage,decodeImage:decodeCommandReceipt,compatibility:{status:'synthetic-transport-test',evidenceReference:'independent-local-only',...DEV_RECEIPT_MAPPING}});
 const input={requestId:randomUUID(),receiptId:randomUUID(),actor,bytes,mimeType:'image/png'};
 const receipt=(await receipts.upload(input)).receipt;assert.equal(receipt.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(receipt.generation,'17');
 loseAck=false;assert.deepEqual((await receipts.upload(input)).receipt,receipt);assert.equal(objects.size,1);
 const retrieved=await receipts.retrieve(input);assert.deepEqual(retrieved.bytes,bytes);assert.equal(retrieved.mimeType,'image/png');
 assert.ok(calls.some(([kind,input])=>kind==='read'&&input.generation==='17'));assert.equal(calls.filter(([kind])=>kind==='create').length,2);
 const other=await sharp(bytes).negate().png().toBuffer();await assert.rejects(receipts.upload({...input,bytes:other}),/receipt_conflict/);
 assert.deepEqual(objects.values().next().value.bytes,bytes);
});
test('G05 retained receipt rejects altered actor and byte/metadata binding',async()=>{
 const bytes=await sharp({create:{width:2,height:2,channels:3,background:'#448800'}}).png().toBuffer();let object;
 const storage={async create(input){object={...input,bytes:Buffer.from(input.bytes),generation:'1'};return {generation:'1'}},async read(input){if(!object||input.key!==object.key)throw Object.assign(Error(),{code:'OBJECT_NOT_FOUND'});return object}};
 const receipts=createCommandReceipts({storage,decodeImage:decodeCommandReceipt,compatibility:{status:'synthetic-transport-test',evidenceReference:'independent-local-only',...DEV_RECEIPT_MAPPING}});
 const input={requestId:randomUUID(),receiptId:randomUUID(),actor,bytes,mimeType:'image/png'};await receipts.upload(input);
 await assert.rejects(receipts.retrieve({...input,actor:{...actor,subject:'another'}}),/receipt_unavailable/);
 object={...object,bytes:Buffer.from(object.bytes)};object.bytes[object.bytes.length-1]^=1;await assert.rejects(receipts.retrieve(input),/receipt_unavailable/);
});

