import { execFile } from 'node:child_process';
export async function decodeReceiptImage(bytes,mimeType,{pythonExecutable=process.env.CLOUDSDK_PYTHON}={}) {
 if(!pythonExecutable||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>5242880||!['image/png','image/jpeg'].includes(mimeType))throw Error('invalid_receipt');
 if(mimeType==='image/png'?!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('invalid_receipt');
 const script="import sys,io,warnings\nfrom PIL import Image\nwarnings.simplefilter('error', Image.DecompressionBombWarning)\nImage.MAX_IMAGE_PIXELS=20000000\nb=sys.stdin.buffer.read(5242881)\ni=Image.open(io.BytesIO(b))\nassert i.format==sys.argv[1] and i.width*i.height<=20000000\ni.verify()\ni=Image.open(io.BytesIO(b)); i.load()\n";
 await new Promise((resolve,reject)=>{const child=execFile(pythonExecutable,['-c',script,mimeType==='image/png'?'PNG':'JPEG'],{timeout:10000,maxBuffer:1024,windowsHide:true},error=>error?reject(Error('invalid_receipt')):resolve());child.stdin.on('error',()=>{});child.stdin.end(bytes)});
}
