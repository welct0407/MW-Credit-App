import {bulkReadClient} from './offline-dataset.mjs';
import {readTraversalCursor,encodeTraversalCursor} from '../api/offline-dataset-cursor.mjs';
import {readBorrowerRecord,validBorrowerId} from './borrowers.mjs';
import {readLoanRecord} from './loans.mjs';
import {readChargeRecord} from './charges.mjs';
import {readPaymentRecord} from './payments.mjs';
import {readExpenseRecord,readExpenseOptions} from './expenses.mjs';
import {readLoanRelated} from './loan-related.mjs';
import {readOwnerPaymentDraft} from '../payment-command/draft.mjs';
import {readRecordList} from './record-lists.mjs';
import {readDashboard} from './dashboard.mjs';
import {readCashOverview,readCashStatement} from './cash.mjs';
import {readPreferences} from './preferences.mjs';
import {readManagement} from './management.mjs';
import {readManagementFinancial} from './management-financial.mjs';
import {readManagementAssessments} from './management-assessments.mjs';
import {readManagementAnalytics,readAnalyticsOverview,readAnalyticsChart} from './management-analytics.mjs';
import {readManagementPosition} from './management-position.mjs';
import {readManagementOpenings} from './management-openings.mjs';
import {readCollection,decodeCollectionCursor,collectionCte,collectionQualitySql,projectCollectionCharge} from '../api/collection-read-contract.mjs';
import {projectUpcomingEvent,validUpcomingDate} from '../api/upcoming-read-contract.mjs';
import {readStandaloneUpcoming} from './upcoming.mjs';
import {loanColumns,projectLoan} from '../api/loan-read-contract.mjs';

const append=(key,value,path)=>({key,mode:'append',value,...(path?{path}:{})});
const replace=(key,value,path)=>({key,mode:'replace',value,...(path?{path}:{})});
const _merge=(key,value,path)=>({key,mode:'merge',value,...(path?{path}:{})});
const result=(patches,state=null)=>({patches,state});
const one=(key,read)=>async(c,a,stamp)=>result([replace(key,await read(c,a,stamp))]);
const text=value=>value===null||value===undefined?null:typeof value==='string'&&value.length<=8192?value:(()=>{throw Error('invalid_request')})();
const object=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))throw Error('invalid_request');return value};
const page=(key,read,path)=>async(c,a,stamp,state)=>{const value=await read(c,text(state),a,stamp);if(value.collectionError)throw Error(value.collectionError);return result([append(key,value.items,path)],value.nextCursor??null)};

// R064 Phase 1 packing: larger deterministic pages reduce HTTP round trips; the
// byte boundary between pages still bounds each response.
async function idRows(c,table,after,limit=64){if(after!==null&&after!==undefined&&!validBorrowerId(after))throw Error('invalid_request');return(await c.query(`SELECT "Row ID" id FROM public."${table}" WHERE ($1::text IS NULL OR "Row ID" COLLATE "C">$1 COLLATE "C") ORDER BY "Row ID" COLLATE "C" LIMIT $2`,[after??null,limit+1])).rows;}
function details(key,table,read,limit=64){return async(c,_a,stamp,state)=>{
 const rows=await idRows(c,table,text(state),limit),batch=bulkReadClient(c),values=await Promise.all(rows.slice(0,limit).map(row=>read(batch,row.id)));
 // Orphaned legacy records may be absent from the owning joined detail read.
 // Retain its unavailable result without poisoning unrelated source records.
 const items=values.filter(Boolean).map(item=>({...item,...stamp,...(key==='payments'?{receiptReference:item.receiptReference?'attached':null}:{})}));
 return result([append(key,items)],rows.length>limit?rows[limit-1].id:null);
 }}
/** Up to `perPage` parents, each with one existing API page, per request; never
 * drain a relation. A parent whose page continues keeps the page to itself. */
function parents(table,read,perPage=8){return async(c,a,stamp,input)=>{
 let state=input??{after:null,current:null,cursor:null};if(!state||typeof state!=='object'||Array.isArray(state)||Object.keys(state).some(key=>!['after','current','cursor'].includes(key)))throw Error('invalid_request');
 if(state.current!==null&&!validBorrowerId(state.current))throw Error('invalid_request');
 const patches=[];let count=0;
 while(count<perPage){
  const ids=state.current?[state.current]:(await idRows(c,table,text(state.after),perPage-count)).slice(0,perPage-count).map(row=>row.id);
  if(!ids.length)return result(patches);
  for(const id of ids){
   const value=await read(c,id,text(state.cursor),a,stamp);patches.push(...value.patches);count++;
   if(value.cursor)return result(patches,{after:state.after,current:id,cursor:value.cursor});
   state={after:id,current:null,cursor:null};
  }
 }
 return result(patches,state);
 }}
const relation=kind=>parents('Loans',async(c,id,cursor)=>{const value=await readLoanRelated(c,id,kind,{limit:100,cursor});return {patches:[append('loanRelated',value?.items??[],[id,kind])],cursor:value?.nextCursor}});
const draft=scope=>parents('Borrowers',async(c,id,cursor,_a,_stamp)=>{
 let value;try{value=await readOwnerPaymentDraft(c,id,{scope,limit:100,cursor})}catch(error){if(error.message!=='Draft unavailable')throw error;value={draftError:'source_unavailable',status:503}}
 if(value.draftError)return {patches:[replace('paymentDrafts',value,[id,scope])]};
 const {charges,nextCursor,...metadata}=value;
 return {patches:[...(cursor?[]:[replace('paymentDrafts',{...metadata,charges:[],nextCursor:null},[id,scope])]),append('paymentDrafts',charges,[id,scope,'charges'])],cursor:nextCursor};
});

