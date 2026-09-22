"""Synthetic import/restore rehearsal; refuses any non-disposable server."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import tempfile
import time
import uuid
import psycopg

from mw_integration_agent import audit
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.conversation_store import ConversationStore
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.statement_delivery import DeliveryJournal
from mw_integration_agent.conversation_dml import journal as dml_journal
from mw_integration_agent.conversation_write import journal as api_journal
from mw_integration_agent.state_migration import backup_journals, import_journals, migrate

p=argparse.ArgumentParser();p.add_argument('--lab-manifest',required=True);p.add_argument('--output',required=True);a=p.parse_args()
lab=json.loads(Path(a.lab_manifest).read_text(encoding='utf-8-sig'))
if lab['host']!='127.0.0.1' or lab['port']==5432 or 'agent-state-lab-' not in lab['root']:raise RuntimeError('Not an isolated lab')
kwargs=dict(host=lab['host'],port=lab['port'],user='postgres',dbname='mw_agent',autocommit=True)
root=Path(tempfile.mkdtemp(prefix='import-rehearsal-',dir=lab['root']))
source=root/'source';source.mkdir()
generation=str(uuid.uuid4())
config={'state_generation':generation,'audit_environment':'test','code_version':'migration-rehearsal',
        'receipt_activation_cutoff':'2026-01-01T00:00:00+00:00'}
ingress=IngressJournal(source/'instagram-ingress.db')
ingress.capture('synthetic-payload',[{'message_id':'synthetic-message','sender_id':'synthetic-sender','timestamp':time.time(),'text':'ภาษาไทย',
                                    'attachments':[{'url':'https://example.invalid/synthetic'}]}]);ingress.close()
receipt=ReceiptJournal(source/'receipt-processing.db')
ReviewStore(receipt.db)
receipt.db.executescript('''CREATE TABLE conversation_poll_state(conversation_id TEXT PRIMARY KEY,checked_through REAL NOT NULL);
CREATE TABLE conversation_poll_messages(message_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,event_time REAL NOT NULL,captured_at REAL NOT NULL,outcome TEXT NOT NULL);
CREATE TABLE receipt_reconsiderations(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL);''')
with receipt.db:
 receipt.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,image,created_at) VALUES (?,?,?,?,?,?)",('synthetic-job','synthetic-message','synthetic-sender','',b'\x00\xff\x01',0.123456789012345))
 receipt.db.execute('INSERT INTO receipt_reconsiderations VALUES (?,?,?,?)',(42,'synthetic-job',0.125,' { "original": "ไทย" } '))
receipt.close()
store=ConversationStore(source/'partner-conversations.db');store.bind('synthetic-binding','synthetic-thread')
bridge=type('Bridge',(),{'store':store})();dml_journal(bridge);api_journal(bridge)
store.reserve({'message_id':'synthetic-turn','sender_id':'synthetic-sender'},'synthetic-binding',{'language':'ไทย'})
store.close()
for name,text in [('partner-notices.db','receipt'),('conversation-notices.db','conversation')]:
 notices=NoticeJournal(source/name);notices.reserve('same-event',{'id':'synthetic-partner'},text,'body '+text);notices.close()
DeliveryJournal(source/'cash-statement-delivery.db').close()
backup=root/'backup';backup_journals(source,backup)
batch=uuid.uuid4()
with psycopg.connect(**kwargs) as conn:
 assert Path(conn.execute('SHOW data_directory').fetchone()[0]).resolve()==(Path(lab['root'])/'data').resolve()
 with conn.transaction():result=import_journals(conn,backup,config,batch,'synthetic-source')
 assert result['rows']>=8
 assert conn.execute("SELECT image FROM runtime.receipt_jobs WHERE id='synthetic-job'").fetchone()[0]==b'\x00\xff\x01'
 assert conn.execute("SELECT thread_id FROM runtime.conversations WHERE binding='synthetic-binding'").fetchone()[0]=='synthetic-thread'
 assert conn.execute("SELECT status FROM runtime.conversation_turns WHERE message_id='synthetic-turn'").fetchone()[0]=='RUNNING'
 assert conn.execute("SELECT state FROM runtime.ingress_work WHERE message_id='synthetic-message'").fetchone()[0]=='PENDING'
 with conn.transaction():
  seq=conn.execute("INSERT INTO runtime.receipt_reconsiderations(job_id,created_at,previous) VALUES ('synthetic-job',0,'{}') RETURNING id").fetchone()[0]
 assert seq>42
 try:
  with conn.transaction():import_journals(conn,backup,config,batch,'synthetic-source')
 except ConfigurationError as exc:assert 'ALREADY_EXISTS' in str(exc)
 else:raise AssertionError('Repeated import was allowed')
 # The schema runner rejects changed bytes before running a second version.
 copies=root/'migrations';shutil.copytree(Path(__file__).resolve().parents[1]/'database/migrations',copies)
 first=copies/'V1__audit_and_control.sql';first.write_text(first.read_text(encoding='utf-8')+'\n-- synthetic tampering\n',encoding='utf-8')
 try:migrate(conn,copies)
 except ConfigurationError as exc:assert 'CHECKSUM' in str(exc)
 else:raise AssertionError('Changed migration accepted')
result.update(status='passed',synthetic_only=True,repeat_import_rejected=True,checksum_tampering_rejected=True,
              binary_text_epoch_memory_preserved=True,identity_advanced=True)
Path(a.output).parent.mkdir(parents=True,exist_ok=True)
Path(a.output).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'passed','rows':result['rows'],'table_instances':len(result['tables'])}))
