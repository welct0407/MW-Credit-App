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
# R174 (owner, 18 November 2026): "No" is equivalent to "Reject" (as hold_reply.REJECT already has it).
REJECT={'reject','rejected','no','ปฏิเสธ'}
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
# R175 (Archie E-APR-01): a plain request's unclear reply reuses the options re-ask outcome and notice key.
REASK=OPTIONS_REQUIRED
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

    @staticmethod
    def next_key(job_id,value,key,n):
        """The id of the job's n-th review generation for one proposal (n>=1)."""
        return hashlib.sha256(f'review:{job_id}:{n}:{value}'.encode()).hexdigest()

    def reserve(self,job_id,proposal,now=None):
        now=time.time() if now is None else now
        value=json.dumps(proposal,sort_keys=True,ensure_ascii=False)
        key=hashlib.sha256(('review:'+job_id+':'+value).encode()).hexdigest()
        with self.db:
            old=self.db.execute('SELECT proposal FROM partner_reviews WHERE job_id=?',(job_id,)).fetchone()
            if old and old[0]!=value:raise ConfigurationError('REVIEW_PROPOSAL_CHANGED')
            # R173: a recheck or reconsideration that plans the same proposal again derives the id of the review it
            # superseded (renamed to <job>:superseded:<id>). Take the next generation's id instead, so the job gets a new
            # PENDING review and request; a first review keeps its id and reserving again stays idempotent.
            n=0
            while True:
                row=self.db.execute('SELECT job_id FROM partner_reviews WHERE id=?',(key,)).fetchone()
                if not row or row[0]==job_id or n>=100:break
                n+=1;key=self.next_key(job_id,value,key,n)
            self.db.execute('INSERT OR IGNORE INTO partner_reviews(id,job_id,proposal,created_at,expires_at) VALUES (?,?,?,?,?)',
                            (key,job_id,value,now,now+86400))
            row=self.db.execute('SELECT job_id FROM partner_reviews WHERE id=?',(key,)).fetchone()
            # Never hand back a review that is not this job's: the job would wait in REVIEW_REQUESTED with no review.
            if not row or row[0]!=job_id:raise ConfigurationError('REVIEW_RESERVATION_FAILED')
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
                # R175 (Archie E-APR-01): on a plain, overpayment, manual or close request only the approval words approve
                # and only the reject words reject; any other reply is asked again (REASK) and decides nothing.
                text=(event.get('text') or '').strip().casefold()
                outcome='APPROVED' if text in APPROVE else 'REJECTED' if text in REJECT else REASK
                if outcome!=REASK:
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


def slip_line(receipt,borrower,thai):
    """R175 (Echo {slip}): 'Kathy ฿400 (18 Nov 18:16)' / 'เคที ฿400 (18 พ.ย. 18:16)', the amount exact."""
    from .partner_notice import money
    name=borrower.get('name_th' if thai else 'name_en') or borrower['id']
    return f"{name} {money(receipt['amount'])} ({short_date(receipt['date'],thai)} {str(receipt['time'])[:5]})"


def due_parts(options,thai):
    """R118: ' (principal ฿100 + interest ฿300 + late charge ฿50)' / ' (เงินต้น ฿100 + ดอกเบี้ย ฿300 + ค่าปรับล่าช้า ฿50)' when a
    late charge is due (principal first when some is due); nothing otherwise."""
    from decimal import Decimal
    if Decimal(str(options.get('dueLate') or 0))<=0:return ''
    words=(('เงินต้น','ดอกเบี้ย','ค่าปรับล่าช้า') if thai else ('principal','interest','late charge'))
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


# R175 (Echo D1, Archie 4): a loan key 'เคที - Kathy-฿1,000-15/11-10%' (review_proposal.loan_display_key) reads
# '฿1,000 (15 Nov, 10%)'. Anything else (an unavailable rate, no date, a negative principal, a loan id) keeps the key.
LABEL_AMOUNT=re.compile(r'฿\d{1,3}(?:,\d{3})*')
LABEL_DAY=re.compile(r'(\d{2})/(\d{2})')
LABEL_RATE=re.compile(r'\d+(?:\.\d+)?%')


