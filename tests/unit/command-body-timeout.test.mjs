import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {createPaymentCommandHandler} from '../../services/payment-command/handler.mjs';
// APP-PAY-01: a body that stalls on a slow uplink is a retryable 503 body_timeout, never a permanent 400.
const requestId='12345678-1234-4234-8234-123456789abc',receiptId='12345678-1234-4234-8234-123456789abd';
async function fixture(){
 let calls=0;const logs=[];
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],verifyPrincipal:async()=>({ok:true,subject:'synthetic',email:'synthetic@example.invalid'}),store:{receipt:async()=>{calls++;return {ok:true,status:200,receipt:{}}},submit:async()=>{calls++;return {ok:true,status:200,kind:'unresolved'}}},bodyTimeoutMs:{json:150,raw:150},completionLogger:record=>logs.push(record)});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {port:server.address().port,logs,calls:()=>calls,close:()=>new Promise(resolve=>server.close(resolve))};
}
function partial(port,head,chunk){
 return new Promise((resolve,reject)=>{
  const socket=connect(port,'127.0.0.1');let raw='';
  socket.on('connect',()=>{socket.write(head);socket.write(chunk)});
  // The request body is deliberately never completed, so resolve as soon as the response JSON is whole.
  const complete=()=>{const body=raw.split('\r\n\r\n')[1];if(body===undefined)return false;try{JSON.parse(body);return true}catch{return false}};
  socket.on('data',data=>{raw+=data;if(complete()){resolve(raw);socket.destroy()}});socket.on('end',()=>resolve(raw));socket.on('close',()=>resolve(raw));socket.on('error',reject);
  setTimeout(()=>socket.destroy(),7000).unref();
 });
}
const parse=raw=>{const [head,body]=raw.split('\r\n\r\n');return {status:Number(head.split(' ')[1]),body:JSON.parse(body)}};
test('stalled receipt upload returns 503 body_timeout before any store call',async()=>{
 const f=await fixture();
 try{
  const response=parse(await partial(f.port,`POST /api/payment-commands/${requestId}/receipts/${receiptId} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nAuthorization: Bearer synthetic\r\nContent-Type: image/jpeg\r\nX-Borrower-ID: synthetic-borrower\r\nContent-Length: 100000\r\n\r\n`,Buffer.alloc(1000,1)));
  assert.equal(response.status,503);assert.deepEqual(response.body,{ok:false,code:'body_timeout'});assert.equal(f.calls(),0);
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.logs.at(-1).code,'body_timeout');assert.equal(f.logs.at(-1).status,503);
 }finally{await f.close()}
});
test('stalled JSON command returns 503 body_timeout before any store call',async()=>{
 const f=await fixture();
 try{
  const response=parse(await partial(f.port,`POST /api/payment-commands HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nAuthorization: Bearer synthetic\r\nContent-Type: application/json\r\nContent-Length: 2000\r\n\r\n`,'{"schemaVersion":6,"requestId":"'));
  assert.equal(response.status,503);assert.deepEqual(response.body,{ok:false,code:'body_timeout'});assert.equal(f.calls(),0);
 }finally{await f.close()}
});
test('complete bodies still reach the store and oversize raw bodies stay 413',async()=>{
 const f=await fixture();
 try{
  const origin='http://127.0.0.1:'+f.port,headers={Authorization:'Bearer synthetic'};
  const upload=await fetch(origin+`/api/payment-commands/${requestId}/receipts/${receiptId}`,{method:'POST',headers:{...headers,'Content-Type':'image/jpeg','X-Borrower-ID':'synthetic-borrower'},body:Buffer.alloc(64,1)});
  assert.equal(upload.status,200);assert.equal(f.calls(),1);
  const oversize=await fetch(origin+`/api/payment-commands/${requestId}/receipts/${receiptId}`,{method:'POST',headers:{...headers,'Content-Type':'image/jpeg','X-Borrower-ID':'synthetic-borrower'},body:Buffer.alloc(5242881,1)});
  assert.equal(oversize.status,413);assert.deepEqual(await oversize.json(),{ok:false,code:'body_too_large'});assert.equal(f.calls(),1);
  const malformed=await fetch(origin+'/api/payment-commands',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{'});
  assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{ok:false,code:'invalid_request'});
 }finally{await f.close()}
});