const borrowerListColumns=`"Row ID" id,"Borrower Name" name,coalesce("Borrower Name",'')||' - '||coalesce("Description",'') AS "borrowerDisplayName","Description" description,"Total Interest Earned"::text AS "totalProfitEarned","Creation Date"::text AS "createdDate","Has Active Loan" AS "hasActiveLoan","Total Outstanding Principal"::text AS "outstandingPrincipal","Borrower Note" note`;
const paymentMonthGroups=filter=>`SELECT "Ref Borrower" AS "borrowerId",to_char("Payment Date",'YYYY-MM') AS month,sum("Amount Received")::numeric::text AS "amountReceived",count(*)::integer AS count FROM public."Payments"${filter} GROUP BY "Ref Borrower",to_char("Payment Date",'YYYY-MM')`;
const paymentHistorySelect=`SELECT p."Ref Borrower" AS "borrowerId",(SELECT j.request_id::text FROM public.pwa_payment_commands j WHERE j.payment_id=p."Row ID" AND j.actor_issuer=$1 AND j.actor_subject=$2 AND j.actor_partner_id=$3 LIMIT 1) AS "requestId",p."Row ID" id,p."Status" status,p."Payment Date"::text AS "paymentDate",p."Amount Received"::numeric::text AS "amountReceived",p."Posted Amount"::text AS "postedAmount",p."Notes" notes,CASE WHEN nullif(btrim(p."Uploaded Receipt"),'') IS NULL THEN NULL ELSE 'attached' END AS "receiptReference",p."Uploaded Receipt At"::text AS "receiptAt",a."Account Label" AS "accountLabel" FROM public."Payments" p LEFT JOIN public."Cash Accounts" a ON a."Row ID"=p."Ref Received By Cash Account"`;
const recordPhases=[
 details('borrowers','Borrowers',readBorrowerRecord),details('loans','Loans',readLoanRecord),details('charges','Charges',readChargeRecord),details('payments','Payments',readPaymentRecord,32),details('expenses','Business Expenses',readExpenseRecord),
 async(c,_a,_stamp,state)=>{const rows=(await c.query(`SELECT ${borrowerListColumns} FROM public."Borrowers" WHERE "Hidden Flag" IS NOT TRUE AND ($1::text IS NULL OR "Row ID" COLLATE "C">$1 COLLATE "C") ORDER BY "Row ID" COLLATE "C" LIMIT 129`,[text(state)])).rows;return result([append('borrowerList',rows.slice(0,128))],rows.length>128?rows[127].id:null)},
 async(c,_a,_stamp,state)=>{const rows=(await c.query(`SELECT ${loanColumns} FROM public."Loans" l JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" WHERE b."Hidden Flag" IS NOT TRUE AND ($1::text IS NULL OR l."Row ID" COLLATE "C">$1 COLLATE "C") ORDER BY l."Row ID" COLLATE "C" LIMIT 129`,[text(state)])).rows;return result([append('borrowerLoans',rows.slice(0,128).map(row=>projectLoan(row,row.borrowerId)))],rows.length>128?rows[127].id:null)},
 page('loanList',(c,cursor)=>readRecordList(c,'loans',{limit:100,cursor})),relation('charges'),relation('payments'),draft('due'),draft('future'),draft('all'),
 async(c,_a,_stamp,state)=>{const after=state??{borrower:'',month:''};if(typeof after.borrower!=='string'||typeof after.month!=='string')throw Error('invalid_request');const rows=(await c.query(`WITH groups AS (${paymentMonthGroups('')}) SELECT * FROM groups WHERE ($3::boolean OR (coalesce("borrowerId",'') COLLATE "C",coalesce(month,'') COLLATE "C")>($1 COLLATE "C",$2 COLLATE "C")) ORDER BY coalesce("borrowerId",'') COLLATE "C",coalesce(month,'') COLLATE "C" LIMIT 129`,[after.borrower,after.month,state===null])).rows;return result([append('paymentMonths',rows.slice(0,128))],rows.length>128?{borrower:rows[127].borrowerId??'',month:rows[127].month??''}:null)},
 async(c,a,_stamp,state)=>{const rows=(await c.query(`${paymentHistorySelect} WHERE ($4::text IS NULL OR p."Row ID" COLLATE "C">$4 COLLATE "C") ORDER BY p."Row ID" COLLATE "C" LIMIT 129`,[a.issuer,a.subject,a.partnerId,text(state)])).rows;return result([append('paymentHistory',rows.slice(0,128))],rows.length>128?rows[127].id:null)},
 async(c,_a,stamp)=>{const accounts=(await c.query(`SELECT a."Row ID" id,a."Account Label" label,a."Default Account" AS "isDefault",a."Ref Cash Holder" AS "holderId",a."Active" active,h."Active" AS "holderActive" FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE AND h."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`)).rows;return result([replace('borrowerOptions',{referrers:[],accounts:accounts.map(({id,label})=>({id,label}))}),replace('loanOptions',{accounts:accounts.filter(row=>row.holderId==='ch:lisa'),businessDate:stamp.businessDate})])},
 async(c,_a,_stamp,state)=>{const rows=(await c.query(`SELECT "Row ID" id,"Borrower Name" label,"Description" description FROM public."Borrowers" WHERE ($1::text IS NULL OR "Row ID" COLLATE "C">$1 COLLATE "C") ORDER BY "Row ID" COLLATE "C" LIMIT 129`,[text(state)])).rows;return result([append('borrowerOptions',rows.slice(0,128),['referrers'])],rows.length>128?rows[127].id:null)},
 one('expenseOptions',readExpenseOptions),one('dashboard',readDashboard)
];

