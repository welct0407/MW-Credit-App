import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/r002-20260916';
const config=JSON.parse(await fs.readFile(out+'/app-configuration.json','utf8'));
const refinement=JSON.parse(await fs.readFile(out+'/refinement-verification.json','utf8'));
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([n,r])=>[n,{head:r[0],rows:r.length}]))));
 const linkReview=process.argv.includes('--review-link'),review=process.argv.includes('--review-refinement')||linkReview;
 const row=before['Dev Differences'].findIndex(r=>linkReview?r[1]==='Borrowers.Open Borrower from Collection':r[1]==='Loans.Principal Amount'&&r[2]==='Display name')+1;
 const png=await wb.render({sheetName:'Dev Differences',range:review?`A${row}:E${row+(linkReview?1:3)}`:'A1:E4',scale:1,format:'png'});
 await fs.writeFile(out+(linkReview?'/dictionary-collection-link.png':review?'/dictionary-refinement.png':'/dictionary-before.png'),new Uint8Array(await png.arrayBuffer()));process.exit(0);
}
const sh=wb.worksheets.getItem('Dev Differences'),old=before['Dev Differences'];
const additions=[];
for(const app of ['OLTP','OLAP']){
 additions.push([app,'R002 / saved version','Reconciliation','R001 unchanged',app==='OLTP'?`Dev ${config.oltpVersion}; rollback 1.000088`:`Dev ${config.olapVersion}; rollback 1.000090`]);
 additions.push([app,'Loans.View Ref (Ref Borrowers)','Navigation','Hidden; attached to Ref Borrowers','Inline; attached to Borrower Name TE. Existing Ref target and nonblank condition preserved.']);
 for(const [table,name]of [['Charges','Open Borrower from Charge'],['Repayments','Open Borrower from Repayment']])
 additions.push([app,table+'.'+name,'Navigation','Absent','Inline on Borrower Name TE; LINKTOROW([Ref Loans].[Ref Borrowers], "Borrowers_Detail"); ISNOTBLANK([Ref Loans].[Ref Borrowers]); display: เปิดข้อมูลผู้กู้ / Open Borrower']);
 additions.push([app,'Borrowers.Row ID / Borrower Name TE','Key / label','Stable Row ID key; TE label','Preserved. Existing borrower column/Ref definitions unchanged. Loans, Charges and Repayments navigation verified in current GUI.']);
 additions.push([app,'Repayments_Detail','Column order','Existing manual order','Existing columns preserved; Borrower Name TE appended so inline action is visible.']);
}
additions.push(['SQL DEV','Loans / R002 V17','Insert safeguard','Absent','Gross new principal > 0 and <= signed contributed capital minus outstanding principal. Excludes retained profit; includes all dates/borrowers. Enforced at database insert/sync.']);
additions.push(['SQL DEV','Loans / Repayments / Cash Pool Contributions','Concurrency','Existing transaction locks','BEFORE STATEMENT aa_cashpool_lock uses advisory try-lock (9162026,2). Busy writes fail for retry. ab_new_loan_cashpool_guard on Loans BEFORE INSERT; READ COMMITTED required. No business schema columns added.']);
additions.push(['SQL DEV','R002 limits','Scope','No cashpool guard','Existing loan edits and capital withdrawals can cause deficit; subsequent new loans blocked. Gross principal checked before first-day netoff. OLTP form warning/hint verified; persisted GUI loan, mobile/offline and owner acceptance pending.']);
additions.push(['OLAP','Charges_Detail','Column order','Plain Borrower Name','Borrower Name removed from this view only; Borrower Name TE appended. Other columns unchanged.']);
additions.push(['OLTP','Loans.Principal Amount','Valid_If','Positive amount and daily installment whole-baht rule',config.principalValidIf]);
additions.push(['OLTP','Loans.Principal Amount','Invalid value error','Positive amount message',config.principalInvalidError]);
additions.push(['OLTP','Loans.Principal Amount','Description','Blank',config.principalDescription]);
additions.push(['OLTP','Loans.Principal Amount','Display name','เงินต้น / Principal Amount',refinement.principalDisplayName]);
additions.push(['OLTP','Borrowers.Borrower Name - Collection','Virtual column','Text VC replica of Borrower Name TE','Removed in Dev OLTP 1.000103 after Collection replacement verification. Row ID key and Borrower Name TE label/formula preserved.']);
for(const [name,change] of Object.entries(refinement.sliceChanges)) additions.push(['OLTP',name,'Slice columns','R002 initial configuration',change]);
for(const [name,change] of Object.entries(refinement.viewChanges)) additions.push(['OLTP',name,'Collection display','Borrower Name - Collection',change]);
for(const [status,color] of Object.entries(refinement.statusColors)) {
 additions.push(['OLTP','Borrower Name Collection - '+status,'Format rule','Todays Amount Remaining and Borrower Name - Collection',`Todays Amount Remaining only; [Daily Collection Status] = "${status}"; ${color}; all original style attributes retained.`]);
 additions.push(['OLTP','Collection Borrower TE - '+status,'Format rule','Absent',`Borrower Name TE only; AND(IN(CONTEXT("View"), LIST("Collection", "Todays Collection Board_Detail")), [Daily Collection Status] = "${status}"); ${color}; text size 1; no icon/bold/italic/underline/strike/uppercase.`]);
}
additions.push(['OLTP','Borrower with outstanding loans','Format rule','[Total Outstanding Principal] > 0',refinement.formatRules.outstanding+'; targets Borrower Name and Borrower Name TE; pink style preserved.']);
additions.push(['OLTP','R002 / Collection refinement','Reconciliation','Rollback OLTP 1.000098; OLAP 1.000096','OLTP 1.000106; no editor issues. Red/purple list and red detail colors, direct borrower viewer navigation and pink outside Collection verified. Green/orange have no visible fixtures; saved rules verified. OLAP unchanged. Owner acceptance pending.']);
additions.push(['OLTP','Borrowers.Open Borrower from Collection','Navigation','Absent','Inline on Borrower Name TE; LINKTOROW([Row ID], "Borrowers_Detail"); condition IN(CONTEXT("View"), LIST("Collection", "Todays Collection Board_Detail")); display เปิดข้อมูลผู้กู้ / Open Borrower; address-book icon. Navigation only; no confirmation or data modification.']);
additions.push(['OLTP','Collection','Navigation','Row Selected auto; action bar Receive All Charges','Row Selected Open Borrower from Collection; action bar retains Receive All Charges and adds Open Borrower from Collection. Name tap opens full Borrowers_Detail (desktop and current mobile preview verified); viewer button also verified for matching borrower.']);
additions.push(['OLTP','Loan Form Context','Table / source','Absent','V18 SQL view; database-3; READ_ONLY; one row cashpool. No filter, menu or editing workflow. Base contribution ledger is not imported.']);
for(const [name,type,rule]of [
 ['Row ID','Text / key','Constant cashpool; immutable; no initial/App formula'],
 ['Contributed Capital','Price / THB / 2 decimals','Signed contributions, all dates; Contribution adds, other types subtract'],
 ['Outstanding Principal','Price / THB / 2 decimals','All Loans principal minus principal paid in linked Repayments; canonical ledger'],
 ['Available Cashpool','Price / THB / 2 decimals','Contributed Capital - Outstanding Principal; retained profit excluded; deficits retained'],
 ['Partner A Profit Share','Percent / 2 decimals','Current all-date role A signed capital / total; 0 if total <= 0'],
 ['Partner B Profit Share','Percent / 2 decimals','Current all-date role B signed capital / total; 0 if total <= 0']])
 additions.push(['OLTP','Loan Form Context.'+name,'Definition','Absent',type+'; read-only; SQL-owned. '+rule]);
