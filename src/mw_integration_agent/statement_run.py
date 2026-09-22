from __future__ import annotations

import hashlib
import json
import os
import time
from decimal import Decimal
from pathlib import Path

from .cash_statement import partners, period, snapshot
from .config import ConfigurationError, load_json, validate_catalogue, validate_config
from .graph_email import EmailRejected, EmailUnknown, GraphEmail, valid_email
from .instagram import Instagram
from .statement_delivery import (DeliveryJournal, InstagramDeliveryError, check_window, eligible,
                                 resolve_recipient, upload_image)
from .statement_image import render


def require_services(catalogue, names):
    for name in names:
        if catalogue['services'].get(name, {}).get('enabled') is not True:
            raise ConfigurationError(name + ' is disabled')


def delivery_authorized(config, scheduled):
    return config.get('cash_statement_schedule_enabled') is True if scheduled else config.get('sending_enabled') is True


def email_payload(report, partner, images, ig_reason):
    language = partner['language']
    thai = language == 'ไทย'
    day = report['start'][:10]
    subject = f'รายการเดินบัญชีรายวัน {day}' if thai else f'Daily cash statements {day}'
    partial = ''
    if ig_reason:
        partial = ('<p>Instagram delivery was unavailable or incomplete. This email contains the complete statement set.</p>'
                   if not thai else '<p>ไม่สามารถส่งทาง Instagram ได้หรือส่งไม่ครบ อีเมลนี้มีรายการเดินบัญชีครบทั้งหมด</p>')
    greeting = ('<p>กรุณาดูรายการเดินบัญชีประจำวันในไฟล์ภาพที่แนบมา</p>' if thai
                else '<p>Please find the complete daily cash statements attached.</p>')
    attachments = []
    index = 0
    for account in report['accounts']:
        for page, path in enumerate(images[(account['id'], language)], 1):
            index += 1
            data = Path(path).read_bytes()
            attachments.append({'path': str(Path(path).resolve()), 'sha256': hashlib.sha256(data).hexdigest(),
                                'name': f'cash-statement-{index:02d}-page-{page:02d}.png'})
    return {'recipient': partner['email'], 'language': language, 'subject': subject,
            'body': greeting + partial + '<p>M&amp;W Credit</p>', 'attachments': attachments}


def send_email_once(journal, key, partner, payload, config):
    old = journal.email_status(key)
    if old:
        return old
    inserted, status = journal.reserve_email(key, partner['id'], payload)
    if not inserted:
        return status
    try:
        GraphEmail(config).send(payload['recipient'], payload['subject'], payload['body'],
                                payload['attachments'], key)
        journal.mark_email(key, 'EMAIL_ACCEPTED')
        return 'EMAIL_ACCEPTED'
    except EmailRejected as exc:
        journal.mark_email(key, 'EMAIL_REJECTED', attempts=1, retry_after=time.time() + 120, detail=str(exc))
        return 'EMAIL_REJECTED'
    except EmailUnknown as exc:
        journal.mark_email(key, 'EMAIL_UNKNOWN', detail=str(exc))
        return 'EMAIL_UNKNOWN'


def _fresh_controls(config_path, catalogue_path, scheduled):
    config, catalogue = load_json(config_path), load_json(catalogue_path)
    validate_config(config)
    validate_catalogue(catalogue)
    require_services(catalogue, ['daily_cash_statement', 'database_connectivity',
                                 'partner_authentication', 'instagram_delivery'])
    if not delivery_authorized(config, scheduled):
        raise ConfigurationError('Cash statement delivery authorization is off')
    return config, catalogue


