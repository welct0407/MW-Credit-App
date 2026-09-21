#!/bin/sh
# Owner-requested conversation rollout; call after reviewed runtime backup/update.
set -eu
test "$(id -u)" -eq 0
test -n "${1:-}"
test -d "$1"
repo=/opt/mw-integration-agent-src
cp -a /etc/mw-integration-agent/config.json "$1/config.before-conversations.json"
install -o root -g root -m 0644 "$repo/systemd/mw-partner-conversation.service" /etc/systemd/system/
install -o root -g root -m 0644 "$repo/systemd/mw-partner-conversation.timer" /etc/systemd/system/
/opt/mw-integration-agent/.venv/bin/python - "$1" <<'PY'
import json,sys
import hashlib
from pathlib import Path
from datetime import datetime,timezone
from mw_integration_agent.config import validate_config,validate_catalogue
p=Path('/etc/mw-integration-agent/config.json')
c=json.loads(p.read_text())
if not c.get('partner_conversation_cutoff'):
 c['partner_conversation_cutoff']=datetime.now(timezone.utc).isoformat()
c['partner_conversations_enabled']=True
c['conversation_writes_enabled']=True
c['conversation_timeout_seconds']=600
c['conversation_schema_file']='/etc/mw-integration-agent/appsheet-schema.json'
c['conversation_schema_sha256']=hashlib.sha256(Path(c['conversation_schema_file']).read_bytes()).hexdigest()
c['partner_conversation_backup']=sys.argv[1]
validate_config(c)
validate_catalogue(json.loads(Path('/etc/mw-integration-agent/service-catalogue.json').read_text()))
p.write_text(json.dumps(c,indent=2)+'\n')
PY
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent check --config /etc/mw-integration-agent/config.json --catalogue /etc/mw-integration-agent/service-catalogue.json
systemctl daemon-reload
systemctl enable --now mw-partner-conversation.timer
systemctl is-active mw-partner-conversation.timer
