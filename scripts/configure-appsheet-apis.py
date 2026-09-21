"""Configure the two owner-authorized production API connections without printing secrets."""
import argparse
import json
import os
import shutil
import stat
import grp
from datetime import datetime, timezone
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--olap-key-file', required=True)
args=p.parse_args()
if os.geteuid()!=0: raise SystemExit('Run as root')
config_path=Path('/etc/mw-integration-agent/config.json')
c=json.loads(config_path.read_text())
assert c['appsheet_app_id']=='93844270-6aa5-420b-a960-bcdf08abd357'
assert c['database_name']=='loan_manager_prod'
key_path=Path(args.olap_key_file).resolve()
key=key_path.read_text().strip()
assert key.startswith('V2-') and len(key)>20 and not any(v.isspace() for v in key)
backup=Path('/var/lib/mw-integration-agent/rollback')/('api-connections-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700,parents=True)
shutil.copy2(config_path,backup/'config.json')
destination=Path(c['secrets_directory'])/'appsheet-olap-key.txt'
if destination.exists() and destination.read_text().strip()!=key:
    raise SystemExit('Existing OLAP credential differs; do not overwrite')
destination.write_text(key)
os.chmod(destination,0o640);os.chown(destination,0,grp.getgrnam('mwagent').gr_gid)
c['appsheet_olap_app_id']='e74dd368-654f-44d7-bccf-83cf361d1cdb'
c['appsheet_olap_key_file']=str(destination)
temp=config_path.with_suffix('.pending')
temp.write_text(json.dumps(c,indent=2)+'\n')
os.chmod(temp,stat.S_IMODE(config_path.stat().st_mode));os.chown(temp,config_path.stat().st_uid,config_path.stat().st_gid)
temp.replace(config_path)
if key_path!=destination: key_path.unlink()
print(json.dumps({'configured':['oltp','olap'],'backup':str(backup),'writes_enabled':c['writes_enabled']}))
