// Local independent integer-baht oracle. No network, no AppSheet access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const precedes=(a,b)=>a.date>b.date||(a.date===b.date&&a.row>b.row);
let checks=0,cases=0;
function verify(rows,received){
  const rank=a=>1+rows.filter(b=>b.payment===a.payment&&precedes(b,a)).length;
  const old=a=>Math.max(0,Math.min(a.interest+a.principal,received-rows.filter(b=>b.payment===a.payment&&rank(b)<rank(a)).reduce((n,b)=>n+b.interest+b.principal,0)));
  const direct=a=>Math.max(0,Math.min(a.interest+a.principal,received-rows.filter(b=>b.payment===a.payment&&precedes(b,a)).reduce((n,b)=>n+b.interest+b.principal,0)));
  for(const payment of new Set(rows.map(r=>r.payment))){
    let budget=received,total=0;
    const sorted=rows.filter(r=>r.payment===payment).sort((a,b)=>b.date.localeCompare(a.date)||b.row-a.row);
    for(const row of sorted){
      const interest=Math.min(row.interest,budget);budget-=interest;
      const principal=Math.min(row.principal,budget);budget-=principal;
      const expected=interest+principal;
      assert.equal(old(row),expected);assert.equal(direct(row),expected);checks+=2;
      const actualInterest=Math.min(Math.max(0,row.interest),direct(row));
      const actualPrincipal=Math.min(Math.max(0,row.principal),direct(row)-actualInterest);
      assert.equal(actualInterest,interest);assert.equal(actualPrincipal,principal);checks+=2;total+=expected;
    }
    assert.equal(total,Math.min(received,sorted.reduce((n,r)=>n+r.interest+r.principal,0)));checks++;
  }cases++;
}
let seed=20260913;
const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
for(let test=0;test<2000;test++){
  const rows=Array.from({length:1+rand(35)},(_,i)=>({payment:rand(3),date:`2026-09-${String(1+rand(5)).padStart(2,'0')}`,row:i+1,interest:rand(301),principal:rand(1001)}));
  for(const amount of [0,1,100,rand(10000),50000])verify(rows,amount);
}
const fixture=[{payment:0,date:'2026-09-12',row:690,interest:94700,principal:100000},...[691,692,693,694,695].map(row=>({payment:0,date:'2026-09-11',row,interest:100,principal:0}))];
for(const amount of [94699,94700,94701,94750,194700,194701,195199,195200,195201])verify(fixture,amount);
// P01a preserves the old eligible set for all non-Posted states, including Error.
let eligibilityChecks=0;
const charges=[{id:'a',borrower:'A',loan:'L1',date:'2026-09-11',remaining:100},{id:'b',borrower:'A',loan:'L1',date:'2026-09-14',remaining:200},{id:'c',borrower:'A',loan:'L2',date:'2026-09-10',remaining:300},{id:'d',borrower:'B',loan:'L3',date:'2026-09-10',remaining:400},{id:'z',borrower:'A',loan:'L1',date:'2026-09-10',remaining:0}];
const expected={ 'Single Full':['a'],'Single Partial':['a'],'First-day Auto':['a'],'Loan Close':['a','b'],'Receive All':['a','c'],'Lump Sum':['a','c'],'Unknown':[] };
for(const status of ['Processing','Error','Posted',''])for(const [method,want]of Object.entries(expected)){
 const original=charges.filter(c=>c.borrower==='A'&&c.remaining>0&&(['Single Full','Single Partial','First-day Auto'].includes(method)?c.id==='a':method==='Loan Close'?c.loan==='L1':['Receive All','Lump Sum'].includes(method)?c.date<='2026-09-12':false)).map(c=>c.id);
 assert.deepEqual(original,want);assert.deepEqual(status==='Posted'?[]:original,status==='Posted'?[]:want);eligibilityChecks+=2;
}
// Equal ordering tuples preserve predicate equivalence, but can over-allocate in BOTH designs.
const duplicateRows=[{date:'2026-09-12',row:1,remaining:100},{date:'2026-09-12',row:1,remaining:100}];
const duplicateRank=a=>1+duplicateRows.filter(b=>precedes(b,a)).length;
const duplicateTotal=predicate=>duplicateRows.reduce((sum,a)=>sum+Math.max(0,Math.min(a.remaining,100-duplicateRows.filter(b=>predicate(b,a)).reduce((n,b)=>n+b.remaining,0))),0);
const oldDuplicate=duplicateTotal((b,a)=>duplicateRank(b)<duplicateRank(a));
const newDuplicate=duplicateTotal(precedes);
assert.equal(oldDuplicate,200);assert.equal(newDuplicate,200);
const duplicateTupleCounterexample={received:100,rows:duplicateRows,oldAllocated:oldDuplicate,newAllocated:newDuplicate};
const result={passed:true,cases,allocationAssertions:checks,eligibilityAssertions:eligibilityChecks,seed:20260913,duplicateTupleCounterexample,scope:'Independent sequential interest-first oracle; valid nonnegative integer-baht balances, comparable dates and unique row-number ordering tuples. Local JavaScript validation, not AppSheet engine execution, live concurrency, blank-value semantics, or performance measurement.'};
fs.mkdirSync('outputs/oltp-combined-performance-20260913',{recursive:true});
fs.writeFileSync('outputs/oltp-combined-performance-20260913/logic-validation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
