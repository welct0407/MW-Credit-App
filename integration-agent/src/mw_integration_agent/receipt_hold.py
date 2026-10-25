"""Inform current reviewers about validation holds; never authorize a payment."""
import hashlib
import json
import time
from datetime import datetime
from .receipt_identity import receipt_borrower
from .payer_name import display
from .receipt_rules import BANGKOK,match_account,ReceiptInvalid


def event_key(job):
    return 'receipt-held:'+job['id']+':'+hashlib.sha256(job['detail'].encode()).hexdigest()[:16]


def clean(value,thai):return ' '.join(str(value or '').split())[:100] or ('ไม่ทราบ' if thai else 'unavailable')


def captured_name(job,borrower,thai):
    return (datetime.fromtimestamp(job['created_at'],BANGKOK).strftime('%Y-%m-%d %H:%M'),
            clean((borrower or {}).get('name_th' if thai else 'name_en'),thai))


def archive_key(job,reason):
    return 'receipt-archive-pending:'+job['id']+':'+reason


def archive_pending_text(job,borrower,language,threshold):
    """Informational delay alert; the job keeps its source URL and keeps retrying."""
    thai=language=='ไทย';hours=max(1,round(threshold/3600));captured,name=captured_name(job,borrower,thai)
    if thai:
        return 'สลิปล่าช้า ระบบยังดำเนินการอยู่',f'สลิปล่าช้า ระบบยังดำเนินการอยู่\nผู้กู้: {name}\nรับสลิป: {captured} (เวลาไทย)\nระบบยังจัดเก็บภาพสลิปเป็นหลักฐานไม่สำเร็จเกิน {hours} ชั่วโมง และกำลังลองใหม่อัตโนมัติ\nยังไม่ได้บันทึกรายการ จะแจ้งอีกครั้งเมื่อบันทึกแล้ว ต้องขออนุมัติ หรือถูกพักไว้ ไม่ต้องตอบข้อความนี้'
    return 'Receipt delayed — still processing',f'Receipt delayed — still processing\nBorrower: {name}\nCaptured: {captured} (Bangkok)\nThe receipt image has not been saved as evidence for over {hours} hour(s). The agent keeps trying automatically.\nNo payment posted yet. You will get another message when it is posted, needs approval or is held. No reply needed.'


def held_text(job,borrower,language,accounts,borrowers=()):
    thai=language=='ไทย'
    try:result=json.loads(job['result'] or '{}')
    except (ValueError,TypeError):result={}
    if not isinstance(result,dict):result={}
    receipt=result.get('receipt') or result.get('extraction') or {}
    if not isinstance(receipt,dict):receipt={}
    account=receipt.get('account_label')
    if not account:
        # 'recipient_numbers' reads rows extracted before R087; the fallback is removed in a later release.
        try:account=match_account(receipt.get('account_numbers',receipt.get('recipient_numbers')) or [],accounts)['label']
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
      # R095 revision 2: weak-context payer holds only (receipt_identity.resolve_payer); copy by Echo.
      'PAYER_UNRESOLVED':("The slip's payer name did not identify one borrower.",'ระบุผู้กู้จากชื่อผู้โอนในสลิปไม่ได้'),
      'PAYER_NAME_UNREADABLE':("The slip's payer name could not be read and no nickname was sent.",'อ่านชื่อผู้โอนในสลิปไม่ได้ และไม่ได้ส่งชื่อเล่นผู้กู้มา'),
      'RECEIPT_ARCHIVE_UNAVAILABLE':('The receipt image could not be kept as evidence (no longer available or failed an integrity check). Ask the borrower to resend it if needed.','ระบบจัดเก็บภาพสลิปเป็นหลักฐานไม่ได้ (ภาพไม่มีแล้วหรือข้อมูลไม่ตรงกัน) หากจำเป็นให้ขอสลิปจากผู้กู้ใหม่'),
    }
    reason=reasons.get(job['detail'],('Receipt validation could not be completed.','ตรวจสอบสลิปไม่สำเร็จ'))[int(thai)]
    captured,name=captured_name(job,borrower,thai)
    payer=clean(display(receipt.get('payer_name')),thai)
    choice=payer_choice(job['detail'],result,borrowers,thai)
    if thai:
        subject='สลิปถูกพักไว้ กรุณาตรวจสอบ'
        body=f'{subject}\nผู้กู้: {name}\nรับสลิป: {captured} (เวลาไทย)\nข้อมูลที่อ่านได้ (ยังไม่ยืนยัน): {clean(receipt.get("amount"),thai)} บาท · {clean(receipt.get("date"),thai)} {clean(str(receipt.get("time") or "")[:5],thai)}\nบัญชีรับ: {clean(account,thai)}\nผู้โอนในสลิป: {payer}\nสาเหตุ: {reason}{choice}\nระบบยังไม่ได้บันทึก กรุณาตรวจสอบสลิปกับรายการในแอป การตอบอนุมัติข้อความนี้จะไม่ทำให้ระบบบันทึกหรือข้ามการตรวจสอบ'
    else:
        subject='Receipt held — reviewer attention needed'
        body=f'{subject}\nBorrower: {name}\nCaptured: {captured} (Bangkok)\nRead from image (unverified): {clean(receipt.get("amount"),thai)} baht · {clean(receipt.get("date"),thai)} {clean(str(receipt.get("time") or "")[:5],thai)}\nAccount: {clean(account,thai)}\nPayer on slip: {payer}\nReason: {reason}{choice}\nNo payment posted. Check the receipt against the app records. Replying approve to this alert cannot post a payment or bypass validation.'
    body+= ('\nหากต้องการนำออกจากคิว ให้ตอบกลับข้อความนี้ว่า Reject หรือ ปฏิเสธ' if thai else
            '\nTo remove it from the queue, use Reply on this message and send Reject.')
    return subject,body


