import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationReadProvider} from '../../services/agent-conversations/read-provider.mjs';

test('statement default uses one fixed full-relation aggregate in authenticated snapshot',async()=>{
 for(const value of ['2026-10-12',null]){
  const calls=[];
  const client={async query(sql){calls.push(sql);
   if(sql.includes('AS actor'))return {rows:[{actor:'p'}]};
   if(sql.includes('AS "businessDate"'))return {rows:[{businessDate:'2026-10-12',now:'2026-10-12T01:00:00Z'}]};
   if(sql.startsWith('SELECT max'))return {rows:[{value}]};
   return {rows:[]};
  },release(){}};
  const descriptor={kind:'resolver',name:'latest-statement-date',type:'Date'};
  const provider=createConversationReadProvider({pool:{async connect(){return client;}},guardConnection:async()=>{},
   policy:null,resolveActor:async(c,_p,_w,partnerId)=>{await c.query('SELECT "Row ID" AS actor FROM public."Partners" WHERE "Row ID"=$1',[partnerId]);return {issuer:'x',subject:'y',partnerId,loginEmail:'p@example.invalid'};},
   catalogue:{resources:[{scope:'oltp',resource:'Cash Statement Context',fields:[
    {name:'Date A',default:descriptor},{name:'Date B',default:descriptor}]}]},
   resources:{oltp:{'Cash Account Daily Summary Recent':{relation:'cash_account_daily_summary_recent'}}}});
  const result=await provider.catalogue({workload:{issuer:'https://accounts.google.com',subject:'123'}},
    {actorPartnerId:'p',scope:'oltp',resource:'Cash Statement Context'});
  const defaults=result.defaults['Cash Statement Context'];
  if(value){assert.deepEqual(defaults.values,{'Date A':value,'Date B':value});assert.deepEqual(defaults.pending,[]);}
  else{assert.deepEqual(defaults.values,{});assert.equal(defaults.pending.length,2);}
  assert.deepEqual(calls.filter(sql=>sql.startsWith('SELECT max')),
    ['SELECT max("Statement Date")::text AS value FROM public."cash_account_daily_summary_recent"']);
  assert.ok(calls.findIndex(sql=>sql.includes('AS actor'))<calls.findIndex(sql=>sql.startsWith('SELECT max')));
  assert.equal(calls.at(-1),'COMMIT');
 }
});
