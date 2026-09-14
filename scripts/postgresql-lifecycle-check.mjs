import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/postgresql-migration-trial-20260914';
const data=JSON.parse(await fs.readFile(`${out}/tommy-f1-final.json`,'utf8'));
const money=v=>Number(String(v??0).replace(/[$,]/g,''));
const sum=(rows,col)=>rows.reduce((n,r)=>n+money(r[col]),0);
const results=[];
for(const [tag,principal,interest] of [['PG-TOMMY-D1 synthetic daily-interest lifecycle',1000,110],['PG-TOMMY-I1 installment 3 days interval 2',1000,210],['PG-TOMMY-F1 fixed-date maturity',1000,100]]){
 const loan=data.Loans.find(l=>l['Loan Arrangement']===tag);assert.ok(loan);
 const charges=data.Charges.filter(c=>c['Ref Loans']===loan['Row ID']);
 const ids=new Set(charges.map(c=>c['Row ID']));
 const allocations=data.Allocations.filter(a=>ids.has(a['Ref Charge']));
 assert.equal(sum(allocations,'Allocated Principal'),principal);
 assert.equal(sum(allocations,'Allocated Interest'),interest);
 assert.equal(sum(allocations,'Allocated Amount'),principal+interest);
 assert.equal(loan['Loan Status'],'ปิดยอดแล้ว');
 assert.equal(loan['Borrower Name'],'Tommy');
 for(const charge of charges){
  const paid=allocations.filter(a=>a['Ref Charge']===charge['Row ID']);
  assert.equal(sum(paid,'Allocated Principal'),money(charge['Principal Due']));
  assert.equal(sum(paid,'Allocated Interest'),money(charge['Interest Due']));
 }
 results.push({tag,principal,interest,receipts:allocations.length,status:'PASS'});
}
for(const p of data.Payments){
 assert.equal(p.Status,'Posted');
 const a=data.Allocations.filter(a=>a['Ref Payment']===p['Row ID']);
 assert.equal(sum(a,'Allocated Amount'),money(p['Amount Received']));
 for(const allocation of a){
  const repayments=data.Repayments.filter(r=>r['Ref Payment Allocation']===allocation['Row ID']);
  assert.equal(repayments.length,1,'Exactly one repayment per allocation');
 }
}
for(const rows of Object.values(data))assert.equal(new Set(rows.map(r=>r['Row ID'])).size,rows.length,'Unique keys');
await fs.writeFile(`${out}/lifecycle-reconciliation.json`,JSON.stringify({snapshot:'tommy-f1-final.json',results,postedReceipts:data.Payments.length,allocationRepaymentPairs:data.Allocations.length,status:'PASS',limitations:'Three lifecycle scenarios only; broader readiness checks remain pending.'},null,2));
console.log(JSON.stringify(results));