async function upcomingDetail(c,_a,stamp,state){
 // The provider simulates schedules in a materialized CTE. Scan it once per
 // event page, rather than once for every borrower/date in the summary.
 const rows=(await c.query(`SELECT e."Row ID" id,e."Ref Borrower" AS "borrowerId",e."Due Date"::text AS "dueDate",e."Ref Loan" AS "loanId",l."Loan Date"::text AS "loanDate",l."Loan Type" AS "loanType",l."Principal Amount"::numeric::text AS "loanPrincipal",e."Principal Remaining"::text AS principal,e."Interest Remaining"::text AS interest,e."Amount Remaining"::text AS amount,e."Basis" AS basis FROM public.oltp_upcoming_charge_events_v1 e JOIN public."Loans" l ON l."Row ID"=e."Ref Loan" AND l."Ref Borrowers"=e."Ref Borrower" WHERE e."As Of Date"=$1::date AND e."Due Date">$1::date AND e."Due Date"<=$1::date+7 AND ($2::text IS NULL OR e."Row ID" COLLATE "C">$2 COLLATE "C") ORDER BY e."Row ID" COLLATE "C" LIMIT 129`,[stamp.businessDate,text(state)])).rows;
 const groups=new Map();for(const {borrowerId,dueDate,...item} of rows.slice(0,128)){
  if(!['Recorded','Recorded settlement','Recorded - review status','Projected'].includes(item.basis)||![item.principal,item.interest,item.amount].every(value=>value===null||typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value)))throw Error('source_unavailable');
  const key=JSON.stringify([borrowerId,dueDate]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
 }
 return result([...groups].map(([key,items])=>append('upcomingDetailsByKey',items,[key,'items'])),rows.length>128?rows[127].id:null);
}
// Materialize each existing authoritative provider once per page. Calling the
// borrower reader repeatedly makes its correlated views simulate all loans for
// every borrower, despite the final result being restricted to one borrower.
const borrowerUpcomingCte=`${collectionCte}, forecast_events AS MATERIALIZED (
 SELECT * FROM public.oltp_upcoming_charge_events_v1 WHERE "As Of Date"=$1::date AND "Borrower Due Date Rank" BETWEEN 1 AND 5 AND "Due Date">$1::date AND "Due Date"<=LEAST(($1::date+interval '3 months')::date,$1::date+93)
), forecast_coverage AS MATERIALIZED (SELECT * FROM public.oltp_upcoming_charge_coverage_v1), forecast_dates AS MATERIALIZED (
 SELECT s."Ref Borrower" AS "borrowerId",s."Row ID" id,s."Due Date"::text AS "dueDate",s."Total Charge"::text AS "totalCharge" FROM public.oltp_upcoming_charge_summary_v2 s WHERE s."As Of Date"=$1::date
), upcoming_context AS MATERIALIZED (
 SELECT parent_b."Row ID" id,parent_b."Hidden Flag" IS NOT TRUE AS directory,EXISTS(SELECT 1 FROM summaries WHERE summaries.id=parent_b."Row ID") AS collection,
 cov."As Of Date"::text AS "sourceDate",cov."Horizon End"::text AS "horizonEnd",cov."Review Loans" AS "reviewLoans",LEAST(($1::date+interval '3 months')::date,$1::date+93)::text AS "expectedHorizonEnd",
 (${collectionQualitySql.replaceAll('$1','parent_b."Row ID"')}) OR EXISTS(SELECT 1 FROM forecast_events e WHERE e."Ref Borrower"=parent_b."Row ID" AND (e."Basis" IS NULL OR e."Basis" NOT IN ('Recorded','Recorded settlement','Recorded - review status','Projected') OR NOT EXISTS(SELECT 1 FROM public."Loans" l WHERE l."Row ID"=e."Ref Loan" AND l."Ref Borrowers"=parent_b."Row ID"))) AS invalid,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'dueDate',d."dueDate",'totalCharge',d."totalCharge") ORDER BY d."dueDate") FROM forecast_dates d WHERE d."borrowerId"=parent_b."Row ID" AND EXISTS(SELECT 1 FROM forecast_events e WHERE e."Ref Borrower"=parent_b."Row ID" AND e."Due Date"=d."dueDate"::date)),'[]'::jsonb) AS dates
 FROM public."Borrowers" parent_b LEFT JOIN forecast_coverage cov ON cov."Ref Borrower"=parent_b."Row ID" WHERE parent_b."Hidden Flag" IS NOT TRUE OR EXISTS(SELECT 1 FROM summaries WHERE summaries.id=parent_b."Row ID")
)`;
const upcomingContextError=(row,stamp)=>row.invalid||!validUpcomingDate(row.sourceDate)||!validUpcomingDate(row.horizonEnd)||row.horizonEnd!==row.expectedHorizonEnd||!Number.isInteger(row.reviewLoans)||row.reviewLoans<0||!Array.isArray(row.dates)||row.dates.length>5?'source_unavailable':row.sourceDate!==stamp.businessDate?'business_date_changed':null;
/** ids (R078 row delta): only these borrowers' entries, in the walk's order. */
const borrowerUpcomingMetadata=(ids=null)=>async function borrowerUpcomingMetadata(c,_a,stamp,state){
 const rows=(await c.query(`${borrowerUpcomingCte} SELECT * FROM upcoming_context WHERE ($3::text IS NULL OR id COLLATE "C">$3 COLLATE "C") AND ($4::text[] IS NULL OR id=ANY($4::text[])) ORDER BY id COLLATE "C" LIMIT 129`,[stamp.businessDate,null,text(state),ids])).rows,patches=[];
 for(const row of rows.slice(0,128))for(const scope of ['borrower','collection'])if(row[scope==='borrower'?'directory':'collection']){
  const error=upcomingContextError(row,stamp),context={...stamp,timezone:'Asia/Bangkok',horizonEnd:row.horizonEnd,reviewRequired:row.reviewLoans>0};
  if(!error&&row.dates.some(date=>!validBorrowerId(date.id)||!validUpcomingDate(date.dueDate)||date.dueDate<=stamp.businessDate||date.dueDate>row.horizonEnd||(date.totalCharge!==null&&(typeof date.totalCharge!=='string'||! /^-?\d+(?:\.\d+)?$/.test(date.totalCharge)))))throw Error('source_unavailable');
  patches.push(replace('borrowerUpcomingByKey',error?{borrowerId:row.id,scope,error}:{borrowerId:row.id,scope,...context,items:row.dates,previews:row.dates.map(date=>({ok:true,source:'dev',...context,dueDate:date.dueDate,totalCharge:date.totalCharge,items:[],nextCursor:null}))},[JSON.stringify([scope,row.id])]));
 }
 return result(patches,rows.length>128?rows[127].id:null);
};
const borrowerUpcomingEvents=(ids=null)=>async function borrowerUpcomingEvents(c,_a,stamp,state){
 const after=state??{loanId:null,id:null};if(state){object(state,['loanId','id']);if(!validBorrowerId(state.loanId)||!validBorrowerId(state.id))throw Error('invalid_request')}
 const rows=(await c.query(`${borrowerUpcomingCte} SELECT ctx.*,e."Row ID" AS "eventId",e."Ref Loan" AS "loanId",e."Due Date"::text AS "dueDate",e."Principal Remaining"::text AS "principalRemaining",e."Interest Remaining"::text AS "interestRemaining",e."Amount Remaining"::text AS "amountRemaining",e."Basis" AS basis,b."Borrower Name" AS name,b."Description" AS description,l."Principal Amount"::numeric::text AS principal,l."Loan Date"::text AS "loanDate",l."Original Daily Interest Rate"::text AS rate FROM forecast_events e JOIN upcoming_context ctx ON ctx.id=e."Ref Borrower" JOIN public."Loans" l ON l."Row ID"=e."Ref Loan" AND l."Ref Borrowers"=ctx.id JOIN public."Borrowers" b ON b."Row ID"=ctx.id WHERE ($3::text IS NULL OR (e."Ref Loan" COLLATE "C",e."Row ID" COLLATE "C")>($3 COLLATE "C",$4 COLLATE "C")) AND ($5::text[] IS NULL OR ctx.id=ANY($5::text[])) ORDER BY e."Ref Loan" COLLATE "C",e."Row ID" COLLATE "C" LIMIT 129`,[stamp.businessDate,null,after.loanId,after.id,ids])).rows,groups=new Map();
 for(const row of rows.slice(0,128)){if(upcomingContextError(row,stamp))continue;const index=row.dates.findIndex(date=>date.dueDate===row.dueDate);if(index<0)throw Error('source_unavailable');const item=projectUpcomingEvent({...row,id:row.eventId});for(const scope of ['borrower','collection'])if(row[scope==='borrower'?'directory':'collection']){const key=JSON.stringify([scope,row.id]),groupKey=JSON.stringify([key,index]);if(!groups.has(groupKey))groups.set(groupKey,{key,index,items:[]});groups.get(groupKey).items.push(item)}}
 return result([...groups.values()].map(({key,index,items})=>append('borrowerUpcomingByKey',items,[key,'previews',String(index),'items'])),rows.length>128?{loanId:rows[127].loanId,id:rows[127].eventId}:null);
};
// The collection's charge and receipt reads, shared by the walk and the R078 row delta (same columns and order).
const chargeColumns=`borrower_id,id,loan_id,payment_status,borrower_name,borrower_description,principal_amount,loan_date,original_rate,charge_date::text AS charge_date,payment_date::text AS payment_date,amount_remaining::text AS amount_remaining,total_paid::text AS total_paid,received_today::text AS received_today`;
const projectCharge=row=>({borrowerId:row.borrower_id,...projectCollectionCharge(row)});
const receiptSql=where=>`${collectionCte} SELECT p."Row ID" id,p."Ref Borrower" AS "borrowerId",p."Payment Date"::text AS "paymentDate",p."Amount Received"::numeric::text amount,(nullif(btrim(p."Uploaded Receipt"),'') IS NOT NULL) AS "manualReceiptPresent",(nullif(btrim(p."Receipt Image"),'') IS NOT NULL) AS "agentReceiptPresent",(CASE WHEN nullif(btrim(p."Uploaded Receipt"),'') IS NOT NULL THEN p."Uploaded Receipt At" ELSE p."Receipt Received At" END)::text AS "receiptAt",array_agg(DISTINCT e.id) AS "chargeIds" FROM public."Payments" p JOIN public."Payment Allocations" a ON a."Ref Payment"=p."Row ID" JOIN eligible e ON e.id=a."Ref Charge" AND e.borrower_id=p."Ref Borrower" WHERE p."Status"='Posted' AND a."Allocated Amount"::numeric>0 AND ${where} GROUP BY p."Row ID" ORDER BY p."Row ID" COLLATE "C"`;
const collectionPhases=[
 page('items',(c,cursor)=>readCollection(c,{limit:100,after:decodeCollectionCursor(cursor,'collection')})),
 async(c,_a,stamp,state)=>{const rows=(await c.query(`${collectionCte} SELECT ${chargeColumns} FROM eligible WHERE ($3::text IS NULL OR id COLLATE "C">$3 COLLATE "C") ORDER BY id COLLATE "C" LIMIT 129`,[stamp.businessDate,null,text(state)])).rows;return result([append('charges',rows.slice(0,128).map(projectCharge))],rows.length>128?rows[127].id:null)},
 async(c,_a,_stamp,state)=>{const value=await readStandaloneUpcoming(c,{limit:100,cursor:text(state)}),{items,nextCursor,...metadata}=value;const {dateTotals,...context}=metadata;return result([...(state?[]:[replace('upcoming',{...metadata,items:[],nextCursor:null})]),append('upcoming',items,['items']),...items.map(row=>replace('upcomingDetailsByKey',{...context,borrowerId:row.borrowerId,borrowerLabel:row.label,dueDate:row.dueDate,totalCharge:row.totalCharge,items:[],nextCursor:null},[JSON.stringify([row.borrowerId,row.dueDate])]))],nextCursor)},
 upcomingDetail,borrowerUpcomingMetadata(),borrowerUpcomingEvents(),
 async(c,_a,stamp,state)=>{const rows=(await c.query(`${receiptSql('($3::text IS NULL OR p."Row ID" COLLATE "C">$3 COLLATE "C")')} LIMIT 129`,[stamp.businessDate,null,text(state)])).rows;return result([append('receipts',rows.slice(0,128))],rows.length>128?rows[127].id:null)}
];

