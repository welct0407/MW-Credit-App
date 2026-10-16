"""Explicit partner-only image delivery, fresh bindings and durable send intent."""
from __future__ import annotations

import json
import re
from .state import connect as state_connect, is_postgres
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from .audit import audited
from .config import ConfigurationError, load_secret
from .http import opener as http_opener
from .instagram import InstagramAPIError


class InstagramDeliveryError(ConfigurationError):
    pass


def handle(value):
    value = str(value or '').strip().lstrip('@').lower()
    if not re.fullmatch(r'[a-z0-9._]{1,30}',value):
        raise ConfigurationError('Missing or invalid Partner Instagram username')
    return value


def eligible(rows, partner_id):
    matches = [p for p in rows if p['id']==partner_id]
    if len(matches)!=1 or matches[0]['enabled'] is not True:
        raise ConfigurationError('Partner is not currently opted in')
    partner = matches[0]
    username = handle(partner['username'])
    if partner['language'] not in ('English','ไทย'):
        raise ConfigurationError('Partner requires an explicit supported language')
    if sum(str(p.get('username') or '').strip().lstrip('@').lower()==username for p in rows)!=1:
        raise ConfigurationError('Partner Instagram username is duplicated')
    return partner


def resolve_recipient(api, partner):
    matches, seen, after = set(), set(), None
    for _ in range(100):
        query = {'platform':'instagram','fields':'id,participants','limit':100}
        if after:
            query['after']=after
        try:
            page = api.request(api.config['instagram_account_id']+'/conversations',query)
        except ConfigurationError as exc:
            raise InstagramDeliveryError('Instagram conversation lookup failed') from exc
        if not isinstance(page.get('data'),list):
            raise InstagramDeliveryError('Instagram conversation directory unavailable')
        for conversation in page['data']:
            participants = conversation.get('participants',{})
            if participants.get('paging',{}).get('next'):
                raise InstagramDeliveryError('Incomplete Instagram participant directory')
            for peer in participants.get('data',[]):
                if str(peer.get('id')) == api.config['instagram_account_id']:
                    continue
                if str(peer.get('username','')).lower()==handle(partner['username']):
                    matches.add(str(peer['id']))
        paging = page.get('paging',{})
        if not paging.get('next'):
            break
        after = paging.get('cursors',{}).get('after')
        if not after or after in seen:
            raise InstagramDeliveryError('Incomplete Instagram pagination')
        seen.add(after)
    else:
        raise InstagramDeliveryError('Instagram pagination exceeded safe bound')
    if len(matches)!=1:
        raise InstagramDeliveryError('Partner conversation is missing or ambiguous')
    recipient = matches.pop()
    if not recipient.isdigit():
        raise InstagramDeliveryError('Invalid scoped recipient')
    try:
        profile = api.request(recipient,{'fields':'id,username'})
    except ConfigurationError as exc:
        raise InstagramDeliveryError('Instagram profile lookup failed') from exc
    try:
        matches = str(profile.get('id'))==recipient and handle(profile.get('username'))==handle(partner['username'])
    except ConfigurationError:
        matches = False
    if not matches:
        raise InstagramDeliveryError('Partner Instagram identity changed')
    return recipient


