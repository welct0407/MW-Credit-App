import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
// APP-PAY-04 (W1): receipt upload/retrieve and source image download run with no DB transaction open and no pool client checked out.
const principal={ok:true,subject:'synthetic',email:'synthetic@example.invalid'};
const actor={issuer:'https://issuer.invalid',subject:'synthetic',partnerId:'synthetic-partner',loginEmail:principal.email};
const requestId='12345678-1234-4234-8234-123456789abc',receiptId='12345678-1234-4234-8234-123456789abd';
function fixture({adapter={},reader,resolveActor=async()=>actor,principalAllowed=()=>true,rows}={}){
 let open=0,checkedOut=0;const sql=[];
 const client={query:async(text,_params)=>{sql.push(text);if(text.startsWith('BEGIN'))open++;if(text==='COMMIT'||text==='ROLLBACK')open--;if(rows&&text.startsWith('SELECT "Uploaded Receipt"'))return {rows:rows(sql.filter(t=>t.startsWith('SELECT "Uploaded Receipt"')).length)};return {rows:[{}]}},release(){checkedOut--}};
 const pool={connect:async()=>{checkedOut++;return client}};
 const snapshot=()=>({open,checkedOut});
 const record=[];
 const receiptAdapter={resolveReceipt(){},upload:async input=>{record.push({call:'upload',...snapshot()});return adapter.upload?adapter.upload(input):{receipt:{receiptId:input.receiptId,sizeBytes:input.bytes.length}}},retrieve:async input=>{record.push({call:'retrieve',...snapshot()});return adapter.retrieve?adapter.retrieve(input):{bytes:Buffer.from('synthetic'),mimeType:'image/jpeg'}}};
 const sourceReceiptReader=reader===undefined?undefined:async(reference,kind,row)=>{record.push({call:'download',...snapshot()});return reader(reference,kind,row)};
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed,resolveActor,actorIssuer:actor.issuer,receiptAdapter,sourceReceiptReader});
 return {store,record,sql,snapshot};
}
test('receipt upload authorizes in a short transaction and then uploads with no client checked out',async()=>{
 const f=fixture();
 const result=await f.store.receipt(principal,{requestId,receiptId,borrowerId:'synthetic-borrower',bytes:Buffer.alloc(10),mimeType:'image/jpeg'});
 assert.equal(result.ok,true);assert.equal(result.status,200);assert.deepEqual(result.receipt,{receiptId,sizeBytes:10});
 assert.deepEqual(f.record,[{call:'upload',open:0,checkedOut:0}]);
 assert.equal(f.sql.filter(t=>t.startsWith('BEGIN')).length,1);assert.ok(f.sql.includes('COMMIT'));assert.ok(f.sql.some(t=>t.includes('public."Borrowers"')));
});
test('receipt retrieve authorizes first and reads with no client checked out',async()=>{
 const f=fixture();
 const result=await f.store.receipt(principal,{requestId,receiptId});
 assert.equal(result.ok,true);assert.equal(result.mimeType,'image/jpeg');assert.ok(Buffer.isBuffer(result.bytes));
 assert.deepEqual(f.record,[{call:'retrieve',open:0,checkedOut:0}]);
});
test('receipt storage is never touched when the principal or actor is denied',async()=>{
 for(const options of [{resolveActor:async()=>null},{principalAllowed:()=>false}]){
  const f=fixture(options);
  for(const input of [{requestId,receiptId,borrowerId:'synthetic-borrower',bytes:Buffer.alloc(10),mimeType:'image/jpeg'},{requestId,receiptId}]){
   const result=await f.store.receipt(principal,input);assert.equal(result.status,403);assert.equal(result.code,'access_denied');
  }
  assert.deepEqual(f.record,[]);
 }
});
test('receipt adapter error mapping is unchanged',async()=>{
 const cases=[[Error('receipt_conflict'),409,'receipt_conflict'],[Object.assign(Error('bad'),{receiptInvalid:true}),422,'receipt_unavailable'],[Error('invalid_receipt'),422,'receipt_unavailable'],[Error('storage down'),503,'receipt_unavailable']];
 for(const [error,status,code] of cases){
  const f=fixture({adapter:{upload:async()=>{throw error}}});
  const result=await f.store.receipt(principal,{requestId,receiptId,borrowerId:'synthetic-borrower',bytes:Buffer.alloc(10),mimeType:'image/jpeg'});
  assert.deepEqual(result,{ok:false,status,code});assert.equal(f.snapshot().checkedOut,0);
 }
});
const row={manual:null,agent:'ig://synthetic-reference',agentReceiptId:'ig-1',agentReceivedAt:'2026-10-15 10:00:00'};
test('payment image downloads outside any transaction and re-checks the row and actor afterwards',async()=>{
 const f=fixture({reader:async(reference,kind,p)=>{assert.equal(reference,row.agent);assert.equal(kind,'agent');assert.deepEqual(p,row);return {bytes:Buffer.from('image'),mimeType:'image/png'}},rows:()=>[row]});
 const result=await f.store.paymentImage(principal,'synthetic-payment');
 assert.equal(result.ok,true);assert.equal(result.mimeType,'image/png');
 assert.deepEqual(f.record,[{call:'download',open:0,checkedOut:0}]);
 assert.equal(f.sql.filter(t=>t==='BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY').length,2);assert.equal(f.sql.filter(t=>t.startsWith('SELECT "Uploaded Receipt"')).length,2);assert.equal(f.snapshot().checkedOut,0);
});
test('payment image rejects a reference changed during the download and an actor changed after it',async()=>{
 const changed=fixture({reader:async()=>({bytes:Buffer.from('image'),mimeType:'image/png'}),rows:read=>read===1?[row]:[{...row,agent:'ig://replaced'}]});
 assert.deepEqual(await changed.store.paymentImage(principal,'synthetic-payment'),{ok:false,status:503,code:'receipt_unavailable'});
 let resolutions=0;
 const revoked=fixture({reader:async()=>({bytes:Buffer.from('image'),mimeType:'image/png'}),rows:()=>[row],resolveActor:async()=>++resolutions===1?actor:{...actor,partnerId:'other-partner'}});
 assert.deepEqual(await revoked.store.paymentImage(principal,'synthetic-payment'),{ok:false,status:403,code:'access_denied'});
 const missing=fixture({reader:async()=>({bytes:Buffer.from('image'),mimeType:'image/png'}),rows:read=>read===1?[row]:[]});
 assert.equal((await missing.store.paymentImage(principal,'synthetic-payment')).code,'receipt_unavailable');
 const absent=fixture({reader:async()=>{throw Error('must not download')},rows:()=>[]});
 assert.deepEqual(await absent.store.paymentImage(principal,'synthetic-payment'),{ok:false,status:404,code:'not_found'});assert.deepEqual(absent.record,[]);
});
