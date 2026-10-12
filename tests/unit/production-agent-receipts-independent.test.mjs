import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {createProductionAgentReceiptReader} from '../../services/receipts/production-agent-receipts.mjs';
import {decodeSourceReceipt} from '../../services/receipts/decode-image.mjs';

test('real decoded agent bytes remain bound to exact captured generation during latest-object replacement',async()=>{
 const original=await sharp({create:{width:3,height:2,channels:3,background:'#207050'}}).png().toBuffer();
 const replacement=await sharp({create:{width:3,height:2,channels:3,background:'#800010'}}).png().toBuffer();
 const hash=createHash('sha256').update(original).digest('hex'),asset='a'.repeat(64),reference=`//receipts/prod/2026/10/11/${asset}/${hash}.png`;
 let latest='17',downloads=0,lookups=0;
 const storage={bucket:b=>{assert.equal(b,'mw-payment-receipts-prod-508610-n7');return{file:(key,options)=>{assert.equal(key,reference.slice(2));return{getMetadata:async()=>{lookups++;assert.equal(latest,'17');latest='18';return[{generation:'17',size:String(original.length),contentType:'image/png'}]},download:async request=>{downloads++;assert.deepEqual(options,{generation:'17'});assert.deepEqual(request,{validation:'crc32c'});return[options.generation==='17'?original:replacement]}}}}}};
 const read=createProductionAgentReceiptReader({storage,decodeImage:decodeSourceReceipt}),projection={agentReceiptId:asset,agentReceivedAt:'2026-10-11 08:09:10.123456'};
 const result=await read(reference,projection);assert.deepEqual(result,{bytes:original,mimeType:'image/png'});assert.equal(latest,'18');assert.equal(lookups,1);assert.equal(downloads,1);
});

test('invalid triplets never touch storage and a vanished pinned generation cannot fall back to latest',async()=>{
 const asset='b'.repeat(64),reference=`//receipts/prod/2026/10/11/${asset}/${'c'.repeat(64)}.png`;let calls=0;
 const forbidden=createProductionAgentReceiptReader({storage:{bucket(){calls++;throw Error('unexpected storage')}},decodeImage:decodeSourceReceipt});
 for(const projection of [{},{agentReceiptId:'a'.repeat(64),agentReceivedAt:'2026-10-11 12:13:14'},{agentReceiptId:asset,agentReceivedAt:'2026-02-30 12:13:14'},{agentReceiptId:asset,agentReceivedAt:'2026-10-11 24:00:00'}])await assert.rejects(forbidden(reference,projection));
 assert.equal(calls,0);
 let metadata=0,downloads=0;
 const read=createProductionAgentReceiptReader({storage:{bucket:()=>({file:(_key,options)=>({getMetadata:async()=>{metadata++;return[{generation:'123',size:'10',contentType:'image/png'}]},download:async()=>{downloads++;assert.deepEqual(options,{generation:'123'});throw Error('old generation deleted')}})})},decodeImage:decodeSourceReceipt});
 await assert.rejects(read(reference,{agentReceiptId:asset,agentReceivedAt:'2026-10-11 12:13:14'}));assert.equal(metadata,1);assert.equal(downloads,1);
});
