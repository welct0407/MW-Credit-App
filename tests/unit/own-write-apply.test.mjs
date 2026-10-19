import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// R078 item 6: a Posted own payment is applied to the offline bundles narrowly and only once.
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/own-write-apply.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(overrides={}){const window=new EventTarget(),sandbox={exports:{},require:()=>({}),window,CustomEvent,URL,AbortController,setTimeout,clearTimeout,navigator:{onLine:true},structuredClone,fetch:async()=>{throw Error('no network')},...overrides};runInNewContext(source,sandbox);return {...sandbox.exports,window}}
const own=load(),j=value=>JSON.parse(JSON.stringify(value));
const result={currentSource:'present',payment:{id:'pay-new',borrowerId:'b1',status:'Posted',amountReceived:'150',postedAmount:'150',paymentDate:'2026-10-19',cashAccountId:'acc',paymentMethod:'Transfer',allocationMethod:'Selected Charges',selectedChargeIds:'c1,c2',targetChargeId:null,notes:'own',receiptReference:'manual-receipts/synthetic/pwa/x/y.png',receiptAt:'2026-10-19 08:00:00',createdAt:'2026-10-19 08:00:00',processedAt:'2026-10-19 08:00:01',accountLabel:'Main',version:'v'},
 allocations:[{id:'a1',chargeId:'c1',chargeDate:'2026-10-18',allocationOrder:1,principal:'90',interest:'10',amount:'100'},{id:'a2',chargeId:'c2',chargeDate:'2026-10-19',allocationOrder:2,principal:'40.5',interest:'9.5',amount:'50'}],repayments:[],cashMovements:[{id:'m1',movementDate:'2026-10-19',movementType:'Payment',amount:'150',fromAccount:null,toAccount:'Main',sourceType:'payment',sourceKey:'k'}],history:{recordedAt:'2026-10-19T01:00:00.000Z'}};
const records=()=>({schemaVersion:1,domain:'records',complete:true,generation:'g',asOf:'2026-10-19T00:00:00.000Z',businessDate:'2026-10-19',sourceVersion:'s'.repeat(64),data:{
 borrowerList:[{id:'b1',name:'Alpha',description:'Shop'}],payments:[{id:'pay-old',borrowerId:'b1',amountReceived:'20'}],paymentHistory:[],paymentMonths:[{borrowerId:'b1',month:'2026-10',amountReceived:'20',count:1}],
 charges:[{id:'c1',loanId:'L1',amountRemaining:'100',totalPaid:'0'},{id:'c2',loanId:'L1',amountRemaining:'80.25',totalPaid:'10'}],
 loanRelated:{L1:{charges:[{id:'c1',remaining:'100'},{id:'c2',remaining:'80.25'}],payments:[{id:'pay-old',date:'2026-10-01'}]}},
 paymentDrafts:{b1:{due:{charges:[{id:'c1',amountRemaining:'100',principalRemaining:'90',interestRemaining:'10',loanDisplayKey:'Alpha-L1'},{id:'c2',amountRemaining:'80',principalRemaining:'70',interestRemaining:'10'}]}}}}});

