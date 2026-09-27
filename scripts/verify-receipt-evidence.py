"""Read-only post-deployment receipt checks. Emits configuration keys/counts, no records/secrets."""
import hashlib,json,os,subprocess
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
source=Path('/opt/mw-integration-agent-src/src/mw_integration_agent')
files=list(source.rglob('*.py'))
assert all(hashlib.sha256(f.read_bytes()).digest()==hashlib.sha256((installed/f.relative_to(source)).read_bytes()).digest() for f in files)
secret=root/'secrets/receipt-projector-password.txt';assert secret.stat().st_mode & 0o777==0o640
print(json.dumps({'code_version':c['code_version'],'archive_cutoff':c['receipt_archive_cutoff'],'changed_config_keys':changed,'other_services_unchanged':True,'installed_python_files_verified':len(files),'credential_mode':'0640','units':states,'rollback':json.loads((backup/'deployment.json').read_text())},indent=2))
