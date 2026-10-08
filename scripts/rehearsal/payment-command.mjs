import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const TRUSTED_ACTOR = '4A-owner@example.invalid';
const keys = ['schemaVersion','requestId','borrowerId','selectedChargeIds','cashAccountId','paymentDate','amountReceived','paymentMethod','allocationMethod'];
const fixtureId = value => typeof value === 'string' && /^4A-[A-Za-z0-9-]{1,100}$/.test(value);
export function canonicalPayment(input, businessDate) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length || keys.some(key => !(key in input))) throw Error('invalid_request');
  if (input.schemaVersion !== 1 || typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw Error('invalid_request');
  if (!fixtureId(input.borrowerId) || !fixtureId(input.cashAccountId) || !Array.isArray(input.selectedChargeIds) || input.selectedChargeIds.length < 1 || input.selectedChargeIds.length > 100 || !input.selectedChargeIds.every(fixtureId) || new Set(input.selectedChargeIds).size !== input.selectedChargeIds.length) throw Error('invalid_request');
  if (typeof input.paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) || input.paymentDate < '0001-01-01' || !Number.isFinite(Date.parse(input.paymentDate+'T00:00:00Z')) || new Date(input.paymentDate+'T00:00:00Z').toISOString().slice(0,10) !== input.paymentDate || (businessDate !== undefined && input.paymentDate !== businessDate)) throw Error('invalid_date');
  if (typeof input.amountReceived !== 'string' || !/^[1-9][0-9]{0,16}$/.test(input.amountReceived) || BigInt(input.amountReceived) > 92233720368547758n || input.paymentMethod !== 'Bank Transfer' || input.allocationMethod !== 'Selected Charges') throw Error('invalid_request');
  return { schemaVersion:1, requestId:input.requestId.toLowerCase(), borrowerId:input.borrowerId, selectedChargeIds:[...input.selectedChargeIds].sort(), cashAccountId:input.cashAccountId, paymentDate:input.paymentDate, amountReceived:input.amountReceived, paymentMethod:input.paymentMethod, allocationMethod:input.allocationMethod };
}
export const paymentId = id => '4A-P-' + id;
export async function assertDisposable(pool, expectedDirectory) {
  const result = await pool.query("SELECT current_database() AS db, current_setting('data_directory') AS directory, host(inet_server_addr()) AS host");
  const row=result.rows[0];
  if (row?.db !== 'payment_rehearsal' || !['127.0.0.1','::1'].includes(row.host) || realpathSync.native(row.directory).replaceAll('\\','/').toLowerCase() !== realpathSync.native(expectedDirectory).replaceAll('\\','/').toLowerCase()) throw Error('Not runner-owned disposable database');
  const history=await pool.query('SELECT max(version::integer) AS version, count(*) FILTER (WHERE success) AS applied FROM public.flyway_schema_history WHERE version IS NOT NULL');
  if (history.rows[0].version !== 77 || Number(history.rows[0].applied) !== 77) throw Error('Full V77 required');
}
export function createPaymentRehearsal({pool, trustedActor=TRUSTED_ACTOR, getBusinessDate}) {
  // This journal is deliberately memory-only. It is NOT durable idempotency infrastructure.
  const journal=new Map();
  async function businessDate() { if(getBusinessDate)return getBusinessDate(); return (await pool.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day; }
  async function readReceipt(command) {
    const result=await pool.query('SELECT "Status" AS status,"Ref Borrower" AS borrower,"Ref Received By Cash Account" AS account,"Payment Date"::text AS day,"Amount Received"::numeric::text AS amount,"Selected Charge IDs" AS charges,"Payment Method" AS method,"Allocation Method" AS allocation,"Created By" AS actor,"Posted Amount"::text AS posted FROM public."Payments" WHERE "Row ID"=$1',[paymentId(command.requestId)]);
    const row=result.rows[0];
    if (!row) return {status:'unknown',code:'source_missing',requestId:command.requestId};
    const same=row.borrower===command.borrowerId&&row.account===command.cashAccountId&&row.day===command.paymentDate&&/^[0-9]+(?:\.0+)?$/.test(row.amount)&&BigInt(row.amount.split('.')[0])===BigInt(command.amountReceived)&&row.charges.split(',').map(s=>s.trim()).sort().join(',')===command.selectedChargeIds.join(',')&&row.actor===trustedActor&&row.method===command.paymentMethod&&row.allocation===command.allocationMethod;
    return same&&row.status==='Posted' ? {status:'posted',requestId:command.requestId,amountReceived:command.amountReceived,postedAmount:row.posted} : {status:'unknown',code:'source_changed',requestId:command.requestId};
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
      await client.query('INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Created By") VALUES($1,$2,$3,\'Processing\',$4::numeric::money,$5::date,$6,$7,$8,$9)',[paymentId(command.requestId),command.borrowerId,command.cashAccountId,command.amountReceived,command.paymentDate,command.paymentMethod,command.allocationMethod,command.selectedChargeIds.join(' , '),trustedActor]);
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
      const signature=createHash('sha256').update(JSON.stringify({command,actor})).digest('hex');
      const prior=journal.get(command.requestId);
      if(prior) return prior.signature===signature ? reconcile(prior) : {status:'conflict',code:'payload_conflict',requestId:command.requestId};
      if(command.paymentDate!==await businessDate())return {status:'rejected',code:'invalid_date',requestId:command.requestId};
      if(actor!==trustedActor) return {status:'rejected',code:'actor_denied',requestId:command.requestId};
      const entry={signature,command,promise:null};
      journal.set(command.requestId,entry);
      entry.promise=execute(command).catch(()=>({status:'unknown',code:'status_unavailable',requestId:command.requestId}));return entry.promise;
    },
    async status(id) {
      const entry=journal.get(id);if(!entry)return {status:'unknown',code:'journal_missing',requestId:id};
      return reconcile(entry);
    },
  };
}