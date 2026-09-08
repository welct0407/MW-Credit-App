import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { exceptionHold } from './exception_engine.mjs';
const hash = x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clean = x=>String(x??'').normalize('NFKC').replace(/[\s-]/g,'').toLowerCase();
const amount = x=>Number.isSafeInteger(x)&&x>0;
export function receivingMatch(receipt,account){
  const bank=x=>clean(x).replace(/^ธนาคาร/,'');
  const expected=clean(account.accountNumber),seen=clean(receipt.accountNumber);
  const visible=seen.replace(/[x*•]/g,'');
  const compatible=seen.length===expected.length&&/^\d+$/.test(visible)&&[...seen].every((c,i)=>/[x*•]/.test(c)||c===expected[i]);
  const name=x=>String(x??'').normalize('NFKC').trim().replace(/^(น\.ส\.|นางสาว|นาง|นาย)\s*/,'');
  const names=name(receipt.accountName).split(/\s+/),wanted=name(account.accountName);
  const nameMatches=name(receipt.accountName)===wanted||names[0]===wanted;
  if(bank(receipt.bankName)!==bank(account.bankName)||!compatible||!nameMatches)return 'MISMATCH';
  return seen===expected&&name(receipt.accountName)===wanted?'EXACT':'MASKED_COMPATIBLE';
}
const fresh=(at,now)=>{const age=now-Date.parse(at);if(!Number.isFinite(age)||age<0||age>300000)throw Error('Fresh observed evidence required');};
export class Receipts {
  constructor(path,config,account){
    this.config=config;this.account=account;this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS collection_receipts(id TEXT PRIMARY KEY,source_key TEXT UNIQUE,status TEXT,data TEXT,created_at TEXT);
      CREATE TABLE IF NOT EXISTS receipt_transaction_keys(key TEXT PRIMARY KEY,receipt_id TEXT);
      CREATE TABLE IF NOT EXISTS receipt_audit(id INTEGER PRIMARY KEY,receipt_id TEXT,event TEXT,evidence TEXT,at TEXT);`);
  }
  close(){this.db.close();}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  get(id){const r=this.db.prepare('SELECT * FROM collection_receipts WHERE id=?').get(id);if(!r)throw Error('Unknown receipt');return {...r,data:JSON.parse(r.data)};}
  list(){return this.db.prepare('SELECT id,source_key,status,created_at FROM collection_receipts ORDER BY created_at').all();}
  save(r){this.db.prepare('UPDATE collection_receipts SET status=?,data=? WHERE id=?').run(r.status,JSON.stringify(r.data),r.id);}
  audit(id,event,evidence,now){this.db.prepare('INSERT INTO receipt_audit(receipt_id,event,evidence,at) VALUES (?,?,?,?)').run(id,event,JSON.stringify(evidence),now.toISOString());}
  capture(input,now=new Date()){
    if(!this.config.receipts?.enabled)throw Error('Receipt build disabled');
    if(input.source!=='instagram-live-ui'||input.recipient!==this.config.recipient||input.borrowerId!==this.config.borrowerId||input.sender!=='tttlll8709'||input.conversationUrl!==this.config.reminders.conversationUrl||!input.sourceKey||!input.evidence)throw Error('Grounded allowlisted receipt evidence required');
    fresh(input.observedAt,now);
    return this.tx(()=>{
      const old=this.db.prepare('SELECT id FROM collection_receipts WHERE source_key=?').get(input.sourceKey);
      if(old)return {status:'DUPLICATE_SOURCE',id:old.id};
      const id=randomUUID(),d={...input,issues:[],accountVersion:hash(this.account)};
      if(!amount(d.amount))d.issues.push('Amount missing/invalid');
      if(!d.transferAt||!/(Z|[+-]\d{2}:\d{2})$/.test(d.transferAt)||!Number.isFinite(Date.parse(d.transferAt))||Date.parse(d.transferAt)>+now)d.issues.push('Transfer time missing/ambiguous/future');
      if(!d.bankReference||!clean(d.bankReference))d.issues.push('Transaction reference missing');
      d.receivingMatch=receivingMatch(d,this.account);
      if(d.receivingMatch==='MISMATCH')d.issues.push('Receiving account incomplete or mismatched');
      if(d.confidence!=='high')d.issues.push('Extraction needs review');
      d.digest=hash(input);let status='REVIEW';
      const key=d.bankReference&&clean(d.bankName)?hash([clean(d.bankName),clean(d.bankReference)]):null;
      if(key){const prior=this.db.prepare('SELECT receipt_id FROM receipt_transaction_keys WHERE key=?').get(key);
        if(prior){status='DUPLICATE_REVIEW';d.duplicateOf=prior.receipt_id;}else this.db.prepare('INSERT INTO receipt_transaction_keys VALUES (?,?)').run(key,id);}
      this.db.prepare('INSERT INTO collection_receipts VALUES (?,?,?,?,?)').run(id,input.sourceKey,status,JSON.stringify(d),now.toISOString());
      this.audit(id,'CAPTURE',input,now);return {id,status,issues:d.issues,amount:d.amount,transferAt:d.transferAt,bankReference:d.bankReference,reviewDigest:d.digest};
    });
  }
  approve(id,approval,now=new Date()){
    return this.tx(()=>{const r=this.get(id),d=r.data;
      if(r.status!=='REVIEW')throw Error('Receipt is not available for approval');
      if(approval.digest!==d.digest||approval.source!=='user'||!approval.evidence||!['synthetic-test-authorized','funds-confirmed'].includes(approval.verification))throw Error('Explicit user approval of these exact receipt details required');
      if(approval.verification==='synthetic-test-authorized') {
        if(this.config.testMode!==true||approval.syntheticBorrowerId!==this.config.borrowerId||approval.syntheticAmount!==d.amount||!amount(d.amount)||!/^\d{4}-\d{2}-\d{2}$/.test(approval.syntheticPaymentDate??'')||approval.acceptedIssues?.join('|')!==d.issues.join('|'))throw Error('Explicit synthetic mapping and mismatch acknowledgement required');
      } else if(d.issues.length||d.sampleFromAnotherBorrower===true)throw Error('Resolve missing/mismatched receipt evidence before approval; another borrower sample requires synthetic mapping');
      if(hash(this.account)!==d.accountVersion)throw Error('Receiving account configuration changed');
      r.status='APPROVED';d.approval=approval;this.save(r);this.audit(id,'APPROVE',approval,now);return {id,status:r.status};});
  }
  assess(id,f,now=new Date()){
    this.source(f,now);
    return this.tx(()=>{const r=this.get(id),d=r.data;
      if(!this.config.receipts.autoPostClear)throw Error('Automatic receipt policy disabled');
      if(r.status!=='REVIEW')return {id,status:r.status};
      const concerns=d.issues.filter(x=>x!=='Masked account/name compatible; full identity requires review');
      if(Array.isArray(d.observedConcerns))concerns.push(...d.observedConcerns);
      if(hash(this.account)!==d.accountVersion)concerns.push('Receiving account changed; recheck required');
      if(d.sampleFromAnotherBorrower!==false)concerns.push('Borrower ownership or synthetic mapping needs confirmation');
      const date=Number.isFinite(Date.parse(d.transferAt))?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date(d.transferAt)):null;
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(now);
      if(date!==today||date!==f.paymentDateAllowed)concerns.push('Transfer date requires confirmation');
      if(d.amount>f.totalRemaining)concerns.push('Amount exceeds eligible balance');
      if(f.payments.some(p=>clean(p.bankReference)===clean(d.bankReference)||String(p.notes??'').includes(id)))concerns.push('Possible existing payment');
      d.concerns=[...new Set(concerns)];
      if(d.concerns.length){this.save(r);this.audit(id,'EXCEPTIONS',d.concerns,now);return {id,status:'EXCEPTION',concerns:d.concerns};}
      d.approval={source:'standing-user-policy',verification:'receipt-matched',digest:d.digest,evidence:'User authorized automatic posting of clear receipts; visual evidence only, not bank verification'};
      r.status='APPROVED';this.save(r);this.audit(id,'AUTO_APPROVE',d.approval,now);return {id,status:r.status};});
  }
  requestReview(id,now=new Date()){
    return this.tx(()=>{const r=this.get(id),d=r.data;
      if(!['REVIEW','DUPLICATE_REVIEW'].includes(r.status))return {id,status:r.status};
      const concerns=d.concerns?.length?d.concerns:d.issues;
      if(!concerns.length&&!d.duplicateOf)throw Error('Assess exception before requesting review');
      d.reviewRequest={digest:d.digest,requestedAt:now.toISOString(),concerns:[...concerns,...(d.duplicateOf?['Possible duplicate receipt']:[])],recipient:this.config.recipient};
      d.reviewRequest.message=`ขอตรวจสอบสลิปของคุณ ${this.config.borrowerName} เลขตรวจสอบ ${id} ยอด ${d.amount??'?'} บาทค่ะ พบข้อมูลที่ต้องตรวจสอบ กรุณาตอบยืนยันเลขตรวจสอบนี้ พร้อมยอดและวันที่ชำระ หากยืนยันให้บันทึกรายการนี้ค่ะ`;
      r.status='REVIEW_SEND_PENDING';this.save(r);this.audit(id,'REVIEW_RESERVED',d.reviewRequest,now);return {id,status:r.status,recipient:this.config.recipient,...d.reviewRequest};});
  }
  reviewSent(id,evidence,now=new Date()){
    const r=this.get(id);if(r.status!=='REVIEW_SEND_PENDING'||!evidence?.trim())throw Error('Reserved review and visible evidence required');
    r.status='AWAITING_FRIEND';r.data.reviewRequest.sentAt=now.toISOString();this.save(r);this.audit(id,'REVIEW_SENT',evidence,now);return {id,status:r.status};
  }
  friendConfirm(id,a,now=new Date()){
    return this.tx(()=>{const r=this.get(id),d=r.data,q=d.reviewRequest;
      fresh(a.observedAt,now);
      if(r.status!=='AWAITING_FRIEND'||a.source!=='instagram-live-ui'||a.author!==this.config.recipient||a.conversationUrl!==this.config.reminders.conversationUrl||a.receiptId!==id||a.digest!==q.digest||a.positive!==true||!a.sourceKey||!a.replyText||!a.evidence||Date.parse(a.replyAt)<Date.parse(q.sentAt)||!Number.isFinite(Date.parse(a.replyAt))||Date.parse(a.replyAt)>+now)throw Error('Explicit correlated friend confirmation required');
      if(d.duplicateOf||!amount(d.amount)||!d.bankReference||!Number.isFinite(Date.parse(d.transferAt))||hash(this.account)!==d.accountVersion)throw Error('Resolve duplicate, missing essential data or account change first');
      if(a.acceptedConcerns?.join('|')!==q.concerns.join('|'))throw Error('Confirmation must cover all exceptions');
      const synthetic=d.sampleFromAnotherBorrower!==false;
      if(synthetic&&(this.config.testMode!==true||a.syntheticBorrowerId!==this.config.borrowerId||a.syntheticAmount!==d.amount||!/^\d{4}-\d{2}-\d{2}$/.test(a.syntheticPaymentDate??'')))throw Error('Confirm exact synthetic mapping');
      d.approval={...a,verification:synthetic?'synthetic-test-authorized':'friend-confirmed'};r.status='APPROVED';this.save(r);this.audit(id,'FRIEND_APPROVE',a,now);return {id,status:r.status};});
  }
  recheck(id,evidence,now=new Date()){
    return this.tx(()=>{const r=this.get(id),d=r.data;
      if(!['REVIEW','APPROVED'].includes(r.status)||!evidence?.trim())throw Error('Only unposted review can be rechecked');
      const previous={accountVersion:d.accountVersion,issues:d.issues,digest:d.digest};
      d.issues=d.issues.filter(x=>!['Receiving account incomplete or mismatched','Masked account/name compatible; full identity requires review'].includes(x));
      d.receivingMatch=receivingMatch(d,this.account);
      if(d.receivingMatch==='MISMATCH')d.issues.push('Receiving account incomplete or mismatched');
      d.accountVersion=hash(this.account);delete d.approval;d.digest=hash({original:d.digest,accountVersion:d.accountVersion,issues:d.issues});r.status='REVIEW';this.save(r);this.audit(id,'ACCOUNT_RECHECK',{previous,evidence,result:d.receivingMatch},now);
      return {id,status:r.status,receivingMatch:d.receivingMatch,issues:d.issues,reviewDigest:d.digest};});
  }
  reject(id,evidence,now=new Date()){
    return this.tx(()=>{const r=this.get(id);if(!['REVIEW','DUPLICATE_REVIEW','APPROVED','AWAITING_FRIEND'].includes(r.status)||!evidence?.trim())throw Error('Only unposted receipts may be rejected with review evidence');
      r.status='REJECTED';this.save(r);this.audit(id,'REJECT',evidence,now);return {id,status:r.status};});
  }
  source(f,now){
    fresh(f.observedAt,now);
    if(f.source!=='appsheet-live-ui'||f.synced!==true||f.appId!==this.config.appId||f.borrowerId!==this.config.borrowerId||f.completePaymentSearch!==true||!Array.isArray(f.payments)||!Array.isArray(f.charges)||!f.charges.length)throw Error('Complete live payment search and borrower balances required');
    if(new Set(f.charges.map(r=>r.id)).size!==f.charges.length)throw Error('Duplicate charge rows');
    for(const r of f.charges)if(!r.id||r.borrowerId!==f.borrowerId||![r.due,r.paid,r.remaining].every(n=>Number.isSafeInteger(n)&&n>=0)||r.due-r.paid!==r.remaining)throw Error('Charge balances do not reconcile');
    if(f.charges.reduce((s,r)=>s+r.remaining,0)!==f.totalRemaining)throw Error('Borrower balance mismatch');
  }
  reserve(id,f,now=new Date()){
    this.source(f,now);
    return this.tx(()=>{const r=this.get(id),d=r.data;
      if(r.status!=='APPROVED')return {id,status:r.status};
      if(exceptionHold(this.db,this.config.borrowerId).length)throw Error('Resolve borrower exception before posting');
      if(hash(this.account)!==d.accountVersion)throw Error('Account changed since approval');
      if(this.db.prepare("SELECT id FROM collection_receipts WHERE id<>? AND status NOT IN ('REJECTED','ACK_SENT')").get(id))throw Error('Resolve other receipt holds first');
      if(this.db.prepare("SELECT name FROM sqlite_master WHERE name='master_operations'").get()&&this.db.prepare("SELECT token FROM master_operations WHERE status IN ('PENDING','UNKNOWN')").get())throw Error('Unresolved collection operation');
      const expectedReference=d.approval.verification==='synthetic-test-authorized'?`TEST-${id}`:d.bankReference;
      if(f.payments.some(p=>clean(p.bankReference)===clean(expectedReference)||String(p.notes??'').includes(id)))throw Error('Possible existing AppSheet payment; reconcile instead of posting');
      if(!amount(f.totalRemaining)||d.amount>f.totalRemaining)throw Error('Receipt exceeds current eligible balance');
      const synthetic=d.approval.verification==='synthetic-test-authorized';
      const p=synthetic?d.approval.syntheticPaymentDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d.transferAt));
      if(f.paymentDateAllowed!==p)throw Error('Verify explicit Bangkok transfer date in production form');
      d.before=f;d.posting={borrowerId:this.config.borrowerId,paymentDate:p,amountReceived:d.amount,paymentMethod:'Bank Transfer',bankReference:synthetic?`TEST-${id}`:d.bankReference,notes:`[AI_RECEIPT ${id}] ${d.approval.verification}${synthetic?'; synthetic Lisa test entry; original receipt belongs to another payment.':'; transfer '+d.transferAt+'.'}`,workflow:'Lump Sum'};
      r.status='POSTING';this.save(r);this.audit(id,'RESERVE',d.posting,now);return {id,status:'PAYMENT_READY',...d.posting};});
  }
  unknown(id,evidence,now=new Date()){
    const r=this.get(id);if(!['POSTING','ACK_PENDING','REVIEW_SEND_PENDING'].includes(r.status)||!evidence?.trim())throw Error('No unresolved operation');
    r.status=r.status==='POSTING'?'POST_UNKNOWN':r.status==='REVIEW_SEND_PENDING'?'REVIEW_SEND_UNKNOWN':'ACK_UNKNOWN';this.save(r);this.audit(id,r.status,evidence,now);return {id,status:r.status};
  }
  verify(id,f,now=new Date()){
    this.source(f,now);
    return this.tx(()=>{const r=this.get(id),d=r.data,p=f.payment;
      if(!['POSTING','POST_UNKNOWN'].includes(r.status))throw Error('No pending payment');
      if(!p?.id||p.status!=='Posted'||p.borrowerId!==this.config.borrowerId||p.amountReceived!==d.amount||p.paymentDate!==d.posting.paymentDate||clean(p.bankReference)!==clean(d.posting.bankReference)||!String(p.notes).includes(`[AI_RECEIPT ${id}]`))throw Error('Exact Posted payment readback required');
      if(!Array.isArray(p.allocations)||!p.allocations.length||new Set(p.allocations.map(a=>a.chargeId)).size!==p.allocations.length||new Set(p.allocations.map(a=>a.repaymentId)).size!==p.allocations.length||p.allocations.some(a=>!a.repaymentId||!amount(a.amount)||a.paymentId!==p.id||a.repaymentAmount!==a.amount||a.repaymentChargeId!==a.chargeId)||p.allocations.reduce((n,a)=>n+a.amount,0)!==d.amount)throw Error('Linked allocations/repayments must reconcile');
      if(f.charges.length!==d.before.charges.length)throw Error('Charge population changed; reconcile');
      for(const before of d.before.charges){const after=f.charges.find(c=>c.id===before.id),allocated=p.allocations.filter(a=>a.chargeId===before.id).reduce((n,a)=>n+a.amount,0);
        if(!after||after.due!==before.due||after.paid-before.paid!==allocated)throw Error('Posted charge movement mismatch');}
      if(d.before.totalRemaining-f.totalRemaining!==d.amount)throw Error('Balance reduction mismatch');
      d.verified=f;r.status='POSTED';this.save(r);this.audit(id,'VERIFIED',f,now);return {id,status:'POSTED',remaining:f.totalRemaining};});
  }
  acknowledge(id,f,now=new Date()){
    this.source(f,now);
    return this.tx(()=>{const r=this.get(id),d=r.data;if(r.status!=='POSTED')return {id,status:r.status};
      fresh(f.instagramObservedAt,now);
      if(f.recipient!==this.config.recipient||f.sender!=='tttlll8709'||f.reviewedThroughLatest!==true||f.newUnreviewedReceipt!==false)throw Error('Fresh recipient and latest receipt review required');
      const payment=f.payments.find(p=>p.id===d.verified.payment.id);
      if(!payment||payment.status!=='Posted'||payment.amountReceived!==d.amount)throw Error('Payment no longer confirmed');
      d.message=`คุณ ${this.config.borrowerName} คะ รับชำระ ${d.amount.toLocaleString('en-US')} บาทเรียบร้อยแล้วค่ะ ${f.totalRemaining===0?'ยอดที่ต้องชำระครบแล้ว ขอบคุณค่ะ':'ยอดคงเหลือ '+f.totalRemaining.toLocaleString('en-US')+' บาทนะคะ'}`;
      r.status='ACK_PENDING';this.save(r);this.audit(id,'ACK_RESERVED',d.message,now);return {id,status:'READY',recipient:this.config.recipient,message:d.message};});
  }
  confirmAck(id,evidence,now=new Date()){
    const r=this.get(id);if(r.status!=='ACK_PENDING'||!evidence?.trim())throw Error('Pending acknowledgement and visible evidence required');r.status='ACK_SENT';this.save(r);this.audit(id,'ACK_SENT',evidence,now);return {id,status:r.status};
  }
}
