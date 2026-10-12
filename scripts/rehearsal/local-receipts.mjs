import { mkdir, realpath, lstat, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
export const receiptUuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const MAX_RECEIPT_BYTES=5*1024*1024;
export async function createLocalReceipts({dataDirectory,pythonExecutable=process.env.CLOUDSDK_PYTHON}) {
 const data=await realpath(dataDirectory); const parent=dirname(data);
 if(!/mw-payment-rehearsal-[0-9a-f]{32}$/i.test(parent)||!/[\\/]data$/i.test(data)||!pythonExecutable)throw Error('receipt_storage_unavailable');
 const root=join(parent,'receipts');await mkdir(root,{recursive:true});
 if((await lstat(root)).isSymbolicLink()||await realpath(root)!==root)throw Error('receipt_storage_unavailable');
 const records=new Map();
 async function safePath(id,ext){const path=resolve(root,id+'.'+ext);if(!path.startsWith(root+sep)||await realpath(root)!==root)throw Error('receipt_storage_unavailable');return path;}
 function lookup(id,{requestId,actor}){const record=records.get(id);if(!receiptUuid(id)||!record||record.requestId!==requestId||record.actor!==actor)throw Error('receipt_unavailable');return record;}
 return {
  async upload({bytes,mime,requestId,actor}) {
   if(!receiptUuid(requestId)||typeof actor!=='string'||!actor||!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>MAX_RECEIPT_BYTES)throw Error('invalid_receipt');
   const ext=mime==='image/png'?'png':mime==='image/jpeg'?'jpg':null;
   if(!ext||(ext==='png'?!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)))throw Error('invalid_receipt');
   // Pillow decodes stdin before any file is stored; no client path or filename is used.
   const script="import sys,io,warnings\nfrom PIL import Image\nwarnings.simplefilter('error', Image.DecompressionBombWarning)\nImage.MAX_IMAGE_PIXELS=20000000\nb=sys.stdin.buffer.read(5242881)\ni=Image.open(io.BytesIO(b))\nassert i.format==sys.argv[1] and i.width*i.height<=20000000\ni.verify()\ni=Image.open(io.BytesIO(b)); i.load()\n";
   await new Promise((ok,no)=>{const child=execFile(pythonExecutable,['-c',script,ext==='png'?'PNG':'JPEG'],{timeout:10000,maxBuffer:1024,windowsHide:true},error=>error?no(Error('invalid_receipt')):ok());child.stdin.on('error',()=>{});child.stdin.end(bytes)});
   const id=randomUUID();const descriptor=Object.freeze({receiptId:id,sha256:createHash('sha256').update(bytes).digest('hex'),mime,size:bytes.length,reference:`local-rehearsal/${id}.${ext}`,requestId,actor});
   await writeFile(await safePath(id,ext),bytes,{flag:'wx'});records.set(id,descriptor);return descriptor;
  },
  resolve(id,scope){return lookup(id,scope)},
  async retrieve(id,scope){const descriptor=lookup(id,scope);const bytes=await readFile(await safePath(id,descriptor.mime==='image/png'?'png':'jpg'));if(createHash('sha256').update(bytes).digest('hex')!==descriptor.sha256)throw Error('receipt_unavailable');return {descriptor,bytes};}
 };
}
