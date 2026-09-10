import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='C:/GitHub/AppSheet-Loan-Project/outputs/future-charges-20260908';
const loans=[
 ['U3m11IqGZgSWWXFDfBe2lx','2026-08-05',3000,300,'ส่งวันละ 300'],
 ['lP65EUwnXREsCeQowLfD2k','2026-08-06',3000,270,'ส่งวันละ 270'],
 ['XMcxLRW3cmt3pQJiDXXlSE','2026-08-07',6000,540,'ส่งวันละ 540'],
 ['IlH1gSqUoWTd2E066ATwdj','2026-08-15',4000,360,'4,000 หักโอน 250 หักส่ง 360'],
 ['AmQrdiWU0DbMZaFaKTqI58','2026-08-16',4000,360,'หักโอน 250 หักส่งรายวัน 360'],
 ['kYgqLDe5Z4t91ebbfEpTzy','2026-08-20',7000,700,'หักโอน 500 ส่งรายวัน 700'],
 ['EJEFbkpbDUHIzsLlRFIC1Y','2026-08-25',3000,270,'ส่งวันละ270'],
 ['I05twbYdvlHsv6fq9ES00w','2026-08-25',1000,100,'']
].map(([id,date,principal,dailyInterest,arrangement])=>({id,date,principal,dailyInterest,arrangement}));
const oldIds=[
 ['-ldYRh_pJg4tA3aqupbXA0','YmmD5ZQk4e4wE3Y9hzMxf6','EgNSFlnaaP4MqZ2CxsRs96','UyTeTa67Om4i2HODtwgobd','_N927v8AXc4JeunBTL5Mp6','4sb6-2EWUK4ei_ZzpRNl62','Mh_odbZyhx4i6RwNuG7En1','_cmQgQ0aTN4taKCnq1BeC6'],
 ['67Po7TBiqp4cEc7jtvaC-8','Xdm_k9ef3Y43AHDzM_zEo7','dWJUT-1kET4fmGGTxTVvSb','2SAg05gzas4kytxywZgDc0','CFmvT4qPHL4eIU3BtbWCP1','yxFZyHf6So4M6rTW11vhWe','ddj1LEqYFn4GqW5_2i26De','b_DJf6bfzh42E2QQuyM5p3'],
 ['kBbx54SLh84wqyMe0yS9N9','uqlppoMLC94HQI7ccWZYq8','yv0sDOESGS4_q0GJwow2Se','yL61KEDYha4W2sk8bX-xQ3','RtHOQScQSJ4Z6ywUSsW2w7','rVT184LEWh4_MgMKHiNjAd','Zh_Nwrpfl74BUZocDq4y-d','5F-RkzypOp43Egpmmqzs3f']
];
const original=oldIds.flatMap((ids,d)=>ids.map((id,i)=>({id,loan:loans[i].id,date:['2026-08-28','2026-09-07','2026-09-08'][d],principal:0,interest:loans[i].dailyInterest,notes:''})));
const sum=a=>a.reduce((s,x)=>s+x,0);
function prorata(total,weights){const base=weights.map(x=>Math.floor(total*x/sum(weights)));const order=weights.map((x,i)=>({i,f:total*x/sum(weights)-base[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);for(let n=total-sum(base),i=0;i<n;i++)base[order[i].i]++;return base;}
const extra=prorata(6300,loans.map(l=>l.principal));
loans.forEach((l,i)=>{l.existingInterest=3*l.dailyInterest;l.additionalProfit=extra[i];l.fixedProfit=l.existingInterest+l.additionalProfit;});
const dates=['2026-09-10','2026-09-13','2026-09-16','2026-09-19','2026-09-22','2026-09-25','2026-09-28','2026-10-01','2026-10-04'];
let remaining=loans.flatMap(l=>[l.principal,l.fixedProfit]);const plan=[];
for(let d=0;d<dates.length;d++){
 const total=d===8?6000:5000,allocation=prorata(total,remaining);
 for(let i=0;i<loans.length;i++){
  const old=d<3?original[d*8+i]:null;
  plan.push({id:old?.id||null,loan:loans[i].id,date:dates[d],principal:allocation[i*2],interest:allocation[i*2+1],notes:'RP20260908 fixed repayment plan; no daily interest from 2026-09-08. '+(old?'Rescheduled original charge '+old.date+' P0 I'+old.interest+'. ':'')+'Installment '+(d+1)+'/9; proportional principal/fixed profit; whole-baht rounding. Fixed profit includes carried interest and agreed additional profit.'});
 }
 remaining=remaining.map((x,i)=>x-allocation[i]);
}
assert.equal(sum(original.map(r=>r.interest)),8700);assert.equal(sum(loans.map(l=>l.principal)),31000);assert.equal(sum(extra),6300);assert.equal(plan.length,72);assert.equal(new Set(original.map(r=>r.id)).size,24);assert(remaining.every(x=>x===0));
for(const [d,date]of dates.entries())assert.equal(sum(plan.filter(r=>r.date===date).map(r=>r.principal+r.interest)),d===8?6000:5000);
for(const l of loans){assert.equal(sum(plan.filter(r=>r.loan===l.id).map(r=>r.principal)),l.principal);assert.equal(sum(plan.filter(r=>r.loan===l.id).map(r=>r.interest)),l.fixedProfit);}
assert(plan.every(r=>r.principal>=0&&r.interest>=0&&Number.isInteger(r.principal+r.interest)));
const summary=dates.map(date=>({date,principal:sum(plan.filter(r=>r.date===date).map(r=>r.principal)),profit:sum(plan.filter(r=>r.date===date).map(r=>r.interest)),payment:sum(plan.filter(r=>r.date===date).map(r=>r.principal+r.interest))}));
await fs.writeFile(dir+'/repayment-plan.json',JSON.stringify({status:'Prepared; not written to production',borrower:'uWRbJLJ0ajng2IE3FNlXT4',loans,original,plan,summary},null,2));
await fs.writeFile(dir+'/repayment-plan-review.md','# Fixed repayment plan — 8 September 2026\n\nUser-approved proportional splits. Prepared only; no financial writes yet. Existing 24 unpaid rows are intended to retain their keys and loan references; 48 new rows complete the schedule. Native source references were verified through Get link to linked row for all 24 original charges.\n\n| Due date | Principal | Fixed profit | Payment |\n|---|---:|---:|---:|\n'+summary.map(r=>`| ${r.date} | ${r.principal} | ${r.profit} | ${r.payment} |`).join('\n')+'\n| Total | 31000 | 15000 | 46000 |\n\nAdditional profit is allocated across loans by principal using largest-remainder whole-baht rounding. Each installment allocates proportionally across remaining principal and fixed-profit balances; the final installment clears rounding residuals. Original unpaid dates are August 28, September 7 and September 8, not three consecutive days. Existing Notes cells appeared blank in the source grid. Each rescheduled row records its original date and amounts.\n');
console.log(JSON.stringify({summary,loanComponents:loans.map(l=>({loan:l.id,principal:l.principal,existingInterest:l.existingInterest,additionalProfit:l.additionalProfit})),checks:'All date, loan, component, whole-baht and key uniqueness checks passed'}));
