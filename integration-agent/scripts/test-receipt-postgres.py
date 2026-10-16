"""Disposable loopback integration test; never accepts a live database endpoint."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import time
import uuid
from unittest.mock import patch

import psycopg
from PIL import Image
from mw_integration_agent import state
from mw_integration_agent.receipt_archive import Archive, source
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.state_migration import migrate

p=argparse.ArgumentParser();p.add_argument('--port',type=int,required=True);p.add_argument('--root',required=True);a=p.parse_args()
root=Path(a.root).resolve()
assert a.port!=5432 and root.name.startswith('receipt-evidence-lab-')
admin=dict(host='127.0.0.1',port=a.port,user='postgres')
with psycopg.connect(**admin,dbname='postgres',autocommit=True) as c:
    for role in ('owner','worker','relay','auditor'):
        c.execute('CREATE ROLE mw_agent_'+role+' LOGIN')
    c.execute('CREATE DATABASE mw_agent OWNER mw_agent_owner')
generation=str(uuid.uuid4())
with psycopg.connect(**admin,dbname='mw_agent',autocommit=True) as c:
    first=migrate(c,Path(__file__).resolve().parents[1]/'database/migrations')
    assert len(first['applied'])==4
    assert not migrate(c,Path(__file__).resolve().parents[1]/'database/migrations')['applied']
    c.execute("INSERT INTO runtime.service_control(service_name,backend,active_generation,processing_enabled) VALUES ('agent','postgres',%s,true)",(generation,))
config=dict(state_directory=str(root/'state'),state_backend='postgres',state_generation=generation,
    agent_database_host='127.0.0.1',agent_database_port=a.port,agent_database_name='mw_agent',audit_environment='test',
    receipt_environment='dev',receipt_bucket='mw-payment-receipts-prod-508610-n7',instagram_account_id='123',code_version='synthetic')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tests'))
from test_receipt_archive import Storage  # noqa: E402  (test fixture resolved through the path above)
with patch.object(state,'parameters',side_effect=lambda config,role='worker':dict(admin,dbname='mw_agent',user='mw_agent_'+role,autocommit=True)):
    journal=ReceiptJournal(root/'receipt-processing.db',config=config)
    key=hashlib.sha256(b'postgres-synthetic:0').hexdigest()
    job=dict(id=key,message_id='postgres-synthetic',sender_id='456',url='https://x.fbcdn.net/image',created_at=time.time(),
        source=source('webhook','postgres-synthetic',0,'456',time.time()-1,time.time()))
    with journal.db:
        journal.db.execute('INSERT INTO receipt_jobs(id,message_id,sender_id,url,created_at,source) VALUES (?,?,?,?,?,?)',tuple(job.values()))
    output=io.BytesIO();Image.new('RGB',(12,8),'blue').save(output,format='PNG')
    archive=Archive(config,journal,Storage());archive.capture(job,lambda _:output.getvalue())
    asset=archive.get(key);assert asset['archive_state']=='ARCHIVED'
    for query,params in [
        ('UPDATE receipt_assets SET source=? WHERE receipt_id=?',('{}',asset['receipt_id'])),
        ('UPDATE receipt_assets SET generation=? WHERE receipt_id=?',('999',asset['receipt_id'])),
        ('UPDATE receipt_jobs SET source=? WHERE id=?',('{}',key))]:
        try:
            with journal.db:journal.db.execute(query,params)
        except psycopg.errors.RaiseException:pass
        else:raise AssertionError('immutable identity changed')
    journal.mark(key,'IGNORED','SYNTHETIC_NONRECEIPT')
    assert archive.get(key)['archive_state']=='ARCHIVED'
    with journal.db:
        journal.db.execute('INSERT INTO receipt_payment_links(link_id,receipt_id,business_environment,payment_id,verification,verification_digest,verified_at) VALUES (?,?,?,?,?,?,?)',
          (str(uuid.uuid4()),asset['receipt_id'],'dev','synthetic-payment','{}','a'*64,time.time()))
    journal.close()
with psycopg.connect(**admin,dbname='mw_agent') as c:
    assert c.execute('SELECT count(*) FROM audit.events').fetchone()[0]>0
    assert c.execute('SELECT count(*) FROM runtime.receipt_payment_links').fetchone()[0]==1
print(json.dumps({'central_migrations':4,'second_migrate':'no-op','postgres_capture':'passed','immutable_source_locator':'passed','state_audit':'passed','terminal_original_retained':'passed'}))
