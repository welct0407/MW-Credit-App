import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
const input='Documents/AppSheet_Data_Dictionary.xlsx';
const out='outputs/r009-20260919/production/dictionary';
await fs.mkdir(out,{recursive:true});
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const mode=process.argv[2]??'inspect';
const hits=[];
for(const s of w.worksheets.items){
 const rows=s.getUsedRange().values;
 const matches=rows.map((values,i)=>({row:i+1,values})).filter(x=>x.values.some(v=>typeof v==='string'&&/R009|Effective Daily Interest Rate|Login Email/.test(v)));
 if(matches.length) hits.push({sheet:s.name,headers:rows[0],matches});
}
await fs.writeFile(`${out}/inspection.json`,JSON.stringify(hits,null,2));
console.log(JSON.stringify(hits.map(x=>({sheet:x.sheet,headers:x.headers,matches:x.matches.map(r=>({row:r.row,values:r.values.map(v=>typeof v==='string'?v.slice(0,170):v)}))})),null,2));
if(mode==='inspect'){
 const p=await w.render({sheetName:'Dev Differences',range:'A2785:E2789',scale:1,format:'png'});
 await fs.writeFile(`${out}/before.png`,new Uint8Array(await p.arrayBuffer()));
 process.exit(0);
}
assert.equal(mode,'apply');
assert(!w.worksheets.getItem('Prod Columns').getUsedRange().values.some(r=>r[1]==='Partners'&&r[2]==='Login Email'),'R009 dictionary closure is already applied; do not append duplicate rows.');
const norm=rs=>rs.map(r=>r.map(v=>v??null));
const before=w.worksheets.items.map(s=>({name:s.name,values:norm(s.getUsedRange().values),formulas:norm(s.getUsedRange().formulas)}));
const changed=new Set(), edits=[];
function put(sheet,row,values){const s=w.worksheets.getItem(sheet);s.getRangeByIndexes(row-1,0,1,values.length).values=[values];changed.add(`${sheet}:${row}`);edits.push({sheet,row,values});}
function append(sheet,rows){const s=w.worksheets.getItem(sheet),start=s.getUsedRange().values.length+1;for(let i=0;i<rows.length;i++){s.getRangeByIndexes(start+i-1,0,1,rows[i].length).copyFrom(s.getRangeByIndexes(start-2,0,1,rows[i].length),'all');put(sheet,start+i,rows[i]);s.getRangeByIndexes(start+i-1,0,1,rows[i].length).format.wrapText=true;s.getRangeByIndexes(start+i-1,0,1,rows[i].length).format.rowHeight=70;}return start;}
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r009-production';
const doc=await fs.readFile(`${priv}/prod-oltp-after.txt`,'utf8');
const block=doc.split('Column name\tEffective Daily Interest Rate')[1].split(/\nColumn \d/)[0];
const formula=block.match(/App formula\t([^\n]+)/)[1];
assert(formula.includes('[Outstanding Principal] > 0'));
put('Column Rules',1085,['OLTP','Loans','Effective Daily Interest Rate','App formula',`Expression text: ${formula}`]);
// OLAP is a physical SQL-view field. Its retained AppSheet formula metadata is unchanged;
// current GUI/runtime readback proves the displayed value comes from the V26 SQL view.
const col=w.worksheets.getItem('Prod Columns').getRange('A299:I299').values[0];
assert.equal(col[2],'Effective Daily Interest Rate');col[4]='No';col[7]='No';put('Prod Columns',299,col);
const loginStart=append('Prod Columns',['OLTP','OLAP'].map(app=>[app,'Partners','Login Email','Email','No','No','No','No','No']));
append('Column Rules',['OLTP','OLAP'].flatMap(app=>[
 [app,'Partners','Login Email','Sensitive data','Yes'],[app,'Partners','Login Email','App formula',''],
 [app,'Partners','Login Email','Initial value',''],[app,'Partners','Login Email','Required','No'],
 [app,'Partners','Login Email','Searchable','Yes'],
 [app,'Partners','Login Email','Table permission',app==='OLTP'?'READ_ONLY':'ALL_CHANGES']
]));
append('DB Columns',[['Partners','Login Email','8','text','YES','']]);
append('DB Constraints',[['Partners','partners_login_email_nonblank','c','1','CHECK ("Login Email" IS NULL OR btrim("Login Email") <> \'\')']]);
append('DB Logic',[
 ['Unique index','public.Partners','partners_login_email_unique','R009 / V25','UNIQUE (lower(btrim("Login Email"))) WHERE "Login Email" IS NOT NULL'],
 ['View calculation','public','olap_loans_analytics.Effective Daily Interest Rate','R009 / V26','Applicable daily income / Outstanding Principal; zero for nonpositive balance. Exact SQL: database/migrations/V26__effective_daily_interest_rate_outstanding_principal.sql. View signature retained.'],
 ['Column semantics','public.Partners','Login Email / Email','R009 / V25','Login Email uniquely identifies the signed-in actor. Email is notification delivery and may be shared. PROD Email values retained; DEV Email owner-only.']
]);
put('Guide',3,['Production versions','R009: SQL V26; OLTP 3.000231; OLAP 1.100181','19 Sep 2026 App Upgrade from immutable RC1 1.000006 each. Rollback OLTP 3.000228 / OLAP 1.100178; restore-tested private V24 dump.']);
put('Guide',5,['Database','PROD and captured DEV V26','V25 Partner login identity; V26 outstanding-principal effective daily rate. Older dated entries below remain history.']);
append('Guide',[['R009 production model','Affected production rows updated; Dev Differences R009 rows closed','DEV 1.000033 / 1.000015. Owner GUI definition included. See outputs/r009-20260919/production/REPORT.md and release-manifest.json. Older snapshots are not current whole-app inventories.']]);
const ds=w.worksheets.getItem('Dev Differences');
for(let row=2770;row<=2789;row++){
 const v=ds.getRange(`A${row}:E${row}`).values[0];assert(String(v[0]).includes('R009'));
 v[0]=row===2773?'R009 retained environment difference':'R009 promoted / closed';
 v[3]=row===2773?'PROD contact data retained. Shared expressions deployed.':'Promoted 19 Sep 2026: PROD V26 / OLTP 3.000231 / OLAP 1.100181. Definition matches frozen RC1.';
 if(row===2788)v[4]='Frozen DEV 1.000033 / 1.000015; RC1 1.000006 each; production/REPORT.md.';
 else v[4]=v[4].replace(/Pending promotion\.?/g,'Promoted and closed.');
 put('Dev Differences',row,v);
 ds.getRange(`A${row}:E${row}`).format.rowHeight=row>=2775&&row<=2786?220:90;
}
append('App Settings',[
 ['production-oltp','Notifications','R009 identity recipients','12 shared expressions; exclude actor Partner Row ID; deduplicate nonblank Email','outputs/r009-20260919/identity-routing.json; RC1 App Upgrade to 3.000231'],
 ['production pair','Scheduled jobs','Canonical app execution guard','DEV/PROD internal names allowed; RC1 excluded before business steps','production/source-mapping-validation.json; prior server-side guard tests reused'],
 ['production-oltp','Notifications','Closure summaries','Positive exact-receipt closure only; four bodies use Loan Key','R009 tests and production/REPORT.md']
]);
w.recalculate();
const preview=await w.render({sheetName:'Dev Differences',range:'A2787:E2789',scale:1,format:'png'});
await fs.writeFile(`${out}/after.png`,new Uint8Array(await preview.arrayBuffer()));
const loginPreview=await w.render({sheetName:'Prod Columns',range:`A${loginStart}:I${loginStart+1}`,scale:1,format:'png'});
await fs.writeFile(`${out}/login-columns.png`,new Uint8Array(await loginPreview.arrayBuffer()));
const scan=await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20}});
await fs.writeFile(`${out}/error-scan.jsonl`,scan.ndjson);
const output=`${out}/AppSheet_Data_Dictionary.xlsx`;
await (await SpreadsheetFile.exportXlsx(w)).save(output);
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(output));
for(const old of before){const s=reopened.worksheets.getItem(old.name),vals=norm(s.getUsedRange().values),forms=norm(s.getUsedRange().formulas);for(let i=0;i<old.values.length;i++){if(!changed.has(`${old.name}:${i+1}`)){assert.deepEqual(vals[i],old.values[i],`${old.name}:${i+1} values`);assert.deepEqual(forms[i],old.formulas[i],`${old.name}:${i+1} formulas`);}}}
for(const e of edits){const blank=v=>v===''?null:v;assert.deepEqual(reopened.worksheets.getItem(e.sheet).getRangeByIndexes(e.row-1,0,1,e.values.length).values[0].map(blank),e.values.map(blank));}
await fs.writeFile(`${out}/verification.json`,JSON.stringify({changedRows:edits.map(({sheet,row})=>({sheet,row})),unchangedRowsValuesAndFormulasPreserved:true,output},null,2));
console.log(JSON.stringify({output,changedRows:edits.length,unchangedRowsPreserved:true}));
