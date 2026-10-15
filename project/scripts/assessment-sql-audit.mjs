import fs from 'node:fs/promises';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/assessment-sql-20260915';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/assessment-sql-20260915';
function index(doc){let schema='';const map={};for(const {rows:r} of doc){if(!r.length)continue;const[k,v]=r[0],o=Object.fromEntries(r.filter(x=>x.length===2));if(k==='Schema Name')schema=v;let key=k==='Column name'?`Column:${schema}:${v}`:k==='Action name'?`${k}:${o['For a record of this table']}:${v}`:`${k}:${v}`;if(map[key])throw Error('Duplicate key '+key);map[key]=o;}return map;}
const before=index(JSON.parse(await fs.readFile(priv+'/olap-copy-before.json','utf8'))),after=index(JSON.parse(await fs.readFile(priv+'/olap-copy-after.json','utf8')));
const changes=[];
for(const k of new Set([...Object.keys(before),...Object.keys(after)])){
 if(!before[k]||!after[k]){changes.push({object:k,kind:before[k]?'removed':'added',definition:after[k]??before[k]});continue;}
 for(const f of new Set([...Object.keys(before[k]),...Object.keys(after[k])]))if(before[k][f]!==after[k][f])changes.push({object:k,field:f,before:before[k][f]??null,after:after[k][f]??null});
}
await fs.writeFile(out+'/app-definition-diff.json',JSON.stringify(changes,null,2));
const key=(await fs.readFile('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914/appsheet-trial-api-key.txt','utf8')).trim();
const data={};
for(const table of ['Calendar','Loan Assessment']){
 const response=await fetch(`https://www.appsheet.com/api/v2/apps/494cd013-0d9b-482f-9559-c9d83059de91/tables/${encodeURIComponent(table)}/Action`,{method:'POST',headers:{'Content-Type':'application/json',ApplicationAccessKey:key},body:JSON.stringify({Action:'Find',Properties:{Locale:'en-US',Timezone:'Asia/Bangkok'},Rows:[]}),signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error('Find failed '+response.status);data[table]=await response.json();await fs.writeFile(priv+'/'+table+'-final.json',JSON.stringify(data[table]));
}
const oldCalendar=JSON.parse(await fs.readFile(priv+'/Calendar.json','utf8'));
const fields=['Date','Year','Month','Month Name','Year Month','Week','Year Week','Week Start','Quarter','Day of Week','Day of Month'];
let calendarComparisons=0;for(const row of oldCalendar){const r=data.Calendar.find(x=>x.Date===row.Date);if(!r)throw Error('Missing Calendar date');for(const f of fields){calendarComparisons++;if(r[f]!==row[f])throw Error('Calendar value changed '+f);}}
if(data.Calendar.length!==oldCalendar.length)throw Error('Calendar row count changed');
const a=data['Loan Assessment'][0],old=JSON.parse(await fs.readFile(priv+'/Loan Assessment.json','utf8'))[0];
const resultFields=['Current Outstanding Principal','Interest Earned from Active Loans','Earliest Eligible Date','Days Until Eligible','Projected Interest at Eligible Date','Outstanding Principal at Eligible Date','Minimum Profit at Eligible Date','Required Coverage at Eligible Date','Safety Margin','Current Coverage Margin','Coverage Ratio at Eligible Date','Recommendation Status'];
const resultDifferences=resultFields.filter(f=>a[f]!==old[f]).map(f=>({field:f}));
if(resultDifferences.length)throw Error('Restored baseline result difference: '+JSON.stringify(resultDifferences));
const sql=Object.values(after).filter(v=>v['Column name']?.startsWith('SQL '));
if(sql.some(v=>v['Column name']!=='SQL Refresh Token'&&v['Read-Only']!=='Yes'))throw Error('Editable result column');
if(sql.some(v=>v['Column name']!=='SQL Calculated At'&&v.Hidden!=='Yes'))throw Error('Visible technical result field');
if(after['Column:Loan Assessment_Schema:Row ID'].Key!=='Yes'||after['Column:Calendar_Schema:Date'].Key!=='Yes')throw Error('Key changed');
const dashboard=async name=>{const text=await fs.readFile(priv+'/'+name+'.txt','utf8');const start=text.indexOf('region "Analytics Data":');if(start<0)throw Error('Analytics region missing');return text.slice(start,text.indexOf('\n  - region ',start+1));};
if(await dashboard('analytics-test')!==await dashboard('analytics-control'))throw Error('Dashboard summary differs');
const calendarUi=await fs.readFile(priv+'/calendar-final-ui.txt','utf8');if(!calendarUi.includes('8/7/2026 2026 Rebuild Daily Analytics - This Date'))throw Error('Calendar list not rendered');
const result={version:after[':undefined'].Version,rollbackVersion:before[':undefined'].Version,definitionChanges:changes.length,calendarRows:data.Calendar.length,calendarComparisons,calendarMismatches:0,restoredAssessmentComparisons:resultFields.length,restoredAssessmentMismatches:0,readonlyResultsVerified:true,keysPreserved:true,dashboardSummaryMetricsMatched:8,calendarListRendered:true};
await fs.writeFile(out+'/app-verification.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
console.log(JSON.stringify({changedObjects:[...new Set(changes.map(x=>x.object))].filter(k=>!k.startsWith('Column:Loan Assessment')&&!k.startsWith('Column:Calendar'))}));
