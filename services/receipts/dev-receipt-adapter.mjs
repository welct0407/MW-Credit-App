import { createHash } from 'node:crypto';
import { canonicalActor,canonicalReceipt } from '../contracts/payment-command.mjs';
/** @typedef {{readonly bucket:string,readonly sqlPrefix:string,readonly objectPrefix:string}} ReceiptMapping */
/** @type {ReceiptMapping} */
export const DEV_RECEIPT_MAPPING=Object.freeze({bucket:'mw-payment-receipts-prod-508610-n7',sqlPrefix:'manual-receipts/dev/pwa/',objectPrefix:'appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/pwa/'});
/** @type {ReceiptMapping} */
export const PROD_RECEIPT_MAPPING=Object.freeze({bucket:'mw-payment-receipts-prod-508610-n7',sqlPrefix:'manual-receipts/prod/pwa/',objectPrefix:'appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/pwa/'});
import {isUuidV4 as uuid} from '../lib/ids.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const generation=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value);
export function generatedReceiptPaths({requestId,receiptId,mimeType},mapping=DEV_RECEIPT_MAPPING) {
 if(!uuid(requestId)||!uuid(receiptId)||!['image/png','image/jpeg'].includes(mimeType))throw Error('invalid_receipt');
 const suffix=requestId.replaceAll('-','')+'/'+receiptId.replaceAll('-','')+(mimeType==='image/png'?'.png':'.jpg');
 return Object.freeze({bucket:mapping.bucket,storageReference:mapping.sqlPrefix+suffix,key:mapping.objectPrefix+suffix});
}
/** No SDK or credentials. Synthetic transport verification does not prove live rendering. */
export function createDevReceiptAdapter(options={}){return createBoundReceiptAdapter(options,DEV_RECEIPT_MAPPING,'dev')}
export function createProductionReceiptAdapter(options={}){return createBoundReceiptAdapter(options,PROD_RECEIPT_MAPPING,'prod')}
/** @param {{storage?:any,decodeImage?:any,compatibility?:any}} options @param {ReceiptMapping} mapping @param {'dev'|'prod'} environment */
function createBoundReceiptAdapter({storage,decodeImage,compatibility},mapping,environment) {
 if(!storage||typeof storage.create!=='function'||typeof storage.read!=='function'||typeof decodeImage!=='function')throw Error('Receipt dependencies required');
 const qualifiedProdReuse=environment==='prod'&&compatibility?.status==='verified-dev-render-and-prod-binding'&&/^[a-f0-9]{64}$/.test(compatibility.evidenceReference??'');
 const nativeVerified=compatibility?.status==='verified-native-render'&&/^[a-f0-9]{64}$/.test(compatibility.evidenceReference??'');
 const enabled=compatibility&&(nativeVerified||['synthetic-transport-test','verified-appsheet-render'].includes(compatibility.status)||qualifiedProdReuse)&&typeof compatibility.evidenceReference==='string'&&compatibility.evidenceReference.trim()&&Object.entries(mapping).every(([k,v])=>compatibility[k]===v);
 function guard(){if(!enabled)throw Error('receipt_unsupported')}
 function binding(requestId,receiptId,actor){if(!uuid(requestId)||!uuid(receiptId))throw Error('invalid_receipt');const canonical=canonicalActor(actor);return {actor:canonical,actorSha256:hash(JSON.stringify(canonical))};}
 /** @param {{requestId:string,receiptId:string,actor:any,mimeType:string,expectedGeneration?:string}} input */
 async function verifyRead({requestId,receiptId,actor,mimeType,expectedGeneration}) {
  const bound=binding(requestId,receiptId,actor),paths=generatedReceiptPaths({requestId,receiptId,mimeType},mapping);
  const object=await storage.read({bucket:paths.bucket,key:paths.key,...(expectedGeneration?{generation:expectedGeneration}:{})});
  if(!object||!generation(object.generation)||(expectedGeneration&&object.generation!==expectedGeneration)||object.mimeType!==mimeType||!Buffer.isBuffer(object.bytes)||!object.bytes.length||object.bytes.length>5242880)throw Object.assign(Error('receipt_unavailable'),{receiptInvalid:true});
  const sha256=hash(object.bytes),expected={pwaReceiptVersion:'1',environment,requestId,receiptId,actorSha256:bound.actorSha256,sha256,contentType:mimeType,sizeBytes:String(object.bytes.length)};
  if(!object.metadata||Object.keys(expected).some(k=>object.metadata[k]!==expected[k]))throw Object.assign(Error('receipt_unavailable'),{receiptInvalid:true});
  await decodeImage(object.bytes,mimeType);
  return Object.freeze({descriptor:canonicalReceipt({receiptId,sha256,mimeType,sizeBytes:object.bytes.length,storageReference:paths.storageReference}),requestId,actor:bound.actor,generation:object.generation});
 }
 return Object.freeze({
  async upload({requestId,receiptId,actor,bytes,mimeType}) {
   guard();const bound=binding(requestId,receiptId,actor),paths=generatedReceiptPaths({requestId,receiptId,mimeType},mapping);
   if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>5242880)throw Error('invalid_receipt');
   bytes=Buffer.from(bytes);
   await decodeImage(bytes,mimeType);
   const metadata={pwaReceiptVersion:'1',environment,requestId,receiptId,actorSha256:bound.actorSha256,sha256:hash(bytes),contentType:mimeType,sizeBytes:String(bytes.length)};
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
