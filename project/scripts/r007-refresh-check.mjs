import fs from 'node:fs/promises';
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project';
const p=`${root}/r007-20260918`;
const full=JSON.parse(await fs.readFile(`${p}/refresh-full.json`,'utf8'));
const expenses=JSON.parse(await fs.readFile(`${p}/after/Business Expenses.json`,'utf8'));
const num=v=>Number(String(v??0).replace(/[^0-9.\-]/g,''));
const iso=v=>{if(/^\d{4}-/.test(v))return v.slice(0,10);const[m,d,y]=v.split('/');return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`};
let checks=0;for(const r of full.snapshots){
 const daily=expenses.filter(e=>iso(e['Expense Date'])===r['Snapshot Date']).reduce((s,e)=>s+num(e.Amount),0);
 const cumulative=expenses.filter(e=>iso(e['Expense Date'])<=r['Snapshot Date']).reduce((s,e)=>s+num(e.Amount),0);
 for(const [k,expected] of [['Business Expenses',daily],['Net Profit',num(r['Interest Received'])-daily],['Net Unsettled Profit EOD',num(r['Unsettled Profit EOD'])-cumulative]]){if(num(r[k])!==expected)throw Error(`Snapshot ${k} mismatch`);checks++;}
}
const recent=full.snapshots.filter(r=>r['Snapshot Date']>='2026-08-20');
const peak=Math.max(...recent.map(r=>num(r['Outstanding Principal EOD'])));
if(num(full.portfolio[0]['Peak Cash Pool 30D'])!==peak)throw Error('Peak mismatch after full refresh');
const key=(await fs.readFile(`${root}/postgresql-migration-trial-20260914/appsheet-trial-api-key.txt`,'utf8')).trim();
const response=await fetch('https://www.appsheet.com/api/v2/apps/494cd013-0d9b-482f-9559-c9d83059de91/tables/Statistics/Action',{method:'POST',headers:{'Content-Type':'application/json',ApplicationAccessKey:key},body:JSON.stringify({Action:'Find',Properties:{Locale:'en-US',Timezone:'Asia/Bangkok'},Rows:[]}),signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error(`Statistics read HTTP ${response.status}`);
const actual=await response.json();await fs.writeFile(`${p}/statistics-post-refresh.json`,JSON.stringify(actual));
const contract=JSON.parse(await fs.readFile('outputs/r007-20260918/before-contract.json','utf8'));
let matched=0;for(const c of contract.columns.Statistics.filter(c=>c.r007Move)){
 const k=c['Column name'];const a=actual[0][k],b=full.portfolio[0][k];let ok;
 if(c.Type==='Date')ok=iso(a)===iso(b);else if(['Number','Decimal','Price','Percent'].includes(c.Type))ok=Math.abs(num(a)/(String(a).includes('%')?100:1)-num(b))<0.000001;else ok=a===b;
 if(!ok)throw Error(`Post-refresh Statistics mismatch: ${k}`);matched++;
}
const result={release:'R007',snapshotExpenseAndNetChecks:checks,mismatches:0,postRefreshStatisticsFieldsMatched:matched,peakMatchesRefreshedSnapshots:true,source:'Current AppSheet Find after GUI Full refresh versus independently captured SQL Portfolio Summary; 45 historical snapshots versus captured base expenses'};
await fs.writeFile('outputs/r007-20260918/post-refresh-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
