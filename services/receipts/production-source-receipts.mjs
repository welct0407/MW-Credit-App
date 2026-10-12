import {createHash} from 'node:crypto';
import {PROD_RECEIPT_MAPPING} from './dev-receipt-adapter.mjs';
import {createProductionNativeReceiptReader} from './production-native-catalog.mjs';
import {createProductionGcsReceiptTransport} from './gcs-transport.mjs';
import {createProductionAgentReceiptReader} from './production-agent-receipts.mjs';
export function createProductionSourceReceiptReader({catalog,storage,decodeImage}){
 const native=createProductionNativeReceiptReader({catalog,storage,decodeImage}),generated=createProductionGcsReceiptTransport(storage);
 const agent=createProductionAgentReceiptReader({storage,decodeImage});
 return async(reference,kind,projection)=>{
  if(kind==='agent')return agent(reference,projection);
  const match=kind==='manual'&&typeof reference==='string'?/^manual-receipts\/prod\/pwa\/([a-f0-9]{32})\/([a-f0-9]{32})\.(png|jpg)$/.exec(reference):null;
  if(!match)return native(reference,kind);
  const key=PROD_RECEIPT_MAPPING.objectPrefix+match[1]+'/'+match[2]+'.'+match[3],mimeType=match[3]==='png'?'image/png':'image/jpeg';
  const object=await generated.read({bucket:PROD_RECEIPT_MAPPING.bucket,key});
  if(object.mimeType!==mimeType||!Buffer.isBuffer(object.bytes)||object.metadata?.environment!=='prod'||object.metadata?.sha256!==createHash('sha256').update(object.bytes).digest('hex'))throw Error('receipt_unavailable');
  await decodeImage(object.bytes,mimeType);return{bytes:object.bytes,mimeType};
 };
}
