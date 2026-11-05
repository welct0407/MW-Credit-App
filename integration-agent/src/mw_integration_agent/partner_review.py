"""Correlated Partner decisions. No free-form operation or implicit approval."""
import hashlib
import json
import re
import time
from .config import ConfigurationError
from .receipt_rules import username

APPROVE={'yes','approve','approved','อนุมัติ'}
# R112, R127 (owner decision 5 November 2026: three options): the options reply. 1 pay forward; 2 (or "2 <n>" with
# several loans) repay principal; 3 recheck (below). The R112 split ("3 <amount>") is withdrawn: it now asks again.
# Reject words drop the slip; anything else asks again (OPTIONS_REQUIRED) and decides nothing (D7: no default).
REJECT={'reject','rejected','ปฏิเสธ'}
# Owner request, 3 November 2026 (option 3 since R127): recheck the slip. The Reviewer edits the charges in the app first
# (for example a late fee), then replies 3; this review is superseded and the receipt is planned again from the current
# charges. Within what is due it is then an ordinary payment (posted under the automatic-payment policy); otherwise a new
# options request. '4' is the pre-R127 number, kept for requests sent before the deploy; remove it in a later release.
RECHECK={'3','4','recheck','ตรวจใหม่'}
RECHECKED='RECHECK_QUEUED'
# 3 November 2026: editing the charges can make the open review STALE before the recheck arrives (a pending notice for it
# is checked against the current charges before it is sent, for example after a "Review" resend). A recheck on a review
# that is stale only because the charges changed still rechecks; other stale reasons (day passed, account changed) do not.
RECHECK_STALE=('PROPOSAL_FACTS_CHANGED','PAY_FORWARD_PLAN_CHANGED')
OPTIONS_REQUIRED='OPTIONS_REQUIRED'
CHOICE=re.compile(r'(1)|(2)(?:\s+([1-9]))?')


def options_choice(text):
    """The numbered reply as {'kind', 'loan'}, or None when it is not 1, 2 or "2 <n>" (the recheck is matched first)."""
    match=CHOICE.fullmatch((text or '').strip())
    if not match:return None
    if match.group(1):return {'kind':'forward'}
    return {'kind':'principal','loan':int(match.group(3)) if match.group(3) else None}


def authorize_reply(event,notice,partners,identity,reviewer_ids):
    """Fresh exact recipient/identity/role authorization shared by review actions."""
    if not notice or notice['ig_status']!='ACCEPTED' or not event.get('reply_to'):
        return 'NOT_CORRELATED'
    if event['reply_to']!=notice['message_id'] or event['sender_id']!=notice.get('recipient_id'):
        return 'NOT_CORRELATED'
    partner=[p for p in partners if p['id']==notice['partner_id']]
    if len(partner)!=1:return 'UNAUTHORIZED'
    p=partner[0]
    if p['id'] not in reviewer_ids:return 'NOT_REVIEWER'
    if p['enabled'] is not True or p['language'] not in ('English','ไทย'):return 'UNAUTHORIZED'
    if json.loads(notice['partner'])!=p:return 'PARTNER_CHANGED'
    name=username(p['username'])
    if sum(username(x['username'])==name for x in partners)!=1:return 'UNAUTHORIZED'
    if identity.get('id')!=event['sender_id'] or username(identity.get('username'))!=name:return 'UNAUTHORIZED'
    return None