def loan_label(key,thai):
    """The short label of one loan key, or None when the key does not parse."""
    if not isinstance(key,str):return None
    parts=key.rsplit('-',3)
    if len(parts)!=4:return None
    borrower,amount,day,rate=parts
    found=LABEL_DAY.fullmatch(day)
    if (not borrower.strip() or borrower.endswith('-') or not LABEL_AMOUNT.fullmatch(amount) or not LABEL_RATE.fullmatch(rate)
            or not found or not 1<=int(found.group(1))<=31 or not 1<=int(found.group(2))<=12):return None
    return f'{amount} ({int(found.group(1))} {(THAI_MONTHS if thai else MONTHS)[int(found.group(2))-1]}, {rate})'


def loan_labels(keys,thai):
    """{key: label} for the loan keys one message names; when two would read the same, every key is printed in full."""
    keys=[k for k in dict.fromkeys(keys) if k]
    labels={k:loan_label(k,thai) or k for k in keys}
    if len(set(labels.values()))<len(labels):return {k:k for k in keys}
    return labels


# R175 (Echo): the request lines. Index [thai] (False 0 English, True 1 Thai). Thai names only อนุมัติ, ปฏิเสธ, ตรวจใหม่.
CORRECTED=('Updated request: use this one, not the earlier message','คำขอแก้ไข: ใช้ข้อความนี้แทนข้อความก่อนหน้า')
UNCLEAR_OPTIONS=('Reply not understood; nothing was done. Reply with a code below.','ไม่เข้าใจคำตอบ ยังไม่ได้ดำเนินการ กรุณาตอบด้วยรหัสด้านล่าง')
UNCLEAR_PLAIN=('Reply not understood; nothing was done. Reply Yes to approve or Reject (or No) to record nothing.',
               'ไม่เข้าใจคำตอบ ยังไม่ได้ดำเนินการ ตอบ อนุมัติ เพื่ออนุมัติ หรือ ปฏิเสธ เพื่อไม่บันทึกรายการ')
UNCLEAR_CLOSE=('Reply not understood; nothing was done. Reply Yes to close the loan or Reject (or No) to record nothing.',
               'ไม่เข้าใจคำตอบ ยังไม่ได้ดำเนินการ ตอบ อนุมัติ เพื่อปิดสัญญา หรือ ปฏิเสธ เพื่อไม่บันทึกรายการ')
CODES=(('Reply with one code:','Reply with one code (→ = daily interest after):'),
       ('ตอบด้วยรหัสเดียว:','ตอบด้วยรหัสเดียว (→ = ดอกเบี้ยต่อวันหลังชำระ):'))
RECHECK_LINE=('3 = recheck (edit the charges in the app first, then reply 3)','3 = ตรวจใหม่ (แก้ยอดในแอปก่อน แล้วตอบ 3)')
REJECT_LINE=('Reject (or No) = record nothing for this slip','ปฏิเสธ = ไม่บันทึกสลิปนี้')
LAST_LINE=('Use Reply on THIS message. Nothing recorded yet.','ใช้ Reply ตอบข้อความนี้ ยังไม่ได้บันทึกรายการ')
# R151 (Echo UX-R151-3; R175 wording): the line for a slip whose sender is no known borrower (the payer name chose the borrower).
SENDER_NOTE=('Sender is not a known borrower; matched by the payer name on the slip.','ผู้ส่งไม่ใช่ผู้กู้ที่รู้จัก ระบุผู้กู้จากชื่อผู้โอนในสลิป')


def reply_block(action,thai):
    """R175 (Echo section 2): the reply lines that end a plain or close request."""
    if thai:return ['ตอบด้วยคำเดียว:',f'อนุมัติ = {action}','ปฏิเสธ = ไม่บันทึกรายการ','คำตอบอื่นจะถามใหม่','',LAST_LINE[1]]
    return ['Reply with one word:',f'Yes = {action}','Reject (or No) = record nothing','Any other reply is asked again.','',LAST_LINE[0]]


def loans_line(labels,thai):
    """'Loan ฿1,000 (15 Nov, 10%)', 'Loans a; b' / 'สัญญา ...'; None without loans."""
    if not labels:return None
    return ('สัญญา ' if thai else ('Loan ' if len(labels)==1 else 'Loans '))+'; '.join(labels)


def forward_span(forward,thai):
    """'19 Nov', '6–7 Nov', '30 Nov – 28 Dec (fully paid through 27 Dec)': the last covered day is named only when it differs."""
    last=forward.get('last') or forward['first']
    span=date_range(forward['first'],last,thai)
    through=forward.get('through')
    if through and through!=last:span+=(' (ครบถึง ' if thai else ' (fully paid through ')+short_date(through,thai)+')'
    return span


