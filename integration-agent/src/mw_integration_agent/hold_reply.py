"""Correlated reviewer dismissal of a hold; never creates a payment proposal."""
import hashlib
import time
from datetime import datetime
from .partner_review import authorize_reply
from .receipt_hold import base_key,event_key

REJECT={'reject','rejected','no','ignore','drop','ปฏิเสธ','ไม่อนุมัติ'}
OUTCOMES={'HOLD_REJECTED','HOLD_NOT_ACTIVE','HOLD_REJECT_REQUIRED','HOLD_HAS_REVIEW'}


def result_key(message_id):
    return 'hold-reply-result:'+hashlib.sha256(message_id.encode()).hexdigest()


def decide(db,config,event,notice,partners,identity,reviewer_ids,now=None):
    now=time.time() if now is None else now
    cutoff=config.get('receipt_hold_reply_cutoff')
    if not cutoff:return 'HOLD_REPLIES_DISABLED'
    cutoff=datetime.fromisoformat(cutoff).timestamp()
    if event['event_timestamp']<cutoff or event['captured_at']<cutoff:return 'BEFORE_HOLD_REPLY_CUTOFF'
    denied=authorize_reply(event,notice,partners,identity,reviewer_ids)
    if denied:return denied
    if not notice['event_key'].startswith('receipt-held:'):return 'NOT_CORRELATED'
    with db:
        old=db.execute('SELECT review_id,outcome FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone()
        if old:return old['outcome'] if old['review_id']==notice['event_key'] else 'NOT_CORRELATED'
        job=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(notice['event_key'].split(':')[1],)).fetchone()
        if not job:return 'NOT_CORRELATED'
        if event['event_timestamp']<job['created_at'] or event['event_timestamp']>now:return 'INVALID_TIME'
        # R135: a copy resent by the `review` command names the same hold as the original alert.
        if job['status']!='REVIEW' or event_key(job)!=base_key(notice['event_key']):
            outcome='HOLD_NOT_ACTIVE'
        elif event.get('text','').strip().casefold() not in REJECT:
            outcome='HOLD_REJECT_REQUIRED'
        elif db.execute("SELECT 1 FROM partner_reviews WHERE job_id=? AND state IN ('PENDING','APPROVED','POSTING','POSTED','UNKNOWN')",(job['id'],)).fetchone():
            outcome='HOLD_HAS_REVIEW'
        else:
            changed=db.execute("""UPDATE receipt_jobs SET status='REJECTED',image=NULL,url=''
              WHERE id=? AND status='REVIEW' AND detail=? AND NOT EXISTS
              (SELECT 1 FROM partner_reviews WHERE job_id=? AND state IN ('PENDING','APPROVED','POSTING','POSTED','UNKNOWN'))""",
              (job['id'],job['detail'],job['id'])).rowcount
            outcome='HOLD_REJECTED' if changed else 'HOLD_NOT_ACTIVE'
        # Decision and terminal queue transition commit together. Keep receipt,
        # original hold reason, deduplication keys and signed ingress history.
        db.execute('INSERT INTO partner_review_replies VALUES (?,?,?)',(event['message_id'],notice['event_key'],outcome))
        return outcome


def queue_result(notices,event,notice,partners,outcome):
    if outcome not in OUTCOMES:return
    partner=next(p for p in partners if p['id']==notice['partner_id'])
    thai=partner['language']=='ไทย'
    subject=('ปฏิเสธสลิปที่พักไว้แล้ว' if thai else 'Held receipt rejected') if outcome=='HOLD_REJECTED' else ('ผลการตอบสลิปที่พักไว้' if thai else 'Held receipt reply')
    words={
      'HOLD_REJECTED':('Removed from the review list. The agent recorded or changed no payment. Receipt history is kept.','นำออกจากรายการรอตรวจสอบแล้ว ระบบไม่ได้บันทึกหรือเปลี่ยนแปลงรายการชำระเงิน ยังเก็บประวัติสลิปไว้'),
      'HOLD_NOT_ACTIVE':('That hold is already resolved or has changed. Nothing was changed by this reply.','สลิปที่พักไว้นี้ดำเนินการแล้วหรือมีการเปลี่ยนแปลง คำตอบนี้ไม่ได้เปลี่ยนแปลงข้อมูล'),
      'HOLD_REJECT_REQUIRED':('Held receipts cannot be approved. Use Reply on the hold message and send Reject. If the payment is genuine, record it in the app first.','สลิปที่พักไว้อนุมัติไม่ได้ ใช้ Reply ตอบข้อความแจ้งพักสลิปว่า Reject หรือ ปฏิเสธ หากเป็นการชำระจริง กรุณาบันทึกในแอปก่อน'),
      'HOLD_HAS_REVIEW':('This receipt has a separate payment review or posting outcome. Use its review request or reconcile the recorded outcome; this reply changed nothing.','สลิปนี้มีคำขอตรวจสอบหรือผลการบันทึกแยกต่างหาก กรุณาใช้คำขอตรวจสอบนั้นหรือตรวจสอบผลการบันทึก คำตอบนี้ไม่ได้เปลี่ยนแปลงข้อมูล'),
    }
    notices.reserve(result_key(event['message_id']),partner,subject,subject+'\n'+words[outcome][int(thai)])
