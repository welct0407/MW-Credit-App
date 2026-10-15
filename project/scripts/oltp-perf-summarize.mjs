// Summarize recorded UI evidence; never connects to AppSheet or submits transactions.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='C:/GitHub/AppSheet-Loan-Project';
const out=root+'/outputs/oltp-performance-lab-20260912';
async function readCsv(name){
  const lines=(await fs.readFile(out+'/'+name,'utf8')).trim().split(/\r?\n/);
  const headers=lines.shift().split(',');
  return lines.map((line,i)=>{const values=line.split(',');assert.equal(values.length,headers.length,`${name} row ${i+2}`);return Object.fromEntries(headers.map((h,j)=>[h,values[j]]));});
}
const median=xs=>{const s=[...xs].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const summarize=(rows,field)=>({n:rows.length,values:rows.map(r=>Number(r[field])),median:median(rows.map(r=>Number(r[field]))),min:Math.min(...rows.map(r=>Number(r[field]))),max:Math.max(...rows.map(r=>Number(r[field])))});
const receipts=await readCsv('receipt-timings.csv');
const syncs=await readCsv('sync-timings.csv');
const gui=await readCsv('new-gui-receipt-timings.csv');
assert.equal(receipts.length,31);assert.equal(syncs.length,20);assert.equal(gui.length,13);
for(const r of [...receipts,...syncs])assert(Number(r.server_seconds)>0);
for(const r of gui){assert(Number(r.posted_observed_seconds)>0);if(r.last_seen_processing_seconds)assert(Number(r.last_seen_processing_seconds)<Number(r.posted_observed_seconds));}
const groups=(rows,field)=>Object.fromEntries([...new Set(rows.map(r=>r.experiment))].map(k=>[k,summarize(rows.filter(r=>r.experiment===k),field)]));
const result={
  method:'Recorded browser-UI observations only; server Add, idle sync and Save-to-visible-Posted are distinct metrics.',
  serverAdd:groups(receipts,'server_seconds'),idleSync:groups(syncs,'server_seconds'),
  excludedServerAdd:receipts.filter(r=>r.experiment==='P01b-rejected').map(r=>({note:r.receipt_note,reason:'Receipt failed correctness; raw duration retained only, not a successful optimization benchmark.'})),
  newGui:groups(gui.filter(r=>r.included==='true'),'posted_observed_seconds'),
  excludedGui:gui.filter(r=>r.included!=='true').map(r=>({note:r.note,outcome:r.outcome,reason:r.reason})),
  finalAppVersion:'1.000038',productionChanged:false,
};
const change=(candidate,control)=>({seconds:candidate-control,percent:(candidate/control-1)*100});
result.comparisons={
  P01aVsInitial:change(result.serverAdd.P01a.median,result.serverAdd.Baseline.median),
  P01aVsReversal:change(result.serverAdd.P01a.median,result.serverAdd.Reversal.median),
  P04a:change(result.serverAdd.P04a.median,result.serverAdd['Fanout-baseline'].median),
  P03b:change(result.serverAdd.P03b.median,result.serverAdd['Reporting-control'].median),
  P09bVsControl:change(result.newGui.P09b.median,result.newGui['New-GUI control'].median),
  P09bVsReversal:change(result.newGui.P09b.median,result.newGui['New-GUI reversal'].median),
};
await fs.writeFile(out+'/benchmark-summary.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({verified:true,serverAddRows:receipts.length,idleSyncRows:syncs.length,newGuiRows:gui.length,validNewGuiRows:gui.filter(r=>r.included==='true').length,comparisons:result.comparisons},null,2));
