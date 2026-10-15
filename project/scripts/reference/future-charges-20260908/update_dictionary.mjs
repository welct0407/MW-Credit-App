import fs from 'node:fs/promises';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
const dir='C:/GitHub/AppSheet-Loan-Project/outputs/future-charges-20260908';
const w=await SpreadsheetFile.importXlsx(await FileBlob.load('C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx'));
const cols=w.worksheets.getItem('Columns');
const rows=cols.getRange('A1:H450').values;
if(process.argv.includes('--final-status')){
 const rm=w.worksheets.getItem('README');
 rm.getRange('B35').values=[['8 September 2026: OLTP 3.000026 / OLAP 1.100018; rollback 3.000024 / 1.100017. Puifai plan entered: 24 retained charge keys plus 48 new rows, principal 31,000 + fixed profit 15,000 = 46,000; eight daily-interest rates zero. All 72 saved date/component/note values checked. Both synced apps: pending 14,900; today’s profit 3,086 = cash 3,380 less principal 294. Payment/bot manual acceptance and Looker refresh remain pending.']];
 rm.getRange('A35:F35').format.wrapText=true;
 rm.getRange('A35:F35').format.rowHeight=120;
 w.recalculate();
 const out=await w.render({sheetName:'README',range:'A35:F35',scale:1,format:'png'});await fs.writeFile(dir+'/final-readme.png',new Uint8Array(await out.arrayBuffer()));
 await(await SpreadsheetFile.exportXlsx(w)).save('C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx');
 console.log('Final implementation status recorded; formulas unchanged');process.exit(0);
}
if(process.argv.includes('--format-only')){
 const keys=JSON.parse(await fs.readFile(dir+'/formula-after.json','utf8'));
 for(let i=4;i<rows.length;i++){
  const r=rows[i],key=r[0]+'|'+r[2];
  if(!keys[key]&&key!=='Borrowers|Todays Amount Collected')continue;
  if(r[0]==='Statistics')r[6]='Remaining '+(r[2]==='Pending Payment Amount'?'amount':'interest')+' for referenced charges with Charge Date <= TODAY. Future charges excluded.';
  if(key==='Loans|Last Interest Charge Date')r[6]='Latest related charge dated through today; ignores future schedule dates.';
  if(key==='Loans|Accrued Interest Days')r[6]='Whole elapsed days since the last past/today charge or Loan Date, clamped to zero.';
  if(key==='Borrowers|Projected Monthly Profit Contribution')r[6]='Realized current-month interest plus due-through-today interest remaining plus expected remaining-month interest, without future-charge double counting.';
  cols.getRange(`G${i+1}`).values=[[r[6]]];
  cols.getRange(`A${i+1}:H${i+1}`).format.wrapText=true;
  cols.getRange(`A${i+1}:H${i+1}`).format.rowHeight=Math.min(450,Math.max(110,Math.ceil(String(r[7]).length/110)*15));
 }
 w.recalculate();
 const out=await w.render({sheetName:'Columns',range:'A37:H40',scale:1,format:'png'});await fs.writeFile(dir+'/collection-after.png',new Uint8Array(await out.arrayBuffer()));
 await(await SpreadsheetFile.exportXlsx(w)).save('C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx');
 console.log('Updated field wrapping and checked row heights');process.exit(0);
}
const selected=rows.map((r,i)=>({row:i+1,values:r})).filter(x=>['Last Interest Charge Date','Accrued Interest Days','Expected Interest This Month','Todays Collection Charges','Todays Amount Due','Todays Amount Remaining','Pending Payment Amount',"Today's Outstanding Interest",'Todays Amount Collected','Projected Monthly Profit Contribution'].includes(x.values[2])||x.values[0]==='Calendar');
await fs.writeFile(dir+'/dictionary-inspect.json',JSON.stringify(selected,null,2));
const im=await w.render({sheetName:'Columns',range:'A42:H44',scale:1,format:'png'});
await fs.writeFile(dir+'/dictionary-before.png',new Uint8Array(await im.arrayBuffer()));
if(!process.argv.includes('--edit')) { console.log(selected.map(x=>({row:x.row,table:x.values[0],name:x.values[2]}))); process.exit(0); }
const before=Object.fromEntries(rows.filter(r=>r[0]&&r[2]).map(r=>[r[0]+'|'+r[2],r[7]]));
const changes={
 'Loans|Last Interest Charge Date':'MAX(SELECT([Related Charges][Charge Date], [Charge Date] <= TODAY()))',
 'Loans|Accrued Interest Days':'MAX(LIST(0, FLOOR(IF(ISBLANK([Last Interest Charge Date]), TOTALHOURS(TODAY() - [Loan Date]) / 24, TOTALHOURS(TODAY() - [Last Interest Charge Date]) / 24))))',
 'Borrowers|Todays Collection Charges':'SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID], OR(AND([Payment Status] <> "ชำระแล้ว", [Charge Date] <= TODAY()), AND([Payment Status] = "ชำระแล้ว", [Payment Date] = TODAY()), IN(TODAY(), [Related Repayments][Payment Date]))))',
 'Borrowers|Todays Amount Due':'SUM(SELECT([Todays Collection Charges][Amount Due], [Charge Date] <= TODAY()))',
 'Borrowers|Todays Amount Remaining':'SUM(SELECT([Todays Collection Charges][Amount Remaining], [Charge Date] <= TODAY()))',
 'Statistics|Pending Payment Amount':'SUM(SELECT(Charges[Amount Remaining], AND(ISNOTBLANK([Ref Loans]), [Charge Date] <= TODAY())))',
 "Statistics|Today's Outstanding Interest":'SUM(SELECT(Charges[Interest Remaining], AND(ISNOTBLANK([Ref Loans]), [Charge Date] <= TODAY())))',
 'Borrowers|Projected Monthly Profit Contribution':'SUM(SELECT(Repayments[Interest Paid], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID], MONTH([Payment Date]) = MONTH(TODAY()), YEAR([Payment Date]) = YEAR(TODAY())))) + SUM(SELECT(Charges[Interest Remaining], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID], [Charge Date] <= TODAY()))) + SUM(SELECT(Loans[Expected Interest This Month], [Ref Borrowers] = [_THISROW].[Row ID]))',
};
const monthlyKey='Loans|Expected Interest This Month';
changes[monthlyKey]=before[monthlyKey].replace('IFS([Loan Type] = "ดอกเบี้ยรายวัน",','IFS(AND([Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest] = 0), SUM(SELECT([Related Charges][Interest Remaining], AND([Charge Date] > TODAY(), [Charge Date] <= EOMONTH(TODAY(), 0)))), [Loan Type] = "ดอกเบี้ยรายวัน",');
if(changes[monthlyKey]===before[monthlyKey])throw Error('Monthly formula replacement failed');
const condition='[Ref Loans].[Ref Borrowers] = [_THISROW].[Assessment Borrower], [Ref Loans].[Loan Status] = "ยังไม่ปิดยอด", [Ref Loans].[Loan Type] = "ดอกเบี้ยรายวัน", [Ref Loans].[Current Daily Interest] = 0, [Charge Date] = [_THISROW].[Date]';
for(const [name,col,future]of [['Assessment Installment Contract Principal Due','Principal Due',false],['Assessment Installment Future Principal Due','Principal Remaining',true],['Assessment Installment Future Interest Due','Amount Remaining',true]]){
 const key='Calendar|'+name;
 changes[key]=before[key]+' + SUM(SELECT(Charges['+col+'], AND('+condition+(future?', [Charge Date] > TODAY()':'')+')))';
}
changes['Calendar|Assessment Installment Contract Outstanding']='MAX(LIST([Assessment Installment Contract Principal Due] * 0, SUM(SELECT(Loans[Principal Amount], AND([Ref Borrowers] = [_THISROW].[Assessment Borrower], [Loan Status] = "ยังไม่ปิดยอด", [Loan Date] <= [_THISROW].[Date], OR(AND([Loan Type] = "ผ่อนชำระรายวัน", [Due Date] >= [Loan Date], [Daily Payment Amount] > 0), AND([Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest] = 0))))) - SUM(SELECT(Calendar[Assessment Installment Contract Principal Due], [Date] <= [_THISROW].[Date]))))';
for(const name of ['Projected Outstanding Principal','Assessment Principal Base','Assessment Principal Start Weight']){
 const key='Calendar|'+name;
 changes[key]=before[key].replace('[Loan Type] = "ดอกเบี้ยรายวัน",','AND([Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest] <> 0),');
 if(name==='Projected Outstanding Principal') changes[key]=changes[key].replace('[Loan Type] = "ผ่อนชำระรายวัน",','OR([Loan Type] = "ผ่อนชำระรายวัน", AND([Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest] = 0)),');
}
const olapCollected='SUM(SELECT(Repayments[Amount Received], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID], [Payment Date] = TODAY())))';
// FNV hashes disregard whitespace only, for comparison with captured editor expressions.
const hash=s=>{let h=2166136261;for(const c of s.replace(/\s/g,'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
console.log(JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k,v])=>[k,hash(v)]))));
await fs.writeFile(dir+'/formula-after.json',JSON.stringify({...changes,'Borrowers|Todays Amount Collected OLAP':olapCollected},null,2));
let count=0;
for(let i=4;i<rows.length;i++){
 const r=rows[i],key=r[0]+'|'+r[2];
 if(changes[key]){
  r[7]=changes[key];
  r[6]=(key.startsWith('Calendar|')?'OLAP schedule forecast includes active zero-rate daily-interest loans using explicit Charges. Existing installment behavior retained.':key===monthlyKey?'For zero-rate daily-interest loans, forecasts entered future Interest Remaining through month-end. Other loan branches retained.':'Future-charge scope reconciled on 8 September 2026. Due totals exclude future dates; collection includes actual repayment activity today.');
  r[5]=String(r[5]||'-')+'; formula inspected OLTP 3.000026 / OLAP 1.100018 as applicable; manual acceptance pending';
  cols.getRange(`F${i+1}:H${i+1}`).values=[r.slice(5)];count++;
 }
 if(key==='Borrowers|Todays Amount Collected'){
  cols.getRange(`F${i+1}:H${i+1}`).values=[['Same date basis; different aggregation path','Both apps sum actual posted repayments dated today, including future-charge partial prepayments.','OLTP: SUM([Todays Collection Charges][Payment Received Today]); OLAP: '+olapCollected]];count++;
 }
}
if(count!==17)throw Error('Unexpected updated field count '+count);
cols.getRange('A2').values=[['8 September 2026: future-charge expressions aligned at OLTP 3.000026 / OLAP 1.100018. No new fields or tables. Prior collection settings retained; their OLAP schema reconciliation remains pending.']];
const rm=w.worksheets.getItem('README');
rm.getRange('B35').values=[['Future-charge scope: OLTP 3.000026, OLAP 1.100018; rollback 3.000024 / 1.100017. 17 existing VCs updated or aligned. Today’s Profit remains posted Interest Paid on Payment Date today. Current receipts 1,240 = principal 294 + profit 946. Pending 25,740 reconciles to Collection. Financial plan entry and manual acceptance pending.']];
rm.getRange('B35').format.wrapText=true;
rm.getRange('A35:F35').format.rowHeight=120;
const av=w.worksheets.getItem('App Variances');
const ar=av.getRange('A5:F450').values;
for(let i=0;i<ar.length;i++)if(ar[i][1]==='Borrowers'&&ar[i][2]==='Todays Amount Collected')av.getRange(`F${i+5}`).values=[['Both apps use repayments dated today. OLTP sums charge-level Payment Received Today; OLAP directly sums Repayments[Amount Received]. Reconciled 8 September 2026.']];
av.getRange('A2').values=[['Payment processing VCs remain OLTP-only. Collection amount now shares the same Payment Date = TODAY basis in both apps, using app-specific aggregation paths. Collection settings OLAP availability remains pending reconciliation.']];
w.recalculate();
for(const [range,file]of [['A37:H40','collection-after.png'],['A284:H286','kpi-after.png']]){
 const out=await w.render({sheetName:'Columns',range,scale:1,format:'png'});await fs.writeFile(dir+'/'+file,new Uint8Array(await out.arrayBuffer()));
}
console.log((await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!',options:{useRegex:true,maxResults:5}})).ndjson);
await(await SpreadsheetFile.exportXlsx(w)).save(dir+'/AppSheet_Data_Dictionary.xlsx');
console.log(JSON.stringify({updated:count,output:dir+'/AppSheet_Data_Dictionary.xlsx'}));
