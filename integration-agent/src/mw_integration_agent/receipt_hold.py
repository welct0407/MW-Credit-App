"""Inform current reviewers about validation holds; never authorize a payment."""
import hashlib
import json
from datetime import datetime
from .config import ConfigurationError
from .receipt_identity import receipt_borrower
from .receipt_rules import BANGKOK,match_account,ReceiptInvalid


def event_key(job):
    return 'receipt-held:'+job['id']+':'+hashlib.sha256(job['detail'].encode()).hexdigest()[:16]


def held_text(job,borrower,language,accounts):
    thai=language=='ไทย'
    def clean(value):return ' '.join(str(value or '').split())[:100] or ('ไม่ทราบ' if thai else 'unavailable')
    try:result=json.loads(job['result'] or '{}')
    except (ValueError,TypeError):result={}
    if not isinstance(result,dict):result={}
    receipt=result.get('receipt') or result.get('extraction') or {}
    if not isinstance(receipt,dict):receipt={}
    account=receipt.get('account_label')
    if not account:
        try:account=match_account(receipt.get('recipient_numbers') or [],accounts)['label']
        except ReceiptInvalid:pass
    reasons={
      'POSSIBLE_EXISTING_PAYMENT_REVIEW':('An existing payment has the same bank reference but its records need reconciliation.','พบรายการที่ใช้เลขอ้างอิงธนาคารเดียวกัน ต้องตรวจสอบความสอดคล้องของข้อมูล'),
      'PAYMENT_ALREADY_RECORDED':('This bank reference is already recorded. Check the existing payment.','เลขอ้างอิงนี้บันทึกแล้ว กรุณาตรวจสอบรายการเดิม'),
      'AMOUNT_UNREADABLE':('The receipt amount could not be read.','อ่านจำนวนเงินในสลิปไม่ได้'),
      'DATE_UNREADABLE':('The receipt date could not be read.','อ่านวันที่ในสลิปไม่ได้'),
      'DATE_OUTSIDE_TODAY_YESTERDAY':('The receipt is outside the allowed today/yesterday dates.','วันที่ในสลิปไม่ใช่วันนี้หรือเมื่อวาน'),
      'RECEIPT_TIME_UNREADABLE':('The transfer time could not be read.','อ่านเวลาโอนไม่ได้'),
      'REFERENCE_UNREADABLE':('The bank reference could not be read.','อ่านเลขอ้างอิงธนาคารไม่ได้'),
      'RECIPIENT_UNKNOWN_OR_AMBIGUOUS':('The receiving account could not be uniquely matched.','ไม่สามารถระบุบัญชีรับเงินได้แน่ชัด'),
      'RECIPIENT_UNREADABLE':('The receiving account could not be read.','อ่านบัญชีรับเงินไม่ได้'),
      'TRANSFER_NOT_CONFIRMED':('The image does not confirm a successful transfer.','ภาพไม่ยืนยันว่าโอนเงินสำเร็จ'),
      'RECEIPT_PROCESSING_UNAVAILABLE':('Receipt extraction remained unavailable after retries.','ระบบอ่านสลิปไม่สำเร็จหลังลองซ้ำ'),
      'RECEIPT_RETRY_LIMIT':('Receipt processing could not finish after three attempts.','ระบบประมวลผลสลิปไม่สำเร็จหลังลองสามครั้ง'),
      'RECEIPT_PROPOSAL_UNAVAILABLE':('The payment proposal could not be prepared. Please check the receipt and app records.','ระบบเตรียมรายการชำระเงินไม่ได้ กรุณาตรวจสอบสลิปและรายการในแอป'),
      'BALANCES_REQUIRE_RECONCILIATION':('The loan balances need reconciliation.','ยอดคงเหลือของสัญญาต้องตรวจสอบ'),
      'LOAN_CLOSE_AMBIGUOUS':('The amount matches more than one possible loan payoff.','ยอดเงินตรงกับยอดปิดมากกว่าหนึ่งสัญญา'),
    }
    reason=reasons.get(job['detail'],('Receipt validation could not be completed.','ตรวจสอบสลิปไม่สำเร็จ'))[int(thai)]
    captured=datetime.fromtimestamp(job['created_at'],BANGKOK).strftime('%Y-%m-%d %H:%M')
    name=(borrower or {}).get('name_th' if thai else 'name_en')
    if thai:
        subject='สลิปถูกพักไว้ กรุณาตรวจสอบ'
        body=f'{subject}\nผู้กู้: {clean(name)}\nรับสลิป: {captured} (เวลาไทย)\nข้อมูลที่อ่านได้ (ยังไม่ยืนยัน): {clean(receipt.get("amount"))} บาท · {clean(receipt.get("date"))} {clean(str(receipt.get("time") or "")[:5])}\nบัญชีรับ: {clean(account)}\nสาเหตุ: {reason}\nระบบยังไม่ได้บันทึก กรุณาตรวจสอบสลิปกับรายการในแอป การตอบอนุมัติข้อความนี้จะไม่ทำให้ระบบบันทึกหรือข้ามการตรวจสอบ'
    else:
        subject='Receipt held — reviewer attention needed'
        body=f'{subject}\nBorrower: {clean(name)}\nCaptured: {captured} (Bangkok)\nRead from image (unverified): {clean(receipt.get("amount"))} baht · {clean(receipt.get("date"))} {clean(str(receipt.get("time") or "")[:5])}\nAccount: {clean(account)}\nReason: {reason}\nNo payment posted. Check the receipt against the app records. Replying approve to this alert cannot post a payment or bypass validation.'
    body+= ('\nหากต้องการนำออกจากคิว ให้ตอบกลับข้อความนี้ว่า Reject หรือ ปฏิเสธ' if thai else
            '\nTo remove it from the queue, use Reply on this message and send Reject.')
    return subject,body


def queue_holds(config,journal,notices,live,identity_reader,failures=None):
    from .review_cycle import isolated
    failures=[] if failures is None else failures
    cutoff=config.get('receipt_hold_notice_cutoff')
    if not cutoff:return
    reviewers=[p for p in live['partners'] if p['id'] in live.get('reviewer_ids',[])]
    if not reviewers:return
    # Owner requested an end-to-end audit: surface existing unresolved holds too,
    # without reopening or posting them. The switch still controls alert activation.
    for job in journal.db.execute("SELECT * FROM receipt_jobs WHERE status='REVIEW'").fetchall():
        with isolated(failures,'hold-alert'):
            job=dict(job);event=event_key(job)
            pending=[p for p in reviewers if not notices.db.execute('SELECT 1 FROM partner_notices WHERE event_key=? AND partner_id=?',(event,p['id'])).fetchone()]
            if not pending:continue
            try:borrower=receipt_borrower(config,job,journal,live,identity_reader)
            except Exception:borrower=None
            for partner in pending:
                with isolated(failures,'hold-recipient'):
                    subject,body=held_text(job,borrower,partner['language'],live['accounts'])
                    notices.reserve(event,partner,subject,body)
