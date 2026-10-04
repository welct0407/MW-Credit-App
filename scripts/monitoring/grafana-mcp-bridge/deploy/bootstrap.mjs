// Inert domain/TLS bootstrap: no OAuth, credentials, Firestore, event ingestion or delivery.
import {createServer} from 'node:http';
export const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Type','application/json');
  const health=req.method==='GET' && req.url==='/health';
  res.writeHead(health?200:503);
  res.end(JSON.stringify({status:health?'bootstrap':'inactive'}));
});
if (process.argv[1] && import.meta.url===new URL('file:'+process.argv[1]).href) server.listen(Number(process.env.PORT ?? 8080),'0.0.0.0');
