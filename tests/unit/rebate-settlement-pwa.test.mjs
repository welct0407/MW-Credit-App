import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {sortedExpenseIds} from '../../services/contracts/rebate-settlement-command.mjs';
// R129 (V137): the Referrers pages' pure helpers: the search rule, the command's id order (the same as the Node contract's
// and SQL COLLATE "C") and the exact money sum of the Pay rebates footer.
const load=file=>{const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,TextEncoder});return exports;};
const {matchesReferrer,sortedIds,moneySum,refereeBreakdown,oldestFirst,applyOldestFirst,settlementAllocations,cleanAmountInput,settleAmountState,defaultSettleAmount,offsetPreviewRuns,historyKind,tilesTotal,wholeAmount}=load('referrer-text.ts');
test('search: every typed word appears in the Thai or the English name',()=>{
 const row={name:'มาย สมใจ',description:'Mai Somjai'};
 for(const query of ['','mai','MAI som','มาย','สมใจ mai','  mai   somjai '])assert.equal(matchesReferrer(row,query),true,query);
 for(const query of ['pond','mai pond','มายา'])assert.equal(matchesReferrer(row,query),false,query);
 assert.equal(matchesReferrer({name:null,description:null},'x'),false);
});
test('id order: UTF-8 byte order without duplicates, as the Node contract and SQL require',()=>{
 const ids=['rr1:b','rr1:B','rr1:a','rr1:b','rr1:é','rr1:z','rr1:ก','rr1:L-10','rr1:L-9'];
 assert.deepEqual([...sortedIds(ids)],sortedExpenseIds(ids));
 assert.deepEqual([...sortedIds(ids)],['rr1:B','rr1:L-10','rr1:L-9','rr1:a','rr1:b','rr1:z','rr1:é','rr1:ก']);
});
test('footer total: exact in satang',()=>{
 assert.equal(moneySum(['0.10','0.20']),'0.30');assert.equal(moneySum(['300.00','100.00','450.00']),'850.00');assert.equal(moneySum([]),'0.00');
});
test('referred borrower line: loans and open loans, only the non-zero rebate parts, null when all are zero',()=>{
 const money=v=>'฿'+Math.round(Number(v)).toLocaleString('en-US'),zero={unpaidAmount:'0.00',paidAmount:'0.00',offsetAmount:'0.00',accruingAmount:'0.00'};
 const row=(loanCount,openLoanCount,over={})=>({borrowerId:'B',borrowerLabel:'B',loanCount,openLoanCount,...zero,...over});
 assert.deepEqual({...refereeBreakdown(row(3,1,{unpaidAmount:'300.00',paidAmount:'200.00',offsetAmount:'100.00',accruingAmount:'50.00'}),false,money)},{loans:'3 loans · 1 open',rebates:'Unpaid ฿300 · Paid ฿200 · Offset ฿100 · Accruing ฿50'});
 assert.deepEqual({...refereeBreakdown(row(1,0,{paidAmount:'450.00'}),false,money)},{loans:'1 loan',rebates:'Paid ฿450'});
 assert.deepEqual({...refereeBreakdown(row(2,2,{accruingAmount:'450.00'}),true,money)},{loans:'สินเชื่อ 2 รายการ · ยังไม่ปิด 2',rebates:'กำลังสะสม ฿450'});
 assert.deepEqual({...refereeBreakdown(row(0,0),false,money)},{loans:'No loans',rebates:null});
 assert.deepEqual({...refereeBreakdown(row(1,1),true,money)},{loans:'สินเชื่อ 1 รายการ · ยังไม่ปิด 1',rebates:null});
});
// R184 (V155): the Pay rebates amount: the order it is applied in, the command's lines and the field's states.
const settleRow=(expenseId,closeDate,pendingAmount)=>({expenseId,closeDate,pendingAmount});
test('R184 oldest first: the close date, then the expense id in UTF-8 byte order (the order of the unpaid read)',()=>{
 const rows=[settleRow('rr1:b','2026-11-10','300.00'),settleRow('rr1:é','2026-11-01','100.00'),settleRow('rr1:B','2026-11-10','200.00'),settleRow('rr1:a','2026-11-01','50.00'),settleRow('rr1:L-9','2026-11-10','10.00'),settleRow('rr1:L-10','2026-11-10','20.00')];
 assert.deepEqual([...oldestFirst(rows)].map(r=>r.expenseId),['rr1:a','rr1:é','rr1:B','rr1:L-10','rr1:L-9','rr1:b']);
 assert.equal(rows[0].expenseId,'rr1:b','the input is not reordered');
});
test('R184 an amount applied oldest first: full rows, one partial row, then rows it never reaches (0)',()=>{
 const rows=[settleRow('rr1:c','2026-11-12','300.00'),settleRow('rr1:a','2026-11-10','300.00'),settleRow('rr1:b','2026-11-10','200.00')];
 const applied=amount=>[...applyOldestFirst(rows,amount)].map(line=>[line.row.expenseId,line.applied,line.remaining]);
 assert.deepEqual(applied(800),[['rr1:a',300,0],['rr1:b',200,0],['rr1:c',300,0]]);
 assert.deepEqual(applied(400),[['rr1:a',300,0],['rr1:b',100,100],['rr1:c',0,300]]);
 assert.deepEqual(applied(1),[['rr1:a',1,299],['rr1:b',0,200],['rr1:c',0,300]]);
 assert.deepEqual(applied(0),[['rr1:a',0,300],['rr1:b',0,200],['rr1:c',0,300]]);
 assert.deepEqual(applied(5000),applied(800),'never more than what is pending');
});
test('R184 the command lines: only rebates that get more than ฿0, ascending by expense id, with the pending amount the page read',()=>{
 const rows=[settleRow('rr1:z','2026-11-01','300.00'),settleRow('rr1:a','2026-11-10','300.00'),settleRow('rr1:B','2026-11-10','200.00')];
 // oldest first: z (300), then B (200, byte order before a), then a; the lines travel sorted by id.
 assert.deepEqual([...settlementAllocations(rows,400)].map(line=>({...line})),[{expenseId:'rr1:B',amount:'100',expectedPending:'200'},{expenseId:'rr1:z',amount:'300',expectedPending:'300'}]);
 assert.deepEqual([...settlementAllocations(rows,800)].map(line=>line.expenseId),['rr1:B','rr1:a','rr1:z']);
 assert.deepEqual([...settlementAllocations(rows,300)].map(line=>({...line})),[{expenseId:'rr1:z',amount:'300',expectedPending:'300'}]);
 assert.deepEqual([...settlementAllocations(rows,0)],[]);
 assert.ok([...settlementAllocations(rows,650)].every(line=>/^[1-9][0-9]*$/.test(line.amount)&&line.amount!=='0'));
});
test('R184 the amount field: digits only, at least 1, within the ticked total and the offset cap',()=>{
 assert.equal(cleanAmountInput(' ฿1,500 '),'1500');assert.equal(cleanAmountInput('1 500'),'1500');assert.equal(cleanAmountInput('12.5'),'12.5');
 const state=(text,total=2300,cap=null)=>settleAmountState(text,total,cap);
 assert.equal(state(''),'empty');assert.equal(state('0'),'zero');assert.equal(state('000'),'zero');
 for(const text of ['12.5','1e3','-5','abc','1'.repeat(13)])assert.equal(state(text),'format',text);
 assert.equal(state('1'),'ok');assert.equal(state('2300'),'ok');assert.equal(state('2301'),'over-total');
 // An offset: the lower of the cap and the total is named.
 assert.equal(state('1200',2300,1200),'ok');assert.equal(state('1201',2300,1200),'over-cap');assert.equal(state('2400',2300,1200),'over-cap');
 assert.equal(state('2300',2300,5000),'ok');assert.equal(state('2301',2300,5000),'over-total');assert.equal(state('2301',2300,2300),'over-total');
});
test('R184 the default amount: the ticked total to the referrer; for an offset what is due, or the most the loan takes when nothing is due',()=>{
 assert.equal(defaultSettleAmount('referrer',2300,{dueAmount:'600',maxAmount:'1200'}),2300);
 assert.equal(defaultSettleAmount('offset',2300,{dueAmount:'600',maxAmount:'1200'}),600);
 assert.equal(defaultSettleAmount('offset',400,{dueAmount:'600',maxAmount:'1200'}),400);
 assert.equal(defaultSettleAmount('offset',2300,{dueAmount:'0',maxAmount:'1200'}),1200);
 assert.equal(defaultSettleAmount('offset',2300,null),0);assert.equal(wholeAmount('300.00'),300);assert.equal(wholeAmount(null),0);
});
test('R184 the offset preview: one run per loan with its dates, count, the one amount of equal charges and the paid-through day',()=>{
 const line=(loanId,chargeDate,amount,due=false)=>({chargeId:loanId+':'+chargeDate,loanId,chargeDate,amount,remaining:amount,due,booked:!due});
 const runs=offsetPreviewRuns([line('L-1','2026-11-24','14',true),line('L-1','2026-11-25','5'),line('L-1','2026-11-26','5'),line('L-2','2026-11-30','500'),line('L-2','2026-12-30','500')],{'L-2':'2026-12-30'});
 assert.deepEqual([...runs].map(run=>({...run})),[{loanId:'L-1',first:'2026-11-24',last:'2026-11-26',count:3,each:null,amount:24,paidThrough:null},{loanId:'L-2',first:'2026-11-30',last:'2026-12-30',count:2,each:'500',amount:1000,paidThrough:'2026-12-30'}]);
 assert.deepEqual([...offsetPreviewRuns([])],[]);
});
test('R184 state mapping: a settlement to the referrer, an offset settlement, a close-time offset and a legacy row; the tiles reconcile',()=>{
 assert.equal(historyKind({kind:'settlement',destination:'referrer'}),'settlement');assert.equal(historyKind({kind:'settlement'}),'settlement','an older API sends no destination');
 assert.equal(historyKind({kind:'settlement',destination:'offset'}),'settlement-offset');assert.equal(historyKind({kind:'offset'}),'offset');assert.equal(historyKind({kind:'paid-at-close'}),'paid-at-close');
 // D11: total rebates = unpaid + paid + offset (300 pending, 400 paid, 200 offset of 900 booked).
 assert.equal(tilesTotal({unpaidAmount:'300.00',paidToDate:'400.00',offsetToDate:'200.00'}),'900.00');
});
