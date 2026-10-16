import test from 'node:test';import assert from 'node:assert/strict';
import {createConversationReadProvider} from '../../services/agent-conversations/read-provider.mjs';
import {createConversationCommandProvider} from '../../services/agent-conversations/command-provider.mjs';
// APP-PAY-03: machine conversation transactions run on the command pool (9 s client query timeout),
// so they use the 8 s command statement budget and 3 s lock budget, never 10 s.
const context={workload:{issuer:'https://accounts.google.com',subject:'123'}};
test('conversation read provider sets the command statement and lock budget',async()=>{
 const calls=[];const client={async query(sql){calls.push(sql);
  if(sql.includes('AS reviewer'))return {rows:[{id:'p',email:'p@example.invalid',enabled:true,reviewer:false,matches:1}]};
  if(sql.includes('AS "businessDate"'))return {rows:[{businessDate:'2026-10-12',now:'2026-10-12T01:00:00Z'}]};
  return {rows:[]};},release(){}};
 const provider=createConversationReadProvider({pool:{async connect(){return client;}},guardConnection:async()=>{},policy:{readPartnerIds:['p'],reviewerPartnerIds:[]},
  catalogue:{resources:[{scope:'oltp',resource:'Synthetic',fields:[]}]},resources:{oltp:{}}});
 await provider.catalogue(context,{actorPartnerId:'p',scope:'oltp',resource:'Synthetic'});
 assert.ok(calls.includes("SET LOCAL statement_timeout='8000ms'"),calls.join('|'));assert.ok(calls.includes("SET LOCAL lock_timeout='3000ms'"));
 assert.equal(calls.some(sql=>sql.includes("'10000ms'")),false);
});
test('conversation command status sets the command statement budget',async()=>{
 const calls=[];const client={async query(sql){calls.push(sql);if(sql.startsWith('SELECT canonical_json'))return {rows:[]};return {rows:[]};},release(){}};
 const provider=createConversationCommandProvider({pool:{connect:async()=>client},guardConnection:async()=>{},policy:{readPartnerIds:[],reviewerPartnerIds:[]}});
 await provider.status(context,'00000000-0000-4000-8000-000000000000');
 assert.ok(calls.includes("SET LOCAL statement_timeout='8000ms'"),calls.join('|'));assert.equal(calls.some(sql=>sql.includes("'10000ms'")),false);
});
