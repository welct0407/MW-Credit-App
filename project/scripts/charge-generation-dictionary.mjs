import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/charge-generation-20260915';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(process.argv.includes('--accept')){
 const i=before.Guide.findIndex(r=>r[0]==='Development charge generation');if(i<0)throw Error('Generation entry missing');
 const row=[...before.Guide[i]];row[2]=String(row[2]).replace('user workflow acceptance pending','owner accepted phases 4–5 on 15 September 2026; first natural nightly run pending');
 wb.worksheets.getItem('Guide').getRangeByIndexes(i,0,1,row.length).values=[row];wb.recalculate();
 const p=await wb.render({sheetName:'Guide',range:`A${i+1}:C${i+1}`,scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after-Guide.png',new Uint8Array(await p.arrayBuffer()));
 const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Accepted generation dictionary error scan'});await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
 const staged=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(staged);const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));before.Guide[i]=row;
 for(const s of check.worksheets.items){if(JSON.stringify(before[s.name])!==JSON.stringify(s.getUsedRange().values))throw Error('Acceptance changed unexpected values '+s.name);}
 const log=JSON.parse(await fs.readFile(out+'/dictionary-changes.json','utf8'));log.changes.find(c=>c.sheet==='Guide'&&c.row===i+1).values=row;log.ownerAcceptance='15 September 2026: Looks correct — accept phases 4–5';
 await fs.copyFile(staged,file);await fs.unlink(staged);await fs.unlink(staged+'.inspect.ndjson').catch(()=>{});await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify(log,null,2));console.log({accepted:true,allSheetsRoundtrip:true});process.exit(0);
}
if(!process.argv.includes('--edit')){
 if(process.argv.includes('--verify-render')){
  const log=JSON.parse(await fs.readFile(out+'/dictionary-changes.json','utf8'));
  for(const c of log.changes.filter(c=>c.sheet==='Dev Differences'&&(c.values[2]==='Request expression'||(c.values[1]==='Loans.Charge Generation Request'&&c.values[2]==='Editable_If')))){
   const p=await wb.render({sheetName:c.sheet,range:`A${c.row}:E${c.row}`,scale:1,format:'png'});await fs.writeFile(out+`/dictionary-verified-row-${c.row}.png`,new Uint8Array(await p.arrayBuffer()));console.log({row:c.row,object:c.values[1],property:c.values[2]});
  }process.exit(0);
 }
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([name,r])=>[name,{head:r[0],rows:r.length,sample:['Guide','App Settings'].includes(name)?r.slice(-5):[]}]))));
 const p=await wb.render({sheetName:'Dev Differences',range:'A1:E4',scale:1,format:'png'});await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));process.exit(0);
}
if(before.Guide.some(r=>r[0]==='Development charge generation'))throw Error('Dictionary update already applied');
await fs.copyFile(file,'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/charge-generation-20260915/dictionary-before.xlsx',1);
const changes=[];
function edit(name,i,row){const values=row.map(v=>v??'');wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length).values=[values.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v)];changes.push({sheet:name,row:i+1,values});}
function append(name,row){const i=before[name].length+changes.filter(c=>c.sheet===name&&c.row>before[name].length).length;const r=wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length);r.copyFrom(wb.worksheets.getItem(name).getRangeByIndexes(before[name].length-1,0,1,row.length),'all');edit(name,i,row);r.format.wrapText=true;r.format.verticalAlignment='top';r.format.rowHeight=100;}
for(const app of ['OLTP','OLAP']){
 for(const [property,value] of Object.entries({Type:'Text',Virtual:'No',Key:'No',Label:'No','Read-Only':app==='OLTP'?'No; action-writable, user editing blocked by Editable_If':'Yes',Editable_If:app==='OLTP'?'=FALSE':'Blank',Hidden:'Yes',Searchable:'No','Visible?':'ALWAYS','Initial value':'Blank','App formula':'Blank',Required_If:'Blank (nullable)','Reset on edit?':'No','System Defined?':'No','Fixed definition?':'No','Editable Initial Value?':'Yes',LocaleName:'en-US','Display name':'Blank',Description:'Blank',Scannable:'No','Sensitive data':'No'}))append('Dev Differences',[app,'Loans.Charge Generation Request',property,'Absent',value]);
}
append('Dev Differences',['OLAP','Reporting Loans','V8 slice columns','V7 columns','Charge Generation Request appended; hidden in base table. READ_ONLY, filter and actions retained.']);
append('Dev Differences',['OLAP','View Ref (Ref Target Loan)','Visible?','ADVANCED at V7 checkpoint','ALWAYS after regeneration; same inline target, condition and no editing permission.']);
append('Dev Differences',['Database','Loans.Charge Generation Request','Schema','Absent','Nullable text; no default, backfill, key, index or Ref. Dated nonce command owned by OLTP.']);
append('Dev Differences',['OLTP',"Generate Today's Charge",'Do this','ADD_RECORD_TO Charges','SET_COLUMN_VALUE Loans; only Charge Generation Request assigned. Existing due filter and hidden prominence retained.']);
append('Dev Differences',['OLTP',"Generate Today's Charge",'Request expression','Financial component assignments','=CONCATENATE(TEXT(TODAY(), "YYYY-MM-DD"), "|", UNIQUEID())']);
append('Dev Differences',['OLTP',"Generate All Today's Charges",'Routing','Existing bulk action','Unchanged per-loan route; SQL now owns calculation through the referenced action.']);
append('Dev Differences',['OLTP','Generate Daily Charges','Bot enabled','Yes in production','No; replaced by development pg_cron job. Four reviewed owner-only notification bots unchanged.']);
append('Dev Differences',['Database','loan-daily-charges','Schedule','Absent in production','Active development only; 00:05 Asia/Bangkok. Owner approved nightly development generation.']);
for(let i=1;i<before['Dev Differences'].length;i++){const r=[...before['Dev Differences'][i]];if(r[1]==='Flyway'){r[4]='V9; development only';edit('Dev Differences',i,r);}}
for(let i=1;i<before['App Settings'].length;i++){const r=[...before['App Settings'][i]];if(r[1]==='Version'&&String(r[0]).startsWith('development-')){r[3]='1.000039';r[4]='V9 current editor/appdoc; rollback both apps 1.000036';edit('App Settings',i,r);}}
for(const [kind,table,name,version,description] of [
 ['Development function','public','generate_loan_charge','Flyway V8','Common manual/nightly daily-interest, fixed-date and installment generator. Locks borrower/loan/charges, skips existing loan/date, preserves interval/anchor/accrual/remainder rules. Manual borrower lock uses NOWAIT to avoid inverted lock deadlocks.'],
 ['Development function','public','generate_due_charges','Flyway V8','Atomic ordered batch using common generator; explicit business date; optional loan list for isolated tests. Returns inserted count.'],
 ['Development function','public','charge_generation_request','Flyway V8','Validates changed yyyy-mm-dd|nonce against Bangkok today; invokes common generator; failure rolls back token and charge.'],
 ['Development trigger','Loans','manual_charge_generation','Flyway V8','AFTER INSERT OR UPDATE OF Charge Generation Request, FOR EACH ROW.'],
 ['Development extension','cron','pg_cron','Flyway V9 / Cloud SQL 1.6.7','Background workers; database loan_manager_prod on development host only; cron timezone Asia/Bangkok, max running jobs 1; session TimeZone remains UTC.'],
 ['Development job','cron','loan-daily-charges','Flyway V9; activation separate','00:05 Asia/Bangkok calls generate_due_charges for current Bangkok date. Active after successful synthetic scheduler test. Cron metadata is not an AppSheet business table.']
])append('DB Logic',[kind,table,name,version,description]);
for(let i=1;i<before.Guide.length;i++){if(before.Guide[i][0]==='Database')edit('Guide',i,['Database','Production V5; development V9','Core payment, atomic Close Loan and common manual/nightly charge generation in development. Production catalogs unchanged; Dev Differences contains app and additive schema properties.']);}
append('Guide',['Development charge generation','OLTP 1.000039 / OLAP 1.000039; Flyway V9','Manual and nightly generation use one SQL engine. New hidden nullable Loans request field. Current-GUI and actual scheduler tests pass. Nightly development job enabled; user workflow acceptance pending. See outputs/charge-generation-20260915/REPORT.md.']);
wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Charge generation dictionary error scan'});await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
for(const name of ['Dev Differences','DB Logic','Guide']){const c=changes.filter(c=>c.sheet===name).at(-1);const r=wb.worksheets.getItem(name).getRangeByIndexes(c.row-1,0,1,before[name][0].length);const p=await wb.render({sheetName:name,range:r.address.split('!').pop(),scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after-'+name.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));}
const staged=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(staged);const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));const norm=a=>a.map(r=>r.map(v=>v??''));
for(const s of check.worksheets.items){const expected=before[s.name].map(r=>[...r]);for(const c of changes.filter(c=>c.sheet===s.name))expected[c.row-1]=c.values;if(JSON.stringify(norm(expected))!==JSON.stringify(norm(s.getUsedRange().values)))throw Error('Unexpected dictionary difference '+s.name);}
await fs.copyFile(staged,file);await fs.unlink(staged);await fs.unlink(staged+'.inspect.ndjson').catch(()=>{});await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changes},null,2));console.log({changedRows:changes.length,roundtrip:true});
