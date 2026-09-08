// Explicit one-off user-authorized resend. Does not reset the daily guard.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Ledger } from './ledger.mjs';
import { collectionMessage } from './message_template.mjs';
import { loadPaymentBlock } from './payment_account.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root,'config.json'),'utf8'));
const db = new DatabaseSync(resolve(root,'state/collection.db'));
const authorizations = {
  '2026-09-07-closure-terms': 'User explicitly approved the loan closure sentence, three paragraphs, and another message to __rxrisx__.',
  '2026-09-07-user-request-format-v2': 'User explicitly requested: fine tune the message template and send it again; recipient remains __rxrisx__.',
  '2026-09-07-second-loan-overdue': 'User explicitly requested: add Lisa second loan with missed second day and trigger another message; recipient remains __rxrisx__.',
  '2026-09-07-late-payment-terms': 'User explicitly requested the supplied late-payment terms after the overdue amount, followed by bank details, and another send to __rxrisx__.'
};
db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS review_resends (
  revision TEXT PRIMARY KEY, original_token TEXT NOT NULL, recipient TEXT NOT NULL,
  message TEXT NOT NULL, snapshot TEXT NOT NULL, authorization TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','SENT','UNKNOWN')),
  reserved_at TEXT NOT NULL, sent_at TEXT, evidence TEXT);`);
const [command, argument] = process.argv.slice(2);
try {
  if (command === 'reserve') {
    const input = JSON.parse(readFileSync(argument,'utf8'));
    const revision = input.revision;
    if (!config.authorizedResendRevisions?.includes(revision) || !authorizations[revision])
      throw new Error('Resend revision is not explicitly allowlisted');
    const authorization = authorizations[revision];
    const validator = new Ledger(':memory:');
    let valid;
    try { valid = validator.reserve(config,input.facts); } finally { validator.close(); }
    if (valid.status !== 'READY') throw new Error('No unpaid message to resend');
    const message = collectionMessage(input.facts,loadPaymentBlock());
    db.exec('BEGIN IMMEDIATE');
    try {
      const prior = db.prepare('SELECT token FROM initial_messages WHERE borrower_id=? AND collection_date=? AND status=\'SENT\'')
        .get(config.borrowerId,input.facts.collectionDate);
      if (!prior) throw new Error('Original confirmed send is required');
      const existing = db.prepare('SELECT status FROM review_resends WHERE revision=?').get(revision);
      if (existing) console.log(JSON.stringify({status:'BLOCKED_DUPLICATE',previousStatus:existing.status}));
      else {
        db.prepare(`INSERT INTO review_resends VALUES (?,?,?,?,?,?,'PENDING',?,NULL,NULL)`)
          .run(revision,prior.token,config.recipient,message,JSON.stringify(input.facts),authorization,new Date().toISOString());
        console.log(JSON.stringify({status:'READY',revision,recipient:config.recipient,message},null,2));
      }
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  } else if (command === 'confirm' || command === 'unknown') {
    const [revision, ...evidenceParts] = process.argv.slice(3);
    const evidence = evidenceParts.join(' ');
    if (!config.authorizedResendRevisions?.includes(revision) || !evidence.trim())
      throw new Error('Allowed revision and evidence required');
    const result = db.prepare(`UPDATE review_resends SET status=?,sent_at=?,evidence=? WHERE revision=? AND status='PENDING'`)
      .run(command==='confirm'?'SENT':'UNKNOWN',command==='confirm'?new Date().toISOString():null,evidence,revision);
    if(result.changes!==1)throw new Error('No pending revision');
    console.log(JSON.stringify({status:command==='confirm'?'SENT':'UNKNOWN',revision}));
  } else throw new Error('Use reserve <private input.json>, confirm <revision> <evidence>, or unknown <revision> <reason>');
} catch(error) { console.error(error.message); process.exitCode=1; }
finally {db.close();}
