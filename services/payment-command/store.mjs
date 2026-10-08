import { createDevCommandConnectionGuard } from './dev-target.mjs';
import { readPaymentDraft } from './draft.mjs';
import { applicationConnectionGuard } from './application-target.mjs';
import { canonicalCommand, canonicalActor, canonicalReceipt, commandIdentity } from '../contracts/payment-command.mjs';
import { DEV_PROJECT, OWNER_EMAIL } from '../api/dev-read-config.mjs';
const issuer = `https://securetoken.google.com/${DEV_PROJECT}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure = (status, code) => ({ ok: false, status, code });

/** DISPOSABLE candidate only. No ambient connection/config, service launcher or live permission. */
function buildStore({ pool, guardConnection, resolveReceipt, fixture, receiptAdapter }) {
  async function run(principal, operation, readonly = false) {
    if (!principal?.ok || principal.email !== OWNER_EMAIL || typeof principal.subject !== 'string' || !principal.subject) return failure(403, 'access_denied');
    let client, attempted = false, commitStarted = false, quarantine = false;
    const rollback = async () => { try { await client?.query('ROLLBACK'); } catch (error) { quarantine = true; throw error; } };
    try {
      client = await pool.connect();
      await client.query(readonly ? 'BEGIN READ ONLY' : 'BEGIN');
      await client.query("SET LOCAL statement_timeout='10000ms'");
      await client.query("SET LOCAL lock_timeout='3000ms'");
      await guardConnection(client);
      const rows = (await client.query('SELECT "Row ID" AS id FROM public."Partners" WHERE lower(btrim("Login Email"))=$1 LIMIT 2', [principal.email])).rows;
      if (rows.length !== 1) { await rollback(); return failure(403, 'access_denied'); }
      const actor = canonicalActor({ issuer, subject: principal.subject, partnerId: rows[0].id, loginEmail: principal.email });
      const result = await operation(client, actor, () => { attempted = true; });
      if (!result.ok) { await rollback(); return result; }
      commitStarted = true;
      await client.query('COMMIT');
      const { value } = result;
      if (value.kind === 'conflict') return failure(409, 'command_conflict');
      if (!readonly && value.originalOutcome?.status === 'rejected') return { ...failure(422, 'command_rejected'), ...value };
      return { ok: true, status: 200, ...value };
    } catch (error) {
      if (commitStarted) quarantine = true;
      try { await rollback(); } catch { /* The failed rollback already quarantined this client. */ }
      if (error?.code === '42501' && !commitStarted && !quarantine) return failure(403, 'access_denied');
      return failure(503, !readonly && (attempted || commitStarted) ? 'command_outcome_unknown' : 'command_unavailable');
    } finally {
      try { client?.release(quarantine); } catch { /* Cleanup must not mask the intended unavailable/unknown outcome. */ }
    }
  }
  return {
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
          const candidate = commandIdentity(command, actor, receipt);
          if (candidate.canonicalJson !== existing.canonical_json) return failure(409, 'command_conflict');
        } else {
          if (fixture && (command.borrowerId!==fixture.borrowerId || !fixture.cashAccountIds.includes(command.cashAccountId)
            || command.selectedChargeIds.some(id=>!fixture.chargeIds.includes(id)))) return failure(403,'access_denied');
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
        const identity = commandIdentity(command, actor, receipt);
        markAttempted();
        const value = (await client.query('SELECT public.pwa_submit_selected_charges_v1($1) AS result', [identity.canonicalJson])).rows[0].result;
        return { ok: true, value };
      });
    },
    async draft(principal, borrowerId) {
      if (!fixture || borrowerId!==fixture.borrowerId) return failure(403,'access_denied');
      return run(principal,async client=>({ok:true,value:await readPaymentDraft(client,fixture)}),true);
    },
    async receipt(principal,{requestId,receiptId,borrowerId,bytes,mimeType}) {
      if (!uuid.test(requestId||'') || !uuid.test(receiptId||'')) return failure(400,'invalid_request');
      if (bytes && (!fixture || borrowerId!==fixture.borrowerId)) return failure(403,'access_denied');
      if (!receiptAdapter) return failure(422,'receipt_unsupported');
      return run(principal,async (_client,actor)=>{
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
export function createApplicationRoleCommandStore({pool,targetAttestation,resolveReceipt,fixture,receiptAdapter}) {
 if(!pool||typeof pool.connect!=='function')throw Error('Application pool required');
 return buildStore({pool,resolveReceipt,fixture,receiptAdapter,guardConnection:applicationConnectionGuard(targetAttestation)});
}

export function createDevCommandStore({pool,config,receiptAdapter}) {
 return buildStore({pool,fixture:config.fixture,receiptAdapter,resolveReceipt:input=>receiptAdapter.resolveReceipt(input),guardConnection:createDevCommandConnectionGuard(config)});
}
