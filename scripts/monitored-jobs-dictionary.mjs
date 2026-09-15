import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/monitored-jobs-20260915';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(process.argv.includes('--finalize')){
 const expected=structuredClone(before);
 const i=expected.Guide.findIndex(r=>r[0]==='Development monitored jobs');
 if(i<0)throw Error('Implementation inventory required first');
 expected.Guide[i][2]='Owner accepted both development apps on 16 September 2026. Natural hourly 00:00 and daily charge 00:05 runs Complete (24 charge runs). Calendar removed; original 42 dates reconcile with stable IDs. Error-email delivery unverified.';
 wb.worksheets.getItem('Guide').getRangeByIndexes(i,0,1,3).values=[expected.Guide[i]];
 wb.recalculate();
 const stage=out+'/dictionary-staged.xlsx';
 await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
 const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(stage));
 const norm=rs=>rs.map(r=>r.map(v=>v??''));
 for(const s of reopened.worksheets.items)if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(expected[s.name])))throw Error('Unexpected finalization difference '+s.name);
 const p=await wb.render({sheetName:'Guide',range:'A17:C17',scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-after-Guide.png',new Uint8Array(await p.arrayBuffer()));
 await fs.copyFile(stage,file);await fs.unlink(stage);await fs.unlink(stage+'.inspect.ndjson').catch(()=>{});
 await fs.writeFile(out+'/dictionary-acceptance.json',JSON.stringify({accepted:'2026-09-16',allSheetsRoundtrip:true,changedCell:'Guide!C17'},null,2));
 process.exit(0);
}
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([n,r])=>[n,{head:r[0],rows:r.length}]))));
 await fs.writeFile('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/monitored-jobs-20260915/dictionary-rows.json',JSON.stringify(before));
 const p=await wb.render({sheetName:'Dev Differences',range:'A1:F4',scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));
 process.exit(0);
}
const model=JSON.parse(await fs.readFile(out+'/model-evidence.json'));
if(before.Guide.some(r=>r[0]==='Development monitored jobs'))throw Error('Already documented; inspect before rerunning');
const expected=structuredClone(before),changed=[];
function put(sheet,i,row){expected[sheet][i]=row;changed.push({sheet,row:i+1});}
function add(sheet,row){put(sheet,expected[sheet].length,row);}
function diff(app,obj,prop,prod,dev){const i=expected['Dev Differences'].findIndex(r=>r[0]===app&&r[1]===obj&&r[2]===prop);const row=[app,obj,prop,prod,dev];i<0?add('Dev Differences',row):put('Dev Differences',i,row);}
for(let i=1;i<expected['Dev Differences'].length;i++){
 const r=[...expected['Dev Differences'][i]];
 if(r[1]==='tables: Calendar'){r[4]='Removed from development app; no Calendar references remain';put('Dev Differences',i,r);}
 if(r[1]==='Flyway'){r[4]='V11; monitored analytics migration, development only';put('Dev Differences',i,r);}
 if(r[0]==='Database'&&r[1]==='loan-daily-charges'){r[3]='Active production pg_cron 00:05 Bangkok';r[4]='Paused development pg_cron; AppSheet Generate Daily Charges enabled at 00:05 Bangkok';put('Dev Differences',i,r);}
 if(r[0]==='OLTP'&&r[1].startsWith('Generate Daily Charges')){r[4]='Enabled; 00:05 Bangkok; existing SQL request action and eligibility filter; monitored success/error tests passed';put('Dev Differences',i,r);}
}
for(const c of model.newColumns){
 for(const [p,v]of Object.entries({Type:c.type,Virtual:c.virtual,Key:c.key,Label:c.label,Hidden:c.hidden,'Read-Only':c.readOnly,Editable_If:c.editableIf||'Blank',Searchable:c.searchable,'Initial value':'Blank','App formula':'Blank','Reset on edit?':'No',Required:'No'}))diff(c.app,'Statistics.'+c.name,p,'Absent',v);
}
diff('OLAP','tables: Calendar','Availability','Present; SQL date view','Removed, along with 12-column schema and Calendar views/actions');
diff('OLAP','tables: Daily Analytics','Are updates allowed?','ALL_CHANGES','READ_ONLY; SQL refresh owns snapshot writes');
for(const name of model.removedActions)diff('OLAP',name,'Availability','Present','Removed; V11 upsert replaces delete/create');
for(const name of model.removedViews)diff('OLAP',name,'Availability','Present','Removed with Calendar or read-only snapshot table');
for(const [name,mode]of [['Refresh Daily Analytics','Recent'],['Full Rebuild Daily Analytics','Full']]){
 diff('OLAP',name,'Do this','REF_ACTION via Calendar','SET_COLUMN_VALUE Statistics.Analytics Refresh Request');
 diff('OLAP',name,'Request expression','Not applicable',`=CONCATENATE(TEXT(TODAY(), "YYYY-MM-DD"), "|${mode}|", UNIQUEID())`);
}
diff('OLAP','Refresh Daily Analytics','Only if','Calendar dates exist; Dashboard','=AND(CONTEXT("View") = "Dashboard", COUNT(Loans[Row ID]) > 0)');
diff('OLAP','Full Rebuild Daily Analytics','Confirmation / availability','Dashboard; full rebuild confirmation','Preserved exactly');
for(const name of model.generatedProcessTables)diff('OLAP','tables: '+name,'Availability','Absent','AppSheet-generated native process state; READ_ONLY, hidden; not PostgreSQL business data');
for(const app of ['OLTP','OLAP'])diff(app,'Statistics.Row ID','Regeneration metadata','Fixed definition Yes; Editable Initial Value No','Fixed definition No; Editable Initial Value Yes. Key, hidden, read-only and UNIQUEID(PackedUUID) unchanged.');
add('DB Columns',['Statistics (development V11 only)','Analytics Refresh Request',3,'text','YES','']);
add('DB Logic',['Development index','Daily Analytics','daily_analytics_snapshot_date_unique','V11','UNIQUE (Snapshot Date); preserves one snapshot per date and existing row keys']);
add('DB Logic',['Development function','public','refresh_daily_analytics(date,date)','V11','Atomic date-range upsert; advisory transaction lock; generate_series dates; Model 2 metrics preserved. Exact SQL in V11__monitored_analytics_refresh.sql']);
add('DB Logic',['Development function / trigger','Statistics','analytics_refresh_request','V11','AFTER INSERT OR UPDATE OF Analytics Refresh Request; Bangkok date|Recent or Full|token. Unchanged request no-op, invalid request rolls back.']);
for(let i=1;i<expected['DB Logic'].length;i++){
 const r=[...expected['DB Logic'][i]];if(r[2]!=='loan-daily-charges')continue;
 r[3]='V9: production active; development paused';r[4]='Development AppSheet schedule takes over at 00:05 Bangkok; SQL generation logic retained. Never run both schedulers together.';put('DB Logic',i,r);
}
for(let i=1;i<expected['App Settings'].length;i++){
 const r=[...expected['App Settings'][i]];if(!r[0].startsWith('development-'))continue;
 const app=r[0].endsWith('oltp')?'OLTP':'OLAP';
 if(r[1]==='Version'){r[3]=model.versions[app];r[4]='Saved appdoc and current GUI; rollback '+model.rollbackVersions[app];put('App Settings',i,r);}
 if(r[1]==='Bot'&&r[2]==='Generate Daily Charges'){r[3]='Enabled; Daily 00:05 Bangkok; SQL request';r[4]='Synthetic error and successful retry in Automation Monitor';put('App Settings',i,r);}
 if(r[1]==='Bot'&&r[2]==='Refresh Daily Analytics Daily'){r[3]='Enabled; Hourly :00 Bangkok; Statistics request';r[4]='Single inline Set row values step; no outward task; GUI run Complete';put('App Settings',i,r);}
 if(r[1]==='Bot'&&r[2]==='Refresh Daily Analytics Daily 2'){r[3]='Removed';r[4]='Duplicate disabled Calendar bot removed';put('App Settings',i,r);}
}
for(const app of ['oltp','olap']){
 add('App Settings',['development-'+app,'Deployment','App state','Deployed','Needed for scheduled events; required deployment checks passed; development UUID only']);
 add('App Settings',['development-'+app,'Monitoring','Audit History alerts','Enabled','Read in current editor; owner did not receive test charge error email. Delivery unverified.']);
}
for(let i=1;i<expected.Guide.length;i++)if(expected.Guide[i][0]==='Database')put('Guide',i,['Database','Production V10; development V11','V11 adds approved Statistics request and SQL analytics upsert only in development. Production catalog retained; development additions labeled separately.']);
add('Guide',['Development monitored jobs','OLTP 1.000048; OLAP 1.000050; Flyway V11','AppSheet schedules daily charges and hourly analytics. Calendar removed from DEV app. 42/42 snapshot dates reconcile; IDs stable. Owner acceptance pending; email delivery unverified.']);
const txt=v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v??'';
for(const [name,rows]of Object.entries(expected)){
 const sh=wb.worksheets.getItem(name),old=before[name];
 for(let i=0;i<rows.length;i++){
  if(JSON.stringify(rows[i])===JSON.stringify(old[i]))continue;
  const r=sh.getRangeByIndexes(i,0,1,rows[0].length);
  if(i>=old.length){r.copyFrom(sh.getRangeByIndexes(old.length-1,0,1,rows[0].length),'all');r.format.wrapText=true;r.format.verticalAlignment='top';r.format.rowHeight=name==='Dev Differences'?72:105;}
  r.values=[rows[i].map(txt)];
 }
}
wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Dictionary error scan'});await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
for(const [sheetName,range]of [['Guide','A17:C17'],['Dev Differences','A395:E397'],['DB Logic','A60:E62']]){const p=await wb.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after-'+sheetName.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));}
const stage=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(stage));
const norm=rs=>rs.map(r=>r.map(v=>v??''));
for(const s of reopened.worksheets.items)if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(expected[s.name])))throw Error('Unexpected dictionary difference '+s.name);
await fs.copyFile(stage,file);await fs.unlink(stage);await fs.unlink(stage+'.inspect.ndjson').catch(()=>{});
await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changed,rows:Object.fromEntries(Object.entries(expected).map(([n,r])=>[n,r.length]))},null,2));
console.log({allSheetsRoundtrip:true,changedRows:changed.length});
