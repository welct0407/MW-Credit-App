import { createHash } from 'node:crypto';
import { canonicalActor,canonicalReceipt } from '../contracts/payment-command.mjs';
export const DEV_RECEIPT_MAPPING=Object.freeze({bucket:'mw-payment-receipts-prod-508610-n7',sqlPrefix:'manual-receipts/dev/pwa/',objectPrefix:'appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/pwa/'});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const generation=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value);
export function generatedReceiptPaths({requestId,receiptId,mimeType}) {
 if(!uuid(requestId)||!uuid(receiptId)||!['image/png','image/jpeg'].includes(mimeType))throw Error('invalid_receipt');
 const suffix=requestId.replaceAll('-','')+'/'+receiptId.replaceAll('-','')+(mimeType==='image/png'?'.png':'.jpg');
 return Object.freeze({bucket:DEV_RECEIPT_MAPPING.bucket,storageReference:DEV_RECEIPT_MAPPING.sqlPrefix+suffix,key:DEV_RECEIPT_MAPPING.objectPrefix+suffix});
}
/** No SDK or credentials. Synthetic transport verification does not prove AppSheet rendering. */
export function createDevReceiptAdapter({storage,decodeImage,compatibility}={}) {
 if(!storage||typeof storage.create!=='function'||typeof storage.read!=='function'||typeof decodeImage!=='function')throw Error('Receipt dependencies required');
 const enabled=compatibility&&['synthetic-transport-test','verified-appsheet-render'].includes(compatibility.status)&&typeof compatibility.evidenceReference==='string'&&compatibility.evidenceReference.trim()&&Object.entries(DEV_RECEIPT_MAPPING).every(([k,v])=>compatibility[k]===v);
 function guard(){if(!enabled)throw Error('receipt_unsupported')}
 function binding(requestId,receiptId,actor){if(!uuid(requestId)||!uuid(receiptId))throw Error('invalid_receipt');const canonical=canonicalActor(actor);return {actor:canonical,actorSha256:hash(JSON.stringify(canonical))};}
 async function verifyRead({requestId,receiptId,actor,mimeType,expectedGeneration}) {
  const bound=binding(requestId,receiptId,actor),paths=generatedReceiptPaths({requestId,receiptId,mimeType});
  const object=await storage.read({bucket:paths.bucket,key:paths.key,...(expectedGeneration?{generation:expectedGeneration}:{})});
  if(!object||!generation(object.generation)||(expectedGeneration&&object.generation!==expectedGeneration)||object.mimeType!==mimeType||!Buffer.isBuffer(object.bytes)||!object.bytes.length||object.bytes.length>5242880)throw Object.assign(Error('receipt_unavailable'),{receiptInvalid:true});
  const sha256=hash(object.bytes),expected={pwaReceiptVersion:'1',environment:'dev',requestId,receiptId,actorSha256:bound.actorSha256,sha256,contentType:mimeType,sizeBytes:String(object.bytes.length)};
  if(!object.metadata||Object.keys(expected).some(k=>object.metadata[k]!==expected[k]))throw Object.assign(Error('receipt_unavailable'),{receiptInvalid:true});
  await decodeImage(object.bytes,mimeType);
  return Object.freeze({descriptor:canonicalReceipt({receiptId,sha256,mimeType,sizeBytes:object.bytes.length,storageReference:paths.storageReference}),requestId,actor:bound.actor,generation:object.generation});
 }
 return Object.freeze({
  async upload({requestId,receiptId,actor,bytes,mimeType}) {
   guard();const bound=binding(requestId,receiptId,actor),paths=generatedReceiptPaths({requestId,receiptId,mimeType});
   if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>5242880)throw Error('invalid_receipt');
   bytes=Buffer.from(bytes);
   await decodeImage(bytes,mimeType);
   const metadata={pwaReceiptVersion:'1',environment:'dev',requestId,receiptId,actorSha256:bound.actorSha256,sha256:hash(bytes),contentType:mimeType,sizeBytes:String(bytes.length)};
   const created=await storage.create({bucket:paths.bucket,key:paths.key,bytes,mimeType,metadata,ifGenerationMatch:0});
   if(!generation(created?.generation))throw Object.assign(Error('receipt_unavailable'),{receiptInvalid:true});
   return verifyRead({requestId,receiptId,actor:bound.actor,mimeType,expectedGeneration:created.generation});
  },
  async resolve({requestId,receiptId,actor,mimeType,generation:expectedGeneration}) {
   guard();if(expectedGeneration!==undefined&&!generation(expectedGeneration))throw Error('invalid_receipt');
   return verifyRead({requestId,receiptId,actor,mimeType,expectedGeneration});
  },
  // Fixed extension candidates are exact-key reads, never a bucket listing or arbitrary path conversion.
  async resolveReceipt({requestId,receiptId,actor}) {
   guard();let found;
   for(const mimeType of ['image/png','image/jpeg']){
    try{const value=await verifyRead({requestId,receiptId,actor,mimeType});if(found)throw Error('ambiguous_receipt');found=value}catch(error){if(error?.code==='OBJECT_NOT_FOUND')continue;throw error;}
   }
   if(!found)throw Object.assign(Error('receipt_unavailable'),{receiptInvalid:true});const {descriptor,actor:boundActor}=found;return {descriptor,requestId,actor:boundActor};
  },
 });
}
