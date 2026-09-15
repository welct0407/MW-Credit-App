import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/core-payment-20260915';
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([n,r])=>[n,{head:r[0],rows:r.length,sample:['Guide','DB Logic','Dev Differences'].includes(n)?r.slice(-8):[]}]))));
 const p=await wb.render({sheetName:'Dev Differences',range:'A1:F4',scale:1,format:'png'});await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));
 process.exit(0);
}
await fs.copyFile(file,'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/core-payment-20260915/dictionary-before.xlsx',1).catch(e=>{if(e.code!=='EEXIST')throw e;});
if(before.Guide.some(r=>r[0]==='Development core payment'))throw Error('Core payment dictionary update already applied; do not duplicate its rows');
const changes=[];
function edit(name,i,row){wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length).values=[row.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v??'')];changes.push({sheet:name,row:i+1,values:row.map(v=>v??'')});}
function append(name,row){const i=before[name].length+changes.filter(c=>c.sheet===name&&c.row>before[name].length).length;const r=wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length);r.copyFrom(wb.worksheets.getItem(name).getRangeByIndexes(before[name].length-1,0,1,row.length),'all');edit(name,i,row);r.format.wrapText=true;r.format.verticalAlignment='top';r.format.rowHeight=100;}
for(const app of ['OLTP','OLAP']){
 for(const [k,v] of Object.entries({Type:'Ref',ReferencedTableName:'Payments',ReferencedKeyColumn:'Row ID',IsAPartOf:'false',Virtual:'No',Key:'No',Label:'No','Read-Only':'Yes',Hidden:'No','Visible?':'ALWAYS','Display name':'="รายการรับชำระที่ปิดยอด / Closing Payment"','Initial value':'Blank','App formula':'Blank','Required_If':'Blank (nullable)','Editable_If':'Blank; column Read-Only Yes','System Defined?':'No','Reset on edit?':'No',Searchable:'Yes',LocaleName:'en-US'}))append('Dev Differences',[app,'Loans.Ref Closing Payment',k,'Absent',v]);
 for(const [k,v] of Object.entries({Type:'List of Ref to Loans.Row ID',Virtual:'Yes','App formula':'REF_ROWS("Loans", "Ref Closing Payment")','Read-Only':'Yes',Key:'No',Label:'No',IsAPartOf:'false','System Defined?':'Yes',Hidden:'No','Display name':'Blank (default Related Loans)'}))append('Dev Differences',[app,'Payments.Related Loans',k,'Absent',v]);
 append('Dev Differences',[app,'View Ref (Ref Closing Payment)','Navigation','Absent','Generated inline Ref navigation to Payments; existing manually ordered loan details/forms unchanged']);
}
append('Dev Differences',['OLAP','Reporting Loans','Slice columns','No closing reference','Added Ref Closing Payment; existing filter/permissions/actions unchanged; READ_ONLY']);
append('Dev Differences',['Database','Loans.Ref Closing Payment','Schema','Absent','Nullable text; no default/backfill; FK Payments(Row ID), NO ACTION; partial index loans_closing_payment_idx WHERE nonnull. SQL closing_payment_guard owns writes.']);
const bots={'Create First-Day Charge':'Disabled; SQL first_day_charge trigger','Payments - Process Receipt':'Disabled; SQL process_lump_sum routes all six methods','Generate Daily Charges':'Disabled; phase 4 deferred','Notification - New Loan Created':'Enabled; loan notification plus first-day receipt lookup','Notification - Loan Closed':'Enabled; immediate first-day closure or non-payment update closure','Notification - Charge Received':'Enabled; receipt and one matching-loan closure summary','Auto Receive First-Day Charge':'Renamed Notification - First-Day Charge; enabled, notification only'};
for(let i=1;i<before['Dev Differences'].length;i++){
 const r=[...before['Dev Differences'][i]];
 if(r[1]==='Flyway') {r[3]='V5';r[4]='V6; development only';edit('Dev Differences',i,r);}
 else if(r[0]==='OLTP'&&bots[r[1]]&&r[2]==='Enabled'){r[4]=bots[r[1]];edit('Dev Differences',i,r);}
}
for(const [n,state] of Object.entries(bots))append('Dev Differences',['OLTP',n,'V6 workflow','Production V5 original workflow',state+'; all notification tasks owner-only']);
for(const n of ['Payment - Process Receipt','Payment - Close Paid Loans'])append('Dev Differences',['OLTP',n,'Only if / prominence','Original production expression','FALSE; hidden']);
for(let i=1;i<before['App Settings'].length;i++){
 const r=[...before['App Settings'][i]];
 if(String(r[0]).toLowerCase()==='development-oltp'&&bots[r[2]]){r[3]=bots[r[2]];r[4]='Current editor/appdoc OLTP 1.000032; core payment V6';edit('App Settings',i,r);}
}
append('App Settings',['development-oltp','Version','Saved app version','1.000032','Core payment current editor/appdoc; rollback 1.000025']);
append('App Settings',['development-olap','Version','Saved app version','1.000033','Closing Ref and slice reconciled; rollback 1.000031']);
for(let i=1;i<before['DB Logic'].length;i++){
 const r=[...before['DB Logic'][i]];
 if(['lump_sum_receipt_guard','process_lump_sum','lump_sum_child_guard'].includes(r[2])){r[0]=r[0].replace('Production and development','Production');r[3]='Production V4 definition retained at V5; development superseded by V6';edit('DB Logic',i,r);}
}
const migration=await fs.readFile('database/migrations/V6__core_payment_transaction.sql','utf8');
for(const m of migration.matchAll(/^CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(([^\n]*)/gm))append('DB Logic',['Development function','public',m[1],'Flyway V6; production unchanged',m[2]+'; exact implementation: database/migrations/V6__core_payment_transaction.sql']);
for(const m of migration.matchAll(/^CREATE TRIGGER (\w+) ([^\n]+)\n([^;]+);/gm))append('DB Logic',['Development trigger','public',m[1],'Flyway V6',m[2]+' '+m[3]]);
append('DB Logic',['Development index','Loans','loans_closing_payment_idx','Flyway V6','ON Loans (Ref Closing Payment) WHERE Ref Closing Payment IS NOT NULL']);
append('DB Logic',['Development constraint','Loans','Loans_Ref Closing Payment_fkey','Flyway V6','FOREIGN KEY (Ref Closing Payment) REFERENCES Payments(Row ID); nullable; no backfill']);
for(let i=1;i<before.Guide.length;i++){
 const r=before.Guide[i];
 if(r[0]==='Database')edit('Guide',i,['Database','Production V5; development V6','Core payment phases 1-3 development only. Dev-only physical/Ref/VC changes are detailed in Dev Differences; DB Columns remains production inventory.']);
 if(r[0]==='Remaining verification')edit('Guide',i,['Remaining verification','Owner overall acceptance; offline/multiple-device GUI; manual-charge notification route; Looker','Owner confirmed receipt, two-loan closure summary and first-day alerts/amounts. All six methods passed current OLTP GUI and SQL reconciliation; OLAP readback passed. No production release or app speed benchmark.']);
}
append('Guide',['Development core payment','OLTP 1.000032 / OLAP 1.000033; Flyway V6','SQL posts all six payment methods, closes loans atomically, creates first-day charge/receipt. Owner-only notification bots remain in AppSheet. See outputs/core-payment-20260915/REPORT.md and core payment change log.']);
wb.recalculate();const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Core payment dictionary error scan'});await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
for(const name of ['Dev Differences','DB Logic','Guide']){const c=changes.filter(c=>c.sheet===name).at(-1);const r=wb.worksheets.getItem(name).getRangeByIndexes(c.row-1,0,1,before[name][0].length);const p=await wb.render({sheetName:name,range:r.address.split('!').pop(),scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after-'+name.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));}
const staged=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(staged);const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));const norm=a=>a.map(r=>r.map(v=>v??''));
for(const s of check.worksheets.items){const expected=before[s.name].map(r=>[...r]);for(const c of changes.filter(c=>c.sheet===s.name))expected[c.row-1]=c.values;if(JSON.stringify(norm(expected))!==JSON.stringify(norm(s.getUsedRange().values)))throw Error('Unexpected dictionary difference '+s.name);}
await fs.copyFile(staged,file);await fs.unlink(staged);await fs.unlink(staged+'.inspect.ndjson').catch(()=>{});await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changes},null,2));console.log({changedRows:changes.length,roundtrip:true});
