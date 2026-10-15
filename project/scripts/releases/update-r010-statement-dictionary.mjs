import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const input='Documents/AppSheet_Data_Dictionary.xlsx';
const dir='outputs/r010-20260919/cash-statement/dictionary';
const mode=process.argv[2]??'inspect';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet=wb.worksheets.getItem('Dev Differences');
const existing=sheet.getUsedRange().values;
await fs.mkdir(dir,{recursive:true});
if(mode==='inspect'){
 const pic=await wb.render({sheetName:'Dev Differences',range:`A${existing.length-2}:E${existing.length}`,scale:1,format:'png'});
 await fs.writeFile(`${dir}/before.png`,new Uint8Array(await pic.arrayBuffer()));
 console.log(JSON.stringify({rows:existing.length,header:existing[0],r008ProductionRows:wb.worksheets.getItem('R008 Production').getUsedRange().values.length}));
}else{
 assert.equal(mode,'apply');
 assert.equal(existing.length,2811,'R010 statement dictionary already applied or workbook changed; review before authoring');
 const rows=JSON.parse(await fs.readFile('outputs/r010-20260919/cash-statement/dictionary-rows.json','utf8'));
 assert(rows.length>0 && rows.every(r=>r.length===5));
 const before=wb.worksheets.items.map(s=>({name:s.name,values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}));
 const start=existing.length+1,end=existing.length+rows.length;
 for(let i=start;i<=end;i++) sheet.getRange(`A${i}:E${i}`).copyFrom(sheet.getRange(`A${start-1}:E${start-1}`),'all');
 sheet.getRange(`A${start}:E${end}`).values=rows.map(r=>r.map(v=>typeof v==='string'&&v.startsWith('=')?`'${v}`:v));
 sheet.getRange(`A${start}:E${end}`).format.wrapText=true;
 sheet.getRange(`A${start}:E${end}`).format.rowHeight=110;
 for(let i=0;i<rows.length;i++) if(String(rows[i][4]).length>450) sheet.getRange(`A${start+i}:E${start+i}`).format.rowHeight=300;
 wb.recalculate();
 const pic=await wb.render({sheetName:'Dev Differences',range:`A${start}:E${Math.min(start+3,end)}`,scale:1,format:'png'});
 await fs.writeFile(`${dir}/after.png`,new Uint8Array(await pic.arrayBuffer()));
 const out=`${dir}/dictionary.xlsx`;
 await (await SpreadsheetFile.exportXlsx(wb)).save(out);
 const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(out));
 for(const b of before){
  const a=reopened.worksheets.getItem(b.name);
  assert.deepEqual(a.getUsedRange().values.slice(0,b.values.length),b.values,`unrelated values: ${b.name}`);
  assert.deepEqual(a.getUsedRange().formulas.slice(0,b.formulas.length),b.formulas,`unrelated formulas: ${b.name}`);
 }
 assert.equal(reopened.worksheets.getItem('Dev Differences').getUsedRange().values.length,end);
 await fs.copyFile(out,input);
 await fs.writeFile(`${dir}/verification.json`,JSON.stringify({range:`A${start}:E${end}`,allPriorValuesAndFormulasPreserved:true},null,2));
 console.log(JSON.stringify({start,end,output:input}));
}
