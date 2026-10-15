import { databaseRoot } from './database-location.mjs';
import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/r008-20260918';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const sh=wb.worksheets.getItem('Dev Differences'),rows=sh.getUsedRange().values;
const mode=process.argv[2]||'inspect';
if(mode==='inspect'){
 console.log(JSON.stringify({header:rows[0],rows:rows.length,last:rows.slice(-1)}));
 const png=await wb.render({sheetName:sh.name,range:`A${rows.length}:E${rows.length}`,scale:1,format:'png'});
 await fs.writeFile(`${out}/dictionary-before.png`,new Uint8Array(await png.arrayBuffer()));
}else if(mode==='apply'){
 if(rows.some(r=>String(r[0]).startsWith('R008')))throw Error('R008 already documented; review existing rows before refinement');
 const delta=JSON.parse(await fs.readFile(`${out}/release-delta.json`,'utf8'));
 const expected=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,{values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}]));
 const first=rows.length;
 const literal=t=>t.state==='value'?(typeof t.value==='string'?t.value:JSON.stringify(t.value)):t.state;
 const records=[];
 for(const i of delta.items){
  const fields=[[i.property,literal(i.dev)]];
  for(const [property,target] of fields){
   const old=i.property==='definition'?'Absent before R008':literal(i.before||{state:'value',value:'PROD R007 reference unchanged; pre-R008 DEV rollback OLTP 1.000134 / OLAP 1.000142'});
   const dev=typeof target==='string'?target:JSON.stringify(target);
   // Preserve complete text while keeping each continuation row readable in Excel.
   const chunks=t=>t.match(/[\s\S]{1,850}/g)||[''];
   const a=chunks(old),b=chunks(dev),n=Math.max(a.length,b.length);
   for(let p=0;p<n;p++)records.push(['R008 DEV only\nOLTP 1.000176 / OLAP 1.000169\nSQL V24',i.app+' / '+i.object,`${property}${n>1?` (part ${p+1}/${n}; concatenate parts)` : ''}\n${i.id}`,a[p]||'',b[p]||'']);
  }
 }
 records.unshift(['R008 DEV only\nPROD unchanged','Release inventory','Scope and evidence','Production reference rows remain unchanged; promotion and owner acceptance pending.','Cash account master/defaults, 13 new source/request fields, ledger dimensions, balances and three quick-command forms/bots. Exact delta: outputs/r008-20260918/release-delta.json. New objects are absent in PROD; existing PROD reference stays in the baseline sheets and recorded rollback versions. Source bindings remain environment specific. Multi-part text concatenates without separators.']);
 const migration=await fs.readFile(databaseRoot+'/' + 'database/migrations/V23__cash_accounts_and_payment_requests.sql','utf8');
 for(const table of ['"Cash Accounts"','r008_cash_account_cutover']){
  const start=migration.indexOf('CREATE TABLE public.'+table+' (');
  const ddl=migration.slice(start,migration.indexOf('\n);',start)+3);
  if(start<0||!ddl.endsWith(');'))throw Error('Missing SQL inventory '+table);
  for(const [part,text] of (ddl.match(/[\s\S]{1,850}/g)||[]).entries())records.push(['R008 DEV only\nSQL V24','SQL public.'+table,'DDL inventory part '+(part+1),'Absent before R008',text]);
 }
 for(const record of records){
  for(let k=0;k<record.length;k++)if(String(record[k]).startsWith('='))record[k]='Expression text: '+record[k];
  const dest=sh.getRangeByIndexes(rows.length,0,1,5);dest.copyFrom(sh.getRangeByIndexes(first-1,0,1,5),'all');dest.setNumberFormat('@');dest.values=[record];dest.format.wrapText=true;
  const widths=[16,42,35,72,72];const lines=Math.max(...record.map((v,k)=>String(v).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/widths[k])),0)));
  dest.format.rowHeight=Math.min(390,Math.max(90,lines*16+16));rows.push(record);
 }
 expected[sh.name].values=rows;wb.recalculate();
 const normalize=a=>{const b=a.map(r=>{const x=r.map(v=>v??'');while(x.length&&x.at(-1)==='')x.pop();return x});while(b.length&&!b.at(-1).length)b.pop();return b};
 for(const [index,row] of [first+1,first+2,rows.length].entries()){
  const png=await wb.render({sheetName:sh.name,range:`A${row}:E${row}`,scale:1,format:'png'});await fs.writeFile(`${out}/dictionary-after-${index+1}.png`,new Uint8Array(await png.arrayBuffer()));
 }
 const dest=`${out}/AppSheet_Data_Dictionary.xlsx`;await(await SpreadsheetFile.exportXlsx(wb)).save(dest);
 const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(dest));
 for(const s of reopened.worksheets.items){if(JSON.stringify(normalize(s.getUsedRange().values))!==JSON.stringify(normalize(expected[s.name].values))){const a=normalize(s.getUsedRange().values),b=normalize(expected[s.name].values);console.log(a.flatMap((r,i)=>JSON.stringify(r)!==JSON.stringify(b[i])?[{row:i+1,actual:r,expected:b[i]}]:[]).slice(0,2));throw Error('Unexpected values '+s.name);}if(JSON.stringify(normalize(s.getUsedRange().formulas))!==JSON.stringify(normalize(expected[s.name].formulas)))throw Error('Unexpected formulas '+s.name);}
 await fs.writeFile(`${out}/dictionary-verification.json`,JSON.stringify({addedRows:records.length,deltaItems:delta.items.length,range:`Dev Differences!A${first+1}:E${rows.length}`,allSheetsValueAndFormulaRoundtrip:true,productionRowsUnchanged:true},null,2)+'\n');console.log(`${records.length} exact DEV property rows documented; production rows unchanged`);
}else throw Error('Use inspect or apply');
