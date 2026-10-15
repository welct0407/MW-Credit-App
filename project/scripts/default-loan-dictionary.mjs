import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/default-loan-20260915';
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(!process.argv.includes('--edit')){
 if(process.argv.includes('--verify-render')){
  const p=await wb.render({sheetName:'Dev Differences',range:'A384:E394',scale:1,format:'png'});await fs.writeFile(out+'/dictionary-default-rules.png',new Uint8Array(await p.arrayBuffer()));process.exit(0);
 }
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([name,r])=>[name,{head:r[0],rows:r.length,sample:['Guide','App Settings'].includes(name)?r.slice(-4):[]}]))));
 const p=await wb.render({sheetName:'Dev Differences',range:'A1:E4',scale:1,format:'png'});await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));process.exit(0);
}
if(before.Guide.some(r=>r[0]==='Development Default Loan'))throw Error('Default dictionary update already applied');
await fs.copyFile(file,'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/default-loan-20260915/dictionary-before.xlsx',1);
const changes=[];
function edit(name,i,row){const values=row.map(v=>v??'');wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length).values=[values.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v)];changes.push({sheet:name,row:i+1,values});}
function append(name,row){const i=before[name].length+changes.filter(c=>c.sheet===name&&c.row>before[name].length).length;const r=wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length);r.copyFrom(wb.worksheets.getItem(name).getRangeByIndexes(before[name].length-1,0,1,row.length),'all');edit(name,i,row);r.format.wrapText=true;r.format.verticalAlignment='top';r.format.rowHeight=100;}
append('Dev Differences',['OLTP','Wrapped Action - Default Loan','Do this','Six-step COMPOSITE','SET_COLUMN_VALUE Loans. Confirmation, eligibility and prominence retained. SQL posts all default financial operations atomically.']);
for(const [column,value] of Object.entries({Defaulted:'=TRUE','Close Date':'=TODAY()','Closed By':'=USEREMAIL()','Loan Status':'="ปิดยอดแล้ว"'}))append('Dev Differences',['OLTP','Wrapped Action - Default Loan',column,'Grouped financial steps',value]);
append('Dev Differences',['OLTP','Default - sub-actions','Only if','Legacy conditions','FALSE on all seven legacy Default actions; retained hidden for reference.']);
append('Dev Differences',['OLTP','Notification - Loan Closed','Default branch','Principal returned / interest received wording','LOOKUP current Loans.Defaulted and Default Loss Amount; default title and principal loss / no cash received body. Owner-only development destination retained.']);
append('Dev Differences',['OLAP','Loans.Default Loss Amount','CurrencySymbol / DecimalDigits','$ / 2','฿ / 0; read-only Loans and Reporting Loans permissions retained.']);
append('Dev Differences',['Database','Loans.Defaulted','Transition','AppSheet multi-step writes','V10 BEFORE trigger requires dated actor confirmation; SQL computes loss, writes charge/repayment, closes loan. Repeat is a no-op; recorded default financial state immutable.']);
append('Dev Differences',['Database','Charges','Default write-off','Unpaid rows deleted; partial rows reduced','Preserve every charge key. Reduce outstanding components to paid values; append JSON audit to existing Notes (original amounts, write-off, date, actor, posting). Paid rows unchanged.']);
append('Dev Differences',['Database','Repayments','Default posting','AppSheet negative interest / positive principal','One immutable df10: entry: outstanding principal and equal negative interest, zero new cash. No Payment or Allocation generated; prior cash/allocations unchanged.']);
for(let i=1;i<before['Dev Differences'].length;i++){const r=[...before['Dev Differences'][i]];if(r[1]==='Flyway'){r[4]='V10; development only';edit('Dev Differences',i,r);}}
for(let i=1;i<before['App Settings'].length;i++){const r=[...before['App Settings'][i]];if(r[1]==='Version'&&String(r[0]).startsWith('development-')){r[3]=String(r[0]).includes('oltp')?'1.000042':'1.000040';r[4]='V10 current editor/appdoc; rollback both apps 1.000039';edit('App Settings',i,r);}}
for(const [kind,table,name,description] of [
 ['Development function','public','post_loan_default','Atomic prototype loss posting from Defaulted transition. Borrower NOWAIT avoids inverted lock deadlocks; ordered charge locks, immutable prior payment entries, audited write-off notes.'],
 ['Development function','public','default_loan_transition','BEFORE Loans INSERT/UPDATE; reject initially defaulted inserts; validate confirmation date/actor and eligibility; derive loss and closed status; guard recorded state.'],
 ['Development trigger','Loans','default_loan_transition','BEFORE INSERT OR UPDATE, FOR EACH ROW. Existing fields only; no new physical column/table.'],
 ['Development function','public','default_posting_guard','Reject UPDATE/DELETE of reserved df10: Charges and Repayments entries.'],
 ['Development trigger','Charges / Repayments','default_posting_guard','BEFORE UPDATE OR DELETE, FOR EACH ROW.'],
 ['Development function revision','public','first_day_charge_trigger','Exclude both lc7: final charges and df10: default loss charges from first-day receipt processing.']
])append('DB Logic',[kind,table,name,'Flyway V10',description]);
for(let i=1;i<before.Guide.length;i++){if(before.Guide[i][0]==='Database')edit('Guide',i,['Database','Production V5; development V10','Core payments, atomic Close Loan, common generation and atomic Default Loan in development. Production catalogs unchanged; Dev Differences records development behavior.']);}
append('Guide',['Development Default Loan','OLTP 1.000042 / OLAP 1.000040; Flyway V10','SQL and current-GUI defaults reconcile; owner acceptance pending. Losses 100/90/110/92; no new cash. Retained written-off charge rows can change count-based reports. See outputs/default-loan-20260915/REPORT.md.']);
wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Default dictionary error scan'});await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
for(const name of ['Dev Differences','DB Logic','Guide']){const c=changes.filter(c=>c.sheet===name).at(-1);const p=await wb.render({sheetName:name,range:`A${c.row}:${name==='Guide'?'C':'E'}${c.row}`,scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after-'+name.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));}
const staged=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(staged);const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));const norm=a=>a.map(r=>r.map(v=>v??''));
for(const s of check.worksheets.items){const expected=before[s.name].map(r=>[...r]);for(const c of changes.filter(c=>c.sheet===s.name))expected[c.row-1]=c.values;if(JSON.stringify(norm(expected))!==JSON.stringify(norm(s.getUsedRange().values)))throw Error('Unexpected dictionary difference '+s.name);}
await fs.copyFile(staged,file);await fs.unlink(staged);await fs.unlink(staged+'.inspect.ndjson').catch(()=>{});await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changes},null,2));console.log({changedRows:changes.length,roundtrip:true});
