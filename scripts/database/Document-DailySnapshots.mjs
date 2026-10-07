import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile,FileBlob} from '@oai/artifact-tool';
const privateDir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922/daily-snapshots';
const plan=JSON.parse(await fs.readFile(privateDir+'/dictionary-patches.json','utf8'));
if(process.argv.includes('--verify')){
 const w=await SpreadsheetFile.importXlsx(await FileBlob.load('Documents/AppSheet_Data_Dictionary.xlsx'));
 for(const [name,rows] of Object.entries(plan.data)){
  const sheet=w.worksheets.getItem(name);
  for(const n of plan.patches[name]){
   const actual=sheet.getRange(`A${n}:${String.fromCharCode(64+rows[0].length)}${n}`).values[0];
   if(actual.map(x=>x??'').join('|')!==rows[n-1].map(x=>x??'').join('|'))throw Error(`${name} row ${n} mismatch`);
  }
  const start=rows.length-Math.min(4,plan.patches[name].length)+1;
  await fs.writeFile(`${privateDir}/${name.replaceAll(' ','-')}.png`,new Uint8Array(await (await w.render({sheetName:name,range:`A${start}:${String.fromCharCode(64+rows[0].length)}${rows.length}`,scale:1,format:'png'})).arrayBuffer()));
 }
 console.log('Saved dictionary patch values verified and affected ranges rendered.');
}else{
 const w=Workbook.create();
 for(const [name,rows] of Object.entries(plan.data)){
  const s=w.worksheets.add(name),end=String.fromCharCode(64+rows[0].length);
  s.getRange(`A1:${end}${rows.length}`).values=rows;
  s.getRange(`A1:${end}${rows.length}`).format={font:{name:'Arial',size:10},wrapText:true,verticalAlignment:'center',rowHeight:42};
  s.getRange(`A1:${end}1`).format={fill:'#17365D',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true}};
  s.showGridLines=false;
  for(const n of plan.patches[name])s.getRange(`A${n}:${end}${n}`).format.rowHeight=name==='DB Logic'?110:name==='DB Constraints'?70:45;
 }
 w.recalculate();await (await SpreadsheetFile.exportXlsx(w)).save(privateDir+'/dictionary-donor.xlsx');
 console.log('Artifact Tool authored targeted DB dictionary patches.');
}
