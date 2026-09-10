import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='C:/GitHub/AppSheet-Loan-Project/outputs/future-charges-20260908';
const manifest=JSON.parse(await fs.readFile(dir+'/repayment-plan.json','utf8'));
const ids=[
'jE25NnRlRP4WirKgxVuz51','RmqX3CxYtG4UM0GkvfTs7a','AgwtI3G44g44uGmQ9xpfpd','y8aAFoizcL4hmQ27eEpaU3','rRpQ0XUcmc4xUd65anHXq3','rLcyaWIsxC4Auete4tF2N4','LWdyocq_qq4BMIYJHq1MY6','QNt9nnmibj42q0sHrCNRz4',
'J1SIdolVw14rIMhjYZ4Je7','CbaAmXIk8X41i8hCZsRcsd','fsx-y8GC6748qFR47n7Ty6','vobx3YKj2P4m6SZuVnasc7','tNNgQ8YWld4CuQP0FiaVzb','Tt7aLHRMd04mmoZpMUCh07','C3nvGtgqkQ45UhU5oTA0jc','Fg3y2RnhWB4yAZ-1XR0m6f',
'VDeWYYOZ5j4XyHqFFgKSZa','tW_-9RzYU84ge0aTX1lAYd','KXMFhkM7yG4vMBtpmyXns0','bdNkXWtXDo4ZYj-ltHSKq6','U6CtZc6cF-4lyoyOu2QAu2','TRQj5BSgas4lA52dydJxu3','foIbJfVNEs4Oi1KpTlEvV6','77r-RrZFFu4gUqmx8N5y-1',
'AYasDga2114JUsiR-tLxI1','zwgB3zB1V94mI5NTE_Zl-9','zvIi6mHDvO4muWNzMtUhve','n4qOcwTVyc4ymJuLtVQcd0','dTycoyj4TX4fuHG19RGCua','8QXBr6YN0B4danH0sKwnc3','2cRhbLfxjx4sy_fuivPCt1','HORaunT2Cm4-mljET5SLR1',
'69GoAXU6D245q-NpIiBDfc','tbG_ivcoCo46MbIp0Ipyc5','DuGWuxoBTQ4vAu-5hSkJpf','Pw-R4bAThz4VyQUB86kE_1','U7TH1RbdOD4KaR02dovoCb','R2hOUDZoKf416sH2hESxc4','Kef4vpzQ_S4c2EkWrjr-U4','lL7Uv6Nkcc4-UoscqsoHbb',
'JdhwiJicsp4uiiEXp1Gm82','EbvS_gs2Sc47e6I6WuhtQ7','0IVe6Vt-j94XmIgM3ot6ad','7nYmuBdvKv4Kqo-EbEKsj6','sTIY1qeb6U4ve4PaNykp24','sW3uf40G_54jMynPhYG0q0','P9ZkjXIa474OE_16Fyoz8d','VOfUW013ee4R6wBKBojXwf'];
assert.equal(ids.length,48);manifest.plan.slice(24).forEach((r,i)=>r.id=ids[i]);assert.equal(new Set(manifest.plan.map(r=>r.id)).size,72);
manifest.status='Written to original native database; 72 saved dates, principal, interest and audit notes reconciled. Manual payment/bot acceptance pending.';
manifest.verification={date:'2026-09-08',source:'Native Money database and synced OLTP runtime',rows:72,retainedKeys:24,newKeys:48,principal:31000,fixedProfit:15000,total:46000,puifaiDueToday:0,dailyInterestRates:'All eight zero',kpi:{repaymentRowsToday:12,cashReceivedToday:3380,principalRepaidToday:294,profitToday:3086,pendingToday:14900,additionalReceiptsDuringWork:2140,additionalRepaymentRows:7,additionalRowsBelongToOtherLoans:true}};
await fs.writeFile(dir+'/repayment-plan.json',JSON.stringify(manifest,null,2));
let review=await fs.readFile(dir+'/repayment-plan-review.md','utf8');review=review.replace('Prepared only; no financial writes yet. Existing 24 unpaid rows are intended to retain their keys and loan references; 48 new rows complete the schedule.','Entered and verified in the original native database. The 24 unpaid rows retain their keys and loan references; 48 new rows complete the schedule. Eight daily-interest values are zero. Payment/bot manual acceptance remains pending.');
review+='\nNative verification: all 72 saved dates, principal values, interest values and Notes match the plan. Total 46,000, including carried interest 8,700 exactly once. After sync, Puifai has no charges due today. Later same-day receipts from other borrowers brought total cash received to 3,380, principal to 294 and profit to 3,086. Pending 14,900 = original 25,740 - rescheduled 8,700 - newly received 2,140.\n';
await fs.writeFile(dir+'/repayment-plan-review.md',review);
// Independent business scenarios; these do not execute AppSheet or live transactions.
const sum=(a,fn=x=>x)=>a.reduce((s,x)=>s+fn(x),0),today='2026-09-08';
const eligible=(rows,method,date,target)=>rows.filter(r=>r.remaining>0&&(method==='Single Full'||method==='Single Partial'?r.id===target:r.date<=date));
const synthetic=[{id:'old',date:'2026-09-07',remaining:200},{id:'today',date:today,remaining:100},{id:'future',date:'2026-09-10',remaining:5000}];
assert.equal(sum(eligible(synthetic,'Receive All',today),r=>r.remaining),300);
assert.equal(sum(eligible(synthetic,'Lump Sum',today),r=>r.remaining),300);
assert.equal(sum(eligible(synthetic,'Single Full',today,'future'),r=>r.remaining),5000);
assert.equal(sum(eligible(synthetic,'Single Partial',today,'future'),r=>r.remaining),5000);
assert.equal(sum(manifest.plan.filter(r=>r.date<=today),r=>r.principal+r.interest),0);
assert.equal(sum(manifest.plan.filter(r=>r.date>'2026-09-08'&&r.date<='2026-09-30'),r=>r.interest),11413);
assert.equal(sum(manifest.plan.filter(r=>r.date>'2026-09-30'),r=>r.interest),3587);
const canGenerate=(rate,accrued)=>rate>0&&accrued>0;
assert.equal(canGenerate(0,0),false);assert.equal(canGenerate(300,300),true);assert.equal(canGenerate(300,0),false);
const canClose=(principal,balances)=>principal<=0&&!balances.some(x=>x>0);
assert.equal(canClose(0,[100]),false);assert.equal(canClose(0,[0]),true);
assert.equal(3380-294,3086);assert.equal(25740-8700-2140,14900);
await fs.writeFile(dir+'/scenario-checks.md','# Verification — 8 September 2026\n\nPassed independent local business scenarios: due-only Receive All/Lump Sum; individual future Full/Partial eligibility; no plan charges due September 8; September/October fixed profit split 11,413/3,587; zero-rate generator exclusion with positive-rate control; no closure with interest remaining; current repayment and pending KPI arithmetic. These are independent model checks, not AppSheet execution tests.\n\nLive read-back: 72 native rows match all planned date/principal/interest/note values. Exact key population has 24 retained and 48 new keys. No extra RP20260908 rows observed. Original and new loan reference checks were performed through the native UI. Manual tests of receipt allocation, retry, permission, rollover and scheduled-bot execution remain outstanding.\n');
console.log({rows:72,keys:new Set(manifest.plan.map(r=>r.id)).size,scenarioChecks:'passed',principal:sum(manifest.plan,r=>r.principal),profit:sum(manifest.plan,r=>r.interest)});
