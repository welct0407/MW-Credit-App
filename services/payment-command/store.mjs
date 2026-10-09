import {readManagementPosition} from '../business/management-position.mjs';
import {readManagementAnalytics,readAnalyticsOverview,readAnalyticsChart} from '../business/management-analytics.mjs';
import {readManagementOpenings} from '../business/management-openings.mjs';
import {readManagementAssessments} from '../business/management-assessments.mjs';
import {readManagementFinancial} from '../business/management-financial.mjs';
import {readManagement} from '../business/management.mjs';
import {readRecordList} from '../business/record-lists.mjs';
import {readCollectionReceipts} from '../business/collection-receipts.mjs';
import {readStandaloneUpcoming} from '../business/upcoming.mjs';
import {readDashboard} from '../business/dashboard.mjs';
import {readLoanRelated} from '../business/loan-related.mjs';
import {readPreferences} from '../business/preferences.mjs';
import {readCashOverview,readCashStatement} from '../business/cash.mjs';
import {readExpenseRecord,readExpenseOptions,readExpensePage} from '../business/expenses.mjs';
import {readPaymentRecord,readPaymentCorrectionPreview} from '../business/payments.mjs';
import {readChargeRecord} from '../business/charges.mjs';
import {canonicalOperation,operationIdentity} from '../contracts/operation-command.mjs';
import {readLoanRecord} from '../business/loans.mjs';
import {readBorrowerRecord,mutateBorrowerRecord,validBorrowerId} from '../business/borrowers.mjs';
import { createDevCommandConnectionGuard } from './dev-target.mjs';
import {readCommandResult,readBorrowerPaymentHistory} from './result.mjs';
import { readPaymentDraft, readOwnerPaymentDraft } from './draft.mjs';
import { applicationConnectionGuard } from './application-target.mjs';
import { canonicalCommand, canonicalAllocationPlan, canonicalActor, canonicalReceipt, commandIdentity } from '../contracts/payment-command.mjs';
import { DEV_PROJECT, OWNER_EMAIL } from '../api/dev-read-config.mjs';
const issuer = `https://securetoken.google.com/${DEV_PROJECT}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure = (status, code) => ({ ok: false, status, code });

/** DISPOSABLE candidate only. No ambient connection/config, service launcher or live permission. */
function buildStore({ pool, guardConnection, resolveReceipt, fixture, receiptAdapter, sourceReceiptReader, ownerTesting=false }) {
  async function run(principal, operation, readonly = false) {
    if (!principal?.ok || principal.email !== OWNER_EMAIL || typeof principal.subject !== 'string' || !principal.subject) return failure(403, 'access_denied');
    let client, attempted = false, commitStarted = false, quarantine = false;
    const rollback = async () => { try { await client?.query('ROLLBACK'); } catch (error) { quarantine = true; throw error; } };
    try {
      client = await pool.connect();
      await client.query(readonly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      await client.query("SET LOCAL statement_timeout='10000ms'");
      await client.query("SET LOCAL lock_timeout='3000ms'");
      await guardConnection(client);
      const rows = (await client.query('SELECT "Row ID" AS id FROM public."Partners" WHERE lower(btrim("Login Email"))=$1 LIMIT 2', [principal.email])).rows;
      if (rows.length !== 1) { await rollback(); return failure(403, 'access_denied'); }
      const actor = canonicalActor({ issuer, subject: principal.subject, partnerId: rows[0].id, loginEmail: principal.email });
      const result = await operation(client, actor, () => { attempted = true; });
      if (!result.ok) { await rollback(); return result; }
      // Timestamp successful viewed-source reads in their repeatable-read transaction.
      // Offline touches must never renew this source freshness.
      if(readonly&&result.value?.item){
        const stamp=(await client.query(`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`)).rows[0];
        if(result.value.item.id&&result.value.item.version)Object.assign(result.value.item,stamp);
        if(result.value.item.source?.id&&result.value.item.source.version)Object.assign(result.value.item.source,stamp);
      }
      commitStarted = true;
      await client.query('COMMIT');
      const { value } = result;
      if (value.kind === 'conflict') return failure(409, 'command_conflict');
      if (!readonly && value.originalOutcome?.status === 'rejected') return { ...failure(422, 'command_rejected'), ...value };
      return { ok: true, status: 200, ...value };
    } catch (error) {
      if (commitStarted) quarantine = true;
      try { await rollback(); } catch { /* The failed rollback already quarantined this client. */ }
      if(error?.message==='invalid_request'&&!attempted&&!commitStarted&&!quarantine)return failure(400,'invalid_request');
      if (error?.code === '42501' && !commitStarted && !quarantine) return failure(403, 'access_denied');
      return failure(503, !readonly && (attempted || commitStarted) ? 'command_outcome_unknown' : 'command_unavailable');
    } finally {
      try { client?.release(quarantine); } catch { /* Cleanup must not mask the intended unavailable/unknown outcome. */ }
    }
  }
  return {
    async management(principal,kind,options){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>{const value=kind==='cash-position'?await readManagementPosition(client):kind==='analytics-overview'?await readAnalyticsOverview(client):kind==='analytics-chart'?await readAnalyticsChart(client,options):kind==='analytics-validation'?await readManagementAnalytics(client,options):kind==='assessments'?await readManagementAssessments(client,options):kind==='openings'?await readManagementOpenings(client,options):await (['contributions','settlements','cash-movements'].includes(kind)?readManagementFinancial:readManagement)(client,kind,options);return options?.id&&!value.item?failure(404,'not_found'):{ok:true,value}},true)},
    async upcoming(principal,options={}){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>{try{return {ok:true,value:await readStandaloneUpcoming(client,options)}}catch(error){if(error.message==='business_date_changed')return failure(409,'business_date_changed');throw error}},true)},
    async recordList(principal,kind,options){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>({ok:true,value:await readRecordList(client,kind,options)}),true)},
    async dashboard(principal){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>({ok:true,value:await readDashboard(client)}),true)},
    async operation(principal,input){
      if(!ownerTesting)return failure(403,'access_denied');
      let command;try{command=canonicalOperation(input)}catch{return failure(400,'invalid_request')}
      return run(principal,async(client,actor,markAttempted)=>{
        let receipt=null;const existing=(await client.query('SELECT canonical_json FROM public.pwa_payment_commands WHERE request_id=$1 AND actor_issuer=$2 AND actor_subject=$3',[command.requestId,actor.issuer,actor.subject])).rows[0];
        if(existing){const stored=JSON.parse(existing.canonical_json);if(stored.contractVersion!==2||(stored.receipt?.receiptId??null)!==command.receiptId)return failure(409,'command_conflict');receipt=stored.receipt;}
        else if(command.receiptId){if(typeof resolveReceipt!=='function')return failure(422,'receipt_unsupported');let bound;try{bound=await resolveReceipt({receiptId:command.receiptId,requestId:command.requestId,actor})}catch{return failure(503,'receipt_unavailable')}try{if(!bound||Object.keys(bound).sort().join(',')!=='actor,descriptor,requestId'||bound.requestId!==command.requestId||JSON.stringify(canonicalActor(bound.actor))!==JSON.stringify(actor))return failure(422,'receipt_unavailable');receipt=canonicalReceipt(bound.descriptor);if(receipt?.receiptId!==command.receiptId)return failure(422,'receipt_unavailable')}catch{return failure(422,'receipt_unavailable')}}
        let identity;try{identity=operationIdentity(command,actor,receipt)}catch{return failure(400,'invalid_request')}
        markAttempted();const value=(await client.query('SELECT public.pwa_submit_operation_v2($1) AS result',[identity.canonicalJson])).rows[0].result;return {ok:true,value}}).then(result=>result.code==='command_outcome_unknown'?{...result,code:'operation_outcome_unknown'}:result);
    },
    async operationStatus(principal,id){
      if(!ownerTesting)return failure(403,'access_denied');
      if(!uuid.test(id??''))return failure(400,'invalid_request');
      return run(principal,async(client,actor)=>({ok:true,value:(await client.query('SELECT public.pwa_operation_status_v2($1,$2,$3) AS result',[id,actor.issuer,actor.subject])).rows[0].result}),true);
    },
    async loanOptions(principal){
      if(!ownerTesting)return failure(403,'access_denied');
      return run(principal,async client=>({ok:true,value:{businessDate:(await client.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day,accounts:(await client.query(`SELECT a."Row ID" AS id,a."Account Label" AS label,a."Default Account" AS "isDefault",a."Ref Cash Holder" AS "holderId",a."Active" AS active,h."Active" AS "holderActive" FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE AND h."Active" IS TRUE AND h."Row ID"='ch:lisa' ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`)).rows}}),true);
    },
    async loanClosePreview(principal,id){
      if(!ownerTesting)return failure(403,'access_denied');
      if(!validBorrowerId(id))return failure(400,'invalid_request');
      return run(principal,async client=>{
        if(!(await client.query('SELECT 1 FROM public."Loans" WHERE "Row ID"=$1',[id])).rowCount)return failure(404,'not_found');
        let calculation;try{calculation=(await client.query("SELECT public.loan_close_calculation_v83($1,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) value",[id])).rows[0].value;}catch(error){
          if(error.code==='P0001'&&['Loan Close requires an open auto-enabled daily-interest loan','Loan Close requires valid loan date, principal and daily interest','Loan charge components require reconciliation before closing','Loan has no outstanding principal to close','Principal already due exceeds outstanding loan principal','Multiple charges today require reconciliation before closing','Final receipt must be a positive whole-baht amount'].includes(error.message))return failure(422,'record_requires_reconciliation');throw error;
        }
        const accounts=(await client.query(`SELECT a."Row ID" id,a."Account Label" label FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE AND h."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`)).rows;
        const {sourceVersion,businessDate,amount,planHash}=calculation;
        return {ok:true,value:{sourceVersion,businessDate,amount,planHash,accounts,plan:{borrowerId:calculation.borrowerId,amountReceived:amount,allocations:calculation.allocations,allocationMethod:'Loan Close',targetChargeId:calculation.targetChargeId,targetLoanId:id,cashAccountId:null,paymentDate:businessDate,paymentMethod:null}}};
      },true);
    },
    async preferences(principal){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async(client,actor)=>({ok:true,value:await readPreferences(client,actor)}),true)},
    async cashOverview(principal){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>({ok:true,value:await readCashOverview(client)}),true)},
    async cashStatement(principal,options){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>{try{return {ok:true,value:await readCashStatement(client,options)}}catch(error){if(error.message==='invalid_request')return failure(400,'invalid_request');throw error}},true)},
    async expenseRecord(principal,id){if(!ownerTesting)return failure(403,'access_denied');if(!validBorrowerId(id))return failure(400,'invalid_request');return run(principal,async client=>{const item=await readExpenseRecord(client,id);return item?{ok:true,value:{item}}:failure(404,'not_found')},true)},
    async expenseOptions(principal){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>({ok:true,value:await readExpenseOptions(client)}),true)},
    async expenses(principal,options){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>({ok:true,value:await readExpensePage(client,options)}),true)},
    async paymentImage(principal,id,source='preferred'){
      if(!ownerTesting)return failure(403,'access_denied');if(!validBorrowerId(id)||!['preferred','manual','agent'].includes(source))return failure(400,'invalid_request');
      return run(principal,async client=>{const row=(await client.query('SELECT "Uploaded Receipt" manual,"Receipt Image" agent FROM public."Payments" WHERE "Row ID"=$1',[id])).rows[0];if(!row)return failure(404,'not_found');const kind=source==='preferred'?(typeof row.manual==='string'&&row.manual.trim()?'manual':'agent'):source,reference=row[kind];if(typeof reference!=='string'||!reference.trim())return failure(404,'receipt_not_found');if(typeof sourceReceiptReader!=='function')return failure(503,'receipt_unavailable');try{return {ok:true,value:await sourceReceiptReader(reference,kind)}}catch(error){return failure(error.message==='receipt_reference_unsupported'?422:503,error.message==='receipt_reference_unsupported'?'receipt_reference_unsupported':'receipt_unavailable')}},true);
    },
    async collectionReceipts(principal,id,options){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>{try{return {ok:true,value:await readCollectionReceipts(client,id,options)}}catch(error){if(['invalid_request','selection_changed','business_date_changed'].includes(error.message))return failure(error.message==='invalid_request'?400:409,error.message);throw error}},true);},
    async paymentRecord(principal,id,{preview=false,targetLoanId=null,paymentDate=null,proposedBorrowerId=null}={}){
      if(!ownerTesting)return failure(403,'access_denied');if(!validBorrowerId(id))return failure(400,'invalid_request');
      return run(principal,async client=>{try{const item=await (preview?readPaymentCorrectionPreview:readPaymentRecord)(client,id,{targetLoanId,paymentDate,proposedBorrowerId});return item?{ok:true,value:{item}}:failure(404,'not_found')}catch(error){if(error.message==='invalid_request')return failure(400,'invalid_request');throw error}},true);
    },
    async chargeRecord(principal,id){
      if(!ownerTesting)return failure(403,'access_denied');if(!validBorrowerId(id))return failure(400,'invalid_request');
      return run(principal,async client=>{const item=await readChargeRecord(client,id);return item?{ok:true,value:{item}}:failure(404,'not_found')},true);
    },
    async loanRelated(principal,id,kind,options={}){if(!ownerTesting)return failure(403,'access_denied');return run(principal,async client=>{const value=await readLoanRelated(client,id,kind,options);return value?{ok:true,value}:failure(404,'not_found')},true)},
    async loanRecord(principal,id){
      if(!ownerTesting)return failure(403,'access_denied');
      if(!validBorrowerId(id))return failure(400,'invalid_request');
      return run(principal,async client=>{const item=await readLoanRecord(client,id);return item?{ok:true,value:{item}}:failure(404,'not_found')},true);
    },
    async borrowerRecord(principal,id,operation='read',input){
      if(!ownerTesting)return failure(403,'access_denied');
      if(!validBorrowerId(id))return failure(400,'invalid_request');
      return run(principal,async(client,_actor,markAttempted)=>{
        if(operation==='read'){const item=await readBorrowerRecord(client,id);return item?{ok:true,value:{item}}:failure(404,'not_found');}
        return mutateBorrowerRecord(client,operation,id,input,markAttempted);
      },operation==='read').then(result=>result.code==='command_outcome_unknown'?{...result,code:'record_outcome_unknown'}:result);
    },
    async borrowerOptions(principal,query=""){
      if(!ownerTesting)return failure(403,'access_denied');
      if(typeof query!=='string'||query.length>100)return failure(400,'invalid_request');
      return run(principal,async client=>({ok:true,value:{referrers:(await client.query('SELECT "Row ID" AS id,"Borrower Name" AS label,"Description" AS description FROM public."Borrowers" WHERE strpos(lower(coalesce("Borrower Name",$2)),lower($1))>0 OR strpos(lower(coalesce("Description",$2)),lower($1))>0 ORDER BY "Borrower Name","Row ID" COLLATE "C" LIMIT 25',[query,''])).rows,accounts:(await client.query('SELECT a."Row ID" AS id,a."Account Label" AS label FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE AND h."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"')).rows}}),true);
    },
    async submit(principal, input) {
      let command;
      try { command = canonicalCommand(input); } catch { return failure(400, 'invalid_request'); }
      return run(principal, async (client, actor, markAttempted) => {
        const existing = (await client.query('SELECT canonical_json FROM public.pwa_payment_commands WHERE request_id=$1 AND actor_issuer=$2 AND actor_subject=$3', [command.requestId, actor.issuer, actor.subject])).rows[0];
        let receipt = null;
        if (existing) {
          const original = JSON.parse(existing.canonical_json);
          if (original.command.receiptId !== command.receiptId || JSON.stringify(original.actor) !== JSON.stringify(actor)) return failure(409, 'command_conflict');
          receipt = original.receipt;
          let candidate;try{candidate=commandIdentity(command,actor,receipt)}catch{return failure(400,'invalid_request')}
          if (candidate.canonicalJson !== existing.canonical_json) return failure(409, 'command_conflict');
        } else {
          if (fixture && (command.borrowerId!==fixture.borrowerId || !fixture.cashAccountIds.includes(command.cashAccountId)
            || (command.schemaVersion===6?command.allocations.map(row=>row.chargeId):command.selectedChargeIds).some(id=>!fixture.chargeIds.includes(id)))) return failure(403,'access_denied');
        }
        if (!existing && command.receiptId !== null) {
          if (typeof resolveReceipt !== 'function') return failure(422, 'receipt_unsupported');
          let bound;
          try { bound = await resolveReceipt({ receiptId: command.receiptId, requestId: command.requestId, actor }); }
          catch { return failure(503, 'receipt_unavailable'); }
          try {
            if (!bound || Object.keys(bound).sort().join(',')!=='actor,descriptor,requestId')return failure(422,'receipt_unavailable');
            if (bound.requestId !== command.requestId || JSON.stringify(canonicalActor(bound.actor)) !== JSON.stringify(actor)) return failure(422, 'receipt_unavailable');
            receipt = canonicalReceipt(bound.descriptor);
            if (receipt?.receiptId !== command.receiptId) return failure(422, 'receipt_unavailable');
          } catch { return failure(422, 'receipt_unavailable'); }
        }
        let identity;try{identity=commandIdentity(command,actor,receipt)}catch{return failure(400,'invalid_request')}
        markAttempted();
        const value = (await client.query('SELECT public.pwa_submit_selected_charges_v1($1) AS result', [identity.canonicalJson])).rows[0].result;
        return { ok: true, value };
      });
    },
    async draft(principal, borrowerId, options={}) {
      if (!ownerTesting&&(!fixture || borrowerId!==fixture.borrowerId)) return failure(403,'access_denied');
      if(typeof borrowerId!=='string'||!borrowerId||Buffer.byteLength(borrowerId)>256)return failure(400,'invalid_request');
      return run(principal,async client=>{
        const value=ownerTesting?await readOwnerPaymentDraft(client,borrowerId,options):await readPaymentDraft(client,fixture);
        return value.draftError?failure(value.status,value.draftError):{ok:true,value};
      },true);
    },
    async selectAll(principal,borrowerId,input){
      if(!input||Array.isArray(input)||Object.keys(input).length)return failure(400,'invalid_request');
      const result=await this.draft(principal,borrowerId,{limit:100,all:true});
      if(!result.ok)return result;
      if(result.nextCursor||result.charges.length>10000)return failure(422,'selection_limit_exceeded');
      return {...result,total:result.charges.reduce((sum,row)=>sum+BigInt(row.amountRemaining),0n).toString()};
    },
    async autoAssign(principal,borrowerId,input){
      if(!input||Object.keys(input).join(',')!=='amountReceived'||typeof input.amountReceived!=='string'||!/^[1-9][0-9]{0,16}$/.test(input.amountReceived)||BigInt(input.amountReceived)>92233720368547758n)return failure(400,'invalid_request');
      const result=await this.draft(principal,borrowerId,{limit:100,all:true});if(!result.ok)return result;
      if(result.nextCursor||result.charges.length>10000)return failure(422,'selection_limit_exceeded');
      let remaining=BigInt(input.amountReceived);const allocations=[];
      for(const row of [...result.charges].sort((a,b)=>b.chargeDate.localeCompare(a.chargeDate)||Buffer.compare(Buffer.from(b.id),Buffer.from(a.id)))){
        const p=BigInt(row.principalRemaining),i=BigInt(row.interestRemaining),interest=remaining<i?remaining:i;remaining-=interest;const principal=remaining<p?remaining:p;remaining-=principal;
        if(principal+interest>0n)allocations.push({chargeId:row.id,principal:principal.toString(),interest:interest.toString(),expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate});
      }
      allocations.sort((a,b)=>Buffer.compare(Buffer.from(a.chargeId),Buffer.from(b.chargeId)));
      return {...result,allocations,amountReceived:input.amountReceived,allocated:(BigInt(input.amountReceived)-remaining).toString(),unallocated:remaining.toString()};
    },
    async review(principal,borrowerId,input){
      if(input&&Object.keys(input).sort().join(',')==='allocations,amountReceived'){
        let allocations;try{allocations=canonicalAllocationPlan(input.amountReceived,input.allocations)}catch{return failure(400,'invalid_request')}
        const result=await this.draft(principal,borrowerId,{selectedChargeIds:allocations.map(row=>row.chargeId),limit:100,scope:'all'});if(!result.ok)return result;
        const changed=result.charges.length!==allocations.length||allocations.some(line=>{const row=result.charges.find(row=>row.id===line.chargeId);return !row||row.chargeDate!==line.chargeDate||row.principalRemaining!==line.expectedPrincipalRemaining||row.interestRemaining!==line.expectedInterestRemaining});
        if(changed)return {...failure(409,'plan_changed'),charges:result.charges,businessDate:result.businessDate};
        return {...result,allocations,total:input.amountReceived,nextCursor:null};
      }

      if(!input||!['selectedChargeIds','allocationMethod,selectedChargeIds'].includes(Object.keys(input).sort().join(','))||!Array.isArray(input.selectedChargeIds)||!input.selectedChargeIds.length||input.selectedChargeIds.length>10000||new Set(input.selectedChargeIds).size!==input.selectedChargeIds.length||input.selectedChargeIds.some(id=>typeof id!=='string'||!id||/[\s,]/u.test(id)||Buffer.byteLength(id)>256))return failure(400,'invalid_request');
      const method=input.allocationMethod??'Selected Charges';
      if(!['Selected Charges','Single Full','Receive All'].includes(method)||method==='Single Full'&&input.selectedChargeIds.length!==1)return failure(400,'invalid_request');
      if(method==='Receive All')return this.selectAll(principal,borrowerId,{});
      let result=await this.draft(principal,borrowerId,{selectedChargeIds:input.selectedChargeIds,limit:100});
      if(method==='Single Full'&&result.ok&&result.charges.length===0)result=await this.draft(principal,borrowerId,{selectedChargeIds:input.selectedChargeIds,limit:100,scope:'future'});
      if(!result.ok)return result;
      const charges=result.charges.filter(row=>input.selectedChargeIds.includes(row.id));
      if(charges.length!==input.selectedChargeIds.length)return failure(409,'selection_changed');
      return {...result,charges,total:charges.reduce((sum,row)=>sum+BigInt(row.amountRemaining),0n).toString(),nextCursor:null};
    },
    async history(principal,borrowerId,options={}){
      if(typeof borrowerId!=='string'||!borrowerId||Buffer.byteLength(borrowerId)>256)return failure(400,'invalid_request');
      if(!ownerTesting&&fixture&&fixture.borrowerId!==borrowerId)return failure(403,'access_denied');
      return run(principal,async (client,actor)=>({ok:true,value:await readBorrowerPaymentHistory(client,borrowerId,options,actor)}),true);
    },
    async result(principal,requestId){
      if(!uuid.test(requestId||''))return failure(400,'invalid_request');
      return run(principal,async(client,actor)=>{const value=await readCommandResult(client,actor,requestId);return value.resultError?failure(value.status,value.resultError):{ok:true,value};},true);
    },
    async metadata(principal,requestId,input){
      if(!uuid.test(requestId||'')||!input||!['expectedVersion,notes','expectedVersion,notes,receiptId'].includes(Object.keys(input).sort().join(','))||!(/^[a-f0-9]{64}$/).test(input.expectedVersion||''))return failure(400,'invalid_request');
      return run(principal,async(client,actor)=>{
        const current=await readCommandResult(client,actor,requestId,{lock:true});
        if(current.resultError)return failure(current.status,current.resultError);
        if(current.currentSource!=='present'||current.payment.status!=='Posted')return failure(409,'source_changed');
        let desired;try{desired=canonicalCommand({...current.originalCommand,notes:input.notes,receiptId:Object.hasOwn(input,'receiptId')?input.receiptId:current.originalCommand.receiptId})}catch{return failure(400,'invalid_request')}
        let reference=Object.hasOwn(input,'receiptId')?null:current.payment.receiptReference;
        if(Object.hasOwn(input,'receiptId')&&desired.receiptId){
          let bound;try{bound=await resolveReceipt({receiptId:desired.receiptId,requestId,actor})}catch{return failure(503,'receipt_unavailable')}
          if(!bound||bound.requestId!==requestId||JSON.stringify(canonicalActor(bound.actor))!==JSON.stringify(actor))return failure(422,'receipt_unavailable');
          const receipt=canonicalReceipt(bound.descriptor);if(receipt.receiptId!==desired.receiptId)return failure(422,'receipt_unavailable');reference=receipt.storageReference;
        }
        if(current.payment.notes===desired.notes&&current.payment.receiptReference===reference)return {ok:true,value:current};
        if(current.payment.version!==input.expectedVersion)return failure(409,'metadata_conflict');
        await client.query('UPDATE public."Payments" SET "Notes"=$2,"Uploaded Receipt"=$3 WHERE "Row ID"=$1',[current.payment.id,desired.notes,reference]);
        return {ok:true,value:await readCommandResult(client,actor,requestId)};
      }).then(result=>result.code==='command_outcome_unknown'?{...result,code:'metadata_outcome_unknown'}:result);
    },
    async receipt(principal,{requestId,receiptId,borrowerId,bytes,mimeType}) {
      if (!uuid.test(requestId||'') || !uuid.test(receiptId||'')) return failure(400,'invalid_request');
      if (bytes && !ownerTesting && (!fixture || borrowerId!==fixture.borrowerId)) return failure(403,'access_denied');
      if (!receiptAdapter) return failure(422,'receipt_unsupported');
      return run(principal,async (_client,actor)=>{
        if(bytes&&ownerTesting&&!(await _client.query('SELECT 1 FROM public."Borrowers" WHERE "Row ID"=$1',[borrowerId])).rows.length)return failure(404,'not_found');
        try {
          const input={requestId:requestId.toLowerCase(),receiptId:receiptId.toLowerCase(),actor};
          const value=bytes ? await receiptAdapter.upload({...input,bytes,mimeType}) : await receiptAdapter.retrieve(input);
          return {ok:true,value};
        } catch(error) { return failure(error?.message==='receipt_conflict'?409:error?.receiptInvalid||error?.message==='invalid_receipt'?422:503,error?.message==='receipt_conflict'?'receipt_conflict':'receipt_unavailable'); }
      },true);
    },
    async status(principal, requestId) {
      if (typeof requestId !== 'string' || !uuid.test(requestId)) return failure(400, 'invalid_request');
      return run(principal, async (client, actor) => ({ ok: true, value: (await client.query('SELECT public.pwa_command_status_v1($1,$2,$3) AS result', [requestId.toLowerCase(), actor.issuer, actor.subject])).rows[0].result }), true);
    },
  };
}