def principal_phrase(options,entry,where,thai,short=False):
    """The principal choice after '2 = ': 'pay interest ฿90 + principal ฿410 → new interest ฿53/day', with 'loan <label>: '
    first when the request names the loan on its line; the short form drops 'pay' and 'new interest'."""
    split=principal_split(options,entry,thai);daily=baht(entry['dailyAfter'])
    target=((f'สัญญา {where}: ' if thai else f'loan {where}: ') if where else '')
    if short:return f"{target}{split} → {daily}{'/วัน' if thai else '/day'}"
    return f'{target}ชำระ{split} → ดอกเบี้ยใหม่ {daily}/วัน' if thai else f'{target}pay {split} → new interest {daily}/day'


def options_layout(proposal,thai):
    """The loans each line names: (labels, keys on the Loan line, {principal entry index: its loan's label or None})."""
    o=proposal['options'];principal=o.get('principal') or []
    offered=[p.get('loanKey') for p in principal if p.get('loanKey')]
    settled=[b.get('loanKey') for b in o.get('blocked') or [] if b.get('reason')=='settles' and b.get('loanKey')]
    keys=list(proposal.get('loan_keys') or offered)
    labels=loan_labels([*keys,*offered,*settled],thai)
    # The "2" line names its loan when it is not the only loan the request is about.
    named=len(principal)>1 or (len(principal)==1 and len([k for k in keys if k!=principal[0].get('loanKey')])>0)
    where={}
    for i,p in enumerate(principal):
        where[i]=(labels.get(p.get('loanKey')) or str(p.get('loanKey') or p['loanId'])) if named else None
    on_lines={p.get('loanKey') for p in principal} if named else set()
    return labels,[k for k in keys if k not in on_lines],where


def options_text(proposal,thai,unclear=False,unidentified=False,corrected=False,short=False):
    """R175 (Echo A): line 1 the slip and what to decide; the facts; one code per line; the Reject line; notes; the reply
    instruction last. short (only when the full text does not fit) drops 'pay' and 'new interest' (Echo worst case)."""
    from decimal import Decimal
    from .partner_notice import money,transferred
    from .review_proposal import forward_offered
    o=proposal['options'];receipt=proposal['receipt'];borrower=proposal['borrower']
    name=borrower.get('name_th' if thai else 'name_en') or borrower['id']
    labels,listed,where=options_layout(proposal,thai)
    lines=[CORRECTED[thai]] if corrected else []
    if unclear:lines.append(UNCLEAR_OPTIONS[thai])
    lines.append(f"สลิป {money(receipt['amount'])} จาก {name}: เลือกวิธีใช้ยอด {baht(o['remainder'])}" if thai else
                 f"Slip {money(receipt['amount'])} from {name}: choose how to use {baht(o['remainder'])}")
    lines.append(transferred(receipt,thai))
    loans=loans_line([labels.get(k,k) for k in listed],thai)
    if loans:lines.append(loans)
    if unidentified:lines.append(SENDER_NOTE[thai])
    if Decimal(str(o.get('dueTotal') or 0))>0:
        due=due_parts(o,thai)
        lines.append(f"หักยอดครบกำหนดวันนี้ {baht(o['dueTotal'])}{due} ก่อน" if thai else f"Due today {baht(o['dueTotal'])}{due} is paid first.")
    lines+=['',CODES[thai][short]]
    if forward_offered(o):lines.append(('1 = ชำระล่วงหน้า: ' if thai else '1 = pay forward: ')+forward_span(o['forward'],thai))
    principal=o.get('principal') or []
    for i,p in enumerate(principal):
        code='2 '+str(i+1) if len(principal)>1 else '2'
        lines.append(f'{code} = '+principal_phrase(o,p,where[i],thai,short))
    lines+=[RECHECK_LINE[thai],REJECT_LINE[thai]]
    settled=[labels.get(b.get('loanKey'),b.get('loanKey')) or str(b['loanId']) for b in o.get('blocked') or [] if b.get('reason')=='settles']
    if settled:
        # R113: the remainder closes a loan; closing happens in the app (Receive payment), not by this reply.
        keys='; '.join(settled)
        lines.append(f'ยอดคงเหลือปิด {keys} ได้: กรุณาบันทึกในแอป' if thai else f'Remainder settles {keys}: record in the app.')
    f=o.get('forward')
    if f and f.get('uncovered') not in (None,'0'):
        lines.append(f"ยอด {baht(f['uncovered'])} เกินช่วง 93 วันข้างหน้า ไม่สามารถจัดสรรได้" if thai else f"{baht(f['uncovered'])} is beyond the next 93 days and cannot be allocated.")
    lines+=['',LAST_LINE[thai]]
    return '\n'.join(lines)


