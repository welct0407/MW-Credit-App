import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {disposablePool} from './disposable-pool.mjs';
import {seedPaymentFixture} from './payment-fixture.mjs';
import {createPaymentRehearsal} from './payment-command.mjs';
const pool=await disposablePool();await seedPaymentFixture(pool,'4A-UI');
const provider=createPaymentRehearsal({pool});let origin;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value))};
 if(req.headers.host!==new URL(origin).host || (req.headers.origin && req.headers.origin!==origin))return send(403,{error:'local_only'});
 try {
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&['/','/app.js','/style.css'].includes(url.pathname)){
   const file=url.pathname==='/'?'index.html':url.pathname.slice(1);res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css');res.end(await readFile(new URL('../../apps/payment-rehearsal/'+file,import.meta.url)));return;
  }
  if(req.method==='GET'&&url.pathname==='/fixture'){
   const charges=await pool.query('SELECT "Row ID" AS id,"Charge Date"::text AS date,"Amount Remaining"::text AS amount FROM "Charges" WHERE "Row ID"=ANY($1) ORDER BY "Row ID"', [['4A-UI-C1','4A-UI-C2']]);
   const accounts=await pool.query('SELECT a."Row ID" AS id,a."Account Label" AS label FROM "Cash Accounts" a JOIN "Cash Holders" h ON a."Ref Cash Holder"=h."Row ID" WHERE a."Row ID"=\'4A-RECEIVE\' AND a."Active" AND h."Active"');
   return send(200,{businessDate:await provider.businessDate(),borrowerId:'4A-UI-B',charges:charges.rows,accounts:accounts.rows});
  }
  if(req.method==='GET'&&url.pathname==='/status')return send(200,await provider.status(url.searchParams.get('id')));
  if(req.method==='POST'&&url.pathname==='/confirm'&&req.headers.origin===origin&&req.headers['content-type']==='application/json'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>16384)return send(413,{status:'rejected',code:'invalid_request'})}
   const result=await provider.submit(JSON.parse(body));
   if(req.headers['x-rehearsal-scenario']==='lose-response'&&result.status==='posted'){res.destroy();return}
   return send(200,result);
  }
  send(404,{error:'not_found'});
 }catch{send(400,{status:'rejected',code:'invalid_request'})}
});
server.listen(0,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;console.log('LOCAL SYNTHETIC REHEARSAL '+origin)});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0)}));