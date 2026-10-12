import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import sharp from 'sharp';import {sourceReceiptPath,createSourceReceiptReader,createSourceGcsReadTransport} from '../../services/receipts/source-receipts.mjs';import {decodeSourceReceipt} from '../../services/receipts/decode-image.mjs';
const request='a'.repeat(32),receipt='b'.repeat(32),manual=`manual-receipts/dev/pwa/${request}/${receipt}.png`;
test('source receipt reads exact generated manual and hash-bound agent WebP; arbitrary legacy paths fail closed',async()=>{
 const png=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer(),webp=await sharp(png).webp().toBuffer(),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const read=createSourceReceiptReader({decodeImage:decodeSourceReceipt,storage:{read:async path=>path.mimeType==='image/webp'?{bytes:webp,mimeType:path.mimeType}:{bytes:png,mimeType:path.mimeType,metadata:{sha256:hash(png),environment:'dev'}}}});
 assert.deepEqual((await read(manual,'manual')).bytes,png);assert.deepEqual((await read(`//receipts/dev/2026/10/09/${'c'.repeat(64)}/${hash(webp)}.webp`,'agent')).bytes,webp);
 await assert.rejects(read(`//receipts/dev/2026/10/09/${'c'.repeat(64)}/${'d'.repeat(64)}.webp`,'agent'));
 for(const path of ['manual-receipts/dev/legacy name.png','manual-receipts/prod/pwa/a.png','//receipts/dev/../prod/a.png','https://example.invalid/image'])assert.throws(()=>sourceReceiptPath(path,'manual'));
});
test('source transport pins metadata generation for bounded exact read',async()=>{
 const seen=[],path=sourceReceiptPath(manual,'manual'),transport=createSourceGcsReadTransport({bucket:bucket=>({file:(key,options)=>{seen.push({bucket,key,options});return {getMetadata:async()=>[{generation:'123',size:'3',contentType:'image/png',metadata:{}}],download:async()=>[Buffer.from('abc')]}}})});
 await transport.read(path);assert.equal(seen[1].options.generation,'123');assert.equal(seen[1].key,path.key);await assert.rejects(transport.read({...path,key:'receipts/prod/escape.png'}));
});

test('native evidence requires both exact hashes and pinned content without PWA metadata',async()=>{
 const bytes=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer(),hash=value=>createHash('sha256').update(value).digest('hex'),reference='manual-receipts/dev/synthetic-native.png',key='appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/synthetic_native.png',descriptor={referenceSha256:hash(reference),keySha256:hash(key),generation:'789',mimeType:'image/png',sizeBytes:bytes.length,sha256:hash(bytes)};
 const path=sourceReceiptPath(reference,'manual',[descriptor]);assert.equal(path.key,key);assert.equal(path.generation,'789');assert.throws(()=>sourceReceiptPath('manual-receipts/dev/synthetic native.png','manual',[descriptor]));assert.throws(()=>sourceReceiptPath(reference,'manual',[{...descriptor,keySha256:'a'.repeat(64)}]));
 const read=createSourceReceiptReader({nativeDescriptors:[descriptor],decodeImage:decodeSourceReceipt,storage:{read:async()=>({bytes,mimeType:'image/png',metadata:{}})}});assert.deepEqual((await read(reference,'manual')).bytes,bytes);
});
