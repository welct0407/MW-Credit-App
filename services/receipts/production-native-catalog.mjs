import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const invalid=()=>{throw Error('Invalid production native receipt catalog')};
/** The binding is separately reviewed current PROD source evidence, never catalog self-approval. */
export function parseNativeProductionCatalog(raw,binding){
 try{
  if(!binding||binding.environment!=='prod'||binding.database!=='loan_manager_prod'||binding.bucket!=='mw-payment-receipts-prod-508610-n7'||!hex(binding.sourceEvidenceSha256)||binding.objectRoot!=='appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/'||!binding.objectRoot.endsWith('/')||binding.objectRoot.includes('MW_OLTP_DEV')||binding.objectRoot.includes('/dev/')||/[\\\u0000-\u001f]/.test(binding.objectRoot)||binding.objectRoot.split('/').slice(0,-1).some(v=>!v||v==='.'||v==='..'))invalid();
  if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)invalid();const c=JSON.parse(raw);
  if(!c||Object.keys(c).sort().join(',')!=='bucket,database,entries,environment,objectRoot,schemaVersion,sourceEvidenceSha256'||c.schemaVersion!==1||['environment','database','bucket','objectRoot','sourceEvidenceSha256'].some(k=>c[k]!==binding[k])||!Array.isArray(c.entries)||c.entries.length>256)invalid();
  const refs=new Set(),keys=new Set();
  const entries=c.entries.map(r=>{if(!r||Object.keys(r).sort().join(',')!=='generation,key,keySha256,mimeType,referenceSha256,sha256,sizeBytes'||![r.referenceSha256,r.keySha256,r.sha256].every(hex)||typeof r.key!=='string'||Buffer.byteLength(r.key)>1024||!r.key.startsWith(c.objectRoot)||r.key.slice(c.objectRoot.length).split('/').some(v=>!v||v==='.'||v==='..')||/[\\\u0000-\u001f\u007f]/.test(r.key)||hash(r.key)!==r.keySha256||!(/^[1-9][0-9]{0,29}$/).test(r.generation)||typeof r.generation!=='string'||!['image/png','image/jpeg','image/webp'].includes(r.mimeType)||!Number.isSafeInteger(r.sizeBytes)||r.sizeBytes<1||r.sizeBytes>5242880||refs.has(r.referenceSha256)||keys.has(r.keySha256))invalid();refs.add(r.referenceSha256);keys.add(r.keySha256);return Object.freeze({...r});});
  return Object.freeze({...c,entries:Object.freeze(entries)});
 }catch{invalid()}
}
export function createProductionNativeReceiptReader({catalog,storage,decodeImage}){
 if(catalog?.environment!=='prod'||catalog.database!=='loan_manager_prod'||typeof storage?.bucket!=='function'||typeof decodeImage!=='function')invalid();
 return async(reference,kind)=>{
  if(kind!=='manual'||typeof reference!=='string')throw Error('receipt_reference_unsupported');
  const row=catalog.entries.find(r=>r.referenceSha256===hash(reference));if(!row)throw Error('receipt_reference_unsupported');
  const file=storage.bucket(catalog.bucket).file(row.key,{generation:row.generation}),[meta]=await file.getMetadata();
  if(meta.generation!==row.generation||String(meta.size)!==String(row.sizeBytes)||meta.contentType!==row.mimeType)throw Error('receipt_unavailable');
  const [bytes]=await file.download({validation:'crc32c'});if(!Buffer.isBuffer(bytes)||bytes.length!==row.sizeBytes||hash(bytes)!==row.sha256)throw Error('receipt_unavailable');
  await decodeImage(bytes,row.mimeType);return{bytes,mimeType:row.mimeType};
 };
}
