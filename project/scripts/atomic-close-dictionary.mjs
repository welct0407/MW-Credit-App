import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/atomic-close-20260915';
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(!process.argv.includes('--edit')){
 if(process.argv.includes('--verify-render')){
  const changeLog=JSON.parse(await fs.readFile(out+'/dictionary-changes.json','utf8'));
  const selected=changeLog.changes.filter(c=>c.sheet==='Dev Differences'&&((c.values[1]==='Payments.Ref Target Loan'&&c.values[2]==='Editable_If')||c.values[2]==='Valid_If'));
  for(const c of selected){const p=await wb.render({sheetName:'Dev Differences',range:`A${c.row}:E${c.row}`,scale:1,format:'png'});await fs.writeFile(out+`/dictionary-verified-row-${c.row}.png`,new Uint8Array(await p.arrayBuffer()));}
  console.log(selected.map(c=>({row:c.row,object:c.values[1],property:c.values[2]})));process.exit(0);
 }
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([n,r])=>[n,{head:r[0],rows:r.length,sample:['Guide','DB Logic','Dev Differences'].includes(n)?r.slice(-8):[]}]))));
 const p=await wb.render({sheetName:'Dev Differences',range:'A1:F4',scale:1,format:'png'});await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));
 process.exit(0);
}

await fs.copyFile(file,'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/atomic-close-20260915/dictionary-before.xlsx',1);
if(before.Guide.some(r=>r[0]==='Development atomic loan close'))throw Error('V7 dictionary update already applied');
const changes=[];
function edit(name,i,row){wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length).values=[row.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v??'')];changes.push({sheet:name,row:i+1,values:row.map(v=>v??'')});}
function append(name,row){const i=before[name].length+changes.filter(c=>c.sheet===name&&c.row>before[name].length).length;const r=wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length);r.copyFrom(wb.worksheets.getItem(name).getRangeByIndexes(before[name].length-1,0,1,row.length),'all');edit(name,i,row);r.format.wrapText=true;r.format.verticalAlignment='top';r.format.rowHeight=100;}
const required='OR(IN([Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto")), AND([Allocation Method] = "Loan Close", ISBLANK([Ref Target Loan])))';
const valid='OR(IN([Row ID], Payments[Row ID]), AND([Allocation Method] = "Loan Close", ISNOTBLANK([Ref Target Loan]), [Ref Target Loan].[Ref Borrowers] = [Ref Borrower], [_THIS] > 0, [_THIS] = ROUND([_THIS])), AND([_THIS] > 0, [_THIS] = ROUND([_THIS]), [_THIS] <= [Eligible Outstanding], IF(IN([Allocation Method], LIST("Single Full", "Receive All", "First-day Auto", "Loan Close")), [_THIS] = [Eligible Outstanding], TRUE)))';
const eligible='AND([Auto Charge Enabled], [Loan Type] = "ดอกเบี้ยรายวัน", [Loan Status] = "ยังไม่ปิดยอด", [Outstanding Principal] > 0, COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrowers], IN([Status], LIST("Processing", "Error"))))) = 0)';
for(const app of ['OLTP','OLAP']){
 for(const [k,v] of Object.entries({Type:'Ref',ReferencedTableName:'Loans',ReferencedKeyColumn:'Row ID',IsAPartOf:'false',Virtual:'No',Key:'No',Label:'No','Read-Only':app==='OLTP'?'No; user editing blocked by Editable_If':'Yes',Editable_If:app==='OLTP'?'=FALSE':'Blank',Hidden:'No','Visible?':'ALWAYS','Display name':'="เงินกู้ที่ปิดยอด / Closing Loan"','Initial value':'Blank','App formula':'Blank',Required_If:'Blank (nullable)','System Defined?':'No','Reset on edit?':'No',Searchable:'Yes',LocaleName:'en-US','Fixed definition?':'No','Editable Initial Value?':'Yes'}))append('Dev Differences',[app,'Payments.Ref Target Loan',k,'Absent',v]);
 for(const [k,v] of Object.entries({Type:'List of Ref to Payments.Row ID',Virtual:'Yes','App formula':'REF_ROWS("Payments", "Ref Target Loan")','Read-Only':'Yes',Key:'No',Label:'No',IsAPartOf:'false','System Defined?':'Yes',Hidden:'No','Display name':'Blank (default Related Payments)'}))append('Dev Differences',[app,'Loans.Related Payments',k,'Absent',v]);
 append('Dev Differences',[app,'View Ref (Ref Target Loan)','Navigation','Absent','Generated inline Ref navigation to Loans; manually ordered forms/details unchanged']);
 append('Dev Differences',[app,'Payments.Row ID','Regeneration metadata','Unchanged production catalog','Fixed definition No; Editable Initial Value Yes. Key Yes, Read-Only Yes and UNIQUEID() initial value retained.']);
}
append('Dev Differences',['OLAP','Reporting Loans','V7 slice columns','No target-loan reverse list','Added Related Payments; prior Ref Closing Payment retained. Filter, actions and READ_ONLY unchanged.']);
append('Dev Differences',['Database','Payments.Ref Target Loan','Schema','Absent','Nullable text; no default/backfill; FK Loans(Row ID), NO ACTION; partial index payments_target_loan_idx WHERE nonnull.']);
append('Dev Differences',['OLTP','Payments.Ref Target Charge','Required_If','Original production rule',required]);
append('Dev Differences',['OLTP','Payments.Amount Received','Valid_If','Original production rule',valid]);
append('Dev Differences',['OLTP','Wrapped Action - Close Loan','Ordered actions','Create Final Charge; Add Principal to Today\'s Charge; Receive All Remaining Charges','Receive All Remaining Charges only; confirmation and visibility retained']);
append('Dev Differences',['OLTP','Receive All Remaining Charges','Ref Target Loan assignment','Absent','[Row ID]; replaces Ref Target Charge assignment']);
append('Dev Differences',['OLTP','Receive All Remaining Charges','Amount Received assignment','Original eligible charge total','[Outstanding Principal] + SUM(SELECT(Charges[Interest Remaining], [Ref Loans] = [_THISROW].[Row ID])) + [Accrued Interest]']);
append('Dev Differences',['OLTP','Receive All Remaining Charges','Only if','Original production rule',eligible]);
for(const n of ['Create Final Charge',"Add Principal to Today's Charge",'Add Outstanding Principal to Charge'])append('Dev Differences',['OLTP',n,'Only if / prominence','Original production expression','FALSE; hidden; assignments retained for coordinated rollback']);
for(let i=1;i<before['Dev Differences'].length;i++){const r=[...before['Dev Differences'][i]];if(r[1]==='Flyway'){r[4]='V7; development only';edit('Dev Differences',i,r);}}
for(let i=1;i<before['App Settings'].length;i++){const r=[...before['App Settings'][i]];if(r[1]==='Version'&&String(r[0]).startsWith('development-')){r[3]='1.000036';r[4]='V7 current editor/appdoc; rollback OLTP 1.000032 / OLAP 1.000034';edit('App Settings',i,r);}}
for(let i=1;i<before['DB Logic'].length;i++){const r=[...before['DB Logic'][i]];if(r[0]==='Development function'&&r[2]==='first_day_charge_trigger'){r[3]='Historical V6; superseded by V7';edit('DB Logic',i,r);}}
append('DB Logic',['Development function','public','prepare_loan_close','Flyway V7; production unchanged','BEFORE payment command: lock borrower/loan/charges, reconcile remaining principal, prepare final charge, derive receipt amount. Exact definition in V7__atomic_loan_close.sql.']);
append('DB Logic',['Development function','public','first_day_charge_trigger','Flyway V7','Skips reserved lc7: final charges; all other first-day behavior retained.']);
append('DB Logic',['Development trigger','Payments','close_loan_request','Flyway V7','BEFORE INSERT OR UPDATE, prepare_loan_close(); runs before lump_sum_receipt_guard. Existing AFTER processor posts atomically.']);
append('DB Logic',['Development index','Payments','payments_target_loan_idx','Flyway V7','ON Payments (Ref Target Loan) WHERE Ref Target Loan IS NOT NULL']);
append('DB Logic',['Development constraint','Payments','Payments_Ref Target Loan_fkey','Flyway V7','FOREIGN KEY (Ref Target Loan) REFERENCES Loans(Row ID); nullable, NO ACTION, no backfill']);
for(let i=1;i<before.Guide.length;i++){const r=before.Guide[i];if(r[0]==='Database')edit('Guide',i,['Database','Production V5; development V7','Core payment plus atomic final-charge preparation in development. Dev Differences records additive fields and app properties; production catalogs unchanged.']);}
append('Guide',['Development atomic loan close','OLTP 1.000036 / OLAP 1.000036; Flyway V7','Close Loan submits one Payments command. SQL prepares the final charge and posts payment/closure atomically. Four current-GUI cases reconcile in both apps. See atomic-close-20260915 report for acceptance and limits.']);
wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'V7 dictionary error scan'});await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
for(const name of ['Dev Differences','DB Logic','Guide']){const c=changes.filter(c=>c.sheet===name).at(-1);const r=wb.worksheets.getItem(name).getRangeByIndexes(c.row-1,0,1,before[name][0].length);const p=await wb.render({sheetName:name,range:r.address.split('!').pop(),scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after-'+name.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));}
const staged=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(staged);const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));const norm=a=>a.map(r=>r.map(v=>v??''));
for(const s of check.worksheets.items){const expected=before[s.name].map(r=>[...r]);for(const c of changes.filter(c=>c.sheet===s.name))expected[c.row-1]=c.values;if(JSON.stringify(norm(expected))!==JSON.stringify(norm(s.getUsedRange().values)))throw Error('Unexpected dictionary difference '+s.name);}
await fs.copyFile(staged,file);await fs.unlink(staged);await fs.unlink(staged+'.inspect.ndjson').catch(()=>{});await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changes},null,2));console.log({changedRows:changes.length,roundtrip:true});
