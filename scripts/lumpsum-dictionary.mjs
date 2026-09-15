import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root='C:/GitHub/AppSheet-Loan-Project';
const out=root+'/outputs/lumpsum-db-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/lumpsum-20260915';
const file=root+'/Documents/AppSheet_Data_Dictionary.xlsx';
let input=file;
if(process.argv.includes('--edit')){try{await fs.access(priv+'/dictionary-before.xlsx');input=priv+'/dictionary-before.xlsx';}catch{}}
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([k,v])=>[k,{rows:v.length,head:v[0],sample:v.slice(1,3)}]))));
 const p=await wb.render({sheetName:'Dev Differences',range:'A1:E4',scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));process.exit(0);
}
if(input===file)await fs.copyFile(file,priv+'/dictionary-before.xlsx');
const additions=JSON.parse(await fs.readFile(out+'/dictionary-additions.json','utf8'));
const changed={};
// Reconcile the previously completed sync-settings task into this inventory.
// No live setting is changed by this workbook builder.
const sync=wb.worksheets.getItem('App Settings');
const labels=new Set(['Server caching','Delta sync','Quick sync','Sync on start','Delayed sync','Automatic updates']);
changed['App Settings']=before['App Settings'].map((r,i)=>{
 if(r[1]!=='Sync')return r;
 if(!labels.has(r[2]))throw Error('Unreviewed sync label '+r[2]);
 const row=[...r.slice(0,3),['Sync on start','Automatic updates'].includes(r[2])?'On':'Off','PostgreSQL sync-options evidence, 15 Sep 2026; OLAP production recaptured during assessment promotion'];
 sync.getRangeByIndexes(i,0,1,row.length).values=[row];return row;
});
for(const [name,rows] of Object.entries(additions)){
 const s=wb.worksheets.getItem(name),old=before[name].length,cols=before[name][0].length;
 if(rows.some(r=>r.length!==cols))throw Error('Wrong column count '+name);
 for(let i=0;i<rows.length;i++)s.getRangeByIndexes(old+i,0,1,cols).copyFrom(s.getRangeByIndexes(old-1,0,1,cols),'all');
 s.getRangeByIndexes(old,0,rows.length,cols).values=rows.map(r=>r.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v));
 s.getRangeByIndexes(old,0,rows.length,cols).format.wrapText=true;
 s.getRangeByIndexes(old,0,rows.length,cols).format.rowHeight=55;
 s.getRangeByIndexes(old,0,rows.length,cols).format.verticalAlignment='center';
 changed[name]=[...before[name],...rows];
}
wb.recalculate();
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'Dictionary error scan'});
await fs.writeFile(out+'/dictionary-error-scan.jsonl',errors.ndjson);
for(const name of Object.keys(additions)){
 const old=before[name].length,cols=before[name][0].length;
 const p=await wb.render({sheetName:name,range:wb.worksheets.getItem(name).getRangeByIndexes(old,0,Math.min(3,additions[name].length),cols).address.split('!').pop(),scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-'+name.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));
}
const settingsPreview=await wb.render({sheetName:'App Settings',range:'A1:E7',scale:1,format:'png'});
await fs.writeFile(out+'/dictionary-App-Settings.png',new Uint8Array(await settingsPreview.arrayBuffer()));
const staged=out+'/dictionary-staged.xlsx';
await(await SpreadsheetFile.exportXlsx(wb)).save(staged);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));
const norm=a=>a.map(r=>r.map(v=>v===null?'':typeof v==='string'?v.replace(/^'/,''):v)).filter(r=>r.some(v=>v!==''));
for(const s of check.worksheets.items){if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(changed[s.name]||before[s.name])))throw Error('Preservation mismatch '+s.name);}
await fs.copyFile(staged,file);await fs.unlink(staged);
await fs.unlink(staged+'.inspect.ndjson').catch(e=>{if(e.code!=='ENOENT')throw e;});
await fs.writeFile(out+'/dictionary-verification.json',JSON.stringify({changedSheets:Object.keys(changed),unchangedSheets:Object.keys(before).filter(n=>!changed[n]),allSheetsRoundtrip:true,rowsAdded:Object.fromEntries(Object.entries(additions).map(([n,r])=>[n,r.length]))},null,2));
console.log('Dictionary updated; all sheets roundtrip verified.');
