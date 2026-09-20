"""Explicit owner/operator command; temporarily enable sending, always restore off."""
import json
import argparse
import os
import signal
import subprocess
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--date')
parser.add_argument('--review-thai',action='store_true')
args=parser.parse_args()
extra=(['--date',args.date] if args.date else [])+(['--review-thai'] if args.review_thai else [])

if os.geteuid()!=0:
    raise SystemExit('Run as root for the explicitly authorized manual delivery')
path=Path('/etc/mw-integration-agent/config.json')
original=json.loads(path.read_text())
if original['sending_enabled'] is not False:
    raise SystemExit('Expected sending disabled before manual run')

def set_sending(value):
    current=json.loads(path.read_text())
    current['sending_enabled']=value
    # Preserve existing protected file ownership/mode and all other current settings.
    path.write_text(json.dumps(current,indent=2)+'\n')

def interrupt(signum,frame):
    raise KeyboardInterrupt

signal.signal(signal.SIGTERM,interrupt)
signal.signal(signal.SIGINT,interrupt)
try:
    set_sending(True)
    result=subprocess.run(['sudo','-u','mwagent','/opt/mw-integration-agent/.venv/bin/mw-integration-agent',
        'cash-statement','--config',str(path),'--catalogue','/etc/mw-integration-agent/service-catalogue.json','--send']+extra)
finally:
    set_sending(False)
    print('Manual run finished; sending_enabled restored to false')
raise SystemExit(result.returncode)
