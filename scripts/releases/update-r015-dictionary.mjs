import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const input='Documents/AppSheet_Data_Dictionary.xlsx',dir='outputs/r015-20260922';
const original=await fs.readFile(input),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const additions=JSON.parse(await fs.readFile(`${dir}/dictionary-additions.json`,'utf8'));
await fs.mkdir(`${dir}/.tmp`,{recursive:true});
const before=wb.worksheets.items.map(s=>({name:s.name,values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}));
if(process.argv.includes('--inspect')){
 for(const name of Object.keys(additions)){
  const n=wb.worksheets.getItem(name).getUsedRange().values.length;
  const pic=await wb.render({sheetName:name,range:`A${n-1}:${name==='DB Columns'?'F':'E'}${n}`,scale:0.8,format:'png'});
  await fs.writeFile(`${dir}/.tmp/before-${name.replaceAll(' ','-')}.png`,new Uint8Array(await pic.arrayBuffer()));
 }
 console.log('Rendered existing affected dictionary ranges');process.exit(0);
}
const ranges={};
for(const [name,raw] of Object.entries(additions)){
 const sheet=wb.worksheets.getItem(name),n=sheet.getUsedRange().values.length,last=name==='DB Columns'?'F':'E';
 assert(!sheet.getUsedRange().values.some(r=>String(r[0]).startsWith('agent_audit.')||r[2]==='mw_agent_capture'),'R015 already present');
 const rows=raw.map(r=>r[0]==='PROD and DEV function'?[...r.slice(0,4),'Exact definition: outputs/r015-20260922/dictionary-additions.json and database/migrations/V33__agent_transaction_audit.sql. Runtime callers cannot replace these fixed functions.']:r);
 for(let i=1;i<=rows.length;i++)sheet.getRange(`A${n+i}:${last}${n+i}`).copyFrom(sheet.getRange(`A${n}:${last}${n}`),'all');
 sheet.getRange(`A${n+1}:${last}${n+rows.length}`).values=rows;
 sheet.getRange(`A${n+1}:${last}${n+rows.length}`).format.wrapText=true;
 sheet.getRange(`A${n+1}:${last}${n+rows.length}`).format.rowHeight=name==='DB Logic'?120:60;
 ranges[name]={start:n+1,end:n+rows.length,columns:rows[0].length,rows};
}
wb.recalculate();
for(const [name,r] of Object.entries(ranges)){
 const last=name==='DB Columns'?'F':'E';
 const pic=await wb.render({sheetName:name,range:`A${r.start}:${last}${r.start+2}`,scale:0.8,format:'png'});
 await fs.writeFile(`${dir}/dictionary-${name.replaceAll(' ','-')}.png`,new Uint8Array(await pic.arrayBuffer()));
}
const output=`${dir}/.tmp/dictionary.xlsx`;await(await SpreadsheetFile.exportXlsx(wb)).save(output);
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(output));
for(const b of before){const s=reopened.worksheets.getItem(b.name);assert.deepEqual(s.getUsedRange().values.slice(0,b.values.length),b.values);assert.deepEqual(s.getUsedRange().formulas.slice(0,b.formulas.length),b.formulas);}
for(const [name,r] of Object.entries(ranges))assert.deepEqual(reopened.worksheets.getItem(name).getRangeByIndexes(r.start-1,0,r.rows.length,r.columns).values,r.rows);
assert.equal(hash(await fs.readFile(input)),hash(original),'Concurrent dictionary edit; do not overwrite');
await fs.copyFile(output,input);
await fs.writeFile(`${dir}/dictionary-verification.json`,JSON.stringify({priorValuesAndFormulasPreserved:true,ranges:Object.fromEntries(Object.entries(ranges).map(([k,r])=>[k,{start:r.start,end:r.end}]))},null,2)+'\n');
console.log('R015 internal DB dictionary rows verified and saved');
