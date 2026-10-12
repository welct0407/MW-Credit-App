import { createHash } from 'node:crypto';
import { DEV_RECEIPT_MAPPING } from './dev-receipt-adapter.mjs';
import { verifiedNativeDev } from './verified-native-dev.mjs';

export const NATIVE_DEV_ROOT=DEV_RECEIPT_MAPPING.objectPrefix.slice(0,-4);
const hash=value=>createHash('sha256').update(value).digest('hex');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fields='generation,key,keySha256,mimeType,referenceSha256,sha256,sizeBytes';
const invalid=()=>{throw Error('Invalid DEV native receipt catalog');};
export function parseNativeDevCatalog(raw,{legacy=verifiedNativeDev}={}) {
  if(raw===undefined)return legacy;
  try {
    if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)invalid();
    const catalog=JSON.parse(raw);
    if(!catalog||Object.keys(catalog).sort().join(',')!=='bucket,entries,environment,objectRoot,schemaVersion'
      ||catalog.schemaVersion!==1||catalog.environment!=='dev'||catalog.bucket!==DEV_RECEIPT_MAPPING.bucket
      ||catalog.objectRoot!==NATIVE_DEV_ROOT||!Array.isArray(catalog.entries)||catalog.entries.length>256)invalid();
    const refs=new Set(),keys=new Set();
    const entries=catalog.entries.map(row=>{
      if(!row||Object.keys(row).sort().join(',')!==fields||!hex(row.referenceSha256)||!hex(row.keySha256)||!hex(row.sha256)
        ||typeof row.key!=='string'||Buffer.byteLength(row.key)>1024||!row.key.startsWith(NATIVE_DEV_ROOT)
        ||row.key.startsWith(DEV_RECEIPT_MAPPING.objectPrefix)||/[\\\u0000-\u001f\u007f]/u.test(row.key)
        ||row.key.slice(NATIVE_DEV_ROOT.length).split('/').some(part=>!part||part==='.'||part==='..')
        ||hash(row.key)!==row.keySha256||typeof row.generation!=='string'||!(/^[1-9][0-9]{0,29}$/).test(row.generation)
        ||!['image/png','image/jpeg','image/webp'].includes(row.mimeType)||!Number.isSafeInteger(row.sizeBytes)
        ||row.sizeBytes<1||row.sizeBytes>5242880||refs.has(row.referenceSha256)||keys.has(row.keySha256))invalid();
      const prior=legacy.find(pin=>pin.referenceSha256===row.referenceSha256||pin.keySha256===row.keySha256);
      if(prior&&['referenceSha256','keySha256','generation','mimeType','sizeBytes','sha256'].some(field=>prior[field]!==row[field]))invalid();
      refs.add(row.referenceSha256);keys.add(row.keySha256);return Object.freeze({...row});
    });
    return Object.freeze([...legacy.filter(row=>!refs.has(row.referenceSha256)),...entries]);
  } catch { invalid(); }
}
