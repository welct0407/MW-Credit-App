import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {createAgentReceiptHandler,loadAgentReceiptPolicy} from '../../services/agent-receipts/runtime.mjs';
test('actual machine HTTP authority negatives and disabled route have zero SQL and no human-route bypass',async()=>{
 const project='clever-oasis-508610-n7',policy=loadAgentReceiptPolicy({AGENT_RECEIPT_API_ENABLED:'true',AGENT_RECEIPT_POLICY_SECRET_VERSION:`projects/${project}/secrets/mw-credit-app-dev-agent-receipt-policy/versions/1`,AGENT_RECEIPT_POLICY_JSON:JSON.stringify({environment:'dev',audience:'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app',callerEmail:`synthetic-agent@${project}.iam.gserviceaccount.com`,callerSubject:'737787224638',automaticPartnerId:'synthetic-auto',reviewerPartnerIds:['synthetic-reviewer'],evidenceSha256:'a'.repeat(64)})},'dev');
 const good={aud:policy.audience,iss:'https://accounts.google.com',email:policy.callerEmail,sub:policy.callerSubject,email_verified:true,exp:Date.now()/1000+60,iat:Date.now()/1000};let claims=good,auth=0,sql=0;
 const dependencies={pool:{connect(){sql++;throw Error('unexpected SQL');}},guardConnection:async()=>{},verifyOidc:async token=>{auth++;if(token!=='synthetic')throw Error('invalid token');return claims;},next:(_req,res)=>{res.writeHead(401);res.end('human-gate');}};
 let handler=createAgentReceiptHandler({...dependencies,policy});const server=createServer((req,res)=>void handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const call=(path='/internal/agent/receipt-payments',method='POST')=>fetch(origin+path,{method,headers:{authorization:'Bearer synthetic'},...(method==='POST'?{body:'{}'}:{})});
 try{
  for(const patch of [{aud:policy.audience.replace('-dev-','-prod-')},{iss:'https://securetoken.google.com/'+project},{email:'human@example.invalid'},{sub:'999'},{email_verified:false},{exp:Date.now()/1000-1},{iat:Date.now()/1000+120}]){claims={...good,...patch};assert.equal((await call()).status,401);assert.equal(sql,0);}
  claims=good;assert.equal((await call()).status,400);assert.equal(sql,0);const count=auth;
  for(const [path,method]of [['/internal/agent/receipt-payments/arbitrary','POST'],['/internal/agent/receipt-payments?sql=SELECT','POST'],['/internal/agent/receipt-payments','GET']])assert.equal((await call(path,method)).status,404);
  assert.equal((await call('/api/operations')).status,401);assert.equal(auth,count);assert.equal(sql,0);
  handler=createAgentReceiptHandler({...dependencies,policy:null});assert.equal((await call()).status,404);assert.equal(auth,count);assert.equal(sql,0);
 }finally{await new Promise(r=>server.close(r));}
});
