import fs from 'node:fs/promises';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';

const root = 'C:/GitHub/AppSheet-Loan-Project';
const outDir = `${root}/outputs/loan-duration-visibility-20260911`;
await fs.mkdir(outDir, {recursive:true});
const file = `${root}/Documents/AppSheet_Data_Dictionary.xlsx`;
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const cols = wb.worksheets.getItem('Columns');
const rows = cols.getUsedRange().values;
const matches = rows.map((v,i)=>({v,row:i+1})).filter(x=>x.v[0]==='Loans'&&x.v[2]==='Loan Duration');
if(matches.length!==1) throw Error(`Expected one duration row, found ${matches.length}`);
const {row,v} = matches[0];
console.log(JSON.stringify({row,values:v}));
console.log((await wb.inspect({kind:'sheet',include:'id,name',maxChars:2500})).ndjson);
const range = `A${row}:H${row}`;
const before = await wb.render({sheetName:'Columns',range,scale:1,format:'png'});
await fs.writeFile(`${outDir}/dictionary-before.png`,new Uint8Array(await before.arrayBuffer()));
if(!process.argv.includes('--edit')) process.exit(0);

const original = new Map(wb.worksheets.items.map(s=>[s.name,JSON.stringify(s.getUsedRange().values)]));
cols.getRange(`F${row}`).values=[['OLTP Show_If: ISNOTBLANK([Close Date]); OLAP unchanged']];
cols.getRange(`G${row}`).values=[['Closed-loan inclusive days. OLTP hides this field when Close Date is blank. Verified OLTP 3.000045; client acceptance pending.']];
cols.getRange(`H${row}`).values=[['OLTP: IF(ISNOTBLANK([Close Date]), FLOOR(TOTALHOURS([Close Date] - [Loan Date]) / 24) + 1, NUMBER(""))\nOLAP (unchanged documented formula): IF(ISNOTBLANK([Close Date]), FLOOR(TOTALHOURS([Close Date] - [Loan Date]) / 24) + 1, "")']];
cols.getRange(range).format.wrapText=true;
cols.getRange(range).format.rowHeight=100;
wb.recalculate();
console.log((await wb.inspect({kind:'table',sheetId:'Columns',range,include:'values,formulas',tableMaxRows:1,tableMaxCols:8,maxChars:3500})).ndjson);
const image = await wb.render({sheetName:'Columns',range,scale:1,format:'png'});
await fs.writeFile(`${outDir}/dictionary-after.png`,new Uint8Array(await image.arrayBuffer()));
const exported = await SpreadsheetFile.exportXlsx(wb);
await exported.save(`${outDir}/AppSheet_Data_Dictionary.xlsx`);
const check = await SpreadsheetFile.importXlsx(await FileBlob.load(`${outDir}/AppSheet_Data_Dictionary.xlsx`));
const changes=[];
for(const s of check.worksheets.items){
 const oldRows=JSON.parse(original.get(s.name)); const newRows=s.getUsedRange().values;
 for(let r=0;r<Math.max(oldRows.length,newRows.length);r++){
  for(let c=0;c<Math.max(oldRows[r]?.length||0,newRows[r]?.length||0);c++){
   if(JSON.stringify(oldRows[r]?.[c]??null)!==JSON.stringify(newRows[r]?.[c]??null)) changes.push({sheet:s.name,row:r+1,col:c+1});
  }
 }
}
if(changes.length!==3||changes.some(x=>x.sheet!=='Columns'||x.row!==row||![6,7,8].includes(x.col))) throw Error(`Unexpected changes: ${JSON.stringify(changes)}`);
await fs.writeFile(`${outDir}/dictionary-verification.json`,JSON.stringify({changedCells:changes,closedLoanCalculationUnchanged:true,otherSheetValuesUnchanged:true},null,2)+'\n');
await fs.copyFile(`${outDir}/AppSheet_Data_Dictionary.xlsx`,file);
console.log('Verified exactly three documentation cells changed.');
