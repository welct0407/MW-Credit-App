import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/receipt-image.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {scaledSize,needsDownscale,prepareReceiptImage,RECEIPT_TARGET_BYTES}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// APP-PAY-01 client half: phone photos are reduced to about 1600 px JPEG under 1 MiB before upload or queueing.
test('scaledSize keeps aspect ratio and never upscales',()=>{
 assert.deepEqual(scaledSize(4032,3024),{width:1600,height:1200,scale:1600/4032});
 assert.deepEqual(scaledSize(3024,4032),{width:1200,height:1600,scale:1600/4032});
 assert.deepEqual(scaledSize(1200,800),{width:1200,height:800,scale:1});
 assert.deepEqual(scaledSize(1600,900),{width:1600,height:900,scale:1});
});
test('needsDownscale triggers on bytes or edge, never on undecodable input',()=>{
 assert.equal(needsDownscale({type:'image/jpeg',size:300000},{width:1200,height:900}),false);
 assert.equal(needsDownscale({type:'image/jpeg',size:3000000},{width:4032,height:3024}),true);
 assert.equal(needsDownscale({type:'image/jpeg',size:900000},{width:2000,height:1500}),true);
 assert.equal(needsDownscale({type:'image/jpeg',size:RECEIPT_TARGET_BYTES},{width:1600,height:1600}),false);
 assert.equal(needsDownscale({type:'image/jpeg',size:3000000},null),false);
});
function canvasStub(sizes,record){
 return {width:0,height:0,getContext(){return {drawImage(_image,x,y,width,height){record.draw={x,y,width,height}}}},toBlob(callback,type,quality){record.qualities.push(quality);const size=sizes[record.qualities.length-1]??sizes.at(-1);callback(new Blob([new Uint8Array(size)],{type}))}};
}
test('prepareReceiptImage downscales a large photo to JPEG under the target and records the quality ladder',async()=>{
 const original=new File([new Uint8Array(3000000)],'IMG_0001.HEIC.png',{type:'image/png',lastModified:1700000000000});
 const record={qualities:[],draw:null};let closed=0;let orientation=null;
 const canvas=canvasStub([2*1024*1024,900*1024],record);
 const result=await prepareReceiptImage(original,{createImageBitmap:async(_file,options)=>{orientation=options?.imageOrientation;return {width:4000,height:3000,close(){closed++}}},createCanvas:()=>canvas});
 assert.equal(result.type,'image/jpeg');assert.equal(result.size,900*1024);assert.equal(result.name,'IMG_0001.HEIC.jpg');assert.equal(result.lastModified,1700000000000);
 assert.deepEqual([canvas.width,canvas.height],[1600,1200]);assert.deepEqual(record.draw,{x:0,y:0,width:1600,height:1200});
 assert.deepEqual(record.qualities,[0.85,0.75]);assert.equal(closed,1);assert.equal(orientation,'from-image');
});
test('prepareReceiptImage returns the original when decoding fails, when small enough, or when re-encoding is not smaller',async()=>{
 const small=new File([new Uint8Array(400000)],'small.jpg',{type:'image/jpeg'});
 assert.equal(await prepareReceiptImage(small,{createImageBitmap:async()=>({width:1200,height:900}),createCanvas:()=>{throw Error('canvas must not be created')}}),small);
 const broken=new File([new Uint8Array(2000000)],'broken.jpg',{type:'image/jpeg'});
 assert.equal(await prepareReceiptImage(broken,{createImageBitmap:async()=>{throw Error('undecodable')},createCanvas:()=>{throw Error('canvas must not be created')}}),broken);
 const incompressible=new File([new Uint8Array(1200000)],'dense.jpg',{type:'image/jpeg'});
 const record={qualities:[],draw:null};
 assert.equal(await prepareReceiptImage(incompressible,{createImageBitmap:async()=>({width:1700,height:1700}),createCanvas:()=>canvasStub([1300000,1250000,1200000],record)}),incompressible);
 assert.deepEqual(record.qualities,[0.85,0.75,0.65]);
 const text=new File([new Uint8Array(10)],'note.txt',{type:'text/plain'});
 assert.equal(await prepareReceiptImage(text,{createImageBitmap:async()=>{throw Error('must not decode')},createCanvas:()=>{throw Error('no canvas')}}),text);
 const throwing=new File([new Uint8Array(2000000)],'throw.jpg',{type:'image/jpeg'});
 assert.equal(await prepareReceiptImage(throwing,{createImageBitmap:async()=>({width:4000,height:3000}),createCanvas:()=>{throw Error('canvas unavailable')}}),throwing);
});
test('prepareReceiptImage retries decoding without the orientation option on older engines',async()=>{
 const original=new File([new Uint8Array(2000000)],'old.jpg',{type:'image/jpeg'});const calls=[];const record={qualities:[],draw:null};
 const result=await prepareReceiptImage(original,{createImageBitmap:async(_file,options)=>{calls.push(options);if(options)throw TypeError('unsupported option');return {width:4000,height:3000}},createCanvas:()=>canvasStub([500000],record)});
 assert.equal(calls.length,2);assert.equal(calls[1],undefined);assert.equal(result.size,500000);assert.equal(result.type,'image/jpeg');
});
