#!/usr/bin/env python3
"""Signed loopback capture test, explicitly older than cutoff: never a business event."""
import hashlib
import hmac
import json
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from mw_integration_agent.config import load_json,load_secret

c=load_json('/etc/mw-integration-agent/config.json')
cutoff=datetime.fromisoformat(c['receipt_activation_cutoff']).timestamp()
assert 0<time.time()-cutoff<82800,'Run only during initial activation verification'
mid='SYNTHETIC-PRE-CUTOFF-RECEIPT-INGRESS-CHECK'
payload={'object':'instagram','entry':[{'id':c['instagram_account_id'],'messaging':[
    {'sender':{'id':'999000999000'},'recipient':{'id':c['instagram_account_id']},
     'timestamp':int((cutoff-1)*1000),'message':{'mid':mid,'text':'Synthetic pre-cutoff capture verification',
     'attachments':[{'type':'image','payload':{'url':'https://scontent.fbcdn.net/synthetic-unused.png'}}]}}]}]}
raw=json.dumps(payload).encode()
signature='sha256='+hmac.new(load_secret(c,'meta_app_secret_file').encode(),raw,hashlib.sha256).hexdigest()
def post(sig):
    req=urllib.request.Request('http://127.0.0.1:8000/instagram',data=raw,
        headers={'Content-Type':'application/json','X-Hub-Signature-256':sig})
    with urllib.request.urlopen(req,timeout=10) as response:
        assert response.status==200
try:
    post('sha256='+'0'*64)
except urllib.error.HTTPError as exc:
    assert exc.code==403
else:
    raise AssertionError('Invalid signature accepted')
post(signature);post(signature)
db=sqlite3.connect(Path(c['state_directory'])/'instagram-ingress.db')
rows=db.execute('SELECT attachments,event_timestamp FROM messages WHERE message_id=?',(mid,)).fetchall()
assert len(rows)==1 and len(json.loads(rows[0][0]))==1 and rows[0][1]<cutoff
db.close()
print(json.dumps({'status':'passed','invalid_signature_rejected':True,'duplicate_capture_count':1,
                  'image_reference_retained':True,'before_activation_cutoff':True,'business_effects':False}))
