import {readBorrowerRecord} from './borrowers.mjs';
import {readLoanRecord} from './loans.mjs';
import {readChargeRecord} from './charges.mjs';
import {readPaymentRecord} from './payments.mjs';
import {readExpenseRecord,readExpenseOptions} from './expenses.mjs';
import {readRecordList} from './record-lists.mjs';
import {readLoanRelated} from './loan-related.mjs';
import {readOwnerPaymentDraft} from '../payment-command/draft.mjs';
import {readDashboard} from './dashboard.mjs';
import {readCashOverview,readCashStatement} from './cash.mjs';
import {readPreferences} from './preferences.mjs';
import {readManagement} from './management.mjs';
import {readManagementFinancial} from './management-financial.mjs';
import {readManagementAssessments} from './management-assessments.mjs';
import {readManagementAnalytics,readAnalyticsOverview,readAnalyticsChart} from './management-analytics.mjs';
import {readManagementPosition} from './management-position.mjs';
import {readManagementOpenings} from './management-openings.mjs';
import {collectionCte,collectionQualitySql,projectCollectionCharge,readCollection} from '../api/collection-read-contract.mjs';
import {readUpcoming,decodeUpcomingCursor} from '../api/upcoming-read-contract.mjs';
import {readStandaloneUpcoming} from './upcoming.mjs';
import {loanColumns,projectLoan} from '../api/loan-read-contract.mjs';

export const offlineDomains=Object.freeze(['records','collection','cash','management']);

/** Internal readers only: batch identical SELECT templates without changing their
 * projections, nullable values, ordering, or financial SQL providers. Each group
 * is one indexed lateral SQL read, rather than one database roundtrip per row. */
