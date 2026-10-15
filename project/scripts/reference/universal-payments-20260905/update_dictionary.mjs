import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const dir = 'C:/GitHub/AppSheet-Loan-Project/outputs/universal-payments-20260905';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(dir + '/AppSheet_Data_Dictionary.before.xlsx'));
const originalColumns = wb.worksheets.getItem('Columns');
const clone = wb.worksheets.add('Payments Clone');
const rows=[];
const add=(table,order,name,type,flags,purpose,definition='Stored clone column; further configuration and testing pending')=>rows.push([table,order,name,type,'OLTP test clone only',flags,purpose,definition]);
add('Payments',1,'_RowNumber','Physical / Number','Hidden; not key','Source row ordinal','System source ordinal');
add('Payments',2,'Row ID','Physical / Text','Key; required; hidden; not editable','Stable native database key','Initial: UNIQUEID("PackedUUID")');
add('Payments',3,'Status','Physical / Enum','Required; not editable; other values false','Processing state','Values: Processing, Posted, Error; initial: "Processing"');
add('Payments',4,'Amount Received','Physical / Price','Editable; validation pending','Actual receipt amount');
add('Payments',5,'Payment Method','Physical / Text','Enum configuration pending','Receipt channel');
add('Payments',6,'Allocation Method','Physical / Text','Enum configuration pending','Requested allocation workflow');
add('Payments',7,'Bank Reference','Physical / Text','Optional','Bank transaction reference');
add('Payments',8,'Notes','Physical / LongText','Optional','Receipt notes');
add('Payments',9,'Created By','Physical / Email','Default/read-only configuration pending','Receipt creator');
add('Payments',10,'Payment Date','Physical / Date','Native database label; app label','Receipt date','Initial: TODAY(); date validation pending');
add('Payments',11,'Created At','Physical / DateTime','Read-only configuration pending','Receipt creation time','Initial: NOW()');
add('Payments',12,'Processed At','Physical / DateTime','Initial value correction pending','Processing completion time','Imported initial: NOW(); must clear before processing implementation');
add('Payments',13,'Ref Borrower','Physical / Ref','Native Reference; required; IsPartOf true','Owning borrower','Target: Borrowers in cloned database');
add('Payments',14,'Ref Target Charge','Physical / Ref','Native Reference; IsPartOf false','Optional target for single-charge and first-day methods','Target: Charges. Valid If: SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], [Amount Remaining] > 0)). Show If and Required If: IN([Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto")). Editable If: NOT(IN([Row ID], Payments[Row ID]))');
add('Payments',15,'Related Payment Allocations','VC / List','Auto-generated; shown','Allocation children','REF_ROWS("Payment Allocations", "Ref Payment")');
add('Payment Allocations',1,'_RowNumber','Physical / Number','Hidden; not key','Source row ordinal','System source ordinal');
add('Payment Allocations',2,'Row ID','Physical / Text','Key; required; hidden; not editable','Stable native database key','Initial: UNIQUEID("PackedUUID")');
add('Payment Allocations',3,'Charge Date Snapshot','Physical / Date','Snapshot action pending','Frozen charge date','Imported initial: TODAY(); snapshot creation must set the actual charge date');
add('Payment Allocations',4,'Charge Row Number Snapshot','Physical / Number','Snapshot action pending','Frozen tie-break ordinal');
add('Payment Allocations',5,'Interest Remaining Snapshot','Physical / Price','Snapshot action pending','Interest before posting');
add('Payment Allocations',6,'Principal Remaining Snapshot','Physical / Price','Snapshot action pending','Principal before posting');
add('Payment Allocations',7,'Amount Remaining Snapshot','Physical / Price','Snapshot action pending','Total outstanding before posting');
add('Payment Allocations',8,'Allocation Order','Physical / Number','Native database label; app label','Frozen allocation priority');
add('Payment Allocations',9,'Allocated Interest','Physical / Price','Freeze action pending','Frozen interest allocation');
add('Payment Allocations',10,'Allocated Principal','Physical / Price','Freeze action pending','Frozen principal allocation');
add('Payment Allocations',11,'Allocated Amount','Physical / Price','Freeze action pending','Frozen total allocation');
add('Payment Allocations',12,'Created At','Physical / DateTime','Read-only configuration pending','Allocation creation time','Initial: NOW()');
add('Payment Allocations',13,'Ref Payment','Physical / Ref','Native Reference; required; not editable; IsPartOf true','Owning receipt','Target: Payments in cloned database');
add('Payment Allocations',14,'Ref Charge','Physical / Ref','Native Reference; required; not editable; IsPartOf false','Allocated charge','Target: Charges in cloned database');
add('Payment Allocations',15,'Related Repayments','VC / List','Auto-generated; shown','Repayments generated from allocation','REF_ROWS("Repayments", "Ref Payment Allocation")');
add('Repayments',10,'Ref Payment','Physical / Ref','Native Reference; optional; not editable; IsPartOf false','Receipt trace; historical/default rows may be blank','Target: Payments in cloned database. Added by schema regeneration; existing key retained.');
add('Repayments',11,'Ref Payment Allocation','Physical / Ref','Native Reference; optional; not editable; IsPartOf false','Allocation trace; historical/default rows may be blank','Target: Payment Allocations in cloned database. Added by schema regeneration; existing key retained.');

