import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx';
const out='outputs/interval-promotion-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/interval-promotion-20260915';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([n,r])=>[n,{head:r[0],rows:r.length}]))));
 const p=await wb.render({sheetName:'Prod Columns',range:'A1:I4',scale:1,format:'png'});await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));process.exit(0);
}
await fs.copyFile(file,priv+'/dictionary-before.xlsx',1).catch(e=>{if(e.code!=='EEXIST')throw e;});
const d=JSON.parse(await fs.readFile(out+'/definition-comparison.json'));
const meta=(await fs.readFile(priv+'/metadata.jsonl','utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
const changes=[];
function edit(name,i,row){wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length).values=[row.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v??'')];changes.push({sheet:name,row:i+1,values:row.map(v=>v??'')});}
function append(name,row){const i=before[name].length+changes.filter(c=>c.sheet===name&&c.row>before[name].length).length;const range=wb.worksheets.getItem(name).getRangeByIndexes(i,0,1,row.length);range.copyFrom(wb.worksheets.getItem(name).getRangeByIndexes(before[name].length-1,0,1,row.length),'all');edit(name,i,row);range.format.wrapText=true;range.format.verticalAlignment='top';range.format.rowHeight=Math.max(...row.map(v=>String(v).length))>1000?409:80;}
for(const [app,result]of Object.entries(d)){
 const c=result.changes.find(x=>x.key==='column:Loans_Schema:Interest Schedule Anchor Date').added;
 append('Prod Columns',[app.toUpperCase(),'Loans',c['Column name'],c.Type,c['Virtual?'],c.Key,c.Label,c['Read-Only'],c.Hidden]);
 for(const [k,v]of Object.entries(c)){
  if(['Column name','Type','Virtual?','Key','Label','Read-Only','Hidden'].includes(k))continue;
  if(k==='Type Qualifier'){for(const [qk,qv]of Object.entries(JSON.parse(v)))if(qv!==null)append('Column Rules',[app.toUpperCase(),'Loans',c['Column name'],'Type Qualifier.'+qk,typeof qv==='object'?JSON.stringify(qv):String(qv)]);}
  else append('Column Rules',[app.toUpperCase(),'Loans',c['Column name'],k,v]);
 }
 append('Column Rules',[app.toUpperCase(),'Loans',c['Column name'],'Initial value','Blank; optional schedule origin']);
 append('Column Rules',[app.toUpperCase(),'Loans',c['Column name'],'App formula','Blank; stored physical Date']);
}
for(let i=1;i<before['Prod Tables'].length;i++){const r=[...before['Prod Tables'][i]];if(d[r[0]?.toLowerCase()]){r[1]='v'+d[r[0].toLowerCase()].version;edit('Prod Tables',i,r);}}
append('DB Columns',['Loans',meta[0].column,meta[0].position,meta[0].type,meta[0].nullable,meta[0].default??'']);
append('DB Constraints',['Loans',meta[1].constraint,meta[1].type,String(meta[1].validated),meta[1].definition]);
for(let i=1;i<before['DB Logic'].length;i++){const r=[...before['DB Logic'][i]];if(r[2]===meta[1].constraint){r[0]='Production and development constraint';r[3]='Flyway V5 in both environments';edit('DB Logic',i,r);}}
for(let i=1;i<before['Dev Differences'].length;i++){
 const r=[...before['Dev Differences'][i]],app=d[r[0]?.toLowerCase()];
 if(r[1]==='Loans.Interest Schedule Anchor Date'&&app){r[3]=app.changes.find(c=>c.key==='column:Loans_Schema:Interest Schedule Anchor Date').added[r[2]]??r[4];}
 else if(app?.changes.some(c=>c.key===r[1]&&c.fields?.some(f=>f.field===r[2]))){r[3]=app.changes.find(c=>c.key===r[1]).fields.find(f=>f.field===r[2]).after;}
 else if(r[1]==='Generate Daily Charges / Daily 00:05'){r[3]=r[4];}
 else if(r[1]==='Generate Daily Charges'&&r[2]==='Enabled'){r[3]='Enabled; Daily 00:05 SE Asia Standard Time';}
 else if(r[0]==='Database'&&r[1]==='Loans.Interest Schedule Anchor Date'){r[3]=r[4];}
 else if(r[1]==='Flyway'){r[3]='V5';r[4]='V5; identical tested migrations promoted';}
 else continue;
 edit('Dev Differences',i,r);
}
for(let i=1;i<before.Guide.length;i++){
 const r=before.Guide[i];
 if(r[0]==='Database')edit('Guide',i,['Database','Production and development Flyway V5','Optional daily-interest schedule anchor promoted from tested commit b816d7f. No backfill or development financial data copied.']);
 if(r[0]==='Production versions')edit('Guide',i,['Production versions',`OLTP ${d.oltp.version}; OLAP ${d.olap.version}`,'Final production appdoc comparison; interval promotion 15 September 2026.']);
 if(r[0]==='Development interval anchor')edit('Guide',i,['Interest schedule anchor','Production OLTP 3.000080 / OLAP 1.100055; Dev OLTP 1.000025 / OLAP 1.000031','V5 promoted. Saved expressions and current-GUI production form/sync checks passed; scheduled execution not forced. See Change Logs/CHANGE_NOTES_INTERVAL_ANCHOR_2026-09-15.md.']);
}
wb.recalculate();const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Production dictionary formula error scan'});await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
for(const name of ['Prod Columns','Column Rules','DB Columns','DB Constraints','Guide']){const c=changes.find(c=>c.sheet===name);const cols=before[name][0].length;const range=wb.worksheets.getItem(name).getRangeByIndexes(c.row-1,0,name==='Prod Columns'?2:1,cols);const p=await wb.render({sheetName:name,range:range.address.split('!').pop(),scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after-'+name.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));}
const staged=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(staged);const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));const norm=a=>a.map(r=>r.map(v=>v??''));
for(const s of check.worksheets.items){const expected=before[s.name].map(r=>[...r]);for(const c of changes.filter(c=>c.sheet===s.name))expected[c.row-1]=c.values;if(JSON.stringify(norm(expected))!==JSON.stringify(norm(s.getUsedRange().values)))throw Error('Unexpected dictionary difference '+s.name);}
await fs.copyFile(staged,file);await fs.unlink(staged);await fs.unlink(staged+'.inspect.ndjson').catch(()=>{});await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changes},null,2));console.log({changedRows:changes.length,roundtrip:true});
