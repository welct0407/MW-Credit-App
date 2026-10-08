import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const TRUSTED_ACTOR = '4A-owner@example.invalid';
const keys = ['schemaVersion','requestId','borrowerId','selectedChargeIds','cashAccountId','paymentDate','amountReceived','paymentMethod','allocationMethod','notes','receiptId'];
const fixtureId = value => typeof value === 'string' && /^4A-[A-Za-z0-9-]{1,100}$/.test(value);
export function canonicalPayment(input, businessDate) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length || keys.some(key => !(key in input))) throw Error('invalid_request');
  if (input.schemaVersion !== 2 || typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw Error('invalid_request');
  if (!fixtureId(input.borrowerId) || !fixtureId(input.cashAccountId) || !Array.isArray(input.selectedChargeIds) || input.selectedChargeIds.length < 1 || input.selectedChargeIds.length > 100 || !input.selectedChargeIds.every(fixtureId) || new Set(input.selectedChargeIds).size !== input.selectedChargeIds.length) throw Error('invalid_request');
  if (typeof input.paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) || input.paymentDate < '0001-01-01' || !Number.isFinite(Date.parse(input.paymentDate+'T00:00:00Z')) || new Date(input.paymentDate+'T00:00:00Z').toISOString().slice(0,10) !== input.paymentDate || (businessDate !== undefined && input.paymentDate !== businessDate)) throw Error('invalid_date');
  if (typeof input.amountReceived !== 'string' || !/^[1-9][0-9]{0,16}$/.test(input.amountReceived) || BigInt(input.amountReceived) > 92233720368547758n || input.paymentMethod !== 'Bank Transfer' || input.allocationMethod !== 'Selected Charges') throw Error('invalid_request');
  if (!(input.notes===null || (typeof input.notes==='string' && !input.notes.includes('\0') && Buffer.byteLength(input.notes,'utf8')<=65536)) || !(input.receiptId===null || (typeof input.receiptId==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.receiptId)))) throw Error('invalid_request');
  return { schemaVersion:2, notes:input.notes===''?null:input.notes, receiptId:input.receiptId, requestId:input.requestId.toLowerCase(), borrowerId:input.borrowerId, selectedChargeIds:[...input.selectedChargeIds].sort(), cashAccountId:input.cashAccountId, paymentDate:input.paymentDate, amountReceived:input.amountReceived, paymentMethod:input.paymentMethod, allocationMethod:input.allocationMethod };
}
export const paymentId = id => '4A-P-' + id;
export async function assertDisposable(pool, expectedDirectory, expectedVersion=77) {
  if(![77,78,79].includes(expectedVersion))throw Error('Unsupported rehearsal version');
  const result = await pool.query("SELECT current_database() AS db, current_setting('data_directory') AS directory, host(inet_server_addr()) AS host");
  const row=result.rows[0];
  if (row?.db !== 'payment_rehearsal' || !['127.0.0.1','::1'].includes(row.host) || realpathSync.native(row.directory).replaceAll('\\','/').toLowerCase() !== realpathSync.native(expectedDirectory).replaceAll('\\','/').toLowerCase()) throw Error('Not runner-owned disposable database');
  const history=await pool.query('SELECT max(version::integer) AS version, count(*) FILTER (WHERE success) AS applied FROM public.flyway_schema_history WHERE version IS NOT NULL');
  if (history.rows[0].version !== expectedVersion || Number(history.rows[0].applied) !== expectedVersion) throw Error('Exact full migration history required');
}
export function createPaymentRehearsal({pool, trustedActor=TRUSTED_ACTOR, getBusinessDate, receipts}) {
  // This journal is deliberately memory-only. It is NOT durable idempotency infrastructure.
  const journal=new Map();
  async function businessDate() { if(getBusinessDate)return getBusinessDate(); return (await pool.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day; }
  async function readReceipt(command) {
    const result=await pool.query('SELECT "Status" AS status,"Ref Borrower" AS borrower,"Ref Received By Cash Account" AS account,"Payment Date"::text AS day,"Amount Received"::numeric::text AS amount,"Selected Charge IDs" AS charges,"Payment Method" AS method,"Allocation Method" AS allocation,"Created By" AS actor,"Posted Amount"::text AS posted,"Notes" AS notes,"Uploaded Receipt" AS receipt,"Uploaded Receipt At"::text AS stamp FROM public."Payments" WHERE "Row ID"=$1',[paymentId(command.requestId)]);
    const row=result.rows[0];
    if (!row) return {status:'unknown',code:'source_missing',requestId:command.requestId};
    const same=row.notes===command.notes&&row.borrower===command.borrowerId&&row.account===command.cashAccountId&&row.day===command.paymentDate&&/^[0-9]+(?:\.0+)?$/.test(row.amount)&&BigInt(row.amount.split('.')[0])===BigInt(command.amountReceived)&&row.charges.split(',').map(s=>s.trim()).sort().join(',')===command.selectedChargeIds.join(',')&&row.actor===trustedActor&&row.method===command.paymentMethod&&row.allocation===command.allocationMethod;
    let receipt=null,receiptError=null;try{receipt=currentReceipt(row.receipt,command.requestId)}catch{receiptError='receipt_unavailable'}
    return same&&row.status==='Posted' ? {status:'posted',requestId:command.requestId,amountReceived:command.amountReceived,postedAmount:row.posted,notes:row.notes,receipt,receiptError,uploadedReceiptAt:row.stamp} : {status:'unknown',code:'source_changed',requestId:command.requestId};
  }
  function currentReceipt(reference,requestId) {
    if(reference===null)return null;
    const match=/^local-rehearsal\/([0-9a-f-]+)\.(?:png|jpg)$/.exec(reference);
    if(!match)throw Error('receipt_unavailable');
    return receipts.resolve(match[1],{requestId,actor:trustedActor});
  }
  async function execute(command) {
    const client=await pool.connect();let commitStarted=false;let failed=false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='10000ms'");
      const actor=await client.query('SELECT "Row ID" FROM public."Partners" WHERE lower(btrim("Login Email"))=$1',[trustedActor.toLowerCase()]);
      if(actor.rows.length!==1) throw Error('actor_unmapped');
      await client.query('SELECT public.cash_account_holder($1,true)',[command.cashAccountId]);
      const existing=await client.query('SELECT "Row ID" FROM public."Payments" WHERE "Row ID"=$1',[paymentId(command.requestId)]);
      if(existing.rows.length) throw Error('existing_receipt_unverified');
      await client.query('INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Created By","Notes","Uploaded Receipt") VALUES($1,$2,$3,\'Processing\',$4::numeric::money,$5::date,$6,$7,$8,$9,$10,$11)',[paymentId(command.requestId),command.borrowerId,command.cashAccountId,command.amountReceived,command.paymentDate,command.paymentMethod,command.allocationMethod,command.selectedChargeIds.join(' , '),trustedActor,command.notes,command.receiptId?receipts.resolve(command.receiptId,{requestId:command.requestId,actor:trustedActor}).reference:null]);
      commitStarted=true;await client.query('COMMIT');
    } catch { failed=true;try {await client.query('ROLLBACK')}catch{} }
    finally {client.release();}
    if(failed && commitStarted)return {status:'unknown',code:'commit_unknown',requestId:command.requestId};
    // A PK race cannot prove rejection. Reconcile separately.
    try {
      const observed=await readReceipt(command);
      if(failed && observed.code==='source_missing' && !commitStarted)return {status:'rejected',code:'posting_rejected',requestId:command.requestId};
      if(failed && observed.code==='source_changed')return {status:'conflict',code:'payload_conflict',requestId:command.requestId};
      return observed;
    }catch{return {status:'unknown',code:'status_unavailable',requestId:command.requestId}}
  }
  async function reconcile(entry) {
    const settled=await entry.promise;
    try {
      const current=await readReceipt(entry.command);
      return current.code==='source_missing'&&settled.status==='rejected'?settled:current;
    }catch{return {status:'unknown',code:'status_unavailable',requestId:entry.command.requestId}}
  }
  return {businessDate,
    async submit(input, actor=trustedActor) {
      let command;try {command=canonicalPayment(input)}catch{return {status:'rejected',code:'invalid_request'}}
      const prior=journal.get(command.requestId);
      if(prior && (prior.actor!==actor || JSON.stringify(prior.command)!==JSON.stringify(command)))return {status:'conflict',code:'payload_conflict',requestId:command.requestId};
      // A known immutable request only reconciles; missing temporary image metadata cannot reject posted money.
      if(prior)return reconcile(prior);
      let receipt=null;try{if(command.receiptId)receipt=receipts.resolve(command.receiptId,{requestId:command.requestId,actor})}catch{return {status:'rejected',code:'receipt_unavailable',requestId:command.requestId}}
      const signature=createHash('sha256').update(JSON.stringify({command,actor,receiptHash:receipt?.sha256??null})).digest('hex');
      if(command.paymentDate!==await businessDate())return {status:'rejected',code:'invalid_date',requestId:command.requestId};
      if(actor!==trustedActor) return {status:'rejected',code:'actor_denied',requestId:command.requestId};
      const entry={signature,command,actor,promise:null};
      journal.set(command.requestId,entry);
      entry.promise=execute(command).catch(()=>({status:'unknown',code:'status_unavailable',requestId:command.requestId}));return entry.promise;
    },
    async attachReceipt(input,actor=trustedActor) {
      if(!input||Object.keys(input).sort().join(',')!=='expectedReceiptId,newReceiptId,requestId'||actor!==trustedActor)return {ok:false,code:'invalid_request'};
      const entry=journal.get(input.requestId);if(!entry)return {ok:false,code:'receipt_unavailable'};
      const observed=await reconcile(entry);if(observed.status!=='posted')return {ok:false,code:'payment_not_posted'};
      let next;try{next=input.newReceiptId===null?null:receipts.resolve(input.newReceiptId,{requestId:input.requestId,actor})}catch{return {ok:false,code:'receipt_unavailable'}}
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const row=(await client.query('SELECT "Uploaded Receipt" AS receipt FROM public."Payments" WHERE "Row ID"=$1 AND "Created By"=$2 AND "Status"=\'Posted\' FOR UPDATE',[paymentId(input.requestId),actor])).rows[0];
        if(!row)throw Error('payment_not_posted');
        const current=currentReceipt(row.receipt,input.requestId);
        if(current?.receiptId!==input.newReceiptId && !(current===null&&input.newReceiptId===null)){
          if((current?.receiptId??null)!==input.expectedReceiptId){await client.query('ROLLBACK');return {ok:false,code:'attachment_conflict'}}
          await client.query('UPDATE public."Payments" SET "Uploaded Receipt"=$2 WHERE "Row ID"=$1',[paymentId(input.requestId),next?.reference??null]);
        }
        await client.query('COMMIT');
        return {ok:true,...await readReceipt(entry.command)};
      }catch{try{await client.query('ROLLBACK')}catch{}return {ok:false,code:'attachment_unavailable'}}finally{client.release()}
    },
    async status(id) {
      const entry=journal.get(id);if(!entry)return {status:'unknown',code:'journal_missing',requestId:id};
      return reconcile(entry);
    },
  };
}