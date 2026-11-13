"""Explicit signed reviewer commands; resending never recreates a proposal."""
import hashlib
import json
import time
from datetime import datetime
from .receipt_rules import username
from .partner_review import request_text, unidentified_review
from .receipt_hold import held_text, resend_key

COMMANDS = {'review', 'reviews', 'resend review'}
LIMIT = 1000  # Instagram text limit (partner_notice.dispatch)
MORE = 6  # one notify pass sends at most review_cycle.NOTICE_CAP notices


def is_command(event):
    return not event.get('reply_to') and event.get('text', '').strip().casefold() in COMMANDS


def queue(db, notices, config, event, live, identity, now=None, borrower=None):
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
        items = pending_items(db, config, event, now)
        thai = partner['language'] == 'ไทย'
        for position, (_, kind, row) in enumerate(items, 1):
            if kind == 'review':
                key = 'review:' + row['id'] + ':resend:' + token
            else:
                key = resend_key(row, token)
            if notices.db.execute('SELECT 1 FROM partner_notices WHERE event_key=? AND partner_id=?', (key, partner['id'])).fetchone():
                continue
            if kind == 'review':
                subject, body = request_text(json.loads(row['proposal']), partner['language'],
                                             unidentified=unidentified_review(db, row['job_id']))
            else:
                subject, body = held_text(row, borrower(row) if borrower else None, partner['language'],
                                          live.get('accounts', []), live.get('borrowers', ()), resent_at=now)
            counted = f'{position}/{len(items)} · ' + body
            # The counter is on the first line only; a body already at the Instagram limit goes without it.
            notices.reserve(key, partner, subject, counted if len(counted) <= LIMIT else body)
        notices.reserve(result_key, partner, *acknowledgement(sum(k == 'review' for _, k, _ in items),
                                                              sum(k == 'hold' for _, k, _ in items), thai))
    with db:
        db.execute('INSERT OR IGNORE INTO partner_review_replies VALUES (?,?,?)',
                   (event['message_id'], 'review-command:' + token, 'RESEND_QUEUED'))


def pending_items(db, config, event, now):
    """R135: everything waiting for a reviewer decision when the command was sent, oldest first: PENDING unexpired
    payment requests and active validation holds (no age limit). A hold whose receipt has a payment request or
    a posting outcome is listed (or decided) there, not here. Archive-delay alerts and decided results are not resent."""
    items = [(r['created_at'], 'review', dict(r)) for r in db.execute(
        "SELECT * FROM partner_reviews WHERE state='PENDING' AND expires_at>? AND created_at<=?",
        (now, event['event_timestamp'])).fetchall()]
    if config.get('receipt_hold_notice_cutoff'):
        items += [(r['created_at'], 'hold', dict(r)) for r in db.execute(
            "SELECT * FROM receipt_jobs j WHERE status='REVIEW' AND created_at<=? AND NOT EXISTS "
            "(SELECT 1 FROM partner_reviews r WHERE r.job_id=j.id AND r.state IN ('PENDING','APPROVED','POSTING','POSTED','UNKNOWN'))",
            (event['event_timestamp'],)).fetchall()]
    return sorted(items, key=lambda item: (item[0], item[1], item[2]['id']))


def acknowledgement(requests, holds, thai):
    """The command's result (Echo R135 copy): counts per kind, a kind with none left out."""
    if not requests and not holds:
        return (('รายการรอตรวจสอบ', 'ไม่มีรายการรอตรวจสอบ ทั้งคำขออนุมัติและสลิปที่พักไว้') if thai else
                ('Review list', 'Nothing is waiting for review: no payment requests and no held receipts.'))
    if thai:
        counts = ' · '.join(part for count, part in ((requests, f'คำขออนุมัติ {requests} รายการ'), (holds, f'สลิปที่พักไว้ {holds} รายการ')) if count)
        body = (f'รายการรอตรวจสอบ: {counts} จะส่งตามมาทีละข้อความ เรียงจากเก่าสุด ใช้ Reply ตอบแต่ละข้อความ '
                'แต่ละข้อความระบุคำตอบที่ใช้ได้ คำขอที่ตัดสินแล้วหรือหมดอายุจะไม่ส่งซ้ำ')
        if requests + holds > MORE:body += ' ที่เหลือจะส่งตามมาในอีกไม่กี่นาที'
        return 'รายการรอตรวจสอบ', body
    counts = ' · '.join(part for count, part in (
        (requests, f'{requests} payment request' + ('' if requests == 1 else 's')),
        (holds, f'{holds} held receipt' + ('' if holds == 1 else 's'))) if count)
    body = (f'Review list: {counts}. They follow now, oldest first. Use Reply on each message; each one says which replies '
            'it accepts. Decided or expired requests are not resent.')
    if requests + holds > MORE:body += ' More follow over the next few minutes.'
    return 'Review list', body
