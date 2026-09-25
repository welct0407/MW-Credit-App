"""Durable partner text notifications: Instagram first, email only as fallback."""
import hashlib
import html
import json
import sqlite3
from .state import connect as state_connect, enabled as state_enabled, is_postgres
import time
from pathlib import Path

from .config import ConfigurationError
from .graph_email import GraphEmail, EmailRejected, valid_email
from .instagram import Instagram
from .statement_delivery import eligible, resolve_recipient, check_window


def display_notice(item):
    """Status decoration at delivery; keep reserved payloads and reply keys immutable."""
    event=item['event_key']
    icon=''
    if event.startswith('review:'):icon='❓'
    elif event.startswith('receipt-held:'):icon='⚠️'
    elif event.startswith('hold-reply-result:'):icon='❌' if item['subject'] in ('Held receipt rejected','ปฏิเสธสลิปที่พักไว้แล้ว') else 'ℹ️'
    elif event.startswith('review-result:'):
        icon={'POSTED':'✅','REJECTED':'❌','MANUAL_REQUIRED':'📝',
              'STALE':'⚠️','EXPIRED':'⌛','UNKNOWN':'⚠️'}.get(event.rsplit(':',1)[-1],'')
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
        if 'recipient_id' not in {r[1] for r in self.db.execute('PRAGMA table_info(partner_notices)')}:
            self.db.execute('ALTER TABLE partner_notices ADD COLUMN recipient_id TEXT')
            self.db.commit()

    def reserve(self,event_key,partner,subject,body):
        key=hashlib.sha256((event_key+':'+partner['id']).encode()).hexdigest()
        payload=json.dumps(partner,sort_keys=True,ensure_ascii=False)
        with self.db:
            old=self.db.execute('SELECT * FROM partner_notices WHERE id=?',(key,)).fetchone()
            # Completed or held deliveries are immutable history. A fresh master
            # snapshot must not reopen them or block unrelated queued notices.
            if old and (old['ig_status'] in ('ACCEPTED','REVIEW') or
                        old['email_status'] in ('SENT','UNKNOWN','REVIEW')):
                return key
            if old and (old['partner'],old['subject'],old['body'])!=(payload,subject,body):
                raise ConfigurationError('NOTICE_CONTENT_CHANGED')
            self.db.execute('INSERT OR IGNORE INTO partner_notices(id,event_key,partner_id,partner,subject,body) VALUES (?,?,?,?,?,?)',
                            (key,event_key,partner['id'],payload,subject,body))
        return key

    def due(self):
        return [dict(r) for r in self.db.execute("""SELECT * FROM partner_notices WHERE
          ig_status NOT IN ('ACCEPTED','REVIEW') AND email_status IN ('PENDING','REJECTED')
          AND attempts<3 AND retry_after<=?""",(time.time(),))]

    def dispatch(self,item,config,rows,api=None,mailer=None,resolver=resolve_recipient,window=check_window):
        # Re-read state; callers cannot replay an old in-memory PENDING item.
        item=dict(self.db.execute('SELECT * FROM partner_notices WHERE id=?',(item['id'],)).fetchone())
        if item['ig_status'] in ('ACCEPTED','REVIEW') or item['email_status'] in ('SENT','UNKNOWN','REVIEW'):
            return
        subject,body=display_notice(item)
        conversation = item['event_key'].startswith('conversation:')
        if conversation and config.get('partner_conversations_enabled') is not True:
            raise ConfigurationError('PARTNER_CONVERSATIONS_DISABLED')
        if not conversation and config.get('receipt_summary_enabled') is not True:
            raise ConfigurationError('RECEIPT_NOTICES_DISABLED')
        wanted=json.loads(item['partner'])
        matches=[r for r in rows if r['id']==item['partner_id']]
        if len(matches)!=1 or matches[0]!=wanted:
            with self.db:self.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='PARTNER_CHANGED' WHERE id=?",(item['id'],))
            return
        partner=matches[0]
        if conversation:
            # Unlike receipt notices, opting out blocks BOTH conversation channels.
            try:eligible(rows,partner['id'])
            except ConfigurationError:
                with self.db:self.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='PARTNER_REVOKED' WHERE id=?",(item['id'],))
                return
        if item['ig_status']=='PENDING':
            try:
                eligible(rows,partner['id'])
                api=api or Instagram(config)
                recipient=resolver(api,partner)
                if conversation and recipient != item['recipient_id']:
                    with self.db:self.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='CONVERSATION_SENDER_CHANGED' WHERE id=?",(item['id'],))
                    return
                window(Path(config['state_directory']),recipient, **({'config':config} if window is check_window else {}))
                if len(body)>1000:
                    raise ConfigurationError('COMPLETE_REPLY_REQUIRES_EMAIL')
            except ConfigurationError:
                with self.db:self.db.execute("UPDATE partner_notices SET ig_status='UNAVAILABLE',detail='IG_ROUTE_OR_WINDOW_UNAVAILABLE' WHERE id=?",(item['id'],))
            else:
                with self.db:
                    claimed=self.db.execute("UPDATE partner_notices SET ig_status='UNKNOWN',recipient_id=? WHERE id=? AND ig_status='PENDING'",(recipient,item['id'])).rowcount
                if not claimed:return
                try:
                    response=api.request(config['instagram_account_id']+'/messages',body={'recipient':{'id':recipient},'message':{'text':body}})
                    if not response.get('message_id'):raise ConfigurationError('IG_OUTCOME_UNKNOWN')
                except Exception:
                    # Do not resend uncertain IG. Email fallback can explicitly duplicate a delivered IG notice.
                    pass
                else:
                    with self.db:self.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id=? WHERE id=?",(str(response['message_id']),item['id']))
                    return
        if not config.get('email_fallback_enabled') or not valid_email(partner.get('email')):
            with self.db:self.db.execute("UPDATE partner_notices SET email_status='REVIEW',detail='EMAIL_FALLBACK_UNAVAILABLE' WHERE id=?",(item['id'],))
            return
        with self.db:
            claimed=self.db.execute("""UPDATE partner_notices SET email_status='UNKNOWN',attempts=attempts+1
              WHERE id=? AND email_status IN ('PENDING','REJECTED') AND attempts<3 AND retry_after<=?""",(item['id'],time.time())).rowcount
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
        except Exception:
            pass
        else:
            with self.db:self.db.execute("UPDATE partner_notices SET email_status='SENT' WHERE id=?",(item['id'],))

    def close(self):self.db.close()


