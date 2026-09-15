import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root='C:/GitHub/AppSheet-Loan-Project', out=root+'/outputs/assessment-workflow-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/assessment-sql-20260915';
const file=root+'/Documents/AppSheet_Data_Dictionary.xlsx';
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const sheet=wb.worksheets.getItem('OLAP Assessment SQL');
if(!process.argv.includes('--edit')){
 const p=await wb.render({sheetName:sheet.name,range:'C5:H6',scale:1,format:'png'});
 await fs.writeFile(out+'/before.png',new Uint8Array(await p.arrayBuffer()));
 console.log(JSON.stringify(sheet.getRange('A2:H7').values));process.exit(0);
}
await fs.copyFile(file,priv+'/dictionary-before-remove-refresh.xlsx');
const original=new Map(wb.worksheets.items.map(s=>[s.name,JSON.stringify(s.getUsedRange().values)]));
const doc=JSON.parse(await fs.readFile(priv+'/after-remove-refresh.json','utf8'));
const defs=doc.map(t=>Object.fromEntries(t.rows.filter(r=>r.length===2)));
const rows=sheet.getUsedRange().values;
for(let i=1;i<rows.length;i++){
 const r=rows[i]; if(r[1]==='1.000022')r[1]='1.000023';
 if(r[3]==='Refresh Assessment'){r[3]='Save inputs';r[4]='Normal app update';r[6]='No separate refresh action. Input save invokes existing database triggers.';r[7]='Input update → database calculation → automatic sync returns stored results.';}
 if(['Recommendation','Recommendation Status'].includes(r[3]))r[7]=defs.find(d=>d['Column name']===r[3])['App formula'].replace(/^=/,'');
}
sheet.getUsedRange().values=rows;
const rec=rows.findIndex(r=>r[3]==='Recommendation')+1;
sheet.getRange(`A${rec}:H${rec}`).format.rowHeight=260;
wb.recalculate();
for(const [name,v] of original)if(name!==sheet.name&&JSON.stringify(wb.worksheets.getItem(name).getUsedRange().values)!==v)throw Error('Unrelated sheet changed');
for(const [name,range] of [['workflow','C5:H6'],['recommendation',`C${rec}:H${rec}`]]){const p=await wb.render({sheetName:sheet.name,range,scale:1,format:'png'});await fs.writeFile(out+'/'+name+'.png',new Uint8Array(await p.arrayBuffer()));}
const target=out+'/AppSheet_Data_Dictionary.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(target);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(target));
const norm=a=>a.map(r=>r.map(v=>v===''?null:v));
for(const s of wb.worksheets.items)if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(check.worksheets.getItem(s.name).getUsedRange().values)))throw Error('Export mismatch '+s.name);
await fs.copyFile(target,file);await fs.unlink(target);
await fs.writeFile(out+'/verification.json',JSON.stringify({version:'1.000023',rollback:'1.000022',removedAction:'Refresh Assessment',editedColumns:['Recommendation','Recommendation Status'],otherSheetsPreserved:true,exportVerified:true},null,2));
console.log('Dictionary updated and reimport verified');