export function bulkReadClient(client){
 let pending=[],scheduled=false;
 async function flush(){
  const queue=pending;pending=[];scheduled=false;
  const groups=new Map();
  for(const item of queue){const key=item.sql+'\0'+item.params.map(value=>value===null?'null':typeof value).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
  for(const group of groups.values()){
   try{
    const {sql,params}=group[0];
    if(!params.length){const result=await client.query(sql);for(const item of group)item.resolve({rows:structuredClone(result.rows),rowCount:result.rowCount});continue;}
    const replaced=sql.replace(/\$(\d+)\b/g,(_,number)=>{const index=Number(number)-1;if(index>=params.length)throw Error('Invalid internal bulk parameter');const type=typeof params[index];return `(batch.args->>${index})${type==='number'?'::integer':type==='boolean'?'::boolean':''}`});
    const result=await client.query(`SELECT batch.ordinality AS "batchIndex",(SELECT coalesce(jsonb_agg(to_jsonb(source)),'[]'::jsonb) FROM (${replaced}) source) AS values FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS batch(args,ordinality)`,[JSON.stringify(group.map(item=>item.params))]);
    const rows=group.map(()=>[]);for(const row of result.rows)rows[Number(row.batchIndex)-1]=row.values;
    group.forEach((item,index)=>item.resolve({rows:rows[index],rowCount:rows[index].length}));
   }catch(error){for(const item of group)item.reject(error)}
  }
 }
 return {query(sql,params=[]){
  if(typeof sql!=='string'||!/^\s*(SELECT|WITH)\b/i.test(sql)||/;|\b(?:INSERT|UPDATE|DELETE|CALL|COPY|FOR\s+UPDATE)\b/i.test(sql)||params.some(value=>value!==null&&!['string','boolean','number'].includes(typeof value)))return Promise.reject(Error('Invalid internal bulk read'));
  return new Promise((resolve,reject)=>{pending.push({sql,params,resolve,reject});if(!scheduled){scheduled=true;queueMicrotask(()=>void flush())}});
 }};
}
async function bulkMap(client,values,read){const result=[],batched=bulkReadClient(client);for(let start=0;start<values.length;start+=128)result.push(...await Promise.all(values.slice(start,start+128).map(value=>read(batched,value))));return result;}
async function allPages(read){const seen=new Set(),items=[];let cursor=null,first;do{const page=await read(cursor);if(!page||page.collectionError||!Array.isArray(page.items)||page.truncated)throw Error('Offline dataset source unavailable');first??=page;items.push(...page.items);cursor=page.nextCursor??null;if(cursor){if(seen.has(cursor))throw Error('Offline dataset cursor cycle');seen.add(cursor)}}while(cursor);return {...first,items,nextCursor:null};}
const ids=async(client,table)=>(await client.query(`SELECT "Row ID" id FROM public."${table}" ORDER BY "Row ID" COLLATE "C"`)).rows.map(row=>row.id);
const receiptMarker=item=>({...item,receiptReference:item.receiptReference?'attached':null});

async function records(client,actor,stamp){
 const borrowers=await bulkMap(client,await ids(client,'Borrowers'),readBorrowerRecord);
 const loans=await bulkMap(client,await ids(client,'Loans'),readLoanRecord);
 const charges=await bulkMap(client,await ids(client,'Charges'),readChargeRecord);
 const payments=(await bulkMap(client,await ids(client,'Payments'),readPaymentRecord)).map(receiptMarker);
 const expenses=await bulkMap(client,await ids(client,'Business Expenses'),readExpenseRecord);
 for(const item of [...borrowers,...loans,...charges,...payments,...expenses])if(item)Object.assign(item,stamp);
 const borrowerLoans=(await client.query(`SELECT ${loanColumns} FROM public."Loans" l JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" WHERE b."Hidden Flag" IS NOT TRUE`)).rows.map(row=>projectLoan(row,row.borrowerId));
 const borrowerList=(await client.query(`SELECT "Row ID" id,"Borrower Name" name,coalesce("Borrower Name",'')||' - '||coalesce("Description",'') AS "borrowerDisplayName","Description" description,"Total Interest Earned"::text AS "totalProfitEarned","Creation Date"::text AS "createdDate","Has Active Loan" AS "hasActiveLoan","Total Outstanding Principal"::text AS "outstandingPrincipal","Borrower Note" note FROM public."Borrowers" WHERE "Hidden Flag" IS NOT TRUE ORDER BY CASE WHEN "Has Active Loan" IS TRUE THEN 0 WHEN "Has Active Loan" IS FALSE THEN 1 ELSE 2 END,"Creation Date" ASC NULLS LAST,"Row ID" COLLATE "C"`)).rows;
 const loanRelated=Object.fromEntries(await bulkMap(client,loans,async(c,loan)=>[loan.id,{charges:(await allPages(cursor=>readLoanRelated(c,loan.id,'charges',{limit:100,cursor}))).items,payments:(await allPages(cursor=>readLoanRelated(c,loan.id,'payments',{limit:100,cursor}))).items}]));
 const paymentDrafts=Object.fromEntries(await bulkMap(client,borrowers,async(c,borrower)=>{
  const scopes={};for(const scope of ['due','future','all']){let cursor=null,first,charges=[];const seen=new Set();do{const page=await readOwnerPaymentDraft(c,borrower.id,{scope,limit:100,cursor});if(page.draftError){first=page;break;}first??=page;charges.push(...page.charges);cursor=page.nextCursor;if(cursor){if(seen.has(cursor))throw Error('Offline draft cursor cycle');seen.add(cursor)}}while(cursor);scopes[scope]=first.draftError?first:{...first,charges,nextCursor:null};}return [borrower.id,scopes];
 }));
 const loanList=(await allPages(cursor=>readRecordList(client,'loans',{limit:100,cursor}))).items;
 const paymentMonths=(await client.query(`SELECT "Ref Borrower" AS "borrowerId",to_char("Payment Date",'YYYY-MM') AS month,sum("Amount Received")::numeric::text AS "amountReceived",count(*)::integer AS count FROM public."Payments" GROUP BY "Ref Borrower",to_char("Payment Date",'YYYY-MM')`)).rows;
 const paymentHistory=(await client.query(`SELECT p."Ref Borrower" AS "borrowerId",(SELECT j.request_id::text FROM public.pwa_payment_commands j WHERE j.payment_id=p."Row ID" AND j.actor_issuer=$1 AND j.actor_subject=$2 AND j.actor_partner_id=$3 LIMIT 1) AS "requestId",p."Row ID" id,p."Status" status,p."Payment Date"::text AS "paymentDate",p."Amount Received"::numeric::text AS "amountReceived",p."Posted Amount"::text AS "postedAmount",p."Notes" notes,CASE WHEN nullif(btrim(p."Uploaded Receipt"),'') IS NULL THEN NULL ELSE 'attached' END AS "receiptReference",p."Uploaded Receipt At"::text AS "receiptAt",a."Account Label" AS "accountLabel" FROM public."Payments" p LEFT JOIN public."Cash Accounts" a ON a."Row ID"=p."Ref Received By Cash Account" ORDER BY p."Payment Date" DESC NULLS LAST,p."Row ID" COLLATE "C"`,[actor.issuer,actor.subject,actor.partnerId])).rows;
 const accounts=(await client.query(`SELECT a."Row ID" id,a."Account Label" label,a."Default Account" AS "isDefault",a."Ref Cash Holder" AS "holderId",a."Active" active,h."Active" AS "holderActive" FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE AND h."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`)).rows;
 return {borrowers,loans,charges,payments,expenses,borrowerList,borrowerLoans,loanList,loanRelated,paymentDrafts,paymentMonths,paymentHistory,borrowerOptions:{referrers:borrowers.map(row=>({id:row.id,label:row.name,description:row.description})),accounts:accounts.map(({id,label})=>({id,label}))},loanOptions:{accounts:accounts.filter(row=>row.holderId==='ch:lisa'),businessDate:stamp.businessDate},expenseOptions:await readExpenseOptions(client),dashboard:await readDashboard(client)};
}

async function collection(client,stamp){
 const businessDate=stamp.businessDate;
 if((await client.query(collectionQualitySql,[null])).rows[0]?.invalid!==false)throw Error('Collection source unavailable');
 const summary=await readCollection(client,{limit:2147483646,after:null});if(summary.collectionError)throw Error('Collection source unavailable');
 const charges=(await client.query(`${collectionCte} SELECT borrower_id,id,loan_id,payment_status,borrower_name,borrower_description,principal_amount,loan_date,original_rate,charge_date::text AS charge_date,payment_date::text AS payment_date,amount_remaining::text AS amount_remaining,total_paid::text AS total_paid,received_today::text AS received_today FROM eligible ORDER BY charge_date DESC,id COLLATE "C"`,[businessDate,null])).rows.map(row=>({borrowerId:row.borrower_id,...projectCollectionCharge(row)}));
 const upcoming=await allPages(cursor=>readStandaloneUpcoming(client,{limit:100,cursor}));
 const upcomingDetails=await bulkMap(client,upcoming.items,(c,row)=>allPages(cursor=>readStandaloneUpcoming(c,{borrowerId:row.borrowerId,dueDate:row.dueDate,businessDate,limit:100,cursor})));
 const scopes=[...(await client.query('SELECT "Row ID" id FROM public."Borrowers" WHERE "Hidden Flag" IS NOT TRUE')).rows.map(row=>({borrowerId:row.id,scope:'borrower'})),...summary.items.map(row=>({borrowerId:row.id,scope:'collection'}))];
 const borrowerUpcoming=await bulkMap(client,scopes,async(c,scope)=>{
  const value=await readUpcoming(c,{...scope,businessDate});if(value.collectionError)return {...scope,error:value.collectionError};
  const previews=[];for(const item of value.items)previews.push(await allPages(cursor=>readUpcoming(c,{...scope,businessDate,dueDate:item.dueDate,limit:100,after:cursor?decodeUpcomingCursor(cursor,scope.borrowerId,businessDate,item.dueDate):null})));
  return {...scope,...value,previews};
 });
 const receipts=(await client.query(`${collectionCte} SELECT p."Row ID" id,p."Ref Borrower" AS "borrowerId",p."Payment Date"::text AS "paymentDate",p."Amount Received"::numeric::text amount,(nullif(btrim(p."Uploaded Receipt"),'') IS NOT NULL) AS "manualReceiptPresent",(nullif(btrim(p."Receipt Image"),'') IS NOT NULL) AS "agentReceiptPresent",(CASE WHEN nullif(btrim(p."Uploaded Receipt"),'') IS NOT NULL THEN p."Uploaded Receipt At" ELSE p."Receipt Received At" END)::text AS "receiptAt",array_agg(DISTINCT e.id) AS "chargeIds" FROM public."Payments" p JOIN public."Payment Allocations" a ON a."Ref Payment"=p."Row ID" JOIN eligible e ON e.id=a."Ref Charge" AND e.borrower_id=p."Ref Borrower" WHERE p."Status"='Posted' AND a."Allocated Amount"::numeric>0 GROUP BY p."Row ID" ORDER BY p."Payment Date" DESC NULLS LAST,p."Row ID" COLLATE "C" DESC`,[businessDate,null])).rows;
 return {items:summary.items,charges,upcoming,upcomingDetails,borrowerUpcoming,receipts};
}

async function cash(client,actor){
 const overview=await readCashOverview(client),preferences=await readPreferences(client,actor);
 const available=(await client.query(`SELECT "Ref Cash Account" AS "accountId","Statement Date"::text AS date FROM public."Cash Account Daily Summary Recent" ORDER BY "Ref Cash Account" COLLATE "C","Statement Date"`)).rows;
 const statements=await bulkMap(client,available,(c,scope)=>allPages(cursor=>readCashStatement(c,{...scope,limit:100,cursor})));
 return {overview,preferences,statements};
}

async function management(client){
 const sections={};
 for(const kind of ['cash-accounts','cash-holders','partners','contributions','settlements','cash-movements','assessments','analytics-validation']){
  const read=(c,options)=>kind==='assessments'?readManagementAssessments(c,options):kind==='analytics-validation'?readManagementAnalytics(c,options):['contributions','settlements','cash-movements'].includes(kind)?readManagementFinancial(c,kind,options):readManagement(c,kind,options);
  const rows=(await allPages(cursor=>read(client,{limit:100,cursor}))).items;
  sections[kind]=kind==='partners'?await bulkMap(client,rows,async(c,row)=>(await read(c,{id:row.id})).item):rows;
 }
 const openings=await bulkMap(client,sections['cash-accounts'],async(c,row)=>(await readManagementOpenings(c,{id:row.id})).item);
 const charts={};for(const metric of ['distribution','profit30','dailyInterest','projected','daily','weekly','monthly','outstanding30','profit30Line'])charts[metric]=await allPages(cursor=>readAnalyticsChart(client,{metric,limit:100,cursor}));
 return {sections,openings,position:await readManagementPosition(client),analyticsOverview:await readAnalyticsOverview(client),charts};
}

/** One complete domain is published only after every source read succeeds. */
export async function readOfflineDataset(client,actor,domain){
 if(!offlineDomains.includes(domain))throw Error('invalid_request');
 const stamp=(await client.query(`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`)).rows[0];
 const data=await ({records:()=>records(client,actor,stamp),collection:()=>collection(client,stamp),cash:()=>cash(client,actor),management:()=>management(client)})[domain]();
 return {schemaVersion:1,domain,...stamp,complete:true,data};
}
