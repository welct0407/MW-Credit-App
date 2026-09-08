import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {clock,target} from './master_engine.mjs';

export function cycleBrief(db,config,state,now=new Date()){
  const c=clock(now),borrower=config.borrowerId;
  const has=t=>!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const required=['master_days','master_operations','collection_receipts','collection_exceptions'];
  if(config.dailyBatch?.enabled)required.push('daily_batches','daily_batch_items');
  const missing=required.filter(t=>!has(t));
  if(missing.length)return {status:'RECONCILE_REQUIRED',missing,canSkipAppSheetAfterUnchangedInbox:false};
  const operations=db.prepare("SELECT token,kind,status FROM master_operations WHERE borrower=? AND status IN ('PENDING','UNKNOWN')").all(borrower);
  const receipts=db.prepare("SELECT id,status FROM collection_receipts WHERE status NOT IN ('ACK_SENT','REJECTED')").all();
  const cases=db.prepare("SELECT id,category,status FROM collection_exceptions WHERE borrower=? AND status<>'RESOLVED'").all(borrower);
  const days=db.prepare('SELECT date,state FROM master_days WHERE borrower=?').all(borrower).map(r=>({date:r.date,...JSON.parse(r.state)}));
  const catchup=days.filter(d=>!d.closed&&target(d.date,now)>d.penalty).map(d=>({date:d.date,chargeId:d.chargeId,currentPenalty:d.penalty,targetPenalty:target(d.date,now)}));
  const legacy=has('reminder_sessions')?db.prepare('SELECT state FROM reminder_sessions').all().map(r=>JSON.parse(r.state)).filter(s=>s.hold||s.pendingToken):[];
  const held=!!(state.hold||state.sourceIssue||legacy.length);
  const quiet=c.hour>=1&&c.hour<11;
  const batchEnabled=config.dailyBatch?.enabled===true&&c.date>=config.dailyBatch.activationDate;
  const batchOpen=batchEnabled?db.prepare("SELECT token,date,status FROM daily_batch_items WHERE status NOT IN ('SENT','SKIPPED_PAID','SKIPPED_EXISTING') ORDER BY date,position").all():[];
  const batchDue=batchEnabled&&c.hour===11;
  const eligible=quiet&&!held&&!operations.length&&!receipts.length&&!cases.length&&!catchup.length&&!batchOpen.length&&config.master?.enabled===true;
  return {status:eligible?'INBOX_CHECK_ONLY':'WORK_REVIEW',bangkokDate:c.date,hour:c.hour,
    target:{borrowerId:borrower,recipient:config.recipient,sender:'tttlll8709',conversationUrl:config.reminders.conversationUrl},
    lastInboundKey:state.latestInboundKey??null,localHold:state.hold??state.sourceIssue??null,
    pending:{operations:operations.slice(0,10),receipts:receipts.slice(0,10),cases:cases.slice(0,10),counts:{operations:operations.length,receipts:receipts.length,cases:cases.length,legacy:legacy.length}},
    feeCatchup:catchup,canSkipAppSheetAfterUnchangedInbox:eligible,
    dailyBatch:{due:batchDue,needsReview:batchOpen.length>0,openCount:batchOpen.length,open:batchOpen.slice(0,10),runbook:batchDue||batchOpen.length?'BUILD_7_RUNBOOK.md':null},
    instruction:eligible?'Verify live inbox continuity. If no new actionable inbound or uncertainty, exit quietly without AppSheet.':'Inspect only relevant open items; obtain fresh AppSheet facts before any financial action or collection message.'};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8').replace(/^\uFEFF/,''));
  let db;
  try{db=new DatabaseSync(fileURLToPath(new URL('../state/collection.db',import.meta.url)),{readOnly:true});
    console.log(JSON.stringify(cycleBrief(db,json('../config.json'),json('../local/master-cycle-state.json'))));
  }catch(e){console.error('Preflight unavailable: '+e.message);process.exitCode=1;}finally{db?.close();}
}