// Extend the inspected clone inventory through the saved v1.000028 checkpoint.
const change=(table,name,flags,definition)=>{const r=rows.find(x=>x[0]===table&&x[2]===name);if(!r)throw Error(name);r[5]=flags;r[7]=definition;};
const locked='NOT(IN([Row ID], Payments[Row ID]))';
const targeted='IN([Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto", "Loan Close"))';
const eligibility='SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], [Amount Remaining] > 0, IFS(IN([_THISROW].[Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto")), [Row ID] = [_THISROW].[Ref Target Charge], [_THISROW].[Allocation Method] = "Loan Close", [Ref Loans] = [_THISROW].[Ref Target Charge].[Ref Loans], IN([_THISROW].[Allocation Method], LIST("Receive All", "Lump Sum")), [Charge Date] <= [_THISROW].[Payment Date], TRUE, FALSE)))';
change('Payments','Status','Required; Editable_If FALSE; other values false','Values: Processing, Posted, Error; initial: "Processing". Base Editable enabled so actions can write; user edits blocked by expression FALSE.');
change('Payments','Amount Received','Required; 0 decimals; ฿; locked after creation','Editable_If: '+locked+'. Valid If: AND([_THIS] > 0, [_THIS] = ROUND([_THIS]), [_THIS] <= [Eligible Outstanding], IF(IN([Allocation Method], LIST("Single Full", "Receive All", "First-day Auto", "Loan Close")), [_THIS] = [Eligible Outstanding], TRUE)). Error: "Enter a positive whole-baht amount within the eligible outstanding balance. Full-payment methods must equal that balance."');
for(const [name,values,initial,editable] of [['Payment Method','Bank Transfer, Cash, Net-off at Disbursement','"Bank Transfer"',locked],['Allocation Method','Single Full, Single Partial, Receive All, Lump Sum, First-day Auto, Loan Close','"Lump Sum"','FALSE']]) {
 const r=rows.find(x=>x[0]==='Payments'&&x[2]===name);r[3]='Physical / Enum';change('Payments',name,'Required; Text base; other values/autocomplete false','Values: '+values+'. Initial: '+initial+'. Editable_If: '+editable);
}
change('Payments','Created By','Editable_If FALSE','Initial: USEREMAIL()');
change('Payments','Created At','Editable_If FALSE','Initial: NOW()');
change('Payments','Processed At','Editable_If FALSE','Initial: blank; processing must set completion time');
change('Payments','Payment Date','Required; native/app label; locked after creation','Initial: TODAY(). Valid If: [_THIS] <= TODAY(). Editable_If: '+locked);
change('Payments','Ref Borrower','Native Reference; required; IsPartOf true; locked after creation','Target: Borrowers. Editable_If: '+locked+'. Valid If: COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Row ID] <> [_THISROW].[Row ID], IN([Status], LIST("Processing", "Error"))))) = 0. Error: "Finish or retry the existing payment for this borrower before creating another receipt." This is a form constraint, not an atomic lock.');
change('Payments','Ref Target Charge','Native Reference; IsPartOf false; locked after creation','Target: Charges. Valid If: SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], [Amount Remaining] > 0)). Show If and Required If: '+targeted+'. Editable_If: '+locked);
for(const name of ['Ref Payment','Ref Payment Allocation']){
 const r=rows.find(x=>x[0]==='Repayments'&&x[2]===name);r[5]='Native Reference; optional; Editable_If FALSE; IsPartOf false';r[7]+=' Base Editable enabled; expression FALSE permits action writes while preventing form edits.';
}
for(const name of ['Ref Payment','Ref Charge']){const r=rows.find(x=>x[0]==='Payment Allocations'&&x[2]===name);r[5]=r[5].replace('not editable','Editable_If FALSE');r[7]+='. Base Editable enabled for processing actions.';}
change('Payment Allocations','Charge Date Snapshot','Required; Editable_If FALSE','Initial: blank. Snapshot action must supply actual charge date.');
for(const name of ['Charge Row Number Snapshot','Allocation Order','Interest Remaining Snapshot','Principal Remaining Snapshot','Amount Remaining Snapshot'])change('Payment Allocations',name,'Required; Editable_If FALSE'+(name.includes('Remaining')?'; ฿; 0 decimals':''),'Initial: 0. Snapshot/freeze action pending.');
const helpers=[
 ['Related Repayments','List','Auto-generated; shown','Receipt repayments','REF_ROWS("Repayments", "Ref Payment")'],
 ['Eligible Charges','List','Hidden; element Ref to Charges','Eligible charge population',eligibility],
 ['Eligible Outstanding','Price','Hidden; ฿; 0 decimals','Eligible outstanding amount','SUM([Eligible Charges][Amount Remaining])'],
 ['Planned Allocation Amount','Price','Shown; ฿; 0 decimals','Sum of frozen allocation amounts','SUM([Related Payment Allocations][Allocated Amount])'],
 ['Posted Amount','Price','Shown; ฿; 0 decimals','Actual repayments linked to receipt','SUM(SELECT(Repayments[Amount Received], [Ref Payment] = [_THISROW].[Row ID]))'],
 ['Allocation Difference','Price','Shown; ฿; 0 decimals','Receipt less planned amount','[Amount Received] - [Planned Allocation Amount]'],
 ['Posting Difference','Price','Shown; ฿; 0 decimals','Receipt less posted amount','[Amount Received] - [Posted Amount]']
];
rows.splice(15,0,...helpers.map((r,i)=>['Payments',16+i,r[0],'VC / '+r[1],'OLTP test clone only',r[2],r[3],r[4]]));
const actionCheckpoint=JSON.parse(await fs.readFile(dir+'/action_checkpoint_v1.000028.json','utf8'));
for(const name of ['Allocated Interest','Allocated Principal','Allocated Amount'])change('Payment Allocations',name,'Required; Editable_If FALSE; ฿; 0 decimals','Initial: 0. Set by Payment - Freeze Allocation. Functional tests pending.');
change('Payment Allocations','Created At','Editable_If FALSE','Initial: NOW()');
for(const name of ['Charge Row Number Snapshot','Allocation Order','Interest Remaining Snapshot','Principal Remaining Snapshot','Amount Remaining Snapshot']){
 const r=rows.find(x=>x[0]==='Payment Allocations'&&x[2]===name);r[7]=r[7].replace('Snapshot/freeze action pending.','Snapshot/freeze actions configured; functional tests pending.');
}
const paHelpers=actionCheckpoint.helpers.map((r,i)=>['Payment Allocations',16+i,r[0],'VC / '+r[1],'OLTP test clone only','Hidden'+(r[1]==='Price'?'; ฿; 0 decimals':''),'Pre-freeze allocation calculation',r[2]]);
rows.splice(rows.findIndex(r=>r[0]==='Repayments'),0,...paHelpers);
add('Repayments','existing','Created By','Physical / Email','Hidden; base Editable enabled; Editable_If FALSE','Preserve original receipt creator','Existing initial USEREMAIL() retained. Payment - Post Allocation explicitly assigns [Ref Payment].[Created By]. Existing position pending read-back.');

