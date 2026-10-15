import fs from 'node:fs/promises';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
const dir='C:/GitHub/AppSheet-Loan-Project/outputs/universal-payments-production-20260906';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(dir+'/AppSheet_Data_Dictionary.before.xlsx'));
const version='3.000002';
const columns=wb.worksheets.getItem('Columns');
const existing=columns.getRange('A5:H1000').values.filter(r=>r[0]&&r[2]);
const clone=wb.worksheets.getItem('Payments Clone').getRange('A5:H58').values;
const orders={
 Payments:['_RowNumber','Row ID','Status','Ref Borrower','Amount Received','Payment Method','Allocation Method','Bank Reference','Notes','Created By','Payment Date','Created At','Processed At','Ref Target Charge','Related Payment Allocations','Related Repayments','Eligible Charges','Eligible Outstanding','Planned Allocation Amount','Posted Amount','Allocation Difference','Posting Difference','Visible Allocations'],
 'Payment Allocations':['_RowNumber','Row ID','Charge Date Snapshot','Ref Payment','Ref Charge','Charge Row Number Snapshot','Interest Remaining Snapshot','Principal Remaining Snapshot','Amount Remaining Snapshot','Allocation Order','Allocated Interest','Allocated Principal','Allocated Amount','Created At','Related Repayments','Calculated Order','Calculated Amount','Calculated Interest','Calculated Principal']
};
const additions=[];
const promoted=clone.map(r=>{
 const n=[...r];
 n[1]=orders[n[0]]?orders[n[0]].indexOf(n[2])+1:n[1];
 n[4]='OLTP only';
 n[5]=String(n[5]).replaceAll('other values/autocomplete false','other values false; autocomplete true');
 n[7]=String(n[7]).replaceAll('cloned database','production Money database').replaceAll('Stored clone column','Stored production column');
 if(n[0]==='Repayments'&&['Ref Payment','Ref Payment Allocation'].includes(n[2]))n[4]='OLTP; shared native field; not loaded in OLAP';
 return n;
});
for(const n of promoted){
 const i=existing.findIndex(r=>r[0]===n[0]&&r[2]===n[2]);
 if(i<0){additions.push(n);continue;}
 const old=existing[i],out=[...old];
 out[5]='OLTP: '+n[5]+'\nOLAP dated baseline: '+old[5];
 out[6]=n[6];
 out[7]='OLTP deployed '+version+': '+n[7]+'\nOLAP dated baseline (unchanged): '+old[7];
 existing[i]=out;
 columns.getRange(`A${i+5}:H${i+5}`).values=[out];
 columns.getRange(`A${i+5}:H${i+5}`).format.rowHeight=150;
 columns.getRange(`A${i+5}:H${i+5}`).format.wrapText=true;
}
columns.tables.items[0].rows.add(null,additions);
// The imported table ends at row320, but two existing OLAP definitions occupy321:322.
// Extend to the full inventory before rewriting so appending cannot overwrite them.
columns.tables.items[0].rows.add(null,[[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null]]);
const addedStart=existing.length+5,addedEnd=addedStart+additions.length-1;
columns.getRange(`A5:H${addedEnd}`).values=[...existing,...additions];
columns.getRange(`A${addedStart}:H${addedEnd}`).format.font={name:'Calibri',size:11};
columns.getRange(`A${addedStart}:H${addedEnd}`).format.wrapText=true;
columns.getRange(`A${addedStart}:H${addedEnd}`).format.rowHeight=130;
columns.getRange('A2').values=[[`OLTP universal payments deployed ${version}, 6 September 2026. 54 changed definitions promoted from accepted clone; existing OLAP definitions retained. OLAP v1.100012 loads its prior Repayments schema and shows a non-blocking source-schema warning; new trace fields are not loaded there.`]];
columns.getRange('A2:H2').format.rowHeight=42;
columns.getRange('B4').values=[['Inventory order']];
const repaymentOrder=['_RowNumber','Row ID','Payment Date','Principal Paid','Interest Paid','Notes','Ref Loans','Ref Charges','Created By','Ref Payment','Ref Payment Allocation','Borrower Name','Principal Returned Days MTD','Borrower Name TE','Amount Received','Payment Amount Today'];
const allColumns=columns.getRange(`A5:H${addedEnd}`).values;
for(let i=0;i<allColumns.length;i++){
 const r=allColumns[i];
 if(r[0]==='Repayments'&&repaymentOrder.includes(r[2]))columns.getRange(`F${i+5}`).values=[[r[5]+'; production OLTP order '+(repaymentOrder.indexOf(r[2])+1)]];
}

