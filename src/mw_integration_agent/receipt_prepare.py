"""Operator-requested receipt selection through the same extractor/rules as webhook jobs."""
import hashlib
import json
import os
import re
from datetime import date,datetime,timedelta
from pathlib import Path

from .config import ConfigurationError
from .instagram import Instagram
from .receipt_image import download,extract
from .receipt_master import masters
from .receipt_rules import BANGKOK,borrower_for,validate_receipt,username
from .receipt_run import controls,conversation_identity


def prepare(config_path,catalogue_path,borrower_id,day,message_id=None):
    config=controls(config_path,catalogue_path)
    selected=date.fromisoformat(day)
    if selected not in (datetime.now(BANGKOK).date(),datetime.now(BANGKOK).date()-timedelta(days=1)):
        raise ConfigurationError('SELECT_TODAY_OR_YESTERDAY')
    master=masters(config)
    borrowers=[b for b in master['borrowers'] if b['id']==borrower_id and b['enabled'] is True]
    if len(borrowers)!=1:raise ConfigurationError('BORROWER_NOT_UNIQUELY_ENABLED')
    borrower=borrowers[0];api=Instagram(config);after=None;seen=set();candidates={}
    for _ in range(100):
        query={'platform':'instagram','fields':'id,participants,messages.limit(30){id,created_time,from,attachments}','limit':100}
        if after:query['after']=after
        page=api.request(config['instagram_account_id']+'/conversations',query)
        for conversation in page['data']:
            if not any(username(p.get('username'))==username(borrower['username']) for p in conversation['participants']['data']):continue
            for message in conversation.get('messages',{}).get('data',[]):
                sender=message.get('from',{})
                if username(sender.get('username'))!=username(borrower['username']):continue
                if datetime.fromisoformat(message['created_time']).astimezone(BANGKOK).date()!=selected:continue
                images=message.get('attachments',{}).get('data',[])
                if images and (message_id is None or message['id']==message_id):candidates[message['id']]=message
            if conversation.get('messages',{}).get('paging',{}).get('next') and not message_id:
                raise ConfigurationError('MESSAGE_HISTORY_TRUNCATED_SELECT_EXPLICIT_MESSAGE')
        if not page.get('paging',{}).get('next'):break
        after=page['paging']['cursors']['after']
        if after in seen:raise ConfigurationError('CONVERSATION_PAGINATION_INCOMPLETE')
        seen.add(after)
    else:raise ConfigurationError('CONVERSATION_PAGINATION_INCOMPLETE')
    if len(candidates)!=1:raise ConfigurationError('RECEIPT_MESSAGE_NOT_UNIQUE')
    message=next(iter(candidates.values()));attachments=message['attachments']['data']
    if len(attachments)!=1:raise ConfigurationError('RECEIPT_ATTACHMENT_NOT_UNIQUE')
    borrower=borrower_for(conversation_identity(config,message['from']['id']),master['borrowers'])
    url=attachments[0].get('image_data',{}).get('url')
    if not url:raise ConfigurationError('NO_RECEIPT_IMAGE')
    image,digest=download(url)
    raw=extract(config,image);receipt=validate_receipt(raw,master['accounts'])
    if receipt['reference'] in master['posted_references']:raise ConfigurationError('REFERENCE_ALREADY_IN_PAYMENTS')
    key=hashlib.sha256((message['id']+':0').encode()).hexdigest()
    candidate={'job_id':key,'source':'owner-selected-instagram-history','message_id':message['id'],
               'sender_id':message['from']['id'],'image_hash':digest,'raw':raw,'receipt':receipt,'borrower':borrower}
    os.umask(0o077)
    folder=Path(config['state_directory'])/'receipt-candidates';folder.mkdir(exist_ok=True)
    path=folder/(key+'.json')
    if path.exists():
        old=json.loads(path.read_text())
        if old!=candidate:raise ConfigurationError('CANDIDATE_CHANGED_REVIEW_REQUIRED')
    else:path.write_text(json.dumps(candidate,ensure_ascii=False))
    return {'status':'PREPARED','job_id':key,'candidate':str(path),
            'amount':receipt['amount'],'date':receipt['date'],'time':receipt['time'][:5],
            'account_label':receipt['account_label'],'payment_created':False}
