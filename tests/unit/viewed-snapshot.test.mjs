import test from 'node:test';
import assert from 'node:assert/strict';
import {projectViewedSnapshot,validateViewedSnapshot} from '../../apps/pwa/src/viewed-snapshot.ts';
const version='a'.repeat(64),asOf='2026-01-01T00:00:00.000Z';
test('viewed projections exclude contacts, actor and receipt references',()=>{
 const borrower=projectViewedSnapshot('borrower',{id:'b',version,name:'Synthetic',address:'private',instagramUsername:'private',note:'private',details:{activeInterest:'10',loginEmail:'private'}},'2026-01-01',asOf);
 assert.deepEqual(borrower.record,{id:'b',name:'Synthetic',details:{activeInterest:'10'}});
 const payment=projectViewedSnapshot('payment',{id:'p',version,notes:' exact\nไทย ',createdBy:'private@example.invalid',receiptReference:'private/path',amountReceived:'10'},'2026-01-01',asOf);
 assert.equal(payment.record.notes,' exact\nไทย ');assert.equal(payment.record.manualReceiptPresent,true);assert.equal('receiptReference' in payment.record,false);assert.equal('createdBy' in payment.record,false);
});
test('one100-row related budget marks every truncated collection without recomputing totals',()=>{
 const value=projectViewedSnapshot('payment',{id:'p',version,amountReceived:'1000',allocations:Array.from({length:80},(_,i)=>({id:String(i),amount:'10'})),repayments:Array.from({length:30},(_,i)=>({id:String(i),interest:'1'})),cashMovements:[{id:'cash',amount:'1000'}]},'2026-01-01',asOf);
 assert.equal(value.related.allocations.rows.length,80);assert.equal(value.related.repayments.rows.length,20);assert.equal(value.related.repayments.truncated,true);assert.equal(value.related.cashMovements.rows.length,0);assert.equal(value.related.cashMovements.hasMore,true);assert.equal(value.record.amountReceived,'1000');
});
test('unknown snapshot protocols and injected projection fields fail closed',()=>{
 const value=projectViewedSnapshot('expense',{id:'e',version,amount:'-10',notes:'explanation'},'2026-01-01',asOf);
 for(const modified of [{...value,domain:'unknown'},{...value,schemaVersion:2},{...value,asOf:'2999-01-01T00:00:00Z'},{...value,record:{...value.record,token:'secret'}},{...value,related:{unknown:{rows:[],hasMore:false,truncated:false}}}])assert.throws(()=>validateViewedSnapshot(modified));
});
