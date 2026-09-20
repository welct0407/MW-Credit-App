#!/usr/bin/env python3
"""Activate the owner's receipt-summary scope after installation and synthetic proof."""
import json
import os
import subprocess
import sqlite3
from datetime import datetime,timezone
from pathlib import Path

from mw_integration_agent.config import validate_config,validate_catalogue
from mw_integration_agent.receipt_master import masters
from mw_integration_agent.receipt_rules import recipients

if os.geteuid()!=0:
    raise SystemExit('Run as root')
path=Path('/etc/mw-integration-agent/config.json')
config=json.loads(path.read_text())
if config.get('receipt_summary_enabled'):
    raise SystemExit('Already activated; do not move the cutoff or replay the inbox')
proof=Path(config['state_directory'])/'receipt-synthetic-proof.json'
value=json.loads(proof.read_text())
if value.get('status')!='passed':
    raise SystemExit('Synthetic extraction proof required')
auth=subprocess.run(['sudo','-u','mwagent','-H','env','CODEX_HOME='+config['codex_home'],
                     config['codex_executable'],'login','status'],capture_output=True,text=True)
if auth.returncode!=0:
    raise SystemExit('Codex sign-in required')
validate_catalogue(json.loads(Path('/etc/mw-integration-agent/service-catalogue.json').read_text()))
data=masters(config)
recipients(data['partners'])
with sqlite3.connect(f"file:{Path(config['state_directory'])/'instagram-ingress.db'}?mode=ro",uri=True) as db:
    if 'attachments' not in {r[1] for r in db.execute('PRAGMA table_info(messages)')}:
        raise SystemExit('Install the ingress attachment migration before activation')
config['receipt_summary_enabled']=True
config['receipt_activation_cutoff']=datetime.now(timezone.utc).isoformat()
validate_config(config)
backup=path.with_name('config.before-receipt-activation.json')
if backup.exists():
    raise SystemExit('Activation backup exists; inspect prior activation before proceeding')
backup.write_bytes(path.read_bytes());backup.chmod(0o600)
temporary=path.with_name('config.receipt-new.json')
temporary.write_text(json.dumps(config,indent=2)+'\n')
stat=path.stat();os.chown(temporary,stat.st_uid,stat.st_gid);temporary.chmod(0o640)
temporary.replace(path)
subprocess.run(['systemctl','enable','--now','mw-receipt-summary.timer'],check=True)
print(json.dumps({'status':'activated','cutoff':config['receipt_activation_cutoff'],
                  'mode':'partner_email_summary_only','payment_writes':False}))
