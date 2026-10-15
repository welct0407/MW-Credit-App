import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const input='Documents/AppSheet_Data_Dictionary.xlsx';
const dir='outputs/r011-20260920/account-alias';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet=wb.worksheets.getItem('Dev Differences');
const existing=sheet.getUsedRange().values;
assert(!existing.some(r=>r[1]==='Cash Accounts[Alternative Account Number]'));
const before=wb.worksheets.items.map(s=>({name:s.name,values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}));
const rows=[
 ['R011 DEV SQL','Cash Accounts[Alternative Account Number]','Physical column','Absent; PROD V27','DEV V29: nullable text; no default or backfill. Second receiving identifier for the same cash account. Existing keys, holder, balances and ledger logic unchanged.'],
 ['R011 DEV OLTP','Cash Accounts[Alternative Account Number]','Column configuration','Absent','Text; Show TRUE; Editable FALSE; Required FALSE; PII TRUE; Search TRUE; Key/Label FALSE; no formula or initial value. Display name: เลขบัญชีสำรอง / Alternative Account Number. Cash Accounts remains read-only.'],
 ['R011 DEV OLAP','Cash Accounts[Alternative Account Number]','Column configuration','Absent','Text; Show/Editable/PII/Search TRUE; Required/Key/Label FALSE; no formula or initial value. Display name: เลขบัญชีสำรอง / Alternative Account Number. Cash Accounts permits Adds/Updates, not Deletes.']
];
const start=existing.length+1,end=start+rows.length-1;
for(let r=start;r<=end;r++)sheet.getRange(`A${r}:E${r}`).copyFrom(sheet.getRange(`A${start-1}:E${start-1}`),'all');
sheet.getRange(`A${start}:E${end}`).values=rows;
sheet.getRange(`A${start}:E${end}`).format.wrapText=true;
sheet.getRange(`A${start}:E${end}`).format.rowHeight=145;
wb.recalculate();
await fs.mkdir(dir,{recursive:true});
const pic=await wb.render({sheetName:'Dev Differences',range:`A${start}:E${end}`,scale:1,format:'png'});
await fs.writeFile(`${dir}/dictionary-after.png`,new Uint8Array(await pic.arrayBuffer()));
const out=`${dir}/.tmp/dictionary.xlsx`;
await fs.mkdir(`${dir}/.tmp`,{recursive:true});
await (await SpreadsheetFile.exportXlsx(wb)).save(out);
const after=await SpreadsheetFile.importXlsx(await FileBlob.load(out));
for(const b of before){const a=after.worksheets.getItem(b.name);assert.deepEqual(a.getUsedRange().values.slice(0,b.values.length),b.values);assert.deepEqual(a.getUsedRange().formulas.slice(0,b.formulas.length),b.formulas);}
assert.deepEqual(after.worksheets.getItem('Dev Differences').getRange(`A${start}:E${end}`).values,rows);
await fs.copyFile(out,input);
await fs.writeFile(`${dir}/dictionary-verification.json`,JSON.stringify({range:`A${start}:E${end}`,priorValuesAndFormulasPreserved:true,rowsAdded:rows.length},null,2));
console.log(JSON.stringify({start,end,output:input}));