/** from (R078 day change): only account-days on or after this date. */
const statementFrom=from=>async function statement(c,_a,_stamp,input){
 const state=object(input??{afterAccount:null,afterDate:null,current:null,cursor:null},['afterAccount','afterDate','current','cursor']);let current=state.current;
 if((state.afterAccount!==null&&!validBorrowerId(state.afterAccount))||(state.afterDate!==null&&!validUpcomingDate(state.afterDate))||(current&&(!validBorrowerId(current.accountId)||!validUpcomingDate(current.date))))throw Error('invalid_request');
 if(!current){current=(await c.query(`SELECT "Ref Cash Account" AS "accountId","Statement Date"::text AS date FROM public."Cash Account Daily Summary Recent" WHERE ($1::text IS NULL OR ("Ref Cash Account" COLLATE "C","Statement Date")>($1 COLLATE "C",$2::date))${from?' AND "Statement Date">=$3::date':''} ORDER BY "Ref Cash Account" COLLATE "C","Statement Date" LIMIT 1`,[text(state.afterAccount),text(state.afterDate),...(from?[from]:[])])).rows[0];if(!current)return result([])}
 const value=await readCashStatement(c,{...current,limit:100,cursor:text(state.cursor)}),key=JSON.stringify([current.accountId,current.date]),{items,nextCursor,...metadata}=value;
 const patches=[...(state.cursor?[]:[replace('statementsByKey',{...metadata,items:[],nextCursor:null},[key])]),append('statementsByKey',items,[key,'items'])];
 return result(patches,nextCursor?{...state,current,cursor:nextCursor}:{afterAccount:current.accountId,afterDate:current.date,current:null,cursor:null});
};
const statement=statementFrom(null);
const cashPhases=[one('overview',readCashOverview),one('preferences',readPreferences),statement];
const managementKinds=['cash-accounts','cash-holders','partners','contributions','settlements','cash-movements','assessments','analytics-validation'];
const managementPhases=managementKinds.map(kind=>async(c,_a,_stamp,state)=>{
 const options={limit:kind==='partners'?16:100,cursor:text(state)},value=kind==='assessments'?await readManagementAssessments(c,options):kind==='analytics-validation'?await readManagementAnalytics(c,options):['contributions','settlements','cash-movements'].includes(kind)?await readManagementFinancial(c,kind,options):await readManagement(c,kind,options);
 const batch=bulkReadClient(c),items=kind==='partners'?await Promise.all(value.items.map(async row=>(await readManagement(batch,kind,{id:row.id})).item)):value.items;
 return result([append('sections',items,[kind])],value.nextCursor);
});
managementPhases.push(parents('Cash Accounts',async(c,id)=>({patches:[append('openings',[(await readManagementOpenings(c,{id})).item].filter(Boolean))]})),one('position',readManagementPosition),one('analyticsOverview',readAnalyticsOverview));
for(const metric of ['distribution','profit30','dailyInterest','projected','daily','weekly','monthly','outstanding30','profit30Line'])managementPhases.push(async(c,_a,_stamp,state)=>{const value=await readAnalyticsChart(c,{metric,limit:100,cursor:text(state)});if(value.truncated)throw Error('source_unavailable');const {items,nextCursor,...metadata}=value;return result([...(state?[]:[replace('charts',{...metadata,items:[],nextCursor:null},[metric])]),append('charts',items,[metric,'items'])],nextCursor??null)});

// R078 day-change delta. When the Bangkok business date moved, a client keeps every key whose providers do not
// read the date (IND, `ind`) and the server re-reads the others (`dep`) with the day plan below. Lists from
// Archie's time-dependence trace (design section G); any key not named IND is DEP, and a key re-read for another
// reason counts as DEP here (borrowerOptions: the loan-options phase rewrites it; sections.analytics-validation:
// it lists the Daily Analytics rows the hourly job writes). collection is entirely DEP, so its day change walks.
// A retained statementsByKey day reads only ledger effects up to that day (V27 grid, today-14..today).
export const offlineDayKeys=Object.freeze({
 records:Object.freeze({dep:Object.freeze(['borrowers','paymentDrafts','borrowerOptions','loanOptions','expenseOptions','dashboard']),ind:Object.freeze(['loans','charges','payments','expenses','borrowerList','borrowerLoans','loanList','loanRelated','paymentMonths','paymentHistory'])}),
 cash:Object.freeze({dep:Object.freeze(['overview','preferences','statementsByKey']),ind:Object.freeze([])}),
 management:Object.freeze({dep:Object.freeze(['sections.assessments','sections.analytics-validation','position','analyticsOverview','charts']),ind:Object.freeze(['sections.cash-accounts','sections.cash-holders','sections.partners','sections.contributions','sections.settlements','sections.cash-movements','openings'])}),
});
const clear=(key,value,path)=>async()=>result([replace(key,value,path)]);
/** Statement keys that left the recent window (the view's window is the database's today-14..today). */
const statementWindow=from=>async c=>{
 const low=(await c.query(`SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-14)::text AS low`)).rows[0].low;
 const accounts=(await c.query('SELECT "Row ID" AS id FROM public."Cash Accounts" ORDER BY "Row ID" COLLATE "C"')).rows.map(row=>row.id),keys=[];
 for(let day=new Date(Date.parse(from+'T00:00:00Z')-14*86400000);day.toISOString().slice(0,10)<low;day=new Date(day.getTime()+86400000))for(const account of accounts)keys.push(JSON.stringify([account,day.toISOString().slice(0,10)]));
 return result(keys.length?[{key:'statementsByKey',mode:'remove',value:keys}]:[]);
};
/** The DEP re-read of each domain after a day change from `from` (the client's business date). A key is cleared
 * before its full re-read (or replaced whole by its first page), so it ends as a walk writes it. Records phases:
 * 0 borrowers, 10-12 payment drafts, 15 borrowerOptions/loanOptions, 16 referrers, 17 expenseOptions, 18 dashboard.
 * Management: 6 assessments, 7 analytics-validation, 9 position, 10 analyticsOverview, 11- charts. */
