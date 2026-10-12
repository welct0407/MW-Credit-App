import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {createAgentConversationHandler} from '../../services/agent-conversations/handler.mjs';
test('machine facade isolates exact routes/auth and never dispatches malformed query or command',async()=>{
 const policy={audience:'https://command.invalid',callerEmail:'agent@example.invalid',callerSubject:'123'};
 const calls=[];let valid=true;
 const providers=Object.fromEntries(['catalogue','query','commands','status'].map(name=>[name,async(context,input)=>{calls.push({name,context,input});return{status:200,value:{kind:'fixture'}};}]));
 const handler=createAgentConversationHandler({next:(req,res)=>{res.writeHead(404);res.end('next');},policy,providers,
  verifyOidc:async()=>({aud:policy.audience,iss:'https://accounts.google.com',email:valid?policy.callerEmail:'wrong',sub:policy.callerSubject,email_verified:true,iat:Date.now()/1000,exp:Date.now()/1000+60})});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const body={version:1,actorPartnerId:'actor',scope:'oltp',resource:'Loans',columns:['Row ID'],predicate:null,limit:1001};
 const post=(path,value)=>fetch(origin+path,{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(value)});
 try{
  valid=false;assert.equal((await post('/internal/agent/query',body)).status,401);assert.equal(calls.length,0);valid=true;
  assert.equal((await post('/internal/agent/query',body)).status,200);assert.equal(calls.length,1);assert.equal(calls[0].context.workload.subject,'123');
  for(const patch of [{limit:1002},{scope:'prod'},{columns:[]},{extra:true}])assert.equal((await post('/internal/agent/query',{...body,...patch})).status,400);
  assert.equal((await post('/internal/agent/commands',{version:1,actorPartnerId:'actor',kind:'sql',command:{}})).status,400);
  assert.equal((await post('/internal/agent/receipt-payments',{})).status,404);
  assert.equal(calls.length,1);
  assert.equal((await fetch(origin+'/internal/agent/commands/11111111-1111-4111-8111-111111111111',{headers:{Authorization:'Bearer synthetic'}})).status,200);
  assert.equal(calls.at(-1).name,'status');assert.equal(calls.length,2);
 }finally{await new Promise(r=>server.close(r));}
});
