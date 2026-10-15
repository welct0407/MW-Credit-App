"""Explicit signed reviewer commands; resending never recreates a proposal."""
import hashlib
import json
import time
from datetime import datetime
from .receipt_rules import username
from .partner_review import request_text

COMMANDS = {'review', 'reviews', 'resend review'}


def is_command(event):
    return not event.get('reply_to') and event.get('text', '').strip().casefold() in COMMANDS


def queue(db, notices, config, event, live, identity, now=None):
    now = time.time() if now is None else now
    cutoff = config.get('review_resend_cutoff')
    if not is_command(event) or not cutoff:
        return
    cutoff = datetime.fromisoformat(cutoff).timestamp()
    if (min(event['captured_at'], event['event_timestamp']) < cutoff or
            not 0 <= now - event['event_timestamp'] < 86340):
        return
    if db.execute('SELECT 1 FROM partner_review_replies WHERE message_id=?', (event['message_id'],)).fetchone():
        return
    name = username(identity.get('username'))
    matches = [p for p in live['partners'] if name and username(p['username']) == name]
    if identity.get('id') != event['sender_id'] or len(matches) != 1:
        return
    partner = matches[0]
    if (partner['id'] not in live.get('reviewer_ids', []) or partner['enabled'] is not True or
            partner['language'] not in ('English', 'ไทย')):
        return
    token = hashlib.sha256(event['message_id'].encode()).hexdigest()
    result_key = 'review-command-result:' + token
    # The acknowledgement is the durable completion marker. If interrupted before
    # it, deterministic per-command notice keys recover without another send.
    if not notices.db.execute('SELECT 1 FROM partner_notices WHERE event_key=?', (result_key,)).fetchone():
        rows = db.execute("SELECT * FROM partner_reviews WHERE state='PENDING' AND expires_at>? AND created_at<=?",
                          (now, event['event_timestamp'])).fetchall()
        for row in rows:
            key = 'review:' + row['id'] + ':resend:' + token
            if notices.db.execute('SELECT 1 FROM partner_notices WHERE event_key=? AND partner_id=?', (key, partner['id'])).fetchone():
                continue
            subject, body = request_text(json.loads(row['proposal']), partner['language'])
            notices.reserve(key, partner, subject, body)
        thai = partner['language'] == 'ไทย'
        subject = 'คำขอตรวจสอบ' if thai else 'Review requests'
        body = ('ส่งคำขอตรวจสอบที่ยังรอดำเนินการให้อีกครั้ง กรุณาตอบกลับแต่ละข้อความโดยตรง คำขอที่หมดอายุหรือตัดสินใจแล้วจะไม่เปิดใหม่' if thai else
                'Pending review requests have been queued again. Reply directly to each request to decide it. Expired or decided requests stay closed.') if rows else (
                'ไม่มีคำขอตรวจสอบที่ยังรอและไม่หมดอายุ' if thai else 'There are no pending, unexpired review requests to resend.')
        notices.reserve(result_key, partner, subject, body)
    with db:
        db.execute('INSERT OR IGNORE INTO partner_review_replies VALUES (?,?,?)',
                   (event['message_id'], 'review-command:' + token, 'RESEND_QUEUED'))
