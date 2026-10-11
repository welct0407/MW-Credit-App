import {verifiedNativeDev} from './verified-native-dev.mjs';
import {createHash} from 'node:crypto';
import {DEV_RECEIPT_MAPPING} from './dev-receipt-adapter.mjs';
/** Reference input comes exclusively from an authorized Payment row, never a URL/client path. */
export function sourceReceiptPath(reference,kind,nativeDescriptors=verifiedNativeDev){
 if(typeof reference!=='string')throw Error('receipt_reference_unsupported');
 if(kind==='manual'){
  const match=/^manual-receipts\/dev\/pwa\/([a-f0-9]{32})\/([a-f0-9]{32})\.(png|jpg)$/.exec(reference);
  if(!match){
   const referenceSha256=createHash('sha256').update(reference,'utf8').digest('hex'),verified=nativeDescriptors.find(row=>row.referenceSha256===referenceSha256);
   if(!verified||!reference.startsWith('manual-receipts/dev/'))throw Error('receipt_reference_unsupported');const basename=reference.slice('manual-receipts/dev/'.length);
   if(!basename||/[\\/\u0000-\u001f]/u.test(basename)||basename==='.'||basename==='..')throw Error('receipt_reference_unsupported');
   // New catalog entries contain an independently reconciled exact private key.
   // The legacy conversion remains constrained to the original two closed hash pairs.
   const key=verified.key??DEV_RECEIPT_MAPPING.objectPrefix.slice(0,-4)+basename.replace(/[ -]/g,'_');
   if(createHash('sha256').update(key,'utf8').digest('hex')!==verified.keySha256)throw Error('receipt_reference_unsupported');
   return {bucket:DEV_RECEIPT_MAPPING.bucket,key,mimeType:verified.mimeType,expectedHash:verified.sha256,generation:verified.generation,sizeBytes:verified.sizeBytes,native:true};
  }
  return {bucket:DEV_RECEIPT_MAPPING.bucket,key:DEV_RECEIPT_MAPPING.objectPrefix+match[1]+'/'+match[2]+'.'+match[3],mimeType:match[3]==='png'?'image/png':'image/jpeg',expectedHash:null};
 }
 if(kind==='agent'){
  const match=/^\/\/receipts\/dev\/(\d{4})\/(\d{2})\/(\d{2})\/([a-f0-9]{64})\/([a-f0-9]{64})\.(jpg|png|webp)$/.exec(reference);
  if(!match)throw Error('receipt_reference_unsupported');const day=match[1]+'-'+match[2]+'-'+match[3];if(!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('receipt_reference_unsupported');
  return {bucket:DEV_RECEIPT_MAPPING.bucket,key:reference.slice(2),mimeType:match[6]==='jpg'?'image/jpeg':'image/'+match[6],expectedHash:match[5]};
 }
 throw Error('receipt_reference_unsupported');
}
export function createSourceReceiptReader({storage,decodeImage,nativeDescriptors=verifiedNativeDev}){
 if(typeof storage?.read!=='function'||typeof decodeImage!=='function')throw Error('Receipt read dependencies required');
 return async(reference,kind)=>{const path=sourceReceiptPath(reference,kind,nativeDescriptors);const object=await storage.read(path);if(!Buffer.isBuffer(object.bytes)||object.bytes.length<1||object.bytes.length>5242880||object.mimeType!==path.mimeType)throw Error('receipt_unavailable');const bytes=Buffer.from(object.bytes),hash=createHash('sha256').update(bytes).digest('hex');if(path.expectedHash&&hash!==path.expectedHash)throw Error('receipt_unavailable');if(path.native&&object.bytes.length!==path.sizeBytes)throw Error('receipt_unavailable');if(kind==='manual'&&!path.native&&(!/^[a-f0-9]{64}$/.test(object.metadata?.sha256??'')||object.metadata.sha256!==hash||object.metadata.environment!=='dev'))throw Error('receipt_unavailable');await decodeImage(bytes,path.mimeType);return {bytes,mimeType:path.mimeType};};
}
export function createSourceGcsReadTransport(storage,{nativeDescriptors=verifiedNativeDev}={}){
 return {async read({bucket,key,mimeType}){
  const verified=typeof key==='string'?nativeDescriptors.find(row=>row.keySha256===createHash('sha256').update(key,'utf8').digest('hex')):null;
  const generated=typeof key==='string'&&new RegExp('^'+DEV_RECEIPT_MAPPING.objectPrefix+'[a-f0-9]{32}/[a-f0-9]{32}\\.(png|jpg)$').test(key),agent=typeof key==='string'&&/^receipts\/dev\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{64}\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(key);
  if(bucket!==DEV_RECEIPT_MAPPING.bucket||(!generated&&!agent&&!verified))throw Error('receipt_reference_unsupported');
  const file=storage.bucket(bucket).file(key,verified?{generation:verified.generation}:undefined),[meta]=await file.getMetadata();
  if(!/^[1-9][0-9]*$/.test(meta.generation??'')||!/^\d+$/.test(String(meta.size))||BigInt(meta.size)<1n||BigInt(meta.size)>5242880n||meta.contentType!==mimeType||(verified&&(meta.generation!==verified.generation||Number(meta.size)!==verified.sizeBytes||mimeType!==verified.mimeType)))throw Error('receipt_unavailable');
  const [bytes]=await storage.bucket(bucket).file(key,{generation:meta.generation}).download({validation:'crc32c'});return {bytes,mimeType:meta.contentType,metadata:meta.metadata};
 }};
}
