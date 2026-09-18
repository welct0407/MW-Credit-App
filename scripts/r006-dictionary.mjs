import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/r006-20260918';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const sh=wb.worksheets.getItem('Dev Differences'),rows=sh.getUsedRange().values;
const mode=process.argv[2]||'inspect';
if(mode==='inspect'){
 console.log(JSON.stringify({header:rows[0],rows:rows.length,last:rows.slice(-2)}));
 const blob=await wb.render({sheetName:sh.name,range:`A${rows.length-1}:E${rows.length}`,scale:1,format:'png'});
 await fs.writeFile(`${out}/dictionary-before.png`,new Uint8Array(await blob.arrayBuffer()));
}else{
 const delta=JSON.parse(await fs.readFile(`${out}/release-delta.json`,'utf8'));
 const expected=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,{values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}]));
 const first=rows.length;
 if(rows.some(r=>String(r[0]).startsWith('R006')))throw Error('R006 rows already exist; review before refining');
 for(const [i,item] of delta.items.entries()){
  const index=first+i,range=sh.getRangeByIndexes(index,0,1,5);
  range.copyFrom(sh.getRangeByIndexes(first-1,0,1,5),'all');
  const record=['R006 DEV only / OLTP 1.000134; owner acceptance pending',item.object,item.property,'PROD unchanged. Released baseline App formula: '+item.before.value,'DEV App formula: '+item.dev.value+' Evidence: outputs/r006-20260918/release-delta.json, saved-editor-observations.json and DEV_REPORT.md. No SQL/type/Ref change.'];
  range.values=[record];range.format.wrapText=true;range.format.rowHeight=i===0||i===3?250:130;rows.push(record);
 }
 expected[sh.name].values=rows;
 // This dictionary stores AppSheet expressions as literal text, not spreadsheet formulas.
 const normalize=a=>{const b=a.map(r=>r.map(v=>v??''));while(b.length&&b.at(-1).every(v=>v===''))b.pop();return b;};
 for(let i=0;i<4;i++){
  const blob=await wb.render({sheetName:sh.name,range:`A${first+i+1}:E${first+i+1}`,scale:1,format:'png'});
  await fs.writeFile(`${out}/dictionary-after-${i+1}.png`,new Uint8Array(await blob.arrayBuffer()));
 }
 await(await SpreadsheetFile.exportXlsx(wb)).save(file);
 const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
 for(const s of reopened.worksheets.items){
  if(JSON.stringify(normalize(s.getUsedRange().values))!==JSON.stringify(normalize(expected[s.name].values)))throw Error('Unexpected value change '+s.name);
  if(JSON.stringify(normalize(s.getUsedRange().formulas))!==JSON.stringify(normalize(expected[s.name].formulas)))throw Error('Unexpected spreadsheet formula change '+s.name);
 }
 const scan=await reopened.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30}});
 await fs.writeFile(`${out}/dictionary-error-scan.jsonl`,scan.ndjson);
 await fs.writeFile(`${out}/dictionary-verification.json`,JSON.stringify({addedRows:4,range:`Dev Differences!A${first+1}:E${first+4}`,allSheetsValueAndFormulaRoundtrip:true,productionRowsUnchanged:true},null,2)+'\n');
 console.log('Four R006 DEV differences appended; all sheets values/formulas verified');
}