@audited('image_upload',route='instagram',action='SEND',effect=True)
def upload_image(config, path, authorized=False):
    """Upload directly to Meta; never publish a financial image at a public URL."""
    if not (config.get('sending_enabled') or authorized):
        raise ConfigurationError('sending_enabled is false')
    data = Path(path).read_bytes()
    if not data.startswith(b'\x89PNG\r\n\x1a\n') or len(data)>8_000_000:
        raise ConfigurationError('Unsupported statement image')
    boundary = uuid.uuid4().hex
    payload = json.dumps({'attachment':{'type':'image','payload':{'is_reusable':True}}})
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="message"\r\n\r\n{payload}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="filedata"; filename="statement.png"\r\n'
            'Content-Type: image/png\r\n\r\n').encode()+data+f'\r\n--{boundary}--\r\n'.encode()
    url = f"https://graph.instagram.com/{config['instagram_api_version']}/{config['instagram_account_id']}/message_attachments"
    request = urllib.request.Request(url,data=body,headers={
        'Authorization':'Bearer '+load_secret(config,'instagram_token_file'),
        'Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
    try:
        with http_opener().open(request,timeout=40) as response:
            value=json.load(response)
    except urllib.error.HTTPError as exc:
        # Emit codes only; never body, tokens, URLs or financial content.
        code = None
        try:
            code=json.loads(exc.read()).get('error',{}).get('code')
        except ValueError:
            pass
        raise InstagramDeliveryError(f'Meta image upload rejected (HTTP {exc.code}, code {code}); no message sent') from exc
    except Exception as exc:
        raise InstagramDeliveryError('Meta image upload unverified; no message send attempted') from exc
    if not value.get('attachment_id'):
        raise InstagramDeliveryError('Meta image upload returned no attachment ID')
    return str(value['attachment_id'])


class DeliveryJournal:
    def __init__(self,path,config=None):
        self.db=state_connect(path,config)
        if is_postgres(self.db):
            return
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS cash_statement_sends (
          delivery_key TEXT PRIMARY KEY, recipient TEXT NOT NULL, language TEXT NOT NULL,
          image_hash TEXT NOT NULL, attachment_id TEXT NOT NULL, state TEXT NOT NULL,
          message_id TEXT, updated_at REAL NOT NULL)''')
        self.db.execute('''CREATE TABLE IF NOT EXISTS cash_statement_emails (
          delivery_key TEXT PRIMARY KEY, partner_id TEXT NOT NULL, status TEXT NOT NULL,
          payload TEXT NOT NULL, attempts INTEGER NOT NULL, retry_after REAL,
          detail TEXT, updated_at REAL NOT NULL)''')
        self.db.commit()

    def status(self,key):
        row=self.db.execute('SELECT state FROM cash_statement_sends WHERE delivery_key=?',(key,)).fetchone()
        return row[0] if row else None

    def send_once(self,key,recipient,language,image_hash,attachment_id,api,authorized=False):
        if not (api.config.get('sending_enabled') or authorized):
            raise ConfigurationError('sending_enabled is false')
        # Commit intent before network: process death or network ambiguity cannot replay.
        with self.db:
            inserted=self.db.execute('INSERT OR IGNORE INTO cash_statement_sends VALUES (?,?,?,?,?,?,NULL,?)',
                (key,recipient,language,image_hash,attachment_id,'UNKNOWN',time.time())).rowcount
        if not inserted:
            return self.status(key)
        try:
            result=api.request(api.config['instagram_account_id']+'/messages',body={
                'recipient':{'id':recipient},'message':{'attachment':{'type':'image',
                'payload':{'attachment_id':attachment_id}}}})
        except InstagramAPIError as exc:
            status='WINDOW_EXPIRED' if exc.window_expired else 'REJECTED' if exc.definite_rejection else 'UNKNOWN'
            with self.db:
                self.db.execute('UPDATE cash_statement_sends SET state=?,updated_at=? WHERE delivery_key=?',(status,time.time(),key))
            return status
        except Exception:
            raise InstagramDeliveryError('Instagram image send outcome unknown') from None
        if not isinstance(result,dict) or not result.get('message_id'):
            raise InstagramDeliveryError('Image send outcome unknown; automatic resend blocked')
        with self.db:
            self.db.execute('UPDATE cash_statement_sends SET state=?,message_id=?,updated_at=? WHERE delivery_key=?',
                ('ACCEPTED',str(result['message_id']),time.time(),key))
        return 'ACCEPTED'

    def window_evidence(self, email_key, partner_id):
        """Match durable provider rejection to this exact report and Partner."""
        try:
            identity=json.loads(email_key)
        except (ValueError, TypeError):
            return False
        if not isinstance(identity,list) or len(identity)!=4 or identity[2]!=partner_id or identity[3]!='email-fallback-v1':
            return False
        prefix=json.dumps(identity[:3])[:-1]+','
        rows=self.db.execute("SELECT delivery_key,state FROM cash_statement_sends WHERE delivery_key LIKE ?",(prefix+'%',)).fetchall()
        confirmed=False
        for row in rows:
            try:page=json.loads(row[0])
            except (ValueError,TypeError):continue
            if isinstance(page,list) and len(page)==5 and page[:3]==identity[:3]:
                if row[1] not in ('ACCEPTED','WINDOW_EXPIRED'):return False
                confirmed=confirmed or row[1]=='WINDOW_EXPIRED'
        return confirmed

    def email_status(self,key):
        row=self.db.execute('SELECT status FROM cash_statement_emails WHERE delivery_key=?',(key,)).fetchone()
        return row[0] if row else None

    def reserve_email(self,key,partner_id,payload,attempts=1):
        encoded=json.dumps(payload,ensure_ascii=False,sort_keys=True)
        with self.db:
            row=self.db.execute('SELECT status,payload FROM cash_statement_emails WHERE delivery_key=?',(key,)).fetchone()
            if row:
                if row[1]!=encoded:
                    raise ConfigurationError('Email fallback content changed; reconciliation required')
                return False,row[0]
            self.db.execute('INSERT INTO cash_statement_emails VALUES (?,?,?,?,?,NULL,NULL,?)',
                (key,partner_id,'EMAIL_UNKNOWN',encoded,attempts,time.time()))
        return True,'EMAIL_UNKNOWN'

    def mark_email(self,key,status,attempts=None,retry_after=None,detail=None):
        with self.db:
            if attempts is None:
                self.db.execute('UPDATE cash_statement_emails SET status=?,retry_after=?,detail=?,updated_at=? WHERE delivery_key=?',
                    (status,retry_after,detail,time.time(),key))
            else:
                self.db.execute('UPDATE cash_statement_emails SET status=?,attempts=?,retry_after=?,detail=?,updated_at=? WHERE delivery_key=?',
                    (status,attempts,retry_after,detail,time.time(),key))

    def due_emails(self,now=None):
        now=time.time() if now is None else now
        rows=self.db.execute('SELECT delivery_key,partner_id,payload,attempts FROM cash_statement_emails '
            "WHERE status='EMAIL_REJECTED' AND attempts<3 AND retry_after<=? ORDER BY retry_after",(now,)).fetchall()
        return [{'key':r[0],'partner_id':r[1],'payload':json.loads(r[2]),'attempts':r[3]} for r in rows if self.window_evidence(r[0],r[1])]

    def begin_email_retry(self,key,attempts):
        row=self.db.execute('SELECT partner_id FROM cash_statement_emails WHERE delivery_key=?',(key,)).fetchone()
        if not row or not self.window_evidence(key,row[0]):return False
        with self.db:
            changed=self.db.execute("UPDATE cash_statement_emails SET status='EMAIL_UNKNOWN',attempts=?,updated_at=? "
                "WHERE delivery_key=? AND status='EMAIL_REJECTED'",(attempts,time.time(),key)).rowcount
        return bool(changed)

    def close(self):
        self.db.close()
