import {createEnvironmentCommandStore} from '../payment-command/store.mjs';
import {wakeContext} from '../notifications/postcommit.mjs';
import {resolveConversationActor} from './policy.mjs';
import {statementTimeoutSql} from '../lib/budget.mjs';
// Runs on the command service pool (query timeout 9 s): command statement budget (APP-PAY-03).

const operations = new Set([
  'payment.create','payment.update-metadata','allocation.create','allocation.update','allocation.delete',
  'borrower.create','borrower.update','borrower.delete',
  'loan.create','loan.update','loan.delete','loan.default','loan.undo-default','loan.generate-charge','loan.close',
  'charge.create','charge.update','charge.delete','payment.correct','payment.delete','payment.move-interest',
  'expense.create','expense.update',
  'capital-contribution.create','capital-contribution.update',
  'settlement.create','settlement.update','settlement.complete','settlement.reverse','settlement.cancel',
  'cash-movement.create','cash-movement.update','cash-movement.delete',
  'assessment.create','assessment.update','assessment.delete','assessment.refresh','preference.update',
]);
const denied=()=>{throw Object.assign(Error('access_denied'),{code:'42501'});};

/** Canonical business commands retain their existing transaction/journal/trigger engine. */
export function createConversationCommandProvider({pool,guardConnection,policy,afterCommit}) {
  return {
    async commands(context,input) {
      if (!['operation','borrower'].includes(input.kind) || !operations.has(input.command?.operation)
        || input.kind==='borrower'&&!input.command.operation.startsWith('borrower.')
        || input.command.receiptId!==null) throw Error('unsupported_native_capability');
      if(context.signal?.aborted)throw Error('request_aborted');
      const principal={workload:context.workload,partnerId:input.actorPartnerId,[wakeContext]:context};
      const store=createEnvironmentCommandStore({pool,guardConnection,afterCommit,
        actorIssuer:'https://accounts.google.com',principalAllowed:value=>value===principal,
        resolveActor:async(client)=>{
          const actor=await resolveConversationActor(client,policy,context.workload,input.actorPartnerId,{write:true});
          const command=input.command;
          // These fields are accepted by human forms, but remain outside agent authority.
          if (command.operation==='borrower.create' && command.inputs?.instagramUsername!==null) denied();
          if (command.operation==='borrower.update') {
            const current=(await client.query('SELECT "Instagram Username" AS value FROM public."Borrowers" WHERE "Row ID"=$1 FOR UPDATE',[command.targetId])).rows[0];
            if(!current || command.inputs?.instagramUsername!==current.value)denied();
          }
          if (command.operation==='preference.update') {
            const current=(await client.query('SELECT "Language Preference" AS value FROM public."Partners" WHERE "Row ID"=$1',[actor.partnerId])).rows[0];
            if(command.targetId!==actor.partnerId || !current || command.inputs?.language!==current.value)denied();
          }
          if(command.operation==='payment.correct' && command.inputs?.receiptMode!=='preserve')denied();
          if(context.signal?.aborted)throw Error('request_aborted');
          return actor;
        }});
      const native=['payment.create','payment.update-metadata','allocation.create','allocation.update','allocation.delete'].includes(input.command.operation);
      const result=await store[native?'nativeOperation':'operation'](principal,input.command);
      return {status:result.status,value:result};
    },
    async status(context,requestId) {
      let client,quarantine=false;
      try {
        if(context.signal?.aborted)throw Error('request_aborted');
        client=await pool.connect();
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query(statementTimeoutSql('command'));
        await guardConnection(client);
        const row=(await client.query('SELECT canonical_json FROM public.pwa_payment_commands WHERE request_id=$1 AND actor_issuer=$2 AND actor_subject=$3',
          [requestId,context.workload.issuer,context.workload.subject])).rows[0];
        // Scope reconciliation to this facade, never the separate receipt schema7 journal.
        const stored=row?JSON.parse(row.canonical_json):null;
        if(!stored||stored.contractVersion!==2||!operations.has(stored.command?.operation)) {
          await client.query('COMMIT');return {status:404,value:{error:'not_found'}};
        }
        const result=(await client.query('SELECT public.pwa_operation_status_v2($1,$2,$3) AS result',
          [requestId,context.workload.issuer,context.workload.subject])).rows[0].result;
        await client.query('COMMIT');return {status:200,value:result};
      } catch(error) {
        try{await client?.query('ROLLBACK');}catch{quarantine=true;}
        throw error;
      } finally {client?.release(quarantine);}
    },
  };
}
