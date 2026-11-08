"""Inform current reviewers about validation holds; never authorize a payment."""
import hashlib
import json
import re
import time
from datetime import datetime
from .receipt_identity import receipt_borrower
from .payer_name import display
from .receipt_rules import BANGKOK,match_account,ReceiptInvalid


def event_key(job):
    return 'receipt-held:'+job['id']+':'+hashlib.sha256(job['detail'].encode()).hexdigest()[:16]


RESENT=re.compile(r':resend:[0-9a-f]{64}$')


def base_key(key):
    """R135: a hold copy resent by the reviewer `review` command is `<event_key(job)>:resend:<sha256 of the command>`;
    its hold is the one the original alert names. Any other key is returned unchanged."""
    return RESENT.sub('',key)


def resend_key(job,token):
    return event_key(job)+':resend:'+token


def still_held(job,thai,now):
    """'Still held since 5 Nov (3 days)': Bangkok calendar days since the receipt was captured."""
    from .partner_review import short_date
    since=datetime.fromtimestamp(job['created_at'],BANGKOK).date();days=max(0,(datetime.fromtimestamp(now,BANGKOK).date()-since).days)
    day=short_date(since.isoformat(),thai)
    if thai:return f'ยังพักไว้ตั้งแต่ {day} ({days} วัน)'
    return f'Still held since {day} ({days} day{"" if days==1 else "s"})'


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


REASONS={
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
    # R135 (Echo): every other code that can hold a receipt (receipt_run images, review_cycle proposals).
    'IG_CONVERSATION_IDENTITY_AMBIGUOUS':('Could not confirm which Instagram account sent this slip, so the borrower is unknown. Check the slip and the chat.','ยืนยันบัญชี Instagram ของผู้ส่งสลิปไม่ได้ จึงระบุผู้กู้ไม่ได้ กรุณาตรวจสอบสลิปและแชท'),
    'IG_SENDER_INVALID':("The sender's Instagram account is not valid for a borrower slip.",'บัญชี Instagram ของผู้ส่งไม่ถูกต้องสำหรับสลิปผู้กู้'),
    'EXPLICIT_NON_THB_CURRENCY':('The slip shows a currency other than baht.','สลิปแสดงสกุลเงินที่ไม่ใช่บาท'),
    'FORWARDER_UNMAPPED':("The forwarding partner's Instagram account is missing or duplicated in the app.",'บัญชี Instagram ของผู้ส่งต่อสลิปในแอปไม่มีหรือซ้ำกัน'),
    'FORWARDED_GROUP_NOT_ELIGIBLE':('The group chat this slip was forwarded in does not meet the forwarding rules.','กลุ่มแชทที่ส่งต่อสลิปไม่เข้าเงื่อนไขการส่งต่อ'),
    'FORWARDED_GROUP_AMBIGUOUS':('The group chat members could not be identified clearly.','ระบุสมาชิกในกลุ่มแชทได้ไม่ชัดเจน'),
    'FORWARDED_GROUP_MISSING':('The group chat this slip came from could not be found.','ไม่พบกลุ่มแชทที่ส่งสลิปนี้'),
    'FORWARDED_BORROWER_CHANGED':('The group chat members changed after the slip was sent.','สมาชิกกลุ่มแชทเปลี่ยนไปหลังส่งสลิป'),
    'BORROWER_CHANGED':('The borrower for this slip changed in the app after it was read.','ข้อมูลผู้กู้ของสลิปนี้ในแอปเปลี่ยนไปหลังอ่านสลิป'),
    'LOAN_KEY_UNAVAILABLE':('The loan details could not be read from the app.','อ่านข้อมูลสัญญาจากแอปไม่ได้'),
    'PAY_FORWARD_PLAN_UNAVAILABLE':('The pay-forward plan could not be calculated.','ระบบคำนวณการชำระล่วงหน้าไม่ได้'),
    'WHOLE_BAHT_REQUIRED':('The amount includes satang; the agent posts whole baht only.','ยอดเงินมีเศษสตางค์ ระบบบันทึกได้เฉพาะจำนวนเต็มบาท'),
    'MULTIPLE_TODAY_CHARGES':('A loan has more than one charge dated today. Check the charges in the app.','มีสัญญาที่มีรายการเรียกเก็บวันนี้มากกว่าหนึ่งรายการ กรุณาตรวจสอบในแอป'),
    'REVIEW_REQUEST_TOO_LONG':('The approval request was too long to send by Instagram.','คำขออนุมัติยาวเกินกว่าจะส่งทาง Instagram ได้'),
}
FALLBACK=('Receipt validation could not be completed. Check the slip against the app.','ตรวจสอบสลิปไม่สำเร็จ กรุณาตรวจสอบสลิปกับรายการในแอป')


