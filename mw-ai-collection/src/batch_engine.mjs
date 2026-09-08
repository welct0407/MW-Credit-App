import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {clock} from './master_engine.mjs';
import {collectionMessage} from './message_template.mjs';

export function batchEnabled(config, now=new Date()) {
  return config.dailyBatch?.enabled===true && clock(now).date>=config.dailyBatch.activationDate;
}
export class DailyBatch {
  constructor(path,config){
    this.config=config; this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS daily_batches(date TEXT PRIMARY KEY,manifest TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS daily_batch_items(token TEXT PRIMARY KEY,date TEXT NOT NULL,borrower TEXT NOT NULL,position INTEGER NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL, message TEXT,facts TEXT,version TEXT,evidence TEXT,UNIQUE(date,borrower));
      CREATE TABLE IF NOT EXISTS daily_batch_events(id INTEGER PRIMARY KEY,token TEXT,at TEXT NOT NULL,event TEXT NOT NULL,detail TEXT NOT NULL);`);
  }
  close(){this.db.close();}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  event(token,event,detail,now){this.db.prepare('INSERT INTO daily_batch_events(token,at,event,detail) VALUES(?,?,?,?)').run(token,now.toISOString(),event,JSON.stringify(detail));}
  fresh(at,now){const age=now-Date.parse(at);if(!Number.isFinite(age)||age<0||age>this.config.maxSnapshotAgeSeconds*1000)throw Error('Fresh observation required');}
  window(now){if(!batchEnabled(this.config,now)||clock(now).hour!==11)throw Error('Batch sending only during enabled 11:00 Bangkok hour');}
  source(f,now){
    this.fresh(f.observedAt,now);
    if(f.appId!==this.config.appId||f.source!=='appsheet-live-ui'||f.synced!==true||f.appToday!==clock(now).date)throw Error('Synced production source/date required');
  }
  create(manifest,now=new Date()){
    this.window(now);this.source(manifest,now);
    const rows=manifest.borrowers;
    if(manifest.completeBoard!==true||!Array.isArray(rows)||manifest.boardBorrowerCount!==rows.length||new Set(rows.map(r=>r.borrowerId)).size!==rows.length||rows.some(r=>!r.borrowerId||!r.borrowerName?.trim()))throw Error('Complete distinct board roster required');
    return this.tx(()=>{
      if(this.db.prepare('SELECT 1 FROM daily_batches WHERE date=?').get(manifest.appToday))return this.summary(manifest.appToday);
      this.db.prepare('INSERT INTO daily_batches VALUES(?,?,?)').run(manifest.appToday,JSON.stringify(manifest),now.toISOString());
      rows.forEach((r,i)=>this.db.prepare('INSERT INTO daily_batch_items(token,date,borrower,position,name,status) VALUES(?,?,?,?,?,?)').run(randomUUID(),manifest.appToday,r.borrowerId,i,r.borrowerName.trim(),'QUEUED'));
      this.event(null,'CREATED',{date:manifest.appToday,count:rows.length},now);return this.summary(manifest.appToday);
    });
  }
  get(token){const r=this.db.prepare('SELECT * FROM daily_batch_items WHERE token=?').get(token);if(!r)throw Error('Unknown batch token');return r;}
  summary(date=clock().date){
    const rows=this.db.prepare('SELECT token,borrower,position,name,status FROM daily_batch_items WHERE date=? ORDER BY position').all(date);
    const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;
    const exists=!!this.db.prepare('SELECT 1 FROM daily_batches WHERE date=?').get(date);
    return {date,status:!exists?'NOT_CREATED':rows.every(r=>['SENT','SKIPPED_PAID','SKIPPED_EXISTING'].includes(r.status))?'COMPLETE':'INCOMPLETE',total:rows.length,counts,items:rows};
  }
  blockers(borrower){
    const has=t=>this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    if(has('collection_exceptions')&&this.db.prepare("SELECT 1 FROM collection_exceptions WHERE borrower=? AND status<>'RESOLVED'").get(borrower))return true;
    if(borrower===this.config.borrowerId){
      if(has('collection_receipts')&&this.db.prepare("SELECT 1 FROM collection_receipts WHERE status NOT IN ('ACK_SENT','REJECTED')").get())return true;
      if(has('master_operations')&&this.db.prepare("SELECT 1 FROM master_operations WHERE borrower=? AND status IN ('PENDING','UNKNOWN')").get(borrower))return true;
      if(has('reminder_sessions')&&this.db.prepare('SELECT state FROM reminder_sessions').all().some(r=>{const s=JSON.parse(r.state);return s.hold||s.pendingToken;}))return true;
    }
    return false;
  }
  prepare(token,f,paymentBlock,now=new Date()){
    this.window(now);this.source(f,now);
    for(const k of ['todayRemaining','overdueRemaining','totalRemaining'])if(!Number.isSafeInteger(f[k])||f[k]<0)throw Error('Invalid amount');
    if(f.todayRemaining+f.overdueRemaining!==f.totalRemaining||f.allCollectionChargesObserved!==true||!Array.isArray(f.chargeIds)||new Set(f.chargeIds).size!==f.chargeIds.length||f.chargeIds.some(x=>typeof x!=='string'||!x)||f.totalRemaining>0&&!f.chargeIds.length)throw Error('Incomplete/unreconciled borrower facts');
    if(!Object.hasOwn(f,'hold')||f.hold!==null||this.blockers(f.borrowerId))throw Error('Borrower held for review');
    if(!paymentBlock?.trim())throw Error('Approved payment block required');
    return this.tx(()=>{
      const r=this.get(token);
      if(!['QUEUED','PREPARED'].includes(r.status))throw Error('Cannot overwrite attempted or completed message');
      if(r.date!==f.appToday||r.borrower!==f.borrowerId||r.name!==f.borrowerName)throw Error('Roster identity mismatch');
      const has=t=>this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
      const old=has('initial_messages')?this.db.prepare('SELECT status FROM initial_messages WHERE borrower_id=? AND collection_date=?').get(r.borrower,r.date):null;
      const master=has('master_operations')?this.db.prepare("SELECT status FROM master_operations WHERE borrower=? AND date=? AND kind='MESSAGE' AND slot='11'").get(r.borrower,r.date):null;
      const previous=old||master;
      const status=previous?(previous.status==='SENT'?'SKIPPED_EXISTING':'REVIEW'):f.totalRemaining===0?'SKIPPED_PAID':'PREPARED';
      const message=collectionMessage(f,paymentBlock);
      this.db.prepare('UPDATE daily_batch_items SET status=?,message=?,facts=?,version=? WHERE token=?').run(status,message,JSON.stringify(f),'friends-2026-09-08',token);
      this.event(token,status,{facts:f,message},now);return this.get(token);
    });
  }
  start(token,inbox,now=new Date()){
    this.window(now);this.fresh(inbox.observedAt,now);
    if(inbox.sender!=='tttlll8709'||inbox.recipient!==this.config.recipient||inbox.conversationUrl!==this.config.reminders.conversationUrl||inbox.reviewedThroughLatest!==true||inbox.composerEmpty!==true||inbox.hold!==null)throw Error('Fresh clear exact inbox required');
    return this.tx(()=>{
      const r=this.get(token);if(r.status!=='PREPARED'||r.date!==clock(now).date)throw Error('No current prepared message');
      this.source(JSON.parse(r.facts),now);
      if(this.blockers(r.borrower))throw Error('Borrower held');
      if(this.db.prepare("SELECT 1 FROM daily_batch_items WHERE status IN ('SENDING','REVIEW')").get())throw Error('Reconcile unresolved delivery before another send');
      this.db.prepare("UPDATE daily_batch_items SET status='SENDING' WHERE token=? AND status='PREPARED'").run(token);
      this.event(token,'SENDING',inbox,now);return {...this.get(token),recipient:this.config.recipient};
    });
  }
  finish(token,e,now=new Date()){
    this.fresh(e.observedAt,now);
    return this.tx(()=>{
      const r=this.get(token);if(!['SENDING','REVIEW'].includes(r.status))throw Error('No unresolved send');
      if(e.sender!=='tttlll8709'||e.recipient!==this.config.recipient||e.conversationUrl!==this.config.reminders.conversationUrl||e.outboundMessage!==r.message||e.composerEmpty!==true||e.sendingIndicatorAbsent!==true||e.outboundBubbleVerified!==true||!e.evidence?.trim())throw Error('Complete outbound delivery evidence required');
      this.db.prepare("UPDATE daily_batch_items SET status='SENT',evidence=? WHERE token=?").run(JSON.stringify(e),token);this.event(token,'SENT',e,now);return {token,status:'SENT'};
    });
  }
  review(token,reason,now=new Date()){
    if(!reason?.trim())throw Error('Reason required');return this.tx(()=>{const r=this.get(token);if(!['QUEUED','PREPARED','SENDING','REVIEW'].includes(r.status))throw Error('Completed item cannot be changed');this.db.prepare("UPDATE daily_batch_items SET status='REVIEW',evidence=? WHERE token=?").run(reason,token);this.event(token,'REVIEW',reason,now);return {token,status:'REVIEW'};});
  }
}