export function createPaymentCommandStore({pool,expectedDirectory,resolveReceipt}) {
 if(!pool||typeof pool.connect!=='function'||typeof expectedDirectory!=='string'||!/[\\/]mw-payment-rehearsal-[a-f0-9]{32}[\\/]data$/i.test(expectedDirectory))throw Error('Owned disposable directory required');
 return buildStore({pool,resolveReceipt,guardConnection:async client=>{
  const row=(await client.query('SELECT current_user AS current_user,session_user AS session_user')).rows[0];
  if(row?.current_user!=='postgres'||row?.session_user!=='postgres')throw Error('Disposable owner required');
  const {assertDisposable}=await import('../../scripts/rehearsal/payment-command.mjs');
  await assertDisposable({query:(...args)=>client.query(...args)},expectedDirectory,78);
 }});
}
export function createApplicationRoleCommandStore({pool,targetAttestation,resolveReceipt,fixture,receiptAdapter,sourceReceiptReader,ownerTesting=false}) {
 if(!pool||typeof pool.connect!=='function')throw Error('Application pool required');
 return buildStore({pool,resolveReceipt,fixture,receiptAdapter,sourceReceiptReader,ownerTesting,guardConnection:applicationConnectionGuard(targetAttestation)});
}

export function createDevCommandStore({pool,config,receiptAdapter,sourceReceiptReader}) {
 return buildStore({pool,fixture:config.fixture,ownerTesting:config.mode==='dev-owner-testing',receiptAdapter,sourceReceiptReader,resolveReceipt:input=>receiptAdapter.resolveReceipt(input),guardConnection:createDevCommandConnectionGuard(config)});
}
