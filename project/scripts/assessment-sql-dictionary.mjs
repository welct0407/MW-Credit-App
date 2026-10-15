import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root='C:/GitHub/AppSheet-Loan-Project',out=root+'/outputs/assessment-sql-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/assessment-sql-20260915';
const file=root+'/Documents/AppSheet_Data_Dictionary.xlsx';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify({sheets:wb.worksheets.items.map(s=>s.name),style:wb.worksheets.getItem('SQL Production').getRange('A1:H3').values}));
 const png=await wb.render({sheetName:'SQL Production',range:'A1:G3',scale:1,format:'png'});await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await png.arrayBuffer()));process.exit(0);
}
await fs.copyFile(file,priv+'/dictionary-before.xlsx');
const unchanged=new Map(wb.worksheets.items.filter(s=>s.name!=='OLAP Assessment SQL').map(s=>[s.name,JSON.stringify(s.getUsedRange().values)]));
const doc=JSON.parse(await fs.readFile(priv+'/olap-copy-after.json','utf8'));
let schema='',version='',rows=[];
for(const t of doc){const v=Object.fromEntries(t.rows.filter(r=>r.length===2));if(v.Version)version=v.Version;if(v['Schema Name'])schema=v['Schema Name'];if(!v['Column name']||!['Loan Assessment_Schema','Calendar_Schema'].includes(schema))continue;
 rows.push(['SQL assessment',version,schema.replace('_Schema',''),v['Column name'],`${v['Virtual?']==='Yes'?'VC':'Physical'} / ${v.Type}`,'Test copy only; production unchanged',`Key ${v.Key}; read-only ${v['Read-Only']}; hidden ${v.Hidden}`,String(v['App formula']??v['Initial value']??'Stored SQL value / generated date').replace(/^=/,'')]);
}
rows.unshift(['Scope',version,'Loan Assessment','Source','PostgreSQL view','Test copy only; review pending','Own input/result table; reads shared financial data','public.Loan Assessment SQL Lab View → public.Loan Assessment SQL Lab'],['Scope',version,'Calendar','Source','Generated SQL view','Test copy only; read-only','153 dates retained for Daily Analytics; 16 assessment VCs removed','public.OLAP Calendar SQL Lab; 2026-08-01 through 2026-12-31'],['Rollback','1.000013','OLAP test copy','Restore app version','AppSheet version','Production versions unchanged','Production OLAP 1.100046; OLTP 3.000069','Restores original Loan Assessment source and Calendar Help Table / Sheet1'],['Workflow',version,'Loan Assessment','Refresh Assessment','Data action','Test copy only','Trigger recalculates current row; result timestamp shown','SQL Refresh Token = UNIQUEID()'],['Freshness',version,'Loan Assessment','SQL Source Current','View calculation','Checked on sync','Source fingerprint/date mismatch hides stale outputs; offline changes require sync','assessment_lab.fingerprint(assessment_lab.inputs(Ref Borrower)); Bangkok as-of date'],['Window',version,'Loan Assessment','Forecast boundaries','Explicit dates','Like-for-like test window','Rolling horizon and shared/per-user input workflow require review before cutover','SQL Forecast Start 2026-08-01; SQL Forecast End 2026-12-31']);
const sheet=wb.worksheets.items.find(s=>s.name==='OLAP Assessment SQL')??wb.worksheets.add('OLAP Assessment SQL');
sheet.getUsedRange().clear({applyTo:'contents'});
sheet.getRange('A1:H1').values=[['Experiment','App version','Table','Column / setting','Type','Scope / status','Purpose / dependencies','Exact definition']];
sheet.getRange(`A2:H${rows.length+1}`).values=rows;
sheet.getRange(`A1:H${rows.length+1}`).format.font={name:'Arial',size:10};
sheet.getRange('A1:H1').format={fill:'#17365D',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:30,wrapText:true};
sheet.getRange(`A2:H${rows.length+1}`).format.wrapText=true;
for(let i=0;i<rows.length;i++)sheet.getRange(`A${i+2}:H${i+2}`).format.rowHeight=rows[i][7].length>600?180:rows[i][7].length>200?100:65;
for(const [c,w] of [['A',17],['B',15],['C',23],['D',35],['E',20],['F',30],['G',55],['H',100]])sheet.getRange(`${c}1:${c}${rows.length+1}`).format.columnWidth=w;
sheet.showGridLines=false;sheet.freezePanes.freezeRows(1);wb.recalculate();
const png=await wb.render({sheetName:sheet.name,range:'A1:H4',scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after.png',new Uint8Array(await png.arrayBuffer()));
const rec=rows.findIndex(r=>r[3]==='Recommendation');const p2=await wb.render({sheetName:sheet.name,range:`C${rec+2}:H${rec+2}`,scale:1,format:'png'});await fs.writeFile(out+'/dictionary-formula.png',new Uint8Array(await p2.arrayBuffer()));
const output=out+'/AppSheet_Data_Dictionary.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(output);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(output));
for(const [name,v] of unchanged)if(JSON.stringify(check.worksheets.getItem(name).getUsedRange().values)!==v)throw Error('Unrelated sheet changed '+name);
const norm=a=>a.map(r=>r.map(v=>v===''?null:v));if(JSON.stringify(norm(check.worksheets.getItem(sheet.name).getRange(`A2:H${rows.length+1}`).values))!==JSON.stringify(norm(rows)))throw Error('Export values changed');
await fs.copyFile(output,file);await fs.unlink(output);
await fs.writeFile(out+'/dictionary-verification.json',JSON.stringify({sheet:sheet.name,rows:rows.length,version,unchangedSheets:[...unchanged.keys()],reimportVerified:true},null,2));
console.log(JSON.stringify({sheet:sheet.name,rows:rows.length,version,reimportVerified:true}));
