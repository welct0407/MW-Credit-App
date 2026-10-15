import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const out='outputs/r008-20260918/r4',file='Documents/AppSheet_Data_Dictionary.xlsx';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const sh=wb.worksheets.getItem('Dev Differences'),rows=sh.getUsedRange().values,start=rows.length;
if(process.argv[2]==='inspect'){
 console.log(JSON.stringify({header:rows[0],rows:start,last:rows.at(-1)}));
 const p=await wb.render({sheetName:sh.name,range:`A${start}:E${start}`,scale:1,format:'png'});await fs.writeFile(`${out}/dictionary-before.png`,new Uint8Array(await p.arrayBuffer()));
}else if(process.argv[2]==='apply'){
 if(rows.some(r=>String(r[0]).includes('R008 revision 4')))throw Error('Already applied');
 const expected=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,{values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}]));
 const delta=JSON.parse(await fs.readFile(`${out}/refinement-items.json`,'utf8'));
 for(const i of delta){
  const text=v=>typeof v==='string'?v:JSON.stringify(v),chunks=v=>text(v).match(/[\s\S]{1,850}/g)||[''];
  const before=chunks('PROD baseline unchanged; see production sheets. Pre-revision-4 DEV: '+(i.refinementBefore.state === 'absent' ? 'Absent' : text(i.refinementBefore.value))),after=chunks(i.dev.state === 'absent' ? 'Removed in DEV; proposed removal in PROD' : i.dev.value),parts=Math.max(before.length,after.length);
  for(let p=0;p<parts;p++){
   const record=['R008 revision 4\nDEV OLTP 1.000181 / OLAP 1.000170\nPROD unchanged',`${i.app}: ${i.object}`,`${i.property}\n${i.id}${parts>1?` part ${p+1}/${parts}; concatenate parts`:''}`,before[p]||'',after[p]||''].map(v=>v.startsWith('=')?'Expression text: '+v:v);
   const r=sh.getRangeByIndexes(rows.length,0,1,5);r.copyFrom(sh.getRangeByIndexes(start-1,0,1,5),'all');r.setNumberFormat('@');r.values=[record];r.format.wrapText=true;
   const widths=[16,42,35,72,72],lines=Math.max(...record.map((v,k)=>v.split('\n').reduce((n,s)=>n+Math.max(1,Math.ceil(s.length/widths[k])),0)));
   r.format.rowHeight=Math.min(390,Math.max(90,lines*16+16));rows.push(record);
  }
 }
 expected[sh.name].values=rows;wb.recalculate();
 for(const [k,r] of [start+1,start+4,rows.length].entries()){const p=await wb.render({sheetName:sh.name,range:`A${r}:E${r}`,scale:1,format:'png'});await fs.writeFile(`${out}/dictionary-after-${k+1}.png`,new Uint8Array(await p.arrayBuffer()));}
 const dest=`${out}/AppSheet_Data_Dictionary.xlsx`;await(await SpreadsheetFile.exportXlsx(wb)).save(dest);
 const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(dest));
 const norm=a=>{const b=a.map(r=>{const x=r.map(v=>v??'');while(x.length&&x.at(-1)==='')x.pop();return x});while(b.length&&!b.at(-1).length)b.pop();return b};
 for(const s of reopened.worksheets.items)for(const type of ['values','formulas'])if(JSON.stringify(norm(s.getUsedRange()[type]))!==JSON.stringify(norm(expected[s.name][type])))throw Error(`Unexpected ${type} in ${s.name}`);
 await fs.writeFile(`${out}/dictionary-verification.json`,JSON.stringify({range:`Dev Differences!A${start+1}:E${rows.length}`,addedRows:rows.length-start,allExistingValuesAndFormulasPreserved:true},null,2)+'\n');
 console.log(`Appended ${rows.length-start} exact DEV rows; existing values/formulas preserved`);
}else throw Error('Use inspect or apply');
