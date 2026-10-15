#!/bin/sh
# Owner-authorized reviewer DML activation; no business writes or history replay.
set -eu
test "$(id -u)" -eq 0
if systemctl is-active --quiet mw-partner-conversation.timer || systemctl is-active --quiet mw-partner-conversation.service; then
 echo 'Stop the conversation timer and let the worker finish before activation' >&2
 exit 1
fi
backup=/var/lib/mw-integration-agent/rollback/reviewer-dml-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 0700 "$backup"
cp -a /etc/mw-integration-agent/config.json /etc/mw-integration-agent/service-catalogue.json "$backup/"
/opt/mw-integration-agent/.venv/bin/python - <<'PY'
import json
from datetime import datetime,timezone
from pathlib import Path
from mw_integration_agent.config import validate_config,validate_catalogue
from mw_integration_agent.conversation_dml import connect,TABLES
p=Path('/etc/mw-integration-agent/config.json')
c=json.loads(p.read_text())
if c.get('reviewer_dml_enabled'):raise SystemExit('Already active; do not reset the cutoff')
manifest=json.loads(Path('/etc/mw-integration-agent/service-catalogue.json').read_text())
validate_catalogue(manifest)
assert manifest['services']['reviewer_database_dml']['enabled']
c.update(reviewer_dml_enabled=True,reviewer_dml_cutoff=datetime.now(timezone.utc).isoformat(),
         database_dml_user='mw_reviewer_dml',
         database_dml_password_file='/etc/mw-integration-agent/secrets/reviewer-dml-password.txt')
validate_config(c)
with connect(c) as conn:
    identity=conn.execute('SELECT current_database() AS db,current_user AS role').fetchone()
    assert identity=={'db':'loan_manager_prod','role':'mw_reviewer_dml'}
    for table in TABLES:
        row=conn.execute("SELECT has_table_privilege(current_user,format('public.%%I',%s::text),'INSERT') AS i, has_table_privilege(current_user,format('public.%%I',%s::text),'UPDATE') AS u",(table,table)).fetchone()
        assert row['i'] and row['u']
    denied=conn.execute("SELECT has_schema_privilege(current_user,'public','CREATE') AS schema_create, has_database_privilege(current_user,current_database(),'CREATE') AS db_create, has_column_privilege(current_user,'public.\"Partners\"','AI Reviewer','UPDATE') AS self_grant").fetchone()
    assert not any(denied.values())
    assert conn.execute('SHOW transaction_read_only').fetchone()['transaction_read_only']=='on'
candidate=p.with_suffix('.json.reviewer-new')
candidate.write_text(json.dumps(c,indent=2)+'\n');candidate.chmod(0o640)
print(json.dumps({'connection':identity,'tables':len(TABLES),'schema_create':False,'reviewer_self_grant':False,'cutoff':c['reviewer_dml_cutoff']}))
PY
chown root:mwagent /etc/mw-integration-agent/config.json.reviewer-new
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent check --config /etc/mw-integration-agent/config.json.reviewer-new --catalogue /etc/mw-integration-agent/service-catalogue.json
mv /etc/mw-integration-agent/config.json.reviewer-new /etc/mw-integration-agent/config.json
systemctl start mw-partner-conversation.timer
echo "Reviewer DML active; config rollback: $backup"
