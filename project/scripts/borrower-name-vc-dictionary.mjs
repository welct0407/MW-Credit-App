import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root='C:/GitHub/AppSheet-Loan-Project',out=`${root}/outputs/borrower-name-vc-20260915`,file=`${root}/Documents/AppSheet_Data_Dictionary.xlsx`;
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
if(!process.argv.includes('--edit')){for(const sheet of wb.worksheets.items){if(!['Columns','Tables','SQL Production'].includes(sheet.name))continue;const rows=sheet.getUsedRange().values;console.log(JSON.stringify({sheet:sheet.name,headers:rows.slice(0,7),matching:rows.map((r,i)=>({row:i+1,values:r})).filter(x=>x.values[0]==='Loans'&&x.values[2]==='Borrower Name')}));}process.exit(0);}
const original=new Map(wb.worksheets.items.map(s=>[s.name,JSON.stringify(s.getUsedRange().values)]));
const columns=wb.worksheets.getItem('Columns'),rows=columns.getUsedRange().values;
const ix=rows.findIndex(r=>r[0]==='Loans'&&r[2]==='Borrower Name');if(ix<0||rows[ix][3]!=='Physical / Name')throw Error('Expected stored name');
const before=await wb.render({sheetName:'Columns',range:`A${ix+1}:H${ix+1}`,scale:1,format:'png'});await fs.writeFile(`${out}/dictionary-before.png`,new Uint8Array(await before.arrayBuffer()));
columns.getRange(`D${ix+1}:H${ix+1}`).values=[['VC / Name','OLTP + OLAP','Read-only; visible; searchable; display: ชื่อผู้กู้ / Borrower','Current name from referenced borrower; SQL stored copy and maintenance triggers removed. Verified OLTP 3.000069 / OLAP 1.100046.','[Ref Borrowers].[Borrower Name]']];
columns.getRange(`A${ix+1}:H${ix+1}`).format.wrapText=true;
columns.getRange(`A${ix+1}:H${ix+1}`).format.rowHeight=85;
const tables=wb.worksheets.getItem('Tables'),tr=tables.getUsedRange().values,ti=tr.findIndex(r=>r[0]==='Loans');
if(ti<0||tr[ti][3]!==21||tr[ti][4]!==20||tr[ti][5]!==30)throw Error('Unexpected loan counts');
tables.getRange(`B${ti+1}`).values=[['PostgreSQL loan_manager_prod']];tables.getRange(`D${ti+1}:F${ti+1}`).values=[[20,21,31]];
const sql=wb.worksheets.getItem('SQL Production'),sr=sql.getUsedRange().values;
for(let i=1;i<sr.length;i++){
 const r=[...sr[i]];if(r[0]==='Rollback')continue;
 r[1]=String(r[1]).replaceAll('1.100044','1.100046').replaceAll('3.000067','3.000069');
 if(r[2]==='Loans'&&r[3]==='Borrower Name'){r[4]='VC / Name';r[5]='62/62 names verified';r[6]='Both production apps and both SQL test copies';r[7]='[Ref Borrowers].[Borrower Name]. Stored SQL column and two name triggers/functions removed.';}
 sql.getRange(`A${i+1}:H${i+1}`).values=[r];
}
wb.recalculate();
const expected=new Map(wb.worksheets.items.map(s=>[s.name,JSON.stringify(s.getUsedRange().values)]));
for(const [n,v] of original)if(!['Columns','Tables','SQL Production'].includes(n)&&expected.get(n)!==v)throw Error('Unrelated sheet changed');
const preview=await wb.render({sheetName:'Columns',range:`A${ix+1}:H${ix+1}`,scale:1,format:'png'});await fs.writeFile(`${out}/dictionary-after.png`,new Uint8Array(await preview.arrayBuffer()));
await(await SpreadsheetFile.exportXlsx(wb)).save(`${out}/AppSheet_Data_Dictionary.xlsx`);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(`${out}/AppSheet_Data_Dictionary.xlsx`));
for(const [n,v] of expected)if(JSON.stringify(check.worksheets.getItem(n).getUsedRange().values)!==v)throw Error('Export values changed '+n);
await fs.copyFile(`${out}/AppSheet_Data_Dictionary.xlsx`,file);
await fs.writeFile(`${out}/dictionary-verification.json`,JSON.stringify({changedSheets:['Columns','Tables','SQL Production'],unchangedOtherSheets:[...original.keys()].filter(n=>!['Columns','Tables','SQL Production'].includes(n)),loanPhysicalIncludingOrdinal:20,oltpVirtual:21,olapVirtual:31,exportValuesVerified:true},null,2));
console.log('Dictionary updated and re-import verified.');
