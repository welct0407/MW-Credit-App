import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='C:/GitHub/AppSheet-Loan-Project';
const out=`${root}/outputs/oltp-combined-performance-20260913`;
// Configuration transcribed from the current read-only AppSheet documentation DOM.
const eligible='SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], [Amount Remaining] > 0, IFS(IN([_THISROW].[Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto")), [Row ID] = [_THISROW].[Ref Target Charge], [_THISROW].[Allocation Method] = "Loan Close", [Ref Loans] = [_THISROW].[Ref Target Charge].[Ref Loans], IN([_THISROW].[Allocation Method], LIST("Receive All", "Lump Sum")), [Charge Date] <= [_THISROW].[Payment Date], TRUE, FALSE)))';
const amount='MAX(LIST(DECIMAL(0), MIN(LIST(DECIMAL([Amount Remaining Snapshot]), DECIMAL([Ref Payment].[Amount Received]) - DECIMAL(SUM(SELECT(Payment Allocations[Amount Remaining Snapshot], AND([Ref Payment] = [_THISROW].[Ref Payment], [Calculated Order] < [_THISROW].[Calculated Order]))))))))';
const predecessor='OR([Charge Date Snapshot] > [_THISROW].[Charge Date Snapshot], AND([Charge Date Snapshot] = [_THISROW].[Charge Date Snapshot], [Charge Row Number Snapshot] > [_THISROW].[Charge Row Number Snapshot]))';
const p01=`IF([Status] = "Posted", LIST(), ${eligible})`;
const p04=amount.replace('[Calculated Order] < [_THISROW].[Calculated Order]',predecessor);
const config={app:'LoanMgr Perf TEST 20260912',appId:'8a96763c-d453-450b-ac00-a8dfb7dbb8a4',database:'Money Perf TEST 20260912',databaseId:'aWCGib003O4AyK85Q4_KZc',rollbackVersion:'1.000038',currentVersion:'1.000044',scope:'Test only; UI only; API OFF; production untouched',configurationDiff:{source:'Current appdoc h3/h5 property-table DOM comparison, 1.000038 versus 1.000044',changedProperties:2,otherPropertyDifferences:0},definitions:[
 ['P01a','1.000044','Payments','Eligible Charges','List / Ref Charges','Combined candidate retained in test clone','Posted returns empty; other statuses retain original selection. Eligible Outstanding and Amount Received description become zero on Posted.',p01],
 ['P04a','1.000044','Payment Allocations','Calculated Amount','Price','Combined candidate retained in test clone','Direct date-descending / row-descending predecessor; snapshots, guards and posting sequence unchanged.',p04],
 ['Rollback','1.000038','Payments','Eligible Charges','List / Ref Charges','Original definition','Restore this expression to remove P01a.',eligible],
 ['Rollback','1.000038','Payment Allocations','Calculated Amount','Price','Original definition','Restore this expression to remove P04a.',amount],
 ['Diagnostic','1.000042 → 1.000044','Payments','Visible Allocations','List / Ref Payment Allocations','Temporary all-row display restored; outside timing runs','All plan rows including zero allocations inspected, then positive-only original restored.','SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocated Amount] > 0))'],
 ['Diagnostic','1.000043 → 1.000044','Borrowers','Receive All Charges','Action position','Temporary Prominent restored to Inline; outside timing runs','Normal receipt logic unchanged; new desktop UI exercised.','Inline']
]};
await fs.writeFile(`${out}/lab-config.json`,JSON.stringify(config,null,2)+'\n');
const lines=(await fs.readFile(`${out}/receipt-timings.csv`,'utf8')).trim().split(/\r?\n/);
const headers=lines.shift().split(',');
const timings=lines.map(l=>Object.fromEntries(l.split(',').map((v,i)=>[headers[i],v])));
assert.equal(timings.length,9);
const median=v=>{const a=[...v].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
const groups=Object.fromEntries([...new Set(timings.map(t=>t.group))].map(group=>{const r=timings.filter(t=>t.group===group);assert.equal(r.length,3);r.forEach(t=>assert.equal(t.outcome,'Posted'));const v=r.map(t=>Number(t.visible_posted_seconds));assert(v.every(Number.isFinite));return[group,{n:r.length,seconds:v,medianSeconds:median(v),minimum:Math.min(...v),maximum:Math.max(...v)}];}));
await fs.writeFile(`${out}/benchmark-summary.json`,JSON.stringify({metric:'New desktop GUI Save-to-visible-Posted, seconds; not server execution duration',groups,limitations:['Three repetitions per configuration; sequential before/candidate/reversal order; no statistical significance claim.','Poll intervals and network/client/server variation are included.','Saved app versions verified; client runtime version not independently displayed by new GUI.']},null,2)+'\n');
// These are manual transcriptions of observed new-GUI receipt and allocation rows, not API reads.
const cases=[
 ['SPLIT','dSpbefmz46WjiBBQdSJHBl','Lump Sum',94750,94700,50,6,1],
 ['FANOUT','o7hWBVMRPGdB5sKQsPJTWw','Lump Sum',100100,150,99950,6,3],
 ['SINGLE-PARTIAL','4PQUeKLrI39HkZlU1p4cbC','Single Partial',25,25,0,1,1],
 ['SINGLE-FULL','ivUKKrYXMjLVBBCHA3BsXI','Single Full',75,75,0,1,1],
 ['LOAN-CLOSE-1010','2EE4p2fRrTD6an9mPMpgs1','Loan Close',1010,10,1000,1,1],
 ['RECEIVE-ALL','fe9M3JMZy12HvDrFvlIy3n','Receive All',250,250,0,3,3],
 ['FIRST-DAY','LUwbO6Evv34AmXM1spWFRa','First-day Auto',20,20,0,1,1],
 ['LOAN-CLOSE-FUTURE','4qICOOXpDODGJrYLtvSBwW','Loan Close',2030,30,2000,2,2]
].map(([name,paymentId,method,received,interest,principal,planRows,repayments])=>({name,paymentId,method,received,interest,principal,planRows,repayments,status:'Posted',planned:received,posted:received,allocationDifference:0,postingDifference:0}));
cases.forEach(c=>assert.equal(c.interest+c.principal,c.received));
const added=cases.reduce((s,c)=>s+c.received,0)+900;
assert.equal(added,199160);
await fs.writeFile(`${out}/live-receipt-validation.json`,JSON.stringify({source:'Manual transcription of new desktop GUI receipt, snapshot-allocation and repayment observations on 2026-09-13; see report for fault-test chronology and coverage limits',benchmarkChecks:{receipts:9,amountEach:100,planRowsEach:6,repaymentsEach:1,principalEach:0,interestEach:100,allPosted:true,allDifferencesZero:true},cases,faultAndRecovery:{paymentId:'4PQUeKLrI39HkZlU1p4cbC',repaymentIdBeforeAndAfter:'5Jx1gJ-AGL4sQfl58MGKUe',injectedReceived:26,plannedAndPosted:25,retryOutcome:'Error',allocationDifference:1,postingDifference:1,displayedProcessedAt:false,repayments:1,restoredReceived:25,recoveryOutcome:'Posted',recoveredDifferences:[0,0],recoveredProcessedAtBangkok:'2026-09-13 09:37:34'},finalBorrowerUI:{borrower:'PERF-UI-SINGLE-001',loans:3,allLoansClosed:true,totalLoaned:103000,closedLoanPrincipal:103000,totalInterestEarned:100560,closedLoanInterestEarned:100560},expectedFixtureReconciliation:{historicalReceipts:44,newReceipts:17,totalReceipts:61,totalRepayments:66,received:203560,interest:100560,principal:103000},note:'Expected row counts independently sum the recorded starting fixture plus this round; not a separately exported aggregate database row count.'},null,2)+'\n');
console.log(JSON.stringify({groups,correctnessReceipts:cases.length,newReceiptAmount:added}));
