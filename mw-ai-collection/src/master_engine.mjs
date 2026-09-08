import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { collectionMessage } from './message_template.mjs';
import { exceptionHold } from './exception_engine.mjs';

export function clock(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return {date,hour:Number(p.hour),previous:new Date(Date.parse(`${date}T00:00:00Z`)-86400000).toISOString().slice(0,10)};
}
export function target(date, now = new Date()) {
  const c = clock(now);
  return date < c.date ? 500 : date === c.date && c.hour >= 16 ? (c.hour-15)*50 : 0;
}
const money = x => { if(!Number.isSafeInteger(x)||x<0) throw Error('Invalid whole-baht amount'); return x; };
const fmt = x=>x.toLocaleString('en-US');
export class Master {
  constructor(path,config) {
    this.config=config; this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS master_days (borrower TEXT,date TEXT,state TEXT NOT NULL,PRIMARY KEY(borrower,date));
      CREATE TABLE IF NOT EXISTS master_operations (token TEXT PRIMARY KEY,borrower TEXT,date TEXT,kind TEXT,slot TEXT,status TEXT,payload TEXT,evidence TEXT,created_at TEXT,UNIQUE(borrower,date,kind,slot));`);
  }
  close(){this.db.close();}
  days(){return this.db.prepare('SELECT date,state FROM master_days WHERE borrower=? ORDER BY date').all(this.config.borrowerId).map(x=>({...JSON.parse(x.state),date:x.date}));}
  get(date){const r=this.db.prepare('SELECT state FROM master_days WHERE borrower=? AND date=?').get(this.config.borrowerId,date);return r?JSON.parse(r.state):null;}
  save(date,s){this.db.prepare('INSERT INTO master_days VALUES (?,?,?) ON CONFLICT(borrower,date) DO UPDATE SET state=excluded.state').run(this.config.borrowerId,date,JSON.stringify(s));}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try {const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  validate(f,now) {
    const cfg=this.config;
    if(!cfg.master?.enabled) throw Error('Master Build 3 disabled');
    if(f.appId!==cfg.appId||f.borrowerId!==cfg.borrowerId||f.recipient!==cfg.recipient||f.sender!=='tttlll8709') throw Error('Identity mismatch');
    for(const key of ['observedAt','instagramObservedAt']) {
      const age=now-Date.parse(f[key]); if(!Number.isFinite(age)||age<0||age>cfg.maxSnapshotAgeSeconds*1000) throw Error('Fresh source checks required');
    }
    if(f.source!=='appsheet-live-ui'||f.synced!==true||f.reviewedThroughLatest!==true||f.appToday!==clock(now).date) throw Error('Synced live source/date required');
    if(!Object.hasOwn(f,'hold') || (f.hold!==null && typeof f.hold!=='string')) throw Error('Explicit receipt/review hold decision required');
    if(!Array.isArray(f.charges)||new Set(f.charges.map(x=>x.id)).size!==f.charges.length) throw Error('Distinct complete charge rows required');
    if(f.allCollectionChargesObserved!==true) throw Error('Complete borrower collection required');
    for(const r of f.charges){
      if(!r.id||!r.loanId||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.borrowerId!==cfg.borrowerId) throw Error('Charge identity missing');
      ['interestDue','principalDue','paid','remaining'].forEach(k=>money(r[k]));
      if(r.interestDue+r.principalDue-r.paid!==r.remaining) throw Error('Charge does not reconcile');
    }
    const total=f.charges.filter(r=>r.date<=f.appToday).reduce((s,r)=>s+r.remaining,0);
    if(total!==money(f.totalRemaining)) throw Error('Collection does not reconcile');
    return total;
  }
  reserveOperation(date,kind,slot,payload,now){
    const existing=this.db.prepare('SELECT * FROM master_operations WHERE borrower=? AND date=? AND kind=? AND slot=?').get(this.config.borrowerId,date,kind,String(slot));
    if(existing)return {status:'BLOCKED_DUPLICATE',operation:existing};
    const token=randomUUID();
    this.db.prepare('INSERT INTO master_operations VALUES (?,?,?,?,?,?,?,?,?)').run(token,this.config.borrowerId,date,kind,String(slot),'PENDING',JSON.stringify(payload),null,now.toISOString());
    return {status:kind==='FEE'?'WRITE_READY':'READY',token,...payload};
  }
  plan(f,now=new Date(),paymentBlock='') {
    const total=this.validate(f,now),c=clock(now);
    return this.transaction(()=>{
      const unresolved=this.db.prepare("SELECT * FROM master_operations WHERE borrower=? AND status IN ('PENDING','UNKNOWN')").all(this.config.borrowerId);
      if(unresolved.length)return {status:'RECONCILE_REQUIRED',operations:unresolved};
      const cases=exceptionHold(this.db,this.config.borrowerId);
      if(cases.length)return {status:'EXCEPTION_HOLD',cases};
      if(this.db.prepare("SELECT name FROM sqlite_master WHERE name='collection_receipts'").get()) {
        const receipts=this.db.prepare("SELECT id,status FROM collection_receipts WHERE status NOT IN ('REJECTED','ACK_SENT')").all();
        if(receipts.length)return {status:'RECEIPT_HOLD',receipts};
      }
      if(this.db.prepare("SELECT name FROM sqlite_master WHERE name='reminder_sessions'").get()) {
        const legacy=this.db.prepare('SELECT state FROM reminder_sessions').all().map(r=>JSON.parse(r.state));
        if(legacy.some(s=>s.hold || s.pendingToken))return {status:'HOLD',reason:'Existing receipt/review or unresolved legacy send; reconcile first'};
      }
      if(f.hold)return {status:'HOLD',reason:f.hold};
      // Enrol only current dates, never invent historical penalty days.
      if(!this.get(c.date)&&c.hour>=11){
        const rows=f.charges.filter(r=>r.date===c.date&&r.remaining>0).sort((a,b)=>a.id<b.id?-1:1);
        if(total>0&&!rows.length)return {status:'REVIEW_REQUIRED',reason:'No current-day charge available for fixed assignment'};
        if(rows.length){const r=rows[0];if(typeof r.notes!=='string')throw Error('Read assigned charge Notes first');if(r.notes.includes('[AI_COLLECTION'))throw Error('Existing fee marker needs ledger reconciliation');
          this.save(c.date,{chargeId:r.id,loanId:r.loanId,baseInterest:r.interestDue,penalty:0,notes:r.notes,closed:false});}
      }
      for(const day of this.days()) {
        const s=this.get(day.date); if(s.closed)continue;
        const relevant=f.charges.filter(r=>r.date<=day.date).reduce((n,r)=>n+r.remaining,0);
        if(relevant===0){s.closed=true;this.save(day.date,s);continue;}
        const r=f.charges.find(r=>r.id===s.chargeId);
        if(!r||r.date!==day.date||r.loanId!==s.loanId||r.interestDue!==s.baseInterest+s.penalty||r.notes!==s.notes)
          return {status:'REVIEW_REQUIRED',reason:'Assigned charge missing or externally changed',date:day.date,chargeId:s.chargeId};
        const due=target(day.date,now);
        if(due>s.penalty){
          const line=`[AI_COLLECTION ${day.date}] Original interest ${s.baseInterest} THB; cumulative late penalty ${due} THB; Interest Due ${s.baseInterest+due} THB; applied ${now.toISOString()}.`;
          const notes=s.notes+(s.notes?'\n':'')+line;
          return this.reserveOperation(day.date,'FEE',due,{chargeId:r.id,loanId:r.loanId,date:day.date,beforeInterest:r.interestDue,beforeNotes:r.notes,interestDue:s.baseInterest+due,notes,penalty:due,delta:due-s.penalty,beforeTotal:total},now);
        }
      }
      if(total===0)return {status:'PAID'};
      if(c.hour>0&&c.hour<11)return {status:'QUIET_HOURS'};
      const date=c.hour===0?c.previous:c.date,s=this.get(date);
      if(!s||s.closed)return {status:'NO_ACTIVE_DAY'};
      const slot=c.hour===0?'24':String(c.hour);
      if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='daily_batch_items'").get()&&this.db.prepare("SELECT 1 FROM daily_batch_items WHERE status IN ('SENDING','REVIEW')").get())return {status:'BATCH_DELIVERY_REVIEW'};
      // Build 7 owns all daily opening messages, including Lisa's.
      if(c.hour===11&&this.config.dailyBatch?.enabled&&(c.date>=this.config.dailyBatch.activationDate||this.config.dailyBatch.manualCompletedDates?.includes(c.date)))return {status:'OPENING_OWNED_BY_BATCH'};
      // Respect the already-sent opening messages from earlier builds.
      if(c.hour===11&&this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='initial_messages'").get()&&this.db.prepare('SELECT 1 FROM initial_messages WHERE borrower_id=? AND collection_date=?').get(this.config.borrowerId,date))return {status:'BLOCKED_EXISTING_OPENING'};
      let message;
      if(c.hour===11){const today=f.charges.filter(r=>r.date===c.date).reduce((n,r)=>n+r.remaining,0);message=collectionMessage({borrowerName:this.config.borrowerName,todayRemaining:today,overdueRemaining:total-today},paymentBlock);}
      else if(c.hour>=12&&c.hour<=15)message=`คุณ ${this.config.borrowerName} คะ รบกวนส่งยอดก่อน 16.00 น. เพื่อไม่ให้มีค่าปรับล่าช้านะคะ`;
      else {
        const r=f.charges.find(r=>r.id===s.chargeId);
        // Fees and base share Interest Due. Show a transparent payment deduction
        // rather than inventing an allocation between those components.
        const paid=f.charges.filter(r=>r.date<=date).reduce((n,r)=>n+r.paid,0);
        const scoped=f.charges.filter(r=>r.date<=date).reduce((n,r)=>n+r.remaining,0);
        const base=scoped+paid-s.penalty;
        if(!r||base<0)throw Error('Penalty breakdown cannot reconcile');
        message=`คุณ ${this.config.borrowerName} คะ ยอดเดิม ${fmt(base)} บาท ค่าปรับล่าช้ารวม ${fmt(s.penalty)} บาท${paid?` ชำระแล้ว ${fmt(paid)} บาท`:''} รวมยอดที่ต้องชำระ ${fmt(scoped)} บาท รบกวนส่งยอดด้วยนะคะ`;
      }
      return this.reserveOperation(date,'MESSAGE',slot,{recipient:this.config.recipient,message,facts:f},now);
    });
  }
  verifyFee(token,f,now=new Date()) {
    this.validate(f,now);
    return this.transaction(()=>{
      const op=this.db.prepare("SELECT * FROM master_operations WHERE token=? AND kind='FEE' AND status IN ('PENDING','UNKNOWN')").get(token);
      if(!op)throw Error('No unresolved fee');
      const p=JSON.parse(op.payload),r=f.charges.find(r=>r.id===p.chargeId);
      if(!r||r.date!==op.date||r.loanId!==p.loanId||r.interestDue!==p.interestDue||r.notes!==p.notes)throw Error('Saved fee readback mismatch; never retry blindly');
      const s=this.get(op.date);s.penalty=p.penalty;s.notes=p.notes;this.save(op.date,s);
      this.db.prepare("UPDATE master_operations SET status='CONFIRMED',evidence=? WHERE token=?").run(JSON.stringify(f),token);
      return {status:'CONFIRMED',token};
    });
  }
  finish(token,evidence,unknown=false){
    if(!evidence?.trim())throw Error('Visible evidence required');
    const r=this.db.prepare(`UPDATE master_operations SET status=?,evidence=? WHERE token=? AND status='PENDING' ${unknown?'':"AND kind='MESSAGE'"}`).run(unknown?'UNKNOWN':'SENT',evidence,token);
    if(r.changes!==1)throw Error('No matching pending operation');return {status:unknown?'UNKNOWN':'SENT',token};
  }
}
