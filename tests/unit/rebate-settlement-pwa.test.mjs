import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {sortedExpenseIds} from '../../services/contracts/rebate-settlement-command.mjs';
// R129 (V137): the Referrers pages' pure helpers: the search rule, the command's id order (the same as the Node contract's
// and SQL COLLATE "C") and the exact money sum of the Pay rebates footer.
const load=file=>{const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,TextEncoder});return exports;};
const {matchesReferrer,sortedIds,moneySum,refereeBreakdown}=load('referrer-text.ts');
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
