import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationCommandProvider} from '../../services/agent-conversations/command-provider.mjs';

test('conversation command facade rejects identity management, broad analytics and receipt mutation before SQL',async()=>{
 const provider=createConversationCommandProvider({pool:{connect(){throw Error('SQL must not run');}},guardConnection:async()=>{},policy:{}});
 const context={workload:{issuer:'https://accounts.google.com',subject:'123'}};
 for(const operation of ['partner.update','cash-account.create','cash-openings.initialize','analytics.refresh','expense.delete']){
  await assert.rejects(provider.commands(context,{kind:'operation',command:{operation,receiptId:null}}),/unsupported_native_capability/);
 }
 await assert.rejects(provider.commands(context,{kind:'operation',command:{operation:'loan.close',receiptId:'receipt'}}),/unsupported_native_capability/);
});

test('read-only status uses exact workload journal identity and does not renew reviewer authority',async()=>{
 const calls=[];let schema=2;
 const client={async query(sql,params){calls.push([sql,params]);
  if(sql.startsWith('SELECT canonical_json'))return {rows:[{canonical_json:JSON.stringify({contractVersion:schema,command:{operation:'loan.update'}})}]};
  if(sql.includes('pwa_operation_status_v2'))return {rows:[{result:{kind:'recorded',originalOutcome:{status:'applied'}}}]};
  return {rows:[]};},release(){}};
 const provider=createConversationCommandProvider({pool:{connect:async()=>client},guardConnection:async()=>{},policy:{readPartnerIds:[],reviewerPartnerIds:[]}});
 const context={workload:{issuer:'https://accounts.google.com',subject:'123'}};
 assert.equal((await provider.status(context,'00000000-0000-4000-8000-000000000000')).status,200);
 assert.deepEqual(calls.find(([sql])=>sql.startsWith('SELECT canonical_json'))[1],['00000000-0000-4000-8000-000000000000','https://accounts.google.com','123']);
 assert.equal(calls.some(([sql])=>sql.includes('FROM public."Partners"')),false);
 schema=1;calls.length=0;
 assert.equal((await provider.status(context,'00000000-0000-4000-8000-000000000000')).status,404);
 assert.equal(calls.some(([sql])=>sql.includes('pwa_operation_status_v2')),false);
});