def chosen_purpose_line(proposal,detail,thai):
    """R175 (Echo E-RES-01, E-RES-04): the use of the remainder the Reviewer chose, worded as its request line ('pay forward:
    19 Nov', 'pay interest ฿90 + principal ฿410 → new interest ฿53/day'); '' when the detail no longer holds the choice."""
    try:purpose=json.loads(detail)['purpose']
    except (ValueError,TypeError,KeyError):return ''
    if not isinstance(purpose,dict):return ''
    o=proposal.get('options') or {}
    try:
        if purpose.get('forward') and not purpose.get('principal'):
            forward=o.get('forward') or {}
            return ('ชำระล่วงหน้า' if thai else 'pay forward')+((': '+forward_span(forward,thai)) if forward.get('first') else '')
        chosen=purpose['principal'][0];part=baht(chosen['amount'])
        if purpose.get('forward'):
            # Legacy R112 split ("3 <amount>", withdrawn in R127): a split approved before the R127 deploy may still post.
            return f'เงินต้น {part} ส่วนที่เหลือชำระล่วงหน้า' if thai else f'principal {part}, the rest pays forward'
        principal=o.get('principal') or []
        offered=next((i for i,p in enumerate(principal) if p.get('loanId')==chosen['loanId'] and p.get('amount')==chosen['amount']),None)
        if offered is not None:return principal_phrase(o,principal[offered],options_layout(proposal,thai)[2][offered],thai)
        return f'ชำระเงินต้น {part}' if thai else f'pay principal {part}'
    except (KeyError,TypeError,IndexError,ValueError,ArithmeticError):return ''


def close_amount_line(close,thai):
    """R128 (Echo AG-15): the closing amount and its parts in R118 order (principal, interest, then a late charge above 0),
    or the amount alone when the parts are unavailable."""
    from decimal import Decimal, InvalidOperation
    words=('เงินต้น','ดอกเบี้ย','ค่าปรับล่าช้า') if thai else ('principal','interest','late charge')
    try:
        principal,interest=Decimal(str(close['principal'])),Decimal(str(close['interest']))
        late=Decimal(str(close.get('late') or 0))
        if not (principal.is_finite() and interest.is_finite() and late.is_finite()) or close['principal'] is None or close['interest'] is None:raise ValueError()
        listed=f'{words[0]} {baht(principal)} + {words[1]} {baht(interest)}'+(f' + {words[2]} {baht(late)}' if late>0 else '')
    except (KeyError,ValueError,InvalidOperation,TypeError):listed=''
    amount=baht(close['amount'])
    if thai:return f'ยอดปิด {amount}'+(f' ({listed})' if listed else '')+' ตรงกับสลิป'
    return f'Closing amount {amount}'+(f' ({listed})' if listed else '')+' matches this slip.'


def rebate_lines(offset,payable,referrer,thai):
    """R128 (Echo AG-17): the referral rebate, offset to the referrer's loan and/or the rest; nothing without one.
    R129 (V137): the rest is pending payment (the Referrers page settles it later), not paid out at close."""
    from decimal import Decimal, InvalidOperation
    name=referrer or ('ผู้แนะนำ' if thai else 'the referrer');lines=[]
    try:offset,payable=Decimal(str(offset or 0)),Decimal(str(payable or 0))
    except InvalidOperation:return []
    if offset>0:lines.append(f'ค่าแนะนำ {baht(offset)}: หักกับสินเชื่อของ {name}' if thai else f"Referral rebate {baht(offset)}: offset to {name}'s loan")
    if payable>0:lines.append(f'ค่าแนะนำ {baht(payable)}: ค้างจ่ายให้ {name}' if thai else f'Referral rebate {baht(payable)}: pending to {name}')
    return lines


def unidentified_review(db,job_id):
    """True when the review's receipt job carries the R151 unidentified-sender provenance."""
    import sqlite3
    from .receipt_identity import provenance
    try:row=db.execute('SELECT result FROM receipt_jobs WHERE id=?',(job_id,)).fetchone()
    except sqlite3.OperationalError as exc:
        if 'no such table' in str(exc):return False  # copy only: a journal without jobs has no such receipt
        raise
    return bool(row) and provenance(row).get('unidentified_sender') is True