// Reconciled model checkpoint v1.000065, confirmed in Manage > Versions.
for(const name of ['Bank Reference','Notes'])change('Payments',name,'Optional; locked while existing receipt is Processing','Editable_If: OR(NOT(IN([Row ID], Payments[Row ID])), [Status] <> "Processing"). New form entry and Posted/Error metadata edits allowed.');
change('Payments','Amount Received','Required; 0 decimals; ฿; locked after creation','Editable_If: '+locked+'. Valid If: OR(IN([Row ID], Payments[Row ID]), AND([_THIS] > 0, [_THIS] = ROUND([_THIS]), [_THIS] <= [Eligible Outstanding], IF(IN([Allocation Method], LIST("Single Full", "Receive All", "First-day Auto", "Loan Close")), [_THIS] = [Eligible Outstanding], TRUE))). Description: CONCATENATE("ยอดคงเหลือที่ชำระได้ / Current eligible outstanding: ฿ ", [Eligible Outstanding]). Error unchanged: "Enter a positive whole-baht amount within the eligible outstanding balance. Full-payment methods must equal that balance."');
change('Payments','Ref Borrower','Native Reference; required; IsPartOf true; locked after creation','Target: Borrowers. Editable_If: '+locked+'. Valid If: OR(IN([Row ID], Payments[Row ID]), COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Row ID] <> [_THISROW].[Row ID], IN([Status], LIST("Processing", "Error"))))) = 0). Error unchanged. Existing receipt metadata edits retain the original borrower; this does not establish an atomic lock.');
change('Payments','Ref Target Charge','Native Reference; IsPartOf false; locked after creation','Target: Charges. Valid If: SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], OR([Amount Remaining] > 0, AND(IN([_THISROW].[Row ID], Payments[Row ID]), [Row ID] = [_THISROW].[Ref Target Charge])))). Show If and Required If: '+targeted+'. Editable_If: '+locked);
change('Payments','Related Payment Allocations','Auto-generated; hidden; Search false','REF_ROWS("Payment Allocations", "Ref Payment"). Complete ownership/snapshot list; positive display uses Visible Allocations.');
rows.splice(rows.findIndex(r=>r[0]==='Payment Allocations'),0,['Payments',23,'Visible Allocations','VC / List','OLTP test clone only','Shown; element Ref to Payment Allocations','Positive allocation display','SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocated Amount] > 0)). Display name: "รายการจัดสรร / Allocations"']);
const creatorRow=rows.find(r=>r[0]==='Repayments'&&r[2]==='Created By');creatorRow[1]=9;creatorRow[5]+='; PII true';creatorRow[7]='Initial USEREMAIL() retained. Payment - Post Allocation explicitly assigns [Ref Payment].[Created By]. Position 9 confirmed.';
for(const [order,name,type] of [[3,'Payment Date','Date'],[4,'Principal Paid','Price'],[5,'Interest Paid','Price'],[6,'Notes','LongText'],[8,'Ref Charges','Ref']])add('Repayments',order,name,'Physical / '+type,'Existing; Editable_If ISBLANK([Ref Payment])'+(name==='Ref Charges'?'; required; IsPartOf true':''),'Protect receipt-generated repayment values','Editable_If: ISBLANK([Ref Payment]). Existing formulas, defaults and validation retained; historical/default rows with blank Ref Payment remain editable.'+(name==='Ref Charges'?' Ref Charges target: Charges.':''));
for(const [table,order,name,formula] of [['Borrowers',33,'Related Payments','REF_ROWS("Payments", "Ref Borrower")'],['Charges',24,'Related Payment Allocations','REF_ROWS("Payment Allocations", "Ref Charge")'],['Charges',25,'Related Payments','REF_ROWS("Payments", "Ref Target Charge")']])add(table,order,name,'VC / List','Shown; searchable; not editable','Reverse reference to new payment branch',formula);

