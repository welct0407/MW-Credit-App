import {createServer,type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';

/** Test-only loopback delivery for the real generated worker. Never shipped. */
export async function startWorkerFixture(root:string) {
 let workerOverride:string|null=null;let version='A';let failAsset:string|null=null;let rootStatus=200;
 const requests:{path:string;method:string;authorization:boolean}[]=[];
 const server:Server=createServer(async(req,res)=>{
  const url=new URL(req.url!,'http://127.0.0.1');
  requests.push({path:url.pathname+url.search,method:req.method!,authorization:!!req.headers.authorization});
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/'){
   res.writeHead(rootStatus,{'Content-Type':'text/html'});
   res.end('<!doctype html><title>Synthetic worker harness</title><main>Synthetic online page</main>');return;
  }
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/__/auth/')){
   res.writeHead(401,{'Content-Type':'application/json'});res.end('{"ok":false,"code":"synthetic_denied"}');return;
  }
  if(url.pathname===failAsset){res.writeHead(503);res.end('synthetic asset failure');return;}
  const path=resolve(root,'.'+url.pathname);if(!path.startsWith(resolve(root)+sep)){res.writeHead(404);res.end();return;}
  try{
   let body=await readFile(path);
   if(url.pathname==='/sw.js')body=Buffer.from(workerOverride??body.toString().replaceAll('__BUILD_VERSION__',version));
   const ext=path.split('.').at(-1);const mime=ext==='js'?'text/javascript':ext==='html'?'text/html':ext==='png'?'image/png':ext==='webmanifest'?'application/manifest+json':'application/octet-stream';
   res.writeHead(200,{'Content-Type':mime});res.end(body);
  }catch{res.writeHead(404);res.end('missing fixture asset');}
 });
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const address=server.address();if(!address||typeof address==='string')throw Error('No loopback fixture address');
 return {setWorkerOverride:(source:string)=>{workerOverride=source},base:`http://127.0.0.1:${address.port}`,requests,setVersion:(v:string)=>{version=v},setFailedAsset:(v:string|null)=>{failAsset=v},setRootStatus:(v:number)=>{rootStatus=v},close:()=>new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()))};
}