function dayPlan(domain,from){
 if(domain==='records')return [clear('borrowers',[]),recordPhases[0],clear('paymentDrafts',{}),recordPhases[10],recordPhases[11],recordPhases[12],recordPhases[15],recordPhases[16],recordPhases[17],recordPhases[18]];
 if(domain==='cash')return [statementWindow(from),cashPhases[0],cashPhases[1],statementFrom(from)];
 if(domain==='management')return [clear('sections',[],['assessments']),managementPhases[6],clear('sections',[],['analytics-validation']),managementPhases[7],managementPhases[9],managementPhases[10],...managementPhases.slice(11)];
 return null;
}
/** The traversal domain of a day-change re-read ('records@day:2026-10-18'), or null where the domain walks. */
export const dayTraversal=(domain,from)=>offlineDayKeys[domain]&&/^\d{4}-\d{2}-\d{2}$/.test(from)?domain+'@day:'+from:null;
const domainPhases={records:recordPhases,collection:collectionPhases,cash:cashPhases,management:managementPhases};
function phasesOf(traversal){
 const [domain,plan,extra]=String(traversal).split('@');
 if(extra!==undefined||!Object.hasOwn(domainPhases,domain))return {domain,phases:null};
 if(plan===undefined)return {domain,phases:domainPhases[domain]};
 const day=/^day:(\d{4}-\d{2}-\d{2})$/.exec(plan);return {domain,phases:day?dayPlan(domain,day[1]):null};
}
/** Test-only: pin the business date of the read stamp (a lab test crossing a day or month end). Refused on
 * Cloud Run (K_SERVICE), so a deployed service always reads the database clock. */
let pinnedBusinessDate=null;
export function pinOfflineBusinessDate(day){if(day!==null&&(process.env.K_SERVICE||!/^\d{4}-\d{2}-\d{2}$/.test(day)))throw Error('Business date pin is test-only');pinnedBusinessDate=day}
export async function readOfflineStamp(client){
 const stamp=(await client.query(`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`)).rows[0];
 return pinnedBusinessDate&&!process.env.K_SERVICE?{...stamp,businessDate:pinnedBusinessDate}:stamp;
}
/** Bounded resumable traversal. Every request retains the ordinary transaction,
 * owner checks, per-item versions and provider calculations. */
/** One need request may name at most this many content hashes (api/offline-dataset-delta.mjs);
 * a response therefore never carries more values than that. */
export const MAX_CHUNK_VALUES=2048;
const patchValues=patches=>patches.reduce((sum,patch)=>sum+(patch.mode==='append'?patch.value.length:1),0);
export async function readOfflineDatasetChunk(client,actor,domain,cursor=null,{singlePage=false,deterministicPages=null,maxValues=MAX_CHUNK_VALUES}={}){
 // domain: a domain, or its day-change traversal (dayTraversal); the chunk names the domain either way.
 const {domain:name,phases}=phasesOf(domain);if(!phases)throw Error('invalid_request');
 const stamp=await readOfflineStamp(client);
 const traversal=readTraversalCursor(cursor,{actor,domain,...stamp,phases:phases.length});
 let next=traversal,bytes=0,values=0;const patches=[],started=performance.now();
 // Pack small pages to avoid hundreds of HTTP round trips. Check budgets only
 // between authoritative pages; a page is never truncated or partially applied.
 // A page that would push the response past the value budget is left for the
 // next request (same cursor, same page: replay stays deterministic), so one
 // need request can always fetch everything a response references.
 for(let count=0;count<(deterministicPages??(singlePage?1:8));count++){
  const value=await phases[next.phase](client,actor,stamp,next.state),pageValues=patchValues(value.patches);
  if(count>0&&values+pageValues>maxValues)break;
  patches.push(...value.patches);bytes+=Buffer.byteLength(JSON.stringify(value.patches));values+=pageValues;
  next={...next,phase:next.phase+(value.state===null?1:0),state:value.state,done:next.done+1};
  if(next.phase===phases.length||(!deterministicPages&&performance.now()-started>=750)||bytes>=524288||values>=maxValues)break;
 }
 const complete=next.phase===phases.length;
 return {schemaVersion:2,domain:name,generation:traversal.generation,startedAt:traversal.startedAt,...stamp,patches,nextCursor:complete?null:encodeTraversalCursor(next),complete,progress:{completed:next.phase,total:phases.length},chunksCompleted:next.done};
}

// R078 protocol v4 (records): re-read only the records a change-log delta can affect. Records partition by
// borrower: every row version used by the details (pwa_*_version_v2) reads the borrower's loans, charges
// and repayments, so a change anywhere under a borrower re-sends that borrower's rows (detail, list,
// loan-related, drafts, history, months). Global lists (loanList) are re-read whole and the dashboard is
// re-read on every delta. Returns null whenever a delta cannot be mapped safely: the caller then walks.
const upsert=(key,value,path,order)=>({key,mode:'upsert',value,...(path?{path}:{}),...(order?{order}:{})});
const removeRows=(key,value,path,by)=>({key,mode:'remove',value,...(path?{path}:{}),...(by?{by}:{})});
const sortIds=ids=>[...new Set(ids)].filter(id=>typeof id==='string').sort((a,b)=>a<b?-1:a>b?1:0);
/** Limits of one targeted delta; above them a walk is cheaper and simpler. */
export const TARGETED_LIMITS=Object.freeze({rows:2000,borrowers:8,payments:400,expenses:200,loans:200,charges:4000,milliseconds:5000});
/** changes: [{table,key}] from public.pwa_row_changes. Resolves the affected borrowers, unassigned
 * payments and expenses, or null (walk) for anything it cannot attribute: a missing row (delete or key
 * change), a cash account/holder change (labels in every record) or an unknown table. */
