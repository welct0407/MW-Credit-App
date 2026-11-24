import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import ts from 'typescript';
import * as patchModule from '../../services/lib/offline-dataset-digest.mjs';
import {readRecordList} from '../../services/business/record-lists.mjs';
// R185 (Echo's UI/UX review): the logic behind the display changes. Wording and CSS are not tested here.
const esm=file=>ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const {bilingualHalf}=await import(url(esm('bilingual-text.ts')));
const {displayMonth}=await import(url(esm('display-date.ts')));
const {dailyRateText,paymentIntervalText}=await import(url(esm('loan-form-values.ts').replace("'./whole-number-input'",JSON.stringify(url(esm('whole-number-input.ts'))))));

test('UXR-COPY-01 #7: a stored bilingual value shows the current language half, split at the last " / " before Thai',()=>{
 assert.equal(bilingualHalf('Other / อื่น ๆ',false),'Other');assert.equal(bilingualHalf('Other / อื่น ๆ',true),'อื่น ๆ');
 assert.equal(bilingualHalf('Open / ยังไม่ปิดยอด',true),'ยังไม่ปิดยอด');
 assert.equal(bilingualHalf('Bank / Transfer Fee / ค่าธรรมเนียมธนาคารและโอนเงิน',false),'Bank / Transfer Fee');
 assert.equal(bilingualHalf('Bank / Transfer Fee / ค่าธรรมเนียมธนาคารและโอนเงิน',true),'ค่าธรรมเนียมธนาคารและโอนเงิน');
 for(const value of ['Partner A / Partner B','สมชาย / Somchai','ไทย / ไทย','Other','Other / ',' / อื่น ๆ',''])assert.equal(bilingualHalf(value,false),value,value);
});

test('UXR-DATE-01: a month reads "Oct 2026", Buddhist Era in Thai; anything else reads —',()=>{
 assert.equal(displayMonth('2026-10',false),'Oct 2026');assert.equal(displayMonth('2026-10',true),'ต.ค. 2569');assert.equal(displayMonth('2027-01',false),'Jan 2027');assert.equal(displayMonth('2026-10',false,false),'Oct');assert.equal(displayMonth('2026-10',true,false),'ต.ค.');
 for(const value of [null,undefined,'','2026-13','2026-1','2026-10-01','undated'])assert.equal(displayMonth(value,false),'—',String(value));
});

test('UXR-LOAN-03: the original rate is per day for every type; the interval is in days and has no meaning on a Fixed due date loan',()=>{
 assert.equal(dailyRateText('9',false),'9% per day');assert.equal(dailyRateText(9,true),'9% ต่อวัน');assert.equal(dailyRateText(null,false),'—');assert.equal(dailyRateText('',false),'—');
 assert.equal(paymentIntervalText(1,'ดอกเบี้ยรายวัน',false),'Every day');assert.equal(paymentIntervalText(3,'ผ่อนชำระรายวัน',false),'Every 3 days');
 assert.equal(paymentIntervalText(1,'ดอกเบี้ยรายวัน',true),'ทุกวัน');assert.equal(paymentIntervalText(3,'ดอกเบี้ยรายวัน',true),'ทุก 3 วัน');
 assert.equal(paymentIntervalText(1,'กำหนดวันชำระ',false),'—');assert.equal(paymentIntervalText(null,'ดอกเบี้ยรายวัน',false),'—');assert.equal(paymentIntervalText(0,'ดอกเบี้ยรายวัน',false),'—');
});

