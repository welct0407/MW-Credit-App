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
const merge=(key,value,path)=>({key,mode:'merge',value,...(path?{path}:{})});
const result=(patches,state=null)=>({patches,state});
const one=(key,read)=>async(c,a,stamp)=>result([replace(key,await read(c,a,stamp))]);
const text=value=>value===null||value===undefined?null:typeof value==='string'&&value.length<=8192?value:(()=>{throw Error('invalid_request')})();
const object=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))throw Error('invalid_request');return value};
const page=(key,read,path)=>async(c,a,stamp,state)=>{const value=await read(c,text(state),a,stamp);if(value.collectionError)throw Error(value.collectionError);return result([append(key,value.items,path)],value.nextCursor??null)};

// R064 Phase 1 packing: larger deterministic pages reduce HTTP round trips; the
// byte boundary between pages still bounds each response.
async function idRows(c,table,after,limit=64){if(after!==null&&after!==undefined&&!validBorrowerId(after))throw Error('invalid_request');return(await c.query(`SELECT "Row ID" id FROM public."${table}" WHERE ($1::text IS NULL OR "Row ID" COLLATE "C">$1 COLLATE "C") ORDER BY "Row ID" COLLATE "C" LIMIT $2`,[after??null,limit+1])).rows;}
function details(key,table,read,limit=64){return async(c,a,stamp,state)=>{
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
const draft=scope=>parents('Borrowers',async(c,id,cursor,a,stamp)=>{
 let value;try{value=await readOwnerPaymentDraft(c,id,{scope,limit:100,cursor})}catch(error){if(error.message!=='Draft unavailable')throw error;value={draftError:'source_unavailable',status:503}}
 if(value.draftError)return {patches:[replace('paymentDrafts',value,[id,scope])]};
 const {charges,nextCursor,...metadata}=value;
 return {patches:[...(cursor?[]:[replace('paymentDrafts',{...metadata,charges:[],nextCursor:null},[id,scope])]),append('paymentDrafts',charges,[id,scope,'charges'])],cursor:nextCursor};
});

const recordPhases=[
 details('borrowers','Borrowers',readBorrowerRecord),details('loans','Loans',readLoanRecord),details('charges','Charges',readChargeRecord),details('payments','Payments',readPaymentRecord,32),details('expenses','Business Expenses',readExpenseRecord),
 async(c,a,stamp,state)=>{const rows=(await c.query(`SELECT "Row ID" id,"Borrower Name" name,coalesce("Borrower Name",'')||' - '||coalesce("Description",'') AS "borrowerDisplayName","Description" description,"Total Interest Earned"::text AS "totalProfitEarned","Creation Date"::text AS "createdDate","Has Active Loan" AS "hasActiveLoan","Total Outstanding Principal"::text AS "outstandingPrincipal","Borrower Note" note FROM public."Borrowers" WHERE "Hidden Flag" IS NOT TRUE AND ($1::text IS NULL OR "Row ID" COLLATE "C">$1 COLLATE "C") ORDER BY "Row ID" COLLATE "C" LIMIT 129`,[text(state)])).rows;return result([append('borrowerList',rows.slice(0,128))],rows.length>128?rows[127].id:null)},
 async(c,a,stamp,state)=>{const rows=(await c.query(`SELECT ${loanColumns} FROM public."Loans" l JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" WHERE b."Hidden Flag" IS NOT TRUE AND ($1::text IS NULL OR l."Row ID" COLLATE "C">$1 COLLATE "C") ORDER BY l."Row ID" COLLATE "C" LIMIT 129`,[text(state)])).rows;return result([append('borrowerLoans',rows.slice(0,128).map(row=>projectLoan(row,row.borrowerId)))],rows.length>128?rows[127].id:null)},
 page('loanList',(c,cursor)=>readRecordList(c,'loans',{limit:100,cursor})),relation('charges'),relation('payments'),draft('due'),draft('future'),draft('all'),
 async(c,a,stamp,state)=>{const after=state??{borrower:'',month:''};if(typeof after.borrower!=='string'||typeof after.month!=='string')throw Error('invalid_request');const rows=(await c.query(`WITH groups AS (SELECT "Ref Borrower" AS "borrowerId",to_char("Payment Date",'YYYY-MM') AS month,sum("Amount Received")::numeric::text AS "amountReceived",count(*)::integer AS count FROM public."Payments" GROUP BY "Ref Borrower",to_char("Payment Date",'YYYY-MM')) SELECT * FROM groups WHERE ($3::boolean OR (coalesce("borrowerId",'') COLLATE "C",coalesce(month,'') COLLATE "C")>($1 COLLATE "C",$2 COLLATE "C")) ORDER BY coalesce("borrowerId",'') COLLATE "C",coalesce(month,'') COLLATE "C" LIMIT 129`,[after.borrower,after.month,state===null])).rows;return result([append('paymentMonths',rows.slice(0,128))],rows.length>128?{borrower:rows[127].borrowerId??'',month:rows[127].month??''}:null)},
 async(c,a,stamp,state)=>{const rows=(await c.query(`SELECT p."Ref Borrower" AS "borrowerId",(SELECT j.request_id::text FROM public.pwa_payment_commands j WHERE j.payment_id=p."Row ID" AND j.actor_issuer=$1 AND j.actor_subject=$2 AND j.actor_partner_id=$3 LIMIT 1) AS "requestId",p."Row ID" id,p."Status" status,p."Payment Date"::text AS "paymentDate",p."Amount Received"::numeric::text AS "amountReceived",p."Posted Amount"::text AS "postedAmount",p."Notes" notes,CASE WHEN nullif(btrim(p."Uploaded Receipt"),'') IS NULL THEN NULL ELSE 'attached' END AS "receiptReference",p."Uploaded Receipt At"::text AS "receiptAt",a."Account Label" AS "accountLabel" FROM public."Payments" p LEFT JOIN public."Cash Accounts" a ON a."Row ID"=p."Ref Received By Cash Account" WHERE ($4::text IS NULL OR p."Row ID" COLLATE "C">$4 COLLATE "C") ORDER BY p."Row ID" COLLATE "C" LIMIT 129`,[a.issuer,a.subject,a.partnerId,text(state)])).rows;return result([append('paymentHistory',rows.slice(0,128))],rows.length>128?rows[127].id:null)},
 async(c,a,stamp)=>{const accounts=(await c.query(`SELECT a."Row ID" id,a."Account Label" label,a."Default Account" AS "isDefault",a."Ref Cash Holder" AS "holderId",a."Active" active,h."Active" AS "holderActive" FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE AND h."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`)).rows;return result([replace('borrowerOptions',{referrers:[],accounts:accounts.map(({id,label})=>({id,label}))}),replace('loanOptions',{accounts:accounts.filter(row=>row.holderId==='ch:lisa'),businessDate:stamp.businessDate})])},
 async(c,a,stamp,state)=>{const rows=(await c.query(`SELECT "Row ID" id,"Borrower Name" label,"Description" description FROM public."Borrowers" WHERE ($1::text IS NULL OR "Row ID" COLLATE "C">$1 COLLATE "C") ORDER BY "Row ID" COLLATE "C" LIMIT 129`,[text(state)])).rows;return result([append('borrowerOptions',rows.slice(0,128),['referrers'])],rows.length>128?rows[127].id:null)},
 one('expenseOptions',readExpenseOptions),one('dashboard',readDashboard)
];

async function upcomingDetail(c,a,stamp,state){
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
async function borrowerUpcomingMetadata(c,a,stamp,state){
 const rows=(await c.query(`${borrowerUpcomingCte} SELECT * FROM upcoming_context WHERE ($3::text IS NULL OR id COLLATE "C">$3 COLLATE "C") ORDER BY id COLLATE "C" LIMIT 129`,[stamp.businessDate,null,text(state)])).rows,patches=[];
 for(const row of rows.slice(0,128))for(const scope of ['borrower','collection'])if(row[scope==='borrower'?'directory':'collection']){
  const error=upcomingContextError(row,stamp),context={...stamp,timezone:'Asia/Bangkok',horizonEnd:row.horizonEnd,reviewRequired:row.reviewLoans>0};
  if(!error&&row.dates.some(date=>!validBorrowerId(date.id)||!validUpcomingDate(date.dueDate)||date.dueDate<=stamp.businessDate||date.dueDate>row.horizonEnd||(date.totalCharge!==null&&(typeof date.totalCharge!=='string'||! /^-?\d+(?:\.\d+)?$/.test(date.totalCharge)))))throw Error('source_unavailable');
  patches.push(replace('borrowerUpcomingByKey',error?{borrowerId:row.id,scope,error}:{borrowerId:row.id,scope,...context,items:row.dates,previews:row.dates.map(date=>({ok:true,source:'dev',...context,dueDate:date.dueDate,totalCharge:date.totalCharge,items:[],nextCursor:null}))},[JSON.stringify([scope,row.id])]));
 }
 return result(patches,rows.length>128?rows[127].id:null);
}
async function borrowerUpcomingEvents(c,a,stamp,state){
 const after=state??{loanId:null,id:null};if(state){object(state,['loanId','id']);if(!validBorrowerId(state.loanId)||!validBorrowerId(state.id))throw Error('invalid_request')}
 const rows=(await c.query(`${borrowerUpcomingCte} SELECT ctx.*,e."Row ID" AS "eventId",e."Ref Loan" AS "loanId",e."Due Date"::text AS "dueDate",e."Principal Remaining"::text AS "principalRemaining",e."Interest Remaining"::text AS "interestRemaining",e."Amount Remaining"::text AS "amountRemaining",e."Basis" AS basis,b."Borrower Name" AS name,b."Description" AS description,l."Principal Amount"::numeric::text AS principal,l."Loan Date"::text AS "loanDate",l."Original Daily Interest Rate"::text AS rate FROM forecast_events e JOIN upcoming_context ctx ON ctx.id=e."Ref Borrower" JOIN public."Loans" l ON l."Row ID"=e."Ref Loan" AND l."Ref Borrowers"=ctx.id JOIN public."Borrowers" b ON b."Row ID"=ctx.id WHERE ($3::text IS NULL OR (e."Ref Loan" COLLATE "C",e."Row ID" COLLATE "C")>($3 COLLATE "C",$4 COLLATE "C")) ORDER BY e."Ref Loan" COLLATE "C",e."Row ID" COLLATE "C" LIMIT 129`,[stamp.businessDate,null,after.loanId,after.id])).rows,groups=new Map();
 for(const row of rows.slice(0,128)){if(upcomingContextError(row,stamp))continue;const index=row.dates.findIndex(date=>date.dueDate===row.dueDate);if(index<0)throw Error('source_unavailable');const item=projectUpcomingEvent({...row,id:row.eventId});for(const scope of ['borrower','collection'])if(row[scope==='borrower'?'directory':'collection']){const key=JSON.stringify([scope,row.id]),groupKey=JSON.stringify([key,index]);if(!groups.has(groupKey))groups.set(groupKey,{key,index,items:[]});groups.get(groupKey).items.push(item)}}
 return result([...groups.values()].map(({key,index,items})=>append('borrowerUpcomingByKey',items,[key,'previews',String(index),'items'])),rows.length>128?{loanId:rows[127].loanId,id:rows[127].eventId}:null);
}
const collectionPhases=[
 page('items',(c,cursor)=>readCollection(c,{limit:100,after:decodeCollectionCursor(cursor,'collection')})),
 async(c,a,stamp,state)=>{const rows=(await c.query(`${collectionCte} SELECT borrower_id,id,loan_id,payment_status,borrower_name,borrower_description,principal_amount,loan_date,original_rate,charge_date::text AS charge_date,payment_date::text AS payment_date,amount_remaining::text AS amount_remaining,total_paid::text AS total_paid,received_today::text AS received_today FROM eligible WHERE ($3::text IS NULL OR id COLLATE "C">$3 COLLATE "C") ORDER BY id COLLATE "C" LIMIT 129`,[stamp.businessDate,null,text(state)])).rows;return result([append('charges',rows.slice(0,128).map(row=>({borrowerId:row.borrower_id,...projectCollectionCharge(row)})))],rows.length>128?rows[127].id:null)},
 async(c,a,stamp,state)=>{const value=await readStandaloneUpcoming(c,{limit:100,cursor:text(state)}),{items,nextCursor,...metadata}=value;const {dateTotals,...context}=metadata;return result([...(state?[]:[replace('upcoming',{...metadata,items:[],nextCursor:null})]),append('upcoming',items,['items']),...items.map(row=>replace('upcomingDetailsByKey',{...context,borrowerId:row.borrowerId,borrowerLabel:row.label,dueDate:row.dueDate,totalCharge:row.totalCharge,items:[],nextCursor:null},[JSON.stringify([row.borrowerId,row.dueDate])]))],nextCursor)},
 upcomingDetail,borrowerUpcomingMetadata,borrowerUpcomingEvents,
 async(c,a,stamp,state)=>{const rows=(await c.query(`${collectionCte} SELECT p."Row ID" id,p."Ref Borrower" AS "borrowerId",p."Payment Date"::text AS "paymentDate",p."Amount Received"::numeric::text amount,(nullif(btrim(p."Uploaded Receipt"),'') IS NOT NULL) AS "manualReceiptPresent",(nullif(btrim(p."Receipt Image"),'') IS NOT NULL) AS "agentReceiptPresent",(CASE WHEN nullif(btrim(p."Uploaded Receipt"),'') IS NOT NULL THEN p."Uploaded Receipt At" ELSE p."Receipt Received At" END)::text AS "receiptAt",array_agg(DISTINCT e.id) AS "chargeIds" FROM public."Payments" p JOIN public."Payment Allocations" a ON a."Ref Payment"=p."Row ID" JOIN eligible e ON e.id=a."Ref Charge" AND e.borrower_id=p."Ref Borrower" WHERE p."Status"='Posted' AND a."Allocated Amount"::numeric>0 AND ($3::text IS NULL OR p."Row ID" COLLATE "C">$3 COLLATE "C") GROUP BY p."Row ID" ORDER BY p."Row ID" COLLATE "C" LIMIT 129`,[stamp.businessDate,null,text(state)])).rows;return result([append('receipts',rows.slice(0,128))],rows.length>128?rows[127].id:null)}
];

async function statement(c,a,stamp,input){
 const state=object(input??{afterAccount:null,afterDate:null,current:null,cursor:null},['afterAccount','afterDate','current','cursor']);let current=state.current;
 if((state.afterAccount!==null&&!validBorrowerId(state.afterAccount))||(state.afterDate!==null&&!validUpcomingDate(state.afterDate))||(current&&(!validBorrowerId(current.accountId)||!validUpcomingDate(current.date))))throw Error('invalid_request');
 if(!current){current=(await c.query(`SELECT "Ref Cash Account" AS "accountId","Statement Date"::text AS date FROM public."Cash Account Daily Summary Recent" WHERE ($1::text IS NULL OR ("Ref Cash Account" COLLATE "C","Statement Date")>($1 COLLATE "C",$2::date)) ORDER BY "Ref Cash Account" COLLATE "C","Statement Date" LIMIT 1`,[text(state.afterAccount),text(state.afterDate)])).rows[0];if(!current)return result([])}
 const value=await readCashStatement(c,{...current,limit:100,cursor:text(state.cursor)}),key=JSON.stringify([current.accountId,current.date]),{items,nextCursor,...metadata}=value;
 const patches=[...(state.cursor?[]:[replace('statementsByKey',{...metadata,items:[],nextCursor:null},[key])]),append('statementsByKey',items,[key,'items'])];
 return result(patches,nextCursor?{...state,current,cursor:nextCursor}:{afterAccount:current.accountId,afterDate:current.date,current:null,cursor:null});
}
const cashPhases=[one('overview',readCashOverview),one('preferences',readPreferences),statement];
const managementKinds=['cash-accounts','cash-holders','partners','contributions','settlements','cash-movements','assessments','analytics-validation'];
const managementPhases=managementKinds.map(kind=>async(c,a,stamp,state)=>{
 const options={limit:kind==='partners'?16:100,cursor:text(state)},value=kind==='assessments'?await readManagementAssessments(c,options):kind==='analytics-validation'?await readManagementAnalytics(c,options):['contributions','settlements','cash-movements'].includes(kind)?await readManagementFinancial(c,kind,options):await readManagement(c,kind,options);
 const batch=bulkReadClient(c),items=kind==='partners'?await Promise.all(value.items.map(async row=>(await readManagement(batch,kind,{id:row.id})).item)):value.items;
 return result([append('sections',items,[kind])],value.nextCursor);
});
managementPhases.push(parents('Cash Accounts',async(c,id)=>({patches:[append('openings',[(await readManagementOpenings(c,{id})).item].filter(Boolean))]})),one('position',readManagementPosition),one('analyticsOverview',readAnalyticsOverview));
for(const metric of ['distribution','profit30','dailyInterest','projected','daily','weekly','monthly','outstanding30','profit30Line'])managementPhases.push(async(c,a,stamp,state)=>{const value=await readAnalyticsChart(c,{metric,limit:100,cursor:text(state)});if(value.truncated)throw Error('source_unavailable');const {items,nextCursor,...metadata}=value;return result([...(state?[]:[replace('charts',{...metadata,items:[],nextCursor:null},[metric])]),append('charts',items,[metric,'items'])],nextCursor??null)});

/** Bounded resumable traversal. Every request retains the ordinary transaction,
 * owner checks, per-item versions and provider calculations. */
/** One need request may name at most this many content hashes (api/offline-dataset-delta.mjs);
 * a response therefore never carries more values than that. */
export const MAX_CHUNK_VALUES=2048;
const patchValues=patches=>patches.reduce((sum,patch)=>sum+(patch.mode==='append'?patch.value.length:1),0);
export async function readOfflineDatasetChunk(client,actor,domain,cursor=null,{singlePage=false,deterministicPages=null,maxValues=MAX_CHUNK_VALUES}={}){
 const phases={records:recordPhases,collection:collectionPhases,cash:cashPhases,management:managementPhases}[domain];if(!phases)throw Error('invalid_request');
 const stamp=(await client.query(`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`)).rows[0];
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
 return {schemaVersion:2,domain,generation:traversal.generation,startedAt:traversal.startedAt,...stamp,patches,nextCursor:complete?null:encodeTraversalCursor(next),complete,progress:{completed:next.phase,total:phases.length},chunksCompleted:next.done};
}
