import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root='C:/GitHub/AppSheet-Loan-Project';
const out=root+'/outputs/lumpsum-promotion-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/lumpsum-promotion-20260915';
const file=root+'/Documents/AppSheet_Data_Dictionary.xlsx';
const stage=process.argv.includes('--production')?'production':'development';
const version=process.argv.find(a=>a.startsWith('--version='))?.split('=')[1];
if(stage==='production'&&!version)throw Error('Verified production version required');
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(['Guide','DB Logic','Dev Differences','App Settings','Prod Tables'].map(n=>[n,{head:before[n][0],tail:before[n].slice(-16)}]))));
 const blob=await wb.render({sheetName:'Dev Differences',range:'A1:E4',scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await blob.arrayBuffer()));process.exit(0);
}
await fs.copyFile(file,priv+'/dictionary-before-'+stage+'.xlsx',1).catch(e=>{if(e.code!=='EEXIST')throw e;});
const changed=[];
const edit=(name,i,row)=>{wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length).values=[row];changed.push({sheet:name,row:i+1,values:row});};
const prod=stage==='production';
const scope=prod?'Production and development':'Development';
const expressions=JSON.parse(await fs.readFile(out+'/action-expressions.json','utf8'));
let next=before['Dev Differences'].length;
for(const e of expressions){
 const key='Action: '+e.action;
 let i=before['Dev Differences'].findIndex(r=>r[1]===key&&r[2]===e.property);
 if(i<0){i=next++;wb.worksheets.getItem('Dev Differences').getRangeByIndexes(i,0,1,5).copyFrom(wb.worksheets.getItem('Dev Differences').getRangeByIndexes(before['Dev Differences'].length-1,0,1,5),'all');}
 edit('Dev Differences',i,['OLTP',key,e.property,prod?e.after:e.before,e.after]);
 wb.worksheets.getItem('Dev Differences').getRangeByIndexes(i,0,1,5).format.wrapText=true;
 wb.worksheets.getItem('Dev Differences').getRangeByIndexes(i,0,1,5).format.verticalAlignment='top';
 wb.worksheets.getItem('Dev Differences').getRangeByIndexes(i,0,1,5).format.rowHeight=e.after.length>1000?409:180;
}
for(let i=1;i<before['App Settings'].length;i++){
 const r=[...before['App Settings'][i]];
 if(r[0]==='development-oltp'&&r[1]==='Bot'&&String(r[2]).startsWith('Notification -')){
  r[3]='Enabled';r[4]='Dev OLTP 1.000019; owner-authorized push recipients LIST("welct0407@mw-credit.com"); existing templates and events retained.';edit('App Settings',i,r);
 }
}
for(let i=1;i<before['DB Logic'].length;i++){
 const r=[...before['DB Logic'][i]];
 if(!['lump_sum_receipt_guard','process_lump_sum','lump_sum_child_guard'].includes(r[2]))continue;
 r[0]=r[0].includes('function')?scope+' function':scope+' trigger';
 r[3]=prod?'Flyway V4 in both environments':'Flyway V4 in Dev; production V1';
 if(r[0].includes('function'))r[4]='database/migrations/V4__preserve_appsheet_notification_events.sql; SQL prepares immutable allocation/ledger; existing AppSheet bot posts and closes loans to retain notification events.';
 edit('DB Logic',i,r);
}
for(let i=1;i<before['Dev Differences'].length;i++){
 const r=[...before['Dev Differences'][i]],key=r[1];
 if(key==='Payments - Process Receipt'||key==='Payments - Process Receipt / Payment queued or retried'){
  r[3]='[Status] = "Processing"';r[4]='[Status] = "Processing" (same in both apps; V4 retains existing notification-triggering finalization)';
 }else if(key==='Payments / Payment Allocations / Repayments'){
  r[3]=prod?'SQL preparation, AppSheet finalization':'Five AppSheet stages';
  r[4]='Flyway V4; SQL prepares allocations/ledger atomically. Existing AppSheet action posts receipt and closes loans. Dev OLTP 1.000019, OLAP 1.000027.';
 }else if(key==='Payments.Status / Processed At'){
  r[3]='AppSheet reconciler';r[4]='V4 leaves Processing until existing AppSheet finalization; DB validates and protects prepared/posted values. Prepared retries do not allocate again.';
 }else if(key==='Flyway'){
  r[3]=prod?'V4':'V1';r[4]=prod?'V4; identical immutable migrations in both environments':'V4 development; production promotion approved, pending cutover';
 }else if(r[0]==='Database'&&r[2]==='Development index'&&prod){r[2]='Shared index';r[3]=r[4];}
 else if(prod&&['Payment Allocations.Charge Row Number Snapshot','Payment Allocations.Row ID / Repayments.Row ID'].includes(key)){r[3]=r[4];}
 else continue;
 edit('Dev Differences',i,r);
}
for(let i=1;i<before.Guide.length;i++){
 const key=before.Guide[i][0];
 if(key==='Database')edit('Guide',i,[key,prod?'Production and Dev Flyway V4':'Production V1; Dev V4','V1 equality is historical. V4 retains AppSheet finalization and notification events; release report records migration hashes and verification.']);
 if(key==='Production versions')edit('Guide',i,[key,`OLTP ${version||'3.000071'}; OLAP 1.100051`,'Fresh pre-promotion appdoc capture; release report records subsequent cutover versions.']);
 if(key==='Remaining verification')edit('Guide',i,[key,'Device receipt, scheduled exports and Looker','Dev payment-received and loan-closed bot runs completed. Device receipt is not independently confirmed. Scheduled exports and Looker were not executed.']);
 if(before.Guide[i][0]!=='Development lump sum')continue;
 edit('Guide',i,['Development lump sum',prod?`Prod OLTP ${version}; Dev OLTP 1.000019; Flyway V4 both`:'Dev OLTP 1.000019; Dev OLAP 1.000027; Flyway V4',
 'SQL prepares allocations and ledger; existing AppSheet finalization/closure keeps push events. Production recipients unchanged; all three Dev pushes go only to the owner account. Release evidence: outputs/lumpsum-promotion-20260915/REPORT.md.']);
}
{
 const h=before['Prod Tables'][0],v=h.findIndex(x=>/version/i.test(x)),app=h.findIndex(x=>/^app$/i.test(x));
 if(v<0||app<0)throw Error('Unexpected Prod Tables headers');
 for(let i=1;i<before['Prod Tables'].length;i++){const r=[...before['Prod Tables'][i]];if(r[app]==='OLTP'){r[v]='v'+(version||'3.000071');edit('Prod Tables',i,r);}}
}
wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Release dictionary error scan'});
await fs.writeFile(out+'/dictionary-error-scan-'+stage+'.jsonl',scan.ndjson);
for(const name of ['Guide','DB Logic','Dev Differences','App Settings']){
 const c=changed.find(c=>c.sheet===name);if(!c)continue;
 const range=wb.worksheets.getItem(name).getRangeByIndexes(c.row-1,0,1,before[name][0].length);
 const blob=await wb.render({sheetName:name,range:range.address.split('!').pop(),scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-'+stage+'-'+name.replaceAll(' ','-')+'.png',new Uint8Array(await blob.arrayBuffer()));
}
const staged=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(staged);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));
const norm=a=>a.map(r=>r.map(v=>v??''));
for(const s of check.worksheets.items){const expected=before[s.name].map(r=>[...r]);for(const c of changed.filter(c=>c.sheet===s.name))expected[c.row-1]=c.values;
 if(JSON.stringify(norm(expected))!==JSON.stringify(norm(s.getUsedRange().values)))throw Error('Unexpected dictionary difference '+s.name);}
await fs.copyFile(staged,file);await fs.unlink(staged);await fs.unlink(staged+'.inspect.ndjson').catch(()=>{});
await fs.writeFile(out+'/dictionary-changes-'+stage+'.json',JSON.stringify({stage,version:version||'1.000019',allSheetsRoundtrip:true,changes:changed},null,2));
console.log(JSON.stringify({stage,changedRows:changed.length,roundtrip:true}));
