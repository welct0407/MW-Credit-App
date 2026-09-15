import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root='C:/GitHub/AppSheet-Loan-Project';
const out=root+'/outputs/development-instance-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/development-instance-20260915';
const file=root+'/Documents/AppSheet_Data_Dictionary.xlsx';
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const assessment=wb.worksheets.getItem('OLAP Assessment SQL');
if(!process.argv.includes('--edit')){
 const p=await wb.render({sheetName:assessment.name,range:'A1:H3',scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));
 console.log('Rendered current assessment source inventory');process.exit(0);
}
const evidence=JSON.parse(await fs.readFile(out+'/verification.json','utf8'));
if(!evidence.bindingsVerified || !evidence.syncVerified)throw Error('Live verification must precede final documentation');
await fs.copyFile(file,priv+'/dictionary-before-development.xlsx');
const original=new Map(wb.worksheets.items.map(s=>[s.name,JSON.stringify(s.getUsedRange().values)]));
const rows=[['App','Version','Logical table','Source path','Data source','Instance','Database','Status']];
for(const app of evidence.apps)for(const t of app.tables)rows.push([app.name,app.version,t.name,t.path,evidence.dataSource,evidence.instance,'loan_manager_prod','Development only; source binding verified']);
const sheet=wb.worksheets.add('SQL Development');
sheet.getRange(`A1:H${rows.length}`).values=rows;
sheet.getRange(`A1:H${rows.length}`).format.wrapText=true;
sheet.getRange(`A1:H${rows.length}`).format.rowHeight=60;
sheet.getRange('A1:H1').format.fill='#17365D';
sheet.getRange('A1:H1').format.font.color='#FFFFFF';
sheet.getRange('A1:H1').format.font.bold=true;
for(const [col,width] of [['A',235],['B',90],['C',160],['D',200],['E',150],['F',245],['G',150],['H',240]])sheet.getRange(`${col}:${col}`).format.columnWidth=width;
const ar=assessment.getUsedRange().values;
for(let i=1;i<ar.length;i++){
 if(ar[i][1]==='1.000023')ar[i][1]=evidence.apps.find(a=>a.kind==='OLAP').version;
 if(ar[i][0]==='Scope')ar[i][6]='Own input/result table; development financial data on '+evidence.instance;
}
assessment.getUsedRange().values=ar;
wb.recalculate();
for(const [name,v] of original)if(name!==assessment.name&&JSON.stringify(wb.worksheets.getItem(name).getUsedRange().values)!==v)throw Error('Unrelated sheet changed: '+name);
for(const [name,range,label] of [[sheet.name,'A1:H4','development'],[assessment.name,'A1:H3','assessment']]){
 const p=await wb.render({sheetName:name,range,scale:1,format:'png'});await fs.writeFile(out+'/dictionary-'+label+'.png',new Uint8Array(await p.arrayBuffer()));
}
const target=out+'/AppSheet_Data_Dictionary.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(target);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(target));
const norm=a=>a.map(r=>r.map(v=>v===''?null:v));
for(const s of wb.worksheets.items)if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(check.worksheets.getItem(s.name).getUsedRange().values)))throw Error('Export mismatch '+s.name);
await fs.copyFile(target,file);await fs.unlink(target);
console.log('Development inventory added; unrelated sheets and export verified');