test('UXR-PAY-01: the borrower level reads the latest payment date, its month and that month\'s sum; cursor scope is unchanged',async()=>{
 const calls=[],client={async query(sql,params){calls.push({sql,params});return {rows:[{id:'b1',borrowerId:'b1',borrowerDisplayName:'Alpha - Shop',nullRank:0,lastPaymentDate:'2026-10-26',latestMonth:'2026-10',latestMonthAmount:'3160'},{id:'b2',borrowerId:'b2',borrowerDisplayName:'Beta',nullRank:0,lastPaymentDate:null,latestMonth:null,latestMonthAmount:null}]}}};
 const result=await readRecordList(client,'payments',{q:'',limit:1});
 assert.deepEqual(result.items,[{id:'b1',borrowerId:'b1',borrowerDisplayName:'Alpha - Shop',lastPaymentDate:'2026-10-26',latestMonth:'2026-10',latestMonthAmount:'3160'}]);
 assert.deepEqual(JSON.parse(Buffer.from(result.nextCursor,'base64url')),{v:2,kind:'payment-borrowers',q:'',borrowerId:null,month:null,tuple:['Alpha - Shop',0,'b1']});
 const {sql}=calls[0];
 assert.match(sql,/max\(p\."Payment Date"\)::text AS "lastPaymentDate"/);assert.match(sql,/to_char\(max\(p\."Payment Date"\),'YYYY-MM'\) AS "latestMonth"/);
 // The month sum counts every status for the same borrower (null borrower included), like the month row.
 assert.match(sql,/sum\(q\."Amount Received"\) FROM public\."Payments" q WHERE q\."Ref Borrower" IS NOT DISTINCT FROM p\."Ref Borrower" AND to_char\(q\."Payment Date",'YYYY-MM'\)=to_char\(max\(p\."Payment Date"\),'YYYY-MM'\)\)::numeric::text AS "latestMonthAmount"/);
 assert.doesNotMatch(sql,/q\."Status"/);
});

test('UXR-PAY-01: the saved dataset gives the same three fields from payments and paymentMonths',async()=>{
 const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/offline-dataset.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const sandbox={exports:{},require:name=>name==='./dataset-patch'?patchModule:name==='./client-events'?{recordClientEvent:()=>{}}:{activitySnapshot:()=>0,subscribeActivity:()=>()=>{}},window:new EventTarget(),document:new EventTarget(),navigator:{onLine:true},setTimeout,clearTimeout,URL,structuredClone,Intl,CustomEvent,Event,AbortController,TextEncoder,crypto:globalThis.crypto};
 runInNewContext(source,sandbox);
 const pay=(id,borrowerId,paymentDate,amountReceived)=>({id,borrowerId,borrowerName:borrowerId?'Name '+borrowerId:null,borrowerDescription:borrowerId?'Shop':null,paymentDate,amountReceived});
 const payments=[pay('p1','b1','2026-10-26','1000'),pay('p2','b1','2026-10-02','2160'),pay('p3','b1','2026-09-30','500'),pay('p4','b2',null,'70'),pay('p5',null,'2026-08-01','9'),pay('p6','b3','2026-11-11','500')];
 const paymentMonths=[{borrowerId:'b1',month:'2026-10',amountReceived:'3160',count:2},{borrowerId:'b1',month:'2026-09',amountReceived:'500',count:1},{borrowerId:'b2',month:null,amountReceived:'70',count:1},{borrowerId:null,month:'2026-08',amountReceived:'9',count:1}];
 const bundle={schemaVersion:1,complete:true,domain:'records',asOf:'2026-11-11T01:00:00.000Z',businessDate:'2026-11-11',data:{payments,paymentMonths}};
 const access={origin:'https://command.synthetic.invalid',offline:{environment:'synthetic',syncAuthorized:async()=>true,readDataset:async()=>structuredClone(bundle)}};
 const value=JSON.parse(JSON.stringify(await sandbox.exports.readOfflineDataset(access,'/api/payment-records?q=&limit=25')));
 assert.equal(value.level,'borrowers');
 const rows=Object.fromEntries(value.items.map(row=>[row.id,[row.lastPaymentDate,row.latestMonth,row.latestMonthAmount]]));
 assert.deepEqual(rows,{b1:['2026-10-26','2026-10','3160'],b2:[null,null,null],'':['2026-08-01','2026-08','9'],b3:['2026-11-11','2026-11',null]},'a month row not yet in the dataset leaves only the amount null');
});