additions.push(['SQL DEV','Loan Form Context','Metric contract','Absent','One aggregate row, no base-table writes. Current ratios are informational and do not replace historical repayment/expense shares. App values refresh on sync; V17 guards concurrent or stale submissions.']);
const updated=structuredClone(old),changed=[];
for(let i=0;i<additions.length;i++){
 let ix=updated.findIndex(r=>r[0]===additions[i][0]&&r[1]===additions[i][1]&&r[2]===additions[i][2]);
 if(ix<0)ix=updated.length;
 updated[ix]=additions[i];changed.push(ix+1);
 const r=sh.getRangeByIndexes(ix,0,1,5);
 if(ix>=old.length)r.copyFrom(sh.getRangeByIndexes(old.length-1,0,1,5),'all');r.values=[additions[i]];
 r.format.wrapText=true;r.format.verticalAlignment='top';r.format.rowHeight=150;
}
wb.recalculate();
const expected={...before,'Dev Differences':updated};
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'R002 dictionary error scan'});
await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
const first=updated.findIndex(r=>r[0]==='OLTP'&&r[1]==='Loans.Principal Amount'&&r[2]==='Valid_If')+1;
const png=await wb.render({sheetName:'Dev Differences',range:`A${first}:E${first+3}`,scale:1,format:'png'});
await fs.writeFile(out+'/dictionary-after.png',new Uint8Array(await png.arrayBuffer()));
const stage=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(stage));
const norm=rows=>{const r=rows.map(x=>x.map(v=>v??''));while(r.length&&r.at(-1).every(v=>v===''))r.pop();return r;};
for(const s of check.worksheets.items)if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(expected[s.name])))throw Error('Unexpected dictionary difference '+s.name);
await fs.copyFile(stage,file);await fs.unlink(stage);await fs.unlink(stage+'.inspect.ndjson').catch(()=>{});
await fs.writeFile(out+'/dictionary-verification.json',JSON.stringify({allSheetsRoundtrip:true,changedSheet:'Dev Differences',addedRows:updated.length-old.length,changedRows:changed},null,2));
console.log('R002 dictionary updated; all sheets roundtrip verified');
