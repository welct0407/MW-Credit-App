"""Durable partner text notifications: Instagram first, email only as fallback."""
import hashlib
import html
import json
import sqlite3
from .state import connect as state_connect, is_postgres
import time
from datetime import datetime, UTC
from decimal import Decimal

from .config import ConfigurationError
from .graph_email import GraphEmail, EmailRejected, valid_email
from .instagram import Instagram, InstagramAPIError
from .statement_delivery import eligible, resolve_recipient


# R175 (Archie E-X-01): Instagram takes 1000 characters; dispatch adds the status icon and a space (at most ICON_RESERVE
# characters, "⚠️ " is three), so every builder checks its body against BODY_LIMIT. dispatch stays the last guard.
IG_TEXT_LIMIT=1000
ICON_RESERVE=3
BODY_LIMIT=IG_TEXT_LIMIT-ICON_RESERVE
# R175 (Echo E-HRR-01): a cleared hold reads ✅; the pre-R175 subjects stay matched for notices queued before the deploy.
HOLD_CLEARED=('Held slip cleared','นำสลิปที่พักไว้ออกแล้ว','Held receipt rejected','ปฏิเสธสลิปที่พักไว้แล้ว')
# R175 (Archie E-X-02): the acknowledgement of a reply that decided nothing; informational, never emailed.
ACKNOWLEDGEMENT='review-reply-result:'


def over_limit(body,reserve=0):
    """True when the body, with `reserve` characters a caller adds in front, would not fit beside the status icon."""
    return len(body)+reserve>BODY_LIMIT


def display_notice(item):
    """Status decoration at delivery; keep reserved payloads and reply keys immutable."""
    event=item['event_key']
    icon=''
    if event.startswith('review:'):icon='❓'
    elif event.startswith('receipt-held:'):icon='⚠️'
    elif event.startswith('receipt-archive-pending:'):icon='⌛'
    elif event.startswith('hold-reply-result:'):icon='✅' if item['subject'] in HOLD_CLEARED else 'ℹ️'
    elif event.startswith(ACKNOWLEDGEMENT):icon='ℹ️'
    elif event.startswith('review-result:'):
        icon={'POSTED':'✅','REJECTED':'❌','MANUAL_REQUIRED':'📝',
              'STALE':'⚠️','EXPIRED':'⌛','UNKNOWN':'⚠️','RECHECK':'🔄'}.get(event.rsplit(':',1)[-1],'')
    elif event.startswith('receipt:'):icon='📩'
    prefix=icon+' ' if icon else ''
    return prefix+item['subject'],prefix+item['body']