export async function resolveRecordsScope(client,changes){
 const keys=new Map();for(const {table,key} of changes){if(!keys.has(table))keys.set(table,new Set());keys.get(table).add(key)}
 const borrowers=new Set(),payments=new Set(),expenses=new Set(),dashboard=changes.length>0;
 const dashboardOnly=['Settlements','Partners','Cash Pool Contributions','r008_cash_account_cutover','Statistics','Daily Analytics'];
 // Each lookup returns, per changed key that still exists: the borrowers whose rows it affects, the
 // payment it belongs to (re-sent on its own only when that payment has no borrower) and the expense.
 const row=(key,borrowers,payment='NULL::text',expense='NULL::text',unassigned='false')=>`SELECT ${key} AS key,ARRAY[${borrowers}]::text[] AS borrowers,${payment} AS payment,${expense} AS expense,${unassigned} AS unassigned`;
 const paymentJoin='LEFT JOIN public."Payments" p ON p."Row ID"=',chargeLoan='LEFT JOIN public."Charges" c ON c."Row ID"=',loanOf='LEFT JOIN public."Loans" l ON l."Row ID"=',orphan='(p."Row ID" IS NOT NULL AND p."Ref Borrower" IS NULL)';
 const lookups={
  Borrowers:`${row('"Row ID"','"Row ID"')} FROM public."Borrowers" WHERE "Row ID"=ANY($1::text[])`,
  Loans:`${row('"Row ID"','"Ref Borrowers"')} FROM public."Loans" WHERE "Row ID"=ANY($1::text[])`,
  Charges:`${row('c."Row ID"','l."Ref Borrowers"')} FROM public."Charges" c ${loanOf}c."Ref Loans" WHERE c."Row ID"=ANY($1::text[])`,
  Payments:`${row('p."Row ID"','p."Ref Borrower"','p."Row ID"','NULL::text',orphan)} FROM public."Payments" p WHERE p."Row ID"=ANY($1::text[])`,
  'Payment Allocations':`${row('a."Row ID"','p."Ref Borrower",l."Ref Borrowers"','a."Ref Payment"','NULL::text',orphan)} FROM public."Payment Allocations" a ${paymentJoin}a."Ref Payment" ${chargeLoan}a."Ref Charge" ${loanOf}c."Ref Loans" WHERE a."Row ID"=ANY($1::text[])`,
  Repayments:`${row('r."Row ID"','p."Ref Borrower",l."Ref Borrowers"','r."Ref Payment"','NULL::text',orphan)} FROM public."Repayments" r ${paymentJoin}r."Ref Payment" ${chargeLoan}r."Ref Charges" ${loanOf}c."Ref Loans" WHERE r."Row ID"=ANY($1::text[])`,
  'Cash Ledger':`${row('g."Row ID"','p."Ref Borrower",l."Ref Borrowers"','g."Ref Payment"','g."Ref Business Expense"',orphan)} FROM public."Cash Ledger" g ${paymentJoin}g."Ref Payment" ${loanOf}g."Ref Loan" WHERE g."Row ID"=ANY($1::text[])`,
  'Business Expenses':`${row('"Row ID"','NULL::text','NULL::text','"Row ID"')} FROM public."Business Expenses" WHERE "Row ID"=ANY($1::text[])`,
  // A command journal row affects the payment it posted or revised (pwa_payment_version_v2 revision head).
  pwa_payment_commands:`${row('j.request_id::text','p."Ref Borrower"','p."Row ID"','NULL::text',orphan)} FROM public.pwa_payment_commands j ${paymentJoin}ANY(ARRAY[j.payment_id,j.result_json->>'paymentId',j.canonical_json::jsonb#>>'{command,targetId}']) WHERE j.request_id::text=ANY($1::text[])`,
 };
 for(const [table,set] of keys){
  if(dashboardOnly.includes(table))continue;
  const sql=lookups[table];if(!sql)return null;
  const ids=sortIds(set),rows=(await client.query(sql,[ids])).rows,found=new Set(rows.map(item=>item.key));
  if(ids.some(id=>!found.has(id)))return null;
  // A loan or charge without a borrower is not in any walk's details; it cannot be attributed.
  if((table==='Loans'||table==='Charges')&&rows.some(item=>!(item.borrowers??[]).some(Boolean)))return null;
  for(const item of rows){for(const borrower of item.borrowers??[])if(borrower)borrowers.add(borrower);if(item.payment&&item.unassigned)payments.add(item.payment);if(item.expense)expenses.add(item.expense)}
 }
 // A payment attributed to a borrower is re-sent with that borrower's rows.
 if(borrowers.size>TARGETED_LIMITS.borrowers||payments.size>TARGETED_LIMITS.payments||expenses.size>TARGETED_LIMITS.expenses)return null;
 return {borrowers:sortIds(borrowers),payments:sortIds(payments),expenses:sortIds(expenses),dashboard};
}
async function detailRows(client,stamp,key,read,ids,check=null){
 const items=[],missing=[];
 for(let offset=0;offset<ids.length;offset+=64){const slice=ids.slice(offset,offset+64),batch=bulkReadClient(client),values=await Promise.all(slice.map(id=>read(batch,id)));values.forEach((item,index)=>{if(item)items.push({...item,...stamp,...(key==='payments'?{receiptReference:item.receiptReference?'attached':null}:{})});else missing.push(slice[index])});check?.(items.length)}
 return [...(items.length?[upsert(key,items,undefined,'id')]:[]),...(missing.length?[removeRows(key,missing)]:[])];
}
async function allPages(read){const items=[];let cursor=null,first=null;for(let page=0;page<200;page++){const value=await read(cursor);first??=value;items.push(...(value.items??[]));cursor=value.nextCursor??null;if(!cursor)return {first,items}}throw Error('source_unavailable')}
/** The records patches for a resolved scope (see resolveRecordsScope). */
/** Rows embedding another row's data, and how a delta reaches them (R078 v4 dependency audit):
 * - borrower detail: referrer's name -> borrowers whose "Ref Referrer" is an affected borrower;
 *   preferred receiving account label -> Cash Accounts change walks.
 * - loan detail: borrower name, version over the loan's charges/repayments -> loans of affected borrowers;
 *   disbursing account label -> walk.
 * - charge detail: borrower via loan, version over loan/repayments/allocations -> charges of their loans.
 * - payment detail: borrower name, version over the borrower's loans/charges/repayments, allocations, ledger,
 *   revision head -> payments of affected borrowers; allocation loan labels name the charge's borrower ->
 *   payments allocated to charges of affected loans; account labels -> walk.
 * - expense detail: payee/related borrower labels, related loan fields -> expenses referencing affected
 *   borrowers/loans; account/holder labels -> walk.
 * - loanRelated payments include other borrowers' payments targeting or repaying the loan -> loans targeted or
 *   repaid by the re-read payments.
 * - paymentMonths groups by borrower: re-read whole (a moved payment changes a group the delta cannot name).
 * - loanList, dashboard: re-read whole. borrowerList, borrowerLoans, referrers, paymentHistory: own rows.
 * - A row that moved to another owner (loan, charge, payment refs) leaves the old owner's rows stale: the client
 *   holds the old row and walks instead (apps/pwa/src/dataset-patch.ts deltaMovesRows).
 * Bounded by TARGETED_LIMITS (counts and elapsed time); above them the caller walks. */