const tables=wb.worksheets.getItem('Tables');
const tr=tables.getRange('A5:G30').values.filter(r=>r[0]);
for(let i=0;i<tr.length;i++){
 const r=[...tr[i]];
 if(r[0]==='Borrowers')r[4]=26;
 if(r[0]==='Charges')r[4]=18;
 if(r[0]==='Repayments'){r[3]=11;r[6]+=' Two optional native payment trace References loaded in OLTP. OLAP still loads nine physical columns plus thirteen VCs; schema reconciliation pending.';}
 tables.getRange(`A${i+5}:G${i+5}`).values=[r];
}
tables.tables.items[0].rows.add(null,[
 ['Payments','Money database','OLTP only',14,9,0,'One received payment. Processing/Posted/Error state, method, borrower, planned/posted totals and retry. OLAP does not load this table.'],
 ['Payment Allocations','Money database','OLTP only',14,5,0,'Frozen eligible-charge snapshots and interest/principal allocations; generated Repayments preserve existing reporting grain. OLAP does not load this table.']
]);
tables.getRange('A2').values=[['Twelve native tables, eight loaded by OLTP. New payment tables are OLTP-only; physical counts include system source ordinal. Existing OLAP inventory retains its dated reconciliation.']];
tables.getRange('A2:G2').format.rowHeight=36;
tables.getRange('A13:G13').format.rowHeight=65;
tables.getRange('A13:G13').format.wrapText=true;
tables.getRange(`A${tr.length+5}:G${tr.length+6}`).format.rowHeight=65;
tables.getRange(`A${tr.length+5}:G${tr.length+6}`).format.wrapText=true;

const rel=wb.worksheets.getItem('Relationships');
rel.tables.items[0].rows.add(null,[
 ['Payments','Ref Borrower','Borrowers','Borrowers 1 -> many Payments','OLTP part of parent; required; native Reference'],
 ['Payments','Ref Target Charge','Charges','Charges 1 -> many Payments','OLTP independent; conditionally required; native Reference'],
 ['Payment Allocations','Ref Payment','Payments','Payments 1 -> many Payment Allocations','OLTP part of parent; required; native Reference'],
 ['Payment Allocations','Ref Charge','Charges','Charges 1 -> many Payment Allocations','OLTP independent; required; native Reference'],
 ['Repayments','Ref Payment','Payments','Payments 1 -> many Repayments','OLTP independent; optional historical/default trace; native Reference; not loaded in OLAP'],
 ['Repayments','Ref Payment Allocation','Payment Allocations','Payment Allocations 1 -> many Repayments','OLTP independent; optional historical/default trace; native Reference; not loaded in OLAP']
]);
rel.getRange('A2').values=[['Six payment References added in production on 6 September 2026. Borrower -> Loan -> Charge -> Repayment ownership retained; Borrower -> Payment -> Allocation branch added. New IsPartOf settings are OLTP-specific.']];
rel.getRange('A2:E2').format.rowHeight=42;
rel.getRange('A13:E18').format.wrapText=true;rel.getRange('A13:E18').format.rowHeight=58;

const slices=JSON.parse(await fs.readFile('C:/GitHub/AppSheet-Loan-Project/outputs/universal-payments-20260905/clone_slices_checkpoint065.json','utf8'));
const sl=wb.worksheets.getItem('Slices'),sv=sl.getRange('A5:H40').values.filter(r=>r[0]);
for(let i=0;i<sv.length;i++)if(sv[i][0]==='OLTP'){
 const s=slices.find(s=>s.name===sv[i][1]);if(!s)throw Error('Unknown slice');
 const r=[...sv[i]];r[3]=s.filter;r[4]=s.updates;r[5]=s.columns.length;r[7]='Production '+version+'; exact ordered membership reconciled to accepted clone. Auto-assigned actions.';
 sl.getRange(`A${i+5}:H${i+5}`).values=[r];
}
sl.getRange('A2').values=[['OLTP Visible Borrowers33 and Todays Collection Board12 fields reconciled at production cutover. Existing OLAP slices retained without schema regeneration.']];
sl.getRange('A5:H6').format.rowHeight=55;
sl.getRange('A5:H6').format.wrapText=true;
const sc=wb.worksheets.getItem('Slice Columns'),sr=sc.getRange('A5:D2000').values.filter(r=>r[0]);
const newSr=[...slices.flatMap(s=>s.columns.map((c,i)=>['OLTP',s.name,i+1,c])),...sr.filter(r=>r[0]!=='OLTP')];
if(newSr.length>sr.length)sc.tables.items[0].rows.add(null,newSr.slice(sr.length));
sc.getRange(`A5:D${newSr.length+4}`).values=newSr;
sc.getRange('A2').values=[['Exact ordered production OLTP membership: 45 rows across two slices. Existing OLAP membership retained.']];