test('decimal text arithmetic is exact and refuses non-decimals',()=>{
 assert.equal(own.addDecimal('80.25','50',-1),'30.25');assert.equal(own.addDecimal('0.1','0.2'),'0.3');assert.equal(own.addDecimal('10','10.50',-1),'-0.50');
 assert.equal(own.addDecimal(null,'1'),null);assert.equal(own.addDecimal('1e3','1'),null);
});
test('records: payment rows marked localPending, balances moved once, fully paid draft charges leave the draft',()=>{
 const patched=j(own.patchRecords(records(),result,'req-1',1000)),data=patched.data;
 assert.deepEqual(patched.localPending,['req-1']);assert.equal(patched.sourceVersion,'s'.repeat(64));assert.equal(patched.asOf,'2026-10-19T00:00:00.000Z');
 const payment=data.payments.find(row=>row.id==='pay-new');
 assert.deepEqual(payment.localPending,{requestId:'req-1',at:1000});assert.equal(payment.receiptReference,'attached');assert.equal(payment.borrowerName,'Alpha');assert.equal(payment.cashAccountLabel,'Main');
 assert.equal(payment.allocations[0].loanDisplayKey,'Alpha-L1');assert.equal('sourceKey' in payment.cashMovements[0],false);
 assert.deepEqual(data.paymentHistory.map(row=>[row.id,row.requestId,row.receiptReference]),[['pay-new','req-1','attached']]);
 assert.deepEqual(data.paymentMonths[0],{borrowerId:'b1',month:'2026-10',amountReceived:'170',count:2,localPending:{requestId:'req-1',at:1000}});
 assert.deepEqual(data.charges.map(row=>[row.amountRemaining,row.totalPaid]),[['0','100'],['30.25','60']]);
 assert.deepEqual(data.loanRelated.L1.charges.map(row=>row.remaining),['0','30.25']);assert.deepEqual(data.loanRelated.L1.payments.map(row=>row.id),['pay-new','pay-old']);
 assert.deepEqual(data.paymentDrafts.b1.due.charges.map(row=>[row.id,row.amountRemaining,row.principalRemaining,row.interestRemaining]),[['c2','30','29.5','0.5']]);
 // A second apply (PaymentResult after the queue) refreshes rows but never moves balances again.
 const again=j(own.patchRecords(structuredClone(patched),{...result,payment:{...result.payment,notes:'edited'}},'req-1',2000));
 assert.equal(again.data.payments.find(row=>row.id==='pay-new').notes,'edited');assert.deepEqual(again.data.charges.map(row=>row.amountRemaining),['0','30.25']);assert.equal(again.data.paymentMonths[0].count,2);
 // Once a check committed the server's row, nothing is applied.
 const server=records();server.data.payments.push({id:'pay-new',borrowerId:'b1'});assert.equal(own.patchRecords(server,result,'req-1'),null);
});
test('collection: receipt row and paid charge amounts; a payment on no shown charge changes nothing',()=>{
 const bundle={complete:true,businessDate:'2026-10-19',data:{charges:[{id:'c1',borrowerId:'b1',amountRemaining:'100',totalPaid:'0',receivedToday:'0'},{id:'c9',borrowerId:'b2',amountRemaining:'5',totalPaid:'0',receivedToday:'0'}],receipts:[]}};
 const patched=j(own.patchCollection(structuredClone(bundle),result,'req-1',1000));
 assert.deepEqual(patched.data.charges[0],{id:'c1',borrowerId:'b1',amountRemaining:'0',totalPaid:'100',receivedToday:'100',localPending:{requestId:'req-1',at:1000}});assert.equal(patched.data.charges[1].amountRemaining,'5');
 assert.deepEqual(patched.data.receipts.map(row=>[row.id,row.chargeIds,row.manualReceiptPresent]),[['pay-new',['c1'],true]]);assert.deepEqual(patched.localPending,['req-1']);
 assert.equal(own.patchCollection({complete:true,data:{charges:[{id:'other',borrowerId:'b1'}],receipts:[]}},result,'req-1'),null);
});
test('only a Posted present result is applied, through the repository patch, and mounted views are told',async()=>{
 for(const bad of [{...result,currentSource:'changed'},{...result,payment:{...result.payment,status:'Processing'}},{...result,payment:null}])assert.equal(own.appliableResult(bad),false);
 const bundles={records:records(),collection:{complete:true,data:{charges:[],receipts:[]}}},events=[];own.window.addEventListener('mw-offline-dataset-ready',event=>events.push(event.detail.domain+':'+event.detail.changed));
 const repo={scopeName:'scope',patchDataset:async(domain,mutate)=>{const next=mutate(structuredClone(bundles[domain]));if(!next)return false;bundles[domain]=next;return true}};
 assert.deepEqual(j(await own.applyOwnPayment({offline:repo},'req-1',{...result,currentSource:'missing'})),[]);
 assert.deepEqual(j(await own.applyOwnPayment({offline:repo},'req-1',result)),['records']);assert.deepEqual(events,['records:true']);
 assert.equal(own.ownReceiptKey('https://lm.example.invalid','pay new'),'blob:https://lm.example.invalid/api/payment-records/pay%20new/receipt?source=manual');
});
test('a payment synced from the queue reads its result once and applies it',async()=>{
 const calls=[];const fetch=async(url,init)=>{calls.push([url,init.headers.Authorization]);return {status:200,ok:true,json:async()=>structuredClone(result)}};
 const module=load({fetch}),bundles={records:records()};const repo={scopeName:'scope',patchDataset:async(domain,mutate)=>{if(!bundles[domain])return false;const next=mutate(structuredClone(bundles[domain]));if(!next)return false;bundles[domain]=next;return true}};
 const access={origin:'https://api.example.invalid',offline:repo,token:async()=>'t',authFailure:()=>{}};
 const [first,second]=await Promise.all([module.confirmOwnPayment(access,'req-2'),module.confirmOwnPayment(access,'req-2')]);
 assert.deepEqual(j(first),['records']);assert.equal(first,second);assert.deepEqual(calls,[['https://api.example.invalid/api/payment-commands/req-2/result','Bearer t']]);
 assert.ok(bundles.records.data.payments.some(row=>row.id==='pay-new'&&row.localPending.requestId==='req-2'));
});

test('a seeded receipt keeps the server receipt time even when the device clock runs ahead or behind',()=>{
 for(const skew of [+6*3600*1000,-6*3600*1000]){
  class SkewedDate extends Date{static now(){return Date.now()+skew}}
  const skewed=load({Date:SkewedDate}),first='2026-10-19 08:00:00',replacement='2026-10-19 08:05:00';
  assert.equal(skewed.seededReceiptTime(first),Date.parse(first));
  // The coordinator re-downloads when a saved copy is older than the payment's current receipt time.
  assert.ok(skewed.seededReceiptTime(first)<Date.parse(replacement),'a stale copy never looks newer than its replacement');
 }
 assert.equal(own.seededReceiptTime('not a time'),null);assert.equal(own.seededReceiptTime(null),null);
});
