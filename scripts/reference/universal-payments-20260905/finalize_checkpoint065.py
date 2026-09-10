from pathlib import Path
import json
root=Path('C:/GitHub/AppSheet-Loan-Project')
out=root/'outputs/universal-payments-20260905'
j=json.loads((out/'configuration_checkpoint_after052.json').read_text(encoding='utf-8'))
j['version']='1.000065; confirmed Manage > Versions > Version History on 2026-09-06'
j['cascade_status']='Completed after sync; initial intermediate observation was premature, no cascade configuration fix required'
(out/'configuration_checkpoint_after052.json').write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
visible=['_RowNumber','Row ID','Borrower Name','Telephone','Description','Creation Date','Hidden Flag','Related Loans','Total Interest Earned','Total Amount Loaned','Total Number of Loans','Total Outstanding Principal','Header - Active Loans','Borrower Name TE','Return on Active Principal','Active Loan Interest Earned','Active Daily Interest','Projected Interest Coverage Date','Closed Loan Interest Earned','Closed Loan Principle','Has Closed Loan','Return on Closed Loans','Header - Closed Loans','Has Active Loan','Daily Collection Status','Todays Collection Charges','Todays Amount Due','Todays Amount Collected','Todays Amount Remaining','Daily Collection Status - Order','Borrower Name - Collection','Active Profit After Principal Coverage','Related Payments']
collection=['_RowNumber','Row ID','Borrower Name','Description','Daily Collection Status - Order','Todays Amount Due','Todays Amount Collected','Todays Amount Remaining','Todays Collection Charges','Borrower Name - Collection','Hidden Flag','Related Payments']
slices=[{'name':'Visible Borrowers','source':'Borrowers','filter':'NOT([Hidden Flag])','updates':'Adds, Updates, Deletes','actions':'Auto assign','columns':visible},{'name':'Todays Collection Board','source':'Borrowers','filter':'ISNOTBLANK([Daily Collection Status])','updates':'Read-only','actions':'Auto assign','columns':collection}]
(out/'clone_slices_checkpoint065.json').write_text(json.dumps(slices,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=out/'update_dictionary.mjs'
s=p.read_text(encoding='utf-8').replace('1.000052','1.000065').replace('53 inspected','54 inspected').replace('53 definitions','54 definitions')
anchor="clone.getRange('A1:H8').copyFrom"
idx=s.index(anchor)
s=s[:idx]+'''const later=JSON.parse(await fs.readFile(dir+'/configuration_checkpoint_after052.json','utf8'));
add('Charges',5,'Interest Due','Physical / Price','Existing; required; initial 0','Retain zero-allocation snapshot charges during default','Valid If: '+later.interest_due_valid_after+'. Earlier rule: '+later.interest_due_valid_before+'. Narrow zero/zero exception; signed default-loss interest remains supported.');

'''+s[idx:]
s=s.replace("clone.getRange('A21:H21').format.rowHeight=115;","clone.getRange('A21:H21').format.rowHeight=115;\nclone.getRange('A58:H58').format.rowHeight=110;")
s=s.replace('Existing Borrower > Loan > Charge > Repayment cascade is retained and still requires clone deletion regression testing.','Existing Borrower > Loan > Charge > Repayment cascade retained. Disposable Borrower B deletion completed across both branches after sync. Initial checks during sync were premature; see T034 correction.')
s=s.replace('Borrower cascade, broader regressions, offline/multi-user and acceptance remain pending.','Borrower cascade, cross-date ordering, uneven final installment and default fixtures passed after completed sync/fixes. Broader regressions, offline/multi-user and acceptance remain pending.')
s=s.replace('Three reverse-reference VCs reconciled on Borrowers/Charges. Production counts exclude these clone changes.','Three reverse-reference VCs reconciled on Borrowers/Charges; one changed Interest Due validation. Two borrower slices automatically include Related Payments; exact membership is on Payments Clone Slices. Production counts exclude clone changes.')
s=s.replace("['Cascade branch'", "['Default behavior','Referenced snapshot charges are written off in place rather than deleted. Zero/zero Interest Due validation exception requires only zero Posted allocations and no actual paid amount. Default root blocks Processing/Error receipts. The group is not atomic: an initial validation failure partially committed; corrected fresh retest passed.'],\n ['Cascade branch'")
s=s.replace('final verification remains pending.','receipt/default/cascade checks are recorded in the execution report; manual acceptance remains pending.')
s=s.replace("['Payments Clone','A42:H48','dictionary-allocation-after.png']","['Payments Clone','A42:H48','dictionary-allocation-after.png'],['Payments Clone','A55:H58','dictionary-default-after.png']")
anchor="const readme=wb.worksheets.getItem('README');"
idx=s.index(anchor)
s=s[:idx]+'''const sliceInventory=JSON.parse(await fs.readFile(dir+'/clone_slices_checkpoint065.json','utf8'));
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
'''+s[idx:]
p.write_text(s,encoding='utf-8')
p=out/'verify_dictionary.py';s=p.read_text(encoding='utf-8').replace('max_row=57','max_row=58').replace('len(defs)==53','len(defs)==54').replace("'Charges':2","'Charges':3").replace('53 definitions','54 definitions')
s+='''\nimport json\nexpected=json.loads((root/'clone_slices_checkpoint065.json').read_text(encoding='utf-8'))\nactual=[tuple(c.value for c in row) for row in b['Payments Clone Slices'].iter_rows(min_row=5,max_row=49,max_col=7)]\nwanted=[(x['name'],x['source'],i+1,c,x['filter'],x['updates'],x['actions']) for x in expected for i,c in enumerate(x['columns'])]\nassert actual==wanted\nassert len(actual)==45\nprint('Both clone slices verified: Visible Borrowers33; Todays Collection Board12; production slice inventory preserved.')\n'''
p.write_text(s,encoding='utf-8')
p=root/'Documents/AppSheet_Data_Model_Overview.md';s=p.read_text(encoding='utf-8').replace('v1.000052','v1.000065').replace('records 53 inspected','records 54 inspected')
s=s.replace('the actual cascade still requires regression testing.','the disposable Borrower B cascade completed across both branches after sync (T034). A check during sync briefly showed the receipts and allocations before their queued deletion finished.')
s=s.replace('final read-back of those restorations is pending.','Close Date and Due Date blank initial values were read back at v1.000065. The clone-only Interest Due validation exception described below is the 54th definition.')
s=s.replace('the slice definition was not changed.','the slice was not manually edited; its automatic Related Payments membership is documented below.')
s=s.replace('with Trigger other bots false on the receipt bot.','with Trigger other bots and Wait for execution to complete true on the receipt bot. All three external notification bots remain disabled.')
s=s.replace('Existing default/write-off actions and source financial formulas remain unchanged.','Default writeoff now retains charges referenced by allocation snapshots; unreferenced unpaid charges retain the prior deletion path. Direct Loan/Charge Delete actions are hidden when allocations reference them; full borrower cascade remains supported. The default entry action additionally blocks Processing/Error receipts for that borrower. Source financial rollup formulas remain unchanged.')
insert='''
**Default validation:** Charges Interest Due allows a zero/zero written-off charge only when Total Paid is zero, at least one allocation references it, and every allocation has Allocated Amount0 and a Posted parent receipt. The exact expression is in the dictionary and APP-047. An initial default test exposed partial group commits after validation failure; the repaired fixture and a fresh end-to-end zero-allocation default are separately documented. Groups are not treated as database transactions.

**Clone slices:** Visible Borrowers retains source Borrowers, filter `NOT([Hidden Flag])`, all CRUD and Auto assign actions; Related Payments is appended at position33 (previous32 columns). Todays Collection Board retains source Borrowers, filter `ISNOTBLANK([Daily Collection Status])`, read-only mode and Auto assign actions; Related Payments is appended at position12 (previous11). These automatic membership changes are inventoried in the workbook's `Payments Clone Slices` sheet, with all45 positions. No production slice was changed.

**Notification draft:** The disabled Notification - Charge Received bot now listens to a Payments update becoming Posted. Its body aggregates principal/interest across that receipt's Repayments and links to Payments_Detail. Recipients/title are retained. No messages or delivery tests were sent. The clone remains undeployed; the editor's sole warning is that scheduled Daily 00:05 requires deployment.

**Test data and limits:** Four empty starter records from each new table were deleted. Fourteen synthetic receipts and22 allocations remain as evidence, including the initially wrong LS25 result. Borrower B and its owned records were removed by the app cascade; unused diagnostic borrower C was also deleted. Fresh first-day, same/cross-date lump splits, Cash partial, Receive All, early future-charge payments, loan close, final-installment rounding, pending-receipt rejection/retry and default cases have bounded recorded results. Offline/simultaneous use, partial multi-allocation fault injection, scheduled execution, access roles and broad Statistics/downstream reconciliation still require coverage; user acceptance remains pending.

'''
s=s.replace('**Rollback:** Clone app v1.000002',insert+'**Rollback:** Clone app v1.000002',1)
p.write_text(s,encoding='utf-8')
p=root/'Change Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_CLONE_2026-09-05.md';s=p.read_text(encoding='utf-8')
start=s.index('In progress, last updated');end=s.index('\n\n## Scope',start)
s=s[:start]+'Implementation and bounded regression testing are recorded through clone **v1.000065**, confirmed in Manage > Versions on 6 September 2026. Core payment/default scenarios and borrower cascade have completed results; manual acceptance, offline/concurrent use, scheduled execution and the remaining coverage matrix are pending. The clone is undeployed; production, OLAP and Looker Studio were not changed. This is not a full-testing or production-acceptance claim.'+s[end:]
s+='''

## Checkpoint v1.000065 — completed sync correction and cleanup

**Correction to TEST-009/T034:** The earlier FAILED label was premature: it described an intermediate state while the app was still sending cascade deletions. On a later server refresh both B receipts disappeared; native PA inspection found none of the three B allocations and retained A's zero snapshots. No cascade-expression or IsPartOf fix was needed. Native Borrowers contains A but neither B nor C; B's three repayments were absent and native Repayments count fell448→445; B charge keys were absent while A7's original and loss charges remained. The completed borrower cascade passed for this fixture. Exact completion latency was not measured. Wait for sync to finish before assessing a cascade or reconciling its intermediate counts.

- **TEST-010 — disposable diagnostic C:** created `gRyrH04bEKmrPeF3e3HbIT`, name ZZ_TEST_PAY_C_CASCADE_20260906, blank phone, diagnostic description. No receipt was reparented and no loan created: the original B cascade completed before intervention. Deleted C through normal app Delete/confirmation; native Borrowers read-back confirms absence.
- **DATA-001 — new-table starter cleanup:** selected the first four fully blank rows in Payment Allocations and Payments separately using the native database grid, opened Delete rows, verified each confirmation said Delete4rows, then confirmed. Each row had no business values or references. No schema settings changed. After reload native Payments has14 nonblank keyed synthetic rows; Payment Allocations22. First row in each table is the retained A1 fixture. The four known blank receipt keys were I5SzcIBTYn4ae5lTx-6WU4,4kmOsBTl614Ea8aqqU99Y5,9VinG0sSq54giSqrLQdFF5,08Ze7vHxJW4PMVBVGjoKua. Blank allocation keys were not exposed in the grid; exact scoped cleanup was four first rows with no values, before the first A1 allocation. Native Undo is the immediate grid recovery mechanism; these unlinked empty rows are not production migration data.
- **SLICE-001 — automatic schema consequence, reconciled:** Visible Borrowers includes Related Payments at position33; Todays Collection Board includes it at position12. Source/filter/permissions and existing column order retained. No manual slice mutation was made. Prior notes saying the slice definition was not changed mean no manual edit; the automatic appended membership is a model change and is now explicitly inventoried in both model documents. Exact45 membership rows are in clone_slices_checkpoint065.json and Payments Clone Slices.
- **VERIFY-001 — Manage > Versions:** Editing LoanMgr Payments TEST 20260905 version1.000065 confirmed. Save disabled. Errors & Warnings contains only Scheduled event Daily00:05 is only triggered when app is in deployed state. No configuration errors shown. The clone remains undeployed. Loans Close Date and Due Date grid initial values both blank, confirming restoration after regeneration.
- **DOC-009 — model/test documentation:** update overview, workbook builder/verifier, separate clone slice inventory, post-052 exact expression JSON and execution report. Preserve all eight production-baseline workbook sheets; clone appendix contains54 column definitions plus45 slice-membership rows. Workbook export/render/preservation verification is recorded when completed.

Rollback remains clone app v1.000002. For a clean data/schema reset, make a fresh isolated source copy and verify all Source Id values; restoring an app version does not restore deleted data or undo physical columns. Do not use clone fixture keys, temporary overrides, failed-test rows, blank cleanup, or disabled-notification isolation settings as production migration operations.
'''
p.write_text(s,encoding='utf-8')
p=out/'functional-test-results.md';s=p.read_text(encoding='utf-8')
s+='''

## Completed-sync correction (v1.000065)

**T034 final result: PASS for the disposable B fixture.** The earlier FAIL was an observation during sync, before all cascade deletions finished. Later server refresh shows zero B receipts; native PA table contains none of B's three allocation keys and retains A's zero snapshots. Native Borrowers contains A and neither B nor unused diagnostic C; three B repayments removed (448→445); B charge keys absent while A7's original/loss charges remain. No cascade fix or reparenting was performed. Precise elapsed sync latency was not measured. Inspect completed sync, not a partially applied cross-table state.

**T035 Empty-starter cleanup:** native Delete4rows confirmations applied separately to the four wholly blank first rows of each new table. Reload shows14 retained receipts and22 retained allocations, first records are the original A1 fixtures. No business-valued row selected. Unused diagnostic C was created and deleted without children. Pass.

**T036 Editor validation/default restoration:** v1.000065 confirmed in Manage. Only warning is the undeployed Daily00:05 scheduled event. Close Date/Due Date initial values read back blank. No configuration errors displayed. Scheduled invocation and notification delivery remain untested.

This correction supersedes the earlier open-cascade and blank-cleanup statements. Other remaining coverage is still pending; user acceptance has not been recorded.
'''
p.write_text(s,encoding='utf-8')
print('Prepared v065 model, slice and test documentation; workbook export/verification next.')
