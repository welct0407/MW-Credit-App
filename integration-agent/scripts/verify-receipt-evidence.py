"""Read-only post-deployment receipt checks. Emits configuration keys/counts, no records/secrets."""
import importlib.util,json,os,subprocess
from pathlib import Path
assert os.geteuid()==0 and os.uname().nodename=='vm-mw-credit-agent'
root=Path('/etc/mw-integration-agent')
c=json.loads((root/'config.json').read_text())
backup=Path(Path('/var/lib/mw-integration-agent/rollback/receipt-evidence-current').read_text())
old=json.loads((backup/'config.json').read_text())
changed=sorted(k for k in set(c)|set(old) if c.get(k)!=old.get(k))
allowed={'code_version','receipt_archive_enabled','receipt_archive_cutoff','receipt_environment','receipt_bucket','receipt_spool_limit_bytes','receipt_projector_password_file'}
assert set(changed)<=allowed and c['receipt_archive_enabled'] and c['receipt_environment']=='prod'
catalogue=json.loads((root/'service-catalogue.json').read_text());previous=json.loads((backup/'service-catalogue.json').read_text())
assert catalogue['services']['receipt_evidence']=={'enabled':True,'implemented':True}
assert {k:v for k,v in catalogue['services'].items() if k!='receipt_evidence'}=={k:v for k,v in previous['services'].items() if k!='receipt_evidence'}
units=['mw-conversation-poll','mw-receipt-summary','mw-cash-statement','mw-cash-statement-email-retry','mw-partner-conversation','mw-audit-relay','mw-resource-health']
states={}
for unit in units:
 states[unit]={}
 for suffix in ['timer','service']:
  raw=subprocess.check_output(['systemctl','show',unit+'.'+suffix,'--property=ActiveState,SubState,Result,ExecMainStatus'],text=True)
  states[unit][suffix]=dict(line.split('=',1) for line in raw.splitlines() if '=' in line)
assert all(states[u]['timer']['ActiveState']=='active' for u in units)
assert all(states[u]['service'].get('Result')=='success' and states[u]['service'].get('ExecMainStatus')=='0' for u in units)
python='/opt/mw-integration-agent/.venv/bin/python'
installed=Path(subprocess.check_output([python,'-c','import mw_integration_agent; print(next(iter(mw_integration_agent.__path__)))'],text=True).strip())
source=Path('/opt/mw-integration-agent-src/integration-agent/src/mw_integration_agent')
spec=importlib.util.spec_from_file_location('engine',Path(__file__).with_name('deploy-shared-receipt-api.py'))
engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
files=engine.pyfiles(source);assert files
assert engine.compare_tree(source,installed)==([],[],[]),'Installed code differs from source'
secret=root/'secrets/receipt-projector-password.txt';assert secret.stat().st_mode & 0o777==0o640
probe=r'''
import json,psycopg
from pathlib import Path
c=json.loads(Path('/etc/mw-integration-agent/config.json').read_text())
assert c['database_host'] in ('127.0.0.1','::1') and c['database_port']==5432 and c['database_name']=='loan_manager_prod'
with psycopg.connect(host=c['database_host'],port=5432,dbname=c['database_name'],user='mw_receipt_projector',password=Path(c['receipt_projector_password_file']).read_text().strip(),connect_timeout=10) as db:
 db.execute('BEGIN READ ONLY')
 row=db.execute("SELECT current_database(),session_user,has_table_privilege(current_user,'public.\"Payments\"','UPDATE'),has_function_privilege(current_user,'public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)','EXECUTE')").fetchone()
 assert row==('loan_manager_prod','mw_receipt_projector',False,True)
print(json.dumps({'database':row[0],'role':row[1],'direct_update':row[2],'execute':row[3]}))
'''
projector=json.loads(subprocess.check_output(['sudo','-u','mwagent',python,'-c',probe],text=True))
print(json.dumps({'code_version':c['code_version'],'archive_cutoff':c['receipt_archive_cutoff'],'changed_config_keys':changed,'other_services_unchanged':True,'installed_python_files_verified':len(files),'credential_mode':'0640','projector_connectivity':projector,'units':states,'rollback':json.loads((backup/'deployment.json').read_text())},indent=2))
