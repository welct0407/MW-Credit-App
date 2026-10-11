import { DEV_RECEIPT_MAPPING } from './dev-receipt-adapter.mjs';
const gen = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
/** Only exact generated DEV keys; no listing, deletion, overwrite or public URLs. */
export function createGcsReceiptTransport(storage) {
  function file(bucket, key, generation) {
    if (bucket !== DEV_RECEIPT_MAPPING.bucket || typeof key !== 'string'
      || !new RegExp('^'+DEV_RECEIPT_MAPPING.objectPrefix+'[a-f0-9]{32}/[a-f0-9]{32}\\.(png|jpg)$').test(key)
      || (generation !== undefined && !gen(generation))) throw Error('Invalid receipt object');
    return storage.bucket(bucket).file(key, generation ? {generation} : {});
  }
  return {
    async create({bucket,key,bytes,mimeType,metadata,ifGenerationMatch}) {
      if (ifGenerationMatch !== 0 || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5242880) throw Error('Invalid receipt create');
      const target = file(bucket,key);
      await target.save(bytes,{resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:mimeType,cacheControl:'no-store',metadata}});
      const [result] = await target.getMetadata();
      if (!gen(result.generation)) throw Error('Invalid receipt generation');
      return {generation:result.generation};
    },
    async read({bucket,key,generation}) {
      try {
        const [metadata] = await file(bucket,key,generation).getMetadata();
        if (!gen(metadata.generation) || !/^[0-9]+$/.test(String(metadata.size))
          || BigInt(metadata.size) < 1n || BigInt(metadata.size) > 5242880n) throw Error('Invalid receipt metadata');
        const [bytes] = await file(bucket,key,metadata.generation).download({validation:'crc32c'});
        return {bytes,mimeType:metadata.contentType,metadata:metadata.metadata,generation:metadata.generation};
      } catch (error) {
        if (error?.code === 404) throw Object.assign(Error('Receipt not found'),{code:'OBJECT_NOT_FOUND'});
        throw Error('receipt_unavailable');
      }
    },
  };
}