const later=JSON.parse(await fs.readFile(dir+'/configuration_checkpoint_after052.json','utf8'));
add('Charges',5,'Interest Due','Physical / Price','Existing; required; initial 0','Retain zero-allocation snapshot charges during default','Valid If: '+later.interest_due_valid_after+'. Earlier rule: '+later.interest_due_valid_before+'. Narrow zero/zero exception; signed default-loss interest remains supported.');

clone.getRange('A1:H8').copyFrom(originalColumns.getRange('A1:H8'),'all');
clone.getRange('A1').values=[['Universal payments clone']];
clone.getRange('A2').values=[['Schema checkpoint 2026-09-06, clone v1.000065. 54 inspected definitions, including processing-time metadata locks. Targeted payment tests pass after fixes; broader testing continues. Production and OLAP unchanged.']];
clone.getRange('A4:H4').values=[['Table','App order','Column','Kind / type','Availability','Flags','Purpose','Definition / expression']];
clone.getRange(`A5:H${4+rows.length}`).values=rows;
for(let r=5;r<=4+rows.length;r++) {
  const vals=clone.getRange(`A${r}:H${r}`).values;
  clone.getRange(`A${r}:H${r}`).copyFrom(originalColumns.getRange(r%2?'A5:H5':'A6:H6'),'all');
  clone.getRange(`A${r}:H${r}`).values=vals;
}
const widths=[24,12,31,24,22,48,45,100];
widths.forEach((width,i)=>clone.getRangeByIndexes(0,i,4+rows.length,1).format.columnWidth=width);
clone.getRange(`A5:H${4+rows.length}`).format.wrapText=true;
clone.getRange(`A5:H${4+rows.length}`).format.verticalAlignment='top';
clone.getRange(`A5:H${4+rows.length}`).format.rowHeight=40;
clone.getRange('A8:H8').format.rowHeight=110;
clone.getRange('A17:H18').format.rowHeight=110;
clone.getRange('A21:H21').format.rowHeight=115;
clone.getRange('A58:H58').format.rowHeight=110;
for(let i=0;i<rows.length;i++)if(rows[i][2].startsWith('Calculated '))clone.getRange(`A${i+5}:H${i+5}`).format.rowHeight=115;
clone.getRange('A2:H2').format.rowHeight=36;
clone.freezePanes.freezeRows(4);
clone.freezePanes.freezeColumns(1);
clone.showGridLines=false;
clone.tables.add(`A4:H${4+rows.length}`,true,'PaymentsCloneColumns').style=originalColumns.tables.items[0].style;
const notes=[
 ['Clone app','LoanMgr Payments TEST 20260905; 1b901dff-2e47-477c-8d2c-28aad5556102; rollback v1.000002; model checkpoint v1.000065 confirmed in Manage > Versions on September 6'],
 ['Clone database','Money Payments TEST 20260905; eEwpmrK1Zr4_ao2UcQzF42; 12 native tables; eight loaded in clone app'],
 ['Production source','Source OLTP v2.300005 observed before copy. Unrelated drift since the production inventory v2.300003 is pending reconciliation. Source native database: 9Y5vh3TFzZ4sIe2JgNh4l0'],
 ['Clone tables','Payments: 14 physical app columns including source ordinal and nine VCs, total 23. Payment Allocations: 14 physical app columns including source ordinal and five VCs, total 19. Repayments: two added References; Created By and five existing entry fields protected. Three reverse-reference VCs reconciled on Borrowers/Charges; one changed Interest Due validation. Two borrower slices automatically include Related Payments; exact membership is on Payments Clone Slices. Production counts exclude clone changes.'],
 ['Default behavior','Referenced snapshot charges are written off in place rather than deleted. Zero/zero Interest Due validation exception requires only zero Posted allocations and no actual paid amount. Default root blocks Processing/Error receipts. The group is not atomic: an initial validation failure partially committed; corrected fresh retest passed.'],
 ['Cascade branch','Borrowers > Payments > Payment Allocations uses IsPartOf. Cross-links to Charges and Repayments are independent. Existing Borrower > Loan > Charge > Repayment cascade retained. Disposable Borrower B deletion completed across both branches after sync. Initial checks during sync were premature; see T034 correction.'],
 ['Native column types','All six newly added relationship fields are native Reference and app Ref. Temporary Text staging was superseded. Production migration should create native Reference directly.'],
 ['Testing boundary','Fresh first-day, lump sum100/205, cash partial2 and Receive All23 passed in synthetic fixtures after fixes. Full snapshot order and zero rows verified; Collection totals reconcile. Unposted receipt-to-allocation cascade passed. Borrower cascade, cross-date ordering, uneven final installment and default fixtures passed after completed sync/fixes. Broader regressions, offline/multi-user and acceptance remain pending. Initial failures are preserved in the execution report.'],
 ['Change history','Change Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_CLONE_2026-09-05.md is authoritative. Borrowers/Charges reverse references reconciled. Loan Close preserves the existing loan scope. Native Row ID cannot be assigned by the inspected action picker. Processing was revised to query saved rows; receipt/default/cascade checks are recorded in the execution report; manual acceptance remains pending.'],
 ['Editor source','https://www.appsheet.com/template/appdef?appId=LoanMgrPaymentsTEST20260905-578763613&appName=LoanMgrPaymentsTEST20260905-578763613'],
 ['Database source','https://www.appsheet.com/dbs/database/eEwpmrK1Zr4_ao2UcQzF42/table/7rco54zfAb4EEbaVFZpkJc']
];
const nstart=rows.length+8;
for(let i=0;i<notes.length;i++) {
 const r=nstart+i;
 clone.getRange(`A${r}:B${r}`).values=[notes[i]];
 clone.getRange(`B${r}:H${r}`).merge();
 clone.getRange(`A${r}:H${r}`).format.font={name:'Calibri',size:11};
 clone.getRange(`A${r}:H${r}`).format.wrapText=true;
 clone.getRange(`A${r}:H${r}`).format.rowHeight=44;
 clone.getRange(`A${r}`).format.font.bold=true;
}
const sliceInventory=JSON.parse(await fs.readFile(dir+'/clone_slices_checkpoint065.json','utf8'));
const cs=wb.worksheets.add('Payments Clone Slices');
cs.getRange('A1:G1').merge();cs.getRange('A1').values=[['Clone slice membership — v1.000065']];
cs.getRange('A1:G1').format.font={name:'Calibri',size:16,bold:true,color:'#FFFFFF'};
cs.getRange('A1:G1').format.fill='#17365D';cs.getRange('A1:G1').format.rowHeight=30;
cs.getRange('A2:G2').merge();cs.getRange('A2').values=[['Clone only. Related Payments was automatically appended to both borrower slices; production sheets retain their baseline.']];
cs.getRange('A2:G2').format.wrapText=true;cs.getRange('A2:G2').format.rowHeight=36;
const sr=sliceInventory.flatMap(x=>x.columns.map((c,i)=>[x.name,x.source,i+1,c,x.filter,x.updates,x.actions]));
cs.getRange('A4:G4').values=[['Slice','Source','Position','Column','Row filter','Update mode','Slice actions']];
cs.getRange('A5:G49').values=sr;
cs.getRange('A4:G49').format.font={name:'Calibri',size:11};cs.getRange('A4:G49').format.wrapText=true;cs.getRange('A4:G49').format.rowHeight=34;
[28,15,10,40,47,25,20].forEach((w,i)=>cs.getRangeByIndexes(0,i,49,1).format.columnWidth=w);
cs.tables.add('A4:G49',true,'PaymentsCloneSliceColumns').style=originalColumns.tables.items[0].style;
cs.freezePanes.freezeRows(4);cs.showGridLines=false;
await fs.writeFile(dir+'/dictionary-slices-after.png',new Uint8Array(await (await wb.render({sheetName:'Payments Clone Slices',range:'A35:G49',scale:1,format:'png'})).arrayBuffer()));
const readme=wb.worksheets.getItem('README');
readme.getRange('A28:B29').values=[['Payments Clone','Separate technical inventory at clone v1.000065 on 2026-09-06: 54 inspected new/changed definitions. Targeted payment tests pass after fixes; broader testing incomplete. Existing production inventory sheets retain their dated baselines.'],['Clone rollback','App v1.000002; physical schema rollback requires a fresh isolated source copy. See the authoritative Markdown change log for exact object changes and remaining work.']];
readme.getRange('B28:F28').merge();
readme.getRange('B29:F29').merge();
readme.getRange('A28:F29').format.wrapText=true;
readme.getRange('A28:F29').format.rowHeight=60;
readme.getRange('A28:F29').format.verticalAlignment='center';
readme.getRange('A28:A29').format.font.bold=true;
for (const [name,range,file] of [['Payments Clone','A1:H10','dictionary-clone-after.png'],['Payments Clone','A15:H20','dictionary-validation-after.png'],['Payments Clone','A21:H26','dictionary-helpers-after.png'],['Payments Clone','A42:H48','dictionary-allocation-after.png'],['Payments Clone','A55:H58','dictionary-default-after.png'],['README','A28:F29','dictionary-readme-after.png']]) {
 const img=await wb.render({sheetName:name,range,scale:1,format:'png'});
 await fs.writeFile(dir+'/'+file,new Uint8Array(await img.arrayBuffer()));
}
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!',options:{useRegex:true,maxResults:20},summary:'Formula error scan'})).ndjson);
const result=await SpreadsheetFile.exportXlsx(wb);
await result.save(dir+'/AppSheet_Data_Dictionary.xlsx');
console.log(JSON.stringify({addedColumnRows:rows.length,newSheet:'Payments Clone',checkpoint:'1.000065'}));
