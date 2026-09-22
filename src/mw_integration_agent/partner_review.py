"""Correlated Partner decisions. No free-form operation or implicit approval."""
import hashlib
import json
import time
from .config import ConfigurationError
from .receipt_rules import username

APPROVE={'yes','approve','approved','อนุมัติ'}


class ReviewStore:
    def __init__(self,db):
        self.db=db
        from .state import is_postgres
        if is_postgres(db):
            return
        db.executescript('''CREATE TABLE IF NOT EXISTS partner_reviews (
          id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE,proposal TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'PENDING',created_at REAL NOT NULL,
          expires_at REAL NOT NULL,deciding_partner TEXT,decision_message TEXT,
          payment_id TEXT,detail TEXT NOT NULL DEFAULT '');
          CREATE TABLE IF NOT EXISTS partner_review_replies (
          message_id TEXT PRIMARY KEY,review_id TEXT NOT NULL,outcome TEXT NOT NULL);''')

    def reserve(self,job_id,proposal,now=None):
        now=time.time() if now is None else now
        value=json.dumps(proposal,sort_keys=True,ensure_ascii=False)
        key=hashlib.sha256(('review:'+job_id+':'+value).encode()).hexdigest()
        with self.db:
            old=self.db.execute('SELECT proposal FROM partner_reviews WHERE job_id=?',(job_id,)).fetchone()
            if old and old[0]!=value:raise ConfigurationError('REVIEW_PROPOSAL_CHANGED')
            self.db.execute('INSERT OR IGNORE INTO partner_reviews(id,job_id,proposal,created_at,expires_at) VALUES (?,?,?,?,?)',
                            (key,job_id,value,now,now+86400))
        return key

    def decide(self,event,notice,partners,identity,now=None,*,reviewer_ids=()):
        now=time.time() if now is None else now
        # Correlation requires our confirmed outbound message and its exact recipient.
        if not notice or notice['ig_status']!='ACCEPTED' or not event.get('reply_to'):
            return 'NOT_CORRELATED'
        if event['reply_to']!=notice['message_id'] or event['sender_id']!=notice.get('recipient_id'):
            return 'NOT_CORRELATED'
        key=notice['event_key'].removeprefix('review:')
        if notice['event_key']!='review:'+key:return 'NOT_CORRELATED'
        partner=[p for p in partners if p['id']==notice['partner_id']]
        if len(partner)!=1:return 'UNAUTHORIZED'
        p=partner[0]
        if p['id'] not in reviewer_ids:return 'NOT_REVIEWER'
        if p['enabled'] is not True or p['language'] not in ('English','ไทย'):return 'UNAUTHORIZED'
        if json.loads(notice['partner'])!=p:return 'PARTNER_CHANGED'
        name=username(p['username'])
        if sum(username(x['username'])==name for x in partners)!=1:return 'UNAUTHORIZED'
        if identity.get('id')!=event['sender_id'] or username(identity.get('username'))!=name:return 'UNAUTHORIZED'
        with self.db:
            old=self.db.execute('SELECT outcome FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone()
            if old:return old[0]
            row=self.db.execute('SELECT * FROM partner_reviews WHERE id=?',(key,)).fetchone()
            if not row:return 'NOT_CORRELATED'
            if event['event_timestamp']<row['created_at'] or event['event_timestamp']>now:return 'INVALID_TIME'
            if row['state']!='PENDING':outcome='ALREADY_DECIDED'
            elif now>row['expires_at']:
                outcome='EXPIRED'
                self.db.execute("UPDATE partner_reviews SET state='EXPIRED' WHERE id=? AND state='PENDING'",(key,))
            else:
                outcome='APPROVED' if event.get('text','').strip().casefold() in APPROVE else 'REJECTED'
                changed=self.db.execute("UPDATE partner_reviews SET state=?,deciding_partner=?,decision_message=? WHERE id=? AND state='PENDING'",
                         (outcome,p['id'],event['message_id'],key)).rowcount
                if not changed:outcome='ALREADY_DECIDED'
            self.db.execute('INSERT INTO partner_review_replies VALUES (?,?,?)',(event['message_id'],key,outcome))
            return outcome


def request_text(proposal,language):
    thai=language=='ไทย'
    if language not in ('English','ไทย'):raise ConfigurationError('REVIEW_LANGUAGE_UNSUPPORTED')
    receipt=proposal['receipt'];borrower=proposal['borrower']
    name=borrower.get('name_th' if thai else 'name_en') or borrower['id']
    close=proposal.get('action')=='Loan Close'
    manual=proposal.get('action')!='Lump Sum'
    if thai:
        subject='ขออนุมัติรายการชำระเงิน'
        action='ตรวจสอบการปิดสัญญาและบันทึกเอง' if close else ('ตรวจสอบยอดเกินและบันทึกเอง' if manual else 'บันทึกการชำระเงิน')
        body=f"{subject}\nผู้กู้: {name}\nยอด: {receipt['amount']} บาท\nเวลาโอน: {receipt['date']} {receipt['time'][:5]}\nบัญชีรับ: {receipt['account_label']}\nรายการที่เสนอ: {action}\nกรุณาใช้ Reply ตอบข้อความนี้ว่า อนุมัติ เพื่อดำเนินการ คำตอบอื่นถือว่าปฏิเสธ ยังไม่ได้บันทึกรายการ"
    else:
        subject='Payment approval requested'
        action='Review loan closure; partner records manually' if close else ('Review overpayment; partner records manually' if manual else 'Record payment')
        body=f"{subject}\nBorrower: {name}\nAmount: {receipt['amount']} baht\nTransferred: {receipt['date']} {receipt['time'][:5]} (Bangkok)\nAccount: {receipt['account_label']}\nProposed: {action}\nUse Reply on THIS message: Yes / Approve / Approved (any case). Other direct replies reject. Nothing has been posted."
    if proposal.get('loan_keys'):body+=('\nสัญญา: ' if thai else '\nLoan: ')+'; '.join(proposal['loan_keys'])
    if manual:
        body+=('\nหากอนุมัติ กรุณาบันทึกรายการในแอปด้วยตนเอง' if thai else
               '\nIf you approve, please record this in the app yourself.')
    if len(body)>1000:raise ConfigurationError('REVIEW_REQUEST_TOO_LONG')
    return subject,body
