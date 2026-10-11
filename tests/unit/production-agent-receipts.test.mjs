import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProductionSourceReceiptReader} from '../../services/receipts/production-source-receipts.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import sharp from 'sharp';
import {decodeSourceReceipt} from '../../services/receipts/decode-image.mjs';
import {createProductionAgentReceiptReader} from '../../services/receipts/production-agent-receipts.mjs';

const bytes=Buffer.from('synthetic receipt'),sha=createHash('sha256').update(bytes).digest('hex'),asset='a'.repeat(64);
const reference=`//receipts/prod/2026/10/11/${asset}/${sha}.png`;
const projection={agentReceiptId:asset,agentReceivedAt:'2026-10-11 23:59:59.123456'};
function fixture({metadata={},downloadBytes=bytes,decodeError=false}={}){
 const calls=[];let decoded=0;
 const storage={bucket(bucket){assert.equal(bucket,'mw-payment-receipts-prod-508610-n7');return {file(key,options){calls.push({key,options});return {getMetadata:async()=>[{generation:'123',contentType:'image/png',size:String(bytes.length),...metadata}],download:async opts=>{assert.deepEqual(opts,{validation:'crc32c'});assert.deepEqual(options,{generation:'123'});return [downloadBytes]}}}}}};
 const read=createProductionSourceReceiptReader({catalog:{environment:'prod',database:'loan_manager_prod',entries:[]},storage,decodeImage:async()=>{decoded++;if(decodeError)throw Error('bad image')}});
 return {read,calls,get decoded(){return decoded}};
}
test('PROD agent uses exact complete triplet, hashes bytes and pins metadata generation',async()=>{
 const f=fixture();assert.deepEqual(await f.read(reference,'agent',projection),{bytes,mimeType:'image/png'});
 assert.deepEqual(f.calls,[{key:reference.slice(2),options:undefined},{key:reference.slice(2),options:{generation:'123'}}]);assert.equal(f.decoded,1);
});
test('invalid agent identity/environment/date/path fails before storage; manual cannot override source kind',async()=>{
 for(const [ref,kind,p] of [[reference.replace('/prod/','/dev/'),'agent',projection],[reference.replace('/10/11/','/02/30/'),'agent',projection],[reference+'/../x','agent',projection],[reference,'manual',projection],[reference,'agent',{}],[reference,'agent',{...projection,agentReceiptId:'b'.repeat(64)}],[reference,'agent',{...projection,agentReceivedAt:'2026-02-30 10:00:00'}],[reference,'agent',{...projection,agentReceivedAt:null}]]){
  const f=fixture();await assert.rejects(f.read(ref,kind,p));assert.equal(f.calls.length,0);
 }
});
test('agent rejects oversize, missing generation, MIME, raw hash, byte length and decode failures',async()=>{
 for(const options of [{metadata:{size:'5242881'}},{metadata:{generation:'0'}},{metadata:{contentType:'image/jpeg'}},{downloadBytes:Buffer.alloc(bytes.length)},{downloadBytes:Buffer.from('short')},{decodeError:true}])await assert.rejects(fixture(options).read(reference,'agent',projection));
});
test('production decoder serves valid PNG/JPEG/WebP agent bytes and rejects valid hash of nonimage bytes',async()=>{
 for(const format of ['png','jpeg','webp','invalid']){
  const data=format==='invalid'?Buffer.from('not an image'):await sharp({create:{width:2,height:2,channels:3,background:'#336699'}}).toFormat(format).toBuffer();
  const ext=format==='jpeg'?'jpg':format==='invalid'?'png':format,mimeType=ext==='jpg'?'image/jpeg':`image/${ext}`;
  const ref=`//receipts/prod/2026/10/11/${asset}/${createHash('sha256').update(data).digest('hex')}.${ext}`;
  const storage={bucket:()=>({file:()=>({getMetadata:async()=>[{generation:'123',size:String(data.length),contentType:mimeType}],download:async()=>[data]})})};
  const read=createProductionAgentReceiptReader({storage,decodeImage:decodeSourceReceipt});
  if(format==='invalid')await assert.rejects(read(ref,projection));else assert.deepEqual((await read(ref,projection)).bytes,data);
 }
});

function storeFixture({changed={},revoke=false,missing=false}={}){
 const actor={issuer:'issuer',subject:'subject',loginEmail:'test@example.invalid',partnerId:'partner'};let reads=0,authorizations=0;const queries=[];
 const row={manual:null,agent:reference,...projection};
 const client={query:async(sql)=>{queries.push(sql);if(sql.startsWith('SELECT "Uploaded Receipt"')){reads++;return {rows:reads===1?[row]:missing?[]:[{...row,...changed}]}}return {rows:[]}},release(){}};
 const store=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>++authorizations===2&&revoke?null:actor,actorIssuer:'issuer',sourceReceiptReader:async(ref,kind,p)=>{assert.equal(ref,reference);assert.equal(kind,'agent');assert.deepEqual(p,row);return {bytes,mimeType:'image/png'}}});
 return {store,queries};
}
test('receipt response rechecks current reference/triplet and current actor after download',async()=>{
 const f=storeFixture();assert.equal((await f.store.paymentImage({},'payment-id')).ok,true);assert.ok(f.queries.includes('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'));
 for(const options of [{changed:{agent:'changed'}},{changed:{agentReceiptId:'changed'}},{changed:{agentReceivedAt:'2026-10-12 00:00:00'}},{changed:{manual:'new preferred'}},{missing:true},{revoke:true}]){
  const result=await storeFixture(options).store.paymentImage({},'payment-id');assert.equal(result.ok,false);assert.equal(result.code,options.revoke?'access_denied':'receipt_unavailable');
 }
});
