import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';

const input='Documents/AppSheet_Data_Dictionary.xlsx';
const dir='outputs/r014-20260921';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet=wb.worksheets.getItem('Dev Differences');
const before=wb.worksheets.items.map(s=>({name:s.name,values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}));
const rows=sheet.getRange('A2880:E2915').values;
assert.equal(rows.length,36);
assert(rows.every(r=>String(r[0]).startsWith('R014 DEV')));
const refinement=JSON.parse(await fs.readFile(`${dir}/refinements.json`,'utf8'));
const promoted=rows.map(r=>{
 let value=r[4].replaceAll('database-3','database-2').replace('DEV V31.','PROD V32.').replace('Production activation depends on R014 V32 promotion.','Installed after V32; current reviewer membership verified.');
 if(r[2]==='Are updates allowed') value=refinement.cashAccountUpdateMode+'; no New in Cash Ledger, Cash Position or Settlements account pickers. Standalone account administration retains adds/updates.';
 return ['R014 closed',r[1],r[2],value,'Matches PROD: V32 / OLTP 3.000245 / OLAP 1.100194, promoted 21 Sep 2026. DEV keeps database-3, DEV links/theme and owner-only delivery.'];
});
sheet.getRange('A2880:E2915').values=promoted;
wb.recalculate();
await fs.mkdir(`${dir}/.tmp`,{recursive:true});
for(const [label,range] of [['first','A2880:E2883'],['reviewer','A2912:E2915']]){
 const image=await wb.render({sheetName:sheet.name,range,scale:1,format:'png'});
 await fs.writeFile(`${dir}/dictionary-production-${label}.png`,new Uint8Array(await image.arrayBuffer()));
}
const out=`${dir}/.tmp/dictionary-production.xlsx`;
await (await SpreadsheetFile.exportXlsx(wb)).save(out);
const saved=await SpreadsheetFile.importXlsx(await FileBlob.load(out));
for(const prior of before){
 const s=saved.worksheets.getItem(prior.name),values=s.getUsedRange().values;
 if(prior.name===sheet.name){assert.deepEqual(values.slice(0,2879),prior.values.slice(0,2879));assert.deepEqual(values.slice(2915),prior.values.slice(2915));}
 else assert.deepEqual(values,prior.values);
 assert.deepEqual(s.getUsedRange().formulas,prior.formulas);
}
assert.deepEqual(saved.worksheets.getItem(sheet.name).getRange('A2880:E2915').values,promoted);
const errors=await saved.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:50}});
await fs.copyFile(out,input);
await fs.writeFile(`${dir}/dictionary-production-verification.json`,JSON.stringify({range:'A2880:E2915',promotedRows:36,priorValuesOutsideRangePreserved:true,allFormulasPreserved:true,formatting:'Values-only changes; existing layout retained',formulaErrorScan:errors.ndjson},null,2)+'\n');
console.log(JSON.stringify({output:input,promotedRows:36}));
