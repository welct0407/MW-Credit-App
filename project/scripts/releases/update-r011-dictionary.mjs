import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const input='Documents/AppSheet_Data_Dictionary.xlsx';
const dir='outputs/r011-20260920/dictionary';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet=wb.worksheets.getItem('Dev Differences');
const existing=sheet.getUsedRange().values;
await fs.mkdir(dir,{recursive:true});
if((process.argv[2]??'inspect')==='inspect'){
 console.log(JSON.stringify({rows:existing.length,header:existing[0],tail:existing.slice(-2)}));
 const pic=await wb.render({sheetName:'Dev Differences',range:`A${existing.length-1}:E${existing.length}`,scale:1,format:'png'});
 await fs.writeFile(`${dir}/before.png`,new Uint8Array(await pic.arrayBuffer()));
}else{
 assert(!existing.some(r=>r.some(v=>String(v).includes('R011'))),'R011 already exists; inspect before editing');
 const rows=JSON.parse(await fs.readFile(`${dir}/rows.json`,'utf8'));
 assert(rows.every(r=>r.length===5));
 const before=wb.worksheets.items.map(s=>({name:s.name,values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}));
 const start=existing.length+1,end=existing.length+rows.length;
 for(let r=start;r<=end;r++)sheet.getRange(`A${r}:E${r}`).copyFrom(sheet.getRange(`A${start-1}:E${start-1}`),'all');
 sheet.getRange(`A${start}:E${end}`).values=rows;
 sheet.getRange(`A${start}:E${end}`).format.wrapText=true;
 sheet.getRange(`A${start}:E${end}`).format.rowHeight=145;
 wb.recalculate();
 const pic=await wb.render({sheetName:'Dev Differences',range:`A${start}:E${end}`,scale:1,format:'png'});
 await fs.writeFile(`${dir}/after.png`,new Uint8Array(await pic.arrayBuffer()));
 const out=`${dir}/dictionary.xlsx`;
 await (await SpreadsheetFile.exportXlsx(wb)).save(out);
 const after=await SpreadsheetFile.importXlsx(await FileBlob.load(out));
 for(const b of before){const a=after.worksheets.getItem(b.name);assert.deepEqual(a.getUsedRange().values.slice(0,b.values.length),b.values);assert.deepEqual(a.getUsedRange().formulas.slice(0,b.formulas.length),b.formulas);}
 assert.deepEqual(after.worksheets.getItem('Dev Differences').getRange(`A${start}:E${end}`).values,rows);
 await fs.copyFile(out,input);
 await fs.writeFile(`${dir}/verification.json`,JSON.stringify({range:`A${start}:E${end}`,allPriorValuesAndFormulasPreserved:true,rowsAdded:rows.length},null,2));
 console.log(JSON.stringify({start,end,output:input}));
}
