import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile,FileBlob} from '@oai/artifact-tool';
const privateDir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922/cash-snapshot-report-before';
const plan=JSON.parse(await fs.readFile(privateDir+'/dictionary-patches.json','utf8'));
const render=async(w,name,range,suffix)=>fs.writeFile(`${privateDir}/${name.replaceAll(' ','-')}-${suffix}.png`,new Uint8Array(await (await w.render({sheetName:name,range,scale:1,format:'png'})).arrayBuffer()));
if(process.argv.includes('--before')){
 const w=await SpreadsheetFile.importXlsx(await FileBlob.load(privateDir+'/dictionary-before.xlsx'));
 await render(w,'Metabase Models','A300:F308','before');await render(w,'DB Logic','A127:E129','before');
}else if(process.argv.includes('--verify')){
 const w=await SpreadsheetFile.importXlsx(await FileBlob.load('Documents/AppSheet_Data_Dictionary.xlsx'));
 for(const [name,rows] of Object.entries(plan.data)){
  const s=w.worksheets.getItem(name),end=String.fromCharCode(64+rows[0].length);
  for(const n of plan.patches[name])if(s.getRange(`A${n}:${end}${n}`).values[0].map(x=>x??'').join('|')!==rows[n-1].map(x=>x??'').join('|'))throw Error(`${name} ${n} mismatch`);
  const start=name==='Metabase Models'?plan.patches[name][0]:Math.min(...plan.patches[name]);await render(w,name,`A${start}:${end}${Math.min(start+5,rows.length)}`,'after');
 }
 await render(w,'Metabase Models','A325:F330','account-after');
 console.log('37 targeted dictionary rows read back; changed areas rendered.');
}else{
 const w=Workbook.create();
 for(const [name,rows]of Object.entries(plan.data)){
  const s=w.worksheets.add(name),end=String.fromCharCode(64+rows[0].length);s.getRange(`A1:${end}${rows.length}`).values=rows;
  for(const n of plan.patches[name])s.getRange(`A${n}:${end}${n}`).format.rowHeight=name==='DB Logic'?110:plan.data[name][n-1][2]==='Model grain'?65:48;
 }
 w.recalculate();await (await SpreadsheetFile.exportXlsx(w)).save(privateDir+'/dictionary-donor.xlsx');console.log('Artifact Tool authored the targeted dictionary cells.');
}