export async function readRecordsTargeted(client,actor,stamp,{borrowers,payments,expenses,dashboard}){
 const started=Date.now(),B=sortIds(borrowers);
 // Counts and time are checked as the delta is built (after every detail batch), so it stops at the limit.
 let values=0;const cap=4*MAX_CHUNK_VALUES;
 const within=(count,limit)=>{if(count>limit||values>cap||Date.now()-started>TARGETED_LIMITS.milliseconds)throw Error('targeted_limit')};
 const patches={push(...items){for(const patch of items){values+=patch.mode==='append'||patch.mode==='upsert'?patch.value.length:1;this.list.push(patch)}within(0,0)},list:[]};
 const ids=async(sql,params)=>sortIds((await client.query(sql,params)).rows.map(row=>row.id));
 const loans=B.length?await ids('SELECT "Row ID" AS id FROM public."Loans" WHERE "Ref Borrowers"=ANY($1::text[])',[B]):[];within(loans.length,TARGETED_LIMITS.loans);
 const charges=loans.length?await ids('SELECT "Row ID" AS id FROM public."Charges" WHERE "Ref Loans"=ANY($1::text[])',[loans]):[];within(charges.length,TARGETED_LIMITS.charges);
 const paymentIds=sortIds([...payments,...(B.length?await ids('SELECT "Row ID" AS id FROM public."Payments" WHERE "Ref Borrower"=ANY($1::text[])',[B]):[]),
  ...(loans.length?await ids('SELECT DISTINCT a."Ref Payment" AS id FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge" WHERE c."Ref Loans"=ANY($1::text[]) AND a."Ref Payment" IS NOT NULL',[loans]):[])]);
 within(paymentIds.length,TARGETED_LIMITS.payments);
 const borrowerIds=sortIds([...B,...(B.length?await ids('SELECT "Row ID" AS id FROM public."Borrowers" WHERE "Ref Referrer"=ANY($1::text[])',[B]):[])]);within(borrowerIds.length,TARGETED_LIMITS.borrowers*8);
 const expenseIds=sortIds([...expenses,...(B.length?await ids('SELECT "Row ID" AS id FROM public."Business Expenses" WHERE "Ref Related Borrower"=ANY($1::text[]) OR "Ref Payee Borrower"=ANY($1::text[]) OR "Ref Related Loan"=ANY($2::text[])',[B,loans]):[])]);within(expenseIds.length,TARGETED_LIMITS.expenses);
 const relatedLoans=sortIds([...loans,...(paymentIds.length?await ids('SELECT "Ref Target Loan" AS id FROM public."Payments" WHERE "Row ID"=ANY($1::text[]) AND "Ref Target Loan" IS NOT NULL UNION SELECT c."Ref Loans" AS id FROM public."Repayments" r JOIN public."Charges" c ON c."Row ID"=r."Ref Charges" WHERE r."Ref Payment"=ANY($1::text[]) AND c."Ref Loans" IS NOT NULL',[paymentIds]):[])]);within(relatedLoans.length,TARGETED_LIMITS.loans);
 const details=async(key,read,list)=>detailRows(client,stamp,key,read,list,count=>within(values+count>cap?Number.POSITIVE_INFINITY:0,0));
 patches.push(...await details('borrowers',readBorrowerRecord,borrowerIds),...await details('loans',readLoanRecord,loans),...await details('charges',readChargeRecord,charges),...await details('payments',readPaymentRecord,paymentIds),...await details('expenses',readExpenseRecord,expenseIds));
 if(B.length){
  const list=(await client.query(`SELECT ${borrowerListColumns} FROM public."Borrowers" WHERE "Hidden Flag" IS NOT TRUE AND "Row ID"=ANY($1::text[]) ORDER BY "Row ID" COLLATE "C"`,[B])).rows;
  patches.push(removeRows('borrowerList',B.filter(id=>!list.some(row=>row.id===id))),upsert('borrowerList',list,undefined,'id'));
  const shown=(await client.query(`SELECT ${loanColumns} FROM public."Loans" l JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" WHERE b."Hidden Flag" IS NOT TRUE AND l."Row ID"=ANY($1::text[]) ORDER BY l."Row ID" COLLATE "C"`,[loans])).rows.map(row=>projectLoan(row,row.borrowerId));
  patches.push(removeRows('borrowerLoans',loans.filter(id=>!shown.some(row=>row.id===id))),upsert('borrowerLoans',shown,undefined,'id'));
  const loanList=await allPages(cursor=>readRecordList(client,'loans',{limit:100,cursor}));
  patches.push(replace('loanList',[]),append('loanList',loanList.items));within(0,0);
  for(const borrowerId of B)for(const scope of ['due','future','all']){
   let first;const items=[];try{let cursor=null;for(let page=0;;page++){if(page>=200)throw Error('source_unavailable');const value=await readOwnerPaymentDraft(client,borrowerId,{scope,limit:100,cursor});if(value.draftError){first=value;break}first??=value;items.push(...value.charges);cursor=value.nextCursor;if(!cursor)break}}catch(error){if(error.message!=='Draft unavailable')throw error;first={draftError:'source_unavailable',status:503}}
   if(first.draftError){patches.push(replace('paymentDrafts',first,[borrowerId,scope]));continue}
   const {charges:_page,nextCursor:_next,...metadata}=first;patches.push(replace('paymentDrafts',{...metadata,charges:[],nextCursor:null},[borrowerId,scope]),...(items.length?[append('paymentDrafts',items,[borrowerId,scope,'charges'])]:[]));
  }
  within(0,0);
  const referrers=(await client.query('SELECT "Row ID" id,"Borrower Name" label,"Description" description FROM public."Borrowers" WHERE "Row ID"=ANY($1::text[]) ORDER BY "Row ID" COLLATE "C"',[B])).rows;
  patches.push(upsert('borrowerOptions',referrers,['referrers'],'id'));
 }
 for(const loanId of relatedLoans)for(const kind of ['charges','payments']){const related=await allPages(cursor=>readLoanRelated(client,loanId,kind,{limit:100,cursor}).then(value=>value??{items:[],nextCursor:null}));patches.push(replace('loanRelated',[],[loanId,kind]),...(related.items.length?[append('loanRelated',related.items,[loanId,kind])]:[]))}
 within(0,0);
 if(B.length||payments.length){
  // Whole, in the walk's order: a group can lose a payment that moved to a borrower outside the delta.
  const months=(await client.query(`WITH groups AS (${paymentMonthGroups('')}) SELECT * FROM groups ORDER BY coalesce("borrowerId",'') COLLATE "C",coalesce(month,'') COLLATE "C"`)).rows;
  patches.push(replace('paymentMonths',[]),...(months.length?[append('paymentMonths',months)]:[]));
  const history=(await client.query(`${paymentHistorySelect} WHERE p."Ref Borrower"=ANY($4::text[]) OR p."Row ID"=ANY($5::text[]) ORDER BY p."Row ID" COLLATE "C"`,[actor.issuer,actor.subject,actor.partnerId,B,payments])).rows;
  patches.push(removeRows('paymentHistory',B,undefined,'borrowerId'),upsert('paymentHistory',history,undefined,'id'));
 }
 if(dashboard)patches.push(replace('dashboard',await readDashboard(client)));
 within(0,0);
 return patches.list.filter(patch=>patch.mode!=='upsert'&&patch.mode!=='remove'||patch.value.length>0);
}

// R078 row deltas for collection and cash (owner, 19 October 2026: post-write cycle under 3 s). Same contract as
// the records delta: a resolver returns null (walk) for anything it cannot map safely; the targeted read throws
// 'targeted_limit' above TARGETED_LIMITS (the caller walks). The client checks rows that may have left the scope
// (shared deltaMovesRows / deltaScopeMoves): the change log has no old values.
const replaceWhere=(key,field,values,value,sort)=>({key,mode:'replaceWhere',field,values,value,...(sort?{sort}:{})});
const rowPatchValues=patches=>patches.reduce((sum,patch)=>sum+(['append','upsert','replaceWhere'].includes(patch.mode)?patch.value.length:1),0);
/** Every page of one phase, as the walk writes it. */
async function phasePages(phase,c,a,stamp){const patches=[];let state=null;for(let page=0;page<200;page++){const value=await phase(c,a,stamp,state);patches.push(...value.patches);state=value.state;if(state===null)return patches}throw Error('source_unavailable')}
function rowBudget(){
 const started=Date.now(),list=[];
 return {list,push(...items){list.push(...items);if(rowPatchValues(list)>4*MAX_CHUNK_VALUES||Date.now()-started>TARGETED_LIMITS.milliseconds)throw Error('targeted_limit')}};
}
const collectionRowTables=['Borrowers','Loans','Charges','Payments','Payment Allocations','Repayments','Cash Ledger','pwa_payment_commands'];
/** Collection works per borrower, through the records lookups. A Cash Accounts change, an unmapped table or a
 * hidden changed borrower walks. loans: the changed loans (the client checks they did not leave a borrower). */
