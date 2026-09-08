import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';

const categories={BALANCE_DISPUTE:'โต้แย้งยอดค้าง',PAYMENT_DISPUTE:'โต้แย้งประวัติชำระ',EXTENSION:'ขอเลื่อนชำระ',FEE_WAIVER:'ขอลดหรือยกเว้นค่าปรับ',TERM_CHANGE:'ขอเปลี่ยนเงื่อนไข',NEW_LOAN:'ขอสินเชื่อใหม่',DEFAULT:'ขอหารือการผิดนัด',SOURCE_CONFLICT:'ข้อมูลไม่ตรงกัน',UNUSUAL:'ข้อความที่ต้องให้ผู้ดูแลตรวจสอบ'};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const required=x=>typeof x==='string'&&x.trim().length>0;
const fresh=(at,now)=>{const age=now-Date.parse(at);if(!Number.isFinite(age)||age<0||age>300000)throw Error('Fresh evidence required');};
export function exceptionHold(db,borrower){
  if(!db.prepare("SELECT name FROM sqlite_master WHERE name='collection_exceptions'").get())return [];
  return db.prepare("SELECT id,category,status FROM collection_exceptions WHERE borrower=? AND status<>'RESOLVED'").all(borrower);
}
export class Exceptions{
  constructor(path,config){this.config=config;this.db=new DatabaseSync(path);this.db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS collection_exceptions(id TEXT PRIMARY KEY,borrower TEXT,source_key TEXT UNIQUE,category TEXT,status TEXT,data TEXT);
    CREATE TABLE IF NOT EXISTS exception_audit(id INTEGER PRIMARY KEY,case_id TEXT,event TEXT,data TEXT,at TEXT);
    CREATE TABLE IF NOT EXISTS exception_replies(source_key TEXT PRIMARY KEY,case_id TEXT);`);}
  close(){this.db.close();}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  get(id){const r=this.db.prepare('SELECT * FROM collection_exceptions WHERE id=?').get(id);if(!r)throw Error('Unknown case');return {...r,data:JSON.parse(r.data)};}
  list(){return this.db.prepare('SELECT id,category,status,source_key FROM collection_exceptions WHERE borrower=?').all(this.config.borrowerId);}
  save(r){this.db.prepare('UPDATE collection_exceptions SET status=?,data=? WHERE id=?').run(r.status,JSON.stringify(r.data),r.id);}
  audit(id,event,data,now){this.db.prepare('INSERT INTO exception_audit(case_id,event,data,at) VALUES (?,?,?,?)').run(id,event,JSON.stringify(data),now.toISOString());}
  capture(x,now=new Date()){
    if(!this.config.exceptions?.enabled)throw Error('Exception build disabled');
    fresh(x.observedAt,now);
    if(x.borrowerId!==this.config.borrowerId||!categories[x.category]||!['instagram-live-ui','appsheet-live-ui'].includes(x.source)||![x.sourceKey,x.evidence,x.summary,x.recommendation].every(required))throw Error('Grounded case details required');
    if(x.source==='instagram-live-ui'&&(x.author!==this.config.recipient||x.sender!=='tttlll8709'||x.conversationUrl!==this.config.reminders.conversationUrl||!required(x.messageText)))throw Error('Allowlisted inbound required');
    if(x.source==='appsheet-live-ui'&&x.appId!==this.config.appId)throw Error('Wrong source app');
    if(x.balance!==null){fresh(x.balanceObservedAt,now);if(x.balanceSource!=='appsheet-live-ui'||x.appId!==this.config.appId||!Number.isSafeInteger(x.balance)||x.balance<0)throw Error('Verified balance or explicit null required');}
    return this.tx(()=>{const old=this.db.prepare('SELECT id,status FROM collection_exceptions WHERE source_key=?').get(x.sourceKey);if(old)return {...old,duplicate:true};
      const id=randomUUID(),data={...x,digest:digest(x)};this.db.prepare('INSERT INTO collection_exceptions VALUES (?,?,?,?,?,?)').run(id,x.borrowerId,x.sourceKey,x.category,'OPEN',JSON.stringify(data));this.audit(id,'CAPTURE',x,now);return {id,status:'OPEN'};});
  }
  request(id,now=new Date()){
    return this.tx(()=>{const r=this.get(id),d=r.data;if(r.status!=='OPEN')return {id,status:r.status};
      fresh(d.observedAt,now);if(d.balance!==null)fresh(d.balanceObservedAt,now);
      const token=randomUUID();
      const message=`ถึงผู้ดูแล: ขอคำตัดสินกรณี ${id}\nผู้กู้: ${this.config.borrowerName}\nเรื่อง: ${categories[r.category]}\nยอดค้าง ณ เวลาตรวจสอบ: ${d.balance===null?'ยังยืนยันไม่ได้':d.balance.toLocaleString('en-US')+' บาท'}\nสรุป: ${d.summary}\nข้อความ/หลักฐาน: ${d.messageText??d.evidence}\nข้อเสนอเพื่อพิจารณา: ${d.recommendation}\nกรุณาตอบโดยขึ้นต้น CASE ${id} แล้วระบุ อนุมัติ / ไม่อนุมัติ / ตรวจสอบต่อ พร้อมรายละเอียดที่ชัดเจนค่ะ`;
      d.request={token,message,at:now.toISOString()};r.status='SEND_PENDING';this.save(r);this.audit(id,'REQUEST_RESERVED',d.request,now);return {id,status:r.status,token,recipient:this.config.recipient,message};});
  }
  sent(id,token,evidence,now=new Date()){
    return this.tx(()=>{const r=this.get(id);if(r.status!=='SEND_PENDING'||r.data.request.token!==token||!required(evidence))throw Error('Exact reserved send evidence required');r.status='AWAITING_OPERATOR';r.data.request.sentAt=now.toISOString();this.save(r);this.audit(id,'SENT',evidence,now);return {id,status:r.status};});
  }
  unknown(id,evidence,now=new Date()){
    return this.tx(()=>{const r=this.get(id);if(r.status!=='SEND_PENDING'||!required(evidence))throw Error('Pending send required');r.status='SEND_UNKNOWN';this.save(r);this.audit(id,'SEND_UNKNOWN',evidence,now);return {id,status:r.status};});
  }
  decision(id,x,now=new Date()){
    fresh(x.observedAt,now);
    return this.tx(()=>{const r=this.get(id),d=r.data;
      if(r.status!=='AWAITING_OPERATOR'||x.author!==this.config.recipient||x.source!=='instagram-live-ui'||x.conversationUrl!==this.config.reminders.conversationUrl||x.caseId!==id||x.digest!==d.digest||!['APPROVE','DECLINE','INVESTIGATE'].includes(x.decision)||![x.sourceKey,x.replyText,x.details,x.evidence].every(required)||!x.replyText.startsWith(`CASE ${id} `)||!Number.isFinite(Date.parse(x.replyAt))||Date.parse(x.replyAt)<Date.parse(d.request.sentAt)||Date.parse(x.replyAt)>+now)throw Error('Correlated explicit operator decision required');
      if(this.db.prepare('SELECT 1 FROM exception_replies WHERE source_key=?').get(x.sourceKey))throw Error('Reply already used');
      this.db.prepare('INSERT INTO exception_replies VALUES (?,?)').run(x.sourceKey,id);d.decision=x;r.status=x.decision==='INVESTIGATE'?'INVESTIGATING':x.decision==='APPROVE'?'ACTION_REQUIRED':'RESOLUTION_REQUIRED';this.save(r);this.audit(id,'DECISION',x,now);return {id,status:r.status,automaticFinancialAction:false};});
  }
  resolve(id,x,now=new Date()){
    fresh(x.observedAt,now);
    return this.tx(()=>{const r=this.get(id);
      if(!['ACTION_REQUIRED','RESOLUTION_REQUIRED','INVESTIGATING','SEND_UNKNOWN','OPEN'].includes(r.status)||x.source!=='user'||x.caseId!==id||![x.evidence,x.outcome].every(required)||x.confirmedResolved!==true||x.resumeExistingRules!==true)throw Error('Explicit user resolution and resumption required');
      r.status='RESOLVED';r.data.resolution=x;this.save(r);this.audit(id,'RESOLVED',x,now);return {id,status:r.status,refreshSourcesBeforeResuming:true};});
  }
}