def run(config_path, catalogue_path, day=None, send=False, scheduled=False):
    import fcntl
    if scheduled:
        if day is not None:
            raise ConfigurationError('Scheduled runs always use the latest completed Bangkok day')
        send = True
    config, catalogue = load_json(config_path), load_json(catalogue_path)
    validate_config(config)
    validate_catalogue(catalogue)
    require_services(catalogue, ['daily_cash_statement', 'database_connectivity', 'partner_authentication'])
    if send:
        require_services(catalogue, ['instagram_delivery', 'email_fallback'])
        if not delivery_authorized(config, scheduled):
            raise ConfigurationError('Cash statement delivery authorization is off')
        if not config.get('email_fallback_enabled'):
            raise ConfigurationError('email_fallback_enabled is false')
    os.umask(0o077)
    state = Path(config['state_directory'])
    state.mkdir(parents=True, exist_ok=True)
    lock = (state / 'cash-statement.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        lock.close()
        raise ConfigurationError('A cash statement run is already active') from exc
    journal = DeliveryJournal(state / 'cash-statement-delivery.db', config=config)
    try:
        start, end = period(day)
        folder = state / 'cash-statements' / 'calendar-day' / start.date().isoformat()
        folder.mkdir(parents=True, exist_ok=True)
        saved = folder / 'snapshot.json'
        from .statement_snapshot import load as load_snapshot, save as save_snapshot
        snapshot_key='calendar-day/'+start.date().isoformat()
        central_snapshot=load_snapshot(config,snapshot_key)
        if central_snapshot is not None:
            if saved.exists() and saved.read_text(encoding='utf-8')!=central_snapshot:
                raise ConfigurationError('LOCAL_CENTRAL_STATEMENT_SNAPSHOT_MISMATCH')
            if not saved.exists():saved.write_text(central_snapshot,encoding='utf-8')
        reused = saved.exists()
        if reused:
            report = json.loads(saved.read_text(), parse_float=Decimal)
            if (report['start'] != start.isoformat() or report['end'] != end.isoformat()
                    or report['basis'] != 'ledger-posting-time'):
                raise ConfigurationError('Saved report period does not match')
        else:
            report = snapshot(config, start, end)
            temp = folder / 'snapshot.tmp'
            temp.write_text(json.dumps(report, ensure_ascii=False, default=str), encoding='utf-8')
            temp.replace(saved)
        save_snapshot(config,snapshot_key,saved.read_text(encoding='utf-8'),str(saved))
        rows = partners(config)
        results = []
        images = {}
        for account in report['accounts']:
            account_key = hashlib.sha256(account['id'].encode()).hexdigest()[:20]
            for language, suffix in [('English', 'en'), ('ไทย', 'th')]:
                images[(account['id'], language)] = render(report, account, language, folder / account_key / suffix)
        for candidate in rows:
            if candidate['enabled'] is not True:
                continue
            record = {'partner_key': hashlib.sha256(candidate['id'].encode()).hexdigest()[:12],
                      'language': candidate['language'], 'accepted': 0, 'already_accepted': 0,
                      'status': 'PREPARED'}
            try:
                partner = eligible(rows, candidate['id'])
                if send:
                    ig_reason = None
                    try:
                        api = Instagram(config)
                        recipient = resolve_recipient(api, partner)
                        check_window(state, recipient, config=config)
                        for account in report['accounts']:
                            for number, path in enumerate(images[(account['id'], partner['language'])], 1):
                                key = json.dumps([report['start'], report['end'], partner['id'], account['id'], number])
                                status = journal.status(key)
                                if status == 'ACCEPTED':
                                    record['already_accepted'] += 1
                                    continue
                                if status:
                                    raise InstagramDeliveryError('Prior Instagram outcome is unknown')
                                fresh, _ = _fresh_controls(config_path, catalogue_path, scheduled)
                                current = eligible(partners(fresh), partner['id'])
                                if current != partner:
                                    raise ConfigurationError('Partner master changed; prepare again before delivery')
                                live_api = Instagram(fresh)
                                if resolve_recipient(live_api, current) != recipient:
                                    raise InstagramDeliveryError('Partner Instagram recipient changed')
                                check_window(state, recipient, config=config)
                                attachment = upload_image(fresh, path, authorized=scheduled)
                                final, _ = _fresh_controls(config_path, catalogue_path, scheduled)
                                if eligible(partners(final), partner['id']) != partner:
                                    raise ConfigurationError('Partner master changed after image upload')
                                check_window(state, recipient, config=config)
                                journal.send_once(key, recipient, partner['language'],
                                                  hashlib.sha256(path.read_bytes()).hexdigest(),
                                                  attachment, live_api, authorized=scheduled)
                                record['accepted'] += 1
                        record['status'] = 'ACCEPTED'
                    except InstagramDeliveryError as exc:
                        ig_reason = str(exc)
                    if ig_reason:
                        fresh, live_catalogue = _fresh_controls(config_path, catalogue_path, scheduled)
                        require_services(live_catalogue, ['email_fallback'])
                        if not fresh.get('email_fallback_enabled'):
                            raise ConfigurationError('email_fallback_enabled is false')
                        current = eligible(partners(fresh), partner['id'])
                        if current != partner:
                            raise ConfigurationError('Partner master changed before email fallback')
                        if not valid_email(partner.get('email')):
                            raise ConfigurationError('Partner email is missing or invalid')
                        payload = email_payload(report, partner, images, ig_reason)
                        email_key = json.dumps([report['start'], report['end'], partner['id'], 'email-fallback-v1'])
                        record['status'] = send_email_once(journal, email_key, partner, payload, fresh)
                        record['instagram_reason'] = ig_reason
            except ConfigurationError as exc:
                record.update(status='BLOCKED', reason=str(exc))
            results.append(record)
        result = {'period_start': report['start'], 'period_end': report['end'],
                  'accounts': len(report['accounts']), 'snapshot_reused': reused,
                  'directory': str(folder), 'recipients': results, 'scheduled': scheduled}
        (folder / 'last-run.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        return result
    finally:
        journal.close()
        lock.close()


def retry_emails(config_path, catalogue_path):
    config, catalogue = _fresh_controls(config_path, catalogue_path, True)
    require_services(catalogue, ['email_fallback'])
    if not config.get('email_fallback_enabled'):
        raise ConfigurationError('email_fallback_enabled is false')
    journal = DeliveryJournal(Path(config['state_directory']) / 'cash-statement-delivery.db', config=config)
    results = []
    try:
        rows = partners(config)
        for item in journal.due_emails():
            try:
                partner = eligible(rows, item['partner_id'])
                payload = item['payload']
                if partner['email'] != payload['recipient'] or partner['language'] != payload['language']:
                    journal.mark_email(item['key'], 'EMAIL_CANCELLED', detail='Partner master changed')
                    results.append({'key': hashlib.sha256(item['key'].encode()).hexdigest()[:12],
                                    'status': 'EMAIL_CANCELLED'})
                    continue
                attempts = item['attempts'] + 1
                if not journal.begin_email_retry(item['key'], attempts):
                    continue
                try:
                    GraphEmail(config).send(payload['recipient'], payload['subject'], payload['body'],
                                            payload['attachments'], item['key'])
                    journal.mark_email(item['key'], 'EMAIL_ACCEPTED')
                    status = 'EMAIL_ACCEPTED'
                except EmailRejected as exc:
                    journal.mark_email(item['key'], 'EMAIL_REJECTED', attempts=attempts,
                                       retry_after=time.time() + 60 * (2 ** attempts), detail=str(exc))
                    status = 'EMAIL_REJECTED'
                except EmailUnknown as exc:
                    journal.mark_email(item['key'], 'EMAIL_UNKNOWN', detail=str(exc))
                    status = 'EMAIL_UNKNOWN'
                results.append({'key': hashlib.sha256(item['key'].encode()).hexdigest()[:12], 'status': status})
            except ConfigurationError:
                journal.mark_email(item['key'], 'EMAIL_CANCELLED', detail='Partner no longer eligible')
        return {'retried': results}
    finally:
        journal.close()