def held_text(job,borrower,language,accounts,borrowers=(),resent_at=None):
    """The hold alert. resent_at (R135, the `review` command): the copy starts with how long the receipt has been held."""
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
    reason=REASONS.get(job['detail'],FALLBACK)[int(thai)]
    captured,name=captured_name(job,borrower,thai)
    payer=clean(display(receipt.get('payer_name')),thai)
    choice=payer_choice(job['detail'],result,borrowers,thai)
    if thai:
        subject='สลิปถูกพักไว้ กรุณาตรวจสอบ'
        body=f'{subject}\nผู้กู้: {name}\nรับสลิป: {captured} (เวลาไทย)\nข้อมูลที่อ่านได้ (ยังไม่ยืนยัน): {clean(receipt.get("amount"),thai)} บาท · {clean(receipt.get("date"),thai)} {clean(str(receipt.get("time") or "")[:5],thai)}\nบัญชีรับ: {clean(account,thai)}\nผู้โอนในสลิป: {payer}\nสาเหตุ: {reason}{choice}\nระบบยังไม่ได้บันทึก กรุณาตรวจสอบสลิปกับรายการในแอป'
    else:
        subject='Receipt held — reviewer attention needed'
        body=f'{subject}\nBorrower: {name}\nCaptured: {captured} (Bangkok)\nRead from image (unverified): {clean(receipt.get("amount"),thai)} baht · {clean(receipt.get("date"),thai)} {clean(str(receipt.get("time") or "")[:5],thai)}\nAccount: {clean(account,thai)}\nPayer on slip: {payer}\nReason: {reason}{choice}\nNo payment posted. Check the receipt against the app records.'
    # R135 (owner): a hold is Reject-only; the one closing block says so and how to record a genuine payment.
    body+=('\nอนุมัติผ่านข้อความนี้ไม่ได้ หากเป็นการชำระจริง กรุณาบันทึกในแอปเอง แล้วใช้ Reply ตอบข้อความนี้ว่า Reject หรือ ปฏิเสธ เพื่อนำออกจากรายการ' if thai else
           '\nThis cannot be approved here. If the payment is genuine, record it in the app yourself. Then use Reply on this message and send Reject to clear it from the list.')
    if resent_at is not None:body=still_held(job,thai,resent_at)+'\n'+body
    return subject,body


CHOICE_REASONS=('PAYER_UNRESOLVED','PAYER_NAME_UNREADABLE')
STEPS={'name':('payer name','ชื่อผู้โอน'),'participants':('payer name among the group members','ชื่อผู้โอนในสมาชิกกลุ่ม'),
       'hint':("forwarder's nickname message",'ชื่อเล่นที่ผู้ส่งต่อแจ้ง'),'due':('the only candidate with a payment due','ผู้กู้รายเดียวที่มียอดครบกำหนด'),
       'amount':('the amount fits only this borrower','ยอดเงินตรงกับผู้กู้รายนี้เท่านั้น')}


def payer_choice(detail,result,borrowers,thai):
    """Weak-context payer holds: candidates (PAYER_UNRESOLVED) and the nickname tip. A hold on a receipt whose borrower
    the payer name chose names that step. '' for every other hold."""
    if detail not in CHOICE_REASONS:
        step=STEPS.get(result.get('payer_step'))
        if not step:return ''
        return f'\nเลือกผู้กู้จาก: {step[1]}' if thai else f'\nBorrower chosen by: {step[0]}'
    # R135: recording or rejecting is the hold's closing block; only the nickname tip stays here.
    action=('\nครั้งหน้าให้ส่งชื่อเล่นผู้กู้ต่อจากสลิปทันที' if thai else "\nNext time, send the borrower's nickname right after the slip.")
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