def request_head(proposal,thai,unclear_line,corrected,unidentified,title):
    """The first lines of a plain or close request: corrected and unclear lines, the title, the transfer and the loans."""
    from .partner_notice import transferred
    lines=[CORRECTED[thai]] if corrected else []
    if unclear_line:lines.append(unclear_line)
    lines+=[title,transferred(proposal['receipt'],thai)]
    labels=loan_labels(proposal.get('loan_keys') or [],thai)
    loans=loans_line([labels[k] for k in labels],thai)
    if loans:lines.append(loans)
    if unidentified:lines.append(SENDER_NOTE[thai])
    return lines


def close_request_text(proposal,thai,unidentified=False,unclear=False,corrected=False):
    """R128 (Echo AG-13..AG-17), R175 (Echo E-CLS-01): the close approval request; the approval words are the usual ones."""
    from decimal import Decimal
    from .partner_notice import money
    receipt=proposal['receipt'];close=proposal['close'];borrower=proposal['borrower']
    name=borrower.get('name_th' if thai else 'name_en') or borrower['id']
    rebate=[]
    if close.get('rebatePath') and close.get('rebateAmount'):
        total=Decimal(str(close['rebateAmount']))
        covered=min(total,Decimal(str(close.get('rebateCovered') or total))) if close['rebatePath']=='offset' else Decimal(0)
        rebate=rebate_lines(covered,total-covered,close.get('referrer'),thai)
    subject='ขออนุมัติปิดสัญญา' if thai else 'Loan close approval requested'
    title=(f"สลิป {money(receipt['amount'])} จาก {name}: รออนุมัติปิดสัญญา" if thai else
           f"Slip {money(receipt['amount'])} from {name}: loan close needs approval")
    lines=request_head(proposal,thai,UNCLEAR_CLOSE[thai] if unclear else None,corrected,unidentified,title)
    lines+=[close_amount_line(close,thai)]+rebate+['']+reply_block(approval_action(proposal,thai),thai)
    return subject,'\n'.join(lines)


def close_notice(proposal,language,payment_id,detail):
    """R128 (Echo AG-19), R175 (Echo E-CLS-01): the recorded close names the loan once, then the rebate as the server
    recorded it (the review detail closeRebate)."""
    from .partner_notice import receipt_notice,over_limit
    thai=language=='ไทย'
    key=(proposal.get('loan_keys') or [proposal.get('loan_id')])[0]
    label=loan_labels([key],thai).get(key,str(key)) if isinstance(key,str) else str(key)
    _,body=receipt_notice(proposal['receipt'],proposal['borrower'],language,payment_id,purpose=('ปิดสัญญา ' if thai else 'loan closed: ')+label)
    title='ปิดสัญญาสำเร็จ' if thai else 'Loan closed'
    lines=[body]
    try:rebate=json.loads(detail or '{}').get('closeRebate')
    except (ValueError,AttributeError):rebate=None
    if isinstance(rebate,dict):
        lines+=rebate_lines(rebate.get('offsetAmount'),rebate.get('payable'),proposal['close'].get('referrer'),thai)
    body='\n'.join(lines)
    if over_limit(body):raise ConfigurationError('NOTICE_TOO_LONG')
    return title,body


# R128 (Echo AG-20a/b): the close-change reasons, and the reasons that close nothing without a change of the close.
CLOSE_CHANGE_DETAILS=('LOAN_CLOSE_DAY_PASSED','LOAN_CLOSE_REJECTED')
CLOSE_NEUTRAL_DETAILS=('LOAN_CLOSE_EXECUTION_OFF','LOAN_CLOSE_QUOTE_UNAVAILABLE')