class NoticeJournal:
    def __init__(self,path,config=None):
        self.db=state_connect(path,config)
        if is_postgres(self.db):
            return
        self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS partner_notices (
          id TEXT PRIMARY KEY,event_key TEXT NOT NULL,partner_id TEXT NOT NULL,
          partner TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,
          ig_status TEXT NOT NULL DEFAULT 'PENDING',message_id TEXT,
          email_status TEXT NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0,
          retry_after REAL NOT NULL DEFAULT 0,detail TEXT NOT NULL DEFAULT '')''')
        self.db.commit()
        columns={r[1] for r in self.db.execute('PRAGMA table_info(partner_notices)')}
        if 'recipient_id' not in columns:
            self.db.execute('ALTER TABLE partner_notices ADD COLUMN recipient_id TEXT')
            self.db.commit()
        if 'accepted_at' not in columns:
            self.db.execute('ALTER TABLE partner_notices ADD COLUMN accepted_at REAL')
            self.db.commit()

    def now(self):
        """accepted_at value: timestamptz on PostgreSQL (V7), epoch seconds in the SQLite journal."""
        return datetime.now(UTC) if is_postgres(self.db) else time.time()

    def reserve(self,event_key,partner,subject,body):
        key=hashlib.sha256((event_key+':'+partner['id']).encode()).hexdigest()
        payload=json.dumps(partner,sort_keys=True,ensure_ascii=False)
        with self.db:
            old=self.db.execute('SELECT * FROM partner_notices WHERE id=?',(key,)).fetchone()
            # Completed or held deliveries are immutable history. A fresh master
            # snapshot must not reopen them or block unrelated queued notices.
            if old and (old['ig_status'] not in ('PENDING','WINDOW_EXPIRED') or
                        old['email_status'] in ('SENT','UNKNOWN','REVIEW')):
                return key
            if old and (old['partner'],old['subject'],old['body'])!=(payload,subject,body):
                raise ConfigurationError('NOTICE_CONTENT_CHANGED')
            self.db.execute('INSERT OR IGNORE INTO partner_notices(id,event_key,partner_id,partner,subject,body) VALUES (?,?,?,?,?,?)',
                            (key,event_key,partner['id'],payload,subject,body))
        return key

    def due(self):
        return [dict(r) for r in self.db.execute("""SELECT * FROM partner_notices WHERE
          ig_status IN ('PENDING','WINDOW_EXPIRED') AND email_status IN ('PENDING','REJECTED')
          AND attempts<3 AND retry_after<=? ORDER BY retry_after,id""",(time.time(),))]

    def defer(self,key):
        # Keep payload, attempts and uncertain outcomes intact after an unexpected
        # preparation failure; do not hot-loop one bad recipient ahead of the queue.
        with self.db:
            self.db.execute("UPDATE partner_notices SET retry_after=? WHERE id=? AND email_status IN ('PENDING','REJECTED') AND ig_status IN ('PENDING','WINDOW_EXPIRED')",
                            (time.time()+300,key))

    def dispatch(self,item,config,rows,api=None,mailer=None,resolver=resolve_recipient):
        # Re-read state; callers cannot replay an old in-memory PENDING item.
        item=dict(self.db.execute('SELECT * FROM partner_notices WHERE id=?',(item['id'],)).fetchone())
        if item['ig_status'] not in ('PENDING','WINDOW_EXPIRED') or item['email_status'] in ('SENT','UNKNOWN','REVIEW'):
            return
        subject,body=display_notice(item)
        # R091: conversation replies are retired with the Instagram Partner conversation (agent V11 drops that stream).
        if item['event_key'].startswith('conversation:'):
            raise ConfigurationError('CONVERSATION_NOTICES_RETIRED')
        if config.get('receipt_summary_enabled') is not True:
            raise ConfigurationError('RECEIPT_NOTICES_DISABLED')
        wanted=json.loads(item['partner'])
        matches=[r for r in rows if r['id']==item['partner_id']]
        if len(matches)!=1 or matches[0]!=wanted:
            with self.db:self.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='PARTNER_CHANGED' WHERE id=?",(item['id'],))
            return
        partner=matches[0]
        if item['ig_status']=='PENDING':
            try:
                eligible(rows,partner['id'])
                api=api or Instagram(config)
                recipient=resolver(api,partner)
                if len(body)>1000:
                    raise ConfigurationError('IG_MESSAGE_TOO_LONG')
            except ConfigurationError as exc:
                reason='IG_MESSAGE_TOO_LONG' if str(exc)=='IG_MESSAGE_TOO_LONG' else 'IG_PREFLIGHT_FAILED'
                with self.db:self.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail=? WHERE id=?",(reason,item['id']))
                return
            else:
                with self.db:
                    claimed=self.db.execute("UPDATE partner_notices SET ig_status='UNKNOWN',recipient_id=? WHERE id=? AND ig_status='PENDING'",(recipient,item['id'])).rowcount
                if not claimed:return
                try:
                    response=api.request(config['instagram_account_id']+'/messages',body={'recipient':{'id':recipient},'message':{'text':body}})
                    if not response.get('message_id'):raise ConfigurationError('IG_OUTCOME_UNKNOWN')
                except InstagramAPIError as exc:
                    status='WINDOW_EXPIRED' if exc.window_expired else 'REJECTED' if exc.definite_rejection else 'UNKNOWN'
                    with self.db:self.db.execute('UPDATE partner_notices SET ig_status=?,detail=? WHERE id=?',(status,exc.detail_code,item['id']))
                    if status!='WINDOW_EXPIRED':return
                except Exception as exc:
                    # The durable UNKNOWN intent blocks both replay and fallback; keep the reason.
                    with self.db:self.db.execute('UPDATE partner_notices SET detail=? WHERE id=?',('IG_UNKNOWN_'+type(exc).__name__,item['id']))
                    return
                else:
                    with self.db:self.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id=?,accepted_at=? WHERE id=?",(str(response['message_id']),self.now(),item['id']))
                    return
        if item['event_key'].startswith(ACKNOWLEDGEMENT):
            # R175 (Archie E-X-02): an acknowledgement is only useful in the chat it answers; no email fallback.
            with self.db:self.db.execute("UPDATE partner_notices SET email_status='REVIEW',detail='ACKNOWLEDGEMENT_NOT_EMAILED' WHERE id=?",(item['id'],))
            return
        if not config.get('email_fallback_enabled') or not valid_email(partner.get('email')):
            with self.db:self.db.execute("UPDATE partner_notices SET email_status='REVIEW',detail='EMAIL_FALLBACK_UNAVAILABLE' WHERE id=?",(item['id'],))
            return
        with self.db:
            claimed=self.db.execute("""UPDATE partner_notices SET email_status='UNKNOWN',attempts=attempts+1
              WHERE id=? AND ig_status='WINDOW_EXPIRED' AND email_status IN ('PENDING','REJECTED') AND attempts<3 AND retry_after<=?""",(item['id'],time.time())).rowcount
        if not claimed:return
        try:
            fallback_body=body
            if item['event_key'].startswith('review:'):
                fallback_body+=('\nอีเมลนี้แจ้งข้อมูลเท่านั้น การตอบอีเมลไม่ใช่การอนุมัติ หากไม่มีข้อความคำขอใน Instagram ให้ดำเนินการเอง' if partner['language']=='ไทย' else
                    '\nThis email is informational. Email replies cannot approve. If no Instagram request was delivered, handle the payment manually.')
            (mailer or GraphEmail(config)).send(partner['email'],subject,
                '<p>'+html.escape(fallback_body).replace('\n','<br>')+'</p>',[],item['id'])
        except EmailRejected:
            with self.db:self.db.execute("UPDATE partner_notices SET email_status='REJECTED',retry_after=? WHERE id=?",(time.time()+300,item['id']))
        except Exception as exc:
            # The claim already holds email_status='UNKNOWN'; record why so the owner can reconcile.
            with self.db:self.db.execute('UPDATE partner_notices SET detail=? WHERE id=?',('EMAIL_UNKNOWN_'+type(exc).__name__,item['id']))
        else:
            with self.db:self.db.execute("UPDATE partner_notices SET email_status='SENT',accepted_at=? WHERE id=?",(self.now(),item['id']))

    def close(self):self.db.close()


def notice_amount(value):
    """A baht amount for a partner notice, exact (never rounded): whole baht without decimals ('1,100'), satang with two or more
    places as given ('800.50')."""
    amount=Decimal(str(value))
    if amount==amount.to_integral_value():return f'{amount:,.0f}'
    return f'{amount:,.2f}' if amount==amount.quantize(Decimal('0.01')) else f'{amount:,}'


def money(value):
    """R175 (Echo cross-cutting rule): a slip amount as '฿1,234' (exact: '฿800.50' keeps its satang)."""
    return '฿'+notice_amount(value)


def transferred(receipt,thai):
    """R175 (Echo D2): 'Transferred 18 Nov 18:16 · Dad TTB' / 'โอน 18 พ.ย. 18:16 · บัญชี Dad TTB' (24-hour, no zone)."""
    from .partner_review import short_date
    when=short_date(receipt['date'],thai)+' '+str(receipt['time'])[:5]
    return f"โอน {when} · บัญชี {receipt['account_label']}" if thai else f"Transferred {when} · {receipt['account_label']}"


def receipt_notice(receipt,borrower,language,payment_id=None,facts_changed=False,purpose='',unpaid=None):
    """payment_id may be supplied only by the verified posting/readback workflow. It selects the posted wording; the notice does
    not print it (R164: not meaningful to the reader). R175 (Echo E-RES-01, E-RCV-01): the first line says what happened,
    with `purpose` (the Reviewer's choice) after ' · '; the transfer time and account follow. R177 (Echo UX-R177-07): `unpaid`
    (review_proposal.arrears_left of a posted Lump Sum) adds one 'Still unpaid' line after the transfer line."""
    if language not in ('English','ไทย'):raise ConfigurationError('PARTNER_LANGUAGE_UNSUPPORTED')
    from .partner_review import date_range
    thai=language=='ไทย'
    name=borrower.get('name_th' if thai else 'name_en') or borrower['id']
    amount=money(receipt['amount'])
    chosen=' · '+purpose if purpose else ''
    if thai:
        subject='บันทึกการชำระเงินสำเร็จ' if payment_id else 'ได้รับสลิปการชำระเงิน'
        lines=[f'บันทึก {amount} จาก {name}{chosen}' if payment_id else f'ได้รับสลิป {amount} จาก {name}',transferred(receipt,True)]
        if payment_id and unpaid:lines.append(f"ยังค้าง {money(unpaid['amount'])} ของ {date_range(unpaid['first'],unpaid['last'],True)}")
        if not payment_id:lines.append('ตรวจสลิปเบื้องต้นผ่านแล้ว ยังไม่ได้บันทึกรายการ')
        if payment_id and facts_changed:lines.append('หมายเหตุ: มีการแก้ไขข้อมูลสัญญาหลังอนุมัติ ระบบยังบันทึกยอดเต็มเป็น Lump Sum')
    else:
        subject='Payment recorded' if payment_id else 'Payment slip received'
        lines=[f'Recorded {amount} from {name}{chosen}' if payment_id else f'Slip {amount} from {name} received',transferred(receipt,False)]
        if payment_id and unpaid:lines.append(f"Still unpaid: {money(unpaid['amount'])} from {date_range(unpaid['first'],unpaid['last'],False)}")
        if not payment_id:lines.append('Basic slip checks passed. Nothing recorded yet.')
        if payment_id and facts_changed:lines.append('Note: loan details changed after approval; the full amount was still recorded as Lump Sum.')
    body='\n'.join(lines)
    if over_limit(body):raise ConfigurationError('NOTICE_TOO_LONG')
    return subject,body
