import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx';
const out='outputs/interval-anchor-20260915';
const backup='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/interval-anchor-20260915/dictionary-before.xlsx';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(process.argv.includes('--refresh')?backup:file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(['Guide','Dev Differences','DB Logic'].map(n=>[n,{head:before[n][0],tail:before[n].slice(-8)}]))));
 const blob=await wb.render({sheetName:'Dev Differences',range:'A1:E4',scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await blob.arrayBuffer()));process.exit(0);
}
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/interval-anchor-20260915';
await fs.copyFile(file,priv+'/dictionary-before.xlsx',1).catch(e=>{if(e.code!=='EEXIST')throw e;});
const comparison=JSON.parse(await fs.readFile(out+'/definition-comparison.json'));
const expressions=JSON.parse(await fs.readFile(out+'/expressions.json'));
const changes=[];
function edit(name,i,row){wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length).values=[row.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v)];changes.push({sheet:name,row:i+1,values:row});}
function append(name,row){
 const i=before[name].length+changes.filter(c=>c.sheet===name&&c.row>before[name].length).length;
 const range=wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length);
 range.copyFrom(wb.worksheets.getItem(name).getRangeByIndexes(before[name].length-1,0,1,row.length),'all');
 edit(name,i,row);range.format.wrapText=true;range.format.verticalAlignment='top';
 range.format.rowHeight=Math.max(...row.map(v=>String(v).length))>1000?409:90;
}
for(const [app,result]of Object.entries(comparison)){
 if(result.removed.length)throw Error('Unexpected removed app objects');
 for(const c of result.changes){
  if(c.key==='app')continue;
  if(c.added){
   // AppSheet internal process schemas inherit the field; one business-column inventory per app.
   if(c.key!=='column:Loans_Schema:Interest Schedule Anchor Date')continue;
   for(const [property,value]of Object.entries(c.added))append('Dev Differences',[app.toUpperCase(),'Loans.Interest Schedule Anchor Date',property,'Not present',value]);
  }else for(const f of c.fields)append('Dev Differences',[app.toUpperCase(),c.key,f.field,f.before??'',f.after??'']);
 }
}
append('Dev Differences',['OLTP','Generate Daily Charges / Daily 00:05','Filter Condition','Original Loan Date schedule; production unchanged',expressions.scheduledFilter]);
append('Dev Differences',['OLTP','Generate Daily Charges','Enabled','Production schedule unchanged','Disabled; reviewed filter saved, scheduled execution not run']);
append('Dev Differences',['Database','Loans.Interest Schedule Anchor Date','Schema','Not present','Nullable date; no default/backfill. Flyway V5. CHECK blank or >= Loan Date. No new Ref, key or index.']);
for(let i=1;i<before['Dev Differences'].length;i++)if(before['Dev Differences'][i][1]==='Flyway'){const r=[...before['Dev Differences'][i]];r[4]='V5; interval anchor exists only in development';edit('Dev Differences',i,r);}
for(let i=1;i<before.Guide.length;i++)if(before.Guide[i][0]==='Database')edit('Guide',i,['Database','Production Flyway V4; development V5','V5 adds optional Loans schedule anchor only in development. Existing V4 processing unchanged.']);
append('Guide',['Development interval anchor',`Dev OLTP ${comparison.oltp.version}; Dev OLAP ${comparison.olap.version}; Flyway V5`,'Current-GUI synthetic schedule, form validation, duplicate prevention, accrual and OLAP readback passed. Owner acceptance pending. Change Logs/CHANGE_NOTES_INTERVAL_ANCHOR_2026-09-15.md']);
append('DB Logic',['Development constraint','Loans','loans_interest_schedule_anchor_date_check','Flyway V5; not promoted','CHECK ("Interest Schedule Anchor Date" IS NULL OR ("Loan Date" IS NOT NULL AND "Interest Schedule Anchor Date" >= "Loan Date"))']);
wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Interval anchor dictionary error scan'});
await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
for(const name of ['Guide','Dev Differences','DB Logic']){
 const c=changes.find(c=>c.sheet===name&&c.row>before[name].length);
 const blob=await wb.render({sheetName:name,range:`A${c.row}:${name==='Guide'?'C':'E'}${c.row+(name==='Dev Differences'?2:0)}`,scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-after-'+name.replaceAll(' ','-')+'.png',new Uint8Array(await blob.arrayBuffer()));
}
const staged=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(staged);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));
const norm=a=>a.map(r=>r.map(v=>v??''));
for(const s of check.worksheets.items){const expected=before[s.name].map(r=>[...r]);for(const c of changes.filter(c=>c.sheet===s.name))expected[c.row-1]=c.values;
 if(JSON.stringify(norm(expected))!==JSON.stringify(norm(s.getUsedRange().values)))throw Error('Unexpected dictionary difference '+s.name);}
await fs.copyFile(staged,file);await fs.unlink(staged);await fs.unlink(staged+'.inspect.ndjson').catch(()=>{});
await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changes},null,2));
console.log(JSON.stringify({changedRows:changes.length,roundtrip:true}));