def review_id(event_key):
    parts = event_key.split(':')
    # R112: review:<id>:options:<sha256 of the unclear reply> re-sends the options after an unclear reply.
    if parts[0] == 'review' and (len(parts) == 2 or
            (len(parts) == 4 and parts[2] in ('resend', 'options') and len(parts[3]) == 64)):
        return parts[1]
    return None


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
        denied=authorize_reply(event,notice,partners,identity,reviewer_ids)
        if denied:return denied
        key=review_id(notice['event_key'])
        if not key:return 'NOT_CORRELATED'
        p=next(p for p in partners if p['id']==notice['partner_id'])
        with self.db:
            old=self.db.execute('SELECT outcome FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone()
            if old:return old[0]
            row=self.db.execute('SELECT * FROM partner_reviews WHERE id=?',(key,)).fetchone()
            if not row:return 'NOT_CORRELATED'
            if event['event_timestamp']<row['created_at'] or event['event_timestamp']>now:return 'INVALID_TIME'
            rechecking=(json.loads(row['proposal']).get('action')=='Pay forward options'
                        and (event.get('text') or '').strip().casefold() in RECHECK and now<=row['expires_at']
                        and (row['state']=='PENDING' or (row['state']=='STALE' and row['detail'] in RECHECK_STALE)))
            if rechecking:outcome=self._recheck(row,p,event,now)
            elif row['state']!='PENDING':outcome='ALREADY_DECIDED'
            elif now>row['expires_at']:
                outcome='EXPIRED'
                self.db.execute("UPDATE partner_reviews SET state='EXPIRED' WHERE id=? AND state='PENDING'",(key,))
            elif json.loads(row['proposal']).get('action')=='Pay forward options':
                # R112: only a numbered reply naming an offered choice approves; the purpose is the decision's detail.
                from .review_proposal import chosen_purpose
                text=event.get('text') or ''
                choice=options_choice(text)
                purpose=chosen_purpose(json.loads(row['proposal'])['options'],choice) if choice else None
                if text.strip().casefold() in REJECT:outcome,detail='REJECTED',''
                elif purpose:outcome,detail='APPROVED',json.dumps({'purpose':purpose},sort_keys=True,separators=(',',':'))
                else:outcome,detail=OPTIONS_REQUIRED,None
                if detail is not None:
                    changed=self.db.execute("UPDATE partner_reviews SET state=?,deciding_partner=?,decision_message=?,detail=? WHERE id=? AND state='PENDING'",
                             (outcome,p['id'],event['message_id'],detail,key)).rowcount
                    if not changed:outcome='ALREADY_DECIDED'
            else:
                outcome='APPROVED' if event.get('text','').strip().casefold() in APPROVE else 'REJECTED'
                changed=self.db.execute("UPDATE partner_reviews SET state=?,deciding_partner=?,decision_message=? WHERE id=? AND state='PENDING'",
                         (outcome,p['id'],event['message_id'],key)).rowcount
                if not changed:outcome='ALREADY_DECIDED'
            self.db.execute('INSERT INTO partner_review_replies VALUES (?,?,?)',(event['message_id'],key,outcome))
            return outcome

    def _recheck(self,row,partner,event,now):
        """Supersede the pending options review and queue its receipt for planning again (same transaction as decide).
        Like receipt-reconsider: the prior job state is kept in receipt_reconsiderations and the old review keeps its
        decision under a renamed job_id, so a reply to the old message can no longer decide anything."""
        job=self.db.execute("SELECT status,detail,result FROM receipt_jobs WHERE id=?",(row['job_id'],)).fetchone()
        if not job or job['status']!='REVIEW_REQUESTED':return 'ALREADY_DECIDED'
        changed=self.db.execute("UPDATE partner_reviews SET state='SUPERSEDED',job_id=job_id||':superseded:'||id,"
            "deciding_partner=?,decision_message=?,detail='REVIEWER_REQUESTED_RECHECK' WHERE id=? AND state=? AND detail=?",
            (partner['id'],event['message_id'],row['id'],row['state'],row['detail'])).rowcount
        if not changed:return 'ALREADY_DECIDED'
        from .state import is_postgres
        if not is_postgres(self.db):   # PostgreSQL has it from agent migration V2 (as receipt_reconsider does)
            self.db.execute('''CREATE TABLE IF NOT EXISTS receipt_reconsiderations
               (id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL)''')
        self.db.execute('INSERT INTO receipt_reconsiderations(job_id,created_at,previous) VALUES (?,?,?)',
                        (row['job_id'],now,json.dumps({k:job[k] for k in ('status','detail','result')})))
        self.db.execute("UPDATE receipt_jobs SET status='VALIDATED',attempts=0,retry_after=0,detail='REVIEWER_REQUESTED_RECHECK' "
                        "WHERE id=? AND status='REVIEW_REQUESTED'",(row['job_id'],))
        return RECHECKED


MONTHS=('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')
THAI_MONTHS=('ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.')


def short_date(day,thai):
    """'5 Nov' / '5 พ.ย.' (Echo R110 copy dates)."""
    return str(int(day[8:10]))+' '+(THAI_MONTHS if thai else MONTHS)[int(day[5:7])-1]


def date_range(first,last,thai):
    if first==last:return short_date(first,thai)
    if first[:7]==last[:7]:return str(int(first[8:10]))+'–'+short_date(last,thai)
    return short_date(first,thai)+' – '+short_date(last,thai)


def baht(value):
    from decimal import Decimal
    return '฿'+format(Decimal(str(value)),',.0f')


def due_parts(options,thai):
    """R118: ' (Interest ฿100 + Late charge ฿50)' / ' (ดอกเบี้ย ฿100 + ค่าปรับล่าช้า ฿50)' when a late charge is due (principal
    first when some is due); nothing otherwise, so a request without a late charge reads as before."""
    from decimal import Decimal
    if Decimal(str(options.get('dueLate') or 0))<=0:return ''
    words=(('เงินต้น','ดอกเบี้ย','ค่าปรับล่าช้า') if thai else ('Principal','Interest','Late charge'))
    parts=[(words[0],options.get('duePrincipal')),(words[1],options.get('dueInterest')),(words[2],options.get('dueLate'))]
    return ' ('+' + '.join(f'{w} {baht(v)}' for w,v in parts if Decimal(str(v or 0))>0)+')'


def principal_split(options,entry,thai):
    """R127 (Echo AG-8, AG-9): 'interest ฿90 + principal ฿410' for a principal choice; the interest part is the
    remainder less the principal (the loan's accrued interest is paid first) and is left out when it is 0."""
    from decimal import Decimal
    interest=Decimal(str(options['remainder']))-Decimal(str(entry['amount']))
    words=('ดอกเบี้ย','เงินต้น') if thai else ('interest','principal')
    return (f'{words[0]} {baht(interest)} + ' if interest>0 else '')+f"{words[1]} {baht(entry['amount'])}"


def offered_numbers(options):
    """R127 (Echo AG-6): the replies the request offers, in order: '1', '2' or '2 1', '2 2', ..., and '3'."""
    from .review_proposal import forward_offered
    principal=options.get('principal') or []
    numbers=['1'] if forward_offered(options) else []
    numbers+=['2 '+str(n) for n in range(1,len(principal)+1)] if len(principal)>1 else (['2'] if principal else [])
    return numbers+['3']


def options_lines(proposal,thai):
    """Echo AG-1/AG-4, R127 AG-7/AG-8/AG-10: the remainder and the numbered choices; a refused choice is left out with
    its reason and the others keep their numbers. With several loans each "2 <n>" choice is on its own line."""
    o=proposal['options'];receipt=proposal['receipt'];borrower=proposal['borrower']
    from decimal import Decimal
    from .review_proposal import forward_offered
    name=borrower.get('name_th' if thai else 'name_en') or borrower['id']
    keys=proposal.get('loan_keys') or [p['loanKey'] for p in o['principal'] if p.get('loanKey')]
    several=len(o['principal'])>1
    if several:
        # R127: each "2 <n>" line names its loan, so the head names only the other loans (keeps five loans within 1000).
        keys=[k for k in keys if k not in {p.get('loanKey') for p in o['principal']}]
    keys=', '.join(keys)
    f=o.get('forward');choices=[]   # (text, on its own line)
    if forward_offered(o):
        span=date_range(f['first'],f.get('last') or f['first'],thai)+(((' ชำระถึง ' if thai else ', paid through ')+short_date(f['through'],thai)) if f.get('through') else '')
        choices.append((('1 ชำระล่วงหน้า (' if thai else '1 pay forward (')+span+')',False))
    for n,p in enumerate(o['principal'],1):
        daily=' ('+('ดอกเบี้ยใหม่ ' if thai else 'new interest ')+baht(p['dailyAfter'])+('/วัน' if thai else '/day')+')'
        label='2 '+str(n)+' '+((p.get('loanKey') or p['loanId'])+': ') if several else '2 '
        choices.append((label+principal_split(o,p,thai)+daily,several))
    choices.append(('3 ตรวจใหม่หลังแก้ยอดในแอป' if thai else '3 recheck after editing charges in the app',False))
    due=due_parts(o,thai);paid_first=Decimal(str(o['dueTotal'] or 0))>0
    if thai:
        # R127 (Echo AG-7): the due part is paid first; the choices are for the remainder.
        stated=f"หักยอดครบกำหนดวันนี้ {baht(o['dueTotal'])}{due} ก่อน" if paid_first else f"ครบกำหนดวันนี้ {baht(o['dueTotal'])}{due}"
        head=f"สลิป {baht(receipt['amount'])} จาก {name}"+(f", {keys}" if keys else '')+f" {stated} ยอดคงเหลือ {baht(o['remainder'])} ตอบ: "
        tail=' · ปฏิเสธ เพื่อยกเลิก'
    else:
        head=f"Slip {baht(receipt['amount'])} from {name}"+(f", {keys}" if keys else '')+f". Due today {baht(o['dueTotal'])}{due}"+(' is paid first' if paid_first else '')+f". Remainder {baht(o['remainder'])}, reply: "
        tail='. Reject to drop.'
    listed=''
    for i,(text,own) in enumerate(choices):
        if i:listed+='\n' if own or choices[i-1][1] else ' · '
        elif own:head=head.rstrip()+'\n'
        listed+=text
    notes=[]
    settled=[b.get('loanKey') or b['loanId'] for b in o.get('blocked') or [] if b.get('reason')=='settles']
    if settled:
        # R113: the remainder closes a loan; closing happens in the app (Receive payment), not by this reply.
        keys=', '.join(settled)
        notes.append(f'ยอดคงเหลือปิด {keys} ได้: กรุณาบันทึกในแอป' if thai else f'Remainder settles {keys}: record in the app.')
    if f and f.get('uncovered') not in (None,'0'):
        notes.append(f"ยอด {baht(f['uncovered'])} เกินช่วง 93 วันข้างหน้า ไม่สามารถจัดสรรได้" if thai else f"{baht(f['uncovered'])} is beyond the next 93 days and cannot be allocated.")
    return head+listed+tail+''.join('\n'+n for n in notes)


def request_text(proposal,language,unclear=False):
    from .review_proposal import review_posts_overpayment
    thai=language=='ไทย'
    if language not in ('English','ไทย'):raise ConfigurationError('REVIEW_LANGUAGE_UNSUPPORTED')
    if proposal.get('action')=='Pay forward options':
        # R112 (Echo AG-1, AG-2): reply with a number; an unclear reply gets the prompt, then the options again.
        # R127 (Echo AG-6): the prompt names the replies this request offers.
        receipt=proposal['receipt']
        subject='สลิปรอเลือกวิธี' if thai else 'Slip needs a choice'
        numbers=offered_numbers(proposal['options'])
        listed=', '.join(numbers[:-1])+(' หรือ ' if thai else ' or ')+numbers[-1] if len(numbers)>1 else numbers[0]
        body=((f'ตอบ {listed}\n' if thai else f'Reply {listed}.\n') if unclear else '')+options_lines(proposal,thai)
        body+=(f"\nเวลาโอน: {receipt['date']} {receipt['time'][:5]} · บัญชีรับ: {receipt['account_label']}\nใช้ Reply ตอบข้อความนี้ ยังไม่ได้บันทึกรายการ" if thai else
               f"\nTransferred: {receipt['date']} {receipt['time'][:5]} (Bangkok) · Account: {receipt['account_label']}\nUse Reply on THIS message. Nothing has been posted.")
        if len(body)>1000:raise ConfigurationError('REVIEW_REQUEST_TOO_LONG')
        return subject,body
    receipt=proposal['receipt'];borrower=proposal['borrower']
    name=borrower.get('name_th' if thai else 'name_en') or borrower['id']
    close=proposal.get('action')=='Loan Close'
    overpayment=review_posts_overpayment(proposal)
    manual=proposal.get('action')!='Lump Sum' and not overpayment
    if thai:
        subject='ขออนุมัติรายการชำระเงิน'
        action='ตรวจสอบการปิดสัญญาและบันทึกเอง' if close else ('ตรวจสอบยอดเกินและบันทึกเอง' if manual else 'บันทึกการชำระเงิน')
        if overpayment:action='ยอดเกิน — อนุมัติแล้วระบบจะบันทึกยอดเต็มเป็น Lump Sum'
        body=f"{subject}\nผู้กู้: {name}\nยอด: {receipt['amount']} บาท\nเวลาโอน: {receipt['date']} {receipt['time'][:5]}\nบัญชีรับ: {receipt['account_label']}\nรายการที่เสนอ: {action}\nกรุณาใช้ Reply ตอบข้อความนี้ว่า อนุมัติ เพื่อดำเนินการ คำตอบอื่นถือว่าปฏิเสธ ยังไม่ได้บันทึกรายการ"
    else:
        subject='Payment approval requested'
        action='Review loan closure; partner records manually' if close else ('Review overpayment; partner records manually' if manual else 'Record payment')
        if overpayment:action='Approve overpayment; agent records the full amount as Lump Sum'
        body=f"{subject}\nBorrower: {name}\nAmount: {receipt['amount']} baht\nTransferred: {receipt['date']} {receipt['time'][:5]} (Bangkok)\nAccount: {receipt['account_label']}\nProposed: {action}\nUse Reply on THIS message: Yes / Approve / Approved (any case). Other direct replies reject. Nothing has been posted."
    if proposal.get('loan_keys'):body+=('\nสัญญา: ' if thai else '\nLoan: ')+'; '.join(proposal['loan_keys'])
    if manual:
        body+=('\nหากอนุมัติ กรุณาบันทึกรายการในแอปด้วยตนเอง' if thai else
               '\nIf you approve, please record this in the app yourself.')
    if len(body)>1000:raise ConfigurationError('REVIEW_REQUEST_TOO_LONG')
    return subject,body
