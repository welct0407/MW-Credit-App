import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx';
const out='outputs/r004-20260917';
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const mode=process.argv[2]||'inspect';
const sh=wb.worksheets.getItem('Column Rules');
const rows=sh.getUsedRange().values;
const relevant=rows.map((r,i)=>({row:i+1,values:r})).filter(x=>x.values.includes('Expense Category'));
if(mode==='inspect'){
 console.log(JSON.stringify({relevant,header:rows[0],examples:rows.filter(r=>r.includes('Business Expenses')).slice(0,3)}));
 const first=relevant[0]?.row||1;
 const blob=await wb.render({sheetName:'Column Rules',range:`A${first}:E${first+2}`,scale:1,format:'png'});
 await fs.writeFile(`${out}/dictionary-before.png`,new Uint8Array(await blob.arrayBuffer()));
}else{
 const expr=(await fs.readFile(`${out}/category-valid-if.txt`,'utf8')).trim().replace(/^=/,'');
 const expected=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
 let changed=0;
 for(let i=0;i<rows.length;i++)if(rows[i][0]==='OLTP'&&rows[i][1]==='Business Expenses'&&rows[i][2]==='Expense Category'){
  for(let j=3;j<rows[i].length;j++)if(typeof rows[i][j]==='string'&&rows[i][j].includes('IF([Source Type]')){
   sh.getRangeByIndexes(i,j,1,1).values=[[expr]];expected['Column Rules'][i][j]=expr;changed++;
  }
 }
 if(!changed){
  const idx=rows.length;const record=['OLTP','Business Expenses','Expense Category','Valid_If',expr];
  sh.getRangeByIndexes(idx,0,1,5).copyFrom(sh.getRangeByIndexes(idx-1,0,1,5),'all');
  sh.getRangeByIndexes(idx,0,1,5).values=[record];expected['Column Rules'][idx]=record;changed++;
 }
 const dif=wb.worksheets.getItem('Dev Differences');const dr=expected['Dev Differences'];
 const record=['OLTP DEV / PROD','Business Expenses.Expense Category / R004','Valid_If and SQL label','English-only automatic category; manual rebate absent','Referral Rebate / เงินคืนค่าแนะนำลูกค้า. Manual dropdown added. Internal Source Type remains Referral Rebate for automatic rows and Manual for manual rows. SQL V19; see R004 release log for deployment status.'];
 let idx=dr.findIndex(r=>r[1]===record[1]);if(idx<0){idx=dr.length;dif.getRangeByIndexes(idx,0,1,5).copyFrom(dif.getRangeByIndexes(idx-1,0,1,5),'all');}
 dif.getRangeByIndexes(idx,0,1,5).values=[record];dr[idx]=record;
 const ruleIndex=relevant[0]?relevant[0].row-1:expected['Column Rules'].length-1;
 sh.getRangeByIndexes(ruleIndex,0,1,5).format.wrapText=true;
 sh.getRangeByIndexes(ruleIndex,0,1,5).format.rowHeight=180;
 dif.getRangeByIndexes(idx,0,1,5).format.wrapText=true;
 dif.getRangeByIndexes(idx,0,1,5).format.rowHeight=120;
 wb.recalculate();
 const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30}});
 await fs.writeFile(`${out}/dictionary-error-scan.jsonl`,errors.ndjson);
 const first=relevant[0]?.row||expected['Column Rules'].length;const blob=await wb.render({sheetName:'Column Rules',range:`A${first}:E${first}`,scale:1,format:'png'});
 await fs.writeFile(`${out}/dictionary-after.png`,new Uint8Array(await blob.arrayBuffer()));
 await(await SpreadsheetFile.exportXlsx(wb)).save(file);
 const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
 const norm=rows=>{const r=rows.map(row=>row.map(v=>v??''));while(r.length&&r.at(-1).every(v=>v===''))r.pop();return r;};
 for(const sheet of reopened.worksheets.items)if(JSON.stringify(norm(sheet.getUsedRange().values))!==JSON.stringify(norm(expected[sheet.name])))throw Error('Unexpected dictionary change '+sheet.name);
 await fs.writeFile(`${out}/dictionary-verification.json`,JSON.stringify({changedRuleCells:changed,allSheetsRoundtrip:true}));
 console.log(JSON.stringify({changedRuleCells:changed,allSheetsRoundtrip:true}));
}
