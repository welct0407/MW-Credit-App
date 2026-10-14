import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {notificationHandler} from '../../services/notifications/handler.mjs';
import {readDeltaRequest} from '../../services/api/offline-dataset-delta.mjs';

async function fixture(offlineDataset=true){
 const calls=[];
 const server=createServer(notificationHandler({enabled:true,offlineDataset,origins:['https://dev.example.invalid'],verifyPrincipal:async header=>({ok:header==='Bearer owner',subject:'owner'}),next:(_req,res)=>{res.statusCode=404;res.end('{}')},store:{offlineDataset:async(principal,_signal,options)=>{calls.push({principal,options});if(options.protocol===3)readDeltaRequest(options.input);return{ok:true,schemaVersion:options.protocol}}}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {calls,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('notification delta POST authenticates and validates bounded read-only request while retaining legacy GET',async()=>{
 const f=await fixture();try{
  const request=(suffix='',body={cursor:null,need:[]},authorization='Bearer owner')=>fetch(f.url+'/api/notifications/offline-dataset?protocol=3'+suffix,{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const denied=await request('',{},'Bearer other');assert.equal(denied.status,401);assert.equal(f.calls.length,0);
  const duplicate=await request('&protocol=3');assert.equal(duplicate.status,400);assert.equal(f.calls.length,0);
  const accepted=await request();assert.equal(accepted.status,200);assert.equal(accepted.headers.get('cache-control'),'no-store');assert.deepEqual(f.calls[0].options,{protocol:3,input:{cursor:null,need:[]}});
  assert.equal((await request('',{cursor:null,need:[],sql:'SELECT secrets'})).status,400);
  assert.equal((await request('',{need:['bad-hash']})).status,400);
  assert.equal((await fetch(f.url+'/api/notifications/offline-dataset?protocol=3',{headers:{Authorization:'Bearer owner'}})).status,400);
  const legacy=await fetch(f.url+'/api/notifications/offline-dataset?protocol=2',{headers:{Authorization:'Bearer owner'}});assert.equal(legacy.status,200);assert.equal((await legacy.json()).schemaVersion,2);
 }finally{await f.close()}
});
test('notification delta route stays disabled outside its DEV feature gate',async()=>{
 const f=await fixture(false);try{const response=await fetch(f.url+'/api/notifications/offline-dataset?protocol=3',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:'{"cursor":null,"need":[]}'});assert.equal(response.status,404);assert.equal(f.calls.length,0)}finally{await f.close()}
});