def close_failure_line(state,detail,proposal,thai):
    """R128 (Echo AG-20): the last line of a close that did not post. A changed close (the quote or another fact changed, the
    day passed, the server refused it) says so; the switch off or no quote (404) gets the neutral line; any other STALE or
    MANUAL_REQUIRED reason (for example the payment already recorded) keeps only its own line; '' for a rejection or an expiry."""
    detail=detail or ''
    if state=='STALE' and detail.startswith('LOAN_CLOSE_QUOTE_CHANGED:'):
        now,slip=baht(detail.split(':',1)[1]),baht(proposal['receipt']['amount'])
        return (f'ยอดปิดตอนนี้ {now} สลิป {slip} ยังไม่ได้ปิดสัญญาและยังไม่ได้บันทึกรายการ กรุณาปิดในแอป' if thai else
                f'Closing amount is now {now}; slip {slip}. Loan not closed; nothing recorded. Close it in the app.')
    if state in ('STALE','MANUAL_REQUIRED') and detail.split(':',1)[0] in CLOSE_NEUTRAL_DETAILS:
        return 'ยังไม่ได้ปิดสัญญา ยังไม่ได้บันทึกรายการ กรุณาปิดในแอป' if thai else 'Loan not closed. Nothing recorded. Close it in the app.'
    if state in ('STALE','MANUAL_REQUIRED') and ('CHANGED' in detail or detail.split(':',1)[0] in CLOSE_CHANGE_DETAILS):
        return ('ยังไม่ได้ปิดสัญญา: ข้อมูลการปิดเปลี่ยน ยังไม่ได้บันทึกรายการ กรุณาปิดในแอป' if thai else
                'Loan not closed: closing details changed. Nothing recorded. Close it in the app.')
    if state=='UNKNOWN':
        return 'ตรวจสอบสัญญาในแอปก่อนปิดอีกครั้ง' if thai else 'Check the loan in the app before closing it again.'
    return ''


def request_text(proposal,language,unclear=False,unidentified=False,corrected=False):
    """The request one Reviewer receives, within BODY_LIMIT (R175, Archie E-X-01: the icon dispatch adds is counted, and the
    corrected line is the builder's). Fit ladder: full with the R151 sender note, short with it, full, short; the note
    never costs the request, and only an options request has a short form. Otherwise REVIEW_REQUEST_TOO_LONG."""
    from .partner_notice import over_limit
    if language not in ('English','ไทย'):raise ConfigurationError('REVIEW_LANGUAGE_UNSUPPORTED')
    for note,short in (((True,False),(True,True)) if unidentified else ())+((False,False),(False,True)):
        subject,body=compose_request(proposal,language,unclear,note,corrected,short)
        if not over_limit(body):return subject,body
    raise ConfigurationError('REVIEW_REQUEST_TOO_LONG')


def approval_action(proposal,thai,recorded_only=False):
    """R175 (Echo section 2): what the approval words do on a plain or close request. recorded_only: '' for a manual item (the
    Reviewer records it), as the manual-required result repeats only a choice the agent would have recorded."""
    from .partner_notice import money
    from .review_proposal import review_posts_close,review_posts_overpayment
    receipt=proposal['receipt']
    if review_posts_close(proposal):return 'ปิดสัญญาทันที' if thai else 'close the loan now'
    if review_posts_overpayment(proposal):
        return f"บันทึกยอดเต็ม {money(receipt['amount'])} เป็น Lump Sum" if thai else f"record the full {money(receipt['amount'])} as Lump Sum"
    if proposal.get('action')=='Lump Sum':return 'บันทึกการชำระเงินนี้' if thai else 'record this payment'
    if recorded_only:return ''
    if proposal.get('action')=='Loan Close':return 'คุณปิดสัญญาในแอปเอง' if thai else 'you close the loan in the app yourself'
    return 'คุณบันทึกในแอปเอง' if thai else 'you record it in the app yourself'


def compose_request(proposal,language,unclear=False,unidentified=False,corrected=False,short=False):
    """One wording of the request, unchecked for length (request_text chooses the one that fits)."""
    from .partner_notice import money
    from .review_proposal import review_posts_close
    thai=language=='ไทย'
    if language not in ('English','ไทย'):raise ConfigurationError('REVIEW_LANGUAGE_UNSUPPORTED')
    if review_posts_close(proposal):return close_request_text(proposal,thai,unidentified,unclear,corrected)
    if proposal.get('action')=='Pay forward options':
        # R112, R127, R175 (Echo A): reply with one code; an unclear reply gets the request again under the unclear line.
        return ('สลิปรอเลือกวิธี' if thai else 'Slip needs a choice'),options_text(proposal,thai,unclear,unidentified,corrected,short)
    receipt=proposal['receipt'];borrower=proposal['borrower']
    name=borrower.get('name_th' if thai else 'name_en') or borrower['id']
    action=approval_action(proposal,thai)
    subject='ขออนุมัติรายการชำระเงิน' if thai else 'Payment approval requested'
    title=f"สลิป {money(receipt['amount'])} จาก {name}: รออนุมัติ" if thai else f"Slip {money(receipt['amount'])} from {name}: approval needed"
    lines=request_head(proposal,thai,UNCLEAR_PLAIN[thai] if unclear else None,corrected,unidentified,title)
    return subject,'\n'.join(lines+['']+reply_block(action,thai))
