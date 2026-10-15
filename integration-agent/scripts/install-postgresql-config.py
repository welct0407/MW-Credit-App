"""Root-only post-import Debian configuration; does not activate or resume work."""
import json,os,subprocess
from pathlib import Path
from mw_integration_agent.config import validate_config,validate_catalogue

if os.geteuid()!=0 or os.uname().nodename!='vm-mw-credit-agent':raise SystemExit('Wrong operator/VM')
private=Path('/home/MWCredit/r015-private')
cutover=json.loads((private/'cutover.json').read_text())
path=Path('/etc/mw-integration-agent/config.json')
config=json.loads(path.read_text())
if config.get('state_backend','sqlite')!='sqlite':raise SystemExit('Backend already changed; inspect before retry')
if config['receipt_activation_cutoff']!=cutover['receipt_activation_cutoff']:raise SystemExit('Source cutoff drift')
for role in ('worker','relay'):
    destination='/etc/mw-integration-agent/secrets/agent-'+role+'-password.txt'
    subprocess.run(['install','-o','root','-g','mwagent','-m','0640',str(private/('mw_agent_'+role+'.password')),destination],check=True)
    config['agent_database_'+role+'_password_file']=destination
config.update({k:cutover[k] for k in ('state_backend','state_generation','state_cutover_at','code_version','audit_environment')})
config.update(agent_database_host='127.0.0.1',agent_database_port=5432,agent_database_name='mw_agent',reviewer_delete_enabled=True)
validate_config(config)
catalogue=Path('/opt/mw-integration-agent-src/service-catalogue.json')
validate_catalogue(json.loads(catalogue.read_text()))
temp=path.with_suffix('.postgresql-ready.json')
temp.write_text(json.dumps(config,indent=2)+'\n');os.chmod(temp,0o640)
subprocess.run(['chown','root:mwagent',str(temp)],check=True)
os.replace(temp,path)
subprocess.run(['install','-o','root','-g','mwagent','-m','0640',str(catalogue),'/etc/mw-integration-agent/service-catalogue.json'],check=True)
for suffix in ('service','timer'):
    name='mw-audit-relay.'+suffix
    subprocess.run(['install','-o','root','-g','root','-m','0644','/opt/mw-integration-agent-src/systemd/'+name,'/etc/systemd/system/'+name],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
print(json.dumps({'config_valid':True,'backend':'postgres','generation':config['state_generation'],'processing_resumed':False}))
