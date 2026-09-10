import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const base='C:/GitHub/AppSheet-Loan-Project';
const dir=base+'/outputs/charge-generation-flag-20260908';
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(base+'/Documents/AppSheet_Data_Dictionary.xlsx'));
const cols=w.worksheets.getItem('Columns');
const rows=cols.getRange('A1:H500').values;
const hash=s=>{let h=2166136261;for(const c of s.replace(/\s/g,'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);};
const before=Object.fromEntries(rows.filter(r=>r[0]&&r[2]).map(r=>[r[0]+'|'+r[2],r[7]]));
const f={};
for(const name of ['Accrued Interest','Expected Daily Interest Amount'])f['Loans|'+name]='IF([Auto Charge Enabled], '+before['Loans|'+name]+', 0)';
const zero='AND([Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest] = 0)';
const manual='OR(NOT([Auto Charge Enabled]), '+zero+')';
f['Loans|Expected Interest This Month']=before['Loans|Expected Interest This Month'].replace(zero,manual);
const refOld='[Ref Loans].[Loan Type] = "ดอกเบี้ยรายวัน", [Ref Loans].[Current Daily Interest] = 0';
const refNew='OR(NOT([Ref Loans].[Auto Charge Enabled]), AND('+refOld+'))';
for(const name of ['Assessment Installment Contract Principal Due','Assessment Installment Future Principal Due','Assessment Installment Future Interest Due','Assessment Installment Contract Outstanding','Projected Outstanding Principal','Projected Interest','Assessment Principal Base','Assessment Principal Start Weight']){
 const key='Calendar|'+name;let s=before[key];
 if(name.startsWith('Assessment Installment'))s=s.replaceAll('[Loan Type] = "ผ่อนชำระรายวัน",','[Loan Type] = "ผ่อนชำระรายวัน", [Auto Charge Enabled],');
 s=s.replaceAll(refOld,refNew).replaceAll(zero,manual);
 if(['Projected Outstanding Principal','Assessment Principal Base','Assessment Principal Start Weight'].includes(name))s=s.replaceAll('AND([Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest] <> 0)','AND([Auto Charge Enabled], [Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest] <> 0)');
 if(['Projected Outstanding Principal','Projected Interest','Assessment Principal Base','Assessment Principal Start Weight'].includes(name))s=s.replaceAll('[Loan Type] = "กำหนดวันชำระ",','[Loan Type] = "กำหนดวันชำระ", [Auto Charge Enabled],');
 if(name==='Projected Interest')s=s.replace('[Loan Type] = "ดอกเบี้ยรายวัน"','AND([Auto Charge Enabled], [Loan Type] = "ดอกเบี้ยรายวัน")');
 f[key]=s;
}
await fs.writeFile(dir+'/model-formulas.json',JSON.stringify(f,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(f).map(([k,v])=>[k,hash(v)]))));
if(!process.argv.includes('--edit')){
 console.log(rows.map((r,i)=>({row:i+1,table:r[0],name:r[2],type:r[3],availability:r[5]})).filter(r=>r.table==='Loans'||r.row<6||r.row>440&&r.table));
 const blob=await w.render({sheetName:'Columns',range:'A75:H77',scale:1,format:'png'});await fs.writeFile(dir+'/dictionary-before.png',new Uint8Array(await blob.arrayBuffer()));
 console.log((await w.inspect({kind:'sheet',include:'id,name',maxChars:2000})).ndjson);process.exit(0);
}
const live=JSON.parse(await fs.readFile(dir+'/live-model-hashes.json','utf8'));
for(const [k,v]of Object.entries(f))if(hash(v)!==live[k])throw Error('Live formula mismatch '+k);
let changed=0;
for(let i=4;i<rows.length;i++){const r=rows[i],key=r[0]+'|'+r[2];if(!f[key])continue;
 cols.getRange(`F${i+1}:H${i+1}`).values=[[String(r[5]||'-')+'; flag expressions verified OLTP 3.000028 / OLAP 1.100020 as applicable; manual acceptance pending',r[0]==='Calendar'?'Disabled loans use explicit schedule charges. Enabled loans retain contractual projection branches.':r[2]==='Expected Interest This Month'?'Disabled loans forecast entered future Interest Remaining through month-end. Nominal rates retained.':'Returns zero when Auto Charge Enabled is off. Nominal interest terms remain stored.',f[key]]];
 cols.getRange(`A${i+1}:H${i+1}`).format.wrapText=true;
 cols.getRange(`A${i+1}:H${i+1}`).format.rowHeight=Math.min(450,Math.max(100,Math.ceil(f[key].length/105)*15));changed++;
}
if(changed!==11)throw Error('Unexpected field count '+changed);
const last=rows.reduce((n,r,i)=>r.some(v=>v!==null&&v!=='')?i+1:n,0),nr=last+1;
cols.getRange(`A${nr}:H${nr}`).copyFrom(cols.getRange('A75:H75'),'all');
cols.getRange(`A${nr}:H${nr}`).values=[['Loans',51,'Auto Charge Enabled','Physical / Yes/No','OLTP + OLAP','OLTP editable; OLAP read-only','TRUE permits generated charges. FALSE disables direct/bulk/bot generation and accrual; manual Charges entry allowed. Existing rows initialized TRUE, then 14 plan loans FALSE.','Initial value: TRUE. No app formula. Native key h7VnJR1ERY4o6UUaiANzwe. Restore nominal rates without re-enabling generation.']];
cols.getRange(`A${nr}:H${nr}`).format.wrapText=true;cols.getRange(`A${nr}:H${nr}`).format.rowHeight=135;
cols.getRange('A2').values=[['8 September 2026: Auto Charge Enabled added to Loans in both apps. Eleven existing model expressions reconciled. Manual workflow acceptance remains pending.']];
const rm=w.worksheets.getItem('README');
const tables=w.worksheets.getItem('Tables');const tr=tables.getRange('A5:G30').values;for(let i=0;i<tr.length;i++)if(tr[i][0]==='Loans')tables.getRange(`D${i+5}`).values=[[Number(tr[i][3])+1]];
rm.getRange('B35').values=[['8 September 2026: Puifai plan remains 46,000 across 72 charges; eight nominal rates restored and generation disabled. Oum: six charges due 30 September total 35,000 (interest 27,500 + penalties 7,500), no principal. Six original keys rescheduled and 12 superseded unpaid rows deleted with explicit approval and before-values retained. Oum generation disabled. Reactivation task created for 29 September 23:55 Bangkok. Configuration rollback: OLTP 3.000026 / OLAP 1.100018. Manual workflow acceptance and Looker refresh pending.']];
rm.getRange('A35:F35').format.wrapText=true;rm.getRange('A35:F35').format.rowHeight=160;
w.recalculate();
for(const [sheetName,range,file]of [['Columns',`A${nr}:H${nr}`,'flag-after.png'],['README','A35:F35','readme-after.png']]){const blob=await w.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(dir+'/'+file,new Uint8Array(await blob.arrayBuffer()));}
console.log((await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!',options:{useRegex:true,maxResults:5}})).ndjson);
await(await SpreadsheetFile.exportXlsx(w)).save(dir+'/AppSheet_Data_Dictionary.xlsx');
console.log(JSON.stringify({changed,newRow:nr}));
