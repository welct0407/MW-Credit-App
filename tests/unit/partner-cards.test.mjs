import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readManagement} from '../../services/business/management.mjs';
test('Partner card projection keeps full-source share and native financial values across named pages',async()=>{
 const calls=[];const client={query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id:'partner-a',label:'A',currentPoolShare:'0.25',netProfitEarned:'12.50',completedSettlement:'5',pendingSettlement:'0',netAvailableToSettle:'7.50'},{id:'partner-b',label:'B',currentPoolShare:'0.75'}]}}};
 const first=await readManagement(client,'partners',{q:'A',limit:1});assert.equal(first.items[0].currentPoolShare,'0.25');assert.equal(first.items[0].netAvailableToSettle,'7.50');assert.ok(first.nextCursor);assert.equal(calls.length,1);
 const sql=calls[0].sql;assert.match(sql,/CROSS JOIN \(SELECT coalesce\(sum[\s\S]*FROM public\."Cash Pool Contributions"\) portfolio/);assert.match(sql,/coalesce\(capital.owned,0\)\/portfolio.pool/);assert.match(sql,/public.partner_net_profit\(p\."Row ID"\)/);assert.match(sql,/"Status"<>'Cancelled'/);assert.deepEqual(calls[0].params,['A',null,null,2]);
 await readManagement(client,'partners',{q:'A',limit:1,cursor:first.nextCursor});assert.deepEqual(calls[1].params,['A','A','partner-a',2]);
});
test('Partner card unavailable values pass through without invented zero; other management projections stay separate',async()=>{
 const result=await readManagement({query:async()=>({rows:[{id:'partner-a',label:'A',currentPoolShare:null,netProfitEarned:null}]})},'partners');assert.equal(result.items[0].currentPoolShare,null);assert.equal(result.items[0].netProfitEarned,null);
 await readManagement({query:async(sql)=>{assert.doesNotMatch(sql,/portfolio|partner_net_profit/);return {rows:[]}}},'cash-accounts');
});