const av=wb.worksheets.getItem('App Variances');
const avRows=av.getRange('A5:F1000').values.filter(r=>r[0]);
const avAdds=[['Table','Payments','Payments','Yes','No','Production universal receipt engine; OLTP only.'],['Table','Payment Allocations','Payment Allocations','Yes','No','Production snapshots and allocation processing; OLTP only.']];
for(const r of additions)if(!orders[r[0]])avAdds.push(['Column',r[0],r[2],'Yes','No',r[4].includes('shared native')?'Shared native Reference exists, but OLAP has not loaded/regenerated the trace fields.':'New OLTP reverse-reference VC.']);
av.tables.items[0].rows.add(null,avAdds);
av.getRange(`A${avRows.length+5}:F${avRows.length+4+avAdds.length}`).format.wrapText=true;
av.getRange(`A${avRows.length+5}:F${avRows.length+4+avAdds.length}`).format.rowHeight=55;
av.getRange('A2').values=[['Universal payment tables and trace VCs are OLTP-only. OLAP v1.100012 retains its earlier loaded schema; live client and governed recent snapshots were checked after synthetic cleanup.']];

const readme=wb.worksheets.getItem('README');
readme.getRange('B5').values=[['Universal payments reconciled to production OLTP v3.000002 on 2026-09-06: 187 column definitions and 133 documented behavior/view objects compared with the accepted clone. Synthetic production validation and cleanup passed. OLAP v1.100012 retains its earlier loaded schema; new Repayments trace fields remain pending schema reconciliation.']];
readme.getRange('B6').values=[['OLTP v3.000002 — Loan Manager ผู้จัดการสินเชื่อ — 93844270-6aa5-420b-a960-bcdf08abd357; rollback v2.300005. OLAP v1.100012 — Loan Business Insights — e74dd368-654f-44d7-bccf-83cf361d1cdb; inspected without changing app configuration.']];
readme.getRange('A5:F6').format.rowHeight=80;
readme.getRange('A5:F6').format.wrapText=true;
const noteRows=[
 ['Production payments',`Deployed OLTP ${version}; original app93844270-6aa5-420b-a960-bcdf08abd357, original Money database9Y5vh3TFzZ4sIe2JgNh4l0. 187 column definitions and133 behavior/view objects matched accepted clone.`],
 ['Rollback','App v2.300005; full backup app243eb391-5f6d-4720-a7e2-f0dc67151e78 with databaseSAYscSVuS847EarNTaAiwc. Copied Row IDs differ; retain backup pair. App restoration does not restore physical data.'],
 ['Production verification','Synthetic first-day10, overpayment rejection21/20, lump sum15 and closure105 passed; receipt/plan/post totals reconciled. Borrower cascade removed fixtures; ten operational KPI amounts returned to baseline. Notifications suppressed for tests and restored afterward.'],
 ['Reporting boundary','OLAP v1.100012 loads prior schema with non-blocking Repayments source warning. New payment trace fields not loaded. Existing recent-snapshot refresh rerun after cleanup; no reporting formula changes. Offline/concurrent/role/mobile and notification delivery remain manual checks.'],
 ['Authoritative change history','Change Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_PRODUCTION_2026-09-06.md. Clone sheets remain historical evidence. Inventory order retains the older union sequence; the two new tables use production order, and Repayments flags state current OLTP order. Columns, Tables, Relationships and Slices record the migrated model.']
];
for(let i=0;i<noteRows.length;i++){let r=32+i;readme.getRange(`A${r}:B${r}`).values=[noteRows[i]];readme.getRange(`B${r}:F${r}`).merge();readme.getRange(`A${r}:F${r}`).format.wrapText=true;readme.getRange(`A${r}:F${r}`).format.rowHeight=66;readme.getRange(`A${r}`).format.font.bold=true;}
for(const [name,range,file] of [['Columns',`A${addedStart}:H${addedStart+3}`,'production-columns.png'],['Tables','A5:G17','production-tables.png'],['Relationships','A12:E18','production-refs.png'],['Slices','A1:H7','production-slices.png'],['Slice Columns','A32:D49','production-membership.png'],['App Variances',`A${avRows.length+5}:F${avRows.length+4+avAdds.length}`,'production-variances.png'],['README','A32:F36','production-readme.png']]){
 const img=await wb.render({sheetName:name,range,scale:1,format:'png'});await fs.writeFile(dir+'/'+file,new Uint8Array(await img.arrayBuffer()));
}
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!',options:{useRegex:true,maxResults:10},summary:'Dictionary expression-as-text check'})).ndjson);
await (await SpreadsheetFile.exportXlsx(wb)).save(dir+'/AppSheet_Data_Dictionary.xlsx');
await fs.writeFile(dir+'/dictionary_update_summary.json',JSON.stringify({version,promotedDefinitions:promoted.length,addedUnionColumns:additions.length,totalUnionColumns:existing.length+additions.length,oltpSliceRows:45,addedRelationships:6},null,2));
console.log(JSON.stringify({version,promotedDefinitions:promoted.length,addedUnionColumns:additions.length,oltpSliceRows:45}));
