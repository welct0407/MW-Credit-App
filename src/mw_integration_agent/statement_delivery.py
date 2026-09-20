"""Explicit partner-only image delivery, fresh bindings and durable send intent."""
from __future__ import annotations

import json
import re
import sqlite3
import time
import urllib.error
import urllib.request
import uuid
from contextlib import closing
from pathlib import Path

from .config import ConfigurationError, load_secret
from .instagram import Instagram


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
        page = api.request(api.config['instagram_account_id']+'/conversations',query)
        if not isinstance(page.get('data'),list):
            raise ConfigurationError('Instagram conversation directory unavailable')
        for conversation in page['data']:
            participants = conversation.get('participants',{})
            if participants.get('paging',{}).get('next'):
                raise ConfigurationError('Incomplete Instagram participant directory')
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
            raise ConfigurationError('Incomplete Instagram pagination')
        seen.add(after)
    else:
        raise ConfigurationError('Instagram pagination exceeded safe bound')
    if len(matches)!=1:
        raise ConfigurationError('Partner conversation is missing or ambiguous')
    recipient = matches.pop()
    if not recipient.isdigit():
        raise ConfigurationError('Invalid scoped recipient')
    profile = api.request(recipient,{'fields':'id,username'})
    if str(profile.get('id'))!=recipient or handle(profile.get('username'))!=handle(partner['username']):
        raise ConfigurationError('Partner Instagram identity changed')
    return recipient


def check_window(state, recipient, now=None):
    now = time.time() if now is None else now
    path = Path(state)/'instagram-ingress.db'
    with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True)) as db:
        stamp = db.execute('SELECT max(event_timestamp) FROM messages WHERE sender_id=?',(recipient,)).fetchone()[0]
    if stamp is None or not 0 <= now-stamp < 86400-60:
        raise ConfigurationError('Partner must send an Instagram message to open the 24-hour delivery window')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None


def upload_image(config, path):
    """Upload directly to Meta; never publish a financial image at a public URL."""
    if not config.get('sending_enabled'):
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
        with urllib.request.build_opener(NoRedirect).open(request,timeout=40) as response:
            value=json.load(response)
    except urllib.error.HTTPError as exc:
        # Emit codes only; never body, tokens, URLs or financial content.
        code = None
        try:
            code=json.loads(exc.read()).get('error',{}).get('code')
        except ValueError:
            pass
        raise ConfigurationError(f'Meta image upload rejected (HTTP {exc.code}, code {code}); no message sent') from exc
    except Exception as exc:
        raise ConfigurationError('Meta image upload unverified; no message send attempted') from exc
    if not value.get('attachment_id'):
        raise ConfigurationError('Meta image upload returned no attachment ID')
    return str(value['attachment_id'])


class DeliveryJournal:
    def __init__(self,path):
        self.db=sqlite3.connect(path)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS cash_statement_sends (
          delivery_key TEXT PRIMARY KEY, recipient TEXT NOT NULL, language TEXT NOT NULL,
          image_hash TEXT NOT NULL, attachment_id TEXT NOT NULL, state TEXT NOT NULL,
          message_id TEXT, updated_at REAL NOT NULL)''')
        self.db.commit()

    def status(self,key):
        row=self.db.execute('SELECT state FROM cash_statement_sends WHERE delivery_key=?',(key,)).fetchone()
        return row[0] if row else None

    def send_once(self,key,recipient,language,image_hash,attachment_id,api):
        if api.config.get('sending_enabled') is not True:
            raise ConfigurationError('sending_enabled is false')
        # Commit intent before network: process death or network ambiguity cannot replay.
        with self.db:
            inserted=self.db.execute('INSERT OR IGNORE INTO cash_statement_sends VALUES (?,?,?,?,?,?,NULL,?)',
                (key,recipient,language,image_hash,attachment_id,'UNKNOWN',time.time())).rowcount
        if not inserted:
            return self.status(key)
        result=api.request(api.config['instagram_account_id']+'/messages',body={
            'recipient':{'id':recipient},'message':{'attachment':{'type':'image',
            'payload':{'attachment_id':attachment_id}}}})
        if not result.get('message_id'):
            raise ConfigurationError('Image send outcome unknown; automatic resend blocked')
        with self.db:
            self.db.execute('UPDATE cash_statement_sends SET state=?,message_id=?,updated_at=? WHERE delivery_key=?',
                ('ACCEPTED',str(result['message_id']),time.time(),key))
        return 'ACCEPTED'

    def close(self):
        self.db.close()
