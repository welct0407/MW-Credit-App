import test from 'node:test';import assert from 'node:assert/strict';
import {createConversationReadProvider} from '../../services/agent-conversations/read-provider.mjs';
// APP-PAY-03: native read transactions (the chat's read tools; R091 retired the agent command provider) run on the command pool (9 s client query timeout),
// so they use the 8 s command statement budget and 3 s lock budget, never 10 s.
const context={workload:{issuer:'https://accounts.google.com',subject:'123'}};
test('conversation read provider sets the command statement and lock budget',async()=>{
 const calls=[];const client={async query(sql){calls.push(sql);
  if(sql.includes('AS "businessDate"'))return {rows:[{businessDate:'2026-10-12',now:'2026-10-12T01:00:00Z'}]};
  return {rows:[]};},release(){}};
 const provider=createConversationReadProvider({pool:{async connect(){return client;}},guardConnection:async()=>{},policy:null,
  catalogue:{resources:[{scope:'oltp',resource:'Synthetic',fields:[]}]},resources:{oltp:{}},resolveActor:async(_c,_p,_w,partnerId)=>({issuer:'x',subject:'y',partnerId,loginEmail:'p@example.invalid'})});
 await provider.catalogue(context,{actorPartnerId:'p',scope:'oltp',resource:'Synthetic'});
 assert.ok(calls.includes("SET LOCAL statement_timeout='8000ms'"),calls.join('|'));assert.ok(calls.includes("SET LOCAL lock_timeout='3000ms'"));assert.ok(calls.includes('SET LOCAL jit=off'),'reads skip JIT compilation');
 assert.equal(calls.some(sql=>sql.includes("'10000ms'")),false);
});
