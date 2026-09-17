import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx';
const out='outputs/r005-20260917';
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const mode=process.argv[2]||'inspect';
const sh=wb.worksheets.getItem('Dev Differences');
const rows=sh.getUsedRange().values;
if(mode==='inspect'){
 console.log(JSON.stringify(wb.worksheets.items.map(s=>({name:s.name,rows:s.getUsedRange().values.length,header:s.getUsedRange().values[0]}))));
 console.log(JSON.stringify(rows.slice(-3)));
 const blob=await wb.render({sheetName:'Dev Differences',range:`A${rows.length-2}:E${rows.length}`,scale:1,format:'png'});
 await fs.writeFile(`${out}/dictionary-before.png`,new Uint8Array(await blob.arrayBuffer()));
}else{
 const inventory=JSON.parse(await fs.readFile(`${out}/model-inventory.json`,'utf8'));
 const expected=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
 const start=rows.length;
 for(const item of inventory){
  const record=['R005 DEV V20 / GUI tested; Not ready',item.object,item.property,item.property.startsWith('Saved AppSheet')?'Released baseline retained in dev-oltp-before-context.json / dev-olap-before-context.json; exact changes in configuration-checklist.json':'Absent in released V19 baseline',item.value+' Applied to DEV; saved AppSheet definitions OLTP 1.000120 / OLAP 1.000120. GUI scenarios and SQL readback verified; deployment-check rerun unavailable and export omissions remain under the approved limited exception. Owner acceptance pending. See outputs/r005-20260917/GUI_TEST_REPORT.md and configuration-checklist.json.'];
  let idx=rows.findIndex(r=>String(r[0]).startsWith('R005 ')&&r[1]===record[1]&&r[2]===record[2]);
  if(idx<0){idx=rows.length;sh.getRangeByIndexes(idx,0,1,5).copyFrom(sh.getRangeByIndexes(Math.max(1,start-1),0,1,5),'all');}
  sh.getRangeByIndexes(idx,0,1,5).values=[record];rows[idx]=record;
  sh.getRangeByIndexes(idx,0,1,5).format.wrapText=true;
  sh.getRangeByIndexes(idx,0,1,5).format.rowHeight=item.property.startsWith('Saved AppSheet')?180:90;
 }
 expected['Dev Differences']=rows;
 wb.recalculate();
 const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30}});
 await fs.writeFile(`${out}/dictionary-error-scan.jsonl`,errors.ndjson);
 const firstR005=rows.findIndex(r=>String(r[0]).startsWith('R005 '));
 const blob=await wb.render({sheetName:'Dev Differences',range:`A${firstR005+1}:E${firstR005+3}`,scale:1,format:'png'});
 await fs.writeFile(`${out}/dictionary-after.png`,new Uint8Array(await blob.arrayBuffer()));
 await(await SpreadsheetFile.exportXlsx(wb)).save(file);
 const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
 const norm=arr=>{const r=arr.map(row=>row.map(v=>v??''));while(r.length&&r.at(-1).every(v=>v===''))r.pop();return r;};
 for(const sheet of reopened.worksheets.items)if(JSON.stringify(norm(sheet.getUsedRange().values))!==JSON.stringify(norm(expected[sheet.name])))throw Error('Unexpected dictionary change '+sheet.name);
 await fs.writeFile(`${out}/dictionary-verification.json`,JSON.stringify({pendingR005Rows:inventory.length,allSheetsValueRoundtrip:true,liveReconciled:false},null,2));
 console.log(JSON.stringify({pendingR005Rows:inventory.length,allSheetsValueRoundtrip:true,liveReconciled:false}));
}
