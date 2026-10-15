"""Owner-authorized new-receipt policies; run as root after verified Cloud SQL backup."""
import argparse
import json
import os
import shutil
from datetime import datetime,timezone
from pathlib import Path
from mw_integration_agent.config import validate_config
from mw_integration_agent.instagram import Instagram
from mw_integration_agent.receipt_master import masters
from mw_integration_agent.receipt_rules import username

p=argparse.ArgumentParser()
p.add_argument('--actor-username',required=True)
p.add_argument('--forwarder-username',required=True)
p.add_argument('--group-account-username',required=True)
p.add_argument('--verified-backup-id',required=True)
a=p.parse_args()
if os.geteuid()!=0 or os.uname().nodename!='vm-mw-credit-agent':raise SystemExit('Wrong execution target')
path=Path('/etc/mw-integration-agent/config.json');c=json.loads(path.read_text())
master=masters(c)
def partner(name):
    matches=[p for p in master['partners'] if username(p['username'])==username(name)]
    if len(matches)!=1:raise SystemExit('Partner identity ambiguous')
    return matches[0]['id']
actor=partner(a.actor_username);forwarder=partner(a.forwarder_username)
if actor==forwarder:raise SystemExit('Actor and forwarder must be distinct')
account=Instagram(c).request(c['instagram_account_id'],{'fields':'username'})
if username(account.get('username'))!=username(a.group_account_username):raise SystemExit('Wrong Instagram account')
now=datetime.now(timezone.utc)
backup=Path('/var/lib/mw-integration-agent/rollback')/('receipt-automation-'+now.strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700,parents=True,exist_ok=False)
shutil.copy2(path,backup/'config.json')
c.update(receipt_auto_payment_enabled=True,receipt_auto_actor_partner_id=actor,
         receipt_forwarding_enabled=True,receipt_forwarder_partner_id=forwarder,
         receipt_group_account_username=username(a.group_account_username),
         receipt_automation_backup_id=a.verified_backup_id)
c.setdefault('receipt_auto_payment_cutoff',now.isoformat())
c.setdefault('receipt_forwarding_cutoff',now.isoformat())
validate_config(c)
# Atomic replace, preserving existing private file ownership/mode.
temporary=path.with_name('config.receipt-automation.tmp');metadata=path.stat()
temporary.write_text(json.dumps(c,indent=2)+'\n')
os.chmod(temporary,metadata.st_mode & 0o777);os.chown(temporary,metadata.st_uid,metadata.st_gid)
os.replace(temporary,path)
print(json.dumps({'automatic_payment':True,'forwarding':True,'cutoff':c['receipt_auto_payment_cutoff'],
                  'configuration_backup':str(backup)}))