CHOICE_REASONS=('PAYER_UNRESOLVED','PAYER_NAME_UNREADABLE')
STEPS={'name':('payer name','ชื่อผู้โอน'),'participants':('payer name among the group members','ชื่อผู้โอนในสมาชิกกลุ่ม'),
       'hint':("forwarder's nickname message",'ชื่อเล่นที่ผู้ส่งต่อแจ้ง'),'due':('the only candidate with a payment due','ผู้กู้รายเดียวที่มียอดครบกำหนด'),
       'amount':('the amount fits only this borrower','ยอดเงินตรงกับผู้กู้รายนี้เท่านั้น')}


def payer_choice(detail,result,borrowers,thai):
    """Weak-context payer holds: candidates (PAYER_UNRESOLVED) and how to record it. A hold on a receipt whose borrower
    the payer name chose names that step. '' for every other hold."""
    if detail not in CHOICE_REASONS:
        step=STEPS.get(result.get('payer_step'))
        if not step:return ''
        return f'\nเลือกผู้กู้จาก: {step[1]}' if thai else f'\nBorrower chosen by: {step[0]}'
    action=('\nบันทึกรายการในแอป (ระบบจะเก็บชื่อผู้โอนไว้ใช้ครั้งถัดไป) หรือตอบกลับว่า Reject ครั้งหน้าให้ส่งชื่อเล่นผู้กู้ต่อจากสลิปทันที' if thai else
            "\nRecord it in the app (the payer name is saved for next time) or reply Reject. Next time, send the borrower's nickname right after the slip.")
    if detail=='PAYER_NAME_UNREADABLE':return action
    ids=result.get('payer_candidates') if isinstance(result.get('payer_candidates'),list) else []
    known={b['id']:b for b in borrowers}
    names=[clean(known[i].get('name_th' if thai else 'name_en') or i,thai)[:40] for i in ids if i in known][:5]
    listed=', '.join(names) or ('ไม่มี' if thai else 'none')
    return (f'\nผู้กู้ที่เป็นไปได้: {listed}' if thai else f'\nPossible borrowers: {listed}')+action


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
                    subject,body=held_text(job,borrower,partner['language'],live['accounts'],live.get('borrowers',()))
                    notices.reserve(event,partner,subject,body)
    threshold=config.get('receipt_archive_alert_seconds',3600)
    for job in journal.db.execute("SELECT * FROM receipt_jobs WHERE status='PENDING' AND detail='RECEIPT_ARCHIVE_PENDING' AND created_at<?",
                                  (time.time()-threshold,)).fetchall():
        with isolated(failures,'archive-alert'):
            job=dict(job)
            asset=journal.db.execute('SELECT last_error_code FROM receipt_assets WHERE job_id=?',(job['id'],)).fetchone()
            event=archive_key(job,(asset and asset['last_error_code']) or 'RECEIPT_ARCHIVE_PENDING')
            pending=[p for p in reviewers if not notices.db.execute('SELECT 1 FROM partner_notices WHERE event_key=? AND partner_id=?',(event,p['id'])).fetchone()]
            if not pending:continue
            try:borrower=receipt_borrower(config,job,journal,live,identity_reader)
            except Exception:borrower=None
            for partner in pending:
                with isolated(failures,'archive-recipient'):
                    notices.reserve(event,partner,*archive_pending_text(job,borrower,partner['language'],threshold))
