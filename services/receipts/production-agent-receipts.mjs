import {createHash} from 'node:crypto';
import {PROD_RECEIPT_MAPPING} from './dev-receipt-adapter.mjs';

const unavailable=()=>{throw Error('receipt_unavailable')};
/** Only server-read Payment projection fields confer this locator; no journal access. */
export function productionAgentReceiptPath(reference,projection){
 const match=typeof reference==='string'&&/^\/\/receipts\/prod\/(\d{4})\/(\d{2})\/(\d{2})\/([a-f0-9]{64})\/([a-f0-9]{64})\.(jpg|png|webp)$/.exec(reference);
 if(!match)throw Error('receipt_reference_unsupported');
 const day=`${match[1]}-${match[2]}-${match[3]}`,date=new Date(day+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day||projection?.agentReceiptId!==match[4])unavailable();
 const received=projection?.agentReceivedAt;
 // PostgreSQL timestamp text is deliberately read without JS/local-time conversion.
 if(typeof received!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(received))unavailable();
 const stamp=new Date(received.replace(' ','T')+'Z');
 if(!Number.isFinite(stamp.getTime())||stamp.toISOString().slice(0,10)!==received.slice(0,10))unavailable();
 return {bucket:PROD_RECEIPT_MAPPING.bucket,key:reference.slice(2),mimeType:match[6]==='jpg'?'image/jpeg':`image/${match[6]}`,sha256:match[5]};
}

export function createProductionAgentReceiptReader({storage,decodeImage}){
 return async(reference,projection)=>{
  const path=productionAgentReceiptPath(reference,projection);
  const [meta]=await storage.bucket(path.bucket).file(path.key).getMetadata();
  if(typeof meta.generation!=='string'||!(/^[1-9][0-9]{0,29}$/).test(meta.generation)||!(/^\d+$/).test(String(meta.size))||BigInt(meta.size)<1n||BigInt(meta.size)>5242880n||meta.contentType!==path.mimeType)unavailable();
  // Resolve once, then pin download: replacement of the latest object cannot switch bytes.
  const [bytes]=await storage.bucket(path.bucket).file(path.key,{generation:meta.generation}).download({validation:'crc32c'});
  if(!Buffer.isBuffer(bytes)||bytes.length!==Number(meta.size)||createHash('sha256').update(bytes).digest('hex')!==path.sha256)unavailable();
  await decodeImage(bytes,path.mimeType);
  return {bytes,mimeType:path.mimeType};
 };
}