export async function resolveCollectionScope(client,changes){
 if(changes.some(row=>!collectionRowTables.includes(row.table)))return null;
 const scope=await resolveRecordsScope(client,changes);if(!scope)return null;
 const changed=sortIds(changes.filter(row=>row.table==='Borrowers').map(row=>row.key));
 if(changed.length&&(await client.query('SELECT 1 FROM public."Borrowers" WHERE "Row ID"=ANY($1::text[]) AND "Hidden Flag" IS TRUE LIMIT 1',[changed])).rowCount)return null;
 // A changed payment also touches the borrowers whose charges it is allocated to or repays (receipts list it
 // under them, so a payment moved to another borrower leaves its old borrower's row).
 const payments=sortIds(changes.filter(row=>row.table==='Payments').map(row=>row.key));
 const charged=payments.length?(await client.query(`SELECT l."Ref Borrowers" AS id FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge" JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE a."Ref Payment"=ANY($1::text[]) UNION SELECT l."Ref Borrowers" AS id FROM public."Repayments" r JOIN public."Charges" c ON c."Row ID"=r."Ref Charges" JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE r."Ref Payment"=ANY($1::text[])`,[payments])).rows.map(row=>row.id):[];
 const borrowers=sortIds([...scope.borrowers,...charged]);if(borrowers.length>TARGETED_LIMITS.borrowers)return null;
 return {borrowers,loans:sortIds(changes.filter(row=>row.table==='Loans').map(row=>row.key))};
}
/** items, upcoming and upcomingDetailsByKey whole; charges, receipts and borrowerUpcomingByKey for the borrowers. */
export async function readCollectionTargeted(client,actor,stamp,{borrowers}){
 const B=sortIds(borrowers),patches=rowBudget();
 patches.push(replace('items',[]),...await phasePages(collectionPhases[0],client,actor,stamp));
 patches.push(replace('upcomingDetailsByKey',{}),...await phasePages(collectionPhases[2],client,actor,stamp),...await phasePages(collectionPhases[3],client,actor,stamp));
 if(B.length){
  const charges=(await client.query(`${collectionCte} SELECT ${chargeColumns} FROM eligible WHERE borrower_id=ANY($3::text[]) ORDER BY id COLLATE "C"`,[stamp.businessDate,null,B])).rows;
  if(charges.length>TARGETED_LIMITS.charges)throw Error('targeted_limit');
  patches.push(replaceWhere('charges','borrowerId',B,charges.map(projectCharge),'id'));
  patches.push(removeRows('borrowerUpcomingByKey',B.flatMap(id=>['borrower','collection'].map(scope=>JSON.stringify([scope,id])))),...await phasePages(borrowerUpcomingMetadata(B),client,actor,stamp),...await phasePages(borrowerUpcomingEvents(B),client,actor,stamp));
  const receipts=(await client.query(receiptSql('p."Ref Borrower"=ANY($3::text[])'),[stamp.businessDate,null,B])).rows;
  patches.push(replaceWhere('receipts','borrowerId',B,receipts,'id'));
 }
 return patches.list;
}
const cashWalkTables=['Cash Accounts','Cash Holders','Cash Statement Context','r008_cash_account_cutover'];
const cashOverviewTables=['Cash Pool Contributions','Repayments'];
// Rows whose labels a statement item shows (cash_statement_account_effects, readCashStatement): their ledger rows'
// account-days are re-read, nothing later (labels do not move balances).
const ledgerColumns='g."Row ID" AS id,g."Ref From Cash Account" AS "from",g."Ref To Cash Account" AS "to",g."Movement Date"::text AS day';
const cashLabelSql={
 Payments:`SELECT ${ledgerColumns} FROM public."Cash Ledger" g WHERE g."Ref Payment"=ANY($1::text[])`,
 Loans:`SELECT ${ledgerColumns} FROM public."Cash Ledger" g WHERE g."Ref Loan"=ANY($1::text[])`,
 'Business Expenses':`SELECT ${ledgerColumns} FROM public."Cash Ledger" g WHERE g."Ref Business Expense"=ANY($1::text[])`,
 Settlements:`SELECT ${ledgerColumns} FROM public."Cash Ledger" g WHERE g."Ref Settlement"=ANY($1::text[])`,
 Partners:`SELECT ${ledgerColumns} FROM public."Cash Ledger" g JOIN public."Settlements" st ON st."Row ID"=g."Ref Settlement" WHERE st."Ref Partner"=ANY($1::text[])`,
 Borrowers:`SELECT ${ledgerColumns} FROM public."Cash Ledger" g LEFT JOIN public."Payments" p ON p."Row ID"=g."Ref Payment" LEFT JOIN public."Loans" n ON n."Row ID"=g."Ref Loan" LEFT JOIN public."Business Expenses" e ON e."Row ID"=g."Ref Business Expense" WHERE coalesce(p."Ref Borrower",n."Ref Borrowers",e."Ref Payee Borrower")=ANY($1::text[])`,
};
export const CASH_ACCOUNT_DAY_LIMIT=30;
/** Cash works per account-day. A changed ledger row re-reads its accounts from its date (or the window's start)
 * onward, since a backdated row shifts later running balances; a label row re-reads its ledger rows' days. A
 * change to accounts, holders, statement context or the R008 cutover, a missing ledger row, an unmapped table or
 * more than CASH_ACCOUNT_DAY_LIMIT account-days walks. */
export async function resolveCashScope(client,changes){
 const keys=new Map();for(const {table,key} of changes){if(!keys.has(table))keys.set(table,new Set());keys.get(table).add(key)}
 const shift=[],labels=[];let ledgerIds=[];
 for(const [table,set] of keys){
  if(cashWalkTables.includes(table))return null;
  if(cashOverviewTables.includes(table))continue;
  const ids=sortIds(set);
  if(table==='Cash Ledger'){const rows=(await client.query(`SELECT ${ledgerColumns} FROM public."Cash Ledger" g WHERE g."Row ID"=ANY($1::text[])`,[ids])).rows;if(rows.length!==ids.length)return null;shift.push(...rows);ledgerIds=ids;continue}
  const sql=cashLabelSql[table];if(!sql)return null;
  labels.push(...(await client.query(sql,[ids])).rows);
 }
 const accounts=sortIds([...shift,...labels].flatMap(row=>[row.from,row.to]));
 const window=accounts.length?(await client.query(`SELECT "Ref Cash Account" AS account,"Statement Date"::text AS day FROM public."Cash Account Daily Summary Recent" WHERE "Ref Cash Account"=ANY($1::text[]) ORDER BY "Ref Cash Account" COLLATE "C","Statement Date"`,[accounts])).rows:[];
 const days=new Map();for(const row of window){if(!days.has(row.account))days.set(row.account,[]);days.get(row.account).push(row.day)}
 const from={},wanted=new Set();
 for(const row of shift)for(const account of [row.from,row.to]){if(!account)continue;const list=days.get(account)??[];if(!list.length)continue;const start=row.day>list[0]?row.day:list[0];if(from[account]===undefined||start<from[account])from[account]=start}
 for(const [account,start] of Object.entries(from))for(const day of days.get(account)??[])if(day>=start)wanted.add(JSON.stringify([account,day]));
 for(const row of labels)for(const account of [row.from,row.to])if(account&&(days.get(account)??[]).includes(row.day))wanted.add(JSON.stringify([account,row.day]));
 if(wanted.size>CASH_ACCOUNT_DAY_LIMIT)return null;
 const accountDays=[...wanted].map(key=>JSON.parse(key)).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0);
 return {accountDays,from,ledgerIds};
}
/** overview and preferences whole, and every re-read account-day statement exactly as the walk writes it. */
export async function readCashTargeted(client,actor,_stamp,{accountDays}){
 const patches=rowBudget();
 patches.push(replace('overview',await readCashOverview(client)),replace('preferences',await readPreferences(client,actor)));
 for(const [accountId,date] of accountDays){
  const key=JSON.stringify([accountId,date]);let cursor=null;
  for(let page=0;;page++){
   if(page>=200)throw Error('source_unavailable');
   const value=await readCashStatement(client,{accountId,date,limit:100,cursor}),{items,nextCursor,...metadata}=value;
   patches.push(...(cursor?[]:[replace('statementsByKey',{...metadata,items:[],nextCursor:null},[key])]),append('statementsByKey',items,[key,'items']));
   if(!nextCursor)break;cursor=nextCursor;
  }
 }
 return patches.list;
}
