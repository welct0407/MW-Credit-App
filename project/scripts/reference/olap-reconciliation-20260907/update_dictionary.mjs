import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const dir='C:/GitHub/AppSheet-Loan-Project/outputs/olap-reconciliation-20260907';
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(dir+'/dictionary.before.xlsx'));
const cols=w.worksheets.getItem('Columns');
const rows=cols.getRange('A5:H369').values;
const pPhysical=['_RowNumber','Row ID','Status','Ref Borrower','Amount Received','Payment Method','Allocation Method','Bank Reference','Notes','Created By','Payment Date','Created At','Processed At','Ref Target Charge'];
const aPhysical=['_RowNumber','Row ID','Charge Date Snapshot','Ref Payment','Ref Charge','Charge Row Number Snapshot','Interest Remaining Snapshot','Principal Remaining Snapshot','Amount Remaining Snapshot','Allocation Order','Allocated Interest','Allocated Principal','Allocated Amount','Created At'];
const scope={Payments:[...pPhysical,'Related Payment Allocations','Related Repayments'],'Payment Allocations':[...aPhysical,'Related Repayments'],Repayments:['Ref Payment','Ref Payment Allocation'],Borrowers:['Related Payments'],Charges:['Related Payment Allocations','Related Payments']};
const refs={'Payments|Ref Borrower':'Borrowers','Payments|Ref Target Charge':'Charges','Payment Allocations|Ref Payment':'Payments','Payment Allocations|Ref Charge':'Charges','Repayments|Ref Payment':'Payments','Repayments|Ref Payment Allocation':'Payment Allocations'};
let changed=0;
for(let i=0;i<rows.length;i++){
 let r=rows[i]; if(!scope[r[0]]?.includes(r[2]))continue;
 const [t,,n]=r;const ref=refs[t+'|'+n];const sys=['Row ID','_RowNumber'].includes(n);const vc=n.startsWith('Related ');
 let type=ref?'Ref':vc?'List':r[3].split(' / ')[1];
 if(t==='Payments'&&['Status','Allocation Method','Payment Method'].includes(n))type='Text';
 const initial=n==='Row ID'?'UNIQUEID("PackedUUID")':['Created At','Processed At'].includes(n)?'NOW()':['Payment Date','Charge Date Snapshot'].includes(n)?'TODAY()':'';
 const label=(t==='Payments'&&n==='Payment Date')||(t==='Payment Allocations'&&n==='Allocation Order');
 r[4]='OLTP + OLAP';
 r[5]='OLTP: '+r[5]+'\nOLAP v1.100016: table READ_ONLY; '+(sys?'hidden; column read-only':vc?'shown; VC read-only':'shown; base column editable')+(label?'; label':'')+(n==='Row ID'?'; key':'')+(ref?'; IsPartOf false; optional':'');
 r[7]='OLTP: '+r[7]+'\nOLAP v1.100016: '+type+'. '+(ref?'Ref to '+ref+'[Row ID]. ':'')+(vc?'Same REF_ROWS expression. ':'')+(initial?'Initial value '+initial+' (unused by read-only table). ':'Initial value blank. ')+'No operational payment actions or processing formulas imported.';
 if(type==='Text'&&r[3].includes('Enum'))r[3]='Physical / Enum (OLTP); Text (OLAP)';
 cols.getRange(`A${i+5}:H${i+5}`).values=[r];cols.getRange(`A${i+5}:H${i+5}`).format.rowHeight=180;changed++;
}
if(changed!==36)throw Error('Unexpected scope '+changed);
cols.getRange('A2').values=[['OLAP v1.100016, 7 September 2026: 36 payment-trace definitions now loaded. Existing OLTP definitions and unrelated OLAP definitions retained. Older unrelated OLAP inventory remains dated; this is a scoped schema/KPI reconciliation.']];
const ts=w.worksheets.getItem('Tables');const tr=ts.getRange('A5:G17').values;
for(let i=0;i<tr.length;i++){
 let r=tr[i];
 if(r[0]==='Payments'){r[2]='OLTP + OLAP';r[5]=2;r[6]='Universal receipts owned by OLTP. OLAP loads fourteen physical fields and two reverse-reference VCs in a READ_ONLY table; no processing engine.';}
 if(r[0]==='Payment Allocations'){r[2]='OLTP + OLAP';r[5]=1;r[6]='Stored allocation snapshots owned by OLTP. OLAP loads fourteen physical fields and one reverse-reference VC, READ_ONLY.';}
 if(r[0]==='Repayments')r[6]='Posted repayment grain unchanged. Both apps load eleven physical columns including two optional payment trace Refs. OLAP has thirteen VCs and remains READ_ONLY.';
 if(r[0]==='Borrowers')r[5]=65;
 if(r[0]==='Charges')r[5]=20;
 ts.getRange(`A${i+5}:G${i+5}`).values=[r];
}
ts.getRange('A2').values=[['12 native tables; OLTP loads8, OLAP loads13 business tables including external Calendar. OLAP live totals verified; unrelated older detailed inventory remains dated. System process tables excluded.']];
const rel=w.worksheets.getItem('Relationships');for(let i=13;i<=18;i++){let v=rel.getRange(`E${i}`).values[0][0];rel.getRange(`E${i}`).values=[[String(v).replace('; not loaded in OLAP','')+'; OLAP loaded, READ_ONLY, IsPartOf false']];rel.getRange(`A${i}:E${i}`).format.rowHeight=80;}
rel.getRange('A2').values=[['All six payment trace Refs resolve in both apps. OLTP ownership settings retained. All six OLAP payment Refs are independent; new tables and Repayments are READ_ONLY.']];
const av=w.worksheets.getItem('App Variances');const ars=av.getRange('A5:F203').values;
for(let i=0;i<ars.length;i++){let r=ars[i];if((r[0]==='Table'&&['Payments','Payment Allocations'].includes(r[1]))||scope[r[1]]?.includes(r[2])){r[4]='Yes';r[5]='OLAP v1.100016 loads read-only trace data. OLTP owns posting and input validation; OLAP has no payment processing engine.';av.getRange(`A${i+5}:F${i+5}`).values=[r];}}
av.getRange('A2').values=[['Payment trace fields and reverse references now shared with OLAP. Processing-only VCs stay OLTP-only. Collection Todays Amount Collected retains its documented date-basis variance.']];
const rm=w.worksheets.getItem('README');
rm.getRange('B5').values=[['OLAP schema warnings repaired at v1.100016 on 7 September 2026; rollback v1.100012. Added read-only payment target tables and two repayment Refs, preserving all existing column properties. Twenty shared numeric KPI formulas and displayed values match after refreshing both apps on the same date.']];
rm.getRange('B6').values=[['OLAP v1.100016; OLTP v3.000003 observed during this read-only comparison (previous rollout completed v3.000002). No OLTP configuration changed by this task. Existing full backup pair retained, no additional app/database copy.']];
rm.getRange('B35').values=[['OLAP payment trace schema reconciled at v1.100016; new payment tables READ_ONLY. Existing live KPIs match OLTP at displayed precision. Collection and historical snapshot definitions have distinct date/partial-payment bases documented in the reconciliation log.']];
rm.getRange('A37:B37').values=[['OLAP reconciliation','Change Logs/CHANGE_NOTES_OLAP_WARNINGS_KPI_RECONCILIATION_2026-09-06.md. Current scope:36 additional OLAP definitions; no new physical database fields or financial rows. Historical clone sheets remain unchanged.']];
rm.getRange('B37:F37').merge();rm.getRange('A37:F37').format.wrapText=true;rm.getRange('A37:F37').format.rowHeight=66;
for(const [sheet,range,file]of [['Columns','A325:H327','columns.png'],['Tables','A13:G17','tables.png'],['README','A35:F37','readme.png']]){let im=await w.render({sheetName:sheet,range,scale:1,format:'png'});await fs.writeFile(dir+'/'+file,new Uint8Array(await im.arrayBuffer()));}
console.log((await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!',options:{useRegex:true,maxResults:5}})).ndjson);
await(await SpreadsheetFile.exportXlsx(w)).save(dir+'/AppSheet_Data_Dictionary.xlsx');
console.log(JSON.stringify({changed,unionRows:rows.length,olapVersion:'1.100016'}));
