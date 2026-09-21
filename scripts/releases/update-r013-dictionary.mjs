import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const input='Documents/AppSheet_Data_Dictionary.xlsx';
const dir='outputs/r013-20260921';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet=wb.worksheets.getItem('Dev Differences');
const existing=sheet.getUsedRange().values;
assert(!existing.some(r=>String(r[0]).startsWith('R013')));
const before=wb.worksheets.items.map(s=>({name:s.name,values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}));
const rows=[
 ['R013 DEV SQL','Cash Ledger[Created At]','Payment insert timestamp','PROD V29: all ledger inserts use current Bangkok server time.','DEV V30: new System/Payment entries inherit Payments[Created At]; missing source time falls back to current Bangkok server time. Other sources and existing rows unchanged.'],
 ['R013 receipt mapping','Payments[Payment Date], Payments[Created At]','Existing receipt fields','Automatic receipt payment creation remains disabled.','Receipt summary prepares Payment Date and Created At from the printed Bangkok transfer date/time. No new columns. No payment writes; future posting requires owner instruction.'],
 ['R013 DEV OLTP','Cash Account Statement Recent[Statement Time]','Time: Ignore seconds','PROD 3.000240: TRUE.','DEV 1.000064: TRUE, matching production. Owner explicitly retained hours/minutes only. Stored receipt transfer time flows through the existing ledger timestamp; no new columns.']];
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

