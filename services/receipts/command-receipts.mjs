import {createHash} from 'node:crypto';
import {createDevReceiptAdapter,generatedReceiptPaths} from './dev-receipt-adapter.mjs';
export function createCommandReceipts({storage,decodeImage,compatibility}) {
 const adapter=createDevReceiptAdapter({storage,decodeImage,compatibility});
 const publicReceipt=value=>({receiptId:value.descriptor.receiptId,mimeType:value.descriptor.mimeType,sizeBytes:value.descriptor.sizeBytes,sha256:value.descriptor.sha256,generation:value.generation});
 return {
  resolveReceipt:adapter.resolveReceipt,
  async upload(input) {
   const bytes=Buffer.from(input.bytes), sha256=createHash('sha256').update(bytes).digest('hex');
   try { return {receipt:publicReceipt(await adapter.upload({...input,bytes}))}; }
   catch {
    // Exact-key read reconciles an acknowledged collision or lost create acknowledgement.
    // It never retries create, overwrites, or changes the receipt identity.
    const retained=await adapter.resolve({...input,bytes:undefined});
    if(retained.descriptor.sha256!==sha256 || retained.descriptor.sizeBytes!==bytes.length)throw Error('receipt_conflict');
    return {receipt:publicReceipt(retained)};
   }
  },
  async retrieve(input) {
   const bound=await adapter.resolveReceipt(input);
   const verified=await adapter.resolve({...input,mimeType:bound.descriptor.mimeType});
   const paths=generatedReceiptPaths({...input,mimeType:bound.descriptor.mimeType});
   const object=await storage.read({bucket:paths.bucket,key:paths.key,generation:verified.generation});
   if(createHash('sha256').update(object.bytes).digest('hex')!==verified.descriptor.sha256)throw Error('receipt_unavailable');
   return {bytes:object.bytes,mimeType:verified.descriptor.mimeType};
  },
 };
}