def receipt_notice(receipt,borrower,language,payment_id=None):
    """payment_id may be supplied only by the verified posting/readback workflow."""
    if language not in ('English','ไทย'):raise ConfigurationError('PARTNER_LANGUAGE_UNSUPPORTED')
    thai=language=='ไทย'
    name=borrower.get('name_th' if thai else 'name_en') or borrower['id']
    from decimal import Decimal
    amount=f"{Decimal(receipt['amount']):,.2f}"
    when=receipt['date']+' '+receipt['time'][:5]
    if thai:
        subject='บันทึกการชำระเงินสำเร็จ' if payment_id else 'ได้รับสลิปการชำระเงิน'
        body=f"{subject}\nผู้ชำระ: {name}\nจำนวน: {amount} บาท\nวันเวลาโอน: {when} (เวลาไทย)\nรับเข้าบัญชี: {receipt['account_label']}"
        body+=f'\nรายการชำระเงิน: {payment_id}' if payment_id else '\nผ่านการตรวจสอบสลิปเบื้องต้น ยังไม่ได้บันทึกการชำระเงิน'
    else:
        subject='Payment processed' if payment_id else 'Payment receipt received'
        body=f"{subject}\nBorrower: {name}\nAmount: {amount} baht\nTransferred: {when} (Bangkok)\nReceived into: {receipt['account_label']}"
        body+=f'\nPayment ID: {payment_id}' if payment_id else '\nBasic receipt checks passed. Payment has not been recorded.'
    if len(body)>1000:raise ConfigurationError('NOTICE_TOO_LONG')
    return subject,body
