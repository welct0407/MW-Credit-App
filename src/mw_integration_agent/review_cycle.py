"""Receipt -> correlated Partner review -> guarded ordinary payment or manual handling."""
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from .config import ConfigurationError
from .receipt_rules import ReceiptInvalid,borrower_for,BANGKOK
from .receipt_master import masters
from .payment_match import check
from .partner_notice import NoticeJournal,receipt_notice
from .partner_review import ReviewStore,request_text
from .review_proposal import facts,plan
from .review_execution import add_payment,readback
from .cash_statement import read_query


def cycle(config,journal,identity_reader):
    root=Path(config['state_directory']);db=journal.db;reviews=ReviewStore(db)
    notices=NoticeJournal(root/'partner-notices.db')
    cutoff=datetime.fromisoformat(config['partner_review_cutoff']).timestamp()
    try:
        import time
        with db:db.execute("UPDATE partner_reviews SET state='EXPIRED' WHERE state='PENDING' AND expires_at<?",(time.time(),))
        for job in db.execute("SELECT * FROM receipt_jobs WHERE status='VALIDATED' AND created_at>=?",(cutoff,)).fetchall():
            result=json.loads(job['result']);live=masters(config)
            try:
                b=borrower_for(identity_reader(config,job['sender_id']),live['borrowers'])
                if b['id']!=result['borrower']['id']:raise ReceiptInvalid('BORROWER_CHANGED')
                check(config,result['receipt'],b)
                proposal=plan(result['receipt'],b,facts(config,b['id']))
                key=reviews.reserve(job['id'],proposal)
                for p in live['partners']:
                    subject,body=request_text(proposal,p['language'])
                    notices.reserve('review:'+key,p,subject,body)
                with db:db.execute("UPDATE receipt_jobs SET status='REVIEW_REQUESTED' WHERE id=?",(job['id'],))
            except ReceiptInvalid as exc:journal.mark(job['id'],'REVIEW',str(exc))
        # Signed direct-message replies only. API-polled borrower content cannot authorize.
        ingress=sqlite3.connect(f'file:{root / "instagram-ingress.db"}?mode=ro',uri=True)
        ingress.row_factory=sqlite3.Row
        try:
            events=ingress.execute("SELECT * FROM messages WHERE captured_at>=? AND reply_to<>'' ORDER BY event_timestamp,message_id",(cutoff,)).fetchall()
        finally:ingress.close()
        for event in events:
            event=dict(event)
            notice=notices.db.execute("SELECT * FROM partner_notices WHERE message_id=? AND event_key LIKE 'review:%'",(event['reply_to'],)).fetchone()
            if not notice:continue
            if db.execute('SELECT 1 FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone():continue
            live=masters(config)
            try:identity=identity_reader(config,event['sender_id'])
            except ConfigurationError:continue
            reviews.decide(event,dict(notice),live['partners'],identity)
        for review in db.execute("SELECT * FROM partner_reviews WHERE state IN ('APPROVED','POSTING','UNKNOWN')").fetchall():
            proposal=json.loads(review['proposal']);key='igr:'+review['id'][:48]
            if review['state'] in ('POSTING','UNKNOWN'):
                if readback(config,key,proposal):
                    with db:db.execute("UPDATE partner_reviews SET state='POSTED',payment_id=? WHERE id=?",(key,review['id']))
                continue
            if proposal['action']!='Lump Sum':
                with db:db.execute("UPDATE partner_reviews SET state='MANUAL_REQUIRED' WHERE id=?",(review['id'],))
                continue
            if config.get('partner_review_execution_enabled') is not True:continue
            live=masters(config)
            try:
                matches=[p for p in live['partners'] if p['id']==review['deciding_partner'] and p['enabled'] is True]
                if len(matches)!=1:raise ReceiptInvalid('APPROVING_PARTNER_CHANGED')
                sent=notices.db.execute("SELECT partner FROM partner_notices WHERE event_key=? AND partner_id=? AND ig_status='ACCEPTED'",('review:'+review['id'],review['deciding_partner'])).fetchone()
                if not sent or json.loads(sent[0])!=matches[0]:raise ReceiptInvalid('APPROVING_PARTNER_CHANGED')
                job=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(review['job_id'],)).fetchone()
                b=borrower_for(identity_reader(config,job['sender_id']),live['borrowers'])
                check(config,proposal['receipt'],b)
                fresh=plan(proposal['receipt'],b,facts(config,b['id']))
                if fresh!=proposal:raise ReceiptInvalid('PROPOSAL_FACTS_CHANGED')
                if not any(a['id']==proposal['receipt']['account_id'] and a['active'] is True for a in live['accounts']):
                    raise ReceiptInvalid('RECEIVING_ACCOUNT_CHANGED')
                pid="'"+review['deciding_partner'].replace("'","''")+"'"
                actors=read_query(config,'SELECT coalesce(json_agg("Login Email"),\'[]\'::json) FROM public."Partners" WHERE "Row ID"='+pid+';')
                if len(actors)!=1 or not actors[0]:raise ReceiptInvalid('PARTNER_LOGIN_UNMAPPED')
            except ReceiptInvalid as exc:
                with db:db.execute("UPDATE partner_reviews SET state='STALE',detail=? WHERE id=?",(str(exc),review['id']))
                continue
            with db:
                claimed=db.execute("UPDATE partner_reviews SET state='POSTING',payment_id=? WHERE id=? AND state='APPROVED'",(key,review['id'])).rowcount
            if not claimed:continue
            try:add_payment(config,key,proposal,actors[0])
            except Exception:pass
            verified=readback(config,key,proposal)
            with db:db.execute("UPDATE partner_reviews SET state=? WHERE id=?",('POSTED' if verified else 'UNKNOWN',review['id']))
        for review in db.execute("SELECT * FROM partner_reviews WHERE state IN ('POSTED','REJECTED','MANUAL_REQUIRED','STALE','EXPIRED','UNKNOWN')").fetchall():
            proposal=json.loads(review['proposal']);live=masters(config)
            for p in live['partners']:
                if review['state']=='POSTED':subject,body=receipt_notice(proposal['receipt'],proposal['borrower'],p['language'],review['payment_id'])
                else:
                    thai=p['language']=='ไทย'
                    words={'REJECTED':('Rejected; no payment recorded.','ปฏิเสธแล้ว ยังไม่ได้บันทึกรายการ'),
                      'MANUAL_REQUIRED':('Partner must record this manually. Agent has not posted it.','หุ้นส่วนต้องบันทึกรายการเอง ระบบยังไม่ได้บันทึก'),
                      'STALE':('Facts changed or payment already exists. Check manually; no agent posting.','ข้อมูลเปลี่ยนหรือมีรายการแล้ว กรุณาตรวจสอบ ระบบยังไม่ได้บันทึก'),
                      'EXPIRED':('Review expired; no payment recorded.','คำขอหมดอายุ ยังไม่ได้บันทึกรายการ'),
                      'UNKNOWN':('Posting outcome unconfirmed. Reconciliation only; do not submit again.','ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจสอบ ห้ามบันทึกซ้ำ')}
                    subject='ผลการตรวจสอบ' if thai else 'Receipt review result'
                    body=subject+'\n'+(proposal['borrower'].get('name_th' if thai else 'name_en') or proposal['borrower']['id'])+'\n'+proposal['receipt']['amount']+' THB\n'+words[review['state']][int(thai)]
                notices.reserve('review-result:'+review['id']+':'+review['state'],p,subject,body)
        for notice in notices.due():
            if not notice['event_key'].startswith(('review:','review-result:')):continue
            if notice['event_key'].startswith('review:'):
                row=db.execute('SELECT * FROM partner_reviews WHERE id=?',(notice['event_key'][7:],)).fetchone()
                if not row or row['state']!='PENDING':
                    with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW' WHERE id=?",(notice['id'],))
                    continue
                proposal=json.loads(row['proposal'])
                try:
                    check(config,proposal['receipt'],proposal['borrower'])
                    if facts(config,proposal['borrower']['id'])!=proposal['facts']:raise ReceiptInvalid('PROPOSAL_FACTS_CHANGED')
                except ReceiptInvalid as exc:
                    with db:db.execute("UPDATE partner_reviews SET state='STALE',detail=? WHERE id=?",(str(exc),row['id']))
                    continue
            notices.dispatch(notice,config,masters(config)['partners'])
        return {'reviews':[dict(r) for r in db.execute('SELECT state,count(*) count FROM partner_reviews GROUP BY state')]}
    finally:notices.close()
