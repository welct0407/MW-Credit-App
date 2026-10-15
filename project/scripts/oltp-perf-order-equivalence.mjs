// Correctness check for the P04a ordering predicate, not an AppSheet benchmark.
import assert from 'node:assert/strict';
const rows = [
  {payment:'A',date:'2026-09-12',row:690,remaining:198100},
  ...[691,692,693,694,695].map(row=>({payment:'A',date:'2026-09-11',row,remaining:100})),
  {payment:'B',date:'2026-09-13',row:696,remaining:500},
  {payment:'A',date:'2026-09-11',row:695,remaining:25}, // equal ordering tuple
];
const precedes=(a,b)=>a.date>b.date || (a.date===b.date && a.row>b.row);
const order=a=>1+rows.filter(b=>b.payment===a.payment && precedes(b,a)).length;
let checks=0;
for(const a of rows) for(const b of rows) {
  if(a.payment!==b.payment) continue;
  assert.equal(order(b)<order(a),precedes(b,a)); checks++;
}
for(const receiptAmount of [0,1,100,198099,198100,198101,198600,200000]) {
  for(const a of rows) {
    const oldPrior=rows.filter(b=>b.payment===a.payment&&order(b)<order(a)).reduce((n,b)=>n+b.remaining,0);
    const newPrior=rows.filter(b=>b.payment===a.payment&&precedes(b,a)).reduce((n,b)=>n+b.remaining,0);
    assert.equal(Math.max(0,Math.min(a.remaining,receiptAmount-oldPrior)),Math.max(0,Math.min(a.remaining,receiptAmount-newPrior)));
    checks++;
  }
}
console.log(JSON.stringify({checks,passed:true,scope:'Predicate equivalence for valid snapshot dates and row numbers; not live AppSheet timing or concurrency verification.'}));
