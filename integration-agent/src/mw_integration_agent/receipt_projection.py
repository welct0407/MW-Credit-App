"""Retry only a verified evidence attachment. Never call Payments Add."""
import hashlib
import json
import time
import uuid
from datetime import datetime, UTC

from . import audit
from . import receipt_audit
from .state import assume_role, transaction
from .config import ConfigurationError, auth_mode, iam_port, iam_user, load_secret
from .receipt_archive import Archive, encoded
from .review_execution import readback


ROLE = 'mw_receipt_projector'


def login(config):
    """Fixed sign-in for the projector: its own password on 5432, or (receipt_projector_auth='iam',
    ALL-ARCH-03 part 2b, needs business V95) the VM's IAM user on the auto-iam-authn listener."""
    environment = config['receipt_environment']
    database = {'dev':'loan_manager_dev','prod':'loan_manager_prod'}[environment]
    try:
        mode = auth_mode(config, 'receipt_projector_')
    except ConfigurationError:
        raise ConfigurationError('UNAPPROVED_RECEIPT_DATABASE') from None
    if config.get('database_host') not in ('127.0.0.1','::1') or config.get('database_name') != database:
        raise ConfigurationError('UNAPPROVED_RECEIPT_DATABASE')
    if mode == 'iam':
        return mode, dict(host=config['database_host'], port=iam_port(config), dbname=database, user=iam_user(config))
    if config.get('database_port') != 5432:
        raise ConfigurationError('UNAPPROVED_RECEIPT_DATABASE')
    return mode, dict(host=config['database_host'], port=5432, dbname=database, user=ROLE)


def open_projector(config, mode, target):
    import psycopg
    options = dict(connect_timeout=10, options='-c statement_timeout=15000 -c lock_timeout=3000',
                   application_name='mw-receipt-projector')
    if mode != 'iam':
        return psycopg.connect(**target, password=load_secret(config, 'receipt_projector_password_file'), **options)
    # SET ROLE runs first, outside any transaction; the attachment call then runs in its own transaction.
    connection = psycopg.connect(**target, autocommit=True, **options)
    try:
        assume_role(connection, ROLE)
        connection.autocommit = False
    except BaseException:
        connection.close()
        raise
    return connection


def project(config, link, asset):
    from psycopg.types.json import Jsonb
    mode, target = login(config)
    intent = receipt_audit.plan(config, link, asset)
    with transaction(config) as central:
        operation = receipt_audit.begin(central, config, intent)
        audit.event(central, operation, 'dispatch_started', route='postgres', state='DISPATCHING')
    try:
        with open_projector(config, mode, target) as connection:
            result=connection.execute('SELECT public.attach_payment_receipt_evidence(%s,%s,%s,%s,%s,%s,%s)',
                (link['payment_id'],asset['receipt_id'],asset['object_key'],
                 datetime.fromtimestamp(json.loads(asset['source'])['captured_at'],UTC),
                 Jsonb(json.loads(link['verification'])),uuid.UUID(link['link_id']),config.get('code_version','unknown'))).fetchone()[0]
        with transaction(config) as central:
            audit.event(central, operation, 'projection_observed', {'result': result}, 'postgres', 'COMMITTED')
        return result
    except BaseException:
        with transaction(config) as central:
            audit.event(central, operation, 'projection_unknown', route='postgres', state='UNKNOWN')
        raise


def reconcile(config, journal, transport=project, verify=readback, storage=None):
    archive=Archive(config,journal,storage=storage)
    db=journal.db
    counts={'applied':0,'pending':0,'conflict':0}
    # Source decision and archive must both be durable. Older/unarchived jobs never link.
    rows=db.execute('''SELECT r.payment_id,r.proposal,a.job_id FROM partner_reviews r
      JOIN receipt_assets a ON a.job_id=r.job_id
      LEFT JOIN receipt_payment_links l ON l.receipt_id=a.receipt_id
      WHERE r.state='POSTED' AND a.archive_state='ARCHIVED'
      AND (l.link_id IS NULL OR (l.projection_state IN ('PENDING','UNKNOWN') AND l.next_attempt_at<=?))
      ORDER BY a.receipt_id LIMIT 20''',(time.time(),)).fetchall()
    for row in rows:
        asset=archive.get(row['job_id'])
        proposal=json.loads(row['proposal']); receipt=proposal['receipt']
        link_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'mw-receipt:'+asset['receipt_id']+':'+row['payment_id']))
        try:
            facts=encoded(dict(borrower=proposal['borrower']['id'],amount=receipt['amount'],date=receipt['date'],
                clock=receipt['date']+' '+receipt['time'][:5],reference=receipt['reference'],account=receipt['account_id']))
            with db:
                db.execute('''INSERT OR IGNORE INTO receipt_payment_links
                  (link_id,receipt_id,business_environment,payment_id,verification,verification_digest,verified_at)
                  VALUES (?,?,?,?,?,?,?)''',(link_id,asset['receipt_id'],config['receipt_environment'],row['payment_id'],facts,
                  hashlib.sha256(facts.encode()).hexdigest(),time.time()))
            saved=db.execute('SELECT * FROM receipt_payment_links WHERE link_id=?',(link_id,)).fetchone()
            if not saved or saved['verification']!=facts:
                counts['conflict']+=1
                continue
            if not verify(config,row['payment_id'],proposal):
                with db:
                    db.execute("UPDATE receipt_payment_links SET projection_state='CONFLICT',last_error_code='PAYMENT_READBACK_CONFLICT' WHERE link_id=?",(link_id,))
                counts['conflict']+=1
                continue
            with db:
                db.execute("UPDATE receipt_payment_links SET projection_state='UNKNOWN',attempts=attempts+1,next_attempt_at=? WHERE link_id=?",
                           (time.time()+300,link_id))
            result=transport(config,dict(saved),asset)
            if result not in ('applied','already_applied'):
                raise ConfigurationError('UNEXPECTED_RECEIPT_PROJECTION')
            with db:
                db.execute("UPDATE receipt_payment_links SET projection_state='APPLIED',last_error_code='' WHERE link_id=?",(link_id,))
            counts['applied']+=1
        except Exception as exc:
            conflict=getattr(exc,'sqlstate',None)=='P0001'
            with db:
                db.execute('UPDATE receipt_payment_links SET projection_state=?,last_error_code=?,next_attempt_at=? WHERE link_id=?',
                    ('CONFLICT' if conflict else 'UNKNOWN','RECEIPT_LINK_CONFLICT' if conflict else 'RECEIPT_PROJECTION_UNCERTAIN',time.time()+300,link_id))
            counts['conflict' if conflict else 'pending']+=1
    return counts
